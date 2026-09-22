/**
 * DETERMINISTIC brand marks — the "no customer logo was supplied" fallback
 * (Task 28 Phase 2).
 *
 * WHY THIS EXISTS. Before this module the pipeline had no fallback at all: an
 * operator who supplied no logo got the SOURCE's mark, and an operator who
 * supplied one got it hashed into `media/` and consumed by nothing
 * (resolve-assets.ts: "recorded; no rewrite target"). Preview must render
 * something that is not the source's identity, without asking the operator a
 * question, so the mark is GENERATED from the site's own name.
 *
 * DETERMINISM IS THE CONTRACT. `wordmarkSvg(name, box)` and
 * `monogramSvg(name, box)` are pure functions of their arguments: the same
 * brand name always yields byte-identical markup, including the monogram's
 * colour, which is drawn from a fixed palette by a sha256 of the name. Two
 * builds of the same site therefore produce the same bytes, and a smoke check
 * can assert that instead of eyeballing it.
 *
 * THIS IS A VISIBLE DESIGN DECISION, not a neutral no-op. A generated wordmark
 * is not the customer's logo; it is a placeholder that is honestly THEIRS
 * rather than dishonestly the source's. Every use is recorded on the bake
 * report (`fallback.uses`) so the operator checklist can say so.
 */
import { createHash } from "node:crypto";

/** Fixed, ordered palette. Index chosen by hash — never random, never themed. */
export const MONOGRAM_PALETTE = [
  "#1f2937",
  "#0f766e",
  "#7c2d12",
  "#3730a3",
  "#831843",
  "#134e4a",
  "#4c1d95",
  "#78350f",
] as const;

/**
 * The name a generated mark may render.
 *
 * EXPLICIT DERIVATION RULE, because the working name a site plan carries is
 * not always presentable: the real linear pilot's
 * `sitePlan.siteIdentity.workingName` is `"FlowPilot (synthetic-pilot-brand)"`.
 * A trailing parenthetical qualifier is dropped, whitespace is collapsed, and
 * the result is capped — a mark is not a paragraph. Returns null when nothing
 * usable is left, and a null name means NO mark is generated (the caller then
 * records an honest gap instead of drawing "undefined").
 */
export function normalizeBrandName(raw: string | null | undefined): string | null {
  if (raw === null || raw === undefined) return null;
  const withoutQualifier = raw.replace(/\s*\([^)]*\)\s*$/, "");
  const collapsed = withoutQualifier.replace(/\s+/g, " ").trim();
  if (collapsed === "") return null;
  return collapsed.length > 40 ? collapsed.slice(0, 40).trim() : collapsed;
}

/** Up to two initials, uppercase, letters/digits only. */
export function brandInitials(name: string): string {
  const words = name
    .split(/[^A-Za-z0-9]+/)
    .filter((word) => word.length > 0)
    .slice(0, 2);
  if (words.length === 0) return "?";
  if (words.length === 1) {
    // A single camel-cased word still carries two humps: FlowPilot -> FP.
    const humps = words[0].replace(/([a-z0-9])([A-Z])/g, "$1 $2").split(" ");
    if (humps.length > 1) return (humps[0][0] + humps[1][0]).toUpperCase();
    return words[0].slice(0, 2).toUpperCase();
  }
  return (words[0][0] + words[1][0]).toUpperCase();
}

function paletteColor(name: string): string {
  const digest = createHash("sha256").update(name, "utf8").digest();
  return MONOGRAM_PALETTE[digest[0] % MONOGRAM_PALETTE.length];
}

export interface MarkBox {
  /** Preserved from the host so the replacement occupies the same space. */
  width: number | null;
  height: number | null;
}

const WORDMARK_HEIGHT = 100;
/** Advance width per character at WORDMARK_HEIGHT, for the generic stack. */
const WORDMARK_ADVANCE = 52;

function escapeXmlText(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/**
 * A text wordmark. `fill="currentColor"` deliberately: the source marks this
 * replaces inherit their paint (`currentColor`, `var(--hds-color-…)`), so the
 * replacement stays theme-adaptive instead of hardcoding a colour the theme
 * overlay cannot reach.
 */
export function wordmarkSvg(name: string, box: MarkBox = { width: null, height: null }): string {
  const viewWidth = Math.max(WORDMARK_ADVANCE, Math.round(name.length * WORDMARK_ADVANCE));
  const attrs = [
    box.width !== null ? `width="${box.width}"` : null,
    box.height !== null ? `height="${box.height}"` : null,
    `viewBox="0 0 ${viewWidth} ${WORDMARK_HEIGHT}"`,
    'fill="currentColor"',
    'role="img"',
  ].filter((attr): attr is string => attr !== null);
  return (
    `<svg ${attrs.join(" ")}>` +
    `<text x="0" y="76" font-family="system-ui, -apple-system, Segoe UI, Roboto, sans-serif" ` +
    `font-size="72" font-weight="600" fill="currentColor">${escapeXmlText(name)}</text>` +
    `</svg>`
  );
}

/** A square monogram: deterministic palette colour + up to two initials. */
export function monogramSvg(name: string, box: MarkBox = { width: null, height: null }): string {
  const initials = brandInitials(name);
  const color = paletteColor(name);
  const attrs = [
    box.width !== null ? `width="${box.width}"` : null,
    box.height !== null ? `height="${box.height}"` : null,
    'viewBox="0 0 100 100"',
    'role="img"',
  ].filter((attr): attr is string => attr !== null);
  return (
    `<svg ${attrs.join(" ")}>` +
    `<rect width="100" height="100" rx="18" fill="${color}"></rect>` +
    `<text x="50" y="68" text-anchor="middle" ` +
    `font-family="system-ui, -apple-system, Segoe UI, Roboto, sans-serif" ` +
    `font-size="46" font-weight="700" fill="#ffffff">${escapeXmlText(initials)}</text>` +
    `</svg>`
  );
}

export type GeneratedMarkKind = "wordmark" | "monogram";

/**
 * Pick the mark shape from the host's own box: a wide box gets the wordmark,
 * a roughly-square one gets the monogram. Deterministic, and derived from the
 * geometry we are replacing rather than from a preference.
 */
export function generatedMarkFor(
  name: string,
  box: MarkBox,
  options: {
    /**
     * Emit width/height on the root. FALSE when the caller re-stamps the
     * host's own (possibly non-numeric, e.g. `width="20%"`) box attributes
     * itself — emitting them here too would duplicate the attribute.
     */
    emitBox?: boolean;
  } = {},
): { kind: GeneratedMarkKind; markup: string } {
  const aspect =
    box.width !== null && box.height !== null && box.height > 0 ? box.width / box.height : null;
  const kind: GeneratedMarkKind = aspect !== null && aspect < 1.6 ? "monogram" : "wordmark";
  const emitted = options.emitBox === false ? { width: null, height: null } : box;
  return { kind, markup: kind === "monogram" ? monogramSvg(name, emitted) : wordmarkSvg(name, emitted) };
}
