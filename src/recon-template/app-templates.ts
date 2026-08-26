/**
 * Source templates injected into the generated TEMPLATE app.
 *
 * The template app is the Exact Reconstruction app plus exactly two changes:
 *
 *   1. a new server-only module `src/runtime/slot-content.ts` that resolves
 *      Slot Values + Slot Bindings against the runtime page data BEFORE React
 *      renders it, and
 *   2. `load-page.ts` calling it after parsing a page file.
 *
 * Everything the Task 18 renderer contract forbids is absent by construction:
 * no `querySelector` patching, no MutationObserver, no client-side
 * post-hydration replacement, no `innerHTML`. Application happens on the
 * server, once per page file, before the first render — so the server and
 * client first paint are the same bytes and hydration stays clean.
 */

export const SLOT_CONTENT_TS = `import "server-only";
import { readFile } from "node:fs/promises";
import path from "node:path";
import type { RuntimeElementNode, RuntimeNode, RuntimePage } from "./types";

/**
 * Slot content application. SERVER ONLY. Generated — do not edit.
 *
 * Reads the template's content contract from \`template-data/\` and applies it
 * to a parsed runtime page IN MEMORY, before rendering:
 *
 *   slots.json            slot definitions (id → key, type)
 *   slot-bindings.json    slot → DOM occurrence addresses
 *   default-content.json  values keyed by slot key (the original content)
 *
 * An optional overlay file (env \`WR_SLOT_VALUES_FILE\`, a JSON object of
 * { slotKey: value }) is merged over the default content. That is the whole
 * editing surface: change a value, restart the server, every bound occurrence
 * — static desktop, static mobile, and captured dynamic templates that the
 * interaction runtime mounts — renders the new value.
 *
 * Every binding carries the value the address held when the template was
 * compiled (\`expectedValue\`). The applier verifies it before writing and
 * skips (with a warning) on mismatch, so a hand-edited binding can never
 * silently rewrite the wrong node. Applying the untouched default content is
 * therefore an exact no-op — the lossless invariant.
 */

interface TemplateSlot {
  id: string;
  key: string;
  type: "text" | "url" | "image";
  defaultValue: unknown;
}

interface TemplateBinding {
  bindingId: string;
  slotId: string;
  field?: "src" | "alt" | "srcset";
  pageId: string;
  viewport: "desktop" | "mobile";
  surface: "static" | "dynamic-template" | "paint-twin";
  nodeId: string;
  discoveryId?: string;
  templateNodeId?: string;
  target: "text" | "attribute" | "svg-text";
  attributeName?: string;
  childIndex?: number;
  svgTextIndex?: number;
  expectedValue: string;
}

interface ResolvedOp {
  binding: TemplateBinding;
  /** The value to write; undefined = leave the original in place. */
  value: string | undefined;
  /** Drop the addressed attribute instead of writing (stale srcset). */
  remove: boolean;
}

const TEMPLATE_DATA_DIR = path.join(process.cwd(), "template-data");

async function readTemplateJson(name: string): Promise<unknown> {
  const raw = await readFile(path.join(TEMPLATE_DATA_DIR, name), "utf8");
  return JSON.parse(raw) as unknown;
}

function isImageObject(value: unknown): value is { src: string; alt?: string; srcset?: string } {
  return typeof value === "object" && value !== null && typeof (value as { src?: unknown }).src === "string";
}

function projectValue(
  slotValue: unknown,
  defaultValue: unknown,
  field: "src" | "alt" | "srcset" | undefined,
): { value: string | undefined; remove: boolean } {
  if (field === undefined) {
    return { value: typeof slotValue === "string" ? slotValue : undefined, remove: false };
  }
  if (!isImageObject(slotValue)) return { value: undefined, remove: false };
  const fieldValue = slotValue[field];
  if (typeof fieldValue === "string") return { value: fieldValue, remove: false };
  // Field absent from the replacement value. For srcset this must REMOVE the
  // original attribute when the src changed — a stale srcset would override
  // the new src at render time. Other absent fields keep the original.
  if (field === "srcset" && isImageObject(defaultValue) && slotValue.src !== defaultValue.src) {
    return { value: undefined, remove: true };
  }
  return { value: undefined, remove: false };
}

let contractPromise: Promise<Map<string, ResolvedOp[]>> | null = null;

async function buildContract(): Promise<Map<string, ResolvedOp[]>> {
  const slotsFile = (await readTemplateJson("slots.json")) as { slots: TemplateSlot[] };
  const bindingsFile = (await readTemplateJson("slot-bindings.json")) as {
    bindings: TemplateBinding[];
  };
  const contentFile = (await readTemplateJson("default-content.json")) as {
    values: Record<string, unknown>;
  };

  const values = new Map<string, unknown>(Object.entries(contentFile.values));
  const defaults = new Map<string, unknown>(Object.entries(contentFile.values));

  const overlayFile = process.env.WR_SLOT_VALUES_FILE;
  if (overlayFile) {
    const raw = await readFile(path.resolve(process.cwd(), overlayFile), "utf8");
    const overlay = JSON.parse(raw) as Record<string, unknown>;
    for (const [key, value] of Object.entries(overlay)) {
      if (!values.has(key)) {
        console.warn("[wr-slot] overlay addresses unknown slot key: " + key);
        continue;
      }
      values.set(key, value);
    }
  }

  const keyById = new Map<string, string>();
  for (const slot of slotsFile.slots) keyById.set(slot.id, slot.key);

  const byPageViewport = new Map<string, ResolvedOp[]>();
  for (const binding of bindingsFile.bindings) {
    const key = keyById.get(binding.slotId);
    if (key === undefined) {
      console.warn("[wr-slot] binding " + binding.bindingId + " references unknown slot " + binding.slotId);
      continue;
    }
    const { value, remove } = projectValue(values.get(key), defaults.get(key), binding.field);
    const mapKey = binding.pageId + "|" + binding.viewport;
    let list = byPageViewport.get(mapKey);
    if (!list) byPageViewport.set(mapKey, (list = []));
    list.push({ binding, value, remove });
  }
  return byPageViewport;
}

function getContract(): Promise<Map<string, ResolvedOp[]>> {
  if (!contractPromise) contractPromise = buildContract();
  return contractPromise;
}

function indexElements(root: RuntimeElementNode): Map<string, RuntimeElementNode> {
  const index = new Map<string, RuntimeElementNode>();
  const visit = (node: RuntimeElementNode): void => {
    index.set(node.n, node);
    for (const child of node.c ?? []) if (child.k === "e") visit(child);
  };
  visit(root);
  return index;
}

function warnSkip(op: ResolvedOp, reason: string): void {
  console.warn(
    "[wr-slot] binding " + op.binding.bindingId + " skipped (" + reason + ") at " +
      op.binding.pageId + "/" + op.binding.viewport + "/" + op.binding.nodeId,
  );
}

function applyText(owner: RuntimeElementNode, op: ResolvedOp): void {
  const children = owner.c ?? [];
  const index = op.binding.childIndex;
  if (index === undefined || index >= children.length) return warnSkip(op, "child index out of range");
  const child = children[index];
  if (child.k !== "t") return warnSkip(op, "addressed child is not a text node");
  if (child.v !== op.binding.expectedValue) return warnSkip(op, "guard mismatch");
  if (op.value !== undefined && op.value !== child.v) child.v = op.value;
}

function applyAttribute(owner: RuntimeElementNode, op: ResolvedOp): void {
  const name = op.binding.attributeName;
  if (name === undefined) return warnSkip(op, "attribute name missing");
  const props = (owner.p ?? {}) as Record<string, unknown>;
  const current = props[name];
  if (typeof current !== "string" || current !== op.binding.expectedValue) {
    return warnSkip(op, "guard mismatch");
  }
  if (op.remove) {
    delete props[name];
    owner.p = props as RuntimeElementNode["p"];
    return;
  }
  if (op.value !== undefined && op.value !== current) {
    props[name] = op.value;
    owner.p = props as RuntimeElementNode["p"];
  }
}

// --- svg-text application (Slot V2 v2, Task 19.1) ---------------------------
// A minimal deterministic scanner over the owner's opaque SVG markup: runs are
// the character data whose directly enclosing element is <text>/<tspan>,
// indexed in document order. Only the addressed run's characters can change,
// and the replacement is entity-escaped before splicing — no markup (fill,
// stroke, gradient, element) can ever be introduced or altered through a slot.

const SVG_ENTITY_MAP: Record<string, string> = {
  "&amp;": "&", "&lt;": "<", "&gt;": ">", "&quot;": '"',
  "&#39;": "'", "&#x27;": "'", "&apos;": "'",
};

function decodeSvgEntities(raw: string): string {
  return raw.replace(/&(?:amp|lt|gt|quot|apos|#39|#x27);/g, (m) => SVG_ENTITY_MAP[m] ?? m);
}

function escapeSvgText(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

interface SvgRun { index: number; start: number; end: number; value: string; }

function scanSvgRuns(markup: string): SvgRun[] {
  const runs: SvgRun[] = [];
  const stack: string[] = [];
  const tagRe = /<(\\/?)([a-zA-Z][a-zA-Z0-9:_-]*)((?:[^>"']|"[^"]*"|'[^']*')*?)(\\/?)>|<!--[\\s\\S]*?-->/g;
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
    const tag = match[2].toLowerCase();
    if (match[1] === "/") {
      for (let i = stack.length - 1; i >= 0; i--) {
        if (stack[i] === tag) { stack.length = i; break; }
      }
    } else if (match[4] !== "/") {
      stack.push(tag);
    }
  }
  emit(cursor, markup.length);
  return runs;
}

function applySvgText(owner: RuntimeElementNode, op: ResolvedOp): void {
  if (typeof owner.v !== "string" || op.binding.svgTextIndex === undefined) {
    return warnSkip(op, "svg markup or run index missing");
  }
  const run = scanSvgRuns(owner.v).find((r) => r.index === op.binding.svgTextIndex);
  if (!run) return warnSkip(op, "svg text run not found");
  if (run.value !== op.binding.expectedValue) return warnSkip(op, "guard mismatch");
  if (op.value === undefined || op.value === run.value) return;
  owner.v = owner.v.slice(0, run.start) + escapeSvgText(op.value) + owner.v.slice(run.end);
}

function applyToOwner(owner: RuntimeElementNode, op: ResolvedOp): void {
  if (op.binding.target === "text") applyText(owner, op);
  else if (op.binding.target === "svg-text") applySvgText(owner, op);
  else applyAttribute(owner, op);
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

export async function applySlotContent(page: RuntimePage): Promise<RuntimePage> {
  const contract = await getContract();
  for (const viewport of ["desktop", "mobile"] as const) {
    const ops = contract.get(page.pageId + "|" + viewport);
    if (!ops || ops.length === 0) continue;
    const index = indexElements(page[viewport].doc);
    /** trigger nodeId → parsed data-wr-obs payload (+ dirty flag). */
    const obsCache = new Map<string, { entries: ObsEntry[]; dirty: boolean }>();

    for (const op of ops) {
      const binding = op.binding;
      // paint-twin occurrences live in the static tree like any other node.
      if (binding.surface === "static" || binding.surface === "paint-twin") {
        const owner = index.get(binding.nodeId);
        if (!owner) {
          warnSkip(op, "node not found");
          continue;
        }
        applyToOwner(owner, op);
        continue;
      }
      // dynamic-template: the addressed node lives inside the trigger's
      // serialized data-wr-obs payload.
      const trigger = index.get(binding.nodeId);
      const raw = trigger?.p?.["data-wr-obs"];
      if (!trigger || typeof raw !== "string") {
        warnSkip(op, "trigger or data-wr-obs missing");
        continue;
      }
      let cached = obsCache.get(binding.nodeId);
      if (!cached) {
        try {
          cached = { entries: JSON.parse(raw) as ObsEntry[], dirty: false };
        } catch {
          warnSkip(op, "unparsable data-wr-obs");
          continue;
        }
        obsCache.set(binding.nodeId, cached);
      }
      const entry = cached.entries.find((e) => e.di === binding.discoveryId);
      if (!entry || !Array.isArray(entry.tpl)) {
        warnSkip(op, "discovery entry or template missing");
        continue;
      }
      const owner = binding.templateNodeId
        ? findTemplateNode(entry.tpl, binding.templateNodeId)
        : undefined;
      if (!owner) {
        warnSkip(op, "template node not found");
        continue;
      }
      const probe = (): string =>
        JSON.stringify(
          binding.target === "text"
            ? (owner.c ?? [])[binding.childIndex ?? -1]
            : binding.target === "svg-text"
              ? owner.v
              : owner.p?.[binding.attributeName ?? ""],
        );
      const before = probe();
      applyToOwner(owner, op);
      const after = probe();
      if (before !== after) cached.dirty = true;
    }

    // Re-serialize only the payloads that actually changed, so an untouched
    // page keeps its original byte-exact annotations.
    for (const [triggerNodeId, cached] of obsCache) {
      if (!cached.dirty) continue;
      const trigger = index.get(triggerNodeId);
      if (!trigger || !trigger.p) continue;
      (trigger.p as Record<string, unknown>)["data-wr-obs"] = JSON.stringify(cached.entries);
    }
  }
  return page;
}
`;

