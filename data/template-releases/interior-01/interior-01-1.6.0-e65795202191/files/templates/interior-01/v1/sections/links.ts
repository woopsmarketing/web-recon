import type { Ctx } from "./types";

/**
 * The site's contact destination for calls to action (header pill, floating seat, detail CTA,
 * hero contact slides). 1.5.0: the /contact page, when the site has a contact channel (the
 * business email the page's form writes to). No channel → undefined, and every CTA that needs
 * it is not rendered (the /contact page itself still exists and says so).
 * Future seam (not implemented): an accepted inquiry backend behind the same page, or a chat
 * launcher action that replaces this href.
 */
export function contactHref(ctx: Ctx): string | undefined {
  return contactEmail(ctx) && ctx.routes.has("contact") ? "/contact" : undefined;
}

/** The business email: the one contact channel today (the /contact form writes to it). */
export function contactEmail(ctx: Ctx): string | undefined {
  return ctx.content.getSingleton("business").contact?.email || undefined;
}

/**
 * 1.5.1: the generated pages a site lists and links to — every route-plan path except /contact
 * when the site has no contact channel (the page is still generated: the route plan has no
 * per-site switch for a static page, so there it only says contact details are not available).
 * The sitemap and operator link slots use this; contactHref already needs the channel.
 */
export function listedPaths(ctx: Ctx): string[] {
  const paths = ctx.routes.paths();
  return contactEmail(ctx) ? paths : paths.filter((p) => p !== "/contact");
}

export interface LiveLink {
  label: string;
  href: string;
  /** a page of this site → client navigation; otherwise a plain <a> (anchor, mailto:, tel:) */
  internal: boolean;
}

/**
 * An operator-chosen link slot, kept only when its destination exists in THIS build:
 * a /path must be a generated, listed page (listedPaths), a #anchor must be a section rendered on the page.
 * mailto:/tel: are kept as given (the slot schema already restricts their shape).
 * A dead destination hides the link — nothing is invented, no dead link is emitted.
 */
export function liveLink(ctx: Ctx, link: { label: string; href: string } | undefined, anchors: ReadonlySet<string>): LiveLink | undefined {
  if (!link) return undefined;
  if (link.href.startsWith("/")) return listedPaths(ctx).includes(link.href) ? { ...link, internal: true } : undefined;
  if (link.href.startsWith("#")) return anchors.has(link.href.slice(1)) ? { ...link, internal: false } : undefined;
  return { ...link, internal: false };
}
