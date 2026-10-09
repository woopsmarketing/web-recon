import { ProjectCard } from "../components/ProjectCard";
import { Pagination } from "../components/Pagination";
import { PortfolioBrowser } from "../components/PortfolioBrowser";
import type { PortfolioIndexData } from "./portfolioIndexData";

// 1.7.0: markup only — the data function moved to portfolioIndexData.ts; the filter island's data
// and the page size arrive in `data` (no output change).

/**
 * `data.filter` (page 1 = /portfolio only): the filter island wraps the SAME static page-1 cards
 * and route pager as its unfiltered view; paged routes render the plain static list. A list with
 * no project at all (a composed site with nothing published) is its heading and nothing under it.
 */
export function PortfolioIndex({ data }: { data: PortfolioIndexData }) {
  const { filter } = data;
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
        {filter ? (
          <PortfolioBrowser
            filter={filter}
            pageSize={data.pageSize}
            initial={{ cards: data.cards, pagination: data.pagination, total: data.total }}
          />
        ) : data.cards.length === 0 ? null : (
          <>
            <ul className="i1-plist__grid">
              {data.cards.map((card) => (
                <ProjectCard key={card.id} {...card} />
              ))}
            </ul>
            <Pagination {...data.pagination} />
          </>
        )}
      </div>
    </section>
  );
}
