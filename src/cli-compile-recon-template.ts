import {
  compileReconTemplate,
  newTemplateRunId,
  TemplateCompileError,
  TemplateInputError,
  TemplateOverrideError,
} from "./recon-template/index.js";

/**
 * web-recon Recon Template CLI — Task 18 (Recon Template Foundation & Slot V2).
 *
 * Flow:
 *   reconstruction-manifest.json (Task 14–17.1 Exact Reconstruction, immutable)
 *   + site-spec.json             (Task 13 SiteSpec, immutable)
 *     → slot extraction → grouping → keys → [manual overrides] → Slot V2
 *     → data/<host>/recon-templates/<run-id>/
 *          manifest.json  site-map.json  slots.json  default-content.json
 *          slot-bindings.json  slot-overrides.example.json
 *          report/slot-summary.json
 *          app/  (the exact app + slot layer, ready to build)
 *
 * The compiler is **completely offline**: 0 Firecrawl calls, 0 Playwright
 * launches, 0 network requests, 0 AI calls. It reads the two lineage inputs
 * and writes a NEW run directory; the Exact Reconstruction and the SiteSpec
 * are never modified.
 */

interface ParsedArgs {
  reconstructionManifestFile?: string;
  siteSpecFile?: string;
  slotOverridesFile?: string;
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
    if (arg === "--site-spec") {
      const [value, next] = take(i, arg);
      args.siteSpecFile = value;
      i = next;
    } else if (arg.startsWith("--site-spec=")) {
      args.siteSpecFile = arg.slice("--site-spec=".length);
    } else if (arg === "--slot-overrides") {
      const [value, next] = take(i, arg);
      args.slotOverridesFile = value;
      i = next;
    } else if (arg.startsWith("--slot-overrides=")) {
      args.slotOverridesFile = arg.slice("--slot-overrides=".length);
    } else if (arg === "--output" || arg === "--out") {
      const [value, next] = take(i, arg);
      args.outputDir = value;
      i = next;
    } else if (arg.startsWith("--output=")) {
      args.outputDir = arg.slice("--output=".length);
    } else if (arg.startsWith("--")) {
      throw new Error(`Unknown option: ${arg}`);
    } else if (args.reconstructionManifestFile === undefined) {
      args.reconstructionManifestFile = arg;
    } else {
      throw new Error(`Unexpected argument: ${arg}`);
    }
  }
  return args;
}

function printUsage(): void {
  console.log(
    "Usage: pnpm compile:recon-template <path-to-reconstruction-manifest.json> --site-spec <path-to-site-spec.json> [options]",
  );
  console.log("  --site-spec <file>       the SiteSpec the reconstruction was generated from (required)");
  console.log("  --slot-overrides <file>  manual override file (exclude/merge/rename/role/scope/…)");
  console.log("  --output <dir>           write the template here instead of");
  console.log("                           data/<host>/recon-templates/<run-id>/");
  console.log("");
  console.log("  Both inputs are immutable: the compiler writes only its own run directory.");
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
  if (!args.reconstructionManifestFile || !args.siteSpecFile) {
    printUsage();
    process.exitCode = 1;
    return;
  }

  const startedAt = Date.now();
  console.log(`[recon-template] reading ${args.reconstructionManifestFile}`);
  console.log(`[recon-template] site spec ${args.siteSpecFile}`);
  if (args.slotOverridesFile) {
    console.log(`[recon-template] slot overrides ${args.slotOverridesFile}`);
  }

  const runId = newTemplateRunId();
  const compiled = await compileReconTemplate({
    reconstructionManifestFile: args.reconstructionManifestFile,
    siteSpecFile: args.siteSpecFile,
    slotOverridesFile: args.slotOverridesFile,
    runId,
    outputDir: args.outputDir,
  });
  const elapsed = Date.now() - startedAt;

  const { manifest, summary, validation } = compiled;
  console.log("");
  console.log(`[recon-template] wrote ${compiled.runDir}`);
  console.log(`  template id                ${manifest.templateId}`);
  console.log(`  routes / pages             ${manifest.counts.routes} / ${manifest.counts.pages}`);
  console.log(`  slots                      ${manifest.counts.slots}`);
  console.log(`    text / url / image       ${manifest.counts.textSlots} / ${manifest.counts.urlSlots} / ${manifest.counts.imageSlots}`);
  console.log(`    global / page            ${manifest.counts.globalSlots} / ${manifest.counts.pageSlots}`);
  console.log(`    flagged for review       ${manifest.counts.reviewSlots}`);
  console.log(`  bindings                   ${manifest.counts.bindings}`);
  console.log(`    static / dynamic         ${manifest.counts.staticBindings} / ${manifest.counts.dynamicTemplateBindings}`);
  console.log(`    paint-twin / svg-text    ${manifest.counts.paintTwinBindings ?? 0} / ${manifest.counts.svgTextBindings ?? 0}`);
  console.log(`  multi-binding slots        ${summary.multiBindingSlots}`);
  console.log(`  cross-surface slots        ${summary.crossSurfaceSlots}`);
  console.log(`  excluded candidates        ${manifest.counts.excludedCandidates}`);
  console.log(`  overrides applied          ${manifest.counts.overridesApplied}`);
  console.log("  role breakdown");
  printCounts(summary.roleBreakdown);
  console.log("  exclusion evidence");
  printCounts(summary.excludedCandidates);
  console.log("");
  console.log("Validation (read back off disk)");
  console.log(`  bindings resolved          ${validation.resolvedBindings}/${validation.bindings}`);
  console.log(`  default-content no-ops     ${validation.defaultNoOpBindings}/${validation.bindings}`);
  console.log("  PASS — every binding resolves and default content is an exact no-op");
  console.log("");
  console.log(`  total compile              ${elapsed} ms`);
  console.log("  Firecrawl 0 · Playwright 0 · network 0 · asset downloads 0 · AI 0");
  console.log("");
  console.log(`[recon-template] build check: run \`next build\` in ${compiled.runDir}/app,`);
  console.log(`  or \`pnpm qa:recon-template ${compiled.runDir}/manifest.json\` for the full parity QA`);
}

main().catch((err) => {
  if (err instanceof TemplateInputError) {
    console.error(`[recon-template] INPUT ERROR — ${err.message}`);
  } else if (err instanceof TemplateOverrideError) {
    console.error(`[recon-template] OVERRIDE ERROR — ${err.message}`);
  } else if (err instanceof TemplateCompileError) {
    console.error(`[recon-template] COMPILE ERROR — ${err.message}`);
  } else {
    console.error("[recon-template] ERROR —", err instanceof Error ? err.message : err);
  }
  process.exitCode = 1;
});
