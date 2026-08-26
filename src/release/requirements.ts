/**
 * Requirement ↔ resolution matching (spec §11) and requirement carry-forward.
 *
 * Requirement ids are DETERMINISTIC (derived from artifact discriminators), so
 * a re-collection after a rebuild preserves identity: a requirement that is no
 * longer detected keeps its resolved status; a matched-but-not-yet-rebuilt
 * requirement shows `resolved` while its stage shows `stale`.
 */
import { createHash } from "node:crypto";

import type {
  AppliedResolution,
  ProductionResolution,
  Requirement,
  RequirementsFile,
} from "./types.js";
import {
  RELEASE_REQUIREMENTS_SCHEMA_NAME,
  RELEASE_SCHEMA_VERSION,
} from "./types.js";

export const CANONICAL_FACT_KEYS = [
  "address",
  "phone",
  "prices",
  "reviews",
  "ratings",
  "foundingDate",
  "sameAs",
] as const;

/** Record-only fact keys: recorded + matched, not (yet) consumed by a stage. */
export const RECORD_ONLY_FACT_KEYS = ["twitterSite"] as const;

export interface ResolutionMatch {
  requirementId: string;
  field: string;
}

/** Which requirement (by id) a resolution field resolves. */
export function matchResolutionToRequirements(
  requirements: Requirement[],
  resolution: ProductionResolution,
): { matches: ResolutionMatch[]; acknowledgements: ResolutionMatch[]; unmatchedFields: string[] } {
  const byId = new Map(requirements.map((requirement) => [requirement.requirementId, requirement]));
  const bySlotKey = new Map<string, Requirement>();
  for (const requirement of requirements) {
    if (requirement.slotKey) bySlotKey.set(requirement.slotKey, requirement);
  }
  const matches: ResolutionMatch[] = [];
  const acknowledgements: ResolutionMatch[] = [];
  const unmatched: string[] = [];
  const take = (requirementId: string | undefined, field: string): void => {
    if (requirementId !== undefined && byId.has(requirementId)) {
      matches.push({ requirementId, field });
    } else {
      unmatched.push(field);
    }
  };

  if (resolution.productionBaseUrl !== undefined) {
    take(byId.has("production-domain") ? "production-domain" : undefined, "productionBaseUrl");
  }
  for (const key of Object.keys(resolution.facts ?? {})) {
    if ((RECORD_ONLY_FACT_KEYS as readonly string[]).includes(key)) {
      take(byId.has("social-handle") ? "social-handle" : undefined, `facts.${key}`);
    } else {
      take(byId.has(`business-fact-${key}`) ? `business-fact-${key}` : undefined, `facts.${key}`);
    }
  }
  for (const slotKey of Object.keys(resolution.urls ?? {})) {
    const requirement = bySlotKey.get(slotKey);
    take(requirement?.requirementId, `urls.${slotKey}`);
  }
  for (const assetId of Object.keys(resolution.assets ?? {})) {
    const requirementId =
      assetId === "og-image"
        ? "og-image"
        : assetId === "organization-logo"
          ? "organization-logo"
          : `replacement-image-${assetId}`;
    take(byId.has(requirementId) ? requirementId : undefined, `assets.${assetId}`);
  }
  for (const family of Object.keys(resolution.fontDecisions ?? {})) {
    take(
      byId.has(`font-license-${family.replace(/[^a-zA-Z0-9._/-]+/g, "-")}`)
        ? `font-license-${family.replace(/[^a-zA-Z0-9._/-]+/g, "-")}`
        : undefined,
      `fontDecisions.${family}`,
    );
  }
  for (const [route, content] of Object.entries(resolution.routeContent ?? {})) {
    if (route !== "global") {
      const requirementId = `content-route-${route.replace(/[^a-zA-Z0-9._/-]+/g, "-")}`;
      take(byId.has(requirementId) ? requirementId : undefined, `routeContent.${route}`);
    }
    for (const slotKey of Object.keys(content.slotValues ?? {})) {
      const requirement = bySlotKey.get(slotKey);
      if (requirement) {
        matches.push({ requirementId: requirement.requirementId, field: `routeContent.${route}.slotValues.${slotKey}` });
      }
    }
  }
  for (const acknowledgement of resolution.acknowledgements ?? []) {
    if (byId.has(acknowledgement.requirementId)) {
      acknowledgements.push({
        requirementId: acknowledgement.requirementId,
        field: "acknowledgements",
      });
    } else {
      unmatched.push(`acknowledgements.${acknowledgement.requirementId}`);
    }
  }
  return { matches, acknowledgements, unmatchedFields: unmatched };
}

