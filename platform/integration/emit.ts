import { z } from "zod";
import type { MediaRef, Project } from "../content/schema";
import type { SiteSnapshot } from "../site/instance";
import { hashJson, sha256 } from "../util/hash";
import {
  AREA_BASES,
  CORE_SCHEMA_VERSION,
  INTEGRATION_DIR,
  MANIFEST_FILE,
  MEDIA_GALLERY_MAX,
  PER_AREA_SOURCES,
  PORTFOLIO_KIND,
  PORTFOLIO_SCHEMA_VERSION,
  PRICE_AMOUNT_MAX,
  RD1_AREA_MINOR_MAX,
  RD1_TOTAL_MINOR_MAX,
  WORK_SCOPE_IDS,
  type ProjectType,
  type PropertyType,
  type WorkScopeId,
} from "./contract";

/**
 * Integration emitter — PURE (no filesystem, no clock, no env):
 *
 *   (SiteSnapshot, the release's declared routes, the preflight route plan)
 *     → { manifest, portfolio document, serialised files }
 *
 * Projection rules (02 §6–§11, 06 A1–A3, the V0.2 built-space annex of 07 §5–§11, and the
 * portfolio media 1.1 addendum 08):
 *   - explicit allowlist: id · title · detailUrl · publishedAt · location · projectType ·
 *     property{type, area} · workScopeIds · pricing{total, perArea} · facets{category, style, tag} ·
 *     media{cover, gallery, totalCount}. Nothing else of a Project leaves (no summary/body/quote/
 *     slug/status/builtYear/period/duration, no before-image — and no `scope`: the free-text scope
 *     FACET is retired, 07 §8).
 *   - media (08, presentation only): `cover` = the authored cover WHEN it is attributable to the
 *     record (MEDIA OWNERSHIP, below); `gallery` = the authored AFTER images (galleryGroups[].items[]
 *     .image) in authored order, one entry per asset (first occurrence wins), the first 12;
 *     `totalCount` = how many distinct after images there are. src/width/height come from the
 *     snapshot's asset table (the same entries the Template's AssetResolver resolves), alt only when
 *     authored. Nothing else is a media source (no og:image, no site hero, no logo, no section
 *     image), and media feeds no facet.
 *   - MEDIA OWNERSHIP (docs/work/portfolio-experience-v1/03-media-truth-audit.md): a record carries
 *     an image only when the snapshot itself shows the image belongs to THAT record — no image is
 *     better than another job's photo. Mechanical, per asset id, no hardcoded ids.
 *   - missing = omitted. Never null, never a placeholder, never `[]` outside `records` (MD3, WS5).
 *     `basis` only when supply | exclusive (absent or "unknown" → no key). `property` / `pricing`
 *     are omitted entirely when empty (MD4).
 *   - no conversion, no inference, no totals (ND1, TP3/PR5). The ONE declared derivation is D-1,
 *     the per-area price of §9.3 — integer-only (RD1), provenance-carrying, guard-failure → omit.
 *   - records by id, facet values by id, `workScopes` by id: Unicode code point order (not
 *     localeCompare, not the UTF-16 default sort). A record's `workScopeIds`, `style` and `tag`
 *     arrays keep the authored order, first occurrence wins. `tag` is the authored `keywords`
 *     minus the authored `styles`, which makes the two facets disjoint by construction (ST4).
 *   - version = sha256(canonical sorted-key JSON of the document without `version`)[0:32].
 *   - serialisation: compact JSON, UTF-8 without BOM, the key order of 02 §5 / 07 §10.
 * Failures (no https origin, no single item route, a record without a planned detail page) throw
 * IntegrationError — the caller fails the build; nothing is skipped silently (02 §4).
 */

export class IntegrationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "IntegrationError";
  }
}

/** One planned route as the release's preflight prints it. */
export interface PlannedRoute {
  key: string;
  pattern: string;
  paths: string[];
}

