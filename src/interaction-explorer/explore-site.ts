import { chromium, type Browser } from "playwright";
import { makeRunId } from "../observer/store.js";
import { resolveViewportProfiles } from "../observer/observe-page.js";
import type { ViewportId, ViewportProfile } from "../observer/types.js";
import { executeAction } from "./execute-action.js";
import {
  loadCandidatePage,
  loadInteractionAnalysis,
  type LoadedCandidatePage,
} from "./load-analysis.js";
import {
  planSiteActions,
  selectPlanPages,
  skipReasonCounts,
  skippedByPolicyCount,
} from "./plan-actions.js";
import {
  actionObservationFileRelative,
  explorationRunDir,
  saveExplorationManifest,
  saveInteractionObservation,
  saveInteractionPlan,
} from "./store.js";
import {
  ACTION_STATUS_ORDER,
  AFTER_SETTLE_MS,
  ALLOWED_REQUEST_METHODS,
  DEFAULT_CONCURRENCY,
  DIFF_CATEGORY_ORDER,
  EXCLUDED_GUARD_FLAGS,
  EXECUTED_STATUSES,
  EXPLORER_ENGINE,
  LOAD_SETTLE_MS,
  LOAD_TIMEOUT_MS,
  LOCATOR_STRATEGY_ORDER,
  MAX_ACTIONS_PER_PAGE,
  MAX_ACTIONS_PER_SITE,
  MAX_ACTIONS_PER_VIEWPORT,
  MAX_MUTATION_RECORDS,
  MAX_VALIDATION_PAGES_PER_SITE,
  PLANNER_ENGINE,
  SCHEMA_VERSION,
  type DynamicTargetSummary,
  type UserVisibleTargetSummary,
  type ExplorationActionSummary,
  type ExplorationPageSummary,
  type ExplorationStats,
  type InteractionExploration,
  type InteractionObservation,
  type InteractionPlan,
  type SafetySummary,
} from "./types.js";

/**
 * Site-level orchestration for the Safe Rule-Based Interaction Explorer
 * (Task 11, items 31, 66–69).
 *
 *   interaction-analysis.json
 *     → OFFLINE  page selection → plan → interaction-plan.json
 *     → LIVE     ONE Chromium process
 *                  ├ action 1 : fresh BrowserContext → … → context.close()
 *                  ├ action 2 : fresh BrowserContext → … → context.close()
 *                  └ …
 *     → interaction-exploration.json + pages/<id>/<viewport>/<action>.json
 *
 * **One browser, one context per action** (item 31). The process is shared
 * because launching Chromium per action would dominate the run time for no
 * safety benefit; the CONTEXT is never shared, because that is where cookies,
 * localStorage, sessionStorage and DOM state live (item 32).
 *
 * **`--plan-only` launches nothing.** The offline half is a complete, useful
 * product on its own: it answers "which 3,106 candidates become how many
 * actions, and why?" at zero cost to the site being studied. Running it first
 * against a real site is the recommended workflow (item 94).
 *
 * **Failure isolation** (item 66). An action never throws into the run: every
 * site-caused problem comes back as a status. Only input/plan corruption — the
 * things that would make the whole output meaningless — abort, and they abort
 * before a browser exists.
 */

export interface ExploreSiteOptions {
  /** Path to a Task 10 `interaction-analysis.json`. */
  interactionAnalysisFile: string;
  /** Actions in flight (1–3, default 2). */
  concurrency?: number;
  /** Build and persist the plan without launching a browser. */
  planOnly?: boolean;
  /** Inject a browser (used by the fixture smoke test). */
  browser?: Browser;
  /** Override the run id / directory (used by tests). */
  runId?: string;
  runDir?: string;
  onLog?: (message: string) => void;
  onActionDone?: (
    observation: InteractionObservation,
    done: number,
    total: number,
  ) => void;
}

export interface ExplorationRun {
  runId: string;
  runDir: string;
  plan: InteractionPlan;
  planPath: string;
  exploration: InteractionExploration;
  manifestPath: string;
  /** In-memory observations, in `actionId` order. */
  observations: InteractionObservation[];
}

/**
 * Fixed pool over `items`, dispatching in index order. Results come back in the
 * ORIGINAL order so the manifest never depends on which action finished first
 * (item 69). Same shape the Verifier and multi-observer use.
 */
