import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import {
  SCHEMA_VERSION as OBSERVER_SCHEMA_VERSION,
  DESKTOP_PROFILE,
  MOBILE_PROFILE,
  type ElementObservation,
  type PageObservation,
  type StyleTable,
  type ViewportId,
  type ViewportObservation,
} from "../src/observer/types.js";
import {
  SCHEMA_VERSION as MULTI_OBSERVER_SCHEMA_VERSION,
  type ObservedSitePage,
  type SiteObservation,
} from "../src/multi-observer/types.js";
import {
  analyzeSiteInteractions,
  detectViewportCandidates,
  InteractionInputError,
  PageInteractionAnalysisSchema,
  SiteInteractionAnalysisSchema,
  type InteractionCandidate,
  type ViewportInteractionAnalysis,
} from "../src/interaction-detector/index.js";

/**
 * Local deterministic fixture test for the Interaction Detector (Task 10 §71–90).
 *
 * Completely offline: **no HTTP server, no Playwright, no network, no browser**.
 * The detector itself is offline deterministic processing, so the fixture only
 * has to produce realistic Task 05/09 observation shapes — synthetic
 * `dom.json` / `styles.json` built the way the Observer builds them (document
 * order ids, a deduplicated style table), then the real analyzer on top.
 *
 * The fixture deliberately contains the cases that are easy to get wrong:
 *  - a control with FIVE overlapping signals that must yield exactly ONE candidate
 *  - `<details>/<summary>`, where only the summary is the trigger
 *  - an ordinary `<a href>` that must NOT become a candidate, and the same
 *    anchor with button semantics that must
 *  - `cursor:pointer` inherited down a subtree, where only the root may qualify
 *  - hidden / disabled / readonly / `pointer-events:none` controls that must be
 *    PRESERVED with their state rather than deleted
 *  - `aria-controls` that resolves, that does not resolve, and that names two ids
 *  - a `data-*` state hint on its own, which must never create a candidate
 *  - desktop and mobile sharing an element id while being unrelated elements
 *  - a corrupt `styleId`, which must fail fast instead of being analyzed
 */

// ---------------------------------------------------------------------------
// Tiny check harness (same shape as the other smoke tests)
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// Synthetic observation builders
// ---------------------------------------------------------------------------

interface FixtureNode {
  tag: string;
  attrs?: Record<string, string>;
  text?: string;
  style?: Record<string, string>;
  /** Defaults to true for both visibility levels. */
  localVisible?: boolean;
  effectiveVisible?: boolean;
  children?: FixtureNode[];
}

interface BuiltViewport {
  elements: ElementObservation[];
  styleTable: StyleTable;
}

/**
 * Build a `dom.json` + `styles.json` pair exactly the way the Observer does:
 * one document-order walk assigning `e000001…`, with identical computed-style
 * maps collapsed into a shared table of `s000001…` ids.
 */
function buildViewport(nodes: readonly FixtureNode[]): BuiltViewport {
  const elements: ElementObservation[] = [];
  const styleTable: StyleTable = {};
  const styleIdByKey = new Map<string, string>();
  let elementCounter = 0;

  const styleIdFor = (style: Record<string, string>): string => {
    const key = JSON.stringify(
      Object.fromEntries(Object.entries(style).sort(([a], [b]) => a.localeCompare(b))),
    );
    const existing = styleIdByKey.get(key);
    if (existing) return existing;
    const id = "s" + String(styleIdByKey.size + 1).padStart(6, "0");
    styleIdByKey.set(key, id);
    styleTable[id] = { ...style };
    return id;
  };

  const walk = (node: FixtureNode, parentId?: string): void => {
    elementCounter++;
    const id = "e" + String(elementCounter).padStart(6, "0");
    const localVisible = node.localVisible ?? true;
    const element: ElementObservation = {
      id,
      ...(parentId ? { parentId } : {}),
      tagName: node.tag,
      ...(node.text ? { text: node.text } : {}),
      attributes: { ...(node.attrs ?? {}) },
      localVisible,
      effectiveVisible: node.effectiveVisible ?? localVisible,
      styleId: styleIdFor(node.style ?? {}),
    };
    elements.push(element);
    for (const child of node.children ?? []) walk(child, id);
  };

  for (const node of nodes) walk(node);
  return { elements, styleTable };
}

/** Run the real detector over a synthetic viewport. */
function detect(
  nodes: readonly FixtureNode[],
  viewportId: ViewportId = "desktop",
): ViewportInteractionAnalysis {
  const built = buildViewport(nodes);
  return detectViewportCandidates({
    viewportId,
    elements: built.elements,
    styleTable: built.styleTable,
    domFile: `viewports/${viewportId}/dom.json`,
    stylesFile: `viewports/${viewportId}/styles.json`,
    pageUrl: "https://fixture.example/page",
  });
}

/** The candidate sitting on a given element id, if any. */
function candidateOf(
  analysis: ViewportInteractionAnalysis,
  elementId: string,
): InteractionCandidate | undefined {
  return analysis.candidates.find((c) => c.elementId === elementId);
}

const POINTER = { cursor: "pointer", "pointer-events": "auto" };
const PLAIN = { cursor: "auto", "pointer-events": "auto" };

// ---------------------------------------------------------------------------
// Full-run fixture: a realistic Task 09 site run on disk
// ---------------------------------------------------------------------------

const FIXED_AT = "2026-08-13T00:00:00.000Z";
const FIXTURE_ROOT = "https://fixture.example";

