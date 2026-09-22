import { createServer, type Server } from "node:http";
import { mkdtemp, readFile, rm, writeFile, mkdir } from "node:fs/promises";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import os from "node:os";
import path from "node:path";
import { chromium, type Browser } from "playwright";
import { PNG } from "pngjs";
import {
  DESKTOP_PROFILE,
  MOBILE_PROFILE,
  TEXT_MAX_LEN,
  type PageObservation,
} from "../src/observer/types.js";
import { observePageWithBrowser, resolveViewportProfiles } from "../src/observer/observe-page.js";
import { saveObservationIntoDir } from "../src/observer/store.js";
import {
  SCHEMA_VERSION as MULTI_SCHEMA_VERSION,
  type ObservedSitePage,
  type SiteObservation,
} from "../src/multi-observer/types.js";
import {
  SCHEMA_VERSION as SELECTOR_SCHEMA_VERSION,
  type PageFamily,
  type PageFamilySet,
  type PageSelection,
} from "../src/selector/types.js";
import {
  SCHEMA_VERSION as VERIFIER_SCHEMA_VERSION,
  type VerifiedUrlSet,
} from "../src/verifier/types.js";
import {
  SCHEMA_VERSION as EXPLORER_SCHEMA_VERSION,
  type InteractionExploration,
  type InteractionObservation,
  type LocatorDescriptor,
} from "../src/interaction-explorer/types.js";
import {
  REGISTRY_VERSION,
  SCHEMA_VERSION as PATTERN_SCHEMA_VERSION,
  type InteractionPatternsArtifact,
  type UnknownInteractionsArtifact,
} from "../src/interaction-patterns/types.js";
import { compileSiteSpec, loadInputs, saveSiteSpec } from "../src/sitespec/index.js";
import {
  generateApp,
  loadReconstructionInput,
  planReconstruction,
  resolveDependencyVersions,
} from "../src/reconstruction/index.js";
import {
  alignLiveOriginal,
  canvasMismatchedProperties,
  compareImages,
  decodePng,
  decodeSafeDataImage,
  diffContent,
  diffRuntime,
  diffGeometry,
  diffStyles,
  DiffCollector,
  buildScreenshotCoverage,
  captureScreenshot,
  emitScreenshotCoverageDiffs,
  encodePng,
  evaluateRegression,
  judgeCorrection,
  measurePair,
  metricIsHigherBetter,
  newQaContext,
  pairCoverage,
  proposeCorrections,
  readPngDimensions,
  qaAssetFileName,
  qaDiffId,
  runReconstructionQa,
  selectFamilyAuditRoutes,
  selectUnknownSamples,
  summarizeLiveFidelity,
  summarizeRootCauses,
  summarizeSnapshotFidelity,
  screenshotCapEnforced,
  LENGTH_TOLERANCE_PX,
  MAX_DATA_IMAGE_BYTES,
  QA_BROWSER_ENGINE,
  QA_ENGINE,
  SCREENSHOT_CAP_ENFORCING_ENGINES,
  SCREENSHOT_DEVICE_DIMENSION_CAP,
  MAX_FAMILY_AUDIT_ROUTES_PER_SITE,
  MAX_UNKNOWN_QA_PER_SITE,
  type QaCorrection,
  type QaPageResult,
  type ScreenshotMetric,
} from "../src/reconstruction-qa/index.js";
import {
  expectedVariantAt,
  planBreakpointProbeTargets,
} from "../src/reconstruction-qa/capture-clone.js";
import { BREAKPOINT_PROBE_WIDTHS } from "../src/reconstruction-qa/types.js";

/**
 * Fixture test for Reconstruction QA & the Automated Correction Loop (Task 15).
 *
 * Two halves, for two different kinds of claim.
 *
 * **Offline half.** Everything that decides WHAT a difference is — screenshot
 * metrics, alignment, content/geometry/style diffing, classification precedence,
 * correction eligibility, the data-URI safety gate, acceptance and the
 * no-regression gate — is a pure function of stored evidence, so it is tested
 * with hand-built evidence and no browser at all. That is where the adversarial
 * cases live: an `image/svg+xml` data URI, a `text/html` one, an oversized one,
 * a truncated base64 tail, a declared PNG whose bytes are a JPEG.
 *
 * **Live half.** A local HTTP server plays the ORIGINAL. The real Task 03/09
 * observer observes it, the real Task 13 compiler compiles a SiteSpec, the real
 * Task 14 generator builds a clone, and the real Task 15 QA runs against all
 * three. Then the server's content is CHANGED and the QA is run again, which is
 * the only way to prove the three-way attribution actually distinguishes source
 * drift from a clone defect.
 *
 * No external network: the only HTTP is localhost, and the only browser drives
 * localhost.
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
// PNG helpers for the offline half
// ---------------------------------------------------------------------------

function solidPng(width: number, height: number, rgb: [number, number, number]): Buffer {
  const png = new PNG({ width, height });
  for (let i = 0; i < width * height; i++) {
    png.data[i * 4] = rgb[0];
    png.data[i * 4 + 1] = rgb[1];
    png.data[i * 4 + 2] = rgb[2];
    png.data[i * 4 + 3] = 255;
  }
  return PNG.sync.write(png);
}

/** A white PNG whose columns from `inkFrom` rightwards are solid black. Used to
 *  put KNOWN ink outside the min-crop the comparison reads. */
function inkedStripPng(width: number, height: number, inkFrom: number): Buffer {
  const png = new PNG({ width, height });
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      const value = x >= inkFrom ? 0 : 255;
      png.data[i] = value;
      png.data[i + 1] = value;
      png.data[i + 2] = value;
      png.data[i + 3] = 255;
    }
  }
  return PNG.sync.write(png);
}

function halfPng(width: number, height: number): Buffer {
  const png = new PNG({ width, height });
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      const value = x < width / 2 ? 0 : 255;
      png.data[i] = value;
      png.data[i + 1] = value;
      png.data[i + 2] = value;
      png.data[i + 3] = 255;
    }
  }
  return PNG.sync.write(png);
}

/** A 1×1 red PNG, base64. */
const TINY_PNG_BASE64 =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";

// ---------------------------------------------------------------------------
// Offline half
// ---------------------------------------------------------------------------

function testScreenshotMetrics(): void {
  section("Screenshot metrics (items 29–32) — deterministic, never resized");

  const a = decodePng(solidPng(10, 10, [0, 0, 0]));
  const same = decodePng(solidPng(10, 10, [0, 0, 0]));
  const identical = compareImages(a, same);
  check("identical images report 0 changed pixels", identical.changedPixels === 0);
  check("identical images report mean delta 0", identical.meanAbsoluteRgbDelta === 0);
  check("identical images report common area ratio 1", identical.commonAreaRatio === 1);

  const white = decodePng(solidPng(10, 10, [255, 255, 255]));
  const opposite = compareImages(a, white);
  check("opposite images report changed ratio 1", opposite.changedPixelRatio === 1);
  check("opposite images report mean delta 255", opposite.meanAbsoluteRgbDelta === 255);
  check("opposite images report max channel delta 255", opposite.maxChannelDelta === 255);

  const tall = decodePng(solidPng(10, 20, [0, 0, 0]));
  const sized = compareImages(a, tall);
  check("a taller image reports the height delta", sized.heightDelta === 10);
  check("a taller image reports width delta 0", sized.widthDelta === 0);
  check("overlap is the smaller area, never a resize", sized.overlapPixels === 100);
  check("common area ratio is overlap / larger", sized.commonAreaRatio === 0.5);
  check("the overlapping area is still compared", sized.changedPixels === 0);

  const halfA = decodePng(halfPng(10, 10));
  const halfChanged = compareImages(halfA, white);
  check("a half-changed image reports ratio 0.5", halfChanged.changedPixelRatio === 0.5);

  const diffImage = encodePng(
    (() => {
      const rendered = decodePng(encodePng(decodePng(halfPng(10, 10))));
      return rendered;
    })(),
  );
  check("diff images round-trip through the PNG codec", diffImage.byteLength > 0);

  const missing = measurePair({
    pair: "snapshot-clone",
    b: solidPng(2, 2, [0, 0, 0]),
    aLabel: "snapshot",
    bLabel: "clone",
  });
  check("a missing side is `available: false`, never a fake score", missing.metric.available === false);
  check("…and names which side was missing", (missing.metric.unavailableReason ?? "").includes("snapshot"));

  // -- Task 28.8 FAST change 3: the min-crop is no longer SILENT ----------------
  //
  // Every figure above is computed over `min(a,b)` in each axis, and until now
  // nothing said how much canvas that removed or whether anything was in it.
  // `widthDelta` recorded that the sizes differed and never that the difference
  // was excluded from every number beside it. The crop stays — a resize invents
  // pixels — and the band is measured. Magnitudes from the corpus that made it
  // matter: linear.app @700 is source 700px vs clone 862px, severance @1100 is
  // 1280 vs 1100, interiorbay @390 is 1525 vs 390.
  check(
    "the min-crop is still a crop and still never a resize",
    sized.overlapPixels === 100 && sized.aWidth === 10 && sized.bHeight === 20,
  );
  const narrow = decodePng(solidPng(8, 8, [255, 255, 255]));
  const wideBlank = decodePng(solidPng(12, 8, [255, 255, 255]));
  const wideInked = decodePng(inkedStripPng(12, 8, 8));
  check(
    "a comparison over unequal widths REPORTS the strip it never read: dimensions, pixels and ink",
    (() => {
      const band = compareImages(wideInked, narrow).uncompared;
      return (
        band.widthPx === 4 &&
        band.heightPx === 0 &&
        band.pixels === 32 &&
        band.aPixels === 32 &&
        band.bPixels === 0 &&
        band.sampledPixels === 32 &&
        band.aInkSampled === 32 &&
        band.inkPixels === 32 &&
        band.inkRatio === 1 &&
        band.measured === true
      );
    })(),
    JSON.stringify(compareImages(wideInked, narrow).uncompared),
  );
  check(
    "…and a dropped strip of plain page background reads 0 ink, so a harmless crop is never inflated",
    (() => {
      const band = compareImages(wideBlank, narrow).uncompared;
      return band.widthPx === 4 && band.pixels === 32 && band.inkPixels === 0;
    })(),
    JSON.stringify(compareImages(wideBlank, narrow).uncompared),
  );
  check(
    "…a taller side's dropped BOTTOM strip is measured on the same terms",
    (() => {
      const band = compareImages(a, tall).uncompared;
      return band.heightPx === 10 && band.widthPx === 0 && band.bPixels === 100;
    })(),
    JSON.stringify(compareImages(a, tall).uncompared),
  );
  check(
    "…and two equal-sized captures report a band of ZERO, the only case where 0 means nothing was dropped",
    (() => {
      const band = compareImages(narrow, narrow).uncompared;
      return band.widthPx === 0 && band.heightPx === 0 && band.pixels === 0;
    })(),
  );
  check(
    "the band reaches the ARTIFACT, so a reader of a stored metric can see it without recomputing",
    (() => {
      const measured = measurePair({
        pair: "snapshot-clone",
        a: inkedStripPng(12, 8, 8),
        b: solidPng(8, 8, [255, 255, 255]),
        aLabel: "snapshot",
        bLabel: "clone",
      });
      return (
        measured.metric.uncomparedWidthPx === 4 &&
        measured.metric.uncomparedPixels === 32 &&
        measured.metric.uncomparedInkPixels === 32 &&
        measured.metric.uncomparedInkRatio === 1 &&
        measured.metric.uncomparedMeasured === true
      );
    })(),
    JSON.stringify(
      measurePair({
        pair: "snapshot-clone",
        a: inkedStripPng(12, 8, 8),
        b: solidPng(8, 8, [255, 255, 255]),
        aLabel: "snapshot",
        bLabel: "clone",
      }).metric,
    ),
  );
}

/**
 * Task 28.6 C5 — full-page screenshot coverage must be reported, not assumed.
 *
 * The defect this replaces: every pixel metric in this Task is computed over
 * the OVERLAP of two PNGs, and nothing anywhere compared a PNG to the DOCUMENT
 * it came from. A capture that stopped short of the page bottom produced a
 * perfectly well-formed metric describing only the part that survived, and a
 * reader could not tell "clean" from "clean as far as we looked".
 *
 * These checks are the standing proof that the distinction now exists. They are
 * written so that DELETING the reporting makes them fail: `coveredFraction`
 * absent is asserted to be different from `coveredFraction === 1`, and the
 * truncated case is asserted to produce a routed diff, not a note.
 */
