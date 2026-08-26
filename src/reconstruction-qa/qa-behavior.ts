import type { Browser } from "playwright";
import type { ViewportId, ViewportProfile } from "../observer/types.js";
import { clonePathFor } from "../reconstruction/route-plan.js";
import type { CompiledPattern, CompiledUnknownInteraction } from "../sitespec/index.js";
import type { SnapshotControlInput } from "../interaction-explorer/index.js";
import type { DiffDraft } from "./classify-diff.js";
import {
  compareBehavior,
  compareOpenStateStyle,
  isSelfReferentialTarget,
} from "./compare-behavior.js";
import { loadActionObservation, type QaInputs } from "./load-inputs.js";
import { replayClone, replayOriginal } from "./interaction-qa.js";
import { changedFields, replayUnknownClone, replayUnknownOriginal, type UnknownSample } from "./unknown-qa.js";
import { newQaContext, gotoQa, runCapture, stabilize } from "./capture-page.js";
import type { StateStyleCandidate } from "./propose-corrections.js";
import {
  SCHEMA_VERSION,
  type BehaviorVerdict,
  type FamilyAuditResult,
  type InteractionQaResult,
  type ReplaySide,
  type UnknownQaResult,
} from "./types.js";

/**
 * Behavior, unknown and family-audit phases (items 61–80, 23–25, 152).
 *
 * Everything here is a COMPARISON between two independently measured sides, and
 * the comparison vocabulary is fixed by item 66: candidate state field, target
 * mount/unmount, target visibility, open/checked/selected, dynamic target tag
 * and role, dismiss, and URL/navigation. Nothing outside that list can make a
 * pattern a mismatch, which is what stops a transition animation or an analytics
 * mutation from becoming a behavior finding.
 */

function stateValue(side: ReplaySide, when: "before" | "after", field: string): string {
  const state = when === "before" ? side.triggerBefore : side.triggerAfter;
  if (!state?.exists) return "(absent)";
  if (field === "open" || field === "checked" || field === "selected") {
    const flag = state.state?.[field];
    if (flag !== undefined) return String(flag);
  }
  return state.attributes?.[field] ?? "(unset)";
}

export interface PatternQaOutcome {
  result: InteractionQaResult;
  drafts: DiffDraft[];
  stateStyle?: StateStyleCandidate;
}

export interface QaOnePatternInput {
  pattern: CompiledPattern;
  inputs: QaInputs;
  browser: Browser;
  cloneBaseUrl: string;
  profile: ViewportProfile;
  useLiveOriginal: boolean;
  routeByPageId: ReadonlyMap<string, string>;
  /** `pageId|viewport` of pages whose live original drifted (item 71). */
  driftedPages: ReadonlySet<string>;
  /**
   * Task 17 §6 — when present, each replay writes before/after viewport
   * screenshots under `<dir>/<patternId>/` (the Manual Visual Review's
   * four-capture shape, folded into production QA).
   */
  screenshotRoot?: { dir: string; rel: string };
}

