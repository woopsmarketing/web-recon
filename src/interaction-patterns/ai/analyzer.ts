import { FakeUnknownInteractionAnalyzer } from "./fake-analyzer.js";
import {
  AI_PROMOTION_POLICY,
  AiInteractionAnalysisSchema,
  type AiAnalysisArtifact,
  type AiInteractionAnalysis,
  type UnknownInteractionAnalyzer,
} from "./types.js";
import { selectAiCases, type SelectedAiCase } from "./build-ai-case.js";
import type { UnknownInteractionsArtifact } from "../types.js";

/**
 * Provider resolution and the AI pass itself (Task 12, items 53–56, 101).
 *
 * The governing rule is item 55: **a missing AI provider is not a failure.**
 * `--ai` with nothing configured prints one clear line and the deterministic
 * modeling completes normally, because the deterministic result is the product
 * and the AI pass is an optional annotation on the part it could not explain.
 * A pipeline stage that breaks when an optional credential is absent has made
 * that credential mandatory.
 *
 * Only one provider ships: `fake`, the deterministic test provider. Task 12
 * deliberately introduces no vendor SDK (item 54) — the architecture boundary is
 * the deliverable, and a real provider is a thin later addition that implements
 * {@link UnknownInteractionAnalyzer} and changes nothing else.
 */

export interface ResolveAnalyzerOptions {
  /** Provider name, from `--ai-provider` or the environment. */
  provider?: string | undefined;
}

export interface ResolvedAnalyzer {
  analyzer?: UnknownInteractionAnalyzer;
  /** One human-readable line explaining what happened, always present. */
  message: string;
}

/** Environment variable a future real provider would be selected with. */
export const AI_PROVIDER_ENV = "WEB_RECON_AI_PROVIDER";

export function resolveAnalyzer(
  options: ResolveAnalyzerOptions = {},
): ResolvedAnalyzer {
  const requested = options.provider ?? process.env[AI_PROVIDER_ENV];

  if (!requested) {
    return {
      message:
        "AI provider not configured — deterministic modeling completed; no ai-analysis.json written. " +
        `Set --ai-provider <name> or ${AI_PROVIDER_ENV} to enable the fallback.`,
    };
  }

  if (requested === "fake") {
    return {
      analyzer: new FakeUnknownInteractionAnalyzer(),
      message:
        "AI provider: fake (deterministic test provider — results are inferred and never promoted)",
    };
  }

  return {
    message:
      `AI provider "${requested}" is not implemented in this repository — deterministic modeling ` +
      "completed; no ai-analysis.json written. Only the `fake` test provider ships with Task 12.",
  };
}

export interface RunAiFallbackOptions {
  analyzer: UnknownInteractionAnalyzer;
  unknowns: UnknownInteractionsArtifact;
  /** Path recorded as the artifact's provenance. */
  sourceUnknownInteractions: string;
}

export interface AiFallbackResult {
  artifact: AiAnalysisArtifact;
  /** The payloads that were sent — returned so a caller can audit them. */
  sent: SelectedAiCase[];
}

/**
 * Run the fallback over the eligible unknown signature groups.
 *
 * Order of operations matters and is the point of items 47 and 58: the
 * deterministic pass has already finished, patterns are already confirmed, and
 * only the leftovers — one representative per eligible signature — reach a
 * provider. A confirmed pattern is never sent (there is nothing to ask), and an
 * excluded reason is never sent (the answer is already known).
 *
 * A provider that throws does not fail the run: every selected case is recorded
 * with `status: "error"`, because losing the deterministic output over a flaky
 * network call would be a strictly worse outcome.
 */
export async function runAiFallback(
  options: RunAiFallbackOptions,
): Promise<AiFallbackResult> {
  const { analyzer, unknowns } = options;
  const selected = selectAiCases(unknowns.signatureGroups, unknowns.cases);

  let analyses: AiInteractionAnalysis[];
  if (selected.length === 0) {
    analyses = [];
  } else {
    try {
      const returned = await analyzer.analyze(selected.map((s) => s.case));
      const byId = new Map(returned.map((a) => [a.caseId, a]));
      analyses = selected.map(
        (s) =>
          byId.get(s.case.caseId) ?? {
            caseId: s.case.caseId,
            status: "unavailable" as const,
            evidenceUsed: [],
            uncertainty: ["The provider returned no analysis for this case."],
            provenance: "inferred" as const,
          },
      );
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      analyses = selected.map((s) => ({
        caseId: s.case.caseId,
        status: "error" as const,
        evidenceUsed: [],
        uncertainty: [],
        provenance: "inferred" as const,
        error: message.slice(0, 300),
      }));
    }
  }

  analyses = analyses
    .map((a) => AiInteractionAnalysisSchema.parse(a))
    .sort((a, b) => a.caseId.localeCompare(b.caseId));

  return {
    artifact: {
      schemaVersion: 1,
      provider: analyzer.name,
      rootUrl: unknowns.rootUrl,
      sourceUnknownInteractions: options.sourceUnknownInteractions,
      analyzedCaseCount: analyses.length,
      representedCaseCount: selected.reduce((sum, s) => sum + s.group.caseCount, 0),
      analyses,
      promotionPolicy: AI_PROMOTION_POLICY,
    },
    sent: selected,
  };
}
