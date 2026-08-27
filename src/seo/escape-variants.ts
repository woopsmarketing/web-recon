/**
 * Escape-variant substitution (Task 27 GED-E) — one string, every encoding it
 * takes across a Next.js response.
 *
 * The SEO serve boundary replaces the upstream title wherever it appears in a
 * fully-buffered HTML response. That is the same mechanism the Task 22 asset
 * rewriter uses (`rewriteVariants`, src/assets/rewrite.ts:17) and the same
 * three-encoding problem: a string is emitted raw inside client-side script
 * strings, HTML-escaped inside SSR'd text and attribute values, and
 * JSON-escaped inside the RSC flight payload. A URL only ever varies on `&`,
 * so the asset rewriter's narrower variant set is correct for URLs and is
 * deliberately left alone; a TITLE may also carry `< > " '`, each of which has
 * its own escape in each encoding.
 *
 * Two properties this module exists to guarantee:
 *
 *   - the NEEDLE is the upstream string in the encoding of the occurrence, so
 *     an entity-bearing title cannot survive by hiding behind `&amp;`;
 *   - the REPLACEMENT carries the SAME encoding as the occurrence it replaces,
 *     so a raw context gets raw bytes and an HTML context gets `&amp;` — never
 *     `&amp;amp;`.
 *
 * Encodings are applied UNIFORMLY (one encoding per needle). A single
 * occurrence that mixes encodings character-by-character is out of scope; no
 * serializer in this pipeline emits one.
 */

/** Escape for HTML text/attribute content. `apostrophe` varies by serializer. */
function escapeHtml(value: string, apostrophe: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, apostrophe);
}

/** The body of a JSON string literal (quotes stripped) — `"` → `\"` etc. */
function escapeJsonStringBody(value: string): string {
  const json = JSON.stringify(value);
  return json.slice(1, json.length - 1);
}

/**
 * A JSON string body as embedded in an inline `<script>` (the RSC flight
 * payload): Next's htmlEscapeJsonString additionally unicode-escapes the
 * characters that could close or reopen the script element.
 */
function escapeJsonStringBodyForHtml(value: string): string {
  return escapeJsonStringBody(value)
    .replace(/&/g, "\\u0026")
    .replace(/</g, "\\u003c")
    .replace(/>/g, "\\u003e")
    .replace(/\u2028/g, "\\u2028")
    .replace(/\u2029/g, "\\u2029");
}

const ENCODINGS: { name: string; encode: (value: string) => string }[] = [
  { name: "raw", encode: (value) => value },
  // React's escapeTextForBrowser renders `'` as `&#x27;`; other serializers in
  // the response chain use the decimal or the named form. They differ only on
  // an apostrophe, so for a title without one all three collapse to one needle.
  { name: "html-hex-apostrophe", encode: (value) => escapeHtml(value, "&#x27;") },
  { name: "html-decimal-apostrophe", encode: (value) => escapeHtml(value, "&#39;") },
  { name: "html-named-apostrophe", encode: (value) => escapeHtml(value, "&apos;") },
  { name: "json", encode: escapeJsonStringBody },
  { name: "json-html-escaped", encode: escapeJsonStringBodyForHtml },
];

/** The encoding names this module substitutes, in declaration order. */
export const ESCAPE_VARIANT_ENCODINGS: readonly string[] = ENCODINGS.map((encoding) => encoding.name);

export interface EscapeVariant {
  encoding: string;
  /** The string as it appears in that encoding. */
  text: string;
}

/** Every distinct encoding of `value` (deduplicated, longest first). */
export function escapeVariants(value: string): EscapeVariant[] {
  return substitutionVariants(value, value).map((variant) => ({ encoding: variant.encoding, text: variant.find }));
}

export interface EscapeSubstitution {
  encoding: string;
  find: string;
  replace: string;
}

/**
 * Needle/replacement pairs for replacing `from` with `to`, one per distinct
 * encoding. Longest needle first, the Task 22 ordering rule: a shorter variant
 * can never steal occurrences of a longer one.
 */
export function substitutionVariants(from: string, to: string): EscapeSubstitution[] {
  const seen = new Set<string>();
  const substitutions: EscapeSubstitution[] = [];
  for (const { name, encode } of ENCODINGS) {
    const find = encode(from);
    if (find === "" || seen.has(find)) continue;
    seen.add(find);
    substitutions.push({ encoding: name, find, replace: encode(to) });
  }
  return substitutions.sort((a, b) => b.find.length - a.find.length || a.find.localeCompare(b.find));
}

export interface VariantSubstitutionResult {
  body: string;
  replacedOccurrences: number;
}

/** Replace every encoded occurrence of `from` with the same encoding of `to`. */
export function applySubstitutionVariants(body: string, from: string, to: string): VariantSubstitutionResult {
  let out = body;
  let replacedOccurrences = 0;
  for (const { find, replace } of substitutionVariants(from, to)) {
    if (find === replace || !out.includes(find)) continue;
    // literal split/join, never a regex over page bytes.
    const parts = out.split(find);
    replacedOccurrences += parts.length - 1;
    out = parts.join(replace);
  }
  return { body: out, replacedOccurrences };
}

/**
 * Escape a title for the text content of `<title>`. Same escape set as the
 * Task 23 production bake (`escapeForTitle`, src/production/bake.ts) so the
 * preview and the baked site render an entity-bearing title identically.
 */
export function escapeForTitleText(title: string): string {
  return title.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