/** Replay one verified pattern on both sides and compare (items 65–75). */
export async function qaOnePattern(
  input: QaOnePatternInput,
): Promise<PatternQaOutcome | undefined> {
  const { pattern, inputs } = input;
  const page = inputs.siteSpec.pages.find((entry) => entry.pageId === pattern.pageId);
  if (!page) return undefined;
  const url = input.routeByPageId.get(pattern.pageId) ?? page.url;
  let clonePath = "/";
  try {
    clonePath = clonePathFor(new URL(url));
  } catch {
    clonePath = "/";
  }

  const targetNodeId =
    pattern.target &&
    !pattern.target.dynamic &&
    pattern.target.staticNodeResolved &&
    pattern.target.targetNodeId !== undefined &&
    pattern.target.targetNodeId !== pattern.triggerNodeId
      ? pattern.target.targetNodeId
      : undefined;
  const targetIsDynamic = pattern.target?.dynamic === true;
  const captureTargetStyle = targetNodeId !== undefined;
  const observedTargets = pattern.observedTargets ?? [];
  const screenshotsFor = (
    prefix: "original" | "clone",
  ): { dir: string; rel: string; prefix: string } | undefined =>
    input.screenshotRoot
      ? {
          dir: `${input.screenshotRoot.dir}/${pattern.patternId}`,
          rel: `${input.screenshotRoot.rel}/${pattern.patternId}`,
          prefix,
        }
      : undefined;

  // --- original -------------------------------------------------------------
  let original: ReplaySide = {
    attempted: false,
    ok: false,
    outcome: "live-original-disabled",
    urlChanged: false,
    safetyEvents: [],
  };
  if (input.useLiveOriginal) {
    const actionId = pattern.provenance.actionId;
    const actionFile = actionId ? inputs.actionFiles.get(actionId) : undefined;
    if (actionFile) {
      const observation = await loadActionObservation(actionFile);
      const controls: SnapshotControlInput[] = (observation.before?.targets ?? []).map(
        (target) => ({
          relation: target.relation,
          ...(target.targetDomId !== undefined ? { targetDomId: target.targetDomId } : {}),
        }),
      );
      const originalScreenshots = screenshotsFor("original");
      original = await replayOriginal({
        browser: input.browser,
        url,
        profile: input.profile,
        descriptor: observation.locatorResolution.locatorDescriptor,
        controls,
        captureTargetStyle,
        ...(observedTargets.length > 0 ? { observedTargets } : {}),
        ...(originalScreenshots ? { screenshots: originalScreenshots } : {}),
      });
    } else {
      original = {
        attempted: false,
        ok: false,
        outcome: "task11-action-artifact-missing",
        urlChanged: false,
        safetyEvents: [],
      };
    }
  }

  // --- clone ----------------------------------------------------------------
  const cloneScreenshots = screenshotsFor("clone");
  const clone = await replayClone({
    browser: input.browser,
    baseUrl: input.cloneBaseUrl,
    clonePath,
    profile: input.profile,
    viewportId: pattern.viewport,
    pattern,
    ...(targetNodeId !== undefined ? { targetNodeId } : {}),
    captureTargetStyle,
    ...(observedTargets.length > 0 ? { observedTargets } : {}),
    ...(cloneScreenshots ? { screenshots: cloneScreenshots } : {}),
  });

  // --- compare (item 66; the ONE comparison, shared with the loop) ----------
  const comparison = compareBehavior({
    pattern,
    original,
    clone,
    liveOriginalUsed: input.useLiveOriginal,
  });
  const verdict = comparison.verdict;
  const mismatchFields = comparison.mismatchFields;

  // --- open-state style (items 70, 71) -------------------------------------
  const driftKey = `${pattern.pageId}|${pattern.viewport}`;
  const openStateEvidenceUsable =
    input.useLiveOriginal &&
    original.ok &&
    targetNodeId !== undefined &&
    original.targetAfter?.exists === true &&
    original.targetAfter.visible === true &&
    original.targetAfter.computed !== undefined &&
    !original.urlChanged &&
    original.safetyEvents.length === 0 &&
    !input.driftedPages.has(driftKey);

  const targetStyleMismatches =
    openStateEvidenceUsable && clone.ok && clone.targetAfter?.exists === true
      ? compareOpenStateStyle(original, clone)
      : [];

  const result: InteractionQaResult = {
    schemaVersion: SCHEMA_VERSION,
    patternId: pattern.patternId,
    patternType: pattern.patternType,
    mechanism: pattern.mechanism,
    pageId: pattern.pageId,
    viewport: pattern.viewport,
    url,
    triggerNodeId: pattern.triggerNodeId,
    ...(targetNodeId !== undefined ? { targetNodeId } : {}),
    targetIsDynamic,
    original,
    clone,
    verdict,
    // Task 17 §3 — the two separated axes.
    triggerState: comparison.triggerState,
    visibleTarget: comparison.visibleTarget,
    visibleTargetFields: comparison.visibleTargetFields,
    mismatchFields,
    // Task 16: kept even when the counts agree, so the report can state
    // "N regions mounted M observed children" instead of only counting failures.
    ...(comparison.dynamicTargetChildren
      ? { dynamicTargetChildren: comparison.dynamicTargetChildren }
      : {}),
    targetStyleMismatches,
    openStateEvidenceUsable,
    diffIds: [],
    limitations: comparison.limitations,
    capturedAt: new Date().toISOString(),
  };

  // --- diffs ---------------------------------------------------------------
  const drafts: DiffDraft[] = [];
  const base = {
    pageId: pattern.pageId,
    viewport: pattern.viewport,
    route: url,
    patternId: pattern.patternId,
  };
  const visibleTargetFieldSet = new Set(comparison.visibleTargetFields);
  const triggerAxisFields = result.mismatchFields.filter(
    (field) => !visibleTargetFieldSet.has(field),
  );
  if (
    verdict === "mismatch" &&
    triggerAxisFields.length > 0 &&
    !comparison.explainedByDynamicContentGap
  ) {
    drafts.push({
      ...base,
      dimension: "interaction",
      classification: "interaction-state-mismatch",
      snapshotExpected: `${pattern.transition.field}: ${pattern.transition.before}→${pattern.transition.after}`,
      liveOriginal: original.ok ? describeSide(original, pattern) : original.outcome,
      cloneActual: clone.ok ? describeSide(clone, pattern) : clone.outcome,
      evidence: triggerAxisFields.map((field) => ({
        kind: "behavior-field",
        field,
      })),
    });
  }
  // Task 17 §6 — the user-visible target axis gets its own finding, so "the
  // aria flipped but nothing appeared" can never hide inside a trigger metric.
  if (
    comparison.visibleTarget === "mismatch" &&
    !comparison.explainedByDynamicContentGap
  ) {
    drafts.push({
      ...base,
      dimension: "interaction",
      classification: "interaction-visible-target-mismatch",
      liveOriginal: original.ok
        ? "target region changed as observed"
        : original.outcome,
      cloneActual: `disagreeing fields: ${comparison.visibleTargetFields.join(", ")}`,
      evidence: comparison.visibleTargetFields.map((field) => ({
        kind: "visible-target-field",
        field,
      })),
    });
  }
  if (verdict === "source-drifted") {
    drafts.push({
      ...base,
      dimension: "interaction",
      classification: "source-structural-drift",
      sourceDrift: true,
      liveOriginal: original.outcome,
      evidence: [{ kind: "original-locator", field: original.outcome }],
    });
  }
  if (comparison.dynamicContentGap) {
    const originalChildren = original.targetAfter?.childElementCount ?? 0;
    {
      drafts.push({
        ...base,
        dimension: "interaction",
        classification: "dynamic-target-content-unobserved",
        liveOriginal: `${originalChildren} child element(s), ${original.targetAfter?.interactiveDescendantCount ?? 0} interactive`,
        cloneActual: "empty region with the observed tag and role",
        evidence: [
          { kind: "dynamic-target", field: "childElementCount", count: originalChildren },
        ],
      });
    }
  }
  if (targetStyleMismatches.length > 0) {
    drafts.push({
      ...base,
      dimension: "interaction",
      classification: "interaction-target-style-mismatch",
      ...(targetNodeId !== undefined ? { nodeId: targetNodeId } : {}),
      property: targetStyleMismatches.map((entry) => entry.property).join(","),
      liveOriginal: targetStyleMismatches
        .map((entry) => `${entry.property}:${entry.original}`)
        .join("; "),
      cloneActual: targetStyleMismatches
        .map((entry) => `${entry.property}:${entry.clone}`)
        .join("; "),
      evidence: targetStyleMismatches.map((entry) => ({
        kind: "open-state-style",
        field: entry.property,
        liveOriginal: entry.original,
        clone: entry.clone,
      })),
      autoFixEligibility: "eligible",
      correctionType: "interaction-target-state-style",
    });
  }

  const stateStyle: StateStyleCandidate | undefined =
    targetStyleMismatches.length > 0 && targetNodeId !== undefined
      ? {
          patternId: pattern.patternId,
          pageId: pattern.pageId,
          viewport: pattern.viewport,
          targetNodeId,
          mechanism: pattern.mechanism,
          observed: original.targetAfter?.computed ?? {},
          cloneOpenState: clone.targetAfter?.computed ?? {},
          diffIds: [],
          evidenceUsable: openStateEvidenceUsable,
        }
      : undefined;

  return { result, drafts, ...(stateStyle ? { stateStyle } : {}) };
}

