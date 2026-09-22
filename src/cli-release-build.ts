/**
 * pnpm release:build <release-project-dir> [--dry-run]
 *
 * Dependency-graph-driven selective rebuild (spec §17): only stale stages
 * run, each through the subsystem's public typed API; reconstruction and
 * template are frozen and never re-run. --dry-run prints WOULD RUN /
 * WOULD REUSE / BLOCKED BY and mutates nothing (spec §18).
 */
import { buildRelease } from "./release/index.js";

async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  const projectRef = argv.find((a) => !a.startsWith("--"));
  if (!projectRef) {
    console.log("Usage: pnpm release:build <release-project-dir> [--dry-run]");
    process.exitCode = 2;
    return;
  }
  const dryRun = argv.includes("--dry-run");
  const result = await buildRelease(projectRef, {
    dryRun,
    log: (line) => console.log(line),
  });
  if (dryRun) {
    console.log(`\n  requirements: ${result.requirementsCount} (persisted; a dry run writes nothing)`);
    return;
  }
  console.log(`\n[release:build] run ${result.run?.runId}`);
  console.log(`  rerun:   ${result.run?.rerunStages.join(", ") || "(none)"}`);
  console.log(`  reused:  ${result.run?.reusedStages.join(", ") || "(none)"}`);
  if ((result.run?.blockedStages.length ?? 0) > 0) {
    console.log(`  blocked: ${result.run?.blockedStages.join(", ")}`);
  }
  // A build RE-COLLECTS from the artifacts its own stage reruns produced, so
  // its total legitimately differs from the prepare total collected against
  // the accepted lineage. Reported here and recorded on run.json, so the two
  // are comparable instead of looking like one number disagreeing with itself.
  console.log(`  requirements: ${result.requirementsCount} (re-collected from the current artifacts)`);
  console.log(`  verdict: ${result.project.releaseState}`);
  if (result.failed) {
    console.log(`  FAILED at ${result.project.failure?.failedStage}: ${result.project.failure?.message}`);
    process.exitCode = 1;
  }
}

main().catch((err) => {
  console.error("[release:build] ERROR —", err instanceof Error ? err.message : err);
  process.exitCode = 1;
});
