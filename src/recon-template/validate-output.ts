import { readFile } from "node:fs/promises";
import path from "node:path";
import type { RuntimeElementNode, RuntimeNode, RuntimePage } from "../reconstruction/index.js";
import {
  DEFAULT_CONTENT_FILE,
  SLOTS_FILE,
  SLOT_BINDINGS_FILE,
  TEMPLATE_APP_DIR,
  TEMPLATE_DATA_DIR,
  TEMPLATE_MANIFEST_FILE,
  SITE_MAP_FILE,
  DefaultContentFileSchema,
  SiteMapSchema,
  SlotBindingsFileSchema,
  SlotsFileSchema,
  TemplateManifestSchema,
  TemplateCompileError,
  type SlotBinding,
  type SlotValue,
} from "./types.js";
import { scanSvgTextRuns } from "./svg-text.js";

/**
 * Artifact validation — reads the WRITTEN template run back off disk and
 * proves the two properties the browser QA then re-proves observationally:
 *
 *   1. every binding RESOLVES: the addressed node exists in the template
 *      app's runtime data and currently holds `expectedValue`, and
 *   2. applying the default content is an exact no-op: for every binding, the
 *      default value (projected through the binding's field) equals
 *      `expectedValue` — so the slot layer, applied with defaults, cannot
 *      change a byte of what renders.
 *
 * Plus the bookkeeping invariants: sequential ids, unique keys, referential
 * integrity between the three files, byte-identical app copies, and manifest
 * counts that match what is actually on disk.
 */

export interface TemplateValidation {
  slots: number;
  bindings: number;
  resolvedBindings: number;
  defaultNoOpBindings: number;
  problems: string[];
}

function projectDefault(value: SlotValue, field: SlotBinding["field"]): string | undefined {
  if (typeof value === "string") return field === undefined ? value : undefined;
  if (field === undefined) return undefined;
  return value[field];
}

