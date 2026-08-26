import { observeSourceSeo } from "./seo/index.js";

/**
 * web-recon SEO — Source SEO Observer CLI (Task 21 A).
 *
 *   pnpm seo:observe <site-observation.json | run-dir> [--verification <file>]
 *                    [--live-site-files] [--output <dir>]
 *
 * Reads a STORED Task 09 site-observation run (immutable) + its lineage
 * verification.json and writes a source-seo-snapshot-v1 into
 * data/<host>/source-seo-snapshots/<run-id>/. Offline and deterministic,
 * except the opt-in bounded robots.txt/sitemap fetch (`--live-site-files`),
 * which exists only because no stored artifact carries those files.
 */

async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  const observationRef = argv.find((a) => !a.startsWith("--"));
  const value = (flag: string): string | undefined =>
    argv.includes(flag) ? argv[argv.indexOf(flag) + 1] : undefined;
  if (observationRef === undefined) {
    console.log(
      "Usage: pnpm seo:observe <site-observation.json | run-dir> [--verification <file>] [--live-site-files] [--output <dir>]",
    );
    process.exitCode = 1;
    return;
  }
  const siteObservationFile = observationRef.endsWith(".json")
    ? observationRef
    : `${observationRef.replace(/\/$/, "")}/site-observation.json`;
  const { snapshot, outputDir, snapshotFile } = await observeSourceSeo({
    siteObservationFile,
    verificationFile: value("--verification"),
    liveSiteFiles: argv.includes("--live-site-files"),
    outputDir: value("--output"),
    log: (line) => console.log(line),
  });
  console.log(
    `[seo:observe] ${snapshot.host} — pages ${snapshot.pages.length}, duplicate titles ${snapshot.site.duplicateTitles.length}, canonical clusters ${snapshot.site.canonicalClusters.length}, broken internal links ${snapshot.site.brokenInternalLinks.length}, robots.txt ${snapshot.site.robotsTxt.status}`,
  );
  console.log(`[seo:observe] written → ${outputDir} (${snapshotFile})`);
}

main().catch((err) => {
  console.error("[seo:observe] ERROR —", err instanceof Error ? err.message : err);
  process.exitCode = 1;
});
