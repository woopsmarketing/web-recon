import type { PageSelection } from "../selector/types.js";
import {
  MAX_VALIDATION_SAMPLES_PER_SITE,
  MIN_VALIDATION_FAMILY_SIZE,
  type SitePageRole,
} from "./types.js";
import type { PageFamilyType } from "../selector/types.js";

/**
 * Turn a validated `selected-pages.json` into the exact, ordered list of pages a
 * site run will observe (Task 09, items 8, 17, 22, 43).
 *
 * Pure and deterministic: no clock, no randomness, no network, no browser. The
 * same selection file always yields the same page ids, the same validation
 * samples, and the same order — which is what makes two runs of the same site
 * comparable at all.
 */

/** One page the orchestrator will observe. */
export interface PlannedPage {
  /** `p000001…` — see {@link planSitePages} for how it is assigned. */
  pageId: string;
  url: string;
  role: SitePageRole;
  familyId: string;
  familyType: PageFamilyType;
  familyMemberCount: number;
}

/** A representative ↔ sample pair chosen for validation (item 22). */
export interface PlannedValidationSample {
  familyId: string;
  familyType: PageFamilyType;
  familyMemberCount: number;
  representativeUrl: string;
  sampleUrl: string;
  representativePageId: string;
  samplePageId: string;
}

export interface SitePagePlan {
  /** Observation order AND manifest order: `p000001`, `p000002`, … */
  pages: PlannedPage[];
  validationSamples: PlannedValidationSample[];
  /** Families that qualified for sampling but lost to the per-site cap. */
  samplingSkippedByCap: number;
}

export interface PlanOptions {
  maxValidationSamples?: number;
  minValidationFamilySize?: number;
}

/** Thrown when the plan would violate a system invariant (item 13). */
export class PagePlanError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PagePlanError";
  }
}

/** Zero-padded, filesystem-safe, sortable page id. */
function pageIdAt(index: number): string {
  return `p${String(index + 1).padStart(6, "0")}`;
}

/**
 * Byte-wise URL comparison. `localeCompare` is locale- and ICU-version
 * dependent, which is exactly the kind of environment coupling a deterministic
 * id scheme must not have.
 */
function byUrl(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

/**
 * Plan a site run.
 *
 * **Page ids (item 8).** A URL pathname is not a usable directory name — `/`,
 * nesting, query strings, percent-encoding, unbounded length, and case-folding
 * collisions on macOS/Windows all break it. So pages get opaque ids and the
 * manifest carries the `pageId ↔ url` mapping.
 *
 * Ids are assigned in two blocks, each after a lexical sort by URL:
 *
 *   representatives  →  p000001 … p00000N
 *   validation samples → p00000N+1 …
 *
 * Sorting first means the ids do not depend on the order the file happened to
 * list pages in (item 8). Keeping the samples in a second block means turning
 * sampling on or off never renumbers a representative — the production pages of
 * two runs stay comparable even when the sampling policy changes.
 *
 * **Validation sampling (items 22–23).** Deep-observing every family member
 * would undo the selection, so the sample is deliberately tiny and rule-bound:
 *
 *   1. Only families with ≥ `minValidationFamilySize` members (default 3).
 *      Singletons have no other member; pairs are too weak a claim to spend a
 *      full deep observation on.
 *   2. At most `maxValidationSamples` families per site (default 3), chosen
 *      largest-family-first, ties broken by `familyId`. Largest-first because
 *      the biggest family is where a wrong representative costs the most — and
 *      because it is a data-derived rule, not a per-site special case.
 *   3. Exactly one member per chosen family: the URL that follows the
 *      representative in lexical order, wrapping to the first member when the
 *      representative sorts last.
 *
 * Rule 3 is arbitrary but total and reproducible, which is all it needs to be.
 * Nothing here looks at hostnames or paths.
 */
export function planSitePages(
  selection: PageSelection,
  options: PlanOptions = {},
): SitePagePlan {
  const maxSamples = options.maxValidationSamples ?? MAX_VALIDATION_SAMPLES_PER_SITE;
  const minFamilySize =
    options.minValidationFamilySize ?? MIN_VALIDATION_FAMILY_SIZE;

  // --- representatives: p000001… in URL order -------------------------------
  const representatives = [...selection.pages].sort((a, b) => byUrl(a.url, b.url));
  const pages: PlannedPage[] = representatives.map((page, i) => ({
    pageId: pageIdAt(i),
    url: page.url,
    role: "representative",
    familyId: page.familyId,
    familyType: page.familyType,
    familyMemberCount: page.memberCount,
  }));

  const pageIdByUrl = new Map(pages.map((p) => [p.url, p.pageId]));

  // --- family membership, reconstructed from the selection itself -----------
  // `unselected[]` names, for every skipped URL, the family it belongs to — so
  // the full member list is recoverable without page-families.json.
  const membersByFamily = new Map<string, string[]>();
  for (const page of representatives) {
    membersByFamily.set(page.familyId, [page.url]);
  }
  for (const skipped of selection.unselected) {
    membersByFamily.get(skipped.familyId)?.push(skipped.url);
  }

  // --- validation samples ---------------------------------------------------
  const eligible = representatives.filter(
    (page) => page.memberCount >= minFamilySize,
  );
  eligible.sort(
    (a, b) => b.memberCount - a.memberCount || byUrl(a.familyId, b.familyId),
  );
  const chosen = eligible.slice(0, Math.max(0, maxSamples));
  const samplingSkippedByCap = eligible.length - chosen.length;

  // Stable second block: order the chosen families by familyId, so the sample
  // page ids depend only on which families were chosen, not on the sort that
  // chose them.
  chosen.sort((a, b) => byUrl(a.familyId, b.familyId));

  const validationSamples: PlannedValidationSample[] = [];
  for (const family of chosen) {
    const members = [...(membersByFamily.get(family.familyId) ?? [])].sort(byUrl);
    const at = members.indexOf(family.url);
    if (at < 0 || members.length < 2) continue;
    const sampleUrl = members[(at + 1) % members.length];
    if (sampleUrl === family.url) continue;

    const samplePageId = pageIdAt(pages.length);
    pages.push({
      pageId: samplePageId,
      url: sampleUrl,
      role: "validation-sample",
      familyId: family.familyId,
      familyType: family.familyType,
      familyMemberCount: family.memberCount,
    });
    validationSamples.push({
      familyId: family.familyId,
      familyType: family.familyType,
      familyMemberCount: family.memberCount,
      representativeUrl: family.url,
      sampleUrl,
      representativePageId: pageIdByUrl.get(family.url) as string,
      samplePageId,
    });
  }

  assertPlanInvariants(pages);
  return { pages, validationSamples, samplingSkippedByCap };
}

/**
 * System invariants (item 13). A collision here would mean two pages writing
 * into one directory — silent data loss — so it aborts the run rather than
 * degrading it.
 */
export function assertPlanInvariants(pages: readonly PlannedPage[]): void {
  const ids = new Set<string>();
  const urls = new Set<string>();
  for (const page of pages) {
    if (ids.has(page.pageId)) {
      throw new PagePlanError(`page id collision: ${page.pageId}`);
    }
    ids.add(page.pageId);
    if (urls.has(page.url)) {
      throw new PagePlanError(`the same URL was planned twice: ${page.url}`);
    }
    urls.add(page.url);
  }
  for (let i = 0; i < pages.length; i++) {
    if (pages[i].pageId !== pageIdAt(i)) {
      throw new PagePlanError(
        `page ids are not a dense ordered sequence at index ${i}: ${pages[i].pageId}`,
      );
    }
  }
}
