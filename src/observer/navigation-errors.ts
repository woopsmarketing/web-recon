/**
 * Task 28.7 A1 — ONE place that recognises "the page navigated out from under
 * us" (Task 28.7 WP-A).
 *
 * THE DEFECT THIS EXISTS FOR. A page that navigates while the read-only
 * preparation auto-scroll is stepping destroys the JavaScript execution context
 * the scroll is evaluating in. Playwright then throws
 * `Execution context was destroyed, most likely because of a navigation`, and
 * before this module that throw propagated all the way out of
 * `observeViewport` → `observePageWithBrowser` → the site orchestrator, where
 * `classifyObservationError` did not recognise it. The page was filed as an
 * `observation-error` with NO observation at all, `compile-routes` could then
 * not set `renderSourcePageId`, and `route-plan` threw `ReconstructionError` —
 * one scroll-triggered navigation killed the whole reconstruction.
 *
 * The signatures below are Playwright's / Chromium's own wording for that one
 * class of failure. They are matched in exactly one place so no second copy can
 * drift: the scroll recovery path and the site orchestrator's error classifier
 * both call {@link isNavigationDestroyedContextError}.
 *
 * Nothing here is keyed on a hostname, URL, selector or pixel value.
 */

/**
 * Message fragments Playwright/Chromium produce when the execution context a
 * pending evaluate was bound to has gone away because the page navigated,
 * reloaded, or replaced the frame.
 *
 * Deliberately NOT included: `Target closed` / `Browser has been closed` /
 * `Target crashed`. Those mean the browser or the page is gone, which is a
 * different fact and must not be recovered from by re-navigating.
 */
export const NAVIGATION_DESTROYED_CONTEXT_SIGNATURES: readonly string[] = [
  "Execution context was destroyed",
  "Execution context is not available",
  "Execution context is no longer valid",
  "Cannot find context with specified id",
  "frame was detached",
  "Frame was detached",
  "frame got detached",
  "Frame got detached",
  "Node is detached from document",
  "because of a navigation",
];

/**
 * True when `err` is the "a navigation destroyed the context we were evaluating
 * in" class. Message-signature based, because Playwright does not give this
 * class its own error type.
 */
export function isNavigationDestroyedContextError(err: unknown): boolean {
  const message = err instanceof Error ? err.message : String(err);
  return NAVIGATION_DESTROYED_CONTEXT_SIGNATURES.some((s) => message.includes(s));
}

/**
 * Compare two URLs for "is this still the page under observation?".
 *
 * The fragment is ignored on purpose: a `#section` change is a same-document
 * navigation that does NOT destroy the execution context and does not move the
 * page off the observed document. Everything else — a different path, query, or
 * origin — is a different page, and the scroll must not keep stepping it.
 *
 * Unparseable input falls back to exact string equality rather than guessing.
 */
export function isSameObservedDocument(a: string, b: string): boolean {
  if (a === b) return true;
  try {
    const ua = new URL(a);
    const ub = new URL(b);
    ua.hash = "";
    ub.hash = "";
    return ua.href === ub.href;
  } catch {
    return false;
  }
}

/**
 * Task 28.7 A1 — the page changed document DURING the preparation scroll, but
 * quietly enough that no evaluate ever threw.
 *
 * WHY THIS EXISTS. Playwright only throws `Execution context was destroyed` when
 * a navigation lands INSIDE an in-flight evaluate. A scroll-triggered navigation
 * that completes during the scroll's own 250ms step settle produces no error at
 * all: the next evaluate simply runs against the NEW document, and the scroll
 * cheerfully keeps stepping — and then collecting — a page that is not the one
 * under observation. That silent version is the more dangerous of the two, so
 * the scroll pass checks the document identity after every step and raises this.
 */
export class PageNavigatedDuringScrollError extends Error {
  readonly navigatedUrl: string;
  constructor(navigatedUrl: string) {
    super(
      `the page navigated to ${navigatedUrl} during the preparation scroll ` +
        "(no execution context was destroyed; the document simply changed)",
    );
    this.name = "PageNavigatedDuringScrollError";
    this.navigatedUrl = navigatedUrl;
  }
}

/**
 * The single predicate the preparation-scroll recovery branches on: either
 * Playwright told us the context died, or we noticed the document changed.
 */
export function isScrollNavigationInterruption(err: unknown): boolean {
  return (
    err instanceof PageNavigatedDuringScrollError ||
    isNavigationDestroyedContextError(err)
  );
}
