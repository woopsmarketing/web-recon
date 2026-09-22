/**
 * Step 4.1 visual smoke: exercise the interior-01 portfolio FILTER UI (search,
 * type/area/style/price chips, sort, reset, pagination-while-filtered, direct
 * query-string loads, back/forward) against already-BUILT static site packages.
 * Does NOT build anything — it only reads `data/site-builds/<site>/current.json`
 * to find each site's current package and serves it from a local nginx-`try_files`
 * -style static server, exactly like scripts/template-platform-step4-visual-smoke.ts
 * (read separately; this file is self-contained and does not import it).
 *
 * The one thing this script imports from the product is the pure filter module
 * `platform/content/project-filter.ts` (`evaluateProjectFilter`, `normalizeProjectFilter`,
 * `pageOfResults`): the built page embeds its compact project index + vocabulary in the
 * Next.js flight payload, and this script re-derives the SAME evaluator's expected
 * result (ids + total) in Node, then asserts the browser's DOM matches it. That is the
 * proof that the client UI is driven by the shared evaluator rather than a second,
 * drifted implementation.
 *
 *   tsx scripts/template-platform-step41-visual-smoke.ts [outDir] [--root <dir>]
 *
 * `--root` defaults to cwd; `outDir` (screenshots + summary.json) defaults to
 * docs/result/recon-template-platform-step4-1-filters/screens, resolved relative to cwd.
 */
import { createReadStream } from "node:fs";
import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import http from "node:http";
import type { AddressInfo } from "node:net";
import path from "node:path";
import { chromium, type Browser, type BrowserContext, type Page } from "playwright";
import {
  evaluateProjectFilter,
  normalizeProjectFilter,
  pageOfResults,
  type ProjectFilterInput,
  type ProjectFilterRecord,
  type ProjectFilterVocabulary,
} from "../platform/content/project-filter.js";

const PAGE_SIZE = 30;

// ---------------------------------------------------------------- CLI args
const argv = process.argv.slice(2);
let rootArg = process.cwd();
let outDirArg: string | undefined;
for (let i = 0; i < argv.length; i++) {
  if (argv[i] === "--root") rootArg = argv[++i] ?? rootArg;
  else if (outDirArg === undefined) outDirArg = argv[i];
}
const root = path.resolve(rootArg);
const outDir = path.resolve(outDirArg ?? "docs/result/recon-template-platform-step4-1-filters/screens");

// ---------------------------------------------------------- static server
// nginx try_files semantics: $uri (must be a FILE, not a dir) -> $uri.html ->
// $uri/index.html -> else 404 (served with 404.html's body).
const TYPES: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".avif": "image/avif",
  ".ico": "image/x-icon",
  ".txt": "text/plain; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".xml": "application/xml; charset=utf-8",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
};

async function isFile(p: string): Promise<boolean> {
  const st = await stat(p).catch(() => undefined);
  return !!st && st.isFile();
}

function withinRoot(rootDir: string, file: string): boolean {
  const rel = path.relative(rootDir, file);
  return rel === "" || (!rel.startsWith("..") && !path.isAbsolute(rel));
}

async function resolveStaticFile(rootDir: string, rawPathname: string): Promise<string | undefined> {
  const decoded = decodeURIComponent(rawPathname);
  const candidates = [decoded];
  if (!decoded.endsWith("/")) candidates.push(`${decoded}.html`);
  candidates.push(decoded.endsWith("/") ? `${decoded}index.html` : `${decoded}/index.html`);
  for (const candidate of candidates) {
    const file = path.join(rootDir, candidate);
    if (!withinRoot(rootDir, file)) continue;
    if (await isFile(file)) return file;
  }
  return undefined;
}

function serveStatic(siteRoot: string): Promise<http.Server> {
  const server = http.createServer((req, res) => {
    void (async () => {
      const url = new URL(req.url ?? "/", "http://x");
      const resolved = await resolveStaticFile(siteRoot, url.pathname);
      if (!resolved) {
        const notFound = path.join(siteRoot, "404.html");
        res.writeHead(404, { "content-type": "text/html; charset=utf-8" });
        if (await isFile(notFound)) createReadStream(notFound).pipe(res);
        else res.end("Not Found");
        return;
      }
      res.writeHead(200, { "content-type": TYPES[path.extname(resolved)] ?? "application/octet-stream" });
      createReadStream(resolved).pipe(res);
    })().catch(() => {
      if (!res.headersSent) res.writeHead(500);
      res.end();
    });
  });
  return new Promise((resolve) => server.listen(0, "127.0.0.1", () => resolve(server)));
}

// ------------------------------------------------------------------ data
async function loadPackageRoot(rootDir: string, site: string): Promise<string> {
  const ptrPath = path.join(rootDir, "data/site-builds", site, "current.json");
  const ptr = JSON.parse(await readFile(ptrPath, "utf8")) as { packageDir: string };
  return path.join(rootDir, ptr.packageDir, "site");
}

/**
 * Bracket-match a JSON object starting at `text[startIdx]` (must be `{`), string-aware
 * (braces inside quoted strings are ignored). Returns the raw substring.
 */
