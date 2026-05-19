import { z } from "zod";
import dotenv from "dotenv";

dotenv.config();

const schema = z.object({
  NODE_ENV: z.enum(["development", "production", "test"]).default("production"),
  PORT: z.coerce.number().default(3401),

  // mTLS — server cert presented to clients
  TLS_CERT: z.string().default("/certs/siths-rp.pem"),
  TLS_KEY: z.string().default("/certs/siths-rp-key.pem"),

  // SITHS CA trust chain (Inera Root CA + Issuing CA)
  // Download from: https://www.inera.se/tjanster/siths-ca/
  SITHS_CA_BUNDLE: z.string().default("/certs/siths-ca-bundle.pem"),

  // Whether to require a valid SITHS client cert on every request.
  // Set to "false" in dev to allow calls without a smartcard present.
  REQUIRE_CLIENT_CERT: z
    .string()
    .transform((v) => v !== "false")
    .default("true"),

  // JWT signing key (EC P-256 private key PEM) — used for step-up tokens
  JWT_PRIVATE_KEY: z.string().default("/certs/jwt-signing-key.pem"),
  JWT_PUBLIC_KEY: z.string().default("/certs/jwt-signing-key-pub.pem"),

  // Token lifetime in seconds (default 10 min — matches capture service)
  JWT_TTL_SEC: z.coerce.number().default(600),

  // Issuer claim
  JWT_ISSUER: z.string().default("urn:aether:siths-rp"),

  // Service-to-service API key (same value as SITHS_RP_API_KEY in other services)
  API_KEY: z.string().min(32),
});

const parsed = schema.safeParse(process.env);
if (!parsed.success) {
  const issues = parsed.error.issues
    .map((i) => `  ${i.path.join(".")}: ${i.message}`)
    .join("\n");
  console.error(`Configuration error:\n${issues}`);
  process.exit(1);
}

export const config = parsed.data;
