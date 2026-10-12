import type { ProjectFilterRecord, ProjectFilterVocabulary, ProjectSort } from "@platform/content/project-filter";
import type { ProjectCardModel } from "../../lib/projects";

/**
 * One entry of the compact PUBLIC project index embedded in /portfolio: the canonical filter
 * record (what filtering / sorting / search may read) plus exactly what a card renders. Built
 * from served projects only. Never: body, gallery, customer quote, period, placement flags.
 */
export interface ProjectIndexEntry extends ProjectFilterRecord {
  card: ProjectCardModel;
}

export interface PortfolioBrowserLabels {
  filter: string;
  filterHint: string;
  openFilters: string;
  closeFilters: string;
  search: string;
  searchPlaceholder: string;
  type: string;
  area: string;
  style: string;
  price: string;
  reset: string;
  apply: string;
  selectedFilters: string;
  sort: string;
  sorts: Record<ProjectSort, string>;
  count: { one: string; other: string };
  emptyTitle: string;
  emptyBody: string;
  withheld?: string;
  built?: string;
  pagination: { nav: string; page: string; previous: string; next: string };
}

export interface PortfolioBrowserData {
  /** the page title (the ≤ 1024 filter panel names itself "<title> <filter>") */
  title: string;
  entries: ProjectIndexEntry[];
  vocabulary: ProjectFilterVocabulary;
  /** category id → badge tone, for the dots of the type group (category order index mod 3) */
  tones: Record<string, "yellow" | "mint" | "navy">;
  labels: PortfolioBrowserLabels;
  /** the static route's own page (server-rendered, crawlable) */
  page: number;
  pageSize: number;
  pageCount: number;
  total: number;
  batchSize: number;
  /** public builds mark filtered views noindex (preview builds are noindex already) */
  noindexFiltered: boolean;
}
