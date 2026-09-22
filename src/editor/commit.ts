/**
 * The editor's WRITE path — every byte of it goes through `src/release`.
 *
 * SAVE IS THE TRANSACTION BOUNDARY. A keystroke updates the PREVIEW only (one
 * overlay write, no project write, no revision). An explicit Save calls
 * `commitAuthoredEdits`, which appends exactly one revision — and appends none
 * at all when nothing actually moved, because every function in
 * `src/release/authored.ts` reports `changed` before anything is written.
 *
 * UNDO APPENDS, AND WALKS. `restoreAuthoredRevision` re-applies an earlier
 * snapshot as a NEW head; the earlier record is never mutated and never
 * removed, so a restore is itself restorable. `undoLastRevision` resolves the
 * operator's position THROUGH those restore records, so N presses step back N
 * authored states instead of toggling between two. There is no Redo — see
 * `EDITOR_REDO_POLICY`.
 */
import {
  commitAuthoredEdits,
  type AuthoredEdit,
  type CommitAuthoredEditsResult,
} from "../release/authored.js";
import {
  commitAuthoredState,
  hashAuthoredState,
  loadRevisionChain,
  restoreAuthoredRevision,
  type AuthoredRevision,
} from "../release/revisions.js";
import { loadReleaseProject } from "../release/store.js";
import { AuthoredStateSchema, type AuthoredState } from "../release/types.js";

export interface RevisionRow {
  revisionId: string;
  createdAt: string;
  origin: string;
  summary: string;
  hash: string;
  restoredFrom: string | null;
  slotValueCount: number;
}

export async function revisionRows(projectDir: string): Promise<RevisionRow[]> {
  const chain = await loadRevisionChain(projectDir);
  return chain.map((revision: AuthoredRevision) => ({
    revisionId: revision.revisionId,
    createdAt: revision.createdAt,
    origin: revision.origin,
    summary: revision.summary,
    hash: revision.authoredStateHash,
    restoredFrom: revision.restoredFrom ?? null,
    slotValueCount: Object.keys(revision.authored.slotValues).length,
  }));
}

export async function commitEdits(
  projectDir: string,
  edits: readonly AuthoredEdit[],
  summary: string,
): Promise<CommitAuthoredEditsResult> {
  return commitAuthoredEdits(projectDir, edits, { origin: "edit", summary });
}

export interface ThemeCommitResult {
  changed: boolean;
  revision: AuthoredRevision | null;
  authored: AuthoredState;
}

/**
 * Commit an `authored.theme` change.
 *
 * `AuthoredEdit` has no `set-theme` op today (it covers slot values, assets and
 * brand decisions), and `src/release` is another builder's file this task, so
 * the editor composes the new state itself and hands it to the SAME
 * `commitAuthoredState` the rest of the release surface uses. The no-op guard
 * is re-derived from `hashAuthoredState`, which is the identical
 * canonicalisation `appendAuthoredRevisionIfChanged` compares on — so a
 * re-affirmed token writes nothing and appends no revision, exactly like a
 * re-affirmed slot value.
 *
 * INTEGRATION NOTE: if `AuthoredEdit` later gains
 * `{ op: "set-theme-token" | "clear-theme-token" }`, this function collapses
 * into `commitEdits` with no change to any caller.
 */
export async function commitThemeTokens(
  projectDir: string,
  tokens: Record<string, string>,
  options: { themeSourceFile?: string; note?: string; summary?: string } = {},
): Promise<ThemeCommitResult> {
  const { project, projectDir: dir } = await loadReleaseProject(projectDir);
  const before = project.authored;
  const merged: Record<string, string> = { ...(before.theme.tokens ?? {}) };
  for (const [id, value] of Object.entries(tokens)) {
    if (value === "") delete merged[id];
    else merged[id] = value;
  }
  const theme = {
    ...(options.themeSourceFile !== undefined
      ? { themeSourceFile: options.themeSourceFile }
      : before.theme.themeSourceFile !== undefined
        ? { themeSourceFile: before.theme.themeSourceFile }
        : {}),
    ...(Object.keys(merged).length > 0 ? { tokens: merged } : {}),
    ...(options.note !== undefined
      ? { note: options.note }
      : before.theme.note !== undefined
        ? { note: before.theme.note }
        : {}),
  };
  const next = AuthoredStateSchema.parse({
    ...before,
    theme,
    updatedAt: new Date().toISOString(),
  });
  if (hashAuthoredState(before) === hashAuthoredState(next)) {
    return { changed: false, revision: null, authored: before };
  }
  const commit = await commitAuthoredState(dir, next, {
    origin: "edit",
    summary: options.summary ?? `theme tokens: ${Object.keys(tokens).sort().join(", ")}`,
  });
  return { changed: true, revision: commit.revision, authored: commit.authored };
}

