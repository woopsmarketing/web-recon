import type { Metadata } from "next";
import type { Ctx } from "../sections/types";

/**
 * Per-page metadata (SHELL shared block).
 *   pageMetadata(ctx, { title, description?, path }) → Metadata
 * Canonical + OpenGraph ONLY when the site declares a public origin (no domain is invented);
 * og:image = the first published banner's image when it is a raster (link previews do not
 * render SVG). The layout supplies metadataBase and the robots rule.
 */
export function pageMetadata(ctx: Ctx, page: { title: string; description?: string; path: string }): Metadata {
  if (!ctx.identity.publicOrigin) {
    return { title: page.title, ...(page.description ? { description: page.description } : {}) };
  }
  const ogDescription = page.description || ctx.content.getSingleton("business").summary;
  const banner = ctx.content.list({ type: "banners", limit: 1 }).items[0];
  const resolved = banner ? ctx.assets.resolve(banner.image.asset) : undefined;
  const image = resolved && /\.(jpe?g|png|webp)$/.test(resolved.src) ? { ...resolved, alt: banner?.image.alt } : undefined;
  return {
    title: page.title,
    ...(page.description ? { description: page.description } : {}),
    alternates: { canonical: page.path },
    openGraph: {
      type: "website",
      title: page.title,
      ...(ogDescription ? { description: ogDescription } : {}),
      url: page.path,
      ...(image ? { images: [{ url: image.src, width: image.width, height: image.height, ...(image.alt ? { alt: image.alt } : {}) }] } : {}),
    },
  };
}

/** "<page title> | <brand>" — the title form every sub-page uses. */
export function titleWithBrand(ctx: Ctx, title: string | undefined): string {
  return title ? `${title} | ${ctx.identity.brandName}` : ctx.identity.brandName;
}
