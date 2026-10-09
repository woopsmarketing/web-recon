/**
 * ProjectFilter — the canonical, CLOSED filter/search/sort contract for the interior
 * `projects` collection, plus its pure evaluator.
 *
 * One semantics, several callers:
 *   - now:    Template build shapes a compact published index + vocabulary; the static
 *             browser UI evaluates filters client-side over that index.
 *   - later:  an NL parser (e.g. "서울 34평 아파트 리모델링") produces the SAME structured
 *             ProjectFilter, and a retrieval backend reproduces this evaluator over the
 *             same records. Nothing here is React-, URL-, DOM- or storage-specific.
 *
 * Pure and dependency-free — no imports at all (runs in the browser bundle and in Node): no zod, no Intl,
 * no Date objects, no clock. Instants are compared with Date.parse (offset-safe).
 *
 * Semantics (documented in docs/result/recon-template-platform-step4-1-filters/01):
 *   - OR within one dimension, AND across dimensions; an empty dimension = no constraint.
 *   - Buckets are half-open ranges [min, max) in the scale's own unit; a record's value
 *     is converted deterministically (fixed factors, no rounding) — a bucket id is never
 *     stored on a record.
 *   - A missing value never matches a constraint on that dimension (no guessing).
 *   - Price compares only in the scale's currency (no FX): another currency = missing.
 *   - Sorts end with the collection default order (publishedAt DESC, id ASC), so every
 *     result list is total and deterministic; missing sort values go LAST in both
 *     directions.
 */

// ------------------------------------------------------------- contract ----

export type AreaUnit = "m2" | "sqft" | "pyeong";

export const PROJECT_SORTS = ["newest", "oldest", "area-desc", "area-asc", "price-desc", "price-asc"] as const;
export type ProjectSort = (typeof PROJECT_SORTS)[number];
/** The collection default order (identical to the ContentReader "latest" order). */
export const DEFAULT_PROJECT_SORT: ProjectSort = "newest";

/** Filter dimensions a Template may offer (closed). */
export const PROJECT_FILTER_GROUPS = ["keyword", "type", "area", "style", "price"] as const;
export type ProjectFilterGroup = (typeof PROJECT_FILTER_GROUPS)[number];

/**
 * Canonical structured filter. Values are vocabulary ids, never free predicates.
 *   keyword → free text, matched as whitespace-separated tokens (all must match)
 *   type    → category ids (the project's primary classification)
 *   area    → area bucket ids of the vocabulary's area scale
 *   style   → style keywords, in the site's own words (exact)
 *   price   → price bucket ids of the vocabulary's price scale
 */
export interface ProjectFilter {
  keyword: string;
  type: string[];
  area: string[];
  style: string[];
  price: string[];
  sort: ProjectSort;
}

export const EMPTY_PROJECT_FILTER: Readonly<ProjectFilter> = { keyword: "", type: [], area: [], style: [], price: [], sort: DEFAULT_PROJECT_SORT };

/**
 * The only project fields filtering/sorting may read (the compact index carries exactly
 * these). A Project satisfies it structurally; `toProjectFilterRecord` picks them out so
 * that bodies, galleries and customer quotes never reach a public index.
 */
export interface ProjectFilterRecord {
  id: string;
  /** ISO instant; default order key */
  publishedAt: string;
  title: string;
  summary?: string;
  location?: string;
  scope?: readonly string[];
  keywords?: readonly string[];
  category: string;
  area?: { value: number; unit: AreaUnit };
  pricePerArea?: { amount: number; currency: string; unit: AreaUnit };
}

/** Any project-shaped object (a content-schema Project satisfies it structurally). */
export function toProjectFilterRecord(p: ProjectFilterRecord): ProjectFilterRecord {
  const r: ProjectFilterRecord = { id: p.id, publishedAt: p.publishedAt, title: p.title, category: p.category };
  if (p.summary !== undefined) r.summary = p.summary;
  if (p.location !== undefined) r.location = p.location;
  if (p.scope !== undefined) r.scope = [...p.scope];
  if (p.keywords !== undefined && p.keywords.length > 0) r.keywords = [...p.keywords];
  if (p.area !== undefined) r.area = { value: p.area.value, unit: p.area.unit };
  if (p.pricePerArea !== undefined) r.pricePerArea = { amount: p.pricePerArea.amount, currency: p.pricePerArea.currency, unit: p.pricePerArea.unit };
  return r;
}

