import type { Ctx } from "./types";

/**
 * The site's contact destination for calls to action. Today: the business email
 * (mailto:). No destination → undefined, and every CTA that needs it is not rendered.
 * Future seam (not implemented): an accepted inquiry destination, or a chat launcher
 * action that replaces this href.
 */
export function contactHref(ctx: Ctx): string | undefined {
  const email = ctx.content.getSingleton("business").contact?.email;
  return email ? `mailto:${email}` : undefined;
}

export interface LiveLink {
  label: string;
  href: string;
  /** a page of this site → client navigation; otherwise a plain <a> (anchor, mailto:, tel:) */
  internal: boolean;
}

/**
 * An operator-chosen link slot, kept only when its destination exists in THIS build:
 * a /path must be a generated page, a #anchor must be a section rendered on the page.
 * mailto:/tel: are kept as given (the slot schema already restricts their shape).
 * A dead destination hides the link — nothing is invented, no dead link is emitted.
 */
export function liveLink(ctx: Ctx, link: { label: string; href: string } | undefined, anchors: ReadonlySet<string>): LiveLink | undefined {
  if (!link) return undefined;
  if (link.href.startsWith("/")) return ctx.routes.paths().includes(link.href) ? { ...link, internal: true } : undefined;
  if (link.href.startsWith("#")) return anchors.has(link.href.slice(1)) ? { ...link, internal: false } : undefined;
  return { ...link, internal: false };
}
