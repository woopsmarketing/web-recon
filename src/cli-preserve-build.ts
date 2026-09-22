/**
 * pnpm preserve:build <observation-run-dir> [--out <dir>] [--viewport <id>]...
 *   [--max-media-bytes N] [--max-asset-bytes N] [--concurrency N]
 *
 * Assembles a browser-runnable Preservation Clone from the Source Packages of
 * one observation run (Source Preservation Phase 2). No page is re-scraped:
 * the Source Package is the authoritative capture evidence.
 */
import path from "node:path";

import { makeRunId } from "./observer/store.js";
import {
  buildPreservationClone,
  discoverSourcePackages,
} from "./preservation-clone/index.js";

async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  const runDir = argv.find((a) => !a.startsWith("--"));
  const value = (flag: string): string | undefined =>
    argv.includes(flag) ? argv[argv.indexOf(flag) + 1] : undefined;
  const values = (flag: string): string[] =>
    argv.reduce<string[]>((acc, arg, i) => {
      if (arg === flag && argv[i + 1]) acc.push(argv[i + 1]);
      return acc;
    }, []);

  if (!runDir) {
    console.log(
      "Usage: pnpm preserve:build <observation-run-dir> [--out <dir>] [--viewport <id>]... [--max-media-bytes N] [--max-asset-bytes N] [--concurrency N]",
    );
    process.exitCode = 1;
    return;
  }

  const resolvedRun = path.resolve(runDir);
  let packages = await discoverSourcePackages(resolvedRun);
  const wanted = values("--viewport");
  if (wanted.length > 0) {
    packages = packages.filter((p) => wanted.includes(p.viewportId));
  }
  if (packages.length === 0) {
    console.log(`[preserve:build] no source packages under ${resolvedRun}/viewports/*/source-package`);
    process.exitCode = 1;
    return;
  }

  const runId = makeRunId();
  const host = path.basename(path.dirname(resolvedRun));
  const outDir = path.resolve(
    value("--out") ?? path.join("data", host, "preservation-clones", runId),
  );

  const numeric = (flag: string): number | undefined => {
    const raw = value(flag);
    return raw === undefined ? undefined : Number(raw);
  };

  console.log(`[preserve:build] run      ${resolvedRun}`);
  console.log(`[preserve:build] viewports ${packages.map((p) => p.viewportId).join(", ")}`);
  console.log(`[preserve:build] out      ${outDir}`);

  const started = Date.now();
  const result = await buildPreservationClone({
    runDir: resolvedRun,
    sourcePackages: packages,
    outDir,
    runId,
    policy: {
      maxMediaBytes: numeric("--max-media-bytes"),
      maxAssetBytes: numeric("--max-asset-bytes"),
      concurrency: numeric("--concurrency"),
    },
  });

  const { manifest, residual } = result;
  console.log("");
  for (const variant of manifest.variants) {
    const counts = Object.entries(variant.styleCounts)
      .map(([k, v]) => `${k}=${v}`)
      .join(" ");
    console.log(
      `[preserve:build] ${variant.viewportId}: ${variant.htmlPath} — styles ${counts}; ` +
        `scripts ${variant.scriptCounts.neutralized} neutralized / ${variant.scriptCounts.keptData} data; ` +
        `localized ${variant.rewrites.localizedAttributes} attrs, absolutized ${variant.rewrites.absolutizedAttributes}`,
    );
  }
  console.log(
    `[preserve:build] resources: ${manifest.resources.localized} localized / ` +
      `${manifest.resources.shared} shared / ${manifest.resources.skipped} skipped / ${manifest.resources.failed} failed`,
  );
  console.log(
    `[preserve:build] residual:  ${residual.dependencies.length} recorded, ` +
      `${residual.stillRequestedFromSourceCount} still fetched from source hosts`,
  );
  for (const warning of manifest.warnings) console.log(`[preserve:build] WARN ${warning}`);
  console.log(`[preserve:build] done in ${((Date.now() - started) / 1000).toFixed(1)}s`);
  console.log(`[preserve:build] preview: pnpm preserve:preview ${outDir}`);
}

main().catch((error) => {
  console.error("[preserve:build] failed", error);
  process.exitCode = 1;
});
