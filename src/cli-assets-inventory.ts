/**
 * pnpm assets:inventory <site-spec-dir> --template <template-run-dir>
 *   [--content-run <content-run-dir>] [--observation <observation-run-dir>]
 *   [--live-font-css] [--max-stylesheets N]
 *
 * Builds the Task 22 asset + font inventory from STORED artifacts of the
 * accepted lineage (SiteSpec asset catalog, generated stylesheet, template
 * image slots, Task 19 image briefs, observation-run rendered.html head
 * evidence) and classifies every fetchable asset conservatively.
 *
 * The ONLY network access is the bounded opt-in --live-font-css fetch of the
 * source stylesheets referenced in stored rendered.html (for @font-face
 * rules) — results are marked live-fetched; omitting the flag records
 * fontFaceRules as not-fetched instead of inventing them.
 */
import { createAssetInventoryRun, DEFAULT_FETCH_POLICY } from "./assets/index.js";

async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  const siteSpecDir = argv.find((a) => !a.startsWith("--"));
  const value = (flag: string): string | undefined =>
    argv.includes(flag) ? argv[argv.indexOf(flag) + 1] : undefined;
  const templateRunDir = value("--template");
  if (!siteSpecDir || !templateRunDir) {
    console.log(
      "Usage: pnpm assets:inventory <site-spec-dir> --template <template-run-dir> [--content-run <dir>] [--observation <dir>] [--live-font-css] [--max-stylesheets N]",
    );
    process.exitCode = 1;
    return;
  }
  const result = await createAssetInventoryRun({
    siteSpecDir,
    templateRunDir,
    contentRunDir: value("--content-run"),
    observationRunDir: value("--observation"),
    liveFontCss: argv.includes("--live-font-css")
      ? {
          maxStylesheets: Number(value("--max-stylesheets") ?? 5),
          policyBase: {
            timeoutMs: DEFAULT_FETCH_POLICY.timeoutMs,
            maxBytes: 5 * 1024 * 1024,
            maxRedirects: DEFAULT_FETCH_POLICY.maxRedirects,
          },
        }
      : null,
    log: (line) => console.log(`[assets:inventory] ${line}`),
  });
  console.log(`[assets:inventory] run: ${result.outputDir}`);
  console.log(
    `[assets:inventory] entries ${result.inventory.counts.entries} ` +
      `(url ${result.inventory.counts.urlEntries}, inline-svg ${result.inventory.counts.inlineSvgEntries}, ` +
      `truncated ${result.inventory.counts.truncatedEntries})`,
  );
  for (const [cls, count] of Object.entries(result.inventory.counts.byClassification)) {
    console.log(`[assets:inventory]   ${cls}: ${count}`);
  }
  console.log(
    `[assets:inventory] fonts: ${result.fontInventory.fontUrls.length} font URLs, ` +
      `${result.fontInventory.fontFaceRules.length} @font-face rules (${result.fontInventory.fontFaceProvenance}), ` +
      `${result.fontInventory.license.length} families license-needs-review`,
  );
}

main().catch((err) => {
  console.error("[assets:inventory] ERROR —", err);
  process.exitCode = 1;
});
