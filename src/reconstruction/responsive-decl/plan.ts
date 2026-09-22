/**
 * Piecewise node × property planner for the width family
 * (Responsive Core P0, contract §C2.2 / §C2.3). PURE, deterministic, no browser.
 *
 * For ONE node × ONE physical property over ONE served tree interval:
 *   1. candidates = authored sheet declarations (`authoredLayout`, incl. shorthands and
 *      logical `margin-inline*` mapped to physical longhands when direction is ltr) +
 *      element-attached declarations (`inlineStyle`, admitted per its provenance class);
 *   2. the served interval is partitioned at every candidate media edge (definite and
 *      possible), so relevance is constant inside each sub-interval;
 *   3. the Cascade 5 winner is resolved per sub-interval (`resolveCascade`);
 *   4. sub-intervals with no author declaration get the property's initial value, except
 *      replaced elements (width/min/max → ambiguous) and UA/presentational margins
 *      (frozen truth value when no author declaration applies at truth);
 *   5. adjacent sub-intervals with the same outcome are merged.
 *
 * `var()` values are passed through verbatim (resolution happens at integration).
 * Value ADMISSION (`authoredValueAdmissible`, `isSafeCssValue`) is the integrator's
 * call and can be injected through `admit`.
 */

import {
  MAX_MATCHED_RULES_PER_ELEMENT as OBSERVER_MAX_MATCHED_RULES_PER_ELEMENT,
  MAX_MATCHED_RULES_PER_PROPERTY as OBSERVER_MAX_MATCHED_RULES_PER_PROPERTY,
} from "../../observer/types.js";
import { compareCascade, resolveCascade } from "./cascade.js";
import {
  containsIntegerWidth,
  intervalContains,
  intervalEdges,
  isEmptyInterval,
  mediaToIntervals,
  partitionInterval,
} from "./intervals.js";
import type {
  AuthoredLayoutRuleLike,
  CascadeCandidate,
  CascadeResolution,
  DeclProvenance,
  Interval,
  MediaIntervals,
  PiecewisePlan,
  PlanPiece,
  ResponsiveDecl,
  ResponsiveDeclNode,
  ViewportIdLike,
  WidthFamilyProperty,
} from "./types.js";

export const WIDTH_FAMILY_PROPERTIES: readonly WidthFamilyProperty[] = [
  "width",
  "min-width",
  "max-width",
  "margin-left",
  "margin-right",
  "flex-basis",
];

/** CSS initial values of the width family. */
export const WIDTH_FAMILY_INITIAL_VALUES: Readonly<Record<WidthFamilyProperty, string>> = {
  width: "auto",
  "min-width": "auto",
  "max-width": "none",
  "margin-left": "0px",
  "margin-right": "0px",
  "flex-basis": "auto",
};

/**
 * Replaced / embedded / intrinsically sized elements: with no author declaration their
 * width comes from intrinsic size, attributes, or the UA sheet — not the initial value.
 * Contract §C2.3 list, plus `audio`, `meter`, `progress` (UA-sized form widgets).
 */
export const REPLACED_OR_INTRINSIC_TAGS: ReadonlySet<string> = new Set([
  "img",
  "video",
  "canvas",
  "iframe",
  "svg",
  "object",
  "embed",
  "input",
  "select",
  "textarea",
  "table",
  "td",
  "th",
  "audio",
  "meter",
  "progress",
]);

/** Elements whose UA stylesheet gives a non-zero inline margin. */
export const UA_INLINE_MARGIN_TAGS: ReadonlySet<string> = new Set([
  "body",
  "blockquote",
  "dd",
  "dialog",
  "fieldset",
  "figure",
  "hr",
  "input",
  "marquee",
]);

/**
 * Review fix (MINOR) — elements whose UA stylesheet sets inline margins to
 * `auto` (`hr`: `margin-inline: auto`; `dialog`: `margin: auto`). Their used px
 * at the truth width is a RESOLVED auto, never a constant: freezing it would
 * mis-centre the box at every other width, so a no-author piece is ambiguous.
 */
export const UA_AUTO_MARGIN_TAGS: ReadonlySet<string> = new Set(["hr", "dialog"]);

/** Contract §C1.5 observer caps — the observer's own constants, re-exported. */
export const MAX_MATCHED_RULES_PER_PROPERTY = OBSERVER_MAX_MATCHED_RULES_PER_PROPERTY;
export const MAX_MATCHED_RULES_PER_ELEMENT = OBSERVER_MAX_MATCHED_RULES_PER_ELEMENT;