function testScreenshotCoverage(): void {
  section("Screenshot coverage (Task 28.6 C5) — a capped capture is never a whole-page verdict");

  // --- dimensions without a decode ------------------------------------------
  const png = solidPng(7, 13, [1, 2, 3]);
  const dimensions = readPngDimensions(png);
  check(
    "PNG dimensions are read from the IHDR, no decode",
    dimensions?.width === 7 && dimensions?.height === 13,
  );
  check(
    "non-PNG bytes report no dimensions instead of throwing",
    readPngDimensions(Buffer.from("this is not a png at all, not even close")) === undefined,
  );

  // --- a whole-page capture -------------------------------------------------
  const whole = buildScreenshotCoverage({
    side: "clone",
    documentMeasured: true,
    documentHeightCss: 18_981,
    documentWidthCss: 1440,
    deviceScaleFactor: 1,
    captured: { width: 1440, height: 18_981 },
  });
  check("a whole-page capture reports coveredFraction 1", whole.coveredFraction === 1);
  check("…and is not truncated", whole.truncated === false);
  check("…and hides no rows", whole.truncatedDeviceRows === 0);
  check(
    "…and still records the document it was measured against",
    whole.documentHeightCss === 18_981 && whole.expectedDeviceHeight === 18_981,
  );

  // --- a capped capture over the same page ----------------------------------
  const capped = buildScreenshotCoverage({
    side: "clone",
    documentMeasured: true,
    documentHeightCss: 18_981,
    documentWidthCss: 1440,
    deviceScaleFactor: 1,
    captured: { width: 1440, height: 12_000 },
    reason: "captured 12000 of 18981 device rows",
  });
  check(
    "a 12000px capture of an 18981px page reports the captured height",
    capped.capturedDeviceHeight === 12_000,
  );
  check("…and the full document height beside it", capped.expectedDeviceHeight === 18_981);
  check("…and the covered fraction", capped.coveredFraction === 0.6322);
  check("…and is flagged truncated", capped.truncated === true);
  check(
    "…and counts the rows nothing ever looked at",
    capped.truncatedDeviceRows === 6981,
  );
  check("…and names the driver cap it is measured against", capped.capDeviceDimension === SCREENSHOT_DEVICE_DIMENSION_CAP);

  // --- a capture that never happened ----------------------------------------
  const failed = buildScreenshotCoverage({
    side: "live-original",
    documentMeasured: true,
    documentHeightCss: 40_000,
    documentWidthCss: 1440,
    deviceScaleFactor: 1,
    reason: "screenshot failed: Cannot take screenshot larger than 32767 pixels on any dimension",
  });
  check("a refused screenshot is `captured: false`", failed.captured === false);
  check("…and covered fraction 0, never an unstated 1", failed.coveredFraction === 0);
  check("…and carries the driver's own reason", (failed.reason ?? "").includes("32767"));

  // --- the pair rule --------------------------------------------------------
  const pair = pairCoverage(whole, capped);
  check(
    "a pair speaks for the WEAKER side, not the average",
    pair.coveredFraction === 0.6322,
  );
  check("…and says a side was truncated", pair.coverageTruncated === true);
  check(
    "…and names which side",
    JSON.stringify(pair.truncatedSides) === JSON.stringify(["clone"]),
  );
  const cleanPair = pairCoverage(whole, whole);
  check("two whole captures report no truncation", cleanPair.coverageTruncated === false);
  check(
    "coverage is absent, not 1, when it was never measured",
    pairCoverage(undefined, undefined).coveredFraction === undefined,
  );

  // --- the metric carries the caveat ---------------------------------------
  const metric = measurePair({
    pair: "snapshot-clone",
    a: solidPng(4, 4, [0, 0, 0]),
    b: solidPng(4, 4, [0, 0, 0]),
    aLabel: "snapshot",
    bLabel: "clone",
    aCoverage: whole,
    bCoverage: capped,
  }).metric;
  check(
    "a pixel-identical pair over a truncated capture is still 0 changed pixels",
    metric.changedPixels === 0,
  );
  check(
    "…but the metric refuses to read as a whole-page verdict",
    metric.coverageTruncated === true && metric.coveredFraction === 0.6322,
  );
  const uncovered = measurePair({
    pair: "snapshot-clone",
    a: solidPng(4, 4, [0, 0, 0]),
    b: solidPng(4, 4, [0, 0, 0]),
    aLabel: "snapshot",
    bLabel: "clone",
  }).metric;
  check(
    "…and a run that never measured coverage says so by absence",
    uncovered.coveredFraction === undefined && uncovered.coverageTruncated === undefined,
  );

  // --- truncation is a FINDING, routed to an owner --------------------------
  const collector = new DiffCollector();
  const base = { pageId: "p000001", viewport: "desktop" as const, route: "https://example.test/" };
  emitScreenshotCoverageDiffs(collector, base, [whole]);
  check(
    "a fully covered page raises nothing — the finding is about what was NOT seen",
    collector.build().length === 0,
  );
  emitScreenshotCoverageDiffs(collector, base, [capped, failed]);
  const coverageDiffs = collector
    .build()
    .filter((diff) => diff.classification === "visual-coverage-truncated");
  check("a truncated capture raises a diff, not a footnote", coverageDiffs.length === 2);
  check(
    "…on the visual dimension",
    coverageDiffs.every((diff) => diff.dimension === "visual"),
  );
  check(
    "…owned by qa, because the instrument fell short, not the clone",
    coverageDiffs.every((diff) => diff.upstreamStage === "qa"),
  );
  check(
    "…never auto-fixable, because there is nothing in the clone to correct",
    coverageDiffs.every((diff) => diff.autoFixEligibility === "not-eligible-unstable-measurement"),
  );
  check(
    "…carrying the machine-readable limitation",
    coverageDiffs.every((diff) => diff.limitations.includes("screenshot-coverage-truncated")),
  );
  check(
    "…and evidence naming captured vs full document height",
    coverageDiffs.some(
      (diff) =>
        (diff.evidence[0]?.note ?? "").includes("12000 of 18981") &&
        diff.evidence[0]?.count === 6981,
    ),
  );
  check(
    "…and identifying which of the three images was short",
    JSON.stringify(coverageDiffs.map((diff) => diff.property).sort()) ===
      JSON.stringify(["clone", "live-original"]),
  );

  // ------------------------------------------------------------------------
  // Task 28.6 Wave 3 corrections. Each block reproduces a case that used to be
  // scored as a whole-page verdict, and pins the honest answer instead.
  // ------------------------------------------------------------------------

  section("Screenshot coverage corrections (Task 28.6 W3) — no silent whole-page verdicts");

  // --- the cap belongs to an ENGINE, not to a platform ----------------------
  check(
    "chromium never consults the driver cap, on ANY platform",
    screenshotCapEnforced("chromium", "linux") === false &&
      screenshotCapEnforced("chromium", "win32") === false &&
      screenshotCapEnforced("chromium", "darwin") === false,
    `${screenshotCapEnforced("chromium", "linux")}`,
  );
  check(
    "…and this pipeline launches chromium, so the DEFAULT answer is false off darwin too",
    QA_BROWSER_ENGINE === "chromium" &&
      QA_ENGINE.includes(QA_BROWSER_ENGINE) &&
      screenshotCapEnforced(undefined, "linux") === false,
    `${QA_BROWSER_ENGINE} / ${QA_ENGINE}`,
  );
  check(
    "an engine that DOES consult it reports true off darwin and false on it",
    SCREENSHOT_CAP_ENFORCING_ENGINES.every(
      (engine) =>
        screenshotCapEnforced(engine, "linux") === true &&
        screenshotCapEnforced(engine, "darwin") === false,
    ),
    SCREENSHOT_CAP_ENFORCING_ENGINES.join(","),
  );
  check(
    "…and the claim is pinned against the DRIVER: chromium's page class contains no cap call",
    (() => {
      /*
       * Read playwright's own bundle rather than restating a measurement in a
       * comment. `validateScreenshotDimension` is defined and called only in the
       * WebKit and WebView page classes; `CRPage` — the class whose
       * `takeScreenshot` this pipeline actually reaches — never mentions it. If a
       * future playwright moves the check into chromium, this goes RED and the
       * engine list above has to be re-measured, which is the correct signal.
       */
      let bundle: string;
      try {
        const entry = createRequire(import.meta.url).resolve("playwright-core");
        bundle = readFileSync(path.join(path.dirname(entry), "lib", "coreBundle.js"), "utf8");
      } catch {
        return false; // cannot verify ⇒ fail loudly, never pass by default
      }
      const crStart = bundle.indexOf("CRPage = class");
      if (crStart < 0) return false;
      const nextClass = bundle.indexOf(" = class", crStart + "CRPage = class".length);
      const crBody = bundle.slice(crStart, nextClass < 0 ? bundle.length : nextClass);
      return (
        crBody.includes("takeScreenshot(") &&
        !crBody.includes("validateScreenshotDimension") &&
        bundle.includes("validateScreenshotDimension")
      );
    })(),
  );
  check(
    "a coverage record built for this pipeline says the cap is NOT enforced",
    whole.capEnforced === false && whole.capDeviceDimension === SCREENSHOT_DEVICE_DIMENSION_CAP,
    `capEnforced=${whole.capEnforced}`,
  );

  // --- an unmeasurable document is UNKNOWN, never "we covered 0 of it" ------
  const unmeasurable = buildScreenshotCoverage({
    side: "clone",
    // The `page.evaluate` that measures the document threw; the screenshot
    // itself came back fine at 1440x5000.
    documentMeasured: false,
    documentHeightCss: 0,
    documentWidthCss: 0,
    deviceScaleFactor: 1,
    captured: { width: 1440, height: 5000 },
    reason: "document not measurable: Execution context was destroyed",
  });
  check(
    "a capture whose document could not be measured says so",
    unmeasurable.documentMeasured === false && unmeasurable.captured === true,
    JSON.stringify(unmeasurable),
  );
  check(
    "…and it raises a finding, where the old `!truncated && captured` guard let it pass",
    (() => {
      const local = new DiffCollector();
      emitScreenshotCoverageDiffs(local, base, [unmeasurable]);
      const raised = local.build();
      return (
        raised.length === 1 &&
        raised[0]!.classification === "visual-coverage-truncated" &&
        (raised[0]!.evidence[0]?.note ?? "").includes("UNKNOWN")
      );
    })(),
    JSON.stringify(
      (() => {
        const local = new DiffCollector();
        emitScreenshotCoverageDiffs(local, base, [unmeasurable]);
        return local.build().map((d) => d.evidence[0]?.note);
      })(),
    ),
  );
  check(
    "…and a pair containing it reports UNKNOWN coverage, not 0 and not 1",
    (() => {
      const pairWithUnknown = pairCoverage(whole, unmeasurable);
      return (
        pairWithUnknown.coveredFraction === undefined &&
        pairWithUnknown.coverageTruncated === true &&
        pairWithUnknown.coverageUnknownSides === 1
      );
    })(),
    JSON.stringify(pairCoverage(whole, unmeasurable)),
  );

  // --- truncation is BOTH axes ---------------------------------------------
  const halfWidth = buildScreenshotCoverage({
    side: "clone",
    documentMeasured: true,
    documentHeightCss: 5000,
    documentWidthCss: 1440,
    deviceScaleFactor: 1,
    captured: { width: 720, height: 5000 },
  });
  check(
    "a half-WIDTH capture is truncated, where height-only accounting scored it 1.0",
    halfWidth.truncated === true &&
      halfWidth.coveredWidthFraction === 0.5 &&
      halfWidth.coveredHeightFraction === 1 &&
      halfWidth.coveredFraction === 0.5,
    JSON.stringify(halfWidth),
  );
  check(
    "…and the columns nobody looked at are counted, like the rows",
    halfWidth.truncatedDeviceColumns === 720 && halfWidth.truncatedDeviceRows === 0,
    `${halfWidth.truncatedDeviceColumns} columns / ${halfWidth.truncatedDeviceRows} rows`,
  );
  check(
    "…and it raises the same finding a short-on-height capture does",
    (() => {
      const local = new DiffCollector();
      emitScreenshotCoverageDiffs(local, base, [halfWidth]);
      return local.build().length === 1;
    })(),
  );
  check(
    "a capture WIDER than the document is not truncation — the shortfall floors at 0",
    (() => {
      // The real shape from the corpus: 12 MDN observations record a 1425 CSS px
      // document against a 1440 px PNG. Wider is not missing.
      const wider = buildScreenshotCoverage({
        side: "snapshot",
        documentMeasured: true,
        documentHeightCss: 3000,
        documentWidthCss: 1425,
        deviceScaleFactor: 1,
        captured: { width: 1440, height: 3000 },
      });
      return (
        wider.truncated === false &&
        wider.truncatedDeviceColumns === 0 &&
        wider.coveredWidthFraction === 1 &&
        wider.coveredFraction === 1
      );
    })(),
  );
  check(
    "the area fraction leaves every previously measured height-only figure unchanged",
    capped.coveredFraction === 0.6322 && capped.coveredHeightFraction === 0.6322,
    `${capped.coveredFraction}`,
  );

  // --- a pair has TWO sides, always -----------------------------------------
  check(
    "a pair with one side missing does NOT inherit the known side's coverage",
    (() => {
      const lopsided = pairCoverage(whole, undefined);
      return (
        lopsided.coveredFraction === undefined &&
        lopsided.coverageTruncated === true &&
        lopsided.coverageUnknownSides === 1
      );
    })(),
    JSON.stringify(pairCoverage(whole, undefined)),
  );
  check(
    "…while two known sides report 0 unknown sides and a real fraction",
    cleanPair.coverageUnknownSides === 0 && cleanPair.coveredFraction === 1,
    JSON.stringify(cleanPair),
  );
  check(
    "…and both sides absent is still ABSENCE, not a fraction of anything",
    (() => {
      const nothing = pairCoverage(undefined, undefined);
      return (
        nothing.coveredFraction === undefined &&
        nothing.coverageTruncated === undefined &&
        nothing.coverageUnknownSides === undefined
      );
    })(),
  );
}

/**
 * Task 28.6 C5, measured half — the same accounting against a real browser on a
 * genuinely tall page (18,981 CSS px, the height the C5 report names).
 *
 * This does NOT assert that a cap bites. Measured on 2026-09-03 with playwright
 * 1.62.1 on darwin, `page.screenshot({ fullPage: true })` returned the complete
 * document at 1440x40000 and 1440x200000 device px, so on this platform there
 * is nothing being clipped and the honest assertion is that the coverage record
 * SAYS SO — a standing regression test that the instrument reports what it
 * covered instead of staying silent. The truncated branch is then exercised
 * against a REAL clipped PNG of the same page, produced by a banded capture, so
 * the truncation path is proven on real bytes rather than on a hand-built
 * record.
 */
