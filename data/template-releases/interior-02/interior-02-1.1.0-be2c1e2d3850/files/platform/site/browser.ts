/**
 * Browser-side URL state + build-embedded data for Template client islands.
 *
 * Template code may not touch `window`/`globalThis`/network (release gate); this module
 * is the narrow, platform-owned door for the few browser facilities a static per-site
 * build legitimately needs:
 *   - read the current query string
 *   - write it (history push/replace, same document, no reload, no request)
 *   - be told when back/forward changed it
 * Nothing here fetches, stores or reads anything outside the current document.
 * Every function is a no-op / empty outside a browser (server render).
 */

const inBrowser = () => typeof window !== "undefined";

/** Current query parameters (empty on the server). */
export function readQuery(): URLSearchParams {
  return new URLSearchParams(inBrowser() ? window.location.search : "");
}

/**
 * Replace the query string of the CURRENT path (the path never changes here).
 * `push` adds a history entry (discrete user choices); otherwise the entry is replaced.
 */
export function writeQuery(query: string, opts: { push: boolean }): void {
  if (!inBrowser()) return;
  const qs = query.replace(/^\?/, "");
  const next = `${window.location.pathname}${qs ? `?${qs}` : ""}`;
  if (next === `${window.location.pathname}${window.location.search}`) return;
  // `null` state: Next's patched history methods then copy their internal state AND sync the
  // router's own URL (passing its current state object would skip that sync).
  if (opts.push) window.history.pushState(null, "", next);
  else window.history.replaceState(null, "", next);
}

/** Calls `listener` after back/forward navigation within the document; returns an unsubscribe. */
export function onHistoryChange(listener: () => void): () => void {
  if (!inBrowser()) return () => {};
  const handler = () => listener();
  window.addEventListener("popstate", handler);
  return () => window.removeEventListener("popstate", handler);
}
