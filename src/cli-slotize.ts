import { SlotizedInputError, SlotizedCompileError, slotize } from "./slotized-template/index.js";

/**
 * web-recon Slotized Template CLI — Task 29.
 *
 *   pnpm slotize <recon-templates/<run>/manifest.json> [--out <dir>]
 *
 * ONE input: a Slot V2 recon-template run. The compiler follows its recorded
 * lineage to the accepted reconstruction (page trees, route map, generated
 * stylesheet) and writes data/<host>/slotized-templates/<run-id>/.
 *
 * Completely offline: 0 network calls, 0 browsers, 0 AI. Deterministic: two
 * runs on the same input produce byte-identical definition files.
 */

interface ParsedArgs {
  manifestFile?: string;
  outputDir?: string;
  runId?: string;
}

function parseArgs(argv: readonly string[]): ParsedArgs {
  const args: ParsedArgs = {};
  const take = (i: number, flag: string): string => {
    const value = argv[i + 1];
    if (!value) throw new Error(`${flag} requires a value`);
    return value;
  };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]!;
    if (arg === "--out" || arg === "--output") {
      args.outputDir = take(i, arg);
      i++;
    } else if (arg.startsWith("--out=")) {
      args.outputDir = arg.slice("--out=".length);
    } else if (arg === "--run-id") {
      args.runId = take(i, arg);
      i++;
    } else if (arg.startsWith("--run-id=")) {
      args.runId = arg.slice("--run-id=".length);
    } else if (arg.startsWith("--")) {
      throw new Error(`Unknown option: ${arg}`);
    } else if (args.manifestFile === undefined) {
      args.manifestFile = arg;
    } else {
      throw new Error(`Unexpected argument: ${arg}`);
    }
  }
  return args;
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  if (!args.manifestFile) {
    console.log("Usage: pnpm slotize <path-to-recon-template-manifest.json> [--out <dir>] [--run-id <id>]");
    process.exitCode = 1;
    return;
  }
  const startedAt = Date.now();
  console.log(`[slotize] reading ${args.manifestFile}`);
  const { outDir, manifest } = await slotize({
    manifestFile: args.manifestFile,
    ...(args.outputDir === undefined ? {} : { outputDir: args.outputDir }),
    ...(args.runId === undefined ? {} : { runId: args.runId }),
  });
  console.log(`[slotize] template ${manifest.templateId}`);
  console.log(`[slotize] version  ${manifest.templateVersion.slice(0, 16)}…`);
  const counts = manifest.counts;
  const width = Math.max(...Object.keys(counts).map((k) => k.length));
  for (const [key, value] of Object.entries(counts)) {
    if (value === 0 && key.startsWith("slots.")) continue;
    console.log(`    ${key.padEnd(width)}  ${value}`);
  }
  for (const limitation of manifest.limitations) console.log(`[slotize] limitation: ${limitation}`);
  console.log(`[slotize] wrote ${outDir} in ${((Date.now() - startedAt) / 1000).toFixed(1)}s`);
}

main().catch((error: unknown) => {
  if (error instanceof SlotizedInputError || error instanceof SlotizedCompileError) {
    console.error(`[slotize] ${error.message}`);
  } else {
    console.error(error);
  }
  process.exitCode = 1;
});
