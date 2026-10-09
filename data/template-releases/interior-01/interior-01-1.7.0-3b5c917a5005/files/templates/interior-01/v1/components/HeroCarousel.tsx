"use client";

import Link from "./Link";
import { useEffect, useRef, useState, type AnimationEvent, type FocusEvent, type KeyboardEvent, type PointerEvent } from "react";
import { ChevronIcon, PauseIcon, PlayIcon } from "./Icon";

export interface HeroSlide {
  id: string;
  image: { src: string; width: number; height: number; alt: string };
  headline?: string;
  text?: string;
  /** internal = a page of this site (client navigation); otherwise mailto: */
  cta?: { label: string; href: string; internal: boolean };
}

export interface HeroCarouselProps {
  slides: HeroSlide[];
  autoplay: boolean;
  labels: { region: string; previous: string; next: string; pause: string; play: string; slideFormat: string };
}

const SWIPE_PX = 48;

/**
 * home.hero — image slides stacked in ONE server-rendered tree (slide 1 active in the
 * HTML, deterministic). Autoplay timing is declared in CSS: the active pagination dot's
 * fill runs a 5 s animation and its `animationend` advances the slide — so pausing
 * (mouse hover, the pause button) is `animation-play-state`, and `prefers-reduced-motion`
 * (no animation → no end event) means no rotation at all. No timers. The timer class is
 * only applied after hydration, so a slow hydration can never miss the end event.
 * Rotation stops for good on any manual navigation or keyboard focus inside the
 * carousel (it never fights the user); the play button resumes it.
 * One slide → a plain image section: no dots, arrows or rotation.
 */
