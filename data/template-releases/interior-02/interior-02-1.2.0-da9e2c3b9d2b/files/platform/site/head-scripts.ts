import { z } from "zod";

/**
 * Site-level third-party head scripts: data/sites/<siteId>/scripts.json (OPTIONAL).
 *
 *   {
 *     "schemaVersion": 1,
 *     "headScripts": [
 *       { "id": "support-widget", "src": "https://cdn.example.com/widget.js", "attrs": { "data-site-key": "…" } }
 *     ]
 *   }
 *
 * Absent file = the site declares no head script: no `headScripts` key in the snapshot, nothing
 * rendered, and a package byte-identical to one built before this document existed — the same
 * "absent ≠ empty list" rule theme.json / slots.json / content/reviews.json already follow.
 *
 * The seam is VENDOR-AGNOSTIC by construction: a vendor is ONE entry of data (a URL plus its own
 * data-* attributes). No vendor, host, product or key is named in this module, in the schema, in
 * the renderer or in any default — adding a vendor is an edit to one site's JSON document, never
 * to platform or Template code.
 *
 * Unlike integration.json (a BUILDER input), this document IS part of the SiteSnapshot: the head
 * it produces is rendered by Template code, so the pinned Template Release must carry its (strict)
 * schema. That also means it only becomes usable for a real site once a Release containing this
 * file is cut and the site is re-pinned; until then a site simply has no scripts.json.
 *
 * Everything below is enforced at VALIDATION time (fail-closed, the build stops), never filtered
 * away at render time:
 *   - src is an absolute, canonical https:// URL — no http:, protocol-relative, relative,
 *     javascript:, data:, credentials or fragment;
 *   - there is no field for inline script content, and there must never be one (an inline script
 *     is unreviewable code in the package and breaks the "no remote/inline code" QA story);
 *   - attrs keys are an allowlist (data-* plus the four below), so on* handlers and any attribute
 *     that would shadow src/integrity are rejected by the schema itself;
 *   - ids are slugs, unique within the file, and so are srcs (see MAX_HEAD_SCRIPTS below).
 */

export const HEAD_SCRIPTS_FILE = "scripts.json";

/** A page that needs more than a handful of third-party scripts has a different problem. */
export const MAX_HEAD_SCRIPTS = 8;
export const MAX_ATTRS_PER_SCRIPT = 16;
export const ATTR_VALUE_MAX = 512;
export const SRC_MAX = 512;

/**
 * Characters no stored string may contain: C0/C1 controls, LINE/PARAGRAPH SEPARATOR and the bidi
 * overrides/isolates. Character-for-character the same set as FORBIDDEN_CHAR_RE in
 * platform/integration/contract.ts (§16 HT7); it is re-declared here rather than imported because
 * platform/site/** is a Template Release source while platform/integration/** is NOT collected
 * into a release (platform/release/release.ts, PLATFORM_RUNTIME_DIRS), so an import would break
 * every build from a materialized release. platform/test/slice1.test.ts holds the two identical.
 */
export const FORBIDDEN_CHAR_RE = new RegExp("[\\u0000-\\u001F\\u007F-\\u009F\\u2028\\u2029\\u202A-\\u202E\\u2066-\\u2069]", "u");

/** Author-chosen, stable: it keys the rendered element (ordering determinism) and forces dedupe. */
const HeadScriptIdSchema = z
  .string()
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "id must be lowercase words joined by single hyphens")
  .max(64);

/** data-* in its canonical HTML spelling (the parser lowercases anything else anyway). */
const DATA_ATTR_RE = /^data-[a-z0-9]+(?:-[a-z0-9]+)*$/;

