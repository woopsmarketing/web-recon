/**
 * Whole-site Visual / UX Polish smoke (interior-01, after Step 5): the polish invariants on
 * already-BUILT static site packages. Does NOT build anything — it reads
 * `data/site-builds/<site>/current.json` and serves each current package from a local
 * nginx-`try_files`-style static server (same server + session helpers as the Step 5 smoke;
 * self-contained, no import).
 *
 * Every visit: HTTP 200 (404 on the not-found visits), 0 console/page errors, 0 non-local
 * requests, 0 failed subresources,
 * 0 broken images, 0 horizontal overflow, internal links resolve, and the footer is fully
 * readable (every text box inside the viewport and unclipped; label above value below 900px).
 * Plus, where they apply:
 *  - floating CTA (site-wide since 1.4.0 — home, /portfolio incl. filtered + open-panel states,
 *    /portfolio/page/2, detail, 404): position:fixed with the viewport as containing block; its
 *    viewport-relative right/bottom offsets measured with getBoundingClientRect() at several
 *    scroll positions (home: top → intro → projects → reviews → near footer → end; other pages:
 *    top → ¼ → ½ → ¾ of the scroll range → near footer → end) equal the declared seat within
 *    1px; on top (hit test); keyboard reachable; safe-area insets (CDP emulation) add to the
 *    offsets and the no-inset fallback keeps them; every visible control can be brought clear
 *    of it; it never covers footer text at the end of the page;
 *  - reviews: the bar (rail + prev/next) exists only when the track really scrolls; when all
 *    reviews fit there is no reserved bar block and no artificial bottom gap;
 *  - layout shift: the bar's post-hydration collapse shifts nothing on a load from the top and
 *    stays bounded when a fitting reviews track is already in view as the page hydrates;
 *  - /portfolio top: the title sits on the banner (worst-pixel contrast measured with the text
 *    hidden), the filters follow directly, and the page without a banner keeps the plain head;
 *  - full-page screenshots are verified complete (PNG height = document height × DPR).
 *
 *   tsx scripts/template-platform-polish-visual-smoke.ts [outDir] [--root <dir>] [--only <substring>]
 *
 * `--root` defaults to cwd; `outDir` defaults to
 * docs/result/recon-template-platform-whole-site-polish/screens (resolved relative to cwd).
 */
import { createReadStream } from "node:fs";
import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import http from "node:http";
import type { AddressInfo } from "node:net";
import path from "node:path";
import { PNG } from "pngjs";
import { chromium, type Browser, type BrowserContext, type Page } from "playwright";

// ---------------------------------------------------------------- CLI args
const argv = process.argv.slice(2);
let rootArg = process.cwd();
let outDirArg: string | undefined;
let only: string | undefined;
for (let i = 0; i < argv.length; i++) {
  if (argv[i] === "--root") rootArg = argv[++i] ?? rootArg;
  else if (argv[i] === "--only") only = argv[++i];
  else if (outDirArg === undefined) outDirArg = argv[i];
}
const root = path.resolve(rootArg);
const outDir = path.resolve(outDirArg ?? "docs/result/recon-template-platform-whole-site-polish/screens");

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

/** template version each site's current package was built with (1.5.0 moved the contact seat to /contact) */
const builtVersion = new Map<string, string>();
async function loadPackageRoot(rootDir: string, site: string): Promise<string> {
  const ptr = JSON.parse(await readFile(path.join(rootDir, "data/site-builds", site, "current.json"), "utf8")) as { packageDir: string };
  const record = JSON.parse(await readFile(path.join(rootDir, ptr.packageDir, "build-record.json"), "utf8")) as { template: { templateVersion: string } };
  builtVersion.set(site, record.template.templateVersion);
  return path.join(rootDir, ptr.packageDir, "site");
}
/** interior-01 ≥ 1.5.0: the site's contact destination is its /contact page (which writes to the business mailto) */
function ia150(site: string): boolean {
  const [a, b] = (builtVersion.get(site) ?? "0.0.0").split(".").map(Number);
  return a! > 1 || (a === 1 && b! >= 5);
}

// ------------------------------------------------------------------ views
type ViewportName = "m320" | "m390" | "m430" | "t800" | "d1000" | "d1440" | "d1920";
const VIEWPORTS: Record<ViewportName, { width: number; height: number; deviceScaleFactor: number; isMobile: boolean }> = {
  m320: { width: 320, height: 640, deviceScaleFactor: 2, isMobile: true },
  m390: { width: 390, height: 844, deviceScaleFactor: 2, isMobile: true },
  m430: { width: 430, height: 932, deviceScaleFactor: 2, isMobile: true },
  // a narrow desktop window (fine pointer): the widest "mobile band" layout
  t800: { width: 800, height: 900, deviceScaleFactor: 1, isMobile: false },
  d1000: { width: 1000, height: 800, deviceScaleFactor: 1, isMobile: false },
  d1440: { width: 1440, height: 900, deviceScaleFactor: 1, isMobile: false },
  d1920: { width: 1920, height: 1080, deviceScaleFactor: 1, isMobile: false },
};

/**
 * The floating CTA's declared seat (template.css `--i1-float-right` / `--i1-float-bottom`):
 * base = mobile band, ≥ 900px = desktop band. Safe-area insets add to these.
 */
const FLOAT_SEAT = { mobile: { right: 16, bottom: 16 }, desktop: { right: 24, bottom: 50 } };
const DESKTOP_MIN = 900;
/** Common desktop/tablet window sizes for first-load checks (height decides where the filter row lands). */
const FIRST_LOAD_SIZES: [number, number][] = [[1440, 900], [1440, 800], [1440, 1000], [1366, 768], [1280, 720], [1280, 800], [1536, 864], [1920, 1080], [1000, 800], [900, 700], [800, 900]];
const PX = 1; // CSS rounding tolerance

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
  measurements: Record<string, unknown>;
}
const rows: VisitRow[] = [];

function truncate(s: string, n = 400): string {
  return s.length > n ? `${s.slice(0, n)}…` : s;
}

