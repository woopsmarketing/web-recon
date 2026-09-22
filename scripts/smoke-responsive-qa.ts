import { createServer, type Server } from "node:http";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { chromium, type Browser } from "playwright";
import {
  BLANK_REGION_BLOCKER_RATIO,
  BLANK_REGION_MAJOR_RATIO,
  TEXT_COLLISION_MIN_INTERSECTION_RATIO,
  DISTRIBUTION_MAJOR_P90_PX,
  DUPLICATE_IMAGE_LAYER_TOLERANCE_PX,
  IMAGE_LAYER_FAILURE_MAJOR_EXCESS,
  MAX_REGIONS,
  MISSING_TEXT_BLOCKER_RATIO,
  OFFSCREEN_TEXT_BLOCKER_EXCESS_CHARS,
  OVERLAP_BLOCKER_EXCESS_RATIO,
  QA_PAGE_STATE_EVIDENCE_ROOT,
  REGION_INK_DOM_COVERAGE_MIN,
  MIN_TRUSTWORTHY_MATCH_FRACTION,
  PIXEL_RESIDUAL_MINOR_RATIO,
  PIXEL_UNCOMPARED_BAND_INK_MAJOR_RATIO,
  RUBRIC_VERSION,
  ResponsiveQaInputError,
  SOURCE_POPULATION_REVERSION_RATIO,
  SOURCE_POPULATION_SPIKE_RATIO,
  TEXT_KEY_MAX_CHARS,
  WIDE_ELEMENT_VIEWPORT_FACTOR,
  type ChannelReading,
  type Classification,
  type ColumnContainer,
  type LeafBox,
  type PageStateRecord,
  type RegionBox,
  type PairResult,
  type ResponsiveQaRunArtifact,
  type SideMeasurement,
  type VisibleTextEntry,
} from "../src/responsive-qa/types.js";
import { CAPTURE_POLICY, captureSide } from "../src/responsive-qa/capture.js";
import {
  COMPOSITE_UNCOMPARED_BAND_CLASS,
  COMPOSITE_WIDTH_MISMATCH_MARKER,
  buildCompositeHtml,
  compositeWidthMismatch,
} from "../src/responsive-qa/composite.js";
import {
  markInitialPaintCensus,
  normalizePageState,
} from "../src/observer/index.js";
import {
  probeInBrowser,
  REGION_CENSUS_DEFAULTS,
  REGION_REJECTION_REASONS,
} from "../src/responsive-qa/probe.js";
import {
  cloneRegionIsBlankByInk,
  detectBlankRegions,
  inkInsideBox,
  inkTrustOf,
  pairRegions,
  paintInsideBox,
  reachesBlocker,
  regionCorroboratesContentAbsence,
  sharedPathSuffix,
  sourceRegionIsPopulated,
  unionArea,
  type BlankRegion,
  type BlankRegionSide,
} from "../src/responsive-qa/blank-region.js";
import {
  describeTextCollisions,
  detectTextCollisions,
  isCriticalRegion,
  textLeavesCollide,
} from "../src/responsive-qa/text-collision.js";
import { correspond, missingText, compareColumns } from "../src/responsive-qa/correspondence.js";
import { gatePixels } from "../src/responsive-qa/pixel-gate.js";
import {
  blankRegionSeverityCap,
  classifyPair,
  cloneRouteGate,
} from "../src/responsive-qa/classify.js";
import {
  classifyOverlapPair,
  computeOverlapAccounting,
  sameBoxWithin,
} from "../src/responsive-qa/overlap.js";
import {
  absentFloor,
  accountForCoverage,
  applySourceStabilityGuard,
  carriesLayoutVerdict,
  detectSourceInstability,
  floorFrom,
  readFloorArtifact,
  selfIsTheFloor,
} from "../src/responsive-qa/run.js";
import { RUN_ARTIFACT_FILE, responsiveRunDir } from "../src/responsive-qa/store.js";
import { parseArgs } from "../src/cli-qa-responsive.js";
import {
  compareImages,
  type DecodedImage,
} from "../src/reconstruction-qa/screenshot-diff.js";

/**
 * Automated coverage for src/responsive-qa (Task 28.6, wave 4).
 *
 * WHY THIS FILE EXISTS. The five-width responsive harness shipped with ZERO
 * automated coverage: nothing in scripts/ or src/ executed a line of it except
 * the CLI, and the regression evidence the lane cited was a different
 * subsystem's suite running byte-identically. An adversarial audit then found
 * four wrong-value paths in it, three of them on the primary BLOCKER channel
 * and every one of them in the FALSE-PASS direction. A measuring instrument
 * that six pilot sites will be graded by cannot be the one module with no test.
 *
 * WHAT IS COVERED, AND WHY EACH ONE. Every section below pins an invariant that
 * a real mutation has been shown to break — the audit broke three of them by
 * hand before this file existed, and each check here was verified to go red
 * when its invariant is violated:
 *
 *   A  the probe's wide-element ordering. Moving the clipping test back after
 *      the wide-element `continue` flips `footer.fullyInsideViewport` to true
 *      and silences a footer-clipped BLOCKER.
 *   B  the pixel gate's partition invariant, its ink calibration, and the
 *      rounded-zero flag.
 *   C  the correspondence trust gate's numerator: content-keyed pairs over
 *      content-keyed leaves, with no cross-namespace numerator and no cap.
 *   D  missingText's three arithmetic paths: occurrence counting, untruncated
 *      lengths, and token-boundary matching.
 *   E  the capture scroll floor: a document shorter than the viewport must not
 *      report that it reached the bottom by scrolling.
 *   F  the rubric roster: the channels the classifier actually emits.
 *   G1 the opacity census, INCLUDING THE ANCESTOR WALK. A box or a text node
 *      under an `opacity:0` ancestor is invisible to a reader; the old TEXT
 *      census only tested `display`/`visibility` and missed it outright
 *      (missing-text-ratio read 0.0000 on a page with whole blocks baked
 *      blank), and the old BOX census tested opacity SELF-only, so a node
 *      whose own opacity is 1 under a hidden ancestor passed it too.
 *   G2 the token-boundary rule is SCRIPT-AWARE. Korean, Chinese, Japanese,
 *      Thai, Lao, Khmer and Burmese have no orthographic word boundary the
 *      English-only rule can demand, so an agglutinated suffix, a particle, a
 *      compound head or a verbaliser all read as a complete deletion under
 *      the old rule and are found under the shipped one.
 *   G3 `position-delta-p90-px` reads the ON-VIEWPORT population only. A
 *      source's own parked-off-screen carousel slides used to dominate the
 *      channel with thousands of px that describe the source's carousel, not
 *      the clone's fidelity; the excluded population is still measured,
 *      counted and reported, one channel down.
 *   G4 the grading floor is a first-class, CHECKED field. `floorFrom` proves
 *      comparability (mode, site, rubricVersion, channelRoster, widths,
 *      routes) rather than assuming it, `absentFloor` says so loudly when
 *      there is none, and the CLI flags that supply a floor
 *      (`--with-self-check`, `--self-check-run`) are real, parsed flags.
 *
 * NOTHING HERE TALKS TO A LIVE SITE. Sections A, E and G1 serve their own
 * fixtures from a local http server; everything else is pure or touches only
 * a scratch temp directory.
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

function near(a: number, b: number, tolerance = 1e-9): boolean {
  return Math.abs(a - b) <= tolerance;
}

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

/**
 * A footer whose child is 2.2 viewports wide and CLIPPED, so `scrollWidth`
 * equals `innerWidth` and the document reports no horizontal overflow at all.
 * This is the exact shape the wide-element exclusion used to hide.
 */
const OVERFLOW_HTML = `<!doctype html><html><head><meta charset="utf-8"><title>overflow</title><style>
 body{margin:0;font:16px/1.4 system-ui}
 header{background:#eee;padding:8px}
 main{height:400px;background:#fafafa}
 footer{background:#ddd;position:relative;overflow:hidden;padding:12px}
 .bleed{width:2200px;height:60px;background:#c00;color:#fff}
 .normal{width:300px;height:20px;background:#08c}
</style></head><body>
 <header><nav><a href="/a">one</a> <a href="/b">two</a></nav></header>
 <main>content</main>
 <footer>
   <div class="bleed">OVERFLOWING FOOTER BOX 2200px</div>
   <div class="normal">normal footer box</div>
 </footer>
</body></html>`;

/** The same page with the wide box removed: the control for section A. */
const TIDY_HTML = `<!doctype html><html><head><meta charset="utf-8"><title>tidy</title><style>
 body{margin:0;font:16px/1.4 system-ui}
 header{background:#eee;padding:8px}
 main{height:400px;background:#fafafa}
 footer{background:#ddd;overflow:hidden;padding:12px}
 .normal{width:300px;height:20px;background:#08c}
</style></head><body>
 <header><nav><a href="/a">one</a> <a href="/b">two</a></nav></header>
 <main>content</main>
 <footer><div class="normal">normal footer box</div></footer>
</body></html>`;

/**
 * A price rendered by a web component into an OPEN shadow root, plus the same
 * digits in the light DOM. The `US` prefix exists only inside the shadow root —
 * exactly the shape that made a real dropped currency prefix invisible to the
 * text census on both sides.
 */
const SHADOW_HTML = `<!doctype html><html><head><meta charset="utf-8"><title>shadow</title></head><body>
 <h1>Pricing</h1>
 <price-tag></price-tag>
 <p>Because our customers ship faster</p>
 <script>
  class PriceTag extends HTMLElement {
    connectedCallback() {
      const root = this.attachShadow({ mode: "open" });
      root.innerHTML = '<span>US</span><span>$10 per user/month</span>';
    }
  }
  customElements.define("price-tag", PriceTag);
 </script>
</body></html>`;

/** The text a scroll-reveal wrapper hides, and how many characters it is. */
const OPACITY_HIDDEN_TEXT = "Scroll reveal text not yet shown";

/**
 * A scroll-reveal target held at `opacity: 0` — the pre-trigger shape
 * ScrollReveal, AOS, WOW.js and framer-motion's `initial={{opacity:0}}` all
 * produce, and the shape a static clone BAKES PERMANENTLY (item G1). The
 * paragraph's OWN `opacity` is explicitly 1 — only its ANCESTOR is at 0 — so
 * a self-only opacity test (the pre-G1 BOX census) sees nothing wrong with
 * it; only the ancestor walk catches it.
 */
const OPACITY_HIDDEN_HTML = `<!doctype html><html><head><meta charset="utf-8"><title>opacity</title><style>
 body{margin:0;font:16px/1.4 system-ui}
 header{padding:8px}
 main{padding:12px}
 .reveal{opacity:0}
 .reveal .inner{opacity:1}
</style></head><body>
 <header><h1>Visible headline</h1></header>
 <main>
  <p>Always visible paragraph</p>
  <section class="reveal"><p class="inner">${OPACITY_HIDDEN_TEXT}</p></section>
 </main>
</body></html>`;

/** The same page with the reveal already fired: the control for section G1. */
const OPACITY_VISIBLE_HTML = `<!doctype html><html><head><meta charset="utf-8"><title>opacity-control</title><style>
 body{margin:0;font:16px/1.4 system-ui}
 header{padding:8px}
 main{padding:12px}
 .reveal{opacity:1}
 .reveal .inner{opacity:1}
</style></head><body>
 <header><h1>Visible headline</h1></header>
 <main>
  <p>Always visible paragraph</p>
  <section class="reveal"><p class="inner">${OPACITY_HIDDEN_TEXT}</p></section>
 </main>
</body></html>`;

/** Shorter than the 900px capture viewport: nothing to scroll. */
const SHORT_HTML = `<!doctype html><html><head><meta charset="utf-8"><title>short</title></head>
<body style="margin:0"><div style="height:120px">short page</div></body></html>`;

/** Far taller than the viewport: a real scroll to a real bottom. */
const TALL_HTML = `<!doctype html><html><head><meta charset="utf-8"><title>tall</title></head>
<body style="margin:0"><div style="height:4000px;background:linear-gradient(#fff,#ccc)">tall page</div></body></html>`;

function serveFixtures(routes: Record<string, string>): Promise<{
  origin: string;
  close: () => Promise<void>;
}> {
  return new Promise((resolve, reject) => {
    const server: Server = createServer((request, response) => {
      const body = routes[(request.url ?? "/").split("?")[0] ?? "/"];
      if (body === undefined) {
        response.writeHead(404, { "content-type": "text/plain" });
        response.end("not found");
        return;
      }
      response.writeHead(200, { "content-type": "text/html; charset=utf-8" });
      response.end(body);
    });
    server.on("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      if (address === null || typeof address === "string") {
        reject(new Error("fixture server did not bind a port"));
        return;
      }
      resolve({
        origin: `http://127.0.0.1:${address.port}`,
        close: () =>
          new Promise<void>((done) => {
            server.close(() => done());
          }),
      });
    });
  });
}

/** A solid RGBA image; `paint` may overwrite individual pixels. */
function image(
  width: number,
  height: number,
  fill: [number, number, number],
  paint?: (set: (x: number, y: number, r: number, g: number, b: number) => void) => void,
): DecodedImage {
  const data = Buffer.alloc(width * height * 4);
  for (let i = 0; i < width * height; i++) {
    data[i * 4] = fill[0];
    data[i * 4 + 1] = fill[1];
    data[i * 4 + 2] = fill[2];
    data[i * 4 + 3] = 255;
  }
  const set = (x: number, y: number, r: number, g: number, b: number): void => {
    const i = (y * width + x) * 4;
    data[i] = r;
    data[i + 1] = g;
    data[i + 2] = b;
    data[i + 3] = 255;
  };
  if (paint) paint(set);
  return { width, height, data };
}

/** The census shape the probe now produces, built here so the pure sections
 *  need no browser. `chars` is the UNTRUNCATED total, exactly as the probe
 *  records it. */
function census(nodes: readonly string[]): {
  visibleTextEntries: VisibleTextEntry[];
  visibleTextChars: number;
} {
  const map = new Map<string, VisibleTextEntry>();
  let visibleTextChars = 0;
  for (const raw of nodes) {
    const text = raw.replace(/\s+/g, " ").trim().toLowerCase();
    if (!text) continue;
    visibleTextChars += text.length;
    const truncated = text.length > TEXT_KEY_MAX_CHARS;
    const key = truncated ? text.slice(0, TEXT_KEY_MAX_CHARS) : text;
    const entry = map.get(key);
    if (entry) {
      entry.occurrences++;
      entry.chars += text.length;
      if (truncated) entry.truncated = true;
    } else {
      map.set(key, { key, occurrences: 1, chars: text.length, truncated });
    }
  }
  return {
    visibleTextEntries: Array.from(map.values()).sort((a, b) =>
      a.key < b.key ? -1 : a.key > b.key ? 1 : 0,
    ),
    visibleTextChars,
  };
}

function leaf(key: string, left: number, chars = 5): LeafBox {
  return {
    key,
    kind: key.charAt(0) === "t" ? "text" : "image",
    left,
    right: left + 100,
    top: 0,
    bottom: 20,
    chars,
  };
}

// ---------------------------------------------------------------------------
// A. the probe: wide-element ordering, and the shadow-root census
// ---------------------------------------------------------------------------

async function testProbe(browser: Browser): Promise<void> {
  section("A. probe — wide-element ordering (item C3.3) and the text census (item C3.10)");
  // Task 28.8 FAST Phase F correction 2 — GTM / pixel <noscript> fallbacks as a
  // live page keeps them (raw text with scripting on), beside real text.
  const NOSCRIPT_HTML = `<!doctype html><html><head><meta charset="utf-8"></head><body>
    <noscript><img height="1" width="1" style="display:none" src="https://example.invalid/tr?id=1"/></noscript>
    <noscript><iframe src="https://example.invalid/ns.html?id=GTM-X" height="0" width="0" style="display:none;visibility:hidden"></iframe></noscript>
    <p>hello world</p>
    <template><p>template text never paints</p></template>
    <script type="text/plain">script text never paints</script>
  </body></html>`;
  const fixtures = await serveFixtures({
    "/overflow": OVERFLOW_HTML,
    "/tidy": TIDY_HTML,
    "/shadow": SHADOW_HTML,
    "/noscript": NOSCRIPT_HTML,
  });
  try {
    const wide = (
      await captureSide({
        browser,
        url: `${fixtures.origin}/overflow`,
        width: 1000,
        screenshotFile: "wide.png",
      })
    ).measurement;
    const tidy = (
      await captureSide({
        browser,
        url: `${fixtures.origin}/tidy`,
        width: 1000,
        screenshotFile: "tidy.png",
      })
    ).measurement;

    // The trap: the overflow is CLIPPED, so the document-level channel is blind
    // to it and only the landmark test can see it.
    check(
      "a clipped 2.2-viewport footer box produces NO document horizontal overflow",
      wide.horizontalOverflow <= 1 && wide.scrollWidth <= wide.innerWidth + 1,
      `horizontalOverflow=${wide.horizontalOverflow} scrollWidth=${wide.scrollWidth} innerWidth=${wide.innerWidth}`,
    );
    // THE ORDERING ASSERTION. `fullyInsideViewport` must be computed BEFORE the
    // wide-element `continue`; move the clipping test after it and this flips
    // to true, which is exactly how a footer-clipped BLOCKER goes silent.
    check(
      "…and footer.fullyInsideViewport is FALSE anyway: the clipping test runs before the wide-element exclusion",
      wide.footer.fullyInsideViewport === false,
      `fullyInsideViewport=${wide.footer.fullyInsideViewport}`,
    );
    check(
      "…the excluded wide box is COUNTED, never silently dropped",
      wide.footer.wideElementsExcluded >= 1 &&
        wide.footer.widestExcludedWidth >= 1000 * WIDE_ELEMENT_VIEWPORT_FACTOR,
      `excluded=${wide.footer.wideElementsExcluded} widest=${wide.footer.widestExcludedWidth}`,
    );
    check(
      "…and the filtered and unfiltered right edges disagree, so the exclusion is legible",
      wide.footer.maxRight <= wide.innerWidth + 1 &&
        wide.footer.maxRightIncludingWide > wide.innerWidth + 1,
      `maxRight=${wide.footer.maxRight} maxRightIncludingWide=${wide.footer.maxRightIncludingWide}`,
    );
    check(
      "the control page with no wide box reports fullyInsideViewport TRUE, so the assertion above is not vacuous",
      tidy.footer.fullyInsideViewport === true && tidy.footer.wideElementsExcluded === 0,
      `fullyInsideViewport=${tidy.footer.fullyInsideViewport} excluded=${tidy.footer.wideElementsExcluded}`,
    );
    check(
      "the same page-level statistic carries the same pair for content leaves",
      wide.contentMaxRightIncludingWide > wide.contentMaxRight &&
        wide.wideLeavesExcluded >= 1,
      `maxRight=${wide.contentMaxRight} including=${wide.contentMaxRightIncludingWide} excluded=${wide.wideLeavesExcluded}`,
    );

    const shadow = (
      await captureSide({
        browser,
        url: `${fixtures.origin}/shadow`,
        width: 1000,
        screenshotFile: "shadow.png",
      })
    ).measurement;
    const noscript = (
      await captureSide({
        browser,
        url: `${fixtures.origin}/noscript`,
        width: 1000,
        screenshotFile: "noscript.png",
      })
    ).measurement;
    check(
      "Task 28.8 FAST correction 2 — <noscript>/<template>/<script> markup is NOT visible text (only 'hello world' counts)",
      noscript.visibleTextChars === "hello world".length,
      `visibleTextChars=${noscript.visibleTextChars}`,
    );
    check(
      "the text census descends into an OPEN shadow root",
      shadow.shadowRootsTraversed === 1 && shadow.shadowTextNodes === 2,
      `roots=${shadow.shadowRootsTraversed} nodes=${shadow.shadowTextNodes}`,
    );
    check(
      "…and the shadow text it found is inside visibleTextChars, not beside it",
      shadow.shadowTextChars > 0 && shadow.visibleTextChars > shadow.shadowTextChars,
      `shadowChars=${shadow.shadowTextChars} visibleChars=${shadow.visibleTextChars}`,
    );
    check(
      "…so the shadow-only 'US' prefix is a key the census can be asked about",
      shadow.visibleTextEntries.some((entry) => entry.key === "us"),
      shadow.visibleTextEntries.map((entry) => entry.key).join(" | "),
    );
    const censusChars = shadow.visibleTextEntries.reduce(
      (sum, entry) => sum + entry.chars,
      0,
    );
    check(
      "THE CENSUS INVARIANT: sum(entry.chars) === visibleTextChars, one population for both sides of every ratio",
      censusChars === shadow.visibleTextChars,
      `sum=${censusChars} visibleTextChars=${shadow.visibleTextChars}`,
    );
  } finally {
    await fixtures.close();
  }
}

// ---------------------------------------------------------------------------
// G1. the opacity census, including the ancestor walk
// ---------------------------------------------------------------------------

async function testOpacityCensus(browser: Browser): Promise<void> {
  section("G1. probe — the opacity census, including the ancestor walk (item G1)");
  const fixtures = await serveFixtures({
    "/hidden": OPACITY_HIDDEN_HTML,
    "/visible": OPACITY_VISIBLE_HTML,
  });
  try {
    const hidden = (
      await captureSide({
        browser,
        url: `${fixtures.origin}/hidden`,
        width: 1000,
        screenshotFile: "opacity-hidden.png",
      })
    ).measurement;
    const visible = (
      await captureSide({
        browser,
        url: `${fixtures.origin}/visible`,
        width: 1000,
        screenshotFile: "opacity-visible.png",
      })
    ).measurement;

    // THE PRIMARY DEFECT. The TEXT census must exclude a node under an
    // opacity:0 ANCESTOR, not just a node whose own opacity is 0.
    check(
      "THE TEXT CENSUS excludes text under an opacity:0 ancestor, and counts what it excluded",
      hidden.opacityHiddenTextChars === OPACITY_HIDDEN_TEXT.length &&
        hidden.opacityHiddenTextNodes === 1,
      `opacityHiddenTextChars=${hidden.opacityHiddenTextChars} nodes=${hidden.opacityHiddenTextNodes} expected=${OPACITY_HIDDEN_TEXT.length}`,
    );
    check(
      "…so visibleTextChars is reduced by EXACTLY that much versus the reveal-fired control",
      hidden.visibleTextChars === visible.visibleTextChars - OPACITY_HIDDEN_TEXT.length,
      `hidden=${hidden.visibleTextChars} visible=${visible.visibleTextChars}`,
    );
    check(
      "the control page (reveal already fired) hides NOTHING — this is not vacuous",
      visible.opacityHiddenTextChars === 0 && visible.opacityHiddenTextNodes === 0,
      `opacityHiddenTextChars=${visible.opacityHiddenTextChars}`,
    );

    // THE OTHER DIRECTION. <p class="inner"> has its OWN opacity at 1 — only
    // its ANCESTOR <section class="reveal"> is at 0 — so a self-only box test
    // computes opacity 1 on it and calls it visible. The chain walk must
    // catch it anyway, and the wrapper (self-opacity 0) is counted apart from
    // the box the ancestor walk alone catches.
    check(
      "THE BOX CENSUS ancestor walk: a box with its OWN opacity 1 under a hidden ANCESTOR is excluded",
      hidden.opacityHiddenByAncestorNodes === 1,
      `opacityHiddenByAncestorNodes=${hidden.opacityHiddenByAncestorNodes}`,
    );
    check(
      "…counted APART from the wrapper itself, whose own opacity really is 0",
      hidden.opacityHiddenNodes === 2 &&
        hidden.zeroOpacityNodes === 1 &&
        hidden.opacityHiddenNodes === hidden.opacityHiddenByAncestorNodes + hidden.zeroOpacityNodes,
      `opacityHiddenNodes=${hidden.opacityHiddenNodes} byAncestor=${hidden.opacityHiddenByAncestorNodes} zeroOpacityNodes=${hidden.zeroOpacityNodes}`,
    );
    check(
      "…so visibleNodes drops by exactly the two excluded elements versus the control",
      visible.visibleNodes - hidden.visibleNodes === 2,
      `hidden=${hidden.visibleNodes} visible=${visible.visibleNodes}`,
    );

    // BOTH CENSUSES NOW AGREE, and the invariant from section A still holds on
    // a page that actually exercises the opacity exclusion.
    const censusChars = hidden.visibleTextEntries.reduce((sum, entry) => sum + entry.chars, 0);
    check(
      "the census invariant still holds with the opacity exclusion applied",
      censusChars === hidden.visibleTextChars,
      `sum=${censusChars} visibleTextChars=${hidden.visibleTextChars}`,
    );
  } finally {
    await fixtures.close();
  }
}

// ---------------------------------------------------------------------------
// B. the pixel gate
// ---------------------------------------------------------------------------

