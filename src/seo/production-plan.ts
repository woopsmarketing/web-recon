import { readFile } from "node:fs/promises";
import path from "node:path";
import type { SourceSeoSnapshot } from "./types.js";
import {
  ProductionSeoPlanSchema,
  type PlannedValue,
  type ProductionBusinessFacts,
  type ProductionRouteSeo,
  type ProductionSeoPlan,
} from "./types.js";
import { createdAtFromRunId } from "./store.js";

/**
 * Production SEO Plan generator (Task 21 B/C/D).
 *
 * Inputs: Recon Template (route inventory + the titles the app would
 * otherwise serve), Content Run (the ONLY source of production copy — the
 * injected brand/plan, e.g. 플로우데스크), Source SEO Snapshot (audit
 * evidence, consumed for forbidden-copy comparison ONLY), Domain State.
 *
 * Hard rules, enforced structurally:
 * - copying source SEO values is forbidden (checked by `checkForbiddenCopy`);
 * - no domain provided → preview mode: robots `noindex,nofollow`, canonical
 *   never finalized, no absolute production URL anywhere. Inventing a domain
 *   is impossible here — there is no default;
 * - business facts (address/phone/prices/reviews/ratings/foundingDate/sameAs)
 *   the user did not provide stay `needs-input`, never invented.
 */

interface TemplateRoute {
  routeId: string;
  key: string;
  path: string;
  title?: string;
}

export interface LoadedTemplateForSeo {
  manifestFile: string;
  templateId: string;
  sourceHost: string;
  appDir: string;
  routes: TemplateRoute[];
}

export async function loadTemplateForSeo(manifestRef: string): Promise<LoadedTemplateForSeo> {
  const manifestFile = manifestRef.endsWith(".json")
    ? path.resolve(manifestRef)
    : path.resolve(manifestRef, "manifest.json");
  const runDir = path.dirname(manifestFile);
  const manifest = JSON.parse(await readFile(manifestFile, "utf8")) as {
    templateId: string;
    source: { host: string };
  };
  const appDir = path.join(runDir, "app");
  const routeMap = JSON.parse(
    await readFile(path.join(appDir, "reconstruction-data", "route-map.json"), "utf8"),
  ) as { routes: { routeId: string; key: string; path: string; title?: string }[] };
  return {
    manifestFile,
    templateId: manifest.templateId,
    sourceHost: manifest.source.host,
    appDir,
    routes: routeMap.routes.map((r) => ({ routeId: r.routeId, key: r.key, path: r.path, title: r.title })),
  };
}

export interface ContentRunForSeo {
  runDir: string;
  runId: string;
  scopedRoutes: string[];
  siteIdentity: { workingName: string; category: string; audience: string; positioning: string };
  pagePlans: { route: string; primaryMessage?: string; newPurpose?: string }[];
  slotValues: Record<string, string>;
  providedFacts: unknown[];
  /** BCP-47-ish language of the injected content, from the intent (e.g. "ko"). */
  language: string | null;
  /**
   * Per-route AUTHORED heading, keyed by route key (Task 28 Phase 10
   * correction). Derived by `deriveRouteHeadings` from the content run's own
   * units + slot values — never from the source site. Absent for a route with
   * no authored heading, in which case the site-level title is used and the
   * route is reported by `checkTitleUniqueness` if that makes it a duplicate.
   */
  routeHeadings: Record<string, RouteHeading>;
}

/** One route's authored heading and the slot key it came from. */
export interface RouteHeading {
  value: string;
  /** The content-run slot key this heading was read from — the basis. */
  slotKey: string;
  /** Which derivation rule produced it. */
  rule: "hero-headline" | "nav-label";
}

interface ContentUnitForHeadings {
  route?: string | null;
  kind?: string;
  slots?: { key: string; role?: string | null }[];
}

