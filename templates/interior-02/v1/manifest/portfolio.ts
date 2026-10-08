import { z } from "zod";
import type { SectionDeclarations } from "@platform/settings/settings";
import { AREA_SCALE_IDS, PRICE_SCALE_IDS, PROJECT_FILTER_GROUPS } from "@platform/content/project-filter";

/**
 * Portfolio sections (PORTFOLIO area): the project list (/portfolio, /portfolio/page/[n]) and
 * the project detail (/portfolio/[slug]). Every user-visible string is a slot with a neutral
 * English default; business facts come from the project records only.
 *
 * portfolio.index settings
 *   filtersEnabled  false = the plain paginated list (no sidebar, no sort, no search)
 *   filterGroups    which of the platform's filter dimensions the sidebar offers (keyword · type ·
 *                   area · style · price); a group with no matching option is left out automatically
 *   areaScale       bucket scale of the floor-area group (m2 | pyeong)
 *   priceScale      bucket scale of the price-per-area group + the price sorts ("none" = neither)
 *   batchSize       cards revealed per batch as the end of the grid comes into view (with script)
 * portfolio.detail settings
 *   relatedCount    cards in the "related projects" row (0 = no row)
 *   relatedAutoplay the ≤ 640 related slider rotates by itself
 */

const text = (maxLength: number, neutralDefault?: string) =>
  neutralDefault === undefined ? ({ type: "text", maxLength } as const) : ({ type: "text", maxLength, neutralDefault } as const);

/** Portfolio list page size (shared by both list routes in template.ts). */
export const PORTFOLIO_PAGE_SIZE = 12;

export const portfolioSections = {
  "portfolio.index": {
    schema: z
      .object({
        filtersEnabled: z.boolean(),
        filterGroups: z
          .array(z.enum(PROJECT_FILTER_GROUPS))
          .min(1)
          .max(PROJECT_FILTER_GROUPS.length)
          .refine((g) => new Set(g).size === g.length, { message: "filter groups must be unique" }),
        areaScale: z.enum(AREA_SCALE_IDS),
        priceScale: z.enum(["none", ...PRICE_SCALE_IDS]),
        batchSize: z.number().int().min(1).max(48),
      })
      .strict(),
    defaults: { filtersEnabled: true, filterGroups: [...PROJECT_FILTER_GROUPS], areaScale: "m2", priceScale: "none", batchSize: PORTFOLIO_PAGE_SIZE },
    slots: {
      /** page title (document title, the ≤ 640 header bar, the visually hidden h1) */
      title: text(40, "Projects"),
      // ---- sidebar / filter panel ----
      filterLabel: text(24, "Filters"),
      filterHint: text(60, "Choose filters"),
      openFiltersLabel: text(32, "Open filters"),
      closeFiltersLabel: text(32, "Close filters"),
      searchLabel: text(40, "Search projects"),
      searchPlaceholder: text(60, "Search"),
      typeLabel: text(24, "Type"),
      areaLabel: text(24, "Floor area"),
      styleLabel: text(24, "Style"),
      priceLabel: text(24, "Price per area"),
      resetLabel: text(24, "Reset"),
      applyLabel: text(24, "Apply"),
      selectedFiltersLabel: text(32, "Selected filters"),
      // ---- result bar ----
      sortLabel: text(24, "Sort by"),
      sortNewest: text(24, "Newest"),
      sortOldest: text(24, "Oldest"),
      sortAreaDesc: text(24, "Largest first"),
      sortAreaAsc: text(24, "Smallest first"),
      sortPriceDesc: text(24, "Price: high to low"),
      sortPriceAsc: text(24, "Price: low to high"),
      /** "{n}" is replaced by the number of matching projects; `…One` is the n = 1 form. */
      resultCountFormat: text(32, "{n} projects"),
      resultCountFormatOne: text(32, "{n} project"),
      emptyTitle: text(60, "No projects match these filters"),
      emptyBody: text(160, "Try removing a filter or searching for something else."),
      // ---- cards ----
      /** shown on a card whose project has no total price */
      withheldLabel: text(40, "Price on request"),
      /** suffix after the built year on a card (e.g. "built"); no value = the year alone */
      builtLabel: text(12),
      // ---- no-script pagination ----
      paginationLabel: text(32, "Pagination"),
      pageLabel: text(16, "Page"),
      previousLabel: text(24, "Previous page"),
      nextLabel: text(24, "Next page"),
    },
  },
  "portfolio.detail": {
    schema: z.object({ relatedCount: z.number().int().min(0).max(8), relatedAutoplay: z.boolean() }).strict(),
    defaults: { relatedCount: 4, relatedAutoplay: true },
    slots: {
      backLabel: text(32, "All projects"),
      // ---- head ----
      consultLabel: text(40, "Ask about this project"),
      reviewJumpLabel: text(40, "Customer review"),
      /** facts table labels: a row renders only when the project authors the fact */
      propertyTypeLabel: text(24, "Property"),
      projectTypeLabel: text(24, "Project type"),
      categoryLabel: text(24, "Tier"),
      areaLabel: text(24, "Floor area"),
      builtYearLabel: text(24, "Built"),
      /** "{n}" is replaced by the built year */
      builtYearFormat: text(16, "{n}"),
      locationLabel: text(24, "Location"),
      periodLabel: text(24, "Work period"),
      durationLabel: text(24, "Duration"),
      /** "{n}" is replaced by the number of weeks; `durationFormatOne` is the n = 1 form. */
      durationFormat: text(24, "{n} weeks"),
      durationFormatOne: text(24, "{n} week"),
      // ---- total block / aside ----
      totalLabel: text(24, "Total"),
      withheldLabel: text(40, "Price on request"),
      detailsLabel: text(32, "Price details"),
      pricePerAreaLabel: text(24, "Price per area"),
      scopeLabel: text(24, "Scope"),
      /** small notes under the aside rows (no value = none) */
      priceNote1: text(160),
      priceNote2: text(160),
      priceNote3: text(160),
      // ---- gallery ----
      photosLabel: text(32, "Photos"),
      allPhotosLabel: text(24, "All"),
      gridViewLabel: text(24, "Grid view"),
      singleViewLabel: text(24, "Single view"),
      openPhotoLabel: text(32, "View photo"),
      viewerLabel: text(32, "Photo viewer"),
      closeViewerLabel: text(24, "Close"),
      previousPhotoLabel: text(24, "Previous photo"),
      nextPhotoLabel: text(24, "Next photo"),
      thumbnailsLabel: text(32, "Thumbnails"),
      storyTitle: text(40, "Project story"),
      beforeAfterTitle: text(40, "Before and after"),
      beforeLabel: text(16, "Before"),
      afterLabel: text(16, "After"),
      // ---- review ----
      reviewTitle: text(40, "Customer review"),
      // ---- related ----
      relatedTitle: text(40, "Related projects"),
      previousLabel: text(24, "Previous"),
      nextLabel: text(24, "Next"),
      pauseLabel: text(24, "Pause"),
      playLabel: text(24, "Play"),
      /** related cards */
      relatedWithheldLabel: text(40, "Price on request"),
      builtLabel: text(12),
    },
  },
} satisfies SectionDeclarations;
