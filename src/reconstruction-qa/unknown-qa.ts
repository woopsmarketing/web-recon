import type { Browser } from "playwright";
import type { ViewportProfile } from "../observer/types.js";
import type {
  UnknownGroup,
  UnknownInteractionsArtifact,
} from "../interaction-patterns/types.js";
import type { CompiledUnknownInteraction } from "../sitespec/index.js";
import type { LocatorDescriptor, SnapshotControlInput } from "../interaction-explorer/index.js";
import { newQaContext } from "./capture-page.js";
import { replayOriginal } from "./interaction-qa.js";
import {
  MAX_UNKNOWN_QA_PER_SITE,
  QA_ACTION_TIMEOUT_MS,
  QA_NAV_TIMEOUT_MS,
  UNKNOWN_SIGNATURE_PRIORITY,
  type ReplaySide,
} from "./types.js";

/**
 * Unknown-interaction QA (items 76–80).
 *
 * The purpose is NOT to work out what the unknown behavior is, and certainly not
 * to implement it (item 78). It is to PROVE the gap: the original does something
 * observable here, the clone deliberately does nothing, and the difference is
 * measured rather than assumed.
 *
 * The seoworld hamburger is the canonical case (item 79). It flips `aria-label`
 * between "메뉴 열기" and "메뉴 닫기", Task 12 refused to call that a menu because
 * `aria-label` is not a state attribute and no close-word dictionary exists in
 * this repo, and Task 14 therefore generated nothing for it. Task 15 must detect
 * that the original changes and the clone does not — and must still generate
 * nothing. Under no evidence does a Korean menu string become a rule here.
 *
 * ## Cost control
 *
 * All 63 unknown occurrences are not replayed. Task 12 already collapsed them
 * into signature groups and chose a deterministic representative for each, so
 * this reuses that choice — one replay per signature, capped at
 * {@link MAX_UNKNOWN_QA_PER_SITE}, with the group priority of item 77 deciding
 * which signatures get a slot.
 */

/** Rank a signature group by its reason, per item 77. */
function priorityRank(group: UnknownGroup): number {
  const index = UNKNOWN_SIGNATURE_PRIORITY.indexOf(group.reason);
  return index < 0 ? UNKNOWN_SIGNATURE_PRIORITY.length : index;
}

export interface UnknownSample {
  group: UnknownGroup;
  /** The Task 12 case id chosen — Task 12's own representative. */
  caseId: string;
}

/**
 * Choose one representative per signature, capped and deterministic.
 *
 * Ties are broken by signature string, never by input order, so two runs over
 * the same artifact sample the same cases.
 */
export function selectUnknownSamples(
  artifact: UnknownInteractionsArtifact,
  limit: number = MAX_UNKNOWN_QA_PER_SITE,
): UnknownSample[] {
  const ordered = [...artifact.signatureGroups].sort((a, b) => {
    const rank = priorityRank(a) - priorityRank(b);
    if (rank !== 0) return rank;
    if (b.caseCount !== a.caseCount) return b.caseCount - a.caseCount;
    return a.signature < b.signature ? -1 : a.signature > b.signature ? 1 : 0;
  });
  return ordered
    .slice(0, limit)
    .map((group) => ({ group, caseId: group.representativeCaseId }));
}

export interface UnknownReplayInput {
  browser: Browser;
  url: string;
  profile: ViewportProfile;
  descriptor: LocatorDescriptor;
  controls: SnapshotControlInput[];
}

/** Replay an unknown trigger on the live original. Same guards as a pattern. */
export async function replayUnknownOriginal(
  input: UnknownReplayInput,
): Promise<ReplaySide> {
  return replayOriginal({
    browser: input.browser,
    url: input.url,
    profile: input.profile,
    descriptor: input.descriptor,
    controls: input.controls,
    captureTargetStyle: false,
  });
}

export interface UnknownCloneReplayInput {
  browser: Browser;
  baseUrl: string;
  clonePath: string;
  profile: ViewportProfile;
  viewportId: "desktop" | "mobile";
  unknown: CompiledUnknownInteraction;
}

/**
 * Replay the same trigger on the CLONE.
 *
 * Located by `data-wr-unknown-id`, which Task 14 stamps on every annotated
 * unknown trigger. The expectation is explicitly that NOTHING happens — the
 * annotation carries no behavior — and the measurement is what makes "nothing
 * happened" a recorded fact instead of a belief.
 */
