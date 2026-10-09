import { PortfolioBrowser } from "../components/portfolio/PortfolioBrowser";
import type { PortfolioListData } from "../components/portfolio/types";

/**
 * portfolio.index — the project list (/portfolio = page 1, /portfolio/page/n).
 *   <PortfolioIndex data={…} />      the section; its data is built by sections/portfolioIndexData.ts
 *                                    (a runtime slot: runtime/portfolio.ts)
 * The server HTML is always the static page (banner, tab strip, title, count, 18 cards, pager
 * links, search row); the list component (components/portfolio/PortfolioBrowser) filters in
 * place after hydration over every served project's card model.
 */
export function PortfolioIndex({ data }: { data: PortfolioListData }) {
  return <PortfolioBrowser data={data} />;
}
