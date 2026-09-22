import type { PageSpec, SiteSpec } from "../sitespec/index.js";
import {
  chooseTreeSwitch,
  variantTreeNotObservedCode,
  type ObservedOnlyReport,
  type TreeSwitchCandidate,
} from "./tree-switch.js";
import {
  ReconstructionError,
  type BreakpointSpec,
  type PageBreakpointRecord,
  type ServedSwitch,
} from "./types.js";

/**
 * Breakpoint inference (items 28, 29).
 *
 * Task 13 states plainly that it observed two endpoints and nothing between
 * them, and it keeps `inferredBreakpoints: []` empty on purpose so that a number
 * nobody measured can never be mistaken for one somebody did. Task 14 is the
 * layer allowed to make that inference, because it is the layer that has to
 * choose ONE number in order to emit a media query at all.
 *
 * TASK 28.6 C1 — THE RULE IS NO LONGER THE MIDPOINT.
 *
 * It used to be: the midpoint of the two observed widths, floored — 915 on the
 * corpus's 390 / 1440 endpoints. That number is arithmetic on the observation's
 * own sampling grid. It is written by nobody and it matches nothing, while the
 * SAME generated stylesheet already snaps every responsive-hide band edge onto a
 * breakpoint the source authored. Measured across four sites it put the switch
 * inside a source band on every one of them — seoultone.kr authors seven
 * breakpoints and 915 is none of them, landing inside `max-width: 1024` and
 * shipping a 1296px footer into a 1024px viewport — and six of the corpus's
 * graded BLOCKERs traced back to it.
 *
 * The rule now is: the authored breakpoint that best separates the two observed
 * trees, clamped to `(mobileWidth, desktopWidth]` so the switch can never move
 * past a width at which the other tree was actually observed. "Best" is ranked
 * in {@link chooseTreeSwitch} — corroborated by the probe first, then heaviest
 * in the stylesheet, then nearest the midpoint, then smallest. It is still the
 * same rule for every site: no per-site table, no hard-coded 768 or 1024
 * (item 114). The midpoint survives as the FALLBACK, and every fallback names
 * the reason it happened, so a guessed switch can never read as a snapped one.
 *
 * WHAT THIS STILL CANNOT SAY WITHOUT §27. An authored breakpoint is where the
 * source changes its CSS, not where it changes its DOM. Task 28.7 §27 added the
 * layout probe's per-width DOM-FAMILY FINGERPRINT, so `domSwitchWidthObserved`
 * is now `true` when the width that ships is a width the probe watched the render
 * family change at — and still `false` for every observation taken before §27,
 * for a site that is genuinely CSS-responsive, and for every midpoint fallback.
 * `tree-switch.ts` explains the split in full.
 *
 * Convention, stated once and implemented once (item 28):
 *
 *   width  <  breakpoint   → the MOBILE tree is the visible one
 *   width >=  breakpoint   → the DESKTOP tree is the visible one
 *
 * `provenance` is `inferred` (or `operator-override` for `--breakpoint N`) and
 * never `observed`. Task 15 gets to disagree with the number; what it must not
 * be able to do is mistake it for evidence.
 */

export const BREAKPOINT_CONVENTION =
  "mobile: width < breakpoint; desktop: width >= breakpoint";

