import type { ActionFacts } from "./facts.js";
import {
  IDEMPOTENT_ACTIVE_ARIA,
  IDEMPOTENT_ACTIVE_STATE,
  type AiEligibility,
  type UnknownReason,
} from "./types.js";

/**
 * Unknown classification (Task 12, items 26–35, 48).
 *
 * Task 11 ended with 46 `no-change` results and one error, and the temptation is
 * to call all 47 "unknown" and move on. That would destroy the most useful
 * information in the corpus, because those 47 have at least six genuinely
 * different causes and only one of them is worth spending a model on:
 *
 *   the URL moved                 → the diff describes two different pages
 *   a guard blocked the click     → the real effect never happened
 *   the control was already active→ the click was a correct no-op
 *   only class/style moved        → state lives outside our vocabulary
 *   nodes churned without a region→ a region we cannot see (item 120)
 *   nothing observable moved      → clipboard, analytics, an external effect
 *   the action never completed    → an execution failure
 *
 * So this file is a taxonomy, not a fallback. Each reason is a distinct claim
 * about WHY, every case lands in exactly one, and the counts have to add back up
 * to Task 11's own totals (items 67, 68) — which `build-patterns.ts` asserts.
 *
 * ## Order is the policy
 *
 * The checks below are first-match-wins, and the order encodes which cause
 * *explains* the others when several are visible at once. nextjs.org's theme
 * radios are the measured example: 27 of them are already `aria-checked="true"`
 * AND carry `class` mutations. Both `already-in-target-state` and
 * `style-only-change` describe them truthfully, but only the first says why
 * nothing happened, so it is checked first.
 */

export interface UnknownClassification {
  reason: UnknownReason;
  aiEligibility: AiEligibility;
  aiEligibilityReason: string;
  /**
   * A better starting state for a FUTURE exploration run (item 31). Purely a
   * recommendation recorded for the next E2E planner: Task 12 changes no Task 11
   * rule and re-plans nothing.
   */
  preferredProbeState?: string;
}

/** The active-by-design state a repeat click cannot move (item 30). */
function idempotentActiveState(facts: ActionFacts): string | undefined {
  for (const attribute of IDEMPOTENT_ACTIVE_ARIA) {
    if (facts.beforeAttributes[attribute] === "true") return `${attribute}=true`;
  }
  for (const field of IDEMPOTENT_ACTIVE_STATE) {
    if (facts.beforeState[field] === true) return `${field}=true`;
  }
  return undefined;
}

/** Diff categories that say something happened, but not to anything we own. */
const CONTAINER_ONLY_CATEGORIES = new Set([
  "container-added",
  "container-removed",
  "container-visibility-change",
]);

export interface ClassifyOptions {
  /**
   * True when the registry produced a same-specificity tie for this action
   * (item 13). The transition is real and the registry could not name it, which
   * is exactly an unmatched transition — recorded here, and separately as a
   * `ruleConflict` so the registry bug stays visible.
   */
  ruleConflict?: boolean;
}

export function classifyUnknown(
  facts: ActionFacts,
  options: ClassifyOptions = {},
): UnknownClassification {
  // 1. The action never completed. Nothing downstream is a statement about the
  //    site's behavior, so no other reason may claim it (item 33).
  if (facts.status !== "changed" && facts.status !== "no-change") {
    return {
      reason: "execution-error",
      aiEligibility: "excluded",
      aiEligibilityReason: `the action did not complete (${facts.status}); there is no behavior to analyze`,
    };
  }

  // 2. The document moved. before/after are two different pages, so every
  //    difference below is page replacement (items 24, 28, 69).
  if (facts.navigationTainted) {
    return {
      reason: "navigation-tainted",
      aiEligibility: "conditional",
      aiEligibilityReason:
        "the DOM difference is page replacement, not a state transition; only useful once SPA navigation is modeled explicitly",
    };
  }

  // 3. A real, verified transition that no rule in the registry explains. This
  //    is the single most valuable AI input there is (item 35).
  if (facts.meaningfulChange) {
    const onlyContainers =
      facts.diffCategories.length > 0 &&
      facts.diffCategories.every((c) => CONTAINER_ONLY_CATEGORIES.has(c));
    if (onlyContainers) {
      return {
        reason: "insufficient-evidence",
        aiEligibility: "eligible",
        aiEligibilityReason:
          "the only evidence is container-inventory churn, anchored to neither the trigger nor a declared region",
      };
    }
    return {
      reason: "unmatched-transition",
      aiEligibility: "eligible",
      aiEligibilityReason: options.ruleConflict
        ? "a verified transition that two rules of equal specificity claimed; the registry cannot name it"
        : "a verified transition that no deterministic rule explains",
    };
  }

  // From here on: the click ran, the document is the same, and nothing in Task
  // 11's diff vocabulary moved. The remaining question is only WHY NOT.

  // 4. A guard stopped the click's real effect, so the site never got to react
  //    (item 32). Deterministically explained — not worth a model.
  if (facts.navigationBlocked) {
    return {
      reason: "blocked-navigation",
      aiEligibility: "excluded",
      aiEligibilityReason:
        "a navigation guard blocked the click's effect; the absence of change is caused by this engine, not by the site",
    };
  }

  // 5. The control was already in the state a click would have produced
  //    (item 30). Also deterministically explained — and it is a probe-selection
  //    problem, so it produces a recommendation instead of an AI call.
  const active = idempotentActiveState(facts);
  if (active) {
    const [field] = active.split("=");
    return {
      reason: "already-in-target-state",
      aiEligibility: "excluded",
      aiEligibilityReason:
        "the control was already active before the click; the no-op is expected and needs no interpretation",
      preferredProbeState: `${field}=false`,
    };
  }

  // 6. The DOM's node population actually changed and stayed changed: a region
  //    appeared or vanished outside every observed vocabulary (item 120's known
  //    limitation — seoworld's mobile <nav>, domainchecker's drawer <div>).
  //    A balanced add/remove is transient churn and is NOT this.
  if (facts.mutation.addedNodeCount !== facts.mutation.removedNodeCount) {
    return {
      reason: "unsupported-dynamic-region",
      aiEligibility: "eligible",
      aiEligibilityReason:
        "nodes were added or removed with no matching pair, so a region changed outside the container inventory and target vocabulary",
    };
  }

  // 7. State is expressed only through `class` / `style` (item 29).
  //    domainchecker's theme switch is the measured case: it works, and none of
  //    it is visible to a semantic diff.
  if (facts.mutation.classCount > 0 || facts.mutation.styleCount > 0) {
    return {
      reason: "style-only-change",
      aiEligibility: "eligible",
      aiEligibilityReason:
        "the control mutated only class/style, so its state is not expressed in any semantic attribute this engine reads",
    };
  }

  // 8. It ran and nothing observable moved at all (item 34). Clipboard writes,
  //    analytics, and any effect that lives outside the document look like this.
  //    Deterministic data cannot say which — a model may guess, and that guess
  //    is `inferred`, never a pattern.
  return {
    reason: "opaque-action",
    aiEligibility: "eligible",
    aiEligibilityReason:
      "the click completed with no observable effect in the document; the effect, if any, is outside what this engine observes",
  };
}
