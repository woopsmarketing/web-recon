/**
 * Step 5 visual smoke: the complete interior-01 HOMEPAGE (hero carousel, intro, projects
 * A/B showcases, reviews, image band, floating contact CTA) plus a portfolio/detail
 * regression pass, against already-BUILT static site packages. Does NOT build anything —
 * it reads `data/site-builds/<site>/current.json` to find each site's current package and
 * serves it from a local nginx-`try_files`-style static server (same server + session
 * helpers as scripts/template-platform-step41-visual-smoke.ts; self-contained, no import).
 *
 * Every visit: HTTP 200, 0 console/page errors, 0 non-local requests, 0 failed
 * subresources, 0 broken images, 0 horizontal overflow, every internal link / in-page
 * anchor resolves. Homepage visits add section order, no empty wrappers, floating CTA,
 * hero carousel behaviour (autoplay, hover pause, arrows, dots, keyboard, pause/play,
 * swipe, 1-slide = static) and prefers-reduced-motion runs.
 *
 *   tsx scripts/template-platform-step5-visual-smoke.ts [outDir] [--root <dir>]
 *
 * `--root` defaults to cwd; `outDir` (screenshots + summary.json) defaults to
 * docs/result/recon-template-platform-step5-homepage/screens, resolved relative to cwd.
 */
import { createReadStream } from "node:fs";
import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import http from "node:http";
import type { AddressInfo } from "node:net";
import path from "node:path";
import { chromium, type Browser, type BrowserContext, type Page } from "playwright";

// ---------------------------------------------------------------- CLI args
const argv = process.argv.slice(2);
let rootArg = process.cwd();
let outDirArg: string | undefined;
for (let i = 0; i < argv.length; i++) {
  if (argv[i] === "--root") rootArg = argv[++i] ?? rootArg;
  else if (outDirArg === undefined) outDirArg = argv[i];
}
const root = path.resolve(rootArg);
const outDir = path.resolve(outDirArg ?? "docs/result/recon-template-platform-step5-homepage/screens");

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


