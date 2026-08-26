import path from "node:path";
import {
  FirecrawlDiscoveryProvider,
  buildDiscoveryResult,
  saveDiscovery,
  type DiscoveryProvider,
  type DiscoveryResult,
} from "../discovery/index.js";
import { executeStage } from "./execute-stage.js";
import { portablePath, type E2eRunContext } from "./run-context.js";
import { E2eError } from "./types.js";

/**
 * Stage 1 — Discovery (Task 16, item 45).
 *
 * Firecrawl is called HERE and nowhere else in the pipeline. That is not a
 * convention: `DiscoveryProvider` is the only Firecrawl-shaped interface in the
 * repo, and no other stage imports the adapter, so the cost model in the report
 * ("Firecrawl: discovery only") is a property of the import graph.
 *
 * The provider is injectable for one honest reason: a fixture site on
 * `127.0.0.1` cannot be mapped by a hosted crawler, and item 107 requires the
 * E2E smoke to run the REAL chain against a local synthetic site. Injecting a
 * local enumerator keeps Discovery a real stage producing a real
 * `discovery.json` that the real verifier consumes — as opposed to hand-writing
 * an artifact and calling the result end-to-end, which item 110 forbids. A run
 * that used an injected provider records `localDiscovery: true` in its manifest.
 */

export interface DiscoveryStageInput {
  context: E2eRunContext;
  /** Defaults to the Firecrawl adapter. */
  provider?: DiscoveryProvider;
  firecrawlApiKey?: string;
}

export interface DiscoveryStageResult {
  discovery: DiscoveryResult;
  discoveryFile: string;
  runDir: string;
}

export async function runDiscoveryStage(
  input: DiscoveryStageInput,
): Promise<DiscoveryStageResult> {
  const { context } = input;

  const { value } = await executeStage<DiscoveryStageResult>({
    context,
    stage: "discovery",
    onError: "discovery-failure",
    run: async () => {
      const provider =
        input.provider ??
        new FirecrawlDiscoveryProvider(
          input.firecrawlApiKey ??
            (() => {
              throw new E2eError(
                "no Firecrawl API key is configured and no discovery provider was injected, " +
                  "so the discovery stage cannot run",
                "discovery-failure",
              );
            })(),
        );

      const options = { maxUrls: context.options.maxUrls };
      const raw = await provider.discover(context.rootUrl, options);
      const result = buildDiscoveryResult(raw, context.rootUrl, options);
      const saved = await saveDiscovery(raw, result);

      const discoveryFile = portablePath(saved.resultPath);
      const runDir = portablePath(path.dirname(path.resolve(saved.resultPath)));
      context.lineage.discoveryFile = discoveryFile;
      context.lineage.discoveryRunDir = runDir;

      return {
        outcome: {
          artifact: discoveryFile,
          runDir,
          counts: {
            raw: result.rawCount,
            normalized: result.normalizedCount,
            duplicates: result.duplicateCount,
            invalid: result.invalidCount,
            externalFiltered: result.externalFilteredCount,
            rootSeeded: result.rootSeeded === true ? 1 : 0,
          },
          warnings:
            result.rootSeeded === true
              ? [
                  "the provider did not return the input root URL; it was seeded into the candidate set (Root URL Invariant)",
                ]
              : [],
          // An empty discovery is fatal and named as such: everything after it
          // would be a pipeline describing nothing, reported as a success.
          ...(result.links.length === 0
            ? { failure: "discovery-empty" as const }
            : {}),
        },
        value: { discovery: result, discoveryFile, runDir },
      };
    },
  });

  if (!value) {
    throw new E2eError("discovery produced no result", "discovery-failure");
  }
  return value;
}
