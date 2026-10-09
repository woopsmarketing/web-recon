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

/**
 * What the layout gives every page that does not say otherwise (app/layout.tsx). Next.js merges it
 * under a page's own metadata; the portfolio runtime (runtime/portfolio.ts) does the same merge for
 * the pages it describes, so a composed page says what a built one says.
 */
export function inheritedMetadata(ctx: Ctx): { title: string; description?: string } {
  return { title: ctx.identity.brandName, description: ctx.content.getSingleton("business").summary };
}

/** "<page title> | <brand>" — the title form every sub-page uses. */
export function titleWithBrand(ctx: Ctx, title: string | undefined): string {
  return title ? `${title} | ${ctx.identity.brandName}` : ctx.identity.brandName;
}
