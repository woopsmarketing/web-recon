import { readFile } from "node:fs/promises";
import { z } from "zod";
import type { RuntimePage, RuntimeRouteMap } from "../reconstruction/index.js";
import type { LoadedSiteSpec } from "../sitespec/index.js";
import {
  RouteScopeSchema,
  TemplateInputError,
  isSlotizedScope,
  DEFAULT_ROUTE_SCOPE,
  type RouteScope,
} from "./types.js";

/**
 * Route scope policy — the compiler's answer to "a blog has 4,000 pages".
 *
 * A site's article / doc / listing families can hold thousands of URLs. Giving
 * every one of them a deep customer-editable slot surface is not a feature: it
 * is thousands of slots nobody will ever open. This policy is an INPUT to
 * template compilation (`--route-policy <file>`) that decides, per route,
 * whether that route gets a slot surface at all.
 *
 * What it is NOT:
 *   - not a Selector concern (discovery coverage is unchanged; the Selector
 *     schema is untouched),
 *   - not a SiteSpec concern (coverage and families are read, never rewritten),
 *   - not a rendering concern. THIS IS THE WHOLE POINT: the policy is applied
 *     to SLOT EXTRACTION only, at one seam in `compile.ts`. The template app is
 *     still the Exact Reconstruction app copied byte for byte — same route map,
 *     same runtime page data — so a route with zero slots still renders exactly
 *     what the Exact Reconstruction renders. Exact Reconstruction is frozen and
 *     nothing here may change it.
 *
 * The vocabulary is closed (a zod enum, like every other classification in this
 * repo) and kebab-cased like `renderCoverage` / `familyType`:
 *
 *   core-reconstruct           full slotization — today's behavior, the default
 *   collection-index           the index/listing route of a family (slotized)
 *   collection-representative  the one member standing for a large family (slotized)
 *   structure-only             structurally represented, ZERO customer slots
 *   exclude                    not represented in the template's slot surface
 *                              or its site map
 *
 * The essential distinction is SLOTIZED vs NOT. `collection-index` and
 * `collection-representative` extract exactly like `core-reconstruct`; they
 * differ only in what they DECLARE, which is what the site map's collections
 * model reads back.
 */

// ---------------------------------------------------------------------------
// Policy file (input, not part of the artifact contract)
// ---------------------------------------------------------------------------

/**
 * One rule. Matchers are AND-ed and at least one must be present; rules are
 * evaluated in file order and the FIRST match wins, so an operator writes the
 * exception (the representative) above the sweep (the family).
 */
export const RouteScopeRuleSchema = z
  .object({
    /** Exact route key, e.g. `/blog/next-15`. */
    route: z.string().optional(),
    /** Route key prefix, e.g. `/blog` (matches `/blog` and `/blog/...`). */
    routePrefix: z.string().optional(),
    /** SiteSpec family id the route's page belongs to, e.g. `f000005`. */
    familyId: z.string().optional(),
    scope: RouteScopeSchema,
    reason: z.string().optional(),
  })
  .strict()
  .refine(
    (rule) =>
      rule.route !== undefined || rule.routePrefix !== undefined || rule.familyId !== undefined,
    { message: "a rule needs at least one matcher (route / routePrefix / familyId)" },
  );
export type RouteScopeRule = z.infer<typeof RouteScopeRuleSchema>;

export const RouteScopePolicySchema = z
  .object({
    $doc: z.string().optional(),
    schemaVersion: z.literal(1),
    /** Scope for every route no rule matched. Defaults to `core-reconstruct`. */
    defaultScope: RouteScopeSchema.optional(),
    rules: z.array(RouteScopeRuleSchema).optional(),
  })
  .strict();
export type RouteScopePolicy = z.infer<typeof RouteScopePolicySchema>;

export async function loadRouteScopePolicy(file: string): Promise<RouteScopePolicy> {
  let raw: string;
  try {
    raw = await readFile(file, "utf8");
  } catch (error) {
    throw new TemplateInputError(
      `route policy could not be read: ${file} (${(error as Error).message})`,
    );
  }
  let json: unknown;
  try {
    json = JSON.parse(raw) as unknown;
  } catch (error) {
    throw new TemplateInputError(
      `route policy is not valid JSON: ${file} (${(error as Error).message})`,
    );
  }
  const parsed = RouteScopePolicySchema.safeParse(json);
  if (!parsed.success) {
    throw new TemplateInputError(`route policy failed validation: ${file}\n${parsed.error.message}`);
  }
  return parsed.data;
}

