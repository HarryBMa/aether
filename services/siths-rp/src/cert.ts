import { X509Certificate } from "@peculiar/x509";
import crypto from "crypto";

// OID for the serialNumber attribute in X.509 Distinguished Names.
// SITHS uses this to carry the HSA-ID (e.g. SE2321000016-1ABCD).
const OID_SERIAL_NUMBER = "2.5.4.5";

// Alternative OID used in some SITHS generations for Swedish personal/HSA IDs
const OID_HSA_ID_LEGACY = "1.2.752.26.1.1.8";

export interface SITHSIdentity {
  hsaId: string;
  displayName: string;
  organization: string;
  rawSubject: string;
  notBefore: Date;
  notAfter: Date;
  fingerprint: string;
}

export class CertificateError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CertificateError";
  }
}

/**
 * Parse a PEM-encoded X.509 certificate and extract the SITHS identity.
 * Throws CertificateError if the cert is structurally invalid or missing HSA-ID.
 */
export function parseSITHSCert(pemOrDer: string | Buffer): SITHSIdentity {
  let cert: X509Certificate;

  try {
    if (Buffer.isBuffer(pemOrDer)) {
      cert = new X509Certificate(pemOrDer);
    } else {
      // Strip PEM headers and decode
      const b64 = pemOrDer
        .replace(/-----BEGIN CERTIFICATE-----/g, "")
        .replace(/-----END CERTIFICATE-----/g, "")
        .replace(/\s+/g, "");
      cert = new X509Certificate(Buffer.from(b64, "base64"));
    }
  } catch {
    throw new CertificateError("Failed to parse certificate");
  }

  // Parse subject DN into a map of OID/name → value
  const subjectMap = parseDN(cert.subject);

  // HSA-ID is in the serialNumber (2.5.4.5) field in modern SITHS certs
  const hsaId =
    subjectMap[OID_SERIAL_NUMBER] ??
    subjectMap["serialNumber"] ??
    subjectMap[OID_HSA_ID_LEGACY] ??
    null;

  if (!hsaId) {
    throw new CertificateError(
      "Certificate subject does not contain HSA-ID (serialNumber field missing)"
    );
  }

  // Validate HSA-ID format: SE followed by 10–20 alphanumeric chars
  if (!/^SE[A-Z0-9\-]{3,20}$/i.test(hsaId)) {
    throw new CertificateError(`HSA-ID format invalid: ${hsaId}`);
  }

  const cn =
    subjectMap["CN"] ?? subjectMap["commonName"] ?? subjectMap["2.5.4.3"] ?? "";
  const org =
    subjectMap["O"] ?? subjectMap["organizationName"] ?? subjectMap["2.5.4.10"] ?? "";

  // SHA-256 fingerprint for audit purposes
  const raw = cert.rawData as ArrayBuffer;
  const fingerprint = crypto
    .createHash("sha256")
    .update(Buffer.from(raw))
    .digest("hex")
    .toUpperCase()
    .match(/.{2}/g)!
    .join(":");

  return {
    hsaId: hsaId.toUpperCase(),
    displayName: cn,
    organization: org,
    rawSubject: cert.subject,
    notBefore: cert.notBefore,
    notAfter: cert.notAfter,
    fingerprint,
  };
}

/**
 * Verify that the cert is currently valid (within its validity period).
 * Separate from CA chain verification which is handled at the TLS layer.
 */
export function assertCertValid(identity: SITHSIdentity): void {
  const now = new Date();
  if (now < identity.notBefore) {
    throw new CertificateError("Certificate is not yet valid");
  }
  if (now > identity.notAfter) {
    throw new CertificateError("Certificate has expired");
  }
}

// ── DN parser ────────────────────────────────────────────────────────────────

/**
 * Parse an RFC 4514 Distinguished Name string into attribute map.
 * Handles both short names (CN, O) and OIDs.
 * Example input: "CN=Anna Svensson,SERIALNUMBER=SE2321000016-ABC1,O=Karolinska,C=SE"
 */
function parseDN(dn: string): Record<string, string> {
  const result: Record<string, string> = {};

  // Split on commas that are NOT inside escaped chars or quoted strings
  const parts = dn.split(/,(?![^"]*"(?:[^"]*"[^"]*")*[^"]*$)/);

  for (const part of parts) {
    const eqIdx = part.indexOf("=");
    if (eqIdx === -1) continue;
    const key = part.slice(0, eqIdx).trim();
    const val = part.slice(eqIdx + 1).trim().replace(/^"|"$/g, "");
    result[key] = val;
  }

  return result;
}
