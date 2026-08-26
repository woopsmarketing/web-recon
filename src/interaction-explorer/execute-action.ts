import type { Browser, BrowserContext, ElementHandle, Page } from "playwright";
import {
  OBSERVATION_COLOR_SCHEME,
  OBSERVATION_LOCALE,
  OBSERVATION_REDUCED_MOTION,
  OBSERVATION_TIMEZONE,
  type ViewportProfile,
} from "../observer/types.js";
import {
  captureDynamicTargetSubtree,
  captureSnapshot,
  collectMutations,
  installMutationObserver,
  readLiveSignals,
  waitForAnimationFrames,
  type SnapshotControlInput,
} from "./capture-state.js";
import { diffSnapshots } from "./diff-state.js";
import {
  discoverUserVisibleTargets,
  installTargetBaseline,
} from "./discover-targets.js";
import { reconcileLiveState } from "./reconcile-live-state.js";
import { resolveLiveCandidate } from "./resolve-live-candidate.js";
import { SafetyGuard } from "./safety-guards.js";
import {
  ACTION_TIMEOUT_MS,
  AFTER_NETWORK_QUIET_TIMEOUT_MS,
  AFTER_SETTLE_MS,
  ERROR_MESSAGE_MAX_LEN,
  EXPLORER_ENGINE,
  LOAD_NETWORK_IDLE_TIMEOUT_MS,
  LOAD_SETTLE_MS,
  LOAD_TIMEOUT_MS,
  SCHEMA_VERSION,
  type ActionError,
  type ActionStatus,
  type InteractionActionPlan,
  type InteractionObservation,
  type InteractionStateSnapshot,
  type LiveSignals,
  type MutationSummary,
} from "./types.js";

/**
 * ONE safe rule-based interaction (Task 11, items 31–35, 45–47, 54–56, 66).
 *
 * The pipeline, in order, with the reason each step exists:
 *
 *   fresh BrowserContext   nothing from any other action can be present  (32)
 *   guards installed       inert until the page has finished loading     (39–44)
 *   goto + settle          hydration must finish or the click hits a
 *                          not-yet-interactive shell                     (35)
 *   ARM guards             everything after this moment is the click's
 *   re-identify            stored elementId is NEVER used as a locator   (2)
 *   live reconciliation    read what Task 09 never stored                (28)
 *   MutationObserver       installed BEFORE the click                    (52)
 *   before snapshot        the baseline
 *   click                  ordinary Playwright click, never `force`      (46)
 *   settle                 2 rAF → fixed settle → bounded network quiet  (54)
 *   after snapshot         re-resolving the candidate if it went stale   (55)
 *   diff                   deterministic, Node-side                      (58)
 *   context.close()        the restore strategy IS disposal              (32)
 *
 * **Restoration is disposal.** There is no "click it again to close it" logic
 * anywhere: that would depend on the page behaving symmetrically, which is
 * exactly what is being measured. Throwing the context away restores cookies,
 * localStorage, sessionStorage and DOM state in one operation that cannot
 * partially fail.
 *
 * **Failure is isolated** (item 66). Every failure mode below produces an
 * InteractionObservation with a status — never a thrown run. One ambiguous
 * locator among twenty actions costs one action.
 */

export interface ExecuteActionOptions {
  browser: Browser;
  plan: InteractionActionPlan;
  profile: ViewportProfile;
  onLog?: (message: string) => void;
}

function shortMessage(err: unknown): string {
  const raw = err instanceof Error ? err.message : String(err);
  const firstLine = raw.split("\n", 1)[0].trim();
  return firstLine.length > ERROR_MESSAGE_MAX_LEN
    ? `${firstLine.slice(0, ERROR_MESSAGE_MAX_LEN)}…`
    : firstLine;
}

function toActionError(err: unknown, phase: ActionError["phase"]): ActionError {
  return {
    name: err instanceof Error ? err.name : typeof err,
    message: shortMessage(err),
    phase,
  };
}

/**
 * Playwright's actionability failures and everything else are different facts.
 * The first is the page saying "you may not click this right now" (covered,
 * moving, detached mid-click); the second is a defect somewhere in this engine
 * or in the browser. Item 46 forbids `force: true`, so an actionability failure
 * is a RESULT to record, never something to bulldoze.
 */
