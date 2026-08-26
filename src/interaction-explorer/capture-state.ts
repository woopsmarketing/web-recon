import type { ElementHandle, Page } from "playwright";
import {
  AFTER_RAF_COUNT,
  CONTAINER_SELECTOR,
  INTERACTIVE_DESCENDANT_SELECTOR,
  LIVE_ATTRIBUTE_NAMES,
  MAX_CONTAINER_INVENTORY,
  MAX_DESCENDANT_DESCRIPTORS,
  MAX_MUTATION_RECORDS,
  MUTATION_ATTRIBUTE_FILTER,
  TEXT_MAX_LEN,
  type ActionOperability,
  type InteractionStateSnapshot,
  type LiveSignals,
  type MutationSummary,
} from "./types.js";
import {
  DYNAMIC_TARGET_ELEMENT_TEXT_CHARS,
  EXPANDED_DYNAMIC_TARGET_DEPTH,
  EXPANDED_DYNAMIC_TARGET_ELEMENTS,
  EXPANDED_DYNAMIC_TARGET_TEXT_CHARS,
  MAX_DYNAMIC_TARGET_DEPTH,
  MAX_DYNAMIC_TARGET_ELEMENTS,
  MAX_DYNAMIC_TARGET_TEXT_CHARS,
  type CapturedSubtree,
} from "./types.js";
import type { ControlRelationType } from "../interaction-detector/types.js";
import {
  collectPageInBrowser,
  type RawCollectResult,
} from "../observer/collect-dom.js";
import { COLLECT_CONFIG } from "../observer/observe-page.js";
import { dedupeStyles } from "../observer/dedupe-styles.js";
import { deriveAssets } from "../observer/collect-assets.js";

/**
 * Before/after state capture, live signal reconciliation and mutation
 * observation (Task 11, items 28, 48–55).
 *
 * Everything in this file that runs inside the page obeys one rule: **the
 * document is read, never copied and never edited**. No `outerHTML`, no
 * `innerHTML`, no serialized DOM, and no attribute is ever written — not even a
 * temporary marker to find an element again (`resolve-live-candidate.ts` returns
 * a real handle instead, precisely so that is unnecessary).
 *
 * The three capture concerns are here together because they are all in-page
 * code with the same constraints — self-contained functions, JSON-serializable
 * arguments, bounded output:
 *
 *   captureSnapshot   candidate + declared targets + stateful container census
 *   readLiveSignals   the attributes Task 09's Observer never stored (item 28)
 *   mutations         a bounded MutationObserver summary (items 52–53)
 *
 * Two deliberate deviations from a naive reading of item 48, both because the
 * naive version would report the wrong thing:
 *
 *  1. Boolean state (`checked`, `open`, `disabled`, …) is read from the live DOM
 *     **property**, not the attribute. Clicking a checkbox moves
 *     `input.checked`; the `checked` attribute is the parse-time default and
 *     never moves. Capturing the attribute would report `no-change` for a
 *     checkbox that visibly toggled.
 *  2. `characterData` mutations are not observed at all. On a live site that
 *     channel is dominated by clocks, counters and analytics text, and item 59
 *     already rules text mutation out as evidence of a state change.
 */

/** Config handed to the in-page snapshot function (JSON-serializable only). */
interface SnapshotConfig {
  attributeNames: string[];
  containerSelector: string;
  descendantSelector: string;
  maxContainers: number;
  maxDescendants: number;
  textMaxLen: number;
}

const SNAPSHOT_CONFIG: SnapshotConfig = {
  attributeNames: [...LIVE_ATTRIBUTE_NAMES],
  containerSelector: CONTAINER_SELECTOR,
  descendantSelector: INTERACTIVE_DESCENDANT_SELECTOR,
  maxContainers: MAX_CONTAINER_INVENTORY,
  maxDescendants: MAX_DESCENDANT_DESCRIPTORS,
  textMaxLen: TEXT_MAX_LEN,
};

/** A stored control relation, flattened for the browser. */
export interface SnapshotControlInput {
  relation: ControlRelationType;
  targetDomId?: string;
}

