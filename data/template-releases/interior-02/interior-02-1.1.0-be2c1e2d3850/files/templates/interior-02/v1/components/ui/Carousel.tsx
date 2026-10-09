"use client";

import {
  Children,
  useEffect,
  useRef,
  useState,
  type AnimationEvent,
  type FocusEvent,
  type KeyboardEvent,
  type PointerEvent,
  type ReactNode,
  type TransitionEvent,
} from "react";

/**
 * Carousel — the ONE slider of interior-02 (home hero, keyword row, showroom row on narrow
 * screens, related-project rows, gallery sliders). Slides are server-rendered children; the
 * component only moves ONE track with `transform: translateX` (duration from `duration`,
 * ease) and loops endlessly (loop copies of the slides sit before and after the real ones;
 * after a slide onto a copy the track jumps, without a transition, to the real slide).
 *
 * Autoplay has NO timer: a CSS animation of `dwell` ms runs on the progress fill (or on a
 * hidden timer element) once a slide has settled, and its `animationend` advances the slide.
 * Pausing is `animation-play-state`; `prefers-reduced-motion` removes the animation (no end
 * event = no rotation) and the slide transition (navigation is then immediate). Hover does
 * not pause. The first slide is what the server HTML shows; the timer class is only applied
 * after hydration so a slow hydration can never miss the end event. Manual navigation
 * (buttons, arrow keys on the control row, touch swipe) re-arms the dwell, as the source does.
 *
 * Props
 *   label            accessible name of the carousel
 *   className        extra class on the root; the owning section's CSS sets the layout custom
 *                    properties on it (see below) and places `.i2-c__bar`
 *   autoplay         true = rotates (after hydration); false = starts stopped (the toggle says "play")
 *   dwell            rest time of a settled slide in ms (default 4000)
 *   duration         slide movement in ms (default 500)
 *   progress         "fill"  = continuous fill of the bar over the dwell, re-armed after each change
 *                    "steps" = bar = (index + 1) / count of the track width, animated 200 ms
 *                    "none"  = no bar
 *   controls         prev / next / stop-play buttons (needs `labels`); false = none
 *   labels           accessible names of the buttons: { previous, next, pause, play }
 *   slideLabelFormat "{n}" / "{total}" → each slide's accessible name (e.g. "Slide {n} of {total}");
 *                    omitted = slides carry no name
 *   loop             true (default) = endless, as described above. false = no loop copies: the
 *                    track stops at the last page (= slide count − slides per view, the latter read
 *                    from the CSS `--i2-c-per` after mount and on resize), prev / next are disabled
 *                    at the ends, autoplay ends on the last page, and the stepped bar shows
 *                    page / pages. Nothing else changes.
 *   children         the slides (one child = one slide), server-rendered
 *
 * Layout is CSS, set per breakpoint by the owning section on the root (desktop-first):
 *   --i2-c-per    slides per view (default 1)
 *   --i2-c-gap    gap between slides (default 0px)
 *   --i2-c-stage  width of the stage (the strip of fully visible slides) inside the viewport
 *                 (default 100%); a narrower stage lets the track bleed past its edges inside
 *                 the clipping `.i2-c__viewport`
 *   --i2-c-track / --i2-c-fill   colours of the progress bar
 * `[data-active]` marks every copy of the current slide (sections hang entrance effects on it);
 * the root carries `data-stopped="true"` while stopped and `data-busy="true"` while sliding.
 */
export interface CarouselLabels {
  previous: string;
  next: string;
  pause: string;
  play: string;
}

export interface CarouselProps {
  label: string;
  className?: string;
  autoplay: boolean;
  dwell?: number;
  duration?: number;
  progress: "fill" | "steps" | "none";
  controls: boolean;
  labels?: CarouselLabels;
  slideLabelFormat?: string;
  loop?: boolean;
  children: ReactNode;
}

const SWIPE_PX = 48;
/** loop copies on each side: enough for 4 per view plus one bleeding neighbour */
const MIN_COPIES = 5;

interface TrackState {
  /** position in the extended track (copies before + real slides + copies after) */
  pos: number;
  /** false = this render must not transition (the silent jump after a loop crossing) */
  animate: boolean;
}

