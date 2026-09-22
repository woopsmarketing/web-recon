import { createServer, type Server } from "node:http";
import { chromium } from "playwright";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { DESKTOP_PROFILE, STYLE_WHITELIST } from "../src/observer/types.js";
import {
  CHANGED_PIXEL_AMPLITUDE_THRESHOLD,
  DELTA_E76_JND_THRESHOLD,
  DiffCollector,
  QA_ONLY_STYLE_PROPERTIES,
  QA_ONLY_STYLE_SAMPLE_LIMIT,
  QA_STYLE_PROPERTIES,
  QaPageResultSchema,
  ScreenshotMetricSchema,
  TARGET_STATE_STYLE_PROPERTIES,
  captureOriginal,
  compareCapturedStyles,
  compareImages,
  decodePng,
  deltaE76,
  encodePng,
  diffStyles,
  measurePair,
  qaOnePage,
  srgbToLab,
  summarizeLiveFidelity,
  unverifiableFromSpecProperties,
  worstPages,
  type DecodedImage,
  type QaCapturedElement,
  type QaInputs,
  type QaPageResult,
} from "../src/reconstruction-qa/index.js";
import type {
  ElementSpecNode,
  PageSpec,
  StyleCatalog,
  ViewportPageSpec,
} from "../src/sitespec/index.js";

/**
 * Task 28.5B change 6 — proof that the QA is no longer blind where the Observer
 * is blind, and that no single pixel scalar is presented as visual truth.
 *
 * Two independent claims are tested here, because change 6 makes two:
 *
 *  1. VOCABULARY. `QA_STYLE_PROPERTIES` used to be `= STYLE_WHITELIST`. A QA
 *     that reads exactly what the Observer wrote cannot detect what the
 *     Observer forgot, so every 28.5A finding (`-webkit-font-smoothing`,
 *     `text-wrap-*`) was invisible to the harness that was supposed to find it.
 *     The list is now an independent literal that CONTAINS the observer's
 *     vocabulary and extends past it. The decisive test is not the constant —
 *     it is the browser fixture below, where two pages differ ONLY in
 *     properties the Observer never records and the QA has to say so.
 *
 *  2. PIXELS. The historical `changedPixelRatio` counts a pixel as changed when
 *     any channel moves by 1/255, which 28.5A measured saturating near 1.0 on
 *     renders a human calls identical. It is kept UNCHANGED for artifact
 *     continuity, and joined by an amplitude gate (≥ 16/255) and CIELab ΔE*76
 *     fractions at the 2.3 JND and at 10. The synthetic cases below pin the
 *     exact arithmetic of each channel, including the case where the channels
 *     disagree — which is the whole point of reporting all of them.
 *
 * Run: `npx tsx scripts/smoke-qa-independence.ts`
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

function section(title: string): void {
  console.log("");
  console.log(title);
}

// ---------------------------------------------------------------------------
// 1. Static decoupling
// ---------------------------------------------------------------------------

async function testStaticDecoupling(): Promise<void> {
  section("1. Vocabulary decoupling — QA owns its own property list");

  const capturePageFile = path.join(
    process.cwd(),
    "src",
    "reconstruction-qa",
    "capture-page.ts",
  );
  const source = await readFile(capturePageFile, "utf8");

  // Every `import … from "…";` statement in the file, comments excluded by
  // construction (an import statement cannot appear inside a block comment and
  // still be an import).
  const importStatements = [...source.matchAll(/^import[\s\S]*?from\s+"[^"]+";$/gm)].map(
    (match) => match[0],
  );
  check(
    "capture-page.ts still has imports to inspect",
    importStatements.length > 0,
    `${importStatements.length} found`,
  );
  check(
    "no import statement in capture-page.ts pulls in STYLE_WHITELIST",
    importStatements.every((statement) => !statement.includes("STYLE_WHITELIST")),
    importStatements.filter((s) => s.includes("STYLE_WHITELIST")).join(" | "),
  );
  check(
    "…and the constant is no longer an alias assignment",
    !/QA_STYLE_PROPERTIES:\s*readonly string\[\]\s*=\s*STYLE_WHITELIST/.test(source),
  );
  check(
    "QA_STYLE_PROPERTIES is not reference-equal to STYLE_WHITELIST",
    (QA_STYLE_PROPERTIES as readonly string[]) !==
      (STYLE_WHITELIST as readonly string[]),
  );

  const observer = new Set(STYLE_WHITELIST);
  const qa = new Set(QA_STYLE_PROPERTIES);
  const beyond = QA_STYLE_PROPERTIES.filter((property) => !observer.has(property));
  const missing = STYLE_WHITELIST.filter((property) => !qa.has(property));

  check(
    "QA keeps every property the Observer records (no coverage loss)",
    missing.length === 0,
    `missing ${missing.join(", ")}`,
  );
  check(
    "QA sees at least 5 properties the Observer does not",
    beyond.length >= 5,
    `${beyond.length} beyond: ${beyond.slice(0, 8).join(", ")}…`,
  );
  check(
    "the 28.5A properties are in QA's vocabulary",
    ["opacity", "visibility", "-webkit-font-smoothing", "text-wrap-mode", "text-wrap-style"].every(
      (property) => qa.has(property),
    ),
  );
  check(
    "the QA list has no duplicates",
    qa.size === QA_STYLE_PROPERTIES.length,
    `${QA_STYLE_PROPERTIES.length} entries, ${qa.size} distinct`,
  );
  check(
    "QA_ONLY_STYLE_PROPERTIES is a subset of QA_STYLE_PROPERTIES",
    QA_ONLY_STYLE_PROPERTIES.every((property) => qa.has(property)),
  );
  console.log(
    `        QA vocabulary ${QA_STYLE_PROPERTIES.length} properties, ` +
      `${beyond.length} beyond the Observer's ${STYLE_WHITELIST.length}`,
  );
}

// ---------------------------------------------------------------------------
// 1b. Honest degradation for spec-less properties
// ---------------------------------------------------------------------------

function testHonestDegradation(): void {
  section("1b. Spec-less properties degrade honestly — never silently 'equal'");

  const unverifiable = unverifiableFromSpecProperties(STYLE_WHITELIST);
  check(
    "properties the SiteSpec vocabulary cannot adjudicate are NAMED",
    unverifiable.length >= 5 && unverifiable.includes("text-shadow"),
    `${unverifiable.length}: ${unverifiable.slice(0, 6).join(", ")}…`,
  );
  check(
    "…and a property the spec does carry is not listed as un-verifiable",
    !unverifiable.includes("color") && !unverifiable.includes("opacity"),
  );

  /*
   * `diffStyles` iterates the SPEC's stored properties, so a capture carrying
   * QA-only properties must neither crash it nor invent a mismatch. Minimal
   * hand-built spec shapes, cast rather than fully constructed: this test cares
   * about the two fields `diffStyles` reads, not the whole IR.
   */
  const node = {
    nodeId: "n1",
    type: "element",
    tagName: "h1",
    styleTokenId: "s1",
  } as unknown as ElementSpecNode;
  const catalog = {
    styles: [
      { styleTokenId: "s1", properties: { color: "rgb(0, 0, 0)" }, usageCount: 1 },
    ],
  } as unknown as StyleCatalog;
  const captured: QaCapturedElement = {
    key: "n1",
    tagName: "h1",
    rawText: "",
    attributes: {},
    style: {
      color: "rgb(0, 0, 0)",
      // QA-only: present in the capture, absent from every style token.
      "text-shadow": "rgba(0, 0, 0, 0.5) 0px 2px 4px",
      "-webkit-text-fill-color": "rgba(0, 0, 0, 0)",
    },
    box: { x: 0, y: 0, width: 10, height: 10 },
    localVisible: true,
    effectiveVisible: true,
  };
  const result = diffStyles({
    nodes: [node],
    actualByNodeId: new Map([["n1", captured]]),
    styleCatalog: catalog,
    applyDocumentRootAdaptation: false,
  });
  check(
    "diffStyles does not crash on a capture carrying QA-only properties",
    result.summary.comparedNodes === 1,
  );
  check(
    "…and compares only what the spec actually stored",
    result.summary.comparedProperties === 1,
    `compared ${result.summary.comparedProperties}`,
  );
  check(
    "…inventing no mismatch for the properties it never observed",
    result.summary.mismatchedProperties === 0,
  );
}

