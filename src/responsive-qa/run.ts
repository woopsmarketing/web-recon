import { mkdir, readFile, stat } from "node:fs/promises";
import path from "node:path";
import { chromium, type Browser } from "playwright";
import {
  encodePng,
  measurePair,
  renderDiffImage,
  type DecodedImage,
} from "../reconstruction-qa/screenshot-diff.js";
import { startClone, type RunningClone } from "../reconstruction-qa/start-clone.js";
import { CAPTURE_POLICY, captureSide } from "./capture.js";
import { classifyPair } from "./classify.js";
import { renderComposite, renderContactSheet, type ContactSheetRow } from "./composite.js";
import { compareColumns, correspond, missingText } from "./correspondence.js";
import { gatePixels } from "./pixel-gate.js";
import { resolveRoutes } from "./routes.js";
import {
  CONTACT_SHEET_FILE,
  IMAGES_SUBDIR,
  IMAGE_MANIFEST_FILE,
  RUN_ARTIFACT_FILE,
  imageFileName,
  newResponsiveRunId,
  responsiveRunDir,
  siteFolder,
  writeRunBinary,
  writeRunJson,
} from "./store.js";
import {
  DEFAULT_WIDTHS,
  PIXEL_RESIDUAL_MINOR_RATIO,
  RUBRIC_VERSION,
  ResponsiveQaInputError,
  SOURCE_POPULATION_REVERSION_RATIO,
  SOURCE_POPULATION_SPIKE_RATIO,
  type ArtifactLimitation,
  type Classification,
  type CoverageAccounting,
  type CoverageBucket,
  type ImageManifestEntry,
  type PairOutcome,
  type PairResult,
  type PersistedSideMeasurement,
  type PixelChannels,
  type ResponsiveQaMode,
  type ResponsiveQaRunArtifact,
  type SelfCheckFloor,
  type SideMeasurement,
  type SourceStabilityReading,
  type Verdict,
} from "./types.js";

/** Four decimals, the precision every ratio in this subsystem is reported at. */
function round4(value: number): number {
  return Math.round(value * 10_000) / 10_000;
}

/**
 * The five-width responsive QA run (Task 28.6, lane W3).
 *
 * ONE browser and ONE clone server, both stopped in a `finally`, because other
 * agents share this machine. Pairs are measured sequentially: the source is a
 * live public site and a parallel sweep would both hammer it and make the
 * measurements depend on network contention.
 *
 * For every (route, width): capture SOURCE, capture FINAL with the same code,
 * measure, compare, classify, and write a composite. Nothing short-circuits —
 * a pair that fails to capture is recorded as a failure and the sweep
 * continues, because a partial sweep with a named hole is more useful than no
 * sweep at all.
 */

export interface RunResponsiveQaOptions {
  /** Reconstruction manifest file, run directory, or generated app directory. */
  target: string;
  siteSpecFile?: string;
  explicitRoutes?: string[];
  sourceOrigin?: string;
  widths?: number[];
  outputDir?: string;
  forceBuild?: boolean;
  /** Skip the per-pair diff PNG (the composite is always written). */
  skipDiffImages?: boolean;
  /**
   * Measure the SOURCE against a second capture of ITSELF instead of against
   * the clone (Task 28.6, item C3.1).
   *
   * This is the only way to answer "is PASS reachable?" with evidence rather
   * than with an assertion. Every channel in the rubric then reads the
   * INSTRUMENT plus the live source's own instability between two captures
   * seconds apart, and no clone verdict can be better than that floor. The
   * clone is not built or served in this mode.
   */
  selfCheck?: boolean;
  /**
   * Run the self-check sweep FIRST, in this same invocation, and record it as
   * this run's grading floor (item G4).
   *
   * The floor is what makes a clone verdict mean anything, and it is not a
   * constant: the four Task 28.6 pilots measured three different floors on
   * three sources. Ignored when {@link selfCheck} is set — a self-check IS the
   * floor.
   */
  withSelfCheck?: boolean;
  /**
   * Reference an EXISTING self-check run as this run's floor instead of
   * measuring a new one: a run id, a run directory, or the path to a
   * `responsive-qa.json`. It is read, checked for comparability (same site,
   * rubric, roster, widths and routes) and every mismatch is named in
   * `selfCheckFloor.incomparableReasons`.
   */
  selfCheckRunFile?: string;
  onLog?: (line: string) => void;
}

export interface RunResponsiveQaResult {
  runId: string;
  runDir: string;
  artifact: ResponsiveQaRunArtifact;
}

/**
 * Drop the three unbounded fields; keep their sizes AND their totals.
 *
 * `regions` joins `leaves` and `visibleTextEntries` here (Task 28.75): 120
 * boxes per side per width is another artifact-dominating array, and what a
 * reader actually needs from it — how many were selected, how many refused and
 * for which of the seven enumerated reasons — is `regionAccounting`, which is
 * bounded and survives.
 */
function persistSide(side: SideMeasurement): PersistedSideMeasurement {
  const { leaves, visibleTextEntries, regions, ...rest } = side;
  let occurrences = 0;
  let truncatedKeys = 0;
  for (const entry of visibleTextEntries) {
    occurrences += entry.occurrences;
    if (entry.truncated) truncatedKeys++;
  }
  return {
    ...rest,
    leafCount: leaves.length,
    regionCount: regions.length,
    visibleTextStringCount: visibleTextEntries.length,
    visibleTextOccurrences: occurrences,
    visibleTextTruncatedKeys: truncatedKeys,
  };
}

function pixelsFrom(
  sourcePng: Buffer,
  clonePng: Buffer,
): { channels: PixelChannels; decoded?: { a: DecodedImage; b: DecodedImage } } {
  const { metric, decoded } = measurePair({
    pair: "original-clone",
    a: sourcePng,
    b: clonePng,
    aLabel: "source",
    bLabel: "final",
  });
  if (!metric.available) {
    return {
      channels: {
        available: false,
        ...(metric.unavailableReason
          ? { unavailableReason: metric.unavailableReason }
          : {}),
      },
    };
  }
  // The C3.1 split runs on the SAME two decoded images the raw metric used, so
  // the gated and ungated numbers describe exactly the same overlap.
  const gate = decoded ? gatePixels(decoded.a, decoded.b) : undefined;
  const channels: PixelChannels = {
    available: true,
    ...(gate ? { gate } : {}),
    sourceWidth: metric.aWidth,
    sourceHeight: metric.aHeight,
    cloneWidth: metric.bWidth,
    cloneHeight: metric.bHeight,
    overlapPixels: metric.overlapPixels,
    changedPixelRatio: metric.changedPixelRatio,
    changedRatioAt16: metric.changedRatioAt16,
    deltaE76Mean: metric.deltaE76Mean,
    deltaE76Max: metric.deltaE76Max,
    deltaE76AboveJndRatio: metric.deltaE76AboveJndRatio,
    deltaE76AboveVisibleRatio: metric.deltaE76AboveVisibleRatio,
    commonAreaRatio: metric.commonAreaRatio,
  };
  return decoded ? { channels, decoded } : { channels };
}

/**
 * ITEM G4. The grading floor, resolved into a field the graded artifact carries.
 *
 * A verdict table without its floor is unreadable, and until now the floor lived
 * in a SEPARATE run a reader had to know to go and look for. `resolveFloor`
 * turns whichever of the three situations the caller is in — floor measured in
 * this invocation, floor referenced by run id, no floor at all — into one object
 * that always states which, and `floorVerdictIndex` puts the per-pair floor
 * verdict beside every row of the verdict table.
 */
export async function readFloorArtifact(
  reference: string,
  site: string,
  rootUrl: string,
): Promise<{ file: string; dir: string; artifact: ResponsiveQaRunArtifact }> {
  const candidates: string[] = [];
  const asPath = path.resolve(reference);
  candidates.push(asPath.endsWith(".json") ? asPath : path.join(asPath, RUN_ARTIFACT_FILE));
  // A bare run id resolves inside this site's own run directory.
  candidates.push(path.join(responsiveRunDir(rootUrl, reference), RUN_ARTIFACT_FILE));
  for (const file of candidates) {
    const found = await stat(file).then(
      (entry) => entry.isFile(),
      () => false,
    );
    if (!found) continue;
    const artifact = JSON.parse(await readFile(file, "utf8")) as ResponsiveQaRunArtifact;
    return { file, dir: path.dirname(file), artifact };
  }
  throw new ResponsiveQaInputError(
    `--self-check-run ${reference}: no responsive-qa.json found for site ${site}; tried ${candidates.join(" and ")}`,
  );
}

function sameList(a: readonly (string | number)[], b: readonly (string | number)[]): boolean {
  return a.length === b.length && a.every((item, index) => item === b[index]);
}

