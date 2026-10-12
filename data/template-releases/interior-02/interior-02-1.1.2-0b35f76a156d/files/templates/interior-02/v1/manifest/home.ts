import { z } from "zod";
import { ProjectSelectionSchema, type SectionDeclarations } from "@platform/settings/settings";
import { AREA_SCALE_IDS, PRICE_SCALE_IDS } from "@platform/content/project-filter";

/**
 * Home sections (HOME area), in page order after the header:
 *   home.hero · home.projects · home.promos · home.keywords · home.service · home.recent ·
 *   home.brands · home.showrooms
 * Every user-visible string is a slot (control labels carry a neutral English default; the
 * site's own words — titles, tiles, copy — have none and hide what they describe when unset).
 * A section whose data is empty renders nothing.
 *
 * Numbered slots stand in for lists (the platform has no list slots):
 *   promos      tile{1,2}Label / Title / Text / Media / Link
 *   keywords    chip{1..6}Label (+ the chip{1..6} filter settings)
 *   service     tier{1..3}Title / Sub / Note / Prefix / Figure / Unit / Tag
 *   brands      brand{1..3}Title / Text / Link
 *   showrooms   room{1..4}Media / Name / Link / Label1 / Value1 / Label2 / Value2
 */

const text = (maxLength: number, neutralDefault?: string) =>
  neutralDefault === undefined ? ({ type: "text", maxLength } as const) : ({ type: "text", maxLength, neutralDefault } as const);
const richText = (maxParagraphs: number, maxParagraphLength: number) => ({ type: "richText", maxParagraphs, maxParagraphLength }) as const;
const link = { type: "link" } as const;
const media = { type: "media" } as const;

/** The slider's control names (one set per section that owns a slider). */
const sliderLabels = {
  previousLabel: text(24, "Previous slide"),
  nextLabel: text(24, "Next slide"),
  pauseLabel: text(24, "Pause slideshow"),
  playLabel: text(24, "Play slideshow"),
  /** "{n}" = slide number, "{total}" = number of slides. */
  slideLabelFormat: text(40, "Slide {n} of {total}"),
};

/** A projects selection run by the platform at preflight (`selection` + `limit`). */
const projectsSchema = z
  .object({
    enabled: z.boolean(),
    limit: z.number().int().min(1).max(24),
    selection: ProjectSelectionSchema,
  })
  .strict();

/**
 * One keyword chip = a ProjectFilter in the platform's own vocabulary (@platform/content/project-filter):
 * category ids, area / price bucket ids of the section's scales, style words, a keyword. Values the
 * site's vocabulary does not offer are dropped; a chip that matches no project is not shown.
 */
const ChipFilterSchema = z
  .object({
    keyword: z.string().trim().max(80).optional(),
    type: z.array(z.string().min(1)).max(8).optional(),
    area: z.array(z.string().min(1)).max(8).optional(),
    style: z.array(z.string().min(1)).max(8).optional(),
    price: z.array(z.string().min(1)).max(8).optional(),
  })
  .strict();

const toneSchema = z.enum(["dark", "light"]);

