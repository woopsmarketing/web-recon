/**
 * Stage input hashing → fresh / stale / blocked (spec §13).
 *
 * Every stage's inputs are reduced to ONE sha256 over a canonical JSON of:
 *   - the upstream stages' artifact dir hashes (dir-sha256-v1, Task 23's
 *     hashDirectory — reused, not re-implemented), and
 *   - the slice of the cumulative resolution that stage consumes
 *     (asset files are content-hashed, so swapping bytes at the same path
 *     is a change).
 *
 * fresh   recorded inputsHash === recomputed inputsHash
 * stale   inputs moved (upstream artifact or resolution slice changed)
 * blocked target is indexable production and unresolved release-blocking
 *         requirements remain (production stage only)
 */
import { createHash } from "node:crypto";
import { existsSync } from "node:fs";

import { hashDirectory, hashFile } from "../production/hash.js";
import { STAGE_DEPENDENCIES, STAGE_ORDER } from "./graph.js";
import { CANONICAL_FACT_KEYS, normalizeProductionDomain } from "./requirements.js";
import type {
  ProductionResolution,
  ReleaseProject,
  ReleaseStage,
  Requirement,
  StageStatus,
} from "./types.js";

function sha256(value: unknown): string {
  return createHash("sha256").update(JSON.stringify(value), "utf8").digest("hex");
}

export async function resolutionAssetContentHashes(
  resolution: ProductionResolution,
): Promise<Record<string, string>> {
  const out: Record<string, string> = {};
  for (const [assetId, value] of Object.entries(resolution.assets ?? {})) {
    const file = typeof value === "string" ? value : value.file;
    out[assetId] = existsSync(file) ? await hashFile(file) : `missing:${file}`;
  }
  return out;
}

/** The slice of the cumulative resolution one stage consumes. */
export function resolutionSliceFor(
  stage: ReleaseStage,
  resolution: ProductionResolution,
  assetHashes: Record<string, string>,
): unknown {
  switch (stage) {
    case "content":
      return {
        facts: resolution.facts ?? {},
        urls: resolution.urls ?? {},
        routeContent: resolution.routeContent ?? {},
      };
    case "seo":
      return {
        productionDomain:
          resolution.productionBaseUrl === undefined
            ? null
            : normalizeProductionDomain(resolution.productionBaseUrl),
        facts: Object.fromEntries(
          Object.entries(resolution.facts ?? {}).filter(([key]) =>
            (CANONICAL_FACT_KEYS as readonly string[]).includes(key),
          ),
        ),
      };
    case "assets":
      return {
        assets: assetHashes,
        fontDecisions: resolution.fontDecisions ?? {},
      };
    case "production":
      return {
        targetMode: resolution.productionBaseUrl === undefined ? "preview" : "indexable-production",
      };
    default:
      return {};
  }
}

export function computeStageInputsHash(
  stage: ReleaseStage,
  artifactHashes: Partial<Record<ReleaseStage, string | null>>,
  resolution: ProductionResolution,
  assetHashes: Record<string, string>,
  intentHash: string | null,
): string {
  const upstream: Record<string, string | null> = {};
  for (const dep of STAGE_DEPENDENCIES[stage]) {
    upstream[dep] = artifactHashes[dep] ?? null;
  }
  return sha256({
    stage,
    upstream,
    resolution: resolutionSliceFor(stage, resolution, assetHashes),
    ...(stage === "content" ? { intentHash } : {}),
  });
}

export interface RefreshOptions {
  /** Re-hash every artifact directory to detect drift (default true). */
  verifyArtifacts?: boolean;
  log?: (line: string) => void;
}

export interface RefreshedStatuses {
  stageStatus: Record<ReleaseStage, StageStatus>;
  artifactHashes: Partial<Record<ReleaseStage, string | null>>;
  warnings: string[];
}

/**
 * Recompute fresh/stale for every stage from the project's current artifacts
 * and cumulative resolution. Does not write anything.
 */
export async function refreshStageStatuses(
  project: ReleaseProject,
  resolution: ProductionResolution,
  options: RefreshOptions = {},
): Promise<RefreshedStatuses> {
  const verify = options.verifyArtifacts ?? true;
  const log = options.log ?? ((): void => {});
  const warnings: string[] = [];
  const assetHashes = await resolutionAssetContentHashes(resolution);
  for (const [assetId, hash] of Object.entries(assetHashes)) {
    if (hash.startsWith("missing:")) {
      warnings.push(`resolution asset "${assetId}" file not found: ${hash.slice("missing:".length)}`);
    }
  }

  const artifactHashes: Partial<Record<ReleaseStage, string | null>> = {};
  for (const stage of STAGE_ORDER) {
    const status = project.stageStatus[stage];
    const artifact = status?.artifact ?? null;
    if (artifact === null) {
      artifactHashes[stage] = null;
      continue;
    }
    if (!verify) {
      artifactHashes[stage] = artifact.hash;
      continue;
    }
    if (!existsSync(artifact.path)) {
      warnings.push(`${stage}: artifact directory missing: ${artifact.path}`);
      artifactHashes[stage] = `missing:${artifact.path}`;
      continue;
    }
    const recomputed = await hashDirectory(artifact.path, artifact.excluded ?? []);
    if (recomputed.hash !== artifact.hash) {
      warnings.push(
        `${stage}: artifact drift — ${artifact.path} hashes ${recomputed.hash.slice(0, 12)}…, ` +
          `recorded ${artifact.hash.slice(0, 12)}… (downstream stages treated stale)`,
      );
    }
    artifactHashes[stage] = recomputed.hash;
    log(`[release] hashed ${stage}: ${recomputed.hash.slice(0, 12)}… (${artifact.path})`);
  }

  const stageStatus = {} as Record<ReleaseStage, StageStatus>;
  for (const stage of STAGE_ORDER) {
    const previous = project.stageStatus[stage];
    const artifact = previous?.artifact ?? null;
    const inputsHash = computeStageInputsHash(
      stage,
      artifactHashes,
      resolution,
      assetHashes,
      project.intent.intentHash,
    );
    const reasons: string[] = [];
    let fresh = artifact !== null && previous?.inputsHash === inputsHash;
    if (artifact === null) reasons.push("no artifact for this stage yet");
    else if (previous?.inputsHash !== inputsHash) reasons.push("stage inputs changed since the artifact was produced");
    const drifted = artifact !== null && artifactHashes[stage] !== artifact.hash;
    if (drifted) {
      fresh = false;
      reasons.push("artifact bytes drifted from the recorded hash");
    }
    stageStatus[stage] = {
      status: fresh ? "fresh" : "stale",
      artifact,
      inputsHash: previous?.inputsHash ?? null,
      reasons,
      blockedBy: [],
    };
  }

  return { stageStatus, artifactHashes, warnings };
}

/**
 * Apply target-mode blocking (spec §18/§19): when the target is indexable
 * production and release-blocking requirements remain unresolved, the
 * production stage is BLOCKED (it must not compile a fake-indexable build).
 */
export function applyBlocking(
  stageStatus: Record<ReleaseStage, StageStatus>,
  blockers: Requirement[],
  targetMode: "preview" | "indexable-production",
): void {
  if (targetMode !== "indexable-production" || blockers.length === 0) return;
  const production = stageStatus.production;
  production.status = "blocked";
  production.blockedBy = blockers.map((requirement) => requirement.requirementId);
  production.reasons = [
    ...production.reasons,
    `indexable production is gated: ${blockers.length} release-blocking requirement(s) unresolved`,
  ];
}
