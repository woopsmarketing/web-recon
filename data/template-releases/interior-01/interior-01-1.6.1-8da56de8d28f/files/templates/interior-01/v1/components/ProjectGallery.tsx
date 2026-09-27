"use client";

import { useEffect, useRef, useState, type KeyboardEvent, type MouseEvent, type PointerEvent, type UIEvent } from "react";
import { ChevronIcon, CloseIcon } from "./Icon";

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
  labels: {
    rooms: string;
    all: string;
    before: string;
    after: string;
    showMore: string;
    showLess: string;
    previousPhoto: string;
    nextPhoto: string;
    openPhoto: string;
    close: string;
  };
}

/**
 * Tiles shown per room before "show all" on wide screens: one 2×2 lead tile + a 2×2 block
 * (observed design). Must match the CSS nth-child rule.
 */
export const GALLERY_COLLAPSED = 5;

const SWIPE_PX = 48;

/** one photo seat of a view; `key` is its room position, so before/after state is shared by the "all" view and the room's own */
interface ViewItem {
  key: string;
  room: string;
  image: GalleryImage;
  before?: GalleryImage;
}
/** `id` is the DOM suffix: "all", or the room's position — room ids do not move when the "all" view exists */
interface View {
  id: string;
  name: string;
  items: ViewItem[];
}

/**
 * Room tabs + photo grid (≥ 1281) / swipe strip (< 1281) — ONE tree, the band is pure CSS,
 * so the server HTML is correct at every width and hydration never switches layouts.
 * Before/after is data: the toggle exists only on items that have a `before` photo.
 * Every room's photos are in the HTML (inactive rooms are `hidden`), so they are crawlable.
 * The strip moves by native scroll + scroll-snap (touch swipe); the two arrows step it by
 * exactly one photo seat (same look as the home hero's), and a room always opens on photo 1.
 * With more than one room the first tab is "all" (1.4.2): every photo of the project in room
 * order, and the view a detail page opens on. Any photo opens the viewer (a modal <dialog>,
 * client-only — nothing of it is in the server HTML) on the photos of the open tab.
 */
