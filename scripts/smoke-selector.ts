import { createHash } from "node:crypto";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { SCHEMA_VERSION as VERIFIER_SCHEMA_VERSION } from "../src/verifier/types.js";
import {
  buildDuplicateGroups,
  buildVerifiedUrls,
  type CandidateVerification,
  type VerificationResult,
  type VerifiedUrlSet,
} from "../src/verifier/index.js";
import {
  HISTOGRAM_CATEGORIES,
  type StructuralProfile,
} from "../src/verifier/structural-profile.js";
import {
  PageFamilySetSchema,
  PageSelectionSchema,
  assertSelectionInvariants,
  buildPageFamilies,
  buildPageSelection,
  extractRouteFeatures,
  isSiteRoot,
  saveSelection,
  type PageFamily,
  type PageFamilySet,
  type PageSelection,
} from "../src/selector/index.js";
import {
  MAX_ELEMENT_COUNT_RATIO,
  classifyTerminalSegment,
} from "../src/selector/types.js";

/**
 * Local deterministic fixture test for the Selector (Task 07 §30–31, Task 08 §13–19).
 *
 * Completely offline: **no HTTP server, no Playwright, no network** — selection
 * itself is offline deterministic processing, so the fixture only has to produce
 * a realistic Task 06/08 input pair. It does that by running the REAL verifier
 * builders (`buildDuplicateGroups`, `buildVerifiedUrls`) over synthetic
 * candidate verifications, so the selector is exercised against genuine
 * `verification.json` / `verified-urls.json` shapes rather than hand-written ones.
 *
 * The fixture deliberately contains the cases that are easy to get wrong:
 *  - siblings that share a coarse template but have DIFFERENT exact structure
 *    hashes and different element counts (`/blog/post-*`) — the whole point of
 *    Task 08, and something Task 07's rules could not group
 *  - the element-count ratio guard exactly at its boundary (`/tools/*`)
 *  - a section index that shares its children's coarse profile (`/docs`) and
 *    must NOT be absorbed by them
 *  - identical content behind several URLs that SHOULD collapse
 *  - pages sharing only a canonical that MUST NOT merge
 *  - pages sharing a skeleton but not a landmark tree, or not the element kinds
 *  - pages with no structural profile at all, which must stay singletons
 *  - a root that must survive selection
 */

const ROOT = "https://fixture.example";

/** Stable 64-hex hash from a label, so fixture hashes look like real ones. */
function h(label: string): string {
  return createHash("sha256").update(label).digest("hex");
}

/** Which element kinds a page contains — drives the histogram-presence guard. */
type Kinds = "full" | "no-form";

interface FixtureRow {
  /** Path (+ query) appended to ROOT. */
  path: string;
  /** EXACT structure fingerprint label (Task 06) — same label ⇒ same hash. */
  structure: string;
  /** Text fingerprint label — same label ⇒ byte-identical textHash. */
  text: string;
  /** COARSE skeleton label (Task 08) — same label ⇒ same shallowSkeletonHash. */
  skeleton: string;
  /** COARSE landmark label — same label ⇒ same landmarkHash. */
  landmark: string;
  /** Coarse element count, used by the ratio guard. */
  elements: number;
  /** Absolute canonical URL declared by the page. */
  canonical: string;
  title: string;
  kinds?: Kinds;
  /** Set for pages that carry no structural profile (older verification run). */
  noProfile?: boolean;
}

/**
 * 31 verified URLs. Labels collide only where a test needs them to.
 *
 * Note how `/blog/post-*` and `/tools/*` are modelled: every one of them has a
 * UNIQUE exact `structure` label (that is what real pages look like — Task 07
 * measured 17 different hashes across 17 domainchecker blog posts) while sharing
 * the coarse skeleton/landmark. Under Task 07's rules they were 17 singletons.
 */
