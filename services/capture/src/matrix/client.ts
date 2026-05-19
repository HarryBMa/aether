import fetch from "node-fetch";
import https from "https";
import fs from "fs";
import { v4 as uuidv4 } from "uuid";
import { config, matrixMediaBase } from "../config.js";
import { logger } from "../logger.js";
import { audit } from "../audit.js";
import {
  upsertCapture,
  getCaptureByEventId,
  getSyncToken,
  setSyncToken,
} from "../store.js";
import type { ClinicalCapture } from "../types.js";

// Custom event type for clinical photograph metadata
const CLINICAL_CAPTURE_EVENT_TYPE = "com.aether.clinical_capture";

interface MatrixSyncResponse {
  next_batch: string;
  rooms?: {
    join?: Record<string, {
      timeline?: {
        events?: MatrixEvent[];
      };
    }>;
  };
}

interface MatrixEvent {
  type: string;
  event_id: string;
  sender: string;
  origin_server_ts: number;
  content: Record<string, unknown>;
  room_id?: string;
}

// Buffer of downloaded image data keyed by captureId.
// Values are zeroed and deleted after EMR upload or TTL expiry.
const imageBuffers = new Map<string, Buffer>();
const bufferTimestamps = new Map<string, number>();

let running = false;

function buildHeaders() {
  return {
    Authorization: `Bearer ${config.MATRIX_ACCESS_TOKEN}`,
    "Content-Type": "application/json",
  };
}

function buildSyncUrl(since: string | null): string {
  const base = `${config.MATRIX_HOMESERVER_URL}/_matrix/client/v3/sync`;
  const params = new URLSearchParams({
    filter: JSON.stringify({
      room: {
        timeline: {
          types: [CLINICAL_CAPTURE_EVENT_TYPE],
          limit: 50,
        },
      },
    }),
    timeout: String(config.MATRIX_SYNC_TIMEOUT_MS),
  });
  if (since) params.set("since", since);
  return `${base}?${params.toString()}`;
}

function parseCaptureEvent(event: MatrixEvent): ClinicalCapture | null {
  const c = event.content;

  if (
    typeof c["patient_id"] !== "string" ||
    typeof c["mxc_uri"] !== "string" ||
    typeof c["body_site"] !== "string" ||
    typeof c["clinical_context"] !== "string"
  ) {
    logger.warn("Dropping malformed capture event", { event_id: event.event_id });
    return null;
  }

  const watchedRooms = config.MATRIX_WATCHED_ROOMS
    ? config.MATRIX_WATCHED_ROOMS.split(",").map((r) => r.trim())
    : null;

  if (watchedRooms && event.room_id && !watchedRooms.includes(event.room_id)) {
    return null;
  }

  return {
    id: uuidv4(),
    matrixEventId: event.event_id,
    matrixRoomId: event.room_id ?? "",
    mxcUri: c["mxc_uri"] as string,
    patientId: c["patient_id"] as string,
    patientName: (c["patient_name"] as string | undefined) ?? "",
    senderId: event.sender,
    senderHsaId: (c["sender_hsa_id"] as string | null | undefined) ?? null,
    bodySite: c["body_site"] as string,
    clinicalContext: c["clinical_context"] as string,
    note: (c["note"] as string | undefined) ?? "",
    tags: Array.isArray(c["tags"])
      ? (c["tags"] as unknown[]).filter((t): t is string => typeof t === "string")
      : [],
    capturedAt: new Date(event.origin_server_ts).toISOString(),
    receivedAt: new Date().toISOString(),
    emrStatus: "pending",
    emrDocumentId: null,
    emrUploadedAt: null,
    stepUpToken: null,
    stepUpVerifiedAt: null,
    failureReason: null,
    retryCount: 0,
  };
}