/**
 * The ONLY non-data attributes a declared script may carry, with how the value is checked and
 * which React DOM prop renders it. Because this is an allowlist, `src` (a field of its own),
 * `integrity`/`nonce` (they belong to a signed-resource seam this document deliberately does not
 * have), every `on*` handler and everything else is refused by the schema — never filtered later.
 *
 *   defer          the ONLY way an author opts out of the async default (requirement: async unless
 *                  the attrs say otherwise). Boolean, so its value must be "".
 *   crossorigin    a vendor that serves its script CORS-enabled needs it, and it is what turns
 *                  opaque "Script error." into a real error report. Two spec values, nothing else.
 *   referrerpolicy lets the SITE decide how much of its own URL the third party gets to see. Only
 *                  the tokens that are at least as strict as the browser default are allowed:
 *                  unsafe-url / no-referrer-when-downgrade / origin-when-cross-origin would LEAK
 *                  more than the default, so the seam does not offer them.
 *   type           "module" only — the single value that changes how an EXTERNAL script is parsed.
 *                  Any other value is either the default (a classic-script MIME type) or turns the
 *                  element into an inline data block (importmap, speculationrules), which this
 *                  document cannot express and must not learn to.
 *
 * `async` is deliberately NOT here: it is the seam's default and the renderer owns it. Two sources
 * of truth for one attribute would stop the head from being a pure function of the document.
 */
const ALLOWED_ATTRS = new Map<string, { prop: string; boolean?: true; values?: readonly string[] }>([
  ["defer", { prop: "defer", boolean: true }],
  ["crossorigin", { prop: "crossOrigin", values: ["anonymous", "use-credentials"] }],
  ["referrerpolicy", { prop: "referrerPolicy", values: ["no-referrer", "origin", "same-origin", "strict-origin", "strict-origin-when-cross-origin"] }],
  ["type", { prop: "type", values: ["module"] }],
]);

/** The attribute names an author may write, for error messages and for tests. */
export const ALLOWED_ATTR_NAMES: readonly string[] = [...ALLOWED_ATTRS.keys()];

/** Why this is not a usable script URL, or undefined when it is one. */
function srcProblem(value: string): string | undefined {
  if (FORBIDDEN_CHAR_RE.test(value)) return "src contains a forbidden character";
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return "src must be an absolute https:// URL (a relative path, a protocol-relative //host and javascript:/data: are all refused)";
  }
  if (url.protocol !== "https:") return `src must use https: (got "${url.protocol}")`;
  if (url.username !== "" || url.password !== "") return "src must not carry credentials";
  if (url.hash !== "") return "src must not carry a fragment";
  // Canonical spelling only: the same script must always be the same bytes in the head, and the
  // package QA allowlist matches the declared URL exactly.
  if (url.href !== value) return `src must be written in canonical form ("${url.href}")`;
  return undefined;
}

export const HeadScriptSchema = z
  .object({
    id: HeadScriptIdSchema,
    src: z.string().min(1).max(SRC_MAX),
    /** No inline content field exists — a declared script is always an external, reviewable URL. */
    attrs: z.record(z.string(), z.string()).optional(),
  })
  .strict()
  .superRefine((script, ctx) => {
    const problem = srcProblem(script.src);
    if (problem) ctx.addIssue({ code: "custom", path: ["src"], message: problem });
    const attrs = script.attrs ?? {};
    const names = Object.keys(attrs);
    if (names.length > MAX_ATTRS_PER_SCRIPT) {
      ctx.addIssue({ code: "custom", path: ["attrs"], message: `at most ${MAX_ATTRS_PER_SCRIPT} attributes` });
    }
    for (const name of names) {
      const value = attrs[name]!;
      const path = ["attrs", name];
      if (FORBIDDEN_CHAR_RE.test(name)) {
        ctx.addIssue({ code: "custom", path, message: "attribute name contains a forbidden character" });
        continue;
      }
      const spec = ALLOWED_ATTRS.get(name);
      if (!spec && !DATA_ATTR_RE.test(name)) {
        ctx.addIssue({
          code: "custom",
          path,
          message: `attribute "${name}" is not allowed (data-* in lowercase, or one of: ${ALLOWED_ATTR_NAMES.join(", ")})`,
        });
        continue;
      }
      if (value.length > ATTR_VALUE_MAX) ctx.addIssue({ code: "custom", path, message: `attribute value is longer than ${ATTR_VALUE_MAX} characters` });
      if (FORBIDDEN_CHAR_RE.test(value)) ctx.addIssue({ code: "custom", path, message: "attribute value contains a forbidden character" });
      if (spec?.boolean && value !== "") ctx.addIssue({ code: "custom", path, message: `"${name}" is a boolean attribute: its value must be ""` });
      if (spec?.values && !spec.values.includes(value)) {
        ctx.addIssue({ code: "custom", path, message: `"${name}" must be one of: ${spec.values.join(", ")}` });
      }
    }
  });