/** A page-observation viewport summary consistent with the built DOM. */
function viewportObservation(
  viewportId: ViewportId,
  built: BuiltViewport,
): ViewportObservation {
  const profile = viewportId === "desktop" ? DESKTOP_PROFILE : MOBILE_PROFILE;
  const effectiveVisible = built.elements.filter((e) => e.effectiveVisible).length;
  return {
    profile,
    environment: {
      browser: "fixture",
      browserVersion: "0.0.0",
      userAgent: "fixture",
      viewportWidth: profile.width,
      viewportHeight: profile.height,
      deviceScaleFactor: profile.deviceScaleFactor,
      colorScheme: "light",
      reducedMotion: "no-preference",
      timestamp: FIXED_AT,
    },
    metadata: {
      requestedUrl: `${FIXTURE_ROOT}/page`,
      finalUrl: `${FIXTURE_ROOT}/page`,
      title: "Fixture",
      timestamp: FIXED_AT,
      viewportWidth: profile.width,
      viewportHeight: profile.height,
      documentWidth: profile.width,
      documentHeight: 2000,
      scrollWidth: profile.width,
      scrollHeight: 2000,
    },
    loadStrategy: {
      waitUntil: "load",
      navTimeoutMs: 1,
      networkIdleTimeoutMs: 1,
      networkIdleReached: true,
      fontsReadyTimeoutMs: 1,
      fontsReadyReached: true,
      settleMs: 0,
      prepareScroll: false,
      timings: {
        navMs: 1,
        networkIdleMs: 0,
        fontsReadyMs: 0,
        settleMs: 0,
        totalMs: 1,
      },
    },
    stats: {
      domElementCount: built.elements.length,
      elementsWithGeometry: 0,
      localVisibleCount: built.elements.filter((e) => e.localVisible).length,
      effectiveVisibleCount: effectiveVisible,
      elementsWithPseudo: 0,
      uniqueStyleCount: Object.keys(built.styleTable).length,
      rawStyleOccurrenceCount: built.elements.length,
      assetCount: 0,
      inlineSvgCount: 0,
      linkCount: 0,
      internalLinkCount: 0,
      openShadowRootCount: 0,
      iframeCount: 0,
    },
    styleDedup: {
      rawStyleOccurrences: built.elements.length,
      uniqueStyleCount: Object.keys(built.styleTable).length,
      dedupRatio: 0,
    },
    shadow: { openShadowRootCount: 0, shadowHostIds: [] },
    sizes: {
      renderedHtmlBytes: 0,
      domJsonBytes: 0,
      stylesJsonBytes: 0,
      assetsJsonBytes: 0,
      linksJsonBytes: 0,
      framesJsonBytes: 0,
      screenshotBytes: 0,
      domPlusStylesBytes: 0,
      inlineStylesDomBytes: 0,
      viewportTotalBytes: 0,
    },
    files: {
      rendered: `viewports/${viewportId}/rendered.html`,
      dom: `viewports/${viewportId}/dom.json`,
      styles: `viewports/${viewportId}/styles.json`,
      assets: `viewports/${viewportId}/assets.json`,
      links: `viewports/${viewportId}/links.json`,
      frames: `viewports/${viewportId}/frames.json`,
      screenshot: `viewports/${viewportId}/screenshot.png`,
    },
  };
}

/** Write one page directory in the exact Task 05/09 layout. */
async function writePage(
  runDir: string,
  pageId: string,
  desktop: BuiltViewport,
  mobile: BuiltViewport,
): Promise<void> {
  const pageDir = path.join(runDir, "pages", pageId);
  const desktopSummary = viewportObservation("desktop", desktop);
  const mobileSummary = viewportObservation("mobile", mobile);

  const observation: PageObservation = {
    schemaVersion: OBSERVER_SCHEMA_VERSION,
    engine: "fixture",
    target: {
      requestedUrl: `${FIXTURE_ROOT}/page`,
      finalUrl: `${FIXTURE_ROOT}/page`,
      title: "Fixture",
      timestamp: FIXED_AT,
    },
    observationProfile: {
      locale: "ko-KR",
      timezone: "Asia/Seoul",
      colorScheme: "light",
      reducedMotion: "no-preference",
    },
    viewports: { desktop: desktopSummary, mobile: mobileSummary },
    responsiveSummary: {
      desktop: {
        elementCount: desktop.elements.length,
        effectiveVisibleCount: desktopSummary.stats.effectiveVisibleCount,
        documentWidth: DESKTOP_PROFILE.width,
        documentHeight: 2000,
        uniqueStyleCount: desktopSummary.stats.uniqueStyleCount,
        assetCount: 0,
        linkCount: 0,
      },
      mobile: {
        elementCount: mobile.elements.length,
        effectiveVisibleCount: mobileSummary.stats.effectiveVisibleCount,
        documentWidth: MOBILE_PROFILE.width,
        documentHeight: 2000,
        uniqueStyleCount: mobileSummary.stats.uniqueStyleCount,
        assetCount: 0,
        linkCount: 0,
      },
    },
    sizes: { observationJsonBytes: 0, runTotalBytes: 0 },
  };

  for (const [viewportId, built] of [
    ["desktop", desktop],
    ["mobile", mobile],
  ] as const) {
    const dir = path.join(pageDir, "viewports", viewportId);
    await mkdir(dir, { recursive: true });
    await writeFile(
      path.join(dir, "dom.json"),
      JSON.stringify(built.elements, null, 2) + "\n",
      "utf8",
    );
    await writeFile(
      path.join(dir, "styles.json"),
      JSON.stringify(built.styleTable, null, 2) + "\n",
      "utf8",
    );
  }

  await writeFile(
    path.join(pageDir, "observation.json"),
    JSON.stringify(observation, null, 2) + "\n",
    "utf8",
  );
}

