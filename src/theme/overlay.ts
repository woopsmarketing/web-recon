import {
  ThemeContractError,
  isSafeThemeValue,
  isThemeToken,
  isThemeableProperty,
  tokenKind,
  type PaintGroup,
  type SiteThemeAdapter,
  type ThemeFile,
} from "./types.js";

/**
 * Theme Overlay CSS generation (§15/§16).
 *
 * The overlay is APPENDED AFTER the template app's own stylesheet at the
 * serve boundary, so an overlay rule reuses each paint group's selector
 * VERBATIM and wins by cascade order at identical specificity — no template
 * byte changes, no !important, no new class names forced onto the site (§8).
 *
 * Structure:
 *
 *   :root { --wr-theme-color-canvas: …; … }        the theme's token values
 *   .wr-st001234 { background-color: var(--wr-theme-color-canvas) }
 *   [data-wr-page="p000001"] … ::after { background-color: var(…) }
 *   .wr-st000163 { border-top: 1px solid var(--wr-theme-color-border-default) }
 *
 * Border shorthands substitute ONLY the color component: the observed
 * `width style` prefix is copied byte-for-byte, so the layout half of the
 * shorthand structurally cannot change. Every emitted property must be on
 * the closed THEMEABLE_PROPERTIES allowlist — a layout property reaching
 * this generator is a thrown error, not a warning (§9, gate J).
 */

const SELECTORS_PER_RULE = 25;

export interface ThemeOverlay {
  css: string;
  customProperties: number;
  ruleCount: number;
  declarationCount: number;
  themedGroupCount: number;
  themedElementWeight: number;
  perToken: Record<string, { groups: number; elementWeight: number }>;
  /** Groups the theme could have themed but did not provide a token for. */
  unthemedTokenGroups: string[];
}

export function themeVariableName(token: string): string {
  return `--wr-theme-${token.replace(/\./g, "-")}`;
}

function declarationFor(group: PaintGroup, variable: string): { property: string; value: string } {
  if (!isThemeableProperty(group.property)) {
    throw new ThemeContractError(
      `paint group ${group.paintGroupId} carries non-themeable property "${group.property}" — ` +
        `the closed paint allowlist forbids emitting it`,
    );
  }
  if (group.preservedPrefix !== undefined) {
    return { property: group.property, value: `${group.preservedPrefix} var(${variable})` };
  }
  return { property: group.property, value: `var(${variable})` };
}

export function generateThemeOverlay(adapter: SiteThemeAdapter, theme: ThemeFile): ThemeOverlay {
  if (theme.contract !== adapter.contract) {
    throw new ThemeContractError(
      `theme contract ${theme.contract} does not match adapter contract ${adapter.contract}`,
    );
  }
  for (const [token, value] of Object.entries(theme.tokens)) {
    if (!isThemeToken(token)) throw new ThemeContractError(`theme carries unknown token "${token}"`);
    if (!isSafeThemeValue(value)) throw new ThemeContractError(`theme token "${token}" has an unsafe value`);
  }

  const themedGroups: { group: PaintGroup; token: string }[] = [];
  const unthemedTokenGroups: string[] = [];
  for (const group of adapter.paintGroups) {
    if (group.status !== "themeable" || group.semanticToken === null) continue;
    const token = group.semanticToken;
    // Typography is contract-representable but never auto-applied (§25).
    if (tokenKind(token as never) === "typography") continue;
    if (theme.tokens[token] === undefined) {
      unthemedTokenGroups.push(group.paintGroupId);
      continue;
    }
    themedGroups.push({ group, token });
  }

  const usedTokens = [...new Set(themedGroups.map((entry) => entry.token))].sort();
  const parts: string[] = [
    "/* web-recon theme overlay — appended after the exact stylesheet; additive only. */",
    `/* theme: ${theme.themeId} · adapter: ${adapter.templateId} */`,
  ];
  if (usedTokens.length > 0) {
    const vars = usedTokens
      .map((token) => `${themeVariableName(token)}:${theme.tokens[token]}`)
      .join(";");
    parts.push(`:root{${vars}}`);
  }

  let ruleCount = 0;
  let declarationCount = 0;
  let themedElementWeight = 0;
  const perToken: Record<string, { groups: number; elementWeight: number }> = {};
  for (const { group, token } of themedGroups) {
    const variable = themeVariableName(token);
    const declaration = declarationFor(group, variable);
    for (let i = 0; i < group.selectors.length; i += SELECTORS_PER_RULE) {
      const chunk = group.selectors.slice(i, i + SELECTORS_PER_RULE);
      parts.push(`${chunk.join(",")}{${declaration.property}:${declaration.value}}`);
      ruleCount++;
      declarationCount += chunk.length;
    }
    const weight = group.staticElementCount + group.dynamicElementCount;
    themedElementWeight += weight;
    const entry = perToken[token] ?? { groups: 0, elementWeight: 0 };
    entry.groups++;
    entry.elementWeight += weight;
    perToken[token] = entry;
  }

  return {
    css: parts.join("\n") + "\n",
    customProperties: usedTokens.length,
    ruleCount,
    declarationCount,
    themedGroupCount: themedGroups.length,
    themedElementWeight,
    perToken,
    unthemedTokenGroups: unthemedTokenGroups.sort(),
  };
}
