/**
 * Release state derivation + the indexable-production gate (spec §5, §19).
 *
 * The state is ALWAYS derived from artifacts + requirement statuses — there is
 * no writable "ready" flag anywhere. PRODUCTION_READY demands, from artifacts:
 *
 *   - a production spec whose indexabilityGate.decision is `indexable`
 *     (which itself requires the SEO plan's production domain),
 *   - zero unresolved release-blocking requirements (content routes covered,
 *     replacement-required render assets 0, runtime source dependencies 0,
 *     font decisions resolved, no visible source-brand blockers),
 *   - a PASSING isolated-package production QA for that build.
 *
 * A domain alone can flip the SEO plan to production mode — it can NEVER flip
 * a project to PRODUCTION_READY (preflight R3).
 */
import type { ArtifactFacts } from "./collect.js";
import type { ReleaseState, Requirement, ReleaseStage, StageStatus } from "./types.js";
import { releaseBlockers } from "./requirements.js";

export interface GateInput {
  stageStatus: Record<ReleaseStage, StageStatus>;
  requirements: Requirement[];
  facts: ArtifactFacts | null;
}

export function deriveReleaseState(input: GateInput): ReleaseState {
  const has = (stage: ReleaseStage): boolean => input.stageStatus[stage]?.artifact !== null;
  if (!has("reconstruction")) return "DISCOVERED";
  if (!has("template")) return "RECONSTRUCTED";
  if (!has("content")) return "TEMPLATED";
  if (!has("theme")) return "CONTENT_READY";
  if (!has("seo")) return "THEME_READY";
  if (!has("assets")) return "SEO_PREVIEW_READY";
  if (!has("production")) return "ASSET_PREVIEW_READY";

  const blockers = releaseBlockers(input.requirements);
  const facts = input.facts;
  if (
    blockers.length === 0 &&
    facts !== null &&
    facts.specDecision === "indexable" &&
    facts.productionQaPass === true &&
    input.stageStatus.production.status === "fresh"
  ) {
    return "PRODUCTION_READY";
  }
  if (blockers.length === 0) return "PRODUCTION_PREVIEW_READY";
  return "PRODUCTION_INPUTS_REQUIRED";
}
