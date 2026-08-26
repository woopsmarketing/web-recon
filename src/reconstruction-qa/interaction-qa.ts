import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import type { Browser, ElementHandle, Page } from "playwright";
import { SKIP_TAGS, STYLE_WHITELIST, type ViewportProfile } from "../observer/types.js";
import { TARGET_TEXT_SAMPLE_LEN } from "../interaction-explorer/types.js";
import {
  captureSnapshot,
  collectMutations,
  installMutationObserver,
  resolveLiveCandidate,
  SafetyGuard,
  waitForAnimationFrames,
  type InteractionStateSnapshot,
  type LocatorDescriptor,
  type SnapshotControlInput,
  AFTER_NETWORK_QUIET_TIMEOUT_MS,
  AFTER_SETTLE_MS,
  LOAD_NETWORK_IDLE_TIMEOUT_MS,
  LOAD_SETTLE_MS,
} from "../interaction-explorer/index.js";
import type { CompiledObservedTarget, CompiledPattern } from "../sitespec/index.js";
import { dynamicTargetDomId, generatedDomId } from "../reconstruction/relations.js";
import { newQaContext } from "./capture-page.js";
import {
  ERROR_MESSAGE_MAX_LEN,
  QA_ACTION_TIMEOUT_MS,
  QA_NAV_TIMEOUT_MS,
  type ObservedTargetReplay,
  type ReplaySide,
  type ReplayState,
} from "./types.js";

/**
 * Interaction QA replay (items 61–75).
 *
 * The claim this module exists to stop is a specific one (item 67): Task 14
 * bound 98 of 98 confirmed patterns at runtime, and it would be very easy to
 * read that as "98 of 98 behave the same". It is not the same statement. One is
 * about what the generator emitted; the other is about what a browser does, and
 * only a replay can settle it — including for the `native` mechanisms, where
 * "the browser handles `<details>` so it must be right" is an assumption rather
 * than a measurement (item 68).
 *
 * ## Two sides, deliberately asymmetric in locating and symmetric in measuring
 *
 *   ORIGINAL  re-identified through Task 11's own `LocatorDescriptor` and its
 *             four exact strategies. `candidate.elementId` is never a locator
 *             (item 62), and Task 11's safety guards are REUSED rather than
 *             re-implemented (item 8): fresh anonymous context, no storage state,
 *             non-GET requests aborted, popups closed, downloads cancelled,
 *             dialogs dismissed, main-frame navigation blocked.
 *   CLONE     located exactly, by `[data-wr-pattern-id]` inside the active
 *             viewport variant. The clone's locator difficulty is not a property
 *             of the site, and mixing the two would turn a locator problem into a
 *             behavior finding (item 64).
 *
 * Both sides then use the SAME capture and the SAME comparison. Each action gets
 * a fresh context on both sides, so state contamination is zero (item 63).
 *
 * ## The one thing this run observes that nothing before it did
 *
 * The target's OPEN-state computed style (items 70, 71). Task 11 captured the
 * closed state and clicked; it never read what the region's style became. That
 * is why Task 14 could only reveal a hidden region with a neutral
 * `display: revert`. Reading it here — on a uniquely resolved, visible,
 * un-drifted target — is new observed evidence, and it is the sole justification
 * for the `interaction-target-state-style` correction.
 */

/** Computed properties read from an interaction target's open state (item 95). */
export const TARGET_STATE_STYLE_PROPERTIES: readonly string[] = STYLE_WHITELIST;

function short(message: string): string {
  const firstLine = message.split("\n", 1)[0]!.trim();
  return firstLine.length > ERROR_MESSAGE_MAX_LEN
    ? `${firstLine.slice(0, ERROR_MESSAGE_MAX_LEN)}…`
    : firstLine;
}

