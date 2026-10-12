/**
 * Design contract of this Template — constants, types and the one validator. NO import.
 *
 *   DesignConfig@1   what a site may choose: a home recipe (ordered sections, one variant each), a
 *                    variant for the chrome (header · footer · mobile bar) and for the two portfolio
 *                    pages, seven theme enums (tier 2) and a font set. Every value is a member of a
 *                    closed list: there is no CSS, no HTML, no class name and no URL in the document.
 *   DesignRegistry   the shape of the allowlist (design/registry.ts holds the data).
 *   validateDesignConfig(doc, registry) → problems, each with the exact path of the offending value.
 *
 * The file is part of a release (it travels with the Template) and is also what the platform's
 * design module (platform/design) validates presets with — one implementation, two readers.
 * `null` instead of a document = the classic site (design/registry.ts CLASSIC_DESIGN).
 */

export const TYPE_SCALES = ["compact", "regular", "display"] as const;
export const HEADING_WEIGHTS = ["light", "regular", "bold"] as const;
export const DENSITIES = ["airy", "regular", "compact"] as const;
export const CONTAINERS = ["narrow", "regular", "wide"] as const;
export const CORNERS = ["square", "soft", "round"] as const;
export const SURFACES = ["warm", "neutral", "cool", "dark"] as const;
export const ACCENT_USES = ["minimal", "blocks", "fills"] as const;
export const FONT_SETS = ["system", "sans-pretendard", "serif-noto"] as const;

export type FontSetId = (typeof FONT_SETS)[number];

/** Theme tier 2: enum choices only, compiled into the `--ds-*` custom properties (design/tokens.ts). */
export interface ThemeTier2 {
  typeScale: (typeof TYPE_SCALES)[number];
  headingWeight: (typeof HEADING_WEIGHTS)[number];
  density: (typeof DENSITIES)[number];
  container: (typeof CONTAINERS)[number];
  corner: (typeof CORNERS)[number];
  surface: (typeof SURFACES)[number];
  accentUse: (typeof ACCENT_USES)[number];
}

export const THEME_TIER2_FIELDS = {
  typeScale: TYPE_SCALES,
  headingWeight: HEADING_WEIGHTS,
  density: DENSITIES,
  container: CONTAINERS,
  corner: CORNERS,
  surface: SURFACES,
  accentUse: ACCENT_USES,
} as const satisfies Record<keyof ThemeTier2, readonly string[]>;

export interface HomeEntry {
  section: string;
  variant: string;
}

export interface DesignConfig {
  /** the preset this document was composed from (a record for the operator; nothing is read through it) */
  preset: { id: string; version: number } | null;
  chrome: { header: string; footer: string; mobileBar: string };
  home: HomeEntry[];
  pages: { listing: string; detail: string };
  theme: ThemeTier2;
  fontSet: FontSetId;
}

/** A design document as a preset carries it: everything but the preset reference. */
export type PresetDesign = Omit<DesignConfig, "preset">;

/**
 * How a variant travels to a runtime slot: the slot's data (plain JSON) carries this key with the
 * variant id. Absent = classic — so the data of a classic site is exactly what it was.
 */
export const SLOT_VARIANT_KEY = "dsVariant";

export const MAX_HOME_SECTIONS = 9;
export const FIRST_HOME_SECTION = "hero";
export const PRESET_ID_PATTERN = /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/;

// ------------------------------------------------------------------ registry --

/**
 *   classic       today's implementation (sections/**), unchanged
 *   placeholder   registered, its files exist, but it still renders the classic implementation —
 *                 a site builds with it, a release is not cut while a preset names it
 *   ready         implemented and reviewed
 */
export type VariantStatus = "classic" | "placeholder" | "ready";

export interface VariantEntry {
  status: VariantStatus;
  /** Template-relative module (null = nothing of its own is rendered: `classic` code, or the absent mobile bar) */
  module: string | null;
  /** Template-relative data module of a variant that is rendered through a runtime slot (its component is browser code); else null */
  data: string | null;
  /** Template-relative stylesheet (null for classic: its rules live in styles/*.css) */
  css: string | null;
  /** one line for the operator catalog and the authoring guide */
  summary: string;
}

/**
 *   home     a section of the home recipe
 *   chrome   header · footer · mobile bar (one variant each, every page)
 *   page     the portfolio list and the project page (one variant each)
 */
export type SectionPlace = "home" | "chrome" | "page";

export interface SectionEntry {
  place: SectionPlace;
  /** the runtime slot the section is rendered through (portfolio-reading sections); null = rendered by the page itself */
  slot: string | null;
  variants: Record<string, VariantEntry>;
}

export interface DesignRegistry {
  templateId: string;
  sections: Record<string, SectionEntry>;
}

// ---------------------------------------------------------------- validation --

export interface DesignProblem {
  code: "design_invalid";
  /** dotted path into the document ("home.2.variant", "theme.corner", "" = the document itself) */
  path: string;
  message: string;
}

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const join = (base: string, key: string | number): string => (base === "" ? String(key) : `${base}.${key}`);
const list = (values: readonly string[]): string => values.map((v) => `"${v}"`).join(", ");

function variantsOf(registry: DesignRegistry, section: string, place: SectionPlace): string[] | undefined {
  const entry = Object.hasOwn(registry.sections, section) ? registry.sections[section] : undefined;
  return entry && entry.place === place ? Object.keys(entry.variants) : undefined;
}

function sectionsAt(registry: DesignRegistry, place: SectionPlace): string[] {
  return Object.keys(registry.sections).filter((s) => registry.sections[s]!.place === place);
}