export interface FacetValue {
  id: string;
  label: string;
}
/** 07 §9.1 — exact XOR range, structurally. */
export type TotalPrice = { kind: "exact"; amount: number; currency: string } | { kind: "range"; minAmount: number; maxAmount: number; currency: string };
/** 07 §9.2 — V0's `pricePerArea` plus its provenance (PA1 authored / PA2 derived). */
export type PerAreaSource = (typeof PER_AREA_SOURCES)[number];
export interface PerAreaPrice {
  amount: number;
  currency: string;
  perUnit: string;
  source: PerAreaSource;
}
/** 08 §2 — one image: a same-origin path, the authored alt (if any), the registry's pixel size. */
export interface MediaImage {
  src: string;
  alt?: string;
  width?: number;
  height?: number;
}
/** 08 §2 — presentation only; `hasMore` is never emitted (it is `totalCount > gallery.length`). */
export interface PortfolioMedia {
  cover?: MediaImage;
  gallery?: MediaImage[];
  totalCount?: number;
}
export interface PortfolioRecord {
  id: string;
  title: string;
  detailUrl: string;
  publishedAt?: string;
  location?: string;
  projectType?: ProjectType;
  property?: { type?: PropertyType; area?: { value: number; unit: string; basis?: string } };
  workScopeIds?: WorkScopeId[];
  pricing?: { total?: TotalPrice; perArea?: PerAreaPrice };
  facets?: Record<string, string[]>;
  media?: PortfolioMedia;
}
export interface PortfolioDocument {
  schemaVersion: string;
  resource: typeof PORTFOLIO_KIND;
  version: string;
  listingUrl?: string;
  /** 07 §7.2 — a plain id array, sorted, closed both ways (WS2); omitted when no record has one. */
  workScopes?: WorkScopeId[];
  facets?: Record<string, { values: FacetValue[] }>;
  records: PortfolioRecord[];
}
export interface IntegrationManifest {
  schemaVersion: string;
  site: { id: string; publicOrigin: string; locale: string };
  resources: Record<string, { href: string; version: string }>;
}
export interface EmittedFile {
  /** package-relative path, e.g. "_integration/manifest.json" */
  path: string;
  text: string;
  bytes: Uint8Array;
  sha256: string;
}
export interface PortfolioEmission {
  document: PortfolioDocument;
  version: string;
  file: EmittedFile;
  recordCount: number;
  /** facet key → number of declared values */
  facetCounts: Record<string, number>;
  /**
   * 07 §9.3 / VA1 — the ONE warn-and-omit case: a D-1 derivation whose RD1 guards failed. The
   * build must not fail (emitting nothing is the correct answer there) but the data is worth
   * looking at, so the warning travels out with the emission and the validator merges it into the
   * build's warnings, exactly like a VO6 over-limit warning.
   */
  warnings: string[];
}
export interface IntegrationEmission {
  manifest: IntegrationManifest;
  manifestFile: EmittedFile;
  /**
   * undefined = the release declares NO public detail page per record, so the portfolio resource
   * is not offered (02 §4: omitted from manifest.resources → consumer state CONFIRMED OFF (resource));
   * the emission is then the manifest alone with `resources: {}` (§5).
   */
  portfolio: PortfolioEmission | undefined;
  /** every file to place in the package, manifest first */
  files: EmittedFile[];
}

/**
 * The declared-route shape the builder accepts from a release's template manifest (validated, never
 * trusted). Deliberately LENIENT — like `normalizePreflight` in the builder — because the builder is
 * not part of any release and must accept every shape a still-buildable release prints: unknown keys
 * are dropped, collections and page kinds are free strings; the emitter picks only what it needs.
 */
export const DeclaredRoutesSchema = z.array(
  z.union([
    z.object({ key: z.string().min(1), path: z.string().min(1), list: z.object({ collection: z.string().min(1), page: z.string().min(1) }) }),
    z.object({ key: z.string().min(1), path: z.string().min(1), item: z.object({ collection: z.string().min(1) }) }),
    z.object({ key: z.string().min(1), path: z.string().min(1) }),
  ]),
);
export type DeclaredRoute = z.output<typeof DeclaredRoutesSchema>[number];
type ItemRoute = Extract<DeclaredRoute, { item: unknown }>;
type ListRoute = Extract<DeclaredRoute, { list: unknown }>;

/** Unicode code point order (02 §6.1). `<` on strings is UTF-16 code unit order and differs outside the BMP. */
export function compareCodePoints(a: string, b: string): number {
  const ca = Array.from(a);
  const cb = Array.from(b);
  const n = Math.min(ca.length, cb.length);
  for (let i = 0; i < n; i++) {
    const d = ca[i]!.codePointAt(0)! - cb[i]!.codePointAt(0)!;
    if (d !== 0) return d;
  }
  return ca.length - cb.length;
}