/** Read one element's state, in the shape both sides share. */
async function readElementState(
  page: Page,
  handle: ElementHandle<Element> | null,
  withComputedStyle: boolean,
  styleProperties: readonly string[],
  withText = false,
): Promise<ReplayState> {
  if (!handle) return { exists: false };
  try {
    return await page.evaluate(
      (arg: {
        element: Element | null;
        withComputedStyle: boolean;
        styleProperties: string[];
        withText: boolean;
        textSampleLen: number;
      }): ReplayState => {
        const element = arg.element;
        if (!element || !element.isConnected) return { exists: false };
        const style = window.getComputedStyle(element);
        const rect = element.getBoundingClientRect();
        const visible =
          style.display !== "none" &&
          style.visibility !== "hidden" &&
          style.visibility !== "collapse" &&
          rect.width > 0 &&
          rect.height > 0;
        const attributes: Record<string, string> = {};
        for (const attribute of Array.from(element.attributes)) {
          const name = attribute.name;
          if (
            name.indexOf("aria-") === 0 ||
            name === "open" ||
            name === "checked" ||
            name === "selected" ||
            name === "hidden" ||
            name === "role"
          ) {
            attributes[name] = attribute.value;
          }
        }
        const any = element as unknown as Record<string, unknown>;
        const state: Record<string, boolean> = {};
        if (typeof any.checked === "boolean") state.checked = any.checked;
        if (typeof any.selected === "boolean") state.selected = any.selected;
        if (typeof any.open === "boolean") state.open = any.open;
        state.hidden = any.hidden === true || element.hasAttribute("hidden");
        const roleRaw = element.getAttribute("role");
        const interactive = element.querySelectorAll(
          "a[href],button,input,select,textarea,summary,[role=menuitem],[role=option],[role=tab]",
        ).length;
        const out: ReplayState = {
          exists: true,
          visible,
          tagName: element.tagName.toLowerCase(),
          ...(roleRaw ? { role: roleRaw.trim().split(/\s+/)[0]!.toLowerCase() } : {}),
          attributes,
          state,
          boundingBox: {
            x: Math.round(rect.x * 100) / 100,
            y: Math.round(rect.y * 100) / 100,
            width: Math.round(rect.width * 100) / 100,
            height: Math.round(rect.height * 100) / 100,
          },
          childElementCount: element.childElementCount,
          interactiveDescendantCount: interactive,
        };
        if (arg.withComputedStyle) {
          const computed: Record<string, string> = {};
          for (const name of arg.styleProperties) {
            const value = style.getPropertyValue(name);
            if (value && value.trim() !== "") computed[name] = value;
          }
          out.computed = computed;
        }
        if (arg.withText) {
          const text = (element.textContent ?? "").replace(/\s+/g, " ").trim();
          // Whitespace-insensitive length: inter-element whitespace text nodes
          // are a serialization artifact, not content (Task 17 §6).
          out.textLength = text.replace(/ /g, "").length;
          if (text.length > 0) out.textSample = text.slice(0, arg.textSampleLen);
        }
        return out;
      },
      {
        element: handle,
        withComputedStyle,
        styleProperties: [...styleProperties],
        withText,
        textSampleLen: TARGET_TEXT_SAMPLE_LEN,
      },
    );
  } catch {
    return { exists: false };
  }
}

// ---------------------------------------------------------------------------
// Observed user-visible targets (Task 17 §6)
// ---------------------------------------------------------------------------

/**
 * Resolve one DISCOVERED target region on the live original: by its author
 * HTML id first, else by the exact structural path (element-child indices over
 * the Observer's tree shape — the same walk the explorer used to record it).
 */
