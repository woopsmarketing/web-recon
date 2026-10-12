import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import http from "node:http";
import type { AddressInfo } from "node:net";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { chromium, type Browser } from "playwright";
import { PNG } from "pngjs";
import { buildSite } from "../../platform/build/site-build";
import { RUNTIME_FILE, SHELL_FILE } from "../../platform/portfolio-runtime/contract";
import type { PortfolioSiteInput, PortfolioSiteResult } from "../../platform/portfolio-runtime/entry";
import { RENDERER_FILE, buildRuntimeKit } from "../../platform/portfolio-runtime/kit";
import { makeDesignRoot, type DesignRoot, type ReleasePin } from "../../platform/design/dev/fixture-root";
import { makeFixture, type Fixture, type FixtureOptions } from "../../platform/design/dev/make-fixture";

/**
 * The design harness: build a fixture → serve its package locally → look at it.
 *
 *   openDesignRoot    a design root in a fresh temporary directory (dev release cut from the working tree)
 *   buildFixture      fixture site + site build → the package's site directory
 *   servePackage      the package over http://127.0.0.1:<port>, with the export's path rule
 *   capture           Playwright Chromium: full-page screenshots + checks.json per page and width
 *   comparePng        pixel comparison of two screenshots
 *   kitParity         ordinary build vs shell build + runtime kit, page by page (<main> and around it)
 *
 * Everything is local: a page may request only the local server (anything else is aborted and
 * listed), nothing is written into the checkout except the output directory the caller names.
 */
export const DEFAULT_WIDTHS = [390, 768, 1440] as const;
export const BUILD_AT = "2026-10-12T00:00:00.000Z";

export async function openDesignRoot(opts: { repoRoot: string; templateId: string; work?: string; log?: (line: string) => void }): Promise<DesignRoot> {
  const root = opts.work ? path.resolve(opts.work) : await mkdtemp(path.join(os.tmpdir(), "design-root-"));
  if (opts.work) await mkdir(root, { recursive: true });
  opts.log?.(`design root ${root}`);
  const designRoot = await makeDesignRoot({ repoRoot: opts.repoRoot, root, templateId: opts.templateId });
  opts.log?.(`dev release ${designRoot.dev.releaseId} (cut from the working tree, all release gates passed)`);
  return designRoot;
}

export interface BuiltFixture extends Fixture {
  /** the package's site directory (what a host serves) */
  packageSite: string;
}

export async function buildFixture(opts: FixtureOptions & { log?: (line: string) => void }): Promise<BuiltFixture> {
  const fixture = await makeFixture(opts);
  const built = await buildSite({ repoRoot: opts.root, siteId: opts.siteId, at: BUILD_AT, log: opts.log });
  return { ...fixture, packageSite: path.join(path.isAbsolute(built.packageDir) ? built.packageDir : path.join(opts.root, built.packageDir), "site") };
}

// ----------------------------------------------------------------------- serve --

const TYPES: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".txt": "text/plain; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".xml": "application/xml",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".webp": "image/webp",
  ".woff2": "font/woff2",
  ".ico": "image/x-icon",
};