/**
 * TASK 28.8 A1 — THE V1 PRODUCT POLICY, AND WHY IT OUTRANKS THE INFERENCE.
 *
 * Everything above this constant describes how the generator INFERS a switch
 * from evidence, and every word of it is still true and still runs. What
 * changed is what the generated site SERVES.
 *
 * The pipeline observes exactly two trees, at 390 and at 1440. Whatever number
 * the inference picks, those two trees are the only two things that can be on
 * screen, and a switch chosen per site put a tree the operator never looked at
 * in front of a viewport nobody measured — 915 on one corpus, 641 on another,
 * 1025 on a third. As a PRODUCT that is unshippable: an operator cannot answer
 * "what does my site do at 900px?" if the answer is a different number on every
 * site. V1 therefore fixes the two modes:
 *
 *   width <=  800px  → the MOBILE tree (observed at 390)
 *   width >=  801px  → the DESKTOP tree (observed at 1440)
 *
 * The inference is NOT deleted and NOT ignored. It runs exactly as before and
 * its answer ships as EVIDENCE on the spec (`inferredAuthoredPx` /
 * `inferredAuthoredMethod`, plus the whole candidate record), so the artifact
 * says both what the source's own stylesheet implies and what this product
 * chose to serve. An operator who disagrees passes `--breakpoint N` and their
 * number wins over both.
 *
 * RESPONSIVE CORE P0 §C2.6 — THE POLICY IS NOW THE FALLBACK, NOT THE RULE.
 *
 * A1's objection was to serving a tree at a width nobody observed it at. Where
 * the probe WATCHED the render family change at a width, that objection does not
 * hold for that width, and serving 801 instead is the defect (apartmentary: the
 * source swaps at 900 and 801–899 was the only failing band of the sweep). The
 * served switch is therefore GRADED (user-approved reversal of 28.8-fast D1):
 *
 *   1. operator-override  — `--breakpoint N`, site-wide;
 *   2. authored-observed  — the ranked authored winner is a width the probe
 *                           watched the family swap at (tight bracket);
 *   3. observed-only      — a C1.6 bisection located a family swap to a 1px
 *                           bracket that no authored candidate within ±1px names;
 *   4. product-policy     — neither: this constant, clamped, exactly as before.
 *
 * Site = best grade (2 beats 3 regardless of magnitude). A route with its OWN
 * grade-2/3 evidence is served its own value; any other route inherits the site.
 * No other constant replaces 801, and explainability (A1's second reason) is
 * answered by `servedSwitch` on the spec and on every route record.
 */
export const V1_RESPONSIVE_POLICY = {
  /** The widest viewport the MOBILE tree serves. */
  mobileMaxPx: 800,
  /** The narrowest viewport the DESKTOP tree serves — the number that ships. */
  desktopMinPx: 801,
  /** The width the mobile tree was observed at, and truth-checked at. */
  mobileTruthPx: 390,
  /** The width the desktop tree was observed at, and truth-checked at. */
  desktopTruthPx: 1440,
} as const;

export interface InferBreakpointOptions {
  /** `--breakpoint N`. Recorded as an operator override, not as observation. */
  override?: number;
  /**
   * The compiled page specs, for the authored-breakpoint histograms and the
   * probes that corroborate them (Task 28.6 C1).
   *
   * OPTIONAL, and its absence is an outcome rather than a default: with no pages
   * the midpoint ships with `fallbackReason: "no-page-specs"`. A caller that has
   * the pages and does not pass them gets the pre-28.6 guess and says so in the
   * manifest, which is the only honest thing an absent input can produce.
   */
  pages?: readonly PageSpec[];
}

/**
 * TASK 28.7 §26 — THE SWITCH, AT BOTH GRAINS, FROM ONE DECISION.
 *
 * `site` is the number that has always shipped: unchanged in meaning, unchanged
 * in value, and still what `route-map.json`'s scalar `breakpoint` carries and
 * what `globals.css` serves by default. `byPageId` holds only the routes whose
 * OWN evidence chose a different width.
 *
 * There is exactly one of these objects per reconstruction and every consumer
 * reads its width through {@link breakpointForPage}. That is not tidiness: the
 * serving media query and the probe-axis split in `resolveViewportProbe()` must
 * use the SAME number for a given route, or a route ships rules inferred from
 * widths at which the variant carrying them is not the one on screen.
 */
export interface ResponsiveBreakpointPlan {
  /** The site-wide switch, and the default for any route without its own. */
  site: BreakpointSpec;
  /** `pageId` → that route's own switch width. Only routes that differ. */
  byPageId: ReadonlyMap<string, number>;
  /** Every page's record, including the ones that agreed. Manifest-facing. */
  records: PageBreakpointRecord[];
  /** `variant-tree-not-observed-at-<px>`, deduplicated and sorted by width. */
  variantTreeNotObserved: string[];
}

/**
 * THE ONE ACCESSOR. `byPageId` holds only the disagreeing routes, so reading it
 * directly is how the two layers drift apart; reading it through here is how
 * they cannot.
 */
export function breakpointForPage(
  plan: ResponsiveBreakpointPlan,
  pageId: string,
): number {
  return plan.byPageId.get(pageId) ?? plan.site.value;
}

/** The site-wide switch alone. Kept because four callers only ever wanted that. */
export function inferBreakpoint(
  siteSpec: SiteSpec,
  options: InferBreakpointOptions = {},
): BreakpointSpec {
  return inferResponsivePlan(siteSpec, options).site;
}

