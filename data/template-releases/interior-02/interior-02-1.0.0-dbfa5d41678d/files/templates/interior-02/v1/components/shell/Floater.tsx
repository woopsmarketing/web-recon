"use client";

import Link from "next/link";
import { Icon } from "../ui/Icon";

/**
 * The fixed bottom-right controls (client): a to-top button (always) and an optional contact link
 * (the place where the reference has its chat launcher). To-top scrolls the document to 0 — smooth
 * unless the visitor prefers reduced motion. Position: bottom/right 24 (84/12 at ≤ 640, above the
 * tab bar; bottom 20 while the tab bar is hidden — CSS).
 */
export function Floater({ topLabel, contact }: { topLabel: string; contact?: { href: string; label: string } }) {
  const toTop = () => {
    const root = document.scrollingElement ?? document.documentElement;
    const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
    root.scrollTo({ top: 0, behavior: reduce ? "auto" : "smooth" });
  };
  return (
    <div className="i2-floater" data-section="site.floater">
      <button type="button" className="i2-floater__top" aria-label={topLabel} onClick={toTop} data-to-top="">
        <Icon name="arrow-up" size={26} />
      </button>
      {contact ? (
        <Link href={contact.href} className="i2-floater__contact" aria-label={contact.label} data-floating-contact="">
          <Icon name="chat" size={30} />
        </Link>
      ) : null}
    </div>
  );
}
