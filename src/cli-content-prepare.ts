import { readFile } from "node:fs/promises";
import {
  CONTENT_TRUTH_MODES,
  ContentInputError,
  loadContentBrief,
  prepareContentRun,
  type ContentTruthMode,
} from "./content-injection/index.js";

/**
 * web-recon Content Injection — prepare CLI (Task 19 §2/§4, Task 27 §4/§5).
 *
 *   pnpm content:prepare <recon-template-manifest> --intent "<natural language>"
 *
 * Turns ONE natural-language intent into a bounded Content Task Packet under
 * data/<host>/content-runs/<run-id>/ — intent (verbatim, immutable), the
 * fixed content policy, a compact template summary, deterministic content
 * units, a batched generation request and the output JSON schema. Offline and
 * deterministic; no LLM is called here.
 *
 * §5 — ONE BRIEF → FIRST DRAFT. `--brief` accepts a JSON file in which EVERY
 * field is optional. Nothing here asks a follow-up question: what the brief
 * did not say is reported as a gap, with what it costs, and the packet is
 * prepared anyway.
 */

interface ParsedArgs {
  templateManifestFile?: string;
  intent?: string;
  intentFile?: string;
  routes?: string[];
  includeReview?: boolean;
  factsFile?: string;
  briefFile?: string;
  truthMode?: ContentTruthMode;
  regionsFile?: string;
  outDir?: string;
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
    if (arg === "--intent") {
      const [value, next] = take(i, arg);
      args.intent = value;
      i = next;
    } else if (arg === "--intent-file") {
      const [value, next] = take(i, arg);
      args.intentFile = value;
      i = next;
    } else if (arg === "--routes") {
      const [value, next] = take(i, arg);
      args.routes = value.split(",").map((r) => r.trim());
      i = next;
    } else if (arg === "--facts") {
      const [value, next] = take(i, arg);
      args.factsFile = value;
      i = next;
    } else if (arg === "--brief") {
      const [value, next] = take(i, arg);
      args.briefFile = value;
      i = next;
    } else if (arg === "--truth-mode") {
      const [value, next] = take(i, arg);
      if (!(CONTENT_TRUTH_MODES as readonly string[]).includes(value)) {
        throw new ContentInputError(
          `--truth-mode must be one of: ${CONTENT_TRUTH_MODES.join(" | ")}`,
        );
      }
      args.truthMode = value as ContentTruthMode;
      i = next;
    } else if (arg === "--regions") {
      const [value, next] = take(i, arg);
      args.regionsFile = value;
      i = next;
    } else if (arg === "--out") {
      const [value, next] = take(i, arg);
      args.outDir = value;
      i = next;
    } else if (arg === "--include-review") {
      args.includeReview = true;
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
  console.log('Usage: pnpm content:prepare <recon-template-manifest.json> --intent "<text>" [options]');
  console.log("  --intent <text>        the natural-language request (or --intent-file)");
  console.log("  --intent-file <path>   read the request from a UTF-8 text file");
  console.log("  --routes <list>        template routes to rewrite (default: /)");
  console.log("  --include-review       opt review-flagged slots into generation (default off)");
  console.log('  --facts <json>         user-provided facts file: [{"kind":"…","value":"…"}]');
  console.log("  --brief <json>         content brief — every field optional, nothing blocking");
  console.log(`  --truth-mode <mode>    ${CONTENT_TRUTH_MODES.join(" | ")} (default ${CONTENT_TRUTH_MODES[0]})`);
  console.log("  --regions <json>       page-regions.json to emit the RegionPlan layer from");
  console.log("  --out <dir>            output directory override (default data/<host>/content-runs/<id>)");
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  if (!args.templateManifestFile || (!args.intent && !args.intentFile && !args.briefFile)) {
    printUsage();
    process.exitCode = 1;
    return;
  }
  const brief = args.briefFile ? await loadContentBrief(args.briefFile) : undefined;
  // The brief's goal is a legitimate raw intent: one brief is enough. It is the
  // ONE thing that cannot be defaulted — everything else the brief omits is a
  // reported gap, not a question.
  const rawIntent =
    args.intent ?? (args.intentFile ? (await readFile(args.intentFile, "utf8")).trim() : brief?.goal);
  if (rawIntent === undefined || rawIntent === "") {
    throw new ContentInputError(
      "no request text: pass --intent, --intent-file, or a brief with a `goal`",
    );
  }
  const providedFacts = args.factsFile
    ? (JSON.parse(await readFile(args.factsFile, "utf8")) as { kind: string; value: string }[])
    : [];

  const prepared = await prepareContentRun({
    templateManifestFile: args.templateManifestFile,
    rawIntent,
    routes: args.routes ?? brief?.routes,
    includeReview: args.includeReview,
    providedFacts,
    ...(brief !== undefined ? { brief } : {}),
    ...(args.truthMode !== undefined ? { truthMode: args.truthMode } : {}),
    ...(args.regionsFile !== undefined ? { pageRegionsFile: args.regionsFile } : {}),
    outputDir: args.outDir,
  });

  console.log(`[content:prepare] run       ${prepared.runId}`);
  console.log(`[content:prepare] dir       ${prepared.runDir}`);
  console.log(`[content:prepare] routes    ${prepared.intent.requestedScope.routes.join(", ")}`);
  console.log(`[content:prepare] units     ${prepared.units.units.length} (editable slots ${prepared.units.editableSlotCount})`);
  console.log(`[content:prepare] review    ${prepared.units.reviewSlotKeys.length} slot(s) listed for human pass`);
  console.log(`[content:prepare] batches   ${prepared.request.batches.length} (bound ${prepared.request.batchUnitLimit} unit(s)/batch)`);
  console.log(`[content:prepare] truth     ${prepared.request.truthMode}`);
  if (prepared.regionPlan) {
    console.log(
      `[content:prepare] regions   ${prepared.regionPlan.plans.length} region plan(s), ` +
        `${prepared.regionPlan.unassignedUnitIds.length} unit(s) in no region`,
    );
  }
  // §5: reported, never asked. The draft is already prepared at this point.
  for (const gap of prepared.briefGaps) {
    console.log(`[content:prepare] brief gap ${gap.field} — ${gap.consequence}`);
  }
  console.log("");
  console.log("Next: author or generate a result, then:");
  console.log(`  pnpm content:generate ${prepared.runDir} --provider fake`);
  console.log(`  pnpm content:generate ${prepared.runDir} --result <generation-result.json>`);
}

main().catch((err) => {
  console.error("[content:prepare] ERROR —", err instanceof Error ? err.message : err);
  process.exitCode = 1;
});