// ---------------------------------------------------------------------------
// 2. Observer-blindness catch — the mandated browser fixture
// ---------------------------------------------------------------------------

/**
 * Two pages with byte-identical structure and byte-identical observer-visible
 * styling, differing ONLY in properties `STYLE_WHITELIST` does not contain:
 *
 *   `background-clip` / `-webkit-background-clip` / `-webkit-text-fill-color`
 *       the gradient-headline treatment. The gradient `background-image` IS
 *       observed and is identical on both sides; the two properties that turn
 *       it into visible text are not observed at all.
 *   `text-shadow`
 *       painted, unobserved, and changes no observed value.
 *
 * A whitelist-restricted comparison of these two pages therefore finds nothing,
 * which is exactly the blindness 28.5A named. The decoupled vocabulary finds it.
 */
function fixtureHtml(variant: "original" | "clone"): string {
  const knockout =
    variant === "original"
      ? "background-clip: text; -webkit-background-clip: text; -webkit-text-fill-color: transparent;"
      : "";
  const shadow =
    variant === "original" ? "text-shadow: rgba(0, 0, 0, 0.6) 0px 2px 4px;" : "";
  return `<!doctype html>
<html lang="ko"><head><meta charset="utf-8"><title>qa independence fixture</title>
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { background: #ffffff; font-family: Arial, Helvetica, sans-serif; padding: 40px; }
  h1 {
    font-size: 48px; font-weight: 700; line-height: 1.2; color: rgb(17, 24, 39);
    background-image: linear-gradient(90deg, rgb(255, 0, 0), rgb(0, 0, 255));
    ${knockout}
  }
  p { font-size: 20px; color: rgb(17, 24, 39); margin-top: 24px; ${shadow} }
</style></head>
<body><h1>재구성 헤드라인</h1><p>본문 문단 하나.</p></body></html>`;
}

/**
 * The CLONE side of the real-run integration fixture (section 6).
 *
 * Deliberately shaped the way Task 14's generator shapes a clone, because
 * `captureClone` reads exactly those conventions and nothing else:
 *
 *   `data-wr-viewport="desktop"|"mobile"`  one subtree per observed viewport,
 *                                          the inactive one display:none.
 *   `data-wr-node="<SiteSpec nodeId>"`     the stamp that makes the clone side
 *                                          of the pairing a lookup.
 *   `data-wr-doc-tag`                      `<html>`/`<body>` rendered as div
 *                                          wrappers, as the generator does.
 *
 * Its styling matches `/original` in every property the OBSERVER records and
 * differs ONLY in QA-only ones: the gradient-knockout pair on the headline and
 * the paragraph's `text-shadow`. So a run that reports zero style mismatches
 * and zero QA-only mismatches is a run that is still blind.
 */
function integrationCloneHtml(): string {
  return `<!doctype html>
<html lang="ko"><head><meta charset="utf-8"><title>qa independence fixture</title>
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { background: #ffffff; font-family: Arial, Helvetica, sans-serif; }
  [data-wr-doc-tag="body"] { padding: 40px; }
  h1 {
    font-size: 48px; font-weight: 700; line-height: 1.2; color: rgb(17, 24, 39);
    background-image: linear-gradient(90deg, rgb(255, 0, 0), rgb(0, 0, 255));
  }
  p { font-size: 20px; color: rgb(17, 24, 39); margin-top: 24px; }
  [data-wr-viewport="mobile"] { display: none; }
</style></head>
<body>
<div data-wr-viewport="desktop">
  <div data-wr-node="n0" data-wr-doc-tag="html">
    <div data-wr-node="n1" data-wr-doc-tag="body">
      <h1 data-wr-node="n2">재구성 헤드라인</h1>
      <p data-wr-node="n3">본문 문단 하나.</p>
    </div>
  </div>
</div>
<div data-wr-viewport="mobile"></div>
</body></html>`;
}