function extractJsonObject(text: string, startIdx: number): string {
  let depth = 0;
  let inString = false;
  let escape = false;
  for (let i = startIdx; i < text.length; i++) {
    const c = text[i];
    if (inString) {
      if (escape) escape = false;
      else if (c === "\\") escape = true;
      else if (c === '"') inString = false;
      continue;
    }
    if (c === '"') {
      inString = true;
      continue;
    }
    if (c === "{") depth++;
    else if (c === "}") {
      depth--;
      if (depth === 0) return text.slice(startIdx, i + 1);
    }
  }
  throw new Error(`unterminated JSON object starting at ${startIdx}`);
}

interface FilterData {
  entries: ProjectFilterRecord[];
  vocabulary: ProjectFilterVocabulary;
  labels: Record<string, unknown>;
  noindexFiltered: boolean;
}

/**
 * Extract the ProjectFilter payload (entries/vocabulary/labels/noindexFiltered) from a
 * built portfolio.html: concatenate every `self.__next_f.push([1, "..."])` flight chunk,
 * then bracket-match the `{"entries":[...` object.
 */
function extractFilterData(html: string): FilterData {
  let flight = "";
  for (const m of html.matchAll(/<script>self\.__next_f\.push\((\[[\s\S]*?\])\)<\/script>/g)) {
    const chunk = JSON.parse(m[1]!) as [number, string];
    if (chunk[0] === 1) flight += chunk[1];
  }
  const idx = flight.indexOf('{"entries":[');
  if (idx < 0) throw new Error("could not find filter payload ({\"entries\":[) in flight data");
  return JSON.parse(extractJsonObject(flight, idx)) as FilterData;
}

async function loadFilterData(pkgRoot: string, route = "portfolio.html"): Promise<FilterData> {
  const html = await readFile(path.join(pkgRoot, route), "utf8");
  return extractFilterData(html);
}

/** The evaluator's expected ids (DOM order) + total for one page of one filter input. */
function expectedPage(data: FilterData, input: ProjectFilterInput, page: number): { ids: string[]; total: number } {
  const filter = normalizeProjectFilter(input, data.vocabulary);
  const results = evaluateProjectFilter(data.entries, filter, data.vocabulary);
  const { items, total } = pageOfResults(results, page, PAGE_SIZE);
  return { ids: items.map((r: ProjectFilterRecord) => r.id), total };
}

/** Pick a type id whose unfiltered result count exceeds one page (so pagination-while-filtered is exercised). */
function pickMultiPageType(data: FilterData): string {
  for (const t of data.vocabulary.types) {
    const { total } = expectedPage(data, { type: [t.id] }, 1);
    if (total > PAGE_SIZE) return t.id;
  }
  return data.vocabulary.types[0]!.id;
}

/** Pick a non-empty type+area+style combo (prefers the largest match). */
function pickCombo(data: FilterData): { type: string; area: string; style: string; total: number } {
  let best: { type: string; area: string; style: string; total: number } | undefined;
  for (const t of data.vocabulary.types) {
    for (const a of data.vocabulary.area?.buckets ?? []) {
      for (const s of data.vocabulary.styles) {
        const { total } = expectedPage(data, { type: [t.id], area: [a.id], style: [s] }, 1);
        if (total > 0 && (!best || total > best.total)) best = { type: t.id, area: a.id, style: s, total };
      }
    }
  }
  if (!best) throw new Error("no non-empty type+area+style combo found");
  return best;
}

/** Most frequent `location` among entries (used as the keyword-search probe term). */
function pickKeyword(data: FilterData): string {
  const freq = new Map<string, number>();
  for (const e of data.entries) if (e.location) freq.set(e.location, (freq.get(e.location) ?? 0) + 1);
  const [top] = [...freq.entries()].sort((a, b) => b[1] - a[1]);
  if (!top) throw new Error("no entries with a location to search for");
  return top[0];
}

// -------------------------------------------------------------- viewports
type ViewportName = "desktop-1440" | "tablet-1000" | "mobile-390";
const VIEWPORTS: Record<ViewportName, { width: number; height: number; deviceScaleFactor: number; isMobile: boolean }> = {
  "desktop-1440": { width: 1440, height: 900, deviceScaleFactor: 1, isMobile: false },
  "tablet-1000": { width: 1000, height: 800, deviceScaleFactor: 1, isMobile: false },
  "mobile-390": { width: 390, height: 844, deviceScaleFactor: 2, isMobile: true },
};

// ---------------------------------------------------------------- checks
interface CheckResult {
  name: string;
  pass: boolean;
  detail?: string;
}
interface VisitRow {
  site: string;
  route: string;
  viewport: string;
  screenshots: string[];
  checks: CheckResult[];
}
const rows: VisitRow[] = [];

function truncate(s: string, n = 300): string {
  return s.length > n ? `${s.slice(0, n)}…` : s;
}

// --------------------------------------------------------------- session
interface Session {
  page: Page;
  ctx: BrowserContext;
  site: string;
  route: string;
  viewport: ViewportName;
  origin: string;
  checks: CheckResult[];
  screenshots: string[];
  consoleErrors: string[];
  pageErrors: string[];
  nonLocalRequests: string[];
  subresourceErrors: string[];
  documentRequests: number;
  status: number | undefined;
}

function check(s: Session, name: string, pass: boolean, detail?: string): boolean {
  s.checks.push({ name, pass, detail });
  if (!pass) console.log(`     FAIL ${s.site} ${s.route} ${s.viewport} :: ${name}${detail ? ` — ${truncate(detail)}` : ""}`);
  return pass;
}

