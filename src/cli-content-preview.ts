import path from "node:path";
import { stat } from "node:fs/promises";
import { buildApp, startApp } from "./recon-template/parity-qa.js";
import { SLOT_VALUES_FILE, loadContentRun } from "./content-injection/index.js";

/**
 * web-recon Content Injection — preview CLI (Task 19 §23).
 *
 *   pnpm content:preview <content-run-dir> [--default]
 *
 * Serves the IMMUTABLE template app with the run's slot-values overlay
 * (`WR_SLOT_VALUES_FILE`) — the template artifact is never modified. Pass
 * `--default` to serve the template's default content instead (side-by-side
 * comparison via two terminals). Runs until Ctrl+C.
 */

async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  const useDefault = argv.includes("--default");
  const runRef = argv.find((a) => !a.startsWith("--"));
  if (!runRef) {
    console.log("Usage: pnpm content:preview <content-run-dir> [--default]");
    process.exitCode = 1;
    return;
  }
  const run = await loadContentRun(runRef);
  const overlayFile = path.join(run.runDir, SLOT_VALUES_FILE);
  if (!useDefault) {
    try {
      await stat(overlayFile);
    } catch {
      throw new Error(`no slot-values.json in ${run.runDir} — run content:generate first`);
    }
  }
  await buildApp(run.template.appDir, false, (line) => console.log(line));
  const app = await startApp(
    run.template.appDir,
    useDefault ? {} : { WR_SLOT_VALUES_FILE: path.resolve(overlayFile) },
  );
  console.log(`[content:preview] ${useDefault ? "DEFAULT content" : "INJECTED overlay"} — ${app.baseUrl}`);
  console.log(`[content:preview] routes: ${run.manifest.scopedRoutes.join(", ")} (all template routes served)`);
  console.log("[content:preview] Ctrl+C to stop");
  await new Promise<void>((resolve) => {
    process.on("SIGINT", () => resolve());
    process.on("SIGTERM", () => resolve());
  });
  await app.stop();
}

main().catch((err) => {
  console.error("[content:preview] ERROR —", err instanceof Error ? err.message : err);
  process.exitCode = 1;
});
