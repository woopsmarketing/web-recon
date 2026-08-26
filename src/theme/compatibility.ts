import { contrastRatio, parseColor, relativeLuminance } from "./stylesheet.js";
import {
  CompatibilityReportSchema,
  THEME_SCHEMA_VERSION,
  isThemeToken,
  tokenKind,
  type CompatibilityCheck,
  type CompatibilityReport,
  type SiteThemeAdapter,
  type ThemeFile,
  type ThemeTokenId,
} from "./types.js";

/**
 * Deterministic pre-application compatibility check (§21–§23).
 *
 * This is a GATE, never a ranking: the output is one of three verdicts plus
 * the named checks that produced it. There is no score, no recommendation
 * engine, and no industry metadata anywhere in the decision.
 */

/** Text/背景 pairs that must never become unreadable (§22). */
const CONTRAST_PAIRS: [ThemeTokenId, ThemeTokenId, string][] = [
  ["color.text.primary", "color.canvas", "primary text on canvas"],
  ["color.text.primary", "color.surface.primary", "primary text on primary surface"],
  ["color.text.secondary", "color.canvas", "secondary text on canvas"],
  ["color.text.secondary", "color.surface.secondary", "secondary text on secondary surface"],
  ["color.action.primaryText", "color.action.primary", "action text on action surface"],
  ["color.link", "color.canvas", "link text on canvas"],
];

/** Below this ratio text visibly disappears — hard FAIL (§22 예: white on near-white). */
const CONTRAST_FAIL_RATIO = 2.0;
/** Below this ratio readability is doubtful — warning. */
const CONTRAST_WARN_RATIO = 4.5;

/** §23 dark gates: coverage the adapter must prove before a dark theme may apply. */
const DARK_MIN_TEXT_BOUND_FRACTION = 0.6;
const DARK_MIN_BACKGROUND_BOUND_FRACTION = 0.5;
const DARK_MAX_UNBOUND_DARK_TEXT_FRACTION = 0.1;

