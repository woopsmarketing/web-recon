import { createHash } from "node:crypto";
import { mkdir, readdir, rm, writeFile, readFile } from "node:fs/promises";
import path from "node:path";
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
import {
  buildSiteMap,
  compileReconTemplate,
  resolveRoutePolicy,
  routePolicyLimitations,
  SiteMapSchema,
  TemplateInputError,
  TemplateManifestSchema,
  TemplateOverrideError,
  type CompiledReconTemplate,
  type RouteScope,
  type SlotDefinition,
} from "../src/recon-template/index.js";
import type { RuntimeRouteMap } from "../src/reconstruction/index.js";
import type { LoadedSiteSpec } from "../src/sitespec/index.js";
import { findIntroducedJsErrors, normalizeJsError, runParityQa } from "../src/recon-template/parity-qa.js";

/**
 * Task 18 smoke — Recon Template Foundation & Slot V2.
 *
 * A synthetic two-page site is authored directly as a SiteSpec (the template
 * compiler's contract input), pushed through the REAL Task 14–17.1
 * reconstruction generator to produce a real Exact Reconstruction app —
 * including a captured dynamic template serialized into `data-wr-obs` — and
 * then through the REAL Task 18 template compiler.
 *
 * Offline half (§1–§11): slot extraction, nested text segments, link groups,
 * global promotion, page scope, image slots, aria-hidden exclusion, manual
 * overrides (exclude / merge / rename / role / scope), dynamic template
 * bindings, mobile/static shared bindings, determinism.
 *
 * Task 27 half (§16–§19): the route scope policy at the compile seam
 * (`structure-only` yields zero slots while the route keeps its site-map entry
 * AND its rendering), the collections model in the site map, and backward
 * compatibility with pre-Task-27 artifacts.
 *
 * Live half (§12–§14): both apps are built with `next build`, served with
 * `next start`, and driven by real Chromium — default-content parity,
 * interaction regression, the slot mutation canary (via the overlay file,
 * never by editing the artifact), and hydration cleanliness.
 *
 * The fixture lives under `data/` (not /tmp) because a generated app resolves
 * `next`/`react` by walking up from its own directory.
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

const ROOT_URL = "https://fixture-recon-template.example/";

interface B {
  tag?: string;
  text?: string;
  attrs?: Record<string, string>;
  styleToken?: string;
  assetRefs?: string[];
  bbox?: { width: number; height: number };
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
      boundingBox: {
        x: 0,
        y: (y += 10),
        width: b.bbox?.width ?? Math.min(viewportWidth, 800),
        height: b.bbox?.height ?? 20,
        top: y,
        right: b.bbox?.width ?? Math.min(viewportWidth, 800),
        bottom: y + (b.bbox?.height ?? 20),
        left: 0,
      },
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

/** The shared header/footer, byte-identical on both pages (global promotion). */
function headerB(): B {
  return el(
    "header",
    { styleToken: "st000003" },
    el("a", { attrs: { href: "/" } }, tx("Fixture")),
    el(
      "nav",
      {},
      el("a", { attrs: { href: "/about" }, styleToken: "st000003" }, tx("About")),
      el(
        "button",
        { attrs: { "aria-expanded": "false", type: "button" }, styleToken: "st000003" },
        tx("Menu"),
      ),
    ),
  );
}
function footerB(): B {
  return el("footer", {}, el("p", {}, tx("© Fixture Inc")));
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
      el(
        "div",
        { attrs: { "aria-hidden": "true" } },
        el("span", {}, tx("Decorative $99")),
        el("a", { attrs: { href: "/decorative" } }, tx("Fake invoice link")),
      ),
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
      effectiveVisibleCount: tree.elementCount - 3,
      styleTokenCount: 3,
      assetRefs: pageId === "p000001" ? ["a000001", "a000002"] : [],
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

/** Find a node id in a page viewport by predicate (fixture-side join helper). */
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
    tokenCount: 3,
    sourceStyleReferenceCount: 12,
    sourceLocalStyleRecordCount: 12,
    dedupReductionRate: 0.75,
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
        properties: {
          "object-fit": "cover",
          "object-position": "50% 50%",
        },
        usageCount: 2,
      },
      {
        styleTokenId: "st000003",
        properties: { color: "rgb(40, 50, 60)", display: "block" },
        usageCount: 6,
      },
    ],
    frequency: { color: [], backgroundColor: [], fontFamily: [], fontSize: [] },
  });

  const assetCatalog = AssetCatalogSchema.parse({
    schemaVersion: 4,
    assetCount: 2,
    occurrenceCount: 4,
    kindCounts: { image: 1, "image-srcset": 1 },
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
    ],
  });

  // The captured open-state template: the mobile-style menu holding the SAME
  // About link as the static nav (shared-binding case) plus a template-only
  // Pricing link (dynamic-only slot case).
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
      observedViewports: [
        home.viewports.desktop.profile,
        home.viewports.mobile.profile,
      ],
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
      effectiveVisibleElementCount: 40,
      hiddenElementCount: 6,
      viewportCount: 4,
      alignedViewportCount: 4,
      fallbackViewportCount: 0,
      cappedSourceTextCount: 0,
      recoveredLongTextCount: 0,
      supplementalAttributeCount: 0,
      supplementalElementCount: 0,
      supplementalAttributeNameCounts: {},
      styleTokenCount: 3,
      assetCount: 2,
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
// Task 27 helpers
// ---------------------------------------------------------------------------

/** sha256 of every file under `dir`, keyed by relative path. */
async function hashTree(dir: string, skipRel: (rel: string) => boolean): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  const walk = async (current: string, rel: string): Promise<void> => {
    for (const entry of await readdir(current, { withFileTypes: true })) {
      const relPath = rel ? `${rel}/${entry.name}` : entry.name;
      if (skipRel(relPath)) continue;
      const full = path.join(current, entry.name);
      if (entry.isDirectory()) await walk(full, relPath);
      else if (entry.isFile())
        out.set(relPath, createHash("sha256").update(await readFile(full)).digest("hex"));
    }
  };
  await walk(dir, "");
  return out;
}

/**
 * A three-route blog fixture for the collections model — SiteSpec family facts
 * only (`routeScope`, `inferredRoutePattern`, member counts), which is all
 * `buildCollections` is allowed to read.
 */
