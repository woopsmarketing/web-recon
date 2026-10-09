import { buildProjectFilterVocabulary, toProjectFilterRecord } from "@platform/content/project-filter";
import type { ProjectIndexEntry } from "../components/portfolio/types";
import { badgeTone, projectCardModels } from "../lib/projects";
import { PORTFOLIO_PAGE_SIZE } from "../manifest/portfolio";
import type { PortfolioIndexData } from "./PortfolioIndex";
import type { Ctx } from "./types";

/** portfolio.index — the data of the project list (see sections/PortfolioIndex.tsx). */
export function portfolioIndexTitle(ctx: Ctx): string {
  return ctx.slots.text("portfolio.index", "title") ?? "";
}

/**
 * `emptyFirstPage`: a list with no project still has its page 1 (an empty list). An ordinary build
 * has no /portfolio at all then (the route is pruned and nothing links to it); a composed site keeps
 * the page, because its shell — header, tab bar, footer — links to /portfolio whatever is published.
 */
export function portfolioIndex(ctx: Ctx, page: number, options: { emptyFirstPage?: boolean } = {}): PortfolioIndexData | undefined {
  const result =
    ctx.content.paginate({ type: "projects", selection: { mode: "latest" } }, { page, pageSize: PORTFOLIO_PAGE_SIZE }) ??
    (options.emptyFirstPage && page === 1 ? { items: [], page: 1, pageSize: PORTFOLIO_PAGE_SIZE, total: 0, pageCount: 1 } : undefined);
  if (!result) return undefined;
  const t = (key: string) => ctx.slots.text("portfolio.index", key);
  const s = (key: string) => t(key) ?? "";
  const title = portfolioIndexTitle(ctx);
  const settings = ctx.settings["portfolio.index"];
  const pager = { nav: s("paginationLabel"), page: s("pageLabel"), previous: s("previousLabel"), next: s("nextLabel") };
  const data: PortfolioIndexData = {
    title,
    page: result.page,
    pageCount: result.pageCount,
    cards: projectCardModels(ctx, result.items),
    withheld: t("withheldLabel"),
    built: t("builtLabel"),
    pager,
  };
  if (!settings.filtersEnabled) return data;

  const projects = ctx.content.list({ type: "projects", selection: { mode: "latest" }, limit: Number.MAX_SAFE_INTEGER }).items;
  const categories = ctx.content.list({ type: "categories" }).items;
  const cards = projectCardModels(ctx, projects);
  const entries = projects.map((p, i): ProjectIndexEntry => ({ ...toProjectFilterRecord(p), card: cards[i]! }));
  const vocabulary = buildProjectFilterVocabulary(entries, {
    groups: settings.filterGroups,
    categories,
    areaScale: settings.areaScale,
    priceScale: settings.priceScale,
  });
  // Ship only fields the site's filters/sorts can read: no price scale → no price data in the index.
  if (!vocabulary.price) for (const e of entries) delete e.pricePerArea;
  const tones: Record<string, "yellow" | "mint" | "navy"> = {};
  categories.forEach((c, i) => {
    tones[c.id] = badgeTone(i);
  });
  data.browser = {
    title,
    entries,
    vocabulary,
    tones,
    labels: {
      filter: s("filterLabel"),
      filterHint: s("filterHint"),
      openFilters: s("openFiltersLabel"),
      closeFilters: s("closeFiltersLabel"),
      search: s("searchLabel"),
      searchPlaceholder: s("searchPlaceholder"),
      type: s("typeLabel"),
      area: s("areaLabel"),
      style: s("styleLabel"),
      price: s("priceLabel"),
      reset: s("resetLabel"),
      apply: s("applyLabel"),
      selectedFilters: s("selectedFiltersLabel"),
      sort: s("sortLabel"),
      sorts: {
        newest: s("sortNewest"),
        oldest: s("sortOldest"),
        "area-desc": s("sortAreaDesc"),
        "area-asc": s("sortAreaAsc"),
        "price-desc": s("sortPriceDesc"),
        "price-asc": s("sortPriceAsc"),
      },
      count: { one: s("resultCountFormatOne"), other: s("resultCountFormat") },
      emptyTitle: s("emptyTitle"),
      emptyBody: s("emptyBody"),
      withheld: data.withheld,
      built: data.built,
      pagination: pager,
    },
    page: result.page,
    pageSize: PORTFOLIO_PAGE_SIZE,
    pageCount: result.pageCount,
    total: result.total,
    batchSize: settings.batchSize,
    noindexFiltered: ctx.mode === "public",
  };
  return data;
}
