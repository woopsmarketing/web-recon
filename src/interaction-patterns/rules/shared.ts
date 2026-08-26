import type { ActionFacts, TargetFacts, ValueTransition } from "../facts.js";
import { booleanTransition } from "../facts.js";
import type {
  PatternEvidence,
  PatternMechanism,
  PatternType,
  TransitionDirection,
} from "../types.js";

/**
 * Shared building blocks for the deterministic pattern rules (Task 12, item 11).
 *
 * Everything a rule needs to express itself lives here so that a rule file is
 * only a statement of ITS OWN evidence policy, not a pile of re-implemented
 * plumbing. Nothing in this file makes a judgement about behavior.
 */

/** A fact read straight out of a Task 11 artifact. */
export function observed(
  signal: string,
  source: string,
  transition?: ValueTransition,
): PatternEvidence {
  return {
    signal,
    source,
    ...(transition?.before !== undefined ? { before: transition.before } : {}),
    ...(transition?.after !== undefined ? { after: transition.after } : {}),
    level: "observed",
  };
}

/** A fact this layer computed from observed facts (never from AI). */
export function derived(
  signal: string,
  source: string,
  transition?: ValueTransition,
): PatternEvidence {
  return {
    signal,
    source,
    ...(transition?.before !== undefined ? { before: transition.before } : {}),
    ...(transition?.after !== undefined ? { after: transition.after } : {}),
    level: "derived",
  };
}

/** What ONE rule concluded. A rule returns this or `null`; never a score. */
export interface RuleMatch {
  patternType: PatternType;
  /** A narrower shape the markup itself declared (`listbox`, `radio`, …). */
  subtype?: string;
  mechanism: PatternMechanism;
  transition: {
    direction?: TransitionDirection;
    field: string;
    before: string;
    after: string;
  };
  target?: {
    relation: TargetFacts["relation"];
    targetDomId?: string;
    tagName?: string;
    role?: string;
    existedBefore: boolean;
    existsAfter: boolean;
    mounted: boolean;
    unmounted: boolean;
    visibilityChanged: boolean;
    interactiveDescendantsAfter?: number;
  };
  evidence: PatternEvidence[];
  supportingEvidence: PatternEvidence[];
  limitations: string[];
}

/** A rule that got partway. Recorded as a HINT on an unknown case (item 12). */
export interface RulePartial {
  matchedEvidence: string[];
  missingEvidence: string[];
}

/**
 * One entry of the registry.
 *
 * Rules are an explicit LIST, not an if/else chain (item 11): `requiredEvidence`
 * / `optionalEvidence` / `rejectionConditions` are readable data, so
 * `interaction-patterns.json` can publish the whole ruleset and a reviewer can
 * argue with a rule without opening the source.
 */
export interface PatternRule {
  id: string;
  patternType: PatternType;
  version: number;
  /**
   * Higher is more specific and wins (item 13). Two rules that can both fire on
   * the same evidence must never share a value — an equal-specificity collision
   * is recorded as a registry conflict rather than silently coin-flipped.
   */
  specificity: number;
  description: string;
  requiredEvidence: readonly string[];
  optionalEvidence: readonly string[];
  rejectionConditions: readonly string[];
  match(facts: ActionFacts): RuleMatch | null;
  /** Optional near-miss reporter, used only to enrich unknown cases. */
  partial?(facts: ActionFacts): RulePartial | null;
}

// ---------------------------------------------------------------------------
// Transition helpers
// ---------------------------------------------------------------------------

export function openDirection(after: boolean): TransitionDirection {
  return after ? "closed-to-open" : "open-to-closed";
}

export function selectDirection(after: boolean): TransitionDirection {
  return after ? "unselected-to-selected" : "selected-to-unselected";
}

export function onOffDirection(after: boolean): TransitionDirection {
  return after ? "off-to-on" : "on-to-off";
}

/** The candidate's boolean transition for one ARIA attribute, if it moved. */
export function ariaFlip(
  facts: ActionFacts,
  attribute: string,
): { before: boolean; after: boolean } | undefined {
  return booleanTransition(facts.attributeTransitions[attribute]);
}

/** The candidate's boolean transition for one DOM state property, if it moved. */
export function stateFlip(
  facts: ActionFacts,
  field: string,
): { before: boolean; after: boolean } | undefined {
  return booleanTransition(facts.stateTransitions[field]);
}

/** Declared regions that appeared, or became visible, because of this action. */
export function openedTargets(facts: ActionFacts): TargetFacts[] {
  return facts.targets.filter((t) => t.mounted || t.becameVisible);
}

/** Compact target record for a pattern instance. */
export function targetRecord(target: TargetFacts): NonNullable<RuleMatch["target"]> {
  return {
    relation: target.relation,
    ...(target.targetDomId !== undefined ? { targetDomId: target.targetDomId } : {}),
    ...(target.tagName !== undefined ? { tagName: target.tagName } : {}),
    ...(target.role !== undefined ? { role: target.role } : {}),
    existedBefore: target.existedBefore,
    existsAfter: target.existsAfter,
    mounted: target.mounted,
    unmounted: target.unmounted,
    visibilityChanged: target.visibilityChanged,
    ...(target.interactiveDescendantsAfter !== undefined
      ? { interactiveDescendantsAfter: target.interactiveDescendantsAfter }
      : {}),
  };
}

/** Supporting evidence every trigger→region rule reports the same way. */
export function targetEvidence(target: TargetFacts): PatternEvidence[] {
  const evidence: PatternEvidence[] = [];
  if (target.mounted) {
    evidence.push(
      observed("target-mounted", "diff.changes[target-mounted]", {
        before: "false",
        after: "true",
      }),
    );
  }
  if (target.unmounted) {
    evidence.push(
      observed("target-unmounted", "diff.changes[target-unmounted]", {
        before: "true",
        after: "false",
      }),
    );
  }
  if (target.visibilityChanged) {
    evidence.push(
      observed("target-visibility-change", "diff.changes[target-visibility-change]", {
        ...(target.visibleBefore !== undefined
          ? { before: String(target.visibleBefore) }
          : {}),
        ...(target.visibleAfter !== undefined ? { after: String(target.visibleAfter) } : {}),
      }),
    );
  }
  if (target.role) {
    evidence.push(
      observed("target-role", "after.targets[].element.role", { after: target.role }),
    );
  }
  return evidence;
}