/** `overlay`: composed pages by public path (a kit's output), answered before the package. */
export async function servePackage(packageSite: string, overlay?: Map<string, string>): Promise<{ origin: string; close(): Promise<void> }> {
  const server = http.createServer((req, res) => {
    void (async () => {
      const pathname = decodeURIComponent(new URL(req.url ?? "/", "http://localhost").pathname);
      const send = (status: number, type: string, body: Uint8Array | string) => {
        res.writeHead(status, { "content-type": type, "cache-control": "no-store" });
        res.end(body);
      };
      const composed = overlay?.get(pathname);
      if (composed !== undefined) return send(200, TYPES[".html"]!, composed);
      const key = pathname === "/" ? "index.html" : path.extname(pathname) ? pathname.slice(1) : `${pathname.slice(1)}.html`;
      const file = path.join(packageSite, key);
      const bytes = file.startsWith(`${packageSite}${path.sep}`) ? await readFile(file).catch(() => undefined) : undefined;
      if (bytes) return send(200, TYPES[path.extname(key).toLowerCase()] ?? "application/octet-stream", bytes);
      send(404, TYPES[".html"]!, await readFile(path.join(packageSite, "404.html")).catch(() => "not found"));
    })();
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address() as AddressInfo;
  return { origin: `http://127.0.0.1:${port}`, close: () => new Promise<void>((resolve) => server.close(() => resolve())) };
}

// --------------------------------------------------------------------- capture --

export interface PageSpec {
  name: string;
  path: string | undefined;
}

/** home · listing · one detail · about · contact — the five pages of CONTRACTS E6. */
export function fixturePages(fixture: Pick<Fixture, "firstSlug">): PageSpec[] {
  return [
    { name: "home", path: "/" },
    { name: "listing", path: "/portfolio" },
    { name: "detail", path: fixture.firstSlug ? `/portfolio/${fixture.firstSlug}` : undefined },
    { name: "about", path: "/about" },
    { name: "contact", path: "/contact" },
  ];
}

export interface PageCheck {
  page: string;
  path: string | null;
  width: number;
  /** false = the site generates no such page (a thin site has no list and no detail) */
  generated: boolean;
  status: number | null;
  screenshot: string | null;
  size: { width: number; height: number } | null;
  /** px the document is wider than the viewport (0 = no horizontal scroll) */
  horizontalOverflow: number | null;
  h1Count: number | null;
  images: number | null;
  imagesWithoutAlt: number | null;
  imagesWithEmptyAlt: number | null;
  /** smallest computed font-size among visible text, with where it was found */
  smallestFont: { px: number; text: string; element: string } | null;
  consoleErrors: string[];
  /** a response ≥ 400, or a request that failed for any reason but cancellation */
  failedRequests: string[];
  /** requests the browser cancelled itself (net::ERR_ABORTED: the router's link prefetches, dropped when the page is done) — counted, not a failure */
  cancelledRequests: number;
  /** requests to anything but the local server: aborted, never sent */
  blockedExternalRequests: string[];
}

// Evaluated in the page. A string on purpose: a function would be rewritten by the TypeScript runner.
const PAGE_CHECKS = `(() => {
  const de = document.documentElement;
  const hidden = (el) => { const cs = getComputedStyle(el); return cs.display === "none" || cs.visibility !== "visible" || Number(cs.opacity) === 0; };
  let smallest = null;
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    const text = node.textContent.replace(/\\s+/g, " ").trim();
    const el = node.parentElement;
    if (!text || !el || /^(SCRIPT|STYLE|NOSCRIPT|TEMPLATE)$/.test(el.tagName)) continue;
    const box = el.getBoundingClientRect();
    if (box.width <= 1 || box.height <= 1) continue;
    let shown = true;
    for (let a = el; a && a !== de; a = a.parentElement) if (hidden(a)) { shown = false; break; }
    if (!shown) continue;
    const px = parseFloat(getComputedStyle(el).fontSize);
    if (!smallest || px < smallest.px) smallest = { px, text: text.slice(0, 40), element: el.tagName.toLowerCase() + (el.className && typeof el.className === "string" ? "." + el.className.trim().split(/\\s+/).join(".") : "") };
  }
  const images = Array.from(document.images);
  return {
    horizontalOverflow: Math.max(0, de.scrollWidth - de.clientWidth),
    h1Count: document.querySelectorAll("h1").length,
    images: images.length,
    imagesWithoutAlt: images.filter((i) => !i.hasAttribute("alt")).length,
    imagesWithEmptyAlt: images.filter((i) => i.getAttribute("alt") === "").length,
    smallestFont: smallest,
    size: { width: de.scrollWidth, height: de.scrollHeight },
  };
})()`;

// Scroll the whole page once (entrance states are held until a section is seen; lazy images load), then return to the top.
const PAGE_REVEAL = `(async () => {
  const frame = () => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
  for (let y = 0; y < document.documentElement.scrollHeight; y += Math.round(innerHeight * 0.7)) { scrollTo(0, y); await frame(); }
  scrollTo(0, document.documentElement.scrollHeight); await frame();
  scrollTo(0, 0); await frame();
})()`;

export async function capture(opts: { origin: string; pages: readonly PageSpec[]; widths: readonly number[]; outDir: string; browser?: Browser; log?: (line: string) => void }): Promise<PageCheck[]> {
  await mkdir(opts.outDir, { recursive: true });
  const browser = opts.browser ?? (await chromium.launch());
  const checks: PageCheck[] = [];
  try {
    for (const width of opts.widths) {
      const context = await browser.newContext({ viewport: { width, height: width < 700 ? 844 : 900 }, deviceScaleFactor: 1, reducedMotion: "reduce", locale: "ko-KR" });
      const blocked: string[] = [];
      await context.route("**/*", (route) => {
        const url = route.request().url();
        if (url.startsWith(`${opts.origin}/`) || url.startsWith("data:") || url.startsWith("blob:")) return route.continue();
        blocked.push(url);
        return route.abort();
      });
      for (const spec of opts.pages) {
        const check: PageCheck = {
          page: spec.name,
          path: spec.path ?? null,
          width,
          generated: false,
          status: null,
          screenshot: null,
          size: null,
          horizontalOverflow: null,
          h1Count: null,
          images: null,
          imagesWithoutAlt: null,
          imagesWithEmptyAlt: null,
          smallestFont: null,
          consoleErrors: [],
          failedRequests: [],
          cancelledRequests: 0,
          blockedExternalRequests: [],
        };
        checks.push(check);
        if (spec.path === undefined) continue;
        const page = await context.newPage();
        const mark = blocked.length;
        page.on("console", (m) => void (m.type() === "error" ? check.consoleErrors.push(m.text().slice(0, 300)) : undefined));
        page.on("pageerror", (e) => void check.consoleErrors.push(String(e).slice(0, 300)));
        page.on("requestfailed", (r) => {
          if (!r.url().startsWith(`${opts.origin}/`)) return; // an external request: aborted by the route above and listed there
          const reason = r.failure()?.errorText ?? "failed";
          if (reason === "net::ERR_ABORTED") check.cancelledRequests++;
          else check.failedRequests.push(`${reason} ${r.url().slice(opts.origin.length)}`);
        });
        page.on("response", (r) => void (r.status() >= 400 && r.url() !== `${opts.origin}${spec.path}` ? check.failedRequests.push(`${r.status()} ${r.url().slice(opts.origin.length)}`) : undefined));
        const response = await page.goto(`${opts.origin}${spec.path}`, { waitUntil: "networkidle" });
        check.status = response?.status() ?? null;
        check.generated = check.status === 200;
        if (check.generated) {
          await page.evaluate(PAGE_REVEAL);
          await page.waitForLoadState("networkidle");
          await page.evaluate("document.fonts.ready.then(() => true)");
          await page.waitForTimeout(400);
          Object.assign(check, await page.evaluate(PAGE_CHECKS));
          check.screenshot = `${spec.name}-${width}.png`;
          await page.screenshot({ path: path.join(opts.outDir, check.screenshot), fullPage: true, animations: "disabled" });
          // a 404 for the page's own document is the only expected one: every console line about it is noise
        } else check.consoleErrors.length = 0;
        check.blockedExternalRequests = blocked.slice(mark);
        opts.log?.(`  ${spec.name} @${width}: ${check.generated ? `${check.size?.width}×${check.size?.height}` : `not generated (${check.status})`}`);
        await page.close();
      }
      await context.close();
    }
  } finally {
    if (!opts.browser) await browser.close();
  }
  await writeFile(path.join(opts.outDir, "checks.json"), `${JSON.stringify(checks, null, 2)}\n`);
  return checks;
}

// --------------------------------------------------------------------- compare --

export interface PixelComparison {
  a: { width: number; height: number };
  b: { width: number; height: number };
  sameSize: boolean;
  /** pixels compared (the area both images cover) */
  pixels: number;
  /** pixels with any channel different */
  different: number;
  /** pixels with a channel different by more than 8 / 255 */
  differentOver8: number;
  /** different / pixels */
  ratio: number;
  maxChannelDelta: number;
  identical: boolean;
}

export async function comparePng(fileA: string, fileB: string, diffFile?: string): Promise<PixelComparison> {
  const a = PNG.sync.read(await readFile(fileA));
  const b = PNG.sync.read(await readFile(fileB));
  const width = Math.min(a.width, b.width);
  const height = Math.min(a.height, b.height);
  const diff = diffFile ? new PNG({ width, height }) : undefined;
  let different = 0;
  let differentOver8 = 0;
  let maxChannelDelta = 0;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * a.width + x) * 4;
      const j = (y * b.width + x) * 4;
      let delta = 0;
      for (let c = 0; c < 4; c++) delta = Math.max(delta, Math.abs(a.data[i + c]! - b.data[j + c]!));
      if (delta > 0) different++;
      if (delta > 8) differentOver8++;
      if (delta > maxChannelDelta) maxChannelDelta = delta;
      if (diff) {
        const k = (y * width + x) * 4;
        const grey = Math.round((a.data[i]! + a.data[i + 1]! + a.data[i + 2]!) / 3 / 2 + 127);
        diff.data[k] = delta > 0 ? 255 : grey;
        diff.data[k + 1] = delta > 0 ? 0 : grey;
        diff.data[k + 2] = delta > 0 ? 0 : grey;
        diff.data[k + 3] = 255;
      }
    }
  }
  const sameSize = a.width === b.width && a.height === b.height;
  if (diff && diffFile && (different > 0 || !sameSize)) await writeFile(diffFile, PNG.sync.write(diff));
  const pixels = width * height;
  return { a: { width: a.width, height: a.height }, b: { width: b.width, height: b.height }, sameSize, pixels, different, differentOver8, ratio: pixels === 0 ? 0 : different / pixels, maxChannelDelta, identical: sameSize && different === 0 };
}

