import {
  buildVerifiedUrls,
  loadDiscovery,
  saveVerification,
  verifyDiscovery,
  type VerifiedUrlSet,
} from "../verifier/index.js";
import {
  assertSelectionInvariants,
  buildPageFamilies,
  buildPageSelection,
  loadSelectionInput,
  saveSelection,
  type PageSelection,
} from "../selector/index.js";
import { executeStage } from "./execute-stage.js";
import { portablePath, type E2eRunContext } from "./run-context.js";
import { E2eError } from "./types.js";

/**
 * Stages 2 and 3 — Verification and Selection (Task 16).
 *
 * They live in one file because they are one thought: a Firecrawl Map result is
 * a list of CANDIDATES, and these two stages turn it into "the pages actually
 * worth putting a browser on twice".
 *
 * Both re-enter through their own loaders (`loadDiscovery`,
 * `loadSelectionInput`) rather than being handed the in-memory objects the
 * previous stage produced. That looks like a redundant round trip and is the
 * point: it exercises the same on-disk contract the standalone CLIs use, so an
 * E2E run cannot pass because an object was still in memory when the artifact
 * on disk was wrong.
 */

export interface VerificationStageResult {
  verifiedUrls: VerifiedUrlSet;
  verificationFile: string;
  verifiedUrlsFile: string;
}

export async function runVerificationStage(
  context: E2eRunContext,
  discoveryFile: string,
): Promise<VerificationStageResult> {
  const { value } = await executeStage<VerificationStageResult>({
    context,
    stage: "verification",
    onError: "verification-failure",
    run: async () => {
      const { discovery, runDir, sourceDiscoveryFile } =
        await loadDiscovery(discoveryFile);
      if (discovery.rootUrl !== context.rootUrl) {
        throw new E2eError(
          `discovery.json describes ${discovery.rootUrl}, not this run's root ${context.rootUrl}`,
          "verification-failure",
        );
      }

      const result = await verifyDiscovery(discovery, {
        concurrency: context.options.concurrency,
        sourceDiscoveryFile,
        onProgress: (done, total, candidate) => {
          context.log(
            `[e2e]   verify [${done}/${total}] ${candidate.status} ${candidate.candidateUrl}`,
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

      const verificationFile = portablePath(saved.verificationPath);
      const verifiedUrlsFile = portablePath(saved.verifiedUrlsPath);
      context.lineage.verificationFile = verificationFile;
      context.lineage.verifiedUrlsFile = verifiedUrlsFile;

      const warnings: string[] = [];
      if (result.blockedCount > 0) {
        // Item 146: a site that refuses an anonymous browser is REPORTED as
        // blocked. Nothing here retries with a different UA or a stealth patch.
        warnings.push(
          `${result.blockedCount} candidate(s) were blocked by the site; no bypass was attempted`,
        );
      }

      return {
        outcome: {
          artifact: verifiedUrlsFile,
          runDir: portablePath(runDir),
          counts: {
            candidates: result.totalCandidates,
            validHtml: result.validHtmlCount,
            verified: verifiedUrls.count,
            httpErrors: result.httpErrorCount,
            navigationErrors: result.navigationErrorCount,
            nonHtml: result.nonHtmlCount,
            externalRedirects: result.externalRedirectCount,
            blocked: result.blockedCount,
          },
          warnings,
          ...(verifiedUrls.count === 0
            ? { failure: "verification-empty" as const }
            : {}),
        },
        value: { verifiedUrls, verificationFile, verifiedUrlsFile },
      };
    },
  });

  if (!value) {
    throw new E2eError("verification produced no result", "verification-failure");
  }
  return value;
}

export interface SelectionStageResult {
  selection: PageSelection;
  selectedPagesFile: string;
  pageFamiliesFile: string;
}

export async function runSelectionStage(
  context: E2eRunContext,
  verifiedUrlsFile: string,
  verificationFile: string,
): Promise<SelectionStageResult> {
  const { value } = await executeStage<SelectionStageResult>({
    context,
    stage: "selection",
    onError: "selection-failure",
    run: async () => {
      const input = await loadSelectionInput(verifiedUrlsFile, verificationFile);
      // Selection is offline and deterministic, and its `builtAt` is the only
      // clock it touches — recorded as provenance, never read by a rule.
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

      const selectedPagesFile = portablePath(saved.selectionPath);
      const pageFamiliesFile = portablePath(saved.familiesPath);
      context.lineage.selectedPagesFile = selectedPagesFile;
      context.lineage.pageFamiliesFile = pageFamiliesFile;

      return {
        outcome: {
          artifact: selectedPagesFile,
          counts: {
            verifiedUrls: selection.verifiedUrlCount,
            families: selection.familyCount,
            selected: selection.selectedCount,
            reduced: selection.reductionCount,
            largestFamily: selection.largestFamilySize,
          },
          warnings: [],
        },
        value: { selection, selectedPagesFile, pageFamiliesFile },
      };
    },
  });

  if (!value) {
    throw new E2eError("selection produced no result", "selection-failure");
  }
  return value;
}
