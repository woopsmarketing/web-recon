"use client";

import type { ReactElement } from "react";
import { SlotScope } from "./context";
import { PORTFOLIO_SLOT_ATTRIBUTE, PORTFOLIO_SLOT_DATA_ID } from "../../runtime/shell";
import { HomeHero } from "../../sections/HomeHero";
import { HomeProjects } from "../../sections/HomeProjects";
import { HomeKeywords } from "../../sections/HomeKeywords";
import { HomeRecent } from "../../sections/HomeRecent";
import { PortfolioIndex } from "../../sections/PortfolioIndex";
import { PortfolioDetail } from "../../sections/PortfolioDetail";
import { SLOT_VARIANT_COMPONENTS, slotVariant } from "../../design/slot-components";

/**
 * Runtime slot (client) — the ONE component every portfolio-dependent section is rendered through.
 *
 *   <RuntimeSlot slot="home.projects" data={data} />        an ordinary build: exactly the section
 *   <RuntimeSlot slot="home.projects" shell />               a SHELL build (runtime/shell.ts):
 *       at build time   an empty placeholder (<SlotPlaceholder>), which the runtime kit replaces
 *                       with the section it renders from the published data
 *       in the browser  the section, from the data the composed page carries inline
 *                       (<script type="application/json" id="recon-portfolio-slots">); no entry for
 *                       the slot = the section is omitted; no script at all = the raw shell page,
 *                       which keeps its placeholder
 *
 * <SlotElement> is what a composed page shows for a slot — the runtime kit renders the same element,
 * so the markup it writes is the markup the browser hydrates. A slot's data is plain JSON.
 *
 * Design variants: a slot's data may name a variant of its section (design/slots.ts writes it,
 * design/slot-components.ts maps it). The variant travels IN the data, so an ordinary build, a
 * composed page and the browser pick the same component. Data that names none is the classic
 * section below — the only case on a site without a design document.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const SLOT_COMPONENTS: Record<string, (props: { data: any }) => ReactElement> = {
  "home.hero": HomeHero,
  "home.projects": HomeProjects,
  "home.keywords": HomeKeywords,
  "home.recent": HomeRecent,
  "portfolio.index": PortfolioIndex,
  "portfolio.detail": PortfolioDetail,
};

export const SLOT_NAMES: readonly string[] = Object.keys(SLOT_COMPONENTS);

function Section({ slot, data }: { slot: string; data: unknown }) {
  if (!Object.hasOwn(SLOT_COMPONENTS, slot)) throw new Error(`unknown runtime slot "${slot}"`);
  const variant = slotVariant(data);
  const variants = SLOT_VARIANT_COMPONENTS[slot] ?? {};
  if (variant !== undefined && !Object.hasOwn(variants, variant)) throw new Error(`runtime slot "${slot}" has no variant "${variant}"`);
  const Component = variant === undefined ? SLOT_COMPONENTS[slot]! : variants[variant]!;
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
