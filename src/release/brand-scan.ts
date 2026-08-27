/**
 * GED-F — source-brand SURFACE scan and the `brand-leak` requirement kind
 * (Task 27).
 *
 * WHY THIS EXISTS. Brand leakage was previously only a content-run WARNING
 * (collect.ts pushed one line into `warnings[]`) plus two production numbers
 * that do not mean what they look like:
 *
 *   bake.ts   counts `https://<host>` for hosts derived from NETWORK REQUESTS
 *             only — hrefs, visible text, aria-labels and symbol ids are
 *             invisible to it
 *   qa.ts     `sourceHostMentionsInHtml` has no consumer, and the
 *             `external-requests-only-known-residual` assertion filters
 *             observed hosts against `knownResidualSourceHosts`, which for
 *             linear IS the source host — vacuous by construction
 *
 * So this module produces a STRUCTURED, artifact-cited report and turns it
 * into requirements the release gate can carry.
 *
 * DETECTOR ONLY. `GED_F_NEUTRALIZATION_DEFAULT` is `false` and nothing here
 * rewrites an artifact. Automatic neutralization is sequenced AFTER Content V2
 * and AFTER region/route enablement (both change which routes are uninjected),
 * and it belongs at BAKE — never in the template compiler, whose grouping is
 * under frozen 46/46 parity.
 *
 * ZERO INVENTED SEVERITY. `BRAND_SURFACE_POLICY` says, per surface, whether we
 * can see it at all and where the evidence comes from; `brandFindingSeverity`
 * says what blocks. Both are data, not scattered conditionals.
 */
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import path from "node:path";

import {
  BRAND_SURFACES,
  brandTokensFromHost,
  scanElementProps,
  scanInlineSvgMarkup,
  type BrandSurface,
} from "../content-injection/brand-surfaces.js";
import { ROUTE_MAP_FILE, RUNTIME_DATA_DIR } from "../reconstruction/types.js";
import { TEMPLATE_APP_DIR } from "../recon-template/types.js";
import type { Requirement, RequirementSeverity } from "./types.js";

export const BRAND_SURFACE_REPORT_SCHEMA_NAME = "brand-surface-report-v1";
export const BRAND_SURFACE_REPORT_SCHEMA_VERSION = 1;

/**
 * GED-F automatic neutralization. OFF, and asserted OFF by
 * `smoke:content-injection`. Turning it on would rewrite every source anchor,
 * which `scripts/smoke-production.ts` (residual occurrences === 1) proves is a
 * behaviour change, not a cleanup.
 */
export const GED_F_NEUTRALIZATION_DEFAULT = false as const;

export type BrandFindingOrigin =
  /** Runtime IR: the source's own markup, BEFORE any content overlay. */
  | "template-default"
  /** Content run: the value that will actually ship still carries the brand. */
  | "injected-value"
  /** Content run: the operator asked for a change the engine could not apply. */
  | "engine-blocked"
  /** Production QA: measured on the SERVED package. */
  | "served-html";

export interface BrandFinding {
  surface: BrandSurface;
  origin: BrandFindingOrigin;
  /** Template route, or "global" for a site-wide content unit. */
  route: string;
  value: string;
  matched: string;
  sourceUrl: string | null;
  /** Editable slot this finding can be written through, when one exists. */
  slotKey: string | null;
  /** data-wr-node identity (runtime IR findings only). NO new DOM attribute. */
  nodeId: string | null;
  evidenceFile: string;
  evidencePointer: string;
  suggestedResolution: string;
}

