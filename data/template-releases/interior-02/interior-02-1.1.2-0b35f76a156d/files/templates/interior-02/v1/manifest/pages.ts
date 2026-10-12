import { z } from "zod";
import type { SectionDeclarations } from "@platform/settings/settings";

/**
 * Page sections (PAGES area): the SERVICE page and the ABOUT page.
 *   service.page  title band · three tier tiles · "at a glance" rows + diagram · wide photo band ·
 *                 three principle cards · the team row + contact button
 *   about.page    title block · photo band with the rising intro · statistics (count-up) · four
 *                 value cards · the history timeline slider · the "system" block (check list + image)
 * Every user-visible string is a slot: control labels carry a neutral English default; the site's
 * own words (tier names, prices, statistics, history, copy) have none and hide what they describe
 * when unset. A block with no item renders nothing.
 *
 * Numbered slots stand in for lists (the platform has no list slots):
 *   service.page  tier{1..3}Title / Sub / Prefix / Figure / Unit / Tag / Link / SpecTitle / SpecText
 *                 + tier{n}Row{1..5}Label / Value — a tile exists when its title is set, a row when its label is;
 *                 glance{1..3}Title / Text (the row's name column reuses tier{n}Title / Sub);
 *                 card{1..3}Media / Title / Text; team{1..5}Title / Text (+ the team{n}Icon settings)
 *   about.page    stat{1..6}Figure / Unit / Label / Note — an item exists when its figure is set;
 *                 value{1..4}Title / Text (+ value{n}Tone / value{n}Icon settings);
 *                 year{1..8}Label / Items (Items = one paragraph per bullet); systemItem{1..6}
 */

const text = (maxLength: number, neutralDefault?: string) =>
  neutralDefault === undefined ? ({ type: "text", maxLength } as const) : ({ type: "text", maxLength, neutralDefault } as const);
const richText = (maxParagraphs: number, maxParagraphLength: number) => ({ type: "richText", maxParagraphs, maxParagraphLength }) as const;
const link = { type: "link" } as const;
const media = { type: "media" } as const;

type Decl = ReturnType<typeof text> | ReturnType<typeof richText> | typeof link | typeof media;

export const TIER_NUMBERS = [1, 2, 3] as const;
export const TIER_ROW_NUMBERS = [1, 2, 3, 4, 5] as const;
export const CARD_NUMBERS = [1, 2, 3] as const;
export const TEAM_NUMBERS = [1, 2, 3, 4, 5] as const;
export const STAT_NUMBERS = [1, 2, 3, 4, 5, 6] as const;
export const VALUE_NUMBERS = [1, 2, 3, 4] as const;
export const YEAR_NUMBERS = [1, 2, 3, 4, 5, 6, 7, 8] as const;
export const SYSTEM_ITEM_NUMBERS = [1, 2, 3, 4, 5, 6] as const;

/** Line pictograms the team row can show (drawn in components/pages/PageIcons.tsx). */
export const TEAM_ICONS = ["people", "tools", "pen", "headset", "monitor", "clipboard", "home", "cube"] as const;
export type TeamIcon = (typeof TEAM_ICONS)[number];
/** Line illustrations of the value cards (drawn in components/pages/PageIcons.tsx). */
export const VALUE_ICONS = ["lines", "rays", "rings", "dots", "grid", "waves"] as const;
export type ValueIcon = (typeof VALUE_ICONS)[number];
/** Value-card backgrounds: the three accents and, as the fourth shade, the primary text colour (no fifth token exists). */
export const VALUE_TONES = ["navy", "mint", "yellow", "dark"] as const;
export type ValueTone = (typeof VALUE_TONES)[number];

/** The slider's control names (the history timeline). */
const sliderLabels = {
  previousLabel: text(24, "Previous slide"),
  nextLabel: text(24, "Next slide"),
  pauseLabel: text(24, "Pause slideshow"),
  playLabel: text(24, "Play slideshow"),
  /** "{n}" = slide number, "{total}" = number of slides. */
  slideLabelFormat: text(40, "Slide {n} of {total}"),
};

function tierSlots(): Record<string, Decl> {
  const out: Record<string, Decl> = {};
  for (const n of TIER_NUMBERS) {
    out[`tier${n}Title`] = text(24);
    out[`tier${n}Sub`] = text(24);
    out[`tier${n}Prefix`] = text(8);
    out[`tier${n}Figure`] = text(24);
    out[`tier${n}Unit`] = text(12);
    out[`tier${n}Tag`] = text(16);
    /** The tile's destination; its label is the bottom button's text. */
    out[`tier${n}Link`] = link;
    out[`tier${n}SpecTitle`] = text(60);
    out[`tier${n}SpecText`] = text(240);
    for (const r of TIER_ROW_NUMBERS) {
      out[`tier${n}Row${r}Label`] = text(16);
      out[`tier${n}Row${r}Value`] = text(60);
    }
    out[`glance${n}Title`] = text(80);
    out[`glance${n}Text`] = text(240);
  }
  return out;
}

