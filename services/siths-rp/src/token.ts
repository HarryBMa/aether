import { SignJWT, jwtVerify, importPKCS8, importSPKI, type KeyLike } from "jose";
import fs from "fs";
import { config } from "./config.js";

let signingKey: KeyLike | null = null;
let verifyKey: KeyLike | null = null;

export async function loadKeys(): Promise<void> {
  const privPem = fs.readFileSync(config.JWT_PRIVATE_KEY, "utf8");
  const pubPem = fs.readFileSync(config.JWT_PUBLIC_KEY, "utf8");
  signingKey = await importPKCS8(privPem, "ES256");
  verifyKey = await importSPKI(pubPem, "ES256");
}

export interface StepUpClaims {
  /** HSA-ID of the authenticated practitioner */
  hsa_id: string;
  /** Display name from SITHS certificate CN */
  display_name: string;
  /** Capture ID this token was issued for (single-use scope) */
  capture_id: string;
  /** Certificate fingerprint for audit trail */
  cert_fingerprint: string;
}

/**
 * Issue a signed step-up JWT.
 * The token is single-use — the capture service consumes it on /verify-step-up.
 */
export async function issueToken(claims: StepUpClaims): Promise<string> {
  if (!signingKey) throw new Error("Signing key not loaded");

  return new SignJWT({ ...claims })
    .setProtectedHeader({ alg: "ES256" })
    .setIssuer(config.JWT_ISSUER)
    .setAudience("urn:aether:capture")
    .setIssuedAt()
    .setExpirationTime(`${config.JWT_TTL_SEC}s`)
    .setJti(crypto.randomUUID())
    .sign(signingKey);
}

/**
 * Verify a step-up JWT. Returns the claims if valid.
 * Used by the capture service's /verify-step-up endpoint (or by the RP itself).
 */
export async function verifyToken(jwt: string): Promise<StepUpClaims> {
  if (!verifyKey) throw new Error("Verify key not loaded");

  const { payload } = await jwtVerify(jwt, verifyKey, {
    issuer: config.JWT_ISSUER,
    audience: "urn:aether:capture",
    algorithms: ["ES256"],
  });

  return payload as unknown as StepUpClaims;
}