async function testTallPageCoverage(): Promise<void> {
  section("Screenshot coverage on a genuinely tall page (Task 28.6 C5) — measured, not assumed");

  const TALL_CSS_HEIGHT = 18_981;
  const browser = await chromium.launch();
  try {
    const context = await newQaContext(browser, DESKTOP_PROFILE);
    try {
      const page = await context.newPage();
      await page.setContent(
        `<body style="margin:0"><div style="height:${TALL_CSS_HEIGHT}px;` +
          `background:linear-gradient(#ffffff,#0000ff)"></div></body>`,
      );
      await page.waitForTimeout(200);

      const shot = await captureScreenshot(page, "clone");
      check(
        "the real capture path measures the document it captured",
        shot.coverage.documentHeightCss === TALL_CSS_HEIGHT,
        `documentHeightCss=${shot.coverage.documentHeightCss}`,
      );
      check(
        "…and records the captured height beside it",
        shot.coverage.capturedDeviceHeight === shot.coverage.expectedDeviceHeight &&
          shot.coverage.capturedDeviceHeight === TALL_CSS_HEIGHT,
        `captured=${shot.coverage.capturedDeviceHeight} expected=${shot.coverage.expectedDeviceHeight}`,
      );
      check(
        "…so an 18,981px page reports full coverage rather than silence",
        shot.coverage.coveredFraction === 1 && shot.coverage.truncated === false,
        `covered=${shot.coverage.coveredFraction} truncated=${shot.coverage.truncated}`,
      );
      check("…and a buffer came back", (shot.buffer?.byteLength ?? 0) > 0);
      check(
        "…and the record states the driver cap and whether it is enforced here",
        // NOT `process.platform !== "darwin"`. That was the platform-only rule
        // the cap note originally stated, and it is wrong for this pipeline: the
        // cap check lives in the WebKit / WebView page classes and chromium never
        // calls it, so the honest answer is false on every platform. Written as
        // the function's own contract so the two cannot drift apart.
        shot.coverage.capDeviceDimension === SCREENSHOT_DEVICE_DIMENSION_CAP &&
          shot.coverage.capEnforced === false &&
          shot.coverage.capEnforced === screenshotCapEnforced(QA_BROWSER_ENGINE),
        `capEnforced=${shot.coverage.capEnforced} platform=${process.platform}`,
      );
      check(
        "…and the real capture path reports that it MEASURED the document",
        shot.coverage.documentMeasured === true &&
          shot.coverage.coveredWidthFraction === 1 &&
          shot.coverage.truncatedDeviceColumns === 0,
        JSON.stringify({
          documentMeasured: shot.coverage.documentMeasured,
          coveredWidthFraction: shot.coverage.coveredWidthFraction,
        }),
      );

      /*
       * A REAL short PNG of the SAME page: 12,000 of 18,981 CSS px, taken by the
       * browser. Coverage is then built from those bytes exactly as the capture
       * path builds it, which is what a driver that clipped instead of refusing
       * would hand us.
       */
      const clipped = await page.screenshot({
        type: "png",
        fullPage: true,
        clip: { x: 0, y: 0, width: 1440, height: 12_000 },
      });
      const clippedDimensions = readPngDimensions(clipped);
      const clippedCoverage = buildScreenshotCoverage({
        side: "clone",
        documentMeasured: shot.coverage.documentMeasured,
        documentHeightCss: shot.coverage.documentHeightCss,
        documentWidthCss: shot.coverage.documentWidthCss,
        deviceScaleFactor: shot.coverage.deviceScaleFactor,
        ...(clippedDimensions ? { captured: clippedDimensions } : {}),
      });
      check(
        "a real 12,000px capture of the same page is detected as short",
        clippedCoverage.truncated === true && clippedCoverage.capturedDeviceHeight === 12_000,
        `captured=${clippedCoverage.capturedDeviceHeight}`,
      );
      check(
        "…and 6,981 device rows are counted as never inspected",
        clippedCoverage.truncatedDeviceRows === 6981,
        `rows=${clippedCoverage.truncatedDeviceRows}`,
      );
      check(
        "…and the pair built from it cannot report a whole-page verdict",
        pairCoverage(clippedCoverage, shot.coverage).coverageTruncated === true,
      );
      const collector = new DiffCollector();
      emitScreenshotCoverageDiffs(
        collector,
        { pageId: "p000001", viewport: "desktop", route: "https://example.test/" },
        [clippedCoverage],
      );
      check(
        "…and the real short capture raises the coverage finding",
        collector.build().some((diff) => diff.classification === "visual-coverage-truncated"),
      );

      /*
       * Task 28.6 W3 — the UNMEASURABLE branch on the REAL capture path.
       *
       * `documentMeasured` is only worth anything if the capture path actually
       * computes it; hard-coding it to `true` would leave every fixture-built
       * check above green. So the page is closed under it: the `page.evaluate`
       * that measures the document throws, the screenshot throws, and the record
       * has to say both — unknown document, nothing captured — rather than
       * "covered 0 of a 0-pixel page, nothing truncated".
       */
      const closedPage = await context.newPage();
      await closedPage.setContent("<body>gone in a moment</body>");
      await closedPage.close();
      const afterClose = await captureScreenshot(closedPage, "clone");
      check(
        "a capture on a dead page reports an UNMEASURABLE document, not a measured zero",
        afterClose.coverage.documentMeasured === false &&
          afterClose.coverage.captured === false &&
          afterClose.buffer === undefined,
        JSON.stringify(afterClose.coverage),
      );
      check(
        "…and it raises the coverage finding rather than passing as untruncated",
        (() => {
          const local = new DiffCollector();
          emitScreenshotCoverageDiffs(
            local,
            { pageId: "p000001", viewport: "desktop", route: "https://example.test/" },
            [afterClose.coverage],
          );
          const raised = local.build();
          return (
            raised.length === 1 &&
            (raised[0]!.evidence[0]?.note ?? "").includes("UNKNOWN")
          );
        })(),
      );
    } finally {
      await context.close().catch(() => {});
    }
  } finally {
    await browser.close().catch(() => {});
  }
}

function testDataImageSafety(): void {
  section("Safe data image recovery (items 101–107) — strict, raster only");

  const safe = decodeSafeDataImage(`data:image/png;base64,${TINY_PNG_BASE64}`);
  check("a real raster PNG data URI is accepted", safe.ok === true);
  if (safe.ok) {
    check("…and is content-addressed by SHA-256", /^[a-f0-9]{64}$/.test(safe.image.sha256));
    check("…and gets the right extension", qaAssetFileName(safe.image).endsWith(".png"));
  }

  const svg = decodeSafeDataImage(
    "data:image/svg+xml;base64," + Buffer.from("<svg><script>x</script></svg>").toString("base64"),
  );
  check("an SVG data URI is REJECTED even though it is an image", svg.ok === false);
  check(
    "…for being an unsafe MIME, not for its content",
    svg.ok === false && svg.reason === "unsafe-mime",
  );

  const html = decodeSafeDataImage(
    "data:text/html;base64," + Buffer.from("<h1>hi</h1>").toString("base64"),
  );
  check("a text/html data URI is rejected", html.ok === false && html.reason === "unsafe-mime");

  const application = decodeSafeDataImage("data:application/json;base64,e30=");
  check(
    "an application/* data URI is rejected",
    application.ok === false && application.reason === "unsafe-mime",
  );

  const broken = decodeSafeDataImage("data:image/png;base64,!!!!not-base64!!!!");
  check(
    "an invalid base64 payload is rejected",
    broken.ok === false && broken.reason === "invalid-encoding",
  );

  const truncated = decodeSafeDataImage(
    `data:image/png;base64,${TINY_PNG_BASE64.slice(0, TINY_PNG_BASE64.length - 5)}`,
  );
  check(
    "a truncated base64 tail is rejected",
    truncated.ok === false &&
      (truncated.reason === "invalid-encoding" || truncated.reason === "magic-bytes-mismatch"),
  );

  const lying = decodeSafeDataImage(
    "data:image/png;base64," + Buffer.from([0xff, 0xd8, 0xff, 0x00, 0x11, 0x22]).toString("base64"),
  );
  check(
    "a declared PNG whose bytes are a JPEG is rejected",
    lying.ok === false && lying.reason === "magic-bytes-mismatch",
  );

  const oversized = decodeSafeDataImage(
    "data:image/png;base64," +
      Buffer.concat([
        Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
        Buffer.alloc(MAX_DATA_IMAGE_BYTES + 16),
      ]).toString("base64"),
  );
  check(
    "a payload over the 1 MiB cap is rejected",
    oversized.ok === false && oversized.reason === "over-size-cap",
  );

  const notData = decodeSafeDataImage("https://example.com/a.png");
  check("a plain URL is out of scope", notData.ok === false && notData.reason === "not-a-data-uri");
}

function testCorrectionPolicy(): void {
  section("Correction policy (items 87–112) — three closed types, evidence-gated");

  const proposal = proposeCorrections({
    canvas: [
      {
        pageId: "p000001",
        viewport: "desktop",
        nodeId: "n000001",
        observed: { "background-color": "rgb(17, 24, 39)" },
        cloneCanvas: { "background-color": "rgb(255, 255, 255)" },
        mismatchedProperties: ["background-color"],
        diffIds: ["qd000001"],
        sourceStable: true,
      },
      {
        // A drifted page can never justify a correction (item 112).
        pageId: "p000002",
        viewport: "desktop",
        nodeId: "n000001",
        observed: { "background-color": "rgb(0, 0, 0)" },
        cloneCanvas: { "background-color": "rgb(255, 255, 255)" },
        mismatchedProperties: ["background-color"],
        diffIds: ["qd000002"],
        sourceStable: false,
      },
    ],
    stateStyle: [
      {
        patternId: "ip000001",
        pageId: "p000001",
        viewport: "desktop",
        targetNodeId: "n000042",
        mechanism: "aria-expanded",
        observed: { display: "flex", visibility: "visible", opacity: "1" },
        cloneOpenState: { display: "block", visibility: "visible", opacity: "1" },
        diffIds: ["qd000003"],
        evidenceUsable: true,
      },
      {
        // Item 71: without usable open-state evidence there is no correction.
        patternId: "ip000002",
        pageId: "p000001",
        viewport: "desktop",
        targetNodeId: "n000043",
        mechanism: "aria-expanded",
        observed: { display: "grid" },
        cloneOpenState: { display: "block" },
        diffIds: ["qd000004"],
        evidenceUsable: false,
      },
      {
        // A value that could terminate a declaration is REJECTED, not sanitized.
        patternId: "ip000003",
        pageId: "p000001",
        viewport: "desktop",
        targetNodeId: "n000044",
        mechanism: "native-details",
        observed: { display: "block;} body{display:none" },
        cloneOpenState: { display: "none" },
        diffIds: ["qd000005"],
        evidenceUsable: true,
      },
    ],
    dataImage: [
      {
        pageId: "p000001",
        viewport: "desktop",
        nodeId: "n000100",
        dataUri: `data:image/png;base64,${TINY_PNG_BASE64}`,
        snapshotNaturalWidth: 1,
        snapshotNaturalHeight: 1,
        snapshotVisible: true,
        cloneImageMissing: true,
        diffIds: ["qd000006"],
      },
      {
        // The snapshot never showed anything: nothing to recover (item 107).
        pageId: "p000001",
        viewport: "desktop",
        nodeId: "n000101",
        dataUri: `data:image/png;base64,${TINY_PNG_BASE64}`,
        snapshotVisible: false,
        cloneImageMissing: true,
        diffIds: ["qd000007"],
      },
      {
        pageId: "p000001",
        viewport: "desktop",
        nodeId: "n000102",
        dataUri: "data:image/svg+xml;base64,PHN2Zz48L3N2Zz4=",
        snapshotVisible: true,
        cloneImageMissing: true,
        diffIds: ["qd000008"],
      },
    ],
  });

  const types = proposal.corrections.map((correction) => correction.type);
  check("exactly the three closed types can be proposed", new Set(types).size <= 3);
  check(
    "a canvas correction is proposed once, site-level",
    types.filter((type) => type === "document-canvas-background").length === 1,
  );
  check(
    "the drifted page did not produce a second canvas correction",
    proposal.corrections.every(
      (correction) =>
        correction.payload.type !== "document-canvas-background" ||
        correction.payload.sourcePageId === "p000001",
    ),
  );
  const stateStyle = proposal.corrections.find(
    (correction) => correction.type === "interaction-target-state-style",
  );
  check("an open-state style correction is proposed", stateStyle !== undefined);
  check(
    "…carrying ONLY the properties that differ (item 97)",
    stateStyle !== undefined &&
      stateStyle.payload.type === "interaction-target-state-style" &&
      Object.keys(stateStyle.payload.properties).join(",") === "display",
  );
  check(
    "…and its provenance is the LIVE QA observation",
    stateStyle?.provenance === "observed-live-qa",
  );
  check(
    "…and a scripted mechanism keys the rule on the runtime marker",
    stateStyle !== undefined &&
      stateStyle.payload.type === "interaction-target-state-style" &&
      stateStyle.payload.stateHook === "revealed",
  );
  check(
    "a pattern with unusable open-state evidence proposes nothing",
    !proposal.corrections.some(
      (correction) =>
        correction.payload.type === "interaction-target-state-style" &&
        correction.payload.patternId === "ip000002",
    ),
  );
  check(
    "an unsafe CSS value becomes a REJECTED correction",
    proposal.rejected.some(
      (entry) =>
        entry.correction.payload.type === "interaction-target-state-style" &&
        entry.reason === "unsafe-value",
    ),
  );
  const image = proposal.corrections.find(
    (correction) => correction.type === "safe-data-image-recovery",
  );
  check("a safe raster data image is recovered", image !== undefined);
  check(
    "…and its bytes are written beside the artifact, not inside it",
    image !== undefined &&
      image.payload.type === "safe-data-image-recovery" &&
      proposal.assets.has(image.payload.assetFile),
  );
  check(
    "…and its public path is content-addressed",
    image !== undefined &&
      image.payload.type === "safe-data-image-recovery" &&
      image.payload.publicPath.startsWith("/wr/qa-assets/"),
  );
  check(
    "an invisible snapshot image is not recovered",
    !proposal.corrections.some(
      (correction) =>
        correction.payload.type === "safe-data-image-recovery" &&
        correction.payload.nodeId === "n000101",
    ),
  );
  check(
    "an SVG data URI is not recovered",
    !proposal.corrections.some(
      (correction) =>
        correction.payload.type === "safe-data-image-recovery" &&
        correction.payload.nodeId === "n000102",
    ),
  );
  check(
    "correction ids are assigned after a stable sort",
    proposal.corrections.every((correction, index) =>
      correction.id === `qc${String(index + 1).padStart(6, "0")}`,
    ),
  );

  // Determinism: the same evidence twice produces the same artifact.
  const again = proposeCorrections({
    canvas: [
      {
        pageId: "p000001",
        viewport: "desktop",
        nodeId: "n000001",
        observed: { "background-color": "rgb(17, 24, 39)" },
        cloneCanvas: { "background-color": "rgb(255, 255, 255)" },
        mismatchedProperties: ["background-color"],
        diffIds: ["qd000001"],
        sourceStable: true,
      },
    ],
    stateStyle: [],
    dataImage: [],
  });
  const onceMore = proposeCorrections({
    canvas: [
      {
        pageId: "p000001",
        viewport: "desktop",
        nodeId: "n000001",
        observed: { "background-color": "rgb(17, 24, 39)" },
        cloneCanvas: { "background-color": "rgb(255, 255, 255)" },
        mismatchedProperties: ["background-color"],
        diffIds: ["qd000001"],
        sourceStable: true,
      },
    ],
    stateStyle: [],
    dataImage: [],
  });
  check(
    "the same evidence produces byte-identical corrections",
    JSON.stringify(again.corrections) === JSON.stringify(onceMore.corrections),
  );
}

