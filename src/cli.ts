import { env } from "./config/env.js";
import {
  DEFAULT_MAX_URLS,
  FirecrawlDiscoveryProvider,
  buildDiscoveryResult,
  saveDiscovery,
  type DiscoveryOptions,
} from "./discovery/index.js";

/**
 * web-recon CLI — Phase 2 (Firecrawl URL Discovery).
 *
 * Flow:
 *   URL → Firecrawl Map → normalize → deduplicate → same-site filter →
 *   DiscoveryResult → JSON on disk.
 *
 * The API key is never printed.
 */

interface CliArgs {
  target?: string;
  maxUrls: number;
}

/** Minimal, dependency-free argument parsing: `<url> [--max-urls N]`. */
function parseArgs(argv: string[]): CliArgs {
  let target: string | undefined;
  let maxUrls = DEFAULT_MAX_URLS;

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--max-urls" || arg === "--max-urls=") {
      maxUrls = parseMaxUrls(argv[++i]);
    } else if (arg.startsWith("--max-urls=")) {
      maxUrls = parseMaxUrls(arg.slice("--max-urls=".length));
    } else if (arg.startsWith("--")) {
      throw new Error(`Unknown option: ${arg}`);
    } else if (target === undefined) {
      target = arg;
    }
  }

  return { target, maxUrls };
}

function parseMaxUrls(value: string | undefined): number {
  const n = Number(value);
  if (!Number.isInteger(n) || n <= 0) {
    throw new Error(`--max-urls expects a positive integer, got: ${value ?? "(missing)"}`);
  }
  return n;
}

function printUsage(): void {
  console.log("Usage: pnpm recon <url> [--max-urls N]");
  console.log(`  --max-urls N   cap discovered URLs (default ${DEFAULT_MAX_URLS})`);
}

async function main(): Promise<void> {
  console.log("web-recon");
  console.log("");

  let args: CliArgs;
  try {
    args = parseArgs(process.argv.slice(2));
  } catch (err) {
    console.error(err instanceof Error ? err.message : String(err));
    printUsage();
    process.exitCode = 1;
    return;
  }

  if (!args.target) {
    printUsage();
    return;
  }

  const target = args.target;
  if (!/^https?:\/\//i.test(target)) {
    console.error(`Target must be an http(s) URL, got: ${target}`);
    process.exitCode = 1;
    return;
  }

  console.log("Target:");
  console.log(target);
  console.log("");
  console.log("Discovery provider:");
  console.log("Firecrawl");
  console.log("");

  const options: DiscoveryOptions = { maxUrls: args.maxUrls };

  try {
    const provider = new FirecrawlDiscoveryProvider(env.FIRECRAWL_API_KEY);
    const raw = await provider.discover(target, options);
    const result = buildDiscoveryResult(raw, target, options);
    const saved = await saveDiscovery(raw, result);

    console.log(`Raw URLs: ${result.rawCount}`);
    console.log(`Normalized URLs: ${result.normalizedCount}`);
    console.log(`Duplicates: ${result.duplicateCount}`);
    console.log(`Invalid: ${result.invalidCount}`);
    console.log(`External (filtered): ${result.externalFilteredCount}`);
    console.log("");
    console.log("Saved:");
    console.log(saved.resultPath);
  } catch (err) {
    console.error(err instanceof Error ? err.message : String(err));
    process.exitCode = 1;
  }
}

void main();
