import { pathToFileURL } from "node:url";
import {
  DEFAULT_WIDTHS,
  ResponsiveQaInfrastructureError,
  ResponsiveQaInputError,
  runResponsiveQa,
  type RunResponsiveQaResult,
} from "./responsive-qa/index.js";

/**
 * web-recon five-width responsive QA CLI — Task 28.6.
 *
 * ```
 *   reconstruction-manifest.json (or the generated app directory)
 *     → the clone, built once and served locally
 *     → the LIVE source, read-only, at every width in the sweep
 *     → data/<host>/responsive-qa/<run-id>/
 *          responsive-qa.json        every measurement + every classification
 *          images-manifest.json      every image with its classification
 *          images/NN-…-composite.png SOURCE | FINAL, same scale, labelled
 *          contact-sheet.png         all pairs on one page
 * ```
 *
 * This MEASURES and CLASSIFIES. It changes nothing: no correction, no
 * regeneration, no write outside its own run directory.
 *
 * The default sweep is 390 / 700 / 1024 / 1100 / 1440 — the two widths the
 * engine has always observed plus the three where Task 28.5C found shipped
 * defects nobody was measuring.
 */

/** Exported so scripts/smoke-responsive-qa.ts can pin the flag grammar
 *  directly, including the two G4 flags below, without spawning a process. */
export interface ParsedArgs {
  target?: string;
  siteSpecFile?: string;
  routes?: string[];
  widths?: number[];
  sourceOrigin?: string;
  outputDir?: string;
  forceBuild?: boolean;
  skipDiffImages?: boolean;
  selfCheck?: boolean;
  /** ITEM G4. Measure the grading floor first, in this same invocation. */
  withSelfCheck?: boolean;
  /** ITEM G4. Reference an existing self-check run as this run's floor. */
  selfCheckRunFile?: string;
  quiet?: boolean;
}

function parseList(value: string): string[] {
  return value
    .split(",")
    .map((item) => item.trim())
    .filter((item) => item.length > 0);
}

export function parseArgs(argv: readonly string[]): ParsedArgs {
  const args: ParsedArgs = {};
  const take = (index: number, flag: string): [string, number] => {
    const value = argv[index + 1];
    if (!value) throw new ResponsiveQaInputError(`${flag} requires a value`);
    return [value, index + 1];
  };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]!;
    if (arg === "--site-spec") {
      const [value, next] = take(i, arg);
      args.siteSpecFile = value;
      i = next;
    } else if (arg.startsWith("--site-spec=")) {
      args.siteSpecFile = arg.slice("--site-spec=".length);
    } else if (arg === "--routes") {
      const [value, next] = take(i, arg);
      args.routes = parseList(value);
      i = next;
    } else if (arg.startsWith("--routes=")) {
      args.routes = parseList(arg.slice("--routes=".length));
    } else if (arg === "--widths") {
      const [value, next] = take(i, arg);
      args.widths = parseList(value).map(Number);
      i = next;
    } else if (arg.startsWith("--widths=")) {
      args.widths = parseList(arg.slice("--widths=".length)).map(Number);
    } else if (arg === "--source-origin") {
      const [value, next] = take(i, arg);
      args.sourceOrigin = value;
      i = next;
    } else if (arg.startsWith("--source-origin=")) {
      args.sourceOrigin = arg.slice("--source-origin=".length);
    } else if (arg === "--output" || arg === "--out") {
      const [value, next] = take(i, arg);
      args.outputDir = value;
      i = next;
    } else if (arg.startsWith("--output=")) {
      args.outputDir = arg.slice("--output=".length);
    } else if (arg === "--force-build") {
      args.forceBuild = true;
    } else if (arg === "--no-diff-images") {
      args.skipDiffImages = true;
    } else if (arg === "--self-check") {
      args.selfCheck = true;
    } else if (arg === "--with-self-check") {
      args.withSelfCheck = true;
    } else if (arg === "--self-check-run") {
      const [value, next] = take(i, arg);
      args.selfCheckRunFile = value;
      i = next;
    } else if (arg.startsWith("--self-check-run=")) {
      args.selfCheckRunFile = arg.slice("--self-check-run=".length);
    } else if (arg === "--quiet") {
      args.quiet = true;
    } else if (arg.startsWith("--")) {
      throw new ResponsiveQaInputError(`Unknown option: ${arg}`);
    } else if (args.target === undefined) {
      args.target = arg;
    } else {
      throw new ResponsiveQaInputError(`Unexpected argument: ${arg}`);
    }
  }
  return args;
}

