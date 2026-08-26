import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { chromium } from "playwright";
import {
  SiteSpecSchema,
  StyleCatalogSchema,
  AssetCatalogSchema,
  InteractionSpecSchema,
  type SpecNode,
  type ElementSpecNode,
  type PageSpec,
  PageSpecSchema,
} from "../src/sitespec/index.js";
import {
  generateApp,
  loadReconstructionInput,
  planReconstruction,
  resolveDependencyVersions,
} from "../src/reconstruction/index.js";
import { compileReconTemplate } from "../src/recon-template/index.js";
import { loadReconTemplate } from "../src/content-injection/load-template.js";
import {
  THEME_CONTRACT_ID,
  THEME_SCHEMA_VERSION,
  THEME_TOKENS,
  ThemeContractError,
  ThemeFileSchema,
  checkThemeCompatibility,
  extractSiteTheme,
  generateThemeOverlay,
  runThemeQa,
  startThemedApp,
  type SiteThemeAdapter,
  type ThemeFile,
} from "../src/theme/index.js";

/**
 * Task 20 smoke — Theme Extraction, Token Contract & Theme Adapter Foundation.
 *
 * A synthetic PAINT-RICH two-page site (distinct heading/body/link/muted text
 * colors, a blue CTA pill, bordered+shadowed cards, white elevated cards, a
 * gradient block that must stay preserved, an unexplained dark raw color, and
 * a click-mounted dynamic menu whose links share the anchor paint) goes
 * through the REAL reconstruction generator and the REAL template compiler;
 * the Task 20 chain then runs against that real template artifact.
 *
 * §37 items covered: 1 schema validation · 2 original extraction · 3 token
 * contract · 4 adapter mapping · 5 raw group preserved · 6 no common-class
 * dependency · 7 palette application · 8 border color · 9 radius · 10 shadow
 * · 11 layout property rejected · 12 unknown token rejected · 13 original
 * no-op parity · 14 curated paint changes · 15 static occurrence · 16
 * dynamic-template occurrence · 17 content+theme composition · 18 contrast
 * failure detection · 19 dark incompatibility · 20 manual preserve · 21
 * manual binding · 22 geometry unchanged · 23 interaction unchanged · 24
 * hydration-safe render.
 */

let checks = 0;
let failures = 0;
function check(name: string, ok: boolean | undefined, detail = ""): void {
  checks++;
  if (ok) console.log(`  PASS  ${name}`);
  else {
    failures++;
    console.log(`  FAIL  ${name}${detail ? ` — ${detail}` : ""}`);
  }
}
function section(title: string): void {
  console.log(`\n== ${title}`);
}

// ---------------------------------------------------------------------------
// Fixture SiteSpec
// ---------------------------------------------------------------------------

const ROOT_URL = "https://fixture-theme.example/";

// Paint truth the extractor must recover:
const HEADING_COLOR = "rgb(20, 30, 55)";
const BODY_COLOR = "rgb(70, 80, 95)";
const LINK_COLOR = "rgb(30, 90, 200)";
const MUTED_COLOR = "rgb(140, 148, 160)";
const ODD_DARK_COLOR = "rgb(10, 10, 12)";
const CTA_BG = "rgb(30, 90, 200)";
const CARD_BG = "rgb(244, 246, 250)";
const CARD_BORDER = "1px solid rgb(210, 216, 228)";
const CARD_SHADOW = "rgba(0, 0, 0, 0.2) 0px 4px 12px 0px";
const ELEVATED_SHADOW = "rgba(0, 0, 0, 0.15) 0px 2px 6px 0px";
const GRADIENT = "linear-gradient(90deg, rgb(255, 0, 0), rgb(0, 0, 255))";

interface B {
  tag?: string;
  text?: string;
  attrs?: Record<string, string>;
  styleToken?: string;
  children?: B[];
}
function el(tag: string, opts: Omit<B, "tag" | "text"> = {}, ...children: B[]): B {
  return { tag, ...opts, children };
}
function tx(text: string): B {
  return { text };
}

interface FlatTree {
  nodes: SpecNode[];
  rootNodeIds: string[];
  elementCount: number;
  textCount: number;
}

function flatten(root: B, viewportWidth: number): FlatTree {
  const nodes: SpecNode[] = [];
  let n = 0;
  const nextId = (): string => `n${String(++n).padStart(6, "0")}`;
  let y = 0;
  const visit = (b: B, parentId?: string): string => {
    const id = nextId();
    if (b.text !== undefined) {
      nodes.push({ nodeId: id, type: "text", parentNodeId: parentId!, value: b.text });
      return id;
    }
    const boxY = (y += 10);
    const width = Math.min(viewportWidth, 800);
    const placeholder: ElementSpecNode = {
      nodeId: id,
      type: "element",
      sourceElementId: `e${String(n).padStart(6, "0")}`,
      parentNodeId: parentId,
      childNodeIds: [],
      tagName: b.tag!,
      attributes: b.attrs ?? {},
      role: b.attrs?.["role"],
      localVisible: true,
      effectiveVisible: true,
      boundingBox: { x: 0, y: boxY, width, height: 20, top: boxY, right: width, bottom: boxY + 20, left: 0 },
      styleTokenId: b.styleToken,
      assetRefs: [],
      relations: [],
      limitations: [],
    };
    nodes.push(placeholder);
    const childIds: string[] = [];
    for (const child of b.children ?? []) childIds.push(visit(child, id));
    placeholder.childNodeIds = childIds;
    return id;
  };
  const rootId = visit(root);
  return {
    nodes,
    rootNodeIds: [rootId],
    elementCount: nodes.filter((x) => x.type === "element").length,
    textCount: nodes.filter((x) => x.type === "text").length,
  };
}

