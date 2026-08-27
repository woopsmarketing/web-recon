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
import { FROZEN_STAGES } from "./types.js";
import type {
  AuthoredState,
  ProductionResolution,
  ReleaseProject,
  ReleaseStage,
  Requirement,
  StageStatus,
} from "./types.js";

/**
 * Subtrees excluded from the FROZEN template lineage hash.
 *
 * `report/` is excluded deliberately: `pnpm qa:recon-template` writes QA
 * artifacts into the template run dir (src/cli-qa-recon-template.ts), and
 * build.ts refuses a build whose frozen-stage bytes drifted — so without this
 * exclusion, running template QA after release:prepare bricks release:build.
 * Template QA output is a REPORT about the template, never an input to it.
 *
 * prepare.ts hashes the template with exactly this set and records it in the
 * ArtifactRef's `excluded`; refreshStageStatuses below re-hashes with the
 * RECORDED set, so the two can never disagree by construction. Projects
 * prepared before Task 27 recorded the old set — re-running release:prepare
 * with the same --project-id re-hashes them under this one (non-destructively).
 */
export const FROZEN_TEMPLATE_HASH_EXCLUSIONS: readonly string[] = [
  "node_modules",
  ".next",
  "out",
  "report",
];

/**
 * Subtrees/files excluded from the CONTENT lineage hash.
 *
 * Same landmine as the template `report/` one above, one stage over: Task 27
 * added writes INTO a content run dir that a QA or revalidation pass makes
 * again and again —
 *   - `report/telemetry.jsonl` (append-only, one record per provider call) and
 *     `report/repair/` (src/cli-content-qa.ts:164,182,270),
 *   - `slot-accounting.json`, refreshed on every `revalidateSlotValues`
 *     (src/content-injection/run.ts:188, reached from run.ts:285).
 * Without an exclusion set, `pnpm content:qa` / `content:validate` after
 * `release:prepare` drifts the content stage hash, staling content AND every
 * downstream stage — a rerun of the whole tail for bytes nothing consumes.
 *
 * WHAT IS EXCLUDED, and why each one is safe:
 *   report/               Every file under it is a REPORT ABOUT the content
 *                         run, never an input to it: validation.json,
 *                         brand-leak.json, operator-review.{json,md},
 *                         layout-qa.json, telemetry.jsonl, repair/,
 *                         screenshots/. `report/brand-leak.json` IS read by
 *                         collect.ts:184 — but requirements are RE-COLLECTED
 *                         from the artifacts on every prepare/build, never
 *                         from this hash, so excluding it loses no signal.
 *                         Each report is a pure function of inputs that stay
 *                         in the hash (slot-values.json + the template), so a
 *                         report that moved without them is derived noise.
 *   slot-accounting.json  Task 27's SIBLING account of every in-scope slot,
 *                         derived from manifest + template + units + overlay
 *                         (content-injection/accounting.ts). Nothing consumes
 *                         the FILE at build time — stages.ts:180 reads the
 *                         in-memory `outcome.accounting` of the run it just
 *                         produced.
 *
 * WHAT DELIBERATELY STAYS IN, and why:
 *   slot-values.json      AUTHORED INPUT. production/run.ts:234,375 reads and
 *                         bakes it. Excluding it would let an operator's real
 *                         content edit ship as "fresh" — a silent staleness
 *                         bug strictly worse than the drift being fixed here.
 *   manifest.json         Carries real inputs (runId, scopedRoutes, truthMode,
 *                         manualEdits) read by production/run.ts:192,
 *                         collect.ts:120 and stages.ts:80.
 *   generation-result.json, content-units.json, content-policy.json,
 *   generation-request.json, generation-schema.json, intent.json,
 *   region-plan.json, template-summary.json
 *                         All generation inputs/outputs a content rerun and
 *                         the asset inventory (assets/inventory.ts:219) read.
 *
 * Applied by prepare.ts (`acceptedLineage.content`) and stages.ts
 * (`contentStageRunner`'s `excluded`), and re-hashed here from the RECORDED
 * set — the same three-point contract the template set already has.
 */
export const CONTENT_DERIVED_HASH_EXCLUSIONS: readonly string[] = ["report", "slot-accounting.json"];

/**
 * The exclusion set a stage's artifact hash SHOULD be recorded with today.
 *
 * Only stages whose run dir receives derived/report writes appear here; every
 * other stage hashes whole. Used to detect a project whose RECORDED set
 * predates a fix (see `staleExclusionSetWarnings`).
 */
export const STAGE_HASH_EXCLUSIONS: Partial<Record<ReleaseStage, readonly string[]>> = {
  template: FROZEN_TEMPLATE_HASH_EXCLUSIONS,
  content: CONTENT_DERIVED_HASH_EXCLUSIONS,
};

/**
 * Warn when a loaded project's RECORDED exclusion set predates the current one.
 *
 * DECISION (Task 27 hardening): WARN, never silently re-adopt. Re-hashing is
 * driven by the recorded `artifact.excluded` (refreshStageStatuses below), so
 * swapping in the current set on load would change the meaning of a hash that
 * was computed under the old one. Where the old set already folded, say,
 * `report/` bytes into the recorded template hash, adopting the new set would
 * make that project drift — turning a project that builds today into one that
 * a frozen-stage refusal bricks, at LOAD time, with no operator action. That
 * trades a latent risk for a certain break.
 *
 * Historical hashes are also immutable by rule (Tasks 23-26). So the residual
 * risk is surfaced instead of hidden: the operator is told exactly which stage
 * is exposed and that a re-prepare under the same --project-id re-hashes it
 * non-destructively (prepare.ts recomputes every ArtifactRef from disk).
 */
