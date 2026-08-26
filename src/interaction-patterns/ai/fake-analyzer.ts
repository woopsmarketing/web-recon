import type {
  AiInteractionAnalysis,
  AiInteractionCase,
  UnknownInteractionAnalyzer,
} from "./types.js";

/**
 * Deterministic test provider (Task 12, items 53, 96, 98, 101).
 *
 * Task 12 must PASS without any external AI credential, so the contract needs a
 * provider that is real code rather than a mock object: it implements
 * {@link UnknownInteractionAnalyzer} exactly, is deterministic, and is the thing
 * the fixtures drive end to end.
 *
 * Two of its responses are chosen adversarially rather than helpfully:
 *
 *  - a `style-only-change` case comes back as **`theme-switch`**, a plausible and
 *    completely unverifiable name. Item 70 wants exactly this contrast preserved:
 *    the deterministic layer says "only class/style moved", the model says "theme
 *    switch", and the second must never overwrite the first.
 *  - an `unmatched-transition` case comes back as **`carousel` with `high`
 *    confidence** — a pattern type this registry does not have, asserted as
 *    strongly as the schema allows. Item 98's fixture then proves that a
 *    confident, articulate, wrong answer still produces **zero** carousels in
 *    `interaction-patterns.json`.
 *
 * A fake that only ever agreed with the rules would test nothing.
 */
export class FakeUnknownInteractionAnalyzer implements UnknownInteractionAnalyzer {
  readonly name = "fake";

  /** Cases this instance was asked about, in order — assertable by fixtures. */
  readonly seenCaseIds: string[] = [];
  /** Every payload received, so a fixture can string-search it (item 97). */
  readonly seenPayloads: AiInteractionCase[] = [];
  /** How many times `analyze` was called at all. */
  callCount = 0;

  async analyze(
    cases: readonly AiInteractionCase[],
  ): Promise<AiInteractionAnalysis[]> {
    this.callCount++;
    for (const one of cases) {
      this.seenCaseIds.push(one.caseId);
      this.seenPayloads.push(one);
    }
    return cases.map((one) => this.analyzeOne(one));
  }

  private analyzeOne(one: AiInteractionCase): AiInteractionAnalysis {
    switch (one.reason) {
      case "style-only-change":
        return {
          caseId: one.caseId,
          status: "analyzed",
          proposedPattern: { type: "theme-switch", confidence: "medium" },
          rationale:
            "The control mutated class and style with no semantic state; a colour-scheme switch looks like this.",
          evidenceUsed: ["mutation.categories", "diffCategories", "candidate.label"],
          uncertainty: [
            "No observed attribute distinguishes a theme switch from any other class-driven state.",
          ],
          suggestedNextProbe: {
            actionType: "observe-style-state",
            targetHint: "document root element",
            expectedObservation: "a data-theme or class value that differs after the click",
          },
          provenance: "inferred",
        };

      case "unmatched-transition":
        return {
          caseId: one.caseId,
          status: "analyzed",
          // Deliberately a pattern type this registry does not have, at the
          // highest confidence the schema allows (item 98).
          proposedPattern: { type: "carousel", subtype: "slide", confidence: "high" },
          rationale:
            "A confident but unverifiable claim, used to prove that AI output cannot promote itself into the registry.",
          evidenceUsed: ["diffCategories", "beforeState", "afterState"],
          uncertainty: ["No observed evidence supports this classification."],
          suggestedNextProbe: {
            actionType: "click-newly-mounted-child",
            targetHint: "the region that appeared",
          },
          reusableRuleProposal: {
            description: "Recognize a slide control by its label transition.",
            requiredEvidence: ["a label transition on the trigger"],
          },
          provenance: "inferred",
        };

      case "opaque-action":
        return {
          caseId: one.caseId,
          status: "analyzed",
          proposedPattern: { type: "clipboard-copy", confidence: "low" },
          rationale:
            "The click completed with no document-visible effect; a clipboard write is one explanation among several.",
          evidenceUsed: ["diffCategories", "mutation.recordCount"],
          uncertainty: [
            "Clipboard access is not observable from the DOM; this cannot be confirmed by any observation this engine makes.",
          ],
          suggestedNextProbe: { actionType: "no-further-probe" },
          provenance: "inferred",
        };

      default:
        return {
          caseId: one.caseId,
          status: "analyzed",
          rationale: "No plausible behavior category from the supplied evidence.",
          evidenceUsed: ["diffCategories"],
          uncertainty: ["Insufficient evidence for any classification."],
          suggestedNextProbe: { actionType: "no-further-probe" },
          provenance: "inferred",
        };
    }
  }
}
