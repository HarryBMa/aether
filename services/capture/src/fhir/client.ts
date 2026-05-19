import fetch, { type RequestInit } from "node-fetch";
import https from "https";
import fs from "fs";
import { config } from "../config.js";
import { logger } from "../logger.js";
import type {
  ClinicalCapture,
  FHIRBinary,
  FHIRDocumentReference,
} from "../types.js";
import { buildBinaryResource, buildDocumentReference } from "./builder.js";
import {
  updateStatus,
  getCapture,
} from "../store.js";
import { audit } from "../audit.js";
import { getImageBuffer, zeroAndDeleteBuffer } from "../matrix/client.js";

function buildAgent(): https.Agent | undefined {
  if (
    !config.FHIR_CLIENT_CERT ||
    !config.FHIR_CLIENT_KEY
  ) {
    return undefined;
  }

  return new https.Agent({
    cert: fs.readFileSync(config.FHIR_CLIENT_CERT),
    key: fs.readFileSync(config.FHIR_CLIENT_KEY),
    ca: config.FHIR_CA_CERT ? fs.readFileSync(config.FHIR_CA_CERT) : undefined,
    rejectUnauthorized: true,
  });
}

const agent = buildAgent();

async function fhirRequest<T>(
  method: string,
  path: string,
  body?: unknown
): Promise<T> {
  const url = `${config.FHIR_BASE_URL}${path}`;

  const init: RequestInit = {
    method,
    headers: {
      "Content-Type": "application/fhir+json",
      Accept: "application/fhir+json",
    },
    ...(agent ? { agent } : {}),
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  };

  const res = await fetch(url, init);

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`FHIR ${method} ${url} → ${res.status}: ${text}`);
  }

  return res.json() as Promise<T>;
}

async function withRetry<T>(
  fn: () => Promise<T>,
  maxRetries: number,
  delayMs: number
): Promise<T> {
  let attempt = 0;
  while (true) {
    try {
      return await fn();
    } catch (err) {
      attempt++;
      if (attempt > maxRetries) throw err;
      const wait = delayMs * Math.pow(2, attempt - 1);
      logger.warn("FHIR request failed, retrying", { attempt, waitMs: wait, err });
      await new Promise((r) => setTimeout(r, wait));
    }
  }
}

export async function uploadCapture(captureId: string, hsaId: string): Promise<void> {
  const capture = getCapture(captureId);
  if (!capture) throw new Error(`Capture ${captureId} not found`);

  if (capture.emrStatus === "uploaded") {
    logger.info("Capture already uploaded", { captureId });
    return;
  }

  const imageBuffer = getImageBuffer(captureId);
  if (!imageBuffer) {
    throw new Error(`Image buffer not available for capture ${captureId} — may have expired`);
  }

  updateStatus(captureId, "uploading");

  audit({
    captureId,
    action: "emr_upload_started",
    actor: hsaId,
    patientId: capture.patientId,
    outcome: "pending",
    detail: `Upload initiated by ${hsaId}`,
  });

  try {
    // Detect content type from buffer magic bytes
    const contentType = sniffContentType(imageBuffer);

    // Step 1: upload Binary resource (image data base64-encoded in FHIR payload)
    const binary = buildBinaryResource(imageBuffer, contentType);
    const binaryResult = await withRetry(
      () => fhirRequest<{ id: string }>("POST", "/Binary", binary),
      config.FHIR_MAX_RETRIES,
      config.FHIR_RETRY_DELAY_MS
    );
    const binaryId = binaryResult.id;
    const binaryUrl = `${config.FHIR_BASE_URL}/Binary/${binaryId}`;

    // Step 2: zero and release image buffer — data is now in FHIR server
    zeroAndDeleteBuffer(captureId);

    // Step 3: create DocumentReference pointing to the Binary
    const docRef = buildDocumentReference(capture, binaryUrl, contentType);
    const docResult = await withRetry(
      () => fhirRequest<{ id: string }>("POST", "/DocumentReference", docRef),
      config.FHIR_MAX_RETRIES,
      config.FHIR_RETRY_DELAY_MS
    );
    const docId = docResult.id;

    updateStatus(captureId, "uploaded", {
      emrDocumentId: docId,
      emrUploadedAt: new Date().toISOString(),
    });

    audit({
      captureId,
      action: "emr_upload_success",
      actor: hsaId,
      patientId: capture.patientId,
      outcome: "success",
      detail: `DocumentReference/${docId} created in EMR`,
    });

    logger.info("Capture uploaded to EMR", {
      captureId,
      binaryId,
      documentReferenceId: docId,
    });
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    const newRetryCount = capture.retryCount + 1;

    updateStatus(captureId, "failed", {
      failureReason: reason,
      retryCount: newRetryCount,
    });

    audit({
      captureId,
      action: "emr_upload_failed",
      actor: hsaId,
      patientId: capture.patientId,
      outcome: "failure",
      detail: reason,
    });

    logger.error("Capture upload failed", { captureId, reason });
    throw err;
  }
}

function sniffContentType(buf: Buffer): string {
  // JPEG: FF D8 FF
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return "image/jpeg";
  // PNG: 89 50 4E 47
  if (buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) return "image/png";
  // HEIF/HEIC: ftyp at offset 4
  if (
    buf.length > 12 &&
    buf.slice(4, 8).toString("ascii") === "ftyp" &&
    (buf.slice(8, 12).toString("ascii") === "heic" ||
     buf.slice(8, 12).toString("ascii") === "heis")
  ) {
    return "image/heic";
  }
  return "image/jpeg"; // default
}