export function ProjectGallery({ groups, labels }: ProjectGalleryProps) {
  const tabs = groups.length > 1;
  const rooms: View[] = groups.map((g, gi) => ({
    id: String(gi),
    name: g.name,
    items: g.items.map((it, ii) => ({ key: `${gi}-${ii}`, room: g.name, image: it.image, before: it.before })),
  }));
  const views: View[] = tabs ? [{ id: "all", name: labels.all, items: rooms.flatMap((r) => r.items) }, ...rooms] : rooms;

  const [active, setActive] = useState(0);
  const [expanded, setExpanded] = useState(false);
  const [showBefore, setShowBefore] = useState<Record<string, boolean>>({});
  /** swipe-strip position per view (< 1281 only; the wide grid does not scroll) */
  const [slide, setSlide] = useState<Record<number, number>>({});
  /** the open viewer: a view and the photo it shows */
  const [viewer, setViewer] = useState<{ view: number; index: number } | undefined>(undefined);
  const onStripScroll = (vi: number, count: number) => (e: UIEvent<HTMLUListElement>) => {
    const ul = e.currentTarget;
    const first = ul.firstElementChild as HTMLElement | null;
    const second = first?.nextElementSibling as HTMLElement | null;
    if (!first || !second) return;
    const atEnd = ul.scrollLeft >= ul.scrollWidth - ul.clientWidth - 1;
    const i = atEnd ? count - 1 : Math.round(ul.scrollLeft / (second.offsetLeft - first.offsetLeft));
    const next = Math.min(Math.max(i, 0), count - 1);
    if (next !== (slide[vi] ?? 0)) setSlide((s) => ({ ...s, [vi]: next }));
  };
  const stripRefs = useRef<(HTMLUListElement | null)[]>([]);
  const step = (vi: number, dir: -1 | 1) => {
    const ul = stripRefs.current[vi];
    const first = ul?.firstElementChild as HTMLElement | null;
    const target = ul?.children[(slide[vi] ?? 0) + dir] as HTMLElement | undefined;
    if (!ul || !first || !target) return;
    ul.scrollTo({ left: target.offsetLeft - first.offsetLeft });
  };
  const tabRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const select = (vi: number) => {
    setActive(vi);
    setExpanded(false);
  };
  // a room opens on its first photo (a hidden panel cannot be scrolled, so rewind once it shows)
  useEffect(() => {
    stripRefs.current[active]?.scrollTo({ left: 0, behavior: "instant" });
    setSlide((s) => ((s[active] ?? 0) === 0 ? s : { ...s, [active]: 0 }));
  }, [active]);
  // WAI-ARIA tabs: one tab stop (roving tabIndex), arrows/Home/End move + activate
  const onTabKey = (e: KeyboardEvent<HTMLDivElement>) => {
    const last = views.length - 1;
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
  const open = viewer ? views[viewer.view] : undefined;
  return (
    <div className="i1-gallery" data-gallery="">
      {tabs ? (
        <div className="i1-gallery__tabs" role="tablist" aria-label={labels.rooms} onKeyDown={onTabKey}>
          {views.map((v, vi) => (
            <button
              key={v.id}
              type="button"
              role="tab"
              id={`i1-gallery-tab-${v.id}`}
              aria-selected={vi === active}
              aria-controls={`i1-gallery-panel-${v.id}`}
              tabIndex={vi === active ? 0 : -1}
              ref={(el) => {
                tabRefs.current[vi] = el;
              }}
              className="i1-gallery__tab"
              data-gallery-tab={v.id}
              onClick={() => select(vi)}
            >
              {v.name} <span className="i1-gallery__count">({v.items.length})</span>
            </button>
          ))}
        </div>
      ) : null}
      {views.map((v, vi) => {
        const overflow = v.items.length > GALLERY_COLLAPSED;
        return (
          <div
            key={v.id}
            id={`i1-gallery-panel-${v.id}`}
            role={tabs ? "tabpanel" : "group"}
            aria-labelledby={tabs ? `i1-gallery-tab-${v.id}` : undefined}
            aria-label={tabs ? undefined : v.name}
            hidden={vi !== active}
            className={`i1-gallery__panel${overflow && !expanded ? " is-collapsed" : ""}`}
            data-gallery-panel={v.id}
          >
            <ul
              id={`i1-gallery-strip-${v.id}`}
              ref={(el) => {
                stripRefs.current[vi] = el;
              }}
              className="i1-gallery__grid"
              onScroll={v.items.length > 1 ? onStripScroll(vi, v.items.length) : undefined}
            >
              {v.items.map((it, ii) => {
                const before = it.before !== undefined && showBefore[it.key] === true;
                // the lead photo of the opening view, and of the first room (its seat before the "all" view existed)
                const eager = ii === 0 && (vi === 0 || v.id === "0");
                return (
                  <li key={it.key} className="i1-gallery__item" data-gallery-item="" data-has-before={it.before ? "true" : undefined}>
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
                            onClick={() => setShowBefore((s) => ({ ...s, [it.key]: true }))}
                          >
                            {labels.before}
                          </button>
                          <button
                            type="button"
                            className="i1-ba__btn"
                            aria-pressed={!before}
                            data-ba="after"
                            onClick={() => setShowBefore((s) => ({ ...s, [it.key]: false }))}
                          >
                            {labels.after}
                          </button>
                        </div>
                      </>
                    ) : null}
                    {/* the whole photo is the viewer's button (under the before/after toggle); last in the seat, so the markup before it is unchanged */}
                    <button
                      type="button"
                      className="i1-gallery__zoom"
                      aria-haspopup="dialog"
                      aria-label={`${labels.openPhoto} ${ii + 1} / ${v.items.length}${it.image.alt ? `: ${it.image.alt}` : ""}`}
                      data-gallery-zoom=""
                      onClick={() => setViewer({ view: vi, index: ii })}
                    />
                  </li>
                );
              })}
            </ul>
            {v.items.length > 1 ? (
              <>
                <button
                  type="button"
                  className="i1-gallery__arrow i1-gallery__arrow--prev"
                  aria-controls={`i1-gallery-strip-${v.id}`}
                  aria-label={labels.previousPhoto}
                  aria-disabled={(slide[vi] ?? 0) === 0}
                  data-gallery-arrow="prev"
                  onClick={() => step(vi, -1)}
                >
                  <ChevronIcon dir="left" />
                </button>
                <button
                  type="button"
                  className="i1-gallery__arrow i1-gallery__arrow--next"
                  aria-controls={`i1-gallery-strip-${v.id}`}
                  aria-label={labels.nextPhoto}
                  aria-disabled={(slide[vi] ?? 0) === v.items.length - 1}
                  data-gallery-arrow="next"
                  onClick={() => step(vi, 1)}
                >
                  <ChevronIcon dir="right" />
                </button>
                <p className="i1-gallery__counter" aria-hidden="true">
                  {(slide[vi] ?? 0) + 1} / {v.items.length}
                </p>
              </>
            ) : null}
            {overflow ? (
              <button type="button" className="i1-gallery__more" aria-expanded={expanded} data-gallery-more="" onClick={() => setExpanded((e) => !e)}>
                {expanded ? labels.showLess : labels.showMore}
              </button>
            ) : null}
          </div>
        );
      })}
      {viewer && open ? (
        <PhotoViewer
          items={open.items}
          start={viewer.index}
          showBefore={showBefore}
          showRoom={tabs}
          labels={{ title: labels.openPhoto, previous: labels.previousPhoto, next: labels.nextPhoto, close: labels.close }}
          onClose={() => setViewer(undefined)}
        />
      ) : null}
    </div>
  );
}

interface PhotoViewerProps {
  items: ViewItem[];
  start: number;
  showBefore: Record<string, boolean>;
  /** the room badge names a tab; a gallery without tabs has no room to name */
  showRoom: boolean;
  labels: { title: string; previous: string; next: string; close: string };
  onClose: () => void;
}

