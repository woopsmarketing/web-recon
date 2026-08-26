import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { DESKTOP_PROFILE, MOBILE_PROFILE, type ViewportId } from "../src/observer/types.js";
import type {
  InteractionCapability,
  InteractionPriority,
} from "../src/interaction-detector/types.js";
import {
  ACTION_STATUS_ORDER,
  DIFF_CATEGORY_ORDER,
  EXECUTED_STATUSES,
  SCHEMA_VERSION as EXPLORER_SCHEMA_VERSION,
  EXPLORER_ENGINE,
  PLANNER_ENGINE,
  type ActionStatus,
  type ContainerInventory,
  type InteractionActionPlan,
  type InteractionExploration,
  type InteractionObservation,
  type InteractionPlan,
  type InteractionStateSnapshot,
  type LiveElementState,
  type LiveTargetState,
  type MutationSummary,
  type SafetyEvent,
  type StatefulContainer,
} from "../src/interaction-explorer/types.js";
import { diffSnapshots } from "../src/interaction-explorer/diff-state.js";
import {
  assertRegistryIntegrity,
  buildActionFacts,
  buildInteractionModels,
  FakeUnknownInteractionAnalyzer,
  InteractionPatternInputError,
  InteractionPatternsArtifactSchema,
  loadExploration,
  matchPattern,
  resolveAnalyzer,
  runAiFallback,
  saveAiAnalysis,
  saveInteractionPatterns,
  saveUnknownInteractions,
  UnknownInteractionsArtifactSchema,
  type BuiltModels,
  type PatternRule,
} from "../src/interaction-patterns/index.js";

/**
 * Local deterministic fixture test for Interaction Pattern Modeling (Task 12,
 * items 78–98).
 *
 * Completely offline: **no HTTP server, no Playwright, no network, no browser,
 * no external AI**. Task 12 is offline deterministic processing, so the fixture
 * only has to produce realistic Task 11 artifacts — and it produces them with
 * Task 11's OWN code: every before/after pair is run through the real
 * `diffSnapshots()`, and the resulting status is Task 11's own
 * `meaningfulChange ? changed : no-change` rule. Nothing hand-writes a diff, so
 * a fixture cannot assert a transition Task 11 would never have recorded.
 *
 * The whole run then goes to disk and back through the real
 * `loadExploration()`, so the schema validation, the cross-file invariants and
 * the artifact round-trip are all exercised on the way.
 *
 * The cases are the ones that are easy to get wrong:
 *  - a tab whose `aria-controls` is self-referential and then drifts, which must
 *    still be a tab
 *  - one action that satisfies BOTH the menu and the disclosure rule, which must
 *    produce exactly one pattern
 *  - six different causes of "nothing happened", which must not collapse
 *  - a confident, articulate, wrong AI answer, which must promote nothing
 */

// ---------------------------------------------------------------------------
// Tiny check harness (same shape as the other smoke tests)
// ---------------------------------------------------------------------------

let checks = 0;
let failures = 0;
function check(name: string, ok: boolean | undefined, detail = ""): void {
  checks++;
  if (ok) {
    console.log(`  PASS  ${name}`);
  } else {
    failures++;
    console.log(`  FAIL  ${name}${detail ? ` — ${detail}` : ""}`);
  }
}

// ---------------------------------------------------------------------------
// Task 11 artifact builders
// ---------------------------------------------------------------------------

interface ElementSpec {
  exists?: boolean;
  tagName?: string;
  role?: string;
  text?: string;
  visible?: boolean;
  attributes?: Record<string, string>;
  state?: Record<string, boolean>;
}

function element(spec: ElementSpec): LiveElementState {
  if (spec.exists === false) return { exists: false };
  return {
    exists: true,
    ...(spec.tagName !== undefined ? { tagName: spec.tagName } : {}),
    ...(spec.role !== undefined ? { role: spec.role } : {}),
    ...(spec.text !== undefined ? { text: spec.text } : {}),
    ...(spec.visible !== undefined ? { visible: spec.visible } : {}),
    ...(spec.attributes ? { attributes: spec.attributes } : {}),
    ...(spec.state ? { state: spec.state } : {}),
  };
}

interface TargetSpec {
  relation: "aria-controls" | "popovertarget" | "details";
  targetDomId?: string;
  resolved: boolean;
  element?: ElementSpec;
  descendants?: {
    total: number;
    optionCount?: number;
    menuitemCount?: number;
    tabCount?: number;
    roles?: string[];
  };
}

function target(spec: TargetSpec): LiveTargetState {
  return {
    relation: spec.relation,
    ...(spec.targetDomId !== undefined ? { targetDomId: spec.targetDomId } : {}),
    resolved: spec.resolved,
    element: spec.resolved ? element(spec.element ?? {}) : { exists: false },
    ...(spec.resolved && spec.descendants
      ? {
          descendants: {
            total: spec.descendants.total,
            buttonCount: 0,
            linkCount: 0,
            inputCount: 0,
            menuitemCount: spec.descendants.menuitemCount ?? 0,
            optionCount: spec.descendants.optionCount ?? 0,
            tabCount: spec.descendants.tabCount ?? 0,
            statefulCount: spec.descendants.total,
            samples: (spec.descendants.roles ?? []).map((role) => ({
              tagName: "div",
              role,
            })),
            truncated: false,
          },
        }
      : {}),
  };
}

function containers(entries: StatefulContainer[]): ContainerInventory {
  return { containers: entries, totalCount: entries.length, truncated: false };
}

function snapshot(
  url: string,
  candidate: LiveElementState,
  targets: LiveTargetState[],
  inventory: ContainerInventory,
): InteractionStateSnapshot {
  return { url, candidate, targets, containers: inventory };
}

interface MutationSpec {
  attributeNameCounts?: Record<string, number>;
  addedNodeCount?: number;
  removedNodeCount?: number;
}

function mutations(spec: MutationSpec = {}): MutationSummary {
  const counts = spec.attributeNameCounts ?? {};
  const attributeMutationCount = Object.values(counts).reduce((a, b) => a + b, 0);
  const added = spec.addedNodeCount ?? 0;
  const removed = spec.removedNodeCount ?? 0;
  const childList = added + removed > 0 ? 1 : 0;
  return {
    recordCount: attributeMutationCount + childList,
    observedCount: attributeMutationCount + childList,
    truncated: false,
    attributeMutationCount,
    childListMutationCount: childList,
    addedNodeCount: added,
    removedNodeCount: removed,
    attributeNameCounts: counts,
    records: [],
  };
}

interface ActionSpec {
  name: string;
  pageId: string;
  url?: string;
  viewport?: ViewportId;
  tagName: string;
  role?: string;
  inputType?: string;
  text?: string;
  ariaLabel?: string;
  priority?: InteractionPriority;
  capabilities?: InteractionCapability[];
  before: { candidate: ElementSpec; targets?: TargetSpec[]; containers?: StatefulContainer[]; url?: string };
  after: { candidate: ElementSpec; targets?: TargetSpec[]; containers?: StatefulContainer[]; url?: string };
  mutation?: MutationSpec;
  safetyEvents?: SafetyEvent[];
  candidateReResolved?: boolean;
  /** Force a non-executed status (locator/actionability failures). */
  statusOverride?: ActionStatus;
}

interface BuiltAction {
  spec: ActionSpec;
  plan: InteractionActionPlan;
  observation: InteractionObservation;
  relativeFile: string;
}

const FIXTURE_ROOT = "https://fixture.test";

