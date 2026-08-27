import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { siteSlug } from "../reconstruction/index.js";
import {
  DEFAULT_CONTENT_FILE,
  RECON_TEMPLATE_SCHEMA_VERSION,
  REPORT_DIR,
  SITE_MAP_FILE,
  SLOTS_FILE,
  SLOT_BINDINGS_FILE,
  SLOT_OVERRIDES_EXAMPLE_FILE,
  SLOT_SCHEMA_VERSION,
  SLOT_SUMMARY_FILE,
  TEMPLATE_APP_DIR,
  TEMPLATE_COMPILER_VERSION,
  TEMPLATE_ENGINE,
  TEMPLATE_MANIFEST_FILE,
  type TemplateManifest,
} from "./types.js";
import { loadTemplateInput, type LoadTemplateInputOptions, type TemplateInput } from "./load-input.js";
import {
  loadRouteScopePolicy,
  resolveRoutePolicy,
  routePolicyLimitations,
  selectSlotizedPages,
  type ResolvedRoutePolicy,
} from "./route-policy.js";
import { portablePath } from "../reconstruction-qa/store.js";
import { extractAllPages } from "./extract.js";
import { compareLogicalSlots, groupOccurrences, sortBindings } from "./grouping.js";
import { coBindPaintTwins, type TwinCoBindingStats } from "./twin-binding.js";
import { assembleArtifacts, assignKeys, type KeyedSlot } from "./assemble.js";
import { applyOverrides, loadOverrides } from "./overrides.js";
import { buildConstraintContext } from "./constraints.js";
import { buildSiteMap } from "./site-map.js";
import { buildSlotSummary, type SlotSummary } from "./report.js";
import { generateTemplateApp } from "./generate-template-app.js";
import { validateTemplateArtifact, type TemplateValidation } from "./validate-output.js";
import { createdAtFromRunId, reconTemplateRunDir } from "./store.js";

/**
 * The Recon Template compiler — orchestration only.
 *
 * SiteSpec + Exact Reconstruction
 *       ↓ extract          (every user-visible text / URL / image occurrence)
 *       ↓ group            (exact-equality merging, conservative global scope)
 *       ↓ keys             (deterministic site-specific keys)
 *       ↓ manual overrides (exclude / merge / rename / role / scope / …)
 *       ↓ assemble         (ids, bindings, default content, constraints)
 *       ↓ emit             (artifact files + the template app)
 *       ↓ validate         (every binding resolves; defaults are a no-op)
 *
 * Offline and deterministic: 0 Firecrawl, 0 Playwright, 0 network, 0 AI. Same
 * inputs + same overrides + same run id → byte-identical output.
 */

export interface CompileReconTemplateOptions extends LoadTemplateInputOptions {
  runId: string;
  /** Defaults to `data/<host>/recon-templates/<runId>`. */
  outputDir?: string;
  slotOverridesFile?: string;
  /**
   * Route scope policy (`route-policy.ts`). Without one every route compiles
   * at `core-reconstruct` — byte-for-byte the pre-Task-27 behavior.
   */
  routePolicyFile?: string;
}

export interface CompiledReconTemplate {
  runDir: string;
  manifest: TemplateManifest;
  summary: SlotSummary;
  validation: TemplateValidation;
  input: TemplateInput;
  twinStats: TwinCoBindingStats;
  routePolicy: ResolvedRoutePolicy;
}

const OVERRIDES_EXAMPLE = {
  $doc:
    "Manual slot overrides. Pass to the compiler with --slot-overrides <path>. " +
    "Keys address slots by the AUTOMATIC key printed in slots.json of an override-free compile. " +
    "Supported operations: exclude, merge, rename, role, scope, label, editability. " +
    "This example file is a documented no-op: every list is empty.",
  schemaVersion: 1,
  exclude: [],
  merge: [],
  rename: [],
  role: [],
  scope: [],
  label: [],
  editability: [],
};

