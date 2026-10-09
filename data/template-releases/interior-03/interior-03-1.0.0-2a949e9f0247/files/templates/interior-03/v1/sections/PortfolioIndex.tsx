import { PortfolioBrowser } from "../components/portfolio/PortfolioBrowser";
import type { PortfolioListData } from "../components/portfolio/types";
import { slotMedia, type Media } from "../lib/media";
import { projectCardModels } from "../lib/projects";
import { PORTFOLIO_PAGE_SIZE } from "../manifest/portfolio";
import type { Ctx } from "./types";

/**
 * portfolio.index — the project list (/portfolio = page 1, /portfolio/page/n).
 *   portfolioIndexTitle(ctx)         the list title slot (document title)
 *   portfolioIndexLead(ctx)          the one-line lead under the page title (also on the detail)
 *   portfolioVisual(ctx)             the banner photo + line (shared with the detail page)
 *   portfolioIndex(ctx, page)        build-time data; undefined when the page does not exist (→ 404)
 *   <PortfolioIndex data={…} />      the section
 * The server HTML is always the static page (banner, tab strip, title, count, 18 cards, pager
 * links, search row); the list component (components/portfolio/PortfolioBrowser) filters in
 * place after hydration over every served project's card model.
 */
export function portfolioIndexTitle(ctx: Ctx): string {
  return ctx.slots.text("portfolio.index", "title") ?? "";
}

export function portfolioIndexLead(ctx: Ctx): string | undefined {
  return ctx.slots.text("portfolio.index", "lead");
}

export function portfolioVisual(ctx: Ctx): { media?: Media; text?: string } {
  return { media: slotMedia(ctx, "portfolio.index", "visualMedia"), text: ctx.slots.text("portfolio.index", "visualText") };
}

export function portfolioIndex(ctx: Ctx, page: number): PortfolioListData | undefined {
  const result = ctx.content.paginate({ type: "projects", selection: { mode: "latest" } }, { page, pageSize: PORTFOLIO_PAGE_SIZE });
  if (!result) return undefined;
  const t = (key: string) => ctx.slots.text("portfolio.index", key);
  const s = (key: string) => t(key) ?? "";
  const projects = ctx.content.list({ type: "projects", selection: { mode: "latest" }, limit: Number.MAX_SAFE_INTEGER }).items;
  const used = new Set(projects.map((p) => p.category));
  const tabs = ctx.content
    .list({ type: "categories" })
    .items.filter((c) => used.has(c.id))
    .map((c) => ({ id: c.id, label: c.name }));
  const visual = portfolioVisual(ctx);
  return {
    visual: visual.media,
    labels: {
      title: portfolioIndexTitle(ctx),
      lead: portfolioIndexLead(ctx),
      visualText: visual.text,
      tabs: s("tabsLabel"),
      all: s("allLabel"),
      count: s("countText"),
      search: ctx.settings["portfolio.index"].search ? { label: s("searchLabel"), placeholder: t("searchPlaceholder"), button: s("searchButtonLabel") } : undefined,
      empty: s("emptyText"),
      pager: { nav: s("pagerLabel"), page: s("pageLabel"), prev: s("prevLabel"), next: s("nextLabel") },
    },
    tabs,
    entries: projectCardModels(ctx, projects),
    page: result.page,
    pageSize: PORTFOLIO_PAGE_SIZE,
    pageCount: result.pageCount,
    total: result.total,
    pagedRoute: ctx.routes.has("portfolio.page"),
    noindexFiltered: ctx.mode === "public",
  };
}

export function PortfolioIndex({ data }: { data: PortfolioListData }) {
  return <PortfolioBrowser data={data} />;
}
