"use client";

import { useEffect, useState, type MouseEvent } from "react";
import { Icon } from "../ui/Icon";

export interface FaqItem {
  key: string;
  question: string;
  /** one string per paragraph */
  answer: string[];
  topic?: string;
}

export interface FaqChip {
  /** "all" or the topic text */
  key: string;
  label: string;
  count: number;
}

export interface FaqBrowserProps {
  items: FaqItem[];
  chips: FaqChip[];
  chipCounts: boolean;
  labels: { chips: string; q: string; a: string };
}

const ALL = "all";

/**
 * Topic chips (radio-like, in place, no navigation) + the accordion.
 *
 * Every item is a native <details>: without script the browser opens and closes it by itself
 * (every answer stays reachable). Once this island is mounted it is ENHANCED (data-enhanced):
 * every <details> is kept open so the answer panel is always in the DOM, and the visible state
 * is the island's own (data-open) — one item open at a time, the panel's height animated by CSS
 * (grid-template-rows 0fr → 1fr, ≈ .2 s; a collapsed panel is also visibility:hidden, so it is
 * out of the tab order and of the accessibility tree). The summary click is taken over (no
 * native toggle) and carries aria-expanded / aria-controls. No timers, no measuring.
 */
export function FaqBrowser({ items, chips, chipCounts, labels }: FaqBrowserProps) {
  const [topic, setTopic] = useState(ALL);
  const [open, setOpen] = useState<string | null>(null);
  const [enhanced, setEnhanced] = useState(false);

  useEffect(() => {
    setEnhanced(true);
  }, []);

  const toggle = (key: string) => (e: MouseEvent<HTMLElement>) => {
    if (!enhanced) return;
    e.preventDefault();
    setOpen((current) => (current === key ? null : key));
  };

  return (
    <>
      {chips.length > 1 ? (
        <div className="i2-faq__chips" role="group" aria-label={labels.chips} data-faq-chips="">
          {chips.map((c) => (
            <button key={c.key} type="button" className="i2-chip i2-faq__chip" aria-pressed={topic === c.key} data-topic={c.key} onClick={() => setTopic(c.key)}>
              {c.label}
              {chipCounts ? <span className="i2-faq__count">({c.count})</span> : null}
            </button>
          ))}
        </div>
      ) : null}
      <ul className="i2-acc" data-faq-list="">
        {items.map((item) => {
          const shown = topic === ALL || item.topic === topic;
          const isOpen = open === item.key;
          const headId = `i2-faq-${item.key}-head`;
          const panelId = `i2-faq-${item.key}-panel`;
          return (
            <li key={item.key} className="i2-acc__item" hidden={!shown} data-faq-item={item.key}>
              <details className="i2-acc__details" open={enhanced || undefined} data-enhanced={enhanced ? "" : undefined} data-open={enhanced ? String(isOpen) : undefined}>
                <summary id={headId} className="i2-acc__summary" aria-expanded={enhanced ? isOpen : undefined} aria-controls={panelId} onClick={toggle(item.key)}>
                  <span className="i2-acc__letter i2-acc__letter--q" aria-hidden="true">
                    {labels.q}
                  </span>
                  <span className="i2-acc__head">
                    {item.topic ? <span className="i2-acc__pill">{item.topic}</span> : null}
                    <span className="i2-acc__q">{item.question}</span>
                  </span>
                  <Icon name="chevron-down" size={14} className="i2-acc__chev" />
                </summary>
                <div id={panelId} className="i2-acc__panel" role="region" aria-labelledby={headId}>
                  <div className="i2-acc__panel-inner">
                    <div className="i2-acc__answer">
                      <span className="i2-acc__letter i2-acc__letter--a" aria-hidden="true">
                        {labels.a}
                      </span>
                      <div className="i2-acc__text">
                        {item.answer.map((p, i) => (
                          <p key={i}>{p}</p>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              </details>
            </li>
          );
        })}
      </ul>
    </>
  );
}
