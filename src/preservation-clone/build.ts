import fs from "node:fs/promises";
import path from "node:path";

import { matchProvider } from "../source-package/classify.js";
import {
  loadSourcePackage,
  type LoadedSourcePackage,
} from "../source-package/store.js";
import type {
  AssetEntry,
  ScriptEntry,
  StyleEntry,
} from "../source-package/types.js";
import {
  collectCssUrlRefs,
  isNonLocalizableCssUrl,
  rewriteCssUrls,
} from "./css-urls.js";
import {
  HINT_RELS,
  elementPath,
  getAttr,
  isInertUrl,
  parseDocument,
  parseSrcset,
  rawText,
  relTokens,
  removeAttr,
  removeElement,
  serializeDocument,
  serializeSrcset,
  setAttr,
  setRawText,
  stylesheetNodes,
  urlAttrsFor,
  walkElements,
  type P5Document,
  type P5Element,
} from "./dom.js";
import {
  DEFAULT_RESOURCE_POLICY,
  hostOf,
  materializeResources,
  sha256,
  type ResourceCandidate,
  type ResourcePolicy,
} from "./resources.js";
import {
  BUILDER_NAME,
  BUILDER_VERSION,
  PACKAGE_KIND,
  PreservationCloneManifestSchema,
  ResidualDependenciesSchema,
  ResourceMapSchema,
  SCHEMA_VERSION,
  type PreservationCloneManifest,
  type ResidualDependencies,
  type ResidualDependency,
  type ResidualReason,
  type ResourceMap,
  type ResourceOrigin,
  type ResourceRecord,
  type ScriptRecord,
  type StyleDecision,
  type StyleRepresentation,
  type Variant,
} from "./types.js";

/**
 * Preservation Clone builder (Source Preservation Phase 2).
 *
 * Input:  one or more viewport Source Packages from a single observation run.
 * Output: a browser-runnable local copy of the page per viewport.
 *
 * The method is deliberately conservative. The source's runtime DOM is parsed
 * and edited in place; nothing is regenerated from a model of the page, and
 * nothing anywhere in this file consults a measured width, height or computed
 * style. A declaration that said `85%` in the source still says `85%` in the
 * clone, and a `@media (min-width: 900px)` block is still a media query rather
 * than a frozen branch.
 *
 * Desktop and mobile are built as SEPARATE variants. The source serves
 * different DOM trees and different runtime (CSS-in-JS) stylesheets per
 * viewport, so merging them would fabricate a page that never existed. Only
 * byte-identical RESOURCES are shared between the two.
 */

/** Script `type` values the browser will execute. */
const EXECUTABLE_SCRIPT_TYPES = new Set([
  "",
  "module",
  "text/javascript",
  "application/javascript",
  "application/x-javascript",
  "text/ecmascript",
  "application/ecmascript",
  "text/jscript",
  "text/babel",
]);

/**
 * `type` values that are not JavaScript but that the BROWSER still acts on.
 *
 * `speculationrules` is a JSON payload, so the "a non-JS type never executes"
 * rule would wave it through — but Chrome reads it and issues real prefetch and
 * prerender navigations to the URLs inside. That is live network traffic to
 * source hosts which no residual-dependency record would ever mention, so it is
 * neutralized like an executable script.
 *
 * `importmap` is deliberately NOT here: it only has meaning for module scripts,
 * and every module script is already inert.
 */
const BROWSER_ACTIONABLE_SCRIPT_TYPES = new Set(["speculationrules"]);

function isExecutableScript(typeAttr: string | null): boolean {
  const type = (typeAttr ?? "").trim().toLowerCase();
  return EXECUTABLE_SCRIPT_TYPES.has(type) || BROWSER_ACTIONABLE_SCRIPT_TYPES.has(type);
}

/** Provider kinds whose whole purpose is to observe the visitor. */
const TRACKING_PROVIDER_KINDS = new Set([
  "analytics",
  "ads",
  "tag-manager",
  "monitoring",
]);

/**
 * Tracking is identified through the Source Package's own provider rules
 * rather than a host list invented here, so the clone inherits one shared
 * vocabulary and a new provider learned in Phase 1 is honoured in Phase 2.
 */
export function isTrackingUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    const provider = matchProvider(parsed.hostname, parsed.pathname);
    return provider !== undefined && TRACKING_PROVIDER_KINDS.has(provider.kind);
  } catch {
    return false;
  }
}

export interface BuildOptions {
  /** Observation run directory containing `viewports/<id>/source-package/`. */
  runDir?: string;
  /** Explicit per-viewport source package dirs; overrides discovery. */
  sourcePackages?: { viewportId: string; dir: string }[];
  outDir: string;
  runId: string;
  policy?: Partial<ResourcePolicy>;
  /** Extra hosts allowed for materialization beyond the observed ones. */
  extraAllowedHosts?: string[];
}

export interface BuildResult {
  outDir: string;
  manifest: PreservationCloneManifest;
  resourceMap: ResourceMap;
  residual: ResidualDependencies;
}

/* ------------------------------------------------------------------ *
 * Discovery
 * ------------------------------------------------------------------ */

export async function discoverSourcePackages(
  runDir: string,
): Promise<{ viewportId: string; dir: string }[]> {
  const viewportsDir = path.join(runDir, "viewports");
  const entries = await fs.readdir(viewportsDir, { withFileTypes: true });
  const found: { viewportId: string; dir: string }[] = [];
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const dir = path.join(viewportsDir, entry.name, "source-package");
    try {
      await fs.access(path.join(dir, "manifest.json"));
      found.push({ viewportId: entry.name, dir });
    } catch {
      // A viewport captured before source packages existed: nothing to preserve.
    }
  }
  found.sort((a, b) => a.viewportId.localeCompare(b.viewportId));
  return found;
}

/* ------------------------------------------------------------------ *
 * Per-viewport preparation (pass A: read + decide, no network)
 * ------------------------------------------------------------------ */

