import type {
  UnknownGroup,
  UnknownInteractionCase,
} from "../types.js";
import { AiInteractionCaseSchema, type AiInteractionCase } from "./types.js";

/**
 * Compact AI payload construction (Task 12, items 47, 52, 97, 112).
 *
 * Two independent jobs, both about spending as little as possible:
 *
 * **How many cases.** One representative per eligible signature group, never one
 * per occurrence. nextjs.org produces 27 identical "already selected theme
 * radio" cases; sending 27 payloads to learn one thing would be the single most
 * expensive mistake available here. `selectAiCases()` returns representatives
 * and records how many occurrences each stands for, so the artifact can state
 * the saving rather than imply it.
 *
 * **How much per case.** An allowlist, not a redaction pass. This function
 * BUILDS a payload out of named fields rather than taking an unknown case and
 * removing the dangerous parts, so there is no "and we forgot that one" failure
 * mode: anything not written here cannot reach a provider. Never included, at
 * any size: `outerHTML`, rendered HTML, `dom.json`, `styles.json`, cookies,
 * storage, request bodies, credentials, or a full URL with its query string.
 *
 * The URL is reduced to a path for the same reason Task 11 reduced its safety
 * events to `origin + pathname`: query strings routinely carry tokens.
 */

/** `https://nextjs.org/docs/app?x=1#y` → `/docs/app`. Never the query string. */
function pagePath(url: string): string {
  try {
    return new URL(url).pathname || "/";
  } catch {
    return "/";
  }
}

/**
 * Build the payload for ONE unknown case.
 *
 * `occurrenceCount` is passed in rather than derived here: the case does not
 * know how many siblings share its signature, and the model genuinely benefits
 * from knowing whether it is looking at a one-off or at a behavior repeated 27
 * times.
 */
export function buildAiCase(
  unknown: UnknownInteractionCase,
  occurrenceCount: number,
): AiInteractionCase {
  const payload: AiInteractionCase = {
    caseId: unknown.id,
    reason: unknown.reason,
    pagePath: pagePath(unknown.source.url),
    viewport: unknown.source.viewport,
    candidate: {
      tagName: unknown.candidateSummary.tagName,
      ...(unknown.candidateSummary.role !== undefined
        ? { role: unknown.candidateSummary.role }
        : {}),
      ...(unknown.candidateSummary.inputType !== undefined
        ? { inputType: unknown.candidateSummary.inputType }
        : {}),
      ...(unknown.candidateSummary.label !== undefined
        ? { label: unknown.candidateSummary.label }
        : {}),
      capabilities: [...unknown.candidateSummary.capabilities],
    },
    beforeState: unknown.beforeStateSummary,
    ...(unknown.afterStateSummary ? { afterState: unknown.afterStateSummary } : {}),
    diffCategories: [...unknown.diffCategories],
    mutation: {
      categories: [...unknown.mutationSummary.categories],
      recordCount: unknown.mutationSummary.recordCount,
      addedNodeCount: unknown.mutationSummary.addedNodeCount,
      removedNodeCount: unknown.mutationSummary.removedNodeCount,
    },
    safetyEvents: [...unknown.safetySummary],
    partialPatternHints: unknown.partialPatternHints.map((hint) => ({
      ruleId: hint.ruleId,
      patternType: hint.patternType,
      missingEvidence: [...hint.missingEvidence],
    })),
    occurrenceCount,
  };

  // Validated on the way out, so a future edit that adds a field has to add it
  // to the schema — where item 52's exclusion list is written down.
  return AiInteractionCaseSchema.parse(payload);
}

export interface SelectedAiCase {
  case: AiInteractionCase;
  group: UnknownGroup;
}

/**
 * Choose which unknown cases an AI pass would see (items 47, 48, 112).
 *
 * Only `eligible` groups. `conditional` (navigation-tainted) and `excluded`
 * (already-in-target-state, blocked-navigation, execution-error) are left out
 * because a deterministic rule already explains them — paying a model to restate
 * a known answer is the definition of waste.
 */
export function selectAiCases(
  groups: readonly UnknownGroup[],
  cases: readonly UnknownInteractionCase[],
): SelectedAiCase[] {
  const byId = new Map(cases.map((c) => [c.id, c]));
  const selected: SelectedAiCase[] = [];
  for (const group of groups) {
    if (group.aiEligibility !== "eligible") continue;
    const representative = byId.get(group.representativeCaseId);
    if (!representative) continue;
    selected.push({
      case: buildAiCase(representative, group.caseCount),
      group,
    });
  }
  selected.sort((a, b) => a.case.caseId.localeCompare(b.case.caseId));
  return selected;
}
