import { z } from "zod";
import type { SectionDeclarations } from "@platform/settings/settings";

/**
 * Portfolio sections (PORTFOLIO area): the project list (/portfolio = page 1, /portfolio/page/[n])
 * and the project detail (/portfolio/[slug]). Every user-visible string is a slot: a control label
 * carries a neutral English default; business copy (the lead, the banner line, the search
 * placeholder) has none and its element is omitted when the site sets no value. Project facts
 * come from the project records only.
 *
 * portfolio.index settings
 *   search       true = the bordered search row under the pager (a title search, in place with script)
 * portfolio.detail settings
 *   facts        true = the facts table between the text block and the photos (one row per fact
 *                the project authors)
 *   groupLabels  true = a small heading before each photo group
 *
 * Format slots: `countText` carries "{count}" (projects in the current selection), `pageLabel`
 * "{n}" (a page number), `durationFormat` / `durationFormatOne` "{n}" (weeks; the n = 1 form).
 * The detail banner reuses the list's `visualMedia` / `visualText` / `lead`.
 */

const text = (maxLength: number, neutralDefault?: string) =>
  neutralDefault === undefined ? ({ type: "text", maxLength } as const) : ({ type: "text", maxLength, neutralDefault } as const);
const media = { type: "media" } as const;

/** Projects per list page: six rows of three (wide) / nine rows of two (narrow). */
export const PORTFOLIO_PAGE_SIZE = 18;

export const portfolioSections = {
  "portfolio.index": {
    schema: z.object({ search: z.boolean() }).strict(),
    defaults: { search: true },
    slots: {
      /** banner title and page title while no category is selected (document title too) */
      title: text(40, "Portfolio"),
      /** one line under the page title (hidden ≤ 980) */
      lead: text(120),
      /** the banner photo and its small line (shared with the detail page) */
      visualMedia: media,
      visualText: text(80),
      // ---- tab strip ----
      tabsLabel: text(32, "Categories"),
      allLabel: text(24, "All"),
      // ---- count line ----
      countText: text(60, "{count} projects"),
      // ---- search row ----
      searchLabel: text(32, "Search"),
      searchPlaceholder: text(60),
      searchButtonLabel: text(24, "Search"),
      emptyText: text(120, "No projects found."),
      // ---- pager ----
      pagerLabel: text(32, "Pages"),
      prevLabel: text(32, "Previous page"),
      nextLabel: text(32, "Next page"),
      pageLabel: text(32, "Page {n}"),
    },
  },
  "portfolio.detail": {
    schema: z.object({ facts: z.boolean(), groupLabels: z.boolean() }).strict(),
    defaults: { facts: false, groupLabels: false },
    slots: {
      listLabel: text(32, "Back to list"),
      photosLabel: text(32, "Photos"),
      // ---- facts table labels (a row renders only for a fact the project authors) ----
      categoryLabel: text(24, "Category"),
      locationLabel: text(24, "Location"),
      areaLabel: text(24, "Size"),
      propertyTypeLabel: text(24, "Property type"),
      scopeLabel: text(24, "Scope"),
      periodLabel: text(24, "Period"),
      durationFormat: text(24, "{n} weeks"),
      durationFormatOne: text(24, "{n} week"),
      builtYearLabel: text(24, "Built"),
      priceLabel: text(24, "Cost"),
      stylesLabel: text(24, "Style"),
    },
  },
} satisfies SectionDeclarations;