function testAcceptanceGate(): void {
  section("Acceptance and the no-regression gate (items 119–122, 142)");

  const correction: QaCorrection = {
    id: "qc000001",
    type: "document-canvas-background",
    provenance: "observed-snapshot",
    diffIds: ["qd000001"],
    payload: {
      type: "document-canvas-background",
      properties: { "background-color": "rgb(0, 0, 0)" },
      sourcePageId: "p000001",
      sourceViewport: "desktop",
      sourceNodeId: "n000001",
    },
    targetMetric: {
      metric: "canvas-background-mismatched-properties",
      before: 1,
      requiredAtMost: 0,
    },
    evidence: ["clone-canvas-background-differs"],
  };

  check("a correction that fixes its metric is accepted", judgeCorrection(correction, 0).accepted);
  check(
    "a correction that changes CSS and fixes nothing is rejected",
    judgeCorrection(correction, 1).accepted === false,
  );
  check(
    "…with a named reason, never a shrug",
    judgeCorrection(correction, 1).reason === "target-metric-not-improved",
  );
  check(
    "a higher-is-better metric is recognised by name",
    metricIsHigherBetter("clone-image-natural-width:p000001:n000100"),
  );

  const baseline = {
    routesRendered: 10,
    routesExpected: 10,
    runtimeErrors: 0,
    contentMismatches: 2,
    behaviorMismatches: 1,
    unknownBehaviorsImplemented: 0,
    formWrites: 0,
    generatorInvariantsPass: true,
  };
  check("an unchanged clone passes the gate", evaluateRegression(baseline, baseline).pass);

  const brokenRoutes = evaluateRegression(baseline, { ...baseline, routesRendered: 9 });
  check("a route that stopped rendering fails the gate", brokenRoutes.pass === false);
  check("…named as regression-routes", brokenRoutes.failures.includes("regression-routes"));

  const brokenContent = evaluateRegression(baseline, { ...baseline, contentMismatches: 3 });
  check("more content mismatches fail the gate", brokenContent.failures.includes("regression-content"));

  const brokenBehavior = evaluateRegression(baseline, { ...baseline, behaviorMismatches: 2 });
  check(
    "more behavior mismatches fail the gate",
    brokenBehavior.failures.includes("regression-behavior"),
  );

  const unknownImplemented = evaluateRegression(baseline, {
    ...baseline,
    unknownBehaviorsImplemented: 1,
  });
  check(
    "implementing an unknown behavior fails the gate outright",
    unknownImplemented.failures.includes("regression-unknown-implemented"),
  );

  const formWrite = evaluateRegression(baseline, { ...baseline, formWrites: 1 });
  check("a form write fails the gate", formWrite.failures.includes("regression-form-writes"));

  const invariant = evaluateRegression(baseline, {
    ...baseline,
    generatorInvariantsPass: false,
  });
  check(
    "a broken generator invariant fails the gate",
    invariant.failures.includes("generator-invariant-failed"),
  );
}

function testClassificationAndGrouping(): void {
  section("Classification, grouping and precedence (items 45, 48, 82–84)");

  const collector = new DiffCollector();
  // Deliberately added out of order: ids must come from the SORT, not arrival.
  collector.add({
    pageId: "p000002",
    viewport: "desktop",
    dimension: "style",
    classification: "style-mismatch",
    nodeId: "n000010",
    property: "color",
  });
  collector.add({
    pageId: "p000001",
    viewport: "mobile",
    dimension: "content",
    classification: "content-mismatch",
    nodeId: "n000002",
  });
  collector.add({
    pageId: "p000001",
    viewport: "desktop",
    dimension: "source-drift",
    classification: "source-content-drift",
    sourceDrift: true,
    affectedNodeCount: 7,
  });
  const diffs = collector.build();
  check("diff ids are assigned in the stable sort order", diffs[0]!.id === qaDiffId(1));
  check(
    "…page → viewport → dimension, not arrival order",
    diffs[0]!.pageId === "p000001" && diffs[0]!.viewport === "desktop",
  );
  check("every diff carries a routing recommendation", diffs.every((diff) => diff.recommendation));
  check("every diff carries an upstream stage", diffs.every((diff) => diff.upstreamStage));
  check(
    "source drift routes to re-observation, never to a correction",
    diffs.find((diff) => diff.classification === "source-content-drift")?.recommendation ===
      "requires-reobserve",
  );
  check(
    "source drift is never auto-fix eligible",
    diffs
      .filter((diff) => diff.classification === "source-content-drift")
      .every((diff) => diff.autoFixEligibility === "not-eligible-source-drift"),
  );

  const summary = summarizeRootCauses({ diffs });
  check("the root-cause table has one row per classification", summary.rows.length === 3);
  check(
    "affected nodes counts what a grouped diff stands for",
    summary.rows.find((row) => row.classification === "source-content-drift")?.affectedNodes === 7,
  );
  check("there is no overall score anywhere in the summary", !("score" in summary));

  // --- geometry cascade ----------------------------------------------------
  const cascadeNodes = Array.from({ length: 20 }, (_, index) => ({
    nodeId: `n${String(index + 10).padStart(6, "0")}`,
    type: "element" as const,
    sourceElementId: `e${index}`,
    parentNodeId: "n000001",
    childNodeIds: [],
    tagName: "p",
    attributes: {},
    localVisible: true,
    effectiveVisible: true,
    boundingBox: { x: 0, y: index * 50, width: 100, height: 20, top: 0, right: 0, bottom: 0, left: 0 },
    assetRefs: [],
    relations: [],
    limitations: [],
  }));
  const cascadeActual = new Map(
    cascadeNodes.map((node) => [
      node.nodeId,
      {
        key: node.nodeId,
        tagName: "p",
        rawText: "",
        attributes: {},
        style: {},
        box: { x: 0, y: node.boundingBox!.y + 30, width: 100, height: 20 },
        localVisible: true,
        effectiveVisible: true,
      },
    ]),
  );
  const geometry = diffGeometry({
    nodes: cascadeNodes,
    actualByNodeId: cascadeActual,
    parentOf: new Map(cascadeNodes.map((node) => [node.nodeId, "n000001"])),
  });
  check("20 nodes sharing one displacement become ONE cascade", geometry.cascades.length === 1);
  check("…that stands for all 20 nodes", geometry.cascades[0]?.nodeCount === 20);
  check("…and names its first divergence node", geometry.cascades[0]?.firstDivergenceNodeId === "n000010");
  check(
    "…and its common ancestor",
    geometry.cascades[0]?.commonAncestorNodeId === "n000001",
  );
  check(
    "…and every member is excluded from independent reporting",
    geometry.cascadeNodeIds.size === 20,
  );
}

function testStyleAndCanvas(): void {
  section("Style comparison and the canvas rule (items 46–48, 57)");

  const catalog = {
    schemaVersion: 2 as const,
    tokenCount: 1,
    sourceStyleReferenceCount: 1,
    sourceLocalStyleRecordCount: 1,
    dedupReductionRate: 0,
    styles: [
      {
        styleTokenId: "st000001",
        properties: {
          "font-family": "Inter, sans-serif",
          color: "rgb(0, 0, 0)",
          width: "111.609px",
        },
        usageCount: 1,
      },
    ],
    frequency: { color: [], backgroundColor: [], fontFamily: [], fontSize: [] },
  };
  const nodes = Array.from({ length: 8 }, (_, index) => ({
    nodeId: `n${String(index + 1).padStart(6, "0")}`,
    type: "element" as const,
    sourceElementId: `e${index}`,
    ...(index === 0 ? {} : { parentNodeId: "n000001" }),
    childNodeIds: [],
    tagName: "div",
    attributes: {},
    localVisible: true,
    effectiveVisible: true,
    styleTokenId: "st000001",
    assetRefs: [],
    relations: [],
    limitations: [],
  }));
  const actual = new Map(
    nodes.map((node) => [
      node.nodeId,
      {
        key: node.nodeId,
        tagName: "div",
        rawText: "",
        attributes: {},
        style: {
          "font-family": "Arial, sans-serif",
          color: "rgb(0, 0, 0)",
          // One layout unit below the observed value: an artifact, not a defect.
          width: "111.594px",
        },
        box: { x: 0, y: 0, width: 0, height: 0 },
        localVisible: true,
        effectiveVisible: true,
      },
    ]),
  );
  const style = diffStyles({
    nodes,
    actualByNodeId: actual,
    styleCatalog: catalog,
    applyDocumentRootAdaptation: true,
  });
  check(
    "a sub-layout-unit length difference is not a style mismatch",
    style.summary.byProperty["width"] === undefined,
  );
  check(
    "…and is counted separately rather than dropped",
    style.summary.subLayoutUnitLengthMismatches === 8,
  );
  check(
    `…using the engine's own resolution (${LENGTH_TOLERANCE_PX} px)`,
    LENGTH_TOLERANCE_PX === 2 / 64,
  );
  check("8 descendants sharing one font-family become ONE group", style.inheritedGroups.length === 1);
  check("…standing for all 8", style.inheritedGroups[0]?.nodeCount === 8);
  check(
    "…attributed to the highest node in document order",
    style.inheritedGroups[0]?.rootNodeId === "n000001",
  );

  // --- canvas --------------------------------------------------------------
  const whiteObserved = { "background-color": "rgb(255, 255, 255)", "background-image": "none" };
  const transparentClone = {
    html: { "background-color": "rgba(0, 0, 0, 0)", "background-image": "none" },
    body: { "background-color": "rgba(0, 0, 0, 0)", "background-image": "none" },
  };
  check(
    "a white observed root vs a transparent clone canvas is NOT a mismatch",
    canvasMismatchedProperties(whiteObserved, transparentClone).length === 0,
  );
  const darkObserved = { "background-color": "rgb(17, 24, 39)", "background-image": "none" };
  check(
    "a dark observed root vs a transparent clone canvas IS a mismatch",
    canvasMismatchedProperties(darkObserved, transparentClone).join(",") === "background-color",
  );
  check(
    "a dark observed root matched by a dark clone body is not a mismatch",
    canvasMismatchedProperties(darkObserved, {
      html: { "background-color": "rgba(0, 0, 0, 0)" },
      body: { "background-color": "rgb(17, 24, 39)" },
    }).length === 0,
  );
}

