/**
 * Default stage runners (spec §17) — each one is a thin conductor over the
 * subsystem's PUBLIC typed API (never `exec("pnpm …")`, never a re-implemented
 * algorithm). Every rerun lands in the subsystem's own namespace under a NEW
 * run id; lineage inputs stay read-only.
 */
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import {
  ingestGenerationResult,
  loadContentRun,
  prepareContentRun,
  type ContentGenerationResult,
} from "../content-injection/index.js";
import {
  ThemeFileSchema,
  createThemeRun,
  loadAdapterFile,
  loadThemeFile,
  newThemeRunId,
  themeRunDir,
} from "../theme/index.js";
import { loadReconTemplate } from "../content-injection/index.js";
import { createProductionSeoPlanRun, type ProvidedBusinessFacts } from "../seo/index.js";
import { productionBuildDir, runProductionCompile, runProductionQa } from "../production/index.js";
import { applyAssetResolutions } from "./resolve-assets.js";
import { mergedAssetResolutions } from "./authored.js";
import type { ResolvedEnablement } from "./enablement.js";
import { CONTENT_DERIVED_HASH_EXCLUSIONS } from "./freshness.js";
import { CANONICAL_FACT_KEYS, normalizeProductionDomain } from "./requirements.js";
import { AUTHORED_DIR, AUTHORED_THEME_FILE, releaseProjectDir } from "./store.js";
import type {
  ArtifactRef,
  ProductionResolution,
  ReleaseProject,
  ReleaseStage,
} from "./types.js";

export interface StageRunnerContext {
  project: ReleaseProject;
  effective: ProductionResolution;
  /** Current artifact per stage — updated as earlier stages complete. */
  current: Partial<Record<ReleaseStage, ArtifactRef | null>>;
  releaseRunId: string;
  log: (line: string) => void;
  /**
   * The project's ENABLEMENT, resolved and re-safety-checked (Task 28 Phases
   * 5 + 6). MEMOIZED by the caller and REQUIRED, not optional: an optional
   * accessor is a field a future runner forgets, and the failure mode of
   * forgetting is a build that silently ships a section the operator deleted.
   * Cheap when nothing is disabled — `build.ts` short-circuits before it opens
   * a single page tree.
   */
  enablement: () => Promise<ResolvedEnablement>;
}

export interface StageRunnerResult {
  id: string;
  path: string;
  /** Subtrees excluded from the artifact hash (build byproducts). */
  excluded?: string[];
  detail?: string;
  /** Operator-facing warnings recorded on the release run (build.ts). */
  warnings?: string[];
}

export type StageRunner = (context: StageRunnerContext) => Promise<StageRunnerResult>;

function currentPath(context: StageRunnerContext, stage: ReleaseStage): string {
  const artifact = context.current[stage];
  if (!artifact) throw new Error(`release build: no current artifact for stage ${stage}`);
  return artifact.path;
}

// ---------------------------------------------------------------------------
// content — prepare + ingest a MERGED generation result (previous run values
// + resolution routeContent/urls + AUTHORED slot values), through the real
// Task 19 pipeline. The new run's slot-values.json is the DERIVED,
// MATERIALIZED output of `authored.slotValues` (store.ts write doctrine).
// ---------------------------------------------------------------------------

