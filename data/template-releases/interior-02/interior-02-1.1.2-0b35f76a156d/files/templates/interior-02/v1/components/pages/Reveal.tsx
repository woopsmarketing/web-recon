"use client";

import { createElement, useEffect, useRef, useState, type HTMLAttributes, type ReactNode } from "react";

/**
 * Reveal (PAGES) — marks its root `data-revealed="true"` once, when the block enters the lower
 * four fifths of the viewport; the server HTML carries `data-revealed="false"` so the CSS of the
 * owning block can hold its entrance state (rise, rotate-in, slide-in, drawn check marks).
 * Without IntersectionObserver the block is revealed at once; without script the owning page
 * neutralises the entrance state with a <noscript> style (see sections/AboutPage.tsx).
 *   <Reveal as="section" className="…" aria-labelledby="…">…</Reveal>
 */
export interface RevealProps extends HTMLAttributes<HTMLElement> {
  as?: "div" | "section" | "li" | "figure";
  /** Observer root margin (default: the block counts as visible once its top passes 80 % of the viewport). */
  rootMargin?: string;
  children: ReactNode;
}

export function Reveal({ as = "div", rootMargin = "0px 0px -20% 0px", children, ...rest }: RevealProps) {
  const ref = useRef<HTMLElement>(null);
  const [on, setOn] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (typeof IntersectionObserver === "undefined") {
      setOn(true);
      return;
    }
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setOn(true);
          io.disconnect();
        }
      },
      { rootMargin },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [rootMargin]);

  return createElement(as, { ...rest, ref, "data-revealed": on ? "true" : "false" }, children);
}
