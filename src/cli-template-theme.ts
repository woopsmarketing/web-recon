import path from "node:path";

// Imported from the leaf modules, not the barrel: `index.ts` is owned by
// another phase and Phase D must not edit it (the orchestrator re-exports).
import { compileThemePackFile, extractAndWriteTheme } from "./slotized-template/theme-pack.js";
import { SlotizedInputError } from "./slotized-template/types.js";

/**
 * web-recon Slotized Template — theme CLI (Task 29 Phase D).
 *
 *   pnpm template:theme <slotized manifest.json | run dir>
 *   pnpm template:theme <manifest.json> --compile <theme-pack.json> --out <compiled-pack.json>
 *
 * Without `--compile` it extracts theme tokens from the run's generated
 * stylesheet (weighted by a DOM census of the copied page trees) and writes
 * `theme.json`, `theme-packs/default.json` and `theme-report.json` back into
 * the run directory — nothing else is touched.
 *
 * With `--compile` it turns an edited theme pack into a COMPILED pack whose
 * `extraCss` carries the overlay, which `pnpm render:template --theme` already
 * knows how to append. The default pack must compile to zero bytes: that is
 * the neutrality proof, printed on every extraction.
 */

interface ParsedArgs {
  target?: string;
  compile?: string;
  out?: string;
}

function parseArgs(argv: readonly string[]): ParsedArgs {
  const args: ParsedArgs = {};
  const flags: Record<string, keyof ParsedArgs> = { "--compile": "compile", "--out": "out", "--output": "out" };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]!;
    if (!arg.startsWith("--")) {
      if (args.target !== undefined) throw new Error(`Unexpected argument: ${arg}`);
      args.target = arg;
      continue;
    }
    const eq = arg.indexOf("=");
    const name = eq === -1 ? arg : arg.slice(0, eq);
    const key = flags[name];
    if (key === undefined) throw new Error(`Unknown option: ${arg}`);
    const value = eq === -1 ? argv[++i] : arg.slice(eq + 1);
    if (!value) throw new Error(`${name} requires a value`);
    args[key] = value;
  }
  return args;
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  if (!args.target) {
    console.log(
      "Usage: pnpm template:theme <slotized manifest.json> [--compile <theme-pack.json> --out <compiled-pack.json>]",
    );
    process.exitCode = 1;
    return;
  }

  if (args.compile) {
    if (!args.out) throw new Error("--compile requires --out <compiled-pack.json>");
    const compiled = await compileThemePackFile(args.target, args.compile, args.out);
    console.log(
      `[theme] compiled ${compiled.applied.length} changed token(s) → ${compiled.rules} rule(s) / ${compiled.declarations} declaration(s)`,
    );
    for (const warning of compiled.warnings.slice(0, 10)) console.log(`[theme] WARN ${warning}`);
    console.log(`[theme] css ${Buffer.byteLength(compiled.css, "utf8")} bytes → ${compiled.outFile}`);
    if (compiled.css === "") console.log("[theme] NEUTRAL: this pack equals the extracted defaults (no CSS emitted)");
    return;
  }

  const startedAt = Date.now();
  const written = await extractAndWriteTheme(args.target);
  const { report } = written;
  const byKind = Object.entries(report.tokensByKind)
    .sort()
    .map(([kind, count]) => `${kind} ${count}`)
    .join(" · ");
  const byRisk = Object.entries(report.tokensByRisk)
    .sort()
    .map(([risk, count]) => `${risk} ${count}`)
    .join(" · ");
  console.log(`[theme] ${path.relative(process.cwd(), written.runDir)}`);
  console.log(
    `[theme] scanned ${report.rulesScanned} class rules (skipped ${report.rulesSkipped}) over ${report.pagesCensused} pages / ${report.classesCensused} classes`,
  );
  console.log(`[theme] tokens ${written.tokens.length}: ${byKind}`);
  console.log(`[theme] risk: ${byRisk}`);
  for (const [kind, tail] of Object.entries(report.unTokenized).sort()) {
    console.log(`[theme] unTokenized ${kind}: ${tail.values} value(s) / ${tail.declarations} declaration(s)`);
  }
  for (const token of report.tokens.filter((t) => t.role !== undefined)) {
    console.log(`[theme] role ${token.role} → ${token.key} ${token.value}`);
  }
  for (const file of written.files) console.log(`[theme] wrote ${path.relative(process.cwd(), file)}`);
  if (written.defaultCssBytes === 0) {
    console.log(`[theme] NEUTRAL: the default pack compiles to 0 bytes of CSS (${((Date.now() - startedAt) / 1000).toFixed(1)}s)`);
  } else {
    console.error(`[theme] NOT NEUTRAL: the default pack emitted ${written.defaultCssBytes} bytes of CSS`);
    process.exitCode = 1;
  }
}

main().catch((error: unknown) => {
  if (error instanceof SlotizedInputError) console.error(`[theme] ${error.message}`);
  else console.error(error);
  process.exitCode = 1;
});
