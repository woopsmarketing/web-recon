import { foldText, normalizeKeyword } from "@platform/content/project-filter";

/**
 * /portfolio query string ⇄ list view state (pure; used by the list component).
 *   ?category=<id>   one category tab (an id without a tab = "All")
 *   ?q=<text>        title search (case-insensitive substring; whitespace-normalised)
 *   ?page=<n>        client-side page of a FILTERED list (omitted on page 1; never while static)
 * The static state (no category, no text) is the server-rendered page of the route itself.
 */
export const LIST_PARAM = { category: "category", q: "q", page: "page" } as const;

export interface ListState {
  category: string | undefined;
  q: string;
  /** 1-based page of the filtered list; 1 while static */
  page: number;
}

export const STATIC_STATE: Readonly<ListState> = { category: undefined, q: "", page: 1 };

export function isStaticState(s: ListState): boolean {
  return s.category === undefined && s.q === "";
}

/** Query → state for this build's tabs: an unknown category and a bad page are dropped. */
export function queryToState(query: URLSearchParams, categoryIds: ReadonlySet<string>): ListState {
  const rawCategory = query.get(LIST_PARAM.category);
  const category = rawCategory !== null && categoryIds.has(rawCategory) ? rawCategory : undefined;
  const q = normalizeKeyword(query.get(LIST_PARAM.q) ?? "");
  const rawPage = query.get(LIST_PARAM.page);
  const n = rawPage === null ? 1 : Number(rawPage);
  const page = Number.isInteger(n) && n >= 1 ? n : 1;
  const state: ListState = { category, q, page };
  if (isStaticState(state)) state.page = 1;
  return state;
}

/** Canonical query (fixed parameter order) of a state; "" for the static state. */
export function stateToQuery(s: ListState): string {
  const query = new URLSearchParams();
  if (s.category !== undefined) query.set(LIST_PARAM.category, s.category);
  if (s.q) query.set(LIST_PARAM.q, s.q);
  if (!isStaticState(s) && s.page > 1) query.set(LIST_PARAM.page, String(s.page));
  return query.toString();
}

/** The entries a state selects (input order kept): category match AND title contains the text. */
export function matchesState<T extends { category: string; title: string }>(items: readonly T[], s: ListState): T[] {
  const needle = foldText(s.q);
  return items.filter((it) => (s.category === undefined || it.category === s.category) && (needle === "" || foldText(it.title).includes(needle)));
}