function buildAction(spec: ActionSpec, index: number): BuiltAction {
  const actionId = `ia${String(index + 1).padStart(6, "0")}`;
  const candidateId = `ic${String(index + 1).padStart(6, "0")}`;
  const elementId = `e${String(index + 1).padStart(6, "0")}`;
  const viewport = spec.viewport ?? "desktop";
  const url = spec.url ?? `${FIXTURE_ROOT}/${spec.pageId}`;
  const capabilities = spec.capabilities ?? ["click"];

  const before = snapshot(
    spec.before.url ?? url,
    element(spec.before.candidate),
    (spec.before.targets ?? []).map(target),
    containers(spec.before.containers ?? []),
  );
  const after = snapshot(
    spec.after.url ?? url,
    element(spec.after.candidate),
    (spec.after.targets ?? []).map(target),
    containers(spec.after.containers ?? []),
  );

  const diff = diffSnapshots(before, after, {
    ...(spec.candidateReResolved ? { candidateReResolved: true } : {}),
  });
  const status: ActionStatus =
    spec.statusOverride ?? (diff.meaningfulChange ? "changed" : "no-change");
  const executed = EXECUTED_STATUSES.includes(status);

  const controls = (spec.before.targets ?? []).map((t) => ({
    relation: t.relation,
    ...(t.targetDomId !== undefined ? { targetDomId: t.targetDomId } : {}),
    storedResolved: t.resolved,
  }));

  const locatorDescriptor = {
    tagName: spec.tagName,
    ...(spec.role !== undefined ? { role: spec.role } : {}),
    ...(spec.inputType !== undefined ? { inputType: spec.inputType } : {}),
    ...(spec.ariaLabel !== undefined ? { ariaLabel: spec.ariaLabel } : {}),
    ...(spec.text !== undefined ? { text: spec.text } : {}),
    ariaState: {},
    ancestors: [],
    siblingIndex: 0,
    siblingCount: 1,
    structuralPath: `body>${spec.tagName}:nth-of-type(1)`,
    hasStrongSemantics: spec.ariaLabel !== undefined || spec.text !== undefined,
  };

  const plan: InteractionActionPlan = {
    actionId,
    pageId: spec.pageId,
    url,
    pageRole: "representative",
    familyId: "f000001",
    familyType: "singleton",
    viewportId: viewport,
    sourceCandidateId: candidateId,
    sourceElementId: elementId,
    sourceInteractionCandidatesFile: `pages/${spec.pageId}/interaction-candidates.json`,
    priority: spec.priority ?? "P1",
    capabilities,
    guardFlags: [],
    actionType: "click",
    planReason: `fixture: ${spec.name}`,
    shapeKey: `${spec.name}`,
    shapeMemberCount: 1,
    locatorDescriptor,
    controls,
    storedInitialState: {
      effectiveVisible: true,
      disabled: false,
      readonly: false,
      initiallyOperable: true,
    },
  };

  const relativeFile = path.posix.join("pages", spec.pageId, viewport, `${actionId}.json`);

  const observation: InteractionObservation = {
    schemaVersion: EXPLORER_SCHEMA_VERSION,
    engine: EXPLORER_ENGINE,
    actionId,
    pageId: spec.pageId,
    url,
    viewportId: viewport,
    viewportProfile: viewport === "desktop" ? DESKTOP_PROFILE : MOBILE_PROFILE,
    sourceCandidateId: candidateId,
    sourceElementId: elementId,
    sourcePageId: spec.pageId,
    sourceViewport: viewport,
    sourceInteractionCandidatesFile: plan.sourceInteractionCandidatesFile,
    priority: plan.priority,
    capabilities,
    planReason: plan.planReason,
    shapeKey: plan.shapeKey,
    locatorResolution: {
      status: "resolved",
      strategy: "semantic-exact",
      matchCount: 1,
      attempts: [{ strategy: "semantic-exact", matchCount: 1, verified: true }],
      locatorDescriptor,
    },
    action: { type: "click", attempted: executed || status === "actionability-error" },
    ...(executed || status === "actionability-error" ? { before } : {}),
    ...(executed ? { after, diff } : {}),
    mutationSummary: mutations(spec.mutation),
    safetyEvents: spec.safetyEvents ?? [],
    status,
    ...(status === "actionability-error"
      ? {
          error: {
            name: "TimeoutError",
            message: "elementHandle.click: Timeout 10000ms exceeded",
            phase: "action" as const,
          },
        }
      : {}),
    startedAt: "2026-08-13T00:00:00.000Z",
    completedAt: "2026-08-13T00:00:01.000Z",
    elapsedMs: 1000,
    loadMs: 800,
  };

  return { spec, plan, observation, relativeFile };
}

function countBy<T>(items: readonly T[], key: (item: T) => string): Record<string, number> {
  const out: Record<string, number> = {};
  for (const item of items) {
    const k = key(item);
    out[k] = (out[k] ?? 0) + 1;
  }
  return out;
}

/** Write a complete, schema-valid Task 11 run to disk. */
async function writeFixtureRun(
  runDir: string,
  specs: ActionSpec[],
  options: { reverseActionOrder?: boolean } = {},
): Promise<{ built: BuiltAction[] }> {
  const built = specs.map(buildAction);
  const pageIds = [...new Set(built.map((b) => b.plan.pageId))].sort();

  const plan: InteractionPlan = {
    schemaVersion: EXPLORER_SCHEMA_VERSION,
    engine: PLANNER_ENGINE,
    rootUrl: FIXTURE_ROOT,
    sourceInteractionAnalysis: "interaction-analysis.json",
    sourceSiteObservation: "site-observation.json",
    policy: {
      concurrency: 2,
      maxActionsPerViewport: 8,
      maxActionsPerPage: 16,
      maxActionsPerSite: 80,
      maxValidationPagesPerSite: 2,
      allowedPriorities: ["P1", "P2"],
      excludedGuardFlags: [],
      allowedRequestMethods: ["GET"],
      actionTypes: ["click"],
      safetyPolicy: ["fixture"],
    },
    stats: {
      siteCandidateCount: built.length,
      sitePageCount: pageIds.length,
      totalCandidates: built.length,
      eligibleCandidates: built.length,
      shapeGroups: built.length,
      deduplicatedByShape: 0,
      plannedActions: built.length,
      skippedByPolicy: 0,
      skippedByBudget: 0,
      plannedPages: pageIds.length,
      desktopActions: built.filter((b) => b.plan.viewportId === "desktop").length,
      mobileActions: built.filter((b) => b.plan.viewportId === "mobile").length,
      skipReasonCounts: {},
    },
    pages: pageIds.map((pageId) => ({
      pageId,
      url: `${FIXTURE_ROOT}/${pageId}`,
      role: "representative" as const,
      familyId: "f000001",
      familyType: "singleton" as const,
      selectionReason: "representative",
      desktopActions: built.filter(
        (b) => b.plan.pageId === pageId && b.plan.viewportId === "desktop",
      ).length,
      mobileActions: built.filter(
        (b) => b.plan.pageId === pageId && b.plan.viewportId === "mobile",
      ).length,
    })),
    actions: built.map((b) => b.plan),
    skipped: [],
  };

  const executed = built.filter((b) => EXECUTED_STATUSES.includes(b.observation.status));
  const changed = built.filter((b) => b.observation.status === "changed");
  const diffCounts: Record<string, number> = {};
  for (const b of built) {
    for (const [category, n] of Object.entries(b.observation.diff?.categoryCounts ?? {})) {
      diffCounts[category] = (diffCounts[category] ?? 0) + n;
    }
  }

  const actionSummaries = built.map((b) => ({
    actionId: b.observation.actionId,
    pageId: b.observation.pageId,
    viewportId: b.observation.viewportId,
    sourceCandidateId: b.observation.sourceCandidateId,
    priority: b.observation.priority,
    status: b.observation.status,
    locatorStatus: b.observation.locatorResolution.status,
    ...(b.observation.locatorResolution.strategy !== undefined
      ? { locatorStrategy: b.observation.locatorResolution.strategy }
      : {}),
    changeCount: b.observation.diff?.changes.length ?? 0,
    safetyEventCount: b.observation.safetyEvents.length,
    observationFile: b.relativeFile,
    elapsedMs: b.observation.elapsedMs,
  }));
  if (options.reverseActionOrder) actionSummaries.reverse();

  const manifest: InteractionExploration = {
    schemaVersion: EXPLORER_SCHEMA_VERSION,
    engine: EXPLORER_ENGINE,
    rootUrl: FIXTURE_ROOT,
    sourceInteractionAnalysis: "interaction-analysis.json",
    sourceSiteObservation: "site-observation.json",
    startedAt: "2026-08-13T00:00:00.000Z",
    completedAt: "2026-08-13T00:01:00.000Z",
    status: "completed",
    config: {
      concurrency: 2,
      planOnly: false,
      viewportProfiles: [DESKTOP_PROFILE, MOBILE_PROFILE],
      loadTimeoutMs: 30000,
      loadSettleMs: 1000,
      afterSettleMs: 600,
      maxMutationRecords: 500,
      screenshots: false,
    },
    stats: {
      plannedActions: built.length,
      executedActions: executed.length,
      changedActions: changed.length,
      noChangeActions: built.filter((b) => b.observation.status === "no-change").length,
      desktopPlanned: plan.stats.desktopActions,
      mobilePlanned: plan.stats.mobileActions,
      desktopExecuted: executed.filter((b) => b.plan.viewportId === "desktop").length,
      mobileExecuted: executed.filter((b) => b.plan.viewportId === "mobile").length,
      desktopChanged: changed.filter((b) => b.plan.viewportId === "desktop").length,
      mobileChanged: changed.filter((b) => b.plan.viewportId === "mobile").length,
      locatorResolutionRate: 1,
      changeRate: executed.length ? Number((changed.length / executed.length).toFixed(4)) : 0,
      totalLoadMs: built.length * 800,
      totalActionMs: built.length * 1000,
      averageActionMs: 1000,
      totalElapsedMs: built.length * 1000,
    },
    pages: pageIds.map((pageId) => ({
      pageId,
      url: `${FIXTURE_ROOT}/${pageId}`,
      role: "representative" as const,
      familyId: "f000001",
      desktopPlanned: plan.pages.find((p) => p.pageId === pageId)!.desktopActions,
      mobilePlanned: plan.pages.find((p) => p.pageId === pageId)!.mobileActions,
      desktopExecuted: executed.filter(
        (b) => b.plan.pageId === pageId && b.plan.viewportId === "desktop",
      ).length,
      mobileExecuted: executed.filter(
        (b) => b.plan.pageId === pageId && b.plan.viewportId === "mobile",
      ).length,
      desktopChanged: changed.filter(
        (b) => b.plan.pageId === pageId && b.plan.viewportId === "desktop",
      ).length,
      mobileChanged: changed.filter(
        (b) => b.plan.pageId === pageId && b.plan.viewportId === "mobile",
      ).length,
    })),
    actions: actionSummaries,
    actionStatusSummary: countBy(built, (b) => b.observation.status),
    locatorStatusSummary: countBy(built, () => "resolved"),
    locatorStrategySummary: countBy(built, () => "semantic-exact"),
    diffSummary: diffCounts,
    safetySummary: {
      formSubmitSkipped: 0,
      fileInputSkipped: 0,
      navigationGuardSkipped: 0,
      navigationAttemptsBlocked: built.filter((b) =>
        b.observation.safetyEvents.some((e) => e.type === "navigation-blocked"),
      ).length,
      sameDocumentNavigations: built.filter((b) =>
        b.observation.safetyEvents.some((e) => e.type === "same-document-navigation"),
      ).length,
      popupAttempts: 0,
      downloadAttempts: 0,
      writeRequestsBlocked: 0,
      dialogsDismissed: 0,
      blockedMethodCounts: {},
    },
    dynamicTargetSummary: {
      plannedUnresolvedTriggers: 0,
      executedUnresolvedTriggers: 0,
      resolvedAfterAction: 0,
      stillUnresolved: 0,
      failedBeforeAction: 0,
      newInteractiveDescendants: 0,
    },
    storageSummary: {
      planBytes: 0,
      manifestBytes: 0,
      actionArtifactBytes: 0,
      totalBytes: 0,
      averageBytesPerAction: 0,
    },
    mutationTruncatedCount: 0,
  };

  await mkdir(runDir, { recursive: true });
  await writeFile(
    path.join(runDir, "interaction-plan.json"),
    JSON.stringify(plan, null, 2) + "\n",
    "utf8",
  );
  await writeFile(
    path.join(runDir, "interaction-exploration.json"),
    JSON.stringify(manifest, null, 2) + "\n",
    "utf8",
  );
  for (const b of built) {
    const file = path.join(runDir, b.relativeFile);
    await mkdir(path.dirname(file), { recursive: true });
    await writeFile(file, JSON.stringify(b.observation, null, 2) + "\n", "utf8");
  }

  return { built };
}

