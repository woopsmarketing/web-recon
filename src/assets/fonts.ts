/**
 * Font inventory (Task 22 F) + license safety (Task 22 G).
 *
 * Stored artifacts carry NO @font-face rule anywhere (the Observer records
 * computed styles; @font-face lives in external source CSS that was never
 * downloaded). What IS stored: <link rel="preload" as="font"> URLs in
 * rendered.html, and the generated stylesheet's font-family stacks. The
 * @font-face declarations themselves can only be recovered by a bounded
 * OPT-IN live fetch of the source stylesheets referenced in rendered.html —
 * results are marked `live-fetched`, absence is marked `not-fetched`, and
 * nothing is invented.
 *
 * License rule: no guessing. There is no license-verification mechanism in
 * this repo, so EVERY font family is `license-needs-review` with
 * `selfHostApproved: false`. Fonts are never self-hosted by this task.
 */
import type { SafeFetchPolicy } from "./safe-fetch.js";
import { safeFetchAsset } from "./safe-fetch.js";
import type { FontFaceRule, FontInventory, AssetInventoryEntry } from "./types.js";
import {
  ASSET_SCHEMA_VERSION,
  FONT_INVENTORY_SCHEMA_NAME,
} from "./types.js";
import type { HeadEvidence } from "./inventory.js";

/** Families that are OS-provided; everything else leading a stack is a webfont candidate. */
const SYSTEM_FAMILIES = new Set([
  "arial",
  "helvetica",
  "helvetica neue",
  "times",
  "times new roman",
  "georgia",
  "courier",
  "courier new",
  "verdana",
  "tahoma",
  "trebuchet ms",
  "sf pro display",
  "sf pro text",
  "segoe ui",
  "roboto",
  "system-ui",
  "-apple-system",
  "blinkmacsystemfont",
  "sans-serif",
  "serif",
  "monospace",
  "cursive",
  "fantasy",
  "ui-sans-serif",
  "ui-serif",
  "ui-monospace",
]);

function normalizeFamily(raw: string): string {
  return raw.trim().replace(/^["']|["']$/g, "").toLowerCase();
}

export interface FamilyUsage {
  family: string;
  declarationCount: number;
  stacks: { stack: string; count: number }[];
  webfontUndefinedInClone: boolean;
}

/** Measure font-family usage over the generated stylesheet (the clone's style truth). */
export function analyzeFamilyUsage(generatedCss: string): FamilyUsage[] {
  const stackCounts = new Map<string, number>();
  for (const match of generatedCss.matchAll(/font-family:([^;}]+)[;}]/g)) {
    const stack = match[1].trim();
    stackCounts.set(stack, (stackCounts.get(stack) ?? 0) + 1);
  }
  const hasFontFace = /@font-face/.test(generatedCss);
  const byFamily = new Map<string, { count: number; stacks: Map<string, number> }>();
  for (const [stack, count] of stackCounts) {
    const lead = normalizeFamily(stack.split(",")[0] ?? "");
    if (lead === "") continue;
    const existing = byFamily.get(lead) ?? { count: 0, stacks: new Map() };
    existing.count += count;
    existing.stacks.set(stack, (existing.stacks.get(stack) ?? 0) + count);
    byFamily.set(lead, existing);
  }
  return [...byFamily.entries()]
    .map(([family, info]) => ({
      family,
      declarationCount: info.count,
      stacks: [...info.stacks.entries()]
        .map(([stack, count]) => ({ stack, count }))
        .sort((a, b) => b.count - a.count || a.stack.localeCompare(b.stack)),
      webfontUndefinedInClone: !SYSTEM_FAMILIES.has(family) && !hasFontFace,
    }))
    .sort((a, b) => b.declarationCount - a.declarationCount || a.family.localeCompare(b.family));
}

