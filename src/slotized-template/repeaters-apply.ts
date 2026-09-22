import type { RuntimeElementNode, RuntimeNode, RuntimePage } from "../reconstruction/index.js";
import { indexElements, scanSvgRuns } from "./apply.js";
import { parsePath } from "./tree.js";
import {
  type Binding,
  type ContentPack,
  type RenderWarning,
  type RepeaterDefinition,
  type RepeaterItem,
  type RepeaterRenderEntry,
  type SlotValue,
  type Variant,
} from "./types.js";

/**
 * REPEATER RENDERING — clone, order, inject.
 *
 * NODE IDENTITY (the decision everything else follows from).
 * A reconstructed app carries its computed styles in ONE generated stylesheet,
 * and ~2.9k of those rules are addressed as `[data-wr-node="nNNNNNN"]::before`
 * / `::after` (rosee: 10,282 occurrences of the attribute in
 * `generated-styles.css`; `RuntimeElementNode.n` is documented as "Powers
 * data-wr-node, pseudo CSS, QA"). The interaction runtime also resolves hosts
 * with `querySelector('[data-wr-node="…"]')`.
 *
 * So a clone MUST keep its prototype's `n` / `data-wr-node`: rewriting them to
 * `repeaterId:itemId:protoNodeId` would silently drop every pseudo-element a
 * cloned card paints, which is exactly the kind of invisible fidelity loss
 * this project exists to avoid. Duplicated `data-wr-node` is safe — it is an
 * attribute, not a DOM id; React keys are child indexes (`NodeRenderer.tsx`),
 * and the runtime's lookups are scoped.
 *
 * Runtime identity therefore lives on the ITEM ROOT only, as `data-wr-item`
 * (the item id) and `data-wr-repeater`, and field values are addressed by a
 * RELATIVE child-index path from that root — never by a global `n` lookup.
 *
 * NEUTRALITY. When a pack's items are exactly the default items (same ids,
 * same order, same values), the repeater does nothing at all: the original
 * nodes are left untouched, no attribute is added, no page binding is
 * superseded. `--assert-neutral` is what proves it.
 *
 * OWNERSHIP. Once a repeater IS driven (any add/remove/reorder/value change),
 * it owns its subtree: page-slot bindings addressing nodes inside it are
 * skipped and reported as superseded, because after cloning those node ids are
 * no longer unique and the item values are the authority.
 *
 * HONESTY. Growth beyond what CSS can promise is rendered anyway and warned
 * about (`REPEATER_CAPACITY_UNVERIFIED`, `REPEATER_FIXED_*`). Nothing here
 * writes `verifiedCapacity`.
 */

/** Props whose value references a DOM id defined inside the same item. */
const ID_REF_PROPS = ["htmlFor", "aria-labelledby", "aria-describedby", "aria-controls", "aria-owns"];

export interface RepeaterApplyContext {
  pageId: string;
  page: RuntimePage;
  repeaters: readonly RepeaterDefinition[];
  bindings: readonly Binding[];
  contentPack: ContentPack;
}

export interface RepeaterApplyResult {
  entries: RepeaterRenderEntry[];
  warnings: RenderWarning[];
  /** variant → node ids whose page-slot bindings must NOT be applied. */
  superseded: Map<Variant, Set<string>>;
}

function deepClone(node: RuntimeElementNode): RuntimeElementNode {
  return JSON.parse(JSON.stringify(node)) as RuntimeElementNode;
}

function walk(node: RuntimeElementNode, visit: (n: RuntimeElementNode) => void): void {
  visit(node);
  for (const child of node.c ?? []) if (child.k === "e") walk(child, visit);
}

function countElements(node: RuntimeElementNode): number {
  let n = 0;
  walk(node, () => n++);
  return n;
}

/**
 * Namespace every DOM id a clone carries, plus the references to those ids
 * (`for`, `aria-*`, `href="#…"`). References that point OUTSIDE the item are
 * left alone — they still mean what they meant.
 */
