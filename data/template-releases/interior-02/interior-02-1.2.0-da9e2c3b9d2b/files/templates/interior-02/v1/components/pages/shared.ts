import type { Ctx } from "../../sections/types";

/** A resolved media slot: the asset's served URL and size plus the site's alt text. */
export interface Media {
  src: string;
  width: number;
  height: number;
  alt: string;
}

export function mediaOf(ctx: Ctx, section: string, key: string): Media | undefined {
  const m = ctx.slots.media(section, key);
  return m ? { ...ctx.assets.resolve(m.asset), alt: m.alt } : undefined;
}

/** The paragraphs of a richText slot, or undefined when the slot is unset or empty. */
export function paragraphsOf(ctx: Ctx, section: string, key: string): string[] | undefined {
  const rich = ctx.slots.richText(section, key);
  return rich && rich.paragraphs.length > 0 ? rich.paragraphs : undefined;
}
