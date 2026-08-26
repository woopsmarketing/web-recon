import {
  assertSelectionInvariants,
  buildPageFamilies,
  buildPageSelection,
  loadSelectionInput,
  saveSelection,
  type PageFamilyType,
} from "./selector/index.js";

/**
 * web-recon Select CLI — Task 07 (Page Family & Representative Selection).
 *
 * Flow:
 *   verified-urls.json + verification.json → route features → hierarchical Page
 *   Family grouping → one deterministic representative per family →
 *   page-families.json + selected-pages.json (same run directory).
 *
 * This command is **offline deterministic processing**: it never calls Firecrawl,
 * never launches Playwright, and makes no network request at all. It reads only
 * data Task 06 already wrote, so it costs 0 crawl and 0 browser time. There is no
 * AI anywhere, and no arbitrary cap on how many pages may be selected — the whole
 * point is to measure how far deterministic signals actually get.
 */

interface ParsedArgs {
  verifiedUrlsFile?: string;
  verificationFile?: string;
}

function parseArgs(argv: readonly string[]): ParsedArgs {
  let verifiedUrlsFile: string | undefined;
  let verificationFile: string | undefined;

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--verification") {
      verificationFile = requireValue(argv[++i], "--verification");
    } else if (arg.startsWith("--verification=")) {
      verificationFile = requireValue(
        arg.slice("--verification=".length),
        "--verification",
      );
    } else if (arg.startsWith("--")) {
      throw new Error(`Unknown option: ${arg}`);
    } else if (verifiedUrlsFile === undefined) {
      verifiedUrlsFile = arg;
    }
  }

  return { verifiedUrlsFile, verificationFile };
}

function requireValue(value: string | undefined, option: string): string {
  if (!value) throw new Error(`${option} expects a file path`);
  return value;
}

function printUsage(): void {
  console.log("Usage: pnpm select <path-to-verified-urls.json> [--verification PATH]");
  console.log(
    "  --verification PATH   verification.json to consume (default: sibling of verified-urls.json)",
  );
}

/** Family types in the fixed order used by the summary block. */
const FAMILY_TYPE_ORDER: readonly PageFamilyType[] = [
  "content-duplicate",
  "sibling-pattern",
  "scope-structure",
  "singleton",
];

const LABEL_WIDTH = Math.max(...FAMILY_TYPE_ORDER.map((t) => t.length));

async function main(): Promise<void> {
  console.log("web-recon — select (offline page family & representative selection)");
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

  if (!args.verifiedUrlsFile) {
    printUsage();
    return;
  }

  try {
    const input = await loadSelectionInput(
      args.verifiedUrlsFile,
      args.verificationFile,
    );

    console.log("Source:");
    console.log(input.sourceVerifiedUrlsFile);
    console.log(input.sourceVerificationFile);
    console.log("");
    console.log(`Root: ${input.verifiedUrls.rootUrl}`);
    console.log("");

    const at = new Date().toISOString();
    const familySet = buildPageFamilies({
      verifiedUrls: input.verifiedUrls,
      verification: input.verification,
      sourceVerifiedUrlsFile: input.sourceVerifiedUrlsFile,
      sourceVerificationFile: input.sourceVerificationFile,
      builtAt: at,
    });
    const selection = buildPageSelection(familySet, at);
    assertSelectionInvariants(familySet, selection);

    const saved = await saveSelection(input.runDir, familySet, selection);

    const percent = (selection.reductionRate * 100).toFixed(1);
    console.log("Page Selection");
    console.log("");
    console.log(`Verified URLs: ${selection.verifiedUrlCount}`);
    console.log(`Families: ${selection.familyCount}`);
    console.log(`Selected: ${selection.selectedCount}`);
    console.log(`Reduced: ${selection.reductionCount} (${percent}%)`);
    console.log(`Largest family: ${selection.largestFamilySize}`);
    console.log("");
    console.log("Families:");
    for (const type of FAMILY_TYPE_ORDER) {
      console.log(`${type.padEnd(LABEL_WIDTH)}  ${selection.familyTypeCounts[type]}`);
    }
    console.log("");
    console.log("Saved:");
    console.log(saved.familiesPath);
    console.log(saved.selectionPath);
  } catch (err) {
    console.error(err instanceof Error ? err.message : String(err));
    process.exitCode = 1;
  }
}

void main();