/** Which stage CONSUMES a resolution field (record-only fields return null). */
export function consumingStageOfField(field: string): "content" | "seo" | "assets" | null {
  if (field === "productionBaseUrl") return "seo";
  if (field.startsWith("facts.")) {
    const key = field.slice("facts.".length);
    return (CANONICAL_FACT_KEYS as readonly string[]).includes(key) ? "seo" : null;
  }
  if (field.startsWith("urls.")) return "content";
  if (field.startsWith("routeContent.")) return "content";
  if (field === "assets.og-image" || field === "assets.organization-logo") return null;
  if (field.startsWith("assets.")) return "assets";
  if (field.startsWith("fontDecisions.")) return "assets";
  return null;
}

/**
 * Merge freshly-collected gap requirements with previous state + every applied
 * resolution. Collected requirements arrive `unresolved` (or `resolved` when
 * the artifact itself records the fix, e.g. a recorded font decision).
 *
 * `freshConsumingStages`: stages that have ALREADY been rebuilt against the
 * cumulative resolution. When the consuming stage is fresh and the gap is
 * STILL collected from its artifacts, the resolution demonstrably did not fix
 * it — the requirement stays unresolved (artifact truth beats bookkeeping).
 */
export function mergeRequirements(
  previous: Requirement[] | null,
  collected: Requirement[],
  applied: AppliedResolution[],
  freshConsumingStages: ReadonlySet<string> = new Set(),
): Requirement[] {
  const merged = new Map<string, Requirement>();
  for (const requirement of collected) merged.set(requirement.requirementId, { ...requirement });

  // Carry forward requirements that are no longer detected in the artifacts.
  for (const prev of previous ?? []) {
    if (merged.has(prev.requirementId)) continue;
    if (prev.status === "resolved" || prev.status === "accepted-limitation") {
      merged.set(prev.requirementId, {
        ...prev,
        statusNote: prev.statusNote ?? "no longer detected in current artifacts",
      });
    } else {
      merged.set(prev.requirementId, {
        ...prev,
        status: "not-applicable",
        statusNote: "no longer detected in current artifacts",
      });
    }
  }

  // Apply every resolution in order (idempotent; later packs may re-match).
  for (const pack of applied) {
    const { matches, acknowledgements } = matchResolutionToRequirements(
      [...merged.values()],
      pack.resolution,
    );
    for (const match of matches) {
      const requirement = merged.get(match.requirementId);
      if (!requirement) continue;
      if (requirement.status !== "unresolved") continue;
      const consumer = consumingStageOfField(match.field);
      if (consumer !== null && freshConsumingStages.has(consumer)) {
        requirement.statusNote =
          `resolution ${pack.resolutionId} (${match.field}) was applied and the ${consumer} stage ` +
          "was rebuilt, but the gap persists in the rebuilt artifacts";
        continue;
      }
      requirement.status = "resolved";
      requirement.resolvedBy = { resolutionId: pack.resolutionId, field: match.field };
    }
    for (const acknowledgement of acknowledgements) {
      const requirement = merged.get(acknowledgement.requirementId);
      if (!requirement) continue;
      if (requirement.status === "unresolved") {
        requirement.status = "accepted-limitation";
        requirement.resolvedBy = { resolutionId: pack.resolutionId, field: "acknowledgements" };
      }
    }
  }

  const severityOrder = { "release-blocking": 0, "high-value": 1, optional: 2 } as const;
  return [...merged.values()].sort((a, b) => {
    const bySeverity = severityOrder[a.severity] - severityOrder[b.severity];
    if (bySeverity !== 0) return bySeverity;
    if (a.kind !== b.kind) return a.kind < b.kind ? -1 : 1;
    return a.requirementId < b.requirementId ? -1 : 1;
  });
}