function printUsage(): void {
  console.log(
    "Usage: pnpm qa:responsive <reconstruction-manifest.json | run-dir | app-dir> [options]",
  );
  console.log(`  --widths A,B,C           widths to sweep (default ${DEFAULT_WIDTHS.join(",")})`);
  console.log("  --routes /a,/b           routes to measure (default: every route in the");
  console.log("                           app's reconstruction-data/route-map.json)");
  console.log("  --site-spec <file>       take the route list from a SiteSpec instead");
  console.log("  --source-origin <origin> compare against this origin instead of the");
  console.log("                           source origin recorded in the artifacts");
  console.log("  --output <dir>           write the run here instead of");
  console.log("                           data/<host>/responsive-qa/<run-id>/");
  console.log("  --force-build            run `next build` even if .next/BUILD_ID exists");
  console.log("  --no-diff-images         skip the per-pair diff PNG");
  console.log("  --self-check             measure the SOURCE against a second capture of");
  console.log("                           ITSELF instead of against the clone. Nothing is");
  console.log("                           graded: the verdicts are the floor produced by the");
  console.log("                           instrument plus the live source's own instability,");
  console.log("                           and no clone verdict can be better than that floor.");
  console.log("                           The clone is not built or served in this mode.");
  console.log("  --with-self-check        (item G4) measure the grading floor FIRST, in this");
  console.log("                           same invocation — the source against a second");
  console.log("                           capture of itself — and record it in this run's");
  console.log("                           artifact as selfCheckFloor. Ignored with --self-check;");
  console.log("                           a self-check run IS the floor. Doubles the run time.");
  console.log("  --self-check-run <ref>   (item G4) use an EXISTING self-check run as this");
  console.log("                           run's floor instead of measuring a new one: a run id,");
  console.log("                           a run directory, or a responsive-qa.json path. Checked");
  console.log("                           for comparability (site, rubric, roster, widths,");
  console.log("                           routes); a mismatch is named, never silently ignored.");
  console.log("  --quiet                  only print the final table");
  console.log("");
  console.log("  For every (route, width) pair it captures BOTH sides with the same code,");
  console.log("  measures structure, geometry, position distribution, missing content,");
  console.log("  overlap, whitespace, landmarks, layout mode, logo rows and pixels, and");
  console.log("  classifies the pair BLOCKER / MAJOR / MINOR against the SOURCE's own");
  console.log("  values at the same width. It writes only inside its run directory.");
}