function headerB(): B {
  return el(
    "header",
    { styleToken: "st000010" },
    el("a", { attrs: { href: "/" }, styleToken: "st000003" }, tx("Fixture")),
    el(
      "nav",
      {},
      el("a", { attrs: { href: "/about" }, styleToken: "st000003" }, tx("About")),
      el("a", { attrs: { href: "/" }, styleToken: "st000003" }, tx("Home")),
      el(
        "button",
        { attrs: { "aria-expanded": "false", type: "button" }, styleToken: "st000002" },
        tx("Menu"),
      ),
    ),
  );
}

function footerB(): B {
  const listLinks: B[] = [];
  for (let i = 1; i <= 16; i++) {
    listLinks.push(el("a", { attrs: { href: `/list-${i}` }, styleToken: "st000003" }, tx(`List item ${i}`)));
  }
  return el(
    "footer",
    { styleToken: "st000010" },
    el("p", { styleToken: "st000002" }, tx("© Fixture Inc")),
    el("div", {}, ...listLinks),
  );
}

function cardsB(): B[] {
  const cards: B[] = [];
  for (let i = 1; i <= 6; i++) {
    cards.push(
      el(
        "div",
        { styleToken: "st000005" },
        el("p", { styleToken: "st000002" }, tx(`Card body copy number ${i}`)),
        el("span", { styleToken: "st000007" }, tx(`Muted caption ${i}`)),
      ),
    );
  }
  return cards;
}

function oddDarkB(count: number): B[] {
  const spans: B[] = [];
  for (let i = 1; i <= count; i++) {
    spans.push(el("span", { styleToken: "st000008" }, tx(`Unexplained dark label ${i}`)));
  }
  return spans;
}

function homeBody(): B {
  return el(
    "body",
    { styleToken: "st000009" },
    headerB(),
    el(
      "main",
      {},
      el(
        "section",
        { styleToken: "st000010" },
        el(
          "div",
          {},
          el("h1", { styleToken: "st000001" }, tx("Fixture headline")),
          el("p", { styleToken: "st000002" }, tx("Hero description copy")),
          el("a", { attrs: { href: "/signup" }, styleToken: "st000004" }, tx("Get started")),
        ),
      ),
      el("section", { styleToken: "st000010" }, ...cardsB()),
      el(
        "section",
        { styleToken: "st000010" },
        el("div", { styleToken: "st000011" }, el("p", { styleToken: "st000002" }, tx("Elevated card one"))),
        el("div", { styleToken: "st000011" }, el("p", { styleToken: "st000002" }, tx("Elevated card two"))),
        el("div", { styleToken: "st000006" }, tx("Gradient banner")),
        ...oddDarkB(14),
      ),
    ),
    footerB(),
  );
}

function aboutBody(): B {
  return el(
    "body",
    { styleToken: "st000009" },
    headerB(),
    el(
      "main",
      {},
      el("h1", { styleToken: "st000001" }, tx("About fixture")),
      el("p", { styleToken: "st000002" }, tx("About body copy")),
      el("section", { styleToken: "st000010" }, ...cardsB()),
      ...oddDarkB(4).map((b) => b),
    ),
    footerB(),
  );
}

function pageSpec(pageId: string, url: string, familyId: string, body: B, explored: boolean): PageSpec {
  const doc = el("html", { attrs: { lang: "en" }, styleToken: "st000009" }, body);
  const make = (viewport: "desktop" | "mobile") => {
    const width = viewport === "desktop" ? 1440 : 390;
    const tree = flatten(doc, width);
    return {
      profile: {
        id: viewport,
        width,
        height: viewport === "desktop" ? 900 : 844,
        deviceScaleFactor: viewport === "desktop" ? 1 : 3,
        isMobile: viewport === "mobile",
        hasTouch: viewport === "mobile",
      },
      documentDimensions: {
        viewportWidth: width,
        viewportHeight: viewport === "desktop" ? 900 : 844,
        documentWidth: width,
        documentHeight: 1600,
        scrollWidth: width,
        scrollHeight: 1600,
      },
      contentRecovery: {
        status: "aligned" as const,
        source: "rendered-html" as const,
        parsedElementCount: tree.elementCount,
        sourceElementCount: tree.elementCount,
        textNodeCount: tree.textCount,
        cappedSourceTextCount: 0,
        recoveredLongTextCount: 0,
        longestTextLength: 30,
        supplementalAttributeCount: 0,
        supplementalElementCount: 0,
        supplementalAttributeNames: [],
      },
      rootNodeIds: tree.rootNodeIds,
      nodes: tree.nodes,
      sourceElementCount: tree.elementCount,
      elementNodeCount: tree.elementCount,
      textNodeCount: tree.textCount,
      localVisibleCount: tree.elementCount,
      effectiveVisibleCount: tree.elementCount,
      styleTokenCount: 11,
      assetRefs: [],
      frameInventory: [],
      shadowInventory: { openShadowRootCount: 0, hostNodeIds: [], limitations: [] },
      limitations: [],
    };
  };
  return PageSpecSchema.parse({
    schemaVersion: 4,
    pageId,
    url,
    role: "representative",
    familyId,
    familyType: "singleton",
    sourceObservation: "fixture://not-a-real-run",
    documentMetadata: { requestedUrl: url, finalUrl: url, title: `Fixture ${pageId}` },
    viewports: { desktop: make("desktop"), mobile: make("mobile") },
    interactionCoverage: explored ? "explored" : "not-explored",
    patternIds: explored ? ["ip000001"] : [],
    unknownInteractionIds: [],
    limitations: [],
  });
}

