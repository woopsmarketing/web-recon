import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import type { SlotBinding as V2Binding, SlotDefinition as V2Slot } from "../recon-template/index.js";
import { buildAuthoring } from "./authoring.js";
import { buildCoverage } from "./coverage.js";
import { mergeGlobals } from "./globals.js";
import { buildGroups } from "./groups.js";
import { bindingIdOf, slotIdOf, templateVersionOf } from "./ids.js";
import { loadSlotizeInput, type SlotizeInput } from "./load-input.js";
import type { PreSlot } from "./preslot.js";
import { detectRepeaters } from "./repeaters.js";
import { extractAndWriteTheme } from "./theme-pack.js";
import { scanSurfaces, textFitHints, type RawBinding, type V2Coverage } from "./surfaces.js";
import { createdAtFromRunId, newSlotizedRunId, slotizedTemplateRunDir } from "./store.js";
import { indexPages, slugify } from "./tree.js";
import {
  AUTHORING_FILE,
  BINDINGS_FILE,
  CONTENT_PACKS_DIR,
  CONTENT_PACK_SCHEMA,
  COVERAGE_FILE,
  DEFAULT_PACK_FILE,
  GROUPS_FILE,
  MANIFEST_FILE,
  REPEATERS_FILE,
  SLOTIZED_ENGINE,
  SLOTIZED_TEMPLATE_SCHEMA_NAME,
  SLOTIZED_TEMPLATE_SCHEMA_VERSION,
  SLOTS_FILE,
  TEMPLATE_DIR,
  TEMPLATE_PAGES_DIR,
  TEMPLATE_ROUTE_MAP_FILE,
  TEMPLATE_SOURCE_FILE,
  THEME_FILE,
  THEME_PACKS_DIR,
  THEME_PACK_SCHEMA,
  type Binding,
  type ContentPack,
  type FitHints,
  type SlotDefinition,
  type SlotEditor,
  type SlotType,
  type SlotValue,
  type SlotizedManifest,
  type ThemePack,
} from "./types.js";
import type { GroupDefinition, RepeaterItem } from "./types.js";

/**
 * The slotize compiler: Slot V2 contract + reconstructed DOM + generated
 * stylesheet → a Slotized Template.
 *
 * What it adds over Slot V2 is not "more slots of the same kind" but the
 * surfaces Slot V2 structurally cannot see (CSS background media, video, page
 * title, copy attributes, unresolved images), plus the two things an editor
 * needs and a binding list does not provide: GROUPS (what belongs together)
 * and COVERAGE (what is still not editable, and why).
 *
 * Everything is deterministic: no clock, no counter, no map-iteration
 * accident. Two runs over the same input produce byte-identical definition
 * files — only the manifest's runId/createdAt differ.
 */

const HEADING_ROLES = new Set(["heading.primary", "heading.secondary", "hero.headline", "meta.title"]);

export interface SlotizeOptions {
  manifestFile: string;
  outputDir?: string;
  runId?: string;
}

export interface SlotizeResult {
  outDir: string;
  manifest: SlotizedManifest;
}

function labelFromKey(key: string): string {
  return key
    .split(".")
    .map((part) => part.replace(/-/g, " ").replace(/^\w/, (c) => c.toUpperCase()))
    .join(" · ");
}

function landmarkOfEvidence(evidence: readonly string[]): string {
  for (const tag of evidence) if (tag.startsWith("landmark:")) return tag.slice("landmark:".length);
  return "body";
}

function editorFor(type: SlotType, chars: number | undefined): SlotEditor {
  switch (type) {
    case "image":
      return { control: "image" };
    case "video":
      return { control: "video" };
    case "url":
      return { control: "url" };
    case "email":
      return { control: "email" };
    case "phone":
      return { control: "phone" };
    default:
      return chars !== undefined && chars > 80
        ? { control: "textarea", multiline: true }
        : { control: "text" };
  }
}