interface PreparedStyle {
  entry: StyleEntry;
  node: P5Element | null;
  representation: StyleRepresentation;
  runtimeDerived: boolean;
  /** CSS text to emit, or null when nothing could be preserved. */
  text: string | null;
  /** Base URL for resolving this sheet's own url(...) references. */
  baseUrl: string | null;
  domMatch: StyleDecision["domMatch"];
  note: string | null;
}

interface PreparedViewport {
  viewportId: string;
  pkg: LoadedSourcePackage;
  doc: P5Document;
  documentUrl: string;
  baseHrefRemoved: string | null;
  styles: PreparedStyle[];
  unpairedStylesheetNodes: P5Element[];
  runtimeHtmlFile: string | null;
  runtimeHtmlSha: string | null;
  bytesIn: number;
}

async function readBlob(pkgDir: string, file: string): Promise<string> {
  return fs.readFile(path.join(pkgDir, file), "utf8");
}

/**
 * Choose ONE preservation representation per StyleEntry.
 *
 * Authored bytes always win. A CSSOM snapshot is used only where authored text
 * never existed — CSS-in-JS libraries that call `insertRule` leave their
 * `<style>` element empty, so the snapshot is the only evidence there is. It is
 * marked `runtime-derived` wherever it is recorded, because it is a record of
 * what had settled at capture time, not source a developer wrote.
 *
 * Emitting both for one entry would apply the same rules twice at two cascade
 * positions, so the builder structurally cannot: this returns a single text.
 */
async function prepareStyle(
  entry: StyleEntry,
  pkgDir: string,
  documentUrl: string,
): Promise<{
  representation: StyleRepresentation;
  runtimeDerived: boolean;
  text: string | null;
  baseUrl: string | null;
  note: string | null;
}> {
  const sheetBase = entry.url ?? documentUrl;
  if (entry.authored.status === "captured" && entry.authored.file) {
    const text = await readBlob(pkgDir, entry.authored.file);
    return {
      representation: entry.sourceType === "linked" || entry.sourceType === "import"
        ? "authored-linked"
        : "authored-inline",
      runtimeDerived: false,
      text,
      baseUrl: sheetBase,
      note: null,
    };
  }
  if (entry.cssomSerialized?.status === "captured" && entry.cssomSerialized.file) {
    const text = await readBlob(pkgDir, entry.cssomSerialized.file);
    return {
      representation: "runtime-derived-cssom",
      runtimeDerived: true,
      text,
      baseUrl: sheetBase,
      note: "authored text never existed (runtime CSSOM insertion); snapshot is what had settled at capture",
    };
  }
  if (entry.sourceType === "linked" && entry.url) {
    return {
      representation: "source-hosted",
      runtimeDerived: false,
      text: null,
      baseUrl: sheetBase,
      note: "authored bytes unavailable in the Source Package; the link still points at the source host",
    };
  }
  return {
    representation: "unresolved",
    runtimeDerived: false,
    text: null,
    baseUrl: sheetBase,
    note:
      entry.cssom?.ruleCount === 0
        ? "style element was empty at capture (0 rules); nothing to preserve"
        : "no authored text and no CSSOM snapshot",
  };
}

function ownerAttributesMatch(entry: StyleEntry, node: P5Element): boolean {
  const owner = entry.ownerAttributes;
  if (!owner || Object.keys(owner).length === 0) return false;
  for (const [name, value] of Object.entries(owner)) {
    if (getAttr(node, name) !== value) return false;
  }
  return true;
}

function nodeKindMatches(
  entry: StyleEntry,
  node: P5Element,
  documentUrl: string,
): boolean {
  const tag = node.tagName.toLowerCase();
  if (entry.sourceType === "linked") {
    if (tag !== "link") return false;
    const href = getAttr(node, "href");
    if (!href || !entry.url) return true;
    try {
      return new URL(href, documentUrl).href === entry.url;
    } catch {
      return false;
    }
  }
  return tag === "style";
}

async function prepareViewport(
  viewportId: string,
  pkgDir: string,
  warnings: string[],
): Promise<PreparedViewport> {
  const pkg = await loadSourcePackage(pkgDir);
  const runtime = pkg.manifest.document.runtimeDom;
  if (runtime.status !== "captured" || !runtime.file) {
    throw new Error(
      `[${viewportId}] runtime DOM is not available in ${pkgDir}; ` +
        `the initial response document is bootstrap evidence and must not be used as the visual clone`,
    );
  }
  const html = await readBlob(pkgDir, runtime.file);
  const doc = parseDocument(html);
  const documentUrl = pkg.manifest.source.finalUrl;

  // A <base href> would silently re-root every relative path in the clone,
  // including the local ones this builder writes. Resolve against it, then drop it.
  let baseHrefRemoved: string | null = null;
  let effectiveBase = documentUrl;
  walkElements(doc, (el) => {
    if (el.tagName.toLowerCase() !== "base") return;
    const href = getAttr(el, "href");
    if (!href) return;
    try {
      effectiveBase = new URL(href, documentUrl).href;
    } catch {
      /* keep the document URL */
    }
    baseHrefRemoved = href;
    removeAttr(el, "href");
  });
  if (baseHrefRemoved) {
    warnings.push(
      `[${viewportId}] removed <base href="${baseHrefRemoved}">; URLs were resolved against it first`,
    );
  }

  // Pair StyleEntries with DOM stylesheet nodes. `order` is an index into
  // document.styleSheets, which is built from exactly these elements in
  // document order — so index pairing is the primary rule, and it is VERIFIED
  // rather than assumed. Nested @import sheets and adopted stylesheets have no
  // element of their own and are handled separately.
  const nodes = stylesheetNodes(doc);
  const pairable = pkg.styles.entries
    .filter((e) => e.sourceType !== "import" && e.sourceType !== "adopted")
    .sort((a, b) => a.order - b.order);

  const assigned = new Map<StyleEntry, { node: P5Element | null; how: StyleDecision["domMatch"] }>();
  const used = new Set<P5Element>();
  const indexPairs = pairable.length === nodes.length;
  if (indexPairs) {
    let allMatch = true;
    for (let i = 0; i < pairable.length; i++) {
      if (!nodeKindMatches(pairable[i], nodes[i], documentUrl)) allMatch = false;
    }
    if (allMatch) {
      for (let i = 0; i < pairable.length; i++) {
        assigned.set(pairable[i], { node: nodes[i], how: "document-order" });
        used.add(nodes[i]);
      }
    }
  }
  if (assigned.size === 0) {
    warnings.push(
      `[${viewportId}] style entries (${pairable.length}) did not pair with DOM stylesheet nodes (${nodes.length}) by document order; falling back to owner-attribute matching`,
    );
    for (const entry of pairable) {
      const node =
        nodes.find((n) => !used.has(n) && ownerAttributesMatch(entry, n)) ??
        nodes.find((n) => !used.has(n) && nodeKindMatches(entry, n, documentUrl)) ??
        null;
      if (node) used.add(node);
      assigned.set(entry, { node, how: node ? "owner-attributes" : "none" });
    }
  }

  const styles: PreparedStyle[] = [];
  for (const entry of pkg.styles.entries.slice().sort((a, b) => a.order - b.order)) {
    const pairing = assigned.get(entry) ?? { node: null, how: "none" as const };
    const prepared = await prepareStyle(entry, pkgDir, documentUrl);
    styles.push({
      entry,
      node: pairing.node,
      domMatch: pairing.how,
      ...prepared,
    });
  }

  return {
    viewportId,
    pkg,
    doc,
    documentUrl: effectiveBase,
    baseHrefRemoved,
    styles,
    unpairedStylesheetNodes: nodes.filter((n) => !used.has(n)),
    runtimeHtmlFile: runtime.file,
    runtimeHtmlSha: runtime.sha256 ?? null,
    bytesIn: html.length,
  };
}