export const contentStageRunner: StageRunner = async (context) => {
  const templateManifestFile = path.join(currentPath(context, "template"), "manifest.json");
  const baseRunDir = currentPath(context, "content");
  const baseResult = JSON.parse(
    await readFile(path.join(baseRunDir, "generation-result.json"), "utf8"),
  ) as ContentGenerationResult;
  const baseManifest = JSON.parse(
    await readFile(path.join(baseRunDir, "manifest.json"), "utf8"),
  ) as {
    scopedRoutes?: string[];
    manualEdits?: boolean;
    enablement?: {
      disabledRoutes?: string[];
      withheld?: Array<{
        slotKey: string;
        value?: unknown;
        source?: string;
        unresolvedReason?: string;
      }>;
    };
  };
  const rawIntent = context.project.intent.rawIntent;
  if (rawIntent === null) throw new Error("release build: project has no recorded intent");

  // AUTHORED IS AUTHORITATIVE (store.ts content write doctrine). The pack
  // slices below are the derived legacy view of the SAME values; authored is
  // applied last so a direct authored edit (the Visual Editor's write target)
  // always wins over the pack that first introduced the value.
  const authored = context.project.authored;
  const routeContent = context.effective.routeContent ?? {};
  const urls = context.effective.urls ?? {};
  const warnings: string[] = [];
  if (baseManifest.manualEdits === true) {
    warnings.push(
      `content run ${baseRunDir} carries in-place manual edits to slot-values.json. Those bytes ` +
        "are NON-AUTHORITATIVE: this build materializes a NEW content run from " +
        "authored.slotValues, so any edit not present there is not carried forward",
    );
  }
  const template = await loadReconTemplate(templateManifestFile);
  const templateRoutes = new Set(template.manifest.routes);
  // A build under a disable NARROWS `scopedRoutes` to the routes that stayed
  // enabled. Reading that back as the requested scope would make the narrowing
  // PERMANENT: re-enabling the route would leave its slots out of the units,
  // out of the accounting denominator and out of the merge — the "mysteriously
  // absent" failure the accounting artifact exists to make impossible. The
  // previous run records what IT disabled, so the full scope is recoverable.
  const previouslyDisabledRoutes = baseManifest.enablement?.disabledRoutes ?? [];
  const requestedRoutes = [
    ...new Set([
      ...(baseManifest.scopedRoutes ?? []),
      ...previouslyDisabledRoutes,
      ...Object.keys(routeContent).filter((route) => route !== "global"),
    ]),
  ];
  for (const route of requestedRoutes) {
    if (!templateRoutes.has(route)) {
      throw new Error(`release build: routeContent route ${route} is not a template route`);
    }
  }

  // ---- enablement (Task 28 Phases 5 + 6) ----------------------------------
  // A disabled route leaves the content SCOPE — that is what makes the content
  // stage a direct consumer rather than a downstream one. Its slots do NOT
  // leave the accounting: they are handed to `prepareContentRun` as
  // `enablement.disabledSlots` and land in the in-scope denominator with a
  // `disabled-route` / `disabled-region` disposition instead of disappearing.
  const enablement = await context.enablement();
  const disabledRoutes = new Set(enablement.plan.disabledRoutes);
  const routes = requestedRoutes.filter((route) => !disabledRoutes.has(route));
  if (requestedRoutes.length > 0 && routes.length === 0) {
    throw new Error(
      "release build: every content-scope route is disabled — a content run with no route in scope " +
        `cannot be prepared (disabled: ${[...disabledRoutes].join(", ")})`,
    );
  }
  for (const refusal of enablement.refusals) {
    warnings.push(
      `enablement REFUSED (${refusal.code}) on ${refusal.subject}: ${refusal.message}`,
    );
  }
  const skippedRoutes = requestedRoutes.filter((route) => disabledRoutes.has(route));
  if (skippedRoutes.length > 0) {
    context.log(
      `[release] content scope drops ${skippedRoutes.length} disabled route(s): ${skippedRoutes.join(", ")}`,
    );
  }

  // ---- the disabled route leaves the CONTENT SCOPE ------------------------
  //
  // `buildContentUnits` scopes a page slot by `slot.scope === "global" ||
  // routeSet.has(slot.route)`, so a disabled route's page slots are not in the
  // new run's units — and `validateGenerationResult` rejects any assigned value
  // or unresolved entry for a key outside that scope. Carrying `baseResult`
  // forward unfiltered therefore made "turn this page off" IMPOSSIBLE on a real
  // project: MEASURED on a project prepared from the accepted linear production
  // spec, disabling `/pricing` failed the content stage with 62 errors, all
  // `out-of-scope-slot` with `pricing.`-prefixed keys, and disabling `/security`
  // instead failed with 76. The 2-route release fixture never hit the shape.
  //
  // THE FILTER IS DELIBERATELY NARROW. Only a key that (a) left the units scope
  // BECAUSE its route is disabled and (b) is ACCOUNTED FOR by the resolved
  // enablement as a disabled slot is dropped. Anything else out of scope is
  // still a real validation error and still fails the build loudly — dropping
  // by scope alone would be the "widen the filter until the gate passes" move
  // this program refuses. Nothing goes missing: every dropped key is already in
  // `enablement.disabledSlots`, which `prepareContentRun` adds back to the
  // in-scope denominator with a `disabled-route` disposition.
  const accountedDisabled = new Set(enablement.disabledSlots.map((slot) => slot.slotKey));
  const previouslyWithheld = baseManifest.enablement?.withheld ?? [];
  const enablementScopeDrop = new Set<string>();
  const unaccountedScopeDrop: string[] = [];
  if (disabledRoutes.size > 0) {
    for (const slot of template.slotsFile.slots) {
      if (slot.scope === "global") continue;
      if (slot.route === undefined || !disabledRoutes.has(slot.route)) continue;
      if (accountedDisabled.has(slot.key)) enablementScopeDrop.add(slot.key);
      else unaccountedScopeDrop.push(slot.key);
    }
  }
  if (unaccountedScopeDrop.length > 0) {
    warnings.push(
      `${unaccountedScopeDrop.length} slot key(s) leave the content scope with a disabled route but are ` +
        "NOT accounted as disabled slots, so they are NOT filtered and validation will report them: " +
        unaccountedScopeDrop.slice(0, 8).join(", ") +
        (unaccountedScopeDrop.length > 8 ? `, +${unaccountedScopeDrop.length - 8} more` : ""),
    );
  }
  if (enablementScopeDrop.size > 0) {
    context.log(
      `[release] content scope drops ${enablementScopeDrop.size} slot key(s) belonging to disabled ` +
        "route(s); they stay in the accounting as `disabled-route`",
    );
  }

  // WITHHOLDING IS NOT DELETION. Every value the drop removes is recorded on
  // the new run's manifest so a later RE-ENABLE restores it. MEASURED on the
  // real linear lineage: disabling `/pricing` withholds 60 values and 2
  // needs-input entries; without this the next base result no longer carries
  // them and re-enabling the route would quietly return the page to its SOURCE
  // defaults while reporting a clean build.
  const withheld: Array<{
    slotKey: string;
    value?: unknown;
    source?: string;
    unresolvedReason?: string;
  }> = [];
  if (enablementScopeDrop.size > 0) {
    const effective = new Map<string, { value: unknown; source?: string }>();
    for (const [key, value] of Object.entries(baseResult.slotValues)) {
      effective.set(key, { value, ...(baseResult.sources[key] !== undefined ? { source: baseResult.sources[key] } : {}) });
    }
    for (const entry of previouslyWithheld) {
      if (entry.value === undefined || effective.has(entry.slotKey)) continue;
      effective.set(entry.slotKey, { value: entry.value, ...(entry.source !== undefined ? { source: entry.source } : {}) });
    }
    for (const content of Object.values(routeContent)) {
      for (const [key, value] of Object.entries(content.slotValues ?? {})) {
        effective.set(key, { value, source: "user-provided" });
      }
    }
    for (const [key, value] of Object.entries(urls)) effective.set(key, { value, source: "user-provided" });
    for (const [key, value] of Object.entries(authored.slotValues)) {
      effective.set(key, { value, source: "user-provided" });
    }
    const reasons = new Map<string, string>();
    for (const entry of baseResult.unresolved) reasons.set(entry.slotKey, entry.reason);
    for (const entry of previouslyWithheld) {
      if (entry.unresolvedReason === undefined || reasons.has(entry.slotKey)) continue;
      reasons.set(entry.slotKey, entry.unresolvedReason);
    }
    for (const key of [...enablementScopeDrop].sort()) {
      const value = effective.get(key);
      const reason = reasons.get(key);
      if (value === undefined && reason === undefined) continue;
      withheld.push({
        slotKey: key,
        ...(value !== undefined ? { value: value.value } : {}),
        ...(value?.source !== undefined ? { source: value.source } : {}),
        // A key never travels as both — `assigned-and-unresolved` is a
        // validation error, and it would become one again on restore.
        ...(value === undefined && reason !== undefined ? { unresolvedReason: reason } : {}),
      });
    }
  }

  // ---- review slots the OPERATOR wrote (Task 28 Phase 11) ----------------
  //
  // A review-flagged slot is never AUTO-written, but the Visual Editor exists
  // so a person can decide one. Without this, a build of a project whose
  // operator edited the hero headline failed the content stage with
  // `review-slot-not-writable` while the editor had previewed the edit
  // happily — measured on the Phase 11 canary (3 errors: the hero headline and
  // both halves of the hero CTA). The opt-in is PER KEY, comes only from an
  // explicit operator write, and is recorded on the run manifest.
  const operatorWrittenKeys = new Set<string>([
    ...Object.keys(authored.slotValues),
    ...Object.values(routeContent).flatMap((content) => Object.keys(content.slotValues ?? {})),
    ...Object.keys(urls),
  ]);
  const operatorReviewSlotKeys = template.slotsFile.slots
    .filter((slot) => slot.editability === "review" && operatorWrittenKeys.has(slot.key))
    .map((slot) => slot.key)
    .filter((key) => !enablementScopeDrop.has(key))
    .sort();
  if (operatorReviewSlotKeys.length > 0) {
    context.log(
      `[release] content opts ${operatorReviewSlotKeys.length} review-flagged slot(s) into scope because ` +
        `the operator wrote them: ${operatorReviewSlotKeys.slice(0, 6).join(", ")}` +
        (operatorReviewSlotKeys.length > 6 ? `, +${operatorReviewSlotKeys.length - 6} more` : ""),
    );
  }

  const prepared = await prepareContentRun({
    templateManifestFile,
    rawIntent,
    routes,
    ...(operatorReviewSlotKeys.length > 0 ? { operatorReviewSlotKeys } : {}),
    ...(enablement.plan.disabledRoutes.length > 0 || enablement.disabledSlots.length > 0
      ? {
          enablement: {
            disabledRoutes: [...enablement.plan.disabledRoutes].sort(),
            disabledSlots: enablement.disabledSlots,
            disabledRegionIds: [...enablement.plan.disabledRegionIds].sort(),
            ...(withheld.length > 0 ? { withheld } : {}),
          },
        }
      : {}),
  });
  const runId = prepared.runId;
  const runDir = path.relative(process.cwd(), path.resolve(prepared.runDir));
  const run = await loadContentRun(runDir);

  // ---- merge: base result + values a previous disable withheld ------------
  const slotValues: Record<string, unknown> = { ...baseResult.slotValues };
  const sources: Record<string, string> = { ...baseResult.sources };
  const unresolvedByKey = new Map<string, { slotKey: string; reason: string }>();
  for (const entry of baseResult.unresolved) unresolvedByKey.set(entry.slotKey, entry);
  const restoredKeys: string[] = [];
  for (const entry of previouslyWithheld) {
    if (enablementScopeDrop.has(entry.slotKey)) continue; // still disabled
    let restored = false;
    if (entry.value !== undefined && slotValues[entry.slotKey] === undefined) {
      slotValues[entry.slotKey] = entry.value;
      if (entry.source !== undefined) sources[entry.slotKey] = entry.source;
      restored = true;
    }
    if (entry.unresolvedReason !== undefined && !unresolvedByKey.has(entry.slotKey)) {
      unresolvedByKey.set(entry.slotKey, { slotKey: entry.slotKey, reason: entry.unresolvedReason });
      restored = true;
    }
    if (restored) restoredKeys.push(entry.slotKey);
  }
  if (restoredKeys.length > 0) {
    context.log(
      `[release] content restores ${restoredKeys.length} value(s) withheld by an earlier disable ` +
        "(the route is enabled again)",
    );
  }
  const providedKeys = new Set<string>();
  for (const [route, content] of Object.entries(routeContent)) {
    for (const [slotKey, value] of Object.entries(content.slotValues ?? {})) {
      if (enablementScopeDrop.has(slotKey)) continue;
      slotValues[slotKey] = value;
      sources[slotKey] = "user-provided";
      providedKeys.add(slotKey);
    }
    void route;
  }
  for (const [slotKey, value] of Object.entries(urls)) {
    if (enablementScopeDrop.has(slotKey)) continue;
    slotValues[slotKey] = value;
    sources[slotKey] = "user-provided";
    providedKeys.add(slotKey);
  }
  for (const [slotKey, value] of Object.entries(authored.slotValues)) {
    if (enablementScopeDrop.has(slotKey)) continue;
    slotValues[slotKey] = value;
    sources[slotKey] = "user-provided";
    providedKeys.add(slotKey);
  }
  const pagePlans = baseResult.sitePlan.pagePlans.filter((plan) => !disabledRoutes.has(plan.route));
  const plannedRoutes = new Set(pagePlans.map((plan) => plan.route));
  for (const route of routes) {
    if (plannedRoutes.has(route)) continue;
    const provided = routeContent[route]?.pagePlan;
    pagePlans.push({
      route,
      currentPurpose: provided?.currentPurpose ?? "source route (carried by the release orchestrator)",
      newPurpose: provided?.newPurpose ?? "operator-provided route content (release resolution)",
      primaryMessage:
        provided?.primaryMessage ??
        (Object.values(routeContent[route]?.slotValues ?? {}).find(
          (value): value is string => typeof value === "string",
        ) ?? "operator-provided route content"),
      secondaryMessages: provided?.secondaryMessages ?? [],
      conversionGoal: provided?.conversionGoal ?? baseResult.sitePlan.primaryConversion,
      contentStrategy:
        provided?.contentStrategy ??
        "keep layout and structure; only operator-provided text/link values are injected",
    });
  }
  // The values that leave the scope are now recorded on the run manifest as
  // `enablement.withheld`; drop them from what this run asserts.
  for (const key of enablementScopeDrop) {
    delete slotValues[key];
    delete sources[key];
  }
  const merged: ContentGenerationResult = {
    ...baseResult,
    generator: { name: "release-orchestrator" },
    sitePlan: { ...baseResult.sitePlan, pagePlans },
    // An image brief for a slot that left the scope with its route would fail
    // `image-brief-inconsistent` (it names a replacement whose value is gone).
    imageBriefs: baseResult.imageBriefs.filter((brief) => !enablementScopeDrop.has(brief.slotKey)),
    slotValues: slotValues as ContentGenerationResult["slotValues"],
    sources: sources as ContentGenerationResult["sources"],
    unresolved: [...unresolvedByKey.values()].filter(
      (slot) => !providedKeys.has(slot.slotKey) && !enablementScopeDrop.has(slot.slotKey),
    ),
    notes: [
      ...(baseResult.notes ?? []),
      `release rerun ${context.releaseRunId}: merged operator resolution (routes: ${routes.join(", ")})`,
    ],
  };
  // ingestGenerationResult MATERIALIZES slot-values.json in the new run dir —
  // the derived output of authored.slotValues. Its format is unchanged (a bare
  // slot-key → value map), so every consumer, production included, is untouched.
  const outcome = await ingestGenerationResult(run, merged);
  context.log(
    `[release] content run ${runId}: ${Object.keys(outcome.overlay).length} slot values ` +
      `(${Object.keys(authored.slotValues).length} authored), ${merged.unresolved.length} unresolved`,
  );
  // Task 27 (Content V2 changeRequest): the ingest now writes a total account of
  // every in-scope slot beside slot-values.json. Surface its headline numbers on
  // the release run so an operator can see what a rerun actually accounted for —
  // `ambiguous` are review-flagged slots that are NEVER folded into a success
  // number. A failed reconciliation is an integrity signal, so that one — and
  // only that one — is raised to an operator warning rather than a log line.
  const accounting = outcome.accounting;
  context.log(
    `[release] content accounting: ${accounting.totals.inScopeSlots} in-scope slots, ` +
      `${accounting.scopeHonesty.ambiguousSlots} ambiguous, ` +
      `reconciled=${accounting.reconciliation.reconciled} (truth mode: ${accounting.truthMode})`,
  );
  // Task 28 Phase 9: the CROSS-PAGE consistency review. A build is the moment a
  // multi-route site becomes real, so this is where "does every route this
  // build ships actually carry content?" has to be answered. The review is a
  // REPORT — it never rewrites a value and never fails an ingest — but an
  // error-level finding (a route the build wrote nothing for, a working name
  // spelled two ways) is exactly the kind of defect that is invisible in a
  // slot-value total, so it is raised to an operator warning here.
  const consistency = outcome.consistency;
  context.log(
    `[release] content consistency: ${consistency.routeCoverage.filter((entry) => entry.writtenSlots > 0).length}` +
      `/${consistency.routeCoverage.length} route(s) carry written values, ` +
      `${consistency.counts.errors} error(s), ${consistency.counts.warnings} warning(s) ` +
      `(report/consistency.json)`,
  );
  if (!consistency.pass) {
    const codes = [...new Set(consistency.findings.filter((f) => f.severity === "error").map((f) => f.code))];
    warnings.push(
      `content run ${runDir}: the cross-page consistency review reports ${consistency.counts.errors} ` +
        `error-level finding(s) [${codes.join(", ")}] — see report/consistency.json. ` +
        consistency.findings
          .filter((finding) => finding.severity === "error")
          .slice(0, 5)
          .map((finding) => finding.message)
          .join("; "),
    );
  }
  if (!accounting.reconciliation.reconciled) {
    warnings.push(
      `content run ${runDir}: slot accounting did NOT reconcile — ` +
        `${accounting.reconciliation.missing.length} missing, ` +
        `${accounting.reconciliation.doubleCounted.length} double-counted of ` +
        `${accounting.reconciliation.inScopeSlots} in-scope slots (slot-accounting.json)`,
    );
  }
  for (const warning of warnings) context.log(`[release] WARNING — ${warning}`);
  // The rerun artifact must be hashed under the SAME exclusion set prepare.ts
  // records, or a build-produced content run would be the one project shape
  // still exposed to the QA/revalidation drift this set exists to stop.
  return {
    id: runId,
    path: runDir,
    excluded: [...CONTENT_DERIVED_HASH_EXCLUSIONS],
    ...(warnings.length > 0 ? { warnings } : {}),
  };
};

