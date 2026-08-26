import { STAGE_ORDER, type StageName } from "./types.js";

/**
 * The pipeline as DATA (Task 16, items 33, 36).
 *
 * `runE2eReconstruction()` is a straight line of thirteen calls, and this table
 * is what a report, a CLI and a fixture read instead of re-deriving that line
 * from the code. It exists so three questions have one answer each:
 *
 *   what runs, in what order?          → STAGE_ORDER
 *   what does each stage cost?         → `browser` / `network`
 *   why is a stage missing from a run? → `optional`
 *
 * The `browser` and `network` columns are the cost model item 135 asks the
 * report to explain. They are declarations checked against the import graph by
 * the smoke test rather than by convention: the offline stages genuinely cannot
 * reach Playwright or Firecrawl, because they do not import them.
 */

export interface StageDescriptor {
  stage: StageName;
  /** One line, in the vocabulary a reader of the report would use. */
  description: string;
  /** Launches Chromium. The dominant cost of the pipeline. */
  browser: boolean;
  /** Touches the public internet at all. */
  network: boolean;
  /** Calls the Firecrawl API. Exactly one stage may (item 45). */
  firecrawl: boolean;
  /** Skipped when its precondition is absent, rather than failing. */
  optional: boolean;
}

export const STAGE_REGISTRY: readonly StageDescriptor[] = [
  {
    stage: "discovery",
    description: "enumerate candidate URLs for the root",
    browser: false,
    network: true,
    firecrawl: true,
    optional: false,
  },
  {
    stage: "verification",
    description: "visit each candidate once; keep the real, same-site HTML pages",
    browser: true,
    network: true,
    firecrawl: false,
    optional: false,
  },
  {
    stage: "selection",
    description: "group verified URLs into families and pick one representative each",
    browser: false,
    network: false,
    firecrawl: false,
    optional: false,
  },
  {
    stage: "observation",
    description: "deep-observe every selected page at desktop and mobile",
    browser: true,
    network: true,
    firecrawl: false,
    optional: false,
  },
  {
    stage: "interaction-detection",
    description: "find what COULD be interacted with, from the saved observation",
    browser: false,
    network: false,
    firecrawl: false,
    optional: false,
  },
  {
    stage: "interaction-exploration",
    description: "click the planned candidates safely and record what changed",
    browser: true,
    network: true,
    firecrawl: false,
    optional: false,
  },
  {
    stage: "interaction-modeling",
    description: "name the verified transitions, and classify the rest as unknown",
    browser: false,
    network: false,
    firecrawl: false,
    optional: false,
  },
  {
    stage: "sitespec",
    description: "compile everything into one self-contained reconstruction IR",
    browser: false,
    network: false,
    firecrawl: false,
    optional: false,
  },
  {
    stage: "reconstruction",
    description: "generate a Next.js / React / TypeScript app from the SiteSpec alone",
    browser: false,
    network: false,
    firecrawl: false,
    optional: false,
  },
  {
    stage: "build",
    description: "next build, so the clone is proven to be a real application",
    browser: false,
    network: false,
    firecrawl: false,
    optional: false,
  },
  {
    stage: "qa",
    description: "compare snapshot, live original and clone; classify every difference",
    browser: true,
    network: true,
    firecrawl: false,
    optional: false,
  },
  {
    stage: "family-escalation",
    description: "observe the exact URLs the family audit found badly represented",
    browser: true,
    network: true,
    firecrawl: false,
    optional: true,
  },
  {
    stage: "final-validation",
    description: "audit the generated app for independence from origin and pipeline",
    browser: false,
    network: false,
    firecrawl: false,
    optional: false,
  },
];

/** Sanity: the registry must describe every stage exactly once, in order. */
export function assertRegistryIntegrity(): void {
  const declared = STAGE_REGISTRY.map((entry) => entry.stage);
  if (declared.length !== STAGE_ORDER.length) {
    throw new Error(
      `stage registry declares ${declared.length} stages but STAGE_ORDER has ${STAGE_ORDER.length}`,
    );
  }
  for (let i = 0; i < declared.length; i++) {
    if (declared[i] !== STAGE_ORDER[i]) {
      throw new Error(
        `stage registry order diverges at index ${i}: ${declared[i]} vs ${STAGE_ORDER[i]}`,
      );
    }
  }
  const firecrawl = STAGE_REGISTRY.filter((entry) => entry.firecrawl);
  if (firecrawl.length !== 1 || firecrawl[0]!.stage !== "discovery") {
    throw new Error(
      "exactly one stage — discovery — may call Firecrawl (Task 16 item 45)",
    );
  }
}