/** Unresolved release-blocking requirements. `accepted-limitation` still
 *  blocks indexable production (spec §7: blockers must be RESOLVED). */
export function releaseBlockers(requirements: Requirement[]): Requirement[] {
  return requirements.filter(
    (requirement) =>
      requirement.severity === "release-blocking" &&
      requirement.status !== "resolved" &&
      requirement.status !== "not-applicable",
  );
}

export function buildRequirementsFile(
  projectId: string,
  requirements: Requirement[],
): RequirementsFile {
  const count = (predicate: (requirement: Requirement) => boolean): number =>
    requirements.filter(predicate).length;
  return {
    schemaVersion: RELEASE_SCHEMA_VERSION,
    schemaName: RELEASE_REQUIREMENTS_SCHEMA_NAME,
    projectId,
    generatedAt: new Date().toISOString(),
    counts: {
      total: requirements.length,
      unresolved: count((r) => r.status === "unresolved"),
      resolved: count((r) => r.status === "resolved"),
      acceptedLimitation: count((r) => r.status === "accepted-limitation"),
      notApplicable: count((r) => r.status === "not-applicable"),
      releaseBlockingUnresolved: count(
        (r) => r.severity === "release-blocking" && r.status !== "resolved" && r.status !== "not-applicable",
      ),
      highValueUnresolved: count((r) => r.severity === "high-value" && r.status === "unresolved"),
      optionalUnresolved: count((r) => r.severity === "optional" && r.status === "unresolved"),
    },
    requirements,
  };
}

export function sha256OfJson(value: unknown): string {
  return createHash("sha256").update(JSON.stringify(value), "utf8").digest("hex");
}

/** Deep-merge applied resolution packs, in application order. */
export function effectiveResolution(applied: AppliedResolution[]): ProductionResolution {
  const merged: ProductionResolution = {
    schemaVersion: RELEASE_SCHEMA_VERSION,
    schemaName: "production-resolution-v1",
  };
  for (const pack of applied) {
    const resolution = pack.resolution;
    if (resolution.notes !== undefined) merged.notes = resolution.notes;
    if (resolution.productionBaseUrl !== undefined) merged.productionBaseUrl = resolution.productionBaseUrl;
    merged.facts = { ...(merged.facts ?? {}), ...(resolution.facts ?? {}) };
    merged.urls = { ...(merged.urls ?? {}), ...(resolution.urls ?? {}) };
    merged.assets = { ...(merged.assets ?? {}), ...(resolution.assets ?? {}) };
    merged.fontDecisions = { ...(merged.fontDecisions ?? {}), ...(resolution.fontDecisions ?? {}) };
    if (resolution.routeContent !== undefined) {
      merged.routeContent = { ...(merged.routeContent ?? {}) };
      for (const [route, content] of Object.entries(resolution.routeContent)) {
        const existing = merged.routeContent[route];
        merged.routeContent[route] = {
          slotValues: { ...(existing?.slotValues ?? {}), ...(content.slotValues ?? {}) },
          ...(content.pagePlan !== undefined || existing?.pagePlan !== undefined
            ? { pagePlan: { ...(existing?.pagePlan ?? {}), ...(content.pagePlan ?? {}) } }
            : {}),
        };
      }
    }
    if (resolution.acknowledgements !== undefined) {
      merged.acknowledgements = [
        ...(merged.acknowledgements ?? []),
        ...resolution.acknowledgements,
      ];
    }
  }
  // Drop empty records so field-presence checks stay meaningful.
  if (Object.keys(merged.facts ?? {}).length === 0) delete merged.facts;
  if (Object.keys(merged.urls ?? {}).length === 0) delete merged.urls;
  if (Object.keys(merged.assets ?? {}).length === 0) delete merged.assets;
  if (Object.keys(merged.fontDecisions ?? {}).length === 0) delete merged.fontDecisions;
  if (Object.keys(merged.routeContent ?? {}).length === 0) delete merged.routeContent;
  return merged;
}

/** Normalize the operator's domain input to a bare host for the SEO plan. */
export function normalizeProductionDomain(input: string): string {
  const trimmed = input.trim().replace(/\/+$/, "");
  if (/^https?:\/\//i.test(trimmed)) return new URL(trimmed).host;
  return trimmed;
}