// ---------------------------------------------------------------------------
// theme — the AUTHORED theme (base theme file + contract token overrides) and
// the current run's adapter, over the CURRENT content. Reconstruction,
// template and content are untouched: a theme is a paint overlay (Task 20).
// ---------------------------------------------------------------------------

export const themeStageRunner: StageRunner = async (context) => {
  const baseRunDir = currentPath(context, "theme");
  const baseManifest = JSON.parse(await readFile(path.join(baseRunDir, "manifest.json"), "utf8")) as {
    themeSourceFile: string;
    adapterSourceFile: string;
  };
  const templateManifestFile = path.join(currentPath(context, "template"), "manifest.json");
  const template = await loadReconTemplate(templateManifestFile);
  const authoredTheme = context.project.authored.theme;
  const baseThemeFile = authoredTheme.themeSourceFile ?? baseManifest.themeSourceFile;
  const baseTheme = await loadThemeFile(baseThemeFile);
  const adapter = await loadAdapterFile(baseManifest.adapterSourceFile);
  const runId = newThemeRunId();
  const runDir = themeRunDir(context.project.source.host, runId);

  // Token overrides are validated against theme-contract-v1 at resolve time.
  // The authored theme is written into the RELEASE PROJECT namespace so the
  // theme run's provenance points at a real file that is not a lineage input.
  const tokenOverrides = authoredTheme.tokens ?? {};
  let theme = baseTheme;
  let themeSourceFile = baseThemeFile;
  if (Object.keys(tokenOverrides).length > 0) {
    theme = ThemeFileSchema.parse({
      ...baseTheme,
      tokens: { ...baseTheme.tokens, ...tokenOverrides },
    });
    themeSourceFile = path.join(
      releaseProjectDir(context.project.source.host, context.project.projectId),
      AUTHORED_DIR,
      AUTHORED_THEME_FILE,
    );
    await mkdir(path.dirname(themeSourceFile), { recursive: true });
    await writeFile(themeSourceFile, JSON.stringify(theme, null, 2) + "\n", "utf8");
  }

  await createThemeRun({
    template,
    templateManifestFile,
    adapter,
    adapterSourceFile: baseManifest.adapterSourceFile,
    theme,
    themeSourceFile,
    runId,
    runDir,
    contentRunDir: currentPath(context, "content"),
  });
  context.log(
    `[release] theme run ${runId} (adapter carried from ${baseRunDir}; ` +
      `${Object.keys(tokenOverrides).length} authored contract token(s))`,
  );
  return { id: runId, path: runDir };
};

