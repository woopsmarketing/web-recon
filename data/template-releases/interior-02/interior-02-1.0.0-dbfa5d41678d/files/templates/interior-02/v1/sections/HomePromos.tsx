import Link from "next/link";
import { mediaOf } from "../components/home/shared";
import { liveLink, type LiveLink } from "../lib/links";
import type { Ctx } from "./types";

export interface PromoTile {
  key: string;
  tone: "dark" | "light";
  label?: string;
  title: string;
  text?: string;
  media?: { src: string; width: number; height: number; alt: string };
  link?: LiveLink;
}

export interface HomePromosData {
  tiles: PromoTile[];
}

/** home.promos — two tiles from numbered slots; a tile exists when it has a title. None → nothing. */
export function homePromos(ctx: Ctx): HomePromosData | undefined {
  const settings = ctx.settings["home.promos"];
  const tiles: PromoTile[] = [];
  for (const n of [1, 2] as const) {
    const title = ctx.slots.text("home.promos", `tile${n}Title`);
    if (!title) continue;
    tiles.push({
      key: `tile${n}`,
      tone: settings[`tile${n}Tone`],
      label: ctx.slots.text("home.promos", `tile${n}Label`),
      title,
      text: ctx.slots.text("home.promos", `tile${n}Text`),
      media: mediaOf(ctx, "home.promos", `tile${n}Media`),
      link: liveLink(ctx, ctx.slots.link("home.promos", `tile${n}Link`)),
    });
  }
  return tiles.length > 0 ? { tiles } : undefined;
}

/** Two tiles side by side (stacked ≤ 1024): label, title, one line over background media; each one link. */
export function HomePromos({ data }: { data: HomePromosData }) {
  return (
    <section className="i2-promos" data-section="home.promos">
      <div className="i2-wrap">
        <div className="i2-promos__grid">
          {data.tiles.map((t) => {
            const className = `i2-promo i2-promo--${t.tone}`;
            const body = (
              <>
                {t.media ? <img className="i2-promo__media" src={t.media.src} width={t.media.width} height={t.media.height} alt={t.media.alt} loading="lazy" decoding="async" /> : null}
                <span className="i2-promo__body">
                  {t.label ? <span className="i2-promo__label">{t.label}</span> : null}
                  <strong className="i2-promo__title">{t.title}</strong>
                  {t.text ? <span className="i2-promo__text">{t.text}</span> : null}
                </span>
              </>
            );
            if (t.link?.internal) {
              return (
                <Link key={t.key} href={t.link.href} className={className} data-promo={t.key}>
                  {body}
                </Link>
              );
            }
            if (t.link) {
              return (
                <a key={t.key} href={t.link.href} className={className} data-promo={t.key}>
                  {body}
                </a>
              );
            }
            return (
              <div key={t.key} className={className} data-promo={t.key}>
                {body}
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