async function runPool<T, R>(
  items: readonly T[],
  limit: number,
  worker: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let next = 0;
  const runners: Promise<void>[] = [];
  const n = Math.min(limit, items.length);
  for (let w = 0; w < n; w++) {
    runners.push(
      (async () => {
        while (true) {
          const i = next++;
          if (i >= items.length) break;
          results[i] = await worker(items[i], i);
        }
      })(),
    );
  }
  await Promise.all(runners);
  return results;
}

function round4(value: number): number {
  return Math.round(value * 10000) / 10000;
}

/** Non-zero counts over a fixed vocabulary — never Map/insertion order. */
function countBy<T extends string>(
  order: readonly T[],
  values: readonly (T | undefined)[],
): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const key of order) {
    const n = values.filter((v) => v === key).length;
    if (n > 0) counts[key] = n;
  }
  return counts;
}

/**
 * Safety figures (item 105). The three `*Skipped` counts come from the PLAN —
 * they are candidates the planner refused before a browser existed — and the
 * four `*Attempts` counts come from live guard events. Zeros are reported as
 * zeros, never omitted: "no popup was blocked" is a result.
 */
function buildSafetySummary(
  plan: InteractionPlan,
  observations: readonly InteractionObservation[],
): SafetySummary {
  const guardSkips = plan.skipped.filter((s) => s.reason === "guard");
  const withGuard = (name: string): number =>
    guardSkips.filter((s) => (s.guardFlags ?? []).includes(name as never)).length;

  const events = observations.flatMap((o) => o.safetyEvents);
  const blockedMethodCounts: Record<string, number> = {};
  for (const event of events) {
    if (event.type !== "blocked-write-request" || !event.method) continue;
    blockedMethodCounts[event.method] = (blockedMethodCounts[event.method] ?? 0) + 1;
  }
  const sortedMethods: Record<string, number> = {};
  for (const method of Object.keys(blockedMethodCounts).sort()) {
    sortedMethods[method] = blockedMethodCounts[method];
  }

  return {
    formSubmitSkipped: withGuard("form-submit"),
    fileInputSkipped: withGuard("file-input"),
    navigationGuardSkipped:
      withGuard("navigation") + withGuard("external-navigation"),
    navigationAttemptsBlocked: events.filter((e) => e.type === "navigation-blocked")
      .length,
    sameDocumentNavigations: events.filter(
      (e) => e.type === "same-document-navigation",
    ).length,
    popupAttempts: events.filter((e) => e.type === "popup-attempt").length,
    downloadAttempts: events.filter((e) => e.type === "download-attempt").length,
    writeRequestsBlocked: events.filter((e) => e.type === "blocked-write-request")
      .length,
    dialogsDismissed: events.filter((e) => e.type === "dialog-dismissed").length,
    blockedMethodCounts: sortedMethods,
  };
}

/**
 * The Task 10 → Task 11 headline question (items 56, 99): of the control
 * relations that did NOT resolve in the saved static DOM, how many mount their
 * target once the trigger is actually clicked?
 */
function buildDynamicTargetSummary(
  plan: InteractionPlan,
  observations: readonly InteractionObservation[],
): DynamicTargetSummary {
  const unresolvedActionIds = new Set(
    plan.actions
      .filter((a) => a.controls.some((c) => !c.storedResolved))
      .map((a) => a.actionId),
  );

  let executed = 0;
  let resolvedAfter = 0;
  let stillUnresolved = 0;
  let newDescendants = 0;

  for (const observation of observations) {
    if (!unresolvedActionIds.has(observation.actionId)) continue;
    if (!EXECUTED_STATUSES.includes(observation.status)) continue;
    executed++;
    const mounted = (observation.diff?.targetsMounted ?? 0) > 0;
    if (mounted) {
      resolvedAfter++;
      const before = observation.before?.targets ?? [];
      const after = observation.after?.targets ?? [];
      for (let i = 0; i < after.length; i++) {
        if (before[i]?.resolved === false && after[i]?.resolved === true) {
          newDescendants += after[i]?.descendants?.total ?? 0;
        }
      }
    } else {
      stillUnresolved++;
    }
  }

  return {
    plannedUnresolvedTriggers: unresolvedActionIds.size,
    executedUnresolvedTriggers: executed,
    resolvedAfterAction: resolvedAfter,
    stillUnresolved,
    failedBeforeAction: unresolvedActionIds.size - executed,
  newInteractiveDescendants: newDescendants,
  };
}