/**
 * Per-route title source derivation (Task 28 Phase 10 correction).
 *
 * BEFORE this function existed every route carried the IDENTICAL site-level
 * title `<brand> | <category>` — a real SEO defect on an indexable site (8
 * identical <title>s), and the shipped Phase-10 handoff wrongly described that
 * single string as "per-route". Titles must stay derived from the CUSTOMER'S
 * authored content: the source site's own titles are forbidden copy, so the
 * only admissible per-route strings are ones the content run itself authored.
 *
 * Two rules, in precedence order, both pure lookups — nothing is invented,
 * truncated or reworded:
 *   1. `hero-headline` — the route's own hero unit headline slot
 *      (`kind === "hero"`, slot role `hero.headline`).
 *   2. `nav-label` — an authored navigation/link label whose sibling `.href`
 *      slot VALUE is exactly this route key (e.g. `…nav.changelog.href` = -
 *      "/changelog" → `…nav.changelog.label` = "Changelog").
 *
 * A candidate is rejected (leaving the route on the site-level title) when it
 * is empty, when it is not head-safe, or when it is longer than
 * MAX_ROUTE_HEADING_CHARS — a bounded heading, not a paragraph. Ties are broken
 * by sorted slot key so the derivation is deterministic.
 *
 * The home route is deliberately NOT given a heading by callers: `<brand> |
 * <category>` is the correct homepage title.
 */
export const MAX_ROUTE_HEADING_CHARS = 70;

export function deriveRouteHeadings(
  units: readonly ContentUnitForHeadings[],
  slotValues: Record<string, string>,
): Record<string, RouteHeading> {
  const headings: Record<string, RouteHeading> = {};
  const admissible = (value: string | undefined): value is string => {
    if (typeof value !== "string") return false;
    const trimmed = value.trim();
    if (trimmed === "" || trimmed.length > MAX_ROUTE_HEADING_CHARS) return false;
    return isHeadSafeText(trimmed);
  };

  // ---- rule 1: the route's own authored hero headline ---------------------
  const heroCandidates: { route: string; key: string; value: string }[] = [];
  for (const unit of units) {
    const route = unit.route ?? null;
    if (route === null || unit.kind !== "hero") continue;
    for (const slot of unit.slots ?? []) {
      if ((slot.role ?? "") !== "hero.headline") continue;
      const value = slotValues[slot.key];
      if (!admissible(value)) continue;
      heroCandidates.push({ route, key: slot.key, value: value.trim() });
    }
  }
  for (const candidate of heroCandidates.sort((a, b) => a.key.localeCompare(b.key))) {
    if (headings[candidate.route] !== undefined) continue;
    headings[candidate.route] = { value: candidate.value, slotKey: candidate.key, rule: "hero-headline" };
  }

  // ---- rule 2: an authored nav/link label pointing at the route -----------
  const navCandidates: { route: string; key: string; value: string }[] = [];
  for (const key of Object.keys(slotValues).sort((a, b) => a.localeCompare(b))) {
    if (!key.endsWith(".href")) continue;
    const target = (slotValues[key] ?? "").trim();
    if (!target.startsWith("/")) continue;
    const route = target.split("?")[0].split("#")[0].replace(/\/+$/, "") || "/";
    const prefix = key.slice(0, -".href".length);
    const value = slotValues[`${prefix}.label`];
    if (!admissible(value)) continue;
    navCandidates.push({ route, key: `${prefix}.label`, value: value.trim() });
  }
  for (const candidate of navCandidates) {
    if (headings[candidate.route] !== undefined) continue;
    headings[candidate.route] = { value: candidate.value, slotKey: candidate.key, rule: "nav-label" };
  }
  return headings;
}