/**
 * The in-page snapshot. Self-contained by necessity — it is serialized into the
 * browser, so it can not reference anything from module scope.
 */
export function captureSnapshotInBrowser(arg: {
  element: Element | null;
  controls: SnapshotControlInput[];
  config: SnapshotConfig;
}): InteractionStateSnapshot {
  const { element, controls, config } = arg;

  const normText = (s: string): string => s.replace(/\s+/g, " ").trim();
  const tagOf = (el: Element): string => el.tagName.toLowerCase();

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

  /** Playwright's own notion: a non-empty box that is not `visibility:hidden`. */
  const isVisible = (el: Element): boolean => {
    if (!el.isConnected) return false;
    const style = window.getComputedStyle(el);
    if (style.display === "none") return false;
    if (style.visibility === "hidden" || style.visibility === "collapse") return false;
    const rect = el.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0;
  };

  const boxOf = (el: Element): InteractionStateSnapshot["candidate"]["boundingBox"] => {
    const r = el.getBoundingClientRect();
    return {
      x: r.x,
      y: r.y,
      width: r.width,
      height: r.height,
      top: r.top,
      right: r.right,
      bottom: r.bottom,
      left: r.left,
    };
  };

  /**
   * The fixed vocabulary PLUS every remaining `aria-*` attribute.
   *
   * The `aria-*` sweep was added after a measurement: seoworld.co.kr's mobile
   * hamburger carries no ARIA state at all and signals open/closed purely by
   * flipping `aria-label` between "메뉴 열기" and "메뉴 닫기". With a fixed list
   * that transition is invisible and the action reads `no-change` — a false
   * negative on one of the clearest state changes a control can express. The
   * sweep is still bounded (elements carry a handful of ARIA attributes, not a
   * page's worth) and it matches what `readLiveSignalsInBrowser` already does,
   * so the two capture paths cannot drift apart.
   */
  const readAttributes = (el: Element): Record<string, string> => {
    const out: Record<string, string> = {};
    for (const name of config.attributeNames) {
      const value = el.getAttribute(name);
      if (value !== null) out[name] = value;
    }
    for (const attribute of Array.from(el.attributes)) {
      if (attribute.name.startsWith("aria-") && out[attribute.name] === undefined) {
        out[attribute.name] = attribute.value;
      }
    }
    return out;
  };

  /** Boolean state from live DOM PROPERTIES — see the module header. */
  const readState = (el: Element): Record<string, boolean> => {
    const any = el as unknown as Record<string, unknown>;
    const out: Record<string, boolean> = {};
    if (typeof any.disabled === "boolean") out.disabled = any.disabled;
    else if (el.hasAttribute("disabled")) out.disabled = true;
    if (typeof any.readOnly === "boolean") out.readonly = any.readOnly;
    else if (el.hasAttribute("readonly")) out.readonly = true;
    if (typeof any.checked === "boolean") out.checked = any.checked;
    if (typeof any.selected === "boolean") out.selected = any.selected;
    if (typeof any.open === "boolean") out.open = any.open;
    out.hidden = any.hidden === true || el.hasAttribute("hidden");
    out.inert = any.inert === true || el.closest("[inert]") !== null;
    return out;
  };

  const readComputed = (
    el: Element,
  ): InteractionStateSnapshot["candidate"]["computed"] => {
    const style = window.getComputedStyle(el);
    return {
      display: style.display,
      visibility: style.visibility,
      opacity: style.opacity,
      pointerEvents: style.pointerEvents,
      cursor: style.cursor,
    };
  };

  const describeElement = (
    el: Element | null,
  ): InteractionStateSnapshot["candidate"] => {
    if (!el || !el.isConnected) return { exists: false };
    const role = roleOf(el);
    const text = directText(el);
    return {
      exists: true,
      tagName: tagOf(el),
      ...(role !== undefined ? { role } : {}),
      ...(text !== undefined ? { text } : {}),
      visible: isVisible(el),
      boundingBox: boxOf(el),
      attributes: readAttributes(el),
      state: readState(el),
      computed: readComputed(el),
    };
  };

  const describeDescendants = (
    el: Element,
  ): NonNullable<InteractionStateSnapshot["targets"][number]["descendants"]> => {
    const all = Array.from(el.querySelectorAll(config.descendantSelector));
    let buttonCount = 0;
    let linkCount = 0;
    let inputCount = 0;
    let menuitemCount = 0;
    let optionCount = 0;
    let tabCount = 0;
    let statefulCount = 0;
    const samples: {
      tagName: string;
      role?: string;
      text?: string;
      ariaState?: Record<string, string>;
    }[] = [];

    for (const node of all) {
      const tag = tagOf(node);
      const role = roleOf(node);
      if (tag === "button" || role === "button") buttonCount++;
      if (tag === "a" || role === "link") linkCount++;
      if (tag === "input" || tag === "select" || tag === "textarea") inputCount++;
      if (role === "menuitem" || role === "menuitemcheckbox" || role === "menuitemradio") {
        menuitemCount++;
      }
      if (role === "option") optionCount++;
      if (role === "tab") tabCount++;
      const ariaState: Record<string, string> = {};
      for (const name of ["aria-expanded", "aria-selected", "aria-checked", "aria-pressed"]) {
        const value = node.getAttribute(name);
        if (value !== null) ariaState[name] = value;
      }
      if (Object.keys(ariaState).length > 0) statefulCount++;
      if (samples.length < config.maxDescendants) {
        const text = directText(node);
        samples.push({
          tagName: tag,
          ...(role !== undefined ? { role } : {}),
          ...(text !== undefined ? { text } : {}),
          ...(Object.keys(ariaState).length > 0 ? { ariaState } : {}),
        });
      }
    }

    return {
      total: all.length,
      buttonCount,
      linkCount,
      inputCount,
      menuitemCount,
      optionCount,
      tabCount,
      statefulCount,
      samples,
      truncated: all.length > config.maxDescendants,
    };
  };

  // --- declared targets ----------------------------------------------------
  const targets: InteractionStateSnapshot["targets"] = [];
  for (const control of controls) {
    let target: Element | null = null;
    if (control.relation === "details") {
      target = element && element.isConnected ? element.closest("details") : null;
    } else if (control.targetDomId) {
      target = document.getElementById(control.targetDomId);
    }
    const described = describeElement(target);
    targets.push({
      relation: control.relation,
      ...(control.targetDomId !== undefined ? { targetDomId: control.targetDomId } : {}),
      resolved: described.exists,
      element: described,
      ...(target && described.exists ? { descendants: describeDescendants(target) } : {}),
    });
  }

  // --- stateful container inventory (item 51) ------------------------------
  const found = Array.from(document.querySelectorAll(config.containerSelector));
  const seen = new Map<string, number>();
  const containers: InteractionStateSnapshot["containers"]["containers"] = [];
  for (const node of found) {
    if (containers.length >= config.maxContainers) break;
    const tag = tagOf(node);
    const role = roleOf(node);
    const domId = node.getAttribute("id");
    const base = tag + "|" + (domId ?? "") + "|" + (role ?? "");
    const n = seen.get(base) ?? 0;
    seen.set(base, n + 1);
    const any = node as unknown as Record<string, unknown>;
    const ariaHidden = node.getAttribute("aria-hidden");
    const popover = node.getAttribute("popover");
    containers.push({
      key: n === 0 ? base : base + "#" + n,
      tagName: tag,
      ...(role !== null && role !== undefined ? { role } : {}),
      ...(domId !== null ? { domId } : {}),
      visible: isVisible(node),
      ...(typeof any.open === "boolean" ? { open: any.open } : {}),
      ...(ariaHidden !== null ? { ariaHidden } : {}),
      ...(popover !== null ? { popover } : {}),
    });
  }

  return {
    url: document.location.href,
    candidate: describeElement(element),
    targets,
    containers: {
      containers,
      totalCount: found.length,
      truncated: found.length > config.maxContainers,
    },
  };
}

