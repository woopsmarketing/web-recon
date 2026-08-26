/**
 * pnpm production:qa <build-run-dir> — Task 23 H: QA the deployment package.
 *
 * Copies <build-run-dir>/package to an isolation directory outside the
 * repository, launches its own server.mjs with a minimal env (PATH only)
 * and runs HTTP + real-Chromium checks. Writes report/qa.json to the build
 * run directory.
 */
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { runProductionQa } from "./production/index.js";

const buildDir = process.argv[2];
if (!buildDir) {
  console.error("usage: pnpm production:qa <production-build-run-dir>");
  process.exit(2);
}

const report = await runProductionQa({
  packageDir: path.join(buildDir, "package"),
  log: (line) => console.log(line),
});

await mkdir(path.join(buildDir, "report"), { recursive: true });
await writeFile(path.join(buildDir, "report", "qa.json"), JSON.stringify(report, null, 2), "utf8");

console.log(`\nproduction QA: ${report.passed} passed, ${report.failed} failed`);
console.log(`  external requests: ${report.externalRequestTotal} (${JSON.stringify(report.externalRequestsByHost)})`);
console.log(`  report: ${path.join(buildDir, "report", "qa.json")}`);
if (report.failed > 0) process.exit(1);
