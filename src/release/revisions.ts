/**
 * Authored-state revision chain (Task 27, stretch A).
 *
 * A MINIMAL, IMMUTABLE, LINEAR history over the release project's authoritative
 * `authored` block (types.ts `AuthoredStateSchema`) — the future Visual Editor's
 * undo/history foundation. Deliberately NOT a version-control system:
 *
 *   NO BRANCHING   one chain per project; every record's parent is the record
 *                  that was head when it was appended.
 *   NO MERGES      there is nothing to reconcile, so there is no merge.
 *   APPEND ONLY    a record is written with the `wx` flag and never rewritten.
 *                  RESTORING an earlier revision APPENDS a new record carrying
 *                  that older snapshot; history is never truncated or edited.
 *
 * Storage follows the reconstruction-qa precedent (store.ts ~34: a numbered
 * append-only chain `iterations/q000..q00N` where the corrected clone is
 * generated INSIDE q00N and never on top of the baseline):
 *
 *   data/<host>/release-projects/<projectId>/
 *     revisions/r000/revision.json   authored-revision-v1
 *     revisions/r001/revision.json   ...
 *
 * The record embeds the FULL authored snapshot it is a revision of, and
 * `authoredStateHash` is the sha256 of exactly that embedded snapshot — this is
 * plain snapshot storage, NOT content-addressed storage: nothing is deduplicated
 * and the hash addresses nothing. It exists so a caller can compare two
 * revisions (and so `loadRevisionChain` can prove a record has not been edited
 * behind its own hash).
 */
import { createHash } from "node:crypto";
import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";

import { z } from "zod";

import { REVISIONS_DIR, REVISION_FILE, loadReleaseProject, saveReleaseProject } from "./store.js";
import { AuthoredStateSchema, RELEASE_SCHEMA_VERSION, type AuthoredState } from "./types.js";

export const AUTHORED_REVISION_SCHEMA_NAME = "authored-revision-v1";

/** How the snapshot came to be. `restore` is the immutable undo (see below). */
export const REVISION_ORIGINS = ["prepare", "resolve", "edit", "restore"] as const;
export const RevisionOriginSchema = z.enum(REVISION_ORIGINS);
export type RevisionOrigin = z.infer<typeof RevisionOriginSchema>;

/** What moved between the parent snapshot and this one. Keys, never values —
 *  the values are already in the snapshot. */
export const AuthoredChangeSchema = z
  .object({
    slotKeysAdded: z.array(z.string()),
    slotKeysChanged: z.array(z.string()),
    slotKeysRemoved: z.array(z.string()),
    themeChanged: z.boolean(),
    /**
     * Task 28 Phase 2 — the two authored dimensions added after this chain
     * shipped. OPTIONAL, and for one reason only: `AuthoredChangeSchema` is
     * `.strict()` and `loadRevisionChain` PARSES every record it reads, so a
     * required field would make every revision already on disk unloadable —
     * which `loadRevisionChain` reports as a corrupt history, not as an old
     * one. `diffAuthoredState` always emits them, so absent means "written
     * before this field existed", never "nothing moved".
     */
    assetIdsAdded: z.array(z.string()).optional(),
    assetIdsChanged: z.array(z.string()).optional(),
    assetIdsRemoved: z.array(z.string()).optional(),
    brandSurfacesAdded: z.array(z.string()).optional(),
    brandSurfacesChanged: z.array(z.string()).optional(),
    brandSurfacesRemoved: z.array(z.string()).optional(),
    /**
     * Task 28 Phases 5 + 6 — ENABLEMENT. Optional for the identical reason the
     * Phase-2 fields above are: this schema is `.strict()` and every revision
     * already on disk was written without them.
     */
    routesDisabled: z.array(z.string()).optional(),
    routesReEnabled: z.array(z.string()).optional(),
    regionsDisabled: z.array(z.string()).optional(),
    regionsChanged: z.array(z.string()).optional(),
    regionsReEnabled: z.array(z.string()).optional(),
  })
  .strict();
export type AuthoredChange = z.infer<typeof AuthoredChangeSchema>;

