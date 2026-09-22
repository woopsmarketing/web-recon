import { parse, type DefaultTreeAdapterTypes } from "parse5";
import {
  ATTR_MAX_LEN,
  SKIP_TAGS,
  TEXT_MAX_LEN,
  type InlineStyle,
  type InlineStyleCorrespondence,
  type InlineStyleProvenance,
  type InlineStyleProvenanceClass,
  type InlineStyleProvenanceCounts,
  type InlineStylePropertyProvenance,
} from "./types.js";
import { CSS_ALIASES, CSS_LONGHANDS, CSS_SHORTHANDS } from "./css-property-table.js";

/* ---------------------------------------------------------------------------
 * Responsive Core P0 §C1.4 — INITIAL ↔ RUNTIME INLINE-STYLE PROVENANCE.
 * ---------------------------------------------------------------------------
 *
 * PURE. No browser, no filesystem. Inputs:
 *   - the main-document response as served (`document-response.html`), parsed
 *     with parse5 — the same HTML5 tree construction the browser ran before any
 *     script;
 *   - the runtime element records (`dom.json`: tag, parent chain, attributes,
 *     direct text, `inlineStyle`);
 *   - optionally, each element's per-probe-width `style` attribute text (the
 *     probe `s` arrays resolved through `inlineStyleTable`).
 *
 * CORRESPONDENCE. An element's structural path is its element-child index path
 * from `<html>`, derived from the RUNTIME element's own parent chain in
 * `dom.json` (the observer walk skips {@link SKIP_TAGS} subtrees and nothing
 * else among element children), resolved in the parsed initial document under
 * the same skip set. The node found there must have the same tag AND be
 * corroborated by at least one signal: equal `id` (unique in the initial
 * document), class-token Jaccard ≥ 0.5, identical `src`/`href`, or — extension
 * over the contract list, reported, POSITIVE-ONLY — identical normalized
 * `style` attribute text or identical non-empty direct text. Every signal but
 * the unique id must also be UNIQUE among the node's same-tag initial siblings
 * (a row of look-alike cards corroborates nothing → `ambiguous`,
 * `sibling-lookalike`), and a unique initial id that DISAGREES with the runtime
 * id is `no-initial-node` (`id-conflict`) whatever the classes say. A path that
 * does not resolve, or id/class/src/href signals that exist on both sides and
 * all disagree, is `no-initial-node`; a resolved same-tag node with no
 * comparable id/class/src/href signal and no positive style/text equality is
 * `ambiguous`.
 * Nothing is ever matched by guess.
 *
 * CLASSIFICATION, per runtime inline declaration, in precedence order. The
 * rule is NEVER GUESS: anything not proven equal / different is `unknown`,
 * with a short `unknownReason` (tallied in `counts.unknownReasons`).
 *   1. the probe's end-of-run re-measurement of its first width saw the
 *      property (or a relative) change at the SAME width → `unknown`
 *      (`time-varying`) — a carousel is not a breakpoint;
 *   2. `runtime-responsive` — the probe saw the property (or a shorthand /
 *      longhand relative of it) take different `style` values across widths;
 *   3. no per-width evidence for the element → `unknown` (not varying is then
 *      unproven);
 *   4. correspondence not `matched` → `unknown`;
 *   5. the initial `style` attribute, read against the Chromium property table
 *      (css-property-table.ts):
 *      - declares the longhand directly (or through an alias, or a box
 *        shorthand expanded exactly) and the two values are PROVEN equal after
 *        exact normalization (whitespace, keyword case, `0`≡`0px`, identical
 *        number+unit) → `initial-static`; PROVEN different (different numbers in
 *        one unit, different plain keywords, different `!important`) →
 *        `initial-mutated`; anything else (colors `#fff` vs `rgb()`, functions,
 *        calc/url formatting, unit conversion, token-count changes) → `unknown`;
 *      - holds ANY declaration that is, or could expand to, the longhand but
 *        cannot be compared (a non-box shorthand, `var()` in a shorthand, a
 *        logical↔physical counterpart, an unrecognized property name, `all`)
 *        → `unknown`;
 *      - holds nothing that could produce it → `runtime-added`.
 * ------------------------------------------------------------------------- */

type P5Node = DefaultTreeAdapterTypes.Node;
type P5Element = DefaultTreeAdapterTypes.Element;

const SKIP = new Set(SKIP_TAGS.map((tag) => tag.toLowerCase()));

/** Minimal runtime element shape the module needs (a `dom.json` record fits). */
export interface ProvenanceElementInput {
  id: string;
  parentId?: string;
  tagName: string;
  attributes: Record<string, string>;
  text?: string;
  inlineStyle?: InlineStyle;
}