/** authored order, first occurrence wins (02 §6.1 / INV-14) */
function dedupe(values: readonly string[]): string[] {
  const out: string[] = [];
  for (const v of values) if (!out.includes(v)) out.push(v);
  return out;
}

const DYNAMIC_SEG = /^\[([a-z][a-zA-Z0-9]*)\]$/;

/**
 * The declared routes that address portfolio records (02 §4, 06 A3):
 *   - exactly ONE item route over "projects" → the resource is offered (detailUrl = that route);
 *   - NONE → the site provides no public detail page per record → the resource is NOT offered
 *     (undefined; the manifest then carries `resources: {}`) — not a failure;
 *   - two or more → the detail page is ambiguous → emission is impossible → the build fails.
 */
export function portfolioRoutes(declared: readonly DeclaredRoute[]): { item: ItemRoute; list: ListRoute | undefined } | undefined {
  const items = declared.filter((r): r is ItemRoute => "item" in r && r.item.collection === "projects");
  if (items.length === 0) return undefined;
  if (items.length > 1) {
    throw new IntegrationError(`ambiguous detail page: the Template declares ${items.length} item routes over "projects" (a record must have exactly one)`);
  }
  const lists = declared.filter((r): r is ListRoute => "list" in r && r.list.collection === "projects" && r.list.page === "first");
  if (lists.length > 1) throw new IntegrationError(`ambiguous listing page: ${lists.length} first-page list routes over "projects"`);
  return { item: items[0]!, list: lists[0] };
}

function itemPath(pattern: string, slug: string): string {
  return `/${pattern
    .slice(1)
    .split("/")
    .map((s) => (DYNAMIC_SEG.test(s) ? slug : s))
    .join("/")}`;
}

function serialize(value: unknown): Omit<EmittedFile, "path"> {
  const text = JSON.stringify(value);
  const bytes = new TextEncoder().encode(text);
  return { text, bytes, sha256: sha256(bytes) };
}

/** 02 §15 (informative method): the document without `version`, canonical sorted-key JSON, sha256, first 32 hex. */
export function portfolioVersion(document: Omit<PortfolioDocument, "version"> | PortfolioDocument): string {
  const { version: _drop, ...body } = document as PortfolioDocument;
  void _drop;
  return hashJson(body).slice(0, 32);
}

/**
 * 07 §9.3 **D-1 · the one permitted derivation** (ND2), and the ONLY place in this producer that
 * computes a value instead of copying one.
 *
 * Emitted **if and only if** all five conditions hold:
 *   1. `projectType == "full_remodel"` — by PT2 the area and the total then describe the same
 *      thing. **D-1a**: never for `partial_remodel` and never when `projectType` is ABSENT. *A 34평
 *      flat whose bathroom cost 6,000,000 has no per-area price*; `6,000,000 / 34` is meaningless
 *      and is the single most important prohibition in V0.2.
 *   2. `total.kind == "exact"` — a range has no single right answer.
 *   3. `property.area.value` and `.unit` are present.
 *   4. no AUTHORED `perArea` — authored always wins (PA1, INV-21). The caller only reaches this
 *      function when `p.pricePerArea` is absent, so no authored value can be replaced.
 *   5. the RD1 guards below hold.
 *
 * **RD1 — integer arithmetic only.** Floating-point division is not reproducible across platforms
 * and would break INV-1 / INV-26. The guards bound both inputs (`T ≤ 1e11`, `1 ≤ A ≤ 1e8`) so that
 * `T` and `A` are EXACT integers — the area schema caps fraction digits but not magnitude, which is
 * why `A` needs its own ceiling — and `2*T + A ≤ ~2e11 ≪ 2^53`. `(2*T + A) / (2*A)` is therefore a
 * division of two exactly representable integers whose quotient is correctly rounded to within
 * `N * 2^-53 < 1` of the true value, so `Math.floor` of it is the exact integer floor, i.e.
 * round-half-up of `T/A`.
 *
 * `perUnit` is the record's own `area.unit`, NEVER converted (AR3/AR4); `currency` is the total's.
 * There is no path from `perArea × area` to a total (D-1b / TP3 / PR5) and none from a non-
 * `full_remodel` record to a derived price (D-1a): both are refused before any arithmetic runs.
 *
 * A guard failure emits NO `perArea` and one warning — the build does not fail (07 §9.3, VA1).
 */