function findNode(
  page: PageSpec,
  viewport: "desktop" | "mobile",
  predicate: (node: SpecNode) => boolean,
): string {
  const node = page.viewports[viewport].nodes.find(predicate);
  if (!node) throw new Error("fixture node not found");
  return node.nodeId;
}

async function writeFixtureSiteSpec(dir: string): Promise<string> {
  await mkdir(path.join(dir, "pages"), { recursive: true });
  const home = pageSpec("p000001", ROOT_URL, "f000001", homeBody(), true);
  const about = pageSpec("p000002", `${ROOT_URL}about`, "f000002", aboutBody(), false);
  const triggerId = findNode(home, "desktop", (n) => n.type === "element" && n.tagName === "button");
  const bodyId = findNode(home, "desktop", (n) => n.type === "element" && n.tagName === "body");

  const styleCatalog = StyleCatalogSchema.parse({
    schemaVersion: 4,
    tokenCount: 11,
    sourceStyleReferenceCount: 30,
    sourceLocalStyleRecordCount: 30,
    dedupReductionRate: 0.6,
    styles: [
      { styleTokenId: "st000001", properties: { color: HEADING_COLOR, "line-height": "32px", display: "block" }, usageCount: 4 },
      { styleTokenId: "st000002", properties: { color: BODY_COLOR, "line-height": "24px", display: "block" }, usageCount: 30 },
      { styleTokenId: "st000003", properties: { color: LINK_COLOR, display: "inline-block" }, usageCount: 40 },
      {
        styleTokenId: "st000004",
        properties: {
          color: "rgb(255, 255, 255)",
          "background-color": CTA_BG,
          "border-radius": "14px",
          display: "inline-block",
        },
        usageCount: 2,
      },
      {
        styleTokenId: "st000005",
        properties: {
          "background-color": CARD_BG,
          "border-top": CARD_BORDER,
          "border-right": CARD_BORDER,
          "border-bottom": CARD_BORDER,
          "border-left": CARD_BORDER,
          "border-radius": "8px",
          "box-shadow": CARD_SHADOW,
          display: "block",
        },
        usageCount: 12,
      },
      {
        styleTokenId: "st000006",
        properties: { "background-color": "rgb(255, 255, 255)", "background-image": GRADIENT, display: "block" },
        usageCount: 2,
      },
      { styleTokenId: "st000007", properties: { color: MUTED_COLOR, display: "inline" }, usageCount: 12 },
      { styleTokenId: "st000008", properties: { color: ODD_DARK_COLOR, display: "inline" }, usageCount: 18 },
      {
        styleTokenId: "st000009",
        properties: { "background-color": "rgb(255, 255, 255)", color: BODY_COLOR, display: "block" },
        usageCount: 4,
      },
      { styleTokenId: "st000010", properties: { "background-color": "rgb(255, 255, 255)", display: "block" }, usageCount: 10 },
      {
        styleTokenId: "st000011",
        properties: { "background-color": "rgb(255, 255, 255)", "box-shadow": ELEVATED_SHADOW, display: "block" },
        usageCount: 4,
      },
    ],
    frequency: { color: [], backgroundColor: [], fontFamily: [], fontSize: [] },
  });

  const assetCatalog = AssetCatalogSchema.parse({
    schemaVersion: 4,
    assetCount: 0,
    occurrenceCount: 0,
    kindCounts: {},
    assets: [],
  });

  const dynamicTemplate = {
    provenance: "observed" as const,
    state: "after-action" as const,
    rootTemplateNodeIds: ["t000001"],
    nodes: [
      {
        templateNodeId: "t000001",
        tagName: "div",
        attributes: {},
        childTemplateNodeIds: ["t000002", "t000004"],
        effectiveVisible: true,
        styleTokenId: "st000010",
        assetRefs: [],
      },
      {
        templateNodeId: "t000002",
        parentTemplateNodeId: "t000001",
        tagName: "a",
        attributes: { href: "/about" },
        childTemplateNodeIds: ["t000003"],
        effectiveVisible: true,
        styleTokenId: "st000003",
        assetRefs: [],
      },
      {
        templateNodeId: "t000003",
        parentTemplateNodeId: "t000002",
        tagName: "#text",
        attributes: {},
        childTemplateNodeIds: [],
        text: "About",
        effectiveVisible: true,
        assetRefs: [],
      },
      {
        templateNodeId: "t000004",
        parentTemplateNodeId: "t000001",
        tagName: "a",
        attributes: { href: "/" },
        childTemplateNodeIds: ["t000005"],
        effectiveVisible: true,
        styleTokenId: "st000003",
        assetRefs: [],
      },
      {
        templateNodeId: "t000005",
        parentTemplateNodeId: "t000004",
        tagName: "#text",
        attributes: {},
        childTemplateNodeIds: [],
        text: "Home",
        effectiveVisible: true,
        assetRefs: [],
      },
    ],
    elementNodeCount: 3,
    textNodeCount: 2,
    truncations: [],
  };

  const interactionSpec = InteractionSpecSchema.parse({
    schemaVersion: 4,
    registryVersion: 3,
    summary: {
      verifiedPatternCount: 1,
      unknownInteractionCount: 0,
      inferredInteractionCount: 0,
      patternTypeCounts: { disclosure: 1 },
      mechanismCounts: { "aria-expanded": 1 },
      unknownReasonCounts: {},
      patternsWithStaticTrigger: 1,
      patternsWithStaticTarget: 0,
      patternsWithDynamicTarget: 1,
      patternsWithDynamicTargetContent: 1,
      dynamicTemplateNodeCount: 5,
      patternsWithoutTarget: 0,
      patternsWithObservedTargets: 1,
      observedTargetCount: 1,
      observedTargetsResolved: 0,
      observedTargetsWithTemplate: 1,
      pagesExplored: 1,
      pagesNotExplored: 1,
      routesWithExactBehaviorEvidence: 1,
      routesWithRepresentedBehavior: 0,
      routesWithoutBehaviorEvidence: 1,
    },
    patterns: [
      {
        patternId: "ip000001",
        patternType: "disclosure",
        mechanism: "aria-expanded",
        pageId: "p000001",
        viewport: "desktop",
        triggerNodeId: triggerId,
        triggerSourceElementId: "e000009",
        trigger: { tagName: "button", text: "Menu" },
        transition: { direction: "closed-to-open", field: "aria-expanded", before: "false", after: "true" },
        observedTargets: [
          {
            discoveryId: "dt000001",
            kind: "newly-mounted",
            direction: "appeared",
            observedTag: "div",
            structuralPath: "0/1/3",
            relationEvidence: [{ kind: "newly-mounted-subtree" }],
            staticNodeResolved: false,
            mountHostNodeId: bodyId,
            mountChildIndex: 3,
            closedState: { exists: false },
            openState: { exists: true, visible: true, display: "block" },
            mountedDescendantCount: 3,
            textSample: "About Home",
            textLength: 10,
            dynamicTemplate,
            limitations: [],
            provenance: "observed",
          },
        ],
        sourceLimitations: [],
        limitations: [],
        provenance: {
          level: "derived",
          ruleId: "disclosure-aria-expanded",
          ruleVersion: 1,
          registryVersion: 3,
        },
      },
    ],
    unknownInteractions: [],
    inferredInteractions: [],
    rules: [
      {
        ruleId: "disclosure-aria-expanded",
        patternType: "disclosure",
        version: 1,
        description: "fixture rule",
        requiredEvidence: ["aria-expanded flip"],
        compiledPatternCount: 1,
      },
    ],
  });

  const siteSpec = SiteSpecSchema.parse({
    schemaVersion: 4,
    siteSpecVersion: 1,
    compilerVersion: 3,
    engine: "offline-deterministic",
    rootUrl: ROOT_URL,
    source: {
      verifiedUrls: "fixture://verified-urls",
      verification: "fixture://verification",
      pageFamilies: "fixture://page-families",
      selectedPages: "fixture://selected-pages",
      siteObservation: "fixture://site-observation",
      interactionExploration: "fixture://interaction-exploration",
      interactionPatterns: "fixture://interaction-patterns",
      unknownInteractions: "fixture://unknown-interactions",
    },
    responsiveModel: {
      mode: "observed-endpoints",
      observedViewports: [home.viewports.desktop.profile, home.viewports.mobile.profile],
      inferredBreakpoints: [],
      limitations: [],
    },
    stats: {
      routeCount: 2,
      familyCount: 2,
      pageCount: 2,
      exactObservedRouteCount: 2,
      validationSampleRouteCount: 0,
      familyRepresentedRouteCount: 0,
      exactObservationRate: 1,
      representativePageCount: 2,
      validationPageCount: 0,
      desktopElementNodeCount:
        home.viewports.desktop.elementNodeCount + about.viewports.desktop.elementNodeCount,
      mobileElementNodeCount:
        home.viewports.mobile.elementNodeCount + about.viewports.mobile.elementNodeCount,
      desktopTextNodeCount: home.viewports.desktop.textNodeCount + about.viewports.desktop.textNodeCount,
      mobileTextNodeCount: home.viewports.mobile.textNodeCount + about.viewports.mobile.textNodeCount,
      effectiveVisibleElementCount: 120,
      hiddenElementCount: 0,
      viewportCount: 4,
      alignedViewportCount: 4,
      fallbackViewportCount: 0,
      cappedSourceTextCount: 0,
      recoveredLongTextCount: 0,
      supplementalAttributeCount: 0,
      supplementalElementCount: 0,
      supplementalAttributeNameCounts: {},
      styleTokenCount: 11,
      assetCount: 0,
      frameCount: 0,
      shadowHostCount: 0,
    },
    provenanceSummary: {
      observedFactCount: 120,
      derivedFactCount: 10,
      inferredFactCount: 0,
      hasAiInference: false,
      verifiedPatternCount: 1,
      unknownCount: 0,
    },
    routes: [
      {
        routeId: "r000001",
        url: ROOT_URL,
        pathname: "/",
        familyId: "f000001",
        coverage: "exact-observed",
        pageId: "p000001",
        renderSourcePageId: "p000001",
        observedOnThisExactUrl: true,
        behaviorCoverage: "exact-verified",
        behaviorSourcePageId: "p000001",
        limitations: [],
      },
      {
        routeId: "r000002",
        url: `${ROOT_URL}about`,
        pathname: "/about",
        familyId: "f000002",
        coverage: "exact-observed",
        pageId: "p000002",
        renderSourcePageId: "p000002",
        observedOnThisExactUrl: true,
        behaviorCoverage: "exact-not-explored",
        limitations: [],
      },
    ],
    families: [
      {
        familyId: "f000001",
        familyType: "singleton",
        representativeUrl: ROOT_URL,
        representativePageId: "p000001",
        observedVariantPageIds: ["p000001"],
        memberUrls: [ROOT_URL],
        memberCount: 1,
        exactObservedMemberCount: 1,
        representedOnlyMemberCount: 0,
        limitations: [],
      },
      {
        familyId: "f000002",
        familyType: "singleton",
        representativeUrl: `${ROOT_URL}about`,
        representativePageId: "p000002",
        observedVariantPageIds: ["p000002"],
        memberUrls: [`${ROOT_URL}about`],
        memberCount: 1,
        exactObservedMemberCount: 1,
        representedOnlyMemberCount: 0,
        limitations: [],
      },
    ],
    pages: [
      {
        pageId: "p000001",
        url: ROOT_URL,
        role: "representative",
        familyId: "f000001",
        file: "pages/p000001.json",
        interactionCoverage: "explored",
        desktopElementNodes: home.viewports.desktop.elementNodeCount,
        mobileElementNodes: home.viewports.mobile.elementNodeCount,
      },
      {
        pageId: "p000002",
        url: `${ROOT_URL}about`,
        role: "representative",
        familyId: "f000002",
        file: "pages/p000002.json",
        interactionCoverage: "not-explored",
        desktopElementNodes: about.viewports.desktop.elementNodeCount,
        mobileElementNodes: about.viewports.mobile.elementNodeCount,
      },
    ],
    responsiveDifferences: [
      {
        pageId: "p000001",
        desktopElementNodes: home.viewports.desktop.elementNodeCount,
        mobileElementNodes: home.viewports.mobile.elementNodeCount,
        desktopTextNodes: home.viewports.desktop.textNodeCount,
        mobileTextNodes: home.viewports.mobile.textNodeCount,
        desktopEffectiveVisible: home.viewports.desktop.effectiveVisibleCount,
        mobileEffectiveVisible: home.viewports.mobile.effectiveVisibleCount,
        desktopDocumentHeight: 1600,
        mobileDocumentHeight: 1600,
      },
      {
        pageId: "p000002",
        desktopElementNodes: about.viewports.desktop.elementNodeCount,
        mobileElementNodes: about.viewports.mobile.elementNodeCount,
        desktopTextNodes: about.viewports.desktop.textNodeCount,
        mobileTextNodes: about.viewports.mobile.textNodeCount,
        desktopEffectiveVisible: about.viewports.desktop.effectiveVisibleCount,
        mobileEffectiveVisible: about.viewports.mobile.effectiveVisibleCount,
        desktopDocumentHeight: 1600,
        mobileDocumentHeight: 1600,
      },
    ],
    styleCatalogFile: "style-catalog.json",
    assetCatalogFile: "asset-catalog.json",
    interactionSpecFile: "interaction-spec.json",
    limitations: [],
    limitationGlossary: {},
  });

  const write = (name: string, value: unknown): Promise<void> =>
    writeFile(path.join(dir, name), JSON.stringify(value, null, 2) + "\n", "utf8");
  await write("site-spec.json", siteSpec);
  await write("style-catalog.json", styleCatalog);
  await write("asset-catalog.json", assetCatalog);
  await write("interaction-spec.json", interactionSpec);
  await write(path.join("pages", "p000001.json"), home);
  await write(path.join("pages", "p000002.json"), about);
  return path.join(dir, "site-spec.json");
}