export function floorFrom(
  floor: ResponsiveQaRunArtifact,
  file: string,
  dir: string,
  status: "measured" | "referenced",
  self: {
    site: string;
    rubricVersion: number;
    channelRoster: string[];
    widths: number[];
    routes: string[];
  },
): SelfCheckFloor {
  const reasons: string[] = [];
  if (floor.mode !== "self-check") {
    reasons.push(`the referenced run's mode is "${floor.mode}", not "self-check"`);
  }
  if (floor.site !== self.site) {
    reasons.push(`site ${floor.site} !== ${self.site}`);
  }
  if (floor.rubricVersion !== self.rubricVersion) {
    reasons.push(
      `rubricVersion ${floor.rubricVersion} !== ${self.rubricVersion}: the two runs were graded by different rubrics and their verdicts may not be compared`,
    );
  }
  if (!sameList(floor.channelRoster, self.channelRoster)) {
    reasons.push(
      `channelRoster differs (${floor.channelRoster.length} channels vs ${self.channelRoster.length})`,
    );
  }
  if (!sameList(floor.widths, self.widths)) {
    reasons.push(`widths ${floor.widths.join(",")} !== ${self.widths.join(",")}`);
  }
  if (!sameList(floor.routes, self.routes)) {
    reasons.push(`routes ${floor.routes.join(",")} !== ${self.routes.join(",")}`);
  }
  const comparable = reasons.length === 0;
  return {
    status,
    statement: comparable
      ? `FLOOR: the source measured against a second capture of itself scored ${floor.summary.passPairs} PASS / ${floor.summary.minorPairs} MINOR / ${floor.summary.majorPairs} MAJOR / ${floor.summary.blockerPairs} BLOCKER over ${floor.summary.pairsMeasured} pairs (run ${floor.runId}). No verdict in this artifact can be better than the floor at the same pair, and a verdict AT its floor is not evidence of a clone defect.`
      : `FLOOR REFERENCED BUT NOT COMPARABLE (run ${floor.runId}): ${reasons.join("; ")}. Read the verdicts below as unadjudicated until a comparable floor is measured.`,
    runId: floor.runId,
    runDir: dir,
    artifactFile: file,
    rubricVersion: floor.rubricVersion,
    channelRoster: floor.channelRoster,
    comparable,
    incomparableReasons: reasons,
    summary: {
      pairsMeasured: floor.summary.pairsMeasured,
      pairsFailed: floor.summary.pairsFailed,
      blockerPairs: floor.summary.blockerPairs,
      majorPairs: floor.summary.majorPairs,
      minorPairs: floor.summary.minorPairs,
      passPairs: floor.summary.passPairs,
    },
    verdictByRouteWidth: floor.summary.verdictByRouteWidth.map((row) => ({
      route: row.route,
      width: row.width,
      verdict: row.verdict,
    })),
  };
}

/** No floor. Said loudly, in `status`, in `statement`, in a limitation and in
 *  every `floorVerdict: null` of the verdict table. */
export function absentFloor(): SelfCheckFloor {
  return {
    status: "absent",
    statement:
      "NO GRADING FLOOR. This run was not accompanied by a self-check sweep, so nothing here separates a clone defect from the instrument's own noise plus whatever the live source changed between two captures. Every verdict below is UNADJUDICATED. Re-run with --with-self-check, or point --self-check-run at an existing self-check of the same site, rubric, roster, widths and routes.",
    runId: null,
    runDir: null,
    artifactFile: null,
    rubricVersion: null,
    channelRoster: null,
    comparable: null,
    incomparableReasons: [],
    summary: null,
    verdictByRouteWidth: null,
  };
}

export function selfIsTheFloor(): SelfCheckFloor {
  return {
    status: "is-the-floor",
    statement:
      "THIS RUN IS THE FLOOR. The source is measured against a second capture of itself; there is no floor above it. Its verdicts are what the instrument plus the live source's own movement produce when nothing is being graded.",
    runId: null,
    runDir: null,
    artifactFile: null,
    rubricVersion: null,
    channelRoster: null,
    comparable: null,
    incomparableReasons: [],
    summary: null,
    verdictByRouteWidth: null,
  };
}

/**
 * The limitations of THIS run, in a field a script can read (Task 28.6).
 *
 * Everything below is derived from the pairs actually measured, not asserted:
 * if a claim cannot be supported by a number in this same artifact, it is not
 * made. The point is that a reader who never sees the lane's prose still gets
 * the caveats, and gets them attached to the numbers they qualify.
 */