interface Session {
  page: Page;
  ctx: BrowserContext;
  site: string;
  route: string;
  viewport: ViewportName;
  origin: string;
  checks: CheckResult[];
  screenshots: string[];
  measurements: Record<string, unknown>;
  consoleErrors: string[];
  pageErrors: string[];
  nonLocalRequests: string[];
  subresourceErrors: string[];
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
    measurements: {},
    consoleErrors: [],
    pageErrors: [],
    nonLocalRequests: [],
    subresourceErrors: [],
    status: undefined,
  };
  page.on("console", (m) => {
    if (m.type() === "error") s.consoleErrors.push(truncate(m.text()));
  });
  page.on("pageerror", (e) => s.pageErrors.push(truncate(e.message)));
  page.on("response", (r) => {
    if (r.status() < 400) return;
    let isMainNav = false;
    try {
      isMainNav = r.request().isNavigationRequest() && r.frame() === page.mainFrame();
    } catch {
      isMainNav = false;
    }
    if (!isMainNav) s.subresourceErrors.push(`${r.status()}: ${r.url()}`);
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

/** Scroll through the page once (lazy images load), then back to the top. */
async function loadLazy(page: Page): Promise<void> {
  await page
    .evaluate(async () => {
      for (let y = 0; y < document.documentElement.scrollHeight; y += 400) {
        window.scrollTo(0, y);
        await new Promise((r) => setTimeout(r, 20));
      }
      window.scrollTo(0, 0);
    })
    .catch(() => {});
  await page.waitForLoadState("networkidle").catch(() => {});
}

async function runCommonChecks(s: Session, status = 200): Promise<void> {
  check(s, `status-${status}`, s.status === status, `status=${s.status}`);
  await loadLazy(s.page);
  const overflow = await s.page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  check(s, "no-horizontal-overflow", overflow <= 0, `overflow=${overflow}`);
  const broken: string[] = await s.page.evaluate(async () => {
    const out: string[] = [];
    for (const img of Array.from(document.images)) {
      const src = img.currentSrc || img.src;
      const r = img.getBoundingClientRect();
      // lazy images scrolled out sideways inside a track/gallery never load: judged by the fetch below
      const visible = r.width > 0 && r.height > 0 && r.right > 0 && r.left < window.innerWidth && img.checkVisibility();
      if (visible && !(img.complete && img.naturalWidth > 0)) out.push(`not-decoded ${src}`);
      if (!src.startsWith("data:")) {
        const st = await fetch(src).then((x) => x.status, () => -1);
        if (st !== 200) out.push(`${st} ${src}`);
      }
    }
    return out;
  });
  check(s, "no-broken-media", broken.length === 0, broken.join(", "));
  const links = await s.page.evaluate(async () => {
    const hrefs = Array.from(new Set(Array.from(document.querySelectorAll("a[href]")).map((a) => a.getAttribute("href") ?? "")));
    const bad: string[] = [];
    for (const h of hrefs) {
      if (h.startsWith("/")) {
        const st = await fetch(h).then((x) => x.status, () => -1);
        if (st !== 200) bad.push(`${st} ${h}`);
      } else if (h.startsWith("#")) {
        if (!document.getElementById(h.slice(1))) bad.push(`dead anchor ${h}`);
      } else if (/^(https?:)?\/\//.test(h)) bad.push(`external ${h}`);
    }
    return bad;
  });
  check(s, "internal-links-resolve-no-external", links.length === 0, links.join(", "));
}

async function runFinalChecks(s: Session): Promise<void> {
  check(s, "no-console-errors", s.consoleErrors.length === 0, s.consoleErrors.join(" | "));
  check(s, "no-page-errors", s.pageErrors.length === 0, s.pageErrors.join(" | "));
  check(s, "no-nonlocal-requests", s.nonLocalRequests.length === 0, s.nonLocalRequests.join(" | "));
  check(s, "no-subresource-errors", s.subresourceErrors.length === 0, s.subresourceErrors.join(" | "));
}

/**
 * Full-page capture, verified complete: the PNG covers the whole document (a truncated capture fails).
 * Touch (isMobile) contexts: Chromium's full-page capture drops the touch emulation — `(hover:
 * hover) and (pointer: fine)` flips to true mid-capture, the tracks' prev/next buttons appear
 * (+42px each) and the capture, sized before the flip, loses the page's last ~126px (the Step 5
 * "clipped mobile footer" was this artefact). So touch contexts are captured by growing the
 * viewport to the document height and taking a plain screenshot, which keeps touch emulation.
 */
async function fullShot(s: Session, name: string): Promise<void> {
  await loadLazy(s.page);
  const file = path.join(outDir, `${s.site}--${name}--${s.viewport}.png`);
  const vp = VIEWPORTS[s.viewport];
  let buf: Buffer | undefined;
  if (vp.isMobile) {
    const doc = await s.page.evaluate(() => document.documentElement.scrollHeight);
    await s.page.setViewportSize({ width: vp.width, height: doc });
    buf = await s.page.screenshot({ path: file, animations: "disabled" }).catch(() => undefined);
    await s.page.setViewportSize({ width: vp.width, height: vp.height });
  } else {
    buf = await s.page.screenshot({ path: file, fullPage: true, animations: "disabled" }).catch(() => undefined);
  }
  if (!buf) {
    check(s, `screenshot:${name}`, false, "capture failed");
    return;
  }
  const png = PNG.sync.read(buf);
  const doc = await s.page.evaluate(() => document.documentElement.scrollHeight);
  const touchKept = !vp.isMobile || !(await s.page.evaluate(() => matchMedia("(hover: hover) and (pointer: fine)").matches));
  check(s, `screenshot:${name}:complete`, Math.abs(png.height - doc * vp.deviceScaleFactor) <= vp.deviceScaleFactor && touchKept, `png ${png.width}×${png.height} vs document ${doc}px × ${vp.deviceScaleFactor}; touch emulation kept=${touchKept}`);
  s.screenshots.push(path.relative(process.cwd(), file));
}

async function viewShot(s: Session, name: string): Promise<void> {
  const file = path.join(outDir, `${s.site}--${name}--${s.viewport}.png`);
  await s.page.screenshot({ path: file, animations: "disabled" }).catch(() => {});
  s.screenshots.push(path.relative(process.cwd(), file));
}

async function finishSession(s: Session): Promise<void> {
  await runFinalChecks(s);
  rows.push({ site: s.site, route: s.route, viewport: s.viewport, screenshots: s.screenshots, checks: s.checks, measurements: s.measurements });
  const failed = s.checks.filter((c) => !c.pass);
  console.log(`${failed.length === 0 ? "ok  " : "FAIL"} ${s.site} ${s.route} ${s.viewport} — ${s.checks.length - failed.length}/${s.checks.length} checks`);
  await s.ctx.close();
}

// ----------------------------------------------------------------- footer
/**
 * Footer readability: every text box of the footer lies fully inside the viewport and inside
 * its own box (nothing clipped), the footer grows to its content, and below 900px each fact
 * is a label ABOVE its value (single column). ≥ 900px keeps label | value on one line.
 */
async function footerChecks(s: Session, label = ""): Promise<void> {
  const r = await s.page.evaluate(() => {
    const footer = document.querySelector<HTMLElement>("footer[data-section='site.footer']");
    if (!footer) return undefined;
    const vw = document.documentElement.clientWidth;
    const out: string[] = [];
    const texts = Array.from(footer.querySelectorAll<HTMLElement>(".i1-footer__name, .i1-footer__summary, .i1-footer__facts dt, .i1-footer__facts dd, .i1-footer__facts a"));
    for (const e of texts) {
      const b = e.getBoundingClientRect();
      if (b.width === 0 || b.height === 0) out.push(`${e.className || e.tagName} empty box`);
      if (b.left < -0.5 || b.right > vw + 0.5) out.push(`${e.className || e.tagName} outside viewport ${Math.round(b.left)}–${Math.round(b.right)} of ${vw}`);
      if (e.scrollWidth > e.clientWidth + 1 && getComputedStyle(e).display !== "inline") out.push(`${e.className || e.tagName} inner overflow ${e.scrollWidth}>${e.clientWidth}`);
      // every line box of the text within the viewport too
      for (const q of Array.from(e.getClientRects())) if (q.right > vw + 0.5 || q.left < -0.5) out.push(`${e.tagName} line outside ${Math.round(q.left)}–${Math.round(q.right)}`);
    }
    const clipped = Array.from(footer.querySelectorAll<HTMLElement>("*")).filter((e) => {
      const cs = getComputedStyle(e);
      return cs.overflow !== "visible" && (e.scrollHeight > e.clientHeight + 1 || e.scrollWidth > e.clientWidth + 1);
    });
    for (const e of clipped) out.push(`${e.className || e.tagName} clips its content`);
    const rows = Array.from(footer.querySelectorAll<HTMLElement>(".i1-footer__facts > div")).map((d) => {
      const dt = d.querySelector("dt")!.getBoundingClientRect();
      const dd = d.querySelector("dd")!.getBoundingClientRect();
      return { dtTop: dt.top, dtBottom: dt.bottom, ddTop: dd.top, ddLeft: dd.left, dtLeft: dt.left, ddLines: d.querySelector("dd")!.getClientRects().length, ddH: dd.height };
    });
    const fr = footer.getBoundingClientRect();
    const cs = getComputedStyle(footer);
    const facts = footer.querySelector<HTMLElement>(".i1-footer__facts");
    return {
      out,
      vw,
      rows,
      height: Math.round(fr.height),
      overflowY: footer.scrollHeight - footer.clientHeight,
      paddingTop: cs.paddingTop,
      paddingBottom: cs.paddingBottom,
      factsFont: facts ? getComputedStyle(facts).fontSize : null,
      factsLineHeight: facts ? getComputedStyle(facts.querySelector("dd")!).lineHeight : null,
    };
  });
  if (!r) {
    check(s, `footer${label}:present`, false);
    return;
  }
  s.measurements[`footer${label}`] = { height: r.height, paddingTop: r.paddingTop, paddingBottom: r.paddingBottom, factsFont: r.factsFont, factsLineHeight: r.factsLineHeight, rows: r.rows.length };
  check(s, `footer${label}:text-inside-viewport-unclipped`, r.out.length === 0, r.out.join("; "));
  check(s, `footer${label}:grows-to-content`, r.overflowY <= 1, `scrollHeight-clientHeight=${r.overflowY}`);
  if (r.rows.length > 0) {
    if (r.vw < DESKTOP_MIN) {
      const bad = r.rows.filter((x) => x.ddTop < x.dtBottom - 0.5 || Math.abs(x.ddLeft - x.dtLeft) > 0.5);
      check(s, `footer${label}:label-above-value`, bad.length === 0, JSON.stringify(bad));
    } else {
      const bad = r.rows.filter((x) => Math.abs(x.ddTop - x.dtTop) > 2 || x.ddLeft <= x.dtLeft);
      check(s, `footer${label}:desktop-label-beside-value`, bad.length === 0, JSON.stringify(bad));
    }
  }
}

/**
 * Stress: a very long company name and an email without break opportunities must wrap inside
 * the viewport (no truncation, no horizontal scroll). Mutates the DOM: run last in a session.
 */
async function footerLongValues(s: Session): Promise<void> {
  const ok = await s.page.evaluate(() => {
    const dds = Array.from(document.querySelectorAll<HTMLElement>(".i1-footer__facts dd"));
    if (dds.length < 2) return false;
    dds[0]!.textContent = "Very Long Fictional Interior Architecture And Renovation Company Holdings Limited (fixture stress)";
    const a = dds[1]!.querySelector("a");
    if (a) a.textContent = "a.very.long.fictional.mailbox.name.for.layout.stress@subdomain.fixture-large.example";
    return true;
  });
  if (!ok) return;
  await footerChecks(s, ":long-values");
  const overflow = await s.page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  check(s, "footer:long-values:no-horizontal-scroll", overflow <= 0, `overflow=${overflow}`);
  const wrapped = await s.page.evaluate(() => Array.from(document.querySelectorAll(".i1-footer__facts dd")).map((d) => d.getClientRects().length > 1 || d.getBoundingClientRect().height > parseFloat(getComputedStyle(d).lineHeight) * 1.5));
  check(s, "footer:long-values:wrap", wrapped.every(Boolean), JSON.stringify(wrapped));
}

// ------------------------------------------------------------ floating CTA
interface CtaMeasure {
  at: string;
  scrollY: number;
  right: number;
  bottom: number;
  width: number;
  height: number;
  onTop: boolean;
}

async function ctaMeasure(page: Page, at: string): Promise<CtaMeasure> {
  return page.evaluate((label) => {
    const link = document.querySelector<HTMLElement>(".i1-fcta__link")!;
    const r = link.getBoundingClientRect();
    const de = document.documentElement;
    const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
    return {
      at: label,
      scrollY: Math.round(window.scrollY),
      right: de.clientWidth - r.right,
      bottom: de.clientHeight - r.bottom,
      width: r.width,
      height: r.height,
      onTop: !!hit?.closest(".i1-fcta__link"),
    };
  }, at);
}

/** Scroll so the element's top sits `frac` of the viewport down (clamped by the document). */
async function scrollToSection(page: Page, selector: string, frac: number): Promise<boolean> {
  const ok = await page.evaluate(
    ([sel, f]) => {
      const el = document.querySelector(sel as string);
      if (!el) return false;
      const y = el.getBoundingClientRect().top + window.scrollY - window.innerHeight * (f as number);
      window.scrollTo({ top: Math.max(0, y), behavior: "instant" as ScrollBehavior });
      return true;
    },
    [selector, frac],
  );
  await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
  return ok;
}

type ScrollStop = [string, (s: Session) => Promise<unknown>];
/** Homepage stops: through the sections the seat passes over. */
const HOME_STOPS: ScrollStop[] = [
  ["top", (s) => s.page.evaluate(() => window.scrollTo(0, 0))],
  ["intro-middle", (s) => scrollToSection(s.page, "[data-section='home.intro']", 0.1)],
  ["projects", (s) => scrollToSection(s.page, "[data-section='home.projects-a']", 0.05)],
  ["reviews", (s) => scrollToSection(s.page, "[data-section='home.reviews']", 0.05)],
  ["near-footer", (s) => scrollToSection(s.page, "footer[data-section='site.footer']", 0.7)],
  ["end", (s) => s.page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight))],
];
const fractionStop = (f: number): ScrollStop => [
  `${f * 100}%`,
  (s) => s.page.evaluate((x) => window.scrollTo(0, Math.round((document.documentElement.scrollHeight - window.innerHeight) * x)), f),
];
/** Every other page: evenly through its scroll range, then the footer and the end. */
const PAGE_STOPS: ScrollStop[] = [HOME_STOPS[0]!, fractionStop(0.25), fractionStop(0.5), fractionStop(0.75), HOME_STOPS[4]!, HOME_STOPS[5]!];

async function ctaChecks(s: Session, stops: ScrollStop[] = HOME_STOPS): Promise<void> {
  const vw = VIEWPORTS[s.viewport].width;
  const seat = vw < DESKTOP_MIN ? FLOAT_SEAT.mobile : FLOAT_SEAT.desktop;

  // 1. fixed, viewport containing block (no ancestor re-anchors or traps it), on top of the header
  const cb = await s.page.evaluate(() => {
    const wrap = document.querySelector<HTMLElement>(".i1-fcta")!;
    const cs = getComputedStyle(wrap);
    const traps: string[] = [];
    for (let e = wrap.parentElement; e; e = e.parentElement) {
      const c = getComputedStyle(e);
      const bad =
        c.transform !== "none" ||
        c.filter !== "none" ||
        c.perspective !== "none" ||
        (c as unknown as { backdropFilter?: string }).backdropFilter !== undefined && (c as unknown as { backdropFilter: string }).backdropFilter !== "none" ||
        /layout|paint|strict|content/.test(c.contain) ||
        /transform|filter|perspective/.test(c.willChange) ||
        c.containerType !== "normal" ||
        (c as unknown as { contentVisibility?: string }).contentVisibility === "auto";
      if (bad) traps.push(e.tagName + (e.className ? `.${String(e.className).split(" ")[0]}` : ""));
    }
    const header = document.querySelector<HTMLElement>(".i1-header");
    return {
      position: cs.position,
      right: cs.right,
      bottom: cs.bottom,
      zIndex: Number(cs.zIndex),
      headerZ: header ? Number(getComputedStyle(header).zIndex) : 0,
      traps,
      inFooter: !!wrap.closest("footer[data-section='site.footer']"),
      wrapH: wrap.getBoundingClientRect().height,
      linkH: wrap.querySelector(".i1-fcta__link")!.getBoundingClientRect().height,
      href: wrap.querySelector(".i1-fcta__link")!.getAttribute("href") ?? "",
    };
  });
  check(s, "cta:position-fixed-viewport-anchored", cb.position === "fixed" && cb.traps.length === 0 && cb.inFooter, JSON.stringify(cb));
  check(s, "cta:z-above-header", cb.zIndex > cb.headerZ, `cta ${cb.zIndex} vs header ${cb.headerZ}`);
  check(s, "cta:wrapper-is-the-pill", Math.abs(cb.wrapH - cb.linkH) <= 0.5, `wrapper ${cb.wrapH} vs link ${cb.linkH}`);
  // safe-area fallback (non-iOS, no insets): the declarations resolve to the plain seat
  check(s, "cta:safe-area-fallback-resolves", cb.right === `${seat.right}px` && cb.bottom === `${seat.bottom}px`, `right=${cb.right} bottom=${cb.bottom}`);
  // the contact destination: the business mailto; from 1.5.0 the /contact page
  check(s, "cta:mailto-destination", ia150(s.site) ? cb.href === "/contact" : cb.href.startsWith("mailto:"), cb.href);

  // 2. the seat at several scroll positions (live browser, not a full-page capture)
  const seen: CtaMeasure[] = [];
  for (const [at, go] of stops) {
    await go(s);
    await s.page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
    seen.push(await ctaMeasure(s.page, at));
  }
  s.measurements.cta = { seat, samples: seen.map((m) => ({ at: m.at, scrollY: m.scrollY, right: +m.right.toFixed(2), bottom: +m.bottom.toFixed(2), w: +m.width.toFixed(1), h: +m.height.toFixed(1), onTop: m.onTop })) };
  const off = seen.filter((m) => Math.abs(m.right - seat.right) > PX || Math.abs(m.bottom - seat.bottom) > PX);
  check(s, "cta:fixed-bottom-right-at-every-scroll-position", off.length === 0, JSON.stringify(off));
  const rs = seen.map((m) => m.right);
  const bs = seen.map((m) => m.bottom);
  check(s, "cta:no-jump-while-scrolling", Math.max(...rs) - Math.min(...rs) <= 0.5 && Math.max(...bs) - Math.min(...bs) <= 0.5, `right ${Math.min(...rs)}–${Math.max(...rs)}, bottom ${Math.min(...bs)}–${Math.max(...bs)}`);
  const range = await s.page.evaluate(() => document.documentElement.scrollHeight - window.innerHeight);
  s.measurements.ctaScrollRange = range;
  check(s, "cta:scroll-positions-distinct", new Set(seen.map((m) => m.scrollY)).size >= (range >= 400 ? 5 : Math.min(2, range + 1)), `${seen.map((m) => m.scrollY).join(",")} (range ${range})`);
  check(s, "cta:on-top-everywhere", seen.every((m) => m.onTop), seen.filter((m) => !m.onTop).map((m) => m.at).join(","));
  check(s, "cta:inside-viewport", seen.every((m) => m.right >= 0 && m.bottom >= 0), "");
  const first = seen[0]!;
  s.measurements.ctaViewportShare = +((first.width * first.height) / (vw * VIEWPORTS[s.viewport].height) * 100).toFixed(2);

  // 3. end of page: the footer's text is never under the button
  await s.page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
  const covered = await s.page.evaluate(() => {
    const c = document.querySelector(".i1-fcta__link")!.getBoundingClientRect();
    return Array.from(document.querySelectorAll<HTMLElement>(".i1-footer__inner *"))
      .filter((e) => e.children.length === 0 || e.tagName === "A")
      .map((e) => ({ e, r: e.getBoundingClientRect() }))
      .filter(({ r }) => r.width > 0 && r.left < c.right && r.right > c.left && r.top < c.bottom && r.bottom > c.top)
      .map(({ e }) => e.textContent?.slice(0, 30) ?? e.tagName);
  });
  check(s, "cta:never-covers-footer-text-at-end", covered.length === 0, covered.join(" | "));

  // 4. every visible control can be brought clear of the button (scrolled to the middle of
  //    the viewport, its centre hit-tests to itself) — the button never makes a control unusable
  const blocked = await s.page.evaluate(async () => {
    // chip inputs are visually hidden (opacity 0): the <label> around one is the control a user taps
    const sel = "a[href], button, input, select, textarea, [tabindex='0'], label:has(> input)";
    const out: string[] = [];
    let n = 0;
    for (const e of Array.from(document.querySelectorAll<HTMLElement>(sel))) {
      if (e.closest(".i1-fcta") || e.closest("[inert]") || !e.checkVisibility({ opacityProperty: true, visibilityProperty: true })) continue;
      const b0 = e.getBoundingClientRect();
      if (b0.width === 0 || b0.height === 0) continue;
      e.scrollIntoView({ block: "center", inline: "nearest", behavior: "instant" as ScrollBehavior });
      await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
      const b = e.getBoundingClientRect();
      const x = b.left + b.width / 2;
      const y = b.top + b.height / 2;
      if (x < 0 || x > document.documentElement.clientWidth || y < 0 || y > document.documentElement.clientHeight) continue;
      n++;
      const hit = document.elementFromPoint(x, y);
      if (hit?.closest(".i1-fcta")) out.push(`${e.tagName}.${String(e.className).split(" ")[0]} "${(e.textContent ?? e.getAttribute("aria-label") ?? "").trim().slice(0, 24)}"`);
    }
    window.scrollTo(0, 0);
    return { out, n };
  });
  s.measurements.ctaReachability = { controlsTested: blocked.n };
  // floor = "the check really tested controls": from 1.5.0 the < 900 header shows one menu button in
  // place of its nav links (the menu's items exist only while it is open), so a bare page (404) at a
  // phone width has one control fewer
  const floor = ia150(s.site) && VIEWPORTS[s.viewport].width < 900 ? 5 : 6;
  check(s, "cta:every-control-reachable-clear-of-button", blocked.out.length === 0 && blocked.n >= floor, `${blocked.n} tested (floor ${floor}); blocked: ${blocked.out.join(", ")}`);

  // 5. keyboard: last in tab order after the footer's links, focus ring visible
  const kb = await s.page.evaluate(() => {
    const links = Array.from(document.querySelectorAll<HTMLElement>("footer a[href]")).filter((a) => !a.closest(".i1-fcta"));
    links.at(-1)?.focus();
    return links.length;
  });
  await s.page.keyboard.press("Tab");
  const focus = await s.page.evaluate(() => {
    const a = document.activeElement as HTMLElement | null;
    const cs = a ? getComputedStyle(a) : undefined;
    return { isCta: !!a?.closest(".i1-fcta__link"), focusVisible: !!a?.matches(":focus-visible"), outline: cs ? `${cs.outlineStyle} ${cs.outlineWidth}` : "" };
  });
  check(s, "cta:keyboard-reachable-focus-visible", kb > 0 && focus.isCta && focus.focusVisible && !focus.outline.startsWith("none"), JSON.stringify(focus));
  await s.page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());

  // 6. iPhone-style safe area (CDP emulation of env(safe-area-inset-*)): the insets ADD to the seat
  const cdp = await s.ctx.newCDPSession(s.page);
  const setInsets = (insets: Record<string, number>) => cdp.send("Emulation.setSafeAreaInsetsOverride" as never, { insets } as never);
  const supported = await setInsets({ top: 47, bottom: 34, left: 0, right: 0 }).then(() => true, () => false);
  if (!check(s, "cta:safe-area-emulation-available", supported)) return;
  await s.page.evaluate(() => window.scrollTo(0, 400));
  await s.page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
  const portrait = await ctaMeasure(s.page, "safe-area-portrait");
  await setInsets({ top: 0, bottom: 21, left: 44, right: 44 });
  await s.page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
  const landscape = await ctaMeasure(s.page, "safe-area-landscape");
  await setInsets({ top: 0, bottom: 0, left: 0, right: 0 });
  await s.page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
  const cleared = await ctaMeasure(s.page, "safe-area-cleared");
  s.measurements.ctaSafeArea = [portrait, landscape, cleared].map((m) => ({ at: m.at, right: +m.right.toFixed(2), bottom: +m.bottom.toFixed(2) }));
  check(s, "cta:safe-area-bottom-inset-added", Math.abs(portrait.bottom - (seat.bottom + 34)) <= PX && Math.abs(portrait.right - seat.right) <= PX, JSON.stringify(portrait));
  check(s, "cta:safe-area-right-inset-added", Math.abs(landscape.right - (seat.right + 44)) <= PX && Math.abs(landscape.bottom - (seat.bottom + 21)) <= PX, JSON.stringify(landscape));
  check(s, "cta:safe-area-zero-back-to-seat", Math.abs(cleared.right - seat.right) <= PX && Math.abs(cleared.bottom - seat.bottom) <= PX, JSON.stringify(cleared));
  await cdp.detach().catch(() => {});
  // leave the page as found (later checks measure from the top)
  await s.page.evaluate(() => window.scrollTo(0, 0));
  await s.page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
}