export function inferResponsivePlan(
  siteSpec: SiteSpec,
  options: InferBreakpointOptions = {},
): ResponsiveBreakpointPlan {
  const profiles = siteSpec.responsiveModel.observedViewports;
  const mobile = profiles.find((p) => p.id === "mobile");
  const desktop = profiles.find((p) => p.id === "desktop");
  if (!mobile || !desktop) {
    throw new ReconstructionError(
      `the SiteSpec's responsive model does not carry both observed viewport ` +
        `endpoints (found: ${profiles.map((p) => p.id).join(", ") || "none"}). ` +
        `A breakpoint cannot be inferred from one endpoint, and this generator ` +
        `does not fall back to a conventional number.`,
    );
  }
  if (!(desktop.width > mobile.width)) {
    throw new ReconstructionError(
      `observed desktop width (${desktop.width}) is not greater than observed ` +
        `mobile width (${mobile.width}); there is no midpoint to infer.`,
    );
  }

  if (options.override !== undefined) {
    const value = Math.trunc(options.override);
    if (!Number.isFinite(value) || value <= 0) {
      throw new ReconstructionError(
        `--breakpoint must be a positive integer (got ${options.override})`,
      );
    }
    /*
     * §26 — an operator override is SITE-WIDE, and deliberately carries no
     * per-route map. The operator named one number for the site; splitting it
     * per route would be this generator inventing an instruction nobody gave.
     */
    return {
      site: {
        value,
        provenance: "operator-override",
        method: "cli-override",
        mobileObservedWidth: mobile.width,
        desktopObservedWidth: desktop.width,
        convention: BREAKPOINT_CONVENTION,
        // Responsive Core P0 §C2.6 grade 1: no evidence is read or borrowed.
        servedSwitch: {
          value,
          grade: "operator-override",
          reason: "operator --breakpoint; site-wide, no per-route switch",
          evidence: {},
        },
      },
      byPageId: new Map<string, number>(),
      records: [],
      variantTreeNotObserved: [],
    };
  }

  const decision = chooseTreeSwitch({
    pages: options.pages ?? [],
    mobileWidth: mobile.width,
    desktopWidth: desktop.width,
  });

  /*
   * TASK 28.8 A1 — the policy width, clamped into the interval the observation
   * can actually serve.
   *
   * `(mobileObservedWidth, desktopObservedWidth]` is the same interval the
   * inference clamps its candidates into, and for the same reason: a switch
   * outside it serves one of the two trees at a width where the OTHER tree is
   * the one that was observed. A corpus observed at, say, 320/768 gets 768 and
   * not 801, and `policyClamped` says the policy number was moved.
   */
  const policyFloor = Math.floor(mobile.width) + 1;
  const policyCeil = Math.floor(desktop.width);
  const policyValue = Math.min(
    Math.max(V1_RESPONSIVE_POLICY.desktopMinPx, policyFloor),
    Math.max(policyCeil, policyFloor),
  );

  const inferredMethod = decision.snapped
    ? "authored-breakpoint"
    : "observed-endpoint-midpoint";

  /*
   * Responsive Core P0 §C2.6 — the SITE grade. Grade 2 is read off the same
   * ranked winner the inference already ships (`rankWithFingerprint` puts
   * observed swaps first, so `ambiguous` cannot hide one); grade 3 off the
   * bisections no authored candidate explains; grade 4 is A1, unchanged.
   */
  const siteServed = gradeSwitch(decision.chosen, decision.observedOnly, {
    policyValue,
    mobileWidth: mobile.width,
    desktopWidth: desktop.width,
    domSwitchWidthObserved: decision.domSwitchWidthObserved,
  });
  const siteIsPolicy = siteServed.grade === "product-policy";
  const siteEvidenceGrade: "authored-observed" | "observed-only" | undefined =
    siteServed.grade === "authored-observed" || siteServed.grade === "observed-only"
      ? siteServed.grade
      : undefined;

  const site: BreakpointSpec = {
    value: siteServed.value,
    provenance: siteEvidenceGrade ?? "product-policy",
    method: siteEvidenceGrade ?? "product-policy-v1",
    /*
     * The inference's own answer, kept as evidence. Every candidate field below
     * still describes THIS decision — it is the same `chooseTreeSwitch()` output
     * it has always been.
     */
    inferredAuthoredPx: decision.px,
    inferredAuthoredMethod: inferredMethod,
    ...(siteIsPolicy && policyValue !== V1_RESPONSIVE_POLICY.desktopMinPx
      ? { policyClamped: true }
      : {}),
    mobileObservedWidth: mobile.width,
    desktopObservedWidth: desktop.width,
    convention: BREAKPOINT_CONVENTION,
    ...(decision.fallbackReason !== undefined
      ? { fallbackReason: decision.fallbackReason }
      : {}),
    candidateCount: decision.candidateCount,
    ambiguous: decision.ambiguous,
    candidatesOutsideObservedInterval: decision.candidatesOutsideObservedInterval,
    candidatesOmitted: decision.candidatesOmitted,
    candidates: decision.candidates,
    ...(decision.chosen !== undefined ? { chosen: decision.chosen } : {}),
    pagesRead: decision.pagesRead,
    pagesWithHistogram: decision.pagesWithHistogram,
    pagesWithUsableProbe: decision.pagesWithUsableProbe,
    treeDivergence: decision.treeDivergence,
    pagesIdenticalWalk: decision.divergenceReport.pagesIdenticalWalk,
    pagesDivergentWalk: decision.divergenceReport.pagesDivergentWalk,
    pagesWalkNotComparable: decision.divergenceReport.pagesNotComparable,
    domSwitchWidthObserved: decision.domSwitchWidthObserved,
    pagesWithFingerprint: decision.pagesWithFingerprint,
    servedSwitch: siteServed,
  };

  /*
   * Responsive Core P0 §C2.6 — PER-ROUTE SERVING IS BACK, AND ONLY ON EVIDENCE.
   *
   * 28.8 A1 left `byPageId` empty because a per-route number was a per-route
   * GUESS. A route with its OWN grade-2/3 evidence is not guessing: its probe
   * watched its family swap at that width. Such a route is served its own value
   * (and lands in `byPageId` when it differs from the site's), which feeds the
   * unchanged §26 machinery — `globalsCss` scoping, `breakpointByPageId` on the
   * probe axis and `route-map.json`'s `pageBreakpoints`. A route without evidence
   * of its own inherits the site's value AND grade, and says so (`inherited`).
   *
   * `record.breakpoint` stays the route's own INFERENCE (as since A1);
   * `record.servedSwitch.value` is the width the clone serves it at, and
   * `differsFromSite` / `unservedChangeWidths` / `variantTreeNotObserved` are
   * measured against it (the inference's versions ride as `inferred*`).
   */
  const byPageId = new Map<string, number>();
  const records: PageBreakpointRecord[] = [];
  const unserved = new Set<number>();
  for (const page of decision.perPage) {
    const own = gradeSwitch(page.ownDecision ? page.chosen : undefined, page.observedOnly, {
      policyValue,
      mobileWidth: mobile.width,
      desktopWidth: desktop.width,
      domSwitchWidthObserved: page.domSwitchWidthObserved,
    });
    const routeServed: ServedSwitch =
      own.grade === "authored-observed" || own.grade === "observed-only"
        ? own
        : {
            value: siteServed.value,
            grade: siteServed.grade,
            reason: `route has no grade-2/3 evidence of its own (${own.reason}); inherits the site switch`,
            inherited: true,
            evidence: siteServed.evidence,
          };
    const servedDiffers =
      routeServed.inherited !== true && routeServed.value !== siteServed.value;
    if (servedDiffers) byPageId.set(page.pageId, routeServed.value);
    /*
     * Responsive Core P0 — the §26.4 limitation describes what SHIPS: every
     * width this route was measured to change at, minus the width the clone
     * actually swaps it at. Measuring against the inference (as A1 left it)
     * named the wrong width whenever a route inherits a different served value.
     */
    const servedUnserved = page.changeWidths.filter((w) => w !== routeServed.value);
    for (const px of servedUnserved) unserved.add(px);
    records.push({
      pageId: page.pageId,
      breakpoint: page.px,
      ownDecision: page.ownDecision,
      differsFromSite: servedDiffers,
      inferredDiffersFromSite: page.differsFromSite,
      ...(page.fallbackReason !== undefined
        ? { fallbackReason: page.fallbackReason }
        : {}),
      candidateCount: page.candidateCount,
      ambiguous: page.ambiguous,
      ...(page.chosen !== undefined ? { chosen: page.chosen } : {}),
      dualDom: page.dualDom,
      domSwitchWidthObserved: page.domSwitchWidthObserved,
      familyChangeWidths: page.familyChangeWidths,
      unservedChangeWidths: servedUnserved,
      inferredUnservedChangeWidths: page.unservedChangeWidths,
      servedSwitch: routeServed,
    });
  }
  return {
    site,
    byPageId,
    records,
    variantTreeNotObserved: [...unserved]
      .sort((a, b) => a - b)
      .map(variantTreeNotObservedCode),
  };
}