async function originalObservedHandle(
  page: Page,
  record: CompiledObservedTarget,
): Promise<{ handle: ElementHandle<Element> | null; resolvedBy?: "html-id" | "structural-path" }> {
  if (record.targetSourceHtmlId) {
    const byId = await page
      .$(`#${cssEscape(record.targetSourceHtmlId)}`)
      .catch(() => null);
    if (byId) return { handle: byId, resolvedBy: "html-id" };
  }
  try {
    const handle = await page.evaluateHandle(
      (arg: { path: string; tag: string; skipTags: string[] }) => {
        const skip = new Set(arg.skipTags);
        let current: Element | null = document.documentElement;
        if (arg.path !== "") {
          for (const segment of arg.path.split("/")) {
            const want = Number(segment);
            if (!Number.isInteger(want) || want < 0) return null;
            let position = 0;
            let found: Element | null = null;
            for (const child of Array.from((current as Element).children)) {
              if (skip.has(child.tagName)) continue;
              if (position === want) {
                found = child;
                break;
              }
              position++;
            }
            if (!found) return null;
            current = found;
          }
        }
        return current && current.tagName.toLowerCase() === arg.tag ? current : null;
      },
      {
        path: record.structuralPath,
        tag: record.observedTag,
        skipTags: [...SKIP_TAGS],
      },
    );
    const element = handle.asElement() as ElementHandle<Element> | null;
    if (element) return { handle: element, resolvedBy: "structural-path" };
    await handle.dispose().catch(() => {});
  } catch {
    // Fall through — an unresolvable region is a recorded fact, not an error.
  }
  return { handle: null };
}

/** Capture every observed target's state on the live original, one side pass. */
async function captureOriginalObserved(
  page: Page,
  records: readonly CompiledObservedTarget[],
): Promise<Map<string, { handle: ElementHandle<Element> | null; resolvedBy?: "html-id" | "structural-path"; state: ReplayState }>> {
  const out = new Map<
    string,
    { handle: ElementHandle<Element> | null; resolvedBy?: "html-id" | "structural-path"; state: ReplayState }
  >();
  for (const record of records) {
    const { handle, resolvedBy } = await originalObservedHandle(page, record);
    const state = await readElementState(page, handle, false, [], true);
    out.set(record.discoveryId, {
      handle,
      ...(resolvedBy !== undefined ? { resolvedBy } : {}),
      state,
    });
  }
  return out;
}

/** Screenshot policy for the four-shot interaction evidence (Task 17 §6). */
export interface ReplayScreenshots {
  /** Absolute directory the PNGs are written into. */
  dir: string;
  /** The same directory, relative to the QA run dir (recorded in artifacts). */
  rel: string;
  /** File prefix, e.g. `original` / `clone`. */
  prefix: string;
}

async function shoot(
  page: Page,
  screenshots: ReplayScreenshots | undefined,
  moment: "before" | "after",
): Promise<string | undefined> {
  if (!screenshots) return undefined;
  try {
    const buffer = await page.screenshot({ type: "png" });
    await mkdir(screenshots.dir, { recursive: true });
    const name = `${screenshots.prefix}-${moment}.png`;
    await writeFile(path.join(screenshots.dir, name), buffer);
    return `${screenshots.rel}/${name}`;
  } catch {
    return undefined;
  }
}

function containerDelta(
  before: InteractionStateSnapshot | undefined,
  after: InteractionStateSnapshot | undefined,
): ReplaySide["containerDelta"] {
  if (!before || !after) return undefined;
  const beforeByKey = new Map(before.containers.containers.map((c) => [c.key, c]));
  const afterByKey = new Map(after.containers.containers.map((c) => [c.key, c]));
  let added = 0;
  let removed = 0;
  let visibilityChanged = 0;
  for (const [key, container] of afterByKey) {
    const previous = beforeByKey.get(key);
    if (!previous) added++;
    else if (previous.visible !== container.visible) visibilityChanged++;
  }
  for (const key of beforeByKey.keys()) {
    if (!afterByKey.has(key)) removed++;
  }
  return { added, removed, visibilityChanged };
}

/** load → bounded network idle → fixed settle (Task 11's own policy). */
async function loadForAction(page: Page, url: string): Promise<string> {
  const response = await page.goto(url, { waitUntil: "load", timeout: QA_NAV_TIMEOUT_MS });
  try {
    await page.waitForLoadState("networkidle", { timeout: LOAD_NETWORK_IDLE_TIMEOUT_MS });
  } catch {
    // Bounded on purpose.
  }
  await page.waitForTimeout(LOAD_SETTLE_MS);
  return response?.url() ?? page.url();
}