/** A viewport capture of the CTA at a scroll position (human evidence; the checks above are the proof). */
async function ctaShots(s: Session): Promise<void> {
  for (const [sel, name] of [["[data-section='home.projects-a']", "cta-at-projects"], ["[data-section='home.reviews']", "cta-at-reviews"]] as const) {
    if (await scrollToSection(s.page, sel, 0.05)) await viewShot(s, name);
  }
  await s.page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
  await s.page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
  await viewShot(s, "cta-at-end");
  await s.page.evaluate(() => window.scrollTo(0, 0));
}

// ----------------------------------------------------------------- reviews
async function reviewsState(page: Page) {
  return page.evaluate(() => {
    const sec = document.querySelector<HTMLElement>("[data-section='home.reviews']");
    if (!sec) return undefined;
    const track = sec.querySelector<HTMLElement>(".i1-track")!;
    const list = track.querySelector<HTMLElement>(".i1-track__list")!;
    const bar = track.querySelector<HTMLElement>(".i1-track__bar")!;
    const rail = track.querySelector<HTMLElement>(".i1-track__rail")!;
    const btns = Array.from(track.querySelectorAll<HTMLElement>(".i1-track__btn"));
    const sr = sec.getBoundingClientRect();
    const items = Array.from(list.children).map((li) => li.getBoundingClientRect());
    const itemsBottom = Math.max(...items.map((b) => b.bottom));
    const trackBottom = track.getBoundingClientRect().bottom;
    return {
      scrollable: track.getAttribute("data-scrollable"),
      overflowPx: list.scrollWidth - list.clientWidth,
      barDisplay: getComputedStyle(bar).display,
      barHeight: bar.getBoundingClientRect().height,
      railVisible: rail.checkVisibility() && rail.getBoundingClientRect().height > 0,
      buttonsVisible: btns.filter((b) => b.checkVisibility() && b.getBoundingClientRect().width > 0).length,
      listTabStop: list.getAttribute("tabindex"),
      // space from the last review line to the section's end = the track's tail + section padding
      gapBelowItems: Math.round(sr.bottom - itemsBottom),
      trackTail: Math.round(trackBottom - itemsBottom),
      paddingBottom: parseFloat(getComputedStyle(sec).paddingBottom),
      itemOrder: Array.from(list.children).map((li, i) => ({ i, top: Math.round(items[i]!.top), left: Math.round(items[i]!.left) })),
    };
  });
}

