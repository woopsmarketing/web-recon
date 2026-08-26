/**
 * pnpm assets:preview <materialization-run-dir> --template <template-run-dir>
 *   [--content-run <content-run-dir>] [--theme-overlay <css-file>]
 *
 * Serves the asset-independent production candidate: immutable template app
 * (content overlay via WR_SLOT_VALUES_FILE) behind the asset-rewrite proxy
 * (/media serving + source-URL rewriting), optionally with a Task 20 theme
 * overlay appended to the generated stylesheet.
 */
import path from "node:path";
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";

import { loadAssetMaterializationRun, startAssetServedApp } from "./assets/index.js";

async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  const runRef = argv.find((a) => !a.startsWith("--"));
  const value = (flag: string): string | undefined =>
    argv.includes(flag) ? argv[argv.indexOf(flag) + 1] : undefined;
  const templateRunDir = value("--template");
  if (!runRef || !templateRunDir) {
    console.log(
      "Usage: pnpm assets:preview <materialization-run-dir> --template <template-run-dir> [--content-run <dir>] [--theme-overlay <css-file>]",
    );
    process.exitCode = 1;
    return;
  }
  const materialization = await loadAssetMaterializationRun(runRef);
  const contentRunDir = value("--content-run");
  const slotValuesFile = contentRunDir
    ? path.resolve(contentRunDir, "slot-values.json")
    : undefined;
  if (slotValuesFile && !existsSync(slotValuesFile)) {
    console.log(`[assets:preview] slot-values.json not found: ${slotValuesFile}`);
    process.exitCode = 1;
    return;
  }
  const themeOverlayFile = value("--theme-overlay");
  const app = await startAssetServedApp({
    appDir: path.resolve(templateRunDir, "app"),
    proxy: {
      mediaDir: materialization.mediaDir,
      rewriteMap: materialization.rewriteMap,
      themeOverlayCss: themeOverlayFile
        ? await readFile(themeOverlayFile, "utf8")
        : undefined,
    },
    slotValuesFile,
    log: (line) => console.log(`[assets:preview] ${line}`),
  });
  console.log(`[assets:preview] upstream (original refs): ${app.upstreamBaseUrl}`);
  console.log(`[assets:preview] asset-independent:        ${app.baseUrl}`);
  console.log("[assets:preview] Ctrl-C to stop");
  await new Promise<void>((resolve) => {
    process.on("SIGINT", () => void app.stop().then(resolve));
    process.on("SIGTERM", () => void app.stop().then(resolve));
  });
}

main().catch((err) => {
  console.error("[assets:preview] ERROR —", err);
  process.exitCode = 1;
});
