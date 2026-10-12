import { z } from "zod";
import type { SectionDeclarations } from "@platform/settings/settings";
import { DesignConfigSetting } from "../design/config";

/**
 * Design section (DESIGN area): the site's design document.
 *
 *   site.design.config   null = the classic site (the default), or a DesignConfig@1
 *                        (design/contract.ts): chrome variants, the ordered home recipe, the variant
 *                        of the two portfolio pages, the seven theme enums of tier 2 and a font set.
 *
 * It is a SETTING on purpose: a site's settings are part of its snapshot, so the document reaches
 * an ordinary build and — through `_runtime/portfolio/shell.json` — the runtime kit by the path
 * every other setting already takes; no new site file, no new loader. It has no slots: a design
 * document holds no copy.
 */
export const designSections = {
  "site.design": {
    schema: z.object({ config: DesignConfigSetting }).strict(),
    defaults: { config: null },
    slots: {},
  },
} satisfies SectionDeclarations;
