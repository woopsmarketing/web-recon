/**
 * pnpm smoke:revision — Task 27 authored-state revision chain (src/release/revisions.ts).
 *
 * Read-only over data/: two REAL release projects are COPIED into a throwaway
 * scratch namespace (a revision-2 project with authored content, and a
 * revision-1 legacy project that predates the chain entirely) and every write
 * happens inside the copy. Both source directories are byte-checked untouched
 * at the end — the "historical artifacts modified 0" invariant.
 */
import { cp, mkdir, readFile, readdir, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";

import { loadReleaseProject, saveReleaseProject } from "../src/release/store.js";
import {
  AUTHORED_REVISION_SCHEMA_NAME,
  AuthoredRevisionSchema,
  appendAuthoredRevision,
  appendAuthoredRevisionIfChanged,
  commitAuthoredState,
  diffAuthoredState,
  getRevision,
  hashAuthoredState,
  headRevision,
  loadRevisionChain,
  restoreAuthoredRevision,
  revisionDir,
  revisionIdForIndex,
} from "../src/release/revisions.js";
import {
  RELEASE_SCHEMA_VERSION,
  emptyAuthoredState,
  type AuthoredState,
} from "../src/release/types.js";

const AUTHORED_SOURCE = path.join("data", "linear.app", "release-projects", "flowpilot-wr27");
const LEGACY_SOURCE = path.join(
  "data",
  "linear.app",
  "release-projects",
  "linear.app-2026-08-25T23-32-42-075Z",
);

let checks = 0;
let failures = 0;
function check(name: string, ok: boolean | undefined, detail = ""): void {
  checks++;
  if (ok) console.log(`  PASS  ${name}`);
  else {
    failures++;
    console.log(`  FAIL  ${name}${detail ? ` — ${detail}` : ""}`);
  }
}
function section(title: string): void {
  console.log(`\n== ${title}`);
}

/** path → `size:mtimeMs` for every file under a directory. */
async function snapshotTree(dir: string): Promise<Record<string, string>> {
  const out: Record<string, string> = {};
  async function walk(current: string): Promise<void> {
    for (const entry of await readdir(current, { withFileTypes: true })) {
      const full = path.join(current, entry.name);
      if (entry.isDirectory()) await walk(full);
      else {
        const info = await stat(full);
        out[path.relative(dir, full)] = `${info.size}:${info.mtimeMs}`;
      }
    }
  }
  await walk(dir);
  return out;
}

async function revisionFileBytes(projectDir: string): Promise<Record<string, string>> {
  const out: Record<string, string> = {};
  for (const revision of await loadRevisionChain(projectDir)) {
    out[revision.revisionId] = await readFile(
      path.join(revisionDir(projectDir, revision.revisionId), "revision.json"),
      "utf8",
    );
  }
  return out;
}

/**
 * Seed `r000..r<count-1>` by writing records straight to disk.
 *
 * `appendAuthoredRevision` re-reads the WHOLE chain on every call, so seeding a
 * thousand of them through the public API is quadratic. Each record here is
 * shaped by the module's own helpers and passes the same schema parse the real
 * writer uses, so what the loader reads back is a genuine chain — the r999/r1000
 * crossing itself is then made through the public API, not seeded.
 */
async function seedRevisionChain(projectDir: string, count: number, siteId: string): Promise<void> {
  const authored = emptyAuthoredState();
  const change = diffAuthoredState(authored, authored);
  const authoredStateHash = hashAuthoredState(authored);
  for (let index = 0; index < count; index++) {
    const revisionId = revisionIdForIndex(index);
    const revision = AuthoredRevisionSchema.parse({
      schemaVersion: RELEASE_SCHEMA_VERSION,
      schemaName: AUTHORED_REVISION_SCHEMA_NAME,
      revisionId,
      siteId,
      parentRevisionId: index === 0 ? null : revisionIdForIndex(index - 1),
      createdAt: "2026-08-27T00:00:00.000Z",
      authoredStateHash,
      origin: index === 0 ? "prepare" : "edit",
      summary: `seed ${revisionId}`,
      change,
      restoredFrom: null,
      authored,
    });
    const file = path.join(revisionDir(projectDir, revisionId), "revision.json");
    await mkdir(path.dirname(file), { recursive: true });
    await writeFile(file, JSON.stringify(revision, null, 2) + "\n", {
      encoding: "utf8",
      flag: "wx",
    });
  }
}

async function main(): Promise<void> {
  const scratch = path.resolve("data", `.smoke-revision-${process.pid}`);
  await rm(scratch, { recursive: true, force: true });
  await mkdir(scratch, { recursive: true });

  const beforeAuthoredSource = await snapshotTree(AUTHORED_SOURCE);
  const beforeLegacySource = await snapshotTree(LEGACY_SOURCE);

  try {
    // ---- legacy: a project written before the chain existed ---------------
    section("legacy project (revision 1, no revisions/ directory)");
    const legacyDir = path.join(scratch, "legacy-project");
    await cp(LEGACY_SOURCE, legacyDir, { recursive: true });
    const legacy = await loadReleaseProject(legacyDir);
    const legacyChain = await loadRevisionChain(legacyDir);
    check(
      "27A.1 a legacy project with NO revisions loads and reports an empty chain",
      legacy.adaptedFrom === 1 && legacyChain.length === 0 && (await headRevision(legacyDir)) === null,
      `adaptedFrom=${legacy.adaptedFrom} chain=${legacyChain.length}`,
    );

    const legacyFirst = await appendAuthoredRevision(legacyDir, {
      siteId: legacy.project.siteId,
      authored: legacy.project.authored,
      origin: "prepare",
    });
    check(
      "27A.2 the first append on a chainless project is r000 with a null parent",
      legacyFirst.revisionId === "r000" && legacyFirst.parentRevisionId === null,
      `${legacyFirst.revisionId} parent=${JSON.stringify(legacyFirst.parentRevisionId)}`,
    );

    // ---- the authored project ---------------------------------------------
    section("authored edits append to the chain");
    const projectDir = path.join(scratch, "authored-project");
    await cp(AUTHORED_SOURCE, projectDir, { recursive: true });
    const loaded = await loadReleaseProject(projectDir);
    const baseAuthored = loaded.project.authored;
    check(
      "27A.3 fixture precondition: a revision-2 project with authored content",
      loaded.adaptedFrom === null && Object.keys(baseAuthored.slotValues).length > 0,
      `adaptedFrom=${loaded.adaptedFrom} slots=${Object.keys(baseAuthored.slotValues).length}`,
    );

    const r000 = await appendAuthoredRevision(projectDir, {
      siteId: loaded.project.siteId,
      authored: baseAuthored,
      origin: "prepare",
    });
    const editedSlotKey = Object.keys(baseAuthored.slotValues)[0];
    const editedAuthored: AuthoredState = {
      ...baseAuthored,
      slotValues: { ...baseAuthored.slotValues, [editedSlotKey]: "Edited by smoke:revision" },
      updatedAt: "2026-08-27T00:00:00.000Z",
    };
    const committed = await commitAuthoredState(projectDir, editedAuthored, {
      origin: "edit",
      now: new Date("2026-08-27T00:00:00.000Z"),
    });
    const r001 = committed.revision;
    check(
      "27A.4 an authored edit appends a new revision with the correct parent",
      r001.revisionId === "r001" && r001.parentRevisionId === "r000" && r000.parentRevisionId === null,
      `${r001.revisionId} parent=${r001.parentRevisionId}`,
    );
    check(
      "27A.5 the change summary names the edited slot key (keys only, values live in the snapshot)",
      r001.change.slotKeysChanged.includes(editedSlotKey) &&
        r001.change.slotKeysAdded.length === 0 &&
        r001.change.slotKeysRemoved.length === 0,
      JSON.stringify(r001.change),
    );

    // ---- hashing -----------------------------------------------------------
    section("authoredStateHash changes iff the authored state changes");
    check(
      "27A.6 the record's hash is the hash of the snapshot it actually captured",
      r001.authoredStateHash === hashAuthoredState(r001.authored) &&
        r000.authoredStateHash === hashAuthoredState(r000.authored),
      `${r001.authoredStateHash.slice(0, 12)} vs ${hashAuthoredState(r001.authored).slice(0, 12)}`,
    );
    const reordered: AuthoredState = {
      updatedAt: baseAuthored.updatedAt,
      theme: baseAuthored.theme,
      slotValues: Object.fromEntries(Object.entries(baseAuthored.slotValues).reverse()),
    };
    check(
      "27A.7 an unchanged state hashes identically (key order and reload do not move it)",
      hashAuthoredState(reordered) === r000.authoredStateHash &&
        hashAuthoredState(JSON.parse(JSON.stringify(baseAuthored))) === r000.authoredStateHash,
      `${hashAuthoredState(reordered).slice(0, 12)} vs ${r000.authoredStateHash.slice(0, 12)}`,
    );
    check(
      "27A.8 a changed state hashes differently (slot value; theme token)",
      r001.authoredStateHash !== r000.authoredStateHash &&
        hashAuthoredState({ ...baseAuthored, theme: { ...baseAuthored.theme, note: "moved" } }) !==
          r000.authoredStateHash,
      `${r000.authoredStateHash.slice(0, 12)} vs ${r001.authoredStateHash.slice(0, 12)}`,
    );
    const noop = await appendAuthoredRevisionIfChanged(projectDir, {
      siteId: loaded.project.siteId,
      authored: r001.authored,
    });
    check(
      "27A.9 appendIfChanged writes nothing when the state did not move",
      noop === null && (await loadRevisionChain(projectDir)).length === 2,
      `noop=${noop === null} len=${(await loadRevisionChain(projectDir)).length}`,
    );

    // ---- reload ------------------------------------------------------------
    section("the chain survives a project reload from disk");
    const reloadedChain = await loadRevisionChain(projectDir);
    const reloadedProject = (await loadReleaseProject(projectDir)).project;
    check(
      "27A.10 the chain reloads intact (ids, parents, hashes verified on read)",
      reloadedChain.map((r) => r.revisionId).join(",") === "r000,r001" &&
        reloadedChain[1].authoredStateHash === r001.authoredStateHash &&
        reloadedChain[1].parentRevisionId === "r000",
      reloadedChain.map((r) => `${r.revisionId}<-${r.parentRevisionId}`).join(" "),
    );
    check(
      "27A.11 the project document on disk carries the committed authored state",
      hashAuthoredState(reloadedProject.authored) === r001.authoredStateHash,
      `${hashAuthoredState(reloadedProject.authored).slice(0, 12)} vs ${r001.authoredStateHash.slice(0, 12)}`,
    );

    // ---- restore -----------------------------------------------------------
    section("restore is an APPEND, never a rewrite");
    const bytesBeforeRestore = await revisionFileBytes(projectDir);
    const restored = await restoreAuthoredRevision(projectDir, "r000");
    const chainAfter = await loadRevisionChain(projectDir);
    const bytesAfterRestore = await revisionFileBytes(projectDir);
    check(
      "27A.12 restore(r000) reproduces that authored state EXACTLY",
      JSON.stringify(restored.authored) === JSON.stringify(r000.authored) &&
        restored.revision.authoredStateHash === r000.authoredStateHash,
      `${restored.revision.authoredStateHash.slice(0, 12)} vs ${r000.authoredStateHash.slice(0, 12)}`,
    );
    check(
      "27A.13 restore APPENDS r002 (parent r001, restoredFrom r000) — the chain grew",
      chainAfter.length === 3 &&
        restored.revision.revisionId === "r002" &&
        restored.revision.parentRevisionId === "r001" &&
        restored.revision.restoredFrom === "r000" &&
        restored.revision.origin === "restore",
      `len=${chainAfter.length} ${restored.revision.revisionId}<-${restored.revision.parentRevisionId} from=${restored.revision.restoredFrom}`,
    );
    check(
      "27A.14 no earlier record was rewritten or truncated by the restore",
      Object.keys(bytesBeforeRestore).every(
        (id) => bytesAfterRestore[id] === bytesBeforeRestore[id],
      ) && bytesBeforeRestore.r000 !== undefined && bytesBeforeRestore.r001 !== undefined,
      Object.keys(bytesBeforeRestore).join(","),
    );
    const restoredProject = (await loadReleaseProject(projectDir)).project;
    check(
      "27A.15 the project document now holds the restored state, and a restore is itself restorable",
      hashAuthoredState(restoredProject.authored) === r000.authoredStateHash &&
        (await restoreAuthoredRevision(projectDir, "r001")).revision.revisionId === "r003",
      `project=${hashAuthoredState(restoredProject.authored).slice(0, 12)}`,
    );

    // ---- integrity ---------------------------------------------------------
    section("a record edited behind its own hash is rejected");
    const tamperedDir = path.join(scratch, "tampered-project");
    await cp(projectDir, tamperedDir, { recursive: true });
    const victim = path.join(revisionDir(tamperedDir, "r001"), "revision.json");
    const record = JSON.parse(await readFile(victim, "utf8"));
    record.authored.slotValues[editedSlotKey] = "tampered";
    await writeFile(victim, JSON.stringify(record, null, 2) + "\n", "utf8");
    let rejected = "";
    try {
      await loadRevisionChain(tamperedDir);
    } catch (err) {
      rejected = (err as Error).message;
    }
    check(
      "27A.16 loading a chain whose record no longer matches its hash throws",
      rejected.includes("was edited after it was written"),
      rejected.slice(0, 120) || "no throw",
    );

    // ---- the r999/r1000 boundary -------------------------------------------
    // Ids WIDEN past r999 (revisions.ts `revisionIdForIndex`), so directory
    // names must be ordered numerically: lexically, r1000 sorts between r100
    // and r101 and the chain reads as corrupt from position 101 onwards.
    section("a chain that crosses r999/r1000");
    const boundaryDir = path.join(scratch, "boundary-project");
    await seedRevisionChain(boundaryDir, 999, "boundary-site");
    const r999 = await appendAuthoredRevision(boundaryDir, {
      siteId: "boundary-site",
      authored: emptyAuthoredState(),
      origin: "edit",
    });
    const r1000 = await appendAuthoredRevision(boundaryDir, {
      siteId: "boundary-site",
      authored: emptyAuthoredState(),
      origin: "edit",
    });
    check(
      "27A.17 the 1000th and 1001st appends widen to r999 then r1000 (they do not wrap)",
      r999.revisionId === "r999" &&
        r1000.revisionId === "r1000" &&
        r1000.parentRevisionId === "r999",
      `${r999.revisionId} then ${r1000.revisionId}<-${r1000.parentRevisionId}`,
    );

    let boundaryChain: Awaited<ReturnType<typeof loadRevisionChain>> = [];
    let boundaryError = "";
    try {
      boundaryChain = await loadRevisionChain(boundaryDir);
    } catch (err) {
      boundaryError = (err as Error).message;
    }
    check(
      "27A.18 the crossed chain LOADS, in numeric order (r100, r101, … r999, r1000)",
      boundaryError === "" &&
        boundaryChain.length === 1001 &&
        boundaryChain[100]?.revisionId === "r100" &&
        boundaryChain[101]?.revisionId === "r101" &&
        boundaryChain[999]?.revisionId === "r999" &&
        boundaryChain[1000]?.revisionId === "r1000",
      boundaryError.slice(0, 160) ||
        `len=${boundaryChain.length} [101]=${boundaryChain[101]?.revisionId} [1000]=${boundaryChain[1000]?.revisionId}`,
    );

    let headError = "";
    let boundaryHead: Awaited<ReturnType<typeof headRevision>> = null;
    try {
      boundaryHead = await headRevision(boundaryDir);
    } catch (err) {
      headError = (err as Error).message;
    }
    check(
      "27A.19 headRevision past the boundary is r1000 — not r999, and not a throw",
      headError === "" && boundaryHead?.revisionId === "r1000",
      headError.slice(0, 160) || `head=${boundaryHead?.revisionId}`,
    );

    let r1001Error = "";
    let r1001: Awaited<ReturnType<typeof appendAuthoredRevision>> | null = null;
    try {
      r1001 = await appendAuthoredRevision(boundaryDir, {
        siteId: "boundary-site",
        authored: { ...emptyAuthoredState(), updatedAt: "2026-08-27T01:00:00.000Z" },
        origin: "edit",
      });
    } catch (err) {
      r1001Error = (err as Error).message;
    }
    check(
      "27A.20 an append after r1000 is r1001, parented to r1000",
      r1001Error === "" &&
        r1001?.revisionId === "r1001" &&
        r1001?.parentRevisionId === "r1000" &&
        (await loadRevisionChain(boundaryDir)).length === 1002,
      r1001Error.slice(0, 160) || `${r1001?.revisionId}<-${r1001?.parentRevisionId}`,
    );
    let addressed = "";
    let addressError = "";
    try {
      addressed = [
        (await getRevision(boundaryDir, "r100"))?.summary,
        (await getRevision(boundaryDir, "r1000"))?.summary,
        (await getRevision(boundaryDir, "r1002")) === null ? "absent" : "present",
      ].join(" | ");
    } catch (err) {
      addressError = (err as Error).message;
    }
    check(
      "27A.21 getRevision still addresses both sides of the boundary distinctly",
      addressError === "" && addressed === `seed r100 | ${r1000.summary} | absent`,
      addressError.slice(0, 160) || addressed,
    );

    // ---- source immutability ----------------------------------------------
    section("historical artifacts untouched");
    const afterAuthoredSource = await snapshotTree(AUTHORED_SOURCE);
    const afterLegacySource = await snapshotTree(LEGACY_SOURCE);
    check(
      "27A.22 both real release projects under data/ are byte-identical afterwards",
      JSON.stringify(beforeAuthoredSource) === JSON.stringify(afterAuthoredSource) &&
        JSON.stringify(beforeLegacySource) === JSON.stringify(afterLegacySource),
      `${Object.keys(afterAuthoredSource).length} + ${Object.keys(afterLegacySource).length} files`,
    );
    check(
      "27A.23 no revisions/ directory was created in either source project",
      (await readdir(AUTHORED_SOURCE)).every((n) => n !== "revisions") &&
        (await readdir(LEGACY_SOURCE)).every((n) => n !== "revisions"),
      (await readdir(AUTHORED_SOURCE)).join(","),
    );

    // diffAuthoredState is the shared summary helper — exercised directly so a
    // future caller (resolve/prepare wiring) has a pinned contract.
    check(
      "27A.24 diffAuthoredState reports adds, removes and theme moves against a null parent",
      diffAuthoredState(null, baseAuthored).slotKeysAdded.length ===
        Object.keys(baseAuthored.slotValues).length &&
        diffAuthoredState(baseAuthored, { ...baseAuthored, slotValues: {} }).slotKeysRemoved.length ===
          Object.keys(baseAuthored.slotValues).length &&
        diffAuthoredState(baseAuthored, { ...baseAuthored, theme: {} }).themeChanged,
      JSON.stringify(diffAuthoredState(null, baseAuthored)),
    );
  } finally {
    await rm(scratch, { recursive: true, force: true });
  }

  console.log(`\nsmoke:revision — ${checks} checks, ${failures} failures`);
  if (failures > 0) process.exit(1);
}

main().catch((err) => {
  console.error("\nsmoke:revision CRASHED —", err);
  process.exit(1);
});