function describeSide(side: ReplaySide, pattern: CompiledPattern): string {
  const field = pattern.transition.field;
  if (field === "exists") {
    return side.triggerAfter?.exists === true ? "trigger still present" : "trigger removed";
  }
  return `${field}: ${stateValue(side, "before", field)}→${stateValue(side, "after", field)}`;
}

// ---------------------------------------------------------------------------
// Unknown interactions
// ---------------------------------------------------------------------------

export interface UnknownQaOutcome {
  result: UnknownQaResult;
  drafts: DiffDraft[];
}

export interface QaOneUnknownInput {
  sample: UnknownSample;
  inputs: QaInputs;
  browser: Browser;
  cloneBaseUrl: string;
  profileFor: (viewport: ViewportId) => ViewportProfile;
  useLiveOriginal: boolean;
  routeByPageId: ReadonlyMap<string, string>;
}

export async function qaOneUnknown(
  input: QaOneUnknownInput,
): Promise<UnknownQaOutcome | undefined> {
  const { inputs, sample } = input;
  const compiled: CompiledUnknownInteraction | undefined =
    inputs.siteSpec.interactionSpec.unknownInteractions.find(
      (entry) => entry.unknownId === sample.caseId,
    );
  const sourceCase = inputs.unknowns.cases.find((entry) => entry.id === sample.caseId);
  if (!compiled || !sourceCase) return undefined;

  const url = input.routeByPageId.get(compiled.pageId) ?? sourceCase.source.url;
  let clonePath = "/";
  try {
    clonePath = clonePathFor(new URL(url));
  } catch {
    clonePath = "/";
  }
  const profile = input.profileFor(compiled.viewport);

  let original: ReplaySide = {
    attempted: false,
    ok: false,
    outcome: "live-original-disabled",
    urlChanged: false,
    safetyEvents: [],
  };
  if (input.useLiveOriginal) {
    const actionFile = inputs.actionFiles.get(sourceCase.source.actionId);
    if (actionFile) {
      const observation = await loadActionObservation(actionFile);
      original = await replayUnknownOriginal({
        browser: input.browser,
        url,
        profile,
        descriptor: observation.locatorResolution.locatorDescriptor,
        controls: (observation.before?.targets ?? []).map((target) => ({
          relation: target.relation,
          ...(target.targetDomId !== undefined ? { targetDomId: target.targetDomId } : {}),
        })),
      });
    } else {
      original = {
        attempted: false,
        ok: false,
        outcome: "task11-action-artifact-missing",
        urlChanged: false,
        safetyEvents: [],
      };
    }
  }

  const clone = await replayUnknownClone({
    browser: input.browser,
    baseUrl: input.cloneBaseUrl,
    clonePath,
    profile,
    viewportId: compiled.viewport,
    unknown: compiled,
  });

  const originalChangeFields = original.ok ? changedFields(original) : [];
  const cloneChangeFields = clone.ok ? changedFields(clone) : [];
  const gapDetected =
    original.ok && originalChangeFields.length > 0 && cloneChangeFields.length === 0;

  const result: UnknownQaResult = {
    schemaVersion: SCHEMA_VERSION,
    unknownId: compiled.unknownId,
    reason: compiled.reason,
    signature: sample.group.signature,
    pageId: compiled.pageId,
    viewport: compiled.viewport,
    url,
    ...(compiled.triggerNodeId !== undefined ? { triggerNodeId: compiled.triggerNodeId } : {}),
    original,
    clone,
    gapDetected,
    originalChangeFields,
    cloneChangeFields,
    autoFixEligible: false,
    recommendation: "requires-pattern-modeling",
    diffIds: [],
    capturedAt: new Date().toISOString(),
  };

  const drafts: DiffDraft[] = [];
  if (gapDetected) {
    drafts.push({
      pageId: compiled.pageId,
      viewport: compiled.viewport,
      route: url,
      unknownId: compiled.unknownId,
      dimension: "unknown-interaction",
      classification: "unknown-behavior-gap",
      liveOriginal: originalChangeFields.join(", "),
      cloneActual: "no observable change (unknown behavior is never implemented)",
      evidence: [
        { kind: "unknown-reason", field: compiled.reason },
        { kind: "original-change-fields", count: originalChangeFields.length },
      ],
      autoFixEligibility: "not-eligible-unknown-behavior",
      recommendation: "requires-pattern-modeling",
      upstreamStage: "pattern-modeling",
    });
  }
  return { result, drafts };
}