// ------------------------------------------------------------------ views
type ViewportName = "desktop-1440" | "tablet-1000" | "mobile-390" | "laptop-1440x700" | "desktop-1920" | "short-900x600" | "mobile-320";
const VIEWPORTS: Record<ViewportName, { width: number; height: number; deviceScaleFactor: number; isMobile: boolean }> = {
  "desktop-1440": { width: 1440, height: 900, deviceScaleFactor: 1, isMobile: false },
  "tablet-1000": { width: 1000, height: 800, deviceScaleFactor: 1, isMobile: false },
  "mobile-390": { width: 390, height: 844, deviceScaleFactor: 2, isMobile: true },
  // viewport height caps the hero below the image's natural height
  "laptop-1440x700": { width: 1440, height: 700, deviceScaleFactor: 1, isMobile: false },
  "desktop-1920": { width: 1920, height: 1080, deviceScaleFactor: 1, isMobile: false },
  "short-900x600": { width: 900, height: 600, deviceScaleFactor: 1, isMobile: false },
  "mobile-320": { width: 320, height: 640, deviceScaleFactor: 2, isMobile: true },
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

async function beginSession(browser: Browser, site: string, origin: string, route: string, vpName: ViewportName, reducedMotion = false): Promise<Session> {
  const vp = VIEWPORTS[vpName];
  const ctx = await browser.newContext({
    viewport: { width: vp.width, height: vp.height },
    deviceScaleFactor: vp.deviceScaleFactor,
    isMobile: vp.isMobile,
    hasTouch: vp.isMobile,
    reducedMotion: reducedMotion ? "reduce" : "no-preference",
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
  const file = `${s.site}--${name}--${s.viewport}.png`; // name carries any variant tag (e.g. home-reduced-motion)
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


// ------------------------------------------------------------ page helpers
const HOME_ORDER = ["home.hero", "home.intro", "home.projects-a", "home.projects-b", "home.reviews", "home.image-band"];

/** Every same-site link on the page resolves (200) and every in-page #anchor has a target. */
async function checkInternalLinks(s: Session): Promise<void> {
  const { paths, anchors } = await s.page.evaluate(() => {
    const hrefs = Array.from(document.querySelectorAll("a[href]")).map((a) => a.getAttribute("href") ?? "");
    return {
      paths: Array.from(new Set(hrefs.filter((h) => h.startsWith("/")))),
      anchors: Array.from(new Set(hrefs.filter((h) => h.startsWith("#")))).map((h) => ({ h, ok: !!document.getElementById(h.slice(1)) })),
    };
  });
  const results: { href: string; status: number }[] = await s.page.evaluate(async (list: string[]) => {
    const out: { href: string; status: number }[] = [];
    for (const href of list) {
      try {
        out.push({ href, status: (await fetch(href)).status });
      } catch {
        out.push({ href, status: -1 });
      }
    }
    return out;
  }, paths);
  const bad = results.filter((r) => r.status !== 200);
  check(s, "internal-links-resolve", bad.length === 0, bad.map((r) => `${r.status}: ${r.href}`).join(", "));
  const dead = anchors.filter((a) => !a.ok).map((a) => a.h);
  check(s, "in-page-anchors-resolve", dead.length === 0, dead.join(", "));
  const external = await s.page.evaluate(() =>
    Array.from(document.querySelectorAll("a[href]"))
      .map((a) => a.getAttribute("href") ?? "")
      .filter((h) => /^(https?:)?\/\//.test(h)),
  );
  check(s, "no-external-links", external.length === 0, external.join(", "));
}

/** The showcase "view all" link follows its track in the DOM (reading/tab order = visual order on mobile). */
async function moreLinkAfterTrack(s: Session): Promise<void> {
  const ok = await s.page.evaluate(() =>
    Array.from(document.querySelectorAll(".i1-projects")).every((sec) => {
      const more = sec.querySelector("[data-more-link]");
      const track = sec.querySelector("[data-track]");
      return !more || (!!track && !!(track.compareDocumentPosition(more) & Node.DOCUMENT_POSITION_FOLLOWING));
    }),
  );
  check(s, "more-link-after-track", ok);
}

/** Navigating to an in-page anchor leaves the target's top below the sticky header. */
async function anchorLandsBelowHeader(s: Session, hash: string): Promise<void> {
  await s.page.evaluate((h) => document.querySelector(h)!.scrollIntoView(), hash);
  await s.page.waitForTimeout(300);
  const r = await s.page.evaluate((h) => ({ top: document.querySelector(h)!.getBoundingClientRect().top, header: document.querySelector(".i1-header")!.getBoundingClientRect().bottom }), hash);
  check(s, `anchor-below-header:${hash}`, r.top >= r.header, JSON.stringify(r));
  await s.page.evaluate(() => window.scrollTo(0, 0));
}

async function sectionOrder(page: Page): Promise<{ main: string[]; all: string[] }> {
  return page.evaluate(() => ({
    main: Array.from(document.querySelectorAll("main [data-section]")).map((e) => e.getAttribute("data-section") ?? ""),
    all: Array.from(document.querySelectorAll("[data-section]")).map((e) => e.getAttribute("data-section") ?? ""),
  }));
}

async function checkHomeStructure(s: Session, expectedMain: string[], cta: boolean): Promise<void> {
  const order = await sectionOrder(s.page);
  const want = HOME_ORDER.filter((id) => expectedMain.includes(id));
  check(s, "section-order", JSON.stringify(order.main) === JSON.stringify(want), `${order.main.join(",")} ≠ ${want.join(",")}`);
  const tail = ["site.footer", ...(cta ? ["site.floating-cta"] : [])];
  check(s, "header-first-footer-last", order.all[0] === "site.header" && JSON.stringify(order.all.slice(-tail.length)) === JSON.stringify(tail), order.all.join(","));
  // every rendered section is visible and non-empty (no empty wrappers)
  const empty = await s.page.evaluate(() =>
    Array.from(document.querySelectorAll("main [data-section]"))
      .filter((e) => {
        const r = e.getBoundingClientRect();
        const cs = getComputedStyle(e);
        return r.height < 40 || cs.visibility === "hidden" || cs.display === "none";
      })
      .map((e) => e.getAttribute("data-section")),
  );
  check(s, "no-empty-or-hidden-sections", empty.length === 0, empty.join(","));
  const fcta = await s.page.evaluate(() => {
    const el = document.querySelector<HTMLElement>(".i1-fcta__link");
    if (!el) return undefined;
    const r = el.getBoundingClientRect();
    return {
      position: getComputedStyle(el.parentElement!).position,
      // in the contentinfo landmark (not loose outside every landmark)
      inFooter: !!el.closest("footer[data-section='site.footer']"),
      inViewport: r.top >= 0 && r.left >= 0 && r.bottom <= window.innerHeight && r.right <= window.innerWidth && r.width >= 44 && r.height >= 44,
      href: el.getAttribute("href") ?? "",
    };
  });
  if (cta) check(s, "floating-cta-fixed-in-viewport", !!fcta && fcta.position === "fixed" && fcta.inFooter && fcta.inViewport && fcta.href.startsWith("mailto:"), JSON.stringify(fcta));
  if (cta) {
    // on top of whatever it overlaps at the top of the page (hero, controls, sticky header)
    const hit = await s.page.evaluate(() => {
      window.scrollTo(0, 0);
      const r = document.querySelector<HTMLElement>(".i1-fcta__link")!.getBoundingClientRect();
      const top = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
      return top?.closest(".i1-fcta__link") ? "cta" : (top?.className.toString() ?? "none");
    });
    check(s, "floating-cta-on-top", hit === "cta", hit);
  }
  else check(s, "floating-cta-absent", fcta === undefined, JSON.stringify(fcta));
}

interface HeroState {
  index: number;
  rotating: string | null;
  paused: string | null;
  toggleLabel: string | null;
  toggleVisible: boolean;
  activeOpacity: number;
  currentDot: number;
}
async function heroState(page: Page): Promise<HeroState> {
  return page.evaluate(() => {
    const hero = document.querySelector<HTMLElement>(".i1-hero")!;
    const slides = Array.from(hero.querySelectorAll<HTMLElement>("[data-hero-slide]"));
    const index = slides.findIndex((x) => x.dataset.active === "true");
    const toggle = hero.querySelector<HTMLElement>("[data-hero-toggle]");
    const dots = Array.from(hero.querySelectorAll<HTMLElement>("[data-hero-dot]"));
    return {
      index,
      rotating: hero.getAttribute("data-rotating"),
      paused: hero.getAttribute("data-paused"),
      toggleLabel: toggle?.getAttribute("aria-label") ?? null,
      toggleVisible: !!toggle && getComputedStyle(toggle).display !== "none",
      activeOpacity: index >= 0 ? Number(getComputedStyle(slides[index]!).opacity) : -1,
      currentDot: dots.findIndex((d) => d.getAttribute("aria-current") === "true"),
    };
  });
}
async function waitForIndex(page: Page, index: number, timeout: number): Promise<boolean> {
  return page
    .waitForFunction((i) => document.querySelectorAll("[data-hero-slide]")[i]?.getAttribute("data-active") === "true", index, { timeout })
    .then(() => true)
    .catch(() => false);
}
/** Park the pointer away from the hero (hover pauses the autoplay timer). */
async function pointerAway(page: Page): Promise<void> {
  const h = await page.evaluate(() => document.querySelector(".i1-footer")!.getBoundingClientRect().top + window.scrollY);
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.mouse.move(2, Math.min(h, 4));
}

/** Prev/next arrows never overlap any slide's copy (headline, text, CTA) — measured on every slide. */
async function heroArrowsClearOfCopy(s: Session): Promise<void> {
  const hits = await s.page.evaluate(() => {
    const arrows = Array.from(document.querySelectorAll<HTMLElement>(".i1-hero__arrow")).map((a) => a.getBoundingClientRect());
    const out: string[] = [];
    for (const el of Array.from(document.querySelectorAll<HTMLElement>(".i1-hero__copy > *"))) {
      const r = el.getBoundingClientRect();
      for (const a of arrows) {
        if (a.width && r.width && a.left < r.right && a.right > r.left && a.top < r.bottom && a.bottom > r.top) out.push(el.className || el.tagName);
      }
    }
    return out;
  });
  check(s, "hero:arrows-clear-of-copy", hits.length === 0, hits.join(", "));
}

/**
 * Stress: every slide's copy at the schema maximum (headline 80, text 160 chars; Korean
 * without spaces inside long words is the worst case under keep-all). The copy must stay
 * inside the hero (the hero grows rather than clipping), clear of the arrows, with no
 * horizontal overflow, and the scrim (the copy block's ::before) must reach 200px above it.
 * Mutates the DOM: run last in a session.
 */
async function heroLongCopy(s: Session): Promise<void> {
  const r = await s.page.evaluate(() => {
    const ko = document.documentElement.lang.startsWith("ko");
    const fill = (n: number) => (ko ? "생활에맞춘공간을함께그립니다 " : "Wonderfully considered rooms ").repeat(20).slice(0, n);
    const slides = document.querySelector<HTMLElement>(".i1-hero__slides")!;
    const before = slides.getBoundingClientRect().height;
    for (const c of Array.from(document.querySelectorAll<HTMLElement>(".i1-hero__copy"))) {
      const h = c.querySelector(".i1-hero__headline");
      const t = c.querySelector(".i1-hero__text");
      const cta = c.querySelector(".i1-pill");
      if (h) h.textContent = fill(80);
      if (t) t.textContent = fill(160);
      if (cta?.firstChild) cta.firstChild.textContent = fill(32);
    }
    const box = slides.getBoundingClientRect();
    const out: string[] = [];
    for (const c of Array.from(document.querySelectorAll<HTMLElement>(".i1-hero__copy"))) {
      const cr = c.getBoundingClientRect();
      for (const e of Array.from(c.children) as HTMLElement[]) {
        const er = e.getBoundingClientRect();
        if (er.top < box.top - 0.5 || er.bottom > box.bottom + 0.5 || er.left < box.left - 0.5 || er.right > box.right + 0.5) out.push(`${e.className}@${Math.round(er.top)}-${Math.round(er.bottom)} vs ${Math.round(box.top)}-${Math.round(box.bottom)}`);
        // nothing overflows its own box sideways (clipped by the slides box, invisible to the page)
        if (e.scrollWidth > e.clientWidth + 1) out.push(`${e.className} inner overflow ${e.scrollWidth}>${e.clientWidth}`);
      }
      // the scrim (the copy block's ::before) spans the whole slide width, from 200px above
      // the copy down to the hero's bottom edge
      const scrim = getComputedStyle(c, "::before");
      const sl = cr.left + parseFloat(scrim.left);
      const sr = sl + parseFloat(scrim.width);
      const st = cr.top + parseFloat(scrim.top);
      const sb = cr.bottom - parseFloat(scrim.bottom);
      if (scrim.content === "none" || sl > box.left + 0.5 || sr < box.right - 0.5 || st > cr.top - 199.5 || Math.abs(sb - box.bottom) > 0.5) {
        out.push(`scrim ${Math.round(sl)},${Math.round(st)}–${Math.round(sr)},${Math.round(sb)} vs slides ${Math.round(box.left)}–${Math.round(box.right)} bottom ${Math.round(box.bottom)}, copy top ${Math.round(cr.top)}`);
      }
    }
    return {
      out,
      before: Math.round(before),
      after: Math.round(box.height),
      overflow: Math.max(document.documentElement.scrollWidth - document.documentElement.clientWidth, slides.scrollWidth - slides.clientWidth - 1),
    };
  });
  check(s, "hero:long-copy-inside-hero", r.out.length === 0, `${r.out.join(", ")} (hero ${r.before}→${r.after})`);
  check(s, "hero:long-copy-no-overflow", r.overflow <= 0, `overflow=${r.overflow}`);
  const hits = await s.page.evaluate(() => {
    const arrows = Array.from(document.querySelectorAll<HTMLElement>(".i1-hero__arrow")).map((a) => a.getBoundingClientRect());
    return Array.from(document.querySelectorAll<HTMLElement>(".i1-hero__copy > *")).filter((e) => {
      const q = e.getBoundingClientRect();
      return arrows.some((a) => a.width && q.width && a.left < q.right && a.right > q.left && a.top < q.bottom && a.bottom > q.top);
    }).length;
  });
  check(s, "hero:long-copy-arrows-clear", hits === 0, `hits=${hits}`);
  await s.page.evaluate(() => window.scrollTo(0, 0));
  const file = path.join(outDir, `${s.site}--home-hero-long-copy--${s.viewport}.png`);
  await s.page.screenshot({ path: file }).catch(() => {});
  s.screenshots.push(path.relative(process.cwd(), file));
}

/** Keyboard paging to the end of a track keeps focus on the (now inert) button. */
async function trackFocusKeptAtEnd(s: Session, sectionId: string, label: string): Promise<void> {
  const next = `[data-section="${sectionId}"] .i1-track__btn >> nth=1`;
  if (!(await s.page.isVisible(next))) return;
  await s.page.focus(next);
  for (let i = 0; i < 6; i++) {
    await s.page.keyboard.press("Enter");
    await s.page.waitForTimeout(450);
  }
  const st = await s.page.evaluate((q) => {
    const btn = document.querySelectorAll(`${q} .i1-track__btn`)[1];
    return { focused: document.activeElement === btn, ariaDisabled: btn?.getAttribute("aria-disabled") };
  }, `[data-section="${sectionId}"]`);
  check(s, `track:${label}:focus-kept-at-end`, st.focused && st.ariaDisabled === "true", JSON.stringify(st));
}

/** Desktop carousel: autoplay advances, hover pauses, arrows/dots/keyboard navigate and stop rotation, pause/play toggles. */
async function heroInteractionDesktop(s: Session, slides: number): Promise<void> {
  const page = s.page;
  // fresh page: earlier checks in this visit may have let autoplay advance already
  await page.reload({ waitUntil: "networkidle" });
  await pointerAway(page);
  let st = await heroState(page);
  check(s, "hero:initial-first-slide-rotating", st.index === 0 && st.rotating === "true" && st.currentDot === 0 && st.activeOpacity === 1, JSON.stringify(st));
  check(s, "hero:autoplay-advances", await waitForIndex(page, 1, 8000));
  // hover pauses: the timer animation is paused while the pointer is over the hero
  await page.hover(".i1-hero__slides");
  st = await heroState(page);
  const playState = await page.evaluate(() => {
    const f = document.querySelector<HTMLElement>(".i1-hero__fill.is-timing");
    return f ? getComputedStyle(f).animationPlayState : "none";
  });
  check(s, "hero:hover-pauses-timer", st.paused === "true" && playState === "paused", `${st.paused} ${playState}`);
  await pointerAway(page);
  // arrows (manual → rotation stops)
  const before = (await heroState(page)).index;
  await page.click(".i1-hero__arrow--next");
  st = await heroState(page);
  check(s, "hero:next-arrow", st.index === (before + 1) % slides && st.rotating === "false" && st.toggleLabel !== null, JSON.stringify(st));
  await page.click(".i1-hero__arrow--prev");
  check(s, "hero:prev-arrow", (await heroState(page)).index === before);
  await page.click(`[data-hero-dot="${slides - 1}"]`);
  st = await heroState(page);
  check(s, "hero:dot-jumps", st.index === slides - 1 && st.currentDot === slides - 1, JSON.stringify(st));
  await pointerAway(page);
  await page.waitForTimeout(6500);
  check(s, "hero:manual-navigation-stops-rotation", (await heroState(page)).index === slides - 1);
  // play resumes (pointer away so hover does not pause it)
  await page.click("[data-hero-toggle]");
  await pointerAway(page);
  st = await heroState(page);
  check(s, "hero:play-resumes", st.rotating === "true", JSON.stringify(st));
  check(s, "hero:autoplay-wraps-to-first", await waitForIndex(page, 0, 8000));
  // pause stops it again
  await page.click("[data-hero-toggle]");
  await pointerAway(page);
  const paused = (await heroState(page)).index;
  await page.waitForTimeout(6500);
  st = await heroState(page);
  check(s, "hero:pause-stops", st.rotating === "false" && st.index === paused, JSON.stringify(st));
  // keyboard: arrow keys inside the controls
  await page.focus(".i1-hero__arrow--next");
  await page.keyboard.press("ArrowRight");
  check(s, "hero:keyboard-arrow-right", (await heroState(page)).index === (paused + 1) % slides);
  await page.keyboard.press("ArrowLeft");
  check(s, "hero:keyboard-arrow-left", (await heroState(page)).index === paused);
  // inactive slides are inert: nothing focusable inside them is reachable
  const inertOk = await page.evaluate(() =>
    Array.from(document.querySelectorAll('[data-hero-slide][data-active="false"]')).every((x) => x.hasAttribute("inert") && x.getAttribute("aria-hidden") === "true"),
  );
  check(s, "hero:inactive-slides-inert", inertOk);
}

/** Mobile carousel: a horizontal touch swipe changes slide; a vertical-ish short move does not. */
async function heroSwipeMobile(s: Session): Promise<void> {
  const page = s.page;
  const swipe = (from: number, to: number) =>
    page.evaluate(
      ([a, b]) => {
        const el = document.querySelector(".i1-hero__slides")!;
        const r = el.getBoundingClientRect();
        const y = r.top + r.height / 2;
        const opts = (x: number) => ({ pointerType: "touch", pointerId: 7, isPrimary: true, clientX: x, clientY: y, bubbles: true, cancelable: true });
        el.dispatchEvent(new PointerEvent("pointerdown", opts(a!)));
        el.dispatchEvent(new PointerEvent("pointerup", opts(b!)));
      },
      [from, to],
    );
  // a tap is not a hover: rotation must continue after tapping the slide image
  const box = (await page.locator(".i1-hero__slides").boundingBox())!;
  await page.touchscreen.tap(box.x + 12, box.y + 12);
  const tapped = await heroState(page);
  check(s, "hero:tap-does-not-pause", tapped.paused === null && tapped.rotating === "true", JSON.stringify(tapped));
  check(s, "hero:autoplay-after-tap", await waitForIndex(page, (tapped.index + 1) % (await page.locator("[data-hero-slide]").count()), 8000));
  const start = (await heroState(page)).index;
  await swipe(300, 120);
  const total = await page.locator("[data-hero-slide]").count();
  let st = await heroState(page);
  check(s, "hero:swipe-left-next", st.index === (start + 1) % total && st.rotating === "false", JSON.stringify(st));
  await swipe(100, 290);
  check(s, "hero:swipe-right-prev", (await heroState(page)).index === start);
  await swipe(200, 180);
  check(s, "hero:short-move-ignored", (await heroState(page)).index === start);
}

/** A showcase/review track: next pages forward (scroll moves, thumb moves, prev enables). */
async function trackPaging(s: Session, sectionId: string, label: string): Promise<void> {
  const sel = `[data-section="${sectionId}"]`;
  const read = () =>
    s.page.evaluate((q) => {
      const root = document.querySelector(q)!;
      const list = root.querySelector<HTMLElement>(".i1-track__list")!;
      const btns = root.querySelectorAll<HTMLButtonElement>(".i1-track__btn");
      const thumb = root.querySelector<HTMLElement>(".i1-track__thumb");
      return {
        left: list.scrollLeft,
        max: list.scrollWidth - list.clientWidth,
        prevDisabled: btns[0] ? btns[0].getAttribute("aria-disabled") === "true" : null,
        nextDisabled: btns[1] ? btns[1].getAttribute("aria-disabled") === "true" : null,
        thumbLeft: thumb?.style.left ?? "",
        scrollable: root.querySelector(".i1-track")?.getAttribute("data-scrollable"),
      };
    }, sel);
  const a = await read();
  if (a.max <= 1) {
    check(s, `track:${label}:not-scrollable-hides-bar`, a.scrollable === "false", JSON.stringify(a));
    return;
  }
  check(s, `track:${label}:initial`, a.left === 0 && a.prevDisabled === true && a.nextDisabled === false && a.scrollable === "true", JSON.stringify(a));
  const nextVisible = await s.page.isVisible(`${sel} .i1-track__btn >> nth=1`);
  if (nextVisible) {
    await s.page.click(`${sel} .i1-track__btn >> nth=1`);
  } else {
    // touch widths: the list itself is the control (native swipe) — emulate a scroll
    await s.page.evaluate((q) => document.querySelector(q)!.querySelector<HTMLElement>(".i1-track__list")!.scrollBy({ left: 400 }), sel);
  }
  await s.page.waitForFunction((q) => document.querySelector(q)!.querySelector<HTMLElement>(".i1-track__list")!.scrollLeft > 0, sel, { timeout: 3000 }).catch(() => {});
  await s.page.waitForTimeout(700);
  const b = await read();
  check(s, `track:${label}:pages-forward`, b.left > 0 && b.prevDisabled === false && b.thumbLeft !== a.thumbLeft, `${JSON.stringify(a)} → ${JSON.stringify(b)}`);
}

async function checkReducedMotion(s: Session): Promise<void> {
  await pointerAway(s.page);
  const st0 = await heroState(s.page);
  check(s, "reduced-motion:hero-visible-no-toggle", st0.index === 0 && st0.activeOpacity === 1 && !st0.toggleVisible, JSON.stringify(st0));
  const headline = await s.page.isVisible(".i1-hero__slide[data-active='true'] .i1-hero__headline");
  check(s, "reduced-motion:hero-copy-visible", headline);
  await s.page.waitForTimeout(6500);
  check(s, "reduced-motion:no-auto-rotation", (await heroState(s.page)).index === 0);
  // dots exist at every width (arrows are desktop-only; touch widths also swipe)
  await s.page.click('[data-hero-dot="1"]');
  const st1 = await heroState(s.page);
  check(s, "reduced-motion:manual-navigation-works", st1.index === 1 && st1.activeOpacity === 1, JSON.stringify(st1));
  const hidden = await s.page.evaluate(() =>
    Array.from(document.querySelectorAll<HTMLElement>("main h2, main img, main blockquote, main a"))
      .filter((e) => !e.closest('[data-active="false"]'))
      .filter((e) => {
        const cs = getComputedStyle(e);
        return cs.visibility === "hidden" || Number(cs.opacity) < 1 || cs.display === "none";
      })
      .map((e) => e.className || e.tagName),
  );
  check(s, "reduced-motion:no-hidden-content", hidden.length === 0, hidden.slice(0, 5).join(", "));
}

/** §36 per-section captures: projects A/B, reviews, image band, and a mid-page view with the floating CTA. */
async function sectionShots(s: Session): Promise<void> {
  for (const [id, name] of [["home.projects-a", "projects-a"], ["home.projects-b", "projects-b"], ["home.reviews", "reviews"], ["home.image-band", "image-band"]] as const) {
    const file = path.join(outDir, `${s.site}--home-section-${name}--${s.viewport}.png`);
    const ok = await s.page
      .locator(`[data-section="${id}"]`)
      .screenshot({ path: file })
      .then(() => true)
      .catch(() => false);
    check(s, `screenshot:section-${name}`, ok);
    if (ok) s.screenshots.push(path.relative(process.cwd(), file));
  }
  await s.page.evaluate(() => document.querySelector('[data-section="home.reviews"]')?.scrollIntoView({ block: "center" }));
  await s.page.waitForTimeout(300);
  const file = path.join(outDir, `${s.site}--home-floating-cta--${s.viewport}.png`);
  await s.page.screenshot({ path: file });
  s.screenshots.push(path.relative(process.cwd(), file));
  await s.page.evaluate(() => window.scrollTo(0, 0));
}

// ------------------------------------------------------------------ visits
async function visitHome(
  browser: Browser,
  site: string,
  origin: string,
  vp: ViewportName,
  expect: { main: string[]; cta: boolean; slides: number; lang: string },
  extra?: (s: Session) => Promise<void>,
  opts: { reducedMotion?: boolean; tag?: string; sections?: boolean } = {},
): Promise<void> {
  const s = await beginSession(browser, site, origin, "/", vp, opts.reducedMotion);
  await runCommonChecks(s);
  check(s, "html-lang", (await s.page.getAttribute("html", "lang")) === expect.lang);
  await checkHomeStructure(s, expect.main, expect.cta);
  const slides = await s.page.evaluate(() => document.querySelectorAll("[data-hero-slide]").length);
  const controls = await s.page.evaluate(() => !!document.querySelector("[data-hero-controls]"));
  check(s, "hero-slide-count", slides === expect.slides, `slides=${slides}`);
  check(s, "hero-controls-iff-multiple", controls === expect.slides > 1, `controls=${controls}`);
  // every slide's copy (headline, text, CTA) lies inside the visible hero box — at any viewport height
  const outside = await s.page.evaluate(() => {
    const box = document.querySelector(".i1-hero__slides")?.getBoundingClientRect();
    if (!box) return [];
    return Array.from(document.querySelectorAll<HTMLElement>(".i1-hero__copy > *"))
      .map((e) => ({ e, r: e.getBoundingClientRect() }))
      .filter(({ r }) => r.top < box.top - 0.5 || r.bottom > box.bottom + 0.5 || r.left < box.left - 0.5 || r.right > box.right + 0.5)
      .map(({ e, r }) => `${e.className}@${Math.round(r.top)}-${Math.round(r.bottom)} vs ${Math.round(box.top)}-${Math.round(box.bottom)}`);
  });
  check(s, "hero:copy-inside-visible-hero", outside.length === 0, outside.join(", "));
  await checkInternalLinks(s);
  await screenshot(s, `home${opts.tag ? `-${opts.tag}` : ""}`);
  await s.page.evaluate(() => window.scrollTo(0, 0));
  const file = path.join(outDir, `${site}--home${opts.tag ? `-${opts.tag}` : ""}-top--${vp}.png`);
  await s.page.screenshot({ path: file }).catch(() => {});
  s.screenshots.push(path.relative(process.cwd(), file));
  if (opts.sections) await sectionShots(s);
  if (extra) await extra(s);
  await finishSession(s);
}

async function visitPage(browser: Browser, site: string, origin: string, route: string, vp: ViewportName, name: string): Promise<void> {
  const s = await beginSession(browser, site, origin, route, vp);
  await runCommonChecks(s);
  await checkInternalLinks(s);
  check(s, "no-homepage-sections", (await s.page.evaluate(() => document.querySelectorAll('main [data-section^="home."]').length)) === 0);
  await screenshot(s, name);
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

// ------------------------------------------------------------------- main
async function runSite<T>(browser: Browser, site: string, run: (origin: string) => Promise<T>): Promise<T> {
  const pkgRoot = await loadPackageRoot(root, site);
  const server = await serveStatic(pkgRoot);
  const origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  try {
    return await run(origin);
  } finally {
    server.close();
  }
}

async function main(): Promise<void> {
  await mkdir(outDir, { recursive: true });
  const browser = await chromium.launch();
  const full = { main: HOME_ORDER, cta: true };
  try {
    await runSite(browser, "fixture-large", async (origin) => {
      const large = { ...full, slides: 3, lang: "en-US" };
      await visitHome(browser, "fixture-large", origin, "desktop-1440", large, async (s) => {
        await heroArrowsClearOfCopy(s);
        await moreLinkAfterTrack(s);
        await trackPaging(s, "home.projects-a", "projects-a");
        await trackPaging(s, "home.projects-b", "projects-b");
        await trackPaging(s, "home.reviews", "reviews");
        await trackFocusKeptAtEnd(s, "home.reviews", "reviews");
        await heroInteractionDesktop(s, 3);
      }, { sections: true });
      await visitHome(browser, "fixture-large", origin, "tablet-1000", large, async (s) => {
        await heroArrowsClearOfCopy(s);
        await trackPaging(s, "home.projects-a", "projects-a");
      }, { sections: true });
      await visitHome(browser, "fixture-large", origin, "mobile-390", large, async (s) => {
        await heroSwipeMobile(s);
        await trackPaging(s, "home.projects-a", "projects-a");
        await trackPaging(s, "home.reviews", "reviews");
      }, { sections: true });
      await visitHome(browser, "fixture-large", origin, "laptop-1440x700", large, async (s) => {
        await heroArrowsClearOfCopy(s);
        await heroLongCopy(s);
      });
      await visitHome(browser, "fixture-large", origin, "desktop-1920", large, async (s) => {
        await heroArrowsClearOfCopy(s);
        await heroLongCopy(s);
      });
      await visitHome(browser, "fixture-large", origin, "desktop-1440", large, checkReducedMotion, { reducedMotion: true, tag: "reduced-motion" });
      await visitHome(browser, "fixture-large", origin, "mobile-390", large, checkReducedMotion, { reducedMotion: true, tag: "reduced-motion" });
      await visitPage(browser, "fixture-large", origin, "/portfolio", "desktop-1440", "portfolio");
      await visitPage(browser, "fixture-large", origin, "/portfolio", "mobile-390", "portfolio");
      const detail = await firstDetailRoute(browser, origin);
      await visitPage(browser, "fixture-large", origin, detail, "desktop-1440", "detail");
      await visitPage(browser, "fixture-large", origin, detail, "mobile-390", "detail");
    });
    await runSite(browser, "fixture-small", async (origin) => {
      const small = { ...full, slides: 2, lang: "ko-KR" };
      await visitHome(browser, "fixture-small", origin, "desktop-1440", small, async (s) => {
        check(s, "korean-cta-label", (await s.page.textContent(".i1-fcta__link"))?.trim() === "상담 문의");
        await heroArrowsClearOfCopy(s);
        await anchorLandsBelowHeader(s, "#projects");
        await trackPaging(s, "home.projects-a", "projects-a");
        await heroInteractionDesktop(s, 2);
      });
      await visitHome(browser, "fixture-small", origin, "mobile-390", small, async (s) => {
        await heroSwipeMobile(s);
        await heroLongCopy(s);
      });
      await visitHome(browser, "fixture-small", origin, "short-900x600", small, async (s) => {
        await heroArrowsClearOfCopy(s);
        await heroLongCopy(s);
      });
      await visitHome(browser, "fixture-small", origin, "mobile-320", small, heroLongCopy);
    });
    await runSite(browser, "fixture-empty", async (origin) => {
      const empty = { main: ["home.hero", "home.intro"], cta: false, slides: 1, lang: "en-GB" };
      const noNav = async (s: Session) => {
        const portfolioLinks = await s.page.evaluate(() => Array.from(document.querySelectorAll("a[href]")).filter((a) => (a.getAttribute("href") ?? "").startsWith("/portfolio")).length);
        check(s, "no-portfolio-navigation", portfolioLinks === 0, `links=${portfolioLinks}`);
        await s.page.waitForTimeout(1500);
        check(s, "single-slide-static", (await heroState(s.page)).index === 0);
      };
      await visitHome(browser, "fixture-empty", origin, "desktop-1440", empty, noNav);
      await visitHome(browser, "fixture-empty", origin, "mobile-390", empty, noNav);
      await visitHome(browser, "fixture-empty", origin, "laptop-1440x700", empty, async (s) => {
        await noNav(s);
        await heroLongCopy(s);
      });
      await quickStatusCheck(browser, "fixture-empty", origin, "/portfolio", 404);
    });
  } finally {
    await browser.close();
  }

  const allChecks = rows.flatMap((r) => r.checks);
  const failed = allChecks.filter((c) => !c.pass);
  const totals = { visits: rows.length, checks: allChecks.length, passed: allChecks.length - failed.length, failed: failed.length };
  await writeFile(path.join(outDir, "summary.json"), `${JSON.stringify({ rows, totals }, null, 2)}\n`);
  console.log(`step5 visual smoke: ${totals.passed}/${totals.checks} checks, ${totals.visits} visits`);
  if (failed.length > 0) process.exit(1);
}

await main();
