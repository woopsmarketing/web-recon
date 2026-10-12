import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { isThemeToken, isValidTokenValue } from "../theme/theme";
import { PRESET_ID_PATTERN, validateDesignConfig, type PresetDesign } from "../../templates/interior-02/v1/design/contract";
import { contrastRatio, parseColor } from "../../templates/interior-02/v1/design/tokens";
import { DesignError, type DesignIssue } from "./errors";
import { templateDesign, type TemplateDesign } from "./templates";

/**
 * A design preset — `data/site-presets/<templateId>/<presetId>/preset.json`, schema site-preset@1.
 *
 *   id · version        the directory name · an integer that grows with every published change
 *   name · summary      what the operator's gallery shows (never customer copy)
 *   bestFor             one to four short phrases: the kind of business the direction suits
 *   minRelease          the first template version that can render it ("1.2.0")
 *   design              a DesignConfig@1 without `preset`: chrome, home recipe, pages, theme tier 2, font set
 *   tier1               the palette: tier-1 COLOUR tokens (theme-contract-v1). It defines the whole
 *                       surface (page, panels, text, borders); the action and accent colours are
 *                       optional defaults that a brand block overrides
 *   copy                { section: { slotKey: text } } — neutral structural labels only ("Projects",
 *                       "View all"), for text slots the template declares
 *
 * A preset holds no customer fact and no free-form styling. What the validator can hold it to, it
 * does: every design id is a registry member; a palette value is a colour this module can measure;
 * text reads on the page (4.5:1); `copy` names declared text slots, never a slot the brand block
 * owns, never a digit, an address or markup.
 */
export const PRESET_SCHEMA = "site-preset@1";
export const PRESETS_DIR = "data/site-presets";

export interface SitePreset {
  schema: typeof PRESET_SCHEMA;
  id: string;
  version: number;
  name: string;
  summary: string;
  bestFor: string[];
  minRelease: string;
  design: PresetDesign;
  tier1: Record<string, string>;
  copy: Record<string, Record<string, string>>;
}

/** The tokens that make up a surface: a preset defines all of them; a brand `surface` replaces all of them. */
export const SURFACE_TOKENS = [
  "color.canvas",
  "color.surface.primary",
  "color.surface.secondary",
  "color.surface.elevated",
  "color.text.primary",
  "color.text.secondary",
  "color.text.muted",
  "color.link",
  "color.border.default",
] as const;
/** What a brand `primaryColor` decides (the colour and the text derived for it). */
export const PRIMARY_TOKENS = ["color.action.primary", "color.action.primaryText", "color.text.inverse", "color.border.strong"] as const;
/** What a brand `accentColor` decides. */
export const ACCENT_TOKENS = ["color.accent.primary"] as const;

/** Slots the brand block writes (platform/provision/brand.ts): a preset may not carry copy for them. */
export const BRAND_OWNED_SLOTS: readonly string[] = [
  "site.menu.slogan",
  "about.page.introTitle",
  "about.page.introBody",
  "about.page.photoMedia",
  "site.footer.location1Name",
  "site.footer.location1Address",
  "site.footer.hours1Label",
  "site.footer.hours1Value",
  "site.footer.locationsNote",
  "site.footer.locationsLabel",
];

export const TEXT_MIN_CONTRAST = 4.5;
/** Same thresholds as the brand block's own check (platform/provision/brand.ts MIN_ACCENT_CONTRAST / MIN_PRIMARY_CONTRAST). */
export const ACCENT_MIN_CONTRAST = 3;
export const PRIMARY_MIN_CONTRAST = 3;

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const chars = (s: string): number => Array.from(s).length;

