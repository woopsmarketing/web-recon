import type { ElementHandle, JSHandle, Page } from "playwright";
import { KNOWN_INPUT_TYPES } from "../interaction-detector/types.js";
import {
  TEXT_MAX_LEN,
  type LocatorAttempt,
  type LocatorDescriptor,
  type LocatorResolution,
  type LocatorStatus,
  type LocatorStrategy,
  type LiveElementDescriptor,
} from "./types.js";

/**
 * Live candidate re-identification (Task 11, items 20–27).
 *
 * The stored candidate says `elementId: e000042`. The live page has never heard
 * of `e000042`. This module is the bridge, and its governing rule is the one
 * from item 23:
 *
 *   > exactly ONE verified match may be acted on. A false action is worse than
 *   > a missed action.
 *
 * There is no similarity score, no fuzzy match and no "closest by distance"
 * anywhere below. Four exact strategies are tried in order, each returning 0, 1
 * or N matches:
 *
 *   A `id-exact`          `#id`, then verification. The id is a HINT (item 21):
 *                         Next.js/Radix/React generate ids like `_R_6spaivb_`
 *                         that move between renders, so a hit still has to prove
 *                         it is the same KIND of element, and a miss must fall
 *                         through instead of failing the whole resolution.
 *   B `semantic-exact`    tag ∧ role ∧ input type ∧ every strong semantic field
 *                         the descriptor carries. Not attempted at all when the
 *                         descriptor has no strong field — "some `<button>`" is
 *                         not an identity.
 *   C `semantic-ancestor` the same predicate narrowed by the semantic ancestor
 *                         path (landmarks / roles / labels, never `<div>` depth).
 *   D `structural-path`   the deterministic `tag:nth-of-type` chain.
 *
 * **Strategy D may narrow, but only inside the semantic match set.** Responsive
 * sites routinely ship the SAME control twice — a desktop nav and a mobile nav
 * with identical markup, one of them hidden by CSS — and for such a pair DOM
 * position genuinely is the only identity there is. So a structural path is
 * allowed to select one, subject to two constraints that keep item 23 intact:
 *
 *   1. its match must pass the same verification as any other (tag, role, input
 *      type, and at least one agreeing strong semantic field), and
 *   2. when an earlier semantic strategy matched several elements, the path's
 *      answer must be ONE OF THEM. A stale path that lands somewhere else is a
 *      `semantic-mismatch`, not a lucky guess.
 *
 * Together those mean the worst case of a path-disambiguated action is clicking
 * a control that is provably semantically identical to the stored one — never
 * an unrelated element. When the path is stale and cannot pick from the set, the
 * answer is `ambiguous` and nothing is clicked. Geometry never participates:
 * `boundingBox` is diagnostic evidence and is not read by any predicate here.
 *
 * No framework-specific regex exists in this file. The policy — try the id,
 * verify it, fall back — is correct for generated and hand-written ids alike.
 */

/** Everything the in-page resolver needs; must be JSON-serializable. */
interface ResolveConfig {
  textMaxLen: number;
  knownInputTypes: string[];
}

const RESOLVE_CONFIG: ResolveConfig = {
  textMaxLen: TEXT_MAX_LEN,
  knownInputTypes: [...KNOWN_INPUT_TYPES],
};

/** Raw result the browser hands back (mirrors {@link LocatorResolution}). */
interface RawResolveResult {
  status: LocatorStatus;
  strategy?: LocatorStrategy;
  matchCount: number;
  attempts: LocatorAttempt[];
  liveDescriptor?: LiveElementDescriptor;
}

interface RawResolveReturn {
  result: RawResolveResult;
  element: Element | null;
}

/**
 * The in-page resolver. Serialized into the browser by `page.evaluateHandle`, so
 * it must be entirely self-contained: every helper is declared inside it and it
 * closes over nothing from the module scope.
 */
