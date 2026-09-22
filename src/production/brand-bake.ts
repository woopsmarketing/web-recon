/**
 * SOURCE-BRAND RESOLUTION at bake time (Task 28 Phase 2) — the rewriter Task
 * 27 said did not exist.
 *
 * WHERE. This mutates `<appDir>/reconstruction-data/pages/*.json` INSIDE THE
 * BUILD COPY, between `bakeSeoTitles` and `convertToStaticExport`. It is the
 * same shape of change `bakeSeoTitles`/`bakeRouteTitles` already make to the
 * route table, for the same stated reason (patch.ts): the head, the server
 * HTML and the RSC flight payload ALL derive from this data, so one write
 * reaches every encoding. The immutable template run is never touched.
 *
 * WHY NOT A POST-EXPORT BYTE REWRITE. The exported HTML carries the same
 * inline SVG three times in three encodings (SSR markup, backslash-escaped
 * inside the `.txt` flight, and entity-escaped inside the
 * `self.__next_f.push` chunks inlined in the HTML), and the flight serialises
 * large blobs behind a BYTE-LENGTH prefix (`10:Tc20,` + 3104 bytes). A
 * length-changing substitution there corrupts the route's flight payload
 * unless every hex prefix is recomputed. Rewriting the IR has none of those
 * problems, and a value that only changed in the HTML would revert on
 * hydration anyway.
 *
 * WHAT IT DOES NOT DO. There is no SVG path editor here and no per-path paint
 * rewriting. A mark is a WHOLE ASSET: replaced whole, removed whole, or
 * preserved whole. Anything that cannot be done deterministically is REFUSED,
 * named on the report, and left as an honest requirement.
 */
import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import {
  brandSurfaceIdOf,
  brandTokensFrom,
  brandTokensFromHost,
  declaredBrandNamesFromTitles,
  scanElementProps,
  scanInlineSvgMarkup,
  type BrandSurface,
} from "../content-injection/brand-surfaces.js";
import { annotateSvgRoot } from "../reconstruction/asset-resolver.js";
import { ROUTE_MAP_FILE, RUNTIME_DATA_DIR } from "../reconstruction/types.js";
import { generatedMarkFor, normalizeBrandName, type GeneratedMarkKind } from "./brand-mark.js";

/** The surfaces this resolver can act on. Everything else is out of scope and
 *  says so (`SURFACES_NOT_RESOLVED`). */
export const RESOLVABLE_BRAND_SURFACES = [
  "image-logo",
  "image-alt",
  "aria-label",
  "svg-aria-label",
  "svg-text",
  "svg-symbol-id",
] as const;
export type ResolvableBrandSurface = (typeof RESOLVABLE_BRAND_SURFACES)[number];

/**
 * Surfaces this resolver deliberately does NOT own, each with the mechanism
 * that does. Stated as data so a report can print it, instead of a reader
 * mistaking silence for coverage.
 */
export const SURFACES_NOT_RESOLVED: Record<string, string> = {
  "visible-text": "slot-bound: authored.slotValues / routeContent[*].slotValues is the write path",
  "source-url": "asset layer: the rewrite map replaces source URLs keyed by sourceUrl",
  "title-meta": "SEO plan (brandIsolation gate) — the head is not in the page IR",
  canonical: "SEO plan + the production-domain requirement",
  "open-graph": "SEO plan (brandIsolation gate)",
  "json-ld": "SEO plan (omits absent facts rather than inheriting source ones)",
  "body-anchor-identity": "content/asset independence — an anchor href is a url surface",
  "dynamic-template-content":
    "no artifact records brand inside dynamically-mounted region content separately from its host route",
  // Task 28 Phase 2 CORRECTION — a gap found by measuring the phase's OWN
  // proof build, recorded here rather than left silent. It is NOT in
  // BRAND_SURFACES, so no detector raises it, and no census axis counts it:
  // `censusServedHtml` strips tags before reading visible text, which an
  // attribute VALUE never survives.
  "attribute-value-text":
    "NOT OWNED: prose carried in an attribute value (measured — the accepted linear proof build " +
    'data/linear.app/production-builds/2026-08-27T12-36-06-105Z ships placeholder="Tell Linear ' +
    'what to do next…" twice in index.html). Not in BRAND_SURFACES, not counted by any census ' +
    "axis, so a zero census does NOT mean this class is clean",
};

