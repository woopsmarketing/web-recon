import type { FontSetId, ThemeTier2 } from "./contract";
import { FONT_STACKS } from "./fonts";

/**
 * Theme tier 2 → the `--ds-*` custom properties. Pure and deterministic: the same input gives the
 * same text, byte for byte (no clock, no locale, no environment).
 *
 *   compileDesignTokens({ theme, tier1, fontSet }) → { vars, css }
 *
 *   theme     the seven enums of the site's design document
 *   tier1     the site's effective tier-1 theme (token id → value, `ctx.theme`) — the colours. They
 *             already hold what the brand block asked for (primary / accent / surface), so a brand
 *             colour reaches a tier-2 role without being entered twice. Absent = the roles are
 *             written as references to the tier-1 custom properties and nothing is computed: that
 *             is the static default sheet (styles/design/tokens.css).
 *   fontSet   which stacks `--ds-font-*` name (system = the tier-1 font tokens)
 *
 * Colour roles are DERIVED, never entered: `--ds-accent-ink` is the text colour with the higher
 * contrast on the accent; `--ds-muted` and `--ds-accent-text` are moved toward the ink until they
 * read on both the page and the surface colour (4.5:1). A tier-1 colour this module cannot read
 * (a named colour other than black / white) falls back to the reference form.
 *
 * Every name this module can emit is in DS_TOKENS, with what a variant may use it for. A variant's
 * stylesheet uses these — and no literal — for colour, type and spacing.
 */

export type Rgb = readonly [number, number, number];

export const DS_TOKENS = [
  ["--ds-font-display", "font-family of display lines and headings"],
  ["--ds-font-body", "font-family of running text"],
  ["--ds-font-label", "font-family of labels, captions, numerals, buttons"],
  ["--ds-text-xs", "smallest text (13px floor): captions, legal, meta"],
  ["--ds-text-sm", "small text: labels, chips, secondary meta"],
  ["--ds-text-base", "running text (16px floor)"],
  ["--ds-text-md", "lead paragraph, large running text"],
  ["--ds-text-lg", "small heading, card title"],
  ["--ds-text-xl", "section sub-heading"],
  ["--ds-text-2xl", "section heading"],
  ["--ds-text-3xl", "page-level heading"],
  ["--ds-text-display", "the one display line of a section (hero statement)"],
  ["--ds-weight-display", "font-weight of display lines"],
  ["--ds-weight-heading", "font-weight of headings"],
  ["--ds-leading-display", "line-height of display lines and headings"],
  ["--ds-leading-body", "line-height of running text"],
  ["--ds-tracking-display", "letter-spacing of display lines (never positive: Hangul is not tracked out)"],
  ["--ds-space-1", "4px step"],
  ["--ds-space-2", "8px step"],
  ["--ds-space-3", "12px step"],
  ["--ds-space-4", "16px step"],
  ["--ds-space-5", "24px step"],
  ["--ds-space-6", "32px step"],
  ["--ds-space-7", "48px step"],
  ["--ds-space-8", "72px step"],
  ["--ds-section-gap", "vertical distance between two home sections (fluid; follows density)"],
  ["--ds-container-max", "max-width of a section's content box"],
  ["--ds-gutter", "left / right page padding (fluid; follows density)"],
  ["--ds-radius-media", "corner radius of photographs and panels"],
  ["--ds-radius-control", "corner radius of buttons, chips, inputs"],
  ["--ds-hairline", "width of rules and outlines"],
  ["--ds-bg", "page background"],
  ["--ds-surface", "background of a panel or band that lifts off the page"],
  ["--ds-ink", "primary text"],
  ["--ds-muted", "secondary text (≥ 4.5:1 on --ds-bg and --ds-surface)"],
  ["--ds-line", "rules, outlines, dividers"],
  ["--ds-accent", "the accent as a FILL (button, marker, block)"],
  ["--ds-accent-ink", "text and icons on --ds-accent (computed for contrast)"],
  ["--ds-accent-text", "the accent as TEXT on --ds-bg / --ds-surface: links, numerals (≥ 4.5:1)"],
  ["--ds-tint", "a wash of the accent over the page colour, for a tinted panel"],
  ["--ds-block-bg", "background of the ONE emphasised full-bleed section (follows accentUse)"],
  ["--ds-block-ink", "text on --ds-block-bg"],
  ["--ds-inverse-bg", "background of an inverted band (the ink colour)"],
  ["--ds-inverse-ink", "text on --ds-inverse-bg"],
  ["--ds-scrim", "overlay between a photograph and the text set on it"],
  ["--ds-on-scrim", "text on a photograph under --ds-scrim"],
  ["--ds-ease", "the one easing curve"],
  ["--ds-dur-1", "short transition (hover, focus)"],
  ["--ds-dur-2", "long transition (reveal)"],
] as const satisfies readonly (readonly [string, string])[];

