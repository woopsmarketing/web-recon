import { readFile } from "node:fs/promises";
import path from "node:path";
import type { LoadedReconTemplate } from "../content-injection/load-template.js";
import {
  collectUsageCensus,
  type TokenUsage,
  type UsageCensus,
} from "./occurrences.js";
import {
  colorChroma,
  contrastRatio,
  isTransparentColor,
  parseBorderShorthand,
  parseColor,
  parseGeneratedStylesheet,
  relativeLuminance,
  type ParsedStylesheet,
  type StylesheetRule,
} from "./stylesheet.js";
import {
  PaintGroupSchema,
  SiteThemeAdapterSchema,
  THEME_ADAPTER_VERSION,
  THEME_CONTRACT_ID,
  THEME_SCHEMA_VERSION,
  ThemeContractError,
  ThemeFileSchema,
  ThemeInputError,
  isThemeToken,
  tokenKind,
  type PaintGroup,
  type SiteThemeAdapter,
  type ThemeAdapterOverrides,
  type ThemeFile,
} from "./types.js";

/**
 * Original Theme extraction + Site Theme Adapter compilation (Task 20 §5–§12).
 *
 * Deterministic, offline, and a pure CONSUMER of the frozen Recon Template:
 * the only inputs are the template app's own generated stylesheet, its own
 * runtime page trees, and the template's slot catalog (role evidence for CTA
 * paint). No AI, no similarity scores — a color that the closed evidence
 * rules cannot explain stays a RAW paint group (`semanticToken: null`) rather
 * than being pushed into the contract (§10/§11).
 */

export const GENERATED_STYLESHEET_RELPATH = path.join("public", "wr", "generated-styles.css");

/** A group must carry at least this much element weight to demand review. */
const REVIEW_MIN_ELEMENT_WEIGHT = 12;
/** Minimum weight for optional semantic assignments (inverse/accent/etc.). */
const ASSIGN_MIN_WEIGHT = 20;
/** Dark-text luminance ceiling for the §23 preserved-dark-text hazard. */
const DARK_TEXT_LUMINANCE = 0.35;

// ---------------------------------------------------------------------------
// Occurrence records (pass 1)
// ---------------------------------------------------------------------------

interface Occurrence {
  rule: StylesheetRule;
  /** Stylesheet property (`border-top` stays the shorthand). */
  property: string;
  paintKind: "color" | "radius" | "shadow";
  value: string;
  colorComponent?: string;
  preservedPrefix?: string;
  /** Non-empty → this occurrence may never be themed, with these reasons. */
  preservedReasons: string[];
  usage?: TokenUsage;
  staticElements: number;
  dynamicElements: number;
}

function usageFor(census: UsageCensus, rule: StylesheetRule): TokenUsage | undefined {
  return rule.styleTokenId !== undefined ? census.byToken.get(rule.styleTokenId) : undefined;
}

function collectOccurrences(sheet: ParsedStylesheet, census: UsageCensus): Occurrence[] {
  const occurrences: Occurrence[] = [];
  for (const rule of sheet.rules) {
    const usage = rule.kind === "style-token" ? usageFor(census, rule) : undefined;
    const staticElements =
      rule.kind === "style-token"
        ? (usage?.staticElements ?? 0)
        : rule.kind === "doc-root"
          ? 1
          : 0;
    const dynamicElements = rule.kind === "style-token" ? (usage?.dynamicElements ?? 0) : 0;
    // A style-token rule no element carries paints nothing on this site.
    if (rule.kind === "style-token" && staticElements + dynamicElements === 0) continue;
    const push = (partial: Omit<Occurrence, "rule" | "usage" | "staticElements" | "dynamicElements">): void => {
      occurrences.push({ rule, usage, staticElements, dynamicElements, ...partial });
    };

    const decls = rule.declarations;
    const backgroundImage = decls["background-image"];
    for (const [property, value] of Object.entries(decls)) {
      if (property === "color") {
        if (isTransparentColor(value)) continue;
        push({ property, paintKind: "color", value, colorComponent: value, preservedReasons: [] });
        continue;
      }
      if (property === "background-color") {
        if (isTransparentColor(value)) continue;
        const reasons: string[] = [];
        if (backgroundImage !== undefined && backgroundImage !== "none") {
          // Repainting the color BEHIND a gradient/image asset risks a visible
          // conflict with paint the theme cannot reach (§13/§14).
          reasons.push(
            backgroundImage.includes("gradient")
              ? "background-gradient-above-color"
              : "background-image-above-color",
          );
        }
        const parsed = parseColor(value);
        if (parsed !== undefined && parsed.a < 1) reasons.push("translucent-background");
        push({ property, paintKind: "color", value, colorComponent: value, preservedReasons: reasons });
        continue;
      }
      if (
        property === "border-top" ||
        property === "border-right" ||
        property === "border-bottom" ||
        property === "border-left"
      ) {
        const border = parseBorderShorthand(value);
        if (border === undefined || !border.paints) continue;
        if (isTransparentColor(border.color)) continue;
        push({
          property,
          paintKind: "color",
          value,
          colorComponent: border.color,
          preservedPrefix: border.prefix,
          preservedReasons: [],
        });
        continue;
      }
      if (property === "border-radius") {
        if (value === "0px" || value === "0%") continue;
        const reasons: string[] = [];
        if (value.includes("%")) reasons.push("radius-percentage-shape");
        else if (value.includes(" ") || value.includes("/")) reasons.push("radius-composite-value");
        push({ property, paintKind: "radius", value, preservedReasons: reasons });
        continue;
      }
      if (property === "box-shadow") {
        if (value === "none") continue;
        const reasons: string[] = [];
        if (value.includes("inset")) reasons.push("inset-shadow");
        push({ property, paintKind: "shadow", value, preservedReasons: reasons });
        continue;
      }
    }
  }
  return occurrences;
}

