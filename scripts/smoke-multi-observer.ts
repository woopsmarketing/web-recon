import { createServer, type Server } from "node:http";
import { mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { chromium, type Browser } from "playwright";
import {
  PageSelectionSchema,
  SCHEMA_VERSION as SELECTOR_SCHEMA_VERSION,
  type PageSelection,
  type SelectedPage,
  type UnselectedUrl,
} from "../src/selector/types.js";
import {
  MAX_VALIDATION_SAMPLES_PER_SITE,
  MIN_VALIDATION_FAMILY_SIZE,
  SiteObservationSchema,
  loadSiteSelection,
  observeSelectedPages,
  planSitePages,
} from "../src/multi-observer/index.js";
import { SCHEMA_VERSION as OBSERVER_SCHEMA_VERSION } from "../src/observer/types.js";

/**
 * Local deterministic fixture test for the Multi-page Observer (Task 09 §35–37).
 *
 * Two halves, because the orchestrator has two very different kinds of logic:
 *
 *  1. **Planning** — pure, no browser, no network. Page id determinism, input
 *     order independence, sampling policy, the per-site cap, and the fail-fast
 *     input validation are all exercised here, so the expensive half stays small.
 *
 *  2. **Orchestration** — a real Chromium against a tiny in-process HTTP server,
 *     to prove the property that actually matters: ONE page failing does not
 *     take the site run with it. The fixture site is deliberately mixed —
 *     working pages, a family with members to sample, an HTTP 500 page, and a
 *     URL whose connection is destroyed mid-request.
 *
 * No external network, no test framework, no AI.
 */

const HTML = (body: string, head = ""): string =>
  `<!doctype html><html><head><meta charset="utf-8">${head}</head><body>${body}</body></html>`;

const CHROME = "<header><nav><a href=/>Home</a><a href=/b>B</a></nav></header>";
const FOOT = "<footer><p>© fixture</p></footer>";
const shell = (main: string): string => HTML(`${CHROME}<main>${main}</main>${FOOT}`);
const paras = (n: number): string =>
  Array.from({ length: n }, (_, i) => `<p>Paragraph ${i} of this fixture page.</p>`).join("");

/**
 * The fixture site. `/a`, `/a2`, `/a3` are one family built from one template
 * with different content lengths — the shape Task 08 grouping produces — so the
 * validation comparison runs on a realistic representative/sample pair rather
 * than two identical documents.
 */
const PAGES: Record<string, string> = {
  "/": shell(`<section><h1>Home</h1><p>Fixture root.</p><ul><li><a href="/a">A</a></li><li><a href="/b">B</a></li></ul></section>`),
  "/a": shell(`<article><h1>Article A</h1>${paras(4)}<img src="/img.svg" alt="a"></article>`),
  "/a2": shell(`<article><h1>Article A2</h1>${paras(6)}<img src="/img.svg" alt="a2"></article>`),
  "/a3": shell(`<article><h1>Article A3</h1>${paras(5)}<img src="/img.svg" alt="a3"></article>`),
  "/b": shell(`<section><h1>B</h1><p>Another page.</p></section>`),
  /*
   * Task 26 generic correction — a page that lazy-mounts an element on the
   * first real scroll. With `--prepare-scroll` the deep observation sees the
   * mounted <aside>; the layout probe must mirror the same scroll or its walk
   * can never align with dom.json (the exact defect measured on a fresh
   * source whose homepage mounts content on scroll).
   */
  "/lazy": shell(
    `<section><h1>Lazy</h1>${paras(60)}</section>` +
      `<script>(function () {` +
      `var mounted = false;` +
      `window.addEventListener("scroll", function () {` +
      `if (mounted || window.scrollY < 100) return;` +
      `mounted = true;` +
      `var aside = document.createElement("aside");` +
      `aside.id = "lazy-mounted";` +
      `var p = document.createElement("p");` +
      `p.textContent = "Mounted by scroll.";` +
      `aside.appendChild(p);` +
      `var main = document.querySelector("main");` +
      `if (main) main.appendChild(aside);` +
      `}, { passive: true });` +
      `})();</script>`,
  ),
};

/** HTTP 500 — still a real HTML document Chromium renders (see §36 below). */
const SERVER_ERROR_BODY = HTML("<h1>Server error</h1><p>500.</p>");

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
    const url = (req.url || "/").split("?")[0];
    const page = PAGES[url];
    if (page) {
      res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
      res.end(page);
      return;
    }
    if (url === "/img.svg") {
      res.writeHead(200, { "content-type": "image/svg+xml" });
      res.end('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 8 8"><rect width="8" height="8"/></svg>');
      return;
    }
    if (url === "/server-error") {
      res.writeHead(500, { "content-type": "text/html; charset=utf-8" });
      res.end(SERVER_ERROR_BODY);
      return;
    }
    if (url === "/error") {
      // Destroy the socket without a response: Chromium reports a genuine
      // navigation failure (net::ERR_EMPTY_RESPONSE / ERR_CONNECTION_RESET),
      // which is what a page-level failure looks like in the wild.
      req.socket.destroy();
      return;
    }
    res.writeHead(404, { "content-type": "text/html; charset=utf-8" });
    res.end(HTML("<h1>Not found</h1>"));
  });
  return new Promise((resolve) => {
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      const port = typeof address === "object" && address ? address.port : 0;
      resolve({ server, port });
    });
  });
}

