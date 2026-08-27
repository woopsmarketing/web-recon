import path from "node:path";
import {
  RegionCompileError,
  RegionInputError,
  compilePageRegions,
  loadRegionInput,
  newRegionRunId,
  pageRegionRunDir,
  writeRegionRun,
} from "./regions/index.js";

/**
 * web-recon PageRegion CLI — Task 27 (Overnight Authoring Foundation).
 *
 * Flow:
 *   data/<host>/recon-templates/<run>/   (Task 18 template, immutable)
 *     → landmark/sectioning region-root selection over the runtime trees
 *     → join on (pageId, viewport, nodeId) against slot-bindings.json
 *     → global lift across non-locale pages
 *     → data/<host>/page-regions/<run-id>/
 *          page-regions.json
 *          report/region-summary.json
 *
 * Completely offline: 0 Firecrawl calls, 0 Playwright launches, 0 network
 * requests, 0 AI calls. The template run is read and never written.
 *
 * There is NO consumer of this artifact yet. Compiling it changes no rendering,
 * no serve path and no release decision.
 */

interface ParsedArgs {
  templateRunDir?: string;
  outputDir?: string;
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
    if (arg === "--output" || arg === "--out") {
      const [value, next] = take(i, arg);
      args.outputDir = value;
      i = next;
    } else if (arg.startsWith("--output=")) {
      args.outputDir = arg.slice("--output=".length);
    } else if (arg.startsWith("--")) {
      throw new Error(`Unknown option: ${arg}`);
    } else if (args.templateRunDir === undefined) {
      args.templateRunDir = arg;
    } else {
      throw new Error(`Unexpected argument: ${arg}`);
    }
  }
  return args;
}

function printUsage(): void {
  console.log("Usage: pnpm compile:regions <path-to-recon-template-run-dir> [options]");
  console.log("  --output <dir>  write the regions here instead of");
  console.log("                  data/<host>/page-regions/<run-id>/");
  console.log("");
  console.log("  The template run is immutable: the compiler writes only its own run directory.");
  console.log("  A manifest.json path is accepted too; its directory is used.");
}

function printCounts(counts: Record<string, number>, indent = "    "): void {
  const keys = Object.keys(counts);
  if (keys.length === 0) {
    console.log(`${indent}(none)`);
    return;
  }
  const width = Math.max(...keys.map((key) => key.length));
  for (const key of keys) console.log(`${indent}${key.padEnd(width)}  ${counts[key]}`);
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  if (!args.templateRunDir) {
    printUsage();
    process.exitCode = 1;
    return;
  }
  // Accept either the run directory or the manifest inside it.
  const templateRunDir = args.templateRunDir.endsWith(".json")
    ? path.dirname(args.templateRunDir)
    : args.templateRunDir.replace(/[/\\]+$/, "");

  const startedAt = Date.now();
  console.log(`[page-regions] reading ${templateRunDir}`);

  const input = await loadRegionInput(templateRunDir);
  const loadedAt = Date.now();
  const artifact = compilePageRegions(input);
  const compiledAt = Date.now();

  const runId = newRegionRunId();
  const runDir = args.outputDir ?? pageRegionRunDir(input.rootUrl, runId);
  const written = await writeRegionRun(runDir, runId, artifact, templateRunDir);
  const elapsed = Date.now() - startedAt;

  const c = artifact.counts;
  console.log("");
  console.log(`[page-regions] wrote ${written.runDir}`);
  console.log(`  template id                ${artifact.templateId}`);
  console.log(`  routes / pages             ${c.routes} / ${c.pages}`);
  console.log(`  regions                    ${c.regions}`);
  console.log(`    global / page            ${c.globalRegions} / ${c.pageRegions}`);
  console.log(`  slots joined               ${c.slotsJoined}/${c.slots}  (orphan ${c.orphanSlots})`);
  console.log(`  bindings joined            ${c.joinedBindings}/${c.bindings}`);
  console.log(`    orphan / unresolved      ${c.orphanBindings} / ${c.unresolvedBindings}`);
  console.log(`  empty candidates dropped   ${c.emptyCandidatesDropped}`);
  console.log(`  unwrap hops / depth caps   ${c.unwrapHops} / ${c.depthCapHits}`);
  console.log(`  viewport merges            ${c.viewportMerges}  (root mismatches ${c.viewportRootMismatches})`);
  console.log(`  landmark-qualified-only    ${c.globalCandidatesLandmarkQualifiedOnly}  (measured, not applied)`);
  console.log(`  near-global groups         ${c.nearGlobalGroups}  (widest coverage ${c.nearGlobalMaxPages}/${c.pages} pages)`);
  console.log("  policy");
  printCounts(artifact.policy as unknown as Record<string, number>);
  console.log("  limitations");
  for (const limitation of artifact.limitations) console.log(`    ${limitation}`);
  console.log("");
  console.log(`  load / compile / total     ${loadedAt - startedAt} / ${compiledAt - loadedAt} / ${elapsed} ms`);
  console.log("  Firecrawl 0 · Playwright 0 · network 0 · asset downloads 0 · AI 0");
  console.log("");
  console.log("  No consumer: this artifact is inert until something is built on it.");
}

main().catch((err) => {
  if (err instanceof RegionInputError) {
    console.error(`[page-regions] INPUT ERROR — ${err.message}`);
  } else if (err instanceof RegionCompileError) {
    console.error(`[page-regions] COMPILE ERROR — ${err.message}`);
  } else {
    console.error("[page-regions] ERROR —", err instanceof Error ? err.message : err);
  }
  process.exitCode = 1;
});
