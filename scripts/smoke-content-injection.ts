import { mkdir, rm, writeFile, readFile } from "node:fs/promises";
import path from "node:path";
import { chromium } from "playwright";
import { startApp } from "../src/recon-template/parity-qa.js";
import {
  SiteSpecSchema,
  StyleCatalogSchema,
  AssetCatalogSchema,
  InteractionSpecSchema,
  PageSpecSchema,
  type SpecNode,
  type ElementSpecNode,
  type PageSpec,
} from "../src/sitespec/index.js";
import {
  generateApp,
  loadReconstructionInput,
  planReconstruction,
  resolveDependencyVersions,
} from "../src/reconstruction/index.js";
import { compileReconTemplate } from "../src/recon-template/index.js";
import {
  CONTENT_POLICY,
  ContentIntentSchema,
  ContentPolicySchema,
  ContentValidationError,
  FakeContentGenerator,
  buildRepairRequest,
  detectSourceBrandLeaks,
  ingestGenerationResult,
  intentHash,
  loadContentRun,
  mergeRepairValues,
  prepareContentRun,
  revalidateSlotValues,
  runContentLayoutQa,
  unitsForRepair,
  validateSlotAssignments,
  type ContentUnit,
} from "../src/content-injection/index.js";

/**
 * Task 19 smoke — Natural Language Content Injection Foundation.
 *
 * The same synthetic two-page site as the Task 18 smoke (extended with a
 * 16-sibling review list and a nowrap/hidden badge for deterministic overflow)
 * goes through the REAL reconstruction generator and the REAL template
 * compiler; then the Task 19 chain runs against that real template artifact:
 *
 *   packet   §1 intent schema · §2 policy load · §3 unit grouping · §4 CTA
 *            unit · §5 navigation unit · §7 review slots listed not written
 *   validate §8 unknown slot · §9 HTML injection · §10 javascript: URL ·
 *            §11 needs-input · review write rejected
 *   generate §6 global slot once · §12 image brief without mutation ·
 *            brand-leak warning on untouched default
 *   browser  §13 static overlay · §14 dynamic-template overlay · §15
 *            multi-binding propagation · §16 no-overflow pass · §17
 *            intentional overflow detected · §18 repair loop (bounded, fake
 *            provider) · §19 manual edits revalidate · §20 hydration-safe
 *            injected render
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
// Fixture SiteSpec (Task 18 smoke fixture + review list + overflow badge)
// ---------------------------------------------------------------------------

const ROOT_URL = "https://fixture-content-injection.example/";

interface B {
  tag?: string;
  text?: string;
  attrs?: Record<string, string>;
  styleToken?: string;
  assetRefs?: string[];
  /** Explicit y pins a box (paint-twin overlap evidence needs shared pixels). */
  bbox?: { width: number; height: number; y?: number };
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
      effectiveVisible: b.attrs?.["aria-hidden"] === "true" ? false : true,
      boundingBox: (() => {
        const boxY = b.bbox?.y ?? (y += 10);
        const width = b.bbox?.width ?? Math.min(viewportWidth, 800);
        const height = b.bbox?.height ?? 20;
        return { x: 0, y: boxY, width, height, top: boxY, right: width, bottom: boxY + height, left: 0 };
      })(),
      styleTokenId: b.styleToken,
      assetRefs: b.assetRefs ?? [],
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
    { styleToken: "st000003" },
    el("a", { attrs: { href: "/" } }, tx("Fixture")),
    el(
      "nav",
      {},
      el("a", { attrs: { href: "/about" }, styleToken: "st000003" }, tx("About")),
      // Task 19.1: a pill whose glyphs are painted BOTH as a DOM label and as
      // an SVG cutout-mask <text> under the SAME anchor host (Stripe "Sign in"
      // shape) → one logical slot, DOM text + svg-text bindings.
      el(
        "a",
        { attrs: { href: "/portal" }, styleToken: "st000003" },
        el("span", {}, tx("Portal")),
        el("svg", { assetRefs: ["a000003"], bbox: { width: 80, height: 24 } }),
      ),
      el(
        "button",
        { attrs: { "aria-expanded": "false", type: "button" }, styleToken: "st000003" },
        tx("Menu"),
      ),
    ),
  );
}

/** Footer with a 16-sibling uniform list → review-flagged slots (Task 18 rule). */
function footerB(): B {
  const listLinks: B[] = [];
  for (let i = 1; i <= 16; i++) {
    listLinks.push(el("a", { attrs: { href: `/list-${i}` } }, tx(`List item ${i}`)));
  }
  return el(
    "footer",
    {},
    el("p", {}, tx("© Fixture Inc")),
    el("div", {}, ...listLinks),
  );
}

