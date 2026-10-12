import { readFile } from "node:fs/promises";
import path from "node:path";
import type { DesignRegistry, VariantEntry } from "../../templates/interior-02/v1/design/contract";
import type { DesignIssue } from "./errors";
import { buildFontSet, measuredPin, pinOf } from "./fonts";
import { listPresets, type SitePreset } from "./preset";
import { templateDesign } from "./templates";

/**
 * Checks of a Template's design system against its own files — static: nothing is rendered.
 *
 *   checkRegistry        every registered variant has its files; a placeholder is marked as one and
 *                        a `ready` variant is not; every variant stylesheet is imported by
 *                        design/styles.ts and keeps the CSS rules (lintVariantCss); the static token
 *                        sheet is what the compiler writes
 *   presetPlaceholders   the variants a preset names that are still placeholders
 *   releaseGate          everything that must hold before a release is cut: checkRegistry, every
 *                        preset valid, NO preset naming a placeholder, the font pins reproducible
 *                        from this checkout. `pnpm design:check <templateId> --release` exits 1 on
 *                        any finding — the step that cuts a design release runs it first.
 */
export const PLACEHOLDER_MARK = "@ds-placeholder";
export const INNER_SHEET = "styles/design/inner.css";
export const TOKENS_SHEET = "styles/design/tokens.css";
export const INNER_SCOPE = 'html[data-design]:not([data-design="classic"])';

export interface RegisteredVariant {
  section: string;
  variant: string;
  status: VariantEntry["status"];
  module: string | null;
  data: string | null;
  css: string | null;
}

export function registeredVariants(registry: DesignRegistry): RegisteredVariant[] {
  return Object.entries(registry.sections).flatMap(([section, entry]) =>
    Object.entries(entry.variants).map(([variant, v]) => ({ section, variant, status: v.status, module: v.module, data: v.data, css: v.css })),
  );
}

/** ".ds-hero-photo" for styles/design/hero-photo.css. */
export function variantNamespace(cssPath: string): string {
  return `.ds-${path.posix.basename(cssPath, ".css")}`;
}

