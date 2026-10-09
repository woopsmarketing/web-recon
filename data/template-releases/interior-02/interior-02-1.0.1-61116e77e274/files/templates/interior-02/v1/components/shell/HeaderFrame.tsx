"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";

/**
 * The header's frame (client). variant "home": a sentinel sits at the header's rest position
 * (top 24px, 32 above 1500); once it leaves the viewport upwards the header gets `data-stuck`
 * and CSS turns the floating card into the fixed full-width bar; near the top it returns.
 * IntersectionObserver only (no window, no scroll maths). variant "sub": no sentinel, no state —
 * the bar is sticky from the start (CSS).
 */
export function HeaderFrame({ variant, className, children }: { variant: "home" | "sub"; className: string; children: ReactNode }) {
  const sentinel = useRef<HTMLDivElement>(null);
  const [stuck, setStuck] = useState(false);
  useEffect(() => {
    const el = sentinel.current;
    if (!el) return;
    const io = new IntersectionObserver(([entry]) => {
      if (entry) setStuck(!entry.isIntersecting && entry.boundingClientRect.top < 0);
    });
    io.observe(el);
    return () => io.disconnect();
  }, []);
  return (
    <>
      {variant === "home" ? <div ref={sentinel} className="i2-header__sentinel" aria-hidden="true" /> : null}
      <header className={className} data-section="site.header" data-variant={variant} data-stuck={stuck ? "" : undefined}>
        {children}
      </header>
    </>
  );
}
