"use client";

import { useEffect, useState } from "react";
import { Lnb } from "../ui/Lnb";
import { PageTitle } from "../ui/PageTitle";

export interface FaqItem {
  key: string;
  /** the item's own number (its slot number), shown in the first column whatever the filter */
  number: number;
  question: string;
  /** one string per paragraph */
  answer: string[];
  topic?: string;
}

export interface FaqTab {
  /** "all" or "t:<topic>" */
  key: string;
  label: string;
  /** the topic this tab shows; absent on the "all" tab */
  topic?: string;
}

export interface FaqBoardProps {
  title: string;
  lead?: string;
  items: FaqItem[];
  tabs: FaqTab[];
  labels: { tabs: string; number: string; question: string; topic: string; empty: string };
}

const ALL = "all";
/** without script every answer row is shown (a button cannot open one): this rule lives in <noscript> */
const NOSCRIPT_CSS = ".i3-board__answer[hidden]{display:table-row}";

/**
 * The topic tabs (Lnb buttons, radio-like, no navigation) + the page title + the list table.
 *
 * Every item is two table rows: the row (number · question · topic) and the answer row right under
 * it (one cell across the table). The question is a real <button aria-expanded aria-controls>:
 * pressing it (pointer, Enter or Space) shows or hides the answer row; several may be open. Until
 * this island is mounted the answer rows carry `hidden`, and a <noscript> stylesheet shows them all
 * for a visitor without script. A tab hides every row of another topic (the answer row with it);
 * the numbers are the items' own. No timers, no measuring.
 */
export function FaqBoard({ title, lead, items, tabs, labels }: FaqBoardProps) {
  const [tab, setTab] = useState(ALL);
  const [open, setOpen] = useState<ReadonlySet<string>>(() => new Set());
  const [enhanced, setEnhanced] = useState(false);

  useEffect(() => {
    setEnhanced(true);
  }, []);

  const toggle = (key: string) =>
    setOpen((current) => {
      const next = new Set(current);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });

  const selected = tabs.find((t) => t.key === tab) ?? tabs[0];
  const topic = selected?.topic;

  return (
    <>
      <Lnb label={labels.tabs} items={tabs.map((t) => ({ key: t.key, label: t.label, selected: t.key === tab }))} onSelect={setTab} />
      <div className="i3-content">
        <div className="i3-wrap">
          <PageTitle title={title} lead={lead} id="i3-faq-title" />
          <div className="i3-page">
            <noscript>
              <style>{NOSCRIPT_CSS}</style>
            </noscript>
            <table className="i3-board" data-faq-list="" data-enhanced={enhanced ? "" : undefined}>
              <colgroup>
                <col className="i3-board__col-no" />
                <col className="i3-board__col-q" />
                <col className="i3-board__col-topic" />
              </colgroup>
              <thead>
                <tr>
                  <th scope="col" className="i3-board__no">
                    {labels.number}
                  </th>
                  <th scope="col" className="i3-board__q">
                    {labels.question}
                  </th>
                  <th scope="col" className="i3-board__topic">
                    {labels.topic}
                  </th>
                </tr>
              </thead>
              <tbody>
                {items.length === 0 ? (
                  <tr className="i3-board__empty" data-faq-empty="">
                    <td colSpan={3}>{labels.empty}</td>
                  </tr>
                ) : (
                  items.map((item) => {
                    const shown = topic === undefined || item.topic === topic;
                    const isOpen = open.has(item.key);
                    const headId = `i3-faq-${item.key}-head`;
                    const panelId = `i3-faq-${item.key}-panel`;
                    return [
                      <tr key={item.key} className="i3-board__row" hidden={!shown} data-faq-item={item.key} data-open={enhanced ? String(isOpen) : undefined}>
                        <td className="i3-board__no">{item.number}</td>
                        <td className="i3-board__q">
                          <button type="button" id={headId} className="i3-board__toggle" aria-expanded={enhanced ? isOpen : undefined} aria-controls={panelId} data-faq-toggle="" onClick={() => toggle(item.key)}>
                            <span className="i3-board__text">
                              <span className="i3-board__question">{item.question}</span>
                              {item.topic ? <span className="i3-board__sub">{item.topic}</span> : null}
                            </span>
                            <svg className="i3-board__chev" viewBox="0 0 16 16" width="12" height="12" aria-hidden="true" focusable="false">
                              <path d="M3 5.5l5 5 5-5" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
                            </svg>
                          </button>
                        </td>
                        <td className="i3-board__topic">{item.topic}</td>
                      </tr>,
                      <tr key={`${item.key}-answer`} id={panelId} className="i3-board__answer" hidden={!(shown && isOpen)} data-faq-panel={item.key}>
                        <td colSpan={3}>
                          <div className="i3-board__answer-in">
                            {item.answer.map((p, i) => (
                              <p key={i}>{p}</p>
                            ))}
                          </div>
                        </td>
                      </tr>,
                    ];
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </>
  );
}
