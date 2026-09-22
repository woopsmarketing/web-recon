#!/usr/bin/env node
/**
 * `tsx src/cli-editor.ts --project <releaseProjectDir> [--port N] [--preview-dir D]`
 *
 * Starts the operator's Visual Editor and prints the URL to open. Ctrl-C stops
 * the editor and the preview together.
 */
import { startVisualEditor } from "./editor/session.js";
import { listEditorSites } from "./editor/catalog.js";

function arg(name: string): string | undefined {
  const index = process.argv.indexOf(`--${name}`);
  return index === -1 ? undefined : process.argv[index + 1];
}

async function main(): Promise<void> {
  if (process.argv.includes("--list") || process.argv.includes("--help")) {
    const { sites, warnings } = await listEditorSites();
    console.log("release projects (open one with --project <dir>):\n");
    for (const site of sites) {
      console.log(`  ${site.projectDir}\n      ${site.name} · ${site.releaseState} · updated ${site.updatedAt}`);
    }
    for (const warning of warnings) console.log(`  WARN ${warning}`);
    return;
  }

  const projectDir = arg("project");
  if (projectDir === undefined) {
    console.error("usage: tsx src/cli-editor.ts --project <release project dir> [--port N] [--preview-dir D]");
    console.error("       tsx src/cli-editor.ts --list");
    process.exit(2);
    return;
  }

  const portArg = arg("port");
  const previewDir = arg("preview-dir");
  const session = await startVisualEditor({
    projectDir,
    ...(portArg !== undefined ? { port: Number.parseInt(portArg, 10) } : {}),
    ...(previewDir !== undefined ? { previewDir } : {}),
    log: (line) => console.log(`  [preview] ${line}`),
  });

  const runtime = session.runtime();
  console.log("");
  console.log(`  Visual Editor   ${session.baseUrl}`);
  console.log(`  preview         ${session.previewBaseUrl}`);
  console.log(`  site            ${runtime.site.siteKey} (${runtime.site.releaseState})`);
  console.log(`  template        ${runtime.site.templateId}`);
  console.log(`  slots/bindings  ${runtime.site.index.slotCount} / ${runtime.site.index.bindingCount}`);
  console.log(`  startup         ${session.startupMs} ms (preview ${session.previewStartMs} ms, materialized=${session.materialized})`);
  console.log("");

  const stop = async (): Promise<void> => {
    await session.stop();
    process.exit(0);
  };
  process.on("SIGINT", () => void stop());
  process.on("SIGTERM", () => void stop());
}

main().catch((error) => {
  console.error("visual editor failed —", error);
  process.exit(1);
});