// ---------------------------------------------------------------------------
// Semantic value assignment (pass 2)
// ---------------------------------------------------------------------------

interface WeightEntry {
  value: string;
  weight: number;
}

function ranked(map: Map<string, number>): WeightEntry[] {
  return [...map.entries()]
    .map(([value, weight]) => ({ value, weight }))
    .sort((a, b) => b.weight - a.weight || a.value.localeCompare(b.value));
}

export interface SemanticAssignment {
  token: string;
  value: string;
  provenance: "observed" | "derived";
  evidence: string[];
}

interface AssignmentContext {
  colorMap: Map<string, string>;
  backgroundMap: Map<string, string>;
  borderMap: Map<string, string>;
  radiusMap: Map<string, string>;
  shadowMap: Map<string, string>;
  assignments: SemanticAssignment[];
  canvasValue?: string;
}

function assign(
  context: AssignmentContext,
  map: Map<string, string>,
  token: string,
  value: string,
  provenance: "observed" | "derived",
  evidence: string[],
): boolean {
  if (map.has(value)) return false;
  map.set(value, token);
  context.assignments.push({ token, value, provenance, evidence });
  return true;
}

function ctaPaintEvidence(
  template: LoadedReconTemplate,
  census: UsageCensus,
  tokenRules: Map<string, StylesheetRule>,
): { background?: string; color?: string; radius?: string; count: number } {
  const backgrounds = new Map<string, number>();
  const colors = new Map<string, number>();
  const radii = new Map<string, number>();
  let count = 0;
  for (const slot of template.slotsFile.slots) {
    if (slot.role !== "cta.label") continue;
    for (const binding of template.bindingsBySlotId.get(slot.id) ?? []) {
      if (binding.surface !== "static" || binding.target !== "text") continue;
      const token = census.tokenOfNode.get(`${binding.pageId}|${binding.viewport}|${binding.nodeId}`);
      const rule = token !== undefined ? tokenRules.get(token) : undefined;
      if (!rule) continue;
      // Only a BUTTON-shaped CTA is action evidence: the slot role admits any
      // conversion label, but a bare text link carries no action surface. An
      // opaque own background is the deterministic "this is a button" test.
      const bg = rule.declarations["background-color"];
      const bgParsed = bg !== undefined && !isTransparentColor(bg) ? parseColor(bg) : undefined;
      if (bgParsed === undefined || bgParsed.a < 1) continue;
      count++;
      const fg = rule.declarations["color"];
      const radius = rule.declarations["border-radius"];
      backgrounds.set(bg!, (backgrounds.get(bg!) ?? 0) + 1);
      if (fg !== undefined) colors.set(fg, (colors.get(fg) ?? 0) + 1);
      if (radius !== undefined && radius !== "0px") radii.set(radius, (radii.get(radius) ?? 0) + 1);
    }
  }
  return {
    background: ranked(backgrounds)[0]?.value,
    color: ranked(colors)[0]?.value,
    radius: ranked(radii)[0]?.value,
    count,
  };
}