// --------------------------------------------------- vertical vocabulary ----

/** One bucket: half-open [min, max) in the scale's unit; an absent bound is open. */
export interface FilterBucket {
  id: string;
  min?: number;
  max?: number;
  /** Stable UI label of the bucket (numerals + unit; unit-native wording where the unit is market-specific). */
  label: string;
}
export interface AreaScale {
  id: string;
  unit: AreaUnit;
  buckets: readonly FilterBucket[];
}
export interface PriceScale {
  id: string;
  currency: string;
  /** price is compared per this area unit */
  unit: AreaUnit;
  buckets: readonly FilterBucket[];
}

/** m² per unit. 1 평 = 400/121 m² (definition), 1 sq ft = 0.09290304 m² (definition). */
const M2_PER: Record<AreaUnit, number> = { m2: 1, pyeong: 400 / 121, sqft: 0.09290304 };

/** Area value expressed in `unit` (identity when units match — no float noise). */
export function areaIn(area: { value: number; unit: AreaUnit }, unit: AreaUnit): number {
  return area.unit === unit ? area.value : (area.value * M2_PER[area.unit]) / M2_PER[unit];
}
/** Price per `unit` of area, or undefined when not in `currency` (no FX conversion). */
export function priceIn(price: { amount: number; currency: string; unit: AreaUnit }, currency: string, unit: AreaUnit): number | undefined {
  if (price.currency !== currency) return undefined;
  // amount per 1 source-unit → per 1 m² → per 1 target-unit
  return price.unit === unit ? price.amount : (price.amount / M2_PER[price.unit]) * M2_PER[unit];
}

/**
 * Interior-vertical area scales (Template/vertical code, never site content).
 * Ids are the bucket's lower bound ("lt…" = below the first bound, "…plus" = open upper end).
 */
export const AREA_SCALES = {
  m2: {
    id: "m2",
    unit: "m2",
    buckets: [
      { id: "lt60", max: 60, label: "< 60 m²" },
      { id: "60", min: 60, max: 90, label: "60–90 m²" },
      { id: "90", min: 90, max: 120, label: "90–120 m²" },
      { id: "120", min: 120, max: 150, label: "120–150 m²" },
      { id: "150plus", min: 150, label: "≥ 150 m²" },
    ],
  },
  pyeong: {
    id: "pyeong",
    unit: "pyeong",
    buckets: [
      { id: "lt20", max: 20, label: "20평 미만" },
      { id: "20", min: 20, max: 30, label: "20평대" },
      { id: "30", min: 30, max: 40, label: "30평대" },
      { id: "40", min: 40, max: 50, label: "40평대" },
      { id: "50plus", min: 50, label: "50평 이상" },
    ],
  },
} as const satisfies Record<string, AreaScale>;
export type AreaScaleId = keyof typeof AREA_SCALES;
export const AREA_SCALE_IDS = ["m2", "pyeong"] as const satisfies readonly AreaScaleId[];

