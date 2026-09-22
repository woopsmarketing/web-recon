import { z } from "zod";
import { defineTemplate } from "@platform/site/template-manifest";
import { ProjectSelectionSchema } from "@platform/settings/settings";
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
 */
export const template = defineTemplate({
  id: "interior-01",
  version: "1.1.0",
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
      },
    },
    "portfolio.index": {
      schema: z.object({}).strict(),
      defaults: {},
      slots: {
        title: { type: "text", maxLength: 40, neutralDefault: "Projects" },
        description: { type: "richText", maxParagraphs: 2, maxParagraphLength: 240 },
        heroImage: { type: "media" },
        pageLabel: { type: "text", maxLength: 16, neutralDefault: "Page" },
        previousLabel: { type: "text", maxLength: 24, neutralDefault: "Previous page" },
        nextLabel: { type: "text", maxLength: 24, neutralDefault: "Next page" },
        paginationLabel: { type: "text", maxLength: 32, neutralDefault: "Pagination" },
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
