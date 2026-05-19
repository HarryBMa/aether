import Database from "better-sqlite3";
import type { Database as DB } from "better-sqlite3";
import { config } from "./config.js";
import type { ClinicalCapture, EMRStatus } from "./types.js";
import { logger } from "./logger.js";

let db: DB;

const SCHEMA = `
PRAGMA journal_mode=WAL;
PRAGMA foreign_keys=ON;

CREATE TABLE IF NOT EXISTS captures (
  id                  TEXT PRIMARY KEY,
  matrix_event_id     TEXT UNIQUE NOT NULL,
  matrix_room_id      TEXT NOT NULL,
  mxc_uri             TEXT NOT NULL,
  patient_id          TEXT NOT NULL,
  patient_name        TEXT NOT NULL,
  sender_id           TEXT NOT NULL,
  sender_hsa_id       TEXT,
  body_site           TEXT NOT NULL,
  clinical_context    TEXT NOT NULL,
  note                TEXT NOT NULL DEFAULT '',
  tags                TEXT NOT NULL DEFAULT '[]',
  captured_at         TEXT NOT NULL,
  received_at         TEXT NOT NULL,
  emr_status          TEXT NOT NULL DEFAULT 'pending',
  emr_document_id     TEXT,
  emr_uploaded_at     TEXT,
  step_up_token       TEXT,
  step_up_verified_at TEXT,
  failure_reason      TEXT,
  retry_count         INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_captures_patient ON captures(patient_id);
CREATE INDEX IF NOT EXISTS idx_captures_status  ON captures(emr_status);
CREATE INDEX IF NOT EXISTS idx_captures_room    ON captures(matrix_room_id);

CREATE TABLE IF NOT EXISTS sync_state (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
`;

export function initStore(): void {
  db = new Database(config.DB_PATH);
  db.exec(SCHEMA);
  logger.info("SQLite store ready", { path: config.DB_PATH });
}

function rowToCapture(row: Record<string, unknown>): ClinicalCapture {
  return {
    id: row["id"] as string,
    matrixEventId: row["matrix_event_id"] as string,
    matrixRoomId: row["matrix_room_id"] as string,
    mxcUri: row["mxc_uri"] as string,
    patientId: row["patient_id"] as string,
    patientName: row["patient_name"] as string,
    senderId: row["sender_id"] as string,
    senderHsaId: (row["sender_hsa_id"] as string | null) ?? null,
    bodySite: row["body_site"] as string,
    clinicalContext: row["clinical_context"] as string,
    note: row["note"] as string,
    tags: JSON.parse(row["tags"] as string) as string[],
    capturedAt: row["captured_at"] as string,
    receivedAt: row["received_at"] as string,
    emrStatus: row["emr_status"] as EMRStatus,
    emrDocumentId: (row["emr_document_id"] as string | null) ?? null,
    emrUploadedAt: (row["emr_uploaded_at"] as string | null) ?? null,
    stepUpToken: (row["step_up_token"] as string | null) ?? null,
    stepUpVerifiedAt: (row["step_up_verified_at"] as string | null) ?? null,
    failureReason: (row["failure_reason"] as string | null) ?? null,
    retryCount: row["retry_count"] as number,
  };
}

export function upsertCapture(c: ClinicalCapture): void {
  db.prepare(`
    INSERT INTO captures (
      id, matrix_event_id, matrix_room_id, mxc_uri,
      patient_id, patient_name, sender_id, sender_hsa_id,
      body_site, clinical_context, note, tags,
      captured_at, received_at, emr_status,
      emr_document_id, emr_uploaded_at,
      step_up_token, step_up_verified_at,
      failure_reason, retry_count
    ) VALUES (
      @id, @matrix_event_id, @matrix_room_id, @mxc_uri,
      @patient_id, @patient_name, @sender_id, @sender_hsa_id,
      @body_site, @clinical_context, @note, @tags,
      @captured_at, @received_at, @emr_status,
      @emr_document_id, @emr_uploaded_at,
      @step_up_token, @step_up_verified_at,
      @failure_reason, @retry_count
    )
    ON CONFLICT(id) DO UPDATE SET
      emr_status          = excluded.emr_status,
      emr_document_id     = excluded.emr_document_id,
      emr_uploaded_at     = excluded.emr_uploaded_at,
      step_up_token       = excluded.step_up_token,
      step_up_verified_at = excluded.step_up_verified_at,
      failure_reason      = excluded.failure_reason,
      retry_count         = excluded.retry_count
  `).run({
    id: c.id,
    matrix_event_id: c.matrixEventId,
    matrix_room_id: c.matrixRoomId,
    mxc_uri: c.mxcUri,
    patient_id: c.patientId,
    patient_name: c.patientName,
    sender_id: c.senderId,
    sender_hsa_id: c.senderHsaId,
    body_site: c.bodySite,
    clinical_context: c.clinicalContext,
    note: c.note,
    tags: JSON.stringify(c.tags),
    captured_at: c.capturedAt,
    received_at: c.receivedAt,
    emr_status: c.emrStatus,
    emr_document_id: c.emrDocumentId,
    emr_uploaded_at: c.emrUploadedAt,
    step_up_token: c.stepUpToken,
    step_up_verified_at: c.stepUpVerifiedAt,
    failure_reason: c.failureReason,
    retry_count: c.retryCount,
  });
}

