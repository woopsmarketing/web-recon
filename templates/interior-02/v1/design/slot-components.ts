import type { ReactElement } from "react";
import { SLOT_VARIANT_KEY } from "./contract";
import { Section as HeroPhoto } from "./variants/hero/photo";
import { Section as HeroStatement } from "./variants/hero/statement";
import { Section as HeroSplit } from "./variants/hero/split";
import { Section as ShowcasePanels } from "./variants/showcase/panels";
import { Section as ShowcaseIndex } from "./variants/showcase/index";
import { Section as ShowcaseCards } from "./variants/showcase/cards";
import { Section as DetailTypographic } from "./variants/detail/typographic";
import { Section as DetailGallery } from "./variants/detail/gallery";

/**
 * Slot components, by variant — the COMPONENT side of every section that is rendered through a
 * runtime slot (the data side is design/slots.ts). Browser code: this module is imported by the
 * client component components/runtime/RuntimeSlot and by nothing else, and it imports only the
 * `<variant>.tsx` component modules, never a `.data.ts`.
 *
 * Classic components are not listed: a slot whose data carries no variant is rendered by
 * RuntimeSlot's own map, exactly as before.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const SLOT_VARIANT_COMPONENTS: Record<string, Record<string, (props: { data: any }) => ReactElement>> = {
  "home.hero": { photo: HeroPhoto, statement: HeroStatement, split: HeroSplit },
  "home.projects": { panels: ShowcasePanels, index: ShowcaseIndex, cards: ShowcaseCards },
  "portfolio.detail": { typographic: DetailTypographic, gallery: DetailGallery },
};

/** The variant a slot's data names; undefined = classic. */
export function slotVariant(data: unknown): string | undefined {
  if (typeof data !== "object" || data === null) return undefined;
  const value = (data as Record<string, unknown>)[SLOT_VARIANT_KEY];
  return typeof value === "string" ? value : undefined;
}
