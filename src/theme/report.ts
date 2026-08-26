import type { ThemeExtraction } from "./extract.js";

/**
 * Extraction review report (§38): the human-reviewable answer to "what did
 * the extractor decide, on what evidence?" — token by token, plus the raw
 * paint groups it deliberately did NOT name.
 */

export interface ExtractionReview {
  templateId: string;
  tokens: {
    token: string;
    originalValue: string;
    boundGroups: number;
    elementWeight: number;
    provenance: string;
    evidence: string[];
    representativeSelectors: string[];
  }[];
  unassignedContractTokens: string[];
  counts: {
    paintGroups: number;
    themeable: number;
    preserved: number;
    review: number;
  };
  topReviewGroups: {
    paintGroupId: string;
    property: string;
    value: string;
    elementWeight: number;
    reasons: string[];
  }[];
  topPreservedGroups: {
    paintGroupId: string;
    property: string;
    value: string;
    elementWeight: number;
    reasons: string[];
  }[];
}

export function buildExtractionReview(extraction: ThemeExtraction): ExtractionReview {
  const { adapter } = extraction;
  const groupById = new Map(adapter.paintGroups.map((group) => [group.paintGroupId, group]));
  const tokens = Object.entries(adapter.tokens)
    .map(([token, entry]) => {
      let elementWeight = 0;
      const selectors: string[] = [];
      for (const groupId of entry.boundGroupIds) {
        const group = groupById.get(groupId);
        if (!group) continue;
        elementWeight += group.staticElementCount + group.dynamicElementCount;
        if (selectors.length < 3 && group.selectors[0] !== undefined) selectors.push(group.selectors[0]);
      }
      return {
        token,
        originalValue: entry.originalValue,
        boundGroups: entry.boundGroupIds.length,
        elementWeight,
        provenance: entry.provenance,
        evidence: entry.evidence,
        representativeSelectors: selectors,
      };
    })
    .sort((a, b) => a.token.localeCompare(b.token));

  const assigned = new Set(Object.keys(adapter.tokens));
  const weightOf = (groupId: string): number => {
    const group = groupById.get(groupId);
    return group === undefined ? 0 : group.staticElementCount + group.dynamicElementCount + group.nodeScopedRuleCount;
  };
  const summarize = (status: "review" | "preserved") =>
    adapter.paintGroups
      .filter((group) => group.status === status)
      .sort((a, b) => weightOf(b.paintGroupId) - weightOf(a.paintGroupId))
      .slice(0, 15)
      .map((group) => ({
        paintGroupId: group.paintGroupId,
        property: group.property,
        value: group.value.slice(0, 120),
        elementWeight: group.staticElementCount + group.dynamicElementCount,
        reasons: group.reasons,
      }));

  return {
    templateId: adapter.templateId,
    tokens,
    unassignedContractTokens: [
      "color.canvas",
      "color.surface.primary",
      "color.surface.secondary",
      "color.surface.elevated",
      "color.text.primary",
      "color.text.secondary",
      "color.text.muted",
      "color.text.inverse",
      "color.action.primary",
      "color.action.primaryText",
      "color.link",
      "color.border.default",
      "color.border.strong",
      "color.accent.primary",
      "color.accent.secondary",
    ].filter((token) => !assigned.has(token)),
    counts: {
      paintGroups: adapter.paintGroups.length,
      themeable: adapter.coverage.themeableGroups,
      preserved: adapter.coverage.preservedGroups,
      review: adapter.coverage.reviewGroups,
    },
    topReviewGroups: summarize("review"),
    topPreservedGroups: summarize("preserved"),
  };
}