/** Interior-vertical price-per-area scales. A scale is currency + unit specific. */
export const PRICE_SCALES = {
  "usd-m2": {
    id: "usd-m2",
    currency: "USD",
    unit: "m2",
    buckets: [
      { id: "lt1500", max: 1500, label: "< USD 1,500 / m²" },
      { id: "1500", min: 1500, max: 2000, label: "USD 1,500–2,000 / m²" },
      { id: "2000", min: 2000, max: 2500, label: "USD 2,000–2,500 / m²" },
      { id: "2500", min: 2500, max: 3000, label: "USD 2,500–3,000 / m²" },
      { id: "3000plus", min: 3000, label: "≥ USD 3,000 / m²" },
    ],
  },
  "krw-pyeong": {
    id: "krw-pyeong",
    currency: "KRW",
    unit: "pyeong",
    buckets: [
      { id: "lt180", max: 1_800_000, label: "평당 180만 원 미만" },
      { id: "180", min: 1_800_000, max: 2_500_000, label: "평당 180–250만 원" },
      { id: "250", min: 2_500_000, max: 3_000_000, label: "평당 250–300만 원" },
      { id: "300", min: 3_000_000, max: 3_500_000, label: "평당 300–350만 원" },
      { id: "350", min: 3_500_000, max: 4_000_000, label: "평당 350–400만 원" },
      { id: "400plus", min: 4_000_000, label: "평당 400만 원 이상" },
    ],
  },
} as const satisfies Record<string, PriceScale>;
export type PriceScaleId = keyof typeof PRICE_SCALES;
export const PRICE_SCALE_IDS = ["usd-m2", "krw-pyeong"] as const satisfies readonly PriceScaleId[];

const inBucket = (v: number, b: FilterBucket) => (b.min === undefined || v >= b.min) && (b.max === undefined || v < b.max);

// ------------------------------------------------------ site vocabulary ----

/**
 * What ONE site's filter UI/backend may offer, derived deterministically from its
 * served records + settings. Only options that match ≥ 1 record are listed, so no
 * control leads to a guaranteed-empty result on its own.
 */
export interface ProjectFilterVocabulary {
  groups: ProjectFilterGroup[];
  /** category id + display name, in taxonomy (id) order */
  types: { id: string; label: string }[];
  area?: AreaScale;
  /** style keywords by frequency DESC, then code-point order */
  styles: string[];
  price?: PriceScale;
  sorts: ProjectSort[];
}

export function buildProjectFilterVocabulary(
  records: readonly ProjectFilterRecord[],
  opts: {
    groups: readonly ProjectFilterGroup[];
    categories: readonly { id: string; name: string }[];
    areaScale: AreaScaleId;
    priceScale: PriceScaleId | "none";
  },
): ProjectFilterVocabulary {
  const on = new Set(opts.groups);
  const used = new Set(records.map((r) => r.category));
  const types = on.has("type")
    ? [...opts.categories]
        .sort((a, b) => cmp(a.id, b.id))
        .filter((c) => used.has(c.id))
        .map((c) => ({ id: c.id, label: c.name }))
    : [];

  let area: AreaScale | undefined;
  const anyArea = records.some((r) => r.area);
  if (on.has("area") && anyArea) {
    const scale = AREA_SCALES[opts.areaScale];
    const buckets = scale.buckets.filter((b) => records.some((r) => r.area && inBucket(areaIn(r.area, scale.unit), b)));
    area = { id: scale.id, unit: scale.unit, buckets };
  }

  const freq = new Map<string, number>();
  for (const r of records) for (const k of r.keywords ?? []) freq.set(k, (freq.get(k) ?? 0) + 1);
  const styles = on.has("style") ? [...freq].sort((a, b) => b[1] - a[1] || cmp(a[0], b[0])).map(([k]) => k) : [];

  // The price scale is also the price SORT basis, so it is kept even when the price
  // filter group is off (buckets are then only listed when the group is on).
  const priceScale = opts.priceScale === "none" ? undefined : PRICE_SCALES[opts.priceScale];
  const priceOf = (r: ProjectFilterRecord) => (priceScale && r.pricePerArea ? priceIn(r.pricePerArea, priceScale.currency, priceScale.unit) : undefined);
  const anyPrice = records.some((r) => priceOf(r) !== undefined);
  const price: PriceScale | undefined =
    priceScale && anyPrice
      ? {
          id: priceScale.id,
          currency: priceScale.currency,
          unit: priceScale.unit,
          buckets: on.has("price")
            ? priceScale.buckets.filter((b) => records.some((r) => {
                const v = priceOf(r);
                return v !== undefined && inBucket(v, b);
              }))
            : [],
        }
      : undefined;

  const sorts: ProjectSort[] = ["newest", "oldest"];
  if (anyArea) sorts.push("area-desc", "area-asc");
  if (price) sorts.push("price-desc", "price-asc");

  const groups = PROJECT_FILTER_GROUPS.filter(
    (g) =>
      on.has(g) &&
      (g === "keyword" ||
        (g === "type" && types.length > 0) ||
        (g === "area" && (area?.buckets.length ?? 0) > 0) ||
        (g === "style" && styles.length > 0) ||
        (g === "price" && (price?.buckets.length ?? 0) > 0)),
  );
  return { groups, types, area, styles, price, sorts };
}

