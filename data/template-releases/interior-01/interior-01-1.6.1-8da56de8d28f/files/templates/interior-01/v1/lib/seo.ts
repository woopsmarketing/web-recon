import type { Metadata } from "next";
import { homeHero } from "../sections/homeHeroData";
import type { Ctx } from "../sections/types";

/**
 * Per-page metadata over the layout defaults (brand title, business summary,
 * metadataBase, robots). Canonical ONLY when the Site Instance declares a
 * real production origin (no fabricated domain); the path is resolved against it.
 * 1.5.2: the same condition adds OpenGraph from the SAME title / description / path
 * (og:url = the canonical; og:description = the page's description, else the layout's
 * business summary — i.e. always the page's effective meta description), with the
 * site's share image: the first slide of the home hero, i.e. the first picture a
 * visitor of the site sees — only a raster (link previews do not render SVG);
 * none = no og:image.
 */
export function pageMetadata(ctx: Ctx, page: { title: string; description?: string; path: string }): Metadata {
  if (!ctx.identity.publicOrigin) {
    return { title: page.title, ...(page.description ? { description: page.description } : {}) };
  }
  const ogDescription = page.description || ctx.content.getSingleton("business").summary;
  const first = homeHero(ctx)?.slides[0]?.image;
  const image = first && /\.(jpe?g|png|webp|gif)$/.test(first.src) ? first : undefined;
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
