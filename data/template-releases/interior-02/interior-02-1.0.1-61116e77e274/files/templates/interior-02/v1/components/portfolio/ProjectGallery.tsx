"use client";

import { useEffect, useId, useRef, useState, type KeyboardEvent, type MouseEvent } from "react";
import { Icon } from "../ui/Icon";
import { PortfolioIcon } from "./PortfolioIcons";

export interface GalleryImage {
  src: string;
  width: number;
  height: number;
  alt: string;
}
export interface GalleryGroupData {
  name: string;
  items: { image: GalleryImage; before?: GalleryImage }[];
}
export interface GalleryLabels {
  photos: string;
  all: string;
  gridView: string;
  singleView: string;
  openPhoto: string;
  viewer: string;
  close: string;
  previous: string;
  next: string;
  thumbnails: string;
}

/** one photo seat of the current view, with the group it belongs to and its index inside that group */
interface Seat {
  key: string;
  group: string;
  n: number;
  image: GalleryImage;
}

/**
 * Photo-group chips + grid / single view switch + the square tile grid, and the template's own
 * full-screen viewer. One <ul> holds the current view: the server HTML is the "all" view (every
 * photo of the project in group order), a chip filters it in place (no network), the view switch
 * changes the list's layout class only. Any tile opens the viewer on the photos of the current
 * view: a native modal <dialog> (focus trap, Escape and focus return are the browser's) with a
 * counter, prev / next, the contained image, a caption (group name + index) and a thumbnail strip;
 * ← / → navigate, a press on the backdrop closes. The page does not scroll while it is open
 * (CSS: html:has(.i2-pviewer[open])).
 */
export function ProjectGallery({ groups, labels }: { groups: GalleryGroupData[]; labels: GalleryLabels }) {
  const chips = groups.length > 1;
  const all: Seat[] = groups.flatMap((g, gi) => g.items.map((it, ii) => ({ key: `${gi}-${ii}`, group: g.name, n: ii + 1, image: it.image })));
  // 0 = all photos, i + 1 = group i
  const [active, setActive] = useState(0);
  const [view, setView] = useState<"grid" | "single">("grid");
  const [viewer, setViewer] = useState<number | undefined>(undefined);
  const uid = useId();
  const seats = active === 0 ? all : all.filter((s) => s.group === groups[active - 1]?.name);
  const open = viewer !== undefined ? seats[viewer] : undefined;
  return (
    <div className="i2-pgallery" data-gallery="" data-view={view}>
      <div className="i2-pgallery__top">
        {chips ? (
          <div className="i2-pgallery__chips" role="group" aria-label={labels.photos}>
            <button type="button" className="i2-pgallery__chip" aria-pressed={active === 0} data-gallery-chip="all" onClick={() => setActive(0)}>
              {labels.all} ({all.length})
            </button>
            {groups.map((g, gi) => (
              <button key={g.name} type="button" className="i2-pgallery__chip" aria-pressed={active === gi + 1} data-gallery-chip={gi} onClick={() => setActive(gi + 1)}>
                {g.name} ({g.items.length})
              </button>
            ))}
          </div>
        ) : (
          <span className="i2-pgallery__chips" />
        )}
        <div className="i2-pgallery__views" role="group" aria-label={labels.photos}>
          <button type="button" className="i2-pgallery__view" aria-pressed={view === "grid"} aria-label={labels.gridView} data-gallery-view="grid" onClick={() => setView("grid")}>
            <Icon name="grid" size={28} />
          </button>
          <button type="button" className="i2-pgallery__view" aria-pressed={view === "single"} aria-label={labels.singleView} data-gallery-view="single" onClick={() => setView("single")}>
            <PortfolioIcon name="single" size={28} />
          </button>
        </div>
      </div>
      <ul className={view === "single" ? "i2-pgallery__grid i2-pgallery__grid--single" : "i2-pgallery__grid"} id={`${uid}-grid`} data-gallery-grid="" data-count={seats.length}>
        {seats.map((s, i) => (
          <li key={s.key} className="i2-pgallery__tile" data-gallery-tile="">
            <button
              type="button"
              className="i2-pgallery__zoom"
              aria-haspopup="dialog"
              aria-label={`${labels.openPhoto} ${i + 1} / ${seats.length}${s.image.alt ? `: ${s.image.alt}` : ""}`}
              data-gallery-zoom=""
              onClick={() => setViewer(i)}
            >
              <img src={s.image.src} width={s.image.width} height={s.image.height} alt={s.image.alt} loading={i < 4 ? "eager" : "lazy"} decoding="async" />
            </button>
          </li>
        ))}
      </ul>
      {open ? <PhotoViewer seats={seats} start={viewer ?? 0} labels={labels} onClose={() => setViewer(undefined)} /> : null}
    </div>
  );
}

