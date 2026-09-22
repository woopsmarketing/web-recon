/**
 * Create Site (Task 28 Phase 8) — ONE BRIEF → A NEW, INDEPENDENT SITE.
 *
 * `release:prepare` (prepare.ts) already registers an ALREADY-PRODUCED
 * candidate as a release project. This module is the layer ON TOP of it: it
 * takes an operator's Brief and a Template, runs the existing content
 * generation seam (Task 27 §5 — every brief field optional, nothing asked),
 * REUSES the shared per-host theme / SEO / asset artifacts a template's host
 * already carries (they are independent of any one site's content — see the
 * data/<host>/{theme-runs,production-seo-plans,asset-materializations}
 * namespaces, which Tasks 20-23 populate once per host, not once per site),
 * compiles a fresh production candidate, and registers it as a NEW,
 * INDEPENDENT release project. Nothing here touches the Template: every read
 * off `templateManifestFile`'s directory is read-only, proven by a
 * byte-for-byte directory hash taken before and after (`templateUnmutated`).
 *
 * ROUTE SCOPE (`selectRouteScope`). A route-policy template marks some routes
 * `structure-only` — rendered by the copied exact app, zero customer slots,
 * because generating unique per-route content for a large repeated family
 * (e.g. Stripe's `/resources/more/<slug>` articles) would either fabricate
 * facts or duplicate the family's one representative onto every member URL.
 * The default selection here is exactly the template compiler's own verdict:
 * every route whose `site-map.json` scope is `core-reconstruct`,
 * `collection-index` or `collection-representative` is INCLUDED; every
 * `structure-only` route is EXCLUDED from content generation. A v1/v2
 * template (no route policy at all) has no `scope` on any route, so every
 * route defaults to `core-reconstruct` and is included — matching the
 * registry's own "no policy ⇒ every route was slotized" doctrine
 * (`src/registry/scan.ts`).
 *
 * KNOWN TRAP (Task 28 recon, confirmed against real data before this module
 * was written): `release:build` resolves route/region enablement against
 * `project.auxiliary.pageRegionsDir` while the Visual Editor discovers the
 * NEWEST page-regions compile matching the template on disk — two
 * independent lookups that can name two different runs. This module closes
 * that at the SOURCE: `findMatchingPageRegionsRun` is the ONE lookup, and
 * `src/editor/catalog.ts`'s `newestMatchingRegionRun` calls it too, so
 * Create Site and the editor can never discover two different answers for
 * the same template. When no matching compile exists, `pageRegionsDir` is
 * left unset — never guessed — and the project simply refuses region edits
 * exactly as an operator-prepared project without `--page-regions` does.
 */
import path from "node:path";
import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { readdir, readFile, writeFile } from "node:fs/promises";

import {
  BriefContentGenerator,
  FakeContentGenerator,
  executeGenerationBatches,
  ingestGenerationResult,
  loadContentRun,
  loadManualGenerationResult,
  loadReconTemplate,
  prepareContentRun,
  type ContentBrief,
  type ContentGenerationResult,
  type LoadedReconTemplate,
} from "../content-injection/index.js";
import { summarizeFirstDraft, type FirstDraftSummary } from "./first-draft.js";
import { runProductionCompile } from "../production/index.js";
import { hashDirectory } from "../production/hash.js";
import type { PageRegion } from "../regions/types.js";
import { prepareReleaseProject, type PrepareOptions, type PrepareResult } from "./prepare.js";
import { projectIdForSite } from "./instance.js";
import { RELEASE_PROJECT_FILE, releaseProjectDir } from "./store.js";
import {
  RouteScopeSchema,
  SLOTIZED_ROUTE_SCOPES,
  type RouteScope,
} from "../recon-template/types.js";

// ---------------------------------------------------------------------------
// Route scope
// ---------------------------------------------------------------------------

export interface RouteScopeSelection {
  /** Every route this Create Site run will generate customer content for. */
  includedRoutes: string[];
  /** `structure-only` per the template's OWN route policy — never generated. */
  excludedStructureOnlyRoutes: string[];
  /** `site-map.json` `excludedRoutes` — dropped from the represented surface entirely. */
  excludedOtherRoutes: string[];
  /** False on a v1/v2 template (no route policy at all) — every route included by definition. */
  policyApplied: boolean;
  counts: {
    total: number;
    included: number;
    excludedStructureOnly: number;
    excludedOther: number;
  };
}