async function startFixtureServer(): Promise<{ baseUrl: string; close: () => Promise<void> }> {
  const server: Server = createServer((request, response) => {
    const url = request.url ?? "/";
    const body =
      url === "/integration/clone"
        ? integrationCloneHtml()
        : fixtureHtml(url === "/clone" ? "clone" : "original");
    response.writeHead(200, {
      "content-type": "text/html; charset=utf-8",
      "cache-control": "no-store",
    });
    response.end(body);
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  const port = typeof address === "object" && address ? address.port : 0;
  return {
    baseUrl: `http://127.0.0.1:${port}`,
    close: () => new Promise<void>((resolve) => server.close(() => resolve())),
  };
}

async function testObserverBlindnessCatch(): Promise<void> {
  section("2. Observer-blindness fixture — QA catches what the Observer omits");

  const fixture = await startFixtureServer();
  const browser = await chromium.launch();
  try {
    // The REAL capture path: newQaContext → gotoQa → stabilize → runCapture,
    // driven exactly as `qa-page.ts` drives the live original.
    const original = await captureOriginal({
      browser,
      url: `${fixture.baseUrl}/original`,
      profile: DESKTOP_PROFILE,
      screenshot: true,
      measureStability: false,
    });
    const clone = await captureOriginal({
      browser,
      url: `${fixture.baseUrl}/clone`,
      profile: DESKTOP_PROFILE,
      screenshot: true,
      measureStability: false,
    });
    check("the original fixture captured", original.ok === true, original.ok ? "" : original.error);
    check("the clone fixture captured", clone.ok === true, clone.ok ? "" : clone.error);
    const originalCapture = original.ok ? original.capture : undefined;
    const cloneCapture = clone.ok ? clone.capture : undefined;
    if (!originalCapture || !cloneCapture) return;

    const capturedProperties = new Set(
      originalCapture.elements.flatMap((element) => Object.keys(element.style)),
    );
    check(
      "the real capture path read QA-only properties off the page",
      capturedProperties.has("text-shadow") &&
        capturedProperties.has("-webkit-text-fill-color"),
    );

    // The blindness, reproduced: restrict the comparison to the Observer's
    // vocabulary and the two pages are indistinguishable.
    const observerView = compareCapturedStyles(originalCapture, cloneCapture, {
      properties: STYLE_WHITELIST,
    });
    check(
      "the two pages are IDENTICAL in the Observer's vocabulary (the blind spot)",
      observerView.mismatches.length === 0,
      JSON.stringify(observerView.byProperty),
    );
    check(
      "…over a non-trivial number of compared elements",
      observerView.comparedElements >= 4 && observerView.comparedProperties > 100,
      `${observerView.comparedElements} elements / ${observerView.comparedProperties} properties`,
    );

    // The fix: QA's own vocabulary sees the difference and names it.
    const qaView = compareCapturedStyles(originalCapture, cloneCapture);
    const named = Object.keys(qaView.byProperty);
    check(
      "QA's own vocabulary reports the difference",
      qaView.mismatches.length > 0,
      `${qaView.mismatches.length} mismatches`,
    );
    check(
      "…naming -webkit-text-fill-color",
      named.includes("-webkit-text-fill-color"),
      named.join(", "),
    );
    check("…naming text-shadow", named.includes("text-shadow"), named.join(", "));
    check(
      "…naming the background-clip pair",
      named.includes("background-clip") || named.includes("-webkit-background-clip"),
      named.join(", "),
    );
    check(
      "every named property is outside the Observer's whitelist",
      named.every((property) => !STYLE_WHITELIST.includes(property)),
      named.join(", "),
    );
    check(
      "the same element keys aligned on both sides (a style finding, not a structural one)",
      qaView.unmatchedKeys.length === 0 && qaView.tagMismatchKeys.length === 0,
    );

    // And the pixels agree that it was a real, visible difference — the
    // cross-check that this fixture is not a vocabulary artifact.
    if (original.screenshot && clone.screenshot) {
      const pixels = compareImages(
        decodePng(original.screenshot),
        decodePng(clone.screenshot),
      );
      check(
        "the unobserved difference is visible in pixels at @16 amplitude",
        pixels.changedRatioAt16 > 0,
        `@1 ${pixels.changedPixelRatio} · @16 ${pixels.changedRatioAt16}`,
      );
      check(
        "…and perceptually, above the ΔE76 JND",
        pixels.deltaE76AboveJndRatio > 0,
        `ΔE76>2.3 ${pixels.deltaE76AboveJndRatio} · mean ${pixels.deltaE76Mean}`,
      );
    } else {
      check("both fixture screenshots were captured", false);
      check("both fixture screenshots were captured (perceptual)", false);
    }
  } finally {
    await browser.close().catch(() => {});
    await fixture.close();
  }
}

// ---------------------------------------------------------------------------
// 3 + 4. Synthetic pixel buffers: the @16 gate and ΔE76
// ---------------------------------------------------------------------------

/** A uniform RGBA image, alpha 255. */
function solid(width: number, height: number, value: number): DecodedImage {
  const data = Buffer.alloc(width * height * 4);
  for (let i = 0; i < width * height; i++) {
    data[i * 4] = value;
    data[i * 4 + 1] = value;
    data[i * 4 + 2] = value;
    data[i * 4 + 3] = 255;
  }
  return { width, height, data };
}

/** Left half `left`, right half `right` — an exact 0.5 population split. */
function split(width: number, height: number, left: number, right: number): DecodedImage {
  const data = Buffer.alloc(width * height * 4);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      const value = x < width / 2 ? left : right;
      data[i] = value;
      data[i + 1] = value;
      data[i + 2] = value;
      data[i + 3] = 255;
    }
  }
  return { width, height, data };
}