export type BrandDecisionKind = "REPLACE" | "REMOVE" | "PRESERVE";

/**
 * Structurally identical to `AuthoredBrandDecision` (src/release/types.ts).
 * Declared locally so `src/production` never imports `src/release` — release
 * imports production through stages.ts, so the reverse edge would be a cycle.
 */
export interface BrandDecisionInput {
  decision: BrandDecisionKind;
  replacement?: { text?: string; assetId?: string; file?: string };
  reason?: string;
  note?: string;
  updatedAt?: string;
}

export interface BrandHost {
  /** `brandSurfaceIdOf` — the key an authored decision is stored under. */
  id: string;
  surface: ResolvableBrandSurface;
  route: string;
  viewport: string;
  /** Page file, relative to `<appDir>/reconstruction-data`. */
  pageFile: string;
  nodeId: string | null;
  tag: string | null;
  pointer: string;
  kind: "inline-svg" | "element-prop";
  /**
   * Every brand value this (node, surface) carries. A `<symbol>` host can
   * carry two brand-named ids under ONE surface id, so one decision governs
   * both — that is the granularity of the id, stated rather than implied.
   */
  values: string[];
  matched: string[];
  /** Whether a whole-asset op on this host is deterministic, and why not. */
  deterministic: boolean;
  reason: string;
}

export interface BrandBakeRefusal {
  id: string;
  surface: string;
  route: string;
  nodeId: string | null;
  decision: BrandDecisionKind;
  reason: string;
}

export interface BrandBakeReport {
  schemaName: "brand-bake-report-v1";
  sourceHost: string;
  brandTokens: string[];
  brandName: string | null;
  scanned: { routes: number; pages: number; elementNodes: number };
  /** Brand-carrying hosts found BEFORE any rewrite. */
  hostsBefore: number;
  hostsBeforeBySurface: Record<string, number>;
  decisions: {
    replace: number;
    remove: number;
    preserve: number;
    undecided: number;
    /** Decision keys that address no host on this lineage (a stale editor key). */
    unknownIds: string[];
  };
  applied: {
    replaced: number;
    removed: number;
    preserved: number;
    refused: number;
    nodesRewritten: number;
    pagesRewritten: number;
    symbolIdsRenamed: number;
    symbolReferencesRenamed: number;
    generatedMarks: Array<{ id: string; kind: GeneratedMarkKind; name: string }>;
  };
  refusals: BrandBakeRefusal[];
  /**
   * THE CLEARING EVIDENCE. Re-derived by RE-READING the mutated page files
   * from disk — never from the in-memory objects the rewrite produced.
   *
   *   hostsAfter        brand-carrying hosts still in the built app's IR
   *   preservedAfter    of those, the ones an explicit PRESERVE decision covers
   *   unexplainedAfter  the rest — MUST be empty for the blocker to clear
   */
  residual: {
    hostsAfter: number;
    preservedAfter: number;
    unexplainedAfter: string[];
    bySurfaceAfter: Record<string, number>;
  };
  surfacesNotResolved: Record<string, string>;
}

interface RuntimeNodeLike {
  k?: string;
  n?: string;
  t?: string;
  p?: Record<string, unknown>;
  c?: RuntimeNodeLike[];
  v?: string;
}

interface PageDoc {
  [viewport: string]: { doc?: RuntimeNodeLike } | undefined;
}

const SURFACE_SET = new Set<string>(RESOLVABLE_BRAND_SURFACES);

async function readJson<T>(file: string): Promise<T> {
  return JSON.parse(await readFile(file, "utf8")) as T;
}

// ---------------------------------------------------------------------------
// Collection
// ---------------------------------------------------------------------------