// ---------------------------------------------------------------------------
// Fixture selection builder — produces a REAL PageSelection (zod-validated), so
// the orchestrator is tested against the exact shape `pnpm select` writes.
// ---------------------------------------------------------------------------

interface FixtureFamily {
  familyId: string;
  representative: string;
  others?: string[];
  familyType?: SelectedPage["familyType"];
}

function buildSelection(rootUrl: string, families: FixtureFamily[]): PageSelection {
  const pages: SelectedPage[] = [];
  const unselected: UnselectedUrl[] = [];

  for (const family of families) {
    const others = family.others ?? [];
    const memberCount = 1 + others.length;
    pages.push({
      url: family.representative,
      familyId: family.familyId,
      familyType: family.familyType ?? (memberCount > 1 ? "sibling-pattern" : "singleton"),
      memberCount,
      reason: memberCount > 1 ? "representative-rule" : "sole-member",
      reasonDetail: "fixture",
    });
    for (const url of others) {
      unselected.push({
        url,
        familyId: family.familyId,
        representativeUrl: family.representative,
        reason: "represented-by-family",
      });
    }
  }

  const verifiedUrlCount = pages.length + unselected.length;
  const largest = Math.max(...pages.map((p) => p.memberCount));
  const selection: PageSelection = {
    schemaVersion: SELECTOR_SCHEMA_VERSION,
    rootUrl,
    sourceVerifiedUrlsFile: "fixture/verified-urls.json",
    sourceVerificationFile: "fixture/verification.json",
    selectedAt: "2026-08-13T00:00:00.000Z",
    verifiedUrlCount,
    familyCount: pages.length,
    selectedCount: pages.length,
    reductionCount: verifiedUrlCount - pages.length,
    reductionRate:
      verifiedUrlCount > 0
        ? Math.round(((verifiedUrlCount - pages.length) / verifiedUrlCount) * 10000) / 10000
        : 0,
    familyTypeCounts: {
      "content-duplicate": 0,
      "sibling-pattern": pages.filter((p) => p.familyType === "sibling-pattern").length,
      "scope-structure": 0,
      singleton: pages.filter((p) => p.familyType === "singleton").length,
    },
    largestFamilySize: largest,
    pages,
    unselected,
  };
  // Fail loudly here rather than letting a malformed fixture "pass" a test.
  return PageSelectionSchema.parse(selection);
}

// ---------------------------------------------------------------------------
// 1. Planning (pure — no browser, no network)
// ---------------------------------------------------------------------------