function testAmplitudeChannel(): void {
  section("3. The @16 amplitude gate — synthetic buffers, exact ratios");

  check("the gate is 16/255", CHANGED_PIXEL_AMPLITUDE_THRESHOLD === 16);

  // A uniform 8/255 delta: every pixel changed, none of them by enough.
  const low = compareImages(solid(20, 10, 200), solid(20, 10, 208));
  check("@1 counts every pixel of a uniform 8/255 delta", low.changedPixelRatio === 1);
  check("@16 counts none of them", low.changedRatioAt16 === 0, String(low.changedRatioAt16));
  check("changed-pixel COUNTS agree with the ratios", low.changedPixels === 200 && low.changedPixelsAt16 === 0);
  check("the mean max-channel delta is exactly 8", low.meanMaxChannelDelta === 8);

  // A uniform 20/255 delta: counted by both.
  const high = compareImages(solid(20, 10, 100), solid(20, 10, 120));
  check("@1 counts a uniform 20/255 delta", high.changedPixelRatio === 1);
  check("@16 counts it too", high.changedRatioAt16 === 1);
  check("the mean max-channel delta is exactly 20", high.meanMaxChannelDelta === 20);

  // Exactly at the boundary: 16 is counted, 15 is not (>= not >).
  const at16 = compareImages(solid(10, 10, 100), solid(10, 10, 116));
  const at15 = compareImages(solid(10, 10, 100), solid(10, 10, 115));
  check("a delta of exactly 16 is counted", at16.changedRatioAt16 === 1);
  check("a delta of 15 is not", at15.changedRatioAt16 === 0);

  // Half the image moved by 20, half not at all.
  const mixed = compareImages(split(20, 10, 100, 100), split(20, 10, 120, 100));
  check("a half-changed 20/255 image is 0.5 at @1", mixed.changedPixelRatio === 0.5);
  check("…and 0.5 at @16", mixed.changedRatioAt16 === 0.5);
  check("…with a mean max-channel delta of 10", mixed.meanMaxChannelDelta === 10);

  // Half moved by 20, half by 8: the channels disagree, which is the point.
  const disagreeing = compareImages(split(20, 10, 100, 200), split(20, 10, 120, 208));
  check(
    "a mixed-amplitude image is 1.0 at @1 but 0.5 at @16",
    disagreeing.changedPixelRatio === 1 && disagreeing.changedRatioAt16 === 0.5,
    `@1 ${disagreeing.changedPixelRatio} @16 ${disagreeing.changedRatioAt16}`,
  );

  const identical = compareImages(solid(10, 10, 128), solid(10, 10, 128));
  check(
    "identical images are zero on every channel",
    identical.changedPixelRatio === 0 &&
      identical.changedRatioAt16 === 0 &&
      identical.deltaE76Mean === 0 &&
      identical.deltaE76AboveJndRatio === 0 &&
      identical.meanMaxChannelDelta === 0,
  );

  // Continuity with every historical artifact: the @1 channel is untouched.
  const opposite = compareImages(solid(10, 10, 0), solid(10, 10, 255));
  check(
    "the historical @1 semantics are unchanged (ratio 1, mean 255, max 255)",
    opposite.changedPixelRatio === 1 &&
      opposite.meanAbsoluteRgbDelta === 255 &&
      opposite.maxChannelDelta === 255,
  );
}