/**
 * Is this inline-SVG host an ICON SPRITE?
 *
 * Whole-host ops are refused on one: the accepted linear template's sprite is
 * 184 KB with 264 `<symbol>` definitions, exactly 2 of them brand-named.
 * Replacing that host would destroy every icon on the page for zero
 * independence gain, so only the brand-named symbol ids are resolvable there.
 */
export function isIconSprite(markup: string): boolean {
  return /<symbol\b/i.test(markup);
}

function hostsForNode(
  node: RuntimeNodeLike,
  context: {
    route: string;
    viewport: string;
    pageFile: string;
    tokens: readonly string[];
    sourceHost: string;
  },
): BrandHost[] {
  const nodeId = node.n ?? null;
  const base = `${context.viewport}.doc[${nodeId ?? "?"}]`;
  const bySurface = new Map<ResolvableBrandSurface, BrandHost>();
  const push = (
    surface: string,
    pointerSuffix: "v" | "p",
    kind: BrandHost["kind"],
    value: string,
    matched: string,
    deterministic: boolean,
    reason: string,
  ): void => {
    if (!SURFACE_SET.has(surface)) return;
    const typed = surface as ResolvableBrandSurface;
    const existing = bySurface.get(typed);
    if (existing !== undefined) {
      existing.values.push(value);
      existing.matched.push(matched);
      return;
    }
    const pointer = `${base}.${pointerSuffix}`;
    bySurface.set(typed, {
      id: brandSurfaceIdOf({
        surface: typed as BrandSurface,
        route: context.route,
        nodeId,
        slotKey: null,
        evidencePointer: pointer,
      }),
      surface: typed,
      route: context.route,
      viewport: context.viewport,
      pageFile: context.pageFile,
      nodeId,
      tag: node.t ?? null,
      pointer,
      kind,
      values: [value],
      matched: [matched],
      deterministic,
      reason,
    });
  };

  if (typeof node.v === "string") {
    const sprite = isIconSprite(node.v);
    for (const hit of scanInlineSvgMarkup(node.v, context.tokens)) {
      if (hit.surface === "svg-symbol-id") {
        push(
          hit.surface,
          "v",
          "inline-svg",
          hit.value,
          hit.matched,
          true,
          "a <symbol> id is renamed in place, together with every <use> that references it",
        );
      } else if (sprite) {
        push(
          hit.surface,
          "v",
          "inline-svg",
          hit.value,
          hit.matched,
          false,
          "host is an icon SPRITE (it defines <symbol>s): a whole-host replacement would destroy " +
            "every icon on the page, so only its brand-named symbol ids are deterministically resolvable",
        );
      } else {
        push(
          hit.surface,
          "v",
          "inline-svg",
          hit.value,
          hit.matched,
          true,
          "self-contained inline mark: the whole host markup is replaced, keeping its box and identity",
        );
      }
    }
  }
  if (node.p !== undefined) {
    for (const hit of scanElementProps(node.p, context.tokens, context.sourceHost, node.t)) {
      if (hit.surface === "image-logo") {
        push(hit.surface, "p", "element-prop", hit.value, hit.matched, true, "src/srcset/alt are plain props");
      } else if (hit.surface === "image-alt" || hit.surface === "aria-label") {
        push(hit.surface, "p", "element-prop", hit.value, hit.matched, true, "a text prop is set or deleted");
      }
    }
  }
  return [...bySurface.values()];
}

/**
 * The token set a scan of THIS app runs with (Task 28 Phase 2 correction).
 *
 * Host-derived tokens, widened by the brand name the SOURCE ITSELF declares in
 * its route-map titles. It lives here, next to the scanner, for the reason the
 * surface-id hash does: the requirement scanner (`src/release/collect.ts`) and
 * the bake-time resolver must run with the SAME tokens, or the resolver cannot
 * see — and therefore can never clear — a host the requirement counted.
 *
 * Never throws: a route map with no titles, or no route map at all, degrades
 * to the host tokens.
 */
