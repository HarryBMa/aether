import { z } from "zod";
import dotenv from "dotenv";

dotenv.config();

const schema = z.object({
  NODE_ENV: z.enum(["development", "production", "test"]).default("production"),
  PORT: z.coerce.number().default(3400),

  // Matrix homeserver
  MATRIX_HOMESERVER_URL: z.string().url(),
  MATRIX_ACCESS_TOKEN: z.string().min(1),
  MATRIX_DEVICE_ID: z.string().default("CAPTURE_SERVICE"),
  MATRIX_SYNC_TIMEOUT_MS: z.coerce.number().default(30000),
  MATRIX_WATCHED_ROOMS: z.string().optional(), // comma-separated room IDs; empty = all joined rooms
  MATRIX_MEDIA_BASE_URL: z.string().url().optional(), // defaults to MATRIX_HOMESERVER_URL

  // FHIR / COSMIC
  FHIR_BASE_URL: z.string().url(),
  FHIR_CLIENT_CERT: z.string().optional(), // path to PEM client cert for mTLS
  FHIR_CLIENT_KEY: z.string().optional(),
  FHIR_CA_CERT: z.string().optional(),
  FHIR_TIMEOUT_MS: z.coerce.number().default(15000),
  FHIR_MAX_RETRIES: z.coerce.number().default(3),
  FHIR_RETRY_DELAY_MS: z.coerce.number().default(2000),

  // SITHS step-up auth (RP side)
  SITHS_VERIFY_URL: z.string().url(),
  SITHS_RP_CLIENT_CERT: z.string().optional(),
  SITHS_RP_CLIENT_KEY: z.string().optional(),

  // Service auth
  SERVICE_API_KEY: z.string().min(32),

  // Persistence
  DB_PATH: z.string().default("/data/capture.db"),

  // Capture lifecycle
  STEP_UP_TOKEN_TTL_MS: z.coerce.number().default(10 * 60 * 1000), // 10 min
  IMAGE_BUFFER_TTL_MS: z.coerce.number().default(30 * 60 * 1000),  // 30 min
  MAX_IMAGE_BYTES: z.coerce.number().default(25 * 1024 * 1024),    // 25 MB

  // Audit log
  AUDIT_LOG_PATH: z.string().default("/data/audit.ndjson"),
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

export const matrixMediaBase =
  config.MATRIX_MEDIA_BASE_URL ?? config.MATRIX_HOMESERVER_URL;
