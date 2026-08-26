import {
  DEFAULT_CONCURRENCY,
  MAX_CONCURRENCY,
  MIN_CONCURRENCY,
  buildVerifiedUrls,
  loadDiscovery,
  saveVerification,
  verifyDiscovery,
  type CandidateVerification,
} from "./verifier/index.js";

/**
 * web-recon Verify CLI — Task 06 (Discovery Candidate Verification).
 *
 * Flow:
 *   discovery.json → Candidate URLs → Playwright Chromium (one fresh context per
 *   candidate) → HTTP / redirect / final URL / content-type / identity signals /
 *   fingerprints → verification.json + verified-urls.json (same run directory).
 *
 * This command NEVER calls Firecrawl — it reuses already-discovered data. It is
 * read-only (GET navigation + inspection only). Deep Observation is a separate
 * command (`pnpm observe`).
 */

interface ParsedArgs {
  discoveryFile?: string;
  concurrency: number;
}

function parseArgs(argv: readonly string[]): ParsedArgs {
  let discoveryFile: string | undefined;
  let concurrency = DEFAULT_CONCURRENCY;

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--concurrency") {
      concurrency = parseConcurrency(argv[++i]);
    } else if (arg.startsWith("--concurrency=")) {
      concurrency = parseConcurrency(arg.slice("--concurrency=".length));
    } else if (arg.startsWith("--")) {
      throw new Error(`Unknown option: ${arg}`);
    } else if (discoveryFile === undefined) {
      discoveryFile = arg;
    }
  }

  return { discoveryFile, concurrency };
}

function parseConcurrency(value: string | undefined): number {
  const n = Number(value);
  if (!Number.isInteger(n) || n < MIN_CONCURRENCY || n > MAX_CONCURRENCY) {
    throw new Error(
      `--concurrency expects an integer ${MIN_CONCURRENCY}–${MAX_CONCURRENCY}, got: ${value ?? "(missing)"}`,
    );
  }
  return n;
}

function printUsage(): void {
  console.log("Usage: pnpm verify <path-to-discovery.json> [--concurrency N]");
  console.log(
    `  --concurrency N   candidates verified in parallel (${MIN_CONCURRENCY}–${MAX_CONCURRENCY}, default ${DEFAULT_CONCURRENCY})`,
  );
}

/** Short, fixed-width status label for the per-candidate progress line. */
function statusLabel(v: CandidateVerification): string {
  switch (v.status) {
    case "valid-html":
      return "200 HTML ";
    case "http-error":
      return `${v.httpStatus ?? "ERR"} ERROR `.padEnd(9);
    case "navigation-error":
      return "NAV-ERR  ";
    case "non-html":
      return "NON-HTML ";
    case "external-redirect":
      return "EXTERNAL ";
    case "blocked":
      return `${v.httpStatus ?? "BLK"} BLOCK `.padEnd(9);
  }
}

async function main(): Promise<void> {
  console.log("web-recon — verify (Playwright candidate verification)");
  console.log("");

  let args: ParsedArgs;
  try {
    args = parseArgs(process.argv.slice(2));
  } catch (err) {
    console.error(err instanceof Error ? err.message : String(err));
    printUsage();
    process.exitCode = 1;
    return;
  }

  if (!args.discoveryFile) {
    printUsage();
    return;
  }

  try {
    const { discovery, runDir, sourceDiscoveryFile } = await loadDiscovery(
      args.discoveryFile,
    );

    console.log("Source:");
    console.log(sourceDiscoveryFile);
    console.log("");
    console.log(`Root: ${discovery.rootUrl}`);
    console.log(`Candidates: ${discovery.links.length}`);
    console.log(`Concurrency: ${args.concurrency}`);
    console.log("");

    const result = await verifyDiscovery(discovery, {
      concurrency: args.concurrency,
      sourceDiscoveryFile,
      onProgress: (done, total, v) => {
        const total3 = String(total);
        const arrow =
          v.redirected && v.finalUrl && v.finalUrl !== v.candidateUrl
            ? ` → ${v.finalUrl}`
            : "";
        console.log(
          `[${String(done).padStart(total3.length)}/${total3}] ${statusLabel(v)} ${v.candidateUrl}${arrow}`,
        );
      },
    });

    const verifiedUrls = buildVerifiedUrls(
      result.candidates,
      result.rootUrl,
      sourceDiscoveryFile,
      result.verifiedAt,
    );

    const saved = await saveVerification(runDir, result, verifiedUrls);

    console.log("");
    console.log(`Candidates: ${result.totalCandidates}`);
    console.log(`Valid HTML: ${result.validHtmlCount}`);
    console.log(`Unique verified URLs: ${verifiedUrls.count}`);
    console.log(`Redirected: ${result.redirectedCount}`);
    console.log(`HTTP errors: ${result.httpErrorCount}`);
    console.log(`Navigation errors: ${result.navigationErrorCount}`);
    console.log(`Non-HTML: ${result.nonHtmlCount}`);
    console.log(`External redirects: ${result.externalRedirectCount}`);
    console.log(`Blocked: ${result.blockedCount}`);
    console.log(`Unique final URLs: ${result.uniqueFinalUrlCount}`);
    console.log(`Duplicate groups: ${result.duplicateGroupCount}`);
    console.log("");
    console.log("Saved:");
    console.log(saved.verificationPath);
    console.log(saved.verifiedUrlsPath);
  } catch (err) {
    console.error(err instanceof Error ? err.message : String(err));
    process.exitCode = 1;
  }
}

void main();
