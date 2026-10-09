import type { PortfolioListData } from "../components/portfolio/types";
import { slotMedia, type Media } from "../lib/media";
import { projectCardModels } from "../lib/projects";
import { PORTFOLIO_PAGE_SIZE } from "../manifest/portfolio";
import type { Ctx } from "./types";

/**
 * portfolio.index — the data of the project list (see sections/PortfolioIndex.tsx).
 *   portfolioIndexTitle(ctx)         the list title slot (document title)
 *   portfolioIndexLead(ctx)          the one-line lead under the page title (also on the detail)
 *   portfolioVisual(ctx)             the banner photo + line (shared with the detail page)
 *   portfolioIndex(ctx, page)        the list data of page n; undefined when the page does not exist (→ 404)
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

/**
 * `emptyFirstPage`: a list with no project still has its page 1 (the empty line, no tab, no card). An
 * ordinary build has no /portfolio at all then (the route is pruned and nothing links to it); a
 * composed site keeps the page, because its shell — header, drawer, link slots — links to /portfolio
 * whatever is published (runtime/portfolio.ts asks for it, an ordinary build does not).
 */
export function portfolioIndex(ctx: Ctx, page: number, options: { emptyFirstPage?: boolean } = {}): PortfolioListData | undefined {
  const result =
    ctx.content.paginate({ type: "projects", selection: { mode: "latest" } }, { page, pageSize: PORTFOLIO_PAGE_SIZE }) ??
    (options.emptyFirstPage && page === 1 ? { items: [], page: 1, pageSize: PORTFOLIO_PAGE_SIZE, total: 0, pageCount: 1 } : undefined);
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