export interface BrandSurfaceReport {
  schemaName: typeof BRAND_SURFACE_REPORT_SCHEMA_NAME;
  schemaVersion: typeof BRAND_SURFACE_REPORT_SCHEMA_VERSION;
  host: string;
  brandTokens: string[];
  neutralization: { enabled: boolean; default: "OFF"; basis: string };
  scanned: {
    routes: number;
    elementNodes: number;
    inlineSvgNodes: number;
    contentWarnings: number;
    /**
     * Surfaces this scan could not read on THIS lineage. `missing-artifact` is
     * a gap worth an operator warning; `not-yet-measured` is the ordinary
     * "that evidence only exists further down the pipeline". Surfaces no
     * artifact records at all are declared statically in BRAND_SURFACE_POLICY
     * (detection: "unavailable"), not repeated here.
     */
    unavailable: Array<{ surface: BrandSurface; reason: string; kind: "missing-artifact" | "not-yet-measured" }>;
  };
  counts: Record<BrandSurface, number>;
  /** Capped sample, deterministic order. `countsBySurface` carries the truth. */
  findings: BrandFinding[];
  truncated: number;
}

// ---------------------------------------------------------------------------
// Surface policy — what we can see, where the evidence lives, what blocks
// ---------------------------------------------------------------------------

export interface BrandSurfacePolicyEntry {
  /** `implemented` here; `elsewhere` = another kind already owns it. */
  detection: "implemented" | "elsewhere" | "unavailable";
  evidenceSource: string;
  /**
   * Whether a finding on this surface CAN be release-blocking. It still needs
   * a reachable resolution — see `brandFindingSeverity`.
   */
  canBlock: boolean;
  basis: string;
}

/**
 * The blocking half of this table is the settled decision: release-blocking
 * ONLY where production independence actually requires it. A source-brand
 * mention in an uninjected body paragraph is not the same class of problem as
 * a source logo asset, and an uninjected route is ALREADY carried by the
 * `content-route` blocker — double-blocking it would only make the checklist
 * longer, never the site more independent.
 */
export const BRAND_SURFACE_POLICY: Record<BrandSurface, BrandSurfacePolicyEntry> = {
  "visible-text": {
    detection: "implemented",
    evidenceSource: "content-run report/brand-leak.json (effective, post-overlay slot values)",
    canBlock: true,
    basis:
      "a shipped value that still names the source is the site telling a visitor it IS the source; " +
      "it is slot-bound, so an authored replacement clears it",
  },
  "source-url": {
    detection: "implemented",
    evidenceSource:
      "content-run report/brand-leak.json (url slots) + template runtime IR href/src props",
    canBlock: false,
    basis:
      "SEVERITY_POLICY already prices unresolved destinations as high-value: they keep source " +
      "defaults but do not gate indexability",
  },
  "title-meta": {
    detection: "elsewhere",
    evidenceSource: "seo plan manifest.checks.brandIsolation (the SEO run FAILS if a term leaks)",
    canBlock: false,
    basis: "structurally zero — src/seo/run.ts refuses to write a plan whose head surfaces leak",
  },
  canonical: {
    detection: "elsewhere",
    evidenceSource: "seo plan manifest.checks.brandIsolation + production-domain requirement",
    canBlock: false,
    basis: "canonical is domain-derived; the `production-domain` requirement already blocks",
  },
  "open-graph": {
    detection: "elsewhere",
    evidenceSource: "seo plan manifest.checks.brandIsolation",
    canBlock: false,
    basis: "same brand-isolation gate as title/meta",
  },
  "json-ld": {
    detection: "elsewhere",
    evidenceSource: "seo plan manifest.checks.brandIsolation + jsonLd.omittedNeedsInput",
    canBlock: false,
    basis: "JSON-LD omits absent facts honestly rather than inheriting source ones",
  },
  "image-logo": {
    detection: "elsewhere",
    evidenceSource: "asset replacement-manifest.json + inventory counts.inlineSvgEntries",
    canBlock: false,
    basis:
      "owned by the `replacement-image` and `source-brand-asset` kinds; re-blocking here would " +
      "duplicate an existing blocker",
  },
  "image-alt": {
    detection: "implemented",
    evidenceSource: "template runtime IR element props (alt)",
    canBlock: false,
    basis:
      "the IR carries the PRE-injection default, so a hit may already be replaced by the content " +
      "overlay — reported, never gated",
  },
  "aria-label": {
    detection: "implemented",
    evidenceSource: "template runtime IR element props (aria-label)",
    canBlock: false,
    basis: "same pre-injection caveat as image-alt",
  },
  "svg-text": {
    detection: "implemented",
    evidenceSource: "template runtime IR RuntimeElementNode.v (<text>/<title> inside inline SVG)",
    canBlock: false,
    basis:
      "Task 19.1 shipped SVG text injection, so a hit here is an unauthored default rather than " +
      "an unreachable one",
  },
  "svg-aria-label": {
    detection: "implemented",
    evidenceSource: "template runtime IR RuntimeElementNode.v (aria-label inside inline SVG)",
    canBlock: false,
    basis:
      "NEW in Task 27 — detected by nothing before. It has NO slot binding and no bake-time " +
      "rewriter yet, so blocking it would repeat the source-brand-asset dead end",
  },
  "svg-symbol-id": {
    detection: "implemented",
    evidenceSource: "template runtime IR RuntimeElementNode.v (<symbol id>)",
    canBlock: false,
    basis:
      "NEW in Task 27. An internal id is never read by a visitor or a crawler — hygiene, not " +
      "independence",
  },
  "dynamic-template-content": {
    detection: "unavailable",
    evidenceSource: "",
    canBlock: false,
    basis:
      "no artifact records the source brand inside dynamically-mounted region content separately " +
      "from its host route; region enablement (a later task) is what creates that evidence",
  },
  "body-anchor-identity": {
    detection: "implemented",
    evidenceSource: "production build report/qa.json brandSurfaceCensus (SERVED html anchors)",
    canBlock: false,
    basis:
      "measured only once a production candidate exists; an inherited body anchor is owned by " +
      "content/asset independence, not invented away by the gate",
  },
};