// ---------------------------------------------------------------------------
// Fixture themes
// ---------------------------------------------------------------------------

const SMOKE_COOL: ThemeFile = ThemeFileSchema.parse({
  schemaVersion: THEME_SCHEMA_VERSION,
  contract: THEME_CONTRACT_ID,
  themeId: "smoke-cool",
  name: "Smoke Cool",
  metadata: { mode: "light", supports: ["palette", "decoration"] },
  provenance: "curated",
  tokens: {
    "color.canvas": "rgb(240, 244, 247)",
    "color.surface.primary": "rgb(240, 244, 247)",
    "color.surface.secondary": "rgb(226, 232, 238)",
    "color.surface.elevated": "rgb(255, 255, 255)",
    "color.text.primary": "rgb(10, 40, 30)",
    "color.text.secondary": "rgb(52, 72, 66)",
    "color.text.muted": "rgb(120, 134, 128)",
    "color.action.primary": "rgb(20, 120, 90)",
    "color.action.primaryText": "rgb(255, 255, 255)",
    "color.link": "rgb(16, 100, 80)",
    "color.border.default": "rgb(180, 200, 190)",
    "color.accent.primary": "rgb(200, 80, 40)",
    "decoration.radius.small": "3px",
    "decoration.radius.pill": "5px",
    "decoration.shadow.small": "rgba(10, 40, 30, 0.2) 0px 1px 3px 0px",
    "decoration.shadow.large": "rgba(10, 40, 30, 0.25) 0px 6px 18px -2px",
  },
});