export function resolveLocatorInBrowser(arg: {
  descriptor: LocatorDescriptor;
  config: ResolveConfig;
}): RawResolveReturn {
  const { descriptor, config } = arg;

  const normText = (s: string): string => s.replace(/\s+/g, " ").trim();

  const tagOf = (el: Element): string => el.tagName.toLowerCase();

  /** Direct text nodes only, normalized and capped — the Observer's own rule. */
  const directText = (el: Element): string | undefined => {
    let t = "";
    for (const node of Array.from(el.childNodes)) {
      if (node.nodeType === 3) t += node.textContent || "";
    }
    t = normText(t);
    if (!t) return undefined;
    return t.length > config.textMaxLen ? t.slice(0, config.textMaxLen) : t;
  };

  const roleOf = (el: Element): string | undefined => {
    const raw = el.getAttribute("role");
    if (raw === null) return undefined;
    const first = raw.trim().split(/\s+/)[0];
    return first ? first.toLowerCase() : undefined;
  };

  const inputTypeOf = (el: Element): string | undefined => {
    if (tagOf(el) !== "input") return undefined;
    const raw = el.getAttribute("type");
    if (raw === null) return "text";
    const value = raw.trim().toLowerCase();
    if (value === "") return "text";
    return config.knownInputTypes.indexOf(value) >= 0 ? value : "unknown";
  };

  const attr = (el: Element, name: string): string | undefined => {
    const value = el.getAttribute(name);
    return value === null ? undefined : value;
  };

  /** `html:1>body:1>header:1>button:2`, computed the way the Observer walks. */
  const structuralPathOf = (el: Element): string => {
    const parts: string[] = [];
    let current: Element | null = el;
    for (let depth = 0; current && depth < 200; depth++) {
      const tag = tagOf(current);
      const parent: Element | null = current.parentElement;
      let index = 1;
      if (parent) {
        let n = 0;
        for (const child of Array.from(parent.children)) {
          if (tagOf(child) === tag) {
            n++;
            if (child === current) break;
          }
        }
        index = n === 0 ? 1 : n;
      }
      parts.push(tag + ":" + index);
      current = parent;
    }
    return parts.reverse().join(">");
  };

  const describe = (el: Element): LiveElementDescriptor => {
    const domId = attr(el, "id");
    const role = roleOf(el);
    const inputType = inputTypeOf(el);
    const ariaLabel = attr(el, "aria-label");
    const text = directText(el);
    return {
      tagName: tagOf(el),
      ...(domId !== undefined ? { domId } : {}),
      ...(role !== undefined ? { role } : {}),
      ...(inputType !== undefined ? { inputType } : {}),
      ...(ariaLabel !== undefined ? { ariaLabel } : {}),
      ...(text !== undefined ? { text } : {}),
      structuralPath: structuralPathOf(el),
    };
  };

  /** The strong identity fields the descriptor actually carries. */
  const strongFields: { field: string; value: string }[] = [];
  const pushStrong = (field: string, value: string | undefined): void => {
    if (value !== undefined && value.trim() !== "") {
      strongFields.push({ field, value });
    }
  };
  pushStrong("aria-label", descriptor.ariaLabel);
  pushStrong("name", descriptor.name);
  pushStrong("title", descriptor.title);
  pushStrong("placeholder", descriptor.placeholder);
  pushStrong("alt", descriptor.alt);
  pushStrong("text", descriptor.text);

  const liveStrongValue = (el: Element, field: string): string | undefined => {
    if (field === "text") return directText(el);
    return attr(el, field);
  };

  /** tag ∧ role ∧ input type ∧ EVERY strong field the descriptor carries. */
  const semanticMatch = (el: Element): boolean => {
    if (tagOf(el) !== descriptor.tagName) return false;
    if (descriptor.role !== undefined && roleOf(el) !== descriptor.role) return false;
    if (descriptor.inputType !== undefined && inputTypeOf(el) !== descriptor.inputType) {
      return false;
    }
    for (const strong of strongFields) {
      if (liveStrongValue(el, strong.field) !== strong.value) return false;
    }
    return true;
  };

  /**
   * The ancestor chain, matched on MEANING rather than on ids: an ancestor's
   * generated id is exactly as unstable as the element's own, so tag + role +
   * `aria-label` is what is compared. Ancestors must appear in order, but not
   * contiguously — one extra wrapper `<div>` must not invalidate the path.
   */
  const ancestorMatch = (el: Element): boolean => {
    let cursor: Element | null = el.parentElement;
    let need = 0;
    const wanted = descriptor.ancestors;
    while (cursor && need < wanted.length) {
      const target = wanted[need];
      const tagOk = tagOf(cursor) === target.tagName;
      const roleOk = target.role === undefined || roleOf(cursor) === target.role;
      const labelOk =
        target.ariaLabel === undefined ||
        attr(cursor, "aria-label") === target.ariaLabel;
      if (tagOk && roleOk && labelOk) need++;
      cursor = cursor.parentElement;
    }
    return need === wanted.length;
  };

  const byStructuralPath = (): Element[] => {
    const parts = descriptor.structuralPath.split(">").filter((p) => p !== "");
    if (parts.length === 0) return [];
    const parse = (segment: string): { tag: string; index: number } => {
      const i = segment.lastIndexOf(":");
      if (i < 0) return { tag: segment, index: 1 };
      const index = parseInt(segment.slice(i + 1), 10);
      return { tag: segment.slice(0, i), index: Number.isFinite(index) ? index : 1 };
    };
    const root = document.documentElement;
    const first = parse(parts[0]);
    if (!root || tagOf(root) !== first.tag || first.index !== 1) return [];
    let current: Element = root;
    for (let i = 1; i < parts.length; i++) {
      const step = parse(parts[i]);
      const sameTag = Array.from(current.children).filter(
        (c) => tagOf(c) === step.tag,
      );
      const next = sameTag[step.index - 1];
      if (!next) return [];
      current = next;
    }
    return [current];
  };

  /**
   * Item 24. A unique match still has to prove it is the same KIND of element,
   * so live page drift (a generated id reused by something else entirely) can
   * not turn into a click on the wrong control.
   */
  const verify = (el: Element): { ok: boolean; reason?: string } => {
    if (tagOf(el) !== descriptor.tagName) {
      return { ok: false, reason: "tagName " + descriptor.tagName + " vs " + tagOf(el) };
    }
    if (descriptor.role !== undefined && roleOf(el) !== descriptor.role) {
      return { ok: false, reason: "role " + descriptor.role + " vs " + (roleOf(el) ?? "(none)") };
    }
    if (descriptor.inputType !== undefined && inputTypeOf(el) !== descriptor.inputType) {
      return {
        ok: false,
        reason: "input type " + descriptor.inputType + " vs " + (inputTypeOf(el) ?? "(none)"),
      };
    }
    if (strongFields.length > 0) {
      const agreed = strongFields.filter(
        (s) => liveStrongValue(el, s.field) === s.value,
      );
      if (agreed.length === 0) {
        return {
          ok: false,
          reason:
            "no strong semantic field agreed (" +
            strongFields.map((s) => s.field).join(", ") +
            ")",
        };
      }
    }
    return { ok: true };
  };

  const attempts: LocatorAttempt[] = [];
  /** The narrowest non-empty set a STRONG-identity strategy produced. */
  let semanticSet: Element[] = [];
  let sawAmbiguous = false;
  let sawMismatch = false;
  let deciding = 0;

  const finish = (
    strategy: LocatorStrategy,
    element: Element,
    matchCount: number,
  ): RawResolveReturn => ({
    result: {
      status: "resolved",
      strategy,
      matchCount,
      attempts,
      liveDescriptor: describe(element),
    },
    element,
  });

  const record = (
    strategy: LocatorStrategy,
    matches: Element[],
  ): { resolved: Element | null } => {
    if (matches.length === 1) {
      const v = verify(matches[0]);
      attempts.push({
        strategy,
        matchCount: 1,
        verified: v.ok,
        ...(v.reason ? { mismatchReason: v.reason } : {}),
      });
      if (v.ok) {
        deciding = 1;
        return { resolved: matches[0] };
      }
      sawMismatch = true;
      return { resolved: null };
    }
    attempts.push({ strategy, matchCount: matches.length });
    if (matches.length >= 2) {
      sawAmbiguous = true;
      deciding = matches.length;
    }
    return { resolved: null };
  };

  // --- A: exact HTML id -----------------------------------------------------
  if (descriptor.domId !== undefined && descriptor.domId !== "") {
    let idMatches: Element[] = [];
    try {
      idMatches = Array.from(
        document.querySelectorAll("#" + CSS.escape(descriptor.domId)),
      );
    } catch {
      idMatches = Array.from(document.querySelectorAll("*")).filter(
        (el) => el.getAttribute("id") === descriptor.domId,
      );
    }
    const a = record("id-exact", idMatches);
    if (a.resolved) return finish("id-exact", a.resolved, 1);
  }

  // --- B: exact semantic conjunction ---------------------------------------
  const pool = Array.from(document.getElementsByTagName(descriptor.tagName));
  let baseMatches: Element[] = [];
  if (descriptor.hasStrongSemantics) {
    baseMatches = pool.filter(semanticMatch);
    semanticSet = baseMatches;
    const b = record("semantic-exact", baseMatches);
    if (b.resolved) return finish("semantic-exact", b.resolved, 1);
  } else {
    // No strong field: `semanticMatch` degenerates to tag ∧ role ∧ type, which
    // is a POOL, not an identity. It is used to seed strategy C, and it is
    // deliberately not counted as semantic evidence — otherwise an unlabelled
    // icon button in a header with three buttons would be declared ambiguous
    // and could never be explored at all.
    baseMatches = pool.filter(semanticMatch);
  }

  // --- C: semantic + ancestor path -----------------------------------------
  const usableAncestor = descriptor.ancestors.some(
    (a) => a.role !== undefined || a.ariaLabel !== undefined || a.landmark,
  );
  const runAncestor =
    descriptor.ancestors.length > 0 &&
    baseMatches.length > 0 &&
    (descriptor.hasStrongSemantics ? baseMatches.length > 1 : usableAncestor);
  if (runAncestor) {
    const narrowed = baseMatches.filter(ancestorMatch);
    const c = record("semantic-ancestor", narrowed);
    if (c.resolved) return finish("semantic-ancestor", c.resolved, 1);
    if (descriptor.hasStrongSemantics && narrowed.length > 0) semanticSet = narrowed;
  }

  // --- D: deterministic structural path -------------------------------------
  // Allowed to pick from the semantic match set (the duplicated desktop/mobile
  // nav case), but never allowed to pick from OUTSIDE it: if an earlier strategy
  // found real matches and the stored path lands somewhere else, the path is
  // stale and the honest answer is a mismatch, not a click.
  const pathMatches = byStructuralPath();
  if (
    semanticSet.length > 0 &&
    pathMatches.length === 1 &&
    semanticSet.indexOf(pathMatches[0]) < 0
  ) {
    attempts.push({
      strategy: "structural-path",
      matchCount: 1,
      verified: false,
      mismatchReason: "structural path resolved outside the semantic match set",
    });
    sawMismatch = true;
  } else {
    const d = record("structural-path", pathMatches);
    if (d.resolved) return finish("structural-path", d.resolved, 1);
  }

  const status: LocatorStatus = sawAmbiguous
    ? "ambiguous"
    : sawMismatch
      ? "semantic-mismatch"
      : "not-found";

  return {
    result: {
      status,
      matchCount: status === "ambiguous" ? deciding : status === "semantic-mismatch" ? 1 : 0,
      attempts,
    },
    element: null,
  };
}