/**
 * A brand finding is RELEASE-BLOCKING only when BOTH hold:
 *
 *   (a) the surface publishes the source's identity where a person or a
 *       crawler reads it as THIS site's identity (`canBlock`), and
 *   (b) an IMPLEMENTED resolution can actually clear it — today that means the
 *       finding is bound to an editable slot, so `routeContent[…].slotValues`
 *       or `urls[…]` resolves it.
 *
 * (b) is not politeness. `source-brand-asset` is the counter-example already
 * on disk: release-blocking, with an acknowledgement and a future task as its
 * only resolutions — so any source carrying an inline-SVG logo can never reach
 * PRODUCTION_READY. A new kind must not repeat that shape.
 */
export function brandFindingSeverity(finding: BrandFinding): RequirementSeverity {
  const policy = BRAND_SURFACE_POLICY[finding.surface];
  if (!policy.canBlock) return "high-value";
  if (finding.slotKey === null) return "high-value";
  // An engine-blocked slot is exactly the impossible category: the operator
  // asked for the change and the ENGINE refused it. Blocking on it would gate
  // the release behind something no resolution pack can supply.
  if (finding.origin !== "injected-value") return "high-value";
  return "release-blocking";
}

// ---------------------------------------------------------------------------
// Scan
// ---------------------------------------------------------------------------

export interface BrandScanOptions {
  host: string;
  templateRunDir: string;
  contentRunDir: string;
  productionBuildDir?: string | null;
  /** GED-F opt-in. Ignored by this module beyond being RECORDED: nothing here
   *  rewrites. Default is `GED_F_NEUTRALIZATION_DEFAULT` (false). */
  neutralize?: boolean;
  /** Findings retained per surface (counts stay exact). */
  perSurfaceCap?: number;
}

const DEFAULT_PER_SURFACE_CAP = 25;

async function readJson<T>(file: string): Promise<T> {
  return JSON.parse(await readFile(file, "utf8")) as T;
}

interface RuntimeNodeLike {
  k?: string;
  n?: string;
  p?: Record<string, unknown>;
  c?: RuntimeNodeLike[];
  v?: string;
}

