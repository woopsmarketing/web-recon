import type { ElementObservation } from "../observer/types.js";
import {
  normalizeInputType,
  type InteractionCandidate,
} from "../interaction-detector/types.js";
import {
  IDENTITY_ATTRIBUTES,
  MAX_ANCESTOR_DEPTH,
  SEMANTIC_ANCESTOR_TAGS,
  TEXT_MAX_LEN,
  type LocatorAncestor,
  type LocatorDescriptor,
} from "./types.js";
import type { LoadedViewportDom } from "./load-analysis.js";

/**
 * Locator descriptor construction (Task 11, items 20–21).
 *
 * The single most important rule of this Task lives here:
 *
 *   > `candidate.elementId` is provenance, never a locator.
 *
 * `e000042` means "the 42nd element of one particular saved DOM walk". Re-open
 * the URL and one extra `<div>` renumbers every element after it, so acting on
 * that id would silently click a different control. Everything below exists so
 * that never has to happen: a descriptor is built once, offline, from the stored
 * candidate plus its `dom.json` neighbourhood, and the live run re-finds the
 * element from the descriptor alone.
 *
 * What goes into identity, and what deliberately does not:
 *
 *   IN   tag, HTML id, role, input type, name, aria-label, title, placeholder,
 *        alt, normalized text, semantic ancestor path, sibling position,
 *        deterministic structural path
 *   OUT  the whole `class` string (utility CSS churns on every style edit),
 *        every `data-*` VALUE (arbitrary and framework-specific),
 *        `aria-controls` (its value is routinely a generated id — item 21),
 *        geometry (kept, but as diagnostic evidence only)
 *
 * The HTML id is stored and tried FIRST, but it is a hint, not proof. Next.js,
 * Radix and React all emit ids like `_R_6spaivb_` that change between renders,
 * so a match on id still has to pass semantic verification before it may act —
 * and a miss on id has to fall through to the semantic strategies. There is no
 * framework-specific regex anywhere in this module; the policy is "verify, then
 * fall back", which is correct for generated and hand-written ids alike.
 */

/** First token of a `role` attribute, lower-cased (ARIA: first valid token wins). */
function normalizeRole(raw: string | undefined): string | undefined {
  if (raw === undefined) return undefined;
  const first = raw.trim().split(/\s+/, 1)[0];
  return first ? first.toLowerCase() : undefined;
}

/** Collapse whitespace and cap length, matching the Observer's text policy. */
function normalizeText(raw: string | undefined): string | undefined {
  if (raw === undefined) return undefined;
  const value = raw.replace(/\s+/g, " ").trim();
  if (value === "") return undefined;
  return value.length > TEXT_MAX_LEN ? value.slice(0, TEXT_MAX_LEN) : value;
}

/** ARIA state values, kept as diagnostics — never used to match (item 20). */
const ARIA_STATE_KEYS: readonly string[] = [
  "aria-expanded",
  "aria-pressed",
  "aria-selected",
  "aria-checked",
  "aria-haspopup",
];

function ariaStateOf(element: ElementObservation): Record<string, string> {
  const out: Record<string, string> = {};
  for (const key of ARIA_STATE_KEYS) {
    const value = element.attributes[key];
    if (value !== undefined) out[key] = value;
  }
  return out;
}

/**
 * Index of an element among its same-tag siblings, plus how many there are.
 * This is the raw material of `:nth-of-type`, computed from the OBSERVED tree
 * (which skips `<script>`/`<style>`/…), so it is recomputed live the same way
 * rather than being trusted as a CSS selector — see `resolve-live-candidate.ts`.
 */
function siblingPosition(
  element: ElementObservation,
  dom: LoadedViewportDom,
): { index: number; count: number } {
  const siblings = dom.childrenByParentId.get(element.parentId ?? "") ?? [];
  const sameTag = siblings.filter((s) => s.tagName === element.tagName);
  const index = sameTag.findIndex((s) => s.id === element.id);
  return {
    index: index < 0 ? 0 : index,
    count: sameTag.length === 0 ? 1 : sameTag.length,
  };
}

/**
 * `html>body>div:2>header:1>button:2` — a deterministic chain from the root, in
 * OBSERVED-tree terms. It is the last resort (strategy D) precisely because it
 * is the most brittle: one wrapper `<div>` invalidates it. It costs nothing to
 * store and it is the only thing left when a control has no text, no label and
 * no id.
 */
function structuralPathOf(
  element: ElementObservation,
  dom: LoadedViewportDom,
): string {
  const parts: string[] = [];
  let current: ElementObservation | undefined = element;
  // `MAX` guards against a malformed parent chain; observed DOM is a tree.
  for (let depth = 0; current && depth < 200; depth++) {
    const { index } = siblingPosition(current, dom);
    parts.push(`${current.tagName}:${index + 1}`);
    current = current.parentId ? dom.byElementId.get(current.parentId) : undefined;
  }
  return parts.reverse().join(">");
}

