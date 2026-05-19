import { Client, type SearchResult } from "ldapts";
import fs from "fs";
import { config } from "./config.js";
import { logger } from "./logger.js";

// ── HSA LDAP attribute mappings ───────────────────────────────────────────────
// HSA uses LDAP object classes: hsaPerson, hsaHealthCareProvider, hsaUnit
// Key attributes:
//   hsaIdentity          → HSA-ID (e.g. SE2321000016-ABC1)
//   cn                   → Display name
//   givenName / sn       → First / last name
//   title                → Job title
//   hsaSpecialityCode    → Medical specialty (SNOMED CT)
//   o                    → Organization name
//   hsaHealthCareUnitDN  → Unit DN reference
//   mail                 → Email

export interface HSAPerson {
  hsaId: string;
  matrixUserId: string;   // @hsaid:domain (lowercased, colon replaced)
  displayName: string;
  givenName: string;
  surname: string;
  title: string;
  specialty: string;
  organization: string;
  email: string;
  avatarUrl: string | null;
}

// ── Simple TTL cache ──────────────────────────────────────────────────────────

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

  invalidate(key: string): void {
    this.store.delete(key);
  }
}

const cache = new Cache<HSAPerson[]>();
const personCache = new Cache<HSAPerson | null>();

// ── LDAP client ───────────────────────────────────────────────────────────────

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

// ── Result mapping ────────────────────────────────────────────────────────────

function attr(result: SearchResult, name: string): string {
  const val = result.searchEntries[0]?.[name];
  if (Array.isArray(val)) return String(val[0] ?? "");
  return val != null ? String(val) : "";
}

function mapEntry(entry: SearchResult["searchEntries"][number]): HSAPerson | null {
  const hsaId = String(entry["hsaIdentity"] ?? entry["cn"] ?? "").trim();
  if (!hsaId || !/^SE/i.test(hsaId)) return null;

  const cn = String(entry["cn"] ?? "").trim();
  const given = String(entry["givenName"] ?? "").trim();
  const sn = String(entry["sn"] ?? "").trim();
  const displayName = cn || [given, sn].filter(Boolean).join(" ") || hsaId;

  // Matrix user ID: @se2321000016-abc1:domain.se (lowercased HSA-ID)
  const localPart = hsaId.toLowerCase().replace(/[^a-z0-9._\-]/g, "_");
  const matrixUserId = `@${localPart}:${config.MATRIX_DOMAIN}`;

  return {
    hsaId: hsaId.toUpperCase(),
    matrixUserId,
    displayName,
    givenName: given,
    surname: sn,
    title: String(entry["title"] ?? "").trim(),
    specialty: String(entry["hsaSpecialityCode"] ?? "").trim(),
    organization: String(entry["o"] ?? entry["organizationName"] ?? "").trim(),
    email: String(entry["mail"] ?? "").trim(),
    avatarUrl: null,
  };
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Search practitioners by name or HSA-ID.
 * Returns up to 25 results.
 */
export async function searchPractitioners(query: string): Promise<HSAPerson[]> {
  const cacheKey = `search:${query.toLowerCase()}`;
  const cached = cache.get(cacheKey);
  if (cached) return cached;

  const sanitized = query.replace(/[*()\\]/g, ""); // prevent LDAP injection
  if (sanitized.length < 2) return [];

  const filter = `(|(cn=*${sanitized}*)(givenName=*${sanitized}*)(sn=*${sanitized}*)(hsaIdentity=*${sanitized}*))`;

  try {
    const results = await withClient(async (client) => {
      const { searchEntries } = await client.search(config.HSA_LDAP_BASE_DN, {
        filter,
        attributes: [
          "hsaIdentity", "cn", "givenName", "sn",
          "title", "hsaSpecialityCode", "o", "mail",
        ],
        sizeLimit: 25,
      });
      return searchEntries;
    });

    const persons = results
      .map((e) => mapEntry(e))
      .filter((p): p is HSAPerson => p !== null);

    cache.set(cacheKey, persons);
    return persons;
  } catch (err) {
    logger.error("LDAP search failed", { query: sanitized, err });
    return [];
  }
}

/**
 * Look up a single practitioner by their HSA-ID.
 */
export async function getPractitioner(hsaId: string): Promise<HSAPerson | null> {
  const cacheKey = `id:${hsaId.toUpperCase()}`;
  const cached = personCache.get(cacheKey);
  if (cached !== null) return cached;

  const sanitized = hsaId.replace(/[^A-Z0-9\-]/gi, "");

  try {
    const result = await withClient(async (client) => {
      const { searchEntries } = await client.search(config.HSA_LDAP_BASE_DN, {
        filter: `(hsaIdentity=${sanitized})`,
        attributes: [
          "hsaIdentity", "cn", "givenName", "sn",
          "title", "hsaSpecialityCode", "o", "mail",
        ],
        sizeLimit: 1,
      });
      return searchEntries;
    });

    const person = result[0] ? mapEntry(result[0]) : null;
    personCache.set(cacheKey, person);
    return person;
  } catch (err) {
    logger.error("LDAP lookup failed", { hsaId: sanitized, err });
    return null;
  }
}

/**
 * Resolve a Matrix user ID (@localpart:domain) back to an HSA-ID and look up the person.
 */
export async function getPractitionerByMatrixId(
  matrixUserId: string
): Promise<HSAPerson | null> {
  // Strip @...:<domain> → localpart → reconstruct HSA-ID
  const match = matrixUserId.match(/^@([^:]+):/);
  if (!match?.[1]) return null;
  // Reverse the mapping: se2321000016-abc1 → SE2321000016-ABC1
  const hsaId = match[1].toUpperCase().replace(/_/g, "-");
  return getPractitioner(hsaId);
}