/** 2 rAF → fixed settle → bounded network quiet (Task 11's own policy). */
async function settleAfterAction(page: Page): Promise<void> {
  try {
    await waitForAnimationFrames(page);
  } catch {
    // A torn-down execution context still gets the fixed settle below.
  }
  await page.waitForTimeout(AFTER_SETTLE_MS);
  try {
    await page.waitForLoadState("networkidle", { timeout: AFTER_NETWORK_QUIET_TIMEOUT_MS });
  } catch {
    // Never a hard requirement.
  }
}

export interface OriginalReplayInput {
  browser: Browser;
  url: string;
  profile: ViewportProfile;
  descriptor: LocatorDescriptor;
  controls: SnapshotControlInput[];
  /** Read the target's full computed style in the after state (items 70, 71). */
  captureTargetStyle: boolean;
  /** Task 17 §6 — the pattern's observed user-visible target regions. */
  observedTargets?: readonly CompiledObservedTarget[];
  /** Task 17 §6 — write before/after viewport screenshots when present. */
  screenshots?: ReplayScreenshots;
}

/**
 * Replay one action on the LIVE ORIGINAL, with Task 11's safety guards armed.
 *
 * Never throws for a site-caused problem: a page that will not load, a control
 * that is gone and a click Playwright refuses all come back as an `outcome`.
 */
export async function replayOriginal(
  input: OriginalReplayInput,
): Promise<ReplaySide> {
  const context = await newQaContext(input.browser, input.profile);
  const safetyEvents: string[] = [];
  let guard: SafetyGuard | undefined;
  try {
    const page = await context.newPage();
    page.setDefaultNavigationTimeout(QA_NAV_TIMEOUT_MS);
    guard = await SafetyGuard.install(context, page, input.url);

    let finalUrl: string;
    try {
      finalUrl = await loadForAction(page, input.url);
    } catch (err) {
      return {
        attempted: false,
        ok: false,
        outcome: "load-error",
        urlChanged: false,
        safetyEvents,
        error: short(err instanceof Error ? err.message : String(err)),
      };
    }
    guard.arm(finalUrl);

    const resolved = await resolveLiveCandidate(page, input.descriptor);
    if (!resolved.element) {
      return {
        attempted: false,
        ok: false,
        outcome: resolved.resolution.status,
        urlChanged: false,
        safetyEvents: guard.events().map((event) => event.type),
      };
    }
    const element = resolved.element;

    await installMutationObserver(page);
    const before = await captureSnapshot(page, element, input.controls);
    const triggerBefore = await readElementState(page, element, false, []);
    const targetHandleBefore = await firstTargetHandle(page, input.controls, element);
    const targetBefore = await readElementState(
      page,
      targetHandleBefore,
      input.captureTargetStyle,
      TARGET_STATE_STYLE_PROPERTIES,
    );
    const observedBefore = await captureOriginalObserved(
      page,
      input.observedTargets ?? [],
    );
    const beforeScreenshot = await shoot(page, input.screenshots, "before");

    try {
      await element.click({ timeout: QA_ACTION_TIMEOUT_MS });
    } catch (err) {
      const mutations = await collectMutations(page).catch(() => undefined);
      return {
        attempted: true,
        ok: false,
        outcome: "click-error",
        urlChanged: false,
        triggerBefore,
        targetBefore,
        ...(mutations ? { mutationCount: mutations.observedCount } : {}),
        safetyEvents: guard.events().map((event) => event.type),
        error: short(err instanceof Error ? err.message : String(err)),
      };
    }

    await settleAfterAction(page);
    const mutations = await collectMutations(page).catch(() => undefined);

    let afterElement: ElementHandle<Element> | null = element;
    const stillConnected = await element
      .evaluate((el: Element) => el.isConnected)
      .catch(() => false);
    if (!stillConnected) {
      const again = await resolveLiveCandidate(page, input.descriptor);
      afterElement = again.element ?? null;
    }
    const after = await captureSnapshot(page, afterElement, input.controls);
    const triggerAfter = await readElementState(page, afterElement, false, []);
    const targetHandleAfter = await firstTargetHandle(page, input.controls, afterElement);
    const targetAfter = await readElementState(
      page,
      targetHandleAfter,
      input.captureTargetStyle,
      TARGET_STATE_STYLE_PROPERTIES,
    );
    const afterScreenshot = await shoot(page, input.screenshots, "after");

    // Observed targets, after side: re-resolve — the click may have mounted the
    // region the before pass could not find.
    const observedReplays: ObservedTargetReplay[] = [];
    for (const record of input.observedTargets ?? []) {
      const beforeEntry = observedBefore.get(record.discoveryId);
      const { handle, resolvedBy } = await originalObservedHandle(page, record);
      const afterState = await readElementState(page, handle, false, [], true);
      const effectiveResolvedBy = resolvedBy ?? beforeEntry?.resolvedBy;
      observedReplays.push({
        discoveryId: record.discoveryId,
        ...(effectiveResolvedBy !== undefined
          ? { resolvedBy: effectiveResolvedBy }
          : {}),
        before: beforeEntry?.state ?? { exists: false },
        after: afterState,
      });
    }

    return {
      attempted: true,
      ok: true,
      outcome: "replayed",
      urlChanged: before.url !== after.url,
      triggerBefore,
      triggerAfter,
      targetBefore,
      targetAfter,
      ...(observedReplays.length > 0 ? { observedTargets: observedReplays } : {}),
      ...(beforeScreenshot !== undefined ? { beforeScreenshot } : {}),
      ...(afterScreenshot !== undefined ? { afterScreenshot } : {}),
      ...(containerDelta(before, after) ? { containerDelta: containerDelta(before, after) } : {}),
      ...(mutations ? { mutationCount: mutations.observedCount } : {}),
      safetyEvents: guard.events().map((event) => event.type),
    };
  } catch (err) {
    return {
      attempted: false,
      ok: false,
      outcome: "replay-error",
      urlChanged: false,
      safetyEvents,
      error: short(err instanceof Error ? err.message : String(err)),
    };
  } finally {
    guard?.disarm();
    await context.close().catch(() => {});
  }
}

