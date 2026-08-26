/**
 * pnpm release:plan <release-project-dir>
 *
 * One-screen operator view (spec §14/§20): READY / STALE / BLOCKED /
 * NEEDS INPUT / per-route readiness / NEXT ACTIONS. Read-only.
 */
import { planRelease } from "./release/index.js";

async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  const projectRef = argv.find((a) => !a.startsWith("--"));
  if (!projectRef) {
    console.log("Usage: pnpm release:plan <release-project-dir>");
    process.exitCode = 2;
    return;
  }
  const view = await planRelease(projectRef);
  console.log(view.text);
}

main().catch((err) => {
  console.error("[release:plan] ERROR —", err instanceof Error ? err.message : err);
  process.exitCode = 1;
});
