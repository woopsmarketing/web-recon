import { aboutStory } from "../../../sections/AboutStory";
import { hasRoute } from "../../../lib/routes";
import type { Media } from "../../../components/pages/shared";
import type { Ctx } from "../../../sections/types";

/** What the three about variants read: the story block of `about.page` (title, paragraphs, photo) and the route to the about page. */
export interface AboutBase {
  /** the site's own name for the about page (site.header aboutLabel) — a small label and the link text */
  label?: string;
  title?: string;
  paragraphs: string[];
  media?: Media;
  more?: { href: string; label: string };
}

export interface DetailRow {
  label?: string;
  value: string;
}

export function aboutBase(ctx: Ctx): AboutBase | undefined {
  const story = aboutStory(ctx);
  if (!story) return undefined;
  const label = ctx.slots.text("site.header", "aboutLabel") || undefined;
  return {
    label,
    title: story.title,
    paragraphs: (story.body ?? []).filter((p) => p.trim() !== ""),
    media: story.media,
    more: label && hasRoute(ctx, "about") ? { href: "/about", label } : undefined,
  };
}

/** The first sentences of `text` that fit `max` characters (always at least the first sentence). */
export function cutSentences(text: string, max: number): string {
  const t = text.trim();
  if (t.length <= max) return t;
  const parts = t.split(/(?<=[.!?。…])\s+/);
  let out = parts[0] ?? t;
  for (let i = 1; i < parts.length; i += 1) {
    const next = `${out} ${parts[i]}`;
    if (next.length > max) break;
    out = next;
  }
  return out;
}

/**
 * Statement + lead of a short about block: the statement is the intro title, or — without one — the
 * first paragraph cut to a few sentences; the lead is the first paragraph (title present) cut to `leadMax`.
 */
export function statementOf(base: AboutBase, statementMax: number, leadMax: number): { statement: string; isTitle: boolean; lead?: string } | undefined {
  const first = base.paragraphs[0];
  if (base.title) return { statement: base.title, isTitle: true, lead: first ? cutSentences(first, leadMax) : undefined };
  if (first) return { statement: cutSentences(first, statementMax), isTitle: false };
  return undefined;
}

/**
 * The facts the site really holds about where and when it works — the footer's location, hours and
 * service-area lines (site.footer). Nothing else is read; no line = no row.
 */
export function detailRows(ctx: Ctx, max: number): DetailRow[] {
  const t = (key: string) => ctx.slots.text("site.footer", key) || undefined;
  const rows: DetailRow[] = [];
  for (const n of [1, 2, 3, 4]) {
    const name = t(`location${n}Name`);
    const address = t(`location${n}Address`);
    if (address) rows.push({ label: name, value: address });
    else if (name) rows.push({ value: name });
  }
  for (const n of [1, 2, 3]) {
    const label = t(`hours${n}Label`);
    const value = t(`hours${n}Value`);
    if (value) rows.push({ label, value });
    else if (label) rows.push({ value: label });
  }
  const note = t("locationsNote");
  if (note) {
    const at = note.indexOf(":");
    if (at > 0 && at <= 12 && note.slice(at + 1).trim() !== "") rows.push({ label: note.slice(0, at).trim(), value: note.slice(at + 1).trim() });
    else rows.push({ value: note });
  }
  return rows.slice(0, max);
}