/**
 * The first declared control target, as a live handle (or null).
 *
 * The `details` relation is resolved through the TRIGGER (`summary.closest(
 * "details")`), exactly as Task 11's own snapshot does — taking the first
 * `<details>` in the document would silently measure an unrelated disclosure on
 * any page with more than one.
 */
async function firstTargetHandle(
  page: Page,
  controls: readonly SnapshotControlInput[],
  trigger: ElementHandle<Element> | null,
): Promise<ElementHandle<Element> | null> {
  for (const control of controls) {
    if (control.relation === "details") {
      if (!trigger) continue;
      const handle = await trigger
        .evaluateHandle((el: Element) => el.closest("details"))
        .catch(() => null);
      const element = handle?.asElement() as ElementHandle<Element> | null;
      if (element) return element;
      continue;
    }
    if (!control.targetDomId) continue;
    const handle = await page.$(`#${cssEscape(control.targetDomId)}`);
    if (handle) return handle;
  }
  return null;
}

/** Minimal CSS.escape for ids used in a selector (Node has no CSS global). */
export function cssEscape(value: string): string {
  return value.replace(/[^a-zA-Z0-9_-]/g, (character) => `\\${character}`);
}

export interface CloneReplayInput {
  browser: Browser;
  baseUrl: string;
  clonePath: string;
  profile: ViewportProfile;
  viewportId: "desktop" | "mobile";
  pattern: CompiledPattern;
  /** The static target's SiteSpec node id, when the binding has one. */
  targetNodeId?: string;
  captureTargetStyle: boolean;
  /** Task 17 §6 — the pattern's observed user-visible target regions. */
  observedTargets?: readonly CompiledObservedTarget[];
  /** Task 17 §6 — write before/after viewport screenshots when present. */
  screenshots?: ReplayScreenshots;
}