export function derivePerArea(
  input: { projectType?: ProjectType; total?: TotalPrice; area?: { value: number; unit: string } },
  onGuardFailure: (why: string) => void,
): PerAreaPrice | undefined {
  const { projectType, total, area } = input;
  if (projectType !== "full_remodel") return undefined; // D-1a — also covers `projectType` absent
  if (!total || total.kind !== "exact") return undefined;
  if (!area || typeof area.value !== "number" || typeof area.unit !== "string") return undefined;

  const T = Math.round(total.amount * 100);
  const A = Math.round(area.value * 100);
  if (!Number.isSafeInteger(T) || !Number.isSafeInteger(A) || A < 1 || A > RD1_AREA_MINOR_MAX || T < 1 || T > RD1_TOTAL_MINOR_MAX) {
    onGuardFailure(`RD1 input guard: total ${total.amount} ${total.currency} / area ${area.value} ${area.unit} (T=${T}, A=${A})`);
    return undefined;
  }
  const amount = Math.floor((2 * T + A) / (2 * A)); // round half up, integer major unit
  if (!(amount >= 1 && amount <= PRICE_AMOUNT_MAX)) {
    onGuardFailure(`RD1 output guard: ${amount} is outside 1..${PRICE_AMOUNT_MAX} (total ${total.amount} ${total.currency} / area ${area.value} ${area.unit})`);
    return undefined;
  }
  return { amount, currency: total.currency, perUnit: area.unit, source: "derived" };
}

/** 07 §9.1 — copied from the authored total, in the contract's key order. Never computed (TP3). */
function totalOf(t: NonNullable<Project["totalPrice"]>): TotalPrice {
  return t.kind === "exact"
    ? { kind: "exact", amount: t.amount, currency: t.currency }
    : { kind: "range", minAmount: t.minAmount, maxAmount: t.maxAmount, currency: t.currency };
}

/**
 * 08 §2 — one MediaImage from an authored MediaRef. The asset is looked up in the SNAPSHOT's asset
 * table (every referenced asset, with its content-addressed publicPath and the registry's
 * width/height — exactly what createAssetResolver hands the Template), never on disk, never by URL.
 * An unknown asset fails closed. Key order: src · alt · width · height.
 */
function mediaImage(ref: MediaRef, assets: ReadonlyMap<string, SiteSnapshot["assets"][number]>, at: string): MediaImage {
  const a = assets.get(ref.asset);
  if (!a) throw new IntegrationError(`${at}: asset "${ref.asset}" is not in the site snapshot`);
  const img: MediaImage = { src: a.publicPath };
  // authored alt only — never invented, never a placeholder: "" / absent → no key (MD2)
  if (ref.alt !== undefined && ref.alt !== "") img.alt = ref.alt;
  img.width = a.width;
  img.height = a.height;
  return img;
}

/** Every asset a record authors: cover, after images, before images (the MEDIA OWNERSHIP inputs). */
function referencedAssets(p: Project): string[] {
  const groups = p.galleryGroups ?? [];
  return [...(p.cover ? [p.cover.asset] : []), ...groups.flatMap((g) => g.items.flatMap((item) => (item.before ? [item.image.asset, item.before.asset] : [item.image.asset])))];
}

/**
 * MEDIA OWNERSHIP (03-media-truth-audit) — asset id → the ids of the snapshot records that reference
 * it at all (cover · after · before). Read by `attributable` only.
 */
function assetReferrers(projects: readonly Project[]): Map<string, Set<string>> {
  const referrers = new Map<string, Set<string>>();
  for (const p of projects) {
    for (const asset of referencedAssets(p)) {
      const ids = referrers.get(asset) ?? new Set<string>();
      ids.add(p.id);
      referrers.set(asset, ids);
    }
  }
  return referrers;
}

/**
 * MEDIA OWNERSHIP — the assets the snapshot's NON-project content uses: banner images, the site
 * logo, media slot values. Exactly the non-project references the snapshot builder resolves into the
 * asset table (platform/site/load.ts); a site-level image is never a record's own photo.
 */