function assignSemanticTokens(
  occurrences: Occurrence[],
  census: UsageCensus,
  sheet: ParsedStylesheet,
  template: LoadedReconTemplate,
): AssignmentContext {
  const context: AssignmentContext = {
    colorMap: new Map(),
    backgroundMap: new Map(),
    borderMap: new Map(),
    radiusMap: new Map(),
    shadowMap: new Map(),
    assignments: [],
  };

  // Evidence tables (element-weighted, eligible occurrences only).
  const textWeight = new Map<string, number>();
  const headingWeight = new Map<string, number>();
  const anchorWeight = new Map<string, number>();
  const backgroundWeight = new Map<string, number>();
  const docBackground = new Map<string, number>();
  const borderWeight = new Map<string, number>();
  const radiusWeight = new Map<string, number>();
  const radiusButtonWeight = new Map<string, number>();
  const shadowWeight = new Map<string, number>();
  const bump = (map: Map<string, number>, key: string, by: number): void => {
    if (by > 0) map.set(key, (map.get(key) ?? 0) + by);
  };
  for (const occ of occurrences) {
    if (occ.preservedReasons.length > 0) continue;
    const elements = occ.staticElements + occ.dynamicElements;
    if (occ.property === "color") {
      bump(textWeight, occ.value, occ.usage?.directText ?? 0);
      bump(headingWeight, occ.value, occ.usage?.headingText ?? 0);
      bump(anchorWeight, occ.value, occ.usage?.anchorOrButtonText ?? 0);
    } else if (occ.property === "background-color") {
      // Ranking weight comes from the ELEMENT census only — node-scoped
      // rules (open-state grafts, pseudo bars) have no element count and a
      // revealed-state graft repeats per node, which would inflate a menu
      // panel color above real page surfaces. They still BIND by value.
      if (occ.rule.kind === "doc-root") bump(docBackground, occ.value, 1);
      else if (occ.rule.kind === "style-token") bump(backgroundWeight, occ.value, elements);
    } else if (occ.paintKind === "color") {
      bump(borderWeight, occ.colorComponent ?? occ.value, Math.max(elements, 1));
    } else if (occ.paintKind === "radius") {
      bump(radiusWeight, occ.value, Math.max(elements, 1));
      bump(radiusButtonWeight, occ.value, occ.usage?.anchorOrButtonText ?? 0);
    } else if (occ.paintKind === "shadow") {
      bump(shadowWeight, occ.value, Math.max(elements, 1));
    }
  }

  // --- color.canvas: the document/root background (§7 예시 그대로) ---------
  const docRanked = ranked(docBackground).filter((e) => !isTransparentColor(e.value));
  const canvas = docRanked[0] ?? ranked(backgroundWeight)[0];
  if (canvas !== undefined) {
    context.canvasValue = canvas.value;
    assign(context, context.backgroundMap, "color.canvas", canvas.value, "observed", [
      docRanked[0] !== undefined
        ? `document-root background on ${canvas.weight} doc rule(s)`
        : `most frequent opaque background (${canvas.weight} elements)`,
    ]);
  }
  const canvasColor = context.canvasValue !== undefined ? parseColor(context.canvasValue) : undefined;

  // --- action.primary / action.primaryText: CTA slot paint evidence --------
  const tokenRules = new Map<string, StylesheetRule>();
  for (const rule of sheet.rules) {
    if (rule.kind === "style-token" && rule.styleTokenId !== undefined) {
      tokenRules.set(rule.styleTokenId, rule);
    }
  }
  const cta = ctaPaintEvidence(template, census, tokenRules);
  if (cta.background !== undefined) {
    assign(context, context.backgroundMap, "color.action.primary", cta.background, "observed", [
      `background of ${cta.count} cta.label slot occurrence(s)`,
    ]);
    if (cta.color !== undefined) {
      assign(context, context.colorMap, "color.action.primaryText", cta.color, "observed", [
        `text color of the cta.label slot occurrences`,
      ]);
    }
  }

  // --- text colors: heading first, then ranked body evidence ---------------
  const textRanked = ranked(textWeight);
  const headingRanked = ranked(headingWeight);
  const primary = headingRanked[0];
  if (primary !== undefined && primary.weight > 0) {
    assign(context, context.colorMap, "color.text.primary", primary.value, "observed", [
      `dominant heading text color (${primary.weight} heading elements)`,
    ]);
  }
  const linkCandidate = ranked(anchorWeight).find((entry) => {
    const parsed = parseColor(entry.value);
    return (
      parsed !== undefined &&
      colorChroma(parsed) >= 40 &&
      !context.colorMap.has(entry.value) &&
      entry.weight >= ASSIGN_MIN_WEIGHT
    );
  });
  if (linkCandidate !== undefined) {
    assign(context, context.colorMap, "color.link", linkCandidate.value, "observed", [
      `dominant saturated anchor/button text color (${linkCandidate.weight} elements)`,
    ]);
  }
  const secondary = textRanked.find((entry) => {
    if (context.colorMap.has(entry.value)) return false;
    const parsed = parseColor(entry.value);
    return parsed !== undefined && relativeLuminance(parsed) < 0.6 && entry.weight >= ASSIGN_MIN_WEIGHT;
  });
  if (secondary !== undefined) {
    assign(context, context.colorMap, "color.text.secondary", secondary.value, "observed", [
      `most frequent body text color (${secondary.weight} text elements)`,
    ]);
  }
  if (secondary !== undefined) {
    const secondaryLuminance = relativeLuminance(parseColor(secondary.value)!);
    const muted = textRanked.find((entry) => {
      if (context.colorMap.has(entry.value)) return false;
      const parsed = parseColor(entry.value);
      if (parsed === undefined || entry.weight < ASSIGN_MIN_WEIGHT) return false;
      if (relativeLuminance(parsed) <= secondaryLuminance) return false;
      return canvasColor === undefined || contrastRatio(parsed, canvasColor) >= 1.5;
    });
    if (muted !== undefined) {
      assign(context, context.colorMap, "color.text.muted", muted.value, "observed", [
        `frequent lighter text color (${muted.weight} text elements)`,
      ]);
    }
  }
  if (canvasColor !== undefined) {
    const inverse = textRanked.find((entry) => {
      if (context.colorMap.has(entry.value)) return false;
      const parsed = parseColor(entry.value);
      return (
        parsed !== undefined &&
        entry.weight >= ASSIGN_MIN_WEIGHT &&
        contrastRatio(parsed, canvasColor) < 1.8
      );
    });
    if (inverse !== undefined) {
      assign(context, context.colorMap, "color.text.inverse", inverse.value, "observed", [
        `text color near the canvas value — paints on non-canvas surfaces (${inverse.weight} elements)`,
      ]);
    }
  }

  // --- surfaces -------------------------------------------------------------
  // surface.primary / surface.elevated share the CANVAS value but bind
  // DIFFERENT occurrences (element surfaces vs shadow-carrying cards) — the
  // split happens at grouping time. They are declared here so a curated theme
  // can differentiate page ground from card ground.
  if (context.canvasValue !== undefined) {
    context.assignments.push({
      token: "color.surface.primary",
      value: context.canvasValue,
      provenance: "derived",
      evidence: ["element surfaces sharing the canvas value (bound separately from the canvas group)"],
    });
    context.assignments.push({
      token: "color.surface.elevated",
      value: context.canvasValue,
      provenance: "derived",
      evidence: ["canvas-valued surfaces whose rule also carries a box-shadow (cards)"],
    });
  }
  const surfaceSecondary = ranked(backgroundWeight).find((entry) => {
    if (entry.value === context.canvasValue || context.backgroundMap.has(entry.value)) return false;
    const parsed = parseColor(entry.value);
    return parsed !== undefined && parsed.a === 1 && entry.weight >= ASSIGN_MIN_WEIGHT;
  });
  if (surfaceSecondary !== undefined) {
    assign(context, context.backgroundMap, "color.surface.secondary", surfaceSecondary.value, "observed", [
      `most frequent opaque non-canvas background (${surfaceSecondary.weight} elements)`,
    ]);
  }

  // --- borders --------------------------------------------------------------
  // A border the same color as the canvas is real paint but never a HAIRLINE
  // the design relies on (a white border on a white page) — border.default
  // must be a border a user can see against the canvas.
  const borderRanked = ranked(borderWeight).filter((entry) => {
    const parsed = parseColor(entry.value);
    if (parsed === undefined) return false;
    return canvasColor === undefined || contrastRatio(parsed, canvasColor) >= 1.1;
  });
  if (borderRanked[0] !== undefined) {
    assign(context, context.borderMap, "color.border.default", borderRanked[0].value, "observed", [
      `most frequent canvas-visible border color (weight ${borderRanked[0].weight})`,
    ]);
    const defaultParsed = parseColor(borderRanked[0].value);
    const strong = borderRanked.slice(1).find((entry) => {
      const parsed = parseColor(entry.value);
      return (
        parsed !== undefined &&
        defaultParsed !== undefined &&
        canvasColor !== undefined &&
        contrastRatio(parsed, canvasColor) > contrastRatio(defaultParsed, canvasColor) &&
        entry.weight >= 8
      );
    });
    if (strong !== undefined) {
      assign(context, context.borderMap, "color.border.strong", strong.value, "observed", [
        `second border color with higher canvas contrast (weight ${strong.weight})`,
      ]);
    }
  }

  // --- accents: frequent saturated paint no prior rule claimed --------------
  const accentWeights = new Map<string, number>();
  for (const [value, weight] of textWeight) bump(accentWeights, value, weight);
  for (const [value, weight] of backgroundWeight) bump(accentWeights, value, weight);
  const accentRanked = ranked(accentWeights).filter((entry) => {
    if (context.colorMap.has(entry.value) || context.backgroundMap.has(entry.value)) return false;
    const parsed = parseColor(entry.value);
    return (
      parsed !== undefined && parsed.a === 1 && colorChroma(parsed) >= 60 && entry.weight >= ASSIGN_MIN_WEIGHT
    );
  });
  if (accentRanked[0] !== undefined) {
    const value = accentRanked[0].value;
    context.colorMap.set(value, "color.accent.primary");
    context.backgroundMap.set(value, "color.accent.primary");
    context.assignments.push({
      token: "color.accent.primary",
      value,
      provenance: "observed",
      evidence: [`most frequent unclaimed saturated paint value (weight ${accentRanked[0].weight})`],
    });
  }
  if (accentRanked[1] !== undefined) {
    const value = accentRanked[1].value;
    context.colorMap.set(value, "color.accent.secondary");
    context.backgroundMap.set(value, "color.accent.secondary");
    context.assignments.push({
      token: "color.accent.secondary",
      value,
      provenance: "observed",
      evidence: [`second unclaimed saturated paint value (weight ${accentRanked[1].weight})`],
    });
  }

  // --- decoration: radius ---------------------------------------------------
  const singlePx = (value: string): number | undefined => {
    const match = /^([0-9.]+)px$/.exec(value);
    return match ? Number.parseFloat(match[1]) : undefined;
  };
  // Sub-2px radii are anti-aliasing dust, not a design decision.
  const radiusEntries = ranked(radiusWeight)
    .map((entry) => ({ ...entry, px: singlePx(entry.value) }))
    .filter((entry): entry is WeightEntry & { px: number } => entry.px !== undefined && entry.px >= 2);
  const pill = [...radiusEntries]
    .filter((entry) => entry.px >= 12 && (radiusButtonWeight.get(entry.value) ?? 0) >= 2)
    .sort((a, b) => b.px - a.px)[0];
  if (pill !== undefined) {
    assign(context, context.radiusMap, "decoration.radius.pill", pill.value, "observed", [
      `largest control radius on anchors/buttons (weight ${pill.weight})`,
    ]);
  }
  // The three MOST-USED remaining radii, named by size order.
  const rest = radiusEntries
    .filter((entry) => entry.weight >= 8 && !context.radiusMap.has(entry.value))
    .slice(0, 3)
    .sort((a, b) => a.px - b.px);
  const restTokens =
    rest.length >= 3
      ? ["decoration.radius.small", "decoration.radius.medium", "decoration.radius.large"]
      : rest.length === 2
        ? ["decoration.radius.small", "decoration.radius.medium"]
        : rest.length === 1
          ? ["decoration.radius.small"]
          : [];
  rest.forEach((entry, index) => {
    assign(context, context.radiusMap, restTokens[index], entry.value, "observed", [
      `observed corner radius (weight ${entry.weight})`,
    ]);
  });

  // --- decoration: shadows --------------------------------------------------
  const firstBlur = (value: string): number => {
    const match = /-?[0-9.]+px\s+-?[0-9.]+px\s+(-?[0-9.]+)px/.exec(value);
    return match ? Math.abs(Number.parseFloat(match[1])) : 0;
  };
  const shadowTop = ranked(shadowWeight)
    .filter((entry) => entry.weight >= 4)
    .slice(0, 3)
    .sort((a, b) => firstBlur(a.value) - firstBlur(b.value));
  const shadowTokens =
    shadowTop.length === 3
      ? ["decoration.shadow.small", "decoration.shadow.medium", "decoration.shadow.large"]
      : shadowTop.length === 2
        ? ["decoration.shadow.small", "decoration.shadow.large"]
        : shadowTop.length === 1
          ? ["decoration.shadow.medium"]
          : [];
  shadowTop.forEach((entry, index) => {
    assign(context, context.shadowMap, shadowTokens[index], entry.value, "observed", [
      `observed box-shadow (weight ${entry.weight}, blur ${firstBlur(entry.value)}px)`,
    ]);
  });

  return context;
}