export async function scanBrandSurfaces(options: BrandScanOptions): Promise<BrandSurfaceReport> {
  const brandTokens = brandTokensFromHost(options.host);
  const cap = options.perSurfaceCap ?? DEFAULT_PER_SURFACE_CAP;
  const counts = Object.fromEntries(BRAND_SURFACES.map((s) => [s, 0])) as Record<BrandSurface, number>;
  const kept = Object.fromEntries(BRAND_SURFACES.map((s) => [s, [] as BrandFinding[]])) as Record<
    BrandSurface,
    BrandFinding[]
  >;
  const unavailable: BrandSurfaceReport["scanned"]["unavailable"] = [];
  let truncated = 0;
  const record = (finding: BrandFinding): void => {
    counts[finding.surface] += 1;
    if (kept[finding.surface].length < cap) kept[finding.surface].push(finding);
    else truncated += 1;
  };

  // ---- 1. template runtime IR: inline SVG + element props -----------------
  const dataDir = path.join(options.templateRunDir, TEMPLATE_APP_DIR, RUNTIME_DATA_DIR);
  const routeMapFile = path.join(dataDir, ROUTE_MAP_FILE);
  let routesScanned = 0;
  let elementNodes = 0;
  let inlineSvgNodes = 0;
  if (existsSync(routeMapFile)) {
    const routeMap = await readJson<{ routes: Array<{ path: string; pageFile: string }> }>(routeMapFile);
    for (const route of routeMap.routes) {
      const pageFile = path.join(dataDir, route.pageFile);
      if (!existsSync(pageFile)) continue;
      routesScanned += 1;
      const page = await readJson<Record<string, { doc?: RuntimeNodeLike } | unknown>>(pageFile);
      for (const viewport of ["desktop", "mobile"]) {
        const doc = (page as Record<string, { doc?: RuntimeNodeLike }>)[viewport]?.doc;
        if (doc === undefined) continue;
        const stack: RuntimeNodeLike[] = [doc];
        while (stack.length > 0) {
          const node = stack.pop()!;
          if (node.k !== "e") continue;
          elementNodes += 1;
          const nodeId = node.n ?? null;
          const pointer = `${viewport}.doc[${nodeId ?? "?"}]`;
          if (typeof node.v === "string") {
            inlineSvgNodes += 1;
            for (const hit of scanInlineSvgMarkup(node.v, brandTokens)) {
              record({
                ...hit,
                origin: "template-default",
                route: route.path,
                slotKey: null,
                nodeId,
                evidenceFile: pageFile,
                evidencePointer: `${pointer}.v`,
                suggestedResolution: suggestedResolutionFor(hit.surface, null),
              });
            }
          }
          if (node.p !== undefined) {
            for (const hit of scanElementProps(node.p, brandTokens, options.host)) {
              record({
                ...hit,
                origin: "template-default",
                route: route.path,
                slotKey: null,
                nodeId,
                evidenceFile: pageFile,
                evidencePointer: `${pointer}.p`,
                suggestedResolution: suggestedResolutionFor(hit.surface, null),
              });
            }
          }
          if (node.c !== undefined) for (const child of node.c) stack.push(child);
        }
      }
    }
  } else {
    unavailable.push({
      surface: "svg-aria-label",
      reason: `no runtime IR at ${routeMapFile} — inline-SVG surfaces unmeasured on this lineage`,
      kind: "missing-artifact",
    });
  }

  // ---- 2. content run brand-leak.json: the surfaces that actually ship ----
  const brandLeakFile = path.join(options.contentRunDir, "report", "brand-leak.json");
  const unitsFile = path.join(options.contentRunDir, "content-units.json");
  const routeBySlotKey = new Map<string, string>();
  if (existsSync(unitsFile)) {
    const units = await readJson<{
      units: Array<{ scope: string; route?: string; slots: Array<{ key: string }> }>;
    }>(unitsFile);
    for (const unit of units.units) {
      for (const slot of unit.slots) routeBySlotKey.set(slot.key, unit.route ?? "global");
    }
  }
  let contentWarnings = 0;
  if (existsSync(brandLeakFile)) {
    const report = await readJson<{
      warnings: Array<{ slotKey: string; kind: string; detail: string }>;
    }>(brandLeakFile);
    contentWarnings = report.warnings.length;
    for (const warning of report.warnings) {
      const surface: BrandSurface = warning.kind.startsWith("original-external-url")
        ? "source-url"
        : "visible-text";
      const origin: BrandFindingOrigin =
        warning.kind === "blocked-visible-source-content"
          ? "engine-blocked"
          : warning.kind.endsWith("untouched-default")
            ? "template-default"
            : "injected-value";
      record({
        surface,
        origin,
        route: routeBySlotKey.get(warning.slotKey) ?? "global",
        value: warning.detail,
        matched: options.host,
        sourceUrl: null,
        slotKey: warning.slotKey,
        nodeId: null,
        evidenceFile: brandLeakFile,
        evidencePointer: `warnings[${warning.slotKey}]`,
        suggestedResolution: suggestedResolutionFor(surface, warning.slotKey),
      });
    }
  } else {
    unavailable.push({
      surface: "visible-text",
      reason: `no ${brandLeakFile} — post-overlay slot values unmeasured on this lineage`,
      kind: "missing-artifact",
    });
  }

  // ---- 3. served html (only once a production candidate exists) -----------
  const qaFile = options.productionBuildDir
    ? path.join(options.productionBuildDir, "report", "qa.json")
    : null;
  if (qaFile && existsSync(qaFile)) {
    const qa = await readJson<{
      brandSurfaceCensus?: { bodyAnchorIdentity: number; byRoute: Array<{ route: string; bodyAnchorIdentity: number }> };
    }>(qaFile);
    for (const row of qa.brandSurfaceCensus?.byRoute ?? []) {
      if (row.bodyAnchorIdentity <= 0) continue;
      record({
        surface: "body-anchor-identity",
        origin: "served-html",
        route: row.route,
        value: `${row.bodyAnchorIdentity} absolute source-host anchor(s) in the served html`,
        matched: options.host,
        sourceUrl: null,
        slotKey: null,
        nodeId: null,
        evidenceFile: qaFile,
        evidencePointer: `brandSurfaceCensus.byRoute[${row.route}].bodyAnchorIdentity`,
        suggestedResolution: suggestedResolutionFor("body-anchor-identity", null),
      });
    }
  } else {
    unavailable.push({
      surface: "body-anchor-identity",
      reason: "no production build report/qa.json yet — served-html surfaces unmeasured",
      kind: "not-yet-measured",
    });
  }

  const findings = BRAND_SURFACES.flatMap((surface) => kept[surface]);
  return {
    schemaName: BRAND_SURFACE_REPORT_SCHEMA_NAME,
    schemaVersion: BRAND_SURFACE_REPORT_SCHEMA_VERSION,
    host: options.host,
    brandTokens,
    neutralization: {
      enabled: options.neutralize ?? GED_F_NEUTRALIZATION_DEFAULT,
      default: "OFF",
      basis:
        "GED-F is a DETECTOR in Task 27; neutralization belongs at bake and is sequenced after " +
        "Content V2 and region/route enablement",
    },
    scanned: {
      routes: routesScanned,
      elementNodes,
      inlineSvgNodes,
      contentWarnings,
      unavailable,
    },
    counts,
    findings,
    truncated,
  };
}

