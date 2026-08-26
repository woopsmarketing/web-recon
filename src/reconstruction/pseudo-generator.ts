import type { StyleCatalog } from "../sitespec/index.js";
import { isSafeCssProperty, isSafeCssValue } from "./style-generator.js";
import { WR_PREFIX } from "./types.js";

/**
 * `::before` / `::after` reconstruction (items 66, 67, 115).
 *
 * A pseudo-element has no node of its own, so it cannot carry a class. It is
 * addressed through its OWNER, and the owner is addressed by the one stable
 * handle the clone gives every element: `data-wr-node`.
 *
 * Node ids are viewport-LOCAL AND page-local — desktop `n000123` on p000001 and
 * on p000002 are two different elements in two different observations — so every
 * selector is scoped to both (item 115):
 *
 *   [data-wr-page="p000001"][data-wr-viewport="desktop"] [data-wr-node="n000123"]::before { … }
 *
 * Scoping by viewport alone would be enough for one page, and wrong the moment a
 * second page reuses the id — which, since ids are assigned per viewport from 1,
 * every page does.
 *
 * Only OBSERVED pseudo content is emitted. Nothing is inferred, no `content` is
 * synthesized for an element that had none, and the Observer only recorded a
 * pseudo-element at all when its computed `content` was renderable (item 67).
 */

export interface PseudoRuleInput {
  pageId: string;
  viewportId: string;
  nodeId: string;
  which: "before" | "after";
  styleTokenId: string;
  /** The observed computed `content`, when the SiteSpec carried one. */
  content?: string;
}

export interface GeneratedPseudoStyles {
  css: string;
  ruleCount: number;
  declarationCount: number;
  missingTokens: string[];
  rejectedValues: number;
}

/** The pseudo selector for one owner node, scoped to its page + viewport root. */
export function pseudoSelector(
  pageId: string,
  viewportId: string,
  nodeId: string,
  which: "before" | "after",
): string {
  return (
    `[data-${WR_PREFIX}-page="${pageId}"][data-${WR_PREFIX}-viewport="${viewportId}"] ` +
    `[data-${WR_PREFIX}-node="${nodeId}"]::${which}`
  );
}

/**
 * Emit pseudo rules in the order they are given.
 *
 * The caller supplies them in (page, viewport, node, before-then-after) order,
 * which is document order, so the stylesheet is deterministic without this
 * function needing to know what a page is.
 */
export function generatePseudoStyles(
  rules: readonly PseudoRuleInput[],
  styleCatalog: StyleCatalog,
): GeneratedPseudoStyles {
  const byId = new Map(
    styleCatalog.styles.map((token) => [token.styleTokenId, token]),
  );
  const missingTokens: string[] = [];
  const parts: string[] = [];
  let declarationCount = 0;
  let rejectedValues = 0;

  for (const rule of rules) {
    const token = byId.get(rule.styleTokenId);
    if (!token) {
      missingTokens.push(rule.styleTokenId);
      continue;
    }
    const declarations: string[] = [];
    for (const name of Object.keys(token.properties).sort()) {
      if (!isSafeCssProperty(name)) continue;
      const value = token.properties[name]!;
      /*
       * `content` is the one property whose value is authored TEXT, so it is the
       * one that can carry a space, a quote or a newline. The generic value
       * guard would reject `content: "Read more"` for containing a space, which
       * would silently delete real page content — so `content` gets its own,
       * stricter test: it must be an already-quoted computed value with no way
       * out of the declaration.
       */
      if (name === "content") {
        if (!isSafeContentValue(value)) {
          rejectedValues++;
          continue;
        }
      } else if (!isSafeCssValue(value)) {
        rejectedValues++;
        continue;
      }
      declarations.push(`${name}:${value}`);
      declarationCount++;
    }
    if (declarations.length === 0) continue;
    parts.push(
      `${pseudoSelector(rule.pageId, rule.viewportId, rule.nodeId, rule.which)}{${declarations.join(";")}}`,
    );
  }

  return {
    css: parts.join("\n"),
    ruleCount: parts.length,
    declarationCount,
    missingTokens: [...new Set(missingTokens)].sort(),
    rejectedValues,
  };
}

/**
 * A computed `content` value is safe when it cannot leave its declaration.
 *
 * The browser's computed form is already normalized — a string is quoted and its
 * inner quotes and backslashes are escaped — so the check is about what CANNOT be
 * there: a declaration or rule terminator, a newline, or a `</style`.
 */
export function isSafeContentValue(value: string): boolean {
  if (value === "" || value === "none" || value === "normal") return false;
  if (/[;{}]/.test(value)) return false;
  if (/[\n\r\f]/.test(value)) return false;
  if (/<\s*\/?\s*style/i.test(value)) return false;
  const doubles = (value.match(/(?<!\\)"/g) ?? []).length;
  const singles = (value.match(/(?<!\\)'/g) ?? []).length;
  return doubles % 2 === 0 && singles % 2 === 0;
}
