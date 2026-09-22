import { cp, mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import {
  ROUTE_MAP_FILE,
  RUNTIME_DATA_DIR,
  type RuntimePage,
  type RuntimeRouteMap,
} from "../reconstruction/index.js";
import { applyPageBindings, hideNodes, indexElements, projectValue, type ApplyOp } from "./apply.js";
import { firstUrl, replaceFirstUrl } from "./css.js";
import { applyRepeaters as defaultApplyRepeaters, collectDomIds } from "./repeaters-apply.js";
import {
  applyIdentityLocaleToPage,
  applyIdentityToAppShell,
  applyIdentityToRouteMap,
  loadSiteIdentity,
  provenanceOf,
  type IdentitySurfaceResult,
  type SiteIdentity,
} from "./site-identity.js";
import { createdAtFromRunId, newSlotizedRunId, slotizedRenderRunDir } from "./store.js";
import { compileThemeCss } from "./theme-css.js";
import { loadThemeTokens } from "./theme-pack.js";
import {
  ContentPackSchema,
  HIDDEN_CSS_RULE,
  MANIFEST_FILE,
  OVERRIDE_HEADER,
  RENDER_REPORT_FILE,
  SLOTIZED_RENDER_REPORT_SCHEMA,
  SLOTIZED_TEMPLATE_SCHEMA_VERSION,
  SlotizedRenderError,
  TEMPLATE_DIR,
  TEMPLATE_PAGES_DIR,
  TEMPLATE_ROUTE_MAP_FILE,
  TEMPLATE_SOURCE_FILE,
  ThemePackSchema,
  type Binding,
  type ContentPack,
  type GroupDefinition,
  type RenderReport,
  type RenderWarning,
  type RepeaterDefinition,
  type RepeaterRenderEntry,
  type SlotDefinition,
  type SlotValue,
  type SlotizedManifest,
  type ThemePack,
  type Variant,
} from "./types.js";

/**
 * The renderer: TEMPLATE + VALUES → a runnable Next app.
 *
 * It never touches layout. Values are written into the existing reconstructed
 * nodes (guarded), page titles into the route map, and background media into
 * ONE appended CSS override block — the original stylesheet is copied
 * unmodified and the overrides come after it, so the cascade does the work and
 * nothing has to be rewritten in place.
 *
 * The default content pack must round-trip to the accepted reconstruction:
 * `--assert-neutral` proves it by diffing the rewritten page trees against the
 * pristine template copies. If that ever fails, the template is lying about
 * what it can reproduce, and no other result from this module is trustworthy.
 */

/** What a repeater hook reports back so the renderer can account for it. */
export interface RepeaterHookResult {
  entries?: RepeaterRenderEntry[];
  warnings?: RenderWarning[];
  /**
   * Node ids (per variant) the repeater now OWNS. Page-slot bindings inside a
   * driven repeater are skipped: after cloning those ids are no longer unique,
   * and the item values are the authority.
   */
  superseded?: Map<Variant, Set<string>>;
}

/** Phase C hook: clone repeater items into the tree BEFORE slot bindings run. */
export type RepeaterHook = (context: {
  pageId: string;
  page: RuntimePage;
  repeaters: readonly RepeaterDefinition[];
  bindings: readonly Binding[];
  contentPack: ContentPack;
}) => void | RepeaterHookResult | Promise<void | RepeaterHookResult>;

export interface RenderOptions {
  templateManifestFile: string;
  contentPackFile: string;
  themePackFile?: string;
  /**
   * Task 29.1. A SiteIdentity JSON: who the RENDERED site is. Applied only to
   * site-level app-shell surfaces (route-map URLs, package name, generated
   * config, `<html lang>`, metadata fallback) — never to slot-owned page copy.
   * Omitted = the Task 29 behavior, byte for byte.
   */
  siteIdentityFile?: string;
  outDir?: string;
  runId?: string;
  assertNeutral?: boolean;
  /**
   * Phase C. Called once per page, before any slot binding is applied.
   * Defaults to the built-in engine; pass `null` to render with repeaters off.
   */
  applyRepeaters?: RepeaterHook | null;
  /** Phase D. Appended after the slot overrides, inside the same block. */
  extraCss?: string;
  /**
   * Task 29 E1. Drop a node's `srcSet` when its `src` was REPLACED and no
   * binding owns that srcSet. Default on; it is a no-op for the default pack
   * (nothing replaces a src there), so neutrality is unaffected.
   */
  stripSourceEmbeds?: boolean;
  log?: (message: string) => void;
}

interface LoadedTemplate {
  dir: string;
  manifest: SlotizedManifest;
  slots: SlotDefinition[];
  bindings: Binding[];
  groups: GroupDefinition[];
  repeaters: RepeaterDefinition[];
  routeMap: RuntimeRouteMap;
  source: {
    reconstructionAppDir: string;
    generatedStylesRelPath: string;
    siteSpecDir: string;
    reconTemplateDir: string;
    pageFiles: Record<string, string>;
  };
}

async function readJson<T>(file: string, label: string): Promise<T> {
  try {
    return JSON.parse(await readFile(file, "utf8")) as T;
  } catch (error) {
    throw new SlotizedRenderError(`${label} could not be read: ${file} (${(error as Error).message})`);
  }
}

export async function loadTemplate(manifestFile: string): Promise<LoadedTemplate> {
  const dir = path.dirname(path.resolve(manifestFile));
  const manifest = await readJson<SlotizedManifest>(manifestFile, "slotized template manifest");
  if (manifest.schemaName !== "slotized-template-v1") {
    throw new SlotizedRenderError(`not a slotized template manifest: ${manifestFile}`);
  }
  return {
    dir,
    manifest,
    slots: await readJson(path.join(dir, "slots.json"), "slots"),
    bindings: await readJson(path.join(dir, "bindings.json"), "bindings"),
    groups: await readJson(path.join(dir, "groups.json"), "groups"),
    repeaters: await readJson(path.join(dir, "repeaters.json"), "repeaters"),
    routeMap: await readJson(path.join(dir, TEMPLATE_DIR, TEMPLATE_ROUTE_MAP_FILE), "template route map"),
    source: await readJson(path.join(dir, TEMPLATE_DIR, TEMPLATE_SOURCE_FILE), "template source"),
  };
}

/** Structural check that a value can stand in for this slot's type. */
function typeMatches(type: SlotDefinition["type"], value: SlotValue): boolean {
  switch (type) {
    case "image":
    case "video":
      return typeof value === "object" && value !== null && "src" in (value as Record<string, unknown>);
    case "number":
      return typeof value === "number" || value === null;
    case "boolean":
      return typeof value === "boolean" || value === null;
    case "structured":
      return typeof value === "object" && value !== null;
    default:
      return typeof value === "string" || value === null;
  }
}

function isEmptyValue(value: SlotValue): boolean {
  if (value === null) return true;
  if (typeof value === "string") return value.trim() === "";
  if (typeof value === "object" && "src" in (value as Record<string, unknown>)) {
    const src = (value as { src: string | null }).src;
    return src === null || src.trim() === "";
  }
  return false;
}

/**
 * A STALE `srcSet` OUTRANKS A REPLACED `src` (Task 29 E1, measured).
 *
 * channel.io ships 32 (page, variant, node) `<img>` whose `src` is slot-bound
 * but whose `srcSet` is not: swapping the content pack replaced the src and the
 * browser still fetched the SOURCE asset from the responsive candidate list —
 * a source image painted on a page that claims to be a different company. The
 * honest fix is a srcset binding at compile time; until the template is
 * recompiled, dropping the unowned attribute is the only way the rendered site
 * matches its own content pack. Nothing is dropped when the src did not change,
 * so the default pack still round-trips byte for byte.
 */
function stripStaleSrcsets(
  page: RuntimePage,
  replaced: ReadonlyMap<Variant, Set<string>>,
  isBound: (variant: Variant, nodeId: string) => boolean,
): number {
  let stripped = 0;
  for (const variant of ["desktop", "mobile"] as Variant[]) {
    const targets = replaced.get(variant);
    if (targets === undefined || targets.size === 0) continue;
    for (const [nodeId, node] of indexElements((variant === "desktop" ? page.desktop : page.mobile).doc)) {
      const props = node.p as Record<string, unknown> | undefined;
      if (props === undefined || !targets.has(nodeId) || isBound(variant, nodeId)) continue;
      for (const attribute of ["srcSet", "srcset"]) {
        if (typeof props[attribute] !== "string") continue;
        delete props[attribute];
        stripped++;
      }
    }
  }
  return stripped;
}

export async function renderTemplate(options: RenderOptions): Promise<RenderReport> {
  const log = options.log ?? (() => {});
  const template = await loadTemplate(options.templateManifestFile);
  const warnings: RenderWarning[] = [];

  // --- content pack validation ----------------------------------------------
  const packRaw = await readJson<unknown>(options.contentPackFile, "content pack");
  const parsed = ContentPackSchema.safeParse(packRaw);
  if (!parsed.success) {
    throw new SlotizedRenderError(`content pack failed validation: ${options.contentPackFile}\n${parsed.error.message}`);
  }
  const pack = parsed.data;
  if (pack.templateId !== template.manifest.templateId) {
    throw new SlotizedRenderError(
      `content pack targets template ${pack.templateId}, this template is ${template.manifest.templateId}`,
    );
  }
  if (pack.templateVersion !== template.manifest.templateVersion) {
    warnings.push({
      code: "TYPE_MISMATCH",
      message: `content pack was built for templateVersion ${pack.templateVersion.slice(0, 12)}…, template is ${template.manifest.templateVersion.slice(0, 12)}…`,
    });
  }

  let themePack: ThemePack | undefined;
  if (options.themePackFile) {
    const themeParsed = ThemePackSchema.safeParse(await readJson<unknown>(options.themePackFile, "theme pack"));
    if (!themeParsed.success) {
      throw new SlotizedRenderError(`theme pack failed validation: ${options.themePackFile}`);
    }
    themePack = themeParsed.data;
  }
  const siteIdentity: SiteIdentity | undefined =
    options.siteIdentityFile === undefined ? undefined : await loadSiteIdentity(options.siteIdentityFile);
  const provenance = provenanceOf(template.manifest);
  // A plain token pack (no pre-compiled `extraCss`) is compiled here against
  // this template's theme.json, so operators never need the --compile step.
  let themeCss = "";
  if (themePack && themePack.extraCss === undefined && Object.keys(themePack.tokens).length > 0) {
    const compiled = compileThemeCss(await loadThemeTokens(template.dir), themePack);
    if (compiled.errors.length > 0) {
      throw new SlotizedRenderError(`theme pack is not applicable:\n  ${compiled.errors.join("\n  ")}`);
    }
    themeCss = compiled.css;
    for (const message of compiled.warnings) {
      warnings.push({ code: "THEME_GUARDED_TOKEN", message });
    }
  }

  const slotById = new Map(template.slots.map((s) => [s.id, s] as const));
  const errors: string[] = [];
  for (const slotId of Object.keys(pack.slots)) {
    if (!slotById.has(slotId)) errors.push(`unknown slot id in content pack: ${slotId}`);
  }
  const values = new Map<string, SlotValue>();
  for (const slot of template.slots) {
    const provided = Object.prototype.hasOwnProperty.call(pack.slots, slot.id)
      ? pack.slots[slot.id]
      : undefined;
    if (provided === undefined) {
      values.set(slot.id, slot.defaultValue);
      continue;
    }
    if (!typeMatches(slot.type, provided)) {
      errors.push(`slot ${slot.key} (${slot.type}) got an incompatible value`);
      values.set(slot.id, slot.defaultValue);
      continue;
    }
    values.set(slot.id, provided);
  }
  if (errors.length > 0) {
    throw new SlotizedRenderError(`content pack is not applicable:\n  ${errors.join("\n  ")}`);
  }

  // --- output directory ------------------------------------------------------
  const runId = options.runId ?? newSlotizedRunId();
  const outDir = path.resolve(
    options.outDir ?? slotizedRenderRunDir(template.manifest.source.host, runId),
  );
  await mkdir(outDir, { recursive: true });
  log(`[render] copying app shell from ${template.source.reconstructionAppDir}`);
  await cp(path.resolve(template.source.reconstructionAppDir), outDir, {
    recursive: true,
    filter: (src) => {
      const base = path.basename(src);
      return base !== ".next" && base !== "node_modules";
    },
  });

  // --- bindings by page ------------------------------------------------------
  const domBindings = new Map<string, Binding[]>();
  const cssBindings: Binding[] = [];
  const metaBindings: Binding[] = [];
  const srcsetBound = new Set<string>();
  for (const binding of template.bindings) {
    // repeater-field bindings carry a RELATIVE item path, not a node id; they
    // are applied per rendered item by the repeater engine, never here.
    if (binding.address.surface === "repeater-field") continue;
    if (binding.property === "srcSet" || binding.property === "srcset") {
      srcsetBound.add(`${binding.pageId}|${binding.variant ?? ""}|${binding.nodeId ?? ""}`);
    }
    if (binding.address.surface === "route-map") metaBindings.push(binding);
    else if (binding.address.surface === "css-rule") cssBindings.push(binding);
    else {
      const list = domBindings.get(binding.pageId) ?? [];
      list.push(binding);
      domBindings.set(binding.pageId, list);
    }
  }

  const groupById = new Map(template.groups.map((g) => [g.id, g] as const));
  const groupBySlot = new Map<string, GroupDefinition>();
  for (const group of template.groups) for (const id of group.slotIds) groupBySlot.set(id, group);

  let applied = 0;
  let skipped = 0;
  const failed: Array<{ bindingId: string; reason: string }> = [];
  const neutralityDiffs: string[] = [];
  let pagesWritten = 0;
  let hiddenNodes = 0;
  let supersededBindings = 0;
  let strippedSrcsets = 0;
  let identityLocaleNodes = 0;
  const repeaterEntries: RepeaterRenderEntry[] = [];
  const duplicateSamples: string[] = [];
  let baselineDuplicates = 0;
  let introducedDuplicates = 0;
  const repeaterHook: RepeaterHook | undefined =
    options.applyRepeaters === null ? undefined : (options.applyRepeaters ?? defaultApplyRepeaters);

  for (const [pageId, pageFile] of Object.entries(template.source.pageFiles).sort()) {
    const page = await readJson<RuntimePage>(
      path.join(template.dir, TEMPLATE_DIR, TEMPLATE_PAGES_DIR, `${pageId}.json`),
      `template page ${pageId}`,
    );
    const before = JSON.stringify(page);
    const idsBefore = collectDomIds(page);

    // Repeater cloning happens on the pristine tree, BEFORE any value is
    // written, so cloned items are bound exactly like the originals.
    const superseded = new Map<Variant, Set<string>>();
    if (repeaterHook) {
      const hookResult = await repeaterHook({
        pageId,
        page,
        repeaters: template.repeaters.filter((r) => r.pageId === undefined || r.pageId === pageId),
        bindings: template.bindings,
        contentPack: pack,
      });
      if (hookResult) {
        repeaterEntries.push(...(hookResult.entries ?? []));
        warnings.push(...(hookResult.warnings ?? []));
        for (const [variant, nodeIds] of hookResult.superseded ?? []) superseded.set(variant, nodeIds);
      }
    }

    const hide = new Map<Variant, Set<string>>([
      ["desktop", new Set<string>()],
      ["mobile", new Set<string>()],
    ]);
    const srcReplaced = new Map<Variant, Set<string>>([
      ["desktop", new Set<string>()],
      ["mobile", new Set<string>()],
    ]);
    const ops: ApplyOp[] = [];
    for (const binding of domBindings.get(pageId) ?? []) {
      if (
        binding.nodeId !== undefined &&
        binding.variant !== undefined &&
        superseded.get(binding.variant)?.has(binding.nodeId) === true
      ) {
        supersededBindings++;
        skipped++;
        continue;
      }
      const slot = slotById.get(binding.slotId);
      if (!slot) {
        failed.push({ bindingId: binding.id, reason: "unknown slot" });
        continue;
      }
      const value = values.get(slot.id)!;
      const onEmpty = slot.behavior?.onEmpty ?? "keep";
      if (isEmptyValue(value) && onEmpty !== "keep") {
        if (onEmpty === "hide-node" && binding.nodeId && binding.variant) {
          hide.get(binding.variant)!.add(binding.nodeId);
          skipped++;
          continue;
        }
        if (onEmpty === "hide-group") {
          const group = slot.behavior?.hideGroupId
            ? groupById.get(slot.behavior.hideGroupId)
            : groupBySlot.get(slot.id);
          if (group?.rootNodeId) {
            hide.get("desktop")!.add(group.rootNodeId);
            hide.get("mobile")!.add(group.rootNodeId);
          }
          skipped++;
          continue;
        }
      }
      const projected = projectValue(value, slot.defaultValue, binding.field);
      if (projected.remove && binding.field === "src") {
        warnings.push({
          code: "MEDIA_SRC_EMPTY",
          slotId: slot.id,
          bindingId: binding.id,
          message: `${slot.key}: media src is empty — the attribute is dropped and the node kept`,
        });
      }
      if (
        slot.fitHints?.recommendedMaxChars !== undefined &&
        typeof value === "string" &&
        [...value].length > slot.fitHints.recommendedMaxChars * 1.5
      ) {
        warnings.push({
          code: "CONTENT_FIT_WARNING",
          slotId: slot.id,
          bindingId: binding.id,
          message: `${slot.key}: ${[...value].length} chars vs recommended ${slot.fitHints.recommendedMaxChars}`,
        });
      }
      if (
        binding.field === "src" &&
        binding.nodeId !== undefined &&
        binding.variant !== undefined &&
        projected.value !== undefined &&
        projected.value !== binding.expectedValue
      ) {
        srcReplaced.get(binding.variant)!.add(binding.nodeId);
      }
      ops.push({ binding, value: projected.value, remove: projected.remove });
    }

    const result = applyPageBindings(page, ops);
    applied += result.applied;
    skipped += result.skipped;
    failed.push(...result.failed);
    hiddenNodes += hideNodes(page, hide);
    if (options.stripSourceEmbeds !== false) {
      const stripped = stripStaleSrcsets(page, srcReplaced, (variant, nodeId) =>
        srcsetBound.has(`${pageId}|${variant}|${nodeId}`),
      );
      if (stripped > 0) {
        strippedSrcsets += stripped;
        warnings.push({
          code: "STALE_SRCSET_STRIPPED",
          message: `${pageId}: ${stripped} stale srcSet(s) dropped — their src was replaced and no binding owns the srcSet`,
        });
      }
    }

    const idsAfter = collectDomIds(page);
    for (const count of idsBefore.values()) if (count > 1) baselineDuplicates++;
    for (const [id, count] of idsAfter) {
      if (count <= 1) continue;
      const wasDuplicate = (idsBefore.get(id) ?? 0) > 1;
      if (wasDuplicate) continue;
      introducedDuplicates++;
      if (duplicateSamples.length < 10) duplicateSamples.push(`${pageId}: #${id} ×${count}`);
      warnings.push({
        code: "DUPLICATE_ID",
        message: `${pageId}: DOM id "${id}" appears ${count}× after rendering (was unique) — cloning did not namespace it`,
      });
    }

    let after = JSON.stringify(page);
    if (options.assertNeutral && before !== after) neutralityDiffs.push(`page ${pageId} tree changed`);
    // Identity is applied AFTER the neutrality comparison: it is a declared
    // site-level change, not content drift.
    if (siteIdentity !== undefined && applyIdentityLocaleToPage(page, siteIdentity) > 0) {
      identityLocaleNodes++;
      after = JSON.stringify(page);
    }
    await mkdir(path.dirname(path.join(outDir, RUNTIME_DATA_DIR, pageFile)), { recursive: true });
    await writeFile(path.join(outDir, RUNTIME_DATA_DIR, pageFile), `${after}\n`, "utf8");
    pagesWritten++;
  }

  if (supersededBindings > 0) {
    warnings.push({
      code: "REPEATER_SUPERSEDED_BINDINGS",
      message: `${supersededBindings} page-slot binding(s) inside driven repeaters were not applied — the repeater items own those nodes`,
    });
  }

  // --- route map metadata ----------------------------------------------------
  const routeMap: RuntimeRouteMap = JSON.parse(JSON.stringify(template.routeMap)) as RuntimeRouteMap;
  const routeMapBefore = JSON.stringify(routeMap);
  for (const binding of metaBindings) {
    const slot = slotById.get(binding.slotId);
    if (!slot) continue;
    const value = values.get(slot.id)!;
    const route = routeMap.routes.find((r) => r.routeId === binding.address.routeId);
    if (!route) {
      failed.push({ bindingId: binding.id, reason: "route not found" });
      continue;
    }
    if (binding.expectedValue !== undefined && route.title !== binding.expectedValue) {
      failed.push({ bindingId: binding.id, reason: "guard mismatch" });
      continue;
    }
    if (typeof value === "string") route.title = value;
    applied++;
  }
  let routeMapAfter = JSON.stringify(routeMap);
  if (options.assertNeutral && routeMapBefore !== routeMapAfter) neutralityDiffs.push("route map changed");
  const identitySurfaces: IdentitySurfaceResult[] = [];
  if (siteIdentity !== undefined) {
    const rebased = applyIdentityToRouteMap(routeMap, siteIdentity);
    routeMapAfter = JSON.stringify(routeMap);
    identitySurfaces.push({
      surface: "route-map-urls",
      file: `${RUNTIME_DATA_DIR}/${ROUTE_MAP_FILE}`,
      status: rebased.changed > 0 ? "rewritten" : "unchanged",
      detail: `${rebased.changed} url(s) → ${rebased.relative ? "root-relative" : siteIdentity.publicOrigin}`,
    });
    if (rebased.relative) {
      warnings.push({
        code: "SITE_IDENTITY_ORIGIN_MISSING",
        message: "site identity has no publicOrigin — route-map URLs are root-relative (no origin invented)",
      });
    }
  }
  await writeFile(path.join(outDir, RUNTIME_DATA_DIR, ROUTE_MAP_FILE), `${routeMapAfter}\n`, "utf8");

  // --- CSS overrides ---------------------------------------------------------
  const overrideBySelector = new Map<string, string>();
  for (const binding of cssBindings) {
    const slot = slotById.get(binding.slotId);
    const selector = binding.address.cssSelector;
    if (!slot || selector === undefined || binding.expectedValue === undefined) continue;
    const value = values.get(slot.id)!;
    const src = typeof value === "object" && value !== null ? (value as { src: string | null }).src : null;
    if (src === null || src === "") {
      if ((slot.behavior?.onEmpty ?? "keep") !== "keep") {
        overrideBySelector.set(`${binding.address.mediaCondition ?? ""}|${selector}`, "none");
      }
      skipped++;
      continue;
    }
    if (src === firstUrl(binding.expectedValue)) continue; // unchanged → no override
    overrideBySelector.set(
      `${binding.address.mediaCondition ?? ""}|${selector}`,
      replaceFirstUrl(binding.expectedValue, src),
    );
    applied++;
  }

  const overrideRules: string[] = [];
  for (const [key, value] of [...overrideBySelector.entries()].sort()) {
    const [media, selector] = key.split("|");
    const rule = `${selector}{background-image:${value}}`;
    overrideRules.push(media ? `${media}{${rule}}` : rule);
  }
  const extra = [
    ...overrideRules,
    ...(hiddenNodes > 0 ? [HIDDEN_CSS_RULE] : []),
    ...(themePack?.extraCss ? [themePack.extraCss] : []),
    ...(themeCss ? [themeCss] : []),
    ...(options.extraCss ? [options.extraCss] : []),
  ];
  if (extra.length > 0) {
    const stylesFile = path.join(outDir, template.source.generatedStylesRelPath);
    const original = await readFile(stylesFile, "utf8");
    await writeFile(stylesFile, `${original}${OVERRIDE_HEADER}${extra.join("\n")}\n`, "utf8");
    if (options.assertNeutral) neutralityDiffs.push(`${overrideRules.length} css override(s) emitted`);
  }

  // --- site identity: app-shell surfaces -------------------------------------
  if (siteIdentity !== undefined) {
    identitySurfaces.push({
      surface: "document-locale",
      file: `${RUNTIME_DATA_DIR}/pages/*.json`,
      status: identityLocaleNodes > 0 ? "rewritten" : "unchanged",
      detail: `observed <html lang> → ${siteIdentity.locale} on ${identityLocaleNodes} page(s)`,
    });
    identitySurfaces.push(...(await applyIdentityToAppShell(outDir, siteIdentity, warnings)));
  }

  const report: RenderReport = {
    schemaVersion: SLOTIZED_TEMPLATE_SCHEMA_VERSION,
    schemaName: SLOTIZED_RENDER_REPORT_SCHEMA,
    templateId: template.manifest.templateId,
    templateVersion: template.manifest.templateVersion,
    contentPackTemplateVersion: pack.templateVersion,
    ...(options.themePackFile === undefined ? {} : { themePack: options.themePackFile }),
    provenance,
    ...(siteIdentity === undefined ? {} : { siteIdentity, identitySurfaces }),
    runId,
    createdAt: createdAtFromRunId(runId),
    outDir,
    applied,
    skipped,
    failed,
    warnings,
    overrides: overrideRules.length,
    routes: routeMap.routes.length,
    pages: pagesWritten,
    repeaters: repeaterEntries,
    duplicateIds: {
      baseline: baselineDuplicates,
      introduced: introducedDuplicates,
      samples: duplicateSamples,
    },
    neutralityChecked: options.assertNeutral === true,
    ...(options.assertNeutral === true
      ? { neutral: neutralityDiffs.length === 0, neutralityDiffs }
      : {}),
  };
  await writeFile(path.join(outDir, RENDER_REPORT_FILE), `${JSON.stringify(report, null, 2)}\n`, "utf8");
  await writeFile(
    path.join(outDir, MANIFEST_FILE),
    `${JSON.stringify(
      {
        schemaVersion: SLOTIZED_TEMPLATE_SCHEMA_VERSION,
        schemaName: "slotized-render-v1",
        runId,
        createdAt: createdAtFromRunId(runId),
        templateId: template.manifest.templateId,
        templateVersion: template.manifest.templateVersion,
        templateDir: template.dir,
        contentPack: path.resolve(options.contentPackFile),
        ...(options.themePackFile === undefined
          ? {}
          : { themePack: path.resolve(options.themePackFile) }),
        // PROVENANCE (where the template came from) and SITE IDENTITY (who this
        // render is) are deliberately separate and are expected to differ.
        provenance,
        ...(siteIdentity === undefined
          ? {}
          : { siteIdentity, siteIdentityFile: path.resolve(options.siteIdentityFile!) }),
        applied,
        overrides: overrideRules.length,
        failed: failed.length,
        repeatersRendered: repeaterEntries.length,
        supersededBindings,
      },
      null,
      2,
    )}\n`,
    "utf8",
  );
  return report;
}
