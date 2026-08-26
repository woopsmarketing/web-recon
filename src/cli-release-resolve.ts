/**
 * pnpm release:resolve <release-project-dir> --resolution <pack.json>
 *
 * Validate a production-resolution-v1 pack, match it to requirements
 * (traceable, spec §11) and invalidate exactly the stages the dependency
 * graph names (spec §12). Original lineage artifacts are never mutated;
 * the pack is copied into a new release run (audit trail).
 *
 * Natural language (spec §10): write the pack JSON by hand or via your own
 * LLM session — the validator gate here is what matters.
 */
import { resolveRelease } from "./release/index.js";

async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  const projectRef = argv.find((a) => !a.startsWith("--"));
  const value = (flag: string): string | undefined =>
    argv.includes(flag) ? argv[argv.indexOf(flag) + 1] : undefined;
  const resolutionFile = value("--resolution");
  if (!projectRef || !resolutionFile) {
    console.log("Usage: pnpm release:resolve <release-project-dir> --resolution <pack.json>");
    process.exitCode = 2;
    return;
  }
  const result = await resolveRelease(projectRef, {
    resolutionFile,
    log: (line) => console.log(line),
  });
  console.log(`\n[release:resolve] applied ${result.resolutionId}`);
  console.log(`  matched:     ${result.matched.length} requirement(s)`);
  for (const match of result.matched) console.log(`    ${match.requirementId}  ←  ${match.field}`);
  if (result.unmatchedFields.length > 0) {
    console.log(`  unmatched:   ${result.unmatchedFields.join(", ")}`);
  }
  console.log(`  invalidated: ${result.invalidated.join(", ") || "(no stage)"}`);
  console.log(`  state:       ${result.project.releaseState}`);
}

main().catch((err) => {
  console.error("[release:resolve] ERROR —", err instanceof Error ? err.message : err);
  process.exitCode = 1;
});
