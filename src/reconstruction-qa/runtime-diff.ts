import type { PageDiagnostics } from "./capture-page.js";
import type { RuntimeDiffSummary } from "./types.js";

/**
 * Runtime error comparison (items 56, 177).
 *
 * Both sides are collected, and only ONE side is ever charged. A public site
 * that logs its own analytics error on every page load is not a defect in a
 * clone that never included that analytics script, so an original-side error is
 * recorded next to the clone's and never added to it.
 *
 * A browser crash or a navigation timeout is deliberately NOT in here: that is
 * infrastructure, not fidelity (item 177), and it surfaces as a page status
 * instead.
 *
 * Console messages that both sides produce identically are still counted on both
 * sides — this module reports, it does not net anything off.
 *
 * ## Blocked assets are not JavaScript errors (item 54)
 *
 * A cross-origin image the origin refuses arrives in the console as an error, and
 * on MDN that is 84 messages per page load. They are split out here and reported
 * as `asset-hotlink-blocked` instead: the clone's runtime is not at fault for a
 * `Cross-Origin-Resource-Policy` header on somebody else's CDN, and folding the
 * two together would make "clone JS errors" a number about MDN's headers.
 */

/** Console text that describes a refused resource rather than broken script. */
const ASSET_BLOCK_PATTERNS: readonly RegExp[] = [
  /blocked by CORS policy/i,
  /Cross-Origin-Resource-Policy/i,
  /ERR_BLOCKED_BY_RESPONSE/i,
  /ERR_BLOCKED_BY_CLIENT/i,
  /Failed to load resource/i,
  /net::ERR_FAILED/i,
  /ERR_CERT_/i,
  /ERR_NAME_NOT_RESOLVED/i,
];

export function isBlockedAssetMessage(message: string): boolean {
  return ASSET_BLOCK_PATTERNS.some((pattern) => pattern.test(message));
}

/** Messages a clone can emit that describe the ORIGINAL page's own content. */
const SAMPLE_LIMIT = 5;

export interface RuntimeDiffResult {
  summary: RuntimeDiffSummary;
  /** Clone-side JS messages, deterministically sorted and capped. */
  cloneMessages: string[];
  /** Clone-side blocked-asset messages, sorted. */
  blockedAssetMessages: string[];
  /** True when the clone reported a JS error the original did not. */
  cloneOnlyErrors: boolean;
}

export function diffRuntime(
  clone: PageDiagnostics | undefined,
  original: PageDiagnostics | undefined,
  cloneUrl: string,
): RuntimeDiffResult {
  const cloneConsoleErrors = clone?.consoleErrors ?? [];
  const cloneConsoleWarnings = clone?.consoleWarnings ?? [];
  const clonePageErrors = clone?.pageErrors ?? [];
  const cloneFailedResources = clone?.failedResources ?? [];

  const allMessages = [...new Set([...cloneConsoleErrors, ...clonePageErrors])].sort();
  const blockedAssetMessages = allMessages.filter(isBlockedAssetMessage);
  // A page error is an uncaught exception: always JavaScript, whatever it says.
  const jsErrorSet = new Set(clonePageErrors);
  const messages = allMessages.filter(
    (message) => jsErrorSet.has(message) || !isBlockedAssetMessage(message),
  );
  const originalMessages = new Set([
    ...(original?.consoleErrors ?? []),
    ...(original?.pageErrors ?? []),
  ]);
  const cloneOnly = messages.filter((message) => !originalMessages.has(message));

  // A navigation away from the requested clone URL is unexpected: the clone has
  // no router of its own and every link is a plain href.
  const unexpectedNavigations = (clone?.navigations ?? []).filter((url) => {
    try {
      return url !== new URL(cloneUrl).origin + new URL(cloneUrl).pathname;
    } catch {
      return false;
    }
  }).length;

  return {
    summary: {
      cloneConsoleErrors: cloneConsoleErrors.length,
      cloneBlockedAssetMessages: blockedAssetMessages.length,
      cloneJsErrors: messages.length,
      cloneConsoleWarnings: cloneConsoleWarnings.length,
      clonePageErrors: clonePageErrors.length,
      cloneHydrationErrors: clone?.hydrationErrors ?? 0,
      cloneFailedResources: cloneFailedResources.length,
      cloneUnexpectedNavigations: unexpectedNavigations,
      ...(original
        ? {
            originalConsoleErrors: original.consoleErrors.length,
            originalPageErrors: original.pageErrors.length,
            originalFailedResources: original.failedResources.length,
          }
        : {}),
      cloneSamples: messages.slice(0, SAMPLE_LIMIT),
    },
    cloneMessages: messages,
    blockedAssetMessages,
    cloneOnlyErrors: cloneOnly.length > 0,
  };
}