function printSummary(result: RunResponsiveQaResult): void {
  const { artifact } = result;
  console.log("");
  console.log(`run:  ${artifact.runId}  (mode: ${artifact.mode})`);
  console.log(`site: ${artifact.site}  (${artifact.sourceOrigin})`);
  console.log(`out:  ${result.runDir}`);
  console.log("");
  const header = ["route", "width", "verdict", "B", "M", "m", "headline"];
  console.log(
    `${header[0]!.padEnd(28)} ${header[1]!.padStart(5)}  ${header[2]!.padEnd(7)} ${header[3]!.padStart(2)} ${header[4]!.padStart(2)} ${header[5]!.padStart(2)}  ${header[6]}`,
  );
  for (const pair of artifact.pairs) {
    const classification = pair.classification;
    const verdict = pair.ok ? (classification?.verdict ?? "?") : "FAILED";
    const top = classification?.findings[0];
    const headline = pair.ok
      ? (top ? top.summary : "no rubric channel fired")
      : (pair.error ?? "capture failed");
    console.log(
      `${pair.route.padEnd(28)} ${String(pair.width).padStart(5)}  ${verdict.padEnd(7)} ` +
        `${String(classification?.blockerCount ?? 0).padStart(2)} ${String(classification?.majorCount ?? 0).padStart(2)} ` +
        `${String(classification?.minorCount ?? 0).padStart(2)}  ${headline.slice(0, 120)}`,
    );
  }
  console.log("");
  console.log(
    `pairs: ${artifact.summary.pairsMeasured} measured, ${artifact.summary.pairsFailed} failed  |  ` +
      `BLOCKER ${artifact.summary.blockerPairs}  MAJOR ${artifact.summary.majorPairs}  ` +
      `MINOR ${artifact.summary.minorPairs}  PASS ${artifact.summary.passPairs}`,
  );
  if (artifact.contactSheet) {
    console.log(`contact sheet: ${result.runDir}/${artifact.contactSheet}`);
  }
  if (artifact.limitations.length > 0) {
    console.log("");
    console.log("limitations of this run:");
    for (const limitation of artifact.limitations) {
      console.log(`  [${limitation.id}] ${limitation.statement}`);
      console.log(`      evidence: ${limitation.evidence}`);
    }
  }
}

async function main(): Promise<number> {
  const argv = process.argv.slice(2);
  if (argv.length === 0 || argv.includes("--help") || argv.includes("-h")) {
    printUsage();
    return argv.length === 0 ? 2 : 0;
  }
  let args: ParsedArgs;
  try {
    args = parseArgs(argv);
  } catch (err) {
    console.error(err instanceof Error ? err.message : String(err));
    printUsage();
    return 2;
  }
  if (!args.target) {
    console.error("a reconstruction manifest, run directory or app directory is required");
    printUsage();
    return 2;
  }

  try {
    const result = await runResponsiveQa({
      target: args.target,
      ...(args.siteSpecFile ? { siteSpecFile: args.siteSpecFile } : {}),
      ...(args.routes ? { explicitRoutes: args.routes } : {}),
      ...(args.widths ? { widths: args.widths } : {}),
      ...(args.sourceOrigin ? { sourceOrigin: args.sourceOrigin } : {}),
      ...(args.outputDir ? { outputDir: args.outputDir } : {}),
      ...(args.forceBuild ? { forceBuild: true } : {}),
      ...(args.skipDiffImages ? { skipDiffImages: true } : {}),
      ...(args.selfCheck ? { selfCheck: true } : {}),
      ...(args.withSelfCheck ? { withSelfCheck: true } : {}),
      ...(args.selfCheckRunFile ? { selfCheckRunFile: args.selfCheckRunFile } : {}),
      onLog: args.quiet ? () => {} : (line) => console.log(line),
    });
    printSummary(result);
    // A measurement run's exit code reports whether it RAN, not whether the
    // clone is good. A BLOCKER is a finding, not a harness failure; an operator
    // gate reads the artifact.
    return result.artifact.summary.pairsFailed > 0 ? 1 : 0;
  } catch (err) {
    if (err instanceof ResponsiveQaInputError) {
      console.error(`input error: ${err.message}`);
      return 2;
    }
    if (err instanceof ResponsiveQaInfrastructureError) {
      console.error(`infrastructure error: ${err.message}`);
      return 3;
    }
    console.error(err instanceof Error ? err.stack ?? err.message : String(err));
    return 1;
  }
}

// Guarded so scripts/smoke-responsive-qa.ts can `import { parseArgs } from
// "../src/cli-qa-responsive.js"` — a flag-grammar unit test, not a subprocess
// — without that import ALSO running the CLI against this process's own argv.
if (process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exitCode = await main();
}