// ---------------------------------------------------------------------------
// Family audit (items 23–25)
// ---------------------------------------------------------------------------

export interface FamilyAuditTarget {
  routeId: string;
  url: string;
  familyId: string;
  representativePageId: string;
  clonePath: string;
  memberCount: number;
}

/**
 * Choose family-represented routes to audit.
 *
 * Deterministic by item 24: largest family first, then familyId, then the
 * lexically first member URL. Representative and validation-sample URLs are
 * excluded — they have their own exact observation and are already in the
 * snapshot fidelity set.
 */
export function selectFamilyAuditRoutes(
  inputs: QaInputs,
  limit: number,
): FamilyAuditTarget[] {
  const { siteSpec } = inputs.siteSpec;
  const familyById = new Map(siteSpec.families.map((family) => [family.familyId, family]));
  const candidates = siteSpec.routes
    .filter((route) => route.coverage === "family-represented" && route.renderSourcePageId)
    .map((route) => {
      const family = familyById.get(route.familyId);
      return {
        routeId: route.routeId,
        url: route.url,
        familyId: route.familyId,
        representativePageId: route.renderSourcePageId!,
        memberCount: family?.memberCount ?? 0,
      };
    });

  candidates.sort((a, b) => {
    if (b.memberCount !== a.memberCount) return b.memberCount - a.memberCount;
    const family = a.familyId.localeCompare(b.familyId);
    if (family !== 0) return family;
    return a.url.localeCompare(b.url);
  });

  // One route per family before a second from any family: a second member of the
  // same template measures the same reuse risk twice.
  const seenFamilies = new Set<string>();
  const chosen: FamilyAuditTarget[] = [];
  for (const candidate of candidates) {
    if (chosen.length >= limit) break;
    if (seenFamilies.has(candidate.familyId)) continue;
    seenFamilies.add(candidate.familyId);
    let clonePath = "/";
    try {
      clonePath = clonePathFor(new URL(candidate.url));
    } catch {
      clonePath = "/";
    }
    chosen.push({ ...candidate, clonePath });
  }
  return chosen;
}

