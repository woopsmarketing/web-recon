import { defineTemplate } from "@platform/site/template-manifest";
import defaultTheme from "./theme.default.json";
import { shellSections } from "./manifest/shell";
import { homeSections } from "./manifest/home";
import { portfolioSections, PORTFOLIO_PAGE_SIZE } from "./manifest/portfolio";
import { pagesSections } from "./manifest/pages";
import { supportSections } from "./manifest/support";

/**
 * interior-03 v1 — third authored Recon Template (interior vertical): a classic brochure site.
 *
 * The template owns design, layout, responsive rules and interaction presentation; the site
 * owns content, identity, theme values and business data. Every per-site variation is declared
 * here through five manifest fragments (manifest/shell · home · portfolio · pages · support), each
 * owned by one area; `sections` is their spread. Section order on a page is template code.
 *
 * Routes: home · portfolio list (page 1 static, pages 2…N dynamic) · project detail · four
 * static pages. Only routes that generate a page for a site are linked (ctx.routes.has).
 */
export const template = defineTemplate({
  id: "interior-03",
  version: "1.0.0",
  vertical: "interior",
  routes: [
    { key: "home", path: "/" },
    { key: "portfolio.index", path: "/portfolio", list: { collection: "projects", pageSize: PORTFOLIO_PAGE_SIZE, page: "first" } },
    { key: "portfolio.page", path: "/portfolio/page/[n]", list: { collection: "projects", pageSize: PORTFOLIO_PAGE_SIZE, page: "rest" } },
    { key: "portfolio.detail", path: "/portfolio/[slug]", item: { collection: "projects" } },
    { key: "service", path: "/service" },
    { key: "about", path: "/about" },
    { key: "faq", path: "/faq" },
    { key: "contact", path: "/contact" },
  ],
  sections: {
    ...shellSections,
    ...homeSections,
    ...portfolioSections,
    ...pagesSections,
    ...supportSections,
  },
  theme: {
    consumes: [
      "color.canvas",
      "color.surface.primary",
      "color.surface.secondary",
      "color.surface.elevated",
      "color.text.primary",
      "color.text.secondary",
      "color.text.muted",
      "color.text.inverse",
      "color.action.primary",
      "color.action.primaryText",
      "color.link",
      "color.border.default",
      "color.border.strong",
      "color.accent.primary",
      "color.accent.secondary",
      "decoration.radius.small",
      "decoration.radius.medium",
      "decoration.radius.pill",
      "decoration.shadow.small",
      "typography.body",
      "typography.heading",
    ],
    defaults: defaultTheme,
  },
});

export default template;
