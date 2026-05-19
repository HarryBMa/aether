import { z } from "zod";
import dotenv from "dotenv";

dotenv.config();

const schema = z.object({
  NODE_ENV: z.enum(["development", "production", "test"]).default("production"),
  PORT: z.coerce.number().default(3402),

  // HSA LDAP directory (Inera national directory or regional replica)
  HSA_LDAP_URL: z.string().default("ldaps://katalog.hsa.sjunet.org:636"),
  HSA_LDAP_BIND_DN: z.string().default(""),      // anonymous bind if empty
  HSA_LDAP_BIND_PASSWORD: z.string().default(""),
  HSA_LDAP_BASE_DN: z.string().default("ou=HSA,o=Inera,c=SE"),
  HSA_LDAP_TLS_CA: z.string().optional(),        // path to CA cert for LDAPS
  HSA_LDAP_TIMEOUT_MS: z.coerce.number().default(5000),

  // Cache TTL for LDAP results (milliseconds)
  CACHE_TTL_MS: z.coerce.number().default(5 * 60 * 1000),

  // Matrix homeserver domain — used to construct @hsaid:domain Matrix IDs
  MATRIX_DOMAIN: z.string().min(1),

  // Service API key
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
