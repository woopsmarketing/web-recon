/**
 * Whole-site Visual / UX Polish validation (interior-01 1.3.1) — a presentation-only release.
 * Run AFTER the polish release is cut and the three fixtures are re-pinned and built:
 *   pnpm test:platform   (slice1 → step4 → step41 → step5 → this file)
 * Browser behaviour (mobile footer stack, the viewport-fixed floating seat + safe-area fallback,
 * reviews fit/overflow, portfolio title on its banner + contrast, overflow, media) is covered by
 * scripts/template-platform-polish-visual-smoke.ts.
 * Throwaway-root builds never touch data/sites or data/site-builds.
 */
import { cp, mkdir, mkdtemp, readFile, readdir, rm, symlink, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { packageIntact, prepareSiteInput } from "../build/site-build";
import { loadRelease, verifyRelease } from "../release/release";
import template from "../../templates/interior-01/v1/template";

const repoRoot = process.cwd();
const SITES = ["fixture-large", "fixture-small", "fixture-empty"] as const;
/** The Step 5 release: the polish release's base and every site's rollback target. */
const STEP5_RELEASE = { id: "interior-01-1.3.0-74a70c276f35", hash: "74a70c276f353446fb80d4419ed920533f371e5d16905310497702aab944f1f4" };
const V1 = "templates/interior-01/v1";
/** The only release files the polish may change — and how. */
const CHANGED = [`${V1}/sections/FloatingCta.tsx`, `${V1}/styles/template.css`, `${V1}/template.ts`];
/** Text outputs whose bytes embed the build id / stylesheet name. */
const TEXT = /\.(html|txt|js|json|xml|rsc|css|map|webmanifest)$/;
/** Semver order of "x.y.z" strings. */
const versionAtLeast = (v: string, min: string) => {
  const [a, b] = [v, min].map((x) => x.split(".").map(Number));
  for (let i = 0; i < 3; i++) if (a![i] !== b![i]) return a![i]! > b![i]!;
  return true;
};

let passed = 0;
const failed: string[] = [];
async function check(name: string, fn: () => unknown | Promise<unknown>) {
  try {
    await fn();
    passed++;
    console.log(`  ok   ${name}`);
  } catch (error) {
    failed.push(name);
    console.log(`  FAIL ${name}\n       ${(error as Error).message.split("\n").join("\n       ")}`);
  }
}
function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new Error(msg);
}
const readJson = async (f: string) => JSON.parse(await readFile(f, "utf8"));
async function walkFiles(dir: string, rel = ""): Promise<string[]> {
  const out: string[] = [];
  for (const e of await readdir(dir, { withFileTypes: true })) {
    const r = rel ? `${rel}/${e.name}` : e.name;
    if (e.isDirectory()) out.push(...(await walkFiles(path.join(dir, e.name), r)));
    else out.push(r);
  }
  return out.sort();
}
const releaseFile = (id: string, p: string) => readFile(path.join(repoRoot, "data/template-releases/interior-01", id, "files", p), "utf8");
/** Source text without comments (block, JSDoc and whole-line `//` comments). */
const code = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "").replace(/\s+/g, " ").trim();
const history = async (s: string) =>
  (await readFile(path.join(repoRoot, "data/site-builds", s, "history.jsonl"), "utf8")).trim().split("\n").map((l) => JSON.parse(l) as { buildInputId: string; status: string; finishedAt: string; releaseId: string });

const pointer = async (s: string, which: "current" | "previous") => {
  const ptr = await readJson(path.join(repoRoot, "data/site-builds", s, `${which}.json`));
  const dir = path.join(repoRoot, ptr.packageDir);
  return { dir, site: path.join(dir, "site"), record: await readJson(path.join(dir, "build-record.json")) };
};
const pinOf = async (s: string) => (await readJson(path.join(repoRoot, "data/sites", s, "site.json"))).template;
const newPin = await pinOf("fixture-large");
/** The polish release = the last 1.3.1 release fixture-large was built with (current right after this step). */
const polishId = (await history("fixture-large")).filter((r) => r.status === "success" && r.releaseId.startsWith("interior-01-1.3.1-")).at(-1)?.releaseId;
/** A later release is current: the 1.3.0/1.3.1 packages are no longer both retained and the fixtures may have moved on. */
const later = versionAtLeast(newPin.templateVersion, "1.3.2");