function testPlanning(): void {
  console.log("Page plan (pure)");

  const root = "https://plan.example";
  const selection = buildSelection(root, [
    { familyId: "f000001", representative: `${root}/` },
    { familyId: "f000002", representative: `${root}/a`, others: [`${root}/a2`, `${root}/a3`] },
    { familyId: "f000003", representative: `${root}/b` },
  ]);

  const plan = planSitePages(selection);
  const ids = plan.pages.map((p) => p.pageId);
  const urls = plan.pages.map((p) => p.url);

  check("page ids are a dense p000001… sequence", ids.join(",") === "p000001,p000002,p000003,p000004");
  check(
    "representatives are numbered in lexical URL order",
    urls.slice(0, 3).join(",") === [`${root}/`, `${root}/a`, `${root}/b`].join(","),
    urls.slice(0, 3).join(","),
  );
  check(
    "the validation sample is appended after every representative",
    plan.pages[3]?.role === "validation-sample" && plan.pages[3]?.url === `${root}/a2`,
    `${plan.pages[3]?.role} ${plan.pages[3]?.url}`,
  );
  check(
    "sample is the URL after the representative in lexical order",
    plan.validationSamples[0]?.sampleUrl === `${root}/a2`,
    plan.validationSamples[0]?.sampleUrl,
  );
  check(
    "sample carries family provenance",
    plan.validationSamples[0]?.familyId === "f000002" &&
      plan.validationSamples[0]?.familyMemberCount === 3 &&
      plan.validationSamples[0]?.representativePageId === "p000002",
  );
  check(
    "every page carries family provenance",
    plan.pages.every((p) => p.familyId !== "" && p.familyMemberCount >= 1),
  );

  // Determinism: shuffling the input file must not move a single id.
  const shuffled = PageSelectionSchema.parse({
    ...selection,
    pages: [...selection.pages].reverse(),
    unselected: [...selection.unselected].reverse(),
  });
  const shuffledPlan = planSitePages(shuffled);
  check(
    "determinism: reversed pages[] + unselected[] → identical plan",
    JSON.stringify(shuffledPlan) === JSON.stringify(plan),
  );

  // Singletons are never sampled.
  const singletonsOnly = buildSelection(root, [
    { familyId: "f000001", representative: `${root}/` },
    { familyId: "f000002", representative: `${root}/b` },
  ]);
  check(
    "singleton families produce no validation samples",
    planSitePages(singletonsOnly).validationSamples.length === 0,
  );

  // A 2-member family is below MIN_VALIDATION_FAMILY_SIZE.
  const pairFamily = buildSelection(root, [
    { familyId: "f000001", representative: `${root}/a`, others: [`${root}/a2`] },
  ]);
  check(
    `families smaller than ${MIN_VALIDATION_FAMILY_SIZE} are not sampled`,
    planSitePages(pairFamily).validationSamples.length === 0,
  );

  // The per-site cap: five eligible families, three samples.
  const manyFamilies = buildSelection(
    root,
    [1, 2, 3, 4, 5].map((n) => ({
      familyId: `f00000${n}`,
      representative: `${root}/f${n}/index`,
      others: [`${root}/f${n}/m2`, `${root}/f${n}/m3`, `${root}/f${n}/m4`],
    })),
  );
  const capped = planSitePages(manyFamilies);
  check(
    `at most ${MAX_VALIDATION_SAMPLES_PER_SITE} validation samples per site`,
    capped.validationSamples.length === MAX_VALIDATION_SAMPLES_PER_SITE,
    String(capped.validationSamples.length),
  );
  check(
    "families skipped by the cap are counted, not hidden",
    capped.samplingSkippedByCap === 2,
    String(capped.samplingSkippedByCap),
  );
  check(
    "cap keeps total pages = representatives + samples",
    capped.pages.length === 5 + MAX_VALIDATION_SAMPLES_PER_SITE,
    String(capped.pages.length),
  );

  // Largest family first, ties broken by familyId.
  const mixedSizes = buildSelection(root, [
    { familyId: "f000001", representative: `${root}/small`, others: [`${root}/small2`, `${root}/small3`] },
    {
      familyId: "f000002",
      representative: `${root}/big`,
      others: [`${root}/big2`, `${root}/big3`, `${root}/big4`, `${root}/big5`],
    },
    { familyId: "f000003", representative: `${root}/mid`, others: [`${root}/mid2`, `${root}/mid3`, `${root}/mid4`] },
  ]);
  const chosen = planSitePages(mixedSizes, { maxValidationSamples: 2 });
  check(
    "sampling prefers the largest families",
    chosen.validationSamples.map((s) => s.familyId).join(",") === "f000002,f000003",
    chosen.validationSamples.map((s) => s.familyId).join(","),
  );

  // Sampling can be turned off without renumbering a single representative.
  const noSamples = planSitePages(selection, { maxValidationSamples: 0 });
  check(
    "disabling sampling does not renumber representatives",
    noSamples.pages.map((p) => `${p.pageId}=${p.url}`).join(",") ===
      plan.pages
        .filter((p) => p.role === "representative")
        .map((p) => `${p.pageId}=${p.url}`)
        .join(","),
  );
}

