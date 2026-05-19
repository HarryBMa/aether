import fetch from "node-fetch";
import https from "https";
import fs from "fs";
import { config } from "./config.js";
import { logger } from "./logger.js";
import { audit } from "./audit.js";
import { updateStatus } from "./store.js";
import type { StepUpToken } from "./types.js";

// In-memory store for issued step-up tokens.
// These are short-lived (TTL configured) and never persisted — they expire
// with the process. The token value is an opaque random string; verification
// requires a round-trip to the SITHS RP service.
const pendingTokens = new Map<string, StepUpToken>();

export function issueStepUpToken(captureId: string, patientId: string): StepUpToken {
  // Invalidate any previous token for the same capture
  for (const [key, token] of pendingTokens.entries()) {
    if (token.captureId === captureId) {
      pendingTokens.delete(key);
    }
  }

  const token: StepUpToken = {
    token: generateToken(),
    hsaId: "",         // filled in after SITHS verification
    displayName: "",
    expiresAt: new Date(Date.now() + config.STEP_UP_TOKEN_TTL_MS).toISOString(),
    captureId,
  };

  pendingTokens.set(token.token, token);

  updateStatus(captureId, "awaiting_auth", { stepUpToken: token.token });

  audit({
    captureId,
    action: "step_up_requested",
    actor: "system",
    patientId,
    outcome: "pending",
    detail: `Step-up token issued, expires ${token.expiresAt}`,
  });

  logger.info("Step-up token issued", { captureId, expiresAt: token.expiresAt });

  return token;
}

interface SITHSVerifyResponse {
  valid: boolean;
  hsa_id?: string;
  display_name?: string;
  error?: string;
}

export async function verifyStepUpToken(
  rawToken: string,
  captureId: string,
  patientId: string
): Promise<{ valid: boolean; hsaId?: string; displayName?: string; reason?: string }> {
  const stored = pendingTokens.get(rawToken);

  if (!stored) {
    return { valid: false, reason: "Token not found or already consumed" };
  }

  if (stored.captureId !== captureId) {
    return { valid: false, reason: "Token does not match capture" };
  }

  if (new Date(stored.expiresAt) < new Date()) {
    pendingTokens.delete(rawToken);
    audit({
      captureId,
      action: "step_up_expired",
      actor: "system",
      patientId,
      outcome: "failure",
      detail: "Step-up token expired before verification",
    });
    return { valid: false, reason: "Token expired" };
  }

  // Verify with SITHS RP service
  try {
    const agent = buildSITHSAgent();
    const res = await fetch(`${config.SITHS_VERIFY_URL}/verify`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token: rawToken }),
      ...(agent ? { agent } : {}),
    });

    const body = (await res.json()) as SITHSVerifyResponse;

    if (!res.ok || !body.valid) {
      audit({
        captureId,
        action: "step_up_verified",
        actor: rawToken,
        patientId,
        outcome: "failure",
        detail: body.error ?? "SITHS RP rejected token",
      });
      pendingTokens.delete(rawToken);
      return { valid: false, reason: body.error ?? "Verification rejected" };
    }

    const hsaId = body.hsa_id ?? "";
    const displayName = body.display_name ?? hsaId;

    // Consume the token — single-use
    pendingTokens.delete(rawToken);

    updateStatus(captureId, "pending", {
      stepUpVerifiedAt: new Date().toISOString(),
    });

    audit({
      captureId,
      action: "step_up_verified",
      actor: hsaId,
      patientId,
      outcome: "success",
      detail: `Step-up verified for ${displayName} (${hsaId})`,
    });

    logger.info("Step-up token verified", { captureId, hsaId });

    return { valid: true, hsaId, displayName };
  } catch (err) {
    logger.error("SITHS verify call failed", { err });
    return { valid: false, reason: "SITHS service unavailable" };
  }
}

export function purgeExpiredTokens(): void {
  const now = new Date();
  for (const [key, token] of pendingTokens.entries()) {
    if (new Date(token.expiresAt) < now) {
      pendingTokens.delete(key);
    }
  }
}

function buildSITHSAgent(): https.Agent | undefined {
  if (!config.SITHS_RP_CLIENT_CERT || !config.SITHS_RP_CLIENT_KEY) return undefined;
  return new https.Agent({
    cert: fs.readFileSync(config.SITHS_RP_CLIENT_CERT),
    key: fs.readFileSync(config.SITHS_RP_CLIENT_KEY),
    rejectUnauthorized: true,
  });
}

function generateToken(): string {
  return Array.from(crypto.getRandomValues(new Uint8Array(32)))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}
