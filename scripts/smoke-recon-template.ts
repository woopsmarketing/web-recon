import { mkdir, rm, writeFile, readFile } from "node:fs/promises";
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
  compileReconTemplate,
  TemplateOverrideError,
  type CompiledReconTemplate,
} from "../src/recon-template/index.js";
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