function siteAssets(snapshot: SiteSnapshot): Set<string> {
  const used = new Set<string>();
  for (const b of snapshot.content.banners ?? []) used.add(b.image.asset);
  if (snapshot.site.identity.logo) used.add(snapshot.site.identity.logo);
  for (const section of Object.values(snapshot.slots?.values ?? {})) {
    for (const v of Object.values(section)) {
      const asset = (v as { asset?: unknown } | null)?.asset;
      if (typeof asset === "string") used.add(asset);
    }
  }
  return used;
}

/**
 * MEDIA OWNERSHIP — an asset is attributable to record R iff
 *   (a) it is in R's OWN galleryGroups (an after or a before image), or
 *   (b) R is the ONLY record of the snapshot that references it at all (cover · after · before)
 *       AND no non-project content (banner, logo, slot image) uses it.
 * A cover that is another record's gallery photo, one several records share, or a site-level image
 * is none of these: it is not evidence about R, so it is not exported (the consumer falls back to
 * a text card). (a) is explicit authoring, so it holds even when another record also names the asset.
 */
function attributable(p: Project, asset: string, referrers: ReadonlyMap<string, ReadonlySet<string>>, siteUsed: ReadonlySet<string>): boolean {
  const own = (p.galleryGroups ?? []).some((g) => g.items.some((item) => item.image.asset === asset || item.before?.asset === asset));
  if (own) return true;
  const ids = referrers.get(asset);
  return ids !== undefined && ids.size === 1 && ids.has(p.id) && !siteUsed.has(asset);
}

/**
 * 08 §2–§3 — a record's media: `{ cover }` when the cover is attributable (MEDIA OWNERSHIP), plus
 * `gallery` + `totalCount` when the record authors any after image. The gallery is the record's own
 * galleryGroups, so every entry is attributable by (a); a repeated asset is exported once (authored
 * order, first occurrence wins) and counted once. `before` images are not exported and not counted
 * (V1: they sit behind a toggle on the canonical page and are not the primary gallery). undefined
 * when there is nothing (never `{}`, MD-8).
 */
function projectMedia(
  p: Project,
  assets: ReadonlyMap<string, SiteSnapshot["assets"][number]>,
  referrers: ReadonlyMap<string, ReadonlySet<string>>,
  siteUsed: ReadonlySet<string>,
): PortfolioMedia | undefined {
  const media: PortfolioMedia = {};
  if (p.cover) {
    // resolved first: an unknown cover asset fails closed even when the cover is not exported
    const cover = mediaImage(p.cover, assets, `record "${p.id}" cover`);
    if (attributable(p, p.cover.asset, referrers, siteUsed)) media.cover = cover;
  }
  const after: MediaRef[] = [];
  for (const g of p.galleryGroups ?? []) for (const item of g.items) if (!after.some((ref) => ref.asset === item.image.asset)) after.push(item.image);
  if (after.length > 0) {
    media.gallery = after.slice(0, MEDIA_GALLERY_MAX).map((ref, i) => mediaImage(ref, assets, `record "${p.id}" gallery[${i}]`));
    media.totalCount = after.length;
  }
  return Object.keys(media).length > 0 ? media : undefined;
}