function testPixelGate(): void {
  section("B. pixel gate — the partition invariant, ink calibration, rounded zero (items C3.1, C3.12)");

  // A black bar on white, shifted one pixel right in the clone: every changed
  // pixel has its colour one pixel away, so the gate must call all of it
  // sub-pixel and leave no residual.
  const barSource = image(60, 40, [255, 255, 255], (set) => {
    for (let y = 10; y < 30; y++) for (let x = 10; x < 40; x++) set(x, y, 0, 0, 0);
  });
  const barShifted = image(60, 40, [255, 255, 255], (set) => {
    for (let y = 10; y < 30; y++) for (let x = 11; x < 41; x++) set(x, y, 0, 0, 0);
  });
  const shifted = gatePixels(barSource, barShifted);
  check(
    "THE PARTITION INVARIANT: subpixel + residual === aboveJnd on a one-pixel shift",
    shifted.subpixelAboveJndPixels + shifted.residualAboveJndPixels ===
      shifted.aboveJndPixels,
    `${shifted.subpixelAboveJndPixels} + ${shifted.residualAboveJndPixels} !== ${shifted.aboveJndPixels}`,
  );
  check(
    "…and a pure one-pixel shift is attributed ENTIRELY to sub-pixel, with zero residual",
    shifted.aboveJndPixels > 0 && shifted.residualAboveJndPixels === 0,
    `aboveJnd=${shifted.aboveJndPixels} residual=${shifted.residualAboveJndPixels}`,
  );

  // A block of real content erased to the background: the colour that vanished
  // is nowhere within a pixel, so it must survive the gate.
  const erased = image(60, 40, [255, 255, 255]);
  const gone = gatePixels(barSource, erased);
  check(
    "THE PARTITION INVARIANT holds when content is erased outright",
    gone.subpixelAboveJndPixels + gone.residualAboveJndPixels === gone.aboveJndPixels,
    `${gone.subpixelAboveJndPixels} + ${gone.residualAboveJndPixels} !== ${gone.aboveJndPixels}`,
  );
  check(
    "…and erased content is RESIDUAL, not sub-pixel — the gate never forgives a missing block",
    gone.residualAboveJndPixels > 0 &&
      gone.residualAboveJndPixels > gone.subpixelAboveJndPixels,
    `residual=${gone.residualAboveJndPixels} subpixel=${gone.subpixelAboveJndPixels}`,
  );

  // Ink calibration: the source's modal colour is the background, and the ink
  // is exactly the bar.
  check(
    "sourceInkPixels counts the source's non-background pixels and nothing else",
    gone.sourceInkPixels === 20 * 30,
    `sourceInkPixels=${gone.sourceInkPixels} expected=${20 * 30}`,
  );
  check(
    "…so the ink ratio is a real fraction of the page, far below the area fraction",
    near(gone.sourceInkRatio, 600 / 2400) && gone.sourceInkRatio < 1,
    `sourceInkRatio=${gone.sourceInkRatio}`,
  );
  check(
    "THE CALIBRATION: the same residual reads far larger against ink than against area",
    gone.residualOverInkRatio > gone.residualAboveJndRatio,
    `ink=${gone.residualOverInkRatio} area=${gone.residualAboveJndRatio}`,
  );
  check(
    "…and erasing the whole of a page's ink cannot reach the MINOR area band on a mostly-background page",
    gone.residualAboveJndRatio < PIXEL_RESIDUAL_MINOR_RATIO * 30 &&
      near(gone.residualOverInkRatio, 1),
    `area=${gone.residualAboveJndRatio} ink=${gone.residualOverInkRatio}`,
  );
  check(
    "a blank source has zero ink and the ink ratios stay 0 rather than dividing by it",
    (() => {
      const blank = gatePixels(image(20, 20, [255, 255, 255]), image(20, 20, [255, 255, 255]));
      return (
        blank.sourceInkPixels === 0 &&
        blank.residualOverInkRatio === 0 &&
        blank.residualRatioRoundedToZero === false
      );
    })(),
  );

  // A single residual pixel in a 2.4-megapixel overlap: the ratio rounds to
  // zero at every reported precision, and the flag is the only thing that
  // distinguishes it from a measured zero.
  const bigSource = image(2400, 1000, [255, 255, 255], (set) => {
    for (let x = 0; x < 2400; x++) set(x, 0, 0, 0, 0);
  });
  const bigClone = image(2400, 1000, [255, 255, 255], (set) => {
    for (let x = 0; x < 2400; x++) set(x, 0, 0, 0, 0);
    set(1200, 500, 0, 0, 0);
  });
  const tiny = gatePixels(bigSource, bigClone);
  check(
    "one residual pixel in 2.4 megapixels is MEASURED as one pixel",
    tiny.residualAboveJndPixels === 1,
    `residualAboveJndPixels=${tiny.residualAboveJndPixels}`,
  );
  check(
    "…its ratio rounds to zero, and residualRatioRoundedToZero says so — a rounded zero is not a measured zero",
    tiny.residualAboveJndRatio === 0 && tiny.residualRatioRoundedToZero === true,
    `ratio=${tiny.residualAboveJndRatio} flag=${tiny.residualRatioRoundedToZero}`,
  );
  check(
    "…while a genuinely identical pair reports the flag FALSE",
    (() => {
      const same = gatePixels(bigSource, bigSource);
      return (
        same.residualAboveJndPixels === 0 && same.residualRatioRoundedToZero === false
      );
    })(),
  );
  check(
    "identical images produce no difference at all",
    (() => {
      const same = gatePixels(barSource, barSource);
      return same.aboveJndPixels === 0 && same.subpixelAboveJndPixels === 0;
    })(),
  );
}

// ---------------------------------------------------------------------------
// C. the correspondence trust gate
// ---------------------------------------------------------------------------

function testTrustGate(): void {
  section("C. correspondence — the trust-gate numerator (item C3.11)");

  // The audit's fixture: 100 content-keyed source leaves of which 30 match,
  // plus 200 unlabelled icons that pair STRUCTURALLY on a shared path suffix.
  const source: LeafBox[] = [];
  const clone: LeafBox[] = [];
  for (let i = 0; i < 100; i++) {
    source.push(leaf(`t:text-${i}`, 0));
    if (i < 30) clone.push(leaf(`t:text-${i}`, 400));
  }
  for (let i = 0; i < 200; i++) {
    source.push(leaf(`p:svg|body/div/section/span-${i % 20}/svg`, 0, 0));
    clone.push(leaf(`p:svg|body/wrap/wrap2/div/section/span-${i % 20}/svg`, 400, 0));
  }
  const result = correspond({ leaves: source, innerWidth: 1000 }, { leaves: clone });

  check(
    "the structural pass really does pair the unlabelled icons (otherwise this fixture proves nothing)",
    result.unlabelledMatchedPairs === 200,
    `unlabelledMatchedPairs=${result.unlabelledMatchedPairs}`,
  );
  check(
    "contentKeyedMatchedPairs counts passes 1+2 ONLY",
    result.contentKeyedMatchedPairs === 30,
    `contentKeyedMatchedPairs=${result.contentKeyedMatchedPairs}`,
  );
  check(
    "THE TRUST-GATE NUMERATOR: matchedFractionOfContentKeyed is content/content, not (content+structural)/content",
    near(result.matchedFractionOfContentKeyed, 0.3),
    `matchedFractionOfContentKeyed=${result.matchedFractionOfContentKeyed} (a cross-namespace numerator would report 230/100 capped to 1.00)`,
  );
  check(
    "…so `trustworthy` is FALSE at 30% against the 35% gate, where the old arithmetic reported 1.00 and true",
    result.trustworthy === false && 0.3 < MIN_TRUSTWORTHY_MATCH_FRACTION,
    `trustworthy=${result.trustworthy}`,
  );
  check(
    "the all-leaf matchedFraction is unchanged and still counts every pair (230/300, reported to 4 places)",
    result.matchedPairs === 230 && result.matchedFraction === 0.7667,
    `matchedPairs=${result.matchedPairs} matchedFraction=${result.matchedFraction}`,
  );

  // The cap case: every content leaf matches. The value must be exactly 1
  // because it IS 1, not because a `min` clipped it.
  const allSource: LeafBox[] = [];
  const allClone: LeafBox[] = [];
  for (let i = 0; i < 50; i++) {
    allSource.push(leaf(`t:same-${i}`, 0));
    allClone.push(leaf(`t:same-${i}`, 0));
  }
  for (let i = 0; i < 40; i++) {
    allSource.push(leaf(`p:svg|a/b/c-${i}/svg`, 0, 0));
    allClone.push(leaf(`p:svg|w/a/b/c-${i}/svg`, 0, 0));
  }
  const full = correspond({ leaves: allSource, innerWidth: 1000 }, { leaves: allClone });
  check(
    "a fully-matched page reports exactly 1.00 and cannot exceed it",
    full.matchedFractionOfContentKeyed === 1 &&
      full.contentKeyedMatchedPairs === full.contentKeyedSourceLeaves,
    `fraction=${full.matchedFractionOfContentKeyed} matched=${full.contentKeyedMatchedPairs}/${full.contentKeyedSourceLeaves}`,
  );
  check(
    "…and its structural pairs are still counted, just not in that numerator",
    full.unlabelledMatchedPairs === 40 && full.matchedPairs === 90,
    `unlabelled=${full.unlabelledMatchedPairs} matchedPairs=${full.matchedPairs}`,
  );
  check(
    "an empty source cannot divide by zero",
    correspond({ leaves: [], innerWidth: 1000 }, { leaves: allClone }).matchedFractionOfContentKeyed === 0,
  );
}

// ---------------------------------------------------------------------------
// D. missingText — the three arithmetic paths
// ---------------------------------------------------------------------------

function testMissingText(): void {
  section("D. missingText — occurrence counting, untruncated lengths, boundary matching (item C3.10)");

  // PATH (i). A 20-character string painted 40 times and dropped entirely.
  // The old numerator summed one distinct key (20 chars) against a denominator
  // that counted all 40 occurrences (800 chars) plus everything else.
  {
    const repeated = "Start building today"; // 20 chars
    const other = "x".repeat(200);
    const source = census([...Array<string>(40).fill(repeated), other]);
    const clone = census([other]);
    const result = missingText(source, clone);
    check(
      "PATH (i): a string painted 40 times and dropped counts all 40 occurrences",
      result.missingChars === 800 && result.missingOccurrences === 40,
      `missingChars=${result.missingChars} occurrences=${result.missingOccurrences} (the unique-key numerator reported 20)`,
    );
    check(
      "…so the ratio is 0.80, above the BLOCKER band, where the old arithmetic read 0.02 and never fired",
      near(result.missingRatio, 0.8) &&
        result.missingRatio >= MISSING_TEXT_BLOCKER_RATIO,
      `missingRatio=${result.missingRatio}`,
    );
    check(
      "…and the denominator is the same census as the numerator",
      result.sourceVisibleChars === 40 * 20 + 200 &&
        result.sourceOccurrences === 41,
      `sourceVisibleChars=${result.sourceVisibleChars} sourceOccurrences=${result.sourceOccurrences}`,
    );
  }

  // PATH (ii). A dropped 1,000-character paragraph must contribute 1,000, not
  // the 120-character truncated key.
  {
    const paragraph = "L".repeat(1000);
    // Deliberately UNDER the key limit, so exactly one key in this fixture is
    // truncated and the counter below is unambiguous.
    const other = "y".repeat(100);
    const source = census([paragraph, other]);
    const clone = census([other]);
    const result = missingText(source, clone);
    check(
      "PATH (ii): a dropped 1,000-character paragraph contributes 1,000 characters, not the 120-character key",
      result.missingChars === 1000,
      `missingChars=${result.missingChars} (TEXT_KEY_MAX_CHARS=${TEXT_KEY_MAX_CHARS})`,
    );
    check(
      "…and the key that was truncated is COUNTED, so a reader knows the match ran on a prefix",
      result.truncatedSourceKeys === 1,
      `truncatedSourceKeys=${result.truncatedSourceKeys}`,
    );
    check(
      "…giving a ratio of 1000/1100, not 120/1100",
      result.missingRatio === Math.round((1000 / 1100) * 10_000) / 10_000 &&
        result.sourceVisibleChars === 1100,
      `missingRatio=${result.missingRatio} sourceVisibleChars=${result.sourceVisibleChars}`,
    );
  }

  // PATH (iii). `indexOf` collision inside an unrelated word.
  {
    const source = census(["US", "Pricing", "Because our customers ship faster"]);
    const clone = census(["Pricing", "Because our customers ship faster"]);
    const result = missingText(source, clone);
    check(
      "PATH (iii): 'US' is NOT read as present because the clone contains 'customers'",
      result.missingStringCount === 1 && result.samples.indexOf("us") !== -1,
      `missingStringCount=${result.missingStringCount} samples=${JSON.stringify(result.samples)}`,
    );
    check(
      "…and it lands in the boundary-only population, counted apart from outright absence",
      result.boundaryOnlyChars === 2 &&
        result.boundaryOnlyStringCount === 1 &&
        result.absentChars === 0,
      `boundaryOnly=${result.boundaryOnlyChars}/${result.boundaryOnlyStringCount} absent=${result.absentChars}`,
    );
    check(
      "…so both readings are published: the strict ratio fires, the loose ratio is recorded",
      result.missingRatio > 0 && result.absentRatio === 0,
      `strict=${result.missingRatio} loose=${result.absentRatio}`,
    );
  }

  // Containment is still containment: a clone that renders a longer string
  // around the source's must not be reported as missing.
  {
    const source = census(["Start building", "US$10 per user/month"]);
    const clone = census(["Start building today", "buy now for US$10 per user/month!"]);
    const result = missingText(source, clone);
    check(
      "a clone that renders a LONGER string around the source's is not missing anything",
      result.missingChars === 0 && result.missingStringCount === 0,
      `missingChars=${result.missingChars} samples=${JSON.stringify(result.samples)}`,
    );
  }
  {
    const source = census(["US$10 per user/month"]);
    const clone = census(["$10 per user/month"]);
    const result = missingText(source, clone);
    check(
      "…but a clone that DROPS the currency prefix is missing the whole string",
      result.missingChars === 20 && result.absentChars === 20,
      `missingChars=${result.missingChars} absentChars=${result.absentChars}`,
    );
  }
  {
    const source = census(["$10 per user/month"]);
    const clone = census(["US$10 per user/month"]);
    const result = missingText(source, clone);
    check(
      "…and a candidate whose edge is NOT alphanumeric may still match inside a word ('$10' inside 'US$10')",
      result.missingChars === 0,
      `missingChars=${result.missingChars}`,
    );
  }
  {
    const source = census(["Alpha", "Beta", "Gamma"]);
    const clone = census([]);
    const result = missingText(source, clone);
    check(
      "an empty clone is missing EXACTLY the source's whole character count, ratio 1.00",
      result.missingChars === result.sourceVisibleChars && near(result.missingRatio, 1),
      `missingChars=${result.missingChars} sourceVisibleChars=${result.sourceVisibleChars} ratio=${result.missingRatio}`,
    );
    check(
      "…and missingChars can never exceed sourceVisibleChars, because they are one population",
      result.missingChars <= result.sourceVisibleChars &&
        result.absentChars <= result.missingChars,
    );
  }
  {
    const both = census(["Alpha"]);
    const result = missingText(both, both);
    check(
      "a side compared against itself is missing nothing",
      result.missingChars === 0 && result.missingRatio === 0,
      `missingChars=${result.missingChars}`,
    );
  }
  {
    const source = census([]);
    const result = missingText(source, census(["anything"]));
    check(
      "an empty source cannot divide by zero",
      result.missingRatio === 0 && result.sourceVisibleChars === 0,
    );
  }
}

// ---------------------------------------------------------------------------
// G2. missingText — the token-boundary rule is SCRIPT-AWARE (item G2)
// ---------------------------------------------------------------------------

/**
 * Four shapes taken from the pilot corpus (seoultone.kr, 73.3% hangul), each
 * one a case where Korean attaches a suffix with NO space — the exact edge
 * the English-only rule demanded a boundary at. `scriptRelaxedChars` is the
 * shipped code's own count of what the script-aware rule changed: it equals
 * `sourceVisibleChars` on every case here, i.e. the OLD rule would have
 * called the ENTIRE string a complete deletion, not a partial one.
 */
const KOREAN_BOUNDARY_CASES: { name: string; source: string; clone: string }[] = [
  { name: "agglutinated suffix (진료시간 / 진료시간안내)", source: "진료시간", clone: "진료시간안내" },
  { name: "particle (서울톤 / 서울톤은)", source: "서울톤", clone: "서울톤은" },
  { name: "compound-head (피부과 / 서울톤피부과)", source: "피부과", clone: "서울톤피부과" },
  { name: "verbaliser (예약 / 예약하기)", source: "예약", clone: "예약하기" },
];

function testKoreanBoundary(): void {
  section("G2. missingText — the token-boundary rule is script-aware (item G2)");

  for (const { name, source: sourceText, clone: cloneText } of KOREAN_BOUNDARY_CASES) {
    const source = census([sourceText]);
    const clone = census([cloneText]);
    const result = missingText(source, clone);
    check(
      `${name}: the shipped rule finds the source string PRESENT (0 missing)`,
      result.missingChars === 0 && result.missingRatio === 0,
      `missingChars=${result.missingChars} missingRatio=${result.missingRatio}`,
    );
    check(
      `${name}: MUTATION-PROOF — the English-only edge rule would have called this a COMPLETE deletion`,
      result.scriptRelaxedChars === result.sourceVisibleChars &&
        result.scriptRelaxedStringCount === 1,
      `scriptRelaxedChars=${result.scriptRelaxedChars} sourceVisibleChars=${result.sourceVisibleChars} scriptRelaxedStringCount=${result.scriptRelaxedStringCount}`,
    );
  }

  // The mechanism must not be a blanket "always match" — it is a SCRIPT test,
  // not a length test, so it must still fire the strict channel on a genuine
  // Korean deletion.
  {
    const source = census(["진료시간", "예약하기 가능합니다"]);
    const clone = census(["예약하기 가능합니다"]);
    const result = missingText(source, clone);
    check(
      "a genuinely DROPPED Korean string is still reported missing — this is not a blanket pass",
      result.missingChars === "진료시간".length && result.missingStringCount === 1,
      `missingChars=${result.missingChars} expected=${"진료시간".length}`,
    );
  }

  // The English control from the shipped docstring: relaxation must not fire
  // where a real word boundary exists, so the mechanism is script-conditioned
  // and not merely "any containing string counts".
  {
    const source = census(["start building"]);
    const clone = census(["start building today"]);
    const result = missingText(source, clone);
    check(
      "the English control is found present WITHOUT the script relaxation firing",
      result.missingChars === 0 && result.scriptRelaxedChars === 0,
      `missingChars=${result.missingChars} scriptRelaxedChars=${result.scriptRelaxedChars}`,
    );
  }
}

// ---------------------------------------------------------------------------
// G3. correspondence — parked-off-viewport content is a separate population
// ---------------------------------------------------------------------------

function testOffViewportSplit(): void {
  section("G3. correspondence — parked-off-viewport content is a separate population (item G3)");

  const innerWidth = 1000;
  const onViewportKeys = ["on0", "on1", "on2", "on3", "on4"];
  const offViewportKeys = ["off0", "off1", "off2"];

  const sourceLeaves: LeafBox[] = [
    ...onViewportKeys.map((key, i) => leaf(`t:${key}`, 100 + i * 50)),
    // Parked at/after the viewport's right edge — a carousel track's
    // non-active slides, exactly the shape measured on gs.severance.healthcare.
    ...offViewportKeys.map((key, i) => leaf(`t:${key}`, 6_100 + i * 100)),
  ];
  const cloneLeaves: LeafBox[] = [
    // On-viewport pairs land EXACTLY where the source put them: zero delta.
    ...onViewportKeys.map((key, i) => leaf(`t:${key}`, 100 + i * 50)),
    // The clone has no off-screen carousel track, so it renders these back
    // on screen — thousands of px from where the SOURCE parked them.
    ...offViewportKeys.map((key, i) => leaf(`t:${key}`, 540 + i * 50)),
  ];

  const correspondence = correspond(
    { leaves: sourceLeaves, innerWidth },
    { leaves: cloneLeaves },
  );

  check(
    "the off-viewport population is counted, never silently folded into the on-viewport one",
    correspondence.offViewportMatchedPairs === 3 && correspondence.onViewportMatchedPairs === 5,
    `offViewport=${correspondence.offViewportMatchedPairs} onViewport=${correspondence.onViewportMatchedPairs}`,
  );
  check(
    "THE FIX: the firing statistic reads the on-viewport population only — zero here",
    correspondence.positionDeltaP90 === 0,
    `positionDeltaP90=${correspondence.positionDeltaP90}`,
  );
  check(
    "…while the pre-G3 statistic over ALL pairs is still thousands of px — proof this is a real split, not a relabeling",
    correspondence.positionDeltaP90AllPairs >= 5_000,
    `positionDeltaP90AllPairs=${correspondence.positionDeltaP90AllPairs}`,
  );
  check(
    "the excluded population's own distribution is recorded, not dropped",
    correspondence.offViewportPositionDeltaP90 >= 5_000,
    `offViewportPositionDeltaP90=${correspondence.offViewportPositionDeltaP90}`,
  );
  check(
    "sourceInnerWidth travels with the correspondence, so the split threshold is legible",
    correspondence.sourceInnerWidth === innerWidth,
    `sourceInnerWidth=${correspondence.sourceInnerWidth}`,
  );

  // Wired all the way through to classification: real carousel-scale
  // off-viewport noise must not fire the position channel on its own.
  const source = sideFixture({ leaves: sourceLeaves, innerWidth });
  const clone = sideFixture({ leaves: cloneLeaves, innerWidth });
  const columns = compareColumns(source, clone);
  const missing = missingText(source, clone);
  const classification = classifyPair({
    source,
    clone,
    correspondence,
    columns,
    missing,
    pixels: { available: false, unavailableReason: "not decoded in this fixture" },
  });
  const positional = classification.channels.find(
    (channel) => channel.channel === "position-delta-p90-px",
  );
  check(
    "MUTATION-PROVEN: the shipped channel carries the on-viewport value (0), not the all-pairs value (5000+px)",
    positional !== undefined && positional.value === 0 && positional.firedAt === null,
    `value=${positional?.value} firedAt=${positional?.firedAt}`,
  );
  const offViewportP90Channel = classification.channels.find(
    (channel) => channel.channel === "position-delta-offviewport-p90-px",
  );
  const offViewportPairsChannel = classification.channels.find(
    (channel) => channel.channel === "position-delta-offviewport-pairs",
  );
  check(
    "the excluded population reaches the classified artifact as its own named channels",
    offViewportP90Channel !== undefined &&
      offViewportP90Channel.value >= 5_000 &&
      offViewportPairsChannel !== undefined &&
      offViewportPairsChannel.value === 3,
    `offViewport p90=${offViewportP90Channel?.value} pairs=${offViewportPairsChannel?.value}`,
  );
}

// ---------------------------------------------------------------------------
// E. the capture scroll floor
// ---------------------------------------------------------------------------

/**
 * Task 28.6 W8 RC2 — the OBSERVER and the INSTRUMENT must agree on reveal state.
 *
 * The responsive-QA capture scrolls both sides to the bottom before it probes,
 * unconditionally. The observer used to default to NOT scrolling. So the clone
 * was built from a pre-reveal instant and graded against a revealed source, and
 * every entrance animation holding its element at `opacity: 0` until it scrolls
 * into view was baked into the clone as a permanent `opacity: 0`.
 *
 * MEASURED on www.xn--ok0b408a79cba430b.net, node `e000222` on `p000005`:
 * identical 124x22 box, opacity 1 with the scroll and 0 without; 136 of 6,144
 * shared nodes flip; baked `opacity: 0` classes 23 -> 38.
 *
 * This is asserted on SOURCE TEXT because it is a cross-module invariant that no
 * single unit test can see: a green observer suite and a green QA suite can both
 * pass while the two disagree with each other. That is the fake-coverage failure
 * class this task exists to eliminate.
 */
function testRevealPolicyAgreement(): void {
  section("Reveal-policy agreement between the observer and the QA instrument");
  const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
  const observer = readFileSync(path.join(repoRoot, "src/observer/observe-page.ts"), "utf8");
  const capture = readFileSync(path.join(repoRoot, "src/responsive-qa/capture.ts"), "utf8");

  const observerDefault = /const prepareScroll = options\.prepareScroll \?\? (true|false);/.exec(observer);
  check(
    "the observer's prepareScroll default is stated exactly once and is readable",
    observerDefault !== null,
    observerDefault ? `?? ${observerDefault[1]}` : "no `options.prepareScroll ?? …` found",
  );
  check(
    "…and it is TRUE, so the observer sees the page in its revealed state",
    observerDefault?.[1] === "true",
    `observe-page.ts defaults prepareScroll to ${observerDefault?.[1]}`,
  );

  // The instrument's scroll is not behind a flag: `scrollThroughPage` is called
  // with no condition guarding it. If that ever becomes conditional, the
  // agreement asserted here stops being an agreement.
  const capturesScroll = /\n\s*const scroll = await scrollThroughPage\(page\);/.test(capture);
  check(
    "the QA capture still scrolls unconditionally before probing",
    capturesScroll,
    capturesScroll ? "capture.ts calls scrollThroughPage(page) unguarded" : "scrollThroughPage call not found unguarded",
  );
  check(
    "…so the two sides of every graded pair are built and measured under the SAME reveal policy",
    observerDefault?.[1] === "true" && capturesScroll,
    "observer prepareScroll default === true AND capture scrolls unconditionally",
  );

  // The opt-out has to survive, or an operator investigating defect B4 (a
  // re-hide animation left blank by a scroll that returns to the top) has no way
  // to capture the other instant.
  const optOut = ["src/cli-observe.ts", "src/cli-observe-site.ts", "src/cli-e2e-reconstruct.ts"]
    .filter((f) => readFileSync(path.join(repoRoot, f), "utf8").includes("--no-prepare-scroll"));
  check(
    "every observe CLI still offers --no-prepare-scroll, so the other instant stays capturable",
    optOut.length === 3,
    `${optOut.length} of 3 CLIs expose the opt-out`,
  );
}

async function testScrollFloor(browser: Browser): Promise<void> {
  section("E. capture — the scroll floor (item C3.13)");
  const fixtures = await serveFixtures({ "/short": SHORT_HTML, "/tall": TALL_HTML });
  try {
    const short = (
      await captureSide({
        browser,
        url: `${fixtures.origin}/short`,
        width: 1000,
        screenshotFile: "short.png",
      })
    ).provenance.scroll;
    const tall = (
      await captureSide({
        browser,
        url: `${fixtures.origin}/tall`,
        width: 1000,
        screenshotFile: "tall.png",
      })
    ).provenance.scroll;

    check(
      "a document shorter than the viewport is reported as NOT scrollable",
      short.documentScrollable === false &&
        short.scrollHeightBefore <= short.viewportHeight + 1,
      `scrollable=${short.documentScrollable} scrollHeight=${short.scrollHeightBefore} viewport=${short.viewportHeight}`,
    );
    check(
      "THE FLOOR: it does NOT claim to have reached the bottom by scrolling",
      short.reachedBottom === false && short.scrolledToPx === 0,
      `reachedBottom=${short.reachedBottom} scrolledToPx=${short.scrolledToPx}`,
    );
    check(
      "…and it is not reported as capped either — nothing was cut short",
      short.stepsCapped === false,
      `stepsCapped=${short.stepsCapped}`,
    );
    check(
      "a genuinely tall document IS scrollable, reaches its bottom, and says how deep it went",
      tall.documentScrollable === true &&
        tall.reachedBottom === true &&
        tall.scrolledToPx > tall.viewportHeight,
      `scrollable=${tall.documentScrollable} reachedBottom=${tall.reachedBottom} scrolledToPx=${tall.scrolledToPx}`,
    );
    check(
      "…and it is not capped, because it got there inside the step budget",
      tall.stepsCapped === false && tall.applied === true,
      `stepsCapped=${tall.stepsCapped} applied=${tall.applied}`,
    );
    check(
      "the two cases are distinguishable from the artifact alone: (scrollable, reachedBottom) differs",
      short.documentScrollable !== tall.documentScrollable &&
        short.reachedBottom !== tall.reachedBottom,
    );
  } finally {
    await fixtures.close();
  }
}

// ---------------------------------------------------------------------------
// F. the rubric roster
// ---------------------------------------------------------------------------