// ---------------------------------------------------------------------------
// Grouping (pass 3) + binding/status (pass 4)
// ---------------------------------------------------------------------------

interface GroupAccumulator {
  property: string;
  paintKind: "color" | "radius" | "shadow";
  value: string;
  colorComponent?: string;
  preservedPrefix?: string;
  preservedReasons: Set<string>;
  semanticToken: string | null;
  selectors: Set<string>;
  selectorKinds: Set<string>;
  ruleCount: number;
  staticElements: number;
  dynamicElements: number;
  nodeScopedRules: number;
  contexts: { directText: number; heading: number; anchorOrButton: number; landmarks: Record<string, number> };
}

function bindingFor(context: AssignmentContext, occ: Occurrence): string | null {
  if (occ.preservedReasons.length > 0) return null;
  if (occ.paintKind === "radius") return context.radiusMap.get(occ.value) ?? null;
  if (occ.paintKind === "shadow") return context.shadowMap.get(occ.value) ?? null;
  if (occ.property === "color") return context.colorMap.get(occ.value) ?? null;
  if (occ.property === "background-color") {
    const token = context.backgroundMap.get(occ.value) ?? null;
    if (token !== "color.canvas") return token;
    // The canvas VALUE splits into three bindable identities (§7 surface
    // relationships): document/full-bleed paint stays canvas; ordinary
    // element surfaces are surface.primary; shadow-carrying rules are
    // surface.elevated. A curated theme may keep them equal — or not.
    if (occ.rule.kind === "doc-root" || occ.rule.pseudo) return "color.canvas";
    const shadow = occ.rule.declarations["box-shadow"];
    if (shadow !== undefined && shadow !== "none") return "color.surface.elevated";
    return "color.surface.primary";
  }
  // Border shorthand: bind on the color component.
  return context.borderMap.get(occ.colorComponent ?? occ.value) ?? null;
}