function testDeltaE76(): void {
  section("4. CIELab ΔE*76 — reference colour pairs");

  const white = srgbToLab(255, 255, 255);
  const black = srgbToLab(0, 0, 0);
  /*
   * L* is exact for white (the luminance row of the sRGB→XYZ matrix sums to 1),
   * while the a* and b* axes land within ~0.02 of neutral: the published matrix and
   * the D65 white point are each rounded to a few decimals. That residue is far
   * below any threshold this module reports on, so it is asserted, not hidden.
   */
  check(
    "white → L* 100 exactly, a and b neutral within matrix rounding",
    Math.abs(white[0] - 100) < 1e-9 &&
      Math.abs(white[1]) < 0.02 &&
      Math.abs(white[2]) < 0.02,
    white.map((v) => v.toFixed(6)).join(", "),
  );
  check("white vs white is exactly 0", deltaE76(white, white) === 0);
  check(
    "black vs white is 100 (the L* axis end to end)",
    Math.abs(deltaE76(black, white) - 100) < 1e-6,
    String(deltaE76(black, white)),
  );

  /*
   * Independent reference values (Lindbloom / standard sRGB→Lab D65 tables),
   * NOT produced by the implementation under test:
   *
   *   sRGB #FF0000 → L* 53.2408  a*  80.0925  b*   67.2032
   *   sRGB #0000FF → L* 32.2970  a*  79.1875  b* -107.8602
   *
   *   ΔE76 = √(20.9438² + 0.9050² + 175.0634²) = √31 086.7 ≈ 176.31
   */
  const red = srgbToLab(255, 0, 0);
  const blue = srgbToLab(0, 0, 255);
  check(
    "sRGB red matches the reference Lab triple",
    Math.abs(red[0] - 53.2408) < 0.01 &&
      Math.abs(red[1] - 80.0925) < 0.05 &&
      Math.abs(red[2] - 67.2032) < 0.05,
    red.map((v) => v.toFixed(4)).join(", "),
  );
  check(
    "sRGB blue matches the reference Lab triple",
    Math.abs(blue[0] - 32.297) < 0.01 &&
      Math.abs(blue[1] - 79.1875) < 0.05 &&
      Math.abs(blue[2] + 107.8602) < 0.05,
    blue.map((v) => v.toFixed(4)).join(", "),
  );
  check(
    "red vs blue ΔE76 ≈ 176.31 (hand-computed from the reference triples)",
    Math.abs(deltaE76(red, blue) - 176.31) < 0.1,
    String(deltaE76(red, blue)),
  );

  /*
   * The mid pair that makes the case for reporting both channels. Hand
   * computation for grey 200 vs grey 208, D65, a* = b* = 0 for a neutral:
   *
   *   200/255 = 0.784314 → linear ((0.784314+0.055)/1.055)^2.4 = 0.577580
   *            L* = 116·∛0.577580 − 16 = 116·0.832665 − 16 = 80.589
   *   208/255 = 0.815686 → linear ((0.815686+0.055)/1.055)^2.4 = 0.630757
   *            L* = 116·∛0.630757 − 16 = 116·0.857862 − 16 = 83.512
   *   ΔE76 = |83.512 − 80.589| ≈ 2.92
   */
  const grey200 = srgbToLab(200, 200, 200);
  const grey208 = srgbToLab(208, 208, 208);
  check(
    "grey 200 vs grey 208 ΔE76 ≈ 2.92",
    Math.abs(deltaE76(grey200, grey208) - 2.92) < 0.05,
    String(deltaE76(grey200, grey208)),
  );

  section("4b. The channels disagree on purpose");

  // 8/255 of grey is above the JND but below the amplitude gate: @1 says
  // "everything changed", @16 says "nothing did", ΔE76 says "just visible".
  const subtle = compareImages(solid(10, 10, 200), solid(10, 10, 208));
  check(
    "an 8/255 grey shift: @1 = 1, @16 = 0, ΔE76>2.3 = 1",
    subtle.changedPixelRatio === 1 &&
      subtle.changedRatioAt16 === 0 &&
      subtle.deltaE76AboveJndRatio === 1,
    `@1 ${subtle.changedPixelRatio} @16 ${subtle.changedRatioAt16} JND ${subtle.deltaE76AboveJndRatio}`,
  );
  check(
    "…and it is NOT above the clearly-visible ΔE76 10",
    subtle.deltaE76AboveVisibleRatio === 0,
  );

  // 2/255 of grey: pure noise. @1 still says "every pixel changed".
  const noise = compareImages(solid(10, 10, 200), solid(10, 10, 202));
  check(
    "a 2/255 grey shift is 1.0 at @1 and 0 on every perceptual channel",
    noise.changedPixelRatio === 1 &&
      noise.changedRatioAt16 === 0 &&
      noise.deltaE76AboveJndRatio === 0,
    `mean ΔE76 ${noise.deltaE76Mean}`,
  );
  check(
    "…and its mean ΔE76 is below the JND",
    noise.deltaE76Mean < DELTA_E76_JND_THRESHOLD,
    String(noise.deltaE76Mean),
  );

  const opposite = compareImages(solid(10, 10, 0), solid(10, 10, 255));
  check(
    "black vs white is above the clearly-visible threshold everywhere",
    opposite.deltaE76AboveVisibleRatio === 1 && Math.abs(opposite.deltaE76Mean - 100) < 0.01,
    String(opposite.deltaE76Mean),
  );
}

// ---------------------------------------------------------------------------
// 5. All channels reported together
// ---------------------------------------------------------------------------

/** Encode through the module's own codec, so the test drives the real path. */
function pngOf(image: DecodedImage): Buffer {
  return encodePng(image);
}

function testAllChannelsReported(): void {
  section("5. All channels travel together — no single scalar is 'visual truth'");

  const { metric } = measurePair({
    pair: "original-clone",
    a: pngOf(split(20, 10, 100, 200)),
    b: pngOf(split(20, 10, 120, 208)),
    aLabel: "original",
    bLabel: "clone",
  });
  check("the pair measured", metric.available === true);
  const present = (value: unknown): boolean => value !== undefined;
  check(
    "the metric carries @1, @16, ΔE76 fractions, means, common area and heights at once",
    present(metric.changedPixelRatio) &&
      present(metric.changedRatioAt16) &&
      present(metric.deltaE76AboveJndRatio) &&
      present(metric.deltaE76AboveVisibleRatio) &&
      present(metric.deltaE76Mean) &&
      present(metric.deltaE76Max) &&
      present(metric.meanAbsoluteRgbDelta) &&
      present(metric.meanMaxChannelDelta) &&
      present(metric.commonAreaRatio) &&
      present(metric.heightDelta) &&
      present(metric.aHeight) &&
      present(metric.bHeight),
    JSON.stringify(metric),
  );
  check(
    "…and they disagree, which is why all of them are reported",
    metric.changedPixelRatio === 1 && metric.changedRatioAt16 === 0.5,
    `@1 ${metric.changedPixelRatio} @16 ${metric.changedRatioAt16}`,
  );
  check(
    "counts accompany every ratio",
    present(metric.changedPixels) &&
      present(metric.changedPixelsAt16) &&
      present(metric.deltaE76AboveJndPixels) &&
      present(metric.deltaE76AboveVisiblePixels) &&
      present(metric.overlapPixels),
  );

  // A pre-28.5B artifact must still parse: every new field is optional.
  const historical = {
    pair: "snapshot-clone",
    available: true,
    aWidth: 10,
    aHeight: 10,
    bWidth: 10,
    bHeight: 12,
    widthDelta: 0,
    heightDelta: 2,
    meanAbsoluteRgbDelta: 3.5,
    maxChannelDelta: 40,
    changedPixelRatio: 0.9,
    commonAreaRatio: 0.83,
    overlapPixels: 100,
    changedPixels: 90,
  };
  const parsed = ScreenshotMetricSchema.safeParse(historical);
  check("a pre-28.5B screenshot metric still parses", parsed.success, JSON.stringify(parsed));
  check(
    "…and the new channels read as absent, not as zero",
    parsed.success && parsed.data.changedRatioAt16 === undefined,
  );
  // Sanity: the schema is a zod object, so an unknown pair is still rejected.
  check(
    "the schema still rejects an unknown pair name",
    !ScreenshotMetricSchema.safeParse({ ...historical, pair: "bogus" }).success,
  );
}