function buildLimitations(
  mode: ResponsiveQaMode,
  measured: readonly PairResult[],
): ArtifactLimitation[] {
  const limitations: ArtifactLimitation[] = [];

  // -- what PASS means on this run, from this run's own numbers -------------
  const residuals = measured
    .map((pair) => pair.pixels?.gate?.residualAboveJndRatio)
    .filter((value): value is number => typeof value === "number");
  const passPairs = measured.filter((pair) => pair.classification?.verdict === "PASS");
  const pixelOnlyMinor = measured.filter(
    (pair) =>
      pair.classification?.verdict === "MINOR" &&
      pair.classification.findings.length === 1 &&
      pair.classification.findings[0]?.channel === "pixel-residual-difference-ratio",
  );
  const lowestResidual = residuals.length > 0 ? Math.min(...residuals) : null;
  const lowestResidualPair =
    lowestResidual === null
      ? undefined
      : measured.find(
          (pair) => pair.pixels?.gate?.residualAboveJndRatio === lowestResidual,
        );
  const lowestGate = lowestResidualPair?.pixels?.gate;
  limitations.push({
    id: "pass-reachability",
    statement:
      mode === "self-check"
        ? `This run measures the source against itself, so its verdicts ARE the answer to "is PASS reachable": ${passPairs.length} of ${measured.length} pairs reached PASS. Any pair that did not reach PASS here is a floor the rubric cannot see below, and a clone graded by the same rubric cannot do better than it.`
        : `PASS is awarded only when no channel fires at all. ${passPairs.length} of ${measured.length} pairs reached it on this run, and ${pixelOnlyMinor.length} were MINOR on the pixel residual and nothing else. Whether PASS is reachable AT ALL against this source is an empirical question this run cannot answer; run the same sweep with --self-check, which measures the source against a second capture of itself, and compare.`,
    evidence:
      lowestResidual === null || !lowestGate || !lowestResidualPair
        ? "no pixel gate ran on any pair"
        : `lowest pixel-residual-difference-ratio over the measured pairs: ${(lowestResidual * 100).toFixed(2)}% on ${lowestResidualPair.route} @${lowestResidualPair.width}, against a MINOR threshold of ${(PIXEL_RESIDUAL_MINOR_RATIO * 100).toFixed(0)}% of the compared AREA. On that same pair only ${(lowestGate.sourceInkRatio * 100).toFixed(2)}% of the area is ink (${lowestGate.sourceInkPixels} of ${lowestGate.overlapPixels} pixels differ from the source's own background colour), so that threshold is ${lowestGate.sourceInkRatio === 0 ? "undefined against ink" : `${((PIXEL_RESIDUAL_MINOR_RATIO / lowestGate.sourceInkRatio) * 100).toFixed(0)}% of everything the page draws`} and this residual is ${(lowestGate.residualOverInkRatio * 100).toFixed(2)}% of it. Read every PASS and every MINOR on the pixel channel against that calibration, not against the bare 1%.`,
  });

  // -- the ink calibration, stated once as its own limitation ---------------
  const gated = measured
    .map((pair) => pair.pixels?.gate)
    .filter((gate): gate is NonNullable<typeof gate> => gate !== undefined);
  if (gated.length > 0) {
    const worstInk = gated.reduce((a, b) => (a.sourceInkRatio <= b.sourceInkRatio ? a : b));
    const roundedZero = gated.filter((gate) => gate.residualRatioRoundedToZero);
    limitations.push({
      id: "pixel-thresholds-are-area-normalised-not-ink-normalised",
      statement:
        "The pixel channels divide by the COMPARED AREA, and a page is mostly background. A threshold that sounds like '1% of the page' is a much larger share of everything the page actually draws, and a defect confined to one band of real content can be well under it while being obvious to a reader. Every residual is therefore also reported against the source's own ink (pixel-residual-ink-ratio, pixel-source-ink-ratio); when the two disagree, the ink number is the one that describes what a reader sees.",
      evidence: `least-inked measured pair: ${(worstInk.sourceInkRatio * 100).toFixed(2)}% of ${worstInk.overlapPixels} compared pixels are non-background, so the ${(PIXEL_RESIDUAL_MINOR_RATIO * 100).toFixed(0)}% area band equals ${worstInk.sourceInkRatio === 0 ? "an undefined share" : `${((PIXEL_RESIDUAL_MINOR_RATIO / worstInk.sourceInkRatio) * 100).toFixed(0)}%`} of that page's ink${roundedZero.length > 0 ? `; on ${roundedZero.length} pair(s) the residual ratio ROUNDS to zero while residual pixels were measured — read the pixel counts there` : "; no measured pair has a residual ratio that rounds to a false zero"}`,
    });
  }

  // -- the composite cannot show clipped horizontal overflow ----------------
  const clipped = measured.filter((pair) => {
    const clone = pair.clone;
    return (
      clone !== undefined &&
      clone.horizontalOverflow <= 1 &&
      clone.contentMaxRightIncludingWide > clone.innerWidth + 1
    );
  });
  if (clipped.length > 0) {
    const example = clipped[0]!;
    const clone = example.clone!;
    limitations.push({
      id: "composite-cannot-show-clipped-overflow",
      statement:
        "A composite panel is exactly as wide as its screenshot, and a screenshot is exactly as wide as the document's scrollWidth. When the clone's overflow is CLIPPED rather than scrollable, scrollWidth equals the viewport, the PNG is viewport-wide, and the overflowing content is simply absent from the picture. On those pairs the composite shows the CONSEQUENCE — content missing at the right edge, a taller or shorter page — and never the overflow itself. The numeric channels (offscreen-text-excess-chars, footer-clipped, landmark-wide-element-excess) are the only evidence of it.",
      evidence: `${clipped.length} measured pair(s) have clipped overflow; e.g. ${example.route} @${example.width}: clone content reaches x=${clone.contentMaxRightIncludingWide}px in a ${clone.innerWidth}px viewport while scrollWidth stays ${clone.scrollWidth}, so the final PNG is ${pair2Width(example)}px wide — the same width as the source's.`,
    });
  }

  // -- the trust guard, with every pair it actually acted on -----------------
  const guarded = measured.filter(
    (pair) => pair.correspondence !== undefined && !pair.correspondence.trustworthy,
  );
  if (guarded.length > 0) {
    limitations.push({
      id: "position-channel-trust-guard",
      statement:
        "On these pairs the position channel was RECORDED but could not raise severity, because too little of the source's content-keyed leaf population matched a clone box. The guard suppresses findings; it never adds one. A pair listed here may be worse than its verdict says.",
      evidence: guarded
        .map(
          (pair) =>
            `${pair.route} @${pair.width}: ${pair.correspondence?.contentKeyedMatchedPairs ?? 0} of ${pair.correspondence?.contentKeyedSourceLeaves ?? 0} content-keyed leaves matched (${((pair.correspondence?.matchedFractionOfContentKeyed ?? 0) * 100).toFixed(1)}%; the ${pair.correspondence?.unlabelledMatchedPairs ?? 0} structural pairs are NOT in that numerator — item C3.11), position p90 ${pair.correspondence?.positionDeltaP90 ?? 0}px was not counted (verdict ${pair.classification?.verdict ?? "?"})`,
        )
        .join("; "),
    });
  }

  // -- the source failed to render on some pair -----------------------------
  const underRendered = measured.filter((pair) =>
    pair.classification?.findings.some(
      (finding) => finding.channel === "source-under-render-suspected",
    ),
  );
  if (underRendered.length > 0) {
    limitations.push({
      id: "source-capture-under-rendered",
      statement:
        "On these pairs the SOURCE capture came back with almost no content. Nothing on those pairs says anything about the clone: with no source text to be missing and no source box to be displaced, the clone-facing channels would have scored the pair as excellent, which is why the rubric raises a BLOCKER instead. Re-run those pairs before reading them.",
      evidence: underRendered
        .map(
          (pair) =>
            `${pair.route} @${pair.width}: source ${pair.source?.visibleTextChars ?? 0} visible chars over ${pair.source?.totalNodes ?? 0} elements (HTTP ${pair.sourceProvenance?.httpStatus ?? "?"}, ${pair.sourceProvenance?.consoleErrors ?? 0} console errors, ${pair.sourceProvenance?.screenshotBytes ?? 0} screenshot bytes) against the other side's ${pair.clone?.visibleTextChars ?? 0} chars over ${pair.clone?.totalNodes ?? 0} elements`,
        )
        .join("; "),
    });
  }

  // -- dwell makes an animated source drift away from a static clone ---------
  const dwellSensitive = measured.filter(
    (pair) =>
      (pair.sourceProvenance?.scroll.textCharsRevealed ?? 0) > 0 &&
      (pair.cloneProvenance?.scroll.textCharsRevealed ?? 0) === 0,
  );
  if (mode === "clone" && dwellSensitive.length > 0) {
    const dwell = Math.max(
      0,
      ...measured.map((pair) => pair.sourceProvenance?.scroll.waitedMs ?? 0),
    );
    limitations.push({
      id: "dwell-sensitive-source-content",
      statement:
        "The scroll-to-settle policy holds each page open for a measured dwell before probing. On these pairs the SOURCE gained visible text during that dwell while the clone gained none — the source is animating, streaming or lazily revealing content that a static reconstruction can never match, and every string it produced is counted by the missing-text channel. That channel is therefore sensitive to how long the harness sits on the page, and part of what it reports on these pairs is animation state rather than absent content. Run --self-check to separate the two: it applies the identical dwell to two captures of the source alone.",
      evidence: dwellSensitive
        .map(
          (pair) =>
            `${pair.route} @${pair.width}: source revealed ${pair.sourceProvenance?.scroll.textCharsRevealed ?? 0} chars / ${pair.sourceProvenance?.scroll.elementsRevealed ?? 0} elements during the scroll, clone revealed 0; missing-text ${(((pair.missingText?.missingRatio ?? 0) * 100)).toFixed(2)}%, reverse ${(((pair.missingTextReverse?.missingRatio ?? 0) * 100)).toFixed(2)}%`,
        )
        .join("; ") + `; longest deliberate dwell on any capture: ${dwell}ms`,
    });
  }

  // -- live source ----------------------------------------------------------
  //
  // The evidence for this one is taken from THIS run rather than quoted from
  // another site's: how much the source moved during the dwell, and — in a
  // self-check, where both sides ARE the source — how much of the residual
  // difference the source produced entirely on its own.
  const sourceDrift = measured
    .map((pair) => Math.abs(pair.sourceProvenance?.scroll.textCharsRevealed ?? 0))
    .reduce((worst, value) => (value > worst ? value : worst), 0);
  const selfDifference = measured.filter(
    (pair) =>
      (pair.missingText?.missingChars ?? 0) > 0 ||
      (pair.missingTextReverse?.missingChars ?? 0) > 0 ||
      (pair.pixels?.gate?.residualAboveJndPixels ?? 0) > 0,
  );
  limitations.push({
    id: "live-source-is-not-frozen",
    statement:
      "The harness's computation is deterministic; the SOURCE is not. No measurement here reads a clock or a random source and every list is sorted or in document order, so the same two captures always produce the same numbers. But every capture reads a live public site that can change its copy, its imagery, its experiment assignment, its animation state and its clock between one run and the next, and between the two captures inside a single pair. Reproducibility here means 'the same inputs give the same numbers', not 'this URL gives the same numbers tomorrow'.",
    evidence:
      mode === "self-check"
        ? `both sides of this run are the same live source: ${selfDifference.length} of ${measured.length} pairs still differed from themselves. Content appearing during the dwell reached ${sourceDrift} visible characters on the worst capture.`
        : `content appearing during the dwell reached ${sourceDrift} visible characters on the worst source capture of this run. To separate the source's own movement from the clone's defects, run the same sweep with --self-check.`,
  });

  // -- scroll caps ----------------------------------------------------------
  const capped = measured.filter(
    (pair) =>
      pair.sourceProvenance?.scroll.stepsCapped === true ||
      pair.cloneProvenance?.scroll.stepsCapped === true,
  );
  if (capped.length > 0) {
    limitations.push({
      id: "scroll-step-cap-reached",
      statement:
        "The scroll-to-settle pass stopped at its step cap before reaching the document bottom on these pairs. Content below the depth it reached was never revealed, so it is outside every numeric channel on that side.",
      evidence: capped
        .map(
          (pair) =>
            `${pair.route} @${pair.width}: source reached ${pair.sourceProvenance?.scroll.scrolledToPx ?? 0}px of ${pair.source?.scrollHeight ?? 0}, clone reached ${pair.cloneProvenance?.scroll.scrolledToPx ?? 0}px of ${pair.clone?.scrollHeight ?? 0}`,
        )
        .join("; "),
    });
  }

  // -- truncations ----------------------------------------------------------
  const truncated = measured.filter(
    (pair) =>
      pair.source?.leavesTruncated === true ||
      pair.clone?.leavesTruncated === true ||
      pair.correspondence?.structuralPassTruncated === true ||
      pair.source?.overlapComparisonsTruncated === true ||
      pair.clone?.overlapComparisonsTruncated === true,
  );
  if (truncated.length > 0) {
    limitations.push({
      id: "measurement-budget-reached",
      statement:
        "A leaf-box cap, an overlap comparison budget or the structural correspondence budget was reached on these pairs. The affected channels are lower bounds.",
      evidence: truncated.map((pair) => `${pair.route} @${pair.width}`).join(", "),
    });
  }

  // -- the text census cannot see everything a page paints (item C3.10) -----
  //
  // Open shadow roots ARE walked now. What is still outside the census is
  // stated here with the numbers from this run, because the missing-text
  // channel is the primary BLOCKER signal and a blind spot on it is a
  // false-PASS path.
  const shadowSource = measured.reduce(
    (sum, pair) => sum + (pair.source?.shadowTextChars ?? 0),
    0,
  );
  const shadowClone = measured.reduce(
    (sum, pair) => sum + (pair.clone?.shadowTextChars ?? 0),
    0,
  );
  const shadowRoots = measured.reduce(
    (sum, pair) => sum + (pair.source?.shadowRootsTraversed ?? 0),
    0,
  );
  limitations.push({
    id: "text-census-shadow-and-generated-content",
    statement:
      "The visible-text census walks the light DOM and every OPEN shadow root, identically on both sides. Two things remain outside it and no channel sees them: a CLOSED shadow root, which exposes no handle to script and therefore cannot even be counted, and CSS generated content (::before / ::after), which paints characters that are in no text node. Text in either place is invisible to the missing-text channel on BOTH sides, so a clone that drops it scores as if it had not — the false-PASS direction. The pixel residual is the only channel that sees such a difference at all.",
    evidence: `this run's census descended into ${shadowRoots} open shadow root(s) on the source side and counted ${shadowSource} shadow characters there against ${shadowClone} on the clone side, over ${measured.length} measured pair(s). Closed roots and generated content are, by construction, absent from both numbers.`,
  });

  // -- the strict/loose split of the missing-text test ----------------------
  const boundaryOnly = measured.filter(
    (pair) => (pair.missingText?.boundaryOnlyChars ?? 0) > 0,
  );
  if (boundaryOnly.length > 0) {
    limitations.push({
      id: "missing-text-boundary-only-population",
      statement:
        "missing-text-ratio requires a source string to appear in the clone at a TOKEN BOUNDARY, so that the source's `US` is not read as present because the clone contains `customers`. A source that splits a word across text nodes — a per-digit odometer component, say — lands in the same population and is counted as missing when its glyphs are in fact painted. That population is counted separately in every pair (missing-text-boundary-only-chars) and the looser reading is published beside it (missing-text-absent-ratio); the rubric fires on the strict number because under-reporting the primary BLOCKER signal is the false-PASS direction.",
      evidence: boundaryOnly
        .map(
          (pair) =>
            `${pair.route} @${pair.width}: ${pair.missingText?.boundaryOnlyChars ?? 0} of ${pair.missingText?.missingChars ?? 0} missing characters over ${pair.missingText?.boundaryOnlyStringCount ?? 0} strings are present in the clone as a raw substring but never at a boundary (strict ratio ${(((pair.missingText?.missingRatio ?? 0) * 100)).toFixed(2)}%, loose ratio ${(((pair.missingText?.absentRatio ?? 0) * 100)).toFixed(2)}%)`,
        )
        .join("; "),
    });
  }

  // -- the two sides do not reach the same depth (item C3.13) ---------------
  const asymmetricDepth = measured.filter((pair) => {
    const a = pair.sourceProvenance?.scroll.scrolledToPx ?? 0;
    const b = pair.cloneProvenance?.scroll.scrolledToPx ?? 0;
    return a !== b;
  });
  if (asymmetricDepth.length > 0) {
    limitations.push({
      id: "scroll-depth-asymmetry",
      statement:
        "The scroll POLICY is symmetric — identical steps, identical waits, both sides — but the DEPTH the two sides reach is not, because the two documents are not the same height. On a pair where one side stopped much shallower than the other, the two sides did not have equally much of themselves revealed before probing, and every channel on that pair is computed over that asymmetry. This is legitimate and it is not a defect of the clone; it is a limit on how far the pair's numbers can be pushed.",
      evidence: asymmetricDepth
        .map(
          (pair) =>
            `${pair.route} @${pair.width}: source ${pair.sourceProvenance?.scroll.scrolledToPx ?? 0}px of ${pair.source?.scrollHeight ?? 0}, clone ${pair.cloneProvenance?.scroll.scrolledToPx ?? 0}px of ${pair.clone?.scrollHeight ?? 0}`,
        )
        .join("; "),
    });
  }

  return limitations;
}