async function reviewsChecks(s: Session, expect: "fit" | "overflow"): Promise<void> {
  const r = await reviewsState(s.page);
  if (!check(s, `reviews:${expect}:present`, !!r)) return;
  s.measurements[`reviews-${expect}`] = { ...r!, itemOrder: undefined };
  const fine = VIEWPORTS[s.viewport].isMobile ? false : true;
  if (expect === "fit") {
    check(s, "reviews:fit:not-scrollable", r!.scrollable === "false" && r!.overflowPx <= 1, JSON.stringify(r));
    check(s, "reviews:fit:no-bar-block", r!.barDisplay === "none" && r!.barHeight === 0 && r!.buttonsVisible === 0 && !r!.railVisible, JSON.stringify(r));
    // the track ends at its items (focus-ring room only) — no reserved rail/control space
    check(s, "reviews:fit:no-artificial-gap", r!.trackTail <= 4 && r!.gapBelowItems <= r!.paddingBottom + 4, `tail=${r!.trackTail} gap=${r!.gapBelowItems} padding=${r!.paddingBottom}`);
    check(s, "reviews:fit:no-tab-stop", r!.listTabStop === null, `tabindex=${r!.listTabStop}`);
  } else {
    check(s, "reviews:overflow:scrollable", r!.scrollable === "true" && r!.overflowPx > 1, JSON.stringify(r));
    check(s, "reviews:overflow:bar-and-rail", r!.barDisplay !== "none" && r!.barHeight > 0 && r!.railVisible, JSON.stringify(r));
    check(s, "reviews:overflow:buttons-iff-fine-pointer-or-desktop", fine ? r!.buttonsVisible === 2 : r!.buttonsVisible === 0, `buttons=${r!.buttonsVisible}`);
    check(s, "reviews:overflow:list-tab-stop", r!.listTabStop === "0", `tabindex=${r!.listTabStop}`);
  }
  // reading order: items run left→right, then (two-row mobile band only) top→bottom per column
  const vw = VIEWPORTS[s.viewport].width;
  if (vw >= 600) {
    const order = r!.itemOrder;
    const oneRow = order.every((o) => o.top === order[0]!.top);
    check(s, "reviews:single-row-at-600-plus", oneRow, JSON.stringify(order.slice(0, 4)));
  }
}

