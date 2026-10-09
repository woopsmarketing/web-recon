import type { Ctx, NavKey } from "../sections/types";

/**
 * Route-driven navigation (SHELL shared block).
 *   navItems(ctx, labels)  → the site's pages in nav order, only routes that generate a page here
 *   contactHref(ctx)       → "/contact" when the contact page exists and the site has a channel, else undefined
 *   contactEmail(ctx)      → the business e-mail or undefined
 *   listedPaths(ctx)       → every generated path except /contact on a site without a channel (sitemap, link slots)
 *   liveLink(ctx, link)    → an operator link slot kept only when its destination exists in this build
 */

export interface NavItem {
  key: NavKey;
  href: string;
  label: string;
}

/** Route key per nav item; "portfolio" = the list's first page. */
const ROUTE_OF: Record<NavKey, { route: string; href: string }> = {
  home: { route: "home", href: "/" },
  about: { route: "about", href: "/about" },
  portfolio: { route: "portfolio.index", href: "/portfolio" },
  service: { route: "service", href: "/service" },
  contact: { route: "contact", href: "/contact" },
  faq: { route: "faq", href: "/faq" },
};

/** Page links in bar order (the logo is the home link; the drawer adds "home" in front). */
export const NAV_ORDER: readonly NavKey[] = ["about", "portfolio", "service", "contact", "faq"];

/**
 * The nav items that exist for this site, in nav order. `labels` maps a key to its slot text;
 * an item without a label or without a generated page is left out. The contact item is kept
 * only with a contact channel (see contactHref).
 */
export function navItems(ctx: Ctx, labels: Partial<Record<NavKey, string | undefined>>, keys: readonly NavKey[] = NAV_ORDER): NavItem[] {
  const out: NavItem[] = [];
  for (const key of keys) {
    const label = labels[key];
    if (!label) continue;
    const { route, href } = ROUTE_OF[key];
    if (key === "contact") {
      const contact = contactHref(ctx);
      if (contact) out.push({ key, href: contact, label });
      continue;
    }
    if (ctx.routes.has(route)) out.push({ key, href, label });
  }
  return out;
}

/** The contact destination of every call to action; no channel or no page → undefined (the CTA is not rendered). */
export function contactHref(ctx: Ctx): string | undefined {
  return hasContactChannel(ctx) && ctx.routes.has("contact") ? "/contact" : undefined;
}

export function contactEmail(ctx: Ctx): string | undefined {
  return ctx.content.getSingleton("business").contact?.email || undefined;
}

/** A contact channel = the business e-mail (mail hand-off) or a declared inquiry endpoint (online form). */
export function hasContactChannel(ctx: Ctx): boolean {
  return Boolean(contactEmail(ctx) || ctx.inquiry?.endpoint);
}

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
 * An operator-chosen link slot, kept only when its destination exists in THIS build: a /path must
 * be a generated, listed page; a #anchor must be in `anchors`; mailto:/tel: are kept as given.
 */
export function liveLink(ctx: Ctx, link: { label: string; href: string } | undefined, anchors: ReadonlySet<string> = new Set()): LiveLink | undefined {
  if (!link) return undefined;
  if (link.href.startsWith("/")) return listedPaths(ctx).includes(link.href) ? { ...link, internal: true } : undefined;
  if (link.href.startsWith("#")) return anchors.has(link.href.slice(1)) ? { ...link, internal: false } : undefined;
  return { ...link, internal: false };
}
