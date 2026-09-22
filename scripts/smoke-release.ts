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
import { cp, mkdir, readdir, readFile, rm, stat, writeFile } from "node:fs/promises";
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
import { hashDirectory } from "../src/production/hash.js";
import { productionBuildDir, runProductionCompile, runProductionQa, scanAppBrandHosts } from "../src/production/index.js";
import {
  buildRelease,
  collectRequirements,
  computeStageInputsHash,
  CONTENT_DERIVED_HASH_EXCLUSIONS,
  FROZEN_TEMPLATE_HASH_EXCLUSIONS,
  staleExclusionSetWarnings,
  downstreamOf,
  effectiveResolution,
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
  RELEASE_PROJECT_REVISION,
  RESOLUTION_FIELD_IMPACTS,
  STAGE_DEPENDENCIES,
  THEME_SELECTION_IMPACTS,
  adaptReleaseProject,
  defaultSiteId,
  emptyAuthoredState,
  planRelease,
  refreshStageStatuses,
  type AuthoredState,
  type ProductionResolution,
  type ReleaseRun,
  mergeRequirements,
  buildRequirementsFile,
  duplicateRequirementIds,
  releaseBlockers,
  REQUIREMENT_KINDS,
  SEVERITY_POLICY,
  type Requirement,
  // Task 28 CR1: the revision chain is now ON the release barrel — imported
  // from the barrel here ON PURPOSE, so a regression that drops the re-export
  // fails this suite at compile time.
  hashAuthoredState,
  loadRevisionChain,
  type AuthoredRevision,
  // Task 28 §1C: the assets stage runner's engine. Imported so the
  // "replace the same asset twice" case can be exercised without paying for a
  // second production compile.
  applyAssetResolutions,
  // Task 28 §2 — the shared authoring substrate: authored.assets /
  // authored.brand and the write API a Visual Editor calls. Imported through
  // the BARREL, like the revision chain above, so dropping the re-export
  // fails this suite at compile time.
  AUTHORED_ASSET_IMPACTS,
  AUTHORED_BRAND_IMPACTS,
  AuthoredBrandDecisionSchema,
  AuthoredStateSchema,
  authoredInvalidatedStages,
  brandSurfaceId,
  commitAuthoredEdits,
  mergedAssetResolutions,
  removeAuthoredAsset,
  setAuthoredAsset,
  setAuthoredBrandDecision,
  // Task 28 Phases 5 + 6 — enablement safety + planning, through the BARREL.
  AUTHORED_DISABLED_REGION_IMPACTS,
  AUTHORED_DISABLED_ROUTE_IMPACTS,
  evaluateRegionDisable,
  loadEnablementInputs,
  resolveEnablement,
  resolveEnablementForProject,
} from "../src/release/index.js";
import {
  compilePageRegions,
  loadRegionInput,
  newRegionRunId,
  writeRegionRun,
} from "../src/regions/index.js";
import { loadSiteRegistry } from "../src/registry/index.js";
// brand-scan is not (yet) on the release barrel — see changeRequests in the
// Task 27 handoff for src/release/index.ts.
import {
  BRAND_SURFACE_POLICY,
  brandFindingSeverity,
  brandSurfaceRequirements,
  type BrandFinding,
  type BrandSurfaceReport,
} from "../src/release/brand-scan.js";

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

/**
 * The COUNT↔ARTIFACT agreement invariant (Task 28 §1B — the 378↔380 drift).
 *
 * Task 27 recorded a requirement count printed by a CLI and a different count
 * sitting in requirements.json, and could not say which was wrong. Neither
 * was: `release:build` re-collects requirements from the artifacts its own
 * stage reruns just produced and REWRITES requirements.json, while recording
 * no total of its own — so a prepare's line and a later build's file were
 * compared as if they described one collection.
 *
 * This invariant is what makes that unrepeatable, for WHATEVER the numbers
 * happen to be: the count a command REPORTS must equal the number of UNIQUE
 * requirement ids in the file that command left on disk, must equal that
 * file's own `counts.total`, and (for a run that writes one) must equal the
 * `requirementsTotal` recorded on its run.json. No number is hardcoded here.
 */
async function requirementCountAgreement(
  projectDir: string,
  reportedCount: number,
): Promise<{ agrees: boolean; detail: string; uniqueIds: number; total: number }> {
  const file = await loadRequirementsFile(projectDir);
  const uniqueIds = new Set(file.requirements.map((requirement) => requirement.requirementId)).size;
  return {
    agrees:
      reportedCount === uniqueIds &&
      reportedCount === file.counts.total &&
      file.requirements.length === uniqueIds,
    uniqueIds,
    total: file.counts.total,
    detail:
      `reported=${reportedCount} uniqueIds=${uniqueIds} counts.total=${file.counts.total} ` +
      `arrayLength=${file.requirements.length}`,
  };
}

/**
 * The plan↔build AGREEMENT invariant (Task 27 — release:plan cascade fix).
 *
 * `release:plan` and `release:build --dry-run` answer the same question about
 * the same project, so their per-stage verdicts must be identical: what plan
 * calls READY is exactly what build would REUSE, and what plan calls
 * STALE/BLOCKED is exactly what build would RUN or refuse. Before the fix,
 * build applied the dependency cascade and plan did not, so plan printed
 * "READY (fresh): theme, seo, production" for a project build was about to
 * rebuild end to end. Asserting the AGREEMENT (not plan's output shape) is
 * what makes a re-divergence impossible to land green.
 */
async function planBuildAgreement(projectDir: string): Promise<{
  agrees: boolean;
  planNotReady: string;
  buildNotReuse: string;
  view: Awaited<ReturnType<typeof planRelease>>;
  detail: string;
}> {
  const view = await planRelease(projectDir, { log: () => {} });
  const dry = await buildRelease(projectDir, { dryRun: true, log: () => {} });
  const sorted = (stages: readonly string[]): string => [...stages].sort().join(",");
  const planReady = sorted(view.ready);
  const buildReuse = sorted(dry.plan.wouldReuse);
  const planNotReady = sorted([...view.stale, ...view.blocked.map((entry) => entry.stage)]);
  const buildNotReuse = sorted([...dry.plan.wouldRun, ...dry.plan.blocked.map((entry) => entry.stage)]);
  return {
    agrees: planReady === buildReuse && planNotReady === buildNotReuse,
    planNotReady,
    buildNotReuse,
    view,
    detail:
      `plan.ready=[${planReady}] vs build.wouldReuse=[${buildReuse}] | ` +
      `plan.stale+blocked=[${planNotReady}] vs build.wouldRun+blocked=[${buildNotReuse}]`,
  };
}

/**
 * The THREE-surface agreement invariant (Task 27 — release:resolve closure fix).
 *
 * `release:resolve` prints "invalidated: …" the moment a pack lands, and it was
 * the ONE surface still reading a hand-maintained impact table instead of the
 * dependency graph: it said "content, seo, production" for a routeContent pack
 * that `release:plan`, run one second later, called "STALE: content, theme, seo,
 * production". Asserting that all three operator surfaces name the SAME stage
 * set — resolve's invalidation, plan's stale+blocked, build --dry-run's
 * would-run+blocked — is what keeps the closure derived rather than curated.
 */
