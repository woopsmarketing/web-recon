/**
 * Inline-SVG text-run scanner (Task 19.1 — Slot V2 v2 `svg-text` bindings).
 *
 * The reconstruction stores every inline SVG as ONE opaque markup string
 * (`RuntimeElementNode.v`, rendered through the app's single
 * `dangerouslySetInnerHTML`). Task 19.1 does NOT promote the SVG tree to
 * SiteSpec nodes — it adds a lightweight, deterministic view of exactly one
 * thing: the character runs a `<text>`/`<tspan>` element actually renders.
 *
 * The scanner is a single-pass tokenizer over the markup:
 *
 *   - a RUN is the maximal character data between two tags whose directly
 *     enclosing element is `<text>` or `<tspan>` and that is not pure
 *     whitespace
 *   - `index` counts EVERY such run in document order, BEFORE any visibility
 *     filtering, so a run's address never moves when filter rules evolve
 *   - candidacy (what may become a slot occurrence) is a separate flag:
 *       · excluded when any ancestor carries `aria-hidden="true"`,
 *         `display:none` / `visibility:hidden` (attribute or inline style),
 *         or is `<title>`/`<desc>` (never painted)
 *       · runs inside `<defs>` are excluded UNLESS an ancestor inside the
 *         defs carries an id that the same markup references via `url(#id)`
 *         or `href="#id"` — Stripe's cutout-mask label
 *         (`<defs><mask id="m"><text>Sign in</text></mask></defs>` +
 *         `<rect mask="url(#m)">`) is user-visible through exactly that
 *         indirection
 *
 * Mutation (`replaceSvgTextRun`) is string surgery on the run's span only:
 * the replacement is entity-escaped before splicing, so no markup — no fill,
 * no stroke, no gradient, no element — can ever be introduced or altered.
 * SVG paint restoration stays out of scope by construction.
 */

export interface SvgTextRun {
  /** Position among ALL text/tspan runs of this markup, document order. */
  index: number;
  /** Raw character data exactly as it appears in the markup. */
  raw: string;
  /** `raw` with the five XML entities decoded — the value the user reads. */
  value: string;
  /** Markup offsets of the raw run (for replacement). */
  start: number;
  end: number;
  /** Human-readable enclosing element path, e.g. `svg>defs>mask>text`. */
  path: string;
  /** True when deterministic evidence says this run is rendered to the user. */
  candidate: boolean;
  /** Why a non-candidate run was excluded (evidence tag). */
  excludedBecause?: string;
}

const ENTITY_MAP: Record<string, string> = {
  "&amp;": "&",
  "&lt;": "<",
  "&gt;": ">",
  "&quot;": '"',
  "&#39;": "'",
  "&#x27;": "'",
  "&apos;": "'",
};

