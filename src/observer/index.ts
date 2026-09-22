export * from "./types.js";
export {
  observePage,
  observePageWithBrowser,
  resolveViewportProfiles,
  type ObserveOptions,
} from "./observe-page.js";
export {
  collectPageInBrowser,
  type CollectConfig,
  type RawCollectResult,
  type RawElement,
  type RawPseudo,
  type RawImageInfo,
  type RawInlineSvg,
  type RawFrame,
  type RawIcon,
  type RawFontUrl,
  type RawEnvironment,
  type RawMetadata,
} from "./collect-dom.js";
export {
  dedupeStyles,
  assertStyleReferencesResolve,
  type DedupeResult,
} from "./dedupe-styles.js";
/**
 * Task 28.75 — THE PUBLIC PAGE-STATE API (the two-call contract).
 *
 * ONE shared implementation of the page-state policy, usable against any
 * Playwright `Page` by a caller that is not the observer — so the observer and
 * a QA source capture can agree about what "the normal page state" is instead
 * of one dismissing entry popups and the other charging the clone for content
 * the engine deliberately removed.
 *
 *   await page.goto(url, { waitUntil: "load" });
 *   await markInitialPaintCensus(page);            // CALL 1 — immediately
 *   …settle…
 *   const record = await normalizePageState(page, {  // CALL 2 — before capture
 *     observationUrl: url, viewportId: "desktop", pageId: "p000001",
 *   });
 *
 * Skipping call 1 is allowed and does NOT throw: the STRONG signal
 * `appeared-after-initial-paint` simply cannot fire, and the returned record
 * says so in `initialPaintCensusStatus` and `limitations`.
 * Full contract: docs/result/28.75/page-state-api-contract.md
 */
export {
  normalizePageState,
  pageStateNormalizationSkipped,
  type NormalizePageStateOptions,
} from "./normalize-page-state.js";
export {
  markInitialPaintCensus,
  installBrowserNameShim,
  type InitialPaintCensusResult,
} from "./initial-paint-census.js";
export { deriveLinks } from "./collect-links.js";
export { deriveAssets } from "./collect-assets.js";
export { probeLayout, type ProbeLayoutOptions } from "./layout-probe.js";
export {
  deriveProbeWidths,
  withOperatorWidths,
  type AuthoredMediaConditionTally,
  type DeriveProbeWidthsInput,
  type DerivedProbeWidths,
} from "./probe-widths.js";
export {
  saveObservation,
  saveObservationIntoDir,
  makeRunId,
  type SavedObservation,
} from "./store.js";