function imageFitHints(v2: V2Slot): FitHints | undefined {
  const c = v2.constraints as
    | { desktop?: { renderedWidth?: number; renderedHeight?: number; aspectRatio?: number } }
    | undefined;
  const desktop = c?.desktop;
  if (!desktop || !desktop.renderedWidth || !desktop.renderedHeight) return undefined;
  const ratio = desktop.aspectRatio ?? desktop.renderedWidth / desktop.renderedHeight;
  return {
    aspectRatio: ratio,
    orientation: ratio > 1.05 ? "landscape" : ratio < 0.95 ? "portrait" : "square",
    recommendedWidth: desktop.renderedWidth,
    recommendedHeight: desktop.renderedHeight,
  };
}

function textFitFromV2(v2: V2Slot, heading: boolean): FitHints | undefined {
  const c = v2.constraints as
    | { sourceCharacterCount?: number; sourceWordCount?: number; desktop?: { lineCount?: number } }
    | undefined;
  if (!c || c.sourceCharacterCount === undefined) {
    return typeof v2.defaultValue === "string" ? textFitHints(v2.defaultValue, heading) : undefined;
  }
  return {
    sourceChars: c.sourceCharacterCount,
    ...(c.sourceWordCount === undefined ? {} : { sourceWords: c.sourceWordCount }),
    recommendedMaxChars: Math.max(1, Math.ceil(c.sourceCharacterCount * (heading ? 1.3 : 1.5))),
    ...(c.desktop?.lineCount === undefined ? {} : { lineCount: c.desktop.lineCount }),
  };
}

/**
 * Slot V2 `url` slots split by scheme: a phone number and an email address are
 * different editing experiences from a page link, and the distinction is
 * deterministic (the href's own scheme), never guessed.
 */
function urlType(value: SlotValue): SlotType {
  if (typeof value !== "string") return "url";
  const lowered = value.trim().toLowerCase();
  if (lowered.startsWith("tel:")) return "phone";
  if (lowered.startsWith("mailto:")) return "email";
  return "url";
}

function convertV2Binding(v2b: V2Binding): RawBinding {
  const isSvg = v2b.target === "svg-text";
  const surface = isSvg && v2b.surface !== "dynamic-template" ? "svg-text" : v2b.surface;
  return {
    pageId: v2b.pageId,
    nodeId: v2b.nodeId,
    variant: v2b.viewport,
    target: v2b.target === "attribute" ? "attribute" : "textContent",
    ...(v2b.attributeName === undefined ? {} : { property: v2b.attributeName }),
    ...(v2b.field === undefined ? {} : { field: v2b.field }),
    address: {
      surface,
      ...(v2b.discoveryId === undefined ? {} : { discoveryId: v2b.discoveryId }),
      ...(v2b.templateNodeId === undefined ? {} : { templateNodeId: v2b.templateNodeId }),
      ...(v2b.childIndex === undefined ? {} : { childIndex: v2b.childIndex }),
      ...(v2b.textSegment === undefined ? {} : { textSegment: v2b.textSegment }),
      ...(v2b.svgTextIndex === undefined ? {} : { svgTextIndex: v2b.svgTextIndex }),
      ...(v2b.svgTextPath === undefined ? {} : { svgTextPath: v2b.svgTextPath }),
    },
    expectedValue: v2b.expectedValue,
  };
}

/** Page key prefix Slot V2 already chose (`home`, `kr-pricing`, …). */
function keyPrefixes(input: SlotizeInput): Map<string, string> {
  const counts = new Map<string, Map<string, number>>();
  for (const slot of input.v2.slots) {
    if (slot.pageId === undefined) continue;
    const prefix = slot.key.split(".")[0] ?? slot.pageId;
    const bucket = counts.get(slot.pageId) ?? new Map<string, number>();
    bucket.set(prefix, (bucket.get(prefix) ?? 0) + 1);
    counts.set(slot.pageId, bucket);
  }
  const out = new Map<string, string>();
  for (const pageId of input.pages.keys()) {
    const bucket = counts.get(pageId);
    if (bucket && bucket.size > 0) {
      const best = [...bucket.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0]!;
      out.set(pageId, best[0]);
      continue;
    }
    const route = input.routeMap.routes.find((r) => r.pageSourceId === pageId);
    out.set(pageId, route ? slugify(route.path === "/" ? "home" : route.path) : pageId);
  }
  return out;
}