/** A `site-observation.json` manifest for the fixture pages. */
function siteManifest(pages: readonly ObservedSitePage[]): SiteObservation {
  const successCount = pages.filter((p) => p.status === "success").length;
  return {
    schemaVersion: MULTI_OBSERVER_SCHEMA_VERSION,
    engine: "fixture",
    rootUrl: FIXTURE_ROOT,
    sourceSelectedPagesFile: "fixture://selected-pages.json",
    startedAt: FIXED_AT,
    completedAt: FIXED_AT,
    status: successCount === pages.length ? "completed" : "completed-with-errors",
    config: {
      concurrency: 1,
      prepareScroll: false,
      viewportProfiles: [DESKTOP_PROFILE, MOBILE_PROFILE],
      maxValidationSamplesPerSite: 3,
      minValidationFamilySize: 3,
    },
    observationProfile: {
      locale: "ko-KR",
      timezone: "Asia/Seoul",
      colorScheme: "light",
      reducedMotion: "no-preference",
    },
    selection: {
      verifiedUrlCount: 5,
      familyCount: 2,
      selectedCount: 2,
      largestFamilySize: 4,
      selectedAt: FIXED_AT,
    },
    coverage: {
      familyCount: 2,
      observedRepresentativeCount: 1,
      representedVerifiedUrlCount: 4,
      validationSampleCount: 1,
      totalObservedPageCount: pages.length,
      fullObservationPageCount: 5,
      observationReductionCount: 5 - pages.length,
      observationReductionRate: 0,
    },
    stats: {
      requestedPages: pages.length,
      completedPages: successCount,
      failedPages: pages.length - successCount,
      desktopObservations: successCount,
      mobileObservations: successCount,
      desktopBytes: 0,
      mobileBytes: 0,
      screenshotBytes: 0,
      jsonHtmlBytes: 0,
      pageBytes: 0,
      siteObservationJsonBytes: 0,
      totalBytes: 0,
      averageBytesPerObservedPage: 0,
      totalElapsedMs: 0,
    },
    pages: [...pages],
    validationSamples: [
      {
        familyId: "f000001",
        familyType: "sibling-pattern",
        familyMemberCount: 4,
        representativePageId: "p000001",
        samplePageId: "p000002",
        representativeUrl: `${FIXTURE_ROOT}/page`,
        sampleUrl: `${FIXTURE_ROOT}/sample`,
      },
    ],
  };
}

function sitePage(
  pageId: string,
  url: string,
  role: ObservedSitePage["role"],
  status: ObservedSitePage["status"],
): ObservedSitePage {
  return {
    pageId,
    url,
    role,
    familyId: "f000001",
    familyType: "sibling-pattern",
    familyMemberCount: 4,
    status,
    startedAt: FIXED_AT,
    completedAt: FIXED_AT,
    elapsedMs: 0,
    ...(status === "success"
      ? { pageObservationFile: `pages/${pageId}/observation.json` }
      : {
          error: {
            name: "TimeoutError",
            message: "navigation timeout",
            phase: "observe" as const,
          },
        }),
  };
}

// ---------------------------------------------------------------------------
// Fixture DOMs
// ---------------------------------------------------------------------------

/** §72–75, §84–85: ARIA triggers and their targets. */
const ARIA_NODES: readonly FixtureNode[] = [
  {
    tag: "html",
    children: [
      {
        tag: "body",
        children: [
          // §72 disclosure: resolved control, hidden target
          {
            tag: "button",
            text: "Toggle",
            attrs: { "aria-expanded": "false", "aria-controls": "panel" },
            style: POINTER,
          },
          {
            tag: "div",
            attrs: { id: "panel" },
            localVisible: false,
            effectiveVisible: false,
            style: PLAIN,
          },
          // §73 menu trigger
          {
            tag: "button",
            text: "Menu",
            attrs: {
              "aria-haspopup": "menu",
              "aria-expanded": "false",
              "aria-controls": "menu1",
            },
            style: POINTER,
          },
          {
            tag: "div",
            attrs: { id: "menu1", role: "menu" },
            localVisible: false,
            effectiveVisible: false,
            style: PLAIN,
          },
          // §74 dialog trigger
          {
            tag: "button",
            text: "Open dialog",
            attrs: { "aria-haspopup": "dialog", "aria-controls": "dialog1" },
            style: POINTER,
          },
          {
            tag: "div",
            attrs: { id: "dialog1", role: "dialog" },
            localVisible: false,
            effectiveVisible: false,
            style: PLAIN,
          },
          // §75 tab trigger
          {
            tag: "button",
            text: "Tab one",
            attrs: { role: "tab", "aria-selected": "false", "aria-controls": "panel1" },
            style: POINTER,
          },
          {
            tag: "div",
            attrs: { id: "panel1", role: "tabpanel" },
            style: PLAIN,
          },
          // §84 unresolved control
          {
            tag: "button",
            text: "Later",
            attrs: { "aria-controls": "not-mounted-yet" },
            style: POINTER,
          },
          // §85 two ids in one aria-controls
          {
            tag: "button",
            text: "Both",
            attrs: { "aria-controls": "panelA panelB" },
            style: POINTER,
          },
          { tag: "div", attrs: { id: "panelA" }, style: PLAIN },
          { tag: "div", attrs: { id: "panelB" }, style: PLAIN },
          // §44 unreferenced stateful container
          {
            tag: "dialog",
            attrs: { id: "standalone" },
            localVisible: false,
            effectiveVisible: false,
            style: PLAIN,
          },
          // aria-owns must NOT become a control relation
          {
            tag: "button",
            text: "Owner",
            attrs: { "aria-owns": "panelA" },
            style: POINTER,
          },
        ],
      },
    ],
  },
];

