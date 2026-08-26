import { createServer, type Server } from "node:http";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { chromium, type Browser } from "playwright";
import { SCHEMA_VERSION as DISCOVERY_SCHEMA_VERSION } from "../src/discovery/index.js";
import type { DiscoveryResult } from "../src/discovery/index.js";
import {
  buildVerifiedUrls,
  saveVerification,
  verifyDiscovery,
  type CandidateVerification,
  type DuplicateGroup,
  type VerificationResult,
} from "../src/verifier/index.js";
import {
  VerificationResultSchema,
  VerifiedUrlSetSchema,
} from "../src/verifier/types.js";
import {
  HISTOGRAM_BUCKET_BOUNDS,
  SKELETON_POLICY,
  bucketOf,
  histogramPresenceKey,
  serializeLandmarks,
  serializeSkeleton,
} from "../src/verifier/structural-profile.js";

/**
 * Local deterministic fixture test for the Verifier (Task 06 §31–32, Task 08 §18–19).
 *
 * Spins up a tiny in-process HTTP server exposing the exact edge cases real
 * sites make hard to reproduce (200 HTML, 301/302 redirect, 404, 500, non-html,
 * shared canonical, duplicate content, external redirect, blocked), builds a
 * synthetic DiscoveryResult pointing at it, runs the real Playwright verifier,
 * and asserts the classification / redirect / fingerprint / duplicate-group /
 * verified-url outcomes. No external network, no test framework.
 *
 * The "external" case redirects to 127.0.0.1 (a different hostname than the
 * `localhost` root), so it is same-server-reachable yet correctly not same-site.
 *
 * Task 08 adds a second block of pages served purely to pin down the COARSE
 * structural profile against a real DOM: pairs that must produce the same
 * skeleton (different body length, different list length, extra `<script>` /
 * `<meta>` noise, bigger inline SVG, differences below the depth cap) and pairs
 * that must NOT (list vs detail, home vs content, docs index vs docs article,
 * same landmarks with different inner structure).
 */

const HTML = (body: string, head = ""): string =>
  `<!doctype html><html><head><meta charset="utf-8">${head}</head><body>${body}</body></html>`;

// Identical body + structure → content-fingerprint duplicates.
const DUP_BODY = HTML(
  "<header><h1>Duplicate</h1></header><main><p>Same content here.</p></main>",
);

// ---------------------------------------------------------------- Task 08 pages

const CHROME_HEAD = "<header><nav><a href=/>Home</a><a href=/blog>Blog</a></nav></header>";
const CHROME_FOOT = "<footer><p>© fixture</p></footer>";
const shell = (main: string): string => HTML(`${CHROME_HEAD}<main>${main}</main>${CHROME_FOOT}`);

/** `<p>` repeated n times, each with different text (text must not matter). */
const paras = (n: number): string =>
  Array.from({ length: n }, (_, i) => `<p>Paragraph number ${i} with its own words.</p>`).join("");
/** `<li><a>` repeated n times. */
const items = (n: number): string =>
  Array.from({ length: n }, (_, i) => `<li><a href="/i/${i}">Item ${i}</a></li>`).join("");

/**
 * Every page below is keyed by the path it is served at. Grouped by what it
 * proves; the assertions further down name the same paths.
 */