// ---------------------------------------------------------------------------
// seo — regenerate the production SEO plan (offline, deterministic).
// ---------------------------------------------------------------------------

export const seoStageRunner: StageRunner = async (context) => {
  const facts: ProvidedBusinessFacts = {};
  for (const key of CANONICAL_FACT_KEYS) {
    const value = context.effective.facts?.[key];
    if (value === undefined) continue;
    if (key === "sameAs") facts.sameAs = Array.isArray(value) ? value : [value];
    else {
      (facts as Record<string, string>)[key] = Array.isArray(value) ? value.join(", ") : value;
    }
  }
  const domain =
    context.effective.productionBaseUrl === undefined
      ? undefined
      : normalizeProductionDomain(context.effective.productionBaseUrl);
  // A disabled route must leave the SEO plan, and with it the sitemap urlset,
  // the canonical/og/twitter/jsonLd block and the rendered head — one filter,
  // applied where the route loop is.
  const enablement = await context.enablement();
  const { manifest, outputDir } = await createProductionSeoPlanRun({
    templateManifestRef: path.join(currentPath(context, "template"), "manifest.json"),
    contentRunDir: currentPath(context, "content"),
    sourceSnapshotRef: context.project.auxiliary.seoSourceSnapshotDir,
    ...(enablement.plan.disabledRoutes.length > 0
      ? { disabledRoutes: enablement.plan.disabledRoutes }
      : {}),
    ...(domain !== undefined ? { productionDomain: domain } : {}),
    ...(Object.keys(facts).length > 0 ? { facts } : {}),
    log: context.log,
  });
  context.log(`[release] seo plan ${manifest.runId} (mode ${manifest.domainState.mode})`);
  return { id: manifest.runId, path: path.relative(process.cwd(), outputDir) };
};

