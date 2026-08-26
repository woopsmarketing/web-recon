import { env } from "./config/env.js";
import {
  DEFAULT_CONCURRENCY,
  DEFAULT_FAMILY_ESCALATION,
  DEFAULT_MAX_FIX_ITERATIONS,
  DEFAULT_MAX_URLS,
  E2eError,
  MAX_CONCURRENCY,
  MAX_FAMILY_ESCALATION,
  MAX_FIX_ITERATIONS_CEILING,
  MAX_MAX_URLS,
  MIN_CONCURRENCY,
  MIN_MAX_URLS,
  STAGE_REGISTRY,
  runE2eReconstruction,
  type E2eRunResult,
} from "./e2e/index.js";

/**
 * web-recon Full E2E CLI — Task 16.
 *
 * One argument: a public URL nobody in this pipeline has looked at before.
 *
 * ```
 * pnpm e2e:reconstruct https://example.com \
 *   [--max-urls N] [--concurrency N] [--auto-fix]
 *   [--max-fix-iterations N] [--family-escalation N] [--prepare-scroll]
 * ```
 *
 * A THIN wrapper (item 31). Everything below parses flags, prints a report and
 * sets an exit code; the pipeline itself is `runE2eReconstruction()`, which
 * calls each stage's own public API in one process. There is no
 * `exec("pnpm verify …")` anywhere — a stage boundary here is a TypeScript
 * contract, not a shell string.
 */

interface ParsedArgs {
  rootUrl?: string;
  maxUrls: number;
  concurrency: number;
  autoFix: boolean;
  maxFixIterations: number;
  familyEscalation: number;
  prepareScroll: boolean;
  help: boolean;
}

function parseArgs(argv: readonly string[]): ParsedArgs {
  const args: ParsedArgs = {
    maxUrls: DEFAULT_MAX_URLS,
    concurrency: DEFAULT_CONCURRENCY,
    autoFix: false,
    maxFixIterations: DEFAULT_MAX_FIX_ITERATIONS,
    familyEscalation: DEFAULT_FAMILY_ESCALATION,
    prepareScroll: false,
    help: false,
  };

  const number = (raw: string | undefined, flag: string): number => {
    const value = Number(raw);
    if (!Number.isInteger(value)) throw new Error(`${flag} needs an integer`);
    return value;
  };

  for (let i = 0; i < argv.length; i++) {
    const token = argv[i]!;
    switch (token) {
      case "--help":
      case "-h":
        args.help = true;
        break;
      case "--max-urls":
        args.maxUrls = number(argv[++i], "--max-urls");
        break;
      case "--concurrency":
        args.concurrency = number(argv[++i], "--concurrency");
        break;
      case "--auto-fix":
        args.autoFix = true;
        break;
      case "--max-fix-iterations":
        args.maxFixIterations = number(argv[++i], "--max-fix-iterations");
        break;
      case "--family-escalation":
        args.familyEscalation = number(argv[++i], "--family-escalation");
        break;
      case "--prepare-scroll":
        args.prepareScroll = true;
        break;
      default:
        if (token.startsWith("-")) throw new Error(`unknown flag: ${token}`);
        if (args.rootUrl !== undefined) {
          throw new Error(`unexpected second target: ${token}`);
        }
        args.rootUrl = token;
    }
  }
  return args;
}

/**
 * Bounds are enforced HERE and not only in the engine, so an operator learns
 * they asked for something out of range before a browser starts rather than
 * eleven minutes in. `--max-urls` in particular is a courtesy limit on somebody
 * else's site (item 43) and has a hard ceiling no flag combination can lift.
 */
function validate(args: ParsedArgs): void {
  if (args.maxUrls < MIN_MAX_URLS || args.maxUrls > MAX_MAX_URLS) {
    throw new Error(`--max-urls must be between ${MIN_MAX_URLS} and ${MAX_MAX_URLS}`);
  }
  if (args.concurrency < MIN_CONCURRENCY || args.concurrency > MAX_CONCURRENCY) {
    throw new Error(
      `--concurrency must be between ${MIN_CONCURRENCY} and ${MAX_CONCURRENCY}`,
    );
  }
  if (args.maxFixIterations < 0 || args.maxFixIterations > MAX_FIX_ITERATIONS_CEILING) {
    throw new Error(
      `--max-fix-iterations must be between 0 and ${MAX_FIX_ITERATIONS_CEILING}`,
    );
  }
  if (args.familyEscalation < 0 || args.familyEscalation > MAX_FAMILY_ESCALATION) {
    throw new Error(
      `--family-escalation must be between 0 and ${MAX_FAMILY_ESCALATION}`,
    );
  }
}