export type DsToken = (typeof DS_TOKENS)[number][0];
export const DS_TOKEN_NAMES: readonly DsToken[] = DS_TOKENS.map(([name]) => name);

// --------------------------------------------------------------------- colour --

const NAMED: Record<string, Rgb> = { white: [255, 255, 255], black: [0, 0, 0] };

function hslToRgb(h: number, s: number, l: number): Rgb {
  const k = (n: number) => (n + h / 30) % 12;
  const a = s * Math.min(l, 1 - l);
  const f = (n: number) => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
  return [Math.round(f(0) * 255), Math.round(f(8) * 255), Math.round(f(4) * 255)];
}

/** #rgb · #rrggbb · rgb()/rgba() · hsl()/hsla() · black · white → sRGB bytes (alpha ignored); anything else → undefined. */
export function parseColor(value: string | undefined): Rgb | undefined {
  if (value === undefined) return undefined;
  const text = value.trim().toLowerCase();
  if (Object.hasOwn(NAMED, text)) return NAMED[text];
  const hex = /^#([0-9a-f]{3}|[0-9a-f]{6})$/.exec(text)?.[1];
  if (hex) {
    const full = hex.length === 3 ? hex.replace(/./g, (c) => c + c) : hex;
    return [parseInt(full.slice(0, 2), 16), parseInt(full.slice(2, 4), 16), parseInt(full.slice(4, 6), 16)];
  }
  const fn = /^(rgb|hsl)a?\(([^()]+)\)$/.exec(text);
  if (!fn) return undefined;
  const parts = fn[2]!.split(/[\s,/]+/).filter((p) => p !== "");
  if (parts.length < 3) return undefined;
  if (fn[1] === "rgb") {
    const bytes = parts.slice(0, 3).map((p) => (p.endsWith("%") ? (Number(p.slice(0, -1)) / 100) * 255 : Number(p)));
    if (bytes.some((n) => !Number.isFinite(n) || n < 0 || n > 255)) return undefined;
    return [Math.round(bytes[0]!), Math.round(bytes[1]!), Math.round(bytes[2]!)];
  }
  const h = Number(parts[0]!.replace(/deg$/, ""));
  const s = Number(parts[1]!.replace(/%$/, "")) / 100;
  const l = Number(parts[2]!.replace(/%$/, "")) / 100;
  if (![h, s, l].every(Number.isFinite) || s < 0 || s > 1 || l < 0 || l > 1) return undefined;
  return hslToRgb(((h % 360) + 360) % 360, s, l);
}

const channel = (byte: number): number => {
  const c = byte / 255;
  return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
};
const luminance = ([r, g, b]: Rgb): number => 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);

/** WCAG 2 contrast ratio of two sRGB colours (1 … 21). */
export function contrastRatio(a: Rgb, b: Rgb): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number];
  return (hi + 0.05) / (lo + 0.05);
}

const mix = (from: Rgb, to: Rgb, t: number): Rgb => [0, 1, 2].map((i) => Math.round(from[i]! + (to[i]! - from[i]!) * t)) as unknown as Rgb;
const css = ([r, g, b]: Rgb): string => `rgb(${r}, ${g}, ${b})`;

const WHITE: Rgb = [255, 255, 255];
const NEAR_BLACK: Rgb = [17, 17, 17];
const BLACK: Rgb = [0, 0, 0];
export const TEXT_CONTRAST_MIN = 4.5;

/**
 * The text colour on `fill`: white or near-black, whichever reads better — always ≥ 4.5:1.
 * On a narrow band of mid-tones neither reaches 4.5:1 (near-black tops out at 4.35:1 there);
 * the better of white and pure black does (never below 4.58:1), so that band gets it.
 */
export function inkOn(fill: Rgb): Rgb {
  const white = contrastRatio(WHITE, fill);
  const soft = contrastRatio(NEAR_BLACK, fill);
  if (white >= soft && white >= TEXT_CONTRAST_MIN) return WHITE;
  if (soft > white && soft >= TEXT_CONTRAST_MIN) return NEAR_BLACK;
  return white >= contrastRatio(BLACK, fill) ? WHITE : BLACK;
}

