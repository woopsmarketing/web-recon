"use client";

import { useEffect, useRef, useState, type AnimationEvent, type FocusEvent, type ReactNode } from "react";
import { fill } from "../../lib/format";

/**
 * HeroSlider (HOME, client) — the stage of home.hero: the slides stacked on top of each other,
 * the current one opaque (the CSS cross-fades opacity, 1.5 s quint ease-out), the dot row near
 * the bottom with the stop / start control after the dots, and, as children, the server-rendered
 * slogan block centred over the slides.
 *
 * Autoplay has NO timer: a hidden element runs a 4 s CSS animation whenever the slider may rotate
 * and its `animationend` shows the next slide; a change re-mounts that element, so every slide
 * gets a fresh wait. The slider may rotate while it has more than one slide, `autoplay` is on,
 * the component has hydrated, no pointer is over the dot bar (the photo and the slogan do not
 * pause it), no dot has keyboard focus and the stage is on screen (IntersectionObserver); leaving
 * that state and coming back restarts a fresh wait. The control (autoplay on, more than one
 * slide) stops the rotation until pressed again (the dots still switch slides; starting again
 * begins a fresh wait; a pointer leaving the dot bar never resumes a stopped slider). Pressing a
 * dot moves the selected state at once and the fade follows; pressing the current dot does
 * nothing. No arrows, no swipe.
 * `prefers-reduced-motion: reduce` removes the animation in CSS (no end event = no rotation)
 * and the fade. One slide = no dots, no wait element.
 *
 * Props
 *   slides       { id, src, width, height, alt }[] — the first loads eagerly, the others lazily
 *   autoplay     the section setting
 *   regionLabel  accessible name of the slide region (more than one slide only)
 *   dotLabel     "{n}" format → each dot's accessible name
 *   pauseLabel / playLabel   the control's accessible name = the action it performs now
 *   children     the slogan block (may be absent)
 */
export interface HeroSlide {
  id: string;
  src: string;
  width: number;
  height: number;
  alt: string;
}

export function HeroSlider({ slides, autoplay, regionLabel, dotLabel, pauseLabel, playLabel, children }: { slides: HeroSlide[]; autoplay: boolean; regionLabel: string; dotLabel: string; pauseLabel: string; playLabel: string; children?: ReactNode }) {
  const n = slides.length;
  const live = n > 1;
  const [index, setIndex] = useState(0);
  // false in the server HTML and the first client render; true once the observer is attached
  const [ready, setReady] = useState(false);
  const [onScreen, setOnScreen] = useState(true);
  const [hovered, setHovered] = useState(false);
  const [focused, setFocused] = useState(false);
  // the visitor pressed the stop control; only the control starts the rotation again
  const [stopped, setStopped] = useState(false);
  const stage = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = stage.current;
    if (!el || !live || !autoplay) return;
    if (typeof IntersectionObserver === "undefined") {
      setReady(true);
      return;
    }
    const io = new IntersectionObserver(([entry]) => {
      if (entry) setOnScreen(entry.isIntersecting);
    });
    io.observe(el);
    setReady(true);
    return () => io.disconnect();
  }, [live, autoplay]);

  const onWaitEnd = (e: AnimationEvent<HTMLSpanElement>) => {
    if (e.target === e.currentTarget) setIndex((i) => (i + 1) % n);
  };
  // keyboard focus only: a tapped / clicked dot keeps focus without showing it and must not hold the wait
  const onDotsFocus = (e: FocusEvent<HTMLUListElement>) => {
    let visible = true;
    try {
      visible = e.target.matches(":focus-visible");
    } catch {
      visible = true;
    }
    setFocused(visible);
  };
  const onDotsBlur = (e: FocusEvent<HTMLUListElement>) => {
    if (!e.currentTarget.contains(e.relatedTarget)) setFocused(false);
  };

  const waiting = live && autoplay && ready && onScreen && !hovered && !focused && !stopped;

  return (
    <div
      ref={stage}
      className="i3-hero__stage"
      role={live ? "region" : undefined}
      aria-roledescription={live ? "carousel" : undefined}
      aria-label={live ? regionLabel : undefined}
      data-hero-stage=""
      data-count={n}
      data-index={index}
      data-waiting={waiting ? "true" : "false"}
      data-stopped={live && autoplay ? (stopped ? "true" : "false") : undefined}
    >
      {n > 0 ? (
        <div className="i3-hero__slides">
          {slides.map((s, i) => (
            <div key={s.id} className="i3-hero__slide" data-hero-slide={s.id} data-active={i === index ? "true" : undefined} aria-hidden={i === index ? undefined : true}>
              <img
                className="i3-hero__img"
                src={s.src}
                width={s.width}
                height={s.height}
                alt={s.alt}
                loading={i === 0 ? "eager" : "lazy"}
                fetchPriority={i === 0 ? "high" : undefined}
                decoding="async"
                draggable={false}
              />
            </div>
          ))}
        </div>
      ) : null}
      {children}
      {live ? (
        <ul
          className="i3-hero__dots"
          data-hero-dots=""
          onPointerEnter={() => setHovered(true)}
          onPointerLeave={() => setHovered(false)}
          onFocus={onDotsFocus}
          onBlur={onDotsBlur}
        >
          {slides.map((s, i) => (
            <li key={s.id}>
              <button type="button" className="i3-hero__dot" aria-label={fill(dotLabel, { n: i + 1 })} aria-current={i === index ? "true" : undefined} data-hero-dot={i} onClick={() => setIndex(i)} />
            </li>
          ))}
          {autoplay ? (
            <li className="i3-hero__ctl">
              <button type="button" className="i3-hero__toggle" aria-label={stopped ? playLabel : pauseLabel} data-hero-toggle={stopped ? "play" : "pause"} onClick={() => setStopped((s) => !s)}>
                {stopped ? <PlayGlyph /> : <PauseGlyph />}
              </button>
            </li>
          ) : null}
        </ul>
      ) : null}
      {live && autoplay ? <span key={index} className={waiting ? "i3-hero__wait is-waiting" : "i3-hero__wait"} onAnimationEnd={onWaitEnd} aria-hidden="true" /> : null}
    </div>
  );
}

/* Control glyphs (10 px, currentColor): pause bars / play triangle, decorative — the button carries the name. */
const glyph = { className: "i3-hero__glyph", width: 10, height: 10, viewBox: "0 0 10 10", "aria-hidden": true, focusable: "false" as const };
function PauseGlyph() {
  return (
    <svg {...glyph} fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round">
      <path d="M3 1.5v7M7 1.5v7" />
    </svg>
  );
}
function PlayGlyph() {
  return (
    <svg {...glyph} fill="currentColor">
      <path d="M2 1v8l7-4z" />
    </svg>
  );
}