export interface UndoResult {
  undone: boolean;
  reason: string;
  revision: AuthoredRevision | null;
  /** The revision whose snapshot was re-applied, when `undone`. */
  restoredFrom: string | null;
  /**
   * Where the walk was standing BEFORE this Undo — the authored state the
   * operator was looking at, resolved through any restore records above it.
   */
  cursorRevisionId: string | null;
  /** How many further Undos this chain can still serve from the new position. */
  remainingUndos: number;
}

/**
 * REDO: THERE IS NONE, AND THAT IS A DECISION, NOT AN OMISSION.
 *
 * Undo appends, so the "future" a Redo would walk forward into is still on
 * disk — but so is every record a LATER edit has already invalidated, and the
 * chain carries no branch marker that separates the two. A forward walk would
 * therefore have to guess whether `r003` is the state the operator undid a
 * moment ago or a state they abandoned three edits back, and guessing wrong
 * silently re-applies an abandoned edit. The honest surface is the one that
 * already exists: every revision is listed by `revisionRows` and any of them
 * can be re-applied by id through `restoreAuthoredRevision`, which appends
 * exactly like an Undo does. "Go forward one" is not offered because it cannot
 * be computed honestly from an append-only chain with no branch record.
 */
export const EDITOR_REDO_POLICY =
  "There is no Redo. Undo walks BACK one authored state per press; going forward means picking a " +
  "revision by id from the history (restoreAuthoredRevision), which appends it as a new head exactly " +
  "as an Undo does. An append-only chain with no branch marker cannot distinguish a state that was " +
  "just undone from one a later edit abandoned, so a forward walk is not offered.";

/**
 * The authored state the operator is CURRENTLY standing on, as a chain index.
 *
 * The head record is not it whenever the head is a restore: a restore record
 * is the *echo* of an earlier state, so the position it represents is the
 * position of the record it restored. Restores nest (Undo pressed twice
 * restores a record that is itself a restore), so the resolution is transitive
 * — and that transitivity is the whole fix for F1: without it the walk reads
 * `chain[length - 2]` forever and two Undos land back where they started.
 *
 * The walk is bounded three ways: it only ever moves to a STRICTLY EARLIER
 * index, it refuses to revisit an index, and it stops at 0. A chain whose
 * `restoredFrom` points forward or nowhere (impossible from
 * `restoreAuthoredRevision`, but not impossible in a hand-edited directory)
 * stops the walk rather than looping.
 */
export function undoCursorIndex(chain: readonly AuthoredRevision[]): number {
  let index = chain.length - 1;
  const seen = new Set<number>();
  while (index > 0) {
    const revision = chain[index];
    if (revision.origin !== "restore" || revision.restoredFrom === null) break;
    const target = chain.findIndex((entry) => entry.revisionId === revision.restoredFrom);
    if (target < 0 || target >= index || seen.has(target)) break;
    seen.add(target);
    index = target;
  }
  return index;
}

/**
 * UNDO — one authored state back per press, appended.
 *
 * N presses step back N states (F1): the cursor is resolved through the
 * restore records the previous presses appended, and the target is the record
 * immediately BEFORE that cursor. The three invariants the editor's history
 * rests on are unchanged and unchangeable from here:
 *
 *   APPEND ONLY   the restore goes through `restoreAuthoredRevision`, which
 *                 appends with the `wx` flag; nothing is rewritten.
 *   NO TRUNCATION nothing is deleted — the chain length after an Undo is
 *                 always the length before it, plus one.
 *   A RESTORE IS ITSELF A REVISION  it carries `origin: "restore"` and
 *                 `restoredFrom`, which is exactly what the next press reads.
 *
 * Note the target is taken by INDEX, not by "the nearest non-restore record":
 * when the operator undoes, then edits again, the state before that new edit
 * IS a restore record, and stepping over it would silently discard the undo
 * they had just performed.
 */
export async function undoLastRevision(projectDir: string): Promise<UndoResult> {
  const chain = await loadRevisionChain(projectDir);
  if (chain.length === 0) {
    return {
      undone: false,
      reason: "this project has no authored revisions yet",
      revision: null,
      restoredFrom: null,
      cursorRevisionId: null,
      remainingUndos: 0,
    };
  }
  const cursor = undoCursorIndex(chain);
  if (cursor === 0) {
    return {
      undone: false,
      reason:
        chain.length === 1
          ? "the revision chain has a single entry — there is no earlier state to restore"
          : `Undo is already standing on the oldest authored state in this chain (${chain[0].revisionId}) — ` +
            "there is nothing earlier to restore",
      revision: null,
      restoredFrom: null,
      cursorRevisionId: chain[0].revisionId,
      remainingUndos: 0,
    };
  }
  const target = chain[cursor - 1];
  const restored = await restoreAuthoredRevision(projectDir, target.revisionId, {
    summary: `editor undo: step back from ${chain[cursor].revisionId} to ${target.revisionId}`,
  });
  return {
    undone: true,
    reason: `restored ${target.revisionId} as ${restored.revision.revisionId}`,
    revision: restored.revision,
    restoredFrom: target.revisionId,
    cursorRevisionId: chain[cursor].revisionId,
    remainingUndos: cursor - 1,
  };
}