// ---------------------------------------------------------------- release --
console.log("\n[release] the polish release against the Step 5 release");
await check("R1 exactly ONE 1.3.1 release exists, verifies, and is the current pin while 1.3.1 is current; 1.3.0 unchanged", async () => {
  assert(polishId, "no successful 1.3.1 build recorded");
  const v131 = (await readdir(path.join(repoRoot, "data/template-releases/interior-01"))).filter((d) => d.startsWith("interior-01-1.3.1-"));
  assert(v131.length === 1 && v131[0] === polishId, `1.3.1 releases: ${v131.join(", ")}`);
  const polish = await loadRelease(repoRoot, "interior-01", polishId);
  await verifyRelease(repoRoot, polish);
  assert(polish.templateVersion === "1.3.1", polish.templateVersion);
  if (newPin.templateVersion === "1.3.1") assert(newPin.releaseId === polishId && template.version === "1.3.1", `pin ${newPin.releaseId}`);
  const step5 = await loadRelease(repoRoot, "interior-01", STEP5_RELEASE.id);
  assert(step5.releaseHash === STEP5_RELEASE.hash, "1.3.0 releaseHash changed");
  await verifyRelease(repoRoot, step5);
});
await check("R2 same release file set as 1.3.0; only template.css, FloatingCta.tsx and template.ts differ", async () => {
  const [a, b] = await Promise.all([STEP5_RELEASE.id, polishId!].map((id) => loadRelease(repoRoot, "interior-01", id)));
  const pa = a!.files.map((f) => f.path);
  const pb = b!.files.map((f) => f.path);
  assert(JSON.stringify(pa) === JSON.stringify(pb), `file set changed: +${pb.filter((p) => !pa.includes(p))} −${pa.filter((p) => !pb.includes(p))}`);
  const sha = new Map(a!.files.map((f) => [f.path, f.sha256]));
  const changed = b!.files.filter((f) => sha.get(f.path) !== f.sha256).map((f) => f.path).sort();
  assert(JSON.stringify(changed) === JSON.stringify(CHANGED), `changed: ${changed.join(", ")}`);
});
await check("R3 FloatingCta.tsx differs in comments only; template.ts in comments + version 1.3.0 → 1.3.1 only", async () => {
  const [ca, cb] = await Promise.all([STEP5_RELEASE.id, polishId!].map((id) => releaseFile(id, `${V1}/sections/FloatingCta.tsx`)));
  assert(ca !== cb && code(ca!) === code(cb!), "FloatingCta.tsx code changed");
  const [ta, tb] = await Promise.all([STEP5_RELEASE.id, polishId!].map((id) => releaseFile(id, `${V1}/template.ts`)));
  assert(code(tb!).split('version: "1.3.1"').length === 2, "template.ts version");
  assert(code(ta!) === code(tb!).replace('version: "1.3.1"', 'version: "1.3.0"'), "template.ts code changed beyond the version");
});
await check("R4 stylesheet: the one floating seat (fixed, safe-area fallback, z-index, --i1-float-*), bar hidden when a track fits, no new url()/@import/@font-face", async () => {
  const [sa, sb] = await Promise.all([STEP5_RELEASE.id, polishId!].map((id) => releaseFile(id, `${V1}/styles/template.css`)));
  const seat = /\n\.i1-fcta \{([^}]*)\}/.exec(sb!)?.[1] ?? "";
  for (const d of [
    "position: fixed;",
    "right: calc(var(--i1-float-right) + env(safe-area-inset-right, 0px));",
    "bottom: calc(var(--i1-float-bottom) + env(safe-area-inset-bottom, 0px));",
  ]) assert(seat.includes(d), `seat lacks ${d}`);
  assert(/z-index:\s*\d+;/.test(seat), "seat z-index");
  for (const v of ["--i1-float-right", "--i1-float-bottom", "--i1-float-height"]) assert(new RegExp(`:root \\{[^}]*${v}:`).test(sb!), `${v} undefined`);
  // no other rule moves the seat (its position is the tokens' job at every width)
  const moves = [...sb!.matchAll(/([^{}]*\.i1-fcta)\s*\{([^}]*)\}/g)].filter((m) => /(^|;)\s*(position|top|right|bottom|left|inset)\s*:/.test(m[2]!));
  assert(moves.length === 1, `rules positioning .i1-fcta: ${moves.map((m) => m[1]!.trim()).join(" | ")}`);
  assert(/\.i1-track\[data-scrollable="false"\] \.i1-track__bar \{\s*display: none;/.test(sb!), "bar not display:none when the track fits");
  for (const re of [/url\(/g, /@import/g, /@font-face/g]) assert((sa!.match(re) ?? []).length === (sb!.match(re) ?? []).length, `${re} count changed`);
});

