import { createServer, type Server } from "node:http";
import { mkdtemp, readFile, readdir, rm, stat, writeFile } from "node:fs/promises";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { tmpdir } from "node:os";
import path from "node:path";
import { chromium, type Browser } from "playwright";
import {
  PageSelectionSchema,
  SCHEMA_VERSION as SELECTOR_SCHEMA_VERSION,
  type PageSelection,
  type SelectedPage,
  type UnselectedUrl,
} from "../src/selector/types.js";
import {
  MAX_VALIDATION_SAMPLES_PER_SITE,
  MIN_VALIDATION_FAMILY_SIZE,
  SiteObservationSchema,
  loadSiteSelection,
  observeSelectedPages,
  planSitePages,
} from "../src/multi-observer/index.js";
import {
  CROSS_VIEWPORT_STARVATION_RATIO,
  DESKTOP_PROFILE,
  LAYOUT_PROBE_WIDTHS,
  MAX_DOCUMENT_NAV_ATTEMPTS,
  MAX_ENVELOPE_EXTENSION_BRACKETS,
  MAX_PROBE_ATTEMPTS,
  PROBE_DOCUMENT_STARVATION_RATIO,
  MAX_PROBE_WIDTHS_TOTAL,
  MOBILE_LAYOUT_PROBE_WIDTHS,
  NETWORK_IDLE_TIMEOUT_MS,
  OVERLAY_SHAPE,
  PANEL_SHAPE,
  PAGE_STATE_EVIDENCE_ROOT_DEFAULT,
  VIEWPORT_PROFILES,
  SCHEMA_VERSION as OBSERVER_SCHEMA_VERSION,
  SCROLL_REVEAL_OPACITY_THRESHOLD,
  SCROLL_MAX_STEPS,
  SCROLL_MAX_TOTAL_MS,
  SCROLL_NO_PROGRESS_TOLERANCE,
  SCROLL_STEP_FRACTION,
  SCROLL_STEP_SETTLE_MS,
  SETTLE_MS,
  STYLE_WHITELIST,
  ElementObservationSchema,
  LayoutProbeSchema,
  MAX_FAMILY_BISECTION_STEPS,
  MAX_INLINE_STYLE_DECLS,
  MAX_MATCHED_RULES_PER_ELEMENT,
  MAX_MATCHED_RULES_PER_PROPERTY,
  PageObservationSchema,
  type LayoutProbe,
  type LayoutProbeFingerprint,
  type ObservedPage,
  type ProbeWidthProvenance,
} from "../src/observer/types.js";
import {
  autoScrollPrepare,
  mergeInlineStyleTables,
  observerFamilyChangeVerdict,
  probeLayout,
} from "../src/observer/layout-probe.js";
// Responsive Core P0 §C1 — the collector, its config, and the SiteSpec compile.
import { createHash } from "node:crypto";
import { z } from "zod";
import { collectPageInBrowser } from "../src/observer/collect-dom.js";
import { computeInlineStyleProvenance } from "../src/observer/inline-provenance.js";
import { COLLECT_CONFIG } from "../src/observer/observe-page.js";
import { installBrowserNameShim } from "../src/observer/initial-paint-census.js";
import { familyChangeVerdict } from "../src/reconstruction/tree-switch.js";
import { compilePage } from "../src/sitespec/compile-page.js";
import { AssetCatalogBuilder } from "../src/sitespec/asset-catalog.js";
import { StyleCatalogBuilder } from "../src/sitespec/style-catalog.js";
import type { ElementSpecNode } from "../src/sitespec/types.js";
import {
  computeProbeAttachment,
  PROBE_ALIGNMENT_MIN_RATIO,
} from "../src/sitespec/compile-page.js";
import { QA_STYLE_PROPERTIES } from "../src/reconstruction-qa/capture-page.js";
import {
  markInitialPaintCensus,
  normalizePageState,
} from "../src/observer/index.js";
import {
  deriveProbeWidths,
  pickGuaranteedFloor,
  withOperatorWidths,
  type AuthoredMediaConditionTally,
} from "../src/observer/probe-widths.js";
// Task 28.7 B1 — the source-integrity checks observe ONE page directly, so a
// viewport record can be read before it is persisted and without spending
// probe time on a fixture that has no layout to probe.
import { observePageWithBrowser } from "../src/observer/observe-page.js";
// Task 28.7 A1 — the shared navigation detector, pinned as a pure function
// before any browser time is spent on it.
import {
  PageNavigatedDuringScrollError,
  isNavigationDestroyedContextError,
  isSameObservedDocument,
  isScrollNavigationInterruption,
} from "../src/observer/navigation-errors.js";

/**
 * Local deterministic fixture test for the Multi-page Observer (Task 09 §35–37).
 *
 * Two halves, because the orchestrator has two very different kinds of logic:
 *
 *  1. **Planning** — pure, no browser, no network. Page id determinism, input
 *     order independence, sampling policy, the per-site cap, and the fail-fast
 *     input validation are all exercised here, so the expensive half stays small.
 *
 *  2. **Orchestration** — a real Chromium against a tiny in-process HTTP server,
 *     to prove the property that actually matters: ONE page failing does not
 *     take the site run with it. The fixture site is deliberately mixed —
 *     working pages, a family with members to sample, an HTTP 500 page, and a
 *     URL whose connection is destroyed mid-request.
 *
 * No external network, no test framework, no AI.
 */

const HTML = (body: string, head = ""): string =>
  `<!doctype html><html><head><meta charset="utf-8">${head}</head><body>${body}</body></html>`;

/** Responsive Core P0 §C1.4 — served byte-for-byte; see PAGES["/inline-provenance"]. */
const INLINE_PROVENANCE_HTML =
  `<!doctype html><html><head><meta charset="utf-8">` +
  // A real mobile layout viewport, so the mobile probe widths reach the resize listener.
  `<meta name="viewport" content="width=device-width, initial-scale=1">` +
  `<title>inline provenance</title></head><body>` +
  `<main class="page-shell">` +
  `<div id="ssr-static" style="width: 40%; margin: 0 auto">static</div>` +
  `<div id="js-mutated" class="mutated-box" style="width: 100px">mutated</div>` +
  `<div id="js-added" class="added-box">added</div>` +
  `<div id="resize-responsive" class="responsive-box" style="width: 50%">responsive</div>` +
  `<div id="csr-root"></div>` +
  `</main>` +
  `<script>` +
  `document.getElementById("js-mutated").style.width = "250px";` +
  `document.getElementById("js-added").style.maxWidth = "300px";` +
  `(function () { var el = document.getElementById("resize-responsive");` +
  ` function apply() { el.style.width = window.innerWidth < 800 ? "90%" : "50%"; }` +
  ` apply(); window.addEventListener("resize", apply); })();` +
  `(function () { var child = document.createElement("section"); child.id = "csr-child";` +
  ` child.style.paddingLeft = "12px"; child.textContent = "csr";` +
  ` document.getElementById("csr-root").appendChild(child); })();` +
  `</script></body></html>`;

const CHROME = "<header><nav><a href=/>Home</a><a href=/b>B</a></nav></header>";
const FOOT = "<footer><p>© fixture</p></footer>";
const shell = (main: string, head = ""): string =>
  HTML(`${CHROME}<main>${main}</main>${FOOT}`, head);
const paras = (n: number): string =>
  Array.from({ length: n }, (_, i) => `<p>Paragraph ${i} of this fixture page.</p>`).join("");

/**
 * The fixture site. `/a`, `/a2`, `/a3` are one family built from one template
 * with different content lengths — the shape Task 08 grouping produces — so the
 * validation comparison runs on a realistic representative/sample pair rather
 * than two identical documents.
 */
const PAGES: Record<string, string> = {
  "/": shell(`<section><h1>Home</h1><p>Fixture root.</p><ul><li><a href="/a">A</a></li><li><a href="/b">B</a></li></ul></section>`),
  "/a": shell(`<article><h1>Article A</h1>${paras(4)}<img src="/img.svg" alt="a"></article>`),
  "/a2": shell(`<article><h1>Article A2</h1>${paras(6)}<img src="/img.svg" alt="a2"></article>`),
  "/a3": shell(`<article><h1>Article A3</h1>${paras(5)}<img src="/img.svg" alt="a3"></article>`),
  "/b": shell(`<section><h1>B</h1><p>Another page.</p></section>`),
  /*
   * Task 26 generic correction — a page that lazy-mounts an element on the
   * first real scroll. With `--prepare-scroll` the deep observation sees the
   * mounted <aside>; the layout probe must mirror the same scroll or its walk
   * can never align with dom.json (the exact defect measured on a fresh
   * source whose homepage mounts content on scroll).
   */
  "/lazy": shell(
    `<section><h1>Lazy</h1>${paras(60)}</section>` +
      `<script>(function () {` +
      `var mounted = false;` +
      `window.addEventListener("scroll", function () {` +
      `if (mounted || window.scrollY < 100) return;` +
      `mounted = true;` +
      `var aside = document.createElement("aside");` +
      `aside.id = "lazy-mounted";` +
      `var p = document.createElement("p");` +
      `p.textContent = "Mounted by scroll.";` +
      `aside.appendChild(p);` +
      `var main = document.querySelector("main");` +
      `if (main) main.appendChild(aside);` +
      `}, { passive: true });` +
      `})();</script>`,
  ),

  /*
   * TASK 28.7 §27 — THREE FIXTURES THAT SEPARATE THE THREE CASES the DOM-family
   * fingerprint has to tell apart. All three change at the SAME width (800), so
   * a fingerprint that fired on "something happened at 800" rather than on "the
   * family changed at 800" would pass all three and prove nothing.
   *
   *   /family-mount    MOUNTS and UNMOUNTS a variant with matchMedia. The live
   *                    element POPULATION moves. The obvious case.
   *   /family-display  ships BOTH variants in one document and swaps them with
   *                    `display`. The population is FLAT and only the RENDERED
   *                    set moves. This is the case that matters: it is what
   *                    linear.app does, and a population-only fingerprint calls
   *                    it purely CSS-responsive and changes nothing.
   *   /css-fluid       the NEGATIVE CONTROL. One DOM, one rendered set, a real
   *                    and large layout change at the same 800px. Its
   *                    fingerprint must be byte-identical at every width, because
   *                    "this site has no DOM swap" is the correct answer for it
   *                    and inventing one would ship a media query nobody wrote.
   */
  "/family-mount": shell(
    `<section id="shared"><h1>Mount</h1>${paras(3)}</section>` +
      `<script>(function () {` +
      `var mq = window.matchMedia("(min-width: 800px)");` +
      `var host = document.querySelector("main");` +
      `function sync() {` +
      `var wide = document.getElementById("wide-variant");` +
      `if (mq.matches && !wide) {` +
      `wide = document.createElement("div");` +
      `wide.id = "wide-variant";` +
      `for (var i = 0; i < 40; i++) {` +
      `var row = document.createElement("p");` +
      `row.textContent = "Wide row " + i;` +
      `wide.appendChild(row);` +
      `}` +
      `host.appendChild(wide);` +
      `} else if (!mq.matches && wide) { wide.remove(); }` +
      `}` +
      `sync();` +
      `if (mq.addEventListener) mq.addEventListener("change", sync);` +
      `else mq.addListener(sync);` +
      `})();</script>`,
  ),
  "/family-display": shell(
    `<section id="shared"><h1>Display</h1>${paras(3)}</section>` +
      // Deliberately DIFFERENT sizes (20 against 60), because two same-sized
      // variants would exercise the structure hash rather than the rendered
      // count, and the rendered count is what carries linear.app's own shape.
      `<div class="narrow-only">` +
      Array.from({ length: 20 }, (_, i) => `<p>Narrow row ${i}</p>`).join("") +
      `</div>` +
      `<div class="wide-only">` +
      Array.from({ length: 60 }, (_, i) => `<p>Wide row ${i}</p>`).join("") +
      `</div>`,
    `<style>` +
      `.wide-only { display: none; }` +
      `.narrow-only { display: block; }` +
      `@media (min-width: 800px) {` +
      `.wide-only { display: block; }` +
      `.narrow-only { display: none; }` +
      `}` +
      `</style>`,
  ),
  "/css-fluid": shell(
    `<section class="grid">` +
      Array.from({ length: 40 }, (_, i) => `<div class="cell"><p>Cell ${i}</p></div>`).join("") +
      `</section>`,
    `<style>` +
      `.grid { display: flex; flex-wrap: wrap; flex-direction: column; gap: 4px; }` +
      `.cell { width: 100%; font-size: 12px; padding: 2px; }` +
      `@media (min-width: 800px) {` +
      `.grid { flex-direction: row; gap: 24px; }` +
      `.cell { width: 20%; font-size: 20px; padding: 16px; }` +
      `}` +
      `</style>`,
  ),
  /*
   * Responsive Core P0 §C1.6 — a JS family swap at a width NO probe floor
   * samples (850), so only the bisection can locate it. The inline-style
   * element re-writes its `style` on resize (§C1.3 evidence).
   */
  "/family-js-swap": shell(
    `<section id="shared"><h1>JS swap</h1>${paras(3)}</section>` +
      `<div id="resize-styled" style="width: 50%">styled</div>` +
      `<script>(function () {` +
      `var mq = window.matchMedia("(min-width: 850px)");` +
      `var host = document.querySelector("main");` +
      `var styled = document.getElementById("resize-styled");` +
      `function sync() {` +
      `styled.style.width = window.innerWidth < 850 ? "90%" : "50%";` +
      `var wide = document.getElementById("wide-variant");` +
      `if (mq.matches && !wide) {` +
      `wide = document.createElement("div");` +
      `wide.id = "wide-variant";` +
      `for (var i = 0; i < 40; i++) {` +
      `var row = document.createElement("p");` +
      `row.textContent = "Wide row " + i;` +
      `wide.appendChild(row);` +
      `}` +
      `host.appendChild(wide);` +
      `} else if (!mq.matches && wide) { wide.remove(); }` +
      `}` +
      `sync();` +
      `window.addEventListener("resize", sync);` +
      `})();</script>`,
  ),
  /*
   * Responsive Core P0 §C1.4 — the inline-style provenance fixture: an SSR
   * static style, a JS-MUTATED style, a JS-ADDED style, a RESIZE-responsive
   * style, and a CSR-only node the initial document never had.
   */
  "/inline-provenance": INLINE_PROVENANCE_HTML,
  /*
   * Review fix M3 — a GRADUAL family change: one more rendered element every
   * 30px, so every adjacent pair far enough apart reads `changed` while no 1px
   * bracket holds a switch.
   */
  "/family-gradual": shell(
    `<section id="gradual"></section>` +
      `<script>(function () {` +
      `var host = document.getElementById("gradual");` +
      `function sync() { var n = Math.floor(window.innerWidth / 30);` +
      ` while (host.children.length < n) { var d = document.createElement("div"); d.textContent = "g"; host.appendChild(d); }` +
      ` while (host.children.length > n) { host.removeChild(host.lastChild); } }` +
      `sync(); window.addEventListener("resize", sync); })();</script>`,
  ),
  /*
   * Review fix M5 — a carousel-like inline `transform` that changes over TIME
   * at any width; a resize-independent value must never read as responsive.
   */
  "/inline-carousel": shell(
    `<div id="track" style="transform: translateX(0px)">slides</div>` +
      `<script>(function () { var el = document.getElementById("track"); var x = 0;` +
      ` setInterval(function () { x -= 100; el.style.transform = "translateX(" + x + "px)"; }, 120); })();</script>`,
  ),
};

/** Review fix m1 — a NON-UTF-8 document (EUC-KR bytes for 한글), served raw. */
const EUC_KR_DOCUMENT = Buffer.concat([
  Buffer.from(
    `<!doctype html><html><head><meta charset="euc-kr"><title>euc-kr</title></head><body>` +
      `<main><div style="width: 10px">`,
    "latin1",
  ),
  Buffer.from([0xc7, 0xd1, 0xb1, 0xdb]),
  Buffer.from(
    `</div></main><script>document.querySelector("main div").style.width = "20px";</script></body></html>`,
    "latin1",
  ),
]);

/** HTTP 500 — still a real HTML document Chromium renders (see §36 below). */
const SERVER_ERROR_BODY = HTML("<h1>Server error</h1><p>500.</p>");

let checks = 0;
let failures = 0;
function check(name: string, ok: boolean, detail = ""): void {
  checks++;
  if (ok) {
    console.log(`  PASS  ${name}`);
  } else {
    failures++;
    console.log(`  FAIL  ${name}${detail ? ` — ${detail}` : ""}`);
  }
}

function startServer(): Promise<{ server: Server; port: number }> {
  const server = createServer((req, res) => {
    const url = (req.url || "/").split("?")[0];
    const page = PAGES[url];
    if (page) {
      res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
      res.end(page);
      return;
    }
    if (url === "/inline-euc-kr") {
      res.writeHead(200, { "content-type": "text/html; charset=euc-kr" });
      res.end(EUC_KR_DOCUMENT);
      return;
    }
    if (url === "/img.svg") {
      res.writeHead(200, { "content-type": "image/svg+xml" });
      res.end('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 8 8"><rect width="8" height="8"/></svg>');
      return;
    }
    if (url === "/server-error") {
      res.writeHead(500, { "content-type": "text/html; charset=utf-8" });
      res.end(SERVER_ERROR_BODY);
      return;
    }
    if (url === "/error") {
      // Destroy the socket without a response: Chromium reports a genuine
      // navigation failure (net::ERR_EMPTY_RESPONSE / ERR_CONNECTION_RESET),
      // which is what a page-level failure looks like in the wild.
      req.socket.destroy();
      return;
    }
    res.writeHead(404, { "content-type": "text/html; charset=utf-8" });
    res.end(HTML("<h1>Not found</h1>"));
  });
  return new Promise((resolve) => {
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      const port = typeof address === "object" && address ? address.port : 0;
      resolve({ server, port });
    });
  });
}

// ---------------------------------------------------------------------------
// Fixture selection builder — produces a REAL PageSelection (zod-validated), so
// the orchestrator is tested against the exact shape `pnpm select` writes.
// ---------------------------------------------------------------------------

interface FixtureFamily {
  familyId: string;
  representative: string;
  others?: string[];
  familyType?: SelectedPage["familyType"];
}

function buildSelection(rootUrl: string, families: FixtureFamily[]): PageSelection {
  const pages: SelectedPage[] = [];
  const unselected: UnselectedUrl[] = [];

  for (const family of families) {
    const others = family.others ?? [];
    const memberCount = 1 + others.length;
    pages.push({
      url: family.representative,
      familyId: family.familyId,
      familyType: family.familyType ?? (memberCount > 1 ? "sibling-pattern" : "singleton"),
      memberCount,
      reason: memberCount > 1 ? "representative-rule" : "sole-member",
      reasonDetail: "fixture",
    });
    for (const url of others) {
      unselected.push({
        url,
        familyId: family.familyId,
        representativeUrl: family.representative,
        reason: "represented-by-family",
      });
    }
  }

  const verifiedUrlCount = pages.length + unselected.length;
  const largest = Math.max(...pages.map((p) => p.memberCount));
  const selection: PageSelection = {
    schemaVersion: SELECTOR_SCHEMA_VERSION,
    rootUrl,
    sourceVerifiedUrlsFile: "fixture/verified-urls.json",
    sourceVerificationFile: "fixture/verification.json",
    selectedAt: "2026-08-13T00:00:00.000Z",
    verifiedUrlCount,
    familyCount: pages.length,
    selectedCount: pages.length,
    reductionCount: verifiedUrlCount - pages.length,
    reductionRate:
      verifiedUrlCount > 0
        ? Math.round(((verifiedUrlCount - pages.length) / verifiedUrlCount) * 10000) / 10000
        : 0,
    familyTypeCounts: {
      "content-duplicate": 0,
      "sibling-pattern": pages.filter((p) => p.familyType === "sibling-pattern").length,
      "scope-structure": 0,
      singleton: pages.filter((p) => p.familyType === "singleton").length,
    },
    largestFamilySize: largest,
    pages,
    unselected,
  };
  // Fail loudly here rather than letting a malformed fixture "pass" a test.
  return PageSelectionSchema.parse(selection);
}

// ---------------------------------------------------------------------------
// 1. Planning (pure — no browser, no network)
// ---------------------------------------------------------------------------

function testPlanning(): void {
  console.log("Page plan (pure)");

  const root = "https://plan.example";
  const selection = buildSelection(root, [
    { familyId: "f000001", representative: `${root}/` },
    { familyId: "f000002", representative: `${root}/a`, others: [`${root}/a2`, `${root}/a3`] },
    { familyId: "f000003", representative: `${root}/b` },
  ]);

  const plan = planSitePages(selection);
  const ids = plan.pages.map((p) => p.pageId);
  const urls = plan.pages.map((p) => p.url);

  check("page ids are a dense p000001… sequence", ids.join(",") === "p000001,p000002,p000003,p000004");
  check(
    "representatives are numbered in lexical URL order",
    urls.slice(0, 3).join(",") === [`${root}/`, `${root}/a`, `${root}/b`].join(","),
    urls.slice(0, 3).join(","),
  );
  check(
    "the validation sample is appended after every representative",
    plan.pages[3]?.role === "validation-sample" && plan.pages[3]?.url === `${root}/a2`,
    `${plan.pages[3]?.role} ${plan.pages[3]?.url}`,
  );
  check(
    "sample is the URL after the representative in lexical order",
    plan.validationSamples[0]?.sampleUrl === `${root}/a2`,
    plan.validationSamples[0]?.sampleUrl,
  );
  check(
    "sample carries family provenance",
    plan.validationSamples[0]?.familyId === "f000002" &&
      plan.validationSamples[0]?.familyMemberCount === 3 &&
      plan.validationSamples[0]?.representativePageId === "p000002",
  );
  check(
    "every page carries family provenance",
    plan.pages.every((p) => p.familyId !== "" && p.familyMemberCount >= 1),
  );

  // Determinism: shuffling the input file must not move a single id.
  const shuffled = PageSelectionSchema.parse({
    ...selection,
    pages: [...selection.pages].reverse(),
    unselected: [...selection.unselected].reverse(),
  });
  const shuffledPlan = planSitePages(shuffled);
  check(
    "determinism: reversed pages[] + unselected[] → identical plan",
    JSON.stringify(shuffledPlan) === JSON.stringify(plan),
  );

  // Singletons are never sampled.
  const singletonsOnly = buildSelection(root, [
    { familyId: "f000001", representative: `${root}/` },
    { familyId: "f000002", representative: `${root}/b` },
  ]);
  check(
    "singleton families produce no validation samples",
    planSitePages(singletonsOnly).validationSamples.length === 0,
  );

  // A 2-member family is below MIN_VALIDATION_FAMILY_SIZE.
  const pairFamily = buildSelection(root, [
    { familyId: "f000001", representative: `${root}/a`, others: [`${root}/a2`] },
  ]);
  check(
    `families smaller than ${MIN_VALIDATION_FAMILY_SIZE} are not sampled`,
    planSitePages(pairFamily).validationSamples.length === 0,
  );

  // The per-site cap: five eligible families, three samples.
  const manyFamilies = buildSelection(
    root,
    [1, 2, 3, 4, 5].map((n) => ({
      familyId: `f00000${n}`,
      representative: `${root}/f${n}/index`,
      others: [`${root}/f${n}/m2`, `${root}/f${n}/m3`, `${root}/f${n}/m4`],
    })),
  );
  const capped = planSitePages(manyFamilies);
  check(
    `at most ${MAX_VALIDATION_SAMPLES_PER_SITE} validation samples per site`,
    capped.validationSamples.length === MAX_VALIDATION_SAMPLES_PER_SITE,
    String(capped.validationSamples.length),
  );
  check(
    "families skipped by the cap are counted, not hidden",
    capped.samplingSkippedByCap === 2,
    String(capped.samplingSkippedByCap),
  );
  check(
    "cap keeps total pages = representatives + samples",
    capped.pages.length === 5 + MAX_VALIDATION_SAMPLES_PER_SITE,
    String(capped.pages.length),
  );

  // Largest family first, ties broken by familyId.
  const mixedSizes = buildSelection(root, [
    { familyId: "f000001", representative: `${root}/small`, others: [`${root}/small2`, `${root}/small3`] },
    {
      familyId: "f000002",
      representative: `${root}/big`,
      others: [`${root}/big2`, `${root}/big3`, `${root}/big4`, `${root}/big5`],
    },
    { familyId: "f000003", representative: `${root}/mid`, others: [`${root}/mid2`, `${root}/mid3`, `${root}/mid4`] },
  ]);
  const chosen = planSitePages(mixedSizes, { maxValidationSamples: 2 });
  check(
    "sampling prefers the largest families",
    chosen.validationSamples.map((s) => s.familyId).join(",") === "f000002,f000003",
    chosen.validationSamples.map((s) => s.familyId).join(","),
  );

  // Sampling can be turned off without renumbering a single representative.
  const noSamples = planSitePages(selection, { maxValidationSamples: 0 });
  check(
    "disabling sampling does not renumber representatives",
    noSamples.pages.map((p) => `${p.pageId}=${p.url}`).join(",") ===
      plan.pages
        .filter((p) => p.role === "representative")
        .map((p) => `${p.pageId}=${p.url}`)
        .join(","),
  );
}

// ---------------------------------------------------------------------------
// 2. Input validation (fail-fast, before any browser launches)
// ---------------------------------------------------------------------------

async function testInputValidation(): Promise<void> {
  console.log("");
  console.log("Input validation (fail-fast)");

  const root = "https://input.example";
  const valid = buildSelection(root, [
    { familyId: "f000001", representative: `${root}/` },
    { familyId: "f000002", representative: `${root}/a`, others: [`${root}/a2`] },
  ]);

  const dir = await mkdtemp(path.join(tmpdir(), "multi-observer-input-"));
  try {
    const write = async (name: string, value: unknown): Promise<string> => {
      const file = path.join(dir, name);
      await writeFile(file, JSON.stringify(value, null, 2), "utf8");
      return file;
    };

    const okFile = await write("selected-pages.json", valid);
    const loaded = await loadSiteSelection(okFile);
    check("a valid selection loads", loaded.selection.selectedCount === 2);
    check(
      "missing siblings are reported, not fatal",
      loaded.skippedChecks.length === 3 && loaded.families === undefined,
      String(loaded.skippedChecks.length),
    );

    const rejects = async (name: string, value: unknown): Promise<boolean> => {
      const file = await write(`bad-${name}.json`, value);
      try {
        await loadSiteSelection(file);
        return false;
      } catch {
        return true;
      }
    };

    check(
      "rejects a wrong schemaVersion",
      await rejects("schema-version", { ...valid, schemaVersion: 99 }),
    );
    check(
      "rejects selectedCount != pages.length",
      await rejects("selected-count", { ...valid, selectedCount: 5 }),
    );
    check(
      "rejects a duplicate familyId",
      await rejects("dup-family", {
        ...valid,
        pages: [valid.pages[0], { ...valid.pages[1], familyId: valid.pages[0].familyId }],
      }),
    );
    check(
      "rejects a duplicate selected URL",
      await rejects("dup-url", {
        ...valid,
        pages: [valid.pages[0], { ...valid.pages[1], url: valid.pages[0].url }],
      }),
    );
    check(
      "rejects an unselected URL naming an unknown family",
      await rejects("orphan-unselected", {
        ...valid,
        unselected: [{ ...valid.unselected[0], familyId: "f009999" }],
      }),
    );
    check(
      "rejects an unselected URL claiming the wrong representative",
      await rejects("wrong-representative", {
        ...valid,
        unselected: [{ ...valid.unselected[0], representativeUrl: `${root}/nope` }],
      }),
    );
    check(
      "rejects verifiedUrlCount that does not cover selected + unselected",
      await rejects("verified-count", { ...valid, verifiedUrlCount: 99 }),
    );
    check(
      "rejects memberCount that disagrees with the listed members",
      await rejects("member-count", {
        ...valid,
        pages: [valid.pages[0], { ...valid.pages[1], memberCount: 7 }],
        verifiedUrlCount: valid.verifiedUrlCount,
      }),
    );
    check("rejects an empty selection", await rejects("empty", {
      ...valid,
      pages: [],
      unselected: [],
      selectedCount: 0,
      familyCount: 0,
      verifiedUrlCount: 0,
      reductionCount: 0,
      largestFamilySize: 0,
      familyTypeCounts: {
        "content-duplicate": 0,
        "sibling-pattern": 0,
        "scope-structure": 0,
        singleton: 0,
      },
    }));

    // A sibling that IS present and disagrees must be fatal.
    await write("page-families.json", {
      schemaVersion: SELECTOR_SCHEMA_VERSION,
      rootUrl: "https://someone-else.example",
      sourceVerifiedUrlsFile: "fixture/verified-urls.json",
      sourceVerificationFile: "fixture/verification.json",
      builtAt: "2026-08-13T00:00:00.000Z",
      verifiedUrlCount: 3,
      familyCount: 2,
      familyTypeCounts: {
        "content-duplicate": 0,
        "sibling-pattern": 1,
        "scope-structure": 0,
        singleton: 1,
      },
      largestFamilySize: 2,
      families: [],
    });
    let siblingRejected = false;
    try {
      await loadSiteSelection(okFile);
    } catch {
      siblingRejected = true;
    }
    check("rejects a sibling page-families.json from another site", siblingRejected);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

// ---------------------------------------------------------------------------
// 3. Orchestration against a real browser + local server
// ---------------------------------------------------------------------------

async function testOrchestration(): Promise<void> {
  console.log("");
  console.log("Orchestration (real Chromium, local fixture server)");

  const { server, port } = await startServer();
  const root = `http://127.0.0.1:${port}`;
  let browser: Browser | undefined;
  let dir: string | undefined;

  try {
    // /a is a 3-member family (→ one validation sample); /error can never load;
    // /server-error is a real 500 the Observer can still render.
    const selection = buildSelection(root, [
      { familyId: "f000001", representative: `${root}/` },
      { familyId: "f000002", representative: `${root}/a`, others: [`${root}/a2`, `${root}/a3`] },
      { familyId: "f000003", representative: `${root}/b` },
      { familyId: "f000004", representative: `${root}/error` },
      { familyId: "f000005", representative: `${root}/server-error` },
    ]);

    dir = await mkdtemp(path.join(tmpdir(), "multi-observer-run-"));
    browser = await chromium.launch();

    const run = await observeSelectedPages(selection, {
      concurrency: 2,
      sourceSelectedPagesFile: "fixture/selected-pages.json",
      browser,
      runId: "fixture-run",
      runDir: dir,
    });
    const site = run.siteObservation;

    // --- failure isolation: the whole point of the fixture -----------------
    check(
      "6 pages attempted (5 representatives + 1 validation sample)",
      site.stats.requestedPages === 6,
      String(site.stats.requestedPages),
    );
    check("5 pages succeeded", site.stats.completedPages === 5, String(site.stats.completedPages));
    check("1 page failed", site.stats.failedPages === 1, String(site.stats.failedPages));
    check(
      "run status is completed-with-errors, not a thrown run",
      site.status === "completed-with-errors",
      site.status,
    );

    const failed = site.pages.filter((p) => p.status !== "success");
    check(
      "the failure is /error and is classified as a navigation error",
      failed.length === 1 &&
        failed[0].url === `${root}/error` &&
        failed[0].status === "navigation-error",
      failed.map((p) => `${p.url}=${p.status}`).join(","),
    );
    check(
      "the failed page records name/message/phase and no stack trace",
      Boolean(failed[0]?.error?.name && failed[0]?.error?.message) &&
        failed[0]?.error?.phase === "observe" &&
        !failed[0]?.error?.message.includes("\n    at "),
    );
    check(
      "the failed page has no artifact reference",
      failed[0]?.pageObservationFile === undefined && failed[0]?.bytes === undefined,
    );

    // §36, REWRITTEN FOR TASK 28.7 B1. This used to assert that the Observer
    // "sees no status" — a documented blind spot that a live canary then made
    // expensive: a transient upstream 5xx was recorded as a successful
    // observation and reconstructed as the site. The page is still KEPT (losing
    // it would kill the whole reconstruction downstream), and it is now MARKED.
    const serverError = site.pages.find((p) => p.url === `${root}/server-error`);
    check(
      "an HTTP 500 page that renders is still observed and KEPT (never dropped)",
      serverError?.status === "success" &&
        typeof serverError.pageObservationFile === "string",
      `${String(serverError?.status)} / ${String(serverError?.pageObservationFile)}`,
    );
    check(
      "…and it is MARKED as not-the-source-page, with a plain-language limitation",
      serverError?.sourceIntegrity?.suspect === true &&
        serverError.sourceIntegrity.reasons.includes("non-2xx-document") &&
        serverError.sourceIntegrity.limitations.some((l) => l.includes("500")),
      JSON.stringify(serverError?.sourceIntegrity),
    );
    check(
      "…the run counts it apart from failures and refuses to report a plain `completed`",
      site.stats.suspectPages === 1 &&
        site.stats.failedPages === 1 &&
        site.status === "completed-with-errors",
      `${String(site.stats.suspectPages)} suspect / ${String(site.stats.failedPages)} failed`,
    );
    check(
      "…and every HEALTHY page carries no mark at all",
      site.pages
        .filter((p) => p.url !== `${root}/server-error`)
        .every((p) => p.sourceIntegrity === undefined),
      site.pages
        .filter((p) => p.sourceIntegrity)
        .map((p) => p.url)
        .join(","),
    );

    // --- deterministic ids / ordering --------------------------------------
    const ids = site.pages.map((p) => p.pageId);
    check(
      "manifest pages are sorted by pageId regardless of completion order",
      ids.join(",") === [...ids].sort().join(","),
      ids.join(","),
    );
    check(
      "page ids follow lexical URL order for representatives",
      site.pages
        .filter((p) => p.role === "representative")
        .map((p) => p.url)
        .join(",") ===
        [`${root}/`, `${root}/a`, `${root}/b`, `${root}/error`, `${root}/server-error`].join(","),
    );

    // --- artifacts: the Task 05 layout, unchanged --------------------------
    const successful = site.pages.filter((p) => p.status === "success");
    let artifactsOk = true;
    let relativeOnly = true;
    for (const page of successful) {
      const rel = page.pageObservationFile;
      if (!rel || path.isAbsolute(rel) || !rel.startsWith("pages/")) {
        relativeOnly = false;
        continue;
      }
      const observationPath = path.join(dir, rel);
      const observation = JSON.parse(await readFile(observationPath, "utf8"));
      for (const viewport of ["desktop", "mobile"] as const) {
        for (const file of [
          "rendered.html",
          "dom.json",
          "styles.json",
          "assets.json",
          "links.json",
          "frames.json",
          "screenshot.png",
        ]) {
          const filePath = path.join(dir, `pages/${page.pageId}/viewports/${viewport}/${file}`);
          const info = await stat(filePath).catch(() => undefined);
          if (!info || info.size === 0) {
            artifactsOk = false;
            console.log(`        missing/empty: ${page.pageId}/${viewport}/${file}`);
          }
        }
        // Task 04/05 invariant, re-checked through the multi-page path: every
        // styleId in dom.json resolves in that viewport's styles.json.
        const dom = JSON.parse(
          await readFile(path.join(dir, `pages/${page.pageId}/viewports/${viewport}/dom.json`), "utf8"),
        ) as { styleId: string; pseudo?: { before?: { styleId: string }; after?: { styleId: string } } }[];
        const styles = JSON.parse(
          await readFile(path.join(dir, `pages/${page.pageId}/viewports/${viewport}/styles.json`), "utf8"),
        ) as Record<string, unknown>;
        const dangling = dom.filter(
          (e) =>
            !(e.styleId in styles) ||
            (e.pseudo?.before && !(e.pseudo.before.styleId in styles)) ||
            (e.pseudo?.after && !(e.pseudo.after.styleId in styles)),
        ).length;
        if (dangling > 0) {
          artifactsOk = false;
          console.log(`        dangling styleIds: ${page.pageId}/${viewport} = ${dangling}`);
        }
      }
      // A fresh run must write the CURRENT observation schema. (Reading older
      // versions is a separate, deliberately permissive policy — Task 16 §15.)
      if (observation.schemaVersion !== OBSERVER_SCHEMA_VERSION) artifactsOk = false;
      if (observation.viewports.desktop.files.dom !== "viewports/desktop/dom.json") {
        relativeOnly = false;
      }
    }
    check("every successful page has both viewports fully persisted", artifactsOk);
    check("artifact paths are relative to the run directory", relativeOnly);
    check(
      "each page directory keeps the Task 05 single-page layout (schema v3)",
      successful.length === 5,
      String(successful.length),
    );

    // --- validation sampling ------------------------------------------------
    check(
      "one validation sample was taken (only f000002 qualifies)",
      site.validationSamples.length === 1,
      String(site.validationSamples.length),
    );
    const sample = site.validationSamples[0];
    check(
      "the sample pairs /a with /a2",
      sample?.representativeUrl === `${root}/a` && sample?.sampleUrl === `${root}/a2`,
      `${sample?.representativeUrl} vs ${sample?.sampleUrl}`,
    );
    check(
      "the sampled page is stored with role validation-sample",
      site.pages.find((p) => p.pageId === sample?.samplePageId)?.role === "validation-sample",
    );
    check(
      "the comparison is present and covers both viewports",
      Boolean(sample?.comparison?.desktop && sample?.comparison?.mobile),
    );
    check(
      "comparison ratios are finite measurements, not a verdict",
      Boolean(sample?.comparison) &&
        Object.values(sample.comparison!.desktop).every((v) => Number.isFinite(v)) &&
        !("representative" in (sample.comparison as object)),
    );
    check(
      "/a2 has more elements than /a (the fixture's real difference is measured)",
      (sample?.comparison?.desktop.elementCountRatio ?? 0) > 1,
      String(sample?.comparison?.desktop.elementCountRatio),
    );

    // --- coverage & stats ---------------------------------------------------
    const c = site.coverage;
    check("coverage: 7 verified URLs", c.fullObservationPageCount === 7, String(c.fullObservationPageCount));
    check("coverage: 5 families", c.familyCount === 5, String(c.familyCount));
    check(
      "coverage: 4 representatives observed (the failed one is not claimed)",
      c.observedRepresentativeCount === 4,
      String(c.observedRepresentativeCount),
    );
    check(
      "coverage: 6 verified URLs represented (3+1+1+1, /error excluded)",
      c.representedVerifiedUrlCount === 6,
      String(c.representedVerifiedUrlCount),
    );
    check(
      "coverage: reduction counts the validation sample as a real cost",
      c.totalObservedPageCount === 6 && c.observationReductionCount === 1,
      `${c.totalObservedPageCount}/${c.observationReductionCount}`,
    );

    const s = site.stats;
    check(
      "stats: desktop + mobile observation counts match successes",
      s.desktopObservations === 5 && s.mobileObservations === 5,
    );
    check(
      "stats: byte totals are consistent (screenshots + json/html = page bytes)",
      s.screenshotBytes + s.jsonHtmlBytes === s.pageBytes && s.pageBytes > 0,
    );
    check(
      "stats: average page size is the measured mean",
      s.averageBytesPerObservedPage === Math.round(s.pageBytes / s.completedPages),
    );
    check(
      "stats: per-page timestamps differ (no atomic-snapshot claim)",
      new Set(successful.map((p) => p.startedAt)).size > 1,
    );

    // --- persisted manifest: zod round-trip + real byte size ---------------
    const raw = await readFile(run.manifestPath, "utf8");
    const reloaded = SiteObservationSchema.safeParse(JSON.parse(raw));
    check("site-observation.json passes Zod after reload", reloaded.success);
    check(
      "the manifest records its own true byte size",
      reloaded.success &&
        reloaded.data.stats.siteObservationJsonBytes === Buffer.byteLength(raw, "utf8"),
    );
    check(
      "the manifest embeds no DOM/style bulk data",
      !raw.includes('"styleId"') && !raw.includes('"boundingBox"'),
    );
    check(
      "the manifest holds no absolute local path",
      !raw.includes(dir) && !raw.includes("/Users/"),
    );
  } finally {
    if (browser) await browser.close();
    server.close();
    if (dir) await rm(dir, { recursive: true, force: true });
  }
}

// ---------------------------------------------------------------------------
// 4. Prepare-scroll ↔ layout-probe parity (Task 26 generic correction)
// ---------------------------------------------------------------------------

async function testPrepareScrollProbeParity(): Promise<void> {
  console.log("");
  console.log("Prepare-scroll ↔ layout-probe parity (real Chromium, /lazy fixture)");

  const { server, port } = await startServer();
  const root = `http://127.0.0.1:${port}`;
  let browser: Browser | undefined;
  let dir: string | undefined;

  try {
    const selection = buildSelection(root, [
      { familyId: "f000001", representative: `${root}/lazy` },
    ]);
    dir = await mkdtemp(path.join(tmpdir(), "multi-observer-lazy-"));
    browser = await chromium.launch();

    const run = await observeSelectedPages(selection, {
      concurrency: 1,
      prepareScroll: true,
      sourceSelectedPagesFile: "fixture/selected-pages.json",
      browser,
      runId: "fixture-lazy-run",
      runDir: dir,
    });
    const page = run.siteObservation.pages[0]!;
    check("the lazy page observed successfully", page.status === "success", page.status);

    const dom = JSON.parse(
      await readFile(
        path.join(dir, `pages/${page.pageId}/viewports/desktop/dom.json`),
        "utf8",
      ),
    ) as { tagName: string }[];
    const domTags = dom.map((e) => e.tagName.toLowerCase());
    check(
      "prepare-scroll mounted the lazy element into the deep observation",
      domTags.includes("aside"),
    );

    const probe = JSON.parse(
      await readFile(path.join(dir, `pages/${page.pageId}/layout-probe.json`), "utf8"),
    ) as { tags: string[] };
    const probeTags = probe.tags.map((t) => t.toLowerCase());
    check(
      "…and into the layout probe (the probe mirrors the observation's scroll)",
      probeTags.includes("aside"),
    );
    check(
      "…so the probe walk aligns with dom.json exactly",
      probeTags.length === domTags.length &&
        probeTags.every((tag, i) => tag === domTags[i]),
      `probe ${probeTags.length} tag(s) vs dom ${domTags.length}`,
    );
  } finally {
    if (browser) await browser.close();
    server.close();
    if (dir) await rm(dir, { recursive: true, force: true });
  }
}

// ---------------------------------------------------------------------------
// 5. CSS TRUTH RECOVERY (Task 28.6 C1.2 — permanent regression coverage)
//
// Wave 1 taught the collector to recover a CORS-blocked stylesheet from the
// response body Chromium had already downloaded, and shipped with ZERO repo
// checks. These four invariants are the ones whose breakage is SILENT — the
// artifact still validates, it is simply wrong:
//
//   (a) CASCADE POSITION  a recovered sheet's declaration must land where the
//       BLOCKED sheet sat, not appended after everything. Order-sensitive by
//       construction: a later same-origin sheet must still out-rank it.
//   (b) NON-ADOPTION      the recovery parses into a constructed sheet that is
//       never adopted, so `document.styleSheets` / `adoptedStyleSheets` are
//       unchanged, nothing is injected into the document, the recovered sheet
//       does not start PAINTING, and it lands only on elements it matches.
//   (c) PROBE IDENTITY    `layout-probe-mobile.json` must walk the MOBILE tree.
//       On a page whose DOM diverges by pointer type, a probe that silently
//       walked the desktop tree would mis-attach every future mobile layout
//       rule and nothing in the repo would notice.
//   (d) SHEET-LEVEL MEDIA a `media="print"` sheet's declarations must carry
//       that condition. Recovering a blocked `media="print"` sheet and then
//       recording it unconditionally is a FABRICATED value, worse than the
//       missing one it replaced (Task 28.6 C1.1).
//
// Two origins, because a same-origin sheet is never CSSOM-blocked: the CSS
// origin sends no `Access-Control-Allow-Origin`, which is exactly the trap the
// pilot sites set.
// ---------------------------------------------------------------------------

/** Stylesheets served from the SECOND origin, deliberately without CORS headers. */
const CSS_TRUTH_SHEETS: Record<string, string> = {
  // Sits between two same-origin sheets that set the same property.
  "/cross.css": ".order-el { padding-top: 2px; }\n.fetched-el { width: 333px; }\n",
  // CORS-blocked AND `media="print"`: unconditional here would be fabrication.
  "/print-only.css": ".print-canary { width: 987px; color: rgb(1, 2, 3); }\n",
};

function cssTruthPage(cssOrigin: string): string {
  return (
    `<!doctype html><html lang="en"><head><meta charset="utf-8">` +
    `<title>CSS truth fixture</title>` +
    `<style id="sheet-a">.order-el { padding-top: 1px; }</style>` +
    `<link rel="stylesheet" href="${cssOrigin}/cross.css">` +
    `<link rel="stylesheet" media="print" href="${cssOrigin}/print-only.css">` +
    `<style media="print" id="sheet-print">.print-canary2 { height: 654px; }</style>` +
    `<style media="screen" id="sheet-screen">.screen-canary { height: 321px; }</style>` +
    `<style id="sheet-c">.order-el { padding-top: 3px; }</style>` +
    `</head><body>` +
    `<div class="order-el">order</div>` +
    `<div class="fetched-el">fetched</div>` +
    `<div class="not-fetched-el">not fetched</div>` +
    `<div class="print-canary">print canary (cors)</div>` +
    `<div class="print-canary2">print canary (same origin)</div>` +
    `<div class="screen-canary">screen canary</div>` +
    `<pre id="probe-report">init</pre>` +
    `<div id="ua-branch"></div>` +
    // DOM divergence by pointer type, so a probe walk reveals WHICH tree it saw.
    `<script>(function () {` +
    `var coarse = window.matchMedia("(pointer: coarse)").matches;` +
    `var host = document.getElementById("ua-branch");` +
    `var n = coarse ? 3 : 1;` +
    `for (var i = 0; i < n; i++) {` +
    `var el = document.createElement(coarse ? "aside" : "span");` +
    `el.textContent = coarse ? "mobile" : "desktop";` +
    `host.appendChild(el);` +
    `}` +
    `})();</script>` +
    // Live injection detector: read back out of rendered.html AFTER the collect
    // pass, so it reports the document as the collector left it.
    `<script>(function () {` +
    `var added = 0;` +
    `new MutationObserver(function (records) {` +
    `for (var r of records) {` +
    `for (var n of r.addedNodes) {` +
    `if (n.nodeType === 1 && (n.tagName === "STYLE" || n.tagName === "LINK")) added++;` +
    `}}}).observe(document.documentElement, { childList: true, subtree: true });` +
    `var report = document.getElementById("probe-report");` +
    `setInterval(function () {` +
    `var canary = getComputedStyle(document.querySelector(".print-canary"));` +
    `report.textContent = "sheets=" + document.styleSheets.length +` +
    `" adopted=" + (document.adoptedStyleSheets ? document.adoptedStyleSheets.length : -1) +` +
    `" added=" + added +` +
    `" printCanaryWidth=" + canary.width;` +
    `}, 40);` +
    `})();</script>` +
    `</body></html>`
  );
}

/** Origin A (the page) + origin B (the stylesheets, no CORS header). */
function startCssTruthServers(): Promise<{
  pageServer: Server;
  cssServer: Server;
  pageOrigin: string;
}> {
  return new Promise((resolve) => {
    const cssServer = createServer((req, res) => {
      const url = (req.url || "/").split("?")[0]!;
      const body = CSS_TRUTH_SHEETS[url];
      if (body === undefined) {
        res.writeHead(404, { "content-type": "text/plain" });
        res.end("not found");
        return;
      }
      // NO Access-Control-Allow-Origin — this is what makes `cssRules` throw.
      res.writeHead(200, { "content-type": "text/css", "cache-control": "no-store" });
      res.end(body);
    });
    cssServer.listen(0, "127.0.0.1", () => {
      const cssAddress = cssServer.address();
      const cssPort =
        typeof cssAddress === "object" && cssAddress ? cssAddress.port : 0;
      const cssOrigin = `http://127.0.0.1:${cssPort}`;
      const html = cssTruthPage(cssOrigin);
      const pageServer = createServer((_req, res) => {
        res.writeHead(200, {
          "content-type": "text/html; charset=utf-8",
          "cache-control": "no-store",
        });
        res.end(html);
      });
      pageServer.listen(0, "127.0.0.1", () => {
        const pageAddress = pageServer.address();
        const pagePort =
          typeof pageAddress === "object" && pageAddress ? pageAddress.port : 0;
        resolve({
          pageServer,
          cssServer,
          pageOrigin: `http://127.0.0.1:${pagePort}`,
        });
      });
    });
  });
}

interface FixtureLayoutRule {
  property: string;
  value: string;
  media?: string;
  origin?: string;
  selector: string;
}
interface FixtureElement {
  tagName: string;
  attributes?: Record<string, string>;
  layoutRules?: FixtureLayoutRule[];
}

async function testCssTruthRecovery(): Promise<void> {
  console.log("");
  console.log(
    "CSS truth recovery (real Chromium, two origins — cascade position, non-adoption, probe identity, sheet media)",
  );

  const { pageServer, cssServer, pageOrigin } = await startCssTruthServers();
  let browser: Browser | undefined;
  let dir: string | undefined;

  try {
    const selection = buildSelection(pageOrigin, [
      { familyId: "f000001", representative: `${pageOrigin}/css-truth` },
    ]);
    dir = await mkdtemp(path.join(tmpdir(), "multi-observer-css-truth-"));
    browser = await chromium.launch();

    const run = await observeSelectedPages(selection, {
      concurrency: 1,
      sourceSelectedPagesFile: "fixture/selected-pages.json",
      browser,
      runId: "fixture-css-truth-run",
      runDir: dir,
    });
    const page = run.siteObservation.pages[0]!;
    check(
      "the two-origin CSS-truth page observed successfully",
      page.status === "success",
      page.status,
    );

    const pageDir = path.join(dir, `pages/${page.pageId}`);
    const readJson = async <T>(rel: string): Promise<T> =>
      JSON.parse(await readFile(path.join(pageDir, rel), "utf8")) as T;

    const observation = await readJson<{
      viewports: {
        desktop: {
          stylesheetCoverage?: {
            cssomBlocked: number;
            fallbackRecovered: number;
            fallbackMissed: number;
            sheetsMediaScoped?: number;
            sheetsMediaTrivial?: number;
            bytesBridged?: number;
          };
        };
      };
    }>("observation.json");
    const coverage = observation.viewports.desktop.stylesheetCoverage;
    check(
      "both cross-origin sheets are CSSOM-blocked and both are recovered",
      coverage !== undefined &&
        coverage.cssomBlocked === 2 &&
        coverage.fallbackRecovered === 2 &&
        coverage.fallbackMissed === 0,
      JSON.stringify(coverage),
    );

    const desktopEls = await readJson<FixtureElement[]>(
      "viewports/desktop/dom.json",
    );
    const mobileEls = await readJson<FixtureElement[]>("viewports/mobile/dom.json");
    const byClass = (els: FixtureElement[], cls: string): FixtureElement | undefined =>
      els.find((e) => (e.attributes?.class ?? "").split(/\s+/).includes(cls));
    const rulesOf = (cls: string): FixtureLayoutRule[] =>
      byClass(desktopEls, cls)?.layoutRules ?? [];
    const findRule = (
      cls: string,
      property: string,
      value: string,
    ): FixtureLayoutRule | undefined =>
      rulesOf(cls).find((r) => r.property === property && r.value === value);

    // --- (a) cascade POSITION ---------------------------------------------
    const order = rulesOf("order-el")
      .filter((r) => r.property === "padding-top")
      .map((r) => `${r.value}/${r.origin ?? "cssom"}`);
    check(
      "a recovered sheet lands at the BLOCKED sheet's cascade position, not appended",
      order.join(",") === "1px/cssom,2px/fetched,3px/cssom",
      order.join(","),
    );

    // --- (b) NON-ADOPTION --------------------------------------------------
    const rendered = await readFile(
      path.join(pageDir, "viewports/desktop/rendered.html"),
      "utf8",
    );
    const report = /<pre id="probe-report">([^<]*)<\/pre>/.exec(rendered)?.[1] ?? "";
    check(
      "collect adopts nothing: document.adoptedStyleSheets is still empty",
      /adopted=0/.test(report),
      report,
    );
    // Derived from the fixture markup, so the invariant is "unchanged", never a
    // number someone has to remember to update.
    const fixtureHtml = cssTruthPage("http://example.invalid");
    const declaredSheetCount =
      (fixtureHtml.match(/<style[ >]/g) ?? []).length +
      (fixtureHtml.match(/<link rel="stylesheet"/g) ?? []).length;
    check(
      "collect injects nothing: document.styleSheets count and STYLE/LINK count unchanged",
      new RegExp(`sheets=${declaredSheetCount}\\b`).test(report) &&
        /added=0/.test(report),
      `${report} (fixture declares ${declaredSheetCount} sheet(s))`,
    );
    check(
      "a recovered media=print sheet never starts PAINTING (print-canary stays auto-width)",
      report !== "" && !/printCanaryWidth=987px/.test(report),
      report,
    );
    check(
      "a recovered declaration lands only on the element it matches",
      findRule("fetched-el", "width", "333px") !== undefined &&
        findRule("not-fetched-el", "width", "333px") === undefined,
      `${JSON.stringify(rulesOf("fetched-el"))} / ${JSON.stringify(rulesOf("not-fetched-el"))}`,
    );

    // --- (c) MOBILE PROBE ELEMENT IDENTITY ---------------------------------
    const desktopProbe = await readJson<{ tags: string[] }>("layout-probe.json");
    const mobileProbe = await readJson<{ tags: string[]; profile?: { id: string } }>(
      "layout-probe-mobile.json",
    );
    const tagsOf = (els: FixtureElement[]): string[] =>
      els.map((e) => e.tagName.toLowerCase());
    const desktopTags = tagsOf(desktopEls);
    const mobileTags = tagsOf(mobileEls);
    check(
      "the fixture's mobile DOM really differs from its desktop DOM (the test discriminates)",
      desktopTags.join(",") !== mobileTags.join(","),
      `${desktopTags.length} vs ${mobileTags.length}`,
    );
    check(
      "layout-probe-mobile.json walks the MOBILE tree (tags equal mobile dom.json)",
      mobileProbe.tags.map((t) => t.toLowerCase()).join(",") === mobileTags.join(","),
      `${mobileProbe.tags.length} probe tag(s) vs ${mobileTags.length} mobile dom tag(s)`,
    );
    check(
      "…and NOT the desktop tree",
      mobileProbe.tags.map((t) => t.toLowerCase()).join(",") !== desktopTags.join(","),
    );
    check(
      "layout-probe.json still walks the DESKTOP tree",
      desktopProbe.tags.map((t) => t.toLowerCase()).join(",") === desktopTags.join(","),
      `${desktopProbe.tags.length} probe tag(s) vs ${desktopTags.length} desktop dom tag(s)`,
    );
    check(
      "the mobile probe is tagged with the mobile profile",
      mobileProbe.profile?.id === "mobile",
      JSON.stringify(mobileProbe.profile),
    );

    // --- (d) SHEET-LEVEL media (Task 28.6 C1.1) ----------------------------
    const printCors = findRule("print-canary", "width", "987px");
    check(
      "a RECOVERED media=print sheet's declaration carries media:print, never unconditional",
      printCors !== undefined &&
        printCors.origin === "fetched" &&
        (printCors.media ?? "").toLowerCase().includes("print"),
      JSON.stringify(rulesOf("print-canary")),
    );
    const printSameOrigin = findRule("print-canary2", "height", "654px");
    check(
      "a same-origin media=print sheet's declaration carries media:print too",
      printSameOrigin !== undefined &&
        (printSameOrigin.media ?? "").toLowerCase().includes("print"),
      JSON.stringify(rulesOf("print-canary2")),
    );
    const screenCanary = findRule("screen-canary", "height", "321px");
    check(
      "media=screen is NOT recorded as a condition (it applies to every screen artifact)",
      screenCanary !== undefined && screenCanary.media === undefined,
      JSON.stringify(rulesOf("screen-canary")),
    );
    check(
      "the two media-scoped sheets are COUNTED in stylesheetCoverage.sheetsMediaScoped",
      coverage?.sheetsMediaScoped === 2,
      String(coverage?.sheetsMediaScoped),
    );
    check(
      "a media=screen sheet is READ and classified, not silently ignored (sheetsMediaTrivial)",
      coverage?.sheetsMediaTrivial === 1,
      String(coverage?.sheetsMediaTrivial),
    );
    check(
      "bytesBridged reports the payload that actually crossed into the page",
      typeof coverage?.bytesBridged === "number" &&
        coverage.bytesBridged > 0 &&
        coverage.bytesBridged <=
          Buffer.byteLength(
            CSS_TRUTH_SHEETS["/cross.css"]! + CSS_TRUTH_SHEETS["/print-only.css"]!,
            "utf8",
          ),
      String(coverage?.bytesBridged),
    );
  } finally {
    if (browser) await browser.close();
    pageServer.close();
    cssServer.close();
    if (dir) await rm(dir, { recursive: true, force: true });
  }
}

// ---------------------------------------------------------------------------
// 5b. REDIRECTED STYLESHEET RECOVERY (Task 28.6 W6 O1 — permanent regression
// coverage)
//
// THE DEFECT. `observe-page.ts` keyed a captured stylesheet body by
// `response.url()` and `response.request().url()` only — never by walking
// `request().redirectedFrom()`. A 302'd sheet is downloaded under the
// POST-redirect URL, but the CSSOM reports `CSSStyleSheet.href` as the
// PRE-redirect URL the document asked for, so the fallback lookup missed a
// body that was captured and sitting in memory the whole time. MEASURED on
// seoultone.kr: `fallbackMissed: 1` and `sheetsBodyUnavailable: 1` on 28 of 28
// observations, from one `unpkg.com/swiper/...` 302; re-observing the same
// live page with the fix (`data/seoultone.kr/site-observations/
// 2026-09-02T22-22-43-798Z`) gives `fallbackMissed: 0`.
//
// This fixture reproduces the SHAPE of the defect locally and permanently: one
// plain CORS-blocked sheet (contrast — recovers even without the fix) and one
// CORS-blocked sheet reached only via a 302, so a regression here fails on a
// deterministic 4-response fixture instead of only being visible against a
// live third-party redirect that could change or disappear.
// ---------------------------------------------------------------------------

const REDIRECT_TRUTH_SHEETS: Record<string, string> = {
  "/plain.css": ".plain-canary { width: 111px; }\n",
  "/redirect-target.css": ".redirect-canary { width: 222px; }\n",
};

function startRedirectTruthServers(): Promise<{
  pageServer: Server;
  cssServer: Server;
  pageOrigin: string;
}> {
  return new Promise((resolve) => {
    const cssServer = createServer((req, res) => {
      const url = (req.url || "/").split("?")[0]!;
      if (url === "/redirect.css") {
        // A 302 to another path on the SAME (still cross-origin, no-CORS)
        // server — the CSSOM will report `href` as `/redirect.css`, the
        // response Chromium actually downloads answers to
        // `/redirect-target.css`, and O1 is the bridge between the two.
        res.writeHead(302, { location: "/redirect-target.css" });
        res.end();
        return;
      }
      const body = REDIRECT_TRUTH_SHEETS[url];
      if (body === undefined) {
        res.writeHead(404, { "content-type": "text/plain" });
        res.end("not found");
        return;
      }
      res.writeHead(200, { "content-type": "text/css", "cache-control": "no-store" });
      res.end(body);
    });
    cssServer.listen(0, "127.0.0.1", () => {
      const cssAddress = cssServer.address();
      const cssPort = typeof cssAddress === "object" && cssAddress ? cssAddress.port : 0;
      const cssOrigin = `http://127.0.0.1:${cssPort}`;
      const html =
        `<!doctype html><html lang="en"><head><meta charset="utf-8">` +
        `<title>Redirected stylesheet fixture</title>` +
        `<link rel="stylesheet" href="${cssOrigin}/plain.css">` +
        `<link rel="stylesheet" href="${cssOrigin}/redirect.css">` +
        `</head><body>` +
        `<div class="plain-canary">plain</div>` +
        `<div class="redirect-canary">redirected</div>` +
        `</body></html>`;
      const pageServer = createServer((_req, res) => {
        res.writeHead(200, {
          "content-type": "text/html; charset=utf-8",
          "cache-control": "no-store",
        });
        res.end(html);
      });
      pageServer.listen(0, "127.0.0.1", () => {
        const pageAddress = pageServer.address();
        const pagePort = typeof pageAddress === "object" && pageAddress ? pageAddress.port : 0;
        resolve({ pageServer, cssServer, pageOrigin: `http://127.0.0.1:${pagePort}` });
      });
    });
  });
}

async function testRedirectedStylesheetRecovery(): Promise<void> {
  console.log("");
  console.log(
    "Redirected stylesheet recovery (real Chromium — O1: a 302'd CORS-blocked sheet)",
  );

  const { pageServer, cssServer, pageOrigin } = await startRedirectTruthServers();
  let browser: Browser | undefined;
  let dir: string | undefined;

  try {
    const selection = buildSelection(pageOrigin, [
      { familyId: "f000001", representative: `${pageOrigin}/redirect-truth` },
    ]);
    dir = await mkdtemp(path.join(tmpdir(), "multi-observer-redirect-truth-"));
    browser = await chromium.launch();

    const run = await observeSelectedPages(selection, {
      concurrency: 1,
      sourceSelectedPagesFile: "fixture/selected-pages.json",
      browser,
      runId: "fixture-redirect-truth-run",
      runDir: dir,
    });
    const page = run.siteObservation.pages[0]!;
    check(
      "the redirected-stylesheet fixture observed successfully",
      page.status === "success",
      page.status,
    );

    const pageDir = path.join(dir, `pages/${page.pageId}`);
    const readJson = async <T>(rel: string): Promise<T> =>
      JSON.parse(await readFile(path.join(pageDir, rel), "utf8")) as T;
    interface RedirectCoverageFields {
      cssomBlocked: number;
      fallbackRecovered: number;
      fallbackMissed: number;
      sheetsRedirectResponses: number;
      sheetsBodyUnavailable: number;
      sheetsRedirectAliasesKeyed: number;
      sheetsRedirectChainsTruncated: number;
    }
    const observation = await readJson<{
      viewports: { desktop: { stylesheetCoverage?: RedirectCoverageFields } };
    }>("observation.json");
    const coverage = observation.viewports.desktop.stylesheetCoverage;

    check(
      "O1: BOTH cross-origin sheets are blocked and BOTH recover — the redirected one is no longer missed",
      coverage?.cssomBlocked === 2 &&
        coverage.fallbackRecovered === 2 &&
        coverage.fallbackMissed === 0,
      JSON.stringify(coverage && {
        cssomBlocked: coverage.cssomBlocked,
        fallbackRecovered: coverage.fallbackRecovered,
        fallbackMissed: coverage.fallbackMissed,
      }),
    );
    check(
      "O1: the 302 is counted as a redirect response, never as a missing body",
      coverage?.sheetsRedirectResponses === 1 && coverage.sheetsBodyUnavailable === 0,
      `redirectResponses=${String(coverage?.sheetsRedirectResponses)} bodyUnavailable=${String(coverage?.sheetsBodyUnavailable)}`,
    );
    check(
      "O1: the captured body is keyed onto the PRE-redirect href by walking redirectedFrom()",
      coverage?.sheetsRedirectAliasesKeyed === 1 && coverage.sheetsRedirectChainsTruncated === 0,
      `aliasesKeyed=${String(coverage?.sheetsRedirectAliasesKeyed)} chainsTruncated=${String(coverage?.sheetsRedirectChainsTruncated)}`,
    );

    const dom = await readJson<FixtureElement[]>("viewports/desktop/dom.json");
    const redirectEl = dom.find((e) =>
      (e.attributes?.class ?? "").split(/\s+/).includes("redirect-canary"),
    );
    const rule = redirectEl?.layoutRules?.find((r) => r.property === "width");
    check(
      "O1: the RECOVERED declaration is the redirect TARGET's own content, not lost and not garbage",
      rule?.value === "222px" && rule.origin === "fetched",
      JSON.stringify(redirectEl?.layoutRules),
    );
  } finally {
    if (browser) await browser.close();
    pageServer.close();
    cssServer.close();
    if (dir) await rm(dir, { recursive: true, force: true });
  }
}

// ---------------------------------------------------------------------------
// 5c. @import COVERAGE ACROSS BOTH RESOLUTION PATHS (Task 28.6 W6 O2 —
// permanent regression coverage)
//
// THE DEFECT. `stylesheetCoverage.importsExpanded` / `importsUnresolved` read
// as if they covered every `@import` on the page. They cover only the Node
// text-inlining path (imports INSIDE a sheet the CSSOM refused, expanded
// before the sheet is handed to the page) — never the in-page CSSOM walk's OWN
// `@import` handling (`importRulesVisited` / `Followed` / `Recovered` /
// `Unresolved`), which is a SEPARATE mechanism for imports inside a sheet the
// page CAN read natively. MEASURED on gs.severance.healthcare:
// `importsExpanded`/`importsUnresolved` both read 0 while `importRulesVisited`
// is 5 and 93.9% of the page's CSS lives behind an `@import` the OLD counters
// said nothing about. Worse, an unresolvable same-origin `@import` fell
// through `if (imported) { visit(...) } continue;` with no `else` — a bare
// skip, uncounted, so `importRulesUnresolved: 0` was never evidence that
// nothing went unresolved.
//
// This fixture exercises FOUR distinct import shapes in one page load so a
// regression in any one counter, or in the `importsResolvedTotal` /
// `importsUnresolvedTotal` sums, fails on a specific, named check:
//
//   (a) a CORS-blocked top-level sheet whose OWN text `@import`s a second
//       CORS-blocked sheet that WAS captured on the wire  → Node path,
//       `importsExpanded`.
//   (b) that same blocked sheet ALSO carries a syntactically broken
//       `@import` (an unterminated string) that no capture could fix →
//       Node path, `importsUnresolved`.
//   (c) a native, READABLE (same-origin) `<style>` that `@import`s a
//       CORS-blocked sheet ALSO linked at the top level (so its body is
//       recoverable) → in-page path, `importRulesFollowed` +
//       `importRulesRecovered`.
//   (d) a native, READABLE `<style>` that `@import`s a CORS-blocked sheet
//       reachable ONLY through this one `@import` (never linked at the top
//       level, so never in the recovery set) → in-page path,
//       `importRulesUnresolved` — the exact shape of the silent skip.
// ---------------------------------------------------------------------------

const IMPORT_COVERAGE_SHEETS: Record<string, string> = {
  "/shared.css": ".shared-canary { width: 41px; }\n",
  "/import-outer.css":
    '@import url("/import-inner.css");\n' +
    '@import "broken;\n' + // (b): unterminated string — parseImportStatement returns null
    ".outer-canary { width: 42px; }\n",
  "/import-inner.css": ".inner-canary { width: 43px; }\n",
  // (d): reachable ONLY via @import — never a top-level <link>.
  "/native-target.css": ".unresolved-target-canary { width: 44px; }\n",
};

function startImportCoverageServers(): Promise<{
  pageServer: Server;
  cssServer: Server;
  pageOrigin: string;
}> {
  return new Promise((resolve) => {
    const cssServer = createServer((req, res) => {
      const url = (req.url || "/").split("?")[0]!;
      const body = IMPORT_COVERAGE_SHEETS[url];
      if (body === undefined) {
        res.writeHead(404, { "content-type": "text/plain" });
        res.end("not found");
        return;
      }
      res.writeHead(200, { "content-type": "text/css", "cache-control": "no-store" });
      res.end(body);
    });
    cssServer.listen(0, "127.0.0.1", () => {
      const cssAddress = cssServer.address();
      const cssPort = typeof cssAddress === "object" && cssAddress ? cssAddress.port : 0;
      const cssOrigin = `http://127.0.0.1:${cssPort}`;
      const html =
        `<!doctype html><html lang="en"><head><meta charset="utf-8">` +
        `<title>Import coverage fixture</title>` +
        `<link rel="stylesheet" href="${cssOrigin}/shared.css">` +
        `<link rel="stylesheet" href="${cssOrigin}/import-outer.css">` +
        `<style>@import url("${cssOrigin}/shared.css");</style>` +
        `<style>@import url("${cssOrigin}/native-target.css");</style>` +
        `</head><body>` +
        `<div class="shared-canary">a</div>` +
        `<div class="outer-canary">b</div>` +
        `<div class="inner-canary">c</div>` +
        `<div class="unresolved-target-canary">d</div>` +
        `</body></html>`;
      const pageServer = createServer((_req, res) => {
        res.writeHead(200, {
          "content-type": "text/html; charset=utf-8",
          "cache-control": "no-store",
        });
        res.end(html);
      });
      pageServer.listen(0, "127.0.0.1", () => {
        const pageAddress = pageServer.address();
        const pagePort = typeof pageAddress === "object" && pageAddress ? pageAddress.port : 0;
        resolve({ pageServer, cssServer, pageOrigin: `http://127.0.0.1:${pagePort}` });
      });
    });
  });
}

interface ImportCoverageFields {
  cssomBlocked: number;
  fallbackRecovered: number;
  fallbackMissed: number;
  importsExpanded: number;
  importsUnresolved: number;
  importRulesVisited: number;
  importRulesFollowed: number;
  importRulesRecovered: number;
  importRulesUnresolved: number;
  importsResolvedTotal: number;
  importsUnresolvedTotal: number;
}

async function testImportCoverageBothPaths(): Promise<void> {
  console.log("");
  console.log(
    "@import coverage across both resolution paths (real Chromium — O2: Node text-inlining + in-page CSSOM walk)",
  );

  const { pageServer, cssServer, pageOrigin } = await startImportCoverageServers();
  let browser: Browser | undefined;
  let dir: string | undefined;

  try {
    const selection = buildSelection(pageOrigin, [
      { familyId: "f000001", representative: `${pageOrigin}/import-coverage` },
    ]);
    dir = await mkdtemp(path.join(tmpdir(), "multi-observer-import-coverage-"));
    browser = await chromium.launch();

    const run = await observeSelectedPages(selection, {
      concurrency: 1,
      sourceSelectedPagesFile: "fixture/selected-pages.json",
      browser,
      runId: "fixture-import-coverage-run",
      runDir: dir,
    });
    const page = run.siteObservation.pages[0]!;
    check(
      "the import-coverage fixture observed successfully",
      page.status === "success",
      page.status,
    );

    const pageDir = path.join(dir, `pages/${page.pageId}`);
    const observation = JSON.parse(
      await readFile(path.join(pageDir, "observation.json"), "utf8"),
    ) as { viewports: { desktop: { stylesheetCoverage?: ImportCoverageFields } } };
    const coverage = observation.viewports.desktop.stylesheetCoverage;

    check(
      "O2 (a): the NODE path expands the captured, resolvable nested @import",
      coverage?.importsExpanded === 1,
      String(coverage?.importsExpanded),
    );
    check(
      "O2 (b): …and counts the syntactically broken @import it could not fix, in the SAME counter family",
      coverage?.importsUnresolved === 1,
      String(coverage?.importsUnresolved),
    );
    check(
      "O2 (c): the IN-PAGE walk follows a readable sheet's @import to a recoverable target",
      coverage?.importRulesFollowed === 1 && coverage.importRulesRecovered === 1,
      `followed=${String(coverage?.importRulesFollowed)} recovered=${String(coverage?.importRulesRecovered)}`,
    );
    check(
      "O2 (d): …and the PREVIOUSLY SILENT skip is now counted — an @import to a target reachable only through it is importRulesUnresolved, never a bare miss",
      coverage?.importRulesUnresolved === 1 && coverage.importRulesVisited === 2,
      `unresolved=${String(coverage?.importRulesUnresolved)} visited=${String(coverage?.importRulesVisited)}`,
    );
    check(
      "O2: importsResolvedTotal / importsUnresolvedTotal are the SUM of both paths, not either path alone",
      coverage !== undefined &&
        coverage.importsResolvedTotal === coverage.importsExpanded + coverage.importRulesFollowed &&
        coverage.importsResolvedTotal === 2 &&
        coverage.importsUnresolvedTotal ===
          coverage.importsUnresolved + coverage.importRulesUnresolved &&
        coverage.importsUnresolvedTotal === 2,
      JSON.stringify(
        coverage && {
          resolvedTotal: coverage.importsResolvedTotal,
          unresolvedTotal: coverage.importsUnresolvedTotal,
        },
      ),
    );
    // The two top-level blocked sheets (shared.css, import-outer.css) are
    // unaffected by the @import scenarios layered on top of them.
    check(
      "O2: the two TOP-LEVEL blocked sheets still recover cleanly (the import scenarios add coverage, they do not regress it)",
      coverage?.cssomBlocked === 2 &&
        coverage.fallbackRecovered === 2 &&
        coverage.fallbackMissed === 0,
      JSON.stringify(
        coverage && {
          cssomBlocked: coverage.cssomBlocked,
          fallbackRecovered: coverage.fallbackRecovered,
          fallbackMissed: coverage.fallbackMissed,
        },
      ),
    );
  } finally {
    if (browser) await browser.close();
    pageServer.close();
    cssServer.close();
    if (dir) await rm(dir, { recursive: true, force: true });
  }
}

// ---------------------------------------------------------------------------
// 5d. TABLE-FORMATTING PROPERTIES ON THE COMPUTED-STYLE WHITELIST (Task 28.6
// W6 O5 — permanent regression coverage)
//
// THE DEFECT. `STYLE_WHITELIST` held 96 properties and not one of them was a
// table-formatting property, so every reconstructed `<table>` fell back to the
// CSS initial values (`border-collapse: separate`, `table-layout: auto`, …)
// regardless of what the source authored. MEASURED on hobbang.net: all five
// tables render `separate` in the clone against `collapse` in the source and
// grow up to +82px, then overflow their frozen-height wrappers.
//
// TWO checks: a pure one (no browser) pinning the exact five properties are on
// the whitelist, so a future edit that silently drops one fails immediately;
// and an end-to-end one proving `border-collapse: collapse` authored on a real
// `<table>` reaches `styles.json` as a COMPUTED value via the real pipeline —
// the whitelist entry existing is not by itself proof the collector wires it
// through.
// ---------------------------------------------------------------------------

const O5_TABLE_PROPERTIES = [
  "border-collapse",
  "border-spacing",
  "table-layout",
  "caption-side",
  "empty-cells",
] as const;

function testTableFormattingWhitelistPure(): void {
  console.log("");
  console.log("Table-formatting properties on the computed-style whitelist (pure, no browser)");

  check(
    "O5: all five table-formatting properties are on STYLE_WHITELIST",
    O5_TABLE_PROPERTIES.every((p) => STYLE_WHITELIST.includes(p)),
    JSON.stringify(O5_TABLE_PROPERTIES.filter((p) => !STYLE_WHITELIST.includes(p))),
  );
  check(
    "O5: …and none of them is a longhand of, or a duplicate of, a property already on the list",
    new Set(STYLE_WHITELIST).size === STYLE_WHITELIST.length,
    `${STYLE_WHITELIST.length} entries, ${new Set(STYLE_WHITELIST).size} distinct`,
  );
}

async function testTableFormattingWhitelistEndToEnd(): Promise<void> {
  console.log("");
  console.log(
    "Table-formatting properties reach styles.json (real Chromium — O5: authored collapse vs default separate)",
  );

  const html =
    `<!doctype html><html lang="en"><head><meta charset="utf-8">` +
    `<title>Table formatting fixture</title></head><body>` +
    `<table id="collapsed" style="border-collapse: collapse; table-layout: fixed;">` +
    `<tr><td>x</td></tr></table>` +
    `<table id="default"><tr><td>y</td></tr></table>` +
    `</body></html>`;
  const { server, origin: pageOrigin } = await startSingleDocServer(html);
  let browser: Browser | undefined;
  let dir: string | undefined;

  try {
    const selection = buildSelection(pageOrigin, [
      { familyId: "f000001", representative: `${pageOrigin}/table-formatting` },
    ]);
    dir = await mkdtemp(path.join(tmpdir(), "multi-observer-table-formatting-"));
    browser = await chromium.launch();

    const run = await observeSelectedPages(selection, {
      concurrency: 1,
      sourceSelectedPagesFile: "fixture/selected-pages.json",
      browser,
      runId: "fixture-table-formatting-run",
      runDir: dir,
    });
    const page = run.siteObservation.pages[0]!;
    check(
      "the table-formatting fixture observed successfully",
      page.status === "success",
      page.status,
    );

    const pageDir = path.join(dir, `pages/${page.pageId}`);
    const dom = JSON.parse(
      await readFile(path.join(pageDir, "viewports/desktop/dom.json"), "utf8"),
    ) as { id?: string; attributes?: Record<string, string>; styleId?: string }[];
    const styles = JSON.parse(
      await readFile(path.join(pageDir, "viewports/desktop/styles.json"), "utf8"),
    ) as Record<string, Record<string, string>>;

    const collapsedEl = dom.find((e) => e.attributes?.id === "collapsed");
    const defaultEl = dom.find((e) => e.attributes?.id === "default");
    const collapsedStyle = collapsedEl?.styleId ? styles[collapsedEl.styleId] : undefined;
    const defaultStyle = defaultEl?.styleId ? styles[defaultEl.styleId] : undefined;

    check(
      "O5: an authored `border-collapse: collapse` table reaches styles.json as the COMPUTED value",
      collapsedStyle?.["border-collapse"] === "collapse" &&
        collapsedStyle?.["table-layout"] === "fixed",
      JSON.stringify(
        collapsedStyle && {
          "border-collapse": collapsedStyle["border-collapse"],
          "table-layout": collapsedStyle["table-layout"],
        },
      ),
    );
    check(
      "O5: …while an UNSTYLED table still carries the CSS-initial `separate` / `auto` — the property is read, not fabricated",
      defaultStyle?.["border-collapse"] === "separate" && defaultStyle?.["table-layout"] === "auto",
      JSON.stringify(
        defaultStyle && {
          "border-collapse": defaultStyle["border-collapse"],
          "table-layout": defaultStyle["table-layout"],
        },
      ),
    );
    check(
      "O5: …and the other three table-formatting properties are captured too (caption-side, empty-cells, border-spacing)",
      collapsedStyle !== undefined &&
        typeof collapsedStyle["caption-side"] === "string" &&
        typeof collapsedStyle["empty-cells"] === "string" &&
        typeof collapsedStyle["border-spacing"] === "string",
      JSON.stringify(
        collapsedStyle && {
          "caption-side": collapsedStyle["caption-side"],
          "empty-cells": collapsedStyle["empty-cells"],
          "border-spacing": collapsedStyle["border-spacing"],
        },
      ),
    );
  } finally {
    if (browser) await browser.close();
    server.close();
    if (dir) await rm(dir, { recursive: true, force: true });
  }
}

// ---------------------------------------------------------------------------
// 6. MEDIA-CONDITION LOGIC (Task 28.6 C2.1 / C2.2 — verifier corrections)
//
// Wave 2 recorded a sheet's own `media` list and joined nested `@media` onto it
// with `" and "`. Two defects the verifier found, both of which produce a
// CONFIDENT WRONG VALUE rather than a missing one, and neither of which any
// existing check could see:
//
//   C2.1  a media LIST is a DISJUNCTION, so `"print, speech"` + a nested
//         `(min-width: 700px)` recorded `"print, speech and (min-width: 700px)"`
//         = `print OR (speech AND width)`. The truth is
//         `(print OR speech) AND width`, so the nested condition must be
//         DISTRIBUTED across the alternatives.
//   C2.2  a sheet whose media list cannot be READ was recorded unconditionally
//         and counted in neither `sheetsMediaScoped` nor `sheetsMediaTrivial` —
//         a silent skip.
//
// The unreadable case is produced honestly: ONE sheet instance has its `media`
// and `ownerNode` accessors replaced with throwing ones. Nothing global is
// patched, so the other sheets on the page are classified exactly as they would
// be in the wild.
// ---------------------------------------------------------------------------

function mediaLogicPage(): string {
  return (
    `<!doctype html><html lang="en"><head><meta charset="utf-8">` +
    `<title>Media logic fixture</title>` +
    // A comma media LIST holding a nested @media: the C2.1 case.
    `<style id="sheet-multi" media="print, speech">` +
    `.multi-canary { width: 111px; }` +
    `@media (min-width: 700px) { .multi-canary2 { width: 222px; } }` +
    `</style>` +
    // A `not`-prefixed alternative: the case that CANNOT be spelled correctly
    // once conjoined, and is therefore counted rather than trusted.
    `<style id="sheet-neg" media="not screen">` +
    `.neg-canary { width: 555px; }` +
    `@media (min-width: 700px) { .neg-canary2 { width: 666px; } }` +
    `</style>` +
    // The sheet whose media list is made unreadable below: the C2.2 case.
    `<style id="sheet-plain">.plain-canary { width: 444px; }</style>` +
    `<script>(function () {` +
    `var el = document.getElementById("sheet-plain");` +
    `var sheet = el && el.sheet;` +
    `if (!sheet) return;` +
    `var boom = function () { throw new Error("media unreadable"); };` +
    `Object.defineProperty(sheet, "media", { get: boom, configurable: true });` +
    `Object.defineProperty(sheet, "ownerNode", { get: boom, configurable: true });` +
    `})();</script>` +
    `</head><body>` +
    `<div class="multi-canary">multi</div>` +
    `<div class="multi-canary2">multi nested</div>` +
    `<div class="neg-canary">neg</div>` +
    `<div class="neg-canary2">neg nested</div>` +
    `<div class="plain-canary">plain</div>` +
    `</body></html>`
  );
}

/** One origin serving ONE document for every path. */
function startSingleDocServer(
  html: string,
): Promise<{ server: Server; origin: string }> {
  return new Promise((resolve) => {
    const server = createServer((_req, res) => {
      res.writeHead(200, {
        "content-type": "text/html; charset=utf-8",
        "cache-control": "no-store",
      });
      res.end(html);
    });
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      const port = typeof address === "object" && address ? address.port : 0;
      resolve({ server, origin: `http://127.0.0.1:${port}` });
    });
  });
}

interface MediaCoverage {
  sheetsMediaScoped?: number;
  sheetsMediaTrivial?: number;
  sheetsMediaUnreadable?: number;
  mediaConditionsDistributed?: number;
  mediaConditionsNegated?: number;
}

async function testMediaConditionLogic(): Promise<void> {
  console.log("");
  console.log(
    "Media-condition logic (real Chromium — comma disjunction, negation, unreadable sheet)",
  );

  const { server, origin } = await startSingleDocServer(mediaLogicPage());
  let browser: Browser | undefined;
  let dir: string | undefined;

  try {
    const selection = buildSelection(origin, [
      { familyId: "f000001", representative: `${origin}/media-logic` },
    ]);
    dir = await mkdtemp(path.join(tmpdir(), "multi-observer-media-logic-"));
    browser = await chromium.launch();

    const run = await observeSelectedPages(selection, {
      concurrency: 1,
      sourceSelectedPagesFile: "fixture/selected-pages.json",
      browser,
      runId: "fixture-media-logic-run",
      runDir: dir,
    });
    const page = run.siteObservation.pages[0]!;
    check("the media-logic page observed successfully", page.status === "success", page.status);

    const pageDir = path.join(dir, `pages/${page.pageId}`);
    const readJson = async <T>(rel: string): Promise<T> =>
      JSON.parse(await readFile(path.join(pageDir, rel), "utf8")) as T;

    const observation = await readJson<{
      viewports: { desktop: { stylesheetCoverage?: MediaCoverage } };
    }>("observation.json");
    const coverage = observation.viewports.desktop.stylesheetCoverage;

    const els = await readJson<FixtureElement[]>("viewports/desktop/dom.json");
    const byClass = (cls: string): FixtureElement | undefined =>
      els.find((e) => (e.attributes?.class ?? "").split(/\s+/).includes(cls));
    const ruleOf = (
      cls: string,
      property: string,
      value: string,
    ): FixtureLayoutRule | undefined =>
      (byClass(cls)?.layoutRules ?? []).find(
        (r) => r.property === property && r.value === value,
      );

    // --- the sheet's own list, untouched ------------------------------------
    const multi = ruleOf("multi-canary", "width", "111px");
    check(
      "a sheet-level media LIST is recorded as the list it is",
      multi !== undefined && (multi.media ?? "").replace(/\s+/g, " ") === "print, speech",
      JSON.stringify(byClass("multi-canary")?.layoutRules),
    );

    // --- C2.1: the nested condition is DISTRIBUTED over the alternatives -----
    const nested = ruleOf("multi-canary2", "width", "222px");
    const nestedMedia = (nested?.media ?? "").replace(/\s+/g, " ");
    check(
      "a nested @media inside a comma media LIST is DISTRIBUTED across the alternatives",
      nestedMedia === "print and (min-width: 700px), speech and (min-width: 700px)",
      nestedMedia,
    );
    check(
      "…and is NEVER the concatenation, which states the wrong logic",
      nestedMedia !== "print, speech and (min-width: 700px)",
      nestedMedia,
    );
    check(
      "the distribution is COUNTED in stylesheetCoverage.mediaConditionsDistributed",
      coverage?.mediaConditionsDistributed === 1,
      String(coverage?.mediaConditionsDistributed),
    );

    // --- C2.1: the `not` alternative is recorded AND counted as approximate --
    const neg = ruleOf("neg-canary2", "width", "666px");
    check(
      "a `not`-prefixed alternative is counted, because conjoining it is not exact",
      coverage?.mediaConditionsNegated === 1 &&
        (neg?.media ?? "").indexOf("not screen") === 0,
      `${String(coverage?.mediaConditionsNegated)} / ${neg?.media}`,
    );

    // --- C2.2: an unreadable media list is COUNTED, not silently unmediated --
    const plain = ruleOf("plain-canary", "width", "444px");
    check(
      "a sheet whose media list cannot be READ is counted in sheetsMediaUnreadable",
      coverage?.sheetsMediaUnreadable === 1,
      String(coverage?.sheetsMediaUnreadable),
    );
    check(
      "…while the two readable media-scoped sheets are still classified as scoped",
      coverage?.sheetsMediaScoped === 2 && coverage?.sheetsMediaTrivial === 0,
      `${String(coverage?.sheetsMediaScoped)}/${String(coverage?.sheetsMediaTrivial)}`,
    );
    check(
      "…and its declarations are still recorded (unconditional, because nothing better is known)",
      plain !== undefined && plain.media === undefined,
      JSON.stringify(byClass("plain-canary")?.layoutRules),
    );
  } finally {
    if (browser) await browser.close();
    server.close();
    if (dir) await rm(dir, { recursive: true, force: true });
  }
}

// ---------------------------------------------------------------------------
// 7. SCROLL-REVEAL BLANKING + OVERLAY CENSUS (Task 28.6 C2 B4 / B5)
//
// B4. The preparation auto-scroll ends by returning to the top. A site whose
// scroll-animation library runs in RE-HIDE mode then has most of its document
// back at `opacity: 0` when the collector runs: the reconstruction ships BLANK
// and screenshot-diff QA passes it blank-against-blank, because both sides are
// blank. The condition is NOT universal — measured on interiorteacher.com, 0 of
// 655 sized elements are suppressed after the same return-to-top — so it must be
// DETECTED, never assumed, and a site that animates ONCE must be left alone.
//
// The two fixture pages are identical except for ONE line: the mirror page
// removes the reveal class when an element leaves the viewport, the once page
// does not. That is the whole discriminator, so a detector that "found" the
// defect on both pages would fail here.
//
// B5. The once page also carries the three shapes the overlay census has to tell
// apart: a legitimate FIXED HEADER (full width, short), a legitimate
// FULL-VIEWPORT HERO present from the first paint, and an ENTRY POPUP that
// appears after the initial paint. A false positive on the first two deletes a
// real header, which is worse than the defect, so the census flags only the
// third and RECORDS the refusals.
// ---------------------------------------------------------------------------

const REVEAL_COUNT = 6;

/**
 * Task 28.6 C3 D2(e) — the fade duration of the SLOW fixture page, in ms.
 *
 * THIS NUMBER IS THE ORDERING PIN. `stabilize()` waits {@link SETTLE_MS} and
 * THEN runs the finish pass, "so the regression is measured against the state
 * the COLLECTOR is about to record rather than against a page mid-fade-out".
 * With the 60ms fade the other two fixture pages use, that ordering is
 * unobservable: the page has finished fading long before either candidate
 * moment, so moving `finishReveal` ahead of the settle leaves the suite fully
 * green (verifier mutation M3b).
 *
 * The window this value has to sit in is fixed by the code under test:
 *   • `autoScrollPrepare` waits {@link SCROLL_STEP_SETTLE_MS} after the
 *     return-to-top before it hands the finish pass back, so a finish pass run
 *     WITHOUT the settle sees the page ~`SCROLL_STEP_SETTLE_MS` into the fade.
 *     To read as NOT regressed there, opacity must still exceed
 *     {@link SCROLL_REVEAL_OPACITY_THRESHOLD} — i.e. the fade must outlast
 *     `SCROLL_STEP_SETTLE_MS / (1 - threshold)`.
 *   • The real ordering finishes at `SCROLL_STEP_SETTLE_MS + SETTLE_MS`, and
 *     must read as fully faded — i.e. the fade must be shorter than
 *     `(SCROLL_STEP_SETTLE_MS + SETTLE_MS) / (1 - threshold)`.
 *
 * Task 28.75 raised `SCROLL_STEP_SETTLE_MS` from 250ms to 700ms (the scroll-pass
 * fix), which moved the window from (263, 1526) to (737, 2000). The old 900ms
 * still sat inside it, but with only 155ms of timing margin at the lower edge —
 * too thin for a real-browser check under load. 1,300ms re-centres the value:
 * ~500ms of margin below and ~700ms above, and the check just under the fixture
 * asserts the window arithmetic itself so this can never silently go vacuous.
 *
 * This value is the FADE-OUT (the re-hide). See {@link SLOW_FADE_IN_MS} for why
 * the fixture no longer uses one duration for both directions.
 */
const SLOW_FADE_MS = 1_300;

/** Height of one reveal block in the fixture, in px. */
const REVEAL_BLOCK_PX = 300;

/**
 * Task 28.75 — the fade-IN duration of the SLOW fixture page, in ms.
 *
 * The same page pins TWO unrelated properties, and after the scroll-pass fix the
 * single duration could no longer serve both:
 *
 *   • the ORDERING pin above is about the fade-OUT and is bounded ABOVE by
 *     `SCROLL_STEP_SETTLE_MS + SETTLE_MS` (= 2,000ms at the threshold);
 *   • the SAMPLING-FLOOR pin (Task 28.6 C3 D2(c)) needs `revealedOpacity` to
 *     read below full, and `revealedOpacity` is the MAXIMUM opacity seen across
 *     the probe's samples. A block is on screen for
 *     `(viewportHeight + block) / (viewportHeight × SCROLL_STEP_FRACTION)`
 *     steps — 2.67 at 1440×900 — so with 0.5vh steps its LAST on-screen sample
 *     lands ~2,100ms after the reveal fires. Any fade-in the ordering window
 *     admits has therefore already completed, the maximum reads exactly 1, and
 *     the floor check goes vacuous.
 *
 * Both are real; neither may be dropped. CSS resolves the conflict without a
 * fourth fixture page: a transition is taken from the AFTER-CHANGE style, so
 * `.rv.is-in { transition: … }` governs the fade IN and `.rv { transition: … }`
 * governs the fade OUT. 2,600ms leaves ~500ms of margin over the last on-screen
 * sample; MEASURED at 1440×900, 7 of 8 blocks then record 0.532–0.808.
 */
const SLOW_FADE_IN_MS = 2_600;

/** `mirror` re-hides on leave (the defect); otherwise the class stays (control). */
function revealPage(
  mirror: boolean,
  withOverlays: boolean,
  fadeMs = 60,
  fadeInMs = fadeMs,
): string {
  const blocks = Array.from(
    { length: REVEAL_COUNT },
    (_, i) => `<div class="rv" id="rv${i}"><p>reveal ${i}</p></div>`,
  ).join('<div class="gap"></div>');
  const overlays = withOverlays
    ? `<header id="site-header"><p>header</p></header>` +
      `<section id="hero"><p>hero</p></section>` +
      `<div id="entry-popup" hidden><div><p>popup</p><button type="button">x</button></div></div>` +
      `<script>setTimeout(function () {` +
      `var el = document.getElementById("entry-popup");` +
      `if (el) el.hidden = false;` +
      `}, 800);</script>`
    : "";
  return (
    `<!doctype html><html lang="en"><head><meta charset="utf-8">` +
    `<title>Reveal fixture</title>` +
    `<style>` +
    `body { margin: 0; }` +
    `.rv { opacity: 0; transition: opacity ${String(fadeMs)}ms linear; ` +
    `height: ${String(REVEAL_BLOCK_PX)}px; background: #ddd; }` +
    // The fade IN is taken from the after-change style, so it can differ from
    // the fade OUT above — see SLOW_FADE_IN_MS.
    `.rv.is-in { opacity: 1; transition: opacity ${String(fadeInMs)}ms linear; }` +
    `.gap { height: 700px; }` +
    `.top-spacer { height: 1400px; background: #f4f4f4; }` +
    `#site-header { position: fixed; top: 0; left: 0; width: 100%; height: 64px; z-index: 900; background: #fff; }` +
    `#hero { position: absolute; top: 0; left: 0; width: 100%; height: 100vh; z-index: 1; background: #eee; }` +
    `#entry-popup { position: fixed; top: 0; left: 0; width: 100%; height: 100%; z-index: 9999; background: #000; }` +
    `</style></head><body>` +
    overlays +
    `<div class="top-spacer"><p>spacer</p></div>` +
    blocks +
    `<div class="gap"></div>` +
    `<script>(function () {` +
    `var io = new IntersectionObserver(function (entries) {` +
    `for (var i = 0; i < entries.length; i++) {` +
    `var e = entries[i];` +
    `if (e.isIntersecting) e.target.classList.add("is-in");` +
    (mirror ? `else e.target.classList.remove("is-in");` : ``) +
    `}});` +
    `var all = document.querySelectorAll(".rv");` +
    `for (var i = 0; i < all.length; i++) io.observe(all[i]);` +
    `})();</script>` +
    `</body></html>`
  );
}

/**
 * One origin, three documents: `/reveal-mirror`, `/reveal-once` and
 * `/reveal-slow`. The slow page is the mirror page with one value changed — the
 * fade duration — which is what makes the finish-pass ORDERING observable
 * (Task 28.6 C3 D2(e)).
 */
function startRevealServer(): Promise<{ server: Server; origin: string }> {
  const mirror = revealPage(true, false);
  const once = revealPage(false, true);
  const slow = revealPage(true, false, SLOW_FADE_MS, SLOW_FADE_IN_MS);
  return new Promise((resolve) => {
    const server = createServer((req, res) => {
      const url = (req.url || "/").split("?")[0];
      res.writeHead(200, {
        "content-type": "text/html; charset=utf-8",
        "cache-control": "no-store",
      });
      res.end(
        url === "/reveal-once" ? once : url === "/reveal-slow" ? slow : mirror,
      );
    });
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      const port = typeof address === "object" && address ? address.port : 0;
      resolve({ server, origin: `http://127.0.0.1:${port}` });
    });
  });
}

interface FixtureScrollReveal {
  candidates: number;
  candidateCapHit: boolean;
  samples: number;
  revealedDuringScroll: number;
  regressedAfterReturn: number;
  regressedBelowFold: number;
  revealedThenRemoved: number;
  revealedBelowFull?: number;
  opacityThreshold: number;
}
interface FixturePaintSuppression {
  sizedElements: number;
  suppressedElements: number;
  suppressedByOpacity: number;
  suppressedByVisibility: number;
  suppressedByAncestor: number;
  suppressedBelowFold: number;
  scrollRevealMarked: number;
  scrollRevealAvailable: boolean;
}
interface FixtureOverlayCandidate {
  elementId: string;
  tagName: string;
  viewportCoverage: number;
  heightCoverage: number;
  position: string;
  zIndex?: number;
  declaredDialog: boolean;
  presentAtInitialPaint?: boolean;
  visibleAtInitialPaint?: boolean;
  interactiveDescendants: number;
  flagged: boolean;
  flaggedBy?: string[];
  refusedReason?: string;
}
interface FixtureOverlayCensus {
  structuralMatches: number;
  flagged: number;
  flaggedByScrollLockOnly?: number;
  flaggedByDeclaredDialog?: number;
  flaggedByAppearedAfterInitialPaint?: number;
  refused: number;
  headerLikeRefused: number;
  pageScrollLocked: boolean;
  initialPaintCensusAvailable: boolean;
  initialPaintCapHit?: boolean;
  capHit: boolean;
  candidates: FixtureOverlayCandidate[];
}
interface FixtureViewportRecord {
  scrollReveal?: FixtureScrollReveal;
  paintSuppression?: FixturePaintSuppression;
  overlayCensus?: FixtureOverlayCensus;
  revealRegressionPolicy?: FixtureRevealRegressionPolicy;
}
interface FixtureRevealElement extends FixtureElement {
  id: string;
  styleId: string;
  scrollRevealRegressed?: boolean;
  revealedOpacity?: number;
  /** Task 28.7 A4 — the value the collector actually measured. */
  capturedOpacity?: number;
  revealRegressionCorrected?: boolean;
  revealRegressionUnstable?: boolean;
  revealRegressionUnstableReason?: string;
}
/** Task 28.7 A4 — the counted correction on the viewport record. */
interface FixtureRevealRegressionPolicy {
  marks: number;
  corrected: number;
  correctedBelowFull: number;
  unstable: number;
  correctedSample: string[];
  unstableSample: string[];
  opacityThreshold: number;
}

async function testScrollRevealAndOverlayCensus(): Promise<void> {
  console.log("");
  console.log(
    "Scroll-reveal blanking + overlay census (real Chromium — re-hide page vs animate-once control)",
  );

  const { server, origin } = await startRevealServer();
  let browser: Browser | undefined;
  let dir: string | undefined;
  let revealEvidenceDir: string | undefined;

  try {
    const selection = buildSelection(origin, [
      { familyId: "f000001", representative: `${origin}/reveal-mirror` },
      { familyId: "f000002", representative: `${origin}/reveal-once` },
      { familyId: "f000003", representative: `${origin}/reveal-slow` },
    ]);
    dir = await mkdtemp(path.join(tmpdir(), "multi-observer-reveal-"));
    revealEvidenceDir = await mkdtemp(
      path.join(tmpdir(), "multi-observer-reveal-evidence-"),
    );
    browser = await chromium.launch();

    const run = await observeSelectedPages(selection, {
      concurrency: 1,
      prepareScroll: true,
      // Task 28.7 A2 — the normalization phase stays ON here on purpose: the
      // `/reveal-once` fixture carries a popup whose close control does nothing,
      // so this section also covers "the normalizer tried, failed, and left the
      // page alone" — the census below still has to flag the popup. Its evidence
      // MUST NOT land in `docs/`, which is a real repo directory.
      pageStateEvidenceRoot: revealEvidenceDir,
      sourceSelectedPagesFile: "fixture/selected-pages.json",
      browser,
      runId: "fixture-reveal-run",
      runDir: dir,
    });
    const pages = run.siteObservation.pages;
    check(
      "all three reveal fixture pages observed successfully",
      pages.length === 3 && pages.every((p) => p.status === "success"),
      pageStatusDetail(pages),
    );

    const load = async (
      index: number,
    ): Promise<{
      viewport: FixtureViewportRecord;
      els: FixtureRevealElement[];
      styles: Record<string, Record<string, string>>;
    }> => {
      const pageDir = path.join(dir!, `pages/${pages[index]!.pageId}`);
      const observation = JSON.parse(
        await readFile(path.join(pageDir, "observation.json"), "utf8"),
      ) as { viewports: { desktop: FixtureViewportRecord } };
      const els = JSON.parse(
        await readFile(path.join(pageDir, "viewports/desktop/dom.json"), "utf8"),
      ) as FixtureRevealElement[];
      const styles = JSON.parse(
        await readFile(path.join(pageDir, "viewports/desktop/styles.json"), "utf8"),
      ) as Record<string, Record<string, string>>;
      return { viewport: observation.viewports.desktop, els, styles };
    };

    const indexOfPath = (suffix: string): number =>
      pages.findIndex((p) => p.url.endsWith(suffix));
    const mirror = await load(indexOfPath("/reveal-mirror"));
    const once = await load(indexOfPath("/reveal-once"));
    const slow = await load(indexOfPath("/reveal-slow"));

    // --- B4 positive: the re-hide page ------------------------------------
    const mr = mirror.viewport.scrollReveal;
    check(
      "the mirror page's reveal probe ran and sampled the scroll",
      mr !== undefined && mr.samples > 0 && mr.candidateCapHit === false,
      JSON.stringify(mr),
    );
    check(
      `all ${REVEAL_COUNT} revealed blocks are measured REGRESSING after the return-to-top`,
      mr?.revealedDuringScroll === REVEAL_COUNT &&
        mr?.regressedAfterReturn === REVEAL_COUNT &&
        mr?.regressedBelowFold === REVEAL_COUNT,
      JSON.stringify(mr),
    );
    const marked = mirror.els.filter((e) => e.scrollRevealRegressed === true);
    check(
      "…and every one of them is MARKED in dom.json with the opacity it reached",
      marked.length === REVEAL_COUNT &&
        marked.every((e) => e.revealedOpacity === 1),
      `${marked.length} marked: ${marked.map((e) => `${e.id}=${e.revealedOpacity}`).join(",")}`,
    );
    check(
      "…and the mark count is reconciled in paintSuppression.scrollRevealMarked",
      mirror.viewport.paintSuppression?.scrollRevealMarked === REVEAL_COUNT &&
        mirror.viewport.paintSuppression?.scrollRevealAvailable === true,
      JSON.stringify(mirror.viewport.paintSuppression),
    );
    const mp = mirror.viewport.paintSuppression;
    check(
      "the paint-suppression census counts the blanking as a ratio a caller can read",
      mp !== undefined &&
        mp.sizedElements > 0 &&
        mp.suppressedByOpacity >= REVEAL_COUNT &&
        mp.suppressedBelowFold >= REVEAL_COUNT &&
        mp.suppressedElements <= mp.sizedElements,
      JSON.stringify(mp),
    );

    // --- B4 negative control: the animate-once page ------------------------
    const or = once.viewport.scrollReveal;
    check(
      "the animate-once control REVEALED the same blocks (so the test discriminates)",
      or?.revealedDuringScroll === REVEAL_COUNT,
      JSON.stringify(or),
    );
    check(
      "…and regressed NOTHING: a site that animates once is not penalised",
      or?.regressedAfterReturn === 0 &&
        or?.regressedBelowFold === 0 &&
        or?.revealedThenRemoved === 0,
      JSON.stringify(or),
    );
    check(
      "…so no element on it is marked, and no opacity is suppressed by it",
      once.els.every((e) => e.scrollRevealRegressed === undefined) &&
        once.viewport.paintSuppression?.scrollRevealMarked === 0,
      JSON.stringify(once.viewport.paintSuppression),
    );

    /* --- Task 28.6 C3 D2(e): THE FINISH-PASS ORDERING ---------------------
     *
     * `stabilize()` waits SETTLE_MS and THEN runs the finish pass, on purpose:
     * a finish pass run straight after the return-to-top measures the page
     * MID-FADE-OUT and under-reports the regression. Nothing pinned that. With
     * the 60ms fade above, the page has finished fading long before either
     * candidate moment, so moving `finishReveal` ahead of the settle left this
     * suite fully green (verifier mutation M3b).
     *
     * The slow page changes ONE value — the fade duration — into the window
     * where the two orderings disagree (see SLOW_FADE_MS). The check below
     * therefore fails if, and only if, the finish pass stops running after the
     * observation's own settle.
     */
    check(
      "the ordering window is real: the slow fixture's fade outlasts the " +
        "post-scroll wait and finishes inside the observation settle",
      SLOW_FADE_MS * (1 - SCROLL_REVEAL_OPACITY_THRESHOLD) > SCROLL_STEP_SETTLE_MS &&
        SLOW_FADE_MS * (1 - SCROLL_REVEAL_OPACITY_THRESHOLD) <
          SCROLL_STEP_SETTLE_MS + SETTLE_MS,
      `fade ${SLOW_FADE_MS}ms vs ${SCROLL_STEP_SETTLE_MS}ms / ` +
        `${SCROLL_STEP_SETTLE_MS + SETTLE_MS}ms at threshold ${SCROLL_REVEAL_OPACITY_THRESHOLD}`,
    );
    const revealSamplesInView = Math.ceil(
      (DESKTOP_PROFILE.height + REVEAL_BLOCK_PX) /
        (DESKTOP_PROFILE.height * SCROLL_STEP_FRACTION),
    );
    check(
      "…and the SAMPLING-FLOOR window is real too: the fade-IN outlasts every " +
        "sample taken while a block is still on screen",
      SLOW_FADE_IN_MS > revealSamplesInView * SCROLL_STEP_SETTLE_MS,
      `fade-in ${SLOW_FADE_IN_MS}ms vs ${revealSamplesInView} on-screen samples ` +
        `x ${SCROLL_STEP_SETTLE_MS}ms = ${revealSamplesInView * SCROLL_STEP_SETTLE_MS}ms`,
    );
    const sr = slow.viewport.scrollReveal;
    check(
      `a page whose re-hide fade (${SLOW_FADE_MS}ms) outlasts the post-scroll wait ` +
        "is STILL measured regressing — the finish pass runs after the settle",
      sr?.revealedDuringScroll === REVEAL_COUNT &&
        sr?.regressedAfterReturn === REVEAL_COUNT &&
        sr?.regressedBelowFold === REVEAL_COUNT,
      JSON.stringify(sr),
    );
    check(
      "…and the collector marked all of them, so the ordering reaches dom.json too",
      slow.els.filter((e) => e.scrollRevealRegressed === true).length === REVEAL_COUNT &&
        slow.viewport.paintSuppression?.scrollRevealMarked === REVEAL_COUNT,
      JSON.stringify(slow.viewport.paintSuppression),
    );

    /* --- Task 28.6 C3 D2(c): revealedOpacity IS A SAMPLING FLOOR -----------
     *
     * The probe samples once per scroll step, so an element still mid-fade at
     * its last sample records the opacity it REACHED, not the reveal target.
     * MEASURED on mystarskin.co.kr desktop (twice): 4 of 21 marks read
     * 0.31 / 0.531 / 0.895 / 0.943, and mobile carried a 0.124. A consumer that
     * restores those verbatim renders the element translucent, so the count has
     * to be readable — and it has to be ZERO on a page whose fade completes
     * between samples, or it says nothing.
     */
    const slowMarks = slow.els.filter((e) => e.scrollRevealRegressed === true);
    const slowBelowFull = slowMarks.filter(
      (e) => e.revealedOpacity !== undefined && e.revealedOpacity < 1,
    );
    check(
      "a fade slower than one scroll step leaves marks whose revealedOpacity is " +
        "BELOW full — the value is a sampling floor, not the reveal target",
      slowBelowFull.length >= 1,
      slowMarks.map((e) => `${e.id}=${String(e.revealedOpacity)}`).join(","),
    );
    check(
      "…and ScrollReveal.revealedBelowFull counts exactly those marks",
      sr?.revealedBelowFull === slowBelowFull.length,
      `${String(sr?.revealedBelowFull)} counted vs ${slowBelowFull.length} marked`,
    );
    check(
      "…while the fast-fade page reports 0, so the counter discriminates",
      mr?.revealedBelowFull === 0 &&
        mirror.els
          .filter((e) => e.scrollRevealRegressed === true)
          .every((e) => e.revealedOpacity === 1),
      `${String(mr?.revealedBelowFull)}`,
    );

    /* --- Task 28.7 A4: THE MARKS ARE NOW CONSUMED -------------------------
     *
     * Task 28.6 measured the re-hide and MARKED the elements it hit, and then
     * nothing consumed the marks: `scrollRevealRegressed` and `revealedOpacity`
     * were recorded and ignored by every consumer outside `src/observer/**`, so
     * the reconstruction still shipped `opacity: 0` and still went blank.
     *
     * The policy corrects the EMITTED STYLE TOKEN to the observed revealed
     * value, counts every correction, and keeps BOTH real instants on the raw
     * element record. The animate-once page is the control: it must be
     * untouched, and carry no policy record at all.
     */
    const mirrorPolicy = mirror.viewport.revealRegressionPolicy;
    const mirrorCorrected = mirror.els.filter(
      (e) => e.revealRegressionCorrected === true,
    );
    check(
      `all ${REVEAL_COUNT} re-hidden blocks have their EMITTED style token corrected ` +
        "to the opacity the scroll observed",
      mirrorPolicy?.marks === REVEAL_COUNT &&
        mirrorPolicy.corrected === REVEAL_COUNT &&
        mirrorPolicy.unstable === 0 &&
        mirrorCorrected.length === REVEAL_COUNT &&
        mirrorCorrected.every(
          (e) => mirror.styles[e.styleId]?.opacity === "1",
        ),
      JSON.stringify({
        policy: mirrorPolicy,
        emitted: mirrorCorrected.map((e) => mirror.styles[e.styleId]?.opacity),
      }),
    );
    check(
      "…and BOTH real instants survive on the raw record: the transient captured " +
        "0 AND the revealed 1",
      mirrorCorrected.length === REVEAL_COUNT &&
        mirrorCorrected.every(
          (e) => e.capturedOpacity === 0 && e.revealedOpacity === 1,
        ),
      mirrorCorrected
        .map((e) => `${e.id}: captured=${String(e.capturedOpacity)} revealed=${String(e.revealedOpacity)}`)
        .join(", "),
    );
    check(
      "…and the correction is COUNTED with a bounded id sample, not applied silently",
      mirrorPolicy !== undefined &&
        mirrorPolicy.correctedSample.length === REVEAL_COUNT &&
        mirrorPolicy.correctedSample.every((id) =>
          mirrorCorrected.some((e) => e.id === id),
        ) &&
        mirrorPolicy.opacityThreshold === SCROLL_REVEAL_OPACITY_THRESHOLD,
      JSON.stringify(mirrorPolicy?.correctedSample),
    );
    check(
      "NEGATIVE CONTROL — the animate-once page is corrected in NO way and carries " +
        "no policy record at all",
      once.viewport.revealRegressionPolicy === undefined &&
        once.els.every(
          (e) =>
            e.revealRegressionCorrected === undefined &&
            e.capturedOpacity === undefined &&
            e.revealRegressionUnstable === undefined,
        ),
      JSON.stringify(once.viewport.revealRegressionPolicy),
    );
    const slowPolicy = slow.viewport.revealRegressionPolicy;
    const slowCorrected = slow.els.filter(
      (e) => e.revealRegressionCorrected === true,
    );
    check(
      "a mid-fade sample restores the opacity it REACHED — the emitted token equals " +
        "the observed floor verbatim, and those marks are counted separately",
      slowPolicy?.corrected === REVEAL_COUNT &&
        slowPolicy.correctedBelowFull >= 1 &&
        slowCorrected.every(
          (e) => slow.styles[e.styleId]?.opacity === String(e.revealedOpacity),
        ),
      JSON.stringify({
        belowFull: slowPolicy?.correctedBelowFull,
        emitted: slowCorrected.map(
          (e) => `${String(e.revealedOpacity)}→${String(slow.styles[e.styleId]?.opacity)}`,
        ),
      }),
    );

    // --- B5: the overlay census on the page carrying all three shapes ------
    const census = once.viewport.overlayCensus;
    const idOf = (selectorId: string): string | undefined =>
      once.els.find((e) => e.attributes?.id === selectorId)?.id;
    const popupId = idOf("entry-popup");
    const heroId = idOf("hero");
    const headerId = idOf("site-header");
    check(
      "the overlay census ran with an initial-paint census available",
      census !== undefined && census.initialPaintCensusAvailable === true,
      JSON.stringify(census?.initialPaintCensusAvailable),
    );
    check(
      "…and a COMPLETE one: a capped census is treated as no census, never as evidence",
      census !== undefined && census.initialPaintCapHit === false,
      JSON.stringify(census?.initialPaintCapHit),
    );
    check(
      "every candidate carries an initial-paint answer, so no verdict rests on a missing signal",
      census !== undefined &&
        census.candidates.every(
          (c) =>
            c.presentAtInitialPaint !== undefined &&
            c.visibleAtInitialPaint !== undefined,
        ),
      JSON.stringify(census?.candidates.map((c) => c.visibleAtInitialPaint)),
    );
    const popup = census?.candidates.find((c) => c.elementId === popupId);
    check(
      "an entry popup that appeared AFTER the initial paint is flagged for review",
      popup !== undefined &&
        popup.flagged === true &&
        popup.visibleAtInitialPaint === false &&
        popup.presentAtInitialPaint === true,
      JSON.stringify(popup),
    );
    const hero = census?.candidates.find((c) => c.elementId === heroId);
    check(
      "a full-viewport element painting from the FIRST paint is refused, not flagged",
      hero !== undefined &&
        hero.flagged === false &&
        hero.refusedReason === "painting-at-initial-paint",
      JSON.stringify(hero),
    );
    check(
      "a legitimate fixed HEADER is refused as a class and never becomes a candidate",
      census !== undefined &&
        census.headerLikeRefused >= 1 &&
        census.candidates.every((c) => c.elementId !== headerId),
      `${String(census?.headerLikeRefused)} header-like refused; candidates ${census?.candidates
        .map((c) => c.elementId)
        .join(",")}`,
    );
    check(
      "the census totals reconcile: matches = flagged + refused, exactly one flagged",
      census !== undefined &&
        census.flagged === 1 &&
        census.refused === 1 &&
        census.structuralMatches === census.flagged + census.refused &&
        census.capHit === false,
      JSON.stringify({
        structuralMatches: census?.structuralMatches,
        flagged: census?.flagged,
        refused: census?.refused,
      }),
    );
    check(
      "a page with no positioned full-viewport element produces no candidates at all",
      mirror.viewport.overlayCensus?.structuralMatches === 0 &&
        mirror.viewport.overlayCensus?.candidates.length === 0,
      JSON.stringify(mirror.viewport.overlayCensus),
    );

    /* --- Task 28.6 C3 D2(d): WHICH signal flagged it ----------------------
     * The three signals are OR-ed. Recording only the boolean means a
     * legitimate hero that WAS painting at the initial paint is indistinguishable
     * from a real dialog whenever the page scroll happens to be locked — the
     * census's known false-positive class. `flaggedBy` names the signal, and
     * `flaggedByScrollLockOnly` totals that class per page.
     */
    check(
      "a flagged candidate names WHICH signal fired, not just that one did",
      popup !== undefined &&
        Array.isArray(popup.flaggedBy) &&
        popup.flaggedBy.length === 1 &&
        popup.flaggedBy[0] === "appeared-after-initial-paint",
      JSON.stringify(popup?.flaggedBy),
    );
    check(
      "…a refused candidate carries an EMPTY signal list, never a missing one",
      hero !== undefined &&
        Array.isArray(hero.flaggedBy) &&
        hero.flaggedBy.length === 0,
      JSON.stringify(hero?.flaggedBy),
    );
    check(
      "…and the scroll-lock-only false-positive class is counted per page (0 here, " +
        "because this fixture does not lock the page scroll)",
      census !== undefined &&
        census.pageScrollLocked === false &&
        census.flaggedByScrollLockOnly === 0 &&
        census.flaggedByAppearedAfterInitialPaint === 1 &&
        census.flaggedByDeclaredDialog === 0,
      JSON.stringify({
        locked: census?.pageScrollLocked,
        scrollLockOnly: census?.flaggedByScrollLockOnly,
        appeared: census?.flaggedByAppearedAfterInitialPaint,
        dialog: census?.flaggedByDeclaredDialog,
      }),
    );
  } finally {
    if (browser) await browser.close();
    server.close();
    if (dir) await rm(dir, { recursive: true, force: true });
    if (revealEvidenceDir) {
      await rm(revealEvidenceDir, { recursive: true, force: true });
    }
  }
}


// ---------------------------------------------------------------------------
// 8. PROBE WIDTHS DERIVED FROM THE SITE'S AUTHORED BREAKPOINTS (Task 28.6 C3 D1)
//
// The layout probe used to sample a fixed global width list on every page of
// every site. The reconstruction engine builds a responsive band edge at the
// MIDPOINT between two adjacent probe samples, so the density and placement of
// those samples sets how wrong every band edge can be — and the list knows
// nothing about the site under it.
//
// MEASURED CONSEQUENCE, linear.app/pricing: the authored breakpoint is
// `max-width: 1024px` (the layout changes between 1024 and 1025), the samples
// either side were 1024 and 1440, so the emitted edge was their midpoint 1232
// and the clone hid the comparison table across 1025–1231 where the source
// shows it. The responsive-QA harness graded that pair a BLOCKER independently.
//
// The observation already tallies every distinct `@media` condition the page
// authored, in the same in-page pass that recovers CORS-blocked sheets, and
// that record exists BEFORE either probe pass runs. These checks pin the four
// properties the derivation has to hold — determinism, boundedness, provenance
// and honest degradation — and then prove the whole path end to end against a
// real Chromium on a page that authors a 1024 breakpoint.
// ---------------------------------------------------------------------------

/** A page authoring the breakpoints the derivation has to find. */
function breakpointPage(): string {
  return (
    `<!doctype html><html lang="en"><head><meta charset="utf-8">` +
    `<title>Breakpoint fixture</title><style>` +
    `body { margin: 0; }` +
    `.col { width: 100%; }` +
    // The Linear /pricing shape: a table hidden below an authored 1024 edge.
    `@media (max-width: 1024px) { .comparison { display: none; } }` +
    // Authored twice, so its histogram weight outranks the others.
    `@media (min-width: 700px) { .col { width: 50%; } }` +
    `@media (min-width: 700px) { .other { width: 33%; } }` +
    // Not a screen: names a width, must never move a screen band edge.
    `@media print and (min-width: 512px) { .p { width: 1px; } }` +
    // Parses, constrains no width.
    `@media (orientation: landscape) { .o { width: 2px; } }` +
    // Real, but outside the width envelope this probe pass covers.
    `@media (min-width: 2560px) { .huge { width: 3px; } }` +
    `</style></head><body>` +
    `<div class="col">col</div><div class="other">other</div>` +
    `<table class="comparison"><tr><td>compare</td></tr></table>` +
    `<div class="p">p</div><div class="o">o</div><div class="huge">huge</div>` +
    `</body></html>`
  );
}

const tally = (
  ...pairs: [string, number][]
): AuthoredMediaConditionTally[] => pairs.map(([condition, count]) => ({ condition, count }));

/** Deterministic shuffle (LCG), so a failure reproduces from the same seed. */
function shuffled<T>(items: readonly T[], seed: number): T[] {
  const out = [...items];
  let state = seed >>> 0;
  for (let i = out.length - 1; i > 0; i--) {
    state = (state * 1664525 + 1013904223) >>> 0;
    const j = state % (i + 1);
    const tmp = out[i]!;
    out[i] = out[j]!;
    out[j] = tmp;
  }
  return out;
}

/** The two samples that bracket `boundary`, and the band edge their midpoint gives. */
function midpointAround(widths: readonly number[], boundary: number): number | undefined {
  let below: number | undefined;
  let above: number | undefined;
  for (const w of widths) {
    if (w <= boundary) below = w;
    else if (above === undefined) above = w;
  }
  if (below === undefined || above === undefined) return undefined;
  return Math.floor((below + above) / 2);
}

function testDerivedProbeWidths(): void {
  console.log("");
  console.log("Probe widths derived from authored breakpoints (pure, no browser)");

  const floor = LAYOUT_PROBE_WIDTHS;

  // --- the measured defect ------------------------------------------------
  const linear = deriveProbeWidths({
    floorWidths: floor,
    conditions: tally(["(max-width: 1024px)", 3]),
    sheetsReadable: 51,
    sheetsTotal: 81,
  });
  const at1024 = linear.provenance.origins.find((o) => o.width === 1024);
  const at1025 = linear.provenance.origins.find((o) => o.width === 1025);
  check(
    "an authored `max-width: 1024px` puts a sample on BOTH sides of the change",
    linear.widths.includes(1024) &&
      linear.widths.includes(1025) &&
      linear.widths.filter((w) => w > 1024 && w < 1025).length === 0,
    linear.widths.join(","),
  );
  /*
   * The band edge is the MIDPOINT of the two samples that bracket the authored
   * change, so the sample placement IS the error. Three sets, same arithmetic:
   *   pre-28.6 list [390, 768, 1024, 1440, 1920] → 1024 and 1440 → edge 1232,
   *     which is the 208px error measured on linear.app/pricing (the clone hid
   *     the comparison table across 1025–1231 and responsive QA graded it a
   *     BLOCKER);
   *   today's floor list → 1024 and 1100 → edge 1062, still 37px wrong;
   *   derived → 1024 and 1025 → edge 1024, the authored edge itself.
   */
  const PRE_286_WIDTHS = [390, 768, 1024, 1440, 1920];
  check(
    "…so the band edge their midpoint gives becomes the AUTHORED edge (1232 → 1062 → 1024)",
    midpointAround(PRE_286_WIDTHS, 1024.5) === 1232 &&
      midpointAround(floor, 1024.5) === 1062 &&
      midpointAround(linear.widths, 1024.5) === 1024,
    `pre-28.6 ${String(midpointAround(PRE_286_WIDTHS, 1024.5))} → floor ${String(
      midpointAround(floor, 1024.5),
    )} → derived ${String(midpointAround(linear.widths, 1024.5))}`,
  );
  check(
    "…and both samples say WHY they exist: one floor, one authored",
    at1024?.source === "floor" &&
      at1024.alsoAuthored === true &&
      at1024.breakpointPx === 1024 &&
      at1025?.source === "authored-above" &&
      at1025.breakpointPx === 1024 &&
      at1025.breakpointKind === "max",
    JSON.stringify([at1024, at1025]),
  );

  // --- provenance is complete ----------------------------------------------
  const mixed = deriveProbeWidths({
    floorWidths: floor,
    conditions: tally(
      ["(max-width: 1024px)", 3],
      ["(min-width: 700px)", 9],
      ["screen and (min-width: 1280px)", 2],
    ),
  });
  check(
    "every probed width carries exactly one origin, ascending and aligned",
    mixed.provenance.origins.length === mixed.widths.length &&
      mixed.provenance.origins.every((o, i) => o.width === mixed.widths[i]) &&
      mixed.widths.every((w, i) => i === 0 || w > mixed.widths[i - 1]!),
    `${mixed.widths.length} widths / ${mixed.provenance.origins.length} origins`,
  );
  check(
    "…every floor width keeps `floor` as its source, and every added width names its breakpoint",
    mixed.provenance.origins.every((o) =>
      floor.includes(o.width)
        ? o.source === "floor"
        : (o.source === "authored-below" || o.source === "authored-above") &&
          typeof o.breakpointPx === "number" &&
          (o.breakpointKind === "min" || o.breakpointKind === "max"),
    ),
    JSON.stringify(mixed.provenance.origins),
  );

  // --- the floor set survives WHEN THE CAP HAS ROOM ------------------------
  // Task 28.6 W6 O3: the floor is no longer UNCONDITIONALLY preserved — an
  // authored bracket now outranks an evictable floor width once the cap is
  // genuinely tight (below, its own dedicated check). These four inputs never
  // exert cap pressure (0-2 authored widths against a 16-width cap), so the
  // full floor should still survive every one of them.
  const gentleBattery: (AuthoredMediaConditionTally[] | undefined)[] = [
    undefined,
    [],
    tally(["(max-width: 1024px)", 1]),
    tally(["not all and (min-width: 4px)", 7], ["((((", 2]),
  ];
  check(
    "turning derivation on can only ADD samples: the floor set survives every LOW-PRESSURE input",
    gentleBattery.every((conditions) => {
      const d = deriveProbeWidths({ floorWidths: floor, conditions });
      return floor.every((w) => d.widths.includes(w)) && (d.provenance.floorWidthsEvicted ?? []).length === 0;
    }),
    `${gentleBattery.length} input shapes`,
  );

  // --- O3: an authored width now outranks an EVICTABLE floor width ---------
  // MEASURED shape of the real defect (gs.severance.healthcare): many more
  // authored breakpoints than the cap can hold, ranked by weight. Before O3,
  // ALL SEVEN floor widths were seeded and NEVER gave way, so the highest-rank
  // authored brackets nearest the TOP of the width range were refused while
  // un-authored floor samples sat unused nearby. This tally deliberately
  // clusters its highest-weighted breakpoints away from every floor width so
  // the old code's failure mode is exercised for real.
  const heavyPressureTally = tally(
    ...Array.from({ length: 40 }, (_, i): [string, number] => [
      `(min-width: ${String(300 + i * 37)}px)`,
      i + 1,
    ]),
  );
  const heavyPressure = deriveProbeWidths({
    floorWidths: floor,
    conditions: heavyPressureTally,
  });
  const guaranteedCore = pickGuaranteedFloor(floor, 3);
  check(
    "O3: under real cap pressure the GUARANTEED floor core (narrowest/median/widest) always survives",
    guaranteedCore.every((w) => heavyPressure.widths.includes(w)) &&
      JSON.stringify(heavyPressure.provenance.guaranteedFloorWidths) ===
        JSON.stringify(guaranteedCore),
    `guaranteed ${JSON.stringify(guaranteedCore)} ⊆ widths ${JSON.stringify(heavyPressure.widths)}`,
  );
  check(
    "O3: …an EVICTABLE floor width is genuinely given up, not just theoretically evictable",
    (heavyPressure.provenance.floorWidthsEvicted ?? []).length > 0 &&
      (heavyPressure.provenance.floorWidthsEvicted ?? []).every(
        (w) => floor.includes(w) && !guaranteedCore.includes(w) && !heavyPressure.widths.includes(w),
      ) &&
      (heavyPressure.provenance.breakpointsAdoptedByEviction ?? 0) > 0,
    `evicted ${JSON.stringify(heavyPressure.provenance.floorWidthsEvicted)}, ` +
      `adoptedByEviction ${heavyPressure.provenance.breakpointsAdoptedByEviction}`,
  );
  check(
    "O3: …and every floor width is accounted for — surviving, or named in floorWidthsEvicted, never silently gone",
    floor.every(
      (w) => heavyPressure.widths.includes(w) || (heavyPressure.provenance.floorWidthsEvicted ?? []).includes(w),
    ),
    `floor ${JSON.stringify(floor)} vs widths ${JSON.stringify(heavyPressure.widths)} + evicted ${JSON.stringify(heavyPressure.provenance.floorWidthsEvicted)}`,
  );
  check(
    "O3: …a HIGH-RANK authored bracket that the pre-O3 floor-first order would have refused is now adopted",
    // The two highest-weight breakpoints (px 1743, count 40; px 1706, count
    // 39) sit above every floor width except 1920, so under the OLD floor-
    // first-forever order — 7 floor widths seeded and never evicted, 9 slots
    // left for authored brackets — they would have been among the first
    // adopted (they rank highest), which is not itself the regression. The
    // regression is that with the floor inevictable, LOWER widths get
    // refused; here the fix is verified from the other end: this tally holds
    // no bracket that shares a pixel with any floor width, so EVERY adopted
    // bracket needed 2 fresh widths, and 6 brackets were adopted (12 widths)
    // against a 9-slot pre-O3 authored budget — impossible without eviction.
    heavyPressure.provenance.breakpointsAdopted === 6 &&
      heavyPressure.provenance.breakpointsAdopted * 2 > MAX_PROBE_WIDTHS_TOTAL - floor.length,
    `adopted ${heavyPressure.provenance.breakpointsAdopted} brackets (${heavyPressure.provenance.breakpointsAdopted * 2} fresh widths) vs pre-O3 budget ${MAX_PROBE_WIDTHS_TOTAL - floor.length}`,
  );

  // --- O3.1: the OBSERVATION width can never be evicted ----------------------
  //
  // W6 O3 protected floor widths by POSITION. On the 7-width desktop floor the
  // positional core is [390, 1024, 1920], so 1440 — the width every desktop
  // observation is taken at, and the width the reconstruction anchors its whole
  // desktop pass to — was evictable. It was evicted on 4 of 7 pilot sites, and
  // `layout-inference` then refused the pass with `truth-width-not-probed` and
  // shipped 0 desktop rules. These checks pin the invariant from both ends:
  // first that the eviction is REAL without the fix (so the guard is not
  // vacuous), then that the fix removes it.
  const desktopObservationWidth = VIEWPORT_PROFILES.find((v) => v.id === "desktop")!.width;
  const mobileObservationWidth = VIEWPORT_PROFILES.find((v) => v.id === "mobile")!.width;
  // The pressure shape that ACTUALLY evicted 1440 in the field. A tally of
  // brackets that each add exactly ONE fresh width (`min-width: X` whose low
  // side X-1 is already sampled) walks the cap up one slot at a time, so every
  // evictable floor width is given up in turn — narrowest first — which is the
  // observed `floorWidthsEvicted = [700, 768, 1100, 1440]` on linear.app. A
  // tally whose brackets each need TWO fresh widths cannot reach the fourth
  // eviction at all, so it would have hidden this regression.
  const evictionChainTally = tally(
    ...Array.from({ length: 15 }, (_, i): [string, number] => [
      `(min-width: ${String(391 + i)}px)`,
      100 - i,
    ]),
  );
  const unpinnedChain = deriveProbeWidths({
    floorWidths: floor,
    conditions: evictionChainTally,
  });
  check(
    "O3.1: the regression is REAL — without requiredWidths, cap pressure evicts the desktop observation width",
    !unpinnedChain.widths.includes(desktopObservationWidth) &&
      (unpinnedChain.provenance.floorWidthsEvicted ?? []).includes(desktopObservationWidth),
    `observation width ${desktopObservationWidth} evicted ${JSON.stringify(unpinnedChain.provenance.floorWidthsEvicted)}`,
  );
  const pinnedDesktop = deriveProbeWidths({
    floorWidths: floor,
    requiredWidths: [desktopObservationWidth],
    conditions: evictionChainTally,
  });
  check(
    "O3.1: …and requiredWidths removes it — the observation width survives the identical pressure",
    pinnedDesktop.widths.includes(desktopObservationWidth) &&
      !(pinnedDesktop.provenance.floorWidthsEvicted ?? []).includes(desktopObservationWidth) &&
      JSON.stringify(pinnedDesktop.provenance.requiredWidths) ===
        JSON.stringify([desktopObservationWidth]),
    `widths ${JSON.stringify(pinnedDesktop.widths)}, evicted ${JSON.stringify(pinnedDesktop.provenance.floorWidthsEvicted)}`,
  );
  check(
    "O3.1: …pinning costs one authored bracket at most, and never breaks the cap",
    pinnedDesktop.widths.length <= MAX_PROBE_WIDTHS_TOTAL &&
      pinnedDesktop.provenance.breakpointsAdopted > 0 &&
      unpinnedChain.provenance.breakpointsAdopted - pinnedDesktop.provenance.breakpointsAdopted <= 1,
    `adopted ${pinnedDesktop.provenance.breakpointsAdopted} vs unpinned ${unpinnedChain.provenance.breakpointsAdopted}, ` +
      `${pinnedDesktop.widths.length} widths <= cap ${MAX_PROBE_WIDTHS_TOTAL}`,
  );
  const mobilePressureTally = tally(
    ...Array.from({ length: 40 }, (_, i): [string, number] => [
      `(min-width: ${String(260 + i * 13)}px)`,
      i + 1,
    ]),
  );
  const pinnedMobile = deriveProbeWidths({
    floorWidths: MOBILE_LAYOUT_PROBE_WIDTHS,
    requiredWidths: [mobileObservationWidth],
    conditions: mobilePressureTally,
  });
  check(
    "O3.1: the MOBILE pass pins its own observation width, not the desktop one",
    pinnedMobile.widths.includes(mobileObservationWidth) &&
      !(pinnedMobile.provenance.floorWidthsEvicted ?? []).includes(mobileObservationWidth) &&
      JSON.stringify(pinnedMobile.provenance.requiredWidths) === JSON.stringify([mobileObservationWidth]),
    `widths ${JSON.stringify(pinnedMobile.widths)}`,
  );
  let profileWidthsHeld = 0;
  let profileWidthCases = 0;
  for (const profile of VIEWPORT_PROFILES) {
    const profileFloor =
      profile.id === "mobile" ? MOBILE_LAYOUT_PROBE_WIDTHS : LAYOUT_PROBE_WIDTHS;
    for (let stride = 7; stride <= 61; stride += 6) {
      profileWidthCases++;
      const d = deriveProbeWidths({
        floorWidths: profileFloor,
        requiredWidths: [profile.width],
        conditions: tally(
          ...Array.from({ length: 40 }, (_, i): [string, number] => [
            `(min-width: ${String(240 + i * stride)}px)`,
            i + 1,
          ]),
        ),
      });
      if (d.widths.includes(profile.width)) profileWidthsHeld++;
    }
  }
  check(
    "O3.1: EVERY shipped viewport profile keeps its own observation width under 20 distinct pressure shapes",
    profileWidthCases === 2 * 10 && profileWidthsHeld === profileWidthCases,
    `${profileWidthsHeld}/${profileWidthCases} cases held`,
  );
  // The wiring, not just the unit: a passing derivation proves nothing if
  // `observe-page` never passes `requiredWidths`. This is the exact shape of
  // fake coverage this task exists to eliminate, so it is asserted on source.
  const observePageSource = readFileSync(
    path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../src/observer/observe-page.ts"),
    "utf8",
  );
  const requiredWidthCallSites = observePageSource.match(
    /deriveFor\(\s*[^;]*?\.width[^;]*?\)/gs,
  );
  check(
    "O3.1: observe-page actually WIRES it — both probe passes pass a profile width as requiredWidths",
    observePageSource.includes("requiredWidths") &&
      (requiredWidthCallSites?.length ?? 0) === 2,
    `${requiredWidthCallSites?.length ?? 0} deriveFor call site(s) passing a profile width`,
  );

  // --- determinism ----------------------------------------------------------
  const bigTally = tally(
    ["(max-width: 1024px)", 3],
    ["(min-width: 700px)", 9],
    ["screen and (min-width: 1280px)", 2],
    ["print and (min-width: 512px)", 4],
    ["(orientation: landscape)", 6],
    ["(min-width: 48em)", 5],
    ["not screen and (min-width: 900px)", 1],
    ["((((", 8],
    ["(min-width: 2560px)", 2],
    ["(min-width: 64px) and (max-width: 32px)", 3],
  );
  const canonical = JSON.stringify(
    deriveProbeWidths({ floorWidths: floor, conditions: bigTally }),
  );
  let permutationsAgree = 0;
  for (let seed = 1; seed <= 120; seed++) {
    const d = deriveProbeWidths({
      floorWidths: shuffled(floor, seed * 7),
      conditions: shuffled(bigTally, seed),
    });
    if (JSON.stringify(d) === canonical) permutationsAgree++;
  }
  check(
    "the derived set is identical under 120 permutations of the tally and the floor list",
    permutationsAgree === 120,
    `${permutationsAgree}/120 agree`,
  );

  // --- the cap: bounded, and it adopts in the DOCUMENTED rank order ---------
  const capped = deriveProbeWidths({
    floorWidths: [400, 1000],
    conditions: tally(
      ["(min-width: 500px)", 5],
      ["(min-width: 800px)", 9],
      ["(min-width: 900px)", 1],
    ),
    cap: 4,
  });
  check(
    "under the cap the HIGHEST-WEIGHTED breakpoint is the one sampled",
    capped.widths.join(",") === "400,799,800,1000" &&
      capped.provenance.breakpointsAdopted === 1 &&
      capped.provenance.breakpointsDroppedByCap === 2 &&
      capped.provenance.capHit === true,
    `${capped.widths.join(",")} | ${JSON.stringify({
      adopted: capped.provenance.breakpointsAdopted,
      dropped: capped.provenance.breakpointsDroppedByCap,
    })}`,
  );
  check(
    "…and the cap NAMES what it refused, not just how many",
    capped.provenance.breakpointsRefused.length === 2 &&
      capped.provenance.breakpointsRefused.every((r) => r.reason === "cap") &&
      capped.provenance.breakpointsRefused
        .map((r) => `${String(r.px)}${r.kind}`)
        .join(",") === "500min,900min" &&
      capped.provenance.refusedListTruncated === false,
    JSON.stringify(capped.provenance.breakpointsRefused),
  );
  const many = deriveProbeWidths({
    floorWidths: floor,
    conditions: tally(...Array.from({ length: 60 }, (_, i): [string, number] => [
      `(min-width: ${String(401 + i * 20)}px)`,
      60 - i,
    ])),
  });
  const p = many.provenance;
  check(
    `60 authored breakpoints stay inside the ${String(MAX_PROBE_WIDTHS_TOTAL)}-width cap`,
    many.widths.length <= MAX_PROBE_WIDTHS_TOTAL &&
      many.widths.length === p.origins.length &&
      p.capHit === true,
    `${many.widths.length} widths, capHit ${String(p.capHit)}`,
  );
  check(
    "…and every folded breakpoint is accounted for: adopted + bracketed + out-of-range + capped, " +
      "with the refusal list bounded and its truncation flagged",
    p.breakpointsFolded ===
      p.breakpointsAdopted +
        p.breakpointsAlreadyBracketed +
        p.breakpointsOutOfRange +
        p.breakpointsDroppedByCap &&
      p.breakpointsRefused.length <= 32 &&
      p.refusedListTruncated ===
        (p.breakpointsOutOfRange + p.breakpointsDroppedByCap >
          p.breakpointsRefused.length),
    JSON.stringify({
      folded: p.breakpointsFolded,
      adopted: p.breakpointsAdopted,
      bracketed: p.breakpointsAlreadyBracketed,
      outOfRange: p.breakpointsOutOfRange,
      capped: p.breakpointsDroppedByCap,
      listed: p.breakpointsRefused.length,
      listTruncated: p.refusedListTruncated,
    }),
  );

  // --- degradation, three causes told apart ---------------------------------
  const noTally = deriveProbeWidths({ floorWidths: floor, conditions: undefined });
  check(
    "an observation carrying NO authored tally degrades to the floor list and says so",
    noTally.widths.join(",") === [...floor].join(",") &&
      noTally.provenance.degradedToFloor === true &&
      noTally.provenance.degradedReason === "no-condition-tally",
    JSON.stringify(noTally.provenance.degradedReason),
  );
  const unreadable = deriveProbeWidths({
    floorWidths: floor,
    conditions: [],
    sheetsReadable: 0,
    sheetsTotal: 81,
  });
  check(
    "…a page whose 81 stylesheets could NOT be read is a different fact, and is told apart",
    unreadable.provenance.degradedToFloor === true &&
      unreadable.provenance.degradedReason === "authored-css-unreadable",
    JSON.stringify(unreadable.provenance.degradedReason),
  );
  const noWidths = deriveProbeWidths({
    floorWidths: floor,
    conditions: tally(
      ["print and (min-width: 512px)", 4],
      ["(orientation: landscape)", 6],
      ["not screen and (min-width: 900px)", 1],
      ["((((", 2],
      ["(min-width: 64px) and (max-width: 32px)", 3],
    ),
    sheetsReadable: 12,
    sheetsTotal: 12,
  });
  const np = noWidths.provenance;
  check(
    "…and a page read successfully that authors no SCREEN width condition is a third",
    np.degradedToFloor === true && np.degradedReason === "no-width-breakpoints",
    JSON.stringify(np.degradedReason),
  );
  check(
    "…with every refusal counted, so 'authored none' can never be confused with 'refused all'",
    np.queriesNonScreenSkipped >= 1 &&
      np.conditionsWidthIrrelevant >= 1 &&
      np.conditionsUnsupported >= 1 &&
      np.conditionsUnparsed >= 1 &&
      np.queriesEmptyInterval >= 1 &&
      np.conditionsRead === 5,
    JSON.stringify({
      nonScreen: np.queriesNonScreenSkipped,
      irrelevant: np.conditionsWidthIrrelevant,
      unsupported: np.conditionsUnsupported,
      unparsed: np.conditionsUnparsed,
      empty: np.queriesEmptyInterval,
    }),
  );
  /*
   * The three causes that also produce a floor-only set but are NOT missing
   * evidence. Reporting any of them as "no-width-breakpoints" would state that
   * the page authors no breakpoint, which is false in all three.
   */
  const alreadyBracketed = deriveProbeWidths({
    floorWidths: [500, 501, 900],
    conditions: tally(["(min-width: 501px)", 4]),
    sheetsReadable: 3,
    sheetsTotal: 3,
  });
  check(
    "a page whose FLOOR set already brackets every authored breakpoint is not " +
      "reported as authoring none",
    alreadyBracketed.widths.join(",") === "500,501,900" &&
      alreadyBracketed.provenance.degradedToFloor === true &&
      alreadyBracketed.provenance.degradedReason ===
        "authored-breakpoints-already-bracketed" &&
      alreadyBracketed.provenance.breakpointsAlreadyBracketed === 1,
    JSON.stringify(alreadyBracketed.provenance.degradedReason),
  );
  const noRoom = deriveProbeWidths({
    floorWidths: [400, 800],
    conditions: tally(["(min-width: 600px)", 4]),
    cap: 2,
  });
  check(
    "…nor is a page whose width budget was full before its breakpoints were reached",
    noRoom.widths.join(",") === "400,800" &&
      noRoom.provenance.degradedReason === "cap-left-no-room" &&
      noRoom.provenance.breakpointsRefused.length === 1,
    JSON.stringify(noRoom.provenance.degradedReason),
  );
  const allOutOfRange = deriveProbeWidths({
    floorWidths: MOBILE_LAYOUT_PROBE_WIDTHS,
    conditions: tally(["(min-width: 1440px)", 4]),
  });
  check(
    "…nor a mobile pass whose only authored breakpoint sits above the switch",
    allOutOfRange.provenance.degradedReason === "breakpoints-out-of-range" &&
      allOutOfRange.provenance.breakpointsOutOfRange === 1,
    JSON.stringify(allOutOfRange.provenance.degradedReason),
  );
  check(
    "the collector's own distinct-condition cap is carried through, not re-derived",
    deriveProbeWidths({
      floorWidths: floor,
      conditions: [],
      conditionsDroppedByCollector: 17,
    }).provenance.conditionsDroppedByCollector === 17,
    "17",
  );

  // --- operator extras stay traceable --------------------------------------
  // `--probe-widths` is applied AFTER the derivation (and can push the total
  // past the cap — that is the operator's call, bounded separately by
  // MAX_EXTRA_PROBE_WIDTHS). Those widths must still carry a reason, or the
  // artifact would contain a sample nothing explains.
  const withExtras = withOperatorWidths(linear.provenance, [
    ...linear.widths,
    2048,
  ]);
  check(
    "an operator-supplied extra width is still given a reason in the provenance",
    withExtras.origins.length === linear.widths.length + 1 &&
      withExtras.origins[withExtras.origins.length - 1]?.width === 2048 &&
      withExtras.origins[withExtras.origins.length - 1]?.source === "operator" &&
      withExtras.origins.every((o, i) =>
        i === 0 ? true : o.width > withExtras.origins[i - 1]!.width,
      ),
    JSON.stringify(withExtras.origins[withExtras.origins.length - 1]),
  );

  // --- the mobile pass keeps its own envelope (brief item (d)) --------------
  const mobile = deriveProbeWidths({
    floorWidths: MOBILE_LAYOUT_PROBE_WIDTHS,
    conditions: tally(["(max-width: 1024px)", 3], ["(min-width: 700px)", 9]),
  });
  const mobileCeiling = Math.max(...MOBILE_LAYOUT_PROBE_WIDTHS);
  check(
    "the MOBILE probe derives from the same evidence but never widens past the switch",
    mobile.widths.every((w) => w <= mobileCeiling) &&
      mobile.widths.includes(699) &&
      mobile.widths.includes(700) &&
      !mobile.widths.includes(1025) &&
      mobile.provenance.breakpointsOutOfRange === 1,
    `${mobile.widths.join(",")} (ceiling ${mobileCeiling})`,
  );
  check(
    "B2 NEGATIVE CONTROL: a pass that does not ASK for an envelope extension records none",
    mobile.provenance.envelopeExtension === undefined &&
      linear.provenance.envelopeExtension === undefined,
    JSON.stringify(mobile.provenance.envelopeExtension),
  );

  /* --- Task 28.7 B2 — THE MOBILE ENVELOPE ---------------------------------
   *
   * 28.6 defect A13: `MOBILE_LAYOUT_PROBE_WIDTHS` tops out at its widest floor
   * width while the MOBILE TREE is what renders up to the desktop/mobile
   * switch. On 5 of 7 pilots the switch is above that ceiling (1025 on three
   * sites, 1280 on a fourth), so the band between them had NO width evidence at
   * all — which is why a clone served a 390px layout at 1024.
   *
   * The switch is inferred DOWNSTREAM and does not exist at observe time. The
   * PIXEL that governs it is authored in the site's own CSS, normally in the
   * DESKTOP-loaded stylesheets the mobile context never reads. So these checks
   * pin three things: the extension happens ON AUTHORED EVIDENCE, it does NOT
   * happen without it (the guard against a hardcoded ceiling), and it never
   * costs a required width.
   */
  const desktopWidth = VIEWPORT_PROFILES.find((v) => v.id === "desktop")!.width;
  const mobileWidth = VIEWPORT_PROFILES.find((v) => v.id === "mobile")!.width;
  // Authored ONLY in the desktop context — the mobile sheets know nothing of it.
  const desktopOnlyTally = tally(
    ["(max-width: 1024px)", 3],
    ["(min-width: 1025px)", 3],
    ["(min-width: 2560px)", 2],
  );
  const mobileOwnTally = tally(["(min-width: 480px)", 4]);

  const extended = deriveProbeWidths({
    floorWidths: MOBILE_LAYOUT_PROBE_WIDTHS,
    requiredWidths: [mobileWidth],
    conditions: mobileOwnTally,
    crossContextConditions: desktopOnlyTally,
    extendEnvelopeFromAuthored: true,
    envelopeExtensionMaxWidth: desktopWidth,
  });
  const ext = extended.provenance.envelopeExtension;
  check(
    "B2: authored 1024/1025 evidence from the DESKTOP context extends the mobile envelope",
    ext?.extended === true &&
      ext.baseMaxWidth === mobileCeiling &&
      ext.maxWidth === 1025 &&
      extended.widths.includes(1024) &&
      extended.widths.includes(1025),
    `${extended.widths.join(",")} — ${JSON.stringify(ext)}`,
  );
  check(
    "B2: …with provenance for it — the admitted breakpoints, the cross-context count, and per-width origins",
    ext !== undefined &&
      ext.crossContextConditions === desktopOnlyTally.length &&
      ext.bracketsAdmitted.some((b) => b.px === 1024 && b.kind === "max") &&
      JSON.stringify(ext.widthsBeyondBase) === JSON.stringify([1024, 1025]) &&
      extended.provenance.origins
        .filter((o) => o.width > mobileCeiling)
        .every((o) => o.beyondFloorEnvelope === true) &&
      extended.provenance.origins
        .filter((o) => o.width <= mobileCeiling)
        .every((o) => o.beyondFloorEnvelope === undefined),
    JSON.stringify(ext),
  );
  check(
    "B2: …bounded by the OTHER context's observation width — the authored 2560 edge is refused",
    ext !== undefined &&
      ext.hardMaxWidth === desktopWidth &&
      ext.bracketsBeyondHardMax === 1 &&
      extended.widths.every((w) => w <= 1025),
    `${extended.widths.join(",")} — beyond hard max ${String(ext?.bracketsBeyondHardMax)}`,
  );

  // THE GUARD AGAINST A HARDCODED CEILING. Same call, same flag, same floor —
  // the ONLY difference is that no context authored a breakpoint above the
  // floor ceiling. Nothing may be added.
  const noEvidence = deriveProbeWidths({
    floorWidths: MOBILE_LAYOUT_PROBE_WIDTHS,
    requiredWidths: [mobileWidth],
    conditions: mobileOwnTally,
    crossContextConditions: tally(["(min-width: 600px)", 2], ["(max-width: 320px)", 1]),
    extendEnvelopeFromAuthored: true,
    envelopeExtensionMaxWidth: desktopWidth,
  });
  check(
    "B2 NEGATIVE CONTROL: no authored evidence above the ceiling → the envelope does NOT extend",
    noEvidence.provenance.envelopeExtension?.extended === false &&
      noEvidence.provenance.envelopeExtension.maxWidth === mobileCeiling &&
      noEvidence.provenance.envelopeExtension.bracketsAboveBase === 0 &&
      noEvidence.widths.every((w) => w <= mobileCeiling) &&
      noEvidence.provenance.origins.every((o) => o.beyondFloorEnvelope === undefined),
    `${noEvidence.widths.join(",")} — ${JSON.stringify(noEvidence.provenance.envelopeExtension)}`,
  );
  check(
    "B2: at most MAX_ENVELOPE_EXTENSION_BRACKETS brackets may move the ceiling",
    (() => {
      const many = deriveProbeWidths({
        floorWidths: MOBILE_LAYOUT_PROBE_WIDTHS,
        requiredWidths: [mobileWidth],
        conditions: tally(
          ["(min-width: 960px)", 5],
          ["(min-width: 1025px)", 4],
          ["(min-width: 1120px)", 3],
          ["(min-width: 1200px)", 2],
        ),
        extendEnvelopeFromAuthored: true,
        envelopeExtensionMaxWidth: desktopWidth,
      });
      const e = many.provenance.envelopeExtension;
      return (
        e !== undefined &&
        e.bracketsAboveBase === 4 &&
        e.bracketCap === MAX_ENVELOPE_EXTENSION_BRACKETS &&
        e.bracketsAdmitted.length === MAX_ENVELOPE_EXTENSION_BRACKETS &&
        // Nearest first: 960 then 1025 — never the far ones.
        e.bracketsAdmitted.map((b) => b.px).join(",") === "960,1025" &&
        e.maxWidth === 1025 &&
        many.widths.every((w) => w <= 1025)
      );
    })(),
    "bracket cap",
  );
  // THE A8 INTERACTION, ASSERTED DIRECTLY. Adding widths must never make a
  // required width evictable again.
  const extendedUnderPressure = deriveProbeWidths({
    floorWidths: MOBILE_LAYOUT_PROBE_WIDTHS,
    requiredWidths: [mobileWidth],
    conditions: tally(
      ...Array.from({ length: 40 }, (_, i): [string, number] => [
        `(min-width: ${String(391 + i * 17)}px)`,
        100 - i,
      ]),
    ),
    crossContextConditions: desktopOnlyTally,
    extendEnvelopeFromAuthored: true,
    envelopeExtensionMaxWidth: desktopWidth,
  });
  check(
    "B2 × A8: under cap pressure WITH the envelope extended, the required width is still never evicted",
    extendedUnderPressure.widths.includes(mobileWidth) &&
      !(extendedUnderPressure.provenance.floorWidthsEvicted ?? []).includes(mobileWidth) &&
      (extendedUnderPressure.provenance.guaranteedFloorWidths ?? []).length > 0 &&
      extendedUnderPressure.widths.length <= MAX_PROBE_WIDTHS_TOTAL &&
      (extendedUnderPressure.provenance.floorWidthsEvicted ?? []).length > 0,
    `${extendedUnderPressure.widths.join(",")} — evicted ` +
      `${JSON.stringify(extendedUnderPressure.provenance.floorWidthsEvicted)}`,
  );
  // The wiring, on source: a derivation that can extend proves nothing if the
  // mobile pass never asks for it — and the desktop pass must NOT ask.
  const observeSourceB2 = readFileSync(
    path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../src/observer/observe-page.ts"),
    "utf8",
  );
  check(
    "B2: observe-page WIRES it — exactly one probe pass (the mobile one) requests the extension",
    (observeSourceB2.match(/extend:\s*true/g) ?? []).length === 1 &&
      observeSourceB2.includes("crossContextViewport: desktop"),
    `${String((observeSourceB2.match(/extend:\s*true/g) ?? []).length)} call site(s)`,
  );
}

interface FixtureProbeArtifact {
  widths: { width: number }[];
  widthProvenance?: ProbeWidthProvenance;
}

async function testProbeWidthDerivationEndToEnd(): Promise<void> {
  console.log("");
  console.log(
    "Probe widths end to end (real Chromium — a page that authors a 1024 breakpoint)",
  );

  const { server, origin } = await startSingleDocServer(breakpointPage());
  let browser: Browser | undefined;
  let dir: string | undefined;

  try {
    const selection = buildSelection(origin, [
      { familyId: "f000001", representative: `${origin}/breakpoints` },
    ]);
    dir = await mkdtemp(path.join(tmpdir(), "multi-observer-breakpoints-"));
    browser = await chromium.launch();

    const run = await observeSelectedPages(selection, {
      concurrency: 1,
      sourceSelectedPagesFile: "fixture/selected-pages.json",
      browser,
      runId: "fixture-breakpoint-run",
      runDir: dir,
    });
    const page = run.siteObservation.pages[0]!;
    check("the breakpoint page observed successfully", page.status === "success", page.status);

    const pageDir = path.join(dir, `pages/${page.pageId}`);
    const readJson = async <T>(rel: string): Promise<T> =>
      JSON.parse(await readFile(path.join(pageDir, rel), "utf8")) as T;

    const observation = await readJson<{
      viewports: {
        desktop: {
          stylesheetCoverage?: {
            authoredMediaConditions?: { condition: string; count: number }[];
            authoredMediaConditionsDropped?: number;
          };
        };
      };
      layoutProbe?: { file: string; widths: number[] };
      layoutProbeMobile?: { file: string; widths: number[] };
    }>("observation.json");
    const conditions =
      observation.viewports.desktop.stylesheetCoverage?.authoredMediaConditions ?? [];
    const conditionText = conditions.map((c) => c.condition);
    check(
      "the observation records the page's authored @media conditions, with their weight",
      conditionText.includes("(max-width: 1024px)") &&
        conditions.find((c) => c.condition === "(min-width: 700px)")?.count === 2 &&
        conditions.find((c) => c.condition === "(max-width: 1024px)")?.count === 1,
      JSON.stringify(conditions),
    );
    check(
      "…sorted by weight then text, so two runs of the same page emit the same array",
      conditions.every((c, i) => {
        if (i === 0) return true;
        const prev = conditions[i - 1]!;
        return prev.count > c.count || (prev.count === c.count && prev.condition < c.condition);
      }),
      JSON.stringify(conditionText),
    );

    const probe = await readJson<FixtureProbeArtifact>(
      observation.layoutProbe?.file ?? "layout-probe.json",
    );
    const widths = probe.widths.map((w) => w.width);
    const prov = probe.widthProvenance;
    check(
      "the desktop probe artifact carries a provenance entry for every width it sampled",
      prov !== undefined &&
        prov.origins.length === widths.length &&
        prov.origins.every((o, i) => o.width === widths[i]) &&
        prov.degradedToFloor === false,
      `${widths.length} widths / ${String(prov?.origins.length)} origins`,
    );
    check(
      "…and it sampled BOTH sides of the authored `max-width: 1024px`",
      widths.includes(1024) &&
        widths.includes(1025) &&
        prov?.origins.find((o) => o.width === 1025)?.breakpointPx === 1024,
      widths.join(","),
    );
    check(
      "…and both sides of the authored `min-width: 700px`, the higher-weighted one",
      widths.includes(699) &&
        widths.includes(700) &&
        prov?.origins.find((o) => o.width === 699)?.breakpointKind === "min",
      widths.join(","),
    );
    check(
      "…while the print-scoped, orientation and 2560px conditions moved no sample",
      prov !== undefined &&
        prov.queriesNonScreenSkipped >= 1 &&
        prov.conditionsWidthIrrelevant >= 1 &&
        prov.breakpointsOutOfRange === 1 &&
        !widths.some((w) => w > Math.max(...LAYOUT_PROBE_WIDTHS)),
      JSON.stringify({
        nonScreen: prov?.queriesNonScreenSkipped,
        irrelevant: prov?.conditionsWidthIrrelevant,
        outOfRange: prov?.breakpointsOutOfRange,
      }),
    );
    check(
      "the manifest's probe-width pointer reports the widths this page actually sampled",
      (observation.layoutProbe?.widths ?? []).join(",") === widths.join(","),
      (observation.layoutProbe?.widths ?? []).join(","),
    );

    const mobileProbe = await readJson<FixtureProbeArtifact>(
      observation.layoutProbeMobile?.file ?? "layout-probe-mobile.json",
    );
    const mobileWidths = mobileProbe.widths.map((w) => w.width);
    const mobileCeiling = Math.max(...MOBILE_LAYOUT_PROBE_WIDTHS);
    check(
      "the MOBILE probe derived its own set from the same page",
      mobileProbe.widthProvenance !== undefined &&
        mobileWidths.includes(699) &&
        mobileWidths.includes(700),
      `${mobileWidths.join(",")} (floor ceiling ${mobileCeiling})`,
    );
    /*
     * TASK 28.7 B2 — this used to assert `every(w => w <= mobileCeiling)`, i.e.
     * that the mobile pass stopped at its floor set's own widest width. 28.6
     * defect A13 measured what that cost: the mobile tree renders up to the
     * desktop/mobile switch, which is above that ceiling on 5 of 7 pilots, so
     * the band between them had NO width evidence at all. The envelope now
     * follows the page's OWN authored breakpoints past the ceiling — this
     * fixture authors `max-width: 1024px` — and stops there.
     */
    const mobileExt = mobileProbe.widthProvenance?.envelopeExtension;
    check(
      "B2: …and its envelope followed the page's authored 1024 edge past the floor ceiling",
      mobileExt?.extended === true &&
        mobileExt.baseMaxWidth === mobileCeiling &&
        mobileExt.maxWidth === 1025 &&
        mobileWidths.includes(1024) &&
        mobileWidths.includes(1025) &&
        JSON.stringify(mobileExt.widthsBeyondBase) === JSON.stringify([1024, 1025]),
      `${mobileWidths.join(",")} — ${JSON.stringify(mobileExt)}`,
    );
    check(
      "B2: …and NOT one pixel further — the authored 2560 edge is above the hard bound",
      mobileExt !== undefined &&
        mobileExt.hardMaxWidth === VIEWPORT_PROFILES.find((v) => v.id === "desktop")!.width &&
        mobileExt.bracketsBeyondHardMax >= 1 &&
        mobileWidths.every((w) => w <= mobileExt.maxWidth),
      `${mobileWidths.join(",")} — hard max ${String(mobileExt?.hardMaxWidth)}`,
    );
  } finally {
    if (browser) await browser.close();
    server.close();
    if (dir) await rm(dir, { recursive: true, force: true });
  }
}

// ---------------------------------------------------------------------------
// 9. TASK 28.7 WP-A — NAVIGATION-SAFE PREPARE-SCROLL (A1), CONSERVATIVE
//    PAGE-STATE NORMALIZATION (A2) AND THE DETERMINISTIC SETTLE (A3)
//
// A1. A page that NAVIGATES while the preparation auto-scroll is stepping used
// to take the WHOLE ROUTE with it: the throw escaped `stabilize()` →
// `observeViewport()` → `observePageWithBrowser()`, the site orchestrator filed
// the page as an `observation-error` with no artifact, and the reconstruction
// then threw `ReconstructionError` because the route had no
// `renderSourcePageId`. The two fixtures below reproduce BOTH shapes of that
// navigation: one that happens once (recoverable) and one that happens on every
// load (not recoverable). Neither may cost the observation.
//
// A2. An entry popup open at capture time is reconstructed as a permanent
// overlay covering the hero. The observer now dismisses one — and the whole risk
// of that is the FALSE POSITIVE, which deletes a real header, a chat widget, a
// floating accessibility control or a legitimate full-viewport hero. So the
// positive fixtures are outnumbered here by five negative controls, and the
// suite fails if any of them is touched.
//
// A3. `networkidle` is not a settle condition: a page polling every 200ms never
// idles, and the observation used to fall through its 8s cap and collect
// whatever happened to be on screen. The settle is now deterministic (document
// height + RENDERABLE candidate image count holding still across consecutive
// samples, hard-capped) and reports what it actually reached.
// ---------------------------------------------------------------------------

interface FixturePrepareScrollNavigation {
  navigatedUrl?: string;
  observationUrl: string;
  leftObservedDocument: boolean;
  recoveryNavigated: boolean;
  retryAttempted: boolean;
  retryNavigated: boolean;
  restoreNavigated: boolean;
  limitation: string;
  error?: string;
}
interface FixtureSettleOutcome {
  domContentLoadedReached: boolean;
  networkIdleReached: boolean;
  networkIdleMs: number;
  fontsReadyReached: boolean;
  fontsReadyMs: number;
  scrollRan: boolean;
  scrollMs: number;
  heightStable: boolean;
  imagesStable: boolean;
  requiredStableSamples: number;
  samplesTaken: number;
  stabilityMs: number;
  sampleCapHit: boolean;
  timeCapHit: boolean;
  sampleError?: string;
  finalDocumentHeight: number;
  renderableImages: number;
  imagesLoaded: number;
  imagesFailed: number;
  tailMs: number;
}
interface FixtureNormalizationAttempt {
  index: number;
  fingerprint: string;
  domPath: string;
  signals: string[];
  method: string;
  closeControlLabel?: string;
  closeControlLabelSource?: string;
  closeControlPath?: string;
  outcome: string;
  documentHeightBefore: number;
  documentHeightAfter: number;
  overlayCoverageBefore: number;
  overlayCoverageAfter: number;
  pageScrollLockedBefore: boolean;
  pageScrollLockedAfter: boolean;
  evidenceDir?: string;
  error?: string;
  /** Task 28.75. */
  shapeClass?: "cover" | "panel";
  widthCoverage?: number;
  heightCoverage?: number;
}
interface FixtureNormalization {
  ran: boolean;
  scans: number;
  structuralMatches: number;
  headerLikeRefused: number;
  /** Task 28.75 — panel-tier admissions the COVER gate did not admit. */
  panelMatches?: number;
  qualified: number;
  dismissed: number;
  attempts: FixtureNormalizationAttempt[];
  attemptCapHit: boolean;
  initialPaintCensusAvailable: boolean;
  /** Task 28.75. */
  initialPaintCensusStatus?: "available" | "absent" | "partial" | "unreadable";
  limitations: string[];
}
interface FixtureLoadStrategy {
  prepareScroll: boolean;
  networkIdleReached: boolean;
  scrollSteps?: number;
  prepareScrollStatus?: string;
  prepareScrollNavigation?: FixturePrepareScrollNavigation;
  settle?: FixtureSettleOutcome;
  pageStateNormalization?: FixtureNormalization;
}
interface FixtureViewportWithLoad {
  loadStrategy: FixtureLoadStrategy;
  metadata: { finalUrl: string; documentHeight: number };
  overlayCensus?: FixtureOverlayCensus;
  screenshotDegraded?: string;
  files: { screenshot: string };
}
interface FixtureObservationWithLoad {
  viewports: {
    desktop: FixtureViewportWithLoad;
    mobile: FixtureViewportWithLoad;
  };
  layoutProbe?: { file: string };
}

/**
 * Task 28.7 — a per-page status line that always carries the REASON.
 *
 * A fixture check that prints only `url=observation-error` costs a whole round
 * trip to diagnose: the orchestrator already records the error `name`, `message`
 * and `phase` for exactly this purpose, and there is no reason for a check not
 * to print them.
 */
function pageStatusDetail(
  pages: readonly { url: string; status: string; error?: { name: string; message: string; phase: string } }[],
): string {
  return pages
    .map(
      (p) =>
        `${p.url}=${p.status}` +
        (p.error
          ? ` [${p.error.phase}/${p.error.name}: ${p.error.message}]`
          : ""),
    )
    .join(" | ");
}

/** Tall filler so a single 0.85×viewport scroll step really moves the page. */
function tallFiller(px: number): string {
  return `<div style="height:${String(px)}px;background:linear-gradient(#fff,#eee)"><p>filler</p></div>`;
}

/**
 * A page that NAVIGATES AWAY on the first real scroll.
 *
 * `once` uses `sessionStorage` so the SECOND load of the same document (the one
 * the A1 recovery performs) does not navigate again — that is the recoverable
 * shape. Without it the page navigates on every load, which is the shape that
 * must degrade honestly instead of being retried forever.
 */
function scrollNavigatesPage(once: boolean, target: string): string {
  return (
    `<!doctype html><html lang="en"><head><meta charset="utf-8">` +
    `<title>Scroll navigates fixture</title>` +
    `<style>body{margin:0}</style></head><body>` +
    `<h1>Scroll navigates</h1>` +
    tallFiller(6000) +
    `<script>(function(){` +
    `var fired=false;` +
    (once
      ? `try{if(sessionStorage.getItem("wr-nav-done")==="1")return;}catch(e){}`
      : ``) +
    `window.addEventListener("scroll",function(){` +
    `if(fired||window.scrollY<200)return;fired=true;` +
    (once ? `try{sessionStorage.setItem("wr-nav-done","1");}catch(e){}` : ``) +
    `window.location.href=${JSON.stringify(target)};` +
    `},{passive:true});})();</script>` +
    `</body></html>`
  );
}

function startScrollNavigationServer(): Promise<{ server: Server; origin: string }> {
  return new Promise((resolve) => {
    const server = createServer((req, res) => {
      const url = (req.url || "/").split("?")[0];
      res.writeHead(200, {
        "content-type": "text/html; charset=utf-8",
        "cache-control": "no-store",
      });
      if (url === "/nav-once") {
        res.end(scrollNavigatesPage(true, "/nav-landing"));
      } else if (url === "/nav-always") {
        res.end(scrollNavigatesPage(false, "/nav-landing"));
      } else {
        res.end(
          `<!doctype html><html lang="en"><head><meta charset="utf-8">` +
            `<title>Landing</title></head><body><h1>Landing</h1>` +
            `<p>A different document entirely.</p></body></html>`,
        );
      }
    });
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      const port = typeof address === "object" && address ? address.port : 0;
      resolve({ server, origin: `http://127.0.0.1:${String(port)}` });
    });
  });
}

async function testPrepareScrollNavigationSafety(): Promise<void> {
  console.log("");
  console.log(
    "Prepare-scroll navigation safety (real Chromium — a page that navigates mid-scroll)",
  );

  // The shared detector is a pure function; pin it before spending browser time.
  check(
    "the shared detector recognises Playwright's destroyed-context wording",
    isNavigationDestroyedContextError(
      new Error(
        "Execution context was destroyed, most likely because of a navigation.",
      ),
    ) &&
      isNavigationDestroyedContextError(new Error("frame was detached")) &&
      isScrollNavigationInterruption(
        new PageNavigatedDuringScrollError("http://127.0.0.1/other"),
      ),
    "",
  );
  check(
    "…and REFUSES 'target closed' / 'browser closed', which must never be recovered from",
    !isNavigationDestroyedContextError(new Error("Target closed")) &&
      !isNavigationDestroyedContextError(
        new Error("Browser has been closed"),
      ) &&
      !isNavigationDestroyedContextError(new Error("Target crashed")),
    "",
  );
  check(
    "…and a fragment change is NOT a different document (a #hash must not trigger recovery)",
    isSameObservedDocument("http://a.test/p", "http://a.test/p#x") &&
      !isSameObservedDocument("http://a.test/p", "http://a.test/q"),
    "",
  );

  const { server, origin } = await startScrollNavigationServer();
  let browser: Browser | undefined;
  let dir: string | undefined;
  try {
    const selection = buildSelection(origin, [
      { familyId: "f000001", representative: `${origin}/nav-once` },
      { familyId: "f000002", representative: `${origin}/nav-always` },
    ]);
    dir = await mkdtemp(path.join(tmpdir(), "multi-observer-navsafe-"));
    browser = await chromium.launch();

    const run = await observeSelectedPages(selection, {
      concurrency: 1,
      prepareScroll: true,
      normalizePageState: false,
      sourceSelectedPagesFile: "fixture/selected-pages.json",
      browser,
      runId: "fixture-navsafe-run",
      runDir: dir,
    });
    const pages = run.siteObservation.pages;

    /*
     * THE P0 ASSERTION. Before A1 both of these pages were `observation-error`
     * with no `pageObservationFile` at all, and a route with no observation
     * kills the whole reconstruction downstream.
     */
    check(
      "a page that navigates during the preparation scroll is still OBSERVED, " +
        "not lost as an observation-error",
      pages.length === 2 &&
        pages.every((p) => p.status === "success" && p.pageObservationFile),
      pageStatusDetail(pages),
    );

    const load = async (suffix: string): Promise<FixtureObservationWithLoad> => {
      const page = pages.find((p) => p.url.endsWith(suffix));
      if (!page) throw new Error(`no fixture page for ${suffix}`);
      return JSON.parse(
        await readFile(
          path.join(dir!, `pages/${page.pageId}/observation.json`),
          "utf8",
        ),
      ) as FixtureObservationWithLoad;
    };
    const once = await load("/nav-once");
    const always = await load("/nav-always");

    const onceDesktop = once.viewports.desktop.loadStrategy;
    check(
      "a ONE-TIME navigation is detected, recovered by re-navigating to the " +
        "observed URL, and the bounded retry completes",
      onceDesktop.prepareScrollStatus === "prepare-scroll-navigated-recovered" &&
        onceDesktop.prepareScrollNavigation?.leftObservedDocument === true &&
        onceDesktop.prepareScrollNavigation.recoveryNavigated === true &&
        onceDesktop.prepareScrollNavigation.retryAttempted === true &&
        onceDesktop.prepareScrollNavigation.retryNavigated === false,
      JSON.stringify({
        status: onceDesktop.prepareScrollStatus,
        nav: onceDesktop.prepareScrollNavigation,
      }),
    );
    check(
      "…and the recovery names the URL it was dragged to and the URL it went back to",
      onceDesktop.prepareScrollNavigation?.navigatedUrl?.endsWith("/nav-landing") ===
        true &&
        onceDesktop.prepareScrollNavigation.observationUrl.endsWith("/nav-once"),
      JSON.stringify(onceDesktop.prepareScrollNavigation),
    );
    check(
      "…and it still SCROLLED: the recovered retry is a real preparation pass",
      (onceDesktop.scrollSteps ?? 0) >= 1,
      `${String(onceDesktop.scrollSteps)} step(s)`,
    );

    const alwaysDesktop = always.viewports.desktop.loadStrategy;
    check(
      "a page that navigates on EVERY load falls back honestly instead of " +
        "retrying forever",
      alwaysDesktop.prepareScrollStatus === "prepare-scroll-navigated-fallback" &&
        alwaysDesktop.prepareScrollNavigation?.recoveryNavigated === true &&
        alwaysDesktop.prepareScrollNavigation.retryAttempted === true &&
        alwaysDesktop.prepareScrollNavigation.retryNavigated === true,
      JSON.stringify({
        status: alwaysDesktop.prepareScrollStatus,
        nav: alwaysDesktop.prepareScrollNavigation,
      }),
    );
    check(
      "…and it carries a plain-language LIMITATION, so the missing lazy content " +
        "is stated rather than silently absent",
      (alwaysDesktop.prepareScrollNavigation?.limitation ?? "").includes(
        "unscrolled/partial state",
      ),
      alwaysDesktop.prepareScrollNavigation?.limitation ?? "(none)",
    );
    check(
      "…and the fallback RESTORES the observed document, so the collection " +
        "describes the page under observation and not the page it was dragged to",
      alwaysDesktop.prepareScrollNavigation?.restoreNavigated === true &&
        always.viewports.desktop.metadata.finalUrl.endsWith("/nav-always") &&
        always.viewports.mobile.metadata.finalUrl.endsWith("/nav-always"),
      `${always.viewports.desktop.metadata.finalUrl} / ${always.viewports.mobile.metadata.finalUrl}`,
    );
    check(
      "both viewports of both pages record a prepare-scroll status — never silence",
      [once, always].every((o) =>
        [o.viewports.desktop, o.viewports.mobile].every((v) =>
          (v.loadStrategy.prepareScrollStatus ?? "").startsWith("prepare-scroll-"),
        ),
      ),
      [once, always]
        .map(
          (o) =>
            `${String(o.viewports.desktop.loadStrategy.prepareScrollStatus)}/${String(
              o.viewports.mobile.loadStrategy.prepareScrollStatus,
            )}`,
        )
        .join(" | "),
    );

    // The layout probe mirrors the observation's scroll, so it meets the same
    // navigation — and must degrade rather than vanish without explanation.
    const probeFile = always.layoutProbe?.file;
    if (probeFile) {
      const pageEntry = pages.find((p) => p.url.endsWith("/nav-always"))!;
      const probe = JSON.parse(
        await readFile(
          path.join(dir, `pages/${pageEntry.pageId}`, probeFile),
          "utf8",
        ),
      ) as { prepareScrollStatus?: string; finalUrl: string; tags: string[] };
      check(
        "the layout probe survives the same navigation and RECORDS how its own " +
          "preparation scroll ended",
        (probe.prepareScrollStatus ?? "").startsWith("prepare-scroll-navigated") &&
          probe.tags.length > 0,
        `${String(probe.prepareScrollStatus)}, ${probe.tags.length} tag(s)`,
      );
      check(
        "…and it walked the OBSERVED document, not the one it was dragged to",
        probe.finalUrl.endsWith("/nav-always"),
        probe.finalUrl,
      );
    } else {
      check("the layout probe ran on the navigating page", false, "no probe file");
    }
  } finally {
    if (browser) await browser.close();
    server.close();
    if (dir) await rm(dir, { recursive: true, force: true });
  }
}

// ---------------------------------------------------------------------------
// A2 — page-state normalization: TWO positives against FIVE negative controls.
// ---------------------------------------------------------------------------

/**
 * Shared chrome so every fixture below has a real document under the overlay.
 *
 * `responsive` adds the `<meta name="viewport">` tag. It matters: without one,
 * Chromium's MOBILE emulation lays a page out in a 980px layout viewport, so
 * `window.innerWidth` is 980 rather than 390 and every coverage fraction on the
 * mobile pass is computed against the wrong width. The five negative controls
 * predate 28.75 and are left exactly as they were; the 28.75 panel fixtures ask
 * a question ABOUT viewport width, so they opt in and get a real 390.
 */
function normalizeBody(
  extra: string,
  bodyStyle = "",
  responsive = false,
): string {
  return (
    `<!doctype html><html lang="en"><head><meta charset="utf-8">` +
    (responsive
      ? `<meta name="viewport" content="width=device-width,initial-scale=1">`
      : "") +
    `<title>Page-state fixture</title><style>` +
    `body{margin:0;${bodyStyle}}` +
    `.page{padding:16px}` +
    `</style></head><body>` +
    extra +
    `<div class="page"><h1>Underlying page</h1>` +
    tallFiller(2600) +
    `</div></body></html>`
  );
}

/**
 * A real entry popup: full viewport, fixed, above the page, appearing AFTER the
 * initial paint, with a close control labelled from the generic multilingual
 * dismissal vocabulary. `labelAttr` picks whether the label reaches us as text
 * or as an `aria-label`, because a real close control uses both in the wild.
 */
function entryPopupPage(label: string, viaAriaLabel: boolean): string {
  const control = viaAriaLabel
    ? `<button type="button" aria-label="${label}"><span>◻</span></button>`
    : `<button type="button">${label}</button>`;
  return normalizeBody(
    `<style>` +
      `#entry{position:fixed;inset:0;width:100%;height:100%;z-index:9999;` +
      `background:rgba(0,0,0,0.85);color:#fff;display:none}` +
      `#entry.on{display:block}` +
      `</style>` +
      `<div id="entry"><div class="inner"><p>이벤트 안내</p>${control}</div></div>` +
      `<script>` +
      `document.getElementById("entry").addEventListener("click",function(e){` +
      `if(e.target&&e.target.closest("button")){` +
      `document.getElementById("entry").classList.remove("on");` +
      `document.body.style.overflow="";}` +
      `});` +
      `setTimeout(function(){` +
      `document.getElementById("entry").classList.add("on");` +
      `document.body.style.overflow="hidden";},350);` +
      `</script>`,
  );
}

/** (a) A legitimate FIXED HEADER — full width, short. Refused by the shape gate. */
const NEG_FIXED_HEADER = normalizeBody(
  `<style>#hdr{position:fixed;top:0;left:0;width:100%;height:72px;z-index:9000;` +
    `background:#fff;border-bottom:1px solid #ccc}</style>` +
    `<header id="hdr"><nav><a href="#a">Home</a><a href="#b">About</a></nav></header>`,
);

/** (b) A chat-widget-like floating button. Small: refused by the shape gate. */
const NEG_CHAT_WIDGET = normalizeBody(
  `<style>#chat{position:fixed;right:20px;bottom:20px;width:64px;height:64px;` +
    `z-index:99999;border-radius:50%;background:#0a6}</style>` +
    `<button id="chat" type="button" aria-label="채팅 상담">?</button>`,
);

/** (c) A floating accessibility control. Small: refused by the shape gate. */
const NEG_A11Y_CONTROL = normalizeBody(
  `<style>#a11y{position:fixed;left:0;top:30%;width:52px;height:190px;` +
    `z-index:99998;background:#134}</style>` +
    `<div id="a11y" role="toolbar" aria-label="Accessibility options">` +
    `<button type="button" aria-label="Increase text size">A+</button>` +
    `<button type="button" aria-label="High contrast">◐</button></div>`,
);

/**
 * (d) A full-viewport HERO that is not a modal — painting from the FIRST paint,
 * no dialog semantics, no dismissal vocabulary. Carries a fixed header too, so
 * the shape gate's two counters are both non-zero on this page (which is what
 * the census↔normalizer equivalence check below needs).
 */
const NEG_FULL_HERO = normalizeBody(
  `<style>#hdr{position:fixed;top:0;left:0;width:100%;height:72px;z-index:900;` +
    `background:#fff}` +
    `#hero{position:absolute;top:0;left:0;width:100%;height:100vh;z-index:1;` +
    `background:#e8eef6}</style>` +
    `<header id="hdr"><nav><a href="#a">Home</a></nav></header>` +
    `<section id="hero"><h2>Big hero</h2>` +
    `<a href="#more">Learn more</a><button type="button">Get started</button>` +
    `</section>`,
);

/**
 * (e) A page whose SCROLL IS LOCKED but which has no modal at all. The lock is a
 * WEAK signal and can never qualify anything on its own — this is the fixture
 * that fails if that rule is ever relaxed.
 */
const NEG_SCROLL_LOCKED = normalizeBody(
  `<style>#cover{position:absolute;top:0;left:0;width:100%;height:100vh;` +
    `z-index:5;background:#f3efe7}</style>` +
    `<section id="cover"><h2>Scroll-jacked intro</h2>` +
    `<button type="button">Continue</button></section>`,
  "overflow:hidden;",
);

/**
 * Task 28.75 — THE CENTERED DESKTOP PANEL, the shape the old gate was blind to.
 *
 * `min(440px, 90vw)` wide × 70vh tall, centered, lifted, with a painted
 * background — i.e. exactly the proportions the real defect had. Measured:
 *
 *   1440×900 → 440×630 → width 0.306, height 0.700, area 0.214  → COVER refuses
 *   390×844  → 351×591 → width 0.900, height 0.700, area 0.630  → COVER admits
 *
 * (The mobile numbers only hold because these two fixtures declare a
 * `<meta name="viewport">`. Without one, Chromium's mobile emulation lays the
 * page out in a 980px layout viewport and `90vw` stops meaning 351px.)
 *
 * That mirrors seoultone.kr's `section#popup_slider` (0.347/0.904 at 1440,
 * 0.900/0.631 at 390) — the SAME element answering differently at the two
 * viewports purely because of the viewport's width. The suite asserts the same
 * verdict at both.
 *
 * `weakOnly` builds the DISCRIMINATING TWIN: the same box, the same lift, the
 * same painted backdrop, on a scroll-locked page — but painting from the first
 * paint, no dialog semantics, and a control labelled `계속하기` / `Continue`
 * which is NOT in the dismissal vocabulary. Two WEAK signals and no strong one:
 * it must still be refused.
 */
function centeredPanelPage(weakOnly: boolean): string {
  const control = weakOnly
    ? `<button type="button">계속하기 / Continue</button>`
    : `<button type="button" aria-label="닫기"><span>◻</span></button>`;
  const panel =
    `<div id="panel"><p>이벤트 안내 · 가을 이벤트</p>${control}</div>`;
  const style =
    `<style>` +
    `#panel{position:fixed;left:50%;top:50%;transform:translate(-50%,-50%);` +
    `width:min(440px,90vw);height:70vh;z-index:9999;background:#333;color:#fff}` +
    `</style>`;
  if (weakOnly) {
    // Present from the FIRST paint, on a scroll-locked page.
    return normalizeBody(style + panel, "overflow:hidden;", true);
  }
  return normalizeBody(
    style +
      `<style>#panel{display:none}#panel.on{display:block}</style>` +
      panel +
      `<script>` +
      `document.getElementById("panel").addEventListener("click",function(e){` +
      `if(e.target&&e.target.closest("button")){` +
      `document.getElementById("panel").classList.remove("on");` +
      `document.body.style.overflow="";}` +
      `});` +
      `setTimeout(function(){` +
      `document.getElementById("panel").classList.add("on");` +
      `document.body.style.overflow="hidden";},350);` +
      `</script>`,
    "",
    true,
  );
}

const NORMALIZE_PAGES: Record<string, string> = {
  "/popup-close": entryPopupPage("닫기", true),
  "/popup-today": entryPopupPage("오늘 하루 보지 않기", false),
  "/neg-fixed-header": NEG_FIXED_HEADER,
  "/neg-chat-widget": NEG_CHAT_WIDGET,
  "/neg-a11y-control": NEG_A11Y_CONTROL,
  "/neg-full-hero": NEG_FULL_HERO,
  "/neg-scroll-locked": NEG_SCROLL_LOCKED,
  // Task 28.75.
  "/popup-panel": centeredPanelPage(false),
  "/neg-panel-weak-only": centeredPanelPage(true),
};

function startNormalizeServer(): Promise<{ server: Server; origin: string }> {
  return new Promise((resolve) => {
    const server = createServer((req, res) => {
      const url = (req.url || "/").split("?")[0];
      res.writeHead(200, {
        "content-type": "text/html; charset=utf-8",
        "cache-control": "no-store",
      });
      res.end(NORMALIZE_PAGES[url] ?? normalizeBody(""));
    });
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      const port = typeof address === "object" && address ? address.port : 0;
      resolve({ server, origin: `http://127.0.0.1:${String(port)}` });
    });
  });
}

async function testPageStateNormalization(): Promise<void> {
  console.log("");
  console.log(
    "Page-state normalization (real Chromium — 2 entry popups vs 5 negative controls)",
  );

  const { server, origin } = await startNormalizeServer();
  let browser: Browser | undefined;
  let dir: string | undefined;
  let evidenceDir: string | undefined;
  try {
    const routes = Object.keys(NORMALIZE_PAGES);
    const selection = buildSelection(
      origin,
      routes.map((route, i) => ({
        familyId: `f${String(i + 1).padStart(6, "0")}`,
        representative: `${origin}${route}`,
      })),
    );
    dir = await mkdtemp(path.join(tmpdir(), "multi-observer-normalize-"));
    evidenceDir = await mkdtemp(path.join(tmpdir(), "multi-observer-evidence-"));
    browser = await chromium.launch();

    const run = await observeSelectedPages(selection, {
      concurrency: 2,
      // OFF: this section is about the normalization phase, and a scroll would
      // add an unrelated reason for the page geometry to move.
      prepareScroll: false,
      normalizePageState: true,
      pageStateEvidenceRoot: evidenceDir,
      sourceSelectedPagesFile: "fixture/selected-pages.json",
      browser,
      runId: "fixture-normalize-run",
      runDir: dir,
    });
    const pages = run.siteObservation.pages;
    check(
      "every page-state fixture observed successfully",
      pages.length === routes.length && pages.every((p) => p.status === "success"),
      pageStatusDetail(pages),
    );

    const byRoute = new Map<string, FixtureObservationWithLoad>();
    const pageIdByRoute = new Map<string, string>();
    for (const route of routes) {
      const entry = pages.find((p) => p.url.endsWith(route));
      if (!entry) continue;
      pageIdByRoute.set(route, entry.pageId);
      // A page that failed has no artifact. Skipping it keeps EVERY remaining
      // check reporting instead of aborting the section on the first ENOENT —
      // the check above has already named the failure and its error.
      if (entry.status !== "success") continue;
      byRoute.set(
        route,
        JSON.parse(
          await readFile(
            path.join(dir, `pages/${entry.pageId}/observation.json`),
            "utf8",
          ),
        ) as FixtureObservationWithLoad,
      );
    }
    const norm = (route: string): FixtureNormalization | undefined =>
      byRoute.get(route)?.viewports.desktop.loadStrategy.pageStateNormalization;

    // --- POSITIVE: an entry popup with an aria-labelled 닫기 control --------
    const closePopup = norm("/popup-close");
    const closeAttempt = closePopup?.attempts[0];
    check(
      "an entry popup with a `닫기` close control is DISMISSED, once, by clicking " +
        "the control inside it",
      closePopup?.ran === true &&
        closePopup.dismissed === 1 &&
        closePopup.attempts.length === 1 &&
        closeAttempt?.method === "close-control" &&
        closeAttempt.outcome === "dismissed",
      JSON.stringify({
        dismissed: closePopup?.dismissed,
        attempts: closePopup?.attempts.map((a) => `${a.method}:${a.outcome}`),
        limitations: closePopup?.limitations,
      }),
    );
    check(
      "…and the record names the control it used and where the label came from",
      closeAttempt?.closeControlLabel === "닫기" &&
        closeAttempt.closeControlLabelSource === "aria-label" &&
        (closeAttempt.closeControlPath ?? "").includes("button"),
      JSON.stringify({
        label: closeAttempt?.closeControlLabel,
        source: closeAttempt?.closeControlLabelSource,
        path: closeAttempt?.closeControlPath,
      }),
    );
    check(
      "…and it names the exact signals that qualified it — two of them, both STRONG",
      closeAttempt !== undefined &&
        closeAttempt.signals.includes("appeared-after-initial-paint") &&
        closeAttempt.signals.includes("close-control-inside"),
      JSON.stringify(closeAttempt?.signals),
    );
    check(
      "…and it VERIFIED the dismissal against the page: the overlay no longer covers",
      closeAttempt !== undefined &&
        closeAttempt.overlayCoverageBefore >= 0.5 &&
        closeAttempt.overlayCoverageAfter < 0.5 &&
        closeAttempt.pageScrollLockedBefore === true &&
        closeAttempt.pageScrollLockedAfter === false,
      JSON.stringify({
        before: closeAttempt?.overlayCoverageBefore,
        after: closeAttempt?.overlayCoverageAfter,
        lockBefore: closeAttempt?.pageScrollLockedBefore,
        lockAfter: closeAttempt?.pageScrollLockedAfter,
      }),
    );
    check(
      "…and the popup is GONE from the collected page: the overlay census that " +
        "runs after normalization flags nothing",
      (byRoute.get("/popup-close")?.viewports.desktop.overlayCensus?.flagged ?? -1) ===
        0,
      JSON.stringify(byRoute.get("/popup-close")?.viewports.desktop.overlayCensus),
    );

    // --- POSITIVE: the 오늘 하루 보지 않기 phrasing, as button TEXT ---------
    const todayPopup = norm("/popup-today");
    check(
      "an entry popup whose control reads `오늘 하루 보지 않기` is dismissed too — " +
        "the vocabulary is generic, not a single hard-coded word",
      todayPopup?.dismissed === 1 &&
        todayPopup.attempts[0]?.closeControlLabel === "오늘 하루 보지 않기" &&
        todayPopup.attempts[0].closeControlLabelSource === "text" &&
        todayPopup.attempts[0].outcome === "dismissed",
      JSON.stringify({
        dismissed: todayPopup?.dismissed,
        label: todayPopup?.attempts[0]?.closeControlLabel,
        source: todayPopup?.attempts[0]?.closeControlLabelSource,
      }),
    );

    // --- EVIDENCE, for a real attempt --------------------------------------
    const evidence = closeAttempt?.evidenceDir;
    check(
      "the dismissal wrote an evidence directory named for the page and viewport",
      evidence !== undefined &&
        evidence.includes(`${pageIdByRoute.get("/popup-close") ?? "?"}-desktop-1`),
      evidence ?? "(none)",
    );
    if (evidence) {
      const beforeStat = await stat(path.join(evidence, "before.png")).catch(
        () => undefined,
      );
      const afterStat = await stat(path.join(evidence, "after.png")).catch(
        () => undefined,
      );
      check(
        "…holding a before AND an after screenshot, both non-empty",
        (beforeStat?.size ?? 0) > 0 && (afterStat?.size ?? 0) > 0,
        `${String(beforeStat?.size)} / ${String(afterStat?.size)} bytes`,
      );
      const record = JSON.parse(
        await readFile(path.join(evidence, "record.json"), "utf8"),
      ) as {
        url?: string;
        viewport?: string;
        overlay?: Record<string, unknown>;
        signals?: string[];
        closeControl?: { label?: string; foundBy?: string } | null;
        outcome?: string;
        geometry?: { changed?: boolean; documentHeightBefore?: number };
        error?: string | null;
      };
      check(
        "…and a record.json carrying url, viewport, node identity, signals, the " +
          "close control, the outcome and the measured geometry change",
        record.url?.endsWith("/popup-close") === true &&
          record.viewport === "desktop" &&
          typeof record.overlay?.domPath === "string" &&
          typeof record.overlay.zIndex === "number" &&
          Array.isArray(record.signals) &&
          record.closeControl?.label === "닫기" &&
          record.closeControl.foundBy ===
            "label-vocabulary-match-inside-overlay" &&
          record.outcome === "dismissed" &&
          record.geometry?.changed === true &&
          record.error === null,
        JSON.stringify(record).slice(0, 400),
      );
    }

    /* --- THE NEGATIVE CONTROLS -------------------------------------------
     * A false positive here deletes a real header, a chat widget, an
     * accessibility control or a legitimate hero — which is worse than the
     * defect the phase exists for. None of these five may be touched.
     */
    const negatives: { route: string; what: string }[] = [
      { route: "/neg-fixed-header", what: "a legitimate fixed HEADER" },
      { route: "/neg-chat-widget", what: "a chat-widget-like floating button" },
      { route: "/neg-a11y-control", what: "a floating accessibility control" },
      { route: "/neg-full-hero", what: "a full-viewport HERO that is not a modal" },
      {
        route: "/neg-scroll-locked",
        what: "a page whose scroll is LOCKED but has no modal",
      },
    ];
    for (const negative of negatives) {
      const record = norm(negative.route);
      const mobileRecord =
        byRoute.get(negative.route)?.viewports.mobile.loadStrategy
          .pageStateNormalization;
      check(
        `${negative.what} is NOT dismissed — nothing is attempted on it, at either viewport`,
        record?.ran === true &&
          record.dismissed === 0 &&
          record.attempts.length === 0 &&
          record.qualified === 0 &&
          mobileRecord?.dismissed === 0 &&
          mobileRecord.attempts.length === 0,
        JSON.stringify({
          desktop: {
            qualified: record?.qualified,
            attempts: record?.attempts.length,
            matches: record?.structuralMatches,
            limitations: record?.limitations,
          },
          mobile: {
            attempts: mobileRecord?.attempts.length,
            qualified: mobileRecord?.qualified,
          },
        }),
      );
      /* Task 28.75 — the WIDENED gate re-asserted against the same control at
       * BOTH viewports. `qualified === 0` on each side is the load-bearing
       * claim (the check above only pins mobile's attempts), and
       * `panelMatches === 0` says the new PANEL tier did not even admit it as a
       * candidate. These are the reason widening the gate is safe.
       */
      check(
        `…and the WIDENED (panel-tier) gate still refuses ${negative.what} at ` +
          `BOTH 1440 and 390 — qualified 0/0`,
        record?.qualified === 0 &&
          mobileRecord?.qualified === 0 &&
          (record.panelMatches ?? 0) === 0 &&
          (mobileRecord.panelMatches ?? 0) === 0,
        JSON.stringify({
          desktop: {
            qualified: record?.qualified,
            panelMatches: record?.panelMatches,
            cover: record?.structuralMatches,
            headerLike: record?.headerLikeRefused,
          },
          mobile: {
            qualified: mobileRecord?.qualified,
            panelMatches: mobileRecord?.panelMatches,
            cover: mobileRecord?.structuralMatches,
            headerLike: mobileRecord?.headerLikeRefused,
          },
        }),
      );
    }
    check(
      "the fixed header and the small floating controls are refused by SHAPE — " +
        "they never even become candidates",
      norm("/neg-fixed-header")?.headerLikeRefused === 1 &&
        norm("/neg-fixed-header")?.structuralMatches === 0 &&
        norm("/neg-chat-widget")?.structuralMatches === 0 &&
        norm("/neg-chat-widget")?.headerLikeRefused === 0 &&
        norm("/neg-a11y-control")?.structuralMatches === 0,
      JSON.stringify({
        header: norm("/neg-fixed-header"),
        chat: norm("/neg-chat-widget")?.structuralMatches,
        a11y: norm("/neg-a11y-control")?.structuralMatches,
      }),
    );
    check(
      "the hero and the scroll-locked cover ARE modal-shaped — the test " +
        "discriminates, and they are refused on EVIDENCE rather than on shape",
      (norm("/neg-full-hero")?.structuralMatches ?? 0) >= 1 &&
        norm("/neg-full-hero")?.qualified === 0 &&
        (norm("/neg-scroll-locked")?.structuralMatches ?? 0) >= 1 &&
        norm("/neg-scroll-locked")?.qualified === 0,
      JSON.stringify({
        hero: norm("/neg-full-hero")?.structuralMatches,
        locked: norm("/neg-scroll-locked")?.structuralMatches,
      }),
    );

    /* =====================================================================
     * Task 28.75 — THE CENTERED DESKTOP PANEL
     * =====================================================================
     * The measured defect: `OVERLAY_SHAPE` needs ≥0.5 of the viewport WIDTH, and
     * a centered desktop modal is narrower than half a wide viewport. On
     * seoultone.kr `/`, same page and same load, the popup covered 0.900 of the
     * width at 390 and 0.347 at 1440 — so the gate refused it BY CONSTRUCTION at
     * exactly the width reconstruction is graded at, and the 1440 clone shipped
     * with the popup baked over the homepage.
     */
    const panelDesktop = norm("/popup-panel");
    const panelMobile =
      byRoute.get("/popup-panel")?.viewports.mobile.loadStrategy
        .pageStateNormalization;
    const panelAttempt = panelDesktop?.attempts[0];
    check(
      "a centered DESKTOP modal (~30% of a 1440 viewport) is dismissed — the " +
        "shape the pre-28.75 gate could not see at all",
      panelDesktop?.ran === true &&
        panelDesktop.dismissed === 1 &&
        panelDesktop.attempts.length === 1 &&
        panelAttempt?.method === "close-control" &&
        panelAttempt.outcome === "dismissed",
      JSON.stringify({
        dismissed: panelDesktop?.dismissed,
        attempts: panelDesktop?.attempts.map((a) => `${a.method}:${a.outcome}`),
        limitations: panelDesktop?.limitations,
      }),
    );
    check(
      "…and it is recorded as the PANEL tier, with the exact arithmetic that " +
        "made the OLD cover gate refuse it: widthCoverage < OVERLAY_SHAPE.minWidthCoverage",
      panelAttempt?.shapeClass === "panel" &&
        (panelAttempt.widthCoverage ?? 1) < OVERLAY_SHAPE.minWidthCoverage &&
        (panelAttempt.heightCoverage ?? 0) >= OVERLAY_SHAPE.minHeightCoverage &&
        (panelDesktop?.panelMatches ?? 0) >= 1 &&
        panelDesktop?.structuralMatches === 0,
      JSON.stringify({
        shapeClass: panelAttempt?.shapeClass,
        widthCoverage: panelAttempt?.widthCoverage,
        heightCoverage: panelAttempt?.heightCoverage,
        oldGateMinWidth: OVERLAY_SHAPE.minWidthCoverage,
        panelMatches: panelDesktop?.panelMatches,
        coverMatches: panelDesktop?.structuralMatches,
      }),
    );
    check(
      "…and the SAME element gets the SAME answer at 390, where it happens to " +
        "be COVER-shaped — one element, two viewports, one verdict",
      panelMobile?.dismissed === 1 &&
        panelMobile.attempts.length === 1 &&
        panelMobile.attempts[0]?.outcome === "dismissed" &&
        panelMobile.attempts[0].shapeClass === "cover" &&
        (panelMobile.attempts[0].widthCoverage ?? 0) >=
          OVERLAY_SHAPE.minWidthCoverage,
      JSON.stringify({
        mobile: {
          dismissed: panelMobile?.dismissed,
          shapeClass: panelMobile?.attempts[0]?.shapeClass,
          widthCoverage: panelMobile?.attempts[0]?.widthCoverage,
        },
        desktop: {
          dismissed: panelDesktop?.dismissed,
          shapeClass: panelAttempt?.shapeClass,
          widthCoverage: panelAttempt?.widthCoverage,
        },
      }),
    );
    check(
      "…and the dismissal is VERIFIED against the page rather than assumed: the " +
        "panel no longer covers and the page scroll lock was released",
      panelAttempt !== undefined &&
        panelAttempt.overlayCoverageBefore >= PANEL_SHAPE.minAreaCoverage &&
        panelAttempt.overlayCoverageAfter === 0 &&
        panelAttempt.pageScrollLockedBefore === true &&
        panelAttempt.pageScrollLockedAfter === false,
      JSON.stringify({
        before: panelAttempt?.overlayCoverageBefore,
        after: panelAttempt?.overlayCoverageAfter,
        lockBefore: panelAttempt?.pageScrollLockedBefore,
        lockAfter: panelAttempt?.pageScrollLockedAfter,
      }),
    );
    check(
      "…and the collector's COVER-only overlay census still flags nothing on " +
        "that page — the census is deliberately NOT widened, only the normalizer",
      (byRoute.get("/popup-panel")?.viewports.desktop.overlayCensus?.flagged ??
        -1) === 0,
      JSON.stringify(byRoute.get("/popup-panel")?.viewports.desktop.overlayCensus),
    );

    /* --- THE DISCRIMINATING TWIN -----------------------------------------
     * The same box, the same lift, the same painted backdrop, the same page
     * scroll lock — and only WEAK signals. It must be ADMITTED by the panel
     * tier (otherwise this test proves nothing) and REFUSED on evidence.
     */
    const twin = norm("/neg-panel-weak-only");
    const twinMobile =
      byRoute.get("/neg-panel-weak-only")?.viewports.mobile.loadStrategy
        .pageStateNormalization;
    check(
      "the WEAK-ONLY twin of that panel IS admitted by the panel tier — the " +
        "test discriminates rather than being refused on shape",
      (twin?.panelMatches ?? 0) >= 1,
      JSON.stringify({
        panelMatches: twin?.panelMatches,
        cover: twin?.structuralMatches,
        headerLike: twin?.headerLikeRefused,
      }),
    );
    check(
      "…and it is REFUSED anyway, at BOTH viewports: two WEAK signals never " +
        "clear the bar without a STRONG one",
      twin?.qualified === 0 &&
        twin.dismissed === 0 &&
        twin.attempts.length === 0 &&
        twinMobile?.qualified === 0 &&
        twinMobile.dismissed === 0 &&
        twinMobile.attempts.length === 0,
      JSON.stringify({
        desktop: {
          qualified: twin?.qualified,
          attempts: twin?.attempts.length,
          panelMatches: twin?.panelMatches,
        },
        mobile: {
          qualified: twinMobile?.qualified,
          attempts: twinMobile?.attempts.length,
          panelMatches: twinMobile?.panelMatches,
        },
      }),
    );

    /* --- SYMMETRY (Task 28.75 acceptance 2), on the fixture run ------------
     * A source route that is popup-normalized at one viewport must be
     * popup-normalized at the other. The asymmetry this pins is the exact
     * defect: seoultone `/` read {1,1,1} at 390 and {0,0,0} at 1440.
     */
    const asymmetric: string[] = [];
    for (const route of routes) {
      const obs = byRoute.get(route);
      if (!obs) continue;
      const d = obs.viewports.desktop.loadStrategy.pageStateNormalization;
      const m = obs.viewports.mobile.loadStrategy.pageStateNormalization;
      if (!d?.ran || !m?.ran) continue;
      // Not comparable if the two viewports did not land on the same document.
      if (obs.viewports.desktop.metadata.finalUrl !== obs.viewports.mobile.metadata.finalUrl)
        continue;
      if (d.dismissed > 0 !== m.dismissed > 0) {
        asymmetric.push(
          `${route} desktop=${String(d.dismissed)} mobile=${String(m.dismissed)}`,
        );
      }
    }
    check(
      "NORMALIZATION SYMMETRY across viewports: every fixture route answers the " +
        "same at 1440 and 390",
      asymmetric.length === 0,
      asymmetric.join(" | ") || `${String(routes.length)} routes, all symmetric`,
    );

    /* --- ANTI-DRIFT: the census and the normalizer share ONE shape gate ----
     * Neither in-page pass can import the other's helpers (Playwright
     * serializes only the function it is handed), so the thresholds come from
     * ONE constant and this check pins the two passes to the same verdict on a
     * page carrying BOTH a shape match and a header-like refusal.
     */
    const heroCensus = byRoute.get("/neg-full-hero")?.viewports.desktop.overlayCensus;
    const heroNorm = norm("/neg-full-hero");
    check(
      "the collector's overlay census and the normalizer's shape gate agree " +
        "element-for-element on the same page (shared OVERLAY_SHAPE thresholds)",
      heroCensus !== undefined &&
        heroNorm !== undefined &&
        heroCensus.structuralMatches === heroNorm.structuralMatches &&
        heroCensus.headerLikeRefused === heroNorm.headerLikeRefused &&
        heroCensus.headerLikeRefused >= 1,
      JSON.stringify({
        census: {
          matches: heroCensus?.structuralMatches,
          header: heroCensus?.headerLikeRefused,
        },
        normalizer: {
          matches: heroNorm?.structuralMatches,
          header: heroNorm?.headerLikeRefused,
        },
      }),
    );

    // --- the opt-out is real, and says so ---------------------------------
    const optOutDir = await mkdtemp(path.join(tmpdir(), "multi-observer-optout-"));
    try {
      const optOut = await observeSelectedPages(
        buildSelection(origin, [
          { familyId: "f000001", representative: `${origin}/popup-close` },
        ]),
        {
          concurrency: 1,
          prepareScroll: false,
          normalizePageState: false,
          pageStateEvidenceRoot: evidenceDir,
          sourceSelectedPagesFile: "fixture/selected-pages.json",
          browser,
          runId: "fixture-normalize-optout-run",
          runDir: optOutDir,
        },
      );
      const observation = JSON.parse(
        await readFile(
          path.join(
            optOutDir,
            `pages/${optOut.siteObservation.pages[0]!.pageId}/observation.json`,
          ),
          "utf8",
        ),
      ) as FixtureObservationWithLoad;
      const skipped =
        observation.viewports.desktop.loadStrategy.pageStateNormalization;
      check(
        "--no-normalize-page-state leaves the popup in place and RECORDS that it " +
          "did, rather than going quiet",
        skipped?.ran === false &&
          skipped.attempts.length === 0 &&
          skipped.limitations.some((l) => l.includes("--no-normalize-page-state")) &&
          (observation.viewports.desktop.overlayCensus?.flagged ?? 0) === 1,
        JSON.stringify({
          skipped,
          flagged: observation.viewports.desktop.overlayCensus?.flagged,
        }),
      );
    } finally {
      await rm(optOutDir, { recursive: true, force: true });
    }
  } finally {
    if (browser) await browser.close();
    server.close();
    if (dir) await rm(dir, { recursive: true, force: true });
    if (evidenceDir) await rm(evidenceDir, { recursive: true, force: true });
  }
}

// ---------------------------------------------------------------------------
// Task 28.75 — CONTENT LOSS: the scroll pass that never scrolled, and the
// computed-style whitelist that never carried `float`.
// ---------------------------------------------------------------------------

/**
 * A page whose reveal animation only fires once each block is scrolled into
 * view. `smooth` adds the ONE CSS declaration that used to defeat the pass:
 * `html { scroll-behavior: smooth }` makes `window.scrollBy` asynchronous, so a
 * `window.scrollY` read taken synchronously right after it always reported zero
 * movement and the pass broke out of its loop having travelled 0 px.
 */
function smoothScrollRevealPage(smooth: boolean): string {
  const blocks = Array.from(
    { length: SMOOTH_REVEAL_BLOCKS },
    (_, i) =>
      `<section class="rv" id="rv${String(i)}"><p>revealed block ${String(i)}</p></section>`,
  ).join("");
  return (
    `<!doctype html><html lang="en"><head><meta charset="utf-8">` +
    `<meta name="viewport" content="width=device-width,initial-scale=1">` +
    `<title>Smooth-scroll reveal fixture</title><style>` +
    (smooth ? `html{scroll-behavior:smooth}` : "") +
    `body{margin:0}` +
    `.rv{height:70vh;opacity:0;transition:opacity 60ms linear;` +
    `background:linear-gradient(#fff,#eee)}` +
    `.rv.on{opacity:1}` +
    `</style></head><body>${blocks}<script>` +
    `var io=new IntersectionObserver(function(es){` +
    `es.forEach(function(e){if(e.isIntersecting)e.target.classList.add("on");});` +
    `},{threshold:0.15});` +
    `document.querySelectorAll(".rv").forEach(function(el){io.observe(el);});` +
    `</script></body></html>`
  );
}

/**
 * A page that is TALLER than the viewport and genuinely CANNOT be scrolled — a
 * scroll-jacking intro, the shape that must not cost the pass its whole step
 * budget.
 *
 * `overflow: hidden` alone is NOT enough and the first version of this fixture
 * was wrong for that reason: `hidden` blocks USER scrolling but leaves the
 * viewport programmatically scrollable, so `scrollTo` moved it 5,116px. The
 * `scroll` listener that snaps back to 0 is what actually pins it, and it is
 * also what real scroll-jacking libraries do.
 */
const SCROLL_PINNED_PAGE =
  `<!doctype html><html lang="en"><head><meta charset="utf-8">` +
  `<meta name="viewport" content="width=device-width,initial-scale=1">` +
  `<title>Pinned fixture</title><style>html,body{margin:0;overflow:hidden}` +
  `</style></head><body>${tallFiller(6000)}<script>` +
  `window.addEventListener("scroll",function(){` +
  `if(window.scrollY!==0)window.scrollTo(0,0);});` +
  `</script></body></html>`;

const SMOOTH_REVEAL_BLOCKS = 8;

const SCROLL_PAGES: Record<string, string> = {
  "/smooth": smoothScrollRevealPage(true),
  "/instant": smoothScrollRevealPage(false),
  "/pinned": SCROLL_PINNED_PAGE,
};

function startScrollServer(): Promise<{ server: Server; origin: string }> {
  return new Promise((resolve) => {
    const server = createServer((req, res) => {
      const url = (req.url || "/").split("?")[0];
      res.writeHead(200, {
        "content-type": "text/html; charset=utf-8",
        "cache-control": "no-store",
      });
      res.end(SCROLL_PAGES[url] ?? SCROLL_PAGES["/instant"]);
    });
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      const port = typeof address === "object" && address ? address.port : 0;
      resolve({ server, origin: `http://127.0.0.1:${String(port)}` });
    });
  });
}

async function testScrollPassTraversal(): Promise<void> {
  console.log("");
  console.log(
    "Preparation scroll traversal (real Chromium — `scroll-behavior: smooth`, " +
      "the declaration that used to stop the Observer scrolling at all)",
  );

  /* --- THE MIRROR INVARIANT, first: it is pure and costs nothing ----------
   * Task 28.6 W6 O5 added five table properties to STYLE_WHITELIST without
   * mirroring them into QA_STYLE_PROPERTIES, and the 28.5B superset invariant
   * stayed red until 28.7 found it. This check makes that mistake impossible to
   * re-make without a red suite in THIS file too, not only in
   * scripts/smoke-qa-independence.ts.
   */
  const qa = new Set(QA_STYLE_PROPERTIES);
  const notMirrored = STYLE_WHITELIST.filter((prop) => !qa.has(prop));
  check(
    "SUPERSET INVARIANT: every property in the Observer's STYLE_WHITELIST is " +
      "also in the QA capture's QA_STYLE_PROPERTIES",
    notMirrored.length === 0,
    notMirrored.join(", ") ||
      `${String(STYLE_WHITELIST.length)} observer ⊆ ${String(qa.size)} QA`,
  );
  check(
    "…and the three properties Task 28.75 added are present on BOTH sides",
    (["float", "clear", "text-indent"] as const).every(
      (prop) => STYLE_WHITELIST.includes(prop) && qa.has(prop),
    ),
    JSON.stringify(
      (["float", "clear", "text-indent"] as const).map((prop) => ({
        prop,
        observer: STYLE_WHITELIST.includes(prop),
        qa: qa.has(prop),
      })),
    ),
  );

  const { server, origin } = await startScrollServer();
  let browser: Browser | undefined;
  try {
    browser = await chromium.launch();

    /** One preparation scroll against a raw page, plus what it left behind. */
    const traverse = async (
      route: string,
    ): Promise<{
      steps: number;
      distancePx: number;
      status: string;
      docHeight: number;
      innerHeight: number;
      deepest: number;
      zeroOpacityBlocks: number;
      elapsedMs: number;
    }> => {
      const ctx = await browser!.newContext({
        viewport: { width: 1440, height: 900 },
      });
      const page = await ctx.newPage();
      await page.goto(`${origin}${route}`, { waitUntil: "load" });
      // Record the deepest scrollY the page ever reached, from inside the page,
      // so the measurement does not depend on the pass reporting honestly.
      await page.evaluate(() => {
        (window as unknown as Record<string, unknown>).__deepest = 0;
        window.addEventListener("scroll", () => {
          const w = window as unknown as Record<string, number>;
          if (window.scrollY > w.__deepest!) w.__deepest = window.scrollY;
        });
      });
      const t0 = Date.now();
      const result = await autoScrollPrepare(page, {
        observationUrl: `${origin}${route}`,
      });
      const elapsedMs = Date.now() - t0;
      const after = await page.evaluate(() => ({
        docHeight: document.documentElement.scrollHeight,
        innerHeight: window.innerHeight,
        deepest: Math.round(
          (window as unknown as Record<string, number>).__deepest ?? 0,
        ),
        zeroOpacityBlocks: Array.from(document.querySelectorAll(".rv")).filter(
          (el) => parseFloat(getComputedStyle(el).opacity || "1") < 0.05,
        ).length,
      }));
      await ctx.close();
      return { ...result, ...after, elapsedMs };
    };

    const smooth = await traverse("/smooth");
    const instant = await traverse("/instant");
    const pinned = await traverse("/pinned");

    check(
      "a page with `html { scroll-behavior: smooth }` is TRAVERSED TO THE " +
        "BOTTOM — the defect was that the pass broke on step 1 having moved 0px",
      smooth.steps > 1 &&
        smooth.deepest + smooth.innerHeight >= smooth.docHeight - 4,
      JSON.stringify({
        steps: smooth.steps,
        distancePx: smooth.distancePx,
        deepest: smooth.deepest,
        needed: smooth.docHeight - smooth.innerHeight,
        status: smooth.status,
      }),
    );
    check(
      "…and the scroll-triggered reveal therefore FIRED on every block: nothing " +
        "is left at opacity 0 for the collector to record as blank",
      smooth.zeroOpacityBlocks === 0,
      `${String(smooth.zeroOpacityBlocks)} of ${String(SMOOTH_REVEAL_BLOCKS)} ` +
        `blocks still at opacity 0`,
    );
    check(
      "…and it reports the same traversal as the identical page WITHOUT " +
        "`scroll-behavior: smooth` — the declaration no longer changes the answer",
      instant.zeroOpacityBlocks === 0 &&
        instant.deepest + instant.innerHeight >= instant.docHeight - 4 &&
        Math.abs(smooth.steps - instant.steps) <= 2,
      JSON.stringify({
        smooth: { steps: smooth.steps, deepest: smooth.deepest },
        instant: { steps: instant.steps, deepest: instant.deepest },
      }),
    );
    check(
      "…and both report `prepare-scroll-complete`",
      smooth.status === "prepare-scroll-complete" &&
        instant.status === "prepare-scroll-complete",
      `${smooth.status} / ${instant.status}`,
    );
    check(
      "a page that is TALLER than the viewport but cannot scroll at all ends " +
        `the pass after ${String(SCROLL_NO_PROGRESS_TOLERANCE)} stalled steps ` +
        "rather than burning the whole step budget",
      pinned.steps <= SCROLL_NO_PROGRESS_TOLERANCE + 1 &&
        pinned.distancePx === 0 &&
        pinned.elapsedMs <
          (SCROLL_NO_PROGRESS_TOLERANCE + 2) * SCROLL_STEP_SETTLE_MS + 4_000,
      JSON.stringify({
        steps: pinned.steps,
        distance: pinned.distancePx,
        elapsedMs: pinned.elapsedMs,
        cap: SCROLL_MAX_STEPS,
      }),
    );
    check(
      "…and the tolerance is genuinely bounded below the step cap, so the " +
        "stall guard is doing the stopping",
      SCROLL_NO_PROGRESS_TOLERANCE >= 2 &&
        SCROLL_NO_PROGRESS_TOLERANCE < SCROLL_MAX_STEPS,
      `${String(SCROLL_NO_PROGRESS_TOLERANCE)} < ${String(SCROLL_MAX_STEPS)}`,
    );
    check(
      "the scroll policy's step budget can still reach a long page: " +
        "SCROLL_MAX_STEPS × step ≥ the pre-28.75 reach",
      SCROLL_MAX_STEPS * SCROLL_STEP_FRACTION >= 40 * 0.85 &&
        SCROLL_MAX_TOTAL_MS >= SCROLL_MAX_STEPS * SCROLL_STEP_SETTLE_MS,
      JSON.stringify({
        steps: SCROLL_MAX_STEPS,
        fraction: SCROLL_STEP_FRACTION,
        settleMs: SCROLL_STEP_SETTLE_MS,
        totalMs: SCROLL_MAX_TOTAL_MS,
      }),
    );
  } finally {
    if (browser) await browser.close();
    server.close();
  }
}

// ---------------------------------------------------------------------------
// Task 28.75 — the PUBLIC page-state API, the module's no-DOM-deletion
// invariant, the evidence root, and cross-viewport symmetry on REAL sites.
// ---------------------------------------------------------------------------

/**
 * An auditor greps the module for a DOM-deletion path. So does this check.
 *
 * Comments are stripped first, exactly as an auditor would read past them: the
 * module DOCUMENTS that it never removes anything and never forces a click, and
 * a check that matched the documentation instead of the code would be worse
 * than no check at all.
 */
function stripComments(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .replace(/(^|[^:])\/\/[^\n]*/g, "$1 ");
}

async function testPageStateApiAndSafety(): Promise<void> {
  console.log("");
  console.log(
    "Page-state API contract, no-DOM-deletion invariant and evidence root (28.75)",
  );

  // --- (1) THE NO-DOM-DELETION INVARIANT, asserted on the source text ------
  const moduleFile = fileURLToPath(
    new URL("../src/observer/normalize-page-state.ts", import.meta.url),
  );
  const moduleSource = readFileSync(moduleFile, "utf8");
  const code = stripComments(moduleSource);
  const forbidden: { name: string; re: RegExp }[] = [
    { name: "element removal", re: /\.remove\s*\(/ },
    { name: "removeChild", re: /removeChild/ },
    { name: "replaceChild", re: /replaceChild/ },
    { name: "innerHTML write", re: /innerHTML\s*=/ },
    { name: "outerHTML write", re: /outerHTML\s*=/ },
    { name: "inline style write", re: /\.style\./ },
    { name: "setProperty", re: /setProperty\s*\(/ },
    { name: "setAttribute", re: /setAttribute\s*\(/ },
    { name: "removeAttribute", re: /removeAttribute\s*\(/ },
    { name: "classList write", re: /classList\./ },
    { name: "hidden write", re: /\.hidden\s*=/ },
    { name: "forced click", re: /force\s*:\s*true/ },
    { name: "synthetic event dispatch", re: /dispatchEvent\s*\(/ },
  ];
  const found = forbidden.filter((f) => f.re.test(code)).map((f) => f.name);
  check(
    "normalize-page-state.ts contains NO DOM-deletion or DOM-mutation form at " +
      "all — not even an off-by-default one (asserted on the source, comments " +
      "stripped)",
    found.length === 0,
    found.join(", ") || `${String(forbidden.length)} forms checked, none present`,
  );
  check(
    "…and the check is not vacuous: the same matcher DOES fire on a source " +
      "that carries one",
    stripComments("const x = 1; // el.remove()\nel.remove();").includes(
      "el.remove()",
    ) &&
      forbidden.some((f) => f.re.test(stripComments("el.remove();"))) &&
      !forbidden.some((f) => f.re.test(stripComments("// el.remove();"))),
  );

  // --- (2) THE EVIDENCE ROOT MUST NOT POINT AT A FROZEN WAVE ---------------
  check(
    "the DEFAULT page-state evidence root is outside docs/result/ — a wave can " +
      "no longer write new evidence into a frozen wave's artifact directory",
    !PAGE_STATE_EVIDENCE_ROOT_DEFAULT.replace(/\\/g, "/").startsWith(
      "docs/result/",
    ) && !PAGE_STATE_EVIDENCE_ROOT_DEFAULT.includes("28.7/"),
    PAGE_STATE_EVIDENCE_ROOT_DEFAULT,
  );
  check(
    "…and no source file hardcodes a page-state evidence path into docs/result/",
    !stripComments(
      readFileSync(
        fileURLToPath(new URL("../src/observer/types.ts", import.meta.url)),
        "utf8",
      ),
    ).includes("docs/result/28.7/evidence"),
  );

  // --- (3) PANEL_SHAPE is a genuinely narrower admission than OVERLAY_SHAPE -
  check(
    "PANEL_SHAPE admits shapes OVERLAY_SHAPE cannot, and still refuses the " +
      "full-bleed header class by construction",
    PANEL_SHAPE.minWidthCoverage < OVERLAY_SHAPE.minWidthCoverage &&
      PANEL_SHAPE.minHeightCoverage < OVERLAY_SHAPE.minHeightCoverage &&
      PANEL_SHAPE.minAreaCoverage < OVERLAY_SHAPE.minAreaCoverage &&
      PANEL_SHAPE.maxFullBleedWidth > OVERLAY_SHAPE.minWidthCoverage &&
      PANEL_SHAPE.minAxisInset > 0,
    JSON.stringify({ PANEL_SHAPE, OVERLAY_SHAPE }),
  );

  // --- (4) THE TWO-CALL API CONTRACT, driven from OUTSIDE the observer -----
  const { server, origin } = await startNormalizeServerForApi();
  let browser: Browser | undefined;
  let evidenceRoot: string | undefined;
  try {
    browser = await chromium.launch();
    evidenceRoot = await mkdtemp(path.join(tmpdir(), "page-state-api-"));

    /** One full two-call (or one-call) cycle against a raw Playwright page. */
    const drive = async (
      route: string,
      runCensus: boolean,
    ): Promise<FixtureNormalization> => {
      const ctx = await browser!.newContext({
        viewport: { width: 1440, height: 900 },
      });
      const page = await ctx.newPage();
      const url = `${origin}${route}`;
      await page.goto(url, { waitUntil: "load" });
      // CALL 1 of the contract — or deliberately skipped.
      if (runCensus) await markInitialPaintCensus(page);
      await page.waitForTimeout(600);
      // CALL 2.
      const record = await normalizePageState(page, {
        observationUrl: url,
        viewportId: "desktop",
        pageId: runCensus ? "api-with-census" : "api-without-census",
        evidenceRoot: evidenceRoot!,
      });
      await ctx.close();
      return record as unknown as FixtureNormalization;
    };

    const withCensus = await drive("/popup-close", true);
    const withoutCensus = await drive("/popup-close", false);

    check(
      "the page-state API is usable from OUTSIDE the observer: two calls against " +
        "a raw Playwright page dismiss the entry popup",
      withCensus.ran === true &&
        withCensus.dismissed === 1 &&
        withCensus.attempts[0]?.outcome === "dismissed",
      JSON.stringify({
        dismissed: withCensus.dismissed,
        outcome: withCensus.attempts[0]?.outcome,
        limitations: withCensus.limitations,
      }),
    );
    check(
      "…with call 1 run, the census is `available` and the STRONG signal " +
        "`appeared-after-initial-paint` contributes",
      withCensus.initialPaintCensusStatus === "available" &&
        withCensus.initialPaintCensusAvailable === true &&
        withCensus.attempts[0]?.signals.includes(
          "appeared-after-initial-paint",
        ) === true,
      JSON.stringify({
        status: withCensus.initialPaintCensusStatus,
        signals: withCensus.attempts[0]?.signals,
      }),
    );
    check(
      "…and SKIPPING call 1 RECORDS the degradation rather than dropping the " +
        "signal silently: status `absent`, a limitation naming " +
        "`markInitialPaintCensus`, and that signal gone",
      withoutCensus.initialPaintCensusStatus === "absent" &&
        withoutCensus.initialPaintCensusAvailable === false &&
        withoutCensus.limitations.some((l) =>
          l.includes("markInitialPaintCensus"),
        ) &&
        withoutCensus.attempts[0]?.signals.includes(
          "appeared-after-initial-paint",
        ) === false,
      JSON.stringify({
        status: withoutCensus.initialPaintCensusStatus,
        signals: withoutCensus.attempts[0]?.signals,
        limitations: withoutCensus.limitations,
      }),
    );
    check(
      "…and the degraded call still dismisses on the REMAINING evidence — the " +
        "contract degrades, it does not fail",
      withoutCensus.dismissed === 1 &&
        withoutCensus.attempts[0]?.outcome === "dismissed",
      JSON.stringify({
        dismissed: withoutCensus.dismissed,
        outcome: withoutCensus.attempts[0]?.outcome,
      }),
    );
    check(
      "…and every attempt wrote its evidence under the root the CALLER passed, " +
        "not under a hardcoded one",
      withCensus.attempts[0]?.evidenceDir?.startsWith(evidenceRoot) === true &&
        withoutCensus.attempts[0]?.evidenceDir?.startsWith(evidenceRoot) === true,
      `${String(withCensus.attempts[0]?.evidenceDir)} | ${String(
        withoutCensus.attempts[0]?.evidenceDir,
      )}`,
    );
  } finally {
    if (browser) await browser.close();
    server.close();
    if (evidenceRoot) await rm(evidenceRoot, { recursive: true, force: true });
  }
}

/** The same fixture pages as the A2 section, served for the API-contract test. */
function startNormalizeServerForApi(): Promise<{ server: Server; origin: string }> {
  return new Promise((resolve) => {
    const server = createServer((req, res) => {
      const url = (req.url || "/").split("?")[0];
      res.writeHead(200, {
        "content-type": "text/html; charset=utf-8",
        "cache-control": "no-store",
      });
      res.end(NORMALIZE_PAGES[url] ?? normalizeBody(""));
    });
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      const port = typeof address === "object" && address ? address.port : 0;
      resolve({ server, origin: `http://127.0.0.1:${String(port)}` });
    });
  });
}

/**
 * Task 28.75 acceptance 2 — NORMALIZATION SYMMETRY ON REAL SITES.
 *
 * For a given source route, popup-normalized at mobile must mean
 * popup-normalized at desktop. The asymmetry this pins is the measured defect:
 * seoultone.kr `/` recorded `{structuralMatches: 1, qualified: 1, dismissed: 1}`
 * at 390 and `{0, 0, 0}` at 1440 in the same run, and the 1440 clone shipped
 * with the popup baked over the homepage.
 *
 * This walks whatever real site observations are on disk — it is not a fixture.
 * A pair is NOT COMPARABLE, and is skipped with a reason, when either viewport
 * did not run the phase or the two viewports did not land on the same document.
 */
async function testRealSiteNormalizationSymmetry(): Promise<void> {
  console.log("");
  console.log("Normalization symmetry across viewports on REAL site observations");

  const dataRoot = fileURLToPath(new URL("../data", import.meta.url));
  const runs: string[] = [];
  const hosts = await readdir(dataRoot, { withFileTypes: true }).catch(() => []);
  for (const host of hosts) {
    if (!host.isDirectory()) continue;
    const siteRuns = path.join(dataRoot, host.name, "site-observations");
    const entries = await readdir(siteRuns, { withFileTypes: true }).catch(
      () => [],
    );
    const ids = entries
      .filter((e) => e.isDirectory())
      .map((e) => e.name)
      .sort();
    // The most recent run per host: an older run predates the fix by design.
    const latest = ids[ids.length - 1];
    if (latest) runs.push(path.join(siteRuns, latest));
  }

  const asymmetric: string[] = [];
  const notComparable: string[] = [];
  let pairs = 0;
  for (const run of runs) {
    const pagesDir = path.join(run, "pages");
    const pageIds = (await readdir(pagesDir, { withFileTypes: true }).catch(() => []))
      .filter((e) => e.isDirectory())
      .map((e) => e.name);
    for (const pageId of pageIds) {
      const file = path.join(pagesDir, pageId, "observation.json");
      const raw = await readFile(file, "utf8").catch(() => undefined);
      if (raw === undefined) continue;
      let obs: FixtureObservationWithLoad;
      try {
        obs = JSON.parse(raw) as FixtureObservationWithLoad;
      } catch {
        continue;
      }
      const d = obs.viewports?.desktop?.loadStrategy?.pageStateNormalization;
      const m = obs.viewports?.mobile?.loadStrategy?.pageStateNormalization;
      const label = `${path.basename(path.dirname(run))}/${path.basename(run)}/${pageId}`;
      if (!d?.ran || !m?.ran) {
        notComparable.push(`${label} (phase did not run at one viewport)`);
        continue;
      }
      if (
        obs.viewports.desktop.metadata.finalUrl !==
        obs.viewports.mobile.metadata.finalUrl
      ) {
        notComparable.push(`${label} (different final URL per viewport)`);
        continue;
      }
      pairs++;
      if (d.dismissed > 0 !== m.dismissed > 0) {
        asymmetric.push(
          `${label}: desktop dismissed=${String(d.dismissed)} ` +
            `qualified=${String(d.qualified)} | mobile dismissed=${String(
              m.dismissed,
            )} qualified=${String(m.qualified)}`,
        );
      }
    }
  }

  check(
    "every comparable REAL observed page answers the same at desktop and " +
      "mobile — popup-normalized at one viewport means popup-normalized at both",
    asymmetric.length === 0,
    asymmetric.slice(0, 6).join(" || ") ||
      `${String(pairs)} comparable page pair(s) across ${String(runs.length)} run(s)` +
        (notComparable.length > 0
          ? `; ${String(notComparable.length)} not comparable`
          : ""),
  );
  check(
    "…and the symmetry sweep reports how much real data it actually looked at, " +
      "rather than passing silently on none",
    true,
    `runs=${String(runs.length)} comparablePairs=${String(pairs)} ` +
      `notComparable=${String(notComparable.length)}` +
      (pairs === 0
        ? " — NO real site observations on disk; the fixture symmetry check in " +
          "the A2 section is the only guarantee in this checkout"
        : ""),
  );
}

// ---------------------------------------------------------------------------
// A3 — the deterministic settle.
// ---------------------------------------------------------------------------

/** How many `<img>` tags the slow-image fixture declares in total. */
const SLOW_IMAGE_TAGS = 6;
/** …of which this many are RENDERABLE CANDIDATES. */
const SLOW_IMAGE_RENDERABLE = 4;
/** Server-side delay per slow image (ms). */
const SLOW_IMAGE_DELAY_MS = 500;

function startSettleServer(): Promise<{ server: Server; origin: string }> {
  const endlessPoll =
    `<!doctype html><html lang="en"><head><meta charset="utf-8">` +
    `<title>Endless poll fixture</title><style>body{margin:0}</style></head><body>` +
    `<h1>Endless poll</h1>` +
    tallFiller(2200) +
    // A request every 200ms: Chromium's networkidle (no connections for 500ms)
    // can never be reached, which is precisely the class of page that used to
    // burn the 8s cap and then collect whatever was on screen.
    `<script>setInterval(function(){` +
    `fetch("/ping?t="+Date.now()).catch(function(){});},200);</script>` +
    `</body></html>`;

  const slowImages =
    `<!doctype html><html lang="en"><head><meta charset="utf-8">` +
    `<title>Slow image fixture</title>` +
    `<style>body{margin:0}img{width:120px;height:120px;display:block}` +
    `.hidden{display:none}</style></head><body>` +
    `<h1>Slow images</h1>` +
    Array.from(
      { length: SLOW_IMAGE_RENDERABLE },
      (_, i) => `<img src="/slow.svg?i=${String(i)}" alt="slow ${String(i)}">`,
    ).join("") +
    // NOT renderable candidates, and the whole reason `document.images` cannot
    // be the denominator: one switched off, one with no source at all.
    `<div class="hidden"><img src="/slow.svg?i=hidden" alt="hidden"></div>` +
    `<img alt="no source">` +
    tallFiller(1200) +
    `</body></html>`;

  return new Promise((resolve) => {
    const server = createServer((req, res) => {
      const url = (req.url || "/").split("?")[0];
      if (url === "/ping") {
        res.writeHead(200, { "content-type": "text/plain", "cache-control": "no-store" });
        res.end("pong");
        return;
      }
      if (url === "/slow.svg") {
        setTimeout(() => {
          res.writeHead(200, {
            "content-type": "image/svg+xml",
            "cache-control": "no-store",
          });
          res.end(
            '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 8 8">' +
              '<rect width="8" height="8" fill="#357"/></svg>',
          );
        }, SLOW_IMAGE_DELAY_MS);
        return;
      }
      res.writeHead(200, {
        "content-type": "text/html; charset=utf-8",
        "cache-control": "no-store",
      });
      res.end(url === "/slow-images" ? slowImages : endlessPoll);
    });
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      const port = typeof address === "object" && address ? address.port : 0;
      resolve({ server, origin: `http://127.0.0.1:${String(port)}` });
    });
  });
}

/**
 * Task 28.7 — A FAILING SCREENSHOT MAY NOT COST THE ROUTE.
 *
 * `page.screenshot` inherits Playwright's 30s DEFAULT action timeout (only the
 * NAVIGATION budget is moved by `setDefaultNavigationTimeout`) and it is the
 * heaviest call in the observation — a tall document at the mobile profile's
 * DPR 3 is a hundreds-of-megapixels capture. An overrun used to throw out of
 * `observeViewport`, and the orchestrator then filed the page as an
 * `observation-error` WITH NO ARTIFACT, which kills the whole reconstruction
 * downstream. That is the same P0 A1 exists to remove, reached through a
 * different door, and it is the best-supported explanation for the
 * nondeterministic `observation-error` runs this section now pins.
 *
 * The budget is forced to 1ms here, so the DEGRADATION path is exercised on
 * every run instead of only on an unlucky one.
 */
async function testScreenshotDegradation(): Promise<void> {
  console.log("");
  console.log(
    "Screenshot degradation (real Chromium — a full-page capture that cannot finish)",
  );

  const { server, origin } = await startSettleServer();
  let browser: Browser | undefined;
  let dir: string | undefined;
  try {
    const selection = buildSelection(origin, [
      { familyId: "f000001", representative: `${origin}/slow-images` },
    ]);
    dir = await mkdtemp(path.join(tmpdir(), "multi-observer-shot-"));
    browser = await chromium.launch();

    const run = await observeSelectedPages(selection, {
      concurrency: 1,
      prepareScroll: false,
      normalizePageState: false,
      // 1ms: the full-page capture cannot possibly finish inside it.
      screenshotTimeoutMs: 1,
      sourceSelectedPagesFile: "fixture/selected-pages.json",
      browser,
      runId: "fixture-shot-run",
      runDir: dir,
    });
    const pages = run.siteObservation.pages;
    check(
      "a full-page screenshot that cannot finish does NOT cost the page its " +
        "observation — the route survives",
      pages.length === 1 &&
        pages[0]!.status === "success" &&
        pages[0]!.pageObservationFile !== undefined,
      pageStatusDetail(pages),
    );
    if (pages[0]?.status !== "success") return;

    const observation = JSON.parse(
      await readFile(
        path.join(dir, `pages/${pages[0]!.pageId}/observation.json`),
        "utf8",
      ),
    ) as FixtureObservationWithLoad;
    const desktop = observation.viewports.desktop;
    check(
      "…and the degradation is RECORDED on the artifact, naming the fallback and " +
        "the error, so a screenshot consumer can refuse it",
      (desktop.screenshotDegraded ?? "").startsWith("viewport-only:") &&
        (desktop.screenshotDegraded ?? "").includes("Timeout") &&
        (observation.viewports.mobile.screenshotDegraded ?? "").startsWith(
          "viewport-only:",
        ),
      `${String(desktop.screenshotDegraded)}`,
    );
    const shot = await stat(
      path.join(dir, `pages/${pages[0]!.pageId}`, desktop.files.screenshot),
    ).catch(() => undefined);
    check(
      "…and a real, non-empty screenshot.png is still written",
      (shot?.size ?? 0) > 0,
      `${String(shot?.size)} bytes`,
    );

    // The control: with the normal budget the same page degrades nothing.
    const healthyDir = await mkdtemp(path.join(tmpdir(), "multi-observer-shot-ok-"));
    try {
      const healthy = await observeSelectedPages(selection, {
        concurrency: 1,
        prepareScroll: false,
        normalizePageState: false,
        sourceSelectedPagesFile: "fixture/selected-pages.json",
        browser,
        runId: "fixture-shot-ok-run",
        runDir: healthyDir,
      });
      const healthyPages = healthy.siteObservation.pages;
      const healthyObs =
        healthyPages[0]?.status === "success"
          ? ((JSON.parse(
              await readFile(
                path.join(
                  healthyDir,
                  `pages/${healthyPages[0]!.pageId}/observation.json`,
                ),
                "utf8",
              ),
            ) as FixtureObservationWithLoad))
          : undefined;
      check(
        "NEGATIVE CONTROL — with the normal budget nothing is degraded, so the " +
          "field means something",
        healthyObs !== undefined &&
          healthyObs.viewports.desktop.screenshotDegraded === undefined &&
          healthyObs.viewports.mobile.screenshotDegraded === undefined,
        pageStatusDetail(healthyPages),
      );
    } finally {
      await rm(healthyDir, { recursive: true, force: true });
    }
  } finally {
    if (browser) await browser.close();
    server.close();
    if (dir) await rm(dir, { recursive: true, force: true });
  }
}

async function testDeterministicSettle(): Promise<void> {
  console.log("");
  console.log(
    "Deterministic settle (real Chromium — a page that never idles, and one with slow images)",
  );

  const { server, origin } = await startSettleServer();
  let browser: Browser | undefined;
  let dir: string | undefined;
  try {
    const selection = buildSelection(origin, [
      { familyId: "f000001", representative: `${origin}/endless-poll` },
      { familyId: "f000002", representative: `${origin}/slow-images` },
    ]);
    dir = await mkdtemp(path.join(tmpdir(), "multi-observer-settle-"));
    browser = await chromium.launch();

    const run = await observeSelectedPages(selection, {
      concurrency: 1,
      prepareScroll: true,
      normalizePageState: false,
      sourceSelectedPagesFile: "fixture/selected-pages.json",
      browser,
      runId: "fixture-settle-run",
      runDir: dir,
    });
    const pages = run.siteObservation.pages;
    check(
      "both settle fixtures observed successfully",
      pages.length === 2 && pages.every((p) => p.status === "success"),
      pageStatusDetail(pages),
    );

    const load = async (suffix: string): Promise<FixtureLoadStrategy> => {
      const entry = pages.find((p) => p.url.endsWith(suffix))!;
      // A failed page has no artifact; return an empty strategy so the later
      // checks all still report against the status check above.
      if (entry.status !== "success") return { prepareScroll: false, networkIdleReached: false };
      const observation = JSON.parse(
        await readFile(
          path.join(dir!, `pages/${entry.pageId}/observation.json`),
          "utf8",
        ),
      ) as FixtureObservationWithLoad;
      return observation.viewports.desktop.loadStrategy;
    };
    const poll = await load("/endless-poll");
    const images = await load("/slow-images");

    check(
      "the endless-poll fixture really never reaches networkidle (the test discriminates)",
      poll.networkIdleReached === false && poll.settle?.networkIdleReached === false,
      JSON.stringify({
        strategy: poll.networkIdleReached,
        settle: poll.settle?.networkIdleReached,
      }),
    );
    check(
      "…and the observation settles ANYWAY, deterministically, on document height " +
        "and renderable-image stability",
      poll.settle?.heightStable === true &&
        poll.settle.imagesStable === true &&
        poll.settle.requiredStableSamples >= 2 &&
        poll.settle.samplesTaken >= poll.settle.requiredStableSamples,
      JSON.stringify(poll.settle),
    );
    check(
      "…without either hard cap firing, and it TERMINATES either way",
      poll.settle?.sampleCapHit === false &&
        poll.settle.timeCapHit === false &&
        poll.settle.stabilityMs < 6000 &&
        poll.settle.sampleError === undefined,
      JSON.stringify({
        sampleCap: poll.settle?.sampleCapHit,
        timeCap: poll.settle?.timeCapHit,
        ms: poll.settle?.stabilityMs,
      }),
    );
    check(
      "…and it reports honestly which conditions it reached and how long each took",
      poll.settle?.domContentLoadedReached === true &&
        typeof poll.settle.networkIdleMs === "number" &&
        // The endless-poll fixture NEVER idles, so this wait can only end by
        // exhausting its budget — `networkIdleReached === false` is asserted on
        // its own check above. `networkIdleMs` brackets Playwright's own timer
        // with two `Date.now()` reads, so it lands AT the budget ±1-2ms (a full
        // regression run measured 7999). Asserting `>= NETWORK_IDLE_TIMEOUT_MS`
        // exactly is a 1ms race with no discriminating power: an early resolve
        // on this fixture would read ~0, three orders of magnitude away.
        poll.settle.networkIdleMs >= NETWORK_IDLE_TIMEOUT_MS - 50 &&
        poll.settle.scrollRan === true &&
        poll.settle.scrollMs > 0 &&
        poll.settle.tailMs === SETTLE_MS,
      JSON.stringify({
        dcl: poll.settle?.domContentLoadedReached,
        networkIdleMs: poll.settle?.networkIdleMs,
        scrollMs: poll.settle?.scrollMs,
        tailMs: poll.settle?.tailMs,
      }),
    );

    check(
      `the slow-image fixture waits for its ${String(SLOW_IMAGE_RENDERABLE)} slow ` +
        "images and sees them all decoded",
      images.settle?.renderableImages === SLOW_IMAGE_RENDERABLE &&
        images.settle.imagesLoaded === SLOW_IMAGE_RENDERABLE &&
        images.settle.imagesFailed === 0 &&
        images.settle.imagesStable === true,
      JSON.stringify(images.settle),
    );
    check(
      `…and the DENOMINATOR is renderable candidates, not \`document.images\`: the ` +
        `page declares ${String(SLOW_IMAGE_TAGS)} <img> tags and only ` +
        `${String(SLOW_IMAGE_RENDERABLE)} count`,
      images.settle?.renderableImages === SLOW_IMAGE_RENDERABLE &&
        SLOW_IMAGE_TAGS > SLOW_IMAGE_RENDERABLE,
      `${String(images.settle?.renderableImages)} of ${String(SLOW_IMAGE_TAGS)} tags`,
    );
    check(
      "…and the settle record is present on BOTH viewports of every page — never absent",
      [poll, images].every(
        (s) => s.settle !== undefined && s.settle.finalDocumentHeight > 0,
      ),
      JSON.stringify([
        poll.settle?.finalDocumentHeight,
        images.settle?.finalDocumentHeight,
      ]),
    );
  } finally {
    if (browser) await browser.close();
    server.close();
    if (dir) await rm(dir, { recursive: true, force: true });
  }
}

// ---------------------------------------------------------------------------
// 13. TASK 28.7 B1 — A SOURCE ERROR PAGE RECORDED AS A SUCCESSFUL OBSERVATION
//
// MEASURED ON A LIVE CANARY (2026-09-04, run `2026-09-04T15-30-50-831Z`).
// `linear.app` had a transient upstream outage during observation. The DESKTOP
// capture of `/` and `/changelog` recorded, verbatim, a proxy error document —
// `domElementCount: 3`, `paintSuppression.suppressedElements: 0`,
// `prepareScrollStatus: "prepare-scroll-complete"`, `heightStable: true`,
// `imagesStable: true`, page `status: "success"`. The site-spec, the
// reconstruction and the QA then processed that 3-element proxy error page as
// if it were the site, and QA graded `image-presence-ratio 0.000` as a CLONE
// defect. The MOBILE capture of the same URL in the same run collected 2,306
// elements, and a re-run 20 minutes later collected 2,306 on both.
//
// THE GAP: the observer never recorded the main document's HTTP status. The
// only `response.status()` call in `src/observer/**` was scoped to STYLESHEET
// responses. And a deterministic settle makes this WORSE, not better — an empty
// error page has nothing to lay out and no image to load, so it settles
// instantly and confidently.
//
// Every fixture below is a REAL server response through real Chromium.
// ---------------------------------------------------------------------------

/** Verbatim shape of the proxy error body the canary recorded. */
const PROXY_ERROR_BODY =
  `<html><head><meta name="color-scheme" content="light dark"></head><body>` +
  `<pre style="word-wrap: break-word; white-space: pre-wrap;">upstream connect ` +
  `error or disconnect/reset before headers. retried and the latest reset ` +
  `reason: remote connection failure</pre></body></html>`;

/** A page with real structure — what a healthy capture looks like. */
function richPage(title: string): string {
  return (
    `<!doctype html><html lang="en"><head><meta charset="utf-8">` +
    `<title>${title}</title><style>body{margin:0}</style></head><body>` +
    `<header><nav><a href="/">Home</a></nav></header><main>` +
    Array.from({ length: 120 }, (_, i) => `<p>Paragraph ${String(i)} of ${title}.</p>`).join("") +
    `</main><footer><p>fixture</p></footer></body></html>`
  );
}

/** A page that is LEGITIMATELY tiny — the negative control for starvation. */
const LEGITIMATELY_TINY_PAGE =
  `<!doctype html><html lang="en"><head><meta charset="utf-8">` +
  `<title>Tiny</title></head><body><p>One line.</p></body></html>`;

/**
 * Fixture server for B1.
 *
 *  `/ok`       200, real structure. The negative control.
 *  `/down`     503 with the canary's proxy error body, on EVERY request.
 *  `/flaky`    503 on every ODD request, 200 on every even one — so each
 *              viewport's first attempt fails and its retry succeeds,
 *              deterministically, however many viewports there are.
 *  `/starved`  200 for both, but a 3-element document to the MOBILE user agent
 *              and a full one to the desktop: the soft-error shape that a
 *              status check alone can never catch.
 *  `/tiny`     200 and tiny for BOTH — legitimately small, must NOT be marked.
 */
function startSourceIntegrityServer(): Promise<{ server: Server; origin: string }> {
  let flakyRequests = 0;
  let softRequests = 0;
  let lateStubRequests = 0;
  return new Promise((resolve) => {
    const server = createServer((req, res) => {
      const url = (req.url || "/").split("?")[0];
      const ua = String(req.headers["user-agent"] ?? "");
      const html = (status: number, body: string): void => {
        res.writeHead(status, {
          "content-type": "text/html; charset=utf-8",
          "cache-control": "no-store",
        });
        res.end(body);
      };
      if (url === "/down") {
        html(503, PROXY_ERROR_BODY);
        return;
      }
      if (url === "/flaky") {
        flakyRequests++;
        if (flakyRequests % 2 === 1) html(503, PROXY_ERROR_BODY);
        else html(200, richPage("Flaky"));
        return;
      }
      if (url === "/starved") {
        // The fixture, not the engine, decides which context is starved: a
        // server that answers one client with a stub is exactly the shape this
        // signal exists for. Nothing in `src/**` looks at a user agent.
        if (/Android/.test(ua)) html(200, PROXY_ERROR_BODY);
        else html(200, richPage("Starved"));
        return;
      }
      if (url === "/tiny") {
        html(200, LEGITIMATELY_TINY_PAGE);
        return;
      }
      /*
       * Task 28.75 §07 — the SOFT error: HTTP 200 with an error body. This is
       * the shape no status check can catch, and it is what `linear.app /`
       * served the mobile probe on run `2026-09-04T22-34-32-296Z`. The FIRST
       * document request gets the stub; every later one gets the real page, so
       * a probe that retries recovers and a probe that does not, does not.
       */
      if (url === "/probe-soft") {
        softRequests++;
        if (softRequests === 1) html(200, PROXY_ERROR_BODY);
        else html(200, richPage("Recovered"));
        return;
      }
      /* Task 28.75 §07 — a soft 200 error body on EVERY request: never recovers. */
      if (url === "/probe-soft-permanent") {
        html(200, PROXY_ERROR_BODY);
        return;
      }
      /*
       * Task 28.75 §07 — healthy for the DEEP loads, stubbed for the PROBE loads.
       *
       * `observePageWithBrowser` loads the document once per viewport (desktop,
       * then mobile) and only then runs the two probes, so the first two
       * document requests are the deep observation's and everything after is a
       * probe's. This is the shape that ISOLATES the new signal: both deep walks
       * are healthy, so `cross-viewport-starved` cannot fire and neither can any
       * status check — the only thing that can catch it is the probe's own
       * coverage gate.
       */
      if (url === "/probe-late-stub") {
        lateStubRequests++;
        if (lateStubRequests <= 2) html(200, richPage("Healthy deep load"));
        else html(200, PROXY_ERROR_BODY);
        return;
      }
      html(200, richPage("OK"));
    });
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      const port = typeof address === "object" && address ? address.port : 0;
      resolve({ server, origin: `http://127.0.0.1:${String(port)}` });
    });
  });
}

/** The per-viewport document response, keyed by profile id. */
function viewportsOf(observed: ObservedPage): Map<string, ObservedPage["viewports"][number]> {
  return new Map(observed.viewports.map((v) => [v.profile.id, v]));
}

/* ---------------------------------------------------------------------------
 * Task 28.75 §07 — PROBE COVERAGE.
 *
 * THE DEFECT. `linear.app /`, run `2026-09-04T22-34-32-296Z`: the mobile layout
 * probe walked THREE elements — `html/body/pre`, a plain-text edge error body
 * Chrome wrapped in `<pre>` — against a 2,291-element page. `disconnected` was
 * 0, `prepareScrollStatus` was `prepare-scroll-complete`, `truncated` was false.
 * The artifact was internally consistent and completely wrong, and it passed
 * through a spec compile, a reconstruction and a QA run without one number
 * going red.
 *
 * Task 28.7 B1 had already built the gate that catches this — read the
 * document's status, retry once, mark the capture — but it lived inside the
 * DEEP observation's page load. The probe makes its OWN load, and got none of
 * it. These checks are that the probe now has both gates and that a starved
 * probe can never again be silent.
 * ------------------------------------------------------------------------- */
async function testProbeCoverage(): Promise<void> {
  console.log("");
  console.log(
    "Probe coverage (real Chromium — a 503 probe load, a soft-200 stub, and the honest denominators)",
  );

  const { server, origin } = await startSourceIntegrityServer();
  let browser: Browser | undefined;
  try {
    browser = await chromium.launch();
    // Two widths, not sixteen: this section is about the LOAD, and each extra
    // width is a resize and a settle per fixture.
    const probe = async (
      path: string,
      expectedElementCount?: number,
    ): Promise<LayoutProbe> =>
      probeLayout(browser!, `${origin}${path}`, {
        widths: [400, 800],
        ...(expectedElementCount !== undefined ? { expectedElementCount } : {}),
      });

    // --- NEGATIVE CONTROL: a healthy page ---------------------------------
    const ok = await probe("/ok");
    const healthyCount = ok.tags.length;
    check(
      "28.75: a healthy probe records its document status 200 on ONE attempt",
      ok.documentResponse?.status === 200 &&
        ok.documentResponse.ok === true &&
        ok.documentResponse.attempts.length === 1 &&
        ok.documentResponse.retried === false,
      JSON.stringify(ok.documentResponse),
    );
    check(
      "28.75: …and reports coverage with walked/measured, on one probe attempt",
      ok.coverage !== undefined &&
        ok.coverage.walked === healthyCount &&
        ok.coverage.walked > 50 &&
        ok.coverage.measured === healthyCount &&
        ok.coverage.attempts === 1 &&
        ok.coverage.starved === false,
      JSON.stringify(ok.coverage),
    );
    check(
      "28.75: …and with NO denominator supplied it reports NO ratio rather than inventing one",
      ok.coverage?.documentElements === undefined && ok.coverage?.ratio === undefined,
      JSON.stringify(ok.coverage),
    );

    const okWithDenominator = await probe("/ok", healthyCount);
    check(
      "28.75: given the deep walk's count, a healthy probe reports ratio ~1 and is NOT starved",
      okWithDenominator.coverage?.documentElements === healthyCount &&
        (okWithDenominator.coverage?.ratio ?? 0) >= 0.9 &&
        okWithDenominator.coverage?.starved === false,
      JSON.stringify(okWithDenominator.coverage),
    );

    // --- THE CANARY: a probe load that answers non-2xx ---------------------
    const down = await probe("/down", healthyCount);
    check(
      "28.75 CANARY: the probe's OWN document status is read — a 503 is recorded, not walked blindly",
      down.documentResponse?.status === 503 &&
        down.documentResponse.ok === false &&
        down.documentResponse.retried === true &&
        down.documentResponse.attempts.length === MAX_DOCUMENT_NAV_ATTEMPTS,
      JSON.stringify(down.documentResponse?.attempts),
    );
    check(
      "28.75 CANARY: …the error page really is the 3-element `html/body/pre` shape from the canary",
      down.tags.length <= 5 && down.tags.includes("pre"),
      JSON.stringify(down.tags),
    );
    check(
      "28.75 CANARY: …the probe is MARKED starved against the deep walk's count, never silent",
      down.coverage?.starved === true &&
        down.coverage.documentElements === healthyCount &&
        (down.coverage.ratio ?? 1) < PROBE_DOCUMENT_STARVATION_RATIO,
      JSON.stringify(down.coverage),
    );
    check(
      "28.75 CANARY: …and the whole probe was retried before the verdict was taken",
      down.coverage?.attempts === MAX_PROBE_ATTEMPTS,
      JSON.stringify(down.coverage?.attempts),
    );

    // --- THE SOFT ERROR: HTTP 200 with an error body -----------------------
    const soft = await probe("/probe-soft", healthyCount);
    check(
      "28.75: a SOFT error (200 + error body) answers 200 — so no status check could ever catch it",
      soft.documentResponse?.status === 200 && soft.documentResponse.ok === true,
      JSON.stringify(soft.documentResponse),
    );
    check(
      "28.75: …the starvation gate catches it anyway and the RETRY recovers the real page",
      soft.coverage?.starved === false &&
        soft.coverage.attempts === MAX_PROBE_ATTEMPTS &&
        soft.tags.length === healthyCount,
      `walked ${String(soft.tags.length)} of ${String(healthyCount)} — ${JSON.stringify(soft.coverage)}`,
    );

    const softPermanent = await probe("/probe-soft-permanent", healthyCount);
    check(
      "28.75: a soft error that NEVER recovers stays marked starved after the bounded retry",
      softPermanent.coverage?.starved === true &&
        softPermanent.coverage.attempts === MAX_PROBE_ATTEMPTS &&
        softPermanent.tags.length <= 5,
      JSON.stringify(softPermanent.coverage),
    );

    // --- NEGATIVE CONTROL: a page that is LEGITIMATELY tiny ---------------
    const tiny = await probe("/tiny");
    const tinyCount = tiny.tags.length;
    const tinyWithDenominator = await probe("/tiny", tinyCount);
    check(
      "28.75 NEGATIVE CONTROL: a legitimately tiny page is tiny in BOTH walks, so it is NEVER marked",
      tinyCount <= 5 &&
        tinyWithDenominator.coverage?.starved === false &&
        (tinyWithDenominator.coverage?.ratio ?? 0) >= 0.9,
      `${String(tinyCount)} element(s) — ${JSON.stringify(tinyWithDenominator.coverage)}`,
    );
    check(
      "28.75 NEGATIVE CONTROL: …proving the floor is a RATIO against the run's own control, not an element count",
      down.tags.length === tinyCount || down.coverage?.starved !== tinyWithDenominator.coverage?.starved,
      `error page ${String(down.tags.length)} el (starved ${String(down.coverage?.starved)}) vs ` +
        `tiny page ${String(tinyCount)} el (starved ${String(tinyWithDenominator.coverage?.starved)})`,
    );

    // --- THE END-TO-END MARK ----------------------------------------------
    const observed = await observePageWithBrowser(browser, `${origin}/probe-late-stub`, {
      prepareScroll: false,
      normalizePageState: false,
    });
    const probeMarked = observed.viewports.filter((v) =>
      v.sourceIntegrity?.reasons.includes("probe-starved"),
    );
    check(
      "28.75 END-TO-END: a starved probe MARKS its viewport with `probe-starved` and a limitation",
      probeMarked.length > 0 &&
        probeMarked.every((v) =>
          v.sourceIntegrity!.limitations.some(
            (l) => l.includes("LAYOUT PROBE") && l.includes("starvation floor"),
          ),
        ),
      JSON.stringify(observed.viewports.map((v) => v.sourceIntegrity?.reasons)),
    );
    check(
      "28.75 END-TO-END: …and it rolls up to the page, so observation.json shows it without opening the probe file",
      observed.sourceIntegrity?.suspect === true &&
        observed.sourceIntegrity.reasons.includes("probe-starved"),
      JSON.stringify(observed.sourceIntegrity?.reasons),
    );
    check(
      "28.75 END-TO-END: …while the DEEP observation stays usable — it is the width evidence that is missing",
      observed.viewports.every((v) => v.stats.domElementCount > 50) &&
        observed.viewports.every(
          (v) => !v.sourceIntegrity?.reasons.includes("cross-viewport-starved"),
        ) &&
        observed.viewports.every((v) => v.loadStrategy.documentResponse?.ok === true),
      JSON.stringify(
        observed.viewports.map((v) => [
          v.stats.domElementCount,
          v.loadStrategy.documentResponse?.status,
          v.sourceIntegrity?.reasons,
        ]),
      ),
    );

    /*
     * Task 28.75 §07 — THE ALIGNMENT FLOOR, on a REAL observation.
     *
     * Coverage says the probe got the page. Alignment says the probe's walk can
     * actually be JOINED to the tree the spec is compiled from, and it is the
     * second number that silently went to 13.5% on `linear.app /` for three
     * waves while every other signal stayed green. Both are asserted, on a real
     * Chromium observation of a real page, so neither can rot unnoticed again.
     */
    const healthy = await observePageWithBrowser(browser, `${origin}/ok`, {
      prepareScroll: false,
      normalizePageState: false,
      probeExtraWidths: [],
    });
    const probeByViewport: ReadonlyArray<readonly [string, LayoutProbe | undefined]> = [
      ["desktop", healthy.layoutProbe],
      ["mobile", healthy.layoutProbeMobile],
    ];
    for (const [viewportId, viewportProbe] of probeByViewport) {
      const viewport = healthy.viewports.find((v) => v.profile.id === viewportId);
      if (!viewport || !viewportProbe) {
        check(`28.75 FLOOR: the ${viewportId} probe exists on a healthy observation`, false);
        continue;
      }
      const elementIndexById = new Map<string, number>();
      viewport.elements.forEach((el, i) => elementIndexById.set(el.id, i));
      const attachment = computeProbeAttachment({
        probe: {
          tags: viewportProbe.tags,
          parents: viewportProbe.parents,
          truncated: viewportProbe.truncated,
        },
        elementTags: viewport.elements.map((el) => el.tagName),
        elementParentIndexes: viewport.elements.map((el) =>
          el.parentId === undefined ? -1 : elementIndexById.get(el.parentId) ?? -2,
        ),
      });
      const ratio =
        viewport.elements.length > 0
          ? attachment.attachCount / viewport.elements.length
          : 0;
      check(
        `28.75 FLOOR: the ${viewportId} probe's COVERAGE is at or above the starvation floor on a real observation`,
        (viewportProbe.coverage?.ratio ?? 0) >= PROBE_DOCUMENT_STARVATION_RATIO &&
          viewportProbe.coverage?.starved === false,
        JSON.stringify(viewportProbe.coverage),
      );
      check(
        `28.75 FLOOR: the ${viewportId} probe's ALIGNMENT to the observed tree is at or above ${String(PROBE_ALIGNMENT_MIN_RATIO)}`,
        ratio >= PROBE_ALIGNMENT_MIN_RATIO,
        `${String(attachment.attachCount)}/${String(viewport.elements.length)} = ${ratio.toFixed(4)}`,
      );
    }
  } finally {
    if (browser) await browser.close();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
}

async function testSourceIntegrity(): Promise<void> {
  console.log("");
  console.log(
    "Source integrity (real Chromium — a 503 document, a transient one, and a starved viewport)",
  );

  const { server, origin } = await startSourceIntegrityServer();
  let browser: Browser | undefined;
  let dir: string | undefined;

  try {
    browser = await chromium.launch();
    // No probe, no prepare-scroll, no normalization: this section is about the
    // NAVIGATION, and every one of those costs seconds per fixture.
    const observe = async (path: string): Promise<ObservedPage> =>
      observePageWithBrowser(browser!, `${origin}${path}`, {
        layoutProbe: false,
        prepareScroll: false,
        normalizePageState: false,
      });

    // --- NEGATIVE CONTROL: a healthy 200 page -----------------------------
    const ok = await observe("/ok");
    const okViewports = viewportsOf(ok);
    check(
      "B1 NEGATIVE CONTROL: a healthy 200 page records status 200 on ONE attempt, with no retry",
      ok.viewports.every((v) => {
        const d = v.loadStrategy.documentResponse;
        return (
          d !== undefined &&
          d.status === 200 &&
          d.ok === true &&
          d.statusUnavailable === false &&
          d.retried === false &&
          d.attempts.length === 1 &&
          d.retryBackoffMs === undefined &&
          d.maxAttempts === MAX_DOCUMENT_NAV_ATTEMPTS
        );
      }),
      JSON.stringify(ok.viewports.map((v) => v.loadStrategy.documentResponse)),
    );
    check(
      "B1 NEGATIVE CONTROL: …and it carries NO mark, at either level",
      ok.viewports.every((v) => v.sourceIntegrity === undefined) &&
        ok.sourceIntegrity === undefined &&
        (okViewports.get("desktop")?.stats.domElementCount ?? 0) > 50,
      `desktop elements ${String(okViewports.get("desktop")?.stats.domElementCount)}`,
    );

    // --- a 503 that never recovers ----------------------------------------
    const down = await observe("/down");
    check(
      "B1: a 503 main document is RECORDED as 503 — and retried exactly once",
      down.viewports.every((v) => {
        const d = v.loadStrategy.documentResponse;
        return (
          d !== undefined &&
          d.status === 503 &&
          d.ok === false &&
          d.retried === true &&
          d.attempts.length === MAX_DOCUMENT_NAV_ATTEMPTS &&
          d.attempts.every((a) => a.status === 503) &&
          (d.retryBackoffMs ?? 0) > 0
        );
      }),
      JSON.stringify(down.viewports.map((v) => v.loadStrategy.documentResponse?.attempts)),
    );
    check(
      "B1: …the observation is MARKED on every viewport, with the reason and a limitation",
      down.viewports.every(
        (v) =>
          v.sourceIntegrity?.suspect === true &&
          v.sourceIntegrity.reasons.includes("non-2xx-document") &&
          v.sourceIntegrity.limitations.some(
            (l) => l.includes("503") && l.includes("ERROR RESPONSE"),
          ),
      ),
      JSON.stringify(down.viewports.map((v) => v.sourceIntegrity?.reasons)),
    );
    check(
      "B1: …and rolled up at page level, naming the viewports it applies to",
      down.sourceIntegrity?.suspect === true &&
        JSON.stringify(down.sourceIntegrity.suspectViewportIds) ===
          JSON.stringify(["desktop", "mobile"]) &&
        down.sourceIntegrity.reasons.includes("non-2xx-document") &&
        down.sourceIntegrity.limitations.every((l) => l.startsWith("[")),
      JSON.stringify(down.sourceIntegrity),
    );
    check(
      "B1: …and the error page really is the trivially-settling document the canary recorded",
      down.viewports.every((v) => v.stats.domElementCount <= 5),
      JSON.stringify(down.viewports.map((v) => v.stats.domElementCount)),
    );

    // --- a transient failure the retry recovers ---------------------------
    const flaky = await observe("/flaky");
    check(
      "B1: a document that fails ONCE is recovered by the retry — recorded, and NOT marked",
      flaky.viewports.every((v) => {
        const d = v.loadStrategy.documentResponse;
        return (
          d !== undefined &&
          d.attempts.length === 2 &&
          d.attempts[0]?.status === 503 &&
          d.attempts[1]?.status === 200 &&
          d.status === 200 &&
          d.ok === true &&
          d.retried === true
        );
      }) &&
        flaky.viewports.every((v) => v.sourceIntegrity === undefined) &&
        flaky.sourceIntegrity === undefined,
      JSON.stringify(flaky.viewports.map((v) => v.loadStrategy.documentResponse?.attempts)),
    );
    check(
      "B1: …and the recovered observation is a REAL capture, not the error page",
      flaky.viewports.every((v) => v.stats.domElementCount > 50),
      JSON.stringify(flaky.viewports.map((v) => v.stats.domElementCount)),
    );

    // --- the soft error: 200, and not the page ----------------------------
    const starved = await observe("/starved");
    const starvedViewports = viewportsOf(starved);
    const starvedMobile = starvedViewports.get("mobile");
    const starvedDesktop = starvedViewports.get("desktop");
    check(
      "B1: the starved fixture answers 200 at BOTH viewports — the status check alone catches nothing",
      starved.viewports.every(
        (v) => v.loadStrategy.documentResponse?.status === 200 &&
          v.loadStrategy.documentResponse.retried === false,
      ) &&
        (starvedMobile?.stats.domElementCount ?? 0) /
          Math.max(1, starvedDesktop?.stats.domElementCount ?? 1) <
          CROSS_VIEWPORT_STARVATION_RATIO,
      `desktop ${String(starvedDesktop?.stats.domElementCount)} / mobile ` +
        `${String(starvedMobile?.stats.domElementCount)}`,
    );
    check(
      "B1: …the CROSS-VIEWPORT signal marks the starved viewport, and only it",
      starvedMobile?.sourceIntegrity?.suspect === true &&
        starvedMobile.sourceIntegrity.reasons.includes("cross-viewport-starved") &&
        starvedDesktop?.sourceIntegrity === undefined &&
        starved.sourceIntegrity?.suspectViewportIds.join(",") === "mobile",
      JSON.stringify(starved.sourceIntegrity),
    );

    // --- NEGATIVE CONTROL: legitimately tiny at BOTH viewports ------------
    const tiny = await observe("/tiny");
    check(
      "B1 NEGATIVE CONTROL: a page that is legitimately tiny at BOTH viewports is NOT marked",
      tiny.viewports.every(
        (v) => v.stats.domElementCount <= 5 && v.sourceIntegrity === undefined,
      ) && tiny.sourceIntegrity === undefined,
      JSON.stringify(tiny.viewports.map((v) => v.stats.domElementCount)),
    );

    // --- the artifact, through the real site orchestrator ------------------
    // THE DECISION THIS PINS: the observation is KEPT and MARKED, never
    // dropped. A page with no observation makes `compile-routes` unable to set
    // `renderSourcePageId` and `route-plan` then throws — one bad response
    // would destroy the whole reconstruction.
    dir = await mkdtemp(path.join(tmpdir(), "multi-observer-integrity-"));
    const selection = buildSelection(origin, [
      { familyId: "f000001", representative: `${origin}/down` },
      { familyId: "f000002", representative: `${origin}/ok` },
    ]);
    const run = await observeSelectedPages(selection, {
      concurrency: 1,
      sourceSelectedPagesFile: "fixture/selected-pages.json",
      browser,
      runId: "fixture-integrity-run",
      runDir: dir,
    });
    const site = run.siteObservation;
    const downPage = site.pages.find((p) => p.url === `${origin}/down`);
    const okPage = site.pages.find((p) => p.url === `${origin}/ok`);
    check(
      "B1: the 503 page is KEPT — success status, a persisted artifact, both viewports on disk",
      downPage?.status === "success" &&
        typeof downPage.pageObservationFile === "string" &&
        (
          await stat(
            path.join(dir, `pages/${downPage.pageId}/viewports/mobile/dom.json`),
          ).catch(() => undefined)
        )?.size !== undefined,
      `${String(downPage?.status)} / ${String(downPage?.pageObservationFile)}`,
    );
    check(
      "B1: …and the MANIFEST says loudly that it is not the source page",
      downPage?.sourceIntegrity?.suspect === true &&
        downPage.sourceIntegrity.reasons.includes("non-2xx-document") &&
        okPage?.sourceIntegrity === undefined &&
        site.stats.suspectPages === 1 &&
        site.stats.failedPages === 0 &&
        site.status === "completed-with-errors",
      JSON.stringify({
        suspect: site.stats.suspectPages,
        failed: site.stats.failedPages,
        status: site.status,
      }),
    );
    const persisted = JSON.parse(
      await readFile(path.join(dir, downPage!.pageObservationFile!), "utf8"),
    ) as {
      sourceIntegrity?: { suspect: boolean; reasons: string[] };
      viewports: Record<string, { loadStrategy: { documentResponse?: { status: number | null; attempts: unknown[] } }; sourceIntegrity?: { suspect: boolean } }>;
    };
    check(
      "B1: …and the persisted observation.json carries the status, the attempts and the mark",
      persisted.sourceIntegrity?.suspect === true &&
        ["desktop", "mobile"].every((id) => {
          const v = persisted.viewports[id];
          return (
            v?.loadStrategy.documentResponse?.status === 503 &&
            v.loadStrategy.documentResponse.attempts.length === MAX_DOCUMENT_NAV_ATTEMPTS &&
            v.sourceIntegrity?.suspect === true
          );
        }),
      JSON.stringify(persisted.sourceIntegrity),
    );
    const manifestRaw = await readFile(run.manifestPath, "utf8");
    check(
      "B1: …and the manifest still passes Zod with the new fields on it",
      SiteObservationSchema.safeParse(JSON.parse(manifestRaw)).success,
    );
  } finally {
    if (browser) await browser.close();
    server.close();
    if (dir) await rm(dir, { recursive: true, force: true });
  }
}

// ---------------------------------------------------------------------------
// 14. TASK 28.7 B2 — THE MOBILE ENVELOPE, FROM CROSS-CONTEXT AUTHORED EVIDENCE
//
// The fixture serves DIFFERENT stylesheets to the two browser contexts: the
// desktop sheet authors the 1024/1025 edge, the mobile sheet knows nothing
// above 480. So a mobile envelope that reaches 1024/1025 can ONLY have come
// from the desktop context's authored conditions — which is the whole
// mechanism, and is unprovable on a fixture that serves one sheet to both.
// ---------------------------------------------------------------------------

function startSplitStylesheetServer(): Promise<{ server: Server; origin: string }> {
  const doc = (title: string): string =>
    `<!doctype html><html lang="en"><head><meta charset="utf-8">` +
    `<title>${title}</title><link rel="stylesheet" href="/style.css"></head><body>` +
    `<header><nav><a href="/">Home</a></nav></header>` +
    `<main><div class="col">col</div><table class="comparison"><tr><td>c</td></tr></table>` +
    Array.from({ length: 40 }, (_, i) => `<p>Line ${String(i)}.</p>`).join("") +
    `</main></body></html>`;
  return new Promise((resolve) => {
    const server = createServer((req, res) => {
      const url = (req.url || "/").split("?")[0];
      const ua = String(req.headers["user-agent"] ?? "");
      if (url === "/style.css") {
        const mobileSheet =
          `body{margin:0}.col{width:100%}` +
          `@media (min-width: 480px){.col{width:50%}}`;
        // The desktop-only sheet: the edge that governs the tree switch, which
        // the mobile context never downloads.
        const desktopSheet =
          mobileSheet +
          `@media (max-width: 1024px){.comparison{display:none}}` +
          `@media (min-width: 1025px){.comparison{display:table}}`;
        // The NEGATIVE-CONTROL sheet is served on its own path (below).
        res.writeHead(200, {
          "content-type": "text/css; charset=utf-8",
          "cache-control": "no-store",
        });
        res.end(/Android/.test(ua) ? mobileSheet : desktopSheet);
        return;
      }
      if (url === "/narrow.css") {
        res.writeHead(200, {
          "content-type": "text/css; charset=utf-8",
          "cache-control": "no-store",
        });
        // Authored breakpoints, ALL below the mobile floor ceiling — the
        // negative control for "no evidence above the ceiling".
        res.end(
          `body{margin:0}.col{width:100%}` +
            `@media (min-width: 480px){.col{width:50%}}` +
            `@media (max-width: 767px){.col{width:100%}}`,
        );
        return;
      }
      res.writeHead(200, {
        "content-type": "text/html; charset=utf-8",
        "cache-control": "no-store",
      });
      res.end(
        url === "/narrow"
          ? doc("Narrow").replace("/style.css", "/narrow.css")
          : doc("Split"),
      );
    });
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      const port = typeof address === "object" && address ? address.port : 0;
      resolve({ server, origin: `http://127.0.0.1:${String(port)}` });
    });
  });
}

async function testMobileEnvelopeFromDesktopEvidence(): Promise<void> {
  console.log("");
  console.log(
    "Mobile probe envelope (real Chromium — the 1024 edge exists ONLY in the desktop stylesheet)",
  );

  const { server, origin } = await startSplitStylesheetServer();
  let browser: Browser | undefined;
  let dir: string | undefined;

  try {
    browser = await chromium.launch();
    dir = await mkdtemp(path.join(tmpdir(), "multi-observer-envelope-"));
    const selection = buildSelection(origin, [
      { familyId: "f000001", representative: `${origin}/narrow` },
      { familyId: "f000002", representative: `${origin}/split` },
    ]);
    const run = await observeSelectedPages(selection, {
      concurrency: 1,
      sourceSelectedPagesFile: "fixture/selected-pages.json",
      browser,
      runId: "fixture-envelope-run",
      runDir: dir,
    });

    const readPage = async (
      url: string,
    ): Promise<{
      observation: {
        viewports: Record<
          string,
          { stylesheetCoverage?: { authoredMediaConditions?: { condition: string }[] } }
        >;
        layoutProbeMobile?: { file: string };
      };
      mobileProbe: FixtureProbeArtifact;
    }> => {
      const page = run.siteObservation.pages.find((p) => p.url === url)!;
      const pageDir = path.join(dir!, `pages/${page.pageId}`);
      const observation = JSON.parse(
        await readFile(path.join(pageDir, "observation.json"), "utf8"),
      );
      const mobileProbe = JSON.parse(
        await readFile(
          path.join(pageDir, observation.layoutProbeMobile?.file ?? "layout-probe-mobile.json"),
          "utf8",
        ),
      ) as FixtureProbeArtifact;
      return { observation, mobileProbe };
    };

    const split = await readPage(`${origin}/split`);
    const desktopConditions = (
      split.observation.viewports.desktop?.stylesheetCoverage?.authoredMediaConditions ?? []
    ).map((c) => c.condition);
    const mobileConditions = (
      split.observation.viewports.mobile?.stylesheetCoverage?.authoredMediaConditions ?? []
    ).map((c) => c.condition);
    check(
      "B2 E2E: the fixture really does hide the 1024 edge from the mobile context",
      desktopConditions.includes("(max-width: 1024px)") &&
        desktopConditions.includes("(min-width: 1025px)") &&
        !mobileConditions.includes("(max-width: 1024px)") &&
        !mobileConditions.includes("(min-width: 1025px)"),
      `desktop ${JSON.stringify(desktopConditions)} / mobile ${JSON.stringify(mobileConditions)}`,
    );
    const splitWidths = split.mobileProbe.widths.map((w) => w.width);
    const splitExt = split.mobileProbe.widthProvenance?.envelopeExtension;
    const mobileCeiling = Math.max(...MOBILE_LAYOUT_PROBE_WIDTHS);
    check(
      "B2 E2E: the MOBILE probe still sampled 1024 and 1025 — evidence it could only get from the desktop context",
      splitWidths.includes(1024) &&
        splitWidths.includes(1025) &&
        splitExt?.extended === true &&
        splitExt.crossContextConditions > 0 &&
        splitExt.bracketsAdmitted.some((b) => b.px === 1024) &&
        splitExt.baseMaxWidth === mobileCeiling,
      `${splitWidths.join(",")} — ${JSON.stringify(splitExt)}`,
    );
    check(
      "B2 E2E: …every extended width carries its provenance, and the probe really measured them",
      split.mobileProbe.widthProvenance !== undefined &&
        split.mobileProbe.widthProvenance.origins
          .filter((o) => o.width > mobileCeiling)
          .every((o) => o.beyondFloorEnvelope === true) &&
        split.mobileProbe.widths.length === splitWidths.length &&
        // Defensive: a mutation that removes the extension must make this
        // check FAIL, never throw — a crashing check reports nothing.
        splitWidths.every((w) => w <= (splitExt?.maxWidth ?? 0)),
      JSON.stringify(
        split.mobileProbe.widthProvenance?.origins.filter((o) => o.width > mobileCeiling),
      ),
    );

    const narrow = await readPage(`${origin}/narrow`);
    const narrowWidths = narrow.mobileProbe.widths.map((w) => w.width);
    const narrowExt = narrow.mobileProbe.widthProvenance?.envelopeExtension;
    check(
      "B2 E2E NEGATIVE CONTROL: a page authoring nothing above the ceiling extends NOTHING",
      narrowExt !== undefined &&
        narrowExt.extended === false &&
        narrowExt.maxWidth === mobileCeiling &&
        narrowExt.bracketsAboveBase === 0 &&
        narrowWidths.every((w) => w <= mobileCeiling) &&
        // …while still deriving normally from the evidence it DOES have.
        narrowWidths.includes(479) &&
        narrowWidths.includes(480),
      `${narrowWidths.join(",")} — ${JSON.stringify(narrowExt)}`,
    );
  } finally {
    if (browser) await browser.close();
    server.close();
    if (dir) await rm(dir, { recursive: true, force: true });
  }
}


// ---------------------------------------------------------------------------
// TASK 28.7 §27 — THE DOM-FAMILY FINGERPRINT
//
// THE DEFECT IT EXISTS FOR. Every width signal this pipeline had was the
// GEOMETRY of the elements the probe parked at its walk width, and a CSS reflow
// and a served-variant swap move geometry identically. `tree-switch.ts` inferred
// the second from the first and got linear.app `/` wrong by 384px, serving a
// 390px mobile tree at 700 and 1024; `domSwitchWidthObserved` was hardcoded
// `false` because nothing had ever observed a swap.
//
// WHAT IS CHECKED HERE, and why each check discriminates:
//
//   (a) EVERY PROBED WIDTH CARRIES ONE. A hole in the middle of the array makes
//       index i mean "no change here" on one width and "no measurement here" on
//       the next, and the tree switch cannot tell those apart safely.
//   (b) A MOUNTED SWAP MOVES THE POPULATION, and moves it EXACTLY across the
//       boundary — flat on both sides, so the fingerprint locates the swap
//       rather than merely noticing the page is responsive.
//   (c) A DISPLAYED SWAP MOVES THE RENDERED SET WHILE THE POPULATION IS FLAT.
//       This is the case that decides the design. linear.app ships both variants
//       in one document (source `totalNodes` 4,704 at 700, 1024, 1100 and 1440
//       on `/`) and swaps them with `display`, so a population-only fingerprint
//       would call it purely CSS-responsive and change nothing. The check asserts
//       the population really is flat FIRST, so it cannot pass by accident.
//   (d) THE NEGATIVE CONTROL. A page with one DOM, one rendered set and a large
//       real layout change at the same width must produce a BYTE-IDENTICAL
//       fingerprint at every width. A fingerprint that fired here would invent a
//       tree switch on every CSS-responsive site in the corpus.
//
// Runs `probeLayout` directly rather than the whole observation, because the
// fingerprint is a probe fact and a full site run would cost minutes to assert it.
// ---------------------------------------------------------------------------

async function testDomFamilyFingerprint(): Promise<void> {
  console.log("");
  console.log("DOM-family fingerprint (real Chromium, §27 mount / display / fluid fixtures)");

  const { server, port } = await startServer();
  const root = `http://127.0.0.1:${port}`;
  let browser: Browser | undefined;

  // Straddling 800 on both sides, with a 1px bracket at the boundary — the same
  // shape the derived probe-width set produces around an authored breakpoint.
  const widths = [400, 700, 799, 800, 1200];

  try {
    browser = await chromium.launch();

    const probes = new Map<string, LayoutProbe>();
    for (const route of ["/family-mount", "/family-display", "/css-fluid"]) {
      probes.set(route, await probeLayout(browser, `${root}${route}`, { widths }));
    }

    // --- (a) every width, every route ---------------------------------------
    check(
      "every probed width on every fixture carries a DOM-family fingerprint",
      [...probes.values()].every(
        (probe) =>
          probe.widths.length === widths.length &&
          probe.widths.every((entry) => entry.fingerprint !== undefined),
      ),
      [...probes.entries()]
        .map(([route, probe]) => `${route}:${probe.widths.filter((w) => w.fingerprint).length}`)
        .join(" "),
    );

    // A MISSING fingerprint must make the checks below go RED, never throw: the
    // pre-§27 artifact shape is one of the states this suite has to be able to
    // report on, and a crash reports nothing.
    const MISSING: LayoutProbeFingerprint = {
      elements: -1,
      rendered: -1,
      structure: "<absent>",
      truncated: false,
    };
    const at = (route: string, width: number): LayoutProbeFingerprint =>
      probes.get(route)?.widths.find((entry) => entry.width === width)?.fingerprint ?? MISSING;

    // --- (b) a MOUNTED swap moves the population, exactly at the boundary ----
    const mount = widths.map((w) => at("/family-mount", w));
    const [m400, m700, m799, m800, m1200] = mount as [
      LayoutProbeFingerprint,
      LayoutProbeFingerprint,
      LayoutProbeFingerprint,
      LayoutProbeFingerprint,
      LayoutProbeFingerprint,
    ];
    check(
      "a MOUNTED variant moves the live element population across the boundary",
      m800.elements - m799.elements >= 40 && m800.rendered - m799.rendered >= 40,
      `799: ${m799.elements}/${m799.rendered} → 800: ${m800.elements}/${m800.rendered}`,
    );
    check(
      "…and the population is FLAT on both sides, so the fingerprint LOCATES the swap",
      m400.elements === m700.elements &&
        m700.elements === m799.elements &&
        m800.elements === m1200.elements,
      mount.map((f) => f.elements).join(","),
    );

    // --- (c) a DISPLAYED swap moves only the rendered set --------------------
    const display = widths.map((w) => at("/family-display", w));
    const [d400, d700, d799, d800, d1200] = display as [
      LayoutProbeFingerprint,
      LayoutProbeFingerprint,
      LayoutProbeFingerprint,
      LayoutProbeFingerprint,
      LayoutProbeFingerprint,
    ];
    check(
      "a DISPLAYED variant swap leaves the element population completely FLAT",
      new Set(display.map((f) => f.elements)).size === 1,
      display.map((f) => f.elements).join(","),
    );
    check(
      "…so `elements` alone would have called linear.app's own shape CSS-responsive",
      d799.elements === d800.elements,
      `${d799.elements} vs ${d800.elements}`,
    );
    check(
      "…while the RENDERED set changes across the boundary and holds on both sides",
      d799.rendered !== d800.rendered &&
        Math.abs(d800.rendered - d799.rendered) >= 40 &&
        d400.rendered === d700.rendered &&
        d700.rendered === d799.rendered &&
        d800.rendered === d1200.rendered,
      display.map((f) => f.rendered).join(","),
    );
    check(
      "…and the structure hash separates the two families",
      d799.structure !== d800.structure &&
        d400.structure === d799.structure &&
        d800.structure === d1200.structure,
      display.map((f) => f.structure).join(","),
    );

    // --- (c2) Responsive Core P0 §C1.6 — an already-1px bracket is recorded as
    // converged with zero steps; the negative control records none.
    check(
      "P0 §C1.6: a family switch already bracketed at 799|800 is recorded converged in 0 steps",
      JSON.stringify(
        (probes.get("/family-mount")?.familySwitchBisections ?? []).map((b) => [b.lo, b.hi, b.steps, b.converged]),
      ) === JSON.stringify([[799, 800, 0, true]]) &&
        JSON.stringify(
          (probes.get("/family-display")?.familySwitchBisections ?? []).map((b) => [b.lo, b.hi, b.steps, b.converged]),
        ) === JSON.stringify([[799, 800, 0, true]]),
      JSON.stringify([
        probes.get("/family-mount")?.familySwitchBisections,
        probes.get("/family-display")?.familySwitchBisections,
      ]),
    );
    check(
      "P0 §C1.6: the CSS-fluid negative control records NO family switch",
      probes.get("/css-fluid")?.familySwitchBisections?.length === 0,
      JSON.stringify(probes.get("/css-fluid")?.familySwitchBisections),
    );

    // --- (d) the NEGATIVE CONTROL -------------------------------------------
    const fluid = widths.map((w) => at("/css-fluid", w));
    check(
      "a purely CSS-responsive page's fingerprint is BYTE-IDENTICAL at every width",
      new Set(fluid.map((f) => JSON.stringify(f))).size === 1,
      fluid.map((f) => `${f.elements}/${f.rendered}/${f.structure}`).join(" "),
    );
    check(
      "…and the fixture really does re-lay-out, so the negative control discriminates",
      (() => {
        const probe = probes.get("/css-fluid")!;
        const lo = probe.widths.find((w) => w.width === 799)!;
        const hi = probe.widths.find((w) => w.width === 800)!;
        // The cells go from full-width stacked to 20% in a row: every cell's box
        // moves. If this ever stops being true the check above is vacuous.
        let moved = 0;
        for (let i = 0; i < lo.w.length; i++) {
          if (Math.abs((lo.w[i] ?? 0) - (hi.w[i] ?? 0)) > 1) moved++;
        }
        return moved >= 40;
      })(),
    );
  } finally {
    if (browser) await browser.close();
    server.close();
  }
}

// ---------------------------------------------------------------------------
// Responsive Core P0 §C1 — observer evidence: initial document, runtime inline
// style (+ per probe width), provenance, cascade metadata + cap, bisection.
// ---------------------------------------------------------------------------

/** §C1.6 — the observer's duplicated predicate must agree with the tree switch's. */
function testFamilyVerdictParity(): void {
  console.log("");
  console.log("P0 §C1.6 family-change predicate parity (observer copy vs tree-switch authority)");
  const fp = (
    elements: number,
    rendered: number,
    structure = "h",
    truncated = false,
  ): LayoutProbeFingerprint => ({ elements, rendered, structure, truncated });
  const cases: [LayoutProbeFingerprint, LayoutProbeFingerprint][] = [
    [fp(100, 50), fp(100, 50)],
    [fp(100, 50), fp(100, 58)],
    [fp(100, 50), fp(100, 57)],
    [fp(1000, 900), fp(1000, 946)],
    [fp(1000, 900), fp(1000, 944)],
    [fp(100, 50), fp(140, 50)],
    [fp(100, 50, "a"), fp(100, 50, "b")],
    [fp(100, 50, "a"), fp(101, 50, "b")],
    [fp(100, 50, "a", true), fp(100, 50, "a")],
    [fp(100, 50, "a", true), fp(100, 90, "a")],
    [fp(0, 0), fp(8, 8)],
  ];
  const mismatches = cases.filter(
    ([a, b]) => observerFamilyChangeVerdict(a, b) !== familyChangeVerdict(a, b),
  );
  check(
    "observerFamilyChangeVerdict === familyChangeVerdict on every case (no silent drift)",
    mismatches.length === 0,
    JSON.stringify(mismatches),
  );
  check(
    "…and the case table exercises all three verdicts",
    new Set(cases.map(([a, b]) => familyChangeVerdict(a, b))).size === 3,
  );
}

/** §C1.3 — merging per-width local tables is lossless and deduplicated. */
function testInlineStyleTableMergePure(): void {
  console.log("");
  console.log("P0 §C1.3 per-width inline-style table merge (pure)");
  const merged = mergeInlineStyleTables([
    { s: [0, -1, 1], sTable: ["width: 1px;", "width: 2px;"] },
    { s: [1, 0, -1], sTable: ["width: 3px;", "width: 1px;"] },
  ]);
  check(
    "one probe-level table, first-appearance order, every index remapped",
    JSON.stringify(merged.table) === JSON.stringify(["width: 1px;", "width: 2px;", "width: 3px;"]) &&
      JSON.stringify(merged.s) === JSON.stringify([[0, -1, 1], [0, 2, -1]]),
    JSON.stringify(merged),
  );
}

const CASCADE_FIXTURE_HTML = (() => {
  const capRules = Array.from(
    { length: 45 },
    (_, i) => `.c${i} { width: ${i + 1}px; }`,
  ).join("\n");
  const capClasses = Array.from({ length: 45 }, (_, i) => `c${i}`).join(" ");
  const manyProps = [
    "width", "min-width", "max-width", "height", "min-height", "max-height",
    "margin-left", "margin-top", "padding-left", "padding-top", "flex-basis", "top", "left",
  ];
  const manyRules = Array.from(
    { length: 8 },
    (_, r) => `.m${r} { ${manyProps.map((p) => `${p}: ${r + 1}px;`).join(" ")} }`,
  ).join("\n");
  const manyClasses = Array.from({ length: 8 }, (_, r) => `m${r}`).join(" ");
  const tooManyInline = Array.from({ length: 70 }, (_, i) => `--p${i}: ${i}`).join("; ");
  return (
    `<!doctype html><html><head><meta charset="utf-8"><title>cascade</title><style>` +
    `@layer base, theme;\n` +
    `#spec { width: 1px; }\n` +
    `.a.b { width: 2px; }\n` +
    `div { width: 3px; }\n` +
    `:where(#spec.a) { width: 4px; }\n` +
    `:is(#spec, .a) span, div:is(#spec, .a) { width: 5px; }\n` +
    `div:not(.zz, #nope) { width: 6px; }\n` +
    `.wrap:has(> #spec) { width: 7px; }\n` +
    `li:nth-child(2 of .item) { width: 8px; }\n` +
    `.sm\\:w-1\\/2 { width: 9px; }\n` +
    `.zz, #spec, div { min-width: 10px; }\n` +
    `.a { & .inner { width: 11px; } }\n` +
    `[data-x="a]b"] { max-width: 13px; }\n` +
    `@layer theme { #layered { width: 100px; } }\n` +
    `@layer base { #layered { width: 200px !important; } }\n` +
    `@layer base { @layer inner { #layered { margin-left: 3px; } } }\n` +
    `#layered { width: 300px; }\n` +
    `@layer { #layered { margin-right: 4px; } }\n` +
    `@supports (display: grid) { #layered { margin-top: 5px; } }\n` +
    `@supports (display: no-such-value) { #layered { margin-bottom: 6px; } }\n` +
    capRules + `\n` +
    `#cap.cap { width: 999px; }\n` +
    manyRules + `\n` +
    `</style></head><body>` +
    `<div class="wrap"><div id="spec" class="a b" data-x="a]b"><span class="inner">in</span></div></div>` +
    `<ul><li class="item">1</li><li class="item">2</li></ul>` +
    `<div class="sm:w-1/2">tw</div>` +
    `<div id="layered">layered</div>` +
    // <section>, so the fixture's generic `div` rules cannot join the cap race.
    `<section id="cap" class="cap ${capClasses}">cap</section>` +
    `<section id="many" class="${manyClasses}">many</section>` +
    `<div id="inl" style="margin: 0 auto; width: 50% !important; --x: 1">inline</div>` +
    `<div id="inl-many" style="${tooManyInline}">many inline</div>` +
    `<div id="inl-empty" style="  ">empty inline</div>` +
    `</body></html>`
  );
})();

/** §C1.5 + §C1.2 — the collector itself, on one page, in a real Chromium. */
async function testCascadeMetadataAndInlineCapture(): Promise<void> {
  console.log("");
  console.log("P0 §C1.5 cascade metadata + cascade-aware cap, §C1.2 inline style (real Chromium)");
  const { server, origin } = await startSingleDocServer(CASCADE_FIXTURE_HTML);
  let browser: Browser | undefined;
  try {
    browser = await chromium.launch();
    const page = await browser.newPage();
    await page.goto(`${origin}/`, { waitUntil: "load" });
    await installBrowserNameShim(page);
    const raw = await page.evaluate(collectPageInBrowser, { config: COLLECT_CONFIG });
    const byHtmlId = (id: string) => raw.elements.find((e) => e.attributes.id === id);
    const byClassToken = (cls: string) =>
      raw.elements.find((e) => (e.attributes.class ?? "").split(/\s+/).includes(cls));
    type Rule = NonNullable<(typeof raw.elements)[number]["matchedLayoutRules"]>[number];
    const rule = (
      el: (typeof raw.elements)[number] | undefined,
      property: string,
      value: string,
    ): Rule | undefined =>
      el?.matchedLayoutRules?.find((r) => r.property === property && r.value === value);
    const spec = (r: Rule | undefined): string =>
      r?.specificity ? r.specificity.join(",") : "absent";

    const specEl = byHtmlId("spec");
    const expectations: [string, Rule | undefined, string][] = [
      ["#spec", rule(specEl, "width", "1px"), "1,0,0"],
      [".a.b", rule(specEl, "width", "2px"), "0,2,0"],
      ["div", rule(specEl, "width", "3px"), "0,0,1"],
      [":where(#spec.a) = 0", rule(specEl, "width", "4px"), "0,0,0"],
      ["list → the matching complex selector div:is(#spec, .a)", rule(specEl, "width", "5px"), "1,0,1"],
      ["div:not(.zz, #nope) = div + max(args)", rule(specEl, "width", "6px"), "1,0,1"],
      ["list .zz, #spec, div → most specific MATCHING (#spec)", rule(specEl, "min-width", "10px"), "1,0,0"],
      ['[data-x="a]b"] (quoted bracket)', rule(specEl, "max-width", "13px"), "0,1,0"],
      [".wrap:has(> #spec) = class + max(args)", rule(byClassToken("wrap"), "width", "7px"), "1,1,0"],
      [
        "li:nth-child(2 of .item) = pseudo-class + max(S) + type",
        rule(raw.elements.filter((e) => e.tagName === "li")[1], "width", "8px"),
        "0,2,1",
      ],
      [".sm\\:w-1\\/2 (escaped class)", rule(byClassToken("sm:w-1/2"), "width", "9px"), "0,1,0"],
      ["nested & .inner → :is(.a) .inner", rule(byClassToken("inner"), "width", "11px"), "0,2,0"],
    ];
    for (const [label, r, expected] of expectations) {
      check(`specificity ${label} = [${expected}]`, spec(r) === expected, `${spec(r)} ${JSON.stringify(r)}`);
    }
    check(
      "a non-matching list member never widens what matched (li #1 has no 8px rule)",
      rule(raw.elements.filter((e) => e.tagName === "li")[0], "width", "8px") === undefined,
    );
    check(
      "every recorded declaration carries sheetIndex + ruleOrder, and ruleOrder is ascending in array order",
      raw.elements.every((e) =>
        (e.matchedLayoutRules ?? []).every(
          (r, i, all) =>
            r.sheetIndex === 0 &&
            typeof r.ruleOrder === "number" &&
            (i === 0 || (all[i - 1]!.ruleOrder ?? -1) <= r.ruleOrder),
        ),
      ),
    );

    // --- layers + important inversion evidence --------------------------------
    const layered = byHtmlId("layered");
    const theme = rule(layered, "width", "100px");
    const baseImportant = rule(layered, "width", "200px");
    const inner = rule(layered, "margin-left", "3px");
    const unlayered = rule(layered, "width", "300px");
    const anonymous = rule(layered, "margin-right", "4px");
    check(
      "layer order follows the @layer statement + post-order nesting: base.inner 0 < base 1 < theme 2 < anonymous 3",
      inner?.layer === "base.inner" &&
        inner.layerOrder === 0 &&
        baseImportant?.layerOrder === 1 &&
        theme?.layerOrder === 2 &&
        anonymous?.layerOrder === 3 &&
        (anonymous.layer ?? "").startsWith("(anonymous-"),
      JSON.stringify({ inner, baseImportant, theme, anonymous }),
    );
    check(
      "an unlayered rule carries NO layerOrder (absent = unlayered, never a number)",
      unlayered !== undefined && unlayered.layerOrder === undefined && unlayered.layer === undefined,
      JSON.stringify(unlayered),
    );
    check(
      "IMPORTANT INVERSION evidence: the earliest-layer !important rule is the browser's winner and carries important + layerOrder",
      baseImportant?.important === true &&
        layered?.styles.width === "200px" &&
        (baseImportant.layerOrder ?? 99) < (theme?.layerOrder ?? -1),
      `computed width ${layered?.styles.width}`,
    );
    check(
      "the page's cascade layers are counted (4)",
      raw.stylesheetCoverage?.cascadeLayers === 4,
      String(raw.stylesheetCoverage?.cascadeLayers),
    );
    check(
      "@supports is evaluated in the page: supportsMatches true for a supported condition, false otherwise",
      rule(layered, "margin-top", "5px")?.supportsMatches === true &&
        rule(layered, "margin-bottom", "6px")?.supportsMatches === false &&
        unlayered?.supportsMatches === undefined,
      JSON.stringify([rule(layered, "margin-top", "5px"), rule(layered, "margin-bottom", "6px")]),
    );

    // --- the cascade-aware cap ------------------------------------------------
    const cap = byHtmlId("cap");
    const capWidths = (cap?.matchedLayoutRules ?? [])
      .filter((r) => r.property === "width")
      .map((r) => r.value);
    check(
      "46 matching width rules: the LATE high-specificity winner (999px) SURVIVES the cap (it did not at 32)",
      capWidths.includes("999px"),
      capWidths.join(","),
    );
    check(
      `…per property at most ${MAX_MATCHED_RULES_PER_PROPERTY}: the winner + the 7 latest equal-specificity rules, in SOURCE order`,
      capWidths.join(",") === "39px,40px,41px,42px,43px,44px,45px,999px",
      capWidths.join(","),
    );
    check(
      "…with the counters stating the cut (matched 46, kept 8, truncated)",
      cap?.layoutRulesMatched === 46 && cap.layoutRulesKept === 8 && cap.layoutRulesTruncated === true,
      JSON.stringify({ m: cap?.layoutRulesMatched, k: cap?.layoutRulesKept, t: cap?.layoutRulesTruncated }),
    );
    const many = byHtmlId("many");
    const perProperty = new Map<string, number>();
    for (const r of many?.matchedLayoutRules ?? []) {
      perProperty.set(r.property, (perProperty.get(r.property) ?? 0) + 1);
    }
    check(
      `13 properties × 8 rules = 104 matched → element total capped at ${MAX_MATCHED_RULES_PER_ELEMENT}, strongest-first per property`,
      many?.layoutRulesMatched === 104 &&
        many.matchedLayoutRules?.length === MAX_MATCHED_RULES_PER_ELEMENT &&
        [...perProperty.values()].every((n) => n >= 7 && n <= 8) &&
        (many.matchedLayoutRules ?? []).some((r) => r.value === "8px"),
      JSON.stringify({ matched: many?.layoutRulesMatched, kept: many?.matchedLayoutRules?.length, perProperty: [...perProperty] }),
    );
    check(
      "coverage totals add up (matched − kept = truncated; truncated elements counted)",
      raw.stylesheetCoverage !== undefined &&
        raw.stylesheetCoverage.layoutRulesMatched - raw.stylesheetCoverage.layoutRulesKept ===
          raw.stylesheetCoverage.layoutRulesTruncated &&
        raw.stylesheetCoverage.layoutRulesTruncated === 38 + 8 &&
        raw.stylesheetCoverage.layoutRulesTruncatedElements === 2,
      JSON.stringify(raw.stylesheetCoverage),
    );

    // --- runtime inline style (§C1.2) ----------------------------------------
    const inl = byHtmlId("inl");
    const decl = (property: string) => inl?.inlineStyle?.decls.find((d) => d.property === property);
    check(
      "inline style is read off el.style as CSSOM longhands, with priority and custom properties",
      decl("margin-top")?.value === "0px" &&
        decl("margin-left")?.value === "auto" &&
        decl("width")?.value === "50%" &&
        decl("width")?.important === true &&
        decl("--x")?.value === "1" &&
        inl?.inlineStyle?.raw === "margin: 0 auto; width: 50% !important; --x: 1",
      JSON.stringify(inl?.inlineStyle),
    );
    check(
      "the `style` attribute is NOT added to the attributes bag",
      raw.elements.every((e) => e.attributes.style === undefined),
    );
    const inlMany = byHtmlId("inl-many");
    check(
      `more than ${MAX_INLINE_STYLE_DECLS} declarations → truncated, counted in coverage`,
      inlMany?.inlineStyle?.decls.length === MAX_INLINE_STYLE_DECLS &&
        inlMany.inlineStyle.truncated === true &&
        raw.stylesheetCoverage?.inlineStyleTruncated === 1,
      JSON.stringify({ n: inlMany?.inlineStyle?.decls.length, cov: raw.stylesheetCoverage?.inlineStyleTruncated }),
    );
    check(
      "a whitespace-only style attribute records nothing; coverage counts the 2 real ones",
      byHtmlId("inl-empty")?.inlineStyle === undefined &&
        raw.stylesheetCoverage?.inlineStyleElements === 2 &&
        raw.stylesheetCoverage.inlineStyleDecls === (inl?.inlineStyle?.decls.length ?? 0) + MAX_INLINE_STYLE_DECLS,
      JSON.stringify(raw.stylesheetCoverage),
    );
  } finally {
    if (browser) await browser.close();
    server.close();
  }
}

/** §C1.6 + §C1.3 — bisection to a 1px bracket and per-width style arrays. */
async function testFamilySwitchBisection(): Promise<void> {
  console.log("");
  console.log("P0 §C1.6 family-switch bisection + §C1.3 per-width inline style (real Chromium)");
  const { server, port } = await startServer();
  const root = `http://127.0.0.1:${port}`;
  let browser: Browser | undefined;
  const widths = [400, 700, 1000, 1200];
  try {
    browser = await chromium.launch();
    const swap = await probeLayout(browser, `${root}/family-js-swap`, { widths });
    const fluid = await probeLayout(browser, `${root}/css-fluid`, { widths });
    const bisections = swap.familySwitchBisections ?? [];
    check(
      "a JS swap at an unsampled width is bisected: exactly one pair (700→1000)",
      bisections.length === 1 && bisections[0]!.pairLo === 700 && bisections[0]!.pairHi === 1000,
      JSON.stringify(bisections),
    );
    check(
      "…converging to the 1px bracket 849|850 within the step bound",
      bisections[0]?.lo === 849 &&
        bisections[0].hi === 850 &&
        bisections[0].converged === true &&
        bisections[0].steps >= 1 &&
        bisections[0].steps <= MAX_FAMILY_BISECTION_STEPS,
      JSON.stringify(bisections[0]),
    );
    check(
      "…with the bracket fingerprints on both sides actually differing per the verdict",
      bisections[0] !== undefined &&
        observerFamilyChangeVerdict(bisections[0].loFingerprint, bisections[0].hiFingerprint) === "changed",
    );
    check(
      "bisection never adds to `widths` (no geometry was taken there)",
      swap.widths.map((w) => w.width).join(",") === widths.join(","),
      swap.widths.map((w) => w.width).join(","),
    );
    check(
      "the CSS-only negative control bisects nothing (empty array, not absent)",
      Array.isArray(fluid.familySwitchBisections) && fluid.familySwitchBisections.length === 0,
      JSON.stringify(fluid.familySwitchBisections),
    );
    const styledIndex = (() => {
      // The walk order is the DOM order; the styled div is the only element
      // whose style attribute exists at every width.
      const table = swap.inlineStyleTable ?? [];
      return swap.tags.findIndex((_, i) =>
        swap.widths.every((w) => (w.s?.[i] ?? -1) >= 0 && (table[w.s![i]!] ?? "").startsWith("width")),
      );
    })();
    const textsAt = (width: number): string | undefined => {
      const entry = swap.widths.find((w) => w.width === width);
      const index = entry?.s?.[styledIndex];
      return index !== undefined && index >= 0 ? swap.inlineStyleTable?.[index] : undefined;
    };
    check(
      "every width carries an `s` array aligned to the walk, indexing one probe-level table",
      swap.inlineStyleTable !== undefined &&
        swap.widths.every((w) => w.s !== undefined && w.s.length === swap.tags.length) &&
        new Set(swap.inlineStyleTable).size === swap.inlineStyleTable.length,
      JSON.stringify(swap.inlineStyleTable),
    );
    check(
      "a resize-listener inline width is visible per width (90% below 850, 50% above)",
      styledIndex >= 0 && textsAt(400) === "width: 90%;" && textsAt(1200) === "width: 50%;",
      `${textsAt(400)} / ${textsAt(1200)}`,
    );
    check(
      "the persisted probe schema keeps s / inlineStyleTable / familySwitchBisections (zod would strip undeclared fields)",
      (() => {
        const parsed = LayoutProbeSchema.parse(JSON.parse(JSON.stringify(swap)));
        return (
          parsed.inlineStyleTable?.length === swap.inlineStyleTable?.length &&
          parsed.widths.every((w) => w.s !== undefined) &&
          parsed.familySwitchBisections?.length === 1
        );
      })(),
    );
  } finally {
    if (browser) await browser.close();
    server.close();
  }
}

/** §C1.1 + §C1.4 end to end: observe → persist → SiteSpec compile. */
async function testInlineStyleProvenanceEndToEnd(): Promise<void> {
  console.log("");
  console.log("P0 §C1.1 initial document + §C1.4 inline-style provenance (observe → persist → compile)");
  const { server, port } = await startServer();
  const origin = `http://127.0.0.1:${port}`;
  let browser: Browser | undefined;
  let dir: string | undefined;
  try {
    const selection = buildSelection(origin, [
      { familyId: "f000001", representative: `${origin}/inline-provenance` },
      { familyId: "f000002", representative: `${origin}/inline-euc-kr` },
    ]);
    dir = await mkdtemp(path.join(tmpdir(), "multi-observer-inline-provenance-"));
    browser = await chromium.launch();
    const run = await observeSelectedPages(selection, {
      concurrency: 1,
      sourceSelectedPagesFile: "fixture/selected-pages.json",
      browser,
      runId: "fixture-inline-provenance-run",
      runDir: dir,
    });
    const sitePage = run.siteObservation.pages.find((p) => p.url.endsWith("/inline-provenance"))!;
    check("the inline-provenance fixture observed successfully", sitePage.status === "success", sitePage.status);
    const pageDir = path.join(dir, `pages/${sitePage.pageId}`);
    const observation = PageObservationSchema.parse(
      JSON.parse(await readFile(path.join(pageDir, "observation.json"), "utf8")),
    );

    for (const viewportId of ["desktop", "mobile"] as const) {
      const vp = observation.viewports[viewportId];
      const doc = vp.initialDocument;
      const vpDir = path.join(pageDir, "viewports", viewportId);
      const onDisk = await readFile(path.join(vpDir, "document-response.html"), "utf8").catch(() => "");
      const rendered = await readFile(path.join(vpDir, "rendered.html"), "utf8");
      check(
        `[${viewportId}] initialDocument captured from the navigation response (status, http 200, html, file)`,
        doc?.status === "captured" &&
          doc.httpStatus === 200 &&
          /text\/html/.test(doc.contentType ?? "") &&
          doc.file === "document-response.html",
        JSON.stringify(doc),
      );
      check(
        `[${viewportId}] document-response.html is the SERVED bytes (sha256 + byte count match), not page.content()`,
        onDisk === INLINE_PROVENANCE_HTML &&
          doc?.bytes === Buffer.byteLength(INLINE_PROVENANCE_HTML, "utf8") &&
          doc.sha256 === createHash("sha256").update(INLINE_PROVENANCE_HTML, "utf8").digest("hex") &&
          onDisk !== rendered &&
          rendered.includes('<section id="csr-child"') &&
          !onDisk.includes('<section id="csr-child"'),
        `${onDisk.length} vs ${rendered.length}`,
      );
      check(
        `[${viewportId}] the viewport size report accounts for the new file`,
        vp.sizes.documentResponseBytes === Buffer.byteLength(INLINE_PROVENANCE_HTML, "utf8"),
        JSON.stringify(vp.sizes),
      );
    }

    const dom = z
      .array(ElementObservationSchema)
      .parse(JSON.parse(await readFile(path.join(pageDir, "viewports/desktop/dom.json"), "utf8")));
    const el = (id: string) => dom.find((e) => e.attributes.id === id);
    check(
      "dom.json carries runtime inlineStyle (JS-mutated value, JS-added property, CSR node), never a style attribute",
      el("js-mutated")?.inlineStyle?.decls.some((d) => d.property === "width" && d.value === "250px") === true &&
        el("js-added")?.inlineStyle?.decls.some((d) => d.property === "max-width" && d.value === "300px") === true &&
        el("csr-child")?.inlineStyle?.decls.some((d) => d.property === "padding-left") === true &&
        dom.every((e) => e.attributes.style === undefined),
      JSON.stringify([el("js-mutated")?.inlineStyle, el("js-added")?.inlineStyle]),
    );
    check(
      "stylesheetCoverage counts the inline-style elements (5 styled)",
      observation.viewports.desktop.stylesheetCoverage?.inlineStyleElements === 5,
      JSON.stringify(observation.viewports.desktop.stylesheetCoverage?.inlineStyleElements),
    );

    const compiled = await compilePage({
      siteObservationDir: dir,
      page: sitePage,
      familyType: sitePage.familyType,
      sourceObservationRef: "fixture/pages/p000001/observation.json",
      styleBuilder: new StyleCatalogBuilder(),
      assetBuilder: new AssetCatalogBuilder(origin),
    });
    for (const viewportId of ["desktop", "mobile"] as const) {
      const nodes = compiled.spec.viewports[viewportId].nodes;
      const node = (htmlId: string) =>
        nodes.find(
          (n): n is ElementSpecNode => n.type === "element" && n.sourceHtmlId === htmlId,
        );
      const cls = (htmlId: string, property: string) =>
        node(htmlId)?.inlineStyleProvenance?.byProperty[property]?.class;
      check(
        `[${viewportId}] SSR static style → initial-static (width + margin shorthand longhands)`,
        cls("ssr-static", "width") === "initial-static" &&
          cls("ssr-static", "margin-left") === "initial-static" &&
          node("ssr-static")?.inlineStyleProvenance?.correspondence === "matched",
        JSON.stringify(node("ssr-static")?.inlineStyleProvenance),
      );
      check(
        `[${viewportId}] JS-mutated style → initial-mutated (100px → 250px)`,
        cls("js-mutated", "width") === "initial-mutated" &&
          node("js-mutated")?.inlineStyleProvenance?.byProperty.width?.initialValue === "100px" &&
          node("js-mutated")?.inlineStyleProvenance?.byProperty.width?.runtimeValue === "250px",
        JSON.stringify(node("js-mutated")?.inlineStyleProvenance),
      );
      check(
        `[${viewportId}] JS-added style → runtime-added`,
        cls("js-added", "max-width") === "runtime-added",
        JSON.stringify(node("js-added")?.inlineStyleProvenance),
      );
      check(
        `[${viewportId}] resize-listener width → runtime-responsive (varies across probe widths)`,
        cls("resize-responsive", "width") === "runtime-responsive" &&
          node("resize-responsive")?.inlineStyleProvenance?.byProperty.width?.variesAcrossWidths === true,
        JSON.stringify(node("resize-responsive")?.inlineStyleProvenance),
      );
      check(
        `[${viewportId}] CSR-only node (absent from the initial document) → unknown, never guessed`,
        node("csr-child")?.inlineStyleProvenance?.correspondence === "no-initial-node" &&
          cls("csr-child", "padding-left") === "unknown",
        JSON.stringify(node("csr-child")?.inlineStyleProvenance),
      );
      check(
        `[${viewportId}] SiteSpec viewport carries the initialDocument summary + provenance counts`,
        compiled.spec.viewports[viewportId].initialDocument?.status === "captured" &&
          compiled.spec.viewports[viewportId].inlineStyleProvenanceCounts?.elements === 5,
        JSON.stringify(compiled.spec.viewports[viewportId].inlineStyleProvenanceCounts),
      );
    }

    // --- Review fix m1: RAW bytes on disk, for a non-UTF-8 document -----------
    const eucPage = run.siteObservation.pages.find((p) => p.url.endsWith("/inline-euc-kr"))!;
    check("the EUC-KR fixture observed successfully", eucPage?.status === "success", eucPage?.status);
    const eucDir = path.join(dir, `pages/${eucPage.pageId}`);
    const eucObservation = PageObservationSchema.parse(
      JSON.parse(await readFile(path.join(eucDir, "observation.json"), "utf8")),
    );
    for (const viewportId of ["desktop", "mobile"] as const) {
      const doc = eucObservation.viewports[viewportId].initialDocument;
      const bytesOnDisk = await readFile(
        path.join(eucDir, "viewports", viewportId, "document-response.html"),
      );
      check(
        `[${viewportId}] document-response.html holds exactly the body bytes the browser returned: sha256 + byte count match the FILE; charset says how they decode (non-UTF-8 page)`,
        doc?.status === "captured" &&
          doc.bytes === bytesOnDisk.byteLength &&
          doc.sha256 === createHash("sha256").update(bytesOnDisk).digest("hex") &&
          // Chromium hands a text document over transcoded to UTF-8 (measured:
          // served EUC-KR bytes ≠ body bytes), so the file decodes as utf-8 and
          // the page's own label is kept separately.
          !bytesOnDisk.equals(EUC_KR_DOCUMENT) &&
          doc.charset === "utf-8" &&
          doc.declaredCharset === "euc-kr" &&
          new TextDecoder(doc.charset).decode(bytesOnDisk).includes("\ud55c\uae00") &&
          eucObservation.viewports[viewportId].sizes.documentResponseBytes === bytesOnDisk.byteLength,
        JSON.stringify({ doc, onDisk: bytesOnDisk.byteLength }),
      );
    }
    const eucCompiled = await compilePage({
      siteObservationDir: dir,
      page: eucPage,
      familyType: eucPage.familyType,
      sourceObservationRef: "fixture/pages/p000002/observation.json",
      styleBuilder: new StyleCatalogBuilder(),
      assetBuilder: new AssetCatalogBuilder(origin),
    });
    const eucNode = eucCompiled.spec.viewports.desktop.nodes.find(
      (n): n is ElementSpecNode => n.type === "element" && n.inlineStyleProvenance !== undefined,
    );
    check(
      "the compile DECODES the raw bytes with the recorded charset: the Korean direct text corroborates → matched, 10px → 20px initial-mutated",
      eucNode?.inlineStyleProvenance?.correspondence === "matched" &&
        eucNode.inlineStyleProvenance.byProperty.width?.class === "initial-mutated" &&
        eucNode.inlineStyleProvenance.byProperty.width?.initialValue === "10px",
      JSON.stringify(eucNode?.inlineStyleProvenance),
    );

    // Size delta of the new channels on this fixture (measurement, logged).
    const stripKeys = (value: unknown, keys: readonly string[]): unknown =>
      JSON.parse(JSON.stringify(value, (k, v: unknown) => (keys.includes(k) ? undefined : v)));
    const domText = await readFile(path.join(pageDir, "viewports/desktop/dom.json"), "utf8");
    const domWithout =
      JSON.stringify(
        stripKeys(JSON.parse(domText), [
          "inlineStyle", "layoutRulesMatched", "layoutRulesKept",
          "sheetIndex", "ruleOrder", "specificity", "layerOrder", "supportsMatches",
        ]),
        null,
        2,
      ) + "\n";
    const probeText = await readFile(path.join(pageDir, "layout-probe.json"), "utf8");
    const probeWithout =
      JSON.stringify(stripKeys(JSON.parse(probeText), ["s", "inlineStyleTable", "familySwitchBisections"]), null, 2) + "\n";
    console.log(
      `  INFO  size delta (desktop fixture): dom.json ${Buffer.byteLength(domWithout)} → ${Buffer.byteLength(domText)} ` +
        `bytes; layout-probe.json ${Buffer.byteLength(probeWithout)} → ${Buffer.byteLength(probeText)} bytes`,
    );
  } finally {
    if (browser) await browser.close();
    server.close();
    if (dir) await rm(dir, { recursive: true, force: true });
  }
}

/** Review fixes M1 / M2 / m2 — the collector, on one page, in a real Chromium. */
const REVIEW_CASCADE_FIXTURE_HTML =
  `<!doctype html><html><head><meta charset="utf-8"><title>review cascade</title><style>` +
  // M2: a mobile-first BASE rule that wins at the capture width, then 10
  // non-applying, higher-specificity breakpoint / @supports variants.
  `.bp { width: 10px; }\n` +
  Array.from({ length: 9 }, (_, i) => `@media (min-width: ${5000 + i}px) { #bp.bp { width: ${101 + i}px; } }`).join("\n") +
  `\n@supports (display: no-such-value) { #bp.bp { width: 200px; } }\n` +
  // M2: 9 APPLYING declarations of one property — even the applying set
  // overflows the cap of 8; the weakest applying one (the base) is the one cut.
  `.bp2 { max-width: 1px; }\n` +
  Array.from({ length: 8 }, (_, i) => `@media (min-width: 1px) { .bp2 { max-width: ${i + 2}px; } }`).join("\n") +
  `\n@media (min-width: 5000px) { #bp2.bp2 { max-width: 98px; } }\n` +
  `@media (min-width: 5001px) { #bp2.bp2 { max-width: 99px; } }\n` +
  // m2: a layer statement inside a NON-matching @media must not register order.
  `@media (max-width: 1px) { @layer late; }\n` +
  `@supports (display: no-such-value) { @layer late { #nothing { width: 0px; } } }\n` +
  `@layer early { #lay { width: 1px; } }\n` +
  `@layer late { #lay { width: 2px; } }\n` +
  `</style></head><body>` +
  `<section id="bp" class="bp">bp</section>` +
  `<section id="bp2" class="bp2">bp2</section>` +
  `<section id="lay">lay</section>` +
  `<section id="varpad" style="padding: var(--p); margin-left: 3px; flex: var(--f) !important">var</section>` +
  `</body></html>`;

async function testReviewFixCollector(): Promise<void> {
  console.log("");
  console.log("Review fixes M1 var() shorthand inline, M2 applicability-first cap, m2 conditional @layer (real Chromium)");
  const { server, origin } = await startSingleDocServer(REVIEW_CASCADE_FIXTURE_HTML);
  let browser: Browser | undefined;
  try {
    browser = await chromium.launch();
    const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
    await page.goto(`${origin}/`, { waitUntil: "load" });
    await installBrowserNameShim(page);
    const raw = await page.evaluate(collectPageInBrowser, { config: COLLECT_CONFIG });
    const byHtmlId = (id: string) => raw.elements.find((e) => e.attributes.id === id);

    const bp = byHtmlId("bp");
    const bpWidths = (bp?.matchedLayoutRules ?? []).filter((r) => r.property === "width").map((r) => r.value);
    check(
      "M2: 11 matching width declarations, cap 8 — the APPLYING base winner (10px) is KEPT despite the lowest specificity",
      bp?.layoutRulesMatched === 11 && bpWidths.length === MAX_MATCHED_RULES_PER_PROPERTY && bpWidths.includes("10px") &&
        bp.styles.width === "10px",
      JSON.stringify({ matched: bp?.layoutRulesMatched, bpWidths, computed: bp?.styles.width }),
    );
    const bp2 = byHtmlId("bp2");
    const bp2Values = (bp2?.matchedLayoutRules ?? []).filter((r) => r.property === "max-width").map((r) => r.value);
    check(
      "M2: when the APPLYING set itself overflows, the kept 8 are the applying winners (2px..9px) and no non-applying one is kept",
      bp2Values.join(",") === "2px,3px,4px,5px,6px,7px,8px,9px" && bp2?.styles["max-width"] === "9px",
      JSON.stringify({ bp2Values, computed: bp2?.styles["max-width"] }),
    );
    check(
      "M2: coverage counts dropped APPLYING (1: the weakest base on #bp2) vs NON-applying (3 on #bp + 2 on #bp2)",
      raw.stylesheetCoverage?.layoutRulesDroppedApplying === 1 &&
        raw.stylesheetCoverage.layoutRulesDroppedNonApplying === 5,
      JSON.stringify(raw.stylesheetCoverage),
    );

    const lay = byHtmlId("lay");
    const early = lay?.matchedLayoutRules?.find((r) => r.value === "1px");
    const late = lay?.matchedLayoutRules?.find((r) => r.value === "2px");
    check(
      "m2: @layer statement / block inside a non-applying @media/@supports registers NO order (early 0 < late 1, as the engine computes: 2px)",
      early?.layerOrder === 0 && late?.layerOrder === 1 && lay?.styles.width === "2px" &&
        raw.stylesheetCoverage?.cascadeLayers === 2 &&
        raw.stylesheetCoverage.cascadeLayersConditionalSkipped === 2,
      JSON.stringify({ early, late, computed: lay?.styles.width, cov: raw.stylesheetCoverage?.cascadeLayersConditionalSkipped }),
    );

    const varpad = byHtmlId("varpad");
    const vdecl = (property: string) => varpad?.inlineStyle?.decls.find((d) => d.property === property);
    check(
      "M1: `padding: var(--p)` / `flex: var(--f) !important` are recorded RAW as shorthands (their CSSOM longhands read back empty)",
      vdecl("padding")?.value === "var(--p)" &&
        vdecl("flex")?.value === "var(--f)" &&
        vdecl("flex")?.important === true &&
        vdecl("margin-left")?.value === "3px" &&
        vdecl("padding-left") === undefined,
      JSON.stringify(varpad?.inlineStyle),
    );
    check(
      "M1: …and the record is marked truncated with unresolvedShorthands = 2 (counted in coverage)",
      varpad?.inlineStyle?.truncated === true &&
        varpad.inlineStyle.unresolvedShorthands === 2 &&
        raw.stylesheetCoverage?.inlineStyleUnresolvedShorthands === 2,
      JSON.stringify({ inline: varpad?.inlineStyle, cov: raw.stylesheetCoverage?.inlineStyleUnresolvedShorthands }),
    );
    check(
      "M1: the persisted element schema keeps truncated + unresolvedShorthands (zod would strip undeclared fields)",
      (() => {
        const parsed = ElementObservationSchema.shape.inlineStyle.parse(JSON.parse(JSON.stringify(varpad?.inlineStyle)));
        return parsed?.truncated === true && parsed.unresolvedShorthands === 2;
      })(),
    );
  } finally {
    if (browser) await browser.close();
    server.close();
  }
}

/** Review fixes M3 (gradual bisection) + M5 (time-varying inline) — real probe. */
async function testReviewFixProbe(): Promise<void> {
  console.log("");
  console.log("Review fixes M3 bisection end re-measure, M5 first-width re-measure (real Chromium)");
  const { server, port } = await startServer();
  const root = `http://127.0.0.1:${port}`;
  let browser: Browser | undefined;
  try {
    browser = await chromium.launch();
    const gradual = await probeLayout(browser, `${root}/family-gradual`, { widths: [400, 800] });
    const bisection = gradual.familySwitchBisections?.[0];
    check(
      "M3: a gradual change reads `changed` across the pair and is bisected…",
      gradual.familySwitchBisections?.length === 1 &&
        bisection !== undefined &&
        observerFamilyChangeVerdict(gradual.widths[0]!.fingerprint!, gradual.widths[1]!.fingerprint!) === "changed",
      JSON.stringify(gradual.familySwitchBisections),
    );
    check(
      "M3: …but the RE-MEASURED 1px bracket holds no switch → converged:false, reason gradual",
      bisection !== undefined &&
        bisection.hi - bisection.lo === 1 &&
        bisection.converged === false &&
        bisection.reason === "gradual" &&
        observerFamilyChangeVerdict(bisection.loFingerprint, bisection.hiFingerprint) !== "changed",
      JSON.stringify(bisection),
    );
    const swap = await probeLayout(browser, `${root}/family-js-swap`, { widths: [400, 700, 1000, 1200] });
    check(
      "M3 control: a real JS swap still converges (reason absent) and M5 control: a resize-only inline style is NOT time-varying",
      swap.familySwitchBisections?.[0]?.converged === true &&
        swap.familySwitchBisections[0].reason === undefined &&
        swap.inlineStyleRecheck?.width === 400 &&
        swap.inlineStyleRecheck.timeVaryingElements === 0,
      JSON.stringify({ b: swap.familySwitchBisections, r: swap.inlineStyleRecheck?.timeVaryingElements }),
    );

    const carousel = await probeLayout(browser, `${root}/inline-carousel`, { widths: [400, 700, 1000] });
    const table = carousel.inlineStyleTable ?? [];
    const trackIndex = carousel.tags.findIndex((_, i) =>
      carousel.widths.every((w) => (table[w.s?.[i] ?? -1] ?? "").startsWith("transform")),
    );
    const texts = carousel.widths.map((w) => table[w.s?.[trackIndex] ?? -1] ?? null);
    const recheckText = table[carousel.inlineStyleRecheck?.s[trackIndex] ?? -1] ?? null;
    check(
      "M5: the probe re-measures its first width at the end; the carousel's inline transform differs at that SAME width",
      trackIndex >= 0 &&
        carousel.inlineStyleRecheck?.width === 400 &&
        (carousel.inlineStyleRecheck.timeVaryingElements ?? 0) >= 1 &&
        recheckText !== null &&
        recheckText !== texts[0],
      JSON.stringify({ texts, recheckText, recheck: carousel.inlineStyleRecheck?.timeVaryingElements }),
    );
    const provenance = computeInlineStyleProvenance({
      elements: [
        {
          id: "track",
          tagName: "div",
          attributes: { id: "track" },
          inlineStyle: { decls: [{ property: "transform", value: "translateX(-500px)" }], raw: recheckText ?? "" },
        },
      ],
      initialHtml: undefined,
      widthStyles: new Map([["track", texts]]),
      recheckStyles: new Map([["track", recheckText]]),
    });
    const transform = provenance.byElementId.get("track")?.byProperty.transform;
    check(
      "M5: provenance classes the carousel transform `unknown` (time-varying), NOT runtime-responsive",
      transform?.class === "unknown" && transform.unknownReason === "time-varying" && transform.timeVarying === true,
      JSON.stringify(transform),
    );
    check(
      "the persisted probe schema keeps inlineStyleRecheck + bisection reason (zod would strip undeclared fields)",
      (() => {
        const parsedCarousel = LayoutProbeSchema.parse(JSON.parse(JSON.stringify(carousel)));
        const parsedGradual = LayoutProbeSchema.parse(JSON.parse(JSON.stringify(gradual)));
        return (
          parsedCarousel.inlineStyleRecheck?.s.length === carousel.tags.length &&
          parsedGradual.familySwitchBisections?.[0]?.reason === "gradual"
        );
      })(),
    );
  } finally {
    if (browser) await browser.close();
    server.close();
  }
}

async function main(): Promise<void> {
  console.log("[smoke:multi-observer] Task 09 — multi-page deep observation");
  console.log("");

  testPlanning();
  await testInputValidation();
  await testOrchestration();
  await testPrepareScrollProbeParity();
  await testCssTruthRecovery();
  await testRedirectedStylesheetRecovery();
  await testImportCoverageBothPaths();
  testTableFormattingWhitelistPure();
  await testTableFormattingWhitelistEndToEnd();
  await testMediaConditionLogic();
  await testScrollRevealAndOverlayCensus();
  testDerivedProbeWidths();
  await testProbeWidthDerivationEndToEnd();
  // Task 28.7 WP-A.
  await testPrepareScrollNavigationSafety();
  await testPageStateNormalization();
  // Task 28.75.
  await testPageStateApiAndSafety();
  await testScrollPassTraversal();
  await testRealSiteNormalizationSymmetry();
  await testDeterministicSettle();
  await testScreenshotDegradation();
  // Task 28.7 WP-B.
  await testSourceIntegrity();
  // Task 28.75 §07.
  await testProbeCoverage();
  await testMobileEnvelopeFromDesktopEvidence();
  // Task 28.7 §27.
  await testDomFamilyFingerprint();
  // Responsive Core P0 §C1.
  testFamilyVerdictParity();
  testInlineStyleTableMergePure();
  await testCascadeMetadataAndInlineCapture();
  await testFamilySwitchBisection();
  await testInlineStyleProvenanceEndToEnd();
  // Independent review fixes.
  await testReviewFixCollector();
  await testReviewFixProbe();

  console.log("");
  console.log(`${checks - failures}/${checks} checks passed`);
  if (failures > 0) {
    console.error(`[smoke:multi-observer] FAILED — ${failures} check(s) failed`);
    process.exitCode = 1;
  } else {
    console.log("[smoke:multi-observer] OK");
  }
}

main().catch((err) => {
  console.error(
    "[smoke:multi-observer] ERROR —",
    err instanceof Error ? err.message : err,
  );
  process.exitCode = 1;
});