// ---------------------------------------------------------------------------
// The fixture corpus
// ---------------------------------------------------------------------------

const OPEN_CONTAINER: StatefulContainer = {
  key: "details||",
  tagName: "details",
  visible: true,
  open: true,
};
const CLOSED_CONTAINER: StatefulContainer = { ...OPEN_CONTAINER, open: false };

const SPECS: ActionSpec[] = [
  // §79 native disclosure -----------------------------------------------------
  {
    name: "native-details",
    pageId: "p000001",
    tagName: "summary",
    text: "Details",
    capabilities: ["click", "state-toggle", "disclosure-trigger"],
    before: {
      candidate: { tagName: "summary", visible: true, attributes: {} },
      targets: [
        { relation: "details", resolved: true, element: { tagName: "details", visible: true, state: { open: false } } },
      ],
      containers: [CLOSED_CONTAINER],
    },
    after: {
      candidate: { tagName: "summary", visible: true, attributes: {} },
      targets: [
        { relation: "details", resolved: true, element: { tagName: "details", visible: true, state: { open: true } } },
      ],
      containers: [OPEN_CONTAINER],
    },
    mutation: { attributeNameCounts: { open: 1 } },
  },

  // §80 ARIA disclosure with a target that becomes visible ---------------------
  {
    name: "aria-disclosure",
    pageId: "p000001",
    tagName: "button",
    ariaLabel: "Show more",
    capabilities: ["click", "state-toggle", "disclosure-trigger"],
    before: {
      candidate: {
        tagName: "button",
        visible: true,
        attributes: { "aria-expanded": "false", "aria-controls": "panel-1" },
      },
      targets: [
        { relation: "aria-controls", targetDomId: "panel-1", resolved: true, element: { tagName: "div", visible: false } },
      ],
    },
    after: {
      candidate: {
        tagName: "button",
        visible: true,
        attributes: { "aria-expanded": "true", "aria-controls": "panel-1" },
      },
      targets: [
        { relation: "aria-controls", targetDomId: "panel-1", resolved: true, element: { tagName: "div", visible: true } },
      ],
    },
    mutation: { attributeNameCounts: { "aria-expanded": 1 } },
  },

  // §15/§75 ARIA disclosure with NO declared target ----------------------------
  {
    name: "aria-disclosure-no-target",
    pageId: "p000001",
    viewport: "mobile",
    tagName: "button",
    ariaLabel: "Menu",
    capabilities: ["click", "state-toggle", "disclosure-trigger"],
    before: { candidate: { tagName: "button", visible: true, attributes: { "aria-expanded": "false" } } },
    after: { candidate: { tagName: "button", visible: true, attributes: { "aria-expanded": "true" } } },
    mutation: { attributeNameCounts: { "aria-expanded": 1, class: 1 } },
  },

  // §81 tab --------------------------------------------------------------------
  {
    name: "tab",
    pageId: "p000002",
    tagName: "button",
    role: "tab",
    text: "npm",
    capabilities: ["click", "state-toggle", "tab-trigger"],
    before: {
      candidate: {
        tagName: "button",
        role: "tab",
        visible: true,
        attributes: { "aria-selected": "false", "aria-controls": "panel-npm", role: "tab" },
      },
      targets: [
        { relation: "aria-controls", targetDomId: "panel-npm", resolved: true, element: { tagName: "div", role: "tabpanel", visible: false } },
      ],
    },
    after: {
      candidate: {
        tagName: "button",
        role: "tab",
        visible: true,
        attributes: { "aria-selected": "true", "aria-controls": "panel-npm", role: "tab" },
      },
      targets: [
        { relation: "aria-controls", targetDomId: "panel-npm", resolved: true, element: { tagName: "div", role: "tabpanel", visible: true } },
      ],
    },
    mutation: { attributeNameCounts: { "aria-selected": 1 } },
  },

  // §82 tab whose aria-controls is self-referential and then drifts -------------
  {
    name: "tab-broken-controls",
    pageId: "p000002",
    viewport: "mobile",
    tagName: "button",
    role: "tab",
    text: "pnpm",
    capabilities: ["click", "state-toggle", "tab-trigger"],
    before: {
      candidate: {
        tagName: "button",
        role: "tab",
        visible: true,
        attributes: { "aria-selected": "false", "aria-controls": "_R_1a_", role: "tab" },
      },
      targets: [
        // The id points at the tab itself — the measured nextjs.org shape.
        { relation: "aria-controls", targetDomId: "_R_1a_", resolved: true, element: { tagName: "button", role: "tab", visible: true } },
      ],
    },
    after: {
      candidate: {
        tagName: "button",
        role: "tab",
        visible: true,
        attributes: { "aria-selected": "true", "aria-controls": "_r_g_", role: "tab" },
      },
      targets: [{ relation: "aria-controls", targetDomId: "_R_1a_", resolved: false }],
    },
    candidateReResolved: true,
    mutation: { attributeNameCounts: { "aria-selected": 1 } },
  },

  // §83 menu that mounts on open ------------------------------------------------
  {
    name: "menu-dynamic-mount",
    pageId: "p000003",
    tagName: "button",
    ariaLabel: "Open menu",
    capabilities: ["click", "state-toggle", "menu-trigger"],
    before: {
      candidate: {
        tagName: "button",
        visible: true,
        attributes: { "aria-expanded": "false", "aria-haspopup": "menu", "aria-controls": "menu-1" },
      },
      targets: [{ relation: "aria-controls", targetDomId: "menu-1", resolved: false }],
    },
    after: {
      candidate: {
        tagName: "button",
        visible: true,
        attributes: { "aria-expanded": "true", "aria-haspopup": "menu", "aria-controls": "menu-1" },
      },
      targets: [
        {
          relation: "aria-controls",
          targetDomId: "menu-1",
          resolved: true,
          element: { tagName: "div", role: "menu", visible: true },
          descendants: { total: 3, menuitemCount: 3, roles: ["menuitem"] },
        },
      ],
    },
    mutation: { attributeNameCounts: { "aria-expanded": 1 }, addedNodeCount: 4 },
  },

  // §94 specificity: disclosure AND menu both match; menu must win, once --------
  {
    name: "specificity-menu-over-disclosure",
    pageId: "p000003",
    viewport: "mobile",
    tagName: "button",
    ariaLabel: "Choose",
    capabilities: ["click", "state-toggle", "disclosure-trigger", "menu-trigger"],
    before: {
      candidate: {
        tagName: "button",
        visible: true,
        attributes: { "aria-expanded": "false", "aria-haspopup": "menu", "aria-controls": "menu-2" },
      },
      targets: [{ relation: "aria-controls", targetDomId: "menu-2", resolved: true, element: { tagName: "div", role: "menu", visible: false } }],
    },
    after: {
      candidate: {
        tagName: "button",
        visible: true,
        attributes: { "aria-expanded": "true", "aria-haspopup": "menu", "aria-controls": "menu-2" },
      },
      targets: [
        {
          relation: "aria-controls",
          targetDomId: "menu-2",
          resolved: true,
          element: { tagName: "div", role: "menu", visible: true },
          descendants: { total: 2, menuitemCount: 2, roles: ["menuitem"] },
        },
      ],
    },
    mutation: { attributeNameCounts: { "aria-expanded": 1 } },
  },

  // A combobox with NO aria-haspopup, opening a role=listbox (the nextjs shape) --
  {
    name: "menu-target-role-only",
    pageId: "p000003",
    tagName: "button",
    role: "combobox",
    ariaLabel: "Open directory select",
    capabilities: ["click", "state-toggle", "disclosure-trigger", "select", "open-options"],
    before: {
      candidate: {
        tagName: "button",
        role: "combobox",
        visible: true,
        attributes: { "aria-expanded": "false", "aria-controls": "radix-1", role: "combobox" },
      },
      targets: [{ relation: "aria-controls", targetDomId: "radix-1", resolved: false }],
    },
    after: {
      candidate: {
        tagName: "button",
        role: "combobox",
        visible: true,
        attributes: { "aria-expanded": "true", "aria-controls": "radix-1", role: "combobox" },
      },
      targets: [
        {
          relation: "aria-controls",
          targetDomId: "radix-1",
          resolved: true,
          element: { tagName: "div", role: "listbox", visible: true },
          descendants: { total: 2, optionCount: 2, roles: ["option"] },
        },
      ],
    },
    mutation: { attributeNameCounts: { "aria-expanded": 1 }, addedNodeCount: 3 },
  },

  // §84 dialog ------------------------------------------------------------------
  {
    name: "dialog",
    pageId: "p000004",
    tagName: "button",
    ariaLabel: "Open settings",
    capabilities: ["click", "dialog-trigger"],
    before: {
      candidate: { tagName: "button", visible: true, attributes: { "aria-haspopup": "dialog", "aria-controls": "dlg-1" } },
      targets: [{ relation: "aria-controls", targetDomId: "dlg-1", resolved: false }],
    },
    after: {
      candidate: { tagName: "button", visible: true, attributes: { "aria-haspopup": "dialog", "aria-controls": "dlg-1" } },
      targets: [
        {
          relation: "aria-controls",
          targetDomId: "dlg-1",
          resolved: true,
          element: { tagName: "div", role: "dialog", visible: true },
          descendants: { total: 2, roles: ["button"] },
        },
      ],
    },
    mutation: { addedNodeCount: 5 },
  },

  // §85 checkbox ----------------------------------------------------------------
  {
    name: "checkbox",
    pageId: "p000004",
    tagName: "input",
    inputType: "checkbox",
    ariaLabel: "Agree",
    priority: "P2",
    capabilities: ["click", "toggle"],
    before: { candidate: { tagName: "input", visible: true, state: { checked: false } } },
    after: { candidate: { tagName: "input", visible: true, state: { checked: true } } },
    mutation: { attributeNameCounts: { checked: 1 } },
  },

  // toggle: aria-pressed ---------------------------------------------------------
  {
    name: "toggle-pressed",
    pageId: "p000004",
    viewport: "mobile",
    tagName: "button",
    ariaLabel: "Mute",
    capabilities: ["click", "state-toggle", "toggle"],
    before: { candidate: { tagName: "button", visible: true, attributes: { "aria-pressed": "false" } } },
    after: { candidate: { tagName: "button", visible: true, attributes: { "aria-pressed": "true" } } },
    mutation: { attributeNameCounts: { "aria-pressed": 1 } },
  },

  // toggle: role=switch ----------------------------------------------------------
  {
    name: "toggle-switch",
    pageId: "p000004",
    viewport: "mobile",
    tagName: "button",
    role: "switch",
    ariaLabel: "Dark mode",
    capabilities: ["click", "state-toggle", "toggle"],
    before: { candidate: { tagName: "button", role: "switch", visible: true, attributes: { "aria-checked": "false", role: "switch" } } },
    after: { candidate: { tagName: "button", role: "switch", visible: true, attributes: { "aria-checked": "true", role: "switch" } } },
    mutation: { attributeNameCounts: { "aria-checked": 1 } },
  },

  // §86 dismiss -----------------------------------------------------------------
  {
    name: "dismiss",
    pageId: "p000005",
    tagName: "button",
    ariaLabel: "Close",
    priority: "P2",
    capabilities: ["click"],
    before: { candidate: { tagName: "button", visible: true, attributes: {} } },
    after: { candidate: { exists: false } },
    mutation: { removedNodeCount: 1 },
  },

  // generic state toggle: a stateful ARIA flip no specific rule owns --------------
  {
    name: "generic-state-toggle",
    pageId: "p000005",
    tagName: "div",
    role: "gridcell",
    text: "Cell",
    capabilities: ["click", "state-toggle"],
    before: { candidate: { tagName: "div", role: "gridcell", visible: true, attributes: { "aria-selected": "false", role: "gridcell" } } },
    after: { candidate: { tagName: "div", role: "gridcell", visible: true, attributes: { "aria-selected": "true", role: "gridcell" } } },
    mutation: { attributeNameCounts: { "aria-selected": 1 } },
  },

  // §87 url change ---------------------------------------------------------------
  {
    name: "url-change",
    pageId: "p000006",
    url: `${FIXTURE_ROOT}/p000006`,
    tagName: "button",
    text: "Pricing",
    priority: "P2",
    capabilities: ["click"],
    before: {
      url: `${FIXTURE_ROOT}/p000006`,
      candidate: { tagName: "button", visible: true, attributes: { "aria-expanded": "false" } },
      containers: [{ key: "div||a", tagName: "div", visible: true }],
    },
    after: {
      url: `${FIXTURE_ROOT}/pricing`,
      candidate: { tagName: "button", visible: true, attributes: { "aria-expanded": "true" } },
      containers: [{ key: "div||b", tagName: "div", visible: true }],
    },
    mutation: { attributeNameCounts: { class: 4 }, addedNodeCount: 31, removedNodeCount: 39 },
    safetyEvents: [{ type: "same-document-navigation", url: `${FIXTURE_ROOT}/pricing` }],
  },

  // §88 style-only ---------------------------------------------------------------
  {
    name: "style-only",
    pageId: "p000006",
    tagName: "button",
    ariaLabel: "Toggle theme",
    priority: "P2",
    capabilities: ["click"],
    before: { candidate: { tagName: "button", visible: true, attributes: { "aria-label": "Toggle theme" } } },
    after: { candidate: { tagName: "button", visible: true, attributes: { "aria-label": "Toggle theme" } } },
    mutation: { attributeNameCounts: { class: 2, style: 1 }, addedNodeCount: 3, removedNodeCount: 3 },
  },

  // §89 already selected ----------------------------------------------------------
  {
    name: "already-selected",
    pageId: "p000007",
    tagName: "button",
    role: "tab",
    text: "pnpm",
    capabilities: ["click", "state-toggle", "tab-trigger"],
    before: { candidate: { tagName: "button", role: "tab", visible: true, attributes: { "aria-selected": "true", role: "tab" } } },
    after: { candidate: { tagName: "button", role: "tab", visible: true, attributes: { "aria-selected": "true", role: "tab" } } },
    mutation: { attributeNameCounts: { class: 2 } },
  },

  // already checked (radio) --------------------------------------------------------
  {
    name: "already-checked",
    pageId: "p000007",
    viewport: "mobile",
    tagName: "button",
    role: "radio",
    ariaLabel: "Switch to system theme",
    capabilities: ["click", "state-toggle", "toggle"],
    before: { candidate: { tagName: "button", role: "radio", visible: true, attributes: { "aria-checked": "true", role: "radio" } } },
    after: { candidate: { tagName: "button", role: "radio", visible: true, attributes: { "aria-checked": "true", role: "radio" } } },
  },

  // §90 blocked navigation ----------------------------------------------------------
  {
    name: "blocked-navigation",
    pageId: "p000008",
    tagName: "summary",
    text: "Guides",
    capabilities: ["click", "state-toggle", "disclosure-trigger"],
    before: { candidate: { tagName: "summary", visible: true, attributes: {} } },
    after: { candidate: { tagName: "summary", visible: true, attributes: {} } },
    safetyEvents: [
      { type: "navigation-blocked", method: "GET", url: `${FIXTURE_ROOT}/guides`, sameOrigin: true },
    ],
  },

  // §91 action error -------------------------------------------------------------
  {
    name: "actionability-error",
    pageId: "p000008",
    viewport: "mobile",
    tagName: "button",
    role: "radio",
    ariaLabel: "Switch to system theme",
    capabilities: ["click", "state-toggle", "toggle"],
    before: { candidate: { tagName: "button", role: "radio", visible: true, attributes: { "aria-checked": "false", role: "radio" } } },
    after: { candidate: { tagName: "button", role: "radio", visible: true, attributes: { "aria-checked": "false", role: "radio" } } },
    statusOverride: "actionability-error",
  },

  // §92 opaque -------------------------------------------------------------------
  {
    name: "opaque",
    pageId: "p000009",
    tagName: "button",
    ariaLabel: "Copy command",
    priority: "P2",
    capabilities: ["click"],
    before: { candidate: { tagName: "button", visible: true, attributes: { "aria-label": "Copy command" } } },
    after: { candidate: { tagName: "button", visible: true, attributes: { "aria-label": "Copy command" } } },
    mutation: { addedNodeCount: 1, removedNodeCount: 1 },
  },

  // unsupported dynamic region -----------------------------------------------------
  {
    name: "unsupported-dynamic-region",
    pageId: "p000009",
    viewport: "mobile",
    tagName: "button",
    ariaLabel: "Expand",
    priority: "P2",
    capabilities: ["click"],
    before: { candidate: { tagName: "button", visible: true, attributes: { "aria-label": "Expand" } } },
    after: { candidate: { tagName: "button", visible: true, attributes: { "aria-label": "Expand" } } },
    mutation: { addedNodeCount: 6, removedNodeCount: 1 },
  },

  // §93 changed but unmatched (the seoworld aria-label hamburger shape) --------------
  {
    name: "unmatched-transition",
    pageId: "p000010",
    tagName: "button",
    ariaLabel: "Open menu",
    priority: "P2",
    capabilities: ["click"],
    before: { candidate: { tagName: "button", visible: true, attributes: { "aria-label": "Open menu" } } },
    after: { candidate: { tagName: "button", visible: true, attributes: { "aria-label": "Close menu" } } },
    mutation: { addedNodeCount: 2 },
  },

  // insufficient evidence: changed, but only container churn -------------------------
  {
    name: "insufficient-evidence",
    pageId: "p000010",
    viewport: "mobile",
    tagName: "button",
    ariaLabel: "Refresh",
    priority: "P2",
    capabilities: ["click"],
    before: {
      candidate: { tagName: "button", visible: true, attributes: { "aria-label": "Refresh" } },
      containers: [],
    },
    after: {
      candidate: { tagName: "button", visible: true, attributes: { "aria-label": "Refresh" } },
      containers: [{ key: "div||banner", tagName: "div", visible: true }],
    },
    mutation: { addedNodeCount: 1 },
  },
];

