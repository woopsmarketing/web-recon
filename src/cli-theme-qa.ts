import path from "node:path";
import { readFile, writeFile } from "node:fs/promises";
import { loadReconTemplate } from "./content-injection/load-template.js";
import { SLOT_VALUES_FILE } from "./content-injection/index.js";
import {
  RUN_MANIFEST_FILE,
  THEME_QA_FILE,
  ThemeRunManifestSchema,
  generateThemeOverlay,
  loadThemeRun,
  runThemeQa,
} from "./theme/index.js";

/**
 * web-recon Theme — browser QA CLI (Task 20 §27–§29, §32–§33).
 *
 *   pnpm theme:qa <theme-run-dir> [--routes /,/pricing] [--widths 390,1440,1920]
 *                 [--force-build] [--skip-interactions] [--no-screenshots]
 *
 * Serves the immutable template app twice from ONE server — baseline direct,
 * themed through the overlay proxy — and verifies in real Chromium: DOM
 * identity, geometry delta ≈ 0, document height, runtime/hydration 0,
 * computed paint application (static + pseudo + mounted dynamic surfaces),
 * browser-computed contrast, interaction equivalence, and changed-paint
 * coverage. Writes `qa.json` into the theme run and stamps the manifest.
 */

async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  const runRef = argv.find((a) => !a.startsWith("--"));
  const value = (flag: string): string | undefined =>
    argv.includes(flag) ? argv[argv.indexOf(flag) + 1] : undefined;
  if (!runRef) {
    console.log("Usage: pnpm theme:qa <theme-run-dir> [--routes …] [--widths …] [--force-build]");
    process.exitCode = 1;
    return;
  }
  const run = await loadThemeRun(runRef);
  if (run.compatibility.result === "incompatible" && !argv.includes("--allow-incompatible")) {
    console.error("[theme:qa] REFUSED — this run's theme is incompatible (§23). Pass --allow-incompatible to measure anyway.");
    process.exitCode = 2;
    return;
  }
  const template = await loadReconTemplate(run.manifest.templateManifestFile);
  const overlay = generateThemeOverlay(run.adapter, run.theme);
  const routes = (value("--routes") ?? "/").split(",").map((r) => r.trim()).filter(Boolean);
  const widths = (value("--widths") ?? "390,1440,1920")
    .split(",")
    .map((w) => Number.parseInt(w.trim(), 10))
    .filter((w) => Number.isFinite(w));
  const slotValuesFile =
    run.manifest.contentRunDir !== undefined
      ? path.join(run.manifest.contentRunDir, SLOT_VALUES_FILE)
      : undefined;

  const report = await runThemeQa({
    runId: run.manifest.runId,
    runDir: run.runDir,
    template,
    adapter: run.adapter,
    theme: run.theme,
    overlay,
    routes,
    widths,
    ...(slotValuesFile !== undefined ? { slotValuesFile } : {}),
    forceBuild: argv.includes("--force-build"),
    skipInteractions: argv.includes("--skip-interactions"),
    screenshots: !argv.includes("--no-screenshots"),
    log: (line) => console.log(line),
  });
  await writeFile(path.join(run.runDir, THEME_QA_FILE), JSON.stringify(report, null, 2) + "\n", "utf8");
  const manifest = ThemeRunManifestSchema.parse({
    ...JSON.parse(await readFile(path.join(run.runDir, RUN_MANIFEST_FILE), "utf8")),
    qa: { file: THEME_QA_FILE, pass: report.pass },
  });
  await writeFile(
    path.join(run.runDir, RUN_MANIFEST_FILE),
    JSON.stringify(manifest, null, 2) + "\n",
    "utf8",
  );

  console.log(`\n[theme:qa] baseline: ${report.baseline}`);
  for (const page of report.pages) {
    console.log(
      `[theme:qa] ${page.pass ? "PASS" : "FAIL"} ${page.route} @${page.width} — dom ${page.domIdentical ? "=" : "≠"} · geometry max ${page.geometryDeltaMax}px (${page.geometryComparedNodes} nodes) · height Δ ${page.themedDocHeight - page.baseDocHeight}px · contrast new-low ${page.newLowContrastTexts}`,
    );
    for (const note of page.notes) console.log(`           ${note}`);
  }
  const appliedOk = report.paintChecks.filter((c) => c.applied).length;
  console.log(
    `[theme:qa] paint checks ${appliedOk}/${report.paintChecks.length} applied · groups verified ${report.coverage.verifiedGroups}/${report.coverage.themedGroups} · element weight ${report.coverage.themedElementWeight}`,
  );
  const interactionsOk = report.interactionChecks.filter((c) => c.equivalent).length;
  console.log(`[theme:qa] interactions ${interactionsOk}/${report.interactionChecks.length} equivalent`);
  console.log(`[theme:qa] ${report.pass ? "PASS" : "FAIL"} — qa.json written to ${run.runDir}`);
  if (!report.pass) process.exitCode = 2;
}

main().catch((err) => {
  console.error("[theme:qa] ERROR —", err instanceof Error ? err.message : err);
  process.exitCode = 1;
});
