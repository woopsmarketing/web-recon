import type { RuntimeElementNode, RuntimeNode, RuntimePage } from "../reconstruction/index.js";
import { colorChroma, isTransparentColor, parseBorderShorthand, parseColor } from "../theme/stylesheet.js";
import { declarationValue, forEachRule } from "./css.js";
import { tokenIdOf } from "./ids.js";
import {
  SLOTIZED_THEME_REPORT_SCHEMA,
  THEME_EXTRACT_ENGINE,
  TOKEN_CAPS,
  TOKEN_THRESHOLDS,
  type ThemeExtractionReport,
  type ThemeRole,
  type ThemeTokenEvidence,
} from "./theme-types.js";
import { SLOTIZED_TEMPLATE_SCHEMA_VERSION, type ThemeTokenDefinition } from "./types.js";

type ThemeTokenKind = ThemeTokenDefinition["kind"];

/**
 * Theme token extraction (Task 29 Phase D).
 *
 * Evidence, not taste. The reconstructed app has exactly one style channel —
 * `public/wr/generated-styles.css`, one `.wr-stNNNNNN` class per distinct
 * computed style — so a token is just a VALUE that many of those rules repeat,
 * weighted by how many DOM nodes actually carry the classes that paint it.
 * Nothing is inferred from names, and no palette is invented: every token's
 * default IS the value the accepted reconstruction already paints, which is
 * what lets the default theme pack compile to zero bytes of CSS.
 *
 * Only paint properties are ever tokenized (color / font-family / radius /
 * shadow, plus guarded spacing candidates). Layout properties are not
 * expressible here at all, so a theme edit cannot move anything.
 */

// ---------------------------------------------------------------------------
// Property vocabulary
// ---------------------------------------------------------------------------

/**
 * Declared property → property the OVERRIDE emits. Shorthands are narrowed to
 * their color component: appending `border-top-color` after `border-top:
 * 1px solid X` repaints the border without touching the width/style the
 * layout depends on, so the shorthand prefix never has to be carried around.
 */
const COLOR_PROPERTIES: ReadonlyMap<string, string> = new Map([
  ["color", "color"],
  ["background-color", "background-color"],
  ["background", "background-color"],
  ["border-color", "border-color"],
  ["border-top-color", "border-top-color"],
  ["border-right-color", "border-right-color"],
  ["border-bottom-color", "border-bottom-color"],
  ["border-left-color", "border-left-color"],
  ["border", "border-color"],
  ["border-top", "border-top-color"],
  ["border-right", "border-right-color"],
  ["border-bottom", "border-bottom-color"],
  ["border-left", "border-left-color"],
  ["outline-color", "outline-color"],
  ["text-decoration-color", "text-decoration-color"],
]);

/** Properties whose declared value is a shorthand `<width> <style> <color>`. */
const BORDER_SHORTHANDS = new Set(["border", "border-top", "border-right", "border-bottom", "border-left"]);

const SPACING_PROPERTIES = [
  "padding",
  "padding-top",
  "padding-right",
  "padding-bottom",
  "padding-left",
  "margin",
  "margin-top",
  "margin-right",
  "margin-bottom",
  "margin-left",
  "gap",
  "row-gap",
  "column-gap",
] as const;

const HEADING_TAGS = new Set(["h1", "h2", "h3", "h4", "h5", "h6", "p"]);
const CLICKABLE_TAGS = new Set(["a", "button"]);
const ROOT_TAGS = new Set(["html", "body"]);

/** `.wr-stNNNNNN` = one element style; `.wr-doc-stNNNNNN` = the document root
 *  style (the page canvas), which is where the page background lives. */
const CLASS_RE = /\.wr-(?:doc-)?st\d+/g;
const CLASS_PREFIXES = ["wr-st", "wr-doc-st"] as const;

// ---------------------------------------------------------------------------
// DOM census
// ---------------------------------------------------------------------------

interface Census {
  /** class → number of nodes carrying it across all pages and both variants. */
  classCount: Map<string, number>;
  rootClasses: Set<string>;
  headingClasses: Set<string>;
  clickableClasses: Set<string>;
  pages: number;
}