/** Task 17 §4 — run-level accounting for generic target discovery. */
function buildUserVisibleTargetSummary(
  observations: readonly InteractionObservation[],
): UserVisibleTargetSummary {
  let actionsWithDiscovery = 0;
  let actionsWithDiscoveredTargets = 0;
  let discoveredTargets = 0;
  let withCapturedSubtree = 0;
  let discoverySkipped = 0;
  const kinds: string[] = [];

  for (const observation of observations) {
    const summary = observation.targetDiscovery;
    if (!summary) continue;
    if (summary.skippedReason !== undefined) {
      discoverySkipped++;
      continue;
    }
    actionsWithDiscovery++;
    const targets = observation.discoveredTargets ?? [];
    if (targets.length > 0) actionsWithDiscoveredTargets++;
    discoveredTargets += targets.length;
    for (const target of targets) {
      kinds.push(target.kind);
      if (target.capturedSubtree) withCapturedSubtree++;
    }
  }

  return {
    actionsWithDiscovery,
    actionsWithDiscoveredTargets,
    discoveredTargets,
    byKind: countBy(
      [
        "existing-visibility",
        "existing-with-mounted-content",
        "content-replaced",
        "newly-mounted",
      ] as const,
      kinds,
    ),
    withCapturedSubtree,
    discoverySkipped,
  };
}

/**
 * Build the deterministic plan. No browser, no network, no timestamp — the same
 * `interaction-analysis.json` always yields the same bytes (items 9, 90).
 */
export async function buildInteractionPlan(
  interactionAnalysisFile: string,
  concurrency: number,
  onLog: (message: string) => void = () => {},
): Promise<{ plan: InteractionPlan; pages: LoadedCandidatePage[]; rootUrl: string }> {
  const loaded = await loadInteractionAnalysis(interactionAnalysisFile);
  const selections = selectPlanPages(loaded.analysis);

  const pages: LoadedCandidatePage[] = [];
  for (const selection of selections) {
    onLog(`loading ${selection.pageId} (${selection.selectionReason})`);
    pages.push(await loadCandidatePage(loaded, selection.pageId));
  }

  const planned = planSiteActions(pages);

  const pageEntries = selections.map((selection) => {
    const page = pages.find((p) => p.pageId === selection.pageId);
    const counts = planned.pageActionCounts.get(selection.pageId) ?? {
      desktop: 0,
      mobile: 0,
    };
    return {
      pageId: selection.pageId,
      url: page?.url ?? "",
      role: page?.candidates.role ?? ("representative" as const),
      familyId: page?.candidates.familyId ?? "",
      familyType: page?.candidates.familyType ?? ("singleton" as const),
      selectionReason: selection.selectionReason,
      desktopActions: counts.desktop,
      mobileActions: counts.mobile,
    };
  });

  const plan: InteractionPlan = {
    schemaVersion: SCHEMA_VERSION,
    engine: PLANNER_ENGINE,
    rootUrl: loaded.analysis.rootUrl,
    sourceInteractionAnalysis: loaded.sourceInteractionAnalysisFile,
    sourceSiteObservation: loaded.sourceSiteObservationFile,
    policy: {
      concurrency,
      maxActionsPerViewport: MAX_ACTIONS_PER_VIEWPORT,
      maxActionsPerPage: MAX_ACTIONS_PER_PAGE,
      maxActionsPerSite: MAX_ACTIONS_PER_SITE,
      maxValidationPagesPerSite: MAX_VALIDATION_PAGES_PER_SITE,
      allowedPriorities: ["P1", "P2"],
      excludedGuardFlags: [...EXCLUDED_GUARD_FLAGS],
      allowedRequestMethods: [...ALLOWED_REQUEST_METHODS],
      actionTypes: ["click"],
      safetyPolicy: [
        "fresh-browser-context-per-action",
        "no-user-storage-state",
        "main-frame-navigation-blocked",
        "popup-closed-immediately",
        "download-cancelled",
        "non-get-request-blocked",
        "dialog-dismissed",
        "no-force-click",
        "no-recursive-exploration",
        "no-retry",
      ],
    },
    stats: {
      siteCandidateCount: loaded.analysis.stats.totalCandidateCount,
      sitePageCount: loaded.analysis.pages.length,
      totalCandidates: planned.totalCandidates,
      eligibleCandidates: planned.eligibleCandidates,
      shapeGroups: planned.shapeGroups,
      deduplicatedByShape: planned.deduplicatedByShape,
      plannedActions: planned.actions.length,
      skippedByPolicy: skippedByPolicyCount(planned.skipped),
      skippedByBudget: planned.skipped.filter((s) => s.reason === "budget").length,
      plannedPages: pageEntries.filter(
        (p) => p.desktopActions + p.mobileActions > 0,
      ).length,
      desktopActions: planned.actions.filter((a) => a.viewportId === "desktop").length,
      mobileActions: planned.actions.filter((a) => a.viewportId === "mobile").length,
      skipReasonCounts: skipReasonCounts(planned.skipped),
    },
    pages: pageEntries,
    actions: planned.actions,
    skipped: planned.skipped,
  };

  return { plan, pages, rootUrl: loaded.analysis.rootUrl };
}

