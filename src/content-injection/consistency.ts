import type { SlotValue } from "../recon-template/types.js";
import type { LoadedReconTemplate } from "./load-template.js";
import {
  CONTENT_SCHEMA_VERSION,
  ConsistencyReportSchema,
  type AuthoringPlanFile,
  type ConsistencyFinding,
  type ContentUnitsFile,
  type SiteContentPlan,
  type ConsistencyReport,
} from "./types.js";

/**
 * CROSS-PAGE CONSISTENCY REVIEW (Task 28 Phase 9).
 *
 * The review pass Content V2 did not have. Three passes already exist and each
 * asks a different question:
 *
 *   validate.ts    is this value safe and in scope?
 *   layout-qa.ts   does this value still fit the reconstructed box?
 *   brand-leak.ts  did the SOURCE brand survive into the new copy?
 *
 * None of them asks the question a reader of a MULTI-PAGE site asks: do these
 * pages belong to the same site? A run can pass all three with a fully written
 * homepage and seven untouched pages, or with a working name spelled three
 * ways, and nothing would say so.
 *
 * DETERMINISTIC AND NON-GATING. Every check reads artifacts this run already
 * produced; none of them rewrites a value. Findings are reported in the same
 * position as the brand-leak scan — an `error` here is a real defect an
 * operator must see, not an ingest failure, because "these two pages disagree"
 * is a judgement an engine reports and a human settles.
 */

/** Collapsed lowercase form, so "Run Your Ops" and "run your  ops" compare equal. */
function normalize(value: string): string {
  return value.toLowerCase().replace(/\s+/g, " ").trim();
}

/** Letters and digits only — "FlowPilot", "Flow Pilot" and "flow-pilot" collapse together. */
function collapseIdentifier(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "");
}

/** A written value long enough that repeating it verbatim across pages is a signal. */
const CROSS_ROUTE_DUPLICATE_MIN_CHARS = 40;
/** A route below this share of its own in-scope slots is thin, not complete. */
const THIN_ROUTE_COVERAGE = 0.1;
/**
 * A route can be fully WRITTEN and still be the source site's page: a value
 * written identical to the source default is a decision, but it is not new
 * copy. Below this share of CHANGED values the page still reads as the source.
 */
const SOURCE_DOMINANT_CHANGE = 0.1;

export interface ConsistencyReviewInput {
  runId: string;
  templateId: string;
  scopedRoutes: readonly string[];
  template: LoadedReconTemplate;
  unitsFile: ContentUnitsFile;
  /** The overlay that will actually be written (bare slotKey → value). */
  overlay: Record<string, SlotValue>;
  /** Keys whose written value differs from the source default. */
  changed: ReadonlySet<string>;
  /** The plan the run derived; supplies the working name and the page plans. */
  plan?: AuthoringPlanFile;
  /** The site plan the generator/author supplied, when there was one. */
  sitePlan?: SiteContentPlan;
  /**
   * Slot keys the run's enablement disabled. A disabled route renders nothing,
   * so demanding page-plan or coverage from it would manufacture a blocker for
   * work the operator already decided against.
   */
  disabledSlotKeys?: readonly string[];
  /** Routes the run's enablement disabled — excluded from every route check. */
  disabledRoutes?: readonly string[];
}