// --------------------------------------------------------- normalizing ----

/** Keyword limits: the search box is a lookup, not a document. */
export const KEYWORD_MAX_LENGTH = 80;
export const KEYWORD_MAX_TOKENS = 8;

/** Display-normal keyword: NFC, whitespace runs → one space, trimmed, length-capped. */
export function normalizeKeyword(raw: string): string {
  // cap by code point (never split a surrogate pair)
  return Array.from(raw.normalize("NFC").replace(/\s+/g, " ").trim()).slice(0, KEYWORD_MAX_LENGTH).join("").trim();
}
/** Match-normal text: keyword-normal + lower-cased (Korean is unaffected). */
export function foldText(raw: string): string {
  return normalizeKeyword(raw).toLowerCase();
}

/** Loose input (URL, UI, a future parser) before vocabulary validation. */
export interface ProjectFilterInput {
  keyword?: string;
  type?: readonly string[];
  area?: readonly string[];
  style?: readonly string[];
  price?: readonly string[];
  sort?: string;
}

/**
 * Input → canonical filter for ONE vocabulary: unknown/unavailable values are dropped,
 * duplicates removed, values put in vocabulary order (stable URLs/keys), keyword
 * normalized, unknown/unavailable sort → default. Idempotent.
 */
export function normalizeProjectFilter(input: ProjectFilterInput, vocab: ProjectFilterVocabulary): ProjectFilter {
  const on = new Set(vocab.groups);
  const pick = (group: ProjectFilterGroup, values: readonly string[] | undefined, allowed: readonly string[]) => {
    if (!on.has(group) || !values?.length) return [];
    const want = new Set(values);
    return allowed.filter((v) => want.has(v));
  };
  const sort = PROJECT_SORTS.find((s) => s === input.sort && vocab.sorts.includes(s)) ?? DEFAULT_PROJECT_SORT;
  return {
    keyword: on.has("keyword") ? normalizeKeyword(input.keyword ?? "") : "",
    type: pick("type", input.type, vocab.types.map((t) => t.id)),
    area: pick("area", input.area, (vocab.area?.buckets ?? []).map((b) => b.id)),
    style: pick("style", input.style, vocab.styles),
    price: pick("price", input.price, (vocab.price?.buckets ?? []).map((b) => b.id)),
    sort,
  };
}

/** Number of active criteria (selected values + a keyword). Sort is not a criterion. */
export function activeCriteriaCount(f: ProjectFilter): number {
  return f.type.length + f.area.length + f.style.length + f.price.length + (f.keyword ? 1 : 0);
}
/** true = the unfiltered default view (the static route order). */
export function isDefaultProjectFilter(f: ProjectFilter): boolean {
  return activeCriteriaCount(f) === 0 && f.sort === DEFAULT_PROJECT_SORT;
}

// ----------------------------------------------------------- evaluating ----

const cmp = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);

/** Fields the keyword search reads (bounded, public, canonical). */
export function keywordHaystack(r: ProjectFilterRecord): string {
  const parts = [r.title, r.summary, r.location, ...(r.scope ?? []), ...(r.keywords ?? [])];
  // "\n" separates fields: a token (no whitespace) can never match across two fields.
  return parts.filter((p): p is string => typeof p === "string").map(foldText).join("\n");
}