/** Explore one site: plan offline, then (unless `planOnly`) execute live. */
export async function exploreSite(
  options: ExploreSiteOptions,
): Promise<ExplorationRun> {
  const log = options.onLog ?? (() => {});
  const concurrency = options.concurrency ?? DEFAULT_CONCURRENCY;
  const planOnly = options.planOnly ?? false;

  const startedAtMs = Date.now();
  const startedAt = new Date(startedAtMs).toISOString();

  const { plan, rootUrl } = await buildInteractionPlan(
    options.interactionAnalysisFile,
    concurrency,
    log,
  );

  const runId = options.runId ?? makeRunId();
  const runDir = options.runDir ?? explorationRunDir(rootUrl, runId);

  const savedPlan = await saveInteractionPlan(runDir, plan);
  log(`plan: ${plan.actions.length} action(s) from ${plan.stats.totalCandidates} candidate(s)`);

  const observations: InteractionObservation[] = [];
  let actionArtifactBytes = 0;
  let viewportProfiles: ViewportProfile[] = [];

  if (!planOnly && plan.actions.length > 0) {
    const browser = options.browser ?? (await chromium.launch());
    const ownsBrowser = !options.browser;
    try {
      viewportProfiles = resolveViewportProfiles(browser);
      const byId = new Map<ViewportId, ViewportProfile>(
        viewportProfiles.map((p) => [p.id, p]),
      );

      let done = 0;
      const results = await runPool(plan.actions, concurrency, async (action) => {
        const profile = byId.get(action.viewportId);
        if (!profile) {
          // Impossible with the Observer's own resolver, and a hard error if it
          // ever happens: acting at an unknown viewport would silently
          // mislabel every measurement.
          throw new Error(`no viewport profile for ${action.viewportId}`);
        }
        const observation = await executeAction({
          browser,
          plan: action,
          profile,
          onLog: log,
        });
        done++;
        options.onActionDone?.(observation, done, plan.actions.length);
        return observation;
      });
      observations.push(...results);
    } finally {
      if (ownsBrowser) await browser.close();
    }

    for (const observation of observations) {
      const saved = await saveInteractionObservation(runDir, observation);
      actionArtifactBytes += saved.bytes;
    }
  } else if (!planOnly) {
    // No actions to run, but the viewport profiles still belong in the config.
    const browser = options.browser ?? (await chromium.launch());
    const ownsBrowser = !options.browser;
    try {
      viewportProfiles = resolveViewportProfiles(browser);
    } finally {
      if (ownsBrowser) await browser.close();
    }
  }

  // --- deterministic ordering, independent of completion order (item 69) ----
  observations.sort((a, b) => (a.actionId < b.actionId ? -1 : a.actionId > b.actionId ? 1 : 0));

  const executed = observations.filter((o) => EXECUTED_STATUSES.includes(o.status));
  const changed = observations.filter((o) => o.status === "changed");
  const byViewport = (viewportId: ViewportId, list: readonly InteractionObservation[]): number =>
    list.filter((o) => o.viewportId === viewportId).length;

  const totalLoadMs = observations.reduce((sum, o) => sum + o.loadMs, 0);
  const totalActionMs = observations.reduce((sum, o) => sum + o.elapsedMs, 0);

  const stats: ExplorationStats = {
    plannedActions: plan.actions.length,
    executedActions: executed.length,
    changedActions: changed.length,
    noChangeActions: observations.filter((o) => o.status === "no-change").length,

    desktopPlanned: plan.stats.desktopActions,
    mobilePlanned: plan.stats.mobileActions,
    desktopExecuted: byViewport("desktop", executed),
    mobileExecuted: byViewport("mobile", executed),
    desktopChanged: byViewport("desktop", changed),
    mobileChanged: byViewport("mobile", changed),

    locatorResolutionRate:
      plan.actions.length > 0
        ? round4(
            observations.filter((o) => o.locatorResolution.status === "resolved").length /
              plan.actions.length,
          )
        : 0,
    changeRate: executed.length > 0 ? round4(changed.length / executed.length) : 0,

    totalLoadMs,
    totalActionMs,
    averageActionMs:
      observations.length > 0 ? Math.round(totalActionMs / observations.length) : 0,
    totalElapsedMs: Date.now() - startedAtMs,
  };

  const pageSummaries: ExplorationPageSummary[] = plan.pages.map((page) => {
    const mine = observations.filter((o) => o.pageId === page.pageId);
    const minesExecuted = mine.filter((o) => EXECUTED_STATUSES.includes(o.status));
    const minesChanged = mine.filter((o) => o.status === "changed");
    return {
      pageId: page.pageId,
      url: page.url,
      role: page.role,
      familyId: page.familyId,
      desktopPlanned: page.desktopActions,
      mobilePlanned: page.mobileActions,
      desktopExecuted: byViewport("desktop", minesExecuted),
      mobileExecuted: byViewport("mobile", minesExecuted),
      desktopChanged: byViewport("desktop", minesChanged),
      mobileChanged: byViewport("mobile", minesChanged),
    };
  });

  const actionSummaries: ExplorationActionSummary[] = observations.map((o) => ({
    actionId: o.actionId,
    pageId: o.pageId,
    viewportId: o.viewportId,
    sourceCandidateId: o.sourceCandidateId,
    priority: o.priority,
    status: o.status,
    locatorStatus: o.locatorResolution.status,
    ...(o.locatorResolution.strategy
      ? { locatorStrategy: o.locatorResolution.strategy }
      : {}),
    changeCount: o.diff?.changes.length ?? 0,
    safetyEventCount: o.safetyEvents.length,
    observationFile: actionObservationFileRelative(o.pageId, o.viewportId, o.actionId),
    elapsedMs: o.elapsedMs,
  }));

  const diffSummary: Record<string, number> = {};
  for (const category of DIFF_CATEGORY_ORDER) {
    let n = 0;
    for (const observation of observations) {
      n += observation.diff?.categoryCounts[category] ?? 0;
    }
    if (n > 0) diffSummary[category] = n;
  }

  const errored = observations.filter(
    (o) => o.status === "action-error" || o.status === "load-error",
  ).length;

  const manifest: InteractionExploration = {
    schemaVersion: SCHEMA_VERSION,
    engine: EXPLORER_ENGINE,
    rootUrl,
    sourceInteractionAnalysis: plan.sourceInteractionAnalysis,
    sourceSiteObservation: plan.sourceSiteObservation,
    startedAt,
    completedAt: new Date().toISOString(),
    status: planOnly
      ? "plan-only"
      : errored > 0
        ? "completed-with-errors"
        : "completed",
    config: {
      concurrency,
      planOnly,
      viewportProfiles,
      loadTimeoutMs: LOAD_TIMEOUT_MS,
      loadSettleMs: LOAD_SETTLE_MS,
      afterSettleMs: AFTER_SETTLE_MS,
      maxMutationRecords: MAX_MUTATION_RECORDS,
      // Item 112: full-page before/after screenshots are OFF by default.
      // Task 09 measured screenshots at 45.7% of all its bytes, and the
      // behavior proof this Task needs is a DOM/state diff, not an image.
      screenshots: false,
    },
    stats,
    pages: pageSummaries,
    actions: actionSummaries,
    actionStatusSummary: countBy(
      ACTION_STATUS_ORDER,
      observations.map((o) => o.status),
    ),
    locatorStatusSummary: countBy(
      ["resolved", "not-found", "ambiguous", "semantic-mismatch"] as const,
      observations.map((o) => o.locatorResolution.status),
    ),
    locatorStrategySummary: countBy(
      LOCATOR_STRATEGY_ORDER,
      observations.map((o) => o.locatorResolution.strategy),
    ),
    diffSummary,
    safetySummary: buildSafetySummary(plan, observations),
    dynamicTargetSummary: buildDynamicTargetSummary(plan, observations),
    userVisibleTargetSummary: buildUserVisibleTargetSummary(observations),
    storageSummary: {
      planBytes: savedPlan.bytes,
      manifestBytes: 0,
      actionArtifactBytes,
      totalBytes: savedPlan.bytes + actionArtifactBytes,
      averageBytesPerAction:
        observations.length > 0
          ? Math.round(actionArtifactBytes / observations.length)
          : 0,
    },
    mutationTruncatedCount: observations.filter(
      (o) => o.mutationSummary?.truncated === true,
    ).length,
  };

  const saved = await saveExplorationManifest(runDir, manifest);

  return {
    runId,
    runDir,
    plan,
    planPath: savedPlan.filePath,
    exploration: saved.exploration,
    manifestPath: saved.manifestPath,
    observations,
  };
}