export interface ResolvedCandidate {
  resolution: LocatorResolution;
  /** Present only when `resolution.status === "resolved"`. */
  element?: ElementHandle<Element>;
}

/**
 * Run the resolver in a live page and hand back a real `ElementHandle`.
 *
 * `evaluateHandle` (rather than `evaluate`) is what makes this possible without
 * touching the page: the browser returns the element itself, so nothing has to
 * be tagged with a temporary attribute or re-queried by a selector this engine
 * invented. The page is observed, never edited (item 100).
 */
export async function resolveLiveCandidate(
  page: Page,
  descriptor: LocatorDescriptor,
): Promise<ResolvedCandidate> {
  const handle: JSHandle<RawResolveReturn> = await page.evaluateHandle(
    resolveLocatorInBrowser,
    { descriptor, config: RESOLVE_CONFIG },
  );
  try {
    const raw = (await (
      await handle.getProperty("result")
    ).jsonValue()) as RawResolveResult;

    const resolution: LocatorResolution = {
      status: raw.status,
      ...(raw.strategy ? { strategy: raw.strategy } : {}),
      matchCount: raw.matchCount,
      attempts: raw.attempts,
      locatorDescriptor: descriptor,
      ...(raw.liveDescriptor ? { liveDescriptor: raw.liveDescriptor } : {}),
    };

    if (raw.status !== "resolved") {
      return { resolution };
    }

    const elementProperty = await handle.getProperty("element");
    const element = elementProperty.asElement() as ElementHandle<Element> | null;
    if (!element) {
      // The browser said resolved but handed back no node: treat it as a miss
      // rather than acting on nothing.
      return {
        resolution: { ...resolution, status: "not-found", matchCount: 0 },
      };
    }
    return { resolution, element };
  } finally {
    await handle.dispose();
  }
}
