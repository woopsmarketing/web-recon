import { HeroCarousel, type HeroCarouselProps, type HeroSlide } from "../components/HeroCarousel";
import { contactHref } from "./links";
import { projectHref } from "./projectCards";
import type { Ctx } from "./types";

/** The content schema stores at most 8 slides; the hero shows every published one. */
const HERO_MAX_SLIDES = 8;

export type HomeHeroData = HeroCarouselProps;

/**
 * home.hero — PROVISIONAL banners collection → slides. Disabled or no published slide →
 * undefined (no wrapper at all). A slide's call to action names a target, never a URL:
 *   project → that project's detail page, only if it is served in this build
 *   contact → the site's contact destination, only if the site has one
 * otherwise the slide simply has no CTA.
 */
export function homeHero(ctx: Ctx): HomeHeroData | undefined {
  const settings = ctx.settings["home.hero"];
  if (!settings.enabled) return undefined;
  const { items } = ctx.content.list({ type: "banners", limit: HERO_MAX_SLIDES });
  if (items.length === 0) return undefined;
  const contact = contactHref(ctx);
  const detailRoute = ctx.routes.has("portfolio.detail");

  const slides: HeroSlide[] = items.map((b) => {
    let cta: HeroSlide["cta"];
    if (b.cta?.target.kind === "contact" && contact) {
      cta = { label: b.cta.label, href: contact, internal: false };
    } else if (b.cta?.target.kind === "project" && detailRoute) {
      const { items: hit } = ctx.content.list({ type: "projects", selection: { mode: "manual", ids: [b.cta.target.project] }, limit: 1 });
      if (hit[0]) cta = { label: b.cta.label, href: projectHref(hit[0]), internal: true };
    }
    return {
      id: b.id,
      // a slide image is decorative unless the site describes it; the headline carries the meaning
      image: { ...ctx.assets.resolve(b.image.asset), alt: b.image.alt ?? "" },
      headline: b.headline,
      text: b.text,
      cta,
    };
  });

  const text = (key: "label" | "previousLabel" | "nextLabel" | "pauseLabel" | "playLabel" | "slideLabelFormat") => ctx.slots.text("home.hero", key) ?? "";
  return {
    slides,
    autoplay: settings.autoplay,
    labels: {
      region: text("label"),
      previous: text("previousLabel"),
      next: text("nextLabel"),
      pause: text("pauseLabel"),
      play: text("playLabel"),
      slideFormat: text("slideLabelFormat"),
    },
  };
}

export function HomeHero({ data }: { data: HomeHeroData }) {
  return <HeroCarousel {...data} />;
}
