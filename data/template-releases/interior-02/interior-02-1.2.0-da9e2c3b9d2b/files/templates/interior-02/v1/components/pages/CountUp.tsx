"use client";

import { useEffect, useRef, useState } from "react";

/**
 * CountUp (PAGES) — a statistic figure that counts from 0 to its value in about 0.8 s the first
 * time it enters the viewport. The server HTML shows the final text, so the figure is complete
 * without script; `prefers-reduced-motion` keeps it static. No timer exists in template code:
 * the frames come from requestAnimationFrame and its timestamp argument.
 * The text is parsed as "<prefix><digits[,digits]>[.<decimals>]<suffix>" ("1,240", "4.9", "98");
 * separators and decimals are kept while counting; text without a number is rendered as is.
 *   <CountUp value="1,240" />   → <span data-count="idle|running|done">…</span>
 */
const DURATION_MS = 800;

interface Figure {
  prefix: string;
  value: number;
  decimals: number;
  grouped: boolean;
  suffix: string;
}

function parseFigure(text: string): Figure | undefined {
  const m = /^([^0-9]*)([0-9][0-9,]*)(?:[.]([0-9]+))?(.*)$/.exec(text);
  if (!m) return undefined;
  const prefix = m[1] ?? "";
  const int = m[2] ?? "";
  const dec = m[3];
  const suffix = m[4] ?? "";
  const value = Number(`${int.split(",").join("")}${dec ? `.${dec}` : ""}`);
  if (!Number.isFinite(value)) return undefined;
  return { prefix, value, decimals: dec ? dec.length : 0, grouped: int.includes(","), suffix };
}

function groupInt(int: string): string {
  let out = "";
  for (let i = 0; i < int.length; i++) {
    const fromEnd = int.length - i;
    out += int[i];
    if (fromEnd > 1 && (fromEnd - 1) % 3 === 0) out += ",";
  }
  return out;
}

function render(f: Figure, v: number): string {
  const fixed = v.toFixed(f.decimals);
  const [int = "0", dec] = fixed.split(".");
  return `${f.prefix}${f.grouped ? groupInt(int) : int}${dec ? `.${dec}` : ""}${f.suffix}`;
}

export function CountUp({ value }: { value: string }) {
  const ref = useRef<HTMLSpanElement>(null);
  const [text, setText] = useState(value);
  const [phase, setPhase] = useState<"idle" | "running" | "done">("idle");

  useEffect(() => {
    const el = ref.current;
    const figure = parseFigure(value);
    if (!el || !figure || figure.value === 0) return;
    if (matchMedia("(prefers-reduced-motion: reduce)").matches || typeof IntersectionObserver === "undefined") return;
    let frame = 0;
    const io = new IntersectionObserver(
      (entries) => {
        if (!entries.some((e) => e.isIntersecting)) return;
        io.disconnect();
        let start: number | undefined;
        const step = (ts: number) => {
          if (start === undefined) start = ts;
          const p = Math.min(1, (ts - start) / DURATION_MS);
          const eased = 1 - Math.pow(1 - p, 3);
          setText(p >= 1 ? value : render(figure, figure.value * eased));
          if (p < 1) frame = requestAnimationFrame(step);
          else setPhase("done");
        };
        setPhase("running");
        setText(render(figure, 0));
        frame = requestAnimationFrame(step);
      },
      { threshold: 0.3 },
    );
    io.observe(el);
    return () => {
      io.disconnect();
      cancelAnimationFrame(frame);
    };
  }, [value]);

  return (
    <span ref={ref} data-count={phase}>
      {text}
    </span>
  );
}
