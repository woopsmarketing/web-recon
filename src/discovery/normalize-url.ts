import { TRACKING_PARAMS } from "./types.js";

/**
 * Deterministic URL normalization for discovery.
 *
 * Guiding rule: normalization must never change what a URL *means*. We only
 * collapse forms that are provably equivalent for the same origin server:
 *  - drop the `#fragment` (client-side only, never sent to the server)
 *  - accept http/https only
 *  - lowercase the host (the URL parser already does this)
 *  - drop the default port (:80 for http, :443 for https)
 *  - remove a few obvious tracking-only query params
 *
 * We intentionally do NOT reorder or drop meaningful query parameters, and we
 * do not touch the path (no trailing-slash rewriting), because on many sites
 * (e.g. `/bbs/board.php?bo_table=notice`) those are part of the page identity.
 */

const ALLOWED_PROTOCOLS = new Set(["http:", "https:"]);

/** Strip a single leading `www.` label for same-site comparison. */
export function stripWww(host: string): string {
  return host.startsWith("www.") ? host.slice(4) : host;
}

/**
 * Normalize a URL string. Returns the normalized absolute URL, or `null` if the
 * input cannot be parsed or is not an http(s) URL (caller records it as invalid).
 */
export function normalizeUrl(input: string): string | null {
  let url: URL;
  try {
    url = new URL(input);
  } catch {
    return null;
  }

  if (!ALLOWED_PROTOCOLS.has(url.protocol)) {
    return null;
  }

  // Drop fragment.
  url.hash = "";

  // Drop default ports (URL usually does this, but be explicit).
  if (
    (url.protocol === "http:" && url.port === "80") ||
    (url.protocol === "https:" && url.port === "443")
  ) {
    url.port = "";
  }

  // Remove obvious tracking parameters while preserving order of the rest.
  for (const param of TRACKING_PARAMS) {
    url.searchParams.delete(param);
  }

  return url.toString();
}

/**
 * Decide whether a normalized candidate URL belongs to the same site as the
 * root. Simple, non-public-suffix policy:
 *  - `example.com` and `www.example.com` are treated as the same site.
 *  - By default, other subdomains (`blog.example.com`) are NOT same-site.
 *  - With `includeSubdomains`, any host ending in `.<root>` is same-site too.
 */
export function isSameSite(
  candidateUrl: string,
  rootUrl: string,
  includeSubdomains = false,
): boolean {
  let candidateHost: string;
  let rootHost: string;
  try {
    candidateHost = stripWww(new URL(candidateUrl).hostname.toLowerCase());
    rootHost = stripWww(new URL(rootUrl).hostname.toLowerCase());
  } catch {
    return false;
  }

  if (candidateHost === rootHost) {
    return true;
  }
  if (includeSubdomains && candidateHost.endsWith(`.${rootHost}`)) {
    return true;
  }
  return false;
}