export function staleExclusionSetWarnings(project: ReleaseProject): string[] {
  const warnings: string[] = [];
  for (const [stage, expected] of Object.entries(STAGE_HASH_EXCLUSIONS) as Array<
    [ReleaseStage, readonly string[]]
  >) {
    const artifact = project.stageStatus[stage]?.artifact ?? null;
    if (artifact === null) continue;
    const recorded = new Set(artifact.excluded ?? []);
    const missing = expected.filter((entry) => !recorded.has(entry));
    if (missing.length === 0) continue;
    warnings.push(
      `${stage}: recorded artifact hash exclusions predate the derived-output fix ` +
        `(missing ${missing.map((entry) => `"${entry}"`).join(", ")}; recorded ` +
        `[${[...recorded].join(", ")}]). A QA/revalidation write into ${artifact.path} ` +
        `will drift this stage's hash` +
        ((FROZEN_STAGES as readonly ReleaseStage[]).includes(stage)
          ? " and release:build will REFUSE it as frozen-stage drift"
          : " and force an unnecessary rerun of it and every downstream stage") +
        `. Re-run \`pnpm release:prepare\` with --project-id ${project.projectId} to re-hash ` +
        "it under the current set (non-destructive: authored state and resolutions are preserved).",
    );
  }
  return warnings;
}

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
  authored?: AuthoredState,
): unknown {
  // Authored slices are folded in ONLY when non-empty. An absent/empty
  // authored block is byte-identical to the pre-Task-27 slice, so every
  // inputsHash recorded by an older project stays valid (no phantom staleness).
  const authoredSlotValues = authored?.slotValues ?? {};
  const authoredTheme = authored?.theme ?? {};
  switch (stage) {
    case "content":
      return {
        facts: resolution.facts ?? {},
        urls: resolution.urls ?? {},
        routeContent: resolution.routeContent ?? {},
        // authored.slotValues is the AUTHORITATIVE content input — a Visual
        // Editor edit that never passes through a resolution pack must still
        // make the content stage stale.
        ...(Object.keys(authoredSlotValues).length > 0 ? { authoredSlotValues } : {}),
      };
    case "theme":
      // Wires THEME_SELECTION_IMPACTS live: a theme edit changes the theme
      // stage's inputs (and, through the DAG, production) and NOTHING else.
      return Object.keys(authoredTheme).length > 0 ? { authoredTheme } : {};
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
  authored?: AuthoredState,
): string {
  const upstream: Record<string, string | null> = {};
  for (const dep of STAGE_DEPENDENCIES[stage]) {
    upstream[dep] = artifactHashes[dep] ?? null;
  }
  return sha256({
    stage,
    upstream,
    resolution: resolutionSliceFor(stage, resolution, assetHashes, authored),
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
  const warnings: string[] = [...staleExclusionSetWarnings(project)];
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
    // The RECORDED exclusion set is authoritative — prepare.ts wrote it from
    // FROZEN_TEMPLATE_HASH_EXCLUSIONS, so the two sets agree by construction.
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
      project.authored,
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

  // The cascade is applied HERE, not at each call site: every consumer of a
  // refresh (plan, build, resolve, prepare) must answer "what will re-run?"
  // identically, and the persisted stageStatus must carry that same answer.
  propagateStaleStages(stageStatus);

  return { stageStatus, artifactHashes, warnings };
}

/**
 * Propagate staleness DOWN the dependency graph to a fixpoint (spec §12).
 *
 * A stage whose upstream WILL be rebuilt is itself stale, even when its own
 * recorded inputsHash still matches the artifact currently on disk: that
 * artifact is about to be replaced. Predicting the cascade is what lets an
 * operator trust "READY (fresh)".
 *
 * THIS IS THE ONE IMPLEMENTATION. It used to live inline in build.ts, which
 * meant `release:plan` (and the `stageStatus` that `release:resolve` /
 * `release:prepare` PERSIST) reported the raw per-stage freshness while
 * `release:build --dry-run` reported the cascaded one — the two operator
 * surfaces disagreed about the same project, and the un-cascaded answer was
 * the one written to disk. Calling it from `refreshStageStatuses` below makes
 * the cascaded view the ONLY view any reader can obtain, so the surfaces
 * cannot drift apart again by omission. It is a fixpoint over a DAG, so
 * applying it twice is a no-op (build's own call site stayed harmless while
 * it existed).
 */
export function propagateStaleStages(stageStatus: Record<ReleaseStage, StageStatus>): void {
  let propagated = true;
  while (propagated) {
    propagated = false;
    for (const stage of STAGE_ORDER) {
      const status = stageStatus[stage];
      if (status.status !== "fresh") continue;
      const staleDep = STAGE_DEPENDENCIES[stage].find(
        (dep) => stageStatus[dep].status !== "fresh",
      );
      if (staleDep !== undefined) {
        status.status = "stale";
        status.reasons = [...status.reasons, `upstream stage ${staleDep} will be rebuilt`];
        propagated = true;
      }
    }
  }
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