// ---------------------------------------------------------------------------
// WP-C GUARD 2 — a source capture that will not hold still
// ---------------------------------------------------------------------------

/**
 * Channels whose reading is a function of WHICH NODES WERE PRESENT at the
 * instant the source was captured.
 *
 * When the source capture is unstable, every one of these is graded against an
 * instant that does not reproduce: text that was not there yet reads as
 * missing, images that had not attached read as absent, a half-built page is
 * the wrong height and the screenshot is of the wrong page.
 *
 * WHAT IS DELIBERATELY *NOT* HERE, and why. Everything absent from this list is
 * preserved, and the list is stated as VOLATILE rather than as a preserve-list
 * on purpose: a channel added later is preserved by default, so the failure
 * mode of forgetting to update this list is "a finding survives that could have
 * been demoted", not "a finding disappears". For a measuring instrument that is
 * the right direction to fail in.
 *
 *   clone-route-missing           rests on two HTTP statuses; no DOM census.
 *   source-under-render-suspected is ABOUT the capture being bad. Demoting it
 *                                 would hide the very thing the guard detected.
 *   footer-clipped,
 *   landmark-wide-element-excess,
 *   horizontal-overflow-excess-px facts about the CLONE's own box model — a box
 *                                 wider than the viewport is wider than the
 *                                 viewport however many nodes the source had.
 */
const VOLATILE_CHANNELS_UNDER_SOURCE_INSTABILITY: ReadonlySet<string> = new Set([
  "missing-text-ratio",
  "visible-text-ratio",
  "offscreen-text-excess-chars",
  "overlap-excess-ratio",
  "nav-link-ratio",
  "empty-band-excess-ratio",
  "right-gutter-excess-ratio",
  "image-presence-ratio",
  "image-layer-state",
  "column-mode-delta",
  "column-container-mode-delta",
  "position-delta-p90-px",
  "logo-row-overlap",
  "logo-row-bunching",
  "scroll-height-ratio-high",
  "scroll-height-ratio-low",
  "pixel-visible-difference-ratio",
  "pixel-residual-difference-ratio",
]);

function relativeDeviation(value: number, against: number): number {
  return Math.abs(value - against) / Math.max(1, Math.abs(against));
}

/**
 * WP-C GUARD 2: find widths whose SOURCE capture is the odd one out.
 *
 * WHY A POST-HOC PASS. `classifyPair` is a pure function of ONE (route, width)
 * instant, and one instant cannot tell you whether it reproduces. The only
 * evidence that exists is the neighbouring widths of the same route, and that
 * view does not exist until both loops have closed. So the capture loop is left
 * exactly as it is — sequential, one pair at a time — and this runs over the
 * finished array.
 *
 * THE DISCRIMINATOR, which is the whole difficulty. A genuine responsive
 * breakpoint ALSO produces a single large jump in the source's node population,
 * and calling that a bad capture would blind the instrument at exactly the
 * widths it exists to measure. Deviation alone therefore cannot be the test.
 * What separates the two is what the NEXT width does:
 *
 *   breakpoint   1200 / 1200 / 2400 / 2450 — the population jumps and STAYS.
 *                The jump's neighbours (1200, 2450) are nowhere near each
 *                other, so nothing fires.
 *   bad capture  1200 / 1200 / 4200 / 1260 — the population jumps and REVERTS.
 *                The spike's neighbours (1200, 1260) agree with each other to
 *                within 5%, and the middle reading is the outlier.
 *
 * So: deviate from BOTH neighbours by at least
 * {@link SOURCE_POPULATION_SPIKE_RATIO}, in the SAME direction from each, AND
 * the two neighbours must agree with each other to within
 * {@link SOURCE_POPULATION_REVERSION_RATIO}.
 *
 * EDGE WIDTHS. The lowest and the highest width of a route have one neighbour,
 * and a route swept at fewer than three widths has none, so the 3-point rule
 * cannot run there. Those pairs are marked `testable: false` and graded
 * NORMALLY — the alternative, a 2-point rule, is precisely the rule that cannot
 * tell a breakpoint from a spike, and guessing at an edge would either blind
 * the sweep at 390 and 1440 or wave through instability there. They are COUNTED
 * in `summary.coverage.pairsStabilityUntested` and named in a limitation, so
 * "untested at the edges" is a number in the artifact and not an omission.
 */
export function detectSourceInstability(
  pairs: readonly PairResult[],
): Map<number, SourceStabilityReading> {
  const readings = new Map<number, SourceStabilityReading>();
  const byRoute = new Map<string, PairResult[]>();
  for (const pair of pairs) {
    if (!pair.ok || !pair.source) continue;
    const list = byRoute.get(pair.route);
    if (list) list.push(pair);
    else byRoute.set(pair.route, [pair]);
  }
  for (const list of byRoute.values()) {
    const ordered = list.slice().sort((a, b) => a.width - b.width);
    for (let i = 0; i < ordered.length; i++) {
      const pair = ordered[i]!;
      const population = pair.source!.totalNodes;
      const previous = i > 0 ? ordered[i - 1]!.source!.totalNodes : null;
      const next = i + 1 < ordered.length ? ordered[i + 1]!.source!.totalNodes : null;
      const testable = previous !== null && next !== null;
      const deviationFromPrevious =
        previous === null ? null : round4(relativeDeviation(population, previous));
      const deviationFromNext =
        next === null ? null : round4(relativeDeviation(population, next));
      const neighbourDisagreement =
        previous === null || next === null
          ? null
          : round4(relativeDeviation(next, previous));
      // Defensive and, as written, mathematically implied by the two clauses
      // below it: if the neighbours agree to within
      // SOURCE_POPULATION_REVERSION_RATIO, a population BETWEEN them cannot be
      // SOURCE_POPULATION_SPIKE_RATIO away from both. It is kept because the
      // rule is "the odd one out, above both or below both", and a reader
      // should be able to see that stated rather than have to derive it. No
      // test isolates it, and the suite says so rather than implying coverage
      // it does not have.
      const sameDirection =
        previous !== null &&
        next !== null &&
        Math.sign(population - previous) === Math.sign(population - next) &&
        population !== previous;
      const unstable =
        testable &&
        sameDirection &&
        (deviationFromPrevious ?? 0) >= SOURCE_POPULATION_SPIKE_RATIO &&
        (deviationFromNext ?? 0) >= SOURCE_POPULATION_SPIKE_RATIO &&
        (neighbourDisagreement ?? 1) <= SOURCE_POPULATION_REVERSION_RATIO;
      readings.set(pair.index, {
        population,
        previousPopulation: previous,
        nextPopulation: next,
        testable,
        unstable,
        deviationFromPrevious,
        deviationFromNext,
        neighbourDisagreement,
      });
    }
  }
  return readings;
}