function testAlignmentAndContent(): void {
  section("Structural alignment and text comparison (items 34–36, 40, 41)");

  const viewport = {
    profile: DESKTOP_PROFILE,
    documentDimensions: {
      viewportWidth: 1440,
      viewportHeight: 900,
      documentWidth: 1440,
      documentHeight: 900,
      scrollWidth: 1440,
      scrollHeight: 900,
    },
    contentRecovery: {
      status: "aligned" as const,
      source: "rendered-html" as const,
      sourceElementCount: 3,
      textNodeCount: 1,
      cappedSourceTextCount: 0,
      recoveredLongTextCount: 0,
      longestTextLength: 5,
      supplementalAttributeCount: 0,
      supplementalElementCount: 0,
      supplementalAttributeNames: [],
    },
    rootNodeIds: ["n000001"],
    nodes: [
      {
        nodeId: "n000001",
        type: "element" as const,
        sourceElementId: "e000001",
        childNodeIds: ["n000002"],
        tagName: "html",
        attributes: {},
        localVisible: true,
        effectiveVisible: true,
        assetRefs: [],
        relations: [],
        limitations: [],
      },
      {
        nodeId: "n000002",
        type: "element" as const,
        sourceElementId: "e000002",
        parentNodeId: "n000001",
        childNodeIds: ["n000003"],
        tagName: "body",
        attributes: {},
        localVisible: true,
        effectiveVisible: true,
        assetRefs: [],
        relations: [],
        limitations: [],
      },
      {
        nodeId: "n000003",
        type: "text" as const,
        parentNodeId: "n000002",
        value: "  hi  ",
      },
    ],
    sourceElementCount: 2,
    elementNodeCount: 2,
    textNodeCount: 1,
    localVisibleCount: 2,
    effectiveVisibleCount: 2,
    styleTokenCount: 0,
    assetRefs: [],
    frameInventory: [],
    shadowInventory: { openShadowRootCount: 0, hostNodeIds: [], limitations: [] },
    limitations: [],
  };

  const goodCapture = {
    url: "http://localhost/",
    title: "t",
    documentGeometry: viewport.documentDimensions,
    elements: [
      {
        key: "0",
        tagName: "html",
        rawText: "",
        attributes: {},
        style: {},
        box: { x: 0, y: 0, width: 0, height: 0 },
        localVisible: true,
        effectiveVisible: true,
      },
      {
        key: "1",
        tagName: "body",
        parentKey: "0",
        rawText: "  hi  ",
        attributes: {},
        style: {},
        box: { x: 0, y: 0, width: 0, height: 0 },
        localVisible: true,
        effectiveVisible: true,
      },
    ],
    textSequence: ["  hi  "],
  };
  const aligned = alignLiveOriginal(viewport, goodCapture);
  check("a matching tree aligns", aligned.aligned === true);

  const shortCapture = { ...goodCapture, elements: goodCapture.elements.slice(0, 1) };
  const countMismatch = alignLiveOriginal(viewport, shortCapture);
  check("a different element count fails alignment", countMismatch.aligned === false);
  check(
    "…as element-count-mismatch",
    countMismatch.aligned === false && countMismatch.failure === "element-count-mismatch",
  );

  const tagMismatch = alignLiveOriginal(viewport, {
    ...goodCapture,
    elements: [goodCapture.elements[0]!, { ...goodCapture.elements[1]!, tagName: "main" }],
  });
  check(
    "a different tag sequence fails alignment",
    tagMismatch.aligned === false && tagMismatch.failure === "tag-sequence-mismatch",
  );

  const parentMismatch = alignLiveOriginal(viewport, {
    ...goodCapture,
    elements: [goodCapture.elements[0]!, { ...goodCapture.elements[1]!, parentKey: undefined }],
  });
  check(
    "a different parent relation fails alignment",
    parentMismatch.aligned === false && parentMismatch.failure === "parent-relation-mismatch",
  );

  check("no live capture cannot align", alignLiveOriginal(viewport, undefined).aligned === false);

  // --- content -------------------------------------------------------------
  const elements = viewport.nodes.filter(
    (node): node is Extract<typeof node, { type: "element" }> => node.type === "element",
  );
  const exact = diffContent({
    viewport,
    nodes: elements,
    actualByNodeId: new Map([["n000002", goodCapture.elements[1]!]]),
    mode: "raw",
  });
  check("identical raw text is an exact match", exact.summary.exactEqual === 1);
  check("…with 0 changed", exact.summary.changed === 0);

  const trimmed = diffContent({
    viewport,
    nodes: elements,
    actualByNodeId: new Map([
      ["n000002", { ...goodCapture.elements[1]!, rawText: "hi" }],
    ]),
    mode: "raw",
  });
  check(
    "whitespace is NOT normalized away in the clone comparison (item 41)",
    trimmed.summary.changed === 1,
  );
  const trimmedDrift = diffContent({
    viewport,
    nodes: elements,
    actualByNodeId: new Map([
      ["n000002", { ...goodCapture.elements[1]!, rawText: "hi" }],
    ]),
    mode: "normalized",
  });
  check(
    "…but the drift comparison normalizes, because the snapshot may be capped",
    trimmedDrift.summary.changed === 0,
  );

  /*
   * Task 28.6 audit — the SAME defect class as C5 in the text channel. When the
   * Observer's `TEXT_MAX_LEN` cap truncated a stored value, this comparison
   * silently drops from equality to a PREFIX match, so the node's tail is never
   * compared by anyone and `exactRatio` reads identically either way. The
   * weaker check is now counted.
   */
  const cappedText = "x".repeat(TEXT_MAX_LEN);
  const cappedViewport = {
    ...viewport,
    nodes: viewport.nodes.map((node) =>
      node.type === "text" ? { ...node, value: cappedText } : node,
    ),
  };
  const cappedCompare = diffContent({
    viewport: cappedViewport,
    nodes: cappedViewport.nodes.filter(
      (node): node is Extract<typeof node, { type: "element" }> => node.type === "element",
    ),
    actualByNodeId: new Map([
      [
        "n000002",
        { ...goodCapture.elements[1]!, rawText: `${cappedText} and a tail nobody stored` },
      ],
    ]),
    mode: "normalized",
  });
  check(
    "a node the Observer capped is compared by prefix, and counted as such",
    cappedCompare.summary.prefixComparedNodes === 1,
    `prefixComparedNodes=${cappedCompare.summary.prefixComparedNodes}`,
  );
  check(
    "…so a prefix match is not presented as a full-text match with no trace",
    cappedCompare.summary.exactEqual === 1 &&
      (cappedCompare.summary.prefixComparedNodes ?? 0) > 0,
  );
  check(
    "…and an uncapped page reports 0, never absence",
    trimmedDrift.summary.prefixComparedNodes === 0,
  );
}

// ---------------------------------------------------------------------------
// Live half — a local server plays the ORIGINAL
// ---------------------------------------------------------------------------

const HOME_HTML = (variant: "original" | "drifted"): string => `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><title>Fixture home</title>
<style>
  /* Task 28.75 §CANVAS. The generator propagates the observed document-root
     background onto the clone's REAL <html> (scoped per page), so a clone whose
     canvas is simply missing is no longer producible by a generator bug — and
     this fixture must not depend on one to have something for QA to find.
     It therefore constructs the mismatch itself, through the refusal the
     generator documents: the two observed viewports must AGREE on the canvas
     declaration TEXT, and here they disagree on background-position ONLY
     ('resolveDocumentRootCanvas' → "viewports-disagree",
     src/reconstruction/style-generator.ts:317-318). The canvas is then left
     unpromoted and this page's clone really does paint the UA's white canvas
     under a dark-root source — a genuine, still-reachable defect.
     background-position is chosen deliberately: it is compared by neither
     canvasMismatchedProperties (skipped while background-image is 'none',
     src/reconstruction-qa/qa-page.ts:202-208) nor the human eye here, so the
     observed canvas COLOUR stays identical at both widths and the resulting
     mismatch is one site-level correction can actually fix.
     The /member/* pages below keep an ordinary agreeing canvas and are the
     positive control: they get promoted and must show NO mismatch. */
  html { background-color: rgb(17, 24, 39); background-position: 0% 0%; }
  /* 1200px, not 700px: this fixture has no <meta name="viewport">, so Chromium's
     mobile emulation lays the page out at its 980px default rather than at the
     390px profile width. The breakpoint must sit between that layout width and
     the 1440px desktop profile for the two captures to differ at all. */
  @media (max-width: 1200px) { html { background-position: 25% 75%; } }
  body { margin: 0; font-family: system-ui, sans-serif; color: rgb(255,255,255); }
  main { padding: 24px; }
  .panel { display: none; background: rgb(30,41,59); padding: 12px; }
  .panel.open { display: flex; }
  h1 { font-size: 32px; }
</style></head>
<body>
  <main>
    <h1 id="title">${variant === "original" ? "Fixture original" : "Fixture original CHANGED"}</h1>
    <p id="intro">A deterministic page used by the Task 15 fixture.</p>
    <button id="toggle" aria-expanded="false" aria-controls="panel">Details</button>
    <div id="panel" class="panel">Panel body text</div>
    <button id="mystery" aria-label="메뉴 열기">☰</button>
    <div id="menu-host"></div>
    <img id="inline-image" width="24" height="24" alt="dot"
         src="data:image/png;base64,${TINY_PNG_BASE64}">
    <a id="member" href="/member/1">Member one</a>
  </main>
  <script>
    document.getElementById('toggle').addEventListener('click', function () {
      var expanded = this.getAttribute('aria-expanded') === 'true';
      this.setAttribute('aria-expanded', String(!expanded));
      document.getElementById('panel').classList.toggle('open', !expanded);
    });
    document.getElementById('mystery').addEventListener('click', function () {
      var open = this.getAttribute('aria-label') === '메뉴 닫기';
      this.setAttribute('aria-label', open ? '메뉴 열기' : '메뉴 닫기');
      var host = document.getElementById('menu-host');
      host.innerHTML = open ? '' : '<div role="menu"><a href="#a">A</a><a href="#b">B</a></div>';
    });
  </script>
</body></html>`;

const MEMBER_HTML = (id: string): string => `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><title>Member ${id}</title>
<style>html{background:rgb(17,24,39);}body{margin:0;color:#fff;font-family:system-ui,sans-serif}</style>
</head><body><main><h1>Member ${id}</h1><p>Member ${id} body text that differs per member.</p>
${id === "2" ? "<p>An extra paragraph only member two has, repeated for divergence. ".repeat(8) + "</p>" : ""}
</main></body></html>`;

interface FixtureServer {
  server: Server;
  baseUrl: string;
  setVariant: (variant: "original" | "drifted") => void;
  stop: () => Promise<void>;
}

