import type { CompiledPattern } from "../sitespec/index.js";
import type {
  BehaviorVerdict,
  InteractionQaResult,
  ReplaySide,
  VisibleTargetVerdict,
} from "./types.js";

/**
 * The ONE behavior comparison (items 66, 67, 72, 73).
 *
 * Both the baseline pass and every correction iteration go through this function.
 * That is not tidiness: when the correction loop had its own comparison, it
 * compared a fixed list of ARIA attributes instead of the pattern's own
 * transition field, counted differences the baseline never counted, and rejected
 * nextjs's canvas correction for a `regression-behavior` that did not exist. A
 * regression gate has to measure the same thing before and after or it is noise.
 *
 * ## The comparison vocabulary is closed (item 66)
 *
 * candidate state field · target mount/unmount · target visibility ·
 * open/checked/selected · dynamic target tag and role · dismiss · URL. Nothing
 * else can make a pattern a mismatch, which is what keeps a transition animation
 * or an analytics mutation out of the behavior numbers.
 *
 * ## Two cases where a raw comparison would lie
 *
 * **A self-referential target (item 72).** nextjs's six verified tabs declare an
 * `aria-controls` that resolves back to the tab itself, because the site mints
 * that id per render — Task 12 preserved the caveat and Task 14 records
 * `tabs-panel-target-not-distinguishable`. On the live original the "target" is
 * therefore the trigger's own churned id, which is present before the click and
 * gone after; the clone implements no panel at all. Comparing those produces
 * `target:unmounted` on all six, which reads as a behavior defect and is really
 * the id churn. So the target axis is NOT evidence here: the verdict comes from
 * the `aria-selected` transition, and the result carries `tabpanel-unverified` so
 * nobody can read it as full tab equivalence.
 *
 * **A dynamic target whose contents were never observed (item 73).** The original
 * mounts a menu with children; the clone mounts the observed tag and role and no
 * children, so it has no box and is not "visible". `target:visible` and
 * `target:mounted` are then SYMPTOMS of the one known limitation, and the
 * `dynamic-target-content-unobserved` finding is what gets reported — the
 * verdict stays `mismatch`, because the behavior genuinely differs, but the diff
 * is not emitted twice under two names.
 */

export interface BehaviorComparison {
  /** Combined verdict over BOTH axes — the regression gate's measure. */
  verdict: BehaviorVerdict;
  /**
   * Task 17 §3 — the two separated metrics. `triggerState` is what Task 16's
   * `behaviorEquivalent` actually measured; `visibleTarget` is what a user
   * sees, and it is never `equivalent` by default: with no comparable target
   * evidence it says `not-observed` or `not-declared`.
   */
  triggerState: BehaviorVerdict;
  visibleTarget: VisibleTargetVerdict;
  visibleTargetFields: string[];
  mismatchFields: string[];
  /** Named honesty notes, sorted (item 72). */
  limitations: string[];
  /** True when the only mismatches are explained by the dynamic content gap. */
  explainedByDynamicContentGap: boolean;
  /** The original mounted content the clone cannot have (item 73). */
  dynamicContentGap: boolean;
  /**
   * Child-element counts of a MOUNTED region on both sides (Task 16, item 101).
   *
   * Recorded whenever the pattern has a dynamic target, so the effect of the
   * Task 16 subtree capture is measurable rather than assumed: before it, the
   * clone column was 0 on all nine of nextjs.org's menus by construction.
   */
  dynamicTargetChildren?: { original: number; clone: number };
}

function stateValue(side: ReplaySide, when: "before" | "after", field: string): string {
  const state = when === "before" ? side.triggerBefore : side.triggerAfter;
  if (!state?.exists) return "(absent)";
  if (field === "open" || field === "checked" || field === "selected") {
    const flag = state.state?.[field];
    if (flag !== undefined) return String(flag);
  }
  return state.attributes?.[field] ?? "(unset)";
}