async function beginSession(browser: Browser, site: string, origin: string, route: string, vpName: ViewportName): Promise<Session> {
  const vp = VIEWPORTS[vpName];
  const ctx = await browser.newContext({
    viewport: { width: vp.width, height: vp.height },
    deviceScaleFactor: vp.deviceScaleFactor,
    isMobile: vp.isMobile,
    hasTouch: vp.isMobile,
  });
  const page = await ctx.newPage();
  // tsx/esbuild wraps named inner functions with __name(); give evaluated code a no-op shim.
  await ctx.addInitScript("window.__name = (f) => f;");

  const s: Session = {
    page,
    ctx,
    site,
    route,
    viewport: vpName,
    origin,
    checks: [],
    screenshots: [],
    consoleErrors: [],
    pageErrors: [],
    nonLocalRequests: [],
    subresourceErrors: [],
    documentRequests: 0,
    status: undefined,
  };

  page.on("console", (m) => {
    if (m.type() === "error") s.consoleErrors.push(truncate(m.text()));
  });
  page.on("pageerror", (e) => s.pageErrors.push(truncate(e.message)));
  page.on("request", (r) => {
    if (r.resourceType() === "document") s.documentRequests++;
  });
  page.on("response", (r) => {
    const status = r.status();
    if (status < 400) return;
    let isMainNav = false;
    try {
      isMainNav = r.request().isNavigationRequest() && r.frame() === page.mainFrame();
    } catch {
      isMainNav = false;
    }
    if (!isMainNav) s.subresourceErrors.push(`${status}: ${r.url()}`);
  });
  await page.route("**/*", (rt) => {
    let hostname = "";
    try {
      hostname = new URL(rt.request().url()).hostname;
    } catch {
      hostname = "";
    }
    if (hostname && hostname !== "127.0.0.1") {
      s.nonLocalRequests.push(rt.request().url());
      void rt.abort();
    } else {
      void rt.continue();
    }
  });

  const resp = await page.goto(`${origin}${route}`, { waitUntil: "networkidle" }).catch(() => undefined);
  s.status = resp?.status();
  return s;
}

/** Overflow + broken-image checks; callable more than once per session (e.g. re-check after opening the mobile panel). */
async function checkOverflowAndImages(s: Session, label: string): Promise<void> {
  // Scroll through to trigger lazy-loaded card images, then settle back at the top so
  // the overflow measurement below reflects the page's resting state.
  await s.page
    .evaluate(async () => {
      for (let y = 0; y < document.body.scrollHeight; y += 400) {
        window.scrollTo(0, y);
        await new Promise((r) => setTimeout(r, 20));
      }
      window.scrollTo(0, 0);
    })
    .catch(() => {});
  await s.page.waitForLoadState("networkidle").catch(() => {});

  const overflow = await s.page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1).catch(() => false);
  check(s, `no-horizontal-overflow:${label}`, !overflow);

  const brokenVisible: string[] = await s.page
    .evaluate(() => {
      const isVisible = (img: HTMLImageElement): boolean => {
        const anyImg = img as unknown as { checkVisibility?: () => boolean };
        if (typeof anyImg.checkVisibility === "function" && !anyImg.checkVisibility()) return false;
        const r = img.getBoundingClientRect();
        if (r.width <= 0 || r.height <= 0) return false;
        if (r.right <= 0 || r.left >= window.innerWidth) return false;
        return true;
      };
      return Array.from(document.images)
        .filter((img) => isVisible(img) && !(img.complete && img.naturalWidth > 0))
        .map((img) => img.currentSrc || img.src);
    })
    .catch(() => []);
  check(s, `no-broken-images-visible:${label}`, brokenVisible.length === 0, brokenVisible.join(", "));

  const allSrcs: string[] = await s.page.evaluate(() => Array.from(document.images).map((img) => img.currentSrc || img.src)).catch(() => []);
  const uniqueSrcs = Array.from(new Set(allSrcs));
  if (uniqueSrcs.length > 0) {
    const fetchResults: { src: string; status: number }[] = await s.page
      .evaluate(async (list: string[]) => {
        const out: { src: string; status: number }[] = [];
        for (const src of list) {
          if (src.startsWith("data:")) {
            out.push({ src, status: 200 });
            continue;
          }
          try {
            const r = await fetch(src);
            out.push({ src, status: r.status });
          } catch {
            out.push({ src, status: -1 });
          }
        }
        return out;
      }, uniqueSrcs)
      .catch(() => []);
    const broken = fetchResults.filter((r) => r.status !== 200);
    check(s, `no-broken-images-fetch:${label}`, broken.length === 0, broken.map((r) => `${r.status}: ${r.src}`).join(", "));
  } else {
    check(s, `no-broken-images-fetch:${label}`, true);
  }
}

/** The "every visit" checks: nav status, console/page errors, non-local requests, subresources, overflow/images. */
async function runCommonChecks(s: Session): Promise<void> {
  check(s, "status-200", s.status === 200, `status=${s.status}`);
  await checkOverflowAndImages(s, "initial");
  check(s, "no-console-errors", s.consoleErrors.length === 0, s.consoleErrors.join(" | "));
  check(s, "no-page-errors", s.pageErrors.length === 0, s.pageErrors.join(" | "));
  check(s, "no-nonlocal-requests", s.nonLocalRequests.length === 0, s.nonLocalRequests.join(" | "));
  check(s, "no-subresource-errors", s.subresourceErrors.length === 0, s.subresourceErrors.join(" | "));
}

