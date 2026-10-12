import type { DesignConfig, FontSetId, ThemeTier2 } from "../../templates/interior-02/v1/design/contract";
import { validateDesignConfig } from "../../templates/interior-02/v1/design/contract";
import { compileDesignTokens, contrastRatio, inkOn, parseColor, readable, type Rgb } from "../../templates/interior-02/v1/design/tokens";
import { DesignError } from "./errors";
import { ACCENT_MIN_CONTRAST, ACCENT_TOKENS, PRIMARY_MIN_CONTRAST, PRIMARY_TOKENS, SURFACE_TOKENS, TEXT_MIN_CONTRAST, type SitePreset } from "./preset";
import { templateDesign } from "./templates";

/**
 * The scaffold step of a design preset — pure: files in, files out.
 *
 *   applyPreset(planFiles, preset, brandAppearance) → files
 *
 *   planFiles         site-relative path → bytes of the planned site: the starter rendered for this
 *                     site WITH the brand block already applied (platform/provision applyBrand)
 *   preset            a validated site-preset@1, or null = no preset chosen
 *   brandAppearance   the `appearance` member of the brand block (BrandBlock@1), or null
 *
 * PRECEDENCE (CONTRACTS E4): starter → preset (recipe, tier-1 palette, tier 2, font set) → brand
 * block. `primaryColor` and `accentColor` always win; `surface` and `typography` win only when set.
 *
 * WHY IT RUNS AFTER THE BRAND STEP and is told the appearance again: applyBrand writes the WHOLE
 * palette whenever the block has an `appearance` — the warm surface and the starter's primary and
 * accent for every field the block leaves unset. From the files alone a default cannot be told
 * from a choice. So this step takes the appearance as it was entered and decides token by token:
 *
 *     surface tokens     brand.surface set  → kept as the brand step wrote them
 *                        else               → the preset's
 *     primary tokens     brand.primaryColor → kept        else → the preset's (text on it derived)
 *     accent token       brand.accentColor  → kept        else → the preset's
 *     any other colour   the preset's
 *
 * and then measures the colours that END UP together (a brand accent chosen for the warm starter
 * may not read on a preset's surface): refused with `contrast_too_low` and the measured ratio.
 * WHICH pairs are measured depends on the design document — `contrastRuleFor`:
 *
 *   rendered-design   (the document names a preset) the pairs a designed site really draws, read
 *                     from the tokens the build will emit — `renderedDesignPairs`. A designed site
 *                     never sets the surface's text on the accent: it computes the text of an
 *                     accent fill itself, so a dark brand colour (navy, black, forest green) is an
 *                     ordinary accent there.
 *   classic-surface   (no preset: the classic site, or a typography-only "custom" document) the
 *                     classic rule of the brand step, unchanged — the surface's text colour must
 *                     read on the accent, because the classic sections draw it there.
 *
 * A brand `surface` WITHOUT its own primary / accent: the preset's colour is kept when it reads on
 * that surface; otherwise a default is derived the way the token compiler derives its roles — a
 * primary that is its palette's text colour follows the text colour of the chosen surface, any
 * other colour is moved toward that text colour (`readable`) until it reads. So `{surface: "dark"}`
 * alone resolves on a light-palette preset. A preset that still cannot be drawn on the chosen
 * surface is `design_unsupported` (the detail names the pair) — never `contrast_too_low`, which is
 * kept for a colour the brand block entered.
 *
 * Besides the palette it writes the design document into settings.json (`site.design.config`, the
 * preset's design with `preset: {id, version}`; `theme.surface` ← the brand's when set; `fontSet` ←
 * the brand's typography when set), the font set's family lists into the tier-1 typography tokens
 * (so the classic inner pages use the set too) and the preset's neutral labels into slots.json.
 *
 * No preset: the files are returned as they are — unless the brand asks for a typography, which
 * then becomes the classic design document with that font set. `soft-rounded` is refused
 * (`design_unsupported`): no rounded OFL family is in the font sets yet.
 */
export interface BrandAppearance {
  primaryColor?: string;
  accentColor?: string;
  surface?: "warm" | "neutral" | "cool" | "dark";
  typography?: "modern-sans" | "editorial-serif" | "soft-rounded";
}

/** Brand typography → font set (CONTRACTS E5). */
export const TYPOGRAPHY_FONT_SETS: Record<"modern-sans" | "editorial-serif", FontSetId> = {
  "modern-sans": "sans-pretendard",
  "editorial-serif": "serif-noto",
};

