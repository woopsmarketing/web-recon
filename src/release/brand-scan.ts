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
  scanRuntimeTemplateSurfaces,
  type BrandSurface,
} from "../content-injection/brand-surfaces.js";
import {
  flightBrandSurfaceTotal,
  markupBrandSurfaceTotal,
  type BrandFlightCounts,
  type BrandSurfaceCounts,
  type BrandHost,
} from "../production/index.js";
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
    // Task 28 Phase 2: DETECTED here now (an <img> whose image FILE names the
    // brand), and resolvable by the bake-time resolver. Still not blocking on
    // this kind: `source-brand-asset` is the one blocker for brand ASSETS and
    // re-blocking here would duplicate it.
    detection: "implemented",
    evidenceSource:
      "template runtime IR element props (img src/srcset path) + asset replacement-manifest.json",
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
      "NEW in Task 27 — detected by nothing before. Task 28 Phase 2 gave it a bake-time resolver " +
      "(src/production/brand-bake.ts), and the blocking is carried by the single " +
      "`source-brand-inline-svg` requirement, which clears on REBUILT OUTPUT; blocking per-finding " +
      "here as well would double-count one mark",
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
  // The walk itself moved to content-injection/brand-surfaces.ts
  // (`scanRuntimeTemplateSurfaces`, Task 28 CR8) so the content run's
  // brand-leak report sees the SAME surfaces through the SAME code. Traversal
  // order is preserved there, so the capped `findings` sample below is
  // unchanged.
  const runtimeScan = await scanRuntimeTemplateSurfaces({
    templateAppDir: path.join(options.templateRunDir, TEMPLATE_APP_DIR),
    sourceHost: options.host,
    brandTokens,
  });
  const routesScanned = runtimeScan.routesScanned;
  const elementNodes = runtimeScan.elementNodes;
  const inlineSvgNodes = runtimeScan.inlineSvgNodes;
  if (runtimeScan.available) {
    for (const hit of runtimeScan.hits) {
      record({
        surface: hit.surface,
        value: hit.value,
        matched: hit.matched,
        sourceUrl: hit.sourceUrl,
        origin: "template-default",
        route: hit.route,
        slotKey: null,
        nodeId: hit.nodeId,
        evidenceFile: hit.pageFile,
        evidencePointer: hit.pointer,
        suggestedResolution: suggestedResolutionFor(hit.surface, null),
      });
    }
  } else {
    unavailable.push({
      surface: "svg-aria-label",
      reason: `no runtime IR at ${runtimeScan.routeMapFile} — inline-SVG surfaces unmeasured on this lineage`,
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
      warnings: Array<{ slotKey: string | null; kind: string; detail: string; surface?: string }>;
    }>(brandLeakFile);
    contentWarnings = report.warnings.length;
    for (const warning of report.warnings) {
      // Task 28 CR8: the content run now ALSO records surface-scoped findings
      // (svg-aria-label, svg-symbol-id, svg-text, image-alt, aria-label) read
      // from the SAME template runtime IR that section 1 above just scanned.
      // Counting them here too would double-count one mark — section 1 is the
      // authority for those surfaces, so skip them.
      if (warning.slotKey === null) continue;
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
      // Task 28 Phase 2: there IS a write target now — an authored.brand
      // decision, applied by the bake-time resolver to the build copy's page
      // IR. It is not a slot binding and never becomes one (Slot V2 is frozen).
      return (
        'authored.brand[<brandSurfaceId>] = { decision: "REPLACE" | "REMOVE" | "PRESERVE" }, ' +
        "applied at bake by src/production/brand-bake.ts and verified on the rebuilt output"
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


// ---------------------------------------------------------------------------
// Source-brand ASSET requirement (Task 28 Phase 2) — the OUTPUT-PROOF gate
// ---------------------------------------------------------------------------

/**
 * The brand section of a production build's `report/bake-report.json`, as
 * much of it as the gate reads. Declared structurally so the gate can be
 * evaluated over a report that was just produced in memory (a canary) exactly
 * as over one read from disk.
 */
export interface BrandBakeSection {
  census?: Partial<BrandSurfaceCounts>;
  flight?: Partial<BrandFlightCounts>;
  /** Structural, not `Pick<BrandBakeReport, …>`: a full report satisfies it,
   *  and so does the minimum a test needs to state a hypothesis. */
  bake?: {
    hostsBefore: number;
    residual: { preservedAfter: number; unexplainedAfter: string[] };
    applied: { replaced: number; removed: number; preserved: number; refused: number };
  } | null;
}

export interface BrandOutputProof {
  file: string;
  /** The rule ACCEPTS this build — but see `clearedBy` for what accepted it. */
  cleared: boolean;
  /**
   * WHAT cleared it (Task 28 Phase 2 correction).
   *
   *   `output-proof`        the rendered output measured ZERO on every axis
   *                         that was measured. This is the only value that
   *                         earns `status: "resolved"`.
   *   `preserve-acceptance` the IR is fully explained, but only because the
   *                         operator explicitly PRESERVED host(s) whose mark
   *                         still renders. The source brand IS still shipping,
   *                         so this earns `status: "accepted-limitation"`,
   *                         which still counts in `releaseBlockers()`.
   *   `null`                not cleared.
   */
  clearedBy: "output-proof" | "preserve-acceptance" | null;
  detail: string;
  /** Every brand host left in the BUILT app's IR is covered by a PRESERVE. */
  irClean: boolean;
  /** The rendered output censuses zero brand surfaces (html AND rsc flight
   *  AND, when it was measured, the post-hydration DOM). */
  renderedClean: boolean;
  markupBrandSurfaces: number;
  flightBrandSurfaces: number;
  /**
   * Brand surfaces in the POST-HYDRATION DOM, from the build's own
   * `report/qa.json` (`brandSurfaceCensusHydrated`). `null` means NO hydrated
   * census exists for this build — the axis was not measured, which is stated
   * in `detail` rather than being scored as a zero.
   */
  hydratedBrandSurfaces: number | null;
  preservedAfter: number;
  unexplainedAfter: number;
}

/** The post-hydration axis, as read from a build's `report/qa.json`. */
export interface HydratedBrandCensus {
  counts: Partial<BrandSurfaceCounts>;
  routesMeasured: number;
}

/**
 * THE CLEARING RULE for `source-brand-inline-svg`, evaluated over a build's
 * OWN measurements — never over a decision the operator recorded.
 *
 *   (a) `brand.bake.residual.unexplainedAfter` is EMPTY. That array is
 *       re-derived by re-reading the mutated page files from disk after the
 *       rewrite, so it says: every brand-carrying host still in the built
 *       app's IR is covered by an explicit PRESERVE decision.
 *   (b) when NOTHING is preserved, the rendered output must agree — the
 *       exported HTML census AND the RSC flight census must both be zero on
 *       the brand surfaces. This is the cross-check that (a) is not lying: an
 *       IR rewrite that failed to reach the render shows up here, and a
 *       markup-only rewrite shows up in the flight axis specifically.
 *   (c) and when the build carries a POST-HYDRATION census (the QA run's
 *       `brandSurfaceCensusHydrated`, taken over the live DOM of every route),
 *       that must be zero too. This is the axis that describes what a visitor
 *       actually sees after React reconciles the flight into the DOM; the
 *       other two are its inputs. A build with no hydrated census reports the
 *       axis as UNMEASURED rather than counting it as clean.
 *
 * With PRESERVE decisions present a non-zero rendered residual is EXPECTED —
 * that is what preserving means — so (b) is REPORTED rather than asserted and
 * the detail string says so, instead of the rule quietly relaxing itself.
 *
 * AND `preservedAfter > 0` OUTRANKS (b) ENTIRELY (Task 28 close-out). Whatever
 * the rendered census reads, a build that preserves a source mark is cleared by
 * ACCEPTANCE and never by output proof — a zero on an axis is only as good as
 * the axis, and a preserved mark is by definition still shipping.
 *
 * AND THAT CASE IS NOT `resolved` (Task 28 Phase 2 correction). An earlier
 * revision let ANY preserve-only build set `status: "resolved"`, which dropped
 * the kind out of `releaseBlockers()` while the source mark was still
 * rendering — a silent loosening of a blocker whose policy basis reads
 * "visible source-brand content must be 0". `clearedBy` now separates the two:
 * `output-proof` (measured zero → resolved) from `preserve-acceptance`
 * (acknowledged → `accepted-limitation`, which still blocks).
 */
export function evaluateBrandOutputProof(
  file: string,
  brand: BrandBakeSection | undefined,
  /**
   * The build's post-hydration census, when one exists. Optional so a caller
   * that has only a bake report (a canary evaluating its own in-memory result)
   * is unchanged — and so an absent axis is REPORTED absent rather than
   * silently counted as clean.
   */
  hydrated?: HydratedBrandCensus | null,
): BrandOutputProof {
  const empty: Omit<BrandOutputProof, "file" | "cleared" | "clearedBy" | "detail"> = {
    irClean: false,
    renderedClean: false,
    markupBrandSurfaces: 0,
    flightBrandSurfaces: 0,
    hydratedBrandSurfaces: null,
    preservedAfter: 0,
    unexplainedAfter: 0,
  };
  if (brand === undefined) {
    return {
      file,
      cleared: false,
      clearedBy: null,
      detail: "the build's bake report carries no brand section (built before Task 28 Phase 2)",
      ...empty,
    };
  }
  const bake = brand.bake ?? null;
  if (bake === null || bake === undefined) {
    return {
      file,
      cleared: false,
      clearedBy: null,
      detail: "the build ran no brand resolver, so no output proves the surface is gone",
      ...empty,
    };
  }
  const markupBrandSurfaces = markupBrandSurfaceTotal({
    sourceUrl: 0,
    bodyAnchorIdentity: 0,
    visibleText: 0,
    imageSrcPath: brand.census?.imageSrcPath ?? 0,
    imageAlt: brand.census?.imageAlt ?? 0,
    ariaLabel: brand.census?.ariaLabel ?? 0,
    svgAriaLabel: brand.census?.svgAriaLabel ?? 0,
    svgSymbolId: brand.census?.svgSymbolId ?? 0,
    svgText: brand.census?.svgText ?? 0,
  });
  const flightBrandSurfaces = flightBrandSurfaceTotal({
    documents: 0,
    lengthPrefixedChunks: 0,
    sourceUrl: 0,
    brandTokenOccurrences: 0,
    imageSrcPath: brand.flight?.imageSrcPath ?? 0,
    imageAlt: brand.flight?.imageAlt ?? 0,
    ariaLabel: brand.flight?.ariaLabel ?? 0,
    svgAriaLabel: brand.flight?.svgAriaLabel ?? 0,
    svgSymbolId: brand.flight?.svgSymbolId ?? 0,
    svgText: brand.flight?.svgText ?? 0,
  });
  // The POST-HYDRATION axis. This is the one that says what a visitor sees:
  // the SSR markup and the flight are both inputs to it, and a rewrite that
  // reached the markup but not the flight is clean on `markupBrandSurfaces`
  // and dirty HERE. `null` when the build carries no hydrated census — an
  // unmeasured axis is named as unmeasured, never scored as a zero.
  const hydratedBrandSurfaces =
    hydrated === undefined || hydrated === null || hydrated.routesMeasured === 0
      ? null
      : markupBrandSurfaceTotal({
          sourceUrl: 0,
          bodyAnchorIdentity: 0,
          visibleText: 0,
          imageSrcPath: hydrated.counts.imageSrcPath ?? 0,
          imageAlt: hydrated.counts.imageAlt ?? 0,
          ariaLabel: hydrated.counts.ariaLabel ?? 0,
          svgAriaLabel: hydrated.counts.svgAriaLabel ?? 0,
          svgSymbolId: hydrated.counts.svgSymbolId ?? 0,
          svgText: hydrated.counts.svgText ?? 0,
        });
  const unexplainedAfter = bake.residual.unexplainedAfter.length;
  const irClean = unexplainedAfter === 0;
  const renderedClean =
    markupBrandSurfaces === 0 &&
    flightBrandSurfaces === 0 &&
    (hydratedBrandSurfaces === null || hydratedBrandSurfaces === 0);
  const preservedAfter = bake.residual.preservedAfter;
  // WHAT cleared it, kept separate from WHETHER it cleared.
  //
  // BRANCH ORDER IS LOAD-BEARING (Task 28 close-out). `preservedAfter > 0` is
  // tested FIRST and ALWAYS wins. A PRESERVE decision is an operator ACCEPTING
  // a known source mark; it is never evidence that the mark is gone, so it can
  // never produce `output-proof` no matter what the rendered census reads.
  //
  // The previous order tested `renderedClean` first, which made the verdict
  // hostage to the census being complete. It was not: on an image-logo lineage
  // NO axis measured a brand-named image PATH, so a PRESERVE-everything build
  // measured all zeros and cleared as `output-proof` / `resolved` / 0 blockers
  // while the source's own logotype was still in the shipped bytes. The missing
  // axis is added in `brand-census.ts`, but the ordering is the load-bearing
  // half: it makes the verdict independent of whether some FUTURE surface is
  // measured yet. An unmeasured axis can now only ever downgrade a build to
  // `preserve-acceptance`, never upgrade one to proof.
  const clearedBy: BrandOutputProof["clearedBy"] = !irClean
    ? null
    : preservedAfter > 0
      ? "preserve-acceptance"
      : renderedClean
        ? "output-proof"
        : null;
  const cleared = clearedBy !== null;
  const detail =
    `hosts before=${bake.hostsBefore}; applied replaced=${bake.applied.replaced} ` +
    `removed=${bake.applied.removed} preserved=${bake.applied.preserved} ` +
    `refused=${bake.applied.refused}; unexplained after=${unexplainedAfter}; ` +
    `exported-html brand surfaces=${markupBrandSurfaces}; rsc-flight brand surfaces=${flightBrandSurfaces}; ` +
    `post-hydration brand surfaces=${
      hydratedBrandSurfaces === null
        ? "not measured (no report/qa.json hydrated census on this build)"
        : hydratedBrandSurfaces
    }` +
    (preservedAfter > 0
      ? ` (${preservedAfter} host(s) PRESERVED by explicit decision, so a non-zero rendered census ` +
        "is expected and is reported rather than asserted)"
      : "") +
    (clearedBy === "preserve-acceptance"
      ? renderedClean
        ? " — ACCEPTED LIMITATION, not resolved: every axis measured above reads 0, but " +
          `${preservedAfter} host(s) are shipping the source mark by explicit PRESERVE, and a ` +
          "preserved mark is an operator's acceptance, never proof the mark is gone (a 0 here " +
          "means only that no axis in this census MEASURES that surface)"
        : " — ACCEPTED LIMITATION, not resolved: the source mark still renders and this build is " +
          "cleared only by the operator's explicit PRESERVE"
      : "");
  return {
    file,
    cleared,
    clearedBy,
    detail,
    irClean,
    renderedClean,
    markupBrandSurfaces,
    flightBrandSurfaces,
    hydratedBrandSurfaces,
    preservedAfter,
    unexplainedAfter,
  };
}

/**
 * The `source-brand-inline-svg` requirement.
 *
 * COUNT. It carries BRAND-CARRYING HOSTS, measured on the template's own
 * runtime IR by the same walker the bake-time resolver uses — not
 * `inventory.counts.inlineSvgEntries`, which counts every inline SVG, icons
 * included (207 vs 80 on the accepted linear lineage).
 *
 * STATUS. `unresolved` until a REBUILT OUTPUT proves otherwise. It is never
 * set from the presence of a decision: `proof` is derived from the build's own
 * bake report, and a REPLACE the resolver refused — or one the census still
 * sees — leaves the requirement standing with a statusNote saying exactly that.
 */
export function sourceBrandAssetRequirement(input: {
  hosts: readonly BrandHost[];
  routes: number;
  templateRunDir: string;
  inlineSvgEntryCount: number;
  productionBuildDir: string | null;
  proof: BrandOutputProof | null;
}): Requirement {
  const bySurface: Record<string, number> = {};
  for (const host of input.hosts) bySurface[host.surface] = (bySurface[host.surface] ?? 0) + 1;
  const requirement: Requirement = {
    requirementId: "source-brand-inline-svg",
    kind: "source-brand-asset",
    severity: "release-blocking",
    status: "unresolved",
    sourceStage: "template",
    count: input.hosts.length,
    message:
      `${input.hosts.length} template host(s) still carry the source brand (` +
      Object.entries(bySurface)
        .sort()
        .map(([surface, count]) => `${surface}:${count}`)
        .join(", ") +
      ") — decide each one with authored.brand (REPLACE / REMOVE / PRESERVE) and rebuild; " +
      "it clears on the REBUILT OUTPUT, never on the decision",
    resolutionOptions: [
      'authored.brand[<brandSurfaceId>] = { decision: "REPLACE", replacement: { text | assetId | file } }',
      'authored.brand[<brandSurfaceId>] = { decision: "REMOVE" } (refused where not structurally safe)',
      'authored.brand[<brandSurfaceId>] = { decision: "PRESERVE", reason: "<why this source mark may ship>" }',
    ],
    evidence: [
      {
        file: `${input.templateRunDir}/app/reconstruction-data/route-map.json`,
        pointer: "brand-carrying-hosts",
        detail:
          `${input.hosts.length} host(s) over ${input.routes} route(s); asset inventory ` +
          `counts.inlineSvgEntries=${input.inlineSvgEntryCount} (icons included, which is why it ` +
          "is not this blocker's count)",
      },
      input.proof === null
        ? {
            file: input.productionBuildDir ?? "(no production build yet)",
            pointer: "report/bake-report.json#brand",
            detail:
              "no production build has measured this lineage yet — the requirement cannot clear " +
              "before an output exists",
          }
        : {
            file: input.proof.file,
            pointer: "brand.bake.residual + brand.census + brand.flight",
            detail: input.proof.detail,
          },
    ],
  };
  if (input.proof !== null && input.proof.clearedBy === "output-proof") {
    requirement.status = "resolved";
    requirement.statusNote = `cleared by MEASURED OUTPUT: ${input.proof.detail}`;
  } else if (input.proof !== null && input.proof.clearedBy === "preserve-acceptance") {
    // NOT `resolved`. The policy basis for this kind reads "visible
    // source-brand content must be 0" and the measured output says it is not:
    // the operator decided to ship the source mark. `accepted-limitation` is
    // the status this repo already has for exactly that, and it STILL counts
    // in `releaseBlockers()`, so publishing stays gated while the decision and
    // its reason stay visible.
    requirement.status = "accepted-limitation";
    requirement.statusNote =
      `ACCEPTED LIMITATION — ${input.proof.preservedAfter} host(s) ship the source mark by ` +
      "explicit PRESERVE decision, so this is acknowledged rather than resolved" +
      (input.proof.renderedClean
        ? " (the rendered census reads 0, but a preserved mark is an acceptance, not proof of " +
          "removal — the zero says only that no census axis measures that surface)"
        : "") +
      `: ${input.proof.detail}`;
  } else if (input.proof !== null) {
    requirement.statusNote = `output measured and the surface is STILL present: ${input.proof.detail}`;
  }
  return requirement;
}
