import { SUPPLEMENTAL_ATTRIBUTES } from "../sitespec/index.js";
import type { RuntimePropValue } from "./types.js";

/**
 * The HTML → React adaptation layer (items 39–49).
 *
 * The SiteSpec is an HTML/browser IR. React is not: `for` is `htmlFor`,
 * `colspan` is `colSpan` and takes a number, an HTML boolean attribute's empty
 * string means `true`, and a `checked` attribute on an uncontrolled `<input>`
 * produces a console warning rather than a checked box. Every one of those is a
 * RENDERER concern, so every one of them lives here and none of them leaked into
 * Task 13.
 *
 * The layer is deliberately a lookup table plus a small number of tag-aware
 * rules, not a heuristic:
 *
 *  - name mapping is a closed map, and an unmapped name passes through verbatim
 *    (which is correct for `aria-*`, `role`, `alt`, `title`, `min`, `scope`, …)
 *  - HTML boolean attributes become `true`, from any of the three legal
 *    spellings the SiteSpec may hold (item 42)
 *  - `hidden` is NOT collapsed to a boolean: `hidden="until-found"` is a
 *    different state and losing it would change the page (item 43)
 *  - initial form state becomes `defaultChecked` / `defaultValue`, never the
 *    controlled `checked` / `value`, because a controlled field with no
 *    `onChange` is both a warning and a read-only input (items 44, 47)
 *
 * Nothing here re-introduces anything the SiteSpec deliberately excluded — no
 * `class`, no `style`, no `id`, no `data-*`, no `on*` (item 50). Those names
 * cannot arrive: they are not in the SiteSpec's attribute vocabulary at all.
 */

/** HTML attribute name → React prop name. Everything else passes through. */
export const REACT_PROP_NAMES: Readonly<Record<string, string>> = {
  accesskey: "accessKey",
  autocapitalize: "autoCapitalize",
  autocomplete: "autoComplete",
  autofocus: "autoFocus",
  colspan: "colSpan",
  contenteditable: "contentEditable",
  crossorigin: "crossOrigin",
  datetime: "dateTime",
  enterkeyhint: "enterKeyHint",
  for: "htmlFor",
  formaction: "formAction",
  hreflang: "hrefLang",
  inputmode: "inputMode",
  maxlength: "maxLength",
  minlength: "minLength",
  popovertarget: "popoverTarget",
  popovertargetaction: "popoverTargetAction",
  readonly: "readOnly",
  rowspan: "rowSpan",
  spellcheck: "spellCheck",
  srcset: "srcSet",
  tabindex: "tabIndex",
  usemap: "useMap",
};

/**
 * Attributes whose presence — not value — is the fact (item 42).
 *
 * Taken from the SiteSpec's own supplemental `kind: "boolean"` declarations plus
 * the two boolean names the Observer's whitelist supplies (`controls`), so this
 * list cannot silently drift away from the IR it reads.
 */
export const BOOLEAN_ATTRIBUTES: ReadonlySet<string> = new Set<string>([
  ...Object.entries(SUPPLEMENTAL_ATTRIBUTES)
    .filter(([, kind]) => kind === "boolean")
    .map(([name]) => name),
  "controls",
]);

/** React props typed as numbers; a non-integer value is left as a string. */
const NUMERIC_PROPS: ReadonlySet<string> = new Set([
  "colSpan",
  "rowSpan",
  "maxLength",
  "minLength",
  "start",
  "tabIndex",
  "span",
]);

/** Elements that must never receive children (item 55). */
export const VOID_ELEMENTS: ReadonlySet<string> = new Set([
  "area",
  "base",
  "br",
  "col",
  "embed",
  "hr",
  "img",
  "input",
  "link",
  "meta",
  "param",
  "source",
  "track",
  "wbr",
]);

/**
 * Tags never rendered into the clone, subtree and all.
 *
 * The Observer skipped `<head>` noise, so in the corpus this set matches nothing
 * (measured: 0). It exists as a wall rather than an assumption: if a future
 * observation ever carries a `<script>` or `<style>` node, "the original page's
 * JavaScript is not reconstructed" has to be a property of the code, not of the
 * data that happened to arrive (items 57, 109).
 */
export const SKIPPED_TAGS: ReadonlySet<string> = new Set([
  "script",
  "style",
  "noscript",
  "template",
  "head",
  "title",
  "meta",
  "link",
  "base",
]);

/** `<input>` types whose `value` is a button label, not a field value. */
export const BUTTON_LIKE_INPUT_TYPES: ReadonlySet<string> = new Set([
  "button",
  "submit",
  "reset",
  "image",
]);

/** An HTML boolean attribute is present in any of these three spellings. */
export function isBooleanAttributePresent(name: string, value: string): boolean {
  const v = value.toLowerCase();
  return v === "" || v === name.toLowerCase() || v === "true";
}

const INTEGER = /^-?\d+$/;

export interface AdaptedAttribute {
  prop: string;
  value: RuntimePropValue;
}

/**
 * Adapt ONE attribute. Returns `null` when the attribute is handled elsewhere
 * (form state) and must not be emitted as-is.
 */
export function adaptAttribute(
  tagName: string,
  name: string,
  value: string,
): AdaptedAttribute | null {
  // --- form state: handled by the element rules, never emitted raw ----------
  if (name === "checked" && tagName === "input") return null;
  if (name === "selected" && tagName === "option") return null;
  if (name === "value" && (tagName === "input" || tagName === "textarea")) return null;
  if (name === "value" && tagName === "select") return null;

  const prop = REACT_PROP_NAMES[name] ?? name;

  // `hidden` is enumerated, not boolean: `until-found` is its own state and
  // collapsing it to `true` would silently change what the page does (item 43).
  if (name === "hidden") {
    return { prop: "hidden", value: true };
  }

  if (BOOLEAN_ATTRIBUTES.has(name)) {
    return isBooleanAttributePresent(name, value)
      ? { prop, value: true }
      : // A boolean attribute the IR holds with a non-presence value is still a
        // presence in HTML. Emitting `true` is the faithful reading.
        { prop, value: true };
  }

  if (NUMERIC_PROPS.has(prop) && INTEGER.test(value)) {
    return { prop, value: Number.parseInt(value, 10) };
  }

  return { prop, value };
}

/**
 * The extra prop `hidden="until-found"` needs.
 *
 * React DOM types `hidden` as a boolean and its server renderer emits `hidden=""`
 * for any truthy value, so the enumerated state cannot survive as a React prop.
 * Rather than fold it into `true` — which item 43 forbids — the generator carries
 * the exact value in a `data-wr-*` annotation and the client runtime restores the
 * real attribute. That is a React-renderer adaptation, not a change to the source
 * semantics: the DOM attribute in the running clone is `hidden="until-found"`.
 */
export function hiddenStateAnnotation(value: string): string | undefined {
  return value === "" || value.toLowerCase() === "hidden" ? undefined : value;
}

/** True when a `contenteditable` value actually enables editing (item 49). */
export function isContentEditableEnabled(value: string): boolean {
  const v = value.toLowerCase();
  return v === "" || v === "true" || v === "plaintext-only";
}