// ---------------------------------------------------------------------------
// 6. Real-run integration — the comparison runs inside qaOnePage, not beside it
// ---------------------------------------------------------------------------

/**
 * Section 2 proves `compareCapturedStyles` CAN see what the Observer cannot.
 * That is not the same claim as "a real QA run does see it", and the difference
 * is the whole reason this section exists: before Task 28.5B's integration pass
 * the comparison was reachable only from this suite, so an actual run captured
 * the 30 QA-only properties and then compared them against nothing.
 *
 * So this section drives `qaOnePage` — the single entry `run-qa.ts` calls for
 * every page × viewport of every production run — over a live original and a
 * real served clone, and asserts the finding appears in the RETURNED
 * `QaPageResult`. Nothing here calls `compareCapturedStyles` or
 * `compareQaOnlyStyles` directly; if the wiring is removed, this fails.
 *
 * The SiteSpec is a hand-built four-node tree rather than a loaded artifact,
 * because the pairing under test needs exactly three things from it — element
 * count, tag sequence and parent relation, which is what `alignLiveOriginal`
 * checks — and a real SiteSpec would add nothing but load time.
 */
function integrationViewport(): ViewportPageSpec {
  const node = (
    nodeId: string,
    tagName: string,
    parentNodeId: string | undefined,
    childNodeIds: string[],
  ): ElementSpecNode =>
    ({
      nodeId,
      type: "element",
      sourceElementId: `e${nodeId}`,
      ...(parentNodeId !== undefined ? { parentNodeId } : {}),
      childNodeIds,
      tagName,
      attributes: {},
      localVisible: true,
      effectiveVisible: true,
      assetRefs: [],
      relations: [],
      limitations: [],
    }) as unknown as ElementSpecNode;

  // Document order MUST match the original walk: html, body, h1, p.
  const nodes = [
    node("n0", "html", undefined, ["n1"]),
    node("n1", "body", "n0", ["n2", "n3"]),
    node("n2", "h1", "n1", []),
    node("n3", "p", "n1", []),
  ];
  return {
    profile: DESKTOP_PROFILE,
    documentDimensions: {
      viewportWidth: DESKTOP_PROFILE.width,
      viewportHeight: DESKTOP_PROFILE.height,
      documentWidth: DESKTOP_PROFILE.width,
      documentHeight: DESKTOP_PROFILE.height,
      scrollWidth: DESKTOP_PROFILE.width,
      scrollHeight: DESKTOP_PROFILE.height,
    },
    contentRecovery: {},
    rootNodeIds: ["n0"],
    nodes,
    sourceElementCount: nodes.length,
    elementNodeCount: nodes.length,
    textNodeCount: 0,
    localVisibleCount: nodes.length,
    effectiveVisibleCount: nodes.length,
    styleTokenCount: 0,
    assetRefs: [],
    frameInventory: [],
    shadowInventory: {},
    limitations: [],
  } as unknown as ViewportPageSpec;
}

async function runIntegrationPage(
  browser: Awaited<ReturnType<typeof chromium.launch>>,
  baseUrl: string,
): Promise<QaPageResult> {
  const viewport = integrationViewport();
  const page = {
    pageId: "fixture",
    url: `${baseUrl}/original`,
    viewports: { desktop: viewport, mobile: viewport },
  } as unknown as PageSpec;
  const inputs = {
    observedPages: new Map(),
    siteSpec: {
      siteSpec: { rootUrl: baseUrl },
      styleCatalog: { styles: [] },
      assetCatalog: { assets: [] },
    },
  } as unknown as QaInputs;

  return qaOnePage({
    item: {
      page,
      viewport: "desktop",
      clonePath: "/integration/clone",
      profile: DESKTOP_PROFILE,
    },
    inputs,
    browser,
    cloneBaseUrl: baseUrl,
    useLiveOriginal: true,
    collector: new DiffCollector(),
    storedOriginals: new Map(),
  });
}

