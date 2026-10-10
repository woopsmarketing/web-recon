/**
 * The TEMPLATE CATALOG export — `pnpm test:template-catalog`.
 *
 *   [schema]    the generated catalog.json has the contract's shape (site-template-catalog@1) and every field is the right type
 *   [releases]  every release in the store appears exactly once, newest first; the portfolio runtime answer is the resolver's
 *               (interior-01 1.7.0, interior-02 1.1.0 (legacy-inferred), interior-03 1.1.0 supported; the older ones not)
 *   [previews]  sha256 / width / height are those of the files; a missing picture is null
 *   [starter]   `starter` follows data/site-starters/<templateId>/starter.json (a temp one here); no file = false everywhere
 *   [refusals]  a metadata file with an unknown key, an unknown template id, a wrong templateId, too few features is refused
 *   [cli]       --out writes only catalog.json + previews/*, is deterministic; --check passes on a fresh export and detects drift
 *
 * Reads the repository; writes only under the OS temp directory. No network, no build, no browser.
 */
import { spawnSync } from "node:child_process";
import { copyFile, mkdir, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { CATALOG_META_DIR, CATALOG_SCHEMA, CatalogError, buildCatalog, jpegSize, serializeCatalog, type Catalog } from "../catalog/catalog";
import { RELEASES_DIR } from "../release/release";
import { sha256 } from "../util/hash";

const repoRoot = process.cwd();
const FIXED = { generatedAt: "2026-01-01T00:00:00.000Z", sourceCommit: "0".repeat(40) };
const TEMPLATES = ["interior-01", "interior-02", "interior-03"];

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
const eq = (a: unknown, b: unknown, msg: string) => assert(JSON.stringify(a) === JSON.stringify(b), `${msg}: ${JSON.stringify(a)} ≠ ${JSON.stringify(b)}`);
async function refusal(run: () => unknown | Promise<unknown>, label: string): Promise<string> {
  try {
    await run();
  } catch (error) {
    assert(error instanceof CatalogError, `${label}: expected CatalogError, got ${(error as Error).name}: ${(error as Error).message}`);
    return error.message;
  }
  throw new Error(`${label}: expected a refusal`);
}
async function dirs(dir: string): Promise<string[]> {
  return (await readdir(dir, { withFileTypes: true })).filter((e) => e.isDirectory()).map((e) => e.name).sort();
}

const tmp = await mkdtemp(path.join(os.tmpdir(), "template-catalog-"));
const metaSrc = path.join(repoRoot, CATALOG_META_DIR);
/** a private copy of the presentation files (+ previews) that a test may break */
async function metaCopy(name: string): Promise<string> {
  const dir = path.join(tmp, name);
  await mkdir(path.join(dir, "previews"), { recursive: true });
  for (const f of await readdir(metaSrc)) if (f.endsWith(".json")) await copyFile(path.join(metaSrc, f), path.join(dir, f));
  for (const f of await readdir(path.join(metaSrc, "previews"))) await copyFile(path.join(metaSrc, "previews", f), path.join(dir, "previews", f));
  return dir;
}
const noStarters = path.join(tmp, "no-starters");

try {
  const built = await buildCatalog({ repoRoot, startersDir: noStarters, ...FIXED });
  const { catalog } = built;
  const store: Record<string, string[]> = {};
  for (const t of await dirs(path.join(repoRoot, RELEASES_DIR))) store[t] = await dirs(path.join(repoRoot, RELEASES_DIR, t));

  await check("S1 schema: site-template-catalog@1, ISO generatedAt, sourceCommit, templates with the contract's fields", () => {
    eq(Object.keys(catalog), ["schema", "generatedAt", "sourceCommit", "templates"], "top-level keys");
    assert(catalog.schema === CATALOG_SCHEMA && CATALOG_SCHEMA === "site-template-catalog@1", "schema");
    assert(!Number.isNaN(Date.parse(catalog.generatedAt)), "generatedAt");
    eq(catalog.templates.map((t) => t.templateId), TEMPLATES, "templates sorted by id");
    for (const t of catalog.templates) {
      eq(Object.keys(t), ["templateId", "displayName", "tagline", "description", "features", "demoUrl", "previews", "releases"], `${t.templateId} keys`);
      assert(t.features.length >= 3 && t.features.length <= 5, `${t.templateId} features`);
      assert([t.displayName, t.tagline, t.description, ...t.features].every((s) => typeof s === "string" && s.trim().length > 0), `${t.templateId} texts`);
      assert(/^https:\/\/interior-demo(-\d)?\.boostweb\.co\.kr$/.test(t.demoUrl), `${t.templateId} demoUrl ${t.demoUrl}`);
      for (const r of t.releases) {
        eq(Object.keys(r), ["releaseId", "templateVersion", "releaseHash", "portfolioRuntime", "starter"], `${r.releaseId} keys`);
        assert(/^[0-9a-f]{64}$/.test(r.releaseHash) && r.releaseId.endsWith(r.releaseHash.slice(0, 12)), `${r.releaseId} hash`);
        assert(typeof r.starter === "boolean", `${r.releaseId} starter`);
      }
    }
  });

  await check("S2 the demo URLs are the ones the demo sites pin: Demo 01 → interior-01, 02 → interior-02, 03 → interior-03", async () => {
    const pins: Record<string, string> = { "boost-interior-demo": "interior-01", "boost-interior-demo-02": "interior-02", "boost-interior-demo-03": "interior-03" };
    for (const [site, templateId] of Object.entries(pins)) {
      const json = JSON.parse(await readFile(path.join(repoRoot, "data/sites", site, "site.json"), "utf8")) as { identity: { publicOrigin: string }; template: { templateId: string } };
      assert(json.template.templateId === templateId, `${site} pins ${json.template.templateId}`);
      const entry = catalog.templates.find((t) => t.templateId === templateId);
      assert(entry?.demoUrl === json.identity.publicOrigin, `${templateId} demoUrl ${entry?.demoUrl} ≠ ${json.identity.publicOrigin}`);
    }
  });

  await check("R1 every release of the store appears exactly once, newest version first", () => {
    for (const [templateId, ids] of Object.entries(store)) {
      const t = catalog.templates.find((x) => x.templateId === templateId);
      assert(t, `${templateId} missing`);
      eq(t.releases.map((r) => r.releaseId).sort(), [...ids].sort(), `${templateId} release set`);
      assert(new Set(t.releases.map((r) => r.releaseId)).size === t.releases.length, `${templateId} duplicates`);
      const key = (v: string) => v.split(".").map(Number);
      for (let i = 1; i < t.releases.length; i++) {
        const [a, b] = [key(t.releases[i - 1].templateVersion), key(t.releases[i].templateVersion)];
        assert(a[0] > b[0] || (a[0] === b[0] && (a[1] > b[1] || (a[1] === b[1] && a[2] >= b[2]))), `${templateId} order at ${i}`);
      }
    }
    eq(catalog.templates.map((t) => t.templateId), Object.keys(store), "templates = the store's templates");
  });

  await check("R2 portfolio runtime: interior-01 1.7.0, interior-02 1.1.0 (legacy-inferred), interior-03 1.1.0 supported; older releases without the capability are not", () => {
    const rel = (id: string, version: string) => catalog.templates.find((t) => t.templateId === id)!.releases.filter((r) => r.templateVersion === version);
    for (const [id, v] of [["interior-01", "1.7.0"], ["interior-02", "1.1.0"], ["interior-03", "1.1.0"]] as const) {
      const rs = rel(id, v);
      assert(rs.length === 1, `${id} ${v}`);
      eq(rs[0].portfolioRuntime, { supported: true, contract: "portfolio-runtime@1" }, `${id} ${v}`);
    }
    for (const r of rel("interior-02", "1.0.0").concat(rel("interior-02", "1.0.1"), rel("interior-03", "1.0.0"), rel("interior-01", "1.6.3"), rel("interior-01", "1.0.0"))) {
      eq(r.portfolioRuntime, { supported: false, contract: null }, `${r.releaseId}`);
    }
  });

  await check("P1 previews: sha256 / width / height match the files; desktop is 1440 wide, mobile 780 (390 css px at 2x); every file <= 450 KB", async () => {
    for (const t of catalog.templates) {
      for (const kind of ["desktop", "mobile"] as const) {
        const p = t.previews[kind];
        assert(p, `${t.templateId} ${kind} preview missing`);
        assert(p.file === `previews/${t.templateId}-${kind}.jpg`, `${p.file}`);
        const bytes = await readFile(path.join(metaSrc, p.file));
        assert(p.sha256 === sha256(bytes), `${p.file} sha256`);
        eq(jpegSize(bytes), { width: p.width, height: p.height }, `${p.file} size`);
        assert(p.width === (kind === "desktop" ? 1440 : 780), `${p.file} width ${p.width}`);
        assert(bytes.byteLength <= 450 * 1024, `${p.file} ${bytes.byteLength} bytes`);
        assert(built.previews.get(p.file)?.equals(bytes), `${p.file} in the export set`);
      }
    }
    eq([...built.previews.keys()].length, TEMPLATES.length * 2, "preview count");
  });

  await check("P2 a picture that does not exist is null, and a file that is not a JPEG is refused", async () => {
    const dir = await metaCopy("p2");
    await rm(path.join(dir, "previews", "interior-03-mobile.jpg"));
    const c = (await buildCatalog({ repoRoot, metaDir: dir, startersDir: noStarters, ...FIXED })).catalog;
    const t3 = c.templates.find((t) => t.templateId === "interior-03")!;
    assert(t3.previews.mobile === null && t3.previews.desktop !== null, "null only for the missing one");
    await writeFile(path.join(dir, "previews", "interior-03-mobile.jpg"), "not a jpeg");
    await refusal(() => buildCatalog({ repoRoot, metaDir: dir, startersDir: noStarters, ...FIXED }), "non-JPEG");
  });

  await check("T1 without any starter file `starter` is false for every release", () => {
    assert(catalog.templates.every((t) => t.releases.every((r) => r.starter === false)), "a starter without a starter file");
  });

  await check("T2 `starter` = releaseIds.includes(releaseId) of data/site-starters/<templateId>/starter.json", async () => {
    const dir = path.join(tmp, "starters");
    await mkdir(path.join(dir, "interior-02"), { recursive: true });
    await mkdir(path.join(dir, "interior-03"), { recursive: true });
    const i2 = store["interior-02"][0];
    const i3 = store["interior-03"];
    await writeFile(path.join(dir, "interior-02", "starter.json"), JSON.stringify({ schema: "site-starter@1", templateId: "interior-02", releaseIds: [i2] }));
    await writeFile(path.join(dir, "interior-03", "starter.json"), JSON.stringify({ schema: "site-starter@1", templateId: "interior-03", releaseIds: i3 }));
    const c = (await buildCatalog({ repoRoot, startersDir: dir, ...FIXED })).catalog;
    for (const t of c.templates) {
      for (const r of t.releases) {
        const want = (t.templateId === "interior-02" && r.releaseId === i2) || t.templateId === "interior-03";
        assert(r.starter === want, `${r.releaseId} starter=${r.starter}, want ${want}`);
      }
    }
    // a starter file that names a release the store does not have, a wrong templateId, an unknown key: refused
    const bad = async (body: unknown) => {
      await writeFile(path.join(dir, "interior-02", "starter.json"), JSON.stringify(body));
      await refusal(() => buildCatalog({ repoRoot, startersDir: dir, ...FIXED }), JSON.stringify(body));
    };
    await bad({ schema: "site-starter@1", templateId: "interior-02", releaseIds: ["interior-02-9.9.9-000000000000"] });
    await bad({ schema: "site-starter@1", templateId: "interior-01", releaseIds: [] });
    await bad({ schema: "site-starter@1", templateId: "interior-02", releaseIds: [], extra: 1 });
  });

  await check("M1 a metadata file with an unknown key, a wrong templateId, too few features or a non-https demo URL is refused; so is an unknown template id and a template without metadata", async () => {
    const mutate = async (name: string, fn: (m: Record<string, unknown>) => void) => {
      const dir = await metaCopy(name);
      const file = path.join(dir, "interior-02.json");
      const m = JSON.parse(await readFile(file, "utf8")) as Record<string, unknown>;
      fn(m);
      await writeFile(file, JSON.stringify(m));
      return refusal(() => buildCatalog({ repoRoot, metaDir: dir, startersDir: noStarters, ...FIXED }), name);
    };
    assert(/interior-02/.test(await mutate("m-unknown-key", (m) => { m.marketing = "x"; })), "unknown key message");
    await mutate("m-wrong-id", (m) => { m.templateId = "interior-03"; });
    await mutate("m-features", (m) => { m.features = ["a", "b"]; });
    await mutate("m-http", (m) => { m.demoUrl = "http://interior-demo-2.boostweb.co.kr"; });
    await mutate("m-preview-key", (m) => { (m.previewFiles as Record<string, string>).tablet = "x.jpg"; });
    const unknown = await metaCopy("m-unknown-template");
    await writeFile(path.join(unknown, "interior-99.json"), (await readFile(path.join(unknown, "interior-02.json"), "utf8")).replace(/interior-02/g, "interior-99"));
    assert(/no release of template "interior-99"/.test(await refusal(() => buildCatalog({ repoRoot, metaDir: unknown, startersDir: noStarters, ...FIXED }), "unknown template id")), "unknown id message");
    const missing = await metaCopy("m-missing");
    await rm(path.join(missing, "interior-03.json"));
    assert(/interior-03.*no .*interior-03\.json/.test(await refusal(() => buildCatalog({ repoRoot, metaDir: missing, startersDir: noStarters, ...FIXED }), "missing metadata")), "missing metadata message");
  });

  await check("D1 deterministic: two builds differ only in generatedAt", async () => {
    const a = (await buildCatalog({ repoRoot, startersDir: noStarters, ...FIXED })).catalog;
    const b = (await buildCatalog({ repoRoot, startersDir: noStarters, ...FIXED, generatedAt: "2027-01-01T00:00:00.000Z" })).catalog;
    assert(serializeCatalog(a) === serializeCatalog({ ...b, generatedAt: a.generatedAt }), "outputs differ");
  });

  const cli = (...args: string[]) => spawnSync(path.join(repoRoot, "node_modules/.bin/tsx"), ["--tsconfig", "platform/tsconfig.json", "platform/cli/site-template-catalog.ts", ...args], { cwd: repoRoot, encoding: "utf8" });

  await check("C1 CLI --out writes exactly catalog.json + previews/*.jpg (nothing else is created, a foreign file is left alone, a stale preview goes); --check passes on it and ignores generatedAt", async () => {
    const out = path.join(tmp, "out");
    await mkdir(path.join(out, "previews"), { recursive: true });
    await writeFile(path.join(out, "README.md"), "mine");
    await writeFile(path.join(out, "previews", "stale.jpg"), "x");
    const r = cli("--out", out);
    assert(r.status === 0, `--out exit ${r.status}: ${r.stderr}`);
    eq((await readdir(out)).sort(), ["README.md", "catalog.json", "previews"], "out entries");
    eq((await readdir(path.join(out, "previews"))).sort(), TEMPLATES.flatMap((t) => [`${t}-desktop.jpg`, `${t}-mobile.jpg`]), "preview files");
    assert((await readFile(path.join(out, "README.md"), "utf8")) === "mine", "foreign file touched");
    const written = JSON.parse(await readFile(path.join(out, "catalog.json"), "utf8")) as Catalog;
    assert(written.schema === CATALOG_SCHEMA && /^[0-9a-f]{40}$/.test(written.sourceCommit), "written catalog");
    const ok = cli("--check", out);
    assert(ok.status === 0, `--check on a fresh export: exit ${ok.status}: ${ok.stderr}`);
    await writeFile(path.join(out, "catalog.json"), serializeCatalog({ ...written, generatedAt: "2020-01-01T00:00:00.000Z" }));
    assert(cli("--check", out).status === 0, "generatedAt must be ignored");
  });

  await check("C2 CLI --check detects drift: an edited catalog.json, a changed preview, a missing preview, an extra preview, a missing catalog.json; usage errors exit 2", async () => {
    const out = path.join(tmp, "out");
    const good = await readFile(path.join(out, "catalog.json"), "utf8");
    const drift = async (label: string, apply: () => Promise<void>, restore: () => Promise<void>) => {
      await apply();
      const r = cli("--check", out);
      assert(r.status === 1, `${label}: exit ${r.status} (wanted 1)`);
      await restore();
      assert(cli("--check", out).status === 0, `${label}: restore did not heal`);
    };
    const pv = path.join(out, "previews", "interior-01-desktop.jpg");
    const pvBytes = await readFile(pv);
    await drift("catalog edit", () => writeFile(path.join(out, "catalog.json"), good.replace("Interior 01", "Interior 1")), () => writeFile(path.join(out, "catalog.json"), good));
    await drift("preview changed", () => writeFile(pv, Buffer.concat([pvBytes, Buffer.from([0])])), () => writeFile(pv, pvBytes));
    await drift("preview missing", () => rm(pv), () => writeFile(pv, pvBytes));
    await drift("extra preview", () => writeFile(path.join(out, "previews", "extra.jpg"), "x"), () => rm(path.join(out, "previews", "extra.jpg")));
    await drift("catalog missing", () => rm(path.join(out, "catalog.json")), () => writeFile(path.join(out, "catalog.json"), good));
    assert(cli().status === 2 && cli("--out", out, "--check", out).status === 2 && cli("--bogus").status === 2, "usage errors");
  });
} finally {
  await rm(tmp, { recursive: true, force: true });
}

console.log(`\n${passed} passed, ${failed.length} failed`);
if (failed.length > 0) process.exit(1);
