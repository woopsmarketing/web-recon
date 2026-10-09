import { HeroSlider, type HeroSlide } from "../components/home/HeroSlider";
import { slotMedia, type Media } from "../lib/media";
import type { Ctx } from "./types";

/** The content schema stores at most 8 banners; the hero shows every served one. */
const HERO_MAX_SLIDES = 8;

export interface HomeHeroData {
  brandName: string;
  autoplay: boolean;
  slides: HeroSlide[];
  mark?: Media;
  line1?: string;
  line2?: string;
  regionLabel: string;
  dotLabel: string;
  pauseLabel: string;
  playLabel: string;
}

/**
 * home.hero — the banners' images are the slides (a banner's headline, text and call to action
 * are not used by this template); the slogan is the section's slots. No banner → the slogan
 * alone on the quiet surface; no slogan line either → nothing (the page then renders the <h1>
 * itself).
 */
export function homeHero(ctx: Ctx): HomeHeroData | undefined {
  const t = (key: string) => ctx.slots.text("home.hero", key);
  const { items } = ctx.content.list({ type: "banners", limit: HERO_MAX_SLIDES });
  const line1 = t("line1");
  const line2 = t("line2");
  if (items.length === 0 && !line1 && !line2) return undefined;
  return {
    brandName: ctx.identity.brandName,
    autoplay: ctx.settings["home.hero"].autoplay,
    slides: items.map((b) => ({ id: b.id, ...ctx.assets.resolve(b.image.asset), alt: b.image.alt ?? "" })),
    mark: slotMedia(ctx, "home.hero", "mark"),
    line1,
    line2,
    regionLabel: t("regionLabel") ?? "",
    dotLabel: t("dotLabel") ?? "",
    pauseLabel: t("pauseLabel") ?? "",
    playLabel: t("playLabel") ?? "",
  };
}

/**
 * The page's single <h1> (the brand, visually hidden) and the stage: 800px high (370 ≤ 768,
 * 260 ≤ 480), the slides covering it, the slogan block (emblem · regular line · bold line)
 * centred over them, the dots and the stop / start control near the bottom (HeroSlider). The emblem loads eagerly: it is
 * in the first viewport.
 */
export function HomeHero({ data }: { data: HomeHeroData }) {
  const { mark, line1, line2 } = data;
  const slogan =
    line1 || line2 ? (
      <div className="i3-hero__typo">
        {mark ? <img className="i3-hero__mark" src={mark.src} width={mark.width} height={mark.height} alt={mark.alt} decoding="async" /> : null}
        <p className="i3-hero__slogan">
          {line1 ? <span className="i3-hero__line">{line1}</span> : null}
          {line2 ? <span className="i3-hero__line i3-hero__line--strong">{line2}</span> : null}
        </p>
      </div>
    ) : null;
  return (
    <section className="i3-hero" data-section="home.hero">
      <h1 className="i3-sr">{data.brandName}</h1>
      <HeroSlider slides={data.slides} autoplay={data.autoplay} regionLabel={data.regionLabel} dotLabel={data.dotLabel} pauseLabel={data.pauseLabel} playLabel={data.playLabel}>
        {slogan}
      </HeroSlider>
    </section>
  );
}
