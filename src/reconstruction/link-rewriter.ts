import { ReconstructionError } from "./types.js";
import { clonePathFor, routeKeyFromUrl } from "./route-plan.js";

/**
 * `href` rewriting (items 81–83).
 *
 * A clone whose links point back at the original site is a screenshot with extra
 * steps: the first click leaves. So same-origin links that name a VERIFIED route
 * become clone-local paths, query and fragment intact.
 *
 * Everything else is left alone on purpose:
 *
 *  - external `http(s)`, `mailto:` and `tel:` keep the author's href (item 82)
 *  - a same-origin URL that is NOT in the route table keeps its local pathname,
 *    so the clone answers with its own not-found (item 83). The alternative —
 *    quietly pointing it at "a similar page" — would manufacture a route the
 *    pipeline never verified.
 *  - `javascript:` is script source. Task 13 removes it, so its presence here
 *    means the artifact was edited, and the generator refuses rather than
 *    emitting it (item 82).
 */

export type LinkKind =
  | "internal-route"
  | "internal-unresolved"
  | "external"
  | "fragment"
  | "non-http"
  | "unparseable";

export interface RewrittenLink {
  href: string;
  kind: LinkKind;
}

export interface LinkRewriterOptions {
  rootUrl: string;
  /** Route keys that exist in the clone. */
  routeKeys: ReadonlySet<string>;
}

const NON_NAVIGATIONAL_SCHEMES = /^(mailto|tel|sms|geo|callto|bitcoin|magnet|ftp|ftps|news|nntp|irc|ircs|xmpp|webcal|whatsapp|skype|facetime|maps):/i;

export class LinkRewriter {
  private readonly origin: string;

  constructor(private readonly options: LinkRewriterOptions) {
    this.origin = new URL(options.rootUrl).origin;
  }

  /**
   * @param href     the author's value, exactly as the SiteSpec holds it
   * @param pageUrl  the URL the containing page was observed at — the base a
   *                 relative href resolves against
   */
  rewrite(href: string, pageUrl: string): RewrittenLink {
    const trimmed = href.trim();
    if (trimmed === "") return { href, kind: "unparseable" };

    if (/^javascript:/i.test(trimmed)) {
      throw new ReconstructionError(
        `a javascript: href reached the generator (${trimmed.slice(0, 60)}). Task 13 ` +
          `removes these as script source, so this SiteSpec has been modified.`,
      );
    }
    // `data:` and `blob:` hrefs are navigation payloads, not links to a page.
    if (/^(data|blob|file|vbscript):/i.test(trimmed)) {
      return { href: "#", kind: "non-http" };
    }
    if (NON_NAVIGATIONAL_SCHEMES.test(trimmed)) {
      return { href: trimmed, kind: "non-http" };
    }
    // A pure fragment is handled by the relation rewriter, not here.
    if (trimmed.startsWith("#")) return { href: trimmed, kind: "fragment" };

    let resolved: URL;
    try {
      resolved = new URL(trimmed, pageUrl);
    } catch {
      return { href: trimmed, kind: "unparseable" };
    }
    if (resolved.protocol !== "http:" && resolved.protocol !== "https:") {
      return { href: trimmed, kind: "non-http" };
    }
    if (resolved.origin !== this.origin) {
      return { href: resolved.toString(), kind: "external" };
    }

    const key = routeKeyFromUrl(resolved);
    const local = `${clonePathFor(resolved)}${resolved.hash}`;
    return this.options.routeKeys.has(key)
      ? { href: local, kind: "internal-route" }
      : { href: local, kind: "internal-unresolved" };
  }
}