// ---------------------------------------------------------------------------
// Resolution
// ---------------------------------------------------------------------------

/** `pageId → familyId`, the SiteSpec fact both this module and the site map read. */
export function familyIdByPageId(siteSpec: LoadedSiteSpec): Map<string, string> {
  const familyByPage = new Map<string, string>();
  for (const page of siteSpec.siteSpec.pages) familyByPage.set(page.pageId, page.familyId);
  return familyByPage;
}

export interface RouteScopeDecision {
  route: string;
  url: string;
  pageId: string;
  familyId?: string;
  scope: RouteScope;
  /** Index into `policy.rules` of the rule that decided this, when any did. */
  matchedRuleIndex?: number;
  reason?: string;
}

export interface ResolvedRoutePolicy {
  /** False when no policy file was supplied — every route is `core-reconstruct`. */
  applied: boolean;
  /**
   * Repo-relative POSIX path, the form every other artifact in this repo
   * records an input as. The caller normalizes (`compile.ts`), because what a
   * template artifact must not carry is HOW the operator spelled the argument:
   * site-map.json feeds a release lineage hash, so `./x.json` vs `/abs/x.json`
   * would otherwise read as a lineage difference where there is none.
   */
  policyFile?: string;
  defaultScope: RouteScope;
  decisions: RouteScopeDecision[];
  scopeByRoute: Map<string, RouteScope>;
  /** Pages at least one slotized route serves — the extraction input. */
  slotizedPageIds: Set<string>;
  /** Pages every route of which is `structure-only` / `exclude`. */
  unslotizedPageIds: Set<string>;
  scopeCounts: Record<RouteScope, number>;
  /**
   * `structure-only` routes whose page IS slotized through another route (a
   * family-represented route sharing the representative's page). They carry no
   * slots of their own, but they render a page the slot layer edits — so
   * "structure-only" is weaker than it sounds for exactly this many routes.
   */
  structureOnlySharedPageRoutes: number;
}

function matches(rule: RouteScopeRule, route: { key: string }, familyId?: string): boolean {
  if (rule.route !== undefined && rule.route !== route.key) return false;
  if (rule.routePrefix !== undefined) {
    const prefix = rule.routePrefix;
    if (!(route.key === prefix || route.key.startsWith(prefix.endsWith("/") ? prefix : `${prefix}/`)))
      return false;
  }
  if (rule.familyId !== undefined && rule.familyId !== familyId) return false;
  return true;
}

/**
 * Route → scope, plus the page selection the extractor is given.
 *
 * Routes are many-to-one with pages (a family-represented route renders the
 * representative's page), so a page is slotized when AT LEAST ONE route serving
 * it is slotized. Dropping a page whose only routes are structure-only is the
 * entire mechanical effect of this policy.
 *
 * A rule that DECIDES no route is an input error, not a warning: a policy that
 * silently does nothing is exactly the failure this stage exists to prevent.
 * Deciding, not matching — a rule every match of which was already claimed by
 * an earlier rule (first-match-wins) is as inert as one that matches nothing.
 */
