/**
 * HSA LDAP client for Region Stockholm's EK (Elektronisk Katalog).
 *
 * Primary lookup goes through the EK REST API (www.ek.sll.se).
 * LDAP is the fallback for environments where the REST API is unavailable
 * or for bulk lookups that benefit from LDAP paging.
 *
 * LDAP endpoint: ldaps://ldap.ek.sll.se:636  (within Sjunet)
 * Base DN:       ou=Region Stockholm,o=HSA-katalogen,c=SE
 *
 * Schema reference: HSA-IS 3.11 (Inera), extended with SLL-specific attributes.
 */

import { Client } from "ldapts";
import fs from "fs";
import { config } from "./config.js";
import { logger } from "./logger.js";

export interface HSAPerson {
  hsaId: string;
  matrixUserId: string;
  displayName: string;
  givenName: string;
  surname: string;
  /** Clinical title: läkare, sjuksköterska, undersköterska, … */
  title: string;
  /** Human-readable specialty name */
  specialty: string;
  organization: string;
  /** Clinical unit name (avdelning/mottagning) */
  unit: string;
  unitHsaId: string;
  /** Prescriber code (förskrivarkod) — 7 digits */
  prescriptionCode: string | null;
  phone: string | null;
  mobile: string | null;
  email: string;
  /** Ward / physical location */
  ward: string;
  avatarUrl: string | null;
}

// ── TTL cache ─────────────────────────────────────────────────────────────────

interface CacheEntry<T> {
  value: T;
  expiresAt: number;
}

class Cache<T> {
  private store = new Map<string, CacheEntry<T>>();

  get(key: string): T | null {
    const entry = this.store.get(key);
    if (!entry) return null;
    if (Date.now() > entry.expiresAt) {
      this.store.delete(key);
      return null;
    }
    return entry.value;
  }

  set(key: string, value: T): void {
    this.store.set(key, { value, expiresAt: Date.now() + config.CACHE_TTL_MS });
  }
}

const searchCache = new Cache<HSAPerson[]>();
const personCache = new Cache<HSAPerson | null>();

// ── LDAP client ───────────────────────────────────────────────────────────────

// All attributes fetched from EK LDAP — superset of the national HSA schema
const EK_ATTRIBUTES = [
  "hsaIdentity",
  "cn", "givenName", "sn",
  "hsaTitle",                  // clinical title (SLL extension)
  "title",                     // administrative title
  "hsaSpecialityName",         // readable specialty
  "hsaSpecialityCode",         // SNOMED CT code
  "hsaPersonPrescriptionCode", // förskrivarkod
  "telephoneNumber",
  "mobile",
  "mail",
  "organizationName", "o",
  "hsaHealthCareUnitName",
  "hsaHealthCareUnitHsaId",
  "physicalDeliveryOfficeName",
];

function buildClient(): Client {
  const tlsOptions = config.HSA_LDAP_TLS_CA
    ? { ca: fs.readFileSync(config.HSA_LDAP_TLS_CA) }
    : undefined;

  return new Client({
    url: config.HSA_LDAP_URL,
    timeout: config.HSA_LDAP_TIMEOUT_MS,
    connectTimeout: config.HSA_LDAP_TIMEOUT_MS,
    tlsOptions,
  });
}

async function withClient<T>(fn: (client: Client) => Promise<T>): Promise<T> {
  const client = buildClient();
  try {
    if (config.HSA_LDAP_BIND_DN) {
      await client.bind(config.HSA_LDAP_BIND_DN, config.HSA_LDAP_BIND_PASSWORD);
    }
    return await fn(client);
  } finally {
    await client.unbind().catch(() => {});
  }
}

// ── Attribute helpers ─────────────────────────────────────────────────────────

type LDAPEntry = Record<string, unknown>;

function str(entry: LDAPEntry, ...names: string[]): string {
  for (const name of names) {
    const v = entry[name];
    if (Array.isArray(v) && v.length > 0) return String(v[0]);
    if (v != null && v !== "") return String(v);
  }
  return "";
}