export const AuthoredRevisionSchema = z
  .object({
    schemaVersion: z.literal(RELEASE_SCHEMA_VERSION),
    schemaName: z.literal(AUTHORED_REVISION_SCHEMA_NAME),
    /** `r000`, `r001`, … — position in the chain, and the directory name. */
    revisionId: z.string().regex(/^r\d{3,}$/),
    /** Stable site identity (instance.ts `defaultSiteId`), not the projectId. */
    siteId: z.string().min(1),
    /** null on the first record only. */
    parentRevisionId: z.string().nullable(),
    createdAt: z.string(),
    /** sha256 over the canonical JSON of `authored` BELOW, nothing else. */
    authoredStateHash: z.string().regex(/^[0-9a-f]{64}$/),
    origin: RevisionOriginSchema,
    /** One-line human summary; `change` is the machine-readable form. */
    summary: z.string(),
    change: AuthoredChangeSchema,
    /** The revision this one re-applied, when `origin` is "restore". */
    restoredFrom: z.string().nullable(),
    /** The captured snapshot itself — a revision stores state, not a diff. */
    authored: AuthoredStateSchema,
  })
  .strict();
export type AuthoredRevision = z.infer<typeof AuthoredRevisionSchema>;

// ---------------------------------------------------------------------------
// Hashing
// ---------------------------------------------------------------------------

/**
 * Key-sorted JSON. The sibling hashes in this layer (freshness.ts:161,
 * requirements.ts:260) stringify raw because their inputs are built in one
 * place; an authored snapshot is not — the same state reached by an in-memory
 * edit and by a reload from disk must hash identically, and only key order
 * separates them.
 */
function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value) ?? "null";
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, v]) => v !== undefined)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${canonicalJson(v)}`).join(",")}}`;
}

/** sha256 of the authored state AS CAPTURED — `updatedAt` included. Content
 *  edits move `updatedAt` in lock step (instance.ts `foldResolutionIntoAuthored`
 *  only touches it when something changed), so a no-op fold does not move it. */
export function hashAuthoredState(authored: AuthoredState): string {
  return createHash("sha256").update(canonicalJson(authored), "utf8").digest("hex");
}

// ---------------------------------------------------------------------------
// Change summary
// ---------------------------------------------------------------------------

/** Added / changed / removed keys between two maps, by canonical value. */
function diffKeyedMap(
  before: Record<string, unknown>,
  after: Record<string, unknown>,
): { added: string[]; changed: string[]; removed: string[] } {
  const added: string[] = [];
  const changed: string[] = [];
  const removed: string[] = [];
  for (const [key, value] of Object.entries(after)) {
    if (!(key in before)) added.push(key);
    else if (canonicalJson(before[key]) !== canonicalJson(value)) changed.push(key);
  }
  for (const key of Object.keys(before)) {
    if (!(key in after)) removed.push(key);
  }
  return { added: added.sort(), changed: changed.sort(), removed: removed.sort() };
}

export function diffAuthoredState(before: AuthoredState | null, after: AuthoredState): AuthoredChange {
  const slots = diffKeyedMap(before?.slotValues ?? {}, after.slotValues);
  const assets = diffKeyedMap(before?.assets ?? {}, after.assets ?? {});
  const brand = diffKeyedMap(before?.brand ?? {}, after.brand ?? {});
  const routes = diffKeyedMap(before?.disabledRoutes ?? {}, after.disabledRoutes ?? {});
  const regions = diffKeyedMap(before?.disabledRegions ?? {}, after.disabledRegions ?? {});
  return {
    slotKeysAdded: slots.added,
    slotKeysChanged: slots.changed,
    slotKeysRemoved: slots.removed,
    themeChanged: canonicalJson(before?.theme ?? {}) !== canonicalJson(after.theme),
    assetIdsAdded: assets.added,
    assetIdsChanged: assets.changed,
    assetIdsRemoved: assets.removed,
    brandSurfacesAdded: brand.added,
    brandSurfacesChanged: brand.changed,
    brandSurfacesRemoved: brand.removed,
    // A route/region APPEARING in the map is a disable; DISAPPEARING is a
    // re-enable. The names say what happened to the SITE, not what happened to
    // the map, because that is the sentence an operator reads in the history.
    routesDisabled: routes.added,
    routesReEnabled: routes.removed,
    regionsDisabled: regions.added,
    regionsChanged: regions.changed,
    regionsReEnabled: regions.removed,
  };
}