/** Every reason `doc` is not a site-preset@1 of this template. */
export function validatePreset(doc: unknown, design: TemplateDesign): DesignIssue[] {
  const issues: DesignIssue[] = [];
  const bad = (p: string, message: string) => void issues.push({ code: "design_invalid", path: p, message });
  if (!isRecord(doc)) return [{ code: "design_invalid", path: "", message: "must be an object" }];

  const KEYS = ["schema", "id", "version", "name", "summary", "bestFor", "minRelease", "design", "tier1", "copy"];
  for (const key of Object.keys(doc)) if (!KEYS.includes(key)) bad(key, "unknown field");
  for (const key of KEYS) if (!Object.hasOwn(doc, key)) bad(key, "is required");

  if (doc.schema !== undefined && doc.schema !== PRESET_SCHEMA) bad("schema", `must be "${PRESET_SCHEMA}"`);
  if (doc.id !== undefined && (typeof doc.id !== "string" || doc.id.length > 40 || !PRESET_ID_PATTERN.test(doc.id))) bad("id", "must be a lower-case kebab id of at most 40 characters");
  if (doc.version !== undefined && (typeof doc.version !== "number" || !Number.isInteger(doc.version) || doc.version < 1)) bad("version", "must be an integer ≥ 1");
  const text = (key: string, max: number) => {
    const v = doc[key];
    if (v !== undefined && (typeof v !== "string" || v.trim() !== v || v === "" || chars(v) > max)) bad(key, `must be a trimmed, non-empty string of at most ${max} characters`);
  };
  text("name", 40);
  text("summary", 200);
  if (doc.bestFor !== undefined) {
    if (!Array.isArray(doc.bestFor) || doc.bestFor.length < 1 || doc.bestFor.length > 4) bad("bestFor", "must be an array of one to four phrases");
    else doc.bestFor.forEach((v: unknown, i: number) => (typeof v !== "string" || v.trim() !== v || v === "" || chars(v) > 40 ? bad(`bestFor.${i}`, "must be a trimmed, non-empty phrase of at most 40 characters") : undefined));
  }
  if (doc.minRelease !== undefined && (typeof doc.minRelease !== "string" || !/^\d+\.\d+\.\d+$/.test(doc.minRelease))) bad("minRelease", 'must be a template version "x.y.z"');

  if (doc.design !== undefined) {
    for (const p of validateDesignConfig(doc.design, design.registry, { at: "design", preset: false })) issues.push({ code: "design_invalid", path: p.path, message: p.message });
  }

  // ---- tier 1: the palette ----
  if (doc.tier1 !== undefined) {
    if (!isRecord(doc.tier1)) bad("tier1", "must be an object { token: value }");
    else {
      const tier1 = doc.tier1;
      for (const [token, value] of Object.entries(tier1)) {
        const here = `tier1.${token}`;
        if (!isThemeToken(token) || !token.startsWith("color.")) bad(here, "is not a tier-1 colour token (a preset sets the palette; shape and type are tier 2)");
        else if (!design.consumes.includes(token)) bad(here, `is not a token template "${design.templateId}" consumes`);
        else if (typeof value !== "string" || !isValidTokenValue(token, value)) bad(here, "is not a valid colour value");
        else if (!parseColor(value)) bad(here, `"${value}" is not a colour this module can measure (use #rrggbb, rgb() or hsl())`);
      }
      for (const token of SURFACE_TOKENS) if (!Object.hasOwn(tier1, token)) bad(`tier1.${token}`, "is required (a preset defines its whole surface)");
      const colour = (token: string) => (typeof tier1[token] === "string" ? parseColor(tier1[token] as string) : undefined);
      const canvas = colour("color.canvas");
      const ink = colour("color.text.primary");
      if (canvas && ink) {
        const measure = (token: string, against: typeof canvas, min: number, what: string) => {
          const c = colour(token);
          if (c && contrastRatio(c, against) < min) bad(`tier1.${token}`, `measures ${contrastRatio(c, against).toFixed(2)}:1 ${what}; it needs at least ${min}:1`);
        };
        measure("color.text.primary", canvas, TEXT_MIN_CONTRAST, "against color.canvas");
        measure("color.text.secondary", canvas, TEXT_MIN_CONTRAST, "against color.canvas");
        measure("color.accent.primary", canvas, ACCENT_MIN_CONTRAST, "against color.canvas");
        measure("color.accent.primary", ink, ACCENT_MIN_CONTRAST, "with color.text.primary on it");
        measure("color.action.primary", canvas, PRIMARY_MIN_CONTRAST, "against color.canvas");
        const actionText = colour("color.action.primaryText");
        const action = colour("color.action.primary");
        if (actionText && action && contrastRatio(actionText, action) < TEXT_MIN_CONTRAST) bad("tier1.color.action.primaryText", `measures ${contrastRatio(actionText, action).toFixed(2)}:1 on color.action.primary; it needs at least ${TEXT_MIN_CONTRAST}:1`);
        const surface = isRecord(doc.design) && isRecord(doc.design.theme) ? doc.design.theme.surface : undefined;
        const paletteIsDark = contrastRatio(canvas, [0, 0, 0]) < contrastRatio(ink, [0, 0, 0]);
        if (typeof surface === "string" && (surface === "dark") !== paletteIsDark) {
          bad("design.theme.surface", paletteIsDark ? `is "${surface}" but the palette is dark (color.canvas is darker than color.text.primary)` : 'is "dark" but the palette is light');
        }
      }
    }
  }

  // ---- copy: neutral labels for declared text slots ----
  if (doc.copy !== undefined) {
    if (!isRecord(doc.copy)) bad("copy", "must be an object { section: { slotKey: text } }");
    else {
      for (const [section, values] of Object.entries(doc.copy)) {
        const decl = Object.hasOwn(design.sections, section) ? design.sections[section]!.slots : undefined;
        if (!decl) {
          bad(`copy.${section}`, `is not a section of template "${design.templateId}"`);
          continue;
        }
        if (!isRecord(values)) {
          bad(`copy.${section}`, "must be an object { slotKey: text }");
          continue;
        }
        for (const [key, value] of Object.entries(values)) {
          const here = `copy.${section}.${key}`;
          const slot = Object.hasOwn(decl, key) ? decl[key] : undefined;
          if (!slot) bad(here, "is not a slot of that section");
          else if (slot.type !== "text") bad(here, `is a ${slot.type} slot (a preset carries text labels only)`);
          else if (BRAND_OWNED_SLOTS.includes(`${section}.${key}`)) bad(here, "is written by the brand block; a preset may not set it");
          else if (typeof value !== "string" || value.trim() !== value || value === "") bad(here, "must be a trimmed, non-empty string");
          else if (chars(value) > slot.maxLength) bad(here, `is ${chars(value)} characters long (the slot allows ${slot.maxLength})`);
          else if (/\d/.test(value)) bad(here, "contains a digit (a preset carries structural labels, never a figure, a year, a price or a phone number)");
          else if (/[<>@]|https?:|www\./i.test(value)) bad(here, "contains markup, an address or a URL");
        }
      }
    }
  }
  return issues;
}

