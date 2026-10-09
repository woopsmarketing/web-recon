import { z } from "zod";
import { ProjectSelectionSchema, type SectionDeclarations } from "@platform/settings/settings";

/**
 * Home sections (HOME area), in page order after the header:
 *   home.hero · home.gallery · home.band · home.portfolio
 * Every user-visible string is a slot: control labels carry a neutral English default, the
 * site's own words (slogan, captions, band copy, lead) have none and hide what they describe
 * when unset. A section whose data is empty renders nothing.
 *
 * Numbered slots stand in for lists (the platform has no list slots):
 *   gallery   tile{1..4}Media / tile{1..4}Caption   (tile n = the n-th category that has a project)
 *   band      link{1..4}                            (icon n of the `icons` setting belongs to link n)
 */

const text = (maxLength: number, neutralDefault?: string) =>
  neutralDefault === undefined ? ({ type: "text", maxLength } as const) : ({ type: "text", maxLength, neutralDefault } as const);
const link = { type: "link" } as const;
const media = { type: "media" } as const;

/** The line glyphs a band button can carry (drawn by components/home/BandIcons). */
export const BAND_ICONS = ["estimate", "chat", "notice", "company", "phone", "mail", "pin", "calendar"] as const;
export type BandIconName = (typeof BAND_ICONS)[number];

export const homeSections = {
  /**
   * Full-width stage over the banners collection (image only, at most 8 slides), cross-fading
   * every ~4 s when `autoplay` is on; the slogan block (emblem, a regular line, a bold line) is
   * centred over the slides. No banner = the slogan on the quiet surface; no slogan either = nothing.
   */
  "home.hero": {
    schema: z.object({ autoplay: z.boolean() }).strict(),
    defaults: { autoplay: true },
    slots: {
      /** A small emblem above the slogan (shown only with a slogan line). */
      mark: media,
      line1: text(60),
      line2: text(80),
      /** Accessible name of the slide region (more than one slide only). */
      regionLabel: text(40, "Featured photos"),
      /** Accessible name of a dot; "{n}" = the slide number. */
      dotLabel: text(32, "Slide {n}"),
      /** The stop / start control after the dots (autoplay on, more than one slide): the name of the action it performs now. */
      pauseLabel: text(32, "Pause slides"),
      playLabel: text(32, "Play slides"),
    },
  },
  /**
   * Category tiles (two per row, one ≤ 480): the site's categories that have at least one served
   * project, in reader order, at most four. Picture = the tile's media slot, else the cover of the
   * category's latest project; each tile opens the portfolio filtered to that category.
   */
  "home.gallery": {
    schema: z.object({ enabled: z.boolean() }).strict(),
    defaults: { enabled: true },
    slots: {
      title: text(40, "Gallery"),
      tile1Media: media,
      tile1Caption: text(40),
      tile2Media: media,
      tile2Caption: text(40),
      tile3Media: media,
      tile3Caption: text(40),
      tile4Media: media,
      tile4Caption: text(40),
    },
  },
  /**
   * The quiet band: an accent eyebrow, a one-line title with up to two parts drawn bold
   * (`titleMarkA` / `titleMarkB`, each must occur in the title), up to four round buttons (link
   * slots kept only when their destination exists) and a photo at the right / behind the content.
   * `icons[n-1]` is the glyph of link n (a missing entry = no glyph). No title and no live link = nothing.
   */
  "home.band": {
    schema: z.object({ enabled: z.boolean(), icons: z.array(z.enum(BAND_ICONS)).max(4) }).strict(),
    defaults: { enabled: true, icons: ["estimate", "chat", "notice", "company"] },
    slots: {
      eyebrow: text(40),
      title: text(120),
      titleMarkA: text(40),
      titleMarkB: text(40),
      media,
      link1: link,
      link2: link,
      link3: link,
      link4: link,
    },
  },
  /** Project grid (3 columns, 2 ≤ 768) over a declared selection, the pill button under it → the portfolio list. */
  "home.portfolio": {
    schema: z.object({ enabled: z.boolean(), selection: ProjectSelectionSchema, limit: z.number().int().min(3).max(24) }).strict(),
    defaults: { enabled: true, selection: { mode: "latest" }, limit: 12 },
    slots: {
      title: text(40, "Portfolio"),
      /** The small line under the title. */
      lead: text(120),
      /** The pill button's text; destination = the portfolio list (only when that route exists). */
      moreLabel: text(32, "View more"),
    },
  },
} satisfies SectionDeclarations;
