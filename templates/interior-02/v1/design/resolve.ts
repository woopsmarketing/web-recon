import type { Ctx } from "../sections/types";
import type { DesignConfig } from "./contract";
import { CLASSIC_DESIGN } from "./registry";

/** The design document a site is rendered from: its own, or the classic one when it has none. */
export function designOf(ctx: Ctx): DesignConfig {
  return ctx.settings["site.design"].config ?? CLASSIC_DESIGN;
}

/** true = the site chose nothing: the classic site, with nothing of the design system emitted for it. */
export function isClassicSite(ctx: Ctx): boolean {
  return ctx.settings["site.design"].config === null;
}

/**
 * The value of <html data-design>: "classic" for a site without a design document, the preset id
 * for a site composed from a preset, "custom" for a document that names no preset.
 */
export function designId(ctx: Ctx): string {
  const config = ctx.settings["site.design"].config;
  return config === null ? "classic" : (config.preset?.id ?? "custom");
}

/** The id of <main> on a site with a design document — the target a header variant's skip link points at (`#main`). */
export const MAIN_ID = "main";

/**
 * The `id` of a page's <main>: MAIN_ID on a site WITH a design document, undefined (no attribute at
 * all) on the classic site, whose markup stays byte for byte what release 1.1 renders. Every page of
 * app/** passes it as the LAST attribute of <main>, so the classic attributes keep their order.
 */
export function mainId(ctx: Ctx): string | undefined {
  return isClassicSite(ctx) ? undefined : MAIN_ID;
}

/** The variant the home recipe names for a section; undefined = the section is not on the home page. */
export function homeVariant(design: DesignConfig, section: string): string | undefined {
  return design.home.find((entry) => entry.section === section)?.variant;
}