/** A fitting track becomes scrollable when the window narrows (bar appears) and fits again when it widens. */
async function reviewsResize(s: Session): Promise<void> {
  const vp = VIEWPORTS[s.viewport];
  await s.page.setViewportSize({ width: 390, height: vp.height });
  await s.page.waitForFunction(() => document.querySelector("[data-section='home.reviews'] .i1-track")?.getAttribute("data-scrollable") === "true", undefined, { timeout: 3000 }).catch(() => {});
  const narrow = await reviewsState(s.page);
  await s.page.setViewportSize({ width: vp.width, height: vp.height });
  await s.page.waitForFunction(() => document.querySelector("[data-section='home.reviews'] .i1-track")?.getAttribute("data-scrollable") === "false", undefined, { timeout: 3000 }).catch(() => {});
  const wide = await reviewsState(s.page);
  check(s, "reviews:resize:bar-follows-measurement", narrow?.scrollable === "true" && narrow.barDisplay !== "none" && wide?.scrollable === "false" && wide.barDisplay === "none", `${narrow?.scrollable}/${narrow?.barDisplay} → ${wide?.scrollable}/${wide?.barDisplay}`);
}

/** Every showcase/review track: a bar only when it scrolls. */
async function tracksBarOnlyWhenScrollable(s: Session): Promise<void> {
  const bad = await s.page.evaluate(() =>
    Array.from(document.querySelectorAll<HTMLElement>("[data-track]"))
      .map((t) => ({ s: t.getAttribute("data-scrollable"), bar: getComputedStyle(t.querySelector(".i1-track__bar")!).display, id: t.closest("[data-section]")?.getAttribute("data-section") }))
      .filter((t) => (t.s === "false") !== (t.bar === "none")),
  );
  check(s, "tracks:bar-iff-scrollable", bad.length === 0, JSON.stringify(bad));
}