export async function compileReconTemplate(
  options: CompileReconTemplateOptions,
): Promise<CompiledReconTemplate> {
  const input = await loadTemplateInput(options);

  // 0. route scope policy — WHICH ROUTES GET A SLOT SURFACE.
  // The only place route scope acts. It narrows the extractor's page set and
  // nothing else: the template app below is still the exact app copied byte
  // for byte (same route map, same runtime page data), so a `structure-only`
  // route keeps its structure, its site-map evidence and its rendering, and
  // contributes zero slots.
  // The policy file is READ at the caller's spelling and RECORDED repo-relative:
  // site-map.json feeds a release lineage hash, so two compiles that differ only
  // in `./p.json` vs `/Users/…/p.json` must not read as a lineage difference.
  const policyFile = options.routePolicyFile;
  const routePolicy = resolveRoutePolicy(
    input.routeMap,
    input.siteSpec,
    policyFile ? await loadRouteScopePolicy(policyFile) : undefined,
    policyFile !== undefined ? portablePath(policyFile) : undefined,
  );
  const slotizedPages = selectSlotizedPages(input.pagesById, routePolicy);

  // 1–3. extract → group → paint-twin co-binding → keys
  const extraction = extractAllPages(slotizedPages);
  const grouping = groupOccurrences(extraction, input.routeMap);
  const constraintCtx = buildConstraintContext(input.siteSpec);
  const twinStats: TwinCoBindingStats = coBindPaintTwins(grouping.slots, extraction, constraintCtx);
  for (const slot of grouping.slots) slot.bindings = sortBindings(slot.bindings);
  let keyedSlots: KeyedSlot[] = assignKeys(grouping);

  // 4. manual overrides
  let overridesApplied = 0;
  let excludedByOverride = 0;
  if (options.slotOverridesFile) {
    const overrides = await loadOverrides(options.slotOverridesFile);
    const applied = applyOverrides(keyedSlots, overrides);
    keyedSlots = applied.slots.sort(compareLogicalSlots);
    overridesApplied = applied.operationsApplied;
    excludedByOverride = applied.excludedByOverride;
  }

  // 5. assemble
  const host = siteSlug(input.routeMap.rootUrl);
  const templateId = `${host}-${options.runId}`;
  const artifacts = assembleArtifacts(keyedSlots, templateId, constraintCtx);

  // 6. site map + report + manifest
  const siteMap = buildSiteMap(input.routeMap, input.siteSpec, artifacts.slots, routePolicy);
  const excludedTotal = [...extraction.excluded.values()].reduce((a, b) => a + b, 0);
  const summary = buildSlotSummary(artifacts.slots, artifacts.bindings, extraction.excluded);

  const manifest: TemplateManifest = {
    schemaVersion: RECON_TEMPLATE_SCHEMA_VERSION,
    schemaName: "recon-template-v1",
    slotSchemaVersion: SLOT_SCHEMA_VERSION,
    compilerVersion: TEMPLATE_COMPILER_VERSION,
    engine: TEMPLATE_ENGINE,
    templateId,
    createdAt: createdAtFromRunId(options.runId),
    source: {
      host,
      rootUrl: input.routeMap.rootUrl,
      siteSpecRunId: input.siteSpecRunId,
      siteSpecFile: input.siteSpecFile,
      reconstructionRunId: input.reconstructionRunId,
      reconstructionManifestFile: input.reconstructionManifestFile,
      siteSpecSchemaVersion: input.siteSpec.siteSpec.schemaVersion,
      reconstructionSchemaVersion: input.manifest.schemaVersion,
    },
    routes: input.routeMap.routes.map((r) => r.key),
    counts: {
      pages: input.pagesById.size,
      routes: input.routeMap.routes.length,
      slots: artifacts.slots.length,
      bindings: artifacts.bindings.length,
      globalSlots: artifacts.slots.filter((s) => s.scope === "global").length,
      pageSlots: artifacts.slots.filter((s) => s.scope === "page").length,
      textSlots: artifacts.slots.filter((s) => s.type === "text").length,
      urlSlots: artifacts.slots.filter((s) => s.type === "url").length,
      imageSlots: artifacts.slots.filter((s) => s.type === "image").length,
      reviewSlots: artifacts.slots.filter((s) => s.editability === "review").length,
      staticBindings: artifacts.bindings.filter((b) => b.surface === "static").length,
      dynamicTemplateBindings: artifacts.bindings.filter((b) => b.surface === "dynamic-template")
        .length,
      paintTwinBindings: artifacts.bindings.filter((b) => b.surface === "paint-twin").length,
      svgTextBindings: artifacts.bindings.filter((b) => b.target === "svg-text").length,
      excludedCandidates: excludedTotal,
      overridesApplied,
      slotizedPages: slotizedPages.size,
      slotizedRoutes: siteMap.routePolicy!.slotizedRoutes,
      structureOnlyRoutes: routePolicy.scopeCounts["structure-only"],
      excludedRoutes: routePolicy.scopeCounts.exclude,
      collections: siteMap.collections!.length,
    },
    routePolicy: siteMap.routePolicy,
    limitations: [
      "document-title-not-slotted",
      // Task 19.1 narrowed the old `svg-internal-content-not-slotted`: rendered
      // <text>/<tspan> runs ARE slotted now; everything painterly stays opaque.
      "svg-internal-paint-and-geometry-not-slotted",
      "svg-text-only-visible-runs-slotted",
      "aria-hidden-twin-without-box-overlap-evidence-not-cobound",
      "background-image-content-not-slotted",
      "dynamic-template-occurrences-carry-no-geometry-constraints",
      "locale-prefixed-pages-excluded-from-automatic-global-promotion",
      "dynamic-template-value-growth-not-recapped-against-obs-transport-ceiling",
      ...(excludedByOverride > 0 ? [`slots-excluded-by-manual-override:${excludedByOverride}`] : []),
      // Route policy honesty, countable (`route-policy.ts`).
      ...routePolicyLimitations(routePolicy),
      ...(siteMap.collections!.length > 0
        ? [
            "collection-member-counts-are-crawl-capped-floors",
            "collection-total-member-count-unknown-no-pagination-detection",
          ]
        : []),
    ],
    provenance: "derived",
  };

  // 7. write the artifact
  const runDir = options.outputDir ?? reconTemplateRunDir(input.routeMap.rootUrl, options.runId);
  await mkdir(path.join(runDir, REPORT_DIR), { recursive: true });
  const writeJson = async (name: string, value: unknown): Promise<void> => {
    await writeFile(path.join(runDir, name), JSON.stringify(value, null, 2) + "\n", "utf8");
  };
  await writeJson(TEMPLATE_MANIFEST_FILE, manifest);
  await writeJson(SITE_MAP_FILE, siteMap);
  await writeJson(SLOTS_FILE, artifacts.slotsFile);
  await writeJson(SLOT_BINDINGS_FILE, artifacts.bindingsFile);
  await writeJson(DEFAULT_CONTENT_FILE, artifacts.defaultContentFile);
  await writeJson(SLOT_OVERRIDES_EXAMPLE_FILE, OVERRIDES_EXAMPLE);
  await writeJson(path.join(REPORT_DIR, SLOT_SUMMARY_FILE), summary);

  // 8. emit the template app
  await generateTemplateApp({
    sourceAppDir: input.appDir,
    targetAppDir: path.join(runDir, TEMPLATE_APP_DIR),
    artifacts,
    packageName: `wr-template-${host}`,
  });

  // 9. validate what was written
  const validation = await validateTemplateArtifact(runDir);

  return { runDir, manifest, summary, validation, input, twinStats, routePolicy };
}