export async function appBrandTokens(appDir: string, sourceHost: string): Promise<string[]> {
  const routeMapFile = path.join(appDir, RUNTIME_DATA_DIR, ROUTE_MAP_FILE);
  if (!existsSync(routeMapFile)) return brandTokensFromHost(sourceHost);
  try {
    const routeMap = await readJson<{ routes: Array<{ title?: string }> }>(routeMapFile);
    const titles = routeMap.routes
      .map((route) => (typeof route.title === "string" ? route.title : ""))
      .filter((title) => title !== "");
    return brandTokensFrom(sourceHost, declaredBrandNamesFromTitles(titles));
  } catch {
    return brandTokensFromHost(sourceHost);
  }
}

export interface BrandScanResult {
  hosts: BrandHost[];
  routes: number;
  pages: number;
  elementNodes: number;
}

/**
 * Walk a built app's runtime IR and return every BRAND-CARRYING host.
 *
 * This is the count the release blocker should carry — NOT
 * `inventory.counts.inlineSvgEntries`, which counts every inline SVG, icons
 * included (207 entries vs 64 brand-carrying hosts on the accepted linear
 * lineage: the old blocker overstated the brand surface by ~3.2x).
 */
export async function scanAppBrandHosts(
  appDir: string,
  sourceHost: string,
  brandTokens?: readonly string[],
): Promise<BrandScanResult> {
  const tokens = brandTokens ?? (await appBrandTokens(appDir, sourceHost));
  const dataDir = path.join(appDir, RUNTIME_DATA_DIR);
  const routeMapFile = path.join(dataDir, ROUTE_MAP_FILE);
  const result: BrandScanResult = { hosts: [], routes: 0, pages: 0, elementNodes: 0 };
  if (!existsSync(routeMapFile)) return result;
  const routeMap = await readJson<{ routes: Array<{ path: string; pageFile: string }> }>(routeMapFile);
  for (const route of routeMap.routes) {
    const pageFile = path.join(dataDir, route.pageFile);
    if (!existsSync(pageFile)) continue;
    result.routes += 1;
    result.pages += 1;
    const page = await readJson<PageDoc>(pageFile);
    for (const viewport of Object.keys(page)) {
      const doc = page[viewport]?.doc;
      if (doc === undefined) continue;
      const stack: RuntimeNodeLike[] = [doc];
      while (stack.length > 0) {
        const node = stack.pop()!;
        if (node.k !== "e") continue;
        result.elementNodes += 1;
        result.hosts.push(
          ...hostsForNode(node, {
            route: route.path,
            viewport,
            pageFile: route.pageFile,
            tokens,
            sourceHost,
          }),
        );
        if (node.c !== undefined) for (const child of node.c) stack.push(child);
      }
    }
  }
  return result;
}

// ---------------------------------------------------------------------------
// Markup helpers
// ---------------------------------------------------------------------------

const ROOT_ATTR = /^<\s*svg\b([^>]*)>/i;

/** Root attributes of an inline-SVG host, as written. Never throws. */
export function svgRootAttributes(markup: string): Record<string, string> {
  const match = ROOT_ATTR.exec(markup.trim());
  if (match === null) return {};
  const attrs: Record<string, string> = {};
  for (const attr of match[1].matchAll(/([a-zA-Z_:][-a-zA-Z0-9_:.]*)\s*=\s*"([^"]*)"/g)) {
    attrs[attr[1].toLowerCase()] = attr[2];
  }
  return attrs;
}

function numericLength(value: string | undefined): number | null {
  if (value === undefined) return null;
  if (!/^[0-9.]+(px)?$/.test(value.trim())) return null;
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed : null;
}

/**
 * Re-stamp identity + box onto a replacement mark.
 *
 * `annotateSvgRoot` strips the replacement's own class/style/id/data-* first,
 * so `data-wr-node` here is the EXISTING DOM identity the compiler stamped —
 * no new attribute is introduced and the QA / regions join keeps working. The
 * host's own width/height/class/style ride along so the replacement occupies
 * the same box (including non-numeric ones like `width="20%"`).
 */