/** Parse @font-face blocks out of a CSS text, resolving relative src URLs. */
export function parseFontFaces(css: string, stylesheetUrl: string): FontFaceRule[] {
  const rules: FontFaceRule[] = [];
  for (const match of css.matchAll(/@font-face\s*\{([^}]*)\}/g)) {
    const body = match[1];
    const prop = (name: string): string | null => {
      const m = body.match(new RegExp(`(?:^|;)\\s*${name}\\s*:\\s*([^;]+)`, "i"));
      return m ? m[1].trim() : null;
    };
    const familyRaw = prop("font-family");
    if (!familyRaw) continue;
    const src: { url: string; format: string | null }[] = [];
    const srcRaw = prop("src") ?? "";
    for (const part of srcRaw.matchAll(/url\((['"]?)([^)'"]+)\1\)(?:\s*format\((['"]?)([^)'"]+)\3\))?/g)) {
      let resolved = part[2];
      try {
        resolved = new URL(part[2], stylesheetUrl).toString();
      } catch {
        /* keep raw */
      }
      src.push({ url: resolved, format: part[4] ?? null });
    }
    rules.push({
      family: familyRaw.replace(/^["']|["']$/g, ""),
      src,
      weight: prop("font-weight"),
      style: prop("font-style"),
      display: prop("font-display"),
      declaredIn: stylesheetUrl,
    });
  }
  return rules;
}

export interface FontCssFetchOptions {
  maxStylesheets: number; // bounded fetch
  policyBase: Omit<SafeFetchPolicy, "allowedHosts" | "expectedKind">;
}

export async function buildFontInventory(options: {
  head: HeadEvidence;
  generatedCss: string;
  liveFontCss: FontCssFetchOptions | null;
  fontEntries: AssetInventoryEntry[]; // inventory entries with kind font
}): Promise<FontInventory> {
  const familyUsage = analyzeFamilyUsage(options.generatedCss);

  const fontUrls = options.head.fontPreloads.map((preload) => ({
    url: preload.url,
    host: new URL(preload.url).host,
    typeHint: preload.typeHint,
    pageIds: preload.pageIds,
    evidence: "rendered-html-font-preload" as const,
  }));

  let fontFaceRules: FontFaceRule[] = [];
  const fetchedStylesheets: { url: string; httpStatus: number; fontFaceCount: number }[] = [];
  let fontFaceProvenance: "live-fetched" | "not-fetched" = "not-fetched";
  let fontFaceFetchedAt: string | null = null;

  if (options.liveFontCss) {
    fontFaceProvenance = "live-fetched";
    fontFaceFetchedAt = new Date().toISOString();
    // Bounded: preload-as-style stylesheets first (source render order), cap N.
    const candidates = [
      ...options.head.stylesheetUrls.filter((s) => s.preloaded),
      ...options.head.stylesheetUrls.filter((s) => !s.preloaded),
    ]
      .map((s) => s.url)
      .filter((url, index, all) => all.indexOf(url) === index)
      .slice(0, options.liveFontCss.maxStylesheets);
    const allowedHosts = new Set(candidates.map((url) => new URL(url).hostname));
    for (const url of candidates) {
      const result = await safeFetchAsset(url, {
        ...options.liveFontCss.policyBase,
        allowedHosts,
        expectedKind: "css",
      });
      const css = result.body ? result.body.toString("utf8") : "";
      const rules = result.status === "fetched" ? parseFontFaces(css, url) : [];
      fetchedStylesheets.push({
        url,
        httpStatus: result.httpStatus ?? 0,
        fontFaceCount: rules.length,
      });
      fontFaceRules.push(...rules);
    }
    // Dedupe identical rules (same family + src + weight + style + display).
    const seen = new Set<string>();
    fontFaceRules = fontFaceRules.filter((rule) => {
      const key = JSON.stringify([rule.family, rule.src, rule.weight, rule.style, rule.display]);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }

  const webfontFamilies = new Set<string>([
    ...fontFaceRules.map((rule) => normalizeFamily(rule.family)),
    ...familyUsage.filter((usage) => usage.webfontUndefinedInClone).map((usage) => usage.family),
  ]);

  const license = [...webfontFamilies].sort().map((family) => ({
    family,
    status: "license-needs-review" as const,
    reason:
      "no verifiable open-license evidence in observed artifacts; source webfonts are presumed proprietary until an operator verifies otherwise",
    selfHostApproved: false,
  }));

  const fallbackPlan = familyUsage
    .filter((usage) => webfontFamilies.has(usage.family))
    .map((usage) => {
      const topStack = usage.stacks[0]?.stack ?? usage.family;
      const fallback = topStack
        .split(",")
        .slice(1)
        .map((f) => f.trim())
        .join(", ");
      return {
        family: usage.family,
        fallbackStack: fallback || "sans-serif",
        basis: `observed computed font-family stack (${usage.declarationCount} declarations in generated stylesheet)`,
      };
    });

  return {
    schemaVersion: ASSET_SCHEMA_VERSION,
    schemaName: FONT_INVENTORY_SCHEMA_NAME,
    fontUrls,
    fontFaceRules,
    fontFaceProvenance,
    fontFaceFetchedAt,
    fetchedStylesheets,
    familyUsage,
    license,
    fallbackPlan,
  };
}