function classesOf(node: RuntimeElementNode): string[] {
  const raw = node.p?.["className"];
  if (typeof raw !== "string" || raw === "") return [];
  return raw.split(/\s+/).filter((c) => CLASS_PREFIXES.some((prefix) => c.startsWith(prefix)));
}

function hasOwnText(node: RuntimeElementNode): boolean {
  for (const child of (node.c ?? []) as RuntimeNode[]) {
    if (child.k === "t" && child.v.trim() !== "") return true;
  }
  return false;
}

function censusVariant(root: RuntimeElementNode, census: Census, depth: number): void {
  const tag = root.t.toLowerCase();
  const classes = classesOf(root);
  for (const cls of classes) {
    census.classCount.set(cls, (census.classCount.get(cls) ?? 0) + 1);
    // The doc root itself is the canvas even when it is a plain <div> wrapper.
    if (ROOT_TAGS.has(tag) || depth === 0 || cls.startsWith("wr-doc-st")) census.rootClasses.add(cls);
    if (HEADING_TAGS.has(tag) && hasOwnText(root)) census.headingClasses.add(cls);
    if (CLICKABLE_TAGS.has(tag)) census.clickableClasses.add(cls);
  }
  for (const child of (root.c ?? []) as RuntimeNode[]) {
    if (child.k === "e") censusVariant(child, census, depth + 1);
  }
}

export function censusPages(pages: readonly RuntimePage[]): Census {
  const census: Census = {
    classCount: new Map(),
    rootClasses: new Set(),
    headingClasses: new Set(),
    clickableClasses: new Set(),
    pages: pages.length,
  };
  for (const page of pages) {
    censusVariant(page.desktop.doc, census, 0);
    censusVariant(page.mobile.doc, census, 0);
  }
  return census;
}

// ---------------------------------------------------------------------------
// Value normalization
// ---------------------------------------------------------------------------

