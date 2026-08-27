import { loadContentRun, revalidateSlotValues } from "./content-injection/index.js";
// Imported from the module rather than the barrel: index.js does not re-export
// it yet and this CLI does not own that file (see the handoff's changeRequests).
import { CONTENT_WRITE_DOCTRINE_WARNING } from "./content-injection/run.js";

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
 * protection) applies unchanged. Task 27 §2: the sibling `slot-accounting.json`
 * is refreshed too, so the total account always matches the current overlay.
 *
 * Task 27 final residual — the CONTENT WRITE DOCTRINE is stated HERE, at the
 * point of edit. slot-values.json is a DERIVED, MATERIALIZED output; the
 * release project's `authored.slotValues` is authoritative. An operator who
 * only ever runs this CLI would otherwise learn at the next `release:build`
 * that the edit was discarded, so the warning fires the moment manual edits
 * are detected, in the same words `release:resolve` and `release:build` use.
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
  if (run.manifest.manualEdits) {
    console.log(`[content:validate] WARNING — ${CONTENT_WRITE_DOCTRINE_WARNING}`);
  }
  console.log(
    `[content:validate] accounting  ${outcome.accounting.totals.inScopeSlots} in-scope slot(s), ` +
      `reconciled ${outcome.accounting.reconciliation.reconciled}, ambiguous ${outcome.accounting.scopeHonesty.ambiguousSlots}`,
  );
  console.log(`[content:validate] review      ${run.runDir}/report/operator-review.md`);
}

main().catch((err) => {
  console.error("[content:validate] ERROR —", err instanceof Error ? err.message : err);
  process.exitCode = 1;
});
