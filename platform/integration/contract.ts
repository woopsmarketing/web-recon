/**
 * Integration Contract V0.2 — producer-side constants.
 *
 * Normative sources:
 *   - docs/reports/integration/02-integration-contract-v0-candidate.md (FROZEN 2026-09-22) — every
 *     V0 rule the V0.2 candidate does not name survives unchanged; rule ids without a § prefix
 *     (UR2, HT7, VO6, MD3, RV1 …) refer to it;
 *   - docs/reports/integration/07-integration-contract-v0.2-candidate.md — the built-space annex
 *     (§5 projectType, §6 property, §7 workScopes, §8 facets, §9 pricing, §10 shape, §12 validation);
 *   - docs/reports/integration/08-portfolio-media-1.1-addendum.md — the additive record `media`
 *     (document schemaVersion "1.1").
 * This module holds only what the emitter and the validator need; it declares no site.
 */
import {
  PROJECT_TYPES as CONTENT_PROJECT_TYPES,
  PROPERTY_TYPES as CONTENT_PROPERTY_TYPES,
  WORK_SCOPE_IDS as CONTENT_WORK_SCOPE_IDS,
  WORK_SCOPE_SPACE_IDS as CONTENT_WORK_SCOPE_SPACE_IDS,
  WORK_SCOPE_WORK_IDS as CONTENT_WORK_SCOPE_WORK_IDS,
  type ProjectType,
  type PropertyType,
  type WorkScopeId,
} from "../content/schema";

/** §3.1 — fixed manifest location; the resource document file name carries its version (RV5). */
export const INTEGRATION_DIR = "_integration";
export const MANIFEST_FILE = "manifest.json";
export const MANIFEST_PATH = `/${INTEGRATION_DIR}/${MANIFEST_FILE}`;

/**
 * SV1 — the manifest and each resource document carry their own schemaVersion, and they are
 * INDEPENDENT. 07 §3: V0.2 removes and re-shapes portfolio fields, which SV2 classifies as a MAJOR
 * change, so the portfolio document takes major 1 ("1.0"); the manifest gains no field in this
 * release and therefore does NOT move ("0.1"). This is the first time the two diverge. 08 then
 * moves the document to "1.1" (below); the manifest still does not move.
 */
export const CORE_SCHEMA_VERSION = "0.1";
/**
 * Portfolio media 1.1 (docs/reports/integration/08-portfolio-media-1.1-addendum.md, D1): an
 * optional record-level `media` is ADDED, which SV2 classifies as a MINOR change — "1.0" → "1.1".
 * Major 1 is unchanged, so a consumer that checks only the major keeps accepting the document (and
 * drops the field it does not know); a record without `media` is exactly a 1.0 record.
 */
export const PORTFOLIO_SCHEMA_VERSION = "1.1";
export const PORTFOLIO_KIND = "portfolio";

/**
 * Producer (emitter) version — a build input of every opted-in public build (06 A5). Bump it
 * whenever the projection, ordering, serialisation or validation changes, so that a package
 * built by an older emitter is never reported "up-to-date" for the new one.
 * 2 = Contract V0.2 (built-space annex, document schemaVersion "1.0").
 * 3 = Portfolio media 1.1 (record `media`: cover + authored after-gallery; document "1.1") — the
 *     projection and the validation both changed.
 * 4 = Media ownership (docs/work/portfolio-experience-v1/03-media-truth-audit.md): a cover is
 *     exported only when it is attributable to its record, and the gallery is one entry per asset —
 *     the projection changed; the schema, the document schemaVersion "1.1" and the validation did not.
 */
export const PRODUCER_VERSION = 4;

// ------------------------------------------------ built-space annex (07) ----

/**
 * The CLOSED vocabularies of the built-space annex. They are DEFINED in platform/content/schema.ts
 * and re-exported here as the contract-side constants: platform/content is a Template Release
 * runtime source (platform/release/release.ts PLATFORM_RUNTIME_DIRS) and must not import
 * platform/integration, so one definition lives on the content side and the contract names it.
 */
