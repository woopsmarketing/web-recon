/**
 * SITE INSTANCE = EXTENDED RELEASE PROJECT (Task 27).
 *
 * There is deliberately NO parallel SiteInstance schema. `release-project.json`
 * already carries site identity, hash-pinned ArtifactRef references to all 7
 * lineage stages, authored deltas, per-stage fresh|stale|blocked status, the
 * stage DAG with its cascade fixpoint, drift detection, dry-run, crash-safe
 * save and retry/resume. This module adds only the customer-authoring pieces
 * that were missing:
 *
 *   STABLE IDENTITY   a `siteId` that survives prepare/build cycles, so one
 *                     customer site is one identity (Task 25/26 derived the
 *                     projectId from the production-spec RUN id, which gave
 *                     linear.app two projects 22 minutes apart).
 *   VERSION ADAPTION  revision-1 documents (every project on disk today) are
 *                     adapted IN MEMORY on load — the file is never rewritten
 *                     by a read.
 *   AUTHORED FOLDING  values arriving through a resolution pack are folded
 *                     into the authoritative `authored` block, so `authored`
 *                     is the one source and the pack stays an audit record.
 */
import {
  AuthoredStateSchema,
  LEGACY_RELEASE_PROJECT_REVISION,
  RELEASE_PROJECT_REVISION,
  ReleaseProjectSchema,
  emptyAuthoredState,
  type AppliedResolution,
  type AuthoredState,
  type AuthoredTheme,
  type ProductionResolution,
  type ReleaseProject,
} from "./types.js";

/**
 * Default stable site id for a host. Deterministic, filesystem-safe and
 * IDENTICAL on every prepare — an operator who wants several customer sites
 * from one template passes `--site-id` instead.
 */
export function defaultSiteId(host: string): string {
  const slug = host.trim().toLowerCase().replace(/[^a-z0-9._-]+/g, "-").replace(/^-+|-+$/g, "");
  return slug.length > 0 ? slug : "site";
}

/** The project directory name for a site id (release:prepare default). */
export function projectIdForSite(siteId: string): string {
  return siteId;
}

// ---------------------------------------------------------------------------
// Authored state
// ---------------------------------------------------------------------------

/** Slot values carried by ONE resolution pack (`urls` + every route's slots). */
export function resolutionSlotValues(resolution: ProductionResolution): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const content of Object.values(resolution.routeContent ?? {})) {
    for (const [slotKey, value] of Object.entries(content.slotValues ?? {})) out[slotKey] = value;
  }
  for (const [slotKey, value] of Object.entries(resolution.urls ?? {})) out[slotKey] = value;
  return out;
}

/** Merge one authored theme delta onto another (tokens merge, not replace). */
export function mergeAuthoredTheme(base: AuthoredTheme, delta: AuthoredTheme): AuthoredTheme {
  const tokens = { ...(base.tokens ?? {}), ...(delta.tokens ?? {}) };
  return {
    ...base,
    ...delta,
    ...(Object.keys(tokens).length > 0 ? { tokens } : {}),
  };
}

/**
 * Fold a resolution pack's authored values into the authoritative block.
 * Later packs win, and a direct `authored` edit made after the last pack wins
 * over everything — the caller applies packs in application order.
 */
export function foldResolutionIntoAuthored(
  authored: AuthoredState,
  resolution: ProductionResolution,
  at: string,
): AuthoredState {
  const slotValues = { ...authored.slotValues, ...resolutionSlotValues(resolution) };
  const theme =
    resolution.theme === undefined
      ? authored.theme
      : mergeAuthoredTheme(authored.theme, resolution.theme);
  const changed =
    Object.keys(slotValues).length !== Object.keys(authored.slotValues).length ||
    JSON.stringify(slotValues) !== JSON.stringify(authored.slotValues) ||
    JSON.stringify(theme) !== JSON.stringify(authored.theme);
  return AuthoredStateSchema.parse({
    slotValues,
    theme,
    updatedAt: changed ? at : authored.updatedAt,
  });
}

/** Replay every applied pack into an authored block (revision-1 adoption). */
export function authoredFromResolutions(applied: AppliedResolution[]): AuthoredState {
  let authored = emptyAuthoredState();
  for (const pack of applied) {
    authored = foldResolutionIntoAuthored(authored, pack.resolution, pack.appliedAt);
  }
  return authored;
}

// ---------------------------------------------------------------------------
// Version adaptation
// ---------------------------------------------------------------------------

export interface AdaptedReleaseProject {
  project: ReleaseProject;
  /** The on-disk revision when it needed adapting, else null. */
  adaptedFrom: number | null;
}

/**
 * Parse a release project document of ANY shipped revision.
 *
 * revision 1 (implicit — the field does not exist): identity is derived from
 * the host, and the authored block is REPLAYED from the applied resolutions so
 * `authored` is authoritative from the very first load and no value gains a
 * second independent home. Nothing is written: adaptation is a read-time view,
 * and the document is only persisted when the operator's next command saves it.
 */
export function adaptReleaseProject(raw: unknown): AdaptedReleaseProject {
  if (typeof raw !== "object" || raw === null) {
    throw new Error("release project: not a JSON object");
  }
  const document = raw as Record<string, unknown>;
  const revision =
    typeof document.projectRevision === "number"
      ? document.projectRevision
      : LEGACY_RELEASE_PROJECT_REVISION;
  if (revision > RELEASE_PROJECT_REVISION) {
    throw new Error(
      `release project revision ${revision} is newer than this build understands ` +
        `(${RELEASE_PROJECT_REVISION}) — upgrade the pipeline rather than downgrading the project`,
    );
  }
  if (revision === RELEASE_PROJECT_REVISION) {
    return { project: ReleaseProjectSchema.parse(document), adaptedFrom: null };
  }
  const source = document.source as { host?: string } | undefined;
  const resolutions = Array.isArray(document.resolutions)
    ? (document.resolutions as AppliedResolution[])
    : [];
  const upgraded = {
    ...document,
    projectRevision: RELEASE_PROJECT_REVISION,
    siteId: defaultSiteId(source?.host ?? ""),
    authored: authoredFromResolutions(resolutions),
  };
  return { project: ReleaseProjectSchema.parse(upgraded), adaptedFrom: revision };
}