function namespaceIds(clone: RuntimeElementNode, itemId: string): number {
  const defined = new Set<string>();
  walk(clone, (node) => {
    const id = node.p?.["id"];
    if (typeof id === "string" && id !== "") defined.add(id);
  });
  if (defined.size === 0) return 0;
  const rename = (id: string): string => `${itemId}__${id}`;
  let rewrites = 0;
  walk(clone, (node) => {
    const props = node.p as Record<string, unknown> | undefined;
    if (!props) return;
    const id = props["id"];
    if (typeof id === "string" && defined.has(id)) {
      props["id"] = rename(id);
      rewrites++;
    }
    for (const name of ID_REF_PROPS) {
      const raw = props[name];
      if (typeof raw !== "string" || raw === "") continue;
      const tokens = raw.split(/\s+/);
      let changed = false;
      const next = tokens.map((token) => {
        if (!defined.has(token)) return token;
        changed = true;
        return rename(token);
      });
      if (changed) {
        props[name] = next.join(" ");
        rewrites++;
      }
    }
    const href = props["href"];
    if (typeof href === "string" && href.startsWith("#") && defined.has(href.slice(1))) {
      props["href"] = `#${rename(href.slice(1))}`;
      rewrites++;
    }
  });
  return rewrites;
}

function nodeAt(root: RuntimeElementNode, path: readonly number[]): RuntimeElementNode | undefined {
  let node: RuntimeElementNode = root;
  for (const index of path) {
    const child = (node.c ?? [])[index];
    if (!child || child.k !== "e") return undefined;
    node = child;
  }
  return node;
}

function readField(owner: RuntimeElementNode, binding: Binding): string | null {
  if (binding.address.svgTextIndex !== undefined) {
    if (typeof owner.v !== "string") return null;
    const run = scanSvgRuns(owner.v).find((r) => r.index === binding.address.svgTextIndex);
    return run ? run.value : null;
  }
  if (binding.target === "textContent") {
    const child = (owner.c ?? [])[binding.address.childIndex ?? -1];
    return child && child.k === "t" ? child.v : null;
  }
  const raw = owner.p?.[binding.property ?? ""];
  return typeof raw === "string" ? raw : null;
}

function writeField(owner: RuntimeElementNode, binding: Binding, value: string | null): boolean {
  if (binding.address.svgTextIndex !== undefined) {
    if (typeof owner.v !== "string" || value === null) return false;
    const run = scanSvgRuns(owner.v).find((r) => r.index === binding.address.svgTextIndex);
    if (!run) return false;
    owner.v =
      owner.v.slice(0, run.start) +
      value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;") +
      owner.v.slice(run.end);
    return true;
  }
  if (binding.target === "textContent") {
    const children = owner.c ?? [];
    const child = children[binding.address.childIndex ?? -1];
    if (!child || child.k !== "t") return false;
    child.v = value ?? "";
    return true;
  }
  const name = binding.property;
  if (name === undefined) return false;
  const props = (owner.p ?? {}) as Record<string, unknown>;
  if (value === null) delete props[name];
  else props[name] = value;
  owner.p = props as RuntimeElementNode["p"];
  return true;
}

function valueToString(value: SlotValue | undefined): string | null | undefined {
  if (value === undefined) return undefined;
  if (value === null) return null;
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  if (typeof value === "object" && "src" in (value as Record<string, unknown>)) {
    const src = (value as { src: string | null }).src;
    return src;
  }
  return undefined;
}

function itemsEqual(a: readonly RepeaterItem[], b: readonly RepeaterItem[]): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    const left = a[i]!;
    const right = b[i]!;
    if (left.id !== right.id) return false;
    const keys = new Set([...Object.keys(left.values), ...Object.keys(right.values)]);
    for (const key of keys) {
      if (JSON.stringify(left.values[key] ?? null) !== JSON.stringify(right.values[key] ?? null)) return false;
    }
  }
  return true;
}

/**
 * The default `RepeaterHook`. Mutates `context.page` in place and reports what
 * it did; the renderer applies slot bindings afterwards, minus the superseded
 * ones.
 */