const STRUCTURAL_PAGES: Record<string, string> = {
  // §18 positive — same article template, different content length.
  "/s/article-short": shell(`<article><h1>Short</h1>${paras(3)}</article>`),
  "/s/article-long": shell(`<article><h1>Long</h1>${paras(9)}</article>`),

  // §18 positive — same template, different list length (3 vs 8 related items).
  "/s/product-a": shell(
    `<article><h1>A</h1><p>Body.</p><section><h2>Related</h2><ul>${items(3)}</ul></section></article>`,
  ),
  "/s/product-b": shell(
    `<article><h1>B</h1><p>Body.</p><section><h2>Related</h2><ul>${items(8)}</ul></section></article>`,
  ),

  // §18 third case — an optional section appearing/disappearing (measured, not
  // assumed: this one legitimately changes the landmark tree).
  "/s/optional-with": shell(
    `<article><h1>With</h1>${paras(3)}<section><h2>Related</h2><ul>${items(3)}</ul></section></article>`,
  ),
  "/s/optional-without": shell(`<article><h1>Without</h1>${paras(3)}</article>`),

  // Noise insensitivity — identical body, extra head metadata + an inline script.
  "/s/noise-plain": shell(`<article><h1>Noise</h1>${paras(4)}</article>`),
  "/s/noise-heavy": HTML(
    `${CHROME_HEAD}<main><article><h1>Noise</h1>${paras(4)}</article></main>${CHROME_FOOT}<script>window.x=1</script>`,
    '<meta name="a" content="1"><meta name="b" content="2"><link rel="preload" href="/x.css" as="style"><style>.a{color:red}</style><script>window.y=2</script>',
  ),

  // Opaque SVG — one icon path vs a whole illustration.
  "/s/svg-small": shell(
    `<article><h1>SVG</h1><p>x</p><svg viewBox="0 0 1 1"><path d="M0 0"/></svg></article>`,
  ),
  "/s/svg-large": shell(
    `<article><h1>SVG</h1><p>x</p><svg viewBox="0 0 1 1"><g><path d="M0 0"/><path d="M1 1"/></g><path d="M2 2"/><circle r="1"/></svg></article>`,
  ),

  // Depth cap — the two differ only BELOW the cap (html0 body1 main2 article3
  // div4 div5 div6 …) using the same element kinds, so nothing must see it.
  "/s/deep-a": shell(
    `<article><div><div><div><p>one</p><p>two</p></div></div></div></article>`,
  ),
  "/s/deep-b": shell(
    `<article><div><div><div><p>one</p><div><p>two</p></div></div></div></div></article>`,
  ),

  // Presence guard in isolation — same skeleton (the difference is below the
  // depth cap) and same landmarks, but one page contains a list and the other
  // does not, so the element-KIND guard must still keep them apart.
  "/s/kind-text": shell(
    `<article><div><div><div><p>one</p><p>two</p></div></div></div></article>`,
  ),
  "/s/kind-list": shell(
    `<article><div><div><div><ul><li>one</li><li>two</li></ul></div></div></div></article>`,
  ),

  // §19 negative — list vs detail.
  "/s/blog": shell(
    `<section><h1>Blog</h1><article><h2>One</h2><p>t</p></article><article><h2>Two</h2><p>t</p></article><article><h2>Three</h2><p>t</p></article></section>`,
  ),
  "/s/blog/post-a": shell(`<article><h1>Post A</h1>${paras(5)}</article>`),

  // §19 negative — home vs content page.
  "/s/home": shell(
    `<section><h1>Welcome</h1><p>Hero.</p><form><label>Email<input name=email></label><button>Go</button></form></section><section><h2>Features</h2><ul>${items(4)}</ul></section>`,
  ),
  "/s/about": shell(`<article><h1>About</h1>${paras(4)}</article>`),

  // §19 negative — docs index vs docs article.
  "/s/docs": shell(
    `<nav><h1>Docs</h1><ul>${items(6)}</ul></nav><section><h2>Popular</h2><ul>${items(3)}</ul></section>`,
  ),
  "/s/docs/getting-started": shell(
    `<article><h1>Getting started</h1>${paras(3)}<pre>npm i</pre></article>`,
  ),

  // §19 negative — SAME landmark tree, different structure inside it.
  "/s/landmark-text": shell(`<article><h1>Text</h1>${paras(4)}</article>`),
  "/s/landmark-list": shell(`<article><h1>List</h1><ul>${items(4)}</ul></article>`),

  // Text insensitivity — identical markup, completely different words.
  "/s/text-a": shell(`<article><h1>Alpha</h1><p>The quick brown fox.</p></article>`),
  "/s/text-b": shell(
    `<article><h1>완전히 다른 제목</h1><p>본문 내용도 전혀 다릅니다.</p></article>`,
  ),
};

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