export function checkThemeCompatibility(
  adapter: SiteThemeAdapter,
  theme: ThemeFile,
): CompatibilityReport {
  const checks: CompatibilityCheck[] = [];
  const push = (id: string, level: "ok" | "warning" | "error", detail: string): void => {
    checks.push({ id, level, detail });
  };

  // --- contract & token validity -------------------------------------------
  if (theme.contract !== adapter.contract) {
    push("contract-mismatch", "error", `theme ${theme.contract} vs adapter ${adapter.contract}`);
  } else {
    push("contract", "ok", adapter.contract);
  }
  for (const token of Object.keys(theme.tokens)) {
    if (!isThemeToken(token)) push("unknown-token", "error", `theme token "${token}" is not in the contract`);
  }

  // --- required tokens (§21 missing required token) -------------------------
  for (const required of theme.metadata.requires ?? []) {
    if (adapter.tokens[required] === undefined) {
      push("missing-required-token", "error", `theme requires "${required}" but the adapter binds nothing to it`);
    }
  }

  // --- typography boundary (§25) --------------------------------------------
  const typography = Object.keys(theme.tokens).filter(
    (token) => isThemeToken(token) && tokenKind(token) === "typography",
  );
  if (typography.length > 0) {
    push(
      "typography-not-applied",
      "warning",
      `${typography.join(", ")} accepted by the contract but automatic application is OFF in this Task`,
    );
  }

  // --- token coverage (§21 too-low token coverage) --------------------------
  const boundTokens = Object.keys(adapter.tokens);
  const provided = boundTokens.filter((token) => theme.tokens[token] !== undefined);
  if (boundTokens.length > 0 && provided.length === 0) {
    push("no-token-overlap", "error", "the theme provides none of the tokens this adapter binds");
  } else if (provided.length < boundTokens.length) {
    const missing = boundTokens.filter((token) => theme.tokens[token] === undefined).sort();
    push(
      "partial-token-coverage",
      provided.length / boundTokens.length < 0.5 ? "warning" : "ok",
      `theme provides ${provided.length}/${boundTokens.length} bound tokens; unprovided stay original: ${missing.join(", ")}`,
    );
  } else {
    push("token-coverage", "ok", `theme provides all ${boundTokens.length} bound tokens`);
  }

  // --- contrast safety (§22) -------------------------------------------------
  const themedOrOriginal = (token: ThemeTokenId): string | undefined =>
    theme.tokens[token] ?? adapter.tokens[token]?.originalValue;
  for (const [foreground, background, label] of CONTRAST_PAIRS) {
    // Only meaningful when the pair actually exists on this site AND at least
    // one side is being changed by this theme.
    if (adapter.tokens[foreground] === undefined || adapter.tokens[background] === undefined) continue;
    if (theme.tokens[foreground] === undefined && theme.tokens[background] === undefined) continue;
    const fgValue = themedOrOriginal(foreground);
    const bgValue = themedOrOriginal(background);
    if (fgValue === undefined || bgValue === undefined) continue;
    const fg = parseColor(fgValue);
    const bg = parseColor(bgValue);
    if (fg === undefined || bg === undefined) {
      push("contrast-not-computable", "warning", `${label}: cannot parse "${fgValue}" vs "${bgValue}"`);
      continue;
    }
    const ratio = contrastRatio(fg, bg);
    if (ratio < CONTRAST_FAIL_RATIO) {
      push("contrast-failure", "error", `${label}: ratio ${ratio.toFixed(2)} < ${CONTRAST_FAIL_RATIO} (${fgValue} on ${bgValue})`);
    } else if (ratio < CONTRAST_WARN_RATIO) {
      push("contrast-low", "warning", `${label}: ratio ${ratio.toFixed(2)} < ${CONTRAST_WARN_RATIO}`);
    } else {
      push("contrast", "ok", `${label}: ratio ${ratio.toFixed(2)}`);
    }
  }

  // --- light/dark inversion & dark coverage gates (§23) ----------------------
  const canvasValue = theme.tokens["color.canvas"];
  const canvasParsed = canvasValue !== undefined ? parseColor(canvasValue) : undefined;
  const themeIsDarkCanvas = canvasParsed !== undefined && relativeLuminance(canvasParsed) < 0.35;
  if (theme.metadata.mode === "dark" || themeIsDarkCanvas) {
    const coverage = adapter.coverage;
    const textFraction =
      coverage.textColorElementWeight === 0
        ? 0
        : coverage.textColorBoundElementWeight / coverage.textColorElementWeight;
    const backgroundFraction =
      coverage.backgroundElementWeight === 0
        ? 0
        : coverage.backgroundBoundElementWeight / coverage.backgroundElementWeight;
    const unboundDarkFraction =
      coverage.textColorElementWeight === 0
        ? 0
        : coverage.unboundDarkTextElementWeight / coverage.textColorElementWeight;
    if (textFraction < DARK_MIN_TEXT_BOUND_FRACTION) {
      push(
        "dark-inversion-risk",
        "error",
        `dark theme with text-color coverage ${(textFraction * 100).toFixed(1)}% < ${DARK_MIN_TEXT_BOUND_FRACTION * 100}% — preserved text would keep light-mode colors`,
      );
    }
    if (backgroundFraction < DARK_MIN_BACKGROUND_BOUND_FRACTION) {
      push(
        "dark-inversion-risk",
        "error",
        `dark theme with background coverage ${(backgroundFraction * 100).toFixed(1)}% < ${DARK_MIN_BACKGROUND_BOUND_FRACTION * 100}%`,
      );
    }
    if (unboundDarkFraction > DARK_MAX_UNBOUND_DARK_TEXT_FRACTION) {
      push(
        "dark-inversion-risk",
        "error",
        `preserved DARK text covers ${(unboundDarkFraction * 100).toFixed(1)}% of text paint (> ${DARK_MAX_UNBOUND_DARK_TEXT_FRACTION * 100}%) — it would sit on the new dark background (§23)`,
      );
    }
    if (
      textFraction >= DARK_MIN_TEXT_BOUND_FRACTION &&
      backgroundFraction >= DARK_MIN_BACKGROUND_BOUND_FRACTION &&
      unboundDarkFraction <= DARK_MAX_UNBOUND_DARK_TEXT_FRACTION
    ) {
      push("dark-coverage", "ok", `text ${(textFraction * 100).toFixed(1)}% / background ${(backgroundFraction * 100).toFixed(1)}% bound`);
    }
  }

  // --- preserved gradient / asset conflicts (§13/§14) ------------------------
  const gradientGroups = adapter.paintGroups.filter((group) =>
    group.reasons.includes("background-gradient-above-color"),
  );
  const paletteChanged = Object.keys(theme.tokens).some(
    (token) => isThemeToken(token) && tokenKind(token) === "color" &&
      adapter.tokens[token] !== undefined && theme.tokens[token] !== adapter.tokens[token]!.originalValue,
  );
  if (paletteChanged && gradientGroups.length > 0) {
    push(
      "preserved-gradient-conflict",
      "warning",
      `${gradientGroups.length} gradient-covered paint group(s) keep their original accent colors and may clash with the new palette`,
    );
  }
  if (paletteChanged) {
    push(
      "asset-color-mismatch-risk",
      "warning",
      "raster images / videos / inline-SVG internal paint keep original brand colors (never auto-recolored)",
    );
  }

  const hasError = checks.some((check) => check.level === "error");
  const hasWarning = checks.some((check) => check.level === "warning");
  return CompatibilityReportSchema.parse({
    schemaVersion: THEME_SCHEMA_VERSION,
    themeId: theme.themeId,
    templateId: adapter.templateId,
    result: hasError ? "incompatible" : hasWarning ? "compatible-with-warnings" : "compatible",
    checks,
    provenance: "derived",
  });
}