/* ------------------------------------------------------------------ *
 * Candidate collection
 * ------------------------------------------------------------------ */

interface CandidateIndex {
  map: Map<string, ResourceCandidate>;
}

function addCandidate(
  index: CandidateIndex,
  url: string,
  viewportId: string,
  kind: string,
  meta: { dependencyClass?: string; knownBytes?: number | null } = {},
): void {
  const existing = index.map.get(url);
  if (existing) {
    existing.kinds.add(kind);
    existing.usedBy.add(viewportId);
    if (meta.dependencyClass && existing.dependencyClass === "UNKNOWN") {
      existing.dependencyClass = meta.dependencyClass;
    }
    if (existing.knownBytes === null && meta.knownBytes != null) {
      existing.knownBytes = meta.knownBytes;
    }
    return;
  }
  const dependencyClass =
    meta.dependencyClass ?? (isTrackingUrl(url) ? "ANALYTICS" : "UNKNOWN");
  index.map.set(url, {
    url,
    // Provenance is whichever evidence reached this URL FIRST. Inventory is
    // scanned before stylesheets, so a URL only ever seen inside CSS — a
    // background-image the Phase 1 element walk never reached, say — is
    // honestly labelled `css-url` rather than claimed as inventory evidence.
    origin: originForKind(kind),
    kinds: new Set([kind]),
    dependencyClass,
    usedBy: new Set([viewportId]),
    knownBytes: meta.knownBytes ?? null,
  });
}

function originForKind(kind: string): ResourceOrigin {
  if (kind === "stylesheet") return "stylesheet";
  if (kind === "css-url") return "css-url";
  return "asset-inventory";
}

function assetLookup(assets: AssetEntry[]): Map<string, AssetEntry[]> {
  const map = new Map<string, AssetEntry[]>();
  for (const asset of assets) {
    if (!asset.url) continue;
    const list = map.get(asset.url);
    if (list) list.push(asset);
    else map.set(asset.url, [asset]);
  }
  return map;
}

function resolveUrl(value: string, base: string): string | null {
  if (isInertUrl(value)) return null;
  try {
    return new URL(value.trim(), base).href;
  } catch {
    return null;
  }
}

/* ------------------------------------------------------------------ *
 * Build
 * ------------------------------------------------------------------ */

