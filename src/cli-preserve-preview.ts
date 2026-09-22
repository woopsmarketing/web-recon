/**
 * pnpm preserve:preview <preservation-clone-dir> [--port N] [--host H]
 *
 * Serves a Preservation Clone over http://localhost so a human can compare it
 * against the live source in a normal browser. Never file://: relative asset
 * paths and font loading need a real origin.
 */
import path from "node:path";
import { readFile } from "node:fs/promises";

import { startPreviewServer } from "./preservation-clone/index.js";
import { PreservationCloneManifestSchema } from "./preservation-clone/types.js";

async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  const cloneDir = argv.find((a) => !a.startsWith("--"));
  const value = (flag: string): string | undefined =>
    argv.includes(flag) ? argv[argv.indexOf(flag) + 1] : undefined;

  if (!cloneDir) {
    console.log("Usage: pnpm preserve:preview <preservation-clone-dir> [--port N] [--host H]");
    process.exitCode = 1;
    return;
  }

  const root = path.resolve(cloneDir);
  const manifest = PreservationCloneManifestSchema.parse(
    JSON.parse(await readFile(path.join(root, "manifest.json"), "utf8")),
  );

  const portFlag = value("--port");
  const server = await startPreviewServer(root, {
    port: portFlag ? Number(portFlag) : 4180,
    host: value("--host"),
  });

  console.log(`[preserve:preview] source:  ${manifest.source.url}`);
  console.log(`[preserve:preview] index:   ${server.baseUrl}/`);
  for (const variant of manifest.variants) {
    console.log(
      `[preserve:preview] ${variant.viewportId.padEnd(8)} ${server.baseUrl}${variant.previewPath}` +
        `  (captured at ${variant.viewport.width}×${variant.viewport.height})`,
    );
  }
  if (manifest.residual.stillRequestedFromSource > 0) {
    console.log(
      `[preserve:preview] NOTE ${manifest.residual.stillRequestedFromSource} resource(s) still load from source hosts (see residual-dependencies.json)`,
    );
  }
  console.log("[preserve:preview] source JS is preserved but NOT executed — carousels/menus/modals are inert by design");
  console.log("[preserve:preview] Ctrl-C to stop");

  await new Promise<void>((resolve) => {
    process.on("SIGINT", () => void server.close().then(resolve));
    process.on("SIGTERM", () => void server.close().then(resolve));
  });
}

main().catch((error) => {
  console.error("[preserve:preview] failed", error);
  process.exitCode = 1;
});
