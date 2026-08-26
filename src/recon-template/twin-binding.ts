import type { ConstraintContext } from "./constraints.js";
import type { ExtractionResult, HiddenTextOccurrence, TextOccurrence } from "./extract.js";
import type { BindingSpec, LogicalSlot } from "./grouping.js";

/**
 * Paint-twin co-binding (Task 19.1 §2–§4).
 *
 * Some sites paint the same sentence twice: a visible text node plus an
 * `aria-hidden="true"` duplicate that carries a gradient / effect layer
 * (Stripe's hero headings). Slot V2 rightly excludes aria-hidden subtrees
 * from slot candidacy — but the duplicate is PAINTED, so writing only the
 * visible occurrence double-exposes old and new text on top of each other.
 *
 * This pass never reopens aria-hidden content as editable. It attaches a
 * hidden occurrence to an EXISTING slot as an additional `paint-twin` binding
 * only when every piece of deterministic evidence holds simultaneously:
 *
 *   1. same page and same viewport
 *   2. byte-equal text (the hidden run equals the binding's expectedValue —
 *      no normalization, no similarity)
 *   3. the duplicate lives under an `aria-hidden="true"` boundary and not
 *      inside svg / script / style (extraction guarantees this)
 *   4. close structural ancestry: the nearest common ancestor element is at
 *      most MAX_ANCESTOR_DISTANCE hops from BOTH owners
 *   5. observed geometry: the SiteSpec carries a real bounding box for BOTH
 *      owners and the strict intersection covers ≥ MIN_OVERLAP_RATIO of the
 *      smaller box — a twin that does not share the visible occurrence's
 *      pixels is not a paint layer of it
 *   6. unambiguous pairing: each hidden occurrence co-binds at most once, to
 *      the closest matching visible occurrence (ancestor distance, then
 *      document order)
 *
 * A duplicate that fails any test simply stays unbound — and the Task 19
 * stale-twin detector keeps treating it as a desync risk, which is the
 * correct conservative outcome.
 */

const MAX_ANCESTOR_DISTANCE = 4;
/**
 * A paint layer sits on (essentially) the same pixels as its visible twin —
 * Stripe's gradient copies have byte-identical boxes. Requiring the strict
 * intersection to cover at least half of the smaller box keeps stacked
 * ADJACENT elements (a hidden duplicate rendered below the visible line —
 * a real desync, not an effect layer) out of co-binding.
 */
const MIN_OVERLAP_RATIO = 0.5;

export interface TwinCoBindingStats {
  /** paint-twin bindings added across all slots. */
  coBound: number;
  /** hidden text occurrences that matched no slot occurrence. */
  unmatchedHiddenTexts: number;
  /** matches rejected for a named missing evidence. */
  rejected: Map<string, number>;
}

interface Box {
  x: number;
  y: number;
  width: number;
  height: number;
}

function boxesOverlap(a: Box, b: Box): boolean {
  // Byte-identical observed boxes are the strongest possible evidence — this
  // also covers a viewport where the construct is not rendered at all (both
  // layers 0×0 at the same spot, e.g. Stripe's desktop-only heading variant
  // on mobile): co-binding it keeps the layers synchronized everywhere.
  if (a.x === b.x && a.y === b.y && a.width === b.width && a.height === b.height) return true;
  const w = Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x);
  const h = Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y);
  if (w <= 0 || h <= 0) return false;
  const smaller = Math.min(a.width * a.height, b.width * b.height);
  if (smaller <= 0) return false;
  return (w * h) / smaller >= MIN_OVERLAP_RATIO;
}

/** Hops from each owner to the nearest common ancestor, or undefined. */
function ancestorDistance(a: string[], b: string[]): number | undefined {
  const bIndex = new Map<string, number>();
  b.forEach((id, i) => bIndex.set(id, i));
  let best: number | undefined;
  for (let i = 0; i < a.length; i++) {
    const j = bIndex.get(a[i]);
    if (j !== undefined) {
      const d = Math.max(i, j);
      if (best === undefined || d < best) best = d;
      break; // nearest-first arrays: the first hit IS the nearest common ancestor
    }
  }
  return best;
}

