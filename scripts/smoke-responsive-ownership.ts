/**
 * smoke:responsive-ownership — Responsive Core P0 (contract §C2.4 / §C2.5), stream REC-I2.
 *
 * Authored-first width-family plans end to end, OFFLINE, in a real Chromium:
 *
 *   inference offer (`responsive-owned` rules, one group per node)
 *     → phase A (existing checks on non-owned rules)
 *     → phase B (per-group overlay render: truth, interval samples, co-damage, isolation)
 *     → ownership (marker classes, token split, measured width-family dropped)
 *     → owned-form confirm render.
 *
 * Every fixture is generic CSS (a percentage column, a centered max-width shell, a
 * wrapping flex row, a flex item, an image). Selectors in evidence records are
 * placeholders (`.a`, `.col`); no site, hostname or real breakpoint appears in any
 * logic — the fixture site's breakpoint is an INPUT, like any observation's.
 */

import { mkdir, readFile, rm } from "node:fs/promises";
import path from "node:path";
import {
  generateApp,
  generateStylesheet,
  globalsCss,
  inferLayoutRules,
  newCounters,
  resolveDependencyVersions,
  truthCheckHtml,
  verifyLayoutRules,
  type RecoveredLayoutRule,
  type ReconstructionPlan,
  type RuntimeElementNode,
  type RuntimePage,
} from "../src/reconstruction/index.js";
import { ReconstructionManifestSchema } from "../src/reconstruction/types.js";
import { applyOwnership } from "../src/reconstruction/generate-app.js";
import {
  OWNERSHIP_RENDER_BUDGET_CEILING,
  OWNERSHIP_RENDER_BUDGET_PER_PASS,
  OWNERSHIP_RENDERS_PER_GROUP_WIDTH,
  ownershipRenderBudgetForPass,
  confirmOwnedForm,
  judgeOwnedGroupAtWidth,
  measureOwnedJointOverlay,
  verifyOwnedPlanGroups,
} from "../src/reconstruction/layout-truth-check.js";
import type { OwnedPlanOffer } from "../src/reconstruction/layout-inference.js";
import {
  OWNERSHIP_MARKER_CLASSES,
  type GenerateStylesheetInput,
} from "../src/reconstruction/style-generator.js";

let passed = 0;
let total = 0;
function check(name: string, ok: boolean | undefined, detail = ""): void {
  total++;
  if (ok) {
    passed++;
    console.log(`  PASS  ${name}`);
  } else {
    console.log(`  FAIL  ${name}${detail ? ` — ${detail}` : ""}`);
  }
}
function section(title: string): void {
  console.log("");
  console.log(title);
}

const TMP_ROOT = path.join(process.cwd(), "tmp", "wrp0", "reci2", "smoke");
const PROBE_WIDTHS = [390, 768, 1024, 1440, 1920];
const TRUTH = 1440;
/** The fixture site's served breakpoint: an observation INPUT, never a constant in logic. */
const SITE_BREAKPOINT = 900;
const PAGE_ID = "p000001";

type Props = Record<string, string>;
interface AuthoredRecord {
  property: string;
  value: string;
  selector: string;
  media?: string;
  ruleOrder?: number;
  specificity?: [number, number, number];
  sheetIndex?: number;
  origin?: "cssom";
}
interface FixtureNode {
  id: string;
  tag: string;
  parent?: string;
  token: string;
  /** Probe widths, index-aligned to PROBE_WIDTHS. */
  w: number[];
  x?: number[];
  authored?: AuthoredRecord[];
  inline?: { decls: { property: string; value: string }[]; raw: string };
  inlineProvenance?: {
    correspondence: "matched";
    byProperty: Record<string, { class: string; initialValue?: string; runtimeValue: string; variesAcrossWidths: boolean }>;
    widthEvidence?: "probe" | "absent";
  };
  extraClasses?: string[];
}

const V = (vw: readonly number[], f: (width: number) => number): number[] =>
  vw.map((width) => Math.round(f(width) * 100) / 100);

function rec(
  selector: string,
  property: string,
  value: string,
  ruleOrder: number | undefined,
  media?: string,
): AuthoredRecord {
  return {
    property,
    value,
    selector,
    ...(media !== undefined ? { media } : {}),
    ...(ruleOrder !== undefined ? { ruleOrder, specificity: [0, 1, 0] as [number, number, number], sheetIndex: 0 } : {}),
    origin: "cssom",
  };
}

/** A SiteSpec page (inference input) + the runtime page (generation input) from one list. */
function buildFixture(
  nodes: readonly FixtureNode[],
  tokens: Record<string, Props>,
  evidence: { initialDocument: boolean },
): { specPage: Parameters<typeof inferLayoutRules>[0]["pages"][number]; runtime: RuntimePage } {
  const children = new Map<string, string[]>();
  for (const node of nodes) {
    if (node.parent === undefined) continue;
    const list = children.get(node.parent) ?? [];
    list.push(node.id);
    children.set(node.parent, list);
  }
  const truthIndex = PROBE_WIDTHS.indexOf(TRUTH);
  const specNodes = nodes.map((node) => {
    const x = node.x ?? PROBE_WIDTHS.map(() => 0);
    return {
      nodeId: node.id,
      type: "element" as const,
      sourceElementId: `e-${node.id}`,
      ...(node.parent !== undefined ? { parentNodeId: node.parent } : {}),
      childNodeIds: children.get(node.id) ?? [],
      tagName: node.tag,
      attributes: {},
      localVisible: true,
      effectiveVisible: true,
      boundingBox: {
        x: x[truthIndex]!,
        y: 0,
        width: node.w[truthIndex]!,
        height: 10,
        top: 0,
        right: x[truthIndex]! + node.w[truthIndex]!,
        bottom: 10,
        left: x[truthIndex]!,
      },
      probe: { x: [...x], w: [...node.w], v: PROBE_WIDTHS.map(() => 1 as const) },
      styleTokenId: node.token,
      assetRefs: [],
      relations: [],
      limitations: [],
      ...(node.authored !== undefined ? { authoredLayout: node.authored } : {}),
      ...(node.inline !== undefined ? { inlineStyle: node.inline } : {}),
      ...(node.inlineProvenance !== undefined ? { inlineStyleProvenance: node.inlineProvenance } : {}),
    };
  });
  const declarationsExamined = nodes.reduce((sum, node) => sum + (node.authored?.length ?? 0), 0);
  const specPage = {
    pageId: PAGE_ID,
    layoutProbe: { widths: [...PROBE_WIDTHS], aligned: true, elementCount: specNodes.length, truncated: false },
    viewports: {
      desktop: {
        nodes: specNodes,
        authoredBreakpoints: {
          entries: [],
          boundaries: [],
          rootFontSizePx: 16,
          declarationsExamined,
          distinctConditions: 0,
          distinctRawConditions: 0,
          mediaScopedDeclarations: 0,
          foldedDeclarations: 0,
          unconditionalDeclarations: declarationsExamined,
          containerScopedDeclarations: 0,
          supportsScopedDeclarations: 0,
          layerScopedDeclarations: 0,
          containerGatedSkippedDeclarations: 0,
          fetchedOriginDeclarations: 0,
          truncatedNodeCount: 0,
          widthDeclarations: 0,
          widthIrrelevantDeclarations: 0,
          unsupportedDeclarations: 0,
          unparsedDeclarations: 0,
          disjunctionDeclarations: 0,
          deviceWidthDeclarations: 0,
          nonScreenSkippedDeclarations: 0,
          emptyIntervalSkippedDeclarations: 0,
          unparsedConditions: [],
          unsupportedConditions: [],
        },
        ...(evidence.initialDocument ? { initialDocument: { status: "captured", elementCount: specNodes.length } } : {}),
      },
      mobile: { nodes: [] },
    },
  } as unknown as Parameters<typeof inferLayoutRules>[0]["pages"][number];

  const byId = new Map(nodes.map((node) => [node.id, node]));
  const toRuntime = (node: FixtureNode): RuntimeElementNode => ({
    k: "e",
    n: node.id,
    t: node.tag === "html" || node.tag === "body" ? "div" : node.tag,
    p: {
      "data-wr-node": node.id,
      className: [`wr-${node.token}`, ...(node.extraClasses ?? [])].join(" "),
    },
    c: (children.get(node.id) ?? []).map((id) => toRuntime(byId.get(id)!)),
  });
  const root = nodes.find((node) => node.parent === undefined)!;
  const runtime: RuntimePage = {
    pageId: PAGE_ID,
    desktop: { id: "desktop", width: TRUTH, doc: toRuntime(root) },
    mobile: { id: "mobile", width: 390, doc: { k: "e", n: "m-root", t: "div", p: { "data-wr-node": "m-root" }, c: [] } },
  };
  void tokens;
  return { specPage, runtime };
}

// ---------------------------------------------------------------------------
// The fixture page
// ---------------------------------------------------------------------------

const LTR = { direction: "ltr" };
const TOKENS: Record<string, Props> = {
  "st-root": { display: "block", ...LTR },
  // 85% column (shared by the runtime-responsive twin, which must stay frozen).
  "st-col": { display: "block", width: "1224px", height: "10px", "margin-left": "0px", "margin-right": "0px", ...LTR },
  // max-width shell centered by auto margins.
  "st-shell": { display: "block", width: "1440px", height: "10px", "max-width": "1920px", "margin-left": "0px", "margin-right": "0px", ...LTR },
  // A wrapping flex row and its 1/3 items (1/4 from a wider authored band).
  "st-row": { display: "flex", "flex-wrap": "wrap", width: "1440px", "margin-left": "0px", "margin-right": "0px", ...LTR },
  "st-item": {
    display: "block",
    width: "480px",
    height: "10px",
    "flex-basis": "33.3333%",
    "max-width": "33.3333%",
    "flex-grow": "0",
    "flex-shrink": "1",
    "margin-left": "0px",
    "margin-right": "0px",
    ...LTR,
  },
  // A flex container whose single item roots a `width: 100%` subtree.
  "st-flex": { display: "flex", width: "1440px", "margin-left": "0px", "margin-right": "0px", ...LTR },
  "st-flexroot": { display: "block", width: "1440px", height: "10px", "flex-shrink": "1", "margin-left": "0px", "margin-right": "0px", ...LTR },
  // An image sized by an initial-static inline style.
  "st-img": { display: "block", width: "1440px", height: "10px", "min-width": "0px", "max-width": "none", "margin-left": "0px", "margin-right": "0px", ...LTR },
  // A JS-overridden box: the sheet says 50%, the browser computed 300px.
  "st-js": { display: "block", width: "300px", height: "10px", "margin-left": "0px", "margin-right": "0px", ...LTR },
  // Right at the truth width, wrong below it.
  "st-fix": { display: "block", width: "1224px", height: "10px", "margin-left": "0px", "margin-right": "0px", ...LTR },
};