export async function replayUnknownClone(
  input: UnknownCloneReplayInput,
): Promise<ReplaySide> {
  const context = await newQaContext(input.browser, input.profile);
  try {
    const page = await context.newPage();
    page.setDefaultNavigationTimeout(QA_NAV_TIMEOUT_MS);
    try {
      await page.goto(`${input.baseUrl}${input.clonePath}`, {
        waitUntil: "load",
        timeout: QA_NAV_TIMEOUT_MS,
      });
      await page.waitForTimeout(1_000);
    } catch (err) {
      return {
        attempted: false,
        ok: false,
        outcome: "load-error",
        urlChanged: false,
        safetyEvents: [],
        error: err instanceof Error ? err.message.split("\n", 1)[0] : String(err),
      };
    }

    const selector =
      `[data-wr-viewport="${input.viewportId}"] ` +
      `[data-wr-unknown-id="${input.unknown.unknownId}"]`;
    const trigger = await page.$(selector);
    if (!trigger) {
      return {
        attempted: false,
        ok: false,
        outcome: "trigger-not-found",
        urlChanged: false,
        safetyEvents: [],
      };
    }

    const urlBefore = page.url();
    const before = await snapshotDocument(page, selector);
    try {
      await trigger.click({ timeout: QA_ACTION_TIMEOUT_MS });
    } catch (err) {
      return {
        attempted: true,
        ok: false,
        outcome: "click-error",
        urlChanged: false,
        triggerBefore: before.trigger,
        safetyEvents: [],
        error: err instanceof Error ? err.message.split("\n", 1)[0] : String(err),
      };
    }
    await page.waitForTimeout(800);
    const after = await snapshotDocument(page, selector);

    return {
      attempted: true,
      ok: true,
      outcome: "replayed",
      urlChanged: page.url() !== urlBefore,
      triggerBefore: before.trigger,
      triggerAfter: after.trigger,
      containerDelta: {
        added: Math.max(0, after.containerCount - before.containerCount),
        removed: Math.max(0, before.containerCount - after.containerCount),
        visibilityChanged:
          after.visibleContainerCount === before.visibleContainerCount ? 0 : 1,
      },
      safetyEvents: [],
    };
  } catch (err) {
    return {
      attempted: false,
      ok: false,
      outcome: "replay-error",
      urlChanged: false,
      safetyEvents: [],
      error: err instanceof Error ? err.message.split("\n", 1)[0] : String(err),
    };
  } finally {
    await context.close().catch(() => {});
  }
}

/** A compact document snapshot around one clone trigger. */
async function snapshotDocument(
  page: import("playwright").Page,
  selector: string,
): Promise<{
  trigger: ReplaySide["triggerBefore"];
  containerCount: number;
  visibleContainerCount: number;
}> {
  return page.evaluate((sel: string) => {
    const containerSelector =
      "details,dialog,[popover],[role=dialog],[role=alertdialog],[role=menu]," +
      "[role=listbox],[role=tabpanel],[aria-hidden]";
    const containers = Array.from(document.querySelectorAll(containerSelector));
    let visibleContainerCount = 0;
    for (const container of containers) {
      const style = getComputedStyle(container);
      const rect = container.getBoundingClientRect();
      if (style.display !== "none" && rect.width > 0 && rect.height > 0) {
        visibleContainerCount++;
      }
    }
    const element = document.querySelector(sel);
    if (!element) {
      return { trigger: { exists: false }, containerCount: containers.length, visibleContainerCount };
    }
    const style = getComputedStyle(element);
    const rect = element.getBoundingClientRect();
    const attributes: Record<string, string> = {};
    for (const attribute of Array.from(element.attributes)) {
      if (
        attribute.name.indexOf("aria-") === 0 ||
        attribute.name === "open" ||
        attribute.name === "checked" ||
        attribute.name === "hidden" ||
        attribute.name === "role"
      ) {
        attributes[attribute.name] = attribute.value;
      }
    }
    return {
      trigger: {
        exists: true,
        visible:
          style.display !== "none" &&
          style.visibility !== "hidden" &&
          rect.width > 0 &&
          rect.height > 0,
        tagName: element.tagName.toLowerCase(),
        attributes,
        boundingBox: {
          x: Math.round(rect.x * 100) / 100,
          y: Math.round(rect.y * 100) / 100,
          width: Math.round(rect.width * 100) / 100,
          height: Math.round(rect.height * 100) / 100,
        },
        childElementCount: element.childElementCount,
      },
      containerCount: containers.length,
      visibleContainerCount,
    };
  }, selector);
}

/**
 * Which observable fields moved on one side.
 *
 * Named fields rather than a boolean, so "the original changed `aria-label` and
 * the clone changed nothing" is a statement a report can print and a reviewer
 * can argue with.
 */
export function changedFields(side: ReplaySide): string[] {
  const fields = new Set<string>();
  const before = side.triggerBefore;
  const after = side.triggerAfter;
  if (before?.exists && after?.exists) {
    const beforeAttributes = before.attributes ?? {};
    const afterAttributes = after.attributes ?? {};
    for (const name of new Set([
      ...Object.keys(beforeAttributes),
      ...Object.keys(afterAttributes),
    ])) {
      if (beforeAttributes[name] !== afterAttributes[name]) fields.add(`trigger:${name}`);
    }
    if (before.visible !== after.visible) fields.add("trigger:visible");
    if (before.childElementCount !== after.childElementCount) {
      fields.add("trigger:childElementCount");
    }
    const beforeState = before.state ?? {};
    const afterState = after.state ?? {};
    for (const name of new Set([...Object.keys(beforeState), ...Object.keys(afterState)])) {
      if (beforeState[name] !== afterState[name]) fields.add(`trigger-state:${name}`);
    }
  } else if (before?.exists && !after?.exists) {
    fields.add("trigger:removed");
  }
  const targetBefore = side.targetBefore;
  const targetAfter = side.targetAfter;
  if (targetBefore && targetAfter) {
    if (targetBefore.exists !== targetAfter.exists) fields.add("target:exists");
    else if (targetBefore.visible !== targetAfter.visible) fields.add("target:visible");
  }
  if (side.containerDelta) {
    if (side.containerDelta.added > 0) fields.add("containers:added");
    if (side.containerDelta.removed > 0) fields.add("containers:removed");
    if (side.containerDelta.visibilityChanged > 0) fields.add("containers:visibility");
  }
  if (side.urlChanged) fields.add("url");
  return [...fields].sort();
}
