"use client";

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { normalizeKeyword, pageOfResults } from "@platform/content/project-filter";
import { onHistoryChange, readQuery, writeQuery } from "@platform/site/browser";
import { useSlotId } from "../runtime/context";
import { Lnb, type LnbItem } from "../ui/Lnb";
import { PageTitle } from "../ui/PageTitle";
import { ProjectCard } from "../ui/ProjectCard";
import { SubVisual } from "../ui/SubVisual";
import { Pager, pageHref } from "./Pager";
import { SearchBox } from "./SearchBox";
import { isStaticState, matchesState, queryToState, stateToQuery, STATIC_STATE, type ListState } from "./listQuery";
import type { PortfolioListData } from "./types";

/** Tab key of "All" (not a record id, so it can never collide with a category id). */
const ALL_KEY = "*";

/**
 * The project list (portfolio.index): banner · tab strip · page title · count line · the thumbnail
 * grid · pager · search row. One component renders the static page AND enhances it in place:
 *   - server HTML / before hydration = the route's own page (cards page n of the latest order,
 *     the pager as links to /portfolio and /portfolio/page/n) — works without script
 *   - after hydration the URL is the view state (components/portfolio/listQuery): a category tab
 *     (?category) and the title search (?q) filter the embedded card models in place, in pages of
 *     `pageSize` (?page) with a button pager; the banner title and the page title become the
 *     category name; clearing both returns to the static state. Back/forward restore the view; a
 *     stale value in the URL is dropped and the canonical query written (no new entry).
 *   - the count line is a polite live region and takes focus after a client-side page change
 */
export function PortfolioBrowser({ data }: { data: PortfolioListData }) {
  const { labels, tabs, entries, pageSize } = data;
  const [state, setState] = useState<ListState>(STATIC_STATE);
  const [input, setInput] = useState("");
  // false in the server HTML and the first client render; true once the URL has been read
  const [ready, setReady] = useState(false);
  const countRef = useRef<HTMLParagraphElement>(null);
  const focusCount = useRef(false);
  // React's id in an ordinary build; a fixed one on a composed page (components/runtime/context)
  const searchId = `${useSlotId("browser")}-q`;
  const categoryIds = useMemo(() => new Set(tabs.map((t) => t.id)), [tabs]);

  // Direct load + back/forward: the URL decides the view.
  useEffect(() => {
    const sync = () => {
      const next = queryToState(readQuery(), categoryIds);
      setState(next);
      setInput(next.q);
    };
    sync();
    setReady(true);
    return onHistoryChange(sync);
  }, [categoryIds]);

  const isStatic = isStaticState(state);
  const result = isStatic
    ? { items: entries.slice((data.page - 1) * pageSize, data.page * pageSize), page: data.page, pageCount: data.pageCount, total: data.total }
    : pageOfResults(matchesState(entries, state), state.page, pageSize);
  const effective: ListState = isStatic ? state : { ...state, page: result.page };
  const selectedTab = state.category !== undefined ? tabs.find((t) => t.id === state.category) : undefined;
  const title = selectedTab ? selectedTab.label : labels.title;

  // A page beyond the filtered list, an unknown category or a stray parameter: show the canonical URL.
  useEffect(() => {
    if (!ready) return;
    const canonical = stateToQuery(effective);
    if (canonical !== readQuery().toString()) writeQuery(canonical, { push: false });
  }, [ready, effective.category, effective.q, effective.page]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!focusCount.current) return;
    focusCount.current = false;
    countRef.current?.focus();
  });

  /** A new view: state + URL (push = a history entry of a discrete choice). */
  const apply = (next: ListState, push: boolean) => {
    setState(next);
    writeQuery(stateToQuery(next), { push });
  };
  const selectTab = (key: string) => apply({ category: key === ALL_KEY ? undefined : key, q: state.q, page: 1 }, true);
  const submitSearch = () => apply({ category: state.category, q: normalizeKeyword(input), page: 1 }, true);
  const changeInput = (value: string) => {
    setInput(value);
    // an emptied field clears the search at once (the field's own clear control has no submit)
    if (value === "" && state.q !== "") apply({ category: state.category, q: "", page: 1 }, true);
  };
  const selectPage = (n: number) => {
    focusCount.current = true;
    apply({ ...state, page: n }, true);
  };

  const tabItems: LnbItem[] = [{ key: ALL_KEY, label: labels.all, selected: state.category === undefined }, ...tabs.map((t) => ({ key: t.id, label: t.label, selected: state.category === t.id }))];

  let pager: ReactNode = null;
  if (result.pageCount > 1) {
    if (!isStatic) pager = <Pager page={result.page} pageCount={result.pageCount} labels={labels.pager} onSelect={selectPage} />;
    else if (data.pagedRoute) pager = <Pager page={result.page} pageCount={result.pageCount} labels={labels.pager} />;
  }

  return (
    <div className="i3-plist" data-section="portfolio.index" data-filtered={isStatic ? "false" : "true"} data-ready={ready ? "true" : "false"}>
      {/* Filtered views are client state over the list route: never an indexable duplicate page. */}
      {!isStatic && data.noindexFiltered ? <meta name="robots" content="noindex, follow" /> : null}
      <SubVisual title={title} text={labels.visualText} media={data.visual} />
      <Lnb label={labels.tabs} items={tabItems} onSelect={selectTab} />
      <div className="i3-content">
        <div className="i3-wrap">
          <PageTitle title={title} lead={labels.lead} />
          <div className="i3-page i3-gallery" data-gallery="">
            <p ref={countRef} tabIndex={-1} className="i3-gallery__count" aria-live="polite" data-result-count={result.total}>
              {countNode(labels.count, result.total)}
            </p>
            {result.items.length > 0 ? (
              <ul className="i3-cards i3-cards--list" data-shown={result.items.length}>
                {result.items.map((m, i) => (
                  <ProjectCard key={m.id} model={m} level={2} eager={i < 3} />
                ))}
              </ul>
            ) : (
              <p className="i3-gallery__empty" data-list-empty="">
                {labels.empty}
              </p>
            )}
            {pager}
            {labels.search ? (
              <SearchBox
                id={searchId}
                label={labels.search.label}
                placeholder={labels.search.placeholder}
                buttonLabel={labels.search.button}
                value={input}
                onChange={changeInput}
                onSubmit={submitSearch}
                action={pageHref(1)}
              />
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}

/** "{count}" slot format with the figure in a <strong>; a format without it gets the figure first. */
function countNode(format: string, n: number): ReactNode {
  const i = format.indexOf("{count}");
  if (i < 0)
    return (
      <>
        <strong>{n}</strong> {format}
      </>
    );
  return (
    <>
      {format.slice(0, i)}
      <strong>{n}</strong>
      {format.slice(i + "{count}".length)}
    </>
  );
}