export function stampReplacementMark(
  replacement: string,
  hostMarkup: string,
  nodeId: string | null,
): string {
  const attrs = svgRootAttributes(hostMarkup);
  const carried: Record<string, string> = {};
  for (const name of ["width", "height", "class", "style"]) {
    const value = attrs[name];
    if (value !== undefined && value !== "") carried[name] = value;
  }
  if (nodeId !== null) carried["data-wr-node"] = nodeId;
  return annotateSvgRoot(replacement, carried);
}

/** REMOVE: an inert, brand-free mark that keeps the host's box. */
export function emptyMarkFor(hostMarkup: string, nodeId: string | null): string {
  return stampReplacementMark(
    '<svg viewBox="0 0 1 1" aria-hidden="true" focusable="false"></svg>',
    hostMarkup,
    nodeId,
  );
}

/** Deterministic, brand-free replacement id for a `<symbol>`. */
export function neutralSymbolId(oldId: string, salt: string): string {
  const digest = createHash("sha256").update(`${oldId} ${salt}`, "utf8").digest("hex").slice(0, 10);
  return `wr-sym-${digest}`;
}

/** Rename `<symbol id>` and every `<use href="#id">` that references it. */
export function renameSymbolIdInMarkup(
  markup: string,
  oldId: string,
  newId: string,
): { markup: string; symbols: number; references: number } {
  let symbols = 0;
  let references = 0;
  const escaped = oldId.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const withSymbols = markup.replace(
    new RegExp(`(<symbol\\b[^>]*?\\bid\\s*=\\s*")${escaped}(")`, "g"),
    (_all, head: string, tail: string) => {
      symbols += 1;
      return `${head}${newId}${tail}`;
    },
  );
  const withRefs = withSymbols.replace(
    new RegExp(`((?:xlink:)?href\\s*=\\s*")#${escaped}(")`, "g"),
    (_all, head: string, tail: string) => {
      references += 1;
      return `${head}#${newId}${tail}`;
    },
  );
  return { markup: withRefs, symbols, references };
}

// ---------------------------------------------------------------------------
// Bake
// ---------------------------------------------------------------------------

export interface BrandBakeOptions {
  /** The BUILD COPY's app directory — never the template run. */
  appDir: string;
  sourceHost: string;
  /** brandSurfaceId -> decision (authored.brand). */
  decisions: Record<string, BrandDecisionInput>;
  /** The site's OWN name, for the generated fallback. Null disables it. */
  brandName?: string | null;
  /** assetId -> an already-served url (`/media/<sha>.<ext>`), from the
   *  materialization's replacement manifest. */
  assetUrls?: Record<string, string>;
  /** Copy a local replacement file into the app's public/ and return its url. */
  publicAssetUrlFor?: (file: string) => Promise<string>;
  log?: (line: string) => void;
}

/**
 * Rewrite the build copy's page IR according to the authored decisions.
 *
 * `residual.unexplainedAfter` is re-measured from the FILES ON DISK after the
 * rewrite, so "the surface is gone" is a measurement of the artifact that will
 * be built — never a restatement of what was requested.
 */