function startServer(): Promise<{ server: Server; port: number }> {
  const server = createServer((req, res) => {
    const url = req.url || "/";
    const host = req.headers.host || "localhost";
    // 127.0.0.1 target for the external-redirect case (different hostname).
    const externalBase = `http://127.0.0.1:${host.split(":")[1] ?? ""}`;
    const structural = STRUCTURAL_PAGES[url];
    if (structural) {
      res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
      res.end(structural);
      return;
    }
    switch (url) {
      case "/ok":
        res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
        res.end(HTML("<h1>OK</h1><p>Hello.</p>"));
        return;
      case "/to-ok":
        res.writeHead(302, { location: "/ok" });
        res.end();
        return;
      case "/redirect":
        res.writeHead(301, { location: "/ok" });
        res.end();
        return;
      case "/not-found":
        res.writeHead(404, { "content-type": "text/html; charset=utf-8" });
        res.end(HTML("<h1>Not found</h1>"));
        return;
      case "/error":
        res.writeHead(500, { "content-type": "text/html; charset=utf-8" });
        res.end(HTML("<h1>Server error</h1>"));
        return;
      case "/blocked":
        res.writeHead(403, { "content-type": "text/html; charset=utf-8" });
        res.end(HTML("<h1>Forbidden</h1>"));
        return;
      case "/file":
        res.writeHead(200, { "content-type": "application/pdf" });
        res.end(Buffer.from("%PDF-1.4 fake pdf bytes"));
        return;
      case "/canonical-a":
        res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
        res.end(
          HTML(
            "<h1>Canonical A</h1><p>Distinct body A.</p>",
            '<link rel="canonical" href="/canonical-a">',
          ),
        );
        return;
      case "/canonical-b":
        res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
        res.end(
          HTML(
            "<h1>Canonical B</h1><p>Distinct body B, different text.</p>",
            '<link rel="canonical" href="/canonical-a">',
          ),
        );
        return;
      case "/duplicate-a":
        res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
        res.end(DUP_BODY);
        return;
      case "/duplicate-b":
        res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
        res.end(DUP_BODY);
        return;
      case "/external":
        res.writeHead(302, { location: `${externalBase}/ok` });
        res.end();
        return;
      default:
        res.writeHead(404, { "content-type": "text/html; charset=utf-8" });
        res.end(HTML("<h1>404</h1>"));
        return;
    }
  });
  return new Promise((resolve) => {
    server.listen(0, "127.0.0.1", () => {
      const addr = server.address();
      const port = typeof addr === "object" && addr ? addr.port : 0;
      resolve({ server, port });
    });
  });
}

function makeDiscovery(rootUrl: string, paths: string[]): DiscoveryResult {
  const links = paths.map((p) => {
    const url = `${rootUrl}${p}`;
    return { url, normalizedUrl: url };
  });
  return {
    schemaVersion: DISCOVERY_SCHEMA_VERSION,
    rootUrl,
    provider: "fixture",
    discoveredAt: "2026-08-13T00:00:00.000Z",
    rawCount: links.length,
    normalizedCount: links.length,
    duplicateCount: 0,
    invalidCount: 0,
    externalFilteredCount: 0,
    links,
  };
}

function byPath(
  result: VerificationResult,
  suffix: string,
): CandidateVerification | undefined {
  return result.candidates.find((c) => c.candidateUrl.endsWith(suffix));
}

function groupHas(
  groups: DuplicateGroup[],
  type: DuplicateGroup["type"],
  ...suffixes: string[]
): boolean {
  return groups.some(
    (g) =>
      g.type === type &&
      suffixes.every((s) => g.candidateUrls.some((u) => u.endsWith(s))),
  );
}

