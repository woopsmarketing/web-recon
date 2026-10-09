"use client";

import type { ReactElement } from "react";
import { SlotScope } from "./context";
import { PORTFOLIO_SLOT_ATTRIBUTE, PORTFOLIO_SLOT_DATA_ID } from "../../runtime/shell";
import { HomeHero } from "../../sections/HomeHero";
import { HomeIntro } from "../../sections/HomeIntro";
import { HomeProjects } from "../../sections/HomeProjects";
import { PortfolioIndex } from "../../sections/PortfolioIndex";
import { PortfolioDetail } from "../../sections/PortfolioDetail";

/**
 * Runtime slot (1.7.0; client) — the ONE component every portfolio-dependent section is rendered
 * through. A slot is named after the section it holds.
 *
 *   <RuntimeSlot slot="home.projects-a" data={data} />      an ordinary build: exactly the section
 *   <RuntimeSlot slot="home.projects-a" shell />             a SHELL build (runtime/shell.ts):
 *       at build time   an empty placeholder (<SlotPlaceholder>), which the runtime kit replaces
 *                       with the section it renders from the published data
 *       in the browser  the section, from the data the composed page carries inline
 *                       (<script type="application/json" id="recon-portfolio-slots">); no entry for
 *                       the slot = the section is omitted; no script at all = the raw shell page,
 *                       which keeps its placeholder
 *
 * Which sections are slots (everything whose output reads projects or categories):
 *   home.hero          a slide's call to action may name a project — kept only while it is served
 *   home.intro         its link is kept only when its destination exists: a page under /portfolio,
 *                      or the anchor of a project showcase that is actually rendered
 *   home.projects-a/b  the two showcases (one component, two selections)
 *   portfolio.index    the list, its pager and the filter island's index
 *   portfolio.detail   one project
 * home.reviews and home.image-band read no project and stay shell markup.
 *
 * <SlotElement> is what a composed page shows for a slot — the runtime kit renders the same element,
 * so the markup it writes is the markup the browser hydrates. A slot's data is plain JSON.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const SLOT_COMPONENTS: Record<string, (props: { data: any }) => ReactElement> = {
  "home.hero": HomeHero,
  "home.intro": HomeIntro,
  "home.projects-a": HomeProjects,
  "home.projects-b": HomeProjects,
  "portfolio.index": PortfolioIndex,
  "portfolio.detail": PortfolioDetail,
};

export const SLOT_NAMES: readonly string[] = Object.keys(SLOT_COMPONENTS);

function Section({ slot, data }: { slot: string; data: unknown }) {
  const Component = SLOT_COMPONENTS[slot];
  if (!Component) throw new Error(`unknown runtime slot "${slot}"`);
  return <Component data={data} />;
}

/** A slot of a composed page: the section, scoped so its client components use fixed ids. */
export function SlotElement({ slot, data }: { slot: string; data: unknown }) {
  return (
    <SlotScope slot={slot}>
      <Section slot={slot} data={data} />
    </SlotScope>
  );
}

/** What a shell build emits where a slot goes. */
export function SlotPlaceholder({ slot }: { slot: string }) {
  return <div {...{ [PORTFOLIO_SLOT_ATTRIBUTE]: slot }} hidden />;
}

let inline: Record<string, unknown> | null | undefined;
/** The slot data of this document: null when the page carries none (a raw shell page). */
function inlineSlotData(): Record<string, unknown> | null {
  if (inline === undefined) {
    const text = document.getElementById(PORTFOLIO_SLOT_DATA_ID)?.textContent;
    inline = text ? (JSON.parse(text) as Record<string, unknown>) : null;
  }
  return inline;
}

export function RuntimeSlot({ slot, data, shell = false }: { slot: string; data?: unknown; shell?: boolean }) {
  if (!shell) return <Section slot={slot} data={data} />;
  if (typeof document === "undefined") return <SlotPlaceholder slot={slot} />;
  const all = inlineSlotData();
  if (all === null) return <SlotPlaceholder slot={slot} />;
  return all[slot] === undefined ? null : <SlotElement slot={slot} data={all[slot]} />;
}