function printUsage(): void {
  console.log("Usage:");
  console.log("  pnpm e2e:reconstruct <url> [options]");
  console.log("");
  console.log("Options:");
  console.log(
    `  --max-urls N             discovery cap (${MIN_MAX_URLS}-${MAX_MAX_URLS}, default ${DEFAULT_MAX_URLS})`,
  );
  console.log(
    `  --concurrency N          browser work in flight (${MIN_CONCURRENCY}-${MAX_CONCURRENCY}, default ${DEFAULT_CONCURRENCY})`,
  );
  console.log("  --auto-fix               propose, apply and re-measure QA corrections");
  console.log(
    `  --max-fix-iterations N   correction iterations (0-${MAX_FIX_ITERATIONS_CEILING}, default ${DEFAULT_MAX_FIX_ITERATIONS})`,
  );
  console.log(
    `  --family-escalation N    exactly observe up to N badly-represented routes (0-${MAX_FAMILY_ESCALATION}, default ${DEFAULT_FAMILY_ESCALATION})`,
  );
  console.log("  --prepare-scroll         read-only auto-scroll to trigger lazy content");
  console.log("");
  console.log("Pipeline:");
  for (const stage of STAGE_REGISTRY) {
    const cost = [
      stage.firecrawl ? "firecrawl" : "",
      stage.browser ? "browser" : "",
      !stage.browser && !stage.network ? "offline" : "",
    ]
      .filter(Boolean)
      .join(" ");
    console.log(
      `  ${stage.stage.padEnd(24)} ${stage.description}${cost ? `  [${cost}]` : ""}`,
    );
  }
  console.log("");
  console.log("Public pages only. No login, no form writes, no bot-protection bypass.");
}

function pad(label: string, width = 30): string {
  return label.padEnd(width);
}

function report(result: E2eRunResult): void {
  const { manifest } = result;
  console.log("");
  console.log("Stages");
  for (const stage of manifest.stages) {
    const counts = Object.entries(stage.counts)
      .map(([key, value]) => `${key}=${value}`)
      .join(" ");
    console.log(
      `  ${pad(stage.stage, 24)} ${stage.status.padEnd(8)} ${String(stage.elapsedMs).padStart(7)} ms  ${counts}`,
    );
  }

  const c = manifest.coverage;
  console.log("");
  console.log("Coverage");
  console.log(`  ${pad("discovered → verified")} ${c.discoveredUrls} → ${c.verifiedUrls}`);
  console.log(
    `  ${pad("families / representatives")} ${c.families} / ${c.representatives} (+${c.validationSamples} validation)`,
  );
  console.log(
    `  ${pad("pages observed / failed")} ${c.observedPages} / ${c.failedPages}`,
  );
  console.log(
    `  ${pad("candidates → actions")} ${c.interactionCandidates} → ${c.actionsPlanned} planned, ${c.actionsExecuted} executed`,
  );
  console.log(
    `  ${pad("patterns / unknowns")} ${c.patternsConfirmed} / ${c.unknownInteractions}`,
  );
  console.log(
    `  ${pad("routes generated / rendered")} ${c.generatedRoutes} / ${c.routesRendered}`,
  );
  console.log(
    `  ${pad("trigger state eq / mismatch")} ${c.triggerStateEquivalent ?? c.behaviorEquivalent} / ${c.triggerStateMismatch ?? c.behaviorMismatch}`,
  );
  console.log(
    `  ${pad("visible target eq / mm / n-obs / n-decl")} ${c.userVisibleTargetEquivalent ?? 0} / ${c.userVisibleTargetMismatch ?? 0} / ${c.userVisibleTargetNotObserved ?? 0} / ${c.userVisibleTargetNotDeclared ?? 0}`,
  );
  console.log(
    `  ${pad("corrections proposed / kept")} ${c.correctionsProposed} / ${c.correctionsAccepted}`,
  );
  console.log(`  ${pad("family escalations")} ${c.familyEscalations}`);

  const u = manifest.upstream;
  console.log("");
  console.log("Task 16 upstream accounting");
  console.log(
    `  ${pad("asset occurrences / unique")} ${u.observedAssetOccurrences} / ${u.uniqueAssets}`,
  );
  console.log(
    `  ${pad("<img> bound in SiteSpec")} ${u.specAssetBoundImageNodes} / ${u.specImageNodes}  (loss in clone: ${u.assetOccurrenceLoss})`,
  );
  console.log(
    `  ${pad("scroll containers obs → spec")} ${u.observedScrollContainers} → ${u.specScrollStateNodes} (${u.specScrolledNodes} scrolled)`,
  );
  console.log(
    `  ${pad("scroll restored / mismatched")} ${u.qaScrollRestored} / ${u.qaScrollMismatched}`,
  );
  console.log(
    `  ${pad("dynamic targets with content")} ${u.dynamicTargetsWithTemplate} / ${u.dynamicTargets} (${u.dynamicTemplateNodes} template nodes)`,
  );
  const grid = Object.entries(u.gridPropertyOccurrences);
  console.log(
    `  ${pad("grid properties observed")} ${grid.length === 0 ? "0" : grid.map(([k, v]) => `${k}=${v}`).join(" ")}`,
  );

  if (manifest.unresolvedIssues.length > 0) {
    console.log("");
    console.log("Unresolved (classification × count → upstream / recommendation)");
    for (const issue of manifest.unresolvedIssues) {
      console.log(
        `  ${pad(issue.classification, 36)} ${String(issue.count).padStart(5)}  ` +
          `(${issue.affectedNodes} nodes)  ${issue.upstreamStage} / ${issue.recommendation}`,
      );
    }
  }

  if (manifest.finalReconstruction) {
    console.log("");
    console.log("Final reconstruction");
    console.log(`  ${pad("path")} ${manifest.finalReconstruction.path}`);
    console.log(`  ${pad("kind")} ${manifest.finalReconstruction.kind}`);
    console.log(`  ${pad("why")} ${manifest.finalReconstruction.reason}`);
  }

  console.log("");
  console.log(`Final status: ${manifest.finalStatus}`);
  console.log(`Manifest:     ${result.manifestPath}`);
}