function classifyClickError(err: unknown): ActionStatus {
  const name = err instanceof Error ? err.name : "";
  const message = err instanceof Error ? err.message : String(err);
  const actionabilitySignatures = [
    "element is not visible",
    "element is not enabled",
    "element is not stable",
    "intercepts pointer events",
    "waiting for element to be visible",
    "element is outside of the viewport",
    "not attached to the DOM",
    "Element is not attached",
  ];
  if (actionabilitySignatures.some((s) => message.includes(s))) {
    return "actionability-error";
  }
  if (name === "TimeoutError") return "actionability-error";
  return "action-error";
}

/**
 * A fresh, anonymous context (items 32–34).
 *
 * No storage state is ever loaded — no user cookie jar, no saved login, no
 * password store (item 33). The viewport/DPR/touch/UA profile and the pinned
 * locale, timezone, color scheme and reduced-motion come from the Observer's own
 * constants, so the page renders under the same conditions it was observed
 * under, and a responsive difference in the result is the site's, not the
 * harness's.
 */
async function newActionContext(
  browser: Browser,
  profile: ViewportProfile,
): Promise<BrowserContext> {
  const context = await browser.newContext({
    viewport: { width: profile.width, height: profile.height },
    deviceScaleFactor: profile.deviceScaleFactor,
    isMobile: profile.isMobile,
    hasTouch: profile.hasTouch,
    ...(profile.userAgent ? { userAgent: profile.userAgent } : {}),
    locale: OBSERVATION_LOCALE,
    timezoneId: OBSERVATION_TIMEZONE,
    colorScheme: OBSERVATION_COLOR_SCHEME as "light",
    reducedMotion: OBSERVATION_REDUCED_MOTION as "no-preference",
    // Item 41: a download must never reach the disk in the first place.
    acceptDownloads: false,
  });
  // tsx/esbuild `keepNames` leaks a `__name` helper into every serialized
  // function; an init script installs the no-op shim on every document,
  // including any the page replaces. (Same workaround as the Observer.)
  await context.addInitScript(
    "globalThis.__name = globalThis.__name || function (fn) { return fn; };",
  );
  return context;
}

/** goto → bounded network idle → fixed settle (item 35). */
async function loadPage(page: Page, url: string): Promise<string> {
  const response = await page.goto(url, {
    waitUntil: "load",
    timeout: LOAD_TIMEOUT_MS,
  });
  try {
    await page.waitForLoadState("networkidle", {
      timeout: LOAD_NETWORK_IDLE_TIMEOUT_MS,
    });
  } catch {
    // Bounded on purpose: many sites never truly idle. Continue anyway.
  }
  await page.waitForTimeout(LOAD_SETTLE_MS);
  return response?.url() ?? page.url();
}

/** 2 animation frames → fixed settle → bounded network quiet (item 54). */
async function settleAfterAction(page: Page): Promise<void> {
  try {
    await waitForAnimationFrames(page);
  } catch {
    // A navigation-blocked page can tear down the execution context here; the
    // fixed settle below still applies.
  }
  await page.waitForTimeout(AFTER_SETTLE_MS);
  try {
    await page.waitForLoadState("networkidle", {
      timeout: AFTER_NETWORK_QUIET_TIMEOUT_MS,
    });
  } catch {
    // Never a hard requirement.
  }
}

/**
 * Execute ONE planned action end to end and return its observation.
 *
 * This function does not throw for site-caused problems: a page that will not
 * load, a candidate that is gone, an ambiguous match and a click that Playwright
 * refuses all come back as a status. It only propagates errors that mean the
 * harness itself is broken.
 */