function sideFixture(overrides: Partial<SideMeasurement> = {}): SideMeasurement {
  const landmark = {
    elementCount: 1,
    visibleLinkCount: 4,
    visibleTextChars: 40,
    maxRight: 900,
    maxRightIncludingWide: 900,
    fullyInsideViewport: true,
    wideElementsExcluded: 0,
    widestExcludedWidth: 0,
  };
  const containers: ColumnContainer[] = [];
  return {
    totalNodes: 500,
    visibleNodes: 400,
    displayNoneNodes: 10,
    // Task 28.6 Wave 6 G1 — the opacity census. A clone that bakes a
    // scroll-reveal pre-reveal state paints nothing where the source paints
    // text, and the TEXT census used to miss it entirely.
    zeroOpacityNodes: 0,
    opacityHiddenNodes: 0,
    opacityHiddenByAncestorNodes: 0,
    opacityHiddenTextNodes: 0,
    opacityHiddenTextChars: 0,
    visibleTextChars: 1000,
    visibleTextEntries: census(["alpha", "beta"]).visibleTextEntries,
    shadowRootsTraversed: 0,
    shadowTextNodes: 0,
    shadowTextChars: 0,
    scrollWidth: 1000,
    innerWidth: 1000,
    innerHeight: 900,
    horizontalOverflow: 0,
    scrollHeight: 3000,
    overflowingNodes: 0,
    overflowingTextChars: 0,
    offscreenNodes: 0,
    offscreenTextChars: 0,
    leaves: [],
    leavesTruncated: false,
    textLeafCount: 20,
    imageLeafCount: 5,
    // Task 28.75. A fixture with no regions at all is the honest default for
    // every section that is not about regions: the blank-region channel then
    // has nothing to compare and records zero, exactly as it must on a page
    // whose census selected nothing.
    regions: [],
    regionAccounting: {
      examined: 500,
      selected: 0,
      rejected: 500,
      rejectedByReason: [{ reason: "too-small", count: 500 }],
      truncated: false,
    },
    overlapArea: 0,
    overlapAreaRatio: 0,
    overlapPairCount: 0,
    worstOverlaps: [],
    overlapComparisonsTruncated: false,
    // WP-C guard 3. The overlap total is split three ways and the parts sum
    // back to it. A fixture that leaves the parts at zero is a page with no
    // overlap at all, which is what every pre-existing section here assumes.
    trueOverlapArea: 0,
    trueOverlapAreaRatio: 0,
    trueOverlapPairCount: 0,
    duplicateImageStackArea: 0,
    duplicateImageStackAreaRatio: 0,
    duplicateImageStackPairCount: 0,
    failedImageLayerOverlapArea: 0,
    failedImageLayerOverlapAreaRatio: 0,
    failedImageLayerOverlapPairCount: 0,
    loadedImageLeafCount: 5,
    failedImageLeafCount: 0,
    contentMaxRight: 990,
    contentMaxRightIncludingWide: 990,
    wideLeavesExcluded: 0,
    widestExcludedLeafWidth: 0,
    contentMinLeft: 10,
    rightGutter: 10,
    rightGutterRatio: 0.01,
    largestEmptyBand: 40,
    largestEmptyBandRatio: 0.013,
    largestEmptyBandTop: 100,
    header: { ...landmark },
    footer: { ...landmark },
    columnContainers: containers,
    maxColumns: 3,
    logoRows: [],
    videoCount: 0,
    videosPinned: 0,
    ...overrides,
  };
}

function testRubricRoster(): void {
  section("F. rubric — the channel roster it actually emits (item C3.13)");
  const source = sideFixture();
  const clone = sideFixture();
  const correspondence = correspond({ leaves: [], innerWidth: 1000 }, { leaves: [] });
  const columns = compareColumns(source, clone);
  const missing = missingText(source, clone);
  const gate = gatePixels(
    image(40, 40, [255, 255, 255], (set) => {
      for (let x = 5; x < 35; x++) set(x, 20, 0, 0, 0);
    }),
    image(40, 40, [255, 255, 255]),
  );
  const classification = classifyPair({
    source,
    clone,
    correspondence,
    columns,
    missing,
    missingReverse: missingText(clone, source),
    pixels: {
      available: true,
      gate,
      sourceWidth: 40,
      sourceHeight: 40,
      cloneWidth: 40,
      cloneHeight: 40,
      overlapPixels: 1600,
      changedPixelRatio: 0.01,
      changedRatioAt16: 0.01,
      deltaE76Mean: 1,
      deltaE76Max: 100,
      deltaE76AboveJndRatio: gate.residualAboveJndRatio,
      deltaE76AboveVisibleRatio: 0.001,
      commonAreaRatio: 1,
    },
    sourceScroll: {
      applied: true,
      steps: 5,
      scrolledToPx: 2000,
      reachedBottom: true,
      documentScrollable: true,
      viewportHeight: 900,
      stepsCapped: false,
      waitedMs: 100,
      scrollHeightBefore: 3000,
      scrollHeightAfter: 3000,
      visibleElementsBefore: 400,
      visibleElementsAfter: 400,
      elementsRevealed: 0,
      visibleTextCharsBefore: 1000,
      visibleTextCharsAfter: 1000,
      textCharsRevealed: 0,
      imagesLoadedBefore: 0,
      imagesLoadedAfter: 0,
      imagesRevealed: 0,
    },
    cloneScroll: {
      applied: true,
      steps: 3,
      scrolledToPx: 1000,
      reachedBottom: true,
      documentScrollable: true,
      viewportHeight: 900,
      stepsCapped: false,
      waitedMs: 100,
      scrollHeightBefore: 3000,
      scrollHeightAfter: 3000,
      visibleElementsBefore: 400,
      visibleElementsAfter: 400,
      elementsRevealed: 0,
      visibleTextCharsBefore: 1000,
      visibleTextCharsAfter: 1000,
      textCharsRevealed: 0,
      imagesLoadedBefore: 0,
      imagesLoadedAfter: 0,
      imagesRevealed: 0,
    },
  });

  const names = classification.channels.map((channel) => channel.channel);
  check(
    "every channel name is unique, so a roster is a set and can be compared between runs",
    new Set(names).size === names.length,
    `${names.length} channels, ${new Set(names).size} distinct`,
  );
  for (const required of [
    "missing-text-ratio",
    "missing-text-absent-ratio",
    "missing-text-boundary-only-chars",
    "matched-fraction-content-keyed",
    "pixel-residual-difference-ratio",
    "pixel-residual-ink-ratio",
    "pixel-source-ink-ratio",
    "scroll-depth-ratio",
    "shadow-text-chars",
    // WP-C. Every guard that can remove a finding has a channel a reader can
    // find it on; a guard whose only trace is a smaller number is not auditable.
    "clone-route-missing",
    "duplicate-image-stack",
    "duplicate-image-stack-area-ratio",
    "image-layer-state",
    "overlap-excess-ratio-undemoted",
    // TASK 28.75. Item L1 gives the area guard 3 demotes a channel of its own,
    // so the demotion is falsifiable against the source; item L3 gives the
    // region the pixel min-crop removes a channel of its own, so it can never
    // be dropped in silence again.
    "overlap-demoted-excess-ratio",
    "pixel-uncompared-band-ink-ratio",
    "pixel-uncompared-vertical-band-ink-ratio",
    "pixel-compared-area-ratio",
    // TASK 28.8 FAST item 2. Text over text inside a compact critical block, counted
    // as ROWS: `overlap-excess-ratio` divides area by a page height and cannot
    // reach it.
    "critical-text-collision-rows",
    "critical-text-collision-regions",
  ]) {
    check(`the roster carries ${required}`, names.indexOf(required) !== -1);
  }
  check(
    "the scroll-depth channel reports the RATIO of the two depths, not one side's",
    (() => {
      const reading = classification.channels.find(
        (channel) => channel.channel === "scroll-depth-ratio",
      );
      return reading !== undefined && near(reading.value, 0.5) && reading.sourceValue === 2000;
    })(),
  );
  check(
    "every channel carries a note, so no reading arrives without its units",
    classification.channels.every((channel) => channel.note.length > 0),
  );
  check(
    // TASK 28.8 FAST: was pinned to 6. Bumped because this wave both CHANGED a
    // verdict rule (blank-region-ratio caps at MINOR without corroboration) and
    // ADDED channels, so a rubric-6 floor must not be read as a rubric-7 one.
    "RUBRIC_VERSION is stated in code and is what an artifact will carry",
    RUBRIC_VERSION === 8,
    `RUBRIC_VERSION=${RUBRIC_VERSION}`,
  );

  // The trust gate must SUPPRESS, never invent. A large positional delta on an
  // untrustworthy correspondence records the channel and raises no finding.
  const untrusted = correspond(
    { leaves: [leaf("t:a", 0), leaf("t:b", 0), leaf("t:c", 0)], innerWidth: 1000 },
    { leaves: [leaf("t:a", 900)] },
  );
  const guarded = classifyPair({
    source,
    clone,
    correspondence: untrusted,
    columns,
    missing,
    pixels: { available: false, unavailableReason: "not decoded in this fixture" },
  });
  const positional = guarded.channels.find(
    (channel) => channel.channel === "position-delta-p90-px",
  );
  check(
    "an untrustworthy correspondence RECORDS the position channel",
    positional !== undefined && positional.value === 900,
    `value=${positional?.value}`,
  );
  check(
    "…and refuses to raise severity from it, saying why in a caveat",
    untrusted.trustworthy === false &&
      positional?.firedAt === null &&
      guarded.caveats.some((caveat) => caveat.indexOf("content-keyed") !== -1),
    `firedAt=${positional?.firedAt} caveats=${guarded.caveats.length}`,
  );
}

// ---------------------------------------------------------------------------
// G4a. the grading floor — comparability is CHECKED, never assumed (item G4)
// ---------------------------------------------------------------------------

/** Only the fields {@link floorFrom} and {@link readFloorArtifact} actually
 *  read. Cast at the call site — building the real ~30-field run artifact for
 *  a pure comparability test would be noise, not signal. */
function floorArtifactFixture(
  overrides: Record<string, unknown> = {},
): ResponsiveQaRunArtifact {
  return {
    mode: "self-check",
    site: "example.com",
    rubricVersion: RUBRIC_VERSION,
    channelRoster: ["missing-text-ratio", "position-delta-p90-px"],
    widths: [1000],
    routes: ["/", "/pricing"],
    runId: "2026-01-01T00-00-00-000Z",
    summary: {
      pairsMeasured: 2,
      pairsFailed: 0,
      blockerPairs: 0,
      majorPairs: 0,
      minorPairs: 1,
      passPairs: 1,
      verdictByRouteWidth: [
        { route: "/", width: 1000, verdict: "PASS" },
        { route: "/pricing", width: 1000, verdict: "MINOR" },
      ],
    },
    ...overrides,
  } as ResponsiveQaRunArtifact;
}

function testSelfCheckFloorLogic(): void {
  section("G4a. the grading floor — comparability is checked, never assumed (item G4)");

  const self = {
    site: "example.com",
    rubricVersion: RUBRIC_VERSION,
    channelRoster: ["missing-text-ratio", "position-delta-p90-px"],
    widths: [1000],
    routes: ["/", "/pricing"],
  };

  const comparable = floorFrom(floorArtifactFixture(), "/f/floor.json", "/f", "measured", self);
  check(
    "a floor whose site/rubric/roster/widths/routes all match is comparable, with no reasons",
    comparable.comparable === true && comparable.incomparableReasons.length === 0,
    `comparable=${comparable.comparable} reasons=${JSON.stringify(comparable.incomparableReasons)}`,
  );
  check(
    "…and the floor's own verdict table and summary are carried through untouched",
    comparable.verdictByRouteWidth?.length === 2 &&
      comparable.verdictByRouteWidth?.[1]?.verdict === "MINOR" &&
      comparable.summary?.passPairs === 1,
    `rows=${JSON.stringify(comparable.verdictByRouteWidth)}`,
  );
  check(
    "…and the statement states the floor's own PASS/MINOR/MAJOR/BLOCKER count in words",
    comparable.statement.indexOf("1 PASS") !== -1 && comparable.statement.indexOf("1 MINOR") !== -1,
    comparable.statement,
  );

  const wrongMode = floorFrom(floorArtifactFixture({ mode: "clone" }), "f", "d", "referenced", self);
  check(
    "MUTATION 1: a referenced run that is not itself a self-check is flagged, not trusted",
    wrongMode.comparable === false &&
      wrongMode.incomparableReasons.some((reason) => reason.indexOf('not "self-check"') !== -1),
    JSON.stringify(wrongMode.incomparableReasons),
  );

  const wrongSite = floorFrom(floorArtifactFixture(), "f", "d", "referenced", {
    ...self,
    site: "other.com",
  });
  check(
    "MUTATION 2: a floor measured against a DIFFERENT site is flagged",
    wrongSite.comparable === false &&
      wrongSite.incomparableReasons.some((reason) => reason.indexOf("site") !== -1),
    JSON.stringify(wrongSite.incomparableReasons),
  );

  const wrongRubric = floorFrom(floorArtifactFixture(), "f", "d", "referenced", {
    ...self,
    rubricVersion: RUBRIC_VERSION + 1,
  });
  check(
    "MUTATION 3: a floor graded by a DIFFERENT rubricVersion is flagged — verdicts from different rubrics don't compare",
    wrongRubric.comparable === false &&
      wrongRubric.incomparableReasons.some((reason) => reason.indexOf("rubricVersion") !== -1),
    JSON.stringify(wrongRubric.incomparableReasons),
  );

  const wrongRoster = floorFrom(floorArtifactFixture(), "f", "d", "referenced", {
    ...self,
    channelRoster: ["missing-text-ratio"],
  });
  check(
    "MUTATION 4: a floor whose channel roster differs (an older/newer instrument) is flagged",
    wrongRoster.comparable === false &&
      wrongRoster.incomparableReasons.some((reason) => reason.indexOf("channelRoster") !== -1),
    JSON.stringify(wrongRoster.incomparableReasons),
  );

  const wrongWidths = floorFrom(floorArtifactFixture(), "f", "d", "referenced", {
    ...self,
    widths: [1000, 1440],
  });
  check(
    "MUTATION 5: a floor measured at DIFFERENT widths is flagged",
    wrongWidths.comparable === false &&
      wrongWidths.incomparableReasons.some((reason) => reason.indexOf("widths") !== -1),
    JSON.stringify(wrongWidths.incomparableReasons),
  );

  const wrongRoutes = floorFrom(floorArtifactFixture(), "f", "d", "referenced", {
    ...self,
    routes: ["/"],
  });
  check(
    "MUTATION 6: a floor measured over DIFFERENT routes is flagged",
    wrongRoutes.comparable === false &&
      wrongRoutes.incomparableReasons.some((reason) => reason.indexOf("routes") !== -1),
    JSON.stringify(wrongRoutes.incomparableReasons),
  );

  const allWrong = floorFrom(
    floorArtifactFixture({
      mode: "clone",
      site: "other.com",
      rubricVersion: 1,
      channelRoster: ["x"],
      widths: [700],
      routes: ["/only"],
    }),
    "f",
    "d",
    "referenced",
    self,
  );
  check(
    "ALL SIX checked independently: every mismatch is named at once, none shadows another",
    allWrong.incomparableReasons.length === 6,
    `${allWrong.incomparableReasons.length} reasons: ${JSON.stringify(allWrong.incomparableReasons)}`,
  );
  check(
    "…and the statement says NOT COMPARABLE rather than silently handing back a floor",
    allWrong.statement.indexOf("NOT COMPARABLE") !== -1,
    allWrong.statement,
  );

  const absent = absentFloor();
  check(
    "NO FLOOR AT ALL: status is 'absent', every dependent field is null — never a fabricated zero",
    absent.status === "absent" &&
      absent.runId === null &&
      absent.summary === null &&
      absent.verdictByRouteWidth === null &&
      absent.comparable === null,
    JSON.stringify(absent),
  );
  check(
    "…and it says so LOUDLY: the statement names both ways to supply one",
    absent.statement.indexOf("NO GRADING FLOOR") !== -1 &&
      absent.statement.indexOf("--with-self-check") !== -1 &&
      absent.statement.indexOf("--self-check-run") !== -1,
    absent.statement,
  );

  const isFloor = selfIsTheFloor();
  check(
    "A SELF-CHECK RUN IS ITS OWN FLOOR: no floor above it, said explicitly",
    isFloor.status === "is-the-floor" &&
      isFloor.statement.indexOf("THIS RUN IS THE FLOOR") !== -1,
    isFloor.statement,
  );
}

// ---------------------------------------------------------------------------
// G4b. resolving a referenced self-check run (item G4)
// ---------------------------------------------------------------------------

async function testReadFloorArtifact(): Promise<void> {
  section("G4b. resolving a referenced self-check run: three ways in, one way to fail (item G4)");

  const tmpDir = await mkdtemp(path.join(os.tmpdir(), "responsive-qa-floor-"));
  const fakeHost = "qa-fixture-floor.invalid";
  const rootUrl = `http://${fakeHost}/`;
  const runId = "2026-01-01T00-00-00-000Z";
  const dataRunDir = path.resolve(responsiveRunDir(rootUrl, runId));
  try {
    const artifactBody = JSON.stringify({
      mode: "self-check",
      site: fakeHost,
      rubricVersion: RUBRIC_VERSION,
      channelRoster: [],
      runId,
      summary: {
        pairsMeasured: 0,
        pairsFailed: 0,
        blockerPairs: 0,
        majorPairs: 0,
        minorPairs: 0,
        passPairs: 0,
        verdictByRouteWidth: [],
      },
    });

    // (a) an explicit path ending in .json is read directly.
    const explicitFile = path.join(tmpDir, "explicit", RUN_ARTIFACT_FILE);
    await mkdir(path.dirname(explicitFile), { recursive: true });
    await writeFile(explicitFile, artifactBody, "utf8");
    const byFile = await readFloorArtifact(explicitFile, fakeHost, rootUrl);
    check(
      "(a) an explicit path ending in .json is read directly",
      byFile.file === explicitFile && byFile.artifact.runId === runId,
      `file=${byFile.file}`,
    );

    // (b) an explicit directory has RUN_ARTIFACT_FILE appended.
    const explicitDir = path.join(tmpDir, "explicit-dir");
    await mkdir(explicitDir, { recursive: true });
    await writeFile(path.join(explicitDir, RUN_ARTIFACT_FILE), artifactBody, "utf8");
    const byDir = await readFloorArtifact(explicitDir, fakeHost, rootUrl);
    check(
      "(b) an explicit directory has RUN_ARTIFACT_FILE appended",
      byDir.file === path.join(explicitDir, RUN_ARTIFACT_FILE),
      `file=${byDir.file}`,
    );

    // (c) a bare run id resolves under THIS SITE'S OWN run directory — the
    // same relative path a real run would have written it to. `dir` is
    // compared RESOLVED because this candidate is built from the un-resolved
    // `responsiveRunDir()` path (relative to cwd), unlike (a)/(b) above whose
    // candidate is `path.resolve`d first — both are the same location.
    await mkdir(dataRunDir, { recursive: true });
    await writeFile(path.join(dataRunDir, RUN_ARTIFACT_FILE), artifactBody, "utf8");
    const byRunId = await readFloorArtifact(runId, fakeHost, rootUrl);
    check(
      "(c) a bare run id resolves inside data/<site>/responsive-qa/<run-id>/, no path typing required",
      byRunId.artifact.runId === runId && path.resolve(byRunId.dir) === dataRunDir,
      `dir=${byRunId.dir} resolved=${path.resolve(byRunId.dir)} expected=${dataRunDir}`,
    );

    // (d) nothing there at all: every candidate tried is NAMED in the error.
    let threw: unknown = null;
    try {
      await readFloorArtifact("no-such-run-id-at-all", fakeHost, rootUrl);
    } catch (err) {
      threw = err;
    }
    check(
      "(d) a run id that resolves to nothing THROWS and names every candidate it tried",
      threw instanceof ResponsiveQaInputError &&
        threw.message.indexOf("no-such-run-id-at-all") !== -1 &&
        threw.message.indexOf(RUN_ARTIFACT_FILE) !== -1,
      threw instanceof Error ? threw.message : String(threw),
    );
  } finally {
    await rm(tmpDir, { recursive: true, force: true }).catch(() => {});
    await rm(path.resolve("data", fakeHost), { recursive: true, force: true }).catch(() => {});
  }
}

// ---------------------------------------------------------------------------
// G4c. the CLI flags that supply a floor are real, parsed flags (item G4)
// ---------------------------------------------------------------------------

function testCliFlagParsing(): void {
  section("G4c. CLI — --with-self-check and --self-check-run are real flags now (item G4)");

  const withFloor = parseArgs(["manifest.json", "--with-self-check"]);
  check(
    "--with-self-check is parsed",
    withFloor.withSelfCheck === true && withFloor.selfCheckRunFile === undefined,
    JSON.stringify(withFloor),
  );

  const referenced = parseArgs(["manifest.json", "--self-check-run", "2026-01-01T00-00-00-000Z"]);
  check(
    "--self-check-run <value> is parsed",
    referenced.selfCheckRunFile === "2026-01-01T00-00-00-000Z" &&
      referenced.withSelfCheck === undefined,
    JSON.stringify(referenced),
  );

  const referencedEquals = parseArgs(["manifest.json", "--self-check-run=/abs/path/responsive-qa.json"]);
  check(
    "--self-check-run=<value> (equals form) is parsed the same way",
    referencedEquals.selfCheckRunFile === "/abs/path/responsive-qa.json",
    JSON.stringify(referencedEquals),
  );

  let missingValueThrew = false;
  try {
    parseArgs(["manifest.json", "--self-check-run"]);
  } catch {
    missingValueThrew = true;
  }
  check(
    "--self-check-run with no value is rejected, not silently ignored",
    missingValueThrew,
  );

  const neither = parseArgs(["manifest.json"]);
  check(
    "by default NEITHER flag is set — the absent-floor path is the default, not an opt-in surprise",
    neither.withSelfCheck === undefined && neither.selfCheckRunFile === undefined,
    JSON.stringify(neither),
  );
}


// ---------------------------------------------------------------------------
// WP-C. the four honesty guards
//
// Every guard below can REMOVE a finding, which is a direction of error a
// measuring instrument has to be able to prove it did not take by accident.
// So each section here has two halves: the case the guard is for, and the
// NEGATIVE CONTROL — the same fixture, one field different, where the finding
// must still fire. A guard is only honest if you can watch it decline to act.
// ---------------------------------------------------------------------------

/** Everything `classifyPair` needs, from two side fixtures. Pixels are left
 *  unavailable: none of the WP-C guards reads them and a decoded PNG per case
 *  would be noise. */
function classifyFixture(overrides: {
  source?: Partial<SideMeasurement>;
  clone?: Partial<SideMeasurement>;
  sourceHttpStatus?: number | null;
  cloneHttpStatus?: number | null;
  cloneRouteBuilt?: boolean;
} = {}): Classification {
  const source = sideFixture(overrides.source ?? {});
  const clone = sideFixture(overrides.clone ?? {});
  return classifyPair({
    source,
    clone,
    correspondence: correspond(
      { leaves: source.leaves, innerWidth: source.innerWidth },
      { leaves: clone.leaves },
    ),
    columns: compareColumns(source, clone),
    missing: missingText(source, clone),
    missingReverse: missingText(clone, source),
    pixels: { available: false, unavailableReason: "not decoded in this fixture" },
    ...(overrides.sourceHttpStatus !== undefined
      ? { sourceHttpStatus: overrides.sourceHttpStatus }
      : {}),
    ...(overrides.cloneHttpStatus !== undefined
      ? { cloneHttpStatus: overrides.cloneHttpStatus }
      : {}),
    ...(overrides.cloneRouteBuilt !== undefined
      ? { cloneRouteBuilt: overrides.cloneRouteBuilt }
      : {}),
  });
}

/**
 * What a clone server's 404 page measures like: no copy, no imagery, no nav, a
 * short document. Every one of those is an independent BLOCKER channel, which
 * is exactly the inflation guard 1 exists to stop.
 */
const ERROR_PAGE: Partial<SideMeasurement> = {
  visibleTextChars: 14,
  visibleTextEntries: census(["404 not found"]).visibleTextEntries,
  textLeafCount: 1,
  imageLeafCount: 0,
  loadedImageLeafCount: 0,
  maxColumns: 0,
  scrollHeight: 200,
  contentMaxRight: 200,
  rightGutter: 800,
  rightGutterRatio: 0.8,
  header: {
    elementCount: 0,
    visibleLinkCount: 0,
    visibleTextChars: 0,
    maxRight: 0,
    maxRightIncludingWide: 0,
    fullyInsideViewport: true,
    wideElementsExcluded: 0,
    widestExcludedWidth: 0,
  },
};

function testCloneRouteMissingGuard(): void {
  section("WP-C1. guard 1 — a clone route that does not exist is ONE finding");

  // NEGATIVE CONTROL FIRST, because it is also the proof that this fixture
  // reproduces the defect. Identical measurements, clone HTTP 200: the rubric
  // grades the error document as though it were a reconstruction of the page
  // and manufactures a column of independent-looking content BLOCKERS. This is
  // byte-for-byte what the pre-guard classifier did with a 404 clone, because
  // before WP-C the classifier never referenced httpStatus at all.
  const served = classifyFixture({
    clone: ERROR_PAGE,
    sourceHttpStatus: 200,
    cloneHttpStatus: 200,
  });
  const servedChannels = served.findings.map((finding) => finding.channel).sort();
  check(
    "NEGATIVE CONTROL: source 200 + clone 200 grades the content normally and fires many channels",
    served.verdict === "BLOCKER" && served.findings.length >= 4,
    `${served.findings.length} finding(s): ${servedChannels.join(", ")}`,
  );
  check(
    "…including the independent content channels a missing route would otherwise manufacture",
    ["missing-text-ratio", "nav-link-ratio", "visible-text-ratio"].every(
      (channel) => servedChannels.indexOf(channel) !== -1,
    ),
    servedChannels.join(", "),
  );
  check(
    "…and clone-route-missing does NOT fire when the clone served the page",
    served.findings.every((finding) => finding.channel !== "clone-route-missing"),
  );

  // THE GUARD. One field different: the clone answered 404.
  const missing = classifyFixture({
    clone: ERROR_PAGE,
    sourceHttpStatus: 200,
    cloneHttpStatus: 404,
  });
  check(
    "source 200 + clone 404 produces EXACTLY ONE finding",
    missing.findings.length === 1,
    `${missing.findings.length} finding(s): ${missing.findings.map((f) => f.channel).join(", ")}`,
  );
  check(
    "…and it is clone-route-missing, at BLOCKER",
    missing.findings[0]?.channel === "clone-route-missing" &&
      missing.findings[0]?.severity === "BLOCKER" &&
      missing.verdict === "BLOCKER",
    `${missing.findings[0]?.channel} / ${missing.findings[0]?.severity} / verdict ${missing.verdict}`,
  );
  check(
    "…so ONE missing route no longer produces simultaneous text, nav, image and layout blockers",
    missing.blockerCount === 1 && missing.majorCount === 0 && missing.minorCount === 0,
    `B${missing.blockerCount}/M${missing.majorCount}/m${missing.minorCount}`,
  );

  // The record must not contradict the verdict: every other channel is still
  // THERE, still carries its measured value, and says why it could not fire.
  const others = missing.channels.filter(
    (channel) => channel.channel !== "clone-route-missing",
  );
  check(
    "every other channel is still present in channels[] — nothing is deleted",
    others.length === served.channels.length - 1 && others.length > 20,
    `${others.length} other channel(s) recorded`,
  );
  check(
    "…every one of them has firedAt: null",
    others.every((channel) => channel.firedAt === null),
    others
      .filter((channel) => channel.firedAt !== null)
      .map((channel) => channel.channel)
      .join(", "),
  );
  check(
    "…every one of them states an ineligible reason, so a reader is never left to guess",
    others.every(
      (channel) =>
        typeof channel.ineligibleReason === "string" &&
        channel.ineligibleReason.length > 0,
    ),
    others.filter((channel) => !channel.ineligibleReason).map((c) => c.channel).join(", "),
  );
  check(
    "…and every one of them still carries its MEASURED value: suppression is not blindness",
    (() => {
      const missingText = others.find((c) => c.channel === "missing-text-ratio");
      const nav = others.find((c) => c.channel === "nav-link-ratio");
      const servedMissingText = served.channels.find(
        (c) => c.channel === "missing-text-ratio",
      );
      return (
        missingText !== undefined &&
        nav !== undefined &&
        missingText.value === servedMissingText?.value &&
        nav.value === 0
      );
    })(),
    JSON.stringify(others.find((c) => c.channel === "missing-text-ratio")),
  );
  check(
    "…and no suppressed channel reports a threshold, which would read as 'measured and cleared'",
    others.every((channel) => channel.threshold === null),
  );

  // The gate is deliberately narrow in two directions, and both are asserted
  // rather than described.
  const redirected = classifyFixture({
    clone: ERROR_PAGE,
    sourceHttpStatus: 200,
    cloneHttpStatus: 301,
  });
  check(
    "a 3xx clone is a redirect Playwright followed, NOT a missing route: the gate stays shut",
    redirected.findings.every((finding) => finding.channel !== "clone-route-missing") &&
      redirected.findings.length >= 4,
    `${redirected.findings.length} finding(s)`,
  );
  const unknownSource = classifyFixture({
    clone: ERROR_PAGE,
    sourceHttpStatus: null,
    cloneHttpStatus: 404,
  });
  check(
    "an UNKNOWN source status cannot trip the gate — it fires only against a source that served 2xx",
    unknownSource.findings.every(
      (finding) => finding.channel !== "clone-route-missing",
    ),
  );
  const neverBuilt = classifyFixture({
    clone: ERROR_PAGE,
    sourceHttpStatus: 200,
    cloneHttpStatus: null,
    cloneRouteBuilt: false,
  });
  check(
    "a route the clone never built at all trips the gate with no status to read",
    neverBuilt.findings.length === 1 &&
      neverBuilt.findings[0]?.channel === "clone-route-missing",
    `${neverBuilt.findings.length} finding(s)`,
  );
  check(
    "the gate is exported and directly answerable, so the decision can be audited on its own",
    cloneRouteGate({ sourceHttpStatus: 200, cloneHttpStatus: 503 }).missing === true &&
      cloneRouteGate({ sourceHttpStatus: 200, cloneHttpStatus: 200 }).missing === false &&
      cloneRouteGate({ sourceHttpStatus: 404, cloneHttpStatus: 404 }).missing === false,
  );
}