const ROWS: readonly FixtureRow[] = [
  { path: "/", structure: "S_ROOT", text: "T_ROOT", skeleton: "K_ROOT", landmark: "L_HOME", elements: 200, canonical: `${ROOT}/`, title: "Home" },

  // Same coarse profile but different route scope ⇒ must never merge.
  { path: "/about", structure: "S_ABOUT", text: "T_ABOUT", skeleton: "K_SHARED", landmark: "L_PAGE", elements: 100, canonical: `${ROOT}/about`, title: "About" },
  { path: "/pricing", structure: "S_PRICING", text: "T_PRICING", skeleton: "K_SHARED", landmark: "L_PAGE", elements: 100, canonical: `${ROOT}/pricing`, title: "Pricing" },

  // Blog list is its own template; the posts share a coarse template while every
  // exact hash and every element count differs.
  { path: "/blog", structure: "S_BLOG", text: "T_BLOG", skeleton: "K_LIST", landmark: "L_LIST", elements: 300, canonical: `${ROOT}/blog`, title: "Blog" },
  { path: "/blog/post-a", structure: "S_PA", text: "T_PA", skeleton: "K_POST", landmark: "L_POST", elements: 410, canonical: `${ROOT}/blog/post-a`, title: "Post A" },
  { path: "/blog/post-b", structure: "S_PB", text: "T_PB", skeleton: "K_POST", landmark: "L_POST", elements: 433, canonical: `${ROOT}/blog/post-b`, title: "Post B" },
  { path: "/blog/post-c", structure: "S_PC", text: "T_PC", skeleton: "K_POST", landmark: "L_POST", elements: 489, canonical: `${ROOT}/blog/post-c`, title: "Post C" },
  // Same coarse template, but 900/410 = 2.20 > the ratio guard ⇒ split off.
  { path: "/blog/post-huge", structure: "S_PH", text: "T_PH", skeleton: "K_POST", landmark: "L_POST", elements: 900, canonical: `${ROOT}/blog/post-huge`, title: "Post Huge" },

  // Ratio guard exactly at the boundary: 200/100 = 2.00 in, 201/100 = 2.01 out.
  { path: "/tools/a", structure: "S_TA", text: "T_TA", skeleton: "K_TOOL", landmark: "L_TOOL", elements: 100, canonical: `${ROOT}/tools/a`, title: "Tool A" },
  { path: "/tools/b", structure: "S_TB", text: "T_TB", skeleton: "K_TOOL", landmark: "L_TOOL", elements: 150, canonical: `${ROOT}/tools/b`, title: "Tool B" },
  { path: "/tools/c", structure: "S_TC", text: "T_TC", skeleton: "K_TOOL", landmark: "L_TOOL", elements: 200, canonical: `${ROOT}/tools/c`, title: "Tool C" },
  { path: "/tools/d", structure: "S_TD", text: "T_TD", skeleton: "K_TOOL", landmark: "L_TOOL", elements: 201, canonical: `${ROOT}/tools/d`, title: "Tool D" },

  // Docs index shares its children's coarse profile — the ancestor guard must
  // keep it out, or the index would be dropped from observation entirely.
  { path: "/docs", structure: "S_DOCS", text: "T_DOCS", skeleton: "K_DOC", landmark: "L_DOC", elements: 500, canonical: `${ROOT}/docs`, title: "Docs" },
  { path: "/docs/guide/intro", structure: "S_INTRO", text: "T_INTRO", skeleton: "K_DOC", landmark: "L_DOC", elements: 500, canonical: `${ROOT}/docs/guide/intro`, title: "Intro" },
  { path: "/docs/api/reference", structure: "S_REF", text: "T_REF", skeleton: "K_DOC", landmark: "L_DOC", elements: 600, canonical: `${ROOT}/docs/api/reference`, title: "Reference" },

  // Same canonical (the homepage), everything else different ⇒ must not merge.
  { path: "/canonical-a", structure: "S_CANA", text: "T_CANA", skeleton: "K_CANA", landmark: "L_PAGE", elements: 100, canonical: `${ROOT}/`, title: "Canonical A" },
  { path: "/canonical-b", structure: "S_CANB", text: "T_CANB", skeleton: "K_CANB", landmark: "L_PAGE", elements: 100, canonical: `${ROOT}/`, title: "Canonical B" },
  // Same canonical AND same route scope, different structure ⇒ still no merge.
  { path: "/legal/terms", structure: "S_TERMS", text: "T_TERMS", skeleton: "K_TERMS", landmark: "L_PAGE", elements: 100, canonical: `${ROOT}/`, title: "Terms" },
  { path: "/legal/privacy", structure: "S_PRIV", text: "T_PRIV", skeleton: "K_PRIV", landmark: "L_PAGE", elements: 100, canonical: `${ROOT}/`, title: "Privacy" },

  // Identical content behind two URLs, and behind a URL + two query variants.
  { path: "/duplicate-a", structure: "S_DUP", text: "T_DUP", skeleton: "K_DUP", landmark: "L_PAGE", elements: 100, canonical: `${ROOT}/duplicate-a`, title: "Duplicate" },
  { path: "/duplicate-b", structure: "S_DUP", text: "T_DUP", skeleton: "K_DUP", landmark: "L_PAGE", elements: 100, canonical: `${ROOT}/duplicate-b`, title: "Duplicate" },
  { path: "/page", structure: "S_PAGE", text: "T_PAGE", skeleton: "K_PAGE", landmark: "L_PAGE", elements: 100, canonical: `${ROOT}/page`, title: "Page" },
  { path: "/page?v=1", structure: "S_PAGE", text: "T_PAGE", skeleton: "K_PAGE", landmark: "L_PAGE", elements: 100, canonical: `${ROOT}/page`, title: "Page" },
  { path: "/page?v=2", structure: "S_PAGE", text: "T_PAGE", skeleton: "K_PAGE", landmark: "L_PAGE", elements: 100, canonical: `${ROOT}/page`, title: "Page" },

  // Same skeleton, DIFFERENT landmark tree ⇒ the landmark condition must bite.
  { path: "/services/alpha", structure: "S_SA", text: "T_SA", skeleton: "K_SVC", landmark: "L_SVC_A", elements: 100, canonical: `${ROOT}/services/alpha`, title: "Service Alpha" },
  { path: "/services/beta", structure: "S_SB", text: "T_SB", skeleton: "K_SVC", landmark: "L_SVC_B", elements: 100, canonical: `${ROOT}/services/beta`, title: "Service Beta" },

  // Same skeleton AND landmark, different element KINDS ⇒ presence must bite.
  { path: "/kinds/alpha", structure: "S_KA", text: "T_KA", skeleton: "K_KIND", landmark: "L_KIND", elements: 100, canonical: `${ROOT}/kinds/alpha`, title: "Kind Alpha", kinds: "full" },
  { path: "/kinds/beta", structure: "S_KB", text: "T_KB", skeleton: "K_KIND", landmark: "L_KIND", elements: 100, canonical: `${ROOT}/kinds/beta`, title: "Kind Beta", kinds: "no-form" },

  // No structural profile at all (e.g. a page that blocked collection): three
  // same-parent siblings that must still stay apart rather than be guessed at.
  { path: "/legacy/alpha", structure: "S_LA", text: "T_LA", skeleton: "-", landmark: "-", elements: 0, canonical: `${ROOT}/legacy/alpha`, title: "Legacy Alpha", noProfile: true },
  { path: "/legacy/beta", structure: "S_LB", text: "T_LB", skeleton: "-", landmark: "-", elements: 0, canonical: `${ROOT}/legacy/beta`, title: "Legacy Beta", noProfile: true },
  { path: "/legacy/gamma", structure: "S_LG", text: "T_LG", skeleton: "-", landmark: "-", elements: 0, canonical: `${ROOT}/legacy/gamma`, title: "Legacy Gamma", noProfile: true },
];

