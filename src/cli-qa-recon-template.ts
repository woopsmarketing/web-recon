import { writeFile } from "node:fs/promises";
import path from "node:path";
import { runParityQa } from "./recon-template/parity-qa.js";
import { REPORT_DIR } from "./recon-template/index.js";

/**
 * web-recon Recon Template QA CLI — Task 18 §33/§34.
 *
 * Compares a Recon Template app rendered with DEFAULT content against the
 * Exact Reconstruction it was compiled from (the answer sheet — not the live
 * original, so source drift cannot contaminate the measurement), replays every
 * pattern trigger on both, and runs the slot mutation canary through the
 * overlay file (the production artifact is never modified).
 *
 * This is the one Task 18 stage that launches a browser. Both apps are built
 * with `next build` and served with `next start`; captures are ordinary HTTP.
 */

interface ParsedArgs {
  templateManifestFile?: string;
  widths?: number[];
  routes?: string[];
  forceBuild?: boolean;
  skipMutation?: boolean;
  skipInteractions?: boolean;
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
    if (arg === "--widths") {
      const [value, next] = take(i, arg);
      args.widths = value.split(",").map((w) => Number(w.trim()));
      i = next;
    } else if (arg.startsWith("--widths=")) {
      args.widths = arg.slice("--widths=".length).split(",").map((w) => Number(w.trim()));
    } else if (arg === "--routes") {
      const [value, next] = take(i, arg);
      args.routes = value.split(",").map((r) => r.trim());
      i = next;
    } else if (arg.startsWith("--routes=")) {
      args.routes = arg.slice("--routes=".length).split(",").map((r) => r.trim());
    } else if (arg === "--force-build") {
      args.forceBuild = true;
    } else if (arg === "--skip-mutation") {
      args.skipMutation = true;
    } else if (arg === "--skip-interactions") {
      args.skipInteractions = true;
    } else if (arg.startsWith("--")) {
      throw new Error(`Unknown option: ${arg}`);
    } else if (args.templateManifestFile === undefined) {
      args.templateManifestFile = arg;
    } else {
      throw new Error(`Unexpected argument: ${arg}`);
    }
  }
  return args;
}

function printUsage(): void {
  console.log("Usage: pnpm qa:recon-template <path-to-recon-template-manifest.json> [options]");
  console.log("  --widths <list>        comma-separated widths (default 390,1440 + wide 1920,2048");
  console.log("                         on a deterministic route subset)");
  console.log("  --routes <list>        comma-separated route keys to compare (default: all)");
  console.log("  --force-build          rebuild both apps even if .next exists");
  console.log("  --skip-mutation        skip the slot mutation canary");
  console.log("  --skip-interactions    skip the interaction regression phase");
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  if (!args.templateManifestFile) {
    printUsage();
    process.exitCode = 1;
    return;
  }
  const startedAt = Date.now();
  const result = await runParityQa({
    templateManifestFile: args.templateManifestFile,
    widths: args.widths,
    routesFilter: args.routes,
    forceBuild: args.forceBuild,
    skipMutation: args.skipMutation,
    skipInteractions: args.skipInteractions,
    log: (line) => console.log(line),
  });
  const elapsed = Date.now() - startedAt;

  const runDir = path.dirname(args.templateManifestFile);
  const parityFile = path.join(runDir, REPORT_DIR, "parity-qa.json");
  await writeFile(
    parityFile,
    JSON.stringify(
      {
        pairs: result.pairs,
        interactions: result.interactions,
        pass: result.pass,
      },
      null,
      2,
    ) + "\n",
    "utf8",
  );
  const mutationFile = path.join(runDir, REPORT_DIR, "mutation-qa.json");
  await writeFile(
    mutationFile,
    JSON.stringify(
      {
        checks: result.mutationChecks,
        structureEqual: result.mutationStructureEqual,
        runtimeClean: result.mutationRuntimeClean,
      },
      null,
      2,
    ) + "\n",
    "utf8",
  );

  const failedPairs = result.pairs.filter((p) => !p.pass);
  const failedInteractions = result.interactions.filter((i) => !i.equivalent);
  const failedMutations = result.mutationChecks.filter((m) => !m.applied);
  console.log("");
  console.log("Default parity (exact vs template, default content)");
  console.log(`  page/width pairs           ${result.pairs.length}`);
  console.log(`  content equal              ${result.pairs.filter((p) => p.contentEqual).length}/${result.pairs.length}`);
  console.log(`  structure equal            ${result.pairs.filter((p) => p.structureEqual).length}/${result.pairs.length}`);
  console.log(`  max doc-height delta       ${Math.max(0, ...result.pairs.map((p) => p.docHeightDelta))}px`);
  console.log(`  worst geometry p95         ${Math.max(0, ...result.pairs.map((p) => p.geometry.p95))}px`);
  console.log(`  template runtime errors    ${result.pairs.reduce((a, p) => a + p.templateJsErrors, 0)}`);
  console.log(`  template hydration errors  ${result.pairs.reduce((a, p) => a + p.templateHydrationErrors, 0)}`);
  console.log("");
  console.log("Interaction regression");
  console.log(`  triggers compared          ${result.interactions.length}`);
  console.log(`  equivalent                 ${result.interactions.length - failedInteractions.length}/${result.interactions.length}`);
  console.log("");
  console.log("Slot mutation canary");
  console.log(`  binding checks             ${result.mutationChecks.length}`);
  console.log(`  applied                    ${result.mutationChecks.length - failedMutations.length}/${result.mutationChecks.length}`);
  console.log(`  structure unchanged        ${result.mutationStructureEqual === undefined ? "n/a" : result.mutationStructureEqual}`);
  console.log(`  runtime clean              ${result.mutationRuntimeClean === undefined ? "n/a" : result.mutationRuntimeClean}`);
  console.log("");
  for (const p of failedPairs) console.log(`  FAIL parity ${p.route} @${p.width}: ${p.notes.join("; ")}`);
  for (const i of failedInteractions) console.log(`  FAIL interaction ${i.patternId} @${i.width}: ${i.detail}`);
  for (const m of failedMutations) console.log(`  FAIL mutation ${m.slotKey} ${m.bindingId}: ${m.detail}`);
  console.log(`[qa:template] ${result.pass ? "PASS" : "FAIL"} in ${Math.round(elapsed / 1000)}s`);
  console.log(`  reports: ${parityFile}, ${mutationFile}`);
  if (!result.pass) process.exitCode = 1;
}

main().catch((err) => {
  console.error("[qa:template] ERROR —", err instanceof Error ? err.message : err);
  process.exitCode = 1;
});
