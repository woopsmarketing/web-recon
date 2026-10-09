import { buildProjectFilterVocabulary, toProjectFilterRecord } from "@platform/content/project-filter";
import { ProjectCard } from "../components/ui/ProjectCard";
import { PortfolioBrowser } from "../components/portfolio/PortfolioBrowser";
import { Pager } from "../components/portfolio/Pager";
import type { PortfolioBrowserData, ProjectIndexEntry } from "../components/portfolio/types";
import { badgeTone, projectCardModels } from "../lib/projects";
import { PORTFOLIO_PAGE_SIZE } from "../manifest/portfolio";
import type { Ctx } from "./types";

/**
 * portfolio.index — the project list (/portfolio = page 1, /portfolio/page/n).
 *   portfolioIndexTitle(ctx)         the page title slot
 *   portfolioIndex(ctx, page)        build-time data; undefined when the page does not exist (→ 404)
 *   <PortfolioIndex data={…} />      the section
 * The server HTML is always the static page (crawlable cards + pager). With filters enabled the
 * browser island (components/portfolio/PortfolioBrowser) takes over after hydration: sidebar /
 * off-canvas panel, in-place filtering, sort, search, batch reveal instead of the pager.
 */
export interface PortfolioIndexData {
  title: string;
  page: number;
  pageCount: number;
  cards: ReturnType<typeof projectCardModels>;
  withheld?: string;
  built?: string;
  pager: { nav: string; page: string; previous: string; next: string };
  /** undefined = filters turned off by the site (plain list) */
  browser?: PortfolioBrowserData;
}

export function portfolioIndexTitle(ctx: Ctx): string {
  return ctx.slots.text("portfolio.index", "title") ?? "";
}

export function portfolioIndex(ctx: Ctx, page: number): PortfolioIndexData | undefined {
  const result = ctx.content.paginate({ type: "projects", selection: { mode: "latest" } }, { page, pageSize: PORTFOLIO_PAGE_SIZE });
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

export function PortfolioIndex({ data }: { data: PortfolioIndexData }) {
  return (
    <section className="i2-wrap i2-plist" data-section="portfolio.index" data-filters={data.browser ? "on" : "off"}>
      <h1 className="i2-sr">{data.title}</h1>
      {data.browser ? (
        <PortfolioBrowser data={data.browser} />
      ) : (
        <div className="i2-plist__row">
          <div className="i2-presults">
            <ul className="i2-cards i2-pgrid">
              {data.cards.map((m, i) => (
                <ProjectCard key={m.id} model={m} withheld={data.withheld} builtLabel={data.built} level={2} eager={i < 3} />
              ))}
            </ul>
            <Pager page={data.page} pageCount={data.pageCount} labels={data.pager} />
          </div>
        </div>
      )}
    </section>
  );
}