export function projectPortfolio(snapshot: SiteSnapshot, routes: { item: ItemRoute; list: ListRoute | undefined }, planned: readonly PlannedRoute[]): PortfolioEmission {
  const { item, list } = routes;
  const itemPlan = planned.find((r) => r.key === item.key);
  if (!itemPlan) throw new IntegrationError(`the route plan has no entry for the item route "${item.key}"`);
  const plannedItemPaths = new Set(itemPlan.paths);
  const categories = new Map(snapshot.content.categories.map((c) => [c.id, c.name]));
  const vocabulary = new Set<string>(WORK_SCOPE_IDS);
  const warnings: string[] = [];
  const usedWorkScopes = new Set<WorkScopeId>();
  const assets = new Map(snapshot.assets.map((a) => [a.id, a]));
  // MEDIA OWNERSHIP — over the whole snapshot, before any record is projected (record order is
  // irrelevant: the rule reads reference counts only).
  const referrers = assetReferrers(snapshot.content.projects);
  const siteUsed = siteAssets(snapshot);

  // 07 §8 — the facet keys of V0.2: `scope` is retired, `style` is new. Key order is code point
  // ascending (02 §6.1); these three already are.
  const used: Record<string, Map<string, string>> = { category: new Map(), style: new Map(), tag: new Map() };
  const records = [...snapshot.content.projects]
    .sort((a, b) => compareCodePoints(a.id, b.id))
    .map((p): PortfolioRecord => {
      const detailUrl = itemPath(item.path, p.slug);
      if (!plannedItemPaths.has(detailUrl)) throw new IntegrationError(`record "${p.id}": its detail page ${detailUrl} is not in the route plan`);
      const rec: PortfolioRecord = { id: p.id, title: p.title, detailUrl };
      if (p.publishedAt !== undefined) rec.publishedAt = p.publishedAt;
      if (p.location !== undefined) rec.location = p.location;
      // ---- built-space annex, in the key order of 07 §10 ----
      if (p.projectType !== undefined) rec.projectType = p.projectType;
      // `area` MOVES under `property`, value/unit/basis unchanged (07 §6, AR1–AR6). `property` is
      // omitted entirely when both sub-fields are absent (MD4).
      const property: NonNullable<PortfolioRecord["property"]> = {};
      if (p.propertyType !== undefined) property.type = p.propertyType;
      if (p.area) {
        property.area = { value: p.area.value, unit: p.area.unit };
        if ((AREA_BASES as readonly string[]).includes(p.area.basis ?? "")) property.area.basis = p.area.basis;
      }
      if (Object.keys(property).length > 0) rec.property = property;
      if (p.workScopeIds && p.workScopeIds.length > 0) {
        const ids = dedupe(p.workScopeIds) as WorkScopeId[]; // authored order, first occurrence wins
        for (const id of ids) {
          if (!vocabulary.has(id)) throw new IntegrationError(`record "${p.id}": work scope "${id}" is not in the contract vocabulary (WS1, 07 §7.3)`);
          usedWorkScopes.add(id);
        }
        rec.workScopeIds = ids;
      }
      // `pricePerArea` MOVES to `pricing.perArea` and gains provenance; `pricing` is omitted when
      // both sub-fields are absent (MD4).
      const pricing: NonNullable<PortfolioRecord["pricing"]> = {};
      if (p.totalPrice) pricing.total = totalOf(p.totalPrice);
      if (p.pricePerArea) {
        // PA1/INV-21 — an authored per-area price is copied as authored and NEVER replaced: no
        // derivation is even attempted for this record.
        pricing.perArea = { amount: p.pricePerArea.amount, currency: p.pricePerArea.currency, perUnit: p.pricePerArea.unit, source: "authored" };
      } else {
        const derived = derivePerArea({ projectType: p.projectType, total: pricing.total, area: p.area }, (why) =>
          warnings.push(`record "${p.id}": no derived per-area price — ${why} (D-1, 07 §9.3)`),
        );
        if (derived) pricing.perArea = derived;
      }
      if (Object.keys(pricing).length > 0) rec.pricing = pricing;

      const label = categories.get(p.category);
      if (label === undefined) throw new IntegrationError(`record "${p.id}": category "${p.category}" is not in the snapshot`);
      const facets: Record<string, string[]> = { category: [p.category] };
      used.category!.set(p.category, label);
      // 07 §8 — `style` comes from the AUTHORED `styles` field only (never computed from the
      // keywords), and `tag` is the authored `keywords` MINUS whatever the operator marked as a
      // style. `styles` is normally a SUBSET of `keywords` — the operator tags 화이트 once and then
      // marks it as a style — so the subtraction is what makes ST4 / INV-24 (no value in both
      // facets) true BY CONSTRUCTION. It is mechanical, not an inference: it adds no value and
      // reclassifies nothing (ND1 untouched). Empty result → the key is omitted, never `[]` (MD3).
      const styles = p.styles && p.styles.length > 0 ? dedupe(p.styles) : [];
      if (styles.length > 0) {
        facets.style = styles;
        for (const v of styles) used.style!.set(v, v);
      }
      const tags = p.keywords && p.keywords.length > 0 ? dedupe(p.keywords).filter((k) => !styles.includes(k)) : [];
      if (tags.length > 0) {
        facets.tag = tags;
        for (const v of tags) used.tag!.set(v, v);
      }
      rec.facets = facets;
      // 08 — presentation only, last in the record; read by nothing above (no facet, no ordering).
      const media = projectMedia(p, assets, referrers, siteUsed);
      if (media) rec.media = media;
      return rec;
    });

  // WS2 — closed both ways: exactly the ids the records use, id ascending in code point order.
  const workScopes = [...usedWorkScopes].sort(compareCodePoints);

  const facets: NonNullable<PortfolioDocument["facets"]> = {};
  const facetCounts: Record<string, number> = {};
  for (const key of Object.keys(used).sort(compareCodePoints)) {
    const m = used[key]!;
    if (m.size === 0) continue;
    facets[key] = { values: [...m.keys()].sort(compareCodePoints).map((id) => ({ id, label: m.get(id)! })) };
    facetCounts[key] = m.size;
  }

  // ST6 (07 §8, AUTHORING rule — not machine-checked, not a VA1 condition — "P: SHOULD warn at
  // build") — `ST4` subtracts PER RECORD, so if one record classifies a word as a style and
  // another leaves it an ordinary keyword, the DOCUMENT-level `facets.style.values` and
  // `facets.tag.values` can both declare it even though no single record carries it in both
  // (`INV-24` is per record only — see 07 §8 ST6). That is inconsistent authoring, not a contract
  // violation: it must never fail the build and must never change a single emitted byte — this
  // warning is `ST6`'s only feedback channel. Read-only over the already-built `facets` maps.
  const styleIds = new Set((facets.style?.values ?? []).map((v) => v.id));
  const inBothStyleAndTag = (facets.tag?.values ?? [])
    .map((v) => v.id)
    .filter((id) => styleIds.has(id))
    .sort(compareCodePoints);
  if (inBothStyleAndTag.length > 0) {
    warnings.push(`facets: ${inBothStyleAndTag.map((v) => `"${v}"`).join(", ")} appear in both facets.style.values and facets.tag.values (ST6, 07 §8)`);
  }

  // The listing page exists only when the collection has ≥ 1 served item (route plan); §7.2: omitted with zero records.
  const listPlan = list ? planned.find((r) => r.key === list.key) : undefined;
  const listingUrl = records.length > 0 && listPlan && listPlan.paths.length === 1 ? listPlan.paths[0] : undefined;

  const body: Omit<PortfolioDocument, "version"> = {
    schemaVersion: PORTFOLIO_SCHEMA_VERSION,
    resource: PORTFOLIO_KIND,
    ...(listingUrl !== undefined ? { listingUrl } : {}),
    ...(workScopes.length > 0 ? { workScopes } : {}),
    ...(Object.keys(facets).length > 0 ? { facets } : {}),
    records,
  };
  const version = portfolioVersion(body);
  const document: PortfolioDocument = {
    schemaVersion: body.schemaVersion,
    resource: body.resource,
    version,
    ...(listingUrl !== undefined ? { listingUrl } : {}),
    ...(body.workScopes ? { workScopes: body.workScopes } : {}),
    ...(body.facets ? { facets: body.facets } : {}),
    records,
  };
  const file: EmittedFile = { path: `${INTEGRATION_DIR}/${PORTFOLIO_KIND}.${version}.json`, ...serialize(document) };
  return { document, version, file, recordCount: records.length, facetCounts, warnings };
}

