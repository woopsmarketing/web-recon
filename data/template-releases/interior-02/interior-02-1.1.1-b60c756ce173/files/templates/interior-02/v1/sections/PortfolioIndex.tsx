import { ProjectCard } from "../components/ui/ProjectCard";
import { PortfolioBrowser } from "../components/portfolio/PortfolioBrowser";
import { Pager } from "../components/portfolio/Pager";
import type { PortfolioBrowserData } from "../components/portfolio/types";
import type { ProjectCardModel } from "../lib/projects";

/**
 * portfolio.index — the project list (/portfolio = page 1, /portfolio/page/n).
 *   portfolioIndexTitle(ctx)         the page title slot            } sections/portfolioIndexData.ts (kept out of this
 *   portfolioIndex(ctx, page)        build-time data; undefined     } file: the component is part of a runtime slot,
 *                                    when the page does not exist   } i.e. browser code)
 *   <PortfolioIndex data={…} />      the section
 * The server HTML is always the static page (crawlable cards + pager). With filters enabled the
 * browser island (components/portfolio/PortfolioBrowser) takes over after hydration: sidebar /
 * off-canvas panel, in-place filtering, sort, search, batch reveal instead of the pager.
 */
export interface PortfolioIndexData {
  title: string;
  page: number;
  pageCount: number;
  cards: ProjectCardModel[];
  withheld?: string;
  built?: string;
  pager: { nav: string; page: string; previous: string; next: string };
  /** undefined = filters turned off by the site (plain list) */
  browser?: PortfolioBrowserData;
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
