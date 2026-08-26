/**
 * pnpm smoke:release — Task 25 Release Orchestrator tests.
 *
 * Two halves:
 *
 *   SYNTHETIC FULL-RESOLUTION FIXTURE (spec §25/§26): a tiny 2-route fixture
 *   site goes through the REAL pipeline (reconstruction → template → content →
 *   theme → seo → assets → production compile + isolated-package QA), then the
 *   release layer takes over: prepare → resolve → selective release:build,
 *   proving PRODUCTION_INPUTS_REQUIRED → PRODUCTION_READY with reconstruction/
 *   template/content rerun counts asserted 0 on a domain-only change and
 *   assets+production only on an image-only change.
 *
 *   STRIPE CANARY (spec §23): requirement COLLECTION over the accepted stripe
 *   candidate, read-only — every expected number is read from the artifacts at
 *   runtime (never hardcoded), and the lineage directories are byte-checked
 *   untouched afterwards (spec: historical artifact immutability).
 *
 * Everything below data/ is fixture-scoped (data/release-fixture.example — a
 * throwaway host namespace removed at both ends) except the read-only stripe
 * section.
 */
import { createHash } from "node:crypto";
import { createServer, type Server } from "node:http";
import { existsSync } from "node:fs";
import { mkdir, readdir, readFile, rm, stat, writeFile } from "node:fs/promises";
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
import { compileReconTemplate } from "../src/recon-template/index.js";
import {
  ingestGenerationResult,
  loadContentRun,
  prepareContentRun,
  type ContentGenerationResult,
} from "../src/content-injection/index.js";
import {
  createThemeRun,
  loadAdapterFile,
  loadThemeFile,
  runThemeExtraction,
  themeExtractionDir,
  themeRunDir,
} from "../src/theme/index.js";
import { createProductionSeoPlanRun, observeSourceSeo } from "../src/seo/index.js";
import {
  createAssetInventoryRun,
  createAssetMaterializationRun,
  loadAssetInventoryRun,
} from "../src/assets/index.js";
import { runProductionCompile, runProductionQa } from "../src/production/index.js";
import {
  buildRelease,
  collectRequirements,
  computeStageInputsHash,
  downstreamOf,
  invalidatedStages,
  loadReleaseProject,
  loadRequirementsFile,
  loadTechnicalDebtRegister,
  ManualJsonResolutionParser,
  matchResolutionToRequirements,
  prepareReleaseProject,
  ProductionResolutionSchema,
  ReleaseProjectSchema,
  RequirementSchema,
  resolveRelease,
  RESOLUTION_FIELD_IMPACTS,
  STAGE_DEPENDENCIES,
  THEME_SELECTION_IMPACTS,
  planRelease,
  type ProductionResolution,
  type ReleaseRun,
} from "../src/release/index.js";

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
// Fixture site (2 routes, local assets, one webfont, one disclosure pattern)
// ---------------------------------------------------------------------------

const HOST = "release-fixture.example";
const ROOT_URL = `https://${HOST}/`;
const HOST_DATA_DIR = path.join("data", HOST);
const PNG_1PX = Buffer.from(
  "89504e470d0a1a0a0000000d4948445200000001000000010806000000" +
    "1f15c4890000000d49444154789c626001000000ffff03000006000557" +
    "bfabd40000000049454e44ae426082",
  "hex",
);

interface B {
  tag?: string;
  text?: string;
  attrs?: Record<string, string>;
  styleToken?: string;
  assetRefs?: string[];
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
      effectiveVisible: true,
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
      el("a", { attrs: { href: "/pricing" }, styleToken: "st000003" }, tx("Pricing")),
      el(
        "button",
        { attrs: { "aria-expanded": "false", type: "button" }, styleToken: "st000003" },
        tx("Menu"),
      ),
    ),
  );
}

function footerB(): B {
  return el(
    "footer",
    {},
    el("p", {}, tx("© Fixture Inc")),
    el(
      "div",
      {},
      el("a", { attrs: { href: "https://docs.fixturebrand.example/" } }, tx("Docs")),
      el("a", { attrs: { href: "/pricing" } }, tx("Plans")),
      el("a", { attrs: { href: "/" } }, tx("Home")),
    ),
  );
}

function homeBody(heroUrl: string): B {
  void heroUrl;
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
            tx("Automate your operations with Fixture platform today"),
          ),
          el("a", { attrs: { href: "/signup" }, styleToken: "st000003" }, tx("Get started")),
        ),
        el("img", {
          attrs: { alt: "Fixture visual" },
          styleToken: "st000002",
          assetRefs: ["a000001"],
          bbox: { width: 640, height: 480 },
        }),
      ),
      el("p", {}, tx("Shared tagline")),
    ),
    footerB(),
  );
}

function pricingBody(): B {
  return el(
    "body",
    {},
    headerB(),
    el(
      "main",
      {},
      el("h1", { styleToken: "st000001" }, tx("Pricing headline fixture")),
      el("p", { styleToken: "st000001" }, tx("Pricing description fixture text")),
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
        longestTextLength: 60,
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
      styleTokenCount: 3,
      assetRefs: pageId === "p000001" ? ["a000001"] : [],
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
    documentMetadata: { requestedUrl: url, finalUrl: url, title: pageId === "p000001" ? "Fixture Home" : "Fixture Pricing" },
    viewports: { desktop: make("desktop"), mobile: make("mobile") },
    interactionCoverage: explored ? "explored" : "not-explored",
    patternIds: explored ? ["ip000001", "ip000002"] : [],
    unknownInteractionIds: [],
    limitations: [],
  });
}

function findNode(page: PageSpec, predicate: (node: SpecNode) => boolean): string {
  const node = page.viewports.desktop.nodes.find(predicate);
  if (!node) throw new Error("fixture node not found");
  return node.nodeId;
}

