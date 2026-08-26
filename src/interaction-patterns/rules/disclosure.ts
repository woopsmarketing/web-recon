import {
  ariaFlip,
  observed,
  openDirection,
  openedTargets,
  targetEvidence,
  targetRecord,
  type PatternRule,
} from "./shared.js";

/**
 * Disclosure rules (Task 12, items 15–16).
 *
 * A disclosure is the simplest verified behavior in the corpus and also the most
 * common: something was closed, it is now open, and the control says so.
 *
 * Two mechanisms, kept as two rules rather than one rule with a branch, because
 * they are genuinely different evidence and a later reconstruction treats them
 * differently:
 *
 *   native-details   a real `<details open>` flipped. The browser owns the
 *                    behavior; nothing has to be re-implemented.
 *   aria-expanded    the author wired it. The state lives in an attribute and
 *                    the showing/hiding is CSS or JS.
 *
 * Crucially, `aria-expanded` alone is enough (item 15). A trigger that declares
 * no target — domainchecker's hamburger is the measured case — still verifiably
 * changed its own declared state, and refusing to name that would be pedantry,
 * not rigor. The pattern simply records that no region was observed, in
 * `limitations`.
 */

export const disclosureNativeDetailsRule: PatternRule = {
  id: "disclosure-native-details-v1",
  patternType: "disclosure",
  version: 1,
  specificity: 60,
  description:
    "A native <details> element owned by this trigger flipped its `open` property.",
  requiredEvidence: ["open-change on the declared <details> region"],
  optionalEvidence: [
    "target-visibility-change",
    "container open-change under a <summary> trigger",
  ],
  rejectionConditions: [
    "no `details` relation and the trigger is not a <summary>",
    "the region's `open` property did not move",
  ],
  match(facts) {
    const transition = facts.nativeDetailsTransition;
    if (!transition || transition.before === undefined || transition.after === undefined) {
      return null;
    }
    const after = transition.after === "true";
    const detailsTarget = facts.targets.find((t) => t.relation === "details");

    return {
      patternType: "disclosure",
      subtype: "details",
      mechanism: "native-details",
      transition: {
        direction: openDirection(after),
        field: "open",
        before: transition.before,
        after: transition.after,
      },
      ...(detailsTarget ? { target: targetRecord(detailsTarget) } : {}),
      evidence: [
        observed("open", transition.source, {
          before: transition.before,
          after: transition.after,
        }),
        observed("native-details-relation", "plan.controls[relation=details]"),
      ],
      supportingEvidence: detailsTarget ? targetEvidence(detailsTarget) : [],
      limitations: [
        "Whether the <details> was open in the initial saved observation is not recorded by Task 09; only this live transition is claimed.",
      ],
    };
  },
};

export const disclosureAriaExpandedRule: PatternRule = {
  id: "disclosure-aria-expanded-v1",
  patternType: "disclosure",
  version: 1,
  specificity: 50,
  description:
    "The trigger's own `aria-expanded` moved between false and true.",
  requiredEvidence: ["candidate aria-expanded false↔true"],
  optionalEvidence: [
    "target-mounted",
    "target-visibility-change",
    "declared control relation",
  ],
  rejectionConditions: [
    "aria-expanded did not change",
    "a more specific rule (tabs / dialog / menu) claimed the same action",
  ],
  match(facts) {
    const flip = ariaFlip(facts, "aria-expanded");
    if (!flip) return null;

    const opened = openedTargets(facts);
    const target = opened[0] ?? facts.targets.find((t) => t.visibilityChanged);

    const limitations: string[] = [];
    if (facts.targets.length === 0) {
      limitations.push(
        "No controlled region is declared by this trigger; only its own state transition is verified.",
      );
    } else if (!target) {
      limitations.push(
        "The declared region did not mount or change visibility; only the trigger's own state transition is verified.",
      );
    }

    return {
      patternType: "disclosure",
      mechanism: "aria-expanded",
      transition: {
        direction: openDirection(flip.after),
        field: "aria-expanded",
        before: String(flip.before),
        after: String(flip.after),
      },
      ...(target ? { target: targetRecord(target) } : {}),
      evidence: [
        observed("aria-expanded", "diff.changes[candidate-attribute-change]", {
          before: String(flip.before),
          after: String(flip.after),
        }),
      ],
      supportingEvidence: target ? targetEvidence(target) : [],
      limitations,
    };
  },
  partial(facts) {
    // A region opened but the trigger never declared expansion — the shape of a
    // disclosure without the one fact that would prove it.
    if (ariaFlip(facts, "aria-expanded")) return null;
    const opened = openedTargets(facts);
    if (opened.length === 0) return null;
    return {
      matchedEvidence: ["declared region mounted or became visible"],
      missingEvidence: ["candidate aria-expanded false↔true"],
    };
  },
};
