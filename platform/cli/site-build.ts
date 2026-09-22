/**
 * pnpm site:build <siteId> [--mode public|preview] [--at ISO] [--release <releaseId>] [--force] [--keep-workspace]
 */
import { buildSite } from "../build/site-build";
import { BuildModeSchema } from "../site/instance";

const args = process.argv.slice(2);
const siteId = args.find((a) => !a.startsWith("--") && !isValueOf(a));
function flag(name: string): string | undefined {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : undefined;
}
function isValueOf(a: string): boolean {
  const i = args.indexOf(a);
  return i > 0 && ["--mode", "--at", "--release"].includes(args[i - 1]!);
}
if (!siteId) {
  console.error("usage: pnpm site:build <siteId> [--mode public|preview] [--at ISO] [--release <releaseId>] [--force]");
  process.exit(2);
}

try {
  const res = await buildSite({
    repoRoot: process.cwd(),
    siteId,
    mode: BuildModeSchema.parse(flag("--mode") ?? "public"),
    at: flag("--at"),
    releaseId: flag("--release"),
    force: args.includes("--force"),
    keepWorkspace: args.includes("--keep-workspace"),
    log: (l) => console.log(l),
  });
  if (res.status === "up-to-date") {
    console.log(JSON.stringify({ status: res.status, siteId, buildInputId: res.buildInputId, packageDir: res.packageDir }, null, 2));
  } else {
    const r = res.record;
    console.log(
      JSON.stringify(
        {
          status: res.status,
          siteId,
          buildInputId: r.buildInputId,
          releaseId: r.template.releaseId,
          templateSourceHash: r.template.templateSourceHash,
          packageHash: r.packageHash,
          durationMs: r.durationMs,
          qa: { pass: r.qa.pass, files: r.qa.files, bytes: r.qa.bytes, htmlPages: Object.keys(r.qa.pages).length },
          routes: r.preflight.routes,
          pruned: r.preflight.pruned.map((p) => p.key),
          warnings: r.preflight.warnings,
          previous: res.previous?.buildInputId ?? null,
        },
        null,
        2,
      ),
    );
  }
} catch (error) {
  console.error(`site:build FAILED: ${(error as Error).message}`);
  process.exit(1);
}