let checks = 0;
let failures = 0;
function check(name: string, ok: boolean, detail = ""): void {
  checks++;
  if (ok) {
    console.log(`  PASS  ${name}`);
  } else {
    failures++;
    console.log(`  FAIL  ${name}${detail ? ` — ${detail}` : ""}`);
  }
}

const ZERO_LANDMARKS = {
  header: 0, nav: 0, main: 0, article: 0, section: 0,
  aside: 0, footer: 0, form: 0, table: 0, dialog: 0,
};
const ZERO_COUNTS = {
  heading: 0, paragraph: 0, list: 0, listItem: 0,
  link: 0, button: 0, input: 0, image: 0, media: 0,
};

/** Synthetic coarse profile for one fixture row. */
function toProfile(row: FixtureRow): StructuralProfile {
  const buckets: Record<string, number> = {};
  for (const category of HISTOGRAM_CATEGORIES) {
    // `no-form` pages contain no form/field elements at all — bucket 0 — which
    // is exactly what `histogramPresenceKey` reads.
    const absent = row.kinds === "no-form" && (category === "form" || category === "field");
    buckets[category] = absent ? 0 : 2;
  }
  return {
    shallowSkeletonHash: h(row.skeleton),
    landmarkHash: h(row.landmark),
    tagHistogramHash: h(`${row.skeleton}|histogram`),
    elementCount: row.elements,
    maxDepth: 8,
    landmarkCounts: { ...ZERO_LANDMARKS },
    structuralCounts: { ...ZERO_COUNTS },
    histogramBuckets: buckets,
  };
}