export function HeroCarousel({ slides, autoplay, labels }: HeroCarouselProps) {
  const count = slides.length;
  const multi = count > 1;
  const [index, setIndex] = useState(0);
  const [stopped, setStopped] = useState(!autoplay);
  const [hovered, setHovered] = useState(false);
  // false in the server HTML and the first client render (identical markup); true once the
  // handlers are attached — only then may the timer animation run and end.
  const [ready, setReady] = useState(false);
  useEffect(() => setReady(true), []);
  const pointerX = useRef<number | undefined>(undefined);
  const rotating = multi && !stopped;

  const go = (next: number, manual: boolean) => {
    setIndex(((next % count) + count) % count);
    if (manual) setStopped(true);
  };
  const slideLabel = (i: number) => labels.slideFormat.replaceAll("{n}", String(i + 1)).replaceAll("{total}", String(count));

  const onFocus = (e: FocusEvent<HTMLElement>) => {
    // KEYBOARD focus entering the carousel stops rotation (WAI-ARIA carousel pattern). A mouse
    // click on pause/play also focuses its button; that must not flip the button's own action.
    if ((e.target as HTMLElement).matches(":focus-visible") && !e.currentTarget.contains(e.relatedTarget as Node | null)) setStopped(true);
  };
  const onKeyDown = (e: KeyboardEvent<HTMLElement>) => {
    if (!multi || !(e.target as HTMLElement).closest("[data-hero-controls]")) return;
    if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
      e.preventDefault();
      go(index + (e.key === "ArrowRight" ? 1 : -1), true);
    }
  };
  const onPointerDown = (e: PointerEvent<HTMLDivElement>) => {
    pointerX.current = e.pointerType === "mouse" ? undefined : e.clientX;
  };
  const onPointerUp = (e: PointerEvent<HTMLDivElement>) => {
    const start = pointerX.current;
    pointerX.current = undefined;
    if (!multi || start === undefined) return;
    const dx = e.clientX - start;
    if (Math.abs(dx) >= SWIPE_PX) go(index + (dx < 0 ? 1 : -1), true);
  };
  const onTimerEnd = (e: AnimationEvent<HTMLSpanElement>) => {
    if (e.target === e.currentTarget) go(index + 1, false);
  };

  return (
    <section
      className="i1-hero"
      data-section="home.hero"
      aria-label={labels.region}
      aria-roledescription={multi ? "carousel" : undefined}
      data-slides={count}
      data-rotating={rotating ? "true" : "false"}
      data-paused={rotating && hovered ? "true" : undefined}
      // hover pause is for a real mouse only: taps emit compatibility mouse events with no
      // matching leave, which would pause the slideshow for good
      onPointerEnter={(e) => e.pointerType === "mouse" && setHovered(true)}
      onPointerLeave={(e) => e.pointerType === "mouse" && setHovered(false)}
      onFocus={multi ? onFocus : undefined}
      onKeyDown={multi ? onKeyDown : undefined}
    >
      {/* controls first in the DOM (absolutely positioned over the slides): tab order is pause/play → dots → arrows → slide link */}
      {multi ? (
        <div className="i1-hero__controls" data-hero-controls="">
          <div className="i1-hero__pager">
            <button
              type="button"
              className="i1-hero__toggle"
              aria-label={rotating ? labels.pause : labels.play}
              onClick={() => setStopped(rotating)}
              data-hero-toggle=""
            >
              {rotating ? <PauseIcon /> : <PlayIcon />}
            </button>
            {slides.map((s, i) => (
              <button
                key={s.id}
                type="button"
                className="i1-hero__dot"
                aria-label={slideLabel(i)}
                aria-current={i === index ? "true" : undefined}
                onClick={() => go(i, true)}
                data-hero-dot={i}
              >
                <span
                  className={i === index && rotating && ready ? "i1-hero__fill is-timing" : "i1-hero__fill"}
                  onAnimationEnd={i === index && rotating ? onTimerEnd : undefined}
                />
              </button>
            ))}
          </div>
          <button type="button" className="i1-hero__arrow i1-hero__arrow--prev" aria-label={labels.previous} onClick={() => go(index - 1, true)}>
            <ChevronIcon dir="left" />
          </button>
          <button type="button" className="i1-hero__arrow i1-hero__arrow--next" aria-label={labels.next} onClick={() => go(index + 1, true)}>
            <ChevronIcon dir="right" />
          </button>
        </div>
      ) : null}
      <div
        className="i1-hero__slides"
        aria-live={multi ? (rotating ? "off" : "polite") : undefined}
        onPointerDown={multi ? onPointerDown : undefined}
        onPointerUp={multi ? onPointerUp : undefined}
        onPointerCancel={() => (pointerX.current = undefined)}
      >
        {slides.map((s, i) => {
          const active = i === index;
          const copy = s.headline || s.text || s.cta;
          return (
            <div
              key={s.id}
              className="i1-hero__slide"
              data-hero-slide={s.id}
              data-active={active ? "true" : "false"}
              role={multi ? "group" : undefined}
              aria-roledescription={multi ? "slide" : undefined}
              aria-label={multi ? slideLabel(i) : undefined}
              aria-hidden={active ? undefined : true}
              inert={active ? undefined : true}
            >
              <img
                className="i1-hero__img"
                src={s.image.src}
                width={s.image.width}
                height={s.image.height}
                alt={s.image.alt}
                loading={i === 0 ? "eager" : "lazy"}
                fetchPriority={i === 0 ? "high" : undefined}
                decoding="async"
                draggable={false}
              />
              {copy ? (
                <div className="i1-container i1-hero__copy">
                  {s.headline ? <h2 className="i1-hero__headline">{s.headline}</h2> : null}
                  {s.text ? <p className="i1-hero__text">{s.text}</p> : null}
                  {s.cta ? (
                    s.cta.internal ? (
                      <Link href={s.cta.href} className="i1-pill i1-pill--light">
                        {s.cta.label}
                        <ChevronIcon dir="right" />
                      </Link>
                    ) : (
                      <a href={s.cta.href} className="i1-pill i1-pill--light">
                        {s.cta.label}
                        <ChevronIcon dir="right" />
                      </a>
                    )
                  ) : null}
                </div>
              ) : null}
            </div>
          );
        })}
      </div>
    </section>
  );
}