export function updateStatus(
  id: string,
  status: EMRStatus,
  fields: Partial<Pick<ClinicalCapture, "emrDocumentId" | "emrUploadedAt" | "failureReason" | "stepUpToken" | "stepUpVerifiedAt" | "retryCount">> = {}
): void {
  db.prepare(`
    UPDATE captures SET
      emr_status          = @status,
      emr_document_id     = COALESCE(@emr_document_id, emr_document_id),
      emr_uploaded_at     = COALESCE(@emr_uploaded_at, emr_uploaded_at),
      failure_reason      = COALESCE(@failure_reason, failure_reason),
      step_up_token       = COALESCE(@step_up_token, step_up_token),
      step_up_verified_at = COALESCE(@step_up_verified_at, step_up_verified_at),
      retry_count         = COALESCE(@retry_count, retry_count)
    WHERE id = @id
  `).run({
    id,
    status,
    emr_document_id: fields.emrDocumentId ?? null,
    emr_uploaded_at: fields.emrUploadedAt ?? null,
    failure_reason: fields.failureReason ?? null,
    step_up_token: fields.stepUpToken ?? null,
    step_up_verified_at: fields.stepUpVerifiedAt ?? null,
    retry_count: fields.retryCount ?? null,
  });
}

export function getCapture(id: string): ClinicalCapture | null {
  const row = db.prepare("SELECT * FROM captures WHERE id = ?").get(id) as
    | Record<string, unknown>
    | undefined;
  return row ? rowToCapture(row) : null;
}

export function getCaptureByEventId(eventId: string): ClinicalCapture | null {
  const row = db
    .prepare("SELECT * FROM captures WHERE matrix_event_id = ?")
    .get(eventId) as Record<string, unknown> | undefined;
  return row ? rowToCapture(row) : null;
}

export function listCaptures(opts: {
  patientId?: string;
  status?: EMRStatus;
  limit?: number;
  offset?: number;
}): ClinicalCapture[] {
  const conditions: string[] = [];
  const params: Record<string, unknown> = {};

  if (opts.patientId) {
    conditions.push("patient_id = @patientId");
    params["patientId"] = opts.patientId;
  }
  if (opts.status) {
    conditions.push("emr_status = @status");
    params["status"] = opts.status;
  }

  const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";
  params["limit"] = opts.limit ?? 50;
  params["offset"] = opts.offset ?? 0;

  const rows = db
    .prepare(`SELECT * FROM captures ${where} ORDER BY captured_at DESC LIMIT @limit OFFSET @offset`)
    .all(params) as Record<string, unknown>[];

  return rows.map(rowToCapture);
}

export function getPendingCaptures(): ClinicalCapture[] {
  const rows = db
    .prepare("SELECT * FROM captures WHERE emr_status IN ('pending', 'failed') AND retry_count < 5 ORDER BY captured_at ASC")
    .all() as Record<string, unknown>[];
  return rows.map(rowToCapture);
}

export function getSyncToken(): string | null {
  const row = db
    .prepare("SELECT value FROM sync_state WHERE key = 'next_batch'")
    .get() as { value: string } | undefined;
  return row?.value ?? null;
}

export function setSyncToken(token: string): void {
  db.prepare(
    "INSERT INTO sync_state(key, value) VALUES('next_batch', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value"
  ).run(token);
}
