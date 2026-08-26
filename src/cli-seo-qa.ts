import path from "node:path";
import { loadProductionSeoPlanRun, runSeoQa } from "./seo/index.js";

/**
 * web-recon SEO — browser QA CLI (Task 21 H/J).
 *
 *   pnpm seo:qa <plan-run-dir> [--content-run <dir>] [--routes /a,/b]
 *
 * Real Chromium against the SEO-served candidate: post-hydration
 * document.title, preview noindex, JSON-LD parse + production identity,
 * source-brand isolation of the served head, robots/sitemap behavior at the
 * serve boundary, and the fetch-based internal link audit over every route.
 * Writes report/qa.json + report/link-qa.json into the plan run.
 */

async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  const planRunRef = argv.find((a) => !a.startsWith("--"));
  const value = (flag: string): string | undefined =>
    argv.includes(flag) ? argv[argv.indexOf(flag) + 1] : undefined;
  if (planRunRef === undefined) {
    console.log("Usage: pnpm seo:qa <plan-run-dir> [--content-run <dir>] [--routes /a,/b]");
    process.exitCode = 1;
    return;
  }
  const planRun = await loadProductionSeoPlanRun(planRunRef);
  const contentRunDir = value("--content-run") ?? planRun.manifest.inputs.contentRunDir;
  const routesArg = value("--routes");
  const result = await runSeoQa({
    planRun,
    slotValuesFile:
      contentRunDir !== null ? path.resolve(contentRunDir, "slot-values.json") : undefined,
    qaRoutes: routesArg?.split(",").map((r) => r.trim()),
    log: (line) => console.log(line),
  });
  for (const route of result.routes) {
    for (const check of route.checks) {
      console.log(`  ${check.pass ? "PASS" : "FAIL"}  [${route.route}] ${check.name}${check.pass ? "" : ` — ${check.detail ?? ""}`}`);
    }
  }
  for (const check of result.siteChecks) {
    console.log(`  ${check.pass ? "PASS" : "FAIL"}  [site] ${check.name}${check.pass ? "" : ` — ${check.detail ?? ""}`}`);
  }
  console.log(
    `[seo:qa] ${result.totals.checks - result.totals.failures}/${result.totals.checks} checks — links: routes ${result.linkTotals.fetchedRoutes}, anchors ${result.linkTotals.anchors}, resolve ${result.linkTotals.routeResolves}, broken-internal ${result.linkTotals.brokenInternal}, source-host-absolute ${result.linkTotals.sourceHostAbsolute}`,
  );
  console.log(`[seo:qa] report → ${path.join(planRun.runDir, "report")}`);
  if (!result.pass) process.exitCode = 2;
}

main().catch((err) => {
  console.error("[seo:qa] ERROR —", err instanceof Error ? err.message : err);
  process.exitCode = 1;
});