export function authoredChangeIsEmpty(change: AuthoredChange): boolean {
  const empty = (list: string[] | undefined): boolean => (list?.length ?? 0) === 0;
  return (
    empty(change.slotKeysAdded) &&
    empty(change.slotKeysChanged) &&
    empty(change.slotKeysRemoved) &&
    !change.themeChanged &&
    empty(change.assetIdsAdded) &&
    empty(change.assetIdsChanged) &&
    empty(change.assetIdsRemoved) &&
    empty(change.brandSurfacesAdded) &&
    empty(change.brandSurfacesChanged) &&
    empty(change.brandSurfacesRemoved) &&
    empty(change.routesDisabled) &&
    empty(change.routesReEnabled) &&
    empty(change.regionsDisabled) &&
    empty(change.regionsChanged) &&
    empty(change.regionsReEnabled)
  );
}

export function summarizeAuthoredChange(change: AuthoredChange, origin: RevisionOrigin): string {
  const parts: string[] = [];
  const count = (list: string[] | undefined): number => list?.length ?? 0;
  if (count(change.slotKeysAdded) > 0) parts.push(`+${count(change.slotKeysAdded)} slot`);
  if (count(change.slotKeysChanged) > 0) parts.push(`~${count(change.slotKeysChanged)} slot`);
  if (count(change.slotKeysRemoved) > 0) parts.push(`-${count(change.slotKeysRemoved)} slot`);
  if (change.themeChanged) parts.push("theme");
  if (count(change.assetIdsAdded) > 0) parts.push(`+${count(change.assetIdsAdded)} asset`);
  if (count(change.assetIdsChanged) > 0) parts.push(`~${count(change.assetIdsChanged)} asset`);
  if (count(change.assetIdsRemoved) > 0) parts.push(`-${count(change.assetIdsRemoved)} asset`);
  if (count(change.brandSurfacesAdded) > 0) parts.push(`+${count(change.brandSurfacesAdded)} brand`);
  if (count(change.brandSurfacesChanged) > 0) parts.push(`~${count(change.brandSurfacesChanged)} brand`);
  if (count(change.brandSurfacesRemoved) > 0) parts.push(`-${count(change.brandSurfacesRemoved)} brand`);
  if (count(change.routesDisabled) > 0) parts.push(`-${count(change.routesDisabled)} route off`);
  if (count(change.routesReEnabled) > 0) parts.push(`+${count(change.routesReEnabled)} route on`);
  if (count(change.regionsDisabled) > 0) parts.push(`-${count(change.regionsDisabled)} region off`);
  if (count(change.regionsChanged) > 0) parts.push(`~${count(change.regionsChanged)} region scope`);
  if (count(change.regionsReEnabled) > 0) parts.push(`+${count(change.regionsReEnabled)} region on`);
  return `${origin}: ${parts.length > 0 ? parts.join(", ") : "no authored change"}`;
}

// ---------------------------------------------------------------------------
// Chain storage
// ---------------------------------------------------------------------------

export function revisionsDir(projectDir: string): string {
  return path.join(projectDir, REVISIONS_DIR);
}

export function revisionDir(projectDir: string, revisionId: string): string {
  return path.join(revisionsDir(projectDir), revisionId);
}

/** `r000`, `r001`, … Three digits, widening past r999 rather than wrapping. */
export function revisionIdForIndex(index: number): string {
  return `r${String(index).padStart(3, "0")}`;
}

/**
 * The position encoded in a revision id — the inverse of `revisionIdForIndex`.
 *
 * Chain order MUST come from this and never from the directory name's own
 * collation. Ids widen past r999 instead of wrapping, so a lexicographic sort
 * reads `r100, r1000, r101` and the first chain to cross the boundary looks
 * corrupt at position 101 — permanently unloadable, from a plain `.sort()`.
 */
export function revisionIndexForId(revisionId: string): number {
  return Number.parseInt(revisionId.slice(1), 10);
}

/**
 * The whole chain, oldest first. A project with no `revisions/` directory —
 * every project written before this module — returns an EMPTY chain rather
 * than an error: the chain is additive and its absence is the legacy state.
 *
 * Verified on the way in: sequential ids, parent linkage, and each record's
 * hash against its own embedded snapshot. A record that fails is a corrupt
 * history, and a silently-accepted corrupt history is worse than a throw.
 */