/**
 * Rewrite one unstable pair's classification, and SAY SO in the artifact.
 *
 * Volatile findings are moved into `override.demotedFindings` — moved, not
 * deleted — their channels are re-recorded with `firedAt: null` and a stated
 * reason, the counts are recomputed from what is left, and the original verdict
 * is preserved. A reader who compares the verdict against `channels[]` finds
 * one consistent story, and the story says an override happened.
 */
function applyInstabilityOverride(
  classification: Classification,
  reason: string,
): Classification {
  const demotedFindings = classification.findings.filter((finding) =>
    VOLATILE_CHANNELS_UNDER_SOURCE_INSTABILITY.has(finding.channel),
  );
  const kept = classification.findings.filter(
    (finding) => !VOLATILE_CHANNELS_UNDER_SOURCE_INSTABILITY.has(finding.channel),
  );
  const channels = classification.channels.map((channel) =>
    VOLATILE_CHANNELS_UNDER_SOURCE_INSTABILITY.has(channel.channel)
      ? { ...channel, firedAt: null, threshold: null, ineligibleReason: reason }
      : channel,
  );
  const blockerCount = kept.filter((f) => f.severity === "BLOCKER").length;
  const majorCount = kept.filter((f) => f.severity === "MAJOR").length;
  const minorCount = kept.filter((f) => f.severity === "MINOR").length;
  return {
    ...classification,
    verdict:
      blockerCount > 0
        ? "BLOCKER"
        : majorCount > 0
          ? "MAJOR"
          : minorCount > 0
            ? "MINOR"
            : "PASS",
    findings: kept,
    channels,
    blockerCount,
    majorCount,
    minorCount,
    caveats: classification.caveats.includes(reason)
      ? classification.caveats
      : [...classification.caveats, reason].sort(),
    override: {
      guard: "source-capture-unstable",
      demoted: true,
      originalVerdict: classification.verdict,
      reason,
      demotedFindings,
    },
  };
}

/**
 * Apply guard 2 across the whole sweep, in place, and return what it did.
 *
 * SELF-CHECK IS THE EXCEPTION, and it is not an oversight. A self-check run
 * measures the source against a second capture of ITSELF precisely in order to
 * characterise how much the source moves; source instability is that run's
 * PRODUCT, not a defect in it. Demoting findings there would make the floor
 * look quieter than the instrument really is, and every clone verdict is read
 * against that floor — so the flattering error would propagate to every graded
 * pair on the site. In `self-check` mode the guard therefore DETECTS, LABELS
 * and COUNTS instability and changes nothing else: the pair keeps its verdict,
 * stays in `pairsMeasured`, stays in the verdict tallies and stays in the
 * floor's `verdictByRouteWidth`. `override.demoted` is `false` and says which
 * of the two treatments the pair received.
 */
export function applySourceStabilityGuard(
  pairs: PairResult[],
  mode: ResponsiveQaMode,
): { unstablePairs: number; untestedPairs: number; demotedFindings: number } {
  const readings = detectSourceInstability(pairs);
  let unstablePairs = 0;
  let untestedPairs = 0;
  let demotedFindings = 0;
  for (const pair of pairs) {
    if (!pair.ok) continue;
    const reading = readings.get(pair.index);
    if (!reading) continue;
    pair.sourceStability = reading;
    if (!reading.testable) untestedPairs++;
    if (!reading.unstable) continue;
    unstablePairs++;
    const reason =
      `WP-C guard 2: the SOURCE capture at this width will not hold still. Its ${reading.population} elements deviate by ` +
      `${(((reading.deviationFromPrevious ?? 0) * 100)).toFixed(0)}% from the ${reading.previousPopulation} at the width below and ` +
      `${(((reading.deviationFromNext ?? 0) * 100)).toFixed(0)}% from the ${reading.nextPopulation} at the width above, while those two neighbours agree with each other to within ` +
      `${(((reading.neighbourDisagreement ?? 0) * 100)).toFixed(0)}%. A responsive breakpoint moves the population and it STAYS moved; this one reverted, so the reading is an instant and not a layout`;
    if (mode === "self-check") {
      // Detected, labelled, counted — and left exactly as graded. See above.
      if (pair.classification) {
        pair.classification = {
          ...pair.classification,
          caveats: pair.classification.caveats.includes(reason)
            ? pair.classification.caveats
            : [...pair.classification.caveats, reason].sort(),
          override: {
            guard: "source-capture-unstable",
            demoted: false,
            originalVerdict: pair.classification.verdict,
            reason: `${reason}. This is a SELF-CHECK run, whose purpose is to measure exactly this movement, so nothing was demoted and this pair still counts in every tally and in the floor`,
            demotedFindings: [],
          },
        };
      }
      continue;
    }
    if (pair.classification) {
      const rewritten = applyInstabilityOverride(pair.classification, reason);
      demotedFindings += rewritten.override?.demotedFindings.length ?? 0;
      pair.classification = rewritten;
    }
  }
  return { unstablePairs, untestedPairs, demotedFindings };
}

// ---------------------------------------------------------------------------
// WP-C GUARD 4 — measurement failure, and where every finding went
// ---------------------------------------------------------------------------

/**
 * Does this outcome carry a LAYOUT verdict that may be counted and compared
 * against a floor?
 *
 * `FAILED` (the capture threw) and `UNSTABLE` (the source would not hold still)
 * are facts about the MEASUREMENT. Counting either as a verdict — in a tally,
 * or against a floor — asserts something about the clone that was never
 * measured, and the direction it lands in is arbitrary. Neither is green,
 * neither is a PASS, and neither is compared.
 */
export function carriesLayoutVerdict(outcome: PairOutcome | undefined): boolean {
  return outcome !== undefined && outcome !== "FAILED" && outcome !== "UNSTABLE";
}

export interface CoverageResult {
  coverage: CoverageAccounting;
  /** Exactly the pairs `blockerPairs`/`majorPairs`/`minorPairs`/`passPairs`
   *  count. Never a pair without a classification. */
  verdicted: (PairResult & { classification: Classification })[];
}

/**
 * WP-C GUARD 4. Put every pair in exactly one bucket, then count.
 *
 * WHY THE PARTITION IS THE POINT. Three of the four guards in this work package
 * can REMOVE a finding, and a blocker count that falls is indistinguishable
 * from a clone that improved unless the reader can also see how many pairs
 * stopped being graded. `limitations` cannot do that job — it is prose and
 * prose does not add up. This does: four mutually exclusive buckets whose sizes
 * sum to `pairsTotal`, a `conserved` flag that says whether they do, and a
 * counter for every finding the overlap split and the stability guard moved.
 *
 * The old default this replaces was `pair.classification?.verdict ?? "BLOCKER"`
 * — a pair with no classification silently became a clone BLOCKER, which put a
 * harness hole into the clone's column. Now a pair with no classification is
 * `measurement-failed`, is in no tally, is compared against no floor, and is
 * counted where a reader can see it.
 *
 * Bucket priority, and why: `measurement-failed` first because there is nothing
 * to grade; then `clone-route-missing`, which rests on two HTTP statuses and no
 * DOM census at all, so source instability cannot undermine it; then
 * `source-capture-unstable`; then `graded`.
 */
export function accountForCoverage(
  pairs: PairResult[],
  mode: ResponsiveQaMode,
  stability: { untestedPairs: number; demotedFindings: number },
): CoverageResult {
  for (const pair of pairs) {
    let bucket: CoverageBucket;
    let outcome: PairOutcome;
    if (!pair.ok || !pair.classification) {
      bucket = "measurement-failed";
      outcome = "FAILED";
    } else if (
      pair.classification.findings.some(
        (finding) => finding.channel === "clone-route-missing",
      )
    ) {
      bucket = "clone-route-missing";
      outcome = pair.classification.verdict;
    } else if (pair.sourceStability?.unstable === true && mode === "clone") {
      bucket = "source-capture-unstable";
      outcome = "UNSTABLE";
    } else {
      bucket = "graded";
      outcome = pair.classification.verdict;
    }
    pair.coverageBucket = bucket;
    pair.outcome = outcome;
  }

  const measured = pairs.filter((pair) => pair.ok);
  const verdicted = pairs.filter(
    (pair): pair is PairResult & { classification: Classification } =>
      pair.classification !== undefined && carriesLayoutVerdict(pair.outcome),
  );
  const bucketCount = (bucket: CoverageBucket): number =>
    pairs.filter((pair) => pair.coverageBucket === bucket).length;
  const pairsGraded = bucketCount("graded");
  const pairsCloneRouteMissing = bucketCount("clone-route-missing");
  const pairsSourceCaptureUnstable = bucketCount("source-capture-unstable");
  const pairsMeasurementFailed = bucketCount("measurement-failed");
  const pairsAccountedFor =
    pairsGraded +
    pairsCloneRouteMissing +
    pairsSourceCaptureUnstable +
    pairsMeasurementFailed;
  return {
    verdicted,
    coverage: {
      pairsTotal: pairs.length,
      pairsGraded,
      pairsCloneRouteMissing,
      pairsSourceCaptureUnstable,
      pairsMeasurementFailed,
      pairsAccountedFor,
      conserved: pairsAccountedFor === pairs.length,
      pairsVerdicted: verdicted.length,
      pairsStabilityUntested: stability.untestedPairs,
      duplicateImageStackPairsDemoted: measured.reduce(
        (sum, pair) =>
          sum + (pair.classification?.demotions?.duplicateImageStackPairs ?? 0),
        0,
      ),
      failedImageLayerOverlapPairsDemoted: measured.reduce(
        (sum, pair) =>
          sum + (pair.classification?.demotions?.failedImageLayerOverlapPairs ?? 0),
        0,
      ),
      overlapFindingsDemoted: measured.filter(
        (pair) => pair.classification?.demotions?.overlapFindingDemoted === true,
      ).length,
      // ITEM L1. Where the demoted area went. `overlapFindingsDemoted` counts
      // the pairs a finding was taken OFF; this counts the pairs on which the
      // area that was taken off raised a finding of its own instead, so the two
      // together say whether guard 3 moved a finding or removed one.
      overlapDemotionsRegraded: measured.filter(
        (pair) => pair.classification?.demotions?.demotedOverlapRegraded === true,
      ).length,
      unstableFindingsDemoted: stability.demotedFindings,
    },
  };
}