export function resolveRoutePolicy(
  routeMap: RuntimeRouteMap,
  siteSpec: LoadedSiteSpec,
  policy?: RouteScopePolicy,
  policyFile?: string,
): ResolvedRoutePolicy {
  const familyByPage = familyIdByPageId(siteSpec);
  const rules = policy?.rules ?? [];
  const defaultScope = policy?.defaultScope ?? DEFAULT_ROUTE_SCOPE;

  const decisions: RouteScopeDecision[] = [];
  const scopeByRoute = new Map<string, RouteScope>();
  const ruleHits = new Array<number>(rules.length).fill(0);
  const scopeCounts: Record<RouteScope, number> = {
    "core-reconstruct": 0,
    "collection-index": 0,
    "collection-representative": 0,
    "structure-only": 0,
    exclude: 0,
  };

  for (const route of routeMap.routes) {
    const familyId = familyByPage.get(route.pageSourceId);
    let scope = defaultScope;
    let matchedRuleIndex: number | undefined;
    let reason: string | undefined;
    for (let i = 0; i < rules.length; i++) {
      if (!matches(rules[i]!, route, familyId)) continue;
      // Only the DECIDING match counts as a hit. A rule that merely also
      // matches a route an earlier rule already decided has changed nothing,
      // so counting it would let a fully shadowed rule pass the guard below.
      ruleHits[i]! += 1;
      scope = rules[i]!.scope;
      matchedRuleIndex = i;
      reason = rules[i]!.reason;
      break;
    }
    decisions.push({
      route: route.key,
      url: route.url,
      pageId: route.pageSourceId,
      ...(familyId !== undefined ? { familyId } : {}),
      scope,
      ...(matchedRuleIndex !== undefined ? { matchedRuleIndex } : {}),
      ...(reason !== undefined ? { reason } : {}),
    });
    scopeByRoute.set(route.key, scope);
    scopeCounts[scope] += 1;
  }

  const unmatched = ruleHits
    .map((hits, i) => ({ hits, i }))
    .filter((r) => r.hits === 0)
    .map((r) => `#${r.i} ${JSON.stringify(rules[r.i])}`);
  if (unmatched.length > 0) {
    throw new TemplateInputError(
      `route policy has ${unmatched.length} rule(s) that decide no route of this reconstruction ` +
        `(they match nothing, or every route they match was already decided by an earlier rule):\n  ${unmatched.join("\n  ")}`,
    );
  }

  const slotizedPageIds = new Set<string>();
  const allPageIds = new Set<string>();
  for (const decision of decisions) {
    allPageIds.add(decision.pageId);
    if (isSlotizedScope(decision.scope)) slotizedPageIds.add(decision.pageId);
  }
  const unslotizedPageIds = new Set<string>();
  for (const pageId of allPageIds) if (!slotizedPageIds.has(pageId)) unslotizedPageIds.add(pageId);
  const structureOnlySharedPageRoutes = decisions.filter(
    (d) => d.scope === "structure-only" && slotizedPageIds.has(d.pageId),
  ).length;

  if (slotizedPageIds.size === 0) {
    throw new TemplateInputError(
      "route policy leaves no slotized route — a template with zero slots has no content contract",
    );
  }

  return {
    applied: policy !== undefined,
    ...(policyFile !== undefined ? { policyFile } : {}),
    defaultScope,
    decisions,
    scopeByRoute,
    slotizedPageIds,
    unslotizedPageIds,
    scopeCounts,
    structureOnlySharedPageRoutes,
  };
}

/**
 * The machine-readable limitation codes this policy's OUTCOME earns.
 *
 * Every code is countable and diffable, because the manifest's `limitations`
 * is the record a downstream reader consumes instead of the prose handoff —
 * including the case the prose alone used to carry: a `structure-only` route
 * that shares its page with a slotized route really does render slot edits.
 */
export function routePolicyLimitations(resolved: ResolvedRoutePolicy): string[] {
  const codes: string[] = [];
  const structureOnly = resolved.scopeCounts["structure-only"];
  if (structureOnly > 0) {
    codes.push(`structure-only-routes-carry-no-slots:${structureOnly}`);
    // A structure-only page renders the ORIGINAL content for everything on it
    // — including the header/footer a global slot elsewhere edits — because it
    // carries no bindings at all.
    codes.push("structure-only-pages-keep-original-content-including-global-slot-values");
    if (resolved.structureOnlySharedPageRoutes > 0) {
      // …unless the page is shared: policy is per ROUTE, bindings are per PAGE.
      codes.push(
        `structure-only-routes-sharing-a-slotized-page-do-render-slot-edits:${resolved.structureOnlySharedPageRoutes}`,
      );
    }
  }
  // The template app is a byte copy of the frozen exact app, so an excluded
  // route is dropped from the represented surface (site map + slots) but the
  // copied app still serves it.
  if (resolved.scopeCounts.exclude > 0) {
    codes.push(`routes-excluded-by-route-policy:${resolved.scopeCounts.exclude}`);
    codes.push("excluded-routes-still-served-by-the-copied-exact-app");
  }
  return codes;
}

/**
 * The extractor's input: the runtime pages a slotized route serves.
 *
 * The template APP still receives every page (it is a byte copy of the exact
 * app), so this narrowing removes slots, never routes and never rendering.
 */
export function selectSlotizedPages(
  pagesById: ReadonlyMap<string, RuntimePage>,
  resolved: ResolvedRoutePolicy,
): Map<string, RuntimePage> {
  const selected = new Map<string, RuntimePage>();
  for (const [pageId, page] of pagesById) {
    if (resolved.slotizedPageIds.has(pageId)) selected.set(pageId, page);
  }
  return selected;
}
