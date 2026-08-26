import { parse, type DefaultTreeAdapterTypes } from "parse5";
import { SKIP_TAGS } from "../observer/types.js";
import { SUPPLEMENTAL_ATTRIBUTES, type AlignmentFailure } from "./types.js";

/**
 * rendered.html content recovery (Task 13, items 24–29).
 *
 * Two things `dom.json` cannot express, and both are fatal for reconstruction:
 *
 *   1. Text is capped. The Observer stores 200 characters of normalized DIRECT
 *      text per element, so every paragraph longer than that is silently cut.
 *   2. Mixed content has no order. `<p>Hello <strong>world</strong> !</p>` gives
 *      the `<p>` a single `text: "Hello !"` field, and nothing anywhere says the
 *      `<strong>` belonged between the two halves.
 *
 * Task 09 also saved `rendered.html` — the same DOM, serialized — which has both.
 * So this module re-parses it as a SECOND OBSERVATION CHANNEL and uses it for
 * text and child ordering only. `dom.json` stays the source of truth for
 * structure, geometry and computed style (item 25); nothing here overrides it.
 *
 * The channels are only combined when they PROVABLY describe the same tree. The
 * parse is walked with the Observer's own traversal semantics — the same skip
 * list, the same "an inline `<svg>` root is opaque, do not descend" rule — and
 * the result must reproduce `dom.json`'s element count, tag sequence AND parent
 * relation exactly. Anything less is a `fallback`, recorded with a reason; there
 * is deliberately no fuzzy merge, because a text node attached to the wrong
 * element is worse than a missing one (item 29).
 *
 * Task 13.1 adds a third thing the same verified alignment can carry: a CLOSED
 * ALLOWLIST of declarative attributes the Observer's whitelist never recorded
 * (`colspan`, `open`, `disabled`, `checked`, …). They are filtered at harvest
 * time rather than after, so nothing outside the allowlist is ever held in
 * memory, let alone compiled — see `SUPPLEMENTAL_ATTRIBUTES`.
 *
 * No browser is involved. parse5 is a pure HTML5 parser, and this file is the
 * only place in the module that touches markup.
 */

type P5Node = DefaultTreeAdapterTypes.Node;
type P5Element = DefaultTreeAdapterTypes.Element;
type P5ChildNode = DefaultTreeAdapterTypes.ChildNode;

const HTML_NAMESPACE = "http://www.w3.org/1999/xhtml";

/** The Observer's skip set, reused verbatim rather than re-declared (item 27). */
const SKIP = new Set<string>(SKIP_TAGS);

function isElement(node: P5Node): node is P5Element {
  return typeof (node as P5Element).tagName === "string";
}

/**
 * The value `Element.tagName` would have returned in the browser: uppercase for
 * HTML-namespace elements, verbatim for foreign content (`svg`, `clipPath`,
 * `foreignObject`). The Observer's skip test compares against an UPPERCASE set,
 * so an SVG-namespace `<title>` or `<style>` was never skipped by it — and must
 * not be skipped here either.
 */
function domTagName(el: P5Element): string {
  return el.namespaceURI === HTML_NAMESPACE ? el.tagName.toUpperCase() : el.tagName;
}

function attrValue(el: P5Element, name: string): string | undefined {
  for (const attr of el.attrs) {
    if (attr.name === name && !attr.prefix) return attr.value;
  }
  return undefined;
}

/** One ordered child of an aligned element: another element, or literal text. */
export type AlignedChild =
  | { kind: "element"; elementIndex: number }
  | { kind: "text"; value: string };

export interface AlignmentSuccess {
  status: "aligned";
  parsedElementCount: number;
  /** Indexed by the dom.json element index; document child order preserved. */
  children: AlignedChild[][];
  /** Indexed likewise: the source `<form>` declared an `action` (item 38). */
  formHasAction: boolean[];
  /**
   * Allowlisted declarative attributes found on the parsed element, keyed by
   * the dom.json element index (Task 13.1). SPARSE on purpose: the four test
   * sites recover something on 324 of 148,373 elements, so an array of empty
   * objects would cost far more than the data it carries.
   */
  supplementalAttributes: Map<number, Record<string, string>>;
}

export interface AlignmentFallback {
  status: "fallback";
  failure: AlignmentFailure;
  parsedElementCount?: number;
  mismatchIndex?: number;
  /** Small and deterministic (`parsed=div source=span`) — never a DOM dump. */
  mismatchDetail?: string;
}

export type AlignmentResult = AlignmentSuccess | AlignmentFallback;

/** The minimum a dom.json element has to expose for alignment. */
export interface AlignableElement {
  id: string;
  parentId?: string;
  tagName: string;
}

interface WalkRecord {
  tagName: string;
  parentIndex: number;
}

/**
 * Walk a parsed document exactly the way `collect-dom.ts` walked the live one.
 *
 * Kept as a faithful mirror on purpose: every divergence between this function
 * and the Observer's `walk()` shows up as an alignment failure on a real page,
 * which is a loud, countable signal rather than a subtly wrong tree.
 */
