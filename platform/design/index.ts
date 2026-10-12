/**
 * platform/design — the platform's door to the design system (CONTRACTS Part E).
 *
 *   contract    DesignConfig@1 · ThemeTier2 · the registry shape · validateDesignConfig
 *   tokens      compileDesignTokens (theme tier 2 + tier-1 colours + font set → --ds-*)
 *   templates   which Template has a design system, and its registry / classic document / font pins
 *   preset      site-preset@1: validatePreset · loadPreset · listPresets
 *   apply       applyPreset(planFiles, preset, brandAppearance) — the scaffold step
 *   catalog     presets.json for BoostChat (site-design-presets@1)
 *   fonts       font sets from the pinned OFL packages · font-step: their placement by the site builder
 *   check       registry check · placeholder gate · release gate
 *
 * The first two are implemented in the Template directory (they are rendered code and travel with
 * a release — templates.ts says why) and re-exported here, so platform code has one place to import
 * from and there is one implementation of every rule. Authoring guide: ./README.md.
 */
export * from "../../templates/interior-02/v1/design/contract";
export { compileDesignTokens, contrastRatio, defaultTokensCss, DS_TOKENS, DS_TOKEN_NAMES, fluid, inkOn, parseColor, readable, TEXT_CONTRAST_MIN } from "../../templates/interior-02/v1/design/tokens";
export type { DesignTokens, DsToken, Rgb } from "../../templates/interior-02/v1/design/tokens";
export * from "./errors";
export * from "./templates";
export * from "./preset";
export * from "./apply";
export * from "./catalog";
export * from "./fonts";
export * from "./font-step";
export * from "./check";