export async function executeAction(
  options: ExecuteActionOptions,
): Promise<InteractionObservation> {
  const { browser, plan, profile } = options;
  const log = options.onLog ?? (() => {});

  const startedAtMs = Date.now();
  const startedAt = new Date(startedAtMs).toISOString();

  const controls: SnapshotControlInput[] = plan.controls.map((c) => ({
    relation: c.relation,
    ...(c.targetDomId !== undefined ? { targetDomId: c.targetDomId } : {}),
  }));

  let status: ActionStatus = "action-error";
  let error: ActionError | undefined;
  let attempted = false;
  let notAttemptedReason: string | undefined;
  let finalUrl: string | undefined;
  let loadMs = 0;

  let liveSignals: LiveSignals | undefined;
  let before: InteractionStateSnapshot | undefined;
  let after: InteractionStateSnapshot | undefined;
  let mutationSummary: MutationSummary | undefined;
  let discoveredTargets: InteractionObservation["discoveredTargets"];
  let targetDiscovery: InteractionObservation["targetDiscovery"];
  let diff: InteractionObservation["diff"];
  let resolution: InteractionObservation["locatorResolution"] = {
    status: "not-found",
    matchCount: 0,
    attempts: [],
    locatorDescriptor: plan.locatorDescriptor,
  };
  let safetyEvents: InteractionObservation["safetyEvents"] = [];

  const context = await newActionContext(browser, profile);
  let guard: SafetyGuard | undefined;
  try {
    const page = await context.newPage();
    page.setDefaultNavigationTimeout(LOAD_TIMEOUT_MS);
    guard = await SafetyGuard.install(context, page, plan.url);

    // --- load ---------------------------------------------------------------
    const loadStart = Date.now();
    try {
      finalUrl = await loadPage(page, plan.url);
      loadMs = Date.now() - loadStart;
    } catch (err) {
      loadMs = Date.now() - loadStart;
      status = "load-error";
      error = toActionError(err, "load");
      notAttemptedReason = "the page did not load";
      throw new ActionAborted();
    }

    // Everything from here on is caused by this engine, so the guards apply.
    guard.arm(finalUrl);

    // --- re-identify --------------------------------------------------------
    const resolved = await resolveLiveCandidate(page, plan.locatorDescriptor);
    resolution = resolved.resolution;
    if (!resolved.element) {
      status =
        resolution.status === "ambiguous"
          ? "ambiguous"
          : resolution.status === "semantic-mismatch"
            ? // Item 60 has no `semantic-mismatch` status; the precise reason
              // stays in `locatorResolution.status`, which every report reads.
              "not-found"
            : "not-found";
      notAttemptedReason = `locator ${resolution.status}`;
      log(`${plan.actionId} ${resolution.status} (${plan.sourceCandidateId})`);
      throw new ActionAborted();
    }
    const element: ElementHandle<Element> = resolved.element;

    // --- live reconciliation (items 15, 28) ---------------------------------
    liveSignals = await readLiveSignals(page, element);
    const verdict = reconcileLiveState(liveSignals, plan);
    if (!verdict.proceed) {
      status = verdict.status;
      notAttemptedReason = verdict.reason;
      // A before-snapshot is still worth having: it documents the live state
      // that refused the action.
      before = await captureSnapshot(page, element, controls);
      log(`${plan.actionId} ${verdict.status}: ${verdict.reason}`);
      throw new ActionAborted();
    }

    // --- before -------------------------------------------------------------
    await installMutationObserver(page);
    // Task 17 §4: baseline for generic user-visible target discovery. Must be
    // installed before the click so hidden→visible and mounted subtrees can be
    // diffed afterwards. Read-only in-page walk; the references it parks die
    // with the context.
    await installTargetBaseline(page);
    before = await captureSnapshot(page, element, controls);

    // --- click (item 45: click is the only physical action in Task 11) ------
    try {
      attempted = true;
      await element.click({ timeout: ACTION_TIMEOUT_MS });
    } catch (err) {
      status = classifyClickError(err);
      error = toActionError(err, "action");
      // Even a refused click leaves a page worth measuring — collect what the
      // observer saw so the artifact is not a black hole.
      mutationSummary = await collectMutations(page).catch(() => undefined);
      log(`${plan.actionId} ${status}: ${shortMessage(err)}`);
      throw new ActionAborted();
    }

    // --- settle + after -----------------------------------------------------
    await settleAfterAction(page);
    mutationSummary = await collectMutations(page);

    let afterElement: ElementHandle<Element> | null = element;
    let candidateReResolved = false;
    const stillConnected = await element
      .evaluate((el: Element) => el.isConnected)
      .catch(() => false);
    if (!stillConnected) {
      // Item 55: a framework re-render replaces the node. Re-resolving through
      // the SAME verified locator is safe; grabbing whatever is nearby is not.
      const again = await resolveLiveCandidate(page, plan.locatorDescriptor);
      if (again.element) {
        afterElement = again.element;
        candidateReResolved = true;
      } else {
        afterElement = null;
      }
    }
    after = await captureSnapshot(page, afterElement, controls);
    await captureNewlyMountedTargets(page, before, after);

    // Task 17 §4 — what did the USER see change? Generic before/after target
    // discovery, independent of any declared relation. Runs only on the same
    // document (a navigated page is a different page, not a state change).
    const discovery = await discoverUserVisibleTargets(page, afterElement, {
      urlChanged: before.url !== after.url,
    }).catch(() => undefined);
    if (discovery) {
      targetDiscovery = discovery.summary;
      if (discovery.targets.length > 0) discoveredTargets = discovery.targets;
    }

    diff = diffSnapshots(before, after, { candidateReResolved });
    if (diff.urlChanged) {
      // No network request was made, so no route handler could have blocked it:
      // a client-side router changed the URL. Recorded here rather than lost.
      let url = after.url;
      try {
        const parsed = new URL(after.url);
        url = `${parsed.origin}${parsed.pathname}`;
      } catch {
        // Keep the raw value if it will not parse.
      }
      guard.note({ type: "same-document-navigation", url });
    }
    status = diff.meaningfulChange ? "changed" : "no-change";
    log(
      `${plan.actionId} ${status} (${diff.changes.length} change(s), ` +
        `${mutationSummary.observedCount} mutation(s))`,
    );
  } catch (err) {
    if (!(err instanceof ActionAborted)) {
      status = "action-error";
      error = toActionError(err, "action");
    }
  } finally {
    guard?.disarm();
    safetyEvents = guard?.events() ?? [];
    await context.close().catch(() => {});
  }

  const completedAtMs = Date.now();
  return {
    schemaVersion: SCHEMA_VERSION,
    engine: EXPLORER_ENGINE,
    actionId: plan.actionId,

    pageId: plan.pageId,
    url: plan.url,
    ...(finalUrl ? { finalUrl } : {}),
    viewportId: plan.viewportId,
    viewportProfile: profile,

    sourceCandidateId: plan.sourceCandidateId,
    sourceElementId: plan.sourceElementId,
    sourcePageId: plan.pageId,
    sourceViewport: plan.viewportId,
    sourceInteractionCandidatesFile: plan.sourceInteractionCandidatesFile,

    priority: plan.priority,
    capabilities: plan.capabilities,
    planReason: plan.planReason,
    shapeKey: plan.shapeKey,

    locatorResolution: resolution,
    ...(liveSignals ? { liveSignals } : {}),

    action: {
      type: "click",
      attempted,
      ...(notAttemptedReason ? { notAttemptedReason } : {}),
    },

    ...(before ? { before } : {}),
    ...(after ? { after } : {}),
    ...(diff ? { diff } : {}),
    ...(mutationSummary ? { mutationSummary } : {}),
    ...(discoveredTargets ? { discoveredTargets } : {}),
    ...(targetDiscovery ? { targetDiscovery } : {}),

    safetyEvents,

    status,
    ...(error ? { error } : {}),

    startedAt,
    completedAt: new Date(completedAtMs).toISOString(),
    elapsedMs: completedAtMs - startedAtMs,
    loadMs,
  };
}