/** The selectors of a stylesheet's style rules (at-rule preludes skipped, their inner rules kept). */
function selectorsOf(css: string): string[] {
  const text = css.replace(/\/\*[\s\S]*?\*\//g, "");
  const out: string[] = [];
  let prelude = "";
  for (const ch of text) {
    if (ch === "{") {
      const p = prelude.trim();
      if (p !== "" && !p.startsWith("@")) out.push(p);
      prelude = "";
    } else if (ch === "}" || ch === ";") prelude = "";
    else prelude += ch;
  }
  return out;
}

/**
 * The CSS rules of a variant stylesheet (platform/design/README.md "CSS rules"):
 *   - every selector is inside the sheet's namespace (`scope` for the inner-pages sheet)
 *   - no colour literal: colour comes from the --ds-* roles
 *   - font-size and font-family only through var(--ds-…)
 *   - no @import, no url() (a variant has no asset of its own)
 */
export function lintVariantCss(cssPath: string, css: string, scope?: string): string[] {
  const problems: string[] = [];
  const text = css.replace(/\/\*[\s\S]*?\*\//g, "");
  const namespace = variantNamespace(cssPath);
  for (const selectorList of selectorsOf(css)) {
    if (/^(from|to|\d+(\.\d+)?%)(\s*,\s*(from|to|\d+(\.\d+)?%))*$/.test(selectorList)) continue; // keyframe steps
    for (const selector of selectorList.split(",").map((s) => s.trim())) {
      if (scope !== undefined ? !selector.startsWith(scope) : !new RegExp(`${namespace.replace(/[.\-]/g, "\\$&")}(?![a-z0-9])`).test(selector)) {
        problems.push(`selector "${selector}" is outside ${scope ?? namespace}`);
      }
    }
  }
  if (/@import/i.test(text)) problems.push("@import");
  if (/url\s*\(/i.test(text)) problems.push("url()");
  for (const m of text.matchAll(/(^|[\s:,(])(#[0-9a-f]{3,8}\b|rgba?\(|hsla?\()/gi)) problems.push(`colour literal "${m[2]}" (use a --ds-* colour role)`);
  for (const m of text.matchAll(/font-(size|family)\s*:\s*([^;}]+)/gi)) {
    const value = m[2]!.trim();
    if (!/^var\(--ds-[a-z0-9-]+\)$/.test(value) && value !== "inherit") problems.push(`font-${m[1]}: ${value} (use var(--ds-…))`);
  }
  return [...new Set(problems)];
}

const issue = (p: string, message: string): DesignIssue => ({ code: "design_invalid", path: p, message });

export async function checkRegistry(opts: { repoRoot: string; templateId: string }): Promise<DesignIssue[]> {
  const design = templateDesign(opts.templateId);
  const root = path.join(opts.repoRoot, design.dir);
  const read = (rel: string) => readFile(path.join(root, rel), "utf8").catch(() => undefined);
  const issues: DesignIssue[] = [];
  const styles = (await read("design/styles.ts")) ?? "";

  for (const v of registeredVariants(design.registry)) {
    const where = `${v.section}.${v.variant}`;
    if (v.status === "classic") {
      if (v.module !== null || v.css !== null || v.data !== null) issues.push(issue(where, "a classic variant has no file of its own"));
      continue;
    }
    for (const [kind, rel] of [["module", v.module], ["data module", v.data], ["stylesheet", v.css]] as const) {
      if (rel === null) {
        if (kind !== "data module") issues.push(issue(where, `has no ${kind}`));
        continue;
      }
      const text = await read(rel);
      if (text === undefined) {
        issues.push(issue(where, `${kind} ${rel} does not exist`));
        continue;
      }
      if (kind === "stylesheet") {
        if (!styles.includes(`"../${rel}"`)) issues.push(issue(where, `${rel} is not imported by design/styles.ts`));
        for (const p of lintVariantCss(rel, text)) issues.push(issue(where, `${rel}: ${p}`));
        if (v.status === "ready" && selectorsOf(text).length === 0) issues.push(issue(where, `is "ready" but ${rel} has no rule`));
        continue;
      }
      const marked = text.includes(PLACEHOLDER_MARK);
      if (v.status === "placeholder" && !marked) issues.push(issue(where, `${rel} is implemented (no ${PLACEHOLDER_MARK} mark) but its status is still "placeholder"`));
      if (v.status === "ready" && marked) issues.push(issue(where, `is "ready" but ${rel} still carries the ${PLACEHOLDER_MARK} mark`));
      const exported = kind === "module" ? "Section" : "data";
      if (!new RegExp(`export\\s+(?:async\\s+)?(?:function|const)\\s+${exported}\\b|export\\s*\\{[^}]*\\bas\\s+${exported}\\b[^}]*\\}|export\\s*\\{[^}]*\\b${exported}\\b[^}]*\\}`).test(text)) {
        issues.push(issue(where, `${rel} does not export \`${exported}\``));
      }
    }
  }

  const inner = await read(INNER_SHEET);
  if (inner === undefined) issues.push(issue("inner", `${INNER_SHEET} does not exist`));
  else for (const p of lintVariantCss(INNER_SHEET, inner, INNER_SCOPE)) issues.push(issue("inner", `${INNER_SHEET}: ${p}`));

  const tokens = await read(TOKENS_SHEET);
  const expected = design.defaultTokensCss(design.classicTheme);
  if (tokens === undefined) issues.push(issue("tokens", `${TOKENS_SHEET} does not exist`));
  else if (tokens.replace(/^\/\*[\s\S]*?\*\/\n/, "") !== expected) issues.push(issue("tokens", `${TOKENS_SHEET} is not what the compiler writes for the classic theme (pnpm design:check ${opts.templateId} --write-tokens)`));
  return issues;
}

/** The (path, section, variant) of every placeholder a preset's design names. */
export function presetPlaceholders(preset: Pick<SitePreset, "design">, registry: DesignRegistry): { path: string; section: string; variant: string }[] {
  const named: { path: string; section: string; variant: string }[] = [
    { path: "design.chrome.header", section: "header", variant: preset.design.chrome.header },
    { path: "design.chrome.footer", section: "footer", variant: preset.design.chrome.footer },
    { path: "design.chrome.mobileBar", section: "mobileBar", variant: preset.design.chrome.mobileBar },
    ...preset.design.home.map((entry, i) => ({ path: `design.home.${i}.variant`, section: entry.section, variant: entry.variant })),
    { path: "design.pages.listing", section: "listing", variant: preset.design.pages.listing },
    { path: "design.pages.detail", section: "detail", variant: preset.design.pages.detail },
  ];
  return named.filter((n) => registry.sections[n.section]?.variants[n.variant]?.status === "placeholder");
}

export interface ReleaseGateResult {
  pass: boolean;
  issues: DesignIssue[];
  presets: { id: string; version: number; placeholders: string[] }[];
}

export async function releaseGate(opts: { repoRoot: string; templateId: string }): Promise<ReleaseGateResult> {
  const design = templateDesign(opts.templateId);
  const issues = await checkRegistry(opts);
  const presets: ReleaseGateResult["presets"] = [];
  for (const preset of await listPresets(opts)) {
    const placeholders = presetPlaceholders(preset, design.registry);
    presets.push({ id: preset.id, version: preset.version, placeholders: placeholders.map((p) => `${p.section}.${p.variant}`) });
    for (const p of placeholders) issues.push({ code: "design_placeholder", path: `${preset.id}: ${p.path}`, message: `names ${p.section}.${p.variant}, which is still a placeholder` });
  }
  for (const [id, pin] of Object.entries(design.fontPins.sets)) {
    const now = pinOf(await buildFontSet(opts.repoRoot, id, pin));
    if (JSON.stringify(now) !== JSON.stringify(measuredPin(pin))) {
      issues.push({ code: "design_fonts_invalid", path: `fonts.${id}`, message: "the font packages of this checkout do not produce the pinned set (pnpm design:fonts --write, after reviewing the bump)" });
    }
  }
  return { pass: issues.length === 0, issues, presets };
}
