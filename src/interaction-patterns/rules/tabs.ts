import {
  ariaFlip,
  observed,
  selectDirection,
  targetEvidence,
  targetRecord,
  type PatternRule,
} from "./shared.js";

/**
 * Tabs rule (Task 12, items 17, 73).
 *
 * Two facts, and deliberately only two:
 *
 *   1. the trigger IS a tab      `role=tab`, or Task 10's `tab-trigger`
 *   2. its selection state moved `aria-selected` false↔true
 *
 * What is NOT required — and this is the whole point of the rule — is that
 * `aria-controls` be correct. The measured nextjs.org case has a tab whose
 * `aria-controls` pointed at ITSELF before the click and at a different
 * generated id (`_r_g_`) after it, because the component re-renders and re-issues
 * ids. A rule that demanded a valid trigger→panel edge would report "not a tab"
 * for a control that is unambiguously a tab, purely because of a markup bug in
 * somebody else's site.
 *
 * So the control relation is SUPPORTING evidence: it is recorded when it agrees
 * and ignored when it does not. `target-unmounted` from an id that drifted is
 * noted in `limitations` rather than treated as the panel disappearing.
 */

export const tabsAriaSelectedRule: PatternRule = {
  id: "tabs-aria-selected-v1",
  patternType: "tabs",
  version: 1,
  specificity: 100,
  description:
    "A role=tab / tab-trigger control changed its own aria-selected state.",
  requiredEvidence: [
    "trigger role=tab or Task 10 tab-trigger capability",
    "candidate aria-selected false↔true",
  ],
  optionalEvidence: [
    "tabpanel visibility change",
    "target mount/unmount",
    "candidate-replaced (component re-render)",
  ],
  rejectionConditions: [
    "the trigger is not a tab",
    "aria-selected did not change",
  ],
  match(facts) {
    const isTab =
      facts.trigger.role === "tab" || facts.capabilities.includes("tab-trigger");
    if (!isTab) return null;

    const flip = ariaFlip(facts, "aria-selected");
    if (!flip) return null;

    const target =
      facts.targets.find((t) => t.visibilityChanged) ??
      facts.targets.find((t) => t.mounted) ??
      facts.targets[0];

    const supporting = target ? targetEvidence(target) : [];
    const limitations: string[] = [];

    const controlsDrift = facts.attributeTransitions["aria-controls"];
    if (controlsDrift) {
      supporting.push(
        observed("aria-controls-drift", "diff.changes[candidate-attribute-change]", {
          ...(controlsDrift.before !== undefined ? { before: controlsDrift.before } : {}),
          ...(controlsDrift.after !== undefined ? { after: controlsDrift.after } : {}),
        }),
      );
      limitations.push(
        "The trigger's aria-controls value changed during the action (generated id), so the trigger→panel edge is not a stable identity.",
      );
    }
    if (facts.candidateReplaced) {
      supporting.push(
        observed("candidate-replaced", "diff.changes[candidate-replaced]"),
      );
    }
    if (target?.unmounted && controlsDrift) {
      limitations.push(
        "The recorded target id disappeared together with the aria-controls drift; this is id churn, not proof the panel was removed.",
      );
    }
    if (!target) {
      limitations.push(
        "No controlled panel was observable; only the trigger's own selection transition is verified.",
      );
    }

    return {
      patternType: "tabs",
      mechanism: "aria-selected",
      transition: {
        direction: selectDirection(flip.after),
        field: "aria-selected",
        before: String(flip.before),
        after: String(flip.after),
      },
      ...(target ? { target: targetRecord(target) } : {}),
      evidence: [
        observed(
          facts.trigger.role === "tab" ? "role=tab" : "capability:tab-trigger",
          "locatorResolution.locatorDescriptor.role",
          { after: facts.trigger.role ?? "tab-trigger" },
        ),
        observed("aria-selected", "diff.changes[candidate-attribute-change]", {
          before: String(flip.before),
          after: String(flip.after),
        }),
      ],
      supportingEvidence: supporting,
      limitations,
    };
  },
  partial(facts) {
    const isTab =
      facts.trigger.role === "tab" || facts.capabilities.includes("tab-trigger");
    if (!isTab) return null;
    if (ariaFlip(facts, "aria-selected")) return null;
    return {
      matchedEvidence: ["trigger is a tab"],
      missingEvidence: ["candidate aria-selected false↔true"],
    };
  },
};
