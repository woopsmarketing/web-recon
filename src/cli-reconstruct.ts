import { readFile } from "node:fs/promises";
import path from "node:path";
import {
  GeneratedAppValidationError,
  ReconstructionError,
  ReconstructionInputError,
  generateApp,
  loadReconstructionInput,
  planReconstruction,
  reconstructionRunDir,
  resolveDependencyVersions,
  runNextBuild,
  validateGeneratedApp,
  type ReconstructionCorrectionInput,
  type ReconstructionCorrections,
  type ReconstructionPlan,
} from "./reconstruction/index.js";

/**
 * web-recon Reconstruct CLI — Task 14 (Next.js Reconstruction Engine).
 *
 * Flow:
 *   site-spec.json (Task 13, immutable)
 *     → loadSiteSpec()            ← the ONLY input door (items 2, 3)
 *     → reconstruction plan       ← routes, breakpoint, styles, assets, behavior
 *     → data/<host>/reconstructions/<run-id>/
 *          reconstruction-manifest.json
 *          app/  (Next.js + React + TypeScript, ready to build)
 *
 * The generator is **completely offline**: 0 Firecrawl calls, 0 Playwright
 * launches, 0 network requests, 0 AI calls, 0 asset downloads. It reads the
 * SiteSpec directory and writes a new one, and never touches a Task 06–13
 * artifact.
 */

interface ParsedArgs {
  siteSpecFile?: string;
  outputDir?: string;
  breakpoint?: number;
  skipBuild?: boolean;
  keepExisting?: boolean;
  planOnly?: boolean;
  corrections?: string;
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
    } else if (arg === "--breakpoint") {
      const [value, next] = take(i, arg);
      args.breakpoint = Number(value);
      i = next;
    } else if (arg.startsWith("--breakpoint=")) {
      args.breakpoint = Number(arg.slice("--breakpoint=".length));
    } else if (arg === "--skip-build") {
      args.skipBuild = true;
    } else if (arg === "--keep-existing") {
      args.keepExisting = true;
    } else if (arg === "--corrections") {
      const [value, next] = take(i, arg);
      args.corrections = value;
      i = next;
    } else if (arg.startsWith("--corrections=")) {
      args.corrections = arg.slice("--corrections=".length);
    } else if (arg === "--plan-only") {
      args.planOnly = true;
    } else if (arg.startsWith("--")) {
      throw new Error(`Unknown option: ${arg}`);
    } else if (args.siteSpecFile === undefined) {
      args.siteSpecFile = arg;
    } else {
      throw new Error(`Unexpected argument: ${arg}`);
    }
  }
  return args;
}

