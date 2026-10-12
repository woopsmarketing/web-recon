import type { ReactElement } from "react";
import { Slot } from "../runtime/Slot";
import type { Ctx } from "../sections/types";
import { aboutClassic, brandsClassic, ctaClassic, promosClassic, servicesClassic, showroomsClassic, type HomeSection } from "./classic";
import { registry } from "./registry";
import { designOf } from "./resolve";
import * as aboutSplitPanel from "./variants/about/split-panel";
import * as aboutManifesto from "./variants/about/manifesto";
import * as aboutStatementPhoto from "./variants/about/statement-photo";
import * as servicesRows from "./variants/services/rows";
import * as servicesNumbered from "./variants/services/numbered";
import * as ctaQuiet from "./variants/cta/quiet";
import * as ctaBand from "./variants/cta/band";

/**
 * The home recipe → the sections of the home page, in the recipe's order.
 *
 * A section of the registry is rendered one of two ways:
 *   through its runtime slot   (hero · showcase · keywords · recent — they read the portfolio): the
 *                              page places <Slot>; the variant travels inside the slot's data
 *                              (design/slots.ts), so a shell build and the runtime kit show the
 *                              same variant as an ordinary build;
 *   by the page itself         (every other section): the variant's data(ctx) is resolved here and
 *                              the section is left out entirely when it returns nothing.
 *
 * HOME_SECTIONS is the component map of the second kind — every (section, variant) of the registry
 * that has no slot, classic included. platform/test/design.test.ts holds it to the registry.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const HOME_SECTIONS: Record<string, Record<string, HomeSection<any>>> = {
  promos: { classic: promosClassic },
  about: { classic: aboutClassic, "split-panel": aboutSplitPanel, manifesto: aboutManifesto, "statement-photo": aboutStatementPhoto },
  services: { classic: servicesClassic, rows: servicesRows, numbered: servicesNumbered },
  brands: { classic: brandsClassic },
  showrooms: { classic: showroomsClassic },
  cta: { classic: ctaClassic, quiet: ctaQuiet, band: ctaBand },
};

export function HomeSections({ ctx, slots, shell }: { ctx: Ctx; slots: Record<string, unknown>; shell: boolean }) {
  const out: ReactElement[] = [];
  for (const { section, variant } of designOf(ctx).home) {
    const slot = registry.sections[section]!.slot;
    if (slot !== null) {
      out.push(<Slot key={section} name={slot} slots={slots} shell={shell} />);
      continue;
    }
    const entry = HOME_SECTIONS[section]![variant]!;
    const data: unknown = entry.data(ctx);
    if (data !== undefined) out.push(<entry.Section key={section} data={data} />);
  }
  return <>{out}</>;
}
