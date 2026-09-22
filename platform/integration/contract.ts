/**
 * Integration Contract V0 — producer-side constants.
 *
 * Normative source: docs/reports/integration/02-integration-contract-v0-candidate.md (FROZEN
 * 2026-09-22, schemaVersion "0.1"). Rule ids in comments (§3.1, UR2, HT7, VO6, …) refer to it.
 * This module holds only what the emitter and the validator need; it declares no site.
 */

/** §3.1 — fixed manifest location; the resource document file name carries its version (RV5). */
export const INTEGRATION_DIR = "_integration";
export const MANIFEST_FILE = "manifest.json";
export const MANIFEST_PATH = `/${INTEGRATION_DIR}/${MANIFEST_FILE}`;

/** §14 SV1 — the manifest and each resource document carry their own schemaVersion. V0 = "0.1". */
export const CORE_SCHEMA_VERSION = "0.1";
export const PORTFOLIO_SCHEMA_VERSION = "0.1";
export const PORTFOLIO_KIND = "portfolio";

/**
 * Producer (emitter) version — a build input of every opted-in public build (06 A5). Bump it
 * whenever the projection, ordering, serialisation or validation changes, so that a package
 * built by an older emitter is never reported "up-to-date" for the new one.
 */
export const PRODUCER_VERSION = 1;

/** §7.1 site.id · §7.3 record.id (≤ 64) — the platform's own RecordId / siteId shape. */
export const CONTRACT_ID_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
export const CONTRACT_ID_MAX = 64;
/** §7.1 / §15 RV1 */
export const VERSION_RE = /^[A-Za-z0-9._-]{1,80}$/;
/** §11.1 VO4 (also used for resource kind names) */
export const FACET_KEY_RE = /^[a-z][a-zA-Z0-9]{0,31}$/;
export const TITLE_MAX = 120;
export const LOCATION_MAX = 80;
export const FACET_ID_MAX = 64;
export const FACET_LABEL_MAX = 40;
/** §9 AR1 · §10 PR1 */
export const AREA_UNITS = ["m2", "sqft", "pyeong"] as const;
/** §9 AR2 — "unknown" is never emitted: absent basis = omitted key. */
export const AREA_BASES = ["supply", "exclusive"] as const;
export const CURRENCY_RE = /^[A-Z]{3}$/;

/** §16 HT7 — forbidden in every string of every document; a hit fails the build (§4). */
export const FORBIDDEN_CHAR_RE = new RegExp("[\\u0000-\\u001F\\u007F-\\u009F\\u2028\\u2029\\u202A-\\u202E\\u2066-\\u2069]", "u");

/** §11.3 well-known facet keys emitted by this producer (V0). */
export const WELL_KNOWN_FACETS = ["category", "scope", "tag"] as const;

/**
 * Consumer-declared limits (§11.1 VO6 as changed by CH-R10, 2026-09-22 — PROVISIONAL until the
 * consumer confirms them after measurement). The build WARNS above them (P: SHOULD) and never
 * truncates; the consumer ignores an over-limit facet as a whole.
 */
export const CONSUMER_DECLARED_LIMITS = {
  manifestBytes: 64 * 1024,
  documentBytes: 1024 * 1024,
  records: 1000,
  valuesPerFacet: { category: 50, scope: 150, tag: 150 } as Readonly<Record<string, number>>,
} as const;
