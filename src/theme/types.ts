import { z } from "zod";

/**
 * Theme Extraction, Token Contract & Theme Adapter Foundation — types (Task 20).
 *
 * Theme is a VISUAL SKIN over an accepted Recon Template, never a redesign.
 * The architecture keeps three artifacts strictly apart:
 *
 *   Theme File           what the colors ARE            (site-agnostic, reusable)
 *   Site Theme Adapter   where those colors LAND        (this site's paint identity)
 *   Theme Overlay CSS    the composed application       (per theme run, additive)
 *
 * A Theme File may never carry a CSS selector, a className, a nodeId or a
 * route — structurally: its token keys are a CLOSED contract vocabulary and
 * its values are validated paint values. The adapter is the only artifact
 * that knows this site's `wr-st…` identities, and it never invents a common
 * class: site A's `.wr-st00123` and site B's `.wr-st90882` can both map to
 * `color.action.primary` while keeping their own names.
 *
 * The Recon Template (Task 19.1, frozen) is IMMUTABLE input. Theme runs write
 * only into their own namespaces:
 *
 *   data/<host>/theme-extractions/<run-id>/   original theme + adapter + groups
 *   data/<host>/theme-runs/<run-id>/          selected theme + overlay + QA
 *
 * Application is an overlay in the exact sense of Task 19's content overlay:
 * the theme run's CSS is APPENDED AFTER the template app's own stylesheet at
 * the serve boundary — with no theme, the app's bytes and behavior are
 * untouched by construction.
 */

// ---------------------------------------------------------------------------
// Versions & namespaces
// ---------------------------------------------------------------------------

export const THEME_CONTRACT_ID = "theme-contract-v1";
export const THEME_CONTRACT_VERSION = 1 as const;
/** Bumped when the shape of anything this Task persists changes. */
export const THEME_SCHEMA_VERSION = 1 as const;
export const THEME_ADAPTER_VERSION = 1 as const;
export const THEME_ENGINE = "deterministic-theme-extraction";

export const THEME_EXTRACTIONS_DIR = "theme-extractions";
export const THEME_RUNS_DIR = "theme-runs";

/** Fixed file names inside a theme extraction run directory. */
export const EXTRACTION_MANIFEST_FILE = "manifest.json";
export const ORIGINAL_THEME_FILE = "original.theme.json";
export const THEME_ADAPTER_FILE = "site-theme-adapter.json";
export const PAINT_GROUPS_FILE = "paint-groups.json";
export const EXTRACTION_REPORT_DIR = "report";
export const EXTRACTION_REVIEW_FILE = "theme-review.json";

/** Fixed file names inside a theme run directory. */
export const RUN_MANIFEST_FILE = "manifest.json";
export const SELECTED_THEME_FILE = "selected-theme.json";
export const RUN_ADAPTER_FILE = "theme-adapter.json";
export const THEME_OVERLAY_FILE = "theme-overlay.css";
export const COMPATIBILITY_FILE = "compatibility.json";
export const THEME_QA_FILE = "qa.json";
export const THEME_RUN_REPORT_DIR = "report";

// ---------------------------------------------------------------------------
// Token contract (theme-contract-v1)
// ---------------------------------------------------------------------------

/**
 * The closed common token vocabulary. Deliberately small (§3: 필요 이상으로
 * token을 늘리지 않는다) and every token is OPTIONAL — a site that has no
 * observable evidence for a token simply does not assign it, and a theme that
 * does not provide a token leaves those paint groups at their original value.
 */
export const COLOR_TOKENS = [
  "color.canvas",
  "color.surface.primary",
  "color.surface.secondary",
  "color.surface.elevated",
  "color.text.primary",
  "color.text.secondary",
  "color.text.muted",
  "color.text.inverse",
  "color.action.primary",
  "color.action.primaryText",
  "color.link",
  "color.border.default",
  "color.border.strong",
  "color.accent.primary",
  "color.accent.secondary",
] as const;

