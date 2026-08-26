import type { ActionFacts } from "./facts.js";
import { PATTERN_RULES, type PatternRule } from "./registry.js";
import type { RuleMatch } from "./rules/shared.js";
import type { PartialPatternHint, PatternType } from "./types.js";

/**
 * Rule evaluation and specificity resolution (Task 12, item 13).
 *
 * Every rule is offered every eligible action — the registry is not a chain of
 * early returns — and the winner is decided afterwards by specificity. That
 * ordering matters for honesty as much as for correctness: because all rules run,
 * the losers are known, so "menu beat disclosure here" is a recorded fact rather
 * than an invisible consequence of statement order.
 *
 * Exactly one pattern instance may come out. Item 94 forbids emitting both the
 * generic and the specific reading of one action, and a duplicate would inflate
 * every count downstream.
 */

export interface PatternMatchOutcome {
  /** The winning rule, when exactly one specificity level claimed the action. */
  match?: { rule: PatternRule; result: RuleMatch };
  /** Set when the top specificity was claimed by more than one rule (item 13). */
  conflict?: {
    specificity: number;
    ruleIds: string[];
    patternTypes: PatternType[];
  };
  /** Rules that beat the winner on nothing but are worth reporting as hints. */
  partials: PartialPatternHint[];
  /** Rule ids that matched but lost on specificity — provenance for the report. */
  outrankedRuleIds: string[];
}

/**
 * Whether an action may be offered to the registry at all.
 *
 * Two hard gates, both prior to any rule:
 *
 *  - the click must have produced a meaningful transition (`status: changed`);
 *  - the document must not have moved under it (item 24). When the URL changed,
 *    before/after describe two different pages, so their differences are page
 *    replacement, and no amount of them may become pattern evidence.
 */
export function isPatternEligible(facts: ActionFacts): boolean {
  if (facts.status !== "changed") return false;
  if (facts.navigationTainted) return false;
  return true;
}

export function matchPattern(
  facts: ActionFacts,
  rules: readonly PatternRule[] = PATTERN_RULES,
): PatternMatchOutcome {
  const matches: { rule: PatternRule; result: RuleMatch }[] = [];
  const partials: PartialPatternHint[] = [];

  for (const rule of rules) {
    const result = rule.match(facts);
    if (result) {
      matches.push({ rule, result });
      continue;
    }
    const partial = rule.partial?.(facts);
    if (partial) {
      partials.push({
        ruleId: rule.id,
        patternType: rule.patternType,
        matchedEvidence: [...partial.matchedEvidence],
        missingEvidence: [...partial.missingEvidence],
      });
    }
  }

  partials.sort((a, b) => a.ruleId.localeCompare(b.ruleId));

  if (matches.length === 0) return { partials, outrankedRuleIds: [] };

  const top = Math.max(...matches.map((m) => m.rule.specificity));
  const winners = matches.filter((m) => m.rule.specificity === top);
  const outrankedRuleIds = matches
    .filter((m) => m.rule.specificity !== top)
    .map((m) => m.rule.id)
    .sort();

  if (winners.length > 1) {
    // Never resolved by picking one. A registry whose rules overlap at the same
    // specificity has a bug, and choosing a winner here would hide it forever.
    return {
      conflict: {
        specificity: top,
        ruleIds: winners.map((w) => w.rule.id).sort(),
        patternTypes: [...new Set(winners.map((w) => w.rule.patternType))].sort(),
      },
      partials,
      outrankedRuleIds,
    };
  }

  return { match: winners[0]!, partials, outrankedRuleIds };
}