/** Build one synthetic candidate verification from a fixture row. */
function toCandidate(row: FixtureRow): CandidateVerification {
  const url = `${ROOT}${row.path}`;
  // The root candidate is discovered without a trailing slash, exactly like a
  // real Firecrawl map result; the final URL carries the slash.
  const candidateUrl = row.path === "/" ? ROOT : url;
  const finalUrl = row.path === "/" ? `${ROOT}/` : url;
  return {
    candidateUrl,
    normalizedCandidateUrl: finalUrl,
    status: "valid-html",
    httpStatus: 200,
    contentType: "text/html",
    finalUrl,
    finalSameSite: true,
    redirected: false,
    redirectCount: 0,
    title: row.title,
    canonicalUrl: row.canonical,
    canonicalSameSite: true,
    bodyTextLength: 1000 + row.path.length,
    domElementCount: 100 + row.path.length,
    fingerprints: {
      textHash: h(row.text),
      structureHash: h(row.structure),
      combinedHash: h(`${row.title}|${row.text}|${row.structure}`),
    },
    ...(row.noProfile ? {} : { structuralProfile: toProfile(row) }),
    timingMs: 1000,
  };
}

interface Inputs {
  verifiedUrls: VerifiedUrlSet;
  verification: VerificationResult;
}

const FIXED_AT = "2026-08-13T00:00:00.000Z";
const VERIFIED_FILE = "fixture://verified-urls.json";
const VERIFICATION_FILE = "fixture://verification.json";

/** Assemble a realistic input pair using the real verifier builders. */
function buildInputs(rows: readonly FixtureRow[]): Inputs {
  const candidates = rows.map(toCandidate);
  const duplicateGroups = buildDuplicateGroups(candidates);
  const verifiedUrls = buildVerifiedUrls(
    candidates,
    ROOT,
    "fixture://discovery.json",
    FIXED_AT,
  );
  const verification: VerificationResult = {
    schemaVersion: VERIFIER_SCHEMA_VERSION,
    engine: "fixture",
    rootUrl: ROOT,
    sourceDiscoveryFile: "fixture://discovery.json",
    verifiedAt: FIXED_AT,
    profile: {
      locale: "ko-KR",
      timezone: "Asia/Seoul",
      colorScheme: "light",
      reducedMotion: "no-preference",
      viewportWidth: 1440,
      viewportHeight: 900,
      waitUntil: "domcontentloaded",
      navTimeoutMs: 25_000,
    },
    concurrency: 1,
    totalCandidates: candidates.length,
    validHtmlCount: candidates.length,
    httpErrorCount: 0,
    navigationErrorCount: 0,
    nonHtmlCount: 0,
    externalRedirectCount: 0,
    blockedCount: 0,
    redirectedCount: 0,
    uniqueFinalUrlCount: candidates.length,
    duplicateGroupCount: duplicateGroups.length,
    candidates,
    duplicateGroups,
  };
  return { verifiedUrls, verification };
}

/** Run the whole selector over an input pair. */
function run(inputs: Inputs): { familySet: PageFamilySet; selection: PageSelection } {
  const familySet = buildPageFamilies({
    verifiedUrls: inputs.verifiedUrls,
    verification: inputs.verification,
    sourceVerifiedUrlsFile: VERIFIED_FILE,
    sourceVerificationFile: VERIFICATION_FILE,
    builtAt: FIXED_AT,
  });
  const selection = buildPageSelection(familySet, FIXED_AT);
  assertSelectionInvariants(familySet, selection);
  return { familySet, selection };
}

const url = (p: string): string => (p === "/" ? `${ROOT}/` : `${ROOT}${p}`);

/** The family containing a given path, or undefined. */
function familyOf(familySet: PageFamilySet, p: string): PageFamily | undefined {
  return familySet.families.find((f) => f.members.some((m) => m.url === url(p)));
}

/** Whether two paths landed in the same family. */
function sameFamily(familySet: PageFamilySet, a: string, b: string): boolean {
  const fa = familyOf(familySet, a);
  const fb = familyOf(familySet, b);
  return Boolean(fa && fb && fa.id === fb.id);
}

