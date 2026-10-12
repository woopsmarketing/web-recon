"use client";

import { useEffect, useState, type ReactNode } from "react";
import { Carousel, type CarouselLabels } from "../ui/Carousel";

/**
 * TimelineSlider (PAGES) — the ABOUT history slider on the shared Carousel: 3 s dwell, 500 ms
 * move, stepped progress bar (page / pages), prev / next / stop; not endless — it stops on the
 * last page, where "next" is disabled and the autoplay ends (`loop={false}`). Below 640 px the
 * source rotates nothing, so the slider is re-mounted without autoplay once a narrow viewport is
 * detected (matchMedia); the server HTML is the wide state.
 */
export interface TimelineSliderProps {
  label: string;
  autoplay: boolean;
  labels: CarouselLabels;
  slideLabelFormat: string;
  children: ReactNode;
}

export function TimelineSlider({ label, autoplay, labels, slideLabelFormat, children }: TimelineSliderProps) {
  const [narrow, setNarrow] = useState(false);

  useEffect(() => {
    const mq = matchMedia("(max-width: 640px)");
    const update = () => setNarrow(mq.matches);
    update();
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, []);

  return (
    <Carousel key={narrow ? "narrow" : "wide"} label={label} className="i2-ab-tl" autoplay={autoplay && !narrow} dwell={3000} duration={500} progress="steps" controls loop={false} labels={labels} slideLabelFormat={slideLabelFormat}>
      {children}
    </Carousel>
  );
}