export async function bakeBrand(options: BrandBakeOptions): Promise<BrandBakeReport> {
  const log = options.log ?? ((): void => {});
  // The SAME widened token set the requirement scanner uses (host label +
  // the name the source declares in its own titles) — derived from this app,
  // so the resolver can never be blind to a host the blocker counted.
  const tokens = await appBrandTokens(options.appDir, options.sourceHost);
  const brandName = normalizeBrandName(options.brandName ?? null);
  const dataDir = path.join(options.appDir, RUNTIME_DATA_DIR);
  const before = await scanAppBrandHosts(options.appDir, options.sourceHost, tokens);

  const decisions = options.decisions ?? {};
  const knownIds = new Set(before.hosts.map((host) => host.id));
  const unknownIds = Object.keys(decisions).filter((id) => !knownIds.has(id)).sort();

  const report: BrandBakeReport = {
    schemaName: "brand-bake-report-v1",
    sourceHost: options.sourceHost,
    brandTokens: [...tokens],
    brandName,
    scanned: { routes: before.routes, pages: before.pages, elementNodes: before.elementNodes },
    hostsBefore: before.hosts.length,
    hostsBeforeBySurface: countBySurface(before.hosts),
    decisions: { replace: 0, remove: 0, preserve: 0, undecided: 0, unknownIds },
    applied: {
      replaced: 0,
      removed: 0,
      preserved: 0,
      refused: 0,
      nodesRewritten: 0,
      pagesRewritten: 0,
      symbolIdsRenamed: 0,
      symbolReferencesRenamed: 0,
      generatedMarks: [],
    },
    refusals: [],
    residual: { hostsAfter: 0, preservedAfter: 0, unexplainedAfter: [], bySurfaceAfter: {} },
    surfacesNotResolved: SURFACES_NOT_RESOLVED,
  };

  const preservedIds = new Set<string>();
  for (const host of before.hosts) {
    const decision = decisions[host.id];
    if (decision === undefined) {
      report.decisions.undecided += 1;
      continue;
    }
    if (decision.decision === "REPLACE") report.decisions.replace += 1;
    else if (decision.decision === "REMOVE") report.decisions.remove += 1;
    else {
      report.decisions.preserve += 1;
      preservedIds.add(host.id);
    }
  }

  const pageHosts = new Map<string, BrandHost[]>();
  for (const host of before.hosts) {
    const list = pageHosts.get(host.pageFile) ?? [];
    list.push(host);
    pageHosts.set(host.pageFile, list);
  }

  // Symbol renames are page-GLOBAL: a `<use href="#id">` may live in another
  // node or another page than the `<symbol>` that defines it. Collected here,
  // applied across every page afterwards.
  const symbolRenames = new Map<string, string>();

  for (const [pageFile, hosts] of [...pageHosts.entries()].sort()) {
    const absolute = path.join(dataDir, pageFile);
    const page = await readJson<PageDoc>(absolute);
    const nodeIndex = indexNodes(page);
    let mutated = false;
    for (const host of [...hosts].sort((a, b) => (a.id < b.id ? -1 : 1))) {
      const decision = decisions[host.id];
      if (decision === undefined) continue;
      if (decision.decision === "PRESERVE") {
        report.applied.preserved += 1;
        continue;
      }
      const node = nodeIndex.get(`${host.viewport} ${host.nodeId ?? ""}`);
      if (node === undefined) {
        report.refusals.push({
          id: host.id,
          surface: host.surface,
          route: host.route,
          nodeId: host.nodeId,
          decision: decision.decision,
          reason: "node not found in the page IR at bake time",
        });
        report.applied.refused += 1;
        continue;
      }
      if (!host.deterministic) {
        report.refusals.push({
          id: host.id,
          surface: host.surface,
          route: host.route,
          nodeId: host.nodeId,
          decision: decision.decision,
          reason: host.reason,
        });
        report.applied.refused += 1;
        continue;
      }
      const outcome = await applyHostDecision({
        host,
        node,
        decision,
        brandName,
        options,
        report,
        symbolRenames,
      });
      if (outcome === "refused") {
        report.applied.refused += 1;
        continue;
      }
      if (decision.decision === "REPLACE") report.applied.replaced += 1;
      else report.applied.removed += 1;
      report.applied.nodesRewritten += 1;
      mutated = true;
    }
    if (mutated) {
      await writeFile(absolute, JSON.stringify(page), "utf8");
      report.applied.pagesRewritten += 1;
    }
  }

  if (symbolRenames.size > 0) {
    await renameSymbolsAcrossPages(dataDir, symbolRenames);
  }

  // ---- residual: RE-READ from disk, never from memory ---------------------
  const after = await scanAppBrandHosts(options.appDir, options.sourceHost, tokens);
  report.residual.hostsAfter = after.hosts.length;
  report.residual.bySurfaceAfter = countBySurface(after.hosts);
  report.residual.preservedAfter = after.hosts.filter((host) => preservedIds.has(host.id)).length;
  report.residual.unexplainedAfter = [
    ...new Set(after.hosts.filter((host) => !preservedIds.has(host.id)).map((host) => host.id)),
  ].sort();
  log(
    `[production] brand: ${report.hostsBefore} brand-carrying host(s) before; ` +
      `${report.applied.replaced} replaced, ${report.applied.removed} removed, ` +
      `${report.applied.preserved} preserved, ${report.applied.refused} refused; ` +
      `${report.residual.unexplainedAfter.length} unexplained after`,
  );
  return report;
}