// --------------------------------------------------------------- portfolio
/** Worst-pixel contrast of white-on-scrim text: the text is made transparent, the region captured, and the brightest pixel under each text box measured. */
/**
 * Layout shift from the track bar's one-time post-hydration collapse (SSR renders every track
 * as scrollable; a track that fits then drops its bar). A load from the top shifts nothing on
 * screen; a fitting reviews track already in view while the page hydrates may shift ≤ maxInView.
 */
async function layoutShiftChecks(s: Session, maxInView: number): Promise<void> {
  const measure = async (inView: boolean) => {
    const p = await s.ctx.newPage();
    await p.addInitScript(() => {
      const w = window as unknown as { __shifts: number[] };
      w.__shifts = [];
      new PerformanceObserver((l) => {
        for (const e of l.getEntries() as unknown as { value: number; hadRecentInput: boolean }[]) if (!e.hadRecentInput) w.__shifts.push(e.value);
      }).observe({ type: "layout-shift", buffered: true });
    });
    await p.route("**/*", async (rt) => {
      const url = rt.request().url();
      if (new URL(url).hostname !== "127.0.0.1") {
        s.nonLocalRequests.push(url);
        return rt.abort();
      }
      // hold scripts back so the page can be scrolled before it hydrates
      if (inView && url.endsWith(".js")) await new Promise((z) => setTimeout(z, 800));
      return rt.continue();
    });
    await p.goto(`${s.origin}${s.route}`, { waitUntil: "domcontentloaded" });
    if (inView) await p.evaluate(() => document.querySelector(".i1-reviews")?.scrollIntoView({ block: "center" }));
    await p.waitForLoadState("load");
    await p.waitForTimeout(1500);
    const r = await p.evaluate(() => ({
      cls: +(window as unknown as { __shifts: number[] }).__shifts.reduce((a, v) => a + v, 0).toFixed(4),
      reviews: document.querySelector(".i1-reviews .i1-track")?.getAttribute("data-scrollable") ?? null,
    }));
    await p.close();
    return r;
  };
  const top = await measure(false);
  const inView = await measure(true);
  s.measurements.layoutShift = { top, inView, maxInView };
  check(s, "layout-shift:load-from-top = 0", top.cls === 0, JSON.stringify(top));
  check(s, `layout-shift:reviews-in-view-at-hydration ≤ ${maxInView}`, inView.cls <= maxInView, JSON.stringify(inView));
}

async function overlayContrast(s: Session, selectors: string[]): Promise<{ sel: string; ratio: number }[]> {
  await s.page.evaluate(() => window.scrollTo(0, 0));
  await s.page.addStyleTag({ content: ".i1-plist__head, .i1-plist__head * { color: transparent !important; text-shadow: none !important; } .i1-fcta { visibility: hidden !important; }" });
  await s.page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
  const boxes = await s.page.evaluate((sels) => sels.map((q) => {
    const e = document.querySelector<HTMLElement>(q);
    if (!e) return undefined;
    // the text's own line boxes (not the full block width)
    const range = document.createRange();
    range.selectNodeContents(e);
    return { sel: q, rects: Array.from(range.getClientRects()).map((r) => ({ x: r.left, y: r.top, w: r.width, h: r.height })) };
  }), selectors);
  const dpr = VIEWPORTS[s.viewport].deviceScaleFactor;
  const png = PNG.sync.read(await s.page.screenshot({ animations: "disabled" }));
  const lin = (c: number) => {
    const v = c / 255;
    return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  };
  const out: { sel: string; ratio: number }[] = [];
  for (const b of boxes) {
    if (!b) continue;
    let worst = 0;
    for (const r of b.rects) {
      for (let y = Math.max(0, Math.floor(r.y * dpr)); y < Math.min(png.height, Math.ceil((r.y + r.h) * dpr)); y++) {
        for (let x = Math.max(0, Math.floor(r.x * dpr)); x < Math.min(png.width, Math.ceil((r.x + r.w) * dpr)); x++) {
          const i = (y * png.width + x) * 4;
          const L = 0.2126 * lin(png.data[i]!) + 0.7152 * lin(png.data[i + 1]!) + 0.0722 * lin(png.data[i + 2]!);
          if (L > worst) worst = L;
        }
      }
    }
    out.push({ sel: b.sel, ratio: +(1.05 / (worst + 0.05)).toFixed(2) });
  }
  await s.page.reload({ waitUntil: "networkidle" });
  return out;
}

async function portfolioTopChecks(s: Session, withBanner: boolean): Promise<void> {
  const r = await s.page.evaluate(() => {
    const q = (sel: string) => document.querySelector<HTMLElement>(sel);
    const box = (e: HTMLElement | null) => (e ? e.getBoundingClientRect() : undefined);
    const hero = box(q(".i1-plist__hero"));
    const head = box(q(".i1-plist__head"));
    const h1 = box(q("h1"));
    const intro = box(q(".i1-plist__intro"));
    const search = box(q(".i1-pfilter__bar"));
    const firstCard = box(q("[data-project-card]"));
    // what follows the title block: the filter island on /portfolio, the static list on /portfolio/page/n
    const next = box(q(".i1-plist__head + *"));
    const panel = q(".i1-pfilter__panel");
    const chip = box(q(".i1-pfilter__panel .i1-chip"));
    const legend = box(q(".i1-pfilter__legend"));
    const header = box(q(".i1-header"));
    return {
      hero: hero && { top: hero.top, bottom: hero.bottom, h: hero.height },
      head: head && { top: head.top, bottom: head.bottom },
      h1: h1 && { top: h1.top, bottom: h1.bottom, left: h1.left, right: h1.right },
      intro: intro && { top: intro.top, bottom: intro.bottom, left: intro.left },
      searchTop: search?.top,
      searchLeft: search?.left ?? firstCard?.left,
      nextTop: next?.top,
      firstCardTop: firstCard?.top,
      headerBottom: header?.bottom,
      panelOpen: panel ? getComputedStyle(panel).display !== "none" : false,
      panelBorder: panel ? getComputedStyle(panel).borderLeftWidth : null,
      chipLeft: legend?.left ?? chip?.left,
      h1Count: document.querySelectorAll("h1").length,
      h1Color: getComputedStyle(q("h1")!).color,
    };
  });
  s.measurements.portfolioTop = r;
  check(s, "portfolio:single-h1", r.h1Count === 1, `h1=${r.h1Count}`);
  if (withBanner) {
    check(s, "portfolio:title-on-banner", !!r.hero && !!r.h1 && r.h1.top >= r.hero.top - 0.5 && r.h1.bottom <= r.hero.bottom + 0.5 && (!r.intro || r.intro.bottom <= r.hero.bottom + 0.5), JSON.stringify({ hero: r.hero, h1: r.h1, intro: r.intro }));
    check(s, "portfolio:banner-under-header", !!r.hero && Math.abs(r.hero.top - (r.headerBottom ?? 0)) <= 1, `hero top ${r.hero?.top} header bottom ${r.headerBottom}`);
    check(s, "portfolio:content-follows-banner", r.nextTop !== undefined && !!r.hero && r.nextTop >= r.hero.bottom + 16 && r.nextTop <= r.hero.bottom + 64, `next ${r.nextTop} hero bottom ${r.hero?.bottom}`);
    const ratios = await overlayContrast(s, ["h1", ".i1-plist__intro"]);
    s.measurements.portfolioContrast = ratios;
    check(s, "portfolio:title-contrast-aa-large", (ratios.find((x) => x.sel === "h1")?.ratio ?? 0) >= 3, JSON.stringify(ratios));
    const intro = ratios.find((x) => x.sel === ".i1-plist__intro");
    if (intro) check(s, "portfolio:intro-contrast-aa", intro.ratio >= 4.5, JSON.stringify(ratios));
  } else {
    check(s, "portfolio:no-banner-plain-head", !r.hero && !!r.h1 && r.h1.top > (r.headerBottom ?? 0), JSON.stringify(r));
  }
  // one left edge: title, search and filter columns start on the page's content edge
  if (r.h1 && r.searchLeft !== undefined) check(s, "portfolio:title-and-filters-share-left-edge", Math.abs(r.h1.left - r.searchLeft) <= 1 && (r.chipLeft === undefined || !r.panelOpen || Math.abs(r.chipLeft - r.searchLeft) <= 1), `h1 ${r.h1.left} search ${r.searchLeft} chips ${r.chipLeft}`);
}