function fixtureNodes(): FixtureNode[] {
  const vw = PROBE_WIDTHS;
  const itemAuthored = (): AuthoredRecord[] => [
    rec(".item", "flex-basis", "100%", 1),
    rec(".item", "max-width", "100%", 1),
    rec(".item-md", "flex-basis", "33.3333%", 2, "(min-width: 900px)"),
    rec(".item-md", "max-width", "33.3333%", 2, "(min-width: 900px)"),
    rec(".item-xl", "flex-basis", "25%", 3, "(min-width: 1536px)"),
    rec(".item-xl", "max-width", "25%", 3, "(min-width: 1536px)"),
  ];
  const itemFraction = (width: number): number => (width >= 1536 ? 0.25 : width >= 900 ? 1 / 3 : 1);
  const itemX = (index: number) => (width: number): number => {
    const f = itemFraction(width);
    const perRow = Math.round(1 / f);
    return (index % perRow) * f * width;
  };
  return [
    { id: "n-html", tag: "html", token: "st-root", w: [...vw] },
    { id: "n-body", tag: "body", parent: "n-html", token: "st-root", w: [...vw] },
    {
      id: "col",
      tag: "div",
      parent: "n-body",
      token: "st-col",
      w: V(vw, (width) => width * 0.85),
      authored: [rec(".col", "width", "85%", 1)],
      extraClasses: ["wr-sf"],
    },
    {
      id: "shell",
      tag: "div",
      parent: "n-body",
      token: "st-shell",
      w: V(vw, (width) => Math.min(width, 1920)),
      authored: [rec(".shell", "max-width", "1920px", 1), rec(".shell", "margin", "0 auto", 1)],
    },
    { id: "row", tag: "div", parent: "n-body", token: "st-row", w: [...vw], authored: [rec(".row", "flex-wrap", "wrap", 1)] },
    ...[0, 1, 2, 3].map(
      (index): FixtureNode => ({
        id: `item${index}`,
        tag: "div",
        parent: "row",
        token: "st-item",
        w: V(vw, (width) => itemFraction(width) * width),
        x: V(vw, itemX(index)),
        authored: itemAuthored(),
      }),
    ),
    { id: "flex", tag: "div", parent: "n-body", token: "st-flex", w: [...vw], authored: [rec(".flex", "display", "flex", 1)] },
    {
      id: "flexroot",
      tag: "div",
      parent: "flex",
      token: "st-flexroot",
      w: [...vw],
      authored: [rec(".root", "width", "100%", 1)],
    },
    {
      id: "img",
      tag: "img",
      parent: "n-body",
      token: "st-img",
      w: [...vw],
      inline: { decls: [{ property: "width", value: "100%" }], raw: "width: 100%" },
      inlineProvenance: {
        correspondence: "matched",
        byProperty: { width: { class: "initial-static", initialValue: "100%", runtimeValue: "100%", variesAcrossWidths: false } },
        widthEvidence: "probe",
      },
    },
    {
      id: "rr",
      tag: "div",
      parent: "n-body",
      token: "st-col",
      w: V(vw, (width) => width * 0.85),
      inline: { decls: [{ property: "width", value: "1224px" }], raw: "width: 1224px" },
      inlineProvenance: {
        correspondence: "matched",
        byProperty: { width: { class: "runtime-responsive", runtimeValue: "1224px", variesAcrossWidths: true } },
        widthEvidence: "probe",
      },
    },
    {
      id: "js",
      tag: "div",
      parent: "n-body",
      token: "st-js",
      w: vw.map(() => 300),
      authored: [rec(".half", "width", "50%", 1)],
    },
    {
      id: "fix",
      tag: "div",
      parent: "n-body",
      token: "st-fix",
      // Source: fixed 1224px below the truth width (a rule the observer never saw),
      // 85% at and above it.
      w: vw.map((width) => (width < TRUTH ? 1224 : Math.round(width * 0.85 * 100) / 100)),
      authored: [rec(".fix", "width", "85%", 1)],
    },
  ];
}

/** Old artifact: no initial document, no cascade metadata, no inline provenance. */
function oldArtifactNodes(): FixtureNode[] {
  return fixtureNodes().map((node) => {
    const { inlineProvenance: _p, inline: _i, ...rest } = node;
    return {
      ...rest,
      ...(node.authored !== undefined
        ? { authored: node.authored.map((r) => rec(r.selector, r.property, r.value, undefined, r.media)) }
        : {}),
    };
  });
}

function styleInputFor(tokens: Record<string, Props>, nodes: readonly FixtureNode[]): GenerateStylesheetInput {
  const used = [...new Set(nodes.map((node) => node.token))].sort();
  return {
    styleCatalog: {
      schemaVersion: 1,
      tokenCount: Object.keys(tokens).length,
      sourceStyleReferenceCount: nodes.length,
      sourceLocalStyleRecordCount: nodes.length,
      dedupReductionRate: 0,
      styles: Object.keys(tokens)
        .sort()
        .map((styleTokenId) => ({ styleTokenId, properties: tokens[styleTokenId]!, usageCount: 1 })),
      frequency: {},
    } as unknown as GenerateStylesheetInput["styleCatalog"],
    usedTokenIds: used,
    documentRootTokenIds: [],
    textBoxVariantTokens: { tx: new Set(), sf: new Set(["st-col"]) },
  };
}