export interface PlanNodePropertyInput {
  readonly node: ResponsiveDeclNode;
  readonly viewportId: ViewportIdLike;
  readonly property: WidthFamilyProperty;
  /** The tree's served interval, `[min, max)`. */
  readonly served: Interval;
  readonly pageId?: string;
  /** Computed `direction` at truth. Falls back to `truthComputed.direction`; unknown → logical props ambiguous. */
  readonly direction?: "ltr" | "rtl";
  /** Computed style at the truth capture (e.g. the node's style token), property → value. */
  readonly truthComputed?: Readonly<Record<string, string>>;
  /** Viewport width of the truth capture (decides "author declaration at truth"). */
  readonly truthViewportWidth?: number;
  /** Optional admission test for winning values: return `"ok"` or a refusal reason. */
  readonly admit?: (property: WidthFamilyProperty, value: string) => string;
  /** Merge adjacent pieces with the same outcome (default true). */
  readonly merge?: boolean;
}

export type PlanNodeWidthFamilyInput = Omit<PlanNodePropertyInput, "property">;

export interface WidthFamilyPlan {
  readonly ok: boolean;
  readonly plans: Readonly<Record<WidthFamilyProperty, PiecewisePlan>>;
  /** `<property>: <reason>` for every ambiguous property (sorted). */
  readonly reasons: string[];
}

// ---------------------------------------------------------------------------
// Value helpers
// ---------------------------------------------------------------------------

function splitTopLevelWhitespace(value: string): string[] {
  const out: string[] = [];
  let depth = 0;
  let buf = "";
  for (const ch of value.trim()) {
    if (ch === "(") depth++;
    else if (ch === ")") depth = Math.max(0, depth - 1);
    if (/\s/.test(ch) && depth === 0) {
      if (buf !== "") out.push(buf);
      buf = "";
      continue;
    }
    buf += ch;
  }
  if (buf !== "") out.push(buf);
  return out;
}

type Derived = { value: string } | { value: undefined; reason: string };