/** rgb()/rgba()/#hex/white/black → one canonical spelling; else undefined. */
export function normalizeColor(value: string): string | undefined {
  const raw = value.trim();
  if (raw === "" || /var\(|currentcolor|inherit|initial|unset|none/i.test(raw)) return undefined;
  if (isTransparentColor(raw)) return undefined;
  const parsed = parseColor(raw);
  if (!parsed) return undefined;
  if (parsed.a === 0) return undefined;
  const { r, g, b, a } = parsed;
  return a >= 1 ? `rgb(${r}, ${g}, ${b})` : `rgba(${r}, ${g}, ${b}, ${a})`;
}

function normalizeSpaces(value: string): string {
  return value.replace(/\s+/g, " ").replace(/\s*,\s*/g, ", ").trim();
}

function normalizeFontFamily(value: string): string | undefined {
  const v = normalizeSpaces(value);
  if (v === "" || /var\(|inherit|initial|unset/i.test(v)) return undefined;
  // `font-family:""` (an empty first family) is an observation artifact.
  if (/^(""|'')(,|$)/.test(v)) return undefined;
  return v;
}

function normalizeRadius(value: string): string | undefined {
  const v = normalizeSpaces(value);
  if (v === "" || /var\(|inherit|initial|unset/i.test(v)) return undefined;
  if (v.includes("%")) return undefined;
  if (/^0(px|rem|em)?$/.test(v)) return undefined;
  if (/^(0(px|rem|em)?\s+)*0(px|rem|em)?$/.test(v)) return undefined;
  return v;
}

function normalizeShadow(value: string): string | undefined {
  const v = normalizeSpaces(value);
  if (v === "" || v === "none" || /var\(|inherit|initial|unset/i.test(v)) return undefined;
  return v;
}

function normalizeSpacing(value: string): string | undefined {
  const v = normalizeSpaces(value);
  if (v === "" || /var\(|auto|inherit|initial|unset|calc\(/i.test(v)) return undefined;
  if (/^(0(px|rem|em)?\s*)+$/.test(v)) return undefined;
  return v;
}

// ---------------------------------------------------------------------------
// Extraction
// ---------------------------------------------------------------------------

interface Claim {
  kind: ThemeTokenKind;
  value: string;
  censusClass: string;
  selector: string;
  property: string;
  mediaCondition?: string;
}

interface Candidate {
  kind: ThemeTokenKind;
  value: string;
  claims: Claim[];
  classes: Set<string>;
  properties: Set<string>;
  weight: number;
}

export interface ThemeExtractInput {
  generatedCss: string;
  generatedCssFile: string;
  pages: readonly RuntimePage[];
  templateId: string;
  templateVersion: string;
}

export interface ThemeExtractResult {
  tokens: ThemeTokenDefinition[];
  report: ThemeExtractionReport;
}

/** The element the selector actually paints = its LAST `.wr-st` class. */
function censusClassOf(selector: string): string | undefined {
  const matches = selector.match(CLASS_RE);
  if (!matches || matches.length === 0) return undefined;
  return matches[matches.length - 1]!.slice(1);
}

function claimKey(claim: Claim): string {
  return `${claim.mediaCondition ?? ""}\u0000${claim.selector}\u0000${claim.property}`;
}

export function extractThemeTokens(input: ThemeExtractInput): ThemeExtractResult {
  const census = censusPages(input.pages);

  // Cascade truth: a later rule with the same (media, selector, property) wins,
  // so claims are collected in FILE ORDER and the last writer keeps the target.
  const claims = new Map<string, Claim>();
  let rulesScanned = 0;
  let rulesSkipped = 0;
  let targetsReclaimed = 0;

  const claim = (c: Claim): void => {
    const key = claimKey(c);
    if (claims.has(key)) targetsReclaimed++;
    claims.set(key, c);
  };

  forEachRule(input.generatedCss, (rule) => {
    if (rule.mediaCondition?.includes("@keyframes")) return;
    if (!rule.selector.includes(".wr-st") && !rule.selector.includes(".wr-doc-st")) {
      rulesSkipped++;
      return;
    }
    const censusClass = censusClassOf(rule.selector);
    if (censusClass === undefined) {
      rulesSkipped++;
      return;
    }
    rulesScanned++;
    const base = {
      censusClass,
      selector: rule.selector,
      ...(rule.mediaCondition === undefined ? {} : { mediaCondition: rule.mediaCondition }),
    };

    for (const [declared, emitted] of COLOR_PROPERTIES) {
      const raw = declarationValue(rule.body, declared);
      if (raw === undefined) continue;
      let colorPart = raw;
      if (BORDER_SHORTHANDS.has(declared)) {
        const shorthand = parseBorderShorthand(raw);
        if (!shorthand || !shorthand.paints) continue;
        colorPart = shorthand.color;
      }
      const value = normalizeColor(colorPart);
      if (value === undefined) continue;
      claim({ kind: "color", value, property: emitted, ...base });
    }

    const font = declarationValue(rule.body, "font-family");
    if (font !== undefined) {
      const value = normalizeFontFamily(font);
      if (value !== undefined) claim({ kind: "font-family", value, property: "font-family", ...base });
    }

    const radius = declarationValue(rule.body, "border-radius");
    if (radius !== undefined) {
      const value = normalizeRadius(radius);
      if (value !== undefined) claim({ kind: "radius", value, property: "border-radius", ...base });
    }

    const shadow = declarationValue(rule.body, "box-shadow");
    if (shadow !== undefined) {
      const value = normalizeShadow(shadow);
      if (value !== undefined) claim({ kind: "shadow", value, property: "box-shadow", ...base });
    }

    for (const property of SPACING_PROPERTIES) {
      const raw = declarationValue(rule.body, property);
      if (raw === undefined) continue;
      const value = normalizeSpacing(raw);
      if (value === undefined) continue;
      claim({ kind: "spacing-candidate", value, property, ...base });
    }
  });

  // --- cluster: one candidate per (kind, exact normalized value) -------------
  const candidates = new Map<string, Candidate>();
  let colorDeclarations = 0;
  for (const c of claims.values()) {
    if (c.kind === "color") colorDeclarations++;
    const key = `${c.kind}\u0000${c.value}`;
    let candidate = candidates.get(key);
    if (!candidate) {
      candidate = { kind: c.kind, value: c.value, claims: [], classes: new Set(), properties: new Set(), weight: 0 };
      candidates.set(key, candidate);
    }
    candidate.claims.push(c);
    candidate.classes.add(c.censusClass);
    candidate.properties.add(c.property);
  }
  for (const candidate of candidates.values()) {
    let weight = 0;
    for (const cls of candidate.classes) weight += census.classCount.get(cls) ?? 0;
    candidate.weight = weight;
  }

  // --- select: by weight, per kind, capped ----------------------------------
  const byKind = new Map<ThemeTokenKind, Candidate[]>();
  for (const candidate of candidates.values()) {
    const list = byKind.get(candidate.kind) ?? [];
    list.push(candidate);
    byKind.set(candidate.kind, list);
  }
  const order = (a: Candidate, b: Candidate): number =>
    b.weight - a.weight || b.claims.length - a.claims.length || (a.value < b.value ? -1 : a.value > b.value ? 1 : 0);

  const tokens: ThemeTokenDefinition[] = [];
  const evidence: ThemeTokenEvidence[] = [];
  const unTokenized: ThemeExtractionReport["unTokenized"] = {};
  const kindKey: Record<ThemeTokenKind, string> = {
    color: "color",
    "font-family": "font",
    radius: "radius",
    shadow: "shadow",
    "spacing-candidate": "spacing",
  };

  const selectedByKind = new Map<ThemeTokenKind, Candidate[]>();
  for (const kind of ["color", "font-family", "radius", "shadow", "spacing-candidate"] as const) {
    const list = (byKind.get(kind) ?? []).slice().sort(order);
    const cap = TOKEN_CAPS[kind];
    const kept: Candidate[] = [];
    const dropped: Candidate[] = [];
    for (let i = 0; i < list.length; i++) {
      const candidate = list[i]!;
      const eligible =
        kind === "spacing-candidate"
          ? candidate.claims.length >= TOKEN_THRESHOLDS.minSpacingDeclarations
          : candidate.weight >= TOKEN_THRESHOLDS.minElementOccurrences || i < 24;
      if (eligible && kept.length < cap) kept.push(candidate);
      else dropped.push(candidate);
    }
    selectedByKind.set(kind, kept);
    if (dropped.length > 0) {
      unTokenized[kind] = {
        values: dropped.length,
        declarations: dropped.reduce((sum, c) => sum + c.claims.length, 0),
        reason:
          kind === "spacing-candidate"
            ? `below ${TOKEN_THRESHOLDS.minSpacingDeclarations} declarations or beyond the cap of ${cap}`
            : `below ${TOKEN_THRESHOLDS.minElementOccurrences} element occurrences (and outside the top 24) or beyond the cap of ${cap}`,
      };
    }
  }

  // --- role hints (never affect rendering) ----------------------------------
  const colorTokens = selectedByKind.get("color") ?? [];
  const roleOf = new Map<Candidate, ThemeRole>();
  const pickRole = (role: ThemeRole, pool: Candidate[], rank: (c: Candidate) => number): void => {
    let best: Candidate | undefined;
    let bestScore = -1;
    for (const candidate of pool) {
      if (roleOf.has(candidate)) continue;
      const score = rank(candidate);
      if (score > bestScore) {
        best = candidate;
        bestScore = score;
      }
    }
    if (best && bestScore > 0) roleOf.set(best, role);
  };
  const claimsMatching = (c: Candidate, property: string, classes: ReadonlySet<string>): boolean =>
    c.claims.some((cl) => cl.property === property && classes.has(cl.censusClass));

  pickRole(
    "canvas",
    colorTokens.filter((c) => claimsMatching(c, "background-color", census.rootClasses)),
    (c) => c.weight,
  );
  pickRole(
    "text.primary",
    colorTokens.filter((c) => claimsMatching(c, "color", census.headingClasses)),
    (c) => c.weight,
  );
  pickRole(
    "accent",
    colorTokens.filter((c) => {
      if (!claimsMatching(c, "background-color", census.clickableClasses)) return false;
      const parsed = parseColor(c.value);
      return parsed !== undefined && colorChroma(parsed) >= 30;
    }),
    (c) => {
      const parsed = parseColor(c.value);
      return parsed ? colorChroma(parsed) : 0;
    },
  );

  // --- emit -----------------------------------------------------------------
  for (const kind of ["color", "font-family", "radius", "shadow", "spacing-candidate"] as const) {
    const kept = selectedByKind.get(kind) ?? [];
    for (let i = 0; i < kept.length; i++) {
      const candidate = kept[i]!;
      const key = `${kindKey[kind]}.${String(i + 1).padStart(2, "0")}`;
      const role = roleOf.get(candidate);
      const share = kind === "color" && colorDeclarations > 0 ? candidate.claims.length / colorDeclarations : 0;
      const borderOnly = [...candidate.properties].every((p) => p.startsWith("border-") || p === "border-color");
      let risk: ThemeTokenDefinition["risk"] = "safe";
      let riskReason = "ordinary paint property";
      if (kind === "spacing-candidate") {
        risk = "guarded";
        riskReason = "spacing changes can reflow layout";
      } else if (kind === "radius" && /\/|\s/.test(candidate.value)) {
        risk = "guarded";
        riskReason = "composite/multi-value radius";
      } else if (kind === "color" && share >= TOKEN_THRESHOLDS.guardedShareOfDeclarations) {
        risk = "guarded";
        riskReason = `painted by ${(share * 100).toFixed(0)}% of all colored declarations (wide blast radius)`;
      } else if (kind === "color" && borderOnly) {
        risk = "guarded";
        riskReason = "border color only";
      } else if (kind === "font-family") {
        riskReason = "font swap is an expected theme edit";
      }

      const targets = candidate.claims
        .map((c) => ({
          cssSelector: c.selector,
          property: c.property,
          ...(c.mediaCondition === undefined ? {} : { mediaCondition: c.mediaCondition }),
        }))
        .sort(
          (a, b) =>
            (a.mediaCondition ?? "").localeCompare(b.mediaCondition ?? "") ||
            a.cssSelector.localeCompare(b.cssSelector) ||
            a.property.localeCompare(b.property),
        );

      const editorHidden = kind === "spacing-candidate";
      const id = tokenIdOf(kind, candidate.value);
      tokens.push({
        id,
        key,
        label: role ? `${key} (${role})` : key,
        kind,
        value: candidate.value,
        risk,
        targets,
        usageCount: candidate.weight,
        provenance: {
          source: "surface-scan",
          evidence: [
            `kind:${kind}`,
            `css:generated-styles`,
            `census:decl=${candidate.claims.length},el=${candidate.weight}`,
            ...(role ? [`role:${role}`] : []),
            ...(editorHidden ? ["editor:hidden"] : []),
          ],
          notes: [`risk:${risk} — ${riskReason}`],
        },
      });
      evidence.push({
        tokenId: id,
        key,
        kind,
        value: candidate.value,
        risk,
        ...(role ? { role } : {}),
        declarations: candidate.claims.length,
        elementOccurrences: candidate.weight,
        editorHidden,
        riskReason,
        sampleSelectors: targets.slice(0, 3).map((t) => t.cssSelector),
        properties: [...candidate.properties].sort(),
      });
    }
  }

  const tokensByKind: Record<string, number> = {};
  const tokensByRisk: Record<string, number> = {};
  for (const token of tokens) {
    tokensByKind[token.kind] = (tokensByKind[token.kind] ?? 0) + 1;
    tokensByRisk[token.risk] = (tokensByRisk[token.risk] ?? 0) + 1;
  }

  const report: ThemeExtractionReport = {
    schemaVersion: SLOTIZED_TEMPLATE_SCHEMA_VERSION,
    schemaName: SLOTIZED_THEME_REPORT_SCHEMA,
    engine: THEME_EXTRACT_ENGINE,
    templateId: input.templateId,
    templateVersion: input.templateVersion,
    generatedStylesFile: input.generatedCssFile,
    generatedStylesBytes: Buffer.byteLength(input.generatedCss, "utf8"),
    rulesScanned,
    rulesSkipped,
    pagesCensused: census.pages,
    classesCensused: census.classCount.size,
    tokensByKind,
    tokensByRisk,
    unTokenized,
    targetsReclaimed,
    tokens: evidence,
  };

  return { tokens, report };
}