async function downloadMxcImage(mxcUri: string, captureId: string): Promise<Buffer | null> {
  // mxc://server/mediaId → /_matrix/media/v3/download/server/mediaId
  const match = mxcUri.match(/^mxc:\/\/([^/]+)\/([^/]+)$/);
  if (!match) {
    logger.error("Invalid mxc URI", { mxcUri });
    return null;
  }

  const [, server, mediaId] = match;
  const url = `${matrixMediaBase}/_matrix/media/v3/download/${server}/${mediaId}`;

  try {
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${config.MATRIX_ACCESS_TOKEN}` },
    });

    if (!res.ok) {
      logger.error("Failed to download mxc image", { status: res.status, url });
      return null;
    }

    const contentLength = res.headers.get("content-length");
    if (contentLength && parseInt(contentLength) > config.MAX_IMAGE_BYTES) {
      logger.error("Image exceeds max size", { bytes: contentLength, captureId });
      return null;
    }

    const arrayBuffer = await res.arrayBuffer();
    const buf = Buffer.from(arrayBuffer);

    if (buf.byteLength > config.MAX_IMAGE_BYTES) {
      logger.error("Downloaded image exceeds max size", { bytes: buf.byteLength, captureId });
      return null;
    }

    logger.info("Image downloaded to memory buffer", {
      captureId,
      bytes: buf.byteLength,
    });

    return buf;
  } catch (err) {
    logger.error("Exception downloading mxc image", { err, mxcUri });
    return null;
  }
}

export function storeImageBuffer(captureId: string, buf: Buffer): void {
  imageBuffers.set(captureId, buf);
  bufferTimestamps.set(captureId, Date.now());
}

export function getImageBuffer(captureId: string): Buffer | null {
  return imageBuffers.get(captureId) ?? null;
}

export function zeroAndDeleteBuffer(captureId: string): void {
  const buf = imageBuffers.get(captureId);
  if (buf) {
    buf.fill(0); // explicit zeroing before GC
    imageBuffers.delete(captureId);
    bufferTimestamps.delete(captureId);
    logger.debug("Image buffer zeroed and released", { captureId });
  }
}

export function purgeExpiredBuffers(): void {
  const now = Date.now();
  for (const [id, ts] of bufferTimestamps.entries()) {
    if (now - ts > config.IMAGE_BUFFER_TTL_MS) {
      zeroAndDeleteBuffer(id);
      logger.info("Image buffer expired and purged", { captureId: id });
    }
  }
}

async function processEvent(event: MatrixEvent): Promise<void> {
  if (getCaptureByEventId(event.event_id)) return; // idempotent

  const capture = parseCaptureEvent(event);
  if (!capture) return;

  upsertCapture(capture);

  audit({
    captureId: capture.id,
    action: "capture_received",
    actor: capture.senderId,
    patientId: capture.patientId,
    outcome: "success",
    detail: `Received ${CLINICAL_CAPTURE_EVENT_TYPE} for ${capture.patientId} from ${capture.senderId}`,
  });

  // Download image into in-memory buffer — never touches disk
  const buf = await downloadMxcImage(capture.mxcUri, capture.id);
  if (buf) {
    storeImageBuffer(capture.id, buf);
  } else {
    logger.warn("Could not buffer image; upload will fail unless re-fetched", {
      captureId: capture.id,
    });
  }

  logger.info("Capture queued", { captureId: capture.id, patientId: capture.patientId });
}

async function syncOnce(since: string | null): Promise<string | null> {
  const url = buildSyncUrl(since);

  try {
    const res = await fetch(url, { headers: buildHeaders() });

    if (res.status === 401) {
      logger.error("Matrix access token rejected — stopping sync");
      running = false;
      return null;
    }

    if (!res.ok) {
      logger.warn("Sync returned non-200", { status: res.status });
      return since;
    }

    const body = (await res.json()) as MatrixSyncResponse;
    const nextBatch = body.next_batch;

    if (body.rooms?.join) {
      for (const [roomId, roomData] of Object.entries(body.rooms.join)) {
        const events = roomData.timeline?.events ?? [];
        for (const event of events) {
          if (event.type === CLINICAL_CAPTURE_EVENT_TYPE) {
            event.room_id = roomId;
            await processEvent(event);
          }
        }
      }
    }

    if (nextBatch) setSyncToken(nextBatch);
    return nextBatch ?? since;
  } catch (err) {
    logger.error("Sync request failed", { err });
    return since;
  }
}

export async function startMatrixSync(): Promise<void> {
  if (running) return;
  running = true;

  let since = getSyncToken();
  logger.info("Matrix sync starting", { since: since ?? "initial" });

  const BACKOFF_MAX = 60_000;
  let backoff = 1000;

  while (running) {
    const next = await syncOnce(since);
    if (next !== since) {
      backoff = 1000; // reset on successful response with new batch
    } else {
      await new Promise((r) => setTimeout(r, backoff));
      backoff = Math.min(backoff * 2, BACKOFF_MAX);
    }
    since = next;
  }
}

export function stopMatrixSync(): void {
  running = false;
}