export function applyRepeaters(context: RepeaterApplyContext): RepeaterApplyResult {
  const entries: RepeaterRenderEntry[] = [];
  const warnings: RenderWarning[] = [];
  const superseded = new Map<Variant, Set<string>>([
    ["desktop", new Set<string>()],
    ["mobile", new Set<string>()],
  ]);

  const fieldBindings = new Map<string, Binding[]>();
  for (const binding of context.bindings) {
    if (binding.address.surface !== "repeater-field") continue;
    const key = `${binding.address.repeaterId ?? ""}|${binding.variant ?? ""}`;
    const list = fieldBindings.get(key) ?? [];
    list.push(binding);
    fieldBindings.set(key, list);
  }

  for (const repeater of context.repeaters) {
    if (repeater.pageId !== undefined && repeater.pageId !== context.pageId) continue;
    const requested = context.contentPack.repeaters[repeater.id]?.items;
    if (requested === undefined) continue;
    const defaults = repeater.defaultItems;
    if (itemsEqual(requested, defaults)) continue; // NEUTRAL: touch nothing.

    const defaultById = new Map(defaults.map((item) => [item.id, item] as const));
    const removed = defaults.filter((item) => !requested.some((r) => r.id === item.id)).length;
    const added = requested.filter((item) => !defaultById.has(item.id)).length;
    // Order change is judged on the SURVIVING default items only, so a pack
    // that removes, adds AND reorders still reports the reorder honestly.
    const survivingRequested = requested.filter((item) => defaultById.has(item.id)).map((item) => item.id);
    const survivingDefault = defaults
      .filter((item) => requested.some((r) => r.id === item.id))
      .map((item) => item.id);
    const reordered = survivingRequested.join("|") !== survivingDefault.join("|");

    // --- growth honesty -------------------------------------------------------
    const repeaterWarnings: string[] = [];
    const warn = (code: RenderWarning["code"], message: string): void => {
      repeaterWarnings.push(code);
      warnings.push({ code, repeaterId: repeater.id, message: `${repeater.key}: ${message}` });
    };
    if (repeater.growthPolicy === "fixed" && requested.length !== defaults.length) {
      warn(
        "REPEATER_FIXED_COUNT_CHANGED",
        `growthPolicy "fixed" (${(repeater.layoutPolicy?.notes ?? []).join("; ") || "no CSS evidence"}) but the pack asks for ${requested.length} items instead of ${defaults.length} — rendered, NOT verified`,
      );
      if (requested.length > defaults.length) {
        warn("REPEATER_FIXED_EXCEEDED", `${requested.length} items exceeds the observed ${defaults.length}`);
      }
    } else if (
      repeater.maxItems !== undefined &&
      requested.length > repeater.maxItems &&
      repeater.growthPolicy === "bounded"
    ) {
      warn(
        "REPEATER_CAPACITY_UNVERIFIED",
        `${requested.length} items exceeds the observed ${repeater.maxItems} in a "bounded" container — rendered, capacity NOT verified`,
      );
    }

    for (const variant of repeater.variants ?? (["desktop", "mobile"] as Variant[])) {
      const layout = repeater.variantLayouts?.[variant];
      if (!layout) continue;
      // A nested pair cannot both be driven: once the outer one cloned its
      // items, this container's node id exists more than once and there is no
      // honest way to say which copy the pack meant.
      if (superseded.get(variant)!.has(layout.containerNodeId)) {
        warn(
          "REPEATER_NESTED_SKIPPED",
          `${variant}: this repeater lives inside another repeater that was driven in the same render — not applied`,
        );
        continue;
      }
      const index = indexElements(context.page[variant].doc);
      const container = index.get(layout.containerNodeId);
      if (!container) {
        warn("REPEATER_UNKNOWN", `container ${layout.containerNodeId} not found in ${variant}`);
        continue;
      }
      if (layout.itemNodeIds.length !== defaults.length) {
        warn(
          "REPEATER_UNKNOWN",
          `${variant} layout lists ${layout.itemNodeIds.length} item nodes for ${defaults.length} default items — skipped`,
        );
        continue;
      }

      // Original item nodes, resolved by POSITION inside the container (node
      // ids repeat once clones exist, so a global lookup is not trustworthy).
      const children: RuntimeNode[] = container.c ?? [];
      const originalByItemId = new Map<string, RuntimeElementNode>();
      const originalPositions: number[] = [];
      let cursor = 0;
      for (const [i, itemNodeId] of layout.itemNodeIds.entries()) {
        let position = -1;
        for (let c = cursor; c < children.length; c++) {
          const child = children[c]!;
          if (child.k === "e" && child.n === itemNodeId) {
            position = c;
            break;
          }
        }
        if (position === -1) continue;
        cursor = position + 1;
        originalPositions.push(position);
        originalByItemId.set(defaults[i]!.id, children[position] as RuntimeElementNode);
      }
      if (originalByItemId.size !== defaults.length) {
        warn(
          "REPEATER_UNKNOWN",
          `${variant}: only ${originalByItemId.size}/${defaults.length} item nodes found under the container — skipped`,
        );
        continue;
      }
      const prototype = originalByItemId.get(defaults[layout.protoSourceIndex]?.id ?? "") ?? undefined;
      if (!prototype) {
        warn("REPEATER_UNKNOWN", `${variant}: prototype item not found — skipped`);
        continue;
      }

      // Everything inside the ORIGINAL items is now owned by the repeater.
      let supersededNodes = 0;
      const supersededSet = superseded.get(variant)!;
      for (const node of originalByItemId.values()) {
        walk(node, (n) => {
          if (!supersededSet.has(n.n)) supersededNodes++;
          supersededSet.add(n.n);
        });
      }

      // --- build the new item sequence ---------------------------------------
      const used = new Set<string>();
      let clonedNodes = 0;
      let namespacedIds = 0;
      const rendered: Array<{ node: RuntimeElementNode; item: RepeaterItem; sourceItemId: string }> = [];
      for (const item of requested) {
        const original = originalByItemId.get(item.id);
        if (original && !used.has(item.id)) {
          used.add(item.id);
          rendered.push({ node: original, item, sourceItemId: item.id });
          continue;
        }
        const sourceNode = original ?? prototype;
        const sourceItemId = original ? item.id : defaults[layout.protoSourceIndex]!.id;
        const clone = deepClone(sourceNode);
        clonedNodes += countElements(clone);
        namespacedIds += namespaceIds(clone, item.id);
        rendered.push({ node: clone, item, sourceItemId });
      }

      for (const { node, item } of rendered) {
        const props = (node.p ?? {}) as Record<string, unknown>;
        props["data-wr-item"] = item.id;
        props["data-wr-repeater"] = repeater.id;
        node.p = props as RuntimeElementNode["p"];
      }

      const first = originalPositions[0]!;
      const last = originalPositions[originalPositions.length - 1]!;
      const originalNodes = new Set(originalByItemId.values());
      const between = children
        .slice(first, last + 1)
        .filter((child) => !(child.k === "e" && originalNodes.has(child)));
      const movedElements = between.filter((child) => child.k === "e").length;
      if (movedElements > 0) {
        warn(
          "REPEATER_STATIC_SIBLING_MOVED",
          `${movedElements} non-item element(s) sat between items in ${variant} and now follow the item block`,
        );
      }
      container.c = [
        ...children.slice(0, first),
        ...rendered.map((r) => r.node),
        ...between,
        ...children.slice(last + 1),
      ];

      // --- inject field values -----------------------------------------------
      let fieldsApplied = 0;
      let fieldsSkipped = 0;
      const bindingsForVariant = fieldBindings.get(`${repeater.id}|${variant}`) ?? [];
      for (const { node, item, sourceItemId } of rendered) {
        for (const binding of bindingsForVariant) {
          const wanted = valueToString(item.values[binding.slotId]);
          if (wanted === undefined) {
            fieldsSkipped++;
            continue;
          }
          const owner = nodeAt(node, parsePath(binding.address.itemPath ?? ""));
          if (!owner) {
            fieldsSkipped++;
            continue;
          }
          const current = readField(owner, binding);
          const expected = valueToString(defaultById.get(sourceItemId)?.values[binding.slotId]);
          if (expected !== undefined && current !== expected) {
            warn(
              "REPEATER_GUARD_MISMATCH",
              `${variant} item ${item.id} field ${binding.slotId}: address holds ${JSON.stringify(current)}, expected ${JSON.stringify(expected)} — not written`,
            );
            fieldsSkipped++;
            continue;
          }
          if (current === wanted) {
            fieldsApplied++;
            continue;
          }
          if (writeField(owner, binding, wanted)) fieldsApplied++;
          else fieldsSkipped++;
        }
      }

      entries.push({
        id: repeater.id,
        key: repeater.key,
        pageId: context.pageId,
        variant,
        defaultCount: defaults.length,
        renderedCount: rendered.length,
        added,
        removed,
        reordered,
        clonedNodes,
        namespacedIds,
        fieldsApplied,
        fieldsSkipped,
        supersededNodes,
        warnings: [...new Set(repeaterWarnings)].sort(),
      });
    }
  }

  entries.sort((a, b) => a.key.localeCompare(b.key) || a.variant.localeCompare(b.variant));
  return { entries, warnings, superseded };
}

/** DOM `id` census of one page, used for the duplicate-id gate. */
export function collectDomIds(page: RuntimePage): Map<string, number> {
  const counts = new Map<string, number>();
  for (const variant of ["desktop", "mobile"] as const) {
    walk(page[variant].doc, (node) => {
      const id = node.p?.["id"];
      if (typeof id !== "string" || id === "") return;
      counts.set(id, (counts.get(id) ?? 0) + 1);
    });
  }
  return counts;
}