/**
 * The default Route Scope: core-reconstruct + collection-index +
 * collection-representative routes, excluding structure-only detail routes.
 *
 * Reads ONLY the template's already-compiled `site-map.json` — the per-route
 * `scope` field the (frozen) recon-template compiler already computed. This
 * function does not re-derive scope from slot bindings: an earlier
 * measurement during this task's build proved that would be WRONG for a
 * shared-page structure-only route (a route that renders the same physical
 * page as its family's representative still carries that page's slot
 * bindings, so a binding-count heuristic would silently promote it back to a
 * full generated page — the exact failure mode this function exists to
 * prevent). `site-map.json`'s `scope` field is the compiler's own verdict and
 * is authoritative.
 */
export function selectRouteScope(template: LoadedReconTemplate): RouteScopeSelection {
  const siteMap = template.siteMap;
  const manifestRoutes = template.manifest.routes;
  const policyApplied = siteMap.routePolicy?.applied ?? false;
  const includedRoutes: string[] = [];
  const excludedStructureOnlyRoutes: string[] = [];
  for (const route of siteMap.routes) {
    const scope: RouteScope = RouteScopeSchema.parse(route.scope ?? "core-reconstruct");
    if (scope === "structure-only") {
      excludedStructureOnlyRoutes.push(route.route);
    } else if ((SLOTIZED_ROUTE_SCOPES as readonly string[]).includes(scope)) {
      includedRoutes.push(route.route);
    }
    // `exclude` scope routes never appear in siteMap.routes at all — they are
    // reported separately via `excludedRoutes` below.
  }
  const excludedOtherRoutes = (siteMap.excludedRoutes ?? []).map((r) => r.route);
  return {
    includedRoutes,
    excludedStructureOnlyRoutes,
    excludedOtherRoutes,
    policyApplied,
    counts: {
      total: manifestRoutes.length,
      included: includedRoutes.length,
      excludedStructureOnly: excludedStructureOnlyRoutes.length,
      excludedOther: excludedOtherRoutes.length,
    },
  };
}

// ---------------------------------------------------------------------------
// Shared per-host artifact discovery — read-only, never guessed silently
// ---------------------------------------------------------------------------

async function listRunsNewestFirst(namespace: string): Promise<string[]> {
  let entries;
  try {
    entries = await readdir(namespace, { withFileTypes: true });
  } catch {
    return [];
  }
  return entries
    .filter((e) => e.isDirectory() && !e.name.startsWith("."))
    .map((e) => e.name)
    .sort()
    .reverse();
}

async function readJsonSafe<T>(file: string): Promise<T | null> {
  try {
    return JSON.parse(await readFile(file, "utf8")) as T;
  } catch {
    return null;
  }
}

export interface MatchedPageRegionsRun {
  runDir: string;
  file: string;
  regions: PageRegion[];
}

/**
 * The newest `page-regions` compile whose `templateId` matches. THE ONE
 * LOOKUP — `src/editor/catalog.ts`'s `newestMatchingRegionRun` calls this
 * too, so Create Site and the Visual Editor can never disagree about which
 * page-regions run belongs to a template (see the KNOWN TRAP note above).
 */
export async function findMatchingPageRegionsRun(
  host: string,
  templateId: string,
  dataRoot = "data",
): Promise<MatchedPageRegionsRun | null> {
  const namespace = path.join(dataRoot, host, "page-regions");
  for (const runId of await listRunsNewestFirst(namespace)) {
    const runDir = path.join(namespace, runId);
    const file = path.join(runDir, "page-regions.json");
    const parsed = await readJsonSafe<{ templateId: string; regions: PageRegion[] }>(file);
    if (parsed?.templateId === templateId) return { runDir, file, regions: parsed.regions };
  }
  return null;
}