// ---------------------------------------------------------------------------
// WP-C2. guard 2 — a source capture that will not hold still
// ---------------------------------------------------------------------------

/** Only the fields the stability pass reads. The rule is about ONE number per
 *  width — the source's element population — and building a full measurement
 *  around it would hide that. */
function populationPair(
  index: number,
  width: number,
  totalNodes: number,
  route = "/",
  classification?: Classification,
): PairResult {
  return {
    index,
    route,
    width,
    ok: true,
    source: { totalNodes } as unknown as PairResult["source"],
    ...(classification ? { classification } : {}),
  };
}

function profile(populations: readonly number[], route = "/"): PairResult[] {
  const widths = [390, 700, 1024, 1440];
  return populations.map((population, i) =>
    populationPair(i + 1, widths[i] ?? 1600 + i, population, route),
  );
}

function testSourceStabilityGuard(): void {
  section("WP-C2. guard 2 — a source capture that will not hold still");

  // THE DISCRIMINATOR TEST. Both profiles contain exactly one large jump. The
  // difference is what happens after it, and that difference is the only thing
  // separating a bad capture from a genuine responsive breakpoint.
  const spike = detectSourceInstability(profile([1200, 1200, 4200, 1260]));
  const step = detectSourceInstability(profile([1200, 1200, 2400, 2450]));

  check(
    "a population that deviates from BOTH neighbours and then REVERTS is flagged unstable",
    spike.get(3)?.unstable === true,
    JSON.stringify(spike.get(3)),
  );
  check(
    "…and it is the only width flagged: its neighbours are not condemned with it",
    [1, 2, 4].every((index) => spike.get(index)?.unstable === false),
    [1, 2, 4].map((i) => `${i}:${spike.get(i)?.unstable}`).join(" "),
  );
  check(
    "A MONOTONE STEP IS NOT FLAGGED: a real breakpoint jumps once and STAYS jumped",
    [1, 2, 3, 4].every((index) => step.get(index)?.unstable === false),
    [1, 2, 3, 4].map((i) => `${i}:${step.get(i)?.unstable}`).join(" "),
  );
  check(
    "…and the reason is legible in the reading: the step's neighbours disagree, the spike's agree",
    (step.get(3)?.neighbourDisagreement ?? 0) > SOURCE_POPULATION_REVERSION_RATIO &&
      (spike.get(3)?.neighbourDisagreement ?? 1) <= SOURCE_POPULATION_REVERSION_RATIO,
    `step ${step.get(3)?.neighbourDisagreement} vs spike ${spike.get(3)?.neighbourDisagreement}`,
  );
  check(
    "…and the step's middle width DID deviate from a neighbour, so deviation alone would have flagged it",
    (step.get(3)?.deviationFromPrevious ?? 0) >= SOURCE_POPULATION_SPIKE_RATIO,
    `deviationFromPrevious=${step.get(3)?.deviationFromPrevious}`,
  );

  // THE MINIMAL PAIR. The profile above is already separated by the
  // "deviates from BOTH" clause, so on its own it does not prove the reversion
  // clause carries any weight. These two differ in ONE number. In both, the
  // middle width sits far above both neighbours in the same direction, so
  // every other condition of the rule is satisfied identically; only whether
  // the population came BACK is different.
  const reverts = detectSourceInstability(profile([1000, 3000, 1050]));
  const climbs = detectSourceInstability(profile([1000, 3000, 1800]));
  check(
    "REVERSION IS LOAD-BEARING: a spike that returns to the previous population is unstable",
    reverts.get(2)?.unstable === true,
    JSON.stringify(reverts.get(2)),
  );
  check(
    "…and the same spike over neighbours that do NOT agree is left alone, though it deviates from both",
    climbs.get(2)?.unstable === false &&
      (climbs.get(2)?.deviationFromPrevious ?? 0) >= SOURCE_POPULATION_SPIKE_RATIO &&
      (climbs.get(2)?.deviationFromNext ?? 0) >= SOURCE_POPULATION_SPIKE_RATIO,
    JSON.stringify(climbs.get(2)),
  );
  check(
    "a population that DIPS far below both neighbours and returns is unstable too — the rule is signed, not one-sided",
    detectSourceInstability(profile([3000, 200, 3050])).get(2)?.unstable === true,
  );

  // EDGE WIDTHS. Stated as a decision, asserted as behaviour.
  check(
    "the lowest and highest width of a route are NOT stability-testable — one neighbour each",
    spike.get(1)?.testable === false &&
      spike.get(4)?.testable === false &&
      spike.get(2)?.testable === true &&
      spike.get(3)?.testable === true,
    `${spike.get(1)?.testable} ${spike.get(2)?.testable} ${spike.get(3)?.testable} ${spike.get(4)?.testable}`,
  );
  const twoWidths = detectSourceInstability(profile([1200, 4200]));
  check(
    "…and a route swept at fewer than three widths is testable nowhere, never silently 'stable'",
    twoWidths.get(1)?.testable === false && twoWidths.get(2)?.testable === false,
  );
  check(
    "an untestable edge width is graded normally rather than flagged, and says so in its reading",
    spike.get(1)?.unstable === false && spike.get(1)?.previousPopulation === null,
  );

  // A route's widths are grouped independently: one route's spike must not
  // contaminate another's.
  const twoRoutes = detectSourceInstability([
    ...profile([1200, 1200, 4200, 1260], "/"),
    ...profile([900, 900, 900, 900], "/pricing").map((pair, i) => ({
      ...pair,
      index: 100 + i,
    })),
  ]);
  check(
    "routes are grouped separately: a spike on one route flags nothing on another",
    twoRoutes.get(3)?.unstable === true &&
      [100, 101, 102, 103].every((index) => twoRoutes.get(index)?.unstable === false),
  );

  // THE REWRITE. Volatile content channels are demoted; structural ones survive;
  // the override says so and keeps what it removed.
  const unstableClassification = classifyFixture({
    clone: {
      visibleTextChars: 30,
      visibleTextEntries: census(["hello"]).visibleTextEntries,
      footer: {
        elementCount: 1,
        visibleLinkCount: 4,
        visibleTextChars: 40,
        maxRight: 2400,
        maxRightIncludingWide: 2400,
        fullyInsideViewport: false,
        wideElementsExcluded: 0,
        widestExcludedWidth: 0,
      },
    },
    sourceHttpStatus: 200,
    cloneHttpStatus: 200,
  });
  check(
    "PRECONDITION: the fixture fires BOTH a volatile content channel and a structural one",
    unstableClassification.findings.some((f) => f.channel === "missing-text-ratio") &&
      unstableClassification.findings.some((f) => f.channel === "footer-clipped"),
    unstableClassification.findings.map((f) => f.channel).join(", "),
  );

  const clonePairs = profile([1200, 1200, 4200, 1260]).map((pair) =>
    pair.index === 3 ? { ...pair, classification: unstableClassification } : pair,
  );
  const applied = applySourceStabilityGuard(clonePairs, "clone");
  const rewritten = clonePairs.find((pair) => pair.index === 3)!.classification!;
  check(
    "the guard reports how many pairs it acted on and how many findings it moved",
    applied.unstablePairs === 1 && applied.demotedFindings > 0,
    JSON.stringify(applied),
  );
  check(
    "volatile CONTENT findings are demoted off an unstable pair",
    rewritten.findings.every((finding) => finding.channel !== "missing-text-ratio"),
    rewritten.findings.map((f) => f.channel).join(", "),
  );
  check(
    "…STRUCTURAL findings that do not depend on the source's node population survive",
    rewritten.findings.some((finding) => finding.channel === "footer-clipped"),
    rewritten.findings.map((f) => f.channel).join(", "),
  );
  check(
    "…the demoted findings are MOVED, not deleted: they are in override.demotedFindings",
    rewritten.override?.demotedFindings.some(
      (finding) => finding.channel === "missing-text-ratio",
    ) === true,
    `${rewritten.override?.demotedFindings.length} demoted`,
  );
  check(
    "…the override is LABELLED as an override and carries the verdict it replaced",
    rewritten.override?.guard === "source-capture-unstable" &&
      rewritten.override?.demoted === true &&
      rewritten.override?.originalVerdict === unstableClassification.verdict,
    `${rewritten.override?.guard} demoted=${rewritten.override?.demoted} original=${rewritten.override?.originalVerdict}`,
  );
  check(
    "…and the record does not contradict itself: every demoted channel reads firedAt null with a reason",
    rewritten.channels
      .filter((channel) => channel.channel === "missing-text-ratio")
      .every(
        (channel) =>
          channel.firedAt === null &&
          typeof channel.ineligibleReason === "string" &&
          channel.ineligibleReason.indexOf("hold still") !== -1,
      ),
  );
  check(
    "…and the counts are recomputed from what is LEFT, not carried over",
    rewritten.blockerCount ===
      rewritten.findings.filter((f) => f.severity === "BLOCKER").length &&
      rewritten.majorCount === rewritten.findings.filter((f) => f.severity === "MAJOR").length,
    `B${rewritten.blockerCount}/M${rewritten.majorCount} over ${rewritten.findings.length} finding(s)`,
  );

  // SELF-CHECK RECONCILIATION. A self-check run exists to measure exactly this
  // movement. Demoting there would make the floor look quieter than the
  // instrument is, and every clone verdict is read against that floor.
  const floorPairs = profile([1200, 1200, 4200, 1260]).map((pair) => ({
    ...pair,
    classification:
      pair.index === 3
        ? unstableClassification
        : classifyFixture({ sourceHttpStatus: 200, cloneHttpStatus: 200 }),
  }));
  const floorApplied = applySourceStabilityGuard(floorPairs, "self-check");
  const floorPair = floorPairs.find((pair) => pair.index === 3)!;
  check(
    "in a SELF-CHECK run the same pair is detected and counted, not demoted",
    floorApplied.unstablePairs === 1 && floorApplied.demotedFindings === 0,
    JSON.stringify(floorApplied),
  );
  check(
    "…its verdict and findings are untouched, so the floor still reports the movement it measured",
    floorPair.classification?.verdict === unstableClassification.verdict &&
      floorPair.classification?.findings.length ===
        unstableClassification.findings.length,
    `${floorPair.classification?.verdict} / ${floorPair.classification?.findings.length} finding(s)`,
  );
  check(
    "…and it is still LABELLED, with demoted:false saying which of the two treatments it got",
    floorPair.classification?.override?.demoted === false &&
      floorPair.classification?.override?.guard === "source-capture-unstable",
  );
  check(
    "…and it does NOT vanish from the floor: it is still measured and still verdicted",
    (() => {
      const accounted = accountForCoverage(floorPairs, "self-check", {
        untestedPairs: floorApplied.untestedPairs,
        demotedFindings: floorApplied.demotedFindings,
      });
      return (
        accounted.coverage.pairsSourceCaptureUnstable === 0 &&
        accounted.coverage.pairsGraded === 4 &&
        accounted.verdicted.length === 4
      );
    })(),
  );
}

// ---------------------------------------------------------------------------
// WP-C3. guard 3 — duplicate image layers are not a layout collapse
// ---------------------------------------------------------------------------

function imageLeaf(overrides: Partial<LeafBox> = {}): LeafBox {
  return {
    key: "i:img|hero",
    kind: "image",
    left: 0,
    right: 400,
    top: 0,
    bottom: 300,
    chars: 0,
    loaded: true,
    ownerKey: "div/picture",
    ...overrides,
  };
}

function testDuplicateImageLayers(): void {
  section("WP-C3. guard 3 — duplicate image layers vs a real layout collapse");

  const base = imageLeaf();
  // A <picture> placeholder under its full-res source: same owner, same box to
  // within a pixel of rounding.
  const layer = imageLeaf({ key: "p:img|div/picture/img", left: 1, right: 401, top: 1, bottom: 301 });
  check(
    "two image layers with the same visual owner in the SAME box are a duplicate stack",
    classifyOverlapPair(base, layer) === "duplicate-image-stack",
    classifyOverlapPair(base, layer),
  );
  check(
    "…and the same-key form of it is recognised too",
    classifyOverlapPair(base, imageLeaf({ ownerKey: "div/other" })) ===
      "duplicate-image-stack",
  );

  // NEGATIVE CONTROLS — the demotion must be refusable, on both of its two
  // conditions independently.
  const different = imageLeaf({ key: "i:img|logo", ownerKey: "div/img" });
  check(
    "TWO DIFFERENT ELEMENTS overlapping still fires as a real overlap",
    classifyOverlapPair(base, different) === "true-overlap",
    classifyOverlapPair(base, different),
  );
  const sameKeyOffset = imageLeaf({ ownerKey: "div/img2", left: 60, right: 460, top: 40, bottom: 340 });
  check(
    "…and so does the SAME key in a DIFFERENT box: key equality alone never demotes",
    classifyOverlapPair(base, sameKeyOffset) === "true-overlap",
    classifyOverlapPair(base, sameKeyOffset),
  );
  check(
    "…the box test is per-EDGE, so a contained box is not 'the same box' however similar its area",
    classifyOverlapPair(base, imageLeaf({ left: 100, right: 300, top: 75, bottom: 225 })) ===
      "true-overlap",
  );
  check(
    "…and a text leaf under an image is never a duplicate layer",
    classifyOverlapPair(
      base,
      { key: "t:hello", kind: "text", left: 0, right: 400, top: 0, bottom: 300, chars: 5 },
    ) === "true-overlap",
  );
  check(
    `the tolerance is exactly ${DUPLICATE_IMAGE_LAYER_TOLERANCE_PX}px per edge, and one pixel past it is a real overlap`,
    sameBoxWithin(base, imageLeaf({ left: DUPLICATE_IMAGE_LAYER_TOLERANCE_PX }), DUPLICATE_IMAGE_LAYER_TOLERANCE_PX) &&
      !sameBoxWithin(
        base,
        imageLeaf({ left: DUPLICATE_IMAGE_LAYER_TOLERANCE_PX + 1 }),
        DUPLICATE_IMAGE_LAYER_TOLERANCE_PX,
      ),
  );

  // The sweep attributes what it counts, and the parts add back up.
  const budget = { maxOverlapSamples: 8, maxOverlapComparisonsPerLeaf: 2000, innerWidth: 1000, innerHeight: 900 };
  const stacked = computeOverlapAccounting([base, layer], budget);
  check(
    "a stacked pair is counted in the TOTAL and attributed to the duplicate channel",
    stacked.overlapPairCount === 1 &&
      stacked.duplicateImageStackPairCount === 1 &&
      stacked.trueOverlapPairCount === 0,
    JSON.stringify({
      total: stacked.overlapPairCount,
      dup: stacked.duplicateImageStackPairCount,
      real: stacked.trueOverlapPairCount,
    }),
  );
  const collided = computeOverlapAccounting([base, different], budget);
  check(
    "…and a genuine two-element collision is counted as TRUE overlap, with area",
    collided.trueOverlapPairCount === 1 &&
      collided.duplicateImageStackPairCount === 0 &&
      collided.trueOverlapArea > 0,
    JSON.stringify({
      real: collided.trueOverlapPairCount,
      area: collided.trueOverlapArea,
    }),
  );
  const mixed = computeOverlapAccounting([base, layer, different], budget);
  check(
    "THE SPLIT IS A PARTITION: the three sub-totals sum back to the total, in pairs and in area",
    mixed.duplicateImageStackPairCount +
      mixed.failedImageLayerOverlapPairCount +
      mixed.trueOverlapPairCount ===
      mixed.overlapPairCount &&
      mixed.duplicateImageStackArea +
        mixed.failedImageLayerOverlapArea +
        mixed.trueOverlapArea ===
        mixed.overlapArea,
    JSON.stringify(mixed),
  );
  check(
    "…and every sample carries the attribution, so the worst offenders are readable",
    mixed.worstOverlaps.every((sample) => sample.kind !== undefined) &&
      mixed.worstOverlaps.some((sample) => sample.kind === "duplicate-image-stack"),
    JSON.stringify(mixed.worstOverlaps.map((s) => s.kind)),
  );

  // THE RUBRIC-LEVEL EFFECT, with the count that keeps it honest.
  const demoted = classifyFixture({
    clone: {
      overlapArea: 180_000,
      overlapAreaRatio: 0.2,
      overlapPairCount: 3,
      duplicateImageStackArea: 180_000,
      duplicateImageStackAreaRatio: 0.2,
      duplicateImageStackPairCount: 3,
    },
    sourceHttpStatus: 200,
    cloneHttpStatus: 200,
  });
  check(
    "an overlap that is ALL duplicate layers raises no overlap finding",
    demoted.findings.every((finding) => finding.channel !== "overlap-excess-ratio"),
    demoted.findings.map((f) => f.channel).join(", "),
  );
  check(
    "…and the removal is COUNTED, never silent: overlapFindingDemoted plus the pair count",
    demoted.demotions?.overlapFindingDemoted === true &&
      demoted.demotions?.duplicateImageStackPairs === 3,
    JSON.stringify(demoted.demotions),
  );
  check(
    "…and the undemoted reading is still published, so the old number is reconstructible",
    (() => {
      const undemoted = demoted.channels.find(
        (channel) => channel.channel === "overlap-excess-ratio-undemoted",
      );
      return undemoted !== undefined && near(undemoted.value, 0.2, 1e-6);
    })(),
    JSON.stringify(
      demoted.channels.find((c) => c.channel === "overlap-excess-ratio-undemoted"),
    ),
  );

  // NEGATIVE CONTROL: the identical area, attributed to real collisions.
  const real = classifyFixture({
    clone: {
      overlapArea: 180_000,
      overlapAreaRatio: 0.2,
      overlapPairCount: 3,
      trueOverlapArea: 180_000,
      trueOverlapAreaRatio: 0.2,
      trueOverlapPairCount: 3,
    },
    sourceHttpStatus: 200,
    cloneHttpStatus: 200,
  });
  check(
    "NEGATIVE CONTROL: the SAME overlap area between DIFFERENT elements still fires at BLOCKER",
    real.findings.some(
      (finding) =>
        finding.channel === "overlap-excess-ratio" && finding.severity === "BLOCKER",
    ),
    real.findings.map((f) => `${f.channel}:${f.severity}`).join(", "),
  );
  check(
    "…and nothing is reported as demoted on that pair",
    real.demotions?.overlapFindingDemoted === false &&
      real.demotions?.duplicateImageStackPairs === 0,
    JSON.stringify(real.demotions),
  );
}

function testFailedImageLayers(): void {
  section("WP-C3b. guard 3 — a failed image asset is a resource defect, counted once");

  const broken = imageLeaf({ loaded: false });
  const good = imageLeaf({ key: "i:img|logo", ownerKey: "div/img" });
  // TASK 28.75, ITEM L1 — THIS ASSERTION WAS INVERTED, AND THE INVERSION WAS
  // THE DEFECT. It used to read `=== "failed-image-layer"`, pinning the
  // behaviour that a single broken asset re-attributed a collision between TWO
  // DIFFERENT visual owners out of the BLOCKER-capable overlap channel into a
  // MAJOR-only one. `good` and `broken` are different keys, different owners,
  // one box: that is a layout collapse, and whether one of the two decoded is a
  // fact about the network, not about the layout.
  check(
    "a collision between two DIFFERENT owners is a real overlap even when one asset did not paint",
    classifyOverlapPair(good, broken) === "true-overlap",
    classifyOverlapPair(good, broken),
  );
  check(
    "…and it outranks the duplicate test, so one fault is never reported under two names",
    classifyOverlapPair(broken, imageLeaf({ loaded: false })) === "failed-image-layer",
  );
  check(
    "an image whose load state is UNKNOWN (inline svg, canvas, iframe) is not treated as broken",
    classifyOverlapPair(
      imageLeaf({ key: "i:svg|mark", ownerKey: "div/svg", loaded: undefined }),
      good,
    ) === "true-overlap",
  );

  const budget = { maxOverlapSamples: 8, maxOverlapComparisonsPerLeaf: 2000, innerWidth: 1000, innerHeight: 900 };
  const accounting = computeOverlapAccounting([good, broken], budget);
  // ITEM L1, the same correction one level up. The broken LEAF is still counted
  // (that is what `image-layer-state` fires on); what changed is that its
  // collision with a different owner is no longer taken out of the true-overlap
  // total on the strength of the load flag alone.
  check(
    "the sweep counts the broken leaf AND keeps its collision with a different owner in the true-overlap total",
    accounting.failedImageLeafCount === 1 &&
      accounting.loadedImageLeafCount === 1 &&
      accounting.failedImageLayerOverlapPairCount === 0 &&
      accounting.trueOverlapPairCount === 1 &&
      accounting.trueOverlapArea > 0,
    JSON.stringify(accounting),
  );

  const failed = classifyFixture({
    clone: {
      imageLeafCount: 5,
      loadedImageLeafCount: 3,
      failedImageLeafCount: 2,
      overlapArea: 180_000,
      overlapAreaRatio: 0.2,
      overlapPairCount: 2,
      failedImageLayerOverlapArea: 180_000,
      failedImageLayerOverlapAreaRatio: 0.2,
      failedImageLayerOverlapPairCount: 2,
    },
    sourceHttpStatus: 200,
    cloneHttpStatus: 200,
  });
  check(
    "the image RESOURCE failure is the primary defect and fires on its own channel",
    failed.findings.some(
      (finding) =>
        finding.channel === "image-layer-state" && finding.severity === "MAJOR",
    ),
    failed.findings.map((f) => `${f.channel}:${f.severity}`).join(", "),
  );
  check(
    "…and the overlap it causes is NOT charged a second time as a layout collapse",
    failed.findings.every((finding) => finding.channel !== "overlap-excess-ratio"),
    failed.findings.map((f) => f.channel).join(", "),
  );
  check(
    "…with the demoted pairs counted, so the missing overlap finding is accounted for",
    failed.demotions?.failedImageLayerOverlapPairs === 2 &&
      failed.demotions?.overlapFindingDemoted === true,
    JSON.stringify(failed.demotions),
  );
  check(
    `…and the channel's band is the stated ${IMAGE_LAYER_FAILURE_MAJOR_EXCESS}-asset excess, measured against the SOURCE's own broken images`,
    classifyFixture({
      source: { failedImageLeafCount: 2, loadedImageLeafCount: 3 },
      clone: { failedImageLeafCount: 2, loadedImageLeafCount: 3 },
      sourceHttpStatus: 200,
      cloneHttpStatus: 200,
    }).findings.every((finding) => finding.channel !== "image-layer-state"),
  );
}

// ---------------------------------------------------------------------------
// WP-C4. guard 4 — measurement failure, and where every finding went
// ---------------------------------------------------------------------------