function buildGroups(occurrences: Occurrence[], context: AssignmentContext): PaintGroup[] {
  const accumulators = new Map<string, GroupAccumulator>();
  for (const occ of occurrences) {
    const semanticToken = bindingFor(context, occ);
    const preservedKey = [...occ.preservedReasons].sort().join(",");
    const key = `${occ.property} ${occ.value} ${semanticToken ?? ""} ${preservedKey}`;
    let acc = accumulators.get(key);
    if (!acc) {
      acc = {
        property: occ.property,
        paintKind: occ.paintKind,
        value: occ.value,
        ...(occ.colorComponent !== undefined ? { colorComponent: occ.colorComponent } : {}),
        ...(occ.preservedPrefix !== undefined ? { preservedPrefix: occ.preservedPrefix } : {}),
        preservedReasons: new Set(occ.preservedReasons),
        semanticToken,
        selectors: new Set(),
        selectorKinds: new Set(),
        ruleCount: 0,
        staticElements: 0,
        dynamicElements: 0,
        nodeScopedRules: 0,
        contexts: { directText: 0, heading: 0, anchorOrButton: 0, landmarks: {} },
      };
      accumulators.set(key, acc);
    }
    acc.selectors.add(occ.rule.selector);
    acc.selectorKinds.add(occ.rule.kind);
    acc.ruleCount++;
    acc.staticElements += occ.staticElements;
    acc.dynamicElements += occ.dynamicElements;
    if (occ.rule.kind === "node-scoped") acc.nodeScopedRules++;
    if (occ.property === "color" && occ.usage !== undefined) {
      acc.contexts.directText += occ.usage.directText;
      acc.contexts.heading += occ.usage.headingText;
      acc.contexts.anchorOrButton += occ.usage.anchorOrButtonText;
    }
    if (occ.usage !== undefined) {
      for (const [landmark, count] of Object.entries(occ.usage.landmarks)) {
        acc.contexts.landmarks[landmark] = (acc.contexts.landmarks[landmark] ?? 0) + count;
      }
    }
  }

  const propertyOrder = new Map<string, number>();
  ["color", "background-color", "border-top", "border-right", "border-bottom", "border-left", "border-radius", "box-shadow"].forEach(
    (property, index) => propertyOrder.set(property, index),
  );
  const sorted = [...accumulators.values()].sort((a, b) => {
    const orderA = propertyOrder.get(a.property) ?? 99;
    const orderB = propertyOrder.get(b.property) ?? 99;
    if (orderA !== orderB) return orderA - orderB;
    const weightA = a.staticElements + a.dynamicElements + a.nodeScopedRules;
    const weightB = b.staticElements + b.dynamicElements + b.nodeScopedRules;
    if (weightA !== weightB) return weightB - weightA;
    return a.value.localeCompare(b.value) || (a.semanticToken ?? "").localeCompare(b.semanticToken ?? "");
  });

  return sorted.map((acc, index) => {
    const elementWeight = acc.staticElements + acc.dynamicElements;
    const status =
      acc.semanticToken !== null && acc.preservedReasons.size === 0
        ? "themeable"
        : acc.preservedReasons.size > 0
          ? "preserved"
          : elementWeight + acc.nodeScopedRules * 2 >= REVIEW_MIN_ELEMENT_WEIGHT
            ? "review"
            : "preserved";
    const reasons =
      acc.preservedReasons.size > 0
        ? [...acc.preservedReasons].sort()
        : acc.semanticToken !== null
          ? []
          : status === "review"
            ? ["no-deterministic-semantic-evidence"]
            : ["no-deterministic-semantic-evidence", "low-occurrence-weight"];
    return PaintGroupSchema.parse({
      paintGroupId: `pg${String(index + 1).padStart(6, "0")}`,
      property: acc.property,
      paintKind: acc.paintKind,
      value: acc.value,
      ...(acc.colorComponent !== undefined ? { colorComponent: acc.colorComponent } : {}),
      ...(acc.preservedPrefix !== undefined ? { preservedPrefix: acc.preservedPrefix } : {}),
      ruleCount: acc.ruleCount,
      staticElementCount: acc.staticElements,
      dynamicElementCount: acc.dynamicElements,
      nodeScopedRuleCount: acc.nodeScopedRules,
      selectorKinds: [...acc.selectorKinds].sort(),
      selectors: [...acc.selectors].sort(),
      contexts: acc.contexts,
      semanticToken: acc.preservedReasons.size > 0 ? null : acc.semanticToken,
      status,
      reasons,
      provenance: "derived",
    });
  });
}