/** The newest `theme-runs` compile whose `templateId` matches, or null. */
export async function findMatchingThemeRun(
  host: string,
  templateId: string,
  dataRoot = "data",
): Promise<string | null> {
  const namespace = path.join(dataRoot, host, "theme-runs");
  for (const runId of await listRunsNewestFirst(namespace)) {
    const runDir = path.join(namespace, runId);
    const manifest = await readJsonSafe<{ templateId: string }>(path.join(runDir, "manifest.json"));
    if (manifest?.templateId === templateId) return runDir;
  }
  return null;
}

/** The newest `production-seo-plans` run whose lineage template matches, or null. */
export async function findMatchingSeoPlanRun(
  host: string,
  templateId: string,
  dataRoot = "data",
): Promise<string | null> {
  const namespace = path.join(dataRoot, host, "production-seo-plans");
  for (const runId of await listRunsNewestFirst(namespace)) {
    const runDir = path.join(namespace, runId);
    const manifest = await readJsonSafe<{ inputs: { templateId: string } }>(
      path.join(runDir, "manifest.json"),
    );
    if (manifest?.inputs?.templateId === templateId) return runDir;
  }
  return null;
}

/**
 * The newest `asset-materializations` run for the host. Assets are a
 * HOST-scoped artifact (Tasks 21/22 fetch what the live site serves, not what
 * any one template's slotization looks like) so there is no templateId to
 * match against — the newest materialization is always the right one to
 * reuse, and this is the ONE place that decides so (never re-guessed
 * per-call).
 */
export async function newestMaterializationRun(host: string, dataRoot = "data"): Promise<string | null> {
  const namespace = path.join(dataRoot, host, "asset-materializations");
  const runs = await listRunsNewestFirst(namespace);
  return runs.length > 0 ? path.join(namespace, runs[0]!) : null;
}

// ---------------------------------------------------------------------------
// Create Site
// ---------------------------------------------------------------------------

export interface CreateSiteOptions {
  /** The Template — an already-compiled recon-template manifest.json. NEVER mutated. */
  templateManifestFile: string;
  /**
   * REQUIRED INPUT: the natural-language Brief. Every field but `goal` is
   * optional (Task 27 §5) — nothing here asks a follow-up question.
   */
  brief: ContentBrief;
  /**
   * STABLE site identity. OPTIONAL: when omitted it is DERIVED FROM THE BRIEF
   * (`resolveCreateSiteIdentity`) and never from the host — a brief-only
   * Create Site must not name the site after its source site, and must never
   * resolve onto another customer's existing project.
   */
  siteId?: string;
  projectId?: string;
  displayName?: string;
  /**
   * Shared per-host artifacts this site is built on. Each is auto-discovered
   * (newest run matching the template, or newest for the host for assets)
   * when omitted — an explicit value always wins. Discovery failure is a
   * thrown, named error, never a silent guess.
   */
  themeRunDir?: string;
  seoPlanRunDir?: string;
  materializationRunDir?: string;
  /** Explicit page-regions run dir; else the one `findMatchingPageRegionsRun` finds. */
  pageRegionsDir?: string;
  /**
   * WHO WRITES THE FIRST DRAFT.
   *
   *   `"brief"`  (DEFAULT, Task 28 Phase 10) the brief-driven writer — copy
   *              composed from the operator's own brief. This is the default
   *              because it is what makes Create Site produce a SITE rather
   *              than a plumbing test: the previous default, `"fake"`, wrote
   *              the literal word "Fake" into every text slot.
   *   `"fake"`   the deterministic filler provider, kept for fixtures.
   *   `{ resultFile }` ingest a generation-result.json written elsewhere (the
   *              sanctioned no-LLM-key manual seam — see the Task 28
   *              contract). Any future remote provider arrives the same way.
   */
  contentProvider?: "brief" | "fake" | { resultFile: string };
  contentOutputDir?: string;
  dataRoot?: string;
  /** Cache the new project in the site registry (default true). */
  register?: boolean;
  log?: (line: string) => void;
}

