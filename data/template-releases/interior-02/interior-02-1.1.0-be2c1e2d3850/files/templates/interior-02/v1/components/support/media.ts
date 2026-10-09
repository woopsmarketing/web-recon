import type { Ctx } from "../../sections/types";

export interface SlotImage {
  src: string;
  width: number;
  height: number;
  alt: string;
}

/** A media slot resolved to what an <img> needs; unset → undefined. */
export function slotImage(ctx: Ctx, section: string, key: string): SlotImage | undefined {
  const m = ctx.slots.media(section, key);
  if (!m) return undefined;
  const r = ctx.assets.resolve(m.asset);
  return { src: r.src, width: r.width, height: r.height, alt: m.alt ?? "" };
}