/**
 * Long title + description on the banner: the banner grows with the copy (never clips),
 * the copy stays inside it, and nothing overflows sideways. Mutates the DOM: run last.
 */
async function portfolioLongCopy(s: Session): Promise<void> {
  const r = await s.page.evaluate(() => {
    const ko = document.documentElement.lang.startsWith("ko");
    const fill = (n: number) => (ko ? "생활에맞춘공간을함께그립니다 " : "Wonderfully considered rooms ").repeat(20).slice(0, n);
    const h1 = document.querySelector<HTMLElement>("h1")!;
    const intro = document.querySelector<HTMLElement>(".i1-plist__intro p");
    const before = document.querySelector(".i1-plist__hero")!.getBoundingClientRect().height;
    h1.textContent = fill(80);
    if (intro) intro.textContent = fill(240);
    const hero = document.querySelector(".i1-plist__hero")!.getBoundingClientRect();
    const out: string[] = [];
    for (const e of [h1, intro].filter(Boolean) as HTMLElement[]) {
      const b = e.getBoundingClientRect();
      if (b.top < hero.top - 0.5 || b.bottom > hero.bottom + 0.5) out.push(`${e.tagName} ${Math.round(b.top)}–${Math.round(b.bottom)} vs banner ${Math.round(hero.top)}–${Math.round(hero.bottom)}`);
      if (e.scrollWidth > e.clientWidth + 1) out.push(`${e.tagName} inner overflow`);
    }
    return { out, before: Math.round(before), after: Math.round(hero.height), overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth };
  });
  check(s, "portfolio:long-copy-inside-banner", r.out.length === 0, `${r.out.join(", ")} (banner ${r.before}→${r.after})`);
  check(s, "portfolio:long-copy-no-overflow", r.overflow <= 0, `overflow=${r.overflow}`);
}

/** Open the /portfolio filter panel (collapsed by default) so its controls join the reachability test. */
async function filterPanelOpen(s: Session): Promise<void> {
  // below 900 the panel is collapsed behind its toggle; from 900 it is always open (no toggle)
  const toggle = s.page.locator(".i1-pfilter__toggle");
  if (await toggle.isVisible()) await toggle.click();
  await s.page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
  const chips = await s.page.locator(".i1-pfilter input").evaluateAll((els) => els.filter((e) => (e as HTMLElement).checkVisibility()).length);
  s.measurements.filterPanelOpenControls = chips;
  check(s, "filter-panel-open", chips > 5, `${chips} visible filter inputs`);
}

/**
 * Client-side navigation (an in-site link, rendered from the RSC payload — not a document
 * load): the seat is the SAME element afterwards (the shell owns it, so a chat launcher in the
 * seat would keep its state), still exactly one, still in the footer, still on its seat.
 */
async function seatSurvivesNavigation(s: Session, linkSelector: string, expectPath: RegExp): Promise<void> {
  await s.page.evaluate(() => ((document.querySelector(".i1-fcta") as unknown as { __seatMark?: number }).__seatMark = 1));
  const docMark = await s.page.evaluate(() => ((window as unknown as { __docMark?: number }).__docMark = 1));
  await s.page.locator(linkSelector).first().click();
  await s.page.waitForURL(expectPath);
  await s.page.waitForLoadState("networkidle");
  const r = await s.page.evaluate(() => ({
    path: location.pathname,
    softNav: (window as unknown as { __docMark?: number }).__docMark === 1,
    seats: document.querySelectorAll(".i1-fcta").length,
    same: (document.querySelector(".i1-fcta") as unknown as { __seatMark?: number } | null)?.__seatMark === 1,
    inFooter: !!document.querySelector("footer[data-section='site.footer'] > .i1-fcta:last-child"),
  }));
  s.measurements.seatNavigation = r;
  check(s, "cta:survives-client-navigation", docMark === 1 && r.softNav && r.seats === 1 && r.same && r.inFooter, JSON.stringify(r));
  await ctaChecks(s, PAGE_STOPS);
}

/**
 * First load (scroll 0) at common viewport sizes: the seat covers none of /portfolio's primary
 * filter controls (search, panel toggle, reset, sort). Chips and cards may pass under it while
 * scrolling like under any fixed element — the reachability test covers those.
 */
async function filterControlsClearAtLoad(s: Session, sizes: [number, number][]): Promise<void> {
  const vp = VIEWPORTS[s.viewport];
  const out: string[] = [];
  for (const [w, h] of sizes) {
    await s.page.setViewportSize({ width: w, height: h });
    await s.page.evaluate(() => window.scrollTo(0, 0));
    await s.page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
    const hits = await s.page.evaluate(() => {
      const c = document.querySelector(".i1-fcta__link")!.getBoundingClientRect();
      return Array.from(document.querySelectorAll<HTMLElement>(".i1-pfilter__input, .i1-pfilter__toggle, .i1-pfilter__reset, .i1-pfilter__select"))
        .filter((e) => e.checkVisibility())
        .map((e) => ({ e, r: e.getBoundingClientRect() }))
        .filter(({ r }) => r.width > 0 && r.left < c.right && r.right > c.left && r.top < c.bottom && r.bottom > c.top)
        .map(({ e }) => e.className.split(" ")[0]);
    });
    if (hits.length) out.push(`${w}×${h}: ${hits.join(", ")}`);
  }
  await s.page.setViewportSize({ width: vp.width, height: vp.height });
  check(s, "cta:filter-controls-clear-at-first-load", out.length === 0, out.join(" | ") || sizes.map(([w, h]) => `${w}×${h}`).join(" "));
}

/** The seat carries the site's own label on every page (fixture-small: Korean slot). */
async function koreanSeatLabel(s: Session): Promise<void> {
  check(s, "cta:site-label", (await s.page.textContent(".i1-fcta__link"))?.trim() === "상담 문의");
}

// ------------------------------------------------------------------ visits
interface VisitSpec {
  site: string;
  route: string;
  vp: ViewportName;
  name: string;
  run?: (s: Session) => Promise<void>;
  shot?: boolean;
  /** Expected HTTP status of the navigation (default 200; the site's own 404 page = 404). */
  status?: number;
}

async function visit(browser: Browser, origin: string, v: VisitSpec): Promise<void> {
  const s = await beginSession(browser, v.site, origin, v.route, v.vp);
  await runCommonChecks(s, v.status);
  // Chromium reports the expected 404 of the document itself as ONE console error; nothing else is excused
  if (v.status === 404) {
    const i = s.consoleErrors.findIndex((e) => /^Failed to load resource: the server responded with a status of 404/.test(e));
    if (i >= 0) s.consoleErrors.splice(i, 1);
  }
  await footerChecks(s);
  if (v.shot) await fullShot(s, v.name);
  if (v.run) await v.run(s);
  await finishSession(s);
}

async function firstDetailRoute(browser: Browser, origin: string): Promise<string> {
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  await page.goto(`${origin}/portfolio`, { waitUntil: "load" });
  const href = await page.evaluate(() => document.querySelector("[data-project-card] a[href^='/portfolio/']")?.getAttribute("href") ?? "");
  await ctx.close();
  return href;
}