const css = ([r, g, b]: Rgb): string => `rgb(${r}, ${g}, ${b})`;
const json = (value: unknown): Buffer => Buffer.from(`${JSON.stringify(value, null, 2)}\n`);
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Doc = Record<string, any>;

function readDoc(files: ReadonlyMap<string, Buffer>, rel: string): Doc | undefined {
  const bytes = files.get(rel);
  return bytes ? (JSON.parse(bytes.toString("utf8")) as Doc) : undefined;
}

export function fontSetOfTypography(typography: BrandAppearance["typography"]): FontSetId | undefined {
  if (typography === undefined) return undefined;
  if (typography === "soft-rounded") {
    throw new DesignError("design_unsupported", 'appearance.typography "soft-rounded" is not available: the font sets hold no rounded family yet (available: modern-sans, editorial-serif)');
  }
  return TYPOGRAPHY_FONT_SETS[typography];
}

/** The two contrast rules a site's colours can be judged by — see `contrastRuleFor`. */
export type ContrastRule = "classic-surface" | "rendered-design";

/**
 * WHICH CONTRAST RULE APPLIES TO A DESIGN DOCUMENT — the one place that decides it.
 *
 *   a document that names a preset            → "rendered-design"  (`<html data-design="<presetId>">`)
 *   no document (`null`: the classic site)    → "classic-surface"  (`data-design="classic"`)
 *   a document without a preset ("custom":    → "classic-surface"  (`data-design="custom"`: the
 *   a brand typography on the classic recipe)                       classic sections, another font)
 */
export function contrastRuleFor(design: { preset?: { id: string; version: number } | null } | null | undefined): ContrastRule {
  return design?.preset ? "rendered-design" : "classic-surface";
}

/** One measured pair of a designed site: `subject` drawn `relation` `against`. */
export interface RenderedPair {
  /** which brand field decides the subject colour */
  decidedBy: "surface" | "accentColor" | "primaryColor";
  /** the emitted name of each colour: a `--ds-*` custom property or a tier-1 token id */
  subject: string;
  against: string;
  /** the emitted values, as the build writes them */
  subjectValue: string;
  againstValue: string;
  relation: "on" | "against";
  ratio: number;
  min: number;
}

/**
 * THE PAIRS A DESIGNED SITE RENDERS, measured on the values the build will emit: the `--ds-*`
 * roles are compiled here by the template's own compiler (design/tokens.ts — the very function the
 * root layout calls) from the final tier-1 tokens, and the primary pairs are the tier-1 tokens the
 * site theme prints. No second table of colours.
 *
 *   text        --ds-ink            on       --ds-bg                 4.5   running text
 *   accent      --ds-accent         against  --ds-bg                 3     a fill, rule or marker must stand off the page
 *               --ds-accent-ink     on       --ds-accent             4.5   text of an accent fill (computed: holds by construction)
 *               --ds-accent-text    on       --ds-bg, --ds-surface   4.5   the accent as text / outline (moved toward the ink: by construction)
 *               --ds-block-ink      on       --ds-block-bg           4.5   the emphasised section (by construction)
 *   primary     color.action.primary      against  color.canvas          3     where the inner pages draw it as a fill or a strong rule
 *               color.action.primaryText  on       color.action.primary  4.5   (derived: by construction)
 *               color.text.inverse        on       color.action.primary  4.5   (derived: by construction)
 *
 * The "by construction" pairs are measured all the same — asserted, not assumed. A colour the
 * compiler cannot read (it then writes a reference instead of a value) is not measured.
 */
