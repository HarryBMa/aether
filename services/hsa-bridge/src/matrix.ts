import { Router } from "express";
import { searchPractitioners, getPractitioner, getPractitionerByMatrixId } from "./ldap.js";
import { config } from "./config.js";
import { logger } from "./logger.js";

export const matrixRouter = Router();

// ── Matrix Identity Server v2 API ─────────────────────────────────────────────
// Implements enough of the spec for user lookup and invite-by-MXID.
// Reference: https://spec.matrix.org/v1.9/identity-service-api/

// GET /_matrix/identity/v2 — server info
matrixRouter.get("/_matrix/identity/v2", (_req, res) => {
  res.json({});
});

// GET /_matrix/identity/v2/terms — no terms required for internal service
matrixRouter.get("/_matrix/identity/v2/terms", (_req, res) => {
  res.json({ policies: {} });
});

// POST /_matrix/identity/v2/terms (accept) — no-op
matrixRouter.post("/_matrix/identity/v2/terms", (_req, res) => {
  res.json({});
});

// GET /_matrix/identity/v2/lookup
// Parameters: address (HSA-ID or email), medium ("hsa_id" | "email")
// Returns the Matrix user ID if found.
matrixRouter.get("/_matrix/identity/v2/lookup", async (req, res) => {
  const { address, medium } = req.query;

  if (typeof address !== "string" || !address) {
    res.status(400).json({ errcode: "M_INVALID_PARAM", error: "Missing address" });
    return;
  }

  if (medium === "hsa_id" || (typeof address === "string" && /^SE/i.test(address))) {
    const person = await getPractitioner(address);
    if (!person) {
      res.status(404).json({ errcode: "M_NOT_FOUND", error: "HSA-ID not found" });
      return;
    }
    res.json({ mxid: person.matrixUserId });
    return;
  }

  res.status(400).json({
    errcode: "M_INVALID_PARAM",
    error: `Unsupported medium: ${String(medium)}. Use 'hsa_id'.`,
  });
});

// POST /_matrix/identity/v2/bulk_lookup
// Body: { threepids: [{ medium, address }] }
matrixRouter.post("/_matrix/identity/v2/bulk_lookup", async (req, res) => {
  const threepids = req.body?.threepids;
  if (!Array.isArray(threepids)) {
    res.status(400).json({ errcode: "M_INVALID_PARAM", error: "Invalid body" });
    return;
  }

  const threepid_mappings: string[][] = [];

  for (const tp of threepids) {
    if (tp?.medium === "hsa_id" && typeof tp?.address === "string") {
      const person = await getPractitioner(tp.address);
      if (person) {
        threepid_mappings.push([tp.medium, tp.address, person.matrixUserId]);
      }
    }
  }

  res.json({ threepid_mappings });
});

// ── Aether-specific extension endpoints ───────────────────────────────────────

// GET /hsa/search?q=...  — search practitioners by name
matrixRouter.get("/hsa/search", async (req, res) => {
  const q = req.query["q"];
  if (typeof q !== "string" || q.length < 2) {
    res.status(400).json({ error: "Query must be at least 2 characters" });
    return;
  }

  const persons = await searchPractitioners(q);

  res.json({
    results: persons.map((p) => ({
      hsa_id: p.hsaId,
      matrix_user_id: p.matrixUserId,
      display_name: p.displayName,
      title: p.title,
      specialty: p.specialty,
      organization: p.organization,
    })),
  });
});

// GET /hsa/person/:hsaId — single practitioner lookup
matrixRouter.get("/hsa/person/:hsaId", async (req, res) => {
  const person = await getPractitioner(req.params["hsaId"]!);
  if (!person) {
    res.status(404).json({ error: "Not found" });
    return;
  }
  res.json(person);
});

// GET /hsa/by-mxid/:mxid — reverse lookup from Matrix user ID
matrixRouter.get("/hsa/by-mxid/:mxid", async (req, res) => {
  const mxid = decodeURIComponent(req.params["mxid"]!);
  const person = await getPractitionerByMatrixId(mxid);
  if (!person) {
    res.status(404).json({ error: "Not found" });
    return;
  }
  res.json(person);
});

// GET /health
matrixRouter.get("/health", (_req, res) => {
  res.json({ status: "ok", domain: config.MATRIX_DOMAIN });
});
