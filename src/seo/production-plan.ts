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
export function assertHeadSafeText(value: string, field: string): void {
  if (/["\\<>&]/.test(value) || /[\u0000-\u001f]/.test(value)) {
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

  const routes: ProductionRouteSeo[] = template.routes.map((route) => {
    const injected = scoped.has(route.key);
    const pagePlan = planByRoute.get(route.key);
    let title: PlannedValue;
    let description: PlannedValue;
    if (injected && pagePlan !== undefined) {
      const titleValue = `${brand} | ${identity.category}`;
      const descriptionValue = `${pagePlan.primaryMessage ?? identity.positioning} — ${identity.positioning}`;
      assertHeadSafeText(titleValue, `title(${route.key})`);
      assertHeadSafeText(descriptionValue, `description(${route.key})`);
      title = known(titleValue, "content-run:sitePlan.siteIdentity (workingName + category)");
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
