import { DIALOG_TARGET_ROLES } from "../types.js";
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
 * Dialog rule (Task 12, item 19).
 *
 * A dialog is claimed only when a DECLARED region with dialog semantics
 * appeared or became visible. Two independent sources of "this is a dialog" are
 * accepted, and at least one must be present:
 *
 *   trigger side  Task 10's `dialog-trigger` capability, or `aria-haspopup=dialog`
 *   region side   `role=dialog` / `role=alertdialog` / a native `<dialog>`
 *
 * What is explicitly NOT accepted is background `aria-hidden` churn. Radix (and
 * every other modal library) marks the rest of the page `aria-hidden="true"`
 * when a modal opens, and Task 11 measured 26 `container-added` entries and 24
 * `aria-hidden` mutations from exactly one such open. Every one of those is a
 * consequence of a modal opening — and also of a non-modal listbox opening, and
 * of a route change. Treating it as the evidence would make "dialog" the answer
 * to any sufficiently dramatic click.
 *
 * So container churn is not even in the optional list. The verdict rests on the
 * region the trigger itself named.
 */

export const dialogTriggerTargetRule: PatternRule = {
  id: "dialog-trigger-target-v1",
  patternType: "dialog",
  version: 1,
  specificity: 90,
  description:
    "A trigger opened a declared region with dialog semantics (role=dialog/alertdialog or <dialog>).",
  requiredEvidence: [
    "declared region mounted or became visible",
    "dialog semantics on the trigger (dialog-trigger / aria-haspopup=dialog) or on the region (role=dialog|alertdialog, <dialog>)",
  ],
  optionalEvidence: [
    "candidate aria-expanded false→true",
    "region aria-modal",
    "interactive descendants inside the region",
  ],
  rejectionConditions: [
    "no declared region opened",
    "neither side declares dialog semantics",
    "background aria-hidden churn only (never sufficient — item 19)",
  ],
  match(facts) {
    const target = openedTargets(facts).find(
      (t) =>
        (t.role !== undefined && DIALOG_TARGET_ROLES.includes(t.role)) ||
        t.tagName === "dialog",
    );

    const triggerDeclares =
      facts.capabilities.includes("dialog-trigger") ||
      facts.beforeAttributes["aria-haspopup"] === "dialog" ||
      facts.afterAttributes["aria-haspopup"] === "dialog";

    // Trigger-side semantics still need a region that actually opened; a
    // `dialog-trigger` whose region never appeared proves nothing happened.
    const region = target ?? (triggerDeclares ? openedTargets(facts)[0] : undefined);
    if (!region) return null;
    if (!target && !triggerDeclares) return null;

    const flip = ariaFlip(facts, "aria-expanded");
    const evidence = [
      observed(
        target ? "target-dialog-role" : "capability:dialog-trigger",
        target ? "after.targets[].element.role" : "observation.capabilities",
        { after: target ? (target.role ?? target.tagName ?? "dialog") : "dialog-trigger" },
      ),
      observed(
        region.mounted ? "target-mounted" : "target-visibility-change",
        region.mounted
          ? "diff.changes[target-mounted]"
          : "diff.changes[target-visibility-change]",
        { before: "false", after: "true" },
      ),
    ];

    const limitations = [
      "Whether the dialog is modal is not asserted; background aria-hidden churn is deliberately excluded from this rule's evidence.",
    ];
    if (!target) {
      limitations.push(
        "The opened region does not declare a dialog role; the classification rests on the trigger's declared dialog semantics alone.",
      );
    }

    return {
      patternType: "dialog",
      ...(region.role ? { subtype: region.role } : {}),
      mechanism: region.mounted ? "target-mounted" : "target-visible",
      transition: flip
        ? {
            direction: openDirection(flip.after),
            field: "aria-expanded",
            before: String(flip.before),
            after: String(flip.after),
          }
        : {
            direction: openDirection(true),
            field: region.mounted ? "target-exists" : "target-visible",
            before: region.mounted ? "false" : String(region.visibleBefore ?? false),
            after: "true",
          },
      target: targetRecord(region),
      evidence,
      supportingEvidence: [
        ...targetEvidence(region),
        ...(flip
          ? [
              observed("aria-expanded", "diff.changes[candidate-attribute-change]", {
                before: String(flip.before),
                after: String(flip.after),
              }),
            ]
          : []),
      ],
      limitations,
    };
  },
  partial(facts) {
    const triggerDeclares =
      facts.capabilities.includes("dialog-trigger") ||
      facts.beforeAttributes["aria-haspopup"] === "dialog";
    if (!triggerDeclares) return null;
    if (openedTargets(facts).length > 0) return null;
    return {
      matchedEvidence: ["trigger declares dialog semantics"],
      missingEvidence: ["a declared region that mounted or became visible"],
    };
  },
};
