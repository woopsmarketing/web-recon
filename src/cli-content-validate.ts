import { loadContentRun, revalidateSlotValues } from "./content-injection/index.js";

/**
 * web-recon Content Injection — validate CLI (Task 19 §29).
 *
 *   pnpm content:validate <content-run-dir>
 *
 * Revalidates the run's CURRENT slot-values.json. This is the human-override
 * path: an operator edits the overlay by hand, re-runs validate → preview →
 * qa, and never needs another LLM call. Manual edits are detected against the
 * stored generation result and recorded in the manifest; every safety check
 * (unknown keys, HTML injection, javascript: URLs, image shape, review
 * protection) applies unchanged.
 */

async function main(): Promise<void> {
  const runRef = process.argv[2];
  if (!runRef) {
    console.log("Usage: pnpm content:validate <content-run-dir>");
    process.exitCode = 1;
    return;
  }
  const run = await loadContentRun(runRef);
  const outcome = await revalidateSlotValues(run);
  console.log(`[content:validate] validation  PASS (${outcome.validation.warnings.length} warning(s))`);
  console.log(`[content:validate] assigned    ${outcome.validation.stats.assignedSlots} slot(s), changed vs default ${outcome.changed.size}`);
  console.log(`[content:validate] manualEdits ${run.manifest.manualEdits}`);
  console.log(`[content:validate] review      ${run.runDir}/report/operator-review.md`);
}

main().catch((err) => {
  console.error("[content:validate] ERROR —", err instanceof Error ? err.message : err);
  process.exitCode = 1;
});
