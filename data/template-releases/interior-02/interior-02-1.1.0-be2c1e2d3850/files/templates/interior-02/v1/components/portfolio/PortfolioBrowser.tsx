"use client";

import { useEffect, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { useSlotId } from "../runtime/context";
import {
  activeCriteriaCount,
  EMPTY_PROJECT_FILTER,
  evaluateProjectFilter,
  isDefaultProjectFilter,
  normalizeProjectFilter,
  type FilterBucket,
  type ProjectFilter,
  type ProjectSort,
} from "@platform/content/project-filter";
import { onHistoryChange, readQuery, writeQuery } from "@platform/site/browser";
import { ProjectCard } from "../ui/ProjectCard";
import { Icon } from "../ui/Icon";
import { PortfolioIcon } from "./PortfolioIcons";
import { Pager } from "./Pager";
import { filterToQuery, queryToFilter } from "./filterQuery";
import type { PortfolioBrowserData } from "./types";

type ListKey = "type" | "area" | "style" | "price";

/**
 * /portfolio browser island. Owns ONLY view state (current filter, how many cards are revealed,
 * the ≤ 1024 panel) and its URL sync; every filtering / sorting rule comes from
 * @platform/content/project-filter, every card is the shared ProjectCard.
 *
 *  - server HTML / before hydration = the static route's own page (page n of the "latest" order)
 *    + the crawlable pager (components/portfolio/Pager)
 *  - after hydration the pager goes and the grid grows by `batchSize` cards whenever its end
 *    (a sentinel after the grid) comes into view — IntersectionObserver over the embedded index,
 *    no network; a filter / sort / search is evaluated in place over the whole index
 *  - URL: ?keyword&type&area&style&price&sort (history entries; back/forward restore)
 *  - > 1024: the sidebar is pinned beside the grid; ≤ 1024 it is the off-canvas panel the fixed
 *    filter strip opens (slides in from the left; html scroll locked via :has in CSS; Escape
 *    closes; focus moves to the close button and back to the opener)
 */
export function PortfolioBrowser({ data }: { data: PortfolioBrowserData }) {
  const { title, entries, vocabulary: vocab, labels, tones, page, pageSize, pageCount, batchSize } = data;
  const [filter, setFilter] = useState<ProjectFilter>(EMPTY_PROJECT_FILTER);
  const [shown, setShown] = useState(pageSize);
  const [keywordInput, setKeywordInput] = useState("");
  const [panelOpen, setPanelOpen] = useState(false);
  // false in the server HTML and the first client render (pager shown); true once hydrated (batch reveal)
  const [ready, setReady] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);
  const openRef = useRef<HTMLButtonElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const countRef = useRef<HTMLParagraphElement>(null);
  const sentinelRef = useRef<HTMLDivElement>(null);
  const wasOpen = useRef(false);
  const uid = useSlotId("browser");
  const panelId = `${uid}-panel`;
  const searchId = `${uid}-q`;

  // Direct load + back/forward: the URL is the source of truth for the view.
  useEffect(() => {
    const sync = () => {
      const query = readQuery();
      const next = queryToFilter(query, vocab);
      setFilter(next);
      setKeywordInput(next.keyword);
      setShown(isDefaultProjectFilter(next) ? pageSize : batchSize);
      // A stale/unknown value was dropped: show the view's canonical URL (no new history entry).
      const canonical = filterToQuery(next);
      if (canonical !== query.toString()) writeQuery(canonical, { push: false });
    };
    sync();
    setReady(true);
    return onHistoryChange(sync);
  }, [vocab, pageSize, batchSize]);

  const isDefault = isDefaultProjectFilter(filter);
  const ordered = isDefault ? entries : evaluateProjectFilter(entries, filter, vocab);
  // the default view continues from the static page the visitor opened; a filtered view starts at 0
  const start = isDefault ? (page - 1) * pageSize : 0;
  const visible = ordered.slice(start, start + shown);
  const remaining = Math.max(0, ordered.length - start - visible.length);
  const count = ordered.length;
  const active = activeCriteriaCount(filter);
  const dirty = active > 0 || filter.sort !== EMPTY_PROJECT_FILTER.sort;

  // Batch reveal: a new observer per revealed batch, so its initial callback keeps revealing
  // while the sentinel is still in view (short pages), and stops when nothing remains.
  useEffect(() => {
    const el = sentinelRef.current;
    if (!ready || remaining <= 0 || !el || typeof IntersectionObserver === "undefined") return;
    // The root extends 240px below the viewport (reveal a little early) and far above it, so a
    // sentinel the viewport jumped past (End key, scrollbar drag, a tall footer) still counts as
    // reached instead of waiting for a crossing that never happens.
    const io = new IntersectionObserver(
      (hits) => {
        if (hits.some((h) => h.isIntersecting)) setShown((s) => s + batchSize);
      },
      { rootMargin: "100000px 0px 240px 0px" },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [ready, remaining, shown, batchSize]);

  // The panel: focus in on open, back to the opener on close; it cannot stay open above 1024.
  useEffect(() => {
    if (panelOpen) {
      wasOpen.current = true;
      closeRef.current?.focus();
    } else if (wasOpen.current) {
      wasOpen.current = false;
      openRef.current?.focus();
    }
  }, [panelOpen]);
  useEffect(() => {
    const mq = matchMedia("(max-width: 1024px)");
    const onChange = () => {
      if (!mq.matches) setPanelOpen(false);
    };
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);

  /** Apply a new filter: normalized, revealed count reset, URL updated (push = new history entry). */
  const apply = (input: ProjectFilter, push: boolean) => {
    const next = normalizeProjectFilter(input, vocab);
    setFilter(next);
    setShown(isDefaultProjectFilter(next) ? pageSize : batchSize);
    writeQuery(filterToQuery(next), { push });
  };
  const toggle = (key: ListKey, value: string) => {
    const current = filter[key];
    apply({ ...filter, [key]: current.includes(value) ? current.filter((v) => v !== value) : [...current, value] }, true);
  };
  const remove = (key: ListKey | "keyword", value: string) => {
    if (key === "keyword") {
      setKeywordInput("");
      apply({ ...filter, keyword: "" }, true);
    } else toggle(key, value);
  };
  const onKeyword = (raw: string) => {
    setKeywordInput(raw);
    // First keystroke starts a history entry; further typing refines it in place.
    apply({ ...filter, keyword: raw }, filter.keyword === "");
  };
  const reset = () => {
    setKeywordInput("");
    apply(EMPTY_PROJECT_FILTER, true);
  };
  const confirm = () => {
    if (panelOpen) setPanelOpen(false);
    else countRef.current?.focus();
  };
  const onPanelKey = (e: KeyboardEvent<HTMLDivElement>) => {
    if (!panelOpen) return;
    if (e.key === "Escape") {
      e.preventDefault();
      setPanelOpen(false);
      return;
    }
    if (e.key !== "Tab" || !panelRef.current) return;
    const nodes = Array.from(panelRef.current.querySelectorAll<HTMLElement>("a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex='-1'])")).filter(
      (el) => el.getClientRects().length > 0,
    );
    if (nodes.length === 0) return;
    const first = nodes[0]!;
    const last = nodes[nodes.length - 1]!;
    const current = document.activeElement;
    if (e.shiftKey && (current === first || !panelRef.current.contains(current))) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && current === last) {
      e.preventDefault();
      first.focus();
    }
  };

  const bucketLabel = (scale: { buckets: readonly FilterBucket[] } | undefined, id: string) => scale?.buckets.find((b) => b.id === id)?.label ?? id;
  const tags: { key: ListKey | "keyword"; value: string; label: string }[] = [
    ...filter.area.map((v) => ({ key: "area" as const, value: v, label: bucketLabel(vocab.area, v) })),
    ...filter.type.map((v) => ({ key: "type" as const, value: v, label: vocab.types.find((t) => t.id === v)?.label ?? v })),
    ...filter.price.map((v) => ({ key: "price" as const, value: v, label: bucketLabel(vocab.price, v) })),
    ...filter.style.map((v) => ({ key: "style" as const, value: v, label: v })),
    ...(filter.keyword ? [{ key: "keyword" as const, value: filter.keyword, label: `“${filter.keyword}”` }] : []),
  ];
  const tagList = (className: string) => (
    <ul className={className} aria-label={labels.selectedFilters}>
      {tags.map((t) => (
        <li key={`${t.key}:${t.value}`}>
          <button type="button" className="i2-ptag" onClick={() => remove(t.key, t.value)} aria-label={`${labels.reset}: ${t.label}`}>
            <span>{t.label}</span>
            <Icon name="close" size={12} />
          </button>
        </li>
      ))}
    </ul>
  );

  const on = new Set(vocab.groups);
  const group = (key: ListKey, legend: string, options: { value: string; label: string; tone?: "yellow" | "mint" | "navy" }[]) =>
    options.length === 0 ? null : (
      <fieldset className="i2-pgroup" data-filter-group={key}>
        <legend className="i2-pgroup__title">{legend}</legend>
        <div className="i2-pgroup__options">
          {options.map((o) => (
            <label key={o.value} className={o.tone ? `i2-pcheck i2-pcheck--dot i2-pcheck--${o.tone}` : "i2-pcheck"}>
              <input type="checkbox" className="i2-pcheck__input" name={key} value={o.value} checked={filter[key].includes(o.value)} onChange={() => toggle(key, o.value)} />
              <span className="i2-pcheck__box" aria-hidden="true">
                <Icon name="check" size={11} />
              </span>
              <span className="i2-pcheck__label">{o.label}</span>
            </label>
          ))}
        </div>
      </fieldset>
    );
  const buckets = (b: readonly FilterBucket[] | undefined) => (b ?? []).map((x) => ({ value: x.id, label: x.label }));
  const hasGroups = vocab.groups.length > 0;

  let body: ReactNode;
  if (count === 0) {
    body = (
      <div className="i2-pempty" data-filter-empty="">
        <h2 className="i2-pempty__title">{labels.emptyTitle}</h2>
        <p className="i2-pempty__body">{labels.emptyBody}</p>
        <button type="button" className="i2-btn i2-btn--black" onClick={reset}>
          {labels.reset}
        </button>
      </div>
    );
  } else {
    body = (
      <ul className="i2-cards i2-pgrid" data-shown={visible.length}>
        {visible.map((e, i) => (
          <ProjectCard key={e.id} model={e.card} withheld={labels.withheld} builtLabel={labels.built} level={2} eager={i < 3} />
        ))}
      </ul>
    );
  }

  const sortSelect = (
    <label className="i2-pselect">
      <span className="i2-sr">{labels.sort}</span>
      <select className="i2-pselect__select" name="sort" value={filter.sort} onChange={(e) => apply({ ...filter, sort: e.target.value as ProjectSort }, true)}>
        {vocab.sorts.map((s) => (
          <option key={s} value={s}>
            {labels.sorts[s]}
          </option>
        ))}
      </select>
      <Icon name="chevron-down" size={16} className="i2-pselect__icon" />
    </label>
  );

  return (
    <div className="i2-plist__row" data-filtered={isDefault ? "false" : "true"} data-ready={ready ? "true" : "false"}>
      {/* Filtered views are client state over /portfolio: never an indexable duplicate page. */}
      {!isDefault && data.noindexFiltered ? <meta name="robots" content="noindex, follow" /> : null}
      {hasGroups ? (
        <>
          <div className="i2-pstrip" data-filter-strip="">
            <div className="i2-pstrip__tags">{tags.length > 0 ? tagList("i2-ptags") : <span className="i2-pstrip__hint">{labels.filterHint}</span>}</div>
            <button type="button" className="i2-pstrip__btn" aria-label={labels.reset} onClick={reset} disabled={!dirty} data-filter-reset="">
              <PortfolioIcon name="refresh" size={24} />
            </button>
            <span className="i2-pstrip__divider" aria-hidden="true" />
            <button ref={openRef} type="button" className="i2-pstrip__btn" aria-label={labels.openFilters} aria-expanded={panelOpen} aria-controls={panelId} onClick={() => setPanelOpen(true)} data-filter-open="">
              <PortfolioIcon name="sliders" size={24} />
            </button>
          </div>
          <div
            ref={panelRef}
            id={panelId}
            className="i2-pside"
            data-filter-panel=""
            data-open={panelOpen ? "" : undefined}
            role={panelOpen ? "dialog" : undefined}
            aria-modal={panelOpen || undefined}
            aria-label={`${title} ${labels.filter}`}
            onKeyDown={onPanelKey}
          >
            <div className="i2-pside__bar">
              <span className="i2-pside__title">
                <Icon name="arrow-right" size={24} className="i2-pside__arrow" />
                {title} {labels.filter}
              </span>
              <button ref={closeRef} type="button" className="i2-pside__close" aria-label={labels.closeFilters} onClick={() => setPanelOpen(false)} data-filter-close="">
                <Icon name="close" size={26} />
              </button>
            </div>
            <div className="i2-pside__tags">{tags.length > 0 ? tagList("i2-ptags") : <span className="i2-pstrip__hint">{labels.filterHint}</span>}</div>
            <div className="i2-pside__body">
              {on.has("keyword") ? (
                <form className="i2-psearch" role="search" onSubmit={(e) => e.preventDefault()}>
                  <label htmlFor={searchId} className="i2-sr">
                    {labels.search}
                  </label>
                  <input
                    id={searchId}
                    type="search"
                    className="i2-psearch__input"
                    name="keyword"
                    placeholder={labels.searchPlaceholder}
                    autoComplete="off"
                    enterKeyHint="search"
                    value={keywordInput}
                    onChange={(e) => onKeyword(e.target.value)}
                  />
                  <button type="submit" className="i2-psearch__btn" aria-label={labels.search}>
                    <Icon name="search" size={28} />
                  </button>
                </form>
              ) : null}
              {group("area", labels.area, buckets(vocab.area?.buckets))}
              {group("type", labels.type, vocab.types.map((t) => ({ value: t.id, label: t.label, tone: tones[t.id] ?? "yellow" })))}
              {group("price", labels.price, buckets(vocab.price?.buckets))}
              {group("style", labels.style, vocab.styles.map((s) => ({ value: s, label: s })))}
            </div>
            <div className="i2-pside__actions">
              <button type="button" className="i2-pside__reset" onClick={reset} data-filter-reset="">
                {labels.reset}
              </button>
              <button type="button" className="i2-pside__apply" onClick={confirm} data-filter-apply="">
                {labels.apply}
              </button>
            </div>
          </div>
        </>
      ) : null}
      <div className="i2-presults" data-filter-results="">
        <div className="i2-pbar">
          <p ref={countRef} tabIndex={-1} className="i2-pbar__count" aria-live="polite" data-result-count={count}>
            {countNode(labels.count, count)}
          </p>
          {vocab.sorts.length > 1 ? (
            <>
              <div className="i2-psort" role="group" aria-label={labels.sort}>
                {vocab.sorts.map((s) => (
                  <button key={s} type="button" className="i2-psort__tab" aria-pressed={filter.sort === s} data-sort={s} onClick={() => apply({ ...filter, sort: s }, true)}>
                    {filter.sort === s ? <Icon name="check" size={14} /> : null}
                    {labels.sorts[s]}
                  </button>
                ))}
              </div>
              {sortSelect}
            </>
          ) : null}
        </div>
        {body}
        {ready ? remaining > 0 ? <div ref={sentinelRef} className="i2-psentinel" aria-hidden="true" data-remaining={remaining} /> : null : <Pager page={page} pageCount={pageCount} labels={labels.pagination} />}
      </div>
    </div>
  );
}

/** "{n}" slot format with the figure in a <strong> (the n = 1 form from `one`). */
function countNode(format: { one: string; other: string }, n: number): ReactNode {
  const f = n === 1 ? format.one : format.other;
  const i = f.indexOf("{n}");
  if (i < 0)
    return (
      <>
        <strong>{n}</strong> {f}
      </>
    );
  return (
    <>
      {f.slice(0, i)}
      <strong>{n}</strong>
      {f.slice(i + 3)}
    </>
  );
}
