import { createHash } from "node:crypto";

/**
 * Deterministic template-local ids (Task 29 contract).
 *
 * Every id is a sha256 over a canonical `|`-joined string of STABLE inputs —
 * never a counter, never a timestamp, never iteration order. Running slotize
 * twice on the same recon-template run therefore yields byte-identical
 * definition files, which is what makes a content pack from yesterday still
 * address today's template.
 *
 * A merged slot's id is the hash of its SORTED binding ids: the identity of a
 * slot IS the set of places it writes, so merging/unmerging is visible as an
 * id change instead of silently re-pointing an existing id at new DOM.
 */

const EMPTY = "";

function canonical(parts: readonly (string | number | boolean | null | undefined)[]): string {
  return parts.map((p) => (p === undefined || p === null ? EMPTY : String(p))).join("|");
}

function hash12(parts: readonly (string | number | boolean | null | undefined)[]): string {
  return createHash("sha256").update(canonical(parts), "utf8").digest("hex").slice(0, 12);
}

export interface BindingIdInput {
  /** The Slot V2 template id — makes ids unique per source template. */
  templateSourceId: string;
  pageId: string;
  variant?: string;
  surface: string;
  nodeId?: string;
  discoveryId?: string;
  templateNodeId?: string;
  target: string;
  property?: string;
  field?: string;
  childIndex?: number;
  svgTextIndex?: number;
  cssSelector?: string;
  metadataKey?: string;
  /** route-map surface: two routes of one page can carry different titles. */
  routeId?: string;
}

export function bindingIdOf(input: BindingIdInput): string {
  return `bind_${hash12([
    input.templateSourceId,
    input.pageId,
    input.variant,
    input.surface,
    input.nodeId,
    input.discoveryId,
    input.templateNodeId,
    input.target,
    input.property,
    input.field,
    input.childIndex,
    input.svgTextIndex,
    input.cssSelector,
    input.metadataKey,
    input.routeId,
  ])}`;
}

/** Slot identity = the sorted set of occurrences it writes. */
export function slotIdOf(bindingIds: readonly string[]): string {
  return `slot_${hash12([...bindingIds].sort())}`;
}

export function groupIdOf(pageId: string | undefined, rootNodeId: string, kind: string): string {
  return `grp_${hash12([pageId, rootNodeId, kind])}`;
}

export function repeaterIdOf(pageId: string | undefined, containerNodeId: string, key: string): string {
  return `rep_${hash12([pageId, containerNodeId, key])}`;
}

export function itemIdOf(repeaterId: string, sourceIndex: number | string): string {
  return `item_${hash12([repeaterId, sourceIndex])}`;
}

/**
 * A repeater FIELD slot. Its identity is the repeater plus the field's own
 * coordinates inside an item — never a node id, because every item repeats the
 * same coordinates and a clone repeats them again.
 */
export function fieldSlotIdOf(
  repeaterId: string,
  fieldIndex: number,
  path: string,
  target: string,
  property: string | undefined,
  field: string | undefined,
): string {
  return `slot_${hash12([repeaterId, "field", fieldIndex, path, target, property, field])}`;
}

/** One binding per (field, variant): the same field has a per-variant path. */
export function repeaterFieldBindingIdOf(
  fieldSlotId: string,
  variant: string,
  path: string,
): string {
  return `bind_${hash12([fieldSlotId, variant, path])}`;
}

export function tokenIdOf(kind: string, value: string): string {
  return `tok_${hash12([kind, value])}`;
}

/** `templateVersion`: sha256 over the concatenated definition file bodies. */
export function templateVersionOf(fileBodies: readonly string[]): string {
  const h = createHash("sha256");
  for (const body of fileBodies) h.update(body, "utf8");
  return h.digest("hex");
}
