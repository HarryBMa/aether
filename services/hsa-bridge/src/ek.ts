/**
 * EK (Elektronisk Katalog) REST API client for Region Stockholm.
 * Endpoint: https://www.ek.sll.se
 *
 * The EK catalog is Region Stockholm's HSA directory — the source of truth
 * for all practitioners, units, and organizations in the region.
 *
 * API authentication: client certificate (mTLS) within Sjunet, or
 * API key issued by Region Stockholm IT (STÖD & INFRASTRUKTUR).
 *
 * Attribute reference (EK schema, Region Stockholm):
 *   hsaIdentity              HSA-ID, e.g. SE2321000016-ABC1
 *   givenName                First name
 *   sn                       Surname
 *   cn                       Full name
 *   hsaTitle                 Clinical title (läkare, sjuksköterska, …)
 *   title                    Administrative title
 *   hsaSpecialityName        Specialty name (plain text)
 *   hsaSpecialityCode        Specialty SNOMED CT code
 *   hsaPersonPrescriptionCode Prescriber code (förskrivarkod)
 *   telephoneNumber          Work phone
 *   mobile                   Mobile phone
 *   mail                     Email
 *   organizationName         Employer organization
 *   hsaHealthCareUnitName    Clinical unit name
 *   hsaHealthCareUnitHsaId   Unit HSA-ID
 *   physicalDeliveryOfficeName Location / ward
 */

import https from "https";
import fs from "fs";
import { config } from "./config.js";
import { logger } from "./logger.js";
import type { HSAPerson } from "./ldap.js";

// ── EK API response shape ─────────────────────────────────────────────────────
// The EK REST API returns JSON matching the HSA schema.

interface EKPerson {
  hsaIdentity?: string;
  givenName?: string;
  sn?: string;
  cn?: string;
  hsaTitle?: string;
  title?: string;
  hsaSpecialityName?: string | string[];
  hsaSpecialityCode?: string | string[];
  hsaPersonPrescriptionCode?: string;
  telephoneNumber?: string | string[];
  mobile?: string;
  mail?: string;
  organizationName?: string;
  hsaHealthCareUnitName?: string;
  hsaHealthCareUnitHsaId?: string;
  physicalDeliveryOfficeName?: string;
}

interface EKSearchResponse {
  persons?: EKPerson[];
  total?: number;
}

// ── HTTP agent (mTLS for Sjunet) ──────────────────────────────────────────────

function buildAgent(): https.Agent {
  const opts: https.AgentOptions = { rejectUnauthorized: true };
  if (config.EK_CLIENT_CERT && config.EK_CLIENT_KEY) {
    opts.cert = fs.readFileSync(config.EK_CLIENT_CERT);
    opts.key = fs.readFileSync(config.EK_CLIENT_KEY);
  }
  if (config.EK_CA_CERT) {
    opts.ca = fs.readFileSync(config.EK_CA_CERT);
  }
  return new https.Agent(opts);
}

let _agent: https.Agent | null = null;
function agent(): https.Agent {
  if (!_agent) _agent = buildAgent();
  return _agent;
}

async function ekGet<T>(path: string, params?: Record<string, string>): Promise<T> {
  const url = new URL(path, config.EK_BASE_URL);
  if (params) {
    for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  }

  const headers: Record<string, string> = {
    Accept: "application/json",
  };
  if (config.EK_API_KEY) {
    headers["X-Api-Key"] = config.EK_API_KEY;
  }

  const res = await fetch(url.toString(), {
    headers,
    // @ts-expect-error — node-fetch accepts agent
    agent: agent(),
  });

  if (!res.ok) {
    throw new Error(`EK API ${url.pathname} → ${res.status}`);
  }

  return res.json() as Promise<T>;
}

// ── Mapping ───────────────────────────────────────────────────────────────────

function first(v: string | string[] | undefined): string {
  if (Array.isArray(v)) return v[0] ?? "";
  return v ?? "";
}

function ekPersonToHSAPerson(p: EKPerson): HSAPerson | null {
  const hsaId = p.hsaIdentity?.trim();
  if (!hsaId || !/^SE/i.test(hsaId)) return null;

  const given = first(p.givenName);
  const sn = first(p.sn);
  const displayName = first(p.cn) || [given, sn].filter(Boolean).join(" ") || hsaId;

  const localPart = hsaId.toLowerCase().replace(/[^a-z0-9._\-]/g, "_");
  const matrixUserId = `@${localPart}:${config.MATRIX_DOMAIN}`;

  return {
    hsaId: hsaId.toUpperCase(),
    matrixUserId,
    displayName,
    givenName: given,
    surname: sn,
    title: first(p.hsaTitle) || first(p.title),
    specialty: first(p.hsaSpecialityName) || first(p.hsaSpecialityCode),
    organization: first(p.organizationName) || "",
    unit: first(p.hsaHealthCareUnitName) || "",
    unitHsaId: first(p.hsaHealthCareUnitHsaId) || "",
    prescriptionCode: first(p.hsaPersonPrescriptionCode) || null,
    phone: first(p.telephoneNumber) || null,
    mobile: first(p.mobile) || null,
    email: first(p.mail) || "",
    ward: first(p.physicalDeliveryOfficeName) || "",
    avatarUrl: null,
  };
}

// ── Public API ────────────────────────────────────────────────────────────────

export async function ekSearch(query: string): Promise<HSAPerson[]> {
  if (!config.EK_BASE_URL) return [];

  try {
    const data = await ekGet<EKSearchResponse>("/api/v1/persons", {
      q: query,
      limit: "25",
    });

    return (data.persons ?? [])
      .map(ekPersonToHSAPerson)
      .filter((p): p is HSAPerson => p !== null);
  } catch (err) {
    logger.warn("EK API search failed, will fall back to LDAP", { err, query });
    return [];
  }
}

export async function ekGetPerson(hsaId: string): Promise<HSAPerson | null> {
  if (!config.EK_BASE_URL) return null;

  try {
    const person = await ekGet<EKPerson>(`/api/v1/persons/${encodeURIComponent(hsaId)}`);
    return ekPersonToHSAPerson(person);
  } catch (err) {
    logger.warn("EK API person lookup failed, will fall back to LDAP", { err, hsaId });
    return null;
  }
}
