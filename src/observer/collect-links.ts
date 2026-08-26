import type { ElementObservation, LinkObservation } from "./types.js";

/**
 * Derive links from observed elements (Phase 3, Node side).
 *
 * Runs after the in-page DOM walk so link `elementId`s match dom.json exactly.
 * URL resolution uses Node's URL against the page's `baseUri`; the raw `href`
 * is always preserved, even for non-URL pseudo-links (`javascript:`, `mailto:`,
 * `tel:`, in-page `#fragment`).
 */

const HTTP_PROTOCOLS = new Set(["http:", "https:"]);

function stripWww(host: string): string {
  return host.startsWith("www.") ? host.slice(4) : host;
}

function safeHost(url: string): string | null {
  try {
    return stripWww(new URL(url).hostname.toLowerCase());
  } catch {
    return null;
  }
}

/** Resolve `href` against `baseUri`; return an absolute http(s) URL or null. */
function resolveHttpUrl(href: string, baseUri: string): string | null {
  try {
    const u = new URL(href, baseUri);
    return HTTP_PROTOCOLS.has(u.protocol) ? u.toString() : null;
  } catch {
    return null;
  }
}

export function deriveLinks(
  elements: readonly ElementObservation[],
  baseUri: string,
  pageUrl: string,
): LinkObservation[] {
  const pageHost = safeHost(pageUrl);
  const links: LinkObservation[] = [];

  for (const el of elements) {
    if (el.tagName !== "a" && el.tagName !== "area") continue;
    const href = el.attributes["href"];
    if (href === undefined) continue; // e.g. named anchors with no href

    const link: LinkObservation = {
      elementId: el.id,
      href,
      internal: false,
    };

    const resolved = resolveHttpUrl(href, baseUri);
    if (resolved) {
      link.resolvedUrl = resolved;
      const host = safeHost(resolved);
      link.internal = host !== null && pageHost !== null && host === pageHost;
    }

    if (el.text) link.text = el.text;
    const target = el.attributes["target"];
    if (target) link.target = target;
    const rel = el.attributes["rel"];
    if (rel) link.rel = rel;

    links.push(link);
  }

  return links;
}