function homeBody(): B {
  return el(
    "body",
    {},
    headerB(),
    el(
      "main",
      {},
      el(
        "section",
        { styleToken: "st000003" },
        el(
          "div",
          {},
          el("h1", { styleToken: "st000001", bbox: { width: 600, height: 64 } }, tx("Fixture headline")),
          el(
            "p",
            { styleToken: "st000001", bbox: { width: 600, height: 96 } },
            tx("Start with "),
            el("strong", {}, tx("Fixture")),
            tx(" today"),
          ),
          el("a", { attrs: { href: "/signup" }, styleToken: "st000003" }, tx("Get started")),
        ),
        el("img", {
          attrs: { alt: "Fixture visual" },
          styleToken: "st000002",
          assetRefs: ["a000001", "a000002"],
          bbox: { width: 640, height: 480 },
        }),
      ),
      el("p", {}, tx("Shared tagline")),
      // Deterministic clipping probe: fixed width, nowrap, overflow hidden.
      el("p", { styleToken: "st000004", bbox: { width: 200, height: 20 } }, tx("Badge line")),
      // Stale-twin probe: the same string exists once as a slotted visible
      // text and once inside an (unslotted) aria-hidden subtree. The boxes do
      // NOT overlap, so Task 19.1 co-binding must refuse it and the stale-twin
      // detector must keep firing (fixture §15.4).
      el("p", {}, tx("Twin text line")),
      el("div", { attrs: { "aria-hidden": "true" } }, el("span", {}, tx("Twin text line"))),
      // Task 19.1 painted twin (fixture §15.1/§15.3): visible heading + an
      // aria-hidden effect copy on the SAME pixels — pixel-identical observed
      // boxes + sibling ancestry = deterministic co-binding evidence.
      el(
        "div",
        {},
        el("h2", { styleToken: "st000001", bbox: { width: 600, height: 40, y: 700 } }, tx("Painted twin heading")),
        el(
          "h2",
          { attrs: { "aria-hidden": "true" }, styleToken: "st000001", bbox: { width: 600, height: 40, y: 700 } },
          tx("Painted twin heading"),
        ),
      ),
      // Task 19.1 aria-hidden decorative text with NO visible counterpart —
      // must stay excluded entirely (fixture §15.2).
      el("div", { attrs: { "aria-hidden": "true" } }, el("span", {}, tx("Pure decorative flourish"))),
      // Task 19.1 FAR duplicate (mockup shape): an aria-hidden copy of the
      // FOOTER text inside MAIN — different landmark section, non-overlapping
      // box → never co-bound, and the QA downgrades it to a non-failing
      // stale-duplicate REMNANT instead of a desync.
      el("div", { attrs: { "aria-hidden": "true" } }, el("span", {}, tx("© Fixture Inc"))),
      // Task 19.1 standalone visible SVG text with gradient paint (§15.5/§15.7/§15.9)
      // plus an unreferenced defs run that must be excluded (§15.6).
      el("svg", { assetRefs: ["a000004"], bbox: { width: 200, height: 40 } }),
      // Decorative aria-hidden SVG text — excluded (§15.6).
      el("svg", { attrs: { "aria-hidden": "true" }, assetRefs: ["a000005"], bbox: { width: 100, height: 20 } }),
    ),
    footerB(),
  );
}

function aboutBody(): B {
  return el(
    "body",
    {},
    headerB(),
    el(
      "main",
      {},
      el("h1", { styleToken: "st000001" }, tx("About fixture")),
      el("p", {}, tx("Shared tagline")),
    ),
    footerB(),
  );
}

