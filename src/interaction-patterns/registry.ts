import {
  disclosureAriaExpandedRule,
  disclosureNativeDetailsRule,
} from "./rules/disclosure.js";
import { tabsAriaSelectedRule } from "./rules/tabs.js";
import { menuHaspopupTargetRule, menuTargetRoleRule } from "./rules/menu.js";
import { dialogTriggerTargetRule } from "./rules/dialog.js";
import { toggleAriaPressedRule } from "./rules/toggle.js";
import { selectionCheckedRule } from "./rules/selection.js";
import { dismissSelfRemovalRule } from "./rules/dismiss.js";
import { genericStateToggleRule } from "./rules/generic-state-toggle.js";
import type { PatternRule } from "./rules/shared.js";

/**
 * The deterministic pattern registry (Task 12, items 11, 13, 38, 39).
 *
 * An explicit LIST of rules, not an if/else chain. Each entry carries its own id,
 * version, specificity and readable evidence contract, and the whole list is
 * published into `interaction-patterns.json` — so "which ruleset produced this
 * pattern, and what did it require?" is answerable from the artifact alone,
 * which is what the SiteSpec compiler will need.
 *
 * ## Specificity ladder (item 13)
 *
 * One action can satisfy several rules. `aria-expanded` + `aria-haspopup=menu` +
 * a mounted `role=menu` region is a correct disclosure AND a correct menu; menu
 * is the more specific truth, so it wins and exactly ONE pattern instance is
 * produced. The order below follows item 13's recommendation, adjusted where the
 * real rule relationships required it:
 *
 *   100  tabs                        role=tab owns aria-selected
 *    90  dialog                      a declared dialog region opened
 *    82  menu (trigger-declared)     aria-haspopup / menu-trigger
 *    80  menu (region-declared)      role=listbox|menu region opened
 *    70  selection                   radio / checkbox / option membership
 *    68  toggle                      aria-pressed / role=switch
 *    60  disclosure (native details)
 *    50  disclosure (aria-expanded)
 *    30  dismiss                     self-removal without navigation
 *    10  generic-state-toggle        the deterministic floor
 *
 * Every value is distinct on purpose. Two rules sharing a specificity would make
 * a tie unresolvable, and item 13 forbids resolving a tie arbitrarily — so a tie
 * is recorded as a registry conflict and the action becomes unknown instead.
 * `assertRegistryIntegrity()` makes a same-specificity pair impossible to ship.
 */

/** Sorted by descending specificity — the evaluation order is the ladder. */
export const PATTERN_RULES: readonly PatternRule[] = [
  tabsAriaSelectedRule,
  dialogTriggerTargetRule,
  menuHaspopupTargetRule,
  menuTargetRoleRule,
  selectionCheckedRule,
  toggleAriaPressedRule,
  disclosureNativeDetailsRule,
  disclosureAriaExpandedRule,
  dismissSelfRemovalRule,
  genericStateToggleRule,
];

/**
 * Structural invariants of the registry itself, checked before any modeling.
 *
 * These are the kind of mistake that produces plausible output forever: two
 * rules with the same id (one silently shadows the other in every summary), or
 * with the same specificity (every overlap becomes a coin flip). Cheap to check,
 * impossible to notice later.
 */
export function assertRegistryIntegrity(
  rules: readonly PatternRule[] = PATTERN_RULES,
): void {
  const ids = new Set<string>();
  const specificities = new Map<number, string>();
  for (const rule of rules) {
    if (ids.has(rule.id)) {
      throw new Error(`Pattern registry: duplicate rule id ${rule.id}`);
    }
    ids.add(rule.id);
    const existing = specificities.get(rule.specificity);
    if (existing) {
      throw new Error(
        `Pattern registry: ${rule.id} and ${existing} share specificity ${rule.specificity}; ` +
          `ties cannot be resolved arbitrarily (item 13)`,
      );
    }
    specificities.set(rule.specificity, rule.id);
  }
  for (let i = 1; i < rules.length; i++) {
    if (rules[i - 1]!.specificity < rules[i]!.specificity) {
      throw new Error(
        `Pattern registry: rules must be listed in descending specificity ` +
          `(${rules[i - 1]!.id} < ${rules[i]!.id})`,
      );
    }
  }
}

export type { PatternRule, RuleMatch, RulePartial } from "./rules/shared.js";
