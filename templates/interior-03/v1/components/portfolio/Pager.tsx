import Link from "next/link";
import { fill } from "../../lib/format";
import type { PagerLabels } from "./types";

/**
 * The numeric pager of the project list: 30px boxes in one centred row (2px apart, 1px rule),
 * the current number in the warm accent and not a link, a step arrow at each end. Numbers come
 * in BLOCKS of 6 (1–6, 7–12, …): "previous" goes to the last page of the previous block, "next"
 * to the first page of the next block; on the first / last block the arrow is still drawn but
 * inert (a disabled control). Hover on a number: quiet surface + strong border, instant.
 * Two forms with the same markup:
 *   <Pager page pageCount labels />              links to the static routes (/portfolio = page 1,
 *                                                /portfolio/page/n) — the no-script form
 *   <Pager page pageCount labels onSelect />     buttons: client-side pages of a filtered list
 * Nothing renders with fewer than two pages.
 */
export function pageHref(n: number): string {
  return n <= 1 ? "/portfolio" : `/portfolio/page/${n}`;
}

export const PAGE_BLOCK = 6;

/** The block of page numbers that holds `page`, and the targets of the two arrows (undefined = inert). */
export function pageBlock(page: number, pageCount: number): { numbers: number[]; prev?: number; next?: number } {
  const start = Math.floor((page - 1) / PAGE_BLOCK) * PAGE_BLOCK + 1;
  const end = Math.min(start + PAGE_BLOCK - 1, pageCount);
  const numbers = Array.from({ length: end - start + 1 }, (_, i) => start + i);
  return { numbers, prev: start > 1 ? start - 1 : undefined, next: end < pageCount ? end + 1 : undefined };
}

function Arrow({ dir }: { dir: "prev" | "next" }) {
  return (
    <svg width="8" height="10" viewBox="0 0 8 10" aria-hidden="true" focusable="false">
      <path d={dir === "prev" ? "M6 1 2 5l4 4" : "M2 1l4 4-4 4"} fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function Pager({ page, pageCount, labels, onSelect }: { page: number; pageCount: number; labels: PagerLabels; onSelect?: (n: number) => void }) {
  if (pageCount < 2) return null;
  const { numbers, prev, next } = pageBlock(page, pageCount);
  const item = (n: number, label: string, children: React.ReactNode, extra: { rel?: string; "data-page-step"?: string }) =>
    onSelect ? (
      <button type="button" className="i3-pager__item" aria-label={label} onClick={() => onSelect(n)} data-page={n} {...extra}>
        {children}
      </button>
    ) : (
      <Link href={pageHref(n)} className="i3-pager__item" aria-label={label} data-page={n} {...extra}>
        {children}
      </Link>
    );
  const step = (dir: "prev" | "next", target: number | undefined) => {
    const label = dir === "prev" ? labels.prev : labels.next;
    if (target !== undefined) return item(target, label, <Arrow dir={dir} />, { rel: dir, "data-page-step": dir });
    return onSelect ? (
      <button type="button" className="i3-pager__item" aria-label={label} aria-disabled="true" disabled data-page-step={dir}>
        <Arrow dir={dir} />
      </button>
    ) : (
      <a className="i3-pager__item" aria-label={label} aria-disabled="true" data-page-step={dir}>
        <Arrow dir={dir} />
      </a>
    );
  };
  return (
    <nav className="i3-pager" aria-label={labels.nav} data-pager={onSelect ? "client" : "static"}>
      <ul className="i3-pager__list">
        <li>{step("prev", prev)}</li>
        {numbers.map((n) => (
          <li key={n}>
            {n === page ? (
              <strong className="i3-pager__item i3-pager__item--current" aria-current="page" aria-label={fill(labels.page, { n })} data-page={n}>
                {n}
              </strong>
            ) : (
              item(n, fill(labels.page, { n }), n, {})
            )}
          </li>
        ))}
        <li>{step("next", next)}</li>
      </ul>
    </nav>
  );
}
