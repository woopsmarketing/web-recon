import { existsSync, readFileSync, readdirSync } from "node:fs";
import { inflateSync } from "node:zlib";
import type { LayoutProbeFingerprint } from "../src/observer/types.js";
import { mkdir, readFile, rm } from "node:fs/promises";
import path from "node:path";
import {
  bandContains,
  bandMedia,
  breakpointForPage,
  breakpointMediaQueries,
  chooseTreeSwitch,
  classifyTreeDivergence,
  familyChangeSize,
  familyChangeVerdict,
  globalsCss,
  inferResponsivePlan,
  V1_RESPONSIVE_POLICY,
  variantTreeNotObservedCode,
  containingBlockGuard,
  isBandedGeometry,
  measureFingerprintChange,
  measureObservedChange,
  measureParentContentBox,
  parentPaddingConstancy,
  rankTreeSwitchCandidates,
  resolveViewportProbe,
  generateApp,
  generateLayoutCss,
  hiddenBands,
  authoredEdgeCandidates,
  chooseAuthoredEdge,
  snapBandEdges,
  resolveAuthoredBreakpoints,
  inferLayoutRules,
  inlineSizeBehaviour,
  recoverGridTracks,
  recoverGridTracksBanded,
  gridAreaFillWidth,
  GRID_BAND_REFUSAL_REASONS,
  GRID_AREA_FILL_REFUSAL_REASONS,
  newCounters,
  resolveDependencyVersions,
  truthCheckHtml,
  verifyLayoutRules,
  auditRenderWidths,
  FAMILY_CHANGE_MIN_ELEMENTS,
  FAMILY_CHANGE_MIN_RATIO,
  FULL_WIDTH_TOLERANCE_PX,
  INLINE_SIZE_OUTCOMES,
  TRACKED_FILL_REFUSAL_REASONS,
  VIEWPORT_BLEED_REFUSAL_REASONS,
  CANVAS_REFUSAL_REASONS,
  DAMAGE_CLAMP_REFUSAL_REASONS,
  generateStylesheet,
  // Task 28.8 A2 / A3 — the authored inline-size fallback and the frozen-tier
  // text-box relief variants.
  authoredInlineSizeIntent,
  authoredMediaHolds,
  AUTHORED_INTENT_PROPERTIES,
  hasTextDescendant,
  textBoxHeightVariantApplies,
  textBoxShrinkVariantApplies,
  textBoxHeightRelievable,
  textBoxWidthRelievable,
  TEXT_BOX_HEIGHT_VARIANT_CLASS,
  TEXT_BOX_SHRINK_VARIANT_CLASS,
  paintsBackground,
  resolveDocumentRootCanvas,
  type ResidualAuditNode,
  type ResidualAuditPass,
  type HiddenBand,
  type LayoutGuardReason,
  type RecoveredLayoutRule,
  type ReconstructionPlan,
  type RuntimeElementNode,
  type RuntimePage,
} from "../src/reconstruction/index.js";
import {
  BreakpointSpecSchema,
  PageBreakpointRecordSchema,
  ReconstructionManifestSchema,
} from "../src/reconstruction/types.js";
// P0 contract C2.1 — interval-sample verification helpers, imported from their
// modules directly.
import {
  capIntervalSampleWidths,
  INTERVAL_SAMPLE_MAX_WIDTHS_PER_PASS,
  intervalSampleError,
  intervalSampleRegressed,
  intervalSampleTolerancePx,
  RENDER_LOAD_ATTEMPTS,
  selectIntervalSamples,
  setContentWithRetry,
} from "../src/reconstruction/layout-truth-check.js";
import {
  probeSamplesInInterval,
  ruleServedInterval,
} from "../src/reconstruction/layout-inference.js";
import type { AuthoredBreakpoints, ElementSpecNode, SpecNode } from "../src/sitespec/index.js";

/**
 * Task 28.5B — layout inference SAFETY.
 *
 * 28.5A proved two things about `layout-inference.ts` with measurements, not
 * opinions:
 *
 *   1. `contentAt()` — parent border box minus padding — is used as the
 *      denominator for percentage and full-width inference even when it is not
 *      the node's containing block. On a 12-column grid a 624px item measured a
 *      constant 48.75% of the 1280px PARENT, shipped as `width: 48.75%`, and
 *      then resolved against its 624px GRID AREA: 304px on screen. Ten entries
 *      and ten date columns on one route, and the run reported `complete`.
 *   2. The module's docstring claimed the emitted rules "cannot regress the
 *      truth viewport by construction". 349 of 1,910 recovered-rule nodes
 *      rendered farther from their observed box with the rules than without.
 *      Nothing had ever re-rendered one.
 *
 * This suite is the proof for both halves of the fix. Everything in it is
 * generic CSS semantics — a grid, a flex row, an absolutely positioned box —
 * with no site, selector or width taken from any real page, and the browser
 * half runs offline in a real Chromium at the truth viewport.
 */

let checks = 0;
let failures = 0;
function check(name: string, ok: boolean | undefined, detail = ""): void {
  checks++;
  if (ok) {
    console.log(`  PASS  ${name}`);
  } else {
    failures++;
    console.log(`  FAIL  ${name}${detail ? ` — ${detail}` : ""}`);
  }
}

function section(title: string): void {
  console.log("");
  console.log(title);
}

const TMP_ROOT = path.join(process.cwd(), "tmp", "wr285b", "layout");

// ---------------------------------------------------------------------------
// Part 1 — containing-block guards, offline
// ---------------------------------------------------------------------------

/** The observer's probe widths. Only {1024, 1440, 1920} drive desktop rules. */
const PROBE_WIDTHS = [390, 768, 1024, 1440, 1920];
const TRUTH_INDEX = 3;
/** The one width the deep observation was taken at. `PROBE_WIDTHS[TRUTH_INDEX]`. */
const TRUTH_WIDTH_PX = 1440;

/**
 * A parent that grows with the viewport and then caps — the ordinary shape of a
 * page shell, and wide enough at every desktop width to satisfy
 * `PARENT_GROWTH_MIN_PX`.
 */
const SHELL_W = [390, 768, 944, 1280, 1280];

type Props = Record<string, string>;

interface FixtureNode {
  nodeId: string;
  tagName: string;
  parentNodeId?: string;
  /** Probe widths, index-aligned to PROBE_WIDTHS. */
  w: number[];
  x?: number[];
  /** Per-width visibility, index-aligned. Defaults to visible everywhere. */
  v?: (0 | 1)[];
  props: Props;
  /**
   * Task 28.6 D1 — the authored declarations the browser matched to this node,
   * carrying the `@media` they sat under. Only the grouping fields matter here;
   * `computeAuthoredBreakpoints()` reads nothing else.
   */
  authoredLayout?: { property: string; value: string; selector: string; media?: string }[];
  authoredLayoutTruncated?: boolean;
}

/** `w` for a child holding a constant fraction of its parent's CONTENT box. */
function ratioOf(parent: readonly number[], ratio: number, padding = 0): number[] {
  return parent.map((width) => Math.round((width - padding) * ratio * 100) / 100);
}

function buildPage(
  nodes: readonly FixtureNode[],
  /**
   * Task 28.6 D1 — an explicit `authoredBreakpoints` histogram on the desktop
   * viewport, as a schemaVersion-5 SiteSpec carries it. Omitted, the viewport
   * has none and the snapper must fall back to the nodes (or to nothing).
   */
  authoredBreakpoints?: AuthoredBreakpoints,
  /**
   * Task 28.75 — a denser probe axis for the fixtures that need one.
   *
   * DEFAULTS TO {@link PROBE_WIDTHS}, so every check written before this
   * parameter existed builds exactly the page it built before. The banded
   * fixtures in Part 11g need two authored bands ABOVE the breakpoint with real
   * parent growth inside each, which three desktop samples cannot express.
   * The list must contain {@link TRUTH_WIDTH_PX}; the truth index is derived
   * from it rather than assumed.
   */
  probeWidths: readonly number[] = PROBE_WIDTHS,
): {
  page: Parameters<typeof inferLayoutRules>[0]["pages"][number];
  styleLookup: (id: string) => Props | undefined;
  specNodes: Map<string, ElementSpecNode>;
} {
  const styles = new Map<string, Props>();
  const specNodes = new Map<string, ElementSpecNode>();
  // Document child order, derived from the declared parents. Task 28.6 A5 reads
  // it: a grid container's tracks are measured from its direct children.
  const childrenOf = new Map<string, string[]>();
  for (const node of nodes) {
    if (node.parentNodeId === undefined) continue;
    const siblings = childrenOf.get(node.parentNodeId);
    if (siblings) siblings.push(node.nodeId);
    else childrenOf.set(node.parentNodeId, [node.nodeId]);
  }
  const compiled = nodes.map((node) => {
    const styleTokenId = `st-${node.nodeId}`;
    styles.set(styleTokenId, node.props);
    const truthIndex = probeWidths.indexOf(TRUTH_WIDTH_PX);
    const x = node.x ?? probeWidths.map(() => 0);
    const spec = {
      nodeId: node.nodeId,
      type: "element" as const,
      sourceElementId: `e-${node.nodeId}`,
      ...(node.parentNodeId !== undefined ? { parentNodeId: node.parentNodeId } : {}),
      childNodeIds: childrenOf.get(node.nodeId) ?? [],
      tagName: node.tagName,
      attributes: {},
      localVisible: true,
      effectiveVisible: true,
      boundingBox: {
        x: x[truthIndex]!,
        y: 0,
        width: node.w[truthIndex]!,
        height: 100,
        top: 0,
        right: x[truthIndex]! + node.w[truthIndex]!,
        bottom: 100,
        left: x[truthIndex]!,
      },
      probe: {
        x,
        w: [...node.w],
        v: node.v ? [...node.v] : probeWidths.map(() => 1 as const),
      },
      styleTokenId,
      assetRefs: [],
      relations: [],
      limitations: [],
      ...(node.authoredLayout !== undefined ? { authoredLayout: node.authoredLayout } : {}),
      ...(node.authoredLayoutTruncated !== undefined
        ? { authoredLayoutTruncated: node.authoredLayoutTruncated }
        : {}),
    };
    specNodes.set(node.nodeId, spec as unknown as ElementSpecNode);
    return spec;
  });
  const page = {
    pageId: "p000001",
    layoutProbe: {
      widths: [...probeWidths],
      aligned: true,
      elementCount: compiled.length,
      truncated: false,
    },
    viewports: {
      desktop: {
        nodes: compiled,
        ...(authoredBreakpoints !== undefined ? { authoredBreakpoints } : {}),
      },
      mobile: { nodes: [] },
    },
  } as unknown as Parameters<typeof inferLayoutRules>[0]["pages"][number];
  return { page, styleLookup: (id) => styles.get(id), specNodes };
}

/**
 * The percentage curve the /changelog defect stood on, reproduced generically: a
 * child holding a constant 48.75% of its parent's content box at every desktop
 * width. Whether that is a legal conclusion depends ENTIRELY on the containing
 * block, and nothing in the arithmetic can tell.
 */
const CONTENT_RATIO = 0.4875;
const DATE_RATIO = 0.23125;

function guardChecks(): void {
  section("Part 1 — containing-block guards (offline, real inference)");

  const block: Props = { display: "block" };
  const nodes: FixtureNode[] = [
    { nodeId: "n001", tagName: "html", w: [...PROBE_WIDTHS], props: block },
    { nodeId: "n002", tagName: "body", parentNodeId: "n001", w: [...PROBE_WIDTHS], props: block },

    // --- the proven defect: a two-column grid ------------------------------
    {
      nodeId: "grid",
      tagName: "div",
      parentNodeId: "n002",
      w: [...SHELL_W],
      props: { display: "grid", "grid-template-columns": "296px 624px" },
    },
    {
      nodeId: "gridContent",
      tagName: "div",
      parentNodeId: "grid",
      w: ratioOf(SHELL_W, CONTENT_RATIO),
      props: block,
    },
    {
      nodeId: "gridDate",
      tagName: "div",
      parentNodeId: "grid",
      w: ratioOf(SHELL_W, DATE_RATIO),
      props: block,
    },
    // A grid item that FILLS the parent's border box — the full-width branch.
    { nodeId: "gridFull", tagName: "div", parentNodeId: "grid", w: [...SHELL_W], props: block },

    // --- the control: identical arithmetic, ordinary block containing block --
    { nodeId: "blockShell", tagName: "div", parentNodeId: "n002", w: [...SHELL_W], props: block },
    {
      nodeId: "blockContent",
      tagName: "div",
      parentNodeId: "blockShell",
      w: ratioOf(SHELL_W, CONTENT_RATIO),
      props: block,
    },
    { nodeId: "blockFull", tagName: "div", parentNodeId: "blockShell", w: [...SHELL_W], props: block },

    // --- flex items --------------------------------------------------------
    {
      nodeId: "flexRow",
      tagName: "div",
      parentNodeId: "n002",
      w: [...SHELL_W],
      props: { display: "flex", "flex-direction": "row" },
    },
    {
      nodeId: "flexGrown",
      tagName: "div",
      parentNodeId: "flexRow",
      w: ratioOf(SHELL_W, CONTENT_RATIO),
      props: { display: "block", "flex-grow": "1", "flex-basis": "0%" },
    },
    {
      nodeId: "flexBasis",
      tagName: "div",
      parentNodeId: "flexRow",
      w: ratioOf(SHELL_W, DATE_RATIO),
      props: { display: "block", "flex-grow": "0", "flex-basis": "20%" },
    },
    {
      nodeId: "flexInert",
      tagName: "div",
      parentNodeId: "flexRow",
      w: ratioOf(SHELL_W, CONTENT_RATIO),
      props: { display: "block", "flex-grow": "0", "flex-basis": "auto" },
    },
    {
      nodeId: "flexColumn",
      tagName: "div",
      parentNodeId: "n002",
      w: [...SHELL_W],
      props: { display: "flex", "flex-direction": "column" },
    },
    {
      nodeId: "colChild",
      tagName: "div",
      parentNodeId: "flexColumn",
      w: ratioOf(SHELL_W, CONTENT_RATIO),
      props: { display: "block", "flex-grow": "1", "flex-basis": "0%" },
    },

    // --- out of flow -------------------------------------------------------
    {
      nodeId: "absAncestor",
      tagName: "div",
      parentNodeId: "blockShell",
      w: ratioOf(SHELL_W, CONTENT_RATIO),
      props: { display: "block", position: "absolute" },
    },
    {
      nodeId: "fixedNode",
      tagName: "div",
      parentNodeId: "blockShell",
      w: ratioOf(SHELL_W, DATE_RATIO),
      props: { display: "block", position: "fixed" },
    },
    {
      nodeId: "relPadded",
      tagName: "div",
      parentNodeId: "n002",
      w: [...SHELL_W],
      props: {
        display: "block",
        position: "relative",
        "padding-left": "24px",
        "padding-right": "24px",
      },
    },
    {
      nodeId: "absInPadded",
      tagName: "div",
      parentNodeId: "relPadded",
      w: ratioOf(SHELL_W, CONTENT_RATIO, 48),
      props: { display: "block", position: "absolute" },
    },
    {
      nodeId: "relBare",
      tagName: "div",
      parentNodeId: "n002",
      w: [...SHELL_W],
      props: { display: "block", position: "relative" },
    },
    {
      nodeId: "absInBare",
      tagName: "div",
      parentNodeId: "relBare",
      w: ratioOf(SHELL_W, CONTENT_RATIO),
      props: { display: "block", position: "absolute" },
    },

    // --- a bordered parent -------------------------------------------------
    {
      nodeId: "borderedShell",
      tagName: "div",
      parentNodeId: "n002",
      w: [...SHELL_W],
      props: { display: "block", "border-left": "8px solid rgb(0, 0, 0)", "border-right": "8px solid rgb(0, 0, 0)" },
    },
    {
      nodeId: "borderedFill",
      tagName: "div",
      parentNodeId: "borderedShell",
      w: SHELL_W.map((width) => width - 16),
      props: block,
    },
  ];

  const { page, styleLookup, specNodes } = buildPage(nodes);
  const result = inferLayoutRules({ pages: [page], styleLookup, breakpoint: 915 });
  const keys = new Set(result.rules.map((rule) => `${rule.nodeId}|${rule.kind}`));
  const kindOf = (nodeId: string): string =>
    result.rules.find((rule) => rule.nodeId === nodeId)?.kind ?? "(none)";

  // --- case 1: THE DENOMINATOR REGRESSION ----------------------------------
  check(
    "grid item on a constant 48.75% curve recovers NO percentage rule",
    !keys.has("gridContent|percentage-width"),
    kindOf("gridContent"),
  );
  check(
    "…nor the date column on its own constant curve",
    !keys.has("gridDate|percentage-width"),
    kindOf("gridDate"),
  );
  check(
    "a grid item that fills the grid's border box recovers NO full-width rule",
    !keys.has("gridFull|full-width"),
    kindOf("gridFull"),
  );
  check(
    "…and every one of them was refused as `grid-item`, not silently missed",
    (result.counters.guardRefusalsByReason["grid-item"] ?? 0) === 3,
    JSON.stringify(result.counters.guardRefusalsByReason),
  );
  check(
    "the guarded nodes emit NO rule of any kind, so they keep their exact computed style",
    !result.rules.some((rule) =>
      ["gridContent", "gridDate", "gridFull"].includes(rule.nodeId),
    ),
  );

  // The control: the arithmetic is identical, so only the containing block can
  // be what rejected the grid children.
  check(
    "the SAME curve under a block parent still recovers `width: 48.75%`",
    result.rules.find((rule) => rule.nodeId === "blockContent")?.declarations["width"] ===
      "48.75%",
    result.rules.find((rule) => rule.nodeId === "blockContent")?.declarations["width"] ??
      "(none)",
  );
  check(
    "…and a block child filling its block parent still recovers `width: auto`",
    result.rules.find((rule) => rule.nodeId === "blockFull")?.declarations["width"] === "auto",
    kindOf("blockFull"),
  );

  // --- case 3: flex items --------------------------------------------------
  check(
    "a row flex item with flex-grow: 1 recovers no percentage rule",
    !keys.has("flexGrown|percentage-width"),
    kindOf("flexGrown"),
  );
  check(
    "a row flex item with a non-auto flex-basis recovers no percentage rule",
    !keys.has("flexBasis|percentage-width"),
    kindOf("flexBasis"),
  );
  check(
    "…both refused as `flex-item-basis-governed`",
    (result.counters.guardRefusalsByReason["flex-item-basis-governed"] ?? 0) === 2,
    JSON.stringify(result.counters.guardRefusalsByReason),
  );
  check(
    "a row flex item with flex-grow: 0 / flex-basis: auto is NOT over-rejected",
    result.rules.find((rule) => rule.nodeId === "flexInert")?.declarations["width"] ===
      "48.75%",
    kindOf("flexInert"),
  );
  check(
    "a COLUMN flex container's child is not a horizontal-axis case and is not rejected",
    result.rules.find((rule) => rule.nodeId === "colChild")?.declarations["width"] ===
      "48.75%",
    kindOf("colChild"),
  );

  // --- case 4: out of flow -------------------------------------------------
  check(
    "position:absolute under a static parent recovers nothing",
    !result.rules.some((rule) => rule.nodeId === "absAncestor"),
    kindOf("absAncestor"),
  );
  check(
    "…refused as `abs-containing-block-not-parent`",
    (result.counters.guardRefusalsByReason["abs-containing-block-not-parent"] ?? 0) === 1,
    JSON.stringify(result.counters.guardRefusalsByReason),
  );
  check(
    "position:fixed recovers nothing, refused as `fixed-position`",
    !result.rules.some((rule) => rule.nodeId === "fixedNode") &&
      (result.counters.guardRefusalsByReason["fixed-position"] ?? 0) === 1,
    kindOf("fixedNode"),
  );
  check(
    "position:absolute inside a PADDED positioned parent resolves against the padding box → refused",
    !result.rules.some((rule) => rule.nodeId === "absInPadded") &&
      (result.counters.guardRefusalsByReason["abs-containing-block-is-padding-box"] ?? 0) ===
        1,
    kindOf("absInPadded"),
  );
  check(
    "position:absolute inside a zero-padding positioned parent is NOT over-rejected",
    result.rules.find((rule) => rule.nodeId === "absInBare")?.declarations["width"] ===
      "48.75%",
    kindOf("absInBare"),
  );

  // --- the fourth 28.5A containing-block error: a bordered parent ----------
  check(
    "a child filling a BORDERED parent's content box recovers `width: auto` (border subtracted)",
    result.rules.find((rule) => rule.nodeId === "borderedFill")?.kind === "full-width",
    kindOf("borderedFill"),
  );

  // --- the guard as a unit -------------------------------------------------
  const guardOf = (nodeId: string, parentId: string): LayoutGuardReason | undefined =>
    containingBlockGuard(specNodes.get(nodeId)!, specNodes.get(parentId), styleLookup);
  check(
    "containingBlockGuard() names the grid case directly",
    guardOf("gridContent", "grid") === "grid-item",
    String(guardOf("gridContent", "grid")),
  );
  check(
    "…and returns undefined for an ordinary block child (no blanket rejection)",
    guardOf("blockContent", "blockShell") === undefined,
    String(guardOf("blockContent", "blockShell")),
  );
  check(
    "guard refusals are totalled",
    result.counters.guardRefusals === 8,
    String(result.counters.guardRefusals),
  );
  check(
    "…and every emitted rule carries its observed truth rect for the re-render",
    result.rules.length > 0 && result.rules.every((rule) => rule.truth !== undefined),
  );
  /*
   * P0 contract C2.1 — every emitted rule also carries its served interval (the
   * desktop tree from the 915 breakpoint, ∩ band) and the source probe box of
   * its node at EVERY probe width inside it, read straight off `node.probe`.
   */
  const sampleProblems: string[] = [];
  for (const emitted of result.rules) {
    const interval = emitted.servedInterval;
    const expectedMin = Math.max(915, emitted.band?.minWidth ?? 915);
    const expectedMax = Math.min(
      Number.POSITIVE_INFINITY,
      emitted.band?.maxWidth ?? Number.POSITIVE_INFINITY,
    );
    if (interval === undefined || interval.min !== expectedMin || interval.max !== expectedMax) {
      sampleProblems.push(`${emitted.nodeId}: interval ${JSON.stringify(interval)}`);
      continue;
    }
    const probe = specNodes.get(emitted.nodeId)!.probe!;
    const expectedWidths = PROBE_WIDTHS.filter(
      (width) => width >= interval.min && width < interval.max,
    );
    const samples = emitted.samples ?? [];
    if (samples.map((sample) => sample.width).join(",") !== expectedWidths.join(",")) {
      sampleProblems.push(`${emitted.nodeId}: widths ${JSON.stringify(samples)}`);
      continue;
    }
    for (const sample of samples) {
      const i = PROBE_WIDTHS.indexOf(sample.width);
      if (sample.x !== probe.x[i] || sample.w !== probe.w[i] || sample.v !== probe.v[i]) {
        sampleProblems.push(`${emitted.nodeId}@${sample.width}: ${JSON.stringify(sample)}`);
      }
    }
  }
  check(
    "(C2.1) every emitted rule carries servedInterval [915, ∞) ∩ band and the node's probe box at each probe width inside it",
    result.rules.length > 0 && sampleProblems.length === 0,
    sampleProblems.slice(0, 5).join("; "),
  );
}

// ---------------------------------------------------------------------------
// Part 2 — the browser truth check, real Chromium at the truth viewport
// ---------------------------------------------------------------------------

let nodeSeq = 0;
function el(
  nodeId: string,
  className: string,
  children: RuntimeElementNode["c"] = [],
): RuntimeElementNode {
  nodeSeq++;
  return { k: "e", n: nodeId, t: "div", p: { "data-wr-node": nodeId, className }, c: children };
}

function runtimePage(pageId: string, doc: RuntimeElementNode): RuntimePage {
  return {
    pageId,
    desktop: { id: "desktop", width: 1440, doc },
    mobile: { id: "mobile", width: 390, doc: el(`${pageId}-m`, "wr-empty") },
  };
}

/**
 * Four generic pages, each isolating one behaviour of the check. The exact
 * computed classes stand in for the SiteSpec's `.wr-stNNNNNN` tier; the
 * candidate rules stand in for what inference proposed.
 */
const HARNESS_CSS = `
html, body { margin: 0; padding: 0; }
.wr-variant { display: contents; }
/* p1 — a two-column grid: the containing block of each item is its GRID AREA. */
.p1-shell { width: 1280px; }
.p1-grid { display: grid; grid-template-columns: 296px 624px; column-gap: 360px; }
.p1-date { width: 296px; }
.p1-content { width: 624px; }
/* p2 — a centered band frozen at the observed viewport by the exact tier. */
.p2-outer { width: 1440px; }
.p2-band { width: 1080px; margin-left: 180px; }
/* p3 — an ordinary block child: no guard applies, the rule is simply wrong. */
.p3-shell { width: 1000px; }
.p3-box { width: 600px; }
/* p4 — the reconstruction is already 100px off here for reasons of its own. */
.p4-shell { width: 500px; }
.p4-box { width: 500px; }
/* p5 — a banded ANCESTOR over a banded descendant (Task 28.6 V1), a node the
   exact tier already hides at the truth viewport (Task 28.6 V4), and a node the
   exact tier already hides AT THE BAND WIDTH but not at the truth width — the
   positive fixture for bandExactTierHidesAtBandWidth (Task 28.6 D1(b)). */
.p5-shell { width: 1280px; }
.p5-anc { width: 640px; }
.p5-kid { width: 320px; }
.p5-gone { display: none; width: 200px; }
.p5-exact { width: 200px; }
@media (max-width: 1231.98px) { .p5-exact { display: none; } }
/* p6 — a grid whose exact tier froze its USED track sizes (Task 28.6 A5). */
.p6-grid { display: grid; grid-template-columns: 800px 400px; width: 1200px; }
/* p7 — four boxes the exact tier froze at the truth viewport (Task 28.7 B1):
   one that overhangs a narrower viewport, one that overflows its own parent
   there, and two that simply stop responding. */
.p7-shell { width: 1200px; }
.p7-fit { width: 500px; }
.p7-over { width: 700px; }
.p7-calm { width: 300px; }
/* p8 — out-of-flow boxes whose frozen used width came from the INSET equation
   (Task 28.7 G). .p8-solved is what the browser solved (1200 - 5 - 5 border
   - 20 - 20 inset = 1150); .p8-authored is over-constrained, so CSS drops
   its right inset and keeps its authored 600px at every viewport. */
.p8-shell { width: 1200px; position: relative; border: 5px solid transparent;
            padding: 0 30px; box-sizing: border-box; }
.p8-solved { position: absolute; left: 20px; right: 20px; width: 1110px; }
.p8-authored { position: absolute; left: 20px; right: 20px; width: 600px; }
/* p9 — Task 28.75. .p9-shell is a 1200px column centred in the 1440px truth
   viewport with 46px of padding per side, so its content box is 166 … 1274.
   .p9-fill is the in-flow chain root the exact tier froze at 1108px; .p9-bleed
   is the full-bleed band it froze at 1440px with a -720px margin and a 672px
   left, which renders 118 … 1558 — 118px of overhang at the truth width itself. */
.p9-shell { width: 1200px; margin: 0 auto; padding: 0 46px; box-sizing: border-box; }
.p9-fill { width: 1108px; }
.p9-bleed { position: relative; width: 1440px; margin-left: -720px;
            margin-right: -720px; left: 672px; }
/* p10 — Task 28.75 §03b. A grid with no width of its own, so it IS the viewport,
   whose exact tier froze the two USED tracks it had at 1440 (710 + 20 gutter +
   710). Below 1200 the source stacked its two items in ONE column; the frozen
   pair overhangs every width under 1440. */
.p10-grid { display: grid; grid-template-columns: 710px 710px; column-gap: 20px; }
/* p11 — Task 28.75 §03b. A grid ITEM inside a single fractional track, holding a
   child WIDER than the track. width:auto alone resolves to the child's 1400px
   (a grid item's automatic minimum is min-content); min-width:0 restores what
   the frozen 1200px pixel did. */
.p11-grid { display: grid; grid-template-columns: minmax(0, 1fr); width: 1200px; }
.p11-item { width: 1200px; }
.p11-inner { width: 1400px; }
`;

const P1 = runtimePage(
  "p000001",
  el("p1root", "p1-shell", [
    el("p1grid", "p1-grid", [el("p1date", "p1-date"), el("p1content", "p1-content")]),
  ]),
);
const P2 = runtimePage("p000002", el("p2root", "p2-outer", [el("p2band", "p2-band")]));
const P3 = runtimePage("p000003", el("p3root", "p3-shell", [el("p3box", "p3-box")]));
const P4 = runtimePage("p000004", el("p4root", "p4-shell", [el("p4box", "p4-box")]));
const P5 = runtimePage(
  "p000005",
  el("p5root", "p5-shell", [
    el("p5anc", "p5-anc", [el("p5kid", "p5-kid")]),
    el("p5gone", "p5-gone"),
    el("p5exact", "p5-exact"),
  ]),
);
const P6 = runtimePage(
  "p000006",
  el("p6grid", "p6-grid", [el("p6a", "p6-a"), el("p6b", "p6-b")]),
);
const P7 = runtimePage(
  "p000007",
  el("p7root", "p7-shell", [
    el("p7fit", "p7-fit", [el("p7over", "p7-over")]),
    el("p7calm", "p7-calm"),
  ]),
);
const P8 = runtimePage(
  "p000008",
  el("p8root", "p8-shell", [el("p8solved", "p8-solved"), el("p8authored", "p8-authored")]),
);
const P9 = runtimePage(
  "p000009",
  el("p9root", "p9-shell", [el("p9fill", "p9-fill"), el("p9bleed", "p9-bleed")]),
);
const P10 = runtimePage(
  "p000010",
  el("p10grid", "p10-grid", [el("p10a", "p10-a"), el("p10b", "p10-b")]),
);
const P11 = runtimePage(
  "p000011",
  el("p11grid", "p11-grid", [el("p11item", "p11-item", [el("p11inner", "p11-inner")])]),
);
/** Every harness page, in one place, so a new check cannot forget one. */
const HARNESS_PAGES = [P1, P2, P3, P4, P5, P6, P7, P8, P9, P10, P11];

function rule(
  pageId: string,
  nodeId: string,
  kind: RecoveredLayoutRule["kind"],
  declarations: Record<string, string>,
  truth: { x: number; w: number },
): RecoveredLayoutRule {
  return { pageId, nodeId, kind, declarations, evidence: ["fixture"], truth };
}

/** The exact rules a wrong denominator produces on the p1 grid. */
const GRID_DENOMINATOR_RULES = [
  rule("p000001", "p1content", "percentage-width", { width: "48.75%" }, { x: 656, w: 624 }),
  rule("p000001", "p1date", "percentage-width", { width: "23.13%" }, { x: 0, w: 296 }),
];
/** A legitimately centered container. Its rule reproduces the observed box. */
const CENTERED_RULE = rule(
  "p000002",
  "p2band",
  "centered-max-width",
  { "max-width": "1080px", "margin-left": "auto", "margin-right": "auto", width: "auto" },
  { x: 180, w: 1080 },
);
/** Passes every containing-block guard and is still wrong. */
const GUARD_CLEAN_REGRESSOR = rule(
  "p000003",
  "p3box",
  "percentage-width",
  { width: "40%" },
  { x: 0, w: 600 },
);
/** No worse than the exact fallback already was — not the rule's regression. */
const NO_WORSE_THAN_BASELINE = rule(
  "p000004",
  "p4box",
  "percentage-width",
  { width: "101%" },
  { x: 0, w: 600 },
);
/**
 * A banded rule. It cannot apply at the truth viewport, which since Task 28.6 R3
 * is why it is rendered at `band.verifyWidth` instead of being exempted.
 */
const MEDIA_RULE: RecoveredLayoutRule = {
  pageId: "p000002",
  nodeId: "p2band",
  kind: "responsive-hidden",
  declarations: { display: "none" },
  media: "(min-width: 1680px)",
  band: { minWidth: 1680, hiddenSamples: [1920], verifyWidth: 1920 },
  evidence: ["fixture"],
  truth: { x: 180, w: 1080 },
};
/**
 * The same rule with no numeric band: nothing says WHERE to render it, so it
 * cannot be verified inside its own range and must be rejected, not shipped.
 */
const NO_BAND_RULE: RecoveredLayoutRule = {
  pageId: "p000002",
  nodeId: "p2band",
  kind: "responsive-hidden",
  declarations: { display: "none" },
  media: "(min-width: 1680px)",
  evidence: ["fixture"],
  truth: { x: 180, w: 1080 },
};

async function truthCheckChecks(): Promise<void> {
  section("Part 2 — post-emit browser truth check (real Chromium at 1440)");

  const candidates = [
    ...GRID_DENOMINATOR_RULES,
    CENTERED_RULE,
    GUARD_CLEAN_REGRESSOR,
    NO_WORSE_THAN_BASELINE,
    MEDIA_RULE,
  ];
  const started = Date.now();
  const verified = await verifyLayoutRules({
    rules: candidates,
    pages: [P1, P2, P3, P4],
    css: HARNESS_CSS,
  });
  const elapsed = Date.now() - started;

  check(
    "the check ran in a real browser and says so",
    verified.counters.status === "verified",
    verified.counters.status,
  );
  const accepted = new Set(verified.rules.map((r) => `${r.pageId}|${r.nodeId}|${r.kind}`));
  const rejectionOf = (nodeId: string): (typeof verified.rejections)[number] | undefined =>
    verified.rejections.find((entry) => entry.nodeId === nodeId);

  // --- case 1, browser half ------------------------------------------------
  check(
    "the grid content column's 48.75% rule is REJECTED by the re-render",
    !accepted.has("p000001|p1content|percentage-width"),
  );
  check(
    "the grid date column's 23.13% rule is REJECTED by the re-render",
    !accepted.has("p000001|p1date|percentage-width"),
  );
  const contentRejection = rejectionOf("p1content");
  check(
    "…and the rejection records the measurement: a 624px item rendered at ~304px",
    contentRejection !== undefined &&
      Math.abs(contentRejection.rendered.w - 304.2) <= 1 &&
      contentRejection.observed.w === 624,
    JSON.stringify(contentRejection?.rendered ?? {}),
  );
  check(
    "…while the exact computed fallback renders that column at its observed width",
    contentRejection !== undefined &&
      Math.abs(contentRejection.baseline.w - contentRejection.observed.w) <= 4,
    JSON.stringify(contentRejection?.baseline ?? {}),
  );
  const dateRejection = rejectionOf("p1date");
  check(
    "…and the date column likewise (296px observed, ~68px with the bad rule)",
    dateRejection !== undefined &&
      Math.abs(dateRejection.baseline.w - 296) <= 4 &&
      dateRejection.rendered.w < 80,
    JSON.stringify(dateRejection?.rendered ?? {}),
  );

  // --- case 2: no over-rejection -------------------------------------------
  check(
    "a legitimately centered max-width container is ACCEPTED",
    accepted.has("p000002|p2band|centered-max-width"),
  );
  /*
   * Task 28.6 R3. The assertion that stood here — "an @media rule … is accepted
   * unchecked" — encoded the exemption this task removed, so it is replaced
   * rather than relaxed: the rule must still be ACCEPTED, and it must now have
   * been RENDERED inside its own band to earn that.
   */
  check(
    "…and an @media rule is accepted only after being rendered inside its own band",
    accepted.has("p000002|p2band|responsive-hidden") &&
      verified.counters.truthCheckable === 5 &&
      verified.counters.bandCheckable === 1 &&
      verified.counters.bandWidthsRendered === 1,
    `truthCheckable ${verified.counters.truthCheckable} / bandCheckable ` +
      `${verified.counters.bandCheckable} / bandWidthsRendered ` +
      `${verified.counters.bandWidthsRendered}`,
  );

  /*
   * P0 contract C2.1 — these fixtures carry no per-width `samples`, which is
   * explicit absent evidence: the interval-sample stage must not run, so the
   * one-truth-render + one-band-render counts above stay exactly what they were.
   */
  check(
    "(C2.1) sample-less rules add no interval-sample render and enter no interval stage",
    verified.counters.intervalSampleCheckable === 0 &&
      verified.counters.intervalSamplesRendered === 0 &&
      verified.counters.intervalSamplesChecked === 0 &&
      verified.counters.rejectedAtIntervalSample === 0 &&
      verified.counters.unprobedPositions === 0 &&
      verified.intervalRejections.length === 0,
    JSON.stringify(verified.counters),
  );

  // --- case 5: guard-clean regressor ---------------------------------------
  check(
    "a candidate no containing-block guard could refuse is still REJECTED when it regresses",
    !accepted.has("p000003|p3box|percentage-width"),
  );
  const guardClean = rejectionOf("p3box");
  check(
    "…measured: 600px observed, 400px rendered, 0px error without the rule",
    guardClean !== undefined &&
      Math.abs(guardClean.rendered.w - 400) <= 1 &&
      guardClean.errorWithout <= 4 &&
      guardClean.errorWith > 4,
    JSON.stringify(guardClean ?? {}),
  );
  check(
    "a rule that is NO WORSE than the exact fallback survives, even outside tolerance",
    accepted.has("p000004|p4box|percentage-width"),
  );

  // --- the invariant -------------------------------------------------------
  check(
    "rejectedByTruthCheck counts exactly the three regressors",
    verified.counters.rejectedByTruthCheck === 3,
    String(verified.counters.rejectedByTruthCheck),
  );
  check(
    "candidateRules / acceptedRules are both recorded",
    verified.counters.candidateRules === 6 && verified.counters.acceptedRules === 3,
    `${verified.counters.candidateRules} / ${verified.counters.acceptedRules}`,
  );
  check(
    "NOTHING shipped without a render — acceptedUnchecked is 0 on a verified run",
    verified.counters.acceptedUnchecked === 0 &&
      verified.counters.rejectedByBandCheck === 0,
    `${verified.counters.acceptedUnchecked} / ${verified.counters.rejectedByBandCheck}`,
  );
  check(
    "every candidate on this run WAS measured, so nothing is unverifiable",
    verified.counters.rejectedUnverifiable === 0,
    String(verified.counters.rejectedUnverifiable),
  );
  check(
    "acceptedRegressed === 0 — the claim the old docstring made for free is now measured",
    verified.counters.acceptedRegressed === 0,
    String(verified.counters.acceptedRegressed),
  );
  check(
    "the reject/re-measure loop converged inside its round budget",
    verified.counters.converged && verified.counters.rounds <= 4 * 4,
    `${verified.counters.rounds} rounds`,
  );
  check(
    "the emitted CSS carries the accepted selectors and none of the rejected ones",
    verified.css.includes('[data-wr-node="p2band"]') &&
      !verified.css.includes('[data-wr-node="p1content"]') &&
      !verified.css.includes('[data-wr-node="p3box"]'),
  );

  // --- the serializer the check renders through ----------------------------
  const html = truthCheckHtml(P1, HARNESS_CSS);
  check(
    "the harness renders the app's own wrapper, so the (0,3,0) selectors match",
    html.includes('data-wr-viewport="desktop"') && html.includes('data-wr-page="p000001"'),
  );
  check(
    "…with React prop names serialized back to HTML attributes",
    html.includes('class="p1-grid"') && !html.includes("className"),
  );

  console.log(`  (truth check: ${verified.counters.pagesRendered} pages, ${elapsed} ms)`);

  // --- opting out is recorded, never silent --------------------------------
  const disabled = await verifyLayoutRules({
    rules: candidates,
    pages: [P1, P2, P3, P4],
    css: HARNESS_CSS,
    enabled: false,
  });
  check(
    "disabling the check records `disabled` rather than reporting a pass",
    disabled.counters.status === "disabled" &&
      disabled.rules.length === candidates.length &&
      disabled.counters.acceptedUnchecked === candidates.length,
    disabled.counters.status,
  );
}

// ---------------------------------------------------------------------------
// Part 2b — an UNVERIFIABLE geometry rule is rejected, never shipped (D3)
// ---------------------------------------------------------------------------

/**
 * The invariant: a recovered rule may not ship unverified. There is no
 * exception.
 *
 * TASK 28.6 V5 — WHAT USED TO STAND HERE. This docstring claimed
 * `responsive-hidden` was "the single exception, and it is a proof rather than
 * an exemption — its @media band cannot apply at the truth viewport". R3
 * refuted it: a band that cannot be seen from 1440 is a reason to render it
 * somewhere ELSE, not a reason to ship it unrendered, and the exemption is
 * exactly what let 503 inverted bands through a green check. Banded rules are
 * verified at `band.verifyWidth` (Part 7), and each one is discriminated by its
 * own cascade rather than by an ancestor's (Part 8). Everything the check cannot
 * render and measure is REJECTED, and the status says which situation the run
 * was in.
 */

/** A geometry rule naming a page this generation is not writing. */
const ORPHAN_PAGE_RULE = rule(
  "p000009",
  "ghost-node",
  "percentage-width",
  { width: "40%" },
  { x: 0, w: 600 },
);
/** A geometry rule with no observed rect: nothing to compare a render against. */
const NO_TRUTH_RULE: RecoveredLayoutRule = {
  pageId: "p000003",
  nodeId: "p3box",
  kind: "full-width",
  declarations: { width: "100%" },
  evidence: ["fixture"],
};
/** A geometry rule for a node the emitted tree does not render at all. */
const MISSING_NODE_RULE = rule(
  "p000003",
  "p3ghost",
  "percentage-width",
  { width: "40%" },
  { x: 0, w: 600 },
);

async function unverifiableChecks(): Promise<void> {
  section("Part 2b — unverifiable geometry rules are rejected, not shipped");

  /*
   * --- case 1: candidates exist, none of them checkable --------------------
   *
   * Task 28.6 R3 changed what "not checkable" means for a banded rule. It used
   * to be "any banded rule at all"; it is now "a banded rule with no numeric
   * band", because a band is what names the width the rule has to be rendered
   * at. `NO_BAND_RULE` is that case, and it must be REJECTED like any other
   * rule this module cannot measure.
   */
  const unverifiable = await verifyLayoutRules({
    rules: [ORPHAN_PAGE_RULE, NO_TRUTH_RULE, NO_BAND_RULE],
    pages: [P1, P2, P3, P4],
    css: HARNESS_CSS,
  });
  check(
    "candidates that exist but cannot be checked are NOT reported as `no-candidates`",
    unverifiable.counters.status === "unverifiable-candidates",
    unverifiable.counters.status,
  );
  check(
    "…all three unverifiable rules are REJECTED, the banded one included",
    unverifiable.rules.length === 0 &&
      !unverifiable.css.includes('[data-wr-node="ghost-node"]') &&
      !unverifiable.css.includes('[data-wr-node="p3box"]') &&
      !unverifiable.css.includes('[data-wr-node="p2band"]'),
    JSON.stringify(unverifiable.rules.map((r) => `${r.pageId}|${r.nodeId}|${r.kind}`)),
  );
  check(
    "…and counted as such (rejectedUnverifiable 3, acceptedUnchecked 0, accepted 0)",
    unverifiable.counters.rejectedUnverifiable === 3 &&
      unverifiable.counters.acceptedUnchecked === 0 &&
      unverifiable.counters.acceptedRules === 0 &&
      unverifiable.counters.bandCheckable === 0 &&
      unverifiable.counters.candidateRules === 3,
    JSON.stringify(unverifiable.counters),
  );
  check(
    "…acceptedRegressed stays 0 and no browser was launched",
    unverifiable.counters.acceptedRegressed === 0 &&
      unverifiable.counters.pagesRendered === 0 &&
      unverifiable.counters.bandWidthsRendered === 0 &&
      unverifiable.counters.rounds === 0,
    JSON.stringify(unverifiable.counters),
  );
  check(
    "a banded rule that DOES carry a band is checkable in the same position",
    (
      await verifyLayoutRules({
        rules: [ORPHAN_PAGE_RULE, NO_TRUTH_RULE, MEDIA_RULE],
        pages: [P1, P2, P3, P4],
        css: HARNESS_CSS,
      })
    ).counters.bandCheckable === 1,
  );

  // --- case 2: zero candidates still says so -------------------------------
  const none = await verifyLayoutRules({ rules: [], pages: [P1], css: HARNESS_CSS });
  check(
    "a run with zero candidates still reports `no-candidates`",
    none.counters.status === "no-candidates" &&
      none.counters.candidateRules === 0 &&
      none.counters.rejectedUnverifiable === 0 &&
      none.rules.length === 0,
    none.counters.status,
  );

  // --- case 3: responsive-hidden only is NOT the unverifiable case ----------
  const hiddenOnly = await verifyLayoutRules({
    rules: [MEDIA_RULE],
    pages: [P1, P2, P3, P4],
    css: HARNESS_CSS,
  });
  check(
    "an @media-only corpus ships its rules — but only after an in-band render",
    hiddenOnly.counters.status === "responsive-hidden-only" &&
      hiddenOnly.rules.length === 1 &&
      hiddenOnly.counters.acceptedUnchecked === 0 &&
      hiddenOnly.counters.bandCheckable === 1 &&
      hiddenOnly.counters.bandWidthsRendered === 1 &&
      hiddenOnly.counters.rejectedUnverifiable === 0,
    `${hiddenOnly.counters.status} / ${hiddenOnly.rules.length} / unchecked ` +
      `${hiddenOnly.counters.acceptedUnchecked} / band renders ` +
      `${hiddenOnly.counters.bandWidthsRendered}`,
  );

  // --- case 4: the per-rule leak, on a run that DID render ------------------
  const mixed = await verifyLayoutRules({
    rules: [CENTERED_RULE, MISSING_NODE_RULE, ORPHAN_PAGE_RULE],
    pages: [P1, P2, P3, P4],
    css: HARNESS_CSS,
  });
  const mixedAccepted = new Set(mixed.rules.map((r) => `${r.pageId}|${r.nodeId}`));
  check(
    "on a verified run, an unrenderable node's rule is dropped while the rest are measured",
    mixed.counters.status === "verified" &&
      mixedAccepted.has("p000002|p2band") &&
      !mixedAccepted.has("p000003|p3ghost") &&
      !mixedAccepted.has("p000009|ghost-node"),
    JSON.stringify([...mixedAccepted]),
  );
  check(
    "…counted as unverifiable rather than as measured regressions",
    mixed.counters.rejectedUnverifiable === 2 &&
      mixed.counters.rejectedByTruthCheck === 0 &&
      mixed.counters.acceptedRules === 1 &&
      mixed.counters.acceptedRegressed === 0,
    JSON.stringify(mixed.counters),
  );
  check(
    "…and acceptedRules never exceeds what the emitted CSS carries",
    mixed.counters.acceptedRules === mixed.rules.length &&
      !mixed.css.includes('[data-wr-node="p3ghost"]'),
    String(mixed.counters.acceptedRules),
  );
}

// ---------------------------------------------------------------------------
// Part 3 — the real generation path
// ---------------------------------------------------------------------------

function minimalPlan(rules: readonly RecoveredLayoutRule[]): ReconstructionPlan {
  const pages = [P1, P2, P3, P4];
  return {
    rootUrl: "https://fixture.test",
    breakpoint: {
      value: 915,
      provenance: "inferred",
      method: "observed-endpoint-midpoint",
      mobileObservedWidth: 390,
      desktopObservedWidth: 1440,
      convention: "mobile below, desktop at or above",
    },
    routes: { routes: [], byKey: new Map() },
    pages,
    pageFiles: new Map(pages.map((page) => [page.pageId, `pages/${page.pageId}.json`])),
    styles: { css: HARNESS_CSS, ruleCount: 9, missingTokens: [], declarationCount: 0 },
    // The fixture carries no source `:root` tier; the field exists so the plan
    // matches the shape generateApp() consumes.
    customProperties: {
      css: "",
      blockCount: 0,
      declarationCount: 0,
      rejectedNames: 0,
      rejectedValues: 0,
      rejectedScopes: 0,
    },
    pseudoStyles: { css: "", ruleCount: 0, declarationCount: 0, missingTokens: [], rejectedValues: 0 },
    layout: {
      rules: [...rules],
      css: "",
      counters: {
        pagesWithAlignedProbe: 4,
        nodesWithProbe: 8,
        centered: 1,
        fullWidth: 0,
        percentage: 4,
        responsiveHidden: 1,
        guardRefusals: 8,
        guardRefusalsByReason: { "grid-item": 3, "fixed-position": 1 },
        widthModeRefusals: 2,
        widthModeRefusalsByReason: { "flex-item-main-axis": 2 },
        widthModeStretch: 1,
        widthModeFillPercentage: 0,
        bandSampleMismatches: 0,
        // Task 28.6 V2 / A5 — inference-side counters the manifest must carry
        // through untouched, so a reader can see a refusal that never became a
        // rule.
        widthValueRefusals: 1,
        widthValueRefusalsByReason: { "own-padding-unreadable": 1 },
        gridTrackColumns: 0,
        gridTrackRefusals: 2,
        gridTrackRefusalsByReason: { "container-width-constant": 2 },
        // Task 28.6 D1 — the band-edge provenance accounting. Distinct values on
        // purpose: a manifest that dropped one of these would otherwise read as
        // a zero, and a zero here is a claim about the source site.
        authoredBreakpointPages: { "spec-field": 3, unavailable: 1 },
        authoredBreakpointEntries: 5,
        authoredBreakpointDeclarations: 40,
        authoredBreakpointUnparsedDeclarations: 2,
        authoredBreakpointTruncatedNodes: 1,
        bandEdgesOpen: 1,
        bandEdgesConsidered: 3,
        bandEdgesSnapped: 2,
        bandEdgesSnappedAmbiguous: 1,
        bandEdgesKeptMidpointNoAuthoredInGap: 1,
        bandEdgesKeptMidpointEmptyHistogram: 0,
        bandEdgesKeptMidpointNoHistogram: 0,
        bandEdgeSnapShiftPx: 207,
      },
    },
    observedTargetCss: "",
    interactions: {
      bindings: new Map(),
      unknowns: new Map(),
      nativeBindings: 0,
      scriptedBindings: 0,
      dynamicTargets: 0,
      dynamicTargetsWithContent: 0,
      dynamicTemplateNodes: 0,
      interactionStateConflicts: 0,
    },
    counters: newCounters(),
    coverage: {
      exactObservedRoutes: 0,
      validationObservedRoutes: 0,
      familyRepresentedRoutes: 0,
      exactBehaviorRoutes: 0,
      representedBehaviorRoutes: 0,
      unexploredBehaviorRoutes: 0,
      routesWithoutBehaviorEvidence: 0,
    },
    behavior: {
      sourcePatternInstances: 0,
      runtimeBindings: 0,
      nativeBindings: 0,
      scriptedBindings: 0,
      unsupportedPatterns: 0,
      byPatternType: {},
      byMechanism: {},
      unknownSourceInstances: 0,
      unknownAnnotations: 0,
      unknownBehaviorsImplemented: 0,
    },
    limitations: ["layout-rule-inferred"],
    sourceLimitations: [],
    sourceLimitationGlossary: {},
  } as unknown as ReconstructionPlan;
}

async function pipelineChecks(): Promise<void> {
  section("Part 3 — the check runs on the real generation path (generateApp)");

  const outputDir = path.join(TMP_ROOT, "generated");
  await rm(outputDir, { recursive: true, force: true });
  await mkdir(outputDir, { recursive: true });

  const versions = await resolveDependencyVersions(process.cwd());
  const plan = minimalPlan([
    ...GRID_DENOMINATOR_RULES,
    CENTERED_RULE,
    GUARD_CLEAN_REGRESSOR,
    NO_WORSE_THAN_BASELINE,
    MEDIA_RULE,
  ]);
  const generated = await generateApp(plan, {
    outputDir,
    sourceSchemaVersion: 1,
    sourceSiteSpecVersion: 1,
    sourceCompilerVersion: 1,
    versions,
  });

  const manifest = ReconstructionManifestSchema.parse(
    JSON.parse(await readFile(path.join(outputDir, "reconstruction-manifest.json"), "utf8")),
  );
  const layout = manifest.layout!;
  check(
    "generateApp() ran the truth check without being asked to",
    layout.truthCheckStatus === "verified",
    String(layout.truthCheckStatus),
  );
  check(
    "the manifest counts candidates and acceptances",
    layout.candidateRules === 6 && layout.acceptedRules === 3,
    `${layout.candidateRules} / ${layout.acceptedRules}`,
  );
  check(
    "…the two refusal channels separately",
    layout.rejectedByGuard === 8 && layout.rejectedByTruthCheck === 3,
    `guard ${layout.rejectedByGuard} / truth ${layout.rejectedByTruthCheck}`,
  );
  check(
    "…the guard refusals by reason",
    (layout.guardRefusalsByReason ?? {})["grid-item"] === 3,
    JSON.stringify(layout.guardRefusalsByReason ?? {}),
  );
  check(
    "…and acceptedRegressed === 0 in the shipped artifact",
    layout.acceptedRegressed === 0,
    String(layout.acceptedRegressed),
  );
  check(
    "…the Task 28.6 R1 band invariant is a number in the manifest, and it is 0",
    layout.bandSampleMismatches === 0,
    String(layout.bandSampleMismatches),
  );
  check(
    "…the D1 band-edge provenance reaches the manifest, every channel of it",
    layout.bandEdgesConsidered === 3 &&
      layout.bandEdgesOpen === 1 &&
      layout.bandEdgesSnapped === 2 &&
      layout.bandEdgesSnappedAmbiguous === 1 &&
      layout.bandEdgesKeptMidpointNoAuthoredInGap === 1 &&
      layout.bandEdgesKeptMidpointEmptyHistogram === 0 &&
      layout.bandEdgesKeptMidpointNoHistogram === 0 &&
      layout.bandEdgeSnapShiftPx === 207,
    JSON.stringify({
      considered: layout.bandEdgesConsidered,
      open: layout.bandEdgesOpen,
      snapped: layout.bandEdgesSnapped,
      ambiguous: layout.bandEdgesSnappedAmbiguous,
      noneInGap: layout.bandEdgesKeptMidpointNoAuthoredInGap,
      emptyHistogram: layout.bandEdgesKeptMidpointEmptyHistogram,
      noHistogram: layout.bandEdgesKeptMidpointNoHistogram,
      shift: layout.bandEdgeSnapShiftPx,
    }),
  );
  check(
    "…and so does WHERE the histograms came from, and how incomplete they were",
    JSON.stringify(layout.authoredBreakpointPages) ===
      JSON.stringify({ "spec-field": 3, unavailable: 1 }) &&
      layout.authoredBreakpointEntries === 5 &&
      layout.authoredBreakpointDeclarations === 40 &&
      layout.authoredBreakpointUnparsedDeclarations === 2 &&
      layout.authoredBreakpointTruncatedNodes === 1,
    JSON.stringify({
      pages: layout.authoredBreakpointPages,
      entries: layout.authoredBreakpointEntries,
      declarations: layout.authoredBreakpointDeclarations,
      unparsed: layout.authoredBreakpointUnparsedDeclarations,
      truncated: layout.authoredBreakpointTruncatedNodes,
    }),
  );
  check(
    "…and the manifest's own edge accounting closes, as the inference's did",
    (layout.bandEdgesConsidered ?? -1) ===
      (layout.bandEdgesSnapped ?? 0) +
        (layout.bandEdgesKeptMidpointNoAuthoredInGap ?? 0) +
        (layout.bandEdgesKeptMidpointEmptyHistogram ?? 0) +
        (layout.bandEdgesKeptMidpointNoHistogram ?? 0),
  );
  check(
    "…the R2 width-mode accounting reaches the manifest",
    layout.widthModeRefusals === 2 &&
      (layout.widthModeRefusalsByReason ?? {})["flex-item-main-axis"] === 2 &&
      layout.widthModeStretch === 1,
    JSON.stringify({
      refusals: layout.widthModeRefusals,
      byReason: layout.widthModeRefusalsByReason,
      stretch: layout.widthModeStretch,
    }),
  );
  check(
    "…and the R3 in-band verification is recorded, not assumed",
    layout.bandCheckable === 1 &&
      layout.rejectedByBandCheck === 0 &&
      layout.bandWidthsRendered === 1 &&
      layout.acceptedUnchecked === 0,
    JSON.stringify({
      bandCheckable: layout.bandCheckable,
      rejected: layout.rejectedByBandCheck,
      renders: layout.bandWidthsRendered,
      unchecked: layout.acceptedUnchecked,
    }),
  );
  check(
    "…the V1 band-discrimination split reaches the manifest as three numbers",
    layout.bandIndependentlyDiscriminated === 1 &&
      layout.bandIndependentlyDiscriminated === layout.bandCheckable &&
      layout.bandHiddenByAncestorAtBandWidth === 0 &&
      layout.bandExactTierHidesAtBandWidth === 0,
    JSON.stringify({
      discriminated: layout.bandIndependentlyDiscriminated,
      byAncestor: layout.bandHiddenByAncestorAtBandWidth,
      byExactTier: layout.bandExactTierHidesAtBandWidth,
    }),
  );
  check(
    "…the V4 truth-baseline contradiction is a manifest field, and it is 0 here",
    layout.bandTruthBaselineNotInLayout === 0,
    String(layout.bandTruthBaselineNotInLayout),
  );
  check(
    "…the V2 value refusals survive the plan → manifest hop, by reason",
    layout.widthValueRefusals === 1 &&
      (layout.widthValueRefusalsByReason ?? {})["own-padding-unreadable"] === 1,
    JSON.stringify(layout.widthValueRefusalsByReason ?? {}),
  );
  check(
    "…and so does the A5 grid-track accounting, refusals included",
    layout.gridTrack === 0 &&
      layout.gridTrackColumns === 0 &&
      layout.gridTrackRefusals === 2 &&
      (layout.gridTrackRefusalsByReason ?? {})["container-width-constant"] === 2,
    JSON.stringify({
      shipped: layout.gridTrack,
      emitted: layout.gridTrackColumns,
      refused: layout.gridTrackRefusalsByReason,
    }),
  );
  check(
    "`recoveredRules` names what SHIPPED, not what was proposed",
    layout.recoveredRules === 3 && layout.recoveredRules === layout.acceptedRules,
    String(layout.recoveredRules),
  );

  const stylesheet = await readFile(
    path.join(outputDir, "app", "public", "wr", "generated-styles.css"),
    "utf8",
  );
  check(
    "the shipped stylesheet carries the accepted centered rule",
    stylesheet.includes('[data-wr-page="p000002"][data-wr-viewport="desktop"] [data-wr-node="p2band"]'),
  );
  check(
    "…and NOT the wrong-denominator grid rules",
    !stylesheet.includes('[data-wr-node="p1content"]') &&
      !stylesheet.includes('[data-wr-node="p1date"]'),
  );
  check(
    "…nor the guard-clean regressor",
    !stylesheet.includes('[data-wr-node="p3box"]'),
  );
  check(
    "generateApp() returns the verification for the CLI to report",
    generated.layoutVerification.counters.rejectedByTruthCheck === 3,
  );
  check(
    "the manifest carries no wall-clock timing (generation stays byte-deterministic)",
    !JSON.stringify(layout).includes("elapsed"),
  );

  // A run with nothing to verify must not claim a verification happened.
  const emptyDir = path.join(TMP_ROOT, "generated-empty");
  await rm(emptyDir, { recursive: true, force: true });
  const emptyRun = await generateApp(minimalPlan([]), {
    outputDir: emptyDir,
    sourceSchemaVersion: 1,
    sourceSiteSpecVersion: 1,
    sourceCompilerVersion: 1,
    versions,
  });
  check(
    "a plan with no recovered rules records `no-candidates` and launches no browser",
    emptyRun.manifest.layout?.truthCheckStatus === "no-candidates" &&
      emptyRun.manifest.layout?.truthCheckPagesRendered === 0,
    String(emptyRun.manifest.layout?.truthCheckStatus),
  );
}

// ---------------------------------------------------------------------------
// Part 4 — historical artifact compatibility
// ---------------------------------------------------------------------------

function schemaCompatibilityChecks(): void {
  section("Part 4 — old manifests still parse (the schema change is additive)");

  const historical = {
    schemaVersion: 1,
    generatorVersion: 1,
    engine: "x",
    sourceSiteSpecVersion: 1,
    sourceSchemaVersion: 1,
    sourceCompilerVersion: 1,
    rootUrl: "https://fixture.test",
    config: {
      inferredBreakpoint: {
        value: 915,
        provenance: "inferred",
        method: "observed-endpoint-midpoint",
        mobileObservedWidth: 390,
        desktopObservedWidth: 1440,
        convention: "c",
      },
      routeMode: "catch-all",
      assetMode: "reference",
      nextVersion: "0",
      reactVersion: "0",
    },
    stats: {},
    coverage: {},
    behavior: {},
    layout: {
      pagesWithAlignedProbe: 8,
      nodesWithProbe: 6853,
      recoveredRules: 1910,
      centered: 1,
      fullWidth: 1,
      percentage: 52,
      responsiveHidden: 710,
    },
    generatedFiles: [],
    limitations: [],
    sourceLimitations: [],
    limitationGlossary: {},
  };
  // Only the `layout` block is this task's concern; the rest of the manifest is
  // filled in from a real run, so the compatibility claim is checked on the
  // block that actually changed.
  const layoutSchema = ReconstructionManifestSchema.shape.layout;
  const parsed = layoutSchema.safeParse(historical.layout);
  check(
    "a pre-28.5B `layout` block parses unchanged, with every new field absent",
    parsed.success && parsed.data?.candidateRules === undefined,
    parsed.success ? "" : JSON.stringify(parsed.error.issues.slice(0, 2)),
  );
  check(
    "…and the new 28.5B statuses/counters parse on a current block",
    layoutSchema.safeParse({
      ...historical.layout,
      truthCheckStatus: "unverifiable-candidates",
      rejectedUnverifiable: 2,
      acceptedUnchecked: 710,
    }).success &&
      layoutSchema.safeParse({
        ...historical.layout,
        truthCheckStatus: "responsive-hidden-only",
      }).success,
  );
  check(
    "…and an unknown truthCheckStatus is rejected rather than accepted as a pass",
    !layoutSchema.safeParse({ ...historical.layout, truthCheckStatus: "probably-fine" })
      .success,
  );
}

// ---------------------------------------------------------------------------
// Part 5 — Task 28.6 R2: `width: auto` is INTRINSIC sizing, not stretch
// ---------------------------------------------------------------------------

/**
 * The defect, in one sentence: `centered-max-width` and `full-width` both
 * emitted `width: auto`, which fills the containing block ONLY for a block-level
 * in-flow box in a block container. Everywhere else — an out-of-flow box, a flex
 * item, a grid item, a `display: table` — it is shrink-to-fit, and on the 28.5B
 * corpus it resolved to the right number only because every descendant still
 * carried a frozen pixel width from the exact tier propping up max-content.
 *
 * The naive repair was measured to be worse: `width: 100%` on a genuinely-stretch
 * anchor collapsed its container from full width to 742px, because a percentage
 * contributes nothing to an ancestor's intrinsic size. So this suite pins BOTH
 * directions, on fixtures that differ only in the property that decides.
 */
function widthModeChecks(): void {
  section("Part 5 — R2: `width: auto` only where the box was shown to stretch");

  const block: Props = { display: "block", "box-sizing": "border-box" };
  /** Constant width, centered in a growing parent — the centered-max-width curve. */
  const CENTERED_W = [390, 768, 800, 800, 800];
  const CENTERED_X = [0, 0, 72, 240, 240];

  const nodes: FixtureNode[] = [
    { nodeId: "n001", tagName: "html", w: [...PROBE_WIDTHS], props: block },
    { nodeId: "n002", tagName: "body", parentNodeId: "n001", w: [...PROBE_WIDTHS], props: block },

    // --- block child of a block parent: the one shape `auto` is right for ----
    { nodeId: "blockShell", tagName: "div", parentNodeId: "n002", w: [...SHELL_W], props: block },
    { nodeId: "blockFill", tagName: "div", parentNodeId: "blockShell", w: [...SHELL_W], props: block },
    {
      nodeId: "blockCentered",
      tagName: "div",
      parentNodeId: "blockShell",
      w: [...CENTERED_W],
      x: [...CENTERED_X],
      props: block,
    },
    // `display: table` passes the blockish gate and shrink-to-fits on `auto`.
    {
      nodeId: "tableFill",
      tagName: "div",
      parentNodeId: "blockShell",
      w: [...SHELL_W],
      props: { display: "table", "box-sizing": "border-box" },
    },

    // --- out of flow: `auto` is shrink-to-fit, the guard is clean -----------
    {
      nodeId: "posShell",
      tagName: "div",
      parentNodeId: "n002",
      w: [...SHELL_W],
      props: { display: "block", position: "relative", "box-sizing": "border-box" },
    },
    {
      nodeId: "absFill",
      tagName: "div",
      parentNodeId: "posShell",
      w: [...SHELL_W],
      props: { display: "block", position: "absolute", "box-sizing": "border-box" },
    },
    {
      nodeId: "posShell2",
      tagName: "div",
      parentNodeId: "n002",
      w: [...SHELL_W],
      props: { display: "block", position: "relative", "box-sizing": "border-box" },
    },
    // content-box + padding: `100%` would overflow by exactly the padding.
    {
      nodeId: "absPadded",
      tagName: "div",
      parentNodeId: "posShell2",
      w: [...SHELL_W],
      props: {
        display: "block",
        position: "absolute",
        "box-sizing": "content-box",
        "padding-left": "20px",
        "padding-right": "20px",
      },
    },

    // --- flex ROW: width is the MAIN size, neither form reproduces it -------
    {
      nodeId: "rowShell",
      tagName: "div",
      parentNodeId: "n002",
      w: [...SHELL_W],
      props: { display: "flex", "flex-direction": "row", "box-sizing": "border-box" },
    },
    {
      nodeId: "rowFill",
      tagName: "div",
      parentNodeId: "rowShell",
      w: [...SHELL_W],
      props: {
        display: "block",
        "flex-grow": "0",
        "flex-basis": "auto",
        "box-sizing": "border-box",
      },
    },

    // --- flex COLUMN: width is the CROSS size, which stretches by default ---
    {
      nodeId: "colShell",
      tagName: "div",
      parentNodeId: "n002",
      w: [...SHELL_W],
      props: { display: "flex", "flex-direction": "column", "box-sizing": "border-box" },
    },
    {
      nodeId: "colFill",
      tagName: "div",
      parentNodeId: "colShell",
      w: [...SHELL_W],
      props: {
        display: "block",
        "flex-grow": "0",
        "flex-basis": "auto",
        "box-sizing": "border-box",
      },
    },
    // …but an auto CROSS margin absorbs the free space before alignment, so the
    // item stops stretching. Same node, different rule kind, different answer.
    {
      nodeId: "colCentered",
      tagName: "div",
      parentNodeId: "colShell",
      w: [...CENTERED_W],
      x: [...CENTERED_X],
      props: { display: "block", "box-sizing": "border-box" },
    },

    // --- grid: the stretch target is the AREA, which was never measured -----
    {
      nodeId: "gridShell",
      tagName: "div",
      parentNodeId: "n002",
      w: [...SHELL_W],
      props: { display: "grid", "box-sizing": "border-box" },
    },
    {
      nodeId: "gridCentered",
      tagName: "div",
      parentNodeId: "gridShell",
      w: [...CENTERED_W],
      x: [...CENTERED_X],
      props: { display: "block", "box-sizing": "border-box" },
    },
  ];

  const { page, styleLookup, specNodes } = buildPage(nodes);
  const result = inferLayoutRules({ pages: [page], styleLookup, breakpoint: 915 });
  const ruleFor = (nodeId: string): RecoveredLayoutRule | undefined =>
    result.rules.find((rule) => rule.nodeId === nodeId);
  const widthOf = (nodeId: string): string =>
    ruleFor(nodeId)?.declarations["width"] ?? "(no rule)";

  // --- direction 1: stretch keeps `auto` -----------------------------------
  check(
    "a block child filling a block parent still ships `width: auto`",
    widthOf("blockFill") === "auto" && ruleFor("blockFill")?.kind === "full-width",
    widthOf("blockFill"),
  );
  check(
    "…and a centered block child of a block parent too (auto margins are harmless there)",
    widthOf("blockCentered") === "auto" &&
      ruleFor("blockCentered")?.declarations["max-width"] === "800px",
    widthOf("blockCentered"),
  );
  check(
    "a flex-COLUMN child stretches on the cross axis, so it also keeps `width: auto`",
    widthOf("colFill") === "auto",
    widthOf("colFill"),
  );

  // --- direction 2: intrinsic gets an explicit percentage ------------------
  check(
    "a `display: table` child shrink-to-fits on `auto`, so it ships `width: 100%`",
    widthOf("tableFill") === "100%",
    widthOf("tableFill"),
  );
  check(
    "an out-of-flow box shrink-to-fits on `auto`, so it ships `width: 100%`",
    widthOf("absFill") === "100%",
    widthOf("absFill"),
  );
  check(
    "…and under `content-box` the padding is subtracted rather than overflowed",
    widthOf("absPadded") === "calc(100% - 40px)",
    widthOf("absPadded"),
  );
  check(
    "an auto cross margin defeats a flex-column child's stretch → `width: 100%`",
    widthOf("colCentered") === "100%" &&
      ruleFor("colCentered")?.declarations["margin-left"] === "auto",
    widthOf("colCentered"),
  );

  // --- direction 3: neither answer is knowable → emit NOTHING, count it ----
  check(
    "a flex-ROW item's width is its main size — no rule is emitted at all",
    ruleFor("rowFill") === undefined,
    widthOf("rowFill"),
  );
  check(
    "a centered GRID item is refused too: the stretch target is the area, not the parent",
    ruleFor("gridCentered") === undefined,
    widthOf("gridCentered"),
  );
  check(
    "…and both refusals are COUNTED by reason, never silently dropped",
    result.counters.widthModeRefusals === 2 &&
      result.counters.widthModeRefusalsByReason["flex-item-main-axis"] === 1 &&
      result.counters.widthModeRefusalsByReason["grid-item-inline-size"] === 1,
    JSON.stringify(result.counters.widthModeRefusalsByReason),
  );
  check(
    "the two emission modes are counted apart from each other",
    result.counters.widthModeStretch === 3 &&
      result.counters.widthModeFillPercentage === 4,
    `stretch ${result.counters.widthModeStretch} / fill ${result.counters.widthModeFillPercentage}`,
  );
  check(
    "every rule names the evidence its width form stood on",
    result.rules
      .filter((rule) => rule.kind !== "responsive-hidden")
      .every((rule) => rule.evidence.some((line) => line.startsWith("inline size:"))),
  );

  // --- the discriminator as a unit, and it is BIDIRECTIONAL ----------------
  const behaviourOf = (
    nodeId: string,
    parentId: string,
    autoInlineMargins: boolean,
  ): string =>
    `${
      inlineSizeBehaviour(
        specNodes.get(nodeId)!,
        specNodes.get(parentId),
        styleLookup,
        { autoInlineMargins },
      ).mode
    }`;
  check(
    "the SAME flex-column child is `stretch` without auto margins and not with them",
    behaviourOf("colFill", "colShell", false) === "stretch" &&
      behaviourOf("colFill", "colShell", true) === "fill-percentage",
    `${behaviourOf("colFill", "colShell", false)} / ${behaviourOf("colFill", "colShell", true)}`,
  );
  check(
    "…while a block child of a block parent is `stretch` either way",
    behaviourOf("blockFill", "blockShell", false) === "stretch" &&
      behaviourOf("blockFill", "blockShell", true) === "stretch",
  );
  check(
    "an out-of-flow box is never `stretch`, and is refused outright once margins go auto",
    behaviourOf("absFill", "posShell", false) === "fill-percentage" &&
      behaviourOf("absFill", "posShell", true) === "refuse",
  );
  check(
    "a node whose parent style is unknown is refused rather than guessed at",
    inlineSizeBehaviour(specNodes.get("blockFill")!, undefined, styleLookup, {
      autoInlineMargins: false,
    }).reason === "styles-unavailable",
  );
}

// ---------------------------------------------------------------------------
// Part 6 — Task 28.6 R1: the band runs on the side the probe observed
// ---------------------------------------------------------------------------

const DESKTOP_3 = [
  { width: 1024, i: 0 },
  { width: 1440, i: 1 },
  { width: 1920, i: 2 },
];
const DESKTOP_4 = [
  { width: 1024, i: 0 },
  { width: 1200, i: 1 },
  { width: 1440, i: 2 },
  { width: 1920, i: 3 },
];

/**
 * The proven off-by-one. When the hidden sample was the LOWEST desktop probe
 * width there was no lower VISIBLE neighbour to take a midpoint against, and the
 * band opened at the sample itself — so it ran UPWARD from the observation.
 * Every one of the 738 candidates on the 28.5B Linear corpus had that shape, and
 * every one shipped hiding the node across [1024, 1232) while leaving it visible
 * across [breakpoint, 1024), which is the range the probe measured it hidden in.
 */
function bandEdgeChecks(): void {
  section("Part 6a — R1: band edges, offline");

  const low = hiddenBands(DESKTOP_3, [DESKTOP_3[0]!]);
  check(
    "a hidden LOWEST sample opens the band downward — no min-width at all",
    low.length === 1 && low[0]!.minWidth === undefined && low[0]!.maxWidth === 1232,
    JSON.stringify(low),
  );
  check(
    "…which is the regression: the shipped band opened at min-width 1024 instead",
    low[0]!.minWidth !== 1024 && bandMedia(low[0]!) === "(max-width: 1231.98px)",
    bandMedia(low[0]!),
  );
  check(
    "…so the band now covers 1023, where the probe's nearest sample was HIDDEN",
    bandContains(low[0]!, 1023) && bandContains(low[0]!, 1024) && bandContains(low[0]!, 1231),
  );
  check(
    "…and stops at 1232, where the probe measured the node VISIBLE",
    !bandContains(low[0]!, 1232) && !bandContains(low[0]!, 1440),
  );
  check(
    "…carrying the observed sample it must be verified at",
    low[0]!.hiddenSamples.join(",") === "1024" && low[0]!.verifyWidth === 1024,
    JSON.stringify(low[0]!.hiddenSamples),
  );

  const high = hiddenBands(DESKTOP_3, [DESKTOP_3[2]!]);
  check(
    "a hidden HIGHEST sample still opens the band upward (unchanged behaviour)",
    high.length === 1 &&
      high[0]!.minWidth === 1680 &&
      high[0]!.maxWidth === undefined &&
      bandMedia(high[0]!) === "(min-width: 1680px)",
    bandMedia(high[0]!),
  );

  const mid = hiddenBands(DESKTOP_4, [DESKTOP_4[1]!]);
  check(
    "a hidden MIDDLE sample takes a midpoint on both sides",
    mid.length === 1 &&
      bandMedia(mid[0]!) === "(min-width: 1112px) and (max-width: 1319.98px)",
    bandMedia(mid[0]!),
  );

  const run = hiddenBands(DESKTOP_4, [DESKTOP_4[0]!, DESKTOP_4[1]!]);
  check(
    "contiguous hidden samples merge into ONE band, open downward, both samples kept",
    run.length === 1 &&
      run[0]!.minWidth === undefined &&
      run[0]!.maxWidth === 1320 &&
      run[0]!.hiddenSamples.join(",") === "1024,1200",
    JSON.stringify(run),
  );

  const split = hiddenBands(DESKTOP_4, [DESKTOP_4[0]!, DESKTOP_4[3]!]);
  check(
    "non-contiguous hidden samples make two bands, and neither covers a visible one",
    split.length === 2 &&
      !split.some((band) => bandContains(band, 1440)) &&
      !split.some((band) => bandContains(band, 1200)) &&
      split.some((band) => bandContains(band, 1024)) &&
      split.some((band) => bandContains(band, 1920)),
    JSON.stringify(split.map(bandMedia)),
  );

  // --- and the same thing through the real inference path ------------------
  const block: Props = { display: "block", "box-sizing": "border-box" };
  const { page, styleLookup } = buildPage([
    { nodeId: "n001", tagName: "html", w: [...PROBE_WIDTHS], props: block },
    { nodeId: "n002", tagName: "body", parentNodeId: "n001", w: [...PROBE_WIDTHS], props: block },
    { nodeId: "r1shell", tagName: "div", parentNodeId: "n002", w: [...SHELL_W], props: block },
    {
      nodeId: "hiddenLow",
      tagName: "div",
      parentNodeId: "r1shell",
      w: [200, 200, 0, 200, 200],
      v: [1, 1, 0, 1, 1],
      props: block,
    },
  ]);
  const inferred = inferLayoutRules({ pages: [page], styleLookup, breakpoint: 915 });
  const banded = inferred.rules.find((rule) => rule.kind === "responsive-hidden");
  check(
    "inference emits the corrected band for the corpus's own shape (hidden at 1024)",
    banded?.media === "(max-width: 1231.98px)" && banded?.band?.verifyWidth === 1024,
    String(banded?.media),
  );
  /*
   * TASK 28.6 V6(a) — WHAT THIS LAST CHECK IS AND IS NOT.
   *
   * `bandSampleMismatches` is an invariant on the emitted band, not evidence
   * about R1. A verifier re-introduced the off-by-one and measured the counter
   * still 0, because the scan and the builder both read `bandContains()`: it
   * cannot see an edge convention that is wrong on both sides. The R1 evidence
   * is the edge checks ABOVE and the renders in Part 6b; this one only says the
   * builder does not contradict itself.
   */
  check(
    "…and the band/observation agreement is MEASURED, at 0 mismatches",
    inferred.counters.bandSampleMismatches === 0,
    String(inferred.counters.bandSampleMismatches),
  );
}

// ---------------------------------------------------------------------------
// Part 6c — Task 28.6 D1: band edges snap onto the breakpoints the SOURCE wrote
// ---------------------------------------------------------------------------

/**
 * THE DEFECT THIS PART PINS.
 *
 * `hiddenBands()` places an edge at the floored MIDPOINT of the two probe
 * samples that disagree. 1232 is `floor((1024 + 1440) / 2)`: arithmetic on the
 * probe's sampling grid, not a number any stylesheet contains. A source that
 * authors its layout change at `(max-width: 1024px)` therefore SHOWS the node
 * across 1025…1231 while the clone hides it — a whole band of every such page
 * wrong, and nothing in the observation contradicted at all, because the
 * observation never looked between 1024 and 1440.
 *
 * The five rules below are checked one at a time, on the production functions.
 */

/** An `AuthoredBreakpoints` record carrying `entries` and honest zeros elsewhere. */
function histogramOf(
  entries: readonly { px: number; kind: "min" | "max"; count: number }[],
  overrides: Partial<AuthoredBreakpoints> = {},
): AuthoredBreakpoints {
  const folded = entries.reduce((sum, entry) => sum + entry.count, 0);
  return {
    entries: entries.map((entry) => ({ ...entry })),
    rootFontSizePx: 16,
    declarationsExamined: folded,
    distinctConditions: entries.length,
    mediaScopedDeclarations: folded,
    foldedDeclarations: folded,
    unconditionalDeclarations: 0,
    containerScopedDeclarations: 0,
    supportsScopedDeclarations: 0,
    layerScopedDeclarations: 0,
    containerGatedSkippedDeclarations: 0,
    fetchedOriginDeclarations: 0,
    truncatedNodeCount: 0,
    widthDeclarations: folded,
    widthIrrelevantDeclarations: 0,
    unsupportedDeclarations: 0,
    unparsedDeclarations: 0,
    disjunctionDeclarations: 0,
    deviceWidthDeclarations: 0,
    nonScreenSkippedDeclarations: 0,
    emptyIntervalSkippedDeclarations: 0,
    unparsedConditions: [],
    unsupportedConditions: [],
    ...overrides,
  };
}

/** The corpus's own band shape: hidden at the LOWEST desktop sample, visible above. */
function pricingShapedBand(): HiddenBand {
  return hiddenBands(DESKTOP_3, [DESKTOP_3[0]!])[0]!;
}

/** One authored `@media` declaration on a node, as the observer records it. */
function authoredMedia(media: string, count: number): FixtureNode["authoredLayout"] {
  return Array.from({ length: count }, (_, i) => ({
    property: "display",
    value: "flex",
    selector: `.fixture-${i}`,
    media,
  }));
}

/** The corpus's node shape: visible at 1440/1920, hidden at 1024. */
function bandedFixtureNodes(
  authoredLayout?: FixtureNode["authoredLayout"],
): FixtureNode[] {
  const block: Props = { display: "block", "box-sizing": "border-box" };
  return [
    { nodeId: "n001", tagName: "html", w: [...PROBE_WIDTHS], props: block },
    { nodeId: "n002", tagName: "body", parentNodeId: "n001", w: [...PROBE_WIDTHS], props: block },
    { nodeId: "d1shell", tagName: "div", parentNodeId: "n002", w: [...SHELL_W], props: block },
    {
      nodeId: "d1row",
      tagName: "div",
      parentNodeId: "d1shell",
      w: [200, 200, 0, 200, 200],
      v: [1, 1, 0, 1, 1],
      props: block,
      ...(authoredLayout !== undefined ? { authoredLayout } : {}),
    },
  ];
}

function bandSnapChecks(): void {
  section("Part 6c — D1: a band edge is the source's breakpoint, not a midpoint");

  // --- rule (a): never snap past a sample that was actually measured --------
  check(
    "(a) an authored breakpoint OUTSIDE the two samples that made the edge is no candidate",
    authoredEdgeCandidates(
      [
        { px: 640, kind: "max", count: 900 },
        { px: 1920, kind: "min", count: 900 },
      ],
      1024,
      1440,
    ).length === 0,
    JSON.stringify(
      authoredEdgeCandidates(
        [
          { px: 640, kind: "max", count: 900 },
          { px: 1920, kind: "min", count: 900 },
        ],
        1024,
        1440,
      ),
    ),
  );
  check(
    "(a) …the interval is half-open: the sample the edge starts AT is excluded, the one it ends at is not",
    JSON.stringify(
      authoredEdgeCandidates(
        [
          { px: 1024, kind: "min", count: 5 },
          { px: 1440, kind: "min", count: 7 },
        ],
        1024,
        1440,
      ),
    ) === JSON.stringify([{ px: 1440, weight: 7 }]),
    JSON.stringify(
      authoredEdgeCandidates(
        [
          { px: 1024, kind: "min", count: 5 },
          { px: 1440, kind: "min", count: 7 },
        ],
        1024,
        1440,
      ),
    ),
  );
  check(
    "(a) …and the two spellings of ONE authored change are one candidate carrying both weights",
    JSON.stringify(
      authoredEdgeCandidates(
        [
          { px: 1024, kind: "max", count: 300 },
          { px: 1025, kind: "min", count: 100 },
        ],
        1024,
        1440,
      ),
    ) === JSON.stringify([{ px: 1025, weight: 400 }]),
    JSON.stringify(
      authoredEdgeCandidates(
        [
          { px: 1024, kind: "max", count: 300 },
          { px: 1025, kind: "min", count: 100 },
        ],
        1024,
        1440,
      ),
    ),
  );

  const snappedPricing = snapBandEdges(
    [pricingShapedBand()],
    histogramOf([{ px: 1024, kind: "max", count: 300 }]),
  );
  const pricingBand = snappedPricing.bands[0]!;
  check(
    "(a) the corpus's own edge moves 1232 → 1025, where the source authored it",
    pricingBand.maxWidth === 1025 &&
      bandMedia(pricingBand) === "(max-width: 1024.98px)" &&
      snappedPricing.accounting.snapped === 1 &&
      snappedPricing.accounting.shiftPx === 207,
    `${bandMedia(pricingBand)} / ${JSON.stringify(snappedPricing.accounting)}`,
  );
  check(
    "(a) …and the snapped band still covers the observed-HIDDEN sample and no observed-VISIBLE one",
    bandContains(pricingBand, 1024) &&
      !bandContains(pricingBand, 1440) &&
      !bandContains(pricingBand, 1920),
  );
  check(
    "(a) …carrying the observed sample the truth check must render it at, unchanged",
    pricingBand.verifyWidth === 1024 && pricingBand.hiddenSamples.join(",") === "1024",
    JSON.stringify(pricingBand.hiddenSamples),
  );
  check(
    "(a) …and a heavier breakpoint BEYOND a measured sample still never wins",
    snapBandEdges(
      [pricingShapedBand()],
      histogramOf([
        { px: 1920, kind: "min", count: 9999 },
        { px: 1024, kind: "max", count: 1 },
      ]),
    ).bands[0]!.maxWidth === 1025,
  );
  check(
    "(a) …each edge carries the gap it was allowed to move inside",
    JSON.stringify(pricingBand.edgeDecisions?.[0]?.bracket) === "[1024,1440]" &&
      pricingBand.edgeDecisions?.[0]?.midpointPx === 1232 &&
      pricingBand.edgeDecisions?.[0]?.source === "authored-breakpoint",
    JSON.stringify(pricingBand.edgeDecisions),
  );

  // --- rule (b): several authored breakpoints in one gap --------------------
  const heavyFar = snapBandEdges(
    [pricingShapedBand()],
    histogramOf([
      { px: 1100, kind: "max", count: 9 },
      { px: 1200, kind: "max", count: 1 },
    ]),
  );
  check(
    "(b) the HEAVIEST authored edge wins — nearness to the midpoint does not outrank weight",
    heavyFar.bands[0]!.maxWidth === 1101 &&
      heavyFar.accounting.snapped === 1 &&
      heavyFar.accounting.snappedAmbiguous === 1,
    `${heavyFar.bands[0]!.maxWidth} / ${JSON.stringify(heavyFar.accounting)}`,
  );
  check(
    "(b) …and the ambiguity is recorded on the edge, with how many it chose between",
    heavyFar.bands[0]!.edgeDecisions?.[0]?.ambiguous === true &&
      heavyFar.bands[0]!.edgeDecisions?.[0]?.candidateCount === 2 &&
      heavyFar.bands[0]!.edgeDecisions?.[0]?.chosenWeight === 9,
    JSON.stringify(heavyFar.bands[0]!.edgeDecisions),
  );
  check(
    "(b) …EQUAL weight is broken by nearness to the midpoint",
    snapBandEdges(
      [pricingShapedBand()],
      histogramOf([
        { px: 1100, kind: "max", count: 5 },
        { px: 1200, kind: "max", count: 5 },
      ]),
    ).bands[0]!.maxWidth === 1201,
  );
  const tied = [
    { px: 1200, kind: "max" as const, count: 5 },
    { px: 1263, kind: "min" as const, count: 5 },
  ];
  check(
    "(b) …and an exact tie by the LOWER px, so the pick is a function of the input, not of order",
    snapBandEdges([pricingShapedBand()], histogramOf(tied)).bands[0]!.maxWidth === 1201 &&
      snapBandEdges([pricingShapedBand()], histogramOf([...tied].reverse())).bands[0]!
        .maxWidth === 1201,
    `${snapBandEdges([pricingShapedBand()], histogramOf(tied)).bands[0]!.maxWidth} / ` +
      `${snapBandEdges([pricingShapedBand()], histogramOf([...tied].reverse())).bands[0]!.maxWidth}`,
  );
  check(
    "(b) …while one authored edge spelled two ways is NOT an ambiguity",
    snapBandEdges(
      [pricingShapedBand()],
      histogramOf([
        { px: 1024, kind: "max", count: 300 },
        { px: 1025, kind: "min", count: 100 },
      ]),
    ).accounting.snappedAmbiguous === 0,
  );

  // --- rule (c): nothing in the gap keeps the midpoint, and says so ---------
  const missed = snapBandEdges(
    [pricingShapedBand()],
    histogramOf([{ px: 640, kind: "max", count: 900 }]),
  );
  check(
    "(c) a histogram that names nothing in the gap KEEPS the midpoint and is counted apart",
    missed.bands[0]!.maxWidth === 1232 &&
      missed.accounting.snapped === 0 &&
      missed.accounting.keptMidpointNoAuthoredInGap === 1 &&
      missed.bands[0]!.edgeDecisions?.[0]?.source === "probe-midpoint-no-authored-in-gap",
    JSON.stringify(missed.accounting),
  );
  const emptyHistogram = snapBandEdges([pricingShapedBand()], histogramOf([]));
  check(
    "(c) …an EMPTY histogram — declarations read, none of them a width — is a third answer",
    emptyHistogram.accounting.keptMidpointEmptyHistogram === 1 &&
      emptyHistogram.accounting.keptMidpointNoAuthoredInGap === 0 &&
      emptyHistogram.bands[0]!.edgeDecisions?.[0]?.source ===
        "probe-midpoint-empty-histogram",
    JSON.stringify(emptyHistogram.accounting),
  );
  const noHistogram = snapBandEdges([pricingShapedBand()], undefined);
  check(
    "(d) …and NO histogram at all is a fourth: FOR WANT OF DATA, not for want of a breakpoint",
    noHistogram.accounting.keptMidpointNoHistogram === 1 &&
      noHistogram.accounting.keptMidpointEmptyHistogram === 0 &&
      noHistogram.accounting.keptMidpointNoAuthoredInGap === 0 &&
      noHistogram.bands[0]!.maxWidth === 1232 &&
      noHistogram.bands[0]!.edgeDecisions?.[0]?.candidateCount === 0,
    JSON.stringify(noHistogram.accounting),
  );

  // --- the accounting closes -----------------------------------------------
  const twoEdge = hiddenBands(DESKTOP_4, [DESKTOP_4[1]!]);
  const mixed = snapBandEdges(twoEdge, histogramOf([{ px: 1150, kind: "min", count: 4 }]));
  check(
    "a band with BOTH edges present offers both, and only the one whose gap holds it snaps",
    mixed.accounting.edgesConsidered === 2 &&
      mixed.accounting.edgesOpen === 0 &&
      mixed.accounting.snapped === 1 &&
      mixed.bands[0]!.minWidth === 1150 &&
      mixed.bands[0]!.maxWidth === 1320,
    JSON.stringify(mixed.accounting) + JSON.stringify(mixed.bands[0]),
  );
  check(
    "the edge accounting closes: considered = snapped + the three midpoint channels",
    [mixed.accounting, missed.accounting, noHistogram.accounting, heavyFar.accounting].every(
      (a) =>
        a.edgesConsidered ===
        a.snapped +
          a.keptMidpointNoAuthoredInGap +
          a.keptMidpointEmptyHistogram +
          a.keptMidpointNoHistogram,
    ),
  );

  // --- rule (d): the field is optional, so where the histogram came from ----
  const specField = histogramOf([{ px: 1024, kind: "max", count: 300 }]);
  const withField = buildPage(bandedFixtureNodes(), specField);
  check(
    "(d) resolveAuthoredBreakpoints prefers the SiteSpec's own field",
    resolveAuthoredBreakpoints(withField.page.viewports.desktop).provenance === "spec-field",
    resolveAuthoredBreakpoints(withField.page.viewports.desktop).provenance,
  );
  const derivedPage = buildPage(
    bandedFixtureNodes(authoredMedia("(max-width: 1024px)", 3)),
  );
  const derived = resolveAuthoredBreakpoints(derivedPage.page.viewports.desktop);
  check(
    "(d) …and folds the nodes' own authored declarations on a pre-v5 spec that lacks it",
    derived.provenance === "derived-from-nodes" &&
      JSON.stringify(derived.histogram?.entries) ===
        JSON.stringify([{ px: 1024, kind: "max", count: 3 }]),
    `${derived.provenance} ${JSON.stringify(derived.histogram?.entries)}`,
  );
  const bare = resolveAuthoredBreakpoints(
    buildPage(bandedFixtureNodes()).page.viewports.desktop,
  );
  check(
    "(d) …and answers `unavailable` — not an empty histogram — when the observation carried neither",
    bare.provenance === "unavailable" && bare.histogram === undefined,
    bare.provenance,
  );

  // --- and all of it through the real inference path ------------------------
  const bandOf = (
    result: ReturnType<typeof inferLayoutRules>,
  ): RecoveredLayoutRule | undefined =>
    result.rules.find((rule) => rule.kind === "responsive-hidden");

  const inferredSnapped = inferLayoutRules({
    pages: [withField.page],
    styleLookup: withField.styleLookup,
    breakpoint: 915,
  });
  check(
    "inference ships the SOURCE's edge for the corpus's shape: (max-width: 1024.98px)",
    bandOf(inferredSnapped)?.media === "(max-width: 1024.98px)" &&
      bandOf(inferredSnapped)?.band?.verifyWidth === 1024,
    String(bandOf(inferredSnapped)?.media),
  );
  check(
    "…counted as snapped, from a spec-field histogram, with the shift measured",
    inferredSnapped.counters.bandEdgesSnapped === 1 &&
      inferredSnapped.counters.bandEdgesConsidered === 1 &&
      inferredSnapped.counters.bandEdgesOpen === 1 &&
      inferredSnapped.counters.bandEdgeSnapShiftPx === 207 &&
      inferredSnapped.counters.authoredBreakpointPages["spec-field"] === 1,
    JSON.stringify(inferredSnapped.counters.authoredBreakpointPages),
  );
  check(
    "…and the rule's own evidence names the edge, its source and the gap it moved inside",
    bandOf(inferredSnapped)?.evidence.some(
      (line) =>
        line.includes("upper edge 1025px") &&
        line.includes("authored-breakpoint") &&
        line.includes("midpoint 1232px") &&
        line.includes("1024…1440px"),
    ) === true,
    JSON.stringify(bandOf(inferredSnapped)?.evidence),
  );
  const inferredDerived = inferLayoutRules({
    pages: [derivedPage.page],
    styleLookup: derivedPage.styleLookup,
    breakpoint: 915,
  });
  check(
    "a pre-v5 spec reaches the same edge by folding its nodes, and says which route it took",
    bandOf(inferredDerived)?.media === "(max-width: 1024.98px)" &&
      inferredDerived.counters.authoredBreakpointPages["derived-from-nodes"] === 1 &&
      inferredDerived.counters.authoredBreakpointDeclarations === 3,
    JSON.stringify(inferredDerived.counters.authoredBreakpointPages),
  );
  const bareInferred = buildPage(bandedFixtureNodes());
  const inferredBare = inferLayoutRules({
    pages: [bareInferred.page],
    styleLookup: bareInferred.styleLookup,
    breakpoint: 915,
  });
  check(
    "with no authored data the midpoint stands UNCHANGED and is reported as want-of-data",
    bandOf(inferredBare)?.media === "(max-width: 1231.98px)" &&
      inferredBare.counters.bandEdgesSnapped === 0 &&
      inferredBare.counters.bandEdgesKeptMidpointNoHistogram === 1 &&
      inferredBare.counters.authoredBreakpointPages["unavailable"] === 1,
    JSON.stringify(inferredBare.counters.authoredBreakpointPages),
  );
  check(
    "(e) …and the snapped band is NOT exempted from the observation-agreement scan",
    inferredSnapped.counters.bandSampleMismatches === 0 &&
      inferredDerived.counters.bandSampleMismatches === 0 &&
      inferredBare.counters.bandSampleMismatches === 0,
    `${inferredSnapped.counters.bandSampleMismatches}/${inferredDerived.counters.bandSampleMismatches}/${inferredBare.counters.bandSampleMismatches}`,
  );
  check(
    "an observation whose truncation was recorded still yields a histogram, not silence",
    resolveAuthoredBreakpoints(
      buildPage(
        bandedFixtureNodes().map((node) =>
          node.nodeId === "d1row" ? { ...node, authoredLayoutTruncated: true } : node,
        ),
      ).page.viewports.desktop,
    ).histogram?.truncatedNodeCount === 1,
  );
}

/** A viewport-switching harness that mirrors the generated `globals.css`. */
const R1_CSS = `
html, body { margin: 0; padding: 0; }
.wr-variant { display: contents; }
@media (max-width: 914.98px) { [data-wr-viewport="desktop"] { display: none; } }
.r1-shell { width: 100%; }
.r1-box { width: 200px; height: 40px; }
`;
const R1_PAGE = runtimePage("p000001", el("r1root", "r1-shell", [el("hiddenLow", "r1-box")]));

/*
 * TASK 28.6 V7 — WHY THESE ARE DERIVED AND NOT TYPED OUT.
 *
 * This part used to carry `CORRECTED_BAND` and `SHIPPED_INVERTED_BAND` as
 * hand-written literals, with the four boundary widths written out too. A
 * verifier restored the R1 off-by-one inside `hiddenBands()` and all three
 * checks below stayed GREEN, because the literals pinned Chromium's `@media`
 * semantics and nothing else — the production band builder was never called.
 *
 * Both bands now come OUT of `hiddenBands()` and both media strings out of
 * `bandMedia()`. The inverted one is the production band with exactly the
 * historical mutation re-applied: the defect was `start = entry.width` when
 * there was no lower VISIBLE neighbour, so re-adding the observed sample as a
 * `min-width` edge is that defect and nothing else. The boundary widths are read
 * off the produced band too, so a builder that moves an edge moves the render.
 */
const PRODUCED_BAND = hiddenBands(DESKTOP_3, [DESKTOP_3[0]!])[0]!;
const PRODUCED_SAMPLE = PRODUCED_BAND.hiddenSamples[0]!;
const PRODUCED_UPPER = PRODUCED_BAND.maxWidth!;
const INVERTED_BAND: HiddenBand = { ...PRODUCED_BAND, minWidth: PRODUCED_SAMPLE };

const CORRECTED_BAND: RecoveredLayoutRule = {
  pageId: "p000001",
  nodeId: "hiddenLow",
  kind: "responsive-hidden",
  declarations: { display: "none" },
  media: bandMedia(PRODUCED_BAND),
  band: PRODUCED_BAND,
  evidence: ["fixture"],
  truth: { x: 0, w: 200 },
};
const SHIPPED_INVERTED_BAND: RecoveredLayoutRule = {
  ...CORRECTED_BAND,
  media: bandMedia(INVERTED_BAND),
  band: INVERTED_BAND,
};

/**
 * The two edges the fix moved, each straddled. Read off the produced band, so
 * they follow the builder rather than describing a build that once happened.
 */
const R1_BOUNDARY_WIDTHS = [
  PRODUCED_SAMPLE - 1,
  PRODUCED_SAMPLE,
  PRODUCED_UPPER - 1,
  PRODUCED_UPPER,
];

/** Render one rule at a list of widths and report where the node is hidden. */
async function renderBandBoundaries(
  rule: RecoveredLayoutRule,
  widths: readonly number[] = R1_BOUNDARY_WIDTHS,
): Promise<boolean[]> {
  const { chromium } = await import("playwright");
  const browser = await chromium.launch();
  const out: boolean[] = [];
  try {
    const html = truthCheckHtml(R1_PAGE, `${R1_CSS}\n${generateLayoutCss([rule])}`);
    for (const width of widths) {
      const context = await browser.newContext({
        viewport: { width, height: 800 },
        deviceScaleFactor: 1,
      });
      await context.route("http://**", (route) => route.abort());
      await context.route("https://**", (route) => route.abort());
      const browserPage = await context.newPage();
      try {
        await browserPage.setContent(html, { waitUntil: "load" });
        out.push(
          await browserPage.evaluate(() => {
            const element = document.querySelector('[data-wr-node="hiddenLow"]');
            return element ? element.getClientRects().length === 0 : false;
          }),
        );
      } finally {
        await browserPage.close();
        await context.close();
      }
    }
  } finally {
    await browser.close();
  }
  return out;
}

/**
 * The boundary evidence, as a permanent check rather than a one-off measurement.
 *
 * The probe observed the node HIDDEN at 1024 and VISIBLE at 1440. The clone must
 * therefore hide it at 1023, 1024 and 1231, and show it at 1232 — and the band
 * the off-by-one shipped must be shown to differ, or the four widths would not
 * be discriminating anything.
 */
async function bandBoundaryRenderChecks(): Promise<void> {
  section("Part 6b — R1: the production band, rendered at its own four edges");

  check(
    "the rendered band is the PRODUCTION one: hiddenBands() + bandMedia(), not a literal",
    CORRECTED_BAND.media === bandMedia(hiddenBands(DESKTOP_3, [DESKTOP_3[0]!])[0]!) &&
      CORRECTED_BAND.band?.minWidth === undefined,
    CORRECTED_BAND.media ?? "(none)",
  );
  check(
    "…and the inverted one is that band with the off-by-one re-applied, nothing else",
    SHIPPED_INVERTED_BAND.band?.minWidth === PRODUCED_SAMPLE &&
      SHIPPED_INVERTED_BAND.band?.maxWidth === PRODUCED_BAND.maxWidth &&
      SHIPPED_INVERTED_BAND.media !== CORRECTED_BAND.media,
    `${CORRECTED_BAND.media} vs ${SHIPPED_INVERTED_BAND.media}`,
  );

  const corrected = await renderBandBoundaries(CORRECTED_BAND);
  check(
    `corrected band: node hidden at ${R1_BOUNDARY_WIDTHS.slice(0, 3).join(" / ")}, ` +
      `visible at ${PRODUCED_UPPER}`,
    corrected.join(",") === "true,true,true,false",
    `hidden at ${R1_BOUNDARY_WIDTHS.filter((_, i) => corrected[i]).join("/") || "(none)"}`,
  );

  const shipped = await renderBandBoundaries(SHIPPED_INVERTED_BAND);
  check(
    `the shipped band left the node VISIBLE at ${PRODUCED_SAMPLE - 1}, ` +
      `where the probe's nearest sample was hidden`,
    shipped.join(",") === "false,true,true,false",
    `hidden at ${R1_BOUNDARY_WIDTHS.filter((_, i) => shipped[i]).join("/") || "(none)"}`,
  );
  check(
    "…so the two bands really do differ, and only at the boundary the fix moved",
    corrected[0] === true && shipped[0] === false && corrected[3] === shipped[3],
  );
}

// ---------------------------------------------------------------------------
// Part 6d — Task 28.6 D1(e): a SNAPPED band is rendered like any other
// ---------------------------------------------------------------------------

/**
 * The snap moves a real `@media` edge in a real browser, and buys no exemption.
 *
 * The corpus's band and the same band snapped onto `(max-width: 1024px)` are
 * both produced by `hiddenBands()` + `snapBandEdges()` + `bandMedia()` — no
 * literal anywhere — and rendered at the four widths that straddle BOTH edges.
 * The midpoint band hides the node at 1231; the snapped one shows it there,
 * which is the source's own behaviour and the whole defect. Then the snapped
 * rule goes through `verifyLayoutRules()`, which renders it inside its own
 * active range exactly as it renders an unsnapped one.
 */
const SNAP_WIDTHS = [1024, 1025, 1231, 1232] as const;

const SNAPPED_PRICING_BAND = snapBandEdges(
  [hiddenBands(DESKTOP_3, [DESKTOP_3[0]!])[0]!],
  histogramOf([{ px: 1024, kind: "max", count: 300 }]),
).bands[0]!;

const SNAPPED_BAND_RULE: RecoveredLayoutRule = {
  pageId: "p000001",
  nodeId: "hiddenLow",
  kind: "responsive-hidden",
  declarations: { display: "none" },
  media: bandMedia(SNAPPED_PRICING_BAND),
  band: SNAPPED_PRICING_BAND,
  evidence: ["fixture"],
  truth: { x: 0, w: 200 },
};

async function snappedBandRenderChecks(): Promise<void> {
  section("Part 6d — D1: the snapped edge in a real browser, and still verified");

  check(
    "the rendered band is the PRODUCTION one: hiddenBands() + snapBandEdges() + bandMedia()",
    SNAPPED_BAND_RULE.media ===
      bandMedia(
        snapBandEdges(
          [hiddenBands(DESKTOP_3, [DESKTOP_3[0]!])[0]!],
          histogramOf([{ px: 1024, kind: "max", count: 300 }]),
        ).bands[0]!,
      ) && SNAPPED_BAND_RULE.media === "(max-width: 1024.98px)",
    String(SNAPPED_BAND_RULE.media),
  );

  const midpoint = await renderBandBoundaries(CORRECTED_BAND, SNAP_WIDTHS);
  check(
    "the MIDPOINT band hides the node at 1025 and 1231, where the source shows it",
    midpoint.join(",") === "true,true,true,false",
    `hidden at ${SNAP_WIDTHS.filter((_, i) => midpoint[i]).join("/") || "(none)"}`,
  );
  const snapped = await renderBandBoundaries(SNAPPED_BAND_RULE, SNAP_WIDTHS);
  check(
    "the SNAPPED band hides it at 1024 only — the authored boundary, in Chromium",
    snapped.join(",") === "true,false,false,false",
    `hidden at ${SNAP_WIDTHS.filter((_, i) => snapped[i]).join("/") || "(none)"}`,
  );
  check(
    "…so the two differ exactly across [1025, 1231], the band the clone had wrong",
    midpoint[0] === snapped[0] &&
      midpoint[1] === true &&
      snapped[1] === false &&
      midpoint[2] === true &&
      snapped[2] === false &&
      midpoint[3] === snapped[3],
    `${midpoint.join(",")} vs ${snapped.join(",")}`,
  );

  const verified = await verifyLayoutRules({
    rules: [SNAPPED_BAND_RULE],
    pages: [R1_PAGE],
    css: R1_CSS,
  });
  check(
    "(e) the snapped rule is RENDERED inside its own range, not exempted",
    verified.counters.bandCheckable === 1 &&
      verified.counters.bandWidthsRendered >= 1 &&
      verified.counters.acceptedUnchecked === 0 &&
      verified.rules.length === 1,
    JSON.stringify(verified.counters),
  );
  check(
    "(e) …and a band snapped OFF its own verify width is rejected by that same render",
    (
      await verifyLayoutRules({
        rules: [
          {
            ...SNAPPED_BAND_RULE,
            media: bandMedia({ ...SNAPPED_PRICING_BAND, maxWidth: 1024 }),
            band: { ...SNAPPED_PRICING_BAND, maxWidth: 1024 },
          },
        ],
        pages: [R1_PAGE],
        css: R1_CSS,
      })
    ).counters.rejectedByBandCheck === 1,
  );
}

// ---------------------------------------------------------------------------
// Part 7 — Task 28.6 R3: a banded rule is verified INSIDE its own range
// ---------------------------------------------------------------------------

/** Hides the node at the truth viewport, where the probe saw it VISIBLE. */
const BAND_REACHING_TRUTH: RecoveredLayoutRule = {
  pageId: "p000002",
  nodeId: "p2band",
  kind: "responsive-hidden",
  declarations: { display: "none" },
  media: "(min-width: 1000px)",
  band: { minWidth: 1000, hiddenSamples: [1024], verifyWidth: 1024 },
  evidence: ["fixture"],
  truth: { x: 180, w: 1080 },
};
/** Claims a band at 1024 but writes a condition that cannot match there. */
const BAND_THAT_DOES_NOT_APPLY: RecoveredLayoutRule = {
  pageId: "p000002",
  nodeId: "p2band",
  kind: "responsive-hidden",
  declarations: { display: "none" },
  media: "(min-width: 1900px)",
  band: { minWidth: 1000, maxWidth: 1232, hiddenSamples: [1024], verifyWidth: 1024 },
  evidence: ["fixture"],
  truth: { x: 180, w: 1080 },
};
/** Two rules on one page sharing one verify-width: they must share one render. */
const SHARED_BAND_A: RecoveredLayoutRule = {
  pageId: "p000001",
  nodeId: "p1date",
  kind: "responsive-hidden",
  declarations: { display: "none" },
  media: "(min-width: 1680px)",
  band: { minWidth: 1680, hiddenSamples: [1920], verifyWidth: 1920 },
  evidence: ["fixture"],
  truth: { x: 0, w: 296 },
};
const SHARED_BAND_B: RecoveredLayoutRule = {
  ...SHARED_BAND_A,
  nodeId: "p1content",
  truth: { x: 656, w: 624 },
};

async function bandVerificationChecks(): Promise<void> {
  section("Part 7 — R3: banded rules are rendered inside their own active range");

  const leaked = await verifyLayoutRules({
    rules: [BAND_REACHING_TRUTH],
    pages: [P1, P2, P3, P4],
    css: HARNESS_CSS,
  });
  check(
    "a band that reaches the TRUTH viewport is rejected — the old exemption shipped it",
    leaked.rules.length === 0 &&
      leaked.counters.rejectedByBandCheck === 1 &&
      leaked.bandRejections[0]?.reason === "hidden-at-truth-width",
    JSON.stringify(leaked.bandRejections),
  );
  check(
    "…and the rejection names the width it was measured at",
    leaked.bandRejections[0]?.measuredAtWidth === 1440,
    String(leaked.bandRejections[0]?.measuredAtWidth),
  );

  const inert = await verifyLayoutRules({
    rules: [BAND_THAT_DOES_NOT_APPLY],
    pages: [P1, P2, P3, P4],
    css: HARNESS_CSS,
  });
  check(
    "a band that does NOT hide the node inside its own range is rejected too",
    inert.rules.length === 0 &&
      inert.counters.rejectedByBandCheck === 1 &&
      inert.bandRejections[0]?.reason === "not-hidden-in-band" &&
      inert.bandRejections[0]?.measuredAtWidth === 1024,
    JSON.stringify(inert.bandRejections),
  );
  check(
    "…which took exactly one extra page load to establish",
    inert.counters.bandWidthsRendered === 1 && inert.counters.pagesRendered === 1,
    `${inert.counters.bandWidthsRendered} / ${inert.counters.pagesRendered}`,
  );

  const shared = await verifyLayoutRules({
    rules: [SHARED_BAND_A, SHARED_BAND_B],
    pages: [P1, P2, P3, P4],
    css: HARNESS_CSS,
  });
  check(
    "two banded rules sharing one verify-width are BATCHED into a single render",
    shared.rules.length === 2 &&
      shared.counters.bandWidthsRendered === 1 &&
      shared.counters.bandCheckable === 2,
    `${shared.counters.bandWidthsRendered} render(s) for ${shared.counters.bandCheckable} rule(s)`,
  );
  check(
    "…and they ship having been measured, not exempted",
    shared.counters.acceptedUnchecked === 0 &&
      shared.counters.rejectedByBandCheck === 0 &&
      shared.counters.rejectedUnverifiable === 0,
    JSON.stringify(shared.counters),
  );
}

// ---------------------------------------------------------------------------
// Part 8 — Task 28.6 V1: every banded rule is discriminated by its OWN cascade
// ---------------------------------------------------------------------------

/**
 * The fixture that falsified R3's first revision.
 *
 * The in-band render asked "is this node OUT OF LAYOUT at the band width", with
 * the whole shipped stylesheet applied. An ancestor's `display: none` answers
 * that for every descendant, so a descendant carrying a band that CANNOT MATCH
 * at its own verify width still measured as hidden and shipped. Measured on the
 * 28.5B Linear corpus: 505 of 738 shipped banded rules (68.4%) were hidden by an
 * ancestor at their band width.
 *
 * `(min-width: 99999px)` is the clearest possible instance: no viewport this
 * check ever opens can match it, so the rule provably does nothing, and the only
 * reason its node is out of layout at 1024 is the CORRECT band on its ancestor.
 */
const ANCESTOR_BAND: RecoveredLayoutRule = {
  pageId: "p000005",
  nodeId: "p5anc",
  kind: "responsive-hidden",
  declarations: { display: "none" },
  media: "(max-width: 1231.98px)",
  band: { maxWidth: 1232, hiddenSamples: [1024], verifyWidth: 1024 },
  evidence: ["fixture"],
  truth: { x: 0, w: 640 },
};
const IMPOSSIBLE_DESCENDANT_BAND: RecoveredLayoutRule = {
  pageId: "p000005",
  nodeId: "p5kid",
  kind: "responsive-hidden",
  declarations: { display: "none" },
  media: "(min-width: 99999px)",
  band: { maxWidth: 1232, hiddenSamples: [1024], verifyWidth: 1024 },
  evidence: ["fixture"],
  truth: { x: 0, w: 320 },
};

async function bandDiscriminationChecks(): Promise<void> {
  section("Part 8 — V1: a band is judged by its own cascade, not by an ancestor's");

  const together = await verifyLayoutRules({
    rules: [ANCESTOR_BAND, IMPOSSIBLE_DESCENDANT_BAND],
    pages: HARNESS_PAGES,
    css: HARNESS_CSS,
  });
  check(
    "a band that cannot match at its own verify width is REJECTED under a hidden ancestor",
    together.counters.rejectedByBandCheck === 1 &&
      together.bandRejections[0]?.nodeId === "p5kid" &&
      together.bandRejections[0]?.reason === "not-hidden-in-band" &&
      together.bandRejections[0]?.measuredAtWidth === 1024,
    JSON.stringify(together.bandRejections),
  );
  check(
    "…while the ANCESTOR's correct band on the same page ships",
    together.rules.length === 1 && together.rules[0]?.nodeId === "p5anc",
    JSON.stringify(together.rules.map((rule) => rule.nodeId)),
  );
  check(
    "…and the descendant really was out of layout there — the old test's whole basis",
    together.counters.bandHiddenByAncestorAtBandWidth === 1,
    String(together.counters.bandHiddenByAncestorAtBandWidth),
  );
  /*
   * TASK 28.6 D1(b) — WHAT THIS CHECK IS, RESTATED.
   *
   * It used to read "every banded rule that reached the render was discriminated
   * by its own display" and assert `bandIndependentlyDiscriminated ===
   * bandCheckable === 2`. A verifier reverted the V1 semantics — the in-band
   * verdict taken from presence again, so an ancestor answers for a descendant —
   * and this check stayed GREEN, because the counter increments for every banded
   * rule whose node is in the document either way. It is a PRESENCE count.
   *
   * Discrimination is presence MINUS the rules the exact computed tier was
   * already hiding at the band width, where the band adds nothing. So the check
   * names its premise now, and the fixture that makes the premise falsifiable is
   * `exactTierBandChecks()` below: a node the exact tier hides at 1024 raises
   * `bandExactTierHidesAtBandWidth` to 1, and this run's 0 is a measurement
   * rather than a constant.
   */
  check(
    "both banded rules were PRESENT in the render, and none was already hidden by the exact tier",
    together.counters.bandIndependentlyDiscriminated === together.counters.bandCheckable &&
      together.counters.bandCheckable === 2 &&
      together.counters.bandExactTierHidesAtBandWidth === 0,
    `${together.counters.bandIndependentlyDiscriminated} present / ` +
      `${together.counters.bandCheckable} checkable / ` +
      `${together.counters.bandExactTierHidesAtBandWidth} already hidden`,
  );

  // The control: the same impossible band with no ancestor band to hide it. It
  // must be rejected for the SAME reason, so the rejection is a property of the
  // rule and not of the company it keeps.
  const alone = await verifyLayoutRules({
    rules: [IMPOSSIBLE_DESCENDANT_BAND],
    pages: HARNESS_PAGES,
    css: HARNESS_CSS,
  });
  check(
    "the same rule alone is rejected identically — the verdict is the rule's, not the page's",
    alone.counters.rejectedByBandCheck === 1 &&
      alone.bandRejections[0]?.reason === "not-hidden-in-band" &&
      alone.counters.bandHiddenByAncestorAtBandWidth === 0,
    JSON.stringify(alone.counters),
  );
  check(
    "…and the exact-tier population is reported apart from the ancestor one",
    together.counters.bandExactTierHidesAtBandWidth === 0 &&
      alone.counters.bandExactTierHidesAtBandWidth === 0,
    `${together.counters.bandExactTierHidesAtBandWidth} / ${alone.counters.bandExactTierHidesAtBandWidth}`,
  );
}

// ---------------------------------------------------------------------------
// Part 8b — D1(b): the exact tier already hides it at the band width
// ---------------------------------------------------------------------------

/**
 * The POSITIVE fixture `bandExactTierHidesAtBandWidth` never had.
 *
 * The counter separates "this band hid the node" from "the node was already
 * hidden here by its own exact computed class, and the band changed nothing".
 * Every fixture in Part 8 leaves it 0, so hard-wiring it never to increment left
 * the suite green and the only assertion on it (`=== 0`) could not fail. Here
 * `.p5-exact` carries its own `@media (max-width: 1231.98px) { display: none }`,
 * so at the band width 1024 the node's OWN computed display is already `none`
 * with the recovered tier empty — while at the truth width 1440 it is in layout,
 * which keeps the V4 baseline test out of it.
 */
const BAND_ON_EXACT_TIER_HIDDEN_NODE: RecoveredLayoutRule = {
  pageId: "p000005",
  nodeId: "p5exact",
  kind: "responsive-hidden",
  declarations: { display: "none" },
  media: "(max-width: 1231.98px)",
  band: { maxWidth: 1232, hiddenSamples: [1024], verifyWidth: 1024 },
  evidence: ["fixture"],
  truth: { x: 0, w: 200 },
};

async function exactTierBandChecks(): Promise<void> {
  section("Part 8b — D1(b): a band the exact tier had already made redundant");

  const result = await verifyLayoutRules({
    rules: [BAND_ON_EXACT_TIER_HIDDEN_NODE],
    pages: HARNESS_PAGES,
    css: HARNESS_CSS,
  });
  check(
    "a node the exact computed class already hides AT THE BAND WIDTH is counted, at 1",
    result.counters.bandExactTierHidesAtBandWidth === 1,
    String(result.counters.bandExactTierHidesAtBandWidth),
  );
  check(
    "…and it is NOT the ancestor population: no ancestor is hiding this one",
    result.counters.bandHiddenByAncestorAtBandWidth === 0 &&
      result.counters.bandTruthBaselineNotInLayout === 0,
    JSON.stringify(result.counters),
  );
  check(
    "…so `present` and `discriminated` differ here: 1 present, 1 already hidden, 0 discriminated",
    result.counters.bandIndependentlyDiscriminated === 1 &&
      result.counters.bandCheckable === 1 &&
      result.counters.bandIndependentlyDiscriminated -
        result.counters.bandExactTierHidesAtBandWidth ===
        0,
    `${result.counters.bandIndependentlyDiscriminated} - ${result.counters.bandExactTierHidesAtBandWidth}`,
  );
  check(
    "…and the rule still SHIPS: redundant is not wrong, and the render said so",
    result.rules.length === 1 && result.counters.rejectedByBandCheck === 0,
    JSON.stringify(result.rules.map((rule) => rule.nodeId)),
  );
}

// ---------------------------------------------------------------------------
// Part 9 — Task 28.6 V4: a banded node already out of layout at 1440
// ---------------------------------------------------------------------------

/**
 * A band on a node the exact computed tier already hides at the truth viewport.
 *
 * The truth-width leak test only fired on `before === true && after === false`,
 * so this case passed silently — even though the band was built from a probe
 * sample that measured the node VISIBLE at the truth width. The render and the
 * observation contradict each other, which is exactly what the check exists to
 * catch, so it is now counted and rejected.
 */
const BAND_ON_TRUTH_HIDDEN_NODE: RecoveredLayoutRule = {
  pageId: "p000005",
  nodeId: "p5gone",
  kind: "responsive-hidden",
  declarations: { display: "none" },
  media: "(max-width: 1231.98px)",
  band: { maxWidth: 1232, hiddenSamples: [1024], verifyWidth: 1024 },
  evidence: ["fixture"],
  truth: { x: 0, w: 200 },
};

async function truthBaselineChecks(): Promise<void> {
  section("Part 9 — V4: a banded node already out of layout at the truth width");

  const result = await verifyLayoutRules({
    rules: [BAND_ON_TRUTH_HIDDEN_NODE],
    pages: HARNESS_PAGES,
    css: HARNESS_CSS,
  });
  check(
    "the contradiction is COUNTED rather than passing silently",
    result.counters.bandTruthBaselineNotInLayout === 1,
    String(result.counters.bandTruthBaselineNotInLayout),
  );
  check(
    "…and the rule is rejected, with a reason that says which contradiction it was",
    result.rules.length === 0 &&
      result.counters.rejectedByBandCheck === 1 &&
      result.bandRejections[0]?.reason === "truth-baseline-not-in-layout" &&
      result.bandRejections[0]?.measuredAtWidth === 1440,
    JSON.stringify(result.bandRejections),
  );
  check(
    "a band on a node that IS in layout at 1440 is unaffected by the new test",
    (await verifyLayoutRules({
      rules: [ANCESTOR_BAND],
      pages: HARNESS_PAGES,
      css: HARNESS_CSS,
    })).counters.bandTruthBaselineNotInLayout === 0,
  );
}

// ---------------------------------------------------------------------------
// Part 10 — Task 28.6 V2/V3: an unreadable length, and an inline parent
// ---------------------------------------------------------------------------

/** A padding the computed style records as something other than a px length. */
const UNREADABLE_PADDING = "calc(1em + 2px)";

function widthValueAndInlineParentChecks(): void {
  section("Part 10 — V2/V3: refuse an unreadable length, refuse an inline parent");

  const block: Props = { display: "block" };
  const shell = (nodes: FixtureNode[]): FixtureNode[] => [
    { nodeId: "n001", tagName: "html", w: [...PROBE_WIDTHS], props: block },
    { nodeId: "n002", tagName: "body", parentNodeId: "n001", w: [...PROBE_WIDTHS], props: block },
    { nodeId: "shell", tagName: "div", parentNodeId: "n002", w: [...SHELL_W], props: block },
    ...nodes,
  ];

  // --- V2, the `fill-percentage` value ------------------------------------
  const tableProps = (padding: string): Props => ({
    display: "table",
    "box-sizing": "content-box",
    "padding-left": padding,
    "padding-right": "0px",
  });
  const unreadable = buildPage(
    shell([
      {
        nodeId: "t1",
        tagName: "table",
        parentNodeId: "shell",
        w: [...SHELL_W],
        props: tableProps(UNREADABLE_PADDING),
      },
    ]),
  );
  const refused = inferLayoutRules({
    pages: [unreadable.page],
    styleLookup: unreadable.styleLookup,
    breakpoint: 915,
  });
  check(
    "an unreadable OWN padding refuses the width value instead of reading it as 0",
    refused.counters.widthValueRefusals === 1 &&
      refused.counters.widthValueRefusalsByReason["own-padding-unreadable"] === 1,
    JSON.stringify(refused.counters.widthValueRefusalsByReason),
  );
  check(
    "…and nothing ships for that node — no confident `width: 100%` that overflows",
    refused.rules.filter((rule) => rule.nodeId === "t1").length === 0,
    JSON.stringify(refused.rules.map((rule) => `${rule.nodeId}:${rule.kind}`)),
  );

  const readable = buildPage(
    shell([
      {
        nodeId: "t1",
        tagName: "table",
        parentNodeId: "shell",
        w: [...SHELL_W],
        props: tableProps("8px"),
      },
    ]),
  );
  const emitted = inferLayoutRules({
    pages: [readable.page],
    styleLookup: readable.styleLookup,
    breakpoint: 915,
  });
  check(
    "…while a READABLE padding still emits the honest calc(), so this is a refusal not a ban",
    emitted.counters.widthValueRefusals === 0 &&
      emitted.rules.find((rule) => rule.nodeId === "t1")?.declarations["width"] ===
        "calc(100% - 8px)",
    JSON.stringify(emitted.rules.find((rule) => rule.nodeId === "t1")?.declarations),
  );

  // --- V2, the `max-width` value on a centered box -------------------------
  const centeredW = [390, 768, 600, 600, 600];
  const centeredX = SHELL_W.map((width, i) => Math.round((width - centeredW[i]!) / 2));
  const centered = buildPage(
    shell([
      {
        nodeId: "cap",
        tagName: "div",
        parentNodeId: "shell",
        w: centeredW,
        x: centeredX,
        props: {
          display: "block",
          "box-sizing": "content-box",
          "padding-left": UNREADABLE_PADDING,
          "padding-right": "0px",
        },
      },
    ]),
  );
  const centeredResult = inferLayoutRules({
    pages: [centered.page],
    styleLookup: centered.styleLookup,
    breakpoint: 915,
  });
  check(
    "the same unreadable padding refuses a `max-width` that would be too large by it",
    centeredResult.counters.widthValueRefusals === 1 &&
      centeredResult.rules.filter((rule) => rule.nodeId === "cap").length === 0,
    JSON.stringify(centeredResult.counters.widthValueRefusalsByReason),
  );

  // --- V2, the PARENT's padding: the denominator itself --------------------
  const badParent = buildPage([
    { nodeId: "n001", tagName: "html", w: [...PROBE_WIDTHS], props: block },
    { nodeId: "n002", tagName: "body", parentNodeId: "n001", w: [...PROBE_WIDTHS], props: block },
    {
      nodeId: "shell",
      tagName: "div",
      parentNodeId: "n002",
      w: [...SHELL_W],
      props: { display: "block", "padding-left": UNREADABLE_PADDING, "padding-right": "0px" },
    },
    { nodeId: "kid", tagName: "div", parentNodeId: "shell", w: [...SHELL_W], props: block },
  ]);
  const parentResult = inferLayoutRules({
    pages: [badParent.page],
    styleLookup: badParent.styleLookup,
    breakpoint: 915,
  });
  check(
    "an unreadable PARENT padding refuses the node outright — contentAt() cannot be formed",
    parentResult.counters.guardRefusalsByReason["parent-padding-unreadable"] === 1 &&
      parentResult.rules.filter((rule) => rule.nodeId === "kid").length === 0,
    JSON.stringify(parentResult.counters.guardRefusalsByReason),
  );

  // --- V3, the inline parent ----------------------------------------------
  const inlineParent = buildPage(
    shell([
      {
        nodeId: "ip",
        tagName: "span",
        parentNodeId: "shell",
        w: [...SHELL_W],
        props: { display: "inline" },
      },
      {
        nodeId: "ic",
        tagName: "table",
        parentNodeId: "ip",
        w: [...SHELL_W],
        props: { display: "table", "box-sizing": "border-box" },
      },
    ]),
  );
  const spanNode = inlineParent.specNodes.get("ip")!;
  const tableNode = inlineParent.specNodes.get("ic")!;
  check(
    "a block-level child of a NON-REPLACED INLINE parent refuses the percentage form",
    inlineSizeBehaviour(tableNode, spanNode, inlineParent.styleLookup, {
      autoInlineMargins: false,
    }).reason === "inline-parent-containing-block",
    JSON.stringify(
      inlineSizeBehaviour(tableNode, spanNode, inlineParent.styleLookup, {
        autoInlineMargins: false,
      }),
    ),
  );
  const inlineBlockParent = buildPage(
    shell([
      {
        nodeId: "ip",
        tagName: "span",
        parentNodeId: "shell",
        w: [...SHELL_W],
        props: { display: "inline-block" },
      },
      {
        nodeId: "ic",
        tagName: "table",
        parentNodeId: "ip",
        w: [...SHELL_W],
        props: { display: "table", "box-sizing": "border-box" },
      },
    ]),
  );
  check(
    "…and an INLINE-BLOCK parent is not refused: it is a block container",
    inlineSizeBehaviour(
      inlineBlockParent.specNodes.get("ic")!,
      inlineBlockParent.specNodes.get("ip")!,
      inlineBlockParent.styleLookup,
      { autoInlineMargins: false },
    ).mode === "fill-percentage",
    JSON.stringify(
      inlineSizeBehaviour(
        inlineBlockParent.specNodes.get("ic")!,
        inlineBlockParent.specNodes.get("ip")!,
        inlineBlockParent.styleLookup,
        { autoInlineMargins: false },
      ),
    ),
  );
  check(
    "the refusal is counted through the real inference path, not only in the predicate",
    inferLayoutRules({
      pages: [inlineParent.page],
      styleLookup: inlineParent.styleLookup,
      breakpoint: 915,
    }).counters.widthModeRefusalsByReason["inline-parent-containing-block"] === 1,
    JSON.stringify(
      inferLayoutRules({
        pages: [inlineParent.page],
        styleLookup: inlineParent.styleLookup,
        breakpoint: 915,
      }).counters.widthModeRefusalsByReason,
    ),
  );
}

// ---------------------------------------------------------------------------
// Part 11 — Task 28.6 A5: grid COLUMN TRACKS recovered from child geometry
// ---------------------------------------------------------------------------

const DESKTOP_ENTRIES = PROBE_WIDTHS.map((width, i) => ({ width, i })).filter(
  (entry) => entry.width >= 915,
);

/** Run `recoverGridTracks()` over a fixture, by container node id. */
function trackResult(
  nodes: readonly FixtureNode[],
  containerId: string,
): ReturnType<typeof recoverGridTracks> {
  const built = buildPage(nodes);
  const container = built.specNodes.get(containerId)!;
  const children = container.childNodeIds.map((id) => built.specNodes.get(id)!);
  return recoverGridTracks({
    node: container,
    children,
    styleLookup: built.styleLookup,
    variantIdx: DESKTOP_ENTRIES,
    truthIndex: TRUTH_INDEX,
  });
}

const GRID_BASE: Props = {
  display: "grid",
  "box-sizing": "border-box",
  "padding-left": "0px",
  "padding-right": "0px",
  "column-gap": "normal",
};

/** A 2:1 partition of a container that GROWS: the only shape that discriminates. */
function twoToOne(containerW: number[]): FixtureNode[] {
  const a = containerW.map((width) => Math.round((width * 2) / 3));
  const b = containerW.map((width) => width - Math.round((width * 2) / 3));
  return [
    { nodeId: "n001", tagName: "html", w: [...PROBE_WIDTHS], props: { display: "block" } },
    {
      nodeId: "n002",
      tagName: "body",
      parentNodeId: "n001",
      w: [...PROBE_WIDTHS],
      props: { display: "block" },
    },
    {
      nodeId: "g",
      tagName: "div",
      parentNodeId: "n002",
      w: containerW,
      x: containerW.map(() => 0),
      props: {
        ...GRID_BASE,
        "grid-template-columns": `${a[TRUTH_INDEX]}px ${b[TRUTH_INDEX]}px`,
      },
    },
    {
      nodeId: "ga",
      tagName: "div",
      parentNodeId: "g",
      w: a,
      x: containerW.map(() => 0),
      props: { display: "block" },
    },
    {
      nodeId: "gb",
      tagName: "div",
      parentNodeId: "g",
      w: b,
      x: a,
      props: { display: "block" },
    },
  ];
}

function gridTrackChecks(): void {
  section("Part 11 — A5: grid column tracks, from the children's own boxes");

  const growing = trackResult(twoToOne([390, 768, 900, 1200, 1500]), "g");
  check(
    "a 2:1 partition of a GROWING container comes back as fr weights, not pixels",
    growing.ok && growing.recovery.value === "minmax(0, 2fr) minmax(0, 1fr)",
    JSON.stringify(growing),
  );
  check(
    "…and it names the child boxes it answers for, so the truth check can measure them",
    growing.ok &&
      growing.recovery.witnesses.map((witness) => witness.nodeId).join(",") === "ga,gb" &&
      growing.recovery.witnesses[0]?.w === 800,
    JSON.stringify(growing.ok ? growing.recovery.witnesses : undefined),
  );

  const constant = trackResult(twoToOne([390, 768, 1200, 1200, 1200]), "g");
  check(
    "the SAME geometry in a container that never changes width is REFUSED",
    !constant.ok && constant.reason === "container-width-constant",
    JSON.stringify(constant),
  );

  // A child that does not fill its column (`justify-self: start`) makes the
  // children an unfaithful measurement of the tracks, so nothing is emitted.
  const notTiling = twoToOne([390, 768, 900, 1200, 1500]);
  notTiling[3] = { ...notTiling[3]!, w: notTiling[3]!.w.map((width) => width - 40) };
  check(
    "a child narrower than its own column refuses the container",
    (() => {
      const result = trackResult(notTiling, "g");
      return !result.ok && result.reason === "children-do-not-tile-tracks";
    })(),
    JSON.stringify(trackResult(notTiling, "g")),
  );

  // A fixed sidebar beside a fluid column: the two hypotheses must be told apart
  // per track, not per container.
  const mixed = twoToOne([390, 768, 900, 1200, 1500]);
  const fixedW = [390, 768, 200, 200, 200];
  const fluidW = [390, 768, 700, 1000, 1300];
  mixed[2] = {
    ...mixed[2]!,
    props: { ...GRID_BASE, "grid-template-columns": "200px 1000px" },
  };
  mixed[3] = { ...mixed[3]!, w: fixedW };
  mixed[4] = { ...mixed[4]!, w: fluidW, x: fixedW };
  const mixedResult = trackResult(mixed, "g");
  check(
    "a constant track stays pixels and a proportional one becomes fr, in the same list",
    mixedResult.ok && mixedResult.recovery.value === "200px minmax(0, 1fr)",
    JSON.stringify(mixedResult),
  );

  // And the whole thing through the real inference path, with the counters.
  const built = buildPage(twoToOne([390, 768, 900, 1200, 1500]));
  const inferred = inferLayoutRules({
    pages: [built.page],
    styleLookup: built.styleLookup,
    breakpoint: 915,
  });
  const gridRule = inferred.rules.find((rule) => rule.kind === "grid-track-columns");
  check(
    "inference emits the kind, on the CONTAINER, and counts it",
    gridRule?.nodeId === "g" &&
      gridRule.declarations["grid-template-columns"] === "minmax(0, 2fr) minmax(0, 1fr)" &&
      inferred.counters.gridTrackColumns === 1,
    JSON.stringify(gridRule),
  );
  const refusedInference = inferLayoutRules({
    pages: [buildPage(twoToOne([390, 768, 1200, 1200, 1200])).page],
    styleLookup: buildPage(twoToOne([390, 768, 1200, 1200, 1200])).styleLookup,
    breakpoint: 915,
  });
  check(
    "…and a refusal is counted by reason rather than dropped silently",
    refusedInference.counters.gridTrackColumns === 0 &&
      refusedInference.counters.gridTrackRefusals === 1 &&
      refusedInference.counters.gridTrackRefusalsByReason["container-width-constant"] === 1,
    JSON.stringify(refusedInference.counters.gridTrackRefusalsByReason),
  );
  check(
    "the emitted CSS is a track list on the container, at the recovered-tier specificity",
    generateLayoutCss(gridRule ? [gridRule] : []).includes(
      "grid-template-columns: minmax(0, 2fr) minmax(0, 1fr);",
    ),
    generateLayoutCss(gridRule ? [gridRule] : []),
  );
}

/** The correct track list for the p6 grid, and a wrong one, side by side. */
const GRID_WITNESSES = [
  { nodeId: "p6a", x: 0, w: 800 },
  { nodeId: "p6b", x: 800, w: 400 },
];
const GRID_TRACK_RULE: RecoveredLayoutRule = {
  pageId: "p000006",
  nodeId: "p6grid",
  kind: "grid-track-columns",
  declarations: { "grid-template-columns": "minmax(0, 2fr) minmax(0, 1fr)" },
  witnesses: GRID_WITNESSES,
  evidence: ["fixture"],
  truth: { x: 0, w: 1200 },
};
const WRONG_GRID_TRACK_RULE: RecoveredLayoutRule = {
  ...GRID_TRACK_RULE,
  declarations: { "grid-template-columns": "minmax(0, 1fr) minmax(0, 3fr)" },
};

async function gridTrackTruthCheckChecks(): Promise<void> {
  section("Part 11b — A5: the new kind is verified by RENDER, like every other");

  const good = await verifyLayoutRules({
    rules: [GRID_TRACK_RULE],
    pages: HARNESS_PAGES,
    css: HARNESS_CSS,
  });
  check(
    "a correct track list ships, having been rendered — never exempted",
    good.rules.length === 1 &&
      good.counters.truthCheckable === 1 &&
      good.counters.acceptedUnchecked === 0 &&
      good.counters.acceptedRegressed === 0,
    JSON.stringify(good.counters),
  );

  const bad = await verifyLayoutRules({
    rules: [WRONG_GRID_TRACK_RULE],
    pages: HARNESS_PAGES,
    css: HARNESS_CSS,
  });
  check(
    "a wrong track list is REJECTED by the truth check",
    bad.rules.length === 0 && bad.counters.rejectedByTruthCheck === 1,
    JSON.stringify(bad.counters),
  );
  check(
    "…and it was a WITNESS that caught it — the container's own box never moved",
    bad.rejections[0]?.nodeId === "p6grid" &&
      bad.rejections[0]?.witnessNodeId === "p6a" &&
      Math.abs(bad.rejections[0]!.rendered.w - 300) <= 1 &&
      bad.rejections[0]!.observed.w === 800,
    JSON.stringify(bad.rejections),
  );
  check(
    "…so a rule with NO witnesses would have sailed through the same render",
    (
      await verifyLayoutRules({
        rules: [{ ...WRONG_GRID_TRACK_RULE, witnesses: undefined }],
        pages: HARNESS_PAGES,
        css: HARNESS_CSS,
      })
    ).rules.length === 1,
  );
}

// ---------------------------------------------------------------------------


// ---------------------------------------------------------------------------
// Task 28.6 C1 / C2b / C3 — the tree switch, the mobile pass, and the funnel
// ---------------------------------------------------------------------------

/** Mobile probe widths for the two-viewport fixtures. Truth is the first. */
const MOBILE_WIDTHS = [390, 500, 768, 900];
const MOBILE_TRUTH_INDEX = 0;

interface TwoViewportOptions {
  /** Desktop-viewport authored histogram, as a schemaVersion-5 spec carries it. */
  authoredBreakpoints?: AuthoredBreakpoints;
  /** Omit to model a pre-schemaVersion-6 SiteSpec: no mobile probe at all. */
  mobileProbe?: {
    aligned: boolean;
    alignedElementCount?: number;
    profileId?: string;
    refusedReason?: string;
  };
  /** Mobile element list. Defaults to the desktop tags, so the walks match. */
  mobileNodes?: readonly FixtureNode[];
  /**
   * Task 28.7 §26 — a site has more than one page, and a per-route switch is
   * only meaningful when the pages can be told apart. Defaults to the single id
   * every pre-§26 fixture used, so nothing else in this suite changes.
   */
  pageId?: string;
  /**
   * Task 28.7 §26 — the DESKTOP probe's own width list.
   *
   * `PROBE_WIDTHS` has no two adjacent widths within `TIGHT_BRACKET_MAX_PX`, so
   * with it every candidate is unattributable by construction. A fixture that
   * needs the probe to CORROBORATE a candidate supplies a list that brackets it
   * the way the real observer does — the width below and the width itself.
   */
  desktopProbeWidths?: readonly number[];
  /** Index into {@link desktopProbeWidths} of the desktop truth width. */
  desktopTruthIndex?: number;
}

/**
 * A page carrying BOTH viewports, each with its own probe and width list.
 *
 * `buildPage()` models the pre-28.6 world where only the desktop tree was ever
 * measured. This models the world C2b creates, and the two probes are kept in
 * separate fields with separate width lists for the reason the SiteSpec keeps
 * them apart: they walked two trees, and indexing one viewport's arrays with the
 * other's widths corrupts every rule drawn from them.
 */
function buildTwoViewportPage(
  desktopNodes: readonly FixtureNode[],
  options: TwoViewportOptions = {},
): {
  page: Parameters<typeof inferLayoutRules>[0]["pages"][number];
  styleLookup: (id: string) => Props | undefined;
} {
  const styles = new Map<string, Props>();
  const compile = (
    nodes: readonly FixtureNode[],
    widths: readonly number[],
    truthIndex: number,
    suffix: string,
  ): unknown[] => {
    const childrenOf = new Map<string, string[]>();
    for (const node of nodes) {
      if (node.parentNodeId === undefined) continue;
      const siblings = childrenOf.get(node.parentNodeId);
      if (siblings) siblings.push(node.nodeId);
      else childrenOf.set(node.parentNodeId, [node.nodeId]);
    }
    return nodes.map((node) => {
      const styleTokenId = `st-${suffix}-${node.nodeId}`;
      styles.set(styleTokenId, node.props);
      const x = node.x ?? widths.map(() => 0);
      return {
        nodeId: node.nodeId,
        type: "element" as const,
        sourceElementId: `e-${suffix}-${node.nodeId}`,
        ...(node.parentNodeId !== undefined ? { parentNodeId: node.parentNodeId } : {}),
        childNodeIds: childrenOf.get(node.nodeId) ?? [],
        tagName: node.tagName,
        attributes: {},
        localVisible: true,
        effectiveVisible: true,
        boundingBox: {
          x: x[truthIndex]!,
          y: 0,
          width: node.w[truthIndex]!,
          height: 100,
          top: 0,
          right: x[truthIndex]! + node.w[truthIndex]!,
          bottom: 100,
          left: x[truthIndex]!,
        },
        probe: {
          x,
          w: [...node.w],
          v: node.v ? [...node.v] : widths.map(() => 1 as const),
        },
        styleTokenId,
        assetRefs: [],
        relations: [],
        limitations: [],
        ...(node.authoredLayout !== undefined ? { authoredLayout: node.authoredLayout } : {}),
      };
    });
  };

  const mobileSource = options.mobileNodes ?? desktopNodes;
  const desktopWidths = options.desktopProbeWidths ?? PROBE_WIDTHS;
  const desktopTruthIndex = options.desktopTruthIndex ?? TRUTH_INDEX;
  const desktop = compile(desktopNodes, desktopWidths, desktopTruthIndex, "d");
  const mobile = compile(
    mobileSource.map((node) => ({
      ...node,
      // The mobile probe has its OWN width list, so the arrays are re-cut to it.
      w: MOBILE_WIDTHS.map((_, i) => node.w[Math.min(i, node.w.length - 1)]!),
      ...(node.x !== undefined
        ? { x: MOBILE_WIDTHS.map((_, i) => node.x![Math.min(i, node.x!.length - 1)]!) }
        : {}),
      ...(node.v !== undefined
        ? { v: MOBILE_WIDTHS.map((_, i) => node.v![Math.min(i, node.v!.length - 1)]!) }
        : {}),
    })),
    MOBILE_WIDTHS,
    MOBILE_TRUTH_INDEX,
    "m",
  );

  const page = {
    pageId: options.pageId ?? "p000001",
    layoutProbe: {
      widths: desktopWidths,
      aligned: true,
      elementCount: desktop.length,
      truncated: false,
    },
    ...(options.mobileProbe !== undefined
      ? {
          layoutProbeMobile: {
            widths: MOBILE_WIDTHS,
            aligned: options.mobileProbe.aligned,
            ...(options.mobileProbe.alignedElementCount !== undefined
              ? { alignedElementCount: options.mobileProbe.alignedElementCount }
              : {}),
            elementCount: mobile.length,
            truncated: false,
            ...(options.mobileProbe.profileId !== undefined
              ? { profileId: options.mobileProbe.profileId }
              : {}),
            ...(options.mobileProbe.refusedReason !== undefined
              ? { refusedReason: options.mobileProbe.refusedReason }
              : {}),
          },
        }
      : {}),
    viewports: {
      desktop: {
        nodes: desktop,
        ...(options.authoredBreakpoints !== undefined
          ? { authoredBreakpoints: options.authoredBreakpoints }
          : {}),
      },
      mobile: { nodes: mobile },
    },
  } as unknown as Parameters<typeof inferLayoutRules>[0]["pages"][number];
  return { page, styleLookup: (id) => styles.get(id) };
}

/** A minimal two-node tree: a shell that grows, and a child that fills it. */
function fillerTree(): FixtureNode[] {
  const block: Props = { display: "block" };
  return [
    { nodeId: "n001", tagName: "html", w: [...PROBE_WIDTHS], props: block },
    { nodeId: "n002", tagName: "body", parentNodeId: "n001", w: [...PROBE_WIDTHS], props: block },
    { nodeId: "shell", tagName: "div", parentNodeId: "n002", w: [...SHELL_W], props: block },
    { nodeId: "fillA", tagName: "div", parentNodeId: "shell", w: [...SHELL_W], props: block },
    { nodeId: "fillB", tagName: "div", parentNodeId: "shell", w: [...SHELL_W], props: block },
  ];
}

/**
 * Part 7 — C1: the tree switch is the SOURCE's breakpoint, not a midpoint.
 *
 * The defect: `floor((390 + 1440) / 2) = 915`, a number written by nobody and
 * matching nothing, chose which of the two observed DOM trees the clone mounts.
 * On seoultone.kr it landed inside the source's own `max-width: 1024` band and
 * shipped a 1296px footer into a 1024px viewport.
 */
/**
 * An `authoredBreakpoints` histogram, as a schemaVersion-5 SiteSpec carries one.
 * Module scope since Task 28.7 §26, because the per-route checks build several.
 */
const histogram = (
  entries: { px: number; kind: "min" | "max"; count: number }[],
): AuthoredBreakpoints =>
  ({
    entries,
    rootFontSizePx: 16,
    declarationsExamined: entries.reduce((sum, e) => sum + e.count, 0),
    distinctConditions: entries.length,
    mediaScopedDeclarations: entries.reduce((sum, e) => sum + e.count, 0),
    foldedDeclarations: entries.reduce((sum, e) => sum + e.count, 0),
    unconditionalDeclarations: 0,
    containerScopedDeclarations: 0,
    supportsScopedDeclarations: 0,
    layerScopedDeclarations: 0,
    containerGatedSkippedDeclarations: 0,
    fetchedOriginDeclarations: 0,
    unparsedDeclarations: 0,
    truncatedNodeCount: 0,
    nodesExamined: 1,
  }) as unknown as AuthoredBreakpoints;

function treeSwitchChecks(): void {
  section("Part 7 — C1: the tree switch snaps to an authored breakpoint");

  // --- (a) never snap past a width where the OTHER tree was observed --------
  const outside = chooseTreeSwitch({
    pages: [
      buildTwoViewportPage(fillerTree(), {
        authoredBreakpoints: histogram([
          { px: 320, kind: "min", count: 900 },
          { px: 1921, kind: "min", count: 900 },
        ]),
      }).page,
    ],
    mobileWidth: 390,
    desktopWidth: 1440,
  });
  check(
    "(a) an authored breakpoint outside (mobile, desktop] is no candidate at all",
    outside.candidateCount === 0 && outside.candidatesOutsideObservedInterval === 2,
    `candidates ${outside.candidateCount}, dropped ${outside.candidatesOutsideObservedInterval}`,
  );
  check(
    "(c) …so the midpoint ships, and it SAYS it is a midpoint",
    outside.px === 915 &&
      !outside.snapped &&
      outside.fallbackReason === "no-candidate-in-observed-interval",
    `${outside.px} ${outside.fallbackReason}`,
  );

  // --- the snap itself, and the ranking that chose it ----------------------
  const snapped = chooseTreeSwitch({
    pages: [
      buildTwoViewportPage(fillerTree(), {
        authoredBreakpoints: histogram([
          { px: 640, kind: "min", count: 20 },
          { px: 1024, kind: "max", count: 400 },
        ]),
      }).page,
    ],
    mobileWidth: 390,
    desktopWidth: 1440,
  });
  check(
    "the switch moves off the midpoint onto a breakpoint the source authored",
    snapped.snapped && snapped.px === 1025 && snapped.midpointPx === 915,
    `${snapped.px} (midpoint ${snapped.midpointPx})`,
  );
  check(
    "…and `max-width: 1024` is folded to the first width above it, not to 1024",
    snapped.chosen?.px === 1025 && snapped.chosen.authoredWeight === 400,
    JSON.stringify(snapped.chosen),
  );
  check(
    "(b) more than one usable candidate is COUNTED as an ambiguity",
    snapped.candidateCount === 2 && snapped.ambiguous,
    `${snapped.candidateCount} candidate(s)`,
  );

  // --- "best" is defined, and observation outranks stylesheet weight -------
  const ranked = rankTreeSwitchCandidates(
    [
      {
        px: 700,
        authoredWeight: 9_000,
        authoredPages: 9,
        observedChange: 0,
        observedChangePages: 0,
        observedChangeUnattributablePages: 9,
        familyChangePages: 0,
        familyChangeObserved: false,
        familyChange: 0,
      },
      {
        px: 1025,
        authoredWeight: 10,
        authoredPages: 1,
        observedChange: 5,
        observedChangePages: 1,
        observedChangeUnattributablePages: 0,
        familyChangePages: 0,
        familyChangeObserved: false,
        familyChange: 0,
      },
    ],
    915,
  );
  check(
    "a candidate the PROBE corroborated outranks a heavier one it could not",
    ranked[0]?.px === 1025,
    JSON.stringify(ranked.map((c) => c.px)),
  );
  const weightTie = rankTreeSwitchCandidates(
    [
      {
        px: 500,
        authoredWeight: 5,
        authoredPages: 1,
        observedChange: 0,
        observedChangePages: 0,
        observedChangeUnattributablePages: 1,
        familyChangePages: 0,
        familyChangeObserved: false,
        familyChange: 0,
      },
      {
        px: 1200,
        authoredWeight: 50,
        authoredPages: 1,
        observedChange: 0,
        observedChangePages: 0,
        observedChangeUnattributablePages: 1,
        familyChangePages: 0,
        familyChangeObserved: false,
        familyChange: 0,
      },
    ],
    915,
  );
  check(
    "…and with NO corroboration anywhere the heaviest stylesheet evidence wins",
    weightTie[0]?.px === 1200,
    JSON.stringify(weightTie.map((c) => c.px)),
  );

  // --- attribution: a LOOSE probe bracket credits nothing ------------------
  const looseOnly = measureObservedChange(
    [buildTwoViewportPage(fillerTree()).page],
    [900],
  );
  check(
    "a candidate with no TIGHT probe bracket is credited 0 and counted unattributable",
    looseOnly.byPx.get(900)?.observedChange === 0 &&
      looseOnly.byPx.get(900)?.pages === 0 &&
      looseOnly.byPx.get(900)?.unattributablePages === 1,
    JSON.stringify(looseOnly.byPx.get(900)),
  );

  // --- (e) a site that authored nothing still works, and says so -----------
  const nothing = chooseTreeSwitch({
    pages: [buildTwoViewportPage(fillerTree()).page],
    mobileWidth: 390,
    desktopWidth: 1440,
  });
  check(
    "(e) a page with no authored histogram keeps the midpoint and names the reason",
    nothing.px === 915 && nothing.fallbackReason === "no-histogram",
    `${nothing.px} ${nothing.fallbackReason}`,
  );
  const noPages = chooseTreeSwitch({ pages: [], mobileWidth: 390, desktopWidth: 1440 });
  check(
    "…and 'no pages were supplied' is a DIFFERENT reason from 'the pages said nothing'",
    noPages.fallbackReason === "no-page-specs",
    String(noPages.fallbackReason),
  );

  // --- the CAUTION: one DOM or two, and what is admitted about it ----------
  const oneDom = classifyTreeDivergence([buildTwoViewportPage(fillerTree()).page]);
  check(
    "identical element walks are measured as ONE DOM",
    oneDom.divergence === "single-dom" && oneDom.pagesIdenticalWalk === 1,
    JSON.stringify(oneDom),
  );
  const twoDom = classifyTreeDivergence([
    buildTwoViewportPage(fillerTree(), {
      mobileNodes: fillerTree().slice(0, 4),
    }).page,
  ]);
  check(
    "…and a walk that differs is measured as TWO, which the manifest must carry",
    twoDom.divergence === "dual-dom" && twoDom.pagesDivergentWalk === 1,
    JSON.stringify(twoDom),
  );
  check(
    "the DOM-swap width is NEVER claimed as observed, on any path including a snap",
    snapped.domSwitchWidthObserved === false && nothing.domSwitchWidthObserved === false,
  );
}

/**
 * Part 8 — C2b: layout inference runs once per VIEWPORT.
 *
 * The defect: everything read `page.viewports.desktop` and `page.layoutProbe`,
 * so 0 of 1,135 recovered rules on linear.app and 0 of 1,106 on hobbang.net
 * targeted the mobile variant — every pair graded at 390 or 700 was graded
 * against a tree carrying no recovered layout rule at all.
 */
function viewportPassChecks(): void {
  section("Part 8 — C2b: the mobile subtree gets rules from the MOBILE probe");

  const withMobile = buildTwoViewportPage(fillerTree(), {
    mobileProbe: { aligned: true, alignedElementCount: 5, profileId: "mobile" },
  });
  const both = inferLayoutRules({
    pages: [withMobile.page],
    styleLookup: withMobile.styleLookup,
    breakpoint: 1024,
    mobileTruthWidth: MOBILE_WIDTHS[MOBILE_TRUTH_INDEX]!,
  });
  check(
    "both viewports are ATTEMPTED, once per page each",
    both.counters.viewportPasses["desktop"] === 1 &&
      both.counters.viewportPasses["mobile"] === 1,
    JSON.stringify(both.counters.viewportPasses),
  );
  check(
    "…and the mobile pass RUNS when the SiteSpec says its probe attached",
    both.counters.viewportPassesUsed["mobile"] === 1 &&
      Object.keys(both.counters.viewportPassRefusals).length === 0,
    JSON.stringify(both.counters.viewportPassRefusals),
  );
  check(
    "the mobile tree receives recovered rules, which it never did before",
    (both.counters.rulesByViewport["mobile"] ?? 0) > 0,
    JSON.stringify(both.counters.rulesByViewport),
  );
  check(
    "…and every emitted rule names the viewport it is about",
    both.rules.every((rule) => rule.viewportId !== undefined),
  );
  check(
    "…which reaches the stylesheet as the variant wrapper's own selector",
    both.css.includes('[data-wr-viewport="mobile"]') &&
      both.css.includes('[data-wr-viewport="desktop"]'),
  );

  // --- (b) degrade cleanly on every pre-28.6 artifact ----------------------
  const noMobileProbe = buildTwoViewportPage(fillerTree());
  const desktopOnly = inferLayoutRules({
    pages: [noMobileProbe.page],
    styleLookup: noMobileProbe.styleLookup,
    breakpoint: 1024,
    mobileTruthWidth: MOBILE_WIDTHS[MOBILE_TRUTH_INDEX]!,
  });
  check(
    "(b) a SiteSpec with no mobile probe refuses that pass and SAYS why",
    desktopOnly.counters.viewportPassRefusals["mobile:probe-absent"] === 1 &&
      (desktopOnly.counters.rulesByViewport["mobile"] ?? 0) === 0,
    JSON.stringify(desktopOnly.counters.viewportPassRefusals),
  );
  check(
    "…and the desktop rules are BIT-IDENTICAL to what it produced before",
    JSON.stringify(
      desktopOnly.rules.map((r) => [r.nodeId, r.kind, r.declarations]),
    ) ===
      JSON.stringify(
        both.rules
          .filter((r) => r.viewportId === "desktop")
          .map((r) => [r.nodeId, r.kind, r.declarations]),
      ),
  );

  // --- (a) the probe-to-element identity is READ, not re-derived -----------
  const refused = buildTwoViewportPage(fillerTree(), {
    mobileProbe: {
      aligned: false,
      alignedElementCount: 0,
      profileId: "mobile",
      refusedReason: "tag-walk-mismatch",
    },
  });
  const refusedResult = inferLayoutRules({
    pages: [refused.page],
    styleLookup: refused.styleLookup,
    breakpoint: 1024,
    mobileTruthWidth: MOBILE_WIDTHS[MOBILE_TRUTH_INDEX]!,
  });
  check(
    "(a) a probe the SiteSpec REFUSED to attach is refused here too, loudly",
    refusedResult.counters.viewportPassRefusals["mobile:probe-not-attached"] === 1 &&
      (refusedResult.counters.rulesByViewport["mobile"] ?? 0) === 0,
    JSON.stringify(refusedResult.counters.viewportPassRefusals),
  );
  const noTruthWidth = resolveViewportProbe(withMobile.page, "mobile", {
    breakpoint: 1024,
    truthWidth: 391,
  });
  check(
    "a viewport whose truth width was never probed refuses rather than anchoring elsewhere",
    !noTruthWidth.ok && noTruthWidth.reason === "truth-width-not-probed",
    JSON.stringify(noTruthWidth),
  );
  const desktopPass = resolveViewportProbe(withMobile.page, "desktop", {
    breakpoint: 1024,
    truthWidth: 1440,
  });
  check(
    "each viewport sees only the widths its own variant is displayed at",
    desktopPass.ok &&
      desktopPass.variantIdx.every((entry) => entry.width >= 1024) &&
      noTruthWidth.ok === false,
    desktopPass.ok ? desktopPass.variantIdx.map((e) => e.width).join(",") : "refused",
  );
}


/**
 * Part 9 — C3, first half: EVERY node that reached the inline-size stage is
 * accounted for.
 *
 * The defect: the three inline-size branches each ended in a bare `continue` and
 * nothing counted what fell past all of them. gs.severance.healthcare shipped
 * 184 rules over 3,005 probed nodes while reporting 7 width refusals — a run
 * that examined thousands of boxes read exactly like a run that found nothing.
 */
function inlineSizeFunnelChecks(): void {
  section("Part 9 — C3: the inline-size funnel adds up");

  const block: Props = { display: "block" };
  const nodes: FixtureNode[] = [
    { nodeId: "n001", tagName: "html", w: [...PROBE_WIDTHS], props: block },
    { nodeId: "n002", tagName: "body", parentNodeId: "n001", w: [...PROBE_WIDTHS], props: block },
    { nodeId: "shell", tagName: "div", parentNodeId: "n002", w: [...SHELL_W], props: block },
    // Fills its parent at every width — the full-width branch.
    { nodeId: "fills", tagName: "div", parentNodeId: "shell", w: [...SHELL_W], props: block },
    // A box frozen at one width while its parent grows: no branch describes it,
    // so it ships its exact computed width. This is the population C3 exposes.
    {
      nodeId: "frozen",
      tagName: "div",
      parentNodeId: "shell",
      w: PROBE_WIDTHS.map(() => 337),
      props: block,
    },
    // Not blockish: dropped BEFORE the stage, and counted apart from a refusal.
    {
      nodeId: "inline",
      tagName: "span",
      parentNodeId: "shell",
      w: PROBE_WIDTHS.map(() => 40),
      props: { display: "inline" },
    },
    // Hidden at the truth width: the exact computed style already hides it.
    {
      nodeId: "hidden",
      tagName: "div",
      parentNodeId: "shell",
      w: PROBE_WIDTHS.map(() => 100),
      v: [1, 1, 1, 0, 1],
      props: block,
    },
  ];
  const built = buildPage(nodes);
  const result = inferLayoutRules({
    pages: [built.page],
    styleLookup: built.styleLookup,
    breakpoint: 1024,
  });
  const counters = result.counters;
  const sumOf = (record: Record<string, number>): number =>
    Object.values(record).reduce((total, value) => total + value, 0);

  check(
    "every probed node is either a candidate or a counted pre-stage drop",
    sumOf(counters.inlineSizePreStageDrops) + counters.inlineSizeCandidates ===
      counters.nodesWithProbe,
    `${sumOf(counters.inlineSizePreStageDrops)} + ${counters.inlineSizeCandidates} vs ${counters.nodesWithProbe}`,
  );
  check(
    "…and every candidate leaves through exactly ONE outcome",
    sumOf(counters.inlineSizeOutcomes) === counters.inlineSizeCandidates &&
      counters.inlineSizeOutcomeDoubleCounts === 0,
    `${sumOf(counters.inlineSizeOutcomes)} outcome(s) for ${counters.inlineSizeCandidates} candidate(s), ${counters.inlineSizeOutcomeDoubleCounts} double(s)`,
  );
  check(
    "a box no branch describes is COUNTED, not silently dropped",
    (counters.inlineSizeOutcomes["no-branch-matched"] ?? 0) >= 1,
    JSON.stringify(counters.inlineSizeOutcomes),
  );
  check(
    "…and it is the box that ships its frozen computed width, not the one that fills",
    (counters.inlineSizeOutcomes["emitted-full-width"] ?? 0) >= 1 &&
      result.rules.some((rule) => rule.nodeId === "fills") &&
      !result.rules.some(
        (rule) => rule.nodeId === "frozen" && rule.kind !== "responsive-hidden",
      ),
  );
  check(
    "a non-blockish node never reaches the stage, and says so separately",
    counters.inlineSizePreStageDrops["display-not-blockish"] === 1,
    JSON.stringify(counters.inlineSizePreStageDrops),
  );
  check(
    "…as does one the exact computed style already hides at the truth width",
    counters.inlineSizePreStageDrops["hidden-at-truth-width"] === 1,
    JSON.stringify(counters.inlineSizePreStageDrops),
  );
}

/**
 * Part 10 — C3, second half: the parent's content box is MEASURED, not derived
 * from one padding sample.
 *
 * The defect: `contentAt()` reads the parent's horizontal padding once, at the
 * truth viewport, and subtracts it at every width. linear.app authors
 * `padding-left: var(--page-padding-left)` and moves the responsive change into
 * the custom property under a media query, so the assumed constant is wrong by
 * +36px at 928/929/1024 and +72px at 1025/1100/1280 against a 2px tolerance. No
 * branch fires, and the node ships `width: 1344px` into a 1100px viewport.
 */
function measuredContentBoxChecks(): void {
  section("Part 10 — C3: the parent content box is measured per width");

  const block: Props = { display: "block" };
  /*
   * A shell whose padding SHRINKS as the viewport narrows — 72px each side at
   * 1440, 24px at 1024 — exactly the shape of a `--page-padding-*` custom
   * property under a media query. The computed style carries only the 1440
   * value, so the constant-px derivation is wrong by 96px at 1024.
   */
  const shellBorderW = [390, 768, 1024, 1440, 1440];
  const contentW = [390 - 48, 768 - 48, 1024 - 48, 1440 - 144, 1440 - 144];
  const shellProps: Props = {
    display: "block",
    "padding-left": "72px",
    "padding-right": "72px",
  };
  const paddedShell = (extraChildren: FixtureNode[]): FixtureNode[] => [
    { nodeId: "n001", tagName: "html", w: [...PROBE_WIDTHS], props: block },
    { nodeId: "n002", tagName: "body", parentNodeId: "n001", w: [...PROBE_WIDTHS], props: block },
    {
      nodeId: "shell",
      tagName: "div",
      parentNodeId: "n002",
      w: [...shellBorderW],
      props: shellProps,
      authoredLayout: [
        {
          property: "padding-left",
          value: "var(--page-padding-left)",
          selector: ".shell",
        },
        {
          property: "padding-left",
          value: "var(--page-padding-left)",
          selector: ".shell",
          media: "(min-width: 1200px)",
        },
      ],
    },
    ...extraChildren,
  ];

  const filling = (nodeId: string): FixtureNode => ({
    nodeId,
    tagName: "div",
    parentNodeId: "shell",
    w: [...contentW],
    x: shellBorderW.map((_, i) => (i >= 3 ? 72 : 24)),
    props: block,
  });

  // --- two agreeing witnesses recover the box, and the rule comes back ------
  const measured = buildPage(paddedShell([filling("fillA"), filling("fillB")]));
  const withMeasurement = inferLayoutRules({
    pages: [measured.page],
    styleLookup: measured.styleLookup,
    breakpoint: 1024,
  });
  check(
    "two filling siblings that agree at every width recover the parent's content box",
    withMeasurement.counters.contentBoxMeasured >= 2,
    `${withMeasurement.counters.contentBoxMeasured} measured / ${withMeasurement.counters.contentBoxAssumedConstant} assumed`,
  );
  check(
    "…and the measurement DISAGREES with the one-sample padding, which is the defect",
    withMeasurement.counters.contentBoxMeasuredDisagreed >= 1 &&
      withMeasurement.counters.contentBoxMaxDisagreementPx >= 90,
    `${withMeasurement.counters.contentBoxMeasuredDisagreed} node(s), max ${withMeasurement.counters.contentBoxMaxDisagreementPx}px`,
  );
  check(
    "…so the fills-parent rule is RECOVERED where the assumption lost it",
    withMeasurement.rules.some(
      (rule) => rule.nodeId === "fillA" && rule.kind === "full-width",
    ),
    withMeasurement.rules.map((r) => `${r.nodeId}:${r.kind}`).join(" "),
  );

  // --- guard 2: ONE witness is not a measurement ---------------------------
  const single = buildPage(paddedShell([filling("fillA")]));
  check(
    "a SINGLE filling child is not enough — one box cannot corroborate itself",
    measureParentContentBox({
      parent: single.specNodes.get("shell")!,
      children: [single.specNodes.get("fillA")!],
      styleLookup: single.styleLookup,
      widthCount: PROBE_WIDTHS.length,
      truthIndex: TRUTH_INDEX,
    }) === undefined,
  );

  // --- guard 3: containment rejects a child that outgrows its parent -------
  const escaping = buildPage(
    paddedShell([
      filling("fillA"),
      {
        nodeId: "fillB",
        tagName: "div",
        parentNodeId: "shell",
        // Equal to the content box at the truth width, frozen everywhere else,
        // so at 390 it is far wider than the parent it claims to sit inside.
        w: PROBE_WIDTHS.map(() => 1440 - 144),
        x: PROBE_WIDTHS.map(() => 72),
        props: block,
      },
    ]),
  );
  check(
    "a child frozen wider than its shrinking parent is rejected by containment",
    measureParentContentBox({
      parent: escaping.specNodes.get("shell")!,
      children: [
        escaping.specNodes.get("fillA")!,
        escaping.specNodes.get("fillB")!,
      ],
      styleLookup: escaping.styleLookup,
      widthCount: PROBE_WIDTHS.length,
      truthIndex: TRUTH_INDEX,
    }) === undefined,
  );

  // --- the refusal, when nothing can be measured and the padding varies ----
  const shellNode = measured.specNodes.get("shell")!;
  check(
    "an @media padding whose boundary falls INSIDE the rendered range is not constant",
    parentPaddingConstancy(shellNode, [1024, 1440, 1920]) === "media-conditional",
    parentPaddingConstancy(shellNode, [1024, 1440, 1920]),
  );
  check(
    "…and one whose boundary falls OUTSIDE it is, so sound rules are not thrown away",
    parentPaddingConstancy(shellNode, [1280, 1440, 1920]) === "constant",
    parentPaddingConstancy(shellNode, [1280, 1440, 1920]),
  );
  check(
    "a viewport-relative padding is never constant, whatever the range",
    parentPaddingConstancy(
      {
        ...shellNode,
        authoredLayout: [
          { property: "padding-inline", value: "clamp(1rem, 4vw, 3rem)", selector: ".s" },
        ],
      } as unknown as ElementSpecNode,
      [1024, 1440],
    ) === "viewport-relative",
  );

  const unmeasurable = buildPage(
    paddedShell([
      {
        // One child, holding a constant fraction of the parent's border box —
        // the percentage branch's exact signature, against a denominator the
        // source says is not one number.
        nodeId: "ratio",
        tagName: "div",
        parentNodeId: "shell",
        // Exactly half of the DERIVED content box at every width, so the ratio
        // the branch measures is perfectly constant — and perfectly wrong,
        // because the denominator it is constant against is one padding sample.
        w: shellBorderW.map((width) => Math.round((width - 144) * 0.5 * 100) / 100),
        props: block,
      },
    ]),
  );
  const refusedResult = inferLayoutRules({
    pages: [unmeasurable.page],
    styleLookup: unmeasurable.styleLookup,
    breakpoint: 1024,
  });
  check(
    "with nothing measured and a padding the source says varies, the branch REFUSES",
    refusedResult.counters.guardRefusalsByReason["parent-padding-not-constant"] === 1 &&
      !refusedResult.rules.some((rule) => rule.nodeId === "ratio"),
    JSON.stringify(refusedResult.counters.guardRefusalsByReason),
  );
  check(
    "…and the doubt is counted for every candidate, not only for the refusals",
    (refusedResult.counters.parentPaddingNotConstant["media-conditional"] ?? 0) >= 1,
    JSON.stringify(refusedResult.counters.parentPaddingNotConstant),
  );
}


// ---------------------------------------------------------------------------
// Part 11c — Task 28.7 B2: spans, removed children, and the armed gate
// ---------------------------------------------------------------------------

/**
 * A generic column gap, large enough that the `(k−1) × gap` term a span
 * absorbs cannot hide inside `GRID_SPAN_TOLERANCE_PX`. Nothing about it comes
 * from any real page.
 */
const SPAN_GAP_PX = 20;

interface GridChildSpec {
  id: string;
  /** Start column (0-based). */
  start: number;
  /** Consecutive columns the child covers. Defaults to 1. */
  span?: number;
  /** Extra computed properties: `display`, `visibility`, `position`, `grid-column`. */
  props?: Props;
  /** Px added to the child's measured width at every probe width. */
  widthDelta?: number;
  /** Model a box that is not rendered at all: `x`/`w`/`v` all zero. */
  noBox?: boolean;
}

/**
 * A grid container that GROWS, partitioned into `weights.length` columns in the
 * given ratio with a fixed gap, plus exactly the children a case needs.
 *
 * Every number is arithmetic on `containerW` and `weights` — there is no site,
 * no selector and no borrowed pixel anywhere in it. The container widths are
 * chosen only so that every track lands on a whole pixel at every probe width.
 */
function gridFixture(
  containerW: number[],
  weights: number[],
  children: readonly GridChildSpec[],
): FixtureNode[] {
  const totalWeight = weights.reduce((sum, weight) => sum + weight, 0);
  const gapTotal = SPAN_GAP_PX * (weights.length - 1);
  const trackAt = (column: number, i: number): number =>
    Math.round(((containerW[i]! - gapTotal) * weights[column]!) / totalWeight * 100) / 100;
  const offsetAt = (column: number, i: number): number => {
    let cursor = 0;
    for (let c = 0; c < column; c++) cursor += trackAt(c, i) + SPAN_GAP_PX;
    return Math.round(cursor * 100) / 100;
  };
  const runAt = (start: number, span: number, i: number): number => {
    let total = SPAN_GAP_PX * (span - 1);
    for (let c = start; c < start + span; c++) total += trackAt(c, i);
    return Math.round(total * 100) / 100;
  };
  const usedTracks = weights
    .map((_, column) => `${trackAt(column, TRUTH_INDEX)}px`)
    .join(" ");
  const nodes: FixtureNode[] = [
    { nodeId: "n001", tagName: "html", w: [...PROBE_WIDTHS], props: { display: "block" } },
    {
      nodeId: "n002",
      tagName: "body",
      parentNodeId: "n001",
      w: [...PROBE_WIDTHS],
      props: { display: "block" },
    },
    {
      nodeId: "g",
      tagName: "div",
      parentNodeId: "n002",
      w: [...containerW],
      x: containerW.map(() => 0),
      props: {
        display: "grid",
        "box-sizing": "border-box",
        "padding-left": "0px",
        "padding-right": "0px",
        "column-gap": `${SPAN_GAP_PX}px`,
        "grid-template-columns": usedTracks,
      },
    },
  ];
  for (const child of children) {
    const span = child.span ?? 1;
    const props: Props = { display: "block", ...(child.props ?? {}) };
    // The observer's rule, reproduced exactly: `v` is 0 for `display: none` AND
    // for `visibility: hidden`, which is the conflation B2 has to see through.
    const hidden =
      props["display"] === "none" ||
      props["visibility"] === "hidden" ||
      props["visibility"] === "collapse";
    nodes.push({
      nodeId: child.id,
      tagName: "div",
      parentNodeId: "g",
      w: child.noBox
        ? PROBE_WIDTHS.map(() => 0)
        : PROBE_WIDTHS.map((_, i) => runAt(child.start, span, i) + (child.widthDelta ?? 0)),
      x: child.noBox
        ? PROBE_WIDTHS.map(() => 0)
        : PROBE_WIDTHS.map((_, i) => offsetAt(child.start, i)),
      v: PROBE_WIDTHS.map(() => (child.noBox || hidden ? 0 : 1)) as (0 | 1)[],
      props,
    });
  }
  return nodes;
}

/** The used track sizes the exact tier freezes for a fixture, at the truth width. */
function frozenTracksOf(containerW: number[], weights: number[]): number[] {
  const totalWeight = weights.reduce((sum, weight) => sum + weight, 0);
  const gapTotal = SPAN_GAP_PX * (weights.length - 1);
  return weights.map(
    (weight) =>
      Math.round(((containerW[TRUTH_INDEX]! - gapTotal) * weight) / totalWeight * 100) /
      100,
  );
}

/** Three equal columns in a container that grows. Every track a whole pixel. */
const THREE_COL_W = [340, 730, 1030, 1330, 1930];
/** Two columns partitioned 2:1, same property. */
const TWO_COL_W = [350, 740, 1040, 1340, 1940];

function gridSpanChecks(): void {
  section("Part 11c — B2: spans, removed children, and the gate that stays armed");

  // --- a `display: none` child: pre-fix `child-count-not-multiple-of-tracks` --
  const withHidden: GridChildSpec[] = [
    { id: "c0", start: 0 },
    { id: "c1", start: 1 },
    { id: "c2", start: 2 },
    { id: "gone", start: 0, props: { display: "none" }, noBox: true },
  ];
  check(
    "PRE-FIX REPRODUCTION: 4 children over 3 tracks fails `children.length % trackCount`",
    withHidden.length % 3 !== 0,
    `${withHidden.length} % 3 = ${withHidden.length % 3}`,
  );
  const hiddenResult = trackResult(gridFixture(THREE_COL_W, [1, 1, 1], withHidden), "g");
  check(
    "…and a `display: none` child is REMOVED from the grid, so the tracks recover",
    hiddenResult.ok &&
      hiddenResult.recovery.value ===
        "minmax(0, 1fr) minmax(0, 1fr) minmax(0, 1fr)",
    JSON.stringify(hiddenResult),
  );
  check(
    "…and the removed child is NOT a witness: it has no box to move",
    hiddenResult.ok &&
      hiddenResult.recovery.witnesses.map((witness) => witness.nodeId).join(",") ===
        "c0,c1,c2",
    JSON.stringify(hiddenResult.ok ? hiddenResult.recovery.witnesses : undefined),
  );
  check(
    "…and a `display: none` child the source brings BACK at another width refuses",
    (() => {
      const nodes = gridFixture(THREE_COL_W, [1, 1, 1], withHidden);
      const gone = nodes.find((node) => node.nodeId === "gone")!;
      // Same style, but the probe measured it visible at the widest sample.
      gone.v = PROBE_WIDTHS.map((_, i) => (i === 4 ? 1 : 0)) as (0 | 1)[];
      const result = trackResult(nodes, "g");
      return !result.ok && result.reason === "hidden-child-participates-at-another-width";
    })(),
  );

  // --- a child spanning k consecutive tracks: pre-fix `children-do-not-tile` --
  const spanning: GridChildSpec[] = [
    { id: "c0", start: 0 },
    { id: "c1", start: 1 },
    { id: "bar", start: 0, span: 2 },
    { id: "bar2", start: 0, span: 2 },
  ];
  const spanNodes = gridFixture(TWO_COL_W, [2, 1], spanning);
  const frozen = frozenTracksOf(TWO_COL_W, [2, 1]);
  const barWidth = spanNodes.find((node) => node.nodeId === "bar")!.w[TRUTH_INDEX]!;
  check(
    "PRE-FIX REPRODUCTION: the child count IS a multiple, so the old count gate passed",
    spanning.length % 2 === 0,
    `${spanning.length} % 2 = ${spanning.length % 2}`,
  );
  check(
    "…and the spanning child's box matches NO single track, which is where it died",
    frozen.every((track) => Math.abs(barWidth - track) > FULL_WIDTH_TOLERANCE_PX),
    `${barWidth} vs ${JSON.stringify(frozen)}`,
  );
  const spanResult = trackResult(spanNodes, "g");
  check(
    "…and a run of k tracks plus its (k−1) gaps DOES match, so the 2:1 shares recover",
    spanResult.ok && spanResult.recovery.value === "minmax(0, 2fr) minmax(0, 1fr)",
    JSON.stringify(spanResult),
  );
  check(
    "…with the fr weights read off the child boxes, not off any authored stylesheet",
    spanResult.ok &&
      spanResult.recovery.tracks.length === 2 &&
      spanResult.recovery.tracks[0]?.kind === "fractional" &&
      spanResult.recovery.tracks[0].weight === 2 &&
      spanResult.recovery.tracks[1]?.kind === "fractional" &&
      spanResult.recovery.tracks[1].weight === 1,
    JSON.stringify(spanResult.ok ? spanResult.recovery.tracks : undefined),
  );
  check(
    "…and every spanning child is a WITNESS, so the truth check can still catch it",
    spanResult.ok &&
      spanResult.recovery.witnesses.map((witness) => witness.nodeId).join(",") ===
        "bar,bar2,c0,c1",
    JSON.stringify(spanResult.ok ? spanResult.recovery.witnesses : undefined),
  );
  check(
    "THE GAP ARITHMETIC: a child as wide as the two tracks WITHOUT the gap is refused",
    (() => {
      // Exactly the box a missing `(k−1) × gap` term would have accepted.
      const nodes = gridFixture(TWO_COL_W, [2, 1], [
        { id: "c0", start: 0 },
        { id: "c1", start: 1 },
        { id: "bar", start: 0, span: 2, widthDelta: -SPAN_GAP_PX },
        { id: "bar2", start: 0, span: 2 },
      ]);
      const result = trackResult(nodes, "g");
      return !result.ok && result.reason === "children-do-not-tile-tracks";
    })(),
    JSON.stringify(
      trackResult(
        gridFixture(TWO_COL_W, [2, 1], [
          { id: "c0", start: 0 },
          { id: "c1", start: 1 },
          { id: "bar", start: 0, span: 2, widthDelta: -SPAN_GAP_PX },
          { id: "bar2", start: 0, span: 2 },
        ]),
        "g",
      ),
    ),
  );
  check(
    "a `grid-column` that CONTRADICTS the measured run refuses rather than overriding it",
    (() => {
      const result = trackResult(
        gridFixture(TWO_COL_W, [2, 1], [
          { id: "c0", start: 0 },
          { id: "c1", start: 1 },
          { id: "bar", start: 0, span: 2, props: { "grid-column": "1 / span 3" } },
          { id: "bar2", start: 0, span: 2 },
        ]),
        "g",
      );
      return !result.ok && result.reason === "span-contradicts-grid-column";
    })(),
  );
  check(
    "…while the auto-placed `auto / auto` Chromium serializes says nothing and is ignored",
    (() => {
      const result = trackResult(
        gridFixture(TWO_COL_W, [2, 1], [
          { id: "c0", start: 0 },
          { id: "c1", start: 1 },
          { id: "bar", start: 0, span: 2, props: { "grid-column": "auto / auto" } },
          { id: "bar2", start: 0, span: 2 },
        ]),
        "g",
      );
      return result.ok && result.recovery.value === "minmax(0, 2fr) minmax(0, 1fr)";
    })(),
  );

  // --- NEGATIVE CONTROL: `visibility: hidden` still occupies its cell --------
  const visibilityHidden = gridFixture(TWO_COL_W, [2, 1], [
    { id: "c0", start: 0 },
    { id: "c1", start: 1, props: { visibility: "hidden" } },
  ]);
  const hiddenCell = trackResult(visibilityHidden, "g");
  check(
    "NEGATIVE CONTROL: a `visibility: hidden` child is NOT skipped — it still sizes its track",
    hiddenCell.ok && hiddenCell.recovery.value === "minmax(0, 2fr) minmax(0, 1fr)",
    JSON.stringify(hiddenCell),
  );
  check(
    "…and it stays a WITNESS, because a wrong track list still moves it",
    hiddenCell.ok &&
      hiddenCell.recovery.witnesses.some((witness) => witness.nodeId === "c1"),
    JSON.stringify(hiddenCell.ok ? hiddenCell.recovery.witnesses : undefined),
  );
  check(
    "…and the probe alone could not have told them apart: `v` is 0 for BOTH",
    visibilityHidden.find((node) => node.nodeId === "c1")!.v![TRUTH_INDEX] === 0,
  );
  check(
    "…whereas the SAME child at `display: none` leaves its column unmeasured, and refuses",
    (() => {
      const result = trackResult(
        gridFixture(TWO_COL_W, [2, 1], [
          { id: "c0", start: 0 },
          { id: "c1", start: 1, props: { display: "none" }, noBox: true },
        ]),
        "g",
      );
      return !result.ok && result.reason === "not-every-track-witnessed";
    })(),
  );

  // --- NEGATIVE CONTROL: a grid that genuinely cannot be tiled --------------
  check(
    "NEGATIVE CONTROL: a column measured only by SPANNING children still refuses",
    (() => {
      const result = trackResult(
        gridFixture(THREE_COL_W, [1, 1, 1], [
          { id: "bar", start: 0, span: 2 },
          { id: "c2", start: 2 },
        ]),
        "g",
      );
      return !result.ok && result.reason === "not-every-track-witnessed";
    })(),
    JSON.stringify(
      trackResult(
        gridFixture(THREE_COL_W, [1, 1, 1], [
          { id: "bar", start: 0, span: 2 },
          { id: "c2", start: 2 },
        ]),
        "g",
      ),
    ),
  );
  check(
    "NEGATIVE CONTROL: a child matching no track AND no run refuses `children-do-not-tile-tracks`",
    (() => {
      const result = trackResult(
        gridFixture(THREE_COL_W, [1, 1, 1], [
          { id: "c0", start: 0 },
          { id: "c1", start: 1, widthDelta: -30 },
          { id: "c2", start: 2 },
        ]),
        "g",
      );
      return !result.ok && result.reason === "children-do-not-tile-tracks";
    })(),
  );

  // --- the gate-armed invariant, through the real inference path ------------
  const spanBuilt = buildPage(spanNodes);
  const spanInferred = inferLayoutRules({
    pages: [spanBuilt.page],
    styleLookup: spanBuilt.styleLookup,
    breakpoint: 915,
  });
  const gridRules = spanInferred.rules.filter((rule) => rule.kind === "grid-track-columns");
  check(
    "THE GATE STAYS ARMED: every emitted grid rule carries at least one witness",
    gridRules.length === 1 && gridRules.every((rule) => (rule.witnesses?.length ?? 0) >= 1),
    JSON.stringify(gridRules.map((rule) => rule.witnesses?.length)),
  );
  check(
    "…and the pre-fix rectangularity reason is now emitted by nothing at all",
    (spanInferred.counters.gridTrackRefusalsByReason[
      "child-count-not-multiple-of-tracks"
    ] ?? 0) === 0,
    JSON.stringify(spanInferred.counters.gridTrackRefusalsByReason),
  );
  const raggedBuilt = buildPage(
    gridFixture(THREE_COL_W, [1, 1, 1], [
      { id: "bar", start: 0, span: 2 },
      { id: "c2", start: 2 },
    ]),
  );
  const raggedInferred = inferLayoutRules({
    pages: [raggedBuilt.page],
    styleLookup: raggedBuilt.styleLookup,
    breakpoint: 915,
  });
  check(
    "a refusal names its NODE now, not only its reason",
    raggedInferred.gridTrackRefusalNodes.length === 1 &&
      raggedInferred.gridTrackRefusalNodes[0]?.nodeId === "g" &&
      raggedInferred.gridTrackRefusalNodes[0]?.viewportId === "desktop" &&
      raggedInferred.gridTrackRefusalNodes[0]?.reason === "not-every-track-witnessed",
    JSON.stringify(raggedInferred.gridTrackRefusalNodes),
  );
  check(
    "…and carries the MEASURED px the frozen track list overhangs by, at its narrowest width",
    (() => {
      const record = raggedInferred.gridTrackRefusalNodes[0];
      if (record === undefined) return false;
      // frozen tracks + gaps, minus the container at the narrowest desktop width.
      const tracks = frozenTracksOf(THREE_COL_W, [1, 1, 1]);
      const forced =
        tracks.reduce((sum, track) => sum + track, 0) + SPAN_GAP_PX * (tracks.length - 1);
      const expected = Math.round((forced - THREE_COL_W[2]!) * 100) / 100;
      return (
        record.frozenExcessPx === expected &&
        record.atWidth === PROBE_WIDTHS[2] &&
        record.trackCount === 3 &&
        record.childCount === 2
      );
    })(),
    JSON.stringify(raggedInferred.gridTrackRefusalNodes[0]),
  );
}

// ---------------------------------------------------------------------------
// Part 11d — Task 28.7 B1: the residual freeze audit. REPORT ONLY.
// ---------------------------------------------------------------------------

/** The widths P7's audit evidence is indexed by. The middle one is its truth width. */
const AUDIT_WIDTHS = [1000, 1440, 1920];

function auditNode(
  nodeId: string,
  sourceW: number[],
  frozenValue: string,
  extra: Partial<ResidualAuditNode> = {},
): ResidualAuditNode {
  return {
    nodeId,
    tagName: "div",
    descendants: 0,
    sourceX: [0, 0, 0],
    sourceW,
    sourceV: [1, 1, 1],
    property: "width",
    family: "width",
    frozenValue,
    sourceSpreadPx: Math.max(...sourceW) - Math.min(...sourceW),
    ...extra,
  };
}

/**
 * One page × viewport of audit evidence over the P7 harness page.
 *
 * P7's exact tier freezes four widths at the truth viewport; this says what the
 * SOURCE did at 1000 / 1440 / 1920. Three of the four are frozen against a
 * source that moved, one of them overhangs the viewport at 1000, and one of
 * them overflows its own parent there — which is the whole spread of
 * consequences the audit has to be able to tell apart.
 */
const P7_AUDIT_PASS: ResidualAuditPass = {
  pageId: "p000007",
  viewportId: "desktop",
  widths: AUDIT_WIDTHS,
  nodes: [
    auditNode("p7root", [960, 1200, 1600], "1200px", {
      descendants: 3,
      refusalReason: "inline-size:no-branch-matched",
    }),
    auditNode("p7fit", [400, 500, 700], "500px", {
      parentNodeId: "p7root",
      parentSourceW: [960, 1200, 1600],
      descendants: 1,
    }),
    auditNode("p7over", [400, 700, 700], "700px", {
      parentNodeId: "p7fit",
      parentSourceW: [400, 500, 700],
    }),
    auditNode("p7calm", [290, 300, 310], "300px", {
      parentNodeId: "p7root",
      parentSourceW: [960, 1200, 1600],
      recoveredKind: "percentage-width",
    }),
  ],
};

/** A rule that is CORRECT at the truth viewport, so the audit has one to not reject. */
const P7_RULE: RecoveredLayoutRule = rule(
  "p000007",
  "p7calm",
  "percentage-width",
  { width: "25%" },
  { x: 0, w: 300 },
);

async function residualAuditChecks(): Promise<void> {
  section("Part 11d — B1: the residual freeze audit, measured and report-only");

  const audited = await verifyLayoutRules({
    rules: [P7_RULE],
    pages: HARNESS_PAGES,
    css: HARNESS_CSS,
    residualAudit: [P7_AUDIT_PASS],
    residualAuditNodesOmitted: 7,
  });

  check(
    "the audit ran, on its own evidence, at the probe widths that are not the truth width",
    audited.residual.status === "performed" &&
      audited.residual.passes === 1 &&
      audited.residual.widthsRendered === 2 &&
      audited.residual.widthsCapped === 0,
    JSON.stringify({ ...audited.residual, residuals: audited.residual.residuals.length }),
  );
  check(
    "…and it carries forward what INFERENCE's own bound dropped, rather than reading 0",
    audited.residual.nodesOmitted === 7 && audited.residual.nodesMeasured === 4,
    JSON.stringify(audited.residual.nodesOmitted),
  );

  const ids = audited.residual.residuals.map((record) => record.nodeId);
  check(
    "every node whose source moved and whose clone did not is a residual",
    ids.length === 4 && new Set(ids).size === 4,
    JSON.stringify(ids),
  );
  check(
    "…ranked offscreen first, then clipping, then pixel delta, then descendants",
    ids.join(",") === "p7root,p7over,p7fit,p7calm",
    JSON.stringify(ids),
  );

  const root = audited.residual.residuals.find((record) => record.nodeId === "p7root");
  check(
    "a frozen box that leaves a narrower viewport is tagged `offscreen`, with real numbers",
    root?.consequence === "offscreen" &&
      root.absoluteDeltaPx === 400 &&
      root.frozenValue === "1200px" &&
      root.family === "width" &&
      root.descendants === 3 &&
      root.viewportId === "desktop" &&
      root.refusalReason === "inline-size:no-branch-matched",
    JSON.stringify(root),
  );
  check(
    "…and it carries BOTH measured halves, width by width, so the finding can be re-checked",
    root !== undefined &&
      root.widths.join(",") === "1000,1440,1920" &&
      root.sourceW.join(",") === "960,1200,1600" &&
      root.cloneW.join(",") === "1200,1200,1200",
    JSON.stringify({ w: root?.widths, s: root?.sourceW, c: root?.cloneW }),
  );
  const over = audited.residual.residuals.find((record) => record.nodeId === "p7over");
  check(
    "a frozen box that overflows its own parent is tagged `clipping`, not `offscreen`",
    over?.consequence === "clipping" && over.absoluteDeltaPx === 300,
    JSON.stringify(over),
  );
  check(
    "a frozen box with neither consequence is still reported, and says so",
    audited.residual.residuals.find((record) => record.nodeId === "p7fit")?.consequence ===
      "neither" &&
      audited.residual.residuals.find((record) => record.nodeId === "p7calm")
        ?.consequence === "neither",
    JSON.stringify(audited.residual.consequenceHistogram),
  );
  check(
    "…and a node that DID recover a rule can still be a residual, which the record says",
    audited.residual.residuals.find((record) => record.nodeId === "p7calm")
      ?.recoveredKind === "percentage-width",
  );
  check(
    "the frozen-family histogram counts every detected residual, before any cut",
    JSON.stringify(audited.residual.familyHistogram) === JSON.stringify({ width: 4 }) &&
      JSON.stringify(audited.residual.consequenceHistogram) ===
        JSON.stringify({ clipping: 1, neither: 2, offscreen: 1 }),
    JSON.stringify(audited.residual.familyHistogram),
  );

  // --- REPORT ONLY. This is the invariant, not a nice-to-have. --------------
  check(
    "REPORT ONLY: the audit rejected nothing — the correct rule still ships",
    audited.rules.length === 1 &&
      audited.rules[0]?.nodeId === "p7calm" &&
      audited.counters.rejectedByTruthCheck === 0 &&
      audited.counters.rejectedUnverifiable === 0 &&
      audited.counters.rejectedByBandCheck === 0 &&
      audited.counters.acceptedRegressed === 0,
    JSON.stringify(audited.counters),
  );
  const unaudited = await verifyLayoutRules({
    rules: [P7_RULE],
    pages: HARNESS_PAGES,
    css: HARNESS_CSS,
  });
  check(
    "…and the SAME run without the evidence ships exactly the same rules",
    JSON.stringify(unaudited.rules) === JSON.stringify(audited.rules) &&
      unaudited.counters.rejectedUnverifiable === audited.counters.rejectedUnverifiable,
    JSON.stringify(unaudited.counters),
  );
  check(
    "…and records `no-candidates` rather than an implicit clean bill of health",
    unaudited.residual.status === "no-candidates" &&
      unaudited.residual.residuals.length === 0,
    JSON.stringify(unaudited.residual.status),
  );
  check(
    "a node whose CLONE moves with the source is not a residual",
    (
      await verifyLayoutRules({
        rules: [],
        pages: HARNESS_PAGES,
        css: HARNESS_CSS,
        // p7root's clone is a constant 1200; claim the source was constant too.
        residualAudit: [
          {
            ...P7_AUDIT_PASS,
            nodes: [auditNode("p7root", [1200, 1200, 1200], "1200px")],
          },
        ],
      })
    ).residual.residuals.length === 0,
  );

  // --- the width bound, as a unit ------------------------------------------
  check(
    "the audit's width bound keeps both extremes and spreads the rest",
    JSON.stringify(
      auditRenderWidths([1024, 1025, 1101, 1280, 1281, 1440, 1441, 1920], 1440, 4),
    ) === JSON.stringify({ widths: [1024, 1101, 1281, 1920], capped: 3 }),
    JSON.stringify(auditRenderWidths([1024, 1025, 1101, 1280, 1281, 1440, 1441, 1920], 1440, 4)),
  );
  check(
    "…and never renders the truth width twice",
    !auditRenderWidths([1000, 1440, 1920], 1440, 4).widths.includes(1440),
  );
}

// ---------------------------------------------------------------------------
// Task 28.7 G — the frozen width CHAIN ROOT that is an out-of-flow box
// ---------------------------------------------------------------------------

/**
 * Part 11e — the inset equation, read backwards, and every place it refuses.
 *
 * THE MEASURED FINDING THIS ANSWERS. The 28.7 B1 residual audit rendered the
 * clone at widths that are not 1440 for the first time and reported `width` as
 * 91.3% (linear.app) / 99.1% (hobbang.net) of the frozen residual. Its ranked
 * list then said the thing the histogram could not: most of the top residual is
 * DOWNSTREAM of a frozen ancestor — a `full-width` rule the truth check verified
 * still measures a constant clone width when the box it resolves against is
 * itself frozen at 1440px.
 *
 * An out-of-flow box is one such root, and the only one whose width the
 * parent-relative branches can never answer for: `containingBlockGuard()`
 * refuses `fixed-position` and `abs-containing-block-*` on principle, and is
 * right to. So the fixed header ships 1440px wide at 1025px and takes its whole
 * subtree with it.
 *
 * WHAT IS ASSERTED HERE IS THE EQUATION AND ITS REFUSALS, on fixtures that are
 * arithmetic on a width array — no site, no selector, no borrowed pixel:
 *
 *   * a `fixed` box and an `absolute` box with the SAME geometry and the SAME
 *     insets get DIFFERENT answers, because their containing blocks differ;
 *   * the containing block is the ancestor's PADDING box, and a fixture whose
 *     border makes the two boxes differ by 10px proves which one was used;
 *   * NEGATIVE CONTROL: a genuinely fixed-width out-of-flow box is refused;
 *   * NEGATIVE CONTROL: one definite inset is not enough;
 *   * the emitted rule is truth-checked by a real render like every other kind,
 *     and a wrong one is rejected by it.
 */
function insetResolvedChecks(): void {
  section("Part 11e — G: the out-of-flow inset equation, read backwards");

  const block: Props = { display: "block" };
  /** A shell with a 5px border and 30px padding per side, and a position. */
  const shellProps: Props = {
    display: "block",
    position: "relative",
    "border-left": "5px solid rgb(0, 0, 0)",
    "border-right": "5px solid rgb(0, 0, 0)",
    "padding-left": "30px",
    "padding-right": "30px",
    "box-sizing": "border-box",
  };
  /** The shell's PADDING box: its border box minus its two borders. */
  const shellPadding = SHELL_W.map((width) => width - 10);
  const outOfFlow = (position: string, left: string, right: string): Props => ({
    display: "block",
    position,
    left,
    right,
    "margin-left": "0px",
    "margin-right": "0px",
    "box-sizing": "border-box",
  });

  const nodes: FixtureNode[] = [
    { nodeId: "n001", tagName: "html", w: [...PROBE_WIDTHS], props: block },
    { nodeId: "n002", tagName: "body", parentNodeId: "n001", w: [...PROBE_WIDTHS], props: block },
    { nodeId: "shell", tagName: "div", parentNodeId: "n002", w: [...SHELL_W], props: shellProps },
    /*
     * A fixed bar. `position: relative` on the shell does NOT capture a fixed
     * box, so its containing block is the VIEWPORT and its width is the probe's
     * own width list.
     */
    {
      nodeId: "fixedbar",
      tagName: "header",
      parentNodeId: "shell",
      w: [...PROBE_WIDTHS],
      props: outOfFlow("fixed", "0px", "0px"),
    },
    /*
     * THE DISCRIMINATING TWIN. Identical geometry, identical insets — but
     * `absolute` IS captured by the relative shell, so the same numbers describe
     * a box 90px wider than its containing block and the equation fails.
     */
    {
      nodeId: "absbar",
      tagName: "div",
      parentNodeId: "shell",
      w: [...PROBE_WIDTHS],
      props: outOfFlow("absolute", "0px", "0px"),
    },
    /*
     * Solved against the shell's PADDING box. Using the border box instead would
     * be 10px out — five times FULL_WIDTH_TOLERANCE_PX — so this fixture says
     * which box the implementation read.
     */
    {
      nodeId: "insetbox",
      tagName: "div",
      parentNodeId: "shell",
      w: shellPadding.map((width) => width - 40),
      props: outOfFlow("absolute", "20px", "20px"),
    },
    /* NEGATIVE CONTROL: an authored, over-constrained width. CSS drops `right`. */
    {
      nodeId: "authored",
      tagName: "div",
      parentNodeId: "shell",
      w: PROBE_WIDTHS.map(() => 600),
      props: outOfFlow("absolute", "20px", "20px"),
    },
    /* NEGATIVE CONTROL: one inset only, so `auto` is shrink-to-fit, not solved. */
    {
      nodeId: "oneinset",
      tagName: "div",
      parentNodeId: "shell",
      w: shellPadding.map((width) => width - 20),
      props: outOfFlow("absolute", "20px", "auto"),
    },
  ];
  const built = buildPage(nodes);
  const result = inferLayoutRules({
    pages: [built.page],
    styleLookup: built.styleLookup,
    breakpoint: 1024,
  });
  const ruleFor = (nodeId: string): RecoveredLayoutRule | undefined =>
    result.rules.find((entry) => entry.nodeId === nodeId);
  const counters = result.counters;

  // --- PRE-FIX REPRODUCTION -------------------------------------------------
  const shellSpec = built.specNodes.get("shell")!;
  check(
    "PRE-FIX REPRODUCTION: the containing-block guard refuses a fixed box outright",
    containingBlockGuard(
      built.specNodes.get("fixedbar")!,
      shellSpec,
      built.styleLookup,
    ) === "fixed-position",
  );
  check(
    "…and an absolutely positioned one inside a PADDED positioned parent too",
    containingBlockGuard(
      built.specNodes.get("insetbox")!,
      shellSpec,
      built.styleLookup,
    ) === "abs-containing-block-is-padding-box",
  );
  check(
    "…and it is still refused, because this branch relaxes NO guard",
    containingBlockGuard(
      built.specNodes.get("absbar")!,
      shellSpec,
      built.styleLookup,
    ) === "abs-containing-block-is-padding-box",
  );

  // --- what the equation emits ---------------------------------------------
  check(
    "a fixed box with two definite insets is restated as `width: auto`",
    ruleFor("fixedbar")?.kind === "inset-resolved-width" &&
      ruleFor("fixedbar")?.declarations["width"] === "auto",
    JSON.stringify(ruleFor("fixedbar")),
  );
  check(
    "…and its evidence names the VIEWPORT as the box it was solved against",
    (ruleFor("fixedbar")?.evidence ?? []).some((line) =>
      line.startsWith("containing block: viewport"),
    ),
    JSON.stringify(ruleFor("fixedbar")?.evidence),
  );
  check(
    "an absolute box inside a padded positioned ancestor is restated too",
    ruleFor("insetbox")?.kind === "inset-resolved-width" &&
      ruleFor("insetbox")?.declarations["width"] === "auto",
    JSON.stringify(ruleFor("insetbox")),
  );
  check(
    "…solved against the ancestor's PADDING box, which its evidence names",
    (ruleFor("insetbox")?.evidence ?? []).some(
      (line) => line === "containing block: padding box of shell",
    ),
    JSON.stringify(ruleFor("insetbox")?.evidence),
  );
  check(
    "…and the padding box is the BORDER box minus the border, not the border box",
    (() => {
      const widest = SHELL_W[SHELL_W.length - 1]!;
      const line = (ruleFor("insetbox")?.evidence ?? []).find((entry) =>
        entry.startsWith(`${PROBE_WIDTHS[PROBE_WIDTHS.length - 1]!}px:`),
      );
      return line !== undefined && line.endsWith(`= ${widest - 10} containing block`);
    })(),
    JSON.stringify(ruleFor("insetbox")?.evidence),
  );

  // --- the twin, and every refusal -----------------------------------------
  check(
    "THE DISCRIMINATING TWIN: the same geometry with `absolute` is REFUSED",
    ruleFor("absbar") === undefined &&
      (counters.insetResolvedRefusalsByReason["identity-fails"] ?? 0) >= 1,
    JSON.stringify(counters.insetResolvedRefusalsByReason),
  );
  check(
    "NEGATIVE CONTROL: an out-of-flow box whose width does NOT move is refused",
    ruleFor("authored") === undefined &&
      counters.insetResolvedRefusalsByReason["width-constant"] === 1,
    JSON.stringify(counters.insetResolvedRefusalsByReason),
  );
  check(
    "…and that refusal is what separates a used value from an AUTHORED width",
    (() => {
      const authored = nodes.find((node) => node.nodeId === "authored")!;
      return Math.max(...authored.w) - Math.min(...authored.w) === 0;
    })(),
  );
  check(
    "NEGATIVE CONTROL: one definite inset is not a solved width",
    ruleFor("oneinset") === undefined &&
      counters.insetResolvedRefusalsByReason["inset-not-definite"] === 1,
    JSON.stringify(counters.insetResolvedRefusalsByReason),
  );
  check(
    "the emitted count is the number of rules, and refusals are the rest",
    counters.insetResolvedWidth === 2 &&
      result.rules.filter((entry) => entry.kind === "inset-resolved-width").length === 2,
    `${counters.insetResolvedWidth} emitted, ${JSON.stringify(counters.insetResolvedRefusalsByReason)}`,
  );

  // --- the funnel still adds up --------------------------------------------
  const sumOf = (record: Record<string, number>): number =>
    Object.values(record).reduce((total, value) => total + value, 0);
  check(
    "every candidate still leaves through exactly ONE outcome, new kind included",
    sumOf(counters.inlineSizeOutcomes) === counters.inlineSizeCandidates &&
      counters.inlineSizeOutcomeDoubleCounts === 0 &&
      (counters.inlineSizeOutcomes["emitted-inset-resolved-width"] ?? 0) === 2,
    JSON.stringify(counters.inlineSizeOutcomes),
  );
  check(
    "…and the new outcome is a member of the declared partition",
    INLINE_SIZE_OUTCOMES.includes("emitted-inset-resolved-width"),
  );

  // --- it never competes with a branch that would have shipped -------------
  const plainNodes: FixtureNode[] = [
    { nodeId: "n001", tagName: "html", w: [...PROBE_WIDTHS], props: block },
    { nodeId: "n002", tagName: "body", parentNodeId: "n001", w: [...PROBE_WIDTHS], props: block },
    {
      nodeId: "plainshell",
      tagName: "div",
      parentNodeId: "n002",
      w: [...SHELL_W],
      props: { display: "block", position: "relative" },
    },
    /*
     * Zero padding, zero border, both insets 0: the guard passes, so the
     * ordinary full-width branch owns this node and must keep owning it.
     */
    {
      nodeId: "plainabs",
      tagName: "div",
      parentNodeId: "plainshell",
      w: [...SHELL_W],
      props: outOfFlow("absolute", "0px", "0px"),
    },
  ];
  const plain = buildPage(plainNodes);
  const plainResult = inferLayoutRules({
    pages: [plain.page],
    styleLookup: plain.styleLookup,
    breakpoint: 1024,
  });
  check(
    "a node the ordinary branches CAN answer for keeps its existing rule",
    plainResult.rules.find((entry) => entry.nodeId === "plainabs")?.kind ===
      "full-width" &&
      (plainResult.counters.insetResolvedWidth ?? 0) === 0,
    JSON.stringify(plainResult.rules.map((entry) => [entry.nodeId, entry.kind])),
  );
}

/** Part 11f — the new kind is verified by a real render, like every other. */
async function insetResolvedTruthCheckChecks(): Promise<void> {
  section("Part 11f — G: the inset restatement is truth-checked, not exempted");

  const solved = rule(
    "p000008",
    "p8solved",
    "inset-resolved-width",
    { width: "auto" },
    { x: 25, w: 1150 },
  );
  const good = await verifyLayoutRules({
    rules: [solved],
    pages: HARNESS_PAGES,
    css: HARNESS_CSS,
  });
  check(
    "a correct inset restatement ships, having been RENDERED — never exempted",
    good.rules.length === 1 &&
      good.counters.truthCheckable === 1 &&
      good.counters.acceptedUnchecked === 0 &&
      good.counters.acceptedRegressed === 0 &&
      good.counters.rejectedByTruthCheck === 0,
    JSON.stringify(good.counters),
  );

  /*
   * The same restatement on the box whose 600px width the AUTHOR wrote. CSS
   * drops `right` on an over-constrained box, so `auto` re-solves it to the full
   * 1150px containing block: 550px of fabrication, caught by the render.
   */
  const overConstrained = rule(
    "p000008",
    "p8authored",
    "inset-resolved-width",
    { width: "auto" },
    { x: 25, w: 600 },
  );
  const bad = await verifyLayoutRules({
    rules: [overConstrained],
    pages: HARNESS_PAGES,
    css: HARNESS_CSS,
  });
  check(
    "…and one that re-solves an AUTHORED width is rejected by the same render",
    bad.rules.length === 0 && bad.counters.rejectedByTruthCheck === 1,
    JSON.stringify(bad.counters),
  );
  check(
    "…by exactly the 550px the dropped `right` inset accounts for",
    Math.abs((bad.rejections[0]?.rendered.w ?? 0) - 1150) <= 1 &&
      bad.rejections[0]?.observed.w === 600,
    JSON.stringify(bad.rejections),
  );
}



// ---------------------------------------------------------------------------

/**
 * Part 11g — the IN-FLOW chain root: a gap that stays constant while the parent
 * grows, and the two negative controls that make that evidence rather than a
 * coincidence.
 *
 * THE MEASURED FINDING THIS ANSWERS. Task 28.75 walked `parentNodeId` upward
 * from every residual the clone actually renders frozen, on four canary corpora,
 * and grouped the residuals under the earliest ancestor that is itself frozen.
 * The largest chain-root class on all four is neither out-of-flow nor a grid
 * container: it is an ordinary in-flow block box — 1,254 of linear.app's 2,101
 * residual nodes, 211 of gs.severance's 217, 832 of seoultone.kr's 2,305, 653 of
 * hobbang.net's 2,304. Its shape is always the same: the box fills its parent's
 * content box, and the parent's authored padding CHANGES at breakpoints, so
 * `contentAt()` — one padding number read at the truth viewport — cannot see the
 * fill at any other width, and the box ships `width: 1344px` inside a 641px
 * viewport with 156 residual descendants under it.
 *
 * WHAT IS ASSERTED HERE, on fixtures that are arithmetic on a width array:
 *
 *   * a box whose gap to its parent is constant across REAL parent growth, in
 *     two authored bands, is restated as `width: auto`;
 *   * THE DISCRIMINATING TWIN: a box with the SAME constant-gap, one-for-one
 *     tracking geometry whose gap is NOT the box model (`calc(100% - 200px)`)
 *     gets the OPPOSITE answer — geometry alone cannot separate the two, and
 *     this is the measurement that does;
 *   * NEGATIVE CONTROL: a percentage box, whose gap slides continuously, is
 *     refused because no run of it is witnessed by parent growth;
 *   * NEGATIVE CONTROL: a genuinely fixed-width box is refused;
 *   * NEGATIVE CONTROL: a grid item is refused by the module's OWN existing
 *     stretch discriminator, not by anything new;
 *   * a node the ordinary branches CAN answer for keeps its existing rule.
 */
function trackedFillChecks(): void {
  section("Part 11g — 28.75: the in-flow chain root, from a constant gap");

  /*
   * A denser desktop axis: two authored bands ABOVE the breakpoint, each with
   * real parent growth inside it. Three desktop samples cannot express that.
   */
  const WIDTHS = [390, 768, 1024, 1100, 1200, 1440, 1920];
  const DESKTOP = [1024, 1100, 1200, 1440, 1920];
  const block: Props = { display: "block" };
  /** A shell that IS the viewport, padded 46px per side at the truth width. */
  const shellProps: Props = {
    display: "block",
    "padding-left": "46px",
    "padding-right": "46px",
    "box-sizing": "border-box",
  };
  const shellW = [...WIDTHS];
  /** The observed fill: padding 10px per side below 1281, 46px at and above. */
  const bandedPadding = (viewport: number): number => (viewport >= 1281 ? 92 : 20);
  const zeroMargins: Props = { display: "block", "margin-left": "0px", "margin-right": "0px" };

  const nodes: FixtureNode[] = [
    { nodeId: "n001", tagName: "html", w: [...WIDTHS], props: block },
    { nodeId: "n002", tagName: "body", parentNodeId: "n001", w: [...WIDTHS], props: block },
    { nodeId: "shell", tagName: "div", parentNodeId: "n002", w: shellW, props: shellProps },
    /*
     * THE POPULATION. Fills the shell's content box at every width; the shell's
     * padding is 10px per side below 1281 and 46px above, so the gap is 20 in
     * one band and 92 in the other and NEITHER equals the other.
     */
    {
      nodeId: "banded",
      tagName: "section",
      parentNodeId: "shell",
      w: WIDTHS.map((width) => width - bandedPadding(width)),
      props: zeroMargins,
    },
    /*
     * THE DISCRIMINATING TWIN. Same one-for-one tracking, same constant gap,
     * WITNESSED across 896px of parent growth — the geometry this branch exists
     * to recognise. But the gap is 200px and the shell's padding plus this
     * node's margins are 92px, so `width: auto` would render it 108px too wide.
     * `calc(100% - 200px)` has exactly this signature.
     */
    {
      nodeId: "calcbox",
      tagName: "div",
      parentNodeId: "shell",
      w: WIDTHS.map((width) => width - 200),
      props: zeroMargins,
    },
    /* NEGATIVE CONTROL: a constant fraction of the parent. The gap slides. */
    {
      nodeId: "pct",
      tagName: "div",
      parentNodeId: "shell",
      w: WIDTHS.map((width) => Math.round(width * 0.9 * 100) / 100),
      props: zeroMargins,
    },
    /* NEGATIVE CONTROL: an authored, genuinely fixed width. */
    {
      nodeId: "fixed",
      tagName: "div",
      parentNodeId: "shell",
      w: WIDTHS.map(() => 600),
      props: zeroMargins,
    },
  ];
  const built = buildPage(nodes, undefined, WIDTHS);
  const result = inferLayoutRules({
    pages: [built.page],
    styleLookup: built.styleLookup,
    breakpoint: 1024,
  });
  const ruleFor = (nodeId: string): RecoveredLayoutRule | undefined =>
    result.rules.find((entry) => entry.nodeId === nodeId);
  const counters = result.counters;

  // --- PRE-FIX REPRODUCTION -------------------------------------------------
  check(
    "PRE-FIX REPRODUCTION: the banded fill does NOT match the derived content box",
    (() => {
      // `contentAt()` subtracts ONE padding, read at the truth viewport: 92.
      const observed = DESKTOP.map((width) => width - bandedPadding(width));
      const derived = DESKTOP.map((width) => width - 92);
      return observed.some((value, i) => Math.abs(value - derived[i]!) > FULL_WIDTH_TOLERANCE_PX);
    })(),
  );
  check(
    "PRE-FIX REPRODUCTION: …and it is not a constant fraction of it either",
    (() => {
      const ratios = DESKTOP.map((width) => (width - bandedPadding(width)) / (width - 92));
      return Math.max(...ratios) - Math.min(...ratios) > 0.01;
    })(),
  );

  // --- what the branch emits -----------------------------------------------
  check(
    "a banded fill is restated as `width: auto`",
    ruleFor("banded")?.kind === "tracked-fill-width" &&
      ruleFor("banded")?.declarations["width"] === "auto",
    JSON.stringify(ruleFor("banded")),
  );
  check(
    "…and its evidence names BOTH constant-gap runs, with the parent growth each spans",
    (() => {
      const evidence = ruleFor("banded")?.evidence ?? [];
      return (
        evidence.some((line) => line.includes("gap constant at 20px over 176px")) &&
        evidence.some((line) => line.includes("gap constant at 92px over 480px"))
      );
    })(),
    JSON.stringify(ruleFor("banded")?.evidence),
  );
  check(
    "…and it names the box-model decomposition it checked at the truth width",
    (ruleFor("banded")?.evidence ?? []).some((line) =>
      line.startsWith("truth-width gap 92px = parent padding 92 + parent border 0 + own margins"),
    ),
    JSON.stringify(ruleFor("banded")?.evidence),
  );

  // --- the twin, and the controls ------------------------------------------
  check(
    "THE DISCRIMINATING TWIN: identical tracking with a NON box-model gap is REFUSED",
    ruleFor("calcbox") === undefined &&
      (counters.trackedFillRefusalsByReason["gap-not-box-model"] ?? 0) === 1,
    JSON.stringify(counters.trackedFillRefusalsByReason),
  );
  check(
    "…and the twin's geometry really is the one the branch accepts: constant gap, witnessed",
    (() => {
      const gaps = DESKTOP.map((width) => width - (width - 200));
      return (
        Math.max(...gaps) - Math.min(...gaps) === 0 &&
        DESKTOP[DESKTOP.length - 1]! - DESKTOP[0]! >= 40
      );
    })(),
  );
  check(
    "NEGATIVE CONTROL: a constant FRACTION of the parent is refused — its gap slides",
    ruleFor("pct") === undefined &&
      (counters.trackedFillRefusalsByReason["gap-run-unwitnessed"] ?? 0) >= 1,
    JSON.stringify(counters.trackedFillRefusalsByReason),
  );
  check(
    "NEGATIVE CONTROL: a genuinely fixed-width box is refused",
    ruleFor("fixed") === undefined &&
      (counters.trackedFillRefusalsByReason["width-constant"] ?? 0) >= 1,
    JSON.stringify(counters.trackedFillRefusalsByReason),
  );
  check(
    "the emitted count is the number of rules of the new kind",
    counters.trackedFillWidth === 1 &&
      result.rules.filter((entry) => entry.kind === "tracked-fill-width").length === 1,
    `${counters.trackedFillWidth} emitted, ${JSON.stringify(counters.trackedFillRefusalsByReason)}`,
  );
  check(
    "…and every refusal reason recorded is a declared member",
    Object.keys(counters.trackedFillRefusalsByReason).every((reason) =>
      (TRACKED_FILL_REFUSAL_REASONS as readonly string[]).includes(reason),
    ),
    JSON.stringify(Object.keys(counters.trackedFillRefusalsByReason)),
  );

  // --- the guard the branch does NOT relax ---------------------------------
  const gridNodes: FixtureNode[] = [
    { nodeId: "n001", tagName: "html", w: [...WIDTHS], props: block },
    { nodeId: "n002", tagName: "body", parentNodeId: "n001", w: [...WIDTHS], props: block },
    {
      nodeId: "gridshell",
      tagName: "div",
      parentNodeId: "n002",
      w: shellW,
      props: { ...shellProps, display: "grid", "grid-template-columns": "1fr" },
    },
    {
      nodeId: "griditem",
      tagName: "div",
      parentNodeId: "gridshell",
      w: WIDTHS.map((width) => width - bandedPadding(width)),
      props: zeroMargins,
    },
  ];
  const gridBuilt = buildPage(gridNodes, undefined, WIDTHS);
  const gridResult = inferLayoutRules({
    pages: [gridBuilt.page],
    styleLookup: gridBuilt.styleLookup,
    breakpoint: 1024,
  });
  check(
    "NEGATIVE CONTROL: a grid item with the same geometry is refused, by the module's OWN discriminator",
    gridResult.rules.find((entry) => entry.nodeId === "griditem") === undefined &&
      (gridResult.counters.trackedFillRefusalsByReason["auto-does-not-stretch"] ?? 0) >= 1,
    JSON.stringify(gridResult.counters.trackedFillRefusalsByReason),
  );
  check(
    "…and `containingBlockGuard()` still returns `grid-item` for it, byte-for-byte unchanged",
    containingBlockGuard(
      gridBuilt.specNodes.get("griditem")!,
      gridBuilt.specNodes.get("gridshell")!,
      gridBuilt.styleLookup,
    ) === "grid-item",
  );

  // --- it never competes with a branch that would have shipped -------------
  const plainNodes: FixtureNode[] = [
    { nodeId: "n001", tagName: "html", w: [...WIDTHS], props: block },
    { nodeId: "n002", tagName: "body", parentNodeId: "n001", w: [...WIDTHS], props: block },
    { nodeId: "plainshell", tagName: "div", parentNodeId: "n002", w: shellW, props: shellProps },
    /* Constant padding at EVERY width: the ordinary full-width branch owns it. */
    {
      nodeId: "plainfill",
      tagName: "div",
      parentNodeId: "plainshell",
      w: WIDTHS.map((width) => width - 92),
      props: zeroMargins,
    },
  ];
  const plain = buildPage(plainNodes, undefined, WIDTHS);
  const plainResult = inferLayoutRules({
    pages: [plain.page],
    styleLookup: plain.styleLookup,
    breakpoint: 1024,
  });
  check(
    "a node the ordinary branches CAN answer for keeps its existing rule",
    plainResult.rules.find((entry) => entry.nodeId === "plainfill")?.kind === "full-width" &&
      plainResult.counters.trackedFillWidth === 0,
    JSON.stringify(plainResult.rules.map((entry) => [entry.nodeId, entry.kind])),
  );

  // --- the funnel still adds up --------------------------------------------
  const sumOf = (record: Record<string, number>): number =>
    Object.values(record).reduce((total, value) => total + value, 0);
  check(
    "every candidate still leaves through exactly ONE outcome, new kind included",
    sumOf(counters.inlineSizeOutcomes) === counters.inlineSizeCandidates &&
      counters.inlineSizeOutcomeDoubleCounts === 0 &&
      (counters.inlineSizeOutcomes["emitted-tracked-fill-width"] ?? 0) === 1,
    JSON.stringify(counters.inlineSizeOutcomes),
  );
  check(
    "…and the new outcome is a member of the declared partition",
    INLINE_SIZE_OUTCOMES.includes("emitted-tracked-fill-width"),
  );
}

// ---------------------------------------------------------------------------

/**
 * Part 11h — the IN-FLOW FULL-BLEED chain root, co-emitted rather than
 * half-stated.
 *
 * WHY THE WHOLE SET. Task 28.7 worked out the one-declaration version of this —
 * emit `width: 100vw` and leave the exact tier's frozen `margin-left: -720px`
 * and `left: 672px` in place — and DECLINED it with arithmetic: at a 1920px
 * viewport that box renders `240 → 2160`, a NEW 240px overhang where the frozen
 * 1440px box had none. That argument is against emitting one declaration, not
 * against the pattern. This branch co-emits `width`, both inline margins, `left`
 * and `right`, so the same 1920px case renders `0 → 1920`.
 *
 * WHAT IS ASSERTED, on arithmetic over a width array:
 *
 *   * a band observed to be exactly the viewport, at viewport x = 0, at every
 *     displayed width, inside a centred parent, gets the whole declaration set;
 *   * THE DISCRIMINATING TWIN: the same box inside a parent that is NOT centred
 *     is refused — the margin equation's only assumption, measured;
 *   * NEGATIVE CONTROL: a decorative bleed that overhangs by 20px per side is
 *     refused, because it is not the viewport;
 *   * NEGATIVE CONTROL: a box frozen at 1440px that never moves is refused;
 *   * the 1920px arithmetic 28.7 declined the one-declaration version over is
 *     asserted as a number, not as prose.
 */
function viewportBleedChecks(): void {
  section("Part 11h — 28.75: the in-flow full-bleed band, co-emitted");

  const WIDTHS = [390, 768, 1024, 1100, 1200, 1440, 1920];
  const DESKTOP = [1024, 1100, 1200, 1440, 1920];
  const block: Props = { display: "block" };
  /** A centred column capped at 1200px, padded 24px per side. */
  const columnW = WIDTHS.map((width) => Math.min(width, 1200));
  const centredX = WIDTHS.map((width, i) => Math.round((width - columnW[i]!) / 2));
  const columnProps: Props = {
    display: "block",
    "padding-left": "24px",
    "padding-right": "24px",
    "box-sizing": "border-box",
    "margin-left": "auto",
    "margin-right": "auto",
  };
  const bleedProps: Props = {
    display: "block",
    position: "relative",
    width: "1440px",
    "margin-left": "-720px",
    "margin-right": "-720px",
    left: "672px",
    right: "672px",
    "box-sizing": "border-box",
  };

  const nodes: FixtureNode[] = [
    { nodeId: "n001", tagName: "html", w: [...WIDTHS], props: block },
    { nodeId: "n002", tagName: "body", parentNodeId: "n001", w: [...WIDTHS], props: block },
    {
      nodeId: "column",
      tagName: "div",
      parentNodeId: "n002",
      w: columnW,
      x: centredX,
      props: columnProps,
    },
    /* THE POPULATION: exactly the viewport, at viewport x = 0, everywhere. */
    {
      nodeId: "bleed",
      tagName: "section",
      parentNodeId: "column",
      w: [...WIDTHS],
      x: WIDTHS.map(() => 0),
      props: bleedProps,
    },
    /* NEGATIVE CONTROL: a decorative overhang, 20px past the viewport per side. */
    {
      nodeId: "decor",
      tagName: "div",
      parentNodeId: "column",
      w: WIDTHS.map((width) => width + 40),
      x: WIDTHS.map(() => -20),
      props: bleedProps,
    },
    /* NEGATIVE CONTROL: the frozen box itself — 1440px at every width. */
    {
      nodeId: "frozen",
      tagName: "div",
      parentNodeId: "column",
      w: WIDTHS.map(() => 1440),
      x: WIDTHS.map(() => 0),
      props: bleedProps,
    },
  ];
  const built = buildPage(nodes, undefined, WIDTHS);
  const result = inferLayoutRules({
    pages: [built.page],
    styleLookup: built.styleLookup,
    breakpoint: 1024,
  });
  const ruleFor = (nodeId: string): RecoveredLayoutRule | undefined =>
    result.rules.find((entry) => entry.nodeId === nodeId);
  const counters = result.counters;

  // --- PRE-FIX REPRODUCTION -------------------------------------------------
  check(
    "PRE-FIX REPRODUCTION: 28.7's one-declaration version overhangs the viewport at 1920",
    (() => {
      /*
       * `width: 100vw` alone, with the exact tier's frozen `left: 672px` and
       * `margin-left: -720px` still in place: x = parentContentLeft + left +
       * margin-left, and the box then runs to x + 1920. On this fixture that is
       * 336 … 2256 — a NEW 336px overhang where the frozen 1440px box had none.
       * It is the same defect 28.7 measured as 240px on linear.app's own
       * geometry, which is why that experiment declined the one-declaration form.
       */
      const parentContentLeft = centredX[WIDTHS.indexOf(1920)]! + 24;
      const x = parentContentLeft + 672 - 720;
      return x === 336 && x + 1920 - 1920 === 336;
    })(),
  );
  check(
    "…and the co-emitted set puts the same box at 0 … 1920 instead",
    (() => {
      const i = WIDTHS.indexOf(1920);
      const parentContent = columnW[i]! - 48;
      const parentContentLeft = centredX[i]! + 24;
      // margin-left: calc(50% - 50vw), left: 0
      const x = parentContentLeft + (parentContent / 2 - 1920 / 2);
      return x === 0;
    })(),
  );

  // --- what the branch emits -----------------------------------------------
  const bleedRule = ruleFor("bleed");
  check(
    "a full-bleed band gets the WHOLE declaration set, not one declaration",
    bleedRule?.kind === "viewport-bleed-width" &&
      bleedRule.declarations["width"] === "100vw" &&
      bleedRule.declarations["margin-left"] === "calc(50% - 50vw)" &&
      bleedRule.declarations["margin-right"] === "calc(50% - 50vw)" &&
      bleedRule.declarations["left"] === "0px" &&
      bleedRule.declarations["right"] === "auto",
    JSON.stringify(bleedRule?.declarations),
  );
  check(
    "…and the frozen values it replaces are named in the evidence",
    (bleedRule?.evidence ?? []).some(
      (line) => line.includes("margin-inline -720px/-720px") && line.includes("left 672px"),
    ),
    JSON.stringify(bleedRule?.evidence),
  );
  check(
    "…and the parent-centred measurement is on the evidence at every width",
    DESKTOP.every((width) =>
      (bleedRule?.evidence ?? []).some((line) => line.startsWith(`${width}px: box 0 … ${width}`)),
    ),
    JSON.stringify(bleedRule?.evidence),
  );

  // --- the controls ---------------------------------------------------------
  check(
    "NEGATIVE CONTROL: a decorative bleed that overhangs the viewport is refused",
    ruleFor("decor") === undefined &&
      (counters.viewportBleedRefusalsByReason["not-viewport-wide"] ?? 0) >= 1,
    JSON.stringify(counters.viewportBleedRefusalsByReason),
  );
  check(
    "NEGATIVE CONTROL: a box frozen at 1440px that never moves is refused",
    ruleFor("frozen") === undefined &&
      (counters.viewportBleedRefusalsByReason["width-constant"] ?? 0) >= 1,
    JSON.stringify(counters.viewportBleedRefusalsByReason),
  );
  check(
    "the emitted count is the number of rules of the new kind",
    counters.viewportBleedWidth === 1 &&
      result.rules.filter((entry) => entry.kind === "viewport-bleed-width").length === 1,
    `${counters.viewportBleedWidth} emitted, ${JSON.stringify(counters.viewportBleedRefusalsByReason)}`,
  );
  check(
    "…and every refusal reason recorded is a declared member",
    Object.keys(counters.viewportBleedRefusalsByReason).every((reason) =>
      (VIEWPORT_BLEED_REFUSAL_REASONS as readonly string[]).includes(reason),
    ),
    JSON.stringify(Object.keys(counters.viewportBleedRefusalsByReason)),
  );

  // --- THE DISCRIMINATING TWIN ---------------------------------------------
  const offNodes: FixtureNode[] = nodes.map((node) =>
    node.nodeId === "column" ? { ...node, x: WIDTHS.map(() => 0) } : node,
  );
  const offBuilt = buildPage(offNodes, undefined, WIDTHS);
  const offResult = inferLayoutRules({
    pages: [offBuilt.page],
    styleLookup: offBuilt.styleLookup,
    breakpoint: 1024,
  });
  check(
    "THE DISCRIMINATING TWIN: the same band inside a LEFT-ALIGNED parent is refused",
    offResult.rules.find((entry) => entry.nodeId === "bleed") === undefined &&
      (offResult.counters.viewportBleedRefusalsByReason["parent-not-centred"] ?? 0) >= 1,
    JSON.stringify(offResult.counters.viewportBleedRefusalsByReason),
  );
  check(
    "…and that matters because `calc(50% - 50vw)` would have placed it 360px off at 1920",
    (() => {
      const i = WIDTHS.indexOf(1920);
      const parentContent = columnW[i]! - 48;
      const x = 0 + 24 + (parentContent / 2 - 1920 / 2);
      return Math.round(x) === -360;
    })(),
  );

  // --- the funnel still adds up --------------------------------------------
  const sumOf = (record: Record<string, number>): number =>
    Object.values(record).reduce((total, value) => total + value, 0);
  check(
    "every candidate still leaves through exactly ONE outcome, both new kinds included",
    sumOf(counters.inlineSizeOutcomes) === counters.inlineSizeCandidates &&
      counters.inlineSizeOutcomeDoubleCounts === 0 &&
      (counters.inlineSizeOutcomes["emitted-viewport-bleed-width"] ?? 0) === 1,
    JSON.stringify(counters.inlineSizeOutcomes),
  );
  check(
    "…and the new outcome is a member of the declared partition",
    INLINE_SIZE_OUTCOMES.includes("emitted-viewport-bleed-width"),
  );
}

// ---------------------------------------------------------------------------

/** Part 11i — both new kinds are verified by a real render, like every other. */
async function trackedFillTruthCheckChecks(): Promise<void> {
  section("Part 11i — 28.75: the new kinds are truth-checked, not exempted");

  /*
   * `.p9-shell` is a 1200px column centred in the 1440px truth viewport with
   * 46px of padding per side, so its content box is 166 … 1274.
   */
  const fill = rule(
    "p000009",
    "p9fill",
    "tracked-fill-width",
    { width: "auto" },
    { x: 166, w: 1108 },
  );
  const goodFill = await verifyLayoutRules({
    rules: [fill],
    pages: HARNESS_PAGES,
    css: HARNESS_CSS,
  });
  check(
    "a correct `tracked-fill-width` ships, having been RENDERED — never exempted",
    goodFill.rules.length === 1 &&
      goodFill.counters.truthCheckable === 1 &&
      goodFill.counters.acceptedUnchecked === 0 &&
      goodFill.counters.acceptedRegressed === 0 &&
      goodFill.counters.rejectedByTruthCheck === 0,
    JSON.stringify(goodFill.counters),
  );

  const bleed = rule(
    "p000009",
    "p9bleed",
    "viewport-bleed-width",
    {
      width: "100vw",
      "margin-left": "calc(50% - 50vw)",
      "margin-right": "calc(50% - 50vw)",
      left: "0px",
      right: "auto",
    },
    { x: 0, w: 1440 },
  );
  const goodBleed = await verifyLayoutRules({
    rules: [bleed],
    pages: HARNESS_PAGES,
    css: HARNESS_CSS,
  });
  check(
    "…and so does a correct `viewport-bleed-width`, whose frozen box renders at 118 … 1558",
    goodBleed.rules.length === 1 &&
      goodBleed.counters.rejectedByTruthCheck === 0 &&
      goodBleed.counters.acceptedRegressed === 0,
    JSON.stringify(goodBleed.counters),
  );

  /*
   * The bleed set applied to the box that is NOT a bleed. It renders the full
   * 1440px viewport where the observation says 1108px at x = 166: 332px of
   * fabrication, caught by the render rather than by any predicate.
   */
  const wrong = rule(
    "p000009",
    "p9fill",
    "viewport-bleed-width",
    {
      width: "100vw",
      "margin-left": "calc(50% - 50vw)",
      "margin-right": "calc(50% - 50vw)",
      left: "0px",
      right: "auto",
    },
    { x: 166, w: 1108 },
  );
  const bad = await verifyLayoutRules({
    rules: [wrong],
    pages: HARNESS_PAGES,
    css: HARNESS_CSS,
  });
  check(
    "…and a bleed set on a box that is NOT a bleed is rejected by the same render",
    bad.rules.length === 0 && bad.counters.rejectedByTruthCheck === 1,
    JSON.stringify(bad.counters),
  );
  check(
    "…by exactly the 332px the viewport-wide restatement accounts for",
    Math.abs((bad.rejections[0]?.rendered.w ?? 0) - 1440) <= 1 &&
      bad.rejections[0]?.observed.w === 1108,
    JSON.stringify(bad.rejections),
  );
}


// ---------------------------------------------------------------------------

/**
 * Part 11j — the document CANVAS background, re-homed rather than dropped.
 *
 * THE MEASURED DEFECT. CSS 2.1 §14.2 / css-backgrounds §2.11.2: the ROOT
 * element's background paints the document canvas, and when the root has none
 * the BODY's is used instead — in both cases the element itself then paints no
 * background of its own. A SiteSpec's `<html>` and `<body>` become ordinary
 * `div`s in the generated app, so that background was being emitted as an
 * in-flow block background. CSS painting order puts an in-flow block's
 * background (step 3) AFTER negative-`z-index` descendants (step 2), so on
 * gs.severance.healthcare `/gs/index.do` the opaque white body background
 * painted OVER the hero photograph at `z-index: -1` — at exactly the source
 * geometry, `opacity: 1`, image decoded — and left the white headline
 * white-on-white. It is a paint-order defect and nothing else: the same clone
 * renders the hero correctly at 390px, where the mobile `<img>` is
 * `position: static; z-index: auto`.
 *
 * WHAT IS ASSERTED:
 *
 *   * the body's background is PROPAGATED when the root paints nothing;
 *   * THE DISCRIMINATING TWIN: when the ROOT itself paints, the root's wins and
 *     the body's stays exactly where it was — the case that would break every
 *     site whose `<html>` carries the background;
 *   * ACCOUNTING: the declaration is MOVED, not lost — `declarationCount` is
 *     identical with and without the canvas decision;
 *   * a real Chromium render proves the paint order actually changes;
 *   * a page whose two viewports disagree is REFUSED, because both render into
 *     one document and a canvas is a property of the document.
 */
async function documentCanvasChecks(): Promise<void> {
  section("Part 11j — 28.75: the document canvas background, re-homed");

  const catalogOf = (
    styles: Record<string, Record<string, string>>,
  ): Parameters<typeof generateStylesheet>[0]["styleCatalog"] =>
    ({
      styles: Object.entries(styles).map(([styleTokenId, properties]) => ({
        styleTokenId,
        properties,
      })),
    }) as unknown as Parameters<typeof generateStylesheet>[0]["styleCatalog"];

  const transparent = {
    "background-color": "rgba(0, 0, 0, 0)",
    "background-image": "none",
    "background-repeat": "repeat",
    display: "block",
  };
  const white = {
    "background-color": "rgb(255, 255, 255)",
    "background-image": "none",
    "background-repeat": "repeat",
    display: "block",
  };
  const dark = {
    "background-color": "rgb(8, 9, 10)",
    "background-image": "none",
    "background-repeat": "repeat",
    display: "block",
  };

  /** A page whose `<html>` paints nothing and whose `<body>` paints white. */
  const pageOf = (
    pageId: string,
    rootProps: string,
    bodyProps: string,
    mobileBodyProps = bodyProps,
  ): Parameters<typeof resolveDocumentRootCanvas>[0]["pages"][number] =>
    ({
      pageId,
      viewports: {
        desktop: {
          nodes: [
            { nodeId: "n1", type: "element", tagName: "html", styleTokenId: rootProps },
            { nodeId: "n2", type: "element", tagName: "body", styleTokenId: bodyProps },
          ],
        },
        mobile: {
          nodes: [
            { nodeId: "m1", type: "element", tagName: "html", styleTokenId: rootProps },
            { nodeId: "m2", type: "element", tagName: "body", styleTokenId: mobileBodyProps },
          ],
        },
      },
    }) as unknown as Parameters<typeof resolveDocumentRootCanvas>[0]["pages"][number];

  const catalog = catalogOf({
    stRoot: transparent,
    stBody: white,
    stDarkRoot: dark,
    stDarkBody: dark,
    stOther: { ...white, "background-color": "rgb(1, 2, 3)" },
  });
  const styleLookup = (id: string): Record<string, string> | undefined =>
    ({ stRoot: transparent, stBody: white, stDarkRoot: dark, stDarkBody: dark,
       stOther: { ...white, "background-color": "rgb(1, 2, 3)" } })[id];

  // --- the body's background propagates ------------------------------------
  const bodyWins = resolveDocumentRootCanvas({
    pages: [pageOf("p000001", "stRoot", "stBody")],
    styleLookup,
  });
  check(
    "the BODY's background is the canvas when the root paints nothing",
    bodyWins.canvas.length === 2 &&
      bodyWins.canvas.every((entry) => entry.tokenId === "stBody" && entry.source === "body"),
    JSON.stringify(bodyWins),
  );
  const withCanvas = generateStylesheet({
    styleCatalog: catalog,
    usedTokenIds: [],
    documentRootTokenIds: ["stBody", "stRoot"],
    documentRootCanvas: bodyWins.canvas,
  });
  const withoutCanvas = generateStylesheet({
    styleCatalog: catalog,
    usedTokenIds: [],
    documentRootTokenIds: ["stBody", "stRoot"],
  });
  check(
    "…and it is emitted on the real `html`, scoped to the page it came from",
    withCanvas.css.includes(
      'html:has([data-wr-page="p000001"]){background-color:rgb(255, 255, 255);' +
        "background-image:none;background-repeat:repeat}",
    ),
    withCanvas.css,
  );
  check(
    "…and the `.wr-doc-` rule that supplied it no longer paints a box background",
    (() => {
      const rule = withCanvas.css
        .split("\n")
        .find((line) => line.startsWith(".wr-doc-stBody{"));
      return rule !== undefined && !rule.includes("background");
    })(),
    withCanvas.css,
  );
  check(
    "PRE-FIX REPRODUCTION: without the decision it is an in-flow block background",
    withoutCanvas.css.includes(".wr-doc-stBody{background-color:rgb(255, 255, 255)") &&
      !withoutCanvas.css.includes("html:has("),
    withoutCanvas.css,
  );

  // --- ACCOUNTING: moved, never dropped ------------------------------------
  check(
    "ACCOUNTING: the declaration count is identical — the background MOVED, it did not vanish",
    withCanvas.declarationCount === withoutCanvas.declarationCount &&
      withCanvas.canvasDeclarations === 3 &&
      withCanvas.canvasRules === 1 &&
      withCanvas.canvasTokensPromoted === 1,
    `${withCanvas.declarationCount} vs ${withoutCanvas.declarationCount}, ` +
      `canvas ${withCanvas.canvasDeclarations}`,
  );

  // --- THE DISCRIMINATING TWIN ---------------------------------------------
  const rootWins = resolveDocumentRootCanvas({
    pages: [pageOf("p000002", "stDarkRoot", "stDarkBody")],
    styleLookup,
  });
  check(
    "THE DISCRIMINATING TWIN: when the ROOT paints, the ROOT's background is the canvas",
    rootWins.canvas.length === 2 &&
      rootWins.canvas.every(
        (entry) => entry.tokenId === "stDarkRoot" && entry.source === "root",
      ),
    JSON.stringify(rootWins),
  );
  const darkCss = generateStylesheet({
    styleCatalog: catalog,
    usedTokenIds: [],
    documentRootTokenIds: ["stDarkBody", "stDarkRoot"],
    documentRootCanvas: rootWins.canvas,
  }).css;
  check(
    "…and the BODY keeps its own box background, exactly as a browser paints it",
    darkCss.includes(".wr-doc-stDarkBody{background-color:rgb(8, 9, 10)"),
    darkCss,
  );
  check(
    "…while the ROOT's `.wr-doc-` rule is the one that gives its background up",
    (() => {
      const rule = darkCss.split("\n").find((line) => line.startsWith(".wr-doc-stDarkRoot{"));
      return rule === undefined || !rule.includes("background");
    })(),
    darkCss,
  );

  // --- refusals -------------------------------------------------------------
  const noBackground = resolveDocumentRootCanvas({
    pages: [pageOf("p000003", "stRoot", "stRoot")],
    styleLookup,
  });
  check(
    "NEGATIVE CONTROL: a page where neither paints gets no canvas rule at all",
    noBackground.canvas.length === 0 &&
      noBackground.refusalsByReason["no-background"] === 1,
    JSON.stringify(noBackground),
  );
  check(
    "…and a site with no canvas at all is byte-identical to the pre-28.75 output",
    generateStylesheet({
      styleCatalog: catalog,
      usedTokenIds: [],
      documentRootTokenIds: ["stRoot"],
      documentRootCanvas: noBackground.canvas,
    }).css ===
      generateStylesheet({
        styleCatalog: catalog,
        usedTokenIds: [],
        documentRootTokenIds: ["stRoot"],
      }).css,
  );
  const disagree = resolveDocumentRootCanvas({
    pages: [pageOf("p000004", "stRoot", "stBody", "stOther")],
    styleLookup,
  });
  check(
    "NEGATIVE CONTROL: a page whose two viewports disagree is REFUSED, not guessed",
    disagree.canvas.length === 0 &&
      disagree.refusalsByReason["viewports-disagree"] === 1,
    JSON.stringify(disagree),
  );
  check(
    "…and every refusal reason is a declared member",
    (CANVAS_REFUSAL_REASONS as readonly string[]).includes("viewports-disagree") &&
      (CANVAS_REFUSAL_REASONS as readonly string[]).includes("no-background") &&
      (CANVAS_REFUSAL_REASONS as readonly string[]).includes("document-root-not-found"),
  );
  check(
    "`paintsBackground()` reads `rgba(0, 0, 0, 0)` as NO background, and an image as one",
    paintsBackground(transparent) === false &&
      paintsBackground(white) === true &&
      paintsBackground({ "background-color": "transparent", "background-image": "url(a.png)" }) ===
        true &&
      paintsBackground({ "background-color": "#00000000", "background-image": "none" }) === false,
  );

  // --- THE PAINT ORDER, IN A REAL BROWSER ----------------------------------
  const { chromium } = await import("playwright");
  const browser = await chromium.launch();
  try {
    const context = await browser.newContext({ viewport: { width: 800, height: 400 } });
    await context.route("http://**", (route) => route.abort());
    await context.route("https://**", (route) => route.abort());
    const page = await context.newPage();
    /**
     * The gs.severance geometry, generically: an opaque document-root wrapper
     * with a `z-index: -1` child behind its in-flow content. `probe()` reports
     * what is painted at the child's centre.
     */
    const document_ = (css: string): string =>
      `<!doctype html><html><head><style>html,body{margin:0;padding:0}p{margin:0}` +
      `.wr-variant{display:contents}.wr-doc-stBody{min-height:200px}` +
      `.hero{position:absolute;left:0;top:0;width:800px;` +
      `height:200px;z-index:-1;background:rgb(255,0,0)}${css}</style></head><body>` +
      `<div class="wr-variant" data-wr-page="p000001" data-wr-viewport="desktop">` +
      `<div class="wr-doc-stBody"><div class="hero"></div><p>content</p></div>` +
      `</div></body></html>`;
    /**
     * The colour actually PAINTED at a point, read out of a 1×1 screenshot.
     *
     * `elementFromPoint` is hit testing, not painting, and it answers "hero" in
     * BOTH worlds — so it cannot see this defect at all. The pixel can. A 1×1
     * PNG has one scanline whose filter has no left or upper neighbour to
     * predict from, so every filter type reduces to the raw bytes.
     */
    const paintedAt = async (css: string, x: number, y: number): Promise<string> => {
      await page.setContent(document_(css), { waitUntil: "load" });
      const png = await page.screenshot({ clip: { x, y, width: 1, height: 1 } });
      let offset = 8;
      let colorType = 6;
      const idat: Buffer[] = [];
      while (offset + 8 <= png.length) {
        const length = png.readUInt32BE(offset);
        const type = png.toString("ascii", offset + 4, offset + 8);
        const data = png.subarray(offset + 8, offset + 8 + length);
        if (type === "IHDR") colorType = data.readUInt8(9);
        if (type === "IDAT") idat.push(Buffer.from(data));
        offset += 12 + length;
      }
      const raw = inflateSync(Buffer.concat(idat));
      const bytesPerPixel = colorType === 6 ? 4 : colorType === 2 ? 3 : 1;
      const pixel = raw.subarray(1, 1 + bytesPerPixel);
      return `rgb(${pixel[0]}, ${pixel[1]}, ${pixel[2]})`;
    };
    const before = await paintedAt(".wr-doc-stBody{background-color:rgb(255,255,255)}", 10, 10);
    const after = await paintedAt(
      'html:has([data-wr-page="p000001"]){background-color:rgb(255,255,255)}',
      10,
      10,
    );
    check(
      "PRE-FIX REPRODUCTION, RENDERED: the in-flow wrapper background PAINTS OVER the `z-index: -1` hero",
      before === "rgb(255, 255, 255)",
      `painted ${before} where the hero is rgb(255, 0, 0)`,
    );
    check(
      "…and the canvas rule leaves the hero painted, which is what a browser does",
      after === "rgb(255, 0, 0)",
      `painted ${after}`,
    );
    await context.close();
  } finally {
    await browser.close();
  }
}


// ---------------------------------------------------------------------------

/**
 * Part 11k — §19, THE DAMAGE CLAMP, and the four things that must never get one.
 *
 * WHAT IT IS FOR. After the three recovery branches, one class of frozen box is
 * left on every corpus: a container the module can PROVE is damaged and cannot
 * re-derive a relation for. linear.app's site header is the canonical one —
 * `width: 1436px; max-width: 1436px` on a flex ROW item, whose source box is
 * 641px wide at a 641px viewport and 1436px at 1440. `inlineSizeBehaviour()`
 * refuses it `flex-item-main-axis` and is right to, so it ships 1436px wide
 * inside a 700px viewport and the navigation is cut off.
 *
 * The clamp claims nothing about the authored CSS. It claims the measured thing:
 * THIS BOX NEVER LEFT ITS CONTAINING BLOCK IN THE SOURCE, AND THE FROZEN PIXEL
 * MAKES IT LEAVE IT IN THE CLONE.
 *
 * WHAT IS ASSERTED:
 *
 *   * the flex-row header, which no branch can answer, is capped;
 *   * THE DISCRIMINATING TWIN, and the bug it caught: a box that fits its
 *     parent's BORDER box but overflows its parent's CONTENT box is REFUSED,
 *     because `100%` names the content box. The first build of this clamp
 *     compared against the border box and measured 62px of NEW error on
 *     linear.app's `<h2 style="width: 1250px">` inside a 1280px parent with
 *     46px of padding per side;
 *   * NEGATIVE CONTROL: an intentional full-bleed band is refused;
 *   * NEGATIVE CONTROL: a genuinely fixed-width box that never moved is refused;
 *   * NEGATIVE CONTROL: a grid item is refused, because its containing block is
 *     its grid AREA and `containingBlockGuard()` says so;
 *   * NEGATIVE CONTROL: a box with no damage at all is refused;
 *   * the clamp is a NO-OP at the truth width, which is why the render accepts it.
 */
function damageClampChecks(): void {
  section("Part 11k — 28.75 §19: the damage clamp, and what it refuses");

  const WIDTHS = [390, 768, 1024, 1100, 1200, 1440, 1920];
  const block: Props = { display: "block" };
  /** A flex ROW nav that IS the viewport, with no padding of its own. */
  const navProps: Props = { display: "flex", "flex-direction": "row" };
  const flexItem: Props = {
    display: "flex",
    "flex-direction": "row",
    width: "1436px",
    "max-width": "1436px",
    "margin-left": "0px",
    "margin-right": "0px",
    "flex-grow": "1",
    "box-sizing": "border-box",
  };
  /** A padded column: border box W, content box W − 92. */
  const columnProps: Props = {
    display: "block",
    "padding-left": "46px",
    "padding-right": "46px",
    "box-sizing": "border-box",
  };

  const headerW = WIDTHS.map((width) => Math.min(width, 1436));
  const nodes: FixtureNode[] = [
    { nodeId: "n001", tagName: "html", w: [...WIDTHS], props: block },
    { nodeId: "n002", tagName: "body", parentNodeId: "n001", w: [...WIDTHS], props: block },
    { nodeId: "nav", tagName: "nav", parentNodeId: "n002", w: [...WIDTHS], props: navProps },
    /* THE POPULATION: the flex row item no branch can answer for. */
    { nodeId: "header", tagName: "div", parentNodeId: "nav", w: headerW, props: flexItem },
    { nodeId: "column", tagName: "div", parentNodeId: "n002", w: [...WIDTHS], props: columnProps },
    /*
     * THE DISCRIMINATING TWIN. Fits the parent's BORDER box at every width and
     * OVERFLOWS its content box at the narrow ones. `max-width: 100%` names the
     * content box, so capping it would make it narrower than the source.
     */
    {
      nodeId: "wideheading",
      tagName: "h2",
      parentNodeId: "column",
      w: WIDTHS.map((width) => Math.min(width - 20, 1250)),
      props: { display: "block", width: "1250px", "margin-left": "0px", "margin-right": "0px",
               "box-sizing": "border-box" },
    },
    /* NEGATIVE CONTROL: an intentional full-bleed band. */
    {
      nodeId: "bleed",
      tagName: "div",
      parentNodeId: "column",
      w: [...WIDTHS],
      x: WIDTHS.map(() => 0),
      props: { display: "block", position: "relative", width: "1440px",
               "margin-left": "-720px", "margin-right": "-720px", "box-sizing": "border-box" },
    },
    /* NEGATIVE CONTROL: an authored fixed width that never moved. */
    {
      nodeId: "fixedbox",
      tagName: "div",
      parentNodeId: "column",
      w: WIDTHS.map(() => 600),
      props: { display: "block", width: "600px", "margin-left": "0px", "margin-right": "0px",
               "box-sizing": "border-box" },
    },
    /*
     * NEGATIVE CONTROL: a desktop-only box whose frozen 960px overhangs the
     * containing block by 28px at the narrowest desktop width and by nothing
     * anywhere else. Its source width DOES move (932 → 960), so it clears
     * control 1; the damage is simply not material.
     */
    {
      nodeId: "tiny",
      tagName: "div",
      parentNodeId: "column",
      w: WIDTHS.map((width) => Math.min(width - 92, 960)),
      v: WIDTHS.map((width) => (width >= 1024 ? 1 : 0)) as (0 | 1)[],
      props: { display: "block", width: "960px", "margin-left": "0px", "margin-right": "0px",
               "box-sizing": "border-box" },
    },
  ];
  const built = buildPage(nodes, undefined, WIDTHS);
  const result = inferLayoutRules({
    pages: [built.page],
    styleLookup: built.styleLookup,
    breakpoint: 1024,
  });
  const ruleFor = (nodeId: string): RecoveredLayoutRule | undefined =>
    result.rules.find((entry) => entry.nodeId === nodeId);
  const counters = result.counters;

  // --- PRE-FIX REPRODUCTION -------------------------------------------------
  check(
    "PRE-FIX REPRODUCTION: `width: auto` on the flex ROW item is refused by the module's own discriminator",
    inlineSizeBehaviour(
      built.specNodes.get("header")!,
      built.specNodes.get("nav")!,
      built.styleLookup,
      { autoInlineMargins: false },
    ).reason === "flex-item-main-axis",
  );
  check(
    "PRE-FIX REPRODUCTION: …so its frozen 1436px is 736px wider than a 700px viewport",
    1436 - 700 === 736,
  );

  // --- what the clamp emits -------------------------------------------------
  check(
    "a flex-row header no branch can answer for is CAPPED at its containing block",
    ruleFor("header")?.kind === "damage-clamped-width" &&
      ruleFor("header")?.declarations["max-width"] === "100%",
    JSON.stringify(ruleFor("header")),
  );
  check(
    "…and its evidence says CLAMP, not a recovered relation, and names the overhang",
    (() => {
      const evidence = ruleFor("header")?.evidence ?? [];
      return (
        evidence.some((line) => line.startsWith("CLAMP, not a recovered relation")) &&
        evidence.some((line) =>
          line.includes("frozen width 1436px overhangs the containing block"),
        )
      );
    })(),
    JSON.stringify(ruleFor("header")?.evidence),
  );
  check(
    "…and it is a NO-OP at the truth width, which is why the render can accept it",
    (() => {
      const truth = headerW[WIDTHS.indexOf(1440)]!;
      return truth === 1436 && Math.min(1436, WIDTHS[WIDTHS.indexOf(1440)]!) === 1436;
    })(),
  );

  // --- THE DISCRIMINATING TWIN, and the bug it caught ----------------------
  check(
    "THE DISCRIMINATING TWIN: a box that overflows its parent's CONTENT box is REFUSED",
    ruleFor("wideheading") === undefined &&
      (counters.damageClampRefusalsByReason["source-overflows-parent"] ?? 0) >= 1,
    JSON.stringify(counters.damageClampRefusalsByReason),
  );
  check(
    "…and the twin really does fit the parent's BORDER box, which is why the test had to change",
    (() => {
      const desktop = WIDTHS.filter((width) => width >= 1024);
      const fitsBorderBox = desktop.every((width) => Math.min(width - 20, 1250) <= width);
      const overflowsContentBox = desktop.some(
        (width) => Math.min(width - 20, 1250) > width - 92,
      );
      return fitsBorderBox && overflowsContentBox;
    })(),
  );

  // --- the other controls ---------------------------------------------------
  check(
    "NEGATIVE CONTROL: an intentional full-bleed band is never clamped",
    ruleFor("bleed")?.kind !== "damage-clamped-width",
    JSON.stringify(ruleFor("bleed")?.kind),
  );
  check(
    "NEGATIVE CONTROL: an authored width that never moved is refused",
    ruleFor("fixedbox") === undefined &&
      (counters.damageClampRefusalsByReason["source-width-constant"] ?? 0) >= 1,
    JSON.stringify(counters.damageClampRefusalsByReason),
  );
  check(
    "NEGATIVE CONTROL: 28px of overhang is not MATERIAL damage (the 40px floor)",
    ruleFor("tiny") === undefined &&
      (counters.damageClampRefusalsByReason["no-material-damage"] ?? 0) >= 1,
    JSON.stringify(counters.damageClampRefusalsByReason),
  );
  check(
    "…and every refusal reason recorded is a declared member",
    Object.keys(counters.damageClampRefusalsByReason).every((reason) =>
      (DAMAGE_CLAMP_REFUSAL_REASONS as readonly string[]).includes(reason),
    ),
    JSON.stringify(Object.keys(counters.damageClampRefusalsByReason)),
  );

  // --- the guard the clamp reads rather than relaxes -----------------------
  const gridNodes: FixtureNode[] = [
    { nodeId: "n001", tagName: "html", w: [...WIDTHS], props: block },
    { nodeId: "n002", tagName: "body", parentNodeId: "n001", w: [...WIDTHS], props: block },
    {
      nodeId: "grid",
      tagName: "div",
      parentNodeId: "n002",
      w: [...WIDTHS],
      props: { display: "grid", "grid-template-columns": "1fr 1fr" },
    },
    {
      nodeId: "gitem",
      tagName: "div",
      parentNodeId: "grid",
      w: WIDTHS.map((width) => Math.min(width, 1436)),
      props: { display: "block", width: "1436px", "margin-left": "0px", "margin-right": "0px",
               "box-sizing": "border-box" },
    },
  ];
  const gridBuilt = buildPage(gridNodes, undefined, WIDTHS);
  const gridResult = inferLayoutRules({
    pages: [gridBuilt.page],
    styleLookup: gridBuilt.styleLookup,
    breakpoint: 1024,
  });
  check(
    "NEGATIVE CONTROL: a grid item is refused — its containing block is its grid AREA",
    gridResult.rules.find((entry) => entry.nodeId === "gitem")?.kind !==
      "damage-clamped-width" &&
      (gridResult.counters.damageClampRefusalsByReason["containing-block-not-parent"] ?? 0) >= 1,
    JSON.stringify(gridResult.counters.damageClampRefusalsByReason),
  );
  check(
    "…and `containingBlockGuard()` is what said so, unchanged",
    containingBlockGuard(
      gridBuilt.specNodes.get("gitem")!,
      gridBuilt.specNodes.get("grid")!,
      gridBuilt.styleLookup,
    ) === "grid-item",
  );

  // --- it never competes with a branch that would have shipped -------------
  const plainNodes: FixtureNode[] = [
    { nodeId: "n001", tagName: "html", w: [...WIDTHS], props: block },
    { nodeId: "n002", tagName: "body", parentNodeId: "n001", w: [...WIDTHS], props: block },
    { nodeId: "shell", tagName: "div", parentNodeId: "n002", w: [...WIDTHS], props: columnProps },
    {
      nodeId: "fills",
      tagName: "div",
      parentNodeId: "shell",
      w: WIDTHS.map((width) => width - 92),
      props: { display: "block", "margin-left": "0px", "margin-right": "0px" },
    },
  ];
  const plain = buildPage(plainNodes, undefined, WIDTHS);
  const plainResult = inferLayoutRules({
    pages: [plain.page],
    styleLookup: plain.styleLookup,
    breakpoint: 1024,
  });
  check(
    "a node the ordinary branches CAN answer for keeps its existing rule, never a clamp",
    plainResult.rules.find((entry) => entry.nodeId === "fills")?.kind === "full-width" &&
      plainResult.counters.damageClampedWidth === 0,
    JSON.stringify(plainResult.rules.map((entry) => [entry.nodeId, entry.kind])),
  );

  // --- the funnel still adds up, INCLUDING the supersede path --------------
  const sumOf = (record: Record<string, number>): number =>
    Object.values(record).reduce((total, value) => total + value, 0);
  check(
    "every candidate still leaves through exactly ONE outcome, clamp included",
    sumOf(counters.inlineSizeOutcomes) === counters.inlineSizeCandidates &&
      counters.inlineSizeOutcomeDoubleCounts === 0 &&
      (counters.inlineSizeOutcomes["emitted-damage-clamped-width"] ?? 0) === 1,
    `candidates ${counters.inlineSizeCandidates}, ` +
      JSON.stringify(counters.inlineSizeOutcomes),
  );
  check(
    "…and the new outcome is a member of the declared partition",
    INLINE_SIZE_OUTCOMES.includes("emitted-damage-clamped-width"),
  );

  /*
   * THE SUPERSEDE PATH, which is the only way the partition can survive a clamp
   * reached from a branch that had ALREADY recorded a refusal. This is
   * linear.app's header signature exactly: a flex ROW item whose width is
   * constant and centred wherever its parent has room to spare, so the centered
   * max-width branch's SHAPE matches, and whose `width` VALUE the module's own
   * discriminator then refuses (`flex-item-main-axis`). Without
   * `supersedeOutcome()` that node would be counted twice and the funnel
   * invariant above would be false.
   */
  const superNodes: FixtureNode[] = [
    { nodeId: "n001", tagName: "html", w: [...WIDTHS], props: block },
    { nodeId: "n002", tagName: "body", parentNodeId: "n001", w: [...WIDTHS], props: block },
    { nodeId: "nav2", tagName: "nav", parentNodeId: "n002", w: [...WIDTHS], props: navProps },
    {
      nodeId: "hdr2",
      tagName: "div",
      parentNodeId: "nav2",
      w: WIDTHS.map((width) => Math.min(width, 1200)),
      x: WIDTHS.map((width) => Math.max(0, (width - Math.min(width, 1200)) / 2)),
      props: {
        display: "block",
        width: "1200px",
        "margin-left": "0px",
        "margin-right": "0px",
        "box-sizing": "border-box",
      },
    },
  ];
  const superBuilt = buildPage(superNodes, undefined, WIDTHS);
  const superResult = inferLayoutRules({
    pages: [superBuilt.page],
    styleLookup: superBuilt.styleLookup,
    breakpoint: 1024,
  });
  const superCounters = superResult.counters;
  check(
    "PRE-FIX REPRODUCTION: the centered-max-width SHAPE matches but the VALUE is refused",
    superCounters.widthModeRefusals >= 1 &&
      superCounters.widthModeRefusalsByReason["flex-item-main-axis"] === 1,
    JSON.stringify(superCounters.widthModeRefusalsByReason),
  );
  check(
    "…and the clamp picks that node up, SUPERSEDING the refusal it just recorded",
    superResult.rules.find((entry) => entry.nodeId === "hdr2")?.kind ===
      "damage-clamped-width" &&
      superCounters.inlineSizeOutcomesSuperseded === 1 &&
      (superCounters.inlineSizeOutcomes["refused-width-mode"] ?? 0) === 0,
    `superseded ${superCounters.inlineSizeOutcomesSuperseded}, ` +
      JSON.stringify(superCounters.inlineSizeOutcomes),
  );
  check(
    "…and the funnel STILL adds up, which is the whole point of counting it",
    sumOf(superCounters.inlineSizeOutcomes) === superCounters.inlineSizeCandidates &&
      superCounters.inlineSizeOutcomeDoubleCounts === 0,
    `candidates ${superCounters.inlineSizeCandidates}, ` +
      JSON.stringify(superCounters.inlineSizeOutcomes),
  );
}

/** Part 11l — the clamp is truth-checked too, and a wrong one is rejected. */
async function damageClampTruthCheckChecks(): Promise<void> {
  section("Part 11l — 28.75 §19: the clamp is rendered, not exempted");

  /*
   * `.p9-fill` is 1108px inside a content box of exactly 1108px, so
   * `max-width: 100%` is a no-op at the truth width — the whole reason the clamp
   * can be put through the same render as a recovered relation.
   */
  const noop = rule(
    "p000009",
    "p9fill",
    "damage-clamped-width",
    { "max-width": "100%" },
    { x: 166, w: 1108 },
  );
  const good = await verifyLayoutRules({
    rules: [noop],
    pages: HARNESS_PAGES,
    css: HARNESS_CSS,
  });
  check(
    "a clamp that is a no-op at the truth width ships, having been RENDERED",
    good.rules.length === 1 &&
      good.counters.truthCheckable === 1 &&
      good.counters.acceptedUnchecked === 0 &&
      good.counters.rejectedByTruthCheck === 0,
    JSON.stringify(good.counters),
  );

  /*
   * A clamp can only ever make a box NARROWER, so the render's job is to catch
   * the case where that narrowing bites at the truth width — a box that already
   * overhangs its containing block in the SOURCE. `.p9-bleed` is exactly that:
   * a 1440px band inside a 1108px content box, rendering 118 … 1558. The clamp
   * predicate refuses this node (`source-overflows-parent`); this check proves
   * that if the predicate ever let one through, the render would still stop it.
   */
  const bites = rule(
    "p000009",
    "p9bleed",
    "damage-clamped-width",
    { "max-width": "100%" },
    { x: 118, w: 1440 },
  );
  const bad = await verifyLayoutRules({
    rules: [bites],
    pages: HARNESS_PAGES,
    css: HARNESS_CSS,
  });
  check(
    "…and a clamp that DOES bite at the truth width is rejected by the same render",
    bad.rules.length === 0 && bad.counters.rejectedByTruthCheck === 1,
    JSON.stringify(bad.counters),
  );
}

/**
 * Real artifacts written BEFORE this change, read off disk, newest first.
 *
 * Back-compatibility is a claim about files that already exist, so it is checked
 * against files that already exist rather than against a fixture written to
 * agree with it.
 */
function collectPreTaskArtifacts(
  relative: string,
  isPreTask: (raw: unknown) => boolean,
  limit = 4,
): unknown[] {
  const root = path.join(process.cwd(), "data");
  const out: unknown[] = [];
  if (!existsSync(root)) return out;
  let hosts: string[];
  try {
    hosts = readdirSync(root);
  } catch {
    return out;
  }
  for (const host of hosts.sort()) {
    const runs = path.join(root, host, "reconstructions");
    let entries: string[];
    try {
      entries = readdirSync(runs);
    } catch {
      continue;
    }
    for (const run of entries.sort()) {
      if (out.length >= limit) return out;
      let raw: unknown;
      try {
        raw = JSON.parse(readFileSync(path.join(runs, run, ...relative.split("/")), "utf8"));
      } catch {
        continue;
      }
      if (isPreTask(raw)) out.push(raw);
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// Part 15 — Task 28.7 §26: the tree switch is PER ROUTE
// ---------------------------------------------------------------------------

/** The §26 probe grid: adjacent widths that bracket a candidate TIGHTLY. */
const ROUTE_PROBE_WIDTHS = [390, 640, 641, 1024, 1025, 1440];
const ROUTE_TRUTH_INDEX = 5;
/** Both endpoints of the §26 fixtures, and the midpoint they used to produce. */
const ROUTE_MOBILE_ENDPOINT = 390;
const ROUTE_DESKTOP_ENDPOINT = 1440;
const ROUTE_MIDPOINT = Math.floor((ROUTE_MOBILE_ENDPOINT + ROUTE_DESKTOP_ENDPOINT) / 2);

/*
 * TASK 28.8 A1 — the per-route INFERENCE, read off the evidence records.
 *
 * `plan.byPageId` used to carry this. Under the V1 two-mode policy the SERVED
 * switch is site-wide (801 for every route) and `byPageId` is empty by design,
 * but the per-route inference still runs and still ships in `records`. The §26
 * machinery these tests exercise — `globalsCss` scoping, the probe-axis split,
 * `route-map.json`'s `pageBreakpoints` — is unchanged and is still fed a real
 * disagreeing map here, so every invariant below keeps its teeth.
 */
function inferredRouteOverrides(
  plan: ReturnType<typeof inferResponsivePlan>,
): Map<string, number> {
  return new Map(
    plan.records
      // Responsive Core P0: `differsFromSite` now describes the SERVED width;
      // the inference's disagreement moved to `inferredDiffersFromSite`.
      .filter((record) => record.inferredDiffersFromSite === true)
      .map((record) => [record.pageId, record.breakpoint] as const),
  );
}

/** A SiteSpec with the two observed endpoints and nothing else `inferBreakpoint` reads. */
function routeSiteSpec(): Parameters<typeof inferResponsivePlan>[0] {
  return {
    responsiveModel: {
      observedViewports: [
        { id: "mobile", width: ROUTE_MOBILE_ENDPOINT },
        { id: "desktop", width: ROUTE_DESKTOP_ENDPOINT },
      ],
    },
  } as unknown as Parameters<typeof inferResponsivePlan>[0];
}

/**
 * A page that changes at the given probe indices and nowhere else.
 *
 * `flipAt` names an index into the width list; the node it adds is invisible
 * below that width and visible from it. `html` and `body` grow with the viewport
 * by exactly the 1px the grid steps, which is inside
 * `TREE_SWITCH_CHANGE_TOLERANCE_PX` and therefore contributes no change at all —
 * the probe is measuring media-query jumps, not continuous reflow.
 */
function flippingTree(
  widths: readonly number[],
  flips: readonly { atIndex: number; nodes: number }[],
): FixtureNode[] {
  const block: Props = { display: "block" };
  const tree: FixtureNode[] = [
    { nodeId: "n001", tagName: "html", w: [...widths], props: block },
    { nodeId: "n002", tagName: "body", parentNodeId: "n001", w: [...widths], props: block },
  ];
  let serial = 0;
  for (const flip of flips) {
    for (let i = 0; i < flip.nodes; i++) {
      serial++;
      tree.push({
        nodeId: `f${String(serial).padStart(3, "0")}`,
        tagName: "div",
        parentNodeId: "n002",
        w: widths.map(() => 300),
        v: widths.map((_, index) => (index >= flip.atIndex ? 1 : 0) as 0 | 1),
        props: block,
      });
    }
  }
  return tree;
}

/**
 * Part 15 — §26: one number for a whole site is the defect, not the ranking.
 *
 * Measured on linear.app the day this was written: `/` changes rendering regime
 * between 390 and 700 while `/pricing` changes between 1024 and 1100, so no
 * single site-wide width can serve both — and the per-page evidence that could
 * tell them apart was computed and then summed away one line later. These checks
 * are generic geometry: two synthetic pages, a probe grid, and an authored
 * histogram. No host, selector or pixel value comes from any real site.
 */
function perRouteTreeSwitchChecks(): void {
  section("Part 15 — §26: the tree switch is decided per ROUTE, not per site");

  // Two authored boundaries, named identically by both pages' stylesheets, so
  // nothing but the PROBE can separate them.
  const twoBoundaries = histogram([
    { px: 640, kind: "max", count: 10 },
    { px: 1024, kind: "max", count: 10 },
  ]);

  // --- (1) two pages, two different change widths, two different switches ---
  const earlyPage = buildTwoViewportPage(
    flippingTree(ROUTE_PROBE_WIDTHS, [{ atIndex: 2, nodes: 3 }]),
    {
      pageId: "p000001",
      authoredBreakpoints: twoBoundaries,
      desktopProbeWidths: ROUTE_PROBE_WIDTHS,
      desktopTruthIndex: ROUTE_TRUTH_INDEX,
    },
  ).page;
  const latePage = buildTwoViewportPage(
    flippingTree(ROUTE_PROBE_WIDTHS, [{ atIndex: 4, nodes: 4 }]),
    {
      pageId: "p000002",
      authoredBreakpoints: twoBoundaries,
      desktopProbeWidths: ROUTE_PROBE_WIDTHS,
      desktopTruthIndex: ROUTE_TRUTH_INDEX,
    },
  ).page;

  const site = chooseTreeSwitch({
    pages: [earlyPage, latePage],
    mobileWidth: ROUTE_MOBILE_ENDPOINT,
    desktopWidth: ROUTE_DESKTOP_ENDPOINT,
  });
  const early = site.perPage.find((p) => p.pageId === "p000001");
  const late = site.perPage.find((p) => p.pageId === "p000002");
  const distinctSwitches = new Set(site.perPage.map((entry) => entry.px));
  check(
    "two routes that change at DIFFERENT widths get DIFFERENT switches",
    early?.px === 641 && late?.px === 1025 && distinctSwitches.size === 2,
    `${early?.px} vs ${late?.px}`,
  );
  check(
    "…and neither of them is the observed-endpoint midpoint the site used to ship",
    typeof early?.px === "number" &&
      typeof late?.px === "number" &&
      early.px !== ROUTE_MIDPOINT &&
      late.px !== ROUTE_MIDPOINT &&
      site.midpointPx === ROUTE_MIDPOINT,
    `midpoint ${site.midpointPx}`,
  );
  check(
    "…and the SITE-WIDE number is still one number, still chosen the same way",
    site.px === 1025 && site.snapped && site.chosen?.observedChange === 4,
    `${site.px} ${JSON.stringify(site.chosen)}`,
  );
  check(
    "…so exactly the route the site-wide number would have mis-served says so",
    early?.differsFromSite === true && late?.differsFromSite === false,
    `${early?.differsFromSite} / ${late?.differsFromSite}`,
  );

  // --- (2) a single-page site: per-route and site-wide agree ----------------
  const solo = chooseTreeSwitch({
    pages: [latePage],
    mobileWidth: ROUTE_MOBILE_ENDPOINT,
    desktopWidth: ROUTE_DESKTOP_ENDPOINT,
  });
  const soloPlan = inferResponsivePlan(routeSiteSpec(), { pages: [latePage] });
  check(
    "a single-page site decides ONE switch and the route agrees with it",
    solo.perPage.length === 1 &&
      solo.perPage[0]?.px === solo.px &&
      solo.perPage[0]?.differsFromSite === false,
    `${solo.px} vs ${solo.perPage[0]?.px}`,
  );
  check(
    "…so it publishes no per-route override at all — no behaviour change",
    soloPlan.byPageId.size === 0 &&
      breakpointForPage(soloPlan, "p000002") === soloPlan.site.value,
    `${soloPlan.byPageId.size} override(s)`,
  );
  /*
   * TASK 28.8 A1 — THE PRODUCT POLICY, on a plan whose inference disagrees with
   * it. `latePage` swaps at 1025 and the policy serves 801 anyway; both numbers
   * are in the artifact, and the media queries are the fixed 801 / 800.98 pair
   * on every site.
   */
  /*
   * Responsive Core P0 §C2.6 — was "(A1) the SERVED switch is the V1 policy
   * width, whatever the inference chose". Under the graded switch the policy is
   * served only when no grade-2/3 evidence exists. `latePage` carries authored
   * breakpoints and geometry but NO fingerprint and NO bisection, so nothing
   * observed a family swap: the SAME fixture still serves 801, now as grade 4.
   */
  check(
    "(P0-G) authored + geometry but NO observed family swap serves grade-4 policy 801",
    soloPlan.site.value === V1_RESPONSIVE_POLICY.desktopMinPx &&
      soloPlan.site.value === 801 &&
      soloPlan.site.provenance === "product-policy" &&
      soloPlan.site.method === "product-policy-v1" &&
      soloPlan.site.servedSwitch?.grade === "product-policy" &&
      soloPlan.site.servedSwitch.value === 801 &&
      soloPlan.site.servedSwitch.evidence.candidatePx === solo.px,
    `${soloPlan.site.value} (${soloPlan.site.provenance}/${soloPlan.site.method}) ${soloPlan.site.servedSwitch?.reason}`,
  );
  check(
    "(A1) …and the inference it overrode is still carried, with its own method",
    soloPlan.site.inferredAuthoredPx === solo.px &&
      soloPlan.site.inferredAuthoredMethod ===
        (solo.snapped ? "authored-breakpoint" : "observed-endpoint-midpoint") &&
      soloPlan.site.candidates !== undefined,
    `${soloPlan.site.inferredAuthoredPx} / ${soloPlan.site.inferredAuthoredMethod}`,
  );
  check(
    "(A1) …and the two modes are exactly (min-width: 801px) / (max-width: 800.98px)",
    breakpointMediaQueries(soloPlan.site.value).desktop === "(min-width: 801px)" &&
      breakpointMediaQueries(soloPlan.site.value).mobile === "(max-width: 800.98px)" &&
      V1_RESPONSIVE_POLICY.mobileMaxPx === 800,
    JSON.stringify(breakpointMediaQueries(soloPlan.site.value)),
  );
  check(
    "(A1) an operator override still beats the policy, and borrows none of its provenance",
    inferResponsivePlan(routeSiteSpec(), { pages: [latePage], override: 700 }).site.value ===
      700 &&
      inferResponsivePlan(routeSiteSpec(), { pages: [latePage], override: 700 }).site
        .provenance === "operator-override" &&
      inferResponsivePlan(routeSiteSpec(), { pages: [latePage], override: 700 }).site
        .inferredAuthoredPx === undefined &&
      // P0 §C2.6 grade 1 is labeled as such and carries no evidence.
      inferResponsivePlan(routeSiteSpec(), { pages: [latePage], override: 700 }).site
        .servedSwitch?.grade === "operator-override" &&
      Object.keys(
        inferResponsivePlan(routeSiteSpec(), { pages: [latePage], override: 700 }).site
          .servedSwitch?.evidence ?? { x: 1 },
      ).length === 0,
  );
  /*
   * NEGATIVE — the policy width is clamped into `(mobile, desktop]`, because a
   * switch outside it serves one tree at a width where the OTHER was observed.
   */
  const narrowSite = {
    responsiveModel: {
      observedViewports: [
        { id: "mobile", width: 320 },
        { id: "desktop", width: 768 },
      ],
    },
  } as unknown as Parameters<typeof inferResponsivePlan>[0];
  const wideSite = {
    responsiveModel: {
      observedViewports: [
        { id: "mobile", width: 900 },
        { id: "desktop", width: 1440 },
      ],
    },
  } as unknown as Parameters<typeof inferResponsivePlan>[0];
  check(
    "(A1) a desktop endpoint below 801 clamps the policy DOWN and announces it",
    inferResponsivePlan(narrowSite, { pages: [] }).site.value === 768 &&
      inferResponsivePlan(narrowSite, { pages: [] }).site.policyClamped === true &&
      inferResponsivePlan(narrowSite, { pages: [] }).site.servedSwitch?.grade === "product-policy",
    `${inferResponsivePlan(narrowSite, { pages: [] }).site.value}`,
  );
  check(
    "(A1) …and a mobile endpoint above 800 clamps it UP, to just past that endpoint",
    inferResponsivePlan(wideSite, { pages: [] }).site.value === 901 &&
      inferResponsivePlan(wideSite, { pages: [] }).site.policyClamped === true &&
      inferResponsivePlan(wideSite, { pages: [] }).site.servedSwitch?.value === 901,
    `${inferResponsivePlan(wideSite, { pages: [] }).site.value}`,
  );
  check(
    "…and its globals.css is exactly the unscoped pair it has always written",
    !globalsCss(soloPlan.site, undefined, []).includes(":not([data-wr-page") &&
      globalsCss(soloPlan.site, undefined, []) === globalsCss(soloPlan.site),
  );

  // --- (3) a change width NEITHER observed tree covers ----------------------
  // This page changes at 641 AND at 1025. Only two trees were ever observed —
  // one at 390 and one at 1440 — so the clone can swap at exactly one of them.
  const bothPage = buildTwoViewportPage(
    flippingTree(ROUTE_PROBE_WIDTHS, [
      { atIndex: 2, nodes: 2 },
      { atIndex: 4, nodes: 5 },
    ]),
    {
      pageId: "p000003",
      authoredBreakpoints: twoBoundaries,
      desktopProbeWidths: ROUTE_PROBE_WIDTHS,
      desktopTruthIndex: ROUTE_TRUTH_INDEX,
    },
  ).page;
  const bothPlan = inferResponsivePlan(routeSiteSpec(), { pages: [bothPage] });
  const bothRecord = bothPlan.records[0];
  /*
   * Responsive Core P0 — `unservedChangeWidths` / `variantTreeNotObserved` are
   * manifest limitations and are now measured against the SERVED width. This
   * route has no observed family swap, so it is served the grade-4 policy 801
   * and swaps at NEITHER measured width: both are named. The pre-P0 list
   * (measured against the inference, 1025) is kept as `inferredUnservedChangeWidths`.
   */
  check(
    "a route measured to change at TWO widths, served at neither, NAMES both (inference names one)",
    bothRecord?.breakpoint === 1025 &&
      bothRecord?.servedSwitch?.value === 801 &&
      JSON.stringify(bothRecord?.unservedChangeWidths) === "[641,1025]" &&
      JSON.stringify(bothRecord?.inferredUnservedChangeWidths) === "[641]",
    JSON.stringify(bothRecord),
  );
  check(
    "…as the parametric limitation §26.4 requires, in the manifest",
    JSON.stringify(bothPlan.variantTreeNotObserved) ===
      JSON.stringify(["variant-tree-not-observed-at-641", "variant-tree-not-observed-at-1025"]) &&
      variantTreeNotObservedCode(641) === "variant-tree-not-observed-at-641",
    JSON.stringify(bothPlan.variantTreeNotObserved),
  );
  const latePlan = inferResponsivePlan(routeSiteSpec(), { pages: [latePage] });
  check(
    // P0: served 801 ≠ its only change width 1025, so 1025 IS unserved now.
    "…a geometry-only route whose only change is its INFERRED switch names it once served at the policy",
    latePlan.records.length === 1 &&
      latePlan.records[0]?.inferredUnservedChangeWidths?.length === 0 &&
      JSON.stringify(latePlan.records[0]?.unservedChangeWidths) === "[1025]" &&
      JSON.stringify(latePlan.variantTreeNotObserved) ===
        JSON.stringify([variantTreeNotObservedCode(1025)]),
    JSON.stringify(latePlan.records),
  );
  const lateSwapPage = withFingerprints(latePage, [
    fp(1000, 300, "a"),
    fp(1000, 300, "a"),
    fp(1000, 300, "a"),
    fp(1000, 300, "a"),
    fp(1000, 700, "b"),
    fp(1000, 700, "b"),
  ]);
  const lateSwapPlan = inferResponsivePlan(routeSiteSpec(), { pages: [lateSwapPage] });
  check(
    "…and a route whose only measured change IS its SERVED switch names nothing",
    lateSwapPlan.records.length === 1 &&
      lateSwapPlan.records[0]?.servedSwitch?.value === 1025 &&
      lateSwapPlan.records[0]?.unservedChangeWidths.length === 0 &&
      lateSwapPlan.variantTreeNotObserved.length === 0,
    JSON.stringify(lateSwapPlan.records),
  );
  // …and where a route DOES earn its own switch, the mobile tree stops being
  // served above it: silence is what §26.4 forbids, on both sides.
  const twoPagePlan = inferResponsivePlan(routeSiteSpec(), {
    pages: [earlyPage, latePage],
  });
  // 28.8 A1: was `[...twoPagePlan.byPageId]`, which the site-wide policy now
  // leaves empty on purpose. The per-route INFERENCE is what this test is
  // about, and it still disagrees exactly where it always did.
  const overrides = [...inferredRouteOverrides(twoPagePlan)].map(([pageId, breakpoint]) => ({
    pageId,
    breakpoint,
  }));
  const css = globalsCss(twoPagePlan.site, undefined, overrides);
  check(
    "the overridden route swaps trees at ITS width, not at the site's",
    css.includes('@media (min-width: 641px) {\n  [data-wr-page="p000001"][data-wr-viewport="mobile"]') &&
      css.includes('@media (max-width: 640.98px) {\n  [data-wr-page="p000001"][data-wr-viewport="desktop"]'),
    css.slice(css.indexOf("PER-ROUTE"), css.indexOf("PER-ROUTE") + 400),
  );
  check(
    "…and the site-wide pair EXCLUDES it, so no width can hide both its trees",
    css.includes('[data-wr-viewport="desktop"]:not([data-wr-page="p000001"]) {') &&
      css.includes('[data-wr-viewport="mobile"]:not([data-wr-page="p000001"]) {') &&
      !css.includes(':not([data-wr-page="p000002"])'),
  );

  // --- (4) §26.5 — the probe axis and the serving layer read ONE number -----
  /*
   * THE SUBTLE FAILURE MODE. `resolveViewportProbe()` splits the probe widths at
   * the breakpoint: widths at or above it feed the DESKTOP variant's rules. If a
   * route is SERVED at 641 while its rules were inferred with the axis at 1440,
   * every desktop rule it ships was measured at a width where the desktop tree
   * was not the tree on screen. The fixture makes the two numbers disagree hard
   * enough that the axis has a visible consequence: at 1440 there is exactly one
   * desktop probe width, which is not two, and the pass refuses.
   */
  const axisWidths = [390, 640, 641, 1439, 1440];
  const axisTruthIndex = 4;
  const axisBoundaries = histogram([
    { px: 640, kind: "max", count: 10 },
    { px: 1439, kind: "max", count: 10 },
  ]);
  const axisEarly = buildTwoViewportPage(
    flippingTree(axisWidths, [{ atIndex: 2, nodes: 3 }]),
    {
      pageId: "p000001",
      authoredBreakpoints: axisBoundaries,
      desktopProbeWidths: axisWidths,
      desktopTruthIndex: axisTruthIndex,
    },
  );
  const axisLate = buildTwoViewportPage(
    flippingTree(axisWidths, [{ atIndex: 4, nodes: 4 }]),
    {
      pageId: "p000002",
      authoredBreakpoints: axisBoundaries,
      desktopProbeWidths: axisWidths,
      desktopTruthIndex: axisTruthIndex,
    },
  );
  const axisPlan = inferResponsivePlan(routeSiteSpec(), {
    pages: [axisEarly.page, axisLate.page],
  });
  /*
   * 28.8 A1 — the two grains are read off the INFERENCE, not off the served
   * policy width. §26.5's invariant is that the probe axis and the serving layer
   * use ONE number per route, and the number in question is whatever map the
   * generator hands both of them; the fixture's job is only to make the two
   * grains disagree hard enough for the axis to have a visible consequence.
   */
  const axisOverrides = inferredRouteOverrides(axisPlan);
  const axisSiteInferred = axisPlan.site.inferredAuthoredPx ?? axisPlan.site.value;
  const servedEarly = axisOverrides.get("p000001") ?? axisSiteInferred;
  check(
    "the fixture's two grains genuinely disagree, so the invariant has teeth",
    axisSiteInferred === 1440 && servedEarly === 641,
    `site ${axisSiteInferred}, route ${servedEarly}`,
  );
  check(
    // P0 §C2.6: still 801 because neither route carries fingerprint/bisection
    // evidence — both routes inherit the grade-4 site switch.
    "(A1) …while the width the site actually SERVES is the policy's, on both routes",
    axisPlan.site.value === 801 &&
      breakpointForPage(axisPlan, "p000001") === 801 &&
      breakpointForPage(axisPlan, "p000002") === 801 &&
      axisPlan.records.every(
        (r) => r.servedSwitch?.inherited === true && r.servedSwitch.grade === "product-policy",
      ),
    `${axisPlan.site.value}`,
  );
  const axisAtSite = resolveViewportProbe(axisEarly.page, "desktop", {
    breakpoint: axisSiteInferred,
    truthWidth: 1440,
  });
  const axisAtRoute = resolveViewportProbe(axisEarly.page, "desktop", {
    breakpoint: servedEarly,
    truthWidth: 1440,
  });
  check(
    "…and the axis they imply is genuinely different, not the same list twice",
    !axisAtSite.ok &&
      axisAtSite.reason === "fewer-than-two-widths" &&
      axisAtRoute.ok &&
      axisAtRoute.variantIdx.length === 3,
    `${JSON.stringify(axisAtSite)} / ${axisAtRoute.ok ? axisAtRoute.variantIdx.length : "refused"}`,
  );
  const inferredWithMap = inferLayoutRules({
    pages: [axisEarly.page],
    styleLookup: axisEarly.styleLookup,
    breakpoint: axisSiteInferred,
    breakpointByPageId: axisOverrides,
  });
  const inferredWithout = inferLayoutRules({
    pages: [axisEarly.page],
    styleLookup: axisEarly.styleLookup,
    breakpoint: axisSiteInferred,
  });
  check(
    "§26.5 — layout inference splits the probe axis at the width the route SERVES",
    inferredWithMap.counters.viewportPassesUsed["desktop"] === 1 &&
      inferredWithout.counters.viewportPassRefusals["desktop:fewer-than-two-widths"] === 1 &&
      inferredWithout.counters.viewportPassesUsed["desktop"] === undefined,
    `${JSON.stringify(inferredWithMap.counters.viewportPassesUsed)} / ${JSON.stringify(inferredWithout.counters.viewportPassRefusals)}`,
  );
  const cssAxis = globalsCss({ ...axisPlan.site, value: axisSiteInferred }, undefined, [
    { pageId: "p000001", breakpoint: servedEarly },
  ]);
  check(
    "…and it is the SAME number the stylesheet serves that route at",
    cssAxis.includes(`@media (min-width: ${servedEarly}px) {\n  [data-wr-page="p000001"]`) &&
      breakpointMediaQueries(servedEarly).desktop === `(min-width: ${servedEarly}px)`,
  );

  // --- (5) back-compat: a pre-§26 artifact still parses and still serves ----
  const oldRouteMaps = collectPreTaskArtifacts(
    "app/reconstruction-data/route-map.json",
    (raw) => (raw as { pageBreakpoints?: unknown }).pageBreakpoints === undefined,
  );
  check(
    "at least two pre-§26 route maps exist on disk to check against",
    oldRouteMaps.length >= 2,
    `${oldRouteMaps.length} found`,
  );
  check(
    "…each carries the scalar `breakpoint` and no per-route map, and still parses",
    oldRouteMaps.length >= 2 &&
      oldRouteMaps.every((raw) => {
        const map = raw as { breakpoint?: unknown; routes?: unknown[]; pageBreakpoints?: unknown };
        return (
          typeof map.breakpoint === "number" &&
          map.pageBreakpoints === undefined &&
          Array.isArray(map.routes)
        );
      }),
  );
  const oldManifests = collectPreTaskArtifacts(
    "reconstruction-manifest.json",
    (raw) =>
      (raw as { config?: { routeBreakpoints?: unknown } }).config?.routeBreakpoints ===
      undefined,
  );
  check(
    "…and two pre-§26 manifests parse under the current schema with the field absent",
    oldManifests.length >= 2 &&
      oldManifests.every((raw) => {
        const parsed = ReconstructionManifestSchema.safeParse(raw);
        return parsed.success && parsed.data.config.routeBreakpoints === undefined;
      }),
    `${oldManifests.length} found`,
  );
  check(
    "…and a scalar-only breakpoint still SERVES: the unscoped pair, byte for byte",
    (() => {
      const old = oldRouteMaps[0] as { breakpoint: number };
      const spec = { ...soloPlan.site, value: old.breakpoint };
      const served = globalsCss(spec);
      return (
        served.includes(`@media (max-width: ${(old.breakpoint - 0.02).toFixed(2)}px)`) &&
        served.includes('[data-wr-viewport="desktop"] {') &&
        !served.includes("PER-ROUTE")
      );
    })(),
  );
}

// ---------------------------------------------------------------------------
// Part 15b — Responsive Core P0 §C2.6: the SERVED switch is GRADED by evidence
// ---------------------------------------------------------------------------

/** Attach C1.6 family-switch bisections to a fixture page's desktop probe. */
function withBisections<T>(
  page: T,
  bisections: Array<{
    lo: number;
    hi: number;
    lower: LayoutProbeFingerprint;
    upper: LayoutProbeFingerprint;
    converged?: boolean;
  }>,
): T {
  const source = page as unknown as { layoutProbe: Record<string, unknown> };
  return {
    ...(page as object),
    layoutProbe: {
      ...source.layoutProbe,
      familySwitchBisections: bisections.map((b) => ({
        pairLo: b.lo - 50,
        pairHi: b.hi + 50,
        lo: b.lo,
        hi: b.hi,
        loFingerprint: b.lower,
        hiFingerprint: b.upper,
        steps: 7,
        converged: b.converged ?? true,
      })),
    },
  } as unknown as T;
}

/**
 * Part 15b — P0-G. 28.8-fast A1 served 801 on every site; the user approved
 * reversing it WHEN stronger evidence exists. These checks pin each grade, their
 * precedence, the per-route rule and the negatives, on synthetic pages only.
 */
function gradedServedSwitchChecks(): void {
  section("Part 15b — P0 §C2.6: the served tree switch is graded by evidence");
  const endpointsSpec = routeSiteSpec();
  const f = (elements: number, rendered: number, structure: string): LayoutProbeFingerprint => ({
    elements,
    rendered,
    structure,
    truncated: false,
  });
  const twoBoundaries = histogram([
    { px: 640, kind: "max", count: 10 },
    { px: 1024, kind: "max", count: 10 },
  ]);
  const geometryPage = (pageId: string, withHistogram = true) =>
    buildTwoViewportPage(
      flippingTree(ROUTE_PROBE_WIDTHS, [
        { atIndex: 2, nodes: 2 },
        { atIndex: 4, nodes: 5 },
      ]),
      {
        pageId,
        ...(withHistogram ? { authoredBreakpoints: twoBoundaries } : {}),
        desktopProbeWidths: ROUTE_PROBE_WIDTHS,
        desktopTruthIndex: ROUTE_TRUTH_INDEX,
      },
    ).page;
  // Family swaps across 640|641 (size 600) and nowhere else.
  const earlyFingerprints = [
    f(1000, 300, "narrow"),
    f(1000, 300, "narrow"),
    f(1000, 900, "wide"),
    f(1000, 900, "wide"),
    f(1000, 900, "wide"),
    f(1000, 900, "wide"),
  ];
  // Family swaps across 1024|1025 (size 200) and nowhere else.
  const lateFingerprints = [
    f(1000, 300, "a"),
    f(1000, 300, "a"),
    f(1000, 300, "a"),
    f(1000, 300, "a"),
    f(1000, 500, "b"),
    f(1000, 500, "b"),
  ];
  const withFp = <T,>(page: T, fps: LayoutProbeFingerprint[]): T => {
    const source = page as unknown as { layoutProbe: object };
    return { ...(page as object), layoutProbe: { ...source.layoutProbe, fingerprints: fps } } as unknown as T;
  };

  // (1) authored + observed agree → grade 2 serves the authored width.
  const agree = withFp(geometryPage("p000001"), earlyFingerprints);
  const agreePlan = inferResponsivePlan(endpointsSpec, { pages: [agree] });
  check(
    "(G2) authored breakpoint AND observed family swap agree → served, grade authored-observed",
    agreePlan.site.value === 641 &&
      agreePlan.site.provenance === "authored-observed" &&
      agreePlan.site.method === "authored-observed" &&
      agreePlan.site.servedSwitch?.grade === "authored-observed" &&
      agreePlan.site.servedSwitch.evidence.candidatePx === 641 &&
      agreePlan.site.servedSwitch.evidence.familyChange === 600 &&
      agreePlan.site.servedSwitch.evidence.authoredWeight === 10 &&
      agreePlan.site.policyClamped === undefined,
    JSON.stringify(agreePlan.site.servedSwitch),
  );
  check(
    "(G2) …the media queries follow the served value, and the inference is still carried",
    breakpointMediaQueries(agreePlan.site.value).desktop === "(min-width: 641px)" &&
      agreePlan.site.inferredAuthoredPx === 641 &&
      agreePlan.site.ambiguous === true &&
      agreePlan.byPageId.size === 0 &&
      agreePlan.records[0]?.servedSwitch?.grade === "authored-observed" &&
      agreePlan.records[0]?.servedSwitch?.inherited === undefined,
    `ambiguous=${agreePlan.site.ambiguous}`,
  );

  // (2) authored only, fingerprints READ but constant → no swap → 801.
  const authoredOnly = withFp(
    geometryPage("p000001"),
    ROUTE_PROBE_WIDTHS.map(() => f(1000, 900, "one-family")),
  );
  const authoredOnlyPlan = inferResponsivePlan(endpointsSpec, { pages: [authoredOnly] });
  check(
    "(G4) authored breakpoints with a constant fingerprint (no family swap) → policy 801",
    authoredOnlyPlan.site.value === 801 &&
      authoredOnlyPlan.site.servedSwitch?.grade === "product-policy" &&
      authoredOnlyPlan.site.provenance === "product-policy" &&
      authoredOnlyPlan.site.inferredAuthoredPx === 1025 &&
      authoredOnlyPlan.byPageId.size === 0,
    `${authoredOnlyPlan.site.value} ${authoredOnlyPlan.site.servedSwitch?.reason}`,
  );

  // (3) observed-only: no authored histogram, a converged 1px bisection → served.
  const bisected = withBisections(geometryPage("p000001", false), [
    { lo: 767, hi: 768, lower: f(1000, 300, "m"), upper: f(1000, 700, "d") },
  ]);
  const bisectedPlan = inferResponsivePlan(endpointsSpec, { pages: [bisected] });
  check(
    "(G3) a converged 1px family-switch bisection with no authored candidate → served, observed-only",
    bisectedPlan.site.value === 768 &&
      bisectedPlan.site.provenance === "observed-only" &&
      bisectedPlan.site.method === "observed-only" &&
      bisectedPlan.site.servedSwitch?.grade === "observed-only" &&
      bisectedPlan.site.servedSwitch.evidence.bisection?.hi === 768 &&
      bisectedPlan.site.servedSwitch.evidence.bisection?.lo === 767 &&
      bisectedPlan.site.servedSwitch.evidence.familyChange === 400 &&
      bisectedPlan.site.servedSwitch.evidence.bisection?.probe === "desktop" &&
      bisectedPlan.site.inferredAuthoredMethod === "observed-endpoint-midpoint",
    JSON.stringify(bisectedPlan.site.servedSwitch),
  );
  // Review fix MAJOR-5 — a structure-only swap (rendered count unchanged, size 0)
  // located on ONE page is a possible timing artifact and is not used; the same
  // bracket located on TWO pages is.
  {
    const structureOnly = (pageId: string) =>
      withBisections(geometryPage(pageId, false), [
        { lo: 767, hi: 768, lower: f(1000, 300, "m"), upper: f(1000, 300, "d") },
      ]);
    const single = inferResponsivePlan(endpointsSpec, { pages: [structureOnly("p000001")] });
    check(
      "(G3) NEGATIVE (review MAJOR-5) — one page, structure-only bisection (size 0) → not used, policy 801",
      single.site.value === 801 &&
        single.site.servedSwitch?.grade === "product-policy" &&
        (single.site.servedSwitch?.reason ?? "").includes("1 single-page structure-only"),
      `${single.site.value} ${single.site.servedSwitch?.reason}`,
    );
    const two = inferResponsivePlan(endpointsSpec, { pages: [structureOnly("p000001"), structureOnly("p000002")] });
    check(
      "(G3) review MAJOR-5 — the same structure-only bracket on TWO pages → served observed-only 768",
      two.site.value === 768 &&
        two.site.servedSwitch?.grade === "observed-only" &&
        two.site.servedSwitch.evidence.bisectionPages === 2,
      `${two.site.value} ${JSON.stringify(two.site.servedSwitch)}`,
    );
  }
  check(
    "(G3) NEGATIVE — an UNCONVERGED bisection locates nothing → policy 801",
    inferResponsivePlan(endpointsSpec, {
      pages: [
        withBisections(geometryPage("p000001", false), [
          { lo: 767, hi: 768, lower: f(1000, 300, "m"), upper: f(1000, 700, "d"), converged: false },
        ]),
      ],
    }).site.servedSwitch?.grade === "product-policy",
  );
  check(
    "(G3) NEGATIVE — a 1px bracket whose fingerprints do not differ locates nothing → 801",
    inferResponsivePlan(endpointsSpec, {
      pages: [
        withBisections(geometryPage("p000001", false), [
          { lo: 767, hi: 768, lower: f(1000, 900, "s"), upper: f(1000, 902, "s") },
        ]),
      ],
    }).site.value === 801,
  );
  check(
    "(G3) NEGATIVE — a bracket wider than 1px, or outside (mobile, desktop], is not served",
    inferResponsivePlan(endpointsSpec, {
      pages: [
        withBisections(geometryPage("p000001", false), [
          { lo: 760, hi: 768, lower: f(1000, 300, "m"), upper: f(1000, 700, "d") },
          { lo: 1499, hi: 1500, lower: f(1000, 300, "m"), upper: f(1000, 700, "d") },
          { lo: 380, hi: 381, lower: f(1000, 300, "m"), upper: f(1000, 700, "d") },
        ]),
      ],
    }).site.servedSwitch?.grade === "product-policy",
  );
  // Authored candidates 641 / 1025 exist but no fingerprint observed a swap;
  // a bisection at 1026 sits within ±1px of the authored 1025 and is grade-2
  // territory, not grade 3 — so it is excluded and the policy ships.
  const nearAuthored = withBisections(geometryPage("p000001"), [
    { lo: 1025, hi: 1026, lower: f(1000, 300, "m"), upper: f(1000, 700, "d") },
  ]);
  const nearAuthoredPlan = inferResponsivePlan(endpointsSpec, { pages: [nearAuthored] });
  check(
    "(G3) NEGATIVE — a bisection within ±1px of an authored candidate is not observed-only",
    nearAuthoredPlan.site.value === 801 &&
      nearAuthoredPlan.site.servedSwitch?.grade === "product-policy" &&
      (nearAuthoredPlan.site.servedSwitch?.reason ?? "").includes("1 near authored"),
    nearAuthoredPlan.site.servedSwitch?.reason,
  );

  // (4) grade 2 AND grade 3 present → grade 2, even with the bigger grade-3 swap.
  const both = withBisections(withFp(geometryPage("p000001"), earlyFingerprints), [
    { lo: 767, hi: 768, lower: f(1000, 100, "m"), upper: f(1000, 1000, "d") },
  ]);
  const bothPlan = inferResponsivePlan(endpointsSpec, { pages: [both] });
  check(
    "(G2>G3) grade-2 evidence beats a LARGER grade-3 bisection",
    bothPlan.site.value === 641 &&
      bothPlan.site.servedSwitch?.grade === "authored-observed" &&
      bothPlan.byPageId.size === 0,
    `${bothPlan.site.value} ${bothPlan.site.servedSwitch?.grade}`,
  );

  // (5) per route: own grade-2 differing → byPageId; no evidence → inherits.
  const routeEarly = withFp(geometryPage("p000001"), earlyFingerprints);
  const routeLate = withFp(geometryPage("p000002"), lateFingerprints);
  const routeNone = geometryPage("p000003");
  const routePlan = inferResponsivePlan(endpointsSpec, { pages: [routeEarly, routeLate, routeNone] });
  const recordOf = (id: string) => routePlan.records.find((r) => r.pageId === id);
  check(
    "(route) site takes the strongest grade-2 swap; a route with its OWN differing grade-2 lands in byPageId",
    routePlan.site.value === 641 &&
      routePlan.site.servedSwitch?.grade === "authored-observed" &&
      routePlan.byPageId.size === 1 &&
      routePlan.byPageId.get("p000002") === 1025 &&
      breakpointForPage(routePlan, "p000002") === 1025 &&
      recordOf("p000002")?.servedSwitch?.value === 1025 &&
      recordOf("p000002")?.servedSwitch?.grade === "authored-observed" &&
      recordOf("p000002")?.servedSwitch?.inherited === undefined,
    JSON.stringify([...routePlan.byPageId]),
  );
  check(
    "(route) …a route whose own grade-2 equals the site is NOT in byPageId",
    !routePlan.byPageId.has("p000001") &&
      recordOf("p000001")?.servedSwitch?.value === 641 &&
      recordOf("p000001")?.servedSwitch?.inherited === undefined,
  );
  check(
    "(route) …a route with NO evidence of its own inherits the site value and grade, and says so",
    !routePlan.byPageId.has("p000003") &&
      breakpointForPage(routePlan, "p000003") === 641 &&
      recordOf("p000003")?.servedSwitch?.inherited === true &&
      recordOf("p000003")?.servedSwitch?.grade === "authored-observed" &&
      recordOf("p000003")?.servedSwitch?.value === 641 &&
      // its own INFERENCE is still carried, unchanged
      recordOf("p000003")?.breakpoint === 1025,
    JSON.stringify(recordOf("p000003")?.servedSwitch),
  );
  check(
    "(route) served-width limitations: an inheriting geometry route names the width it is NOT served at",
    // p000003 changes at 641 and 1025, infers 1025, is served 641 (inherited).
    JSON.stringify(recordOf("p000003")?.unservedChangeWidths) === "[1025]" &&
      JSON.stringify(recordOf("p000003")?.inferredUnservedChangeWidths) === "[641]" &&
      recordOf("p000003")?.differsFromSite === false &&
      recordOf("p000003")?.inferredDiffersFromSite === true &&
      recordOf("p000002")?.differsFromSite === true &&
      JSON.stringify(recordOf("p000002")?.unservedChangeWidths) === "[]",
    JSON.stringify(routePlan.records.map((r) => [r.pageId, r.unservedChangeWidths, r.differsFromSite])),
  );
  /*
   * linear-p000002-like: the route's OWN family swap is at 1025, but its own
   * authored entry there carries no weight, so it has no grade-2 evidence and
   * inherits the site's 641. The served tree never observes the 1025 family
   * change, so the limitation must name 1025 — and the inference (which swaps
   * at 1025) named nothing.
   */
  const weightlessLate = withFp(
    buildTwoViewportPage(
      flippingTree(ROUTE_PROBE_WIDTHS, [{ atIndex: 4, nodes: 3 }]),
      {
        pageId: "p000002",
        authoredBreakpoints: histogram([{ px: 1024, kind: "max", count: 0 }]),
        desktopProbeWidths: ROUTE_PROBE_WIDTHS,
        desktopTruthIndex: ROUTE_TRUTH_INDEX,
      },
    ).page,
    lateFingerprints,
  );
  const inheritPlan = inferResponsivePlan(endpointsSpec, { pages: [routeEarly, weightlessLate] });
  const inheritRecord = inheritPlan.records.find((r) => r.pageId === "p000002");
  check(
    "(route) inferred 1025 / served 641 inherited → the 1025 FAMILY change is named unserved",
    inheritPlan.site.value === 641 &&
      inheritRecord?.breakpoint === 1025 &&
      inheritRecord.servedSwitch?.inherited === true &&
      inheritRecord.servedSwitch.value === 641 &&
      JSON.stringify(inheritRecord.familyChangeWidths) === "[1025]" &&
      JSON.stringify(inheritRecord.unservedChangeWidths) === "[1025]" &&
      JSON.stringify(inheritRecord.inferredUnservedChangeWidths) === "[]" &&
      inheritRecord.differsFromSite === false &&
      !inheritPlan.byPageId.has("p000002") &&
      inheritPlan.variantTreeNotObserved.includes(variantTreeNotObservedCode(1025)),
    JSON.stringify(inheritRecord),
  );
  const routeCss = globalsCss(
    routePlan.site,
    undefined,
    [...routePlan.byPageId].map(([pageId, breakpoint]) => ({ pageId, breakpoint })),
  );
  check(
    "(route) …and globals.css scopes exactly that route at its own served width",
    routeCss.includes('@media (min-width: 1025px) {\n  [data-wr-page="p000002"][data-wr-viewport="mobile"]') &&
      routeCss.includes('[data-wr-viewport="desktop"]:not([data-wr-page="p000002"]) {') &&
      routeCss.includes("(min-width: 641px)"),
  );
  // A route with its OWN grade-3 evidence while the site is grade 2.
  const routeBisected = withBisections(geometryPage("p000004", false), [
    { lo: 899, hi: 900, lower: f(1000, 300, "m"), upper: f(1000, 700, "d") },
  ]);
  const g3RoutePlan = inferResponsivePlan(endpointsSpec, { pages: [routeEarly, routeBisected] });
  check(
    "(route) a route with its OWN observed-only evidence is served its own width under a grade-2 site",
    g3RoutePlan.site.value === 641 &&
      g3RoutePlan.site.servedSwitch?.grade === "authored-observed" &&
      g3RoutePlan.byPageId.get("p000004") === 900 &&
      g3RoutePlan.records.find((r) => r.pageId === "p000004")?.servedSwitch?.grade === "observed-only",
    JSON.stringify([...g3RoutePlan.byPageId]),
  );

  // (6) operator override wins over grade 2, site-wide, no per-route map.
  const overridePlan = inferResponsivePlan(endpointsSpec, {
    pages: [routeEarly, routeLate, routeNone],
    override: 700,
  });
  check(
    "(G1) an operator override beats grade-2 evidence, site-wide, with an empty byPageId",
    overridePlan.site.value === 700 &&
      overridePlan.site.servedSwitch?.grade === "operator-override" &&
      overridePlan.byPageId.size === 0 &&
      breakpointForPage(overridePlan, "p000002") === 700,
  );

  // (7) the manifest schema accepts the new provenance/method/servedSwitch.
  check(
    "(schema) BreakpointSpec + route records with servedSwitch parse under the manifest schema",
    BreakpointSpecSchema.safeParse(routePlan.site).success &&
      BreakpointSpecSchema.safeParse(bisectedPlan.site).success &&
      BreakpointSpecSchema.safeParse(overridePlan.site).success &&
      routePlan.records.every((r) => PageBreakpointRecordSchema.safeParse(r).success),
  );
}

// ---------------------------------------------------------------------------
// Part 16 — Task 28.7 §27: the tree switch is chosen from an OBSERVED swap
//
// THE DEFECT. Every width signal this module had was the GEOMETRY of the probe's
// parked nodes, and a CSS reflow and a served-variant swap move geometry
// identically. Measured on linear.app `/`: 1,868 geometry-changed nodes at 1025
// against 1,783 at 641 — inside 5% — so the ranker took the larger, the clone
// swapped trees at 1025, and 700px and 1024px viewports were served the 390px
// mobile tree. `domSwitchWidthObserved` was hardcoded `false` on every path,
// and it was false precisely because nothing had ever observed a swap.
//
// §27 adds the layout probe's per-width DOM-FAMILY FINGERPRINT and lets it
// decide. These checks pin the three outcomes that matter and the two the
// mechanism must NOT produce:
//
//   • with fingerprint evidence, the switch lands on the observed swap and
//     `domSwitchWidthObserved` is true;
//   • with NO fingerprint (every artifact on disk today), the decision is the
//     one that shipped before §27, ranked by the untouched geometry ranker;
//   • with a CONSTANT fingerprint, nothing is invented — a purely CSS-responsive
//     site genuinely has no DOM swap and must not be given one;
//   • a truncated fingerprint cannot prove an EQUALITY, so it claims none;
//   • `variant-tree-not-observed-at-<px>` stops naming widths where only boxes
//     moved, and keeps naming widths where a second family really was seen.
//
// Generic geometry throughout: synthetic pages, a probe grid and an authored
// histogram. No host, selector or pixel value from any real site.
// ---------------------------------------------------------------------------

/** One width's DOM-family fingerprint, as the probe writes it. */
const fp = (
  elements: number,
  rendered: number,
  structure: string,
  truncated = false,
): LayoutProbeFingerprint => ({ elements, rendered, structure, truncated });

/**
 * Attach a per-width fingerprint array to a fixture page WITHOUT touching the
 * builder every other Part uses — so "the same page, with and without §27
 * evidence" is provably the same page.
 */
function withFingerprints<T>(page: T, fingerprints: LayoutProbeFingerprint[]): T {
  const source = page as unknown as { layoutProbe: { widths: number[] } };
  return {
    ...(page as object),
    layoutProbe: { ...source.layoutProbe, fingerprints },
  } as unknown as T;
}

function familyFingerprintChecks(): void {
  section("Part 16 — §27: the tree switch is chosen from an OBSERVED family swap");

  // --- (0) the predicate itself, on the numbers that justified its threshold --
  // Adjacent samples of the SAME family on a live page, and a real swap, both
  // taken from linear.app's own desktop probe. The threshold has to separate
  // these two columns or it separates nothing.
  check(
    "(0) sub-1% drift between adjacent samples is NOT a family change",
    familyChangeVerdict(fp(2306, 2084, "a"), fp(2306, 2095, "a")) === "unchanged" &&
      familyChangeVerdict(fp(1363, 796, "a"), fp(1363, 802, "a")) === "unchanged",
  );
  check(
    "(0) …while an 11% move and a 175% move both ARE",
    familyChangeVerdict(fp(2306, 1874, "a"), fp(2306, 2084, "a")) === "changed" &&
      familyChangeVerdict(fp(2306, 732, "a"), fp(2306, 1883, "a")) === "changed",
  );
  check(
    "(0) …and the absolute floor stops a tiny page qualifying on a handful",
    familyChangeVerdict(fp(120, 100, "a"), fp(120, 104, "a")) === "unchanged" &&
      familyChangeVerdict(fp(120, 100, "a"), fp(120, 108, "a")) === "changed",
    `floor ${FAMILY_CHANGE_MIN_ELEMENTS} / ratio ${FAMILY_CHANGE_MIN_RATIO}`,
  );
  check(
    "(0) a STRUCTURE change with both counts EXACTLY equal is a same-size swap",
    familyChangeVerdict(fp(500, 400, "aaa"), fp(500, 400, "bbb")) === "changed" &&
      familyChangeSize(fp(500, 400, "aaa"), fp(500, 400, "bbb")) === 0,
  );
  check(
    "(0) …but a structure change WITH a count move is a tweak, not a swap",
    // linear.app /pricing 640→641: six of 796 rendered boxes move and the
    // shallow hash changes. A hash difference on its own would nominate it.
    familyChangeVerdict(fp(1363, 796, "6c6a16ff"), fp(1363, 802, "340bc8fb")) === "unchanged",
  );
  check(
    "(0) a TRUNCATED fingerprint cannot prove an equality, only a difference",
    familyChangeVerdict(fp(8000, 400, "a", true), fp(8000, 400, "a")) === "unproven" &&
      familyChangeVerdict(fp(8000, 400, "a", true), fp(8000, 900, "a")) === "changed",
  );

  /*
   * The page every case below is built from. Its GEOMETRY changes more at 1025
   * (five nodes) than at 641 (two), so the pre-§27 ranker prefers 1025 — the
   * exact shape of the linear.app defect, reproduced with synthetic nodes.
   */
  const twoBoundaries = histogram([
    { px: 640, kind: "max", count: 10 },
    { px: 1024, kind: "max", count: 10 },
  ]);
  const geometryPrefersLate = buildTwoViewportPage(
    flippingTree(ROUTE_PROBE_WIDTHS, [
      { atIndex: 2, nodes: 2 },
      { atIndex: 4, nodes: 5 },
    ]),
    {
      pageId: "p000001",
      authoredBreakpoints: twoBoundaries,
      desktopProbeWidths: ROUTE_PROBE_WIDTHS,
      desktopTruthIndex: ROUTE_TRUTH_INDEX,
    },
  ).page;

  const endpoints = {
    mobileWidth: ROUTE_MOBILE_ENDPOINT,
    desktopWidth: ROUTE_DESKTOP_ENDPOINT,
  };

  // --- (1) NO fingerprint: byte-identical to the decision that shipped -------
  const noFingerprint = chooseTreeSwitch({ pages: [geometryPrefersLate], ...endpoints });
  check(
    "(1) with no fingerprint the geometry winner still ships, exactly as before",
    noFingerprint.px === 1025 && noFingerprint.snapped && noFingerprint.chosen?.px === 1025,
    `${noFingerprint.px}`,
  );
  check(
    "(1) …the reported order is the UNTOUCHED geometry ranking, candidate for candidate",
    JSON.stringify(noFingerprint.candidates.map((c) => c.px)) ===
      JSON.stringify(
        rankTreeSwitchCandidates(noFingerprint.candidates, noFingerprint.midpointPx).map(
          (c) => c.px,
        ),
      ),
    JSON.stringify(noFingerprint.candidates.map((c) => c.px)),
  );
  check(
    "(1) …and nothing claims to have observed a swap",
    noFingerprint.domSwitchWidthObserved === false &&
      noFingerprint.pagesWithFingerprint === 0 &&
      noFingerprint.perPage.every((p) => p.domSwitchWidthObserved === false) &&
      noFingerprint.candidates.every(
        (c) => c.familyChangePages === 0 && !c.familyChangeObserved && c.familyChange === 0,
      ),
    `observed=${noFingerprint.domSwitchWidthObserved} pages=${noFingerprint.pagesWithFingerprint}`,
  );

  // --- (2) fingerprint evidence OUTRANKS the geometry it disagrees with ------
  // The family swaps across 640→641 and holds everywhere else. Widths are
  // [390, 640, 641, 1024, 1025, 1440]; the tight brackets are 640|641 and
  // 1024|1025, which is what makes both candidates attributable at all.
  const swapsEarly = withFingerprints(geometryPrefersLate, [
    fp(1000, 300, "narrow"),
    fp(1000, 300, "narrow"),
    fp(1000, 900, "wide"),
    fp(1000, 900, "wide"),
    fp(1000, 900, "wide"),
    fp(1000, 900, "wide"),
  ]);
  const observedEarly = chooseTreeSwitch({ pages: [swapsEarly], ...endpoints });
  check(
    "(2) the switch moves to the width the probe WATCHED the family change at",
    observedEarly.px === 641 && observedEarly.snapped,
    `${observedEarly.px} (geometry alone chose ${noFingerprint.px})`,
  );
  check(
    "(2) …and `domSwitchWidthObserved` is finally TRUE, at both grains",
    observedEarly.domSwitchWidthObserved === true &&
      observedEarly.pagesWithFingerprint === 1 &&
      observedEarly.perPage[0]?.domSwitchWidthObserved === true &&
      observedEarly.perPage[0]?.px === 641,
    JSON.stringify(observedEarly.perPage[0]?.familyChangeWidths),
  );
  check(
    "(2) …with the size of the swap on the winner, and none on its rival",
    observedEarly.chosen?.familyChangeObserved === true &&
      observedEarly.chosen.familyChange === 600 &&
      observedEarly.chosen.familyChangePages === 1 &&
      observedEarly.candidates.find((c) => c.px === 1025)?.familyChangeObserved === false &&
      observedEarly.candidates.find((c) => c.px === 1025)?.familyChangePages === 1,
    JSON.stringify(observedEarly.chosen),
  );
  check(
    "(2) …and the geometry-preferred rival is still REPORTED, just outranked",
    observedEarly.candidateCount === 2 &&
      observedEarly.candidates.length === 2 &&
      observedEarly.candidates[0]?.px === 641 &&
      observedEarly.candidates[1]?.px === 1025,
    JSON.stringify(observedEarly.candidates.map((c) => c.px)),
  );

  // --- (3) a CONSTANT fingerprint invents nothing ---------------------------
  const cssResponsive = withFingerprints(
    geometryPrefersLate,
    ROUTE_PROBE_WIDTHS.map(() => fp(1000, 900, "one-family")),
  );
  const constant = chooseTreeSwitch({ pages: [cssResponsive], ...endpoints });
  check(
    "(3) a purely CSS-responsive page keeps the pre-§27 decision, unchanged",
    constant.px === noFingerprint.px &&
      JSON.stringify(constant.candidates.map((c) => c.px)) ===
        JSON.stringify(noFingerprint.candidates.map((c) => c.px)),
    `${constant.px}`,
  );
  check(
    "(3) …and says the evidence was READ and found no swap, not that it was missing",
    constant.domSwitchWidthObserved === false &&
      constant.pagesWithFingerprint === 1 &&
      constant.candidates.every((c) => c.familyChangePages === 1 && !c.familyChangeObserved),
    `pages=${constant.pagesWithFingerprint} observed=${constant.domSwitchWidthObserved}`,
  );

  // --- (4) a TRUNCATED fingerprint claims nothing ---------------------------
  const truncated = withFingerprints(
    geometryPrefersLate,
    ROUTE_PROBE_WIDTHS.map(() => fp(8000, 8000, "capped", true)),
  );
  const cappedDecision = chooseTreeSwitch({ pages: [truncated], ...endpoints });
  check(
    "(4) a walk that hit the cap cannot prove stillness, so it corroborates nothing",
    cappedDecision.px === noFingerprint.px &&
      cappedDecision.domSwitchWidthObserved === false &&
      cappedDecision.pagesWithFingerprint === 1 &&
      cappedDecision.candidates.every((c) => c.familyChangePages === 0),
    JSON.stringify(cappedDecision.candidates.map((c) => c.familyChangePages)),
  );

  // --- (5) two observed swaps: the BIGGEST ships, the other is NAMED ---------
  const swapsTwice = withFingerprints(geometryPrefersLate, [
    fp(1000, 300, "a"),
    fp(1000, 300, "a"),
    fp(1000, 900, "b"),
    fp(1000, 900, "b"),
    fp(1000, 1100, "c"),
    fp(1000, 1100, "c"),
  ]);
  const twicePlan = inferResponsivePlan(routeSiteSpec(), { pages: [swapsTwice] });
  check(
    "(5) a route that swaps twice swaps at the BIGGER one (600 elements over 200)",
    // 28.8 A1: the inference's answer moved from `site.value` to
    // `site.inferredAuthoredPx`; the per-route record is unchanged.
    twicePlan.site.inferredAuthoredPx === 641 && twicePlan.records[0]?.breakpoint === 641,
    `${twicePlan.site.inferredAuthoredPx} (served ${twicePlan.site.value})`,
  );
  check(
    "(5) …and names the width it cannot serve, because only two trees exist",
    JSON.stringify(twicePlan.records[0]?.unservedChangeWidths) === "[1025]" &&
      JSON.stringify(twicePlan.variantTreeNotObserved) ===
        JSON.stringify([variantTreeNotObservedCode(1025)]),
    JSON.stringify(twicePlan.variantTreeNotObserved),
  );

  // --- (6) the honest refusal STOPS over-reporting ---------------------------
  // Same page, same geometry, one observed swap. Before §27 the geometry named
  // both widths and the clone was blamed for a width it serves correctly.
  const earlyPlan = inferResponsivePlan(routeSiteSpec(), { pages: [swapsEarly] });
  const geometryOnlyPlan = inferResponsivePlan(routeSiteSpec(), {
    pages: [geometryPrefersLate],
  });
  check(
    "(6) with one observed swap the route serves it and names NOTHING else",
    earlyPlan.records[0]?.breakpoint === 641 &&
      earlyPlan.records[0]?.unservedChangeWidths.length === 0 &&
      earlyPlan.variantTreeNotObserved.length === 0,
    JSON.stringify(earlyPlan.records[0]?.unservedChangeWidths),
  );
  check(
    // Responsive Core P0: without the fingerprint nothing observed a swap, so
    // the route is served the policy 801 and BOTH geometry widths are unserved;
    // measured against its inference (1025) it still names the other width.
    "(6) …while the SAME page without the fingerprint still names the other width",
    JSON.stringify(geometryOnlyPlan.records[0]?.inferredUnservedChangeWidths) === "[641]" &&
      JSON.stringify(geometryOnlyPlan.records[0]?.unservedChangeWidths) === "[641,1025]" &&
      geometryOnlyPlan.records[0]?.servedSwitch?.value === 801,
    JSON.stringify(geometryOnlyPlan.records[0]?.unservedChangeWidths),
  );
  check(
    "(6) …and the manifest carries the §27 provenance at both grains",
    earlyPlan.site.domSwitchWidthObserved === true &&
      earlyPlan.site.pagesWithFingerprint === 1 &&
      earlyPlan.records[0]?.domSwitchWidthObserved === true &&
      JSON.stringify(earlyPlan.records[0]?.familyChangeWidths) === "[641]" &&
      geometryOnlyPlan.site.domSwitchWidthObserved === false,
    JSON.stringify(earlyPlan.site.domSwitchWidthObserved),
  );

  // --- (7) a same-size swap is caught by the structure hash alone ------------
  const sameSizeSwap = withFingerprints(geometryPrefersLate, [
    fp(1000, 900, "variant-a"),
    fp(1000, 900, "variant-a"),
    fp(1000, 900, "variant-b"),
    fp(1000, 900, "variant-b"),
    fp(1000, 900, "variant-b"),
    fp(1000, 900, "variant-b"),
  ]);
  const sameSize = chooseTreeSwitch({ pages: [sameSizeSwap], ...endpoints });
  check(
    "(7) a swap that changes WHAT renders and not HOW MANY is still observed",
    sameSize.px === 641 &&
      sameSize.domSwitchWidthObserved === true &&
      sameSize.chosen?.familyChangeObserved === true &&
      // No count moved, so this module refuses to invent a magnitude for it.
      sameSize.chosen.familyChange === 0,
    `${sameSize.px} size=${sameSize.chosen?.familyChange}`,
  );

  // --- (8) the fingerprint is NOT gated on probe attachment ------------------
  // A probe whose two page loads produced different element ORDER attaches no
  // per-element arrays — and still measured the live document correctly.
  const unattachable = {
    ...(swapsEarly as object),
    layoutProbe: {
      ...(swapsEarly as unknown as { layoutProbe: object }).layoutProbe,
      aligned: false,
      alignedElementCount: 0,
    },
  } as typeof swapsEarly;
  const candidatePx = [641, 1025];
  const geometryOnUnattachable = measureObservedChange([unattachable], candidatePx);
  const familyOnUnattachable = measureFingerprintChange([unattachable], candidatePx);
  check(
    "(8) a probe that attaches nothing yields NO geometry evidence — unchanged",
    geometryOnUnattachable.pagesWithUsableProbe === 0 && geometryOnUnattachable.byPage.size === 0,
  );
  check(
    "(8) …and yields FULL family evidence, because a census makes no per-element claim",
    familyOnUnattachable.pagesWithFingerprint === 1 &&
      familyOnUnattachable.byPage.get("p000001")?.changed.has(641) === true &&
      familyOnUnattachable.byPage.get("p000001")?.changed.has(1025) === false,
    JSON.stringify([...(familyOnUnattachable.byPage.get("p000001")?.changed ?? [])]),
  );

  // --- (9) per-ROUTE, still ------------------------------------------------
  const swapsLate = withFingerprints(
    buildTwoViewportPage(
      flippingTree(ROUTE_PROBE_WIDTHS, [
        { atIndex: 2, nodes: 2 },
        { atIndex: 4, nodes: 5 },
      ]),
      {
        pageId: "p000002",
        authoredBreakpoints: twoBoundaries,
        desktopProbeWidths: ROUTE_PROBE_WIDTHS,
        desktopTruthIndex: ROUTE_TRUTH_INDEX,
      },
    ).page,
    // A SMALLER swap (200 elements) than p000001's 600, so the site-wide MAX is
    // unambiguous. Two equal magnitudes would be a tie, and a tie is resolved by
    // the untouched geometry ranker — correct, but it would test that instead.
    [
      fp(1000, 300, "a"),
      fp(1000, 300, "a"),
      fp(1000, 300, "a"),
      fp(1000, 300, "a"),
      fp(1000, 500, "b"),
      fp(1000, 500, "b"),
    ],
  );
  const twoRoutes = chooseTreeSwitch({ pages: [swapsEarly, swapsLate], ...endpoints });
  check(
    "(9) two routes whose FAMILIES swap at different widths get different switches",
    twoRoutes.perPage.find((p) => p.pageId === "p000001")?.px === 641 &&
      twoRoutes.perPage.find((p) => p.pageId === "p000002")?.px === 1025 &&
      twoRoutes.perPage.every((p) => p.domSwitchWidthObserved),
    JSON.stringify(twoRoutes.perPage.map((p) => `${p.pageId}:${p.px}`)),
  );
  check(
    "(9) …and the site-wide default takes the biggest swap anyone saw, not their sum",
    twoRoutes.px === 641 && twoRoutes.chosen?.familyChange === 600,
    `${twoRoutes.px} size=${twoRoutes.chosen?.familyChange}`,
  );
}


// ---------------------------------------------------------------------------
// Part 11m — Task 28.75 §03b: BAND-AWARE grid column tracks
// ---------------------------------------------------------------------------

/**
 * Part 11m — a grid whose column COUNT changes at an authored breakpoint, and
 * the twins that keep the mechanism from answering anything else.
 *
 * THE MEASURED FINDING THIS ANSWERS. Across the four canary corpora there are
 * 641 grid containers (483 linear.app, 158 hobbang.net; gs.severance.healthcare
 * and seoultone.kr have none at all). 46 of them are refused
 * `tracks-not-reproducible-at-every-width`, and a per-width replay of the five
 * places that refusal fires shows the dominant cause is not a track that
 * wobbles: it is the container being a DIFFERENT GRID at other widths — one
 * column below an authored breakpoint and two above it, with the gutter and the
 * container's own padding changing at the same edge. No single track list can
 * describe that, so the single-band recovery is right to refuse and the frozen
 * used pixels ship.
 *
 * WHAT IS ASSERTED HERE, on fixtures that are arithmetic on a width array:
 *
 *   * POSITIVE — a container that is 1 column below 1200 and 2 above it gets one
 *     `grid-template-columns` per band, each inside its own `@media`, with the
 *     band edge snapped onto the breakpoint the fixture's histogram authors;
 *   * THE DISCRIMINATING TWIN — the SAME structure change, but with the two
 *     columns' split drifting continuously inside the upper band, is refused
 *     `band-track-not-fractional`. Banding is not what makes a track
 *     recoverable; a constant share is, and this is the check that separates
 *     them;
 *   * THE SECOND TWIN — a FIXED-size row inside a growing container, which
 *     changes structure at the same edge, is refused `band-insets-not-constant`:
 *     the row does not absorb the container's growth, so its columns are not a
 *     partition of the content box and `fr` weights would be a fabrication;
 *   * NEGATIVE CONTROL — a container whose structure never changes is refused
 *     `single-band`, which is what keeps this mechanism's domain disjoint from
 *     the single-band recovery's;
 *   * NEGATIVE CONTROL — a container the single-band recovery refuses for any
 *     OTHER reason is never offered to this pass at all;
 *   * NEGATIVE CONTROL — a coincidental tiling is still refused
 *     `not-every-track-witnessed` by the single-band pass, unchanged;
 *   * the container-level accounting still conserves.
 */

/** Two authored bands above the breakpoint, with real growth inside each. */
const BAND_WIDTHS = [390, 768, 1024, 1100, 1200, 1440, 1920];
const BAND_DESKTOP = [1024, 1100, 1200, 1440, 1920];
const BAND_TRUTH_INDEX = BAND_WIDTHS.indexOf(1440);
const BAND_EDGE_PX = 1200;
const BAND_GAP_PX = 20;

/** A histogram naming 1200 as a `min` breakpoint, inside the 1100…1200 probe gap. */
function bandGridHistogram(): AuthoredBreakpoints {
  return histogramOf([{ px: BAND_EDGE_PX, kind: "min", count: 40 }]);
}

interface BandGridOptions {
  /** Upper-band split of the free space between the two columns, per width. */
  upperSplit?: (width: number) => number;
  /** Upper band tracks are FIXED px rather than a share: the second twin. */
  fixedUpper?: boolean;
  /** Never change structure: one column at every width (the `single-band` control). */
  neverChanges?: boolean;
  /**
   * Upper-band left inset, per width. Used by the control that proves
   * `band-insets-not-constant` is reachable: the anchored run split keeps every
   * member within one tolerance of the run's FIRST structure, so a run can still
   * end up with a spread of two tolerances, and the per-band test is what
   * catches it.
   */
  upperLeftInset?: (width: number) => number;
}

/**
 * A grid that stacks in ONE column below {@link BAND_EDGE_PX} and sits in TWO
 * above it, inside a container that is the viewport.
 *
 * Both children are real boxes at every width, so nothing here turns on a child
 * appearing or disappearing: the only thing that changes at the edge is where
 * the browser put them.
 */
function bandGrid(options: BandGridOptions = {}): FixtureNode[] {
  const split = options.upperSplit ?? ((): number => 0.5);
  const twoColumns = (width: number): boolean =>
    !options.neverChanges && width >= BAND_EDGE_PX;
  const aW: number[] = [];
  const aX: number[] = [];
  const bW: number[] = [];
  const bX: number[] = [];
  for (const width of BAND_WIDTHS) {
    if (!twoColumns(width)) {
      aW.push(width);
      bW.push(width);
      bX.push(0);
      aX.push(0);
      continue;
    }
    if (options.fixedUpper) {
      // A fixed 590/590 row, left-anchored: the container's growth all lands in
      // the RIGHT inset, which is exactly what makes it not a partition.
      aW.push(590);
      bW.push(590);
      bX.push(590 + BAND_GAP_PX);
      aX.push(0);
      continue;
    }
    const inset = options.upperLeftInset?.(width) ?? 0;
    const free = width - BAND_GAP_PX - inset;
    const a = Math.round(free * split(width) * 100) / 100;
    aW.push(a);
    bW.push(Math.round((free - a) * 100) / 100);
    bX.push(Math.round((inset + a + BAND_GAP_PX) * 100) / 100);
    aX.push(inset);
  }
  const truthA = aW[BAND_TRUTH_INDEX]!;
  const truthB = bW[BAND_TRUTH_INDEX]!;
  return [
    { nodeId: "n001", tagName: "html", w: [...BAND_WIDTHS], props: { display: "block" } },
    {
      nodeId: "n002",
      tagName: "body",
      parentNodeId: "n001",
      w: [...BAND_WIDTHS],
      props: { display: "block" },
    },
    {
      nodeId: "g",
      tagName: "div",
      parentNodeId: "n002",
      w: [...BAND_WIDTHS],
      x: BAND_WIDTHS.map(() => 0),
      props: {
        display: "grid",
        "box-sizing": "border-box",
        "padding-left": "0px",
        "padding-right": "0px",
        "column-gap": `${BAND_GAP_PX}px`,
        "grid-template-columns": options.neverChanges
          ? `${truthA}px`
          : `${truthA}px ${truthB}px`,
      },
    },
    {
      nodeId: "ga",
      tagName: "div",
      parentNodeId: "g",
      w: aW,
      x: aX,
      props: { display: "block" },
    },
    {
      nodeId: "gb",
      tagName: "div",
      parentNodeId: "g",
      w: bW,
      x: bX,
      props: { display: "block" },
    },
  ];
}

/** Run `recoverGridTracksBanded()` over a fixture, by container node id. */
function bandTrackResult(
  nodes: readonly FixtureNode[],
  containerId: string,
  authored?: AuthoredBreakpoints,
): ReturnType<typeof recoverGridTracksBanded> {
  const built = buildPage(nodes, authored, BAND_WIDTHS);
  const container = built.specNodes.get(containerId)!;
  const children = container.childNodeIds.map((id) => built.specNodes.get(id)!);
  return recoverGridTracksBanded({
    node: container,
    children,
    styleLookup: built.styleLookup,
    variantIdx: BAND_WIDTHS.map((width, i) => ({ width, i })).filter(
      (entry) => entry.width >= 1024,
    ),
    truthIndex: BAND_TRUTH_INDEX,
    authored,
  });
}

/** The single-band recovery over the same denser axis, so the two agree on a fixture. */
function bandSingleResult(
  nodes: readonly FixtureNode[],
  containerId: string,
): ReturnType<typeof recoverGridTracks> {
  const built = buildPage(nodes, undefined, BAND_WIDTHS);
  const container = built.specNodes.get(containerId)!;
  const children = container.childNodeIds.map((id) => built.specNodes.get(id)!);
  return recoverGridTracks({
    node: container,
    children,
    styleLookup: built.styleLookup,
    variantIdx: BAND_WIDTHS.map((width, i) => ({ width, i })).filter(
      (entry) => entry.width >= 1024,
    ),
    truthIndex: BAND_TRUTH_INDEX,
  });
}

function bandedGridTrackChecks(): void {
  section("Part 11m — 28.75 §03b: grid tracks, one authored band at a time");

  // --- the refusal this mechanism is reached from, reproduced --------------
  const single = bandSingleResult(bandGrid(), "g");
  check(
    "a grid that changes column COUNT is refused by the single-band recovery",
    !single.ok && single.reason === "tracks-not-reproducible-at-every-width",
    JSON.stringify(single),
  );

  // --- POSITIVE ------------------------------------------------------------
  const banded = bandTrackResult(bandGrid(), "g", bandGridHistogram());
  check(
    "…and the banded recovery answers it with one track list PER BAND",
    banded.ok && banded.bands.length === 2,
    JSON.stringify(banded).slice(0, 300),
  );
  const lower = banded.ok ? banded.bands[0]! : undefined;
  const upper = banded.ok ? banded.bands[1]! : undefined;
  check(
    "the LOWER band is one fully fractional column",
    lower?.value === "minmax(0, 1fr)" && lower.columnCount === 1,
    JSON.stringify(lower?.value),
  );
  check(
    "the UPPER band is two equal fractional columns",
    upper?.value === "minmax(0, 1fr) minmax(0, 1fr)" && upper.columnCount === 2,
    JSON.stringify(upper?.value),
  );
  check(
    "the column GAP is co-emitted per band — the fr weights are shares against it",
    lower?.gapPx === 0 && upper?.gapPx === BAND_GAP_PX,
    `${lower?.gapPx} / ${upper?.gapPx}`,
  );
  check(
    "both band edges land on the breakpoint the fixture's histogram AUTHORS, not the probe midpoint",
    lower?.band.maxWidth === BAND_EDGE_PX &&
      upper?.band.minWidth === BAND_EDGE_PX &&
      lower?.band.edgeDecisions?.[0]?.source === "authored-breakpoint" &&
      lower.band.edgeDecisions[0].midpointPx === 1150,
    JSON.stringify(lower?.band.edgeDecisions),
  );
  check(
    "…and the emitted @media excludes the upper edge by 0.02px, as every band does",
    lower !== undefined &&
      bandMedia(lower.band) === "(max-width: 1199.98px)" &&
      upper !== undefined &&
      bandMedia(upper.band) === "(min-width: 1200px)",
    `${lower ? bandMedia(lower.band) : ""} | ${upper ? bandMedia(upper.band) : ""}`,
  );
  check(
    "exactly one band contains the truth width, and it is verified THERE",
    banded.ok &&
      banded.bands.filter((entry) => entry.containsTruthWidth).length === 1 &&
      upper?.containsTruthWidth === true &&
      upper.band.verifyWidth === 1440,
    JSON.stringify(banded.ok ? banded.bands.map((b) => b.band.verifyWidth) : []),
  );
  check(
    "the other band is verified at an OBSERVED probe width inside its own range",
    lower?.band.verifyWidth === 1100 &&
      lower.band.hiddenSamples.includes(1100) &&
      bandContains(lower.band, 1100),
    JSON.stringify(lower?.band),
  );
  check(
    "each band names the child boxes it answers for, measured AT ITS OWN width",
    lower?.witnesses.length === 2 &&
      lower.witnesses[0]?.w === 1100 &&
      lower.witnesses[1]?.w === 1100 &&
      upper?.witnesses.length === 2 &&
      upper.witnesses[0]?.w === 710 &&
      upper.witnesses[1]?.w === 710,
    JSON.stringify({ lower: lower?.witnesses, upper: upper?.witnesses }),
  );
  check(
    "…and the truth band's boxes come from the DEEP observation, as every other rule's do",
    upper?.truth.w === 1440 && lower?.truth.w === 1100,
    `${upper?.truth.w} / ${lower?.truth.w}`,
  );
  check(
    "the evidence names the constant insets that prove the columns PARTITION the box",
    lower?.evidence.some((line) => line.includes("insets constant across")) === true &&
      upper?.evidence.some((line) => line.includes("insets constant across")) === true,
    JSON.stringify(lower?.evidence),
  );

  // --- THE DISCRIMINATING TWIN --------------------------------------------
  const drifting = bandTrackResult(
    bandGrid({ upperSplit: (width) => 0.4 + (width - 1200) / 3600 }),
    "g",
    bandGridHistogram(),
  );
  check(
    "THE TWIN: the same structure change, with the split DRIFTING inside the upper band, is refused",
    !drifting.ok && drifting.reason === "band-track-not-fractional",
    JSON.stringify(drifting),
  );
  check(
    "…and the twin really does change structure at the same edge — it is not refused earlier",
    (() => {
      const twinSingle = bandSingleResult(
        bandGrid({ upperSplit: (width) => 0.4 + (width - 1200) / 3600 }),
        "g",
      );
      return !twinSingle.ok && twinSingle.reason === "tracks-not-reproducible-at-every-width";
    })(),
  );

  // --- THE SECOND TWIN: a fixed row that does not absorb the growth --------
  const fixedRow = bandTrackResult(bandGrid({ fixedUpper: true }), "g", bandGridHistogram());
  check(
    "THE SECOND TWIN: a FIXED-size row inside a growing container is refused, not given fr weights",
    !fixedRow.ok && fixedRow.reason === "band-too-few-widths",
    JSON.stringify(fixedRow),
  );
  check(
    "…and the reason is exactly right: the growth all lands in the RIGHT inset, so no two " +
      "widths of that row share one inset and no band of it is witnessed twice",
    (() => {
      const twin = bandGrid({ fixedUpper: true });
      const ga = twin.find((node) => node.nodeId === "ga")!;
      const gb = twin.find((node) => node.nodeId === "gb")!;
      const at = (width: number): number => BAND_WIDTHS.indexOf(width);
      const rightInset = (width: number): number =>
        width - (gb.x![at(width)]! + gb.w[at(width)]!);
      return (
        ga.w[at(1200)] === 590 &&
        ga.w[at(1920)] === 590 &&
        rightInset(1200) === 0 &&
        rightInset(1920) === 720
      );
    })(),
  );
  const wobble = bandTrackResult(
    bandGrid({ upperLeftInset: (width) => (width === 1440 ? 38 : width === 1920 ? 42 : 40) }),
    "g",
    bandGridHistogram(),
  );
  check(
    "…and `band-insets-not-constant` is REACHABLE: an inset that wobbles ±2 around the run's " +
      "first structure survives the anchored split and is caught by the per-band spread test",
    !wobble.ok && wobble.reason === "band-insets-not-constant",
    JSON.stringify(wobble),
  );

  // --- NEGATIVE CONTROL: nothing changes ----------------------------------
  const flat = bandTrackResult(bandGrid({ neverChanges: true }), "g", bandGridHistogram());
  check(
    "NEGATIVE CONTROL: a container whose structure never changes is refused `single-band`",
    !flat.ok && flat.reason === "single-band",
    JSON.stringify(flat),
  );

  // --- the refusal enum is complete ---------------------------------------
  check(
    "every GridBandRefusalReason is listed exactly once in GRID_BAND_REFUSAL_REASONS",
    new Set(GRID_BAND_REFUSAL_REASONS).size === GRID_BAND_REFUSAL_REASONS.length &&
      GRID_BAND_REFUSAL_REASONS.length === 19,
    String(GRID_BAND_REFUSAL_REASONS.length),
  );

  // --- the pass, end to end, through inferLayoutRules() --------------------
  const built = buildPage(bandGrid(), bandGridHistogram(), BAND_WIDTHS);
  const inferred = inferLayoutRules({
    pages: [built.page],
    styleLookup: built.styleLookup,
    breakpoint: 1024,
  });
  const gridRules = inferred.rules.filter(
    (candidate) => candidate.kind === "grid-track-columns-banded",
  );
  check(
    "inferLayoutRules() emits the banded kind, with its @media and its numeric band",
    gridRules.length === 2 &&
      gridRules.every((candidate) => candidate.media !== undefined && candidate.band !== undefined),
    JSON.stringify(gridRules.map((candidate) => candidate.media)),
  );
  check(
    "…each carrying BOTH declarations — the track list and the gap its weights are shares of",
    gridRules.every(
      (candidate) =>
        candidate.declarations["grid-template-columns"] !== undefined &&
        candidate.declarations["column-gap"] !== undefined,
    ),
    JSON.stringify(gridRules.map((candidate) => candidate.declarations)),
  );
  check(
    "…and generateLayoutCss wraps them in the SAME @media machinery responsive-hidden uses",
    (() => {
      const css = generateLayoutCss(gridRules);
      return (
        css.includes("@media (max-width: 1199.98px)") &&
        css.includes("@media (min-width: 1200px)") &&
        css.includes("grid-template-columns: minmax(0, 1fr);")
      );
    })(),
    generateLayoutCss(gridRules).slice(0, 200),
  );
  check(
    "the container-level accounting conserves: recovered + banded + refused = containers considered",
    inferred.counters.gridTrackColumns +
      inferred.counters.gridTrackBandContainers +
      inferred.counters.gridTrackRefusals ===
      1,
    JSON.stringify({
      single: inferred.counters.gridTrackColumns,
      banded: inferred.counters.gridTrackBandContainers,
      refused: inferred.counters.gridTrackRefusals,
    }),
  );
  check(
    "…and a container ANSWERED by the banded pass is not ALSO counted as a refusal",
    inferred.counters.gridTrackBandContainers === 1 &&
      inferred.counters.gridTrackRefusals === 0 &&
      inferred.counters.gridTrackColumnsBanded === 2,
    JSON.stringify(inferred.counters.gridTrackBandRefusalsByReason),
  );

  const twinInferred = (() => {
    const page = buildPage(
      bandGrid({ upperSplit: (width) => 0.4 + (width - 1200) / 3600 }),
      bandGridHistogram(),
      BAND_WIDTHS,
    );
    return inferLayoutRules({
      pages: [page.page],
      styleLookup: page.styleLookup,
      breakpoint: 1024,
    });
  })();
  check(
    "a REFUSED container keeps its ORIGINAL single-band reason in the shipping histogram…",
    twinInferred.counters.gridTrackRefusals === 1 &&
      twinInferred.counters.gridTrackRefusalsByReason[
        "tracks-not-reproducible-at-every-width"
      ] === 1 &&
      twinInferred.counters.gridTrackBandContainers === 0 &&
      twinInferred.rules.filter((r) => r.kind === "grid-track-columns-banded").length === 0,
    JSON.stringify(twinInferred.counters.gridTrackRefusalsByReason),
  );
  check(
    "…and the band pass's own verdict is recorded in its OWN histogram, never folded into that one",
    twinInferred.counters.gridTrackBandRefusals === 1 &&
      twinInferred.counters.gridTrackBandRefusalsByReason["band-track-not-fractional"] === 1,
    JSON.stringify(twinInferred.counters.gridTrackBandRefusalsByReason),
  );
  const flatInferred = (() => {
    const page = buildPage(bandGrid({ neverChanges: true }), bandGridHistogram(), BAND_WIDTHS);
    return inferLayoutRules({
      pages: [page.page],
      styleLookup: page.styleLookup,
      breakpoint: 1024,
    });
  })();
  check(
    "NEGATIVE CONTROL: a container the SINGLE-BAND pass can answer is answered by it, and the " +
      "banded pass is never offered it at all",
    flatInferred.counters.gridTrackColumns === 1 &&
      flatInferred.counters.gridTrackBandContainers === 0 &&
      flatInferred.counters.gridTrackBandRefusals === 0 &&
      flatInferred.rules.filter((r) => r.kind === "grid-track-columns").length === 1,
    JSON.stringify(flatInferred.counters.gridTrackBandRefusalsByReason),
  );

  /*
   * --- 28.75 §03b CYCLE 1: the band's AREAS reach the item pass -------------
   *
   * THE MEASURED FINDING THIS ANSWERS. The first revision published no areas
   * from this pass, on the argument that a banded column is clustered OUT of
   * its children so "the child equals its column" proves nothing. Withholding
   * them shipped a regression instead: on hobbang.net the banded track list put
   * the items at the source's EXACT x while their frozen truth-width `width`
   * stayed, so the container became right and its contents overflowed it —
   * `/` @768 went MAJOR to BLOCKER on a NEW `footer-clipped`, and the mobile
   * tree gained 16–52px of extent at 640/700/768.
   *
   * The claim the item branch actually makes is not "the child equals its
   * column" but "the child has no inline size of its OWN", and the evidence is
   * the child MOVING with the container by a constant share — which every band
   * has already been held to. The twin below is what keeps that honest: an item
   * that does NOT track its column is still refused.
   */
  const bandedAreas = bandTrackResult(bandGrid(), "g", bandGridHistogram());
  check(
    "the banded recovery PUBLISHES the grid area it measured, per item and per width",
    bandedAreas.ok &&
      bandedAreas.areas.length === 2 &&
      bandedAreas.areas.every((area) => area.widths.length === 5),
    JSON.stringify(bandedAreas.ok ? bandedAreas.areas : bandedAreas),
  );
  check(
    "…and each area is that band's OWN column width at that width, not the truth one",
    (() => {
      if (!bandedAreas.ok) return false;
      const ga = bandedAreas.areas.find((area) => area.nodeId === "ga");
      const at = (width: number): number | undefined =>
        ga?.widths.find((entry) => entry.i === BAND_WIDTHS.indexOf(width))?.w;
      // lower band (1 column) = the whole row; upper band (2 columns) = half of
      // `width − gap`.
      return at(1024) === 1024 && at(1100) === 1100 && at(1440) === 710 && at(1920) === 950;
    })(),
    JSON.stringify(bandedAreas.ok ? bandedAreas.areas.find((a) => a.nodeId === "ga") : undefined),
  );
  /**
   * The same grid, with the exact tier's frozen `width` on each item — which is
   * the only reason the item branch has anything to restate. The bare fixture
   * above has no `width`, so it is refused `no-frozen-width` and would make the
   * positive below pass for the wrong reason.
   */
  const bandGridFrozenItems = (itemProps: Props = {}): FixtureNode[] =>
    bandGrid().map((node) =>
      node.nodeId === "ga" || node.nodeId === "gb"
        ? {
            ...node,
            props: {
              ...node.props,
              width: `${node.w[BAND_TRUTH_INDEX]}px`,
              ...(node.nodeId === "ga" ? itemProps : {}),
            },
          }
        : node,
    );
  const bandedItemInferred = (() => {
    const page = buildPage(bandGridFrozenItems(), bandGridHistogram(), BAND_WIDTHS);
    return inferLayoutRules({
      pages: [page.page],
      styleLookup: page.styleLookup,
      breakpoint: 1024,
    });
  })();
  check(
    "POSITIVE: an item of a BANDED container is answered `grid-area-fill-width`, so a correct " +
      "track list never ships around items still frozen at their truth-width px",
    bandedItemInferred.rules.filter((rule) => rule.kind === "grid-area-fill-width").length === 2 &&
      bandedItemInferred.rules
        .filter((rule) => rule.kind === "grid-area-fill-width")
        .every(
          (rule) =>
            rule.declarations["width"] === "auto" && rule.declarations["min-width"] === "0px",
        ),
    JSON.stringify(bandedItemInferred.rules.map((rule) => `${rule.nodeId}:${rule.kind}`)),
  );
  check(
    "THE TWIN: an item of a banded container that declares its OWN `min-width` is still refused " +
      "— a published area is evidence, not a licence to discard an observed declaration",
    (() => {
      const page = buildPage(
        bandGridFrozenItems({ "min-width": "200px" }),
        bandGridHistogram(),
        BAND_WIDTHS,
      );
      const inferred = inferLayoutRules({
        pages: [page.page],
        styleLookup: page.styleLookup,
        breakpoint: 1024,
      });
      const emitted = inferred.rules.filter((rule) => rule.kind === "grid-area-fill-width");
      return (
        emitted.length === 1 &&
        emitted[0]?.nodeId === "gb" &&
        inferred.counters.gridAreaFillRefusalsByReason["own-min-width-declared"] === 1
      );
    })(),
  );

  // --- NEGATIVE CONTROL: the banded pass is not even OFFERED elsewhere -----
  const constantContainer = (() => {
    const nodes = twoToOne([1200, 1200, 1200, 1200, 1200]);
    const page = buildPage(nodes);
    return inferLayoutRules({
      pages: [page.page],
      styleLookup: page.styleLookup,
      breakpoint: 1024,
    });
  })();
  check(
    "NEGATIVE CONTROL: a container whose width never moves is still refused `container-width-constant`",
    constantContainer.counters.gridTrackRefusalsByReason["container-width-constant"] === 1,
    JSON.stringify(constantContainer.counters.gridTrackRefusalsByReason),
  );
  check(
    "…and the banded pass was never offered it — one refusal reaches this mechanism, not any refusal",
    Object.keys(constantContainer.counters.gridTrackBandRefusalsByReason).length === 0 &&
      constantContainer.counters.gridTrackBandRefusals === 0,
    JSON.stringify(constantContainer.counters.gridTrackBandRefusalsByReason),
  );
}


// ---------------------------------------------------------------------------
// Part 11n — Task 28.75 §03b: the banded track list is VERIFIED BY RENDER
// ---------------------------------------------------------------------------

/**
 * A banded grid rule, shaped exactly as `recoverGridTracksBanded()` emits one.
 *
 * `.p10-grid` has no width of its own, so it is the viewport; the exact tier
 * froze its two used tracks at 710px each with a 20px gutter, which is right at
 * 1440 and overhangs everywhere below it. The LOWER band restates it as one
 * fractional column, which is what the source did there.
 */
const BANDED_GRID_UPPER: RecoveredLayoutRule = {
  pageId: "p000010",
  nodeId: "p10grid",
  kind: "grid-track-columns-banded",
  declarations: {
    "grid-template-columns": "minmax(0, 1fr) minmax(0, 1fr)",
    "column-gap": "20px",
  },
  media: "(min-width: 1200px)",
  band: { minWidth: 1200, hiddenSamples: [1200, 1440, 1920], verifyWidth: 1440 },
  truth: { x: 0, w: 1440 },
  witnesses: [
    { nodeId: "p10a", x: 0, w: 710 },
    { nodeId: "p10b", x: 730, w: 710 },
  ],
  evidence: ["fixture"],
};
const BANDED_GRID_LOWER: RecoveredLayoutRule = {
  pageId: "p000010",
  nodeId: "p10grid",
  kind: "grid-track-columns-banded",
  declarations: { "grid-template-columns": "minmax(0, 1fr)", "column-gap": "0px" },
  media: "(max-width: 1199.98px)",
  band: { maxWidth: 1200, hiddenSamples: [1024, 1100], verifyWidth: 1100 },
  truth: { x: 0, w: 1100 },
  witnesses: [
    { nodeId: "p10a", x: 0, w: 1100 },
    { nodeId: "p10b", x: 0, w: 1100 },
  ],
  evidence: ["fixture"],
};
/** The same band with the WRONG track count: two columns where the source had one. */
const BANDED_GRID_LOWER_WRONG: RecoveredLayoutRule = {
  ...BANDED_GRID_LOWER,
  declarations: {
    "grid-template-columns": "minmax(0, 1fr) minmax(0, 1fr)",
    "column-gap": "20px",
  },
};

async function bandedGridTruthCheckChecks(): Promise<void> {
  section("Part 11n — 28.75 §03b: a banded track list is rendered at its OWN band width");

  const good = await verifyLayoutRules({
    rules: [BANDED_GRID_UPPER, BANDED_GRID_LOWER],
    pages: HARNESS_PAGES,
    css: HARNESS_CSS,
  });
  check(
    "both bands ship, and NEITHER was exempted from verification",
    good.rules.length === 2 && good.counters.acceptedUnchecked === 0,
    JSON.stringify(good.counters),
  );
  check(
    "the TRUTH band is verified in the ordinary truth-width round — it is active there",
    good.counters.truthCheckable === 1,
    JSON.stringify(good.counters),
  );
  check(
    "…and the OTHER band gets its own render, at its own band width",
    good.counters.bandGeometryCheckable === 1 && good.counters.bandGeometryWidthsRendered === 1,
    JSON.stringify(good.counters),
  );
  check(
    "…and it is NOT counted as a responsive-hidden band: the two populations stay apart",
    good.counters.bandCheckable === 0 && good.counters.rejectedByBandCheck === 0,
    JSON.stringify(good.counters),
  );

  const bad = await verifyLayoutRules({
    rules: [BANDED_GRID_UPPER, BANDED_GRID_LOWER_WRONG],
    pages: HARNESS_PAGES,
    css: HARNESS_CSS,
  });
  check(
    "a WRONG track list inside a band is REJECTED at that band's own width",
    bad.rules.length === 1 &&
      bad.rules[0]?.media === "(min-width: 1200px)" &&
      bad.counters.rejectedByTruthCheck === 1,
    JSON.stringify(bad.counters),
  );
  check(
    "…and it was a WITNESS that caught it, at 1100px, against the baseline the exact tier gives",
    bad.rejections.some(
      (rejection) =>
        rejection.nodeId === "p10grid" &&
        rejection.witnessNodeId === "p10a" &&
        rejection.observed.w === 1100 &&
        Math.abs(rejection.rendered.w - 540) <= 1 &&
        Math.abs(rejection.baseline.w - 710) <= 1,
    ),
    JSON.stringify(bad.rejections),
  );
  check(
    "…so the same wrong rule with NO witnesses would have sailed through the same render",
    (
      await verifyLayoutRules({
        rules: [{ ...BANDED_GRID_LOWER_WRONG, witnesses: undefined }],
        pages: HARNESS_PAGES,
        css: HARNESS_CSS,
      })
    ).rules.length === 1,
  );
  check(
    "a banded geometry rule with no numeric band is REJECTED, never shipped unmeasured",
    (
      await verifyLayoutRules({
        rules: [{ ...BANDED_GRID_LOWER, band: undefined }],
        pages: HARNESS_PAGES,
        css: HARNESS_CSS,
      })
    ).rules.length === 0,
  );
  check(
    "a `responsive-hidden` rule is still routed to the DISPLAY band check, not this one",
    (() => {
      return isBandedGeometry(BANDED_GRID_LOWER) && !isBandedGeometry(MEDIA_RULE);
    })(),
  );
}

// ---------------------------------------------------------------------------
// Part 11o — Task 28.75 §03b: the GRID ITEM, against its own recovered area
// ---------------------------------------------------------------------------

/**
 * Part 11o — the companion of Part 11m, and the reason the two exist together.
 *
 * THE MEASURED FINDING. On `linear.app /pricing` at 1100px the two plan
 * containers already ship `grid-template-columns: minmax(0, 1fr)` and render a
 * 1008px track — the track recovery is done and correct. Their ITEMS still
 * render 1344px, because the exact tier put `width: 1344px` on them and
 * `containingBlockGuard()` refuses `grid-item`. The three outermost overflow
 * roots on that route are exactly those items, and no further inline-size rule
 * kind could reach them: the guard's objection is that nothing measured the
 * grid AREA. `recoverGridTracks()` does measure it, and this branch is where it
 * says so.
 *
 * WHAT IS ASSERTED:
 *
 *   * POSITIVE — an item observed filling a recovered fractional track at every
 *     width is restated as `width: auto` with `min-width: 0`;
 *   * THE DISCRIMINATING TWIN — an item that is consistently NARROWER than its
 *     area (a `justify-self` that is not stretch, an inline margin) is refused
 *     `does-not-fill-area`, because `auto` would stretch it;
 *   * NEGATIVE CONTROL — an item whose container's tracks were NOT recovered is
 *     refused `container-tracks-not-recovered`: `auto` there would reproduce the
 *     freeze while claiming to have recovered a relation;
 *   * NEGATIVE CONTROL — an item declaring its own `min-width` is refused rather
 *     than having that declaration overridden to 0;
 *   * `containingBlockGuard()` still refuses `grid-item`, unchanged;
 *   * and a REAL RENDER proving why `min-width: 0` is co-emitted — the exact
 *     failure Task 28.6 A5(c) measured and reverted for.
 */
function gridAreaFillChecks(): void {
  section("Part 11o — 28.75 §03b: the grid item, from its own recovered area");

  const DESKTOP = BAND_WIDTHS.map((width, i) => ({ width, i })).filter(
    (entry) => entry.width >= 1024,
  );
  /**
   * A single fully fractional column, inside a shell 200px narrower than the
   * viewport and offset from its left edge.
   *
   * Both facts are deliberate: a container that IS the viewport is a full-bleed
   * band and `viewportBleedWidth()` would answer for its child before this
   * branch was ever reached, which would make the check pass for the wrong
   * reason.
   */
  const GRID_W = BAND_WIDTHS.map((width) => width - 200);
  const oneColumn = (itemW: number[], itemProps: Props = {}): FixtureNode[] => [
    { nodeId: "n001", tagName: "html", w: [...BAND_WIDTHS], props: { display: "block" } },
    {
      nodeId: "n002",
      tagName: "body",
      parentNodeId: "n001",
      w: [...BAND_WIDTHS],
      props: { display: "block" },
    },
    {
      nodeId: "g",
      tagName: "div",
      parentNodeId: "n002",
      w: [...GRID_W],
      x: BAND_WIDTHS.map(() => 100),
      props: {
        display: "grid",
        "box-sizing": "border-box",
        "padding-left": "0px",
        "padding-right": "0px",
        "column-gap": "normal",
        width: `${GRID_W[BAND_TRUTH_INDEX]}px`,
        "grid-template-columns": `${GRID_W[BAND_TRUTH_INDEX]}px`,
      },
    },
    {
      nodeId: "item",
      tagName: "div",
      parentNodeId: "g",
      w: itemW,
      x: BAND_WIDTHS.map(() => 100),
      props: { display: "block", width: `${itemW[BAND_TRUTH_INDEX]}px`, ...itemProps },
    },
  ];

  /** The areas `recoverGridTracks()` measured, as the container pass records them. */
  const areasOf = (nodes: readonly FixtureNode[]): Map<number, number> | undefined => {
    const built = buildPage(nodes, undefined, BAND_WIDTHS);
    const container = built.specNodes.get("g")!;
    const children = container.childNodeIds.map((id) => built.specNodes.get(id)!);
    const recovery = recoverGridTracks({
      node: container,
      children,
      styleLookup: built.styleLookup,
      variantIdx: DESKTOP,
      truthIndex: BAND_TRUTH_INDEX,
    });
    if (!recovery.ok) return undefined;
    const entry = recovery.recovery.areas.find((area) => area.nodeId === "item");
    return entry ? new Map(entry.widths.map((w) => [w.i, w.w])) : undefined;
  };
  const fillResult = (
    nodes: readonly FixtureNode[],
    area: Map<number, number> | undefined,
  ): ReturnType<typeof gridAreaFillWidth> => {
    const built = buildPage(nodes, undefined, BAND_WIDTHS);
    const node = built.specNodes.get("item")!;
    const parent = built.specNodes.get("g")!;
    return gridAreaFillWidth({
      node,
      styleLookup: built.styleLookup,
      guard: containingBlockGuard(node, parent, built.styleLookup),
      variantIdx: DESKTOP,
      truthIndex: BAND_TRUTH_INDEX,
      area,
    });
  };

  const filling = oneColumn([...GRID_W]);
  const areas = areasOf(filling);
  check(
    "recoverGridTracks() now REPORTS the grid area it measured, per item and per width",
    areas !== undefined && areas.size === DESKTOP.length && areas.get(BAND_TRUTH_INDEX) === 1240,
    JSON.stringify(areas ? [...areas] : undefined),
  );
  check(
    "…and the guard still refuses this node `grid-item`, byte-for-byte as before",
    (() => {
      const built = buildPage(filling, undefined, BAND_WIDTHS);
      return (
        containingBlockGuard(
          built.specNodes.get("item")!,
          built.specNodes.get("g")!,
          built.styleLookup,
        ) === "grid-item"
      );
    })(),
  );
  const positive = fillResult(filling, areas);
  check(
    "POSITIVE: an item observed FILLING its recovered area is restated as `width: auto`",
    positive.ok && positive.declarations["width"] === "auto",
    JSON.stringify(positive),
  );
  check(
    "…with `min-width: 0` co-emitted, because a grid item's automatic minimum is min-content",
    positive.ok && positive.declarations["min-width"] === "0px",
    JSON.stringify(positive.ok ? positive.declarations : positive),
  );
  check(
    "…and its evidence names the area it was measured against at every width",
    positive.ok &&
      positive.evidence.filter((line) => line.includes("grid area")).length === DESKTOP.length,
    JSON.stringify(positive.ok ? positive.evidence : []),
  );

  // --- THE DISCRIMINATING TWIN --------------------------------------------
  const narrow = oneColumn(GRID_W.map((width) => width - 40));
  check(
    "THE TWIN: an item consistently NARROWER than its area is refused `does-not-fill-area`",
    (() => {
      // The container's own track is still measured from this child, so the area
      // it reports is the child's box; the area the ITEM must fill is the one
      // the CONTAINER's content box gives, so the twin is built by handing the
      // predicate the container's real content widths.
      const twinAreas = new Map(DESKTOP.map((entry) => [entry.i, GRID_W[entry.i]!]));
      const result = fillResult(narrow, twinAreas);
      return !result.ok && result.reason === "does-not-fill-area";
    })(),
  );

  // --- NEGATIVE CONTROLS ---------------------------------------------------
  check(
    "NEGATIVE CONTROL: an item whose container's tracks were NOT recovered is refused",
    (() => {
      const result = fillResult(filling, undefined);
      return !result.ok && result.reason === "container-tracks-not-recovered";
    })(),
  );
  check(
    "NEGATIVE CONTROL: an item declaring its own `min-width` is refused, not overridden",
    (() => {
      const nodes = oneColumn([...GRID_W], { "min-width": "200px" });
      const result = fillResult(nodes, areasOf(nodes));
      return !result.ok && result.reason === "own-min-width-declared";
    })(),
  );
  check(
    "NEGATIVE CONTROL: a node the guard did NOT call a grid item is refused `not-a-grid-item`",
    (() => {
      const built = buildPage(filling, undefined, BAND_WIDTHS);
      const result = gridAreaFillWidth({
        node: built.specNodes.get("item")!,
        styleLookup: built.styleLookup,
        guard: undefined,
        variantIdx: DESKTOP,
        truthIndex: BAND_TRUTH_INDEX,
        area: areas,
      });
      return !result.ok && result.reason === "not-a-grid-item";
    })(),
  );
  check(
    "NEGATIVE CONTROL: an item whose area never moves is refused `area-width-constant`",
    (() => {
      const flat = BAND_WIDTHS.map(() => 1240);
      const nodes = oneColumn(flat);
      const result = fillResult(nodes, new Map(DESKTOP.map((entry) => [entry.i, 1240])));
      return !result.ok && result.reason === "area-width-constant";
    })(),
  );
  check(
    "every GridAreaFillRefusalReason is listed exactly once",
    new Set(GRID_AREA_FILL_REFUSAL_REASONS).size === GRID_AREA_FILL_REFUSAL_REASONS.length &&
      GRID_AREA_FILL_REFUSAL_REASONS.length === 9,
    String(GRID_AREA_FILL_REFUSAL_REASONS.length),
  );

  // --- the funnel: the outcome partition still sums ------------------------
  const built = buildPage(filling, undefined, BAND_WIDTHS);
  const inferred = inferLayoutRules({
    pages: [built.page],
    styleLookup: built.styleLookup,
    breakpoint: 1024,
  });
  check(
    "inferLayoutRules() emits the new kind for the item, once",
    inferred.rules.filter((r) => r.kind === "grid-area-fill-width").length === 1,
    JSON.stringify(inferred.rules.map((r) => `${r.nodeId}:${r.kind}`)),
  );
  check(
    "…and the inline-size outcome partition still sums to the candidate count",
    (() => {
      const outcomes = inferred.counters.inlineSizeOutcomes;
      const total = Object.values(outcomes).reduce((sum, value) => sum + value, 0);
      return (
        total + inferred.counters.inlineSizeOutcomesSuperseded ===
          inferred.counters.nodesWithProbe -
            Object.values(inferred.counters.inlineSizePreStageDrops).reduce(
              (sum, value) => sum + value,
              0,
            ) +
          inferred.counters.inlineSizeOutcomesSuperseded &&
        (outcomes["emitted-grid-area-fill-width"] ?? 0) === 1
      );
    })(),
    JSON.stringify(inferred.counters.inlineSizeOutcomes),
  );
}

/**
 * The rule the grid-ITEM branch emits, on the p11 harness page.
 *
 * `.p11-grid` is a single `minmax(0, 1fr)` column 1200px wide — the container's
 * own recovered track rule, already shipping — and `.p11-item` is the frozen
 * 1200px item inside it, holding a 1400px child.
 */
const GRID_AREA_FILL_RULE: RecoveredLayoutRule = {
  pageId: "p000011",
  nodeId: "p11item",
  kind: "grid-area-fill-width",
  declarations: { width: "auto", "min-width": "0px" },
  truth: { x: 0, w: 1200 },
  evidence: ["fixture"],
};

/**
 * Part 11p — `min-width: 0`, measured in a real browser rather than asserted.
 *
 * Task 28.6 A5(c) built this branch WITHOUT it, measured 100 nodes moving up to
 * 2px away from their observed boxes, and named the cause: a grid item's
 * automatic minimum size is min-content, so `width: auto` on an item whose own
 * child is wider than the area resolves to that child's width.
 *
 * The measurement below is the one that decides whether the co-emission is
 * load-bearing, and it reports BOTH answers because they are different:
 *
 *   * on a BARE `1fr` track — the shape A5(c) hit — `width: auto` really does
 *     resolve to the 1400px child, and `min-width: 0` really does hold the item
 *     at its 1200px track. The cure is real.
 *   * on `minmax(0, <n>fr)` — the ONLY fractional form this module emits, chosen
 *     by `recoverGridTracks()` for its own reasons — Chromium does not apply the
 *     automatic minimum at a definite container width at all, so the
 *     co-emission is a GUARD there rather than an active correction.
 *
 * Both are stated so nobody has to guess which one the corpus numbers came from,
 * and so the declaration is not quietly assumed to be doing work it is not.
 */
async function gridAreaFillTruthCheckChecks(): Promise<void> {
  section("Part 11p — 28.75 §03b: why `min-width: 0` is co-emitted, in a real browser");

  const { chromium } = await import("playwright");
  const browser = await chromium.launch();
  let measured: Record<string, number> = {};
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    await page.setContent(
      "<style>html,body{margin:0;padding:0}" +
        ".inner{width:1400px;height:10px}" +
        ".bare{display:grid;grid-template-columns:1fr;width:1200px}" +
        ".clamped{display:grid;grid-template-columns:minmax(0,1fr);width:1200px}" +
        ".frozen{width:1200px}.auto{width:auto}.auto0{width:auto;min-width:0}</style>" +
        '<div class=bare><div class=frozen id=bareFrozen><div class=inner></div></div></div>' +
        '<div class=bare><div class=auto id=bareAuto><div class=inner></div></div></div>' +
        '<div class=bare><div class=auto0 id=bareAutoZero><div class=inner></div></div></div>' +
        '<div class=clamped><div class=auto id=clampedAuto><div class=inner></div></div></div>' +
        '<div class=clamped><div class=auto0 id=clampedAutoZero><div class=inner></div></div></div>',
    );
    measured = await page.evaluate(() => {
      const out: Record<string, number> = {};
      for (const id of [
        "bareFrozen",
        "bareAuto",
        "bareAutoZero",
        "clampedAuto",
        "clampedAutoZero",
      ]) {
        out[id] = Math.round(document.getElementById(id)!.getBoundingClientRect().width);
      }
      return out;
    });
  } finally {
    await browser.close();
  }
  check(
    "the frozen px is NOT floored by the automatic minimum — 1200px stays 1200px",
    measured["bareFrozen"] === 1200,
    JSON.stringify(measured),
  );
  check(
    "…so `width: auto` ALONE is not its restatement: on a bare `1fr` track it resolves to the " +
      "1400px child, exactly the A5(c) failure",
    measured["bareAuto"] === 1400,
    JSON.stringify(measured),
  );
  check(
    "…and `min-width: 0` is the cure: the item goes back to its 1200px track",
    measured["bareAutoZero"] === 1200,
    JSON.stringify(measured),
  );
  check(
    "MEASURED HONESTLY: on `minmax(0, <n>fr)` — the only fractional form this module emits — " +
      "Chromium applies no automatic minimum at a definite container width, so the co-emission " +
      "is a guard there, not a correction",
    measured["clampedAuto"] === 1200 && measured["clampedAutoZero"] === 1200,
    JSON.stringify(measured),
  );

  const good = await verifyLayoutRules({
    rules: [GRID_AREA_FILL_RULE],
    pages: HARNESS_PAGES,
    css: HARNESS_CSS,
  });
  check(
    "the emitted pair reproduces the observed item box and SHIPS, having been rendered",
    good.rules.length === 1 &&
      good.counters.truthCheckable === 1 &&
      good.counters.acceptedUnchecked === 0 &&
      good.counters.acceptedRegressed === 0,
    JSON.stringify(good.counters),
  );
  const wrong = await verifyLayoutRules({
    rules: [{ ...GRID_AREA_FILL_RULE, declarations: { width: "50%" } }],
    pages: HARNESS_PAGES,
    css: HARNESS_CSS,
  });
  check(
    "…and a WRONG restatement of the same item is rejected by the same render",
    wrong.rules.length === 0 && wrong.counters.rejectedByTruthCheck === 1,
    JSON.stringify(wrong.counters),
  );
}

// ---------------------------------------------------------------------------
// TASK 28.8 A2 — AUTHORED INLINE-SIZE INTENT
// ---------------------------------------------------------------------------

/**
 * Every fixture here is generic CSS: a `%` width, a px cap, a `calc()`, an
 * `@media (min-width: …)`. No site, no selector and no width is taken from any
 * real page, and nothing branches on a hostname.
 */
function authoredNode(options: {
  nodeId?: string;
  tagName?: string;
  authored?: { property: string; value: string; media?: string }[];
  styleTokenId?: string;
}): ElementSpecNode {
  return {
    nodeId: options.nodeId ?? "n000001",
    type: "element",
    tagName: options.tagName ?? "div",
    childNodeIds: [],
    attributes: {},
    assetRefs: [],
    relations: [],
    limitations: [],
    localVisible: true,
    effectiveVisible: true,
    styleTokenId: options.styleTokenId ?? "st000001",
    authoredLayout: (options.authored ?? []).map((entry) => ({
      property: entry.property,
      value: entry.value,
      selector: ".x",
      ...(entry.media !== undefined ? { media: entry.media } : {}),
    })),
  } as unknown as ElementSpecNode;
}

const DESKTOP_RANGE: readonly [number, number] = [801, Number.POSITIVE_INFINITY];
const MOBILE_RANGE: readonly [number, number] = [0, 800.98];

function askAuthored(
  node: ElementSpecNode,
  options: {
    range?: readonly [number, number];
    display?: string;
    position?: string;
    truthWidth?: number;
    parentContentWidth?: number;
    alreadyRecovered?: boolean;
  } = {},
): {
  answer: ReturnType<typeof authoredInlineSizeIntent>;
  declarationRefusals: string[];
} {
  const declarationRefusals: string[] = [];
  const answer = authoredInlineSizeIntent({
    node,
    styleLookup: () => ({
      display: options.display ?? "block",
      position: options.position ?? "static",
    }),
    servedRange: options.range ?? DESKTOP_RANGE,
    truthWidth: options.truthWidth ?? 600,
    parentContentWidth: options.parentContentWidth,
    alreadyRecovered: options.alreadyRecovered ?? false,
    onDeclarationRefusal: (property, reason) =>
      declarationRefusals.push(`${property}:${reason}`),
  });
  return { answer, declarationRefusals };
}

function authoredIntentChecks(): void {
  console.log("\n§28.8 A2 authored inline-size intent");

  // --- POSITIVE: the source says `width: 100%`, and the box really is ------
  const percent = askAuthored(
    authoredNode({ authored: [{ property: "width", value: "100%" }] }),
    { truthWidth: 600, parentContentWidth: 600 },
  );
  check(
    "(A2) an authored `width: 100%` that agrees with the observed box is re-emitted",
    percent.answer.ok && percent.answer.declarations["width"] === "100%",
    JSON.stringify(percent.answer),
  );

  // --- POSITIVE: a cap with no width means the source's width IS auto ------
  const cap = askAuthored(
    authoredNode({ authored: [{ property: "max-width", value: "1200px" }] }),
    { truthWidth: 600 },
  );
  check(
    "(A2) a px `max-width` with NO authored width co-emits `width: auto`",
    cap.answer.ok &&
      cap.answer.declarations["max-width"] === "1200px" &&
      cap.answer.declarations["width"] === "auto",
    JSON.stringify(cap.answer),
  );
  // …because a cap alone never engages against a frozen pixel.
  const capWithFrozenWidth = askAuthored(
    authoredNode({
      authored: [
        { property: "max-width", value: "1200px" },
        { property: "width", value: "1152px" },
      ],
    }),
    { truthWidth: 600 },
  );
  check(
    "(A2) …but a px `width` beside the cap keeps the frozen width: no `width` emitted",
    capWithFrozenWidth.answer.ok &&
      capWithFrozenWidth.answer.declarations["width"] === undefined &&
      capWithFrozenWidth.answer.declarations["max-width"] === "1200px" &&
      capWithFrozenWidth.declarationRefusals.includes("width:value-frozen-px"),
    JSON.stringify(capWithFrozenWidth),
  );

  // --- POSITIVE: auto margins, calc, viewport units, grid tracks -----------
  const centred = askAuthored(
    authoredNode({
      authored: [
        { property: "max-width", value: "min(100%, 1200px)" },
        { property: "margin-inline", value: "auto" },
      ],
    }),
    { truthWidth: 600 },
  );
  check(
    "(A2) `margin-inline: auto` + a `min()` cap survive together",
    centred.answer.ok &&
      centred.answer.declarations["margin-inline"] === "auto" &&
      centred.answer.declarations["max-width"] === "min(100%, 1200px)",
    JSON.stringify(centred.answer),
  );
  const tracks = askAuthored(
    authoredNode({
      authored: [{ property: "grid-template-columns", value: "repeat(3, minmax(0, 1fr))" }],
    }),
    { truthWidth: 600 },
  );
  check(
    "(A2) a relational `grid-template-columns` is re-emitted verbatim",
    tracks.answer.ok &&
      tracks.answer.declarations["grid-template-columns"] === "repeat(3, minmax(0, 1fr))",
    JSON.stringify(tracks.answer),
  );

  // --- NEGATIVE: a frozen px width is exactly what the exact tier ships ----
  const frozen = askAuthored(
    authoredNode({ authored: [{ property: "width", value: "1152px" }] }),
    { truthWidth: 600 },
  );
  check(
    "(A2) NEGATIVE — a px `width` recovers nothing and is refused `value-frozen-px`",
    !frozen.answer.ok &&
      frozen.answer.reason === "no-admissible-declaration" &&
      frozen.declarationRefusals.includes("width:value-frozen-px"),
    JSON.stringify(frozen),
  );
  const frozenTracks = askAuthored(
    authoredNode({
      authored: [{ property: "grid-template-columns", value: "448px 224px 224px" }],
    }),
    { truthWidth: 600 },
  );
  check(
    "(A2) NEGATIVE — a px track list is the frozen value, refused `grid-tracks-frozen`",
    !frozenTracks.answer.ok &&
      frozenTracks.declarationRefusals.includes(
        "grid-template-columns:grid-tracks-frozen",
      ),
    JSON.stringify(frozenTracks),
  );

  // --- NEGATIVE: a `var()` whose value the SiteSpec does not carry ---------
  const usesVar = askAuthored(
    authoredNode({ authored: [{ property: "width", value: "var(--col)" }] }),
    { truthWidth: 600 },
  );
  check(
    "(A2) NEGATIVE — `var(...)` is refused: its value is not in the artifact",
    !usesVar.answer.ok &&
      usesVar.declarationRefusals.includes("width:value-uses-var-unresolved"),
    JSON.stringify(usesVar),
  );

  // --- TASK 28.8 A2b — `var()` admitted against the emitted custom props ----
  const varDeclared = new Map([["--page-max", "1200px"]]);
  const varAnswer = (() => {
    const declarationRefusals: string[] = [];
    const answer = authoredInlineSizeIntent({
      node: authoredNode({
        authored: [{ property: "max-width", value: "var(--page-max)" }],
      }),
      styleLookup: () => ({ display: "block", position: "static" }),
      servedRange: DESKTOP_RANGE,
      truthWidth: 900,
      parentContentWidth: undefined,
      customProperties: varDeclared,
      alreadyRecovered: false,
      onDeclarationRefusal: (property, reason) =>
        declarationRefusals.push(`${property}:${reason}`),
    });
    return { answer, declarationRefusals };
  })();
  check(
    "(A2b) `max-width: var(--page-max)` admitted when the name is in `customProperties` — " +
      "emitted verbatim as the source's own text, and `varAdmitted` counts it",
    varAnswer.answer.ok &&
      varAnswer.answer.declarations["max-width"] === "var(--page-max)" &&
      varAnswer.answer.varAdmitted === 1,
    JSON.stringify(varAnswer.answer),
  );

  const varUnadmitted = (() => {
    const declarationRefusals: string[] = [];
    const answer = authoredInlineSizeIntent({
      node: authoredNode({
        authored: [{ property: "max-width", value: "var(--page-max)" }],
      }),
      styleLookup: () => ({ display: "block", position: "static" }),
      servedRange: DESKTOP_RANGE,
      truthWidth: 900,
      parentContentWidth: undefined,
      customProperties: new Map(),
      alreadyRecovered: false,
      onDeclarationRefusal: (property, reason) =>
        declarationRefusals.push(`${property}:${reason}`),
    });
    return { answer, declarationRefusals };
  })();
  check(
    "(A2b) NEGATIVE — the same `var(--page-max)` with an EMPTY `customProperties` map " +
      "is refused `value-uses-var-unresolved`",
    !varUnadmitted.answer.ok &&
      varUnadmitted.declarationRefusals.includes(
        "max-width:value-uses-var-unresolved",
      ),
    JSON.stringify(varUnadmitted),
  );

  // `resolveAuthoredVars` admits a fallback ON ITS OWN MERITS when the name is
  // not declared — exactly what CSS itself does at runtime when `--page-max`
  // is missing. `var(--page-max, 1200px)` against an EMPTY map resolves the
  // SHAPE TEST against the fallback `1200px`; for `max-width` a px value is a
  // relation ("never wider than this"), so it is admissible — `ok: true`, the
  // SOURCE'S OWN TEXT (including the `var()`) is what ships, and it still
  // counts as `varAdmitted` because a `var()` was used to admit it.
  const varFallback = (() => {
    const declarationRefusals: string[] = [];
    const answer = authoredInlineSizeIntent({
      node: authoredNode({
        authored: [{ property: "max-width", value: "var(--page-max, 1200px)" }],
      }),
      styleLookup: () => ({ display: "block", position: "static" }),
      servedRange: DESKTOP_RANGE,
      truthWidth: 900,
      parentContentWidth: undefined,
      customProperties: new Map(),
      alreadyRecovered: false,
      onDeclarationRefusal: (property, reason) =>
        declarationRefusals.push(`${property}:${reason}`),
    });
    return { answer, declarationRefusals };
  })();
  check(
    "(A2b) `var(--page-max, 1200px)` against an EMPTY map resolves via the fallback — " +
      "admitted (max-width cap ≥ truth width), emitted as the source's own `var(...)` text, " +
      "and counted in `varAdmitted`",
    varFallback.answer.ok &&
      varFallback.answer.declarations["max-width"] === "var(--page-max, 1200px)" &&
      varFallback.answer.varAdmitted === 1,
    JSON.stringify(varFallback),
  );

  // --- NEGATIVE: a margin that is not `auto` says nothing about width ------
  const marginPx = askAuthored(
    authoredNode({ authored: [{ property: "margin-left", value: "24px" }] }),
    { truthWidth: 600 },
  );
  check(
    "(A2) NEGATIVE — a non-auto margin is not an inline-size relation",
    !marginPx.answer.ok && marginPx.declarationRefusals.includes("margin-left:margin-not-auto"),
    JSON.stringify(marginPx),
  );

  // --- MEDIA: true across the WHOLE served range, or not at all ------------
  check(
    "(A2) a declaration with no media holds across any range",
    authoredMediaHolds(undefined, 801, Number.POSITIVE_INFINITY) === "holds",
  );
  check(
    "(A2) `(min-width: 768px)` holds across the whole desktop range [801, ∞)",
    authoredMediaHolds("(min-width: 768px)", 801, Number.POSITIVE_INFINITY) === "holds",
  );
  check(
    "(A2) NEGATIVE — `(min-width: 1024px)` covers only PART of [801, ∞)",
    authoredMediaHolds("(min-width: 1024px)", 801, Number.POSITIVE_INFINITY) === "partial",
  );
  check(
    "(A2) NEGATIVE — `(max-width: 1200px)` covers only PART of [801, ∞)",
    authoredMediaHolds("(max-width: 1200px)", 801, Number.POSITIVE_INFINITY) === "partial",
  );
  check(
    "(A2) `(max-width: 48rem)` = 768px covers the whole mobile range [0, 800.98]? no — partial",
    authoredMediaHolds("(max-width: 48rem)", 0, 800.98) === "partial",
  );
  check(
    "(A2) …while `(max-width: 900px)` does cover it, em/rem converted at 16px",
    authoredMediaHolds("(max-width: 900px)", 0, 800.98) === "holds" &&
      authoredMediaHolds("(min-width: 48rem)", 801, Number.POSITIVE_INFINITY) === "holds",
  );
  check(
    "(A2) NEGATIVE — a condition this module cannot evaluate is `unparsed`, never `holds`",
    authoredMediaHolds("print", 801, Number.POSITIVE_INFINITY) === "unparsed" &&
      authoredMediaHolds("(hover: hover)", 801, Number.POSITIVE_INFINITY) === "unparsed",
  );
  const partialMedia = askAuthored(
    authoredNode({
      authored: [{ property: "width", value: "50%", media: "(min-width: 1024px)" }],
    }),
    { truthWidth: 600, parentContentWidth: 1200 },
  );
  check(
    "(A2) NEGATIVE — a partially-true media declaration is refused, not emitted",
    !partialMedia.answer.ok &&
      partialMedia.declarationRefusals.includes("width:media-partial-range"),
    JSON.stringify(partialMedia),
  );
  const mobileMedia = askAuthored(
    authoredNode({
      authored: [{ property: "width", value: "100%", media: "(max-width: 900px)" }],
    }),
    { range: MOBILE_RANGE, truthWidth: 390, parentContentWidth: 390 },
  );
  check(
    "(A2) the SAME declaration holds on the mobile range and is emitted there",
    mobileMedia.answer.ok && mobileMedia.answer.declarations["width"] === "100%",
    JSON.stringify(mobileMedia.answer),
  );

  // --- NEGATIVE: the node itself is out of scope --------------------------
  check(
    "(A2) NEGATIVE — an inline box has no inline size to restate",
    !askAuthored(authoredNode({ authored: [{ property: "width", value: "100%" }] }), {
      display: "inline",
    }).answer.ok,
  );
  check(
    "(A2) NEGATIVE — an out-of-flow box's width is an inset equation, not this",
    !askAuthored(authoredNode({ authored: [{ property: "width", value: "100%" }] }), {
      position: "absolute",
    }).answer.ok,
  );
  check(
    "(A2) NEGATIVE — a node a measured branch already answered is never touched",
    !askAuthored(authoredNode({ authored: [{ property: "width", value: "100%" }] }), {
      alreadyRecovered: true,
    }).answer.ok,
  );
  check(
    "(A2) NEGATIVE — a node with no authored layout at all",
    !askAuthored(authoredNode({})).answer.ok,
  );

  // --- NEGATIVE: the authored value contradicts the observation ------------
  const inconsistentPercent = askAuthored(
    authoredNode({ authored: [{ property: "width", value: "50%" }] }),
    { truthWidth: 600, parentContentWidth: 600 },
  );
  check(
    "(A2) NEGATIVE — `width: 50%` on a box observed at 100% of its parent is refused",
    !inconsistentPercent.answer.ok &&
      inconsistentPercent.declarationRefusals.includes(
        "width:authored-inconsistent-with-truth",
      ),
    JSON.stringify(inconsistentPercent),
  );
  const capBelowTruth = askAuthored(
    authoredNode({ authored: [{ property: "max-width", value: "400px" }] }),
    { truthWidth: 600 },
  );
  check(
    "(A2) NEGATIVE — a px cap BELOW the observed width would shrink it, so it is refused",
    !capBelowTruth.answer.ok &&
      capBelowTruth.declarationRefusals.includes(
        "max-width:authored-inconsistent-with-truth",
      ),
    JSON.stringify(capBelowTruth),
  );

  // --- CASCADE: the LAST admissible declaration wins, and depth is counted --
  const cascade = askAuthored(
    authoredNode({
      authored: [
        { property: "width", value: "calc(100% - 0px)" },
        { property: "width", value: "100%" },
      ],
    }),
    { truthWidth: 600, parentContentWidth: 600 },
  );
  check(
    "(A2) the LAST admissible declaration wins, and the cascade depth is counted",
    cascade.answer.ok &&
      cascade.answer.declarations["width"] === "100%" &&
      cascade.answer.cascadeCandidates === 1,
    JSON.stringify(cascade.answer),
  );

  // --- the closed property set is exactly what it claims to be ------------
  check(
    "(A2) the property allowlist is closed, and every member is layout-only",
    AUTHORED_INTENT_PROPERTIES.length === 7 &&
      !AUTHORED_INTENT_PROPERTIES.includes("height") &&
      !AUTHORED_INTENT_PROPERTIES.includes("display") &&
      !AUTHORED_INTENT_PROPERTIES.includes("position"),
    JSON.stringify(AUTHORED_INTENT_PROPERTIES),
  );
  const outsideAllowlist = askAuthored(
    authoredNode({ authored: [{ property: "padding-left", value: "5%" }] }),
    { truthWidth: 600 },
  );
  check(
    "(A2) NEGATIVE — a layout property OUTSIDE the allowlist is never emitted",
    !outsideAllowlist.answer.ok && outsideAllowlist.answer.reason === "no-admissible-property",
    JSON.stringify(outsideAllowlist.answer),
  );
}

// ---------------------------------------------------------------------------
// TASK 28.8 A3 — TEXT-BOX BLOCK-SIZE RELIEF
// ---------------------------------------------------------------------------

function textBoxNode(options: {
  nodeId?: string;
  tagName?: string;
  childNodeIds?: string[];
  parentNodeId?: string;
  styleTokenId?: string;
}): ElementSpecNode {
  return {
    nodeId: options.nodeId ?? "n000001",
    type: "element",
    tagName: options.tagName ?? "div",
    childNodeIds: options.childNodeIds ?? [],
    ...(options.parentNodeId !== undefined ? { parentNodeId: options.parentNodeId } : {}),
    attributes: {},
    assetRefs: [],
    relations: [],
    limitations: [],
    localVisible: true,
    effectiveVisible: true,
    styleTokenId: options.styleTokenId ?? "st000001",
  } as unknown as ElementSpecNode;
}

function textSpecNode(nodeId: string, value: string, parentNodeId: string): unknown {
  return { nodeId, type: "text", parentNodeId, value };
}

function textBoxReliefChecks(): void {
  console.log("\n§28.8 A3 text-box block-size relief");

  /*
   * The canary shape, generically: a flex row of shrink-to-fit list items whose
   * frozen `width` and `height` are both text MEASUREMENTS taken in a font the
   * clone will not load. The mechanism is the same on any script; CJK only makes
   * the fallback's ~15% wider advance impossible to miss.
   */
  const nodeById = new Map<string, unknown>();
  const row = textBoxNode({ nodeId: "n1", tagName: "ul", childNodeIds: ["n2"] });
  const item = textBoxNode({
    nodeId: "n2",
    tagName: "li",
    parentNodeId: "n1",
    childNodeIds: ["t1"],
    styleTokenId: "st000002",
  });
  nodeById.set("n1", row);
  nodeById.set("n2", item);
  nodeById.set("t1", textSpecNode("t1", "쇼핑", "n2"));
  const index = nodeById as unknown as ReadonlyMap<string, SpecNode>;

  const flexRowProps = { display: "flex", position: "static", overflow: "visible" };
  const itemProps = {
    display: "list-item",
    position: "static",
    overflow: "visible",
    width: "24.2031px",
    height: "20px",
  };

  check(
    "(A3) a text-bearing, non-clipping block gets the min-height variant",
    textBoxHeightVariantApplies(item, itemProps, index) &&
      textBoxHeightVariantApplies(row, { ...flexRowProps, height: "48px" }, index),
  );
  check(
    "(A3) …and a shrink-to-fit box with DIRECT text gets the width variant",
    textBoxShrinkVariantApplies(item, itemProps, flexRowProps, index),
  );
  check(
    "(A3) …while the row itself has no direct text, so its width is left frozen",
    !textBoxShrinkVariantApplies(row, { ...flexRowProps, width: "620px" }, undefined, index),
  );
  check(
    "(A3) the text-descendant walk sees through elements, not only direct children",
    hasTextDescendant("n1", index) && hasTextDescendant("n2", index),
  );

  // --- NEGATIVES ----------------------------------------------------------
  check(
    "(A3) NEGATIVE — a box the source deliberately CLIPS keeps its frozen height",
    !textBoxHeightVariantApplies(
      item,
      { ...itemProps, overflow: "hidden" },
      index,
    ) &&
      !textBoxHeightVariantApplies(item, { ...itemProps, "overflow-y": "auto" }, index),
  );
  check(
    "(A3) NEGATIVE — a replaced element's box is its content's, not a text measurement",
    !textBoxHeightVariantApplies(
      textBoxNode({ nodeId: "n2", tagName: "img", childNodeIds: ["t1"], parentNodeId: "n1" }),
      itemProps,
      index,
    ),
  );
  check(
    "(A3) NEGATIVE — an out-of-flow or inline box is out of scope for both variants",
    !textBoxHeightVariantApplies(item, { ...itemProps, position: "absolute" }, index) &&
      !textBoxHeightVariantApplies(item, { ...itemProps, display: "inline" }, index) &&
      !textBoxShrinkVariantApplies(
        item,
        { ...itemProps, position: "fixed" },
        flexRowProps,
        index,
      ),
  );
  const emptyBox = textBoxNode({ nodeId: "n3", tagName: "div", parentNodeId: "n1" });
  nodeById.set("n3", emptyBox);
  check(
    "(A3) NEGATIVE — a box with no text in it has no text measurement to relieve",
    !textBoxHeightVariantApplies(emptyBox, { display: "block", overflow: "visible" }, index) &&
      !textBoxShrinkVariantApplies(
        emptyBox,
        { display: "inline-block", overflow: "visible" },
        flexRowProps,
        index,
      ),
  );
  check(
    "(A3) NEGATIVE — a token whose frozen length is not a px number is left alone",
    !textBoxHeightRelievable({ height: "auto" }) &&
      !textBoxHeightRelievable({ height: "50%" }) &&
      !textBoxHeightRelievable({}) &&
      !textBoxWidthRelievable({ width: "auto" }),
  );

  // --- the CSS the variants actually write --------------------------------
  const styles = generateStylesheet({
    styleCatalog: {
      tokenCount: 2,
      styles: [
        { styleTokenId: "st000001", properties: { display: "flex", height: "48px", width: "620px" } },
        {
          styleTokenId: "st000002",
          properties: { display: "list-item", height: "20px", width: "24.2031px" },
        },
      ],
    } as unknown as Parameters<typeof generateStylesheet>[0]["styleCatalog"],
    usedTokenIds: ["st000001", "st000002"],
    documentRootTokenIds: [],
    textBoxVariantTokens: { tx: new Set(["st000001", "st000002"]), sf: new Set(["st000002"]) },
  });
  check(
    "(A3) the height variant restates the SAME number as a floor, next to its token",
    styles.css.includes(".wr-st000001.wr-tx{height:auto;min-height:48px}") &&
      styles.css.includes(".wr-st000002.wr-tx{height:auto;min-height:20px}"),
    styles.css,
  );
  check(
    "(A3) the shrink variant drops the frozen width and keeps everything else",
    styles.css.includes(".wr-st000002.wr-sf{width:auto}") &&
      !styles.css.includes(".wr-st000001.wr-sf"),
    styles.css,
  );
  check(
    "(A3) …and the frozen token rules themselves are UNCHANGED",
    styles.css.includes(".wr-st000002{display:list-item;height:20px;width:24.2031px}"),
    styles.css,
  );
  check(
    "(A3) a variant rule is emitted only for a token some flagged node uses",
    generateStylesheet({
      styleCatalog: {
        tokenCount: 1,
        styles: [{ styleTokenId: "st000001", properties: { height: "48px" } }],
      } as unknown as Parameters<typeof generateStylesheet>[0]["styleCatalog"],
      usedTokenIds: ["st000001"],
      documentRootTokenIds: [],
    }).css === ".wr-st000001{height:48px}",
  );
  check(
    "(A3) the counters name what shipped: 2 height rules, 1 width rule, 3 variants",
    styles.textBoxRelief.heightVariantRules === 2 &&
      styles.textBoxRelief.widthVariantRules === 1 &&
      styles.textBoxRelief.tokensVariants === 3,
    JSON.stringify(styles.textBoxRelief),
  );
  check(
    "(A3) nothing is forced: no `!important` anywhere in the variant tier",
    !styles.css.includes("!important") &&
      TEXT_BOX_HEIGHT_VARIANT_CLASS === "wr-tx" &&
      TEXT_BOX_SHRINK_VARIANT_CLASS === "wr-sf",
  );
  /*
   * The precedence claim, as arithmetic rather than prose. A variant selector is
   * (0,2,0); the frozen token is (0,1,0); a recovered rule is
   * `[data-wr-page][data-wr-viewport] [data-wr-node]` = (0,3,0). So a variant
   * beats the freeze and LOSES to any measured relation — which is the order a
   * heuristic about text must sit in.
   */
  const recovered = generateLayoutCss([
    {
      pageId: "p000001",
      viewportId: "desktop",
      nodeId: "n2",
      kind: "authored-inline-size",
      declarations: { width: "100%" },
      evidence: [],
    },
  ]);
  check(
    "(A3) the recovered tier still outranks the variant: 3 attribute selectors vs 2 classes",
    (recovered.match(/\[data-wr-/g) ?? []).length === 3 &&
      !recovered.includes("!important"),
    recovered,
  );
}

/**
 * TASK 28.8 A3 — THE VARIANTS, MEASURED IN A REAL BROWSER.
 *
 * A3 ships in the FROZEN tier, which `verifyLayoutRules()` treats as the
 * BASELINE rather than as a candidate — the check renders with and without the
 * recovered tier, and the variants are in both. So nothing in the generation
 * path re-renders them, and the claim "identical at the truth width whenever the
 * content fits" would otherwise be a sentence in a docstring. This is the
 * measurement instead.
 */
async function textBoxReliefRenderChecks(): Promise<void> {
  section("Part 11t — 28.8 A3: the relief variants are geometry-neutral where the text fits");

  const { chromium } = await import("playwright");
  const browser = await chromium.launch();
  let natural = { w: 0, h: 0 };
  let measured: Record<string, number> = {};
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    /*
     * The frozen numbers are MEASURED IN THIS RENDER rather than invented, which
     * is what the exact tier does: `width`/`height` on a text box is the used
     * value the browser reported for that text in that font. A made-up frozen
     * number would make `width: auto` look like a change when it is a
     * restatement.
     */
    await page.setContent(
      "<style>html,body{margin:0;padding:0;font:14px/20px sans-serif}" +
        ".row{display:flex;width:600px}" +
        ".block{width:120px}" +
        ".item{display:list-item;list-style:none;overflow:visible}" +
        "</style>" +
        '<div class=row><div class=item id=natural>one two three</div></div>' +
        '<div class=block id=naturalBlock>one two three</div>',
    );
    natural = await page.evaluate(() => {
      const item = document.getElementById("natural")!.getBoundingClientRect();
      const block = document.getElementById("naturalBlock")!.getBoundingClientRect();
      return { w: Math.round(item.width), h: Math.round(block.height) };
    });
    await page.evaluate(
      ({ w, h }: { w: number; h: number }) => {
        const style = document.createElement("style");
        // Byte-for-byte the two shapes `generateStylesheet()` emits.
        style.textContent =
          `.tok{width:${w}px;height:${h}px}` +
          `.tok.wr-tx{height:auto;min-height:${h}px}` +
          `.tok.wr-sf{width:auto}` +
          `.blk{width:120px;height:${h}px;overflow:visible}` +
          `.blk.wr-tx{height:auto;min-height:${h}px}`;
        document.head.appendChild(style);
        document.body.insertAdjacentHTML(
          "beforeend",
          '<div class=row><div class="item tok" id=fitFrozen>one two three</div></div>' +
            '<div class=row><div class="item tok wr-sf" id=fitRelief>one two three</div></div>' +
            '<div class=blk id=growFit>one two three</div>' +
            '<div class="blk wr-tx" id=growFitRelief>one two three</div>' +
            '<div class=blk id=growFrozen>one two three four five six seven eight</div>' +
            '<div class="blk wr-tx" id=growRelief>one two three four five six seven eight</div>',
        );
      },
      natural,
    );
    measured = await page.evaluate(() => {
      const out: Record<string, number> = {};
      for (const id of [
        "fitFrozen",
        "fitRelief",
        "growFit",
        "growFitRelief",
        "growFrozen",
        "growRelief",
      ]) {
        const element = document.getElementById(id)!;
        const rect = element.getBoundingClientRect();
        out[`${id}W`] = Math.round(rect.width);
        out[`${id}H`] = Math.round(rect.height);
        out[`${id}Scroll`] = element.scrollHeight;
      }
      return out;
    });
  } finally {
    await browser.close();
  }
  check(
    "(A3) `width: auto` RESTATES a shrink-to-fit frozen width — same box, to the pixel",
    natural.w > 0 &&
      measured["fitReliefW"] === measured["fitFrozenW"] &&
      measured["fitReliefH"] === measured["fitFrozenH"],
    `${JSON.stringify(natural)} ${JSON.stringify(measured)}`,
  );
  check(
    "(A3) `min-height` restates a frozen height the content fits — same box, to the pixel",
    measured["growFitReliefH"] === measured["growFitH"] &&
      measured["growFitReliefW"] === measured["growFitW"] &&
      measured["growFitH"] === natural.h,
    JSON.stringify(measured),
  );
  check(
    "(A3) the DEFECT reproduces: reflowed text spills OUT of the frozen height",
    measured["growFrozenH"] === natural.h && measured["growFrozenScroll"] > natural.h,
    JSON.stringify(measured),
  );
  check(
    "(A3) …and the variant makes the box GROW to contain it instead of overprinting",
    measured["growReliefH"] > measured["growFrozenH"] &&
      measured["growReliefH"] === measured["growReliefScroll"],
    JSON.stringify(measured),
  );
}

// ---------------------------------------------------------------------------
// Part 12 — P0 contract C2.1: interval-sample verification (1440 is not acceptance)
// ---------------------------------------------------------------------------

/**
 * Four one-box pages. The exact tier froze `.q-box` at its truth-viewport
 * geometry (x 120, w 1200 at 1440) and nothing else is styled, so every width
 * the box is rendered at is the frozen 1440 geometry unless a candidate rule
 * changes it. The per-width SOURCE boxes live only in each rule's `samples`.
 * Generic CSS semantics, no site and no breakpoint taken from any real page.
 */
const Q_CSS = `
html, body { margin: 0; padding: 0; }
.wr-variant { display: contents; }
.q-box { width: 1200px; margin-left: 120px; height: 10px; }
`;
const Q1 = runtimePage("q000001", el("q1box", "q-box"));
const Q2 = runtimePage("q000002", el("q2box", "q-box"));
const Q3 = runtimePage("q000003", el("q3box", "q-box"));
const Q4 = runtimePage("q000004", el("q4box", "q-box"));
const Q5 = runtimePage("q000005", el("q5box", "q-box"));
const Q6 = runtimePage("q000006", el("q6box", "q-box"));
const Q_PAGES = [Q1, Q2, Q3, Q4, Q5, Q6];

/** A source that is a centered 1200px column, fluid below 1200. */
const CENTERED_SOURCE_SAMPLES = [
  { width: 1024, x: 0, w: 1024, v: 1 as const },
  { width: 1440, x: 120, w: 1200, v: 1 as const },
  { width: 1920, x: 360, w: 1200, v: 1 as const },
];

/** (2) The correct fluid relation: right at every sample. */
const Q_FLUID_RULE: RecoveredLayoutRule = {
  pageId: "q000001",
  viewportId: "desktop",
  nodeId: "q1box",
  kind: "centered-max-width",
  declarations: {
    "max-width": "1200px",
    width: "auto",
    "margin-left": "auto",
    "margin-right": "auto",
  },
  evidence: ["fixture"],
  truth: { x: 120, w: 1200 },
  servedInterval: { min: 1000, max: Number.POSITIVE_INFINITY },
  samples: CENTERED_SOURCE_SAMPLES,
};

/**
 * (1) THE CORE CASE. Reproduces the source exactly at 1440 (1440 − 240 = 1200,
 * at x 120) and is wrong everywhere else: 784px at 1024 where the source is
 * 1024px and the frozen tier would have rendered 1200px (error 176). Its error
 * there is 240 — worse than shipping nothing.
 */
const Q_TRUTH_ONLY_RULE: RecoveredLayoutRule = {
  pageId: "q000002",
  viewportId: "desktop",
  nodeId: "q2box",
  kind: "percentage-width",
  declarations: { width: "calc(100% - 240px)", "margin-left": "120px" },
  evidence: ["fixture"],
  truth: { x: 120, w: 1200 },
  servedInterval: { min: 1000, max: Number.POSITIVE_INFINITY },
  samples: CENTERED_SOURCE_SAMPLES,
};

/**
 * (5) Same declarations, but against a source whose box at 1024 is 400px: the
 * rule is 384px off there (outside tolerance) and the frozen tier is 800px off.
 * No worse than frozen ⇒ the baseline must keep it.
 */
const Q_NO_WORSE_RULE: RecoveredLayoutRule = {
  ...Q_TRUTH_ONLY_RULE,
  pageId: "q000003",
  nodeId: "q3box",
  samples: [
    { width: 1024, x: 120, w: 400, v: 1 },
    { width: 1440, x: 120, w: 1200, v: 1 },
    { width: 1920, x: 120, w: 1680, v: 1 },
  ],
};

/**
 * (4) A banded geometry rule active only below 1200, verified at its band
 * width 1024. Its `truth` is a STALE rect taken at 1440 — the shape a rule
 * compared against one foreign width would carry. The per-width source sample
 * at 1024 says the box fills the viewport, which is exactly what the rule does.
 */
const Q_BAND_RULE: RecoveredLayoutRule = {
  pageId: "q000004",
  viewportId: "desktop",
  nodeId: "q4box",
  kind: "full-width",
  declarations: { width: "100%", "margin-left": "0px" },
  media: "(max-width: 1199.98px)",
  band: { maxWidth: 1200, hiddenSamples: [1024, 1100], verifyWidth: 1024 },
  evidence: ["fixture"],
  truth: { x: 120, w: 1200 },
  servedInterval: { min: 1000, max: 1200 },
  samples: [
    { width: 1024, x: 0, w: 1024, v: 1 },
    { width: 1100, x: 0, w: 1100, v: 1 },
  ],
};

/**
 * Amended C2.1 — CORRECT at the three positional picks of a desktop [801, ∞)
 * interval (899 / 1440 / 1920) and WRONG at 1024, which no positional pick
 * lands on: the source filled the viewport there (x 0, w 1024) and the rule
 * renders 784px (error 240, frozen error 176).
 */
const Q_BETWEEN_PICKS_RULE: RecoveredLayoutRule = {
  pageId: "q000005",
  viewportId: "desktop",
  nodeId: "q5box",
  kind: "percentage-width",
  declarations: { width: "calc(100% - 240px)", "margin-left": "120px" },
  evidence: ["fixture"],
  truth: { x: 120, w: 1200 },
  servedInterval: { min: 801, max: Number.POSITIVE_INFINITY },
  samples: [
    { width: 899, x: 120, w: 659, v: 1 },
    { width: 1024, x: 0, w: 1024, v: 1 },
    { width: 1440, x: 120, w: 1200, v: 1 },
    { width: 1920, x: 120, w: 1680, v: 1 },
  ],
};

/** Amended C2.1 — a correct rule with 18 probe widths inside its interval: the per-pass cap of 16 bites. */
const Q_CAP_WIDTHS = Array.from({ length: 18 }, (_, i) => 1000 + i * 50);
const Q_CAPPED_RULE: RecoveredLayoutRule = {
  ...Q_BETWEEN_PICKS_RULE,
  pageId: "q000006",
  nodeId: "q6box",
  servedInterval: { min: 1000, max: Number.POSITIVE_INFINITY },
  samples: Q_CAP_WIDTHS.map((width) => ({ width, x: 120, w: width - 240, v: 1 as const })),
};

function withoutSamples(source: RecoveredLayoutRule): RecoveredLayoutRule {
  const { samples: _samples, servedInterval: _interval, ...rest } = source;
  return rest;
}

function intervalSelectionChecks(): void {
  section("Part 12a — C2.1: interval sample selection (pure)");

  const probe = [390, 599, 600, 700, 768, 899, 900, 1024, 1100, 1199, 1200, 1440, 1536, 1920];
  const desktop = selectIntervalSamples(probe, { min: 900, max: Number.POSITIVE_INFINITY }, 1440);
  check(
    "(C2.1) desktop [900, ∞): lo→900, lo+1→900 (collapsed), mid of [900,1920]→1440, hi-1→widest 1920, truth 1440",
    desktop.widths.join(",") === "900,1440,1920" &&
      desktop.probedPositions.map((entry) => `${entry.position}:${entry.width}`).join(",") ===
        "lo:900,lo+1:900,mid:1440,hi-1:1920,truth:1440" &&
      desktop.unprobed.length === 0,
    JSON.stringify(desktop),
  );
  const mobile = selectIntervalSamples(probe, { min: 0, max: 900 }, 390);
  check(
    "(C2.1) mobile [0, 900): lo→390, mid 450→390, hi-1 899→899, truth 390",
    mobile.widths.join(",") === "390,899" &&
      mobile.probedPositions.find((entry) => entry.position === "hi-1")?.width === 899 &&
      mobile.requestedPositions.some((entry) => entry.position === "truth"),
    JSON.stringify(mobile),
  );
  check(
    "(C2.1 amended) allProbeWidthsInInterval lists EVERY probe width inside [900, ∞), deduped and ascending — 1024/1100 included",
    desktop.allProbeWidthsInInterval.join(",") === "900,1024,1100,1199,1200,1440,1536,1920" &&
      !desktop.widths.includes(1024) &&
      desktop.widths.every((width) => desktop.allProbeWidthsInInterval.includes(width)),
    JSON.stringify(desktop.allProbeWidthsInInterval),
  );
  const noCap = capIntervalSampleWidths([900, 1440], [900, 1024, 1440, 1920]);
  check(
    "(C2.1 amended) under the cap every width is verified and nothing is reported capped",
    noCap.widths.join(",") === "900,1024,1440,1920" && noCap.capped === 0,
    JSON.stringify(noCap),
  );
  const capped = capIntervalSampleWidths([1000, 1450, 1850], Q_CAP_WIDTHS);
  const cappedAgain = capIntervalSampleWidths([1850, 1000, 1450, 1000], [...Q_CAP_WIDTHS].reverse());
  check(
    "(C2.1 amended) over the cap: 16 widths, 2 recorded capped, every positional pick kept, deterministic",
    INTERVAL_SAMPLE_MAX_WIDTHS_PER_PASS === 16 &&
      capped.widths.length === 16 &&
      capped.capped === 2 &&
      [1000, 1450, 1850].every((width) => capped.widths.includes(width)) &&
      JSON.stringify(capped) === JSON.stringify(cappedAgain),
    JSON.stringify(capped),
  );
  const gapPick = capIntervalSampleWidths([1000, 2000], [1000, 1100, 1500, 1900, 2000], 3);
  check(
    "(C2.1 amended) the remaining widths are chosen by LARGEST GAP (1500 before 1100/1900)",
    gapPick.widths.join(",") === "1000,1500,2000" && gapPick.capped === 2,
    JSON.stringify(gapPick),
  );
  const overPositional = capIntervalSampleWidths([1000, 1100, 1500, 1900, 2000], [], 3);
  check(
    "(C2.1 amended) positional picks beyond the cap are themselves chosen narrowest-first then by gap",
    overPositional.widths.join(",") === "1000,1500,2000" && overPositional.capped === 2,
    JSON.stringify(overPositional),
  );
  const band = selectIntervalSamples(probe, { min: 1024, max: 1200 }, 1440);
  check(
    "(C2.1) a band [1024, 1200) excluding the truth width requests no truth position",
    band.widths.join(",") === "1024,1100,1199" &&
      !band.requestedPositions.some((entry) => entry.position === "truth"),
    JSON.stringify(band),
  );
  const shuffled = selectIntervalSamples(
    [...probe].reverse().concat([1440, 900, 1920]),
    { min: 900, max: Number.POSITIVE_INFINITY },
    1440,
  );
  check(
    "(C2.1) selection is deterministic: order and duplicates in the probe list change nothing",
    JSON.stringify(shuffled) === JSON.stringify(desktop),
  );
  // mid of [1000, 1200] is 1100: 1050 and 1150 are both 50px away.
  const tie = selectIntervalSamples([1050, 1150], { min: 1000, max: 1200 }, undefined);
  check(
    "(C2.1) a midpoint tie goes to the NARROWER width",
    tie.probedPositions.find((entry) => entry.position === "mid")?.width === 1050 &&
      tie.widths.join(",") === "1050,1150",
    JSON.stringify(tie),
  );
  const empty = selectIntervalSamples(probe, { min: 2000, max: 2400 }, 1440);
  check(
    "(C2.1) an interval with no probe width inside reports every position UNPROBED and selects nothing",
    empty.widths.length === 0 &&
      empty.probedPositions.length === 0 &&
      empty.unprobed.map((entry) => entry.position).join(",") === "lo,lo+1,mid,hi-1",
    JSON.stringify(empty),
  );
  const truthUnprobed = selectIntervalSamples([1024, 1920], { min: 1000, max: Number.POSITIVE_INFINITY }, 1440);
  check(
    "(C2.1) a truth width inside the interval that the probe did not measure is UNPROBED, never substituted",
    truthUnprobed.unprobed.map((entry) => entry.position).join(",") === "truth" &&
      !truthUnprobed.widths.includes(1440),
    JSON.stringify(truthUnprobed),
  );

  // The reject predicate and error, as units.
  check(
    "(C2.1) tolerance is max(4px, 0.5%·W): 4 at 390, 9.6 at 1920",
    intervalSampleTolerancePx(390) === 4 && Math.abs(intervalSampleTolerancePx(1920) - 9.6) < 1e-9,
  );
  check(
    "(C2.1) a clone box out of layout where the source is visible is an error of +∞; a hidden source sample says nothing",
    intervalSampleError({ x: 0, w: 100, v: 1 }, { x: 0, w: 0, l: false }) ===
      Number.POSITIVE_INFINITY &&
      intervalSampleError({ x: 0, w: 100, v: 1 }, null) === Number.POSITIVE_INFINITY &&
      intervalSampleError({ x: 0, w: 100, v: 0 }, { x: 0, w: 50, l: true }) === undefined &&
      intervalSampleError({ x: 10, w: 100, v: 1 }, { x: 13, w: 92, l: true }) === 8,
  );
  check(
    "(C2.1) regressed ⇔ errWith > tol AND errWith > errWithout + 0.5",
    intervalSampleRegressed(10, 5, 1024) &&
      !intervalSampleRegressed(10, 9.6, 1024) &&
      !intervalSampleRegressed(5, 0, 1024) &&
      !intervalSampleRegressed(Number.POSITIVE_INFINITY, Number.POSITIVE_INFINITY, 1024),
  );

  // Served interval + sample extraction on the inference side.
  check(
    "(C2.1) served interval = tree range ∩ band (desktop [bp,∞), mobile [0,bp)); empty ⇒ undefined",
    JSON.stringify(ruleServedInterval("desktop", 900)) ===
      JSON.stringify({ min: 900, max: Number.POSITIVE_INFINITY }) &&
      JSON.stringify(ruleServedInterval("mobile", 900)) === JSON.stringify({ min: 0, max: 900 }) &&
      JSON.stringify(ruleServedInterval("desktop", 900, { minWidth: 1000, maxWidth: 1200 })) ===
        JSON.stringify({ min: 1000, max: 1200 }) &&
      ruleServedInterval("mobile", 900, { minWidth: 1000 }) === undefined,
  );
  const extracted = probeSamplesInInterval(
    { x: [1, 2, 3, 4], w: [10, 20, 30], v: [1, 0, 1, 1] },
    [390, 900, 1440, 1920],
    { min: 900, max: Number.POSITIVE_INFINITY },
  );
  check(
    "(C2.1) samples are the probe arrays at widths inside the interval; a width with a missing entry is skipped, never filled",
    JSON.stringify(extracted) ===
      JSON.stringify([
        { width: 900, x: 2, w: 20, v: 0 },
        { width: 1440, x: 3, w: 30, v: 1 },
      ]),
    JSON.stringify(extracted),
  );
}

async function intervalSampleRenderChecks(): Promise<void> {
  section("Part 12b — C2.1: rules are rendered at their interval samples, not at 1440 alone");

  // --- (1) right at 1440, wrong at 1024 --------------------------------------
  const truthOnly = await verifyLayoutRules({
    rules: [withoutSamples(Q_TRUTH_ONLY_RULE)],
    pages: Q_PAGES,
    css: Q_CSS,
  });
  check(
    "(C2.1) CONTROL: without samples the truth-width check alone ACCEPTS the rule (the pre-C2.1 behaviour, unchanged)",
    truthOnly.rules.length === 1 &&
      truthOnly.counters.intervalSampleCheckable === 0 &&
      truthOnly.counters.intervalSamplesRendered === 0 &&
      truthOnly.intervalRejections.length === 0,
    JSON.stringify(truthOnly.counters),
  );
  const sampled = await verifyLayoutRules({
    rules: [Q_TRUTH_ONLY_RULE],
    pages: Q_PAGES,
    css: Q_CSS,
  });
  const rejection = sampled.intervalRejections[0];
  check(
    "(C2.1) 1440 ALONE IS NOT ACCEPTANCE: the same rule with per-width samples is REJECTED interval-sample-regressed",
    sampled.rules.length === 0 &&
      sampled.counters.rejectedAtIntervalSample === 1 &&
      rejection?.reason === "interval-sample-regressed" &&
      rejection.width === 1024,
    JSON.stringify(sampled.intervalRejections),
  );
  check(
    "(C2.1) …the rejection records width, errWith (240 = |784 − 1024|) and errWithout (176 = |1200 − 1024|)",
    rejection !== undefined &&
      Math.abs(rejection.errWith - 240) <= 1 &&
      Math.abs(rejection.errWithout - 176) <= 1 &&
      rejection.positions.includes("lo") &&
      Math.abs(rejection.tolerancePx - 5.12) < 1e-9,
    JSON.stringify(rejection),
  );
  check(
    "(C2.1) …it passed the truth-width rounds (not a truth rejection) and the accounting stays exact",
    sampled.counters.rejectedByTruthCheck === 0 &&
      sampled.counters.rejectedUnverifiable === 0 &&
      sampled.counters.rejectedByBandCheck === 0 &&
      sampled.counters.candidateRules === 1 &&
      JSON.stringify(sampled.counters.rejectedAtIntervalSampleByKind) ===
        JSON.stringify({ "percentage-width": 1 }),
    JSON.stringify(sampled.counters),
  );
  check(
    "(C2.1) …cost: the truth render is reused, 1024 and 1920 are the only extra loads; one sample judged before rejection",
    sampled.counters.pagesRendered === 1 &&
      sampled.counters.intervalSamplesRendered === 2 &&
      sampled.counters.intervalSamplesChecked === 1 &&
      sampled.counters.intervalSampleCheckable === 1 &&
      sampled.counters.converged,
    JSON.stringify(sampled.counters),
  );
  check(
    "(C2.1) …and the rejected rule is absent from the shipped CSS",
    !sampled.css.includes('[data-wr-node="q2box"]'),
  );

  // --- (2) a correct fluid rule is accepted at every sample ---------------------
  const fluid = await verifyLayoutRules({ rules: [Q_FLUID_RULE], pages: Q_PAGES, css: Q_CSS });
  check(
    "(C2.1) a correct fluid rule is ACCEPTED at every selected sample (1024, 1440, 1920)",
    fluid.rules.length === 1 &&
      fluid.intervalRejections.length === 0 &&
      fluid.counters.intervalSamplesChecked === 3 &&
      fluid.counters.intervalSamplesRendered === 2 &&
      fluid.counters.unprobedPositions === 0 &&
      fluid.counters.rejectedUnverifiable === 0,
    JSON.stringify(fluid.counters),
  );

  // --- (3) unprobed positions are counted, not fabricated ----------------------
  const unprobed = await verifyLayoutRules({
    rules: [
      {
        ...Q_FLUID_RULE,
        samples: CENTERED_SOURCE_SAMPLES.filter((sample) => sample.width !== 1440),
      },
    ],
    pages: Q_PAGES,
    css: Q_CSS,
  });
  check(
    "(C2.1) a served interval containing the truth width with no truth sample reports 1 unprobed position and still verifies the probed ones",
    unprobed.counters.unprobedPositions === 1 &&
      unprobed.rules.length === 1 &&
      unprobed.counters.intervalSamplesChecked === 2,
    JSON.stringify(unprobed.counters),
  );

  // --- (5) errWithout keeps a rule that is no worse than frozen -----------------
  const noWorse = await verifyLayoutRules({ rules: [Q_NO_WORSE_RULE], pages: Q_PAGES, css: Q_CSS });
  check(
    "(C2.1) errWithout baseline: a rule 384px off at 1024 where the FROZEN tier is 800px off is NOT rejected",
    noWorse.rules.length === 1 &&
      noWorse.intervalRejections.length === 0 &&
      noWorse.counters.intervalSamplesChecked === 3,
    JSON.stringify(noWorse.intervalRejections),
  );

  // --- (4) banded geometry compared against the per-width source sample ---------
  const bandStale = await verifyLayoutRules({
    rules: [withoutSamples(Q_BAND_RULE)],
    pages: Q_PAGES,
    css: Q_CSS,
  });
  check(
    "(C2.1) CONTROL: without samples the band-width check compares 1024 against the stale 1440 rect and rejects a correct band",
    bandStale.rules.length === 0 && bandStale.counters.rejectedByTruthCheck === 1,
    JSON.stringify(bandStale.counters),
  );
  const bandSampled = await verifyLayoutRules({ rules: [Q_BAND_RULE], pages: Q_PAGES, css: Q_CSS });
  check(
    "(C2.1) with samples the band geometry at 1024 is compared to the SOURCE box at 1024 and ships, verified at 1024 and 1100",
    bandSampled.rules.length === 1 &&
      bandSampled.counters.bandGeometryCheckable === 1 &&
      bandSampled.counters.bandGeometryWidthsRendered === 1 &&
      bandSampled.counters.intervalSamplesChecked === 2 &&
      bandSampled.counters.intervalSamplesRendered === 1 &&
      bandSampled.counters.rejectedByTruthCheck === 0,
    JSON.stringify(bandSampled.counters),
  );
  const bandWrong = await verifyLayoutRules({
    rules: [
      {
        ...Q_BAND_RULE,
        samples: [
          // The source did NOT fill the viewport below 1200: it kept the frozen box.
          { width: 1024, x: 120, w: 1200, v: 1 },
          { width: 1100, x: 120, w: 1200, v: 1 },
        ],
      },
    ],
    pages: Q_PAGES,
    css: Q_CSS,
  });
  check(
    "(C2.1) …and a band whose per-width source sample disagrees is rejected at its band width",
    bandWrong.rules.length === 0 && bandWrong.counters.rejectedByTruthCheck === 1,
    JSON.stringify(bandWrong.counters),
  );

  // --- amended C2.1: every probe width, not only the positional picks ----------
  const betweenSelection = selectIntervalSamples(
    Q_BETWEEN_PICKS_RULE.samples!.map((sample) => sample.width),
    Q_BETWEEN_PICKS_RULE.servedInterval!,
    1440,
  );
  const between = await verifyLayoutRules({
    rules: [Q_BETWEEN_PICKS_RULE],
    pages: Q_PAGES,
    css: Q_CSS,
  });
  const betweenRejection = between.intervalRejections[0];
  check(
    "(C2.1 amended) a rule correct at the positional picks 899/1440/1920 but wrong at 1024 is REJECTED at 1024",
    betweenSelection.widths.join(",") === "899,1440,1920" &&
      between.rules.length === 0 &&
      between.counters.rejectedAtIntervalSample === 1 &&
      betweenRejection?.width === 1024 &&
      betweenRejection.positions.length === 0 &&
      Math.abs(betweenRejection.errWith - 240) <= 1 &&
      Math.abs(betweenRejection.errWithout - 176) <= 1,
    JSON.stringify(between.intervalRejections),
  );
  check(
    "(C2.1 amended) …it was judged at 899 (pass) before 1024 (reject); 3 extra loads, nothing capped",
    between.counters.intervalSamplesChecked === 2 &&
      between.counters.intervalSamplesRendered === 3 &&
      between.counters.intervalSampleWidthsCapped === 0 &&
      between.counters.rejectedByTruthCheck === 0,
    JSON.stringify(between.counters),
  );
  const cappedRun = await verifyLayoutRules({ rules: [Q_CAPPED_RULE], pages: Q_PAGES, css: Q_CSS });
  check(
    "(C2.1 amended) 18 probe widths in one pass: 16 verified, intervalSampleWidthsCapped 2, the correct rule ships",
    cappedRun.rules.length === 1 &&
      cappedRun.counters.intervalSampleWidthsCapped === 2 &&
      cappedRun.counters.intervalSamplesChecked === 16 &&
      cappedRun.counters.intervalSamplesRendered === 16 &&
      cappedRun.counters.unprobedPositions === 1,
    JSON.stringify(cappedRun.counters),
  );

  // --- the four together: batched per pass, accounting exact --------------------
  const all = await verifyLayoutRules({
    rules: [Q_FLUID_RULE, Q_TRUTH_ONLY_RULE, Q_NO_WORSE_RULE, Q_BAND_RULE],
    pages: Q_PAGES,
    css: Q_CSS,
  });
  check(
    "(C2.1) together: 3 accepted, 1 rejected at an interval sample, 0 unverifiable, 7 extra sample loads",
    all.counters.acceptedRules === 3 &&
      all.counters.rejectedAtIntervalSample === 1 &&
      all.counters.rejectedUnverifiable === 0 &&
      all.counters.intervalSamplesRendered === 7 &&
      all.counters.intervalSampleCheckable === 4 &&
      all.counters.candidateRules ===
        all.counters.acceptedRules +
          all.counters.rejectedByTruthCheck +
          all.counters.rejectedByBandCheck +
          all.counters.rejectedAtIntervalSample +
          all.counters.rejectedUnverifiable,
    JSON.stringify(all.counters),
  );
}

/**
 * RECI2 root-cause fix (a) — apartmentary p000001/desktop lost its root
 * `width:auto` rules when ONE interval-sample page load timed out and every
 * sampled rule of the pass was dropped, and phase A rejected every regressor of
 * a sweep together. Parent/child fixtures, generic CSS only.
 */
const R_CSS = `
html, body { margin: 0; padding: 0; }
.wr-variant { display: contents; }
.r-parent { width: 1200px; margin-left: 120px; height: 20px; }
.r-parent2 { width: 50%; margin-left: 120px; height: 20px; }
.r-child { width: 1200px; height: 10px; }
`;
const R1 = runtimePage("r000001", el("r1p", "r-parent", [el("r1c", "r-child")]));
const R2 = runtimePage("r000002", el("r2p", "r-parent2", [el("r2c", "r-child")]));
const R_PAGES = [R1, R2];
const rRule = (
  pageId: string,
  nodeId: string,
  kind: RecoveredLayoutRule["kind"],
  declarations: Record<string, string>,
  samples: { width: number; x: number; w: number; v: 1 }[],
): RecoveredLayoutRule => ({
  pageId,
  viewportId: "desktop",
  nodeId,
  kind,
  declarations,
  evidence: ["fixture"],
  truth: { x: 120, w: 1200 },
  servedInterval: { min: 1000, max: Number.POSITIVE_INFINITY },
  samples,
});

async function intervalIsolationChecks(): Promise<void> {
  section("Part 12c — RECI2 (a): isolated interval-sample rejection, truth re-check, load retry");

  // (1) The parent's rule is wrong at 1024; the child's `width:100%` is only
  // wrong there BECAUSE of the parent's. Alone, the child is no worse than frozen.
  const parentBad = rRule("r000001", "r1p", "percentage-width", { width: "calc(100% - 240px)" }, [
    { width: 1024, x: 0, w: 1024, v: 1 },
    { width: 1440, x: 120, w: 1200, v: 1 },
  ]);
  const childFill = rRule("r000001", "r1c", "full-width", { width: "100%" }, [
    { width: 1024, x: 0, w: 1024, v: 1 },
    { width: 1440, x: 120, w: 1200, v: 1 },
  ]);
  const iso = await verifyLayoutRules({ rules: [parentBad, childFill], pages: R_PAGES, css: R_CSS });
  check(
    "RECI2 (a): the regressing parent is rejected at 1024, the child it dragged down is NOT co-rejected",
    iso.intervalRejections.length === 1 &&
      iso.intervalRejections[0]?.nodeId === "r1p" &&
      iso.intervalRejections[0]?.width === 1024 &&
      iso.rules.length === 1 &&
      iso.rules[0]?.nodeId === "r1c",
    JSON.stringify(iso.intervalRejections.map((r) => `${r.nodeId}@${r.width} ${r.errWith}/${r.errWithout}`)),
  );
  check(
    "RECI2 (a): …isolation spent renders and records one co-rejection avoided; accounting stays exact",
    iso.counters.intervalIsolationRenders >= 1 &&
      iso.counters.intervalCoRejectionsAvoided === 1 &&
      iso.counters.intervalIsolationBudgetFallbacks === 0 &&
      iso.counters.rejectedUnverifiable === 0 &&
      iso.counters.candidateRules ===
        iso.counters.acceptedRules +
          iso.counters.rejectedByTruthCheck +
          iso.counters.rejectedByBandCheck +
          iso.counters.rejectedAtIntervalSample +
          iso.counters.rejectedUnverifiable,
    JSON.stringify(iso.counters),
  );
  const jointOnly = await verifyLayoutRules({ rules: [parentBad], pages: R_PAGES, css: R_CSS });
  check(
    "RECI2 (a): a single regressor costs no isolation render",
    jointOnly.counters.intervalIsolationRenders === 0 && jointOnly.counters.rejectedAtIntervalSample === 1,
    JSON.stringify(jointOnly.counters),
  );

  // (2) The child's truth-width acceptance DEPENDED on the parent's rule. Once
  // the interval stage removes the parent, the child is re-measured at 1440.
  const parentTruthOnly = rRule("r000002", "r2p", "percentage-width", { width: "calc(100% - 240px)" }, [
    { width: 1024, x: 120, w: 512, v: 1 },
    { width: 1440, x: 120, w: 1200, v: 1 },
  ]);
  const childDependent = rRule("r000002", "r2c", "full-width", { width: "100%" }, [
    // No sample at 1440: only the truth-width verdict speaks for it there.
    { width: 1024, x: 120, w: 784, v: 1 },
  ]);
  const recheck = await verifyLayoutRules({
    rules: [parentTruthOnly, childDependent],
    pages: R_PAGES,
    css: R_CSS,
  });
  check(
    "RECI2 (a): after the parent is removed at 1024, the child is re-checked at the truth width and rejected (720 ≠ 1200)",
    recheck.rules.length === 0 &&
      recheck.intervalRejections.some((r) => r.nodeId === "r2p") &&
      recheck.rejections.some((r) => r.nodeId === "r2c" && Math.abs(r.rendered.w - 720) <= 1) &&
      recheck.counters.truthRecheckRejections === 1,
    JSON.stringify({ c: recheck.counters, r: recheck.rejections, i: recheck.intervalRejections.map((r) => r.nodeId) }),
  );

  // (3) A page load that times out once is retried, not declared unverifiable.
  let calls = 0;
  const retries: number[] = [];
  const flaky = {
    setContent: async (): Promise<void> => {
      calls++;
      if (calls === 1) throw new Error("page.setContent: Timeout 30000ms exceeded.");
    },
  } as unknown as import("playwright").Page;
  await setContentWithRetry(flaky, "<p>x</p>", (attempt) => retries.push(attempt));
  check("RECI2 (a): one timeout then success → loaded on attempt 2, one retry reported", calls === 2 && retries.join(",") === "1");
  let hardCalls = 0;
  const dead = {
    setContent: async (): Promise<void> => {
      hardCalls++;
      throw new Error("page.setContent: Timeout 30000ms exceeded.");
    },
  } as unknown as import("playwright").Page;
  const threw = await setContentWithRetry(dead, "<p>x</p>").then(
    () => false,
    () => true,
  );
  check(
    "RECI2 (a): a load that fails every attempt still throws (rules stay rejected), after exactly RENDER_LOAD_ATTEMPTS tries",
    threw && hardCalls === RENDER_LOAD_ATTEMPTS && RENDER_LOAD_ATTEMPTS >= 2,
  );
}

async function main(): Promise<void> {
  console.log("[smoke:layout-safety] Task 28.5B — layout inference safety");
  await mkdir(TMP_ROOT, { recursive: true });
  try {
    guardChecks();
    await truthCheckChecks();
    await unverifiableChecks();
    await pipelineChecks();
    schemaCompatibilityChecks();
    widthModeChecks();
    bandEdgeChecks();
    bandSnapChecks();
    await bandBoundaryRenderChecks();
    await snappedBandRenderChecks();
    await bandVerificationChecks();
    await bandDiscriminationChecks();
    await exactTierBandChecks();
    await truthBaselineChecks();
    widthValueAndInlineParentChecks();
    treeSwitchChecks();
    viewportPassChecks();
    inlineSizeFunnelChecks();
    measuredContentBoxChecks();
    gridTrackChecks();
    await gridTrackTruthCheckChecks();
    gridSpanChecks();
    await residualAuditChecks();
    insetResolvedChecks();
    await insetResolvedTruthCheckChecks();
    trackedFillChecks();
    viewportBleedChecks();
    await trackedFillTruthCheckChecks();
    damageClampChecks();
    await damageClampTruthCheckChecks();
    await documentCanvasChecks();
    bandedGridTrackChecks();
    await bandedGridTruthCheckChecks();
    gridAreaFillChecks();
    await gridAreaFillTruthCheckChecks();
    perRouteTreeSwitchChecks();
    gradedServedSwitchChecks();
    familyFingerprintChecks();
    authoredIntentChecks();
    textBoxReliefChecks();
    await textBoxReliefRenderChecks();
    intervalSelectionChecks();
    await intervalSampleRenderChecks();
    await intervalIsolationChecks();
  } finally {
    await rm(TMP_ROOT, { recursive: true, force: true });
  }

  console.log("");
  console.log(`[smoke:layout-safety] ${checks - failures}/${checks} checks passed`);
  if (failures > 0) {
    console.log(`[smoke:layout-safety] FAIL — ${failures} check(s) failed`);
    process.exitCode = 1;
  } else {
    console.log("[smoke:layout-safety] PASS");
  }
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
