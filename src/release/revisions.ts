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

export function diffAuthoredState(before: AuthoredState | null, after: AuthoredState): AuthoredChange {
  const beforeSlots = before?.slotValues ?? {};
  const afterSlots = after.slotValues;
  const slotKeysAdded: string[] = [];
  const slotKeysChanged: string[] = [];
  const slotKeysRemoved: string[] = [];
  for (const [key, value] of Object.entries(afterSlots)) {
    if (!(key in beforeSlots)) slotKeysAdded.push(key);
    else if (canonicalJson(beforeSlots[key]) !== canonicalJson(value)) slotKeysChanged.push(key);
  }
  for (const key of Object.keys(beforeSlots)) {
    if (!(key in afterSlots)) slotKeysRemoved.push(key);
  }
  return {
    slotKeysAdded: slotKeysAdded.sort(),
    slotKeysChanged: slotKeysChanged.sort(),
    slotKeysRemoved: slotKeysRemoved.sort(),
    themeChanged: canonicalJson(before?.theme ?? {}) !== canonicalJson(after.theme),
  };
}

export function authoredChangeIsEmpty(change: AuthoredChange): boolean {
  return (
    change.slotKeysAdded.length === 0 &&
    change.slotKeysChanged.length === 0 &&
    change.slotKeysRemoved.length === 0 &&
    !change.themeChanged
  );
}

export function summarizeAuthoredChange(change: AuthoredChange, origin: RevisionOrigin): string {
  const parts: string[] = [];
  if (change.slotKeysAdded.length > 0) parts.push(`+${change.slotKeysAdded.length} slot`);
  if (change.slotKeysChanged.length > 0) parts.push(`~${change.slotKeysChanged.length} slot`);
  if (change.slotKeysRemoved.length > 0) parts.push(`-${change.slotKeysRemoved.length} slot`);
  if (change.themeChanged) parts.push("theme");
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
  const chain = await loadRevisionChain(projectDir);
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
  const head = await headRevision(projectDir);
  if (head && hashAuthoredState(options.authored) === head.authoredStateHash) return null;
  return appendAuthoredRevision(projectDir, options);
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
