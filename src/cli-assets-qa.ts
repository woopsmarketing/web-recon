/**
 * pnpm assets:qa <materialization-run-dir> --template <template-run-dir>
 *   [--content-run <content-run-dir>] [--routes /a,/b] [--skip-font-qa]
 *
 * Runtime network QA (Task 22 I) + fallback font QA (Task 22 H) in a real
 * browser: starts the immutable template app once, measures which runtime
 * requests still reach source asset/CDN/font hosts WITHOUT the asset layer
 * (baseline) and WITH it (independent), then measures the layout cost of
 * the fallback font stacks. Reports are written into the materialization
 * run's report/ directory.
 *
 * Exit code 2 when the independent serve shows MORE residual source
 * requests than the baseline (the layer must never make things worse);
 * residual > 0 alone is a reported measurement, not a failure.
 */
import path from "node:path";
import { existsSync } from "node:fs";
import { writeFile } from "node:fs/promises";

import {
  loadAssetInventoryRun,
  loadAssetMaterializationRun,
  runFontFallbackQa,
  runNetworkQa,
  startAssetServedApp,
} from "./assets/index.js";

async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  const runRef = argv.find((a) => !a.startsWith("--"));
  const value = (flag: string): string | undefined =>
    argv.includes(flag) ? argv[argv.indexOf(flag) + 1] : undefined;
  const templateRunDir = value("--template");
  if (!runRef || !templateRunDir) {
    console.log(
      "Usage: pnpm assets:qa <materialization-run-dir> --template <template-run-dir> [--content-run <dir>] [--routes /a,/b] [--skip-font-qa]",
    );
    process.exitCode = 1;
    return;
  }
  const materialization = await loadAssetMaterializationRun(runRef);
  const inventoryRun = await loadAssetInventoryRun(
    path.resolve(materialization.manifest.inventoryRunDir),
  );
  const contentRunDir = value("--content-run");
  const slotValuesFile = contentRunDir
    ? path.resolve(contentRunDir, "slot-values.json")
    : undefined;
  if (slotValuesFile && !existsSync(slotValuesFile)) {
    console.log(`[assets:qa] slot-values.json not found: ${slotValuesFile}`);
    process.exitCode = 1;
    return;
  }
  const routes = value("--routes")
    ?.split(",")
    .map((r) => r.trim())
    .filter((r) => r.length > 0) ?? ["/"];

  const sourceHosts = [
    ...new Set([
      ...inventoryRun.inventory.hosts.map((h) => h.host),
      ...inventoryRun.fontInventory.fontUrls.map((f) => f.host),
      ...inventoryRun.fontInventory.fetchedStylesheets.map((s) => new URL(s.url).hostname),
    ]),
  ];
  const apexParts = inventoryRun.inventory.sourceHost.split(".");
  const sourceApex = apexParts.slice(Math.max(0, apexParts.length - 2)).join(".");

  const app = await startAssetServedApp({
    appDir: path.resolve(templateRunDir, "app"),
    proxy: {
      mediaDir: materialization.mediaDir,
      rewriteMap: materialization.rewriteMap,
    },
    slotValuesFile,
    log: (line) => console.log(`[assets:qa] ${line}`),
  });
  try {
    console.log(`[assets:qa] network QA over ${routes.length} route(s)…`);
    const networkReport = await runNetworkQa({
      servedBaseUrl: app.baseUrl,
      upstreamBaseUrl: app.upstreamBaseUrl,
      routes,
      sourceHosts,
      sourceApex,
    });
    const networkFile = path.join(materialization.runDir, "report", "network-qa.json");
    await writeFile(networkFile, JSON.stringify(networkReport, null, 2) + "\n", "utf8");
    for (const route of networkReport.independent) {
      const baseline = networkReport.baseline.find((r) => r.route === route.route);
      console.log(
        `  ${route.route}  source-host requests: baseline ${baseline?.sourceHost ?? "?"} → independent ${route.sourceHost}` +
          ` (local ${route.local}, other-external ${route.otherExternal})`,
      );
    }
    console.log(
      `[assets:qa] residual source requests total: ${networkReport.totals.independentSourceRequests}` +
        ` (baseline ${networkReport.totals.baselineSourceRequests}) → ${networkFile}`,
    );

    if (!argv.includes("--skip-font-qa")) {
      console.log("[assets:qa] fallback font QA…");
      const fontReport = await runFontFallbackQa({
        servedBaseUrl: app.baseUrl,
        route: routes[0],
        fontInventory: inventoryRun.fontInventory,
      });
      const fontFile = path.join(materialization.runDir, "report", "font-qa.json");
      await writeFile(fontFile, JSON.stringify(fontReport, null, 2) + "\n", "utf8");
      for (const font of fontReport.fonts) {
        console.log(`  ${font.loaded ? "LOADED " : "FAILED "} ${font.family} — ${font.url}`);
      }
      if (fontReport.appReflow) {
        const reflow = fontReport.appReflow;
        console.log(
          `  reflow: ${reflow.elementsChanged}/${reflow.elementsMeasured} elements changed, ` +
            `widthΔ p95 ${reflow.widthDelta.p95.toFixed(1)}px max ${reflow.widthDelta.max.toFixed(1)}px, ` +
            `docHeightΔ ${reflow.docHeightDelta}px`,
        );
      } else {
        console.log(`  reflow: unobserved — ${fontReport.note}`);
      }
      console.log(`[assets:qa] font QA → ${fontFile}`);
    }

    if (
      networkReport.totals.independentSourceRequests >
      networkReport.totals.baselineSourceRequests
    ) {
      console.log("[assets:qa] FAIL — independent serve has MORE source requests than baseline");
      process.exitCode = 2;
    }
  } finally {
    await app.stop();
  }
}

main().catch((err) => {
  console.error("[assets:qa] ERROR —", err);
  process.exitCode = 1;
});
