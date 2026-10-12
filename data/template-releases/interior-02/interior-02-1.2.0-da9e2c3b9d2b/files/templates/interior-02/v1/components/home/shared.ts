import type { CarouselLabels } from "../ui/Carousel";
import type { Ctx } from "../../sections/types";
import { contactHref } from "../../lib/links";
import { hasRoute } from "../../lib/routes";

/** The slider control names of a section that declares the shared `sliderLabels` slots. */
export function sliderLabels(ctx: Ctx, section: "home.hero" | "home.keywords"): CarouselLabels & { slideLabelFormat: string } {
  const t = (key: string) => ctx.slots.text(section, key) ?? "";
  return { previous: t("previousLabel"), next: t("nextLabel"), pause: t("pauseLabel"), play: t("playLabel"), slideLabelFormat: t("slideLabelFormat") };
}

/** The portfolio list's first page, when this build generates it. */
export function portfolioHref(ctx: Ctx): string | undefined {
  return hasRoute(ctx, "portfolio.index") ? "/portfolio" : undefined;
}

/** The service page, when this build generates it. */
export function serviceHref(ctx: Ctx): string | undefined {
  return hasRoute(ctx, "service") ? "/service" : undefined;
}

export { contactHref };

/** A resolved media slot: the asset's served URL and size plus the site's alt text. */
export function mediaOf(ctx: Ctx, section: string, key: string): { src: string; width: number; height: number; alt: string } | undefined {
  const m = ctx.slots.media(section, key);
  return m ? { ...ctx.assets.resolve(m.asset), alt: m.alt } : undefined;
}