/**
 * The template app's `load-page.ts`: the Exact Reconstruction's loader with
 * ONE added step — slot content application after parse, before caching.
 */
export const TEMPLATE_LOAD_PAGE_TS = `import "server-only";
import { readFile } from "node:fs/promises";
import path from "node:path";
import type { RuntimePage } from "./types";
import { applySlotContent } from "./slot-content";

/**
 * Runtime page data loading. SERVER ONLY. Generated — do not edit.
 *
 * Identical to the Exact Reconstruction's loader except for one line: the
 * parsed page passes through \`applySlotContent()\` before it is cached, so
 * every render — server HTML and the hydration payload alike — sees the same
 * already-applied tree. There is no client-side patching of any kind.
 */

const DATA_DIR = path.join(process.cwd(), "reconstruction-data");

const cache = new Map<string, Promise<RuntimePage>>();

function resolveInsideDataDir(reference: string): string {
  if (reference === "") throw new Error("page file reference is empty");
  if (reference.startsWith("/") || /^[A-Za-z]:[\\\\/]/.test(reference)) {
    throw new Error("page file reference is an absolute path: " + reference);
  }
  if (reference.includes("\\\\")) {
    throw new Error("page file reference uses a backslash separator: " + reference);
  }
  if (reference.split("/").includes("..")) {
    throw new Error("page file reference escapes the data directory: " + reference);
  }
  const resolved = path.resolve(DATA_DIR, reference);
  const root = path.resolve(DATA_DIR);
  if (resolved !== root && !resolved.startsWith(root + path.sep)) {
    throw new Error("page file reference resolves outside the data directory: " + reference);
  }
  return resolved;
}

export function loadPage(pageFile: string): Promise<RuntimePage> {
  let pending = cache.get(pageFile);
  if (!pending) {
    const file = resolveInsideDataDir(pageFile);
    pending = readFile(file, "utf8")
      .then((raw) => JSON.parse(raw) as RuntimePage)
      .then((page) => applySlotContent(page));
    cache.set(pageFile, pending);
  }
  return pending;
}
`;
