import Link from "next/link";

export interface PaginationProps {
  page: number;
  pageCount: number;
  /** URL of page n (page 1 = the list root; never ".../page/1") */
  hrefs: string[];
  labels: { nav: string; previous: string; next: string; page: string };
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

/** Real crawlable page links (no JS state); current page is aria-current. */
export function Pagination({ page, pageCount, hrefs, labels }: PaginationProps) {
  if (pageCount < 2) return null;
  const href = (n: number) => hrefs[n - 1]!;
  return (
    <nav className="i1-pager" aria-label={labels.nav} data-pager="">
      {page > 1 ? (
        <Link href={href(page - 1)} className="i1-pager__step" aria-label={labels.previous} rel="prev" data-page-step="prev">
          ‹
        </Link>
      ) : (
        <span className="i1-pager__step is-disabled" aria-hidden="true">
          ‹
        </span>
      )}
      <ol className="i1-pager__list">
        {pageWindow(page, pageCount).map((n, i) =>
          n === "gap" ? (
            <li key={`gap-${i}`} className="i1-pager__gap" aria-hidden="true">
              …
            </li>
          ) : (
            <li key={n}>
              {n === page ? (
                <span className="i1-pager__num is-current" aria-current="page" data-page={n}>
                  <span className="i1-sr">{labels.page} </span>
                  {n}
                </span>
              ) : (
                <Link href={href(n)} className="i1-pager__num" data-page={n}>
                  <span className="i1-sr">{labels.page} </span>
                  {n}
                </Link>
              )}
            </li>
          ),
        )}
      </ol>
      {page < pageCount ? (
        <Link href={href(page + 1)} className="i1-pager__step" aria-label={labels.next} rel="next" data-page-step="next">
          ›
        </Link>
      ) : (
        <span className="i1-pager__step is-disabled" aria-hidden="true">
          ›
        </span>
      )}
    </nav>
  );
}