export interface InlineProvenanceInput {
  elements: readonly ProvenanceElementInput[];
  /** Decoded initial document text; `undefined` = no initial document. */
  initialHtml: string | undefined;
  /**
   * Element id → the element's normalized `style` attribute text at each probe
   * width (`null` = none at that width). Absent entry = no per-width evidence.
   */
  widthStyles?: ReadonlyMap<string, readonly (string | null)[]>;
  /**
   * Element id → the element's normalized `style` text when the probe
   * RE-MEASURED its first width at the end of the run (`null` = none). A
   * property whose text differs from `widthStyles[0]` changed at one width over
   * time → `unknown` (`time-varying`). Absent = no re-measurement evidence.
   */
  recheckStyles?: ReadonlyMap<string, string | null>;
}

export interface InlineProvenanceResult {
  byElementId: Map<string, InlineStyleProvenance>;
  counts: InlineStyleProvenanceCounts;
}

function isElement(node: P5Node): node is P5Element {
  return (node as P5Element).tagName !== undefined && "childNodes" in node;
}

function elementChildren(node: P5Element | DefaultTreeAdapterTypes.Document): P5Element[] {
  const out: P5Element[] = [];
  for (const child of node.childNodes) {
    if (!isElement(child)) continue;
    if (SKIP.has(child.tagName.toLowerCase())) continue;
    out.push(child);
  }
  return out;
}

function attr(node: P5Element, name: string): string | undefined {
  for (const a of node.attrs) if (a.name === name) return a.value;
  return undefined;
}