/** Capture ONE snapshot. `element` may be null (removed candidate → exists:false). */
export async function captureSnapshot(
  page: Page,
  element: ElementHandle<Element> | null,
  controls: readonly SnapshotControlInput[],
): Promise<InteractionStateSnapshot> {
  return page.evaluate(captureSnapshotInBrowser, {
    element,
    controls: [...controls],
    config: SNAPSHOT_CONFIG,
  });
}

// ---------------------------------------------------------------------------
// Bounded dynamic-target subtree capture (Task 16, items 68–73)
// ---------------------------------------------------------------------------

/**
 * Capture the contents of a region this action MOUNTED.
 *
 * This is the one place in Task 11 that reads structure rather than state, and
 * it does so by calling the OBSERVER'S OWN in-page walk rooted at the region
 * (item 71) — the same `collectPageInBrowser`, the same attribute and style
 * whitelists, the same visibility derivation, the same `<svg>`-is-opaque rule.
 * A second miniature observer copied in here would be a second policy to keep in
 * sync, and the first time the two disagreed the artifact would be wrong in a
 * way no fixture would catch.
 *
 * Bounded three ways, by global constants, so this can never become a page dump:
 * at most {@link MAX_DYNAMIC_TARGET_ELEMENTS} elements,
 * {@link MAX_DYNAMIC_TARGET_DEPTH} levels and
 * {@link MAX_DYNAMIC_TARGET_TEXT_CHARS} characters of text. A capture that hits
 * a cap records WHICH cap, so a partial region is never mistaken for a small one.
 *
 * Safety (item 72) is inherited rather than re-argued: the Observer's
 * `SKIP_TAGS` drops `<script>`, `<style>`, `<noscript>` and `<template>`
 * subtrees, its `ATTR_WHITELIST` has no `on*` handler and no `class`/`style`,
 * and no form `action` is read. Nothing executable can enter this artifact.
 */
