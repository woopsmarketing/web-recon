import { MENU_TARGET_ROLES } from "../types.js";
import type { ActionFacts, TargetFacts } from "../facts.js";
import {
  ariaFlip,
  observed,
  openDirection,
  openedTargets,
  targetEvidence,
  targetRecord,
  type PatternRule,
  type RuleMatch,
} from "./shared.js";

/**
 * Menu rules (Task 12, items 18, 72).
 *
 * A "menu" here is the popup family — menu / listbox / tree / grid — because
 * splitting `dropdown` from `menu` from `select` would be three names for one
 * verified behavior: *a control opened a region of choices*. The distinction the
 * markup DOES make is kept as `subtype`, taken verbatim from `aria-haspopup` or
 * from the opened region's own `role`.
 *
 * Two rules, ordered, because there are two independent ways the markup can say
 * "this is a popup" and one of them is strictly stronger:
 *
 *   menu-haspopup-target-v1  the TRIGGER declares it (`aria-haspopup=menu`, or
 *                            Task 10's `menu-trigger`). Authoritative.
 *   menu-target-role-v1      the opened REGION declares it (`role=listbox` with
 *                            `option` children). Also authoritative — about the
 *                            region rather than the trigger.
 *
 * The second rule exists because of measured data: every one of nextjs.org's
 * nine dynamic mounts is a `role=combobox` button with NO `aria-haspopup` at
 * all, opening a `role=listbox` with `role=option` children. Requiring
 * `aria-haspopup` would have thrown away the single strongest piece of dynamic
 * evidence in the whole corpus.
 *
 * Neither rule accepts a mount on its own (item 72). A region appearing proves
 * something rendered; the trigger's `aria-expanded` transition, or the region's
 * own popup role, is what makes it a menu.
 */

function haspopupValue(facts: ActionFacts): string | undefined {
  const value =
    facts.beforeAttributes["aria-haspopup"] ?? facts.afterAttributes["aria-haspopup"];
  if (!value) return undefined;
  return MENU_TARGET_ROLES.includes(value) || value === "true" ? value : undefined;
}

/** The expansion transition a menu rule may stand on, if the trigger declared one. */
function expansion(facts: ActionFacts): { before: boolean; after: boolean } | undefined {
  return ariaFlip(facts, "aria-expanded");
}

function menuMatch(
  facts: ActionFacts,
  target: TargetFacts,
  subtype: string,
  triggerEvidence: RuleMatch["evidence"],
): RuleMatch {
  const flip = expansion(facts);
  const supporting = targetEvidence(target);
  if (target.optionCountAfter > 0) {
    supporting.push(
      observed("option-descendants", "after.targets[].descendants.optionCount", {
        after: String(target.optionCountAfter),
      }),
    );
  }
  if (target.menuitemCountAfter > 0) {
    supporting.push(
      observed("menuitem-descendants", "after.targets[].descendants.menuitemCount", {
        after: String(target.menuitemCountAfter),
      }),
    );
  }

  const limitations = [
    "The region's contents were inventoried, never activated: what each item does is unknown at this depth (Task 11 explores one action deep).",
  ];
  if (!flip) {
    limitations.push(
      "The trigger does not expose aria-expanded; the open state is evidenced by the region only.",
    );
  }

  const transition = flip
    ? {
        direction: openDirection(flip.after),
        field: "aria-expanded",
        before: String(flip.before),
        after: String(flip.after),
      }
    : {
        direction: openDirection(true),
        field: target.mounted ? "target-exists" : "target-visible",
        before: target.mounted ? "false" : String(target.visibleBefore ?? false),
        after: "true",
      };

  return {
    patternType: "menu",
    subtype,
    mechanism: target.mounted ? "target-mounted" : "target-visible",
    transition,
    target: targetRecord(target),
    evidence: [
      ...triggerEvidence,
      observed(
        target.mounted ? "target-mounted" : "target-visibility-change",
        target.mounted
          ? "diff.changes[target-mounted]"
          : "diff.changes[target-visibility-change]",
        { before: "false", after: "true" },
      ),
    ],
    supportingEvidence: supporting,
    limitations,
  };
}

export const menuHaspopupTargetRule: PatternRule = {
  id: "menu-haspopup-target-v1",
  patternType: "menu",
  version: 1,
  specificity: 82,
  description:
    "A trigger declaring a popup (aria-haspopup / menu-trigger) opened its declared region.",
  requiredEvidence: [
    "trigger aria-haspopup in {menu,listbox,tree,grid,true} or Task 10 menu-trigger capability",
    "declared region mounted or became visible",
  ],
  optionalEvidence: [
    "candidate aria-expanded false→true",
    "region role=menu/listbox",
    "menuitem / option descendants",
  ],
  rejectionConditions: [
    "the trigger declares no popup",
    "no declared region mounted or became visible",
    "the region is a dialog (the dialog rule is more specific)",
  ],
  match(facts) {
    const haspopup = haspopupValue(facts);
    const declaresMenu = haspopup !== undefined || facts.capabilities.includes("menu-trigger");
    if (!declaresMenu) return null;

    const target = openedTargets(facts)[0];
    if (!target) return null;

    const subtype =
      haspopup && haspopup !== "true"
        ? haspopup
        : target.role && MENU_TARGET_ROLES.includes(target.role)
          ? target.role
          : "menu";

    return menuMatch(facts, target, subtype, [
      observed(
        haspopup !== undefined ? "aria-haspopup" : "capability:menu-trigger",
        haspopup !== undefined
          ? "before.candidate.attributes"
          : "observation.capabilities",
        { after: haspopup ?? "menu-trigger" },
      ),
    ]);
  },
};

export const menuTargetRoleRule: PatternRule = {
  id: "menu-target-role-v1",
  patternType: "menu",
  version: 1,
  specificity: 80,
  description:
    "A trigger opened a region that declares itself a menu-family popup (role=menu/listbox/tree/grid).",
  requiredEvidence: [
    "declared region mounted or became visible",
    "region role in {menu,listbox,tree,grid}",
    "candidate aria-expanded false↔true",
  ],
  optionalEvidence: [
    "option / menuitem descendants",
    "Task 10 select / open-options capability",
    "role=combobox trigger",
  ],
  rejectionConditions: [
    "the region does not declare a popup role",
    "the trigger never declared an expansion (a mount alone is not a pattern — item 72)",
  ],
  match(facts) {
    const flip = expansion(facts);
    if (!flip || !flip.after) return null;

    const target = openedTargets(facts).find(
      (t) => t.role !== undefined && MENU_TARGET_ROLES.includes(t.role),
    );
    if (!target) return null;

    const triggerEvidence = [
      observed("aria-expanded", "diff.changes[candidate-attribute-change]", {
        before: String(flip.before),
        after: String(flip.after),
      }),
      observed("target-role", "after.targets[].element.role", { after: target.role }),
    ];
    if (facts.trigger.role) {
      triggerEvidence.push(
        observed("trigger-role", "locatorResolution.locatorDescriptor.role", {
          after: facts.trigger.role,
        }),
      );
    }

    return menuMatch(facts, target, target.role!, triggerEvidence);
  },
  partial(facts) {
    // A popup-shaped region appeared but the trigger never declared expansion.
    const target = openedTargets(facts).find(
      (t) => t.role !== undefined && MENU_TARGET_ROLES.includes(t.role),
    );
    if (!target) return null;
    if (expansion(facts)) return null;
    return {
      matchedEvidence: [`region role=${target.role} mounted or became visible`],
      missingEvidence: ["candidate aria-expanded false↔true"],
    };
  },
};