export function reviewCrossPageConsistency(input: ConsistencyReviewInput): ConsistencyReport {
  const findings: ConsistencyFinding[] = [];
  const checks: { id: string; description: string; subjects: number; findings: number }[] = [];
  const disabledRoutes = new Set(input.disabledRoutes ?? []);
  const disabledSlots = new Set(input.disabledSlotKeys ?? []);
  const routes = input.scopedRoutes.filter((route) => !disabledRoutes.has(route));
  const record = (
    id: string,
    description: string,
    subjects: number,
    produced: ConsistencyFinding[],
  ): void => {
    checks.push({ id, description, subjects, findings: produced.length });
    findings.push(...produced);
  };

  // ---- per-route population and coverage ---------------------------------
  const routeOfKey = new Map<string, string>();
  const inScopeByRoute = new Map<string, number>();
  for (const unit of input.unitsFile.units) {
    if (unit.scope !== "page" || unit.route === undefined) continue;
    for (const slot of unit.slots) {
      if (disabledSlots.has(slot.key)) continue;
      routeOfKey.set(slot.key, unit.route);
      inScopeByRoute.set(unit.route, (inScopeByRoute.get(unit.route) ?? 0) + 1);
    }
  }
  const writtenByRoute = new Map<string, number>();
  const changedByRoute = new Map<string, number>();
  for (const key of Object.keys(input.overlay)) {
    const route = routeOfKey.get(key);
    if (route === undefined) continue;
    writtenByRoute.set(route, (writtenByRoute.get(route) ?? 0) + 1);
    if (input.changed.has(key)) changedByRoute.set(route, (changedByRoute.get(route) ?? 0) + 1);
  }
  const routeCoverage = routes.map((route) => ({
    route,
    inScopeSlots: inScopeByRoute.get(route) ?? 0,
    writtenSlots: writtenByRoute.get(route) ?? 0,
    changedSlots: changedByRoute.get(route) ?? 0,
  }));

  // 1. THE "not only the homepage" CHECK. A scoped route the run wrote nothing
  //    for is not a complete site — it is the source page with a new header.
  record(
    "route-uncovered",
    "every enabled scoped route with in-scope page slots received at least one written value",
    routeCoverage.filter((entry) => entry.inScopeSlots > 0).length,
    routeCoverage
      .filter((entry) => entry.inScopeSlots > 0 && entry.writtenSlots === 0)
      .map((entry) => ({
        code: "route-uncovered",
        severity: "error" as const,
        route: entry.route,
        message:
          `route ${entry.route} is in scope with ${entry.inScopeSlots} page slot(s) but the run wrote ` +
          "no value for any of them — the page still renders the source site's content",
      })),
  );

  // 2. Thin coverage: written, but barely. Reported, never a gate.
  record(
    "route-thin-coverage",
    `an enabled route whose written coverage is under ${Math.round(THIN_ROUTE_COVERAGE * 100)}% of its own in-scope page slots`,
    routeCoverage.filter((entry) => entry.inScopeSlots > 0).length,
    routeCoverage
      .filter(
        (entry) =>
          entry.inScopeSlots > 0 &&
          entry.writtenSlots > 0 &&
          entry.writtenSlots / entry.inScopeSlots < THIN_ROUTE_COVERAGE,
      )
      .map((entry) => ({
        code: "route-thin-coverage",
        severity: "warning" as const,
        route: entry.route,
        message:
          `route ${entry.route} received ${entry.writtenSlots} of ${entry.inScopeSlots} in-scope page ` +
          "slot value(s); most of the page still renders the source site's content",
      })),
  );

  // 2b. Written everywhere, changed almost nowhere. This is the check that
  //     keeps "every route is covered" from being a hollow claim: a page whose
  //     values were all decided but almost all decided to KEEP the source
  //     default still shows the visitor the source site's words.
  record(
    "route-source-dominant",
    `an enabled route where fewer than ${Math.round(SOURCE_DOMINANT_CHANGE * 100)}% of its in-scope page slots differ from the source default`,
    routeCoverage.filter((entry) => entry.inScopeSlots > 0).length,
    routeCoverage
      .filter(
        (entry) => entry.inScopeSlots > 0 && entry.changedSlots / entry.inScopeSlots < SOURCE_DOMINANT_CHANGE,
      )
      .map((entry) => ({
        code: "route-source-dominant",
        severity: "warning" as const,
        route: entry.route,
        message:
          `route ${entry.route} has ${entry.writtenSlots} of ${entry.inScopeSlots} slot(s) decided but only ` +
          `${entry.changedSlots} differ from the source default; most of what a visitor reads on this page ` +
          "is still the source site's copy",
      })),
  );

  // ---- page plans --------------------------------------------------------
  const pagePlans = new Map<string, { route: string; primaryMessage: string; conversionGoal: string }>();
  for (const page of input.plan?.pages ?? []) {
    if (page.plan === undefined) continue;
    pagePlans.set(page.route, {
      route: page.route,
      primaryMessage: page.plan.primaryMessage,
      conversionGoal: page.plan.conversionGoal,
    });
  }
  for (const page of input.sitePlan?.pagePlans ?? []) {
    if (pagePlans.has(page.route)) continue;
    pagePlans.set(page.route, {
      route: page.route,
      primaryMessage: page.primaryMessage,
      conversionGoal: page.conversionGoal,
    });
  }

  // 3. Every enabled scoped route has a PageContentPlan of its own.
  record(
    "page-plan-missing",
    "every enabled scoped route has a PageContentPlan under the site plan",
    routes.length,
    routes
      .filter((route) => !pagePlans.has(route))
      .map((route) => ({
        code: "page-plan-missing",
        severity: "error" as const,
        route,
        message:
          `route ${route} is in the generation scope but no PageContentPlan says what the page is for; ` +
          "its copy answers to no page-level plan",
      })),
  );

  // 4. A plan for a route nobody is generating.
  const scopedSet = new Set(input.scopedRoutes);
  record(
    "page-plan-orphan",
    "no PageContentPlan names a route outside the generation scope",
    pagePlans.size,
    [...pagePlans.keys()]
      .filter((route) => !scopedSet.has(route))
      .map((route) => ({
        code: "page-plan-orphan",
        severity: "warning" as const,
        route,
        message: `a PageContentPlan names route ${route}, which is not in this run's generation scope`,
      })),
  );

  // 5. Two pages that say exactly the same thing are one page twice.
  const byMessage = new Map<string, string[]>();
  for (const [route, plan] of pagePlans) {
    if (!scopedSet.has(route) || disabledRoutes.has(route)) continue;
    const key = normalize(plan.primaryMessage);
    if (key === "") continue;
    byMessage.set(key, [...(byMessage.get(key) ?? []), route]);
  }
  record(
    "duplicate-primary-message",
    "no two enabled routes carry the identical page-plan primary message",
    byMessage.size,
    [...byMessage.entries()]
      .filter(([, sharing]) => sharing.length > 1)
      .map(([, sharing]) => ({
        code: "duplicate-primary-message",
        severity: "warning" as const,
        route: sharing[0],
        message: `routes ${sharing.join(", ")} share one identical page-plan primary message`,
      })),
  );

  // 6. A page pulling the visitor somewhere the site plan never declared.
  // Read the messages that ACTUALLY exist. A brief has no `messages` field, so
  // a plan built at prepare time carries an empty engine-default list; falling
  // back only on `undefined` would review a page goal against nothing and call
  // every goal a drift.
  const planMessages = input.plan?.site.messages ?? [];
  const siteConversion = normalize(
    input.plan?.site.primaryConversion ?? input.sitePlan?.primaryConversion ?? "",
  );
  const siteMessages = new Set(
    (planMessages.length > 0 ? planMessages : (input.sitePlan?.messages ?? [])).map(normalize),
  );
  const planned = [...pagePlans.values()].filter(
    (plan) => scopedSet.has(plan.route) && !disabledRoutes.has(plan.route),
  );
  record(
    "conversion-goal-drift",
    "each page's conversion goal is the site's primary conversion or one of the site messages",
    planned.length,
    siteConversion === ""
      ? []
      : planned
          .filter((plan) => {
            const goal = normalize(plan.conversionGoal);
            if (goal === "") return false;
            return goal !== siteConversion && !siteMessages.has(goal);
          })
          .map((plan) => ({
            code: "conversion-goal-drift",
            severity: "warning" as const,
            route: plan.route,
            message:
              `route ${plan.route} converts on "${plan.conversionGoal}", which is neither the site's ` +
              `primary conversion ("${input.plan?.site.primaryConversion ?? input.sitePlan?.primaryConversion ?? ""}") ` +
              "nor one of the site messages",
          })),
  );

  // 7. One site, one name. A working name spelled two ways across pages is the
  //    single most visible cross-page defect and nothing else detects it.
  const workingName = input.plan?.site.siteIdentity.workingName ?? input.sitePlan?.siteIdentity.workingName ?? "";
  const canonical = collapseIdentifier(workingName);
  const nameFindings: ConsistencyFinding[] = [];
  let nameSubjects = 0;
  if (canonical.length >= 4) {
    let exactHits = 0;
    // The name, allowing ONE separator between letters: "FlowPilot",
    // "Flow Pilot", "flow-pilot" all match; "workflowpilot" does not, because
    // the match must stand on word boundaries.
    const variantRe = new RegExp(canonical.split("").join("[\\s_.-]?"), "gi");
    const isWordChar = (ch: string | undefined): boolean => ch !== undefined && /[a-z0-9]/i.test(ch);
    for (const [key, value] of Object.entries(input.overlay)) {
      if (typeof value !== "string") continue;
      // URL slots carry hosts and paths where a lowercase name is CORRECT, not
      // a misspelling. Only prose is reviewed for one-site-one-spelling.
      if (input.template.slotByKey.get(key)?.type !== "text") continue;
      nameSubjects++;
      for (const match of value.matchAll(variantRe)) {
        const index = match.index ?? 0;
        if (isWordChar(value[index - 1]) || isWordChar(value[index + match[0].length])) continue;
        const trimmed = match[0];
        if (trimmed === workingName) {
          exactHits++;
          continue;
        }
        if (collapseIdentifier(trimmed) !== canonical) continue;
        nameFindings.push({
          code: "site-name-variant",
          severity: "error",
          slotKey: key,
          ...(routeOfKey.get(key) !== undefined ? { route: routeOfKey.get(key)! } : {}),
          message:
            `value spells the working name "${trimmed}" where the site plan says "${workingName}" — ` +
            "one site, one spelling",
        });
      }
    }
    if (exactHits === 0 && nameFindings.length === 0 && Object.keys(input.overlay).length > 0) {
      nameFindings.push({
        code: "site-name-absent",
        severity: "warning",
        message:
          `the site plan's working name "${workingName}" appears in no written value; the rename may ` +
          "never have reached the copy",
      });
    }
  }
  record(
    "site-name-consistency",
    "the site plan's working name is spelled one way everywhere it appears in written copy",
    nameSubjects,
    nameFindings,
  );

  // 8. The same long sentence pasted onto three or more different pages.
  const routesByValue = new Map<string, Set<string>>();
  for (const [key, value] of Object.entries(input.overlay)) {
    if (typeof value !== "string" || value.length < CROSS_ROUTE_DUPLICATE_MIN_CHARS) continue;
    const route = routeOfKey.get(key);
    if (route === undefined || disabledRoutes.has(route)) continue;
    const bucket = routesByValue.get(normalize(value)) ?? new Set<string>();
    bucket.add(route);
    routesByValue.set(normalize(value), bucket);
  }
  record(
    "cross-route-duplicate-copy",
    `no single written value of ${CROSS_ROUTE_DUPLICATE_MIN_CHARS}+ characters is repeated verbatim on 3 or more routes`,
    routesByValue.size,
    [...routesByValue.entries()]
      .filter(([, routeSet]) => routeSet.size >= 3)
      .map(([value, routeSet]) => ({
        code: "cross-route-duplicate-copy",
        severity: "warning" as const,
        message:
          `${routeSet.size} routes (${[...routeSet].sort().join(", ")}) carry the identical value ` +
          `"${value.slice(0, 60)}${value.length > 60 ? "…" : ""}"`,
      })),
  );

  // 9. A site plan with no tone is a site with no voice to be consistent with.
  const planTone = input.plan?.site.tone ?? [];
  const tone = planTone.length > 0 ? planTone : (input.sitePlan?.tone ?? []);
  record(
    "site-tone-declared",
    "the site plan declares a tone the pages can be consistent with",
    1,
    tone.length > 0
      ? []
      : [
          {
            code: "site-tone-undeclared",
            severity: "warning" as const,
            message: "the site plan declares no tone, so no cross-page voice consistency can be reviewed",
          },
        ],
  );

  const errors = findings.filter((finding) => finding.severity === "error").length;
  const warnings = findings.length - errors;
  return ConsistencyReportSchema.parse({
    schemaVersion: CONTENT_SCHEMA_VERSION,
    schemaName: "content-consistency-v1",
    runId: input.runId,
    templateId: input.templateId,
    scopedRoutes: [...input.scopedRoutes],
    checks,
    findings,
    counts: { errors, warnings },
    routeCoverage,
    pass: errors === 0,
    provenance: "derived",
  });
}
