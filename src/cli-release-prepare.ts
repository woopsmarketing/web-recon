/**
 * pnpm release:prepare <production-spec-run-dir> [--site-id <id>] [--project-id <id>]
 *                       [--display-name <name>]
 *
 * Scan an accepted production candidate (Task 23 spec + build) and emit the
 * release project: release-project.json + requirements.json +
 * operator-checklist.md under data/<host>/release-projects/<projectId>/.
 * Requirements are COLLECTED from the existing subsystem artifacts —
 * nothing is re-detected, nothing site-specific is hardcoded (spec §8/§23).
 *
 * Identity is STABLE (Task 27): the project is named by `--site-id` (default:
 * the host slug), not by the production-spec run id, so re-preparing the same
 * customer site updates the SAME project. Re-prepare is non-destructive —
 * requirements are recomputed from the re-hashed lineage while resolutions,
 * authored state and run history are carried forward untouched.
 */
import { prepareReleaseProject } from "./release/index.js";

async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  const specRef = argv.find((a) => !a.startsWith("--"));
  const value = (flag: string): string | undefined =>
    argv.includes(flag) ? argv[argv.indexOf(flag) + 1] : undefined;
  if (!specRef) {
    console.log(
      "Usage: pnpm release:prepare <production-spec-run-dir> [--site-id <id>] [--project-id <id>] " +
      "[--page-regions <page-regions-run-dir>] " +
        "[--display-name <name>]",
    );
    process.exitCode = 2;
    return;
  }
  const result = await prepareReleaseProject({
    productionSpecRef: specRef,
    ...(value("--site-id") !== undefined ? { siteId: value("--site-id") } : {}),
    ...(value("--project-id") !== undefined ? { projectId: value("--project-id") } : {}),
    ...(value("--display-name") !== undefined ? { displayName: value("--display-name") } : {}),
    // Task 28 Phase 5: the page-regions run dir this project's region
    // enablement addresses. Carried on a re-prepare when omitted.
    ...(value("--page-regions") !== undefined ? { pageRegionsDir: value("--page-regions") } : {}),
    log: (line) => console.log(line),
  });
  console.log(`\n[release:prepare] project: ${result.projectDir}`);
  console.log(`  siteId:       ${result.project.siteId}${result.reprepared ? " (existing project updated)" : ""}`);
  if (result.reprepared) console.log(`  preserved:    ${result.preserved.join(", ")}`);
  if (result.project.displayName !== undefined) {
    console.log(`  displayName:  ${result.project.displayName}`);
  }
  console.log(
    `  registry:     ${result.registeredSiteKey ?? "not indexed"}`,
  );
  for (const warning of result.registryWarnings) console.log(`  warning:      ${warning}`);
  console.log(`  state:        ${result.project.releaseState}`);
  console.log(`  requirements: ${result.requirementsCount} (${result.releaseBlockingUnresolved} release-blocking unresolved)`);
  console.log(`  next:         pnpm release:plan ${result.projectDir}`);
}

main().catch((err) => {
  console.error("[release:prepare] ERROR —", err instanceof Error ? err.message : err);
  process.exitCode = 1;
});
