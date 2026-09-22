import {
  DEFAULT_PROJECT_SORT,
  isDefaultProjectFilter,
  normalizeProjectFilter,
  type ProjectFilter,
  type ProjectFilterVocabulary,
} from "@platform/content/project-filter";

/**
 * /portfolio query string ⇄ ProjectFilter (+ filtered result page).
 * Parameter names are Template-owned (never source API names); multi-values repeat the
 * key (?style=a&style=b), so option values need no escaping rules of their own.
 * Parsing goes through normalizeProjectFilter: unknown/unavailable values are dropped.
 *
 *   keyword · type · area · style · price · sort (omitted = default) · fp (filtered page, omitted = 1)
 */
export const FILTER_PARAM = {
  keyword: "keyword",
  type: "type",
  area: "area",
  style: "style",
  price: "price",
  sort: "sort",
  page: "fp",
} as const;

/** Canonical query (fixed parameter + value order) for a filter view; "" for the default view. */
export function filterToQuery(filter: ProjectFilter, page: number): string {
  const q = new URLSearchParams();
  if (filter.keyword) q.append(FILTER_PARAM.keyword, filter.keyword);
  for (const v of filter.type) q.append(FILTER_PARAM.type, v);
  for (const v of filter.area) q.append(FILTER_PARAM.area, v);
  for (const v of filter.style) q.append(FILTER_PARAM.style, v);
  for (const v of filter.price) q.append(FILTER_PARAM.price, v);
  if (filter.sort !== DEFAULT_PROJECT_SORT) q.append(FILTER_PARAM.sort, filter.sort);
  // Page 1 is never written; the default view has no filtered pages (static routes own paging).
  if (page > 1 && !isDefaultProjectFilter(filter)) q.append(FILTER_PARAM.page, String(page));
  return q.toString();
}

/** Query → normalized filter + requested filtered page (clamped later against the result count). */
export function queryToFilter(q: URLSearchParams, vocab: ProjectFilterVocabulary): { filter: ProjectFilter; page: number } {
  const filter = normalizeProjectFilter(
    {
      keyword: q.get(FILTER_PARAM.keyword) ?? "",
      type: q.getAll(FILTER_PARAM.type),
      area: q.getAll(FILTER_PARAM.area),
      style: q.getAll(FILTER_PARAM.style),
      price: q.getAll(FILTER_PARAM.price),
      sort: q.get(FILTER_PARAM.sort) ?? undefined,
    },
    vocab,
  );
  const raw = q.get(FILTER_PARAM.page);
  const page = raw !== null && /^[1-9]\d{0,4}$/.test(raw) && !isDefaultProjectFilter(filter) ? Number(raw) : 1;
  return { filter, page };
}