export type HeadScript = z.infer<typeof HeadScriptSchema>;

export const SiteHeadScriptsDocSchema = z
  .object({
    schemaVersion: z.literal(1),
    headScripts: z.array(HeadScriptSchema).max(MAX_HEAD_SCRIPTS),
  })
  .strict()
  .superRefine((doc, ctx) => {
    const ids = new Set<string>();
    const srcs = new Set<string>();
    doc.headScripts.forEach((script, i) => {
      if (ids.has(script.id)) ctx.addIssue({ code: "custom", path: ["headScripts", i, "id"], message: `duplicate id "${script.id}"` });
      ids.add(script.id);
      // The same URL twice would be one element after the renderer's own resource dedupe, so the
      // head would stop being a 1:1 image of the document. Refuse it where it is authored.
      if (srcs.has(script.src)) ctx.addIssue({ code: "custom", path: ["headScripts", i, "src"], message: `duplicate src "${script.src}"` });
      srcs.add(script.src);
    });
  });
export type SiteHeadScriptsDoc = z.infer<typeof SiteHeadScriptsDocSchema>;

/**
 * Exactly the attributes to put on one <script>, keyed by React DOM prop name. Built by the
 * platform so that Template code never repeats the allowlist (a new attribute is a platform
 * change, not a Template rewrite).
 */
export type HeadScriptAttributes = {
  readonly src: string;
  readonly async?: true;
  readonly defer?: true;
  readonly crossOrigin?: "anonymous" | "use-credentials";
  readonly referrerPolicy?: "no-referrer" | "origin" | "same-origin" | "strict-origin" | "strict-origin-when-cross-origin";
  readonly type?: "module";
} & { readonly [dataAttribute: `data-${string}`]: string | undefined };

export interface HeadScriptElement {
  /** the author's id: the React key, and the reason the list order is stable */
  readonly id: string;
  readonly attributes: HeadScriptAttributes;
}

/**
 * The document → the elements the Template renders, in authored order. Pure: same document, same
 * elements, same attribute order (src, the load discipline, then the author's attributes sorted by
 * name — so the head does not depend on the key order of the JSON file).
 *
 * Load discipline: `async` unless the author wrote `defer`, so a declared script never blocks the
 * page. (The renderer hoists async scripts to the top of <head>; a deferred one stays where the
 * layout puts it. Both are deterministic.)
 */
export function headScriptElements(doc: SiteHeadScriptsDoc | undefined): readonly HeadScriptElement[] {
  return (doc?.headScripts ?? []).map((script) => {
    const attrs = script.attrs ?? {};
    const attributes: Record<string, string | true> = { src: script.src };
    if (attrs.defer === undefined) attributes.async = true;
    for (const name of Object.keys(attrs).sort()) {
      const spec = ALLOWED_ATTRS.get(name);
      if (!spec) {
        attributes[name] = attrs[name]!;
        continue;
      }
      attributes[spec.prop] = spec.boolean ? true : attrs[name]!;
    }
    return { id: script.id, attributes: attributes as unknown as HeadScriptAttributes };
  });
}