export function emitIntegration(input: {
  snapshot: SiteSnapshot;
  declaredRoutes: readonly DeclaredRoute[];
  plannedRoutes: readonly PlannedRoute[];
}): IntegrationEmission {
  const { snapshot } = input;
  const origin = snapshot.site.identity.publicOrigin;
  if (!origin) throw new IntegrationError("the site has no publicOrigin: an opted-in public build cannot emit integration documents (02 §4, §5)");
  if (!origin.startsWith("https://")) throw new IntegrationError(`publicOrigin ${origin} is not an https origin (02 §5)`);

  const routes = portfolioRoutes(input.declaredRoutes);
  const portfolio = routes ? projectPortfolio(snapshot, routes, input.plannedRoutes) : undefined;
  const manifest: IntegrationManifest = {
    schemaVersion: CORE_SCHEMA_VERSION,
    site: { id: snapshot.siteId, publicOrigin: origin, locale: snapshot.site.identity.locale },
    resources: portfolio ? { [PORTFOLIO_KIND]: { href: `/${portfolio.file.path}`, version: portfolio.version } } : {},
  };
  const manifestFile: EmittedFile = { path: `${INTEGRATION_DIR}/${MANIFEST_FILE}`, ...serialize(manifest) };
  return { manifest, manifestFile, portfolio, files: portfolio ? [manifestFile, portfolio.file] : [manifestFile] };
}
