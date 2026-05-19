import fs from "fs";
import { v4 as uuidv4 } from "uuid";
import { config } from "./config.js";
import { logger } from "./logger.js";
import type { AuditEntry } from "./types.js";

let stream: fs.WriteStream;

export function initAudit(): void {
  stream = fs.createWriteStream(config.AUDIT_LOG_PATH, { flags: "a" });
  stream.on("error", (err) => logger.error("Audit stream error", { err }));
  logger.info("Audit log ready", { path: config.AUDIT_LOG_PATH });
}

export function audit(
  entry: Omit<AuditEntry, "id" | "timestamp">
): void {
  const record: AuditEntry = {
    id: uuidv4(),
    timestamp: new Date().toISOString(),
    ...entry,
  };

  if (!stream || stream.destroyed) {
    logger.error("Audit stream not available", { record });
    return;
  }

  stream.write(JSON.stringify(record) + "\n", (err) => {
    if (err) logger.error("Failed to write audit entry", { err, record });
  });
}

export function closeAudit(): void {
  stream?.end();
}