export function coBindPaintTwins(
  slots: LogicalSlot[],
  extraction: ExtractionResult,
  constraints: ConstraintContext,
): TwinCoBindingStats {
  const stats: TwinCoBindingStats = { coBound: 0, unmatchedHiddenTexts: 0, rejected: new Map() };
  const reject = (why: string): void => {
    stats.rejected.set(why, (stats.rejected.get(why) ?? 0) + 1);
  };

  // Visible occurrence ancestry, addressable by binding coordinates.
  const occByAddress = new Map<string, TextOccurrence>();
  for (const page of extraction.pages.values()) {
    for (const text of page.texts) {
      if (text.surface !== "static") continue;
      occByAddress.set(
        `${text.pageId}|${text.viewport}|${text.ownerNodeId}|${text.childIndex}`,
        text,
      );
    }
  }

  // Hidden candidates grouped by (page, viewport, value) for O(1) lookup.
  const hiddenByValue = new Map<string, HiddenTextOccurrence[]>();
  let hiddenTotal = 0;
  for (const page of extraction.pages.values()) {
    for (const hidden of page.hiddenTexts) {
      hiddenTotal++;
      const key = `${hidden.pageId}|${hidden.viewport}|${hidden.value}`;
      const list = hiddenByValue.get(key) ?? [];
      list.push(hidden);
      hiddenByValue.set(key, list);
    }
  }

  const boxOf = (pageId: string, viewport: string, nodeId: string): Box | undefined =>
    constraints.nodeIndex.get(`${pageId}|${viewport}|${nodeId}`)?.boundingBox;

  interface Claim {
    slot: LogicalSlot;
    binding: BindingSpec;
    distance: number;
  }
  const claims = new Map<HiddenTextOccurrence, Claim>();

  for (const slot of slots) {
    if (slot.type !== "text") continue;
    for (const binding of slot.bindings) {
      if (binding.surface !== "static" || binding.target !== "text") continue;
      const candidates =
        hiddenByValue.get(`${binding.pageId}|${binding.viewport}|${binding.expectedValue}`) ?? [];
      if (candidates.length === 0) continue;
      const visible = occByAddress.get(
        `${binding.pageId}|${binding.viewport}|${binding.nodeId}|${binding.childIndex}`,
      );
      if (!visible) continue;
      const visibleBox = boxOf(binding.pageId, binding.viewport, visible.ownerNodeId);
      for (const hidden of candidates) {
        const distance = ancestorDistance(visible.ancestorIds, hidden.ancestorIds);
        if (distance === undefined || distance > MAX_ANCESTOR_DISTANCE) {
          reject("ancestry-too-far");
          continue;
        }
        const hiddenBox = boxOf(hidden.pageId, hidden.viewport, hidden.ownerNodeId);
        if (!visibleBox || !hiddenBox) {
          reject("missing-observed-box");
          continue;
        }
        if (!boxesOverlap(visibleBox, hiddenBox)) {
          reject("boxes-do-not-overlap");
          continue;
        }
        const existing = claims.get(hidden);
        if (
          existing === undefined ||
          distance < existing.distance ||
          (distance === existing.distance && binding.docOrder < existing.binding.docOrder)
        ) {
          claims.set(hidden, { slot, binding, distance });
        }
      }
    }
  }

  const coBoundBySlot = new Map<LogicalSlot, number>();
  for (const [hidden, claim] of claims) {
    claim.slot.bindings.push({
      pageId: hidden.pageId,
      viewport: hidden.viewport,
      surface: "paint-twin",
      nodeId: hidden.ownerNodeId,
      target: "text",
      childIndex: hidden.childIndex,
      textSegment: hidden.textSegment,
      expectedValue: hidden.value,
      // Order twins directly after their visible occurrence, deterministically.
      docOrder: claim.binding.docOrder,
    });
    stats.coBound++;
    coBoundBySlot.set(claim.slot, (coBoundBySlot.get(claim.slot) ?? 0) + 1);
  }
  for (const [slot, count] of coBoundBySlot) {
    if (!slot.evidence.includes("surface:paint-twin")) slot.evidence.push("surface:paint-twin");
    slot.evidence.push(`paint-twin-cobound:${count}`);
  }
  stats.unmatchedHiddenTexts = hiddenTotal - claims.size;
  return stats;
}