export interface CreateSiteResult {
  routeScope: RouteScopeSelection;
  /** The identity this site was registered under — never the bare host slug. */
  siteId: string;
  /** Where that identity came from: explicit / working-name / goal / brief-hash. */
  siteIdSource: SiteIdSource;
  /** The derived id before any collision step. Equal to `siteId` when nothing was taken. */
  siteIdBase: string;
  /** How many already-existing projects the derived identity stepped past (0 normally). */
  siteIdDisambiguation: number;
  templateDir: string;
  templateHashBefore: string;
  templateHashAfter: string;
  templateUnmutated: boolean;
  contentRunDir: string;
  themeRunDir: string;
  seoPlanRunDir: string;
  materializationRunDir: string;
  productionSpecFile: string;
  productionBuildDir: string;
  pageRegionsDir: string | null;
  pageRegionsSource: "explicit" | "discovered" | "none";
  prepare: PrepareResult;
  briefGaps: Array<{ field: string; consequence: string }>;
  contentAssignedSlots: number;
  contentUnresolvedSlots: number;
  /** Who actually wrote the draft — never inferred from the option later. */
  contentProvider: string;
  /** Per-route account of the First Draft, derived from the run's own artifacts. */
  firstDraft: FirstDraftSummary;
  /** Where `firstDraft` was written (inside the run's report/ dir). */
  firstDraftFile: string;
  /** The cross-page consistency review's verdict on the draft. */
  consistency: { pass: boolean; errors: number; warnings: number };
}

export class CreateSiteError extends Error {}

/**
 * SITE IDENTITY FOR A CREATE SITE CALL.
 *
 * THE DEFECT THIS REPLACES (Phase 7/8 verifier, measured by execution, not
 * theory): the previous version returned `undefined` for a brief with no
 * `workingName`, and `release:prepare`'s own default then took over —
 * `defaultSiteId(host)`, the HOST SLUG. The shipped Create Site form's ONLY
 * required field is the goal, so the advertised minimum input named every
 * site after its source host: two brief-only creates from one template both
 * resolved to `data/<host>/release-projects/<host>/` and the second
 * RE-PREPARED the first customer's project in place (proven by execution:
 * `reprepared === true`, content lineage replaced).
 *
 * THE RULE NOW: a Create Site call NEVER falls back to the host slug, and a
 * DERIVED identity never resolves onto a release project that already exists.
 *   - `siteId` passed explicitly            -> used verbatim. The caller owns
 *     the identity, so re-preparing that project is a legitimate, reported
 *     outcome (`prepare.reprepared`) and is deliberately NOT disambiguated.
 *   - brief.workingName                     -> its slug.
 *   - otherwise the goal's first words      -> their slug.
 *   - a goal with no ascii-sluggable words  -> `site-<10 hex of sha256(goal)>`,
 *     which is stable for that brief and still never the host.
 * A derived base id that is already taken on disk steps to `-2`, `-3`, … The
 * step is REPORTED (`siteIdSource`, `siteIdBase`, `siteIdDisambiguation`), not
 * silent, so an operator can see that the name they implied was in use.
 */
export type SiteIdSource = "explicit" | "working-name" | "goal" | "brief-hash";

/** Filesystem-safe, lowercase, never empty-string. Same character class as `defaultSiteId`. */
export function slugifySiteId(raw: string): string {
  return raw
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, "-")
    .replace(/-{2,}/g, "-")
    .replace(/^[-.]+|[-.]+$/g, "")
    .slice(0, 48)
    .replace(/[-.]+$/g, "");
}

/** Kept from Phase 8 (callers and suites use it); now just the working-name half. */
export function siteIdFromWorkingName(workingName: string | undefined): string | undefined {
  if (workingName === undefined) return undefined;
  const slug = slugifySiteId(workingName);
  return slug.length > 0 ? slug : undefined;
}

/**
 * The identity a brief implies, with NO host fallback anywhere in it. Pure:
 * it reads no disk and always returns an id, so a nameless brief can never
 * fall through to `release:prepare`'s host-slug default.
 */
export function siteIdFromBrief(brief: ContentBrief): { siteId: string; source: SiteIdSource } {
  const fromName = siteIdFromWorkingName(brief.workingName);
  if (fromName !== undefined) return { siteId: fromName, source: "working-name" };
  const goal = typeof brief.goal === "string" ? brief.goal : "";
  const words = goal
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((word) => word.length > 0)
    .slice(0, 6);
  const fromGoal = slugifySiteId(words.join("-"));
  if (fromGoal.length > 0) return { siteId: fromGoal, source: "goal" };
  // A goal in a non-ascii script slugs to nothing. Hash it rather than reach
  // for the host: still deterministic for this brief, still never a collision
  // with another customer's site.
  return {
    siteId: `site-${createHash("sha256").update(goal).digest("hex").slice(0, 10)}`,
    source: "brief-hash",
  };
}

