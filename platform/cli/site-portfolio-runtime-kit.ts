/**
 * pnpm site:portfolio-runtime-kit --template <templateId> --release <releaseId> --out <dir>
 *
 * Generates the portfolio runtime kit of one Template Release (platform/portfolio-runtime/kit.ts):
 * <dir>/renderer.mjs and <dir>/kit.json. Reads the release store only — no site, no portfolio; writes
 * the two files and nothing else. No network, no build, no publish.
 */
import path from "node:path";
import { KIT_FILE, RENDERER_FILE, buildRuntimeKit, writeRuntimeKit } from "../portfolio-runtime/kit";

const args = process.argv.slice(2);
function flag(name: string): string | undefined {
  const i = args.indexOf(name);
  const value = i >= 0 ? args[i + 1] : undefined;
  return value && !value.startsWith("--") ? value : undefined;
}
const templateId = flag("--template");
const releaseId = flag("--release");
const out = flag("--out");
const known = new Set(["--template", "--release", "--out"]);
const unknown = args.filter((a, i) => (a.startsWith("--") ? !known.has(a) : !known.has(args[i - 1] ?? "")));
if (!templateId || !releaseId || !out || unknown.length > 0) {
  console.error("usage: pnpm site:portfolio-runtime-kit --template <templateId> --release <releaseId> --out <dir>");
  process.exit(2);
}

try {
  const repoRoot = process.cwd();
  const outDir = path.resolve(repoRoot, out);
  const kit = await buildRuntimeKit({ repoRoot, templateId, releaseId });
  await writeRuntimeKit(kit, outDir);
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
  console.error(`site:portfolio-runtime-kit FAILED: ${(error as Error).message}`);
  process.exit(1);
}