/**
 * The nearest-first semantic ancestors. Only ancestors that SAY something are
 * kept — an id, a role, an `aria-label`, or a structural tag — because a chain
 * of anonymous `<div>`s narrows nothing and ages badly.
 */
function ancestorsOf(
  element: ElementObservation,
  dom: LoadedViewportDom,
): LocatorAncestor[] {
  const out: LocatorAncestor[] = [];
  let current = element.parentId ? dom.byElementId.get(element.parentId) : undefined;
  for (let depth = 0; current && out.length < MAX_ANCESTOR_DEPTH && depth < 200; depth++) {
    const domId = current.attributes["id"];
    const role = normalizeRole(current.attributes["role"]);
    const ariaLabel = current.attributes["aria-label"];
    const landmark = SEMANTIC_ANCESTOR_TAGS.includes(current.tagName);
    if (domId !== undefined || role !== undefined || ariaLabel !== undefined || landmark) {
      out.push({
        tagName: current.tagName,
        ...(domId !== undefined ? { domId } : {}),
        ...(role !== undefined ? { role } : {}),
        ...(ariaLabel !== undefined ? { ariaLabel } : {}),
        landmark,
      });
    }
    current = current.parentId ? dom.byElementId.get(current.parentId) : undefined;
  }
  return out;
}

/**
 * Build the descriptor for ONE stored candidate.
 *
 * Pure and deterministic: same candidate + same `dom.json` → same descriptor,
 * byte for byte. That is what lets `interaction-plan.json` be compared across
 * runs (item 90).
 */
export function buildLocatorDescriptor(
  candidate: InteractionCandidate,
  dom: LoadedViewportDom,
): LocatorDescriptor {
  const element = dom.byElementId.get(candidate.elementId);
  if (!element) {
    // The loader already rejects this; the guard keeps the function total.
    throw new Error(
      `cannot build a locator for ${candidate.id}: ${candidate.elementId} is not in dom.json`,
    );
  }

  const attributes = element.attributes;
  const domId = attributes["id"];
  const role = normalizeRole(attributes["role"]);
  const inputType =
    element.tagName === "input"
      ? normalizeInputType(attributes["type"])
      : undefined;
  const name = attributes["name"];
  const ariaLabel = attributes["aria-label"];
  const title = attributes["title"];
  const placeholder = attributes["placeholder"];
  const alt = attributes["alt"];
  const text = normalizeText(candidate.text ?? element.text);

  const strongValues = [
    ariaLabel,
    name,
    title,
    placeholder,
    alt,
    text,
  ].filter((v): v is string => v !== undefined && v.trim() !== "");

  const { index, count } = siblingPosition(element, dom);

  return {
    tagName: element.tagName,
    ...(domId !== undefined ? { domId } : {}),
    ...(role !== undefined ? { role } : {}),
    ...(inputType !== undefined ? { inputType } : {}),
    ...(name !== undefined ? { name } : {}),
    ...(ariaLabel !== undefined ? { ariaLabel } : {}),
    ...(title !== undefined ? { title } : {}),
    ...(placeholder !== undefined ? { placeholder } : {}),
    ...(alt !== undefined ? { alt } : {}),
    ...(text !== undefined ? { text } : {}),
    ariaState: ariaStateOf(element),
    ancestors: ancestorsOf(element, dom),
    siblingIndex: index,
    siblingCount: count,
    structuralPath: structuralPathOf(element, dom),
    ...(element.boundingBox ? { boundingBox: element.boundingBox } : {}),
    hasStrongSemantics: strongValues.length > 0,
  };
}

/**
 * The identity fields a live match must agree on (item 24). Exported so the
 * planner, the resolver and the fixture all read one definition instead of
 * three that drift apart.
 */
export function strongSemanticFields(
  descriptor: LocatorDescriptor,
): { field: string; value: string }[] {
  const out: { field: string; value: string }[] = [];
  for (const field of IDENTITY_ATTRIBUTES) {
    const value =
      field === "aria-label"
        ? descriptor.ariaLabel
        : field === "name"
          ? descriptor.name
          : field === "title"
            ? descriptor.title
            : field === "placeholder"
              ? descriptor.placeholder
              : descriptor.alt;
    if (value !== undefined && value.trim() !== "") out.push({ field, value });
  }
  if (descriptor.text !== undefined && descriptor.text.trim() !== "") {
    out.push({ field: "text", value: descriptor.text });
  }
  return out;
}