export async function loadContentRunForSeo(runDirRef: string): Promise<ContentRunForSeo> {
  const runDir = path.resolve(runDirRef);
  const manifest = JSON.parse(await readFile(path.join(runDir, "manifest.json"), "utf8")) as {
    runId: string;
    scopedRoutes: string[];
  };
  const generation = JSON.parse(await readFile(path.join(runDir, "generation-result.json"), "utf8")) as {
    sitePlan: {
      siteIdentity: ContentRunForSeo["siteIdentity"];
      pagePlans: ContentRunForSeo["pagePlans"];
    };
  };
  const slotValues = JSON.parse(await readFile(path.join(runDir, "slot-values.json"), "utf8")) as Record<string, string>;
  // content-units.json carries the route each authored unit belongs to — the
  // ONLY route↔slot map available here. Optional: a content run written before
  // this file existed (or a minimal fixture) simply yields no route headings,
  // and every route keeps the site-level title.
  let routeHeadings: Record<string, RouteHeading> = {};
  try {
    const units = JSON.parse(await readFile(path.join(runDir, "content-units.json"), "utf8")) as {
      units?: ContentUnitForHeadings[];
    };
    routeHeadings = deriveRouteHeadings(units.units ?? [], slotValues);
  } catch {
    // content-units.json optional — no per-route headings, site-level title
  }
  let providedFacts: unknown[] = [];
  let language: string | null = null;
  try {
    const intent = JSON.parse(await readFile(path.join(runDir, "intent.json"), "utf8")) as {
      providedFacts?: unknown[];
      rawIntent?: string;
      preferences?: { language?: string };
    };
    providedFacts = intent.providedFacts ?? [];
    language =
      intent.preferences?.language ??
      (typeof intent.rawIntent === "string" && /[가-힣]/.test(intent.rawIntent) ? "ko" : null);
  } catch {
    // intent.json optional — facts stay empty (= everything needs-input)
  }
  return {
    runDir,
    runId: manifest.runId,
    scopedRoutes: manifest.scopedRoutes,
    siteIdentity: generation.sitePlan.siteIdentity,
    pagePlans: generation.sitePlan.pagePlans,
    slotValues,
    providedFacts,
    language,
    routeHeadings,
  };
}

/** User-provided business facts (none in the current lineage — everything defaults to needs-input). */
export interface ProvidedBusinessFacts {
  address?: string;
  phone?: string;
  prices?: string;
  reviews?: string;
  ratings?: string;
  foundingDate?: string;
  sameAs?: string[];
}

function fact(value: string | string[] | undefined): ProductionBusinessFacts["address"] {
  return value === undefined ? { status: "needs-input", value: null } : { status: "known", value };
}

function known(value: string, basis: string): PlannedValue {
  return { value, status: "known", basis };
}

function needsInput(basis: string, previewFallback?: string): PlannedValue {
  return { value: null, status: "needs-input", basis, previewFallback: previewFallback ?? null };
}