/**
 * Apply the collected symbol renames to EVERY page file.
 *
 * The page file is JSON, so the markup inside it is JSON-escaped
 * (`id=\"Linear\"`). That escaped form is the only one the file has, so the
 * rename is a plain split/join over it — no regex over an escaped regex.
 */
async function renameSymbolsAcrossPages(
  dataDir: string,
  renames: Map<string, string>,
): Promise<void> {
  const routeMap = await readJson<{ routes: Array<{ pageFile: string }> }>(
    path.join(dataDir, ROUTE_MAP_FILE),
  );
  const files = [...new Set(routeMap.routes.map((route) => route.pageFile))].sort();
  for (const relative of files) {
    const absolute = path.join(dataDir, relative);
    if (!existsSync(absolute)) continue;
    const original = await readFile(absolute, "utf8");
    let text = original;
    for (const [oldId, newId] of renames) {
      text = text
        .split(`id=\\"${oldId}\\"`)
        .join(`id=\\"${newId}\\"`)
        .split(`href=\\"#${oldId}\\"`)
        .join(`href=\\"#${newId}\\"`);
    }
    if (text !== original) await writeFile(absolute, text, "utf8");
  }
}

function countBySurface(hosts: BrandHost[]): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const host of hosts) counts[host.surface] = (counts[host.surface] ?? 0) + 1;
  return counts;
}

function indexNodes(page: PageDoc): Map<string, RuntimeNodeLike> {
  const index = new Map<string, RuntimeNodeLike>();
  for (const viewport of Object.keys(page)) {
    const doc = page[viewport]?.doc;
    if (doc === undefined) continue;
    const stack: RuntimeNodeLike[] = [doc];
    while (stack.length > 0) {
      const node = stack.pop()!;
      if (node.k === "e") index.set(`${viewport} ${node.n ?? ""}`, node);
      if (node.c !== undefined) for (const child of node.c) stack.push(child);
    }
  }
  return index;
}

async function applyHostDecision(input: {
  host: BrandHost;
  node: RuntimeNodeLike;
  decision: BrandDecisionInput;
  brandName: string | null;
  options: BrandBakeOptions;
  report: BrandBakeReport;
  symbolRenames: Map<string, string>;
}): Promise<"applied" | "refused"> {
  const { host, node, decision, brandName, options, report } = input;
  const refuse = (reason: string): "refused" => {
    report.refusals.push({
      id: host.id,
      surface: host.surface,
      route: host.route,
      nodeId: host.nodeId,
      decision: decision.decision,
      reason,
    });
    return "refused";
  };

  if (host.surface === "svg-symbol-id") {
    if (typeof node.v !== "string") return refuse("host carries no inline markup");
    let markup = node.v;
    for (const oldId of host.values) {
      if (!input.symbolRenames.has(oldId)) {
        input.symbolRenames.set(oldId, neutralSymbolId(oldId, decision.decision));
      }
      const renamed = renameSymbolIdInMarkup(markup, oldId, input.symbolRenames.get(oldId)!);
      markup = renamed.markup;
      report.applied.symbolIdsRenamed += renamed.symbols;
      report.applied.symbolReferencesRenamed += renamed.references;
    }
    node.v = markup;
    return "applied";
  }

  if (host.kind === "inline-svg") {
    if (typeof node.v !== "string") return refuse("host carries no inline markup");
    if (decision.decision === "REMOVE") {
      node.v = emptyMarkFor(node.v, host.nodeId);
      return "applied";
    }
    const markup = await replacementMarkup({
      host,
      hostMarkup: node.v,
      decision,
      brandName,
      report,
    });
    if (markup === null) {
      return refuse(
        "REPLACE payload could not be resolved to a mark: supply replacement.file (an .svg), " +
          "replacement.text, or a brand name for the generated fallback",
      );
    }
    node.v = stampReplacementMark(markup, node.v, host.nodeId);
    return "applied";
  }

  const props = node.p;
  if (props === undefined) return refuse("host carries no props");
  if (host.surface === "image-alt" || host.surface === "aria-label") {
    const prop = host.surface === "image-alt" ? "alt" : "aria-label";
    if (decision.decision === "REMOVE") {
      // An <img> keeps an EMPTY alt: deleting the attribute makes the image
      // unlabelled to a screen reader, which is an accessibility regression,
      // not a brand fix. A non-image aria-label is deleted outright.
      if (prop === "alt") props.alt = "";
      else delete props["aria-label"];
      return "applied";
    }
    const text = decision.replacement?.text ?? brandName;
    if (text === null || text === undefined || text === "") {
      return refuse("REPLACE on a text surface needs replacement.text (or a brand name)");
    }
    props[prop] = text;
    return "applied";
  }
  if (host.surface === "image-logo") {
    if (decision.decision === "REMOVE") {
      return refuse(
        "removing an <img> host is not deterministically safe: the element carries layout the " +
          "surrounding flex/grid depends on — REPLACE it instead",
      );
    }
    const url = await replacementAssetUrl(decision, options);
    if (url === null) {
      return refuse("REPLACE on an <img> logo needs replacement.assetId or replacement.file");
    }
    props.src = url;
    delete props.srcset;
    delete props.srcSet;
    const alt = decision.replacement?.text ?? brandName;
    if (alt !== null && alt !== undefined && alt !== "") props.alt = alt;
    return "applied";
  }
  return refuse(`surface ${host.surface} has no implemented op`);
}

