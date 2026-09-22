/**
 * Generated-stylesheet scanning.
 *
 * `public/wr/generated-styles.css` is the ONLY style channel in a
 * reconstructed app (there are no inline `style` props), so CSS background
 * media is invisible to a DOM-only slotizer — it has to be read out of here.
 * The file mixes one-line `.wr-stNNNNNN{…}` rules with pretty-printed blocks
 * and ~2.8k `@media` blocks, so the scanner is depth-aware: declarations never
 * nest, but rules nest inside at-rules, and an override emitted without its
 * `@media` prelude would apply at every width.
 */

export interface CssRule {
  selector: string;
  body: string;
  /** The enclosing at-rule prelude chain, e.g. `@media (max-width: 800px)`. */
  mediaCondition?: string;
}

export interface BackgroundImageRule extends CssRule {
  /** The full declaration value, e.g. `linear-gradient(...), url("a.png")`. */
  value: string;
  /** The first `url(...)` target — the replaceable asset. */
  url: string;
  /** True when the value also carries gradients/extra layers. */
  layered: boolean;
}

/** Split a declaration value at the first top-level `;` (data: URIs carry `;`). */
function readDeclarationValue(body: string, from: number): string {
  let depth = 0;
  for (let i = from; i < body.length; i++) {
    const ch = body[i]!;
    if (ch === "(") depth++;
    else if (ch === ")") depth--;
    else if (ch === ";" && depth === 0) return body.slice(from, i);
  }
  return body.slice(from);
}

export function declarationValue(body: string, property: string): string | undefined {
  const needle = `${property}:`;
  let index = -1;
  let cursor = 0;
  // Last declaration wins in CSS, so scan forward and keep the final match.
  for (;;) {
    const found = body.indexOf(needle, cursor);
    if (found === -1) break;
    const before = found === 0 ? ";" : body[found - 1]!;
    if (before === ";" || before === "{" || /\s/.test(before)) index = found;
    cursor = found + needle.length;
  }
  if (index === -1) return undefined;
  return readDeclarationValue(body, index + needle.length).trim();
}

const URL_RE = /url\(\s*(?:"([^"]*)"|'([^']*)'|([^)\s]*))\s*\)/;

export function firstUrl(value: string): string | undefined {
  const m = URL_RE.exec(value);
  if (!m) return undefined;
  return m[1] ?? m[2] ?? m[3] ?? undefined;
}

/** Replace only the FIRST `url(...)` — gradients and layer order survive. */
export function replaceFirstUrl(value: string, nextUrl: string): string {
  return value.replace(URL_RE, `url("${nextUrl.replace(/"/g, '\\"')}")`);
}

/**
 * Depth-aware rule walk. Style-rule bodies are taken flat (declarations do not
 * nest); at-rules push their prelude so nested rules keep their condition.
 */
export function forEachRule(css: string, visit: (rule: CssRule) => void): void {
  const stack: string[] = [];
  let preludeStart = 0;
  let i = 0;
  while (i < css.length) {
    const ch = css[i]!;
    if (ch === ";") {
      preludeStart = i + 1;
      i++;
      continue;
    }
    if (ch === "}") {
      stack.pop();
      preludeStart = i + 1;
      i++;
      continue;
    }
    if (ch !== "{") {
      i++;
      continue;
    }
    const prelude = css.slice(preludeStart, i).trim();
    if (prelude.startsWith("@")) {
      stack.push(prelude);
      i++;
      preludeStart = i;
      continue;
    }
    const close = css.indexOf("}", i + 1);
    const end = close === -1 ? css.length : close;
    visit({
      selector: prelude,
      body: css.slice(i + 1, end),
      mediaCondition: stack.length > 0 ? stack.join(" ") : undefined,
    });
    i = end + 1;
    preludeStart = i;
  }
}

/** Every rule that paints a replaceable background asset. */
export function scanBackgroundImageRules(css: string): BackgroundImageRule[] {
  const out: BackgroundImageRule[] = [];
  forEachRule(css, (rule) => {
    // Keyframe steps are animation state, not content.
    if (rule.mediaCondition?.includes("@keyframes")) return;
    if (!rule.body.includes("background-image")) return;
    const value = declarationValue(rule.body, "background-image");
    if (!value || value === "none") return;
    const url = firstUrl(value);
    if (url === undefined || url === "") return;
    out.push({
      ...rule,
      value,
      url,
      layered: /gradient\(/.test(value) || (value.match(/url\(/g)?.length ?? 0) > 1,
    });
  });
  return out;
}
