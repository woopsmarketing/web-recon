"use client";

import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import {
  activeCriteriaCount,
  EMPTY_PROJECT_FILTER,
  evaluateProjectFilter,
  isDefaultProjectFilter,
  normalizeProjectFilter,
  pageOfResults,
  type FilterBucket,
  type ProjectFilter,
} from "@platform/content/project-filter";
import { onHistoryChange, readQuery, writeQuery } from "@platform/site/browser";
import { ProjectCard, type ProjectCardProps } from "./ProjectCard";
import { Pagination, type PaginationProps } from "./Pagination";
import { filterToQuery, queryToFilter } from "../lib/filterQuery";
import { formatCount } from "../lib/format";
import type { PortfolioFilterData, ProjectIndexEntry } from "../sections/portfolioFilter";

export interface PortfolioBrowserProps {
  filter: PortfolioFilterData;
  pageSize: number;
  /** The static route's own page 1 (server-rendered, crawlable) = the unfiltered view. */
  initial: { cards: ProjectCardProps[]; pagination: PaginationProps; total: number };
}

type ListKey = "type" | "area" | "style" | "price";

/** The canonical list route that owns filter state (route "portfolio.index"). */
const LIST_PATH = "/portfolio";

/**
 * /portfolio filter island. Owns ONLY view state (current filter + filtered page) and
 * its URL sync; every filtering/sorting rule comes from @platform/content/project-filter.
 *
 *  - default (unfiltered) view = exactly the server-rendered static page 1 + its route pager
 *  - filtered view = the pure evaluator over the compact published index, paged client-side
 *  - URL: ?keyword&type&area&style&price&sort&fp (history entries; back/forward restore)
 */
