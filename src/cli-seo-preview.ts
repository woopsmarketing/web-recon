import path from "node:path";
import { loadProductionSeoPlanRun, startSeoServedApp } from "./seo/index.js";

/**
 * web-recon SEO — SEO-applied preview CLI (Task 21 E/F/G).
 *
 *   pnpm seo:preview <plan-run-dir> [--content-run <dir>] [--no-serve]
 *
 * Starts the immutable template app (content overlay via the official
 * WR_SLOT_VALUES_FILE env) behind the SEO head proxy: the production plan's
 * title/meta/JSON-LD reach the browser head, /robots.txt serves the preview
 * policy, /sitemap.xml is 404 while the domain is needs-input. Ctrl-C stops.
 */

async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  const planRunRef = argv.find((a) => !a.startsWith("--"));
  const value = (flag: string): string | undefined =>
    argv.includes(flag) ? argv[argv.indexOf(flag) + 1] : undefined;
  if (planRunRef === undefined) {
    console.log("Usage: pnpm seo:preview <plan-run-dir> [--content-run <dir>] [--no-serve]");
    process.exitCode = 1;
    return;
  }
  const planRun = await loadProductionSeoPlanRun(planRunRef);
  const contentRunDir = value("--content-run") ?? planRun.manifest.inputs.contentRunDir;
  const slotValuesFile =
    contentRunDir !== null ? path.resolve(contentRunDir, "slot-values.json") : undefined;
  console.log(`[seo:preview] plan ${planRun.manifest.runId} (${planRun.plan.domainState.mode}) — routes ${planRun.plan.routes.length}`);
  if (argv.includes("--no-serve")) {
    console.log("[seo:preview] --no-serve: artifacts validated, not serving");
    return;
  }
  const app = await startSeoServedApp({
    appDir: planRun.templateAppDir,
    slotValuesFile,
    proxy: {
      renderedHead: planRun.renderedHead,
      robotsTxt: planRun.robotsTxt,
      sitemapXml: planRun.sitemapXml,
    },
    log: (line) => console.log(line),
  });
  console.log(`[seo:preview] SEO-applied     → ${app.baseUrl}`);
  console.log(`[seo:preview] unmodified base → ${app.upstreamBaseUrl}`);
  console.log("[seo:preview] Ctrl-C to stop");
  await new Promise<void>((resolve) => {
    process.on("SIGINT", () => {
      void app.stop().then(resolve);
    });
  });
}

main().catch((err) => {
  console.error("[seo:preview] ERROR —", err instanceof Error ? err.message : err);
  process.exitCode = 1;
});
