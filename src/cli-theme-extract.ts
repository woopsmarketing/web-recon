import path from "node:path";
import { loadReconTemplate } from "./content-injection/load-template.js";
import {
  loadAdapterOverrides,
  newThemeRunId,
  runThemeExtraction,
  themeExtractionDir,
} from "./theme/index.js";

/**
 * web-recon Theme — Original Theme extraction CLI (Task 20 §5/§7).
 *
 *   pnpm theme:extract <template-manifest> [--adapter-overrides <json>] [--output <dir>]
 *
 * Reads the IMMUTABLE Recon Template (its own stylesheet + runtime trees +
 * slot catalog) and writes, into a new `theme-extractions/<run-id>/`:
 *
 *   original.theme.json      the site's current design as contract tokens
 *   site-theme-adapter.json  token → this site's paint occurrences
 *   paint-groups.json        every deterministic paint identity (incl. raw)
 *   report/theme-review.json human-reviewable evidence catalog
 *
 * Offline and deterministic: no network, no browser, no AI.
 */

async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  const manifestRef = argv.find((a) => !a.startsWith("--"));
  const overridesRef = argv.includes("--adapter-overrides")
    ? argv[argv.indexOf("--adapter-overrides") + 1]
    : undefined;
  const outputRef = argv.includes("--output") ? argv[argv.indexOf("--output") + 1] : undefined;
  if (!manifestRef) {
    console.log("Usage: pnpm theme:extract <template-manifest> [--adapter-overrides <json>] [--output <dir>]");
    process.exitCode = 1;
    return;
  }
  const template = await loadReconTemplate(manifestRef);
  const overrides = overridesRef !== undefined ? await loadAdapterOverrides(overridesRef) : undefined;
  const runId = newThemeRunId();
  const outputDir = outputRef ?? themeExtractionDir(template.manifest.source.host, runId);
  const written = await runThemeExtraction({
    template,
    templateManifestFile: path.resolve(manifestRef),
    runId,
    outputDir,
    ...(overrides !== undefined ? { overrides } : {}),
  });
  const { adapter, originalTheme } = written.extraction;
  console.log(`[theme:extract] template ${template.manifest.templateId} (${template.manifest.source.host})`);
  console.log(
    `[theme:extract] ${adapter.paintGroups.length} paint groups — themeable ${adapter.coverage.themeableGroups} · preserved ${adapter.coverage.preservedGroups} · review ${adapter.coverage.reviewGroups}`,
  );
  console.log(`[theme:extract] tokens assigned: ${Object.keys(adapter.tokens).length}`);
  for (const [token, entry] of Object.entries(adapter.tokens).sort()) {
    console.log(`  ${token.padEnd(28)} ${entry.originalValue}  (${entry.boundGroupIds.length} group(s))`);
  }
  console.log(`[theme:extract] original theme: ${originalTheme.themeId} (mode ${originalTheme.metadata.mode}, export-candidate)`);
  console.log(`[theme:extract] written → ${written.outputDir}`);
}

main().catch((err) => {
  console.error("[theme:extract] ERROR —", err instanceof Error ? err.message : err);
  process.exitCode = 1;
});
