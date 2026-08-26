import {
  ariaFlip,
  observed,
  onOffDirection,
  type PatternRule,
} from "./shared.js";

/**
 * Toggle rule (Task 12, items 20, 77).
 *
 * A toggle is a control that turns ONE thing on and off and belongs to no
 * selection set. In ARIA terms that is exactly two things:
 *
 *   aria-pressed         a button that stays pressed
 *   role=switch          an on/off switch, whose state rides on aria-checked
 *
 * Everything else with `aria-checked` — radio, checkbox, option, menuitemradio —
 * is a member of a set and belongs to the `selection` rule instead (see
 * `selection.ts` for why that tie was broken that way). Keeping the split at the
 * ROLE rather than at the attribute is what stops one behavior producing two
 * pattern instances.
 *
 * Measured note, recorded rather than hidden: this rule matched **0** actions
 * across the four test sites. None of them ships an `aria-pressed` button or a
 * `role=switch`. The rule stays in the registry with fixture coverage because
 * the taxonomy is a contract for the next site, not a summary of these four —
 * but the report says zero rather than letting a silent absence look like
 * coverage.
 */

export const toggleAriaPressedRule: PatternRule = {
  id: "toggle-aria-pressed-v1",
  patternType: "toggle",
  version: 1,
  specificity: 68,
  description:
    "A pressed-state button (aria-pressed) or a role=switch changed its own on/off state.",
  requiredEvidence: [
    "candidate aria-pressed false↔true, or role=switch with aria-checked false↔true",
  ],
  optionalEvidence: ["Task 10 toggle capability", "target visibility change"],
  rejectionConditions: [
    "the control is a selection-set member (radio / checkbox / option) — the selection rule owns it",
    "no pressed/switch state moved",
  ],
  match(facts) {
    const pressed = ariaFlip(facts, "aria-pressed");
    const isSwitch = facts.trigger.role === "switch";
    const switched = isSwitch ? ariaFlip(facts, "aria-checked") : undefined;

    const flip = pressed ?? switched;
    if (!flip) return null;
    const field = pressed ? "aria-pressed" : "aria-checked";

    return {
      patternType: "toggle",
      ...(isSwitch ? { subtype: "switch" } : {}),
      mechanism: pressed ? "aria-pressed" : "aria-checked",
      transition: {
        direction: onOffDirection(flip.after),
        field,
        before: String(flip.before),
        after: String(flip.after),
      },
      evidence: [
        observed(
          pressed ? "aria-pressed" : "role=switch + aria-checked",
          "diff.changes[candidate-attribute-change]",
          { before: String(flip.before), after: String(flip.after) },
        ),
      ],
      supportingEvidence: [],
      limitations: [
        "What the toggle switches is not asserted; only the control's own state transition is verified.",
      ],
    };
  },
};