/** Final cross-cutting recheck, called right before finishSession (console/page errors accumulate for the WHOLE session). */
async function runFinalChecks(s: Session): Promise<void> {
  check(s, "no-console-errors:final", s.consoleErrors.length === 0, s.consoleErrors.join(" | "));
  check(s, "no-page-errors:final", s.pageErrors.length === 0, s.pageErrors.join(" | "));
  check(s, "no-nonlocal-requests:final", s.nonLocalRequests.length === 0, s.nonLocalRequests.join(" | "));
  check(s, "no-subresource-errors:final", s.subresourceErrors.length === 0, s.subresourceErrors.join(" | "));
}

async function screenshot(s: Session, name: string): Promise<void> {
  const file = `${s.site}--${name}--${s.viewport}.png`;
  const filePath = path.join(outDir, file);
  await s.page.screenshot({ path: filePath, fullPage: true }).catch((e) => check(s, `screenshot:${name}`, false, String(e)));
  s.screenshots.push(path.relative(process.cwd(), filePath));
}

async function finishSession(s: Session): Promise<void> {
  await runFinalChecks(s);
  const row: VisitRow = { site: s.site, route: s.route, viewport: s.viewport, screenshots: s.screenshots, checks: s.checks };
  rows.push(row);
  const failed = row.checks.filter((c) => !c.pass);
  console.log(`${failed.length === 0 ? "ok  " : "FAIL"} ${s.site} ${s.route} ${s.viewport} — ${row.checks.length - failed.length}/${row.checks.length} checks`);
  await s.ctx.close();
}

/** Minimal visit for "just HTTP status of a navigation" cases (expected 404s). */
async function quickStatusCheck(browser: Browser, site: string, origin: string, route: string, expected: number, vpName: ViewportName = "desktop-1440"): Promise<void> {
  const vp = VIEWPORTS[vpName];
  const ctx = await browser.newContext({ viewport: { width: vp.width, height: vp.height } });
  const page = await ctx.newPage();
  const resp = await page.goto(`${origin}${route}`, { waitUntil: "load" }).catch(() => undefined);
  const status = resp?.status();
  await ctx.close();
  const pass = status === expected;
  const row: VisitRow = { site, route, viewport: vpName, screenshots: [], checks: [{ name: `status-${expected}`, pass, detail: `status=${status}` }] };
  rows.push(row);
  console.log(`${pass ? "ok  " : "FAIL"} ${site} ${route} ${vpName} — status=${status} (expected ${expected})`);
}

// ---------------------------------------------------------- filter helpers
interface FilterUiState {
  url: string;
  count: string | null;
  cardIds: string[];
  filtered: string | null;
  robots: string | null;
  fp: string | null;
  resetVisible: boolean;
  emptyVisible: boolean;
  pagerVisible: boolean;
}

async function readFilterState(page: Page): Promise<FilterUiState> {
  return page.evaluate(() => {
    const u = new URL(location.href);
    return {
      url: u.pathname + u.search,
      count: document.querySelector("[data-result-count]")?.getAttribute("data-result-count") ?? null,
      cardIds: Array.from(document.querySelectorAll("[data-project-card]")).map((el) => el.getAttribute("data-project-card") ?? ""),
      filtered: document.querySelector("[data-filtered]")?.getAttribute("data-filtered") ?? null,
      robots: document.head.querySelector('meta[name="robots"]')?.getAttribute("content") ?? null,
      fp: document.querySelector("[data-filter-page]")?.getAttribute("data-filter-page") ?? null,
      resetVisible: !!document.querySelector(".i1-pfilter__reset"),
      emptyVisible: !!document.querySelector("[data-filter-empty]"),
      pagerVisible: !!document.querySelector("nav[data-pager]"),
    };
  });
}

/** Assert the DOM matches the evaluator's expected ids (order) + total for one page of `input`. */
async function assertParity(s: Session, data: FilterData, input: ProjectFilterInput, page: number, label: string): Promise<FilterUiState> {
  const expected = expectedPage(data, input, page);
  const actual = await readFilterState(s.page);
  check(s, `parity-count:${label}`, actual.count === String(expected.total), `expected ${expected.total} got ${actual.count}`);
  check(
    s,
    `parity-ids:${label}`,
    JSON.stringify(actual.cardIds) === JSON.stringify(expected.ids),
    `expected [${expected.ids.join(",")}] got [${actual.cardIds.join(",")}]`,
  );
  return actual;
}

