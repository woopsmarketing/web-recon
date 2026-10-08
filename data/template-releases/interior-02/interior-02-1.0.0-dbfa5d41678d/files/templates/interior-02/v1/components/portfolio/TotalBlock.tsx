"use client";

import { useId, useState } from "react";
import { Icon } from "../ui/Icon";

/**
 * The project's total price block: the total row (label · amount + unit, or the "withheld" text)
 * and, under it, the plain fact rows the content model has (price per area, floor area, duration,
 * work period), the scope items and optional notes. Rendered ONCE in the page; CSS places it in
 * the pinned right aside above 1280 and inside the head (under the title) at ≤ 1280, where the
 * round toggle collapses the rows (reference behaviour). The toggle is hidden above 1280 and the
 * rows are always shown there, whatever its state.
 */
export interface TotalBlockProps {
  /** the project card's figure + unit (every digit); a range figure is "min ~ max" */
  total?: { figure: string; unit: string; range: boolean };
  withheld: string;
  labels: { total: string; details: string };
  rows: { label: string; value: string }[];
  scope?: { label: string; items: string[] };
  notes: string[];
}

const RANGE_SEP = " ~ ";

export function TotalBlock({ total, withheld, labels, rows, scope, notes }: TotalBlockProps) {
  const [open, setOpen] = useState(true);
  const id = `${useId()}-details`;
  const hasDetails = rows.length > 0 || (scope !== undefined && scope.items.length > 0) || notes.length > 0;
  // a range breaks after "min ~" so each end keeps its digits together and the unit stays on the last one
  const ends = total?.range && total.figure.includes(RANGE_SEP) ? total.figure.split(RANGE_SEP) : undefined;
  return (
    <div className={ends ? "i2-ptotal i2-ptotal--range" : "i2-ptotal"} data-total-block="" data-collapsed={open ? undefined : ""}>
      <div className="i2-ptotal__row">
        <span className="i2-ptotal__label">{labels.total}</span>
        {total ? (
          <span className={ends ? "i2-ptotal__amount i2-ptotal__amount--range" : "i2-ptotal__amount"} data-total-amount="">
            {ends ? (
              <>
                <strong className="i2-ptotal__from">{ends[0]}&nbsp;~</strong>
                <strong>{ends.slice(1).join(RANGE_SEP)}</strong>
              </>
            ) : (
              <strong>{total.figure}</strong>
            )}
            <small>{total.unit}</small>
          </span>
        ) : (
          <span className="i2-ptotal__withheld" data-total-withheld="">
            {withheld}
          </span>
        )}
        {hasDetails ? (
          <button type="button" className="i2-ptotal__toggle" aria-expanded={open} aria-controls={id} aria-label={labels.details} onClick={() => setOpen((o) => !o)} data-total-toggle="">
            <Icon name="chevron-down" size={14} />
          </button>
        ) : null}
      </div>
      {hasDetails ? (
        <div id={id} className="i2-ptotal__details" data-total-details="">
          {rows.length > 0 ? (
            <dl className="i2-ptotal__list">
              {rows.map((r) => (
                <div key={r.label} className="i2-ptotal__item">
                  <dt>{r.label}</dt>
                  <dd>{r.value}</dd>
                </div>
              ))}
            </dl>
          ) : null}
          {scope && scope.items.length > 0 ? (
            <div className="i2-ptotal__scope">
              <p className="i2-ptotal__scope-label">{scope.label}</p>
              <ul className="i2-ptotal__scope-list">
                {scope.items.map((item, i) => (
                  <li key={i}>{item}</li>
                ))}
              </ul>
            </div>
          ) : null}
          {notes.length > 0 ? (
            <ul className="i2-ptotal__notes">
              {notes.map((n, i) => (
                <li key={i}>{n}</li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