/** §76–83, §86–87: native controls, guards, exclusions. */
const CONTROL_NODES: readonly FixtureNode[] = [
  {
    tag: "html",
    children: [
      {
        tag: "body",
        children: [
          // §76 native details/summary
          {
            tag: "details",
            attrs: { open: "" },
            style: PLAIN,
            children: [{ tag: "summary", text: "More", style: POINTER }],
          },
          // §77 form controls + §78 submit guard
          {
            tag: "form",
            style: PLAIN,
            children: [
              { tag: "input", attrs: { type: "text" }, style: PLAIN },
              { tag: "input", attrs: { type: "checkbox" }, style: POINTER },
              { tag: "input", attrs: { type: "range" }, style: PLAIN },
              { tag: "input", attrs: { type: "file" }, style: PLAIN },
              { tag: "input", attrs: { type: "hidden", name: "csrf" }, localVisible: false, effectiveVisible: false, style: PLAIN },
              { tag: "textarea", style: PLAIN },
              {
                tag: "select",
                style: PLAIN,
                children: [
                  { tag: "option", text: "One", style: PLAIN },
                  { tag: "option", text: "Two", style: PLAIN },
                ],
              },
              { tag: "button", text: "Save", style: POINTER },
              { tag: "button", text: "Cancel", attrs: { type: "button" }, style: POINTER },
              { tag: "input", attrs: { type: "submit", value: "Go" }, style: POINTER },
            ],
          },
          // §79 links
          { tag: "a", text: "Docs", attrs: { href: "/docs" }, style: POINTER },
          { tag: "a", text: "External", attrs: { href: "https://other.example/x" }, style: POINTER },
          {
            tag: "a",
            text: "Menu",
            attrs: { href: "#", role: "button", "aria-expanded": "false" },
            style: POINTER,
          },
          { tag: "a", text: "Script", attrs: { href: "javascript:doThing()" }, style: POINTER },
          // A redundant role=link must NOT admit an ordinary navigation anchor
          { tag: "a", text: "Home", attrs: { href: "/", role: "link" }, style: POINTER },
          // §80 generic pointer + the pointer-events exclusion
          { tag: "div", text: "Clickable", style: POINTER },
          {
            tag: "div",
            text: "Not clickable",
            style: { cursor: "pointer", "pointer-events": "none" },
          },
          // §81 inline handler (name only, never the source)
          {
            tag: "div",
            text: "Handler",
            attrs: { onclick: "doSomethingSecret(window.token)" },
            style: PLAIN,
          },
          // §82 hidden strong candidate
          {
            tag: "button",
            text: "Hidden",
            localVisible: false,
            effectiveVisible: false,
            style: PLAIN,
          },
          // §83 disabled + readonly
          { tag: "button", text: "Disabled", attrs: { disabled: "" }, style: PLAIN },
          {
            tag: "input",
            attrs: { type: "text", readonly: "", value: "fixed" },
            style: PLAIN,
          },
          { tag: "button", text: "Aria disabled", attrs: { "aria-disabled": "true" }, style: PLAIN },
          // §86 data-* alone
          { tag: "div", text: "State only", attrs: { "data-state": "open" }, style: PLAIN },
          // data-* + tabindex is allowed to combine into a weak candidate
          {
            tag: "div",
            text: "Hinted",
            attrs: { "data-state": "closed", tabindex: "0" },
            style: PLAIN,
          },
          // §87 five overlapping signals on ONE element
          {
            tag: "button",
            text: "Everything",
            attrs: {
              role: "button",
              "aria-expanded": "true",
              "aria-controls": "panelA",
              onclick: "toggle()",
            },
            style: POINTER,
          },
          { tag: "div", attrs: { id: "panelA" }, style: PLAIN },
          // contenteditable / draggable / popover
          { tag: "div", text: "Edit me", attrs: { contenteditable: "true" }, style: PLAIN },
          { tag: "div", text: "Not editable", attrs: { contenteditable: "false" }, style: PLAIN },
          { tag: "div", text: "Drag me", attrs: { draggable: "true" }, style: PLAIN },
          {
            tag: "button",
            text: "Popover",
            attrs: { popovertarget: "pop1", popovertargetaction: "toggle" },
            style: POINTER,
          },
          {
            tag: "div",
            attrs: { id: "pop1", popover: "auto" },
            localVisible: false,
            effectiveVisible: false,
            style: PLAIN,
          },
          // inert subtree
          {
            tag: "div",
            attrs: { inert: "" },
            style: PLAIN,
            children: [{ tag: "button", text: "Inert child", style: POINTER }],
          },
          // §32 cursor inheritance: only the ROOT of a pointer subtree qualifies
          {
            tag: "div",
            attrs: { "data-card": "1" },
            style: POINTER,
            children: [
              { tag: "span", text: "Title", style: POINTER },
              { tag: "span", text: "Subtitle", style: POINTER },
            ],
          },
          // CSS motion alone is not interaction
          {
            tag: "div",
            text: "Animated",
            style: {
              cursor: "auto",
              "pointer-events": "auto",
              "transition-duration": "0.3s",
              "animation-name": "pulse",
            },
          },
        ],
      },
    ],
  },
];