/** Clone-side handle for one observed target region (Task 17 §6). */
async function cloneObservedHandle(
  page: Page,
  record: CompiledObservedTarget,
  pattern: CompiledPattern,
  variantSelector: string,
  mountedIndex: number,
): Promise<{ handle: ElementHandle<Element> | null; resolvedBy?: "node-id" | "mounted-id" }> {
  if (record.targetNodeId !== undefined) {
    const handle = await page
      .$(`${variantSelector} [data-wr-node="${record.targetNodeId}"]`)
      .catch(() => null);
    return handle ? { handle, resolvedBy: "node-id" } : { handle: null };
  }
  // Task 17.1: a mounted region carries its DISCOVERY id
  // (`wr-obs-<patternId>-<discoveryId>`) — a stable identity, not a position.
  const byDiscovery = await page
    .$(`#${cssEscape(`wr-obs-${pattern.patternId}-${record.discoveryId}`)}`)
    .catch(() => null);
  if (byDiscovery) return { handle: byDiscovery, resolvedBy: "mounted-id" };
  // A discovered duplicate of the DECLARED dynamic mount was deliberately not
  // mounted a second time — the declared region IS the clone-side element.
  if (
    pattern.target?.dynamic === true &&
    record.kind === "newly-mounted" &&
    (record.targetSourceHtmlId === undefined ||
      record.targetSourceHtmlId === pattern.target.targetSourceHtmlId)
  ) {
    const declared = await page
      .$(
        `#${cssEscape(
          `wr-dyn-${pattern.pageId}-${pattern.viewport}-${pattern.patternId}`,
        )}`,
      )
      .catch(() => null);
    if (declared) return { handle: declared, resolvedBy: "mounted-id" };
  }
  // Legacy fallback (pre-17.1 clones): the k-th unresolved record maps to the
  // k-th `wr-obs-<patternId>-<entryIndex>` region in document order.
  const mounted = await page
    .$$(`[id^="wr-obs-${cssEscape(pattern.patternId)}-"]`)
    .catch(() => [] as ElementHandle<Element>[]);
  const handle = mounted[mountedIndex] ?? null;
  return handle ? { handle, resolvedBy: "mounted-id" } : { handle: null };
}

/**
 * Replay the same action on the CLONE.
 *
 * The trigger is found by `data-wr-pattern-id` INSIDE the active variant — an
 * exact selector, because the clone stamped it itself. The target is the
 * generated DOM id for a static region, or the dynamic region id the runtime
 * mounts. There is no fallback search: a trigger that is not there is a finding,
 * not something to go looking for.
 */