/** `colour`, moved toward `toward` in 5% steps until it reaches `min` against every background. */
export function readable(colour: Rgb, backgrounds: readonly Rgb[], toward: Rgb, min: number = TEXT_CONTRAST_MIN): Rgb {
  for (let step = 0; step <= 20; step++) {
    const candidate = mix(colour, toward, step / 20);
    if (backgrounds.every((bg) => contrastRatio(candidate, bg) >= min)) return candidate;
  }
  return toward;
}

// ---------------------------------------------------------------------- scale --

const num = (n: number): string => String(Math.round(n * 10000) / 10000);
const rem = (px: number): string => (px === 0 ? "0" : `${num(px / 16)}rem`);

const FLUID_FROM = 360;
const FLUID_TO = 1440;
/** A size that grows linearly from `min` px at a 360px viewport to `max` px at 1440px, clamped at both ends. */
export function fluid(min: number, max: number): string {
  if (min === max) return rem(min);
  const slope = (max - min) / (FLUID_TO - FLUID_FROM);
  const intercept = min - slope * FLUID_FROM;
  const offset = intercept === 0 ? "" : ` ${intercept < 0 ? "-" : "+"} ${rem(Math.abs(intercept))}`;
  return `clamp(${rem(min)}, ${num(slope * 100)}vw${offset}, ${rem(max)})`;
}

type Step = "xs" | "sm" | "base" | "md" | "lg" | "xl" | "2xl" | "3xl" | "display";
const STEPS: readonly Step[] = ["xs", "sm", "base", "md", "lg", "xl", "2xl", "3xl", "display"];
/** [px at 360, px at 1440] per step. Floors: xs 13px, base 16px. */
const TYPE: Record<ThemeTier2["typeScale"], Record<Step, readonly [number, number]>> = {
  compact: { xs: [13, 13], sm: [14, 14], base: [16, 16], md: [17, 18], lg: [19, 22], xl: [22, 28], "2xl": [26, 36], "3xl": [30, 46], display: [34, 60] },
  regular: { xs: [13, 13], sm: [14, 14], base: [16, 17], md: [17, 19], lg: [20, 24], xl: [24, 32], "2xl": [30, 44], "3xl": [36, 60], display: [40, 80] },
  display: { xs: [13, 13], sm: [14, 15], base: [16, 18], md: [18, 21], lg: [21, 27], xl: [26, 38], "2xl": [32, 54], "3xl": [40, 76], display: [46, 112] },
};
const WEIGHT: Record<ThemeTier2["headingWeight"], { display: number; heading: number; tracking: string }> = {
  light: { display: 300, heading: 400, tracking: "-0.01em" },
  regular: { display: 400, heading: 500, tracking: "-0.015em" },
  bold: { display: 700, heading: 700, tracking: "-0.02em" },
};
const LEADING_DISPLAY: Record<ThemeTier2["typeScale"], string> = { compact: "1.3", regular: "1.24", display: "1.16" };
const DENSITY: Record<ThemeTier2["density"], { gap: readonly [number, number]; gutter: readonly [number, number]; leading: string }> = {
  airy: { gap: [80, 160], gutter: [20, 56], leading: "1.8" },
  regular: { gap: [64, 120], gutter: [20, 40], leading: "1.7" },
  compact: { gap: [48, 88], gutter: [16, 32], leading: "1.6" },
};
const CONTAINER: Record<ThemeTier2["container"], number> = { narrow: 1100, regular: 1280, wide: 1440 };
const CORNER: Record<ThemeTier2["corner"], { media: string; control: string }> = {
  square: { media: "0", control: "0" },
  soft: { media: "10px", control: "8px" },
  round: { media: "20px", control: "999px" },
};
const SPACE = [4, 8, 12, 16, 24, 32, 48, 72] as const;

// ------------------------------------------------------------------- compiler --

export interface DesignTokens {
  /** every DS_TOKENS name, in that order */
  vars: [DsToken, string][];
  /** one `:root{…}` rule */
  css: string;
}

