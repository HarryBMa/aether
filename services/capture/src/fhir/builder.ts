import type {
  ClinicalCapture,
  FHIRBinary,
  FHIRDocumentReference,
} from "../types.js";

const LOINC_CLINICAL_PHOTOGRAPH = "72170-4"; // Photographic image - unspecified body site
const LOINC_CLINICAL_NOTE       = "11506-3"; // Progress note

// SNOMED CT body site mappings for common clinical sites
const BODY_SITE_SNOMED: Record<string, { code: string; display: string }> = {
  mandibel:      { code: "91609006",  display: "Mandible structure" },
  munhåla:       { code: "74262004",  display: "Oral cavity structure" },
  hals:          { code: "45048000",  display: "Neck structure" },
  bröst:         { code: "80248007",  display: "Breast structure" },
  buk:           { code: "818983003", display: "Abdomen" },
  extremitet:    { code: "66019005",  display: "Limb structure" },
};

function resolveBodySite(bodySite: string): { code: string; display: string } {
  const lower = bodySite.toLowerCase();
  for (const [key, val] of Object.entries(BODY_SITE_SNOMED)) {
    if (lower.includes(key)) return val;
  }
  return { code: "38866009", display: "Body structure" };
}

export function buildBinaryResource(
  imageBuffer: Buffer,
  contentType: string
): FHIRBinary {
  return {
    resourceType: "Binary",
    contentType,
    data: imageBuffer.toString("base64"),
  };
}

export function buildDocumentReference(
  capture: ClinicalCapture,
  binaryUrl: string,
  contentType: string
): FHIRDocumentReference {
  const site = resolveBodySite(capture.bodySite);

  return {
    resourceType: "DocumentReference",
    status: "current",
    docStatus: "final",
    type: {
      coding: [
        {
          system: "http://loinc.org",
          code: LOINC_CLINICAL_PHOTOGRAPH,
          display: "Photographic image",
        },
      ],
      text: "Klinisk fotografering",
    },
    category: [
      {
        coding: [
          {
            system: "http://loinc.org",
            code: LOINC_CLINICAL_NOTE,
            display: "Progress note",
          },
        ],
        text: capture.clinicalContext,
      },
    ],
    subject: {
      reference: `Patient/${capture.patientId}`,
      display: capture.patientName,
    },
    date: capture.capturedAt,
    author: capture.senderHsaId
      ? [
          {
            reference: `Practitioner/${capture.senderHsaId}`,
            display: capture.senderId,
          },
        ]
      : [{ display: capture.senderId }],
    description: [
      capture.bodySite,
      capture.clinicalContext,
      capture.note,
    ]
      .filter(Boolean)
      .join(" — "),
    securityLabel: [
      {
        coding: [
          {
            system: "http://terminology.hl7.org/CodeSystem/v3-Confidentiality",
            code: "R",
            display: "Restricted",
          },
        ],
      },
    ],
    content: [
      {
        attachment: {
          contentType,
          url: binaryUrl,
          title: `${capture.bodySite} — ${capture.clinicalContext}`,
          creation: capture.capturedAt,
        },
        format: {
          coding: [
            {
              system: "urn:oid:1.3.6.1.4.1.19376.1.2.3",
              code: "urn:ihe:iti:xds:2017:mimeTypeSufficient",
            },
          ],
        },
      },
    ],
    context: {
      event: capture.tags.map((tag) => ({
        coding: [{ system: "urn:aether:tag", code: tag, display: tag }],
        text: tag,
      })),
      practiceSetting: {
        coding: [
          {
            system: "http://snomed.info/sct",
            code: site.code,
            display: site.display,
          },
        ],
        text: capture.bodySite,
      },
    },
  };
}