export function parsePreset(doc: unknown, design: TemplateDesign, where = "preset"): SitePreset {
  const issues = validatePreset(doc, design);
  if (issues.length > 0) throw new DesignError("design_invalid", `${where} is not a valid ${PRESET_SCHEMA}`, issues);
  return doc as SitePreset;
}

export function presetFile(repoRoot: string, templateId: string, presetId: string): string {
  if (!PRESET_ID_PATTERN.test(presetId) || presetId.length > 40) throw new DesignError("design_invalid", `"${presetId}" is not a preset id`);
  return path.join(repoRoot, PRESETS_DIR, templateId, presetId, "preset.json");
}

/** The preset `presetId` of a template; `version` (when given) must be the version the file holds. */
export async function loadPreset(opts: { repoRoot: string; templateId: string; presetId: string; version?: number }): Promise<SitePreset> {
  const design = templateDesign(opts.templateId);
  const file = presetFile(opts.repoRoot, opts.templateId, opts.presetId);
  const raw = await readFile(file, "utf8").catch(() => undefined);
  if (raw === undefined) throw new DesignError("design_unavailable", `template "${opts.templateId}" has no preset "${opts.presetId}"`);
  let doc: unknown;
  try {
    doc = JSON.parse(raw);
  } catch (error) {
    throw new DesignError("design_invalid", `${path.relative(opts.repoRoot, file)} is not JSON (${(error as Error).message})`);
  }
  const preset = parsePreset(doc, design, path.relative(opts.repoRoot, file));
  if (preset.id !== opts.presetId) throw new DesignError("design_invalid", `${path.relative(opts.repoRoot, file)} says id "${preset.id}" but lives in directory "${opts.presetId}"`);
  if (opts.version !== undefined && preset.version !== opts.version) {
    throw new DesignError("design_unavailable", `preset "${opts.presetId}" is at version ${preset.version} in this checkout; version ${opts.version} was asked for`);
  }
  return preset;
}

/** Every preset of a template, by id. An absent directory = no preset. */
export async function listPresets(opts: { repoRoot: string; templateId: string }): Promise<SitePreset[]> {
  const dir = path.join(opts.repoRoot, PRESETS_DIR, opts.templateId);
  const ids = (await readdir(dir, { withFileTypes: true }).catch(() => [])).filter((e) => e.isDirectory()).map((e) => e.name).sort();
  const out: SitePreset[] = [];
  for (const presetId of ids) out.push(await loadPreset({ ...opts, presetId }));
  return out;
}