/**
 * The large-photo viewer: a native modal <dialog> — Esc, the focus trap, the inert page and
 * focus return to the pressed photo are the browser's. It starts on the pressed photo, shows
 * the side of a before/after pair the seat shows, and moves by the arrows, ← / → and a touch
 * swipe (wrapping at the ends). A press on the backdrop closes it; the page behind does not
 * scroll while it is open (CSS: `html:has(.i1-viewer[open])`).
 */
function PhotoViewer({ items, start, showBefore, showRoom, labels, onClose }: PhotoViewerProps) {
  const ref = useRef<HTMLDialogElement>(null);
  const [index, setIndex] = useState(start);
  const pointerX = useRef<number | undefined>(undefined);
  /** where the press began: only a press that starts AND ends on the backdrop closes (a drag off the photo does not) */
  const pressedOn = useRef<EventTarget | null>(null);
  const count = items.length;
  const multi = count > 1;
  useEffect(() => {
    const dialog = ref.current;
    if (!dialog || dialog.open) return;
    dialog.showModal();
    dialog.focus();
  }, []);
  const go = (next: number) => setIndex(((next % count) + count) % count);
  // the neighbours are usually still lazy in the strip: fetch them now, so a step shows a photo, not an empty stage
  useEffect(() => {
    if (count < 2) return;
    for (const n of [index + 1, index - 1]) {
      const it = items[((n % count) + count) % count];
      if (it) new Image().src = (it.before && showBefore[it.key] === true ? it.before : it.image).src;
    }
  }, [index, count, items, showBefore]);
  const onKeyDown = (e: KeyboardEvent<HTMLDialogElement>) => {
    if (!multi || (e.key !== "ArrowLeft" && e.key !== "ArrowRight")) return;
    e.preventDefault();
    go(index + (e.key === "ArrowRight" ? 1 : -1));
  };
  // the backdrop is the dialog box itself and its stage: a press on the photo or a control is not
  const onBackdrop = (e: MouseEvent<HTMLElement>) => {
    if (e.target === e.currentTarget && pressedOn.current === e.currentTarget) ref.current?.close();
  };
  const onPointerDown = (e: PointerEvent<HTMLDivElement>) => {
    pointerX.current = e.pointerType === "mouse" ? undefined : e.clientX;
  };
  const onPointerUp = (e: PointerEvent<HTMLDivElement>) => {
    const from = pointerX.current;
    pointerX.current = undefined;
    if (!multi || from === undefined) return;
    // pinch-zoomed in: a drag is the visitor looking around the photo, not a swipe
    if (typeof visualViewport !== "undefined" && (visualViewport?.scale ?? 1) > 1.01) return;
    const dx = e.clientX - from;
    if (Math.abs(dx) < SWIPE_PX) return;
    pressedOn.current = null; // a swipe that began on the backdrop is not a press on it
    go(index + (dx < 0 ? 1 : -1));
  };
  const item = items[index];
  if (!item) return null;
  const photo = item.before && showBefore[item.key] === true ? item.before : item.image;
  return (
    <dialog
      ref={ref}
      className="i1-viewer"
      tabIndex={-1}
      aria-label={labels.title}
      data-gallery-viewer=""
      onClose={onClose}
      onKeyDown={onKeyDown}
      onPointerDownCapture={(e) => (pressedOn.current = e.target)}
      onClick={onBackdrop}
    >
      <div className="i1-viewer__bar">
        {showRoom ? (
          <span className="i1-viewer__room" data-viewer-room="">
            {item.room}
          </span>
        ) : null}
        <p className="i1-viewer__counter" aria-live="polite">
          <span data-viewer-counter="">
            {index + 1} / {count}
          </span>
          {/* the step is announced as the photo it lands on, not only its number */}
          <span className="i1-sr">{[showRoom ? item.room : "", photo.alt].filter(Boolean).join(" — ")}</span>
        </p>
        <button type="button" className="i1-viewer__close" aria-label={labels.close} data-viewer-close="" onClick={() => ref.current?.close()}>
          <CloseIcon />
        </button>
      </div>
      <div
        className="i1-viewer__stage"
        onClick={onBackdrop}
        onPointerDown={onPointerDown}
        onPointerUp={onPointerUp}
        onPointerCancel={() => (pointerX.current = undefined)}
      >
        <img
          key={photo.src}
          className="i1-viewer__img"
          src={photo.src}
          width={photo.width}
          height={photo.height}
          alt={photo.alt}
          decoding="async"
          draggable={false}
          data-viewer-img=""
        />
      </div>
      {multi ? (
        <>
          <button type="button" className="i1-viewer__arrow i1-viewer__arrow--prev" aria-label={labels.previous} data-viewer-arrow="prev" onClick={() => go(index - 1)}>
            <ChevronIcon dir="left" />
          </button>
          <button type="button" className="i1-viewer__arrow i1-viewer__arrow--next" aria-label={labels.next} data-viewer-arrow="next" onClick={() => go(index + 1)}>
            <ChevronIcon dir="right" />
          </button>
        </>
      ) : null}
    </dialog>
  );
}