function escapeAttr(v: string): string {
  return v.replace(/"/g, '\\"');
}

async function clickChip(page: Page, group: string, value: string): Promise<void> {
  await page.locator(`fieldset[data-filter-group="${group}"] label.i1-chip:has(input[value="${escapeAttr(value)}"])`).click();
}

async function isChipChecked(page: Page, group: string, value: string): Promise<boolean> {
  return page.locator(`fieldset[data-filter-group="${group}"] input[value="${escapeAttr(value)}"]`).isChecked();
}

/** Toggle behaviour: hidden ≥ breakpoint (panel always visible), a real disclosure button below it. */
async function checkToggleBehaviour(s: Session): Promise<void> {
  const toggleDisplay = await s.page.locator(".i1-pfilter__toggle").evaluate((el) => getComputedStyle(el).display);
  const panelVisibleBefore = await s.page.locator(".i1-pfilter__panel").isVisible();
  // Authored band: inline panel ≥ 900 px, disclosure toggle below (template.css).
  const width = s.page.viewportSize()!.width;
  if (width >= 900) {
    check(s, "toggle-hidden-panel-always-visible", toggleDisplay === "none" && panelVisibleBefore, `width=${width} toggle=${toggleDisplay} panel visible=${panelVisibleBefore}`);
    return;
  }
  check(s, "toggle-visible", toggleDisplay !== "none" && !panelVisibleBefore, `width=${width} display=${toggleDisplay} panel visible before=${panelVisibleBefore}`);
  const expandedBefore = await s.page.locator(".i1-pfilter__toggle").getAttribute("aria-expanded");
  check(s, "toggle-initially-collapsed", expandedBefore === "false", `aria-expanded=${expandedBefore}`);
  await s.page.locator(".i1-pfilter__toggle").click();
  await s.page.waitForTimeout(150);
  const expandedAfterOpen = await s.page.locator(".i1-pfilter__toggle").getAttribute("aria-expanded");
  const panelVisibleAfterOpen = await s.page.locator(".i1-pfilter__panel").isVisible();
  check(s, "toggle-expands-and-shows-panel", expandedAfterOpen === "true" && panelVisibleAfterOpen, `aria-expanded=${expandedAfterOpen} panelVisible=${panelVisibleAfterOpen}`);
  await checkOverflowAndImages(s, "panel-open");
}

async function closeMobilePanelIfOpen(s: Session): Promise<void> {
  const toggleDisplay = await s.page.locator(".i1-pfilter__toggle").evaluate((el) => getComputedStyle(el).display);
  if (toggleDisplay === "none") return;
  const expanded = await s.page.locator(".i1-pfilter__toggle").getAttribute("aria-expanded");
  if (expanded === "true") {
    await s.page.locator(".i1-pfilter__toggle").click();
    await s.page.waitForTimeout(150);
    const expandedAfter = await s.page.locator(".i1-pfilter__toggle").getAttribute("aria-expanded");
    check(s, "toggle-collapses-again", expandedAfter === "false", `aria-expanded=${expandedAfter}`);
  }
}

// ----------------------------------------------------------------- visits

/** fixture-large /portfolio baseline (unfiltered) + toggle behaviour, common to all three viewports. */
async function baselineAndToggle(s: Session, data: FilterData, expectedTotal: number): Promise<void> {
  await runCommonChecks(s);
  const st = await readFilterState(s.page);
  check(s, "unfiltered-count", st.count === String(expectedTotal), `expected ${expectedTotal} got ${st.count}`);
  check(s, "unfiltered-cards", st.cardIds.length === Math.min(PAGE_SIZE, expectedTotal), `expected ${Math.min(PAGE_SIZE, expectedTotal)} got ${st.cardIds.length}`);
  check(s, "unfiltered-no-robots-meta", st.robots === null, `robots=${st.robots}`);
  const expected = expectedPage(data, {}, 1);
  check(s, "unfiltered-parity", JSON.stringify(st.cardIds) === JSON.stringify(expected.ids), "unfiltered card order must match the default (newest) evaluator order");
  await screenshot(s, "portfolio-unfiltered");
  await checkToggleBehaviour(s);
}

/** The full interaction sequence (items 1–10 of the spec), run at desktop-1440 on fixture-large. */
async function fullInteractionSequence(s: Session, data: FilterData): Promise<void> {
  const keyword = pickKeyword(data);
  const multiPageType = pickMultiPageType(data);
  const combo = pickCombo(data);

  // 1. search
  await s.page.fill('input[type=search][name=keyword]', keyword);
  await s.page.waitForTimeout(200);
  await assertParity(s, data, { keyword }, 1, "search");
  const urlAfterSearch = await readFilterState(s.page);
  check(s, "search-url-has-keyword", new URL(s.origin + urlAfterSearch.url).searchParams.get("keyword") === keyword, urlAfterSearch.url);
  await s.page.fill('input[type=search][name=keyword]', "");
  await s.page.waitForTimeout(200);

  // 2. single chip (type) with >30 matches -> filtered pagination
  await clickChip(s.page, "type", multiPageType);
  await s.page.waitForTimeout(200);
  let st = await assertParity(s, data, { type: [multiPageType] }, 1, "type-chip-p1");
  check(s, "type-chip-url", new URL(s.origin + st.url).searchParams.get("type") === multiPageType, st.url);
  await s.page.locator('[data-page="2"]').first().click();
  await s.page.waitForTimeout(200);
  st = await assertParity(s, data, { type: [multiPageType] }, 2, "type-chip-p2");
  check(s, "type-chip-p2-url-has-fp2", new URL(s.origin + st.url).searchParams.get("fp") === "2", st.url);
  await s.page.locator('a[data-page-step="prev"]').click();
  await s.page.waitForTimeout(200);
  st = await assertParity(s, data, { type: [multiPageType] }, 1, "type-chip-prev");
  check(s, "type-chip-prev-url-drops-fp", new URL(s.origin + st.url).searchParams.get("fp") === null, st.url);

  // 5. active filter change while on fp=2 resets to page 1 (fp removed from URL)
  await s.page.locator('[data-page="2"]').first().click();
  await s.page.waitForTimeout(200);
  st = await readFilterState(s.page);
  check(s, "fp2-before-second-filter", new URL(s.origin + st.url).searchParams.get("fp") === "2", st.url);
  await clickChip(s.page, "area", combo.area);
  await s.page.waitForTimeout(200);
  st = await assertParity(s, data, { type: [multiPageType], area: [combo.area] }, 1, "filter-change-resets-page");
  check(s, "filter-change-drops-fp", new URL(s.origin + st.url).searchParams.get("fp") === null, st.url);
  // undo the area chip to get back to the plain multiPageType state
  await clickChip(s.page, "area", combo.area);
  await s.page.waitForTimeout(200);

  // 3. combined filters (type + area + style)
  await clickChip(s.page, "type", multiPageType); // clear the lone type chip first
  await s.page.waitForTimeout(150);
  await clickChip(s.page, "type", combo.type);
  await clickChip(s.page, "area", combo.area);
  await clickChip(s.page, "style", combo.style);
  await s.page.waitForTimeout(200);
  st = await assertParity(s, data, { type: [combo.type], area: [combo.area], style: [combo.style] }, 1, "combined");
  {
    const u = new URL(s.origin + st.url);
    check(s, "combined-url-has-all-params", u.searchParams.get("type") === combo.type && u.searchParams.get("area") === combo.area && u.searchParams.get("style") === combo.style, st.url);
  }
  await screenshot(s, "portfolio-filtered-combined");

  // 4. sort change (area-desc, then price-asc), applied on top of the combined filter
  await s.page.selectOption("select[name=sort]", "area-desc");
  await s.page.waitForTimeout(200);
  await assertParity(s, data, { type: [combo.type], area: [combo.area], style: [combo.style], sort: "area-desc" }, 1, "sort-area-desc");
  await s.page.selectOption("select[name=sort]", "price-asc");
  await s.page.waitForTimeout(200);
  await assertParity(s, data, { type: [combo.type], area: [combo.area], style: [combo.style], sort: "price-asc" }, 1, "sort-price-asc");

  // 7. reset button restores all projects
  await s.page.locator(".i1-pfilter__reset").first().click();
  await s.page.waitForTimeout(200);
  st = await assertParity(s, data, {}, 1, "after-reset");
  check(s, "reset-url-clean", st.url === "/portfolio", st.url);
  check(s, "reset-no-robots-meta", st.robots === null, `robots=${st.robots}`);

  // 6. zero-result state
  await s.page.fill('input[type=search][name=keyword]', "zzz-no-such-project-xyz");
  await s.page.waitForTimeout(200);
  st = await readFilterState(s.page);
  check(s, "zero-result-empty-visible", st.emptyVisible);
  check(s, "zero-result-count-0", st.count === "0", `count=${st.count}`);
  check(s, "zero-result-no-cards", st.cardIds.length === 0, `cards=${st.cardIds.length}`);
  check(s, "zero-result-no-pager", !st.pagerVisible);
  await screenshot(s, "portfolio-zero-result");
  await s.page.locator("[data-filter-empty] button").click();
  await s.page.waitForTimeout(200);
  st = await assertParity(s, data, {}, 1, "after-empty-reset");
  check(s, "after-empty-reset-url-clean", st.url === "/portfolio", st.url);

  // 8. direct load of a query URL restores state
  const directType = combo.type;
  await s.page.goto(`${s.origin}/portfolio?style=${encodeURIComponent(combo.style)}&sort=price-asc&fp=2`, { waitUntil: "networkidle" });
  await s.page.waitForTimeout(300);
  const directTotal = expectedPage(data, { style: [combo.style], sort: "price-asc" }, 1).total;
  if (directTotal > PAGE_SIZE) {
    await assertParity(s, data, { style: [combo.style], sort: "price-asc" }, 2, "direct-load");
    const checked = await isChipChecked(s.page, "style", combo.style);
    check(s, "direct-load-chip-checked", checked);
    const sortVal = await s.page.locator("select[name=sort]").inputValue();
    check(s, "direct-load-sort-value", sortVal === "price-asc", `sort=${sortVal}`);
  } else {
    // combo.style alone doesn't reach a 2nd page: still verify the restore mechanics on page 1.
    await assertParity(s, data, { style: [combo.style], sort: "price-asc" }, 1, "direct-load-p1-fallback");
    const checked = await isChipChecked(s.page, "style", combo.style);
    check(s, "direct-load-chip-checked", checked);
  }
  void directType;

  // reset to a clean state for item 9
  await s.page.goto(`${s.origin}/portfolio`, { waitUntil: "networkidle" });
  await s.page.waitForTimeout(200);

  // 9. back/forward: two filter steps, then goBack/goForward; no full reload; state restored
  await s.page.evaluate(() => {
    (window as unknown as { __step41Marker?: string }).__step41Marker = "alive";
  });
  const docReqBefore = s.documentRequests;
  await clickChip(s.page, "type", combo.type);
  await s.page.waitForTimeout(200);
  const afterStep1 = await assertParity(s, data, { type: [combo.type] }, 1, "backforward-step1");
  await clickChip(s.page, "area", combo.area);
  await s.page.waitForTimeout(200);
  const afterStep2 = await assertParity(s, data, { type: [combo.type], area: [combo.area] }, 1, "backforward-step2");
  await s.page.goBack();
  await s.page.waitForTimeout(250);
  const afterBack = await assertParity(s, data, { type: [combo.type] }, 1, "backforward-goback");
  check(s, "goback-url-matches-step1", afterBack.url === afterStep1.url, `${afterBack.url} vs ${afterStep1.url}`);
  await s.page.goForward();
  await s.page.waitForTimeout(250);
  const afterForward = await assertParity(s, data, { type: [combo.type], area: [combo.area] }, 1, "backforward-goforward");
  check(s, "goforward-url-matches-step2", afterForward.url === afterStep2.url, `${afterForward.url} vs ${afterStep2.url}`);
  const docReqAfter = s.documentRequests;
  check(s, "backforward-no-document-reload", docReqAfter === docReqBefore, `document requests before=${docReqBefore} after=${docReqAfter}`);
  const markerSurvived = await s.page.evaluate(() => (window as unknown as { __step41Marker?: string }).__step41Marker);
  check(s, "backforward-window-marker-survived", markerSurvived === "alive", `marker=${markerSurvived}`);

  // 9b. soft navigation round trip: filtered list → detail (client link) → back keeps the filter
  // (the router's own URL must hold the query; a stale router URL would drop it here)
  const filteredUrl = afterForward.url;
  await s.page.locator("[data-project-card] a").first().click();
  await s.page.waitForURL(/\/portfolio\/[a-z0-9-]+$/, { timeout: 10_000 }).catch(() => undefined);
  await s.page.waitForTimeout(300);
  const onDetail = await s.page.evaluate(() => location.pathname);
  check(s, "detail-roundtrip-reached-detail", /^\/portfolio\/[a-z0-9-]+$/.test(onDetail), onDetail);
  await s.page.goBack();
  await s.page.waitForTimeout(400);
  const backUrl = await s.page.evaluate(() => location.pathname + location.search);
  check(s, "detail-roundtrip-query-kept", backUrl === filteredUrl, `${backUrl} vs ${filteredUrl}`);
  await assertParity(s, data, { type: [combo.type], area: [combo.area] }, 1, "detail-roundtrip-restored");
  // a further filter write after the round trip must keep the router in sync (no stale-URL write-back)
  await clickChip(s.page, "area", combo.area);
  await s.page.waitForTimeout(250);
  await assertParity(s, data, { type: [combo.type] }, 1, "detail-roundtrip-then-filter");

  // 9c. out-of-range filtered page is clamped in the URL (no history entry)
  await s.page.goto(`${s.origin}/portfolio?type=${encodeURIComponent(combo.type)}&fp=99`, { waitUntil: "networkidle" });
  await s.page.waitForTimeout(250);
  const clampedUrl = await s.page.evaluate(() => location.search);
  check(s, "fp-out-of-range-clamped-in-url", !/fp=99/.test(clampedUrl), clampedUrl);

  // leave the page unfiltered for cleanliness
  await s.page.locator(".i1-pfilter__reset").first().click();
  await s.page.waitForTimeout(200);
}

/** Shorter interaction sequence for mobile (390): open panel, search, one chip, reset, zero-result. */
async function mobileInteractionSequence(s: Session, data: FilterData): Promise<void> {
  const keyword = pickKeyword(data);
  const combo = pickCombo(data);

  await s.page.fill('input[type=search][name=keyword]', keyword);
  await s.page.waitForTimeout(200);
  await assertParity(s, data, { keyword }, 1, "mobile-search");
  await s.page.fill('input[type=search][name=keyword]', "");
  await s.page.waitForTimeout(200);

  await clickChip(s.page, "type", combo.type);
  await s.page.waitForTimeout(200);
  const st = await assertParity(s, data, { type: [combo.type] }, 1, "mobile-chip");
  check(s, "mobile-chip-url", new URL(s.origin + st.url).searchParams.get("type") === combo.type, st.url);
  await screenshot(s, "portfolio-filtered-mobile-panel");

  await s.page.locator(".i1-pfilter__reset").first().click();
  await s.page.waitForTimeout(200);
  await assertParity(s, data, {}, 1, "mobile-after-reset");

  await s.page.fill('input[type=search][name=keyword]', "zzz-no-such-project-xyz");
  await s.page.waitForTimeout(200);
  const zero = await readFilterState(s.page);
  check(s, "mobile-zero-result-empty-visible", zero.emptyVisible);
  check(s, "mobile-zero-result-count-0", zero.count === "0", `count=${zero.count}`);
  await screenshot(s, "portfolio-zero-result-mobile");
  await s.page.locator("[data-filter-empty] button").click();
  await s.page.waitForTimeout(200);
  await assertParity(s, data, {}, 1, "mobile-after-empty-reset");
}

async function visitFixtureLargePortfolio(browser: Browser, site: string, origin: string, data: FilterData, vp: ViewportName): Promise<void> {
  const s = await beginSession(browser, site, origin, "/portfolio", vp);
  await baselineAndToggle(s, data, 173);
  if (vp === "desktop-1440") {
    await fullInteractionSequence(s, data);
  } else if (vp === "mobile-390") {
    await mobileInteractionSequence(s, data);
    await closeMobilePanelIfOpen(s);
  }
  // tablet-1000: baseline + toggle behaviour only, per spec ("filter controls usable at every viewport").
  await finishSession(s);
}

/** /portfolio/page/2 is the static, crawlable, non-filtered pagination route: must be unchanged by the filter UI work. */
async function visitStaticPage2(browser: Browser, site: string, origin: string): Promise<void> {
  const s = await beginSession(browser, site, origin, "/portfolio/page/2", "desktop-1440");
  await runCommonChecks(s);
  const info = await s.page.evaluate(() => ({
    cards: document.querySelectorAll("[data-project-card]").length,
    hasFilter: !!document.querySelector("[data-filter]"),
  }));
  check(s, "static-page2-cards-30", info.cards === 30, `cards=${info.cards}`);
  check(s, "static-page2-no-filter-ui", !info.hasFilter, `hasFilter=${info.hasFilter}`);
  await finishSession(s);
}

async function visitFixtureSmallPortfolio(browser: Browser, site: string, origin: string, data: FilterData, vp: ViewportName): Promise<void> {
  const s = await beginSession(browser, site, origin, "/portfolio", vp);
  await runCommonChecks(s);
  const st = await readFilterState(s.page);
  check(s, "fixture-small-count-12", st.count === "12", `count=${st.count}`);
  check(s, "fixture-small-cards-12", st.cardIds.length === 12, `cards=${st.cardIds.length}`);

  if (vp === "mobile-390") {
    const toggleText = (await s.page.locator(".i1-pfilter__toggle").textContent()) ?? "";
    check(s, "fixture-small-toggle-korean", toggleText.includes("필터"), toggleText);
    await s.page.locator(".i1-pfilter__toggle").click();
    await s.page.waitForTimeout(150);
    await checkOverflowAndImages(s, "panel-open");
  }
  const sortLabel = (await s.page.locator(".i1-pfilter__sort-label").textContent()) ?? "";
  check(s, "fixture-small-sort-korean", sortLabel.includes("정렬"), sortLabel);
  const legends = await s.page.locator(".i1-pfilter__legend").allTextContents();
  const areaLegend = legends.find((l) => /평/.test(l));
  check(s, "fixture-small-area-legend-has-pyeong", !!areaLegend, legends.join(", "));

  await screenshot(s, vp === "mobile-390" ? "portfolio-mobile-panel" : "portfolio-unfiltered");

  const combo = data.vocabulary.types[0]?.id;
  if (combo) {
    await clickChip(s.page, "type", combo);
    await s.page.waitForTimeout(200);
    await assertParity(s, data, { type: [combo] }, 1, "fixture-small-chip");
  } else {
    check(s, "fixture-small-chip", false, "no type in vocabulary to click");
  }
  await finishSession(s);
}

async function visitFixtureEmpty(browser: Browser, site: string, origin: string): Promise<void> {
  await quickStatusCheck(browser, site, origin, "/portfolio", 404);
}

// ------------------------------------------------------------------- main
async function runSite<T>(browser: Browser, site: string, run: (origin: string, pkgRoot: string) => Promise<T>): Promise<T> {
  const pkgRoot = await loadPackageRoot(root, site);
  const server = await serveStatic(pkgRoot);
  const origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  try {
    return await run(origin, pkgRoot);
  } finally {
    server.close();
  }
}

async function main(): Promise<void> {
  await mkdir(outDir, { recursive: true });
  const browser = await chromium.launch();
  try {
    await runSite(browser, "fixture-large", async (origin, pkgRoot) => {
      const data = await loadFilterData(pkgRoot);
      await visitFixtureLargePortfolio(browser, "fixture-large", origin, data, "desktop-1440");
      await visitFixtureLargePortfolio(browser, "fixture-large", origin, data, "tablet-1000");
      await visitFixtureLargePortfolio(browser, "fixture-large", origin, data, "mobile-390");
      await visitStaticPage2(browser, "fixture-large", origin);
    });
    await runSite(browser, "fixture-small", async (origin, pkgRoot) => {
      const data = await loadFilterData(pkgRoot);
      await visitFixtureSmallPortfolio(browser, "fixture-small", origin, data, "desktop-1440");
      await visitFixtureSmallPortfolio(browser, "fixture-small", origin, data, "mobile-390");
    });
    await runSite(browser, "fixture-empty", async (origin) => {
      await visitFixtureEmpty(browser, "fixture-empty", origin);
    });
  } finally {
    await browser.close();
  }

  const allChecks = rows.flatMap((r) => r.checks);
  const failed = allChecks.filter((c) => !c.pass);
  const totals = { visits: rows.length, checks: allChecks.length, passed: allChecks.length - failed.length, failed: failed.length };
  await writeFile(path.join(outDir, "summary.json"), `${JSON.stringify({ rows, totals }, null, 2)}\n`);
  console.log(`step41 visual smoke: ${totals.passed}/${totals.checks} checks, ${totals.visits} visits`);
  if (failed.length > 0) process.exit(1);
}

await main();