export async function captureDynamicTargetSubtree(
  page: Page,
  target: ElementHandle<Element>,
): Promise<CapturedSubtree | undefined> {
  const collectOnce = (caps: {
    maxElements: number;
    maxDepth: number;
    maxTextChars: number;
  }): Promise<RawCollectResult> =>
    page.evaluate(collectPageInBrowser, {
      config: COLLECT_CONFIG,
      root: target,
      caps: {
        ...caps,
        textSegments: true,
        perElementTextMax: DYNAMIC_TARGET_ELEMENT_TEXT_CHARS,
      },
    });

  let raw: RawCollectResult;
  let expanded = false;
  try {
    raw = await collectOnce({
      maxElements: MAX_DYNAMIC_TARGET_ELEMENTS,
      maxDepth: MAX_DYNAMIC_TARGET_DEPTH,
      maxTextChars: MAX_DYNAMIC_TARGET_TEXT_CHARS,
    });
    /*
     * Task 17.1 §4 — adaptive bounded capture. The retry is gated on RECORDED
     * truncation evidence from the default-cap walk (never a default), and the
     * expanded ceilings are still global hard caps: a portal dialog that
     * inventories 700 elements is captured whole, a page dump stays impossible.
     */
    if ((raw.truncations?.length ?? 0) > 0) {
      raw = await collectOnce({
        maxElements: EXPANDED_DYNAMIC_TARGET_ELEMENTS,
        maxDepth: EXPANDED_DYNAMIC_TARGET_DEPTH,
        maxTextChars: EXPANDED_DYNAMIC_TARGET_TEXT_CHARS,
      });
      expanded = true;
    }
  } catch {
    // A region that tears itself down mid-capture is a fact about the site, not
    // a harness failure: the action keeps its result and simply has no subtree.
    return undefined;
  }
  if (raw.elements.length === 0) return undefined;

  // Node-side post-processing is the Observer's too — one style-dedup policy,
  // one asset-derivation policy, including the Task 16 A1 occurrence mapping.
  const { elements, styleTable } = dedupeStyles(raw.elements);
  const assets = deriveAssets(
    raw.elements,
    raw.images,
    raw.inlineSvgs,
    [],
    [],
    raw.baseUri,
  );

  return {
    provenance: "observed",
    state: "after-action",
    rootElementId: elements[0]!.id,
    elements,
    styleTable,
    assets,
    elementCount: elements.length,
    truncations: [...(raw.truncations ?? [])].sort(),
    ...(expanded ? { expanded: true } : {}),
  };
}

