/**
 * pnpm smoke:registry — Task 27 template/site registry (src/registry/).
 *
 * Two halves:
 *   1. READ-ONLY over the real `data/` tree — the scan must derive the actual
 *      shipped artifacts (a compiler-v3 policied template, a compiler-v2 one,
 *      the five release projects incl. two pre-Task-27 documents).
 *   2. WRITE inside a throwaway scratch data root (`data/.smoke-registry-<pid>`),
 *      built by copying those artifacts, where register/list/read/rebuild and
 *      the artifact-wins rule are exercised. Nothing under the real namespaces
 *      is written: the real tree is byte-checked untouched at the end.
 */
import { cp, mkdir, readFile, readdir, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";

import {
  entriesAgree,
  listHosts,
  listSites,
  listTemplates,
  loadSiteRegistry,
  loadTemplateRegistry,
  readSite,
  readTemplate,
  rebuildRegistry,
  registerSite,
  registerTemplate,
  registryDir,
  scanSites,
  scanTemplates,
  siteRegistryFile,
  siteRegistryWarnings,
  sitesWithSiteId,
  templateEntryFromDisk,
  templateRegistryFile,
  type RegistryOptions,
} from "../src/registry/index.js";
import { commitAuthoredState } from "../src/release/revisions.js";
import { loadReleaseProject } from "../src/release/store.js";

const REAL_ROOT = "data";
const POLICIED_TEMPLATE = path.join(
  REAL_ROOT,
  "stripe.com",
  "recon-templates",
  "2026-08-26T17-16-46-409Z",
);
const LEGACY_TEMPLATE = path.join(
  REAL_ROOT,
  "stripe.com",
  "recon-templates",
  "2026-08-18T10-45-40-007Z",
);
const AUTHORED_PROJECT = path.join(REAL_ROOT, "linear.app", "release-projects", "flowpilot-wr27");
const LEGACY_PROJECT_A = path.join(
  REAL_ROOT,
  "linear.app",
  "release-projects",
  "linear.app-2026-08-25T23-32-42-075Z",
);
const LEGACY_PROJECT_B = path.join(
  REAL_ROOT,
  "linear.app",
  "release-projects",
  "linear.app-2026-08-25T23-54-21-435Z",
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

/** Only the two files the registry reads — a 52 MB template copy is pointless. */
async function copyTemplateHead(from: string, to: string): Promise<void> {
  await mkdir(to, { recursive: true });
  for (const file of ["manifest.json", "site-map.json"]) {
    await cp(path.join(from, file), path.join(to, file));
  }
}

async function main(): Promise<void> {
  const scratch = path.join(REAL_ROOT, `.smoke-registry-${process.pid}`);
  const opts: RegistryOptions = { dataRoot: scratch };

  const beforeReal = {
    policied: await snapshotTree(POLICIED_TEMPLATE),
    legacyTemplate: await snapshotTree(LEGACY_TEMPLATE),
    authored: await snapshotTree(AUTHORED_PROJECT),
    legacyA: await snapshotTree(LEGACY_PROJECT_A),
    legacyB: await snapshotTree(LEGACY_PROJECT_B),
  };

  try {
    // ---- 1. derivation from the REAL artifacts (read only) -----------------
    section("derives the real artifacts on disk");
    const policied = await templateEntryFromDisk(POLICIED_TEMPLATE);
    check(
      "27B.1 compiler-v3 template entry carries the policy split from manifest.json",
      policied.templateId === "stripe.com-2026-08-26T17-16-46-409Z" &&
        policied.routePolicyApplied &&
        policied.routeCount === 20 &&
        policied.slotizedRouteCount === 10 &&
        policied.structureOnlyRouteCount === 10 &&
        policied.slotCount === 4661,
      JSON.stringify({
        applied: policied.routePolicyApplied,
        routes: policied.routeCount,
        slotized: policied.slotizedRouteCount,
        structureOnly: policied.structureOnlyRouteCount,
        slots: policied.slotCount,
      }),
    );
    check(
      "27B.2 collections are summarized from site-map.json, not re-derived",
      policied.collections.length === 3 &&
        policied.collections.every((c) => c.countIsFloor) &&
        policied.collections.some(
          (c) => c.groupedBy === "scope:resources" && c.reconstructedRoutes === 11,
        ),
      JSON.stringify(policied.collections.map((c) => `${c.groupedBy}:${c.reconstructedRoutes}`)),
    );
    const legacyTemplate = await templateEntryFromDisk(LEGACY_TEMPLATE);
    check(
      "27B.3 a pre-policy template indexes with the definitional split, no invented counts",
      !legacyTemplate.routePolicyApplied &&
        legacyTemplate.slotizedRouteCount === legacyTemplate.routeCount &&
        legacyTemplate.structureOnlyRouteCount === 0 &&
        legacyTemplate.collections.length === 0 &&
        legacyTemplate.slotCount === 9529,
      `${legacyTemplate.slotizedRouteCount}/${legacyTemplate.routeCount} slots=${legacyTemplate.slotCount}`,
    );
    const realTemplates = await scanTemplates();
    check(
      "27B.4 scanning the real data root finds both templates and warns on nothing",
      realTemplates.entries.some((e) => e.templateId === policied.templateId) &&
        realTemplates.entries.some((e) => e.templateId === legacyTemplate.templateId) &&
        realTemplates.warnings.length === 0,
      `${realTemplates.entries.length} templates, warnings ${JSON.stringify(realTemplates.warnings)}`,
    );
    const realSites = await scanSites();
    check(
      "27B.5 scanning the real data root indexes every release project, legacy included",
      realSites.entries.some((e) => e.siteKey === "linear.app/flowpilot-wr27") &&
        realSites.entries.some(
          (e) => e.siteKey === "linear.app/linear.app-2026-08-25T23-32-42-075Z",
        ) &&
        realSites.warnings.length === 0,
      `${realSites.entries.length} sites, warnings ${JSON.stringify(realSites.warnings)}`,
    );
    const realLegacy = realSites.entries.find(
      (e) => e.siteKey === "linear.app/linear.app-2026-08-25T23-32-42-075Z",
    );
    check(
      "27B.6 a revision-1 project is adapted in memory (siteId derived, adaptedFrom recorded)",
      realLegacy?.siteId === "linear.app" && realLegacy?.adaptedFromRevision === 1,
      JSON.stringify({ siteId: realLegacy?.siteId, from: realLegacy?.adaptedFromRevision }),
    );
    check(
      "27B.7 siteId collisions among adapted legacy projects are reported, not deduplicated",
      siteRegistryWarnings(realSites.entries).some((w) => w.startsWith("siteId linear.app is shared")),
      JSON.stringify(siteRegistryWarnings(realSites.entries)),
    );

    // ---- scratch tree ------------------------------------------------------
    const scratchPolicied = path.join(
      scratch,
      "stripe.com",
      "recon-templates",
      "2026-08-26T17-16-46-409Z",
    );
    const scratchLegacyTemplate = path.join(
      scratch,
      "stripe.com",
      "recon-templates",
      "2026-08-18T10-45-40-007Z",
    );
    await copyTemplateHead(POLICIED_TEMPLATE, scratchPolicied);
    await copyTemplateHead(LEGACY_TEMPLATE, scratchLegacyTemplate);
    const scratchAuthored = path.join(scratch, "linear.app", "release-projects", "flowpilot-wr27");
    const scratchLegacyA = path.join(
      scratch,
      "linear.app",
      "release-projects",
      "linear.app-2026-08-25T23-32-42-075Z",
    );
    const scratchLegacyB = path.join(
      scratch,
      "linear.app",
      "release-projects",
      "linear.app-2026-08-25T23-54-21-435Z",
    );
    await cp(AUTHORED_PROJECT, scratchAuthored, { recursive: true });
    await cp(LEGACY_PROJECT_A, scratchLegacyA, { recursive: true });
    await cp(LEGACY_PROJECT_B, scratchLegacyB, { recursive: true });

    // ---- 2. register / list / read ----------------------------------------
    section("register a template, list it, read it back");
    check(
      "27B.8 a registry with no index file lists nothing instead of throwing",
      (await listTemplates(opts)).length === 0 && (await listSites(opts)).length === 0,
    );
    const registered = await registerTemplate(scratchPolicied, opts);
    const listed = await listTemplates(opts);
    check(
      "27B.9 registerTemplate → listTemplates returns the entry it derived",
      listed.length === 1 && entriesAgree(listed[0], registered),
      `${listed.length} entries`,
    );
    const readBack = await readTemplate(registered.templateId, opts);
    check(
      "27B.10 readTemplate re-derives from the artifact and the cached entry agrees",
      readBack?.resolvedFrom === "artifact" &&
        readBack.registered &&
        readBack.indexAgreed &&
        entriesAgree(readBack.entry, registered),
      JSON.stringify({ from: readBack?.resolvedFrom, agreed: readBack?.indexAgreed }),
    );

    section("register a site, list it, read it back");
    // Give the copied project a real revision chain so the pointer is measured,
    // not assumed — no project on disk has one yet.
    const { project } = await loadReleaseProject(scratchAuthored);
    await commitAuthoredState(scratchAuthored, project.authored, { origin: "prepare" });
    const site = await registerSite(scratchAuthored, opts);
    check(
      "27B.11 registerSite carries siteId, template lineage, release state and revision head",
      site.siteId === "flowpilot-wr27" &&
        site.siteKey === "linear.app/flowpilot-wr27" &&
        site.templateLineage.templateId === "linear.app-2026-08-25T21-53-26-980Z" &&
        site.releaseState === "PRODUCTION_INPUTS_REQUIRED" &&
        site.revision?.revisionId === "r000" &&
        site.revision.revisionCount === 1,
      JSON.stringify({ state: site.releaseState, rev: site.revision?.revisionId }),
    );
    check(
      "27B.12 the site lists, and reads back by siteKey and by unambiguous siteId",
      (await listSites(opts)).length === 1 &&
        entriesAgree((await readSite(site.siteKey, opts))?.entry, site) &&
        entriesAgree((await readSite("flowpilot-wr27", opts))?.entry, site),
    );
    await registerSite(scratchLegacyA, opts);
    await registerSite(scratchLegacyB, opts);
    check(
      "27B.13 an ambiguous siteId resolves to nothing rather than to an arbitrary project",
      (await readSite("linear.app", opts)) === null &&
        (await sitesWithSiteId("linear.app", opts)).length === 2 &&
        (await loadSiteRegistry(opts)).warnings.some((w) => w.includes("linear.app")),
      JSON.stringify((await loadSiteRegistry(opts)).warnings),
    );

    // ---- 3. rebuild from disk ---------------------------------------------
    section("the index rebuilds from disk");
    await registerTemplate(scratchLegacyTemplate, opts);
    const beforeRebuildTemplates = await listTemplates(opts);
    const beforeRebuildSites = await listSites(opts);
    await rm(registryDir(opts), { recursive: true, force: true });
    check(
      "27B.14 deleting the index leaves an empty registry, not an error",
      (await listTemplates(opts)).length === 0 && (await listSites(opts)).length === 0,
    );
    const rebuilt = await rebuildRegistry(opts);
    check(
      "27B.15 rebuildRegistry restores byte-identical entries from the artifacts alone",
      entriesAgree(rebuilt.templates.entries, beforeRebuildTemplates) &&
        entriesAgree(rebuilt.sites.entries, beforeRebuildSites),
      `${rebuilt.templates.entries.length} templates / ${rebuilt.sites.entries.length} sites`,
    );
    check(
      "27B.16 the rebuilt index is on disk and reloads through its own schema",
      entriesAgree((await loadTemplateRegistry(opts)).entries, beforeRebuildTemplates) &&
        entriesAgree((await loadSiteRegistry(opts)).entries, beforeRebuildSites),
    );
    check(
      "27B.17 the registry namespace is hidden, so it is never scanned as a host",
      (await listHosts(opts)).every((h) => h !== ".registry") &&
        path.basename(registryDir(opts)) === ".registry",
      (await listHosts(opts)).join(","),
    );

    // ---- 4. disagreement resolves in the artifact's favour ------------------
    section("artifact wins over a stale entry");
    const templateIndex = JSON.parse(await readFile(templateRegistryFile(opts), "utf8"));
    const target = templateIndex.entries.find(
      (e: { templateId: string }) => e.templateId === registered.templateId,
    );
    target.slotCount = 1;
    target.structureOnlyRouteCount = 0;
    target.collections = [];
    await writeFile(templateRegistryFile(opts), JSON.stringify(templateIndex, null, 2) + "\n", "utf8");
    const resolvedTemplate = await readTemplate(registered.templateId, opts);
    check(
      "27B.18 a tampered template entry loses to manifest.json and is flagged disagreeing",
      resolvedTemplate?.resolvedFrom === "artifact" &&
        resolvedTemplate.indexAgreed === false &&
        resolvedTemplate.entry.slotCount === 4661 &&
        resolvedTemplate.entry.structureOnlyRouteCount === 10 &&
        resolvedTemplate.entry.collections.length === 3,
      JSON.stringify({
        agreed: resolvedTemplate?.indexAgreed,
        slots: resolvedTemplate?.entry.slotCount,
      }),
    );
    check(
      "27B.19 listing still shows the stale cache — only a read re-derives",
      (await listTemplates(opts)).find((e) => e.templateId === registered.templateId)?.slotCount === 1,
    );
    const siteIndex = JSON.parse(await readFile(siteRegistryFile(opts), "utf8"));
    const siteTarget = siteIndex.entries.find(
      (e: { siteKey: string }) => e.siteKey === site.siteKey,
    );
    siteTarget.releaseState = "PRODUCTION_READY";
    siteTarget.revision = null;
    await writeFile(siteRegistryFile(opts), JSON.stringify(siteIndex, null, 2) + "\n", "utf8");
    const resolvedSite = await readSite(site.siteKey, opts);
    check(
      "27B.20 a tampered site entry loses to release-project.json and the revision chain",
      resolvedSite?.resolvedFrom === "artifact" &&
        resolvedSite.indexAgreed === false &&
        resolvedSite.entry.releaseState === "PRODUCTION_INPUTS_REQUIRED" &&
        resolvedSite.entry.revision?.revisionId === "r000",
      JSON.stringify({
        agreed: resolvedSite?.indexAgreed,
        state: resolvedSite?.entry.releaseState,
      }),
    );

    // ---- 5. unregistered and dangling -------------------------------------
    section("unregistered artifacts and dangling entries");
    await rm(registryDir(opts), { recursive: true, force: true });
    const unregistered = await readTemplate(registered.templateId, opts);
    check(
      "27B.21 an artifact that was never registered still reads, via a scan",
      unregistered?.resolvedFrom === "artifact" &&
        unregistered.registered === false &&
        unregistered.indexAgreed === false &&
        unregistered.entry.slotCount === 4661,
      JSON.stringify({ registered: unregistered?.registered }),
    );
    await rebuildRegistry(opts);
    await rm(scratchLegacyTemplate, { recursive: true, force: true });
    const dangling = await readTemplate(legacyTemplate.templateId, opts);
    check(
      "27B.22 an entry whose artifact is gone reads as index-only and says so",
      dangling?.resolvedFrom === "index" &&
        dangling.artifactMissing &&
        dangling.indexAgreed === false,
      JSON.stringify({ from: dangling?.resolvedFrom, missing: dangling?.artifactMissing }),
    );
    const afterPrune = await rebuildRegistry(opts);
    check(
      "27B.23 a rebuild drops the dangling entry, because the scan is the truth",
      afterPrune.templates.entries.every((e) => e.templateId !== legacyTemplate.templateId) &&
        afterPrune.templates.entries.length === 1,
      `${afterPrune.templates.entries.length} templates`,
    );
    check(
      "27B.24 an id nothing on disk carries resolves to null, for templates and sites",
      (await readTemplate("stripe.com-9999-99-99T00-00-00-000Z", opts)) === null &&
        (await readSite("nothing/at-all", opts)) === null,
    );

    // ---- 6. determinism + source immutability ------------------------------
    section("determinism and historical artifacts untouched");
    check(
      "27B.25 deriving the same artifact twice yields the same entry (no clock inside)",
      entriesAgree(await templateEntryFromDisk(scratchPolicied), registered) &&
        entriesAgree(await templateEntryFromDisk(POLICIED_TEMPLATE), {
          ...registered,
          templateDir: policied.templateDir,
        }),
    );
    const afterReal = {
      policied: await snapshotTree(POLICIED_TEMPLATE),
      legacyTemplate: await snapshotTree(LEGACY_TEMPLATE),
      authored: await snapshotTree(AUTHORED_PROJECT),
      legacyA: await snapshotTree(LEGACY_PROJECT_A),
      legacyB: await snapshotTree(LEGACY_PROJECT_B),
    };
    check(
      "27B.26 every real template run and release project is byte-identical afterwards",
      JSON.stringify(beforeReal) === JSON.stringify(afterReal),
      `${Object.keys(afterReal.authored).length} project files compared`,
    );
    check(
      "27B.27 no revisions/ directory was created in the real release project",
      (await readdir(AUTHORED_PROJECT)).every((n) => n !== "revisions"),
      (await readdir(AUTHORED_PROJECT)).join(","),
    );
  } finally {
    await rm(scratch, { recursive: true, force: true });
  }

  console.log(`\nsmoke:registry — ${checks} checks, ${failures} failures`);
  if (failures > 0) process.exit(1);
}

main().catch((err) => {
  console.error("\nsmoke:registry CRASHED —", err);
  process.exit(1);
});
