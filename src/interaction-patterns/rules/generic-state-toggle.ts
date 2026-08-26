import { STATEFUL_ARIA_ATTRIBUTES } from "../types.js";
import { booleanTransition } from "../facts.js";
import {
  observed,
  onOffDirection,
  targetRecord,
  type PatternRule,
} from "./shared.js";

/**
 * Generic state toggle (Task 12, item 23).
 *
 * The deterministic floor. A stateful ARIA attribute on the trigger moved
 * between `false` and `true`, and no more specific rule could say which behavior
 * that was. The transition is real and verified; only the NAME is unknown.
 *
 * It is a fallback in the strict sense: it has the lowest specificity in the
 * registry, so any concrete rule that can fire always wins (item 23).
 *
 * The vocabulary is closed to {@link STATEFUL_ARIA_ATTRIBUTES}. That matters
 * more than it looks: seoworld's hamburger signals open/closed by flipping
 * `aria-label` from "메뉴 열기" to "메뉴 닫기", which is a genuine state change
 * that this rule refuses, because `aria-label` is human text with no defined
 * true/false semantics. Accepting it would mean any button whose label carries a
 * counter became a "state toggle". Those 16 actions stay `unmatched-transition`
 * and go to the AI fallback with their evidence intact — the honest outcome,
 * and the one item 74 asks for.
 */

export const genericStateToggleRule: PatternRule = {
  id: "generic-state-toggle-v1",
  patternType: "generic-state-toggle",
  version: 1,
  specificity: 10,
  description:
    "A stateful ARIA attribute on the trigger flipped between false and true, with no more specific behavior identifiable.",
  requiredEvidence: [
    "candidate aria-expanded / aria-pressed / aria-checked / aria-selected false↔true",
  ],
  optionalEvidence: ["declared control relation", "target visibility change"],
  rejectionConditions: [
    "any more specific rule matched (this rule has the lowest specificity)",
    "the changed attribute is not a stateful ARIA attribute (aria-label is text, not state)",
  ],
  match(facts) {
    for (const attribute of STATEFUL_ARIA_ATTRIBUTES) {
      const flip = booleanTransition(facts.attributeTransitions[attribute]);
      if (!flip) continue;
      const target = facts.targets.find((t) => t.mounted || t.visibilityChanged);
      return {
        patternType: "generic-state-toggle",
        subtype: attribute,
        mechanism:
          attribute === "aria-expanded"
            ? "aria-expanded"
            : attribute === "aria-pressed"
              ? "aria-pressed"
              : attribute === "aria-selected"
                ? "aria-selected"
                : "aria-checked",
        transition: {
          direction: onOffDirection(flip.after),
          field: attribute,
          before: String(flip.before),
          after: String(flip.after),
        },
        ...(target ? { target: targetRecord(target) } : {}),
        evidence: [
          observed(attribute, "diff.changes[candidate-attribute-change]", {
            before: String(flip.before),
            after: String(flip.after),
          }),
        ],
        supportingEvidence: [],
        limitations: [
          "The behavior category is unknown: only that a declared state flipped. This is a deterministic floor, not a UI pattern claim.",
        ],
      };
    }
    return null;
  },
};
