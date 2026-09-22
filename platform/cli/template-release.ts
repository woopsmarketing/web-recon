/**
 * pnpm template:release interior-01@1
 * Creates (or verifies and reuses) the immutable, content-addressed Release of
 * templates/<id>/v<major>/ + platform/ + the scoped runtime manifest/lockfile.
 */
import { readdir } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { readFile } from "node:fs/promises";
import { createRelease, gateTemplateSources } from "../release/release";
import { SITES_DIR } from "../site/load";
import type { TemplateManifest } from "../site/template-manifest";

const ref = process.argv[2];
const m = /^([a-z0-9]+(?:-[a-z0-9]+)*)@(\d+)$/.exec(ref ?? "");
if (!m) {
  console.error("usage: pnpm template:release <templateId>@<major>   e.g. interior-01@1");
  process.exit(2);
}
const [, templateId, majorText] = m as unknown as [string, string, string];
const major = Number(majorText);
const repoRoot = process.cwd();
const siteIdsForGate = await readdir(path.join(repoRoot, SITES_DIR)).catch(() => [] as string[]);
// Gate BEFORE executing any template code (the manifest import below runs template.ts).
const provenance = JSON.parse(await readFile(path.join(repoRoot, "templates", templateId, `v${major}`, "provenance.json"), "utf8")) as { forbiddenTerms: string[] };
const pre = await gateTemplateSources(repoRoot, templateId, major, siteIdsForGate, provenance.forbiddenTerms);
if (pre.length) {
  console.error(`template:release gates failed:\n${pre.map((f) => `  ${f.file}: ${f.why}`).join("\n")}`);
  process.exit(1);
}
const manifestFile = path.join(repoRoot, "templates", templateId, `v${major}`, "template.ts");
const manifest = ((await import(pathToFileURL(manifestFile).href)) as { default: TemplateManifest }).default;
if (manifest.id !== templateId) throw new Error(`manifest id ${manifest.id} ≠ ${templateId}`);
const siteIds = await readdir(path.join(repoRoot, SITES_DIR)).catch(() => [] as string[]);

const res = await createRelease({ repoRoot, templateId, major, templateVersion: manifest.version, siteIds, now: new Date().toISOString() });
console.log(
  JSON.stringify(
    {
      status: res.created ? "created" : "exists-verified",
      templateId: res.record.templateId,
      templateVersion: res.record.templateVersion,
      releaseId: res.record.releaseId,
      releaseHash: res.record.releaseHash,
      templateSourceHash: res.record.templateSourceHash,
      files: res.record.files.length,
      dir: path.relative(repoRoot, res.dir),
    },
    null,
    2,
  ),
);