// ---------------------------------------------------------------------------
// Manual adapter overrides (§26)
// ---------------------------------------------------------------------------

export function applyAdapterOverrides(
  groups: PaintGroup[],
  overrides: ThemeAdapterOverrides,
): { groups: PaintGroup[]; applied: string[] } {
  const byId = new Map(groups.map((group) => [group.paintGroupId, group]));
  const applied: string[] = [];
  const need = (id: string): PaintGroup => {
    const group = byId.get(id);
    if (!group) throw new ThemeContractError(`override references unknown paint group ${id}`);
    return group;
  };
  const replace = (next: PaintGroup): void => {
    byId.set(next.paintGroupId, next);
  };
  for (const bind of overrides.bind ?? []) {
    if (!isThemeToken(bind.token) || tokenKind(bind.token) === "typography") {
      throw new ThemeContractError(`override binds unknown/unbindable token "${bind.token}"`);
    }
    const group = need(bind.paintGroupId);
    replace({ ...group, semanticToken: bind.token, status: "themeable", reasons: ["manual-bind"] });
    applied.push(`bind:${bind.paintGroupId}:${bind.token}`);
  }
  for (const id of overrides.unbind ?? []) {
    const group = need(id);
    replace({ ...group, semanticToken: null, status: "review", reasons: ["manual-unbind"] });
    applied.push(`unbind:${id}`);
  }
  for (const id of overrides.preserve ?? []) {
    const group = need(id);
    replace({ ...group, status: "preserved", reasons: [...group.reasons, "manual-preserve"] });
    applied.push(`preserve:${id}`);
  }
  for (const id of overrides.themeable ?? []) {
    const group = need(id);
    if (group.semanticToken === null) {
      throw new ThemeContractError(
        `override promotes ${id} to themeable but it has no token binding — bind it first`,
      );
    }
    replace({ ...group, status: "themeable", reasons: ["manual-themeable"] });
    applied.push(`themeable:${id}`);
  }
  return { groups: groups.map((group) => byId.get(group.paintGroupId)!), applied };
}

