/**
 * pnpm site:preview-kit --site <siteId> --out <dir>
 *
 * Generates the preview renderer kit of one site (platform/preview/kit.ts): <dir>/renderer.mjs and
 * <dir>/kit.json. Reads data/sites/<siteId> (the site shell only — no portfolio) and the site's pinned
 * Template Release; writes the two files and nothing else. No network, no build, no publish.
 */
import path from "node:path";
import { KIT_FILE, RENDERER_FILE, buildPreviewKit, writePreviewKit } from "../preview/kit";

const args = process.argv.slice(2);
function flag(name: string): string | undefined {
  const i = args.indexOf(name);
  const value = i >= 0 ? args[i + 1] : undefined;
  return value && !value.startsWith("--") ? value : undefined;
}
const siteId = flag("--site");
const out = flag("--out");
const known = new Set(["--site", "--out"]);
const unknown = args.filter((a, i) => a.startsWith("--") ? !known.has(a) : !known.has(args[i - 1] ?? ""));
if (!siteId || !out || unknown.length > 0) {
  console.error("usage: pnpm site:preview-kit --site <siteId> --out <dir>");
  process.exit(2);
}

try {
  const repoRoot = process.cwd();
  const outDir = path.resolve(repoRoot, out);
  const kit = await buildPreviewKit({ repoRoot, siteId });
  await writePreviewKit(kit, outDir);
  const record = JSON.parse(kit.files[KIT_FILE]) as { sourceCommit: string; files: Record<string, string> };
  console.log(
    JSON.stringify(
      {
        status: "generated",
        ...kit.info,
        sourceCommit: record.sourceCommit,
        out: outDir,
        files: { [RENDERER_FILE]: { bytes: kit.rendererBytes, sha256: record.files[RENDERER_FILE] }, [KIT_FILE]: { bytes: Buffer.byteLength(kit.files[KIT_FILE]) } },
        bundledSources: kit.inputs.length,
      },
      null,
      2,
    ),
  );
} catch (error) {
  console.error(`site:preview-kit FAILED: ${(error as Error).message}`);
  process.exit(1);
}
