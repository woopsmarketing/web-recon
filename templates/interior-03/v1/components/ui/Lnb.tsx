import Link from "next/link";

/**
 * The tab strip under the banner (SHELL shared block): equal-width cells in one bordered row, the
 * selected one filled with the accent. Each item is a link (`href`) or, inside a client component
 * that filters in place, a button (`onSelect`). ≤ 480 the cells wrap two per row (base.css).
 *   <Lnb label="…" items={[{ key, label, selected, href }]} />
 *   <Lnb label="…" items={[{ key, label, selected }]} onSelect={(key) => …} />
 * Fewer than two items = nothing (a strip with one tab says nothing).
 */
export interface LnbItem {
  key: string;
  label: string;
  selected: boolean;
  href?: string;
}

export function Lnb({ label, items, onSelect }: { label: string; items: LnbItem[]; onSelect?: (key: string) => void }) {
  if (items.length < 2) return null;
  return (
    <nav className="i3-lnb" aria-label={label} data-lnb="">
      <div className="i3-wrap">
        <ul className="i3-lnb__list">
          {items.map((item) => (
            <li key={item.key} className="i3-lnb__cell">
              {item.href !== undefined ? (
                <Link href={item.href} className="i3-lnb__item" aria-current={item.selected ? "page" : undefined} data-lnb-item={item.key}>
                  {item.label}
                </Link>
              ) : (
                <button type="button" className="i3-lnb__item" aria-pressed={item.selected} data-lnb-item={item.key} onClick={onSelect ? () => onSelect(item.key) : undefined}>
                  {item.label}
                </button>
              )}
            </li>
          ))}
        </ul>
      </div>
    </nav>
  );
}
