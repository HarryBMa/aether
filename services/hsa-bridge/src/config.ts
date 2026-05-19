import { z } from "zod";
import dotenv from "dotenv";

dotenv.config();

const schema = z.object({
  NODE_ENV: z.enum(["development", "production", "test"]).default("production"),
  PORT: z.coerce.number().default(3402),

  // ── EK REST API (primary — www.ek.sll.se) ───────────────────────────────
  // Region Stockholm's Elektronisk Katalog REST API.
  // Leave blank to skip REST and use LDAP only.
  EK_BASE_URL: z.string().url().optional().default("https://www.ek.sll.se"),
  // API key issued by Region Stockholm IT (STÖD & INFRASTRUKTUR)
  EK_API_KEY: z.string().optional(),
  // mTLS client cert for Sjunet access (if required by EK)
  EK_CLIENT_CERT: z.string().optional(),
  EK_CLIENT_KEY: z.string().optional(),
  EK_CA_CERT: z.string().optional(),

  // ── HSA LDAP (fallback — ldap.ek.sll.se within Sjunet) ─────────────────
  HSA_LDAP_URL: z.string().default("ldaps://ldap.ek.sll.se:636"),
  HSA_LDAP_BIND_DN: z.string().default(""),
  HSA_LDAP_BIND_PASSWORD: z.string().default(""),
  // Region Stockholm base DN in the national HSA catalog
  HSA_LDAP_BASE_DN: z.string().default(
    "ou=Region Stockholm,o=HSA-katalogen,c=SE"
  ),
  HSA_LDAP_TLS_CA: z.string().optional(),
  HSA_LDAP_TIMEOUT_MS: z.coerce.number().default(5000),

  // ── Cache ────────────────────────────────────────────────────────────────
  CACHE_TTL_MS: z.coerce.number().default(5 * 60 * 1000),

  // ── Matrix ───────────────────────────────────────────────────────────────
  MATRIX_DOMAIN: z.string().min(1),

  // ── Service auth ─────────────────────────────────────────────────────────
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