// ---------------------------------------------------------------------------
// Live signal reconciliation (item 28)
// ---------------------------------------------------------------------------

/**
 * Read the attributes Task 09's Observer never stored, straight off the live
 * element, right before the action.
 *
 * This is the whole answer to Task 10's largest recorded limitation. Its
 * `ATTR_WHITELIST` has no `disabled`, no `readonly`, no `open`, no `hidden`, no
 * `inert`, no `checked`, no `popover*` and no `min`/`max`/`step`, so those
 * counted zero in every Task 10 table — not because the controls do not exist,
 * but because they were never saved. Re-observing 52 pages to fix that would
 * cost a full Task 09 run (item 29). Reading them here costs nothing extra: the
 * page is already open and the element is already in hand.
 */
export function readLiveSignalsInBrowser(arg: {
  element: Element;
  config: SnapshotConfig;
}): LiveSignals {
  const { element, config } = arg;
  const any = element as unknown as Record<string, unknown>;
  const tag = element.tagName.toLowerCase();

  const attributes: Record<string, string> = {};
  for (const name of config.attributeNames) {
    const value = element.getAttribute(name);
    if (value !== null) attributes[name] = value;
  }
  // Every remaining ARIA attribute, so a live-only state is never invisible.
  for (const attribute of Array.from(element.attributes)) {
    if (attribute.name.startsWith("aria-") && attributes[attribute.name] === undefined) {
      attributes[attribute.name] = attribute.value;
    }
  }

  const state: Record<string, boolean> = {};
  if (typeof any.disabled === "boolean") state.disabled = any.disabled;
  else if (element.hasAttribute("disabled")) state.disabled = true;
  if (typeof any.readOnly === "boolean") state.readonly = any.readOnly;
  else if (element.hasAttribute("readonly")) state.readonly = true;
  if (typeof any.checked === "boolean") state.checked = any.checked;
  if (typeof any.selected === "boolean") state.selected = any.selected;
  if (typeof any.open === "boolean") state.open = any.open;
  state.hidden = any.hidden === true || element.hasAttribute("hidden");
  state.inert = any.inert === true || element.closest("[inert]") !== null;

  const style = window.getComputedStyle(element);
  const computed = {
    display: style.display,
    visibility: style.visibility,
    opacity: style.opacity,
    pointerEvents: style.pointerEvents,
    cursor: style.cursor,
  };

  const rect = element.getBoundingClientRect();
  const visible =
    element.isConnected &&
    computed.display !== "none" &&
    computed.visibility !== "hidden" &&
    computed.visibility !== "collapse" &&
    rect.width > 0 &&
    rect.height > 0;

  const contentEditableRaw = (any.contentEditable as string | undefined) ?? undefined;
  const contentEditable =
    contentEditableRaw && contentEditableRaw !== "inherit" ? contentEditableRaw : undefined;

  const form = (any.form as { id?: string } | null | undefined) ?? null;
  const buttonType =
    tag === "button" || tag === "input"
      ? ((any.type as string | undefined) ?? undefined)
      : undefined;

  // --- action-specific operability (item 15) -------------------------------
  // A single `operable` boolean would be a lie: a readonly text field can be
  // focused and clicked and can NOT be edited. Task 11 performs no edit, but the
  // distinction is recorded so the next stage need not re-derive it.
  const blockers: string[] = [];
  if (!element.isConnected) blockers.push("detached");
  if (!visible) blockers.push("not-visible");
  if (state.disabled === true) blockers.push("disabled");
  if (attributes["aria-disabled"] === "true") blockers.push("aria-disabled");
  if (state.inert === true) blockers.push("inert");
  if (computed.pointerEvents === "none") blockers.push("pointer-events-none");
  blockers.sort();

  const clickOperable = blockers.length === 0;
  const focusOperable =
    element.isConnected && state.disabled !== true && state.inert !== true;
  const operability: ActionOperability = {
    clickOperable,
    focusOperable,
    toggleOperable: clickOperable,
    editOperable: clickOperable && state.readonly !== true,
    blockers,
  };

  const min = element.getAttribute("min");
  const max = element.getAttribute("max");
  const step = element.getAttribute("step");

  return {
    attributes,
    state,
    computed,
    ...(min !== null ? { min } : {}),
    ...(max !== null ? { max } : {}),
    ...(step !== null ? { step } : {}),
    ...(buttonType !== undefined ? { buttonType } : {}),
    hasForm: form !== null,
    ...(form && form.id ? { formId: form.id } : {}),
    ...(contentEditable !== undefined ? { contentEditable } : {}),
    operability,
  };
}

