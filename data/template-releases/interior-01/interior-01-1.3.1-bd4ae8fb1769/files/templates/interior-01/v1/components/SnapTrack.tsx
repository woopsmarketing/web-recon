"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { ChevronIcon } from "./Icon";

export interface SnapTrackProps {
  /** id of the scrolling list (the buttons' aria-controls target) */
  id: string;
  /** accessible name of the list (usually the section title) */
  label: string;
  previousLabel: string;
  nextLabel: string;
  /** declared layout of this Template's review cards (two rows below 900 px) */
  layout?: "reviews";
  /**
   * The items contain nothing focusable (e.g. review quotes): make the list itself a tab
   * stop so keyboard users can scroll it (arrow keys) in every browser.
   */
  focusableList?: boolean;
  /** the <li> items, rendered on the server */
  children: ReactNode;
}

interface TrackState {
  atStart: boolean;
  atEnd: boolean;
  /** scroll position and visible share as fractions of the list width, once measured */
  thumb?: { left: number; width: number };
}

/**
 * Homepage showcase track — ONE server-rendered list; how many items fit per view is
 * pure CSS (media queries), so the HTML is identical at every width and hydration never
 * switches layouts. Native horizontal scroll + scroll-snap does the moving (touch swipe,
 * trackpad, keyboard focus on a card scrolls it into view); the two buttons page by one
 * view. Scroll animation comes from CSS `scroll-behavior`, which reduced-motion turns off.
 * No autoplay, no loop, no timers. Button state is measured from the list itself.
 */
export function SnapTrack({ id, label, previousLabel, nextLabel, layout, focusableList, children }: SnapTrackProps) {
  const listRef = useRef<HTMLUListElement>(null);
  const [state, setState] = useState<TrackState>({ atStart: true, atEnd: false });

  useEffect(() => {
    const list = listRef.current;
    if (!list) return;
    const measure = () => {
      const max = Math.max(list.scrollWidth - list.clientWidth, 0);
      const left = Math.min(Math.max(list.scrollLeft, 0), max);
      setState({
        atStart: left <= 1,
        atEnd: left >= max - 1,
        thumb: list.scrollWidth > 0 ? { left: left / list.scrollWidth, width: list.clientWidth / list.scrollWidth } : undefined,
      });
    };
    measure();
    list.addEventListener("scroll", measure, { passive: true });
    const resize = new ResizeObserver(measure);
    resize.observe(list);
    return () => {
      list.removeEventListener("scroll", measure);
      resize.disconnect();
    };
  }, []);

  const page = (dir: -1 | 1) => {
    const list = listRef.current;
    if (!list || (dir < 0 ? state.atStart : state.atEnd)) return;
    list.scrollBy({ left: dir * list.clientWidth });
  };
  const scrollable = !(state.atStart && state.atEnd);
  const pct = (v: number) => `${Math.round(v * 10000) / 100}%`;

  return (
    <div className={layout ? `i1-track i1-track--${layout}` : "i1-track"} data-track="" data-scrollable={scrollable ? "true" : "false"}>
      <ul id={id} ref={listRef} className="i1-track__list" aria-label={label} tabIndex={focusableList && scrollable ? 0 : undefined}>
        {children}
      </ul>
      <div className="i1-track__bar">
        <div className="i1-track__rail" aria-hidden="true">
          <span className="i1-track__thumb" style={state.thumb ? { left: pct(state.thumb.left), width: pct(state.thumb.width) } : undefined} />
        </div>
        <div className="i1-track__nav">
          <button type="button" className="i1-track__btn" aria-controls={id} aria-label={previousLabel} aria-disabled={state.atStart} onClick={() => page(-1)}>
            <ChevronIcon dir="left" />
          </button>
          <button type="button" className="i1-track__btn" aria-controls={id} aria-label={nextLabel} aria-disabled={state.atEnd} onClick={() => page(1)}>
            <ChevronIcon dir="right" />
          </button>
        </div>
      </div>
    </div>
  );
}
