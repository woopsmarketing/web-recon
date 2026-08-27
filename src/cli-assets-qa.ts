/**
 * pnpm assets:qa <materialization-run-dir> --template <template-run-dir>
 *   [--content-run <content-run-dir>] [--routes /a,/b] [--max-routes N]
 *   [--skip-font-qa]
 *
 * Runtime network QA (Task 22 I) + fallback font QA (Task 22 H) in a real
 * browser: starts the immutable template app once, measures which runtime
 * requests still reach source asset/CDN/font hosts WITHOUT the asset layer
 * (baseline) and WITH it (independent), then measures the layout cost of
 * the fallback font stacks. Reports are written into the materialization
 * run's report/ directory.
 *
 * Route scope (Task 27 GED-G): the census covers every route the template
 * run's site-map.json declares, NOT "/" alone — a residual asset that only
 * renders on another route was invisible before. --routes still overrides the
 * scope explicitly (and is REFUSED, not silently ignored, when it declares no
 * route); --max-routes bounds a very large site map. The residual
 * requests are then joined per FILE with the inventory (identity) and the
 * replacement manifest (requirement, read not re-derived) into
 * report/residual-source-assets.json.
 *
 * Exit code 2 when the independent serve shows MORE residual source
 * requests than the baseline (the layer must never make things worse);
 * residual > 0 alone is a reported measurement, not a failure.
 */
import path from "node:path";
import { existsSync } from "node:fs";
import { writeFile } from "node:fs/promises";

import {
  buildResidualAssetReport,
  loadAssetInventoryRun,
  loadAssetMaterializationRun,
  resolveCensusRoutes,
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
      "Usage: pnpm assets:qa <materialization-run-dir> --template <template-run-dir> [--content-run <dir>] [--routes /a,/b] [--max-routes N] [--skip-font-qa]",
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
  const maxRoutesRaw = value("--max-routes");
  const maxRoutes = maxRoutesRaw === undefined ? null : Number.parseInt(maxRoutesRaw, 10);
  if (maxRoutes !== null && (!Number.isFinite(maxRoutes) || maxRoutes <= 0)) {
    console.log(`[assets:qa] --max-routes must be a positive integer: ${maxRoutesRaw}`);
    process.exitCode = 1;
    return;
  }
  const routeScope = await resolveCensusRoutes({
    templateRunDir,
    explicitRoutes: value("--routes") ?? null,
    maxRoutes,
  });
  // Same idiom as --max-routes above: bad operator input is refused, never
  // quietly swapped for a different scope. resolveCensusRoutes still records
  // the discarded value so a programmatic caller keeps the provenance too.
  if (routeScope.discardedExplicitRoutes !== null) {
    console.log(
      `[assets:qa] --routes declared no route: ${JSON.stringify(routeScope.discardedExplicitRoutes)}` +
        ` — pass routes as "/,/pricing", or omit --routes to use ${routeScope.siteMapFile ?? "the site map"}`,
    );
    process.exitCode = 1;
    return;
  }
  const routes = routeScope.routes;
  console.log(`[assets:qa] route scope: ${routeScope.source} — ${routeScope.note}`);

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

    // Cross-route per-file residual report (Task 27 GED-G): WHERE each residual
    // file still renders, joined to inventory identity and to the replacement
    // manifest's verdict (read, never re-derived).
    const residualReport = buildResidualAssetReport({
      networkReport,
      inventory: inventoryRun.inventory,
      replacementManifest: materialization.replacementManifest,
      routeScope,
      files: {
        networkQa: path.relative(process.cwd(), networkFile),
        inventory: path.relative(
          process.cwd(),
          path.join(inventoryRun.runDir, inventoryRun.manifest.files.inventory),
        ),
        replacementManifest: path.relative(
          process.cwd(),
          path.join(
            materialization.runDir,
            materialization.manifest.files.replacementManifest,
          ),
        ),
      },
    });
    const residualFile = path.join(
      materialization.runDir,
      "report",
      "residual-source-assets.json",
    );
    await writeFile(residualFile, JSON.stringify(residualReport, null, 2) + "\n", "utf8");
    for (const file of residualReport.files) {
      console.log(
        `  ${String(file.occurrences).padStart(3)}x  ${file.url}\n` +
          `        routes: ${file.routes.map((hit) => `${hit.route} (${hit.occurrences})`).join(", ")}\n` +
          `        inventory: ${file.inventoryId ?? "unjoined"}  replacement: ${
            file.replacement.inManifest
              ? `${file.replacement.classification} / ${file.replacement.status}`
              : "not in replacement-manifest.json"
          }`,
      );
    }
    console.log(
      `[assets:qa] residual files: ${residualReport.counts.residualFiles} across ` +
        `${residualReport.counts.routesWithResidual}/${residualReport.counts.routesMeasured} measured routes ` +
        `(${
          residualReport.counts.invisibleAtRootOnly === null
            ? '"/" not measured, so'
            : `${residualReport.counts.invisibleAtRootOnly}`
        } invisible to a "/"-only census, ` +
        `${residualReport.counts.unjoinedToInventory} unjoined to the inventory) → ${residualFile}`,
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