function printUsage(): void {
  console.log("Usage: pnpm reconstruct <path-to-site-spec.json> [options]");
  console.log("  --output <dir>     write the reconstruction here instead of");
  console.log("                     data/<host>/reconstructions/<run-id>/");
  console.log("  --breakpoint <px>  override the inferred responsive breakpoint");
  console.log("  --skip-build       generate only; do not run `next build`");
  console.log("  --keep-existing    do not clear an existing output app/ first");
  console.log("  --plan-only        print the plan and write nothing");
  console.log("  --corrections <f>  apply a Task 15 QaCorrectionSet (opt-in).");
  console.log("                     Without it the output is the Task 14 baseline,");
  console.log("                     byte for byte.");
  console.log("");
  console.log("  Input is the SiteSpec and nothing else: no Task 09 dom.json, no Task 11");
  console.log("  action file, no Task 12 pattern file, no browser, no network.");
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(2)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

function printCounts(counts: Record<string, number>, indent = "      "): void {
  const keys = Object.keys(counts);
  if (keys.length === 0) {
    console.log(`${indent}(none)`);
    return;
  }
  const width = Math.max(...keys.map((key) => key.length));
  for (const key of keys) console.log(`${indent}${key.padEnd(width)}  ${counts[key]}`);
}

function reportPlan(plan: ReconstructionPlan): void {
  const { coverage, behavior, counters } = plan;
  console.log("");
  console.log("Routes");
  console.log(`  clone routes               ${plan.routes.routes.length}`);
  console.log(`    exact observed           ${coverage.exactObservedRoutes}`);
  console.log(`    validation observed      ${coverage.validationObservedRoutes}`);
  console.log(`    family represented       ${coverage.familyRepresentedRoutes}`);
  console.log(`  page sources rendered      ${plan.pages.length}`);

  console.log("");
  console.log("Behavior coverage (a different axis from render coverage)");
  console.log(`  exact-verified routes      ${coverage.exactBehaviorRoutes}`);
  console.log(`  represented (unverified)   ${coverage.representedBehaviorRoutes}`);
  console.log(`  observed but not explored  ${coverage.unexploredBehaviorRoutes}`);
  console.log(`  no behavior evidence       ${coverage.routesWithoutBehaviorEvidence}`);

  console.log("");
  console.log("Runtime tree");
  console.log(`  element nodes              ${counters.elementNodes}`);
  console.log(`  text nodes                 ${counters.textNodes}`);
  console.log(`  nodes with a style class   ${counters.styledNodes}`);
  console.log(`  generated DOM ids          ${counters.generatedDomIds}`);
  console.log(
    `  IDREF tokens rewritten     ${counters.rewrittenIdrefTokens} (unresolved kept verbatim: ${counters.unresolvedIdrefTokens})`,
  );
  console.log(`  source nodes skipped       ${counters.skippedSourceNodes}`);

  console.log("");
  console.log("Style");
  console.log(`  style rules                ${plan.styles.ruleCount}`);
  console.log(`  declarations               ${plan.styles.declarationCount}`);
  console.log(`  pseudo rules               ${plan.pseudoStyles.ruleCount}`);
  console.log(`  missing style refs         ${plan.styles.missingTokens.length}`);
  console.log(`  CSS bytes                  ${formatBytes(Buffer.byteLength(plan.styles.css))}`);

  console.log("");
  console.log("Assets (reference mode — 0 downloads)");
  console.log(`  elements requesting assets ${counters.elementAssetsRequested}`);
  console.log(`  resolved img src           ${counters.resolvedImageSrc}`);
  console.log(`  resolved srcset            ${counters.resolvedSrcset}`);
  console.log(`  inline SVG rendered        ${counters.inlineSvgRendered}`);
  console.log(`  unresolved element assets  ${counters.unresolvedElementAssets}`);
  console.log(`  remote asset URLs          ${counters.remoteAssetUrls}`);

  console.log("");
  console.log("Links");
  console.log(`  internal → clone route     ${counters.internalLinksRewritten}`);
  console.log(`  internal, not a route      ${counters.unresolvedInternalLinks}`);
  console.log(`  external kept as-is        ${counters.externalLinks}`);

  console.log("");
  console.log("Interactions (verified only — unknowns are never implemented)");
  console.log(`  source pattern instances   ${behavior.sourcePatternInstances}`);
  console.log(`  runtime bindings           ${behavior.runtimeBindings}`);
  console.log(`    native (browser does it) ${behavior.nativeBindings}`);
  console.log(`    scripted runtime         ${behavior.scriptedBindings}`);
  console.log(`  unsupported patterns       ${behavior.unsupportedPatterns}`);
  console.log(`  dynamic targets mounted    ${plan.interactions.dynamicTargets}`);
  console.log(`  unknown source instances   ${behavior.unknownSourceInstances}`);
  console.log(`  unknown annotations        ${behavior.unknownAnnotations}`);
  console.log(`  unknown behaviors built    ${behavior.unknownBehaviorsImplemented}`);
  console.log("  pattern types");
  printCounts(behavior.byPatternType);
  console.log("  mechanisms");
  printCounts(behavior.byMechanism);
  if (plan.interactions.interactionStateConflicts > 0) {
    console.log(
      `  initial-state conflicts    ${plan.interactions.interactionStateConflicts} (recorded, never silently resolved)`,
    );
  }

  console.log("");
  console.log("Responsive");
  const bp = plan.breakpoint;
  console.log(
    `  breakpoint                 ${bp.value}px (${bp.provenance}, ${bp.method}; observed ${bp.mobileObservedWidth} / ${bp.desktopObservedWidth})`,
  );
  console.log(`  convention                 ${bp.convention}`);

  console.log("");
  console.log("Limitations carried into the manifest");
  for (const code of plan.limitations) console.log(`  ${code}`);
}

/**
 * Read a `QaCorrectionSet` written by `pnpm qa:reconstruction --auto-fix`.
 *
 * Deliberately thin and suspicious: the file is validated against the site it
 * claims to correct, and the correction payloads are handed to the generator's
 * own `buildCorrectionPlan()`, which rejects an unsafe value or a
 * non-content-addressed asset outright rather than sanitizing it (item 176).
 */
async function loadCorrectionSet(
  file: string,
  rootUrl: string,
): Promise<ReconstructionCorrections> {
  const resolved = path.resolve(file);
  const raw = JSON.parse(await readFile(resolved, "utf8")) as {
    rootUrl?: string;
    sourceQaRun?: string;
    sourceSiteSpec?: string;
    corrections?: Array<{ payload?: ReconstructionCorrectionInput }>;
  };
  if (raw.rootUrl !== undefined && raw.rootUrl !== rootUrl) {
    throw new ReconstructionInputError(
      `${file} corrects ${raw.rootUrl}, but this SiteSpec is ${rootUrl}`,
    );
  }
  const payloads = (raw.corrections ?? [])
    .map((entry) => entry.payload)
    .filter((payload): payload is ReconstructionCorrectionInput => payload !== undefined);
  return {
    sourceQaRun: raw.sourceQaRun ?? path.dirname(resolved),
    correctionSet: path.relative(process.cwd(), resolved).split(path.sep).join("/"),
    ...(raw.sourceSiteSpec !== undefined ? { sourceSiteSpec: raw.sourceSiteSpec } : {}),
    assetDir: path.join(path.dirname(resolved), "assets"),
    corrections: payloads,
  };
}

/** A run id for the OUTPUT directory only — never inside a generated file. */
function newRunId(): string {
  return new Date().toISOString().replace(/[:.]/g, "-");
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  if (!args.siteSpecFile) {
    printUsage();
    process.exitCode = 1;
    return;
  }

  const startedAt = Date.now();
  console.log(`[reconstruct] reading ${args.siteSpecFile}`);
  const input = await loadReconstructionInput(args.siteSpecFile);
  const loadedAt = Date.now();
  console.log(
    `[reconstruct] ${input.siteSpec.rootUrl} — schema ${input.siteSpec.schemaVersion}, ` +
      `siteSpec ${input.siteSpec.siteSpecVersion}, compiler ${input.siteSpec.compilerVersion}; ` +
      `${input.siteSpec.routes.length} routes, ${input.pages.length} pages, ` +
      `${input.styleCatalog.tokenCount} style tokens, ${input.assetCatalog.assetCount} assets, ` +
      `${input.interactionSpec.patterns.length} verified patterns, ` +
      `${input.interactionSpec.unknownInteractions.length} unknowns`,
  );

  const corrections = args.corrections
    ? await loadCorrectionSet(args.corrections, input.siteSpec.rootUrl)
    : undefined;
  if (corrections) {
    console.log(
      `[reconstruct] applying ${corrections.corrections.length} QA correction(s) from ${args.corrections}`,
    );
  }
  const plan = planReconstruction(input, {
    ...(args.breakpoint !== undefined ? { breakpointOverride: args.breakpoint } : {}),
    ...(corrections ? { corrections } : {}),
  });
  const plannedAt = Date.now();
  reportPlan(plan);

  if (args.planOnly) {
    console.log("");
    console.log(`[reconstruct] --plan-only: nothing was written`);
    console.log(`  site spec load             ${loadedAt - startedAt} ms`);
    console.log(`  plan                       ${plannedAt - loadedAt} ms`);
    return;
  }

  const outputDir =
    args.outputDir ?? reconstructionRunDir(input.siteSpec.rootUrl, newRunId());
  const versions = await resolveDependencyVersions(process.cwd());
  const generated = await generateApp(plan, {
    outputDir,
    ...(args.keepExisting ? { keepExisting: true } : {}),
    ...(corrections ? { correctionAssetDir: corrections.assetDir } : {}),
    sourceSchemaVersion: input.siteSpec.schemaVersion,
    sourceSiteSpecVersion: input.siteSpec.siteSpecVersion,
    sourceCompilerVersion: input.siteSpec.compilerVersion,
    versions,
  });
  const writtenAt = Date.now();

  const validation = await validateGeneratedApp({
    outputDir,
    expectedRouteUrls: input.siteSpec.routes.map((route) => route.url),
    expectedPatternTriggers: [...plan.interactions.bindings.keys()],
  });
  const validatedAt = Date.now();

  console.log("");
  console.log(`[reconstruct] wrote ${generated.outputDir}`);
  console.log(`  generated files            ${generated.files.length}`);
  console.log(`  app source                 ${formatBytes(generated.bytes.source)}`);
  console.log(`  generated CSS              ${formatBytes(generated.bytes.css)}`);
  console.log(`  runtime page data          ${formatBytes(generated.bytes.runtimeData)}`);
  console.log(`  total                      ${formatBytes(generated.bytes.total)}`);
  console.log("");
  console.log("Validation (read back off disk)");
  console.log(`  routes mapped              ${validation.routeCount}`);
  console.log(`  runtime page files         ${validation.pageFileCount}`);
  console.log(`  element / text nodes       ${validation.runtimeElementNodes} / ${validation.runtimeTextNodes}`);
  console.log(`  distinct CSS classes       ${validation.distinctStyleClasses}`);
  console.log(`  generated DOM ids          ${validation.generatedDomIds}`);
  console.log(`  pattern triggers present   ${validation.checkedTriggers}`);
  console.log("  PASS — every SiteSpec route mapped, no dangling style class, no orphan trigger");
  console.log("");
  console.log(`  site spec load             ${loadedAt - startedAt} ms`);
  console.log(`  plan                       ${plannedAt - loadedAt} ms`);
  console.log(`  write                      ${writtenAt - plannedAt} ms`);
  console.log(`  validate                   ${validatedAt - writtenAt} ms`);
  console.log(`  total generation           ${validatedAt - startedAt} ms`);
  console.log("  Firecrawl 0 · Playwright 0 · network 0 · asset downloads 0 · AI 0");

  if (args.skipBuild) {
    console.log("");
    console.log(`[reconstruct] --skip-build: run \`next build\` in ${generated.appDir} to verify`);
    return;
  }

  console.log("");
  console.log(`[reconstruct] next build (${path.relative(process.cwd(), generated.appDir)})`);
  const build = await runNextBuild(generated.appDir);
  const code = build.exitCode;
  const buildMs = build.elapsedMs;
  if (code !== 0) {
    console.error(`[reconstruct] next build FAILED with exit code ${code} after ${buildMs} ms`);
    process.exitCode = 1;
    return;
  }
  console.log(`[reconstruct] next build PASS in ${buildMs} ms`);
}

main().catch((err) => {
  if (err instanceof ReconstructionInputError) {
    console.error(`[reconstruct] INPUT ERROR — ${err.message}`);
  } else if (err instanceof GeneratedAppValidationError) {
    console.error(`[reconstruct] GENERATED APP INVALID — ${err.message}`);
  } else if (err instanceof ReconstructionError) {
    console.error(`[reconstruct] RECONSTRUCTION ERROR — ${err.message}`);
  } else {
    console.error("[reconstruct] ERROR —", err instanceof Error ? err.message : err);
  }
  process.exitCode = 1;
});