function byNewest(a: ProjectFilterRecord, b: ProjectFilterRecord): number {
  const ta = Date.parse(a.publishedAt);
  const tb = Date.parse(b.publishedAt);
  if (ta !== tb) return tb - ta;
  return cmp(a.id, b.id);
}

/** publishedAt ASC; equal instants keep the same id ASC tie-break as the default order. */
function byOldest(a: ProjectFilterRecord, b: ProjectFilterRecord): number {
  const ta = Date.parse(a.publishedAt);
  const tb = Date.parse(b.publishedAt);
  if (ta !== tb) return ta - tb;
  return cmp(a.id, b.id);
}

/** Missing values last in BOTH directions; ties fall back to the default order. */
function byValue<T>(value: (r: T) => number | undefined, dir: 1 | -1, tie: (a: T, b: T) => number) {
  return (a: T, b: T) => {
    const va = value(a);
    const vb = value(b);
    if (va === undefined || vb === undefined) return va === vb ? tie(a, b) : va === undefined ? 1 : -1;
    return va !== vb ? (va - vb) * dir : tie(a, b);
  };
}

/**
 * Filter + sort. Input order does not matter; output order is total and deterministic.
 * The filter should be normalized for `vocab` first (values outside it match nothing).
 */
export function evaluateProjectFilter<T extends ProjectFilterRecord>(records: readonly T[], filter: ProjectFilter, vocab: ProjectFilterVocabulary): T[] {
  const areaBuckets = (vocab.area?.buckets ?? []).filter((b) => filter.area.includes(b.id));
  const priceBuckets = (vocab.price?.buckets ?? []).filter((b) => filter.price.includes(b.id));
  const types = new Set(filter.type);
  const styles = new Set(filter.style);
  const tokens = foldText(filter.keyword).split(" ").filter(Boolean).slice(0, KEYWORD_MAX_TOKENS);
  const areaOf = (r: T) => (r.area && vocab.area ? areaIn(r.area, vocab.area.unit) : undefined);
  const priceOf = (r: T) => (r.pricePerArea && vocab.price ? priceIn(r.pricePerArea, vocab.price.currency, vocab.price.unit) : undefined);

  const out = records.filter((r) => {
    if (filter.type.length && !types.has(r.category)) return false;
    if (filter.area.length) {
      const v = areaOf(r);
      if (v === undefined || !areaBuckets.some((b) => inBucket(v, b))) return false;
    }
    if (filter.style.length && !(r.keywords ?? []).some((k) => styles.has(k))) return false;
    if (filter.price.length) {
      const v = priceOf(r);
      if (v === undefined || !priceBuckets.some((b) => inBucket(v, b))) return false;
    }
    if (tokens.length) {
      const hay = keywordHaystack(r);
      if (!tokens.every((t) => hay.includes(t))) return false;
    }
    return true;
  });

  const areaM2 = (r: T) => (r.area ? areaIn(r.area, "m2") : undefined);
  switch (filter.sort) {
    case "newest":
      return out.sort(byNewest);
    case "oldest":
      return out.sort(byOldest);
    case "area-desc":
      return out.sort(byValue(areaM2, -1, byNewest));
    case "area-asc":
      return out.sort(byValue(areaM2, 1, byNewest));
    case "price-desc":
      return out.sort(byValue(priceOf, -1, byNewest));
    case "price-asc":
      return out.sort(byValue(priceOf, 1, byNewest));
    default: {
      const never: never = filter.sort;
      throw new Error(`unsupported sort ${String(never)}`);
    }
  }
}

/** One page of a result list; `page` is clamped into 1…pageCount (pageCount ≥ 1). */
export function pageOfResults<T>(items: readonly T[], page: number, pageSize: number) {
  const pageCount = Math.max(1, Math.ceil(items.length / pageSize));
  const p = Number.isInteger(page) ? Math.min(Math.max(page, 1), pageCount) : 1;
  return { items: items.slice((p - 1) * pageSize, p * pageSize), page: p, pageCount, total: items.length };
}