export function PortfolioBrowser({ filter: data, pageSize, initial }: PortfolioBrowserProps) {
  const { entries, vocabulary: vocab, labels } = data;
  const [view, setView] = useState<{ filter: ProjectFilter; page: number }>({ filter: EMPTY_PROJECT_FILTER, page: 1 });
  const [keywordInput, setKeywordInput] = useState("");
  const [panelOpen, setPanelOpen] = useState(false);
  const resultsRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const countRef = useRef<HTMLParagraphElement>(null);
  const uid = useId();

  // Direct load + back/forward: the URL is the source of truth for the view.
  useEffect(() => {
    const sync = () => {
      const query = readQuery();
      const next = queryToFilter(query, vocab);
      setView(next);
      setKeywordInput(next.filter.keyword);
      // A stale/unknown value was dropped: show the view's canonical URL (no new history entry).
      const canonical = filterToQuery(next.filter, next.page);
      if (canonical !== query.toString()) writeQuery(canonical, { push: false });
    };
    sync();
    return onHistoryChange(sync);
  }, [vocab]);

  /** Apply a new filter: normalized, back to filtered page 1, URL updated (push = new history entry). */
  const apply = (input: ProjectFilter, push: boolean) => {
    const filter = normalizeProjectFilter(input, vocab);
    setView({ filter, page: 1 });
    writeQuery(filterToQuery(filter, 1), { push });
  };
  const toggle = (key: ListKey, value: string) => {
    const current = view.filter[key];
    const next = current.includes(value) ? current.filter((v) => v !== value) : [...current, value];
    apply({ ...view.filter, [key]: next }, true);
  };
  const onKeyword = (raw: string) => {
    setKeywordInput(raw);
    // First keystroke starts a history entry; further typing refines it in place.
    apply({ ...view.filter, keyword: raw }, view.filter.keyword === "");
  };
  const reset = () => {
    setKeywordInput("");
    apply(EMPTY_PROJECT_FILTER, true);
    // the reset buttons unmount with the filtered view: keep keyboard focus in the controls
    (searchRef.current ?? countRef.current)?.focus();
  };
  const goToPage = (n: number) => {
    setView((v) => ({ ...v, page: n }));
    writeQuery(filterToQuery(view.filter, n), { push: true });
    resultsRef.current?.scrollIntoView({ block: "start" });
  };

  const filtered = !isDefaultProjectFilter(view.filter);
  const results = filtered ? pageOfResults(evaluateProjectFilter(entries, view.filter, vocab), view.page, pageSize) : undefined;
  const count = results ? results.total : initial.total;
  const active = activeCriteriaCount(view.filter);
  const on = new Set(vocab.groups);
  const hasChips = vocab.groups.some((g) => g !== "keyword");
  const panelId = `${uid}-panel`;

  // An out-of-range filtered page (e.g. a stale shared ?fp=99) is shown clamped: say so in the URL too.
  const shownPage = results?.page;
  useEffect(() => {
    if (shownPage === undefined || shownPage === view.page) return;
    setView((v) => ({ ...v, page: shownPage }));
    writeQuery(filterToQuery(view.filter, shownPage), { push: false });
  }, [shownPage, view.page, view.filter]);

  const chips = (key: ListKey, legend: string, options: { value: string; label: string }[]) =>
    options.length === 0 ? null : (
      <fieldset className="i1-pfilter__group" data-filter-group={key}>
        <legend className="i1-pfilter__legend">{legend}</legend>
        <div className="i1-pfilter__chips">
          {options.map((o) => (
            <label key={o.value} className="i1-chip">
              <input
                type="checkbox"
                className="i1-chip__input"
                name={key}
                value={o.value}
                checked={view.filter[key].includes(o.value)}
                onChange={() => toggle(key, o.value)}
              />
              <span className="i1-chip__label">{o.label}</span>
            </label>
          ))}
        </div>
      </fieldset>
    );
  const buckets = (b: readonly FilterBucket[] | undefined) => (b ?? []).map((x) => ({ value: x.id, label: x.label }));

  let body: ReactNode;
  if (!results) {
    body = (
      <>
        <ul className="i1-plist__grid">
          {initial.cards.map((card) => (
            <ProjectCard key={card.id} {...card} />
          ))}
        </ul>
        <Pagination {...initial.pagination} />
      </>
    );
  } else if (results.total === 0) {
    body = (
      <div className="i1-pfilter__empty" data-filter-empty="">
        <h2 className="i1-pfilter__empty-title">{labels.emptyTitle}</h2>
        <p className="i1-pfilter__empty-body">{labels.emptyBody}</p>
        <button type="button" className="i1-pfilter__reset is-primary" onClick={reset}>
          {labels.reset}
        </button>
      </div>
    );
  } else {
    body = (
      <>
        <ul className="i1-plist__grid">
          {results.items.map((e, i) => (
            <ProjectCard key={e.id} {...entryCard(e, i)} />
          ))}
        </ul>
        <Pagination
          page={results.page}
          pageCount={results.pageCount}
          hrefs={Array.from({ length: results.pageCount }, (_, i) => `${LIST_PATH}?${filterToQuery(view.filter, i + 1)}`)}
          labels={initial.pagination.labels}
          onPage={goToPage}
        />
      </>
    );
  }

  return (
    <div className="i1-pbrowse" data-filtered={filtered ? "true" : "false"}>
      {/* Filtered views are client state over /portfolio: never an indexable duplicate page. */}
      {filtered && data.noindexFiltered ? <meta name="robots" content="noindex, follow" /> : null}
      <div className="i1-pfilter" data-filter="">
        <div className="i1-pfilter__bar">
          {on.has("keyword") ? (
            <form className="i1-pfilter__search" role="search" onSubmit={(e) => e.preventDefault()}>
              <label htmlFor={`${uid}-q`} className="i1-sr">
                {labels.search}
              </label>
              <input
                ref={searchRef}
                id={`${uid}-q`}
                type="search"
                className="i1-pfilter__input"
                name="keyword"
                placeholder={labels.searchPlaceholder}
                autoComplete="off"
                enterKeyHint="search"
                value={keywordInput}
                onChange={(e) => onKeyword(e.target.value)}
              />
            </form>
          ) : null}
          {hasChips ? (
            <button
              type="button"
              className="i1-pfilter__toggle"
              aria-expanded={panelOpen}
              aria-controls={panelId}
              onClick={() => setPanelOpen((o) => !o)}
            >
              {labels.filter}
              {active > 0 ? <span className="i1-pfilter__badge"> ({active})</span> : null}
            </button>
          ) : null}
        </div>
        {hasChips ? (
          <div id={panelId} className="i1-pfilter__panel" data-open={panelOpen ? "" : undefined}>
            {chips("type", labels.type, vocab.types.map((t) => ({ value: t.id, label: t.label })))}
            {chips("area", labels.area, buckets(vocab.area?.buckets))}
            {chips("style", labels.style, vocab.styles.map((s) => ({ value: s, label: s })))}
            {chips("price", labels.price, buckets(vocab.price?.buckets))}
          </div>
        ) : null}
        <div className="i1-pfilter__status">
          <p ref={countRef} tabIndex={-1} className="i1-pfilter__count" aria-live="polite" data-result-count={count}>
            {formatCount(labels.count, count)}
          </p>
          <div className="i1-pfilter__actions">
            {active > 0 || view.filter.sort !== EMPTY_PROJECT_FILTER.sort ? (
              <button type="button" className="i1-pfilter__reset" onClick={reset}>
                {labels.reset}
              </button>
            ) : null}
            <label className="i1-pfilter__sort">
              <span className="i1-pfilter__sort-label">{labels.sort}</span>
              <select
                className="i1-pfilter__select"
                name="sort"
                value={view.filter.sort}
                onChange={(e) => apply({ ...view.filter, sort: e.target.value as ProjectFilter["sort"] }, true)}
              >
                {vocab.sorts.map((s) => (
                  <option key={s} value={s}>
                    {labels.sorts[s]}
                  </option>
                ))}
              </select>
            </label>
          </div>
        </div>
      </div>
      <div ref={resultsRef} className="i1-pbrowse__results" data-filter-page={results ? results.page : undefined}>
        {body}
      </div>
    </div>
  );
}

/** index entry → card props (same card component and fields as the static list). */
function entryCard(e: ProjectIndexEntry, index: number): ProjectCardProps {
  return {
    id: e.id,
    title: e.title,
    href: e.href,
    summary: e.summary,
    category: e.categoryLabel,
    cover: e.cover,
    eager: index < 3,
    level: 2,
  };
}
