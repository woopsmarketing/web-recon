import { SELECTION_INPUT_TYPES, SELECTION_ROLES } from "../types.js";
import type { ActionFacts } from "../facts.js";
import {
  ariaFlip,
  observed,
  selectDirection,
  stateFlip,
  targetRecord,
  type PatternRule,
} from "./shared.js";

/**
 * Selection rule (Task 12, items 21, 77).
 *
 * **The checkbox decision, stated once so it is not re-litigated per site:**
 * a checkbox is `selection`, not `toggle`.
 *
 * Both readings are defensible — a checkbox is binary like a switch, and it is
 * also a member of a set like a radio — so the tie is broken on which
 * reconstruction the answer feeds. `checked` semantics (checkbox, radio,
 * `role=option`, `menuitemcheckbox`, `menuitemradio`) all describe *membership
 * of a chosen set*, and they are all rendered by the same family of controls.
 * `toggle` is reserved for the genuinely different thing: a control that turns
 * a mode on and off with `aria-pressed` or `role=switch` and belongs to no set.
 *
 * The mechanism field keeps the distinction that matters (`native-checked` for a
 * real `<input>`, `aria-checked` for an ARIA widget), so nothing is lost, and
 * one behavior never produces two pattern instances (item 77).
 *
 * `role=tab` is excluded outright: a tab's `aria-selected` is the tabs rule's
 * evidence, and tabs is more specific.
 */

function isSelectionControl(facts: ActionFacts): boolean {
  if (facts.trigger.role === "tab") return false;
  if (facts.trigger.role !== undefined && SELECTION_ROLES.includes(facts.trigger.role)) {
    return true;
  }
  if (
    facts.trigger.tagName === "input" &&
    facts.trigger.inputType !== undefined &&
    SELECTION_INPUT_TYPES.includes(facts.trigger.inputType)
  ) {
    return true;
  }
  return false;
}

export const selectionCheckedRule: PatternRule = {
  id: "selection-checked-v1",
  patternType: "selection",
  version: 1,
  specificity: 70,
  description:
    "A member of a selection set (radio / checkbox / option) changed its checked or selected state.",
  requiredEvidence: [
    "trigger role in {radio,checkbox,option,menuitemcheckbox,menuitemradio} or <input type=radio|checkbox>",
    "one of: checked property flip, selected property flip, aria-checked flip, aria-selected flip",
  ],
  optionalEvidence: ["Task 10 toggle / select capability", "declared control relation"],
  rejectionConditions: [
    "role=tab (the tabs rule owns aria-selected on a tab)",
    "no selection state moved",
  ],
  match(facts) {
    if (!isSelectionControl(facts)) return null;

    const native = stateFlip(facts, "checked") ?? stateFlip(facts, "selected");
    const nativeField = stateFlip(facts, "checked") ? "checked" : "selected";
    const aria = ariaFlip(facts, "aria-checked") ?? ariaFlip(facts, "aria-selected");
    const ariaField = ariaFlip(facts, "aria-checked") ? "aria-checked" : "aria-selected";

    const flip = native ?? aria;
    if (!flip) return null;

    const field = native ? nativeField : ariaField;
    const mechanism = native ? "native-checked" : "aria-checked";
    const subtype =
      facts.trigger.inputType ??
      (facts.trigger.role !== undefined && SELECTION_ROLES.includes(facts.trigger.role)
        ? facts.trigger.role
        : undefined);

    const supporting = [];
    if (native && aria) {
      supporting.push(
        observed("aria-checked", "diff.changes[candidate-attribute-change]", {
          before: String(aria.before),
          after: String(aria.after),
        }),
      );
    }
    const target = facts.targets.find((t) => t.visibilityChanged || t.mounted);

    return {
      patternType: "selection",
      ...(subtype ? { subtype } : {}),
      mechanism,
      transition: {
        direction: selectDirection(flip.after),
        field,
        before: String(flip.before),
        after: String(flip.after),
      },
      ...(target ? { target: targetRecord(target) } : {}),
      evidence: [
        observed(
          "selection-control",
          "locatorResolution.locatorDescriptor",
          { after: facts.trigger.role ?? `input[type=${facts.trigger.inputType}]` },
        ),
        observed(
          field,
          native
            ? `diff.changes[${nativeField}-change]`
            : "diff.changes[candidate-attribute-change]",
          { before: String(flip.before), after: String(flip.after) },
        ),
      ],
      supportingEvidence: supporting,
      limitations: [
        "Whether the other members of the set changed with it was not observed: Task 11 captures the clicked control and its declared region, not its siblings.",
      ],
    };
  },
  partial(facts) {
    if (!isSelectionControl(facts)) return null;
    if (
      stateFlip(facts, "checked") ??
      stateFlip(facts, "selected") ??
      ariaFlip(facts, "aria-checked") ??
      ariaFlip(facts, "aria-selected")
    ) {
      return null;
    }
    return {
      matchedEvidence: ["trigger is a selection-set control"],
      missingEvidence: ["checked / selected / aria-checked / aria-selected transition"],
    };
  },
};