export interface CreateSiteIdentity {
  siteId: string;
  projectId: string;
  /** Where `release:prepare` will put it — computed with prepare's OWN helper. */
  projectDir: string;
  source: SiteIdSource;
  /** The id before any collision step; equal to `siteId` when nothing was taken. */
  baseSiteId: string;
  /** How many already-existing projects the derived base had to step past (0 normally). */
  disambiguation: number;
  /**
   * True only on the explicit-`siteId` path, where re-preparing the named
   * project IS the operator's request. A derived identity is never allowed to
   * land here — that is the whole point of this function.
   */
  resolvesOntoExistingProject: boolean;
}

/** Does a release project already occupy this identity? Same path helper prepare uses. */
function projectExists(host: string, projectId: string): boolean {
  return existsSync(path.join(releaseProjectDir(host, projectId), RELEASE_PROJECT_FILE));
}

export function resolveCreateSiteIdentity(input: {
  host: string;
  brief: ContentBrief;
  explicitSiteId?: string;
  explicitProjectId?: string;
}): CreateSiteIdentity {
  if (input.explicitSiteId !== undefined) {
    const projectId = input.explicitProjectId ?? projectIdForSite(input.explicitSiteId);
    return {
      siteId: input.explicitSiteId,
      projectId,
      projectDir: releaseProjectDir(input.host, projectId),
      source: "explicit",
      baseSiteId: input.explicitSiteId,
      disambiguation: 0,
      resolvesOntoExistingProject: projectExists(input.host, projectId),
    };
  }
  const derived = siteIdFromBrief(input.brief);
  if (input.explicitProjectId !== undefined) {
    // The caller named the directory itself; honour it exactly, and report
    // whether it is already occupied rather than stepping past it.
    return {
      siteId: derived.siteId,
      projectId: input.explicitProjectId,
      projectDir: releaseProjectDir(input.host, input.explicitProjectId),
      source: derived.source,
      baseSiteId: derived.siteId,
      disambiguation: 0,
      resolvesOntoExistingProject: projectExists(input.host, input.explicitProjectId),
    };
  }
  for (let step = 0; step < 500; step++) {
    const candidate = step === 0 ? derived.siteId : `${derived.siteId}-${step + 1}`;
    const projectId = projectIdForSite(candidate);
    if (!projectExists(input.host, projectId)) {
      return {
        siteId: candidate,
        projectId,
        projectDir: releaseProjectDir(input.host, projectId),
        source: derived.source,
        baseSiteId: derived.siteId,
        disambiguation: step,
        resolvesOntoExistingProject: false,
      };
    }
  }
  throw new CreateSiteError(
    `createSite: 500 projects already exist for the identity "${derived.siteId}" under ${input.host} — ` +
      "give the brief a working name, or pass an explicit siteId",
  );
}

async function resolveOrThrow(
  label: string,
  explicit: string | undefined,
  discover: () => Promise<string | null>,
): Promise<string> {
  if (explicit !== undefined) return explicit;
  const found = await discover();
  if (found === null) {
    throw new CreateSiteError(
      `createSite: no ${label} found for this template — supply it explicitly, or run the ` +
        `${label} pipeline stage for this host/template first`,
    );
  }
  return found;
}

