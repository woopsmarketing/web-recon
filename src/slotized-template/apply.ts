import type { RuntimeElementNode, RuntimeNode, RuntimePage } from "../reconstruction/index.js";
import { HIDDEN_CLASS, type Binding, type ImageField, type SlotValue, type Variant } from "./types.js";

/**
 * Value application — the Slot V2 applier (`app-templates.ts SLOT_CONTENT_TS`)
 * ported from a generated string into real, type-checked TypeScript.
 *
 * Two properties are load-bearing and inherited unchanged:
 *
 *   1. DIRECT COMPILE. A value is written into the EXISTING node — one text
 *      child, one attribute, one SVG character run. No wrapper element is ever
 *      inserted, so a content change cannot move layout by itself.
 *   2. GUARDED. Every binding carries the value its address held at compile
 *      time. The applier verifies it before writing and refuses on mismatch,
 *      so a stale binding can never silently rewrite the wrong node — and
 *      applying the DEFAULT pack is therefore a provable no-op.
 */

export interface ApplyOp {
  binding: Binding;
  /** The string to write; `undefined` = leave the original in place. */
  value: string | undefined;
  /** Drop the addressed attribute instead of writing (stale srcset, null src). */
  remove: boolean;
}

export interface ApplyResult {
  applied: number;
  skipped: number;
  failed: Array<{ bindingId: string; reason: string }>;
}

function isImageObject(value: unknown): value is { src: string | null; alt?: string; srcset?: string } {
  return typeof value === "object" && value !== null && "src" in (value as Record<string, unknown>);
}

/** Project a slot value onto one binding's field. Mirrors the Slot V2 rules. */
export function projectValue(
  slotValue: SlotValue | undefined,
  defaultValue: SlotValue,
  field: ImageField | undefined,
): { value: string | undefined; remove: boolean } {
  if (slotValue === undefined) return { value: undefined, remove: false };
  if (field === undefined) {
    if (typeof slotValue === "string") return { value: slotValue, remove: false };
    if (typeof slotValue === "number" || typeof slotValue === "boolean") {
      return { value: String(slotValue), remove: false };
    }
    return { value: undefined, remove: false };
  }
  if (!isImageObject(slotValue)) return { value: undefined, remove: false };
  const raw = (slotValue as Record<string, unknown>)[field];
  if (typeof raw === "string") return { value: raw, remove: false };
  if (raw === null) return { value: undefined, remove: true };
  // Field absent from the replacement value. A dropped `srcset` MUST remove the
  // original attribute once `src` changed — a stale srcset outranks the new src.
  if (
    field === "srcset" &&
    isImageObject(defaultValue) &&
    (slotValue as { src?: unknown }).src !== (defaultValue as { src?: unknown }).src
  ) {
    return { value: undefined, remove: true };
  }
  return { value: undefined, remove: false };
}

export function indexElements(root: RuntimeElementNode): Map<string, RuntimeElementNode> {
  const index = new Map<string, RuntimeElementNode>();
  const visit = (node: RuntimeElementNode): void => {
    index.set(node.n, node);
    for (const child of node.c ?? []) if (child.k === "e") visit(child);
  };
  visit(root);
  return index;
}

// --- inline SVG character runs ---------------------------------------------
// Runs are the character data whose directly enclosing element is
// <text>/<tspan>, indexed in document order. Only a run's characters can
// change and the replacement is entity-escaped, so no markup (fill, gradient,
// geometry) can ever be introduced through a slot value.

const SVG_ENTITY_MAP: Record<string, string> = {
  "&amp;": "&",
  "&lt;": "<",
  "&gt;": ">",
  "&quot;": '"',
  "&#39;": "'",
  "&#x27;": "'",
  "&apos;": "'",
};