function collectionFixture(): { siteSpec: LoadedSiteSpec; routeMap: RuntimeRouteMap } {
  const families = [
    {
      familyId: "f000001",
      familyType: "singleton",
      representativeUrl: `${ROOT_URL}blog`,
      representativePageId: "p000001",
      observedVariantPageIds: ["p000001"],
      memberUrls: [`${ROOT_URL}blog`],
      memberCount: 1,
      exactObservedMemberCount: 1,
      representedOnlyMemberCount: 0,
      routeScope: "blog",
      limitations: [],
    },
    {
      familyId: "f000002",
      familyType: "sibling-pattern",
      representativeUrl: `${ROOT_URL}blog/one`,
      representativePageId: "p000002",
      observedVariantPageIds: ["p000002"],
      // 40 discovered members, 2 of them reconstructed: the floor case.
      memberUrls: Array.from({ length: 40 }, (_, i) => `${ROOT_URL}blog/post-${i}`),
      memberCount: 40,
      exactObservedMemberCount: 2,
      representedOnlyMemberCount: 38,
      routeScope: "blog",
      inferredRoutePattern: "/blog/<*>",
      limitations: [],
    },
    {
      familyId: "f000003",
      familyType: "singleton",
      representativeUrl: `${ROOT_URL}pricing`,
      representativePageId: "p000004",
      observedVariantPageIds: ["p000004"],
      memberUrls: [`${ROOT_URL}pricing`],
      memberCount: 1,
      exactObservedMemberCount: 1,
      representedOnlyMemberCount: 0,
      routeScope: "pricing",
      limitations: [],
    },
  ];
  const pages = [
    { pageId: "p000001", familyId: "f000001" },
    { pageId: "p000002", familyId: "f000002" },
    { pageId: "p000003", familyId: "f000002" },
    { pageId: "p000004", familyId: "f000003" },
  ];
  const siteSpec = {
    siteSpec: { rootUrl: ROOT_URL, families, pages },
  } as unknown as LoadedSiteSpec;

  const route = (key: string, pageSourceId: string): unknown => ({
    routeId: `r${key}`,
    key,
    url: `${ROOT_URL}${key.slice(1)}`,
    path: key,
    pageFile: `pages/${pageSourceId}.json`,
    pageSourceId,
    renderCoverage: "exact-observed",
    behaviorCoverage: "none",
    observedOnThisExactUrl: true,
    verifiedOnThisRoute: false,
  });
  const routeMap = {
    schemaVersion: 1,
    rootUrl: ROOT_URL,
    breakpoint: 1024,
    routes: [
      route("/blog", "p000001"),
      route("/blog/one", "p000002"),
      route("/blog/two", "p000003"),
      route("/pricing", "p000004"),
    ],
  } as unknown as RuntimeRouteMap;
  return { siteSpec, routeMap };
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  const fixtureRoot = path.resolve("data", `.smoke-recon-template-${process.pid}`);
  await rm(fixtureRoot, { recursive: true, force: true });
  const siteSpecDir = path.join(fixtureRoot, "site-specs", "fixture");
  await mkdir(siteSpecDir, { recursive: true });

  try {
    section("fixture SiteSpec → REAL reconstruction generator");
    const siteSpecFile = await writeFixtureSiteSpec(siteSpecDir);
    const input = await loadReconstructionInput(siteSpecFile, { validate: false });
    const plan = planReconstruction(input, {});
    const reconstructionDir = path.join(fixtureRoot, "reconstructions", "fixture-run");
    const versions = await resolveDependencyVersions(process.cwd());
    const generated = await generateApp(plan, {
      outputDir: reconstructionDir,
      sourceSchemaVersion: input.siteSpec.schemaVersion,
      sourceSiteSpecVersion: input.siteSpec.siteSpecVersion,
      sourceCompilerVersion: input.siteSpec.compilerVersion,
      versions,
    });
    check("exact app generated", generated.files.length > 10);
    const manifestFile = path.join(reconstructionDir, "reconstruction-manifest.json");

    // The generator must have serialized the captured template onto the trigger.
    const homePage = JSON.parse(
      await readFile(path.join(generated.appDir, "reconstruction-data", "pages", "p000001.json"), "utf8"),
    ) as { desktop: { doc: unknown } };
    const homeRaw = JSON.stringify(homePage);
    check("data-wr-obs annotation present in exact app", homeRaw.includes("data-wr-obs"));
    check("dynamic template node ids present", homeRaw.includes("t000004"));

    section("template compile (no overrides)");
    const templateDir = path.join(fixtureRoot, "recon-templates", "fixture-a");
    const compiled = await compileReconTemplate({
      reconstructionManifestFile: manifestFile,
      siteSpecFile,
      runId: "2026-08-18T00-00-00-000Z",
      outputDir: templateDir,
    });
    const slots = compiled.summary; // summary for counts; slots via files
    const slotsFile = JSON.parse(await readFile(path.join(templateDir, "slots.json"), "utf8")) as {
      slots: {
        id: string;
        key: string;
        role: string;
        type: string;
        scope: string;
        route?: string;
        groupId?: string;
        urlKind?: string;
        defaultValue: unknown;
        bindingIds: string[];
        constraints?: Record<string, unknown>;
        editability: string;
      }[];
    };
    const bindingsFile = JSON.parse(
      await readFile(path.join(templateDir, "slot-bindings.json"), "utf8"),
    ) as {
      bindings: {
        bindingId: string;
        slotId: string;
        surface: string;
        viewport: string;
        pageId: string;
        nodeId: string;
        target: string;
        attributeName?: string;
        childIndex?: number;
        textSegment?: number;
        templateNodeId?: string;
        discoveryId?: string;
        expectedValue: string;
        field?: string;
      }[];
    };
    const bySlotId = new Map<string, typeof bindingsFile.bindings>();
    for (const b of bindingsFile.bindings) {
      const list = bySlotId.get(b.slotId) ?? [];
      list.push(b);
      bySlotId.set(b.slotId, list);
    }
    const slotByKey = new Map(slotsFile.slots.map((s) => [s.key, s]));
    const find = (predicate: (s: (typeof slotsFile.slots)[number]) => boolean) =>
      slotsFile.slots.find(predicate);

    // §1 simple text slot
    const hero = find((s) => s.role === "hero.headline" && s.route === "/");
    check("§1 hero headline slot exists", hero !== undefined);
    check("§1 hero default value", hero?.defaultValue === "Fixture headline");
    check(
      "§1 hero has desktop+mobile static bindings",
      hero !== undefined &&
        (bySlotId.get(hero.id) ?? []).filter((b) => b.surface === "static").length === 2,
    );
    check(
      "§1 hero key is site-specific + role canonical",
      hero?.key === "home.main.hero.headline" && hero.role === "hero.headline",
    );
    check(
      "§1 line-count constraint recorded from geometry (64px / 32px = 2 lines)",
      (hero?.constraints as { desktop?: { lineCount?: number } } | undefined)?.desktop?.lineCount === 2,
    );

    // §2 nested text segment
    const startWith = find((s) => s.defaultValue === "Start with ");
    const strongText = find((s) => s.defaultValue === "Fixture" && s.route === "/");
    const today = find((s) => s.defaultValue === " today");
    check("§2 leading segment slot with raw trailing space", startWith !== undefined);
    check("§2 nested <strong> segment is its own slot", strongText !== undefined);
    check("§2 trailing segment slot with raw leading space", today !== undefined);
    const todayBinding = today ? (bySlotId.get(today.id) ?? [])[0] : undefined;
    check(
      "§2 trailing segment addressed as childIndex 2 / textSegment 1",
      todayBinding?.childIndex === 2 && todayBinding?.textSegment === 1,
      JSON.stringify(todayBinding),
    );
    check("§2 hero description role on first hero paragraph segment", startWith?.role === "hero.description");

    // §3 anchor label + href
    const ctaLabel = find((s) => s.role === "cta.label" && s.defaultValue === "Get started");
    const ctaHref = find((s) => s.role === "cta.href" && s.defaultValue === "/signup");
    check("§3 CTA label slot", ctaLabel !== undefined);
    check("§3 CTA href slot", ctaHref !== undefined);
    check(
      "§3 label and href share a group but are independent slots",
      ctaLabel !== undefined &&
        ctaHref !== undefined &&
        ctaLabel.groupId === ctaHref.groupId &&
        ctaLabel.id !== ctaHref.id,
    );
    check("§3 href classified internal", ctaHref?.urlKind === "internal");

    // §4 global slot with multiple bindings
    const footerText = find((s) => s.defaultValue === "© Fixture Inc");
    check("§4 footer text promoted to global", footerText?.scope === "global");
    check(
      "§4 global slot binds on both pages × both viewports",
      footerText !== undefined &&
        new Set((bySlotId.get(footerText.id) ?? []).map((b) => `${b.pageId}|${b.viewport}`)).size === 4,
    );
    check("§4 footer role", footerText?.role === "footer.text");

    // §5 page slot
    const tagline = slotsFile.slots.filter((s) => s.defaultValue === "Shared tagline");
    check("§5 main content stays page-scoped (one slot per page)", tagline.length === 2);
    check(
      "§5 page slots carry pageId + route",
      tagline.every((s) => s.scope === "page" && s.route !== undefined),
    );

    // §6 image slot
    const image = find((s) => s.type === "image");
    check("§6 image slot exists", image !== undefined);
    const imageValue = image?.defaultValue as { src?: string; alt?: string; srcset?: string };
    check(
      "§6 image value is an object with src+alt+srcset",
      imageValue?.src === "https://assets.fixture.invalid/visual.png" &&
        imageValue?.alt === "Fixture visual" &&
        imageValue?.srcset === "https://assets.fixture.invalid/visual@2x.png 2x",
    );
    const imageConstraints = image?.constraints as
      | { desktop?: { renderedWidth?: number; aspectRatio?: number }; objectFit?: string }
      | undefined;
    check(
      "§6 image constraints: measured box + aspect ratio + object-fit",
      imageConstraints?.desktop?.renderedWidth === 640 &&
        imageConstraints?.desktop?.aspectRatio === 1.3333 &&
        imageConstraints?.objectFit === "cover",
      JSON.stringify(imageConstraints),
    );
    check(
      "§6 image src/alt/srcset are separate bindings with fields",
      image !== undefined &&
        new Set((bySlotId.get(image.id) ?? []).map((b) => b.field)).size === 3,
    );

    // §7 decorative aria-hidden exclusion
    check(
      "§7 aria-hidden text never became a slot",
      find((s) => s.defaultValue === "Decorative $99") === undefined,
    );
    check(
      "§7 aria-hidden anchor never became a slot",
      find((s) => s.defaultValue === "/decorative") === undefined &&
        find((s) => s.defaultValue === "Fake invoice link") === undefined,
    );
    check(
      "§7 exclusions counted with evidence",
      (compiled.summary.excludedCandidates["aria-hidden"] ?? 0) >= 4,
      JSON.stringify(compiled.summary.excludedCandidates),
    );

    // §10 dynamic template binding
    const pricingHref = find((s) => s.defaultValue === "/pricing");
    check("§10 dynamic-template-only slot exists (Pricing href)", pricingHref !== undefined);
    const pricingBindings = pricingHref ? bySlotId.get(pricingHref.id) ?? [] : [];
    check(
      "§10 dynamic binding addressed by trigger + discoveryId + templateNodeId",
      pricingBindings.length === 1 &&
        pricingBindings[0].surface === "dynamic-template" &&
        pricingBindings[0].discoveryId === "dt000001" &&
        pricingBindings[0].templateNodeId === "t000004",
      JSON.stringify(pricingBindings),
    );
    const pricingLabel = find((s) => s.defaultValue === "Pricing");
    check("§10 dynamic template text slot exists", pricingLabel !== undefined);

    // §11 mobile/static shared binding (one logical slot, both surfaces)
    const aboutLabel = find((s) => s.defaultValue === "About" && s.type === "text");
    const aboutBindings = aboutLabel ? bySlotId.get(aboutLabel.id) ?? [] : [];
    check(
      "§11 shared nav label slot spans static AND dynamic-template surfaces",
      new Set(aboutBindings.map((b) => b.surface)).size === 2,
      JSON.stringify(aboutBindings.map((b) => [b.surface, b.viewport])),
    );
    check("§11 shared slot is global (identical header on all pages)", aboutLabel?.scope === "global");
    check(
      "§11 shared slot binds 5 occurrences (2 pages × 2 viewports static + 1 dynamic)",
      aboutBindings.length === 5,
      String(aboutBindings.length),
    );
    check("§11 navigation role", aboutLabel?.role === "navigation.label");

    // compile-time validation result
    check(
      "compile validation: every binding resolves",
      compiled.validation.resolvedBindings === compiled.validation.bindings,
    );
    check(
      "compile validation: defaults are a no-op",
      compiled.validation.defaultNoOpBindings === compiled.validation.bindings,
    );
    void slots;

    section("determinism (same inputs + same run id → byte-identical artifact)");
    const templateDirB = path.join(fixtureRoot, "recon-templates", "fixture-b");
    await compileReconTemplate({
      reconstructionManifestFile: manifestFile,
      siteSpecFile,
      runId: "2026-08-18T00-00-00-000Z",
      outputDir: templateDirB,
    });
    let identical = true;
    for (const name of ["manifest.json", "site-map.json", "slots.json", "slot-bindings.json", "default-content.json"]) {
      const a = await readFile(path.join(templateDir, name), "utf8");
      const b = await readFile(path.join(templateDirB, name), "utf8");
      if (a !== b) identical = false;
    }
    check("artifact files byte-identical across compiles", identical);

    section("§8/§9 manual overrides (exclude / merge / rename / role / scope)");
    const overridesFile = path.join(fixtureRoot, "overrides.json");
    const taglineKeys = tagline.map((s) => s.key).sort();
    await writeFile(
      overridesFile,
      JSON.stringify(
        {
          schemaVersion: 1,
          exclude: [{ key: footerText!.key, reason: "fixture exclude test" }],
          merge: [{ into: taglineKeys[0], from: [taglineKeys[1]] }],
          rename: [{ from: "home.main.hero.headline", to: "home.hero.mainTitle" }],
          role: [{ key: strongText!.key, role: "content.text" }],
          scope: [{ key: taglineKeys[0], scope: "global" }],
        },
        null,
        2,
      ) + "\n",
      "utf8",
    );
    const templateDirC = path.join(fixtureRoot, "recon-templates", "fixture-c");
    const overridden = await compileReconTemplate({
      reconstructionManifestFile: manifestFile,
      siteSpecFile,
      runId: "2026-08-18T00-00-00-000Z",
      outputDir: templateDirC,
      slotOverridesFile: overridesFile,
    });
    const slotsC = JSON.parse(await readFile(path.join(templateDirC, "slots.json"), "utf8")) as {
      slots: { key: string; scope: string; role: string; bindingIds: string[]; defaultValue: unknown; appliedOverrides?: string[] }[];
    };
    const byKeyC = new Map(slotsC.slots.map((s) => [s.key, s]));
    check("§8 excluded slot is gone", !slotsC.slots.some((s) => s.defaultValue === "© Fixture Inc"));
    const mergedTagline = byKeyC.get(taglineKeys[0]);
    check("§9 merged slot holds both pages' bindings", mergedTagline !== undefined && mergedTagline.bindingIds.length === 4);
    check("§9 merge source slot is gone", byKeyC.get(taglineKeys[1]) === undefined);
    check("§9 cross-page merge widened scope to global", mergedTagline?.scope === "global");
    check("rename override applied", byKeyC.has("home.hero.mainTitle") && !byKeyC.has("home.main.hero.headline"));
    check("role override applied", byKeyC.get(strongText!.key)?.role === "content.text");
    check(
      "overrides recorded on slots",
      (mergedTagline?.appliedOverrides ?? []).some((o) => o.startsWith("merge:")),
    );
    check(
      "overridden compile still validates (defaults no-op)",
      overridden.validation.defaultNoOpBindings === overridden.validation.bindings,
    );
    // merge refusal on differing defaults
    const badOverridesFile = path.join(fixtureRoot, "overrides-bad.json");
    await writeFile(
      badOverridesFile,
      JSON.stringify({
        schemaVersion: 1,
        merge: [{ into: "home.hero.mainTitle", from: [strongText!.key] }],
        rename: [{ from: "home.main.hero.headline", to: "home.hero.mainTitle" }],
      }) + "\n",
      "utf8",
    );
    let mergeRefused = false;
    try {
      await compileReconTemplate({
        reconstructionManifestFile: manifestFile,
        siteSpecFile,
        runId: "2026-08-18T00-00-00-000Z",
        outputDir: path.join(fixtureRoot, "recon-templates", "fixture-d"),
        slotOverridesFile: badOverridesFile,
      });
    } catch (error) {
      mergeRefused = error instanceof TemplateOverrideError;
    }
    check("§9 merge with differing defaults is refused", mergeRefused);

    section("§12–§14 live half: parity, interactions, mutation, hydration");
    const result = await runParityQa({
      templateManifestFile: path.join(templateDir, "manifest.json"),
      log: (line) => console.log(`  ${line}`),
    });
    check("§12 parity pairs compared", result.pairs.length >= 4, String(result.pairs.length));
    check(
      "§12 default parity: content + structure + geometry identical",
      result.pairs.every((p) => p.pass),
      JSON.stringify(result.pairs.filter((p) => !p.pass).map((p) => p.notes)),
    );
    check(
      "interaction regression: trigger equivalent in template app",
      result.interactions.length >= 1 && result.interactions.every((i) => i.equivalent),
      JSON.stringify(result.interactions),
    );
    check("§13 mutation checks ran", result.mutationChecks.length >= 4, String(result.mutationChecks.length));
    check(
      "§13 every mutated binding occurrence changed (incl. dynamic template)",
      result.mutationChecks.every((m) => m.applied),
      JSON.stringify(result.mutationChecks.filter((m) => !m.applied)),
    );
    check(
      "§13 a dynamic-template occurrence was verified after mounting",
      result.mutationChecks.some((m) => m.surface === "dynamic-template" && m.applied),
    );
    check("§13 mutation left DOM structure unchanged", result.mutationStructureEqual === true);
    check("§13 mutation runtime clean", result.mutationRuntimeClean === true);
    check(
      "§14 hydration errors 0 across every capture",
      result.pairs.every((p) => p.templateHydrationErrors === 0 && p.exactHydrationErrors === 0),
    );
    check(
      "§14 runtime errors 0 across every capture",
      result.pairs.every((p) => p.templateJsErrors === 0),
    );
    check(
      "§14 no template-introduced runtime errors across every capture",
      result.pairs.every((p) => p.templateIntroducedJsErrors === 0),
    );

    // §15 — inherited-vs-introduced js-error attribution (unit block).
    // Parity compares template(default) against the EXACT reconstruction, so a
    // js error the exact reference emits identically (e.g. the source site's
    // CDN refusing cross-origin asset loads) is inherited, not introduced by
    // the slot layer. Only errors absent from the exact capture may fail.
    const corsA =
      "Access to image at 'https://cdn.example/x.svg' from origin 'http://127.0.0.1:41001' has been blocked by CORS policy";
    const corsB =
      "Access to image at 'https://cdn.example/x.svg' from origin 'http://127.0.0.1:52999' has been blocked by CORS policy";
    check(
      "§15 serve-origin normalization equates ports",
      normalizeJsError(corsA) === normalizeJsError(corsB),
    );
    check(
      "§15 identical inherited error (different serve port) is NOT introduced",
      findIntroducedJsErrors([corsA], [corsB]).length === 0,
    );
    check(
      "§15 template-only error IS introduced (negative control)",
      findIntroducedJsErrors([corsA], [corsB, "TypeError: boom"]).length === 1,
    );
    check(
      "§15 exact-only error with clean template introduces nothing (negative control)",
      findIntroducedJsErrors([corsA], []).length === 0,
    );
    check(
      "§15 different asset URL is a different error, not normalized away",
      findIntroducedJsErrors(
        [corsA],
        ["Access to image at 'https://cdn.example/OTHER.svg' from origin 'http://127.0.0.1:41001' has been blocked by CORS policy"],
      ).length === 1,
    );

    // -----------------------------------------------------------------------
    // Task 27 — route scope policy, collections, backward compatibility
    // -----------------------------------------------------------------------

    section("§16 route scope policy at the compile seam");
    const policyFreeMap = SiteMapSchema.parse(
      JSON.parse(await readFile(path.join(templateDir, "site-map.json"), "utf8")),
    );
    check(
      "§16 policy-free compile records an unapplied policy",
      policyFreeMap.routePolicy?.applied === false &&
        policyFreeMap.routePolicy.defaultScope === "core-reconstruct",
      JSON.stringify(policyFreeMap.routePolicy),
    );
    check(
      "§16 policy-free compile leaves every route core-reconstruct",
      policyFreeMap.routes.length === 2 &&
        policyFreeMap.routes.every((r) => r.scope === "core-reconstruct" && (r.slotCount ?? 0) > 0),
      JSON.stringify(policyFreeMap.routes.map((r) => [r.route, r.scope, r.slotCount])),
    );

    interface PoliciedCompile {
      dir: string;
      compiled: CompiledReconTemplate;
      siteMap: ReturnType<typeof SiteMapSchema.parse>;
      slots: SlotDefinition[];
    }
    const compileWithPolicy = async (
      name: string,
      policy: unknown,
      outDirName = `policy-${name}`,
    ): Promise<PoliciedCompile> => {
      const file = path.join(fixtureRoot, `route-policy-${name}.json`);
      await writeFile(file, JSON.stringify(policy, null, 2) + "\n", "utf8");
      const dir = path.join(fixtureRoot, "recon-templates", outDirName);
      const result = await compileReconTemplate({
        reconstructionManifestFile: manifestFile,
        siteSpecFile,
        runId: "2026-08-18T00-00-00-000Z",
        outputDir: dir,
        routePolicyFile: file,
      });
      const siteMap = SiteMapSchema.parse(
        JSON.parse(await readFile(path.join(dir, "site-map.json"), "utf8")),
      );
      const slotsJson = JSON.parse(await readFile(path.join(dir, "slots.json"), "utf8")) as {
        slots: SlotDefinition[];
      };
      return { dir, compiled: result, siteMap, slots: slotsJson.slots };
    };
    const aboutPolicy = (scope: RouteScope): unknown => ({
      schemaVersion: 1,
      rules: [{ route: "/about", scope, reason: `smoke ${scope}` }],
    });

    // Every value of the closed vocabulary, honored at the one seam.
    const perScope = new Map<RouteScope, PoliciedCompile>();
    for (const scope of [
      "core-reconstruct",
      "collection-index",
      "collection-representative",
      "structure-only",
      "exclude",
    ] as RouteScope[]) {
      perScope.set(scope, await compileWithPolicy(scope, aboutPolicy(scope)));
    }
    const aboutSlots = (c: PoliciedCompile): number =>
      c.slots.filter((slot) => slot.route === "/about").length;
    for (const scope of [
      "core-reconstruct",
      "collection-index",
      "collection-representative",
    ] as RouteScope[]) {
      const c = perScope.get(scope)!;
      check(
        `§16 ${scope} slotizes the route`,
        c.siteMap.routes.find((r) => r.route === "/about")?.scope === scope && aboutSlots(c) > 0,
        `${aboutSlots(c)} slots`,
      );
    }
    const structureOnly = perScope.get("structure-only")!;
    const structureOnlyRoute = structureOnly.siteMap.routes.find((r) => r.route === "/about");
    check(
      "§16 structure-only route is still IN the site map",
      structureOnlyRoute !== undefined &&
        structureOnlyRoute.scope === "structure-only" &&
        structureOnlyRoute.pageId === "p000002" &&
        structureOnlyRoute.renderCoverage === "exact-observed",
      JSON.stringify(structureOnlyRoute),
    );
    check(
      "§16 structure-only route yields ZERO slots (measured, was > 0 policy-free)",
      aboutSlots(structureOnly) === 0 &&
        (policyFreeMap.routes.find((r) => r.route === "/about")?.slotCount ?? 0) > 0,
      `${aboutSlots(structureOnly)} after / ${policyFreeMap.routes.find((r) => r.route === "/about")?.slotCount} before`,
    );
    check(
      "§16 structure-only route declares slotCount 0 in the site map",
      structureOnlyRoute?.slotCount === 0,
    );
    const structureOnlyBindings = JSON.parse(
      await readFile(path.join(structureOnly.dir, "slot-bindings.json"), "utf8"),
    ) as { bindings: { pageId: string }[] };
    check(
      "§16 no binding anywhere addresses the structure-only page",
      structureOnlyBindings.bindings.every((b) => b.pageId !== "p000002") &&
        structureOnlyBindings.bindings.length > 0,
    );
    check(
      "§16 the home route keeps its slots under the policy",
      structureOnly.slots.filter((slot) => slot.route === "/").length > 0,
    );
    check(
      "§16 slot count fell against the policy-free compile",
      structureOnly.compiled.manifest.counts.slots < compiled.manifest.counts.slots,
      `${structureOnly.compiled.manifest.counts.slots} < ${compiled.manifest.counts.slots}`,
    );
    check(
      "§16 manifest records the policy honestly",
      structureOnly.compiled.manifest.routePolicy?.applied === true &&
        structureOnly.compiled.manifest.counts.structureOnlyRoutes === 1 &&
        structureOnly.compiled.manifest.counts.slotizedPages === 1 &&
        structureOnly.compiled.manifest.limitations.includes(
          "structure-only-pages-keep-original-content-including-global-slot-values",
        ),
      JSON.stringify(structureOnly.compiled.manifest.routePolicy),
    );

    // RENDERING PROOF (offline half): the template app is the exact app copied
    // byte for byte plus `template-data/`. If policy touched anything the
    // browser renders, these trees would differ.
    // `template-data/` is the slot layer (the thing policy is allowed to
    // change); `.next` / `node_modules` are build products of the live half
    // above, not artifact.
    const skipTemplateData = (rel: string) =>
      rel === "template-data" ||
      rel.startsWith("template-data/") ||
      rel === ".next" ||
      rel.startsWith(".next/") ||
      rel === "node_modules" ||
      rel.startsWith("node_modules/") ||
      rel === "next-env.d.ts" ||
      rel === "tsconfig.tsbuildinfo";
    const freeApp = await hashTree(path.join(templateDir, "app"), skipTemplateData);
    const policiedApp = await hashTree(path.join(structureOnly.dir, "app"), skipTemplateData);
    const appDiffs = [...freeApp.entries()].filter(
      ([rel, hash]) => policiedApp.get(rel) !== hash,
    );
    check(
      "§16 policy changes NOTHING the app renders (byte-identical outside template-data/)",
      freeApp.size > 10 &&
        freeApp.size === policiedApp.size &&
        appDiffs.length === 0,
      JSON.stringify(appDiffs.map(([rel]) => rel).slice(0, 5)),
    );
    check(
      "§16 the structure-only page's runtime data is still in the template app",
      policiedApp.has("reconstruction-data/pages/p000002.json"),
      [...policiedApp.keys()].filter((k) => k.includes("p000002")).join(","),
    );

    const excluded = perScope.get("exclude")!;
    check(
      "§16 excluded route is dropped from site-map routes and listed with its reason",
      excluded.siteMap.routes.every((r) => r.route !== "/about") &&
        excluded.siteMap.excludedRoutes?.length === 1 &&
        excluded.siteMap.excludedRoutes[0]!.route === "/about" &&
        excluded.siteMap.excludedRoutes[0]!.reason === "smoke exclude" &&
        aboutSlots(excluded) === 0,
      JSON.stringify(excluded.siteMap.excludedRoutes),
    );
    check(
      "§16 exclusion is declared as still-served by the copied exact app (honesty)",
      excluded.compiled.manifest.routes.includes("/about") &&
        excluded.compiled.manifest.limitations.includes(
          "excluded-routes-still-served-by-the-copied-exact-app",
        ),
    );

    let unmatchedRefused = false;
    try {
      await compileWithPolicy("unmatched", {
        schemaVersion: 1,
        rules: [{ route: "/does-not-exist", scope: "structure-only" }],
      });
    } catch (error) {
      unmatchedRefused = error instanceof TemplateInputError;
    }
    check("§16 a rule that matches no route is refused, never silently ignored", unmatchedRefused);

    let emptyRefused = false;
    try {
      await compileWithPolicy("empty", {
        schemaVersion: 1,
        defaultScope: "structure-only",
        rules: [{ routePrefix: "/", scope: "structure-only" }],
      });
    } catch (error) {
      emptyRefused = error instanceof TemplateInputError;
    }
    check("§16 a policy that leaves no slotized route is refused", emptyRefused);

    const structureOnlyB = await compileWithPolicy(
      "structure-only",
      aboutPolicy("structure-only"),
      "policy-structure-only-b",
    );
    let policyDeterministic = true;
    for (const name of ["slots.json", "site-map.json", "slot-bindings.json"]) {
      const a = await readFile(path.join(structureOnly.dir, name), "utf8");
      const b = await readFile(path.join(structureOnlyB.dir, name), "utf8");
      if (a !== b) policyDeterministic = false;
    }
    check(
      "§16 same input + same policy → byte-identical slots.json / site-map.json",
      policyDeterministic,
    );

    section("§17 collections in the site map (detection and representation only)");
    const { siteSpec: colSpec, routeMap: colRoutes } = collectionFixture();
    const colPolicy = resolveRoutePolicy(
      colRoutes,
      colSpec,
      {
        schemaVersion: 1,
        rules: [
          { route: "/blog", scope: "collection-index" },
          { route: "/blog/one", scope: "collection-representative" },
          { routePrefix: "/blog", scope: "structure-only" },
        ],
      },
      "fixture://route-policy",
    );
    check(
      "§17 first matching rule wins (the exception above the sweep)",
      colPolicy.scopeByRoute.get("/blog") === "collection-index" &&
        colPolicy.scopeByRoute.get("/blog/one") === "collection-representative" &&
        colPolicy.scopeByRoute.get("/blog/two") === "structure-only" &&
        colPolicy.scopeByRoute.get("/pricing") === "core-reconstruct",
      JSON.stringify([...colPolicy.scopeByRoute]),
    );
    const colSiteMap = SiteMapSchema.parse(buildSiteMap(colRoutes, colSpec, [], colPolicy));
    const blog = colSiteMap.collections?.[0];
    check(
      "§17 collections survive into a schema-valid site map",
      colSiteMap.collections?.length === 1 && blog?.collectionId === "c000001",
      JSON.stringify(colSiteMap.collections?.map((c) => c.collectionId)),
    );
    check(
      "§17 collection reuses the family evidence the template boundary used to lose",
      blog?.routeScope === "blog" &&
        blog.semanticKind === "blog" &&
        blog.groupedBy === "scope:blog" &&
        blog.detailPattern === "/blog/<*>" &&
        blog.indexRoute === "/blog" &&
        blog.sourceFamilyIds.join(",") === "f000001,f000002" &&
        blog.representativeRoutes.join(",") === "/blog,/blog/one",
      JSON.stringify(blog),
    );
    check(
      "§17 member count is a crawl-capped FLOOR, and says so",
      blog?.discoveredMemberCount === 41 &&
        blog.observedMemberCount === 3 &&
        blog.representedOnlyMemberCount === 38 &&
        blog.countIsFloor === true,
      JSON.stringify([blog?.discoveredMemberCount, blog?.countIsFloor]),
    );
    check(
      "§17 estimated total stays null (no pagination detection exists in this repo)",
      blog?.estimatedTotalMembers === null &&
        blog.countEvidence.includes("no-pagination-detection"),
    );
    check(
      "§17 renderPolicy reports what the policy actually did to the members",
      blog?.renderPolicy.slotizedRoutes === 2 &&
        JSON.stringify(blog.renderPolicy.scopeCounts) ===
          JSON.stringify([
            { scope: "collection-index", routes: 1 },
            { scope: "collection-representative", routes: 1 },
            { scope: "structure-only", routes: 1 },
          ]),
      JSON.stringify(blog?.renderPolicy),
    );
    check(
      "§17 a one-member family is a page, not a collection",
      colSiteMap.collections?.every((c) => c.routeScope !== "pricing") === true,
    );
    const noIndexRoutes = {
      ...colRoutes,
      routes: colRoutes.routes.filter((r) => r.key !== "/blog"),
    } as RuntimeRouteMap;
    const noIndexPolicy = resolveRoutePolicy(noIndexRoutes, colSpec);
    const noIndexMap = buildSiteMap(noIndexRoutes, colSpec, [], noIndexPolicy);
    check(
      "§17 no index route is observed → indexRoute is null, never synthesized",
      noIndexMap.collections?.[0]?.indexRoute === null,
      JSON.stringify(noIndexMap.collections?.[0]?.indexRoute),
    );
    check(
      "§17 fieldHints restate observed slot roles, nothing more",
      blog?.fieldHints.length === 0,
      JSON.stringify(blog?.fieldHints),
    );

    section("§18 backward compatibility with pre-Task-27 artifacts");
    const legacySiteMap = {
      schemaVersion: 1,
      root: ROOT_URL,
      routes: [
        {
          route: "/",
          url: ROOT_URL,
          pageId: "p000001",
          familyId: "f000001",
          representative: true,
          renderCoverage: "exact-observed",
        },
      ],
      pageFamilies: [
        {
          familyId: "f000001",
          familyType: "singleton",
          representativeUrl: ROOT_URL,
          memberCount: 1,
        },
      ],
      representatives: ["p000001"],
      internalLinks: ["/about"],
    };
    const legacyParsed = SiteMapSchema.safeParse(legacySiteMap);
    check(
      "§18 a Task 18/19 site-map.json (no scope, no routePolicy, no collections) still parses",
      legacyParsed.success &&
        legacyParsed.data.routes[0]!.scope === undefined &&
        legacyParsed.data.collections === undefined,
      legacyParsed.success ? "" : JSON.stringify(legacyParsed.error.issues.slice(0, 2)),
    );
    const legacyManifest = JSON.parse(JSON.stringify(compiled.manifest)) as Record<string, unknown>;
    delete legacyManifest.routePolicy;
    legacyManifest.compilerVersion = 2;
    const legacyCounts = legacyManifest.counts as Record<string, unknown>;
    for (const key of [
      "slotizedPages",
      "slotizedRoutes",
      "structureOnlyRoutes",
      "excludedRoutes",
      "collections",
    ]) {
      delete legacyCounts[key];
    }
    const legacyManifestParsed = TemplateManifestSchema.safeParse(legacyManifest);
    check(
      "§18 a compilerVersion 2 manifest (no routePolicy, no new counts) still parses",
      legacyManifestParsed.success,
      legacyManifestParsed.success ? "" : JSON.stringify(legacyManifestParsed.error.issues.slice(0, 2)),
    );

    section("§19 live: a structure-only route still RENDERS the exact reconstruction");
    const policiedParity = await runParityQa({
      templateManifestFile: path.join(structureOnly.dir, "manifest.json"),
      skipMutation: true,
      log: (line) => console.log(`  ${line}`),
    });
    const aboutPairs = policiedParity.pairs.filter((p) => p.route === "/about");
    check(
      "§19 the structure-only route was actually compared",
      aboutPairs.length >= 2,
      String(aboutPairs.length),
    );
    check(
      "§19 structure-only route: content + structure + geometry identical to the exact app",
      aboutPairs.length > 0 && aboutPairs.every((p) => p.pass),
      JSON.stringify(aboutPairs.filter((p) => !p.pass).map((p) => p.notes)),
    );
    check(
      "§19 every route of the policied template still passes parity",
      policiedParity.pairs.length >= 4 && policiedParity.pairs.every((p) => p.pass),
      JSON.stringify(policiedParity.pairs.filter((p) => !p.pass).map((p) => p.route)),
    );
    check(
      "§19 policied template stays hydration- and runtime-clean",
      policiedParity.pairs.every(
        (p) => p.templateHydrationErrors === 0 && p.templateIntroducedJsErrors === 0,
      ),
    );

    section("§20 hardening: path-spelling determinism, shared pages, shadowed rules");

    // (1) site-map.json bytes must not depend on HOW the operator spelled the
    // policy path. The artifact feeds a release lineage hash, so a relative vs
    // absolute spelling of the same file would read as a lineage difference.
    const spellingPolicyFile = path.join(fixtureRoot, "route-policy-spelling.json");
    await writeFile(
      spellingPolicyFile,
      JSON.stringify(aboutPolicy("structure-only"), null, 2) + "\n",
      "utf8",
    );
    const relativeSpelling = path.relative(process.cwd(), spellingPolicyFile);
    check(
      "§20 the two spellings really are different strings (test is meaningful)",
      path.isAbsolute(spellingPolicyFile) && !path.isAbsolute(relativeSpelling),
      `${spellingPolicyFile} vs ${relativeSpelling}`,
    );
    const compileSpelledAs = async (
      spelling: string,
      outDirName: string,
    ): Promise<CompiledReconTemplate> =>
      compileReconTemplate({
        reconstructionManifestFile: manifestFile,
        siteSpecFile,
        runId: "2026-08-18T00-00-00-000Z",
        outputDir: path.join(fixtureRoot, "recon-templates", outDirName),
        routePolicyFile: spelling,
      });
    const spelledAbsolute = await compileSpelledAs(spellingPolicyFile, "spelling-absolute");
    const spelledRelative = await compileSpelledAs(relativeSpelling, "spelling-relative");
    let spellingIdentical = true;
    const spellingDiffs: string[] = [];
    for (const name of ["site-map.json", "manifest.json", "slots.json", "slot-bindings.json"]) {
      const a = await readFile(path.join(spelledAbsolute.runDir, name), "utf8");
      const b = await readFile(path.join(spelledRelative.runDir, name), "utf8");
      if (a !== b) {
        spellingIdentical = false;
        spellingDiffs.push(name);
      }
    }
    check(
      "§20 two compiles differing ONLY in path spelling are byte-identical",
      spellingIdentical,
      spellingDiffs.join(","),
    );
    const spelledMap = SiteMapSchema.parse(
      JSON.parse(await readFile(path.join(spelledAbsolute.runDir, "site-map.json"), "utf8")),
    );
    check(
      "§20 the recorded policyFile is repo-relative POSIX, never the raw argument",
      spelledMap.routePolicy?.policyFile === relativeSpelling.split(path.sep).join("/") &&
        !spelledMap.routePolicy.policyFile.startsWith("/"),
      JSON.stringify(spelledMap.routePolicy?.policyFile),
    );

    // (2) `structure-only` is weaker than it sounds when a route SHARES its
    // page with a slotized route: policy is per route, bindings are per page.
    const { siteSpec: sharedSpec, routeMap: sharedBase } = collectionFixture();
    const aliasOf = sharedBase.routes.find((r) => r.key === "/blog/one")!;
    const sharedRoutes = {
      ...sharedBase,
      routes: [
        ...sharedBase.routes,
        { ...aliasOf, routeId: "r/blog/one-alias", key: "/blog/one-alias", path: "/blog/one-alias", url: `${ROOT_URL}blog/one-alias` },
      ],
    } as RuntimeRouteMap;
    const sharedRules = [
      { route: "/blog/one", scope: "collection-representative" as RouteScope },
      { routePrefix: "/blog", scope: "structure-only" as RouteScope },
    ];
    const sharedPolicy = resolveRoutePolicy(sharedRoutes, sharedSpec, {
      schemaVersion: 1,
      rules: sharedRules,
    });
    check(
      "§20 a structure-only route sharing a slotized page is counted",
      sharedPolicy.structureOnlySharedPageRoutes === 1 &&
        sharedPolicy.scopeCounts["structure-only"] === 3,
      `${sharedPolicy.structureOnlySharedPageRoutes} shared / ${sharedPolicy.scopeCounts["structure-only"]} structure-only`,
    );
    check(
      "§20 the machine-readable limitation says so, with the real count",
      routePolicyLimitations(sharedPolicy).includes(
        "structure-only-routes-sharing-a-slotized-page-do-render-slot-edits:1",
      ) && routePolicyLimitations(sharedPolicy).includes("structure-only-routes-carry-no-slots:3"),
      JSON.stringify(routePolicyLimitations(sharedPolicy)),
    );
    check(
      "§20 the site map carries the same count for diffing",
      buildSiteMap(sharedRoutes, sharedSpec, [], sharedPolicy).routePolicy
        ?.structureOnlySharedPageRoutes === 1,
    );
    // Negative control for the spelling check above: policyFile really is
    // load-bearing on site-map bytes, so those two compiles matched because of
    // normalization, not because nothing embeds the path at all.
    const spellingSensitive =
      JSON.stringify(
        buildSiteMap(sharedRoutes, sharedSpec, [], {
          ...sharedPolicy,
          policyFile: "/abs/route-policy.json",
        }),
      ) !==
      JSON.stringify(
        buildSiteMap(sharedRoutes, sharedSpec, [], {
          ...sharedPolicy,
          policyFile: "data/route-policy.json",
        }),
      );
    check(
      "§20 policyFile IS load-bearing on site-map bytes (negative control)",
      spellingSensitive,
    );

    // Negative control: drop the alias and no route shares a slotized page.
    const unsharedPolicy = resolveRoutePolicy(sharedBase, sharedSpec, {
      schemaVersion: 1,
      rules: sharedRules,
    });
    check(
      "§20 no shared page → the code is absent and the site map omits the count",
      unsharedPolicy.structureOnlySharedPageRoutes === 0 &&
        routePolicyLimitations(unsharedPolicy).every(
          (code) => !code.startsWith("structure-only-routes-sharing-a-slotized-page"),
        ) &&
        buildSiteMap(sharedBase, sharedSpec, [], unsharedPolicy).routePolicy
          ?.structureOnlySharedPageRoutes === undefined,
      JSON.stringify(routePolicyLimitations(unsharedPolicy)),
    );
    check(
      "§20 the compiled 2-page fixture (no shared page) does NOT claim the code",
      structureOnly.compiled.manifest.limitations.every(
        (code) => !code.startsWith("structure-only-routes-sharing-a-slotized-page"),
      ) &&
        structureOnly.compiled.manifest.limitations.includes(
          "structure-only-routes-carry-no-slots:1",
        ),
      JSON.stringify(structureOnly.compiled.manifest.limitations.slice(-3)),
    );

    // (3) A rule every match of which an earlier rule already decided changes
    // nothing — it must be refused exactly like a rule that matches nothing.
    let shadowedRefused = false;
    let shadowedMessage = "";
    try {
      await compileWithPolicy("shadowed", {
        schemaVersion: 1,
        rules: [
          { routePrefix: "/", scope: "core-reconstruct" },
          { route: "/about", scope: "structure-only", reason: "fully shadowed by the sweep above" },
        ],
      });
    } catch (error) {
      shadowedRefused = error instanceof TemplateInputError;
      shadowedMessage = error instanceof Error ? error.message : "";
    }
    check(
      "§20 a fully shadowed rule is refused, never silently ignored",
      shadowedRefused && shadowedMessage.includes("/about"),
      shadowedMessage.slice(0, 160),
    );
    check(
      "§20 first-match-wins still accepts an exception ABOVE its sweep (positive control)",
      sharedPolicy.scopeByRoute.get("/blog/one") === "collection-representative" &&
        sharedPolicy.scopeByRoute.get("/blog/two") === "structure-only" &&
        sharedPolicy.decisions.find((d) => d.route === "/blog/one")?.matchedRuleIndex === 0,
      JSON.stringify([...sharedPolicy.scopeByRoute]),
    );

    void slotByKey;
    void compiledSanity(compiled);
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

function compiledSanity(compiled: CompiledReconTemplate): boolean {
  return compiled.manifest.counts.slots > 0;
}

main().catch((err) => {
  console.error("smoke-recon-template ERROR —", err instanceof Error ? (err.stack ?? err.message) : err);
  process.exitCode = 1;
});