async function testRealRunIntegration(): Promise<void> {
  section("6. Real-run integration — qaOnePage surfaces the QA-only comparison");

  const fixture = await startFixtureServer();
  const browser = await chromium.launch();
  try {
    const result = await runIntegrationPage(browser, fixture.baseUrl);

    check(
      "qaOnePage returned a result the CURRENT schema accepts",
      QaPageResultSchema.safeParse(result).success,
      JSON.stringify(QaPageResultSchema.safeParse(result).error?.issues?.slice(0, 3)),
    );
    check(
      "the live original aligned, so the pairing exists",
      result.sourceDrift.structurallyAligned === true,
      JSON.stringify(result.sourceDrift),
    );
    check(
      "the page result records a QA-only style verdict at all",
      result.qaOnlyStyleComparison !== undefined,
      String(result.qaOnlyStyleComparison),
    );
    check(
      "…and the verdict is 'compared', not 'unavailable'",
      result.qaOnlyStyleComparison === "compared",
      result.qaOnlyStyleUnavailableReason ?? "",
    );
    check(
      "…over a real number of paired nodes",
      (result.qaOnlyStyleComparedNodes ?? 0) >= 2,
      `${result.qaOnlyStyleComparedNodes} nodes`,
    );
    check(
      "…and a real number of property comparisons",
      (result.qaOnlyStyleComparedProperties ?? 0) > 0,
      `${result.qaOnlyStyleComparedProperties} properties`,
    );
    check(
      "the original side is labelled as the live capture",
      result.qaOnlyStyleOriginalSource === "live",
      String(result.qaOnlyStyleOriginalSource),
    );

    // The finding itself — the thing a run before this integration could not report.
    const named = Object.keys(result.qaOnlyStyleByProperty ?? {});
    check(
      "the run REPORTS QA-only mismatches the SiteSpec axis cannot see",
      (result.qaOnlyStyleMismatches ?? 0) > 0,
      `${result.qaOnlyStyleMismatches} — ${named.join(", ")}`,
    );
    check(
      "…naming -webkit-text-fill-color",
      named.includes("-webkit-text-fill-color"),
      named.join(", "),
    );
    check("…naming text-shadow", named.includes("text-shadow"), named.join(", "));
    check(
      "…naming the background-clip pair",
      named.includes("background-clip") || named.includes("-webkit-background-clip"),
      named.join(", "),
    );
    check(
      "every named property is outside the Observer's whitelist",
      named.length > 0 && named.every((property) => !STYLE_WHITELIST.includes(property)),
      named.join(", "),
    );
    check(
      "…and every named property is in the QA-only tail (nothing else leaked in)",
      named.every((property) => QA_ONLY_STYLE_PROPERTIES.includes(property)),
      named.join(", "),
    );

    // The samples: bounded, keyed by SiteSpec node id, both sides present.
    const samples = result.qaOnlyStyleSamples ?? [];
    check("the result carries an evidence sample list", samples.length > 0);
    check(
      `…bounded by the ${QA_ONLY_STYLE_SAMPLE_LIMIT}-per-page cap`,
      samples.length <= QA_ONLY_STYLE_SAMPLE_LIMIT,
      `${samples.length}`,
    );
    check(
      "…every sample is keyed by a SiteSpec node id that exists in the tree",
      samples.every((sample) => ["n0", "n1", "n2", "n3"].includes(sample.nodeId)),
      samples.map((sample) => sample.nodeId).join(", "),
    );
    check(
      "…and every sample carries BOTH sides' values, differing",
      samples.every(
        (sample) =>
          sample.original !== "" && sample.clone !== "" && sample.original !== sample.clone,
      ),
      JSON.stringify(samples[0]),
    );
    const headline = samples.find((sample) => sample.property === "text-shadow");
    check(
      "the text-shadow sample points at the paragraph node",
      headline?.nodeId === "n3" && headline.tagName === "p",
      JSON.stringify(headline),
    );

    // The counts are UNCAPPED even though the list is: the total is read off the
    // per-property counter, so a page with 500 mismatches still reports 500.
    const summed = Object.values(result.qaOnlyStyleByProperty ?? {}).reduce(
      (sum, n) => sum + n,
      0,
    );
    check(
      "the mismatch total equals the sum of the per-property counts",
      summed === result.qaOnlyStyleMismatches,
      `${summed} vs ${result.qaOnlyStyleMismatches}`,
    );

    // The blindness cross-check, on the SAME run: the SiteSpec-driven style axis
    // reports nothing, because it has nothing to compare these properties with.
    check(
      "…while the SiteSpec-driven style axis reports none of them",
      Object.keys(result.style.byProperty).every(
        (property) => !QA_ONLY_STYLE_PROPERTIES.includes(property),
      ),
      Object.keys(result.style.byProperty).join(", "),
    );

    // --- degrade honestly ---------------------------------------------------
    // The same entry point, with no live original and no stored one: the field
    // must say "unavailable", never 0 mismatches.
    const viewport = integrationViewport();
    const noOriginal = await qaOnePage({
      item: {
        page: {
          pageId: "fixture",
          url: `${fixture.baseUrl}/original`,
          viewports: { desktop: viewport, mobile: viewport },
        } as unknown as PageSpec,
        viewport: "desktop",
        clonePath: "/integration/clone",
        profile: DESKTOP_PROFILE,
      },
      inputs: {
        observedPages: new Map(),
        siteSpec: {
          siteSpec: { rootUrl: fixture.baseUrl },
          styleCatalog: { styles: [] },
          assetCatalog: { assets: [] },
        },
      } as unknown as QaInputs,
      browser,
      cloneBaseUrl: fixture.baseUrl,
      useLiveOriginal: false,
      collector: new DiffCollector(),
      storedOriginals: new Map(),
    });
    check(
      "with no original to pair against, the verdict is 'unavailable'",
      noOriginal.qaOnlyStyleComparison === "unavailable",
      String(noOriginal.qaOnlyStyleComparison),
    );
    check(
      "…with a named reason",
      noOriginal.qaOnlyStyleUnavailableReason === "no-live-original",
      String(noOriginal.qaOnlyStyleUnavailableReason),
    );
    check(
      "…and NO mismatch count is fabricated (absent, not 0)",
      noOriginal.qaOnlyStyleMismatches === undefined,
      String(noOriginal.qaOnlyStyleMismatches),
    );

    // --- 8. the summary and the printed line --------------------------------
    section("7. Summary + printed output carry the new counters");

    const live = summarizeLiveFidelity([result, noOriginal]);
    check(
      "summarizeLiveFidelity reports the compared-pair denominator",
      live.qaOnlyStyleComparedPairs === 1,
      String(live.qaOnlyStyleComparedPairs),
    );
    check(
      "…and the unavailable pairs beside it",
      live.qaOnlyStyleUnavailablePairs === 1,
      String(live.qaOnlyStyleUnavailablePairs),
    );
    check(
      "…the site-wide QA-only mismatch TOTAL",
      live.qaOnlyStyleMismatchTotal === result.qaOnlyStyleMismatches,
      `${live.qaOnlyStyleMismatchTotal} vs ${result.qaOnlyStyleMismatches}`,
    );
    check(
      "…the median per page",
      live.qaOnlyStyleMismatchMedian !== undefined &&
        live.qaOnlyStyleMismatchMedian > 0,
      String(live.qaOnlyStyleMismatchMedian),
    );
    check(
      "…and the per-property breakdown, which names text-shadow",
      Object.keys(live.qaOnlyStyleMismatchByProperty ?? {}).includes("text-shadow"),
      JSON.stringify(live.qaOnlyStyleMismatchByProperty),
    );

    // A pre-28.5B page (no verdict at all) must leave every counter ABSENT,
    // never 0 — the same honesty rule the pixel channels follow.
    const historicalPage = { ...result } as Record<string, unknown>;
    for (const field of Object.keys(historicalPage)) {
      if (field.startsWith("qaOnlyStyle")) delete historicalPage[field];
    }
    const historicalLive = summarizeLiveFidelity([historicalPage as QaPageResult]);
    check(
      "a pre-28.5B run leaves the QA-only counters absent, not 0",
      historicalLive.qaOnlyStyleComparedPairs === undefined &&
        historicalLive.qaOnlyStyleMismatchTotal === undefined,
      JSON.stringify(historicalLive),
    );

    /*
     * `worstPages` only ranks a page that HAS a snapshot↔clone pixel metric, and
     * this fixture has no saved observation screenshot to be that snapshot. So
     * the two real results are given one, leaving every QA-only field exactly as
     * `qaOnePage` produced it — the rendering is what is under test here.
     */
    const withPixels = (source: QaPageResult): QaPageResult => ({
      ...source,
      screenshots: source.screenshots.map((metric) =>
        metric.pair === "snapshot-clone"
          ? {
              ...metric,
              available: true,
              changedPixelRatio: 0.5,
              changedRatioAt16: 0.1,
              meanAbsoluteRgbDelta: 4,
              commonAreaRatio: 1,
              heightDelta: 0,
            }
          : metric,
      ),
    });
    const printed = worstPages([withPixels(result), withPixels(noOriginal)]).visual;
    check(
      "…and both pages are ranked, so the detail lines exist",
      printed.length === 2,
      `${printed.length}`,
    );
    check(
      "worstPages prints the QA-only channel beside the pixel channels",
      printed.some((entry) => (entry.detail ?? "").includes("QA-only style")),
      printed.map((entry) => entry.detail).join(" || "),
    );
    check(
      "…printing 'unavailable' rather than 0 for the page that had no pairing",
      printed.some((entry) => (entry.detail ?? "").includes("unavailable")),
      printed.map((entry) => entry.detail).join(" || "),
    );
  } finally {
    await browser.close().catch(() => {});
    await fixture.close();
  }
}