export async function readLiveSignals(
  page: Page,
  element: ElementHandle<Element>,
): Promise<LiveSignals> {
  return page.evaluate(readLiveSignalsInBrowser, {
    element,
    config: SNAPSHOT_CONFIG,
  });
}

// ---------------------------------------------------------------------------
// Mutation observation (items 52–53)
// ---------------------------------------------------------------------------

interface MutationConfig {
  attributeFilter: string[];
  maxRecords: number;
  valueMaxLen: number;
}

const MUTATION_CONFIG: MutationConfig = {
  attributeFilter: [...MUTATION_ATTRIBUTE_FILTER],
  maxRecords: MAX_MUTATION_RECORDS,
  valueMaxLen: 120,
};

/** Window key used to park the observer between the two evaluate calls. */
const MUTATION_STATE_KEY = "__webReconMutationState";

export function installMutationObserverInBrowser(arg: {
  config: MutationConfig;
  key: string;
}): void {
  const { config, key } = arg;
  const store = window as unknown as Record<string, unknown>;

  const cap = (value: string | null): string | undefined => {
    if (value === null) return undefined;
    const normalized = value.replace(/\s+/g, " ").trim();
    if (normalized === "") return "";
    return normalized.length > config.valueMaxLen
      ? normalized.slice(0, config.valueMaxLen)
      : normalized;
  };

  const state = {
    records: [] as unknown[],
    observedCount: 0,
    attributeMutationCount: 0,
    childListMutationCount: 0,
    addedNodeCount: 0,
    removedNodeCount: 0,
    attributeNameCounts: {} as Record<string, number>,
    observer: null as MutationObserver | null,
  };

  const observer = new MutationObserver((list) => {
    for (const record of list) {
      state.observedCount++;
      if (record.type === "attributes") {
        state.attributeMutationCount++;
        const name = record.attributeName ?? "";
        state.attributeNameCounts[name] = (state.attributeNameCounts[name] ?? 0) + 1;
      } else if (record.type === "childList") {
        state.childListMutationCount++;
        state.addedNodeCount += record.addedNodes.length;
        state.removedNodeCount += record.removedNodes.length;
      }
      if (state.records.length >= config.maxRecords) continue;

      const target = record.target as Element;
      const isElement = target && target.nodeType === 1;
      const tagName = isElement ? target.tagName.toLowerCase() : "#text";
      const targetId = isElement ? target.getAttribute("id") : null;
      const roleRaw = isElement ? target.getAttribute("role") : null;
      const targetRole = roleRaw ? roleRaw.trim().split(/\s+/)[0].toLowerCase() : null;

      if (record.type === "attributes") {
        const name = record.attributeName ?? "";
        state.records.push({
          type: "attributes",
          targetTag: tagName,
          ...(targetId ? { targetId } : {}),
          ...(targetRole ? { targetRole } : {}),
          attributeName: name,
          ...(record.oldValue !== null && record.oldValue !== undefined
            ? { oldValue: cap(record.oldValue) }
            : {}),
          ...(isElement ? { newValue: cap(target.getAttribute(name)) } : {}),
        });
      } else {
        const nodeTags = (nodes: NodeList): string[] => {
          const out: string[] = [];
          for (const node of Array.from(nodes)) {
            if (out.length >= 8) break;
            out.push(
              node.nodeType === 1
                ? (node as Element).tagName.toLowerCase()
                : "#" + String(node.nodeType),
            );
          }
          return out;
        };
        state.records.push({
          type: "childList",
          targetTag: tagName,
          ...(targetId ? { targetId } : {}),
          ...(targetRole ? { targetRole } : {}),
          ...(record.addedNodes.length > 0 ? { addedTags: nodeTags(record.addedNodes) } : {}),
          ...(record.removedNodes.length > 0
            ? { removedTags: nodeTags(record.removedNodes) }
            : {}),
        });
      }
    }
  });

  observer.observe(document.documentElement, {
    childList: true,
    attributes: true,
    subtree: true,
    attributeOldValue: true,
    attributeFilter: config.attributeFilter,
  });
  state.observer = observer;
  store[key] = state;
}

