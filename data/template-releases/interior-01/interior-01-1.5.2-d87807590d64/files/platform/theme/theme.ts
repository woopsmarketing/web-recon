import { z } from "zod";

/**
 * Theme for the Template platform = theme-contract-v1 token vocabulary + value
 * safety rule, EXTRACTED as a pure copy from src/theme/types.ts (Task 20). The
 * legacy module is not imported: its barrel reaches playwright and the legacy
 * recon-template pipeline. Token ids and the value rule are kept identical so
 * existing curated library themes stay valid inputs.
 *
 * Tokens carry paint/typography VALUES only — never selectors, layout or assets.
 */

export const THEME_CONTRACT_ID = "theme-contract-v1";

export const THEME_TOKENS = [
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
  "decoration.radius.small",
  "decoration.radius.medium",
  "decoration.radius.large",
  "decoration.radius.pill",
  "decoration.shadow.small",
  "decoration.shadow.medium",
  "decoration.shadow.large",
  "typography.body",
  "typography.heading",
] as const;
export type ThemeTokenId = (typeof THEME_TOKENS)[number];

export function isThemeToken(id: string): id is ThemeTokenId {
  return (THEME_TOKENS as readonly string[]).includes(id);
}

/** Identical to src/theme/types.ts isSafeThemeValue (theme-contract-v1). */
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

/**
 * Per-kind value GRAMMAR (platform addition, stricter than contract-v1): a token
 * value can only be a colour, a length, a shadow list or a font-family list.
 * No strings except quoted font names, no url()/image-set()/var()/comments, so
 * a theme can never fetch anything or break out of its declaration.
 */
const NUM = String.raw`-?\d+(?:\.\d+)?`;
const COLOR = String.raw`(?:#[0-9a-f]{3,8}|(?:rgb|rgba|hsl|hsla)\(\s*[\d.\s,%/]+(?:deg)?[\d.\s,%/]*\)|[a-z]{3,20})`;
const COLOR_RE = new RegExp(`^${COLOR}$`, "i");
const LENGTH_RE = new RegExp(`^(?:0|${NUM}(?:px|rem|em|%))$`, "i");
const SHADOW_PART = String.raw`(?:inset|${COLOR}|${NUM}(?:px|rem|em)?)`;
const SHADOW_RE = new RegExp(String.raw`^(?:none|${SHADOW_PART}(?:\s+${SHADOW_PART})*(?:\s*,\s*${SHADOW_PART}(?:\s+${SHADOW_PART})*)*)$`, "i");
const FAMILY = String.raw`(?:"[\p{L}\p{N} \-]{1,60}"|'[\p{L}\p{N} \-]{1,60}'|[\p{L}][\p{L}\p{N}\-]*(?: [\p{L}][\p{L}\p{N}\-]*)*)`;
const FONT_RE = new RegExp(String.raw`^${FAMILY}(?:\s*,\s*${FAMILY})*$`, "u");

export function isValidTokenValue(token: ThemeTokenId, value: string): boolean {
  if (!isSafeThemeValue(value) || value.includes("/*")) return false;
  if (token.startsWith("color.")) return COLOR_RE.test(value) && !/^(url|image|var|expression)$/i.test(value);
  if (token.startsWith("decoration.radius.")) return LENGTH_RE.test(value);
  if (token.startsWith("decoration.shadow.")) return SHADOW_RE.test(value);
  if (token.startsWith("typography.")) return FONT_RE.test(value);
  return false;
}

const TokenMapSchema = z.record(z.string(), z.string()).superRefine((tokens, ctx) => {
  for (const [key, value] of Object.entries(tokens)) {
    if (!isThemeToken(key)) ctx.addIssue({ code: "custom", message: `unknown theme token "${key}"` });
    else if (!isValidTokenValue(key, value)) ctx.addIssue({ code: "custom", message: `unsafe or invalid value for token "${key}"` });
  }
});

/** A Template's default theme (theme-contract-v1 file shape, reduced). */
export const TemplateThemeSchema = z
  .object({
    schemaVersion: z.literal(1),
    contract: z.literal(THEME_CONTRACT_ID),
    themeId: z.string().regex(/^[a-z0-9][a-z0-9.-]{1,63}$/),
    name: z.string().min(1).max(120),
    tokens: TokenMapSchema,
  })
  .strict();
export type TemplateTheme = z.infer<typeof TemplateThemeSchema>;

/** A site's sparse theme overrides. */
export const SiteThemeDocSchema = z
  .object({
    schemaVersion: z.literal(1),
    contract: z.literal(THEME_CONTRACT_ID),
    tokens: TokenMapSchema,
  })
  .strict();
export type SiteThemeDoc = z.infer<typeof SiteThemeDocSchema>;

export type EffectiveTheme = Readonly<Record<ThemeTokenId, string>>;

export class ThemeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ThemeError";
  }
}

/**
 * Template default ⊕ site overrides, restricted to the tokens the Template
 * declares it consumes. A site may not set a token the Template does not read.
 */
export function resolveEffectiveTheme(
  consumes: readonly ThemeTokenId[],
  templateDefault: unknown,
  siteDoc: unknown | undefined,
): Partial<EffectiveTheme> {
  const def = TemplateThemeSchema.safeParse(templateDefault);
  if (!def.success) throw new ThemeError(`template default theme invalid: ${def.error.message}`);
  let overrides: Record<string, string> = {};
  if (siteDoc !== undefined) {
    const site = SiteThemeDocSchema.safeParse(siteDoc);
    if (!site.success) throw new ThemeError(`site theme invalid: ${site.error.issues.map((i) => i.message).join("; ")}`);
    overrides = site.data.tokens;
  }
  const out: Partial<Record<ThemeTokenId, string>> = {};
  for (const key of Object.keys(overrides)) {
    if (!(consumes as readonly string[]).includes(key)) {
      throw new ThemeError(`site theme sets token "${key}" that the template does not consume`);
    }
  }
  for (const token of consumes) {
    const value = overrides[token] ?? def.data.tokens[token];
    if (value === undefined) throw new ThemeError(`template default theme lacks consumed token "${token}"`);
    out[token] = value;
  }
  return out;
}

/** token id → CSS custom property name, e.g. color.text.primary → --color-text-primary */
export function tokenVar(token: ThemeTokenId): string {
  return `--${token.replace(/\./g, "-").replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`)}`;
}

/** Emit the effective theme as one :root rule. Values were validated as safe. */
export function themeToCss(theme: Partial<EffectiveTheme>): string {
  const decls = (Object.keys(theme) as ThemeTokenId[])
    .sort()
    .map((token) => {
      const value = theme[token]!;
      if (!isValidTokenValue(token, value)) throw new ThemeError(`unsafe theme value for ${token}`);
      return `${tokenVar(token)}:${value}`;
    });
  return `:root{${decls.join(";")}}`;
}
