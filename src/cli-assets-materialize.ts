/**
 * pnpm assets:materialize <inventory-run-dir> [--concurrency N] [--timeout MS]
 *   [--max-bytes N] [--spacing MS]
 *
 * Fetches every inventory asset classified safe-to-materialize or
 * replacement-recommended through the SSRF-hardened fetcher (host allowlist =
 * exactly the hosts the inventory observed; DNS-validated, redirect-
 * revalidated, size- and MIME-bounded, low concurrency) and stores the bytes
 * as content-hashed /media/<sha256>.<ext> files with a manifest, a rewrite
 * map and the operator replacement manifest (Task 19 imageBrief seam).
 *
 * replacement-required (brand marks / people / customer identity) and
 * license-needs-review (fonts) are NEVER fetched.
 */
import { createAssetMaterializationRun, loadAssetInventoryRun } from "./assets/index.js";

async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  const inventoryRunRef = argv.find((a) => !a.startsWith("--"));
  const value = (flag: string): string | undefined =>
    argv.includes(flag) ? argv[argv.indexOf(flag) + 1] : undefined;
  if (!inventoryRunRef) {
    console.log(
      "Usage: pnpm assets:materialize <inventory-run-dir> [--concurrency N] [--timeout MS] [--max-bytes N] [--spacing MS]",
    );
    process.exitCode = 1;
    return;
  }
  const inventoryRun = await loadAssetInventoryRun(inventoryRunRef);
  const result = await createAssetMaterializationRun({
    inventoryRun,
    concurrency: value("--concurrency") ? Number(value("--concurrency")) : undefined,
    timeoutMs: value("--timeout") ? Number(value("--timeout")) : undefined,
    maxBytes: value("--max-bytes") ? Number(value("--max-bytes")) : undefined,
    spacingMs: value("--spacing") ? Number(value("--spacing")) : undefined,
    log: (line) => console.log(`[assets:materialize] ${line}`),
  });
  const counts = result.manifest.counts;
  console.log(`[assets:materialize] run: ${result.outputDir}`);
  console.log(
    `[assets:materialize] fetched ${counts.fetched}/${counts.candidates} candidates, ` +
      `failed ${counts.failed}, skipped-by-classification ${counts.skippedByClassification}, ` +
      `skipped-truncated ${counts.skippedTruncated}`,
  );
  console.log(
    `[assets:materialize] ${counts.uniqueFiles} unique media files, ` +
      `${(counts.totalBytes / 1024 / 1024).toFixed(1)} MB, ` +
      `${counts.rewriteEntries} rewrite entries, ` +
      `${result.replacementManifest.entries.length} replacement-seam entries`,
  );
  if (counts.failed > 0) {
    for (const entry of result.manifest.entries) {
      if (entry.status !== "fetched" && !entry.status.startsWith("skipped-")) {
        console.log(`  FAIL  ${entry.inventoryId} ${entry.status} — ${entry.sourceUrl}`);
      }
    }
  }
}

main().catch((err) => {
  console.error("[assets:materialize] ERROR —", err);
  process.exitCode = 1;
});
