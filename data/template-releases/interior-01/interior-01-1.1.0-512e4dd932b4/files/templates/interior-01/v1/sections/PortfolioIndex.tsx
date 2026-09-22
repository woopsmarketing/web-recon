import { ProjectCard, type ProjectCardProps } from "../components/ProjectCard";
import { Pagination, type PaginationProps } from "../components/Pagination";
import { PORTFOLIO_PAGE_SIZE } from "../template";
import { projectCards } from "./projectCards";
import type { Ctx } from "./types";

export interface PortfolioIndexData {
  title: string;
  description?: string[];
  hero?: { src: string; width: number; height: number; alt: string };
  page: number;
  pageCount: number;
  total: number;
  cards: ProjectCardProps[];
  pagination: PaginationProps;
}

/** URL of list page n: page 1 is the list root, never "/portfolio/page/1". */
export function portfolioPageHref(n: number): string {
  return n === 1 ? "/portfolio" : `/portfolio/page/${n}`;
}

/**
 * portfolio.index — one OFFSET page of ALL served projects in the default (latest) order.
 * Returns undefined for a page that does not exist (the route then 404s).
 */
export function portfolioIndex(ctx: Ctx, page: number): PortfolioIndexData | undefined {
  const result = ctx.content.paginate({ type: "projects", selection: { mode: "latest" } }, { page, pageSize: PORTFOLIO_PAGE_SIZE });
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
    cards: projectCards(ctx, result.items, { level: 2, eagerCount: 3, withSummary: true }),
    pagination: {
      page: result.page,
      pageCount: result.pageCount,
      hrefs: Array.from({ length: result.pageCount }, (_, i) => portfolioPageHref(i + 1)),
      labels: { nav: text("paginationLabel"), previous: text("previousLabel"), next: text("nextLabel"), page: text("pageLabel") },
    },
  };
}

/** Page title used in <title>: unique per list page. */
export function portfolioIndexTitle(ctx: Ctx, page: number): string {
  const title = ctx.slots.text("portfolio.index", "title") ?? "";
  const pageLabel = ctx.slots.text("portfolio.index", "pageLabel") ?? "";
  const base = page > 1 ? `${title} — ${pageLabel} ${page}` : title;
  return `${base} | ${ctx.identity.brandName}`;
}

export function PortfolioIndex({ data }: { data: PortfolioIndexData }) {
  return (
    <section className="i1-plist" data-section="portfolio.index" data-page-number={data.page} aria-labelledby="i1-plist-title">
      {data.hero ? (
        <div className="i1-plist__hero">
          <img src={data.hero.src} width={data.hero.width} height={data.hero.height} alt={data.hero.alt} loading="eager" />
        </div>
      ) : null}
      <div className="i1-container">
        <header className="i1-plist__head">
          <h1 id="i1-plist-title" className="i1-plist__title">
            {data.title}
          </h1>
          {data.description ? (
            <div className="i1-plist__intro">
              {data.description.map((p, i) => (
                <p key={i}>{p}</p>
              ))}
            </div>
          ) : null}
        </header>
        <ul className="i1-plist__grid">
          {data.cards.map((card) => (
            <ProjectCard key={card.id} {...card} />
          ))}
        </ul>
        <Pagination {...data.pagination} />
      </div>
    </section>
  );
}
