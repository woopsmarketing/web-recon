import { chromium, type Browser } from "playwright";
import { cp, lstat, mkdir, readFile, symlink, writeFile } from "node:fs/promises";
import path from "node:path";
import {
  observePageWithBrowser,
  saveObservationIntoDir,
} from "../observer/index.js";
import {
  SiteObservationSchema,
  type ObservedSitePage,
  type SiteObservation,
} from "../multi-observer/index.js";
import type { FamilyAuditResult } from "../reconstruction-qa/index.js";
import { executeStage } from "./execute-stage.js";
import { portablePath, type E2eRunContext } from "./run-context.js";
import { E2eError } from "./types.js";

/**
 * Family-representation escalation (Task 16, items 63–67).
 *
 * Task 15 audited 14 family-represented routes across four sites and found four
 * where the representative was visibly the wrong page — `nextjs.org/blog/next-12-2`
 * rendered as the blog INDEX, at content divergence 0.500. That is a selection
 * limitation, not a generator defect, and Task 15 correctly refused to patch the
 * representative's DOM to hide it.
 *
 * The fix that IS available is the boring one: go and observe that exact URL.
 * This module does only that, under three constraints:
 *
 *  - **Only routes the audit called a MAJOR mismatch** (item 64). Not every
 *    family member, not a sample, not "while we are here".
 *  - **At most `--family-escalation N`**, default 4, so a site with 200
 *    family-represented routes cannot turn one escalation into a second crawl.
 *  - **The original observation run is never edited** (item 66). A new
 *    AUGMENTED run directory is written containing the original run's pages by
 *    reference plus the newly observed ones, and its manifest records the run it
 *    extends. Task 08's family definition is left exactly as it was — the point
 *    is to observe the page, not to relitigate the grouping (item 65).
 */

/**
 * Link one already-observed page directory into the augmented run.
 *
 * A relative symlink first, because it costs nothing and cannot diverge from the
 * original. `cp -r` is the fallback for filesystems that refuse symlinks; the
 * copy is still read-only in practice, since nothing downstream writes into a
 * site-observation page directory.
 */
async function linkOrCopyDir(target: string, link: string): Promise<void> {
  if (await pathExists(link)) return;
  const relativeTarget = path.relative(path.dirname(link), target);
  try {
    await symlink(relativeTarget, link, "dir");
  } catch {
    await cp(target, link, { recursive: true });
  }
}

async function pathExists(target: string): Promise<boolean> {
  try {
    await lstat(target);
    return true;
  } catch {
    return false;
  }
}

export interface FamilyEscalationInput {
  context: E2eRunContext;
  /** The Task 09 manifest this run produced. */
  siteObservationFile: string;
  audits: readonly FamilyAuditResult[];
  /** Hard cap from `--family-escalation`. Zero disables the stage entirely. */
  limit: number;
}

export interface FamilyEscalationResult {
  /** Absolute path of the augmented site-observation.json, when one was made. */
  augmentedObservationFile?: string;
  escalatedUrls: string[];
  skippedUrls: string[];
}

/**
 * Deterministic selection: worst content divergence first, then worst structure
 * divergence, then lexical URL. A run that escalates 4 of 9 candidates must pick
 * the same 4 every time, or the "did escalation improve fidelity?" comparison is
 * measuring the sampler.
 */
export function selectEscalationTargets(
  audits: readonly FamilyAuditResult[],
  limit: number,
): FamilyAuditResult[] {
  const major = audits.filter(
    (audit) => audit.majorContentMismatch || audit.majorStructureMismatch,
  );
  const sorted = [...major].sort((a, b) => {
    const contentDelta = (b.contentDivergence ?? 0) - (a.contentDivergence ?? 0);
    if (contentDelta !== 0) return contentDelta;
    const structureDelta = (b.structureDivergence ?? 0) - (a.structureDivergence ?? 0);
    if (structureDelta !== 0) return structureDelta;
    return a.url < b.url ? -1 : a.url > b.url ? 1 : 0;
  });
  return sorted.slice(0, Math.max(0, limit));
}