function testCoverageAccounting(): void {
  section("WP-C4. guard 4 — measurement failure is never green, and coverage is conserved");

  const graded = classifyFixture({ sourceHttpStatus: 200, cloneHttpStatus: 200 });
  check(
    "PRECONDITION: the plain fixture grades to a real layout verdict",
    graded.findings.length === 0 && graded.verdict === "PASS",
    `${graded.verdict} over ${graded.findings.length} finding(s)`,
  );
  const routeMissing = classifyFixture({
    clone: ERROR_PAGE,
    sourceHttpStatus: 200,
    cloneHttpStatus: 404,
  });
  const volatileBlocker = classifyFixture({
    clone: {
      visibleTextChars: 30,
      visibleTextEntries: census(["hello"]).visibleTextEntries,
    },
    sourceHttpStatus: 200,
    cloneHttpStatus: 200,
  });

  // One route swept at four widths with a reverting spike at 1024, plus a
  // missing clone route and a capture that threw.
  const pairs: PairResult[] = [
    populationPair(1, 390, 1200, "/", graded),
    populationPair(2, 700, 1200, "/", graded),
    populationPair(3, 1024, 4200, "/", volatileBlocker),
    populationPair(4, 1440, 1260, "/", graded),
    populationPair(5, 1000, 1200, "/pricing", routeMissing),
    { index: 6, route: "/about", width: 1000, ok: false, error: "capture failed: net::ERR" },
  ];
  const stability = applySourceStabilityGuard(pairs, "clone");
  const { coverage, verdicted } = accountForCoverage(pairs, "clone", {
    untestedPairs: stability.untestedPairs,
    demotedFindings: stability.demotedFindings,
  });

  check(
    "THE CONSERVATION ASSERTION: graded + every exclusion bucket === total pairs",
    coverage.pairsGraded +
      coverage.pairsCloneRouteMissing +
      coverage.pairsSourceCaptureUnstable +
      coverage.pairsMeasurementFailed ===
      coverage.pairsTotal,
    JSON.stringify(coverage),
  );
  check(
    "…and the artifact says so itself, in a field a script can read",
    coverage.conserved === true && coverage.pairsAccountedFor === coverage.pairsTotal,
    `accountedFor=${coverage.pairsAccountedFor} total=${coverage.pairsTotal}`,
  );
  check(
    "the four buckets are the ones this work package's guards produce, with the right sizes",
    coverage.pairsTotal === 6 &&
      coverage.pairsGraded === 3 &&
      coverage.pairsCloneRouteMissing === 1 &&
      coverage.pairsSourceCaptureUnstable === 1 &&
      coverage.pairsMeasurementFailed === 1,
    JSON.stringify(coverage),
  );
  check(
    "every pair carries exactly one bucket, so the partition is auditable pair by pair",
    pairs.every((pair) => pair.coverageBucket !== undefined) &&
      new Set(pairs.map((pair) => `${pair.index}`)).size === pairs.length,
  );

  // MEASUREMENT FAILURE IS NEVER GREEN.
  const failedPair = pairs.find((pair) => pair.index === 6)!;
  check(
    "a pair whose capture failed carries the outcome FAILED, not a layout verdict",
    failedPair.outcome === "FAILED" && failedPair.coverageBucket === "measurement-failed",
    `${failedPair.outcome} / ${failedPair.coverageBucket}`,
  );
  check(
    "…it is excluded from the PASS/MAJOR/BLOCKER tallies",
    verdicted.every((pair) => pair.index !== 6) && verdicted.length === 4,
    `${verdicted.length} verdicted: ${verdicted.map((p) => p.index).join(",")}`,
  );
  check(
    "…and it is never compared against a floor",
    carriesLayoutVerdict(failedPair.outcome) === false,
  );
  check(
    "…and it is COUNTED, so the sweep's hole is a number rather than an omission",
    coverage.pairsMeasurementFailed === 1,
  );

  // AN UNSTABLE PAIR IS ALSO NEVER GREEN.
  const unstablePair = pairs.find((pair) => pair.index === 3)!;
  check(
    "an unstable pair carries the outcome UNSTABLE — not PASS, and not a silent BLOCKER",
    unstablePair.outcome === "UNSTABLE",
    `${unstablePair.outcome}`,
  );
  check(
    "…even though its rewritten classification has nothing left to fire on",
    unstablePair.classification?.findings.length === 0 &&
      unstablePair.classification?.verdict === "PASS" &&
      unstablePair.outcome !== "PASS",
    `findings=${unstablePair.classification?.findings.length} classificationVerdict=${unstablePair.classification?.verdict} outcome=${unstablePair.outcome}`,
  );
  check(
    "…it is out of the verdict tallies and out of every floor comparison",
    verdicted.every((pair) => pair.index !== 3) &&
      carriesLayoutVerdict(unstablePair.outcome) === false,
  );
  check(
    "…and the findings it lost are counted in the coverage block",
    coverage.unstableFindingsDemoted > 0,
    `unstableFindingsDemoted=${coverage.unstableFindingsDemoted}`,
  );

  check(
    "the verdicted pairs are exactly graded + clone-route-missing, so the tallies have a stated denominator",
    coverage.pairsVerdicted === coverage.pairsGraded + coverage.pairsCloneRouteMissing &&
      coverage.pairsVerdicted === verdicted.length,
    `${coverage.pairsVerdicted} vs ${verdicted.length}`,
  );
  check(
    "the missing-route pair DOES carry its verdict: a route the clone never served is a real defect",
    pairs.find((pair) => pair.index === 5)?.outcome === "BLOCKER" &&
      verdicted.some((pair) => pair.index === 5),
  );
  check(
    "edge widths that could not be stability-tested are counted, not assumed stable",
    // 3: the lowest and highest width of "/" plus the single width of
    // "/pricing". "/about" never captured, so it has no source population and
    // is in the measurement-failed bucket instead.
    coverage.pairsStabilityUntested === stability.untestedPairs &&
      coverage.pairsStabilityUntested === 3,
    `pairsStabilityUntested=${coverage.pairsStabilityUntested}`,
  );

  // A sweep with nothing wrong must still conserve, or the invariant is vacuous.
  const clean: PairResult[] = profile([1000, 1000, 1000, 1000]).map((pair) => ({
    ...pair,
    classification: graded,
  }));
  const cleanStability = applySourceStabilityGuard(clean, "clone");
  const cleanCoverage = accountForCoverage(clean, "clone", {
    untestedPairs: cleanStability.untestedPairs,
    demotedFindings: cleanStability.demotedFindings,
  }).coverage;
  check(
    "a sweep with no exclusions at all conserves too, with every pair in the graded bucket",
    cleanCoverage.conserved === true &&
      cleanCoverage.pairsGraded === 4 &&
      cleanCoverage.pairsAccountedFor === 4,
    JSON.stringify(cleanCoverage),
  );
}

// ---------------------------------------------------------------------------
// H. BLANK REGIONS (Task 28.75) — "the source fills this rectangle and the
//    clone leaves it empty", the first channel in the rubric that reads a
//    RECTANGLE instead of a page total
// ---------------------------------------------------------------------------
//
// WHY EVERY CHECK BELOW EXISTS. `gs.severance.healthcare /gs/index.do @1440`
// graded MINOR on a clone whose NEWS row carries none of the source's four
// cards and whose promotional carousel carries none of its four, because
// `image-presence-ratio` was 1.0, `missing-text-ratio` was 0.0000 and
// `visible-text-ratio` was 1.0 — every page total balanced, since the content
// is all still SOMEWHERE on the clone. The four fixtures here are the four
// shapes that separate a real hole from the three things that look like one:
// intentional whitespace (the discriminating twin), a decorative container, a
// region that merely moved, and a mis-paired region on a healthy page.

/** A region box, with the content-free defaults the census would produce. */
function region(
  path: string,
  box: [number, number, number, number],
  extra: Partial<RegionBox> = {},
): RegionBox {
  const [left, top, right, bottom] = box;
  return {
    path,
    tag: path.split("/").pop()!.replace(/\[\d+\]$/, ""),
    left,
    top,
    right,
    bottom,
    visibleDescendants: 8,
    textChars: 240,
    imageElements: 1,
    ...extra,
  };
}

/** `count` text leaves stacked down a box, each 90 % of its width. */
function paintLeaves(
  box: [number, number, number, number],
  count: number,
  chars = 40,
): LeafBox[] {
  const [left, top, right, bottom] = box;
  const width = Math.round((right - left) * 0.9);
  const height = Math.round((bottom - top) / (count * 2));
  const step = Math.floor((bottom - top) / count);
  const leaves: LeafBox[] = [];
  for (let i = 0; i < count; i++) {
    leaves.push({
      key: `t:line${i}-${left}-${top}`,
      kind: "text",
      left: left + 5,
      right: left + 5 + width,
      top: top + i * step + 2,
      bottom: top + i * step + 2 + height,
      chars,
    });
  }
  return leaves;
}

const EMPTY_REGION_ACCOUNTING = {
  examined: 900,
  selected: 0,
  rejected: 900,
  rejectedByReason: [{ reason: "too-small", count: 900 }],
  truncated: false,
};

function blankSide(
  regions: RegionBox[],
  leaves: LeafBox[],
  extra: Partial<BlankRegionSide> = {},
): BlankRegionSide {
  return {
    regions,
    leaves,
    leavesTruncated: false,
    regionAccounting: { ...EMPTY_REGION_ACCOUNTING, selected: regions.length },
    innerWidth: 1000,
    innerHeight: 900,
    scrollHeight: 3000,
    ...extra,
  };
}

/** The shared geometry of the four discrimination fixtures. */
const HOLE: [number, number, number, number] = [0, 1000, 1000, 1400];
const OUTER: [number, number, number, number] = [0, 0, 1000, 3000];
/** Leaves the clone paints ELSEWHERE, so the enclosing region is never blank
 *  and the fixture is testing the hole and not the whole page. */
const CLONE_ELSEWHERE = paintLeaves([0, 100, 1000, 900], 8);

function testBlankRegionDetector(): void {
  section("H. blank regions — a hole a page total cannot see (Task 28.75)");

  // -- H1. THE POSITIVE ----------------------------------------------------
  const sourceFilled = blankSide(
    [region("div/main", OUTER), region("div/main/section[2]", HOLE)],
    [...paintLeaves(HOLE, 6), ...paintLeaves([0, 100, 1000, 900], 8)],
  );
  const cloneEmptyHole = blankSide(
    [region("wrap/div/main", OUTER), region("wrap/div/main/section[2]", HOLE)],
    CLONE_ELSEWHERE,
  );
  const positive = detectBlankRegions(sourceFilled, cloneEmptyHole);
  check(
    "a 1000x400 region the source fills and the clone leaves empty is REPORTED",
    positive.regions.length === 1 &&
      positive.regions[0]?.path === "div/main/section[2]",
    JSON.stringify(positive.regions.map((r) => r.path)),
  );
  check(
    "…at BLOCKER: 400,000 px² of hole is 0.44 of a 1000x900 viewport, over the 0.25 band",
    reachesBlocker(positive) && positive.ratio >= BLANK_REGION_BLOCKER_RATIO,
    `ratio=${positive.ratio} blocker band=${BLANK_REGION_BLOCKER_RATIO}`,
  );
  check(
    "…and the classifier turns that into a BLOCKER finding on blank-region-ratio",
    (() => {
      const classified = classifyBlank(sourceFilled, cloneEmptyHole);
      return (
        classified?.firedAt === "BLOCKER" &&
        classified.value === positive.ratio &&
        classified.note.indexOf("div/main/section[2]") !== -1
      );
    })(),
    JSON.stringify(classifyBlank(sourceFilled, cloneEmptyHole)),
  );
  check(
    "…the enclosing region is NOT also reported: only maximal holes are counted",
    positive.regions.every((r) => r.path !== "div/main"),
  );
  check(
    "…the pair is found by tag-path SUFFIX, and the clone's shell prefix is why",
    positive.regions[0]?.correspondence === "path-suffix" &&
      positive.regions[0]?.clonePath === "wrap/div/main/section[2]",
    `${positive.regions[0]?.correspondence} -> ${positive.regions[0]?.clonePath}`,
  );
  check(
    "…and it is named DISPLACED, because the clone container still holds a visible subtree",
    positive.regions[0]?.mechanism === "displaced" && positive.displacedCount === 1,
    `mechanism=${positive.regions[0]?.mechanism}`,
  );

  // -- H2. THE DISCRIMINATING TWIN -----------------------------------------
  //
  // THE SAME GEOMETRY, and the source region is empty too. This is intentional
  // whitespace — a designed gap, a spacer, a section that is simply airy — and
  // a channel that cannot tell it from a defect is a channel that fires on
  // every well-made page. Note that ONLY the source's leaves change.
  const sourceEmptyHole = blankSide(
    [region("div/main", OUTER), region("div/main/section[2]", HOLE)],
    paintLeaves([0, 100, 1000, 900], 8),
  );
  const twin = detectBlankRegions(sourceEmptyHole, cloneEmptyHole);
  check(
    "the SAME empty clone region is REFUSED when the source's is empty too (intentional whitespace)",
    twin.regions.length === 0 && twin.ratio === 0,
    `regions=${twin.regions.length} ratio=${twin.ratio}`,
  );
  check(
    "…and the refusal is stated as a measurement: the region is not POPULATED on the source",
    twin.populatedSourceRegions < positive.populatedSourceRegions &&
      sourceRegionIsPopulated(
        region("div/main/section[2]", HOLE),
        paintInsideBox(sourceEmptyHole.leaves, {
          left: HOLE[0],
          top: HOLE[1],
          right: HOLE[2],
          bottom: HOLE[3],
        }),
      ) === false,
    `populated ${twin.populatedSourceRegions} vs ${positive.populatedSourceRegions}`,
  );
  check(
    "…and the classifier records the channel at zero rather than dropping it",
    (() => {
      const reading = classifyBlank(sourceEmptyHole, cloneEmptyHole);
      return reading !== undefined && reading.value === 0 && reading.firedAt === null;
    })(),
  );

  // -- H3. NEGATIVE CONTROL: a small decorative container ------------------
  const SMALL: [number, number, number, number] = [0, 1000, 300, 1100];
  const sourceSmall = blankSide(
    [region("div/main", OUTER), region("div/main/aside", SMALL)],
    [...paintLeaves(SMALL, 3, 12), ...paintLeaves([0, 100, 1000, 900], 8)],
  );
  const cloneSmall = blankSide(
    [region("wrap/div/main", OUTER), region("wrap/div/main/aside", SMALL)],
    CLONE_ELSEWHERE,
  );
  const small = detectBlankRegions(sourceSmall, cloneSmall);
  check(
    "a 300x100 decorative container that comes out empty can never reach BLOCKER",
    !reachesBlocker(small) && small.ratio < BLANK_REGION_BLOCKER_RATIO,
    `ratio=${small.ratio}`,
  );
  check(
    "…and the classifier grades it MINOR at most",
    (() => {
      const reading = classifyBlank(sourceSmall, cloneSmall);
      return (
        reading !== undefined &&
        (reading.firedAt === null || reading.firedAt === "MINOR")
      );
    })(),
    JSON.stringify(classifyBlank(sourceSmall, cloneSmall)?.firedAt),
  );

  // -- H4. NEGATIVE CONTROL: populated, but SHIFTED ------------------------
  //
  // The clone's counterpart carries all the content and sits 240px lower. That
  // is what `position-delta-p90-px` is for; this channel must stay silent, or
  // every page with a different header height becomes a column of holes.
  const SHIFTED: [number, number, number, number] = [0, 1240, 1000, 1640];
  const cloneShifted = blankSide(
    [region("wrap/div/main", OUTER), region("wrap/div/main/section[2]", SHIFTED)],
    [...paintLeaves(SHIFTED, 6), ...CLONE_ELSEWHERE],
  );
  const shifted = detectBlankRegions(sourceFilled, cloneShifted);
  check(
    "a region whose clone counterpart is POPULATED but 240px lower does NOT fire",
    shifted.regions.length === 0 && shifted.ratio === 0,
    `regions=${shifted.regions.length} ratio=${shifted.ratio}`,
  );

  // -- H5. THE MIS-PAIRING VETO --------------------------------------------
  //
  // Structural correspondence's one real failure mode: a short path suffix
  // pairs a source region with the wrong clone element. The second, independent
  // reading — the source box mapped into clone coordinates through a paired
  // ancestor — must agree the clone paints nothing there. Here it does not.
  const cloneDecoy = blankSide(
    [
      region("wrap/div/main", OUTER),
      // An empty element that pairs on suffix …
      region("wrap/aside/main/section[2]", [0, 2200, 1000, 2600]),
      // … while the real place the region belongs is still painted.
    ],
    [...paintLeaves(HOLE, 6), ...CLONE_ELSEWHERE],
  );
  const vetoed = detectBlankRegions(sourceFilled, cloneDecoy);
  check(
    "a region paired to an empty DECOY is vetoed when the clone still paints where it belongs",
    vetoed.regions.length === 0,
    JSON.stringify(vetoed.regions.map((r) => `${r.path}->${r.clonePath}`)),
  );

  // -- H6. BACKDROPS -------------------------------------------------------
  //
  // Measured on `seoultone.kr / @1440`: the clone paints a decorative full-bleed
  // <svg> forty times the area of the missing credential block, and with that
  // one leaf counted the empty block read 21.9 % painted with ZERO leaves in it.
  const backdrop: LeafBox = {
    key: "p:svg|wrap/div/bg",
    kind: "image",
    left: -1000,
    right: 3000,
    top: 500,
    bottom: 2900,
    chars: 0,
  };
  const cloneBackdrop = blankSide(
    [region("wrap/div/main", OUTER), region("wrap/div/main/section[2]", HOLE)],
    [backdrop, ...CLONE_ELSEWHERE],
  );
  const overBackdrop = detectBlankRegions(sourceFilled, cloneBackdrop);
  check(
    "a leaf 24x the region's area is a BACKDROP and does not rescue an empty region",
    overBackdrop.regions.length === 1 && overBackdrop.regions[0]?.clone.paintRatio === 0,
    `regions=${overBackdrop.regions.length} paint=${overBackdrop.regions[0]?.clone.paintRatio}`,
  );
  const cover: LeafBox = { ...backdrop, left: 0, right: 1000, top: 1000, bottom: 1400 };
  const cloneCovered = blankSide(
    [region("wrap/div/main", OUTER), region("wrap/div/main/section[2]", HOLE)],
    [cover, ...CLONE_ELSEWHERE],
  );
  check(
    "…but a leaf the SAME size as the region is its content, and the region is not blank",
    detectBlankRegions(sourceFilled, cloneCovered).regions.length === 0,
  );

  // -- H7. CORRESPONDENCE: exact path is dead, the suffix is not -----------
  check(
    "the FULL structural path matches NOTHING across sides: the generator prefixes every clone path",
    sourceFilled.regions.every(
      (r) => !cloneEmptyHole.regions.some((c) => c.path === r.path),
    ),
  );
  check(
    "…while the tag-path SUFFIX pairs both regions, which is why it is the mechanism",
    pairRegions(sourceFilled.regions, cloneEmptyHole.regions).length === 2,
  );
  check(
    "sharedPathSuffix counts trailing segments only",
    sharedPathSuffix(["div", "main", "section[2]"], ["wrap", "div", "main", "section[2]"]) ===
      3 && sharedPathSuffix(["div", "a"], ["div", "b"]) === 0,
  );
  // The tie-break. Both clone candidates share exactly 2 trailing segments with
  // the source region; only geometry says which one is the same container. On
  // `seoultone.kr / @1440` the document-order tie-break picked a 470x707 nav
  // panel over the 1440x4060 page body and poisoned every mapped coordinate.
  const tieSource = [region("div/div[1]", [0, 0, 1000, 2900])];
  const tieClone = [
    region("wrap/nav/div/div[1]", [700, 40, 950, 500]),
    region("wrap/body/div/div[1]", [0, 20, 1000, 2880]),
  ];
  const tie = pairRegions(tieSource, tieClone);
  check(
    "on a suffix TIE the geometrically plausible mate wins, not the earlier one",
    tie.length === 1 && tie[0]!.clone === 1,
    JSON.stringify(tie),
  );

  // -- H8. ANCESTOR-ANCHORED MAPPING (the seoultone shape) ------------------
  //
  // The clone has NO counterpart element for the missing block, and its whole
  // page sits 1,164px lower than the source's even though the two pages are the
  // same height. A raw source rectangle lands a screen and a half away; mapping
  // through the paired ancestor cancels the offset exactly.
  const OFFSET = 1164;
  const sourceAnchored = blankSide(
    [
      region("div/section[1]", [0, 500, 1000, 1150]),
      region("div/section[1]/div[1]", [500, 560, 1000, 1100]),
    ],
    [
      ...paintLeaves([500, 560, 1000, 1100], 6),
      ...paintLeaves([0, 560, 480, 1100], 4),
    ],
  );
  const cloneAnchored = blankSide(
    [
      region("wrap/div/section[1]", [0, 500 + OFFSET, 1000, 1150 + OFFSET]),
      // no counterpart for `div[1]` — the content is simply not there
    ],
    paintLeaves([0, 560 + OFFSET, 480, 1100 + OFFSET], 4),
  );
  const anchored = detectBlankRegions(sourceAnchored, cloneAnchored);
  check(
    "a missing block with no counterpart element is found by mapping through its PAIRED ancestor",
    anchored.regions.length === 1 &&
      anchored.regions[0]?.correspondence === "ancestor-mapped" &&
      anchored.regions[0]?.mechanism === "absent",
    JSON.stringify(anchored.regions.map((r) => [r.path, r.correspondence, r.mechanism])),
  );
  check(
    "…and the raw source rectangle would NOT have found it: the two pages are offset by 1,164px",
    anchored.alignedGeometry === false && anchored.medianTopOffset === OFFSET,
    `aligned=${anchored.alignedGeometry} medianTop=${anchored.medianTopOffset}`,
  );

  // -- H9. NO ANCHOR AND NO ALIGNMENT = UNJUDGED, NEVER GUESSED -------------
  //
  // The `hobbang.net / @390` shape: page heights agree to 0.4 % and the clone's
  // <main> still begins 8,011px lower. With the region census truncated, three
  // source list items had no counterpart, no paired ancestor — and the raw
  // rectangle reported them blank. They are counted as UNJUDGED instead.
  const orphanSource = blankSide(
    [region("main/section[14]/div/ol/li[3]", [16, 7675, 374, 7787], {
      visibleDescendants: 4,
      textChars: 49,
      imageElements: 0,
    })],
    paintLeaves([16, 7675, 374, 7787], 3, 16),
    { scrollHeight: 17167 },
  );
  const orphanClone = blankSide(
    [region("wrap/main/other", [0, 8000, 1000, 16000])],
    paintLeaves([16, 15675, 374, 15787], 3, 16),
    { scrollHeight: 17230 },
  );
  const orphan = detectBlankRegions(orphanSource, orphanClone);
  check(
    "a populated region with no pair and no paired ancestor is UNJUDGED, not reported blank",
    orphan.regions.length === 0 && orphan.unjudgedRegions === 1,
    `regions=${orphan.regions.length} unjudged=${orphan.unjudgedRegions}`,
  );
  check(
    "…and the classifier says so in a caveat rather than reporting a clean zero",
    classifyBlankPair(orphanSource, orphanClone).caveats.some(
      (c) => c.indexOf("could not be re-measured") !== -1,
    ),
  );

  // -- H10. GEOMETRY UNITS -------------------------------------------------
  check(
    "unionArea does not double-count two overlapping boxes",
    unionArea([
      { left: 0, top: 0, right: 100, bottom: 100 },
      { left: 50, top: 50, right: 150, bottom: 150 },
    ]) === 17_500,
    `${unionArea([
      { left: 0, top: 0, right: 100, bottom: 100 },
      { left: 50, top: 50, right: 150, bottom: 150 },
    ])}`,
  );
  check(
    "paintInsideBox counts a leaf by its CENTRE and its coverage by its clipped area",
    (() => {
      const box = { left: 0, top: 0, right: 100, bottom: 100 };
      const straddling: LeafBox = {
        key: "t:x",
        kind: "text",
        left: 90,
        right: 190,
        top: 40,
        bottom: 60,
        chars: 9,
      };
      const paint = paintInsideBox([straddling], box);
      return paint.leafCount === 0 && paint.paintRatio > 0;
    })(),
  );

  // -- H11. THE CHANNEL ROSTER AND THE RUBRIC VERSION ----------------------
  const roster = classifyBlankPair(sourceFilled, cloneEmptyHole).channels.map(
    (c) => c.channel,
  );
  for (const required of [
    "blank-region-ratio",
    "blank-region-count",
    "blank-region-largest-viewport-ratio",
    "blank-region-displaced-count",
    "blank-region-absent-count",
    "region-census-selected",
  ]) {
    check(`the roster carries ${required}`, roster.indexOf(required) !== -1);
  }

  // -- H12. TRUNCATION DISARMS THE CHANNEL ---------------------------------
  const truncatedClone = blankSide(
    cloneEmptyHole.regions,
    cloneEmptyHole.leaves,
    {
      regionAccounting: {
        examined: 900,
        selected: 2,
        rejected: 898,
        rejectedByReason: [
          { reason: "cap-reached", count: 51 },
          { reason: "too-small", count: 847 },
        ],
        truncated: true,
      },
    },
  );
  check(
    "a TRUNCATED region census records the channel and refuses to raise severity from it",
    (() => {
      const reading = classifyBlank(sourceFilled, truncatedClone);
      return (
        reading !== undefined &&
        reading.value > 0 &&
        reading.firedAt === null &&
        (reading.ineligibleReason ?? "").indexOf("DOCUMENT ORDER") !== -1
      );
    })(),
    JSON.stringify(classifyBlank(sourceFilled, truncatedClone)),
  );
  check(
    "…and so does a truncated LEAF census, for the same reason pointed the same way",
    (() => {
      const reading = classifyBlank(
        sourceFilled,
        blankSide(cloneEmptyHole.regions, cloneEmptyHole.leaves, {
          leavesTruncated: true,
        }),
      );
      return reading !== undefined && reading.value > 0 && reading.firedAt === null;
    })(),
  );

  // -- H14. THE INK LEG: the only channel that can see paint occlusion ------
  //
  // WHY IT EXISTS AT ALL. On `gs.severance.healthcare /gs/index.do` the hero
  // is a white rectangle in the clone while its DOM is PERFECT: the element
  // sits at exactly the source geometry (-240, 215, 1920x500), `opacity: 1`,
  // the image decoded. The <body> background is emitted as an ordinary in-flow
  // block background instead of being propagated to the document canvas, so it
  // paints over the hero and the hero's white headline lands on white. No DOM
  // census of any kind can see that. Only the pixels can.
  const INK_FOOTER = paintLeaves([0, 2800, 1000, 2960], 2);
  const inkLeaves = [
    ...paintLeaves(HOLE, 6),
    ...paintLeaves([0, 100, 1000, 900], 8),
    ...INK_FOOTER,
  ];
  /** Dense pixels between two rows, on an otherwise flat page-sized picture. */
  const inkBands = (bands: readonly [number, number][], width = 1000) =>
    image(width, 3000, [246, 247, 249], (set) => {
      for (const [from, to] of bands) {
        for (let y = from; y < to; y++) {
          for (let x = 0; x < width; x++) if ((x + y) % 3 === 0) set(x, y, 20, 20, 20);
        }
      }
    });
  /** The source: the rest of the page is inked too, so the ENCLOSING region is
   *  populated and unchanged on both sides and only the hole differs. Without
   *  that the whole page reads as one hole and the fixture proves nothing about
   *  which region the detector names. */
  const inkyImage = inkBands([
    [100, 900],
    [1000, 1400],
  ]);
  /** The same page with only the HOLE band painted flat — the occlusion. */
  const flatImage = inkBands([[100, 900]]);
  const inkSource = blankSide(
    [region("div/main", OUTER), region("div/main/section[2]", HOLE)],
    inkLeaves,
    { image: inkyImage },
  );
  const inkClone = blankSide(
    [region("wrap/div/main", OUTER), region("wrap/div/main/section[2]", HOLE)],
    inkLeaves,
    { image: flatImage },
  );
  const inkOnly = detectBlankRegions(inkSource, inkClone);
  check(
    "a region whose DOM is IDENTICAL on both sides and whose pixels went flat is REPORTED",
    inkOnly.regions.length === 1 &&
      inkOnly.regions[0]?.path === "div/main/section[2]",
    JSON.stringify(inkOnly.regions.map((r) => `${r.path}:${r.evidence}`)),
  );
  check(
    "…by the INK leg alone, and the DOM leg is recorded as having said nothing",
    inkOnly.regions[0]?.evidence === "ink" &&
      inkOnly.inkOnlyCount === 1 &&
      inkOnly.domOnlyCount === 0,
    `evidence=${inkOnly.regions[0]?.evidence} inkOnly=${inkOnly.inkOnlyCount} domOnly=${inkOnly.domOnlyCount}`,
  );
  check(
    "…and the same pair WITHOUT screenshots reports nothing, which is the DOM-only channel that graded the severance hero healthy",
    (() => {
      const domOnly = detectBlankRegions(
        blankSide(inkSource.regions as RegionBox[], inkLeaves),
        blankSide(inkClone.regions as RegionBox[], inkLeaves),
      );
      return domOnly.regions.length === 0 && !domOnly.inkAvailable;
    })(),
  );

  check(
    "the CLASSIFIER forwards both screenshots, so an ink-only hole reaches the rubric at BLOCKER",
    (() => {
      const reading = classifyBlank(inkSource, inkClone);
      return (
        reading !== undefined &&
        reading.firedAt === "BLOCKER" &&
        reading.value >= BLANK_REGION_BLOCKER_RATIO
      );
    })(),
    JSON.stringify(classifyBlank(inkSource, inkClone)),
  );
  check(
    "…and the same pair judged WITHOUT the screenshots does not reach the rubric at all",
    (() => {
      const reading = classifyBlank(
        blankSide(inkSource.regions as RegionBox[], inkLeaves),
        blankSide(inkClone.regions as RegionBox[], inkLeaves),
      );
      return reading !== undefined && reading.value === 0 && reading.firedAt === null;
    })(),
  );

  // THE MODAL COLOUR IS THE BIN'S MEAN, NOT ITS CENTRE. rgb(246,247,249) lands
  // in a 5-bit cell whose centre is rgb(244,244,252); ΔE*76 between them is
  // 2.5, over the 2.3 JND, so with the centre every pixel of a flat background
  // counted as ink, a healthy region read 100 % and `hobbang.net` produced two
  // BLOCKER-sized holes. The mean of the pixels in the bin cannot drift.
  const flatInk = inkInsideBox(image(1000, 3000, [246, 247, 249]), {
    left: 0,
    top: 1000,
    right: 1000,
    bottom: 1400,
  });
  check(
    "a flat rgb(246,247,249) region reads ~0 % ink and not 100 % (the bin-CENTRE bug)",
    flatInk.available && flatInk.inkRatio < 0.01,
    JSON.stringify(flatInk),
  );
  // AND THE LOOKUP TABLE MUST BE INDEXED BY AN INTEGER. `srgbToLab` reads a
  // 256-entry Float64Array; a fractional mean returns undefined, every distance
  // is NaN, every `NaN > JND` is false, and a photograph reports 0 % ink.
  const richInk = inkInsideBox(inkyImage, {
    left: 0,
    top: 1000,
    right: 1000,
    bottom: 1400,
  });
  check(
    "a dense region reads a real ink fraction and not 0 % (the NaN-from-a-fractional-mean bug)",
    richInk.available && richInk.inkRatio > 0.2,
    JSON.stringify(richInk),
  );

  // -- H15. THE INK LEG'S PRECONDITION -------------------------------------
  //
  // Ink reads a DOM-measured rectangle out of a separately taken picture. When
  // the page moved between the two, the rectangle names the wrong pixels and
  // the reading is not evidence of anything. MEASURED on `hobbang.net`: its
  // source census reaches y=5,574 on a 10,863 px page (51 %) because the bottom
  // half revealed itself after the probe and before the screenshot;
  // `main/section[10]`'s box said y=1,140 while its content was painted at
  // y=6,409 in that side's OWN screenshot, and ink compared a card grid against
  // a text list and reported a BLOCKER on a page with no hole in it.
  check(
    "inkTrustOf accepts a census that reaches the bottom of its own page",
    (() => {
      const trust = inkTrustOf(inkSource);
      return trust.ok && trust.reason === null && trust.domPixelCoverage > 0.95;
    })(),
    JSON.stringify(inkTrustOf(inkSource)),
  );
  const staleSource = blankSide(
    inkSource.regions as RegionBox[],
    [...paintLeaves(HOLE, 6), ...paintLeaves([0, 100, 1000, 900], 8)],
    { image: inkyImage },
  );
  check(
    "…and REFUSES one whose deepest paint is 47 % down its own page (the hobbang shape)",
    (() => {
      const trust = inkTrustOf(staleSource);
      return (
        !trust.ok &&
        trust.domPixelCoverage < REGION_INK_DOM_COVERAGE_MIN &&
        (trust.reason ?? "").indexOf("different layouts") !== -1
      );
    })(),
    JSON.stringify(inkTrustOf(staleSource)),
  );
  const withheld = detectBlankRegions(staleSource, inkClone);
  check(
    "a pair with one stale side loses the INK leg entirely and reports no ink hole",
    withheld.regions.length === 0 &&
      !withheld.inkAvailable &&
      (withheld.inkWithheldReason ?? "").indexOf("source:") === 0,
    `regions=${withheld.regions.length} reason=${withheld.inkWithheldReason}`,
  );
  check(
    "…and both sides' coverage is REPORTED, so the loss of sensitivity is visible and not silent",
    withheld.sourceDomPixelCoverage < REGION_INK_DOM_COVERAGE_MIN &&
      withheld.cloneDomPixelCoverage > 0.95,
    `source=${withheld.sourceDomPixelCoverage} clone=${withheld.cloneDomPixelCoverage}`,
  );
  check(
    "a screenshot of the wrong HEIGHT is refused: it is a picture of a different page",
    (() => {
      const trust = inkTrustOf(
        blankSide(inkSource.regions as RegionBox[], inkLeaves, {
          image: image(1000, 2000, [246, 247, 249]),
        }),
      );
      return !trust.ok && (trust.reason ?? "").indexOf("does not index") !== -1;
    })(),
  );
  check(
    "a screenshot WIDER than the viewport is accepted: a full-page capture of a horizontally overflowing page keeps the origin (severance @1100 is 1,280px wide for an 1,100px viewport)",
    (() => {
      const wide = inkBands([[1000, 1400]], 1280);
      const trust = inkTrustOf(
        blankSide(inkSource.regions as RegionBox[], inkLeaves, { image: wide }),
      );
      return trust.ok;
    })(),
  );
  check(
    "…and NARROWER is refused, because then the box is clipped rather than offset",
    !inkTrustOf(
      blankSide(inkSource.regions as RegionBox[], inkLeaves, {
        image: image(700, 3000, [246, 247, 249]),
      }),
    ).ok,
  );

  // -- H16. THE TWO LEGS ARE SELF-CONSISTENT -------------------------------
  //
  // A region populated only by INK is judged only by ink, and one populated
  // only by the DOM only by the DOM. Crossing them manufactures findings: at
  // @1100 four 257x113 cards on severance are DOM-populated by 2 leaves (under
  // the 3 the DOM leg requires) and INK-populated at 87 %, and judging their
  // DOM emptiness against an ink-only population reported four holes the clone
  // demonstrably paints (clone ink 79.6 %, 54.5 %, 19.8 %, 52.0 %).
  check(
    "a region flat on BOTH sides is not an ink hole, however empty it looks",
    detectBlankRegions(
      blankSide(inkSource.regions as RegionBox[], inkLeaves, { image: flatImage }),
      inkClone,
    ).regions.length === 0,
  );
  check(
    "the ENCLOSING region, inked and unchanged on both sides, is not reported — only the hole is",
    inkOnly.regions.every((r) => r.path !== "div/main"),
    JSON.stringify(inkOnly.regions.map((r) => r.path)),
  );
  check(
    "the ink leg alone cannot fire on a clone that RETAINED most of the source's ink",
    !cloneRegionIsBlankByInk(
      { available: true, samples: 1000, inkPixels: 400, inkRatio: 0.4, stride: 1 },
      { available: true, samples: 1000, inkPixels: 380, inkRatio: 0.38, stride: 1 },
    ) &&
      cloneRegionIsBlankByInk(
        { available: true, samples: 1000, inkPixels: 400, inkRatio: 0.4, stride: 1 },
        { available: true, samples: 1000, inkPixels: 20, inkRatio: 0.02, stride: 1 },
      ),
  );
  check(
    "an UNAVAILABLE ink reading is never read as a blank one",
    !cloneRegionIsBlankByInk(
      { available: true, samples: 1000, inkPixels: 400, inkRatio: 0.4, stride: 1 },
      { available: false, samples: 0, inkPixels: 0, inkRatio: 0, stride: 0 },
    ),
  );

  // -- H12. THE NEGATIVE REGRESSION: seoultone.kr / @1440 (Task 28.8 FAST item 1) -
  //
  // THE FALSE POSITIVE. `blank-region-ratio` fired BLOCKER at 0.5767 on this
  // pair. A human auditor then looked at the pixels
  // (docs/result/28.8/09-final-visual-audit.md §7) and found NO missing section
  // anywhere on the page: the largest blank band at 1440 is 183px of ordinary
  // section padding below a certificate carousel, and the doctor biography it
  // precedes is MORE complete on the clone than on the source, which hides two
  // credential lines behind an unfired scroll-reveal. The pair's honest grade
  // is MAJOR, on an unrelated text collision.
  //
  // The two regions that fired are loaded from a compact JSON fixture holding
  // the run's OWN recorded numbers — boxes, paint ratios, leaf counts and ink
  // ratios, verbatim from the artifact's channel note — so this check never
  // touches the run directory.
  const seoultone = JSON.parse(
    readFileSync(
      path.join(repoRootDir(), "scripts/fixtures/seoultone-1440-blank-regions.json"),
      "utf8",
    ),
  ) as {
    provenance: { recordedChannel: { value: number; blankedAreaPx: number } };
    regions: BlankRegion[];
  };
  const seoultoneViewport = 1440 * 900;
  check(
    "PRECONDITION: the fixture reproduces the run's own 0.5767 blanked ratio",
    Math.round(seoultone.regions.reduce((sum, r) => sum + r.areaPx, 0)) ===
      seoultone.provenance.recordedChannel.blankedAreaPx &&
      Math.abs(
        seoultone.regions.reduce((sum, r) => sum + r.areaPx, 0) / seoultoneViewport -
          seoultone.provenance.recordedChannel.value,
      ) < 0.0001,
  );
  check(
    "NEGATIVE: neither seoultone @1440 region corroborates ABSENT CONTENT — both keep every leaf the source has and ink like text that painted",
    seoultone.regions.length === 2 &&
      seoultone.regions.every((r) => !regionCorroboratesContentAbsence(r)),
    JSON.stringify(
      seoultone.regions.map((r) => `${r.path}:${regionCorroboratesContentAbsence(r)}`),
    ),
  );
  check(
    "NEGATIVE: …so 0.5767 of a viewport of blanked area is CAPPED at MINOR and cannot carry the pair to BLOCKER",
    blankRegionSeverityCap(0) === "MINOR",
    blankRegionSeverityCap(0),
  );
  check(
    "…and the regions are still REPORTED at full value: the cap demotes a finding, it never deletes one",
    seoultone.provenance.recordedChannel.value === 0.5767 &&
      seoultone.regions.every((r) => r.viewportAreaRatio > 0),
  );
  // POSITIVE CONTROLS ON THE SAME PREDICATE, so the cap cannot be passing by
  // simply never corroborating anything.
  const footer = seoultone.regions[0]!;
  check(
    "POSITIVE: the same region with the severance hero's shape — declared paint that did not arrive — DOES corroborate",
    regionCorroboratesContentAbsence({
      ...footer,
      clone: { ...footer.clone, paintRatio: 0.96 },
    }),
  );
  check(
    "POSITIVE: …and so does the same region once the DOM leg sees the leaves go",
    regionCorroboratesContentAbsence({ ...footer, evidence: "dom+ink" }) &&
      regionCorroboratesContentAbsence({ ...footer, mechanism: "absent" }),
  );
  check(
    "NEGATIVE: a source region with no text and no image leaves can never corroborate — whitespace has nothing to be absent",
    !regionCorroboratesContentAbsence({
      ...footer,
      evidence: "dom+ink",
      mechanism: "absent",
      source: { ...footer.source, textLeaves: 0, imageLeaves: 0 },
    }),
  );
  check(
    "the corroborated ratio still sets the band when the evidence is there: 0.25+ reaches BLOCKER, 0.10+ MAJOR",
    blankRegionSeverityCap(BLANK_REGION_BLOCKER_RATIO) === "BLOCKER" &&
      blankRegionSeverityCap(BLANK_REGION_MAJOR_RATIO) === "MAJOR" &&
      blankRegionSeverityCap(BLANK_REGION_MAJOR_RATIO - 0.0001) === "MINOR",
  );
  // AND END TO END: the seoultone SHAPE through the real classifier. Identical
  // DOM on both sides, the clone's band re-coloured rather than emptied, its
  // ink landing where text that painted normally lands.
  const SEO_HOLE: [number, number, number, number] = [0, 1000, 1000, 1400];
  const thinLines = (
    box: [number, number, number, number],
    count: number,
  ): LeafBox[] => {
    const [left, top, right, bottom] = box;
    const step = Math.floor((bottom - top) / (count + 1));
    return Array.from({ length: count }, (_unused, i) => ({
      key: `t:thin${i}-${left}-${top}`,
      kind: "text" as const,
      left: left + 5,
      right: right - 5,
      top: top + (i + 1) * step,
      bottom: top + (i + 1) * step + 8,
      chars: 30,
    }));
  };
  // INK_FOOTER keeps the DOM census reaching the bottom of the page, so the ink
  // leg's trust precondition holds — the same reason the fixture above carries it.
  const themedLeaves = [
    ...thinLines(SEO_HOLE, 4),
    ...paintLeaves([0, 100, 1000, 900], 8),
    ...INK_FOOTER,
  ];
  const themedSource = blankSide(
    [region("div/main", OUTER), region("div/main/footer", SEO_HOLE)],
    themedLeaves,
    // The SOURCE draws a dense coloured panel across the whole band, the way
    // seoultone's footer does: ink 33 %.
    { image: inkBands([[100, 900], [1000, 1400]]) },
  );
  const themedClone = blankSide(
    [region("wrap/div/main", OUTER), region("wrap/div/main/footer", SEO_HOLE)],
    themedLeaves,
    {
      image: image(1000, 3000, [246, 247, 249], (set) => {
        for (let y = 100; y < 900; y++) {
          for (let x = 0; x < 1000; x++) if ((x + y) % 3 === 0) set(x, y, 20, 20, 20);
        }
        // The clone draws the SAME FOUR TEXT LINES on plain ground instead of
        // on a panel. It inks where text inks — a few percent — not at zero,
        // and that is the whole difference from the severance hero above.
        for (const line of thinLines(SEO_HOLE, 4)) {
          for (let y = line.top; y < line.bottom; y++) {
            for (let x = line.left; x < Math.round((line.left + line.right) / 2); x++) {
              set(x, y, 20, 20, 20);
            }
          }
        }
      }),
    },
  );
  const themed = detectBlankRegions(themedSource, themedClone);
  check(
    "END TO END: the seoultone shape — identical DOM, clone band re-coloured but still inking at text density — is still REPORTED",
    themed.regions.length === 1 && themed.regions[0]?.evidence === "ink",
    JSON.stringify(
      themed.regions.map(
        (r) =>
          `${r.path}:${r.evidence}:clonePaint=${r.clone.paintRatio}:cloneInk=${r.cloneInk.inkRatio}`,
      ),
    ),
  );
  check(
    "…and is NOT corroborated, so the classifier reports it BELOW BLOCKER",
    themed.corroboratedCount === 0 &&
      themed.corroboratedRatio === 0 &&
      classifyBlank(themedSource, themedClone)?.firedAt !== "BLOCKER",
    JSON.stringify({
      corroborated: themed.corroboratedCount,
      firedAt: classifyBlank(themedSource, themedClone)?.firedAt,
      clonePaint: themed.regions[0]?.clone.paintRatio,
      cloneInk: themed.regions[0]?.cloneInk.inkRatio,
    }),
  );
  check(
    "…while the ink-only hole whose declared paint never arrived still reaches BLOCKER, corroborated",
    inkOnly.corroboratedCount === 1 &&
      inkOnly.corroboratedRatio === inkOnly.ratio &&
      classifyBlank(inkSource, inkClone)?.firedAt === "BLOCKER",
    JSON.stringify({
      corroborated: inkOnly.corroboratedCount,
      firedAt: classifyBlank(inkSource, inkClone)?.firedAt,
    }),
  );
}

