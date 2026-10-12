"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";

/**
 * Reveal — marks its root `data-revealed="true"` once, when the block reaches 75 % of the
 * viewport (its top enters the upper three quarters), like the source's one scroll-triggered
 * effect. The CSS of the owning section does the movement. Without IntersectionObserver the
 * block is revealed at once; the server HTML is the un-revealed state.
 */
export function Reveal({ className, children }: { className?: string; children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
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
      { rootMargin: "0px 0px -25% 0px" },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  return (
    <div ref={ref} className={className} data-revealed={on ? "true" : "false"}>
      {children}
    </div>
  );
}
