import { DEFAULT_PROJECT_SORT, normalizeProjectFilter, type ProjectFilter, type ProjectFilterVocabulary } from "@platform/content/project-filter";

/**
 * /portfolio query string ⇄ ProjectFilter. Parameter names are template-owned; multi-values
 * repeat the key (?style=a&style=b). Parsing goes through normalizeProjectFilter, so unknown or
 * unavailable values are dropped. There is no page parameter: with script the list reveals
 * further cards in batches, the static /portfolio/page/[n] routes own the no-script paging.
 *   keyword · type · area · style · price · sort (omitted = default)
 */
export const FILTER_PARAM = { keyword: "keyword", type: "type", area: "area", style: "style", price: "price", sort: "sort" } as const;

/** Canonical query (fixed parameter + value order) for a filter; "" for the default view. */
export function filterToQuery(filter: ProjectFilter): string {
  const q = new URLSearchParams();
  if (filter.keyword) q.append(FILTER_PARAM.keyword, filter.keyword);
  for (const v of filter.type) q.append(FILTER_PARAM.type, v);
  for (const v of filter.area) q.append(FILTER_PARAM.area, v);
  for (const v of filter.style) q.append(FILTER_PARAM.style, v);
  for (const v of filter.price) q.append(FILTER_PARAM.price, v);
  if (filter.sort !== DEFAULT_PROJECT_SORT) q.append(FILTER_PARAM.sort, filter.sort);
  return q.toString();
}

/** Query → normalized filter for this vocabulary. */
export function queryToFilter(q: URLSearchParams, vocab: ProjectFilterVocabulary): ProjectFilter {
  return normalizeProjectFilter(
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
}