export const DECORATION_TOKENS = [
  "decoration.radius.small",
  "decoration.radius.medium",
  "decoration.radius.large",
  "decoration.radius.pill",
  "decoration.shadow.small",
  "decoration.shadow.medium",
  "decoration.shadow.large",
] as const;

/**
 * Typography tokens are CONTRACT-representable but automatic application is
 * OFF in this Task (no font materialization yet; a font swap changes line
 * wrap and document height). A theme carrying them gets a
 * `typography-not-applied` compatibility warning, never an applied rule.
 */
export const TYPOGRAPHY_TOKENS = ["typography.body", "typography.heading"] as const;

export const THEME_TOKENS = [
  ...COLOR_TOKENS,
  ...DECORATION_TOKENS,
  ...TYPOGRAPHY_TOKENS,
] as const;
export type ThemeTokenId = (typeof THEME_TOKENS)[number];

const THEME_TOKEN_SET: ReadonlySet<string> = new Set(THEME_TOKENS);
export function isThemeToken(id: string): id is ThemeTokenId {
  return THEME_TOKEN_SET.has(id);
}

export type ThemeTokenKind = "color" | "radius" | "shadow" | "typography";
export function tokenKind(id: ThemeTokenId): ThemeTokenKind {
  if (id.startsWith("color.")) return "color";
  if (id.startsWith("decoration.radius.")) return "radius";
  if (id.startsWith("decoration.shadow.")) return "shadow";
  return "typography";
}

/** Theme levels (§2). Typography (level 3) is contract-only in this Task. */
export function tokenLevel(id: ThemeTokenId): 1 | 2 | 3 {
  const kind = tokenKind(id);
  if (kind === "color") return 1;
  if (kind === "typography") return 3;
  return 2;
}

// ---------------------------------------------------------------------------
// Paint property allowlist (§9) — CLOSED
// ---------------------------------------------------------------------------

/**
 * The only CSS properties a theme overlay may ever write, keyed by how the
 * pipeline's stylesheets actually spell them. The Observer records borders as
 * SHORTHANDS (`border-top: 1px solid rgb(…)`), so border theming substitutes
 * ONLY the color component while copying the observed width and style
 * verbatim — the layout half of the shorthand is preserved byte-for-byte.
 *
 * `caret-color`, `outline-color` and `text-decoration-color` are Level 1
 * candidates by contract but occur 0 times in this pipeline's stylesheets
 * (they are not in the Observer's style whitelist); they are listed so the
 * allowlist is honest about its ceiling, and they bind nothing today.
 */
export const THEMEABLE_PROPERTIES_LEVEL1 = [
  "color",
  "background-color",
  "border-top",
  "border-right",
  "border-bottom",
  "border-left",
  "caret-color",
  "outline-color",
  "text-decoration-color",
] as const;

export const THEMEABLE_PROPERTIES_LEVEL2 = ["border-radius", "box-shadow"] as const;

export const THEMEABLE_PROPERTIES = [
  ...THEMEABLE_PROPERTIES_LEVEL1,
  ...THEMEABLE_PROPERTIES_LEVEL2,
] as const;

const THEMEABLE_PROPERTY_SET: ReadonlySet<string> = new Set(THEMEABLE_PROPERTIES);
export function isThemeableProperty(name: string): boolean {
  return THEMEABLE_PROPERTY_SET.has(name);
}

// ---------------------------------------------------------------------------
// Theme File (§4)
// ---------------------------------------------------------------------------

/**
 * A theme token VALUE is a paint value, never structure. Anything that could
 * escape a declaration, smuggle a selector, or reference an asset is refused.
 */