async function main(): Promise<void> {
  console.log("web-recon — smoke:verifier (local fixture)");
  console.log("");

  // ------------------------------------------------ pure structural-policy units
  // No DOM needed: these pin the normalization itself, so a policy change shows
  // up here rather than only as a shifted hash later.
  check("policy is the documented global one", SKELETON_POLICY.depthCap === 6 &&
    SKELETON_POLICY.labelMode === "tag" && SKELETON_POLICY.repeat === "dedupe",
    JSON.stringify(SKELETON_POLICY));
  check(
    "bucket bounds 0|1|2|3-4|5-8|9-16|17-32|33+",
    [0, 1, 2, 3, 4, 5, 8, 9, 16, 17, 32, 33, 1000].map(bucketOf).join(",") ===
      "0,1,2,3,3,4,4,5,5,6,6,7,7",
    [0, 1, 2, 3, 4, 5, 8, 9, 16, 17, 32, 33, 1000].map(bucketOf).join(","),
  );
  check(
    "bucket bounds are the documented constant",
    HISTOGRAM_BUCKET_BOUNDS.join(",") === "0,1,2,4,8,16,32",
    HISTOGRAM_BUCKET_BOUNDS.join(","),
  );
  const skel = (tokens: string): string => serializeSkeleton(tokens, SKELETON_POLICY);
  check(
    "repeat collapse: 3 vs 8 identical siblings are one shape",
    skel("0:ul,1:li,1:li,1:li") === skel("0:ul,1:li,1:li,1:li,1:li,1:li,1:li,1:li,1:li"),
    skel("0:ul,1:li,1:li,1:li"),
  );
  check(
    "repeat collapse keeps distinct sibling shapes and their first order",
    skel("0:div,1:p,1:ul,1:p") === "div(p,ul)",
    skel("0:div,1:p,1:ul,1:p"),
  );
  check(
    "repeat collapse compares whole subtrees, not tags",
    skel("0:ul,1:li,2:a,1:li,2:a,3:span") === "ul(li(a),li(a(span)))",
    skel("0:ul,1:li,2:a,1:li,2:a,3:span"),
  );
  check(
    "headings collapse to one label (h2 vs h3 is a content choice)",
    skel("0:div,1:h1,1:h3") === "div(h)",
    skel("0:div,1:h1,1:h3"),
  );
  check(
    "depth cap 6 hides differences at depth 7",
    skel("0:a,1:b,2:c,3:d,4:e,5:f,6:g,7:p") === skel("0:a,1:b,2:c,3:d,4:e,5:f,6:g,7:ul"),
    skel("0:a,1:b,2:c,3:d,4:e,5:f,6:g,7:p"),
  );
  check(
    "depth cap 6 still sees differences at depth 6",
    skel("0:a,1:b,2:c,3:d,4:e,5:f,6:g") !== skel("0:a,1:b,2:c,3:d,4:e,5:f,6:h1"),
  );
  check(
    "landmark signature keeps nesting and order",
    serializeLandmarks("0:header,1:nav,0:main,1:article,1:aside,0:footer") ===
      "header(nav),main(article,aside),footer",
    serializeLandmarks("0:header,1:nav,0:main,1:article,1:aside,0:footer"),
  );
  check(
    "landmark signature is insensitive to repeated articles",
    serializeLandmarks("0:main,1:article,1:article,1:article") ===
      serializeLandmarks("0:main,1:article"),
  );
  check(
    "landmark order matters (main,aside) != (aside,main)",
    serializeLandmarks("0:main,0:aside") !== serializeLandmarks("0:aside,0:main"),
  );

  const { server, port } = await startServer();
  // Root uses `localhost`; /external redirects to 127.0.0.1 (not same-site).
  const rootUrl = `http://localhost:${port}`;
  const TASK06_PATHS = [
    "/ok",
    "/to-ok",
    "/redirect",
    "/not-found",
    "/error",
    "/blocked",
    "/file",
    "/canonical-a",
    "/canonical-b",
    "/duplicate-a",
    "/duplicate-b",
    "/external",
  ];
  /** Task 06 paths that end up `valid-html` (everything but the 5 failure cases). */
  const TASK06_VALID = 7;
  const STRUCTURAL_PATHS = Object.keys(STRUCTURAL_PAGES);
  const paths = [...TASK06_PATHS, ...STRUCTURAL_PATHS];
  const discovery = makeDiscovery(rootUrl, paths);

  let browser: Browser | undefined;
  let tmp: string | undefined;
  try {
    browser = await chromium.launch();
    const result = await verifyDiscovery(discovery, {
      concurrency: 3,
      sourceDiscoveryFile: "fixture://discovery.json",
      verifiedAt: "2026-08-13T00:00:00.000Z",
      browser,
    });

    // --- Per-candidate classification ---
    const ok = byPath(result, "/ok");
    check("/ok → valid-html", ok?.status === "valid-html", ok?.status);
    check("/ok has title", (ok?.title ?? "") === "", ok?.title); // no <title> set
    check("/ok has fingerprints", Boolean(ok?.fingerprints));

    const toOk = byPath(result, "/to-ok");
    check("/to-ok → valid-html", toOk?.status === "valid-html", toOk?.status);
    check("/to-ok redirected", toOk?.redirected === true);
    check("/to-ok redirectCount 1", toOk?.redirectCount === 1, String(toOk?.redirectCount));
    check("/to-ok finalUrl → /ok", (toOk?.finalUrl ?? "").endsWith("/ok"), toOk?.finalUrl);
    check(
      "/to-ok redirectChain hop 302",
      toOk?.redirectChain?.[0]?.status === 302,
      String(toOk?.redirectChain?.[0]?.status),
    );

    const redirect = byPath(result, "/redirect");
    check("/redirect → valid-html (301→200)", redirect?.status === "valid-html");
    check(
      "/redirect chain hop 301",
      redirect?.redirectChain?.[0]?.status === 301,
      String(redirect?.redirectChain?.[0]?.status),
    );

    const notFound = byPath(result, "/not-found");
    check("/not-found → http-error", notFound?.status === "http-error", notFound?.status);
    check("/not-found httpStatus 404", notFound?.httpStatus === 404, String(notFound?.httpStatus));

    const error = byPath(result, "/error");
    check("/error → http-error", error?.status === "http-error", error?.status);
    check("/error httpStatus 500", error?.httpStatus === 500, String(error?.httpStatus));

    const blocked = byPath(result, "/blocked");
    check("/blocked → blocked", blocked?.status === "blocked", blocked?.status);
    check("/blocked httpStatus 403", blocked?.httpStatus === 403, String(blocked?.httpStatus));

    const file = byPath(result, "/file");
    check("/file → non-html", file?.status === "non-html", file?.status);
    check(
      "/file contentType application/pdf",
      file?.contentType === "application/pdf",
      file?.contentType,
    );

    const external = byPath(result, "/external");
    check("/external → external-redirect", external?.status === "external-redirect", external?.status);
    check("/external finalSameSite false", external?.finalSameSite === false);

    const canonA = byPath(result, "/canonical-a");
    const canonB = byPath(result, "/canonical-b");
    check(
      "/canonical-a canonicalUrl resolves to /canonical-a",
      (canonA?.canonicalUrl ?? "").endsWith("/canonical-a"),
      canonA?.canonicalUrl,
    );
    check(
      "/canonical-b canonicalUrl resolves to /canonical-a",
      (canonB?.canonicalUrl ?? "").endsWith("/canonical-a"),
      canonB?.canonicalUrl,
    );

    const dupA = byPath(result, "/duplicate-a");
    const dupB = byPath(result, "/duplicate-b");
    check(
      "/duplicate-a and /duplicate-b share textHash",
      Boolean(dupA?.fingerprints && dupB?.fingerprints) &&
        dupA?.fingerprints?.textHash === dupB?.fingerprints?.textHash,
    );
    check(
      "/duplicate-a and /duplicate-b share structureHash",
      dupA?.fingerprints?.structureHash === dupB?.fingerprints?.structureHash,
    );

    // --- Duplicate groups ---
    check(
      "final-url group { /ok, /to-ok }",
      groupHas(result.duplicateGroups, "final-url", "/ok", "/to-ok"),
    );
    check(
      "canonical group { /canonical-a, /canonical-b }",
      groupHas(result.duplicateGroups, "canonical", "/canonical-a", "/canonical-b"),
    );
    check(
      "content-fingerprint group { /duplicate-a, /duplicate-b }",
      groupHas(
        result.duplicateGroups,
        "content-fingerprint",
        "/duplicate-a",
        "/duplicate-b",
      ),
    );

    // --- Summary counts ---
    check(
      `validHtmlCount = ${TASK06_VALID + STRUCTURAL_PATHS.length}`,
      result.validHtmlCount === TASK06_VALID + STRUCTURAL_PATHS.length,
      String(result.validHtmlCount),
    );
    check("httpErrorCount = 2", result.httpErrorCount === 2, String(result.httpErrorCount));
    check("nonHtmlCount = 1", result.nonHtmlCount === 1, String(result.nonHtmlCount));
    check(
      "externalRedirectCount = 1",
      result.externalRedirectCount === 1,
      String(result.externalRedirectCount),
    );
    check("blockedCount = 1", result.blockedCount === 1, String(result.blockedCount));

    // --- Task 08: coarse structural profile against a real DOM ---
    const profileOf = (suffix: string) => byPath(result, suffix)?.structuralProfile;
    const exactStructureOf = (suffix: string) =>
      byPath(result, suffix)?.fingerprints?.structureHash;
    /** The three Selector merge conditions, evaluated between two fixture pages. */
    const coarseMatch = (a: string, b: string): boolean => {
      const pa = profileOf(a);
      const pb = profileOf(b);
      if (!pa || !pb) return false;
      return (
        pa.shallowSkeletonHash === pb.shallowSkeletonHash &&
        pa.landmarkHash === pb.landmarkHash &&
        histogramPresenceKey(pa) === histogramPresenceKey(pb)
      );
    };

    check("every valid HTML page got a structural profile",
      result.candidates
        .filter((c) => c.status === "valid-html")
        .every((c) => Boolean(c.structuralProfile)));

    // POSITIVE (§18)
    check(
      "positive: same article template, 3 vs 9 paragraphs → coarse match",
      coarseMatch("/s/article-short", "/s/article-long"),
    );
    check(
      "…and the EXACT hash still separates them (duplicate detection unharmed)",
      exactStructureOf("/s/article-short") !== exactStructureOf("/s/article-long"),
    );
    check(
      "positive: same template, 3 vs 8 related items → coarse match",
      coarseMatch("/s/product-a", "/s/product-b"),
    );
    check(
      "positive: extra <script>/<meta>/<link> noise → coarse match",
      coarseMatch("/s/noise-plain", "/s/noise-heavy"),
    );
    check(
      "…and the EXACT hash does see that noise",
      exactStructureOf("/s/noise-plain") !== exactStructureOf("/s/noise-heavy"),
    );
    check(
      "positive: inline SVG is opaque (1 path vs 4 nodes) → coarse match",
      coarseMatch("/s/svg-small", "/s/svg-large"),
    );
    check(
      "positive: a difference below the depth cap → coarse match",
      coarseMatch("/s/deep-a", "/s/deep-b"),
    );
    check(
      "guard: same skeleton + same landmarks but different element KINDS → no match",
      profileOf("/s/kind-text")?.shallowSkeletonHash ===
        profileOf("/s/kind-list")?.shallowSkeletonHash &&
        profileOf("/s/kind-text")?.landmarkHash ===
          profileOf("/s/kind-list")?.landmarkHash &&
        !coarseMatch("/s/kind-text", "/s/kind-list"),
    );
    check(
      "positive: identical markup, different language/text → coarse match",
      coarseMatch("/s/text-a", "/s/text-b"),
    );

    // MEASURED LIMIT (§18 third case) — an optional <section> is a landmark
    // change, so it does NOT survive. Asserted as it measures, not as hoped.
    check(
      "measured limit: optional <section> appearing DOES split the family",
      !coarseMatch("/s/optional-with", "/s/optional-without"),
    );
    check(
      "…and the cause is the landmark tree, not the skeleton alone",
      profileOf("/s/optional-with")?.landmarkHash !==
        profileOf("/s/optional-without")?.landmarkHash,
    );

    // NEGATIVE (§19)
    check("negative: list vs detail", !coarseMatch("/s/blog", "/s/blog/post-a"));
    check("negative: home vs content page", !coarseMatch("/s/home", "/s/about"));
    check(
      "negative: docs index vs docs article",
      !coarseMatch("/s/docs", "/s/docs/getting-started"),
    );
    check(
      "negative: same landmark tree is NOT enough on its own",
      profileOf("/s/landmark-text")?.landmarkHash ===
        profileOf("/s/landmark-list")?.landmarkHash &&
        !coarseMatch("/s/landmark-text", "/s/landmark-list"),
    );

    // Counts / metrics
    const home = profileOf("/s/home");
    check(
      "landmarkCounts read the real DOM",
      home?.landmarkCounts.header === 1 &&
        home?.landmarkCounts.nav === 1 &&
        home?.landmarkCounts.main === 1 &&
        home?.landmarkCounts.footer === 1 &&
        home?.landmarkCounts.section === 2 &&
        home?.landmarkCounts.form === 1 &&
        home?.landmarkCounts.article === 0,
      JSON.stringify(home?.landmarkCounts),
    );
    check(
      "structuralCounts read the real DOM",
      home?.structuralCounts.button === 1 &&
        home?.structuralCounts.input === 1 &&
        home?.structuralCounts.list === 1 &&
        home?.structuralCounts.listItem === 4 &&
        home?.structuralCounts.heading === 2,
      JSON.stringify(home?.structuralCounts),
    );
    const short = profileOf("/s/article-short");
    const long = profileOf("/s/article-long");
    check(
      "elementCount excludes head/script/style and tracks real content",
      Boolean(short && long) && short!.elementCount < long!.elementCount,
      `${short?.elementCount} vs ${long?.elementCount}`,
    );
    check(
      "elementCount ignores <script>/<meta>/<link> noise entirely",
      profileOf("/s/noise-plain")?.elementCount ===
        profileOf("/s/noise-heavy")?.elementCount,
      `${profileOf("/s/noise-plain")?.elementCount} vs ${profileOf("/s/noise-heavy")?.elementCount}`,
    );
    check(
      "elementCount does not descend into inline SVG",
      profileOf("/s/svg-small")?.elementCount ===
        profileOf("/s/svg-large")?.elementCount,
      `${profileOf("/s/svg-small")?.elementCount} vs ${profileOf("/s/svg-large")?.elementCount}`,
    );
    check(
      "histogramBuckets cover every documented category",
      Object.keys(profileOf("/s/home")?.histogramBuckets ?? {}).length === 17,
      String(Object.keys(profileOf("/s/home")?.histogramBuckets ?? {}).length),
    );
    check(
      "histogram presence separates a form page from an article page",
      histogramPresenceKey(profileOf("/s/home")!) !==
        histogramPresenceKey(profileOf("/s/about")!),
    );
    check("maxDepth is recorded uncapped", (profileOf("/s/deep-a")?.maxDepth ?? 0) >= 7,
      String(profileOf("/s/deep-a")?.maxDepth));

    // --- verified-urls.json (eligibility + dedup) ---
    const verified = buildVerifiedUrls(
      result.candidates,
      result.rootUrl,
      "fixture://discovery.json",
      "2026-08-13T00:00:00.000Z",
    );
    const verifiedUrls = verified.urls.map((u) => u.url);
    const includes = (s: string): boolean => verifiedUrls.some((u) => u.endsWith(s));
    check("verified excludes 404", !includes("/not-found"));
    check("verified excludes 500", !includes("/error"));
    check("verified excludes non-html", !includes("/file"));
    check("verified excludes blocked", !includes("/blocked"));
    check("verified excludes external final", !verifiedUrls.some((u) => u.includes("127.0.0.1")));
    const okEntry = verified.urls.find((u) => u.url.endsWith("/ok"));
    check("verified includes /ok once", verifiedUrls.filter((u) => u.endsWith("/ok")).length === 1);
    check(
      "verified /ok has 3 source candidates (/ok + /to-ok + /redirect)",
      (okEntry?.sourceCandidateUrls.length ?? 0) === 3,
      String(okEntry?.sourceCandidateUrls.length),
    );
    check(
      "verified keeps canonical dupes (a & b both present)",
      includes("/canonical-a") && includes("/canonical-b"),
    );
    check(
      "verified keeps content dupes (a & b both present)",
      includes("/duplicate-a") && includes("/duplicate-b"),
    );
    // /ok, /canonical-a, /canonical-b, /duplicate-a, /duplicate-b = 5, plus the
    // Task 08 structural pages (all distinct final URLs).
    const expectedVerified = 5 + STRUCTURAL_PATHS.length;
    check(
      `verified count = ${expectedVerified}`,
      verified.count === expectedVerified,
      String(verified.count),
    );
    check(
      "verified-urls.json carries the structural profile through",
      verified.urls.every((u) => Boolean(u.structuralProfile)),
    );

    // --- Zod validation of both outputs (persist to a temp dir) ---
    tmp = await mkdtemp(path.join(tmpdir(), "verifier-smoke-"));
    const saved = await saveVerification(tmp, result, verified);
    const reloadedV = VerificationResultSchema.safeParse(
      JSON.parse(await readFile(saved.verificationPath, "utf8")),
    );
    const reloadedU = VerifiedUrlSetSchema.safeParse(
      JSON.parse(await readFile(saved.verifiedUrlsPath, "utf8")),
    );
    check("verification.json passes Zod", reloadedV.success);
    check("verified-urls.json passes Zod", reloadedU.success);
  } finally {
    if (browser) await browser.close();
    server.close();
    if (tmp) await rm(tmp, { recursive: true, force: true });
  }

  console.log("");
  console.log(`${checks - failures}/${checks} checks passed`);
  if (failures > 0) {
    console.error(`[smoke:verifier] FAILED — ${failures} check(s) failed`);
    process.exitCode = 1;
  } else {
    console.log("[smoke:verifier] OK");
  }
}

main().catch((err) => {
  console.error("[smoke:verifier] ERROR —", err instanceof Error ? err.message : err);
  process.exitCode = 1;
});
