import { Router } from "express";
import { z } from "zod";
import { listCaptures, getCapture } from "../../store.js";
import { uploadCapture } from "../../fhir/client.js";
import { issueStepUpToken, verifyStepUpToken } from "../../siths.js";
import { audit } from "../../audit.js";
import { logger } from "../../logger.js";
import type { CaptureListItem } from "../../types.js";

export const capturesRouter = Router();

// GET /captures — list with optional filters
capturesRouter.get("/", (req, res) => {
  const patientId = typeof req.query["patient_id"] === "string"
    ? req.query["patient_id"]
    : undefined;
  const status = typeof req.query["status"] === "string"
    ? req.query["status"]
    : undefined;
  const limit = req.query["limit"] ? parseInt(req.query["limit"] as string) : 50;
  const offset = req.query["offset"] ? parseInt(req.query["offset"] as string) : 0;

  const captures = listCaptures({ patientId, status: status as never, limit, offset });

  const items: CaptureListItem[] = captures.map((c) => ({
    id: c.id,
    patientId: c.patientId,
    patientName: c.patientName,
    bodySite: c.bodySite,
    clinicalContext: c.clinicalContext,
    capturedAt: c.capturedAt,
    emrStatus: c.emrStatus,
    senderHsaId: c.senderHsaId,
  }));

  res.json({ captures: items, count: items.length });
});

// GET /captures/:id — single capture detail
capturesRouter.get("/:id", (req, res) => {
  const capture = getCapture(req.params["id"]!);
  if (!capture) {
    res.status(404).json({ error: "Not found" });
    return;
  }
  // Never include step-up token or mxcUri in the response
  const { stepUpToken, mxcUri, ...safe } = capture;
  void stepUpToken; void mxcUri;
  res.json(safe);
});

// POST /captures/:id/step-up — initiate SITHS step-up for this capture
capturesRouter.post("/:id/step-up", (req, res) => {
  const capture = getCapture(req.params["id"]!);
  if (!capture) {
    res.status(404).json({ error: "Not found" });
    return;
  }

  if (capture.emrStatus === "uploaded") {
    res.status(409).json({ error: "Already uploaded" });
    return;
  }

  const token = issueStepUpToken(capture.id, capture.patientId);

  // Return the token — the mobile client will present this to the SITHS RP QR/NFC flow
  res.json({
    stepUpToken: token.token,
    expiresAt: token.expiresAt,
    // Deep-link that the mobile app opens to trigger SITHS NFC card read
    sithsDeepLink: `aether-capture://step-up?token=${token.token}&capture=${capture.id}`,
  });
});

// POST /captures/:id/verify-step-up — called by SITHS RP callback after card read
const VerifySchema = z.object({
  stepUpToken: z.string().min(1),
});

capturesRouter.post("/:id/verify-step-up", async (req, res) => {
  const parsed = VerifySchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid body", issues: parsed.error.issues });
    return;
  }

  const capture = getCapture(req.params["id"]!);
  if (!capture) {
    res.status(404).json({ error: "Not found" });
    return;
  }

  const result = await verifyStepUpToken(
    parsed.data.stepUpToken,
    capture.id,
    capture.patientId
  );

  if (!result.valid) {
    res.status(401).json({ error: result.reason ?? "Verification failed" });
    return;
  }

  res.json({ verified: true, hsaId: result.hsaId, displayName: result.displayName });
});

// POST /captures/:id/upload — trigger EMR upload (requires prior step-up verification)
const UploadSchema = z.object({
  hsaId: z.string().min(1),
});

capturesRouter.post("/:id/upload", async (req, res) => {
  const parsed = UploadSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid body", issues: parsed.error.issues });
    return;
  }

  const capture = getCapture(req.params["id"]!);
  if (!capture) {
    res.status(404).json({ error: "Not found" });
    return;
  }

  if (capture.emrStatus === "uploaded") {
    res.status(409).json({ error: "Already uploaded" });
    return;
  }

  if (!capture.stepUpVerifiedAt) {
    res.status(403).json({ error: "SITHS step-up authentication required before upload" });
    return;
  }

  // Step-up verification must be recent (within TTL)
  const verifiedAt = new Date(capture.stepUpVerifiedAt).getTime();
  if (Date.now() - verifiedAt > 15 * 60 * 1000) {
    res.status(403).json({ error: "Step-up session expired — please re-authenticate" });
    return;
  }

  audit({
    captureId: capture.id,
    action: "api_request",
    actor: parsed.data.hsaId,
    patientId: capture.patientId,
    outcome: "pending",
    detail: `Upload requested via API`,
  });

  try {
    await uploadCapture(capture.id, parsed.data.hsaId);
    const updated = getCapture(capture.id);
    res.json({ status: "uploaded", emrDocumentId: updated?.emrDocumentId });
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    logger.error("Upload API error", { captureId: capture.id, reason });
    res.status(500).json({ error: "Upload failed", reason });
  }
});