function cardSlots(): Record<string, Decl> {
  const out: Record<string, Decl> = {};
  for (const n of CARD_NUMBERS) {
    out[`card${n}Media`] = media;
    out[`card${n}Title`] = text(60);
    out[`card${n}Text`] = text(240);
  }
  return out;
}

function teamSlots(): Record<string, Decl> {
  const out: Record<string, Decl> = {};
  for (const n of TEAM_NUMBERS) {
    out[`team${n}Title`] = text(24);
    out[`team${n}Text`] = text(160);
  }
  return out;
}

function statSlots(): Record<string, Decl> {
  const out: Record<string, Decl> = {};
  for (const n of STAT_NUMBERS) {
    out[`stat${n}Figure`] = text(16);
    out[`stat${n}Unit`] = text(8);
    out[`stat${n}Label`] = text(24);
    out[`stat${n}Note`] = text(80);
  }
  return out;
}

function valueSlots(): Record<string, Decl> {
  const out: Record<string, Decl> = {};
  for (const n of VALUE_NUMBERS) {
    out[`value${n}Title`] = text(24);
    out[`value${n}Text`] = text(160);
  }
  return out;
}

function yearSlots(): Record<string, Decl> {
  const out: Record<string, Decl> = {};
  for (const n of YEAR_NUMBERS) {
    out[`year${n}Label`] = text(12);
    out[`year${n}Items`] = richText(6, 60);
  }
  return out;
}

function systemItemSlots(): Record<string, Decl> {
  const out: Record<string, Decl> = {};
  for (const n of SYSTEM_ITEM_NUMBERS) out[`systemItem${n}`] = text(80);
  return out;
}

const teamIconSchema = z.enum(TEAM_ICONS);
const valueIconSchema = z.enum(VALUE_ICONS);
const valueToneSchema = z.enum(VALUE_TONES);

export const pagesSections = {
  /** SERVICE: the page opens with its own light band (no top padding), tiles yellow / mint / navy in slot order. */
  "service.page": {
    schema: z
      .object({
        team1Icon: teamIconSchema,
        team2Icon: teamIconSchema,
        team3Icon: teamIconSchema,
        team4Icon: teamIconSchema,
        team5Icon: teamIconSchema,
      })
      .strict(),
    defaults: { team1Icon: "people", team2Icon: "tools", team3Icon: "pen", team4Icon: "headset", team5Icon: "monitor" },
    slots: {
      title: text(40, "Service"),
      /** The lines under the title (one paragraph = one line). */
      intro: richText(3, 120),
      ...tierSlots(),
      glanceTitle: text(80),
      /** The diagram beside the "at a glance" rows. */
      glanceMedia: media,
      /** The full-bleed photo band and its heading (one paragraph = one line). */
      bandMedia: media,
      bandTitle: richText(3, 60),
      cardsTitle: text(80),
      ...cardSlots(),
      teamTitle: text(80),
      teamText: richText(3, 200),
      ...teamSlots(),
      /** The mint button under the team row; destination = the contact route. */
      teamButtonLabel: text(32, "Contact us"),
    },
  },
  /** ABOUT: title block, photo + rising intro, statistics, value cards, timeline slider, system block. */
  "about.page": {
    schema: z
      .object({
        historyAutoplay: z.boolean(),
        value1Tone: valueToneSchema,
        value2Tone: valueToneSchema,
        value3Tone: valueToneSchema,
        value4Tone: valueToneSchema,
        value1Icon: valueIconSchema,
        value2Icon: valueIconSchema,
        value3Icon: valueIconSchema,
        value4Icon: valueIconSchema,
      })
      .strict(),
    defaults: {
      historyAutoplay: true,
      value1Tone: "navy",
      value2Tone: "mint",
      value3Tone: "yellow",
      value4Tone: "dark",
      value1Icon: "lines",
      value2Icon: "rays",
      value3Icon: "rings",
      value4Icon: "dots",
    },
    slots: {
      title: text(40, "About"),
      intro: richText(3, 120),
      photoMedia: media,
      introTitle: text(80),
      introBody: richText(6, 300),
      statsTitle: text(80),
      ...statSlots(),
      valuesTitle: text(80),
      ...valueSlots(),
      historyTitle: text(80),
      ...yearSlots(),
      systemTitle: text(100),
      systemBody: richText(3, 300),
      ...systemItemSlots(),
      /** The oversized screenshot that runs out of the right edge. */
      systemMedia: media,
      ...sliderLabels,
    },
  },
} satisfies SectionDeclarations;