export const homeSections = {
  /** Full-bleed slider over the banners collection (max 8); slides are content, never slots. */
  "home.hero": {
    schema: z.object({ enabled: z.boolean(), autoplay: z.boolean() }).strict(),
    defaults: { enabled: true, autoplay: true },
    slots: {
      label: text(40, "Highlights"),
      ...sliderLabels,
    },
  },
  /** Project grid (3 / 2 / 1 columns; the first 6 at ≤ 640) over a declared selection. */
  "home.projects": {
    schema: projectsSchema,
    defaults: { enabled: true, limit: 12, selection: { mode: "latest" } },
    slots: {
      title: text(60, "Projects"),
      /** The heading arrow's name and the button text; destination = the portfolio route. */
      moreLabel: text(32, "View all projects"),
      /** Shown in place of a total price the project does not state. */
      withheldText: text(60, "Price withheld"),
      /** Suffix after the built year on a card ("준공"); omitted when unset. */
      builtLabel: text(12),
    },
  },
  /** Two promo tiles (side by side; stacked ≤ 1024). A tile renders when it has a title. */
  "home.promos": {
    schema: z.object({ tile1Tone: toneSchema, tile2Tone: toneSchema }).strict(),
    defaults: { tile1Tone: "dark", tile2Tone: "dark" },
    slots: {
      tile1Label: text(24),
      tile1Title: text(80),
      tile1Text: text(120),
      tile1Media: media,
      tile1Link: link,
      tile2Label: text(24),
      tile2Title: text(80),
      tile2Text: text(120),
      tile2Media: media,
      tile2Link: link,
    },
  },
  /**
   * Keyword chips (radio) over the projects: each chip declares a label (slot) and a filter
   * (setting); choosing one swaps the slider's cards in place. `limit` caps the cards per chip.
   * The scales decide how area / price bucket ids are read, like portfolio.index.
   */
  "home.keywords": {
    schema: z
      .object({
        enabled: z.boolean(),
        limit: z.number().int().min(1).max(24),
        areaScale: z.enum(AREA_SCALE_IDS),
        priceScale: z.enum(["none", ...PRICE_SCALE_IDS]),
        chip1: ChipFilterSchema,
        chip2: ChipFilterSchema,
        chip3: ChipFilterSchema,
        chip4: ChipFilterSchema,
        chip5: ChipFilterSchema,
        chip6: ChipFilterSchema,
      })
      .strict(),
    defaults: { enabled: true, limit: 10, areaScale: "m2", priceScale: "none", chip1: {}, chip2: {}, chip3: {}, chip4: {}, chip5: {}, chip6: {} },
    slots: {
      title: text(60, "Projects by keyword"),
      chipsLabel: text(32, "Keywords"),
      chip1Label: text(24),
      chip2Label: text(24),
      chip3Label: text(24),
      chip4Label: text(24),
      chip5Label: text(24),
      chip6Label: text(24),
      /** The heading arrow's name and the black button; "{chip}" = the selected chip's label. */
      moreLabel: text(40, "View all projects"),
      withheldText: text(60, "Price withheld"),
      builtLabel: text(12),
      ...sliderLabels,
    },
  },
  /** Principles (title, quote, paragraph, two device images) + the three-tier lineup (yellow / mint / navy tiles → service route). */
  "home.service": {
    schema: z.object({}).strict(),
    defaults: {},
    slots: {
      title: text(80),
      quote: text(120),
      body: richText(3, 300),
      media1: media,
      media2: media,
      lineupTitle: text(80),
      /** The lineup heading arrow's name; destination = the service route. */
      moreLabel: text(32, "Learn more"),
      tier1Title: text(24),
      tier1Sub: text(24),
      tier1Note: text(60),
      tier1Prefix: text(8),
      tier1Figure: text(24),
      tier1Unit: text(12),
      tier1Tag: text(16),
      tier2Title: text(24),
      tier2Sub: text(24),
      tier2Note: text(60),
      tier2Prefix: text(8),
      tier2Figure: text(24),
      tier2Unit: text(12),
      tier2Tag: text(16),
      tier3Title: text(24),
      tier3Sub: text(24),
      tier3Note: text(60),
      tier3Prefix: text(8),
      tier3Figure: text(24),
      tier3Unit: text(12),
      tier3Tag: text(16),
    },
  },
  /** A second selection over the same projects, as simpler cards (image, title, one meta row). */
  "home.recent": {
    schema: projectsSchema,
    defaults: { enabled: true, limit: 3, selection: { mode: "latest" } },
    slots: {
      title: text(60, "Recent projects"),
      moreLabel: text(32, "View all projects"),
    },
  },
  /** Up to three brand tiles between hairlines: a coloured icon tile (template-drawn), title, one line, optional link. */
  "home.brands": {
    schema: z.object({}).strict(),
    defaults: {},
    slots: {
      title: text(60),
      brand1Title: text(40),
      brand1Text: text(80),
      brand1Link: link,
      brand2Title: text(40),
      brand2Text: text(80),
      brand2Link: link,
      brand3Title: text(40),
      brand3Text: text(80),
      brand3Link: link,
    },
  },
  /** Up to four showroom cards (grid > 860, autoplay slider below): image, name, two mini buttons, two label/value rows. */
  "home.showrooms": {
    schema: z.object({}).strict(),
    defaults: {},
    slots: {
      title: text(60),
      /** The heading arrow (a page of this site); unset = no arrow. */
      moreLink: link,
      /** The first mini button of every card; destination = the contact route. */
      contactLabel: text(16, "Contact"),
      room1Media: media,
      room1Name: text(24),
      room1Link: link,
      room1Label1: text(16),
      room1Value1: text(120),
      room1Label2: text(16),
      room1Value2: text(120),
      room2Media: media,
      room2Name: text(24),
      room2Link: link,
      room2Label1: text(16),
      room2Value1: text(120),
      room2Label2: text(16),
      room2Value2: text(120),
      room3Media: media,
      room3Name: text(24),
      room3Link: link,
      room3Label1: text(16),
      room3Value1: text(120),
      room3Label2: text(16),
      room3Value2: text(120),
      room4Media: media,
      room4Name: text(24),
      room4Link: link,
      room4Label1: text(16),
      room4Value1: text(120),
      room4Label2: text(16),
      room4Value2: text(120),
      /** The outlined button under the cards (a page of this site); unset = no button. */
      buttonLink: link,
      slideLabelFormat: text(40, "Slide {n} of {total}"),
    },
  },
} satisfies SectionDeclarations;
