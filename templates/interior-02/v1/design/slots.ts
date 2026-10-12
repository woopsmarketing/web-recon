import { homeHero } from "../sections/HomeHero";
import { homeKeywords } from "../sections/HomeKeywords";
import { homeProjects } from "../sections/homeProjectsData";
import { homeRecent } from "../sections/homeRecentData";
import { portfolioDetail } from "../sections/PortfolioDetail";
import { portfolioIndex } from "../sections/portfolioIndexData";
import type { Ctx, ProjectItem } from "../sections/types";
import { SLOT_VARIANT_KEY } from "./contract";
import { registry } from "./registry";
import { designOf } from "./resolve";
import { data as heroPhoto } from "./variants/hero/photo.data";
import { data as heroStatement } from "./variants/hero/statement.data";
import { data as heroSplit } from "./variants/hero/split.data";
import { data as showcasePanels } from "./variants/showcase/panels.data";
import { data as showcaseIndex } from "./variants/showcase/index.data";
import { data as showcaseCards } from "./variants/showcase/cards.data";
import { data as detailTypographic } from "./variants/detail/typographic.data";
import { data as detailGallery } from "./variants/detail/gallery.data";

/**
 * Slot data, by variant — the DATA side of every section that is rendered through a runtime slot.
 *
 * runtime/portfolio.ts (the one description of every portfolio-dependent page) asks this module
 * what each slot of a page gets. The answer is the variant's own data function over the site
 * context; for a variant other than classic the result carries the variant id under
 * SLOT_VARIANT_KEY, which is how components/runtime/RuntimeSlot picks the component
 * (design/slot-components.ts). The data of a classic section is exactly what it was.
 *
 * Because an ordinary build and the runtime kit both go through runtime/portfolio.ts, the variant
 * a kit-composed page shows is the variant the build shows — nothing else decides it.
 *
 * A slot data function is pure, reads only the site context and returns plain JSON (or undefined:
 * the section is omitted). It lives in <variant>.data.ts, apart from the component, because the
 * component is browser code.
 */
type SlotData = (ctx: Ctx) => object | undefined;

/** home section → variant → data function, for every home section of the registry that has a slot */
export const HOME_SLOT_DATA: Record<string, Record<string, SlotData>> = {
  hero: { classic: homeHero, photo: heroPhoto, statement: heroStatement, split: heroSplit },
  showcase: { classic: homeProjects, panels: showcasePanels, index: showcaseIndex, cards: showcaseCards },
  keywords: { classic: homeKeywords },
  recent: { classic: homeRecent },
};

export const DETAIL_SLOT_DATA: Record<string, (ctx: Ctx, project: ProjectItem) => object | undefined> = {
  classic: portfolioDetail,
  typographic: detailTypographic,
  gallery: detailGallery,
};

export const LISTING_SLOT_DATA: Record<string, (ctx: Ctx, page: number, options?: { emptyFirstPage?: boolean }) => object | undefined> = {
  classic: portfolioIndex,
};

function tagged(variant: string, data: object | undefined): object | undefined {
  return data === undefined || variant === "classic" ? data : { ...data, [SLOT_VARIANT_KEY]: variant };
}

/** The slots of the home page: one entry per recipe section that has a slot, in the recipe's order. */
export function homeSlots(ctx: Ctx): Record<string, unknown> {
  const slots: Record<string, unknown> = {};
  for (const { section, variant } of designOf(ctx).home) {
    const slot = registry.sections[section]!.slot;
    if (slot !== null) slots[slot] = tagged(variant, HOME_SLOT_DATA[section]![variant]!(ctx));
  }
  return slots;
}

export function listingSlot(ctx: Ctx, page: number, options: { emptyFirstPage?: boolean } = {}): object | undefined {
  const variant = designOf(ctx).pages.listing;
  return tagged(variant, LISTING_SLOT_DATA[variant]!(ctx, page, options));
}

export function detailSlot(ctx: Ctx, project: ProjectItem): object | undefined {
  const variant = designOf(ctx).pages.detail;
  return tagged(variant, DETAIL_SLOT_DATA[variant]!(ctx, project));
}