function colourRoles(theme: ThemeTier2, tier1: Readonly<Record<string, string | undefined>> | undefined): Record<string, string> {
  const bg = parseColor(tier1?.["color.canvas"]);
  const ink = parseColor(tier1?.["color.text.primary"]);
  const accent = parseColor(tier1?.["color.accent.primary"]);
  if (!bg || !ink || !accent) {
    // reference form: the tier-1 custom properties decide and nothing is computed
    const block = theme.accentUse === "blocks" ? ["var(--color-accent-primary)", "var(--color-action-primary-text)"] : ["var(--color-surface-secondary)", "var(--color-text-primary)"];
    return {
      "--ds-bg": "var(--color-canvas)",
      "--ds-surface": "var(--color-surface-secondary)",
      "--ds-ink": "var(--color-text-primary)",
      "--ds-muted": "var(--color-text-secondary)",
      "--ds-line": "var(--color-border-default)",
      "--ds-accent": "var(--color-accent-primary)",
      "--ds-accent-ink": "var(--color-action-primary-text)",
      "--ds-accent-text": "var(--color-text-primary)",
      "--ds-tint": "var(--color-surface-secondary)",
      "--ds-block-bg": block[0]!,
      "--ds-block-ink": block[1]!,
      "--ds-inverse-bg": "var(--color-text-primary)",
      "--ds-inverse-ink": "var(--color-canvas)",
    };
  }
  const surface = parseColor(tier1?.["color.surface.secondary"]) ?? mix(bg, ink, 0.04);
  const line = parseColor(tier1?.["color.border.default"]) ?? mix(bg, ink, 0.14);
  const muted = readable(parseColor(tier1?.["color.text.secondary"]) ?? mix(ink, bg, 0.35), [bg, surface], ink);
  const accentInk = inkOn(accent);
  const tint = mix(bg, accent, 0.1);
  const block: Record<ThemeTier2["accentUse"], readonly [Rgb, Rgb]> = {
    minimal: [surface, ink],
    blocks: [accent, accentInk],
    fills: [tint, readable(ink, [tint], inkOn(tint))],
  };
  return {
    "--ds-bg": css(bg),
    "--ds-surface": css(surface),
    "--ds-ink": css(ink),
    "--ds-muted": css(muted),
    "--ds-line": css(line),
    "--ds-accent": css(accent),
    "--ds-accent-ink": css(accentInk),
    "--ds-accent-text": css(readable(accent, [bg, surface], ink)),
    "--ds-tint": css(tint),
    "--ds-block-bg": css(block[theme.accentUse][0]),
    "--ds-block-ink": css(block[theme.accentUse][1]),
    "--ds-inverse-bg": css(ink),
    "--ds-inverse-ink": css(bg),
  };
}

export function compileDesignTokens(input: { theme: ThemeTier2; tier1?: Readonly<Record<string, string | undefined>>; fontSet: FontSetId }): DesignTokens {
  const { theme, fontSet } = input;
  const stacks = FONT_STACKS[fontSet];
  const weight = WEIGHT[theme.headingWeight];
  const density = DENSITY[theme.density];
  const corner = CORNER[theme.corner];
  const values: Record<string, string> = {
    "--ds-font-display": stacks?.display ?? "var(--typography-heading)",
    "--ds-font-body": stacks?.body ?? "var(--typography-body)",
    "--ds-font-label": stacks?.body ?? "var(--typography-body)",
    "--ds-weight-display": String(weight.display),
    "--ds-weight-heading": String(weight.heading),
    "--ds-leading-display": LEADING_DISPLAY[theme.typeScale],
    "--ds-leading-body": density.leading,
    "--ds-tracking-display": weight.tracking,
    "--ds-section-gap": fluid(density.gap[0], density.gap[1]),
    "--ds-container-max": `${CONTAINER[theme.container]}px`,
    "--ds-gutter": fluid(density.gutter[0], density.gutter[1]),
    "--ds-radius-media": corner.media,
    "--ds-radius-control": corner.control,
    "--ds-hairline": "1px",
    ...colourRoles(theme, input.tier1),
    "--ds-scrim": "rgba(12, 12, 10, 0.52)",
    "--ds-on-scrim": "rgb(255, 255, 255)",
    "--ds-ease": "cubic-bezier(0.2, 0.7, 0.2, 1)",
    "--ds-dur-1": "180ms",
    "--ds-dur-2": "420ms",
  };
  for (const step of STEPS) values[`--ds-text-${step}`] = fluid(TYPE[theme.typeScale][step][0], TYPE[theme.typeScale][step][1]);
  SPACE.forEach((px, i) => (values[`--ds-space-${i + 1}`] = rem(px)));
  const vars = DS_TOKEN_NAMES.map((name) => [name, values[name]!] as [DsToken, string]);
  return { vars, css: `:root{${vars.map(([name, value]) => `${name}:${value}`).join(";")}}` };
}

/**
 * The declarations of the static default sheet (styles/design/tokens.css): the classic theme in
 * reference form, one declaration per line. The sheet's selector is `:where(:root)` — specificity
 * zero — so the site's own values (`:root{…}`, inline) win wherever the two meet in the document.
 */
export function defaultTokensCss(theme: ThemeTier2): string {
  const { vars } = compileDesignTokens({ theme, fontSet: "system" });
  return `:where(:root) {\n${vars.map(([name, value]) => `  ${name}: ${value};`).join("\n")}\n}\n`;
}