export async function buildPreservationClone(
  options: BuildOptions,
): Promise<BuildResult> {
  const warnings: string[] = [];
  const packages =
    options.sourcePackages ??
    (options.runDir ? await discoverSourcePackages(options.runDir) : []);
  if (packages.length === 0) {
    throw new Error("no source packages found; pass --run <observation run dir>");
  }

  const prepared: PreparedViewport[] = [];
  for (const pkg of packages) {
    prepared.push(await prepareViewport(pkg.viewportId, pkg.dir, warnings));
  }

  const first = prepared[0];
  const sourceUrl = first.pkg.manifest.source.finalUrl;
  const sourceOrigin = first.pkg.manifest.source.origin;
  const sourceHost = first.pkg.manifest.source.route.host;

  /* ---- pass A: collect every resource the clone might localize ---- */

  const index: CandidateIndex = { map: new Map() };
  const observedHosts = new Set<string>();

  /** Phase 1 `host` fields may carry a port; the fetch allowlist must not. */
  const stripPort = (host: string): string => host.replace(/:\d+$/, "");

  for (const view of prepared) {
    for (const asset of view.pkg.assets.entries) {
      if (asset.host) observedHosts.add(stripPort(asset.host));
      if (!asset.url || asset.scheme !== "http" && asset.scheme !== "https") continue;
      addCandidate(index, asset.url, view.viewportId, asset.kind, {
        dependencyClass: asset.dependencyClass,
        knownBytes: asset.network?.bytes ?? null,
      });
    }
    for (const net of view.pkg.network.entries) {
      if (net.host) observedHosts.add(stripPort(net.host));
    }
    // url(...) inside every preserved stylesheet, resolved the way a browser
    // would: against the sheet's own URL for linked CSS, against the document
    // for a <style> tag.
    for (const style of view.styles) {
      if (!style.text) continue;
      for (const ref of collectCssUrlRefs(style.text, style.baseUrl)) {
        if (!ref.resolved) continue;
        addCandidate(index, ref.resolved, view.viewportId, "css-url");
      }
    }
    // Resource URLs held in element attributes, plus url(...) inside inline styles.
    walkElements(view.doc, (el) => {
      for (const spec of urlAttrsFor(el)) {
        if (spec.role !== "resource" && spec.role !== "srcset") continue;
        const value = getAttr(el, spec.attr);
        if (!value) continue;
        const raws =
          spec.role === "srcset" ? parseSrcset(value).map((c) => c.url) : [value];
        for (const raw of raws) {
          const resolved = resolveUrl(raw, view.documentUrl);
          if (!resolved) continue;
          addCandidate(index, resolved, view.viewportId, domKindFor(el, spec.attr));
        }
      }
      const inline = getAttr(el, "style");
      if (inline && inline.includes("url(")) {
        for (const ref of collectCssUrlRefs(inline, view.documentUrl)) {
          if (ref.resolved) addCandidate(index, ref.resolved, view.viewportId, "background-image");
        }
      }
    });
  }

  // The fetch allowlist is derived from capture evidence: only hosts the source
  // page actually contacted are reachable, never an open-ended fetcher.
  const allowedHosts = new Set<string>([
    ...observedHosts,
    ...[...index.map.keys()].map(hostOf).filter(Boolean),
    ...(options.extraAllowedHosts ?? []),
  ]);

  const policy: ResourcePolicy = {
    allowedHosts,
    maxAssetBytes: options.policy?.maxAssetBytes ?? DEFAULT_RESOURCE_POLICY.maxAssetBytes,
    maxMediaBytes: options.policy?.maxMediaBytes ?? DEFAULT_RESOURCE_POLICY.maxMediaBytes,
    timeoutMs: options.policy?.timeoutMs ?? DEFAULT_RESOURCE_POLICY.timeoutMs,
    concurrency: options.policy?.concurrency ?? DEFAULT_RESOURCE_POLICY.concurrency,
    spacingMs: options.policy?.spacingMs ?? DEFAULT_RESOURCE_POLICY.spacingMs,
    allowPrivateHostPorts: options.policy?.allowPrivateHostPorts,
    lookup: options.policy?.lookup,
    allowedPorts: options.policy?.allowedPorts,
    userAgent: options.policy?.userAgent,
  };

  /* ---- pass B: materialize ---- */

  const outDir = options.outDir;
  await fs.mkdir(path.join(outDir, "assets"), { recursive: true });
  await fs.mkdir(path.join(outDir, "styles"), { recursive: true });
  await fs.mkdir(path.join(outDir, "scripts"), { recursive: true });

  const materialized = await materializeResources(
    [...index.map.values()],
    path.join(outDir, "assets"),
    "assets",
    policy,
  );
  const resourceRecords = [...materialized.records];
  const localByUrl = materialized.localByUrl;

  /* ---- preserved script bytes (Phase 3 material, never referenced) ---- */

  /** viewport -> (script src -> preserved local path). Kept per viewport so a
   *  URL that served different bytes to desktop and mobile cannot bleed across. */
  const scriptBytesByViewport = new Map<string, Map<string, string>>();
  /** One record per distinct preserved script, NOT one per viewport occurrence:
   *  double-counting here would inflate the resource ledger humans read. */
  const scriptResources = new Map<
    string,
    { record: Omit<ResourceRecord, "usedBy" | "shared">; usedBy: Set<string> }
  >();
  let preservedScriptBytes = 0;
  for (const view of prepared) {
    const byUrl = new Map<string, string>();
    scriptBytesByViewport.set(view.viewportId, byUrl);
    for (const entry of view.pkg.scripts.entries) {
      if (entry.body.status !== "captured" || !entry.body.file) continue;
      const buffer = await fs.readFile(path.join(view.pkg.dir, entry.body.file));
      const hash = sha256(buffer);
      const relative = `scripts/${hash}.js`;
      const absolute = path.join(outDir, relative);
      try {
        await fs.access(absolute);
      } catch {
        await fs.writeFile(absolute, buffer);
        preservedScriptBytes += buffer.byteLength;
      }
      if (entry.src) byUrl.set(entry.src, relative);
      // Inline scripts are keyed by content hash rather than entry id: ids are
      // per-package, so `inline:sc0001` means different code in each viewport.
      const key = entry.src ?? `inline-script:${hash}`;
      const existing = scriptResources.get(key);
      if (existing) {
        existing.usedBy.add(view.viewportId);
        continue;
      }
      scriptResources.set(key, {
        usedBy: new Set([view.viewportId]),
        record: {
          sourceUrl: key,
          host: entry.src ? hostOf(entry.src) : sourceHost,
          origin: "script-body",
          kinds: ["script"],
          dependencyClass: entry.dependencyClass,
          status: "from-source-package",
          httpStatus: null,
          mime: entry.body.contentType ?? null,
          bytes: buffer.byteLength,
          sha256: hash,
          localPath: relative,
          redirectChain: [],
          detail: "preserved bytes only; never referenced by the clone (Phase 3 material)",
        },
      });
    }
  }
  for (const { record, usedBy } of scriptResources.values()) {
    resourceRecords.push({ ...record, usedBy: [...usedBy].sort(), shared: usedBy.size > 1 });
  }

  /* ---- pass C: rewrite + emit ---- */

  const residualIndex = new Map<string, ResidualDependency>();
  const addResidual = (
    url: string,
    reason: ResidualReason,
    stillRequested: boolean,
    viewportId: string,
    kind: string,
    dependencyClass: string,
    sample: string | null,
    detail: string | null,
  ): void => {
    const key = `${reason}|${url}`;
    const existing = residualIndex.get(key);
    if (existing) {
      existing.occurrences += 1;
      if (!existing.usedBy.includes(viewportId)) existing.usedBy.push(viewportId);
      if (!existing.kinds.includes(kind)) existing.kinds.push(kind);
      return;
    }
    residualIndex.set(key, {
      url,
      host: hostOf(url) || sourceHost,
      reason,
      dependencyClass,
      kinds: [kind],
      stillRequestedFromSource: stillRequested,
      usedBy: [viewportId],
      occurrences: 1,
      sampleElementPath: sample,
      detail,
    });
  };

  // Only fetchable resources belong in this lookup. Preserved script bytes
  // share the URL space but are never referenced by the document, and letting
  // one shadow a real asset record would misclassify that asset's rewrite.
  const recordByUrl = new Map(
    resourceRecords.filter((r) => r.origin !== "script-body").map((r) => [r.sourceUrl, r]),
  );
  const variants: Variant[] = [];
  const styleFileByHash = new Map<string, string>();

  for (const view of prepared) {
    const { doc, documentUrl, viewportId } = view;
    const rewrites = {
      localizedAttributes: 0,
      absolutizedAttributes: 0,
      srcsetCandidates: 0,
      neutralizedEmbeds: 0,
      neutralizedTrackers: 0,
      neutralizedNavigations: 0,
      neutralizedEventHandlers: 0,
      cssUrlsRewritten: 0,
    };

    /** Clone-root-relative -> path usable from `<viewport>/index.html`. */
    const fromDocument = (relative: string): string => `../${relative}`;

    const localFor = (resolved: string): string | null => localByUrl.get(resolved) ?? null;

    /* ---- stylesheets ---- */

    const decisions: StyleDecision[] = [];
    for (const style of view.styles) {
      const { entry, node } = style;
      let localPath: string | null = null;
      let bytes = 0;
      let hash: string | null = null;
      let cssUrls = 0;
      let representation = style.representation;
      let note = style.note;

      if (style.text !== null) {
        const rewritten = rewriteCssUrls(style.text, style.baseUrl, (ref) => {
          if (!ref.resolved || isNonLocalizableCssUrl(ref.value)) return null;
          const local = localFor(ref.resolved);
          if (local) {
            // Both `styles/*.css` and `<viewport>/index.html` sit one level
            // below the clone root, so the same `../` prefix is correct for
            // an inline <style> and for an emitted stylesheet file alike.
            return fromDocument(local);
          }
          const record = recordByUrl.get(ref.resolved);
          const dependencyClass = record?.dependencyClass ?? "UNKNOWN";
          if (dependencyClass === "ANALYTICS" || isTrackingUrl(ref.resolved)) {
            addResidual(ref.resolved, "analytics-neutralized", false, viewportId, "css-url", dependencyClass, null, "tracker reference left unresolved in CSS");
            return null;
          }
          addResidual(
            ref.resolved,
            record && record.status === "skipped-over-budget" ? "over-size-budget" : "fetch-failed",
            true,
            viewportId,
            "css-url",
            dependencyClass,
            null,
            record?.detail ?? null,
          );
          // Absolutize so the browser reaches the source rather than 404ing
          // against localhost; the dependency is recorded above.
          return ref.resolved;
        });
        cssUrls = rewritten.rewritten;
        rewrites.cssUrlsRewritten += cssUrls;
        bytes = Buffer.byteLength(rewritten.css);
        hash = sha256(Buffer.from(rewritten.css));

        const inlineRepresentation =
          representation === "authored-inline" || representation === "runtime-derived-cssom";
        if (node && node.tagName.toLowerCase() === "style" && inlineRepresentation) {
          // Keep it exactly where the source had it: same element, same
          // position, same cascade slot. Nothing is hoisted or merged.
          setRawText(node, rewritten.css);
          if (style.runtimeDerived) setAttr(node, "data-preservation-style", "runtime-derived");
        } else {
          let relative = styleFileByHash.get(hash);
          if (!relative) {
            relative = `styles/${hash}.css`;
            await fs.writeFile(path.join(outDir, relative), rewritten.css);
            styleFileByHash.set(hash, relative);
          }
          localPath = relative;
          if (node && node.tagName.toLowerCase() === "link") {
            setAttr(node, "href", fromDocument(relative));
            setAttr(node, "data-preservation-source-href", entry.url ?? "");
            if (style.runtimeDerived) setAttr(node, "data-preservation-style", "runtime-derived");
          } else if (node && node.tagName.toLowerCase() === "style") {
            setRawText(node, rewritten.css);
            localPath = null;
          } else if (entry.sourceType === "import" && entry.url) {
            // Nested @import: no element of its own. Registering the local
            // path lets the PARENT sheet's @import url(...) point at it.
            localByUrl.set(entry.url, relative);
          } else {
            note = [note, "preserved as a file: no matching DOM node"].filter(Boolean).join("; ");
          }
        }
      } else if (representation === "source-hosted" && node && entry.url) {
        setAttr(node, "href", entry.url);
        addResidual(entry.url, "stylesheet-unavailable", true, viewportId, "stylesheet", "CSS", elementPath(node), style.note);
      } else if (representation === "unresolved" && node) {
        setAttr(node, "data-preservation-style", "unresolved");
      }

      decisions.push({
        entryId: entry.id,
        order: entry.order,
        sourceType: entry.sourceType,
        declaredIn: entry.declaredIn,
        url: entry.url ?? null,
        media: entry.media ?? null,
        representation,
        runtimeDerived: style.runtimeDerived,
        bytes,
        sha256: hash,
        localPath,
        domMatch: style.domMatch,
        domNode: node ? elementPath(node) : null,
        cssUrlsRewritten: cssUrls,
        note,
      });
    }

    for (const orphan of view.unpairedStylesheetNodes) {
      const href = getAttr(orphan, "href");
      if (!href) continue;
      const resolved = resolveUrl(href, documentUrl);
      if (resolved) {
        setAttr(orphan, "href", resolved);
        addResidual(resolved, "stylesheet-unavailable", true, viewportId, "stylesheet", "CSS", elementPath(orphan), "stylesheet node had no matching StyleEntry");
      }
    }

    /* ---- scripts, embeds, handlers, attributes ---- */

    const scriptRecords: ScriptRecord[] = [];
    const scriptEntryBySrc = new Map<string, ScriptEntry>();
    for (const entry of view.pkg.scripts.entries) {
      if (entry.src) scriptEntryBySrc.set(entry.src, entry);
    }
    const assetsByUrl = assetLookup(view.pkg.assets.entries);
    const hintLinks: P5Element[] = [];

    walkElements(doc, (el) => {
      const tag = el.tagName.toLowerCase();

      // Inline event handlers are source JS with a trigger attached. They do
      // not run at load, but a human clicking during visual review would run
      // them, which is exactly the "source JS mutates the preservation DOM"
      // failure Phase 2 must not have. Moved aside, not deleted.
      for (const attribute of [...el.attrs]) {
        if (!/^on[a-z]+$/i.test(attribute.name)) continue;
        removeAttr(el, attribute.name);
        setAttr(el, `data-preservation-${attribute.name.toLowerCase()}`, attribute.value);
        rewrites.neutralizedEventHandlers += 1;
      }

      if (tag === "script") {
        const typeAttr = getAttr(el, "type");
        const src = getAttr(el, "src");
        const entry = src
          ? scriptEntryBySrc.get(resolveUrl(src, documentUrl) ?? src) ?? null
          : null;
        const preservedBytesPath = src
          ? scriptBytesByViewport.get(viewportId)?.get(resolveUrl(src, documentUrl) ?? src) ?? null
          : null;
        if (!isExecutableScript(typeAttr)) {
          // application/json, ld+json, importmap, speculationrules, templates:
          // data the browser never executes. Kept verbatim — __NEXT_DATA__ is
          // source evidence, and leaving it inert costs nothing.
          scriptRecords.push({
            action: "kept-data",
            typeAttr,
            src: src ?? null,
            host: src ? hostOf(resolveUrl(src, documentUrl) ?? src) : null,
            dependencyClass: entry?.dependencyClass ?? "UNKNOWN",
            thirdParty: entry?.thirdParty ?? false,
            inlineBytes: rawText(el).length,
            preservedBytesPath,
          });
          return;
        }
        setAttr(el, "data-preservation-neutralized", "true");
        setAttr(el, "data-preservation-original-type", typeAttr ?? "");
        if (src) {
          const resolved = resolveUrl(src, documentUrl) ?? src;
          setAttr(el, "data-preservation-src", resolved);
          removeAttr(el, "src");
          if (preservedBytesPath) {
            setAttr(el, "data-preservation-bytes", fromDocument(preservedBytesPath));
          }
        }
        // A non-JavaScript `type` is the browser's own inertness rule; no
        // source bytes are discarded, they simply never execute.
        setAttr(el, "type", "text/plain");
        scriptRecords.push({
          action: src ? "neutralized-src" : "neutralized-inline",
          typeAttr,
          src: src ? resolveUrl(src, documentUrl) ?? src : null,
          host: src ? hostOf(resolveUrl(src, documentUrl) ?? src) : null,
          dependencyClass: entry?.dependencyClass ?? "UNKNOWN",
          thirdParty: entry?.thirdParty ?? false,
          inlineBytes: rawText(el).length,
          preservedBytesPath,
        });
        return;
      }

      if (tag === "meta") {
        const httpEquiv = (getAttr(el, "http-equiv") ?? "").trim().toLowerCase();
        if (httpEquiv === "refresh" && getAttr(el, "content") !== null) {
          // A meta refresh would navigate the reviewer's browser away from the
          // clone, usually straight back to the source. Kept as evidence, inert.
          setAttr(el, "data-preservation-refresh", getAttr(el, "content") ?? "");
          removeAttr(el, "content");
          rewrites.neutralizedNavigations += 1;
        }
        return;
      }

      if (tag === "link" && relTokens(el).some((r) => HINT_RELS.has(r))) {
        // Preload/prefetch/preconnect are performance hints with no visual
        // contribution; keeping them would only make the clone phone home.
        hintLinks.push(el);
        return;
      }

      const inline = getAttr(el, "style");
      if (inline && inline.includes("url(")) {
        const rewritten = rewriteCssUrls(inline, documentUrl, (ref) => {
          if (!ref.resolved) return null;
          const local = localFor(ref.resolved);
          if (local) {
            rewrites.localizedAttributes += 1;
            return fromDocument(local);
          }
          return ref.resolved;
        });
        if (rewritten.rewritten > 0) {
          setAttr(el, "style", rewritten.css);
          rewrites.cssUrlsRewritten += rewritten.rewritten;
        }
      }

      for (const spec of urlAttrsFor(el)) {
        const value = getAttr(el, spec.attr);
        if (value === null) continue;

        if (spec.role === "embed") {
          if (value.trim() === "") continue;
          const resolved = resolveUrl(value, documentUrl);
          const tracking = resolved !== null && isTrackingUrl(resolved);
          setAttr(el, "data-preservation-src", resolved ?? value);
          setAttr(
            el,
            "data-preservation-neutralized",
            tracking ? "tracking" : "external-embed",
          );
          removeAttr(el, spec.attr);
          rewrites.neutralizedEmbeds += 1;
          if (tracking) rewrites.neutralizedTrackers += 1;
          if (resolved) {
            addResidual(
              resolved,
              tracking ? "analytics-neutralized" : "external-embed",
              false,
              viewportId,
              "iframe",
              tracking ? "ANALYTICS" : "EMBED",
              elementPath(el),
              tracking
                ? "tracking frame removed; no source tracking is reproduced"
                : "provider runtime is not cloned in Phase 2",
            );
          }
          continue;
        }

        if (spec.role === "navigation") {
          if (/^javascript:/i.test(value.trim())) {
            setAttr(el, `data-preservation-${spec.attr}`, value);
            setAttr(el, spec.attr, "#");
            rewrites.neutralizedEventHandlers += 1;
            continue;
          }
          if (isInertUrl(value)) continue;
          const resolved = resolveUrl(value, documentUrl);
          if (!resolved) continue;
          // Route expansion is out of scope, so links keep their source
          // meaning: absolutized to the source, never invented locally.
          setAttr(el, spec.attr, resolved);
          rewrites.absolutizedAttributes += 1;
          addResidual(resolved, "navigation-link", false, viewportId, tag, "DOCUMENT", null, "internal route not cloned (homepage only)");
          continue;
        }

        if (spec.role === "srcset") {
          if (value.trim() === "") continue;
          const candidates = parseSrcset(value);
          let changed = false;
          for (const candidate of candidates) {
            const resolved = resolveUrl(candidate.url, documentUrl);
            if (!resolved) continue;
            rewrites.srcsetCandidates += 1;
            const local = localFor(resolved);
            if (local) {
              candidate.url = fromDocument(local);
              rewrites.localizedAttributes += 1;
            } else {
              candidate.url = resolved;
              rewrites.absolutizedAttributes += 1;
              noteUnlocalized(resolved, el, tag, viewportId);
            }
            changed = true;
          }
          if (changed) setAttr(el, spec.attr, serializeSrcset(candidates));
          continue;
        }

        // spec.role === "resource"
        if (isInertUrl(value)) continue;
        const resolved = resolveUrl(value, documentUrl);
        if (!resolved) continue;
        const local = localFor(resolved);
        if (local) {
          setAttr(el, spec.attr, fromDocument(local));
          rewrites.localizedAttributes += 1;
          continue;
        }
        const record = recordByUrl.get(resolved);
        if (record?.dependencyClass === "ANALYTICS" || isTrackingUrl(resolved)) {
          // The URL is kept as evidence but no longer loads: an inert
          // data-* attribute issues no request.
          setAttr(el, `data-preservation-${spec.attr}`, resolved);
          setAttr(el, "data-preservation-neutralized", "tracking");
          removeAttr(el, spec.attr);
          rewrites.neutralizedTrackers += 1;
          addResidual(resolved, "analytics-neutralized", false, viewportId, tag, "ANALYTICS", elementPath(el), "tracking beacon removed; no source tracking is reproduced");
          continue;
        }
        setAttr(el, spec.attr, resolved);
        rewrites.absolutizedAttributes += 1;
        noteUnlocalized(resolved, el, tag, viewportId);
      }
    });

    function noteUnlocalized(
      resolved: string,
      el: P5Element,
      tag: string,
      vp: string,
    ): void {
      const record = recordByUrl.get(resolved);
      const kinds = assetsByUrl.get(resolved)?.map((a) => a.kind) ?? [tag];
      const reason: ResidualReason =
        record?.status === "skipped-over-budget"
          ? "over-size-budget"
          : record?.status === "skipped-embed"
            ? "external-embed"
            : record
              ? "fetch-failed"
              : "non-http-scheme";
      addResidual(
        resolved,
        reason,
        true,
        vp,
        kinds[0] ?? tag,
        record?.dependencyClass ?? "UNKNOWN",
        elementPath(el),
        record?.detail ?? null,
      );
    }

    for (const hint of hintLinks) removeElement(hint);

    const html = serializeDocument(doc);
    const htmlPath = `${viewportId}/index.html`;
    await fs.mkdir(path.join(outDir, viewportId), { recursive: true });
    await fs.writeFile(path.join(outDir, htmlPath), html, "utf8");

    const styleCounts: Record<string, number> = {};
    for (const decision of decisions) {
      styleCounts[decision.representation] = (styleCounts[decision.representation] ?? 0) + 1;
    }

    variants.push({
      viewportId,
      viewport: {
        width: view.pkg.manifest.source.viewport.width,
        height: view.pkg.manifest.source.viewport.height,
        isMobile: view.pkg.manifest.source.viewport.isMobile,
        deviceScaleFactor: view.pkg.manifest.source.viewport.deviceScaleFactor,
      },
      htmlPath,
      previewPath: `/${viewportId}/`,
      domSource: "runtime-dom",
      domSourceFile: view.runtimeHtmlFile ?? "",
      domSourceSha256: view.runtimeHtmlSha,
      provenance: {
        sourcePackageDir: view.pkg.dir,
        sourcePackageContentHash: view.pkg.manifest.contentHash,
        responseHtmlFile: view.pkg.manifest.document.initial.file ?? null,
        runtimeHtmlFile: view.runtimeHtmlFile,
      },
      styles: decisions,
      styleCounts,
      scripts: scriptRecords,
      scriptCounts: {
        total: scriptRecords.length,
        neutralized: scriptRecords.filter((s) => s.action !== "kept-data").length,
        keptData: scriptRecords.filter((s) => s.action === "kept-data").length,
        bytesPreserved: scriptRecords.filter((s) => s.preservedBytesPath).length,
        executed: 0,
      },
      rewrites,
      bytes: Buffer.byteLength(html),
    });
  }

  /* ---- artifact files ---- */

  const localized = resourceRecords.filter((r) => r.localPath !== null);
  const failed = resourceRecords.filter(
    (r) => r.localPath === null && !String(r.status).startsWith("skipped"),
  );
  const skipped = resourceRecords.filter(
    (r) => r.localPath === null && String(r.status).startsWith("skipped"),
  );
  const shared = localized.filter((r) => r.usedBy.length > 1);

  const resourceMap: ResourceMap = ResourceMapSchema.parse({
    schemaVersion: SCHEMA_VERSION,
    createdAt: new Date().toISOString(),
    byHash: materialized.byHash,
    resources: resourceRecords,
    counts: {
      total: resourceRecords.length,
      localized: localized.length,
      shared: shared.length,
      viewportSpecific: localized.length - shared.length,
      skipped: skipped.length,
      failed: failed.length,
      dedupedByHash: materialized.dedupedByHash,
    },
  });

  const dependencies = [...residualIndex.values()].sort((a, b) => {
    if (a.reason !== b.reason) return a.reason.localeCompare(b.reason);
    return a.url.localeCompare(b.url);
  });
  const residualCounts: Record<string, number> = {};
  for (const dependency of dependencies) {
    residualCounts[dependency.reason] = (residualCounts[dependency.reason] ?? 0) + 1;
  }
  const residual: ResidualDependencies = ResidualDependenciesSchema.parse({
    schemaVersion: SCHEMA_VERSION,
    createdAt: new Date().toISOString(),
    stillRequestedFromSourceCount: dependencies.filter((d) => d.stillRequestedFromSource).length,
    counts: residualCounts,
    dependencies,
  });

  const manifest: PreservationCloneManifest = PreservationCloneManifestSchema.parse({
    schemaVersion: SCHEMA_VERSION,
    packageKind: PACKAGE_KIND,
    builder: { name: BUILDER_NAME, version: BUILDER_VERSION },
    runId: options.runId,
    createdAt: new Date().toISOString(),
    source: {
      runDir: options.runDir ?? path.dirname(path.dirname(path.dirname(first.pkg.dir))),
      url: sourceUrl,
      origin: sourceOrigin,
      host: sourceHost,
      sourcePackageSchemaVersion: first.pkg.manifest.schemaVersion,
      capturedAt: first.pkg.manifest.source.capturedAt,
    },
    policy: {
      maxAssetBytes: policy.maxAssetBytes,
      maxMediaBytes: policy.maxMediaBytes,
      fetchTimeoutMs: policy.timeoutMs,
      concurrency: policy.concurrency,
      allowedHosts: [...allowedHosts].sort(),
      geometryReconstruction: "none",
      sourceJsExecution: "disabled",
      apiReplay: "none",
    },
    variants,
    resources: {
      total: resourceRecords.length,
      localized: localized.length,
      shared: shared.length,
      viewportSpecific: localized.length - shared.length,
      skipped: skipped.length,
      failed: failed.length,
    },
    residual: {
      total: dependencies.length,
      stillRequestedFromSource: residual.stillRequestedFromSourceCount,
    },
    files: {
      resourceMap: "resource-map.json",
      residualDependencies: "residual-dependencies.json",
    },
    warnings,
    limitations: buildLimitations(preservedScriptBytes, residual),
  });

  await fs.writeFile(
    path.join(outDir, "manifest.json"),
    `${JSON.stringify(manifest, null, 2)}\n`,
  );
  await fs.writeFile(
    path.join(outDir, "resource-map.json"),
    `${JSON.stringify(resourceMap, null, 2)}\n`,
  );
  await fs.writeFile(
    path.join(outDir, "residual-dependencies.json"),
    `${JSON.stringify(residual, null, 2)}\n`,
  );
  await fs.writeFile(path.join(outDir, "index.html"), renderIndex(manifest), "utf8");

  return { outDir, manifest, resourceMap, residual };
}

