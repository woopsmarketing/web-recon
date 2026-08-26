import { ATTR_MAX_LEN } from "../observer/types.js";
import { normalizeInputType } from "../interaction-detector/types.js";
import {
  SAFE_ATTRIBUTES,
  SENSITIVE_VALUE_INPUT_TYPES,
  SUPPLEMENTAL_ATTRIBUTES,
  type LimitationCode,
  type NodeRelationType,
} from "./types.js";

/**
 * Safe reconstruction attributes (Task 13, items 36–41).
 *
 * The Observer kept a generous set — every whitelisted attribute plus every
 * `aria-*` and every `data-*` — because at observation time you cannot know what
 * will matter. A reconstruction IR has the opposite problem: whatever it keeps,
 * a generator will render, so every field carried through is a decision about
 * what a clone of this site is allowed to contain.
 *
 * Four kinds of thing are therefore dropped rather than filtered later:
 *
 *  - `class` / `style`  — the style catalog holds the browser's COMPUTED result,
 *                         so source class names buy nothing and would quietly
 *                         make the IR framework-shaped (items 37, 48).
 *  - every `data-*`     — arbitrary, framework-specific, and routinely a payload
 *                         (ids, tokens, serialized state).
 *  - `javascript:` URLs — script source wearing an `href`.
 *  - password / hidden / file `value` — never public visual state, always a
 *                         disclosure risk (item 39).
 *
 * `id` survives as `sourceHtmlId` rather than as an attribute, because a
 * generated id (`radix-:r7:`) is an artifact of one render and must not become
 * the identity a generator builds on (item 40).
 *
 * Form `action` is not here at all: the Observer never captured it, and the
 * compiler deliberately keeps it that way. A clone that can POST to the original
 * backend is a real hazard, so the endpoint is not stored anywhere in the IR —
 * only a diagnostic boolean is (item 38).
 *
 * Task 13.1 adds a SECOND, bounded source: on a viewport whose `rendered.html`
 * aligned exactly with `dom.json`, the closed `SUPPLEMENTAL_ATTRIBUTES` list may
 * fill gaps the Observer's whitelist left (`colspan`, `open`, `disabled`, …).
 * The rule that keeps it a supplement rather than a rival source of truth is one
 * line of code and one line of policy: **a name already present in `dom.json` is
 * never touched.** The two vocabularies are asserted disjoint at module load, so
 * that branch should be unreachable — it is written, and tested, anyway.
 */

const SAFE_SET = new Set(SAFE_ATTRIBUTES);
const SENSITIVE_VALUE_SET = new Set(SENSITIVE_VALUE_INPUT_TYPES);

/** IDREF-carrying attributes and the relation type each produces (item 41). */
const IDREF_RELATIONS: ReadonlyArray<{
  attribute: string;
  type: NodeRelationType;
  /** `aria-controls` is a whitespace-separated IDREF *list*. */
  list: boolean;
}> = [
  { attribute: "aria-controls", type: "aria-controls", list: true },
  { attribute: "aria-labelledby", type: "aria-labelledby", list: true },
  { attribute: "aria-describedby", type: "aria-describedby", list: true },
  { attribute: "aria-owns", type: "aria-owns", list: true },
  { attribute: "for", type: "label-for", list: false },
  // Task 13.1 (item 18): recovered, so it is read from the MERGED map below.
  { attribute: "popovertarget", type: "popover-target", list: false },
];

/** A relation before its target is known — resolution is viewport-local. */
export interface RelationSource {
  type: NodeRelationType;
  sourceValue: string;
}

export interface CompiledAttributes {
  /** Keys sorted, so two compiles serialize identically. */
  attributes: Record<string, string>;
  sourceHtmlId?: string;
  role?: string;
  relationSources: RelationSource[];
  limitations: LimitationCode[];
  /** Names taken from the supplemental channel, sorted. Empty when none. */
  recoveredAttributeNames: string[];
}

function isJavascriptUrl(value: string): boolean {
  return value.trim().toLowerCase().startsWith("javascript:");
}

/**
 * The value to store for a recovered attribute (Task 13.1, items 9, 10).
 *
 * For an HTML boolean attribute the string is noise — `open`, `open=""` and
 * `open="open"` are one fact — so it is normalized to `""` and the fact is
 * "present". For everything else the string IS the meaning (`colspan="2"`,
 * `contenteditable="plaintext-only"`, `hidden="until-found"`) and is preserved
 * exactly as written; re-spelling it would be this compiler inventing HTML.
 */
function supplementalValue(name: string, raw: string): string {
  return SUPPLEMENTAL_ATTRIBUTES[name] === "boolean" ? "" : raw;
}

/**
 * Apply the policy to ONE element's observed attribute map.
 *
 * `tagName` matters for exactly two decisions — which `value` is sensitive, and
 * whether `for` is a label relation — and for nothing else. There is no
 * per-site, per-framework or per-component branch anywhere in here.
 *
 * @param raw          the Observer's `dom.json` attributes — the primary truth.
 * @param supplemental allowlisted attributes harvested from an ALIGNED
 *                     `rendered.html`, or `undefined` on a fallback viewport
 *                     (item 13). Never overrides `raw`.
 */