function decodeSvgEntities(raw: string): string {
  return raw.replace(/&(?:amp|lt|gt|quot|apos|#39|#x27);/g, (m) => SVG_ENTITY_MAP[m] ?? m);
}

function escapeSvgText(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

export interface SvgRun {
  index: number;
  start: number;
  end: number;
  value: string;
}

export function scanSvgRuns(markup: string): SvgRun[] {
  const runs: SvgRun[] = [];
  const stack: string[] = [];
  const tagRe = /<(\/?)([a-zA-Z][a-zA-Z0-9:_-]*)((?:[^>"']|"[^"]*"|'[^']*')*?)(\/?)>|<!--[\s\S]*?-->/g;
  let cursor = 0;
  let index = 0;
  let match: RegExpExecArray | null;
  const emit = (start: number, end: number): void => {
    const raw = markup.slice(start, end);
    if (raw.trim() === "") return;
    const top = stack[stack.length - 1];
    if (top !== "text" && top !== "tspan") return;
    runs.push({ index: index++, start, end, value: decodeSvgEntities(raw) });
  };
  while ((match = tagRe.exec(markup)) !== null) {
    emit(cursor, match.index);
    cursor = tagRe.lastIndex;
    if (match[0].startsWith("<!--")) continue;
    const tag = match[2]!.toLowerCase();
    if (match[1] === "/") {
      for (let i = stack.length - 1; i >= 0; i--) {
        if (stack[i] === tag) {
          stack.length = i;
          break;
        }
      }
    } else if (match[4] !== "/") {
      stack.push(tag);
    }
  }
  emit(cursor, markup.length);
  return runs;
}

type Fail = (bindingId: string, reason: string) => void;

function applyText(owner: RuntimeElementNode, op: ApplyOp, fail: Fail): boolean {
  const children = owner.c ?? [];
  const index = op.binding.address.childIndex;
  if (index === undefined || index >= children.length) {
    fail(op.binding.id, "child index out of range");
    return false;
  }
  const child = children[index]!;
  if (child.k !== "t") {
    fail(op.binding.id, "addressed child is not a text node");
    return false;
  }
  if (op.binding.expectedValue !== undefined && child.v !== op.binding.expectedValue) {
    fail(op.binding.id, "guard mismatch");
    return false;
  }
  if (op.value !== undefined && op.value !== child.v) child.v = op.value;
  return true;
}

function applyAttribute(owner: RuntimeElementNode, op: ApplyOp, fail: Fail): boolean {
  const name = op.binding.property;
  if (name === undefined) {
    fail(op.binding.id, "attribute name missing");
    return false;
  }
  const props = (owner.p ?? {}) as Record<string, unknown>;
  const current = props[name];
  if (op.binding.expectedValue !== undefined) {
    if (typeof current !== "string" || current !== op.binding.expectedValue) {
      fail(op.binding.id, "guard mismatch");
      return false;
    }
  } else if (current !== undefined) {
    fail(op.binding.id, "guard mismatch (expected absent attribute)");
    return false;
  }
  if (op.remove) {
    delete props[name];
    owner.p = props as RuntimeElementNode["p"];
    return true;
  }
  if (op.value !== undefined && op.value !== current) {
    props[name] = op.value;
    owner.p = props as RuntimeElementNode["p"];
  }
  return true;
}

function applySvgText(owner: RuntimeElementNode, op: ApplyOp, fail: Fail): boolean {
  const runIndex = op.binding.address.svgTextIndex;
  if (typeof owner.v !== "string" || runIndex === undefined) {
    fail(op.binding.id, "svg markup or run index missing");
    return false;
  }
  const run = scanSvgRuns(owner.v).find((r) => r.index === runIndex);
  if (!run) {
    fail(op.binding.id, "svg text run not found");
    return false;
  }
  if (op.binding.expectedValue !== undefined && run.value !== op.binding.expectedValue) {
    fail(op.binding.id, "guard mismatch");
    return false;
  }
  if (op.value === undefined || op.value === run.value) return true;
  owner.v = owner.v.slice(0, run.start) + escapeSvgText(op.value) + owner.v.slice(run.end);
  return true;
}

function applyToOwner(owner: RuntimeElementNode, op: ApplyOp, fail: Fail): boolean {
  if (op.binding.address.svgTextIndex !== undefined) return applySvgText(owner, op, fail);
  if (op.binding.target === "textContent") return applyText(owner, op, fail);
  return applyAttribute(owner, op, fail);
}

interface ObsEntry {
  di?: string;
  tpl?: RuntimeNode[];
}

function findTemplateNode(nodes: RuntimeNode[], templateNodeId: string): RuntimeElementNode | undefined {
  for (const node of nodes) {
    if (node.k !== "e") continue;
    if (node.n === templateNodeId) return node;
    const found = node.c ? findTemplateNode(node.c, templateNodeId) : undefined;
    if (found) return found;
  }
  return undefined;
}

/** Apply every DOM-surface op for one page (both variants). */
export function applyPageBindings(page: RuntimePage, ops: readonly ApplyOp[]): ApplyResult {
  const result: ApplyResult = { applied: 0, skipped: 0, failed: [] };
  const fail: Fail = (bindingId, reason) => {
    result.failed.push({ bindingId, reason });
  };

  for (const variant of ["desktop", "mobile"] as const) {
    const scoped = ops.filter((op) => op.binding.variant === variant);
    if (scoped.length === 0) continue;
    const index = indexElements(page[variant].doc);
    const obsCache = new Map<string, { entries: ObsEntry[]; dirty: boolean }>();

    for (const op of scoped) {
      const { binding } = op;
      if (binding.nodeId === undefined) {
        result.skipped++;
        continue;
      }
      const surface = binding.address.surface;
      if (surface !== "dynamic-template") {
        const owner = index.get(binding.nodeId);
        if (!owner) {
          fail(binding.id, "node not found");
          continue;
        }
        if (applyToOwner(owner, op, fail)) result.applied++;
        continue;
      }
      // dynamic-template: the addressed node lives inside the trigger's
      // serialized `data-wr-obs` payload, re-serialized only if it changed.
      const trigger = index.get(binding.nodeId);
      const raw = trigger?.p?.["data-wr-obs"];
      if (!trigger || typeof raw !== "string") {
        fail(binding.id, "trigger or data-wr-obs missing");
        continue;
      }
      let cached = obsCache.get(binding.nodeId);
      if (!cached) {
        try {
          cached = { entries: JSON.parse(raw) as ObsEntry[], dirty: false };
        } catch {
          fail(binding.id, "unparsable data-wr-obs");
          continue;
        }
        obsCache.set(binding.nodeId, cached);
      }
      const entry = cached.entries.find((e) => e.di === binding.address.discoveryId);
      if (!entry || !Array.isArray(entry.tpl)) {
        fail(binding.id, "discovery entry or template missing");
        continue;
      }
      const owner = binding.address.templateNodeId
        ? findTemplateNode(entry.tpl, binding.address.templateNodeId)
        : undefined;
      if (!owner) {
        fail(binding.id, "template node not found");
        continue;
      }
      const probe = (): string =>
        JSON.stringify(
          binding.address.svgTextIndex !== undefined
            ? owner.v
            : binding.target === "textContent"
              ? (owner.c ?? [])[binding.address.childIndex ?? -1]
              : owner.p?.[binding.property ?? ""],
        );
      const before = probe();
      if (applyToOwner(owner, op, fail)) result.applied++;
      if (before !== probe()) cached.dirty = true;
    }

    for (const [triggerNodeId, cached] of obsCache) {
      if (!cached.dirty) continue;
      const trigger = index.get(triggerNodeId);
      if (!trigger || !trigger.p) continue;
      (trigger.p as Record<string, unknown>)["data-wr-obs"] = JSON.stringify(cached.entries);
    }
  }
  return result;
}

/**
 * `onEmpty: hide-node | hide-group` — add a class, never remove a node. The
 * node stays in the tree (so bindings stay addressable and a later value
 * brings it back) and one appended CSS rule does the hiding.
 */
export function hideNodes(page: RuntimePage, targets: ReadonlyMap<Variant, Set<string>>): number {
  let hidden = 0;
  for (const variant of ["desktop", "mobile"] as const) {
    const wanted = targets.get(variant);
    if (!wanted || wanted.size === 0) continue;
    const index = indexElements(page[variant].doc);
    for (const nodeId of wanted) {
      const node = index.get(nodeId);
      if (!node) continue;
      const props = (node.p ?? {}) as Record<string, unknown>;
      const current = typeof props["className"] === "string" ? (props["className"] as string) : "";
      if (current.split(/\s+/).includes(HIDDEN_CLASS)) continue;
      props["className"] = current === "" ? HIDDEN_CLASS : `${current} ${HIDDEN_CLASS}`;
      node.p = props as RuntimeElementNode["p"];
      hidden++;
    }
  }
  return hidden;
}