// --------------------------------------------------------------- packages --
const cur = Object.fromEntries(await Promise.all(SITES.map(async (s) => [s, await pointer(s, "current")] as const)));
const prev = Object.fromEntries(await Promise.all(SITES.map(async (s) => [s, await pointer(s, "previous").catch(() => undefined)] as const)));
if (later) {
  console.log(`\n[packages] skipped — a later release (${newPin.releaseId}) is current; the 1.3.0/1.3.1 packages are no longer retained`);
} else {
  console.log("\n[packages] 1.3.1 packages against the retained 1.3.0 (rollback) packages");
  await check("P1 every site: current built with the polish release, previous = its 1.3.0 package, both intact", async () => {
    for (const s of SITES) {
      assert(cur[s]!.record.template.releaseId === polishId, `${s}: current built with ${cur[s]!.record.template.releaseId}`);
      assert(prev[s]?.record.template.releaseId === STEP5_RELEASE.id, `${s}: previous built with ${prev[s]?.record.template.releaseId}`);
      assert((await packageIntact(cur[s]!.dir)) && (await packageIntact(prev[s]!.dir)), `${s}: package damaged`);
    }
  });
  await check("P2 output is stylesheet-only: every other file byte-identical to 1.3.0 (build id + stylesheet name normalised), one stylesheet that changed", async () => {
    for (const s of SITES) {
      const side = async (p: { site: string; record: { buildInputId: string } }) => {
        const files = await walkFiles(p.site);
        const css = files.filter((f) => f.endsWith(".css"));
        assert(css.length === 1, `${s}: ${css.length} stylesheets`);
        const id = p.record.buildInputId.slice(0, 32);
        const norm = (t: string) => t.split(id).join("BUILD").split(path.basename(css[0]!)).join("SHEET.css");
        return { files, css: css[0]!, norm };
      };
      const [a, b] = await Promise.all([side(prev[s]!), side(cur[s]!)]);
      const set = (x: typeof a) => x.files.map(x.norm).sort();
      assert(JSON.stringify(set(a!)) === JSON.stringify(set(b!)), `${s}: output file set changed`);
      const bByNorm = new Map(b!.files.map((f) => [b!.norm(f), f]));
      let compared = 0;
      for (const f of a!.files) {
        if (f === a!.css) continue;
        const g = bByNorm.get(a!.norm(f))!;
        const [x, y] = await Promise.all([readFile(path.join(prev[s]!.site, f)), readFile(path.join(cur[s]!.site, g))]);
        const same = TEXT.test(f) ? a!.norm(x.toString("utf8")) === b!.norm(y.toString("utf8")) : x.equals(y);
        assert(same, `${s}/${g} changed`);
        compared++;
      }
      assert(compared > 0, `${s}: nothing compared`);
      const [ca, cb] = await Promise.all([readFile(path.join(prev[s]!.site, a!.css), "utf8"), readFile(path.join(cur[s]!.site, b!.css), "utf8")]);
      assert(ca !== cb, `${s}: stylesheet unchanged`);
    }
  });
}

// ------------------------------------------------------------- throwaway --
const tmpRoot = await mkdtemp(path.join(os.tmpdir(), "polish-root-"));
if (later) console.log(`\n[integration] skipped — a later release (${newPin.releaseId}) is current; the fixture documents may have moved on`);
else console.log("\n[integration] 1.3.0 site documents stay valid");
try {
  if (!later) {
    await check("D every site's current documents re-pinned to 1.3.0 reproduce its 1.3.0 buildInputId (no content, setting or slot change)", async () => {
      await mkdir(path.join(tmpRoot, "data/sites"), { recursive: true });
      await symlink(path.join(repoRoot, "data/template-releases"), path.join(tmpRoot, "data/template-releases"));
      await symlink(path.join(repoRoot, "node_modules"), path.join(tmpRoot, "node_modules"));
      for (const s of SITES) {
        // the retained 1.3.0 package when there is one; its history record once it is pruned
        // (`at` only gates scheduled items, and fixtures schedule nothing near either time)
        const rec = (await history(s)).filter((r) => r.status === "success" && r.releaseId === STEP5_RELEASE.id).at(-1);
        const want = prev[s]?.record.template.releaseId === STEP5_RELEASE.id ? { id: prev[s]!.record.buildInputId as string, at: prev[s]!.record.at as string } : rec && { id: rec.buildInputId, at: rec.finishedAt };
        assert(want, `${s}: no recorded 1.3.0 build`);
        const dir = path.join(tmpRoot, "data/sites", s);
        await cp(path.join(repoRoot, "data/sites", s), dir, { recursive: true });
        const site = await readJson(path.join(dir, "site.json"));
        site.template = { templateId: "interior-01", templateVersion: "1.3.0", releaseId: STEP5_RELEASE.id, releaseHash: STEP5_RELEASE.hash };
        await writeFile(path.join(dir, "site.json"), `${JSON.stringify(site, null, 2)}\n`);
        const { buildInputId } = await prepareSiteInput({ repoRoot: tmpRoot, siteId: s, mode: "public", at: want.at });
        assert(buildInputId === want.id, `${s}: ${buildInputId} ≠ 1.3.0 build ${want.id}`);
      }
    });
  }
} finally {
  await rm(tmpRoot, { recursive: true, force: true });
}

console.log(`\npolish: ${passed} passed, ${failed.length} failed`);
if (failed.length) {
  for (const f of failed) console.log(`  - ${f}`);
  process.exit(1);
}
