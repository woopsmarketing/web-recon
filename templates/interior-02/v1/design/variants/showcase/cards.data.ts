import type { Ctx } from "../../../sections/types";
import { showcaseData } from "./items.data";
import type { ShowcaseData } from "./model";

/** showcase.cards — the home selection as the classic section reads it (items.data.ts); nothing when it is empty. */
export function data(ctx: Ctx): ShowcaseData | undefined {
  return showcaseData(ctx);
}