// ---------------------------------------------------------------------------
// 2. Input validation (fail-fast, before any browser launches)
// ---------------------------------------------------------------------------

async function testInputValidation(): Promise<void> {
  console.log("");
  console.log("Input validation (fail-fast)");

  const root = "https://input.example";
  const valid = buildSelection(root, [
    { familyId: "f000001", representative: `${root}/` },
    { familyId: "f000002", representative: `${root}/a`, others: [`${root}/a2`] },
  ]);

  const dir = await mkdtemp(path.join(tmpdir(), "multi-observer-input-"));
  try {
    const write = async (name: string, value: unknown): Promise<string> => {
      const file = path.join(dir, name);
      await writeFile(file, JSON.stringify(value, null, 2), "utf8");
      return file;
    };

    const okFile = await write("selected-pages.json", valid);
    const loaded = await loadSiteSelection(okFile);
    check("a valid selection loads", loaded.selection.selectedCount === 2);
    check(
      "missing siblings are reported, not fatal",
      loaded.skippedChecks.length === 3 && loaded.families === undefined,
      String(loaded.skippedChecks.length),
    );

    const rejects = async (name: string, value: unknown): Promise<boolean> => {
      const file = await write(`bad-${name}.json`, value);
      try {
        await loadSiteSelection(file);
        return false;
      } catch {
        return true;
      }
    };

    check(
      "rejects a wrong schemaVersion",
      await rejects("schema-version", { ...valid, schemaVersion: 99 }),
    );
    check(
      "rejects selectedCount != pages.length",
      await rejects("selected-count", { ...valid, selectedCount: 5 }),
    );
    check(
      "rejects a duplicate familyId",
      await rejects("dup-family", {
        ...valid,
        pages: [valid.pages[0], { ...valid.pages[1], familyId: valid.pages[0].familyId }],
      }),
    );
    check(
      "rejects a duplicate selected URL",
      await rejects("dup-url", {
        ...valid,
        pages: [valid.pages[0], { ...valid.pages[1], url: valid.pages[0].url }],
      }),
    );
    check(
      "rejects an unselected URL naming an unknown family",
      await rejects("orphan-unselected", {
        ...valid,
        unselected: [{ ...valid.unselected[0], familyId: "f009999" }],
      }),
    );
    check(
      "rejects an unselected URL claiming the wrong representative",
      await rejects("wrong-representative", {
        ...valid,
        unselected: [{ ...valid.unselected[0], representativeUrl: `${root}/nope` }],
      }),
    );
    check(
      "rejects verifiedUrlCount that does not cover selected + unselected",
      await rejects("verified-count", { ...valid, verifiedUrlCount: 99 }),
    );
    check(
      "rejects memberCount that disagrees with the listed members",
      await rejects("member-count", {
        ...valid,
        pages: [valid.pages[0], { ...valid.pages[1], memberCount: 7 }],
        verifiedUrlCount: valid.verifiedUrlCount,
      }),
    );
    check("rejects an empty selection", await rejects("empty", {
      ...valid,
      pages: [],
      unselected: [],
      selectedCount: 0,
      familyCount: 0,
      verifiedUrlCount: 0,
      reductionCount: 0,
      largestFamilySize: 0,
      familyTypeCounts: {
        "content-duplicate": 0,
        "sibling-pattern": 0,
        "scope-structure": 0,
        singleton: 0,
      },
    }));

    // A sibling that IS present and disagrees must be fatal.
    await write("page-families.json", {
      schemaVersion: SELECTOR_SCHEMA_VERSION,
      rootUrl: "https://someone-else.example",
      sourceVerifiedUrlsFile: "fixture/verified-urls.json",
      sourceVerificationFile: "fixture/verification.json",
      builtAt: "2026-08-13T00:00:00.000Z",
      verifiedUrlCount: 3,
      familyCount: 2,
      familyTypeCounts: {
        "content-duplicate": 0,
        "sibling-pattern": 1,
        "scope-structure": 0,
        singleton: 1,
      },
      largestFamilySize: 2,
      families: [],
    });
    let siblingRejected = false;
    try {
      await loadSiteSelection(okFile);
    } catch {
      siblingRejected = true;
    }
    check("rejects a sibling page-families.json from another site", siblingRejected);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

// ---------------------------------------------------------------------------
// 3. Orchestration against a real browser + local server
// ---------------------------------------------------------------------------

async function testOrchestration(): Promise<void> {
  console.log("");
  console.log("Orchestration (real Chromium, local fixture server)");

  const { server, port } = await startServer();
  const root = `http://127.0.0.1:${port}`;
  let browser: Browser | undefined;
  let dir: string | undefined;

  try {
    // /a is a 3-member family (→ one validation sample); /error can never load;
    // /server-error is a real 500 the Observer can still render.
    const selection = buildSelection(root, [
      { familyId: "f000001", representative: `${root}/` },
      { familyId: "f000002", representative: `${root}/a`, others: [`${root}/a2`, `${root}/a3`] },
      { familyId: "f000003", representative: `${root}/b` },
      { familyId: "f000004", representative: `${root}/error` },
      { familyId: "f000005", representative: `${root}/server-error` },
    ]);

    dir = await mkdtemp(path.join(tmpdir(), "multi-observer-run-"));
    browser = await chromium.launch();

    const run = await observeSelectedPages(selection, {
      concurrency: 2,
      sourceSelectedPagesFile: "fixture/selected-pages.json",
      browser,
      runId: "fixture-run",
      runDir: dir,
    });
    const site = run.siteObservation;

    // --- failure isolation: the whole point of the fixture -----------------
    check(
      "6 pages attempted (5 representatives + 1 validation sample)",
      site.stats.requestedPages === 6,
      String(site.stats.requestedPages),
    );
    check("5 pages succeeded", site.stats.completedPages === 5, String(site.stats.completedPages));
    check("1 page failed", site.stats.failedPages === 1, String(site.stats.failedPages));
    check(
      "run status is completed-with-errors, not a thrown run",
      site.status === "completed-with-errors",
      site.status,
    );

    const failed = site.pages.filter((p) => p.status !== "success");
    check(
      "the failure is /error and is classified as a navigation error",
      failed.length === 1 &&
        failed[0].url === `${root}/error` &&
        failed[0].status === "navigation-error",
      failed.map((p) => `${p.url}=${p.status}`).join(","),
    );
    check(
      "the failed page records name/message/phase and no stack trace",
      Boolean(failed[0]?.error?.name && failed[0]?.error?.message) &&
        failed[0]?.error?.phase === "observe" &&
        !failed[0]?.error?.message.includes("\n    at "),
    );
    check(
      "the failed page has no artifact reference",
      failed[0]?.pageObservationFile === undefined && failed[0]?.bytes === undefined,
    );

    // §36 — the Observer does not know about HTTP status; a 500 page that
    // renders is observed like any other. Recorded here so the behaviour is a
    // documented fact rather than a surprise later.
    const serverError = site.pages.find((p) => p.url === `${root}/server-error`);
    check(
      "an HTTP 500 page that renders is still observed (Observer sees no status)",
      serverError?.status === "success",
      serverError?.status,
    );

    // --- deterministic ids / ordering --------------------------------------
    const ids = site.pages.map((p) => p.pageId);
    check(
      "manifest pages are sorted by pageId regardless of completion order",
      ids.join(",") === [...ids].sort().join(","),
      ids.join(","),
    );
    check(
      "page ids follow lexical URL order for representatives",
      site.pages
        .filter((p) => p.role === "representative")
        .map((p) => p.url)
        .join(",") ===
        [`${root}/`, `${root}/a`, `${root}/b`, `${root}/error`, `${root}/server-error`].join(","),
    );

    // --- artifacts: the Task 05 layout, unchanged --------------------------
    const successful = site.pages.filter((p) => p.status === "success");
    let artifactsOk = true;
    let relativeOnly = true;
    for (const page of successful) {
      const rel = page.pageObservationFile;
      if (!rel || path.isAbsolute(rel) || !rel.startsWith("pages/")) {
        relativeOnly = false;
        continue;
      }
      const observationPath = path.join(dir, rel);
      const observation = JSON.parse(await readFile(observationPath, "utf8"));
      for (const viewport of ["desktop", "mobile"] as const) {
        for (const file of [
          "rendered.html",
          "dom.json",
          "styles.json",
          "assets.json",
          "links.json",
          "frames.json",
          "screenshot.png",
        ]) {
          const filePath = path.join(dir, `pages/${page.pageId}/viewports/${viewport}/${file}`);
          const info = await stat(filePath).catch(() => undefined);
          if (!info || info.size === 0) {
            artifactsOk = false;
            console.log(`        missing/empty: ${page.pageId}/${viewport}/${file}`);
          }
        }
        // Task 04/05 invariant, re-checked through the multi-page path: every
        // styleId in dom.json resolves in that viewport's styles.json.
        const dom = JSON.parse(
          await readFile(path.join(dir, `pages/${page.pageId}/viewports/${viewport}/dom.json`), "utf8"),
        ) as { styleId: string; pseudo?: { before?: { styleId: string }; after?: { styleId: string } } }[];
        const styles = JSON.parse(
          await readFile(path.join(dir, `pages/${page.pageId}/viewports/${viewport}/styles.json`), "utf8"),
        ) as Record<string, unknown>;
        const dangling = dom.filter(
          (e) =>
            !(e.styleId in styles) ||
            (e.pseudo?.before && !(e.pseudo.before.styleId in styles)) ||
            (e.pseudo?.after && !(e.pseudo.after.styleId in styles)),
        ).length;
        if (dangling > 0) {
          artifactsOk = false;
          console.log(`        dangling styleIds: ${page.pageId}/${viewport} = ${dangling}`);
        }
      }
      // A fresh run must write the CURRENT observation schema. (Reading older
      // versions is a separate, deliberately permissive policy — Task 16 §15.)
      if (observation.schemaVersion !== OBSERVER_SCHEMA_VERSION) artifactsOk = false;
      if (observation.viewports.desktop.files.dom !== "viewports/desktop/dom.json") {
        relativeOnly = false;
      }
    }
    check("every successful page has both viewports fully persisted", artifactsOk);
    check("artifact paths are relative to the run directory", relativeOnly);
    check(
      "each page directory keeps the Task 05 single-page layout (schema v3)",
      successful.length === 5,
      String(successful.length),
    );

    // --- validation sampling ------------------------------------------------
    check(
      "one validation sample was taken (only f000002 qualifies)",
      site.validationSamples.length === 1,
      String(site.validationSamples.length),
    );
    const sample = site.validationSamples[0];
    check(
      "the sample pairs /a with /a2",
      sample?.representativeUrl === `${root}/a` && sample?.sampleUrl === `${root}/a2`,
      `${sample?.representativeUrl} vs ${sample?.sampleUrl}`,
    );
    check(
      "the sampled page is stored with role validation-sample",
      site.pages.find((p) => p.pageId === sample?.samplePageId)?.role === "validation-sample",
    );
    check(
      "the comparison is present and covers both viewports",
      Boolean(sample?.comparison?.desktop && sample?.comparison?.mobile),
    );
    check(
      "comparison ratios are finite measurements, not a verdict",
      Boolean(sample?.comparison) &&
        Object.values(sample.comparison!.desktop).every((v) => Number.isFinite(v)) &&
        !("representative" in (sample.comparison as object)),
    );
    check(
      "/a2 has more elements than /a (the fixture's real difference is measured)",
      (sample?.comparison?.desktop.elementCountRatio ?? 0) > 1,
      String(sample?.comparison?.desktop.elementCountRatio),
    );

    // --- coverage & stats ---------------------------------------------------
    const c = site.coverage;
    check("coverage: 7 verified URLs", c.fullObservationPageCount === 7, String(c.fullObservationPageCount));
    check("coverage: 5 families", c.familyCount === 5, String(c.familyCount));
    check(
      "coverage: 4 representatives observed (the failed one is not claimed)",
      c.observedRepresentativeCount === 4,
      String(c.observedRepresentativeCount),
    );
    check(
      "coverage: 6 verified URLs represented (3+1+1+1, /error excluded)",
      c.representedVerifiedUrlCount === 6,
      String(c.representedVerifiedUrlCount),
    );
    check(
      "coverage: reduction counts the validation sample as a real cost",
      c.totalObservedPageCount === 6 && c.observationReductionCount === 1,
      `${c.totalObservedPageCount}/${c.observationReductionCount}`,
    );

    const s = site.stats;
    check(
      "stats: desktop + mobile observation counts match successes",
      s.desktopObservations === 5 && s.mobileObservations === 5,
    );
    check(
      "stats: byte totals are consistent (screenshots + json/html = page bytes)",
      s.screenshotBytes + s.jsonHtmlBytes === s.pageBytes && s.pageBytes > 0,
    );
    check(
      "stats: average page size is the measured mean",
      s.averageBytesPerObservedPage === Math.round(s.pageBytes / s.completedPages),
    );
    check(
      "stats: per-page timestamps differ (no atomic-snapshot claim)",
      new Set(successful.map((p) => p.startedAt)).size > 1,
    );

    // --- persisted manifest: zod round-trip + real byte size ---------------
    const raw = await readFile(run.manifestPath, "utf8");
    const reloaded = SiteObservationSchema.safeParse(JSON.parse(raw));
    check("site-observation.json passes Zod after reload", reloaded.success);
    check(
      "the manifest records its own true byte size",
      reloaded.success &&
        reloaded.data.stats.siteObservationJsonBytes === Buffer.byteLength(raw, "utf8"),
    );
    check(
      "the manifest embeds no DOM/style bulk data",
      !raw.includes('"styleId"') && !raw.includes('"boundingBox"'),
    );
    check(
      "the manifest holds no absolute local path",
      !raw.includes(dir) && !raw.includes("/Users/"),
    );
  } finally {
    if (browser) await browser.close();
    server.close();
    if (dir) await rm(dir, { recursive: true, force: true });
  }
}

// ---------------------------------------------------------------------------
// 4. Prepare-scroll ↔ layout-probe parity (Task 26 generic correction)
// ---------------------------------------------------------------------------

async function testPrepareScrollProbeParity(): Promise<void> {
  console.log("");
  console.log("Prepare-scroll ↔ layout-probe parity (real Chromium, /lazy fixture)");

  const { server, port } = await startServer();
  const root = `http://127.0.0.1:${port}`;
  let browser: Browser | undefined;
  let dir: string | undefined;

  try {
    const selection = buildSelection(root, [
      { familyId: "f000001", representative: `${root}/lazy` },
    ]);
    dir = await mkdtemp(path.join(tmpdir(), "multi-observer-lazy-"));
    browser = await chromium.launch();

    const run = await observeSelectedPages(selection, {
      concurrency: 1,
      prepareScroll: true,
      sourceSelectedPagesFile: "fixture/selected-pages.json",
      browser,
      runId: "fixture-lazy-run",
      runDir: dir,
    });
    const page = run.siteObservation.pages[0]!;
    check("the lazy page observed successfully", page.status === "success", page.status);

    const dom = JSON.parse(
      await readFile(
        path.join(dir, `pages/${page.pageId}/viewports/desktop/dom.json`),
        "utf8",
      ),
    ) as { tagName: string }[];
    const domTags = dom.map((e) => e.tagName.toLowerCase());
    check(
      "prepare-scroll mounted the lazy element into the deep observation",
      domTags.includes("aside"),
    );

    const probe = JSON.parse(
      await readFile(path.join(dir, `pages/${page.pageId}/layout-probe.json`), "utf8"),
    ) as { tags: string[] };
    const probeTags = probe.tags.map((t) => t.toLowerCase());
    check(
      "…and into the layout probe (the probe mirrors the observation's scroll)",
      probeTags.includes("aside"),
    );
    check(
      "…so the probe walk aligns with dom.json exactly",
      probeTags.length === domTags.length &&
        probeTags.every((tag, i) => tag === domTags[i]),
      `probe ${probeTags.length} tag(s) vs dom ${domTags.length}`,
    );
  } finally {
    if (browser) await browser.close();
    server.close();
    if (dir) await rm(dir, { recursive: true, force: true });
  }
}

async function main(): Promise<void> {
  console.log("[smoke:multi-observer] Task 09 — multi-page deep observation");
  console.log("");

  testPlanning();
  await testInputValidation();
  await testOrchestration();
  await testPrepareScrollProbeParity();

  console.log("");
  console.log(`${checks - failures}/${checks} checks passed`);
  if (failures > 0) {
    console.error(`[smoke:multi-observer] FAILED — ${failures} check(s) failed`);
    process.exitCode = 1;
  } else {
    console.log("[smoke:multi-observer] OK");
  }
}

main().catch((err) => {
  console.error(
    "[smoke:multi-observer] ERROR —",
    err instanceof Error ? err.message : err,
  );
  process.exitCode = 1;
});