/**
 * Responsive Core P0 §C2.6 — ONE GRADE, from one grain's evidence.
 *
 * `chosen` is that grain's ranked authored winner (undefined when it had none);
 * `observedOnly` its bisection report. Every value returned lies in
 * `(mobileWidth, desktopWidth]`: grade-2 candidates are clamped by
 * `aggregateAuthoredCandidates`, grade-3 widths outside are dropped by
 * `collectObservedOnlySwitches`, and grade 4 is the clamped policy value. The
 * interval is re-checked here so a violation degrades to the policy instead of
 * shipping.
 */
export function gradeSwitch(
  chosen: TreeSwitchCandidate | undefined,
  observedOnly: ObservedOnlyReport,
  options: {
    policyValue: number;
    mobileWidth: number;
    desktopWidth: number;
    domSwitchWidthObserved: boolean;
  },
): ServedSwitch {
  const { policyValue, mobileWidth, desktopWidth } = options;
  const inInterval = (px: number): boolean => px > mobileWidth && px <= desktopWidth;
  if (
    chosen !== undefined &&
    chosen.authoredWeight > 0 &&
    chosen.familyChangeObserved &&
    options.domSwitchWidthObserved &&
    inInterval(chosen.px)
  ) {
    return {
      value: chosen.px,
      grade: "authored-observed",
      reason:
        `authored breakpoint ${chosen.px}px (weight ${chosen.authoredWeight}) is the ranked winner ` +
        `and the probe watched the render family change across it on ${chosen.familyChangePages} page(s)`,
      evidence: {
        candidatePx: chosen.px,
        authoredWeight: chosen.authoredWeight,
        familyChange: chosen.familyChange,
        familyChangePages: chosen.familyChangePages,
      },
    };
  }
  const best = observedOnly.candidates[0];
  if (best !== undefined && inInterval(best.px)) {
    return {
      value: best.px,
      grade: "observed-only",
      reason:
        `a family switch was bisected to the 1px bracket ${best.bisection.lo}|${best.bisection.hi} ` +
        `(${best.bisection.probe} probe, ${best.pages} page(s), size ${best.familyChange}) ` +
        `with no authored candidate within ±1px` +
        (chosen !== undefined
          ? `; the authored winner ${chosen.px}px was not observed as a family swap`
          : ""),
      evidence: {
        candidatePx: best.px,
        familyChange: best.familyChange,
        bisection: best.bisection,
        bisectionPages: best.pages,
      },
    };
  }
  const why =
    chosen === undefined
      ? "no authored candidate in the observed interval"
      : chosen.authoredWeight === 0
        ? `authored winner ${chosen.px}px carries no authored weight`
        : `authored winner ${chosen.px}px was not observed as a family swap`;
  const bisectionNote =
    observedOnly.bisectionsRead === 0
      ? "no family-switch bisection evidence"
      : `no usable bisection (${observedOnly.bisectionsRead} read: ` +
        `${observedOnly.excludedNotConverged} unconverged, ${observedOnly.excludedWideBracket} wide, ` +
        `${observedOnly.excludedNoFamilyChange} no family change, ${observedOnly.excludedNearAuthored} near authored, ` +
        `${observedOnly.excludedOutsideObservedInterval} outside interval` +
        (observedOnly.excludedWeakSupport ? `, ${observedOnly.excludedWeakSupport} single-page structure-only` : "") +
        ")";
  return {
    value: policyValue,
    grade: "product-policy",
    reason: `${why}; ${bisectionNote}; serving the V1 product policy`,
    evidence: {
      ...(chosen !== undefined
        ? {
            candidatePx: chosen.px,
            authoredWeight: chosen.authoredWeight,
            familyChange: chosen.familyChange,
            familyChangePages: chosen.familyChangePages,
          }
        : {}),
    },
  };
}

/**
 * The two media queries that implement the convention above.
 *
 * The mobile query stops at `breakpoint - 0.02px` rather than `breakpoint - 1px`
 * because viewport widths are fractional on fractional-DPR displays, and a 1px
 * gap would leave both variants hidden at, say, 914.5px. 0.02px is below the
 * smallest width a browser reports and above nothing at all.
 */
export function breakpointMediaQueries(breakpoint: number): {
  desktop: string;
  mobile: string;
} {
  return {
    desktop: `(min-width: ${breakpoint}px)`,
    mobile: `(max-width: ${(breakpoint - 0.02).toFixed(2)}px)`,
  };
}