interface ObsEntry {
  di?: string;
  tpl?: RuntimeNode[];
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

function findTemplateNode(nodes: RuntimeNode[], templateNodeId: string): RuntimeElementNode | undefined {
  for (const node of nodes) {
    if (node.k !== "e") continue;
    if (node.n === templateNodeId) return node;
    const found = node.c ? findTemplateNode(node.c, templateNodeId) : undefined;
    if (found) return found;
  }
  return undefined;
}

function currentValueAt(
  binding: SlotBinding,
  elementIndex: Map<string, RuntimeElementNode>,
): string | undefined {
  let owner: RuntimeElementNode | undefined;
  if (binding.surface === "static" || binding.surface === "paint-twin") {
    owner = elementIndex.get(binding.nodeId);
  } else {
    const trigger = elementIndex.get(binding.nodeId);
    const raw = trigger?.p?.["data-wr-obs"];
    if (typeof raw !== "string") return undefined;
    let entries: ObsEntry[];
    try {
      entries = JSON.parse(raw) as ObsEntry[];
    } catch {
      return undefined;
    }
    const entry = entries.find((e) => e.di === binding.discoveryId);
    if (!entry || !Array.isArray(entry.tpl) || binding.templateNodeId === undefined) return undefined;
    owner = findTemplateNode(entry.tpl, binding.templateNodeId);
  }
  if (!owner) return undefined;
  if (binding.target === "text") {
    const child = (owner.c ?? [])[binding.childIndex ?? -1];
    return child && child.k === "t" ? child.v : undefined;
  }
  if (binding.target === "svg-text") {
    if (typeof owner.v !== "string" || binding.svgTextIndex === undefined) return undefined;
    const run = scanSvgTextRuns(owner.v).find((r) => r.index === binding.svgTextIndex);
    return run?.value;
  }
  const value = owner.p?.[binding.attributeName ?? ""];
  return typeof value === "string" ? value : undefined;
}

export async function validateTemplateArtifact(runDir: string): Promise<TemplateValidation> {
  const problems: string[] = [];
  const readJson = async (file: string): Promise<unknown> =>
    JSON.parse(await readFile(file, "utf8")) as unknown;

  const manifest = TemplateManifestSchema.parse(await readJson(path.join(runDir, TEMPLATE_MANIFEST_FILE)));
  const slotsFile = SlotsFileSchema.parse(await readJson(path.join(runDir, SLOTS_FILE)));
  const bindingsFile = SlotBindingsFileSchema.parse(await readJson(path.join(runDir, SLOT_BINDINGS_FILE)));
  const contentFile = DefaultContentFileSchema.parse(await readJson(path.join(runDir, DEFAULT_CONTENT_FILE)));
  SiteMapSchema.parse(await readJson(path.join(runDir, SITE_MAP_FILE)));

  // App copies must be byte-identical to the top-level artifact files.
  for (const [top, appName] of [
    [SLOTS_FILE, "slots.json"],
    [SLOT_BINDINGS_FILE, "slot-bindings.json"],
    [DEFAULT_CONTENT_FILE, "default-content.json"],
  ] as const) {
    const a = await readFile(path.join(runDir, top), "utf8");
    const b = await readFile(path.join(runDir, TEMPLATE_APP_DIR, TEMPLATE_DATA_DIR, appName), "utf8");
    if (a !== b) problems.push(`app copy of ${appName} differs from the top-level artifact file`);
  }

  // Ids sequential + keys unique + referential integrity.
  const slotById = new Map(slotsFile.slots.map((s) => [s.id, s]));
  const keys = new Set<string>();
  slotsFile.slots.forEach((slot, i) => {
    const expectedId = `sl${String(i + 1).padStart(6, "0")}`;
    if (slot.id !== expectedId) problems.push(`slot id out of sequence: ${slot.id} at index ${i}`);
    if (keys.has(slot.key)) problems.push(`duplicate slot key: ${slot.key}`);
    keys.add(slot.key);
  });
  bindingsFile.bindings.forEach((binding, i) => {
    const expectedId = `b${String(i + 1).padStart(6, "0")}`;
    if (binding.bindingId !== expectedId) problems.push(`binding id out of sequence: ${binding.bindingId}`);
    if (!slotById.has(binding.slotId)) problems.push(`binding ${binding.bindingId} references unknown slot ${binding.slotId}`);
  });
  const bindingsBySlot = new Map<string, string[]>();
  for (const binding of bindingsFile.bindings) {
    const list = bindingsBySlot.get(binding.slotId) ?? [];
    list.push(binding.bindingId);
    bindingsBySlot.set(binding.slotId, list);
  }
  for (const slot of slotsFile.slots) {
    const actual = bindingsBySlot.get(slot.id) ?? [];
    if (JSON.stringify(actual) !== JSON.stringify(slot.bindingIds)) {
      problems.push(`slot ${slot.key} bindingIds do not match slot-bindings.json`);
    }
  }

  // Default content: complete, and exactly the slot defaults.
  const contentKeys = new Set(Object.keys(contentFile.values));
  for (const slot of slotsFile.slots) {
    if (!contentKeys.has(slot.key)) {
      problems.push(`default-content.json missing slot key ${slot.key}`);
      continue;
    }
    if (JSON.stringify(contentFile.values[slot.key]) !== JSON.stringify(slot.defaultValue)) {
      problems.push(`default-content value differs from slot defaultValue for ${slot.key}`);
    }
  }
  for (const key of contentKeys) {
    if (!keys.has(key)) problems.push(`default-content.json has a value for unknown slot key ${key}`);
  }

  // The lossless core: default == expected for every binding, and every
  // binding resolves in the emitted app data with exactly that value.
  const pagesDir = path.join(runDir, TEMPLATE_APP_DIR, "reconstruction-data", "pages");
  const pageCache = new Map<string, RuntimePage>();
  const elementIndexCache = new Map<string, Map<string, RuntimeElementNode>>();
  const loadIndex = async (pageId: string, viewport: "desktop" | "mobile") => {
    const cacheKey = `${pageId}|${viewport}`;
    let index = elementIndexCache.get(cacheKey);
    if (!index) {
      let page = pageCache.get(pageId);
      if (!page) {
        page = JSON.parse(await readFile(path.join(pagesDir, `${pageId}.json`), "utf8")) as RuntimePage;
        pageCache.set(pageId, page);
      }
      index = indexElements(page[viewport].doc);
      elementIndexCache.set(cacheKey, index);
    }
    return index;
  };

  let resolvedBindings = 0;
  let defaultNoOpBindings = 0;
  for (const binding of bindingsFile.bindings) {
    const slot = slotById.get(binding.slotId);
    if (!slot) continue;
    const projected = projectDefault(slot.defaultValue, binding.field);
    if (projected === binding.expectedValue) defaultNoOpBindings++;
    else problems.push(`binding ${binding.bindingId} default != expectedValue for ${slot.key}`);
    let index: Map<string, RuntimeElementNode>;
    try {
      index = await loadIndex(binding.pageId, binding.viewport);
    } catch (error) {
      problems.push(`binding ${binding.bindingId} page ${binding.pageId} unreadable: ${(error as Error).message}`);
      continue;
    }
    const current = currentValueAt(binding, index);
    if (current === binding.expectedValue) resolvedBindings++;
    else {
      problems.push(
        `binding ${binding.bindingId} (${slot.key}) does not resolve: expected ${JSON.stringify(
          binding.expectedValue.slice(0, 60),
        )}, found ${current === undefined ? "nothing" : JSON.stringify(current.slice(0, 60))}`,
      );
    }
  }

  // Manifest counts vs reality.
  const c = manifest.counts;
  const check = (name: string, expected: number, actual: number): void => {
    if (expected !== actual) problems.push(`manifest count ${name} = ${expected} but artifact holds ${actual}`);
  };
  check("slots", c.slots, slotsFile.slots.length);
  check("bindings", c.bindings, bindingsFile.bindings.length);
  check("globalSlots", c.globalSlots, slotsFile.slots.filter((s) => s.scope === "global").length);
  check("pageSlots", c.pageSlots, slotsFile.slots.filter((s) => s.scope === "page").length);
  check("textSlots", c.textSlots, slotsFile.slots.filter((s) => s.type === "text").length);
  check("urlSlots", c.urlSlots, slotsFile.slots.filter((s) => s.type === "url").length);
  check("imageSlots", c.imageSlots, slotsFile.slots.filter((s) => s.type === "image").length);
  check(
    "staticBindings",
    c.staticBindings,
    bindingsFile.bindings.filter((b) => b.surface === "static").length,
  );
  check(
    "dynamicTemplateBindings",
    c.dynamicTemplateBindings,
    bindingsFile.bindings.filter((b) => b.surface === "dynamic-template").length,
  );
  if (c.paintTwinBindings !== undefined) {
    check(
      "paintTwinBindings",
      c.paintTwinBindings,
      bindingsFile.bindings.filter((b) => b.surface === "paint-twin").length,
    );
  }
  if (c.svgTextBindings !== undefined) {
    check(
      "svgTextBindings",
      c.svgTextBindings,
      bindingsFile.bindings.filter((b) => b.target === "svg-text").length,
    );
  }

  if (problems.length > 0) {
    throw new TemplateCompileError(
      `template artifact validation failed (${problems.length} problem(s)):\n  ` +
        problems.slice(0, 25).join("\n  ") +
        (problems.length > 25 ? `\n  … and ${problems.length - 25} more` : ""),
    );
  }

  return {
    slots: slotsFile.slots.length,
    bindings: bindingsFile.bindings.length,
    resolvedBindings,
    defaultNoOpBindings,
    problems,
  };
}