function v2CoverageSets(bindings: readonly V2Binding[]): V2Coverage {
  const coverage: V2Coverage = { text: new Set(), attribute: new Set(), nodes: new Set() };
  for (const b of bindings) {
    const base = `${b.pageId}|${b.viewport}|${b.nodeId}`;
    coverage.nodes.add(base);
    if (b.target === "attribute" && b.attributeName) coverage.attribute.add(`${base}|${b.attributeName}`);
    if (b.target === "text") coverage.text.add(`${base}|${b.childIndex ?? ""}`);
  }
  return coverage;
}

function stableStringify(value: unknown): string {
  return `${JSON.stringify(value, null, 2)}\n`;
}

export async function slotize(options: SlotizeOptions): Promise<SlotizeResult> {
  const input = await loadSlotizeInput(options.manifestFile);
  const pages = indexPages(input.pages);
  const prefixByPage = keyPrefixes(input);
  const limitations: string[] = [];

  // --- 1. Slot V2 → Task 29 pre-slots ---------------------------------------
  const v2BindingById = new Map(input.v2.bindings.map((b) => [b.bindingId, b] as const));
  const preSlots: PreSlot[] = [];
  for (const v2 of input.v2.slots) {
    const bindings = v2.bindingIds
      .map((id) => v2BindingById.get(id))
      .filter((b): b is V2Binding => b !== undefined)
      .map(convertV2Binding);
    if (bindings.length === 0) continue;
    const type: SlotType = v2.type === "image" ? "image" : v2.type === "url" ? urlType(v2.defaultValue) : "text";
    const heading = HEADING_ROLES.has(v2.role);
    const fitHints = type === "image" ? imageFitHints(v2) : textFitFromV2(v2, heading);
    preSlots.push({
      key: v2.key,
      type,
      role: v2.role,
      label: v2.label,
      scope: v2.scope,
      ...(v2.pageId === undefined ? {} : { pageId: v2.pageId }),
      ...(v2.route === undefined ? {} : { route: v2.route }),
      defaultValue: v2.defaultValue as SlotValue,
      ...(fitHints === undefined ? {} : { fitHints }),
      behavior: { onEmpty: "keep" },
      editor: editorFor(type, fitHints?.sourceChars),
      evidence: v2.evidence,
      notes: v2.editability === "review" ? ["slot-v2:review"] : [],
      source: "slot-v2",
      slotV2Id: v2.id,
      ...(v2.groupId === undefined ? {} : { v2GroupId: v2.groupId }),
      section: landmarkOfEvidence(v2.evidence),
      coverageClass: v2.type === "image" ? "images" : v2.type === "url" ? "links" : "visibleText",
      bindings,
    });
  }

  // --- 2. Surfaces Slot V2 cannot see ---------------------------------------
  const stylesheet = await readFile(input.stylesheetFile, "utf8");
  const scan = scanSurfaces({
    pages,
    keyPrefixByPage: prefixByPage,
    routeMap: input.routeMap,
    stylesheet,
    v2: v2CoverageSets(input.v2.bindings),
  });
  limitations.push(...scan.limitations);

  const usedKeys = new Set(preSlots.map((s) => s.key));
  const uniqueKey = (base: string): string => {
    if (!usedKeys.has(base)) {
      usedKeys.add(base);
      return base;
    }
    for (let n = 2; ; n++) {
      const candidate = `${base}-${n}`;
      if (!usedKeys.has(candidate)) {
        usedKeys.add(candidate);
        return candidate;
      }
    }
  };

  let mergedNewSurfaceSlots = 0;
  let separateNewSurfaceSlots = 0;
  for (const raw of [...scan.slots].sort((a, b) => a.mergeKey.localeCompare(b.mergeKey))) {
    const pageIds = new Set(raw.bindings.map((b) => b.pageId));
    const variants = new Set(raw.bindings.map((b) => b.variant));
    if (variants.size > 1) mergedNewSurfaceSlots++;
    else separateNewSurfaceSlots++;
    const crossPage = pageIds.size > 1;
    const prefix = crossPage ? "global" : raw.keyPrefix;
    preSlots.push({
      key: uniqueKey(`${prefix}.${raw.section}.${raw.kind}.${raw.slug}`),
      type: raw.type,
      ...(raw.role === undefined ? {} : { role: raw.role }),
      label: labelFromKey(`${prefix}.${raw.section}.${raw.kind}.${raw.slug}`),
      scope: crossPage ? "global" : "page",
      ...(crossPage || raw.pageId === undefined ? {} : { pageId: raw.pageId }),
      defaultValue: raw.defaultValue,
      ...(raw.fitHints === undefined ? {} : { fitHints: raw.fitHints }),
      behavior: { onEmpty: "keep" },
      editor: editorFor(raw.type, raw.fitHints?.sourceChars),
      evidence: raw.evidence,
      notes: crossPage ? [`global:css-rule pages=${pageIds.size}`] : [],
      source: "surface-scan",
      section: raw.section,
      coverageClass: raw.coverageClass,
      bindings: raw.bindings,
    });
  }

  // --- 3. Conservative template-local global merge ---------------------------
  const globalMerge = mergeGlobals(preSlots);

  // --- 4. Ids (hashes of the final binding set) ------------------------------
  // Sorted by a TOTAL order (key + provenance + binding addresses), never by
  // key alone: two slots can share a key after the global merge, and an
  // ambiguous sort would make key disambiguation depend on iteration luck.
  const sortSignature = (p: PreSlot): string =>
    [
      p.key,
      p.source,
      p.slotV2Id ?? "",
      p.pageId ?? "",
      p.bindings
        .map(
          (b) =>
            `${b.pageId}:${b.variant ?? ""}:${b.nodeId ?? ""}:${b.target}:${b.property ?? ""}:${b.field ?? ""}:${b.address.childIndex ?? ""}:${b.address.svgTextIndex ?? ""}:${b.address.cssSelector ?? ""}:${b.address.routeId ?? ""}`,
        )
        .join(","),
    ].join("\u0000");
  const ordered = [...globalMerge.slots].sort((a, b) => sortSignature(a).localeCompare(sortSignature(b)));
  // The global merge can rename a slot onto a key that already exists; keys are
  // the human handle on this template, so they must stay unique.
  const finalKeys = new Set<string>();
  for (const pre of ordered) {
    if (!finalKeys.has(pre.key)) {
      finalKeys.add(pre.key);
      continue;
    }
    for (let n = 2; ; n++) {
      const candidate = `${pre.key}-${n}`;
      if (!finalKeys.has(candidate)) {
        pre.key = candidate;
        finalKeys.add(candidate);
        break;
      }
    }
  }
  const slots: SlotDefinition[] = [];
  const bindings: Binding[] = [];
  const sectionBySlot = new Map<string, string>();
  const v2GroupBySlot = new Map<string, string>();
  const seenSlotIds = new Set<string>();
  const seenBindingIds = new Set<string>();
  let droppedDuplicateBindings = 0;

  for (const pre of ordered) {
    const withIds = pre.bindings.map((b) => ({
      raw: b,
      id: bindingIdOf({
        templateSourceId: input.v2.templateId,
        pageId: b.pageId,
        variant: b.variant,
        surface: b.address.surface,
        nodeId: b.nodeId,
        discoveryId: b.address.discoveryId,
        templateNodeId: b.address.templateNodeId,
        target: b.target,
        property: b.property,
        field: b.field,
        childIndex: b.address.childIndex,
        svgTextIndex: b.address.svgTextIndex,
        cssSelector: b.address.cssSelector,
        metadataKey: b.address.metadataKey,
        routeId: b.address.routeId,
      }),
    }));
    const unique = new Map<string, (typeof withIds)[number]>();
    for (const entry of withIds) if (!unique.has(entry.id)) unique.set(entry.id, entry);
    const bindingIds = [...unique.keys()].sort();
    if (bindingIds.length === 0) continue;
    const slotId = slotIdOf(bindingIds);
    if (seenSlotIds.has(slotId)) {
      limitations.push(`duplicate slot identity dropped: ${pre.key} writes the same occurrences as an earlier slot`);
      continue;
    }
    seenSlotIds.add(slotId);
    sectionBySlot.set(slotId, pre.section);
    if (pre.v2GroupId !== undefined) v2GroupBySlot.set(slotId, pre.v2GroupId);

    const kept: string[] = [];
    for (const bindingId of bindingIds) {
      if (seenBindingIds.has(bindingId)) {
        droppedDuplicateBindings++;
        continue;
      }
      seenBindingIds.add(bindingId);
      kept.push(bindingId);
      const raw = unique.get(bindingId)!.raw;
      bindings.push({
        id: bindingId,
        slotId,
        pageId: raw.pageId,
        ...(raw.nodeId === undefined ? {} : { nodeId: raw.nodeId }),
        ...(raw.variant === undefined ? {} : { variant: raw.variant }),
        target: raw.target,
        ...(raw.property === undefined ? {} : { property: raw.property }),
        ...(raw.field === undefined ? {} : { field: raw.field }),
        address: raw.address,
        ...(raw.expectedValue === undefined ? {} : { expectedValue: raw.expectedValue }),
        ...(raw.transform === undefined ? {} : { transform: raw.transform }),
      });
    }
    if (kept.length === 0) continue;
    slots.push({
      id: slotId,
      key: pre.key,
      type: pre.type,
      ...(pre.role === undefined ? {} : { role: pre.role }),
      ...(pre.label === undefined ? {} : { label: pre.label }),
      scope: pre.scope,
      ...(pre.pageId === undefined ? {} : { pageId: pre.pageId }),
      ...(pre.route === undefined ? {} : { route: pre.route }),
      defaultValue: pre.defaultValue,
      bindingIds: kept,
      ...(pre.constraints === undefined ? {} : { constraints: pre.constraints }),
      ...(pre.fitHints === undefined ? {} : { fitHints: pre.fitHints }),
      ...(pre.behavior === undefined ? {} : { behavior: pre.behavior }),
      ...(pre.editor === undefined ? {} : { editor: pre.editor }),
      provenance: {
        source: pre.source,
        ...(pre.slotV2Id === undefined ? {} : { slotV2Id: pre.slotV2Id }),
        evidence: pre.evidence,
        ...(pre.notes.length === 0 ? {} : { notes: pre.notes }),
      },
    });
  }
  if (droppedDuplicateBindings > 0) {
    limitations.push(
      `${droppedDuplicateBindings} duplicate binding address(es) dropped so no occurrence is written twice`,
    );
  }

  slots.sort((a, b) => a.key.localeCompare(b.key));
  bindings.sort((a, b) => a.id.localeCompare(b.id));
  const bindingsBySlot = new Map<string, Binding[]>();
  for (const binding of bindings) {
    const list = bindingsBySlot.get(binding.slotId) ?? [];
    list.push(binding);
    bindingsBySlot.set(binding.slotId, list);
  }

  // --- 5. Groups, coverage ---------------------------------------------------
  const groups = buildGroups({
    slots,
    bindingsBySlot,
    pages,
    keyPrefixByPage: prefixByPage,
    sectionBySlot,
    v2GroupBySlot,
  });
  const templateId = `${input.host}:${input.reconstructionRunId}`;
  const coverage = buildCoverage({
    templateId,
    pages,
    routeMap: input.routeMap,
    bindings,
    backgroundRules: scan.backgroundRules,
    backgroundOccurrences: scan.occurrences.backgroundMedia ?? 0,
    likelyGlobal: globalMerge.likelyGlobal,
  });

  // --- 6. Repeaters ----------------------------------------------------------
  // Detection runs AFTER grouping and coverage: it consumes the final slots and
  // bindings (an item is only a repeater item if something in it is editable),
  // and it must not shift the coverage accounting of DOM surfaces, which the
  // repeater-field bindings are not — they are a second, relative address for
  // occurrences already counted.
  const detected = detectRepeaters({
    pages,
    keyPrefixByPage: prefixByPage,
    slots,
    bindings,
    groups,
    stylesheet,
  });
  limitations.push(...detected.limitations);
  for (const slot of slots) {
    const repeaterId = detected.slotRepeaterTags.get(slot.id);
    if (repeaterId !== undefined) slot.repeaterId = repeaterId;
  }
  const groupById = new Map(groups.map((g) => [g.id, g] as const));
  for (const [groupId, attachment] of [...detected.groupAttachments.entries()].sort()) {
    const group: GroupDefinition | undefined = groupById.get(groupId);
    if (!group) continue;
    group.repeaterIds = [...new Set([...(group.repeaterIds ?? []), ...attachment.repeaterIds])].sort();
    group.slotIds = [...new Set([...group.slotIds, ...attachment.slotIds])].sort();
  }
  for (const slot of detected.fieldSlots) slots.push(slot);
  for (const binding of detected.fieldBindings) bindings.push(binding);
  slots.sort((a, b) => a.key.localeCompare(b.key));
  bindings.sort((a, b) => a.id.localeCompare(b.id));
  bindingsBySlot.clear();
  for (const binding of bindings) {
    const list = bindingsBySlot.get(binding.slotId) ?? [];
    list.push(binding);
    bindingsBySlot.set(binding.slotId, list);
  }
  const repeaters = detected.repeaters;
  const defaultRepeaterItems: Record<string, { items: RepeaterItem[] }> = {};
  for (const repeater of repeaters) {
    defaultRepeaterItems[repeater.id] = { items: detected.defaultItemsByRepeater.get(repeater.id) ?? [] };
  }

  // --- 7. Write --------------------------------------------------------------
  const runId = options.runId ?? newSlotizedRunId();
  const outDir = options.outputDir ?? slotizedTemplateRunDir(input.host, runId);
  await mkdir(path.join(outDir, TEMPLATE_DIR, TEMPLATE_PAGES_DIR), { recursive: true });
  await mkdir(path.join(outDir, CONTENT_PACKS_DIR), { recursive: true });
  await mkdir(path.join(outDir, THEME_PACKS_DIR), { recursive: true });

  const routeMapBody = stableStringify(input.routeMap);
  await writeFile(path.join(outDir, TEMPLATE_DIR, TEMPLATE_ROUTE_MAP_FILE), routeMapBody, "utf8");
  const pageBodies: string[] = [];
  for (const [pageId, page] of [...input.pages.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
    // Byte-for-byte the reconstruction's own formatting (compact + newline),
    // so a rendered copy can be diffed against the source app directly.
    const body = JSON.stringify(page);
    pageBodies.push(body);
    await writeFile(
      path.join(outDir, TEMPLATE_DIR, TEMPLATE_PAGES_DIR, `${pageId}.json`),
      `${body}\n`,
      "utf8",
    );
  }

  const slotsBody = stableStringify(slots);
  const bindingsBody = stableStringify(bindings);
  const groupsBody = stableStringify(groups);
  const repeatersBody = stableStringify(repeaters);
  const themeBody = stableStringify([]);
  await writeFile(path.join(outDir, SLOTS_FILE), slotsBody, "utf8");
  await writeFile(path.join(outDir, BINDINGS_FILE), bindingsBody, "utf8");
  await writeFile(path.join(outDir, GROUPS_FILE), groupsBody, "utf8");
  await writeFile(path.join(outDir, REPEATERS_FILE), repeatersBody, "utf8");
  await writeFile(path.join(outDir, THEME_FILE), themeBody, "utf8");

  const templateVersion = templateVersionOf([
    slotsBody,
    bindingsBody,
    groupsBody,
    repeatersBody,
    themeBody,
    routeMapBody,
    ...pageBodies,
  ]);

  const contentPack: ContentPack = {
    schemaVersion: SLOTIZED_TEMPLATE_SCHEMA_VERSION,
    schemaName: CONTENT_PACK_SCHEMA,
    templateId,
    templateVersion,
    label: "default (original reconstruction content)",
    // `repeater-item` field slots are NOT listed here: their values live per
    // item under `repeaters`, and two sources of truth for one field would be
    // a silent conflict.
    slots: Object.fromEntries(
      slots.filter((s) => s.scope !== "repeater-item").map((s) => [s.id, s.defaultValue]),
    ),
    repeaters: defaultRepeaterItems,
  };
  const themePack: ThemePack = {
    schemaVersion: SLOTIZED_TEMPLATE_SCHEMA_VERSION,
    schemaName: THEME_PACK_SCHEMA,
    templateId,
    templateVersion,
    label: "default (original reconstruction theme)",
    tokens: {},
  };
  await writeFile(
    path.join(outDir, CONTENT_PACKS_DIR, DEFAULT_PACK_FILE),
    stableStringify(contentPack),
    "utf8",
  );
  await writeFile(path.join(outDir, THEME_PACKS_DIR, DEFAULT_PACK_FILE), stableStringify(themePack), "utf8");

  await writeFile(
    path.join(outDir, AUTHORING_FILE),
    stableStringify(
      buildAuthoring({
        templateId,
        templateVersion,
        slots,
        groups,
        repeaters,
        bindingsBySlot,
        routeMap: input.routeMap,
      }),
    ),
    "utf8",
  );
  await writeFile(path.join(outDir, COVERAGE_FILE), stableStringify(coverage), "utf8");
  await writeFile(
    path.join(outDir, TEMPLATE_DIR, TEMPLATE_SOURCE_FILE),
    stableStringify({
      reconstructionAppDir: input.appDir,
      generatedStylesRelPath: input.stylesheetRelPath,
      siteSpecDir: input.siteSpecDir,
      reconTemplateDir: input.reconTemplateDir,
      pageFiles: Object.fromEntries(input.pageFiles),
    }),
    "utf8",
  );

  const byType: Record<string, number> = {};
  const byScope: Record<string, number> = {};
  const byTarget: Record<string, number> = {};
  for (const slot of slots) {
    byType[`slots.${slot.type}`] = (byType[`slots.${slot.type}`] ?? 0) + 1;
    byScope[`scope.${slot.scope}`] = (byScope[`scope.${slot.scope}`] ?? 0) + 1;
  }
  for (const binding of bindings) {
    byTarget[`bindings.${binding.target}`] = (byTarget[`bindings.${binding.target}`] ?? 0) + 1;
    byTarget[`surface.${binding.address.surface}`] = (byTarget[`surface.${binding.address.surface}`] ?? 0) + 1;
  }

  const manifest: SlotizedManifest = {
    schemaVersion: SLOTIZED_TEMPLATE_SCHEMA_VERSION,
    schemaName: SLOTIZED_TEMPLATE_SCHEMA_NAME,
    engine: SLOTIZED_ENGINE,
    templateId,
    templateVersion,
    runId,
    createdAt: createdAtFromRunId(runId),
    source: {
      host: input.host,
      rootUrl: input.rootUrl,
      reconTemplateDir: input.reconTemplateDir,
      reconTemplateRunId: input.reconTemplateRunId,
      reconstructionAppDir: input.appDir,
      reconstructionRunId: input.reconstructionRunId,
      siteSpecDir: input.siteSpecDir,
      generatedStylesRelPath: input.stylesheetRelPath,
      breakpoint: input.breakpoint,
    },
    counts: {
      pages: input.pages.size,
      routes: input.routeMap.routes.length,
      slots: slots.length,
      bindings: bindings.length,
      groups: groups.length,
      themeTokens: 0,
      ...detected.counts,
      slotsFromSlotV2: slots.filter((s) => s.provenance?.source === "slot-v2").length,
      slotsFromSurfaceScan: slots.filter((s) => s.provenance?.source === "surface-scan").length,
      globalsMerged: globalMerge.mergedGlobals,
      globalsMergedFromSlots: globalMerge.mergedFromSlots,
      likelyGlobal: globalMerge.likelyGlobal.length,
      newSurfaceSlotsVariantMerged: mergedNewSurfaceSlots,
      newSurfaceSlotsVariantSeparate: separateNewSurfaceSlots,
      ...byType,
      ...byScope,
      ...byTarget,
    },
    limitations,
  };
  await writeFile(path.join(outDir, MANIFEST_FILE), stableStringify(manifest), "utf8");
  // Theme tokens are extracted from the run dir just written (manifest +
  // template/source.json + pages); the manifest is then rewritten with the
  // token count. The default theme pack must compile to zero bytes — that is
  // the neutrality proof, and a violation is a compiler bug, not a warning.
  const theme = await extractAndWriteTheme(outDir);
  if (theme.defaultCssBytes !== 0) {
    throw new Error(`default theme pack is not neutral: ${theme.defaultCssBytes} bytes of overlay css`);
  }
  manifest.counts.themeTokens = theme.tokens.length;
  await writeFile(path.join(outDir, MANIFEST_FILE), stableStringify(manifest), "utf8");
  return { outDir, manifest };
}