export async function loadRevisionChain(projectDir: string): Promise<AuthoredRevision[]> {
  const dir = revisionsDir(projectDir);
  let names: string[];
  try {
    names = (await readdir(dir, { withFileTypes: true }))
      .filter((entry) => entry.isDirectory() && /^r\d{3,}$/.test(entry.name))
      .map((entry) => entry.name)
      // Numeric, not lexical — see `revisionIndexForId`. The name tie-break only
      // matters for a hand-written id no `revisionIdForIndex` can emit (`r0001`
      // beside `r001`); it keeps the id check below throwing deterministically.
      .sort(
        (a, b) =>
          revisionIndexForId(a) - revisionIndexForId(b) || (a < b ? -1 : a > b ? 1 : 0),
      );
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw err;
  }
  const chain: AuthoredRevision[] = [];
  for (const [index, name] of names.entries()) {
    const file = path.join(dir, name, REVISION_FILE);
    const revision = AuthoredRevisionSchema.parse(JSON.parse(await readFile(file, "utf8")));
    const expectedId = revisionIdForIndex(index);
    if (revision.revisionId !== name || revision.revisionId !== expectedId) {
      throw new Error(
        `authored revision chain: ${file} declares "${revision.revisionId}" but sits at "${name}" ` +
          `(position ${index} is "${expectedId}") — the chain is linear and append-only`,
      );
    }
    const expectedParent = index === 0 ? null : revisionIdForIndex(index - 1);
    if (revision.parentRevisionId !== expectedParent) {
      throw new Error(
        `authored revision chain: ${name} has parent ${JSON.stringify(revision.parentRevisionId)}, ` +
          `expected ${JSON.stringify(expectedParent)}`,
      );
    }
    const actualHash = hashAuthoredState(revision.authored);
    if (actualHash !== revision.authoredStateHash) {
      throw new Error(
        `authored revision chain: ${name} carries hash ${revision.authoredStateHash} but its ` +
          `embedded snapshot hashes to ${actualHash} — the record was edited after it was written`,
      );
    }
    chain.push(revision);
  }
  return chain;
}

/** The newest record, or null for a project that has never been revised. */
export async function headRevision(projectDir: string): Promise<AuthoredRevision | null> {
  const chain = await loadRevisionChain(projectDir);
  return chain.length > 0 ? chain[chain.length - 1] : null;
}

export interface AppendRevisionOptions {
  siteId: string;
  authored: AuthoredState;
  origin?: RevisionOrigin;
  /** Overrides the derived one-line summary. */
  summary?: string;
  /** Set by `restoreAuthoredRevision`; a plain append never sets it. */
  restoredFrom?: string | null;
  now?: Date;
}

/**
 * Append one snapshot to the chain. The parent is whatever is head RIGHT NOW,
 * so two appends can never claim the same parent: the record file is written
 * with `wx`, and a second writer racing for the same position fails loudly
 * instead of overwriting history.
 */
export async function appendAuthoredRevision(
  projectDir: string,
  options: AppendRevisionOptions,
): Promise<AuthoredRevision> {
  return appendToChain(projectDir, await loadRevisionChain(projectDir), options);
}

/**
 * The append itself, over a chain the CALLER already loaded.
 *
 * Task 28 change request 2 wires `appendAuthoredRevisionIfChanged` into
 * `release:prepare` / `release:resolve`. Loading the chain verifies every
 * record (see `loadRevisionChain`), which is O(chain) with a full authored
 * snapshot per record — so the "did anything change?" read and the append MUST
 * NOT each pay for their own pass. Splitting the append out of the load is the
 * whole optimisation: one verified read per transaction, never two.
 */