function pageSpec(pageId: string, url: string, familyId: string, body: B, explored: boolean): PageSpec {
  const doc = el("html", { attrs: { lang: "en" } }, body);
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
        documentHeight: 1200,
        scrollWidth: width,
        scrollHeight: 1200,
      },
      contentRecovery: {
        status: "aligned" as const,
        source: "rendered-html" as const,
        parsedElementCount: tree.elementCount,
        sourceElementCount: tree.elementCount,
        textNodeCount: tree.textCount,
        cappedSourceTextCount: 0,
        recoveredLongTextCount: 0,
        longestTextLength: 20,
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
      styleTokenCount: 4,
      assetRefs: pageId === "p000001" ? ["a000001", "a000002", "a000003", "a000004", "a000005"] : [],
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

  const triggerId = findNode(
    home,
    "desktop",
    (node) => node.type === "element" && node.tagName === "button",
  );
  const bodyId = findNode(home, "desktop", (node) => node.type === "element" && node.tagName === "body");

  const styleCatalog = StyleCatalogSchema.parse({
    schemaVersion: 4,
    tokenCount: 4,
    sourceStyleReferenceCount: 14,
    sourceLocalStyleRecordCount: 14,
    dedupReductionRate: 0.7,
    styles: [
      {
        styleTokenId: "st000001",
        properties: {
          color: "rgb(10, 20, 30)",
          "line-height": "32px",
          overflow: "visible",
          "white-space": "normal",
        },
        usageCount: 4,
      },
      {
        styleTokenId: "st000002",
        properties: { "object-fit": "cover", "object-position": "50% 50%" },
        usageCount: 2,
      },
      {
        styleTokenId: "st000003",
        properties: { color: "rgb(40, 50, 60)", display: "block" },
        usageCount: 6,
      },
      {
        styleTokenId: "st000004",
        properties: {
          display: "block",
          width: "200px",
          "white-space": "nowrap",
          overflow: "hidden",
          "line-height": "20px",
        },
        usageCount: 2,
      },
    ],
    frequency: { color: [], backgroundColor: [], fontFamily: [], fontSize: [] },
  });

  // Task 19.1 inline SVGs: a cutout-mask pill label (the Stripe "Sign in"
  // shape — the <text> paints THROUGH a referenced mask), a standalone badge
  // with gradient paint + an unreferenced defs run, and a decorative one.
  const pillSvg =
    '<svg viewBox="0 0 80 24"><defs><mask id="pillMask">' +
    '<rect x="0" y="0" width="100%" height="100%" fill="white"></rect>' +
    '<text x="50%" y="50%" dominant-baseline="central" text-anchor="middle" fill="black">Portal</text>' +
    '</mask></defs>' +
    '<rect x="0" y="0" width="100%" height="100%" fill="#635bff" mask="url(#pillMask)"></rect></svg>';
  const badgeSvg =
    '<svg viewBox="0 0 200 40"><defs>' +
    '<linearGradient id="awardGrad"><stop offset="0" stop-color="#ffd700"></stop>' +
    '<stop offset="1" stop-color="#ff8c00"></stop></linearGradient>' +
    "<text>Unused defs text</text></defs>" +
    '<text x="8" y="26" fill="url(#awardGrad)" stroke="#331100">Award badge</text></svg>';
  // aria-hidden lives IN the markup: the svg-host compile path keeps only the
  // clone's own root attributes, so hiddenness travels with the captured svg
  // (exactly what a real observation records on the outerHTML).
  const decorSvg =
    '<svg viewBox="0 0 100 20" aria-hidden="true"><text x="0" y="14">Decor label</text></svg>';

  const assetCatalog = AssetCatalogSchema.parse({
    schemaVersion: 4,
    assetCount: 5,
    occurrenceCount: 7,
    kindCounts: { image: 1, "image-srcset": 1, "inline-svg": 3 },
    assets: [
      {
        assetId: "a000001",
        kind: "image",
        url: "https://assets.fixture.invalid/visual.png",
        mimeHint: "image/png",
        sameOrigin: false,
        usageCount: 2,
        sourcePageIds: ["p000001"],
      },
      {
        assetId: "a000002",
        kind: "image-srcset",
        url: "https://assets.fixture.invalid/visual@2x.png",
        descriptor: "2x",
        mimeHint: "image/png",
        sameOrigin: false,
        usageCount: 2,
        sourcePageIds: ["p000001"],
      },
      {
        assetId: "a000003",
        kind: "inline-svg",
        inlineSvg: { markup: pillSvg, sanitized: true, removed: [] },
        usageCount: 2,
        sourcePageIds: ["p000001"],
      },
      {
        assetId: "a000004",
        kind: "inline-svg",
        inlineSvg: { markup: badgeSvg, sanitized: true, removed: [] },
        usageCount: 2,
        sourcePageIds: ["p000001"],
      },
      {
        assetId: "a000005",
        kind: "inline-svg",
        inlineSvg: { markup: decorSvg, sanitized: true, removed: [] },
        usageCount: 2,
        sourcePageIds: ["p000001"],
      },
    ],
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
        styleTokenId: "st000003",
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
        attributes: { href: "/pricing" },
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
        text: "Pricing",
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
        transition: {
          direction: "closed-to-open",
          field: "aria-expanded",
          before: "false",
          after: "true",
        },
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
            textSample: "About Pricing",
            textLength: 12,
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
      desktopTextNodeCount:
        home.viewports.desktop.textNodeCount + about.viewports.desktop.textNodeCount,
      mobileTextNodeCount:
        home.viewports.mobile.textNodeCount + about.viewports.mobile.textNodeCount,
      effectiveVisibleElementCount: 80,
      hiddenElementCount: 0,
      viewportCount: 4,
      alignedViewportCount: 4,
      fallbackViewportCount: 0,
      cappedSourceTextCount: 0,
      recoveredLongTextCount: 0,
      supplementalAttributeCount: 0,
      supplementalElementCount: 0,
      supplementalAttributeNameCounts: {},
      styleTokenCount: 4,
      assetCount: 5,
      frameCount: 0,
      shadowHostCount: 0,
    },
    provenanceSummary: {
      observedFactCount: 100,
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
        desktopDocumentHeight: 1200,
        mobileDocumentHeight: 1200,
      },
      {
        pageId: "p000002",
        desktopElementNodes: about.viewports.desktop.elementNodeCount,
        mobileElementNodes: about.viewports.mobile.elementNodeCount,
        desktopTextNodes: about.viewports.desktop.textNodeCount,
        mobileTextNodes: about.viewports.mobile.textNodeCount,
        desktopEffectiveVisible: about.viewports.desktop.effectiveVisibleCount,
        mobileEffectiveVisible: about.viewports.mobile.effectiveVisibleCount,
        desktopDocumentHeight: 1200,
        mobileDocumentHeight: 1200,
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
// Main
// ---------------------------------------------------------------------------

const INTENT =
  "이 사이트를 기업용 AI 업무자동화 솔루션 회사 사이트로 재구성한다. 주 고객은 중소기업 운영팀이다. 메인 행동은 상담 문의다.";

async function main(): Promise<void> {
  const fixtureRoot = path.resolve("data", `.smoke-content-injection-${process.pid}`);
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
    const manifestFile = path.join(reconstructionDir, "reconstruction-manifest.json");
    const templateDir = path.join(fixtureRoot, "recon-templates", "fixture-a");
    const compiled = await compileReconTemplate({
      reconstructionManifestFile: manifestFile,
      siteSpecFile,
      runId: "2026-08-18T00-00-00-000Z",
      outputDir: templateDir,
    });
    check("template compiled", compiled.manifest.counts.slots > 0);
    check(
      "fixture yields review slots (16-sibling list)",
      compiled.manifest.counts.reviewSlots >= 16,
      String(compiled.manifest.counts.reviewSlots),
    );

    section("Task 19.1 — paint-twin co-binding + svg-text (compile level)");
    const tplSlots = (JSON.parse(await readFile(path.join(templateDir, "slots.json"), "utf8")) as {
      slots: { id: string; key: string; role: string; defaultValue: unknown; evidence: string[] }[];
    }).slots;
    const tplBindings = (JSON.parse(
      await readFile(path.join(templateDir, "slot-bindings.json"), "utf8"),
    ) as { bindings: { slotId: string; surface: string; target: string; bindingId: string; expectedValue: string }[] }).bindings;
    const bindingsOf = (slotId: string) => tplBindings.filter((b) => b.slotId === slotId);
    check(
      "19.1 manifest counts paint-twin + svg-text bindings",
      // twin heading: 2 (desktop+mobile). svg-text: Portal is a GLOBAL header
      // slot (2 pages × 2 viewports = 4) + Award badge (home ×2) = 6.
      compiled.manifest.counts.paintTwinBindings === 2 && compiled.manifest.counts.svgTextBindings === 6,
      JSON.stringify([compiled.manifest.counts.paintTwinBindings, compiled.manifest.counts.svgTextBindings]),
    );
    const twinHead = tplSlots.find((s) => s.defaultValue === "Painted twin heading");
    const twinHeadBindings = twinHead ? bindingsOf(twinHead.id) : [];
    check(
      "19.1.1 exact painted twin co-bound (2 static + 2 paint-twin, one slot)",
      twinHead !== undefined &&
        twinHeadBindings.filter((b) => b.surface === "static").length === 2 &&
        twinHeadBindings.filter((b) => b.surface === "paint-twin").length === 2 &&
        twinHead.evidence.some((e) => e.startsWith("paint-twin-cobound:")),
      JSON.stringify(twinHeadBindings.map((b) => b.surface)),
    );
    check(
      "19.1.2 aria-hidden decorative text stays excluded (no slot, no co-bind)",
      !tplSlots.some((s) => s.defaultValue === "Pure decorative flourish"),
    );
    const twinLine = tplSlots.find((s) => s.defaultValue === "Twin text line");
    check(
      "19.1.4a non-overlapping aria-hidden duplicate NOT co-bound (boxes apart)",
      twinLine !== undefined && bindingsOf(twinLine.id).every((b) => b.surface !== "paint-twin"),
      JSON.stringify(twinLine ? bindingsOf(twinLine.id).map((b) => b.surface) : []),
    );
    const portalSlots = tplSlots.filter((s) => s.defaultValue === "Portal");
    const portalBindings = portalSlots.length === 1 ? bindingsOf(portalSlots[0].id) : [];
    check(
      "19.1.8 DOM text + svg text of the same anchor = ONE slot, multi-binding",
      // Global header slot: (home + about) × (desktop + mobile) per representation.
      portalSlots.length === 1 &&
        portalBindings.filter((b) => b.target === "text").length === 4 &&
        portalBindings.filter((b) => b.target === "svg-text").length === 4,
      JSON.stringify(portalBindings.map((b) => b.target)),
    );
    const award = tplSlots.find((s) => s.defaultValue === "Award badge");
    check(
      "19.1.5 visible svg text (gradient-painted, mask-referenced defs ok) is a slot",
      award !== undefined && award.key.includes(".svg.") && award.role === "content.text",
      award?.key,
    );
    check(
      "19.1.6 hidden svg text + unreferenced defs text excluded",
      !tplSlots.some((s) => s.defaultValue === "Decor label") &&
        !tplSlots.some((s) => s.defaultValue === "Unused defs text"),
    );
    check(
      "19.1 default content remains an exact no-op over ALL new binding types",
      compiled.validation.defaultNoOpBindings === compiled.validation.bindings &&
        compiled.validation.resolvedBindings === compiled.validation.bindings,
      JSON.stringify(compiled.validation),
    );

    section("§1/§2 content:prepare — intent schema + policy artifact");
    const runDir = path.join(fixtureRoot, "content-runs", "run-a");
    const prepared = await prepareContentRun({
      templateManifestFile: path.join(templateDir, "manifest.json"),
      rawIntent: INTENT,
      routes: ["/"],
      runId: "2026-08-18T00-00-00-000Z",
      outputDir: runDir,
    });
    const intentOnDisk = ContentIntentSchema.parse(
      JSON.parse(await readFile(path.join(runDir, "intent.json"), "utf8")),
    );
    check("§1 raw intent preserved verbatim", intentOnDisk.rawIntent === INTENT);
    check("§1 intent schema roundtrips (versioned)", intentOnDisk.schemaVersion === 1);
    check("§1 manifest records intent hash", prepared.manifest.intentHash === intentHash(INTENT));
    const policyOnDisk = ContentPolicySchema.parse(
      JSON.parse(await readFile(path.join(runDir, "content-policy.json"), "utf8")),
    );
    check("§2 content policy loads as content-policy-v1", policyOnDisk.policyId === "content-policy-v1");
    check("§2 policy matches the canonical constant", JSON.stringify(policyOnDisk) === JSON.stringify(CONTENT_POLICY));

    section("§3–§5/§7 deterministic content units");
    const units = prepared.units.units;
    const unitOf = (key: string): ContentUnit | undefined =>
      units.find((u) => u.slots.some((s) => s.key === key));
    const heroUnit = units.find((u) => u.kind === "hero");
    check("§3 hero unit exists", heroUnit !== undefined);
    check(
      "§3 hero unit groups headline + description slots",
      heroUnit !== undefined &&
        heroUnit.slots.some((s) => s.role === "hero.headline") &&
        heroUnit.slots.some((s) => s.role === "hero.description") &&
        heroUnit.slots.length >= 2,
      JSON.stringify(heroUnit?.slots.map((s) => s.key)),
    );
    const ctaUnit = units.find((u) => u.kind === "cta");
    check("§4 CTA unit exists", ctaUnit !== undefined);
    check(
      "§4 CTA unit holds label + href as one writing unit",
      ctaUnit !== undefined &&
        ctaUnit.slots.some((s) => s.type === "text") &&
        ctaUnit.slots.some((s) => s.type === "url" && s.urlKind === "internal"),
      JSON.stringify(ctaUnit?.slots.map((s) => [s.key, s.type])),
    );
    const navUnits = units.filter((u) => u.kind === "navigation");
    check("§5 navigation units exist", navUnits.length >= 1, String(navUnits.length));
    const aboutNav = navUnits.find((u) => u.slots.some((s) => s.currentValue === "About"));
    check(
      "§5 About nav item is one unit with label + href",
      aboutNav !== undefined &&
        aboutNav.slots.length === 2 &&
        aboutNav.slots.some((s) => s.type === "url" && s.currentValue === "/about"),
      JSON.stringify(aboutNav?.slots.map((s) => s.key)),
    );
    check(
      "§7 review slots listed, not turned into units",
      prepared.units.reviewSlotKeys.length >= 16 &&
        prepared.units.reviewSlotKeys.every((key) => unitOf(key) === undefined),
      String(prepared.units.reviewSlotKeys.length),
    );
    check(
      "unit ids deterministic and 1-based",
      units[0]?.unitId === "cu000001" && new Set(units.map((u) => u.unitId)).size === units.length,
    );

    section("§8–§11 deterministic validator");
    const run = await loadContentRun(runDir);
    const heroKey = heroUnit!.slots.find((s) => s.role === "hero.headline")!.key;
    const aboutHrefKey = aboutNav!.slots.find((s) => s.type === "url")!.key;
    const vUnknown = validateSlotAssignments(
      run.template, run.unitsFile,
      { "home.totally.unknown.slot": "x" }, [], { "home.totally.unknown.slot": "generated-marketing" }, [],
    );
    check(
      "§8 unknown slot key rejected (not silently ignored)",
      !vUnknown.pass && vUnknown.errors.some((e) => e.code === "unknown-slot-key"),
    );
    const vHtml = validateSlotAssignments(
      run.template, run.unitsFile,
      { [heroKey]: "<script>alert(1)</script>" }, [], { [heroKey]: "generated-marketing" }, [],
    );
    check("§9 HTML injection rejected", !vHtml.pass && vHtml.errors.some((e) => e.code === "html-injection"));
    const vJs = validateSlotAssignments(
      run.template, run.unitsFile,
      { [aboutHrefKey]: "JaVaScRiPt:alert(1)" }, [], { [aboutHrefKey]: "derived-copy" }, [],
    );
    check(
      "§10 javascript: URL rejected (case/obfuscation tolerant)",
      !vJs.pass && vJs.errors.some((e) => e.code === "forbidden-url-scheme"),
    );
    const vNeedsInput = validateSlotAssignments(
      run.template, run.unitsFile,
      {}, [{ slotKey: heroKey, reason: "needs factual input" }], {}, [],
    );
    check("§11 needs-input accepted as a first-class state", vNeedsInput.pass);
    const reviewKey = prepared.units.reviewSlotKeys[0];
    const vReview = validateSlotAssignments(
      run.template, run.unitsFile,
      { [reviewKey]: "rewrite attempt" }, [], { [reviewKey]: "generated-marketing" }, [],
    );
    check(
      "review slot write rejected without opt-in",
      !vReview.pass && vReview.errors.some((e) => e.code === "review-slot-not-writable"),
    );

    section("§6/§12 fake provider generation + ingest");
    const fake = new FakeContentGenerator();
    const result = await fake.generate({
      mode: "initial",
      intent: run.intent,
      policy: CONTENT_POLICY,
      units: run.unitsFile.units,
      request: run.request,
    });
    const footerUnit = units.filter((u) => u.slots.some((s) => s.currentValue === "© Fixture Inc"));
    check("§6 global footer slot appears in exactly one unit", footerUnit.length === 1);
    const footerKey = footerUnit[0].slots[0].key;
    check(
      "§6 global slot generated once (one value for all bindings)",
      typeof result.slotValues[footerKey] === "string",
    );
    const imageUnit = units.find((u) => u.kind === "image");
    const imageKey = imageUnit?.slots[0].key;
    check(
      "§12 image brief emitted without mutating the image value",
      imageKey !== undefined &&
        result.imageBriefs.some((b) => b.slotKey === imageKey && b.action === "keep-default") &&
        result.slotValues[imageKey] === undefined,
    );
    const outcome = await ingestGenerationResult(run, result);
    check("generation result validates and becomes the overlay", outcome.validation.pass);
    check(
      "overlay written with changed values",
      outcome.changed.size > 0 &&
        JSON.parse(await readFile(path.join(runDir, "slot-values.json"), "utf8"))[heroKey] !== undefined,
    );
    const brandLeak = JSON.parse(await readFile(path.join(runDir, "report", "brand-leak.json"), "utf8")) as {
      warnings: { kind: string; slotKey: string }[];
    };
    check(
      "source-brand-leak warning on untouched default (image alt/src)",
      brandLeak.warnings.some((w) => w.kind === "brand-token-in-untouched-default"),
      JSON.stringify(brandLeak.warnings.slice(0, 3)),
    );
    check(
      "operator review generated",
      (await readFile(path.join(runDir, "report", "operator-review.md"), "utf8")).includes("Operator Review"),
    );
    // 19.1 §13: a user-targeted slot kept at its default by an ENGINE
    // limitation escalates to blocker severity, distinct from ordinary
    // kept-default warnings.
    {
      const effective = new Map(
        run.template.slotsFile.slots.map((s) => [s.key, s.defaultValue] as const),
      );
      const blockedLeak = detectSourceBrandLeaks(
        run.template,
        run.unitsFile,
        effective,
        new Set(),
        new Set([heroKey]),
      );
      const blocker = blockedLeak.warnings.find((w) => w.slotKey === heroKey);
      check(
        "19.1 §13 engine-blocked slot reported as blocked-visible-source-content (blocker)",
        blocker !== undefined &&
          blocker.kind === "blocked-visible-source-content" &&
          blocker.severity === "blocker",
        JSON.stringify(blocker),
      );
    }

    // The fixture's twin-probe slot cannot be safely injected (its aria-hidden
    // duplicate is unslotted) — the operator reverts it before the clean QA
    // run; the DETECTION of exactly this case is exercised in §17 below.
    const twinSlot = run.template.slotsFile.slots.find((s) => s.defaultValue === "Twin text line");
    check("twin probe slot exists (visible copy slotted)", twinSlot !== undefined);
    {
      const overlay0 = JSON.parse(await readFile(path.join(runDir, "slot-values.json"), "utf8")) as Record<string, unknown>;
      delete overlay0[twinSlot!.key];
      await writeFile(path.join(runDir, "slot-values.json"), JSON.stringify(overlay0, null, 2) + "\n", "utf8");
    }

    section("§13–§16/§20 live half: injected render + layout safety QA");
    const run2 = await loadContentRun(runDir);
    const qaOptions = {
      runId: run2.manifest.runId,
      runDir: run2.runDir,
      template: run2.template,
      slotValuesFile: path.join(runDir, "slot-values.json"),
      routes: ["/"],
      log: (line: string) => console.log(`  ${line}`),
    };
    const report1 = await runContentLayoutQa(qaOptions);
    check("§16 layout QA passes with reference-shaped content", report1.pass, JSON.stringify(report1.pages.filter((p) => !p.pass).map((p) => p.notes)));
    const heroApplied = report1.appliedChecks.filter((c) => c.slotKey === heroKey);
    check(
      "§13 static slot overlay applied (hero, desktop + mobile)",
      heroApplied.length === 2 && heroApplied.every((c) => c.applied),
      JSON.stringify(heroApplied),
    );
    const pricingUnit = units.find((u) => u.slots.some((s) => s.currentValue === "Pricing"));
    const pricingLabelKey = pricingUnit?.slots.find((s) => s.type === "text")?.key;
    const pricingApplied = report1.appliedChecks.filter((c) => c.slotKey === pricingLabelKey);
    check(
      "§14 dynamic-template overlay applied inside the mounted region",
      pricingApplied.length >= 1 &&
        pricingApplied.every((c) => c.applied) &&
        pricingApplied.some((c) => c.surface === "dynamic-template"),
      JSON.stringify(pricingApplied),
    );
    const aboutLabelKey = aboutNav!.slots.find((s) => s.type === "text")!.key;
    const aboutApplied = report1.appliedChecks.filter((c) => c.slotKey === aboutLabelKey);
    check(
      "§15 multi-binding propagation (static ×2 + dynamic ×1 on scoped route)",
      aboutApplied.length === 3 &&
        aboutApplied.every((c) => c.applied) &&
        new Set(aboutApplied.map((c) => c.surface)).size === 2,
      JSON.stringify(aboutApplied.map((c) => [c.surface, c.viewport, c.applied])),
    );
    check(
      "§20 hydration errors 0 on injected render",
      report1.pages.every((p) => p.injectedHydrationErrors === 0),
    );
    check(
      "runtime errors 0 on injected render",
      report1.pages.every((p) => p.injectedJsErrors === 0),
    );
    check(
      "interaction regression equivalent (menu still opens)",
      report1.interactionChecks.length >= 1 && report1.interactionChecks.every((i) => i.equivalent),
      JSON.stringify(report1.interactionChecks),
    );
    check("screenshots captured (default + injected)", report1.screenshots.length >= 4, String(report1.screenshots.length));

    section("Task 19.1 — twin/svg mutation propagation + paint integrity (browser)");
    const overlayAfterIngest = JSON.parse(await readFile(path.join(runDir, "slot-values.json"), "utf8")) as Record<string, string>;
    const twinHeadKey = twinHead!.key;
    const portalKey = portalSlots[0].key;
    const awardKey = award!.key;
    const twinHeadApplied = report1.appliedChecks.filter((c) => c.slotKey === twinHeadKey);
    check(
      "19.1.3 twin mutation propagates: visible AND paint-twin occurrences applied",
      twinHeadApplied.length === 4 &&
        twinHeadApplied.every((c) => c.applied) &&
        twinHeadApplied.filter((c) => c.surface === "paint-twin").length === 2,
      JSON.stringify(twinHeadApplied.map((c) => [c.surface, c.applied])),
    );
    check(
      "19.1.3b synchronized twin passes the stale-twin detector (no desync)",
      !report1.repairCandidates.some((c) => c.slotKey === twinHeadKey),
      JSON.stringify(report1.repairCandidates),
    );
    check(
      "19.1.4b far-section duplicate is a NON-FAILING remnant (mockup shape)",
      report1.pass &&
        report1.repairCandidates.some(
          (c) => c.slotKey === footerKey && c.reason === "stale-duplicate-text-remnant",
        ),
      JSON.stringify(report1.repairCandidates),
    );
    const svgBindingIds = new Set(
      tplBindings.filter((b) => b.target === "svg-text").map((b) => b.bindingId),
    );
    const portalApplied = report1.appliedChecks.filter((c) => c.slotKey === portalKey);
    check(
      "19.1.7/19.1.8 svg-text mutation applied on the co-bound anchor slot (4/4)",
      portalApplied.length === 4 &&
        portalApplied.every((c) => c.applied) &&
        portalApplied.filter((c) => svgBindingIds.has(c.bindingId)).length === 2,
      JSON.stringify(portalApplied.map((c) => [c.bindingId, c.applied])),
    );
    const awardApplied = report1.appliedChecks.filter((c) => c.slotKey === awardKey);
    check(
      "19.1.7 standalone svg text slot mutation applied (desktop + mobile)",
      awardApplied.length === 2 && awardApplied.every((c) => c.applied),
      JSON.stringify(awardApplied),
    );

    // §15.9: paint must be untouched — inspect the injected render directly.
    {
      const injectedApp2 = await startApp(path.join(templateDir, "app"), {
        WR_SLOT_VALUES_FILE: path.join(runDir, "slot-values.json"),
      });
      const browser = await chromium.launch();
      try {
        const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
        await page.goto(injectedApp2.baseUrl + "/", { waitUntil: "load" });
        await page.waitForTimeout(800);
        const paint = await page.evaluate(`(() => {
          const variant = document.querySelector('.wr-variant[data-wr-viewport="desktop"]');
          const grad = variant.querySelector("linearGradient#awardGrad");
          const awardText = variant.querySelector('text[fill="url(#awardGrad)"]');
          const maskRect = variant.querySelector('rect[mask="url(#pillMask)"]');
          const maskText = variant.querySelector("mask#pillMask text");
          const defsTexts = [...variant.querySelectorAll("defs > text")].map((t) => t.textContent);
          return {
            gradStops: grad ? grad.querySelectorAll("stop").length : 0,
            awardFill: awardText ? awardText.getAttribute("fill") : null,
            awardStroke: awardText ? awardText.getAttribute("stroke") : null,
            awardValue: awardText ? awardText.textContent : null,
            maskRectFill: maskRect ? maskRect.getAttribute("fill") : null,
            maskTextValue: maskText ? maskText.textContent : null,
            defsTexts,
          };
        })()`) as {
          gradStops: number;
          awardFill: string | null;
          awardStroke: string | null;
          awardValue: string | null;
          maskRectFill: string | null;
          maskTextValue: string | null;
          defsTexts: (string | null)[];
        };
        check(
          "19.1.9 svg paint unchanged after text mutation (gradient/fill/stroke/mask)",
          paint.gradStops === 2 &&
            paint.awardFill === "url(#awardGrad)" &&
            paint.awardStroke === "#331100" &&
            paint.maskRectFill === "#635bff",
          JSON.stringify(paint),
        );
        check(
          "19.1.7b new svg text values actually render in the SVG layer",
          paint.awardValue === overlayAfterIngest[awardKey] &&
            paint.maskTextValue === overlayAfterIngest[portalKey],
          JSON.stringify([paint.awardValue, paint.maskTextValue, overlayAfterIngest[awardKey], overlayAfterIngest[portalKey]]),
        );
        check(
          "19.1.6b unreferenced defs text run untouched by injection",
          paint.defsTexts.includes("Unused defs text"),
          JSON.stringify(paint.defsTexts),
        );
      } finally {
        await browser.close();
        await injectedApp2.stop();
      }
    }

    section("§17–§19 manual edit → overflow detection → bounded repair");
    const badgeSlot = run2.template.slotsFile.slots.find((s) => s.defaultValue === "Badge line");
    check("badge slot exists", badgeSlot !== undefined);
    const badgeKey = badgeSlot!.key;
    const overlayFile = path.join(runDir, "slot-values.json");
    const overlayNow = JSON.parse(await readFile(overlayFile, "utf8")) as Record<string, unknown>;
    const ctaHrefKey = ctaUnit!.slots.find((s) => s.type === "url")!.key;
    overlayNow[badgeKey] =
      "An intentionally enormous unbreakable line of injected content that cannot possibly fit inside a two hundred pixel nowrap box without clipping";
    overlayNow[ctaHrefKey] = "/about";
    overlayNow[twinSlot!.key] = "New twin value";
    await writeFile(overlayFile, JSON.stringify(overlayNow, null, 2) + "\n", "utf8");

    const run3 = await loadContentRun(runDir);
    const manualOutcome = await revalidateSlotValues(run3);
    check("§19 manually edited slot-values revalidate (no LLM call)", manualOutcome.validation.pass);
    check("§19 manual edits detected in manifest", run3.manifest.manualEdits === true);

    const report2 = await runContentLayoutQa(qaOptions);
    check("§17 intentional overflow makes layout QA FAIL", !report2.pass);
    const badgeObs = report2.slotObservations.filter((o) => o.slotKey === badgeKey);
    check(
      "§17 clipping detected on the overflowing slot",
      badgeObs.some((o) => o.clippedHorizontally),
      JSON.stringify(badgeObs),
    );
    check(
      "§18 repair candidate identified with evidence",
      report2.repairCandidates.some((c) => c.slotKey === badgeKey && c.evidence.length > 0),
      JSON.stringify(report2.repairCandidates),
    );
    check(
      "stale-twin desync detected deterministically (aria-hidden duplicate)",
      report2.repairCandidates.some(
        (c) => c.slotKey === twinSlot!.key && c.reason === "unslotted-duplicate-text-desync",
      ),
      JSON.stringify(report2.repairCandidates),
    );
    check(
      "URL injection applied (cta href → /about, attribute binding)",
      report2.appliedChecks.filter((c) => c.slotKey === ctaHrefKey).length >= 1 &&
        report2.appliedChecks.filter((c) => c.slotKey === ctaHrefKey).every((c) => c.applied),
      JSON.stringify(report2.appliedChecks.filter((c) => c.slotKey === ctaHrefKey)),
    );

    // Bounded repair loop, fake provider: rewrite CONTENT only, ≤2 iterations.
    const currentValues = new Map(Object.entries(overlayNow)) as Map<string, never>;
    const repairRequest = buildRepairRequest("run-a", 1, report2, run3.unitsFile, currentValues);
    check("§18 repair request carries evidence + constraints only", repairRequest !== undefined && repairRequest.items.length >= 1);
    check(
      "twin desync excluded from text-rewrite repair (revert is operator action)",
      repairRequest !== undefined && repairRequest.items.every((i) => i.slotKey !== twinSlot!.key),
    );
    const repairResult = await fake.generate({
      mode: "repair",
      intent: run3.intent,
      policy: CONTENT_POLICY,
      units: unitsForRepair(run3.unitsFile, repairRequest!),
      request: run3.request,
      repair: repairRequest!,
    });
    const { merged, ignoredKeys } = mergeRepairValues(
      overlayNow as Record<string, never>,
      repairRequest!,
      repairResult.slotValues as Record<string, never>,
    );
    check("repair stays inside its slot scope", ignoredKeys.length === 0, JSON.stringify(ignoredKeys));
    const repairedValidation = validateSlotAssignments(
      run3.template,
      run3.unitsFile,
      merged,
      [],
      { ...(run3.result?.sources ?? {}), ...repairResult.sources },
      run3.result?.imageBriefs ?? [],
    );
    check("repaired values revalidate", repairedValidation.pass, JSON.stringify(repairedValidation.errors.slice(0, 3)));
    // Operator resolution for the twin desync: revert to the default.
    delete (merged as Record<string, unknown>)[twinSlot!.key];
    await writeFile(overlayFile, JSON.stringify(merged, null, 2) + "\n", "utf8");
    const report3 = await runContentLayoutQa(qaOptions);
    check("§18 layout QA passes after ONE repair iteration (bound 2)", report3.pass, JSON.stringify(report3.pages.filter((p) => !p.pass).map((p) => p.notes)));

    const badOverlay = { ...merged, [aboutHrefKey]: "javascript:alert(1)" };
    await writeFile(overlayFile, JSON.stringify(badOverlay, null, 2) + "\n", "utf8");
    const run4 = await loadContentRun(runDir);
    let manualRejected = false;
    try {
      await revalidateSlotValues(run4);
    } catch (error) {
      manualRejected = error instanceof ContentValidationError;
    }
    check("§19 unsafe manual edit rejected by revalidation", manualRejected);

    section("template artifact immutability");
    const templateSlotsRaw = await readFile(path.join(templateDir, "slots.json"), "utf8");
    const recompiledDir = path.join(fixtureRoot, "recon-templates", "fixture-b");
    await compileReconTemplate({
      reconstructionManifestFile: manifestFile,
      siteSpecFile,
      runId: "2026-08-18T00-00-00-000Z",
      outputDir: recompiledDir,
    });
    check(
      "template slots.json untouched by the whole content chain",
      templateSlotsRaw === (await readFile(path.join(recompiledDir, "slots.json"), "utf8")),
    );
  } finally {
    await rm(fixtureRoot, { recursive: true, force: true });
  }

  console.log("");
  console.log(`${checks - failures}/${checks} checks passed`);
  if (failures > 0) {
    console.log(`${failures} FAILED`);
    process.exitCode = 1;
  }
}

main().catch((err) => {
  console.error("smoke-content-injection ERROR —", err instanceof Error ? (err.stack ?? err.message) : err);
  process.exitCode = 1;
});
