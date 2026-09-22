"use client";

import { useRef, useState, type KeyboardEvent, type UIEvent } from "react";

export interface GalleryImage {
  src: string;
  width: number;
  height: number;
  alt: string;
}
export interface GalleryGroupProps {
  name: string;
  items: { image: GalleryImage; before?: GalleryImage }[];
}
export interface ProjectGalleryProps {
  groups: GalleryGroupProps[];
  labels: { rooms: string; before: string; after: string; showMore: string; showLess: string };
}

/**
 * Tiles shown per room before "show all" on wide screens: one 2×2 lead tile + a 2×2 block
 * (observed design). Must match the CSS nth-child rule.
 */
export const GALLERY_COLLAPSED = 5;

/**
 * Room tabs + photo grid (≥ 1281) / swipe strip (< 1281) — ONE tree, the band is pure CSS,
 * so the server HTML is correct at every width and hydration never switches layouts.
 * Before/after is data: the toggle exists only on items that have a `before` photo.
 * Every room's photos are in the HTML (inactive rooms are `hidden`), so they are crawlable.
 */
export function ProjectGallery({ groups, labels }: ProjectGalleryProps) {
  const [active, setActive] = useState(0);
  const [expanded, setExpanded] = useState(false);
  const [showBefore, setShowBefore] = useState<Record<string, boolean>>({});
  /** swipe-strip position per room (< 1281 only; the wide grid does not scroll) */
  const [slide, setSlide] = useState<Record<number, number>>({});
  const onStripScroll = (gi: number, count: number) => (e: UIEvent<HTMLUListElement>) => {
    const ul = e.currentTarget;
    const first = ul.firstElementChild as HTMLElement | null;
    const second = first?.nextElementSibling as HTMLElement | null;
    if (!first || !second) return;
    const atEnd = ul.scrollLeft >= ul.scrollWidth - ul.clientWidth - 1;
    const i = atEnd ? count - 1 : Math.round(ul.scrollLeft / (second.offsetLeft - first.offsetLeft));
    const next = Math.min(Math.max(i, 0), count - 1);
    if (next !== (slide[gi] ?? 0)) setSlide((s) => ({ ...s, [gi]: next }));
  };
  const tabs = groups.length > 1;
  const tabRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const select = (gi: number) => {
    setActive(gi);
    setExpanded(false);
  };
  // WAI-ARIA tabs: one tab stop (roving tabIndex), arrows/Home/End move + activate
  const onTabKey = (e: KeyboardEvent<HTMLDivElement>) => {
    const last = groups.length - 1;
    const next =
      e.key === "ArrowRight" ? (active === last ? 0 : active + 1)
      : e.key === "ArrowLeft" ? (active === 0 ? last : active - 1)
      : e.key === "Home" ? 0
      : e.key === "End" ? last
      : undefined;
    if (next === undefined) return;
    e.preventDefault();
    select(next);
    tabRefs.current[next]?.focus();
  };
  return (
    <div className="i1-gallery" data-gallery="">
      {tabs ? (
        <div className="i1-gallery__tabs" role="tablist" aria-label={labels.rooms} onKeyDown={onTabKey}>
          {groups.map((g, gi) => (
            <button
              key={g.name}
              type="button"
              role="tab"
              id={`i1-gallery-tab-${gi}`}
              aria-selected={gi === active}
              aria-controls={`i1-gallery-panel-${gi}`}
              tabIndex={gi === active ? 0 : -1}
              ref={(el) => {
                tabRefs.current[gi] = el;
              }}
              className="i1-gallery__tab"
              data-gallery-tab={gi}
              onClick={() => select(gi)}
            >
              {g.name} <span className="i1-gallery__count">({g.items.length})</span>
            </button>
          ))}
        </div>
      ) : null}
      {groups.map((g, gi) => {
        const overflow = g.items.length > GALLERY_COLLAPSED;
        return (
          <div
            key={g.name}
            id={`i1-gallery-panel-${gi}`}
            role={tabs ? "tabpanel" : "group"}
            aria-labelledby={tabs ? `i1-gallery-tab-${gi}` : undefined}
            aria-label={tabs ? undefined : g.name}
            hidden={gi !== active}
            className={`i1-gallery__panel${overflow && !expanded ? " is-collapsed" : ""}`}
            data-gallery-panel={gi}
          >
            <ul className="i1-gallery__grid" onScroll={g.items.length > 1 ? onStripScroll(gi, g.items.length) : undefined}>
              {g.items.map((it, ii) => {
                const key = `${gi}-${ii}`;
                const before = it.before !== undefined && showBefore[key] === true;
                const eager = gi === 0 && ii === 0;
                return (
                  <li key={key} className="i1-gallery__item" data-gallery-item="" data-has-before={it.before ? "true" : undefined}>
                    <img
                      src={it.image.src}
                      width={it.image.width}
                      height={it.image.height}
                      alt={it.image.alt}
                      loading={eager ? "eager" : "lazy"}
                      decoding="async"
                      hidden={before}
                      data-view="after"
                    />
                    {it.before ? (
                      <>
                        <img
                          src={it.before.src}
                          width={it.before.width}
                          height={it.before.height}
                          alt={it.before.alt}
                          loading="lazy"
                          decoding="async"
                          hidden={!before}
                          data-view="before"
                        />
                        <div className="i1-ba" role="group" aria-label={it.image.alt || `${labels.before} / ${labels.after}`} data-ba-toggle="">
                          <button
                            type="button"
                            className="i1-ba__btn"
                            aria-pressed={before}
                            data-ba="before"
                            onClick={() => setShowBefore((s) => ({ ...s, [key]: true }))}
                          >
                            {labels.before}
                          </button>
                          <button
                            type="button"
                            className="i1-ba__btn"
                            aria-pressed={!before}
                            data-ba="after"
                            onClick={() => setShowBefore((s) => ({ ...s, [key]: false }))}
                          >
                            {labels.after}
                          </button>
                        </div>
                      </>
                    ) : null}
                  </li>
                );
              })}
            </ul>
            {g.items.length > 1 ? (
              <p className="i1-gallery__counter" aria-hidden="true">
                {(slide[gi] ?? 0) + 1} / {g.items.length}
              </p>
            ) : null}
            {overflow ? (
              <button type="button" className="i1-gallery__more" aria-expanded={expanded} data-gallery-more="" onClick={() => setExpanded((e) => !e)}>
                {expanded ? labels.showLess : labels.showMore}
              </button>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}
