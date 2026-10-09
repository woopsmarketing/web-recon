import type { Ctx } from "../sections/types";

/**
 * Media slots (SHELL shared block).
 *   slotMedia(ctx, section, key) → { src, width, height, alt } of a media slot, or undefined when the site set none
 *   assetMedia(ctx, ref)         → the same for a content media reference ({ asset, alt? })
 * Images are always site assets; the template owns no picture.
 */
export interface Media {
  src: string;
  width: number;
  height: number;
  alt: string;
}

export function slotMedia(ctx: Ctx, section: Parameters<Ctx["slots"]["media"]>[0], key: string): Media | undefined {
  const m = ctx.slots.media(section, key);
  return m ? { ...ctx.assets.resolve(m.asset), alt: m.alt ?? "" } : undefined;
}

export function assetMedia(ctx: Ctx, ref: { asset: string; alt?: string }): Media {
  return { ...ctx.assets.resolve(ref.asset), alt: ref.alt ?? "" };
}