export function collectMutationsInBrowser(arg: {
  key: string;
  maxRecords: number;
  attributeOrder: string[];
}): MutationSummary {
  const store = window as unknown as Record<string, unknown>;
  const state = store[arg.key] as
    | {
        records: unknown[];
        observedCount: number;
        attributeMutationCount: number;
        childListMutationCount: number;
        addedNodeCount: number;
        removedNodeCount: number;
        attributeNameCounts: Record<string, number>;
        observer: MutationObserver | null;
      }
    | undefined;

  if (!state) {
    return {
      recordCount: 0,
      observedCount: 0,
      truncated: false,
      attributeMutationCount: 0,
      childListMutationCount: 0,
      addedNodeCount: 0,
      removedNodeCount: 0,
      attributeNameCounts: {},
      records: [],
    };
  }

  if (state.observer) {
    // Drain anything still queued before disconnecting, so a mutation that
    // happened microseconds ago is not lost.
    const pending = state.observer.takeRecords();
    if (pending.length > 0) {
      for (const record of pending) {
        state.observedCount++;
        if (record.type === "attributes") {
          state.attributeMutationCount++;
          const name = record.attributeName ?? "";
          state.attributeNameCounts[name] = (state.attributeNameCounts[name] ?? 0) + 1;
        } else if (record.type === "childList") {
          state.childListMutationCount++;
          state.addedNodeCount += record.addedNodes.length;
          state.removedNodeCount += record.removedNodes.length;
        }
      }
    }
    state.observer.disconnect();
    state.observer = null;
  }

  // Fixed vocabulary order, so the artifact never inherits object insertion order.
  const attributeNameCounts: Record<string, number> = {};
  for (const name of arg.attributeOrder) {
    const n = state.attributeNameCounts[name];
    if (n > 0) attributeNameCounts[name] = n;
  }

  delete store[arg.key];

  return {
    recordCount: state.records.length,
    observedCount: state.observedCount,
    truncated: state.observedCount > arg.maxRecords,
    attributeMutationCount: state.attributeMutationCount,
    childListMutationCount: state.childListMutationCount,
    addedNodeCount: state.addedNodeCount,
    removedNodeCount: state.removedNodeCount,
    attributeNameCounts,
    records: state.records as MutationSummary["records"],
  };
}

export async function installMutationObserver(page: Page): Promise<void> {
  await page.evaluate(installMutationObserverInBrowser, {
    config: MUTATION_CONFIG,
    key: MUTATION_STATE_KEY,
  });
}

export async function collectMutations(page: Page): Promise<MutationSummary> {
  return page.evaluate(collectMutationsInBrowser, {
    key: MUTATION_STATE_KEY,
    maxRecords: MAX_MUTATION_RECORDS,
    attributeOrder: [...MUTATION_ATTRIBUTE_FILTER],
  });
}

/**
 * Wait for {@link AFTER_RAF_COUNT} animation frames (item 54). Frames first,
 * then a fixed settle: a transition that has not begun painting yet would
 * otherwise be measured in its start state and reported as `no-change`.
 */
export async function waitForAnimationFrames(page: Page): Promise<void> {
  await page.evaluate((count: number) => {
    return new Promise<void>((resolve) => {
      let remaining = count;
      const tick = (): void => {
        remaining--;
        if (remaining <= 0) resolve();
        else requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    });
  }, AFTER_RAF_COUNT);
}