export async function runFamilyEscalationStage(
  input: FamilyEscalationInput,
): Promise<FamilyEscalationResult> {
  const { context } = input;
  const targets = selectEscalationTargets(input.audits, input.limit);

  const { value } = await executeStage<FamilyEscalationResult>({
    context,
    stage: "family-escalation",
    onError: "escalation-failure",
    run: async () => {
      if (targets.length === 0) {
        return {
          outcome: {
            status: "ok" as const,
            counts: { candidates: 0, escalated: 0, failed: 0 },
            warnings: [],
          },
          value: { escalatedUrls: [], skippedUrls: [] },
        };
      }

      const manifestPath = path.resolve(input.siteObservationFile);
      const sourceDir = path.dirname(manifestPath);
      const original = SiteObservationSchema.parse(
        JSON.parse(await readFile(manifestPath, "utf8")),
      );

      // A NEW immutable run directory beside the original (item 66). The
      // original's own files are never opened for writing, and the augmented
      // manifest names the run it extends so the lineage stays explicit.
      const augmentedDir = `${sourceDir}-augmented`;
      await mkdir(path.join(augmentedDir, "pages"), { recursive: true });

      /*
       * The augmented manifest keeps the original run's page entries, whose
       * `pageObservationFile` paths are relative to the RUN directory. So each
       * original page directory is linked into the augmented run rather than
       * copied: a site observation is hundreds of megabytes, and duplicating it
       * to add four pages would make escalation the most expensive stage in the
       * pipeline for no benefit. A symlink is read-only from here — the original
       * bytes are never written through it.
       */
      for (const page of original.pages) {
        if (page.pageObservationFile === undefined) continue;
        const pageDirName = path.dirname(page.pageObservationFile);
        const target = path.resolve(sourceDir, pageDirName);
        const link = path.join(augmentedDir, pageDirName);
        await mkdir(path.dirname(link), { recursive: true });
        await linkOrCopyDir(target, link);
      }

      const browser: Browser = await chromium.launch();
      const escalatedUrls: string[] = [];
      const skippedUrls: string[] = [];
      const newPages: ObservedSitePage[] = [];
      try {
        let index = 0;
        for (const audit of targets) {
          index++;
          // Escalated pages get their own id block so they can never collide
          // with, or renumber, a production page id from the source run.
          const pageId = `x${String(index).padStart(6, "0")}`;
          const startedAt = new Date().toISOString();
          const started = Date.now();
          context.log(
            `[e2e]   escalate [${index}/${targets.length}] ${pageId} ${audit.url}`,
          );
          try {
            const observed = await observePageWithBrowser(browser, audit.url, {
              prepareScroll: context.options.prepareScroll,
            });
            const pageDir = path.join(augmentedDir, "pages", pageId);
            const saved = await saveObservationIntoDir(pageDir, observed);
            newPages.push({
              pageId,
              url: audit.url,
              /*
               * `validation-sample`, not `representative` (item 65).
               *
               * Task 09 already has a word for "a real observation of a family
               * member that is not the representative", and that is exactly what
               * this is. Claiming `representative` would put two representatives
               * in one family and, worse, would read as a change to Task 08's
               * grouping — which this stage explicitly does not make.
               *
               * The effect on the SiteSpec is the one that matters:
               * `compileRoutes` gives a route with its own observation
               * `validation-sample-observed` coverage and renders it from ITS
               * OWN page rather than from the representative's. The route stops
               * being family-represented because it stopped being represented.
               */
              role: "validation-sample",
              familyId: audit.familyId,
              familyType: "singleton",
              familyMemberCount: 1,
              status: "success",
              startedAt,
              completedAt: new Date().toISOString(),
              elapsedMs: Date.now() - started,
              pageObservationFile: `pages/${pageId}/observation.json`,
              finalUrl: saved.target.finalUrl,
              title: saved.target.title,
              responsiveSummary: saved.responsiveSummary,
              bytes: saved.sizes.runTotalBytes,
            });
            escalatedUrls.push(audit.url);
          } catch (err) {
            skippedUrls.push(audit.url);
            context.log(
              `[e2e]   escalate ${pageId} FAILED: ${err instanceof Error ? err.message : String(err)}`,
            );
          }
        }
      } finally {
        await browser.close();
      }

      if (escalatedUrls.length === 0) {
        return {
          outcome: {
            status: "partial" as const,
            counts: {
              candidates: targets.length,
              escalated: 0,
              failed: skippedUrls.length,
            },
            warnings: skippedUrls.map((url) => `escalated observation failed: ${url}`),
            failure: "escalation-failure" as const,
          },
          value: { escalatedUrls, skippedUrls },
        };
      }

      const augmented: SiteObservation = {
        ...original,
        pages: [...original.pages, ...newPages],
      };
      const augmentedFile = path.join(augmentedDir, "site-observation.json");
      await writeFile(
        augmentedFile,
        `${JSON.stringify(SiteObservationSchema.parse(augmented), null, 2)}\n`,
        "utf8",
      );
      const portable = portablePath(augmentedFile);
      context.lineage.augmentedObservationFile = portable;

      return {
        outcome: {
          artifact: portable,
          runDir: portablePath(augmentedDir),
          counts: {
            candidates: targets.length,
            escalated: escalatedUrls.length,
            failed: skippedUrls.length,
          },
          warnings: skippedUrls.map((url) => `escalated observation failed: ${url}`),
        },
        value: {
          augmentedObservationFile: augmentedFile,
          escalatedUrls,
          skippedUrls,
        },
      };
    },
  });

  if (!value) {
    throw new E2eError("family escalation produced no result", "escalation-failure");
  }
  return value;
}