export function isSafeThemeValue(value: string): boolean {
  if (value === "" || value.length > 500) return false;
  if (/[;{}<>]/.test(value)) return false;
  if (/[\u0000-\u001f\u007f]/u.test(value)) return false;
  if (/url\s*\(/i.test(value)) return false;
  if (/expression\s*\(/i.test(value)) return false;
  if (/javascript:/i.test(value)) return false;
  if (/@|\\/.test(value)) return false;
  const doubles = (value.match(/"/g) ?? []).length;
  const singles = (value.match(/'/g) ?? []).length;
  if (doubles % 2 !== 0 || singles % 2 !== 0) return false;
  return true;
}

export const ThemeMetadataSchema = z
  .object({
    /** Compatibility/description metadata ONLY — never an auto-ranking input (§19). */
    mode: z.enum(["light", "dark"]),
    contrast: z.enum(["low", "medium", "high"]).optional(),
    supports: z.array(z.enum(["palette", "decoration", "typography"])).min(1),
    requires: z.array(z.string()).optional(),
    warnings: z.array(z.string()).optional(),
    description: z.string().max(500).optional(),
  })
  .strict();
export type ThemeMetadata = z.infer<typeof ThemeMetadataSchema>;

export const ThemeFileSchema = z
  .object({
    schemaVersion: z.literal(THEME_SCHEMA_VERSION),
    contract: z.literal(THEME_CONTRACT_ID),
    themeId: z.string().regex(/^[a-z0-9][a-z0-9.-]{1,63}$/),
    name: z.string().min(1).max(120),
    metadata: ThemeMetadataSchema,
    /**
     * token id → paint value. Keys are the CLOSED contract vocabulary — a CSS
     * selector, className, nodeId or route has no place to live in this file.
     */
    tokens: z.record(z.string(), z.string()).superRefine((tokens, ctx) => {
      for (const [key, value] of Object.entries(tokens)) {
        if (!isThemeToken(key)) {
          ctx.addIssue({
            code: "custom",
            message: `unknown theme token "${key}" — not in ${THEME_CONTRACT_ID}`,
          });
        }
        if (!isSafeThemeValue(value)) {
          ctx.addIssue({ code: "custom", message: `unsafe value for token "${key}"` });
        }
      }
    }),
    /** Extraction provenance for exported original themes; absent on curated files. */
    provenance: z.enum(["curated", "extracted-original"]).optional(),
    /** Extracted originals stay export CANDIDATES until a human promotes them (§18). */
    libraryPromotion: z.literal("export-candidate").optional(),
    sourceTemplateId: z.string().optional(),
  })
  .strict();
export type ThemeFile = z.infer<typeof ThemeFileSchema>;

// ---------------------------------------------------------------------------
// Paint groups (§11) & Site Theme Adapter (§7)
// ---------------------------------------------------------------------------

export const PaintGroupStatusSchema = z.enum(["themeable", "preserved", "review"]);
export type PaintGroupStatus = z.infer<typeof PaintGroupStatusSchema>;

export const SelectorKindSchema = z.enum(["style-token", "doc-root", "node-scoped"]);
export type SelectorKind = z.infer<typeof SelectorKindSchema>;

/**
 * One deterministic paint identity: every stylesheet occurrence of one
 * (property, value) pair, with the exact selectors that paint it. NOT every
 * group gets a semantic name — an unexplained color stays a raw group with
 * `semanticToken: null` rather than being forced into the contract (§11).
 */
export const PaintGroupSchema = z
  .object({
    paintGroupId: z.string().regex(/^pg\d{6}$/),
    /** The property as spelled in the stylesheet (`border-top` is a shorthand). */
    property: z.string(),
    /** What the theme would substitute: color | radius | shadow. */
    paintKind: z.enum(["color", "radius", "shadow"]),
    /** The full observed declaration value. */
    value: z.string(),
    /** For border shorthands: the observed color component alone. */
    colorComponent: z.string().optional(),
    /** For border shorthands: the observed `width style` prefix kept verbatim. */
    preservedPrefix: z.string().optional(),
    ruleCount: z.number().int().nonnegative(),
    /** Elements measured on the template's own runtime trees (static pages). */
    staticElementCount: z.number().int().nonnegative(),
    /** Elements inside captured dynamic templates (mounted on interaction). */
    dynamicElementCount: z.number().int().nonnegative(),
    /** Occurrences on pseudo-element / node-scoped rules (no element census). */
    nodeScopedRuleCount: z.number().int().nonnegative(),
    selectorKinds: z.array(SelectorKindSchema),
    /** Exact stylesheet selectors this group owns (site-specific identity). */
    selectors: z.array(z.string()),
    /** Deterministic context evidence (element-weighted). */
    contexts: z
      .object({
        directText: z.number().int().nonnegative(),
        heading: z.number().int().nonnegative(),
        anchorOrButton: z.number().int().nonnegative(),
        landmarks: z.record(z.string(), z.number().int().nonnegative()),
      })
      .strict(),
    semanticToken: z.string().nullable(),
    status: PaintGroupStatusSchema,
    reasons: z.array(z.string()),
    provenance: z.literal("derived"),
  })
  .strict();
export type PaintGroup = z.infer<typeof PaintGroupSchema>;

export const AdapterTokenEntrySchema = z
  .object({
    originalValue: z.string(),
    boundGroupIds: z.array(z.string()),
    /** observed = read from painted declarations; derived = computed from them. */
    provenance: z.enum(["observed", "derived"]),
    evidence: z.array(z.string()),
  })
  .strict();
export type AdapterTokenEntry = z.infer<typeof AdapterTokenEntrySchema>;

export const AdapterCoverageSchema = z
  .object({
    themeableGroups: z.number().int().nonnegative(),
    preservedGroups: z.number().int().nonnegative(),
    reviewGroups: z.number().int().nonnegative(),
    /** Element-weighted coverage of TEXT color paint (dark-theme gate input). */
    textColorElementWeight: z.number().int().nonnegative(),
    textColorBoundElementWeight: z.number().int().nonnegative(),
    /** Element-weighted coverage of opaque background paint. */
    backgroundElementWeight: z.number().int().nonnegative(),
    backgroundBoundElementWeight: z.number().int().nonnegative(),
    /** Unbound DARK text weight — the §23 preserved-dark-text hazard measure. */
    unboundDarkTextElementWeight: z.number().int().nonnegative(),
  })
  .strict();
export type AdapterCoverage = z.infer<typeof AdapterCoverageSchema>;

export const SiteThemeAdapterSchema = z
  .object({
    schemaVersion: z.literal(THEME_SCHEMA_VERSION),
    adapterVersion: z.literal(THEME_ADAPTER_VERSION),
    contract: z.literal(THEME_CONTRACT_ID),
    templateId: z.string(),
    host: z.string(),
    rootUrl: z.string(),
    stylesheet: z
      .object({
        file: z.string(),
        sha256: z.string(),
        ruleCount: z.number().int().nonnegative(),
      })
      .strict(),
    tokens: z.record(z.string(), AdapterTokenEntrySchema).superRefine((tokens, ctx) => {
      for (const key of Object.keys(tokens)) {
        if (!isThemeToken(key)) {
          ctx.addIssue({ code: "custom", message: `unknown token "${key}" in adapter` });
        }
      }
    }),
    paintGroups: z.array(PaintGroupSchema),
    coverage: AdapterCoverageSchema,
    appliedOverrides: z.array(z.string()),
    limitations: z.array(z.string()),
    provenance: z.literal("derived"),
  })
  .strict();
export type SiteThemeAdapter = z.infer<typeof SiteThemeAdapterSchema>;

// ---------------------------------------------------------------------------
// Manual adapter overrides (§26)
// ---------------------------------------------------------------------------

export const ThemeAdapterOverridesSchema = z
  .object({
    /** Bind a raw/preserved/review group to a contract token → themeable. */
    bind: z
      .array(z.object({ paintGroupId: z.string(), token: z.string() }).strict())
      .optional(),
    /** Remove a group's semantic binding (stays review). */
    unbind: z.array(z.string()).optional(),
    /** Force a group to keep its original value (themeable/review → preserved). */
    preserve: z.array(z.string()).optional(),
    /** Promote a review group to themeable (requires an existing binding). */
    themeable: z.array(z.string()).optional(),
  })
  .strict();
export type ThemeAdapterOverrides = z.infer<typeof ThemeAdapterOverridesSchema>;

// ---------------------------------------------------------------------------
// Extraction manifest
// ---------------------------------------------------------------------------

export const ExtractionManifestSchema = z
  .object({
    schemaVersion: z.literal(THEME_SCHEMA_VERSION),
    kind: z.literal("theme-extraction"),
    extractionId: z.string(),
    createdAt: z.string(),
    engine: z.literal(THEME_ENGINE),
    contract: z.literal(THEME_CONTRACT_ID),
    source: z
      .object({
        templateManifestFile: z.string(),
        templateId: z.string(),
        host: z.string(),
        rootUrl: z.string(),
        templateSchemaVersion: z.number().int(),
      })
      .strict(),
    counts: z
      .object({
        stylesheetRules: z.number().int().nonnegative(),
        paintGroups: z.number().int().nonnegative(),
        themeable: z.number().int().nonnegative(),
        preserved: z.number().int().nonnegative(),
        review: z.number().int().nonnegative(),
        assignedTokens: z.number().int().nonnegative(),
        unassignedTokens: z.number().int().nonnegative(),
      })
      .strict(),
    /** The extracted original is an export CANDIDATE, never auto-promoted (§18). */
    libraryPromotion: z.literal("export-candidate"),
    limitations: z.array(z.string()),
    provenance: z.literal("derived"),
  })
  .strict();
export type ExtractionManifest = z.infer<typeof ExtractionManifestSchema>;

// ---------------------------------------------------------------------------
// Compatibility (§21–§23)
// ---------------------------------------------------------------------------

export const CompatibilityResultSchema = z.enum([
  "compatible",
  "compatible-with-warnings",
  "incompatible",
]);
export type CompatibilityResult = z.infer<typeof CompatibilityResultSchema>;

export const CompatibilityCheckSchema = z
  .object({
    id: z.string(),
    level: z.enum(["ok", "warning", "error"]),
    detail: z.string(),
  })
  .strict();
export type CompatibilityCheck = z.infer<typeof CompatibilityCheckSchema>;

export const CompatibilityReportSchema = z
  .object({
    schemaVersion: z.literal(THEME_SCHEMA_VERSION),
    themeId: z.string(),
    templateId: z.string(),
    result: CompatibilityResultSchema,
    checks: z.array(CompatibilityCheckSchema),
    /** Deterministic — no ranking, no score (§21). */
    provenance: z.literal("derived"),
  })
  .strict();
export type CompatibilityReport = z.infer<typeof CompatibilityReportSchema>;

// ---------------------------------------------------------------------------
// Theme run manifest (§35)
// ---------------------------------------------------------------------------

export const ThemeRunManifestSchema = z
  .object({
    schemaVersion: z.literal(THEME_SCHEMA_VERSION),
    kind: z.literal("theme-run"),
    runId: z.string(),
    createdAt: z.string(),
    templateId: z.string(),
    templateManifestFile: z.string(),
    contentRunDir: z.string().optional(),
    themeId: z.string(),
    themeName: z.string(),
    themeMode: z.enum(["light", "dark"]),
    themeSourceFile: z.string(),
    adapterVersion: z.literal(THEME_ADAPTER_VERSION),
    adapterSourceFile: z.string(),
    compatibility: CompatibilityResultSchema,
    overlay: z
      .object({
        file: z.literal(THEME_OVERLAY_FILE),
        customProperties: z.number().int().nonnegative(),
        ruleCount: z.number().int().nonnegative(),
        declarationCount: z.number().int().nonnegative(),
        themedGroupCount: z.number().int().nonnegative(),
        themedElementWeight: z.number().int().nonnegative(),
        perToken: z.record(
          z.string(),
          z
            .object({
              groups: z.number().int().nonnegative(),
              elementWeight: z.number().int().nonnegative(),
            })
            .strict(),
        ),
      })
      .strict(),
    qa: z
      .object({ file: z.literal(THEME_QA_FILE), pass: z.boolean() })
      .strict()
      .optional(),
    provenance: z.literal("derived"),
  })
  .strict();
export type ThemeRunManifest = z.infer<typeof ThemeRunManifestSchema>;

// ---------------------------------------------------------------------------
// Theme QA report (§27–§29)
// ---------------------------------------------------------------------------

export const ThemeQaPageSchema = z
  .object({
    route: z.string(),
    width: z.number().int(),
    viewport: z.enum(["desktop", "mobile"]),
    domIdentical: z.boolean(),
    baseDocHeight: z.number(),
    themedDocHeight: z.number(),
    geometryComparedNodes: z.number().int().nonnegative(),
    geometryDeltaP95: z.number(),
    geometryDeltaMax: z.number(),
    newHorizontalOverflow: z.boolean(),
    jsErrors: z.number().int().nonnegative(),
    hydrationErrors: z.number().int().nonnegative(),
    newLowContrastTexts: z.number().int().nonnegative(),
    pass: z.boolean(),
    notes: z.array(z.string()),
  })
  .strict();
export type ThemeQaPage = z.infer<typeof ThemeQaPageSchema>;

export const PaintApplicationCheckSchema = z
  .object({
    paintGroupId: z.string(),
    token: z.string(),
    property: z.string(),
    route: z.string(),
    viewport: z.enum(["desktop", "mobile"]),
    surface: z.enum(["static", "dynamic-template", "pseudo"]),
    sampledElements: z.number().int().nonnegative(),
    matchedElements: z.number().int().nonnegative(),
    expected: z.string(),
    sampleActual: z.string(),
    applied: z.boolean(),
  })
  .strict();
export type PaintApplicationCheck = z.infer<typeof PaintApplicationCheckSchema>;

export const ThemeInteractionCheckSchema = z
  .object({
    route: z.string(),
    width: z.number().int(),
    patternId: z.string(),
    nodeId: z.string(),
    equivalent: z.boolean(),
    detail: z.string(),
  })
  .strict();
export type ThemeInteractionCheck = z.infer<typeof ThemeInteractionCheckSchema>;

export const ThemeQaReportSchema = z
  .object({
    schemaVersion: z.literal(THEME_SCHEMA_VERSION),
    runId: z.string(),
    templateId: z.string(),
    themeId: z.string(),
    /** What the themed render was compared AGAINST. */
    baseline: z.enum(["default", "content-injected"]),
    widths: z.array(z.number().int()),
    routes: z.array(z.string()),
    pages: z.array(ThemeQaPageSchema),
    paintChecks: z.array(PaintApplicationCheckSchema),
    interactionChecks: z.array(ThemeInteractionCheckSchema),
    /** Changed-paint coverage (§28): a no-op curated theme is NOT a success. */
    coverage: z
      .object({
        themedGroups: z.number().int().nonnegative(),
        verifiedGroups: z.number().int().nonnegative(),
        themedElementWeight: z.number().int().nonnegative(),
        preservedGroups: z.number().int().nonnegative(),
        reviewGroups: z.number().int().nonnegative(),
        perToken: z.record(
          z.string(),
          z
            .object({
              groups: z.number().int().nonnegative(),
              elementWeight: z.number().int().nonnegative(),
            })
            .strict(),
        ),
      })
      .strict(),
    screenshots: z.array(z.string()),
    pass: z.boolean(),
  })
  .strict();
export type ThemeQaReport = z.infer<typeof ThemeQaReportSchema>;

// ---------------------------------------------------------------------------
// Errors
// ---------------------------------------------------------------------------

/** Bad input (missing/mismatched artifact, unreadable file). */
export class ThemeInputError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ThemeInputError";
  }
}

/** A theme/adapter/override violates the contract. */
export class ThemeContractError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ThemeContractError";
  }
}