async function appendToChain(
  projectDir: string,
  chain: AuthoredRevision[],
  options: AppendRevisionOptions,
): Promise<AuthoredRevision> {
  const parent = chain.length > 0 ? chain[chain.length - 1] : null;
  const authored = AuthoredStateSchema.parse(options.authored);
  const origin = options.origin ?? "edit";
  const change = diffAuthoredState(parent?.authored ?? null, authored);
  const revisionId = revisionIdForIndex(chain.length);
  const revision = AuthoredRevisionSchema.parse({
    schemaVersion: RELEASE_SCHEMA_VERSION,
    schemaName: AUTHORED_REVISION_SCHEMA_NAME,
    revisionId,
    siteId: options.siteId,
    parentRevisionId: parent?.revisionId ?? null,
    createdAt: (options.now ?? new Date()).toISOString(),
    authoredStateHash: hashAuthoredState(authored),
    origin,
    summary: options.summary ?? summarizeAuthoredChange(change, origin),
    change,
    restoredFrom: options.restoredFrom ?? null,
    authored,
  });
  const file = path.join(revisionDir(projectDir, revisionId), REVISION_FILE);
  await mkdir(path.dirname(file), { recursive: true });
  // `wx` — an existing record is NEVER overwritten (append-only, item: immutable).
  await writeFile(file, JSON.stringify(revision, null, 2) + "\n", { encoding: "utf8", flag: "wx" });
  return revision;
}

/** Append only when something actually moved; otherwise null and no write. */
export async function appendAuthoredRevisionIfChanged(
  projectDir: string,
  options: AppendRevisionOptions,
): Promise<AuthoredRevision | null> {
  // ONE verified chain read for both the comparison and the append (see
  // `appendToChain`): this runs on the operator path now, not only in tests.
  const chain = await loadRevisionChain(projectDir);
  const head = chain.length > 0 ? chain[chain.length - 1] : null;
  if (head && hashAuthoredState(options.authored) === head.authoredStateHash) return null;
  return appendToChain(projectDir, chain, options);
}

export async function getRevision(
  projectDir: string,
  revisionId: string,
): Promise<AuthoredRevision | null> {
  const chain = await loadRevisionChain(projectDir);
  return chain.find((revision) => revision.revisionId === revisionId) ?? null;
}

// ---------------------------------------------------------------------------
// Project-level write path (the seam the Visual Editor will call)
// ---------------------------------------------------------------------------

/**
 * Persist an authored state onto the project AND record it. One call so the
 * document and the chain cannot drift: the record is written first, because a
 * record with no matching project state is recoverable (restore it) while a
 * project state with no record is silently lost history.
 */
export async function commitAuthoredState(
  projectDir: string,
  authored: AuthoredState,
  options: { origin?: RevisionOrigin; summary?: string; now?: Date } = {},
): Promise<{ revision: AuthoredRevision; authored: AuthoredState }> {
  const { project } = await loadReleaseProject(projectDir);
  const revision = await appendAuthoredRevision(projectDir, {
    siteId: project.siteId,
    authored,
    origin: options.origin ?? "edit",
    summary: options.summary,
    now: options.now,
  });
  project.authored = revision.authored;
  project.updatedAt = revision.createdAt;
  await saveReleaseProject(projectDir, project);
  return { revision, authored: revision.authored };
}

/**
 * Undo, immutably: re-apply an earlier snapshot by APPENDING it as a new head.
 * The earlier record stays exactly where it is, so restoring r001 from r004
 * produces r005 — the chain only ever grows, and a restore is itself
 * restorable.
 */
export async function restoreAuthoredRevision(
  projectDir: string,
  revisionId: string,
  options: { summary?: string; now?: Date } = {},
): Promise<{ revision: AuthoredRevision; authored: AuthoredState }> {
  const chain = await loadRevisionChain(projectDir);
  const target = chain.find((revision) => revision.revisionId === revisionId);
  if (!target) {
    throw new Error(
      `authored revision ${revisionId} is not in this project's chain ` +
        `(${chain.length === 0 ? "no revisions" : `${chain[0].revisionId}..${chain[chain.length - 1].revisionId}`})`,
    );
  }
  const { project } = await loadReleaseProject(projectDir);
  const revision = await appendAuthoredRevision(projectDir, {
    siteId: project.siteId,
    // The target's own snapshot, verbatim — restore reproduces state exactly.
    authored: target.authored,
    origin: "restore",
    summary: options.summary ?? `restore: authored state of ${target.revisionId}`,
    restoredFrom: target.revisionId,
    now: options.now,
  });
  project.authored = revision.authored;
  project.updatedAt = revision.createdAt;
  await saveReleaseProject(projectDir, project);
  return { revision, authored: revision.authored };
}
