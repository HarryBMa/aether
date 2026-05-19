import { Router, type Request } from "express";
import { z } from "zod";
import { parseSITHSCert, assertCertValid, CertificateError } from "./cert.js";
import { issueToken, verifyToken } from "./token.js";
import { logger } from "./logger.js";
import { config } from "./config.js";

export const router = Router();

// ── GET /health ───────────────────────────────────────────────────────────────

router.get("/health", (_req, res) => {
  res.json({ status: "ok", uptime: process.uptime() });
});

// ── POST /auth ─────────────────────────────────────────────────────────────────
// Called by the mobile app after an NFC SITHS card read.
// The client presents its SITHS certificate in the TLS handshake (mTLS).
// The RP extracts and validates the cert, then issues a step-up JWT.
//
// Body: { capture_id: string }
// Returns: { token: string, hsa_id: string, display_name: string, expires_at: string }

const AuthBody = z.object({
  capture_id: z.string().min(1),
});

router.post("/auth", async (req, res) => {
  const parsed = AuthBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid body", issues: parsed.error.issues });
    return;
  }

  let identity;
  try {
    identity = extractIdentity(req);
  } catch (err) {
    const msg = err instanceof CertificateError ? err.message : "Certificate error";
    logger.warn("SITHS auth rejected", { reason: msg, ip: req.ip });
    res.status(401).json({ error: msg });
    return;
  }

  const { capture_id } = parsed.data;

  const token = await issueToken({
    hsa_id: identity.hsaId,
    display_name: identity.displayName,
    capture_id,
    cert_fingerprint: identity.fingerprint,
  });

  const expiresAt = new Date(Date.now() + config.JWT_TTL_SEC * 1000).toISOString();

  logger.info("Step-up token issued", {
    hsaId: identity.hsaId,
    captureId: capture_id,
    org: identity.organization,
  });

  res.json({
    token,
    hsa_id: identity.hsaId,
    display_name: identity.displayName,
    organization: identity.organization,
    expires_at: expiresAt,
  });
});

// ── POST /verify ──────────────────────────────────────────────────────────────
// Called by the capture service to verify a step-up token.
// This is the endpoint at SITHS_VERIFY_URL/verify in the capture service config.
//
// Body: { token: string }
// Returns: { valid: bool, hsa_id?, display_name?, error? }

const VerifyBody = z.object({
  token: z.string().min(1),
});

router.post("/verify", async (req, res) => {
  // Require API key for service-to-service calls
  const apiKey = req.headers["x-api-key"];
  if (apiKey !== config.API_KEY) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  const parsed = VerifyBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid body" });
    return;
  }

  try {
    const claims = await verifyToken(parsed.data.token);
    res.json({
      valid: true,
      hsa_id: claims.hsa_id,
      display_name: claims.display_name,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Verification failed";
    logger.info("Token verification failed", { reason: msg });
    res.json({ valid: false, error: msg });
  }
});

// ── POST /whoami ──────────────────────────────────────────────────────────────
// Convenience endpoint — mobile app can call this after NFC card read
// to display the practitioner's name before proceeding with step-up.

router.post("/whoami", (req, res) => {
  let identity;
  try {
    identity = extractIdentity(req);
  } catch (err) {
    const msg = err instanceof CertificateError ? err.message : "Certificate error";
    res.status(401).json({ error: msg });
    return;
  }

  res.json({
    hsa_id: identity.hsaId,
    display_name: identity.displayName,
    organization: identity.organization,
    cert_valid_until: identity.notAfter.toISOString(),
  });
});

// ── helpers ───────────────────────────────────────────────────────────────────

function extractIdentity(req: Request) {
  if (!config.REQUIRE_CLIENT_CERT) {
    // Dev mode: accept a DER/PEM cert passed as a request header
    // (simulates what the TLS layer would normally inject)
    const devCert = req.headers["x-dev-siths-cert"];
    if (typeof devCert === "string") {
      const identity = parseSITHSCert(Buffer.from(devCert, "base64"));
      assertCertValid(identity);
      return identity;
    }
    // No cert in dev mode — return a mock identity for local development
    logger.warn("Dev mode: returning mock SITHS identity (no cert required)");
    return {
      hsaId: "SE2321000016-DEVID",
      displayName: "Dev Practitioner",
      organization: "Dev Hospital",
      rawSubject: "CN=Dev Practitioner,SERIALNUMBER=SE2321000016-DEVID,O=Dev Hospital,C=SE",
      notBefore: new Date(0),
      notAfter: new Date("2099-01-01"),
      fingerprint: "00:00:00:00",
    };
  }

  // Production: client certificate is injected by Node's TLS stack
  // (express sees it as req.socket.getPeerCertificate())
  const tlsSocket = req.socket as NodeJS.Socket & {
    getPeerCertificate?: (detailed?: boolean) => {
      raw?: Buffer;
      subject?: Record<string, string>;
    };
  };

  const peerCert = tlsSocket.getPeerCertificate?.(true);
  if (!peerCert?.raw) {
    throw new CertificateError("No client certificate presented");
  }

  const identity = parseSITHSCert(peerCert.raw);
  assertCertValid(identity);
  return identity;
}
