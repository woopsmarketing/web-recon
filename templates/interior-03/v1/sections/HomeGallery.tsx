import Link from "next/link";
import { SectionTitle } from "../components/home/SectionTitle";
import { assetMedia, slotMedia, type Media } from "../lib/media";
import type { Ctx } from "./types";

/** At most four tiles (two rows of two). */
const GALLERY_MAX_TILES = 4;

export interface GalleryTile {
  /** the category id */
  id: string;
  name: string;
  caption?: string;
  /** the portfolio list filtered to this category; undefined = the tile is a plain block */
  href?: string;
  media: Media;
}

export interface HomeGalleryData {
  title: string;
  tiles: GalleryTile[];
}

/**
 * home.gallery — the site's categories (reader order) that have at least one served project, at
 * most four; tile n = the n-th such category. Name = the category name; picture = the tile's media
 * slot, else the cover of the category's latest project; caption = the tile's caption slot. Each
 * tile links to the portfolio filtered to its category when that list exists in this build.
 * Disabled or no such category → nothing.
 */
export function homeGallery(ctx: Ctx): HomeGalleryData | undefined {
  if (!ctx.settings["home.gallery"].enabled) return undefined;
  const portfolio = ctx.routes.has("portfolio.index");
  const tiles: GalleryTile[] = [];
  for (const category of ctx.content.list({ type: "categories" }).items) {
    if (tiles.length >= GALLERY_MAX_TILES) break;
    const latest = ctx.content.list({ type: "projects", selection: { mode: "category", category: category.id }, limit: 1 }).items[0];
    if (!latest) continue;
    const n = tiles.length + 1;
    tiles.push({
      id: category.id,
      name: category.name,
      caption: ctx.slots.text("home.gallery", `tile${n}Caption`),
      href: portfolio ? `/portfolio?category=${encodeURIComponent(category.id)}` : undefined,
      media: slotMedia(ctx, "home.gallery", `tile${n}Media`) ?? assetMedia(ctx, latest.cover),
    });
  }
  if (tiles.length === 0) return undefined;
  return { title: ctx.slots.text("home.gallery", "title") ?? "", tiles };
}

/**
 * Title block, then the tiles: two per row (49% + 2% gap, wrapped rows 40px apart; 30px ≤ 768), one per row ≤ 480; picture (27:16,
 * covered), the name (22px, bold) and the small muted caption. The tiles sit under the hero, so
 * every picture loads lazily.
 */
export function HomeGallery({ data }: { data: HomeGalleryData }) {
  return (
    <section className="i3-sec i3-gal" data-section="home.gallery" aria-labelledby="i3-gal-title">
      <div className="i3-wrap">
        <SectionTitle title={data.title} id="i3-gal-title" />
        <ul className="i3-gal__list">
          {data.tiles.map((t) => {
            const inner = (
              <>
                <span className="i3-gal__pic">
                  <img src={t.media.src} width={t.media.width} height={t.media.height} alt={t.media.alt} loading="lazy" decoding="async" />
                </span>
                <h3 className="i3-gal__name">{t.name}</h3>
                {t.caption ? <p className="i3-gal__cap">{t.caption}</p> : null}
              </>
            );
            return (
              <li key={t.id} className="i3-gal__tile" data-gallery-tile={t.id}>
                {t.href ? (
                  <Link href={t.href} className="i3-gal__link">
                    {inner}
                  </Link>
                ) : (
                  <div className="i3-gal__link">{inner}</div>
                )}
              </li>
            );
          })}
        </ul>
      </div>
    </section>
  );
}