function targetFact(side: ReplaySide, when: "before" | "after"): {
  exists: boolean;
  visible: boolean;
  tag: string;
  role: string;
  children: number;
} {
  const state = when === "before" ? side.targetBefore : side.targetAfter;
  return {
    exists: state?.exists === true,
    visible: state?.visible === true,
    tag: state?.tagName ?? "",
    role: state?.role ?? "",
    children: state?.childElementCount ?? 0,
  };
}

/** True when the pattern's declared target IS its own trigger (item 72). */
export function isSelfReferentialTarget(pattern: CompiledPattern): boolean {
  const target = pattern.target;
  return (
    target !== undefined &&
    target.dynamic !== true &&
    target.targetNodeId !== undefined &&
    target.targetNodeId === pattern.triggerNodeId
  );
}

export interface CompareBehaviorInput {
  pattern: CompiledPattern;
  original: ReplaySide;
  clone: ReplaySide;
  /** False when the live original was not visited at all. */
  liveOriginalUsed: boolean;
}

export function compareBehavior(input: CompareBehaviorInput): BehaviorComparison {
  const { pattern, original, clone } = input;
  const mismatchFields: string[] = [];
  const limitations: string[] = [];

  const abort = (
    verdict: BehaviorVerdict,
    fields: string[],
    aborted: string[],
  ): BehaviorComparison => ({
    verdict,
    triggerState: verdict,
    visibleTarget: verdict === "mismatch" ? "mismatch" : verdict,
    visibleTargetFields: verdict === "mismatch" ? [...fields] : [],
    mismatchFields: fields,
    limitations: aborted,
    explainedByDynamicContentGap: false,
    dynamicContentGap: false,
  });

  if (!input.liveOriginalUsed) {
    return abort("unverifiable", [], ["live-original-not-visited"]);
  }
  if (!original.ok) {
    return abort(
      original.outcome === "not-found" || original.outcome === "semantic-mismatch"
        ? "source-drifted"
        : "unverifiable",
      [],
      [`original-${original.outcome}`],
    );
  }
  if (!clone.ok) {
    const isMissing =
      clone.outcome === "trigger-not-found" || clone.outcome === "trigger-ambiguous";
    return abort(
      isMissing ? "mismatch" : "unverifiable",
      isMissing ? [`clone:${clone.outcome}`] : [],
      isMissing ? [] : [`clone-${clone.outcome}`],
    );
  }

  // --- the candidate's own state field (the TRIGGER axis) --------------------
  const triggerFields: string[] = [];
  const field = pattern.transition.field;
  if (field !== "exists") {
    const originalTransition = `${stateValue(original, "before", field)}→${stateValue(original, "after", field)}`;
    const cloneTransition = `${stateValue(clone, "before", field)}→${stateValue(clone, "after", field)}`;
    if (originalTransition !== cloneTransition) triggerFields.push(`trigger:${field}`);
  } else {
    // `dismiss`: the evidence is that the candidate itself was removed (item 75).
    const originalRemoved =
      original.triggerBefore?.exists === true && original.triggerAfter?.exists !== true;
    const cloneRemoved =
      clone.triggerBefore?.exists === true && clone.triggerAfter?.exists !== true;
    if (originalRemoved !== cloneRemoved) triggerFields.push("trigger:removed");
  }
  mismatchFields.push(...triggerFields);

  // --- the target axis -----------------------------------------------------
  const targetIsDynamic = pattern.target?.dynamic === true;
  const originalAfter = targetFact(original, "after");
  const cloneAfter = targetFact(clone, "after");
  const dynamicContentGap =
    targetIsDynamic && originalAfter.children > 0 && cloneAfter.children === 0;

  const targetFields: string[] = [];
  let declaredTargetCompared = false;
  if (isSelfReferentialTarget(pattern)) {
    limitations.push("tabpanel-unverified");
  } else {
    const originalBefore = targetFact(original, "before");
    const cloneBefore = targetFact(clone, "before");
    // The declared target counts as COMPARED only when the pattern names one
    // and the original side actually saw it at some point — otherwise the
    // "0 mismatches" below is vacuous, which is exactly the Task 16 inflation.
    declaredTargetCompared =
      pattern.target !== undefined &&
      (originalBefore.exists || originalAfter.exists);
    const originalMounted = !originalBefore.exists && originalAfter.exists;
    const cloneMounted = !cloneBefore.exists && cloneAfter.exists;
    if (originalMounted !== cloneMounted) targetFields.push("target:mounted");
    const originalUnmounted = originalBefore.exists && !originalAfter.exists;
    const cloneUnmounted = cloneBefore.exists && !cloneAfter.exists;
    if (originalUnmounted !== cloneUnmounted) targetFields.push("target:unmounted");
    if (originalAfter.exists && cloneAfter.exists && originalAfter.visible !== cloneAfter.visible) {
      targetFields.push("target:visible");
    }
    if (targetIsDynamic && originalAfter.exists && cloneAfter.exists) {
      if (originalAfter.tag !== cloneAfter.tag) targetFields.push("dynamic-target:tag");
      if (originalAfter.role !== cloneAfter.role) targetFields.push("dynamic-target:role");
      /*
       * Task 16: the clone can now mount OBSERVED children, so the child count
       * becomes a real axis instead of a foregone 0. It is only compared when
       * the clone actually has some — when it has none the `dynamicContentGap`
       * limitation below already says so, and adding a second field would
       * report one known gap twice (the mistake item 73 exists to prevent).
       *
       * A count difference here is a genuine behavioral difference and is
       * reported as one. It is NOT evidence that the capture was wrong: a menu
       * whose contents depend on live data legitimately differs between the
       * observed instance and this replay, which is exactly the boundary item
       * 80 draws around a captured after-state.
       */
      if (
        cloneAfter.children > 0 &&
        originalAfter.children !== cloneAfter.children
      ) {
        targetFields.push("dynamic-target:children");
      }
    }
  }
  mismatchFields.push(...targetFields);

  // --- observed user-visible targets (Task 17 §6) ---------------------------
  // Existence, visibility DIRECTION, and content fingerprint per discovered
  // region, on both sides. Geometry stays informational: replay states carry
  // both bounding boxes, and pixel deltas are a measurement, not a verdict.
  const observedFields: string[] = [];
  let observedTargetsCompared = 0;
  const originalObserved = new Map(
    (original.observedTargets ?? []).map((entry) => [entry.discoveryId, entry]),
  );
  const cloneObserved = new Map(
    (clone.observedTargets ?? []).map((entry) => [entry.discoveryId, entry]),
  );
  for (const record of pattern.observedTargets ?? []) {
    // A target that IS the trigger (stripe swaps its menu button on open) is
    // deliberately not implemented — hiding the trigger would remove the only
    // close affordance — so it is not comparable evidence either. Named, not
    // silently equivalent.
    if (
      record.targetNodeId !== undefined &&
      record.targetNodeId === pattern.triggerNodeId
    ) {
      limitations.push("trigger-self-target-not-implemented");
      continue;
    }
    // Task 17.1 — a region that CONTAINS its own trigger: the clone
    // deliberately does not replay the content swap inside it (replacing the
    // children would destroy the live trigger), so its content fingerprint is
    // not comparable evidence. Existence and visibility still are.
    const containsTrigger = record.containsTrigger === true;
    if (containsTrigger) {
      limitations.push("trigger-inside-target-content-not-replayed");
    }
    const o = originalObserved.get(record.discoveryId);
    const c = cloneObserved.get(record.discoveryId);
    if (!o || !c) continue;
    const originalKnown = o.before.exists || o.after.exists;
    if (!originalKnown) continue; // the original replay could not see it either
    observedTargetsCompared++;
    const id = record.discoveryId;
    if (o.after.exists !== c.after.exists) {
      observedFields.push(`obs-target:${id}:exists`);
      continue;
    }
    if (!o.after.exists) continue; // both gone — the disappeared direction agrees
    const originalDirection = `${o.before.visible === true}→${o.after.visible === true}`;
    const cloneDirection = `${c.before.visible === true}→${c.after.visible === true}`;
    if ((o.after.visible === true) !== (c.after.visible === true)) {
      observedFields.push(`obs-target:${id}:visible`);
    } else if (originalDirection !== cloneDirection) {
      observedFields.push(`obs-target:${id}:direction`);
    }
    if (containsTrigger) continue; // content inside is not replayed — named above
    // Content fingerprints ignore whitespace: the original DOM's
    // inter-element whitespace text nodes are a serialization artifact the
    // clone does not recreate, not content the user reads.
    const compact = (value: string | undefined): string =>
      (value ?? "").replace(/\s+/g, "");
    if (o.after.visible === true && c.after.visible === true) {
      // The two samples cover different amounts of compact text (they were
      // cut at 400 RAW characters), so only their common prefix is comparable;
      // the full-length check is the whitespace-free `textLength`. Task 17.1:
      // the length check no longer requires both samples — a clone region
      // with NO text at all against an original with some was passing simply
      // because there was no sample to compare.
      const compactOriginal = compact(o.after.textSample);
      const compactClone = compact(c.after.textSample);
      const comparable = Math.min(compactOriginal.length, compactClone.length);
      if (
        compactOriginal.slice(0, comparable) !== compactClone.slice(0, comparable) ||
        (o.after.textLength ?? 0) !== (c.after.textLength ?? 0)
      ) {
        observedFields.push(`obs-target:${id}:content`);
      }
    }
  }
  mismatchFields.push(...observedFields);

  if (original.urlChanged !== clone.urlChanged) mismatchFields.push("url");
  if (dynamicContentGap) limitations.push("dynamic-target-content-not-observed");

  const nonTargetFields = mismatchFields.filter(
    (name) =>
      !name.startsWith("target:") &&
      !name.startsWith("dynamic-target:") &&
      !name.startsWith("obs-target:"),
  );
  const explainedByDynamicContentGap =
    dynamicContentGap && nonTargetFields.length === 0 && mismatchFields.length > 0;

  // --- the two published axes (Task 17 §3) ----------------------------------
  const triggerState: BehaviorVerdict =
    triggerFields.length === 0 ? "equivalent" : "mismatch";

  const visibleTargetFields = [...new Set([...targetFields, ...observedFields])].sort();
  const hasAnyTargetModel =
    pattern.target !== undefined || (pattern.observedTargets?.length ?? 0) > 0;
  let visibleTarget: VisibleTargetVerdict;
  if (!hasAnyTargetModel) {
    visibleTarget = "not-declared";
  } else if (!declaredTargetCompared && observedTargetsCompared === 0) {
    visibleTarget = "not-observed";
  } else {
    visibleTarget = visibleTargetFields.length === 0 ? "equivalent" : "mismatch";
  }

  return {
    verdict: mismatchFields.length === 0 ? "equivalent" : "mismatch",
    triggerState,
    visibleTarget,
    visibleTargetFields,
    mismatchFields: [...new Set(mismatchFields)].sort(),
    limitations: [...new Set(limitations)].sort(),
    explainedByDynamicContentGap,
    dynamicContentGap,
    ...(targetIsDynamic
      ? {
          dynamicTargetChildren: {
            original: originalAfter.children,
            clone: cloneAfter.children,
          },
        }
      : {}),
  };
}

/** Open-state style mismatches between the two after-states (items 70, 71). */
export function compareOpenStateStyle(
  original: ReplaySide,
  clone: ReplaySide,
): InteractionQaResult["targetStyleMismatches"] {
  const out: InteractionQaResult["targetStyleMismatches"] = [];
  const originalComputed = original.targetAfter?.computed;
  const cloneComputed = clone.targetAfter?.computed;
  if (!originalComputed || !cloneComputed) return out;
  for (const property of Object.keys(originalComputed).sort()) {
    const expected = originalComputed[property]!;
    const actual = cloneComputed[property];
    if (actual !== undefined && actual !== expected) {
      out.push({ property, original: expected, clone: actual });
    }
  }
  return out;
}