/**
 * Every reason `doc` is not a DesignConfig@1 of this registry. `at` prefixes the reported paths
 * (a preset reports "design.home.2.variant"). `preset: false` = the document of a preset file,
 * which has no `preset` member.
 */
export function validateDesignConfig(doc: unknown, registry: DesignRegistry, options: { at?: string; preset?: boolean } = {}): DesignProblem[] {
  const at = options.at ?? "";
  const withPreset = options.preset ?? true;
  const problems: DesignProblem[] = [];
  const bad = (path: string, message: string) => void problems.push({ code: "design_invalid", path, message });

  if (!isRecord(doc)) {
    bad(at, "must be an object");
    return problems;
  }
  const strict = (value: Record<string, unknown>, allowed: readonly string[], base: string) => {
    for (const key of Object.keys(value)) if (!allowed.includes(key)) bad(join(base, key), `unknown field (allowed: ${list(allowed)})`);
    for (const key of allowed) if (!Object.hasOwn(value, key)) bad(join(base, key), "is required");
  };
  const member = (value: unknown, allowed: readonly string[], path: string, what: string): value is string => {
    if (typeof value === "string" && allowed.includes(value)) return true;
    if (value !== undefined) bad(path, `unknown ${what} ${typeof value === "string" ? `"${value}"` : `(${typeof value})`} (allowed: ${list(allowed)})`);
    return false;
  };

  strict(doc, withPreset ? ["preset", "chrome", "home", "pages", "theme", "fontSet"] : ["chrome", "home", "pages", "theme", "fontSet"], at);

  if (withPreset && doc.preset !== undefined && doc.preset !== null) {
    const base = join(at, "preset");
    if (!isRecord(doc.preset)) bad(base, "must be null or { id, version }");
    else {
      strict(doc.preset, ["id", "version"], base);
      const { id, version } = doc.preset;
      if (id !== undefined && (typeof id !== "string" || id.length > 40 || !PRESET_ID_PATTERN.test(id))) bad(join(base, "id"), "must be a lower-case kebab id of at most 40 characters");
      if (version !== undefined && (typeof version !== "number" || !Number.isInteger(version) || version < 1)) bad(join(base, "version"), "must be an integer ≥ 1");
    }
  }

  if (doc.chrome !== undefined) {
    const base = join(at, "chrome");
    if (!isRecord(doc.chrome)) bad(base, "must be an object");
    else {
      strict(doc.chrome, ["header", "footer", "mobileBar"], base);
      for (const key of ["header", "footer", "mobileBar"] as const) member(doc.chrome[key], variantsOf(registry, key, "chrome") ?? [], join(base, key), `${key} variant`);
    }
  }

  if (doc.home !== undefined) {
    const base = join(at, "home");
    if (!Array.isArray(doc.home)) bad(base, "must be an array of { section, variant }");
    else {
      if (doc.home.length === 0) bad(base, "must name at least one section");
      if (doc.home.length > MAX_HOME_SECTIONS) bad(base, `names ${doc.home.length} sections (at most ${MAX_HOME_SECTIONS})`);
      const homeSections = sectionsAt(registry, "home");
      const seen = new Map<string, number>();
      doc.home.forEach((entry: unknown, i: number) => {
        const here = join(base, i);
        if (!isRecord(entry)) return bad(here, "must be { section, variant }");
        strict(entry, ["section", "variant"], here);
        if (!member(entry.section, homeSections, join(here, "section"), "home section")) return;
        const first = seen.get(entry.section);
        if (first !== undefined) bad(join(here, "section"), `section "${entry.section}" is named twice (first at ${join(base, first)})`);
        else seen.set(entry.section, i);
        if (entry.section === FIRST_HOME_SECTION && i !== 0) bad(join(here, "section"), `"${FIRST_HOME_SECTION}" must be the first home section (it is at position ${i + 1})`);
        member(entry.variant, variantsOf(registry, entry.section, "home") ?? [], join(here, "variant"), `variant of section "${entry.section}"`);
      });
      const head: unknown = doc.home[0];
      if (isRecord(head) && typeof head.section === "string" && homeSections.includes(head.section) && head.section !== FIRST_HOME_SECTION && !seen.has(FIRST_HOME_SECTION)) {
        bad(join(join(base, 0), "section"), `the first home section must be "${FIRST_HOME_SECTION}" (it is "${head.section}")`);
      }
    }
  }

  if (doc.pages !== undefined) {
    const base = join(at, "pages");
    if (!isRecord(doc.pages)) bad(base, "must be an object");
    else {
      strict(doc.pages, ["listing", "detail"], base);
      for (const key of ["listing", "detail"] as const) member(doc.pages[key], variantsOf(registry, key, "page") ?? [], join(base, key), `${key} page variant`);
    }
  }

  if (doc.theme !== undefined) {
    const base = join(at, "theme");
    if (!isRecord(doc.theme)) bad(base, "must be an object");
    else {
      const fields = Object.keys(THEME_TIER2_FIELDS) as (keyof ThemeTier2)[];
      strict(doc.theme, fields, base);
      for (const field of fields) member(doc.theme[field], THEME_TIER2_FIELDS[field], join(base, field), field);
    }
  }

  member(doc.fontSet, FONT_SETS, join(at, "fontSet"), "font set");
  return problems;
}

/** "home.2.variant: unknown variant …" lines, for an error message. */
export function describeDesignProblems(problems: readonly DesignProblem[]): string {
  return problems.map((p) => `${p.path || "(root)"}: ${p.message}`).join("; ");
}
