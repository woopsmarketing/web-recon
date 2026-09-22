import { z } from "zod";

import { SLOTIZED_TEMPLATE_SCHEMA_VERSION, ThemeTokenDefinitionSchema } from "./types.js";

/**
 * Theme (Task 29 Phase D) — schemas local to the theme extractor/compiler.
 *
 * `theme.json` is written as a STRICT `ThemeTokenDefinition[]` (the schema
 * already frozen in `types.ts`): nothing here widens it, so any consumer that
 * validates the run directory against `types.ts` keeps working. The evidence
 * that produced each token — census weights, role hints, risk rationale, the
 * un-tokenized long tail — would not fit that strict shape, so it is written
 * NEXT TO it in `theme-report.json` instead of being smuggled into the
 * definition file. The only thing carried inside a token is compact tag text
 * in `provenance.evidence` / `provenance.notes`, which the schema already
 * allows (`role:accent`, `census:decl=12,el=340`, `editor:hidden`).
 *
 * A theme edit must never reach layout: only color / font-family / radius /
 * shadow (+ guarded spacing) properties are ever emitted, and the compiler
 * refuses any value that could escape a declaration.
 */

export const THEME_REPORT_FILE = "theme-report.json";
export const SLOTIZED_THEME_REPORT_SCHEMA = "slotized-theme-report-v1";
export const THEME_EXTRACT_ENGINE = "deterministic-css-census-clustering";

/** Re-export of the frozen token shape — `theme.json` is exactly this array. */
export const ThemeTokenFileSchema = z.array(ThemeTokenDefinitionSchema);

/** Per-kind caps, by descending census weight. The tail is reported, not kept. */
export const TOKEN_CAPS = {
  color: 64,
  "font-family": 8,
  radius: 12,
  shadow: 12,
  "spacing-candidate": 16,
} as const;

/** A value must clear this before it can become a token. */
export const TOKEN_THRESHOLDS = {
  /** color/font/radius/shadow: element occurrences OR top-N by weight. */
  minElementOccurrences: 3,
  /** spacing is noisy, so it needs a much louder signal. */
  minSpacingDeclarations: 10,
  /**
   * A color painted by ≥ this share of all colored declarations has a blast
   * radius too wide to call safe (changing it repaints most of the site).
   */
  guardedShareOfDeclarations: 0.4,
} as const;

export const ThemeRoleSchema = z.enum(["canvas", "text.primary", "accent"]);
export type ThemeRole = z.infer<typeof ThemeRoleSchema>;

export const ThemeTokenEvidenceSchema = z
  .object({
    tokenId: z.string(),
    key: z.string(),
    kind: z.string(),
    value: z.string(),
    risk: z.string(),
    role: ThemeRoleSchema.optional(),
    /** Distinct (media, selector, property) targets this token owns. */
    declarations: z.number().int().nonnegative(),
    /** Sum of DOM nodes (all pages, both variants) carrying a target class. */
    elementOccurrences: z.number().int().nonnegative(),
    /** Hidden from the default theme editor (spacing candidates). */
    editorHidden: z.boolean(),
    /** Why this risk level was chosen. */
    riskReason: z.string(),
    sampleSelectors: z.array(z.string()),
    properties: z.array(z.string()),
  })
  .strict();
export type ThemeTokenEvidence = z.infer<typeof ThemeTokenEvidenceSchema>;

export const ThemeExtractionReportSchema = z
  .object({
    schemaVersion: z.literal(SLOTIZED_TEMPLATE_SCHEMA_VERSION),
    schemaName: z.literal(SLOTIZED_THEME_REPORT_SCHEMA),
    engine: z.literal(THEME_EXTRACT_ENGINE),
    templateId: z.string(),
    templateVersion: z.string(),
    generatedStylesFile: z.string(),
    generatedStylesBytes: z.number().int().nonnegative(),
    /** `.wr-stNNNNNN` rules read (the only selectors the extractor trusts). */
    rulesScanned: z.number().int().nonnegative(),
    /** Rules skipped because the selector is not class-addressable. */
    rulesSkipped: z.number().int().nonnegative(),
    pagesCensused: z.number().int().nonnegative(),
    classesCensused: z.number().int().nonnegative(),
    tokensByKind: z.record(z.string(), z.number().int().nonnegative()),
    tokensByRisk: z.record(z.string(), z.number().int().nonnegative()),
    /** Distinct values per kind that were seen but did NOT become tokens. */
    unTokenized: z.record(
      z.string(),
      z
        .object({
          values: z.number().int().nonnegative(),
          declarations: z.number().int().nonnegative(),
          reason: z.string(),
        })
        .strict(),
    ),
    /** Later rules win the cascade, so a re-claimed target replaces the first. */
    targetsReclaimed: z.number().int().nonnegative(),
    tokens: z.array(ThemeTokenEvidenceSchema),
  })
  .strict();
export type ThemeExtractionReport = z.infer<typeof ThemeExtractionReportSchema>;

/** Result of compiling a theme pack against a token definition file. */
export interface CompiledThemeCss {
  css: string;
  /** Token ids whose pack value differed from the default and were emitted. */
  applied: string[];
  /** Declarations emitted (one per token target). */
  declarations: number;
  /** CSS rules emitted (targets merged per selector per media condition). */
  rules: number;
  errors: string[];
  warnings: string[];
}