// ---------------------------------------------------------------------------
// Assertions
// ---------------------------------------------------------------------------

function patternFor(models: BuiltModels, actionName: string, specs: ActionSpec[]) {
  const index = specs.findIndex((s) => s.name === actionName);
  const actionId = `ia${String(index + 1).padStart(6, "0")}`;
  return models.patterns.patterns.find((p) => p.source.actionId === actionId);
}

function unknownFor(models: BuiltModels, actionName: string, specs: ActionSpec[]) {
  const index = specs.findIndex((s) => s.name === actionName);
  const actionId = `ia${String(index + 1).padStart(6, "0")}`;
  return models.unknowns.cases.find((u) => u.source.actionId === actionId);
}

async function main(): Promise<void> {
  console.log("[smoke:interaction-patterns] offline fixture — no browser, no network, no AI credential");
  console.log("");

  let tmp: string | undefined;
  try {
    tmp = await mkdtemp(path.join(tmpdir(), "web-recon-patterns-"));
    const runDir = path.join(tmp, "run-a");
    await writeFixtureRun(runDir, SPECS);

    const exploration = await loadExploration(
      path.join(runDir, "interaction-exploration.json"),
    );
    check("§7 real Task 11 schemas validate the fixture run", exploration.actions.length === SPECS.length);

    const models = buildInteractionModels({ exploration });

    // --- registry integrity --------------------------------------------------
    let integrityError: unknown;
    try {
      assertRegistryIntegrity([
        { ...({} as PatternRule), id: "a", patternType: "menu", version: 1, specificity: 50, description: "", requiredEvidence: [], optionalEvidence: [], rejectionConditions: [], match: () => null },
        { ...({} as PatternRule), id: "b", patternType: "tabs", version: 1, specificity: 50, description: "", requiredEvidence: [], optionalEvidence: [], rejectionConditions: [], match: () => null },
      ]);
    } catch (err) {
      integrityError = err;
    }
    check("§13 two rules sharing a specificity are rejected at load", integrityError instanceof Error);
    check("§13 the shipped registry passes its own integrity check", (() => {
      try {
        assertRegistryIntegrity();
        return true;
      } catch {
        return false;
      }
    })());

    // --- pattern fixtures ----------------------------------------------------
    const nativeDetails = patternFor(models, "native-details", SPECS);
    check(
      "§79 native <details> → disclosure / native-details / closed-to-open",
      nativeDetails?.patternType === "disclosure" &&
        nativeDetails.mechanism === "native-details" &&
        nativeDetails.transition.direction === "closed-to-open",
      JSON.stringify(nativeDetails?.transition),
    );

    const ariaDisclosure = patternFor(models, "aria-disclosure", SPECS);
    check(
      "§80 aria-expanded + target hidden→visible → disclosure",
      ariaDisclosure?.patternType === "disclosure" &&
        ariaDisclosure.mechanism === "aria-expanded" &&
        ariaDisclosure.target?.visibilityChanged === true,
    );

    const noTarget = patternFor(models, "aria-disclosure-no-target", SPECS);
    check(
      "§15 aria-expanded with no declared target is still a disclosure",
      noTarget?.patternType === "disclosure" && noTarget.target === undefined,
    );
    check(
      "§15 …and says so in limitations rather than implying a region",
      noTarget?.limitations.some((l) => l.includes("No controlled region")),
    );

    const tab = patternFor(models, "tab", SPECS);
    check(
      "§81 role=tab + aria-selected false→true + panel visibility → tabs",
      tab?.patternType === "tabs" && tab.mechanism === "aria-selected",
    );

    const brokenTab = patternFor(models, "tab-broken-controls", SPECS);
    check(
      "§82 tabs still confirmed when aria-controls is self-referential and drifts",
      brokenTab?.patternType === "tabs",
    );
    check(
      "§82 …and the drift is recorded as a limitation, not as a failure",
      brokenTab?.limitations.some((l) => l.includes("aria-controls")) === true &&
        brokenTab?.supportingEvidence.some((e) => e.signal === "aria-controls-drift") === true,
    );

    const menu = patternFor(models, "menu-dynamic-mount", SPECS);
    check(
      "§83 aria-haspopup=menu + mount of role=menu → menu",
      menu?.patternType === "menu" && menu.target?.mounted === true,
    );

    const listbox = patternFor(models, "menu-target-role-only", SPECS);
    check(
      "§72 combobox with NO aria-haspopup opening role=listbox → menu/listbox",
      listbox?.patternType === "menu" && listbox.subtype === "listbox",
      `${listbox?.patternType}/${listbox?.subtype}`,
    );

    const dialog = patternFor(models, "dialog", SPECS);
    check(
      "§84 dialog-trigger + role=dialog mount → dialog",
      dialog?.patternType === "dialog" && dialog.target?.mounted === true,
    );

    const checkbox = patternFor(models, "checkbox", SPECS);
    check(
      "§85/§77 checkbox → selection (one policy, one instance)",
      checkbox?.patternType === "selection" && checkbox.mechanism === "native-checked",
      `${checkbox?.patternType}/${checkbox?.mechanism}`,
    );

    const pressed = patternFor(models, "toggle-pressed", SPECS);
    check("§20 aria-pressed → toggle", pressed?.patternType === "toggle");
    const switched = patternFor(models, "toggle-switch", SPECS);
    check(
      "§20 role=switch + aria-checked → toggle (not selection)",
      switched?.patternType === "toggle" && switched.subtype === "switch",
    );

    const dismiss = patternFor(models, "dismiss", SPECS);
    check(
      "§86 self-removal with no navigation → dismiss",
      dismiss?.patternType === "dismiss" && dismiss.transition.direction === "present-to-removed",
    );
    check(
      "§22 …and refuses to claim what was dismissed",
      dismiss?.limitations.some((l) => l.includes("Generic self-removal")),
    );

    const generic = patternFor(models, "generic-state-toggle", SPECS);
    check(
      "§23 a stateful ARIA flip no rule owns → generic-state-toggle",
      generic?.patternType === "generic-state-toggle",
    );

    // §94 specificity ---------------------------------------------------------
    const specificity = patternFor(models, "specificity-menu-over-disclosure", SPECS);
    const specificityIndex = SPECS.findIndex((s) => s.name === "specificity-menu-over-disclosure");
    const specificityActionId = `ia${String(specificityIndex + 1).padStart(6, "0")}`;
    check(
      "§94 disclosure + menu both match → the result is menu",
      specificity?.patternType === "menu",
    );
    check(
      "§94 …and exactly ONE pattern instance is produced (no duplicate)",
      models.patterns.patterns.filter((p) => p.source.actionId === specificityActionId).length === 1,
    );
    check(
      "§94 …with the outranked rule recorded rather than hidden",
      specificity?.limitations.some((l) => l.includes("outranked by specificity")),
    );
    check(
      "§13 no equal-specificity conflicts on the fixture corpus",
      models.patterns.ruleConflicts.length === 0,
    );

    // --- unknown fixtures ----------------------------------------------------
    const urlChange = unknownFor(models, "url-change", SPECS);
    check(
      "§87 url-change → navigation-tainted, and NO pattern",
      urlChange?.reason === "navigation-tainted" && patternFor(models, "url-change", SPECS) === undefined,
    );
    check(
      "§25 …with the before/after URLs preserved for future SPA modeling",
      urlChange?.navigation?.urlBefore === `${FIXTURE_ROOT}/p000006` &&
        urlChange.navigation.urlAfter === `${FIXTURE_ROOT}/pricing` &&
        urlChange.navigation.sameDocumentNavigation === true,
    );

    check(
      "§88 class/style mutation with no semantic diff → style-only-change",
      unknownFor(models, "style-only", SPECS)?.reason === "style-only-change",
    );

    const alreadySelected = unknownFor(models, "already-selected", SPECS);
    check(
      "§89 aria-selected already true → already-in-target-state",
      alreadySelected?.reason === "already-in-target-state",
    );
    check(
      "§31 …and recommends a better probe state for a future run",
      alreadySelected?.preferredProbeState === "aria-selected=false",
    );
    check(
      "§30 aria-checked already true → already-in-target-state",
      unknownFor(models, "already-checked", SPECS)?.reason === "already-in-target-state",
    );

    check(
      "§90 navigation-blocked with no transition → blocked-navigation",
      unknownFor(models, "blocked-navigation", SPECS)?.reason === "blocked-navigation",
    );
    check(
      "§91 actionability-error → execution-error",
      unknownFor(models, "actionability-error", SPECS)?.reason === "execution-error",
    );
    check(
      "§34 click ran, nothing observable moved → opaque-action",
      unknownFor(models, "opaque", SPECS)?.reason === "opaque-action",
    );
    check(
      "§120 unbalanced node churn → unsupported-dynamic-region",
      unknownFor(models, "unsupported-dynamic-region", SPECS)?.reason === "unsupported-dynamic-region",
    );

    const unmatched = unknownFor(models, "unmatched-transition", SPECS);
    check(
      "§93 a verified transition no rule explains → unmatched-transition",
      unmatched?.reason === "unmatched-transition" && unmatched.status === "changed",
    );
    check("§48 …and it is AI eligible", unmatched?.aiEligibility === "eligible");
    check(
      "§74 an aria-label-only transition is NOT forced into generic-state-toggle",
      patternFor(models, "unmatched-transition", SPECS) === undefined,
    );

    check(
      "§27 container-only evidence → insufficient-evidence",
      unknownFor(models, "insufficient-evidence", SPECS)?.reason === "insufficient-evidence",
    );

    // --- eligibility policy (item 48) ----------------------------------------
    check(
      "§48 already-in-target-state / blocked-navigation / execution-error are AI-excluded",
      models.unknowns.cases
        .filter((u) =>
          ["already-in-target-state", "blocked-navigation", "execution-error"].includes(u.reason),
        )
        .every((u) => u.aiEligibility === "excluded"),
    );
    check(
      "§48 navigation-tainted is conditional, never plain eligible",
      models.unknowns.cases
        .filter((u) => u.reason === "navigation-tainted")
        .every((u) => u.aiEligibility === "conditional"),
    );

    // --- accounting (items 43, 67, 68) ---------------------------------------
    const coverage = models.patterns.coverage;
    check(
      "§43 patterns + unknowns account for every planned action",
      coverage.confirmedPatternInstances + coverage.unknownCases === coverage.totalActions,
      `${coverage.confirmedPatternInstances}+${coverage.unknownCases} vs ${coverage.totalActions}`,
    );
    const changedUnknown = models.unknowns.cases.filter((u) => u.status === "changed").length;
    check(
      "§68 every `changed` action is either a pattern or an unknown, exactly once",
      coverage.confirmedPatternInstances + changedUnknown === coverage.changedActions,
    );
    const noChangeUnknown = models.unknowns.cases.filter((u) => u.status === "no-change").length;
    const noChangeTotal = exploration.actions.filter((a) => a.observation.status === "no-change").length;
    check("§67 every `no-change` action lands in exactly one unknown reason", noChangeUnknown === noChangeTotal);
    check(
      "§67 the reason counts sum back to the unknown total",
      Object.values(models.unknowns.stats.reasonCounts).reduce((a, b) => a + b, 0) ===
        models.unknowns.cases.length,
    );
    check(
      "§26 the no-change results did NOT collapse into one reason",
      new Set(models.unknowns.cases.filter((u) => u.status === "no-change").map((u) => u.reason)).size >= 5,
    );

    // --- ids (items 37, 45) --------------------------------------------------
    check(
      "§37 pattern ids are dense and ordered",
      models.patterns.patterns.every((p, i) => p.id === `ip${String(i + 1).padStart(6, "0")}`),
    );
    check(
      "§45 unknown ids are dense and ordered",
      models.unknowns.cases.every((u, i) => u.id === `iu${String(i + 1).padStart(6, "0")}`),
    );
    check(
      "§37 pattern ids follow (pageId, viewport, actionId)",
      models.patterns.patterns.every((p, i, all) => {
        if (i === 0) return true;
        const prev = all[i - 1]!;
        const a = `${prev.source.pageId}|${prev.source.viewport}|${prev.source.actionId}`;
        const b = `${p.source.pageId}|${p.source.viewport}|${p.source.actionId}`;
        return a < b;
      }),
    );

    // --- provenance (item 10) ------------------------------------------------
    check(
      "§10 every pattern is provenance=derived",
      models.patterns.patterns.every((p) => p.provenance === "derived"),
    );
    check(
      "§10 no pattern evidence is `inferred`",
      models.patterns.patterns.every((p) =>
        [...p.evidence, ...p.supportingEvidence].every(
          (e) => e.level === "observed" || e.level === "derived",
        ),
      ),
    );
    check(
      "§39 every pattern records the registry version it was built with",
      models.patterns.patterns.every((p) => p.registryVersion === models.patterns.registryVersion),
    );

    // --- determinism (item 95) -----------------------------------------------
    const reversedDir = path.join(tmp, "run-b");
    await writeFixtureRun(reversedDir, [...SPECS].reverse(), { reverseActionOrder: true });
    // Reversing the SPEC list renumbers the actions, so a byte comparison of the
    // two runs would be meaningless. What must be identical is the LOGICAL
    // output: the same behaviors, the same counts, the same groups.
    const reversedModels = buildInteractionModels({
      exploration: await loadExploration(path.join(reversedDir, "interaction-exploration.json")),
    });
    const shape = (m: BuiltModels) =>
      JSON.stringify({
        types: m.patterns.patternTypeSummary,
        mechanisms: m.patterns.mechanismSummary,
        reasons: m.unknowns.stats.reasonCounts,
        groups: m.patterns.groups.map((g) => `${g.signature}#${g.instanceCount}`).sort(),
        unknownGroups: m.unknowns.signatureGroups.map((g) => `${g.signature}#${g.caseCount}`).sort(),
      });
    check("§95 reversing the input order changes nothing logically", shape(models) === shape(reversedModels));

    // Same input twice → byte identical.
    const repeat = buildInteractionModels({
      exploration: await loadExploration(path.join(runDir, "interaction-exploration.json")),
    });
    check(
      "§95 the same run modeled twice is byte-identical",
      JSON.stringify(repeat.patterns) === JSON.stringify(models.patterns) &&
        JSON.stringify(repeat.unknowns) === JSON.stringify(models.unknowns),
    );
    const serialized = JSON.stringify(models.patterns) + JSON.stringify(models.unknowns);
    check(
      "§95 no timestamp is embedded in either deterministic artifact",
      !/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(serialized),
    );

    // --- artifact hygiene (item 105) -----------------------------------------
    check(
      "§105 no DOM / HTML is copied into the artifacts",
      !serialized.includes("<div") &&
        !serialized.includes("<button") &&
        !serialized.includes("outerHTML") &&
        !serialized.includes("innerHTML"),
    );
    check(
      "§8 the artifacts never name an absolute filesystem path",
      !serialized.includes(tmp),
    );

    // --- on-disk round trip --------------------------------------------------
    const outDir = path.join(tmp, "models");
    const patternsFile = await saveInteractionPatterns(outDir, models.patterns);
    const unknownsFile = await saveUnknownInteractions(outDir, models.unknowns);
    const reloadedPatterns = InteractionPatternsArtifactSchema.safeParse(
      JSON.parse(await readFile(patternsFile.filePath, "utf8")),
    );
    const reloadedUnknowns = UnknownInteractionsArtifactSchema.safeParse(
      JSON.parse(await readFile(unknownsFile.filePath, "utf8")),
    );
    check("artifacts round-trip through their own zod schemas", reloadedPatterns.success && reloadedUnknowns.success);

    // --- AI boundary (items 96–98) -------------------------------------------
    const noProvider = resolveAnalyzer({ provider: undefined });
    check(
      "§55 no configured provider → a message, not a failure",
      noProvider.analyzer === undefined && noProvider.message.includes("not configured"),
    );
    const unknownProvider = resolveAnalyzer({ provider: "definitely-not-installed" });
    check(
      "§55 an unimplemented provider also degrades to a message",
      unknownProvider.analyzer === undefined,
    );

    const fake = new FakeUnknownInteractionAnalyzer();
    const ai = await runAiFallback({
      analyzer: fake,
      unknowns: models.unknowns,
      sourceUnknownInteractions: "unknown-interactions.json",
    });

    const eligibleGroups = models.unknowns.signatureGroups.filter((g) => g.aiEligibility === "eligible");
    check(
      "§47/§112 AI sees one case per eligible signature group, not one per occurrence",
      fake.seenCaseIds.length === eligibleGroups.length &&
        ai.artifact.analyzedCaseCount === eligibleGroups.length,
      `${fake.seenCaseIds.length} sent for ${models.unknowns.cases.length} cases`,
    );
    check(
      "§58 AI is never called for a confirmed pattern",
      fake.seenCaseIds.every((id) => models.unknowns.cases.some((u) => u.id === id)),
    );
    const excludedIds = new Set(
      models.unknowns.cases.filter((u) => u.aiEligibility !== "eligible").map((u) => u.id),
    );
    check(
      "§96 already-in-target-state / blocked-navigation / execution-error are never sent",
      fake.seenCaseIds.every((id) => !excludedIds.has(id)),
    );
    check(
      "§96 unmatched-transition IS sent",
      fake.seenCaseIds.includes(unmatched!.id),
    );
    check(
      "§50 every AI result is provenance=inferred",
      ai.artifact.analyses.every((a) => a.provenance === "inferred"),
    );

    // §97 data minimization ---------------------------------------------------
    const payload = JSON.stringify(fake.seenPayloads);
    const forbidden = [
      "outerHTML",
      "innerHTML",
      "rendered.html",
      "dom.json",
      "styles.json",
      "cookie",
      "Cookie",
      "localStorage",
      "requestBody",
      "<div",
      "<button",
    ];
    check(
      "§97 the AI payload contains none of the forbidden fields",
      forbidden.every((needle) => !payload.includes(needle)),
      forbidden.filter((needle) => payload.includes(needle)).join(", "),
    );
    check(
      "§52 the AI payload carries a page PATH, never a full URL",
      fake.seenPayloads.every((p) => p.pagePath.startsWith("/") && !p.pagePath.includes("://")),
    );
    check(
      "§47 each payload states how many occurrences it represents",
      fake.seenPayloads.every((p) => p.occurrenceCount >= 1),
    );

    // §98 no automatic promotion ----------------------------------------------
    const carousel = ai.artifact.analyses.find((a) => a.proposedPattern?.type === "carousel");
    check(
      "§98 the fake provider really did return carousel/high",
      carousel?.proposedPattern?.confidence === "high",
    );
    const patternsJson = JSON.stringify(models.patterns);
    check(
      "§98 …and `interaction-patterns.json` contains ZERO carousels",
      !patternsJson.includes("carousel"),
    );
    check(
      "§56 …the confident AI answer exists only in the AI artifact",
      JSON.stringify(ai.artifact).includes("carousel"),
    );
    check(
      "§56 the registry itself is unchanged by the AI pass",
      models.patterns.rules.every((r) => r.patternType !== ("carousel" as never)) &&
        models.patterns.rules.length === 10,
    );
    const themeSwitch = ai.artifact.analyses.find((a) => a.proposedPattern?.type === "theme-switch");
    check(
      "§70 the style-only case stays style-only deterministically while AI may call it a theme switch",
      themeSwitch !== undefined &&
        unknownFor(models, "style-only", SPECS)?.reason === "style-only-change",
    );
    check(
      "§114 a suggested next probe is always from the closed enum",
      ai.artifact.analyses.every(
        (a) =>
          a.suggestedNextProbe === undefined ||
          [
            "hover",
            "focus",
            "click-newly-mounted-child",
            "observe-style-state",
            "inspect-shadow-root",
            "inspect-frame",
            "no-further-probe",
          ].includes(a.suggestedNextProbe.actionType),
      ),
    );
    check(
      "§57 the promotion policy travels with the AI artifact",
      ai.artifact.promotionPolicy.includes("never becomes a confirmed pattern"),
    );
    const aiFile = await saveAiAnalysis(outDir, ai.artifact);
    check("ai-analysis.json round-trips through its schema", aiFile.bytes > 0);

    // --- rule conflict path (item 13) ----------------------------------------
    // The shipped registry cannot produce a tie (integrity forbids it), so the
    // conflict path is driven directly with two deliberately colliding rules.
    const collide = (id: string): PatternRule => ({
      id,
      patternType: "menu",
      version: 1,
      specificity: 55,
      description: "collision fixture",
      requiredEvidence: [],
      optionalEvidence: [],
      rejectionConditions: [],
      match: () => ({
        patternType: "menu",
        mechanism: "aria-expanded",
        transition: { field: "aria-expanded", before: "false", after: "true" },
        evidence: [],
        supportingEvidence: [],
        limitations: [],
      }),
    });
    const conflictFacts = buildActionFacts(
      exploration.actions.find((a) => a.observation.actionId === "ia000002")!,
    );
    const conflicted = matchPattern(conflictFacts, [collide("x-v1"), collide("y-v1")]);
    check(
      "§13 an equal-specificity tie yields a recorded conflict and NO pattern",
      conflicted.match === undefined && conflicted.conflict?.ruleIds.length === 2,
    );

    // --- fail-fast input validation (item 7) ---------------------------------
    const brokenDir = path.join(tmp, "run-broken");
    await writeFixtureRun(brokenDir, SPECS.slice(0, 3));
    await rm(path.join(brokenDir, "pages", "p000001", "desktop", "ia000001.json"));
    let missingError: unknown;
    try {
      await loadExploration(path.join(brokenDir, "interaction-exploration.json"));
    } catch (err) {
      missingError = err;
    }
    check(
      "§7 a missing action artifact fails fast",
      missingError instanceof InteractionPatternInputError,
    );

    const mismatchDir = path.join(tmp, "run-mismatch");
    await writeFixtureRun(mismatchDir, SPECS.slice(0, 3));
    const mismatchFile = path.join(mismatchDir, "pages", "p000001", "desktop", "ia000002.json");
    const mismatched = JSON.parse(await readFile(mismatchFile, "utf8"));
    mismatched.viewportId = "mobile";
    mismatched.sourceViewport = "mobile";
    await writeFile(mismatchFile, JSON.stringify(mismatched, null, 2) + "\n", "utf8");
    let viewportError: unknown;
    try {
      await loadExploration(path.join(mismatchDir, "interaction-exploration.json"));
    } catch (err) {
      viewportError = err;
    }
    check(
      "§7 a result whose viewport disagrees with the plan fails fast",
      viewportError instanceof InteractionPatternInputError,
    );

    const dupDir = path.join(tmp, "run-dup");
    await writeFixtureRun(dupDir, SPECS.slice(0, 3));
    const dupManifestFile = path.join(dupDir, "interaction-exploration.json");
    const dupManifest = JSON.parse(await readFile(dupManifestFile, "utf8"));
    dupManifest.actions.push({ ...dupManifest.actions[0] });
    dupManifest.stats.plannedActions = dupManifest.actions.length;
    await writeFile(dupManifestFile, JSON.stringify(dupManifest, null, 2) + "\n", "utf8");
    let dupError: unknown;
    try {
      await loadExploration(dupManifestFile);
    } catch (err) {
      dupError = err;
    }
    check("§7 a duplicate actionId fails fast", dupError instanceof InteractionPatternInputError);

    const statusDir = path.join(tmp, "run-status");
    await writeFixtureRun(statusDir, SPECS.slice(0, 3));
    const statusFile = path.join(statusDir, "pages", "p000001", "desktop", "ia000001.json");
    const statusJson = JSON.parse(await readFile(statusFile, "utf8"));
    statusJson.status = "no-change";
    await writeFile(statusFile, JSON.stringify(statusJson, null, 2) + "\n", "utf8");
    let statusError: unknown;
    try {
      await loadExploration(path.join(statusDir, "interaction-exploration.json"));
    } catch (err) {
      statusError = err;
    }
    check(
      "§7 a status contradicting diff.meaningfulChange fails fast",
      statusError instanceof InteractionPatternInputError,
    );

    // --- vocabulary coverage --------------------------------------------------
    check(
      "the fixture corpus exercises every pattern type in the taxonomy",
      new Set(models.patterns.patterns.map((p) => p.patternType)).size === 8,
      [...new Set(models.patterns.patterns.map((p) => p.patternType))].join(", "),
    );
    check(
      "the fixture corpus exercises every unknown reason in the taxonomy",
      new Set(models.unknowns.cases.map((u) => u.reason)).size === 9,
      [...new Set(models.unknowns.cases.map((u) => u.reason))].join(", "),
    );
    check(
      "every rule in the registry matched at least one fixture action",
      models.patterns.rules.every((r) => r.matchCount > 0),
      models.patterns.rules.filter((r) => r.matchCount === 0).map((r) => r.id).join(", "),
    );

    // --- SiteSpec-facing index (item 118) ------------------------------------
    check(
      "§118 the page index lists desktop/mobile pattern ids per page",
      models.patterns.pages.length > 0 &&
        models.patterns.pages.every(
          (p) =>
            Array.isArray(p.desktopPatternIds) &&
            Array.isArray(p.mobilePatternIds) &&
            typeof p.unknownCount === "number",
        ),
    );
    const indexedIds = new Set(
      models.patterns.pages.flatMap((p) => [...p.desktopPatternIds, ...p.mobilePatternIds]),
    );
    check(
      "§118 …and indexes every pattern exactly once",
      indexedIds.size === models.patterns.patterns.length,
    );
    check(
      "§42 patterns stay viewport-local (no desktop↔mobile merging)",
      models.patterns.groups.every((g) =>
        g.patternIds.every(
          (id) =>
            models.patterns.patterns.find((p) => p.id === id)!.source.viewport === g.viewport,
        ),
      ),
    );

    // --- §59 offline at the import-graph level --------------------------------
    // Asserting "no browser" in prose is worth nothing; this walks the real
    // import graph from the barrel and the CLI and looks at what it reaches.
    const graph = new Set<string>();
    const externals = new Set<string>();
    const walkImports = (file: string): void => {
      const abs = path.resolve(file);
      if (graph.has(abs)) return;
      graph.add(abs);
      let src: string;
      try {
        src = readFileSync(abs, "utf8");
      } catch {
        return;
      }
      for (const match of src.matchAll(/\bfrom\s+["'](\.[^"']+)["']/g)) {
        walkImports(path.resolve(path.dirname(abs), match[1]!.replace(/\.js$/, ".ts")));
      }
      for (const match of src.matchAll(/\bfrom\s+["']([^."'][^"']*)["']/g)) {
        externals.add(match[1]!);
      }
    };
    walkImports("src/interaction-patterns/index.ts");
    walkImports("src/cli-model-interactions.ts");
    check(
      "§59 the import graph reaches no browser / crawler / network module",
      graph.size > 10 &&
        ![...externals].some((spec) =>
          /playwright|firecrawl|undici|axios|node-fetch|node:http|node:https|node:net|node:dgram|node:tls/.test(
            spec,
          ),
        ),
      [...externals].join(", "),
    );

    // --- known status/enum sanity --------------------------------------------
    check(
      "every unknown case preserves Task 11's own action status",
      models.unknowns.cases.every((u) => ACTION_STATUS_ORDER.includes(u.status)),
    );
    check(
      "every recorded diff category is Task 11 vocabulary",
      models.unknowns.cases.every((u) =>
        u.diffCategories.every((c) => DIFF_CATEGORY_ORDER.includes(c)),
      ),
    );
  } finally {
    if (tmp) await rm(tmp, { recursive: true, force: true });
  }

  console.log("");
  console.log(`${checks - failures}/${checks} checks passed`);
  if (failures > 0) {
    console.error(`[smoke:interaction-patterns] FAILED — ${failures} check(s) failed`);
    process.exitCode = 1;
  } else {
    console.log("[smoke:interaction-patterns] OK");
  }
}

main().catch((err) => {
  console.error(
    "[smoke:interaction-patterns] ERROR —",
    err instanceof Error ? err.message : err,
  );
  process.exitCode = 1;
});
