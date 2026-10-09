import type { Media } from "../../lib/media";
import type { ProjectCardModel } from "../../lib/projects";

/**
 * Build-time data of the project list, as the server section hands it to the list component
 * (components/portfolio/PortfolioBrowser). Every served project's card model is embedded so the
 * tab strip and the search filter in place; nothing beyond what a card renders leaves the build.
 */
export interface PortfolioTab {
  /** category id (the `?category=` value) */
  id: string;
  label: string;
}

export interface PagerLabels {
  nav: string;
  /** "{n}" = the page number */
  page: string;
  prev: string;
  next: string;
}

export interface PortfolioListLabels {
  title: string;
  lead?: string;
  visualText?: string;
  tabs: string;
  all: string;
  /** "{count}" = projects in the current selection */
  count: string;
  /** undefined = the search row is turned off by the site */
  search?: { label: string; placeholder?: string; button: string };
  empty: string;
  pager: PagerLabels;
}

export interface PortfolioListData {
  visual?: Media;
  labels: PortfolioListLabels;
  /** categories with at least one served project, taxonomy order */
  tabs: PortfolioTab[];
  /** every served project, latest first */
  entries: ProjectCardModel[];
  /** the static route's own page */
  page: number;
  pageSize: number;
  pageCount: number;
  total: number;
  /** /portfolio/page/n exists in this build (links to it are allowed) */
  pagedRoute: boolean;
  /** public builds mark filtered views noindex (preview builds are noindex already) */
  noindexFiltered: boolean;
}
