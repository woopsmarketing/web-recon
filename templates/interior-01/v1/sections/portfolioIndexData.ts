import type { ProjectCardProps } from "../components/ProjectCard";
import type { PaginationProps } from "../components/Pagination";
import { PORTFOLIO_PAGE_SIZE } from "../template";
import { portfolioFilterData, type PortfolioFilterData } from "./portfolioFilter";
import { projectCards } from "./projectCards";
import type { Ctx } from "./types";

// 1.7.0: the list's DATA lives here, apart from its markup (PortfolioIndex.tsx) — see
// homeProjectsData.ts. The filter island's data and the page size are part of it now (they were
// two more props of the section), so ONE value describes a list page.

export interface PortfolioIndexData {
  title: string;
  description?: string[];
  hero?: { src: string; width: number; height: number; alt: string };
  page: number;
  pageCount: number;
  total: number;
  pageSize: number;
  cards: ProjectCardProps[];
  pagination: PaginationProps;
  /**
   * Page 1 (/portfolio) only, and only when the site keeps filters on: the filter island wraps the
   * SAME static page-1 cards and route pager as its unfiltered view. Paged routes render the plain
   * static list.
   */
  filter?: PortfolioFilterData;
}

/** URL of list page n: page 1 is the list root, never "/portfolio/page/1". */
export function portfolioPageHref(n: number): string {
  return n === 1 ? "/portfolio" : `/portfolio/page/${n}`;
}

/**
 * portfolio.index — one OFFSET page of ALL served projects in the default (latest) order.
 * Returns undefined for a page that does not exist (the route then 404s).
 *
 * `emptyFirstPage`: a list with no project still has its page 1 (the list's heading and nothing
 * under it). An ordinary build has no /portfolio at all then (the route is pruned and nothing links
 * to it); a composed site keeps the page, because its shell — the header, /about, /3d-portfolio —
 * links to /portfolio whatever is published.
 */
export function portfolioIndex(ctx: Ctx, page: number, options: { emptyFirstPage?: boolean } = {}): PortfolioIndexData | undefined {
  const result =
    ctx.content.paginate({ type: "projects", selection: { mode: "latest" } }, { page, pageSize: PORTFOLIO_PAGE_SIZE }) ??
    (options.emptyFirstPage && page === 1 ? { items: [], page: 1, pageSize: PORTFOLIO_PAGE_SIZE, total: 0, pageCount: 1 } : undefined);
  if (!result) return undefined;
  const heroSlot = ctx.slots.media("portfolio.index", "heroImage");
  const text = (key: "pageLabel" | "previousLabel" | "nextLabel" | "paginationLabel") => ctx.slots.text("portfolio.index", key) ?? "";
  return {
    title: ctx.slots.text("portfolio.index", "title") ?? "",
    description: ctx.slots.richText("portfolio.index", "description")?.paragraphs,
    hero: heroSlot ? { ...ctx.assets.resolve(heroSlot.asset), alt: heroSlot.alt } : undefined,
    page: result.page,
    pageCount: result.pageCount,
    total: result.total,
    pageSize: PORTFOLIO_PAGE_SIZE,
    cards: projectCards(ctx, result.items, { level: 2, eagerCount: 3, withSummary: true }),
    pagination: {
      page: result.page,
      pageCount: result.pageCount,
      hrefs: Array.from({ length: result.pageCount }, (_, i) => portfolioPageHref(i + 1)),
      labels: { nav: text("paginationLabel"), previous: text("previousLabel"), next: text("nextLabel"), page: text("pageLabel") },
    },
    filter: result.page === 1 ? portfolioFilterData(ctx) : undefined,
  };
}

/** Page title used in <title>: unique per list page. */
export function portfolioIndexTitle(ctx: Ctx, page: number): string {
  const title = ctx.slots.text("portfolio.index", "title") ?? "";
  const pageLabel = ctx.slots.text("portfolio.index", "pageLabel") ?? "";
  const base = page > 1 ? `${title} — ${pageLabel} ${page}` : title;
  return `${base} | ${ctx.identity.brandName}`;
}
