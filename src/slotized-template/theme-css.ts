import { isSafeThemeValue } from "../theme/types.js";
import { normalizeColor } from "./theme-extract.js";
import type { CompiledThemeCss } from "./theme-types.js";
import type { ThemePack, ThemeTokenDefinition } from "./types.js";

/**
 * Theme pack → overlay CSS (Task 29 Phase D).
 *
 * The overlay is appended AFTER the copied generated stylesheet inside the
 * single `wr-slotized overrides` block, so it wins on cascade order
 * alone — no `!important`, no custom properties, no selector rewriting. Each
 * rule reuses the ORIGINAL selector verbatim (and its `@media` prelude when
 * the target came from a nested rule), which is why an override can never
 * reach an element the original rule did not already paint.
 *
 * Neutrality is a byte fact, not a claim: a pack whose values all equal the
 * extracted defaults compiles to the EMPTY string, the renderer appends
 * nothing, and the stylesheet stays byte-identical to the reconstruction's.
 */

/** A radius/spacing replacement may only be lengths, keywords and separators. */
const LENGTH_VALUE_RE = /^[0-9a-zA-Z.%\s/-]+$/;

function splitMediaChain(condition: string): string[] {
  return condition
    .split(/\s+(?=@)/)
    .map((part) => part.trim())
    .filter((part) => part !== "");
}

function validateValue(token: ThemeTokenDefinition, value: string): string | undefined {
  if (value.trim() === "") return `${token.key}: empty value`;
  if (!isSafeThemeValue(value)) return `${token.key}: value is not a safe paint value (${value})`;
  switch (token.kind) {
    case "color":
      return normalizeColor(value) === undefined
        ? `${token.key}: not a recognizable color (${value}) — use rgb()/rgba()/#hex`
        : undefined;
    case "font-family":
      return /[;{}]/.test(value) ? `${token.key}: illegal font-family value (${value})` : undefined;
    case "radius":
    case "spacing-candidate":
      return LENGTH_VALUE_RE.test(value) ? undefined : `${token.key}: not a length value (${value})`;
    case "shadow":
      return undefined;
    default:
      return `${token.key}: unknown token kind`;
  }
}

export function compileThemeCss(
  tokens: readonly ThemeTokenDefinition[],
  pack: Pick<ThemePack, "tokens">,
): CompiledThemeCss {
  const byId = new Map(tokens.map((t) => [t.id, t] as const));
  const errors: string[] = [];
  const warnings: string[] = [];
  const applied: string[] = [];

  for (const id of Object.keys(pack.tokens)) {
    if (!byId.has(id)) errors.push(`unknown token id in theme pack: ${id}`);
  }

  // media → selector → property → value. Later targets never collide: the
  // extractor claims each (media, selector, property) for exactly one token.
  const byMedia = new Map<string, Map<string, Map<string, string>>>();
  let declarations = 0;

  for (const token of tokens) {
    if (!Object.prototype.hasOwnProperty.call(pack.tokens, token.id)) continue;
    const next = pack.tokens[token.id]!;
    if (next === token.value) continue;
    const problem = validateValue(token, next);
    if (problem !== undefined) {
      errors.push(problem);
      continue;
    }
    if (token.risk === "locked") {
      errors.push(`${token.key}: token is locked and cannot be themed`);
      continue;
    }
    if (token.risk === "guarded") {
      warnings.push(`${token.key}: guarded token changed (${token.targets.length} target(s)) — ${token.kind}`);
    }
    if (token.targets.length === 0) {
      warnings.push(`${token.key}: token has no targets, nothing emitted`);
      continue;
    }
    for (const target of token.targets) {
      const media = target.mediaCondition ?? "";
      const bySelector = byMedia.get(media) ?? new Map<string, Map<string, string>>();
      byMedia.set(media, bySelector);
      const byProperty = bySelector.get(target.cssSelector) ?? new Map<string, string>();
      bySelector.set(target.cssSelector, byProperty);
      if (byProperty.has(target.property)) continue;
      byProperty.set(target.property, next);
      declarations++;
    }
    applied.push(token.id);
  }

  const lines: string[] = [];
  let rules = 0;
  for (const media of [...byMedia.keys()].sort()) {
    const bySelector = byMedia.get(media)!;
    const inner: string[] = [];
    for (const selector of [...bySelector.keys()].sort()) {
      const byProperty = bySelector.get(selector)!;
      const body = [...byProperty.keys()]
        .sort()
        .map((property) => `${property}:${byProperty.get(property)!}`)
        .join(";");
      inner.push(`${selector}{${body}}`);
      rules++;
    }
    if (media === "") {
      lines.push(...inner);
      continue;
    }
    const chain = splitMediaChain(media);
    let block = inner.join("");
    for (let i = chain.length - 1; i >= 0; i--) block = `${chain[i]}{${block}}`;
    lines.push(block);
  }

  return {
    css: lines.length === 0 ? "" : `${lines.join("\n")}\n`,
    applied: applied.sort(),
    declarations,
    rules,
    errors,
    warnings,
  };
}