// ---------------------------------------------------------------------------
// 8. The interaction axis is decoupled too
// ---------------------------------------------------------------------------

/**
 * `interaction-qa.ts` read an interaction target's OPEN-state computed style
 * through `TARGET_STATE_STYLE_PROPERTIES = STYLE_WHITELIST` — the same coupling
 * change 6 removed from page capture, surviving in a second place. An open state
 * whose only difference is a gradient knockout, a `text-shadow` or an `outline`
 * was reported "equivalent" without ever having been looked at.
 *
 * Two things are asserted, and the second matters as much as the first: the
 * import is gone, AND nothing the old list covered was lost on the way out.
 */
async function testInteractionAxisDecoupled(): Promise<void> {
  section("8. Interaction axis — open-state capture owns its vocabulary too");

  const file = path.join(process.cwd(), "src", "reconstruction-qa", "interaction-qa.ts");
  const source = await readFile(file, "utf8");
  const importStatements = [...source.matchAll(/^import[\s\S]*?from\s+"[^"]+";$/gm)].map(
    (match) => match[0],
  );
  check(
    "interaction-qa.ts still has imports to inspect",
    importStatements.length > 0,
    `${importStatements.length} found`,
  );
  check(
    "no import statement in interaction-qa.ts pulls in STYLE_WHITELIST",
    importStatements.every((statement) => !statement.includes("STYLE_WHITELIST")),
    importStatements.filter((statement) => statement.includes("STYLE_WHITELIST")).join(" | "),
  );
  check(
    "…and the constant is no longer an alias of the Observer's list",
    !/TARGET_STATE_STYLE_PROPERTIES:\s*readonly string\[\]\s*=\s*STYLE_WHITELIST/.test(source),
  );
  check(
    "TARGET_STATE_STYLE_PROPERTIES is not reference-equal to STYLE_WHITELIST",
    (TARGET_STATE_STYLE_PROPERTIES as readonly string[]) !==
      (STYLE_WHITELIST as readonly string[]),
  );

  // NO COVERAGE LOSS: every property the old alias contained is still there.
  const now = new Set(TARGET_STATE_STYLE_PROPERTIES);
  const lost = STYLE_WHITELIST.filter((property) => !now.has(property));
  check(
    "every property the old alias covered is still captured (no coverage loss)",
    lost.length === 0,
    lost.join(", "),
  );
  check(
    "…and the QA-only tail is now covered on the interaction axis as well",
    QA_ONLY_STYLE_PROPERTIES.every((property) => now.has(property)),
    QA_ONLY_STYLE_PROPERTIES.filter((property) => !now.has(property)).join(", "),
  );
  check(
    "the list has no duplicates",
    now.size === TARGET_STATE_STYLE_PROPERTIES.length,
    `${now.size} distinct of ${TARGET_STATE_STYLE_PROPERTIES.length}`,
  );
}

// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  console.log("Task 28.5B change 6 — QA independence proof suite");
  await testStaticDecoupling();
  testHonestDegradation();
  testAmplitudeChannel();
  testDeltaE76();
  testAllChannelsReported();
  await testInteractionAxisDecoupled();
  await testObserverBlindnessCatch();
  await testRealRunIntegration();

  console.log("");
  console.log(`${checks - failures}/${checks} checks passed`);
  if (failures > 0) {
    console.log(`FAILED: ${failures}`);
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