// ------------------------------------------------------------------ kit parity --

function mainOf(html: string, where: string): string {
  const m = /<main[\s>][\s\S]*?<\/main>/.exec(html);
  if (!m) throw new Error(`${where}: the page has no <main>`);
  return m[0];
}
/** The accepted differences of the portfolio-runtime proof, applied: Suspense boundary markers removed, generated ids renamed in order of first appearance. */
function normalize(markup: string): string {
  const ids = new Map<string, string>();
  return markup
    .replaceAll("<!--$-->", "")
    .replaceAll("<!--/$-->", "")
    .replace(/_R_[0-9a-z]+_|rs-[a-z0-9-]+?-(?:browser|gallery|total)(?![a-z])/g, (id) => ids.get(id) ?? (ids.set(id, `ID${ids.size + 1}`), ids.get(id)!));
}
const withoutScripts = (html: string) => html.replace(/<script[\s\S]*?<\/script>/g, "");
const bodyOf = (html: string) => withoutScripts(html.slice(html.indexOf("<body"), html.indexOf("</body>")));
const headSeo = (html: string) => html.slice(0, html.indexOf("</head>")).match(/<title>[\s\S]*?<\/title>|<meta (?:name="description"|property="og:[^"]*"|name="twitter:[^"]*")[^>]*>|<link rel="canonical"[^>]*>/g) ?? [];
function firstDifference(a: string, b: string): string {
  let i = 0;
  while (i < a.length && i < b.length && a[i] === b[i]) i++;
  return `at ${i}: composed …${a.slice(Math.max(0, i - 60), i + 120)}… ≠ built …${b.slice(Math.max(0, i - 60), i + 120)}…`;
}

