export type EMRStatus =
  | "pending"
  | "awaiting_auth"
  | "uploading"
  | "uploaded"
  | "failed";

export interface ClinicalCapture {
  id: string;
  matrixEventId: string;
  matrixRoomId: string;
  mxcUri: string;
  patientId: string;
  patientName: string;
  senderId: string;
  senderHsaId: string | null;
  bodySite: string;
  clinicalContext: string;
  note: string;
  tags: string[];
  capturedAt: string;
  receivedAt: string;
  emrStatus: EMRStatus;
  emrDocumentId: string | null;
  emrUploadedAt: string | null;
  stepUpToken: string | null;
  stepUpVerifiedAt: string | null;
  failureReason: string | null;
  retryCount: number;
}

export interface StepUpToken {
  token: string;
  hsaId: string;
  displayName: string;
  expiresAt: string;
  captureId: string;
}

export interface FHIRBinary {
  resourceType: "Binary";
  contentType: string;
  data: string;
}

export interface FHIRCodeableConcept {
  coding: Array<{
    system: string;
    code: string;
    display?: string;
  }>;
  text?: string;
}

export interface FHIRReference {
  reference?: string;
  display?: string;
}

export interface FHIRDocumentReference {
  resourceType: "DocumentReference";
  id?: string;
  status: "current" | "superseded" | "entered-in-error";
  docStatus?: "preliminary" | "final" | "amended" | "entered-in-error";
  type: FHIRCodeableConcept;
  category: FHIRCodeableConcept[];
  subject: FHIRReference;
  date: string;
  author: FHIRReference[];
  description?: string;
  securityLabel?: FHIRCodeableConcept[];
  content: Array<{
    attachment: {
      contentType: string;
      url?: string;
      title?: string;
      creation?: string;
    };
    format?: FHIRCodeableConcept;
  }>;
  context?: {
    encounter?: FHIRReference[];
    event?: FHIRCodeableConcept[];
    period?: { start?: string; end?: string };
    facilityType?: FHIRCodeableConcept;
    practiceSetting?: FHIRCodeableConcept;
  };
}

export interface AuditEntry {
  id: string;
  timestamp: string;
  captureId: string;
  action:
    | "capture_received"
    | "step_up_requested"
    | "step_up_verified"
    | "step_up_expired"
    | "emr_upload_started"
    | "emr_upload_success"
    | "emr_upload_failed"
    | "capture_expired"
    | "api_request";
  actor: string;
  patientId: string;
  outcome: "success" | "failure" | "pending";
  detail: string;
}

export interface UploadRequest {
  captureId: string;
  stepUpToken: string;
}

export interface CaptureListItem {
  id: string;
  patientId: string;
  patientName: string;
  bodySite: string;
  clinicalContext: string;
  capturedAt: string;
  emrStatus: EMRStatus;
  senderHsaId: string | null;
}
