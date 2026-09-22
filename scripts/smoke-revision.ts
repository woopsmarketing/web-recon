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

import {
  // Task 28 CR1 — the SAME symbols, reached through the public barrel. If the
  // re-export is ever dropped this suite stops compiling.
  appendAuthoredRevisionIfChanged as barrelAppendIfChanged,
  loadRevisionChain as barrelLoadChain,
  restoreAuthoredRevision as barrelRestore,
} from "../src/release/index.js";
import { loadReleaseProject, saveReleaseProject } from "../src/release/store.js";
// Task 28 Phase 2 — the authored write API. The chain is its transaction
// boundary, so the "a no-op edit appends nothing" contract is tested HERE,
// against a real project copy, rather than only in smoke:release.
import {
  brandSurfaceId,
  commitAuthoredEdits,
  setAuthoredAsset,
  setAuthoredBrandDecision,
} from "../src/release/authored.js";
import {
  AUTHORED_REVISION_SCHEMA_NAME,
  AuthoredChangeSchema,
  AuthoredRevisionSchema,
  authoredChangeIsEmpty,
  summarizeAuthoredChange,
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
  ReleaseProjectSchema,
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
    // =====================================================================
    section("Task 28 CR1/CR2/CR3 — barrel surface, single-read append, displayName");
    // =====================================================================
    check(
      "28.CR1.1 the revision chain API is the SAME function through the release barrel",
      barrelAppendIfChanged === appendAuthoredRevisionIfChanged &&
        barrelLoadChain === loadRevisionChain &&
        barrelRestore === restoreAuthoredRevision,
    );
    // The append path now runs on the operator path (prepare/resolve) and reads
    // the chain ONCE for both the "did anything change?" comparison and the
    // append. Verification must NOT have been traded away for that: a tampered
    // record still throws instead of being appended onto.
    const tamperDir = path.join(scratch, "cr2-tamper");
    await cp(AUTHORED_SOURCE, tamperDir, { recursive: true });
    const tamperLoaded = await loadReleaseProject(tamperDir);
    await appendAuthoredRevision(tamperDir, {
      siteId: tamperLoaded.project.siteId,
      authored: tamperLoaded.project.authored,
      origin: "prepare",
    });
    const tamperFile = path.join(revisionDir(tamperDir, "r000"), "revision.json");
    const tamperRecord = JSON.parse(await readFile(tamperFile, "utf8")) as {
      authored: AuthoredState;
    };
    tamperRecord.authored = { ...tamperRecord.authored, slotValues: { "x.y": "tampered" } };
    await writeFile(tamperFile, JSON.stringify(tamperRecord, null, 2) + "\n", "utf8");
    let ifChangedRefused = false;
    try {
      await appendAuthoredRevisionIfChanged(tamperDir, {
        siteId: tamperLoaded.project.siteId,
        authored: emptyAuthoredState(),
        origin: "edit",
      });
    } catch {
      ifChangedRefused = true;
    }
    check(
      "28.CR2.1 the single-read append still VERIFIES the chain (tampered head refused)",
      ifChangedRefused && (await readdir(path.join(tamperDir, "revisions"))).length === 1,
      `refused=${ifChangedRefused}`,
    );
    // …and an untampered chain appends with the parent taken from that one read.
    const seqDir = path.join(scratch, "cr2-sequence");
    await cp(AUTHORED_SOURCE, seqDir, { recursive: true });
    const seqLoaded = await loadReleaseProject(seqDir);
    const seqBase = seqLoaded.project.authored;
    await appendAuthoredRevisionIfChanged(seqDir, {
      siteId: seqLoaded.project.siteId,
      authored: seqBase,
      origin: "prepare",
    });
    const seqNoop = await appendAuthoredRevisionIfChanged(seqDir, {
      siteId: seqLoaded.project.siteId,
      authored: seqBase,
      origin: "prepare",
    });
    const seqMoved = await appendAuthoredRevisionIfChanged(seqDir, {
      siteId: seqLoaded.project.siteId,
      authored: { ...seqBase, theme: { tokens: { "color.accent.primary": "#010203" } } },
      origin: "resolve",
    });
    const seqChain = await loadRevisionChain(seqDir);
    check(
      "28.CR2.2 an unchanged authored state appends nothing; a moved one appends r001 with parent r000",
      seqNoop === null &&
        seqMoved !== null &&
        seqMoved.revisionId === "r001" &&
        seqMoved.parentRevisionId === "r000" &&
        seqMoved.origin === "resolve" &&
        seqChain.length === 2,
      JSON.stringify(seqChain.map((r) => `${r.revisionId}:${r.origin}`)),
    );
    // ---- CR3 backward compatibility --------------------------------------
    check(
      "28.CR3.1 a project on disk with NO displayName loads with the field absent",
      loaded.project.displayName === undefined && legacy.project.displayName === undefined,
      `${String(loaded.project.displayName)} / ${String(legacy.project.displayName)}`,
    );
    check(
      "28.CR3.2 release-project-v1 accepts a displayName and still rejects an empty one",
      ReleaseProjectSchema.safeParse({ ...loaded.project, displayName: "Acme Inc" }).success &&
        !ReleaseProjectSchema.safeParse({ ...loaded.project, displayName: "" }).success,
    );

    // =====================================================================
    section("Task 28 Phase 2 — authored.assets / authored.brand in the chain");
    // =====================================================================
    // A revision record embeds the WHOLE authored snapshot, so the two new
    // authored dimensions ride along for free. What does NOT ride along for
    // free is the `change` summary: an asset or brand edit that reported
    // `slotKeysChanged: []` and `themeChanged: false` would be a record saying
    // "nothing moved" about a snapshot that moved.
    const surfaceId = brandSurfaceId({
      surface: "svg-aria-label",
      route: "/",
      nodeId: "n000017",
      slotKey: null,
      evidencePointer: "desktop.doc[n000017].v",
    });
    const p2Base = emptyAuthoredState();
    const p2WithAsset = setAuthoredAsset(
      p2Base,
      "organization-logo",
      { file: "tmp/wr28/does-not-need-to-exist.png", alt: "NewCo" },
      "2026-08-27T00:00:00.000Z",
    ).authored;
    const p2WithBrand = setAuthoredBrandDecision(
      p2WithAsset,
      surfaceId,
      { decision: "PRESERVE", reason: "licensed partner mark" },
      "2026-08-27T00:01:00.000Z",
    ).authored;
    const p2AssetDiff = diffAuthoredState(p2Base, p2WithAsset);
    const p2BrandDiff = diffAuthoredState(p2WithAsset, p2WithBrand);
    const p2RemovalDiff = diffAuthoredState(p2WithBrand, p2Base);
    check(
      "28.P2.R1 diffAuthoredState reports asset and brand movement by KEY, in both directions",
      p2AssetDiff.assetIdsAdded?.join(",") === "organization-logo" &&
        p2AssetDiff.brandSurfacesAdded?.length === 0 &&
        p2BrandDiff.brandSurfacesAdded?.join(",") === surfaceId &&
        p2BrandDiff.assetIdsAdded?.length === 0 &&
        p2BrandDiff.assetIdsChanged?.length === 0 &&
        p2RemovalDiff.assetIdsRemoved?.join(",") === "organization-logo" &&
        p2RemovalDiff.brandSurfacesRemoved?.join(",") === surfaceId,
      JSON.stringify({ asset: p2AssetDiff, brand: p2BrandDiff, removal: p2RemovalDiff }),
    );
    check(
      "28.P2.R2 authoredChangeIsEmpty and the one-line summary both see the new dimensions",
      authoredChangeIsEmpty(diffAuthoredState(p2WithBrand, p2WithBrand)) &&
        !authoredChangeIsEmpty(p2AssetDiff) &&
        !authoredChangeIsEmpty(p2BrandDiff) &&
        summarizeAuthoredChange(p2AssetDiff, "edit") === "edit: +1 asset" &&
        summarizeAuthoredChange(p2BrandDiff, "edit") === "edit: +1 brand",
      `${summarizeAuthoredChange(p2AssetDiff, "edit")} | ${summarizeAuthoredChange(p2BrandDiff, "edit")}`,
    );
    // BACKWARD COMPATIBILITY. Every revision record already on disk carries a
    // `change` with the four original fields only, and AuthoredChangeSchema is
    // `.strict()` — a REQUIRED new field would make `loadRevisionChain` reject
    // those records as a corrupt history rather than an old one.
    const legacyChange = {
      slotKeysAdded: ["a"],
      slotKeysChanged: [],
      slotKeysRemoved: [],
      themeChanged: false,
    };
    check(
      "28.P2.R3 a pre-Task-28 `change` block still parses, and an unknown key is still refused",
      AuthoredChangeSchema.safeParse(legacyChange).success &&
        authoredChangeIsEmpty(AuthoredChangeSchema.parse(legacyChange)) === false &&
        !AuthoredChangeSchema.safeParse({ ...legacyChange, invented: [] }).success,
    );
    // …and the same statement against REAL records: every revision chain that
    // exists under data/ today must still load through the widened schema.
    const realChains: string[] = [];
    for (const hostEntry of await readdir("data", { withFileTypes: true })) {
      if (!hostEntry.isDirectory()) continue;
      const projectsDir = path.join("data", hostEntry.name, "release-projects");
      let names: string[] = [];
      try {
        names = (await readdir(projectsDir, { withFileTypes: true }))
          .filter((entry) => entry.isDirectory())
          .map((entry) => entry.name);
      } catch {
        continue;
      }
      for (const name of names) {
        const dir = path.join(projectsDir, name);
        try {
          const chain = await loadRevisionChain(dir);
          if (chain.length > 0) realChains.push(`${name}:${chain.length}`);
        } catch (err) {
          realChains.push(`${name}:THROW(${(err as Error).message.slice(0, 40)})`);
        }
      }
    }
    check(
      "28.P2.R4 every authored-revision chain already on disk still loads through the widened schema",
      realChains.length > 0 && realChains.every((row) => !row.includes("THROW")),
      realChains.join(" ") || "no chains found on disk",
    );

    // ---- the write API's transaction boundary ----------------------------
    const editDir = path.join(scratch, "p2-edit");
    await cp(AUTHORED_SOURCE, editDir, { recursive: true });
    const editLoaded = await loadReleaseProject(editDir);
    await appendAuthoredRevision(editDir, {
      siteId: editLoaded.project.siteId,
      authored: editLoaded.project.authored,
      origin: "prepare",
    });
    const editBytesBefore = await readFile(path.join(editDir, "release-project.json"), "utf8");
    const noopEdit = await commitAuthoredEdits(editDir, [
      { op: "remove-asset", assetId: "never-set" },
      { op: "remove-brand-decision", surfaceId },
      { op: "set-slot-value", slotKey: Object.keys(editLoaded.project.authored.slotValues)[0], value: editLoaded.project.authored.slotValues[Object.keys(editLoaded.project.authored.slotValues)[0]] },
    ]);
    check(
      "28.P2.R5 commitAuthoredEdits on a no-op batch appends NO revision and does not rewrite the project",
      noopEdit.changed === false &&
        noopEdit.revision === null &&
        (await loadRevisionChain(editDir)).length === 1 &&
        (await readFile(path.join(editDir, "release-project.json"), "utf8")) === editBytesBefore,
      `changed=${noopEdit.changed} chain=${(await loadRevisionChain(editDir)).length}`,
    );
    const realEdit = await commitAuthoredEdits(
      editDir,
      [
        { op: "set-asset", assetId: "og-image", file: "tmp/wr28/og.png", alt: "NewCo" },
        { op: "set-brand-decision", surfaceId, decision: "REMOVE" },
      ],
      { now: new Date("2026-08-27T02:00:00.000Z") },
    );
    const editReloaded = (await loadReleaseProject(editDir)).project;
    check(
      "28.P2.R6 one batch of real edits appends ONE revision that names both dimensions and matches the saved project",
      realEdit.changed &&
        realEdit.revision?.revisionId === "r001" &&
        realEdit.revision.change.assetIdsAdded?.join(",") === "og-image" &&
        realEdit.revision.change.brandSurfacesAdded?.join(",") === surfaceId &&
        (await loadRevisionChain(editDir)).length === 2 &&
        hashAuthoredState(editReloaded.authored) === realEdit.revision.authoredStateHash,
      `${realEdit.revision?.revisionId} ${realEdit.revision?.summary}`,
    );
    // Restore is the undo the Visual Editor will call. It must roll the two new
    // dimensions back exactly, not just the slot values it was written for.
    const restoredP2 = await restoreAuthoredRevision(editDir, "r000");
    check(
      "28.P2.R7 restoring the pre-edit revision rolls authored.assets and authored.brand back to ABSENT",
      restoredP2.authored.assets === undefined &&
        restoredP2.authored.brand === undefined &&
        (await loadReleaseProject(editDir)).project.authored.assets === undefined &&
        restoredP2.revision.change.assetIdsRemoved?.join(",") === "og-image" &&
        restoredP2.revision.change.brandSurfacesRemoved?.join(",") === surfaceId,
      JSON.stringify(restoredP2.revision.change),
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
