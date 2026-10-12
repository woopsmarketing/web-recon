import type { SectionDeclarations } from "../settings/settings";
import interior02 from "../../templates/interior-02/v1/template";
import { CLASSIC_DESIGN, CLASSIC_THEME, registry as interior02Registry } from "../../templates/interior-02/v1/design/registry";
import { FONT_STACKS } from "../../templates/interior-02/v1/design/fonts";
import interior02FontPins from "../../templates/interior-02/v1/design/fonts.json";
import { compileDesignTokens, defaultTokensCss, DS_TOKENS } from "../../templates/interior-02/v1/design/tokens";
import type { DesignConfig, DesignRegistry, FontSetId, ThemeTier2 } from "../../templates/interior-02/v1/design/contract";
import { DesignError } from "./errors";

/**
 * The design system of each Template that has one — the platform's view of what lives in the
 * Template directory.
 *
 * WHY THE IMPLEMENTATION LIVES IN THE TEMPLATE: a Template Release holds the Template directory and
 * six platform runtime directories, nothing else; the build workspace and the runtime kit run only
 * what a release holds. The validator of the design document, the registry and the tier-2 compiler
 * are rendered code, so they are files of the Template (templates/<id>/v<major>/design/{contract,
 * registry,tokens,fonts}). This directory (platform/design) is everything that is NOT rendered:
 * presets, the scaffold step, the font placement step of the site builder, the catalog, the
 * checks and the fixtures. It reads the Template's files through this module and re-exports them
 * (platform/design/index.ts), so there is one implementation of each rule.
 */
export interface FontFamilyPin {
  family: string;
  role: string;
  package: string;
  version: string;
  licence: string;
  /** the licence text the package ships, relative to the package root: read and checked whenever the set is built */
  licenceFile: string;
  /** the package's own @font-face stylesheet, relative to the package root */
  stylesheet: string;
  /** substrings of font file names that are left out (unicode slices a Korean-language site never needs) */
  exclude: string[];
}
export interface FontSetPin {
  css: { file: string; sha256: string; bytes: number };
  /** the licence texts of the set's families as a package holds them (`<dir>/<set>/<file>`), each named by its own hash */
  licences: { file: string; sha256: string; bytes: number }[];
  /** font files of the set */
  files: number;
  /** every file of the set: font files + licence texts + stylesheet */
  bytes: number;
  families: FontFamilyPin[];
}
export interface FontPins {
  schema: "design-fonts@1";
  dir: string;
  sets: Record<string, FontSetPin>;
}

export interface TemplateDesign {
  templateId: string;
  major: number;
  /** the Template directory, relative to the repository root */
  dir: string;
  /** the Template's declared sections (settings + slots): what a preset's `copy` is checked against */
  sections: SectionDeclarations;
  /** tier-1 tokens the Template consumes: what a preset's `tier1` may set */
  consumes: readonly string[];
  registry: DesignRegistry;
  classic: DesignConfig;
  classicTheme: ThemeTier2;
  compile: typeof compileDesignTokens;
  defaultTokensCss: typeof defaultTokensCss;
  tokens: typeof DS_TOKENS;
  fontStacks: Record<FontSetId, { display: string; body: string } | null>;
  fontPins: FontPins;
}

const TEMPLATES: Record<string, TemplateDesign> = {
  "interior-02": {
    templateId: "interior-02",
    major: 1,
    dir: "templates/interior-02/v1",
    sections: interior02.sections,
    consumes: interior02.theme.consumes,
    registry: interior02Registry,
    classic: CLASSIC_DESIGN,
    classicTheme: CLASSIC_THEME,
    compile: compileDesignTokens,
    defaultTokensCss,
    tokens: DS_TOKENS,
    fontStacks: FONT_STACKS,
    fontPins: interior02FontPins as FontPins,
  },
};

export const DESIGN_TEMPLATE_IDS: readonly string[] = Object.keys(TEMPLATES);

export function hasTemplateDesign(templateId: string): boolean {
  return Object.hasOwn(TEMPLATES, templateId);
}

export function templateDesign(templateId: string): TemplateDesign {
  if (!hasTemplateDesign(templateId)) throw new DesignError("design_unavailable", `template "${templateId}" has no design system`);
  return TEMPLATES[templateId]!;
}