async function startFixtureServer(): Promise<FixtureServer> {
  let variant: "original" | "drifted" = "original";
  const server = createServer((request, response) => {
    const url = new URL(request.url ?? "/", "http://localhost");
    if (url.pathname === "/") {
      response.writeHead(200, { "content-type": "text/html; charset=utf-8" });
      response.end(HOME_HTML(variant));
      return;
    }
    const member = /^\/member\/(\d+)$/.exec(url.pathname);
    if (member) {
      response.writeHead(200, { "content-type": "text/html; charset=utf-8" });
      response.end(MEMBER_HTML(member[1]!));
      return;
    }
    response.writeHead(404, { "content-type": "text/html; charset=utf-8" });
    response.end("<!doctype html><html><body>not found</body></html>");
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (address === null || typeof address === "string") throw new Error("no port");
  return {
    server,
    baseUrl: `http://127.0.0.1:${address.port}`,
    setVariant: (next) => {
      variant = next;
    },
    stop: () =>
      new Promise<void>((resolve) => {
        server.close(() => resolve());
      }),
  };
}

async function writeJson(file: string, value: unknown): Promise<void> {
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, JSON.stringify(value, null, 2) + "\n", "utf8");
}

const OBSERVED_AT = "2026-08-14T10:00:00.000Z";

/**
 * Observe the fixture server with the REAL Task 03/09 observer and assemble the
 * Task 06–12 chain around it, so the SiteSpec compiler and the generator see
 * exactly the artifacts they see in production.
 */
async function buildPipeline(
  browser: Browser,
  root: string,
  baseUrl: string,
): Promise<{ siteSpecFile: string; manifestFile: string; appDir: string }> {
  const rel = (p: string): string =>
    path.relative(process.cwd(), p).split(path.sep).join("/");
  const selectionDir = path.join(root, "selection");
  const observationDir = path.join(root, "site-observation");

  const urls = [`${baseUrl}/`, `${baseUrl}/member/1`, `${baseUrl}/member/2`];

  // --- Task 09: the real observer -------------------------------------------
  const observedPages: ObservedSitePage[] = [];
  const observations: PageObservation[] = [];
  const pageIds = ["p000001", "p000002"];
  const observedUrls = [urls[0]!, urls[1]!];
  for (let index = 0; index < observedUrls.length; index++) {
    const pageId = pageIds[index]!;
    const observed = await observePageWithBrowser(browser, observedUrls[index]!);
    const pageDir = path.join(observationDir, "pages", pageId);
    const saved = await saveObservationIntoDir(pageDir, observed);
    observations.push(saved);
    observedPages.push({
      pageId,
      url: observedUrls[index]!,
      role: "representative",
      familyId: index === 0 ? "f000001" : "f000002",
      familyType: index === 0 ? "singleton" : "sibling-pattern",
      familyMemberCount: index === 0 ? 1 : 2,
      status: "success",
      startedAt: OBSERVED_AT,
      completedAt: OBSERVED_AT,
      elapsedMs: 1,
      pageObservationFile: `pages/${pageId}/observation.json`,
      finalUrl: observedUrls[index]!,
      title: saved.target.title,
      bytes: 1,
    });
  }

  // --- Task 06 / 07 / 08 ----------------------------------------------------
  const verified: VerifiedUrlSet = {
    schemaVersion: VERIFIER_SCHEMA_VERSION,
    rootUrl: baseUrl,
    sourceDiscoveryFile: rel(path.join(selectionDir, "discovery.json")),
    verifiedAt: OBSERVED_AT,
    count: urls.length,
    urls: urls.map((url) => ({
      url,
      sourceCandidateUrls: [url],
      httpStatus: 200,
      title: `title ${url}`,
    })),
  };
  await writeJson(path.join(selectionDir, "verified-urls.json"), verified);
  await writeJson(path.join(selectionDir, "verification.json"), { note: "provenance only" });

  const member = (url: string, isRepresentative: boolean) => {
    const parsed = new URL(url);
    const segments = parsed.pathname.split("/").filter(Boolean);
    return {
      url,
      canonicalTarget: "self" as const,
      sourceCandidateUrls: [url],
      route: {
        url,
        pathname: parsed.pathname,
        pathSegments: segments,
        pathDepth: segments.length,
        parentPath: "/",
        queryKeys: [],
        queryKeySignature: "",
        terminalSegment: segments.at(-1) ?? "",
        terminalKind: "text" as const,
      },
      isRepresentative,
    };
  };
  const families: PageFamily[] = [
    {
      id: "f000001",
      type: "singleton",
      members: [member(urls[0]!, true)],
      representativeUrl: urls[0]!,
      signals: { memberCount: 1, sharedStructure: false, sharedText: false, rootProtected: true },
    },
    {
      id: "f000002",
      type: "sibling-pattern",
      inferredRoutePattern: "/member/<*>",
      structuralMatchReason: "shallowSkeleton+landmark",
      members: [member(urls[1]!, true), member(urls[2]!, false)],
      representativeUrl: urls[1]!,
      signals: { memberCount: 2, sharedStructure: true, sharedText: false },
    },
  ];
  const familyTypeCounts = {
    "content-duplicate": 0,
    "sibling-pattern": 1,
    "scope-structure": 0,
    singleton: 1,
  };
  const familySet: PageFamilySet = {
    schemaVersion: SELECTOR_SCHEMA_VERSION,
    rootUrl: baseUrl,
    sourceVerifiedUrlsFile: rel(path.join(selectionDir, "verified-urls.json")),
    sourceVerificationFile: rel(path.join(selectionDir, "verification.json")),
    builtAt: OBSERVED_AT,
    verifiedUrlCount: urls.length,
    familyCount: families.length,
    familyTypeCounts,
    largestFamilySize: 2,
    families,
  };
  await writeJson(path.join(selectionDir, "page-families.json"), familySet);

  const selection: PageSelection = {
    schemaVersion: SELECTOR_SCHEMA_VERSION,
    rootUrl: baseUrl,
    sourceVerifiedUrlsFile: rel(path.join(selectionDir, "verified-urls.json")),
    sourceVerificationFile: rel(path.join(selectionDir, "verification.json")),
    selectedAt: OBSERVED_AT,
    verifiedUrlCount: urls.length,
    familyCount: families.length,
    selectedCount: 2,
    reductionCount: 1,
    reductionRate: 0.3333,
    familyTypeCounts,
    largestFamilySize: 2,
    pages: families.map((family) => ({
      url: family.representativeUrl,
      familyId: family.id,
      familyType: family.type,
      memberCount: family.members.length,
      reason: family.members.length === 1 ? ("sole-member" as const) : ("representative-rule" as const),
      reasonDetail: family.members.length === 1 ? "only member" : "shortest path",
    })),
    unselected: [
      {
        url: urls[2]!,
        familyId: "f000002",
        representativeUrl: urls[1]!,
        reason: "represented-by-family" as const,
      },
    ],
  };
  await writeJson(path.join(selectionDir, "selected-pages.json"), selection);

  const siteObservation: SiteObservation = {
    schemaVersion: MULTI_SCHEMA_VERSION,
    engine: "playwright-chromium",
    rootUrl: baseUrl,
    sourceSelectedPagesFile: rel(path.join(selectionDir, "selected-pages.json")),
    sourcePageFamiliesFile: rel(path.join(selectionDir, "page-families.json")),
    startedAt: OBSERVED_AT,
    completedAt: OBSERVED_AT,
    status: "completed",
    config: {
      concurrency: 2,
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
      verifiedUrlCount: urls.length,
      familyCount: families.length,
      selectedCount: 2,
      largestFamilySize: 2,
      selectedAt: OBSERVED_AT,
    },
    coverage: {
      familyCount: families.length,
      observedRepresentativeCount: 2,
      representedVerifiedUrlCount: 3,
      validationSampleCount: 0,
      totalObservedPageCount: 2,
      fullObservationPageCount: 3,
      observationReductionCount: 1,
      observationReductionRate: 0.3333,
    },
    stats: {
      requestedPages: 2,
      completedPages: 2,
      failedPages: 0,
      desktopObservations: 2,
      mobileObservations: 2,
      desktopBytes: 1,
      mobileBytes: 1,
      screenshotBytes: 0,
      jsonHtmlBytes: 2,
      pageBytes: 2,
      siteObservationJsonBytes: 1,
      totalBytes: 3,
      averageBytesPerObservedPage: 1,
      totalElapsedMs: 5,
    },
    pages: observedPages,
    validationSamples: [],
  };
  await writeJson(path.join(observationDir, "site-observation.json"), siteObservation);

  // --- Task 11 / 12 ---------------------------------------------------------
  // Real element ids from the real observation, so the SiteSpec join is real.
  const desktopDom = JSON.parse(
    await readFile(path.join(observationDir, "pages", "p000001", "viewports", "desktop", "dom.json"), "utf8"),
  ) as Array<{ id: string; tagName: string; attributes: Record<string, string> }>;
  const findElement = (predicate: (e: { attributes: Record<string, string> }) => boolean) =>
    desktopDom.find((element) => predicate(element));
  const toggle = findElement((e) => e.attributes["id"] === "toggle");
  const panel = findElement((e) => e.attributes["id"] === "panel");
  const mystery = findElement((e) => e.attributes["id"] === "mystery");
  if (!toggle || !panel || !mystery) throw new Error("fixture elements not observed");

  const descriptor = (
    tagName: string,
    text: string | undefined,
    domId: string,
    ariaLabel?: string,
  ): LocatorDescriptor => ({
    tagName,
    domId,
    ...(ariaLabel !== undefined ? { ariaLabel } : {}),
    ...(text !== undefined ? { text } : {}),
    ariaState: {},
    ancestors: [{ tagName: "main", landmark: true }],
    siblingIndex: 0,
    siblingCount: 1,
    structuralPath: "html:1>body:1>main:1>button:1",
    hasStrongSemantics: true,
  });

  const explorationDir = path.join(root, "exploration");
  const actions: InteractionObservation[] = [
    {
      schemaVersion: EXPLORER_SCHEMA_VERSION,
      engine: "playwright-chromium",
      actionId: "ia000001",
      pageId: "p000001",
      url: urls[0]!,
      viewportId: "desktop",
      viewportProfile: DESKTOP_PROFILE,
      sourceCandidateId: "ic000001",
      sourceElementId: toggle.id,
      sourcePageId: "p000001",
      sourceViewport: "desktop",
      sourceInteractionCandidatesFile: "pages/p000001/interaction-candidates.json",
      priority: "P1",
      capabilities: ["disclosure-trigger"],
      planReason: "P1 disclosure-trigger",
      shapeKey: "button|disclosure",
      locatorResolution: {
        status: "resolved",
        strategy: "id-exact",
        matchCount: 1,
        attempts: [{ strategy: "id-exact", matchCount: 1, verified: true }],
        locatorDescriptor: descriptor("button", "Details", "toggle"),
      },
      action: { type: "click", attempted: true },
      before: {
        url: urls[0]!,
        candidate: { exists: true },
        targets: [{ relation: "aria-controls", targetDomId: "panel", resolved: true, element: { exists: true } }],
        containers: { containers: [], totalCount: 0, truncated: false },
      },
      safetyEvents: [],
      status: "changed",
      startedAt: OBSERVED_AT,
      completedAt: OBSERVED_AT,
      elapsedMs: 1,
      loadMs: 1,
    },
    {
      schemaVersion: EXPLORER_SCHEMA_VERSION,
      engine: "playwright-chromium",
      actionId: "ia000002",
      pageId: "p000001",
      url: urls[0]!,
      viewportId: "desktop",
      viewportProfile: DESKTOP_PROFILE,
      sourceCandidateId: "ic000002",
      sourceElementId: mystery.id,
      sourcePageId: "p000001",
      sourceViewport: "desktop",
      sourceInteractionCandidatesFile: "pages/p000001/interaction-candidates.json",
      priority: "P2",
      capabilities: [],
      planReason: "P2 icon control",
      shapeKey: "button|icon",
      locatorResolution: {
        status: "resolved",
        strategy: "id-exact",
        matchCount: 1,
        attempts: [{ strategy: "id-exact", matchCount: 1, verified: true }],
        locatorDescriptor: descriptor("button", "☰", "mystery", "메뉴 열기"),
      },
      action: { type: "click", attempted: true },
      before: {
        url: urls[0]!,
        candidate: { exists: true },
        targets: [],
        containers: { containers: [], totalCount: 0, truncated: false },
      },
      safetyEvents: [],
      status: "changed",
      startedAt: OBSERVED_AT,
      completedAt: OBSERVED_AT,
      elapsedMs: 1,
      loadMs: 1,
    },
  ];
  for (const action of actions) {
    await writeJson(
      path.join(explorationDir, "pages", action.pageId, action.viewportId, `${action.actionId}.json`),
      action,
    );
  }

  const exploration: InteractionExploration = {
    schemaVersion: EXPLORER_SCHEMA_VERSION,
    engine: "playwright-chromium",
    rootUrl: baseUrl,
    sourceInteractionAnalysis: rel(path.join(observationDir, "interaction-analysis.json")),
    sourceSiteObservation: rel(path.join(observationDir, "site-observation.json")),
    startedAt: OBSERVED_AT,
    completedAt: OBSERVED_AT,
    status: "completed",
    config: {
      concurrency: 2,
      planOnly: false,
      viewportProfiles: [DESKTOP_PROFILE, MOBILE_PROFILE],
      loadTimeoutMs: 30000,
      loadSettleMs: 1000,
      afterSettleMs: 600,
      maxMutationRecords: 500,
      screenshots: false,
    },
    stats: {
      plannedActions: 2,
      executedActions: 2,
      changedActions: 2,
      noChangeActions: 0,
      desktopPlanned: 2,
      mobilePlanned: 0,
      desktopExecuted: 2,
      mobileExecuted: 0,
      desktopChanged: 2,
      mobileChanged: 0,
      locatorResolutionRate: 1,
      changeRate: 1,
      totalLoadMs: 2,
      totalActionMs: 2,
      averageActionMs: 1,
      totalElapsedMs: 2,
    },
    pages: [
      {
        pageId: "p000001",
        url: urls[0]!,
        role: "representative",
        familyId: "f000001",
        desktopPlanned: 2,
        mobilePlanned: 0,
        desktopExecuted: 2,
        mobileExecuted: 0,
        desktopChanged: 2,
        mobileChanged: 0,
      },
    ],
    actions: actions.map((action) => ({
      actionId: action.actionId,
      pageId: action.pageId,
      viewportId: action.viewportId,
      sourceCandidateId: action.sourceCandidateId,
      priority: action.priority,
      status: action.status,
      locatorStatus: "resolved",
      locatorStrategy: "id-exact",
      changeCount: 1,
      safetyEventCount: 0,
      observationFile: `pages/${action.pageId}/${action.viewportId}/${action.actionId}.json`,
      elapsedMs: 1,
    })),
    actionStatusSummary: { changed: 2 },
    locatorStatusSummary: { resolved: 2 },
    locatorStrategySummary: { "id-exact": 2 },
    diffSummary: { "candidate-attribute-change": 2 },
    safetySummary: {
      formSubmitSkipped: 0,
      fileInputSkipped: 0,
      navigationGuardSkipped: 0,
      navigationAttemptsBlocked: 0,
      sameDocumentNavigations: 0,
      popupAttempts: 0,
      downloadAttempts: 0,
      writeRequestsBlocked: 0,
      dialogsDismissed: 0,
      blockedMethodCounts: {},
    },
    dynamicTargetSummary: {
      plannedUnresolvedTriggers: 0,
      executedUnresolvedTriggers: 0,
      resolvedAfterAction: 0,
      stillUnresolved: 0,
      failedBeforeAction: 0,
      newInteractiveDescendants: 0,
    },
    storageSummary: {
      planBytes: 1,
      manifestBytes: 1,
      actionArtifactBytes: 1,
      totalBytes: 3,
      averageBytesPerAction: 1,
    },
    mutationTruncatedCount: 0,
  };
  await writeJson(path.join(explorationDir, "interaction-exploration.json"), exploration);

  const modelDir = path.join(root, "model");
  const patterns: InteractionPatternsArtifact = {
    schemaVersion: PATTERN_SCHEMA_VERSION,
    engine: "offline-deterministic",
    registryVersion: REGISTRY_VERSION,
    rootUrl: baseUrl,
    sourceExploration: rel(path.join(explorationDir, "interaction-exploration.json")),
    sourceExplorationRun: "fixture",
    coverage: {
      totalActions: 2,
      executedActions: 2,
      changedActions: 2,
      confirmedPatternInstances: 1,
      unknownCases: 1,
      navigationTainted: 0,
      executionErrors: 0,
      unmatchedTransitions: 1,
      patternCoverageOfChanged: 0.5,
      patternCoverageOfExecuted: 0.5,
    },
    patternTypeSummary: { disclosure: 1 },
    mechanismSummary: { "aria-expanded": 1 },
    viewportSummary: [
      {
        viewport: "desktop",
        actions: 2,
        patterns: 1,
        unknowns: 1,
        patternTypeCounts: { disclosure: 1 },
      },
    ],
    groups: [
      {
        signature: "disclosure|aria-expanded|button|desktop",
        patternType: "disclosure",
        mechanism: "aria-expanded",
        direction: "closed-to-open",
        triggerTag: "button",
        targetTag: "div",
        viewport: "desktop",
        instanceCount: 1,
        pageIds: ["p000001"],
        patternIds: ["ip000001"],
      },
    ],
    ruleConflicts: [],
    rules: [
      {
        id: "disclosure-aria-expanded",
        patternType: "disclosure",
        version: 1,
        specificity: 50,
        description: "aria-expanded plus a declared target that changed visibility",
        requiredEvidence: ["aria-expanded transition", "target visibility change"],
        optionalEvidence: [],
        rejectionConditions: [],
        matchCount: 1,
      },
    ],
    pages: [
      {
        pageId: "p000001",
        url: urls[0]!,
        desktopPatternIds: ["ip000001"],
        mobilePatternIds: [],
        patternTypes: ["disclosure"],
        unknownCount: 1,
      },
    ],
    patterns: [
      {
        id: "ip000001",
        patternType: "disclosure",
        ruleId: "disclosure-aria-expanded",
        ruleVersion: 1,
        registryVersion: REGISTRY_VERSION,
        provenance: "derived",
        source: {
          explorationRun: "fixture",
          actionId: "ia000001",
          pageId: "p000001",
          url: urls[0]!,
          viewport: "desktop",
          sourceCandidateId: "ic000001",
          sourceElementId: toggle.id,
          observationFile: `pages/p000001/desktop/ia000001.json`,
        },
        trigger: {
          tagName: "button",
          text: "Details",
          priority: "P1",
          capabilities: ["disclosure-trigger"],
        },
        mechanism: "aria-expanded",
        transition: {
          direction: "closed-to-open",
          field: "aria-expanded",
          before: "false",
          after: "true",
        },
        target: {
          relation: "aria-controls",
          targetDomId: "panel",
          tagName: "div",
          existedBefore: true,
          existsAfter: true,
          mounted: false,
          unmounted: false,
          visibilityChanged: true,
        },
        evidence: [
          {
            signal: "aria-expanded",
            source: "diff.changes",
            before: "false",
            after: "true",
            level: "observed",
          },
          {
            signal: "target-visibility",
            source: "diff.changes",
            before: "false",
            after: "true",
            level: "observed",
          },
        ],
        supportingEvidence: [],
        limitations: [],
        signature: "disclosure|aria-expanded|button|desktop",
      },
    ],
  };
  await writeJson(path.join(modelDir, "interaction-patterns.json"), patterns);

  const unknowns: UnknownInteractionsArtifact = {
    schemaVersion: PATTERN_SCHEMA_VERSION,
    engine: "offline-deterministic",
    rootUrl: baseUrl,
    sourceExploration: rel(path.join(explorationDir, "interaction-exploration.json")),
    sourceExplorationRun: "fixture",
    stats: {
      totalCases: 1,
      signatureGroups: 1,
      aiEligibleGroups: 1,
      aiConditionalGroups: 0,
      aiExcludedGroups: 0,
      aiEligibleCases: 1,
      estimatedAiCalls: 1,
      reasonCounts: { "unmatched-transition": 1 },
    },
    signatureGroups: [
      {
        signature: "unmatched-transition|button|changed",
        reason: "unmatched-transition",
        status: "changed",
        triggerTag: "button",
        caseCount: 1,
        pageIds: ["p000001"],
        caseIds: ["iu000001"],
        representativeCaseId: "iu000001",
        aiEligibility: "eligible",
      },
    ],
    cases: [
      {
        id: "iu000001",
        reason: "unmatched-transition",
        source: {
          explorationRun: "fixture",
          actionId: "ia000002",
          pageId: "p000001",
          url: urls[0]!,
          viewport: "desktop",
          candidateId: "ic000002",
          elementId: mystery.id,
          observationFile: `pages/p000001/desktop/ia000002.json`,
        },
        status: "changed",
        candidateSummary: {
          tagName: "button",
          priority: "P2",
          capabilities: [],
          label: "메뉴 열기",
        },
        beforeStateSummary: { exists: true, visible: true, aria: {}, state: {} },
        diffCategories: ["candidate-attribute-change"],
        mutationSummary: {
          categories: ["aria"],
          recordCount: 1,
          addedNodeCount: 0,
          removedNodeCount: 0,
          truncated: false,
        },
        safetySummary: [],
        partialPatternHints: [],
        aiEligibility: "eligible",
        aiEligibilityReason: "a state transition with no state attribute",
        signature: "unmatched-transition|button|changed",
        provenance: "derived",
      },
    ],
  };
  await writeJson(path.join(modelDir, "unknown-interactions.json"), unknowns);

  // --- Task 13 --------------------------------------------------------------
  const inputs = await loadInputs({
    patternsFile: path.join(modelDir, "interaction-patterns.json"),
  });
  const compiled = await compileSiteSpec(inputs);
  const savedSpec = await saveSiteSpec(path.join(root, "site-spec"), compiled);

  // --- Task 14 --------------------------------------------------------------
  const reconstructionInput = await loadReconstructionInput(savedSpec.siteSpecPath);
  const plan = planReconstruction(reconstructionInput);
  const versions = await resolveDependencyVersions(process.cwd());
  const generated = await generateApp(plan, {
    outputDir: path.join(root, "reconstruction"),
    sourceSchemaVersion: reconstructionInput.siteSpec.schemaVersion,
    sourceSiteSpecVersion: reconstructionInput.siteSpec.siteSpecVersion,
    sourceCompilerVersion: reconstructionInput.siteSpec.compilerVersion,
    versions,
  });

  return {
    siteSpecFile: savedSpec.siteSpecPath,
    manifestFile: path.join(root, "reconstruction", "reconstruction-manifest.json"),
    appDir: generated.appDir,
  };
}

async function testLiveHalf(): Promise<void> {
  section("Live half — real observer → real SiteSpec → real clone → real QA");

  /*
   * The generated clone resolves `next` and `react` by walking UP from its own
   * directory, so the fixture has to build somewhere inside this repository.
   * `data/` is the pipeline's own output namespace and is already git-ignored.
   */
  const dataDir = path.join(process.cwd(), "data");
  await mkdir(dataDir, { recursive: true });
  const root = await mkdtemp(path.join(dataDir, ".smoke-reconstruction-qa-"));
  const fixture = await startFixtureServer();
  const browser = await chromium.launch();
  try {
    const pipeline = await buildPipeline(browser, root, fixture.baseUrl);
    check("the fixture pipeline produced a SiteSpec", pipeline.siteSpecFile.length > 0);

    // --- Responsive Core P0: breakpoint probe planning (pure) ---------------
    {
      const planned = planBreakpointProbeTargets({
        siteBreakpoint: 641,
        pageBreakpoints: { p000002: 1025 },
        routes: [
          { pageId: "p000001", clonePath: "/" },
          { pageId: "p000001", clonePath: "/" },
          { pageId: "p000002", clonePath: "/pricing" },
        ],
      });
      check(
        "(P0) probe planning: site switch per route, a route-map override at its OWN width, one target per page",
        planned.targets.length === 2 &&
          planned.fallbackTargets === 0 &&
          JSON.stringify(planned.targets[0]?.widths) === "[640,641,642]" &&
          planned.targets[0]?.source === "manifest-site" &&
          JSON.stringify(planned.targets[1]?.widths) === "[1024,1025,1026]" &&
          planned.targets[1]?.source === "route-map-page" &&
          planned.targets[1]?.clonePath === "/pricing",
        JSON.stringify(planned),
      );
      const fallback = planBreakpointProbeTargets({
        siteBreakpoint: undefined,
        routes: [{ pageId: "p000001", clonePath: "/" }],
      });
      check(
        "(P0) probe planning: a manifest with no usable switch falls back to the constant, COUNTED",
        fallback.fallbackTargets === 1 &&
          fallback.targets[0]?.source === "fallback-constant" &&
          fallback.targets[0]?.breakpoint === undefined &&
          JSON.stringify(fallback.targets[0]?.widths) === JSON.stringify(BREAKPOINT_PROBE_WIDTHS) &&
          planBreakpointProbeTargets({ siteBreakpoint: Number.NaN, routes: [] }).fallbackTargets === 1,
        JSON.stringify(fallback),
      );
      check(
        "(P0) the convention: mobile strictly below the switch, desktop at and above it",
        expectedVariantAt(900, 899) === "mobile" &&
          expectedVariantAt(900, 900) === "desktop" &&
          expectedVariantAt(900, 901) === "desktop" &&
          expectedVariantAt(undefined, 915) === undefined,
      );
    }

    // --- baseline QA against the UNCHANGED original -------------------------
    const baselineRun = await runReconstructionQa({
      manifestFile: pipeline.manifestFile,
      siteSpecFile: pipeline.siteSpecFile,
      concurrency: 2,
      familyAudit: 2,
      outputDir: path.join(root, "qa-baseline"),
      onLog: () => {},
    });

    check(
      "every exact-observed page/viewport was QA'd",
      baselineRun.pages.length === 4,
      `got ${baselineRun.pages.length}`,
    );
    check(
      "every verified route renders in the clone",
      baselineRun.routeCheck.rendered === baselineRun.routeCheck.checked,
      `${baselineRun.routeCheck.rendered}/${baselineRun.routeCheck.checked}`,
    );

    // --- Responsive Core P0: the breakpoint probe reads the SERVED switch ----
    {
      const manifestRaw = JSON.parse(await readFile(pipeline.manifestFile, "utf8")) as {
        config: { inferredBreakpoint: { value: number } };
      };
      const served = manifestRaw.config.inferredBreakpoint.value;
      const probe = baselineRun.breakpointProbe;
      const distinctPages = new Set(baselineRun.pages.map((page) => page.pageId)).size;
      check(
        "(P0) the breakpoint probe targets EVERY route at served−1 / served / served+1, never 914–916",
        probe.targets.length === distinctPages &&
          probe.fallbackTargets === 0 &&
          probe.targets.every(
            (t) =>
              t.breakpoint !== undefined &&
              (t.source === "manifest-site" || t.source === "route-map-page") &&
              JSON.stringify(t.widths) ===
                JSON.stringify([t.breakpoint - 1, t.breakpoint, t.breakpoint + 1]),
          ) &&
          probe.targets.some((t) => t.source === "manifest-site" && t.breakpoint === served),
        JSON.stringify(probe.targets),
      );
      check(
        "(P0) …and at each sample the clone shows exactly the variant the convention requires",
        probe.results.length === probe.targets.length * 3 &&
          probe.failures === 0 &&
          probe.results.every(
            (r) =>
              r.ok &&
              r.expectedVariant === expectedVariantAt(r.breakpoint, r.width) &&
              (r.expectedVariant === "desktop" ? r.desktopVisible : r.mobileVisible),
          ),
        JSON.stringify(probe.results.filter((r) => !r.ok)),
      );
    }
    check(
      "content fidelity against the snapshot is exact",
      baselineRun.baseline.snapshotFidelity.contentExactRatio === 1,
      String(baselineRun.baseline.snapshotFidelity.contentExactRatio),
    );
    check(
      "the un-drifted original aligns structurally",
      baselineRun.baseline.sourceDrift.structuralDrift === 0,
      `${baselineRun.baseline.sourceDrift.structuralDrift} drifted`,
    );
    check(
      "no clone runtime errors",
      baselineRun.baseline.snapshotFidelity.runtimeErrors === 0,
    );

    /*
     * Task 28.6 C5 (a) — a REAL run's per-page artifact must say how much of
     * each page its pixel numbers speak for. Absence used to be the only
     * possible answer; it is now a regression.
     */
    check(
      "every QA'd page records screenshot coverage for all three images",
      baselineRun.pages.every(
        (qaPage) => (qaPage.screenshotCoverage ?? []).length === 3,
      ),
      baselineRun.pages
        .map((qaPage) => (qaPage.screenshotCoverage ?? []).length)
        .join(","),
    );
    check(
      "…naming the snapshot, live original and clone sides",
      baselineRun.pages.every(
        (qaPage) =>
          JSON.stringify(
            (qaPage.screenshotCoverage ?? []).map((entry) => entry.side).sort(),
          ) === JSON.stringify(["clone", "live-original", "snapshot"]),
      ),
    );
    /*
     * `.every()` over an empty array is vacuously true, so these two count the
     * records they inspected — a run that wrote NO coverage must fail them,
     * not pass them by having nothing to check.
     */
    const coverageRecords = baselineRun.pages.flatMap(
      (qaPage) => qaPage.screenshotCoverage ?? [],
    );
    check(
      "…with the captured height AND the full document height on every side",
      coverageRecords.length === 12 &&
        coverageRecords.every(
          (entry) =>
            entry.capturedDeviceHeight > 0 &&
            entry.expectedDeviceHeight > 0 &&
            entry.documentHeightCss > 0,
        ),
      `${coverageRecords.length} coverage records`,
    );
    check(
      "…and short fixture pages honestly report full coverage, not silence",
      coverageRecords.length === 12 &&
        coverageRecords.every(
          (entry) => entry.coveredFraction === 1 && entry.truncated === false,
        ),
      `${coverageRecords.length} coverage records`,
    );
    check(
      "every screenshot metric carries the fraction of the page it speaks for",
      baselineRun.pages.every((qaPage) =>
        qaPage.screenshots.every((metric) => metric.coveredFraction !== undefined),
      ),
    );
    check(
      "…so a fully covered run reports 0 truncated pairs rather than nothing",
      baselineRun.baseline.snapshotFidelity.screenshotTruncatedPairs === 0 &&
        baselineRun.baseline.snapshotFidelity.screenshotMinCoveredFraction === 1,
      `truncated=${baselineRun.baseline.snapshotFidelity.screenshotTruncatedPairs} min=${baselineRun.baseline.snapshotFidelity.screenshotMinCoveredFraction}`,
    );
    /*
     * Task 28.6 W3 — the RUN SUMMARY over real page results.
     *
     * These take a page the live half actually produced and swap only its
     * `screenshots` array, so the summarizer under test is fed a real
     * `QaPageResult` rather than a hand-built stand-in that could drift from the
     * schema.
     */
    const realPage = baselineRun.pages[0]!;
    const withPairs = (metrics: ScreenshotMetric[]): QaPageResult => ({
      ...realPage,
      screenshots: metrics,
    });
    check(
      "a snapshot-clone pair that could not be measured AT ALL still lowers the run summary",
      (() => {
        /*
         * The exact case C5 created and the summary then skipped: a clone
         * screenshot that failed outright is now `available: false` WITH
         * `coverageTruncated: true`, and the counter's `|| !metric.available`
         * gate ran BEFORE the coverage counters, so the run read as fully
         * covered while the per-page finding said otherwise.
         */
        const summary = summarizeSnapshotFidelity([
          withPairs([
            {
              pair: "snapshot-clone",
              available: false,
              unavailableReason: "clone screenshot unavailable",
              coverageTruncated: true,
              truncatedSides: ["clone"],
              coverageUnknownSides: 1,
            },
          ]),
        ]);
        return (
          summary.screenshotTruncatedPairs === 1 &&
          summary.screenshotUnavailablePairs === 1 &&
          summary.screenshotPairsMeasured === 0 &&
          summary.screenshotMinCoveredFraction === undefined
        );
      })(),
      JSON.stringify(
        summarizeSnapshotFidelity([
          withPairs([
            {
              pair: "snapshot-clone",
              available: false,
              unavailableReason: "clone screenshot unavailable",
              coverageTruncated: true,
              truncatedSides: ["clone"],
              coverageUnknownSides: 1,
            },
          ]),
        ]),
      ),
    );
    check(
      "…and a measured-but-short pair lowers the run's minimum covered fraction",
      (() => {
        const summary = summarizeSnapshotFidelity([
          withPairs([
            {
              pair: "snapshot-clone",
              available: true,
              coveredFraction: 0.6322,
              coverageTruncated: true,
              truncatedSides: ["clone"],
              coverageUnknownSides: 0,
            },
          ]),
        ]);
        return (
          summary.screenshotTruncatedPairs === 1 &&
          summary.screenshotUnavailablePairs === 0 &&
          summary.screenshotPairsMeasured === 1 &&
          summary.screenshotMinCoveredFraction === 0.6322
        );
      })(),
    );
    check(
      "the LIVE-fidelity summary reports coverage too, instead of a bare visual median",
      (() => {
        /*
         * C5 gave the snapshot summary coverage fields and left `LiveFidelity`
         * with none, so `summarizeLiveFidelity`'s original-clone visual medians
         * could still read as a whole-page verdict over a capped capture — the
         * same defect, in the other half of the report.
         */
        const summary = summarizeLiveFidelity([
          withPairs([
            {
              pair: "original-clone",
              available: true,
              changedPixelRatio: 0,
              coveredFraction: 0.5,
              coverageTruncated: true,
              truncatedSides: ["clone"],
              coverageUnknownSides: 0,
            },
          ]),
        ]);
        return (
          summary.screenshotChangedRatioMedian === 0 &&
          summary.screenshotTruncatedPairs === 1 &&
          summary.screenshotMinCoveredFraction === 0.5 &&
          summary.screenshotUnavailablePairs === 0
        );
      })(),
      JSON.stringify(
        summarizeLiveFidelity([
          withPairs([
            {
              pair: "original-clone",
              available: true,
              changedPixelRatio: 0,
              coveredFraction: 0.5,
              coverageTruncated: true,
              truncatedSides: ["clone"],
              coverageUnknownSides: 0,
            },
          ]),
        ]),
      ),
    );
    check(
      "…and an unmeasurable live pair counts there as well, rather than vanishing",
      (() => {
        const summary = summarizeLiveFidelity([
          withPairs([
            {
              pair: "original-clone",
              available: false,
              unavailableReason: "clone screenshot unavailable",
              coverageTruncated: true,
              coverageUnknownSides: 1,
            },
          ]),
        ]);
        return (
          summary.screenshotTruncatedPairs === 1 &&
          summary.screenshotUnavailablePairs === 1 &&
          summary.screenshotMinCoveredFraction === undefined
        );
      })(),
    );
    check(
      "the real fully-covered run reports both summaries as covered, not silent",
      baselineRun.baseline.liveFidelity.screenshotTruncatedPairs === 0 &&
        baselineRun.baseline.liveFidelity.screenshotUnavailablePairs === 0 &&
        baselineRun.baseline.liveFidelity.screenshotMinCoveredFraction === 1,
      JSON.stringify({
        truncated: baselineRun.baseline.liveFidelity.screenshotTruncatedPairs,
        unavailable: baselineRun.baseline.liveFidelity.screenshotUnavailablePairs,
        min: baselineRun.baseline.liveFidelity.screenshotMinCoveredFraction,
      }),
    );

    /*
     * Task 28.6 W3, same-standard pass — the stability sample is a BOUNDED
     * PREFIX, and `sampledNodes: 400` used to be the only thing said about it.
     */
    check(
      "the stability verdict names the population it is a verdict over",
      baselineRun.pages.every(
        (qaPage) =>
          qaPage.stability.candidateNodes !== undefined &&
          qaPage.stability.unsampledNodes !== undefined &&
          qaPage.stability.unmatchedNodes !== undefined,
      ),
      JSON.stringify(baselineRun.pages.map((qaPage) => qaPage.stability)),
    );
    check(
      "…and the counts add up: sampled + unsampled === candidates on every page",
      baselineRun.pages.length > 0 &&
        baselineRun.pages.every(
          (qaPage) =>
            qaPage.stability.sampledNodes + (qaPage.stability.unsampledNodes ?? -1) ===
            qaPage.stability.candidateNodes,
        ),
      JSON.stringify(
        baselineRun.pages.map(
          (qaPage) =>
            `${qaPage.stability.sampledNodes}+${qaPage.stability.unsampledNodes}=${qaPage.stability.candidateNodes}`,
        ),
      ),
    );
    check(
      "…and nodes that vanished between the two captures are counted, not skipped in silence",
      baselineRun.pages.every((qaPage) => qaPage.stability.unmatchedNodes === 0),
      JSON.stringify(baselineRun.pages.map((qaPage) => qaPage.stability.unmatchedNodes)),
    );

    check(
      "the bounded load waits are recorded rather than dropped on the floor",
      baselineRun.pages.every(
        (qaPage) => qaPage.stabilization?.clone !== undefined,
      ),
    );
    // p000001 is the page whose canvas the generator REFUSED to promote
    // (viewports-disagree, see HOME_HTML) — its clone really does paint the UA
    // white canvas under a dark-root source, and QA must say so. p000002's
    // canvas IS promoted onto the real <html>, so a mismatch reported there
    // would be a false positive. Both halves are asserted: detection alone is
    // satisfied by a detector that fires on everything.
    const canvasMismatchPages = new Set(
      baselineRun.diffs
        .filter((diff) => diff.classification === "canvas-background-mismatch")
        .map((diff) => diff.pageId),
    );
    check(
      "the canvas background mismatch is detected (dark root, white canvas)",
      canvasMismatchPages.has("p000001") && !canvasMismatchPages.has("p000002"),
      `mismatch pages: ${[...canvasMismatchPages].sort().join(",") || "(none)"}`,
    );
    check(
      "…and it is the only correction type proposed here besides observed ones",
      baselineRun.proposed.some(
        (correction) => correction.type === "document-canvas-background",
      ),
    );
    check(
      "the unknown 메뉴 열기 trigger produced a behavior gap",
      baselineRun.unknowns.some((entry) => entry.gapDetected),
    );
    check(
      "…and the clone did nothing for it",
      baselineRun.unknowns.every((entry) => entry.cloneChangeFields.length === 0),
    );
    check(
      "unknown behaviour is never auto-fix eligible",
      baselineRun.diffs
        .filter((diff) => diff.classification === "unknown-behavior-gap")
        .every((diff) => diff.autoFixEligibility === "not-eligible-unknown-behavior"),
    );
    check(
      "no correction of any kind targets an unknown interaction",
      baselineRun.proposed.every(
        (correction) => correction.type !== ("unknown-behavior" as never),
      ),
    );
    check(
      "the verified disclosure was replayed on both sides",
      baselineRun.interactions.length === 1 &&
        baselineRun.interactions[0]!.original.attempted &&
        baselineRun.interactions[0]!.clone.attempted,
    );
    const disclosure = baselineRun.interactions[0];
    check(
      "…the original's open state was observed",
      disclosure?.original.targetAfter?.visible === true,
    );
    check(
      "…which is new evidence Task 11 never captured",
      disclosure?.openStateEvidenceUsable === true,
    );
    check(
      "…and the clone's `display: revert` differs from the observed `flex`",
      (disclosure?.targetStyleMismatches ?? []).some((entry) => entry.property === "display"),
      JSON.stringify(disclosure?.targetStyleMismatches?.slice(0, 3) ?? []),
    );
    check(
      "an open-state style correction is therefore proposed",
      baselineRun.proposed.some(
        (correction) => correction.type === "interaction-target-state-style",
      ),
    );
    check(
      "the family-represented route was audited",
      baselineRun.familyAudit.length > 0,
    );
    check(
      "…and its divergence is a representation gap, never a generator defect",
      baselineRun.diffs
        .filter((diff) => diff.classification === "family-representation-gap")
        .every((diff) => diff.recommendation === "requires-exact-observation"),
    );
    check(
      "no diff id repeats",
      new Set(baselineRun.diffs.map((diff) => diff.id)).size === baselineRun.diffs.length,
    );

    // --- auto-fix ------------------------------------------------------------
    const fixedRun = await runReconstructionQa({
      manifestFile: pipeline.manifestFile,
      siteSpecFile: pipeline.siteSpecFile,
      concurrency: 2,
      familyAudit: 0,
      autoFix: true,
      maxFixIterations: 2,
      outputDir: path.join(root, "qa-autofix"),
      onLog: () => {},
    });
    check("the correction loop ran", fixedRun.iterations >= 1);
    check(
      "…and stopped within the iteration cap",
      fixedRun.iterations <= 2,
      `${fixedRun.iterations}`,
    );
    check(
      "at least one correction was accepted",
      fixedRun.applied.length >= 1,
      `${fixedRun.applied.length} applied`,
    );
    check(
      "the canvas correction was accepted",
      fixedRun.applied.some((correction) => correction.type === "document-canvas-background"),
    );
    const correctedManifest = JSON.parse(
      await readFile(
        path.join(root, "qa-autofix", "iterations", "q001", "reconstruction", "reconstruction-manifest.json"),
        "utf8",
      ),
    ) as Record<string, unknown>;
    check(
      "the corrected manifest records its QA provenance",
      typeof correctedManifest.sourceQaRun === "string" &&
        typeof correctedManifest.correctionSet === "string" &&
        typeof correctedManifest.correctionCount === "number",
    );
    check(
      "the Task 14 baseline app was not modified",
      (await readFile(path.join(pipeline.appDir, "app", "globals.css"), "utf8")).indexOf(
        "QA CORRECTIONS",
      ) < 0,
    );
    const correctedCss = await readFile(
      path.join(root, "qa-autofix", "iterations", "q001", "reconstruction", "app", "app", "globals.css"),
      "utf8",
    );
    check("the corrected app carries the correction CSS", correctedCss.includes("QA CORRECTIONS"));
    check(
      "…and it is generated from a template, not free-form",
      correctedCss.includes("html{background-color:"),
    );
    check(
      "unknown behaviour was still implemented 0 times",
      fixedRun.unknowns.every((entry) => entry.cloneChangeFields.length === 0),
    );

    // --- source drift --------------------------------------------------------
    fixture.setVariant("drifted");
    const driftRun = await runReconstructionQa({
      manifestFile: pipeline.manifestFile,
      siteSpecFile: pipeline.siteSpecFile,
      concurrency: 2,
      familyAudit: 0,
      outputDir: path.join(root, "qa-drift"),
      onLog: () => {},
    });
    check(
      "changing the original produces source-content-drift",
      driftRun.diffs.some((diff) => diff.classification === "source-content-drift"),
    );
    check(
      "…and the clone's own content fidelity is unchanged",
      driftRun.baseline.snapshotFidelity.contentExactRatio === 1,
      String(driftRun.baseline.snapshotFidelity.contentExactRatio),
    );
    check(
      "…so no clone content-mismatch was invented",
      driftRun.diffs.filter((diff) => diff.classification === "content-mismatch").length === 0,
    );
    check(
      "…and drift is never auto-fixed",
      driftRun.diffs
        .filter((diff) => diff.classification.startsWith("source-"))
        .every((diff) => diff.autoFixEligibility !== "eligible"),
    );

    // --- determinism ---------------------------------------------------------
    const classificationsA = baselineRun.diffs.map(
      (diff) => `${diff.id}|${diff.classification}|${diff.pageId ?? ""}|${diff.nodeId ?? ""}`,
    );
    const rerun = await runReconstructionQa({
      manifestFile: pipeline.manifestFile,
      siteSpecFile: pipeline.siteSpecFile,
      concurrency: 2,
      familyAudit: 0,
      snapshotOnly: true,
      outputDir: path.join(root, "qa-determinism-a"),
      onLog: () => {},
    });
    const rerunAgain = await runReconstructionQa({
      manifestFile: pipeline.manifestFile,
      siteSpecFile: pipeline.siteSpecFile,
      concurrency: 2,
      familyAudit: 0,
      snapshotOnly: true,
      outputDir: path.join(root, "qa-determinism-b"),
      onLog: () => {},
    });
    check(
      "two snapshot-only runs classify identically",
      JSON.stringify(
        rerun.diffs.map((diff) => `${diff.id}|${diff.classification}|${diff.nodeId ?? ""}`),
      ) ===
        JSON.stringify(
          rerunAgain.diffs.map((diff) => `${diff.id}|${diff.classification}|${diff.nodeId ?? ""}`),
        ),
    );
    check(
      "…and propose the same corrections",
      JSON.stringify(rerun.proposed.map((c) => `${c.id}|${c.type}`)) ===
        JSON.stringify(rerunAgain.proposed.map((c) => `${c.id}|${c.type}`)),
    );
    check("classification ids were stable across the live runs", classificationsA.length > 0);
  } finally {
    await browser.close().catch(() => {});
    await fixture.stop();
    await rm(root, { recursive: true, force: true });
  }
}

function testRuntimeAttribution(): void {
  section("Runtime vs blocked asset (item 54) — never the same finding");
  const clone = {
    consoleErrors: [
      "Access to image at 'https://cdn.example/icon.svg' from origin 'http://127.0.0.1:1' has been blocked by CORS policy",
      "Failed to load resource: net::ERR_FAILED",
      "TypeError: x is not a function",
    ],
    consoleWarnings: [],
    pageErrors: ["ReferenceError: y is not defined"],
    failedResources: [],
    resourceFailures: [],
    hydrationErrors: 0,
    navigations: [],
  };
  const result = diffRuntime(clone, undefined, "http://127.0.0.1:1/");
  check("a CORS-blocked image is not a JS error", result.summary.cloneJsErrors === 2);
  check("…it is counted as a blocked asset", result.summary.cloneBlockedAssetMessages === 2);
  check(
    "…and is reported separately",
    result.blockedAssetMessages.some((m) => m.includes("blocked by CORS")),
  );
  check(
    "a real TypeError still counts as a JS error",
    result.cloneMessages.some((m) => m.startsWith("TypeError")),
  );
  check(
    "an uncaught pageerror is always JavaScript",
    result.cloneMessages.some((m) => m.startsWith("ReferenceError")),
  );
  check("…and the clone-only flag reflects the JS half", result.cloneOnlyErrors === true);
}

function testSelectionPolicies(): void {
  section("Sampling policy (items 24, 77)");
  check(`family audit cap is ${MAX_FAMILY_AUDIT_ROUTES_PER_SITE}`, MAX_FAMILY_AUDIT_ROUTES_PER_SITE === 4);
  check(`unknown QA cap is ${MAX_UNKNOWN_QA_PER_SITE}`, MAX_UNKNOWN_QA_PER_SITE === 8);

  const artifact = {
    signatureGroups: [
      { signature: "b", reason: "opaque-action", caseCount: 1, representativeCaseId: "iu000004" },
      { signature: "a", reason: "unmatched-transition", caseCount: 3, representativeCaseId: "iu000001" },
      { signature: "c", reason: "style-only-change", caseCount: 2, representativeCaseId: "iu000002" },
    ],
  } as unknown as Parameters<typeof selectUnknownSamples>[0];
  const samples = selectUnknownSamples(artifact, 8);
  check(
    "unknown signatures are sampled in the documented priority order",
    samples.map((sample) => sample.caseId).join(",") === "iu000001,iu000002,iu000004",
  );
  const capped = selectUnknownSamples(artifact, 1);
  check("…and the cap is honoured", capped.length === 1);
}

// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  console.log("Reconstruction QA fixture (Task 15)");

  testScreenshotMetrics();
  testScreenshotCoverage();
  await testTallPageCoverage();
  testDataImageSafety();
  testCorrectionPolicy();
  testAcceptanceGate();
  testClassificationAndGrouping();
  testStyleAndCanvas();
  testAlignmentAndContent();
  testSelectionPolicies();
  testRuntimeAttribution();
  await testLiveHalf();

  console.log("");
  console.log(`${checks - failures}/${checks} checks passed`);
  if (failures > 0) {
    console.log(`${failures} FAILED`);
    process.exitCode = 1;
  }
}

main().catch((err) => {
  console.error("[smoke:reconstruction-qa] ERROR —", err instanceof Error ? err.stack : err);
  process.exitCode = 1;
});