async function runSite(browser: Browser, site: string, run: (origin: string) => Promise<void>): Promise<void> {
  const server = await serveStatic(await loadPackageRoot(root, site));
  const origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  try {
    await run(origin);
  } finally {
    server.close();
  }
}

async function main(): Promise<void> {
  await mkdir(outDir, { recursive: true });
  const browser = await chromium.launch();
  const want = (v: VisitSpec) => !only || `${v.site}${v.route}@${v.vp}`.includes(only);
  const go = async (origin: string, list: VisitSpec[]) => {
    for (const v of list.filter(want)) await visit(browser, origin, v);
  };
  try {
    await runSite(browser, "fixture-large", async (origin) => {
      const homeCta = async (s: Session) => {
        await ctaChecks(s);
        await tracksBarOnlyWhenScrollable(s);
      };
      const withReviews = (base: (s: Session) => Promise<void>) => async (s: Session) => {
        await reviewsChecks(s, "overflow");
        await base(s);
      };
      const home: VisitSpec[] = [
        { site: "fixture-large", route: "/", vp: "m320", name: "home", run: async (s) => { await homeCta(s); await footerLongValues(s); } },
        { site: "fixture-large", route: "/", vp: "m390", name: "home", shot: true, run: async (s) => { await withReviews(homeCta)(s); await ctaShots(s); await footerLongValues(s); } },
        { site: "fixture-large", route: "/", vp: "m430", name: "home", run: homeCta },
        { site: "fixture-large", route: "/", vp: "t800", name: "home", shot: true, run: async (s) => { await withReviews(homeCta)(s); await ctaShots(s); } },
        { site: "fixture-large", route: "/", vp: "d1000", name: "home", shot: true, run: withReviews(homeCta) },
        { site: "fixture-large", route: "/", vp: "d1440", name: "home", shot: true, run: async (s) => { await withReviews(homeCta)(s); await ctaShots(s); await layoutShiftChecks(s, 0); } },
        { site: "fixture-large", route: "/", vp: "d1920", name: "home", shot: true, run: homeCta },
      ];
      await go(origin, home);
      const portfolio: VisitSpec[] = (["m390", "t800", "d1000", "d1440"] as const).map((vp) => ({
        site: "fixture-large",
        route: "/portfolio",
        vp,
        name: "portfolio",
        shot: true,
        run: async (s: Session) => {
          // the seat first: the contrast probe below hides it for the rest of the visit
          await ctaChecks(s, PAGE_STOPS);
          if (vp === "d1440") await filterControlsClearAtLoad(s, FIRST_LOAD_SIZES);
          if (vp === "m390") await filterControlsClearAtLoad(s, [[320, 568], [375, 667], [390, 844], [430, 932]]);
          await portfolioTopChecks(s, true);
          await viewShot(s, "portfolio-top");
          await portfolioLongCopy(s);
        },
      }));
      await go(origin, portfolio);
      const detail = await firstDetailRoute(browser, origin);
      await go(
        origin,
        (["m390", "t800", "d1440"] as const).map((vp) => ({
          site: "fixture-large",
          route: detail,
          vp,
          name: "detail",
          shot: true,
          run: async (s: Session) => {
            await ctaChecks(s, PAGE_STOPS);
            // detail → "All projects" (client navigation to /portfolio)
            if (vp === "d1440") await seatSurvivesNavigation(s, "main a[href='/portfolio']", /\/portfolio$/);
          },
        })),
      );
      await go(origin, [
        { site: "fixture-large", route: "/portfolio/page/2", vp: "d1440", name: "portfolio-page-2", shot: true, run: async (s) => { await ctaChecks(s, PAGE_STOPS); await portfolioTopChecks(s, true); } },
        { site: "fixture-large", route: "/portfolio/page/2", vp: "m390", name: "portfolio-page-2", run: async (s) => { await ctaChecks(s, PAGE_STOPS); await seatSurvivesNavigation(s, "[data-project-card] a[href^='/portfolio/']", /\/portfolio\/[^/]+$/); } },
        // filtered URL state + the tallest control surface (the open filter panel at 390)
        { site: "fixture-large", route: "/portfolio?type=kitchen&sort=oldest", vp: "m390", name: "portfolio-filtered", run: async (s) => { check(s, "filter-state-from-url", await s.page.locator('fieldset[data-filter-group="type"] input[value="kitchen"]').isChecked()); await ctaChecks(s, PAGE_STOPS); } },
        { site: "fixture-large", route: "/portfolio", vp: "m390", name: "portfolio-panel-open", shot: true, run: async (s) => { await filterPanelOpen(s); await ctaChecks(s, PAGE_STOPS); } },
        { site: "fixture-large", route: "/portfolio", vp: "d1440", name: "portfolio-panel-open", run: async (s) => { await filterPanelOpen(s); await ctaChecks(s, PAGE_STOPS); } },
        // the site's own 404 page (served for every URL the build did not generate)
        { site: "fixture-large", route: "/no-such-page", vp: "m390", name: "not-found", status: 404, shot: true, run: (s) => ctaChecks(s, PAGE_STOPS) },
        { site: "fixture-large", route: "/portfolio/no-such-project", vp: "d1440", name: "not-found", status: 404, shot: true, run: (s) => ctaChecks(s, PAGE_STOPS) },
      ]);
    });
    await runSite(browser, "fixture-small", async (origin) => {
      await go(origin, [
        { site: "fixture-small", route: "/", vp: "m320", name: "home", shot: true, run: async (s) => { await ctaChecks(s); await footerLongValues(s); } },
        { site: "fixture-small", route: "/", vp: "m390", name: "home", run: async (s) => { await reviewsChecks(s, "overflow"); await ctaChecks(s); } },
        { site: "fixture-small", route: "/", vp: "d1440", name: "home", shot: true, run: async (s) => { await reviewsChecks(s, "fit"); await tracksBarOnlyWhenScrollable(s); await reviewsResize(s); await ctaChecks(s); await layoutShiftChecks(s, 0.05); } },
        { site: "fixture-small", route: "/portfolio", vp: "m390", name: "portfolio", run: async (s) => { await ctaChecks(s, PAGE_STOPS); await koreanSeatLabel(s); await portfolioTopChecks(s, false); } },
        { site: "fixture-small", route: "/portfolio", vp: "d1440", name: "portfolio", shot: true, run: async (s) => { await ctaChecks(s, PAGE_STOPS); await portfolioTopChecks(s, false); } },
        { site: "fixture-small", route: "/portfolio/maru-project-001", vp: "m390", name: "detail", shot: true, run: async (s) => { await ctaChecks(s, PAGE_STOPS); await koreanSeatLabel(s); } },
      ]);
    });
    await runSite(browser, "fixture-empty", async (origin) => {
      await go(origin, [
        { site: "fixture-empty", route: "/", vp: "m390", name: "home", run: async (s) => { check(s, "no-floating-cta-without-destination", (await s.page.locator(".i1-fcta").count()) === 0); } },
        { site: "fixture-empty", route: "/", vp: "d1440", name: "home" },
        { site: "fixture-empty", route: "/no-such-page", vp: "d1440", name: "not-found", status: 404, run: async (s) => { check(s, "no-floating-cta-without-destination", (await s.page.locator(".i1-fcta").count()) === 0); } },
      ]);
    });
  } finally {
    await browser.close();
  }
  const all = rows.flatMap((r) => r.checks);
  const failed = all.filter((c) => !c.pass);
  const totals = { visits: rows.length, checks: all.length, passed: all.length - failed.length, failed: failed.length };
  await writeFile(path.join(outDir, "summary.json"), `${JSON.stringify({ rows, totals }, null, 2)}\n`);
  console.log(`polish visual smoke: ${totals.passed}/${totals.checks} checks, ${totals.visits} visits`);
  if (failed.length > 0) process.exit(1);
}

await main();