const VAR_RE = /\bvar\s*\(/i;
const CSS_WIDE_UNSAFE = new Set(["revert", "revert-layer"]);

function checkLonghandValue(raw: string): Derived {
  const value = raw.trim();
  if (value === "") return { value: undefined, reason: "empty-value" };
  if (CSS_WIDE_UNSAFE.has(value.toLowerCase())) return { value: undefined, reason: "css-wide-revert" };
  return { value };
}

function expandMargin(raw: string, side: "left" | "right"): Derived {
  if (VAR_RE.test(raw)) return { value: undefined, reason: "shorthand-pending-substitution" };
  const t = splitTopLevelWhitespace(raw);
  if (t.length === 1 && CSS_WIDE_UNSAFE.has(t[0]!.toLowerCase())) return { value: undefined, reason: "css-wide-revert" };
  if (t.length < 1 || t.length > 4) return { value: undefined, reason: "shorthand-unparsed" };
  const right = t[1] ?? t[0]!;
  const left = t[3] ?? right;
  return { value: side === "left" ? left : right };
}

function expandMarginInline(raw: string, edge: "start" | "end"): Derived {
  if (VAR_RE.test(raw)) return { value: undefined, reason: "shorthand-pending-substitution" };
  const t = splitTopLevelWhitespace(raw);
  if (t.length === 1 && CSS_WIDE_UNSAFE.has(t[0]!.toLowerCase())) return { value: undefined, reason: "css-wide-revert" };
  if (t.length < 1 || t.length > 2) return { value: undefined, reason: "shorthand-unparsed" };
  return { value: edge === "start" ? t[0]! : (t[1] ?? t[0]!) };
}

const UNITLESS_NUMBER = /^[+-]?(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?$/i;

function expandFlexBasis(raw: string): Derived {
  if (VAR_RE.test(raw)) return { value: undefined, reason: "shorthand-pending-substitution" };
  const t = splitTopLevelWhitespace(raw);
  if (t.length === 1) {
    const k = t[0]!.toLowerCase();
    if (k === "none" || k === "auto" || k === "initial") return { value: "auto" };
    if (k === "unset") return { value: "auto" };
    if (CSS_WIDE_UNSAFE.has(k) || k === "inherit") return { value: undefined, reason: "shorthand-css-wide-keyword" };
  }
  if (t.length < 1 || t.length > 3) return { value: undefined, reason: "shorthand-unparsed" };
  const numbers = t.filter((x) => UNITLESS_NUMBER.test(x));
  const others = t.filter((x) => !UNITLESS_NUMBER.test(x));
  if (others.length > 1 || numbers.length > 2) return { value: undefined, reason: "shorthand-unparsed" };
  // `flex: 1` / `flex: 1 1` → basis 0%; `flex: 0 0 200px` → 200px.
  return { value: others[0] ?? "0%" };
}

// ---------------------------------------------------------------------------
// Candidate construction
// ---------------------------------------------------------------------------

type SourceKind = "physical" | "logical";

interface PropertySources {
  /** Longhand record name → how it maps. */
  readonly longhands: ReadonlyArray<{ name: string; kind: SourceKind }>;
  /** Shorthand record name → expander (used only if no longhand it covers is in the block). */
  readonly shorthands: ReadonlyArray<{
    name: string;
    kind: SourceKind;
    covers: string;
    expand: (raw: string) => Derived;
  }>;
}

const SOURCES: Readonly<Record<WidthFamilyProperty, PropertySources>> = {
  width: { longhands: [{ name: "width", kind: "physical" }], shorthands: [] },
  "min-width": { longhands: [{ name: "min-width", kind: "physical" }], shorthands: [] },
  "max-width": { longhands: [{ name: "max-width", kind: "physical" }], shorthands: [] },
  "margin-left": {
    longhands: [
      { name: "margin-left", kind: "physical" },
      { name: "margin-inline-start", kind: "logical" },
    ],
    shorthands: [
      { name: "margin", kind: "physical", covers: "margin-left", expand: (r) => expandMargin(r, "left") },
      {
        name: "margin-inline",
        kind: "logical",
        covers: "margin-inline-start",
        expand: (r) => expandMarginInline(r, "start"),
      },
    ],
  },
  "margin-right": {
    longhands: [
      { name: "margin-right", kind: "physical" },
      { name: "margin-inline-end", kind: "logical" },
    ],
    shorthands: [
      { name: "margin", kind: "physical", covers: "margin-right", expand: (r) => expandMargin(r, "right") },
      {
        name: "margin-inline",
        kind: "logical",
        covers: "margin-inline-end",
        expand: (r) => expandMarginInline(r, "end"),
      },
    ],
  },
  "flex-basis": {
    longhands: [{ name: "flex-basis", kind: "physical" }],
    shorthands: [{ name: "flex", kind: "physical", covers: "flex-basis", expand: expandFlexBasis }],
  },
};

/** Every recorded property name that can contribute to `property`. */
export function contributingRecordNames(property: WidthFamilyProperty): string[] {
  const s = SOURCES[property];
  return [...s.longhands.map((l) => l.name), ...s.shorthands.map((x) => x.name)];
}

function toSpecificity(
  s: AuthoredLayoutRuleLike["specificity"],
): readonly [number, number, number] | undefined {
  if (s === undefined || s.length !== 3) return undefined;
  const [a, b, c] = s as readonly number[];
  if (![a, b, c].every((n) => typeof n === "number" && Number.isFinite(n))) return undefined;
  return [a!, b!, c!];
}

interface RuleBlock {
  readonly records: ReadonlyArray<{ rule: AuthoredLayoutRuleLike; index: number }>;
}

/**
 * Group records into declaration blocks (one CSS rule). With §C1.5 metadata the rule is
 * identified by `ruleOrder`; old artifacts fall back to consecutive runs sharing
 * selector + conditions with no repeated property (the collector emits one rule's
 * declarations consecutively). Grouping is used ONLY to drop a shorthand record that
 * duplicates a longhand of the same declaration — never to order anything.
 */
function groupBlocks(rules: readonly AuthoredLayoutRuleLike[]): RuleBlock[] {
  const blocks: Array<Array<{ rule: AuthoredLayoutRuleLike; index: number }>> = [];
  const byRuleOrder = new Map<string, Array<{ rule: AuthoredLayoutRuleLike; index: number }>>();
  let run: Array<{ rule: AuthoredLayoutRuleLike; index: number }> | undefined;
  const ctxKey = (r: AuthoredLayoutRuleLike): string =>
    JSON.stringify([r.selector ?? "", r.media ?? "", r.supports ?? "", r.container ?? "", r.layer ?? "", r.origin ?? ""]);
  rules.forEach((rule, index) => {
    if (rule.ruleOrder !== undefined) {
      run = undefined;
      const key = `${rule.sheetIndex ?? ""}#${rule.ruleOrder}#${ctxKey(rule)}`;
      let block = byRuleOrder.get(key);
      if (block === undefined) {
        block = [];
        byRuleOrder.set(key, block);
        blocks.push(block);
      }
      block.push({ rule, index });
      return;
    }
    const prev = run?.[run.length - 1];
    if (
      run !== undefined &&
      prev !== undefined &&
      prev.rule.ruleOrder === undefined &&
      ctxKey(prev.rule) === ctxKey(rule) &&
      !run.some((x) => x.rule.property === rule.property)
    ) {
      run.push({ rule, index });
    } else {
      run = [{ rule, index }];
      blocks.push(run);
    }
  });
  return blocks.map((records) => ({ records }));
}

interface CandidateContext {
  readonly directionLtr: boolean;
  readonly mediaCache: Map<string, MediaIntervals>;
}

function mediaFor(ctx: CandidateContext, media: string | undefined): MediaIntervals | undefined {
  if (media === undefined || media.trim() === "") return undefined;
  let m = ctx.mediaCache.get(media);
  if (m === undefined) {
    m = mediaToIntervals(media);
    ctx.mediaCache.set(media, m);
  }
  return m;
}

function sheetCandidate(
  property: WidthFamilyProperty,
  rule: AuthoredLayoutRuleLike,
  index: number,
  kind: SourceKind,
  derived: Derived,
  ctx: CandidateContext,
): CascadeCandidate {
  const specificity = toSpecificity(rule.specificity);
  const mediaIntervals = mediaFor(ctx, rule.media);
  return {
    id: `sheet#${index}:${rule.property}`,
    property,
    value: derived.value,
    ...(derived.value === undefined ? { valueUnknownReason: derived.reason } : {}),
    important: rule.important === true,
    inline: false,
    provenance: "authored-sheet",
    ...(rule.media !== undefined ? { media: rule.media } : {}),
    ...(mediaIntervals !== undefined ? { mediaIntervals } : {}),
    ...(rule.supports !== undefined ? { supports: rule.supports } : {}),
    ...(rule.supportsMatches !== undefined ? { supportsMatches: rule.supportsMatches } : {}),
    ...(rule.container !== undefined ? { container: rule.container } : {}),
    ...(rule.layer !== undefined ? { layer: rule.layer } : {}),
    ...(rule.layerOrder !== undefined ? { layerOrder: rule.layerOrder } : {}),
    ...(specificity !== undefined ? { specificity } : {}),
    ...(rule.ruleOrder !== undefined ? { ruleOrder: rule.ruleOrder } : {}),
    ...(rule.sheetIndex !== undefined ? { sheetIndex: rule.sheetIndex } : {}),
    ...(rule.origin !== undefined ? { origin: rule.origin } : {}),
    ...(rule.selector !== undefined ? { selector: rule.selector } : {}),
    ...(kind === "logical" && !ctx.directionLtr
      ? { relevanceUnknownReason: "logical-direction-not-ltr" }
      : {}),
  };
}

/** Authored sheet candidates for one physical property. */
export function sheetCandidatesFor(
  node: ResponsiveDeclNode,
  property: WidthFamilyProperty,
  ctx: CandidateContext,
): CascadeCandidate[] {
  const sources = SOURCES[property];
  const out: CascadeCandidate[] = [];
  for (const block of groupBlocks(node.authoredLayout ?? [])) {
    const names = new Set(block.records.map((r) => r.rule.property));
    for (const { rule, index } of block.records) {
      const longhand = sources.longhands.find((l) => l.name === rule.property);
      if (longhand !== undefined) {
        out.push(sheetCandidate(property, rule, index, longhand.kind, checkLonghandValue(rule.value), ctx));
        continue;
      }
      const shorthand = sources.shorthands.find((s) => s.name === rule.property);
      if (shorthand !== undefined && !names.has(shorthand.covers)) {
        out.push(sheetCandidate(property, rule, index, shorthand.kind, shorthand.expand(rule.value), ctx));
      }
    }
  }
  return out;
}

/** Element-attached candidates, admitted per inline provenance class (§C2.2). */
export function inlineCandidatesFor(
  node: ResponsiveDeclNode,
  property: WidthFamilyProperty,
  ctx: CandidateContext,
): CascadeCandidate[] {
  const inline = node.inlineStyle;
  const prov = node.inlineStyleProvenance;
  const sources = SOURCES[property];
  const out: CascadeCandidate[] = [];
  const seen = new Set<string>();

  const mapName = (name: string): { kind: SourceKind; expand?: (raw: string) => Derived } | undefined => {
    const l = sources.longhands.find((x) => x.name === name);
    if (l !== undefined) return { kind: l.kind };
    const s = sources.shorthands.find((x) => x.name === name);
    if (s !== undefined) return { kind: s.kind, expand: s.expand };
    return undefined;
  };

  const classify = (
    name: string,
    runtimeDerived: Derived,
  ): { derived: Derived; provenance: DeclProvenance } => {
    if (prov === undefined) {
      return { derived: { value: undefined, reason: "inline-provenance-absent" }, provenance: "runtime-inline" };
    }
    const entry = prov.byProperty[name];
    if (entry === undefined) {
      return { derived: { value: undefined, reason: "inline-provenance-absent" }, provenance: "runtime-inline" };
    }
    /*
     * REC-I2 — no per-width `style` evidence means "does not vary with width" is
     * UNPROVEN for every class (the observer then reports `unknown`). Never
     * guessed: the declaration stays a candidate that can only make a decision
     * ambiguous. `runtime-responsive` keeps its own, more specific reason.
     */
    if (prov.widthEvidence === "absent" && entry.class !== "runtime-responsive") {
      return { derived: { value: undefined, reason: "inline-width-evidence-absent" }, provenance: "runtime-inline" };
    }
    switch (entry.class) {
      case "runtime-responsive":
        return { derived: { value: undefined, reason: "inline-runtime-responsive" }, provenance: "runtime-inline" };
      case "unknown":
        return entry.variesAcrossWidths
          ? { derived: { value: undefined, reason: "inline-unknown-varying" }, provenance: "runtime-inline" }
          : { derived: runtimeDerived, provenance: "runtime-inline" };
      case "initial-static":
        return { derived: runtimeDerived, provenance: "authored-inline" };
      case "initial-mutated":
        // Browser truth: the runtime value, element-attached.
        return { derived: runtimeDerived, provenance: "runtime-inline" };
      case "runtime-added":
        return entry.variesAcrossWidths
          ? { derived: { value: undefined, reason: "inline-runtime-responsive" }, provenance: "runtime-inline" }
          : { derived: runtimeDerived, provenance: "runtime-inline" };
      default:
        return { derived: { value: undefined, reason: "inline-provenance-unrecognized" }, provenance: "runtime-inline" };
    }
  };

  const push = (
    name: string,
    order: number,
    important: boolean,
    derived: Derived,
    provenance: DeclProvenance,
    kind: SourceKind,
  ): void => {
    out.push({
      id: `inline#${order}:${name}`,
      property,
      value: derived.value,
      ...(derived.value === undefined ? { valueUnknownReason: derived.reason } : {}),
      important,
      inline: true,
      provenance,
      ruleOrder: order,
      ...(kind === "logical" && !ctx.directionLtr ? { relevanceUnknownReason: "logical-direction-not-ltr" } : {}),
    });
  };

  const decls = inline?.decls ?? [];
  const declNames = new Set(decls.map((d) => d.property));
  decls.forEach((d, i) => {
    const mapping = mapName(d.property);
    if (mapping === undefined) return;
    if (mapping.expand !== undefined) {
      const covers = sources.shorthands.find((s) => s.name === d.property)?.covers;
      if (covers !== undefined && declNames.has(covers)) return; // duplicate of a longhand
    }
    seen.add(d.property);
    const runtime = mapping.expand !== undefined ? mapping.expand(d.value) : checkLonghandValue(d.value);
    const { derived, provenance } = classify(d.property, runtime);
    push(d.property, i, d.important === true, derived, provenance, mapping.kind);
  });

  // REC-I2 — the observer cut the style attribute's declarations (§C1.2 cap): a
  // declaration of this property may have been among the ones dropped.
  if (inline?.truncated === true && !sources.longhands.some((l) => seen.has(l.name)) && !sources.shorthands.some((x) => seen.has(x.name))) {
    push(
      `${property}(truncated)`,
      decls.length,
      false,
      { value: undefined, reason: "inline-style-truncated" },
      "runtime-inline",
      "physical",
    );
  }

  // A property that varies across widths but is absent from the truth capture is still
  // evidence of a runtime-responsive inline value: keep it as an undecidable candidate.
  if (prov !== undefined) {
    const extra = Object.keys(prov.byProperty).sort();
    extra.forEach((name, j) => {
      if (seen.has(name)) return;
      const mapping = mapName(name);
      if (mapping === undefined) return;
      const entry = prov.byProperty[name]!;
      const varying =
        entry.class === "runtime-responsive" || (entry.variesAcrossWidths && entry.class !== "initial-static");
      if (!varying) return;
      push(
        name,
        decls.length + j,
        false,
        { value: undefined, reason: "inline-runtime-responsive" },
        "runtime-inline",
        mapping.kind,
      );
    });
  }
  return out;
}

// ---------------------------------------------------------------------------
// Truncation guard (§C1.5 cap semantics)
// ---------------------------------------------------------------------------

type TruncationGuard =
  | { mode: "none" }
  | { mode: "unsafe"; reason: string }
  | { mode: "floors"; floors: CascadeCandidate[] };

function truncationGuard(
  node: ResponsiveDeclNode,
  property: WidthFamilyProperty,
  ctx: CandidateContext,
): TruncationGuard {
  if (node.authoredLayoutTruncated !== true) return { mode: "none" };
  const rules = node.authoredLayout ?? [];
  // Old collector: truncation in source order drops LATER (higher-precedence) rules.
  if (!rules.some((r) => r.ruleOrder !== undefined)) {
    return { mode: "unsafe", reason: "authored-layout-truncated-source-order" };
  }
  if (rules.length >= MAX_MATCHED_RULES_PER_ELEMENT) {
    return { mode: "unsafe", reason: "authored-layout-truncated-element-cap" };
  }
  const floors: CascadeCandidate[] = [];
  for (const name of contributingRecordNames(property)) {
    const kept = rules
      .map((rule, index) => ({ rule, index }))
      .filter((x) => x.rule.property === name);
    if (kept.length < MAX_MATCHED_RULES_PER_PROPERTY) continue;
    const cands = kept.map((x) => sheetCandidate(property, x.rule, x.index, "physical", { value: x.rule.value }, ctx));
    const floor = cands.find((f) => cands.every((o) => o === f || compareCascade(o, f).result === 1));
    if (floor === undefined) return { mode: "unsafe", reason: "authored-layout-truncated-floor-unknown" };
    floors.push(floor);
  }
  return floors.length === 0 ? { mode: "none" } : { mode: "floors", floors };
}

function guardAllows(guard: TruncationGuard, resolution: CascadeResolution): string | undefined {
  if (guard.mode === "none") return undefined;
  if (guard.mode === "unsafe") return guard.reason;
  if (resolution.status !== "resolved") return "authored-layout-truncated";
  for (const w of resolution.possibleWinners) {
    for (const f of guard.floors) {
      if (w.id === f.id) continue;
      if (compareCascade(w, f).result !== 1) return "authored-layout-truncated";
    }
  }
  return undefined;
}

// ---------------------------------------------------------------------------
// Planner
// ---------------------------------------------------------------------------

function sourceConditionOf(c: CascadeCandidate): string | undefined {
  if (c.inline) return "style-attribute";
  const parts: string[] = [];
  if (c.media !== undefined && c.media.trim() !== "") parts.push(`@media ${c.media}`);
  if (c.supports !== undefined && c.supports.trim() !== "") parts.push(`@supports ${c.supports}`);
  if (c.container !== undefined && c.container.trim() !== "") parts.push(`@container ${c.container}`);
  // Evidence TEXT only. An observer layer name may be a provenance string such as
  // `(anonymous-2)`, which is not a CSS identifier: never spelled as an at-rule.
  if (c.layer !== undefined && c.layer !== "") parts.push(`layer ${JSON.stringify(c.layer)}`);
  return parts.length > 0 ? parts.join(" ") : undefined;
}

const PX_RE = /^([+-]?(?:\d+\.?\d*|\.\d+))px$/i;

function normalizeValue(v: string): string {
  return v.replace(/\s+/g, " ").trim();
}

type RawPiece =
  | { kind: "winner"; interval: Interval; decl: ResponsiveDecl; tie: boolean }
  | { kind: "no-author-declaration"; interval: Interval; frozen?: ResponsiveDecl }
  | { kind: "ambiguous"; interval: Interval; reasons: string[] };

export function planNodeProperty(input: PlanNodePropertyInput): PiecewisePlan {
  const { node, viewportId, property, served } = input;
  const pageId = input.pageId ?? "";
  const tag = node.tagName.toLowerCase();
  const direction = input.direction ?? input.truthComputed?.["direction"];
  const writingMode = input.truthComputed?.["writing-mode"];
  const ctx: CandidateContext = {
    directionLtr: direction === "ltr" && (writingMode === undefined || writingMode === "horizontal-tb"),
    mediaCache: new Map(),
  };

  const sheet = sheetCandidatesFor(node, property, ctx);
  const inline = inlineCandidatesFor(node, property, ctx);
  const candidates = [...sheet, ...inline];

  const sheetWithSpec = sheet.filter((c) => c.specificity !== undefined && c.ruleOrder !== undefined).length;
  const sheetWithAny = sheet.filter((c) => c.specificity !== undefined || c.ruleOrder !== undefined).length;
  const edgeSet: Interval[] = [];
  for (const c of sheet) {
    if (c.mediaIntervals !== undefined) edgeSet.push(...c.mediaIntervals.intervals, ...c.mediaIntervals.possible);
  }
  const edges = intervalEdges(edgeSet).filter((e) => e > served.min && e < served.max);
  const evidence: PiecewisePlan["evidence"] = {
    sheetCandidates: sheet.length,
    inlineCandidates: inline.length,
    cascadeMetadata:
      sheet.length === 0
        ? "no-sheet-candidates"
        : sheetWithSpec === sheet.length
          ? "complete"
          : sheetWithAny === 0
            ? "absent"
            : "partial",
    inlineStyle: node.inlineStyle !== undefined ? "present" : "absent-or-not-captured",
    edges,
  };

  if (isEmptyInterval(served) || served.min < 0) {
    return {
      pageId,
      viewportId,
      nodeId: node.nodeId,
      property,
      served,
      status: "ambiguous",
      pieces: [],
      reasons: ["served-interval-invalid"],
      evidence,
    };
  }

  const guard = truncationGuard(node, property, ctx);
  const subs = partitionInterval(served, edges);

  const resolveAt = (w: number): CascadeResolution => resolveCascade(candidates, w);

  // Author declaration at truth? (decides the UA-margin frozen fallback)
  let authorAtTruth: boolean | "unknown" = "unknown";
  if (input.truthViewportWidth !== undefined && intervalContains(served, input.truthViewportWidth)) {
    authorAtTruth = resolveAt(input.truthViewportWidth).status !== "no-author-declaration";
  }

  const resolutions = subs.map((sub) => ({ sub, res: resolveAt(sub.min) }));
  if (authorAtTruth === "unknown" && resolutions.every((r) => r.res.status === "no-author-declaration")) {
    // No author declaration anywhere in the served interval → none at truth either.
    authorAtTruth = false;
  }

  const raw: RawPiece[] = [];
  for (const { sub, res } of resolutions) {
    const guardReason = guardAllows(guard, res);
    if (res.status === "ambiguous") {
      raw.push({ kind: "ambiguous", interval: sub, reasons: res.reasons });
      continue;
    }
    if (guardReason !== undefined) {
      raw.push({ kind: "ambiguous", interval: sub, reasons: [guardReason] });
      continue;
    }
    if (res.status === "resolved") {
      const w = res.winner!;
      const value = w.value!.trim();
      if (input.admit !== undefined) {
        const verdict = input.admit(property, value);
        if (verdict !== "ok") {
          raw.push({ kind: "ambiguous", interval: sub, reasons: [`inadmissible:${verdict}`] });
          continue;
        }
      }
      const sourceCondition = sourceConditionOf(w);
      raw.push({
        kind: "winner",
        interval: sub,
        tie: res.tieSameValue === true,
        decl: {
          pageId,
          viewportId,
          nodeId: node.nodeId,
          property,
          value,
          interval: sub,
          ...(sourceCondition !== undefined ? { sourceCondition } : {}),
          provenance: w.provenance,
          cascade: {
            important: w.important,
            ...(w.layerOrder !== undefined ? { layerOrder: w.layerOrder } : {}),
            ...(w.specificity !== undefined
              ? { specificity: [w.specificity[0], w.specificity[1], w.specificity[2]] as [number, number, number] }
              : {}),
            ...(w.ruleOrder !== undefined ? { ruleOrder: w.ruleOrder } : {}),
            ...(w.inline ? { inline: true } : {}),
          },
          verifiedAt: [],
        },
      });
      continue;
    }
    raw.push(noAuthorPiece(input, tag, sub, pageId, authorAtTruth));
  }

  const pieces = finalizePieces(raw, input.merge !== false, WIDTH_FAMILY_INITIAL_VALUES[property]);
  const reasons = [
    ...new Set(pieces.flatMap((p) => (p.kind === "ambiguous" ? p.reasons : []))),
  ].sort();
  return {
    pageId,
    viewportId,
    nodeId: node.nodeId,
    property,
    served,
    status: reasons.length > 0 ? "ambiguous" : "ok",
    pieces,
    reasons,
    evidence,
  };
}

function noAuthorPiece(
  input: PlanNodePropertyInput,
  tag: string,
  sub: Interval,
  pageId: string,
  authorAtTruth: boolean | "unknown",
): RawPiece {
  const { property, node } = input;
  const attrs = node.attributes ?? {};
  if (property === "width" || property === "min-width" || property === "max-width") {
    if (REPLACED_OR_INTRINSIC_TAGS.has(tag)) {
      /*
       * REC-I2 refinement of §C2.3 (reported deviation). For `min-width` /
       * `max-width` the only non-author source of a value is the UA sheet, whose
       * declarations carry no width condition. When NO author declaration applies
       * at the truth width and the truth computed value IS the initial value, that
       * value is proven for every width of the sub-interval. `width` stays
       * ambiguous (intrinsic size / presentational attributes).
       */
      if (property !== "width" && authorAtTruth === false) {
        const truthRaw = input.truthComputed?.[property]?.trim().toLowerCase();
        const initialForms = property === "min-width" ? ["auto", "0px", "0"] : ["none"];
        if (truthRaw !== undefined && initialForms.includes(truthRaw)) {
          return { kind: "no-author-declaration", interval: sub };
        }
      }
      return { kind: "ambiguous", interval: sub, reasons: ["replaced-element-no-author-declaration"] };
    }
    if (property === "width" && attrs["width"] !== undefined) {
      return { kind: "ambiguous", interval: sub, reasons: ["presentational-width-attribute"] };
    }
    return { kind: "no-author-declaration", interval: sub };
  }
  if (property === "margin-left" || property === "margin-right") {
    if (attrs["align"] !== undefined || attrs["hspace"] !== undefined) {
      return { kind: "ambiguous", interval: sub, reasons: ["presentational-margin-attribute"] };
    }
    if (UA_AUTO_MARGIN_TAGS.has(tag)) {
      return { kind: "ambiguous", interval: sub, reasons: ["ua-auto-margin"] };
    }
    const truthRaw = input.truthComputed?.[property];
    const uaTag = UA_INLINE_MARGIN_TAGS.has(tag);
    if (truthRaw === undefined) {
      return uaTag
        ? { kind: "ambiguous", interval: sub, reasons: ["ua-margin-truth-computed-absent"] }
        : { kind: "no-author-declaration", interval: sub };
    }
    const m = PX_RE.exec(truthRaw.trim());
    if (m === null) return { kind: "ambiguous", interval: sub, reasons: ["truth-margin-unparsed"] };
    const px = Number(m[1]);
    if (authorAtTruth === false) {
      if (px === 0) return { kind: "no-author-declaration", interval: sub };
      return {
        kind: "no-author-declaration",
        interval: sub,
        frozen: {
          pageId,
          viewportId: input.viewportId,
          nodeId: node.nodeId,
          property,
          value: truthRaw.trim(),
          interval: sub,
          provenance: "frozen",
          verifiedAt: [],
        },
      };
    }
    if (authorAtTruth === true) {
      return uaTag
        ? { kind: "ambiguous", interval: sub, reasons: ["ua-margin-masked-by-author-at-truth"] }
        : { kind: "no-author-declaration", interval: sub };
    }
    return uaTag || px !== 0
      ? { kind: "ambiguous", interval: sub, reasons: ["ua-margin-truth-width-unknown"] }
      : { kind: "no-author-declaration", interval: sub };
  }
  return { kind: "no-author-declaration", interval: sub };
}

function samePiece(a: RawPiece, b: RawPiece): boolean {
  if (a.kind !== b.kind) return false;
  if (a.kind === "winner" && b.kind === "winner") {
    return (
      normalizeValue(a.decl.value) === normalizeValue(b.decl.value) &&
      a.decl.provenance === b.decl.provenance &&
      a.decl.cascade?.important === b.decl.cascade?.important &&
      a.decl.cascade?.inline === b.decl.cascade?.inline
    );
  }
  if (a.kind === "no-author-declaration" && b.kind === "no-author-declaration") {
    return (a.frozen?.value ?? "") === (b.frozen?.value ?? "");
  }
  if (a.kind === "ambiguous" && b.kind === "ambiguous") {
    return a.reasons.join("\n") === b.reasons.join("\n");
  }
  return false;
}

function finalizePieces(raw: readonly RawPiece[], merge: boolean, initialValue: string): PlanPiece[] {
  const groups: RawPiece[][] = [];
  for (const p of raw) {
    const last = groups[groups.length - 1];
    if (merge && last !== undefined && samePiece(last[0]!, p) && last[last.length - 1]!.interval.max === p.interval.min) {
      last.push(p);
    } else {
      groups.push([p]);
    }
  }
  return groups.map((g): PlanPiece => {
    const first = g[0]!;
    const interval: Interval = { min: first.interval.min, max: g[g.length - 1]!.interval.max };
    const common = { interval, containsIntegerWidth: containsIntegerWidth(interval), mergedFrom: g.length };
    if (first.kind === "winner") {
      const conditions = [
        ...new Set(g.map((p) => (p.kind === "winner" ? p.decl.sourceCondition : undefined)).filter((x): x is string => x !== undefined)),
      ];
      const { sourceCondition: _drop, ...rest } = first.decl;
      const decl: ResponsiveDecl = {
        ...rest,
        interval,
        ...(conditions.length > 0 ? { sourceCondition: conditions.join(" | ") } : {}),
      };
      const tie = g.some((p) => p.kind === "winner" && p.tie);
      return {
        kind: "winner",
        ...common,
        decl,
        usesVar: /\bvar\s*\(/i.test(decl.value),
        ...(tie ? { tieSameValue: true } : {}),
      };
    }
    if (first.kind === "no-author-declaration") {
      return {
        kind: "no-author-declaration",
        ...common,
        initialValue,
        ...(first.frozen !== undefined ? { frozen: { ...first.frozen, interval } } : {}),
      };
    }
    return { kind: "ambiguous", ...common, reasons: first.reasons };
  });
}

/** Plan all six width-family properties; `ok` only if every one is unambiguous over `served`. */
export function planNodeWidthFamily(input: PlanNodeWidthFamilyInput): WidthFamilyPlan {
  const plans = {} as Record<WidthFamilyProperty, PiecewisePlan>;
  const reasons: string[] = [];
  for (const property of WIDTH_FAMILY_PROPERTIES) {
    const plan = planNodeProperty({ ...input, property });
    plans[property] = plan;
    for (const r of plan.reasons) reasons.push(`${property}: ${r}`);
  }
  return { ok: reasons.length === 0, plans, reasons: [...new Set(reasons)].sort() };
}

/** The piece covering `width`, if `width` is inside the plan's served interval. */
export function pieceAt(plan: PiecewisePlan, width: number): PlanPiece | undefined {
  return plan.pieces.find((p) => intervalContains(p.interval, width));
}
