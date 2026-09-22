/**
 * Five-width responsive QA (Task 28.6, lane W3) — barrel export.
 *
 * A standalone, site-agnostic harness that measures a reconstructed clone
 * against its live source at every width in a sweep, and classifies each
 * (route, width) pair BLOCKER / MAJOR / MINOR with a rubric that lives in code.
 *
 * DEPENDENCY DIRECTION. This module READS `src/reconstruction-qa/` (the capture
 * primitives, the pixel comparison and the clone server) and `src/observer/`
 * (the context constants) and writes to neither. Nothing in the engine imports
 * this module: a QA harness must never become something the generator depends
 * on, or the thing under test starts shaping its own measurement.
 *
 * Playwright is used against exactly two things: the public source, read-only
 * with passive guards, and the locally served clone.
 */

export * from "./types.js";

export {
  probeInBrowser,
  REGION_CENSUS_DEFAULTS,
  REGION_REJECTION_REASONS,
  type ProbeOptions,
  type ProbeResult,
  type RegionCensusConfig,
  type RegionRejectionReason,
} from "./probe.js";

export {
  // Task 28.75. The blank-region detector is a PURE function of two side
  // measurements, exported piece by piece so every rule in it — what makes a
  // source region populated, what makes a clone region blank, how two regions
  // are paired across sides, how paint inside a rectangle is measured — is
  // testable from a literal without a browser, a clone or a screenshot.
  cloneRegionIsBlank,
  cloneRegionIsBlankByInk,
  describeBlankRegions,
  detectBlankRegions,
  inkInsideBox,
  inkTrustOf,
  pairRegions,
  paintInsideBox,
  reachesBlocker,
  sharedPathSuffix,
  sourceRegionHasInk,
  sourceRegionIsPopulated,
  unionArea,
  type BlankRegion,
  type BlankRegionResult,
  type BlankRegionSide,
  type Box,
  type InkTrust,
  type RegionInk,
  type RegionPaint,
  type RegionPairing,
} from "./blank-region.js";

export {
  CAPTURE_POLICY,
  PROBE_OPTIONS,
  captureSide,
  profileForWidth,
  type CaptureSideInput,
  type CapturedSide,
} from "./capture.js";

export {
  compareColumns,
  correspond,
  missingText,
  type ColumnComparison,
  type ColumnContainerMismatch,
} from "./correspondence.js";

export {
  classifyPair,
  // WP-C guard 1. Exported so the "did the clone serve a page here at all?"
  // decision — the one thing that turns a 404 into ONE finding instead of a
  // column of content blockers — is testable without a browser or a clone.
  cloneRouteGate,
  type ClassifyInput,
  type CloneRouteGateResult,
} from "./classify.js";

export {
  // WP-C guard 3. The overlap sweep moved OUT of the in-page probe so its one
  // judgement — same picture twice, or two different things collided? — is an
  // ordinary function with an ordinary test. See `overlap.ts`.
  classifyOverlapPair,
  computeOverlapAccounting,
  sameBoxWithin,
  type OverlapAccounting,
  type OverlapOptions,
} from "./overlap.js";

export { gatePixels, type PixelGateOptions } from "./pixel-gate.js";

export {
  // TASK 28.75, item L3. `compositeWidthMismatch` is the composite's own answer
  // to "are these two panels the same width, and which one carries the strip
  // the pixel diff never looked at?", exported so the suite can assert the
  // banner and the hatched band without screenshotting a PNG.
  COMPOSITE_UNCOMPARED_BAND_CLASS,
  COMPOSITE_WIDTH_MISMATCH_MARKER,
  buildCompositeHtml,
  compositeWidthMismatch,
  renderComposite,
  renderContactSheet,
  type CompositeInput,
  type ContactSheetInput,
  type ContactSheetRow,
} from "./composite.js";

export {
  // TASK 28.8 FAST, ITEM 2. Text printed over text inside a compact critical block —
  // the defect `overlap-excess-ratio` is blind to because it divides area by a
  // page height. Exported piece by piece so the two rules that matter — what
  // makes a region CRITICAL (generic tag only, never a hostname) and what makes
  // a pair a COLLISION — are unit-testable without a browser.
  detectTextCollisions,
  describeTextCollisions,
  isCriticalRegion,
  textLeavesCollide,
  type TextCollisionAccounting,
  type TextCollisionOptions,
  type TextCollisionRow,
} from "./text-collision.js";

export {
  resolveRoutes,
  type ResolveRoutesOptions,
  type ResolvedRoute,
  type RouteResolution,
} from "./routes.js";

export {
  CONTACT_SHEET_FILE,
  IMAGES_SUBDIR,
  IMAGE_MANIFEST_FILE,
  RUN_ARTIFACT_FILE,
  imageFileName,
  newResponsiveRunId,
  responsiveRunDir,
  routeSlug,
  siteFolder,
  writeRunBinary,
  writeRunJson,
  type ImageKind,
  type WrittenFile,
} from "./store.js";

export {
  runResponsiveQa,
  // ITEM G4. Exported so the grading-floor logic — what makes a floor
  // comparable, and the two silences ("no floor" / "this run IS the floor")
  // — is directly, cheaply unit-testable without a live browser or a built
  // clone. See scripts/smoke-responsive-qa.ts section G4.
  readFloorArtifact,
  floorFrom,
  absentFloor,
  selfIsTheFloor,
  // WP-C guard 2. The cross-width stability rule, exported for the same reason:
  // "deviates from both neighbours AND reverts" is the only thing separating a
  // bad capture from a real responsive breakpoint, and it has to be provable
  // against a hand-built population profile rather than a live site.
  detectSourceInstability,
  applySourceStabilityGuard,
  // WP-C guard 4. The coverage partition, exported so the conservation
  // invariant — graded + every exclusion bucket === total — is an executable
  // assertion rather than a claim in a comment.
  accountForCoverage,
  carriesLayoutVerdict,
  type CoverageResult,
  type RunResponsiveQaOptions,
  type RunResponsiveQaResult,
} from "./run.js";
