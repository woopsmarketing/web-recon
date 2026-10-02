import type { Ctx } from "./types";

/**
 * The site's contact destination for calls to action (header pill, floating seat, detail CTA,
 * hero contact slides). 1.5.0: the /contact page, when the site has a contact channel (see
 * hasContactChannel). No channel → undefined, and every CTA that needs it is not rendered (the
 * /contact page itself still exists and says so).
 * Future seam (not implemented): a chat launcher action that replaces this href.
 */
export function contactHref(ctx: Ctx): string | undefined {
  return hasContactChannel(ctx) && ctx.routes.has("contact") ? "/contact" : undefined;
}

/** The business email: the direct address, and what the /contact form's mail hand-off writes to. */
export function contactEmail(ctx: Ctx): string | undefined {
  return ctx.content.getSingleton("business").contact?.email || undefined;
}

/** 1.6.2: the inquiry endpoint the site declares (its inquiry.json) — the /contact form then submits online. */
export function inquiryEndpoint(ctx: Ctx): string | undefined {
  return ctx.inquiry?.endpoint;
}

/**
 * A contact channel = something the /contact form can deliver to: the business email (mail
 * hand-off) or, 1.6.2, a declared inquiry endpoint (online). A site with an email and no endpoint
 * is exactly the pre-1.6.2 case.
 */
export function hasContactChannel(ctx: Ctx): boolean {
  return Boolean(contactEmail(ctx) || inquiryEndpoint(ctx));
}

/**
 * 1.5.1: the generated pages a site lists and links to — every route-plan path except /contact
 * when the site has no contact channel (the page is still generated: the route plan has no
 * per-site switch for a static page, so there it only says contact details are not available).
 * The sitemap and operator link slots use this; contactHref already needs the channel.
 */
export function listedPaths(ctx: Ctx): string[] {
  const paths = ctx.routes.paths();
  return hasContactChannel(ctx) ? paths : paths.filter((p) => p !== "/contact");
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
