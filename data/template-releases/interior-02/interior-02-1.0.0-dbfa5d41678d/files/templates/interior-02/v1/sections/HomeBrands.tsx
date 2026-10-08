import Link from "next/link";
import { Icon, type IconName } from "../components/ui/Icon";
import { SectionHeading } from "../components/ui/SectionHeading";
import { liveLink, type LiveLink } from "../lib/links";
import type { Ctx } from "./types";

export interface BrandTile {
  key: string;
  tone: "navy" | "mint" | "yellow";
  icon: IconName;
  title: string;
  text?: string;
  link?: LiveLink;
}

export interface HomeBrandsData {
  title: string;
  tiles: BrandTile[];
}

/** Template-drawn icon tiles: one accent colour and one glyph per position. */
const TONES: readonly BrandTile["tone"][] = ["navy", "mint", "yellow"];
const ICONS: readonly IconName[] = ["home", "cube", "grid"];

/** home.brands — up to three tiles from numbered slots; a tile exists when it has a title. None → nothing. */
export function homeBrands(ctx: Ctx): HomeBrandsData | undefined {
  const tiles: BrandTile[] = [];
  for (const n of [1, 2, 3] as const) {
    const title = ctx.slots.text("home.brands", `brand${n}Title`);
    if (!title) continue;
    tiles.push({
      key: `brand${n}`,
      tone: TONES[n - 1]!,
      icon: ICONS[n - 1]!,
      title,
      text: ctx.slots.text("home.brands", `brand${n}Text`),
      link: liveLink(ctx, ctx.slots.link("home.brands", `brand${n}Link`)),
    });
  }
  if (tiles.length === 0) return undefined;
  return { title: ctx.slots.text("home.brands", "title") ?? "", tiles };
}

/** Heading; tiles between hairlines: 64 px rounded icon tile, title, one line (3 columns; stacked ≤ 1280). */
export function HomeBrands({ data }: { data: HomeBrandsData }) {
  return (
    <section className="i2-sec i2-brands" data-section="home.brands" aria-labelledby={data.title ? "i2-brands-title" : undefined}>
      <div className="i2-wrap">
        {data.title ? <SectionHeading title={data.title} id="i2-brands-title" /> : null}
        <ul className="i2-brands__grid">
          {data.tiles.map((t) => {
            const body = (
              <>
                <span className={`i2-brand__icon i2-brand__icon--${t.tone}`} aria-hidden="true">
                  <Icon name={t.icon} size={30} />
                </span>
                <span className="i2-brand__body">
                  <strong className="i2-brand__title">{t.title}</strong>
                  {t.text ? <span className="i2-brand__text">{t.text}</span> : null}
                </span>
              </>
            );
            return (
              <li key={t.key} className="i2-brand" data-brand={t.key}>
                {t.link?.internal ? (
                  <Link href={t.link.href} className="i2-brand__link">
                    {body}
                  </Link>
                ) : t.link ? (
                  <a href={t.link.href} className="i2-brand__link">
                    {body}
                  </a>
                ) : (
                  <div className="i2-brand__link">{body}</div>
                )}
              </li>
            );
          })}
        </ul>
      </div>
    </section>
  );
}