export function renderedDesignPairs(input: { theme: ThemeTier2; tier1: Readonly<Record<string, string | undefined>>; fontSet: FontSetId }): RenderedPair[] {
  const ds = new Map<string, string>(compileDesignTokens(input).vars);
  const value = (name: string): string | undefined => (name.startsWith("--") ? ds.get(name) : input.tier1[name]);
  const pairs: RenderedPair[] = [];
  const measure = (decidedBy: RenderedPair["decidedBy"], subject: string, relation: RenderedPair["relation"], against: string, min: number) => {
    const [subjectValue, againstValue] = [value(subject), value(against)];
    const [a, b] = [parseColor(subjectValue), parseColor(againstValue)];
    if (!a || !b) return;
    pairs.push({ decidedBy, subject, against, subjectValue: subjectValue!, againstValue: againstValue!, relation, ratio: contrastRatio(a, b), min });
  };
  measure("surface", "--ds-ink", "on", "--ds-bg", TEXT_MIN_CONTRAST);
  measure("accentColor", "--ds-accent", "against", "--ds-bg", ACCENT_MIN_CONTRAST);
  measure("accentColor", "--ds-accent-ink", "on", "--ds-accent", TEXT_MIN_CONTRAST);
  measure("accentColor", "--ds-accent-text", "on", "--ds-bg", TEXT_MIN_CONTRAST);
  measure("accentColor", "--ds-accent-text", "on", "--ds-surface", TEXT_MIN_CONTRAST);
  measure("accentColor", "--ds-block-ink", "on", "--ds-block-bg", TEXT_MIN_CONTRAST);
  measure("primaryColor", "color.action.primary", "against", "color.canvas", PRIMARY_MIN_CONTRAST);
  measure("primaryColor", "color.action.primaryText", "on", "color.action.primary", TEXT_MIN_CONTRAST);
  measure("primaryColor", "color.text.inverse", "on", "color.action.primary", TEXT_MIN_CONTRAST);
  return pairs;
}

const sameColour = (a: Rgb, b: Rgb): boolean => a[0] === b[0] && a[1] === b[1] && a[2] === b[2];