function PhotoViewer({ seats, start, labels, onClose }: { seats: Seat[]; start: number; labels: GalleryLabels; onClose: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  const thumbRefs = useRef<(HTMLButtonElement | null)[]>([]);
  /** where the press began: only a press that starts AND ends on the backdrop closes (a drag off the photo does not) */
  const pressedOn = useRef<EventTarget | null>(null);
  const [index, setIndex] = useState(start);
  const count = seats.length;
  const multi = count > 1;
  useEffect(() => {
    const dialog = ref.current;
    if (dialog && !dialog.open) dialog.showModal();
  }, []);
  // keep the active thumbnail in view and warm the neighbours so a step shows a photo, not an empty stage
  useEffect(() => {
    thumbRefs.current[index]?.scrollIntoView({ block: "nearest", inline: "center" });
    if (count < 2) return;
    for (const n of [index + 1, index - 1]) {
      const s = seats[((n % count) + count) % count];
      if (s) new Image().src = s.image.src;
    }
  }, [index, count, seats]);
  const go = (next: number) => setIndex(((next % count) + count) % count);
  const onKeyDown = (e: KeyboardEvent<HTMLDialogElement>) => {
    if (!multi || (e.key !== "ArrowLeft" && e.key !== "ArrowRight")) return;
    e.preventDefault();
    go(index + (e.key === "ArrowRight" ? 1 : -1));
  };
  const onBackdrop = (e: MouseEvent<HTMLElement>) => {
    if (e.target === e.currentTarget && pressedOn.current === e.currentTarget) ref.current?.close();
  };
  const seat = seats[index];
  if (!seat) return null;
  return (
    <dialog
      ref={ref}
      className="i2-pviewer"
      aria-label={labels.viewer}
      data-gallery-viewer=""
      onClose={onClose}
      onKeyDown={onKeyDown}
      onPointerDownCapture={(e) => (pressedOn.current = e.target)}
      onClick={onBackdrop}
    >
      <div className="i2-pviewer__bar">
        <p className="i2-pviewer__counter" aria-live="polite">
          <span data-viewer-counter="">
            {index + 1} / {count}
          </span>
          <span className="i2-sr">{[seat.group, seat.image.alt].filter(Boolean).join(" — ")}</span>
        </p>
        <button type="button" className="i2-pviewer__close" aria-label={labels.close} data-viewer-close="" onClick={() => ref.current?.close()}>
          <Icon name="close" size={28} />
        </button>
      </div>
      <div className="i2-pviewer__stage" onClick={onBackdrop}>
        <img key={seat.image.src} className="i2-pviewer__img" src={seat.image.src} width={seat.image.width} height={seat.image.height} alt={seat.image.alt} decoding="async" draggable={false} data-viewer-img="" />
      </div>
      {multi ? (
        <>
          <button type="button" className="i2-pviewer__arrow i2-pviewer__arrow--prev" aria-label={labels.previous} data-viewer-arrow="prev" onClick={() => go(index - 1)}>
            <Icon name="chevron-left" size={32} />
          </button>
          <button type="button" className="i2-pviewer__arrow i2-pviewer__arrow--next" aria-label={labels.next} data-viewer-arrow="next" onClick={() => go(index + 1)}>
            <Icon name="chevron-right" size={32} />
          </button>
        </>
      ) : null}
      <p className="i2-pviewer__caption" data-viewer-caption="">
        {seat.group} ({seat.n})
      </p>
      {multi ? (
        <div className="i2-pviewer__thumbs" role="group" aria-label={labels.thumbnails} data-viewer-thumbs="">
          {seats.map((s, i) => (
            <button
              key={s.key}
              type="button"
              className="i2-pviewer__thumb"
              aria-current={i === index ? "true" : undefined}
              aria-label={`${i + 1} / ${count}`}
              ref={(el) => {
                thumbRefs.current[i] = el;
              }}
              onClick={() => go(i)}
            >
              <img src={s.image.src} width={s.image.width} height={s.image.height} alt="" loading="lazy" decoding="async" />
            </button>
          ))}
        </div>
      ) : null}
    </dialog>
  );
}