async function replacementAssetUrl(
  decision: BrandDecisionInput,
  options: BrandBakeOptions,
): Promise<string | null> {
  const assetId = decision.replacement?.assetId;
  if (assetId !== undefined) {
    const url = options.assetUrls?.[assetId];
    if (url !== undefined) return url;
  }
  const file = decision.replacement?.file;
  if (file !== undefined && options.publicAssetUrlFor !== undefined && existsSync(file)) {
    return await options.publicAssetUrlFor(file);
  }
  return null;
}

async function replacementMarkup(input: {
  host: BrandHost;
  hostMarkup: string;
  decision: BrandDecisionInput;
  brandName: string | null;
  report: BrandBakeReport;
}): Promise<string | null> {
  const { decision, host, hostMarkup, brandName, report } = input;
  const file = decision.replacement?.file;
  if (file !== undefined && /\.svg$/i.test(file) && existsSync(file)) {
    const markup = await readFile(file, "utf8");
    // Strip an XML prolog / doctype so the result is one <svg> fragment.
    return markup
      .replace(/<\?xml[\s\S]*?\?>/g, "")
      .replace(/<!DOCTYPE[\s\S]*?>/gi, "")
      .trim();
  }
  const name = decision.replacement?.text ?? brandName;
  if (name === null || name === undefined || name === "") return null;
  const attrs = svgRootAttributes(hostMarkup);
  const mark = generatedMarkFor(
    name,
    { width: numericLength(attrs.width), height: numericLength(attrs.height) },
    { emitBox: false },
  );
  report.applied.generatedMarks.push({ id: host.id, kind: mark.kind, name });
  return mark.markup;
}

/**
 * Copy a local file into the app copy's `public/wr/brand/` and return the URL
 * the exported site will serve it at. Content-addressed, so two builds of the
 * same file produce the same path.
 */
export async function publicBrandAssetCopier(
  appDir: string,
): Promise<(file: string) => Promise<string>> {
  const target = path.join(appDir, "public", "wr", "brand");
  await mkdir(target, { recursive: true });
  return async (file: string): Promise<string> => {
    const bytes = await readFile(file);
    const digest = createHash("sha256").update(bytes).digest("hex").slice(0, 32);
    const extension = path.extname(file).toLowerCase() || ".bin";
    await writeFile(path.join(target, `${digest}${extension}`), bytes);
    return `/wr/brand/${digest}${extension}`;
  };
}