export function applyPreset(planFiles: ReadonlyMap<string, Buffer>, preset: SitePreset | null, brandAppearance: BrandAppearance | null): Map<string, Buffer> {
  const files = new Map(planFiles);
  const brand = brandAppearance ?? {};
  const brandFontSet = fontSetOfTypography(brand.typography);
  if (preset === null && brandFontSet === undefined) return files;

  const settings = readDoc(files, "settings.json");
  if (!settings) throw new DesignError("design_invalid", "the planned site has no settings.json");
  const design = templateDesign(String(settings.templateId));

  // ---- the design document ----
  const config: DesignConfig = preset
    ? { preset: { id: preset.id, version: preset.version }, ...preset.design, theme: { ...preset.design.theme, surface: brand.surface ?? preset.design.theme.surface }, fontSet: brandFontSet ?? preset.design.fontSet }
    : { ...design.classic, theme: { ...design.classic.theme, surface: brand.surface ?? design.classic.theme.surface }, fontSet: brandFontSet! };
  const problems = validateDesignConfig(config, design.registry);
  if (problems.length > 0) throw new DesignError("design_invalid", "the composed design document is invalid", problems.map((p) => ({ ...p })));
  files.set("settings.json", json({ ...settings, overrides: { ...(settings.overrides ?? {}), "site.design": { config } } }));

  // ---- tier 1: palette + typography ----
  const theme = readDoc(files, "theme.json") ?? { schemaVersion: 1, contract: "theme-contract-v1", tokens: {} };
  const tokens: Record<string, string> = { ...theme.tokens };
  if (preset) {
    const kept = new Set<string>([...(brand.surface !== undefined ? SURFACE_TOKENS : []), ...(brand.primaryColor !== undefined ? PRIMARY_TOKENS : []), ...(brand.accentColor !== undefined ? ACCENT_TOKENS : [])]);
    for (const [token, value] of Object.entries(preset.tier1)) if (!kept.has(token)) tokens[token] = value;
    // a preset primary without its own text colours: derived, as the brand step derives them
    const primary = parseColor(preset.tier1["color.action.primary"]);
    if (primary && brand.primaryColor === undefined) {
      for (const token of ["color.action.primaryText", "color.text.inverse"]) if (!Object.hasOwn(preset.tier1, token)) tokens[token] = css(inkOn(primary));
      if (!Object.hasOwn(preset.tier1, "color.border.strong")) tokens["color.border.strong"] = preset.tier1["color.action.primary"]!;
    }
    // a brand surface the preset's own primary / accent was not chosen for: kept when it reads there, else a default is derived
    const canvas = parseColor(tokens["color.canvas"]);
    const ink = parseColor(tokens["color.text.primary"]);
    if (brand.surface !== undefined && canvas && ink) {
      const presetInk = parseColor(preset.tier1["color.text.primary"]);
      if (primary && brand.primaryColor === undefined && contrastRatio(primary, canvas) < PRIMARY_MIN_CONTRAST) {
        const derived = presetInk && sameColour(primary, presetInk) ? ink : readable(primary, [canvas], ink, PRIMARY_MIN_CONTRAST);
        tokens["color.action.primary"] = css(derived);
        tokens["color.border.strong"] = css(derived);
        for (const token of ["color.action.primaryText", "color.text.inverse"]) tokens[token] = css(inkOn(derived));
      }
      const accent = parseColor(tokens["color.accent.primary"]);
      if (accent && brand.accentColor === undefined && contrastRatio(accent, canvas) < ACCENT_MIN_CONTRAST) {
        tokens["color.accent.primary"] = css(readable(accent, [canvas], ink, ACCENT_MIN_CONTRAST));
      }
    }
  }
  const stacks = design.fontStacks[config.fontSet];
  if (stacks) {
    tokens["typography.heading"] = stacks.display;
    tokens["typography.body"] = stacks.body;
  }

  // ---- the colours that end up together must read ----
  const source = (field: "primaryColor" | "accentColor" | "surface", token: string) =>
    brand[field] !== undefined ? `appearance.${field} ${brand[field]}` : preset && Object.hasOwn(preset.tier1, token) ? `preset "${preset.id}" ${token} ${preset.tier1[token]}` : `the starter's ${token} ${tokens[token]}`;
  const surfaceName = brand.surface !== undefined ? `the ${brand.surface} surface` : preset ? `the surface of preset "${preset.id}"` : "the starter's surface";
  if (contrastRuleFor(config) === "rendered-design") {
    // what a designed site draws, on the values the build will emit
    const TOKEN_OF = { surface: "color.text.primary", accentColor: "color.accent.primary", primaryColor: "color.action.primary" } as const;
    for (const pair of renderedDesignPairs({ theme: config.theme, tier1: tokens, fontSet: config.fontSet })) {
      if (pair.ratio >= pair.min) continue;
      const detail = `${source(pair.decidedBy, TOKEN_OF[pair.decidedBy])} measures ${pair.ratio.toFixed(2)}:1 as ${pair.subject} ${pair.subjectValue} ${pair.relation} ${pair.against} ${pair.againstValue} (${surfaceName}); it needs at least ${pair.min}:1`;
      // a colour the brand block entered is the brand's to change; anything else is the preset on a surface it cannot be drawn on
      if (brand[pair.decidedBy] === undefined && brand.surface !== undefined) throw new DesignError("design_unsupported", `preset "${preset!.id}" cannot be drawn on ${surfaceName}: ${detail}`);
      throw new DesignError("contrast_too_low", detail);
    }
  } else {
    // the classic rule (platform/provision/brand.ts judgeAppearance), on the classic sections' own pairs
    const colour = (token: string) => parseColor(tokens[token]);
    const canvas = colour("color.canvas");
    const ink = colour("color.text.primary");
    const check = (what: string, a: Rgb | undefined, b: Rgb | undefined, min: number, relation: string) => {
      if (!a || !b) return;
      const ratio = contrastRatio(a, b);
      if (ratio < min) throw new DesignError("contrast_too_low", `${what} measures ${ratio.toFixed(2)}:1 ${relation}; it needs at least ${min}:1`);
    };
    check(source("surface", "color.text.primary"), ink, canvas, TEXT_MIN_CONTRAST, `against ${surfaceName}`);
    check(source("accentColor", "color.accent.primary"), colour("color.accent.primary"), canvas, ACCENT_MIN_CONTRAST, `against ${surfaceName}`);
    check(source("accentColor", "color.accent.primary"), colour("color.accent.primary"), ink, ACCENT_MIN_CONTRAST, `with the text colour of ${surfaceName} on it`);
    check(source("primaryColor", "color.action.primary"), colour("color.action.primary"), canvas, PRIMARY_MIN_CONTRAST, `against ${surfaceName}`);
  }

  if (JSON.stringify(tokens) !== JSON.stringify(theme.tokens)) files.set("theme.json", json({ ...theme, tokens }));

  // ---- neutral labels ----
  if (preset && Object.keys(preset.copy).length > 0) {
    const slots = readDoc(files, "slots.json");
    if (!slots) throw new DesignError("design_invalid", `preset "${preset.id}" carries copy but the planned site has no slots.json`);
    const values: Doc = { ...slots.values };
    for (const [section, entries] of Object.entries(preset.copy)) values[section] = { ...(values[section] ?? {}), ...entries };
    files.set("slots.json", json({ ...slots, values }));
  }
  return files;
}