function normalizeSpace(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

function directText(node: P5Element): string {
  let text = "";
  for (const child of node.childNodes) {
    if (child.nodeName === "#text") text += (child as DefaultTreeAdapterTypes.TextNode).value;
  }
  const normalized = normalizeSpace(text);
  return normalized.length > TEXT_MAX_LEN ? normalized.slice(0, TEXT_MAX_LEN) : normalized;
}

function capAttr(value: string | undefined): string | undefined {
  if (value === undefined) return undefined;
  return value.length > ATTR_MAX_LEN ? value.slice(0, ATTR_MAX_LEN) : value;
}

/** Split a `style` attribute into `property → { value, important }` (last wins). */
export function parseStyleText(
  text: string | null | undefined,
): Map<string, { value: string; important: boolean }> {
  const out = new Map<string, { value: string; important: boolean }>();
  if (text === null || text === undefined) return out;
  const parts: string[] = [];
  let depth = 0;
  let quote = "";
  let start = 0;
  for (let i = 0; i < text.length; i++) {
    const ch = text.charAt(i);
    if (quote !== "") {
      if (ch === "\\") i++;
      else if (ch === quote) quote = "";
      continue;
    }
    if (ch === '"' || ch === "'") quote = ch;
    else if (ch === "(") depth++;
    else if (ch === ")") depth = depth > 0 ? depth - 1 : 0;
    else if (ch === ";" && depth === 0) {
      parts.push(text.slice(start, i));
      start = i + 1;
    }
  }
  parts.push(text.slice(start));
  for (const part of parts) {
    const colon = part.indexOf(":");
    if (colon <= 0) continue;
    const rawName = part.slice(0, colon).trim();
    if (rawName === "") continue;
    const name = rawName.startsWith("--") ? rawName : rawName.toLowerCase();
    let value = part.slice(colon + 1).trim();
    let important = false;
    const bang = /!\s*important\s*$/i.exec(value);
    if (bang) {
      important = true;
      value = value.slice(0, bang.index).trim();
    }
    if (value === "") continue;
    out.set(name, { value, important });
  }
  return out;
}

/** Loose value equality: whitespace, case, and a bare `0` length. */
export function normalizeStyleValue(value: string): string {
  return normalizeSpace(value)
    .toLowerCase()
    .replace(/\s*,\s*/g, ", ")
    .replace(/\(\s+/g, "(")
    .replace(/\s+\)/g, ")")
    .replace(/(^|[\s(,])0(?=$|[\s),])/g, (_match, lead: string) => `${lead}0px`);
}

/*
 * Shorthand → longhands, for the properties where the relation matters to
 * layout evidence. Used two ways: to relate a runtime longhand to a varying
 * shorthand in the per-width texts, and to expand a box shorthand in the
 * initial `style` attribute.
 */
const BOX_SIDES = ["top", "right", "bottom", "left"] as const;
const SHORTHANDS: Record<string, readonly string[]> = {
  margin: BOX_SIDES.map((side) => `margin-${side}`),
  padding: BOX_SIDES.map((side) => `padding-${side}`),
  inset: BOX_SIDES,
  "border-width": BOX_SIDES.map((side) => `border-${side}-width`),
  "border-style": BOX_SIDES.map((side) => `border-${side}-style`),
  "border-color": BOX_SIDES.map((side) => `border-${side}-color`),
  "margin-inline": ["margin-inline-start", "margin-inline-end", "margin-left", "margin-right"],
  "margin-block": ["margin-block-start", "margin-block-end", "margin-top", "margin-bottom"],
  "padding-inline": ["padding-inline-start", "padding-inline-end", "padding-left", "padding-right"],
  "padding-block": ["padding-block-start", "padding-block-end", "padding-top", "padding-bottom"],
  "inset-inline": ["inset-inline-start", "inset-inline-end", "left", "right"],
  "inset-block": ["inset-block-start", "inset-block-end", "top", "bottom"],
  gap: ["row-gap", "column-gap"],
  overflow: ["overflow-x", "overflow-y"],
  flex: ["flex-grow", "flex-shrink", "flex-basis"],
  "flex-flow": ["flex-direction", "flex-wrap"],
  "place-items": ["align-items", "justify-items"],
  "place-content": ["align-content", "justify-content"],
  "place-self": ["align-self", "justify-self"],
  "grid-template": ["grid-template-rows", "grid-template-columns", "grid-template-areas"],
  grid: [
    "grid-template-rows",
    "grid-template-columns",
    "grid-template-areas",
    "grid-auto-rows",
    "grid-auto-columns",
    "grid-auto-flow",
  ],
  "grid-area": ["grid-row-start", "grid-column-start", "grid-row-end", "grid-column-end"],
  "grid-row": ["grid-row-start", "grid-row-end"],
  "grid-column": ["grid-column-start", "grid-column-end"],
  "border-radius": [
    "border-top-left-radius",
    "border-top-right-radius",
    "border-bottom-right-radius",
    "border-bottom-left-radius",
  ],
};

/** True when `a` and `b` can affect each other's value (same, shorthand, longhand). */
export function stylePropertiesRelated(a: string, b: string): boolean {
  if (a === b) return true;
  if (a.startsWith(b + "-") || b.startsWith(a + "-")) return true;
  if ((SHORTHANDS[a] ?? []).includes(b) || (SHORTHANDS[b] ?? []).includes(a)) return true;
  const ra = CSS_ALIASES.get(a) ?? a;
  const rb = CSS_ALIASES.get(b) ?? b;
  if (ra === rb) return true;
  if ((CSS_SHORTHANDS.get(ra) ?? []).includes(rb) || (CSS_SHORTHANDS.get(rb) ?? []).includes(ra)) {
    return true;
  }
  return false;
}

/** Top-level tokens: whitespace-separated, commas and `/` as their own tokens. */
function tokenizeValue(value: string): string[] {
  const tokens: string[] = [];
  let depth = 0;
  let quote = "";
  let current = "";
  const flush = (): void => {
    if (current !== "") tokens.push(current);
    current = "";
  };
  for (let i = 0; i < value.length; i++) {
    const ch = value.charAt(i);
    if (quote !== "") {
      current += ch;
      if (ch === "\\" && i + 1 < value.length) current += value.charAt(++i);
      else if (ch === quote) quote = "";
      continue;
    }
    if (ch === '"' || ch === "'") {
      quote = ch;
      current += ch;
    } else if (ch === "(") {
      depth++;
      current += ch;
    } else if (ch === ")") {
      depth = Math.max(0, depth - 1);
      current += ch;
    } else if (depth === 0 && /\s/.test(ch)) {
      flush();
    } else if (depth === 0 && (ch === "," || ch === "/")) {
      flush();
      tokens.push(ch);
    } else {
      current += ch;
    }
  }
  flush();
  return tokens;
}

/** 1–4 value box expansion (`margin: 0 auto` → top/right/bottom/left). */
function expandBox(value: string): string[] | undefined {
  const tokens = tokenizeValue(value);
  if (tokens.length < 1 || tokens.length > 4) return undefined;
  if (tokens.some((token) => token === "," || token === "/")) return undefined;
  const [t, r = t, b = t, l = r] = tokens as [string, string?, string?, string?];
  return [t, r!, b!, l!];
}

/** Box shorthands whose 1–4 value expansion is exact (sides in top/right/bottom/left order). */
const BOX_SHORTHANDS = new Set([
  "margin",
  "padding",
  "inset",
  "border-width",
  "border-style",
  "border-color",
]);

const SUBSTITUTION_RE = /\b(?:var|env|attr)\s*\(/i;
const NUMERIC_RE = /^([+-]?(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?)([a-z%]*)$/i;
const IDENT_RE = /^-?[a-z_][a-z0-9_-]*$/i;
const LENGTH_UNITS = new Set([
  "px", "em", "rem", "ex", "rex", "ch", "rch", "cap", "rcap", "ic", "ric", "lh", "rlh",
  "vw", "vh", "vi", "vb", "vmin", "vmax", "svw", "svh", "svi", "svb", "svmin", "svmax",
  "lvw", "lvh", "lvi", "lvb", "lvmin", "lvmax", "dvw", "dvh", "dvi", "dvb", "dvmin", "dvmax",
  "cqw", "cqh", "cqi", "cqb", "cqmin", "cqmax", "cm", "mm", "q", "in", "pt", "pc",
]);
/** Named colors that are the same color under two spellings. */
const COLOR_SYNONYMS = new Set([
  "gray", "grey", "darkgray", "darkgrey", "dimgray", "dimgrey", "lightgray", "lightgrey",
  "slategray", "slategrey", "darkslategray", "darkslategrey", "lightslategray",
  "lightslategrey", "aqua", "cyan", "fuchsia", "magenta",
]);
/** Keywords with a numeric equivalent (`bold` ≡ `700`). */
const NUMERIC_KEYWORDS = new Set(["normal", "bold", "bolder", "lighter"]);

export type StyleValueComparison =
  | { result: "equal" | "different" }
  | { result: "unknown"; reason: string };

function compareToken(a: string, b: string): StyleValueComparison {
  if (a === b) return { result: "equal" };
  if (/["']/.test(a + b) || /\burl\s*\(/i.test(a + b)) {
    return { result: "unknown", reason: "string-or-url-serialization" };
  }
  if (a.toLowerCase() === b.toLowerCase()) {
    // Keyword case is insignificant; case inside a function (e.g. a custom
    // ident argument) is not provable either way.
    return a.includes("(") || b.includes("(")
      ? { result: "unknown", reason: "function-serialization" }
      : { result: "equal" };
  }
  const na = NUMERIC_RE.exec(a);
  const nb = NUMERIC_RE.exec(b);
  if (na && nb) {
    const va = Number(na[1]);
    const vb = Number(nb[1]);
    const ua = na[2]!.toLowerCase();
    const ub = nb[2]!.toLowerCase();
    if (ua === ub) {
      if (va === vb) return { result: "equal" };
      // The CSSOM serializes at 6 significant digits.
      if (Math.abs(va - vb) <= 5e-6 * Math.max(Math.abs(va), Math.abs(vb))) {
        return { result: "unknown", reason: "numeric-precision" };
      }
      return { result: "different" };
    }
    if (
      va === 0 &&
      vb === 0 &&
      ((ua === "" && LENGTH_UNITS.has(ub)) || (ub === "" && LENGTH_UNITS.has(ua)))
    ) {
      return { result: "equal" };
    }
    return { result: "unknown", reason: "unit-conversion" };
  }
  const ia = IDENT_RE.test(a);
  const ib = IDENT_RE.test(b);
  if (ia && ib) {
    const la = a.toLowerCase();
    const lb = b.toLowerCase();
    if (la.startsWith("-") || lb.startsWith("-")) {
      return { result: "unknown", reason: "vendor-keyword" };
    }
    if (COLOR_SYNONYMS.has(la) && COLOR_SYNONYMS.has(lb)) {
      return { result: "unknown", reason: "color-keyword-synonym" };
    }
    return { result: "different" };
  }
  if ((ia && nb) || (ib && na)) {
    const keyword = (ia ? a : b).toLowerCase();
    if (NUMERIC_KEYWORDS.has(keyword) || keyword.startsWith("-")) {
      return { result: "unknown", reason: "keyword-numeric-equivalence" };
    }
    return { result: "different" };
  }
  if (a.startsWith("#") || b.startsWith("#")) {
    return { result: "unknown", reason: "color-serialization" };
  }
  return { result: "unknown", reason: "function-serialization" };
}

/**
 * EXACT value comparison of an initial declaration value against the CSSOM
 * runtime value. `equal` / `different` only when proven; otherwise `unknown`
 * with the reason. Exported for the smoke suite.
 */
export function compareStyleValues(initial: string, runtime: string): StyleValueComparison {
  const a = normalizeSpace(initial);
  const b = normalizeSpace(runtime);
  if (a === b) return { result: "equal" };
  if (SUBSTITUTION_RE.test(a) || SUBSTITUTION_RE.test(b)) {
    return { result: "unknown", reason: "pending-substitution" };
  }
  const ta = tokenizeValue(a);
  const tb = tokenizeValue(b);
  if (ta.length !== tb.length) return { result: "unknown", reason: "serialization-shape" };
  let different = false;
  for (let i = 0; i < ta.length; i++) {
    const verdict = compareToken(ta[i]!, tb[i]!);
    if (verdict.result === "unknown") return verdict;
    if (verdict.result === "different") different = true;
  }
  return { result: different ? "different" : "equal" };
}

/** Same property modulo logical ↔ physical flow mapping (`margin-left` ~ `margin-inline-start`). */
function flowKey(property: string): string {
  return property
    .replace(/-(?:top|bottom)-(?:left|right)-radius$/, "-*-*-radius")
    .replace(/-(?:start|end)-(?:start|end)-radius$/, "-*-*-radius")
    .replace(/-(?:inline|block)-(?:start|end)(?=-|$)/, "-*")
    .replace(/-(?:top|right|bottom|left)(?=-|$)/, "-*")
    .replace(/^(?:top|right|bottom|left)$/, "inset-*")
    .replace(/-(?:inline|block|x|y)$/, "-*")
    .replace(/(^|-)(?:inline-size|block-size|width|height)$/, "$1*size");
}

function logicalPhysicalRelated(a: string, b: string): boolean {
  if (a === b) return false;
  const ka = flowKey(a);
  return ka === flowKey(b) && ka.includes("*");
}

/** One `style` attribute declaration, in source order. */
interface OrderedDecl {
  name: string;
  value: string;
  important: boolean;
}

/** Every declaration in source order (`parseStyleText` is last-wins by name). */
function parseStyleDecls(text: string | null | undefined): OrderedDecl[] {
  const out: OrderedDecl[] = [];
  if (text === null || text === undefined) return out;
  let depth = 0;
  let quote = "";
  let start = 0;
  const parts: string[] = [];
  for (let i = 0; i < text.length; i++) {
    const ch = text.charAt(i);
    if (quote !== "") {
      if (ch === "\\") i++;
      else if (ch === quote) quote = "";
      continue;
    }
    if (ch === '"' || ch === "'") quote = ch;
    else if (ch === "(") depth++;
    else if (ch === ")") depth = depth > 0 ? depth - 1 : 0;
    else if (ch === ";" && depth === 0) {
      parts.push(text.slice(start, i));
      start = i + 1;
    }
  }
  parts.push(text.slice(start));
  for (const part of parts) {
    for (const [name, decl] of parseStyleText(part)) out.push({ name, ...decl });
  }
  return out;
}

type InitialEvidence =
  | { kind: "none" }
  | { kind: "value"; value: string; important: boolean }
  | { kind: "unknown"; reason: string; display: string };

/** What the initial `style` attribute proves about runtime `property`. */
function initialEvidenceFor(decls: readonly OrderedDecl[], property: string): InitialEvidence {
  const contributions: { value: string; important: boolean }[] = [];
  let opaque: { reason: string; display: string } | undefined;
  const setOpaque = (reason: string, decl: OrderedDecl): void => {
    if (opaque === undefined) opaque = { reason, display: `${decl.name}: ${decl.value}` };
  };
  const propertyIsCustom = property.startsWith("--");
  const propertyLonghands = CSS_SHORTHANDS.get(property) ?? [property];
  for (const decl of decls) {
    const name = decl.name;
    if (name.startsWith("--") || propertyIsCustom) {
      if (name === property) contributions.push({ value: decl.value, important: decl.important });
      continue;
    }
    if (name === "all") {
      setOpaque("initial-all-shorthand", decl);
      continue;
    }
    const resolved = CSS_ALIASES.get(name) ?? name;
    if (resolved === property) {
      contributions.push({ value: decl.value, important: decl.important });
      continue;
    }
    const longhands = CSS_SHORTHANDS.get(resolved);
    if (longhands !== undefined && longhands.includes(property)) {
      const pending = SUBSTITUTION_RE.test(decl.value);
      const side = BOX_SHORTHANDS.has(resolved) ? longhands.indexOf(property) : -1;
      const expanded = side >= 0 && side < 4 && !pending ? expandBox(decl.value) : undefined;
      if (expanded) {
        contributions.push({ value: expanded[side]!, important: decl.important });
      } else {
        setOpaque(
          pending ? "initial-shorthand-pending-substitution" : "initial-shorthand-not-expanded",
          decl,
        );
      }
      continue;
    }
    if (!CSS_LONGHANDS.has(resolved) && longhands === undefined) {
      setOpaque("initial-property-unrecognized", decl);
      continue;
    }
    const declLonghands = longhands ?? [resolved];
    if (declLonghands.some((l) => propertyLonghands.includes(l))) {
      setOpaque("initial-shorthand-overlap", decl);
      continue;
    }
    if (declLonghands.some((l) => propertyLonghands.some((p) => logicalPhysicalRelated(l, p)))) {
      setOpaque("logical-physical-counterpart", decl);
    }
  }
  if (opaque !== undefined) return { kind: "unknown", ...opaque };
  if (contributions.length === 0) return { kind: "none" };
  const important = contributions.filter((c) => c.important);
  const pool = important.length > 0 ? important : contributions;
  const winner = pool[pool.length - 1]!;
  return { kind: "value", value: winner.value, important: winner.important };
}

interface InitialIndex {
  root: P5Element | undefined;
  idCounts: Map<string, number>;
}

function indexInitialDocument(html: string): InitialIndex {
  const document = parse(html);
  const idCounts = new Map<string, number>();
  let root: P5Element | undefined;
  for (const child of document.childNodes) {
    if (isElement(child) && child.tagName.toLowerCase() === "html") root = child;
  }
  const stack: P5Node[] = [...document.childNodes];
  while (stack.length > 0) {
    const node = stack.pop()!;
    if (!isElement(node)) continue;
    const id = attr(node, "id");
    if (id !== undefined && id !== "") idCounts.set(id, (idCounts.get(id) ?? 0) + 1);
    for (const child of node.childNodes) stack.push(child);
  }
  return { root, idCounts };
}

function classTokens(value: string | undefined): Set<string> {
  return new Set((value ?? "").split(/\s+/).filter((token) => token !== ""));
}

function classJaccardMatch(runtime: Set<string>, initial: Set<string>): boolean {
  if (runtime.size === 0 || initial.size === 0) return false;
  let intersection = 0;
  for (const token of runtime) if (initial.has(token)) intersection++;
  const union = runtime.size + initial.size - intersection;
  return union > 0 && intersection / union >= 0.5;
}

type CorroborationVerdict =
  | "matched"
  | "failed"
  | "id-conflict"
  | "sibling-lookalike"
  | "no-evidence";

/**
 * Corroborate a path-resolved initial node. A POSITIVE signal counts only when
 * it is UNIQUE among the node's same-tag initial siblings (a row of identical
 * `.card`s proves nothing about which card this is), and a document-unique
 * initial `id` that DISAGREES with the runtime id overrides every other signal.
 */
function corroborate(
  runtime: ProvenanceElementInput,
  initial: P5Element,
  siblings: readonly P5Element[],
  idCounts: Map<string, number>,
): CorroborationVerdict {
  let comparable = 0;
  let lookalike = false;
  const tag = initial.tagName.toLowerCase();
  const sameTagSiblings = siblings.filter(
    (sibling) => sibling !== initial && sibling.tagName.toLowerCase() === tag,
  );
  const positive = (test: (node: P5Element) => boolean): boolean => {
    if (!test(initial)) return false;
    if (sameTagSiblings.some(test)) {
      lookalike = true;
      return false;
    }
    return true;
  };

  const runtimeId = runtime.attributes.id;
  const initialIdRaw = attr(initial, "id");
  if (runtimeId && initialIdRaw && (idCounts.get(initialIdRaw) ?? 0) === 1) {
    // Unique in the whole document, hence unique among the siblings.
    return runtimeId === capAttr(initialIdRaw) ? "matched" : "id-conflict";
  }

  const runtimeClasses = classTokens(runtime.attributes.class);
  const initialClasses = classTokens(capAttr(attr(initial, "class")));
  if (runtimeClasses.size > 0 && initialClasses.size > 0) {
    comparable++;
    if (
      positive((node) =>
        classJaccardMatch(runtimeClasses, classTokens(capAttr(attr(node, "class")))),
      )
    ) {
      return "matched";
    }
  }

  for (const name of ["src", "href"]) {
    const runtimeValue = runtime.attributes[name];
    const initialValue = capAttr(attr(initial, name));
    if (runtimeValue && initialValue) {
      comparable++;
      if (positive((node) => capAttr(attr(node, name)) === runtimeValue)) return "matched";
    }
  }

  // POSITIVE-ONLY signals: a script may legitimately rewrite the `style`
  // attribute (that is what is being classified) or the text, so a difference
  // is not evidence of a different node — only an equality is evidence of the
  // same one.
  const runtimeStyle = runtime.inlineStyle?.raw;
  if (runtimeStyle && normalizeSpace(runtimeStyle) !== "") {
    const wanted = normalizeSpace(runtimeStyle);
    if (positive((node) => normalizeSpace(attr(node, "style") ?? "") === wanted)) {
      return "matched";
    }
  }
  if (runtime.text) {
    const wanted = runtime.text;
    if (positive((node) => directText(node) === wanted)) return "matched";
  }

  if (lookalike) return "sibling-lookalike";
  return comparable > 0 ? "failed" : "no-evidence";
}

/** Did `property` (or a related property) take different values across the given texts? */
function variesAcrossWidths(texts: readonly (string | null)[], property: string): boolean {
  if (texts.length <= 1) return false;
  const first = texts[0] ?? null;
  if (texts.every((text) => (text ?? null) === first)) return false;
  const maps = texts.map((text) => parseStyleText(text));
  const names = new Set<string>();
  for (const map of maps) for (const name of map.keys()) names.add(name);
  for (const name of names) {
    if (!stylePropertiesRelated(name, property)) continue;
    const values = new Set(
      maps.map((map) => {
        const decl = map.get(name);
        return decl ? `${decl.value}${decl.important ? "!" : ""}` : " absent";
      }),
    );
    if (values.size > 1) return true;
  }
  return false;
}

export function computeInlineStyleProvenance(
  input: InlineProvenanceInput,
): InlineProvenanceResult {
  const byElementId = new Map<string, InlineStyleProvenance>();
  const counts: InlineStyleProvenanceCounts = {
    elements: 0,
    declarations: 0,
    correspondence: {},
    byClass: {},
  };
  const unknownReasons: Record<string, number> = {};
  const correspondenceReasons: Record<string, number> = {};
  const styled = input.elements.filter(
    (el) => el.inlineStyle !== undefined && el.inlineStyle.decls.length > 0,
  );
  if (styled.length === 0) return { byElementId, counts };

  const index =
    input.initialHtml !== undefined ? indexInitialDocument(input.initialHtml) : undefined;

  // Runtime tree: element children per parent, in dom.json (document) order.
  const byId = new Map<string, ProvenanceElementInput>();
  const positionInParent = new Map<string, number>();
  const childCount = new Map<string, number>();
  for (const el of input.elements) {
    byId.set(el.id, el);
    if (el.parentId !== undefined) {
      const at = childCount.get(el.parentId) ?? 0;
      positionInParent.set(el.id, at);
      childCount.set(el.parentId, at + 1);
    }
  }
  const initialChildren = new Map<P5Element, P5Element[]>();
  const childrenAt = (node: P5Element): P5Element[] => {
    let list = initialChildren.get(node);
    if (list === undefined) {
      list = elementChildren(node);
      initialChildren.set(node, list);
    }
    return list;
  };

  const resolve = (
    el: ProvenanceElementInput,
  ): { node?: P5Element; siblings?: P5Element[]; reason?: string } => {
    if (!index || !index.root) return { reason: "initial-document-has-no-html-root" };
    const chain: ProvenanceElementInput[] = [];
    let cursor: ProvenanceElementInput | undefined = el;
    const seen = new Set<string>();
    while (cursor !== undefined) {
      if (seen.has(cursor.id)) return { reason: "runtime-parent-cycle" };
      seen.add(cursor.id);
      chain.push(cursor);
      cursor = cursor.parentId !== undefined ? byId.get(cursor.parentId) : undefined;
      if (chain[chain.length - 1]!.parentId !== undefined && cursor === undefined) {
        return { reason: "runtime-parent-missing" };
      }
    }
    chain.reverse();
    const top = chain[0]!;
    if (top.tagName.toLowerCase() !== "html") return { reason: "runtime-root-not-html" };
    let node: P5Element = index.root;
    let siblings: P5Element[] = [index.root];
    for (let depth = 1; depth < chain.length; depth++) {
      const child = chain[depth]!;
      const position = positionInParent.get(child.id) ?? -1;
      const children = childrenAt(node);
      const next = position >= 0 ? children[position] : undefined;
      if (next === undefined) return { reason: "path-unresolved" };
      if (next.tagName.toLowerCase() !== child.tagName.toLowerCase()) {
        return { reason: "path-tag-mismatch" };
      }
      node = next;
      siblings = children;
    }
    return { node, siblings };
  };

  for (const el of styled) {
    let correspondence: InlineStyleCorrespondence;
    let reason: string | undefined;
    let initialNode: P5Element | undefined;
    if (input.initialHtml === undefined) {
      correspondence = "no-initial-document";
    } else {
      const resolved = resolve(el);
      if (!resolved.node) {
        correspondence = "no-initial-node";
        reason = resolved.reason;
      } else {
        const verdict = corroborate(el, resolved.node, resolved.siblings ?? [], index!.idCounts);
        if (verdict === "matched") {
          correspondence = "matched";
          initialNode = resolved.node;
        } else if (verdict === "failed") {
          correspondence = "no-initial-node";
          reason = "corroboration-failed";
        } else if (verdict === "id-conflict") {
          correspondence = "no-initial-node";
          reason = "id-conflict";
        } else if (verdict === "sibling-lookalike") {
          correspondence = "ambiguous";
          reason = "sibling-lookalike";
        } else {
          correspondence = "ambiguous";
          reason = "no-corroborating-evidence";
        }
      }
    }
    if (reason !== undefined) {
      correspondenceReasons[reason] = (correspondenceReasons[reason] ?? 0) + 1;
    }

    const widthTexts = input.widthStyles?.get(el.id);
    const recheck = input.recheckStyles;
    const initialDecls = initialNode ? parseStyleDecls(attr(initialNode, "style")) : undefined;
    const byProperty: Record<string, InlineStylePropertyProvenance> = {};
    for (const decl of el.inlineStyle!.decls) {
      const varies = widthTexts !== undefined && variesAcrossWidths(widthTexts, decl.property);
      const timeVarying =
        widthTexts !== undefined &&
        widthTexts.length > 0 &&
        recheck !== undefined &&
        recheck.has(el.id) &&
        variesAcrossWidths([widthTexts[0] ?? null, recheck.get(el.id) ?? null], decl.property);
      const evidence = initialDecls ? initialEvidenceFor(initialDecls, decl.property) : undefined;
      let cls: InlineStyleProvenanceClass;
      let unknownReason: string | undefined;
      if (timeVarying) {
        cls = "unknown";
        unknownReason = "time-varying";
      } else if (varies) {
        cls = "runtime-responsive";
      } else if (widthTexts === undefined) {
        cls = "unknown";
        unknownReason = "width-evidence-absent";
      } else if (correspondence !== "matched" || evidence === undefined) {
        cls = "unknown";
        unknownReason = `correspondence-${correspondence}`;
      } else if (evidence.kind === "none") {
        cls = "runtime-added";
      } else if (evidence.kind === "unknown") {
        cls = "unknown";
        unknownReason = evidence.reason;
      } else if (evidence.important !== (decl.important === true)) {
        // Priority is compared exactly; a changed `!important` is a changed declaration.
        cls = "initial-mutated";
      } else {
        const verdict = compareStyleValues(evidence.value, decl.value);
        if (verdict.result === "unknown") {
          cls = "unknown";
          unknownReason = verdict.reason;
        } else {
          cls = verdict.result === "equal" ? "initial-static" : "initial-mutated";
        }
      }
      const initialValue =
        evidence === undefined || evidence.kind === "none"
          ? undefined
          : evidence.kind === "value"
            ? evidence.value
            : evidence.display;
      byProperty[decl.property] = {
        class: cls,
        ...(initialValue !== undefined ? { initialValue } : {}),
        runtimeValue: decl.value,
        // A value that changed between two measurements of the SAME width also
        // varied across the probe's measurements; a consumer reading only this
        // flag must not take the runtime value as stable.
        variesAcrossWidths: varies || timeVarying,
        ...(unknownReason !== undefined ? { unknownReason } : {}),
        ...(timeVarying ? { timeVarying: true as const } : {}),
      };
      counts.declarations++;
      counts.byClass[cls] = (counts.byClass[cls] ?? 0) + 1;
      if (unknownReason !== undefined) {
        unknownReasons[unknownReason] = (unknownReasons[unknownReason] ?? 0) + 1;
      }
    }
    counts.elements++;
    counts.correspondence[correspondence] = (counts.correspondence[correspondence] ?? 0) + 1;
    byElementId.set(el.id, {
      correspondence,
      byProperty,
      widthEvidence: widthTexts !== undefined ? "probe" : "absent",
      ...(reason !== undefined ? { reason } : {}),
    });
  }
  if (Object.keys(unknownReasons).length > 0) counts.unknownReasons = unknownReasons;
  if (Object.keys(correspondenceReasons).length > 0) {
    counts.correspondenceReasons = correspondenceReasons;
  }
  return { byElementId, counts };
}
