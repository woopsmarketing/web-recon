import type { VerifiedUrlSet } from "../verifier/types.js";
import type { ObservedSitePage } from "../multi-observer/types.js";
import {
  routeId as makeRouteId,
  sortLimitations,
  type LimitationCode,
  type RouteBehaviorCoverage,
  type RouteCoverage,
  type RouteSpec,
} from "./types.js";

/**
 * Compile every verified URL into a route (Task 13, items 12–17, 66).
 *
 * The rule that shapes this file: **a SiteSpec route table holds all 112
 * verified URLs, not the 41 that happened to be selected for deep observation**
 * (item 13). Page-family selection is a cost optimization for the OBSERVER; a
 * reconstruction engine still has to serve every URL the site actually has, and
 * a route table that quietly contains 37% of them would be a silent data loss
 * dressed up as a result.
 *
 * Two independent coverage axes are recorded, and keeping them apart is the
 * whole honesty story of this Task:
 *
 *   coverage          how much DIRECT OBSERVATION stands behind this URL
 *   behaviorCoverage  how much VERIFIED INTERACTION stands behind this URL
 *
 * A `/blog/post-17` that was never loaded is `family-represented`: it is
 * reconstructed from `/blog/post-3`'s PageSpec and it says so, in the coverage
 * field and again in a limitation. It is never described as observed (item 15),
 * and the representative's confirmed patterns are never re-attributed to it as
 * if they had been verified there (item 66) — that would turn one click into
 * forty claims.
 *
 * Route ids come from a lexical sort of the normalized URL (item 17), so
 * `r000001` is a property of the site, not of the order the inputs arrived in.
 */

export interface CompileRoutesInput {
  verifiedUrls: VerifiedUrlSet;
  successfulPages: readonly ObservedSitePage[];
  /** Verified URL → family id (from the compiled family model). */
  familyIdByUrl: ReadonlyMap<string, string>;
  /** Family id → the representative's PageSpec id, when observed. */
  representativePageIdByFamily: ReadonlyMap<string, string>;
  /** Page ids Task 11 actually explored. */
  exploredPageIds: ReadonlySet<string>;
}

function pathnameOf(url: string): string {
  try {
    return new URL(url).pathname;
  } catch {
    return url;
  }
}

export function compileRoutes(input: CompileRoutesInput): RouteSpec[] {
  const {
    verifiedUrls,
    successfulPages,
    familyIdByUrl,
    representativePageIdByFamily,
    exploredPageIds,
  } = input;

  const pagesByUrl = new Map<string, ObservedSitePage>();
  for (const page of successfulPages) pagesByUrl.set(page.url, page);

  const sorted = [...verifiedUrls.urls].sort((a, b) =>
    a.url < b.url ? -1 : a.url > b.url ? 1 : 0,
  );

  return sorted.map((verified, index) => {
    const familyId = familyIdByUrl.get(verified.url);
    if (familyId === undefined) {
      // Task 07 guarantees every verified URL is in exactly one family; if that
      // ever stops holding, the route table would silently lose a URL.
      throw new Error(
        `verified URL is not a member of any page family: ${verified.url}`,
      );
    }

    const observed = pagesByUrl.get(verified.url);
    const representativePageId = representativePageIdByFamily.get(familyId);

    let coverage: RouteCoverage;
    if (observed?.role === "representative") coverage = "exact-observed";
    else if (observed?.role === "validation-sample") {
      coverage = "validation-sample-observed";
    } else coverage = "family-represented";

    // A validation sample uses its OWN observation, never the representative's
    // (item 16): it is a real observation of this exact URL, which is strictly
    // better evidence than a stand-in.
    const renderSourcePageId = observed?.pageId ?? representativePageId;

    const limitations = new Set<LimitationCode>();
    let behaviorCoverage: RouteBehaviorCoverage;
    let behaviorSourcePageId: string | undefined;

    if (observed) {
      if (exploredPageIds.has(observed.pageId)) {
        behaviorCoverage = "exact-verified";
        behaviorSourcePageId = observed.pageId;
      } else {
        behaviorCoverage = "exact-not-explored";
        limitations.add("route-behavior-not-explored");
      }
    } else {
      limitations.add("route-not-deeply-observed");
      if (representativePageId !== undefined && exploredPageIds.has(representativePageId)) {
        behaviorCoverage = "family-represented-unverified";
        behaviorSourcePageId = representativePageId;
        limitations.add("route-behavior-family-represented");
      } else {
        behaviorCoverage = "none";
        limitations.add("route-behavior-not-explored");
      }
    }

    if (renderSourcePageId === undefined) {
      limitations.add("route-render-source-missing");
    }

    return {
      routeId: makeRouteId(index + 1),
      url: verified.url,
      pathname: pathnameOf(verified.url),
      familyId,
      coverage,
      ...(observed ? { pageId: observed.pageId } : {}),
      ...(renderSourcePageId !== undefined ? { renderSourcePageId } : {}),
      observedOnThisExactUrl: observed !== undefined,
      behaviorCoverage,
      ...(behaviorSourcePageId !== undefined ? { behaviorSourcePageId } : {}),
      verificationSummary: {
        httpStatus: verified.httpStatus,
        ...(verified.title !== undefined ? { title: verified.title } : {}),
        ...(verified.canonicalUrl !== undefined
          ? { canonicalUrl: verified.canonicalUrl }
          : {}),
      },
      limitations: sortLimitations(limitations),
    } satisfies RouteSpec;
  });
}
