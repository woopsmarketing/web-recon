/**
 * Step 6 (Demo Customer Content Proof) — unchanged-tree proof.
 *
 *   tsx --tsconfig platform/tsconfig.json platform/test/step6-proof.ts capture
 *   tsx --tsconfig platform/tsconfig.json platform/test/step6-proof.ts verify
 *
 * `capture` records hashes of everything Step 6 must NOT change (run before any work);
 * `verify` recomputes them and fails on any difference. Read-only over the repo; it writes
 * only docs/result/recon-template-platform-step6-demo/proof/{baseline,final}.json.
 *
 *  - templateSourceHash     the release's own definition (computeTemplateSourceHash) over the
 *                           LIVE templates/interior-01/v1 tree
 *  - releaseSources         every live release source file (template + platform runtime) vs the
 *                           pinned release record (live tree == immutable release)
 *  - trees                  raw sha256 trees: template dir, platform/ (tests excluded), the
 *                           three fixture sites, every template release, fixture build pointers
 */
import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { collectReleaseSources, computeTemplateSourceHash, loadRelease, verifyRelease } from "../release/release";
import { hashJson, sha256 } from "../util/hash";

const repoRoot = process.cwd();
const OUT = path.join(repoRoot, "docs/result/recon-template-platform-step6-demo/proof");
const RELEASE_ID = "interior-01-1.4.0-9e1ea20da947";
const SKIP = new Set([".DS_Store", "node_modules", ".next", "out"]);

async function tree(rel: string, skipTop: readonly string[] = []): Promise<{ files: number; hash: string }> {
  const out: { path: string; sha256: string }[] = [];
  async function walk(dir: string, r: string) {
    for (const e of (await readdir(dir, { withFileTypes: true })).sort((a, b) => (a.name < b.name ? -1 : 1))) {
      if (SKIP.has(e.name) || (r === "" && skipTop.includes(e.name))) continue;
      const p = r ? `${r}/${e.name}` : e.name;
      if (e.isDirectory()) await walk(path.join(dir, e.name), p);
      else if (e.isFile()) out.push({ path: p, sha256: sha256(await readFile(path.join(dir, e.name))) });
    }
  }
  await walk(path.join(repoRoot, rel), "");
  return { files: out.length, hash: hashJson(out) };
}

async function measure() {
  const { sources } = await collectReleaseSources(repoRoot, "interior-01", 1);
  const live = await Promise.all([...sources].map(async ([p, abs]) => ({ path: p, sha256: sha256(await readFile(abs)) })));
  const release = await loadRelease(repoRoot, "interior-01", RELEASE_ID);
  await verifyRelease(repoRoot, release);
  const recorded = new Map(release.files.map((f) => [f.path, f.sha256]));
  const drift = [
    ...live.filter((f) => recorded.get(f.path) !== f.sha256).map((f) => f.path),
    ...release.files.filter((f) => !sources.has(f.path)).map((f) => f.path),
  ].sort();

  const releases = (await readdir(path.join(repoRoot, "data/template-releases/interior-01"))).filter((d) => d.startsWith("interior-01-")).sort();
  const trees: Record<string, { files: number; hash: string }> = {
    "templates/interior-01/v1": await tree("templates/interior-01/v1"),
    "platform (test/ excluded)": await tree("platform", ["test"]),
  };
  for (const s of ["fixture-large", "fixture-small", "fixture-empty"]) {
    trees[`data/sites/${s}`] = await tree(`data/sites/${s}`);
    trees[`data/site-builds/${s}`] = await tree(`data/site-builds/${s}`);
  }
  for (const r of releases) trees[`data/template-releases/interior-01/${r}`] = await tree(`data/template-releases/interior-01/${r}`);

  return {
    releaseId: RELEASE_ID,
    releaseHash: release.releaseHash,
    releaseRecordTemplateSourceHash: release.templateSourceHash,
    liveTemplateSourceHash: computeTemplateSourceHash(live),
    liveReleaseSourceFiles: live.length,
    liveVsReleaseDrift: drift,
    releases,
    trees,
  };
}

const mode = process.argv[2];
if (mode !== "capture" && mode !== "verify") {
  console.error("usage: step6-proof.ts capture|verify");
  process.exit(2);
}
await mkdir(OUT, { recursive: true });
const now = await measure();
if (mode === "capture") {
  await writeFile(path.join(OUT, "baseline.json"), `${JSON.stringify({ capturedAt: new Date().toISOString(), ...now }, null, 2)}\n`);
  console.log(JSON.stringify({ captured: true, liveTemplateSourceHash: now.liveTemplateSourceHash, releaseRecord: now.releaseRecordTemplateSourceHash, drift: now.liveVsReleaseDrift }, null, 2));
} else {
  const { capturedAt: _capturedAt, ...base } = JSON.parse(await readFile(path.join(OUT, "baseline.json"), "utf8"));
  const changed: string[] = [];
  for (const k of ["releaseHash", "releaseRecordTemplateSourceHash", "liveTemplateSourceHash", "liveReleaseSourceFiles"] as const) {
    if (base[k] !== now[k]) changed.push(k);
  }
  if (JSON.stringify(base.liveVsReleaseDrift) !== JSON.stringify(now.liveVsReleaseDrift)) changed.push("liveVsReleaseDrift");
  if (JSON.stringify(base.releases) !== JSON.stringify(now.releases)) changed.push("releases (a release was added or removed)");
  for (const [k, v] of Object.entries(base.trees as Record<string, { hash: string }>)) {
    if (now.trees[k]?.hash !== v.hash) changed.push(`tree ${k}`);
  }
  for (const k of Object.keys(now.trees)) if (!(k in base.trees)) changed.push(`new tree ${k}`);
  await writeFile(path.join(OUT, "final.json"), `${JSON.stringify({ verifiedAt: new Date().toISOString(), changed, ...now }, null, 2)}\n`);
  console.log(JSON.stringify({ verified: true, changed, before: base.liveTemplateSourceHash, after: now.liveTemplateSourceHash }, null, 2));
  if (changed.length) process.exit(1);
}
