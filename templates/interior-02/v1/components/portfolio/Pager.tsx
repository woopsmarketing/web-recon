import Link from "next/link";

/**
 * The no-script form of the list: real crawlable links to the static list routes
 * (/portfolio = page 1, /portfolio/page/n). With script the browser island replaces it by
 * batch reveal, so it is only ever seen without JavaScript or before hydration.
 */
export interface PagerProps {
  page: number;
  pageCount: number;
  labels: { nav: string; page: string; previous: string; next: string };
}

export function pageHref(n: number): string {
  return n <= 1 ? "/portfolio" : `/portfolio/page/${n}`;
}

/** Page numbers to show: all when ≤ 7, else first · window of 5 around current · last, with gaps. */
export function pageWindow(page: number, pageCount: number): (number | "gap")[] {
  if (pageCount <= 7) return Array.from({ length: pageCount }, (_, i) => i + 1);
  const start = Math.max(2, Math.min(page - 2, pageCount - 5));
  const end = Math.min(pageCount - 1, Math.max(page + 2, 6));
  const out: (number | "gap")[] = [1];
  if (start > 2) out.push("gap");
  for (let n = start; n <= end; n++) out.push(n);
  if (end < pageCount - 1) out.push("gap");
  out.push(pageCount);
  return out;
}

export function Pager({ page, pageCount, labels }: PagerProps) {
  if (pageCount < 2) return null;
  return (
    <nav className="i2-pager" aria-label={labels.nav} data-pager="">
      {page > 1 ? (
        <Link href={pageHref(page - 1)} className="i2-pager__step" aria-label={labels.previous} rel="prev" data-page-step="prev">
          ‹
        </Link>
      ) : (
        <span className="i2-pager__step is-disabled" aria-hidden="true">
          ‹
        </span>
      )}
      <ol className="i2-pager__list">
        {pageWindow(page, pageCount).map((n, i) =>
          n === "gap" ? (
            <li key={`gap-${i}`} className="i2-pager__gap" aria-hidden="true">
              …
            </li>
          ) : (
            <li key={n}>
              {n === page ? (
                <span className="i2-pager__num is-current" aria-current="page" data-page={n}>
                  <span className="i2-sr">{labels.page} </span>
                  {n}
                </span>
              ) : (
                <Link href={pageHref(n)} className="i2-pager__num" data-page={n}>
                  <span className="i2-sr">{labels.page} </span>
                  {n}
                </Link>
              )}
            </li>
          ),
        )}
      </ol>
      {page < pageCount ? (
        <Link href={pageHref(page + 1)} className="i2-pager__step" aria-label={labels.next} rel="next" data-page-step="next">
          ›
        </Link>
      ) : (
        <span className="i2-pager__step is-disabled" aria-hidden="true">
          ›
        </span>
      )}
    </nav>
  );
}