// ---------------------------------------------------------------------------
// H14. TEXT OVER TEXT inside a compact critical block (Task 28.8 FAST, item 2)
// ---------------------------------------------------------------------------
//
// WHY IT EXISTS. `overlap-excess-ratio` divides intersection AREA by ONE
// VIEWPORT and sums over the document. Two collided line boxes are a few
// thousand px² on a page of tens of millions, so the most widespread defect in
// the 28.8 corpus — 1 blocker and 4 majors across two unrelated sites, CJK text
// overprinting the row beneath — could not move it and did not.
//
// The measured shapes this reproduces (docs/result/28.8/09-final-visual-audit.md
// § D2): seoultone's 진료시간 block, where every closing time is displaced onto
// the following row's LABEL so a visitor cannot tell when the clinic shuts, and
// hobbang's footer link list, where wrapped tails pile onto the row beneath.

/** One line box, `chars` wide in intent, at an exact rectangle. */
function textLine(
  key: string,
  left: number,
  top: number,
  right: number,
  height = 20,
  chars = 12,
): LeafBox {
  return { key, kind: "text", left, right, top, bottom: top + height, chars };
}

/** `count` clean rows down a box — nothing intersects anything. */
function cleanRows(prefix: string, top: number, count: number): LeafBox[] {
  return Array.from({ length: count }, (_unused, i) =>
    textLine(`t:${prefix}${i}`, 20, top + i * 30, 300),
  );
}

/** The same rows with each value line dropped onto the NEXT row's label, which
 *  is the seoultone 진료시간 geometry. Emits `count + 1` labels and `count`
 *  values, so it yields EXACTLY `count` collided pairs: each value covers 16 of
 *  the following label's 20 px and nothing else intersects anything. */
function collidedRows(prefix: string, top: number, count: number): LeafBox[] {
  const rows: LeafBox[] = [];
  for (let i = 0; i <= count; i++) {
    rows.push(textLine(`t:${prefix}label${i}`, 20, top + i * 30, 160));
  }
  for (let i = 0; i < count; i++) {
    // the value belonging to row i, displaced down onto row i+1's label
    rows.push(textLine(`t:${prefix}value${i}`, 20, top + i * 30 + 26, 160));
  }
  return rows;
}

function testCriticalTextCollision(): void {
  section("H14. text over text in a compact critical block (Task 28.8 FAST item 2)");

  const VIEWPORT_H = 900;
  const footer = region("div/footer", [0, 2000, 1000, 2300], { tag: "footer" });
  const prose = region("div/main/section[3]", [0, 400, 1000, 1000], { tag: "section" });

  // -- POSITIVE: four collided rows in a footer ----------------------------
  const collided = collidedRows("hours", 2020, 4);
  const positive = detectTextCollisions([footer], collided, {
    innerHeight: VIEWPORT_H,
    maxSamples: 8,
  });
  check(
    "four value lines dropped onto the next row's label inside a <footer> are COUNTED as rows",
    positive.criticalRegions === 1 && positive.collidingRows === 4,
    JSON.stringify({ rows: positive.collidingRows, regions: positive.criticalRegions }),
  );
  check(
    "…and the count is a COUNT, never an area over a page height",
    positive.collidingRegions === 1 &&
      positive.worst.every((row) => row.coverage >= TEXT_COLLISION_MIN_INTERSECTION_RATIO),
    JSON.stringify(positive.worst.slice(0, 2)),
  );
  check(
    "…and every offender names both text nodes and where to find them",
    describeTextCollisions(positive, 1).indexOf("footer div/footer at y=") !== -1,
    describeTextCollisions(positive, 1),
  );

  // -- NEGATIVE 1: the same collision OUTSIDE a critical region ------------
  check(
    "NEGATIVE: the identical collision inside a plain <section> is NOT counted — this channel is about blocks a reader must read, and prose overlap is graded by overlap-excess-ratio",
    detectTextCollisions([prose], collidedRows("prose", 420, 4), {
      innerHeight: VIEWPORT_H,
      maxSamples: 8,
    }).collidingRows === 0,
  );

  // -- NEGATIVE 2: clean rows in the same critical region ------------------
  check(
    "NEGATIVE: rows that merely sit close together in the same <footer> are NOT a collision",
    detectTextCollisions([footer], cleanRows("clean", 2020, 6), {
      innerHeight: VIEWPORT_H,
      maxSamples: 8,
    }).collidingRows === 0,
  );

  // -- NEGATIVE 3: a critical TAG that is not COMPACT ----------------------
  check(
    "NEGATIVE: a <form> taller than 75% of a viewport is not a compact block and is not examined — otherwise the count is averaged over a page height again",
    !isCriticalRegion(
      region("div/form", [0, 0, 1000, 800], { tag: "form" }),
      VIEWPORT_H,
    ) && isCriticalRegion(region("div/form", [0, 0, 1000, 600], { tag: "form" }), VIEWPORT_H),
  );

  // -- NEGATIVE 4: the pair rules ------------------------------------------
  const a = textLine("t:a", 0, 0, 100);
  check(
    "NEGATIVE: a leaf never collides with itself, and two leaves sharing a key are one node measured twice",
    !textLeavesCollide(a, a) && !textLeavesCollide(a, { ...a, left: 10 }),
  );
  check(
    "NEGATIVE: an IMAGE under text is not a text collision — that is overlap-excess-ratio's population",
    !textLeavesCollide(a, { ...a, key: "i:img", kind: "image", chars: 0 }),
  );
  check(
    "NEGATIVE: a 1px touch is not a collision; a quarter of the smaller line box is",
    !textLeavesCollide(a, textLine("t:b", 0, 19, 100)) &&
      textLeavesCollide(a, textLine("t:b", 0, 14, 100)),
  );
  check(
    "the threshold is on the SMALLER box, so a short label buried under a long line still fires",
    textLeavesCollide(
      textLine("t:long", 0, 0, 800),
      textLine("t:short", 0, 8, 60),
    ),
  );

  // -- THE CHANNEL: relative to the source, and never averaged -------------
  const sideWith = (regions: RegionBox[], leaves: LeafBox[]): BlankRegionSide =>
    blankSide(regions, leaves, { innerHeight: VIEWPORT_H, scrollHeight: 20000 });
  const collisionChannel = (
    sourceLeaves: LeafBox[],
    cloneLeaves: LeafBox[],
  ): ChannelReading | undefined =>
    classifyBlankPair(
      sideWith([footer], sourceLeaves),
      sideWith([footer], cloneLeaves),
    ).channels.find((channel) => channel.channel === "critical-text-collision-rows");

  check(
    "POSITIVE: a clone that collides four footer rows a clean source does not reaches BLOCKER",
    collisionChannel(cleanRows("clean", 2020, 6), collided)?.firedAt === "BLOCKER",
    JSON.stringify(collisionChannel(cleanRows("clean", 2020, 6), collided)),
  );
  check(
    "POSITIVE: one collided row — the 진료시간 shape, one fact the reader gets wrong — is MAJOR",
    collisionChannel(cleanRows("clean", 2020, 6), collidedRows("hours", 2020, 1))
      ?.firedAt === "MAJOR",
    JSON.stringify(
      collisionChannel(cleanRows("clean", 2020, 6), collidedRows("hours", 2020, 1)),
    ),
  );
  check(
    "NEGATIVE: a SOURCE that already overprints its own footer cancels — the clone is charged only for what it added",
    collisionChannel(collided, collided)?.firedAt === null &&
      collisionChannel(collided, collided)?.value === 0,
    JSON.stringify(collisionChannel(collided, collided)),
  );
  check(
    "NEGATIVE: a clean clone on a clean source fires nothing and still records the channel",
    (() => {
      const reading = collisionChannel(
        cleanRows("clean", 2020, 6),
        cleanRows("clean", 2020, 6),
      );
      return reading !== undefined && reading.value === 0 && reading.firedAt === null;
    })(),
  );
  check(
    "the channel's note states how a CRITICAL region is identified, and it is by tag — never by hostname",
    (() => {
      const note = collisionChannel(cleanRows("c", 2020, 6), collided)?.note ?? "";
      return (
        note.indexOf("footer") !== -1 &&
        note.indexOf("generic HTML structure only") !== -1 &&
        note.indexOf("never a hostname") !== -1
      );
    })(),
  );
}

/** Run the classifier over two region-bearing sides and return the channel.
 *  Screenshots are forwarded when the sides carry them, which is how the
 *  classifier's own wiring of the INK leg gets exercised rather than assumed. */
function classifyBlankPair(
  sourceSide: BlankRegionSide,
  cloneSide: BlankRegionSide,
): Classification {
  const build = (side: BlankRegionSide): SideMeasurement =>
    sideFixture({
      regions: side.regions as RegionBox[],
      leaves: side.leaves as LeafBox[],
      leavesTruncated: side.leavesTruncated,
      regionAccounting: side.regionAccounting,
      innerWidth: side.innerWidth,
      innerHeight: side.innerHeight,
      scrollHeight: side.scrollHeight,
    });
  return classifyPair({
    source: build(sourceSide),
    clone: build(cloneSide),
    correspondence: correspond(
      { leaves: sourceSide.leaves as LeafBox[], innerWidth: sourceSide.innerWidth },
      { leaves: cloneSide.leaves as LeafBox[] },
    ),
    columns: compareColumns(build(sourceSide), build(cloneSide)),
    missing: missingText(build(sourceSide), build(cloneSide)),
    pixels: { available: false, unavailableReason: "not decoded in this fixture" },
    ...(sourceSide.image ? { sourceImage: sourceSide.image } : {}),
    ...(cloneSide.image ? { cloneImage: cloneSide.image } : {}),
  });
}

function classifyBlank(
  sourceSide: BlankRegionSide,
  cloneSide: BlankRegionSide,
): ChannelReading | undefined {
  return classifyBlankPair(sourceSide, cloneSide).channels.find(
    (channel) => channel.channel === "blank-region-ratio",
  );
}

// ---------------------------------------------------------------------------
// H13. the region CENSUS, in a real browser: its accounting must conserve
// ---------------------------------------------------------------------------

const REGION_HTML = `<!doctype html><html><head><meta charset="utf-8"><title>regions</title><style>
 body{margin:0;font:16px/1.4 system-ui}
 .band{width:100%;height:300px}
 .full{width:100%;height:400px;background:#eef}
 .half{width:50%;height:200px;background:#efe;float:left}
 .tiny{width:60px;height:20px;background:#fee}
 .narrow{width:60px;height:220px;background:#fef}
 .short{width:100%;height:12px;background:#ffe}
 .wrap{width:100%;height:400px}
</style></head><body>
 <header><nav><a href="/a">one</a> <a href="/b">two</a></nav></header>
 <main>
   <section class="full"><p>alpha beta gamma delta epsilon zeta eta theta</p><p>second line of prose</p></section>
   <div class="wrap"><div class="wrap"><div class="wrap"><p>triple wrapper, one visual box</p></div></div></div>
   <section class="band"><div class="half"><p>left half of a two-up</p></div><div class="half"><p>right half of a two-up</p></div></section>
   <div class="tiny">x</div>
   <div class="narrow"><p>a</p><p>b</p></div>
   <div class="short">y</div>
   <img src="data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7" style="width:100%;height:120px">
 </main>
 <footer><p>footer prose</p></footer>
</body></html>`;

