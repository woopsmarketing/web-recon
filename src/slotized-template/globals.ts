import type { PreSlot } from "./preslot.js";

/**
 * Template-local global merge.
 *
 * "Global" means shared across pages of THIS template — never across sites.
 * The contract is deliberately asymmetric: a WRONG merge silently rewrites
 * content on pages the operator never looked at, while a missed merge only
 * costs an extra edit. So only CERTAIN candidates merge:
 *
 *   same shell region (header/footer) + same value + same target shape
 *   + present on ≥2 pages
 *
 * Everything else with an identical value stays local and is reported as
 * `likelyGlobal`. The rule reads landmarks and values only — never a route
 * prefix — because a locale segment like `/kr/` is not evidence about content
 * (Slot V2 produced 0 globals for channel.io for exactly that reason).
 */

const SHELL_REGIONS = new Set(["header", "footer"]);

export interface LikelyGlobal {
  signature: string;
  sampleKey: string;
  pageCount: number;
  slotIds: string[];
}

export interface GlobalMergeResult {
  slots: PreSlot[];
  mergedGlobals: number;
  mergedFromSlots: number;
  likelyGlobal: LikelyGlobal[];
}

/** Target shape = the set of places a value is written, ignoring node identity. */
function targetShape(slot: PreSlot): string {
  const shapes = new Set(
    slot.bindings.map((b) => `${b.target}:${b.property ?? ""}:${b.field ?? ""}:${b.address.surface}`),
  );
  return [...shapes].sort().join(",");
}

function signatureOf(slot: PreSlot): string {
  return [
    slot.type,
    slot.role ?? "",
    slot.section,
    targetShape(slot),
    JSON.stringify(slot.defaultValue),
  ].join("|");
}

function keyTail(key: string): string {
  const parts = key.split(".");
  return parts.length > 1 ? parts.slice(1).join(".") : key;
}

export function mergeGlobals(slots: readonly PreSlot[]): GlobalMergeResult {
  const buckets = new Map<string, PreSlot[]>();
  const passthrough: PreSlot[] = [];
  for (const slot of slots) {
    // Metadata and already-global slots are never re-merged.
    if (slot.scope !== "page" || slot.pageId === undefined || slot.section === "meta") {
      passthrough.push(slot);
      continue;
    }
    const signature = signatureOf(slot);
    const list = buckets.get(signature) ?? [];
    list.push(slot);
    buckets.set(signature, list);
  }

  const out: PreSlot[] = [...passthrough];
  const likelyGlobal: LikelyGlobal[] = [];
  let mergedGlobals = 0;
  let mergedFromSlots = 0;

  for (const [signature, group] of [...buckets.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
    const pages = new Set(group.map((s) => s.pageId));
    const shell = SHELL_REGIONS.has(group[0]!.section);
    if (group.length < 2 || pages.size < 2) {
      out.push(...group);
      continue;
    }
    if (!shell) {
      likelyGlobal.push({
        signature,
        sampleKey: group[0]!.key,
        pageCount: pages.size,
        slotIds: group.map((s) => s.key).sort(),
      });
      out.push(...group);
      continue;
    }
    const ordered = [...group].sort((a, b) => a.key.localeCompare(b.key));
    const first = ordered[0]!;
    mergedGlobals++;
    mergedFromSlots += ordered.length;
    out.push({
      ...first,
      key: `global.${keyTail(first.key)}`,
      scope: "global",
      pageId: undefined,
      route: undefined,
      bindings: ordered.flatMap((s) => s.bindings),
      evidence: [...new Set(ordered.flatMap((s) => s.evidence))].sort(),
      notes: [
        ...first.notes,
        `global:certain pages=${pages.size} sources=${ordered.map((s) => s.key).join(",")}`,
      ],
    });
  }
  return { slots: out, mergedGlobals, mergedFromSlots, likelyGlobal };
}
