"use client";

import { useEffect, useRef, useState } from "react";
import { ShellIcon } from "./ShellIcons";

/**
 * The optional "back to top" button (client; site.floater.toTop). A sentinel covers the first
 * 600px of the document; once it has left the viewport upwards the button fades in (CSS), near
 * the top it leaves again. IntersectionObserver only (no scroll maths). Pressing it scrolls the
 * document to 0 — smooth unless the visitor prefers reduced motion. Its place (bottom-right corner,
 * above a site-declared third-party widget box) is CSS.
 */
export function ToTop({ label }: { label: string }) {
  const sentinel = useRef<HTMLDivElement>(null);
  const [shown, setShown] = useState(false);
  useEffect(() => {
    const el = sentinel.current;
    if (!el) return;
    const io = new IntersectionObserver(([entry]) => {
      if (entry) setShown(!entry.isIntersecting && entry.boundingClientRect.top < 0);
    });
    io.observe(el);
    return () => io.disconnect();
  }, []);
  const toTop = () => {
    const root = document.scrollingElement ?? document.documentElement;
    const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
    root.scrollTo({ top: 0, behavior: reduce ? "auto" : "smooth" });
  };
  return (
    <>
      <div ref={sentinel} className="i3-top-sentinel" aria-hidden="true" />
      <button type="button" className="i3-totop" aria-label={label} data-to-top="" data-shown={shown ? "" : undefined} tabIndex={shown ? undefined : -1} onClick={toTop}>
        <ShellIcon name="arrow-up" size={20} strokeWidth={1.8} />
      </button>
    </>
  );
}