async function resolvePlanBuildAgreement(
  projectDir: string,
  invalidated: readonly string[],
): Promise<{ agrees: boolean; detail: string }> {
  const agreement = await planBuildAgreement(projectDir);
  const resolveSet = [...invalidated].sort().join(",");
  return {
    agrees: agreement.agrees && resolveSet === agreement.planNotReady,
    detail: `resolve.invalidated=[${resolveSet}] | ${agreement.detail}`,
  };
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
  // Task 28 CR4: `release:prepare` now caches the project in the site registry
  // index. The suite points that write at its OWN scratch root so a fixture run
  // never lands rows in the repo's real data/.registry.
  const registryRoot = path.join(scratch, "registry-root");
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
    // Task 28 Phase 10 CORRECTION — the isolated package MEASURES its served
    // <title>s. The shipped Phase-10 build served one identical title on every
    // route and nothing noticed; this asserts the measurement ran on every
    // route of a REAL compiled package and that its detail carries the
    // duplicate-group number, whatever that number is.
    const titleMeasure = qa0.checks.find((entry) => entry.id === "title-uniqueness-measured");
    check(
      "fixture package QA measures served <title> uniqueness on every route (Task 28 Phase 10)",
      titleMeasure !== undefined &&
        titleMeasure.ok &&
        titleMeasure.detail.includes(`routes=${qa0.routeCensus.length}/${qa0.routeCensus.length}`) &&
        /duplicate-title-groups=\d+/.test(titleMeasure.detail),
      titleMeasure?.detail ?? "check absent",
    );

    // =======================================================================
    section("1. release-project-v1 + requirement schemas (spec tests 1-3)");
    // =======================================================================
    const preparedProject = await prepareReleaseProject({
      registryDataRoot: registryRoot,
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
    section("1b. TASK 27 — stable site identity + frozen template report/ exclusion");
    // =======================================================================
    check(
      "27.1 project carries a STABLE siteId and revision 2",
      loaded.project.siteId === defaultSiteId(HOST) &&
        loaded.project.projectRevision === RELEASE_PROJECT_REVISION,
      `${loaded.project.siteId} rev${loaded.project.projectRevision}`,
    );
    check(
      "27.2 projectId is the siteId — NOT the production-spec run id",
      loaded.project.projectId === loaded.project.siteId &&
        !loaded.project.projectId.includes(compile0.runId),
      loaded.project.projectId,
    );
    check(
      "27.3 project starts with an EMPTY authored block (schema-valid)",
      JSON.stringify(loaded.project.authored) === JSON.stringify(emptyAuthoredState()),
      JSON.stringify(loaded.project.authored),
    );
    // Explicit operator siteId → its own project namespace (several customer
    // sites from ONE template).
    const secondSite = await prepareReleaseProject({
      registryDataRoot: registryRoot,
      productionSpecRef: compile0.specDir,
      siteId: "second-customer",
      log: () => {},
    });
    check(
      "27.4 operator-supplied siteId is honored and gets its own project",
      secondSite.project.siteId === "second-customer" &&
        secondSite.projectDir !== projectDir &&
        secondSite.projectDir.endsWith(path.join("release-projects", "second-customer")),
      secondSite.projectDir,
    );
    check(
      "27.5 the same siteId prepared twice keeps ONE identity (no run-scoped fork)",
      (
        await prepareReleaseProject({
      registryDataRoot: registryRoot,
          productionSpecRef: compile0.specDir,
          siteId: "second-customer",
          log: () => {},
        })
      ).projectDir === secondSite.projectDir,
    );
    await rm(secondSite.projectDir, { recursive: true, force: true });

    // ---- frozen template hash excludes report/ ---------------------------
    // `pnpm qa:recon-template` writes into the template run dir; before Task 27
    // that bricked release:build (build.ts refuses frozen-stage drift).
    check(
      "27.6 prepare recorded report/ in the template artifact exclusions",
      (loaded.project.acceptedLineage.template.excluded ?? []).includes("report"),
      JSON.stringify(loaded.project.acceptedLineage.template.excluded),
    );
    await mkdir(path.join(templateDir, "report"), { recursive: true });
    await writeFile(
      path.join(templateDir, "report", "template-qa.json"),
      JSON.stringify({ simulated: "qa:recon-template output", at: new Date().toISOString() }, null, 2) + "\n",
      "utf8",
    );
    const afterQaWrite = await buildRelease(projectDir, { dryRun: true, log: () => {} });
    check(
      "27.7 a template report/ write does NOT stale or block the frozen template",
      afterQaWrite.plan.wouldReuse.includes("template") &&
        afterQaWrite.plan.blocked.length === 0 &&
        afterQaWrite.plan.wouldRun.length === 0,
      `run=${JSON.stringify(afterQaWrite.plan.wouldRun)} blocked=${JSON.stringify(afterQaWrite.plan.blocked)}`,
    );
    let frozenDriftRefusal = false;
    try {
      await buildRelease(projectDir, { log: () => {} });
    } catch {
      frozenDriftRefusal = true;
    }
    check("27.8 a REAL build after template QA still runs (no frozen-drift refusal)", !frozenDriftRefusal);

    // ---- content hash excludes DERIVED outputs (Task 27 hardening) --------
    // Same landmine one stage over: Task 27 added `report/telemetry.jsonl`,
    // `report/repair/` and `slot-accounting.json` writes INTO a content run
    // dir, all of them made again by `pnpm content:qa` / `content:validate`.
    // Without an exclusion set the content stage — and everything downstream
    // of it — goes stale for bytes no rebuild consumes.
    check(
      "27H.1 prepare recorded report/ + slot-accounting.json in the CONTENT exclusions",
      CONTENT_DERIVED_HASH_EXCLUSIONS.includes("report") &&
        CONTENT_DERIVED_HASH_EXCLUSIONS.includes("slot-accounting.json") &&
        CONTENT_DERIVED_HASH_EXCLUSIONS.every((entry) =>
        (loaded.project.acceptedLineage.content.excluded ?? []).includes(entry),
      ),
      JSON.stringify(loaded.project.acceptedLineage.content.excluded),
    );
    const slotValuesFile = path.join(contentRunDir, "slot-values.json");
    const slotValuesBefore = await readFile(slotValuesFile, "utf8");
    const accountingFile = path.join(contentRunDir, "slot-accounting.json");
    const accountingBefore = existsSync(accountingFile)
      ? await readFile(accountingFile, "utf8")
      : null;
    // Simulate exactly what a post-prepare content QA / revalidation pass
    // writes (src/cli-content-qa.ts:164,270 + src/content-injection/run.ts:188).
    await mkdir(path.join(contentRunDir, "report", "repair"), { recursive: true });
    await writeFile(
      path.join(contentRunDir, "report", "telemetry.jsonl"),
      JSON.stringify({ simulated: "content:qa telemetry", at: new Date().toISOString() }) + "\n",
      "utf8",
    );
    await writeFile(
      path.join(contentRunDir, "report", "repair", "repair-stop.json"),
      JSON.stringify({ simulated: "bounded repair loop stop", at: new Date().toISOString() }, null, 2) + "\n",
      "utf8",
    );
    await writeFile(
      accountingFile,
      JSON.stringify(
        { schemaName: "content-slot-accounting-v1", simulatedRefreshAt: new Date().toISOString() },
        null,
        2,
      ) + "\n",
      "utf8",
    );
    const afterContentQa = await buildRelease(projectDir, { dryRun: true, log: () => {} });
    check(
      "27H.2 content QA writes (report/ + slot-accounting.json) do NOT stale content",
      afterContentQa.plan.wouldReuse.includes("content") &&
        afterContentQa.plan.wouldRun.length === 0 &&
        afterContentQa.plan.blocked.length === 0,
      `run=${JSON.stringify(afterContentQa.plan.wouldRun)} blocked=${JSON.stringify(afterContentQa.plan.blocked)}`,
    );
    // The OTHER direction: slot-values.json is AUTHORED INPUT that production
    // bakes (src/production/run.ts:234,375). It must never be excluded, so a
    // real edit still stales content and cascades downstream.
    const editedSlotValues = JSON.parse(slotValuesBefore) as Record<string, unknown>;
    const firstSlotKey = Object.keys(editedSlotValues)[0]!;
    editedSlotValues[firstSlotKey] = `${String(editedSlotValues[firstSlotKey])} (edited)`;
    await writeFile(slotValuesFile, JSON.stringify(editedSlotValues, null, 2) + "\n", "utf8");
    const afterSlotEdit = await buildRelease(projectDir, { dryRun: true, log: () => {} });
    check(
      "27H.3 a REAL slot-values.json edit DOES stale content and cascade downstream",
      afterSlotEdit.plan.wouldRun.includes("content") &&
        afterSlotEdit.plan.wouldRun.includes("theme") &&
        afterSlotEdit.plan.wouldRun.includes("seo"),
      `run=${JSON.stringify(afterSlotEdit.plan.wouldRun)}`,
    );
    // Restore the accepted bytes so the rest of the scenario is unaffected.
    await writeFile(slotValuesFile, slotValuesBefore, "utf8");
    if (accountingBefore !== null) await writeFile(accountingFile, accountingBefore, "utf8");
    else await rm(accountingFile, { force: true });
    const afterRestore = await buildRelease(projectDir, { dryRun: true, log: () => {} });
    check(
      "27H.4 restoring slot-values.json returns content to fresh (hash, not mtime)",
      afterRestore.plan.wouldRun.length === 0 && afterRestore.plan.wouldReuse.includes("content"),
      `run=${JSON.stringify(afterRestore.plan.wouldRun)}`,
    );
    // ---- residual risk on projects prepared BEFORE the fix ----------------
    // DECISION: warn, never silently re-adopt the current set on load — the
    // recorded hash was computed under the recorded set, so swapping the set
    // in could brick a project at LOAD time. The three legacy projects on disk
    // record templateExcluded=[".next","node_modules","out"] and content [].
    const legacyShaped = JSON.parse(JSON.stringify(loaded.project)) as typeof loaded.project;
    legacyShaped.stageStatus.template.artifact!.excluded = [".next", "node_modules", "out"];
    legacyShaped.stageStatus.content.artifact!.excluded = [];
    const legacyWarnings = staleExclusionSetWarnings(legacyShaped);
    check(
      "27H.5 a pre-fix recorded exclusion set warns the operator (template + content)",
      legacyWarnings.length === 2 &&
        legacyWarnings.some((w) => w.startsWith("template:") && w.includes('"report"')) &&
        legacyWarnings.some((w) => w.startsWith("content:") && w.includes('"slot-accounting.json"')) &&
        legacyWarnings.every((w) => w.includes("release:prepare")),
      JSON.stringify(legacyWarnings),
    );
    check(
      "27H.6 a project recorded under the CURRENT sets warns about nothing",
      staleExclusionSetWarnings(loaded.project).length === 0 &&
        FROZEN_TEMPLATE_HASH_EXCLUSIONS.includes("report"),
      JSON.stringify(staleExclusionSetWarnings(loaded.project)),
    );
    // ---- 27H.7 the warning must REACH the operator, and its printed remedy
    // must actually WORK ------------------------------------------------------
    // The previous revision of this block asserted
    // `planRelease(...).warnings.length === 0` under a name claiming the
    // warning reaches the operator — an assertion that could not fail when the
    // wiring broke. What follows drives a LEGACY-SHAPED project (recorded
    // exclusion sets predating the fix, and hashes recorded UNDER those sets so
    // nothing is drifted — the shape the three real projects on disk have)
    // through refreshStageStatuses, release:plan and release:build --dry-run,
    // then follows the remedy the warning prints and asserts it clears.
    const legacyProjectId = `${loaded.project.siteId}-legacy-exclusions`;
    const legacyPrepared = await prepareReleaseProject({
      registryDataRoot: registryRoot,
      productionSpecRef: compile0.specDir,
      projectId: legacyProjectId,
      log: () => {},
    });
    const legacyDir = legacyPrepared.projectDir;
    const legacyFile = path.join(legacyDir, "release-project.json");
    const legacyTemplateExclusions = [".next", "node_modules", "out"];
    const legacyDoc = (await loadReleaseProject(legacyDir)).project;
    const legacyTemplateHash = (await hashDirectory(templateDir, legacyTemplateExclusions)).hash;
    const legacyContentHash = (await hashDirectory(contentRunDir, [])).hash;
    for (const ref of [legacyDoc.acceptedLineage.template, legacyDoc.stageStatus.template.artifact!]) {
      ref.excluded = [...legacyTemplateExclusions];
      ref.hash = legacyTemplateHash;
    }
    for (const ref of [legacyDoc.acceptedLineage.content, legacyDoc.stageStatus.content.artifact!]) {
      ref.excluded = [];
      ref.hash = legacyContentHash;
    }
    await writeFile(legacyFile, JSON.stringify(legacyDoc, null, 2) + "\n", "utf8");

    const legacyReloaded = (await loadReleaseProject(legacyDir)).project;
    const legacyRefreshed = await refreshStageStatuses(
      legacyReloaded,
      effectiveResolution(legacyReloaded.resolutions),
      { log: () => {} },
    );
    const legacyContentWarning = legacyRefreshed.warnings.find((w) => w.startsWith("content:"));
    check(
      "27H.7a a real legacy-shaped project (loaded from disk) warns on BOTH stages and is NOT drifted",
      legacyRefreshed.warnings.some((w) => w.startsWith("template:") && w.includes('"report"')) &&
        legacyContentWarning !== undefined &&
        legacyContentWarning.includes('"slot-accounting.json"') &&
        legacyContentWarning.includes(contentRunDir) &&
        legacyRefreshed.warnings.every((w) => !w.includes("artifact drift")),
      JSON.stringify(legacyRefreshed.warnings),
    );
    const legacyPlan = await planRelease(legacyDir, { log: () => {} });
    check(
      "27H.7b the warning reaches the operator through release:plan (warnings[] AND the rendered screen)",
      legacyPlan.warnings.some(
        (w) => w.startsWith("content:") && w.includes(contentRunDir) && w.includes("release:prepare"),
      ) &&
        legacyPlan.text.includes("WARNINGS") &&
        legacyPlan.text.includes("predate the derived-output fix"),
      `warnings=${legacyPlan.warnings.length} rendered=${legacyPlan.text.includes("predate the derived-output fix")}`,
    );
    const legacyBuildLog: string[] = [];
    await buildRelease(legacyDir, { dryRun: true, log: (line) => legacyBuildLog.push(line) });
    check(
      "27H.7c the warning reaches the operator through release:build --dry-run",
      legacyBuildLog.some((line) => line.trim() === "WARNINGS") &&
        legacyBuildLog.some(
          (line) => line.includes("predate the derived-output fix") && line.includes(contentRunDir),
        ),
      legacyBuildLog.filter((line) => line.includes("predate")).join(" | ") || "(no warning line logged)",
    );
    // Now DO what the warning tells the operator to do.
    const legacyBefore = (await loadReleaseProject(legacyDir)).project;
    const remedied = await prepareReleaseProject({
      registryDataRoot: registryRoot,
      productionSpecRef: compile0.specDir,
      projectId: legacyProjectId,
      log: () => {},
    });
    const remediedPlan = await planRelease(legacyDir, { log: () => {} });
    check(
      "27H.7d following the PRINTED remedy actually CLEARS the warning (content re-hashed under the current set)",
      remedied.reprepared === true &&
        staleExclusionSetWarnings(remedied.project).length === 0 &&
        CONTENT_DERIVED_HASH_EXCLUSIONS.every((entry) =>
          (remedied.project.stageStatus.content.artifact?.excluded ?? []).includes(entry),
        ) &&
        remediedPlan.warnings.every((w) => !w.includes("predate the derived-output fix")) &&
        !remediedPlan.text.includes("predate the derived-output fix"),
      JSON.stringify(remedied.project.stageStatus.content.artifact?.excluded) +
        " / " +
        JSON.stringify(staleExclusionSetWarnings(remedied.project)),
    );
    check(
      "27H.7e the re-hash keeps the carried per-stage state (same artifact id/path, carried inputsHash, authored, resolutions)",
      remedied.project.stageStatus.content.artifact!.path ===
        legacyBefore.stageStatus.content.artifact!.path &&
        remedied.project.stageStatus.content.artifact!.id ===
          legacyBefore.stageStatus.content.artifact!.id &&
        remedied.project.stageStatus.content.inputsHash ===
          legacyBefore.stageStatus.content.inputsHash &&
        remedied.project.stageStatus.content.artifact!.hash !==
          legacyBefore.stageStatus.content.artifact!.hash &&
        JSON.stringify(remedied.project.authored) === JSON.stringify(legacyBefore.authored) &&
        remedied.project.resolutions.length === legacyBefore.resolutions.length &&
        remedied.project.createdAt === legacyBefore.createdAt,
      `${remedied.project.stageStatus.content.inputsHash} vs ${legacyBefore.stageStatus.content.inputsHash}`,
    );
    // The adoption is scoped to the SAME path on purpose: a stage that a
    // release:build rerun advanced to a DIFFERENT run dir must still win over
    // the accepted lineage, or a re-prepare would silently revert it.
    const rerunContentDir = path.join(HOST_DATA_DIR, "content-runs", "2026-08-25T00-00-03-999Z");
    await cp(contentRunDir, rerunContentDir, { recursive: true });
    const advancedDoc = (await loadReleaseProject(legacyDir)).project;
    advancedDoc.stageStatus.content.artifact = {
      ...advancedDoc.stageStatus.content.artifact!,
      id: "2026-08-25T00-00-03-999Z",
      path: rerunContentDir,
      hash: (await hashDirectory(rerunContentDir, [...CONTENT_DERIVED_HASH_EXCLUSIONS])).hash,
    };
    await writeFile(legacyFile, JSON.stringify(advancedDoc, null, 2) + "\n", "utf8");
    const afterAdvancedReprepare = await prepareReleaseProject({
      registryDataRoot: registryRoot,
      productionSpecRef: compile0.specDir,
      projectId: legacyProjectId,
      log: () => {},
    });
    check(
      "27H.7f a stage advanced to a DIFFERENT run dir is NOT reverted to the accepted lineage by the re-hash",
      afterAdvancedReprepare.project.stageStatus.content.artifact!.path === rerunContentDir &&
        afterAdvancedReprepare.project.acceptedLineage.content.path === contentRunDir,
      afterAdvancedReprepare.project.stageStatus.content.artifact!.path,
    );
    await rm(legacyDir, { recursive: true, force: true });
    await rm(rerunContentDir, { recursive: true, force: true });
    // …and the project recorded under the CURRENT sets says nothing, on every
    // one of those surfaces.
    const currentPlan = await planRelease(projectDir, { log: () => {} });
    const currentBuildLog: string[] = [];
    await buildRelease(projectDir, { dryRun: true, log: (line) => currentBuildLog.push(line) });
    check(
      "27H.7g a project recorded under the CURRENT sets emits NO exclusion warning on any surface",
      currentPlan.warnings.every((w) => !w.includes("predate the derived-output fix")) &&
        !currentPlan.text.includes("predate the derived-output fix") &&
        currentBuildLog.every((line) => !line.includes("predate the derived-output fix")),
      JSON.stringify(currentPlan.warnings),
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
    // ---- Task 27: THEME_SELECTION_IMPACTS is WIRED, not declared ----------
    check(
      "27.9 theme is a live resolution field impact (no longer a dead constant)",
      RESOLUTION_FIELD_IMPACTS.theme === THEME_SELECTION_IMPACTS,
    );
    const themeOnly: ProductionResolution = {
      schemaVersion: 1,
      schemaName: "production-resolution-v1",
      theme: { tokens: { "color.action.primary": "rgb(12, 34, 56)" } },
    };
    check(
      "27.10 invalidatedStages(theme-only) = [theme, production] EXACTLY",
      JSON.stringify(invalidatedStages(themeOnly)) === JSON.stringify(["theme", "production"]),
      JSON.stringify(invalidatedStages(themeOnly)),
    );
    // The theme slice must be inside computeStageInputsHash, and inside NO
    // other stage's slice — assert all five stages, not just the two.
    const authoredNoTheme: AuthoredState = emptyAuthoredState();
    const authoredTheme: AuthoredState = {
      ...emptyAuthoredState(),
      theme: { tokens: { "color.action.primary": "rgb(12, 34, 56)" } },
    };
    const allHashes = {
      reconstruction: "a".repeat(64),
      template: "b".repeat(64),
      content: "c".repeat(64),
      theme: "d".repeat(64),
      seo: "e".repeat(64),
      assets: "f".repeat(64),
    };
    const empty2: ProductionResolution = { schemaVersion: 1, schemaName: "production-resolution-v1" };
    const hashWith = (stage: Parameters<typeof computeStageInputsHash>[0], authored: AuthoredState): string =>
      computeStageInputsHash(stage, allHashes, empty2, {}, "ih", authored);
    check(
      "27.11 theme slice IS in the theme stage inputs hash",
      hashWith("theme", authoredTheme) !== hashWith("theme", authoredNoTheme),
    );
    check(
      "27.12 theme edit does NOT move reconstruction/template/content/seo/assets input hashes",
      (["reconstruction", "template", "content", "seo", "assets"] as const).every(
        (stage) => hashWith(stage, authoredTheme) === hashWith(stage, authoredNoTheme),
      ),
    );
    check(
      "27.13 an EMPTY authored block hashes identically to no authored block (legacy-safe)",
      computeStageInputsHash("content", allHashes, empty2, {}, "ih", emptyAuthoredState()) ===
        computeStageInputsHash("content", allHashes, empty2, {}, "ih"),
    );
    check(
      "27.14 authored.slotValues IS in the content stage inputs hash (Visual Editor seam)",
      computeStageInputsHash("content", allHashes, empty2, {}, "ih", {
        ...emptyAuthoredState(),
        slotValues: { "home.hero.title": "authored" },
      }) !== computeStageInputsHash("content", allHashes, empty2, {}, "ih", emptyAuthoredState()),
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
    const agree0 = await planBuildAgreement(projectDir);
    check(
      "27P.1 release:plan and release:build --dry-run agree on the ALL-FRESH baseline",
      agree0.agrees && agree0.planNotReady === "",
      agree0.detail,
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
    // ---- 27P: the reported defect — plan omitted the cascade that build
    // applies, so the two operator surfaces disagreed about THIS state (a
    // resolution applied, nothing rebuilt yet) and the un-cascaded view was
    // the one release:resolve PERSISTED.
    const agree1 = await planBuildAgreement(projectDir);
    check(
      "27P.2 plan and build --dry-run agree on the stage set with a PENDING resolution",
      agree1.agrees,
      agree1.detail,
    );
    check(
      "27P.3 the agreed set carries the DEPENDENCY CASCADE (theme re-runs only because content will)",
      agree1.planNotReady.split(",").includes("theme") &&
        (agree1.view.stale.includes("theme")
          ? agree1.view.project.stageStatus.theme.reasons.some((reason) =>
              reason.includes("upstream stage content will be rebuilt"),
            )
          : false),
      `${agree1.planNotReady} | invalidated=${JSON.stringify(resolved1.invalidated)} | ` +
        JSON.stringify(agree1.view.project.stageStatus.theme.reasons),
    );
    // ---- 27R: release:resolve was the THIRD surface reasoning about
    // staleness without applying the graph — RESOLUTION_FIELD_IMPACTS.
    // routeContent read [content, seo, production] and theme DEPENDS on
    // content, so resolve under-reported by exactly one stage. The closure is
    // now derived from STAGE_DEPENDENCIES inside invalidatedStages().
    check(
      "27R.1 resolve reports the DERIVED closure: a routeContent pack invalidates theme too",
      resolved1.invalidated.includes("theme") &&
        JSON.stringify(
          invalidatedStages({
            schemaVersion: 1,
            schemaName: "production-resolution-v1",
            routeContent: { "/pricing": { slotValues: { "slot-1": "x" } } },
          }),
        ) === JSON.stringify(["content", "theme", "seo", "production"]),
      JSON.stringify(resolved1.invalidated),
    );
    const three1 = await resolvePlanBuildAgreement(projectDir, resolved1.invalidated);
    check(
      "27R.2 all THREE surfaces agree for a routeContent pack (resolve = plan = build --dry-run)",
      three1.agrees,
      three1.detail,
    );
    const persistedAfterResolve = (await loadReleaseProject(projectDir)).project;
    check(
      "27P.4 the PERSISTED stageStatus carries the cascaded view, not the raw per-stage freshness",
      persistedAfterResolve.stageStatus.theme.status === "stale" &&
        persistedAfterResolve.stageStatus.production.status !== "fresh",
      `theme=${persistedAfterResolve.stageStatus.theme.status} ` +
        `production=${persistedAfterResolve.stageStatus.production.status}`,
    );

    // ---- Task 28 Phase 2: SOURCE-BRAND DECISIONS on the real engine -------
    // The fixture template genuinely carries source-brand surfaces (an <img>
    // alt that names the fixture brand, on both viewports). Before Phase 2
    // they were invisible to the gate; now they are a release blocker, and the
    // ONLY way to clear one is to decide it and REBUILD. This is that flow, on
    // the real engine, and the checks below are the proof that Task 27's dead
    // end ("any source with an inline-SVG logo can never reach
    // PRODUCTION_READY") is gone.
    const brandHostsBefore = (await scanAppBrandHosts(path.join(templateDir, "app"), HOST)).hosts;
    check(
      "28.P2B.1 the fixture template really does carry source-brand hosts",
      brandHostsBefore.length > 0,
      String(brandHostsBefore.length),
    );
    const preBrandRequirements = JSON.parse(
      await readFile(path.join(projectDir, "requirements.json"), "utf8"),
    ) as { requirements: Array<{ requirementId: string; status: string; count?: number }> };
    const preBrandRequirement = preBrandRequirements.requirements.find(
      (requirement) => requirement.requirementId === "source-brand-inline-svg",
    );
    check(
      "28.P2B.2 it is an UNRESOLVED release blocker before any decision, counted from HOSTS",
      preBrandRequirement?.status === "unresolved" && preBrandRequirement.count === brandHostsBefore.length,
      JSON.stringify(preBrandRequirement),
    );
    const brandEdits = brandHostsBefore.map((host) => ({
      op: "set-brand-decision" as const,
      surfaceId: host.id,
      decision: "REPLACE" as const,
      replacement: { text: "Newco visual" },
      note: "smoke: source-brand surface resolved by an authored decision",
    }));
    const brandCommit = await commitAuthoredEdits(projectDir, brandEdits, {
      origin: "edit",
      summary: "brand decisions",
    });
    check(
      "28.P2B.3 the decisions are AUTHORED state and append exactly one revision",
      brandCommit.changed === true && brandCommit.revision !== null,
      JSON.stringify(brandCommit.revision?.revisionId),
    );
    const afterBrandEdit = (await loadReleaseProject(projectDir)).project;
    check(
      "28.P2B.4 the decision record stores the DECISION only — no detection evidence",
      Object.values(afterBrandEdit.authored.brand ?? {}).every(
        (decision) => Object.keys(decision).sort().join(",") === "decision,note,replacement,updatedAt",
      ),
      JSON.stringify(afterBrandEdit.authored.brand),
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
      "27H.8 the RERUN content artifact records the same exclusion set as prepare",
      CONTENT_DERIVED_HASH_EXCLUSIONS.length > 0 &&
        CONTENT_DERIVED_HASH_EXCLUSIONS.every((entry) =>
        (build1.project.stageStatus.content.artifact?.excluded ?? []).includes(entry),
      ),
      JSON.stringify(build1.project.stageStatus.content.artifact?.excluded),
    );
    const bakeReportFile = path.join(
      build1.project.stageStatus.production.artifact?.path.replace("production-specs", "production-builds") ?? "",
      "report",
      "bake-report.json",
    );
    const bakeReport = existsSync(bakeReportFile)
      ? (JSON.parse(await readFile(bakeReportFile, "utf8")) as {
          brand: {
            census: Record<string, number>;
            flight: Record<string, number>;
            bake: {
              hostsBefore: number;
              applied: { replaced: number; refused: number };
              residual: { unexplainedAfter: string[] };
            } | null;
          };
        })
      : null;
    check(
      "28.P2B.5 the REAL production build ran the brand resolver and recorded what it did",
      bakeReport?.brand.bake !== null &&
        bakeReport?.brand.bake?.hostsBefore === brandHostsBefore.length &&
        bakeReport?.brand.bake?.applied.replaced === brandHostsBefore.length &&
        bakeReport?.brand.bake?.applied.refused === 0,
      JSON.stringify(bakeReport?.brand.bake?.applied) + ` file=${bakeReportFile}`,
    );
    check(
      "28.P2B.6 the rebuilt output carries NO unexplained brand host, and the flight axis was measured",
      bakeReport?.brand.bake?.residual.unexplainedAfter.length === 0 &&
        typeof bakeReport?.brand.flight.svgAriaLabel === "number",
      JSON.stringify(bakeReport?.brand.flight),
    );
    const postBrandRequirement = JSON.parse(
      await readFile(path.join(projectDir, "requirements.json"), "utf8"),
    ) as { requirements: Array<{ requirementId: string; status: string; statusNote?: string }> };
    const cleared = postBrandRequirement.requirements.find(
      (requirement) => requirement.requirementId === "source-brand-inline-svg",
    );
    check(
      "28.P2B.7 the blocker cleared BY MEASURED OUTPUT, and says so",
      cleared?.status === "resolved" && (cleared.statusNote ?? "").startsWith("cleared by MEASURED OUTPUT"),
      JSON.stringify(cleared),
    );
    check(
      // The third axis (Task 28 Phase 2): the exported bytes and the RSC
      // flight are inputs; this is what a visitor's browser actually renders
      // after React reconciles the flight into the DOM. It reaches the
      // requirement from THIS build's own report/qa.json, so a build that
      // never measured it says "not measured" here instead of scoring a zero.
      "28.P2B.7b the POST-HYDRATION census is part of the proof — what renders, not raw bytes",
      (cleared?.statusNote ?? "").includes("post-hydration brand surfaces=0"),
      cleared?.statusNote ?? "",
    );
    check(
      "28.P2B.8 it was NOT cleared by a resolution pack (no resolvedBy)",
      (cleared as { resolvedBy?: unknown } | undefined)?.resolvedBy === undefined,
      JSON.stringify(cleared),
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
      registryDataRoot: registryRoot,
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

    // ---- Task 28 §1B on a REAL build (no extra next build spent) ----------
    // `release:build` is the command that rewrote requirements.json under
    // Task 27 while reporting nothing, which is how its total became
    // unattributable. Assert the agreement on the build that just ran.
    const build3Agreement = await requirementCountAgreement(projectDir, build3.requirementsCount);
    check(
      "28.1B.1 a REAL build reports exactly the unique requirement ids it persisted",
      build3Agreement.agrees,
      build3Agreement.detail,
    );
    const build3RunRecord = JSON.parse(
      await readFile(path.join(projectDir, "runs", build3.run!.runId, "run.json"), "utf8"),
    ) as { requirementsTotal: number };
    check(
      "28.1B.2 the build's run.json records the requirement total it wrote (durable, not only a log line)",
      build3RunRecord.requirementsTotal === build3Agreement.total,
      `run.requirementsTotal=${build3RunRecord.requirementsTotal} vs persisted ${build3Agreement.total}`,
    );
    const build3File = await loadRequirementsFile(projectDir);
    check(
      "28.1B.3 the persisted file names WHICH run and WHICH stage artifacts it was collected from",
      build3File.collectedFrom?.releaseRunId === build3.run!.runId &&
        build3File.collectedFrom?.releaseRunKind === "build" &&
        build3File.collectedFrom.stageArtifacts.content === build3.project.stageStatus.content.artifact!.path,
      JSON.stringify(build3File.collectedFrom ?? null),
    );
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
    // Task 28 Phase 2 CHANGED THIS COUNT ON PURPOSE, and the check follows the
    // change rather than the old proxy: `inlineSvgEntries` counts every inline
    // SVG on the site (icons included), which is not a count of source-brand
    // marks. The requirement now carries brand-CARRYING hosts, measured by the
    // same walker the bake-time resolver uses.
    const stripeBrandHosts = (
      await scanAppBrandHosts(path.join(stripeSpec.lineage.template.dir, "app"), "stripe.com")
    ).hosts;
    const stripeBrandRequirement = stripeCollected.requirements.find(
      (requirement) => requirement.requirementId === "source-brand-inline-svg",
    );
    check(
      "23.6 the source-brand requirement carries the BRAND-CARRYING HOST count (re-derived here)",
      stripeBrandRequirement?.count === stripeBrandHosts.length && stripeBrandHosts.length > 0,
      `${stripeBrandRequirement?.count} vs ${stripeBrandHosts.length}`,
    );
    check(
      "23.6b and that count is strictly smaller than the inline-svg entry count it replaced",
      stripeBrandHosts.length < stripeInventoryCounts.inlineSvgEntries,
      `${stripeBrandHosts.length} hosts vs ${stripeInventoryCounts.inlineSvgEntries} inline-svg entries`,
    );
    check(
      "23.6c the inventory count is still CITED as evidence, so nothing was hidden",
      (stripeBrandRequirement?.evidence ?? []).some((entry) =>
        (entry.detail ?? "").includes(`counts.inlineSvgEntries=${stripeInventoryCounts.inlineSvgEntries}`),
      ),
      JSON.stringify(stripeBrandRequirement?.evidence),
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

    // ---- Task 27: EVERY legacy on-disk project still loads ---------------
    // Revision-1 documents (no siteId, no authored block) are ADAPTED on read;
    // the files themselves are never rewritten by a load.
    const legacyProjectDirs = [
      "data/linear.app/release-projects/linear.app-2026-08-25T23-32-42-075Z",
      "data/linear.app/release-projects/linear.app-2026-08-25T23-54-21-435Z",
      "data/stripe.com/release-projects/stripe.com-2026-08-19T06-36-35-798Z",
    ].filter((dir) => existsSync(dir));
    check(
      "27.15 all three legacy release projects are on disk",
      legacyProjectDirs.length === 3,
      JSON.stringify(legacyProjectDirs),
    );
    const beforeLegacy = new Map<string, Map<string, string>>();
    for (const dir of legacyProjectDirs) beforeLegacy.set(dir, await snapshotTree(dir));
    const legacyLoaded: Array<{ dir: string; siteId: string; adaptedFrom: number | null }> = [];
    let legacyLoadError = "";
    for (const dir of legacyProjectDirs) {
      try {
        const legacy = await loadReleaseProject(dir);
        legacyLoaded.push({ dir, siteId: legacy.project.siteId, adaptedFrom: legacy.adaptedFrom });
      } catch (error) {
        legacyLoadError += `${dir}: ${error instanceof Error ? error.message : String(error)}; `;
      }
    }
    check(
      "27.16 every legacy (revision-1) project loads and is adapted, never rejected",
      legacyLoadError === "" &&
        legacyLoaded.length === legacyProjectDirs.length &&
        legacyLoaded.every((entry) => entry.adaptedFrom === 1 && entry.siteId.length > 0),
      legacyLoadError || JSON.stringify(legacyLoaded),
    );
    check(
      "27.17 the TWO linear.app projects adapt to ONE stable siteId",
      legacyLoaded.filter((entry) => entry.dir.includes("linear.app")).length === 2 &&
        new Set(
          legacyLoaded.filter((entry) => entry.dir.includes("linear.app")).map((entry) => entry.siteId),
        ).size === 1,
      JSON.stringify(legacyLoaded.map((entry) => entry.siteId)),
    );
    let legacyUntouched = true;
    for (const dir of legacyProjectDirs) {
      if (!treesIdentical(beforeLegacy.get(dir)!, await snapshotTree(dir))) legacyUntouched = false;
    }
    check("27.18 loading a legacy project rewrites NOTHING on disk", legacyUntouched);
    check(
      "27.19 a revision from the future is refused, not silently downgraded",
      (() => {
        try {
          adaptReleaseProject({ projectRevision: RELEASE_PROJECT_REVISION + 1 });
          return false;
        } catch {
          return true;
        }
      })(),
    );

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

    // =======================================================================
    section("14. TASK 27 — authored state, theme authoring, non-destructive prepare");
    // =======================================================================
    const authoredProject = (await loadReleaseProject(projectDir)).project;
    // Every slot value the operator supplied through a pack must now live in
    // the AUTHORITATIVE authored block (the future Visual Editor's target).
    const packSlotKeys = new Set<string>();
    for (const applied of authoredProject.resolutions) {
      for (const content of Object.values(applied.resolution.routeContent ?? {})) {
        for (const key of Object.keys(content.slotValues ?? {})) packSlotKeys.add(key);
      }
      for (const key of Object.keys(applied.resolution.urls ?? {})) packSlotKeys.add(key);
    }
    check(
      "27.20 every pack-supplied slot value is folded into authored.slotValues",
      packSlotKeys.size > 0 &&
        [...packSlotKeys].every((key) => key in authoredProject.authored.slotValues),
      `${packSlotKeys.size} pack key(s) vs ${Object.keys(authoredProject.authored.slotValues).length} authored`,
    );
    check(
      "27.21 authored.slotValues round-trips through save/load (schema-valid)",
      ReleaseProjectSchema.safeParse(authoredProject).success &&
        authoredProject.authored.updatedAt !== null,
    );
    // …and the DERIVED materialization is what production actually consumes.
    const materializedSlotValues = JSON.parse(
      await readFile(
        path.join(authoredProject.stageStatus.content.artifact!.path, "slot-values.json"),
        "utf8",
      ),
    ) as Record<string, unknown>;
    check(
      "27.22 content-runs/<run>/slot-values.json is the DERIVED output of authored.slotValues",
      Object.entries(authoredProject.authored.slotValues).every(
        ([key, value]) => JSON.stringify(materializedSlotValues[key]) === JSON.stringify(value),
      ),
      JSON.stringify([...packSlotKeys].filter((key) => materializedSlotValues[key] === undefined)),
    );
    check(
      "27.23 slot-values.json format is UNCHANGED (bare slot-key → value map, no envelope)",
      Object.keys(materializedSlotValues).length > 0 &&
        !("schemaVersion" in materializedSlotValues) &&
        !("schemaName" in materializedSlotValues) &&
        !("slotValues" in materializedSlotValues) &&
        Object.keys(materializedSlotValues).every((key) => key.includes(".")),
      JSON.stringify(Object.keys(materializedSlotValues).slice(0, 3)),
    );
    const servedSiteDir = path.join(
      HOST_DATA_DIR,
      "production-builds",
      authoredProject.stageStatus.production.artifact!.id,
      "package",
      "site",
    );
    const servedHtml = (
      await Promise.all(
        [...(await snapshotTree(servedSiteDir)).keys()]
          .filter((rel) => rel.endsWith(".html"))
          .map((rel) => readFile(path.join(servedSiteDir, rel), "utf8")),
      )
    ).join("\n");
    const authoredStrings = Object.values(authoredProject.authored.slotValues).filter(
      (value): value is string => typeof value === "string" && !/^https?:/i.test(value),
    );
    check(
      "27.24 authored slot values actually SERVE in the production package",
      authoredStrings.length > 0 && authoredStrings.every((value) => servedHtml.includes(value)),
      JSON.stringify(authoredStrings.slice(0, 3)),
    );

    // ---- theme authoring: exactly {theme, production} go stale ------------
    // The token is DERIVED from this site's adapter at runtime (never a
    // literal): only a themeable paint group's bound token actually paints.
    const currentAdapter = JSON.parse(
      await readFile(
        path.join(authoredProject.stageStatus.theme.artifact!.path, "theme-adapter.json"),
        "utf8",
      ),
    ) as { paintGroups: Array<{ status: string; semanticToken: string | null }> };
    const authoredToken = currentAdapter.paintGroups.find(
      (group) =>
        group.status === "themeable" &&
        group.semanticToken !== null &&
        group.semanticToken.startsWith("color."),
    )?.semanticToken;
    check(
      "27.24b a themeable colour token is discoverable from this site's adapter",
      authoredToken !== undefined,
      JSON.stringify(currentAdapter.paintGroups.slice(0, 3)),
    );
    const themePack: ProductionResolution = {
      schemaVersion: 1,
      schemaName: "production-resolution-v1",
      theme: { tokens: { [authoredToken!]: "rgb(12, 34, 56)" }, note: "브랜드 액션 컬러" },
    };
    const themePackFile = path.join(scratch, "theme-pack.json");
    await writeFile(themePackFile, JSON.stringify(themePack, null, 2), "utf8");
    const themeResolved = await resolveRelease(projectDir, { resolutionFile: themePackFile, log: () => {} });
    check(
      "27.25 a theme edit invalidates [theme, production] and nothing else",
      JSON.stringify(themeResolved.invalidated) === JSON.stringify(["theme", "production"]),
      JSON.stringify(themeResolved.invalidated),
    );
    check(
      "27.26 the token landed in authored.theme (authoritative)",
      themeResolved.project.authored.theme.tokens?.[authoredToken!] === "rgb(12, 34, 56)",
      JSON.stringify(themeResolved.project.authored.theme),
    );
    const themeDry = await buildRelease(projectDir, { dryRun: true, log: () => {} });
    check(
      "27.27 theme stale, production stale — reconstruction/template/content FRESH",
      JSON.stringify(themeDry.plan.wouldRun) === JSON.stringify(["theme", "production"]) &&
        ["reconstruction", "template", "content", "seo", "assets"].every((stage) =>
          themeDry.plan.wouldReuse.includes(stage as never),
        ),
      `run=${JSON.stringify(themeDry.plan.wouldRun)} reuse=${JSON.stringify(themeDry.plan.wouldReuse)}`,
    );
    // The derived closure must NOT widen a theme edit: downstreamOf("theme")
    // is {production} only, so THEME_SELECTION_IMPACTS survives it unchanged
    // (Wave 2 acceptance criterion) — asserted here against the LIVE project,
    // not only against the constant.
    const three2 = await resolvePlanBuildAgreement(projectDir, themeResolved.invalidated);
    check(
      "27R.3 all THREE surfaces agree for a theme pack — still {theme, production}, never widened",
      three2.agrees && JSON.stringify(themeResolved.invalidated) === JSON.stringify(["theme", "production"]),
      three2.detail,
    );
    let badThemeRejected = false;
    const badThemeFile = path.join(scratch, "bad-theme.json");
    await writeFile(
      badThemeFile,
      JSON.stringify({
        schemaVersion: 1,
        schemaName: "production-resolution-v1",
        theme: { tokens: { "layout.grid.columns": "12" } },
      }),
      "utf8",
    );
    try {
      await resolveRelease(projectDir, { resolutionFile: badThemeFile, log: () => {} });
    } catch {
      badThemeRejected = true;
    }
    check("27.28 a LAYOUT value has no token to land in — refused by the contract", badThemeRejected);
    const themeBuild = await buildRelease(projectDir, { log: () => {} });
    check(
      "27.29 the theme build re-ran theme+production ONLY and reused content",
      themeBuild.failed === false &&
        JSON.stringify(themeBuild.run?.rerunStages) === JSON.stringify(["theme", "production"]) &&
        themeBuild.run?.reusedStages.includes("content") === true,
      JSON.stringify(themeBuild.run?.rerunStages) +
        (themeBuild.project.failure ? ` FAILURE: ${themeBuild.project.failure.message}` : ""),
    );
    const newThemeOverlay = await readFile(
      path.join(themeBuild.project.stageStatus.theme.artifact!.path, "theme-overlay.css"),
      "utf8",
    );
    check(
      "27.30 the authored token is what the new theme overlay paints",
      newThemeOverlay.includes("rgb(12, 34, 56)"),
    );

    // ---- non-destructive re-prepare --------------------------------------
    const beforeReprepare = (await loadReleaseProject(projectDir)).project;
    const reprepared = await prepareReleaseProject({
      registryDataRoot: registryRoot,
      productionSpecRef: compile0.specDir,
      projectId: beforeReprepare.projectId,
      log: () => {},
    });
    check(
      "27.31 re-prepare lands on the SAME project (identity is stable)",
      reprepared.reprepared === true &&
        reprepared.projectDir === projectDir &&
        reprepared.project.siteId === beforeReprepare.siteId &&
        reprepared.project.createdAt === beforeReprepare.createdAt,
      `${reprepared.projectDir} / ${reprepared.project.siteId}`,
    );
    check(
      "27.32 re-prepare PRESERVES resolutions",
      reprepared.project.resolutions.length === beforeReprepare.resolutions.length &&
        JSON.stringify(reprepared.project.resolutions.map((r) => r.resolutionId)) ===
          JSON.stringify(beforeReprepare.resolutions.map((r) => r.resolutionId)),
      `${reprepared.project.resolutions.length} vs ${beforeReprepare.resolutions.length}`,
    );
    check(
      "27.33 re-prepare PRESERVES authored state (slotValues + theme)",
      JSON.stringify(reprepared.project.authored) === JSON.stringify(beforeReprepare.authored),
      JSON.stringify(reprepared.project.authored),
    );
    check(
      "27.34 re-prepare PRESERVES run history (and appends its own run)",
      reprepared.project.runs.length === beforeReprepare.runs.length + 1 &&
        beforeReprepare.runs.every((run) =>
          reprepared.project.runs.some((kept) => kept.runId === run.runId),
        ),
      `${reprepared.project.runs.length} vs ${beforeReprepare.runs.length}`,
    );
    check(
      "27.35 re-prepare PRESERVES the advanced stage artifacts (no lineage regression)",
      reprepared.project.stageStatus.content.artifact!.path ===
        beforeReprepare.stageStatus.content.artifact!.path &&
        reprepared.project.stageStatus.theme.artifact!.path ===
          beforeReprepare.stageStatus.theme.artifact!.path,
    );
    // …while requirements are genuinely RECOMPUTED from the re-hashed lineage.
    const rerequirements = await loadRequirementsFile(projectDir);
    check(
      "27.36 re-prepare RECOMPUTES requirements (distinct from preserving them)",
      rerequirements.requirements.length > 0 &&
        rerequirements.requirements.filter((r) => r.status === "resolved").length > 0,
      `${rerequirements.counts.total} total / ${rerequirements.counts.resolved} resolved`,
    );
    const rereparedReloaded = await loadReleaseProject(projectDir);
    check(
      "27.37 the saved project is revision 2 and re-loads without adaptation",
      rereparedReloaded.adaptedFrom === null &&
        rereparedReloaded.project.projectRevision === RELEASE_PROJECT_REVISION,
    );

    // ---- Task 27 GED-F: brand leak becomes a RELEASE REQUIREMENT ---------
    section("Task 27 — brand-leak requirement kind (GED-F)");
    check(
      "27.brand.1 `brand-leak` is a declared requirement kind with a severity basis",
      (REQUIREMENT_KINDS as readonly string[]).includes("brand-leak") &&
        SEVERITY_POLICY["brand-leak"].severity === "high-value" &&
        SEVERITY_POLICY["brand-leak"].basis.length > 0,
    );
    check(
      "27.brand.2 every requirement kind still has a severity policy row",
      REQUIREMENT_KINDS.every((kind) => SEVERITY_POLICY[kind] !== undefined),
    );

    // A synthetic report, so the POLICY is tested rather than whatever a given
    // lineage happens to contain.
    const finding = (partial: Partial<BrandFinding>): BrandFinding => ({
      surface: "visible-text",
      origin: "injected-value",
      route: "/",
      value: 'value still contains source brand token "fixture"',
      matched: "fixture",
      sourceUrl: null,
      slotKey: "home.hero.headline",
      nodeId: null,
      evidenceFile: "data/x/content-runs/r/report/brand-leak.json",
      evidencePointer: "warnings[home.hero.headline]",
      suggestedResolution: 'routeContent["/"].slotValues["home.hero.headline"]',
      ...partial,
    });
    const shipping = finding({});
    const untouched = finding({ origin: "template-default", slotKey: "home.nav.about.label" });
    const engineBlocked = finding({ origin: "engine-blocked", slotKey: "home.hero.sub" });
    const unbound = finding({ slotKey: null });
    const svgMark = finding({
      surface: "svg-aria-label",
      slotKey: null,
      nodeId: "n000017",
      value: "Fixture Logo",
      evidenceFile: "data/x/recon-templates/t/app/reconstruction-data/pages/p000001.json",
      evidencePointer: "desktop.doc[n000017].v",
    });
    check(
      "27.brand.3 blocking ONLY for a shipping value on a slot-bound identity surface",
      brandFindingSeverity(shipping) === "release-blocking",
    );
    check(
      "27.brand.4 an untouched default and an engine-blocked slot stay NON-blocking",
      brandFindingSeverity(untouched) === "high-value" &&
        brandFindingSeverity(engineBlocked) === "high-value",
      `${brandFindingSeverity(untouched)} / ${brandFindingSeverity(engineBlocked)}`,
    );
    check(
      "27.brand.5 a finding with NO write target is never release-blocking (the source-brand-asset trap)",
      brandFindingSeverity(unbound) === "high-value" &&
        brandFindingSeverity(svgMark) === "high-value" &&
        BRAND_SURFACE_POLICY["svg-aria-label"].canBlock === false,
    );

    const syntheticReport: BrandSurfaceReport = {
      schemaName: "brand-surface-report-v1",
      schemaVersion: 1,
      host: HOST,
      brandTokens: ["fixture"],
      neutralization: { enabled: false, default: "OFF", basis: "detector only" },
      scanned: { routes: 1, elementNodes: 10, inlineSvgNodes: 1, contentWarnings: 4, unavailable: [] },
      counts: {
        "visible-text": 3,
        "source-url": 0,
        "title-meta": 0,
        canonical: 0,
        "open-graph": 0,
        "json-ld": 0,
        "image-logo": 0,
        "image-alt": 0,
        "aria-label": 0,
        "svg-text": 0,
        "svg-aria-label": 1,
        "svg-symbol-id": 0,
        "dynamic-template-content": 0,
        "body-anchor-identity": 0,
      },
      findings: [shipping, untouched, engineBlocked, svgMark],
      truncated: 0,
    };
    const brandReqs = brandSurfaceRequirements(syntheticReport);
    const blockingReq = brandReqs.find((requirement) => requirement.severity === "release-blocking");
    check(
      "27.brand.6 a finding becomes a STRUCTURED requirement with a deterministic artifact-derived id",
      blockingReq?.requirementId === "brand-leak-visible-text-home.hero.headline" &&
        blockingReq.kind === "brand-leak" &&
        blockingReq.slotKey === "home.hero.headline" &&
        blockingReq.evidence[0].file === shipping.evidenceFile &&
        blockingReq.evidence[0].pointer === shipping.evidencePointer,
      JSON.stringify(blockingReq?.requirementId),
    );
    check(
      "27.brand.7 requirement ids are stable across re-collection (same report → same ids)",
      JSON.stringify(brandSurfaceRequirements(syntheticReport).map((r) => r.requirementId)) ===
        JSON.stringify(brandReqs.map((r) => r.requirementId)),
    );
    check(
      "27.brand.8 the non-blocking surfaces stay grouped, non-blocking, and carry the exact count",
      brandReqs.filter((r) => r.severity === "high-value").length === 2 &&
        brandReqs.find((r) => r.requirementId === "brand-leak-svg-aria-label")?.count === 1 &&
        brandReqs.find((r) => r.requirementId === "brand-leak-visible-text")?.count === 2,
      JSON.stringify(brandReqs.map((r) => `${r.requirementId}:${r.severity}:${r.count ?? "-"}`)),
    );
    check(
      "27.brand.9 every brand requirement validates against the requirement schema",
      brandReqs.every((requirement) => RequirementSchema.safeParse(requirement).success),
    );

    // The whole point of the blocking policy: the blocker is REACHABLE.
    const brandResolution: ProductionResolution = {
      schemaVersion: 1,
      schemaName: "production-resolution-v1",
      routeContent: { "/": { slotValues: { "home.hero.headline": "반복 업무 자동화 플랫폼" } } },
    };
    const brandMatch = matchResolutionToRequirements(brandReqs, brandResolution);
    check(
      "27.brand.10 an AUTHORED replacement matches the blocking brand requirement",
      brandMatch.matches.some(
        (match) => match.requirementId === "brand-leak-visible-text-home.hero.headline",
      ),
      JSON.stringify(brandMatch.matches),
    );
    const brandMerged = mergeRequirements(null, brandReqs, [
      {
        resolutionId: "res-brand-1",
        appliedAt: new Date().toISOString(),
        file: "resolutions/res-brand-1.json",
        resolutionHash: "0".repeat(64),
        resolution: brandResolution,
        matched: [],
        unmatchedFields: [],
      },
    ]);
    check(
      "27.brand.11 the resolution CLEARS it — the kind has a reachable resolution path",
      brandMerged.find((r) => r.requirementId === "brand-leak-visible-text-home.hero.headline")
        ?.status === "resolved" &&
        releaseBlockers(brandMerged).filter((r) => r.kind === "brand-leak").length === 0,
      JSON.stringify(releaseBlockers(brandMerged).map((r) => r.requirementId)),
    );
    const brandAck = mergeRequirements(null, brandReqs, [
      {
        resolutionId: "res-brand-2",
        appliedAt: new Date().toISOString(),
        file: "resolutions/res-brand-2.json",
        resolutionHash: "0".repeat(64),
        resolution: {
          schemaVersion: 1,
          schemaName: "production-resolution-v1",
          acknowledgements: [
            { requirementId: "brand-leak-svg-aria-label", note: "inline SVG mark — GED-F future work" },
          ],
        },
        matched: [],
        unmatchedFields: [],
      },
    ]);
    check(
      "27.brand.12 an acknowledgement records the SVG mark as an accepted limitation",
      brandAck.find((r) => r.requirementId === "brand-leak-svg-aria-label")?.status ===
        "accepted-limitation",
    );

    // One slot can now carry two different gaps; one value must clear both.
    const twoOnOneSlot: Requirement[] = [
      {
        requirementId: "external-url-home.hero.headline",
        kind: "external-url",
        severity: "high-value",
        status: "unresolved",
        sourceStage: "content",
        slotKey: "home.hero.headline",
        message: "unresolved",
        resolutionOptions: ['urls["home.hero.headline"]'],
        evidence: [{ file: "x", pointer: "y" }],
      },
      brandReqs[0],
    ];
    const bothMatched = matchResolutionToRequirements(twoOnOneSlot, {
      schemaVersion: 1,
      schemaName: "production-resolution-v1",
      urls: { "home.hero.headline": "https://newco.example/docs" },
    });
    check(
      "27.brand.13 one slot value resolves EVERY requirement bound to that slot (no silent drop)",
      bothMatched.matches.length === 2,
      JSON.stringify(bothMatched.matches),
    );

    // A routeContent slot value bound to NO open requirement used to produce
    // matched: [] AND unmatchedFields: [] — the operator's input appeared in
    // neither column of the resolve summary.
    const unboundSlotValue = matchResolutionToRequirements(twoOnOneSlot, {
      schemaVersion: 1,
      schemaName: "production-resolution-v1",
      routeContent: {
        global: { slotValues: { "home.nobody.asked.for.this": "authored anyway" } },
      },
    });
    check(
      "27P.5 an authored slot value that matches NO open requirement is reported as unmatched",
      unboundSlotValue.matches.length === 0 &&
        unboundSlotValue.unmatchedFields.length === 1 &&
        unboundSlotValue.unmatchedFields[0] ===
          "routeContent.global.slotValues.home.nobody.asked.for.this",
      JSON.stringify(unboundSlotValue),
    );
    check(
      "27P.6 a slot value that DOES bind still matches every bound requirement (27P.5 is not a blanket)",
      matchResolutionToRequirements(twoOnOneSlot, {
        schemaVersion: 1,
        schemaName: "production-resolution-v1",
        routeContent: { global: { slotValues: { "home.hero.headline": "NewCo" } } },
      }).matches.length === 2,
    );

    // …and the real lineage is genuinely measured, so 25.1's immutability
    // check above is not vacuous for the new scan.
    check(
      "27.brand.14 the stripe lineage brand scan measured real routes and inline SVG",
      stripeCollected.brandSurfaces.scanned.routes > 0 &&
        stripeCollected.brandSurfaces.scanned.inlineSvgNodes > 0 &&
        stripeCollected.brandSurfaces.neutralization.enabled === false,
      JSON.stringify(stripeCollected.brandSurfaces.scanned),
    );
    const stripeBrandReqs = stripeCollected.requirements.filter((r) => r.kind === "brand-leak");
    check(
      "27.brand.15 stripe brand-leak requirement counts are read from the scan, never hardcoded",
      stripeBrandReqs.length > 0 &&
        stripeBrandReqs.every((requirement) => {
          if (requirement.severity !== "high-value") return true;
          const surface = requirement.requirementId.slice("brand-leak-".length);
          return (
            requirement.count ===
            (stripeCollected.brandSurfaces.counts as Record<string, number>)[surface]
          );
        }),
      JSON.stringify(stripeBrandReqs.map((r) => `${r.requirementId}:${r.count ?? "-"}`)),
    );

    // ---- 27R.4: the two surfaces must DESCRIBE a drifted frozen stage the
    // same way, not merely agree on the stage set. plan rendered it "STALE
    // (will re-run on release:build)" while build files it BLOCKED BY
    // frozen-stage-input-drift and REFUSES — opposite words for one state.
    // Runs LAST because the drift is deliberately left in place until the
    // probe file is removed. (`stale` — the field the plan↔build agreement
    // invariant compares — is unchanged; only the rendering split.)
    const frozenProbe = path.join(templateDir, "wr-frozen-drift-probe.json");
    await writeFile(frozenProbe, JSON.stringify({ simulated: "frozen input drift" }), "utf8");
    const driftPlan = await planRelease(projectDir, { log: () => {} });
    const driftDry = await buildRelease(projectDir, { dryRun: true, log: () => {} });
    let driftRefused = false;
    try {
      await buildRelease(projectDir, { log: () => {} });
    } catch {
      driftRefused = true;
    }
    check(
      "27R.4 build REFUSES a drifted frozen stage and plan now says so too (no opposite wording)",
      driftRefused &&
        driftDry.plan.blocked.some(
          (entry) => entry.stage === "template" && entry.blockedBy.includes("frozen-stage-input-drift"),
        ) &&
        driftPlan.text.includes("BLOCKED BY frozen-stage-input-drift") &&
        !driftPlan.text.includes("will re-run on release:build") &&
        driftPlan.nextActions.some((action) => action.includes("release:build REFUSES")),
      `refused=${driftRefused} nextActions=${JSON.stringify(driftPlan.nextActions.slice(-1))}`,
    );
    await rm(frozenProbe, { force: true });
    const restoredPlan = await planRelease(projectDir, { log: () => {} });
    check(
      "27R.5 removing the drift clears the frozen block (the probe was the cause)",
      !restoredPlan.text.includes("frozen-stage-input-drift") && restoredPlan.ready.includes("template"),
      `ready=${JSON.stringify(restoredPlan.ready)}`,
    );

    // =======================================================================
    section("Task 28 — CR1/CR2/CR3/CR4: revision chain, displayName, site registry");
    // =======================================================================
    // A DEDICATED project so nothing above is disturbed: same accepted lineage,
    // its own siteId, its own revision chain and its own registry row.
    const cr = await prepareReleaseProject({
      registryDataRoot: registryRoot,
      productionSpecRef: compile0.specDir,
      siteId: "task28-cr",
      displayName: "Task 28 Demo Site",
      log: () => {},
    });
    const crChain0 = await loadRevisionChain(cr.projectDir);
    check(
      "28.CR2.1 the FIRST prepare records the authored baseline (r000, origin prepare)",
      crChain0.length === 1 &&
        crChain0[0].revisionId === "r000" &&
        crChain0[0].origin === "prepare" &&
        crChain0[0].parentRevisionId === null,
      JSON.stringify(crChain0.map((r: AuthoredRevision) => `${r.revisionId}:${r.origin}`)),
    );
    check(
      "28.CR2.2 the recorded snapshot IS the project's authoritative authored state",
      crChain0[0].authoredStateHash === hashAuthoredState(cr.project.authored),
      `${crChain0[0].authoredStateHash} vs ${hashAuthoredState(cr.project.authored)}`,
    );
    check(
      "28.CR3.1 the operator-supplied displayName is recorded on the project",
      cr.project.displayName === "Task 28 Demo Site",
      String(cr.project.displayName),
    );
    check(
      "28.CR4.1 prepare cached the project in the site registry index",
      cr.registeredSiteKey === `${HOST}/task28-cr` && cr.registryWarnings.length === 0,
      `${cr.registeredSiteKey} warnings=${JSON.stringify(cr.registryWarnings)}`,
    );
    const crIndex1 = await loadSiteRegistry({ dataRoot: registryRoot });
    const crRows1 = crIndex1.entries.filter((entry) => entry.siteKey === `${HOST}/task28-cr`);
    check(
      "28.CR3.2 the indexed display name comes from the project, not from the siteId",
      crRows1.length === 1 &&
        crRows1[0].name === "Task 28 Demo Site" &&
        crRows1[0].nameSource === "project-display-name",
      JSON.stringify(crRows1.map((row) => [row.name, row.nameSource])),
    );
    check(
      "28.CR3.3 a project with NO displayName still indexes, deriving the name from siteId",
      crIndex1.entries.some(
        (entry) =>
          entry.siteKey === `${HOST}/${defaultSiteId(HOST)}` &&
          entry.name === defaultSiteId(HOST) &&
          entry.nameSource === "derived-from-site-id",
      ),
      JSON.stringify(crIndex1.entries.map((row) => [row.siteKey, row.nameSource])),
    );
    // ---- idempotency: prepare twice ---------------------------------------
    const crAgain = await prepareReleaseProject({
      registryDataRoot: registryRoot,
      productionSpecRef: compile0.specDir,
      siteId: "task28-cr",
      log: () => {},
    });
    const crChain1 = await loadRevisionChain(cr.projectDir);
    check(
      "28.CR2.3 a re-prepare that moves NO authored value appends NO revision",
      crChain1.length === 1,
      JSON.stringify(crChain1.map((r: AuthoredRevision) => r.revisionId)),
    );
    check(
      "28.CR3.4 a re-prepare that omits --display-name CARRIES the recorded name",
      crAgain.project.displayName === "Task 28 Demo Site" &&
        crAgain.preserved.some((entry) => entry === "displayName:Task 28 Demo Site"),
      `${crAgain.project.displayName} / ${JSON.stringify(crAgain.preserved)}`,
    );
    const crIndex2 = await loadSiteRegistry({ dataRoot: registryRoot });
    check(
      "28.CR4.2 re-registering upserts by siteKey — one row, never a duplicate",
      crIndex2.entries.filter((entry) => entry.siteKey === `${HOST}/task28-cr`).length === 1,
      String(crIndex2.entries.filter((entry) => entry.siteKey === `${HOST}/task28-cr`).length),
    );
    check(
      "28.CR4.3 the registry row points at the project directory the prepare wrote",
      crIndex2.entries.find((entry) => entry.siteKey === `${HOST}/task28-cr`)?.projectDir ===
        cr.projectDir.split(path.sep).join("/"),
      crIndex2.entries.find((entry) => entry.siteKey === `${HOST}/task28-cr`)?.projectDir,
    );
    check(
      "28.CR4.4 the registry head-revision pointer sees the chain prepare recorded",
      crIndex2.entries.find((entry) => entry.siteKey === `${HOST}/task28-cr`)?.revision
        ?.revisionId === "r000",
      JSON.stringify(crIndex2.entries.find((entry) => entry.siteKey === `${HOST}/task28-cr`)?.revision),
    );
    // ---- resolve is the other transaction boundary ------------------------
    const crThemePack = path.join(scratch, "cr-theme-pack.json");
    await writeFile(
      crThemePack,
      JSON.stringify({
        schemaVersion: 1,
        schemaName: "production-resolution-v1",
        theme: { tokens: { [authoredToken!]: "rgb(9, 9, 9)" } },
      }),
      "utf8",
    );
    await resolveRelease(cr.projectDir, { resolutionFile: crThemePack, log: () => {} });
    const crChain2 = await loadRevisionChain(cr.projectDir);
    check(
      "28.CR2.4 a resolve that MOVES the authored state appends exactly one record",
      crChain2.length === 2 &&
        crChain2[1].origin === "resolve" &&
        crChain2[1].parentRevisionId === "r000" &&
        crChain2[1].change.themeChanged === true,
      JSON.stringify(crChain2.map((r: AuthoredRevision) => `${r.revisionId}:${r.origin}`)),
    );
    check(
      "28.CR2.5 the appended snapshot matches the saved project (document and chain agree)",
      crChain2[1].authoredStateHash ===
        hashAuthoredState((await loadReleaseProject(cr.projectDir)).project.authored),
    );
    await resolveRelease(cr.projectDir, { resolutionFile: crThemePack, log: () => {} });
    const crChain3 = await loadRevisionChain(cr.projectDir);
    check(
      "28.CR2.6 re-applying the SAME pack records the resolution but appends NO revision",
      crChain3.length === 2 &&
        (await loadReleaseProject(cr.projectDir)).project.resolutions.length === 2,
      `chain=${crChain3.length} resolutions=${(await loadReleaseProject(cr.projectDir)).project.resolutions.length}`,
    );
    await rm(cr.projectDir, { recursive: true, force: true });

    // =======================================================================
    section("Task 28 §1B — requirement count ↔ persisted requirement ids");
    // =======================================================================
    // The Task-27 drift: a CLI printed one requirement total and
    // requirements.json held another, with nothing on disk recording which
    // collection either number described. Every command that WRITES that file
    // must now report the file's own total, and every write must say which run
    // and which stage artifacts produced it. Nothing below hardcodes a total —
    // the invariant is agreement, whatever the numbers are.
    const drift = await prepareReleaseProject({
      registryDataRoot: registryRoot,
      productionSpecRef: compile0.specDir,
      siteId: "task28-drift",
      log: () => {},
    });
    const driftPrepare = await requirementCountAgreement(drift.projectDir, drift.requirementsCount);
    check(
      "28.1B.4 prepare reports exactly the unique requirement ids it persisted",
      driftPrepare.agrees,
      driftPrepare.detail,
    );
    const driftPrepareFile = await loadRequirementsFile(drift.projectDir);
    check(
      "28.1B.5 prepare's file names its own run and the ACCEPTED-LINEAGE artifacts it collected from",
      driftPrepareFile.collectedFrom?.releaseRunKind === "prepare" &&
        driftPrepareFile.collectedFrom.releaseRunId ===
          drift.project.runs[drift.project.runs.length - 1]!.runId &&
        driftPrepareFile.collectedFrom.stageArtifacts.content ===
          drift.project.acceptedLineage.content.path,
      JSON.stringify(driftPrepareFile.collectedFrom ?? null),
    );
    const driftPrepareRun = JSON.parse(
      await readFile(
        path.join(
          drift.projectDir,
          "runs",
          drift.project.runs[drift.project.runs.length - 1]!.runId,
          "run.json",
        ),
        "utf8",
      ),
    ) as { requirementsTotal: number };
    check(
      "28.1B.6 prepare's run.json records the total it reported — the number survives the terminal",
      driftPrepareRun.requirementsTotal === drift.requirementsCount,
      `run.requirementsTotal=${driftPrepareRun.requirementsTotal} vs reported ${drift.requirementsCount}`,
    );

    const driftAgain = await prepareReleaseProject({
      registryDataRoot: registryRoot,
      productionSpecRef: compile0.specDir,
      siteId: "task28-drift",
      log: () => {},
    });
    const driftReprepare = await requirementCountAgreement(
      driftAgain.projectDir,
      driftAgain.requirementsCount,
    );
    check(
      "28.1B.7 a re-prepare still reports exactly what it persisted",
      driftReprepare.agrees,
      driftReprepare.detail,
    );

    const driftPackFile = path.join(scratch, "task28-drift-pack.json");
    await writeFile(
      driftPackFile,
      JSON.stringify(
        {
          schemaVersion: 1,
          schemaName: "production-resolution-v1",
          theme: { tokens: { "color.accent.primary": "#123456" } },
        },
        null,
        2,
      ),
      "utf8",
    );
    const driftResolved = await resolveRelease(driftAgain.projectDir, {
      resolutionFile: driftPackFile,
      log: () => {},
    });
    const driftResolveAgreement = await requirementCountAgreement(
      driftAgain.projectDir,
      driftResolved.requirementsCount,
    );
    check(
      "28.1B.8 resolve REWRITES requirements.json and reports exactly what it wrote",
      driftResolveAgreement.agrees,
      driftResolveAgreement.detail,
    );
    const driftResolveFile = await loadRequirementsFile(driftAgain.projectDir);
    check(
      "28.1B.9 resolve's write is attributed to the resolve run that made it",
      driftResolveFile.collectedFrom?.releaseRunKind === "resolve" &&
        driftResolveFile.collectedFrom.releaseRunId ===
          driftResolved.project.runs[driftResolved.project.runs.length - 1]!.runId,
      JSON.stringify(driftResolveFile.collectedFrom ?? null),
    );

    const driftDryRun = await buildRelease(driftAgain.projectDir, { dryRun: true, log: () => {} });
    const driftDryAgreement = await requirementCountAgreement(
      driftAgain.projectDir,
      driftDryRun.requirementsCount,
    );
    check(
      "28.1B.10 a dry run reports the PERSISTED total and writes nothing",
      driftDryAgreement.agrees &&
        driftDryRun.requirementsCount === driftResolved.requirementsCount,
      `${driftDryAgreement.detail} | resolve reported ${driftResolved.requirementsCount}`,
    );

    // Two writes of the same project by different runs: the totals may
    // legitimately differ (a build re-collects from artifacts it just made),
    // but the file must always say WHICH run and WHICH artifacts, so a reader
    // can attribute a delta instead of calling it drift.
    check(
      "28.1B.11 every requirements write carries a distinct, run-attributed provenance",
      driftPrepareFile.collectedFrom !== undefined &&
        driftResolveFile.collectedFrom !== undefined &&
        driftPrepareFile.collectedFrom.releaseRunId !== driftResolveFile.collectedFrom.releaseRunId,
      `${driftPrepareFile.collectedFrom?.releaseRunId} vs ${driftResolveFile.collectedFrom?.releaseRunId}`,
    );

    // The other half of the class: a collection carrying one id twice would
    // make the array length unreproducible by any id-keyed reader. Refused
    // where the information would be lost, and named, not counted.
    const oneRequirement = driftPrepareFile.requirements[0]!;
    let duplicateBuildRefused = "";
    try {
      buildRequirementsFile("task28-drift", [oneRequirement, { ...oneRequirement }]);
    } catch (err) {
      duplicateBuildRefused = (err as Error).message;
    }
    check(
      "28.1B.12 a duplicate requirement id is REFUSED when the file is built, and named",
      duplicateBuildRefused.includes(oneRequirement.requirementId),
      duplicateBuildRefused,
    );
    let duplicateMergeRefused = "";
    try {
      mergeRequirements(null, [oneRequirement, { ...oneRequirement }], []);
    } catch (err) {
      duplicateMergeRefused = (err as Error).message;
    }
    check(
      "28.1B.13 a duplicate id in ONE collection is refused at the merge, not silently dropped",
      duplicateMergeRefused.includes(oneRequirement.requirementId),
      duplicateMergeRefused,
    );
    check(
      "28.1B.14 duplicateRequirementIds names every colliding id and nothing else",
      JSON.stringify(duplicateRequirementIds([oneRequirement, { ...oneRequirement }])) ===
        JSON.stringify([oneRequirement.requirementId]) &&
        duplicateRequirementIds(driftPrepareFile.requirements).length === 0,
      JSON.stringify(duplicateRequirementIds([oneRequirement, { ...oneRequirement }])),
    );
    await rm(drift.projectDir, { recursive: true, force: true });

    // =======================================================================
    section("Task 28 §1C — the assets stage RUNNER executes, and is reused");
    // =======================================================================
    // Task 27 proved asset REUSE only: across all three real builds `assets`
    // appeared exclusively in reusedStages, so the runner itself had never
    // executed on any pipeline. The two halves below close that hole, and
    // 28.1C.7/8/12 are regressions for the two defects the first real
    // execution exposed (duplicate manifest entry; stale counts).
    const acRunDirs = async (): Promise<string[]> =>
      (await readdir(path.join(HOST_DATA_DIR, "asset-materializations"))).sort();
    const acMediaTotals = async (
      dir: string,
    ): Promise<{ files: number; bytes: number }> => {
      const names = await readdir(path.join(dir, "media"));
      let bytes = 0;
      for (const name of names) bytes += (await stat(path.join(dir, "media", name))).size;
      return { files: names.length, bytes };
    };
    const acManifestOf = async (dir: string): Promise<{
      counts: { uniqueFiles: number; totalBytes: number; rewriteEntries: number };
      entries: Array<{ inventoryId: string; status: string; sha256: string | null; localPath: string | null }>;
    }> => JSON.parse(await readFile(path.join(dir, "manifest.json"), "utf8"));

    const acBaseManifest = await acManifestOf(materializationDir);
    const acRunsBefore = await acRunDirs();
    const acFile = path.join(scratch, "task28-1c-hero.png");
    await writeFile(acFile, Buffer.concat([PNG_1PX, Buffer.from([28, 1, 12])]));
    const acSha = createHash("sha256").update(await readFile(acFile)).digest("hex");

    const ac = await prepareReleaseProject({
      registryDataRoot: registryRoot,
      productionSpecRef: compile0.specDir,
      siteId: "task28-assets-runner",
      log: () => {},
    });
    const acPackFile = path.join(scratch, "task28-1c-pack.json");
    await writeFile(
      acPackFile,
      JSON.stringify(
        {
          schemaVersion: 1,
          schemaName: "production-resolution-v1",
          // ASSETS ONLY. Any other populated field would pull content/theme/seo
          // in through RESOLUTION_FIELD_IMPACTS and the trigger would no longer
          // isolate the assets dependency.
          assets: { [heroInventoryId!]: { file: acFile, note: "task28 §1C operator replacement" } },
        },
        null,
        2,
      ),
      "utf8",
    );
    const acResolved = await resolveRelease(ac.projectDir, { resolutionFile: acPackFile, log: () => {} });
    check(
      "28.1C.1 an assets-only authored replacement stales EXACTLY assets+production, through the graph",
      JSON.stringify(acResolved.invalidated) === JSON.stringify(["assets", "production"]),
      JSON.stringify(acResolved.invalidated),
    );
    const acDry = await buildRelease(ac.projectDir, { dryRun: true, log: () => {} });
    check(
      "28.1C.2 the plan agrees: assets+production would run, content/theme/seo are reused",
      JSON.stringify(acDry.plan.wouldRun) === JSON.stringify(["assets", "production"]) &&
        ["content", "theme", "seo"].every((stage) => acDry.plan.wouldReuse.includes(stage as never)),
      `run=${JSON.stringify(acDry.plan.wouldRun)} reuse=${JSON.stringify(acDry.plan.wouldReuse)}`,
    );

    const acBuild1 = await buildRelease(ac.projectDir, { log: () => {} });
    check(
      "28.1C.3 the assets STAGE RUNNER executed — assets is in rerunStages, not reusedStages",
      acBuild1.run !== null &&
        acBuild1.run.rerunStages.includes("assets") &&
        !acBuild1.run.reusedStages.includes("assets") &&
        acBuild1.failed === false,
      `rerun=${JSON.stringify(acBuild1.run?.rerunStages)} reused=${JSON.stringify(acBuild1.run?.reusedStages)}`,
    );
    const acDerivedDir = acBuild1.project.stageStatus.assets.artifact!.path;
    check(
      "28.1C.4 it produced a NEW materialization run and left the base run in place",
      acDerivedDir !== materializationDir &&
        existsSync(path.join(acDerivedDir, "manifest.json")) &&
        (await acRunDirs()).length === acRunsBefore.length + 1,
      `${acDerivedDir} (was ${materializationDir})`,
    );
    const acRewrite = JSON.parse(
      await readFile(path.join(acDerivedDir, "rewrite-map.json"), "utf8"),
    ) as { entries: Array<{ sourceUrl: string; localPath: string }> };
    const acLocalPath = `/media/${acSha}.png`;
    check(
      "28.1C.5 the operator bytes are stored under their own sha256 and the source url now points at them",
      existsSync(path.join(acDerivedDir, "media", `${acSha}.png`)) &&
        acRewrite.entries.filter((entry) => entry.sourceUrl === heroUrl).length === 1 &&
        acRewrite.entries.find((entry) => entry.sourceUrl === heroUrl)?.localPath === acLocalPath,
      acLocalPath,
    );
    const acReplacement = JSON.parse(
      await readFile(path.join(acDerivedDir, "replacement-manifest.json"), "utf8"),
    ) as { entries: Array<{ inventoryId: string; replacement: { status: string; providedFile: string | null; providedBy: string | null } }> };
    const acHeroReplacement = acReplacement.entries.find((entry) => entry.inventoryId === heroInventoryId)!;
    check(
      "28.1C.6 the replacement seam is flipped to provided and attributed to the release run",
      acHeroReplacement.replacement.status === "provided" &&
        acHeroReplacement.replacement.providedFile === acLocalPath &&
        acHeroReplacement.replacement.providedBy === `release:${ac.project.projectId}:${acBuild1.run!.runId}`,
      JSON.stringify(acHeroReplacement.replacement),
    );
    const acDerivedManifest = await acManifestOf(acDerivedDir);
    check(
      "28.1C.7 DEFECT-1 regression: one manifest record per inventoryId — the operator record REPLACES, never appends",
      acDerivedManifest.entries.filter((entry) => entry.inventoryId === heroInventoryId).length === 1 &&
        acDerivedManifest.entries.length === acBaseManifest.entries.length &&
        acDerivedManifest.entries.find((entry) => entry.inventoryId === heroInventoryId)?.status ===
          "operator-provided",
      `${acDerivedManifest.entries.filter((e) => e.inventoryId === heroInventoryId).length} record(s), ` +
        `${acDerivedManifest.entries.length} entries vs base ${acBaseManifest.entries.length}`,
    );
    const acMedia = await acMediaTotals(acDerivedDir);
    check(
      "28.1C.8 DEFECT-2 regression: counts describe THIS run's media directory, not the base run's",
      acDerivedManifest.counts.uniqueFiles === acMedia.files &&
        acDerivedManifest.counts.totalBytes === acMedia.bytes &&
        acDerivedManifest.counts.rewriteEntries === acRewrite.entries.length,
      `counts=${JSON.stringify(acDerivedManifest.counts)} measured=${JSON.stringify(acMedia)}`,
    );
    const acSpec = JSON.parse(
      await readFile(
        path.join(acBuild1.project.stageStatus.production.artifact!.path, "production-spec.json"),
        "utf8",
      ),
    ) as { lineage: { assets: { dir: string; materializationRunId: string } } };
    check(
      "28.1C.9 the production bake CONSUMED the derived run (spec lineage names it, not the base)",
      path.resolve(acSpec.lineage.assets.dir) === path.resolve(acDerivedDir) &&
        acSpec.lineage.assets.materializationRunId === acBuild1.project.stageStatus.assets.artifact!.id,
      `${acSpec.lineage.assets.dir} vs ${acDerivedDir}`,
    );

    // ---- second, otherwise-unchanged build: the artifact must be REUSED ----
    const acTreeBefore = (await hashDirectory(acDerivedDir, [])).hash;
    const acRunsAfterBuild1 = await acRunDirs();
    const acBuild2 = await buildRelease(ac.projectDir, { log: () => {} });
    check(
      "28.1C.10 an otherwise-unchanged rebuild REUSES assets — nothing rerun",
      acBuild2.run !== null &&
        acBuild2.run.reusedStages.includes("assets") &&
        !acBuild2.run.rerunStages.includes("assets") &&
        acBuild2.run.rerunStages.length === 0,
      `rerun=${JSON.stringify(acBuild2.run?.rerunStages)} reused=${JSON.stringify(acBuild2.run?.reusedStages)}`,
    );
    check(
      "28.1C.11 the reused artifact is byte-identical and no second materialization run was minted",
      (await hashDirectory(acDerivedDir, [])).hash === acTreeBefore &&
        JSON.stringify(await acRunDirs()) === JSON.stringify(acRunsAfterBuild1) &&
        acBuild2.project.stageStatus.assets.artifact!.id ===
          acBuild1.project.stageStatus.assets.artifact!.id,
      `${acTreeBefore.slice(0, 12)} → ${(await hashDirectory(acDerivedDir, [])).hash.slice(0, 12)}`,
    );

    // ---- replacing the SAME asset again (the editor's ordinary case) -------
    // Direct engine call: the shape regression does not need a second bake.
    const acFile2 = path.join(scratch, "task28-1c-hero-2.png");
    await writeFile(acFile2, Buffer.concat([PNG_1PX, Buffer.from([28, 1, 12, 2])]));
    const acSecond = await applyAssetResolutions({
      baseMaterializationRunDir: acDerivedDir,
      assets: { [heroInventoryId!]: { file: acFile2 } },
      fontDecisions: {},
      providedBy: "task28-1c-second",
      outputDir: path.join(scratch, "task28-1c-second-run"),
      log: () => {},
    });
    const acSecondManifest = await acManifestOf(acSecond.runDir);
    const acSecondMedia = await acMediaTotals(acSecond.runDir);
    check(
      "28.1C.12 replacing the SAME asset a second time stays single-valued and correctly counted",
      acSecondManifest.entries.filter((entry) => entry.inventoryId === heroInventoryId).length === 1 &&
        acSecondManifest.entries.length === acBaseManifest.entries.length &&
        acSecondManifest.counts.totalBytes === acSecondMedia.bytes &&
        acSecondManifest.counts.uniqueFiles === acSecondMedia.files,
      `${acSecondManifest.entries.filter((e) => e.inventoryId === heroInventoryId).length} record(s), ` +
        `counts=${JSON.stringify(acSecondManifest.counts)} measured=${JSON.stringify(acSecondMedia)}`,
    );
    await rm(ac.projectDir, { recursive: true, force: true });

    // =======================================================================
    section("Task 28 §2 — the shared authoring substrate: authored.assets + authored.brand");
    // =======================================================================
    // Phase 1 recorded the gap this section closes: "AuthoredState still has no
    // assets field: the asset replacement survives only as an entry in
    // project.resolutions[], not folded into project.authored the way
    // slotValues and theme are." Everything below is measured on the REAL
    // engine — the freshness verdicts come from run.json, never from the
    // impact table alone.

    // ---- backward compatibility, on REAL projects already on disk ---------
    // The two new fields are OPTIONAL and ABSENT-when-empty. That is not a
    // style choice: `AuthoredStateSchema` is `.strict()`, and
    // `hashAuthoredState` hashes the snapshot as captured — an always-present
    // `{}` would change the authored hash of every project ever written and
    // manufacture a spurious revision on the next prepare.
    const realProjectDirs: string[] = [];
    for (const hostEntry of await readdir("data", { withFileTypes: true })) {
      if (!hostEntry.isDirectory()) continue;
      const projectsDir = path.join("data", hostEntry.name, "release-projects");
      if (!existsSync(projectsDir)) continue;
      for (const entry of await readdir(projectsDir, { withFileTypes: true })) {
        if (entry.isDirectory()) realProjectDirs.push(path.join(projectsDir, entry.name));
      }
    }
    const loadRows: string[] = [];
    const fieldRows: string[] = [];
    for (const dir of realProjectDirs) {
      const raw = JSON.parse(
        await readFile(path.join(dir, "release-project.json"), "utf8"),
      ) as { projectRevision?: number; authored?: unknown };
      const loadedReal = await loadReleaseProject(dir);
      // A revision-1 document has NO `authored` block at all — it is replayed
      // from the applied packs (instance.ts), so there is no raw hash to
      // compare against and the row records that rather than inventing one.
      const identical =
        raw.authored === undefined
          ? "replayed"
          : hashAuthoredState(loadedReal.project.authored) ===
              hashAuthoredState(AuthoredStateSchema.parse(raw.authored))
            ? "ok"
            : "DRIFT";
      loadRows.push(`${path.basename(dir)}:rev${raw.projectRevision ?? 1}:${identical}`);
      // The population for the "absent-when-empty" half is defined by the FILE,
      // not by a directory allow-list: a document whose own `authored` block
      // lacks the two new fields must still lack them after a load. A project
      // that HAS authored assets on disk (this suite's own fixture, and the
      // wr28-* projects a real authored edit has since touched) is simply not
      // in that population — its lossless load is what 28.P2.1 above asserts.
      // Defining it this way is what keeps the check true forever instead of
      // true until the next project gets authored into.
      const rawAuthored = (raw.authored ?? {}) as { assets?: unknown; brand?: unknown };
      if (raw.authored !== undefined && rawAuthored.assets === undefined && rawAuthored.brand === undefined) {
        fieldRows.push(
          `${path.basename(dir)}:${
            loadedReal.project.authored.assets === undefined &&
            loadedReal.project.authored.brand === undefined
              ? "ok"
              : "PRESENT"
          }`,
        );
      }
    }
    check(
      "28.P2.1 every release project on disk still LOADS, and loading injects nothing into its authored state",
      realProjectDirs.length > 0 && loadRows.every((row) => !row.endsWith(":DRIFT")),
      `${realProjectDirs.length} project(s): ${loadRows.join(" ")}`,
    );
    check(
      "28.P2.1b a document whose authored block LACKS the new fields still lacks them after a load (absent-when-empty)",
      fieldRows.length > 0 && fieldRows.every((row) => row.endsWith(":ok")),
      `${fieldRows.length} such project(s) on disk: ${fieldRows.join(" ")}`,
    );
    check(
      "28.P2.2 emptyAuthoredState() emits neither field — an empty authored state hashes as it always did",
      emptyAuthoredState().assets === undefined &&
        emptyAuthoredState().brand === undefined &&
        Object.keys(emptyAuthoredState()).sort().join(",") === "slotValues,theme,updatedAt",
      Object.keys(emptyAuthoredState()).sort().join(","),
    );

    // ---- the brand DECISION schema is the enforcement, not the write API --
    const brandDecisionCases: Array<[string, unknown, boolean]> = [
      ["REPLACE with text", { decision: "REPLACE", replacement: { text: "NewCo" }, updatedAt: "t" }, true],
      ["REPLACE with assetId", { decision: "REPLACE", replacement: { assetId: "organization-logo" }, updatedAt: "t" }, true],
      ["REPLACE with nothing to ship", { decision: "REPLACE", updatedAt: "t" }, false],
      ["REPLACE with an empty payload", { decision: "REPLACE", replacement: {}, updatedAt: "t" }, false],
      ["REMOVE", { decision: "REMOVE", updatedAt: "t" }, true],
      ["REMOVE carrying a payload", { decision: "REMOVE", replacement: { text: "x" }, updatedAt: "t" }, false],
      ["PRESERVE with a reason", { decision: "PRESERVE", reason: "third-party partner mark", updatedAt: "t" }, true],
      ["PRESERVE with no reason", { decision: "PRESERVE", updatedAt: "t" }, false],
      ["PRESERVE payload", { decision: "PRESERVE", reason: "r", replacement: { text: "x" }, updatedAt: "t" }, false],
      ["an invented decision", { decision: "IGNORE", updatedAt: "t" }, false],
      ["detection evidence smuggled in", { decision: "REMOVE", route: "/", nodeId: "n000017", updatedAt: "t" }, false],
    ];
    const brandDecisionResults = brandDecisionCases.map(
      ([name, value, expected]) =>
        `${name}=${AuthoredBrandDecisionSchema.safeParse(value).success === expected ? "ok" : "WRONG"}`,
    );
    check(
      "28.P2.3 the decision schema enforces REPLACE-needs-a-payload, PRESERVE-needs-a-reason, and stores no detection evidence",
      brandDecisionResults.every((row) => row.endsWith("=ok")),
      brandDecisionResults.join(" "),
    );

    // ---- the surface id is derived from ADDRESS, never from CONTENT -------
    const asFinding = (over: Partial<BrandFinding>): BrandFinding => ({
      surface: "svg-aria-label",
      origin: "template-default",
      route: "/",
      value: '<svg aria-label="Linear Logo">',
      matched: "Linear",
      sourceUrl: null,
      slotKey: null,
      nodeId: "n000017",
      evidenceFile: "data/linear.app/recon-templates/RUN-A/app/reconstruction-data/pages/p000001.json",
      evidencePointer: "desktop.doc[n000017].v",
      suggestedResolution: "",
      ...over,
    });
    const idBase = brandSurfaceId(asFinding({}));
    check(
      "28.P2.4 brandSurfaceId is stable across a re-scan: value, matched, sourceUrl and evidenceFile do not move it",
      brandSurfaceId(
        asFinding({
          value: '<svg aria-label="Acme Logo">',
          matched: "Acme",
          sourceUrl: "https://linear.app/x",
          evidenceFile: "data/linear.app/recon-templates/RUN-B/app/reconstruction-data/pages/p000001.json",
          suggestedResolution: "different text entirely",
        }),
      ) === idBase && idBase.startsWith("bs-svg-aria-label-"),
      idBase,
    );
    const idVariants = new Set([
      idBase,
      brandSurfaceId(asFinding({ route: "/pricing" })),
      brandSurfaceId(asFinding({ nodeId: "n000018" })),
      brandSurfaceId(asFinding({ evidencePointer: "mobile.doc[n000017].v" })),
      brandSurfaceId(asFinding({ evidencePointer: "desktop.doc[n000017].p" })),
      brandSurfaceId(asFinding({ surface: "image-alt" })),
      brandSurfaceId(asFinding({ nodeId: null, slotKey: "hero.title", evidencePointer: "warnings[hero.title]" })),
    ]);
    check(
      "28.P2.5 a different route, node, viewport, prop, surface or slot binding is a DIFFERENT id",
      idVariants.size === 7,
      `${idVariants.size}/7 distinct`,
    );

    // ---- the pure write API: idempotent, and it says so -------------------
    const wapiFileA = path.join(scratch, "task28-2-logo-a.png");
    const wapiFileB = path.join(scratch, "task28-2-logo-b.png");
    await writeFile(wapiFileA, Buffer.concat([PNG_1PX, Buffer.from([28, 2, 1])]));
    await writeFile(wapiFileB, Buffer.concat([PNG_1PX, Buffer.from([28, 2, 2])]));
    const wapi0 = emptyAuthoredState();
    const wapi1 = setAuthoredAsset(wapi0, "organization-logo", { file: wapiFileA }, "2026-08-27T00:00:00.000Z");
    const wapi1Again = setAuthoredAsset(wapi1.authored, "organization-logo", { file: wapiFileA }, "2026-08-27T09:00:00.000Z");
    check(
      "28.P2.6 setAuthoredAsset reports changed once, then reports NO change and moves no timestamp",
      wapi1.changed &&
        wapi1.authored.assets?.["organization-logo"].file === wapiFileA &&
        wapi1Again.changed === false &&
        wapi1Again.authored === wapi1.authored &&
        wapi1Again.authored.updatedAt === "2026-08-27T00:00:00.000Z",
      `changed=${wapi1.changed}/${wapi1Again.changed} updatedAt=${wapi1Again.authored.updatedAt}`,
    );
    const wapiAlt = setAuthoredAsset(
      wapi1.authored,
      "organization-logo",
      { file: wapiFileA, alt: "NewCo logo" },
      "2026-08-27T10:00:00.000Z",
    );
    const wapiSwap = setAuthoredAsset(wapi1.authored, "organization-logo", { file: wapiFileB }, "2026-08-27T11:00:00.000Z");
    check(
      "28.P2.7 a new alt, or a different file, IS a change",
      wapiAlt.changed &&
        wapiAlt.authored.assets?.["organization-logo"].alt === "NewCo logo" &&
        wapiSwap.changed &&
        wapiSwap.authored.assets?.["organization-logo"].file === wapiFileB,
      `alt=${wapiAlt.changed} file=${wapiSwap.changed}`,
    );
    const wapiRemoved = removeAuthoredAsset(wapi1.authored, "organization-logo", "2026-08-27T12:00:00.000Z");
    check(
      "28.P2.8 removing the last authored asset deletes the FIELD, so the state round-trips to its prior hash",
      wapiRemoved.changed &&
        wapiRemoved.authored.assets === undefined &&
        hashAuthoredState({ ...wapiRemoved.authored, updatedAt: wapi0.updatedAt }) === hashAuthoredState(wapi0) &&
        removeAuthoredAsset(wapiRemoved.authored, "organization-logo", "t").changed === false,
      `assets=${JSON.stringify(wapiRemoved.authored.assets ?? null)}`,
    );
    const brandSet = setAuthoredBrandDecision(
      wapi0,
      idBase,
      { decision: "PRESERVE", reason: "partner mark, licensed" },
      "2026-08-27T00:00:00.000Z",
    );
    const brandSame = setAuthoredBrandDecision(
      brandSet.authored,
      idBase,
      { decision: "PRESERVE", reason: "partner mark, licensed" },
      "2026-08-27T09:00:00.000Z",
    );
    const brandMoved = setAuthoredBrandDecision(
      brandSet.authored,
      idBase,
      { decision: "REPLACE", replacement: { text: "NewCo" } },
      "2026-08-27T09:00:00.000Z",
    );
    let brandRefused = "";
    try {
      setAuthoredBrandDecision(wapi0, idBase, { decision: "REPLACE" }, "t");
    } catch (err) {
      brandRefused = (err as Error).message;
    }
    check(
      "28.P2.9 setAuthoredBrandDecision is idempotent, detects a changed decision, and cannot store an empty REPLACE",
      brandSet.changed &&
        brandSame.changed === false &&
        brandMoved.changed &&
        brandMoved.authored.brand?.[idBase].decision === "REPLACE" &&
        brandRefused.includes("replacement payload"),
      `${brandSet.changed}/${brandSame.changed}/${brandMoved.changed} refused=${brandRefused.slice(0, 60)}`,
    );

    // ---- the impact table, and its closure over the graph -----------------
    check(
      "28.P2.10 an authored asset edit predicts assets+production; a brand decision predicts production only",
      JSON.stringify(authoredInvalidatedStages(wapi0, wapi1.authored)) === JSON.stringify(["assets", "production"]) &&
        JSON.stringify(authoredInvalidatedStages(wapi0, brandSet.authored)) === JSON.stringify(["production"]) &&
        JSON.stringify(authoredInvalidatedStages(wapi0, wapi0)) === JSON.stringify([]) &&
        JSON.stringify(AUTHORED_ASSET_IMPACTS) === JSON.stringify(["assets", "production"]) &&
        JSON.stringify(AUTHORED_BRAND_IMPACTS) === JSON.stringify(["production"]),
      `${JSON.stringify(authoredInvalidatedStages(wapi0, wapi1.authored))} / ${JSON.stringify(authoredInvalidatedStages(wapi0, brandSet.authored))}`,
    );
    check(
      "28.P2.11 authored.assets FEEDS the resolution path: the pack is applied first, the authored value last",
      JSON.stringify(mergedAssetResolutions({ a: { file: "pack-a.png" }, b: "pack-b.png" }, wapi0)) ===
        JSON.stringify({ a: { file: "pack-a.png" }, b: "pack-b.png" }) &&
        JSON.stringify(
          mergedAssetResolutions({ "organization-logo": { file: "pack.png" } }, wapi1.authored),
        ) === JSON.stringify({ "organization-logo": { file: wapiFileA } }),
      JSON.stringify(mergedAssetResolutions({ "organization-logo": { file: "pack.png" } }, wapi1.authored)),
    );

    // ---- the REAL engine: a project, an edit, a build, a run.json ---------
    // Every freshness verdict below is READ BACK from runs/<id>/run.json. The
    // impact table (28.2.10) is a prediction; this is the measurement.
    const sub = await prepareReleaseProject({
      registryDataRoot: registryRoot,
      productionSpecRef: compile0.specDir,
      siteId: "task28-authored-substrate",
      log: () => {},
    });
    const subProjectFile = path.join(sub.projectDir, "release-project.json");
    const subChainAfterPrepare = (await loadRevisionChain(sub.projectDir)).length;
    const subBytesBefore = await readFile(subProjectFile, "utf8");
    const subMtimeBefore = (await stat(subProjectFile)).mtimeMs;
    const subNoop = await commitAuthoredEdits(sub.projectDir, [
      { op: "remove-asset", assetId: "organization-logo" },
      { op: "remove-brand-decision", surfaceId: idBase },
    ]);
    check(
      "28.P2.12 a NO-OP edit writes NOTHING: no revision, no project rewrite, no mtime move",
      subNoop.changed === false &&
        subNoop.revision === null &&
        (await loadRevisionChain(sub.projectDir)).length === subChainAfterPrepare &&
        (await readFile(subProjectFile, "utf8")) === subBytesBefore &&
        (await stat(subProjectFile)).mtimeMs === subMtimeBefore,
      `changed=${subNoop.changed} chain=${(await loadRevisionChain(sub.projectDir)).length}/${subChainAfterPrepare}`,
    );

    const subAssetFile = path.join(scratch, "task28-2-hero.png");
    await writeFile(subAssetFile, Buffer.concat([PNG_1PX, Buffer.from([28, 2, 42])]));
    const subAssetSha = createHash("sha256").update(await readFile(subAssetFile)).digest("hex");
    const subAuthoredBefore = (await loadReleaseProject(sub.projectDir)).project.authored;
    const subAssetEdit = await commitAuthoredEdits(sub.projectDir, [
      { op: "set-asset", assetId: heroInventoryId!, file: subAssetFile, alt: "NewCo hero", note: "task28 §2" },
    ]);
    const subAfterAssetEdit = (await loadReleaseProject(sub.projectDir)).project;
    check(
      "28.P2.13 an authored.assets edit appends exactly one revision naming the assetId, and lands on the project document",
      subAssetEdit.changed &&
        subAssetEdit.revision?.revisionId === "r001" &&
        subAssetEdit.revision.change.assetIdsAdded?.includes(heroInventoryId!) === true &&
        (subAssetEdit.revision.change.slotKeysAdded.length === 0) &&
        subAssetEdit.revision.summary.includes("asset") &&
        subAfterAssetEdit.authored.assets?.[heroInventoryId!].file === subAssetFile &&
        subAfterAssetEdit.authored.assets[heroInventoryId!].alt === "NewCo hero" &&
        (await loadRevisionChain(sub.projectDir)).length === subChainAfterPrepare + 1,
      `${subAssetEdit.revision?.revisionId} ${subAssetEdit.revision?.summary} ` +
        JSON.stringify(subAssetEdit.revision?.change.assetIdsAdded),
    );
    check(
      "28.P2.14 the prediction for THIS edit is assets+production",
      JSON.stringify(authoredInvalidatedStages(subAuthoredBefore, subAfterAssetEdit.authored)) ===
        JSON.stringify(["assets", "production"]),
      JSON.stringify(authoredInvalidatedStages(subAuthoredBefore, subAfterAssetEdit.authored)),
    );
    const subReqBefore = (await loadRequirementsFile(sub.projectDir)).requirements.find(
      (requirement) => requirement.requirementId === `replacement-image-${heroInventoryId}`,
    );
    const subDry1 = await buildRelease(sub.projectDir, { dryRun: true, log: () => {} });
    check(
      "28.P2.15 the plan agrees — WITHOUT any resolution pack ever being applied to this project",
      JSON.stringify(subDry1.plan.wouldRun) === JSON.stringify(["assets", "production"]) &&
        ["content", "theme", "seo"].every((stage) => subDry1.plan.wouldReuse.includes(stage as never)) &&
        subAfterAssetEdit.resolutions.length === 0,
      `run=${JSON.stringify(subDry1.plan.wouldRun)} packs=${subAfterAssetEdit.resolutions.length}`,
    );
    const subBuild1 = await buildRelease(sub.projectDir, { log: () => {} });
    const subRun1 = await readRun(sub.projectDir, subBuild1.run!.runId);
    check(
      "28.P2.16 REAL BUILD: run.json rerunStages is exactly [assets, production]; content/theme/seo are REUSED",
      subBuild1.failed === false &&
        JSON.stringify(subRun1.rerunStages) === JSON.stringify(["assets", "production"]) &&
        ["reconstruction", "template", "content", "theme", "seo"].every((stage) =>
          (subRun1.reusedStages as string[]).includes(stage),
        ),
      `rerun=${JSON.stringify(subRun1.rerunStages)} reused=${JSON.stringify(subRun1.reusedStages)}` +
        (subBuild1.project.failure ? ` FAILURE: ${subBuild1.project.failure.message}` : ""),
    );
    const subAssetsDir = subBuild1.project.stageStatus.assets.artifact!.path;
    const subRewrite = JSON.parse(
      await readFile(path.join(subAssetsDir, "rewrite-map.json"), "utf8"),
    ) as { entries: Array<{ sourceUrl: string; localPath: string }> };
    const subReplacement = JSON.parse(
      await readFile(path.join(subAssetsDir, "replacement-manifest.json"), "utf8"),
    ) as { entries: Array<{ inventoryId: string; replacement: { status: string; providedFile: string | null } }> };
    check(
      "28.P2.17 authored.assets FED the resolution-pack path: the bytes are materialized and the source url points at them",
      existsSync(path.join(subAssetsDir, "media", `${subAssetSha}.png`)) &&
        subRewrite.entries.find((entry) => entry.sourceUrl === heroUrl)?.localPath ===
          `/media/${subAssetSha}.png` &&
        subReplacement.entries.find((entry) => entry.inventoryId === heroInventoryId)?.replacement
          .status === "provided",
      `/media/${subAssetSha}.png`,
    );
    // The requirement must clear THROUGH THE ARTIFACT, never because a field
    // was "requested". No resolution pack has ever been applied to this
    // project, so `matchResolutionToRequirements` cannot have flipped it: the
    // derived replacement-manifest entry is `provided`, collect.ts therefore
    // stops emitting the gap, and the carry-forward records it not-applicable.
    const subReqAfter = await loadRequirementsFile(sub.projectDir);
    const subHeroReq = subReqAfter.requirements.find(
      (requirement) => requirement.requirementId === `replacement-image-${heroInventoryId}`,
    );
    check(
      "28.P2.27 the replacement-image requirement clears through the REBUILT artifact, with zero resolution packs applied",
      subReqBefore?.status === "unresolved" &&
        (await loadReleaseProject(sub.projectDir)).project.resolutions.length === 0 &&
        (subHeroReq === undefined || subHeroReq.status === "not-applicable") &&
        subHeroReq?.resolvedBy === undefined,
      `before=${subReqBefore?.status} after=${subHeroReq === undefined ? "not-collected" : subHeroReq.status}`,
    );
    const subBuild2 = await buildRelease(sub.projectDir, { log: () => {} });
    const subRun2 = await readRun(sub.projectDir, subBuild2.run!.runId);
    check(
      "28.P2.18 an unchanged rebuild reruns NOTHING — the authored asset hash is stable across a reload",
      JSON.stringify(subRun2.rerunStages) === JSON.stringify([]) &&
        (subRun2.reusedStages as string[]).includes("assets") &&
        subBuild2.project.stageStatus.assets.artifact!.id ===
          subBuild1.project.stageStatus.assets.artifact!.id,
      `rerun=${JSON.stringify(subRun2.rerunStages)}`,
    );

    // ---- a brand decision stales the production bake, and nothing else ----
    const subBrandEdit = await commitAuthoredEdits(sub.projectDir, [
      {
        op: "set-brand-decision",
        surfaceId: idBase,
        decision: "REPLACE",
        replacement: { text: "NewCo" },
        note: "task28 §2",
      },
    ]);
    check(
      "28.P2.19 an authored.brand edit appends a revision naming the SURFACE ID (no detection evidence stored)",
      subBrandEdit.changed &&
        subBrandEdit.revision?.change.brandSurfacesAdded?.includes(idBase) === true &&
        subBrandEdit.revision.summary.includes("brand") &&
        Object.keys(subBrandEdit.authored.brand![idBase]).sort().join(",") ===
          "decision,note,replacement,updatedAt",
      `${subBrandEdit.revision?.summary} keys=${Object.keys(subBrandEdit.authored.brand?.[idBase] ?? {}).sort().join(",")}`,
    );
    const subDry2 = await buildRelease(sub.projectDir, { dryRun: true, log: () => {} });
    check(
      "28.P2.20 the plan for a brand decision is production ONLY — assets included in the reused set",
      JSON.stringify(subDry2.plan.wouldRun) === JSON.stringify(["production"]) &&
        subDry2.plan.wouldReuse.includes("assets" as never),
      `run=${JSON.stringify(subDry2.plan.wouldRun)} reuse=${JSON.stringify(subDry2.plan.wouldReuse)}`,
    );
    const subBuild3 = await buildRelease(sub.projectDir, { log: () => {} });
    const subRun3 = await readRun(sub.projectDir, subBuild3.run!.runId);
    check(
      "28.P2.21 REAL BUILD: a brand decision reruns production ONLY; assets/content/theme/seo are reused",
      subBuild3.failed === false &&
        JSON.stringify(subRun3.rerunStages) === JSON.stringify(["production"]) &&
        ["content", "theme", "seo", "assets"].every((stage) =>
          (subRun3.reusedStages as string[]).includes(stage),
        ) &&
        subBuild3.project.stageStatus.assets.artifact!.id ===
          subBuild1.project.stageStatus.assets.artifact!.id,
      `rerun=${JSON.stringify(subRun3.rerunStages)} reused=${JSON.stringify(subRun3.reusedStages)}` +
        (subBuild3.project.failure ? ` FAILURE: ${subBuild3.project.failure.message}` : ""),
    );
    const subBuild4 = await buildRelease(sub.projectDir, { log: () => {} });
    check(
      "28.P2.22 and the brand slice is stable too — the next unchanged rebuild reruns nothing",
      JSON.stringify((await readRun(sub.projectDir, subBuild4.run!.runId)).rerunStages) ===
        JSON.stringify([]),
      JSON.stringify((await readRun(sub.projectDir, subBuild4.run!.runId)).rerunStages),
    );

    // ---- honesty: `alt` is RECORDED and has no consumer, so it stales nothing
    const subAltEdit = await commitAuthoredEdits(sub.projectDir, [
      { op: "set-asset", assetId: heroInventoryId!, file: subAssetFile, alt: "A different caption" },
    ]);
    const subDry3 = await buildRelease(sub.projectDir, { dryRun: true, log: () => {} });
    check(
      "28.P2.23 an alt-only edit IS recorded in the history but stales NO stage — the materialization writes bytes, not markup",
      subAltEdit.changed &&
        subAltEdit.revision?.change.assetIdsChanged?.includes(heroInventoryId!) === true &&
        JSON.stringify(subDry3.plan.wouldRun) === JSON.stringify([]),
      `changed=${subAltEdit.changed} wouldRun=${JSON.stringify(subDry3.plan.wouldRun)}`,
    );

    // ---- the resolution-pack path still works, and now FEEDS authored ------
    const subLogoFile = path.join(scratch, "task28-2-org-logo.png");
    await writeFile(subLogoFile, Buffer.concat([PNG_1PX, Buffer.from([28, 2, 77])]));
    const subPackFile = path.join(scratch, "task28-2-pack.json");
    await writeFile(
      subPackFile,
      JSON.stringify(
        {
          schemaVersion: 1,
          schemaName: "production-resolution-v1",
          assets: { "organization-logo": { file: subLogoFile, note: "site-level logo" } },
        },
        null,
        2,
      ),
      "utf8",
    );
    const subResolved = await resolveRelease(sub.projectDir, { resolutionFile: subPackFile, log: () => {} });
    const subAfterResolve = (await loadReleaseProject(sub.projectDir)).project;
    const subFoldedAt = subAfterResolve.authored.assets?.["organization-logo"].updatedAt;
    check(
      "28.P2.24 a pack's assets FOLD into authored.assets, and the pack is still recorded verbatim as the audit record",
      subAfterResolve.authored.assets?.["organization-logo"].file === subLogoFile &&
        subAfterResolve.authored.assets["organization-logo"].note === "site-level logo" &&
        // the earlier authored-only entry survives the fold untouched
        subAfterResolve.authored.assets[heroInventoryId!].file === subAssetFile &&
        subAfterResolve.resolutions.some(
          (applied) =>
            applied.resolutionId === subResolved.resolutionId &&
            Object.keys(applied.resolution.assets ?? {}).join(",") === "organization-logo",
        ),
      JSON.stringify(Object.keys(subAfterResolve.authored.assets ?? {})),
    );
    const subChainBeforeReResolve = (await loadRevisionChain(sub.projectDir)).length;
    const subResolvedAgain = await resolveRelease(sub.projectDir, { resolutionFile: subPackFile, log: () => {} });
    const subAfterResolve2 = (await loadReleaseProject(sub.projectDir)).project;
    check(
      "28.P2.25 re-applying the SAME pack is an idempotent fold: no entry timestamp moves, so no revision is manufactured",
      subAfterResolve2.authored.assets?.["organization-logo"].updatedAt === subFoldedAt &&
        (await loadRevisionChain(sub.projectDir)).length === subChainBeforeReResolve &&
        subResolvedAgain.resolutionId !== subResolved.resolutionId &&
        subAfterResolve2.resolutions.length === subAfterResolve.resolutions.length + 1,
      `${subFoldedAt} → ${subAfterResolve2.authored.assets?.["organization-logo"].updatedAt}`,
    );
    // A re-prepare must carry both new fields exactly, like slotValues and theme.
    const subReprepared = await prepareReleaseProject({
      registryDataRoot: registryRoot,
      productionSpecRef: compile0.specDir,
      siteId: "task28-authored-substrate",
      log: () => {},
    });
    check(
      "28.P2.26 a re-prepare carries authored.assets and authored.brand non-destructively, and says what it preserved",
      hashAuthoredState(subReprepared.project.authored) ===
        hashAuthoredState(subAfterResolve2.authored) &&
        subReprepared.preserved.some((row) => row.startsWith("authored.assets:2")) &&
        subReprepared.preserved.some((row) => row.startsWith("authored.brand:1")),
      subReprepared.preserved.filter((row) => row.startsWith("authored.")).join(" "),
    );
    await rm(sub.projectDir, { recursive: true, force: true });

    // =======================================================================
    section("Task 28 Phases 5 + 6 — REGION OFF / ROUTE OFF through the REAL engine");
    // =======================================================================
    //
    // Everything above this line proves the analysis. This proves the ENGINE:
    // a region compile for the fixture template, an authored disable, a real
    // release build, and the artifacts that build produced — the route table,
    // the SEO plan, the sitemap, the static export, the slot accounting and
    // the requirement set. No number below is read from a prediction.

    const enRegionDir = path.join(HOST_DATA_DIR, "page-regions", "2026-08-28T00-00-00-000Z");
    const enRegionInput = await loadRegionInput(templateDir);
    const enRegionArtifact = compilePageRegions(enRegionInput);
    await writeRegionRun(enRegionDir, newRegionRunId(), enRegionArtifact, templateDir);
    check(
      "28.P5.65 the fixture template region-compiles (both routes, both pages, no orphan binding)",
      enRegionArtifact.counts.routes === 2 &&
        enRegionArtifact.counts.pages === 2 &&
        enRegionArtifact.counts.orphanBindings === 0 &&
        enRegionArtifact.regions.length > 0,
      `routes=${enRegionArtifact.counts.routes} pages=${enRegionArtifact.counts.pages} regions=${enRegionArtifact.regions.length}`,
    );

    const en = await prepareReleaseProject({
      registryDataRoot: registryRoot,
      productionSpecRef: compile0.specDir,
      siteId: "task28-enablement",
      pageRegionsDir: enRegionDir,
      log: () => {},
    });
    check(
      "28.P5.66 release:prepare records the page-regions run as a first-class project auxiliary",
      en.project.auxiliary.pageRegionsDir === enRegionDir,
      String(en.project.auxiliary.pageRegionsDir),
    );
    const enInputs = await loadEnablementInputs({
      templateRunDir: templateDir,
      pageRegionsRef: enRegionDir,
    });
    for (const region of enRegionArtifact.regions) {
      console.log(
        `  [measured] fixture region ${region.regionId} scope=${region.scope} ` +
          `pages=${region.pages.map((page) => page.pageSourceId).join("+")} ` +
          `slots=${region.slotKeys.length} [${region.slotKeys.join(" ")}]`,
      );
    }
    // The section to delete: the SMALLEST page-scoped region on the HOME page
    // that carries content and that every safety rule clears.
    //
    // Smallest, not largest, and the reason is a real one worth recording: the
    // fixture's whole home page is a hero plus a tagline, and the hero region
    // owns every element carrying a themed style token. Disabling it makes
    // production QA's `theme-computed-paint` fail honestly ("no probe class
    // found in DOM") and the build is then not adopted — a property of a
    // 2-route fixture, not of the feature. The large-region physical removal
    // (670 nodes, 73 slot keys) is proven against the real linear.app template
    // in scripts/smoke-enablement.ts §9 and §11 instead.
    const enCandidate = enRegionArtifact.regions
      .filter((region) => region.pages.every((page) => page.pageSourceId === "p000001"))
      .filter((region) => region.slotKeys.length > 0)
      .sort((a, b) => a.slotKeys.length - b.slotKeys.length || (a.regionId < b.regionId ? -1 : 1))
      .find((region) => evaluateRegionDisable({ regionId: region.regionId, scope: "global" }, enInputs).allowed);
    check(
      "28.P5.67 at least one home-page region with content passes every safety rule",
      enCandidate !== undefined,
      enRegionArtifact.regions.map((region) => `${region.regionId}:${region.slotKeys.length}`).join(" "),
    );
    const enRegionId = enCandidate!.regionId;
    const enRegionSlotKeys = [...enCandidate!.slotKeys];

    // ---- a STALE region id must never silently disable anything -----------
    const enStale = await commitAuthoredEdits(en.projectDir, [
      { op: "disable-region", regionId: "p000001:rgn:main1:self@nope", scope: "global" },
    ]);
    const enStaleResolved = await resolveEnablementForProject(
      (await loadReleaseProject(en.projectDir)).project,
      templateDir,
    );
    check(
      "28.P5.68 a recorded region id this template does not have is REFUSED at resolve time, and disables NOTHING",
      enStale.changed &&
        enStaleResolved.refusals.length === 1 &&
        enStaleResolved.refusals[0].code === "unknown-region" &&
        enStaleResolved.plan.disabledNodes.length === 0,
      JSON.stringify(enStaleResolved.refusals.map((refusal) => refusal.code)),
    );
    await commitAuthoredEdits(en.projectDir, [
      { op: "enable-region", regionId: "p000001:rgn:main1:self@nope" },
    ]);

    // ---- the real edit ----------------------------------------------------
    const enBefore = (await loadReleaseProject(en.projectDir)).project;
    const enChainBefore = (await loadRevisionChain(en.projectDir)).length;
    const enEdit = await commitAuthoredEdits(
      en.projectDir,
      [
        { op: "disable-route", route: "/pricing", reason: "the operator does not need a pricing page" },
        { op: "disable-region", regionId: enRegionId, scope: "global", reason: "section not needed" },
      ],
      { summary: "task 28 phases 5+6" },
    );
    const enAfterEdit = (await loadReleaseProject(en.projectDir)).project;
    check(
      "28.P5.69 ONE batch of a route disable + a region disable appends exactly ONE revision naming both",
      enEdit.changed &&
        (await loadRevisionChain(en.projectDir)).length === enChainBefore + 1 &&
        enEdit.revision?.change.routesDisabled?.includes("/pricing") === true &&
        enEdit.revision.change.regionsDisabled?.includes(enRegionId) === true &&
        hashAuthoredState(enAfterEdit.authored) === enEdit.revision.authoredStateHash,
      `${enEdit.revision?.revisionId} ${enEdit.revision?.summary}`,
    );
    check(
      "28.P6.20 the impact PREDICTION for this edit is everything but the frozen roots",
      JSON.stringify(authoredInvalidatedStages(enBefore.authored, enAfterEdit.authored)) ===
        JSON.stringify(["content", "theme", "seo", "assets", "production"]) &&
        JSON.stringify(AUTHORED_DISABLED_ROUTE_IMPACTS) ===
          JSON.stringify(["content", "seo", "assets", "production"]) &&
        JSON.stringify(AUTHORED_DISABLED_REGION_IMPACTS) ===
          JSON.stringify(["content", "assets", "production"]),
      JSON.stringify(authoredInvalidatedStages(enBefore.authored, enAfterEdit.authored)),
    );
    const enResolvedEdit = await resolveEnablementForProject(enAfterEdit, templateDir);
    for (const finding of enResolvedEdit.route?.deadLinks ?? []) {
      console.log(`  [measured] dead link ${JSON.stringify(finding)}`);
    }
    for (const item of enResolvedEdit.route?.navCascade ?? []) {
      console.log(
        `  [measured] nav cascade ${item.slotKey} group=${item.groupId} nodes=${item.nodes.length} ` +
          `removes=[${item.removedSlotKeys.join(" ")}]`,
      );
    }
    const enDry = await buildRelease(en.projectDir, { dryRun: true, log: () => {} });
    check(
      "28.P6.21 release:plan AGREES with the prediction — no drift between the surface and the hash",
      JSON.stringify(enDry.plan.wouldRun) ===
        JSON.stringify(["content", "theme", "seo", "assets", "production"]),
      JSON.stringify(enDry.plan.wouldRun),
    );

    const enBuild = await buildRelease(en.projectDir, { log: () => {} });
    const enRun = await readRun(en.projectDir, enBuild.run!.runId);
    if (enBuild.failed) {
      // Diagnostic, not a check: name the production QA checks that failed so a
      // regression here is actionable from the log instead of from a run
      // directory the suite deletes in its finally block.
      const failedRunId = /build (\S+) not adopted/.exec(enBuild.project.failure?.message ?? "")?.[1];
      if (failedRunId !== undefined) {
        const failedQaFile = path.join(productionBuildDir(HOST, failedRunId), "report", "qa.json");
        if (existsSync(failedQaFile)) {
          const failedQa = JSON.parse(await readFile(failedQaFile, "utf8")) as {
            checks: Array<{ id: string; ok: boolean; detail: string }>;
          };
          for (const failure of failedQa.checks.filter((entry) => !entry.ok)) {
            console.log(`  [diagnostic] production QA FAIL ${failure.id} — ${failure.detail}`);
          }
        }
      }
    }
    check(
      "28.P6.22 REAL BUILD: run.json rerunStages is MEASURED as content..production, reconstruction/template reused",
      enBuild.failed === false &&
        JSON.stringify(enRun.rerunStages) ===
          JSON.stringify(["content", "theme", "seo", "assets", "production"]) &&
        (enRun.reusedStages as string[]).includes("template") &&
        (enRun.reusedStages as string[]).includes("reconstruction"),
      `rerun=${JSON.stringify(enRun.rerunStages)} reused=${JSON.stringify(enRun.reusedStages)}` +
        (enBuild.project.failure ? ` FAILURE: ${enBuild.project.failure.message}` : ""),
    );

    const enProject = enBuild.project;
    const enSeoDir = enProject.stageStatus.seo.artifact!.path;
    const enSeoPlan = JSON.parse(
      await readFile(path.join(enSeoDir, "production-seo-plan.json"), "utf8"),
    ) as { routes: Array<{ route: string; canonical: { value: string | null }; openGraph: unknown }> };
    check(
      "28.P6.23 the disabled route is GONE from the SEO plan — no title, no description, no canonical, no og block",
      enSeoPlan.routes.length === 1 &&
        enSeoPlan.routes[0].route === "/" &&
        !enSeoPlan.routes.some((route) => route.route === "/pricing"),
      enSeoPlan.routes.map((route) => route.route).join(","),
    );
    const enSitemap = await readFile(path.join(enSeoDir, "sitemap.preview.xml"), "utf8");
    check(
      "28.P6.24 the sitemap urlset carries exactly one <url> and it is not the disabled route",
      (enSitemap.match(/<url>/g) ?? []).length === 1 && !enSitemap.includes("/pricing"),
      `${(enSitemap.match(/<url>/g) ?? []).length} urls, pricing=${enSitemap.includes("/pricing")}`,
    );
    const enHead = JSON.parse(await readFile(path.join(enSeoDir, "rendered-head.json"), "utf8")) as {
      routes: Array<{ route: string }>;
    };
    check(
      "28.P6.25 the rendered head blocks follow the plan — one route, not two",
      enHead.routes.length === 1 && enHead.routes[0].route === "/",
      enHead.routes.map((route) => route.route).join(","),
    );

    const enBuildDir = productionBuildDir(HOST, enProject.stageStatus.production.artifact!.id);
    const enSiteDir = path.join(enBuildDir, "package", "site");
    const enEnablementReport = JSON.parse(
      await readFile(path.join(enBuildDir, "report", "enablement.json"), "utf8"),
    ) as { applied: { routesRemoved: string[]; regionNodesRemoved: number; navNodesRemoved: number; pageFilesRemoved: string[] } };
    check(
      "28.P6.26 the build records what it physically removed",
      enEnablementReport.applied.routesRemoved.join(",") === "/pricing" &&
        enEnablementReport.applied.regionNodesRemoved === 2 &&
        enEnablementReport.applied.navNodesRemoved > 0 &&
        enEnablementReport.applied.pageFilesRemoved.length === 1,
      JSON.stringify(enEnablementReport.applied),
    );
    check(
      "28.P6.27 the disabled route is NOT EXPORTED: no pricing.html in the shipped package",
      existsSync(path.join(enSiteDir, "index.html")) && !existsSync(path.join(enSiteDir, "pricing.html")),
      (await readdir(enSiteDir)).filter((entry) => entry.endsWith(".html")).join(","),
    );
    const enIndexHtml = await readFile(path.join(enSiteDir, "index.html"), "utf8");
    check(
      "28.P5.70 REGION OFF IN PRODUCTION: the region root is absent from the exported HTML",
      !enIndexHtml.includes(`data-wr-node="${enCandidate!.pages[0].occurrences[0].nodeId}"`) &&
        enIndexHtml.includes("data-wr-node="),
      enCandidate!.pages[0].occurrences[0].nodeId,
    );
    check(
      "28.P6.28 no link to the disabled route survives in the exported HTML (never redirected to the homepage)",
      !enIndexHtml.includes('href="/pricing"'),
    );
    const enFlight = (await readdir(enSiteDir)).filter((entry) => entry.endsWith(".txt"));
    let enFlightPricing = 0;
    for (const file of enFlight) {
      const body = await readFile(path.join(enSiteDir, file), "utf8");
      enFlightPricing += body.split('href\\":\\"/pricing').length - 1;
      enFlightPricing += body.split('"/pricing"').length - 1;
    }
    if (enFlightPricing > 0) {
      for (const file of enFlight) {
        const body = await readFile(path.join(enSiteDir, file), "utf8");
        let index = body.indexOf("/pricing");
        while (index !== -1) {
          console.log(`  [diagnostic] flight ${file} ...${body.slice(Math.max(0, index - 160), index + 40)}...`);
          index = body.indexOf("/pricing", index + 1);
        }
      }
    }
    let enFlightDynOnly = true;
    for (const file of enFlight) {
      const body = await readFile(path.join(enSiteDir, file), "utf8");
      let index = body.indexOf("/pricing");
      while (index !== -1) {
        // MEASURED, and it disagrees with the naive expectation: the fixture's
        // header disclosure button carries a CAPTURED DYNAMIC TEMPLATE whose
        // copy of the /pricing anchor is a serialized string inside
        // `data-wr-dyn-template`, not a node the cascade can address. It is
        // frozen reconstruction output; the engine refuses to rewrite it and
        // raises a dead-internal-link requirement instead (28.P6.33).
        if (!body.slice(Math.max(0, index - 300), index).includes("data-wr-dyn-node")) {
          enFlightDynOnly = false;
        }
        index = body.indexOf("/pricing", index + 1);
      }
    }
    check(
      "28.P5.71 any residual link to the disabled route in the RSC flight is CONFINED to a captured dynamic template",
      enFlightDynOnly,
      `${enFlight.length} flight files, ${enFlightPricing} /pricing occurrences, all inside a dyn template=${enFlightDynOnly}`,
    );
    const enDeploy = JSON.parse(
      await readFile(path.join(enBuildDir, "package", "deploy-manifest.json"), "utf8"),
    ) as { routes: Array<{ route: string }> };
    check(
      "28.P6.29 the deploy manifest ships one route",
      enDeploy.routes.length === 1 && enDeploy.routes[0].route === "/",
      enDeploy.routes.map((route) => route.route).join(","),
    );
    const enQa = JSON.parse(await readFile(path.join(enBuildDir, "report", "qa.json"), "utf8")) as {
      failed: number;
      passed: number;
      siteLinks: { routesAudited: number; brokenInternalTargets: string[]; anchors: number };
    };
    check(
      "28.P6.30 the served package's OWN link audit finds no rendered anchor pointing at the disabled route",
      enQa.failed === 0 &&
        enQa.siteLinks.routesAudited === 1 &&
        !enQa.siteLinks.brokenInternalTargets.includes("/pricing") &&
        // the fixture's hero CTA points at /signup, which was NEVER a route —
        // a pre-existing dangling link the audit reports honestly and this
        // feature neither creates nor clears
        enQa.siteLinks.brokenInternalTargets.includes("/signup"),
      `qa ${enQa.passed}/${enQa.passed + enQa.failed}, audited ${enQa.siteLinks.routesAudited}, broken ${JSON.stringify(enQa.siteLinks.brokenInternalTargets)}`,
    );

    const enContentDir = enProject.stageStatus.content.artifact!.path;
    const enAccounting = JSON.parse(
      await readFile(path.join(enContentDir, "slot-accounting.json"), "utf8"),
    ) as {
      totals: { inScopeSlots: number; byDisposition: Record<string, number> };
      reconciliation: { reconciled: boolean; missing: string[]; originTotal: number; dispositionTotal: number; inScopeSlots: number };
      entries: Array<{ slotKey: string; disposition: string; origin: string }>;
    };
    check(
      "28.P5.72 REGION SLOT ACCOUNTING: every slot in the disabled region is `disabled-region`, none is unresolved",
      enRegionSlotKeys.length > 0 &&
        enRegionSlotKeys.every((key) =>
          enAccounting.entries.some((entry) => entry.slotKey === key && entry.disposition === "disabled-region"),
        ),
      `${enRegionSlotKeys.length} region slot keys; byDisposition=${JSON.stringify(enAccounting.totals.byDisposition)}`,
    );
    check(
      "28.P6.31 ROUTE SLOT ACCOUNTING: at least one slot is `disabled-route`, and it is still in the denominator",
      (enAccounting.totals.byDisposition["disabled-route"] ?? 0) > 0 &&
        enAccounting.entries.filter((entry) => entry.disposition === "disabled-route").every((entry) =>
          entry.origin === "source-preserved",
        ),
      JSON.stringify(enAccounting.totals.byDisposition),
    );
    check(
      "28.P5.73 the account still RECONCILES: both axis totals equal the in-scope count, nothing missing",
      enAccounting.reconciliation.reconciled &&
        enAccounting.reconciliation.originTotal === enAccounting.reconciliation.inScopeSlots &&
        enAccounting.reconciliation.dispositionTotal === enAccounting.reconciliation.inScopeSlots &&
        enAccounting.reconciliation.missing.length === 0,
      JSON.stringify(enAccounting.reconciliation),
    );
    check(
      "28.P5.74 no disabled slot was folded into `removed` — an emptied value and a deleted section stay distinguishable",
      (enAccounting.totals.byDisposition["disabled-region"] ?? 0) > 0 &&
        enRegionSlotKeys.every(
          (key) => !enAccounting.entries.some((entry) => entry.slotKey === key && entry.disposition === "removed"),
        ),
      JSON.stringify(enAccounting.totals.byDisposition),
    );

    const enRequirements = (await loadRequirementsFile(en.projectDir)).requirements;
    const enContentRoute = enRequirements.find(
      (requirement) => requirement.requirementId === "content-route-/pricing",
    );
    check(
      "28.P6.32 the disabled route's content-route requirement STOPS BLOCKING — retained with a note, never silently deleted",
      enContentRoute !== undefined &&
        enContentRoute.status === "not-applicable" &&
        (enContentRoute.statusNote ?? "").includes("no longer detected") &&
        !releaseBlockers(enRequirements).some((requirement) => requirement.route === "/pricing"),
      `${enContentRoute?.status} / ${enContentRoute?.statusNote}`,
    );
    // The nav cascade removed the STATIC anchors. What it deliberately did not
    // touch is the captured dynamic template, and the engine says so out loud
    // instead of pretending the route has no inbound link left.
    const enDeadLink = enRequirements.find((requirement) => requirement.kind === "dead-internal-link");
    check(
      "28.P6.33 the link the cascade could NOT remove becomes an ACTIONABLE, release-blocking requirement",
      enDeadLink !== undefined &&
        enDeadLink.severity === "release-blocking" &&
        enDeadLink.status === "unresolved" &&
        enDeadLink.route === "/" &&
        enDeadLink.slotKey === "global.header.nav.pricing.href" &&
        enDeadLink.message.includes("/pricing") &&
        enDeadLink.message.includes("CAPTURED DYNAMIC TEMPLATE") &&
        (enDeadLink.evidence[0]?.pointer ?? "").startsWith("p000001/") &&
        enDeadLink.resolutionOptions.some((option) => option.includes("re-enable /pricing")),
      `${enDeadLink?.requirementId} ${enDeadLink?.severity}/${enDeadLink?.status} slot=${enDeadLink?.slotKey}`,
    );
    check(
      "28.P6.33b the served ANCHOR audit reports zero and the requirement STILL does not clear — a blind channel is not evidence",
      enDeadLink?.status === "unresolved" &&
        !enQa.siteLinks.brokenInternalTargets.includes("/pricing") &&
        (enDeadLink?.statusNote ?? "").includes("NOT cleared by the served link audit") &&
        (enDeadLink?.statusNote ?? "").includes("dynamic-template-host"),
      `${enDeadLink?.status} note=${JSON.stringify(enDeadLink?.statusNote)}`,
    );
    check(
      "28.P6.34 route readiness counts the ENABLED routes only",
      enBuild.run !== null && (await planRelease(en.projectDir, { log: () => {} })).routeReadiness.length === 1,
      JSON.stringify((await planRelease(en.projectDir, { log: () => {} })).routeReadiness.map((row) => row.route)),
    );

    const enRebuild = await buildRelease(en.projectDir, { dryRun: true, log: () => {} });
    check(
      "28.P6.35 with nothing further changed the next build reruns NOTHING — the enablement slice is stable across a reload",
      JSON.stringify(enRebuild.plan.wouldRun) === JSON.stringify([]),
      JSON.stringify(enRebuild.plan.wouldRun),
    );

    // ---- re-enable ---------------------------------------------------------
    const enRestore = await commitAuthoredEdits(en.projectDir, [
      { op: "enable-route", route: "/pricing" },
      { op: "enable-region", regionId: enRegionId },
    ]);
    const enRestored = (await loadReleaseProject(en.projectDir)).project;
    check(
      "28.P6.36 re-enabling both deletes BOTH fields and records the reverse movement",
      enRestore.changed &&
        !("disabledRoutes" in enRestored.authored) &&
        !("disabledRegions" in enRestored.authored) &&
        enRestore.revision?.change.routesReEnabled?.includes("/pricing") === true &&
        enRestore.revision.change.regionsReEnabled?.includes(enRegionId) === true,
      JSON.stringify(enRestore.revision?.change.routesReEnabled),
    );
    const enBuildBack = await buildRelease(en.projectDir, { log: () => {} });
    const enSeoBack = JSON.parse(
      await readFile(
        path.join(enBuildBack.project.stageStatus.seo.artifact!.path, "production-seo-plan.json"),
        "utf8",
      ),
    ) as { routes: Array<{ route: string }> };
    const enSiteBack = path.join(
      productionBuildDir(HOST, enBuildBack.project.stageStatus.production.artifact!.id),
      "package",
      "site",
    );
    check(
      "28.P6.37 re-enabling brings the route back: 2 SEO routes and pricing.html is exported again",
      enBuildBack.failed === false &&
        enSeoBack.routes.length === 2 &&
        existsSync(path.join(enSiteBack, "pricing.html")),
      `${enSeoBack.routes.map((route) => route.route).join(",")} exported=${existsSync(path.join(enSiteBack, "pricing.html"))}` +
        (enBuildBack.project.failure ? ` FAILURE: ${enBuildBack.project.failure.message}` : ""),
    );
    // ---- the Phase-5/6 CORRECTION: the content scope is RECOVERABLE ------
    //
    // A build under a route disable narrows the content run's `scopedRoutes`
    // to the routes that stayed enabled. If the next build read that back as
    // the requested scope the narrowing would be PERMANENT — re-enabling the
    // route would leave its slots out of the units, out of the merge and out
    // of the accounting denominator. The run records what IT disabled, and the
    // re-enabled build must be back at the full route set.
    const enOffManifest = JSON.parse(
      await readFile(path.join(enContentDir, "manifest.json"), "utf8"),
    ) as { scopedRoutes?: string[]; enablement?: { disabledRoutes?: string[]; withheld?: unknown[] } };
    check(
      "28.P6.38 the narrowed run RECORDS the route it dropped, so the scope can be recovered",
      (enOffManifest.enablement?.disabledRoutes ?? []).includes("/pricing") &&
        !(enOffManifest.scopedRoutes ?? []).includes("/pricing"),
      `scopedRoutes=${JSON.stringify(enOffManifest.scopedRoutes)} disabled=${JSON.stringify(enOffManifest.enablement?.disabledRoutes)}`,
    );
    const enBackManifest = JSON.parse(
      await readFile(
        path.join(enBuildBack.project.stageStatus.content.artifact!.path, "manifest.json"),
        "utf8",
      ),
    ) as { scopedRoutes?: string[]; enablement?: unknown };
    check(
      "28.P6.38b the re-enabled build is back at the FULL route scope — the narrowing was not permanent",
      (enBackManifest.scopedRoutes ?? []).includes("/pricing") &&
        (enBackManifest.scopedRoutes ?? []).length === 2 &&
        enBackManifest.enablement === undefined,
      `scopedRoutes=${JSON.stringify(enBackManifest.scopedRoutes)}`,
    );
    const enBackAccounting = JSON.parse(
      await readFile(
        path.join(enBuildBack.project.stageStatus.content.artifact!.path, "slot-accounting.json"),
        "utf8",
      ),
    ) as {
      totals: { inScopeSlots: number; byDisposition: Record<string, number> };
      reconciliation: { reconciled: boolean; missing: string[] };
    };
    check(
      "28.P6.38c re-enabling puts the route's slots BACK in the denominator with no disabled disposition left",
      enBackAccounting.reconciliation.reconciled &&
        enBackAccounting.reconciliation.missing.length === 0 &&
        (enBackAccounting.totals.byDisposition["disabled-route"] ?? 0) === 0 &&
        (enBackAccounting.totals.byDisposition["disabled-region"] ?? 0) === 0 &&
        enBackAccounting.totals.inScopeSlots >= enAccounting.totals.inScopeSlots,
      `inScope ${enAccounting.totals.inScopeSlots} -> ${enBackAccounting.totals.inScopeSlots}; ` +
        JSON.stringify(enBackAccounting.totals.byDisposition),
    );
    check(
      "28.P5.75 the re-enabled region renders again in the exported HTML",
      (await readFile(path.join(enSiteBack, "index.html"), "utf8")).includes(
        `data-wr-node="${enCandidate!.pages[0].occurrences[0].nodeId}"`,
      ),
    );
    await rm(en.projectDir, { recursive: true, force: true });

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