export async function replayClone(input: CloneReplayInput): Promise<ReplaySide> {
  const context = await newQaContext(input.browser, input.profile);
  try {
    const page = await context.newPage();
    page.setDefaultNavigationTimeout(QA_NAV_TIMEOUT_MS);
    const requestUrl = `${input.baseUrl}${input.clonePath}`;
    try {
      await loadForAction(page, requestUrl);
    } catch (err) {
      return {
        attempted: false,
        ok: false,
        outcome: "load-error",
        urlChanged: false,
        safetyEvents: [],
        error: short(err instanceof Error ? err.message : String(err)),
      };
    }

    const variantSelector = `[data-wr-viewport="${input.viewportId}"]`;
    const triggerSelector = `${variantSelector} [data-wr-pattern-id="${input.pattern.patternId}"]`;
    const trigger = await page.$(triggerSelector);
    if (!trigger) {
      return {
        attempted: false,
        ok: false,
        outcome: "trigger-not-found",
        urlChanged: false,
        safetyEvents: [],
      };
    }
    const matches = await page.$$(triggerSelector);
    if (matches.length > 1) {
      return {
        attempted: false,
        ok: false,
        outcome: "trigger-ambiguous",
        urlChanged: false,
        safetyEvents: [],
      };
    }

    const targetSelector = cloneTargetSelector(input, variantSelector);
    const urlBefore = page.url();
    const triggerBefore = await readElementState(page, trigger, false, []);
    const targetBefore = await readElementState(
      page,
      targetSelector ? await page.$(targetSelector) : null,
      input.captureTargetStyle,
      TARGET_STATE_STYLE_PROPERTIES,
    );
    const observedRecords = input.observedTargets ?? [];
    const observedBeforeStates = new Map<string, ReplayState>();
    {
      let mountedIndex = 0;
      for (const record of observedRecords) {
        const { handle } = await cloneObservedHandle(
          page,
          record,
          input.pattern,
          variantSelector,
          record.targetNodeId === undefined ? mountedIndex++ : 0,
        );
        observedBeforeStates.set(
          record.discoveryId,
          await readElementState(page, handle, false, [], true),
        );
      }
    }
    const beforeScreenshot = await shoot(page, input.screenshots, "before");

    try {
      await trigger.click({ timeout: QA_ACTION_TIMEOUT_MS });
    } catch (err) {
      return {
        attempted: true,
        ok: false,
        outcome: "click-error",
        urlChanged: false,
        triggerBefore,
        targetBefore,
        safetyEvents: [],
        error: short(err instanceof Error ? err.message : String(err)),
      };
    }

    await settleAfterAction(page);

    const triggerAfterHandle = (await page.$(triggerSelector)) ?? null;
    const triggerAfter = await readElementState(page, triggerAfterHandle, false, []);
    const targetAfter = await readElementState(
      page,
      targetSelector ? await page.$(targetSelector) : null,
      input.captureTargetStyle,
      TARGET_STATE_STYLE_PROPERTIES,
    );
    const afterScreenshot = await shoot(page, input.screenshots, "after");

    const observedReplays: ObservedTargetReplay[] = [];
    {
      let mountedIndex = 0;
      for (const record of observedRecords) {
        const { handle, resolvedBy } = await cloneObservedHandle(
          page,
          record,
          input.pattern,
          variantSelector,
          record.targetNodeId === undefined ? mountedIndex++ : 0,
        );
        const afterState = await readElementState(page, handle, false, [], true);
        observedReplays.push({
          discoveryId: record.discoveryId,
          ...(resolvedBy !== undefined ? { resolvedBy } : {}),
          before: observedBeforeStates.get(record.discoveryId) ?? { exists: false },
          after: afterState,
        });
      }
    }

    return {
      attempted: true,
      ok: true,
      outcome: "replayed",
      urlChanged: page.url() !== urlBefore,
      triggerBefore,
      triggerAfter,
      targetBefore,
      targetAfter,
      ...(observedReplays.length > 0 ? { observedTargets: observedReplays } : {}),
      ...(beforeScreenshot !== undefined ? { beforeScreenshot } : {}),
      ...(afterScreenshot !== undefined ? { afterScreenshot } : {}),
      safetyEvents: [],
    };
  } catch (err) {
    return {
      attempted: false,
      ok: false,
      outcome: "replay-error",
      urlChanged: false,
      safetyEvents: [],
      error: short(err instanceof Error ? err.message : String(err)),
    };
  } finally {
    await context.close().catch(() => {});
  }
}

/** The clone-side selector for a pattern's target region, when it has one. */
export function cloneTargetSelector(
  input: {
    pattern: CompiledPattern;
    targetNodeId?: string;
    viewportId: "desktop" | "mobile";
  },
  variantSelector: string,
): string | undefined {
  const { pattern } = input;
  if (pattern.target?.dynamic) {
    // The runtime mounts it OUTSIDE the trigger's subtree but inside the variant.
    const id = dynamicTargetDomId(pattern.pageId, pattern.viewport, pattern.patternId);
    return `#${cssEscape(id)}`;
  }
  if (input.targetNodeId !== undefined) {
    return `${variantSelector} [data-wr-node="${input.targetNodeId}"]`;
  }
  if (pattern.mechanism === "native-details") {
    // The `<details>` that CONTAINS this trigger, never the page's first one.
    return `${variantSelector} details:has([data-wr-pattern-id="${pattern.patternId}"])`;
  }
  return undefined;
}
