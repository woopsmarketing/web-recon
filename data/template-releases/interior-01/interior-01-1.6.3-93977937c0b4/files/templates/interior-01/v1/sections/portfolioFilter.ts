import {
  buildProjectFilterVocabulary,
  toProjectFilterRecord,
  type ProjectFilterRecord,
  type ProjectFilterVocabulary,
  type ProjectSort,
} from "@platform/content/project-filter";
import { projectHref } from "./projectCards";
import type { Ctx } from "./types";

/**
 * One entry of the compact PUBLIC project index shipped to /portfolio: the canonical
 * filter record (filter + sort + keyword fields) plus exactly what a card renders.
 * Built from served projects only (the ContentReader never returns drafts/scheduled in a
 * public build). Never: body, gallery, customer quote, period, builtYear, placement flags.
 */
export interface ProjectIndexEntry extends ProjectFilterRecord {
  href: string;
  categoryLabel?: string;
  cover: { src: string; width: number; height: number; alt: string };
}

export interface PortfolioFilterLabels {
  filter: string;
  search: string;
  searchPlaceholder: string;
  type: string;
  area: string;
  style: string;
  price: string;
  sort: string;
  sorts: Record<ProjectSort, string>;
  reset: string;
  count: { one: string; other: string };
  emptyTitle: string;
  emptyBody: string;
}

export interface PortfolioFilterData {
  entries: ProjectIndexEntry[];
  vocabulary: ProjectFilterVocabulary;
  labels: PortfolioFilterLabels;
  /** public builds mark filtered views noindex (preview builds are noindex already) */
  noindexFiltered: boolean;
}

/** Build-time shaping of the filter island's data; undefined when the site turned filters off. */
export function portfolioFilterData(ctx: Ctx): PortfolioFilterData | undefined {
  const settings = ctx.settings["portfolio.index"];
  if (!settings.filtersEnabled) return undefined;
  const projects = ctx.content.list({ type: "projects", selection: { mode: "latest" }, limit: Number.MAX_SAFE_INTEGER }).items;
  if (projects.length === 0) return undefined;
  const categories = ctx.content.list({ type: "categories" }).items;
  const categoryName = new Map(categories.map((c) => [c.id, c.name]));
  const entries = projects.map((p): ProjectIndexEntry => {
    const label = categoryName.get(p.category);
    return {
      ...toProjectFilterRecord(p),
      href: projectHref(p),
      ...(label !== undefined ? { categoryLabel: label } : {}),
      cover: { ...ctx.assets.resolve(p.cover.asset), alt: p.cover.alt ?? "" },
    };
  });
  const vocabulary = buildProjectFilterVocabulary(entries, {
    groups: settings.filterGroups,
    categories,
    areaScale: settings.areaScale,
    priceScale: settings.priceScale,
  });
  // Ship only fields the site's filters/sorts can read: no price scale → no price data.
  if (!vocabulary.price) for (const e of entries) delete e.pricePerArea;
  const t = (key: Parameters<Ctx["slots"]["text"]>[1]) => ctx.slots.text("portfolio.index", key) ?? "";
  return {
    entries,
    vocabulary,
    labels: {
      filter: t("filterLabel"),
      search: t("searchLabel"),
      searchPlaceholder: t("searchPlaceholder"),
      type: t("typeLabel"),
      area: t("areaLabel"),
      style: t("styleLabel"),
      price: t("priceLabel"),
      sort: t("sortLabel"),
      sorts: {
        newest: t("sortNewest"),
        oldest: t("sortOldest"),
        "area-desc": t("sortAreaDesc"),
        "area-asc": t("sortAreaAsc"),
        "price-desc": t("sortPriceDesc"),
        "price-asc": t("sortPriceAsc"),
      },
      reset: t("resetLabel"),
      count: { one: t("resultCountFormatOne"), other: t("resultCountFormat") },
      emptyTitle: t("emptyTitle"),
      emptyBody: t("emptyBody"),
    },
    noindexFiltered: ctx.mode === "public",
  };
}
