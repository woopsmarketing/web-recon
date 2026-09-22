// Pre-cut capture for the interior-01 1.5.2 work (same shape as proof-151/before.json, plus the
// demo's settings/business documents). Run from the repo root BEFORE any 1.5.2 change:
//   node docs/result/outreach-demo-151-to-152/proof/capture-before.mjs > docs/result/outreach-demo-151-to-152/proof/before.json
import { createHash } from "node:crypto";
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";

const root = process.cwd();
const sha256 = (b) => createHash("sha256").update(b).digest("hex");
async function walk(dir, rel = "") {
  const out = [];
  for (const e of await readdir(dir, { withFileTypes: true })) {
    if (e.name === ".DS_Store") continue;
    const r = rel ? `${rel}/${e.name}` : e.name;
    if (e.isDirectory()) out.push(...(await walk(path.join(dir, e.name), r)));
    else out.push(r);
  }
  return out.sort();
}
const hashTree = async (dir, skip = () => false) =>
  Object.fromEntries(await Promise.all((await walk(dir)).filter((f) => !skip(f)).map(async (f) => [f, sha256(await readFile(path.join(dir, f)))])));
const json = async (f) => JSON.parse(await readFile(path.join(root, f), "utf8"));

const relRoot = path.join(root, "data/template-releases/interior-01");
const releaseDirs = (await readdir(relRoot)).filter((d) => d.startsWith("interior-01-")).sort();
const releases = {};
for (const d of releaseDirs) releases[d] = await hashTree(path.join(relRoot, d));
const demo = "data/sites/boost-interior-demo";
const fixturePointers = {};
for (const s of ["fixture-large", "fixture-small", "fixture-empty"]) fixturePointers[s] = await json(`data/site-builds/${s}/current.json`);
const out = {
  capturedAt: new Date().toISOString(),
  releaseDirs,
  releases,
  siteFiles: await hashTree(path.join(root, demo)),
  siteJson: await json(`${demo}/site.json`),
  slotsJson: await json(`${demo}/slots.json`),
  settingsJson: await json(`${demo}/settings.json`),
  businessJson: await json(`${demo}/content/business.json`),
  currentPointer: await json("data/site-builds/boost-interior-demo/current.json"),
  previousPointer: await json("data/site-builds/boost-interior-demo/previous.json"),
  fixturePointers,
  fixtureSites: Object.fromEntries(await Promise.all(["fixture-large", "fixture-small", "fixture-empty"].map(async (s) => [s, await hashTree(path.join(root, "data/sites", s))]))),
  platformFiles: await hashTree(path.join(root, "platform"), (f) => f.startsWith("test/")),
  templateFiles: await hashTree(path.join(root, "templates/interior-01/v1"), (f) => f.startsWith("node_modules/") || f.startsWith(".next/") || f.startsWith("out/")),
};
process.stdout.write(`${JSON.stringify(out, null, 2)}\n`);