/**
 * Attach a bounded content capture to every region this action MOUNTED
 * (Task 16, items 68–70).
 *
 * The eligibility test is deliberately the narrowest one that answers the
 * question: the region did not resolve BEFORE the click and does resolve
 * AFTER. A region that already existed is part of the static DOM that Task 09
 * observed properly, so re-capturing it here would put a second, worse copy of
 * page content into an action artifact. A region that never appeared has
 * nothing to capture.
 *
 * Mutates `after` in place because that snapshot is where the observation
 * belongs — the after-state of a target is exactly what this describes — and
 * because the before/after pair must stay the diff's only input.
 */
async function captureNewlyMountedTargets(
  page: Page,
  before: InteractionStateSnapshot,
  after: InteractionStateSnapshot,
): Promise<void> {
  for (let i = 0; i < after.targets.length; i++) {
    const afterTarget = after.targets[i]!;
    const beforeTarget = before.targets[i];
    if (!afterTarget.resolved) continue;
    if (beforeTarget?.resolved !== false) continue;
    const domId = afterTarget.targetDomId;
    if (domId === undefined) continue;

    const handle = await page
      .evaluateHandle((id: string) => document.getElementById(id), domId)
      .catch(() => null);
    if (!handle) continue;
    try {
      const element = handle.asElement();
      if (!element) continue;
      const subtree = await captureDynamicTargetSubtree(
        page,
        element as ElementHandle<Element>,
      );
      if (subtree) afterTarget.capturedSubtree = subtree;
    } finally {
      await handle.dispose().catch(() => {});
    }
  }
}

/**
 * Internal control-flow signal for "stop this action, the status is already
 * decided". Using a sentinel rather than deep nesting keeps the happy path of
 * {@link executeAction} readable as a straight line.
 */
class ActionAborted extends Error {
  constructor() {
    super("action aborted");
    this.name = "ActionAborted";
  }
}