const SMOKE_DARK: ThemeFile = ThemeFileSchema.parse({
  schemaVersion: THEME_SCHEMA_VERSION,
  contract: THEME_CONTRACT_ID,
  themeId: "smoke-dark",
  name: "Smoke Dark",
  metadata: { mode: "dark", supports: ["palette"] },
  provenance: "curated",
  tokens: {
    "color.canvas": "rgb(16, 20, 26)",
    "color.surface.primary": "rgb(22, 27, 34)",
    "color.surface.secondary": "rgb(30, 36, 44)",
    "color.surface.elevated": "rgb(36, 43, 52)",
    "color.text.primary": "rgb(235, 240, 246)",
    "color.text.secondary": "rgb(180, 190, 200)",
    "color.text.muted": "rgb(130, 140, 150)",
    "color.action.primary": "rgb(90, 170, 250)",
    "color.action.primaryText": "rgb(10, 20, 30)",
    "color.link": "rgb(120, 180, 250)",
    "color.border.default": "rgb(60, 70, 82)",
  },
});

const SMOKE_INVISIBLE: ThemeFile = ThemeFileSchema.parse({
  schemaVersion: THEME_SCHEMA_VERSION,
  contract: THEME_CONTRACT_ID,
  themeId: "smoke-invisible-text",
  name: "Smoke Invisible Text",
  metadata: { mode: "light", supports: ["palette"] },
  provenance: "curated",
  tokens: {
    "color.canvas": "rgb(255, 255, 255)",
    "color.text.primary": "rgb(250, 250, 250)",
  },
});

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  const fixtureRoot = path.resolve("data", `.smoke-theme-${process.pid}`);
  await rm(fixtureRoot, { recursive: true, force: true });
  const siteSpecDir = path.join(fixtureRoot, "site-specs", "fixture");
  await mkdir(siteSpecDir, { recursive: true });

  try {
    section("fixture SiteSpec → REAL reconstruction → REAL template compile");
    const siteSpecFile = await writeFixtureSiteSpec(siteSpecDir);
    const input = await loadReconstructionInput(siteSpecFile, { validate: false });
    const plan = planReconstruction(input, {});
    const reconstructionDir = path.join(fixtureRoot, "reconstructions", "fixture-run");
    const versions = await resolveDependencyVersions(process.cwd());
    await generateApp(plan, {
      outputDir: reconstructionDir,
      sourceSchemaVersion: input.siteSpec.schemaVersion,
      sourceSiteSpecVersion: input.siteSpec.siteSpecVersion,
      sourceCompilerVersion: input.siteSpec.compilerVersion,
      versions,
    });
    const templateDir = path.join(fixtureRoot, "recon-templates", "fixture-a");
    const compiled = await compileReconTemplate({
      reconstructionManifestFile: path.join(reconstructionDir, "reconstruction-manifest.json"),
      siteSpecFile,
      runId: "2026-08-18T00-00-00-000Z",
      outputDir: templateDir,
    });
    check("template compiled", compiled.manifest.counts.slots > 0);
    const template = await loadReconTemplate(path.join(templateDir, "manifest.json"));

    // ---- §37.3 token contract ----
    section("token contract (theme-contract-v1)");
    check("3 contract is closed and versioned", THEME_CONTRACT_ID === "theme-contract-v1" && THEME_TOKENS.length === 24);
    check(
      "3a contract carries the §3 common tokens",
      ["color.canvas", "color.text.primary", "color.action.primary", "decoration.radius.pill"].every((t) =>
        (THEME_TOKENS as readonly string[]).includes(t),
      ),
    );

    // ---- §37.1/§37.12 schema validation ----
    section("theme file schema validation");
    check("1 valid curated theme parses", SMOKE_COOL.themeId === "smoke-cool");
    check(
      "12 unknown token rejected",
      !ThemeFileSchema.safeParse({ ...SMOKE_COOL, tokens: { "color.bogus": "#fff" } }).success,
    );
    check(
      "1a selector-smuggling value rejected",
      !ThemeFileSchema.safeParse({ ...SMOKE_COOL, tokens: { "color.canvas": "red} .hero{color:red" } }).success,
    );
    check(
      "1b url() asset value rejected",
      !ThemeFileSchema.safeParse({ ...SMOKE_COOL, tokens: { "color.canvas": "url(https://x/y.png)" } }).success,
    );

    // ---- §37.2 original theme extraction ----
    section("original theme extraction + adapter mapping");
    const extraction = await extractSiteTheme(template);
    const { adapter, originalTheme } = extraction;
    const tokens = originalTheme.tokens;
    check("2 canvas extracted", tokens["color.canvas"] === "rgb(255, 255, 255)", tokens["color.canvas"]);
    check("2a heading → text.primary", tokens["color.text.primary"] === HEADING_COLOR, tokens["color.text.primary"]);
    check("2b body → text.secondary", tokens["color.text.secondary"] === BODY_COLOR, tokens["color.text.secondary"]);
    check("2c muted text", tokens["color.text.muted"] === MUTED_COLOR, tokens["color.text.muted"]);
    check("2d link color", tokens["color.link"] === LINK_COLOR, tokens["color.link"]);
    check("2e CTA → action.primary", tokens["color.action.primary"] === CTA_BG, tokens["color.action.primary"]);
    check(
      "2f CTA text → action.primaryText",
      tokens["color.action.primaryText"] === "rgb(255, 255, 255)",
      tokens["color.action.primaryText"],
    );
    check(
      "2g card border → border.default",
      tokens["color.border.default"] === "rgb(210, 216, 228)",
      tokens["color.border.default"],
    );
    check("2h card bg → surface.secondary", tokens["color.surface.secondary"] === CARD_BG, tokens["color.surface.secondary"]);
    check("2i pill radius", tokens["decoration.radius.pill"] === "14px", tokens["decoration.radius.pill"]);
    check("2j card radius → radius.small", tokens["decoration.radius.small"] === "8px", tokens["decoration.radius.small"]);
    check(
      "2k shadows extracted (small + large by blur)",
      tokens["decoration.shadow.small"] === ELEVATED_SHADOW && tokens["decoration.shadow.large"] === CARD_SHADOW,
      JSON.stringify([tokens["decoration.shadow.small"], tokens["decoration.shadow.large"]]),
    );
    check("2l original theme is an export candidate, never auto-promoted", originalTheme.libraryPromotion === "export-candidate");
    const extractionAgain = await extractSiteTheme(template);
    check(
      "2m extraction is deterministic (byte-identical adapter)",
      JSON.stringify(extractionAgain.adapter) === JSON.stringify(adapter),
    );

    // ---- §37.4 adapter mapping / §37.5 raw groups / §37.6 no common class ----
    const actionGroup = adapter.paintGroups.find(
      (g) => g.semanticToken === "color.action.primary" && g.property === "background-color",
    );
    check(
      "4 adapter binds token → site paint occurrence (wr-st class selector)",
      actionGroup !== undefined &&
        actionGroup.status === "themeable" &&
        actionGroup.selectors.some((s) => /^\.wr-st\d+$/.test(s)),
      JSON.stringify(actionGroup?.selectors),
    );
    const gradientGroup = adapter.paintGroups.find((g) => g.reasons.includes("background-gradient-above-color"));
    check(
      "5 gradient-covered background stays a PRESERVED raw group",
      gradientGroup !== undefined && gradientGroup.status === "preserved" && gradientGroup.semanticToken === null,
    );
    const oddGroup = adapter.paintGroups.find((g) => g.property === "color" && g.value === ODD_DARK_COLOR);
    check(
      "5a unexplained dark color stays a raw REVIEW group (no forced semantic)",
      oddGroup !== undefined && oddGroup.status === "review" && oddGroup.semanticToken === null,
      JSON.stringify(oddGroup ? [oddGroup.status, oddGroup.semanticToken] : null),
    );
    check(
      "6 adapter references ONLY reconstruction identity (no common class names)",
      adapter.paintGroups.every((g) =>
        g.selectors.every((s) => /^\.wr-(doc-)?st\d+$/.test(s) || s.startsWith("[data-wr-page=")),
      ),
    );

    // ---- §37.11 layout property mutation rejected ----
    section("structural guards");
    const evil: SiteThemeAdapter = JSON.parse(JSON.stringify(adapter)) as SiteThemeAdapter;
    evil.paintGroups[0] = {
      ...evil.paintGroups[0],
      property: "width",
      paintKind: "color",
      semanticToken: "color.canvas",
      status: "themeable",
      preservedReasons: undefined as never,
    } as never;
    let layoutRejected = false;
    try {
      generateThemeOverlay(evil, SMOKE_COOL);
    } catch (error) {
      layoutRejected = error instanceof ThemeContractError;
    }
    check("11 layout property mutation rejected by the closed allowlist", layoutRejected);

    // ---- §37.18/§37.19 compatibility gates ----
    section("compatibility gates");
    const invisible = checkThemeCompatibility(adapter, SMOKE_INVISIBLE);
    check(
      "18 contrast failure detected (near-white text on white)",
      invisible.result === "incompatible" && invisible.checks.some((c) => c.id === "contrast-failure"),
      invisible.result,
    );
    const dark = checkThemeCompatibility(adapter, SMOKE_DARK);
    check(
      "19 dark theme honestly incompatible (preserved dark text hazard)",
      dark.result === "incompatible" && dark.checks.some((c) => c.id === "dark-inversion-risk"),
      dark.result,
    );
    const cool = checkThemeCompatibility(adapter, SMOKE_COOL);
    check("19a light curated theme is applicable", cool.result !== "incompatible", cool.result);

    // ---- §37.20/§37.21 manual adapter overrides ----
    section("manual adapter overrides");
    const cardBgGroup = adapter.paintGroups.find(
      (g) => g.semanticToken === "color.surface.secondary" && g.property === "background-color",
    );
    check("surface.secondary group exists", cardBgGroup !== undefined);
    const withPreserve = await extractSiteTheme(template, {
      overrides: { preserve: [cardBgGroup!.paintGroupId] },
    });
    const preservedNow = withPreserve.adapter.paintGroups.find(
      (g) => g.paintGroupId === cardBgGroup!.paintGroupId,
    );
    const overlayPreserved = generateThemeOverlay(withPreserve.adapter, SMOKE_COOL);
    check(
      "20 manual preserve: group kept original, overlay no longer touches it",
      preservedNow?.status === "preserved" &&
        !overlayPreserved.css.includes(cardBgGroup!.selectors[0] + "{background-color"),
    );
    const withBind = await extractSiteTheme(template, {
      overrides: { bind: [{ paintGroupId: oddGroup!.paintGroupId, token: "color.accent.primary" }] },
    });
    const boundNow = withBind.adapter.paintGroups.find((g) => g.paintGroupId === oddGroup!.paintGroupId);
    const overlayBound = generateThemeOverlay(withBind.adapter, SMOKE_COOL);
    check(
      "21 manual bind: raw group joins a contract token and gets themed",
      boundNow?.status === "themeable" &&
        boundNow.semanticToken === "color.accent.primary" &&
        overlayBound.css.includes("--wr-theme-color-accent-primary"),
    );

    // ---- browser: §37.13 original no-op parity ----
    section("browser — original theme no-op parity (builds the app)");
    const originalOverlay = generateThemeOverlay(adapter, originalTheme);
    const qaRunDir = path.join(fixtureRoot, "theme-runs", "qa-original");
    await mkdir(qaRunDir, { recursive: true });
    const originalQa = await runThemeQa({
      runId: "qa-original",
      runDir: qaRunDir,
      template,
      adapter,
      theme: originalTheme,
      overlay: originalOverlay,
      routes: ["/"],
      widths: [390, 1440],
      screenshots: false,
      log: (line) => console.log("   " + line),
    });
    check("13 original theme parity: all pages pass", originalQa.pages.every((p) => p.pass));
    check(
      "13a original theme parity: DOM identical + geometry 0",
      originalQa.pages.every((p) => p.domIdentical && p.geometryDeltaMax === 0),
    );
    check(
      "13b original theme parity: computed paint equals the original values",
      originalQa.paintChecks.length > 0 && originalQa.paintChecks.every((c) => c.applied),
      `${originalQa.paintChecks.filter((c) => c.applied).length}/${originalQa.paintChecks.length}`,
    );

    // ---- browser: §37.7/8/9/10/14/15/16/22/23/24 curated theme QA ----
    section("browser — curated theme (palette + decoration)");
    const coolOverlay = generateThemeOverlay(adapter, SMOKE_COOL);
    const coolRunDir = path.join(fixtureRoot, "theme-runs", "qa-cool");
    await mkdir(coolRunDir, { recursive: true });
    const coolQa = await runThemeQa({
      runId: "qa-cool",
      runDir: coolRunDir,
      template,
      adapter,
      theme: SMOKE_COOL,
      overlay: coolOverlay,
      routes: ["/"],
      widths: [390, 1440],
      screenshots: false,
      log: (line) => console.log("   " + line),
    });
    check("14 curated theme changes paint (themed groups > 0, all verified checks applied)",
      coolQa.coverage.themedGroups > 0 && coolQa.paintChecks.length > 0 && coolQa.paintChecks.every((c) => c.applied),
      `${coolQa.paintChecks.filter((c) => c.applied).length}/${coolQa.paintChecks.length}`,
    );
    check(
      "15 static occurrence themed",
      coolQa.paintChecks.some((c) => c.surface === "static" && c.applied),
    );
    check(
      "16 dynamic-template occurrence themed (mounted menu carries the theme)",
      coolQa.paintChecks.some((c) => c.surface === "dynamic-template" && c.applied),
      JSON.stringify(coolQa.paintChecks.filter((c) => c.surface === "dynamic-template").map((c) => c.applied)),
    );
    check("22 geometry unchanged under curated theme", coolQa.pages.every((p) => p.geometryDeltaMax === 0));
    check(
      "23 interaction unchanged under curated theme",
      coolQa.interactionChecks.length > 0 && coolQa.interactionChecks.every((c) => c.equivalent),
    );
    check(
      "24 hydration-safe themed render",
      coolQa.pages.every((p) => p.jsErrors === 0 && p.hydrationErrors === 0),
    );

    // ---- browser: §37.8/9/10/17 direct computed checks + composition ----
    section("browser — border/radius/shadow + content+theme composition");
    const heroSlot = template.slotsFile.slots.find((s) => s.defaultValue === "Fixture headline");
    check("hero slot exists for composition", heroSlot !== undefined);
    const slotValuesFile = path.join(fixtureRoot, "compose-values.json");
    await writeFile(slotValuesFile, JSON.stringify({ [heroSlot!.key]: "Composed headline" }) + "\n", "utf8");
    const app = await startThemedApp({
      appDir: template.appDir,
      overlayCss: coolOverlay.css,
      slotValuesFile,
      log: () => {},
    });
    const browser = await chromium.launch();
    try {
      const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
      await page.goto(app.baseUrl + "/", { waitUntil: "load", timeout: 60_000 });
      await page.waitForTimeout(800);
      const borderSelector = cardBgGroup!.selectors.find((s) => /^\.wr-st\d+$/.test(s))!;
      const ctaGroup = adapter.paintGroups.find(
        (g) => g.semanticToken === "decoration.radius.pill" && g.property === "border-radius",
      );
      const ctaSelector = ctaGroup?.selectors.find((s) => /^\.wr-st\d+$/.test(s));
      const inspected = await page.evaluate(
        (args: { borderSelector: string; ctaSelector: string | undefined }) => {
          const card = document.querySelector(
            `.wr-variant[data-wr-viewport="desktop"] ${args.borderSelector}`,
          );
          const cta = args.ctaSelector
            ? document.querySelector(`.wr-variant[data-wr-viewport="desktop"] ${args.ctaSelector}`)
            : null;
          const h1 = document.querySelector('.wr-variant[data-wr-viewport="desktop"] h1');
          const cardStyle = card ? window.getComputedStyle(card) : null;
          return {
            borderColor: cardStyle?.borderTopColor ?? "",
            borderWidth: cardStyle?.borderTopWidth ?? "",
            borderStyle: cardStyle?.borderTopStyle ?? "",
            cardRadius: cardStyle?.borderRadius ?? "",
            cardShadow: cardStyle?.boxShadow ?? "",
            ctaRadius: cta ? window.getComputedStyle(cta).borderRadius : "",
            h1Text: h1?.textContent ?? "",
            h1Color: h1 ? window.getComputedStyle(h1).color : "",
          };
        },
        { borderSelector, ctaSelector },
      );
      check(
        "8 border COLOR themed, width/style preserved verbatim",
        inspected.borderColor === "rgb(180, 200, 190)" &&
          inspected.borderWidth === "1px" &&
          inspected.borderStyle === "solid",
        JSON.stringify(inspected),
      );
      check("9 radius themed (card 8px→3px, cta pill 14px→5px)",
        inspected.cardRadius === "3px" && inspected.ctaRadius === "5px",
        JSON.stringify([inspected.cardRadius, inspected.ctaRadius]),
      );
      check(
        "10 shadow themed",
        inspected.cardShadow.includes("rgba(10, 40, 30, 0.25)"),
        inspected.cardShadow,
      );
      check(
        "17 content + theme overlays compose (new text AND themed paint on one node)",
        inspected.h1Text === "Composed headline" && inspected.h1Color === "rgb(10, 40, 30)",
        JSON.stringify([inspected.h1Text, inspected.h1Color]),
      );
      check(
        "7 palette application (themed text color observed in browser)",
        inspected.h1Color === "rgb(10, 40, 30)",
      );
      await page.close();
    } finally {
      await browser.close();
      await app.stop();
    }
  } finally {
    await rm(fixtureRoot, { recursive: true, force: true });
  }

  console.log(`\n${checks - failures}/${checks} checks passed`);
  if (failures > 0) {
    process.exitCode = 1;
  }
}

main().catch((err) => {
  console.error("[smoke:theme] ERROR —", err);
  process.exitCode = 1;
});