/** Titles cross a JS-string boundary at the serve proxy — keep them splice-safe. */
export function isHeadSafeText(value: string): boolean {
  return !/["\\<>&]/.test(value) && !/[\u0000-\u001f]/.test(value);
}

export function assertHeadSafeText(value: string, field: string): void {
  if (!isHeadSafeText(value)) {
    throw new Error(`${field} contains characters unsafe for head splicing: ${value}`);
  }
}

export interface BuildPlanOptions {
  runId: string;
  template: LoadedTemplateForSeo;
  contentRun: ContentRunForSeo;
  sourceSnapshot: SourceSeoSnapshot;
  productionDomain?: string;
  facts?: ProvidedBusinessFacts;
  /**
   * Routes the operator turned OFF (Task 28 Phase 6).
   *
   * Filtered out of `template.routes` BEFORE the route loop below, which is the
   * single place every per-route SEO surface is produced: title, description,
   * robots meta, canonical, the whole openGraph block, twitter and JSON-LD. The
   * sitemap urlset (`robots-sitemap.ts`) and the rendered head blocks
   * (`render-head.ts`) both iterate `plan.routes`, so one filter removes the
   * route from all of them — and, because `collect.ts` builds its per-route
   * requirements from THIS plan's `report/needs-input.json`, the requirements
   * disappear because the artifact no longer names the route, never because a
   * disable was requested.
   */
  disabledRoutes?: readonly string[];
}

export function buildProductionSeoPlan(options: BuildPlanOptions): ProductionSeoPlan {
  const { template, contentRun } = options;
  const identity = contentRun.siteIdentity;
  const brand = identity.workingName;
  const preview = options.productionDomain === undefined;
  const mode: "preview" | "production" = preview ? "preview" : "production";
  const origin = preview ? null : `https://${options.productionDomain}`;

  const languageBasis = `content-run:intent language (${JSON.stringify(contentRun.language)})`;
  const locale = contentRun.language === "ko" ? "ko_KR" : null;

  const scoped = new Set(contentRun.scopedRoutes);
  const planByRoute = new Map(contentRun.pagePlans.map((p) => [p.route, p]));

  const disabledRoutes = new Set(options.disabledRoutes ?? []);
  const planRoutes = template.routes.filter((route) => !disabledRoutes.has(route.key));
  if (disabledRoutes.size > 0 && planRoutes.length === 0) {
    throw new Error(
      "production seo plan: every route is disabled — a site with no route has no SEO plan to build",
    );
  }
  const routes: ProductionRouteSeo[] = planRoutes.map((route) => {
    const injected = scoped.has(route.key);
    const pagePlan = planByRoute.get(route.key);
    let title: PlannedValue;
    let description: PlannedValue;
    if (injected && pagePlan !== undefined) {
      // Per-route title (Task 28 Phase 10 correction). The homepage keeps the
      // site-level `<brand> | <category>`; every other route prefers its OWN
      // authored heading (`<heading> | <brand>`), so an indexable site does not
      // ship one identical <title> on every page. A route with no authored
      // heading falls back to the site-level title — recorded in the basis and
      // counted by `checkTitleUniqueness`, never silently.
      const heading = route.key === "/" ? undefined : contentRun.routeHeadings[route.key];
      const siteLevelTitle = `${brand} | ${identity.category}`;
      const headingTitle = heading === undefined ? null : `${heading.value} | ${brand}`;
      const useHeading = headingTitle !== null && isHeadSafeText(headingTitle);
      const titleValue = useHeading ? (headingTitle as string) : siteLevelTitle;
      const titleBasis =
        useHeading && heading !== undefined
          ? `content-run:${heading.rule} (${heading.slotKey}) + siteIdentity.workingName`
          : route.key === "/"
            ? "content-run:sitePlan.siteIdentity (workingName + category) — site-level title, correct for the home route"
            : "content-run:sitePlan.siteIdentity (workingName + category) — site-level fallback: this route has no authored heading";
      const descriptionValue = `${pagePlan.primaryMessage ?? identity.positioning} — ${identity.positioning}`;
      assertHeadSafeText(titleValue, `title(${route.key})`);
      assertHeadSafeText(descriptionValue, `description(${route.key})`);
      title = known(titleValue, titleBasis);
      description = known(
        descriptionValue,
        "content-run:sitePlan pagePlan.primaryMessage + siteIdentity.positioning",
      );
    } else {
      // Route content is not injected yet — deriving copy from the source page
      // is forbidden, so the descriptive part is needs-input. The preview
      // fallback is the brand name alone (already-known data, nothing invented).
      assertHeadSafeText(brand, "siteName");
      title = needsInput(
        "route not in content-run scope; source copy is forbidden — provide content or extend the content run",
        brand,
      );
      description = needsInput(
        "route not in content-run scope; source copy is forbidden — no description is rendered until provided",
      );
    }

    const robotsMeta = preview
      ? { value: "noindex,nofollow", basis: "preview mode — no production domain provided" }
      : { value: "index,follow", basis: "production domain provided" };

    const effectiveTitle = title.value ?? title.previewFallback ?? brand;
    const ogTitle: PlannedValue =
      title.status === "known"
        ? known(effectiveTitle, "mirrors route title")
        : needsInput("mirrors route title (needs-input)", effectiveTitle);
    const ogDescription: PlannedValue =
      description.status === "known"
        ? known(description.value as string, "mirrors route description")
        : needsInput("mirrors route description (needs-input)");

    return {
      routeId: route.routeId,
      route: route.key,
      path: route.path,
      contentScope: injected ? "content-injected" : "not-yet-injected",
      title,
      description,
      robotsMeta,
      canonical: {
        intent: "self-on-production-domain",
        finalized: !preview,
        value: preview ? null : `${origin}${route.path}`,
        reason: preview
          ? "production domain needs-input — canonical URLs are never invented; none is rendered in preview"
          : "self-referential canonical on the provided production domain",
      },
      openGraph: {
        title: ogTitle,
        description: ogDescription,
        type: known("website", "policy default for a marketing site"),
        locale:
          locale !== null
            ? known(locale, languageBasis)
            : needsInput("content language could not be derived from the content run"),
        url: preview
          ? needsInput("production domain needs-input — og:url is never invented")
          : known(`${origin}${route.path}`, "production domain provided"),
        image: needsInput(
          "no production social image exists yet (asset independence is Task 22); source images are forbidden",
        ),
        siteName: known(brand, "content-run:sitePlan.siteIdentity.workingName"),
      },
      twitter: {
        card: known("summary", "policy default — no production image exists, so summary (not summary_large_image)"),
        title: ogTitle,
        description: ogDescription,
        site: needsInput("no production social account provided — never invented"),
      },
      jsonLd: buildRouteJsonLd({
        brand,
        positioning: identity.positioning,
        origin,
        facts: options.facts,
      }),
    };
  });

  const businessFacts: ProductionBusinessFacts = {
    address: fact(options.facts?.address),
    phone: fact(options.facts?.phone),
    prices: fact(options.facts?.prices),
    reviews: fact(options.facts?.reviews),
    ratings: fact(options.facts?.ratings),
    foundingDate: fact(options.facts?.foundingDate),
    sameAs: fact(options.facts?.sameAs),
  };

  return ProductionSeoPlanSchema.parse({
    schemaVersion: 1,
    schemaName: "production-seo-plan-v1",
    runId: options.runId,
    createdAt: createdAtFromRunId(options.runId),
    sourceHost: template.sourceHost,
    provenance: "derived",
    domainState: {
      productionDomain:
        options.productionDomain === undefined
          ? needsInput("no production domain provided — a domain is never invented")
          : known(options.productionDomain, "user-provided"),
      mode,
    },
    site: {
      siteName: known(brand, "content-run:sitePlan.siteIdentity.workingName"),
      locale:
        locale !== null
          ? known(locale, languageBasis)
          : needsInput("content language could not be derived from the content run"),
      businessFacts,
    },
    routes,
    decisions: [
      {
        id: "no-hreflang",
        decision: `source served ${options.sourceSnapshot.pages.reduce(
          (sum, page) => sum + page.hreflangCount,
          0,
        )} hreflang alternates across ${options.sourceSnapshot.pages.length} observed pages; production is planned as a single-locale site (locale: ${
          locale ?? "needs-input"
        }), so no hreflang is emitted — an intentional difference, not an omission`,
      },
      {
        id: "preview-noindex",
        decision:
          "without a production domain every route carries robots noindex,nofollow and /robots.txt disallows all — the preview must never be indexed as if it were live",
      },
      {
        id: "sitemap-deferred",
        decision:
          "the sitemap protocol requires absolute URLs; without a domain only a path-only sitemap PLAN is generated (sitemap.preview.xml) and /sitemap.xml is served 404 in preview",
      },
    ],
  } satisfies ProductionSeoPlan);
}

function buildRouteJsonLd(input: {
  brand: string;
  positioning: string;
  origin: string | null;
  facts?: ProvidedBusinessFacts;
}): ProductionRouteSeo["jsonLd"] {
  const organization: Record<string, unknown> = {
    "@type": "Organization",
    name: input.brand,
    description: input.positioning,
  };
  const omitted: string[] = [];
  if (input.origin !== null) organization.url = input.origin;
  else omitted.push("url (production domain needs-input)");
  if (input.facts?.sameAs !== undefined) organization.sameAs = input.facts.sameAs;
  else omitted.push("sameAs (social profiles needs-input)");
  if (input.facts?.address !== undefined) organization.address = input.facts.address;
  else omitted.push("address (needs-input)");
  if (input.facts?.phone !== undefined) organization.telephone = input.facts.phone;
  else omitted.push("telephone (needs-input)");
  if (input.facts?.foundingDate !== undefined) organization.foundingDate = input.facts.foundingDate;
  else omitted.push("foundingDate (needs-input)");
  omitted.push("aggregateRating/review (never invented — needs-input)");
  omitted.push("logo (no production asset yet — Task 22)");
  const json = {
    "@context": "https://schema.org",
    "@graph": [
      { "@type": "WebSite", name: input.brand },
      organization,
    ],
  };
  return { emitted: true, json, omittedNeedsInput: omitted };
}

/**
 * Duplicate-<title> detector (Task 28 Phase 10 correction).
 *
 * Two indexable routes that serve the same <title> are a real SEO defect, and
 * before this detector existed NO check in the program asserted title
 * uniqueness — which is how a plan whose every route carried one identical
 * string shipped described as "per-route". The detector never invents a title
 * to fix a duplicate and never removes one: it MEASURES, names every duplicate
 * group with its routes, and the number travels in the plan-run manifest and in
 * the isolated-package QA report. Preview-mode plans are measured the same way;
 * only the consequence differs (a preview is noindex, so a duplicate there is
 * informational).
 */
export function checkTitleUniqueness(plan: ProductionSeoPlan): {
  pass: boolean;
  routesMeasured: number;
  distinctTitles: number;
  duplicates: { title: string; routes: string[] }[];
} {
  const byTitle = new Map<string, string[]>();
  for (const route of plan.routes) {
    const effective = route.title.value ?? route.title.previewFallback ?? null;
    if (effective === null) continue;
    const routes = byTitle.get(effective);
    if (routes === undefined) byTitle.set(effective, [route.route]);
    else routes.push(route.route);
  }
  const duplicates = [...byTitle.entries()]
    .filter(([, routes]) => routes.length > 1)
    .map(([title, routes]) => ({ title, routes }));
  return {
    pass: duplicates.length === 0,
    routesMeasured: plan.routes.length,
    distinctTitles: byTitle.size,
    duplicates,
  };
}

/**
 * Forbidden-copy check (Task 21 B): no plan value may equal a source SEO
 * value. Every planned title/description/og/twitter string is compared
 * byte-wise against the corresponding source page values AND against every
 * source title/description site-wide.
 */
export function checkForbiddenCopy(
  plan: ProductionSeoPlan,
  snapshot: SourceSeoSnapshot,
): { pass: boolean; comparisons: number; violations: { route: string; field: string; value: string; sourceValue: string }[] } {
  const sourceValues = new Map<string, string>();
  for (const page of snapshot.pages) {
    if (page.title !== null) sourceValues.set(page.title, `title(${page.pageId})`);
    if (page.metaDescription !== null) sourceValues.set(page.metaDescription, `description(${page.pageId})`);
    for (const entry of [...page.openGraph, ...page.twitter]) {
      if (entry.content.trim() !== "") sourceValues.set(entry.content, `${entry.key}(${page.pageId})`);
    }
  }
  const violations: { route: string; field: string; value: string; sourceValue: string }[] = [];
  let comparisons = 0;
  const compare = (route: string, field: string, planned: PlannedValue): void => {
    for (const candidate of [planned.value, planned.previewFallback ?? null]) {
      if (candidate === null || candidate === "") continue;
      comparisons += 1;
      const hit = sourceValues.get(candidate);
      if (hit !== undefined) violations.push({ route, field, value: candidate, sourceValue: hit });
    }
  };
  for (const route of plan.routes) {
    compare(route.route, "title", route.title);
    compare(route.route, "description", route.description);
    compare(route.route, "og:title", route.openGraph.title);
    compare(route.route, "og:description", route.openGraph.description);
    compare(route.route, "og:siteName", route.openGraph.siteName);
    compare(route.route, "twitter:title", route.twitter.title);
    compare(route.route, "twitter:description", route.twitter.description);
  }
  return { pass: violations.length === 0, comparisons, violations };
}