function suggestedResolutionFor(surface: BrandSurface, slotKey: string | null): string {
  if (slotKey !== null) {
    return `routeContent[<route>].slotValues["${slotKey}"] (or urls["${slotKey}"] for a url slot)`;
  }
  switch (surface) {
    case "svg-aria-label":
    case "svg-symbol-id":
    case "svg-text":
      return (
        "no write target exists today (inline SVG has no slot binding) — acknowledge, or wait for " +
        "GED-F bake-time neutralization; opaque <path> geometry stays a documented limitation"
      );
    case "image-logo":
      return 'assets["organization-logo"] / assets[<inventoryId>]';
    case "body-anchor-identity":
      return "authored replacement for the linking slot, or GED-F bake-time anchor neutralization";
    default:
      return "authored replacement once the surface gains a write target; acknowledge meanwhile";
  }
}

// ---------------------------------------------------------------------------
// Requirements
// ---------------------------------------------------------------------------

function slugify(value: string): string {
  return value.replace(/[^a-zA-Z0-9._/-]+/g, "-");
}

export interface BrandRequirementOptions {
  /** Cap on individually-addressable blocking requirements (rest is grouped). */
  perSlotCap?: number;
}

/**
 * Turn a scan into requirements.
 *
 *   blocking  ONE requirement PER SLOT — a blocker must be individually
 *             resolvable, and `slotKey` is what the existing resolution
 *             matcher keys on
 *   others    ONE grouped requirement PER SURFACE, carrying the exact count
 *
 * Ids are artifact-derived and stable across re-collection, exactly like the
 * other kinds (`replacement-image-<inventoryId>`, `content-route-<route>`).
 */
