import path from "node:path";
import { stat } from "node:fs/promises";
import { loadReconTemplate } from "./content-injection/load-template.js";
import { SLOT_VALUES_FILE } from "./content-injection/index.js";
import {
  createThemeRun,
  loadAdapterFile,
  loadThemeFile,
  newThemeRunId,
  startThemedApp,
  themeRunDir,
} from "./theme/index.js";

/**
 * web-recon Theme — preview CLI (Task 20 §16/§20/§34).
 *
 *   pnpm theme:preview <template-manifest> --theme <file> --adapter <site-theme-adapter.json>
 *                      [--content-run <content-run-dir>] [--allow-incompatible] [--run-dir <dir>]
 *                      [--no-serve]   (create the theme run artifact only)
 *
 * Creates a theme run (selected theme + adapter + overlay CSS + compatibility
 * + manifest under `data/<host>/theme-runs/<run-id>/`), then serves the
 * IMMUTABLE template app with the overlay appended at the serve boundary.
 * Composition order is fixed (§34): Template → Content Overlay (env) → Theme
 * Overlay (stylesheet append) → Render. An `incompatible` verdict refuses to
 * serve unless `--allow-incompatible` is passed explicitly.
 */

async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  const manifestRef = argv.find((a) => !a.startsWith("--"));
  const value = (flag: string): string | undefined =>
    argv.includes(flag) ? argv[argv.indexOf(flag) + 1] : undefined;
  const themeRef = value("--theme");
  const adapterRef = value("--adapter");
  const contentRunRef = value("--content-run");
  const runDirRef = value("--run-dir");
  const allowIncompatible = argv.includes("--allow-incompatible");
  if (!manifestRef || !themeRef || !adapterRef) {
    console.log(
      "Usage: pnpm theme:preview <template-manifest> --theme <file> --adapter <site-theme-adapter.json> [--content-run <dir>] [--allow-incompatible]",
    );
    process.exitCode = 1;
    return;
  }
  const template = await loadReconTemplate(manifestRef);
  const adapter = await loadAdapterFile(adapterRef);
  const theme = await loadThemeFile(themeRef);
  let slotValuesFile: string | undefined;
  if (contentRunRef !== undefined) {
    slotValuesFile = path.resolve(contentRunRef, SLOT_VALUES_FILE);
    await stat(slotValuesFile).catch(() => {
      throw new Error(`no ${SLOT_VALUES_FILE} in ${contentRunRef}`);
    });
  }
  const runId = newThemeRunId();
  const runDir = runDirRef ?? themeRunDir(template.manifest.source.host, runId);
  const run = await createThemeRun({
    template,
    templateManifestFile: path.resolve(manifestRef),
    adapter,
    adapterSourceFile: path.resolve(adapterRef),
    theme,
    themeSourceFile: path.resolve(themeRef),
    runId,
    runDir,
    ...(contentRunRef !== undefined ? { contentRunDir: path.resolve(contentRunRef) } : {}),
  });
  console.log(`[theme:preview] run: ${runDir}`);
  console.log(`[theme:preview] compatibility: ${run.compatibility.result}`);
  for (const check of run.compatibility.checks) {
    if (check.level === "ok") continue;
    console.log(`  ${check.level.toUpperCase().padEnd(7)} ${check.id}: ${check.detail}`);
  }
  if (run.compatibility.result === "incompatible" && !allowIncompatible) {
    console.error("[theme:preview] REFUSED — theme is incompatible with this adapter (§23). Pass --allow-incompatible to override.");
    process.exitCode = 2;
    return;
  }
  if (argv.includes("--no-serve")) {
    console.log("[theme:preview] --no-serve: theme run created, not serving. Run pnpm theme:qa on it.");
    return;
  }
  const app = await startThemedApp({
    appDir: template.appDir,
    overlayCss: run.overlay.css,
    ...(slotValuesFile !== undefined ? { slotValuesFile } : {}),
    log: (line) => console.log(line),
  });
  console.log(
    `[theme:preview] ${theme.themeId}${slotValuesFile !== undefined ? " + content overlay" : ""} — ${app.baseUrl}`,
  );
  console.log(`[theme:preview] unthemed baseline (no overlay) — ${app.upstreamBaseUrl}`);
  console.log("[theme:preview] Ctrl+C to stop");
  await new Promise<void>((resolve) => {
    process.on("SIGINT", () => resolve());
    process.on("SIGTERM", () => resolve());
  });
  await app.stop();
}

main().catch((err) => {
  console.error("[theme:preview] ERROR —", err instanceof Error ? err.message : err);
  process.exitCode = 1;
});