export interface KitParityPage {
  path: string;
  main: boolean;
  aroundMain: boolean;
  head: boolean;
  variants: string[];
  difference?: string;
}
export interface KitParityResult {
  release: ReleasePin;
  presetId: string | null;
  profile: string;
  pass: boolean;
  pages: KitParityPage[];
  /** public paths only one side has */
  onlyBuilt: string[];
  onlyComposed: string[];
  kit: { rendererBytes: number };
}

/**
 * The same fixture twice — an ORDINARY build (the portfolio in the build) and a SHELL build whose
 * pages the release's runtime kit composes from the same records — compared page by page:
 * <main> (the slots), the markup around it (header, footer, mobile bar: untouched shell markup),
 * and the head's title / description / canonical / og / twitter. Byte for byte, after the two
 * differences the portfolio-runtime proof accepts (boundary markers, generated ids).
 * `variants` lists the design variants the composed page's slot data names — the proof that a
 * variant reached the kit and not only the build.
 */
export async function kitParity(opts: { repoRoot: string; root: DesignRoot; release: ReleasePin; profile: FixtureOptions["profile"]; presetId?: string | null; idPrefix?: string; log?: (line: string) => void }): Promise<KitParityResult & { composed: Map<string, string>; shellSite: string; ordinarySite: string }> {
  const base = { repoRoot: opts.repoRoot, root: opts.root.root, release: opts.release, profile: opts.profile, presetId: opts.presetId ?? null, log: opts.log };
  const prefix = opts.idPrefix ?? "dsfx-kit";
  const ordinary = await buildFixture({ ...base, siteId: `${prefix}-ordinary` });
  const shell = await buildFixture({ ...base, siteId: `${prefix}-shell`, incremental: true });

  const kit = await buildRuntimeKit({ repoRoot: opts.root.root, templateId: opts.release.templateId, releaseId: opts.release.releaseId, sourceCommit: "design-parity" });
  const kitDir = await mkdtemp(path.join(os.tmpdir(), "design-kit-"));
  await writeFile(path.join(kitDir, RENDERER_FILE), kit.files[RENDERER_FILE]);
  const { renderPortfolioSite } = (await import(pathToFileURL(path.join(kitDir, RENDERER_FILE)).href)) as { renderPortfolioSite(input: PortfolioSiteInput): PortfolioSiteResult };

  const runtime = JSON.parse(await readFile(path.join(shell.packageSite, RUNTIME_FILE), "utf8")) as { shellPages: string[] };
  const shellDoc = JSON.parse(await readFile(path.join(shell.packageSite, SHELL_FILE), "utf8")) as unknown;
  const shellPages: Record<string, string> = {};
  for (const file of runtime.shellPages) shellPages[file] = await readFile(path.join(shell.packageSite, file), "utf8");
  const { categories, projects, assets } = shell.portfolio;
  const result = renderPortfolioSite({ runtime, shell: shellDoc, shellPages, portfolio: { categories, projects, assets }, at: BUILD_AT });
  if (!result.ok) throw new Error(`the runtime kit refused the fixture: ${JSON.stringify(result.problems).slice(0, 800)}`);

  const composed = new Map(result.files.filter((f) => f.contentType.startsWith("text/html")).map((f) => [f.path, f.body]));
  const fileOf = (p: string) => (p === "/" ? "index.html" : `${p.slice(1)}.html`);
  const pages: KitParityPage[] = [];
  const onlyComposed: string[] = [];
  for (const [p, mine] of composed) {
    const built = await readFile(path.join(ordinary.packageSite, fileOf(p)), "utf8").catch(() => undefined);
    if (built === undefined) {
      onlyComposed.push(p);
      continue;
    }
    // the two sites differ in their id (and so their origin): not a difference of the page
    const same = (text: string) => text.replaceAll(shell.siteId, ordinary.siteId);
    const a = same(normalize(mainOf(mine, p)));
    const b = normalize(mainOf(built, p));
    const around = (html: string) => normalize(bodyOf(html)).replace(/<main[\s>][\s\S]*?<\/main>/, "<main/>");
    const page: KitParityPage = {
      path: p,
      main: a === b,
      aroundMain: same(around(mine)) === around(built),
      head: JSON.stringify(headSeo(mine).map(same)) === JSON.stringify(headSeo(built)),
      variants: [...new Set([...mine.matchAll(/"dsVariant":"([^"]+)"/g)].map((m) => m[1]!))].sort(),
    };
    if (!page.main) page.difference = `<main> ${firstDifference(a, b)}`;
    else if (!page.aroundMain) page.difference = `around <main> ${firstDifference(same(around(mine)), around(built))}`;
    else if (!page.head) page.difference = `head ${JSON.stringify(headSeo(mine).map(same)).slice(0, 300)} ≠ ${JSON.stringify(headSeo(built)).slice(0, 300)}`;
    pages.push(page);
  }
  // the ordinary build prunes /portfolio for a site without a project; the kit answers it with the empty list
  const builtPaths = ["/", ...(ordinary.firstSlug ? ["/portfolio"] : []), ...(projects as { slug: string }[]).map((x) => `/portfolio/${x.slug}`)];
  const onlyBuilt = builtPaths.filter((p) => !composed.has(p));
  const pass = pages.every((x) => x.main && x.aroundMain && x.head) && onlyBuilt.length === 0 && onlyComposed.every((p) => p === "/portfolio" && !ordinary.firstSlug);
  return { release: opts.release, presetId: opts.presetId ?? null, profile: opts.profile, pass, pages, onlyBuilt, onlyComposed, kit: { rendererBytes: kit.rendererBytes }, composed, shellSite: shell.packageSite, ordinarySite: ordinary.packageSite };
}
