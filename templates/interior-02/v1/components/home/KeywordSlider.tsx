"use client";

import Link from "next/link";
import { useState, type KeyboardEvent, type ReactNode } from "react";
import { Carousel, type CarouselLabels } from "../ui/Carousel";
import { SectionHeading } from "../ui/SectionHeading";
import { fill } from "../../lib/format";

export interface KeywordChip {
  id: string;
  label: string;
  /** the filtered portfolio list (or its first page); undefined = no "more" link for this chip */
  href?: string;
}

export interface KeywordSliderProps {
  title: string;
  chipsLabel: string;
  chips: KeywordChip[];
  /** chip id → its server-rendered cards (one node per slide) */
  panels: Record<string, ReactNode[]>;
  /** "{chip}" = the selected chip's label */
  moreLabel: string;
  labels: CarouselLabels;
  slideLabelFormat: string;
}

/**
 * home.keywords (client part) — the chips are a radio group; choosing one swaps the slider's
 * cards in place (no navigation, no scroll change) and retargets the "more" link and button.
 * The slider is re-mounted per chip (position 0, autoplay running again), as the source does.
 */
export function KeywordSlider({ title, chipsLabel, chips, panels, moreLabel, labels, slideLabelFormat }: KeywordSliderProps) {
  const [active, setActive] = useState(chips[0]?.id ?? "");
  const chip = chips.find((c) => c.id === active) ?? chips[0];
  if (!chip) return null;
  const more = chip.href ? { href: chip.href, label: fill(moreLabel, { chip: chip.label }) } : undefined;

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const dir = e.key === "ArrowRight" || e.key === "ArrowDown" ? 1 : e.key === "ArrowLeft" || e.key === "ArrowUp" ? -1 : 0;
    if (!dir) return;
    e.preventDefault();
    const i = chips.findIndex((c) => c.id === chip.id);
    const next = chips[(i + dir + chips.length) % chips.length]!;
    setActive(next.id);
    e.currentTarget.querySelector<HTMLButtonElement>(`[data-chip="${next.id}"]`)?.focus();
  };

  return (
    <>
      <div className="i2-wrap">
        <SectionHeading title={title} id="i2-kw-title" more={more} className="i2-kw__head">
          <div className="i2-kw__chips" role="radiogroup" aria-label={chipsLabel} onKeyDown={onKeyDown}>
            {chips.map((c) => {
              const on = c.id === chip.id;
              return (
                <button
                  key={c.id}
                  type="button"
                  role="radio"
                  aria-checked={on}
                  tabIndex={on ? 0 : -1}
                  className={on ? "i2-chip is-on" : "i2-chip"}
                  data-chip={c.id}
                  onClick={() => setActive(c.id)}
                >
                  {c.label}
                </button>
              );
            })}
          </div>
        </SectionHeading>
      </div>
      <div className="i2-kw__lower">
        <Carousel key={chip.id} label={chip.label} className="i2-kw__slider" autoplay dwell={3000} duration={500} progress="steps" controls labels={labels} slideLabelFormat={slideLabelFormat}>
          {panels[chip.id]}
        </Carousel>
        {more ? (
          <div className="i2-wrap">
            <p className="i2-btn-row">
              <Link href={more.href} className="i2-btn i2-btn--black" data-kw-more="">
                {more.label}
              </Link>
            </p>
          </div>
        ) : null}
      </div>
    </>
  );
}