function planFor(
  runtime: RuntimePage,
  layout: ReturnType<typeof inferLayoutRules>,
  styleInput: GenerateStylesheetInput | undefined,
  extraRules: readonly RecoveredLayoutRule[] = [],
): ReconstructionPlan {
  const styles = generateStylesheet(styleInput ?? styleInputFor(TOKENS, fixtureNodes()));
  return {
    rootUrl: "https://fixture.test",
    breakpoint: {
      value: SITE_BREAKPOINT,
      provenance: "inferred",
      method: "observed-endpoint-midpoint",
      mobileObservedWidth: 390,
      desktopObservedWidth: TRUTH,
      convention: "mobile below, desktop at or above",
    },
    routes: { routes: [], byKey: new Map() },
    pages: [runtime],
    pageFiles: new Map([[runtime.pageId, `pages/${runtime.pageId}.json`]]),
    styles,
    ...(styleInput !== undefined ? { styleInput } : {}),
    customProperties: { css: "", blockCount: 0, declarationCount: 0, rejectedNames: 0, rejectedValues: 0, rejectedScopes: 0 },
    pseudoStyles: { css: "", ruleCount: 0, declarationCount: 0, missingTokens: [], rejectedValues: 0 },
    layout: { ...layout, rules: [...layout.rules, ...extraRules] },
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

const lookup = (id: string): Props | undefined => TOKENS[id];

/**
 * Review fix MAJOR-3 — a stylesheet coverage record that PROVES the page's
 * authored CSS was read completely (every counter the gate reads at zero).
 */
const COMPLETE_COVERAGE = {
  fallbackMissed: 0,
  importsUnresolved: 0,
  importRulesUnresolved: 0,
  ruleIndexCapHit: false,
  groupingRulesSkipped: 0,
  sheetsSkippedBySizeCap: 0,
  sheetsBodyUnavailable: 0,
};
const COVERAGE = new Map([[`${PAGE_ID}:desktop`, COMPLETE_COVERAGE]]);

/** Render a runtime page with CSS at `width`; returns x/y/w per node id. */
async function renderBoxes(
  page: RuntimePage,
  css: string,
  width: number,
  ids: readonly string[],
): Promise<Record<string, { x: number; y: number; w: number } | null>> {
  const { chromium } = await import("playwright");
  const browser = await chromium.launch();
  try {
    const context = await browser.newContext({ viewport: { width, height: 900 }, deviceScaleFactor: 1 });
    const tab = await context.newPage();
    await tab.setContent(truthCheckHtml(page, css), { waitUntil: "load" });
    return await tab.evaluate((nodeIds: string[]) => {
      const out: Record<string, { x: number; y: number; w: number } | null> = {};
      for (const id of nodeIds) {
        const element = document.querySelector(`[data-wr-node="${id}"]`);
        if (!element) {
          out[id] = null;
          continue;
        }
        const r = element.getBoundingClientRect();
        out[id] = { x: Math.round(r.x * 100) / 100, y: Math.round(r.y * 100) / 100, w: Math.round(r.width * 100) / 100 };
      }
      return out;
    }, [...ids]);
  } finally {
    await browser.close();
  }
}

const near = (a: number | undefined, b: number, tol = 0.6): boolean => a !== undefined && Math.abs(a - b) <= tol;

function classesOf(page: RuntimePage, nodeId: string): string[] {
  const stack: RuntimeElementNode[] = [page.desktop.doc];
  while (stack.length > 0) {
    const node = stack.pop()!;
    if (node.n === nodeId) return String(node.p?.["className"] ?? "").split(/\s+/).filter(Boolean);
    for (const child of node.c ?? []) if (child.k === "e") stack.push(child);
  }
  return [];
}

// ===========================================================================
async function main(): Promise<void> {
  await rm(TMP_ROOT, { recursive: true, force: true });
  await mkdir(TMP_ROOT, { recursive: true });
  const nodes = fixtureNodes();
  const { specPage, runtime } = buildFixture(nodes, TOKENS, { initialDocument: true });

  // =========================================================================
  section("A. inference: plan offers");
  // =========================================================================
  const inferred = inferLayoutRules({ pages: [specPage], styleLookup: lookup, breakpoint: SITE_BREAKPOINT, stylesheetCoverageByPage: COVERAGE });
  const offers = inferred.ownedPlans ?? [];
  const offerFor = (id: string): OwnedPlanOffer | undefined => offers.find((offer) => offer.nodeId === id);
  const ownedRulesFor = (id: string): RecoveredLayoutRule[] =>
    inferred.rules.filter((rule) => rule.kind === "responsive-owned" && rule.nodeId === id);
  const own = inferred.counters.responsiveOwnership;
  check("ownership counters exist on the inference result", own !== undefined);

  const colRules = ownedRulesFor("col");
  check("85% column offered as one group", offerFor("col") !== undefined && offerFor("col")!.planGroup === `${PAGE_ID}:desktop:col`);
  check("85% column: one piece with no @media (whole served interval)", colRules.length === 1 && colRules[0]!.media === undefined, JSON.stringify(colRules.map((r) => r.media)));
  check("85% column: owned width:85%", colRules[0]?.declarations["width"] === "85%");
  check(
    "every owned rule restates all six width-family properties",
    inferred.rules
      .filter((rule) => rule.kind === "responsive-owned")
      .every((rule) =>
        ["width", "min-width", "max-width", "margin-left", "margin-right", "flex-basis"].every(
          (property) => rule.declarations[property] !== undefined,
        ) && Object.keys(rule.declarations).length === 6,
      ),
  );
  check(
    "85% column: unauthored properties restate their initial values",
    colRules[0]?.declarations["min-width"] === "auto" &&
      colRules[0]?.declarations["max-width"] === "none" &&
      colRules[0]?.declarations["flex-basis"] === "auto" &&
      /^0(px)?$/.test(colRules[0]?.declarations["margin-left"] ?? ""),
    JSON.stringify(colRules[0]?.declarations),
  );
  check(
    "owned rules carry servedInterval [900,∞), samples, planGroup, evidence",
    colRules[0]?.servedInterval?.min === SITE_BREAKPOINT &&
      colRules[0]?.servedInterval?.max === Number.POSITIVE_INFINITY &&
      (colRules[0]?.samples ?? []).map((s) => s.width).join(",") === "1024,1440,1920" &&
      colRules[0]?.planGroup === `${PAGE_ID}:desktop:col` &&
      (colRules[0]?.evidence ?? []).some((line) => line.includes("width: 85% (authored-sheet)")),
    JSON.stringify(colRules[0]?.evidence),
  );
  check("offer provenance histogram counts authored-sheet width", offerFor("col")?.provenanceByProperty["width"]?.["authored-sheet"] === 1);

  const shellRules = ownedRulesFor("shell");
  check(
    "max-width shell: owned max-width:1920px + margin auto/auto + width auto",
    shellRules.length === 1 &&
      shellRules[0]!.declarations["max-width"] === "1920px" &&
      shellRules[0]!.declarations["margin-left"] === "auto" &&
      shellRules[0]!.declarations["margin-right"] === "auto" &&
      shellRules[0]!.declarations["width"] === "auto",
    JSON.stringify(shellRules.map((r) => r.declarations)),
  );

  const itemRules = ownedRulesFor("item0");
  check(
    "media flex-basis/max-width item: piecewise, two pieces inside [900,∞)",
    itemRules.length === 2,
    JSON.stringify(itemRules.map((r) => [r.media, r.declarations["flex-basis"]])),
  );
  check(
    "…lower piece (max-width: 1535.98px) = 33.3333%, no min edge (served edge omitted)",
    itemRules[0]?.media === "(max-width: 1535.98px)" &&
      itemRules[0]?.declarations["flex-basis"] === "33.3333%" &&
      itemRules[0]?.declarations["max-width"] === "33.3333%",
    JSON.stringify(itemRules[0]),
  );
  check(
    "…upper piece (min-width: 1536px) = 25%",
    itemRules[1]?.media === "(min-width: 1536px)" && itemRules[1]?.declarations["flex-basis"] === "25%",
    JSON.stringify(itemRules[1]),
  );
  check("…pieceInterval recorded per piece", itemRules[0]?.pieceInterval?.max === 1536 && itemRules[1]?.pieceInterval?.min === 1536);
  check("…item source condition kept as evidence text", (itemRules[0]?.evidence ?? []).some((line) => line.includes("@media (min-width: 900px)")));
  check("…the offer records its child samples list (no children here)", offerFor("item0")?.children.length === 0);
  check("row container offered with its four item children as co-damage witnesses", offerFor("row")?.children.length === 4);

  check("flex-item root width:100% offered", ownedRulesFor("flexroot")[0]?.declarations["width"] === "100%");
  check("inline initial-static width:100% image offered", ownedRulesFor("img")[0]?.declarations["width"] === "100%");
  check("image width provenance is authored-inline", offerFor("img")?.provenanceByProperty["width"]?.["authored-inline"] === 1);
  check("runtime-responsive inline width → not offered", offerFor("rr") === undefined && ownedRulesFor("rr").length === 0);
  check(
    "…counted as ambiguous with the inline-runtime-responsive reason",
    (own?.notOfferedByReason["ambiguous"] ?? 0) >= 1 &&
      Object.keys(own?.ambiguousByReason ?? {}).some((reason) => reason.includes("inline-runtime-responsive")),
    JSON.stringify(own?.ambiguousByReason),
  );
  check("JS override (sheet 50%, computed 300px) → not offered", offerFor("js") === undefined);
  check(
    "…counted contradicted-by-truth on width",
    (own?.notOfferedByReason["contradicted-by-truth"] ?? 0) === 1 && own?.contradictedByProperty["width"] === 1,
    JSON.stringify(own),
  );
  check("the 1440-correct/1024-wrong node IS offered (only a render can refuse it)", offerFor("fix") !== undefined);
  check("html/body never considered as plan roots", offerFor("n-html") === undefined && offerFor("n-body") === undefined);
  check(
    "plansOffered / rulesEmitted counters match the offers",
    own?.plansOffered === offers.length &&
      own?.rulesEmitted === inferred.rules.filter((rule) => rule.kind === "responsive-owned").length,
  );
  /*
   * CHANGED SEMANTICS (REC-I2 regression fix, continuous QA 2026-09-15: apartmentary
   * mobile collapsed to frozen 390px). The brief had the authored inline-size
   * fallback skip plan-offered nodes; a REJECTED offer then left the node with no
   * rule at all. Contract §C2.4/§C2.5: the tier-3 fallback must survive a
   * rejected plan, so the fallback now runs for offered nodes too and ownership
   * drops it only for ACCEPTED owners. Two checks replace the one.
   */
  check(
    "authored inline-size fallback still runs for plan-offered nodes (never refused as plan-offered)",
    (inferred.counters.authoredIntent?.refusalsByReason["plan-offered"] ?? 0) === 0 &&
      inferred.rules.some((rule) => rule.kind === "authored-inline-size" && rule.nodeId === "item0") &&
      offerFor("item0") !== undefined,
    JSON.stringify(inferred.rules.filter((r) => r.kind !== "responsive-owned").map((r) => `${r.nodeId}:${r.kind}:${JSON.stringify(r.declarations)}:${offerFor(r.nodeId)?"O":"-"}`)),
  );
  check(
    "an ownership offer does not count as already-recovered for the fallback",
    inferred.rules.some((rule) => rule.kind === "authored-inline-size" && rule.nodeId === "fix" && rule.declarations["width"] === "85%") &&
      offerFor("fix") !== undefined,
  );
  check(
    "the measured funnel still runs for offered nodes (a non-owned rule exists for one)",
    inferred.rules.some((rule) => rule.kind !== "responsive-owned" && offerFor(rule.nodeId) !== undefined),
    JSON.stringify(inferred.rules.filter((r) => r.kind !== "responsive-owned").map((r) => `${r.nodeId}:${r.kind}`)),
  );
  check(
    "no owned rule @media spells an @layer or anonymous layer name",
    inferred.rules.every((rule) => !/layer|anonymous/.test(rule.media ?? "")),
  );

  // no-interval-evidence: a node whose only visible in-interval sample is the truth width.
  {
    const lonely = fixtureNodes().map((node) =>
      node.id === "col" ? { ...node, w: node.w } : node,
    );
    const { specPage: lonelyPage } = buildFixture(lonely, TOKENS, { initialDocument: true });
    const desktop = (lonelyPage as unknown as { viewports: { desktop: { nodes: { nodeId: string; probe: { v: number[] } }[] } } }).viewports.desktop;
    const colNode = desktop.nodes.find((node) => node.nodeId === "col")!;
    colNode.probe.v = PROBE_WIDTHS.map((width) => (width === TRUTH ? 1 : 0));
    const lonelyInferred = inferLayoutRules({ pages: [lonelyPage], styleLookup: lookup, breakpoint: SITE_BREAKPOINT, stylesheetCoverageByPage: COVERAGE });
    check(
      "a node visible only at the truth width inside the interval → no-interval-evidence",
      !(lonelyInferred.ownedPlans ?? []).some((offer) => offer.nodeId === "col") &&
        (lonelyInferred.counters.responsiveOwnership?.notOfferedByReason["no-interval-evidence"] ?? 0) === 1,
      JSON.stringify(lonelyInferred.counters.responsiveOwnership?.notOfferedByReason),
    );
  }
  // widthEvidence absent → inline width ambiguous.
  {
    const absent = fixtureNodes().map((node) =>
      node.id === "img" ? { ...node, inlineProvenance: { ...node.inlineProvenance!, widthEvidence: "absent" as const } } : node,
    );
    const { specPage: absentPage } = buildFixture(absent, TOKENS, { initialDocument: true });
    const r = inferLayoutRules({ pages: [absentPage], styleLookup: lookup, breakpoint: SITE_BREAKPOINT, stylesheetCoverageByPage: COVERAGE });
    check(
      "inline widthEvidence:absent → the image is not offered (ambiguous, never guessed)",
      !(r.ownedPlans ?? []).some((offer) => offer.nodeId === "img") &&
        Object.keys(r.counters.responsiveOwnership?.ambiguousByReason ?? {}).some((k) => k.includes("inline-width-evidence-absent")),
      JSON.stringify(r.counters.responsiveOwnership?.ambiguousByReason),
    );
  }
  // Served breakpoint is read from breakpointByPageId.
  {
    const r = inferLayoutRules({
      pages: [specPage],
      styleLookup: lookup,
      breakpoint: 2400,
      breakpointByPageId: new Map([[PAGE_ID, SITE_BREAKPOINT]]),
      stylesheetCoverageByPage: COVERAGE,
    });
    check(
      "served interval comes from breakpointByPageId when present",
      (r.ownedPlans ?? []).some((offer) => offer.nodeId === "col" && offer.servedInterval.min === SITE_BREAKPOINT),
    );
  }

  // =========================================================================
  section("B. old artifact: no offers, byte-identical generation");
  // =========================================================================
  const old = buildFixture(oldArtifactNodes(), TOKENS, { initialDocument: false });
  const oldInferred = inferLayoutRules({ pages: [old.specPage], styleLookup: lookup, breakpoint: SITE_BREAKPOINT });
  check("old artifact: zero responsive-owned rules", !oldInferred.rules.some((rule) => rule.kind === "responsive-owned"));
  check("old artifact: ownedPlans empty", (oldInferred.ownedPlans ?? []).length === 0);
  check(
    "old artifact: every plan root not considered for observer-evidence-absent",
    oldInferred.counters.responsiveOwnership?.nodesConsidered === 0 &&
      (oldInferred.counters.responsiveOwnership?.notConsideredByReason["observer-evidence-absent"] ?? 0) === nodes.length - 2,
    JSON.stringify(oldInferred.counters.responsiveOwnership),
  );
  check(
    "old artifact: authored fallback never refuses for plan-offered",
    (oldInferred.counters.authoredIntent?.refusalsByReason["plan-offered"] ?? 0) === 0,
  );
  {
    const input = styleInputFor(TOKENS, nodes);
    check(
      "generateStylesheet with an empty owned set is byte-identical to without",
      generateStylesheet({ ...input, ownedWidthFamilyTokens: new Set() }).css === generateStylesheet(input).css,
    );
  }
  const versions = await resolveDependencyVersions(process.cwd());
  const oldDir = path.join(TMP_ROOT, "old");
  const oldPlan = planFor(old.runtime, oldInferred, styleInputFor(TOKENS, oldArtifactNodes()));
  const oldApp = await generateApp(oldPlan, {
    outputDir: oldDir,
    sourceSchemaVersion: 1,
    sourceSiteSpecVersion: 1,
    sourceCompilerVersion: 1,
    versions,
    strictOwnership: true,
  });
  {
    const cssFile = oldApp.files.find((f) => f.path.endsWith(".css") && f.path.includes("public"))!;
    const written = await readFile(path.join(oldDir, cssFile.path), "utf8");
    const globals = globalsCss(oldPlan.breakpoint);
    const base = `/* Generated by web-recon from the SiteSpec global style catalog. */\n${oldPlan.styles.css}\n`;
    const phaseA = await verifyLayoutRules({ rules: oldPlan.layout.rules, pages: oldPlan.pages, css: `${globals}\n${base}`, residualAudit: oldPlan.layout.residualAudit });
    check(
      "old artifact: stylesheet === base + phase-A recovered tier (pre-ownership formula)",
      written === base + (phaseA.css === "" ? "" : `${phaseA.css}\n`),
    );
    const pageFile = oldApp.files.find((f) => f.path.endsWith(`${PAGE_ID}.json`));
    const pageJson = pageFile ? await readFile(path.join(oldDir, pageFile.path), "utf8") : "";
    check("old artifact: runtime page JSON byte-identical to the plan's page", pageJson === JSON.stringify(old.runtime) + "\n");
    const o = oldApp.manifest.layout?.ownership;
    check(
      "old artifact: manifest ownership reports nothing offered, 0 css delta, confirm not-run",
      o?.nodePlansOffered === 0 && o?.nodesOwned === 0 && o?.cssBytesDelta === 0 && o?.ownedFormConfirm === "not-run",
      JSON.stringify(o),
    );
    check("old artifact: no marker classes or split rules anywhere", !written.includes("wr-ow-") && !pageJson.includes("wr-ow-"));
  }

  // =========================================================================
  section("C. generateApp: two-phase verification + ownership");
  // =========================================================================
  const styleInput = styleInputFor(TOKENS, nodes);
  const plan = planFor(runtime, inferred, styleInput);
  const outDir = path.join(TMP_ROOT, "owned");
  const logs: string[] = [];
  const app = await generateApp(plan, {
    outputDir: outDir,
    sourceSchemaVersion: 1,
    sourceSiteSpecVersion: 1,
    sourceCompilerVersion: 1,
    versions,
    strictOwnership: true,
    onLog: (message) => logs.push(message),
  });
  const ownership = app.ownership;
  const accepted = new Set(ownership.acceptedGroups);
  const rejectionOf = (id: string) => ownership.rejections.find((r) => r.nodeId === id);
  const g = (id: string): string => `${PAGE_ID}:desktop:${id}`;
  check("85% column accepted", accepted.has(g("col")), JSON.stringify(rejectionOf("col")));
  check("max-width shell accepted", accepted.has(g("shell")), JSON.stringify(rejectionOf("shell")));
  check("row container accepted", accepted.has(g("row")), JSON.stringify(rejectionOf("row")));
  check("all four media items accepted", [0, 1, 2, 3].every((i) => accepted.has(g(`item${i}`))), JSON.stringify(ownership.rejections));
  check("flex-item root accepted", accepted.has(g("flexroot")), JSON.stringify(rejectionOf("flexroot")));
  check("inline image accepted", accepted.has(g("img")), JSON.stringify(rejectionOf("img")));
  const fixRejection = rejectionOf("fix");
  check("correct at 1440 but wrong at 1024 → rejected", !accepted.has(g("fix")) && fixRejection !== undefined);
  check(
    "…with reason interval-sample at 1024",
    fixRejection?.reason === "interval-sample" && fixRejection.width === 1024,
    JSON.stringify(fixRejection),
  );
  check(
    "…err over tolerance and over baseline + 0.5",
    fixRejection !== undefined &&
      (fixRejection.errWith ?? 0) > Math.max(4, 0.005 * 1024) &&
      (fixRejection.errWith ?? 0) > (fixRejection.errBaseline ?? 0) + 0.5,
  );
  const mf = app.manifest.layout?.ownership;
  check("manifest ownership block present and schema-valid", mf !== undefined && ReconstructionManifestSchema.safeParse(app.manifest).success);
  check(
    "manifest: nodePlansOffered / nodesOwned / rejected consistent",
    mf?.nodePlansOffered === offers.length &&
      mf?.nodesOwned === accepted.size &&
      mf?.nodePlansRejected === ownership.rejections.length &&
      mf.nodesOwned + mf.nodePlansRejected === mf.nodePlansOffered,
    JSON.stringify(mf),
  );
  check("manifest: rejection histogram names interval-sample", (mf?.rejectedBy["interval-sample"] ?? 0) >= 1, JSON.stringify(mf?.rejectedBy));
  check("manifest: token count delta is 0", mf?.tokenCountDelta === 0);
  check("manifest: tokensSplit counts the owner tokens", (mf?.tokensSplit ?? 0) >= 6, String(mf?.tokensSplit));
  check("manifest: splitRulesEmitted > 0 and cssBytesDelta ≠ 0", (mf?.splitRulesEmitted ?? 0) > 0 && mf?.cssBytesDelta !== 0);
  check(
    "manifest: provenance histogram covers all six properties",
    ["width", "min-width", "max-width", "margin-left", "margin-right", "flex-basis"].every(
      (property) => mf?.provenanceByProperty[property] !== undefined,
    ),
    JSON.stringify(mf?.provenanceByProperty),
  );
  check("manifest: owned-form confirm ran and found 0 mismatches", mf?.ownedFormConfirm === "confirmed" && (mf?.ownedFormChecked ?? 0) > 0 && mf?.ownedFormMismatches === 0, JSON.stringify(mf));
  check("manifest: verification rendered interval widths", (mf?.verificationWidthsRendered ?? 0) >= 3 && (mf?.verificationRounds ?? 0) >= 1);
  check("manifest: grid-track conflicts reported (none here)", mf?.ownersWithGridTrackRule === 0);
  check("manifest: measured width-family declarations dropped from owners", (mf?.measuredDeclarationsDropped ?? 0) > 0, String(mf?.measuredDeclarationsDropped));
  check("manifest: wr-sf removed from the owner", mf?.shrinkToFitClassesRemoved === 1);
  check("manifest: rulesShipped ≤ rulesOffered", (mf?.rulesShipped ?? 0) > 0 && (mf?.rulesShipped ?? 0) <= (mf?.rulesOffered ?? 0));

  // --- recovered tier ------------------------------------------------------
  const finalRules = app.layoutVerification.rules;
  check(
    "accepted responsive-owned rules ship in the recovered tier",
    finalRules.some((rule) => rule.kind === "responsive-owned" && rule.nodeId === "col") &&
      app.layoutVerification.css.includes('[data-wr-node="col"] {\n  flex-basis: auto;'),
  );
  check("rejected group rules do not ship", !finalRules.some((rule) => rule.kind === "responsive-owned" && rule.nodeId === "fix"));
  check(
    "owner nodes keep no measured width-family declaration in any non-owned rule",
    finalRules
      .filter((rule) => rule.kind !== "responsive-owned" && accepted.has(g(rule.nodeId)))
      .every((rule) => !["width", "min-width", "max-width", "margin-left", "margin-right", "flex-basis", "margin-inline", "inline-size"].some((p) => rule.declarations[p] !== undefined)),
  );
  check(
    "manifest recoveredRules / rulesShipped count the FINAL tier including responsive-owned",
    app.manifest.layout?.recoveredRules === finalRules.length &&
      finalRules.filter((rule) => rule.kind === "responsive-owned").length === mf?.rulesShipped,
    `${app.manifest.layout?.recoveredRules} / ${finalRules.length}`,
  );

  // --- runtime pages ------------------------------------------------------
  const pageFile = app.files.find((f) => f.path.endsWith(`${PAGE_ID}.json`))!;
  const ownedPage = JSON.parse(await readFile(path.join(outDir, pageFile.path), "utf8")) as RuntimePage;
  check("marker classes present on owners", OWNERSHIP_MARKER_CLASSES.every((cls) => classesOf(ownedPage, "col").includes(cls)), classesOf(ownedPage, "col").join(" "));
  check("marker classes are exactly wr-ow-w/mnw/mxw/ml/mr/fb", OWNERSHIP_MARKER_CLASSES.join(" ") === "wr-ow-w wr-ow-mnw wr-ow-mxw wr-ow-ml wr-ow-mr wr-ow-fb");
  check("no wr-sf on owners", !classesOf(ownedPage, "col").includes("wr-sf"));
  check("owner keeps its token class", classesOf(ownedPage, "col").includes("wr-st-col"));
  check("non-owners carry no marker class", !classesOf(ownedPage, "rr").some((cls) => cls.startsWith("wr-ow-")) && !classesOf(ownedPage, "fix").some((cls) => cls.startsWith("wr-ow-")));
  check("the plan's own runtime page is not mutated", !classesOf(runtime, "col").some((cls) => cls.startsWith("wr-ow-")) && classesOf(runtime, "col").includes("wr-sf"));

  // --- exact tier split ---------------------------------------------------
  const stylesFile = app.files.find((f) => f.path.endsWith(".css") && f.path.includes("public"))!;
  const stylesheet = await readFile(path.join(outDir, stylesFile.path), "utf8");
  const ownedStyles = generateStylesheet({ ...styleInput, ownedWidthFamilyTokens: new Set(["st-col", "st-shell", "st-row", "st-item", "st-flex", "st-flexroot", "st-img"]) });
  check("the written stylesheet uses the split exact tier", stylesheet.includes(ownedStyles.css));
  check(
    "split rule `.wr-st-col:where(:not(.wr-ow-w)){width:1224px}` is emitted",
    stylesheet.includes(".wr-st-col:where(:not(.wr-ow-w)){width:1224px}"),
  );
  {
    const tokenRule = /\.wr-st-col\{[^}]*\}/.exec(stylesheet);
    const tokenAt = tokenRule?.index ?? -1;
    const splitAt = stylesheet.indexOf(".wr-st-col:where(:not(.wr-ow-w))");
    const mlAt = stylesheet.indexOf(".wr-st-col:where(:not(.wr-ow-ml))");
    check("owner token rule no longer carries width", tokenRule !== null && !/[{;]width:/.test(tokenRule[0]));
    check("split rules immediately follow the token rule", tokenAt >= 0 && splitAt > tokenAt && stylesheet.slice(tokenAt + tokenRule![0].length, splitAt).trim() === "" && mlAt > splitAt);
    check(
      "split rules come before the shrink-to-fit variant of the same token",
      stylesheet.indexOf(".wr-st-col.wr-sf") === -1 || stylesheet.indexOf(".wr-st-col.wr-sf") > mlAt,
    );
  }
  {
    const baseCss = generateStylesheet(styleInput).css.split("\n");
    const splitCss = ownedStyles.css.split("\n");
    const nonOwner = (line: string): boolean => /^\.wr-st-(js|fix|root)[{.]/.test(line);
    check(
      "non-owner token rules are byte-identical after the split",
      baseCss.filter(nonOwner).join("\n") === splitCss.filter(nonOwner).join("\n") && baseCss.filter(nonOwner).length >= 3,
      `${baseCss.filter(nonOwner).length}`,
    );
    const ownedRuleCount = splitCss.filter((line) => line.includes(":where(:not(.wr-ow-")).length;
    check("split-rule count equals manifest splitRulesEmitted", ownedRuleCount === mf?.splitRulesEmitted, `${ownedRuleCount} vs ${mf?.splitRulesEmitted}`);
  }

  // --- rendered owned form -----------------------------------------------
  const globals = globalsCss(plan.breakpoint);
  const ownedCss = `${globals}\n${stylesheet}`;
  const at1024 = await renderBoxes(ownedPage, ownedCss, 1024, ["col", "item0", "item1", "item2", "item3", "flexroot", "img", "rr", "fix", "shell"]);
  const at1920 = await renderBoxes(ownedPage, ownedCss, 1920, ["col", "item0", "item3", "flexroot"]);
  const at2560 = await renderBoxes(ownedPage, ownedCss, 2560, ["shell"]);
  check("85% column verified at 1024 (870.4px)", near(at1024["col"]?.w, 870.4), JSON.stringify(at1024["col"]));
  check("85% column verified at 1920 (1632px)", near(at1920["col"]?.w, 1632), JSON.stringify(at1920["col"]));
  check("shell centered above 1920 (x=320, w=1920 at 2560)", near(at2560["shell"]?.x, 320) && near(at2560["shell"]?.w, 1920), JSON.stringify(at2560["shell"]));
  check("shell fills the viewport at 1024", near(at1024["shell"]?.w, 1024) && near(at1024["shell"]?.x, 0));
  check(
    "3 columns at 1024: items 0-2 share a row, item 3 wraps",
    near(at1024["item0"]?.y, at1024["item1"]?.y ?? -1) &&
      near(at1024["item1"]?.y, at1024["item2"]?.y ?? -1) &&
      (at1024["item3"]?.y ?? 0) > (at1024["item0"]?.y ?? 0) &&
      near(at1024["item1"]?.w, 341.33, 1),
    JSON.stringify([at1024["item0"], at1024["item1"], at1024["item2"], at1024["item3"]]),
  );
  check("4 columns at 1920 (upper piece)", near(at1920["item3"]?.y, at1920["item0"]?.y ?? -1) && near(at1920["item3"]?.x, 1440, 1), JSON.stringify(at1920["item3"]));
  check("flex-item root width:100% tracks the container at 1024", near(at1024["flexroot"]?.w, 1024));
  check("inline image width:100% at 1024", near(at1024["img"]?.w, 1024));
  check("rejected node keeps the frozen exact tier (1224px at 1024)", near(at1024["fix"]?.w, 1224));

  // Token semantics without the recovered tier: split rule reaches non-owners only.
  {
    const bareCss = `${globals}\n/* base */\n${ownedStyles.css}\n`;
    const bare = await renderBoxes(ownedPage, bareCss, TRUTH, ["col", "rr"]);
    check("split: non-owner wearing the owner's token keeps width 1224px", near(bare["rr"]?.w, 1224), JSON.stringify(bare["rr"]));
    check("split: owner wearing the token gets no token width (auto → 1440)", near(bare["col"]?.w, 1440), JSON.stringify(bare["col"]));
    const before = `${globals}\n.earlier{width:66px}\n${ownedStyles.css}\n.later{width:77px}\n`;
    const probePage: RuntimePage = JSON.parse(JSON.stringify(ownedPage)) as RuntimePage;
    const body = probePage.desktop.doc.c!.find((c) => c.k === "e") as RuntimeElementNode;
    body.c = [
      ...(body.c ?? []),
      { k: "e", n: "spec-earlier", t: "div", p: { "data-wr-node": "spec-earlier", className: "earlier wr-st-col" }, c: [] },
      { k: "e", n: "spec-later", t: "div", p: { "data-wr-node": "spec-later", className: "wr-st-col later" }, c: [] },
    ];
    const spec = await renderBoxes(probePage, before, TRUTH, ["spec-earlier", "spec-later"]);
    check("split rule specificity ≥ (0,1,0): beats an earlier single class", near(spec["spec-earlier"]?.w, 1224), JSON.stringify(spec["spec-earlier"]));
    check("split rule specificity ≤ (0,1,0): loses to a later single class", near(spec["spec-later"]?.w, 77), JSON.stringify(spec["spec-later"]));
  }

  // Owned form equals overlay form (independent re-measure of the confirm).
  {
    let worst = 0;
    const offersAccepted = offers.filter((offer) => accepted.has(offer.planGroup));
    const widths = [1024, TRUTH, 1920];
    for (const width of widths) {
      const boxes = await renderBoxes(ownedPage, ownedCss, width, offersAccepted.map((offer) => offer.nodeId));
      for (const offer of offersAccepted) {
        const sample = offer.samples.find((s) => s.width === width);
        if (sample === undefined) continue;
        const box = boxes[offer.nodeId];
        worst = Math.max(worst, box ? Math.max(Math.abs(box.x - sample.x), Math.abs(box.w - sample.w)) : Infinity);
      }
    }
    check("owned form reproduces every accepted node's source sample within 1px at 1024/1440/1920", worst <= 1, String(worst));
  }

  // verifyLayout:false → phase B refuses everything; output equals the no-offer form.
  {
    const disabledDir = path.join(TMP_ROOT, "disabled");
    const disabled = await generateApp(planFor(runtime, inferred, styleInput), {
      outputDir: disabledDir,
      sourceSchemaVersion: 1,
      sourceSiteSpecVersion: 1,
      sourceCompilerVersion: 1,
      versions,
      verifyLayout: false,
      strictOwnership: true,
    });
    const d = disabled.manifest.layout?.ownership;
    check(
      "verification disabled → every group rejected verification-disabled, nothing owned",
      d?.nodesOwned === 0 && d?.rejectedBy["verification-disabled"] === offers.length && d?.cssBytesDelta === 0,
      JSON.stringify(d),
    );
    const dPage = await readFile(path.join(disabledDir, pageFile.path), "utf8");
    check("…runtime page untouched when nothing is owned", dPage === JSON.stringify(runtime) + "\n");
  }

  // Hand-assembled plan without styleInput cannot own (exact tier not regenerable).
  {
    const noInputDir = path.join(TMP_ROOT, "no-style-input");
    const noInput = await generateApp(planFor(runtime, inferred, undefined), {
      outputDir: noInputDir,
      sourceSchemaVersion: 1,
      sourceSiteSpecVersion: 1,
      sourceCompilerVersion: 1,
      versions,
      strictOwnership: true,
    });
    {
      // Regression (continuous QA 2026-09-15, apartmentary mobile frozen at 390px):
      // an offered node whose group phase B rejects must keep exactly what phase A
      // accepted from its non-owned rules — including the tier-3 authored fallback.
      const phaseABase = `/* Generated by web-recon from the SiteSpec global style catalog. */\n${plan.styles.css}\n`;
      const phaseA = await verifyLayoutRules({
        rules: plan.layout.rules.filter((rule) => rule.kind !== "responsive-owned"),
        pages: plan.pages,
        css: `${globalsCss(plan.breakpoint)}\n${phaseABase}`,
        residualAudit: plan.layout.residualAudit,
      });
      const fixSeen =
        phaseA.rules.some((r) => r.nodeId === "fix" && r.kind === "authored-inline-size") ||
        phaseA.intervalRejections.some((r) => r.nodeId === "fix" && r.kind === "authored-inline-size") ||
        phaseA.rejections.some((r) => r.nodeId === "fix");
      check(
        "REGRESSION (continuous QA mobile 390 collapse): the rejected offer's tier-3 authored fallback reaches phase-A verification",
        !app.ownership.acceptedGroups.includes(g("fix")) && fixSeen,
        JSON.stringify(phaseA.intervalRejections.filter((r) => r.nodeId === "fix")).slice(0, 400),
      );
      const notOwned = offers.filter((offer) => !app.ownership.acceptedGroups.includes(offer.planGroup)).map((offer) => offer.nodeId);
      check(
        "REGRESSION: every offered-but-not-owned node ships exactly its phase-A rules",
        notOwned.length > 0 &&
          notOwned.every(
            (id) =>
              JSON.stringify(app.layoutVerification.rules.filter((r) => r.nodeId === id)) ===
              JSON.stringify(phaseA.rules.filter((r) => r.nodeId === id)),
          ),
        JSON.stringify(notOwned),
      );
    }
    check(
      "…and the OWNED run drops that fallback for the accepted owner",
      app.ownership.acceptedGroups.includes(`${PAGE_ID}:desktop:item0`) &&
        !app.layoutVerification.rules.some((rule) => rule.nodeId === "item0" && rule.kind === "authored-inline-size"),
      JSON.stringify(app.layoutVerification.rules.filter((r) => r.nodeId === "item0").map((r) => r.kind)),
    );
    check(
      "plan without styleInput: accepted groups refused as unverifiable, no marker classes",
      noInput.manifest.layout?.ownership?.nodesOwned === 0 &&
        (noInput.manifest.layout?.ownership?.rejectedBy["unverifiable"] ?? 0) > 0,
      JSON.stringify(noInput.manifest.layout?.ownership?.rejectedBy),
    );
  }

  // =========================================================================
  section("D. phase B unit fixtures: co-damage, isolation, judge");
  // =========================================================================
  const handPage = (pageId: string, children: RuntimeElementNode[]): RuntimePage => ({
    pageId,
    desktop: {
      id: "desktop",
      width: TRUTH,
      doc: { k: "e", n: `${pageId}-root`, t: "div", p: { "data-wr-node": `${pageId}-root` }, c: children },
    },
    mobile: { id: "mobile", width: 390, doc: { k: "e", n: `${pageId}-m`, t: "div", p: {}, c: [] } },
  });
  const div = (id: string, className: string, c: RuntimeElementNode[] = []): RuntimeElementNode => ({
    k: "e",
    n: id,
    t: "div",
    p: { "data-wr-node": id, className },
    c,
  });
  const served = { min: SITE_BREAKPOINT, max: Number.POSITIVE_INFINITY };
  const samplesOf = (f: (width: number) => { x: number; w: number }) =>
    [1024, 1440, 1920].map((width) => ({ width, ...f(width), v: 1 as const }));
  const ownedRule = (pageId: string, nodeId: string, declarations: Record<string, string>, truthW: number): RecoveredLayoutRule => ({
    pageId,
    viewportId: "desktop",
    nodeId,
    kind: "responsive-owned",
    declarations: { width: "auto", "min-width": "auto", "max-width": "none", "margin-left": "0px", "margin-right": "0px", "flex-basis": "auto", ...declarations },
    evidence: ["fixture"],
    planGroup: `${pageId}:desktop:${nodeId}`,
    servedInterval: served,
    truth: { x: 0, w: truthW },
  });
  const offerOf = (
    pageId: string,
    nodeId: string,
    truth: { x: number; w: number },
    samples: OwnedPlanOffer["samples"],
    children: OwnedPlanOffer["children"] = [],
  ): OwnedPlanOffer => ({
    planGroup: `${pageId}:desktop:${nodeId}`,
    pageId,
    viewportId: "desktop",
    nodeId,
    tagName: "div",
    servedInterval: served,
    truthWidth: TRUTH,
    truth,
    samples,
    children,
    pieces: 1,
    provenanceByProperty: {},
  });

  // Co-damage: the node's plan is within tolerance for itself but moves its child.
  const coPage = handPage("pco", [div("par", "par", [div("kid", "kid")])]);
  const coCss = `html,body{margin:0}.wr-variant{display:contents}.par{width:1000px;height:10px}.kid{width:600px;height:10px}`;
  const coChildRule: RecoveredLayoutRule = {
    pageId: "pco",
    viewportId: "desktop",
    nodeId: "kid",
    kind: "percentage-width",
    declarations: { width: "300%" },
    evidence: ["fixture"],
    truth: { x: 0, w: 3000 },
  };
  const coOffer = offerOf(
    "pco",
    "par",
    { x: 0, w: 1000 },
    samplesOf((width) => ({ x: 0, w: width === 1024 ? 996.48 : width === 1920 ? 1009.6 : 1000 })),
    [{ nodeId: "kid", samples: samplesOf(() => ({ x: 0, w: 3000 })) }],
  );
  const coResult = await verifyOwnedPlanGroups({
    offers: [coOffer],
    groupRules: [ownedRule("pco", "par", { width: "calc(2vw + 971.2px)" }, 1000)],
    acceptedRules: [coChildRule],
    pages: [coPage],
    css: coCss,
  });
  const coRej = coResult.rejections[0];
  check("co-damage: group rejected", coResult.acceptedGroups.length === 0 && coRej !== undefined, JSON.stringify(coResult.rejections));
  check("co-damage: reason co-damage, failing box is the child", coRej?.reason === "co-damage" && coRej.failedNodeId === "kid", JSON.stringify(coRej));
  check(
    "co-damage: the node itself was within tolerance at 1024 (4.8px ≤ 5.12px)",
    judgeOwnedGroupAtWidth(
      { ...coOffer, children: [] },
      1024,
      { par: { x: 0, w: 991.68, l: true } },
      { par: { x: 0, w: 1000, l: true } },
    ) === undefined,
  );
  check("co-damage: histogram counts it", coResult.rejectedBy["co-damage"] === 1);

  // Co-damage to an ACCEPTED group that is not a child: par's plan is within its own
  // tolerance, but moves an owned grandchild whose percentage plan was accepted.
  const gdPage = handPage("pgd", [div("gpar", "gpar", [div("gmid", "gmid", [div("gkid", "gkid")])])]);
  const gdCss = `html,body{margin:0}.wr-variant{display:contents}.gpar{width:1000px;height:10px}.gkid{width:3000px;height:10px}`;
  const parW = (width: number): number => (width === 1024 ? 996.48 : width === 1920 ? 1009.6 : 1000);
  const gdPar = offerOf("pgd", "gpar", { x: 0, w: 1000 }, samplesOf((width) => ({ x: 0, w: parW(width) })), [
    { nodeId: "gmid", samples: samplesOf((width) => ({ x: 0, w: parW(width) })) },
  ]);
  const gdKid = offerOf("pgd", "gkid", { x: 0, w: 3000 }, samplesOf(() => ({ x: 0, w: 3000 })));
  const gdResult = await verifyOwnedPlanGroups({
    offers: [gdPar, gdKid],
    groupRules: [
      ownedRule("pgd", "gpar", { width: "calc(2vw + 971.2px)" }, 1000),
      ownedRule("pgd", "gkid", { width: "300%" }, 3000),
    ],
    acceptedRules: [],
    pages: [gdPage],
    css: gdCss,
  });
  check("accepted-group damage: the victim (grandchild) is accepted", gdResult.acceptedGroups.join() === "pgd:desktop:gkid", JSON.stringify(gdResult));
  check(
    "accepted-group damage: the mover is rejected co-damage naming the victim",
    gdResult.rejections.length === 1 && gdResult.rejections[0]?.nodeId === "gpar" && gdResult.rejections[0]?.reason === "co-damage" && gdResult.rejections[0]?.failedNodeId === "gkid",
    JSON.stringify(gdResult.rejections),
  );
  check("accepted-group damage: no joint regression in the final accepted state", gdResult.counters.acceptedJointRegressions === 0);

  // Group isolation: a bad group that displaces a good sibling in the joint render.
  const isoPage = handPage("piso", [div("rowx", "rowx", [div("a", "cell"), div("b", "cell")])]);
  const isoCss = `html,body{margin:0}.wr-variant{display:contents}.rowx{display:flex;flex-wrap:nowrap;width:auto}.cell{width:720px;height:10px;flex-shrink:0}`;
  const isoOfferA = offerOf("piso", "a", { x: 0, w: 720 }, samplesOf((width) => ({ x: 0, w: width / 2 })));
  const isoOfferB = offerOf("piso", "b", { x: 720, w: 720 }, samplesOf((width) => ({ x: width / 2, w: width / 2 })));
  const isoResult = await verifyOwnedPlanGroups({
    offers: [isoOfferA, isoOfferB],
    groupRules: [ownedRule("piso", "a", { width: "2000px" }, 720), ownedRule("piso", "b", { width: "50%" }, 720)],
    acceptedRules: [],
    pages: [isoPage],
    css: isoCss,
  });
  check("isolation: the bad group is rejected", isoResult.rejections.some((r) => r.nodeId === "a"), JSON.stringify(isoResult.rejections));
  check(
    "isolation: the bad group is rejected on its OWN box (truth or interval-sample), judged alone",
    ["truth", "interval-sample"].includes(isoResult.rejections.find((r) => r.nodeId === "a")?.reason ?? "") &&
      isoResult.rejections.find((r) => r.nodeId === "a")?.failedNodeId === "a",
    JSON.stringify(isoResult.rejections),
  );
  check("isolation: the good sibling is accepted despite failing in the joint render", isoResult.acceptedGroups.includes("piso:desktop:b"), JSON.stringify(isoResult));
  check("isolation: no rejection is recorded for the good sibling", !isoResult.rejections.some((r) => r.nodeId === "b"));
  check(
    "RECI2 budget: related siblings are NOT judged as an independent set (halving path kept)",
    isoResult.counters.independentSetRenders === 0,
    JSON.stringify(isoResult.counters),
  );

  // RECI2 root cause (budget): k unrelated failing groups used to cost 2k − 1 halving
  // set renders. Groups outside each other's parent scope are judged in ONE set render.
  const indPage = handPage("pind", [
    div("w1", "wrapx", [div("k1", "cellx")]),
    div("w2", "wrapx", [div("k2", "cellx")]),
    div("w3", "wrapx", [div("k3", "cellx")]),
    div("w4", "wrapx", [div("k4", "cellx")]),
  ]);
  const indCss = `html,body{margin:0}.wr-variant{display:contents}.wrapx{width:auto}.cellx{width:720px;height:10px}`;
  const indIds = ["k1", "k2", "k3", "k4"];
  const indResult = await verifyOwnedPlanGroups({
    offers: indIds.map((id) => offerOf("pind", id, { x: 0, w: 720 }, samplesOf(() => ({ x: 0, w: 720 })))),
    groupRules: indIds.map((id) => ownedRule("pind", id, { width: "2000px" }, 720)),
    acceptedRules: [],
    pages: [indPage],
    css: indCss,
  });
  check(
    "RECI2 budget: four unrelated failing groups are each rejected on their OWN box",
    indResult.acceptedGroups.length === 0 &&
      indIds.every((id) => indResult.rejections.some((r) => r.nodeId === id && r.failedNodeId === id && ["truth", "interval-sample"].includes(r.reason))),
    JSON.stringify(indResult.rejections),
  );
  /*
   * CHANGED SEMANTICS (review-VF MAJOR-2): a set render only SCREENS; each set
   * failure is re-judged ALONE before rejection. Four failing groups now cost
   * baseline + joint + 1 set + 4 alone = 7 set measures (halving: 1 + 1 + 7 = 9),
   * and every rejection comes from a render where the group was alone on B.
   */
  check(
    "RECI2 budget: …one set-screening render, then each failure re-judged alone (7 set measures < 9 halving)",
    indResult.counters.independentSetRenders === 1 &&
      indResult.counters.isolatedRenders === 4 &&
      indResult.counters.renders === 7 * indResult.counters.widthsRendered,
    JSON.stringify(indResult.counters),
  );

  // Review-VF S1 — cousins under shrink-to-fit parents in a flex row: k2's bad plan
  // widens p2, which pushes p1 and k1. The scope test calls them independent; k1's
  // CORRECT plan must still not be rejected from a render that included k2.
  {
    const css1 = `html,body{margin:0}.wr-variant{display:contents}.row{display:flex}.p{flex:0 0 auto}.k{width:720px;height:10px}`;
    const page1 = handPage("s1", [div("row", "row", [div("p2", "p", [div("k2", "k")]), div("p1", "p", [div("k1", "k")])])]);
    const r1 = await verifyOwnedPlanGroups({
      offers: [
        offerOf("s1", "k2", { x: 0, w: 720 }, samplesOf(() => ({ x: 0, w: 720 }))),
        offerOf("s1", "k1", { x: 720, w: 720 }, samplesOf(() => ({ x: 720, w: 720 }))),
      ],
      groupRules: [ownedRule("s1", "k2", { width: "2000px" }, 720), ownedRule("s1", "k1", { width: "720px" }, 720)],
      acceptedRules: [],
      pages: [page1],
      css: css1,
    });
    const r1alone = await verifyOwnedPlanGroups({
      offers: [offerOf("s1", "k1", { x: 720, w: 720 }, samplesOf(() => ({ x: 720, w: 720 })))],
      groupRules: [ownedRule("s1", "k1", { width: "720px" }, 720)],
      acceptedRules: [],
      pages: [page1],
      css: css1,
    });
    check("review-VF S1 control: k1 judged alone is accepted", r1alone.acceptedGroups.join() === "s1:desktop:k1", JSON.stringify(r1alone.rejections));
    check(
      "review-VF S1: the correct cousin k1 is accepted even though a set render included the bad k2",
      r1.acceptedGroups.join() === "s1:desktop:k1" && r1.counters.independentSetRenders >= 1,
      JSON.stringify({ a: r1.acceptedGroups, r: r1.rejections, c: r1.counters }),
    );
    check(
      "review-VF S1: k2 is rejected on its OWN box",
      r1.rejections.length === 1 && r1.rejections[0]?.nodeId === "k2" && r1.rejections[0]?.failedNodeId === "k2",
      JSON.stringify(r1.rejections),
    );
  }

  // Review-VF S2 — flex siblings: A's plan has a wrong margin-right (A's own box is
  // right) that pushes B 280px. B's own plan is bad and rejected. A must still be
  // rejected co-damage:b — an OFFERED neighbour whose plan is rejected stays guarded.
  {
    const css2 = `html,body{margin:0}.wr-variant{display:contents}.row{display:flex}.c{width:720px;flex-shrink:0;height:10px}`;
    const page2 = handPage("s2", [div("row2", "row", [div("a", "c"), div("b", "c")])]);
    const aSamples = samplesOf(() => ({ x: 0, w: 720 }));
    const bSamples = samplesOf(() => ({ x: 720, w: 720 }));
    const aOffer: OwnedPlanOffer = { ...offerOf("s2", "a", { x: 0, w: 720 }, aSamples), parentNodeId: "row2", witnesses: [{ nodeId: "b", samples: bSamples }] };
    const bOffer: OwnedPlanOffer = { ...offerOf("s2", "b", { x: 720, w: 720 }, bSamples), parentNodeId: "row2", witnesses: [{ nodeId: "a", samples: aSamples }] };
    const aRule = ownedRule("s2", "a", { width: "720px", "margin-right": "280px" }, 720);
    const r2ctl = await verifyOwnedPlanGroups({ offers: [aOffer], groupRules: [aRule], acceptedRules: [], pages: [page2], css: css2 });
    check(
      "review-VF S2 control: B not offered → A rejected co-damage:b",
      r2ctl.acceptedGroups.length === 0 && r2ctl.rejections[0]?.reason === "co-damage" && r2ctl.rejections[0]?.failedNodeId === "b",
      JSON.stringify(r2ctl.rejections),
    );
    const r2 = await verifyOwnedPlanGroups({
      offers: [aOffer, bOffer],
      groupRules: [aRule, ownedRule("s2", "b", { width: "2000px" }, 720)],
      acceptedRules: [],
      pages: [page2],
      css: css2,
    });
    check(
      "review-VF S2: B offered and rejected → A is STILL rejected co-damage:b (nothing accepted)",
      r2.acceptedGroups.length === 0 &&
        r2.rejections.some((r) => r.nodeId === "a" && r.reason === "co-damage" && r.failedNodeId === "b") &&
        r2.rejections.some((r) => r.nodeId === "b"),
      JSON.stringify(r2.rejections),
    );
    // The final joint re-measure (used after rollbacks) guards non-owner witnesses too:
    // owning A alone must be flagged as a joint regression because it pushes B.
    const remeasured = await measureOwnedJointOverlay({ offers: [aOffer], groupRules: [aRule], acceptedRules: [], pages: [page2], css: css2 });
    check(
      "review-VF MAJOR-1: measureOwnedJointOverlay flags an owner that damages a non-owner witness",
      remeasured.status === "measured" && remeasured.jointRegressedGroups.join() === "s2:desktop:a" && remeasured.renderLoadRetries === 0,
      JSON.stringify(remeasured.jointRegressedGroups),
    );
  }
  check("isolation: isolated renders were used", isoResult.counters.isolatedRenders > 0);
  check("isolation: converged", isoResult.counters.converged === true);
  check(
    "isolation: overlay boxes recorded for the accepted group at every width",
    [1024, 1440, 1920].every((width) => isoResult.overlayBoxes.get("piso:desktop:b")?.has(width)),
  );

  // Judge: pure predicate semantics.
  {
    const offer = offerOf("pj", "n", { x: 0, w: 1000 }, samplesOf((width) => ({ x: 0, w: width * 0.5 })));
    check("judge: truth err 4px accepted (≤ 4)", judgeOwnedGroupAtWidth(offer, TRUTH, { n: { x: 0, w: 1004, l: true } }, {}) === undefined);
    check("judge: truth err 4.01px rejected", judgeOwnedGroupAtWidth(offer, TRUTH, { n: { x: 0, w: 1004.01, l: true } }, {})?.reason === "truth");
    check("judge: absent box at truth rejected", judgeOwnedGroupAtWidth(offer, TRUTH, {}, {})?.reason === "truth");
    check(
      "judge: interval err within max(4, 0.5%W) accepted (9.5 ≤ 9.6 at 1920)",
      judgeOwnedGroupAtWidth(offer, 1920, { n: { x: 0, w: 969.5, l: true } }, { n: { x: 0, w: 960, l: true } }) === undefined,
    );
    check(
      "judge: interval err 9.7 > 9.6 at 1920 with a perfect baseline rejected",
      judgeOwnedGroupAtWidth(offer, 1920, { n: { x: 0, w: 969.7, l: true } }, { n: { x: 0, w: 960, l: true } })?.reason === "interval-sample",
    );
    check(
      "judge: interval err over tolerance but ≤ baseline + 0.5 accepted",
      judgeOwnedGroupAtWidth(offer, 1024, { n: { x: 0, w: 612.5, l: true } }, { n: { x: 0, w: 612, l: true } }) === undefined,
    );
    check(
      "judge: interval err over tolerance and over baseline + 0.5 rejected",
      judgeOwnedGroupAtWidth(offer, 1024, { n: { x: 0, w: 612.6, l: true } }, { n: { x: 0, w: 612, l: true } })?.reason === "interval-sample",
    );
    check(
      "judge: out-of-layout box at an interval sample counts as infinite error",
      judgeOwnedGroupAtWidth(offer, 1024, { n: { x: 0, w: 512, l: false } }, { n: { x: 0, w: 512, l: true } })?.reason === "interval-sample",
    );
  }

  // Disabled phase B.
  {
    const r = await verifyOwnedPlanGroups({ offers: [isoOfferB], groupRules: [], acceptedRules: [], pages: [isoPage], css: isoCss, enabled: false });
    check("phase B disabled → verification-disabled rejection, nothing accepted", r.acceptedGroups.length === 0 && r.rejections[0]?.reason === "verification-disabled");
  }
  // Missing group rules → unverifiable.
  {
    const r = await verifyOwnedPlanGroups({ offers: [isoOfferB], groupRules: [], acceptedRules: [], pages: [isoPage], css: isoCss });
    check("offer without rules → unverifiable", r.rejections[0]?.reason === "unverifiable");
  }

  // =========================================================================
  section("E. applyOwnership + confirmOwnedForm");
  // =========================================================================
  {
    const page = handPage("pap", [div("o", "wr-st000001 wr-sf keep"), div("n", "wr-st000001 wr-sf")]);
    const offer = offerOf("pap", "o", { x: 0, w: 10 }, []);
    const rules: RecoveredLayoutRule[] = [
      { pageId: "pap", viewportId: "desktop", nodeId: "o", kind: "percentage-width", declarations: { width: "50%" }, evidence: [] },
      { pageId: "pap", viewportId: "desktop", nodeId: "o", kind: "centered-max-width", declarations: { "max-width": "10px", "margin-left": "auto", "margin-right": "auto", "padding-left": "1px" }, evidence: [] },
      { pageId: "pap", viewportId: "desktop", nodeId: "o", kind: "grid-track-columns", declarations: { "grid-template-columns": "1fr 1fr" }, evidence: [] },
      { pageId: "pap", viewportId: "desktop", nodeId: "n", kind: "percentage-width", declarations: { width: "50%" }, evidence: [] },
    ];
    const applied = applyOwnership({ acceptedRules: rules, owners: [offer], pages: [page] });
    check("applyOwnership: width-only owner rule dropped entirely", !applied.rules.some((r) => r.nodeId === "o" && r.kind === "percentage-width") && applied.measuredRulesDropped === 1);
    check(
      "applyOwnership: mixed rule keeps its non-width-family declarations",
      JSON.stringify(applied.rules.find((r) => r.kind === "centered-max-width")?.declarations) === JSON.stringify({ "padding-left": "1px" }),
    );
    check("applyOwnership: dropped declaration count", applied.measuredDeclarationsDropped === 4, String(applied.measuredDeclarationsDropped));
    check("applyOwnership: grid-template-columns stays, conflict reported", applied.rules.some((r) => r.kind === "grid-track-columns" && r.nodeId === "o") && applied.ownersWithGridTrackRule === 1);
    check("applyOwnership: non-owner rules untouched (same object)", applied.rules.includes(rules[3]!));
    check("applyOwnership: owner token collected", applied.ownedTokens.has("st000001") && applied.ownedTokens.size === 1);
    check(
      "applyOwnership: owner classes = token + keep + markers, no wr-sf",
      classesOf(applied.pages[0]!, "o").join(" ") === `wr-st000001 keep ${OWNERSHIP_MARKER_CLASSES.join(" ")}`,
      classesOf(applied.pages[0]!, "o").join(" "),
    );
    check("applyOwnership: non-owner keeps wr-sf", classesOf(applied.pages[0]!, "n").includes("wr-sf"));
    check("applyOwnership: input page not mutated", classesOf(page, "o").includes("wr-sf"));
    check("applyOwnership: markerBytes positive", applied.markerBytes > 0);
    const missing = applyOwnership({ acceptedRules: [], owners: [offerOf("pap", "ghost", { x: 0, w: 1 }, [])], pages: [page] });
    check("applyOwnership: owner absent from the runtime tree reported missing", missing.missingNodes.join() === "pap:desktop:ghost");
    const none = applyOwnership({ acceptedRules: rules, owners: [], pages: [page] });
    check("applyOwnership: no owners → same page objects, same rules", none.pages[0] === page && none.rules.length === rules.length);
  }
  {
    // confirmOwnedForm: a fabricated overlay box that disagrees must be reported.
    const offer = isoOfferB;
    const overlay = new Map([["piso:desktop:b", new Map([[TRUTH, { x: 720, w: 999, l: true }]])]]);
    const confirm = await confirmOwnedForm({ offers: [offer], overlayBoxes: overlay, pages: [isoPage], css: isoCss, recoveredCss: "" });
    check("confirmOwnedForm reports a >0.5px disagreement (fail loudly)", confirm.status === "confirmed" && confirm.mismatches.length === 1 && confirm.checked === 1, JSON.stringify(confirm));
    const agree = new Map([["piso:desktop:b", new Map([[TRUTH, { x: 720, w: 720, l: true }]])]]);
    const ok = await confirmOwnedForm({ offers: [offer], overlayBoxes: agree, pages: [isoPage], css: isoCss, recoveredCss: "" });
    check("confirmOwnedForm passes an equal box", ok.mismatches.length === 0 && ok.checked === 1);
    const notRun = await confirmOwnedForm({ offers: [], overlayBoxes: new Map(), pages: [], css: "", recoveredCss: "" });
    check("confirmOwnedForm with no owners → not-run", notRun.status === "not-run");
  }
  check("no ownership log line reported an owned-form mismatch in the real run", !logs.some((line) => line.includes("owned form differs")));

  // =========================================================================
  section("F. review fixes: offer gate, witnesses, render budget, rollback");
  // =========================================================================
  // --- MAJOR-3: coverage gate for all-initial plans --------------------------
  {
    const noCoverage = inferLayoutRules({ pages: [specPage], styleLookup: lookup, breakpoint: SITE_BREAKPOINT });
    const ownN = noCoverage.counters.responsiveOwnership;
    const offered = new Set((noCoverage.ownedPlans ?? []).map((offer) => offer.nodeId));
    check("MAJOR-3: with complete coverage the all-initial row/flex containers ARE offered", offerFor("row") !== undefined && offerFor("flex") !== undefined);
    check("MAJOR-3: coverage evidence absent → all-initial row/flex NOT offered", !offered.has("row") && !offered.has("flex"), [...offered].join(","));
    check(
      "MAJOR-3: …counted coverage-incomplete / coverage-evidence-absent",
      (ownN?.notOfferedByReason["coverage-incomplete"] ?? 0) === 2 && ownN?.coverageIncompleteByReason?.["coverage-evidence-absent"] === 2,
      JSON.stringify(ownN),
    );
    check("MAJOR-3: nodes with an authored/inline declaration are still offered without coverage", offered.has("col") && offered.has("img") && offered.has("item0") && offered.has("shell"));
    const cors = inferLayoutRules({
      pages: [specPage],
      styleLookup: lookup,
      breakpoint: SITE_BREAKPOINT,
      stylesheetCoverageByPage: new Map([[`${PAGE_ID}:desktop`, { ...COMPLETE_COVERAGE, fallbackMissed: 1 }]]),
    });
    check(
      "MAJOR-3: an unrecovered (CORS) sheet → all-initial refused fallback-missed",
      !(cors.ownedPlans ?? []).some((offer) => offer.nodeId === "row") &&
        cors.counters.responsiveOwnership?.coverageIncompleteByReason?.["fallback-missed"] === 2,
      JSON.stringify(cors.counters.responsiveOwnership?.coverageIncompleteByReason),
    );
    for (const [field, value, reason] of [
      ["ruleIndexCapHit", true, "rule-index-cap-hit"],
      ["importsUnresolved", 1, "imports-unresolved"],
      ["groupingRulesSkipped", 2, "grouping-rules-skipped"],
    ] as const) {
      const r = inferLayoutRules({
        pages: [specPage],
        styleLookup: lookup,
        breakpoint: SITE_BREAKPOINT,
        stylesheetCoverageByPage: new Map([[`${PAGE_ID}:desktop`, { ...COMPLETE_COVERAGE, [field]: value }]]),
      });
      check(`MAJOR-3: ${field}=${String(value)} → refused ${reason}`, r.counters.responsiveOwnership?.coverageIncompleteByReason?.[reason] === 2);
    }
    const truncatedNodes = fixtureNodes();
    const { specPage: truncatedPage } = buildFixture(truncatedNodes, TOKENS, { initialDocument: true });
    const rowSpec = (truncatedPage as unknown as { viewports: { desktop: { nodes: { nodeId: string; authoredLayoutTruncated?: boolean }[] } } }).viewports.desktop.nodes.find((node) => node.nodeId === "row")!;
    rowSpec.authoredLayoutTruncated = true;
    const truncated = inferLayoutRules({ pages: [truncatedPage], styleLookup: lookup, breakpoint: SITE_BREAKPOINT, stylesheetCoverageByPage: COVERAGE });
    check(
      "MAJOR-3: node authored layout truncated → its all-initial plan refused even with complete page coverage",
      !(truncated.ownedPlans ?? []).some((offer) => offer.nodeId === "row") &&
        (truncated.ownedPlans ?? []).some((offer) => offer.nodeId === "flex"),
    );
    // `.some()` on an empty list: a viewport with NO cascade metadata anywhere cannot
    // prove anything for a node without width-family records.
    const noMeta = fixtureNodes().map((node) =>
      node.authored !== undefined ? { ...node, authored: node.authored.map((r) => rec(r.selector, r.property, r.value, undefined, r.media)) } : node,
    );
    const { specPage: noMetaPage } = buildFixture(noMeta, TOKENS, { initialDocument: true });
    const nm = inferLayoutRules({ pages: [noMetaPage], styleLookup: lookup, breakpoint: SITE_BREAKPOINT, stylesheetCoverageByPage: COVERAGE });
    check(
      "MAJOR-3: no ruleOrder anywhere in the viewport → record-less nodes not considered (cascade-metadata-absent), nothing offered",
      (nm.ownedPlans ?? []).length === 0 &&
        (nm.counters.responsiveOwnership?.notConsideredByReason["cascade-metadata-absent"] ?? 0) === nodes.length - 2,
      JSON.stringify(nm.counters.responsiveOwnership),
    );
  }

  // --- MAJOR-2: sibling / phase-A rule witnesses ------------------------------
  {
    const sibPage = handPage("psib", [div("srow", "srow", [div("sc", "sc"), div("sa", "sa"), div("sb", "sb", [div("sbk", "sbk")])])]);
    const sibCss =
      "html,body{margin:0}.wr-variant{display:contents}.srow{display:flex;flex-wrap:nowrap}" +
      ".sc{width:300px;height:10px;flex-shrink:0}.sa{width:400px;height:10px;flex-shrink:0}" +
      ".sb{width:200px;height:10px;flex-shrink:0}.sbk{width:50px;height:10px}";
    const two = (at1024: { x: number; w: number }, at1440: { x: number; w: number }) => [
      { width: 1024, ...at1024, v: 1 as const },
      { width: 1440, ...at1440, v: 1 as const },
    ];
    const sa = (witnesses: OwnedPlanOffer["witnesses"]): OwnedPlanOffer => ({
      ...offerOf("psib", "sa", { x: 300, w: 400 }, two({ x: 100, w: 400 }, { x: 300, w: 400 })),
      parentNodeId: "srow",
      ...(witnesses !== undefined ? { witnesses } : {}),
    });
    const saRules: RecoveredLayoutRule[] = [
      { ...ownedRule("psib", "sa", { width: "600px" }, 400), media: "(max-width: 1439.98px)" },
      { ...ownedRule("psib", "sa", { width: "400px" }, 400), media: "(min-width: 1440px)" },
    ];
    const sbSamples = two({ x: 500, w: 200 }, { x: 700, w: 200 });
    const control = await verifyOwnedPlanGroups({ offers: [sa([])], groupRules: saRules, acceptedRules: [], pages: [sibPage], css: sibCss });
    check("MAJOR-2 control: without witnesses the sibling-moving group passes its own predicate", control.acceptedGroups.join() === "psib:desktop:sa", JSON.stringify(control.rejections));
    const sibling = await verifyOwnedPlanGroups({
      offers: [sa([{ nodeId: "sb", samples: sbSamples }])],
      groupRules: saRules,
      acceptedRules: [],
      pages: [sibPage],
      css: sibCss,
    });
    check(
      "MAJOR-2: a sibling moved 400px at 1024 → rejected co-damage naming the sibling",
      sibling.acceptedGroups.length === 0 && sibling.rejections[0]?.reason === "co-damage" && sibling.rejections[0]?.failedNodeId === "sb",
      JSON.stringify(sibling.rejections),
    );
    const ruleWitness: RecoveredLayoutRule = {
      pageId: "psib",
      viewportId: "desktop",
      nodeId: "sbk",
      kind: "percentage-width",
      declarations: { width: "50px" },
      evidence: ["fixture"],
      truth: { x: 700, w: 50 },
      servedInterval: served,
      samples: two({ x: 500, w: 50 }, { x: 700, w: 50 }),
    };
    const nephew = await verifyOwnedPlanGroups({ offers: [sa([])], groupRules: saRules, acceptedRules: [ruleWitness], pages: [sibPage], css: sibCss });
    check(
      "MAJOR-2: a phase-A rule node in the parent subtree (a sibling's child) moved → co-damage naming it",
      nephew.acceptedGroups.length === 0 && nephew.rejections[0]?.reason === "co-damage" && nephew.rejections[0]?.failedNodeId === "sbk",
      JSON.stringify(nephew.rejections),
    );
    check("MAJOR-2: witnesses counted", nephew.counters.witnessesGuarded === 1 && sibling.counters.witnessesGuarded === 1);
    check(
      "MAJOR-2: inference attaches parent + element siblings as witnesses",
      (offerFor("col")?.witnesses ?? []).some((w) => w.nodeId === "n-body") &&
        (offerFor("col")?.witnesses ?? []).some((w) => w.nodeId === "rr") &&
        offerFor("col")?.parentNodeId === "n-body" &&
        !(offerFor("col")?.witnesses ?? []).some((w) => w.nodeId === "col"),
    );
  }

  // --- MAJOR-4: render budget -------------------------------------------------
  {
    const starve = await verifyOwnedPlanGroups({
      offers: [isoOfferA, isoOfferB],
      groupRules: [ownedRule("piso", "a", { width: "2000px" }, 720), ownedRule("piso", "b", { width: "50%" }, 720)],
      acceptedRules: [],
      pages: [isoPage],
      css: isoCss,
      renderBudgetPerPass: 5,
    });
    check(
      "MAJOR-4: a budget below one batch rejects every group render-budget",
      starve.acceptedGroups.length === 0 && starve.rejectedBy["render-budget"] === 2 && starve.counters.renderBudgetRejections === 2,
      JSON.stringify(starve.rejectedBy),
    );
    const partial = await verifyOwnedPlanGroups({
      offers: [isoOfferA, isoOfferB],
      groupRules: [ownedRule("piso", "a", { width: "2000px" }, 720), ownedRule("piso", "b", { width: "50%" }, 720)],
      acceptedRules: [],
      pages: [isoPage],
      css: isoCss,
      renderBudgetPerPass: 12,
    });
    check(
      "MAJOR-4: budget exhausted mid-partition → settled group keeps its verdict, the rest render-budget",
      partial.rejections.find((r) => r.nodeId === "a")?.reason !== "render-budget" &&
        partial.rejections.find((r) => r.nodeId === "b")?.reason === "render-budget" &&
        partial.counters.renders <= 12,
      JSON.stringify([partial.rejections, partial.counters.renders]),
    );
    check("MAJOR-4: the default budget is a documented positive constant", OWNERSHIP_RENDER_BUDGET_PER_PASS > 0 && app.manifest.layout?.ownership?.renderBudgetPerPass === OWNERSHIP_RENDER_BUDGET_PER_PASS);
    // RECI2 root cause (budget): apartmentary p000005/mobile, 626 groups × 11 widths,
    // exhausted a flat 2,000 renders after judging 240 groups and rejected 386 unjudged.
    check(
      "RECI2 budget: small passes keep the 2,000 floor",
      ownershipRenderBudgetForPass(10, 4) === OWNERSHIP_RENDER_BUDGET_PER_PASS,
    );
    check(
      "RECI2 budget: a 626-group × 11-width pass gets min(ceiling, groups × widths × 2), far above 2,000",
      ownershipRenderBudgetForPass(626, 11) === Math.min(OWNERSHIP_RENDER_BUDGET_CEILING, OWNERSHIP_RENDERS_PER_GROUP_WIDTH * 626 * 11) &&
        ownershipRenderBudgetForPass(300, 4) === 2400 &&
        ownershipRenderBudgetForPass(626, 11) > OWNERSHIP_RENDER_BUDGET_PER_PASS,
    );
    check(
      "RECI2 budget: the scaled budget is capped at the ceiling",
      ownershipRenderBudgetForPass(5000, 17) === OWNERSHIP_RENDER_BUDGET_CEILING,
    );
    check("MAJOR-4: the real run spent renders within budget and rejected nothing for budget", (mf?.verificationRenders ?? 0) > 0 && mf?.renderBudgetRejections === 0);
  }

  // --- MAJOR-1: joint-state re-measure used after a rollback --------------------
  {
    const joint = await measureOwnedJointOverlay({
      offers: [isoOfferA, isoOfferB],
      groupRules: [ownedRule("piso", "a", { width: "720px" }, 720), ownedRule("piso", "b", { width: "2000px" }, 720)],
      acceptedRules: [],
      pages: [isoPage],
      css: isoCss,
    });
    check(
      "MAJOR-1: joint re-measure flags the group regressing against M alone (b), not the one that holds (a, laid out before it)",
      joint.status === "measured" && joint.jointRegressedGroups.join() === "piso:desktop:b",
      JSON.stringify(joint.jointRegressedGroups),
    );
    check("MAJOR-1: joint re-measure records overlay boxes for every group × width", [isoOfferA, isoOfferB].every((o) => [1024, 1440, 1920].every((w) => joint.overlayBoxes.get(o.planGroup)?.has(w))));
  }

  // --- MAJOR-1: owned-form mismatch rollback ----------------------------------
  {
    // The exact tier regenerated for the owned form carries a padding the verified
    // overlay base never had: the owned block renders 50px wider than verified.
    const faultyInput: GenerateStylesheetInput = {
      ...styleInput,
      styleCatalog: {
        ...styleInput.styleCatalog,
        styles: styleInput.styleCatalog.styles.map((token) =>
          token.styleTokenId === "st-col" ? { ...token, properties: { ...token.properties, "padding-left": "50px" } } : token,
        ),
      },
    };
    const faultyPlan = { ...planFor(runtime, inferred, styleInput), styleInput: faultyInput } as ReconstructionPlan;
    let threw = false;
    try {
      await generateApp(faultyPlan, {
        outputDir: path.join(TMP_ROOT, "faulty-strict"),
        sourceSchemaVersion: 1,
        sourceSiteSpecVersion: 1,
        sourceCompilerVersion: 1,
        versions,
        strictOwnership: true,
      });
    } catch (err) {
      threw = err instanceof Error && err.message.includes("owned form differs");
    }
    check("MAJOR-1: strictOwnership still throws on an owned-form mismatch", threw);
    const rolledDir = path.join(TMP_ROOT, "faulty-rollback");
    const rolled = await generateApp(faultyPlan, {
      outputDir: rolledDir,
      sourceSchemaVersion: 1,
      sourceSiteSpecVersion: 1,
      sourceCompilerVersion: 1,
      versions,
    });
    const ro = rolled.manifest.layout?.ownership;
    check(
      "MAJOR-1: production rolls the mismatching group back instead of shipping it",
      !rolled.ownership.acceptedGroups.includes(g("col")) &&
        rolled.ownership.rejections.some((r) => r.nodeId === "col" && r.reason === "owned-form-mismatch") &&
        ro?.ownedFormRollbacks === 1,
      JSON.stringify(ro),
    );
    check("MAJOR-1: the shipped state has 0 owned-form mismatches after the re-confirm", ro?.ownedFormMismatches === 0 && ro?.ownedFormConfirm === "confirmed" && (ro?.rollbackPasses ?? 0) >= 1);
    check("MAJOR-1: the other accepted groups still ship", rolled.ownership.acceptedGroups.includes(g("flexroot")) && rolled.ownership.acceptedGroups.includes(g("item0")));
    const rolledPage = JSON.parse(
      await readFile(path.join(rolledDir, rolled.files.find((f) => f.path.endsWith(`${PAGE_ID}.json`))!.path), "utf8"),
    ) as RuntimePage;
    check("MAJOR-1: the rolled-back node carries no marker class", !classesOf(rolledPage, "col").some((cls) => cls.startsWith("wr-ow-")) && classesOf(rolledPage, "flexroot").includes("wr-ow-w"));
    const rolledCss = await readFile(path.join(rolledDir, rolled.files.find((f) => f.path.endsWith(".css") && f.path.includes("public"))!.path), "utf8");
    check("MAJOR-1: the rolled-back node's token is not split", !rolledCss.includes(".wr-st-col:where(") && rolledCss.includes(".wr-st-flexroot:where(:not(.wr-ow-w))"));
    {
      const phaseABase = `/* Generated by web-recon from the SiteSpec global style catalog. */\n${faultyPlan.styles.css}\n`;
      const phaseA = await verifyLayoutRules({
        rules: faultyPlan.layout.rules.filter((rule) => rule.kind !== "responsive-owned"),
        pages: faultyPlan.pages,
        css: `${globalsCss(faultyPlan.breakpoint)}\n${phaseABase}`,
        residualAudit: faultyPlan.layout.residualAudit,
      });
      const expected = phaseA.rules.filter((rule) => rule.nodeId === "col");
      const actual = rolled.layoutVerification.rules.filter((rule) => rule.nodeId === "col");
      check(
        "MAJOR-1: its measured (phase-A) rules are restored exactly and no owned rule ships for it",
        expected.length > 0 && JSON.stringify(actual) === JSON.stringify(expected),
        `${expected.map((r) => r.kind)} vs ${actual.map((r) => r.kind)}`,
      );
    }
    check("MAJOR-1: joint-regression rollback counter present (0 here)", ro?.jointRegressionRollbacks === 0);
  }

  console.log("");
  console.log(`${passed}/${total} checks passed`);
  if (passed !== total) process.exitCode = 1;
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
