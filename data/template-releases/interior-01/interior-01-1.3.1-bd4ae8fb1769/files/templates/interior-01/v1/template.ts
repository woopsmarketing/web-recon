import { z } from "zod";
import { defineTemplate } from "@platform/site/template-manifest";
import { ProjectSelectionSchema } from "@platform/settings/settings";
import { AREA_SCALE_IDS, PRICE_SCALE_IDS, PROJECT_FILTER_GROUPS } from "@platform/content/project-filter";
import defaultTheme from "./theme.default.json";

/** Portfolio list page size (the observed design shows 30 per page: 10 rows × 3 columns). */
export const PORTFOLIO_PAGE_SIZE = 30;

/**
 * interior-01 v1 — first authored production Recon Template.
 * Every per-site variation is declared here; anything not declared is code.
 *   settings → enabled / limit / selection (behaviour)
 *   slots    → section-level copy (presentation text), with fallback chain
 *   routes   → which content generates which App Router pages (route plan)
 *
 * 1.1.0 (Step 4): portfolio list (/portfolio, /portfolio/page/[n]) + project detail
 * (/portfolio/[slug]); home cards link to details. Additive: every 1.0.0 site's
 * settings/slots/content documents stay valid.
 *
 * 1.2.0 (Step 4.1): portfolio filters/search/sort on /portfolio — client-side over a
 * compact build-time index, semantics in @platform/content/project-filter (never in
 * React). Additive: every 1.1.0 site document stays valid.
 *
 * 1.3.0 (Step 5): full homepage — hero · intro · projects A · projects B · reviews ·
 * image band (+ floating contact CTA). Order is Template code (app/page.tsx), never a
 * setting. Projects A and B read the SAME projects collection through two declared
 * selections; hero slides come from the PROVISIONAL banners collection; reviews are
 * optional content. Additive: every 1.2.0 site document stays valid.
 *
 * 1.3.1 (Whole-site Visual / UX Polish): presentation only — mobile footer stack, the
 * viewport-fixed bottom-right floating seat, reviews/showcase bar only when the track
 * scrolls, portfolio title on its banner, shared rhythm. No content, setting or slot
 * change: every 1.3.0 site document stays valid.
 */
