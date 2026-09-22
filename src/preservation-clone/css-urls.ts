/**
 * CSS resource-URL discovery and rewriting for the Preservation Clone.
 *
 * The repository has no CSS AST parser, and Phase 2 explicitly must NOT
 * normalize or reformat CSS — reformatting is a silent way to lose source
 * semantics. So this is a token scanner, not a parser: it locates the exact
 * character span of every `url(...)` payload and every bare `@import "..."`
 * target, and a rewrite splices new text into those spans only. Byte-for-byte,
 * everything outside those spans survives untouched: selectors, `calc()`,
 * `clamp()`, `@media`, `@supports`, `@container`, custom properties, vendor
 * prefixes, comments and whitespace.
 *
 * Deliberately left alone:
 *   - `data:` / `blob:` / `about:` / `javascript:` payloads (self-contained or
 *     unsafe to localize),
 *   - fragment-only references such as `url(#mask-0)`, which address an element
 *     in the current document, not a resource.
 */

const URL_TOKEN =
  /url\(\s*(?:"((?:[^"\\]|\\.)*)"|'((?:[^'\\]|\\.)*)'|((?:[^)"'\s\\]|\\.)*))\s*\)/g;

/** `@import "x.css"` — the `@import url(...)` form is already covered above. */
const IMPORT_STRING =
  /@import\s+(?:"((?:[^"\\]|\\.)*)"|'((?:[^'\\]|\\.)*)')/g;

export interface CssUrlRef {
  /** Authored payload text, escapes still encoded. */
  raw: string;
  /** Payload with CSS backslash escapes resolved. */
  value: string;
  /** Absolute URL, or null when unresolvable / deliberately skipped. */
  resolved: string | null;
  /** Character span of the payload inside the stylesheet text. */
  start: number;
  end: number;
  quote: '"' | "'" | "";
  kind: "url" | "import";
}

function unescapeCss(raw: string): string {
  return raw.replace(/\\(.)/g, "$1");
}

function escapeCss(value: string, quote: '"' | "'" | ""): string {
  if (quote === "") return value.replace(/([()\s'"\\])/g, "\\$1");
  return value.replace(/\\/g, "\\\\").replace(new RegExp(quote, "g"), `\\${quote}`);
}

/** URLs that are already self-contained or are not resources at all. */
export function isNonLocalizableCssUrl(value: string): boolean {
  const v = value.trim();
  if (v === "") return true;
  if (v.startsWith("#")) return true; // in-document reference, e.g. url(#clip)
  return /^(data|blob|about|javascript|mailto|tel):/i.test(v);
}

function resolveAgainst(value: string, baseUrl: string | null): string | null {
  const v = value.trim();
  if (isNonLocalizableCssUrl(v)) return null;
  try {
    return baseUrl ? new URL(v, baseUrl).href : new URL(v).href;
  } catch {
    return null;
  }
}

/**
 * Every resource reference in `css`, in source order.
 *
 * `baseUrl` is the stylesheet's OWN url when it is a linked sheet, and the
 * document url for a `<style>` tag — matching how a browser resolves them.
 */
/** Character spans covered by `/* ... *\/` comments. */
function commentSpans(css: string): [number, number][] {
  const spans: [number, number][] = [];
  for (let i = css.indexOf("/*"); i !== -1; i = css.indexOf("/*", i)) {
    const end = css.indexOf("*/", i + 2);
    const stop = end === -1 ? css.length : end + 2;
    spans.push([i, stop]);
    i = stop;
  }
  return spans;
}

export function collectCssUrlRefs(
  css: string,
  baseUrl: string | null,
): CssUrlRef[] {
  const refs: CssUrlRef[] = [];
  // A commented-out declaration is not a live reference. Rewriting one would
  // both alter bytes this module promises to leave alone and invent a residual
  // dependency for a URL no browser will ever request.
  const comments = commentSpans(css);
  const inComment = (index: number): boolean =>
    comments.some(([start, end]) => index >= start && index < end);

  const scan = (
    re: RegExp,
    kind: CssUrlRef["kind"],
    groupCount: number,
  ): void => {
    re.lastIndex = 0;
    for (let m = re.exec(css); m !== null; m = re.exec(css)) {
      let raw: string | undefined;
      let quote: '"' | "'" | "" = "";
      if (m[1] !== undefined) {
        raw = m[1];
        quote = '"';
      } else if (m[2] !== undefined) {
        raw = m[2];
        quote = "'";
      } else if (groupCount > 2 && m[3] !== undefined) {
        raw = m[3];
        quote = "";
      }
      if (raw === undefined) continue;
      if (inComment(m.index)) continue;
      // Locate the payload precisely: the last occurrence of the raw text
      // inside this match is the payload itself (the prefix is `url(` / `@import`).
      const matchStart = m.index;
      const offset = m[0].lastIndexOf(raw);
      const start = matchStart + (raw === "" ? m[0].length - (quote ? 2 : 1) : offset);
      const value = unescapeCss(raw);
      refs.push({
        raw,
        value,
        resolved: resolveAgainst(value, baseUrl),
        start,
        end: start + raw.length,
        quote,
        kind,
      });
    }
  };

  scan(URL_TOKEN, "url", 3);
  scan(IMPORT_STRING, "import", 2);
  refs.sort((a, b) => a.start - b.start);
  return refs;
}

export interface CssRewriteResult {
  css: string;
  rewritten: number;
  refs: CssUrlRef[];
}

/**
 * Splice replacements into the payload spans only.
 *
 * `replace` returns the new payload (typically a clone-relative path) or null
 * to leave the reference exactly as authored.
 */
export function rewriteCssUrls(
  css: string,
  baseUrl: string | null,
  replace: (ref: CssUrlRef) => string | null,
): CssRewriteResult {
  const refs = collectCssUrlRefs(css, baseUrl);
  let out = "";
  let cursor = 0;
  let rewritten = 0;
  for (const ref of refs) {
    const next = replace(ref);
    if (next === null) continue;
    out += css.slice(cursor, ref.start);
    out += escapeCss(next, ref.quote);
    cursor = ref.end;
    rewritten += 1;
  }
  out += css.slice(cursor);
  return { css: out, rewritten, refs };
}