// ---------------------------------------------------------------------------
// assets — apply operator asset/font resolutions as a DERIVED materialization.
// ---------------------------------------------------------------------------

export const assetsStageRunner: StageRunner = async (context) => {
  // AUTHORED IS AUTHORITATIVE, the pack still ARRIVES (Task 28 Phase 2) — the
  // same precedence `contentStageRunner` gives slot values and
  // `themeStageRunner` gives theme tokens. `mergedAssetResolutions` applies the
  // pack's assets first and `authored.assets` last, so a project whose only
  // asset input is a resolution pack passes byte-identical arguments to
  // `applyAssetResolutions` and a Visual Editor edit that never went through a
  // pack still reaches the materialization.
  const result = await applyAssetResolutions({
    baseMaterializationRunDir: currentPath(context, "assets"),
    assets: mergedAssetResolutions(context.effective.assets, context.project.authored),
    fontDecisions: context.effective.fontDecisions ?? {},
    providedBy: `release:${context.project.projectId}:${context.releaseRunId}`,
    log: context.log,
  });
  return {
    id: result.runId,
    path: path.relative(process.cwd(), path.resolve(result.runDir)),
    detail:
      `${result.appliedAssets.length} asset(s) applied, ${result.recordedFiles.length} recorded, ` +
      `${result.fontDecisionFamilies.length} font decision(s)`,
  };
};