function mapEntry(entry: LDAPEntry): HSAPerson | null {
  const hsaId = str(entry, "hsaIdentity").trim();
  if (!hsaId || !/^SE/i.test(hsaId)) return null;

  const given = str(entry, "givenName");
  const sn = str(entry, "sn");
  const displayName = str(entry, "cn") || [given, sn].filter(Boolean).join(" ") || hsaId;

  const localPart = hsaId.toLowerCase().replace(/[^a-z0-9._\-]/g, "_");
  const matrixUserId = `@${localPart}:${config.MATRIX_DOMAIN}`;

  const prescriptionCode = str(entry, "hsaPersonPrescriptionCode") || null;
  const phone = str(entry, "telephoneNumber") || null;
  const mobile = str(entry, "mobile") || null;

  return {
    hsaId: hsaId.toUpperCase(),
    matrixUserId,
    displayName,
    givenName: given,
    surname: sn,
    title: str(entry, "hsaTitle", "title"),
    specialty: str(entry, "hsaSpecialityName", "hsaSpecialityCode"),
    organization: str(entry, "organizationName", "o"),
    unit: str(entry, "hsaHealthCareUnitName"),
    unitHsaId: str(entry, "hsaHealthCareUnitHsaId"),
    prescriptionCode,
    phone,
    mobile,
    email: str(entry, "mail"),
    ward: str(entry, "physicalDeliveryOfficeName"),
    avatarUrl: null,
  };
}

// ── LDAP search functions (used as fallback when EK REST API is unavailable) ──

export async function ldapSearchPractitioners(query: string): Promise<HSAPerson[]> {
  const sanitized = query.replace(/[*()\\]/g, "");
  if (sanitized.length < 2) return [];

  // Search across name fields and HSA-ID
  const filter = `(&(objectClass=hsaPerson)(|(cn=*${sanitized}*)(givenName=*${sanitized}*)(sn=*${sanitized}*)(hsaIdentity=${sanitized}*)))`;

  try {
    const results = await withClient(async (client) => {
      const { searchEntries } = await client.search(config.HSA_LDAP_BASE_DN, {
        filter,
        attributes: EK_ATTRIBUTES,
        sizeLimit: 25,
      });
      return searchEntries;
    });

    return results
      .map((e) => mapEntry(e as LDAPEntry))
      .filter((p): p is HSAPerson => p !== null);
  } catch (err) {
    logger.error("LDAP search failed", { query: sanitized, err });
    return [];
  }
}

export async function ldapGetPractitioner(hsaId: string): Promise<HSAPerson | null> {
  const sanitized = hsaId.replace(/[^A-Z0-9\-]/gi, "");

  try {
    const result = await withClient(async (client) => {
      const { searchEntries } = await client.search(config.HSA_LDAP_BASE_DN, {
        filter: `(&(objectClass=hsaPerson)(hsaIdentity=${sanitized}))`,
        attributes: EK_ATTRIBUTES,
        sizeLimit: 1,
      });
      return searchEntries;
    });

    return result[0] ? mapEntry(result[0] as LDAPEntry) : null;
  } catch (err) {
    logger.error("LDAP lookup failed", { hsaId: sanitized, err });
    return null;
  }
}

// ── Public API — EK REST primary, LDAP fallback ───────────────────────────────

import { ekSearch, ekGetPerson } from "./ek.js";

export async function searchPractitioners(query: string): Promise<HSAPerson[]> {
  const cacheKey = `search:${query.toLowerCase()}`;
  const cached = searchCache.get(cacheKey);
  if (cached) return cached;

  // EK REST API first
  let results = await ekSearch(query);

  // LDAP fallback if EK returned nothing
  if (results.length === 0) {
    results = await ldapSearchPractitioners(query);
  }

  searchCache.set(cacheKey, results);
  return results;
}

export async function getPractitioner(hsaId: string): Promise<HSAPerson | null> {
  const cacheKey = `id:${hsaId.toUpperCase()}`;
  const cached = personCache.get(cacheKey);
  if (cached !== undefined) return cached;

  // EK REST API first
  let person = await ekGetPerson(hsaId);

  // LDAP fallback
  if (!person) {
    person = await ldapGetPractitioner(hsaId);
  }

  personCache.set(cacheKey, person);
  return person;
}

export async function getPractitionerByMatrixId(
  matrixUserId: string
): Promise<HSAPerson | null> {
  const match = matrixUserId.match(/^@([^:]+):/);
  if (!match?.[1]) return null;
  const hsaId = match[1].toUpperCase().replace(/_/g, "-");
  return getPractitioner(hsaId);
}