export interface FamilyAuditOutcome {
  result: FamilyAuditResult;
  drafts: DiffDraft[];
}

/**
 * Compare a family-represented route's live original against the clone.
 *
 * A mismatch here is NOT a generator defect (item 25): the clone is rendering
 * the representative's tree because nothing was ever observed on this URL. The
 * finding is `family-representation-gap` and its recommendation is an exact
 * observation, never an auto-fix.
 */
export async function auditFamilyRoute(input: {
  target: FamilyAuditTarget;
  browser: Browser;
  cloneBaseUrl: string;
  profile: ViewportProfile;
}): Promise<FamilyAuditOutcome> {
  const { target } = input;
  const measure = async (url: string, variant?: "desktop"): Promise<
    { elements: number; textLength: number } | undefined
  > => {
    const context = await newQaContext(input.browser, input.profile);
    try {
      const page = await context.newPage();
      await gotoQa(page, url);
      await stabilize(page);
      const capture = await runCapture(page, variant);
      return {
        elements: capture.elements.length,
        textLength: capture.textSequence.join("").replace(/\s+/g, " ").trim().length,
      };
    } catch {
      return undefined;
    } finally {
      await context.close().catch(() => {});
    }
  };

  const live = await measure(target.url);
  const clone = await measure(`${input.cloneBaseUrl}${target.clonePath}`, "desktop");

  if (!live || !clone) {
    return {
      result: {
        routeId: target.routeId,
        url: target.url,
        familyId: target.familyId,
        representativePageId: target.representativePageId,
        status: live ? "clone-load-error" : "source-load-error",
        majorContentMismatch: false,
        majorStructureMismatch: false,
        diffIds: [],
        error: live ? "clone did not load" : "live original did not load",
      },
      drafts: [],
    };
  }

  const contentDivergence = divergence(live.textLength, clone.textLength);
  const structureDivergence = divergence(live.elements, clone.elements);
  const majorContentMismatch = contentDivergence > 0.25;
  const majorStructureMismatch = structureDivergence > 0.25;

  const drafts: DiffDraft[] = [];
  if (majorContentMismatch || majorStructureMismatch) {
    drafts.push({
      route: target.url,
      dimension: "family-audit",
      classification: "family-representation-gap",
      liveOriginal: `${live.elements} elements, ${live.textLength} chars`,
      cloneActual: `${clone.elements} elements, ${clone.textLength} chars (representative ${target.representativePageId})`,
      evidence: [
        { kind: "family-audit", field: "content-divergence", count: contentDivergence },
        { kind: "family-audit", field: "structure-divergence", count: structureDivergence },
      ],
      autoFixEligibility: "not-eligible-family-representation",
      recommendation: "requires-exact-observation",
      upstreamStage: "selection",
    });
  }

  return {
    result: {
      routeId: target.routeId,
      url: target.url,
      familyId: target.familyId,
      representativePageId: target.representativePageId,
      status: "complete",
      liveElementCount: live.elements,
      cloneElementCount: clone.elements,
      liveTextLength: live.textLength,
      cloneTextLength: clone.textLength,
      contentDivergence,
      structureDivergence,
      majorContentMismatch,
      majorStructureMismatch,
      diffIds: [],
    },
    drafts,
  };
}