// ---------------------------------------------------------------------------
// production — real compile (Task 23) + isolated-package QA. QA failure is a
// stage failure: a build whose QA fails is never adopted.
// ---------------------------------------------------------------------------

export const productionStageRunner: StageRunner = async (context) => {
  const enablement = await context.enablement();
  const compile = await runProductionCompile({
    host: context.project.source.host,
    templateRunDir: currentPath(context, "template"),
    contentRunDir: currentPath(context, "content"),
    themeRunDir: currentPath(context, "theme"),
    seoPlanRunDir: currentPath(context, "seo"),
    materializationRunDir: currentPath(context, "assets"),
    log: context.log,
    // Task 28 Phase 2: authored.brand is the DECISION half of source-brand
    // resolution; the detector's evidence stays derived and is re-scanned by
    // the bake. `displayName` is the site's own name and the only string this
    // repo has for a generated fallback mark — never the source's.
    brand: {
      decisions: context.project.authored.brand ?? {},
      brandName: context.project.displayName ?? null,
    },
    // Task 28 Phases 5 + 6: the disable becomes PHYSICAL here and nowhere else
    // — the route table is filtered, the region roots are cut out of the page
    // trees and the deterministic nav hosts are removed, all in the build copy.
    enablement: enablement.plan,
  });
  const qa = await runProductionQa({ packageDir: compile.packageDir, log: context.log });
  const buildDir = productionBuildDir(context.project.source.host, compile.runId);
  await mkdir(path.join(buildDir, "report"), { recursive: true });
  await writeFile(
    path.join(buildDir, "report", "qa.json"),
    JSON.stringify(qa, null, 2) + "\n",
    "utf8",
  );
  if (qa.failed > 0) {
    throw new Error(
      `production QA failed: ${qa.failed} of ${qa.passed + qa.failed} checks — build ${compile.runId} not adopted`,
    );
  }
  context.log(`[release] production ${compile.runId}: QA ${qa.passed}/${qa.passed + qa.failed}`);
  const enablementDetail =
    compile.enablement === null || compile.enablement === undefined
      ? ""
      : `; enablement ${compile.enablement.routesRemoved.length} route(s) off, ` +
        `${compile.enablement.regionNodesRemoved} region root(s), ` +
        `${compile.enablement.navNodesRemoved} nav host(s) removed`;
  return {
    id: compile.runId,
    path: path.relative(process.cwd(), compile.specDir),
    detail:
      `decision=${compile.spec.indexabilityGate.decision}; qa ${qa.passed}/${qa.passed + qa.failed}` +
      enablementDetail,
  };
};

export const DEFAULT_STAGE_RUNNERS: Partial<Record<ReleaseStage, StageRunner>> = {
  content: contentStageRunner,
  theme: themeStageRunner,
  seo: seoStageRunner,
  assets: assetsStageRunner,
  production: productionStageRunner,
};