export function compileAttributes(
  tagName: string,
  raw: Readonly<Record<string, string>>,
  supplemental?: Readonly<Record<string, string>>,
): CompiledAttributes {
  const attributes: Record<string, string> = {};
  const limitations = new Set<LimitationCode>();
  const relationSources: RelationSource[] = [];
  const recoveredAttributeNames: string[] = [];

  const inputType =
    tagName === "input" ? normalizeInputType(raw["type"]) : undefined;

  const names = Object.keys(raw).sort();
  for (const name of names) {
    const value = raw[name]!;

    if (name === "id") continue; // → sourceHtmlId
    if (name.startsWith("data-")) continue;
    if (name.startsWith("on")) continue; // the Observer never stored these
    if (name === "class" || name === "style") continue;
    if (name === "src" || name === "srcset" || name === "sizes" || name === "poster") {
      continue; // expressed as asset references instead (item 36)
    }

    // The supplemental names are accepted from `dom.json` too. Today the
    // Observer cannot produce one (the two vocabularies are asserted disjoint),
    // but if its whitelist is ever widened, the observed value must WIN rather
    // than be dropped here and then re-supplied by the parse tree (item 5).
    const supplementalKind = SUPPLEMENTAL_ATTRIBUTES[name];
    const keep =
      name.startsWith("aria-") || SAFE_SET.has(name) || supplementalKind !== undefined;
    if (!keep) continue;

    if (name === "href" && isJavascriptUrl(value)) {
      limitations.add("javascript-href-removed");
      continue;
    }
    if (
      name === "value" &&
      (tagName === "input" || tagName === "textarea") &&
      inputType !== undefined &&
      SENSITIVE_VALUE_SET.has(inputType)
    ) {
      limitations.add("sensitive-input-value-not-compiled");
      continue;
    }

    if (value.length >= ATTR_MAX_LEN) {
      limitations.add("attribute-value-may-be-truncated");
    }
    // Value semantics belong to the ATTRIBUTE, not to the channel it arrived
    // on, so a boolean is stored as presence either way.
    attributes[name] =
      supplementalKind === undefined ? value : supplementalValue(name, value);
  }

  // A `<textarea type=...>` does not exist, so the sensitive-value rule above
  // only ever fires for `<input>`; `<input type=file>` additionally never has a
  // meaningful value attribute. Both are covered without a special case.

  // --- supplemental channel (Task 13.1) ---------------------------------------
  // Only allowlisted names reach this map (they are filtered during the parse
  // walk), and a name `dom.json` already carries is left exactly as observed.
  if (supplemental !== undefined) {
    for (const name of Object.keys(supplemental).sort()) {
      if (!Object.hasOwn(SUPPLEMENTAL_ATTRIBUTES, name)) continue; // unreachable; kept as a wall
      if (Object.hasOwn(raw, name)) continue; // item 5: the observed value wins
      attributes[name] = supplementalValue(name, supplemental[name]!);
      recoveredAttributeNames.push(name);
    }
  }

  // Keys are re-emitted in sorted order so that the serialized attribute map is
  // a function of the attribute SET, never of the order the two channels were
  // read in (item 29).
  const sorted: Record<string, string> = {};
  for (const name of Object.keys(attributes).sort()) sorted[name] = attributes[name]!;

  for (const spec of IDREF_RELATIONS) {
    // `raw` first so an observed value can never be displaced by a recovered
    // one; in practice the two vocabularies are disjoint by assertion.
    const value = raw[spec.attribute] ?? supplemental?.[spec.attribute];
    if (value === undefined) continue;
    if (spec.attribute === "for" && tagName !== "label" && tagName !== "output") {
      continue; // `for` on anything else is not the label relation
    }
    const tokens = spec.list ? value.split(/\s+/) : [value];
    for (const token of tokens) {
      const trimmed = token.trim();
      if (trimmed === "") continue;
      relationSources.push({ type: spec.type, sourceValue: trimmed });
    }
  }

  const href = raw["href"];
  if (href !== undefined && href.startsWith("#") && href.length > 1) {
    relationSources.push({ type: "href-fragment", sourceValue: href.slice(1) });
  }

  const sourceHtmlId = raw["id"];
  if (sourceHtmlId !== undefined && sourceHtmlId !== "") {
    limitations.add("source-html-id-not-identity");
  }

  const roleAttr = sorted["role"];
  const role = roleAttr ? roleAttr.trim().split(/\s+/)[0]?.toLowerCase() : undefined;

  return {
    attributes: sorted,
    ...(sourceHtmlId !== undefined && sourceHtmlId !== ""
      ? { sourceHtmlId }
      : {}),
    ...(role ? { role } : {}),
    relationSources,
    limitations: [...limitations],
    recoveredAttributeNames,
  };
}