function selectedUrls(selection: PageSelection): string[] {
  return selection.pages.map((p) => p.url);
}

async function main(): Promise<void> {
  console.log("web-recon — smoke:selector (offline fixture, no network / no browser)");
  console.log("");

  // ---------------------------------------------------------------- route features
  const mdnLike = extractRouteFeatures("https://example.test/en-US/docs/Web/HTML");
  check("locale prefix en-US detected", mdnLike.localePrefix === "en-US", mdnLike.localePrefix);
  check("routeScope after locale is docs", mdnLike.routeScope === "docs", mdnLike.routeScope);
  check("parentPath is /en-US/docs/Web", mdnLike.parentPath === "/en-US/docs/Web", mdnLike.parentPath);
  check("pathDepth 4", mdnLike.pathDepth === 4, String(mdnLike.pathDepth));
  check("locale segment is not removed from pathSegments", mdnLike.pathSegments[0] === "en-US");

  const noLocale = extractRouteFeatures("https://example.test/docs/web?b=2&a=1");
  check("routeScope without locale is docs", noLocale.routeScope === "docs", noLocale.routeScope);
  check("localePrefix absent when first segment is not xx/xx-YY", noLocale.localePrefix === undefined);
  check(
    "queryKeys sorted + signature",
    noLocale.queryKeySignature === "a&b",
    noLocale.queryKeySignature,
  );

  check("terminal root", classifyTerminalSegment("") === "root");
  check("terminal numeric", classifyTerminalSegment("123") === "numeric");
  check(
    "terminal uuid",
    classifyTerminalSegment("550e8400-e29b-41d4-a716-446655440000") === "uuid",
  );
  check("terminal date-like", classifyTerminalSegment("2026-08-13") === "date-like");
  check("terminal hex-id", classifyTerminalSegment("a1b2c3d4e5") === "hex-id");
  check(
    "plain slug stays text (not assumed dynamic)",
    classifyTerminalSegment("post-a") === "text",
  );

  // ---------------------------------------------------------------- grouping
  const inputs = buildInputs(ROWS);
  check("fixture produced 31 verified URLs", inputs.verifiedUrls.count === 31, String(inputs.verifiedUrls.count));
  check(
    "verified URLs carry the coarse profile (except the no-profile rows)",
    inputs.verifiedUrls.urls.filter((u) => u.structuralProfile).length === 28,
    String(inputs.verifiedUrls.urls.filter((u) => u.structuralProfile).length),
  );

  const { familySet, selection } = run(inputs);

  // ------------------------------------------------ Task 08 headline: coarse siblings
  const blogFamily = familyOf(familySet, "/blog/post-a");
  check(
    "coarse sibling: /blog/post-a|b|c are ONE family despite different exact hashes",
    sameFamily(familySet, "/blog/post-a", "/blog/post-b") &&
      sameFamily(familySet, "/blog/post-a", "/blog/post-c"),
  );
  check("coarse sibling family type", blogFamily?.type === "sibling-pattern", blogFamily?.type);
  check(
    "coarse sibling: the exact structureHash did NOT match (Task 07 could not do this)",
    blogFamily?.signals.familyMatch?.exactStructure === false &&
      blogFamily?.structureHash === undefined,
  );
  check(
    "coarse sibling: all three merge conditions recorded as true",
    blogFamily?.signals.familyMatch?.shallowSkeleton === true &&
      blogFamily?.signals.familyMatch?.landmark === true &&
      blogFamily?.signals.familyMatch?.histogramPresence === true,
  );
  check(
    "coarse sibling: element range recorded (410–489, ratio 1.193)",
    blogFamily?.signals.familyMatch?.elementCountMin === 410 &&
      blogFamily?.signals.familyMatch?.elementCountMax === 489 &&
      blogFamily?.signals.familyMatch?.elementCountRatio === 1.193,
    JSON.stringify(blogFamily?.signals.familyMatch),
  );
  check(
    "coarse sibling: readable structuralMatchReason stored",
    (blogFamily?.structuralMatchReason ?? "").startsWith(
      "shallowSkeleton+landmark+histogramPresence; elements 410–489",
    ),
    blogFamily?.structuralMatchReason,
  );
  check(
    "coarse sibling: inferredRoutePattern /blog/<*>",
    blogFamily?.inferredRoutePattern === "/blog/<*>",
    blogFamily?.inferredRoutePattern,
  );
  check(
    "coarse sibling: family carries the shared coarse hashes",
    Boolean(blogFamily?.shallowSkeletonHash) && Boolean(blogFamily?.landmarkHash),
  );
  check(
    "blog LIST page is not in the post family",
    !sameFamily(familySet, "/blog", "/blog/post-a"),
  );

  // ------------------------------------------------ element-count ratio guard
  check(
    `ratio guard: 200/100 = ${MAX_ELEMENT_COUNT_RATIO} exactly ⇒ /tools/a|b|c stay together`,
    sameFamily(familySet, "/tools/a", "/tools/b") &&
      sameFamily(familySet, "/tools/a", "/tools/c"),
  );
  check(
    "ratio guard: 201/100 is over the limit ⇒ /tools/d is split off",
    !sameFamily(familySet, "/tools/a", "/tools/d") &&
      familyOf(familySet, "/tools/d")?.type === "singleton",
    familyOf(familySet, "/tools/d")?.type,
  );
  check(
    "ratio guard: 900/410 is over the limit ⇒ /blog/post-huge is split off",
    !sameFamily(familySet, "/blog/post-a", "/blog/post-huge") &&
      familyOf(familySet, "/blog/post-huge")?.type === "singleton",
  );
  check(
    "ratio guard: no family exceeds the global constant",
    familySet.families.every(
      (f) => (f.signals.familyMatch?.elementCountRatio ?? 0) <= MAX_ELEMENT_COUNT_RATIO,
    ),
  );

  // ------------------------------------------------ scope-structure + ancestor guard
  const docsFamily = familyOf(familySet, "/docs/guide/intro");
  check(
    "scope-structure: /docs/guide/intro + /docs/api/reference are ONE family",
    sameFamily(familySet, "/docs/guide/intro", "/docs/api/reference"),
  );
  check("scope-structure family type", docsFamily?.type === "scope-structure", docsFamily?.type);
  check("scope-structure routeScope docs", docsFamily?.routeScope === "docs", docsFamily?.routeScope);
  check(
    "ancestor guard: /docs index shares the coarse profile but is NOT absorbed",
    !sameFamily(familySet, "/docs", "/docs/guide/intro") &&
      familyOf(familySet, "/docs")?.type === "singleton",
    familyOf(familySet, "/docs")?.type,
  );
  check(
    "ancestor guard: the index is still selected (never silently dropped)",
    selectedUrls(selection).includes(url("/docs")),
  );
  check(
    "scope-structure representative is the shorter URL",
    docsFamily?.representativeUrl === url("/docs/guide/intro"),
    docsFamily?.representativeUrl,
  );

  // ------------------------------------------------ landmark / kind / profile guards
  check(
    "landmark guard: same skeleton + different landmark tree ⇒ no merge",
    !sameFamily(familySet, "/services/alpha", "/services/beta"),
  );
  check(
    "presence guard: same skeleton + landmark, different element kinds ⇒ no merge",
    !sameFamily(familySet, "/kinds/alpha", "/kinds/beta"),
  );
  check(
    "no profile ⇒ never grouped, even as same-parent siblings",
    !sameFamily(familySet, "/legacy/alpha", "/legacy/beta") &&
      !sameFamily(familySet, "/legacy/alpha", "/legacy/gamma") &&
      familyOf(familySet, "/legacy/alpha")?.type === "singleton",
  );

  // ------------------------------------------------ duplicate logic (must be unchanged)
  const dupFamily = familyOf(familySet, "/duplicate-a");
  check(
    "content duplicate: /duplicate-a and /duplicate-b are ONE family",
    sameFamily(familySet, "/duplicate-a", "/duplicate-b"),
  );
  check("content duplicate family type", dupFamily?.type === "content-duplicate", dupFamily?.type);
  check("content duplicate shares text hash", dupFamily?.signals.sharedText === true);
  const pageFamily = familyOf(familySet, "/page");
  check(
    "content duplicate: /page + ?v=1 + ?v=2 are ONE family",
    sameFamily(familySet, "/page", "/page?v=1") &&
      sameFamily(familySet, "/page", "/page?v=2"),
  );
  check("query-variant family type", pageFamily?.type === "content-duplicate", pageFamily?.type);
  check(
    "query-variant aliases preserved as members",
    pageFamily?.members.length === 3,
    String(pageFamily?.members.length),
  );
  check(
    "representative prefers the query-free URL",
    pageFamily?.representativeUrl === url("/page"),
    pageFamily?.representativeUrl,
  );
  check(
    "a coarse match NEVER produces a content-duplicate",
    familySet.families
      .filter((f) => f.type === "content-duplicate")
      .every((f) =>
        f.members.every(
          (m) =>
            m.textHash === f.members[0].textHash &&
            m.structureHash === f.members[0].structureHash &&
            m.textHash !== undefined &&
            m.structureHash !== undefined,
        ),
      ),
  );
  check(
    "same coarse profile + different text is NOT a content duplicate",
    familyOf(familySet, "/about")?.type === "singleton" &&
      familyOf(familySet, "/pricing")?.type === "singleton",
  );

  // ------------------------------------------------ canonical safety (unchanged)
  check(
    "canonical-only: /canonical-a and /canonical-b NOT merged",
    !sameFamily(familySet, "/canonical-a", "/canonical-b"),
  );
  check(
    "canonical-only: /legal/terms and /legal/privacy NOT merged (same scope + same canonical)",
    !sameFamily(familySet, "/legal/terms", "/legal/privacy"),
  );
  check(
    "canonical-only: /canonical-a NOT merged into the root family",
    !sameFamily(familySet, "/", "/canonical-a"),
  );
  check(
    "canonical pointing elsewhere is still recorded as a hint",
    familyOf(familySet, "/canonical-a")?.signals.canonicalHints?.[0] === `${ROOT}/`,
  );
  check(
    "canonical pointing elsewhere is counted for review",
    familyOf(familySet, "/canonical-a")?.signals.canonicalPointsElsewhereCount === 1,
  );
  check(
    "all-self-canonical family is NOT flagged as pointing elsewhere",
    familyOf(familySet, "/docs/guide/intro")?.signals
      .canonicalPointsElsewhereCount === undefined,
  );

  // ------------------------------------------------ cross-scope false merge
  check(
    "structure-only across scopes: /about and /pricing NOT merged",
    !sameFamily(familySet, "/about", "/pricing"),
  );

  // ------------------------------------------------ singleton + root
  check("singleton: /pricing is its own family", familyOf(familySet, "/pricing")?.members.length === 1);
  const rootFamily = familyOf(familySet, "/");
  check("root is a protected singleton", rootFamily?.signals.rootProtected === true);
  check("root family has exactly 1 member", rootFamily?.members.length === 1);
  check("root survives selection", selectedUrls(selection).includes(`${ROOT}/`));
  check(
    "root selection reason is root-protected",
    selection.pages.find((p) => p.url === `${ROOT}/`)?.reason === "root-protected",
  );
  check(
    "root protection also covers a path-rooted run (MDN-style /en-US/)",
    isSiteRoot(
      "https://developer.mozilla.org/en-US/",
      "https://developer.mozilla.org/en-US/",
    ) &&
      !isSiteRoot(
        "https://developer.mozilla.org/en-US/docs/Web",
        "https://developer.mozilla.org/en-US/",
      ),
  );

  // ---------------------------------------------------------------- counts
  check("23 families", familySet.familyCount === 23, String(familySet.familyCount));
  check(
    "family type counts",
    familySet.familyTypeCounts["content-duplicate"] === 2 &&
      familySet.familyTypeCounts["sibling-pattern"] === 2 &&
      familySet.familyTypeCounts["scope-structure"] === 1 &&
      familySet.familyTypeCounts.singleton === 18,
    JSON.stringify(familySet.familyTypeCounts),
  );
  check("largest family size 3", familySet.largestFamilySize === 3, String(familySet.largestFamilySize));
  check("selectedCount === familyCount", selection.selectedCount === selection.familyCount);
  check("reductionCount 8", selection.reductionCount === 8, String(selection.reductionCount));
  check(
    "reductionRate 0.2581",
    selection.reductionRate === 0.2581,
    String(selection.reductionRate),
  );

  // ---------------------------------------------------------------- invariants
  const memberUrls = familySet.families.flatMap((f) => f.members.map((m) => m.url));
  check(
    "coverage: sum(members) === verified count",
    memberUrls.length === inputs.verifiedUrls.count,
    `${memberUrls.length} vs ${inputs.verifiedUrls.count}`,
  );
  check("membership: no URL in two families", new Set(memberUrls).size === memberUrls.length);
  check(
    "coverage: every verified URL is in a family",
    inputs.verifiedUrls.urls.every((u) => memberUrls.includes(u.url)),
  );
  check(
    "representative: exactly one per family",
    familySet.families.every(
      (f) => f.members.filter((m) => m.isRepresentative).length === 1,
    ),
  );
  check(
    "provenance: every non-representative URL is recorded as unselected",
    selection.unselected.length === inputs.verifiedUrls.count - selection.selectedCount,
    String(selection.unselected.length),
  );
  check(
    "provenance: every unselected URL names its representative",
    selection.unselected.every((u) =>
      familySet.families.some(
        (f) => f.id === u.familyId && f.representativeUrl === u.representativeUrl,
      ),
    ),
  );
  check(
    "provenance: members keep their structural profile for later review",
    familySet.families
      .flatMap((f) => f.members)
      .filter((m) => m.structuralProfile).length === 28,
  );
  check(
    "family ids are deterministic f000001…",
    familySet.families.every((f, i) => f.id === `f${String(i + 1).padStart(6, "0")}`),
  );

  // ---------------------------------------------------------------- determinism
  const baseline = JSON.stringify({ familySet, selection });

  const reversedRows = [...ROWS].reverse();
  const reversed = run(buildInputs(reversedRows));
  check(
    "determinism: reversed input order → identical output",
    JSON.stringify({ familySet: reversed.familySet, selection: reversed.selection }) ===
      baseline,
  );

  // Deterministic shuffle — a fixed stride coprime with the row count, so the
  // mapping is a true permutation (no repeats, no drops) and never random.
  const STRIDE = 5;
  const shuffledRows = ROWS.map((_, i) => ROWS[(i * STRIDE + 3) % ROWS.length]);
  check(
    "strided order is a real permutation of the fixture",
    new Set(shuffledRows).size === ROWS.length,
    `${new Set(shuffledRows).size} distinct of ${ROWS.length}`,
  );
  const shuffled = run(buildInputs(shuffledRows));
  check(
    "determinism: strided input order → identical output",
    JSON.stringify({ familySet: shuffled.familySet, selection: shuffled.selection }) ===
      baseline,
  );

  // Reordering the persisted arrays themselves (not just the fixture rows).
  const permuted = run({
    verifiedUrls: {
      ...inputs.verifiedUrls,
      urls: [...inputs.verifiedUrls.urls].reverse(),
    },
    verification: {
      ...inputs.verification,
      candidates: [...inputs.verification.candidates].reverse(),
      duplicateGroups: [...inputs.verification.duplicateGroups].reverse(),
    },
  });
  check(
    "determinism: reversed verified-urls + duplicateGroups arrays → identical output",
    JSON.stringify({ familySet: permuted.familySet, selection: permuted.selection }) ===
      baseline,
  );

  // ---------------------------------------------------------------- zod round-trip
  let tmp: string | undefined;
  try {
    tmp = await mkdtemp(path.join(tmpdir(), "selector-smoke-"));
    const saved = await saveSelection(tmp, familySet, selection);
    const reloadedFamilies = PageFamilySetSchema.safeParse(
      JSON.parse(await readFile(saved.familiesPath, "utf8")),
    );
    const reloadedSelection = PageSelectionSchema.safeParse(
      JSON.parse(await readFile(saved.selectionPath, "utf8")),
    );
    check("page-families.json passes Zod after reload", reloadedFamilies.success);
    check("selected-pages.json passes Zod after reload", reloadedSelection.success);
    check(
      "reloaded selection keeps every selected URL",
      reloadedSelection.success &&
        reloadedSelection.data.pages.length === selection.selectedCount,
    );
  } finally {
    if (tmp) await rm(tmp, { recursive: true, force: true });
  }

  console.log("");
  console.log(`${checks - failures}/${checks} checks passed`);
  if (failures > 0) {
    console.error(`[smoke:selector] FAILED — ${failures} check(s) failed`);
    process.exitCode = 1;
  } else {
    console.log("[smoke:selector] OK");
  }
}

main().catch((err) => {
  console.error("[smoke:selector] ERROR —", err instanceof Error ? err.message : err);
  process.exitCode = 1;
});