export function brandSurfaceRequirements(
  report: BrandSurfaceReport,
  options: BrandRequirementOptions = {},
): Requirement[] {
  const perSlotCap = options.perSlotCap ?? 50;
  const requirements: Requirement[] = [];
  const blockingSeen = new Set<string>();

  for (const finding of report.findings) {
    if (brandFindingSeverity(finding) !== "release-blocking") continue;
    if (finding.slotKey === null) continue;
    if (blockingSeen.has(finding.slotKey)) continue;
    if (blockingSeen.size >= perSlotCap) break;
    blockingSeen.add(finding.slotKey);
    requirements.push({
      requirementId: `brand-leak-${finding.surface}-${slugify(finding.slotKey)}`,
      kind: "brand-leak",
      severity: "release-blocking",
      status: "unresolved",
      sourceStage: "content",
      route: finding.route === "global" ? undefined : finding.route,
      slotKey: finding.slotKey,
      message:
        `the value that will SHIP for ${finding.slotKey} still carries the source brand ` +
        `("${finding.matched}") on the ${finding.surface} surface: ${finding.value}`,
      resolutionOptions: [
        `routeContent["${finding.route}"].slotValues["${finding.slotKey}"]`,
        `urls["${finding.slotKey}"]`,
      ],
      evidence: [
        { file: finding.evidenceFile, pointer: finding.evidencePointer, detail: finding.value },
      ],
    });
  }

  for (const surface of BRAND_SURFACES) {
    const count = report.counts[surface];
    if (count === 0) continue;
    const groupedCount = count - [...blockingSeen].filter((slotKey) =>
      report.findings.some(
        (finding) => finding.surface === surface && finding.slotKey === slotKey,
      ),
    ).length;
    if (groupedCount <= 0) continue;
    const sample = report.findings.find((finding) => finding.surface === surface);
    const policy = BRAND_SURFACE_POLICY[surface];
    requirements.push({
      requirementId: `brand-leak-${surface}`,
      kind: "brand-leak",
      severity: "high-value",
      status: "unresolved",
      sourceStage: surface === "body-anchor-identity" ? "production" : "content",
      count: groupedCount,
      message:
        `${groupedCount} source-brand occurrence(s) on the ${surface} surface — ${policy.basis}`,
      resolutionOptions: [
        sample ? sample.suggestedResolution : "authored replacement",
        `acknowledgements[{ requirementId: "brand-leak-${surface}" }] (records accepted-limitation)`,
      ],
      evidence: sample
        ? [{ file: sample.evidenceFile, pointer: sample.evidencePointer, detail: sample.value }]
        : [{ file: "brand-surface-report", pointer: `counts.${surface}`, detail: String(groupedCount) }],
    });
  }

  return requirements;
}