function walkParsed(root: P5Element): {
  records: WalkRecord[];
  children: AlignedChild[][];
  formHasAction: boolean[];
  supplementalAttributes: Map<number, Record<string, string>>;
} {
  const records: WalkRecord[] = [];
  const children: AlignedChild[][] = [];
  const formHasAction: boolean[] = [];
  const supplementalAttributes = new Map<number, Record<string, string>>();

  const visit = (el: P5Element, parentIndex: number): number | null => {
    if (SKIP.has(domTagName(el))) return null;

    const index = records.length;
    const lower = el.tagName.toLowerCase();
    records.push({ tagName: lower, parentIndex });
    children.push([]);
    formHasAction.push(lower === "form" && attrValue(el, "action") !== undefined);

    // Allowlist harvest. Restricted to unprefixed attributes on HTML-namespace
    // elements: inside foreign content the same spelling is a different
    // attribute (SVG has its own `hidden`-adjacent rules and `xlink:` names),
    // and this recovery reasons about HTML semantics only.
    if (el.namespaceURI === HTML_NAMESPACE) {
      let recovered: Record<string, string> | undefined;
      for (const attr of el.attrs) {
        if (attr.prefix) continue;
        if (!Object.hasOwn(SUPPLEMENTAL_ATTRIBUTES, attr.name)) continue;
        recovered ??= {};
        // A duplicate attribute is impossible per the HTML parser (later
        // duplicates are dropped), so first-wins here matches the browser.
        recovered[attr.name] ??= attr.value;
      }
      if (recovered !== undefined) supplementalAttributes.set(index, recovered);
    }

    // Inline SVG: the Observer records the root and stops. Its subtree lives in
    // the asset catalog as markup, so descending here would produce nodes that
    // have no counterpart in dom.json and break every alignment (item 27).
    if (lower === "svg") return index;

    const childNodes = (el as { childNodes?: P5ChildNode[] }).childNodes ?? [];
    for (const child of childNodes) {
      if (child.nodeName === "#text") {
        children[index]!.push({
          kind: "text",
          value: (child as DefaultTreeAdapterTypes.TextNode).value,
        });
      } else if (isElement(child)) {
        const childIndex = visit(child, index);
        if (childIndex !== null) {
          children[index]!.push({ kind: "element", elementIndex: childIndex });
        }
      }
      // Comments and doctype carry nothing a renderer needs; dropped silently.
    }
    return index;
  };

  visit(root, -1);
  return { records, children, formHasAction, supplementalAttributes };
}

/**
 * Try to align `rendered.html` with `dom.json`.
 *
 * Returns `aligned` only when the parse reproduces the observation exactly:
 * same element count, same tag at every position, and the same parent at every
 * position. Parent equality is what makes this a STRUCTURAL check rather than a
 * sequence coincidence — two different trees can flatten to the same tag list.
 */
export function alignRenderedHtml(
  html: string,
  domElements: readonly AlignableElement[],
): AlignmentResult {
  let document: DefaultTreeAdapterTypes.Document;
  try {
    document = parse(html);
  } catch {
    return { status: "fallback", failure: "parse-error" };
  }

  const documentElement = document.childNodes.find(
    (node): node is P5Element => isElement(node) && node.tagName === "html",
  );
  if (!documentElement) {
    return { status: "fallback", failure: "no-document-element" };
  }

  const { records, children, formHasAction, supplementalAttributes } =
    walkParsed(documentElement);

  if (records.length !== domElements.length) {
    // Report where they first diverge when they do, so a mismatch is diagnosable
    // instead of being just two numbers.
    const shared = Math.min(records.length, domElements.length);
    let firstDiff: number | undefined;
    for (let i = 0; i < shared; i++) {
      if (records[i]!.tagName !== domElements[i]!.tagName) {
        firstDiff = i;
        break;
      }
    }
    return {
      status: "fallback",
      failure: "element-count-mismatch",
      parsedElementCount: records.length,
      ...(firstDiff !== undefined
        ? {
            mismatchIndex: firstDiff,
            mismatchDetail: `parsed=${records[firstDiff]!.tagName} source=${domElements[firstDiff]!.tagName}`,
          }
        : {}),
    };
  }

  const indexById = new Map<string, number>();
  for (let i = 0; i < domElements.length; i++) {
    indexById.set(domElements[i]!.id, i);
  }

  for (let i = 0; i < records.length; i++) {
    const parsed = records[i]!;
    const source = domElements[i]!;
    if (parsed.tagName !== source.tagName) {
      return {
        status: "fallback",
        failure: "tag-sequence-mismatch",
        parsedElementCount: records.length,
        mismatchIndex: i,
        mismatchDetail: `parsed=${parsed.tagName} source=${source.tagName}`,
      };
    }
    const sourceParentIndex =
      source.parentId === undefined ? -1 : (indexById.get(source.parentId) ?? -2);
    if (parsed.parentIndex !== sourceParentIndex) {
      return {
        status: "fallback",
        failure: "parent-relation-mismatch",
        parsedElementCount: records.length,
        mismatchIndex: i,
        mismatchDetail: `parsedParent=${parsed.parentIndex} sourceParent=${sourceParentIndex}`,
      };
    }
  }

  return {
    status: "aligned",
    parsedElementCount: records.length,
    children,
    formHasAction,
    supplementalAttributes,
  };
}

/** Whitespace-collapsing identical to the Observer's, for diagnostic text only. */
export function normalizeText(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}