function domKindFor(el: P5Element, attr: string): string {
  const tag = el.tagName.toLowerCase();
  if (tag === "img") return attr === "srcset" ? "srcset-candidate" : "image";
  if (tag === "source") return attr === "srcset" ? "srcset-candidate" : "picture-source";
  if (tag === "video") return attr === "poster" ? "video-poster" : "video";
  if (tag === "audio") return "audio";
  if (tag === "link") return "link";
  if (tag === "use" || tag === "image") return "svg-external";
  return tag;
}

function buildLimitations(
  preservedScriptBytes: number,
  residual: ResidualDependencies,
): string[] {
  return [
    "The clone is markup + CSS only. The runtime DOM is a snapshot: it carries no event listeners, no framework state and no component instances.",
    "Source JavaScript is preserved as bytes but never executed. Carousels do not advance, menus and modals do not open, hover/scroll JS behaviour is absent, and nothing refetches.",
    `Preserved source JS bytes: ${preservedScriptBytes} bytes under scripts/ — referenced by no document; execution independence remains UNKNOWN (Phase 3).`,
    "No source API was implemented, mocked or replayed. API-driven content is frozen exactly as it had rendered at capture time.",
    "Desktop and mobile are separate variants because the source serves different DOM trees and different runtime stylesheets per viewport. The clone does not switch trees on resize; each variant only exercises its own CSS.",
    "No geometry was used: no measured width, height or computed style informs any emitted declaration.",
    residual.stillRequestedFromSourceCount > 0
      ? `NOT source-independent: ${residual.stillRequestedFromSourceCount} resource(s) are still fetched from source hosts. See residual-dependencies.json.`
      : "No resource is fetched from a source host at render time.",
    "Third-party embeds (chat widgets, video providers, tag managers) are neutralized, not cloned.",
  ];
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** A plain index so a reviewer can reach both variants without reading JSON. */
function renderIndex(manifest: PreservationCloneManifest): string {
  const rows = manifest.variants
    .map(
      (v) => `      <li>
        <a href="${escapeHtml(v.previewPath)}">${escapeHtml(v.viewportId)}</a>
        <span>${v.viewport.width}×${v.viewport.height}${v.viewport.isMobile ? " · mobile UA" : ""}</span>
      </li>`,
    )
    .join("\n");
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="robots" content="noindex,nofollow">
<title>Preservation Clone — ${escapeHtml(manifest.source.host)}</title>
<style>
  body { font: 15px/1.6 system-ui, sans-serif; margin: 3rem auto; max-width: 46rem; padding: 0 1rem; }
  code { background: #f3f3f3; padding: 0.1em 0.35em; border-radius: 3px; }
  li { margin: 0.4rem 0; }
  span { color: #666; margin-left: 0.6rem; }
  p.note { color: #666; }
</style>
</head>
<body>
  <h1>Preservation Clone</h1>
  <p>Source: <code>${escapeHtml(manifest.source.url)}</code><br>
     Captured: <code>${escapeHtml(manifest.source.capturedAt)}</code><br>
     Built: <code>${escapeHtml(manifest.createdAt)}</code></p>
  <h2>Variants</h2>
  <ul>
${rows}
  </ul>
  <p class="note">Source JavaScript is preserved but not executed, so carousels, menus and modals are inert by design.
  ${manifest.residual.stillRequestedFromSource} resource(s) are still loaded from the source host.</p>
</body>
</html>
`;
}