/** Decode the small closed entity set the scanner understands (symmetric with escape). */
export function decodeSvgEntities(raw: string): string {
  return raw.replace(/&(?:amp|lt|gt|quot|apos|#39|#x27);/g, (m) => ENTITY_MAP[m] ?? m);
}

/** Escape a replacement value so it can only ever be character data. */
export function escapeSvgText(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

interface OpenElement {
  tag: string;
  ariaHidden: boolean;
  cssHidden: boolean;
  inDefs: boolean;
  /** ids carried by this element (for defs-reference resolution). */
  id?: string;
}

const SELF_CLOSING_BY_CONVENTION = new Set<string>([]); // SVG serializes explicit closes

function attrValue(attrs: string, name: string): string | undefined {
  const match = new RegExp(`(?:^|\\s)${name}\\s*=\\s*("([^"]*)"|'([^']*)')`, "i").exec(attrs);
  if (!match) return undefined;
  return match[2] ?? match[3] ?? "";
}

function styleHides(style: string | undefined): boolean {
  if (!style) return false;
  return /display\s*:\s*none|visibility\s*:\s*hidden/i.test(style);
}

/** All `#id` references used by paint/geometry indirection in the markup. */
function referencedIds(markup: string): Set<string> {
  const ids = new Set<string>();
  for (const match of markup.matchAll(/url\(\s*['"]?#([^'")\s]+)['"]?\s*\)/gi)) ids.add(match[1]);
  for (const match of markup.matchAll(/(?:xlink:)?href\s*=\s*["']#([^"']+)["']/gi)) ids.add(match[1]);
  return ids;
}

export function scanSvgTextRuns(markup: string): SvgTextRun[] {
  const runs: SvgTextRun[] = [];
  const refs = referencedIds(markup);
  const stack: OpenElement[] = [];
  const tagRe = /<(\/?)([a-zA-Z][a-zA-Z0-9:_-]*)((?:[^>"']|"[^"]*"|'[^']*')*?)(\/?)>|<!--[\s\S]*?-->/g;
  let cursor = 0;
  let index = 0;
  let match: RegExpExecArray | null;

  const emitRun = (start: number, end: number): void => {
    const raw = markup.slice(start, end);
    if (raw.trim() === "") return;
    const top = stack[stack.length - 1];
    if (!top || (top.tag !== "text" && top.tag !== "tspan")) return;
    const runIndex = index++;
    let candidate = true;
    let excludedBecause: string | undefined;
    const inTitleOrDesc = stack.some((e) => e.tag === "title" || e.tag === "desc");
    if (stack.some((e) => e.ariaHidden)) {
      candidate = false;
      excludedBecause = "svg-text-aria-hidden";
    } else if (stack.some((e) => e.cssHidden)) {
      candidate = false;
      excludedBecause = "svg-text-css-hidden";
    } else if (inTitleOrDesc) {
      candidate = false;
      excludedBecause = "svg-text-title-desc";
    } else if (top.inDefs) {
      const referenced = stack.some((e) => e.inDefs && e.id !== undefined && refs.has(e.id));
      if (!referenced) {
        candidate = false;
        excludedBecause = "svg-text-defs-unreferenced";
      }
    }
    runs.push({
      index: runIndex,
      raw,
      value: decodeSvgEntities(raw),
      start,
      end,
      path: stack.map((e) => e.tag).join(">"),
      candidate,
      ...(excludedBecause !== undefined ? { excludedBecause } : {}),
    });
  };

  while ((match = tagRe.exec(markup)) !== null) {
    emitRun(cursor, match.index);
    cursor = tagRe.lastIndex;
    if (match[0].startsWith("<!--")) continue;
    const closing = match[1] === "/";
    const tag = match[2].toLowerCase();
    const attrs = match[3] ?? "";
    const selfClosed = match[4] === "/" || SELF_CLOSING_BY_CONVENTION.has(tag);
    if (closing) {
      for (let i = stack.length - 1; i >= 0; i--) {
        if (stack[i].tag === tag) {
          stack.length = i;
          break;
        }
      }
      continue;
    }
    const parentInDefs = stack.some((e) => e.inDefs);
    const element: OpenElement = {
      tag,
      ariaHidden: attrValue(attrs, "aria-hidden") === "true",
      cssHidden:
        styleHides(attrValue(attrs, "style")) ||
        attrValue(attrs, "display")?.toLowerCase() === "none" ||
        attrValue(attrs, "visibility")?.toLowerCase() === "hidden",
      inDefs: parentInDefs || tag === "defs",
      id: attrValue(attrs, "id"),
    };
    if (!selfClosed) stack.push(element);
  }
  emitRun(cursor, markup.length);
  return runs;
}

/**
 * Replace one addressed run. Returns the new markup, or `undefined` when the
 * guard fails: the run no longer exists or its current (decoded) value is not
 * `expectedValue` — the same never-rewrite-the-wrong-node contract every other
 * binding target honors.
 */
export function replaceSvgTextRun(
  markup: string,
  svgTextIndex: number,
  expectedValue: string,
  newValue: string,
): string | undefined {
  const runs = scanSvgTextRuns(markup);
  const run = runs.find((r) => r.index === svgTextIndex);
  if (!run || run.value !== expectedValue) return undefined;
  if (newValue === run.value) return markup;
  return markup.slice(0, run.start) + escapeSvgText(newValue) + markup.slice(run.end);
}
