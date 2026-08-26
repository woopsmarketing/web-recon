import { observed, type PatternRule } from "./shared.js";

/**
 * Dismiss rule (Task 12, item 22).
 *
 * The control clicked itself out of the document, and the page it was in is
 * still the same page. That is a real, reusable behavior and it is worth a name.
 *
 * It is worth a *careful* name. Three things this rule deliberately does not
 * claim:
 *
 *  - **not "modal close".** Nothing observed says the removed element was inside
 *    a modal, or that a modal closed. `<button>` removing itself is what was
 *    seen; that is what is recorded.
 *  - **not derived from text.** seoworld's close buttons carry `aria-label="닫기"`
 *    and `text="x"`. Reading those would work on this site and would require a
 *    per-language dictionary of close words to work anywhere, which is exactly
 *    the kind of rule item 22 forbids. The evidence is structural: the element
 *    is gone.
 *  - **not a navigation.** A candidate that vanishes because the router replaced
 *    the document is page replacement, not dismissal, so any URL movement or
 *    navigation safety event rejects the match outright.
 *
 * `candidate-replaced` also rejects: a framework swapping the node for a fresh
 * one is a re-render, and Task 11 records that separately for exactly this
 * reason.
 */

export const dismissSelfRemovalRule: PatternRule = {
  id: "dismiss-self-removal-v1",
  patternType: "dismiss",
  version: 1,
  specificity: 30,
  description:
    "The trigger removed itself from the document without any navigation.",
  requiredEvidence: [
    "candidate-removed",
    "no url-change",
    "no navigation safety event",
    "no candidate-replaced (that is a re-render, not a removal)",
  ],
  optionalEvidence: ["container-removed alongside it"],
  rejectionConditions: [
    "url-change or same-document-navigation",
    "navigation-blocked",
    "candidate-replaced",
  ],
  match(facts) {
    if (!facts.candidateRemoved) return null;
    if (facts.urlChanged || facts.navigationTainted || facts.navigationBlocked) return null;
    if (facts.candidateReplaced) return null;

    const supporting = [];
    if (facts.containerRemoved > 0) {
      supporting.push(
        observed("container-removed", "diff.categoryCounts[container-removed]", {
          after: String(facts.containerRemoved),
        }),
      );
    }

    return {
      patternType: "dismiss",
      subtype: "self-removal",
      mechanism: "candidate-removed",
      transition: {
        direction: "present-to-removed",
        field: "exists",
        before: "true",
        after: "false",
      },
      evidence: [
        observed("candidate-removed", "diff.changes[candidate-removed]", {
          before: "true",
          after: "false",
        }),
        observed("no-navigation", "diff.urlChanged + safetyEvents", { after: "false" }),
      ],
      supportingEvidence: supporting,
      limitations: [
        "Generic self-removal only. What the control dismissed (banner, notification, modal) is not claimed, and no close-word dictionary was consulted.",
      ],
    };
  },
};