/** Final PNG width for a measured pair, from the pixel channels. */
function pair2Width(pair: PairResult): number {
  return pair.pixels?.cloneWidth ?? pair.clone?.innerWidth ?? 0;
}

function headlineOf(pair: PairResult): string {
  const top = pair.classification?.findings[0];
  if (top) return `${top.channel}: ${top.summary}`;
  if (pair.error) return `capture failed: ${pair.error}`;
  return "no rubric channel fired";
}

export async function runResponsiveQa(
  options: RunResponsiveQaOptions,
): Promise<RunResponsiveQaResult> {
  const log = options.onLog ?? (() => {});
  const widths = (options.widths && options.widths.length > 0
    ? options.widths
    : [...DEFAULT_WIDTHS]
  )
    .slice()
    .sort((a, b) => a - b);
  for (const width of widths) {
    if (!Number.isInteger(width) || width < 240 || width > 4_000) {
      throw new ResponsiveQaInputError(
        `width ${width} is out of range; expected an integer between 240 and 4000`,
      );
    }
  }

  const resolution = await resolveRoutes({
    target: options.target,
    ...(options.siteSpecFile ? { siteSpecFile: options.siteSpecFile } : {}),
    ...(options.explicitRoutes ? { explicitRoutes: options.explicitRoutes } : {}),
    ...(options.sourceOrigin ? { sourceOrigin: options.sourceOrigin } : {}),
  });

  const site = siteFolder(resolution.rootUrl);
  const runId = newResponsiveRunId();
  const runDir = path.resolve(
    options.outputDir ?? responsiveRunDir(resolution.rootUrl, runId),
  );
  const imagesDir = path.join(runDir, IMAGES_SUBDIR);
  await mkdir(imagesDir, { recursive: true });

  const mode: ResponsiveQaMode = options.selfCheck === true ? "self-check" : "clone";
  const startedAt = new Date().toISOString();
  if (mode === "self-check") {
    log(
      "[responsive-qa] SELF-CHECK: the source is measured against a second capture of ITSELF. No clone is built or served. These verdicts are the instrument's floor, not a grade.",
    );
  }
  log(
    `[responsive-qa] ${site} — ${resolution.routes.length} route(s) × ${widths.length} width(s) = ${resolution.routes.length * widths.length} pairs`,
  );
  log(`[responsive-qa] app ${resolution.appDir}`);
  log(`[responsive-qa] routes from ${resolution.routeSource}`);
  log(`[responsive-qa] out ${runDir}`);

  // ITEM G4. The floor is measured BEFORE the clone sweep, so the two read the
  // same live source minutes apart rather than an hour apart, and so a floor
  // sweep that fails outright stops the run instead of quietly producing a
  // graded artifact with no floor.
  let measuredFloor: RunResponsiveQaResult | null = null;
  if (mode === "clone" && options.withSelfCheck === true) {
    log(
      "[responsive-qa] --with-self-check: measuring the GRADING FLOOR first — the source against a second capture of itself. No clone is built for it.",
    );
    measuredFloor = await runResponsiveQa({
      ...options,
      selfCheck: true,
      withSelfCheck: false,
      ...(options.selfCheckRunFile !== undefined ? { selfCheckRunFile: undefined } : {}),
      outputDir: undefined,
      ...(options.onLog ? { onLog: (line) => log(`  [floor] ${line}`) } : {}),
    });
    log(
      `[responsive-qa] floor ${measuredFloor.runId}: ${measuredFloor.artifact.summary.passPairs} PASS / ${measuredFloor.artifact.summary.minorPairs} MINOR / ${measuredFloor.artifact.summary.majorPairs} MAJOR / ${measuredFloor.artifact.summary.blockerPairs} BLOCKER`,
    );
  }

  let clone: RunningClone | null = null;
  let browser: Browser | null = null;
  const pairs: PairResult[] = [];
  const images: ImageManifestEntry[] = [];
  const sheetRows: ContactSheetRow[] = [];
  let contactSheet: string | null = null;

  try {
    if (mode === "clone") {
      clone = await startClone({
        appDir: resolution.appDir,
        ...(options.forceBuild ? { forceBuild: true } : {}),
        onLog: (line) => log(`  ${line}`),
      });
    }
    browser = await chromium.launch();

    let index = 0;
    for (const route of resolution.routes) {
      for (const width of widths) {
        index++;
        const cloneUrl = clone ? `${clone.baseUrl}${route.path}` : route.sourceUrl;
        const sourceFileRel = path.posix.join(
          IMAGES_SUBDIR,
          imageFileName(index, site, route.path, width, "source"),
        );
        const cloneFileRel = path.posix.join(
          IMAGES_SUBDIR,
          imageFileName(index, site, route.path, width, "final"),
        );
        const compositeRel = path.posix.join(
          IMAGES_SUBDIR,
          imageFileName(index, site, route.path, width, "composite"),
        );
        const diffRel = path.posix.join(
          IMAGES_SUBDIR,
          imageFileName(index, site, route.path, width, "diff"),
        );

        try {
          // TASK 28.75, item B7. `side` and `pageId` name the page-state
          // evidence directory and nothing else: the two calls below run
          // byte-identical code, which is the point.
          const pageStateId = `p${String(index).padStart(4, "0")}`;
          const sourceSide = await captureSide({
            browser,
            url: route.sourceUrl,
            width,
            screenshotFile: sourceFileRel,
            side: "source",
            pageId: pageStateId,
          });
          const cloneSide = await captureSide({
            browser,
            url: cloneUrl,
            width,
            screenshotFile: cloneFileRel,
            side: "clone",
            pageId: pageStateId,
          });

          await writeRunBinary(runDir, sourceFileRel, sourceSide.screenshot);
          await writeRunBinary(runDir, cloneFileRel, cloneSide.screenshot);

          const { channels, decoded } = pixelsFrom(
            sourceSide.screenshot,
            cloneSide.screenshot,
          );
          let diffFile: string | undefined;
          if (!options.skipDiffImages && decoded) {
            const diff = renderDiffImage(decoded.a, decoded.b);
            await writeRunBinary(runDir, diffRel, encodePng(diff));
            diffFile = diffRel;
          }

          const correspondence = correspond(
            sourceSide.measurement,
            cloneSide.measurement,
          );
          const missing = missingText(sourceSide.measurement, cloneSide.measurement);
          // The same test the other way round, so the channel's floor can be
          // read in both directions rather than only the flattering one.
          const missingReverse = missingText(
            cloneSide.measurement,
            sourceSide.measurement,
          );
          const columns = compareColumns(
            sourceSide.measurement,
            cloneSide.measurement,
          );
          const classification = classifyPair({
            source: sourceSide.measurement,
            clone: cloneSide.measurement,
            correspondence,
            columns,
            missing,
            missingReverse,
            pixels: channels,
            sourceScroll: sourceSide.provenance.scroll,
            cloneScroll: cloneSide.provenance.scroll,
            // WP-C GUARD 1. The two statuses were captured all along and read
            // by nothing but a display string; the classifier now sees them, so
            // a clone route that 404s is ONE finding instead of a column of
            // content blockers measured against the server's error page.
            sourceHttpStatus: sourceSide.provenance.httpStatus,
            cloneHttpStatus: cloneSide.provenance.httpStatus,
            // TASK 28.75, item B7. What page STATE each side was captured in.
            // The classifier needs it to tell a `missing-text-ratio` caused by
            // real content loss from one caused by an entry overlay that stands
            // on the source and not on the clone — and to declare the pair NOT
            // COMPARABLE when it cannot.
            ...(sourceSide.provenance.pageState
              ? { sourcePageState: sourceSide.provenance.pageState }
              : {}),
            ...(cloneSide.provenance.pageState
              ? { clonePageState: cloneSide.provenance.pageState }
              : {}),
            // TASK 28.75, the INK leg. The two screenshots are ALREADY decoded
            // here for the pixel channels; handing the same buffers to the
            // classifier is what lets the blank-region channel ask what a
            // region's pixels look like. Without them it is DOM-only, and
            // DOM-only is exactly the configuration that reported the severance
            // hero — perfect geometry, opacity 1, image decoded, white on
            // white — as healthy.
            ...(decoded ? { sourceImage: decoded.a, cloneImage: decoded.b } : {}),
          });

          const sourceSize = {
            width: channels.sourceWidth ?? width,
            height: channels.sourceHeight ?? sourceSide.measurement.scrollHeight,
          };
          const cloneSize = {
            width: channels.cloneWidth ?? width,
            height: channels.cloneHeight ?? cloneSide.measurement.scrollHeight,
          };
          await renderComposite({
            browser,
            site,
            route: route.path,
            width,
            verdict: classification.verdict,
            blockerCount: classification.blockerCount,
            majorCount: classification.majorCount,
            minorCount: classification.minorCount,
            sourceUrl: sourceSide.provenance.finalUrl,
            cloneUrl: cloneSide.provenance.finalUrl,
            sourceFile: path.join(runDir, ...sourceFileRel.split("/")),
            cloneFile: path.join(runDir, ...cloneFileRel.split("/")),
            sourceSize,
            cloneSize,
            outFile: path.join(runDir, ...compositeRel.split("/")),
            scratchHtml: path.join(runDir, ".composite-scratch.html"),
          });

          const pair: PairResult = {
            index,
            route: route.path,
            width,
            ok: true,
            source: persistSide(sourceSide.measurement),
            clone: persistSide(cloneSide.measurement),
            sourceProvenance: sourceSide.provenance,
            cloneProvenance: cloneSide.provenance,
            correspondence,
            columns,
            missingText: missing,
            missingTextReverse: missingReverse,
            pixels: channels,
            classification,
            compositeFile: compositeRel,
            ...(diffFile ? { diffFile } : {}),
          };
          pairs.push(pair);

          for (const entry of [
            { file: compositeRel, kind: "composite" as const },
            { file: sourceFileRel, kind: "source" as const },
            { file: cloneFileRel, kind: "final" as const },
            ...(diffFile ? [{ file: diffFile, kind: "diff" as const }] : []),
          ]) {
            images.push({
              file: entry.file,
              kind: entry.kind,
              route: route.path,
              width,
              verdict: classification.verdict,
              blockerCount: classification.blockerCount,
              majorCount: classification.majorCount,
            });
          }
          sheetRows.push({
            route: route.path,
            width,
            verdict: classification.verdict,
            compositeFile: path.join(runDir, ...compositeRel.split("/")),
            headline: headlineOf(pair),
          });

          log(
            `[responsive-qa] ${route.path} @${width} ${classification.verdict}` +
              ` (B${classification.blockerCount}/M${classification.majorCount}/m${classification.minorCount})` +
              ` missingText=${(missing.missingRatio * 100).toFixed(2)}%` +
              ` offscreenChars=${cloneSide.measurement.offscreenTextChars}/${sourceSide.measurement.offscreenTextChars}` +
              ` cols=${cloneSide.measurement.maxColumns}/${sourceSide.measurement.maxColumns} colMismatch=${columns.worstModeDelta}` +
              ` gutter=${cloneSide.measurement.rightGutter}/${sourceSide.measurement.rightGutter}` +
              ` p90=${correspondence.positionDeltaP90}px match=${(correspondence.matchedFractionOfContentKeyed * 100).toFixed(0)}%(content)` +
              ` pxResidual=${((channels.gate?.residualAboveJndRatio ?? 0) * 100).toFixed(2)}%` +
              ` scroll=${cloneSide.provenance.scroll.scrolledToPx}/${sourceSide.provenance.scroll.scrolledToPx}px` +
              ` revealed=${cloneSide.provenance.scroll.textCharsRevealed}/${sourceSide.provenance.scroll.textCharsRevealed}chars`,
          );
        } catch (err) {
          const message =
            err instanceof Error ? err.message.split("\n", 1)[0] : String(err);
          pairs.push({ index, route: route.path, width, ok: false, error: message });
          log(`[responsive-qa] FAILED ${route.path} @${width}: ${message}`);
        }
      }
    }

    if (sheetRows.length > 0) {
      await renderContactSheet({
        browser,
        site,
        runId,
        rows: sheetRows,
        outFile: path.join(runDir, CONTACT_SHEET_FILE),
        scratchHtml: path.join(runDir, ".sheet-scratch.html"),
      });
      contactSheet = CONTACT_SHEET_FILE;
      images.push({
        file: CONTACT_SHEET_FILE,
        kind: "contact-sheet",
        route: null,
        width: null,
        verdict: null,
        blockerCount: pairs.reduce(
          (sum, pair) => sum + (pair.classification?.blockerCount ?? 0),
          0,
        ),
        majorCount: pairs.reduce(
          (sum, pair) => sum + (pair.classification?.majorCount ?? 0),
          0,
        ),
      });
    }
  } finally {
    if (browser) await browser.close().catch(() => {});
    if (clone) await clone.stop().catch(() => {});
    log("[responsive-qa] stopped browser and clone server");
  }

  // -- WP-C GUARD 2, the post-hoc pass -------------------------------------
  //
  // Runs HERE, on the complete `pairs` array, because the evidence it needs —
  // what the same route did at the widths either side — does not exist until
  // both loops have closed. `classifyPair` stays a pure function of one pair.
  const stability = applySourceStabilityGuard(pairs, mode);
  if (stability.unstablePairs > 0) {
    log(
      `[responsive-qa] WP-C guard 2: ${stability.unstablePairs} pair(s) have an unstable SOURCE capture` +
        (mode === "self-check"
          ? " — labelled and COUNTED, not demoted: this is a self-check and that movement is what it measures"
          : `; ${stability.demotedFindings} volatile finding(s) demoted and recorded in classification.override`),
    );
  }

  const { coverage, verdicted } = accountForCoverage(pairs, mode, stability);
  const measured = pairs.filter((pair) => pair.ok);

  const limitations: ArtifactLimitation[] = buildLimitations(mode, measured);
  limitations.push({
    id: "coverage-is-conserved-and-every-exclusion-is-counted",
    statement:
      "Every guard in this rubric can REMOVE a finding, and a falling blocker count is indistinguishable from an improving clone unless the reader can also see how many pairs stopped being graded. `summary.coverage` is that ledger and it is arithmetic, not prose: the four pair buckets partition the sweep, `conserved` states whether they add up, and the demotion counters say how many findings were re-attributed rather than found. A run where `conserved` is false has lost pairs and its verdict counts must not be read.",
    evidence: `${coverage.pairsTotal} pair(s) = ${coverage.pairsGraded} graded + ${coverage.pairsCloneRouteMissing} clone-route-missing + ${coverage.pairsSourceCaptureUnstable} source-capture-unstable + ${coverage.pairsMeasurementFailed} measurement-failed (conserved: ${coverage.conserved}); ${coverage.pairsVerdicted} pair(s) carry a layout verdict. Guard 3 re-attributed ${coverage.duplicateImageStackPairsDemoted} duplicate image layer pair(s) and ${coverage.failedImageLayerOverlapPairsDemoted} failed-asset overlap pair(s), which removed an overlap finding on ${coverage.overlapFindingsDemoted} pair(s) and was itself re-graded, relative to the source's own demoted area, on ${coverage.overlapDemotionsRegraded} pair(s); guard 2 demoted ${coverage.unstableFindingsDemoted} finding(s) on unstable pairs.`,
  });
  if (coverage.pairsStabilityUntested > 0) {
    limitations.push({
      id: "source-stability-untested-at-edge-widths",
      statement:
        "The source-stability test is a 3-point rule — a width must deviate from BOTH its neighbours while those neighbours agree with each other — because that is the only thing that separates a bad capture from a genuine responsive breakpoint, which also produces a single large jump. The lowest and the highest width of every route have one neighbour, and a route swept at fewer than three widths has none, so the rule cannot run there. Those pairs are graded NORMALLY and are counted here rather than assumed stable: an unstable capture at the sweep's lowest or highest width is NOT detected by this instrument.",
      evidence: `${coverage.pairsStabilityUntested} of ${coverage.pairsTotal} pair(s) sit at an edge width and were not stability-tested; ${coverage.pairsSourceCaptureUnstable} of the remainder were found unstable. Widths swept: ${widths.join(", ")}.`,
    });
  }
  if (coverage.pairsCloneRouteMissing > 0) {
    limitations.push({
      id: "clone-route-missing-suppresses-every-content-channel",
      statement:
        "On these pairs the source served a 2xx document and the clone answered 4xx/5xx, so every content channel was measured against the clone server's error page rather than against a reconstruction. All of them are RECORDED with their measured value and none of them may raise severity; the missing route is the single finding. Nothing here says whether the page the clone failed to serve would have been good or bad — it was never built.",
      evidence: pairs
        .filter((pair) => pair.coverageBucket === "clone-route-missing")
        .map(
          (pair) =>
            `${pair.route} @${pair.width}: source HTTP ${pair.sourceProvenance?.httpStatus ?? "?"}, clone HTTP ${pair.cloneProvenance?.httpStatus ?? "?"}`,
        )
        .join("; "),
    });
  }
  if (coverage.pairsSourceCaptureUnstable > 0) {
    limitations.push({
      id: "source-capture-unstable-pairs-are-not-verdicted",
      statement:
        mode === "self-check"
          ? "On these pairs the source's node population deviated from BOTH neighbouring widths and then reverted. This is a SELF-CHECK run, which exists to measure exactly that movement, so nothing was demoted: the pairs keep their verdicts and stay in every tally and in this artifact's role as a floor. They are listed so a reader knows which of the floor's readings came from a source that was moving."
          : "On these pairs the source's node population deviated from BOTH neighbouring widths and then reverted, so the numbers describe an instant that does not reproduce. Volatile content channels were held ineligible and their findings moved into `classification.override.demotedFindings` — moved, not deleted. Structural channels that do not depend on the source's node population (footer clipping, wide landmark boxes, horizontal overflow, the missing-route gate) still fired and are still in `findings`. The pair carries the outcome UNSTABLE, is excluded from the PASS/MAJOR/BLOCKER tallies and from every floor comparison, and is NOT a PASS.",
      evidence: pairs
        .filter((pair) => pair.sourceStability?.unstable === true)
        .map(
          (pair) =>
            `${pair.route} @${pair.width}: ${pair.sourceStability?.population} source elements against ${pair.sourceStability?.previousPopulation} below and ${pair.sourceStability?.nextPopulation} above (neighbours disagree by ${(((pair.sourceStability?.neighbourDisagreement ?? 0) * 100)).toFixed(0)}%, spike threshold ${(SOURCE_POPULATION_SPIKE_RATIO * 100).toFixed(0)}%, reversion threshold ${(SOURCE_POPULATION_REVERSION_RATIO * 100).toFixed(0)}%)`,
        )
        .join("; "),
    });
  }
  // ITEM C3.13. The roster is taken from the pairs that actually ran, so it
  // cannot drift from the code: two artifacts are comparable exactly when their
  // rubricVersion and channelRoster agree.
  const channelRoster = Array.from(
    new Set(
      measured.flatMap((pair) =>
        (pair.classification?.channels ?? []).map((channel) => channel.channel),
      ),
    ),
  ).sort();
  // ITEM G4. Resolve the floor now that the roster this run actually emitted is
  // known, because roster equality is one of the comparability tests.
  let selfCheckFloor: SelfCheckFloor;
  if (mode === "self-check") {
    selfCheckFloor = selfIsTheFloor();
  } else if (measuredFloor) {
    selfCheckFloor = floorFrom(
      measuredFloor.artifact,
      path.join(measuredFloor.runDir, RUN_ARTIFACT_FILE),
      measuredFloor.runDir,
      "measured",
      {
        site,
        rubricVersion: RUBRIC_VERSION,
        channelRoster,
        widths,
        routes: resolution.routes.map((route) => route.path),
      },
    );
  } else if (options.selfCheckRunFile !== undefined) {
    const found = await readFloorArtifact(
      options.selfCheckRunFile,
      site,
      resolution.rootUrl,
    );
    selfCheckFloor = floorFrom(found.artifact, found.file, found.dir, "referenced", {
      site,
      rubricVersion: RUBRIC_VERSION,
      channelRoster,
      widths,
      routes: resolution.routes.map((route) => route.path),
    });
  } else {
    selfCheckFloor = absentFloor();
  }
  const floorVerdictOf = (route: string, width: number): PairOutcome | null => {
    const rows = selfCheckFloor.verdictByRouteWidth;
    if (!rows) return null;
    const row = rows.find((entry) => entry.route === route && entry.width === width);
    return row ? row.verdict : null;
  };
  if (selfCheckFloor.status === "absent") {
    limitations.push({
      id: "no-self-check-floor",
      statement: selfCheckFloor.statement,
      evidence: `mode=${mode}, selfCheckFloor.status=absent, ${measured.length} pairs graded with no floor to read them against. The four Task 28.6 pilots measured three DIFFERENT floors on three sources (7 PASS on hobbang.net, 9 PASS on gs.severance.healthcare, 4 PASS on seoultone.kr), so the floor cannot be assumed.`,
    });
  } else if (selfCheckFloor.comparable === false) {
    limitations.push({
      id: "self-check-floor-not-comparable",
      statement: selfCheckFloor.statement,
      evidence: `floor run ${selfCheckFloor.runId}; ${selfCheckFloor.incomparableReasons.length} mismatch(es): ${selfCheckFloor.incomparableReasons.join("; ")}`,
    });
  }

  const artifact: ResponsiveQaRunArtifact = {
    schemaVersion: 3,
    rubricVersion: RUBRIC_VERSION,
    channelRoster,
    runId,
    mode,
    site,
    sourceOrigin: options.sourceOrigin ?? new URL(resolution.rootUrl).origin,
    appDir: resolution.appDir,
    manifestFile: resolution.manifestFile,
    routeSource: resolution.routeSource,
    widths,
    routes: resolution.routes.map((route) => route.path),
    capturePolicy: CAPTURE_POLICY,
    cloneBaseUrl: clone ? clone.baseUrl : "",
    cloneBuildMs: clone ? clone.buildMs : 0,
    startedAt,
    finishedAt: new Date().toISOString(),
    pairs,
    summary: {
      pairsMeasured: measured.length,
      pairsFailed: pairs.length - measured.length,
      // WP-C GUARD 4. These four count VERDICTED pairs, which is
      // `coverage.pairsGraded + coverage.pairsCloneRouteMissing` and no longer
      // `pairsMeasured`: an UNSTABLE pair was measured and is deliberately not
      // verdicted, so it can never arrive in `passPairs` and show green. Read
      // the four against `coverage.pairsVerdicted`, which is what they sum to.
      blockerPairs: verdicted.filter((pair) => pair.classification.verdict === "BLOCKER")
        .length,
      majorPairs: verdicted.filter((pair) => pair.classification.verdict === "MAJOR")
        .length,
      minorPairs: verdicted.filter((pair) => pair.classification.verdict === "MINOR")
        .length,
      passPairs: verdicted.filter((pair) => pair.classification.verdict === "PASS").length,
      coverage,
      verdictByRouteWidth: pairs.map((pair) => ({
        route: pair.route,
        width: pair.width,
        // A capture failure is reported as itself. Calling it a BLOCKER would
        // put a harness problem into the clone's column.
        // WP-C GUARD 4: the outcome is assigned once, in the bucketing pass
        // above, so this row and `coverage` can never disagree. `FAILED` and
        // `UNSTABLE` are measurement facts, NOT layout verdicts.
        verdict: pair.outcome ?? ("FAILED" as const),
        // ITEM G4: the floor travels WITH the verdict, so the table cannot be
        // read without it. `null` means there is no floor — see selfCheckFloor.
        // WP-C GUARD 4: a pair that carries no layout verdict of its own is
        // never compared against a floor, because there is nothing to compare.
        floorVerdict: carriesLayoutVerdict(pair.outcome)
          ? floorVerdictOf(pair.route, pair.width)
          : null,
      })),
    },
    images,
    contactSheet,
    selfCheckFloor,
    notes: [
      selfCheckFloor.statement,
      mode === "self-check"
        ? "SELF-CHECK RUN. The 'clone' side is a SECOND CAPTURE OF THE LIVE SOURCE. Nothing here grades a reconstruction. Every verdict is the floor produced by the instrument plus whatever the live source changed between two captures seconds apart, and no clone verdict from the same rubric can be better than it."
        : "CLONE RUN. The locally served reconstruction is measured against the live source.",
      "Captures are PINNED: videos paused and rewound, screenshots taken with animations disabled. The Observer's own snapshots are NOT pinned; do not compare these PNGs against them.",
      "Both sides are SCROLLED to the bottom in fixed steps with fixed waits and returned to the top before probing and screenshotting, so lazy-revealed content is inside every numeric channel. Each side's scroll report says how far it went, how long it waited, whether it reached the bottom and how much content appeared.",
      "Every width uses one DPR-1, non-touch, desktop-shaped context. Task 05's mobile profile (DPR 3, touch, Android UA) is deliberately not used at 390, so the sweep changes only one variable.",
      "A clone below its generated breakpoint renders its mobile subtree. That is measured as it is, not worked around.",
      "Node counts are not cross-side comparable: the clone ships both viewport subtrees while the source ships one.",
      "Every rubric threshold is relative to the source's own value at the same width; every channel is recorded whether or not it fired.",
      "Determinism has two halves and only one of them is ours. THE COMPUTATION IS DETERMINISTIC: no measurement in this artifact reads a clock or a random source, every list is sorted or in document order, and the only clock-derived fields are runId, startedAt, finishedAt and each side's capturedAt. THE SOURCE IS NOT: it is a live, unfrozen public site, so re-running this sweep re-measures whatever it is serving now, and the two captures inside a single pair are seconds apart. See the live-source-is-not-frozen limitation for this run's own measurement of that movement.",
      "The position channel reports ONE number, max(left p90, right p90). The two edges move together on a displaced block; the separate left and right readings are recorded but are not counted as two findings.",
      "The pixel rubric reads the RESIDUAL difference — the part that survives a 1px two-sided displacement search — not the raw above-JND ratio, which is recorded beside it and is never fired on. Its band is a fraction of the compared AREA; the same residual as a fraction of the source's own ink is recorded beside it, and on a typical page the two differ by more than an order of magnitude.",
      "TWO RUNS ARE COMPARABLE ONLY WHEN rubricVersion AND channelRoster AGREE. schemaVersion describes the JSON shape and says nothing about which channels ran; verdict counts from runs graded by different rosters must not be added together.",
    ],
    limitations,
  };

  await writeRunJson(runDir, RUN_ARTIFACT_FILE, artifact);
  await writeRunJson(runDir, IMAGE_MANIFEST_FILE, {
    schemaVersion: 1,
    runId,
    site,
    contactSheet,
    images,
  });

  return { runId, runDir, artifact };
}