/** 07 §5 — `full_remodel` | `partial_remodel`; absent = breadth not established (PT1). */
export const PROJECT_TYPES = CONTENT_PROJECT_TYPES;
/** 07 §6 — `property.type`; V0's reserved `propertyType` taken up as a structured field (SD1). */
export const PROPERTY_TYPES = CONTENT_PROPERTY_TYPES;
/** 07 §7.3 — the 26 canonical work-scope ids, closed (WS1): the SPACES table then the WORKS table. */
export const WORK_SCOPE_IDS = CONTENT_WORK_SCOPE_IDS;
/** 07 §7.3 spaces — a room or a defined area of the dwelling. INV-29 is stated over this set. */
export const WORK_SCOPE_SPACE_IDS = CONTENT_WORK_SCOPE_SPACE_IDS;
/** 07 §7.3 works — a trade applied across spaces. Trades alone are never a full remodel (PT4c). */
export const WORK_SCOPE_WORK_IDS = CONTENT_WORK_SCOPE_WORK_IDS;
export type { ProjectType, PropertyType, WorkScopeId };
/** 07 §9.2 PA1/PA2 — provenance of a per-area price; required whenever `perArea` is emitted. */
export const PER_AREA_SOURCES = Object.freeze(["authored", "derived"] as const);
/** 07 §9.1 — `total` is exact XOR range, structurally (the `kind` discriminant). */
export const TOTAL_PRICE_KINDS = Object.freeze(["exact", "range"] as const);

/** 07 §9 — a positive amount in the currency's major unit, ≤ 2 fraction digits, ≤ 1e9 (V0 PR1 shape). */
export const PRICE_AMOUNT_MAX = 1_000_000_000;
/** 07 §9.3 RD1 — the integer guard on `round(total.amount * 100)` (total.amount ≤ 1e9). */
export const RD1_TOTAL_MINOR_MAX = 100_000_000_000;
/**
 * 07 §9.3 RD1 — the integer guard on `round(area.value * 100)`. V0's area schema caps the fraction
 * digits but NOT the magnitude, so without an upper bound `area.value * 100` is not guaranteed to
 * be an exact integer; this bound also keeps `2*T + A` far inside the safe-integer range.
 */
export const RD1_AREA_MINOR_MAX = 100_000_000;

// ------------------------------------------------ portfolio media 1.1 (08) ----

/**
 * 08 §2 (D1) — `MediaImage.src` is a same-origin absolute PATH, the way `detailUrl` is: a leading
 * "/", never "//", only unreserved characters, "%" and "/", at most 512 characters in all — so no
 * scheme, no host, no query, no fragment, no backslash. A `..` segment is refused separately by
 * the validator. The consumer resolves it against the document's bound public origin only.
 */
export const MEDIA_SRC_RE = /^\/(?!\/)[A-Za-z0-9._~%\/-]{1,511}$/;
/** 08 §2 — authored alt only, never invented; the content model's own MediaRef cap. */
export const MEDIA_ALT_MAX = 160;
/** 08 §2 — the gallery exports the first N after-images in authored order; totalCount keeps the real count. */
export const MEDIA_GALLERY_MAX = 12;

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

/**
 * §11.3 / 07 §8 — the facet keys this producer emits. `scope` is RETIRED in V0.2 (replaced by the
 * top-level `workScopeIds` + `workScopes`, 07 §7.1); `style` is new (07 §8 ST1).
 */
export const WELL_KNOWN_FACETS = ["category", "style", "tag"] as const;

/**
 * Consumer-declared limits (§11.1 VO6 as changed by CH-R10, 2026-09-22 — PROVISIONAL until the
 * consumer confirms them after measurement). The build WARNS above them (P: SHOULD) and never
 * truncates; the consumer ignores an over-limit facet as a whole.
 *
 * 07 §8: `scope: 150` is RETIRED with the facet. `category: 50` and `tag: 150` are unchanged and
 * consumer-confirmed. `style` has NO consumer-declared limit yet — 150 below is the producer's
 * PROVISIONAL placeholder so that an unbounded style vocabulary still raises a build warning; it
 * is replaced by whatever the consumer declares through the VO6 procedure, and until then no
 * consumer behaviour may be inferred from it.
 */
export const CONSUMER_DECLARED_LIMITS = {
  manifestBytes: 64 * 1024,
  documentBytes: 1024 * 1024,
  records: 1000,
  valuesPerFacet: { category: 50, style: 150, tag: 150 } as Readonly<Record<string, number>>,
} as const;