export function Carousel({ label, className, autoplay, dwell = 4000, duration = 500, progress, controls, labels, slideLabelFormat, loop: endless = true, children }: CarouselProps) {
  const slides = Children.toArray(children);
  const n = slides.length;
  // `loop` = the slider is live (more than one slide); `wrap` = it is also endless (loop copies)
  const loop = n > 1;
  const wrap = loop && endless;
  const copies = !wrap ? 0 : n >= MIN_COPIES ? MIN_COPIES : n * Math.ceil(MIN_COPIES / n);

  const [track, setTrack] = useState<TrackState>({ pos: copies, animate: false });
  const [busy, setBusy] = useState(false);
  const [stopped, setStopped] = useState(!autoplay);
  // false in the server HTML and the first client render; true once handlers are attached
  const [ready, setReady] = useState(false);
  // incremented after every settled change: re-mounts the timer element = re-arms the dwell
  const [tick, setTick] = useState(0);
  // non-endless mode only: slides per view (the CSS `--i2-c-per` of the root), 1 until measured
  const [per, setPer] = useState(1);
  const reduced = useRef(false);
  const pointer = useRef<{ x: number; y: number } | undefined>(undefined);
  const root = useRef<HTMLDivElement>(null);

  useEffect(() => {
    reduced.current = matchMedia("(prefers-reduced-motion: reduce)").matches;
    setReady(true);
  }, []);

  useEffect(() => {
    const el = root.current;
    if (wrap || !el) return;
    const read = () => setPer(Math.max(1, Math.floor(Number(getComputedStyle(el).getPropertyValue("--i2-c-per")) || 1)));
    read();
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(read);
    observer.observe(el);
    return () => observer.disconnect();
  }, [wrap]);

  // the last reachable track position: endless = any; otherwise the last page
  const last = wrap ? n - 1 : Math.max(0, n - per);
  const index = loop ? (((track.pos - copies) % n) + n) % n : 0;
  const normalize = (p: number) => (p >= copies + n ? p - n : p < copies ? p + n : p);
  const clamp = (p: number) => (wrap ? p : Math.min(last, Math.max(0, p)));

  // fewer pages after a resize: pull the track back to the last page
  useEffect(() => {
    if (wrap) return;
    setTrack((t) => (t.pos > last ? { pos: last, animate: false } : t));
  }, [wrap, last]);

  const settle = () => {
    setBusy(false);
    setTrack((t) => {
      const p = normalize(t.pos);
      return p === t.pos ? t : { pos: p, animate: false };
    });
    setTick((t) => t + 1);
  };
  const go = (delta: number) => {
    if (!loop || busy || delta === 0) return;
    if (!wrap && clamp(track.pos + delta) === track.pos) return;
    if (reduced.current) {
      setTrack((t) => ({ pos: normalize(clamp(t.pos + delta)), animate: false }));
      setTick((t) => t + 1);
      return;
    }
    setBusy(true);
    setTrack((t) => ({ pos: clamp(t.pos + delta), animate: true }));
  };

  const onTrackEnd = (e: TransitionEvent<HTMLDivElement>) => {
    if (e.target === e.currentTarget && e.propertyName === "transform") settle();
  };
  const onTimerEnd = (e: AnimationEvent<HTMLSpanElement>) => {
    if (e.target === e.currentTarget) go(1);
  };
  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
      e.preventDefault();
      go(e.key === "ArrowRight" ? 1 : -1);
    }
  };
  const onPointerDown = (e: PointerEvent<HTMLDivElement>) => {
    pointer.current = e.pointerType === "mouse" ? undefined : { x: e.clientX, y: e.clientY };
  };
  const onPointerUp = (e: PointerEvent<HTMLDivElement>) => {
    const start = pointer.current;
    pointer.current = undefined;
    if (!start) return;
    const dx = e.clientX - start.x;
    const dy = e.clientY - start.y;
    if (Math.abs(dx) >= SWIPE_PX && Math.abs(dx) > Math.abs(dy)) go(dx < 0 ? 1 : -1);
  };
  // Keyboard focus landing on a slide outside the stage: undo the browser's reveal scroll of
  // the clipping viewport and move the track there instead.
  const onFocus = (e: FocusEvent<HTMLDivElement>) => {
    const viewport = e.currentTarget;
    viewport.scrollLeft = 0;
    const slide = (e.target as HTMLElement).closest<HTMLElement>("[data-c-pos]");
    if (!slide || !loop) return;
    const r = slide.getBoundingClientRect();
    const v = viewport.getBoundingClientRect();
    if (r.left < v.left - 1 || r.right > v.right + 1) go(Number(slide.dataset.cPos) - track.pos);
  };

  const slideLabel = (i: number) => slideLabelFormat?.replaceAll("{n}", String(i + 1)).replaceAll("{total}", String(n));
  const items: { key: string; real: number; pos: number; copy: boolean }[] = [];
  for (let j = 0; j < copies; j++) items.push({ key: `b${j}`, real: (((n - copies + j) % n) + n) % n, pos: j, copy: true });
  for (let i = 0; i < n; i++) items.push({ key: `s${i}`, real: i, pos: copies + i, copy: false });
  for (let j = 0; j < copies; j++) items.push({ key: `a${j}`, real: j % n, pos: copies + n + j, copy: true });

  // the dwell runs while the slider is live and settled; a non-endless slider rests on its last page
  const timing = loop && ready && !busy && (wrap || index < last);
  const timerClass = timing ? "is-timing" : undefined;
  const rootClass = ["i2-c", className].filter(Boolean).join(" ");

  return (
    <div
      ref={root}
      className={rootClass}
      role="group"
      aria-roledescription={loop ? "carousel" : undefined}
      aria-label={label}
      data-carousel=""
      data-count={n}
      data-index={index}
      data-stopped={stopped ? "true" : "false"}
      data-busy={busy ? "true" : "false"}
      style={{ ["--i2-c-duration" as string]: `${duration}ms`, ["--i2-c-dwell" as string]: `${dwell}ms` }}
    >
      <div
        className="i2-c__viewport"
        onPointerDown={loop ? onPointerDown : undefined}
        onPointerUp={loop ? onPointerUp : undefined}
        onPointerCancel={() => (pointer.current = undefined)}
        onFocus={onFocus}
      >
        <div className="i2-c__stage">
          <div
            className={track.animate ? "i2-c__track" : "i2-c__track is-static"}
            style={{ ["--i2-c-pos" as string]: String(track.pos) }}
            onTransitionEnd={loop ? onTrackEnd : undefined}
            onTransitionCancel={loop ? onTrackEnd : undefined}
            aria-live={loop ? (stopped ? "polite" : "off") : undefined}
          >
            {items.map((it) => (
              <div
                key={it.key}
                className="i2-c__slide"
                data-c-pos={it.pos}
                data-c-index={it.real}
                data-active={it.real === index ? "true" : undefined}
                data-copy={it.copy ? "" : undefined}
                aria-hidden={it.copy ? true : undefined}
                inert={it.copy ? true : undefined}
                role={!it.copy && loop ? "group" : undefined}
                aria-roledescription={!it.copy && loop ? "slide" : undefined}
                aria-label={!it.copy && loop ? slideLabel(it.real) : undefined}
              >
                {slides[it.real]}
              </div>
            ))}
          </div>
        </div>
      </div>
      {loop && (progress !== "none" || controls) ? (
        <div className="i2-c__bar" data-c-bar="" onKeyDown={onKeyDown}>
          {progress === "fill" ? (
            <div className="i2-c__progress" aria-hidden="true">
              <span key={tick} className={["i2-c__fill", timerClass].filter(Boolean).join(" ")} onAnimationEnd={onTimerEnd} />
            </div>
          ) : null}
          {progress === "steps" ? (
            <div className="i2-c__progress" aria-hidden="true">
              <span className="i2-c__fill i2-c__fill--steps" style={{ width: `${Math.round(((index + 1) / (wrap ? n : last + 1)) * 10000) / 100}%` }} />
            </div>
          ) : null}
          {progress !== "fill" ? <span key={tick} className={["i2-c__timer", timerClass].filter(Boolean).join(" ")} onAnimationEnd={onTimerEnd} aria-hidden="true" /> : null}
          {controls && labels ? (
            <div className="i2-c__controls">
              <button type="button" className="i2-c__btn" aria-label={labels.previous} data-c-prev="" disabled={!wrap && index <= 0} onClick={() => go(-1)}>
                <ChevronLeft />
              </button>
              <button type="button" className="i2-c__btn" aria-label={labels.next} data-c-next="" disabled={!wrap && index >= last} onClick={() => go(1)}>
                <ChevronRight />
              </button>
              <button type="button" className="i2-c__btn i2-c__btn--toggle" aria-label={stopped ? labels.play : labels.pause} data-c-toggle="" onClick={() => setStopped((s) => !s)}>
                {stopped ? <Play /> : <Pause />}
              </button>
            </div>
          ) : null}
        </div>
      ) : progress !== "fill" && loop ? (
        <span key={tick} className={["i2-c__timer", timerClass].filter(Boolean).join(" ")} onAnimationEnd={onTimerEnd} aria-hidden="true" />
      ) : null}
    </div>
  );
}

/* Control glyphs: 12 px line icons (stroke, currentColor), drawn here so the slider has no
   dependency beyond React. */
const svg = { width: 12, height: 12, viewBox: "0 0 12 12", fill: "none", stroke: "currentColor", strokeWidth: 1.5, strokeLinecap: "round" as const, strokeLinejoin: "round" as const, "aria-hidden": true, focusable: "false" as const };
function ChevronLeft() {
  return (
    <svg {...svg}>
      <path d="M8 1.5 3.5 6 8 10.5" />
    </svg>
  );
}
function ChevronRight() {
  return (
    <svg {...svg}>
      <path d="m4 1.5 4.5 4.5L4 10.5" />
    </svg>
  );
}
function Pause() {
  return (
    <svg {...svg}>
      <path d="M3.5 1.5v9M8.5 1.5v9" />
    </svg>
  );
}
function Play() {
  return (
    <svg {...svg}>
      <path d="M3 1.5v9l7-4.5z" />
    </svg>
  );
}