async function testRegionCensus(browser: Browser): Promise<void> {
  section("H13. region census — its own accounting conserves (Task 28.75)");
  const fixtures = await serveFixtures({ "/regions": REGION_HTML });
  try {
    const side = (
      await captureSide({
        browser,
        url: `${fixtures.origin}/regions`,
        width: 1000,
        screenshotFile: "regions.png",
      })
    ).measurement;
    const accounting = side.regionAccounting;
    check(
      "selected + rejected === examined: no candidate is silently dropped",
      accounting.selected + accounting.rejected === accounting.examined &&
        accounting.selected === side.regions.length,
      JSON.stringify(accounting),
    );
    check(
      "…and the per-reason histogram sums back to the rejected total",
      accounting.rejectedByReason.reduce((sum, row) => sum + row.count, 0) ===
        accounting.rejected,
      JSON.stringify(accounting.rejectedByReason),
    );
    check(
      "…every reason it reports is one of the enumerated ones",
      accounting.rejectedByReason.every(
        (row) =>
          (REGION_REJECTION_REASONS as readonly string[]).indexOf(row.reason) !== -1,
      ),
      JSON.stringify(accounting.rejectedByReason.map((r) => r.reason)),
    );
    check(
      "the census actually selects the page's real sections",
      side.regions.length >= 3 && side.regions.length < MAX_REGIONS,
      `${side.regions.length} regions: ${side.regions.map((r) => r.path).join(", ")}`,
    );
    check(
      "a chain of three wrappers with ONE visual box collapses to one region",
      accounting.rejectedByReason.some(
        (row) => row.reason === "duplicate-of-selected-ancestor" && row.count >= 2,
      ),
      JSON.stringify(accounting.rejectedByReason),
    );
    check(
      "a full-width <img> is refused as a MEDIA element: a picture is content, not a container",
      accounting.rejectedByReason.some((row) => row.reason === "media-element"),
      JSON.stringify(accounting.rejectedByReason),
    );
    check(
      "a 60x20 box is refused for being too narrow, and a 12px-tall strip for being too short",
      accounting.rejectedByReason.some((row) => row.reason === "too-narrow") &&
        accounting.rejectedByReason.some((row) => row.reason === "too-short"),
      JSON.stringify(accounting.rejectedByReason),
    );
    check(
      "every selected region carries the four facts the detector reads",
      side.regions.every(
        (r) =>
          r.right > r.left &&
          r.bottom > r.top &&
          typeof r.visibleDescendants === "number" &&
          typeof r.textChars === "number" &&
          typeof r.imageElements === "number",
      ),
    );
    check(
      "a region's subtree character count is inside the page's visible-text total, not beside it",
      side.regions.every((r) => r.textChars <= side.visibleTextChars),
    );
    // THE ONE PLACE A NUMBER IS WRITTEN TWICE, AND THE GUARD THAT PINS IT.
    // `probeInBrowser` is serialized with `Function.prototype.toString` and run
    // inside the page, so its fallback CANNOT reference the exported record;
    // and making these `ProbeOptions` fields required would edit `capture.ts`,
    // which another lane owns. The literal is therefore read back out of the
    // probe's own (bundler-minified, so parsed numerically rather than by
    // string match) source and compared with the documented constants.
    const probeSource = probeInBrowser.toString();
    const literalStart = probeSource.indexOf("options.regionCensus");
    const literal = probeSource.slice(
      literalStart,
      probeSource.indexOf("}", literalStart) + 1,
    );
    check(
      "the probe carries an in-page region-census literal at all",
      literalStart !== -1 && literal.length > 0,
    );
    for (const [key, value] of Object.entries(REGION_CENSUS_DEFAULTS)) {
      const match = new RegExp(`${key}\\s*:\\s*(-?[0-9]*\\.?[0-9]+)`).exec(literal);
      check(
        `the probe's in-page default for ${key} is still the documented ${value}`,
        match !== null && Number(match[1]) === value,
        `literal=${match?.[1]} constant=${value}`,
      );
    }
  } finally {
    await fixtures.close();
  }
}

// ---------------------------------------------------------------------------
// L1. a broken image asset never erases a geometric collapse (Task 28.75)
// ---------------------------------------------------------------------------

/**
 * WHAT WAS WRONG. `classifyOverlapPair` read the image LOAD FLAG first:
 *
 *     if (a.loaded === false || b.loaded === false) return "failed-image-layer";
 *
 * before any geometry or ownership test, and it fired when EITHER leaf failed.
 * So a genuine layout collapse — two different visual owners piled on top of
 * each other — was demoted out of the BLOCKER-capable `overlap-excess-ratio`
 * into the MAJOR-only `image-layer-state` whenever one of the two happened to
 * be an image whose asset did not decode. A broken image is the normal early
 * failure mode of a fresh public site, so the guard fired hardest exactly where
 * a false negative costs most.
 *
 * The checks below pin BOTH halves: the collapse must survive a broken
 * participant, and the crossfade twin must still be demoted. The last group is
 * the MUTATION PROOF that the demoted area can now move a verdict.
 */
function testBrokenImageNeverErasesOverlap(): void {
  section("L1. a broken image asset never erases a geometric collapse (item L1)");

  // -- 1. THE POSITIVE: a real collapse with a broken participant -----------
  const hero = imageLeaf({ key: "i:img|hero", ownerKey: "div/hero" });
  const brokenBanner = imageLeaf({
    key: "i:img|banner",
    ownerKey: "div/banner",
    loaded: false,
    left: 40,
    right: 440,
    top: 30,
    bottom: 330,
  });
  check(
    "THE DEFECT: two DIFFERENT owners colliding is a true overlap even though one asset is broken",
    classifyOverlapPair(hero, brokenBanner) === "true-overlap",
    classifyOverlapPair(hero, brokenBanner),
  );
  check(
    "…and it reads the same with the two leaves in the other order: the rule is symmetric",
    classifyOverlapPair(brokenBanner, hero) === "true-overlap",
  );
  check(
    "…and the SAME pair with both assets decoded classifies identically — the load flag " +
      "no longer decides anything outside the one-layer population",
    classifyOverlapPair(hero, { ...brokenBanner, loaded: true }) ===
      classifyOverlapPair(hero, brokenBanner),
  );

  // -- 2. it survives the sweep, with its area ------------------------------
  const budget = {
    maxOverlapSamples: 8,
    maxOverlapComparisonsPerLeaf: 2000,
    innerWidth: 1000,
    innerHeight: 900,
  };
  const collapse = computeOverlapAccounting([hero, brokenBanner], budget);
  check(
    "the sweep keeps the collision's area in the TRUE overlap total, not in the demoted one",
    collapse.trueOverlapPairCount === 1 &&
      collapse.trueOverlapArea > 0 &&
      collapse.failedImageLayerOverlapPairCount === 0 &&
      collapse.failedImageLayerOverlapArea === 0,
    JSON.stringify({
      real: collapse.trueOverlapPairCount,
      realArea: collapse.trueOverlapArea,
      demoted: collapse.failedImageLayerOverlapPairCount,
    }),
  );
  check(
    "…and the broken leaf is STILL counted, so image-layer-state keeps its own evidence",
    collapse.failedImageLeafCount === 1 && collapse.loadedImageLeafCount === 1,
    JSON.stringify({
      failed: collapse.failedImageLeafCount,
      loaded: collapse.loadedImageLeafCount,
    }),
  );

  // -- 3. through the classifier, it reaches BLOCKER ------------------------
  const severe = classifyFixture({
    clone: {
      imageLeafCount: 4,
      loadedImageLeafCount: 3,
      failedImageLeafCount: 1,
      overlapArea: 180_000,
      overlapAreaRatio: 0.2,
      overlapPairCount: 1,
      trueOverlapArea: 180_000,
      trueOverlapAreaRatio: 0.2,
      trueOverlapPairCount: 1,
    },
    sourceHttpStatus: 200,
    cloneHttpStatus: 200,
  });
  check(
    "A REAL GEOMETRIC OVERLAP WITH A BROKEN PARTICIPANT STILL REACHES BLOCKER",
    severe.findings.some(
      (finding) =>
        finding.channel === "overlap-excess-ratio" && finding.severity === "BLOCKER",
    ) && severe.verdict === "BLOCKER",
    severe.findings.map((f) => `${f.channel}:${f.severity}`).join(", "),
  );
  check(
    "…and the broken asset is reported too, on its own channel, so both faults are visible",
    severe.findings.some(
      (finding) =>
        finding.channel === "image-layer-state" && finding.severity === "MAJOR",
    ),
    severe.findings.map((f) => f.channel).join(", "),
  );

  // -- 4. THE DISCRIMINATING TWIN: a genuine crossfade is still demoted -----
  //
  // This is the check that stops the fix from becoming "count everything".
  // Same picture, same visual owner, same box to within the tolerance: ONE
  // thing on screen, and it must stay out of the overlap channel.
  const crossfadeA = imageLeaf({ key: "i:img|slide", ownerKey: "div/slider/picture" });
  const crossfadeB = imageLeaf({
    key: "p:img|div/slider/picture/img",
    ownerKey: "div/slider/picture",
    left: 1,
    right: 401,
    top: 1,
    bottom: 301,
  });
  check(
    "THE TWIN: a genuine crossfade — same owner, same box, both decoded — is STILL a duplicate stack",
    classifyOverlapPair(crossfadeA, crossfadeB) === "duplicate-image-stack",
    classifyOverlapPair(crossfadeA, crossfadeB),
  );
  const crossfade = computeOverlapAccounting([crossfadeA, crossfadeB], budget);
  check(
    "…and the sweep still keeps its area OUT of the true-overlap total",
    crossfade.duplicateImageStackPairCount === 1 &&
      crossfade.trueOverlapPairCount === 0,
    JSON.stringify(crossfade),
  );
  check(
    "…and one layer of that same crossfade failing to decode keeps it demoted, on the " +
      "resource channel, so one fault is never reported under two names",
    classifyOverlapPair(crossfadeA, { ...crossfadeB, loaded: false }) ===
      "failed-image-layer",
    classifyOverlapPair(crossfadeA, { ...crossfadeB, loaded: false }),
  );
  check(
    "…the demotion still needs BOTH conditions: same owner in a DIFFERENT box is a real overlap",
    classifyOverlapPair(crossfadeA, {
      ...crossfadeB,
      left: 60,
      right: 460,
      top: 40,
      bottom: 340,
    }) === "true-overlap",
  );
  check(
    "…and a DIFFERENT owner in the SAME box is a real overlap, broken or not",
    classifyOverlapPair(crossfadeA, {
      ...crossfadeB,
      key: "i:img|other",
      ownerKey: "div/other",
    }) === "true-overlap" &&
      classifyOverlapPair(crossfadeA, {
        ...crossfadeB,
        key: "i:img|other",
        ownerKey: "div/other",
        loaded: false,
      }) === "true-overlap",
  );

  // -- 5. THE MUTATION PROOF: the demoted area can move a verdict -----------
  //
  // 28.7's honest admission was that all four demotion counters read 0 on all
  // four canary runs, so every guard was fixture-verified and never
  // corpus-verified. That is still true of the demotion POPULATIONS (see the
  // report), and it is exactly why the demoted area must be gradeable at all:
  // a guard that only ever subtracts, and whose subtraction nothing can
  // question, is how an instrument quietly stops finding things.
  //
  // The mutation: give the CLONE a large duplicate-stack area the SOURCE does
  // not have. The verdict must move.
  const baseline = classifyFixture({ sourceHttpStatus: 200, cloneHttpStatus: 200 });
  check(
    "MUTATION PRECONDITION: the untouched fixture grades PASS with no findings",
    baseline.verdict === "PASS" && baseline.findings.length === 0,
    `${baseline.verdict} / ${baseline.findings.length} finding(s)`,
  );
  const invented = classifyFixture({
    clone: {
      overlapArea: 180_000,
      overlapAreaRatio: 0.2,
      overlapPairCount: 3,
      duplicateImageStackArea: 180_000,
      duplicateImageStackAreaRatio: 0.2,
      duplicateImageStackPairCount: 3,
    },
    sourceHttpStatus: 200,
    cloneHttpStatus: 200,
  });
  check(
    "MUTATION: a demoted area the SOURCE does not carry moves the verdict PASS → BLOCKER",
    baseline.verdict === "PASS" &&
      invented.verdict === "BLOCKER" &&
      invented.findings.some(
        (finding) =>
          finding.channel === "overlap-demoted-excess-ratio" &&
          finding.severity === "BLOCKER",
      ),
    `${baseline.verdict} → ${invented.verdict}: ${invented.findings
      .map((f) => `${f.channel}:${f.severity}`)
      .join(", ")}`,
  );
  check(
    "…and the ledger says the finding MOVED CHANNEL rather than disappeared",
    invented.demotions?.overlapFindingDemoted === true &&
      invented.demotions?.demotedOverlapRegraded === true &&
      near(invented.demotions?.demotedOverlapExcessRatio ?? -1, 0.2, 1e-6),
    JSON.stringify(invented.demotions),
  );
  check(
    "…and the primary overlap channel is NOT also fired, so one area is never charged twice",
    invented.findings.filter(
      (finding) => finding.channel === "overlap-excess-ratio",
    ).length === 0,
    invented.findings.map((f) => f.channel).join(", "),
  );

  // NEGATIVE CONTROL — the same demoted area on BOTH sides. A `<picture>` that
  // renders as two layers, or a crossfade, is platform behaviour and appears on
  // the source too; it must cancel exactly.
  const corroborated = classifyFixture({
    source: {
      overlapArea: 180_000,
      overlapAreaRatio: 0.2,
      overlapPairCount: 3,
      duplicateImageStackArea: 180_000,
      duplicateImageStackAreaRatio: 0.2,
      duplicateImageStackPairCount: 3,
    },
    clone: {
      overlapArea: 180_000,
      overlapAreaRatio: 0.2,
      overlapPairCount: 3,
      duplicateImageStackArea: 180_000,
      duplicateImageStackAreaRatio: 0.2,
      duplicateImageStackPairCount: 3,
    },
    sourceHttpStatus: 200,
    cloneHttpStatus: 200,
  });
  check(
    "NEGATIVE CONTROL: the SAME demoted area on both sides cancels and raises nothing",
    corroborated.findings.every(
      (finding) => finding.channel !== "overlap-demoted-excess-ratio",
    ) && corroborated.demotions?.demotedOverlapRegraded === false,
    JSON.stringify({
      findings: corroborated.findings.map((f) => f.channel),
      demotions: corroborated.demotions,
    }),
  );
  check(
    "…and the SOURCE stacking MORE than the clone can never fire it either (the direction is one-way)",
    classifyFixture({
      source: {
        overlapArea: 360_000,
        overlapAreaRatio: 0.4,
        overlapPairCount: 6,
        duplicateImageStackArea: 360_000,
        duplicateImageStackAreaRatio: 0.4,
        duplicateImageStackPairCount: 6,
      },
      clone: {
        overlapArea: 90_000,
        overlapAreaRatio: 0.1,
        overlapPairCount: 1,
        duplicateImageStackArea: 90_000,
        duplicateImageStackAreaRatio: 0.1,
        duplicateImageStackPairCount: 1,
      },
      sourceHttpStatus: 200,
      cloneHttpStatus: 200,
    }).findings.every(
      (finding) => finding.channel !== "overlap-demoted-excess-ratio",
    ),
  );
  check(
    "the channel's bands ARE the overlap channel's own bands, not a second tuned scale",
    (() => {
      const reading = invented.channels.find(
        (channel) => channel.channel === "overlap-demoted-excess-ratio",
      );
      return reading?.threshold === OVERLAP_BLOCKER_EXCESS_RATIO;
    })(),
    JSON.stringify(
      invented.channels.find((c) => c.channel === "overlap-demoted-excess-ratio"),
    ),
  );

  // -- 6. the coverage ledger carries the re-grade ---------------------------
  const ledger = accountForCoverage(
    [
      { ...populationPair(1, 1440, 500), classification: invented },
      { ...populationPair(2, 1100, 500), classification: corroborated },
    ],
    "clone",
    { untestedPairs: 0, demotedFindings: 0 },
  );
  check(
    "the run's coverage ledger counts the pairs on which the demoted area was RE-GRADED",
    ledger.coverage.overlapDemotionsRegraded === 1 &&
      // The corroborated pair demotes the SAME area on both sides, so its
      // undemoted excess is 0 and no finding was removed there: 1 pair had a
      // finding taken off, and it is the same pair on which the demoted area
      // was re-graded. That equality is the ledger's whole point.
      ledger.coverage.overlapFindingsDemoted === 1,
    JSON.stringify({
      regraded: ledger.coverage.overlapDemotionsRegraded,
      demoted: ledger.coverage.overlapFindingsDemoted,
    }),
  );
}

// ---------------------------------------------------------------------------
// L3. the pixel diff no longer drops the band it is investigating (28.75)
// ---------------------------------------------------------------------------

/**
 * WHAT WAS WRONG. `gatePixels` compared `min(widths) x min(heights)` anchored
 * top-left and said nothing about the remainder. On a horizontally overflowing
 * page the remainder IS the offscreen band the frozen-width defect produces —
 * `linear.app / @700` pairs a 700px source with an 862px clone,
 * `gs.severance.healthcare /gs/index.do @1100` a 1280px source with an 1100px
 * clone, `interiorbay.co.kr / @390` a 1525px source with a 390px clone — so the
 * one region under investigation was the one region guaranteed to be excluded
 * from the pixel evidence.
 *
 * The response is option (A): keep the common canvas, and report the excess
 * band explicitly as its own quantity, in area and in INK, with a band on it.
 */
function testUncomparedPixelBand(): void {
  section("L3. the pixel diff accounts for the band it cannot compare (item L3)");

  const white: [number, number, number] = [255, 255, 255];
  const equal = gatePixels(image(60, 40, white), image(60, 40, white));
  check(
    "PRECONDITION: two equal-sized captures have no uncompared band at all",
    equal.widthMismatchPx === 0 &&
      equal.heightMismatchPx === 0 &&
      equal.sourceHorizontalBandPixels === 0 &&
      equal.cloneHorizontalBandPixels === 0 &&
      equal.horizontalBandInkRatio === 0 &&
      equal.comparedAreaRatio === 1,
    JSON.stringify({
      w: equal.widthMismatchPx,
      band: equal.cloneHorizontalBandPixels,
      area: equal.comparedAreaRatio,
    }),
  );

  // THE REAL SHAPE, at fixture scale: a 100px source beside a 160px clone whose
  // extra 60px carry content. This is `linear.app / @700` (700 vs 862) in
  // miniature, and the extra band is exactly what a frozen width produces.
  const narrowSource = image(100, 40, white);
  const wideClone = image(160, 40, white, (set) => {
    for (let y = 5; y < 35; y++) {
      for (let x = 105; x < 155; x++) set(x, y, 0, 0, 0);
    }
  });
  const mismatched = gatePixels(narrowSource, wideClone);
  check(
    "BOTH ACTUAL CAPTURE WIDTHS are carried, so a reader can see the mismatch",
    mismatched.sourceImageWidth === 100 &&
      mismatched.cloneImageWidth === 160 &&
      mismatched.comparedWidth === 100 &&
      mismatched.widthMismatchPx === 60,
    JSON.stringify({
      source: mismatched.sourceImageWidth,
      clone: mismatched.cloneImageWidth,
      compared: mismatched.comparedWidth,
    }),
  );
  check(
    "THE BAND IS ACCOUNTED FOR NUMERICALLY: 60px x 40 rows on the clone, 0 on the source",
    mismatched.cloneHorizontalBandPixels === 60 * 40 &&
      mismatched.sourceHorizontalBandPixels === 0,
    JSON.stringify({
      clone: mismatched.cloneHorizontalBandPixels,
      source: mismatched.sourceHorizontalBandPixels,
    }),
  );
  check(
    "…and its INK is counted: the 50x30 block inside it is 1,500 pixels",
    mismatched.cloneHorizontalBandInkPixels === 50 * 30,
    String(mismatched.cloneHorizontalBandInkPixels),
  );
  check(
    "CONSERVATION: compared area x2 + every band pixel === the two captures' total area, " +
      "so no pixel of either capture is unaccounted for",
    2 * mismatched.overlapPixels +
      mismatched.sourceHorizontalBandPixels +
      mismatched.cloneHorizontalBandPixels +
      mismatched.sourceVerticalBandPixels +
      mismatched.cloneVerticalBandPixels ===
      mismatched.sourceImageWidth * mismatched.sourceImageHeight +
        mismatched.cloneImageWidth * mismatched.cloneImageHeight,
    JSON.stringify({
      compared: mismatched.overlapPixels,
      bands: [
        mismatched.sourceHorizontalBandPixels,
        mismatched.cloneHorizontalBandPixels,
        mismatched.sourceVerticalBandPixels,
        mismatched.cloneVerticalBandPixels,
      ],
    }),
  );
  check(
    "…and the same conservation holds when the mismatch is on BOTH axes and on both sides",
    (() => {
      const g = gatePixels(image(120, 90, white), image(70, 140, white));
      return (
        2 * g.overlapPixels +
          g.sourceHorizontalBandPixels +
          g.cloneHorizontalBandPixels +
          g.sourceVerticalBandPixels +
          g.cloneVerticalBandPixels ===
          120 * 90 + 70 * 140 &&
        g.comparedWidth === 70 &&
        g.comparedHeight === 90 &&
        g.widthMismatchPx === 50 &&
        g.heightMismatchPx === 50
      );
    })(),
  );

  // THE DISCRIMINATOR: the same geometry with a BLANK band. A strip of page
  // background hides nothing, and the channel must say so.
  const blankBandClone = image(160, 40, white);
  const blankBand = gatePixels(narrowSource, blankBandClone);
  check(
    "a band of pure page background carries ZERO ink, however wide it is",
    blankBand.cloneHorizontalBandPixels === 60 * 40 &&
      blankBand.cloneHorizontalBandInkPixels === 0 &&
      blankBand.horizontalBandInkRatio === 0,
    JSON.stringify({
      pixels: blankBand.cloneHorizontalBandPixels,
      ink: blankBand.cloneHorizontalBandInkPixels,
    }),
  );

  // THE VERTICAL BAND is measured and kept separate, because an unequal page
  // HEIGHT is already a finding on the scroll-height channels.
  const taller = gatePixels(
    image(100, 40, white),
    image(100, 90, white, (set) => {
      for (let y = 50; y < 80; y++) {
        for (let x = 10; x < 90; x++) set(x, y, 0, 0, 0);
      }
    }),
  );
  check(
    "the VERTICAL band is measured separately and its ink is counted too",
    taller.cloneVerticalBandPixels === 100 * 50 &&
      taller.cloneVerticalBandInkPixels === 80 * 30 &&
      taller.horizontalBandInkRatio === 0 &&
      taller.verticalBandInkRatio > 0,
    JSON.stringify({
      vertical: taller.cloneVerticalBandPixels,
      ink: taller.cloneVerticalBandInkPixels,
    }),
  );

  // -- through the classifier ----------------------------------------------
  const withGate = (gate: ReturnType<typeof gatePixels>): Classification =>
    classifyPair({
      source: sideFixture(),
      clone: sideFixture(),
      correspondence: correspond({ leaves: [], innerWidth: 1000 }, { leaves: [] }),
      columns: compareColumns(sideFixture(), sideFixture()),
      missing: missingText(sideFixture(), sideFixture()),
      pixels: {
        available: true,
        gate,
        sourceWidth: gate.sourceImageWidth,
        sourceHeight: gate.sourceImageHeight,
        cloneWidth: gate.cloneImageWidth,
        cloneHeight: gate.cloneImageHeight,
        overlapPixels: gate.overlapPixels,
        changedPixelRatio: 0,
        changedRatioAt16: 0,
        deltaE76Mean: 0,
        deltaE76Max: 0,
        deltaE76AboveJndRatio: 0,
        deltaE76AboveVisibleRatio: 0,
        commonAreaRatio: gate.comparedAreaRatio,
      },
      sourceHttpStatus: 200,
      cloneHttpStatus: 200,
    });

  const inky = withGate(mismatched);
  check(
    "AN INKY UNCOMPARED BAND IS A MAJOR FINDING — measurement failure is never green",
    inky.findings.some(
      (finding) =>
        finding.channel === "pixel-uncompared-band-ink-ratio" &&
        finding.severity === "MAJOR",
    ),
    inky.findings.map((f) => `${f.channel}:${f.severity}`).join(", "),
  );
  check(
    "…and the finding NAMES both capture widths, so the mismatch is never a bare ratio",
    (() => {
      const finding = inky.findings.find(
        (f) => f.channel === "pixel-uncompared-band-ink-ratio",
      );
      return (
        finding !== undefined &&
        finding.summary.indexOf("100px") !== -1 &&
        finding.summary.indexOf("160px") !== -1
      );
    })(),
    inky.findings.find((f) => f.channel === "pixel-uncompared-band-ink-ratio")
      ?.summary,
  );
  check(
    "NEGATIVE CONTROL: the same 60px band with no ink in it raises nothing",
    withGate(blankBand).findings.every(
      (finding) => finding.channel !== "pixel-uncompared-band-ink-ratio",
    ),
    withGate(blankBand)
      .findings.map((f) => f.channel)
      .join(", "),
  );
  check(
    "NEGATIVE CONTROL: two equal-sized captures raise nothing however inky they are",
    withGate(
      gatePixels(
        image(60, 40, white),
        image(60, 40, white, (set) => {
          for (let y = 0; y < 40; y++) for (let x = 0; x < 60; x++) set(x, y, 0, 0, 0);
        }),
      ),
    ).findings.every(
      (finding) => finding.channel !== "pixel-uncompared-band-ink-ratio",
    ),
  );
  check(
    "the VERTICAL band never fires — a taller page is already a scroll-height finding",
    withGate(taller).findings.every(
      (finding) => finding.channel !== "pixel-uncompared-band-ink-ratio",
    ) &&
      withGate(taller).channels.some(
        (channel) =>
          channel.channel === "pixel-uncompared-vertical-band-ink-ratio" &&
          channel.value > 0 &&
          channel.firedAt === null,
      ),
    JSON.stringify(
      withGate(taller).channels.find(
        (c) => c.channel === "pixel-uncompared-vertical-band-ink-ratio",
      ),
    ),
  );
  check(
    "…and how much of the page was compared at all is a channel, never only prose",
    (() => {
      const reading = inky.channels.find(
        (channel) => channel.channel === "pixel-compared-area-ratio",
      );
      return reading !== undefined && near(reading.value, (100 * 40) / (160 * 40), 1e-6);
    })(),
    JSON.stringify(
      inky.channels.find((c) => c.channel === "pixel-compared-area-ratio"),
    ),
  );
  check(
    "the threshold is DERIVED from the smallest pixel difference the rubric will report, " +
      "not chosen: it IS PIXEL_RESIDUAL_MINOR_RATIO",
    PIXEL_UNCOMPARED_BAND_INK_MAJOR_RATIO === PIXEL_RESIDUAL_MINOR_RATIO,
    `${PIXEL_UNCOMPARED_BAND_INK_MAJOR_RATIO} vs ${PIXEL_RESIDUAL_MINOR_RATIO}`,
  );

  // -- THE COMPOSITE: a reviewer cannot miss it ------------------------------
  const compositeInput = {
    browser: undefined as unknown as Browser,
    site: "example.com",
    route: "/",
    width: 700,
    verdict: "MAJOR" as const,
    blockerCount: 0,
    majorCount: 1,
    minorCount: 0,
    sourceUrl: "https://example.com/",
    cloneUrl: "http://127.0.0.1:1/",
    sourceFile: "/tmp/source.png",
    cloneFile: "/tmp/clone.png",
    sourceSize: { width: 700, height: 8021 },
    cloneSize: { width: 862, height: 8021 },
    outFile: "/tmp/out.png",
    scratchHtml: "/tmp/scratch.html",
  };
  const mismatchFacts = compositeWidthMismatch(
    compositeInput.sourceSize,
    compositeInput.cloneSize,
  );
  check(
    "the composite KNOWS the two panels are different widths and which one carries the strip",
    mismatchFacts.widthMismatchPx === 162 &&
      mismatchFacts.commonWidthPx === 700 &&
      mismatchFacts.banner === true &&
      mismatchFacts.hatchedPanel === "FINAL",
    JSON.stringify(mismatchFacts),
  );
  const mismatchedHtml = buildCompositeHtml(compositeInput).html;
  check(
    "…and the composite PRINTS it as a banner, not as 11px grey metadata",
    mismatchedHtml.indexOf(COMPOSITE_WIDTH_MISMATCH_MARKER) !== -1 &&
      mismatchedHtml.indexOf("class=\"mismatch\"") !== -1,
    mismatchedHtml.indexOf(COMPOSITE_WIDTH_MISMATCH_MARKER) !== -1
      ? "banner present"
      : "NO BANNER",
  );
  check(
    "…and the uncompared strip itself is hatched ON the wider panel, labelled with its width",
    mismatchedHtml.indexOf(`class="${COMPOSITE_UNCOMPARED_BAND_CLASS}"`) !== -1 &&
      mismatchedHtml.indexOf("162px NOT PIXEL-COMPARED") !== -1,
  );
  check(
    "…and the banner names BOTH capture widths and the width actually compared",
    mismatchedHtml.indexOf("700px") !== -1 &&
      mismatchedHtml.indexOf("862px") !== -1 &&
      mismatchedHtml.indexOf("the 700px") !== -1,
  );
  const equalHtml = buildCompositeHtml({
    ...compositeInput,
    cloneSize: { width: 700, height: 8021 },
  }).html;
  check(
    "NEGATIVE CONTROL: two equal-width captures get no banner and no hatched strip",
    equalHtml.indexOf(COMPOSITE_WIDTH_MISMATCH_MARKER) === -1 &&
      equalHtml.indexOf(`class="${COMPOSITE_UNCOMPARED_BAND_CLASS}"`) === -1 &&
      compositeWidthMismatch(
        { width: 700, height: 8021 },
        { width: 700, height: 8021 },
      ).banner === false,
  );

  // THE CARRIED ITEM, NOW CLOSED (Task 28.8 FAST change 3).
  //
  // 28.75 recorded that the SAME min-crop pattern lived in
  // `src/reconstruction-qa/screenshot-diff.ts` with nothing measuring what it
  // dropped, and asserted the defect's continued existence so the carry-forward
  // could not be quietly forgotten. It has now been fixed, so this check is
  // rewritten to assert the FIX — the crop is still there, because a resize
  // would invent pixels, and the band it leaves out is now measured and
  // reported beside the numbers computed without it.
  //
  //   OLD expectation: the file still contains the two `Math.min` lines AND
  //                    nothing that measures the band (the defect stands).
  //   NEW expectation: the file still contains the two `Math.min` lines AND
  //                    `compareImages` returns an `uncompared` band carrying
  //                    the strip's dimensions and its ink share.
  const screenshotDiffSource = readFileSync(
    path.join(repoRootDir(), "src/reconstruction-qa/screenshot-diff.ts"),
    "utf8",
  );
  check(
    "CLOSED (was CARRIED): src/reconstruction-qa/screenshot-diff.ts keeps the min-crop — a resize would invent pixels — and no longer keeps it SILENT",
    /const overlapWidth = Math\.min\(a\.width, b\.width\);/.test(screenshotDiffSource) &&
      /const overlapHeight = Math\.min\(a\.height, b\.height\);/.test(
        screenshotDiffSource,
      ) &&
      /export interface UncomparedBand/.test(screenshotDiffSource) &&
      /uncompared: UncomparedBand;/.test(screenshotDiffSource),
    "the min-crop must stay and must be accounted for — see 05-qa-width-overlap-honesty.md",
  );
  // Asserted against the RUNNING CODE, not only against its source text: a
  // regex over a file cannot tell whether the numbers are real.
  const wideA = image(12, 8, [255, 255, 255]);
  const narrowB = image(8, 8, [255, 255, 255], (set) => {
    for (let y = 0; y < 8; y++) set(y, y, 0, 0, 0);
  });
  const inkedA = image(12, 8, [255, 255, 255], (set) => {
    for (let y = 0; y < 8; y++) for (let x = 8; x < 12; x++) set(x, y, 0, 0, 0);
  });
  check(
    "…and the running comparison reports the dropped strip's dimensions, its pixels and its ink",
    (() => {
      const band = compareImages(inkedA, narrowB).uncompared;
      return (
        band.widthPx === 4 &&
        band.heightPx === 0 &&
        band.pixels === 32 &&
        band.aInkSampled === 32 &&
        band.inkRatio === 1 &&
        band.measured
      );
    })(),
    JSON.stringify(compareImages(inkedA, narrowB).uncompared),
  );
  check(
    "…a dropped strip of plain page background reads 0 ink, so the channel never inflates a harmless crop",
    (() => {
      const band = compareImages(wideA, narrowB).uncompared;
      return band.widthPx === 4 && band.pixels === 32 && band.inkPixels === 0;
    })(),
    JSON.stringify(compareImages(wideA, narrowB).uncompared),
  );
  check(
    "…and two equal-sized captures report a band of zero, which is the only case where 0 means nothing was dropped",
    (() => {
      const band = compareImages(narrowB, narrowB).uncompared;
      return band.widthPx === 0 && band.heightPx === 0 && band.pixels === 0;
    })(),
  );
}