async function main(): Promise<void> {
  let args: ParsedArgs;
  try {
    args = parseArgs(process.argv.slice(2));
    if (!args.help && args.rootUrl !== undefined) validate(args);
  } catch (err) {
    console.error(err instanceof Error ? err.message : String(err));
    printUsage();
    process.exitCode = 1;
    return;
  }
  if (args.help || args.rootUrl === undefined) {
    printUsage();
    return;
  }

  let target: URL;
  try {
    target = new URL(args.rootUrl);
  } catch {
    console.error(`Target must be an http(s) URL, got: ${args.rootUrl}`);
    process.exitCode = 1;
    return;
  }
  if (target.protocol !== "http:" && target.protocol !== "https:") {
    console.error(`Target must be an http(s) URL, got: ${args.rootUrl}`);
    process.exitCode = 1;
    return;
  }

  console.log(`[e2e] target ${target.toString()}`);
  console.log(
    `[e2e] max-urls=${args.maxUrls} concurrency=${args.concurrency} ` +
      `auto-fix=${args.autoFix} max-fix-iterations=${args.maxFixIterations} ` +
      `family-escalation=${args.familyEscalation}`,
  );

  try {
    const result = await runE2eReconstruction({
      rootUrl: target.toString(),
      maxUrls: args.maxUrls,
      concurrency: args.concurrency,
      autoFix: args.autoFix,
      maxFixIterations: args.maxFixIterations,
      familyEscalation: args.familyEscalation,
      prepareScroll: args.prepareScroll,
      ...(env.FIRECRAWL_API_KEY ? { firecrawlApiKey: env.FIRECRAWL_API_KEY } : {}),
      onLog: (message) => console.log(message),
    });
    report(result);
    // A run that stopped early still writes its manifest — that IS the report —
    // but the exit code has to say the pipeline did not complete.
    if (result.manifest.finalStatus === "failed") process.exitCode = 1;
  } catch (err) {
    if (err instanceof E2eError) {
      console.error(`[e2e] ${err.failure} — ${err.message}`);
    } else {
      console.error("[e2e] ERROR —", err instanceof Error ? err.message : err);
    }
    process.exitCode = 1;
  }
}

void main();