export async function createSite(options: CreateSiteOptions): Promise<CreateSiteResult> {
  const log = options.log ?? ((): void => {});
  const dataRoot = options.dataRoot ?? "data";
  const templateDir = path.dirname(path.resolve(options.templateManifestFile));

  // ---- template unmutated, proof half 1: hash BEFORE anything runs --------
  const templateHashBefore = (await hashDirectory(templateDir)).hash;

  const template = await loadReconTemplate(options.templateManifestFile);
  const host = template.manifest.source.host;
  const templateId = template.manifest.templateId;

  // ---- route scope ----------------------------------------------------------
  const routeScope = selectRouteScope(template);
  log(
    `[create-site] route scope: ${routeScope.counts.included} included, ` +
      `${routeScope.counts.excludedStructureOnly} structure-only excluded, ` +
      `${routeScope.counts.excludedOther} other-excluded (of ${routeScope.counts.total} total)`,
  );
  if (routeScope.includedRoutes.length === 0) {
    throw new CreateSiteError("createSite: route scope selected zero routes — nothing to generate");
  }

  // ---- shared per-host artifacts: explicit wins, else discover, never guess -
  const themeRunDir = await resolveOrThrow("theme-run", options.themeRunDir, () =>
    findMatchingThemeRun(host, templateId, dataRoot),
  );
  const seoPlanRunDir = await resolveOrThrow("seo-plan", options.seoPlanRunDir, () =>
    findMatchingSeoPlanRun(host, templateId, dataRoot),
  );
  const materializationRunDir = await resolveOrThrow(
    "asset-materialization",
    options.materializationRunDir,
    () => newestMaterializationRun(host, dataRoot),
  );

  // ---- page-regions: the ONE lookup (see KNOWN TRAP note above) -------------
  let pageRegionsDir: string | null = null;
  let pageRegionsSource: "explicit" | "discovered" | "none" = "none";
  if (options.pageRegionsDir !== undefined) {
    pageRegionsDir = options.pageRegionsDir;
    pageRegionsSource = "explicit";
  } else {
    const discovered = await findMatchingPageRegionsRun(host, templateId, dataRoot);
    if (discovered !== null) {
      pageRegionsDir = discovered.runDir;
      pageRegionsSource = "discovered";
    }
  }

  // ---- content: ONE BRIEF → FIRST DRAFT (Task 27 §5) -------------------------
  const rawIntent = options.brief.goal;
  if (rawIntent === undefined || rawIntent === "") {
    throw new CreateSiteError(
      "createSite: the brief needs a `goal` — the one thing that cannot be defaulted",
    );
  }
  const prepared = await prepareContentRun({
    templateManifestFile: options.templateManifestFile,
    rawIntent,
    routes: routeScope.includedRoutes,
    brief: options.brief,
    ...(pageRegionsDir !== null
      ? { pageRegionsFile: path.join(pageRegionsDir, "page-regions.json") }
      : {}),
    outputDir: options.contentOutputDir,
  });
  log(
    `[create-site] content packet: ${prepared.units.units.length} unit(s), ` +
      `${prepared.request.batches.length} batch(es)`,
  );
  for (const gap of prepared.briefGaps) {
    log(`[create-site] brief gap ${gap.field} — ${gap.consequence}`);
  }

  const run = await loadContentRun(prepared.runDir);
  let result: ContentGenerationResult;
  let providerName: string;
  if (typeof options.contentProvider === "object") {
    result = await loadManualGenerationResult(options.contentProvider.resultFile);
    providerName = `manual:${path.basename(options.contentProvider.resultFile)}`;
  } else {
    const generator =
      options.contentProvider === "fake" ? new FakeContentGenerator() : new BriefContentGenerator();
    providerName = generator.name;
    const execution = await executeGenerationBatches({
      runId: run.manifest.runId,
      intent: run.intent,
      policy: run.policy,
      unitsFile: run.unitsFile,
      request: run.request,
      generator,
      log,
    });
    result = execution.result;
  }
  const outcome = await ingestGenerationResult(run, result);
  if (!outcome.validation.pass) {
    throw new CreateSiteError(
      `createSite: generated content failed validation — ${outcome.validation.errors.length} error(s): ` +
        outcome.validation.errors.slice(0, 5).map((e) => JSON.stringify(e)).join("; "),
    );
  }
  log(
    `[create-site] content: ${outcome.validation.stats.assignedSlots} assigned slot(s), ` +
      `${outcome.validation.stats.unresolvedSlots} unresolved (needs-input)`,
  );

  // ---- THE FIRST DRAFT, per route -------------------------------------------
  // Written into the run's report/ directory, which the content lineage hash
  // EXCLUDES (see prepare.ts's excluded list) — so summarizing the draft can
  // never change the lineage of the site being built from it.
  const firstDraft = summarizeFirstDraft({
    accounting: outcome.accounting,
    overlay: outcome.overlay,
    changed: outcome.changed,
    structureOnlyRoutes: routeScope.excludedStructureOnlyRoutes,
  });
  const firstDraftFile = path.join(prepared.runDir, "report", "first-draft.json");
  await writeFile(firstDraftFile, JSON.stringify(firstDraft, null, 2) + "\n", "utf8");
  for (const row of firstDraft.rows) {
    log(
      `[create-site] draft ${row.route}: ${row.filledSlots}/${row.inScopeSlots} filled, ` +
        `${row.changedSlots} changed, ${row.unresolvedSlots} needs-input`,
    );
  }
  if (!outcome.consistency.pass) {
    log(
      `[create-site] cross-page review: ${outcome.consistency.counts.errors} error(s) — the draft is written ` +
        "but the pages disagree; see report/consistency.json",
    );
  }

  // ---- production compile ----------------------------------------------------
  const compile = await runProductionCompile({
    host,
    templateRunDir: templateDir,
    contentRunDir: prepared.runDir,
    themeRunDir,
    seoPlanRunDir,
    materializationRunDir,
    log,
  });
  log(`[create-site] production spec: ${compile.specFile}`);

  // ---- register as a NEW, INDEPENDENT release project ------------------------
  // Identity is resolved HERE, immediately before prepare writes, so the
  // "is this project id free?" answer is as fresh as it can be. It is never
  // left to `release:prepare`'s host-slug default — see
  // `resolveCreateSiteIdentity` for the defect that rule exists for.
  const identity = resolveCreateSiteIdentity({
    host,
    brief: options.brief,
    ...(options.siteId !== undefined ? { explicitSiteId: options.siteId } : {}),
    ...(options.projectId !== undefined ? { explicitProjectId: options.projectId } : {}),
  });
  log(
    `[create-site] identity: ${identity.siteId} (source ${identity.source}` +
      (identity.disambiguation > 0
        ? `, base "${identity.baseSiteId}" was already taken — stepped past ${identity.disambiguation} existing project(s)`
        : "") +
      `) -> ${identity.projectDir}`,
  );
  const prepareOptions: PrepareOptions = {
    productionSpecRef: compile.specFile,
    siteId: identity.siteId,
    projectId: identity.projectId,
    ...(options.displayName !== undefined ? { displayName: options.displayName } : {}),
    ...(pageRegionsDir !== null ? { pageRegionsDir } : {}),
    ...(options.register !== undefined ? { register: options.register } : {}),
    ...(options.dataRoot !== undefined ? { registryDataRoot: options.dataRoot } : {}),
    log,
  };
  const prepare = await prepareReleaseProject(prepareOptions);
  log(
    `[create-site] site: ${prepare.project.siteId} (${prepare.projectDir})` +
      (prepare.reprepared
        ? " — RE-PREPARED an existing project at this id; it was not a new, empty site"
        : " — new project"),
  );

  // ---- template unmutated, proof half 2: hash AFTER everything ran ---------
  const templateHashAfter = (await hashDirectory(templateDir)).hash;
  const templateUnmutated = templateHashBefore === templateHashAfter;
  if (!templateUnmutated) {
    log(
      `[create-site] WARNING — template hash changed: ${templateHashBefore} -> ${templateHashAfter}`,
    );
  }

  return {
    routeScope,
    siteId: identity.siteId,
    siteIdSource: identity.source,
    siteIdBase: identity.baseSiteId,
    siteIdDisambiguation: identity.disambiguation,
    templateDir,
    templateHashBefore,
    templateHashAfter,
    templateUnmutated,
    contentRunDir: prepared.runDir,
    themeRunDir,
    seoPlanRunDir,
    materializationRunDir,
    productionSpecFile: compile.specFile,
    productionBuildDir: compile.buildDir,
    pageRegionsDir,
    pageRegionsSource,
    prepare,
    briefGaps: prepared.briefGaps,
    contentAssignedSlots: outcome.validation.stats.assignedSlots,
    contentUnresolvedSlots: outcome.validation.stats.unresolvedSlots,
    contentProvider: providerName,
    firstDraft,
    firstDraftFile,
    consistency: {
      pass: outcome.consistency.pass,
      errors: outcome.consistency.counts.errors,
      warnings: outcome.consistency.counts.warnings,
    },
  };
}