// ---------------------------------------------------------------------------
// B7. the QA capture reaches the observer's page state (Task 28.75)
// ---------------------------------------------------------------------------

/** The repo root, resolved from this file rather than from the cwd. */
function repoRootDir(): string {
  return path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
}

/**
 * seoultone.kr's entry popup, at fixture scale.
 *
 * It reproduces the shape the diagnostic lane measured on the real page — a
 * centered, lifted, inset panel that appears AFTER the first paint with a close
 * control labelled from the dismissal vocabulary — because the live origin is
 * serving a Cafe24 over-traffic stub and cannot be captured (see the report's
 * SOURCE_UNAVAILABLE entry). The underlying page carries the copy the clone is
 * charged for; the popup carries copy of its own.
 */
const ENTRY_POPUP_HTML = `<!doctype html><html lang="ko"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>entry popup fixture</title><style>
 body{margin:0;font:16px/1.5 system-ui}
 .page{padding:16px}
 .hero{height:420px;background:#eef;padding:20px}
 #popup{display:none;position:fixed;left:50%;top:50%;transform:translate(-50%,-50%);
        width:min(440px,90vw);height:70vh;z-index:9999;background:#333;color:#fff;padding:20px}
 #popup.on{display:block}
</style></head><body>
<div id="popup"><p>가을이벤트 안내 팝업 텍스트</p><button type="button" aria-label="닫기"><span>x</span></button></div>
<div class="page">
  <div class="hero"><h1>진료과 안내</h1><p>본문 콘텐츠가 여기에 있습니다. 이 문장은 클론이 반드시 렌더링해야 하는 실제 내용입니다.</p></div>
  <p>추가 본문 단락 하나</p><p>추가 본문 단락 둘</p><p>추가 본문 단락 셋</p>
</div>
<script>
 document.getElementById("popup").addEventListener("click", function (e) {
   if (e.target && e.target.closest("button")) {
     document.getElementById("popup").classList.remove("on");
     document.body.style.overflow = "";
   }
 });
 setTimeout(function () {
   document.getElementById("popup").classList.add("on");
   document.body.style.overflow = "hidden";
 }, 300);
</script>
</body></html>`;

/** The popup's own copy, which must not be in a normalized capture's census. */
const POPUP_TEXT = "가을이벤트 안내 팝업 텍스트";
/** The underlying page's copy, which must be in every capture's census. */
const PAGE_TEXT = "진료과 안내";

function testPageStateContractSource(): void {
  section("B7a. the two-call page-state contract, pinned on the capture's own source");

  const capture = readFileSync(
    path.join(repoRootDir(), "src/responsive-qa/capture.ts"),
    "utf8",
  );
  check(
    "the QA capture uses the OBSERVER'S OWN implementation, not a second copy of the policy",
    /from "\.\.\/observer\/index\.js"/.test(capture) &&
      capture.indexOf("markInitialPaintCensus") !== -1 &&
      capture.indexOf("normalizePageState") !== -1,
  );
  const goto = capture.indexOf("await gotoQa(page, input.url)");
  const census = capture.indexOf("await markInitialPaintCensus(page)");
  const settle = capture.indexOf("await stabilize(page)");
  const normalize = capture.indexOf("await normalizePageState(page, {");
  const scroll = capture.indexOf("await scrollThroughPage(page)");
  const shot = capture.indexOf("await page.screenshot({");
  check(
    "CALL 1 is after goto and BEFORE any settling — the whole point of the census",
    goto !== -1 && census > goto && census < settle,
    JSON.stringify({ goto, census, settle }),
  );
  check(
    "CALL 2 is after the settle and BEFORE the scroll, the probe and the screenshot",
    normalize > settle && normalize < scroll && normalize < shot,
    JSON.stringify({ settle, normalize, scroll, shot }),
  );
  check(
    "…and there is exactly ONE captureSide, so both sides run this identical sequence",
    (capture.match(/export async function captureSide/g) ?? []).length === 1,
  );
  check(
    "the capture POLICY records that page state was normalized, so an artifact can never " +
      "be read without knowing which page state its numbers describe",
    CAPTURE_POLICY.pageStateNormalized === true &&
      CAPTURE_POLICY.waits.indexOf("markInitialPaintCensus") !== -1 &&
      CAPTURE_POLICY.waits.indexOf("normalizePageState") !== -1,
    CAPTURE_POLICY.waits,
  );
  check(
    "page-state evidence is written OUTSIDE docs/result/, so production code cannot write " +
      "into a frozen wave's artifact directory",
    QA_PAGE_STATE_EVIDENCE_ROOT.indexOf("docs/result") === -1,
    QA_PAGE_STATE_EVIDENCE_ROOT,
  );
}

async function testPageStateInBrowser(browser: Browser): Promise<void> {
  section("B7b. the QA capture and the observer reach the SAME page state (real Chromium)");

  const fixtures = await serveFixtures({ "/popup": ENTRY_POPUP_HTML });
  const evidence = await mkdtemp(path.join(os.tmpdir(), "wr2875-qa-pagestate-"));
  try {
    const url = `${fixtures.origin}/popup`;

    // -- 1. THE DEFECT, reproduced. Normalization OFF is exactly what this
    //       harness did before 28.75: the popup is in the capture.
    const unnormalized = await captureSide({
      browser,
      url,
      width: 390,
      screenshotFile: "unnormalized.png",
      normalizePageState: false,
    });
    const unnormalizedKeys = unnormalized.measurement.visibleTextEntries.map(
      (entry) => entry.key,
    );
    check(
      "PRECONDITION (the defect): with normalization OFF the popup's copy is in the census",
      unnormalizedKeys.some((key) => key.indexOf(POPUP_TEXT) !== -1),
      unnormalizedKeys.join(" | "),
    );
    check(
      "…and the record says the phase did not run, rather than saying nothing",
      unnormalized.provenance.pageState?.ran === false,
      JSON.stringify(unnormalized.provenance.pageState),
    );

    // -- 2. THE FIX. Same code path, normalization on by default.
    const normalized = await captureSide({
      browser,
      url,
      width: 390,
      screenshotFile: "normalized.png",
      side: "source",
      pageId: "p0001",
      pageStateEvidenceRoot: evidence,
    });
    const state = normalized.provenance.pageState;
    const normalizedKeys = normalized.measurement.visibleTextEntries.map(
      (entry) => entry.key,
    );
    check(
      "THE FIX: the QA source capture dismisses the entry popup, exactly as the observer does",
      state?.ran === true && state.dismissed === 1 && state.qualifiedNotDismissed === 0,
      JSON.stringify({
        ran: state?.ran,
        qualified: state?.qualified,
        dismissed: state?.dismissed,
        limitations: state?.limitations,
      }),
    );
    check(
      "…and CALL 1 actually took, so `appeared-after-initial-paint` was available as evidence",
      state?.initialPaintCensusAvailable === true &&
        state.initialPaintCensusStatus === "available" &&
        state.initialPaintCensusElements > 0 &&
        state.initialPaintCensusCapHit === false,
      JSON.stringify({
        available: state?.initialPaintCensusAvailable,
        status: state?.initialPaintCensusStatus,
        elements: state?.initialPaintCensusElements,
      }),
    );
    check(
      "…so the popup's copy is NOT in the capture the clone is measured against",
      normalizedKeys.every((key) => key.indexOf(POPUP_TEXT) === -1),
      normalizedKeys.join(" | "),
    );
    check(
      "…while the page's REAL copy still is: normalization removes state, never content",
      normalizedKeys.some((key) => key.indexOf(PAGE_TEXT) !== -1),
      normalizedKeys.join(" | "),
    );
    check(
      "…and the attempt is recorded in full, so a reader can see what was clicked",
      (state?.attempts.length ?? 0) === 1 &&
        state?.attempts[0]?.outcome === "dismissed" &&
        state.attempts[0]?.method === "close-control",
      JSON.stringify(state?.attempts),
    );

    // -- 3. THE EQUIVALENCE. The same page, taken to a normal state through the
    //       OBSERVER'S public API the way `observe-page.ts` calls it. If the QA
    //       capture and the observer disagree about what "the page" is, this is
    //       the check that says so.
    const context = await browser.newContext({
      viewport: { width: 390, height: 900 },
      deviceScaleFactor: 1,
    });
    let observerKeys: string[] = [];
    let observerState: Awaited<ReturnType<typeof normalizePageState>> | undefined;
    try {
      const page = await context.newPage();
      await page.goto(url, { waitUntil: "load" });
      await markInitialPaintCensus(page);
      await page.waitForTimeout(900);
      observerState = await normalizePageState(page, {
        observationUrl: url,
        viewportId: "mobile",
        pageId: "p000001",
        evidenceRoot: evidence,
      });
      observerKeys = await page.evaluate(() => {
        const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
        const out: string[] = [];
        let node: Node | null;
        while ((node = walker.nextNode())) {
          const text = (node.nodeValue ?? "").replace(/\s+/g, " ").trim();
          if (!text) continue;
          const parent = node.parentElement;
          if (!parent) continue;
          // `display:none` does NOT cascade into a child's computed style, so
          // the parent's own `display` is not the test — a node inside a hidden
          // subtree lays out no client rects at all, and that is.
          if (parent.getClientRects().length === 0) continue;
          const cs = getComputedStyle(parent);
          if (cs.visibility === "hidden") continue;
          out.push(text.toLowerCase());
        }
        return out;
      });
    } finally {
      await context.close().catch(() => {});
    }
    check(
      "THE EQUIVALENCE: the observer's own API reaches the same state — one dismissal, popup gone",
      observerState?.dismissed === 1 &&
        observerKeys.every((key) => key.indexOf(POPUP_TEXT) === -1) &&
        observerKeys.some((key) => key.indexOf(PAGE_TEXT) !== -1),
      JSON.stringify({
        dismissed: observerState?.dismissed,
        keys: observerKeys.slice(0, 6),
      }),
    );
    check(
      "…and the two agree number for number on what they dismissed and on the census status",
      state?.dismissed === observerState?.dismissed &&
        state?.qualified === observerState?.qualified &&
        state?.initialPaintCensusStatus === observerState?.initialPaintCensusStatus,
      JSON.stringify({
        qa: {
          dismissed: state?.dismissed,
          qualified: state?.qualified,
          census: state?.initialPaintCensusStatus,
        },
        observer: {
          dismissed: observerState?.dismissed,
          qualified: observerState?.qualified,
          census: observerState?.initialPaintCensusStatus,
        },
      }),
    );

    // -- 4. THE ATTRIBUTION, end to end. The un-normalized source is what used
    //       to be graded; the normalized one is what is graded now. The
    //       difference in `missing-text-ratio` IS the popup, and nothing else.
    const cloneLikeSide = { ...normalized.measurement };
    const chargedForPopup = missingText(unnormalized.measurement, cloneLikeSide);
    const notCharged = missingText(normalized.measurement, cloneLikeSide);
    check(
      "THE ATTRIBUTION: an un-normalized source charges the clone for the popup's characters…",
      chargedForPopup.missingChars > 0 &&
        chargedForPopup.missingStringCount > 0,
      JSON.stringify({
        chars: chargedForPopup.missingChars,
        strings: chargedForPopup.missingStringCount,
      }),
    );
    check(
      "…and a normalized source charges it for NOTHING, because the two are the same page state",
      notCharged.missingChars === 0 && notCharged.missingRatio === 0,
      JSON.stringify({
        chars: notCharged.missingChars,
        ratio: notCharged.missingRatio,
      }),
    );
  } finally {
    await fixtures.close();
    await rm(evidence, { recursive: true, force: true });
  }
}

/** A `PageStateRecord` with only the fields a case is about. */
function pageState(overrides: Partial<PageStateRecord> = {}): PageStateRecord {
  return {
    ran: true,
    initialPaintCensusAvailable: true,
    initialPaintCensusStatus: "available",
    initialPaintCensusElements: 1200,
    initialPaintCensusCapHit: false,
    qualified: 0,
    dismissed: 0,
    qualifiedNotDismissed: 0,
    attemptCapHit: false,
    attempts: [],
    limitations: [],
    ...overrides,
  };
}

function testPageStateComparability(): void {
  section("B7c. a pair that cannot be made comparable DECLARES it (item B7)");

  const missingLots: Partial<SideMeasurement> = {
    visibleTextChars: 1000,
    visibleTextEntries: census(["alpha", "beta", "gamma delta epsilon"])
      .visibleTextEntries,
  };
  const classifyState = (
    sourcePageState?: PageStateRecord,
    clonePageState?: PageStateRecord,
  ): Classification => {
    const source = sideFixture(missingLots);
    const clone = sideFixture({
      visibleTextChars: 200,
      visibleTextEntries: census(["alpha"]).visibleTextEntries,
    });
    return classifyPair({
      source,
      clone,
      correspondence: correspond(
        { leaves: source.leaves, innerWidth: source.innerWidth },
        { leaves: clone.leaves },
      ),
      columns: compareColumns(source, clone),
      missing: missingText(source, clone),
      missingReverse: missingText(clone, source),
      pixels: { available: false, unavailableReason: "not decoded in this fixture" },
      sourceHttpStatus: 200,
      cloneHttpStatus: 200,
      ...(sourcePageState ? { sourcePageState } : {}),
      ...(clonePageState ? { clonePageState } : {}),
    });
  };

  // NEGATIVE CONTROL FIRST: it is also the proof the fixture reproduces the
  // shape. Both sides normalized cleanly ⇒ the text channels fire normally.
  const comparable = classifyState(
    pageState({ qualified: 1, dismissed: 1 }),
    pageState(),
  );
  check(
    "NEGATIVE CONTROL: both sides normalized ⇒ the text channels grade the clone as usual",
    comparable.findings.some((finding) => finding.channel === "missing-text-ratio") &&
      comparable.findings.some((finding) => finding.channel === "visible-text-ratio"),
    comparable.findings.map((f) => `${f.channel}:${f.severity}`).join(", "),
  );
  check(
    "…and the pair records itself as comparable",
    comparable.channels.find((c) => c.channel === "page-state-comparable")?.value === 1,
    JSON.stringify(
      comparable.channels.find((c) => c.channel === "page-state-comparable"),
    ),
  );

  // THE GUARD: one field different — the source's overlay would not close.
  const standing = classifyState(
    pageState({ qualified: 1, dismissed: 0, qualifiedNotDismissed: 1 }),
    pageState(),
  );
  check(
    "A SOURCE OVERLAY THAT WOULD NOT CLOSE makes the text channels NOT COMPARABLE",
    standing.findings.every(
      (finding) =>
        finding.channel !== "missing-text-ratio" &&
        finding.channel !== "visible-text-ratio",
    ),
    standing.findings.map((f) => f.channel).join(", "),
  );
  check(
    "…and they are RECORDED with their measured value and a stated reason — never deleted",
    (() => {
      const reading = standing.channels.find((c) => c.channel === "missing-text-ratio");
      const control = comparable.channels.find(
        (c) => c.channel === "missing-text-ratio",
      );
      return (
        reading !== undefined &&
        control !== undefined &&
        reading.value === control.value &&
        reading.value > 0 &&
        reading.firedAt === null &&
        typeof reading.ineligibleReason === "string" &&
        reading.ineligibleReason.indexOf("PAGE STATE") !== -1
      );
    })(),
    JSON.stringify(standing.channels.find((c) => c.channel === "missing-text-ratio")),
  );
  check(
    "…and the reason reaches the caveats too, so a reader scanning either finds it",
    standing.caveats.some((caveat) => caveat.indexOf("entry overlay") !== -1),
    standing.caveats.join(" || "),
  );
  check(
    "…and the pair records itself as NOT comparable",
    standing.channels.find((c) => c.channel === "page-state-comparable")?.value === 0,
    JSON.stringify(standing.channels.find((c) => c.channel === "page-state-comparable")),
  );
  check(
    "the dismissal CAP biting with something still qualifying is the same condition",
    classifyState(
      pageState({ qualified: 3, dismissed: 2, attemptCapHit: true }),
      pageState(),
    ).findings.every((finding) => finding.channel !== "missing-text-ratio"),
  );
  check(
    "a CLONE overlay standing does NOT gate the channels — the guard is one-directional " +
      "and only protects against being charged for the source's page state",
    classifyState(
      pageState(),
      pageState({ qualified: 1, dismissed: 0, qualifiedNotDismissed: 1 }),
    ).findings.some((finding) => finding.channel === "missing-text-ratio"),
  );
  check(
    "a pair with NO page-state record at all grades exactly as before: absent is never 'found nothing'",
    (() => {
      const legacy = classifyState();
      return (
        legacy.findings.some((finding) => finding.channel === "missing-text-ratio") &&
        legacy.channels.every((c) => c.channel !== "page-state-comparable")
      );
    })(),
  );

  // The clone side is a CHECK, and the check has to be visible.
  check(
    "the CLONE's normalization is recorded on its own channel, so 'the engine reproduced a " +
      "popup' is a readable fact rather than an invisible one",
    (() => {
      const reading = classifyState(
        pageState(),
        pageState({ qualified: 1, dismissed: 1 }),
      ).channels.find((c) => c.channel === "page-state-clone-overlays-dismissed");
      return reading !== undefined && reading.value === 1;
    })(),
  );
  check(
    "a source whose initial-paint census was ABSENT raises a caveat naming the lost STRONG signal",
    classifyState(
      pageState({
        initialPaintCensusAvailable: false,
        initialPaintCensusStatus: "absent",
      }),
      pageState(),
    ).caveats.some(
      (caveat) => caveat.indexOf("appeared-after-initial-paint") !== -1,
    ),
  );
}

// ---------------------------------------------------------------------------
// M6. the two false-alarm channels — reviewed, LEFT ALONE, and frozen
// ---------------------------------------------------------------------------

/**
 * The independent visual auditor found `offscreen-text-excess-chars` (BLOCKER,
 * linear `/` @390, 200 chars) and `position-delta-p90-px` (MAJOR, linear `/`
 * @1440, 63px against 48) stricter than the images justify. Both were reviewed
 * against the principled comparison the instruction asks for, and BOTH ARE LEFT
 * UNCHANGED. The reasoning is in
 * `docs/result/28.75/05-qa-width-overlap-honesty.md` §M6; the checks below make
 * the two decisions PERMANENT rather than a paragraph:
 *
 *   - the offscreen channel is ALREADY relative to the source, so "the source
 *     bleeds too" is already subtracted — asserted here on a fixture;
 *   - both thresholds are frozen at the values the review left them, so a later
 *     silent retune fails this suite and has to argue for itself.
 */
function testM6ThresholdsFrozen(): void {
  section("M6. the two false-alarm channels — reviewed, left alone, frozen");

  check(
    "offscreen-text-excess-chars is RELATIVE: a source that parks 5,000 characters " +
      "off-screen and a clone that parks the same 5,000 raises nothing",
    classifyFixture({
      source: { offscreenTextChars: 5000, offscreenNodes: 40 },
      clone: { offscreenTextChars: 5000, offscreenNodes: 40 },
      sourceHttpStatus: 200,
      cloneHttpStatus: 200,
    }).findings.every(
      (finding) => finding.channel !== "offscreen-text-excess-chars",
    ),
  );
  check(
    "…and a source that parks MORE than the clone can never fire it either",
    classifyFixture({
      source: { offscreenTextChars: 5000, offscreenNodes: 40 },
      clone: { offscreenTextChars: 900, offscreenNodes: 8 },
      sourceHttpStatus: 200,
      cloneHttpStatus: 200,
    }).findings.every(
      (finding) => finding.channel !== "offscreen-text-excess-chars",
    ),
  );
  check(
    "…so the auditor's premise (\"the source itself bleeds past the right edge\") is " +
      "already subtracted, and the reading is a measured clone-minus-source excess",
    (() => {
      const reading = classifyFixture({
        source: { offscreenTextChars: 427, offscreenNodes: 6 },
        clone: { offscreenTextChars: 627, offscreenNodes: 9 },
        sourceHttpStatus: 200,
        cloneHttpStatus: 200,
      }).channels.find((c) => c.channel === "offscreen-text-excess-chars");
      return reading?.value === 200 && reading.sourceValue === 427;
    })(),
  );
  // THE FREEZE. These two numbers were reviewed in 28.75 item M6 against the
  // self-check floor and deliberately NOT moved:
  //   - linear `/` @1440, three independent self-check runs
  //     (2026-09-02T23-18-26-778Z, 2026-09-04T15-52-40-937Z,
  //     2026-09-04T17-25-07-320Z) read position-delta-p90-px = 0px source
  //     against source, while the clone reads 63px. The floor contradicts "the
  //     source does it too" outright.
  //   - linear `/` @390, the same three runs read offscreen excess = 0 against
  //     a source that parks 427 characters off-screen.
  // Raising either threshold to make a pair pass is the one move the rubric
  // forbids, so the values are pinned here and a change has to argue for itself.
  check(
    `position-delta-p90-px's MAJOR threshold is still ${DISTRIBUTION_MAJOR_P90_PX}px — the ` +
      "28.75 M6 review left it alone; the self-check floor on the cited pair is 0px",
    DISTRIBUTION_MAJOR_P90_PX === 48,
    String(DISTRIBUTION_MAJOR_P90_PX),
  );
  check(
    `offscreen-text-excess-chars' BLOCKER threshold is still ${OFFSCREEN_TEXT_BLOCKER_EXCESS_CHARS} ` +
      "characters — the 28.75 M6 review left it alone; the floor on the cited pair is 0",
    OFFSCREEN_TEXT_BLOCKER_EXCESS_CHARS === 80,
    String(OFFSCREEN_TEXT_BLOCKER_EXCESS_CHARS),
  );
}

// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  console.log("Responsive QA harness fixture (Task 28.6, wave 4)");

  testPixelGate();
  testTrustGate();
  testMissingText();
  testKoreanBoundary();
  testOffViewportSplit();
  testRubricRoster();
  testCloneRouteMissingGuard();
  testSourceStabilityGuard();
  testDuplicateImageLayers();
  testFailedImageLayers();
  testBrokenImageNeverErasesOverlap();
  testUncomparedPixelBand();
  testPageStateContractSource();
  testPageStateComparability();
  testM6ThresholdsFrozen();
  testCoverageAccounting();
  testBlankRegionDetector();
  testCriticalTextCollision();
  testSelfCheckFloorLogic();
  testCliFlagParsing();
  await testReadFloorArtifact();

  const browser = await chromium.launch();
  try {
    await testProbe(browser);
    await testOpacityCensus(browser);
    await testScrollFloor(browser);
    await testRegionCensus(browser);
    await testPageStateInBrowser(browser);
    testRevealPolicyAgreement();
  } finally {
    await browser.close().catch(() => {});
  }

  console.log("");
  console.log(`${checks - failures}/${checks} checks passed`);
  if (failures > 0) {
    console.log(`${failures} FAILED`);
    process.exitCode = 1;
  }
}

main().catch((err) => {
  console.error(
    "[smoke:responsive-qa] ERROR —",
    err instanceof Error ? err.stack : err,
  );
  process.exitCode = 1;
});
