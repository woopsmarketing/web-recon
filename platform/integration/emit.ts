import { z } from "zod";
import type { SiteSnapshot } from "../site/instance";
import { hashJson, sha256 } from "../util/hash";
import {
  AREA_BASES,
  CORE_SCHEMA_VERSION,
  INTEGRATION_DIR,
  MANIFEST_FILE,
  PORTFOLIO_KIND,
  PORTFOLIO_SCHEMA_VERSION,
} from "./contract";

/**
 * Integration emitter — PURE (no filesystem, no clock, no env):
 *
 *   (SiteSnapshot, the release's declared routes, the preflight route plan)
 *     → { manifest, portfolio document, serialised files }
 *
 * Projection rules (02 §6–§11, 06 A1–A3):
 *   - explicit allowlist: id · title · detailUrl · publishedAt · location · area · pricePerArea ·
 *     facets{category, scope, tag}. Nothing else of a Project leaves (no summary/body/gallery/
 *     quote/slug/status/builtYear/period/duration).
 *   - missing = omitted. Never null, never a placeholder. `basis` only when supply | exclusive
 *     (absent or "unknown" → no key). No conversion, no inference, no totals (ND1, PR5).
 *   - records by id, facet values by id: Unicode code point order (not localeCompare, not the
 *     UTF-16 default sort). A record's facet array keeps the authored order, first occurrence wins.
 *   - version = sha256(canonical sorted-key JSON of the document without `version`)[0:32].
 *   - serialisation: compact JSON, UTF-8 without BOM, the key order of 02 §5 / §6.
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
export interface PortfolioRecord {
  id: string;
  title: string;
  detailUrl: string;
  publishedAt?: string;
  location?: string;
  area?: { value: number; unit: string; basis?: string };
  pricePerArea?: { amount: number; currency: string; perUnit: string };
  facets?: Record<string, string[]>;
}
export interface PortfolioDocument {
  schemaVersion: string;
  resource: typeof PORTFOLIO_KIND;
  version: string;
  listingUrl?: string;
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

export function projectPortfolio(snapshot: SiteSnapshot, routes: { item: ItemRoute; list: ListRoute | undefined }, planned: readonly PlannedRoute[]): PortfolioEmission {
  const { item, list } = routes;
  const itemPlan = planned.find((r) => r.key === item.key);
  if (!itemPlan) throw new IntegrationError(`the route plan has no entry for the item route "${item.key}"`);
  const plannedItemPaths = new Set(itemPlan.paths);
  const categories = new Map(snapshot.content.categories.map((c) => [c.id, c.name]));

  const used: Record<string, Map<string, string>> = { category: new Map(), scope: new Map(), tag: new Map() };
  const records = [...snapshot.content.projects]
    .sort((a, b) => compareCodePoints(a.id, b.id))
    .map((p): PortfolioRecord => {
      const detailUrl = itemPath(item.path, p.slug);
      if (!plannedItemPaths.has(detailUrl)) throw new IntegrationError(`record "${p.id}": its detail page ${detailUrl} is not in the route plan`);
      const rec: PortfolioRecord = { id: p.id, title: p.title, detailUrl };
      if (p.publishedAt !== undefined) rec.publishedAt = p.publishedAt;
      if (p.location !== undefined) rec.location = p.location;
      if (p.area) {
        rec.area = { value: p.area.value, unit: p.area.unit };
        if ((AREA_BASES as readonly string[]).includes(p.area.basis ?? "")) rec.area.basis = p.area.basis;
      }
      if (p.pricePerArea) rec.pricePerArea = { amount: p.pricePerArea.amount, currency: p.pricePerArea.currency, perUnit: p.pricePerArea.unit };
      const label = categories.get(p.category);
      if (label === undefined) throw new IntegrationError(`record "${p.id}": category "${p.category}" is not in the snapshot`);
      const facets: Record<string, string[]> = { category: [p.category] };
      used.category!.set(p.category, label);
      if (p.scope && p.scope.length > 0) {
        facets.scope = dedupe(p.scope);
        for (const v of facets.scope) used.scope!.set(v, v);
      }
      if (p.keywords && p.keywords.length > 0) {
        facets.tag = dedupe(p.keywords);
        for (const v of facets.tag) used.tag!.set(v, v);
      }
      rec.facets = facets;
      return rec;
    });

  const facets: NonNullable<PortfolioDocument["facets"]> = {};
  const facetCounts: Record<string, number> = {};
  for (const key of Object.keys(used).sort(compareCodePoints)) {
    const m = used[key]!;
    if (m.size === 0) continue;
    facets[key] = { values: [...m.keys()].sort(compareCodePoints).map((id) => ({ id, label: m.get(id)! })) };
    facetCounts[key] = m.size;
  }

  // The listing page exists only when the collection has ≥ 1 served item (route plan); §7.2: omitted with zero records.
  const listPlan = list ? planned.find((r) => r.key === list.key) : undefined;
  const listingUrl = records.length > 0 && listPlan && listPlan.paths.length === 1 ? listPlan.paths[0] : undefined;

  const body: Omit<PortfolioDocument, "version"> = {
    schemaVersion: PORTFOLIO_SCHEMA_VERSION,
    resource: PORTFOLIO_KIND,
    ...(listingUrl !== undefined ? { listingUrl } : {}),
    ...(Object.keys(facets).length > 0 ? { facets } : {}),
    records,
  };
  const version = portfolioVersion(body);
  const document: PortfolioDocument = {
    schemaVersion: body.schemaVersion,
    resource: body.resource,
    version,
    ...(listingUrl !== undefined ? { listingUrl } : {}),
    ...(body.facets ? { facets: body.facets } : {}),
    records,
  };
  const file: EmittedFile = { path: `${INTEGRATION_DIR}/${PORTFOLIO_KIND}.${version}.json`, ...serialize(document) };
  return { document, version, file, recordCount: records.length, facetCounts };
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
