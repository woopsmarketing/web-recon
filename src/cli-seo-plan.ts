import { readFile } from "node:fs/promises";
import { createProductionSeoPlanRun, type ProvidedBusinessFacts } from "./seo/index.js";

/**
 * web-recon SEO — Production SEO Plan CLI (Task 21 B/C/D/F/G/I).
 *
 *   pnpm seo:plan <template-manifest> --content-run <dir> --source-snapshot <dir>
 *                 [--domain <production-domain>] [--facts <json-file>] [--output <dir>]
 *
 * Generates production-seo-plan-v1: new titles/descriptions/OG/Twitter/
 * JSON-LD derived from the INJECTED content run (copying source SEO values is
 * forbidden and checked), robots.txt + sitemap consistent with domain state,
 * a consolidated needs-input report, and the automated source-brand-isolation
 * check. No domain → preview mode (noindex,nofollow; canonical never
 * finalized). Offline and deterministic: no network, no browser, no AI.
 */

async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  const manifestRef = argv.find((a) => !a.startsWith("--"));
  const value = (flag: string): string | undefined =>
    argv.includes(flag) ? argv[argv.indexOf(flag) + 1] : undefined;
  const contentRunDir = value("--content-run");
  const sourceSnapshotRef = value("--source-snapshot");
  if (manifestRef === undefined || contentRunDir === undefined || sourceSnapshotRef === undefined) {
    console.log(
      "Usage: pnpm seo:plan <template-manifest> --content-run <dir> --source-snapshot <dir> [--domain <domain>] [--facts <json>] [--output <dir>]",
    );
    process.exitCode = 1;
    return;
  }
  const factsFile = value("--facts");
  const facts: ProvidedBusinessFacts | undefined =
    factsFile !== undefined ? (JSON.parse(await readFile(factsFile, "utf8")) as ProvidedBusinessFacts) : undefined;
  const { manifest, outputDir } = await createProductionSeoPlanRun({
    templateManifestRef: manifestRef,
    contentRunDir,
    sourceSnapshotRef,
    productionDomain: value("--domain"),
    facts,
    outputDir: value("--output"),
    log: (line) => console.log(line),
  });
  console.log(
    `[seo:plan] mode ${manifest.domainState.mode} — titles known ${manifest.counts.knownTitles} / needs-input ${manifest.counts.needsInputTitles}; forbidden-copy ${manifest.checks.forbiddenCopy.pass ? "PASS" : "FAIL"}; brand isolation ${manifest.checks.brandIsolation.pass ? "PASS" : "FAIL"}`,
  );
  console.log(`[seo:plan] written → ${outputDir}`);
}

main().catch((err) => {
  console.error("[seo:plan] ERROR —", err instanceof Error ? err.message : err);
  process.exitCode = 1;
});
