import {
  CONTENT_POLICY,
  ingestGenerationResult,
  loadContentRun,
  loadManualGenerationResult,
  resolveGenerator,
} from "./content-injection/index.js";

/**
 * web-recon Content Injection — generate CLI (Task 19 §3/§14/§21).
 *
 *   pnpm content:generate <content-run-dir> --provider fake
 *   pnpm content:generate <content-run-dir> --result <generation-result.json>
 *
 * Runs a provider against the prepared Content Task Packet, or ingests a
 * manually authored result (the MVP seam where Claude Code reads the packet
 * and writes the JSON). Either way the result passes the SAME deterministic
 * validator; only a passing result becomes `slot-values.json`.
 */

interface ParsedArgs {
  runRef?: string;
  provider?: string;
  resultFile?: string;
}

function parseArgs(argv: readonly string[]): ParsedArgs {
  const args: ParsedArgs = {};
  const take = (i: number, flag: string): [string, number] => {
    const value = argv[i + 1];
    if (!value) throw new Error(`${flag} requires a value`);
    return [value, i + 1];
  };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]!;
    if (arg === "--provider") {
      const [value, next] = take(i, arg);
      args.provider = value;
      i = next;
    } else if (arg === "--result") {
      const [value, next] = take(i, arg);
      args.resultFile = value;
      i = next;
    } else if (arg.startsWith("--")) {
      throw new Error(`Unknown option: ${arg}`);
    } else if (args.runRef === undefined) {
      args.runRef = arg;
    } else {
      throw new Error(`Unexpected argument: ${arg}`);
    }
  }
  return args;
}

function printUsage(): void {
  console.log("Usage: pnpm content:generate <content-run-dir> (--provider fake | --result <json>)");
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  if (!args.runRef || (!args.provider && !args.resultFile) || (args.provider && args.resultFile)) {
    printUsage();
    process.exitCode = 1;
    return;
  }
  const run = await loadContentRun(args.runRef);

  const result = args.resultFile
    ? await loadManualGenerationResult(args.resultFile)
    : await resolveGenerator(args.provider!).generate({
        mode: "initial",
        intent: run.intent,
        policy: CONTENT_POLICY,
        units: run.unitsFile.units,
        request: run.request,
      });

  const outcome = await ingestGenerationResult(run, result);
  console.log(`[content:generate] generator   ${result.generator.name}${result.generator.model ? ` (${result.generator.model})` : ""}`);
  console.log(`[content:generate] validation  PASS (${outcome.validation.warnings.length} warning(s))`);
  console.log(`[content:generate] assigned    ${outcome.validation.stats.assignedSlots} slot(s), changed vs default ${outcome.changed.size}`);
  console.log(`[content:generate] unresolved  ${outcome.validation.stats.unresolvedSlots} (needs-input)`);
  console.log(`[content:generate] overlay     ${run.runDir}/slot-values.json`);
  console.log(`[content:generate] review      ${run.runDir}/report/operator-review.md`);
  console.log("");
  console.log("Next:");
  console.log(`  pnpm content:qa ${run.runDir}`);
  console.log(`  pnpm content:preview ${run.runDir}`);
}

main().catch((err) => {
  console.error("[content:generate] ERROR —", err instanceof Error ? err.message : err);
  process.exitCode = 1;
});