/** §89: mobile shares element ids with desktop but is a different document. */
const MOBILE_NODES: readonly FixtureNode[] = [
  {
    tag: "html",
    children: [
      {
        tag: "body",
        children: [
          { tag: "div", text: "Nothing here", style: PLAIN },
          { tag: "div", text: "Still nothing", style: PLAIN },
          {
            tag: "button",
            text: "Mobile menu",
            attrs: { "aria-expanded": "false" },
            style: POINTER,
          },
        ],
      },
    ],
  },
];

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  console.log(
    "web-recon — smoke:interaction-detector (offline fixture, no network / no browser)",
  );
  console.log("");

  // =========================================================== ARIA triggers
  const aria = detect(ARIA_NODES);

  const disclosure = candidateOf(aria, "e000003");
  check("§72 disclosure trigger is P1", disclosure?.priority === "P1", disclosure?.priority);
  check(
    "§72 disclosure capabilities: click + state-toggle + disclosure-trigger",
    ["click", "state-toggle", "disclosure-trigger"].every((c) =>
      disclosure?.capabilities.includes(c as never),
    ),
    disclosure?.capabilities.join("+"),
  );
  check(
    "§72 aria-controls resolved to the target element id",
    disclosure?.controls.length === 1 &&
      disclosure.controls[0].resolved &&
      disclosure.controls[0].targetDomId === "panel" &&
      disclosure.controls[0].targetElementId === "e000004",
    JSON.stringify(disclosure?.controls),
  );
  const panel = aria.targets.find((t) => t.domId === "panel");
  check(
    "§72 target records the hidden BEFORE state",
    panel?.effectiveVisible === false && panel.reasons.includes("aria-controls"),
    JSON.stringify(panel),
  );
  check(
    "§72 aria-expanded value is stored as evidence (not just presence)",
    disclosure?.evidence.some(
      (e) => e.type === "aria-expanded" && e.value === "false",
    ),
  );

  const menu = candidateOf(aria, "e000005");
  check("§73 menu trigger is P1", menu?.priority === "P1");
  check(
    "§73 menu-trigger capability from aria-haspopup=menu",
    menu?.capabilities.includes("menu-trigger"),
    menu?.capabilities.join("+"),
  );
  check(
    "§73 menu target resolved",
    menu?.controls[0]?.resolved === true &&
      menu.controls[0].targetElementId === "e000006",
  );

  const dialog = candidateOf(aria, "e000007");
  check("§74 dialog trigger is P1", dialog?.priority === "P1");
  check(
    "§74 dialog-trigger capability from aria-haspopup=dialog",
    dialog?.capabilities.includes("dialog-trigger"),
    dialog?.capabilities.join("+"),
  );
  check(
    "§74 role=dialog target is in the inventory",
    aria.targets.some((t) => t.domId === "dialog1" && t.role === "dialog"),
  );

  const tab = candidateOf(aria, "e000009");
  check("§75 tab trigger is P1", tab?.priority === "P1");
  check(
    "§75 tab-trigger capability from role=tab",
    tab?.capabilities.includes("tab-trigger"),
    tab?.capabilities.join("+"),
  );
  check(
    "§75 tabpanel relation resolved",
    tab?.controls[0]?.resolved === true && tab.controls[0].targetDomId === "panel1",
  );

  const unresolved = candidateOf(aria, "e000011");
  check(
    "§84 unresolved aria-controls is kept, not dropped",
    unresolved !== undefined &&
      unresolved.controls.length === 1 &&
      unresolved.controls[0].resolved === false &&
      unresolved.controls[0].targetDomId === "not-mounted-yet" &&
      unresolved.controls[0].targetElementId === undefined,
    JSON.stringify(unresolved?.controls),
  );
  check("§84 unresolved control is not an error", aria.candidates.length > 0);
  check(
    "§84 unresolved count is reported",
    aria.stats.unresolvedControlCount === 1,
    String(aria.stats.unresolvedControlCount),
  );

  const multi = candidateOf(aria, "e000012");
  check(
    "§85 aria-controls with two ids yields two resolved relations",
    multi?.controls.length === 2 &&
      multi.controls.every((c) => c.resolved) &&
      multi.controls[0].targetDomId === "panelA" &&
      multi.controls[1].targetDomId === "panelB",
    JSON.stringify(multi?.controls),
  );

  check(
    "§44 an unreferenced <dialog> still enters the target inventory",
    aria.targets.some(
      (t) => t.domId === "standalone" && t.reasons.includes("stateful-container"),
    ),
  );
  const owner = candidateOf(aria, "e000016");
  check(
    "§43 aria-owns is evidence only, never a control relation",
    owner !== undefined &&
      owner.controls.length === 0 &&
      owner.evidence.some((e) => e.type === "aria-owns"),
    JSON.stringify(owner?.controls),
  );

  // =========================================================== native controls
  const controls = detect(CONTROL_NODES);

  const summary = candidateOf(controls, "e000004");
  check("§76 <summary> is a candidate", summary !== undefined);
  check("§76 <summary> is P1 (native disclosure)", summary?.priority === "P1");
  check(
    "§76 <summary> carries the native-disclosure relation to its <details>",
    summary?.controls.some(
      (c) => c.relation === "details" && c.targetElementId === "e000003" && c.resolved,
    ),
    JSON.stringify(summary?.controls),
  );
  check(
    "§76 <details> open state is recorded as evidence",
    summary?.evidence.some((e) => e.type === "details-open"),
  );
  check(
    "§76 <details> itself is NOT a duplicate candidate",
    candidateOf(controls, "e000003") === undefined,
  );
  check(
    "§76 <details> IS in the target inventory",
    controls.targets.some(
      (t) => t.elementId === "e000003" && t.reasons.includes("details-content"),
    ),
  );

  const textInput = candidateOf(controls, "e000006");
  check(
    "§77 input[type=text] → P2 edit+focus",
    textInput?.priority === "P2" &&
      textInput.capabilities.includes("edit") &&
      textInput.capabilities.includes("focus"),
    textInput?.capabilities.join("+"),
  );
  const checkbox = candidateOf(controls, "e000007");
  check(
    "§77 input[type=checkbox] → P2 toggle",
    checkbox?.priority === "P2" && checkbox.capabilities.includes("toggle"),
    checkbox?.capabilities.join("+"),
  );
  const range = candidateOf(controls, "e000008");
  check(
    "§77 input[type=range] → P2 range-adjust",
    range?.priority === "P2" && range.capabilities.includes("range-adjust"),
    range?.capabilities.join("+"),
  );
  const file = candidateOf(controls, "e000009");
  check(
    "§77/§29 input[type=file] → P2 with a file-input guard",
    file?.priority === "P2" && file.guardFlags.includes("file-input"),
    file?.guardFlags.join(","),
  );
  check(
    "§12 input[type=hidden] is never a candidate",
    candidateOf(controls, "e000010") === undefined,
  );
  const textarea = candidateOf(controls, "e000011");
  check(
    "§77 textarea → P2 edit",
    textarea?.priority === "P2" && textarea.capabilities.includes("edit"),
    textarea?.capabilities.join("+"),
  );
  const select = candidateOf(controls, "e000012");
  check(
    "§77/§21 select → P2 select + open-options",
    select?.priority === "P2" &&
      select.capabilities.includes("select") &&
      select.capabilities.includes("open-options"),
    select?.capabilities.join("+"),
  );
  check(
    "§11 <option> is not an independent candidate",
    candidateOf(controls, "e000013") === undefined &&
      candidateOf(controls, "e000014") === undefined,
  );

  const implicitSubmit = candidateOf(controls, "e000015");
  check(
    "§78 typeless <button> inside a form is submit-capable",
    implicitSubmit?.submitCapable === true &&
      implicitSubmit.guardFlags.includes("form-submit"),
    JSON.stringify(implicitSubmit?.guardFlags),
  );
  check(
    "§78 the implicit-submit derivation is recorded as DERIVED evidence",
    implicitSubmit?.evidence.some(
      (e) => e.type === "implicit-submit" && e.provenance === "derived",
    ),
  );
  check(
    "§52 the form ancestor is recorded",
    implicitSubmit?.insideForm === true &&
      implicitSubmit.formElementId === "e000005",
    implicitSubmit?.formElementId,
  );
  const typedButton = candidateOf(controls, "e000016");
  check(
    "§78 <button type=button> in a form has NO submit guard",
    typedButton?.submitCapable === false &&
      !typedButton.guardFlags.includes("form-submit"),
    JSON.stringify(typedButton?.guardFlags),
  );
  const submitInput = candidateOf(controls, "e000017");
  check(
    "§28 input[type=submit] is submit-capable",
    submitInput?.submitCapable === true &&
      submitInput.capabilities.includes("submit"),
  );

  check(
    "§79 an ordinary <a href> is NOT a candidate",
    candidateOf(controls, "e000018") === undefined,
  );
  check(
    "§79 an ordinary external <a href> is NOT a candidate either",
    candidateOf(controls, "e000019") === undefined,
  );
  const anchorButton = candidateOf(controls, "e000020");
  check(
    "§79 <a href=# role=button aria-expanded> IS a candidate (P1)",
    anchorButton?.priority === "P1",
    anchorButton?.priority,
  );
  const jsAnchor = candidateOf(controls, "e000021");
  check(
    "§27 javascript: href is a candidate, and only the scheme is stored",
    jsAnchor?.priority === "P2" &&
      jsAnchor.evidence.some(
        (e) => e.type === "javascript-href" && e.value === "javascript:",
      ) &&
      !JSON.stringify(jsAnchor).includes("doThing"),
  );
  check(
    "§27 a redundant role=link never admits a navigation anchor",
    candidateOf(controls, "e000022") === undefined,
  );

  const genericPointer = candidateOf(controls, "e000023");
  check(
    "§80 visible div with cursor:pointer → P3 generic-pointer",
    genericPointer?.priority === "P3" &&
      genericPointer.capabilities.includes("generic-pointer"),
    genericPointer?.capabilities.join("+"),
  );
  check(
    "§80/§33 cursor:pointer + pointer-events:none and nothing else → excluded",
    candidateOf(controls, "e000024") === undefined,
  );

  const handler = candidateOf(controls, "e000025");
  check(
    "§81 inline onclick → P2 click",
    handler?.priority === "P2" && handler.capabilities.includes("click"),
    handler?.capabilities.join("+"),
  );
  check(
    "§26 only the handler NAME is stored, never the source",
    handler?.evidence.some(
      (e) => e.type === "inline-handler" && e.value === "onclick",
    ) && !JSON.stringify(handler).includes("doSomethingSecret"),
  );

  const hiddenButton = candidateOf(controls, "e000026");
  check(
    "§82/§55 a hidden <button> is PRESERVED as a candidate",
    hiddenButton !== undefined,
  );
  check(
    "§82 hidden candidate records the invisible initial state",
    hiddenButton?.initialState.effectiveVisible === false &&
      hiddenButton.initialState.initiallyOperable === false &&
      hiddenButton.guardFlags.includes("hidden"),
    JSON.stringify(hiddenButton?.initialState),
  );

  const disabledButton = candidateOf(controls, "e000027");
  check(
    "§83 disabled <button> is preserved with disabled state + guard",
    disabledButton !== undefined &&
      disabledButton.initialState.disabled &&
      !disabledButton.initialState.initiallyOperable &&
      disabledButton.guardFlags.includes("disabled"),
    JSON.stringify(disabledButton?.initialState),
  );
  const readonlyInput = candidateOf(controls, "e000028");
  check(
    "§20/§30 readonly input is preserved and marked non-operable",
    readonlyInput !== undefined &&
      readonlyInput.initialState.readonly &&
      !readonlyInput.initialState.initiallyOperable &&
      readonlyInput.guardFlags.includes("readonly"),
  );
  const ariaDisabled = candidateOf(controls, "e000029");
  check(
    "§30 aria-disabled=true counts as disabled",
    ariaDisabled?.initialState.disabled === true,
  );

  check(
    "§86 a data-* state hint ALONE never creates a candidate",
    candidateOf(controls, "e000030") === undefined,
  );
  const hinted = candidateOf(controls, "e000031");
  check(
    "§35 data-* hint + tabindex>=0 → P3 candidate",
    hinted?.priority === "P3",
    hinted?.priority,
  );
  check(
    "§35 only the data-* attribute NAME is stored, never its value",
    hinted?.evidence.some(
      (e) => e.type === "state-hint-attribute" && e.value === "data-state",
    ) && !hinted.evidence.some((e) => e.value === "closed"),
  );

  const everything = candidateOf(controls, "e000032");
  check(
    "§87 five overlapping signals produce exactly ONE candidate",
    controls.candidates.filter((c) => c.elementId === "e000032").length === 1,
  );
  check("§40 the highest priority wins (P1)", everything?.priority === "P1");
  check(
    "§87 every signal is kept as evidence",
    ["native-element", "role", "aria-expanded", "aria-controls", "inline-handler", "computed-cursor"].every(
      (t) => everything?.evidence.some((e) => e.type === t),
    ),
    everything?.evidence.map((e) => e.type).join(","),
  );

  const editable = candidateOf(controls, "e000034");
  check(
    "§24 contenteditable=true → edit + focus",
    editable?.capabilities.includes("edit") && editable.capabilities.includes("focus"),
    editable?.capabilities.join("+"),
  );
  check(
    "§24 contenteditable=false is excluded",
    candidateOf(controls, "e000035") === undefined,
  );
  const draggable = candidateOf(controls, "e000036");
  check(
    "§23 draggable=true → drag capability (P2)",
    draggable?.priority === "P2" && draggable.capabilities.includes("drag"),
    draggable?.capabilities.join("+"),
  );

  const popoverTrigger = candidateOf(controls, "e000037");
  check(
    "§25 popovertarget → P1 popover-trigger",
    popoverTrigger?.priority === "P1" &&
      popoverTrigger.capabilities.includes("popover-trigger"),
    popoverTrigger?.capabilities.join("+"),
  );
  check(
    "§25 popover target is resolved into the inventory",
    controls.targets.some(
      (t) => t.domId === "pop1" && t.reasons.includes("popovertarget"),
    ),
  );

  const inertChild = candidateOf(controls, "e000040");
  check(
    "§30 an inert ANCESTOR is detected and blocks operability",
    inertChild?.initialState.inertAncestor === true &&
      inertChild.initialState.initiallyOperable === false &&
      inertChild.guardFlags.includes("inert"),
    JSON.stringify(inertChild?.initialState),
  );

  check(
    "§32 inherited cursor:pointer does NOT multiply candidates (root only)",
    candidateOf(controls, "e000041") !== undefined &&
      candidateOf(controls, "e000042") === undefined &&
      candidateOf(controls, "e000043") === undefined,
  );
  check(
    "§34 transition/animation alone never creates a candidate",
    candidateOf(controls, "e000044") === undefined,
  );

  // =========================================================== stats & density
  check(
    "stats: candidate count matches the array",
    controls.stats.candidateCount === controls.candidates.length,
  );
  check(
    "stats: priority counts add up",
    controls.stats.priorityCounts.P1 +
      controls.stats.priorityCounts.P2 +
      controls.stats.priorityCounts.P3 ===
      controls.candidates.length,
  );
  check(
    "stats: visible + hidden = total",
    controls.stats.visibleCandidateCount + controls.stats.hiddenCandidateCount ===
      controls.candidates.length,
  );
  check(
    "§63 candidateDensity is candidates / effective-visible elements",
    controls.stats.candidateDensity ===
      Math.round(
        (controls.candidates.length / controls.stats.effectiveVisibleElementCount) *
          10_000,
      ) /
        10_000,
    String(controls.stats.candidateDensity),
  );
  check(
    "§67 no cap: every rule-based candidate is stored",
    controls.candidates.length > 20,
    String(controls.candidates.length),
  );

  // =========================================================== ordering
  check(
    "candidate ids are ic000001… in element order",
    controls.candidates.every(
      (c, i) => c.id === "ic" + String(i + 1).padStart(6, "0"),
    ),
  );
  check(
    "candidates are sorted by elementId (document order)",
    controls.candidates.every(
      (c, i) => i === 0 || controls.candidates[i - 1].elementId < c.elementId,
    ),
  );
  check(
    "targets are sorted by elementId",
    controls.targets.every(
      (t, i) => i === 0 || controls.targets[i - 1].elementId < t.elementId,
    ),
  );

  // =========================================================== §88 determinism
  const baseline = JSON.stringify(detect(CONTROL_NODES));
  const repeat = JSON.stringify(detect(CONTROL_NODES));
  check("§88 re-running on the same input is byte-identical", baseline === repeat);

  // Reverse the style table's key order and the element array's attribute key
  // order: neither may change a single byte of the result.
  const built = buildViewport(CONTROL_NODES);
  const reversedStyles: StyleTable = {};
  for (const key of Object.keys(built.styleTable).reverse()) {
    const style = built.styleTable[key];
    reversedStyles[key] = Object.fromEntries(
      Object.entries(style).reverse(),
    ) as typeof style;
  }
  const reversedAttrElements: ElementObservation[] = built.elements.map((e) => ({
    ...e,
    attributes: Object.fromEntries(Object.entries(e.attributes).reverse()),
  }));
  const permuted = detectViewportCandidates({
    viewportId: "desktop",
    elements: reversedAttrElements,
    styleTable: reversedStyles,
    domFile: "viewports/desktop/dom.json",
    stylesFile: "viewports/desktop/styles.json",
    pageUrl: "https://fixture.example/page",
  });
  check(
    "§88 reversed style-table and attribute key order → identical output",
    JSON.stringify(permuted) === baseline,
  );

  // =========================================================== §89 viewports
  const desktopSmall = detect(ARIA_NODES);
  const mobileSmall = detect(MOBILE_NODES, "mobile");
  check(
    "§89 the same element id means different things per viewport",
    candidateOf(desktopSmall, "e000003")?.tagName === "button" &&
      candidateOf(mobileSmall, "e000003") === undefined,
    `${candidateOf(desktopSmall, "e000003")?.tagName} vs ${candidateOf(mobileSmall, "e000003")?.tagName}`,
  );
  check(
    "§89 each viewport numbers its candidates from ic000001",
    mobileSmall.candidates[0]?.id === "ic000001" &&
      mobileSmall.candidates[0]?.elementId === "e000005",
    JSON.stringify(mobileSmall.candidates.map((c) => [c.id, c.elementId])),
  );

  // =========================================================== file round-trip
  let tmp: string | undefined;
  try {
    tmp = await mkdtemp(path.join(tmpdir(), "interaction-detector-smoke-"));
    const runDir = path.join(tmp, "run");
    const desktopBuilt = buildViewport(CONTROL_NODES);
    const mobileBuilt = buildViewport(MOBILE_NODES);
    const sampleBuilt = buildViewport(ARIA_NODES);

    await writePage(runDir, "p000001", desktopBuilt, mobileBuilt);
    await writePage(runDir, "p000002", sampleBuilt, sampleBuilt);
    const manifest = siteManifest([
      sitePage("p000001", `${FIXTURE_ROOT}/page`, "representative", "success"),
      sitePage("p000002", `${FIXTURE_ROOT}/sample`, "validation-sample", "success"),
      sitePage("p000003", `${FIXTURE_ROOT}/broken`, "representative", "navigation-error"),
    ]);
    await mkdir(runDir, { recursive: true });
    await writeFile(
      path.join(runDir, "site-observation.json"),
      JSON.stringify(manifest, null, 2) + "\n",
      "utf8",
    );

    const run = await analyzeSiteInteractions({
      siteObservationFile: path.join(runDir, "site-observation.json"),
      analyzedAt: FIXED_AT,
    });

    check(
      "§7 a failed Task 09 page is skipped, not fatal",
      run.analysis.stats.analyzedPages === 2 &&
        run.analysis.stats.skippedFailedPages === 1 &&
        run.analysis.skippedPages[0].pageId === "p000003",
      JSON.stringify(run.analysis.skippedPages),
    );
    check(
      "§8 desktop and mobile are analyzed independently",
      run.analysis.pages[0].desktop.total !== run.analysis.pages[0].mobile.total,
      `${run.analysis.pages[0].desktop.total} vs ${run.analysis.pages[0].mobile.total}`,
    );
    check(
      "§57 each page gets its own interaction-candidates.json",
      run.analysis.pages.every(
        (p) =>
          p.interactionCandidatesFile ===
          `pages/${p.pageId}/interaction-candidates.json`,
      ),
    );

    const pageJson = JSON.parse(
      await readFile(
        path.join(runDir, "pages", "p000001", "interaction-candidates.json"),
        "utf8",
      ),
    );
    const pageParsed = PageInteractionAnalysisSchema.safeParse(pageJson);
    check("§91 interaction-candidates.json passes Zod after reload", pageParsed.success);
    check(
      "§91 reloaded page keeps every candidate",
      pageParsed.success &&
        pageParsed.data.viewports.desktop.candidates.length ===
          controls.candidates.length,
    );

    const siteJson = JSON.parse(
      await readFile(path.join(runDir, "interaction-analysis.json"), "utf8"),
    );
    const siteParsed = SiteInteractionAnalysisSchema.safeParse(siteJson);
    check("§91 interaction-analysis.json passes Zod after reload", siteParsed.success);
    check(
      "§59 the site manifest references pages by path, never embeds candidates",
      !JSON.stringify(siteJson).includes("\"evidence\""),
    );
    check(
      "§109 recorded byte totals match the real files",
      siteParsed.success &&
        siteParsed.data.stats.totalAddedBytes ===
          siteParsed.data.stats.interactionCandidatesBytes +
            Buffer.byteLength(
              await readFile(path.join(runDir, "interaction-analysis.json"), "utf8"),
              "utf8",
            ),
    );
    check(
      "§64 validation pair comparison is computed from stored candidates only",
      run.analysis.validationInteractionComparisons.length === 1 &&
        run.analysis.validationInteractionComparisons[0].desktop.totalDifference ===
          aria.candidates.length - controls.candidates.length,
      JSON.stringify(
        run.analysis.validationInteractionComparisons[0]?.desktop.totalDifference,
      ),
    );
    check(
      "§58 the original observation artifacts are untouched",
      JSON.parse(
        await readFile(
          path.join(runDir, "pages", "p000001", "viewports", "desktop", "dom.json"),
          "utf8",
        ),
      ).length === desktopBuilt.elements.length,
    );

    // Re-running must reproduce the same analysis byte for byte.
    const first = await readFile(
      path.join(runDir, "pages", "p000001", "interaction-candidates.json"),
      "utf8",
    );
    await analyzeSiteInteractions({
      siteObservationFile: path.join(runDir, "site-observation.json"),
      analyzedAt: FIXED_AT,
    });
    const second = await readFile(
      path.join(runDir, "pages", "p000001", "interaction-candidates.json"),
      "utf8",
    );
    check("§88 re-analyzing the same run rewrites identical bytes", first === second);

    // ----------------------------------------------------- §90 corrupt styleId
    const corruptDir = path.join(tmp, "corrupt");
    await writePage(corruptDir, "p000001", desktopBuilt, mobileBuilt);
    const corruptDom = JSON.parse(
      await readFile(
        path.join(corruptDir, "pages", "p000001", "viewports", "desktop", "dom.json"),
        "utf8",
      ),
    ) as ElementObservation[];
    corruptDom[2].styleId = "s999999";
    await writeFile(
      path.join(corruptDir, "pages", "p000001", "viewports", "desktop", "dom.json"),
      JSON.stringify(corruptDom, null, 2) + "\n",
      "utf8",
    );
    await writeFile(
      path.join(corruptDir, "site-observation.json"),
      JSON.stringify(
        siteManifest([
          sitePage("p000001", `${FIXTURE_ROOT}/page`, "representative", "success"),
        ]),
        null,
        2,
      ) + "\n",
      "utf8",
    );

    let corruptError: unknown;
    try {
      await analyzeSiteInteractions({
        siteObservationFile: path.join(corruptDir, "site-observation.json"),
        analyzedAt: FIXED_AT,
      });
    } catch (err) {
      corruptError = err;
    }
    check(
      "§90 a dangling styleId fails fast with InteractionInputError",
      corruptError instanceof InteractionInputError &&
        corruptError.message.includes("s999999"),
      corruptError instanceof Error ? corruptError.message : String(corruptError),
    );

    // ----------------------------------------------------- §6 element-count guard
    const mismatchDir = path.join(tmp, "mismatch");
    await writePage(mismatchDir, "p000001", desktopBuilt, mobileBuilt);
    const shortened = desktopBuilt.elements.slice(0, -1);
    await writeFile(
      path.join(mismatchDir, "pages", "p000001", "viewports", "desktop", "dom.json"),
      JSON.stringify(shortened, null, 2) + "\n",
      "utf8",
    );
    await writeFile(
      path.join(mismatchDir, "site-observation.json"),
      JSON.stringify(
        siteManifest([
          sitePage("p000001", `${FIXTURE_ROOT}/page`, "representative", "success"),
        ]),
        null,
        2,
      ) + "\n",
      "utf8",
    );
    let mismatchError: unknown;
    try {
      await analyzeSiteInteractions({
        siteObservationFile: path.join(mismatchDir, "site-observation.json"),
        analyzedAt: FIXED_AT,
      });
    } catch (err) {
      mismatchError = err;
    }
    check(
      "§6 dom.json disagreeing with observation.json fails fast",
      mismatchError instanceof InteractionInputError,
      mismatchError instanceof Error ? mismatchError.message : String(mismatchError),
    );
  } finally {
    if (tmp) await rm(tmp, { recursive: true, force: true });
  }

  console.log("");
  console.log(`${checks - failures}/${checks} checks passed`);
  if (failures > 0) {
    console.error(`[smoke:interaction-detector] FAILED — ${failures} check(s) failed`);
    process.exitCode = 1;
  } else {
    console.log("[smoke:interaction-detector] OK");
  }
}

main().catch((err) => {
  console.error(
    "[smoke:interaction-detector] ERROR —",
    err instanceof Error ? err.message : err,
  );
  process.exitCode = 1;
});
