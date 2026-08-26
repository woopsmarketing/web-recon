/**
 * pnpm release:prepare <production-spec-run-dir> [--project-id <id>]
 *
 * Scan an accepted production candidate (Task 23 spec + build) and emit the
 * release project: release-project.json + requirements.json +
 * operator-checklist.md under data/<host>/release-projects/<projectId>/.
 * Requirements are COLLECTED from the existing subsystem artifacts —
 * nothing is re-detected, nothing site-specific is hardcoded (spec §8/§23).
 */
import { prepareReleaseProject } from "./release/index.js";

async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  const specRef = argv.find((a) => !a.startsWith("--"));
  const value = (flag: string): string | undefined =>
    argv.includes(flag) ? argv[argv.indexOf(flag) + 1] : undefined;
  if (!specRef) {
    console.log("Usage: pnpm release:prepare <production-spec-run-dir> [--project-id <id>]");
    process.exitCode = 2;
    return;
  }
  const result = await prepareReleaseProject({
    productionSpecRef: specRef,
    ...(value("--project-id") !== undefined ? { projectId: value("--project-id") } : {}),
    log: (line) => console.log(line),
  });
  console.log(`\n[release:prepare] project: ${result.projectDir}`);
  console.log(`  state:        ${result.project.releaseState}`);
  console.log(`  requirements: ${result.requirementsCount} (${result.releaseBlockingUnresolved} release-blocking unresolved)`);
  console.log(`  next:         pnpm release:plan ${result.projectDir}`);
}

main().catch((err) => {
  console.error("[release:prepare] ERROR —", err instanceof Error ? err.message : err);
  process.exitCode = 1;
});