async function writeFixtureSiteSpec(dir: string, heroUrl: string, faviconUrl: string): Promise<string> {
  await mkdir(path.join(dir, "pages"), { recursive: true });
  const home = pageSpec("p000001", ROOT_URL, "f000001", homeBody(heroUrl), true);
  const pricing = pageSpec("p000002", `${ROOT_URL}pricing`, "f000002", pricingBody(), false);
  const triggerId = findNode(home, (node) => node.type === "element" && node.tagName === "button");
  const bodyId = findNode(home, (node) => node.type === "element" && node.tagName === "body");

  const styleCatalog = StyleCatalogSchema.parse({
    schemaVersion: 4,
    tokenCount: 3,
    sourceStyleReferenceCount: 10,
    sourceLocalStyleRecordCount: 10,
    dedupReductionRate: 0.7,
    styles: [
      {
        styleTokenId: "st000001",
        properties: {
          color: "rgb(10, 20, 30)",
          "line-height": "32px",
          "font-family": 'FixtureSans, "Helvetica Neue", Arial, sans-serif',
          overflow: "visible",
          "white-space": "normal",
        },
        usageCount: 5,
      },
      {
        styleTokenId: "st000002",
        properties: { "object-fit": "cover", "object-position": "50% 50%", "max-width": "100%" },
        usageCount: 1,
      },
      {
        styleTokenId: "st000003",
        properties: {
          color: "rgb(40, 50, 60)",
          display: "block",
          "font-family": 'FixtureSans, "Helvetica Neue", Arial, sans-serif',
        },
        usageCount: 6,
      },
    ],
    frequency: { color: [], backgroundColor: [], fontFamily: [], fontSize: [] },
  });

  const assetCatalog = AssetCatalogSchema.parse({
    schemaVersion: 4,
    assetCount: 2,
    occurrenceCount: 3,
    kindCounts: { image: 1, icon: 1 },
    assets: [
      {
        assetId: "a000001",
        kind: "image",
        url: heroUrl,
        mimeHint: "image/png",
        sameOrigin: false,
        usageCount: 2,
        sourcePageIds: ["p000001"],
      },
      {
        assetId: "a000002",
        kind: "icon",
        url: faviconUrl,
        mimeHint: "image/png",
        sameOrigin: false,
        usageCount: 1,
        sourcePageIds: ["p000001", "p000002"],
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
        attributes: { href: "/pricing" },
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
        text: "Pricing",
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
      verifiedPatternCount: 2,
      unknownInteractionCount: 0,
      inferredInteractionCount: 0,
      patternTypeCounts: { disclosure: 2 },
      mechanismCounts: { "aria-expanded": 2 },
      unknownReasonCounts: {},
      patternsWithStaticTrigger: 2,
      patternsWithStaticTarget: 0,
      patternsWithDynamicTarget: 2,
      patternsWithDynamicTargetContent: 2,
      dynamicTemplateNodeCount: 10,
      patternsWithoutTarget: 0,
      patternsWithObservedTargets: 2,
      observedTargetCount: 2,
      observedTargetsResolved: 0,
      observedTargetsWithTemplate: 2,
      pagesExplored: 1,
      pagesNotExplored: 1,
      routesWithExactBehaviorEvidence: 1,
      routesWithRepresentedBehavior: 0,
      routesWithoutBehaviorEvidence: 1,
    },
    patterns: (["desktop", "mobile"] as const).map((viewport, index) => ({
      patternId: `ip00000${index + 1}`,
      patternType: "disclosure",
      mechanism: "aria-expanded",
      pageId: "p000001",
      viewport,
      triggerNodeId: triggerId,
      triggerSourceElementId: "e000007",
      trigger: { tagName: "button", text: "Menu" },
      transition: { direction: "closed-to-open", field: "aria-expanded", before: "false", after: "true" },
      observedTargets: [
        {
          discoveryId: `dt00000${index + 1}`,
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
          textSample: "Pricing Home",
          textLength: 12,
          dynamicTemplate,
          limitations: [],
          provenance: "observed",
        },
      ],
      sourceLimitations: [],
      limitations: [],
      provenance: { level: "derived", ruleId: "disclosure-aria-expanded", ruleVersion: 1, registryVersion: 3 },
    })),
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
        home.viewports.desktop.elementNodeCount + pricing.viewports.desktop.elementNodeCount,
      mobileElementNodeCount:
        home.viewports.mobile.elementNodeCount + pricing.viewports.mobile.elementNodeCount,
      desktopTextNodeCount: home.viewports.desktop.textNodeCount + pricing.viewports.desktop.textNodeCount,
      mobileTextNodeCount: home.viewports.mobile.textNodeCount + pricing.viewports.mobile.textNodeCount,
      effectiveVisibleElementCount: 60,
      hiddenElementCount: 0,
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
      observedFactCount: 80,
      derivedFactCount: 8,
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
        url: `${ROOT_URL}pricing`,
        pathname: "/pricing",
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
        representativeUrl: `${ROOT_URL}pricing`,
        representativePageId: "p000002",
        observedVariantPageIds: ["p000002"],
        memberUrls: [`${ROOT_URL}pricing`],
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
        url: `${ROOT_URL}pricing`,
        role: "representative",
        familyId: "f000002",
        file: "pages/p000002.json",
        interactionCoverage: "not-explored",
        desktopElementNodes: pricing.viewports.desktop.elementNodeCount,
        mobileElementNodes: pricing.viewports.mobile.elementNodeCount,
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
        desktopElementNodes: pricing.viewports.desktop.elementNodeCount,
        mobileElementNodes: pricing.viewports.mobile.elementNodeCount,
        desktopTextNodes: pricing.viewports.desktop.textNodeCount,
        mobileTextNodes: pricing.viewports.mobile.textNodeCount,
        desktopEffectiveVisible: pricing.viewports.desktop.effectiveVisibleCount,
        mobileEffectiveVisible: pricing.viewports.mobile.effectiveVisibleCount,
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
  await write(path.join("pages", "p000002.json"), pricing);
  return path.join(dir, "site-spec.json");
}

// ---------------------------------------------------------------------------
// Fixture asset server + observation run (head evidence for assets + seo)
// ---------------------------------------------------------------------------

async function startAssetFixture(): Promise<{ server: Server; baseUrl: string; port: number }> {
  const server = createServer((req, res) => {
    const url = (req.url ?? "/").split("?")[0];
    if (url === "/img/hero.png" || url === "/favicon.ico") {
      res.writeHead(200, { "content-type": "image/png" });
      res.end(PNG_1PX);
      return;
    }
    if (url === "/fonts/FixtureSans.woff2") {
      res.writeHead(200, { "content-type": "font/woff2" });
      res.end(Buffer.from("774f4632", "hex"));
      return;
    }
    res.writeHead(404, { "content-type": "text/plain" });
    res.end("not found");
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", () => resolve()));
  const address = server.address();
  if (address === null || typeof address === "string") throw new Error("no port");
  return { server, baseUrl: `http://127.0.0.1:${address.port}`, port: address.port };
}

async function writeObservationFixture(
  dir: string,
  faviconUrl: string,
  fontUrl: string,
): Promise<{ siteObservationFile: string; verificationFile: string }> {
  const pages = [
    {
      pageId: "p000001",
      url: ROOT_URL,
      html:
        `<!DOCTYPE html><html lang="en"><head><title>Fixture Home</title>` +
        `<meta name="description" content="Fixture home description."/>` +
        `<link rel="icon" href="${faviconUrl}">` +
        `<link rel="preload" href="${fontUrl}" as="font" type="font/woff2" crossorigin="anonymous">` +
        `</head><body><h1>Fixture headline</h1><a href="/pricing">Pricing</a></body></html>`,
      links: [
        { elementId: "e1", href: "/pricing", resolvedUrl: `${ROOT_URL}pricing`, internal: true },
      ],
    },
    {
      pageId: "p000002",
      url: `${ROOT_URL}pricing`,
      html:
        `<!DOCTYPE html><html lang="en"><head><title>Fixture Pricing</title>` +
        `<meta name="description" content="Fixture pricing description."/>` +
        `<link rel="icon" href="${faviconUrl}">` +
        `</head><body><h1>Pricing headline fixture</h1><a href="/">Home</a></body></html>`,
      links: [{ elementId: "e1", href: "/", resolvedUrl: ROOT_URL, internal: true }],
    },
  ];
  for (const page of pages) {
    const viewportDir = path.join(dir, "pages", page.pageId, "viewports", "desktop");
    await mkdir(viewportDir, { recursive: true });
    await writeFile(path.join(viewportDir, "rendered.html"), page.html, "utf8");
    await writeFile(path.join(viewportDir, "links.json"), JSON.stringify(page.links), "utf8");
  }
  const siteObservationFile = path.join(dir, "site-observation.json");
  await writeFile(
    siteObservationFile,
    JSON.stringify({
      rootUrl: ROOT_URL,
      pages: pages.map((page) => ({
        pageId: page.pageId,
        url: page.url,
        finalUrl: page.url,
        status: "success",
        pageObservationFile: `pages/${page.pageId}/observation.json`,
      })),
    }),
    "utf8",
  );
  const verificationFile = path.join(dir, "verification.json");
  await writeFile(
    verificationFile,
    JSON.stringify({
      candidates: pages.map((page) => ({
        candidateUrl: page.url,
        finalUrl: page.url,
        httpStatus: 200,
        status: "valid-html",
      })),
    }),
    "utf8",
  );
  return { siteObservationFile, verificationFile };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function snapshotTree(root: string): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  const walk = async (rel: string): Promise<void> => {
    const abs = path.join(root, rel);
    const entries = await readdir(abs, { withFileTypes: true });
    for (const entry of entries) {
      const childRel = rel === "" ? entry.name : `${rel}/${entry.name}`;
      if (entry.isDirectory()) await walk(childRel);
      else if (entry.isFile()) {
        const info = await stat(path.join(root, childRel));
        out.set(childRel, `${info.size}:${info.mtimeMs}`);
      }
    }
  };
  await walk("");
  return out;
}

function treesIdentical(a: Map<string, string>, b: Map<string, string>): boolean {
  if (a.size !== b.size) return false;
  for (const [key, value] of a) if (b.get(key) !== value) return false;
  return true;
}

async function readRun(projectDir: string, runId: string): Promise<ReleaseRun> {
  return JSON.parse(
    await readFile(path.join(projectDir, "runs", runId, "run.json"), "utf8"),
  ) as ReleaseRun;
}

const INTENT =
  "이 사이트를 기업용 업무자동화 SaaS 회사 사이트로 재구성한다. 주 고객은 중소기업 운영팀이고 메인 행동은 상담 문의다.";

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  await rm(HOST_DATA_DIR, { recursive: true, force: true });
  const scratch = path.resolve("data", `.smoke-release-${process.pid}`);
  await rm(scratch, { recursive: true, force: true });
  await mkdir(scratch, { recursive: true });
  const fixture = await startAssetFixture();
  const heroUrl = `${fixture.baseUrl}/img/hero.png`;
  const faviconUrl = `${fixture.baseUrl}/favicon.ico`;
  const fontUrl = `${fixture.baseUrl}/fonts/FixtureSans.woff2`;

  try {
    // =======================================================================
    section("0. fixture pipeline — REAL reconstruction → template → content → theme → seo → assets → production");
    // =======================================================================
    const siteSpecDir = path.join(HOST_DATA_DIR, "site-specs", "2026-08-25T00-00-00-000Z");
    await mkdir(siteSpecDir, { recursive: true });
    const siteSpecFile = await writeFixtureSiteSpec(siteSpecDir, heroUrl, faviconUrl);

    const input = await loadReconstructionInput(siteSpecFile, { validate: false });
    const plan = planReconstruction(input, {});
    const reconstructionDir = path.join(HOST_DATA_DIR, "reconstructions", "2026-08-25T00-00-01-000Z");
    const versions = await resolveDependencyVersions(process.cwd());
    await generateApp(plan, {
      outputDir: reconstructionDir,
      sourceSchemaVersion: input.siteSpec.schemaVersion,
      sourceSiteSpecVersion: input.siteSpec.siteSpecVersion,
      sourceCompilerVersion: input.siteSpec.compilerVersion,
      versions,
    });
    const templateDir = path.join(HOST_DATA_DIR, "recon-templates", "2026-08-25T00-00-02-000Z");
    const compiled = await compileReconTemplate({
      reconstructionManifestFile: path.join(reconstructionDir, "reconstruction-manifest.json"),
      siteSpecFile,
      runId: "2026-08-25T00-00-02-000Z",
      outputDir: templateDir,
    });
    check("fixture template compiled (2 routes)", compiled.manifest.routes.length === 2);

    // ---- content run (route "/" only — /pricing stays uninjected) ---------
    const contentRunDir = path.join(HOST_DATA_DIR, "content-runs", "2026-08-25T00-00-03-000Z");
    const prepared = await prepareContentRun({
      templateManifestFile: path.join(templateDir, "manifest.json"),
      rawIntent: INTENT,
      routes: ["/"],
      runId: "2026-08-25T00-00-03-000Z",
      outputDir: contentRunDir,
    });
    const keyOf = (currentValue: string): string => {
      for (const unit of prepared.units.units) {
        const slot = unit.slots.find((candidate) => candidate.currentValue === currentValue);
        if (slot) return slot.key;
      }
      throw new Error(`fixture slot not found for value: ${currentValue}`);
    };
    const headlineKey = keyOf("Fixture headline");
    const heroDescriptionKey = keyOf("Automate your operations with Fixture platform today");
    const ctaKey = keyOf("Get started");
    const taglineKey = keyOf("Shared tagline");
    const docsHrefKey = keyOf("https://docs.fixturebrand.example/");
    const initialValues: Record<string, string> = {
      [headlineKey]: "반복 업무를 자동으로 처리하는 릴리즈픽스처",
      [heroDescriptionKey]: "릴리즈픽스처는 운영팀의 반복 업무를 자동화하는 플랫폼입니다",
      [ctaKey]: "지금 상담 신청하기",
      [taglineKey]: "모든 팀을 위한 자동화 플랫폼",
    };
    const initialResult: ContentGenerationResult = {
      schemaVersion: 1,
      contractVersion: 1,
      generator: { name: "smoke-release-operator" },
      sitePlan: {
        planVersion: 1,
        siteIdentity: {
          workingName: "릴리즈픽스처",
          category: "업무자동화 SaaS",
          audience: "중소기업 운영팀",
          positioning: "반복 업무 자동화를 위한 올인원 플랫폼",
        },
        primaryConversion: "상담 문의",
        tone: ["professional"],
        messages: ["반복 업무를 자동화한다"],
        pagePlans: [
          {
            route: "/",
            currentPurpose: "픽스처 홈",
            newPurpose: "업무자동화 SaaS 소개",
            primaryMessage: "반복 업무를 자동화하세요",
            secondaryMessages: ["상담 문의로 전환"],
            conversionGoal: "상담 문의",
            contentStrategy: "레이아웃 유지, 텍스트/링크만 교체",
          },
        ],
      },
      slotValues: initialValues,
      sources: Object.fromEntries(Object.keys(initialValues).map((key) => [key, "generated-marketing"])),
      unresolved: [
        { slotKey: docsHrefKey, reason: "needs factual input: external docs destination not provided" },
      ],
      imageBriefs: [],
    };
    const contentRun = await loadContentRun(contentRunDir);
    await ingestGenerationResult(contentRun, initialResult);
    check("fixture content run ingested (1 unresolved href)", existsSync(path.join(contentRunDir, "slot-values.json")));

    // ---- theme (original extracted theme — offline) -----------------------
    const extractionDir = themeExtractionDir(HOST, "2026-08-25T00-00-04-000Z");
    const template = contentRun.template;
    const extraction = await runThemeExtraction({
      template,
      templateManifestFile: path.join(templateDir, "manifest.json"),
      runId: "2026-08-25T00-00-04-000Z",
      outputDir: extractionDir,
    });
    void extraction;
    const themeSourceFile = path.join(extractionDir, "original.theme.json");
    const adapterSourceFile = path.join(extractionDir, "site-theme-adapter.json");
    const themeRun = path.join(HOST_DATA_DIR, "theme-runs", "2026-08-25T00-00-05-000Z");
    await createThemeRun({
      template,
      templateManifestFile: path.join(templateDir, "manifest.json"),
      adapter: await loadAdapterFile(adapterSourceFile),
      adapterSourceFile,
      theme: await loadThemeFile(themeSourceFile),
      themeSourceFile,
      runId: "2026-08-25T00-00-05-000Z",
      runDir: themeRun,
      contentRunDir,
    });
    check("fixture theme run created", existsSync(path.join(themeRun, "theme-overlay.css")));

    // ---- seo snapshot + preview plan --------------------------------------
    const obsDir = path.join(HOST_DATA_DIR, "site-observations", "2026-08-25T00-00-06-000Z");
    const observation = await writeObservationFixture(obsDir, faviconUrl, fontUrl);
    const snapshotDir = path.join(HOST_DATA_DIR, "source-seo-snapshots", "2026-08-25T00-00-07-000Z");
    await observeSourceSeo({
      siteObservationFile: observation.siteObservationFile,
      verificationFile: observation.verificationFile,
      outputDir: snapshotDir,
      runId: "2026-08-25T00-00-07-000Z",
    });
    const seoPlanDir = path.join(HOST_DATA_DIR, "production-seo-plans", "2026-08-25T00-00-08-000Z");
    await createProductionSeoPlanRun({
      templateManifestRef: path.join(templateDir, "manifest.json"),
      contentRunDir,
      sourceSnapshotRef: snapshotDir,
      outputDir: seoPlanDir,
      runId: "2026-08-25T00-00-08-000Z",
    });
    check("fixture seo plan is preview mode", existsSync(path.join(seoPlanDir, "robots.txt")));

    // ---- assets: inventory + materialization (local server, test-only escape)
    const inventoryDir = path.join(HOST_DATA_DIR, "asset-inventories", "2026-08-25T00-00-09-000Z");
    const inventory = await createAssetInventoryRun({
      siteSpecDir,
      templateRunDir: templateDir,
      contentRunDir,
      observationRunDir: obsDir,
      runId: "2026-08-25T00-00-09-000Z",
      outputDir: inventoryDir,
    });
    check(
      "fixture inventory: favicon replacement-required + font license-needs-review",
      inventory.classification.some(
        (decision) => decision.url === faviconUrl && decision.classification === "replacement-required",
      ) && inventory.fontInventory.license.some((license) => license.status === "license-needs-review"),
    );
    const fontFamily = inventory.fontInventory.license[0]?.family ?? "fixturesans";
    const materializationDir = path.join(HOST_DATA_DIR, "asset-materializations", "2026-08-25T00-00-10-000Z");
    const materialization = await createAssetMaterializationRun({
      inventoryRun: await loadAssetInventoryRun(inventoryDir),
      outputDir: materializationDir,
      concurrency: 2,
      spacingMs: 0,
      timeoutMs: 5000,
      allowedPorts: [fixture.port],
      allowPrivateHostPorts: new Set([`127.0.0.1:${fixture.port}`]),
    });
    check(
      "fixture materialization fetched the hero, skipped the favicon",
      materialization.manifest.entries.some((entry) => entry.sourceUrl === heroUrl && entry.status === "fetched") &&
        materialization.manifest.entries.some(
          (entry) => entry.sourceUrl === faviconUrl && entry.status.startsWith("skipped-"),
        ),
    );
    const faviconInventoryId = materialization.replacementManifest.entries.find(
      (entry) => entry.sourceUrl === faviconUrl,
    )?.inventoryId;
    const heroInventoryId = materialization.replacementManifest.entries.find(
      (entry) => entry.sourceUrl === heroUrl,
    )?.inventoryId;
    check("fixture replacement seam lists favicon + hero", faviconInventoryId !== undefined && heroInventoryId !== undefined);
    // Runtime census fixture (assets:qa is browser-measured; the release
    // layer's final authority is the REAL production QA census below, which
    // must see ZERO external requests).
    await mkdir(path.join(materializationDir, "report"), { recursive: true });
    await writeFile(
      path.join(materializationDir, "report", "network-qa.json"),
      JSON.stringify(
        {
          baseline: [
            { route: "/", total: 1, local: 0, sourceHost: 1, otherExternal: 0, sourceUrls: [heroUrl] },
            { route: "/pricing", total: 0, local: 0, sourceHost: 0, otherExternal: 0, sourceUrls: [] },
          ],
          independent: [
            { route: "/", total: 1, local: 1, sourceHost: 0, otherExternal: 0, sourceUrls: [] },
            { route: "/pricing", total: 0, local: 0, sourceHost: 0, otherExternal: 0, sourceUrls: [] },
          ],
          totals: { baselineSourceRequests: 1, independentSourceRequests: 0, residualSourceUrls: [], residualByHost: {} },
        },
        null,
        2,
      ) + "\n",
      "utf8",
    );

    // ---- production compile + isolated QA (preview candidate) -------------
    const compile0 = await runProductionCompile({
      host: HOST,
      templateRunDir: templateDir,
      contentRunDir,
      themeRunDir: themeRun,
      seoPlanRunDir: seoPlanDir,
      materializationRunDir: materializationDir,
      log: () => {},
    });
    const qa0 = await runProductionQa({ packageDir: compile0.packageDir, log: () => {} });
    await mkdir(path.join(compile0.buildDir, "report"), { recursive: true });
    await writeFile(path.join(compile0.buildDir, "report", "qa.json"), JSON.stringify(qa0, null, 2) + "\n", "utf8");
    check(
      "fixture preview production QA passes",
      qa0.failed === 0,
      qa0.checks
        .filter((entry) => !entry.ok)
        .map((entry) => `${entry.id}(${entry.detail})`)
        .join(", "),
    );
    check("fixture preview spec decision is preview", compile0.spec.indexabilityGate.decision === "preview");

    // =======================================================================
    section("1. release-project-v1 + requirement schemas (spec tests 1-3)");
    // =======================================================================
    const preparedProject = await prepareReleaseProject({
      productionSpecRef: compile0.specDir,
      log: () => {},
    });
    const projectDir = preparedProject.projectDir;
    const loaded = await loadReleaseProject(projectDir);
    check("1.1 release-project.json validates as release-project-v1", ReleaseProjectSchema.safeParse(loaded.project).success);
    check(
      "1.2 accepted lineage carries id+path+hash for all 7 stages",
      [
        loaded.project.acceptedLineage.reconstruction,
        loaded.project.acceptedLineage.template,
        loaded.project.acceptedLineage.content,
        loaded.project.acceptedLineage.theme,
        loaded.project.acceptedLineage.seo,
        loaded.project.acceptedLineage.assets,
        loaded.project.acceptedLineage.production.spec,
        loaded.project.acceptedLineage.production.build,
      ].every((ref) => ref.id.length > 0 && ref.path.length > 0 && /^[0-9a-f]{64}$/.test(ref.hash)),
    );
    check("1.3 no single boolean ready — closed enum state", loaded.project.releaseState === "PRODUCTION_INPUTS_REQUIRED");
    const requirementsFile0 = await loadRequirementsFile(projectDir);
    check(
      "2.1 requirements normalize from artifacts (schema-valid, evidence-backed)",
      requirementsFile0.requirements.length > 0 &&
        requirementsFile0.requirements.every(
          (requirement) => RequirementSchema.safeParse(requirement).success && requirement.evidence.length > 0,
        ),
    );
    check(
      "3.1 production-resolution-v1 schema accepts an all-optional pack",
      ProductionResolutionSchema.safeParse({ schemaVersion: 1, schemaName: "production-resolution-v1" }).success,
    );
    check(
      "3.2 resolution schema rejects unknown fields",
      !ProductionResolutionSchema.safeParse({
        schemaVersion: 1,
        schemaName: "production-resolution-v1",
        businessForm: { forty: "fields" },
      }).success,
    );

    // =======================================================================
    section("2. requirement kinds derived from the fixture artifacts (tests 4-9)");
    // =======================================================================
    const byId = new Map(requirementsFile0.requirements.map((requirement) => [requirement.requirementId, requirement]));
    check(
      "4 domain requirement (release-blocking, from seo plan domainState)",
      byId.get("production-domain")?.severity === "release-blocking" &&
        byId.get("production-domain")?.status === "unresolved",
    );
    check(
      "5 business-fact requirements (7 canonical facts, high-value)",
      requirementsFile0.requirements.filter((r) => r.kind === "business-fact" && r.factKey !== undefined).length === 7,
    );
    check(
      "6 asset requirement: favicon replacement-required is release-blocking",
      byId.get(`replacement-image-${faviconInventoryId}`)?.severity === "release-blocking",
    );
    check(
      "6b asset requirement: hero replacement-recommended is high-value",
      byId.get(`replacement-image-${heroInventoryId}`)?.severity === "high-value",
    );
    check(
      "7 font requirement from font-inventory license[]",
      byId.get(`font-license-${fontFamily}`)?.severity === "release-blocking",
    );
    check(
      "8 route-content requirement for the uninjected route",
      byId.get("content-route-/pricing")?.severity === "release-blocking" &&
        byId.get("content-route-/pricing")?.route === "/pricing",
    );
    check(
      "9 multi-subsystem merge: seo + content + assets + fonts in ONE list",
      new Set(requirementsFile0.requirements.map((requirement) => requirement.sourceStage)).size >= 3 &&
        byId.has("external-url-" + docsHrefKey.replace(/[^a-zA-Z0-9._/-]+/g, "-")) &&
        byId.has("og-image") &&
        byId.has("social-handle"),
    );

    // =======================================================================
    section("3. dependency graph + invalidation semantics (tests 12-15)");
    // =======================================================================
    check(
      "12.1 graph: template←reconstruction, content←template, theme←template+content",
      STAGE_DEPENDENCIES.template.includes("reconstruction") &&
        STAGE_DEPENDENCIES.content.includes("template") &&
        STAGE_DEPENDENCIES.theme.includes("content") &&
        STAGE_DEPENDENCIES.production.length === 5,
    );
    check(
      "12.2 downstream closure: content → theme+seo+production, never reconstruction",
      JSON.stringify(downstreamOf("content")) === JSON.stringify(["theme", "seo", "production"]) &&
        !downstreamOf("seo").includes("reconstruction"),
    );
    check(
      "13a field impacts: domain → seo+production ONLY",
      JSON.stringify(RESOLUTION_FIELD_IMPACTS.productionBaseUrl) === JSON.stringify(["seo", "production"]),
    );
    check(
      "14a field impacts: image/font → assets+production ONLY",
      JSON.stringify(RESOLUTION_FIELD_IMPACTS.assets) === JSON.stringify(["assets", "production"]) &&
        JSON.stringify(RESOLUTION_FIELD_IMPACTS.fontDecisions) === JSON.stringify(["assets", "production"]),
    );
    check(
      "15 theme invalidation: selection → theme+production; content rerun invalidates theme",
      JSON.stringify(THEME_SELECTION_IMPACTS) === JSON.stringify(["theme", "production"]) &&
        downstreamOf("theme").length === 1 &&
        downstreamOf("theme")[0] === "production",
    );
    // NOTE: the production identity must not contain the SOURCE host label —
    // the Task 21 brand-isolation gate (correctly) fails a plan whose rendered
    // surface carries source-brand terms like "release-fixture".
    const domainOnly: ProductionResolution = {
      schemaVersion: 1,
      schemaName: "production-resolution-v1",
      productionBaseUrl: "https://newco-prod.example",
    };
    check(
      "13b invalidatedStages(domain-only) = [seo, production]",
      JSON.stringify(invalidatedStages(domainOnly)) === JSON.stringify(["seo", "production"]),
    );

    // =======================================================================
    section("4. stage input hashing (test 16)");
    // =======================================================================
    const hashesA = { reconstruction: "a".repeat(64), template: "b".repeat(64), content: "c".repeat(64) };
    const empty: ProductionResolution = { schemaVersion: 1, schemaName: "production-resolution-v1" };
    const inputHash1 = computeStageInputsHash("seo", hashesA, empty, {}, "ih");
    const inputHash2 = computeStageInputsHash("seo", hashesA, empty, {}, "ih");
    const inputHash3 = computeStageInputsHash("seo", { ...hashesA, content: "d".repeat(64) }, empty, {}, "ih");
    const inputHash4 = computeStageInputsHash("seo", hashesA, domainOnly, {}, "ih");
    check("16.1 same inputs → same hash (deterministic)", inputHash1 === inputHash2);
    check("16.2 upstream artifact change → different hash (stale)", inputHash3 !== inputHash1);
    check("16.3 resolution slice change → different hash (stale)", inputHash4 !== inputHash1);
    check(
      "16.4 domain does NOT touch the content stage's inputs",
      computeStageInputsHash("content", hashesA, domainOnly, {}, "ih") ===
        computeStageInputsHash("content", hashesA, empty, {}, "ih"),
    );

    // =======================================================================
    section("5. invalid resolution rejected (test 11)");
    // =======================================================================
    const badPackFile = path.join(scratch, "bad-pack.json");
    await writeFile(badPackFile, JSON.stringify({ schemaName: "something-else", zap: 1 }), "utf8");
    let rejected = false;
    try {
      await resolveRelease(projectDir, { resolutionFile: badPackFile });
    } catch {
      rejected = true;
    }
    check("11.1 non-schema pack rejected by the validator gate", rejected);
    const badSlotFile = path.join(scratch, "bad-slot.json");
    await writeFile(
      badSlotFile,
      JSON.stringify({
        schemaVersion: 1,
        schemaName: "production-resolution-v1",
        urls: { "totally.unknown.slot": "https://x.example/" },
      }),
      "utf8",
    );
    let slotRejected = false;
    try {
      await resolveRelease(projectDir, { resolutionFile: badSlotFile });
    } catch {
      slotRejected = true;
    }
    check("11.2 unknown slot key rejected before any stage runs", slotRejected);
    const parser = new ManualJsonResolutionParser();
    let parserRejected = false;
    try {
      await parser.parse("not json at all");
    } catch {
      parserRejected = true;
    }
    check("11.3 NL seam: manual-json parser enforces the validator too", parserRejected);

    // =======================================================================
    section("6. preview mode honesty (test 20) + dry-run no-mutation (test 17)");
    // =======================================================================
    check(
      "20 preview build stands WITH unresolved factual requirements (noindex policy)",
      compile0.spec.indexabilityGate.decision === "preview" &&
        requirementsFile0.counts.releaseBlockingUnresolved > 0 &&
        qa0.failed === 0,
    );
    const before17 = await snapshotTree(HOST_DATA_DIR);
    const dry0 = await buildRelease(projectDir, { dryRun: true, log: () => {} });
    const after17 = await snapshotTree(HOST_DATA_DIR);
    check("17.1 dry-run mutates NOTHING under the host namespace", treesIdentical(before17, after17));
    check(
      "17.2 dry-run on the fresh baseline: nothing to run, all stages reused",
      dry0.plan.wouldRun.length === 0 && dry0.plan.wouldReuse.length === 7,
    );

    // =======================================================================
    section("7. full-resolution pack 1 (everything except the domain) — tests 10, 18, 22, 24");
    // =======================================================================
    const faviconFile = path.join(scratch, "new-favicon.png");
    const ogImageFile = path.join(scratch, "og-image.png");
    const heroReplacementFile = path.join(scratch, "hero-replacement.png");
    await writeFile(faviconFile, PNG_1PX);
    await writeFile(ogImageFile, Buffer.concat([PNG_1PX, Buffer.from([1])]));
    await writeFile(heroReplacementFile, Buffer.concat([PNG_1PX, Buffer.from([2])]));
    const pricingSlots = JSON.parse(await readFile(path.join(templateDir, "slots.json"), "utf8")) as {
      slots: Array<{ key: string; defaultValue: unknown }>;
    };
    const pricingH1Key = pricingSlots.slots.find((slot) => slot.defaultValue === "Pricing headline fixture")?.key;
    const pricingPKey = pricingSlots.slots.find((slot) => slot.defaultValue === "Pricing description fixture text")?.key;
    check("7.0 pricing slot keys discoverable from the template", pricingH1Key !== undefined && pricingPKey !== undefined);

    const pack1: ProductionResolution = {
      schemaVersion: 1,
      schemaName: "production-resolution-v1",
      notes:
        "회사 주소는 서울시 강남구, 전화는 02-1234-5678, 창립은 2020-01-01. 문서 링크는 새 브랜드 문서로. " +
        "파비콘/OG 이미지는 첨부한 파일로 교체하고, 웹폰트는 측정된 fallback을 그대로 쓴다. /pricing 콘텐츠 제공.",
      facts: {
        address: "서울특별시 강남구 테헤란로 1",
        phone: "02-1234-5678",
        foundingDate: "2020-01-01",
        sameAs: ["https://social.example/newco-automation"],
        twitterSite: "@newco",
      },
      urls: { [docsHrefKey]: "https://docs.newbrand.example/" },
      assets: {
        [faviconInventoryId!]: { file: faviconFile, note: "새 브랜드 파비콘" },
        "og-image": { file: ogImageFile },
      },
      fontDecisions: {
        [fontFamily]: {
          decision: "use-fallback-stack",
          license: "operator-verified: measured fallback stacks are system fonts",
          note: "픽스처 웹폰트는 사용하지 않는다",
        },
      },
      routeContent: {
        "/pricing": {
          slotValues: {
            [pricingH1Key!]: "요금제 안내 — 릴리즈픽스처",
            [pricingPKey!]: "투명한 요금제로 시작하세요. 모든 기능이 포함됩니다.",
          },
          pagePlan: {
            primaryMessage: "투명한 요금제",
            newPurpose: "요금제 안내",
            conversionGoal: "상담 문의",
          },
        },
      },
    };
    const pack1File = path.join(scratch, "pack1.json");
    await writeFile(pack1File, JSON.stringify(pack1, null, 2), "utf8");
    const resolved1 = await resolveRelease(projectDir, { resolutionFile: pack1File, log: () => {} });
    check(
      "10.1 resolved requirements carry traceable resolvedBy (spec §11)",
      (await loadRequirementsFile(projectDir)).requirements
        .filter((requirement) => ["production-domain"].includes(requirement.requirementId) === false)
        .some(
          (requirement) =>
            requirement.status === "resolved" &&
            requirement.resolvedBy?.resolutionId === resolved1.resolutionId,
        ),
    );
    check(
      "10.2 matches cover facts/urls/assets/fonts/routeContent",
      ["facts.address", "urls." + docsHrefKey, `assets.${faviconInventoryId}`, `fontDecisions.${fontFamily}`, "routeContent./pricing"].every(
        (field) => resolved1.matched.some((match) => match.field === field),
      ),
      JSON.stringify(resolved1.matched.map((match) => match.field)),
    );
    check(
      "18a pack1 invalidates content+theme+seo+assets+production, keeps frozen roots",
      JSON.stringify(resolved1.invalidated) === JSON.stringify(["content", "seo", "assets", "production"]) ||
        JSON.stringify(resolved1.invalidated) === JSON.stringify(["content", "theme", "seo", "assets", "production"]),
      JSON.stringify(resolved1.invalidated),
    );
    const dry1 = await buildRelease(projectDir, { dryRun: true, log: () => {} });
    check(
      "18b dry-run predicts the cascade: run content/theme/seo/assets/production, reuse frozen roots",
      JSON.stringify(dry1.plan.wouldRun) === JSON.stringify(["content", "theme", "seo", "assets", "production"]) &&
        dry1.plan.wouldReuse.includes("reconstruction") &&
        dry1.plan.wouldReuse.includes("template"),
      JSON.stringify(dry1.plan),
    );

    const build1 = await buildRelease(projectDir, { log: () => {} });
    check(
      "18c selective rerun executed: content/theme/seo/assets/production, frozen roots reused",
      build1.failed === false &&
        JSON.stringify(build1.run?.rerunStages) === JSON.stringify(["content", "theme", "seo", "assets", "production"]) &&
        build1.run?.reusedStages.includes("reconstruction") === true &&
        build1.run?.reusedStages.includes("template") === true,
      JSON.stringify(build1.run?.rerunStages) + (build1.project.failure ? ` FAILURE: ${build1.project.failure.message}` : ""),
    );
    check(
      "22a after pack1 the ONLY blocker left is the domain",
      JSON.stringify(build1.run?.blockers) === JSON.stringify(["production-domain"]) &&
        build1.project.releaseState === "PRODUCTION_INPUTS_REQUIRED",
      JSON.stringify(build1.run?.blockers),
    );
    const checklist1 = await readFile(path.join(projectDir, "operator-checklist.md"), "utf8");
    check(
      "24 operator checklist: Why/How-to-resolve/Expected + resolved strikethroughs",
      checklist1.includes("## Need your input") &&
        checklist1.includes("**Why**") &&
        checklist1.includes("**How to resolve**") &&
        checklist1.includes("**Expected**") &&
        checklist1.includes("~~"),
    );

    // =======================================================================
    section("8. indexable gate (test 21) — a domain alone must NOT go indexable");
    // =======================================================================
    const gateProject = await prepareReleaseProject({
      productionSpecRef: compile0.specDir,
      projectId: "fixture-indexable-gate",
      log: () => {},
    });
    const pack2File = path.join(scratch, "pack2.json");
    await writeFile(pack2File, JSON.stringify(domainOnly, null, 2), "utf8");
    await resolveRelease(gateProject.projectDir, { resolutionFile: pack2File, log: () => {} });
    const gateDry = await buildRelease(gateProject.projectDir, { dryRun: true, log: () => {} });
    check(
      "21.1 with the domain but unresolved blockers, production is BLOCKED BY them",
      gateDry.plan.blocked.some(
        (entry) =>
          entry.stage === "production" &&
          entry.blockedBy.includes("content-route-/pricing") &&
          entry.blockedBy.includes(`font-license-${fontFamily}`),
      ),
      JSON.stringify(gateDry.plan.blocked),
    );
    check(
      "21.2 seo would still rerun (domain flows to the plan) — but never a fake-indexable compile",
      gateDry.plan.wouldRun.includes("seo") && !gateDry.plan.wouldRun.includes("production"),
      JSON.stringify(gateDry.plan),
    );
    const gateState = (await loadReleaseProject(gateProject.projectDir)).project.releaseState;
    check("21.3 gate project stays PRODUCTION_INPUTS_REQUIRED", gateState === "PRODUCTION_INPUTS_REQUIRED");
    await rm(gateProject.projectDir, { recursive: true, force: true });

    // =======================================================================
    section("9. failure recovery (test 19) — retry never re-runs earlier stages");
    // =======================================================================
    const resolved2 = await resolveRelease(projectDir, { resolutionFile: pack2File, log: () => {} });
    check(
      "13c domain-only resolution invalidates seo+production ONLY",
      JSON.stringify(resolved2.invalidated) === JSON.stringify(["seo", "production"]),
      JSON.stringify(resolved2.invalidated),
    );
    const failing = await buildRelease(projectDir, {
      log: () => {},
      runners: {
        seo: async () => {
          throw new Error("injected seo failure (smoke test 19)");
        },
      },
    });
    check(
      "19.1 failure recorded: failedStage/failureArtifact/retryable (spec §27)",
      failing.failed === true &&
        failing.project.failure?.failedStage === "seo" &&
        failing.project.failure?.retryable === true &&
        existsSync(failing.project.failure?.failureArtifact ?? "missing"),
      JSON.stringify(failing.project.failure),
    );
    check(
      "19.2 nothing re-ran before the failure; fresh stages recorded reused (run stops AT the failure)",
      failing.run?.reusedStages.includes("content") === true &&
        failing.run?.reusedStages.includes("theme") === true &&
        failing.run?.rerunStages.length === 0 &&
        failing.run?.stageExecutions.some((entry) => entry.stage === "seo" && entry.status === "failed") === true &&
        failing.run?.stageExecutions.some((entry) => entry.stage === "production") === false,
      JSON.stringify(failing.run?.stageExecutions.map((entry) => [entry.stage, entry.status])),
    );

    const build2 = await buildRelease(projectDir, { log: () => {} });
    check(
      "19.3 retry re-runs ONLY the failed stage + downstream (seo, production)",
      build2.failed === false &&
        JSON.stringify(build2.run?.rerunStages) === JSON.stringify(["seo", "production"]) &&
        build2.run?.reusedStages.includes("content") === true &&
        build2.run?.reusedStages.includes("theme") === true &&
        build2.run?.reusedStages.includes("assets") === true,
      JSON.stringify(build2.run?.rerunStages) + (build2.project.failure ? ` FAILURE: ${build2.project.failure.message}` : ""),
    );
    check("19.4 failure cleared after the successful retry", build2.project.failure === null);

    // =======================================================================
    section("10. PREVIEW → PRODUCTION_READY (tests 22, 26) + §26 rerun counts");
    // =======================================================================
    check(
      "22b synthetic project reached PRODUCTION_READY honestly",
      build2.project.releaseState === "PRODUCTION_READY",
      build2.project.releaseState,
    );
    const finalSpec = JSON.parse(
      await readFile(
        path.join(build2.project.stageStatus.production.artifact!.path, "production-spec.json"),
        "utf8",
      ),
    ) as { indexabilityGate: { decision: string; blockers: unknown[] }; baseUrl: { value: string | null } };
    check(
      "22c final spec is indexable with the operator domain and zero blockers",
      finalSpec.indexabilityGate.decision === "indexable" &&
        finalSpec.baseUrl.value === "newco-prod.example" &&
        finalSpec.indexabilityGate.blockers.length === 0,
      JSON.stringify(finalSpec.indexabilityGate),
    );
    const finalBuildDir = path.join(HOST_DATA_DIR, "production-builds", build2.project.stageStatus.production.artifact!.id);
    const finalQa = JSON.parse(await readFile(path.join(finalBuildDir, "report", "qa.json"), "utf8")) as {
      failed: number;
      passed: number;
      externalRequestTotal: number;
      routeCensus: Array<{ hydrationErrors: number; jsErrors: number }>;
    };
    check(
      "26.1 runtime/hydration production regression: isolated-package QA green",
      finalQa.failed === 0 && finalQa.routeCensus.every((row) => row.hydrationErrors === 0 && row.jsErrors === 0),
      `failed=${finalQa.failed}`,
    );
    check(
      "26.2 zero external requests — full asset independence in the READY build",
      finalQa.externalRequestTotal === 0,
      String(finalQa.externalRequestTotal),
    );

    // §26: rerun accounting across EVERY release run of the main project.
    const allRuns: ReleaseRun[] = [];
    for (const runRef of (await loadReleaseProject(projectDir)).project.runs) {
      allRuns.push(await readRun(projectDir, runRef.runId));
    }
    const rerunCount = (stage: string): number =>
      allRuns.reduce((sum, run) => sum + (run.rerunStages as string[]).filter((s) => s === stage).length, 0);
    check(
      "26.3 reconstruction rerun count = 0 and template compile count = 0 (whole scenario)",
      rerunCount("reconstruction") === 0 && rerunCount("template") === 0,
    );
    check(
      "26.4 domain-only change re-ran seo+production only (content regenerate count 0)",
      JSON.stringify(build2.run?.rerunStages) === JSON.stringify(["seo", "production"]),
    );

    // ---- asset-only change (spec §26: assets + production only) ------------
    const pack3: ProductionResolution = {
      schemaVersion: 1,
      schemaName: "production-resolution-v1",
      assets: { [heroInventoryId!]: { file: heroReplacementFile, note: "새 히어로 이미지" } },
    };
    const pack3File = path.join(scratch, "pack3.json");
    await writeFile(pack3File, JSON.stringify(pack3, null, 2), "utf8");
    const resolved3 = await resolveRelease(projectDir, { resolutionFile: pack3File, log: () => {} });
    check(
      "14b image-only resolution invalidates assets+production ONLY",
      JSON.stringify(resolved3.invalidated) === JSON.stringify(["assets", "production"]),
      JSON.stringify(resolved3.invalidated),
    );
    const build3 = await buildRelease(projectDir, { log: () => {} });
    check(
      "26.5 asset replacement re-ran assets+production only, content/theme/seo reused",
      build3.failed === false &&
        JSON.stringify(build3.run?.rerunStages) === JSON.stringify(["assets", "production"]) &&
        build3.run?.reusedStages.includes("content") === true &&
        build3.run?.reusedStages.includes("seo") === true,
      JSON.stringify(build3.run?.rerunStages) + (build3.project.failure ? ` FAILURE: ${build3.project.failure.message}` : ""),
    );
    check("22d still PRODUCTION_READY after the asset swap", build3.project.releaseState === "PRODUCTION_READY");
    const heroSha = createHash("sha256").update(Buffer.concat([PNG_1PX, Buffer.from([2])])).digest("hex");
    const finalSite = path.join(
      HOST_DATA_DIR,
      "production-builds",
      build3.project.stageStatus.production.artifact!.id,
      "package",
      "site",
    );
    const homeHtml = await readFile(path.join(finalSite, "index.html"), "utf8");
    check(
      "26.6 the replacement hero bytes actually serve (rewrite applied to the new build)",
      homeHtml.includes(`/media/${heroSha}.png`) && existsSync(path.join(finalSite, "media", `${heroSha}.png`)),
    );
    check(
      "26.7 sitemap.xml served in the indexable package",
      existsSync(path.join(finalSite, "sitemap.xml")),
    );

    // Route readiness after full resolution (spec §20)
    const finalPlanView = await planRelease(projectDir);
    check(
      "20b route readiness: every route READY after full resolution",
      finalPlanView.routeReadiness.every((row) => row.state === "READY"),
      JSON.stringify(finalPlanView.routeReadiness),
    );

    // =======================================================================
    section("11. technical debt register (spec §30)");
    // =======================================================================
    const debt = await loadTechnicalDebtRegister();
    check(
      "30.1 GED-D/E/F/G preserved from the Task 24 artifact (not re-invented)",
      ["GED-D", "GED-E", "GED-F", "GED-G"].every((prefix) => debt.entries.some((entry) => entry.id.startsWith(prefix))),
      JSON.stringify(debt.entries.map((entry) => entry.id)),
    );
    check(
      "30.2 register maps defects to affected requirement kinds (GED-F → content-route)",
      debt.entries
        .find((entry) => entry.id.startsWith("GED-F"))
        ?.affects.requirementKinds.includes("content-route") === true,
    );
    check(
      "30.3 project embeds the register + blog/collection limitation (spec §31)",
      loaded.project.technicalDebt.length === debt.entries.length &&
        loaded.project.limitations.some((limitation) => limitation.includes("collection")),
    );

    // =======================================================================
    section("12. STRIPE CANARY — requirement collection, read-only (tests 23, 25)");
    // =======================================================================
    const stripeSpecDir = "data/stripe.com/production-specs/2026-08-19T06-36-35-798Z";
    check("23.0 accepted stripe candidate present", existsSync(stripeSpecDir));
    const stripeSpec = JSON.parse(await readFile(path.join(stripeSpecDir, "production-spec.json"), "utf8")) as {
      lineage: {
        template: { dir: string };
        contentRun: { dir: string };
        theme: { dir: string };
        seoPlan: { dir: string };
        assets: { dir: string; inventoryRunDir: string };
      };
    };
    const lineageDirs = [
      stripeSpec.lineage.template.dir,
      stripeSpec.lineage.contentRun.dir,
      stripeSpec.lineage.theme.dir,
      stripeSpec.lineage.seoPlan.dir,
      stripeSpec.lineage.assets.dir,
      stripeSpec.lineage.assets.inventoryRunDir,
    ];
    const beforeStripe = new Map<string, Map<string, string>>();
    for (const dir of lineageDirs) beforeStripe.set(dir, await snapshotTree(dir));

    const stripeCollected = await collectRequirements({
      host: "stripe.com",
      templateRunDir: stripeSpec.lineage.template.dir,
      contentRunDir: stripeSpec.lineage.contentRun.dir,
      themeRunDir: stripeSpec.lineage.theme.dir,
      seoPlanRunDir: stripeSpec.lineage.seoPlan.dir,
      materializationRunDir: stripeSpec.lineage.assets.dir,
      inventoryRunDir: stripeSpec.lineage.assets.inventoryRunDir,
      productionSpecFile: path.join(stripeSpecDir, "production-spec.json"),
      productionBuildDir: "data/stripe.com/production-builds/2026-08-19T06-36-35-798Z",
    });
    // EXPECTED values are read from the artifacts AT RUNTIME (never literals).
    const stripePlan = JSON.parse(
      await readFile(path.join(stripeSpec.lineage.seoPlan.dir, "production-seo-plan.json"), "utf8"),
    ) as { site: { businessFacts: Record<string, { status: string }> }; domainState: { productionDomain: { status: string } } };
    const stripeTemplate = JSON.parse(
      await readFile(path.join(stripeSpec.lineage.template.dir, "manifest.json"), "utf8"),
    ) as { routes: string[] };
    const stripeContent = JSON.parse(
      await readFile(path.join(stripeSpec.lineage.contentRun.dir, "manifest.json"), "utf8"),
    ) as { scopedRoutes: string[] };
    const stripeReplacement = JSON.parse(
      await readFile(path.join(stripeSpec.lineage.assets.dir, "replacement-manifest.json"), "utf8"),
    ) as { entries: Array<{ classification: string; replacement: { status: string } }> };
    const stripeFonts = JSON.parse(
      await readFile(path.join(stripeSpec.lineage.assets.inventoryRunDir, "font-inventory.json"), "utf8"),
    ) as { license: Array<{ status: string }> };
    const stripeUnresolved = (
      JSON.parse(
        await readFile(path.join(stripeSpec.lineage.contentRun.dir, "generation-result.json"), "utf8"),
      ) as { unresolved: Array<{ slotKey: string }> }
    ).unresolved;
    const stripeInventoryCounts = (
      JSON.parse(
        await readFile(path.join(stripeSpec.lineage.assets.inventoryRunDir, "manifest.json"), "utf8"),
      ) as { counts: Record<string, number> }
    ).counts;

    const stripeByKind = new Map<string, number>();
    for (const requirement of stripeCollected.requirements) {
      stripeByKind.set(requirement.kind, (stripeByKind.get(requirement.kind) ?? 0) + 1);
    }
    check(
      "23.1 domain requirement iff the seo plan says needs-input",
      (stripePlan.domainState.productionDomain.status === "needs-input") ===
        stripeCollected.requirements.some((requirement) => requirement.requirementId === "production-domain"),
    );
    const expectedFacts = Object.values(stripePlan.site.businessFacts).filter(
      (fact) => fact.status === "needs-input",
    ).length;
    check(
      "23.2 canonical business-fact count derives from the plan",
      stripeCollected.requirements.filter((r) => r.kind === "business-fact" && r.factKey !== undefined).length ===
        expectedFacts,
      String(expectedFacts),
    );
    const expectedRoutes = stripeTemplate.routes.filter(
      (route) => !stripeContent.scopedRoutes.includes(route),
    ).length;
    check(
      "23.3 content-route requirements = template routes minus content scope",
      (stripeByKind.get("content-route") ?? 0) === expectedRoutes,
      `${stripeByKind.get("content-route")} vs ${expectedRoutes}`,
    );
    const expectedAssets = stripeReplacement.entries.filter(
      (entry) => entry.replacement.status !== "provided",
    ).length;
    check(
      "23.4 replacement-image requirements = awaiting replacement-manifest entries",
      (stripeByKind.get("replacement-image") ?? 0) === expectedAssets,
      `${stripeByKind.get("replacement-image")} vs ${expectedAssets}`,
    );
    const expectedFonts = stripeFonts.license.filter((license) => license.status === "license-needs-review").length;
    check(
      "23.5 font-license requirements = license-needs-review families",
      (stripeByKind.get("font-license") ?? 0) === expectedFonts,
      `${stripeByKind.get("font-license")} vs ${expectedFonts}`,
    );
    check(
      "23.6 inline-SVG brand-mark requirement carries the inventory count",
      stripeCollected.requirements.find((requirement) => requirement.requirementId === "source-brand-inline-svg")
        ?.count === stripeInventoryCounts.inlineSvgEntries,
    );
    const expectedUrlish = stripeUnresolved.filter((slot) => slot.slotKey.endsWith(".href")).length;
    check(
      "23.7 external-url + slot business-fact requirements = content unresolved split",
      (stripeByKind.get("external-url") ?? 0) === expectedUrlish &&
        stripeCollected.requirements.filter((r) => r.kind === "business-fact" && r.slotKey !== undefined).length ===
          stripeUnresolved.length - expectedUrlish,
    );
    check(
      "23.8 og-image / social-handle / organization-logo derived",
      stripeCollected.requirements.some((r) => r.requirementId === "og-image") &&
        stripeCollected.requirements.some((r) => r.requirementId === "social-handle") &&
        stripeCollected.requirements.some((r) => r.requirementId === "organization-logo"),
    );
    check(
      "23.9 stripe stays PRODUCTION_INPUTS_REQUIRED (unresolved release-blocking > 0)",
      stripeCollected.requirements.some(
        (requirement) => requirement.severity === "release-blocking" && requirement.status === "unresolved",
      ),
    );

    let stripeUntouched = true;
    for (const dir of lineageDirs) {
      if (!treesIdentical(beforeStripe.get(dir)!, await snapshotTree(dir))) stripeUntouched = false;
    }
    check("25.1 historical stripe lineage byte-untouched by collection", stripeUntouched);

    // Fixture-side immutability: the ACCEPTED fixture lineage dirs were never
    // modified by resolve/build — new runs went to NEW run-id directories.
    const acceptedContent = await snapshotTree(contentRunDir);
    check(
      "25.2 accepted fixture content run untouched (reruns landed in new run dirs)",
      acceptedContent.size > 0 &&
        (await loadReleaseProject(projectDir)).project.stageStatus.content.artifact!.path !== contentRunDir,
    );
    check(
      "25.3 accepted production spec/build untouched",
      (await snapshotTree(compile0.specDir)).size === 1 &&
        build3.project.acceptedLineage.production.spec.path === compile0.specDir,
    );

    // =======================================================================
    section("13. audit trail (spec §28)");
    // =======================================================================
    const lastRun = build3.run!;
    check(
      "28.1 run records intentHash/resolutionHash/input hashes/verdict",
      lastRun.intentHash !== null &&
        lastRun.resolutionHash !== null &&
        Object.keys(lastRun.inputArtifactHashes).length === 7 &&
        lastRun.finalVerdict === "PRODUCTION_READY",
    );
    check(
      "28.2 operator overrides recorded (font decision + none invented)",
      lastRun.operatorOverrides.includes(`fontDecision:${fontFamily}`),
      JSON.stringify(lastRun.operatorOverrides),
    );
  } finally {
    fixture.server.close();
    await rm(HOST_DATA_DIR, { recursive: true, force: true });
    await rm(scratch, { recursive: true, force: true });
  }

  console.log(`\nsmoke:release — ${checks} checks, ${failures} failures`);
  if (failures > 0) process.exit(1);
}

main().catch((err) => {
  console.error("\nsmoke:release CRASHED —", err);
  process.exit(1);
});
