import { z } from "zod";
import type { SectionDeclarations } from "@platform/settings/settings";

/**
 * Page sections (PAGES area): the ABOUT page and the SERVICE page. Both sit in the shared
 * sub-page frame (banner · page title · content block) and have no tab strip.
 *   about.page    the greeting: a headline, a short intro and the ornamental quote beside it, the
 *                 wide picture (with an optional narrow variant), the indented body copy, the signature
 *   service.page  three business blocks: A = three picture cards, B = the split block (picture
 *                 left, headline + copy right), C = three bordered cards with an accent button
 * Neither section has settings. Every user-visible string is a slot: the page titles carry a
 * neutral English default; business copy has none and its element is omitted when the site sets
 * no value. A block with nothing to show renders nothing; a page with nothing set still renders
 * the banner and its title.
 *
 * Numbered slots stand in for lists (the platform has no list slots):
 *   service.page  space{1..3}Media / Title / Text   — a picture card exists when its title is set
 *                 card{1..3}Media / Title / Text / Link — a bordered card exists when its title is
 *                 set; the link slot is the button (label + destination), kept through liveLink
 */

const text = (maxLength: number, neutralDefault?: string) =>
  neutralDefault === undefined ? ({ type: "text", maxLength } as const) : ({ type: "text", maxLength, neutralDefault } as const);
const richText = (maxParagraphs: number, maxParagraphLength: number) => ({ type: "richText", maxParagraphs, maxParagraphLength }) as const;
const link = { type: "link" } as const;
const media = { type: "media" } as const;

type Decl = ReturnType<typeof text> | ReturnType<typeof richText> | typeof link | typeof media;

export const SPACE_NUMBERS = [1, 2, 3] as const;
export const CARD_NUMBERS = [1, 2, 3] as const;

/** The banner + page title slots every sub-page of this area shares. */
function frameSlots(defaultTitle: string): Record<string, Decl> {
  return {
    title: text(40, defaultTitle),
    /** One line under the page title (hidden ≤ 980 by the shared frame). */
    lead: text(80),
    /** The banner photo and its small line. */
    visualMedia: media,
    visualText: text(80),
  };
}

function spaceSlots(): Record<string, Decl> {
  const out: Record<string, Decl> = {};
  for (const n of SPACE_NUMBERS) {
    out[`space${n}Media`] = media;
    out[`space${n}Title`] = text(40);
    out[`space${n}Text`] = text(240);
  }
  return out;
}

function cardSlots(): Record<string, Decl> {
  const out: Record<string, Decl> = {};
  for (const n of CARD_NUMBERS) {
    out[`card${n}Media`] = media;
    out[`card${n}Title`] = text(40);
    out[`card${n}Text`] = text(240);
    out[`card${n}Link`] = link;
  }
  return out;
}

export const pagesSections = {
  /** ABOUT: greeting block (headline · intro · quote) → wide picture → indented body → signature. */
  "about.page": {
    schema: z.object({}).strict(),
    defaults: {},
    slots: {
      ...frameSlots("About"),
      /** The 21px lead line of the greeting. */
      headline: text(60),
      /** The short paragraph under it. */
      intro: richText(3, 300),
      /** The large ornamental line beside the greeting (heading font, wide letter-spacing; hidden ≤ 768). */
      quote: text(40),
      /** The wide picture; the narrow variant (optional) replaces it ≤ 480. */
      wideMedia: media,
      wideMediaNarrow: media,
      /** The main copy, indented from the left on wide screens. */
      body: richText(6, 600),
      /** The right-aligned signature: a small bold role line over the name. */
      signRole: text(40),
      signName: text(40),
    },
  },
  /** SERVICE: block A (picture cards) → block B (split) → block C (bordered cards with a button). */
  "service.page": {
    schema: z.object({}).strict(),
    defaults: {},
    slots: {
      ...frameSlots("Service"),
      spacesTitle: text(40),
      ...spaceSlots(),
      splitTitle: text(40),
      splitMedia: media,
      /** The 19px line over the split copy. */
      splitHeadline: text(80),
      splitBody: richText(4, 400),
      cardsTitle: text(40),
      ...cardSlots(),
    },
  },
} satisfies SectionDeclarations;