// ---------------------------------------------------------------------------
// Orchestration
// ---------------------------------------------------------------------------

export interface ThemeExtraction {
  adapter: SiteThemeAdapter;
  originalTheme: ThemeFile;
  stylesheet: ParsedStylesheet;
  census: UsageCensus;
  assignments: SemanticAssignment[];
}

export async function extractSiteTheme(
  template: LoadedReconTemplate,
  options: { overrides?: ThemeAdapterOverrides } = {},
): Promise<ThemeExtraction> {
  const stylesheetFile = path.join(template.appDir, GENERATED_STYLESHEET_RELPATH);
  let css: string;
  try {
    css = await readFile(stylesheetFile, "utf8");
  } catch {
    throw new ThemeInputError(`template app stylesheet missing at ${stylesheetFile}`);
  }
  const stylesheet = parseGeneratedStylesheet(css);
  const census = await collectUsageCensus(template.appDir);
  const occurrences = collectOccurrences(stylesheet, census);
  const context = assignSemanticTokens(occurrences, census, stylesheet, template);
  let groups = buildGroups(occurrences, context);
  let appliedOverrides: string[] = [];
  if (options.overrides !== undefined) {
    const result = applyAdapterOverrides(groups, options.overrides);
    groups = result.groups;
    appliedOverrides = result.applied;
  }

  // Token table: keep only tokens that ended up with ≥1 bound group OR carry
  // assignment evidence — never force-fill (§10 "확신이 약하면 남긴다").
  const boundBy = new Map<string, string[]>();
  for (const group of groups) {
    if (group.status !== "themeable" || group.semanticToken === null) continue;
    const list = boundBy.get(group.semanticToken) ?? [];
    list.push(group.paintGroupId);
    boundBy.set(group.semanticToken, list);
  }
  const tokens: Record<string, { originalValue: string; boundGroupIds: string[]; provenance: "observed" | "derived"; evidence: string[] }> = {};
  for (const assignment of context.assignments) {
    const bound = boundBy.get(assignment.token) ?? [];
    if (bound.length === 0) continue;
    tokens[assignment.token] = {
      originalValue: assignment.value,
      boundGroupIds: bound.sort(),
      provenance: assignment.provenance,
      evidence: assignment.evidence,
    };
  }
  // Manual binds may introduce tokens with no extraction assignment: their
  // original value is the bound group's own observed value.
  for (const [token, groupIds] of boundBy) {
    if (tokens[token] !== undefined) continue;
    const first = groups.find((group) => group.paintGroupId === groupIds[0])!;
    tokens[token] = {
      originalValue: first.colorComponent ?? first.value,
      boundGroupIds: groupIds.sort(),
      provenance: "observed",
      evidence: ["manual adapter binding"],
    };
  }

  // Coverage (adapter-side; the §23 dark gate reads these numbers).
  let textColorElementWeight = 0;
  let textColorBoundElementWeight = 0;
  let backgroundElementWeight = 0;
  let backgroundBoundElementWeight = 0;
  let unboundDarkTextElementWeight = 0;
  for (const group of groups) {
    const elements = group.staticElementCount + group.dynamicElementCount;
    if (group.property === "color") {
      textColorElementWeight += group.contexts.directText;
      if (group.status === "themeable") textColorBoundElementWeight += group.contexts.directText;
      else {
        const parsed = parseColor(group.value);
        if (parsed !== undefined && relativeLuminance(parsed) < DARK_TEXT_LUMINANCE) {
          unboundDarkTextElementWeight += group.contexts.directText;
        }
      }
    }
    if (group.property === "background-color") {
      backgroundElementWeight += elements;
      if (group.status === "themeable") backgroundBoundElementWeight += elements;
    }
  }

  const adapter = SiteThemeAdapterSchema.parse({
    schemaVersion: THEME_SCHEMA_VERSION,
    adapterVersion: THEME_ADAPTER_VERSION,
    contract: THEME_CONTRACT_ID,
    templateId: template.manifest.templateId,
    host: template.manifest.source.host,
    rootUrl: template.manifest.source.rootUrl,
    stylesheet: {
      file: GENERATED_STYLESHEET_RELPATH.split(path.sep).join("/"),
      sha256: stylesheet.sha256,
      ruleCount: stylesheet.ruleCount,
    },
    tokens,
    paintGroups: groups,
    coverage: {
      themeableGroups: groups.filter((g) => g.status === "themeable").length,
      preservedGroups: groups.filter((g) => g.status === "preserved").length,
      reviewGroups: groups.filter((g) => g.status === "review").length,
      textColorElementWeight,
      textColorBoundElementWeight,
      backgroundElementWeight,
      backgroundBoundElementWeight,
      unboundDarkTextElementWeight,
    },
    appliedOverrides,
    limitations: [
      "svg-internal-paint-not-themed",
      "raster-and-video-assets-not-recolored",
      "background-image-and-gradient-values-preserved",
      "typography-tokens-not-auto-applied",
      "caret-outline-text-decoration-colors-absent-from-observed-styles",
    ],
    provenance: "derived",
  });

  const canvasParsed = context.canvasValue !== undefined ? parseColor(context.canvasValue) : undefined;
  const originalTheme = ThemeFileSchema.parse({
    schemaVersion: THEME_SCHEMA_VERSION,
    contract: THEME_CONTRACT_ID,
    themeId: `original.${template.manifest.source.host.replace(/[^a-z0-9.-]/gi, "-").toLowerCase()}`,
    name: `Original — ${template.manifest.source.host}`,
    metadata: {
      mode: canvasParsed !== undefined && relativeLuminance(canvasParsed) < 0.5 ? "dark" : "light",
      supports: ["palette", "decoration"],
      description: "Extracted original theme — applying it must be a browser-observable no-op.",
    },
    tokens: Object.fromEntries(
      Object.entries(tokens).map(([token, entry]) => [token, entry.originalValue]),
    ),
    provenance: "extracted-original",
    libraryPromotion: "export-candidate",
    sourceTemplateId: template.manifest.templateId,
  });

  return { adapter, originalTheme, stylesheet, census, assignments: context.assignments };
}