function divergence(a: number, b: number): number {
  const largest = Math.max(a, b);
  if (largest === 0) return 0;
  return Math.round((Math.abs(a - b) / largest) * 10_000) / 10_000;
}

// ---------------------------------------------------------------------------
// Route coverage (item 152)
// ---------------------------------------------------------------------------

/**
 * HTTP-check every verified route against the clone.
 *
 * Deliberately independent of the original: a route the live site now 404s is
 * still a route the clone must render, because the clone reconstructs what was
 * observed, not what is live today.
 */
export async function checkRoutes(
  baseUrl: string,
  urls: readonly string[],
): Promise<{ checked: number; rendered: number; failures: string[] }> {
  let rendered = 0;
  const failures: string[] = [];
  for (const url of urls) {
    let clonePath = "/";
    try {
      clonePath = clonePathFor(new URL(url));
    } catch {
      failures.push(url);
      continue;
    }
    try {
      const response = await fetch(`${baseUrl}${clonePath}`, {
        method: "GET",
        signal: AbortSignal.timeout(30_000),
      });
      await response.arrayBuffer();
      if (response.status === 200) rendered++;
      else failures.push(url);
    } catch {
      failures.push(url);
    }
  }
  return { checked: urls.length, rendered, failures: failures.sort() };
}