export const template = defineTemplate({
  id: "interior-01",
  version: "1.3.1",
  vertical: "interior",
  routes: [
    { key: "home", path: "/" },
    { key: "portfolio.index", path: "/portfolio", list: { collection: "projects", pageSize: PORTFOLIO_PAGE_SIZE, page: "first" } },
    { key: "portfolio.page", path: "/portfolio/page/[n]", list: { collection: "projects", pageSize: PORTFOLIO_PAGE_SIZE, page: "rest" } },
    { key: "portfolio.detail", path: "/portfolio/[slug]", item: { collection: "projects" } },
  ],
  sections: {
    "site.header": {
      schema: z.object({}).strict(),
      defaults: {},
      slots: {
        homeLinkLabel: { type: "text", maxLength: 24, neutralDefault: "Home" },
        projectsNavLabel: { type: "text", maxLength: 24, neutralDefault: "Projects" },
        contactLabel: { type: "text", maxLength: 24, neutralDefault: "Contact" },
      },
    },
    // ---- homepage (1.3.0). Section order = app/page.tsx. Control labels are UI vocabulary
    // (per-section, like the portfolio pager's; slot-vs-localization review deferred to Template 2).
    "home.hero": {
      /** Slides are content (banners collection, max 8), never slots. */
      schema: z.object({ enabled: z.boolean(), autoplay: z.boolean() }).strict(),
      defaults: { enabled: true, autoplay: true },
      slots: {
        label: { type: "text", maxLength: 40, neutralDefault: "Highlights" },
        previousLabel: { type: "text", maxLength: 24, neutralDefault: "Previous slide" },
        nextLabel: { type: "text", maxLength: 24, neutralDefault: "Next slide" },
        pauseLabel: { type: "text", maxLength: 24, neutralDefault: "Pause slideshow" },
        playLabel: { type: "text", maxLength: 24, neutralDefault: "Play slideshow" },
        /** "{n}" = slide number, "{total}" = number of slides. */
        slideLabelFormat: { type: "text", maxLength: 40, neutralDefault: "Slide {n} of {total}" },
      },
    },
    "home.intro": {
      /** No neutral title/body: an intro is the site's own words → no title = no section. */
      schema: z.object({ enabled: z.boolean() }).strict(),
      defaults: { enabled: true },
      slots: {
        title: { type: "text", maxLength: 80 },
        body: { type: "richText", maxParagraphs: 3, maxParagraphLength: 400 },
        /** Operator-chosen destination (a page of this site, an on-page anchor, mailto: or tel:). */
        link: { type: "link" },
        media: { type: "media" },
      },
    },
    "home.projects-a": {
      schema: z
        .object({
          enabled: z.boolean(),
          limit: z.number().int().min(1).max(24),
          selection: ProjectSelectionSchema,
        })
        .strict(),
      defaults: { enabled: true, limit: 8, selection: { mode: "latest" } },
      slots: {
        title: { type: "text", maxLength: 40, neutralDefault: "Selected projects" },
        description: { type: "richText", maxParagraphs: 2, maxParagraphLength: 240 },
        /** "view all" label; its destination is the generated /portfolio route (never site data). */
        moreLabel: { type: "text", maxLength: 32, neutralDefault: "View all projects" },
        previousLabel: { type: "text", maxLength: 24, neutralDefault: "Previous projects" },
        nextLabel: { type: "text", maxLength: 24, neutralDefault: "Next projects" },
      },
    },
    "home.projects-b": {
      /**
       * A second showcase over the SAME projects collection — a different declared
       * selection, never a second collection or a placement flag. Off by default: without a
       * site-chosen selection it could only repeat projects A.
       */
      schema: z
        .object({
          enabled: z.boolean(),
          limit: z.number().int().min(1).max(24),
          selection: ProjectSelectionSchema,
        })
        .strict(),
      defaults: { enabled: false, limit: 8, selection: { mode: "latest" } },
      slots: {
        title: { type: "text", maxLength: 40, neutralDefault: "More projects" },
        description: { type: "richText", maxParagraphs: 2, maxParagraphLength: 240 },
        moreLabel: { type: "text", maxLength: 32, neutralDefault: "View all projects" },
        previousLabel: { type: "text", maxLength: 24, neutralDefault: "Previous projects" },
        nextLabel: { type: "text", maxLength: 24, neutralDefault: "Next projects" },
      },
    },
    "home.reviews": {
      /** Reviews are content (reviews collection, stored order); none published = no section. */
      schema: z.object({ enabled: z.boolean(), limit: z.number().int().min(1).max(12) }).strict(),
      defaults: { enabled: true, limit: 6 },
      slots: {
        title: { type: "text", maxLength: 40, neutralDefault: "Client reviews" },
        media: { type: "media" },
        previousLabel: { type: "text", maxLength: 24, neutralDefault: "Previous reviews" },
        nextLabel: { type: "text", maxLength: 24, neutralDefault: "Next reviews" },
      },
    },
    "home.image-band": {
      /** Full-width closing image; no media = no section. */
      schema: z.object({}).strict(),
      defaults: {},
      slots: {
        media: { type: "media" },
      },
    },
    "site.floating-cta": {
      /**
       * Fixed contact button. Destination = the business contact (email today); no
       * destination = no button. Future seam: a chat launcher action replaces the href.
       */
      schema: z.object({ enabled: z.boolean() }).strict(),
      defaults: { enabled: true },
      slots: {
        label: { type: "text", maxLength: 24, neutralDefault: "Contact" },
      },
    },
    "portfolio.index": {
      /**
       * Filters (1.2.0). Bucket definitions are vertical code (project-filter AREA_SCALES /
       * PRICE_SCALES); a site only picks the scale that fits its unit/currency.
       * No default-sort setting: the unfiltered view IS the static crawlable route order.
       */
      schema: z
        .object({
          filtersEnabled: z.boolean(),
          filterGroups: z
            .array(z.enum(PROJECT_FILTER_GROUPS))
            .min(1)
            .max(PROJECT_FILTER_GROUPS.length)
            .refine((g) => new Set(g).size === g.length, { message: "filter groups must be unique" }),
          areaScale: z.enum(AREA_SCALE_IDS),
          /** "none" = no price filter/sort (price buckets are currency-specific; nothing is converted). */
          priceScale: z.enum(["none", ...PRICE_SCALE_IDS]),
        })
        .strict(),
      defaults: { filtersEnabled: true, filterGroups: [...PROJECT_FILTER_GROUPS], areaScale: "m2", priceScale: "none" },
      slots: {
        title: { type: "text", maxLength: 40, neutralDefault: "Projects" },
        description: { type: "richText", maxParagraphs: 2, maxParagraphLength: 240 },
        heroImage: { type: "media" },
        pageLabel: { type: "text", maxLength: 16, neutralDefault: "Page" },
        previousLabel: { type: "text", maxLength: 24, neutralDefault: "Previous page" },
        nextLabel: { type: "text", maxLength: 24, neutralDefault: "Next page" },
        paginationLabel: { type: "text", maxLength: 32, neutralDefault: "Pagination" },
        // ---- filters (1.2.0) ----
        filterLabel: { type: "text", maxLength: 24, neutralDefault: "Filters" },
        searchLabel: { type: "text", maxLength: 40, neutralDefault: "Search projects" },
        searchPlaceholder: { type: "text", maxLength: 60, neutralDefault: "Title, location or keyword" },
        typeLabel: { type: "text", maxLength: 24, neutralDefault: "Type" },
        areaLabel: { type: "text", maxLength: 24, neutralDefault: "Size" },
        styleLabel: { type: "text", maxLength: 24, neutralDefault: "Style" },
        priceLabel: { type: "text", maxLength: 24, neutralDefault: "Price per area" },
        sortLabel: { type: "text", maxLength: 24, neutralDefault: "Sort by" },
        /** Sort option names (UI vocabulary; slot-vs-localization review deferred to Template 2). */
        sortNewest: { type: "text", maxLength: 24, neutralDefault: "Newest" },
        sortOldest: { type: "text", maxLength: 24, neutralDefault: "Oldest" },
        sortAreaDesc: { type: "text", maxLength: 24, neutralDefault: "Largest first" },
        sortAreaAsc: { type: "text", maxLength: 24, neutralDefault: "Smallest first" },
        sortPriceDesc: { type: "text", maxLength: 24, neutralDefault: "Price: high to low" },
        sortPriceAsc: { type: "text", maxLength: 24, neutralDefault: "Price: low to high" },
        resetLabel: { type: "text", maxLength: 24, neutralDefault: "Reset filters" },
        /** "{n}" is replaced by the number of matching projects; `…One` is the n = 1 form. */
        resultCountFormat: { type: "text", maxLength: 32, neutralDefault: "{n} projects" },
        resultCountFormatOne: { type: "text", maxLength: 32, neutralDefault: "{n} project" },
        emptyTitle: { type: "text", maxLength: 60, neutralDefault: "No projects match these filters" },
        emptyBody: { type: "text", maxLength: 160, neutralDefault: "Try removing a filter or searching for something else." },
      },
    },
    "portfolio.detail": {
      schema: z.object({}).strict(),
      defaults: {},
      slots: {
        backLabel: { type: "text", maxLength: 32, neutralDefault: "All projects" },
        roomsLabel: { type: "text", maxLength: 32, neutralDefault: "Rooms" },
        beforeLabel: { type: "text", maxLength: 16, neutralDefault: "Before" },
        afterLabel: { type: "text", maxLength: 16, neutralDefault: "After" },
        showMoreLabel: { type: "text", maxLength: 32, neutralDefault: "Show all photos" },
        showLessLabel: { type: "text", maxLength: 32, neutralDefault: "Show fewer photos" },
        bodyTitle: { type: "text", maxLength: 40, neutralDefault: "About the project" },
        quoteTitle: { type: "text", maxLength: 40, neutralDefault: "From the client" },
        locationLabel: { type: "text", maxLength: 24, neutralDefault: "Location" },
        areaLabel: { type: "text", maxLength: 24, neutralDefault: "Size" },
        categoryLabel: { type: "text", maxLength: 24, neutralDefault: "Type" },
        builtYearLabel: { type: "text", maxLength: 24, neutralDefault: "Building completed" },
        scopeLabel: { type: "text", maxLength: 24, neutralDefault: "Scope" },
        periodLabel: { type: "text", maxLength: 24, neutralDefault: "Project period" },
        durationLabel: { type: "text", maxLength: 24, neutralDefault: "Duration" },
        /** "{n}" is replaced by the number of weeks; `durationFormatOne` is the n = 1 form. */
        durationFormat: { type: "text", maxLength: 24, neutralDefault: "{n} weeks" },
        durationFormatOne: { type: "text", maxLength: 24, neutralDefault: "{n} week" },
        keywordsLabel: { type: "text", maxLength: 24, neutralDefault: "Keywords" },
        priceLabel: { type: "text", maxLength: 24, neutralDefault: "Price per area" },
        ctaPrompt: { type: "text", maxLength: 80, neutralDefault: "Planning a similar project?" },
        ctaLabel: { type: "text", maxLength: 32, neutralDefault: "Get in touch" },
      },
    },
    "site.not-found": {
      schema: z.object({}).strict(),
      defaults: {},
      slots: {
        title: { type: "text", maxLength: 60, neutralDefault: "Page not found" },
        message: { type: "text", maxLength: 160, neutralDefault: "The page you are looking for does not exist or has moved." },
        homeLabel: { type: "text", maxLength: 32, neutralDefault: "Back to home" },
      },
    },
    "site.footer": {
      schema: z.object({ showSummary: z.boolean() }).strict(),
      defaults: { showSummary: true },
      slots: {
        summary: { type: "text", maxLength: 280, binding: "business.summary" },
        companyLabel: { type: "text", maxLength: 24, neutralDefault: "Company" },
        emailLabel: { type: "text", maxLength: 24, neutralDefault: "Email" },
      },
    },
  },
  theme: {
    consumes: [
      "color.canvas",
      "color.surface.secondary",
      "color.text.primary",
      "color.text.secondary",
      "color.text.muted",
      "color.text.inverse",
      "color.action.primary",
      "color.action.primaryText",
      "color.border.default",
      "decoration.radius.medium",
      "decoration.radius.pill",
      "typography.body",
      "typography.heading",
    ],
    defaults: defaultTheme,
  },
});

export default template;
