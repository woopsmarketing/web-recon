import { cp, mkdir, readFile, readdir, symlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { createRelease, RELEASES_DIR } from "../../release/release";
import { templateDesign } from "../templates";

/**
 * A disposable SITE ROOT for design work — a directory shaped like the repository, outside it:
 *
 *   <root>/templates/<templateId>/      a copy of the WORKING TREE Template
 *   <root>/platform/…                   the platform files a release is cut from (copies)
 *   <root>/data/template-releases/      every stored release of the Template (links) + the DEV
 *                                       RELEASE cut here from the working tree
 *   <root>/data/site-starters/          the Template's starter, listing the dev release too
 *   <root>/data/sites/                  fixture sites (make-fixture.ts)
 *   <root>/data/site-builds/            their packages
 *   <root>/node_modules                 link to the checkout's
 *
 * The site builder, the release store and the scaffold all take a `repoRoot`; given this root they
 * never touch data/sites, data/site-builds or data/template-releases of the checkout. Cutting the
 * dev release runs every release gate on the working tree (source scan, forbidden terms, the
 * portfolio-runtime-kit gate: the kit is bundled from the cut files and rendered once).
 *
 * `templateVersion` cuts the dev release AS another version than the working tree's manifest holds
 * (a test of what a release line that does not exist yet must do — a preset's `minRelease`, say):
 * the version line of the root's COPY of template.ts is rewritten before the cut, so the release
 * describes its own code. The checkout's template.ts is never touched.
 */
const STARTERS_DIR = "data/site-starters";
/** what a release is cut from besides the Template directory (platform/release/release.ts) */
const PLATFORM_FILES = ["content", "settings", "theme", "assets", "slots", "site", "tsconfig.json", "runtime/package.json", "runtime/pnpm-lock.yaml"];
const NOW = "2026-10-12T00:00:00.000Z";

export interface ReleasePin {
  templateId: string;
  templateVersion: string;
  releaseId: string;
  releaseHash: string;
}

export interface DesignRoot {
  root: string;
  templateId: string;
  /** the release cut from the working tree */
  dev: ReleasePin;
  /** every other release of the Template in the root's store, by id */
  stored: Record<string, ReleasePin>;
}

export async function makeDesignRoot(opts: { repoRoot: string; root: string; templateId: string; templateVersion?: string }): Promise<DesignRoot> {
  const { repoRoot, root, templateId } = opts;
  const design = templateDesign(templateId);
  await mkdir(path.join(root, "data/sites"), { recursive: true });
  await mkdir(path.join(root, "data/site-builds"), { recursive: true });
  await symlink(path.join(repoRoot, "node_modules"), path.join(root, "node_modules"));
  await cp(path.join(repoRoot, "templates", templateId), path.join(root, "templates", templateId), {
    recursive: true,
    filter: (src) => !/(^|\/)(node_modules|\.next|out)(\/|$)/.test(src.slice(repoRoot.length)),
  });
  for (const f of PLATFORM_FILES) await cp(path.join(repoRoot, "platform", f), path.join(root, "platform", f), { recursive: true });

  const store = path.join(root, RELEASES_DIR, templateId);
  await mkdir(store, { recursive: true });
  const stored: DesignRoot["stored"] = {};
  for (const e of await readdir(path.join(repoRoot, RELEASES_DIR, templateId), { withFileTypes: true }).catch(() => [])) {
    if (!e.isDirectory()) continue;
    await symlink(path.join(repoRoot, RELEASES_DIR, templateId, e.name), path.join(store, e.name));
    const record = JSON.parse(await readFile(path.join(repoRoot, RELEASES_DIR, templateId, e.name, "release.json"), "utf8")) as ReleasePin;
    stored[e.name] = { templateId, templateVersion: record.templateVersion, releaseId: record.releaseId, releaseHash: record.releaseHash };
  }

  const manifest = ((await import(pathToFileURL(path.join(repoRoot, design.dir, "template.ts")).href)) as { default: { version: string } }).default;
  const templateVersion = opts.templateVersion ?? manifest.version;
  if (templateVersion !== manifest.version) {
    if (!/^\d+\.\d+\.\d+$/.test(templateVersion)) throw new Error(`design root: "${templateVersion}" is not a template version`);
    const file = path.join(root, design.dir, "template.ts");
    const source = await readFile(file, "utf8");
    const line = `version: "${manifest.version}",`;
    if (source.split(line).length !== 2) throw new Error(`design root: ${design.dir}/template.ts does not hold exactly one \`${line}\``);
    await writeFile(file, source.replace(line, `version: "${templateVersion}",`));
  }
  const cut = await createRelease({ repoRoot: root, templateId, major: design.major, templateVersion, siteIds: [], now: NOW });
  const dev: ReleasePin = { templateId, templateVersion: cut.record.templateVersion, releaseId: cut.record.releaseId, releaseHash: cut.record.releaseHash };

  await cp(path.join(repoRoot, STARTERS_DIR, templateId), path.join(root, STARTERS_DIR, templateId), { recursive: true });
  const starterFile = path.join(root, STARTERS_DIR, templateId, "starter.json");
  const starter = JSON.parse(await readFile(starterFile, "utf8")) as { releaseIds: string[] };
  if (!starter.releaseIds.includes(dev.releaseId)) starter.releaseIds.push(dev.releaseId);
  await writeFile(starterFile, `${JSON.stringify(starter, null, 2)}\n`);
  return { root, templateId, dev, stored };
}
