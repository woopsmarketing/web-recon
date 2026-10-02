import { readFile, readdir, stat } from "node:fs/promises";
import path from "node:path";
import { scanForbiddenTerms, type GateFinding } from "../release/release";
import { svgProblems } from "../assets/assets";

/**
 * Basic static-package QA (Slice 1). Fails closed on:
 *  - a planned page (route plan) with no HTML
 *  - with exclusiveRoutes: any HTML page that is NOT planned (pruned/out-of-range/unknown
 *    routes must not be emitted), except the framework's own 404 pages
 *  - a local src/href that does not resolve inside the package
 *  - any remote src/href other than the site's own public origin (exact origin match) or one of
 *    the exact script URLs this site declares in its own data/sites/<siteId>/scripts.json
 *    (a declared inquiry endpoint is NOT a reference: it may never be an attribute value at all)
 *  - any url()/@import/image-set() in CSS files, inline <style> blocks or style="" attributes
 *    that is not same-document/local
 *  - any SVG that is not inert/self-contained
 *  - any absolute URL in ANY emitted text file (HTML, RSC flight .txt, JS chunks, CSS, JSON)
 *    that is neither the site's own origin, nor a declared script URL, nor the site's declared
 *    inquiry endpoint (data/sites/<siteId>/inquiry.json, whole-URL match, and ONLY where a page's
 *    flight payload lives: a .txt file, or a <script> body of an .html file), nor an exact
 *    framework-internal prefix
 *    (XML namespaces, Next.js/React error-doc links, core-js license string) — this
 *    covers URLs a client component could inject at runtime, not just attributes
 *  - any frozen forbidden source term in ANY emitted file (HTML, RSC flight, JS, CSS, SVG)
 */

/** Absolute-URL prefixes emitted by the framework itself (never fetched by the page). */
export const FRAMEWORK_URL_PREFIXES = [
  "http://www.w3.org/1998/Math/MathML",
  "http://www.w3.org/1999/xlink",
  "http://www.w3.org/1999/xhtml",
  "http://www.w3.org/2000/svg",
  "http://www.w3.org/XML/1998/namespace",
  // sitemap.xml <urlset xmlns=…> (Next metadata route); an XML namespace, never fetched
  "http://www.sitemaps.org/schemas/sitemap/0.9",
  "https://nextjs.org/docs/",
  "https://react.dev/errors/",
  "https://github.com/zloirock/core-js",
];
/** HTML the framework always emits for static export (not routes of the site). */
export const FRAMEWORK_HTML = new Set(["404.html", "_not-found.html"]);

export interface PackageQaResult {
  pass: boolean;
  files: number;
  bytes: number;
  failures: GateFinding[];
  pages: Record<string, { sections: string[]; projectCards: number; projectCardIds: string[]; title?: string; lang?: string }>;
}

const TEXT_EXT = /\.(html|txt|js|mjs|css|json|svg|xml|map|webmanifest)$/i;

async function listFiles(dir: string, rel = ""): Promise<string[]> {
  const out: string[] = [];
  for (const e of await readdir(dir, { withFileTypes: true })) {
    const r = rel ? `${rel}/${e.name}` : e.name;
    if (e.isDirectory()) out.push(...(await listFiles(path.join(dir, e.name), r)));
    else out.push(r);
  }
  return out.sort();
}

function routeHtml(route: string): string {
  return route === "/" ? "index.html" : `${route.replace(/^\//, "").replace(/\/$/, "")}.html`;
}

export async function qaStaticPackage(opts: {
  outDir: string;
  routes: readonly { path: string }[];
  /** fail on any emitted HTML page that is not one of `routes` (framework 404 pages excepted) */
  exclusiveRoutes?: boolean;
  forbiddenTerms: readonly string[];
  publicOrigin?: string;
  /**
   * The exact third-party script URLs this site declares (data/sites/<siteId>/scripts.json, via
   * the snapshot). These — and ONLY these, matched as whole URLs, not by host — are allowed to
   * appear as a remote reference and as an absolute URL in the package. Every other remote script
   * host, and every other URL on a declared script's host (an image, a link, a second script),
   * still fails, so the "nothing remote unless the site asked for exactly this" property holds.
   */
  declaredScriptSrcs?: readonly string[];
  /**
   * The exact inquiry endpoint URLs this site declares (data/sites/<siteId>/inquiry.json, via the
   * snapshot). Allowed ONLY as page data — the props of the inquiry form, i.e. the flight payload:
   * in a `.txt` file, or inside a `<script>` BODY of an `.html` file — and matched as a whole URL.
   * Everywhere else it still fails: as any attribute value of any element (action, formaction,
   * src, href, ping, data, xlink:href, a meta refresh's content, quoted or not — a remote form
   * target, a link, a script source), in a comment or in text outside a script, in a `.js` /
   * `.css` / `.json` / `.svg` / any other emitted file (text or not), and
   * as another path on the same host or a longer URL that starts with it. Nothing else is loosened
   * by declaring one.
   */
  declaredEndpoints?: readonly string[];
}): Promise<PackageQaResult> {
  const { outDir } = opts;
  // Both spellings of each declared URL: as authored (RSC flight / JSON) and with "&" escaped,
  // which is how it comes back out of an HTML attribute.
  const declaredScripts = new Set((opts.declaredScriptSrcs ?? []).flatMap((s) => [s, s.replaceAll("&", "&amp;")]));
  // Exactly as declared: an endpoint has no query (platform/site/inquiry), so it has one spelling.
  const declaredEndpoints = new Set(opts.declaredEndpoints ?? []);
  const failures: GateFinding[] = [];
  const files = await listFiles(outDir);
  const fileSet = new Set(files);
  let bytes = 0;
  const pages: PackageQaResult["pages"] = {};

  for (const route of opts.routes) {
    if (!fileSet.has(routeHtml(route.path))) failures.push({ file: routeHtml(route.path), why: `planned page ${route.path} has no HTML` });
  }
  if (opts.exclusiveRoutes) {
    const planned = new Set(opts.routes.map((r) => routeHtml(r.path)));
    for (const f of files) {
      if (f.endsWith(".html") && !planned.has(f) && !FRAMEWORK_HTML.has(f)) failures.push({ file: f, why: "HTML page emitted for a route that is not in the route plan" });
    }
  }

  for (const f of files) {
    const abs = path.join(outDir, f);
    bytes += (await stat(abs)).size;
    if (!TEXT_EXT.test(f)) {
      // not a text file QA reads — and so never page data: it may not carry a declared endpoint
      if (declaredEndpoints.size > 0) {
        const raw = await readFile(abs);
        for (const e of declaredEndpoints) if (raw.includes(e)) failures.push({ file: f, why: endpointOutsideData(e) });
      }
      continue;
    }
    const text = await readFile(abs, "utf8");
    failures.push(...scanForbiddenTerms(f, text, opts.forbiddenTerms));
    if (!f.endsWith(".svg")) {
      // where this file may carry a declared inquiry endpoint: anywhere in a flight .txt, only
      // inside <script> bodies in an .html page, nowhere in any other file
      const endpointAllowed = endpointZones(f, text);
      for (const m of text.matchAll(/(?:https?:)?\/\/[A-Za-z0-9.-]+\.[A-Za-z]{2,}[^\s"'`)<>\\]*/g)) {
        const url = m[0];
        if (FRAMEWORK_URL_PREFIXES.some((p) => url.startsWith(p))) continue;
        if (declaredScripts.has(url)) continue;
        if (declaredEndpoints.has(url)) {
          if (endpointAllowed(m.index, url.length)) continue;
          failures.push({ file: f, why: endpointOutsideData(url) });
          continue;
        }
        if (opts.publicOrigin && /^https?:/.test(url) && sameOrigin(url, opts.publicOrigin)) continue;
        failures.push({ file: f, why: `absolute URL ${url.slice(0, 120)} (not own origin / framework-internal)` });
      }
    } else {
      // an SVG is an image, never page data (the URL scan above does not read it: its namespaces)
      for (const e of declaredEndpoints) if (text.includes(e)) failures.push({ file: f, why: endpointOutsideData(e) });
    }

    if (f.endsWith(".html")) {
      const refs = [...text.matchAll(/\s(src|href|srcset|imagesrcset|poster|action)=["']([^"']*)["']/gi)].flatMap((m) =>
        /srcset$/i.test(m[1]!) ? m[2]!.split(",").map((c) => c.trim().split(/\s+/)[0]!).filter(Boolean) : [m[2]!],
      );
      for (const ref of refs) {
        if (ref === "" || ref.startsWith("#") || ref.startsWith("mailto:") || ref.startsWith("tel:") || ref.startsWith("data:")) continue;
        if (/^(https?:)?\/\//i.test(ref)) {
          if (declaredScripts.has(ref)) continue;
          if (opts.publicOrigin && sameOrigin(ref, opts.publicOrigin)) continue;
          failures.push({ file: f, why: `remote reference ${ref}` });
          continue;
        }
        const clean = decodeURIComponent(ref.split(/[?#]/)[0]!);
        const local = clean.replace(/^\//, "");
        const ok = local === "" ? fileSet.has("index.html") : fileSet.has(local) || fileSet.has(`${local}.html`) || fileSet.has(`${local}/index.html`);
        if (!ok) failures.push({ file: f, why: `broken local reference ${ref}` });
      }
      const sections = [...text.matchAll(/data-section="([^"]+)"/g)].map((m) => m[1]!);
      const projectCardIds = [...text.matchAll(/data-project-card="([^"]+)"/g)].map((m) => m[1]!);
      pages[f] = {
        sections,
        projectCards: projectCardIds.length,
        projectCardIds,
        title: /<title>([^<]*)<\/title>/.exec(text)?.[1],
        lang: /<html[^>]*\slang="([^"]+)"/.exec(text)?.[1],
      };
    }
    const cssChunks: string[] = [];
    if (f.endsWith(".css")) cssChunks.push(text);
    if (f.endsWith(".html")) {
      for (const m of text.matchAll(/<style\b[^>]*>([\s\S]*?)<\/style>/gi)) cssChunks.push(m[1]!);
      for (const m of text.matchAll(/\sstyle=["']([^"']*)["']/gi)) cssChunks.push(m[1]!);
    }
    for (const css of cssChunks) failures.push(...cssProblems(f, css, fileSet));
    if (f.endsWith(".svg")) for (const p of svgProblems(text)) failures.push({ file: f, why: `SVG: ${p}` });
  }
  return { pass: failures.length === 0, files: files.length, bytes, failures, pages };
}

const endpointOutsideData = (url: string) =>
  `declared inquiry endpoint ${url.slice(0, 120)} outside page data (allowed only in a .txt flight file or a <script> body of an .html page)`;

/**
 * Where a file may carry a declared inquiry endpoint, as a predicate over a match's position:
 * a `.txt` file (a page's flight payload) — anywhere; an `.html` file — only inside the body of a
 * `<script>` element (the inlined flight payload), never in a tag, i.e. never as an attribute value
 * (not even a script's own `src`); any other file — nowhere.
 */
function endpointZones(file: string, text: string): (index: number, length: number) => boolean {
  if (/\.txt$/i.test(file)) return () => true;
  if (!/\.html$/i.test(file)) return () => false;
  const bodies = scriptBodies(text);
  return (index, length) => bodies.some(([start, end]) => index >= start && index + length <= end);
}

/** elements whose content is text, not markup: a "<script>" written inside one is not a script */
const RAW_TEXT_ELEMENTS = new Set(["style", "textarea", "title", "xmp", "iframe", "noembed", "noframes", "noscript"]);

/**
 * The [start, end) ranges of the `<script>` bodies of an HTML document, found the way a tokenizer
 * finds them rather than by one regex over the text: a comment is skipped; a tag — start or end —
 * ends at the first ">" that is not inside a quoted attribute value (so `<script data-x=">" src="…">`
 * is one tag, and its attributes are not a body); the content of a raw-text element is skipped; a
 * script's body runs to the next "</script". Errs towards FEWER bodies: after a tag that never
 * closes (an open quote to the end of the document) or a script that is never closed, there is none.
 */
function scriptBodies(html: string): [start: number, end: number][] {
  const bodies: [number, number][] = [];
  const tag = /<(\/?)([A-Za-z][^\s/>]*)(?:[^>"']|"[^"]*"|'[^']*')*>/y;
  const tagStart = /<\/?[A-Za-z]/y;
  let i = 0;
  while (i < html.length) {
    const lt = html.indexOf("<", i);
    if (lt < 0) break;
    if (html.startsWith("<!--", lt)) {
      const close = html.indexOf("-->", lt + 4);
      i = close < 0 ? html.length : close + 3;
      continue;
    }
    tag.lastIndex = lt;
    const m = tag.exec(html);
    if (!m) {
      // a tag that never ends swallows the rest of the document; anything else is a stray "<"
      tagStart.lastIndex = lt;
      if (tagStart.test(html)) break;
      i = lt + 1;
      continue;
    }
    const name = m[2]!.toLowerCase();
    const bodyStart = lt + m[0].length;
    if (m[1] === "/" || (name !== "script" && !RAW_TEXT_ELEMENTS.has(name))) {
      i = bodyStart;
      continue;
    }
    const closing = new RegExp(`</${name}(?=[\\s/>])`, "gi");
    closing.lastIndex = bodyStart;
    const close = closing.exec(html);
    if (!close) break;
    if (name === "script") bodies.push([bodyStart, close.index]);
    i = close.index + 2;
  }
  return bodies;
}

function sameOrigin(ref: string, origin: string): boolean {
  try {
    return new URL(ref, origin).origin === new URL(origin).origin;
  } catch {
    return false;
  }
}

/** CSS may only reference files inside the package (or same-document #fragments / data: fonts from the framework). */
function cssProblems(file: string, css: string, fileSet: Set<string>): GateFinding[] {
  const out: GateFinding[] = [];
  if (/@import/i.test(css)) out.push({ file, why: "CSS @import" });
  if (/image-set\s*\(/i.test(css)) out.push({ file, why: "CSS image-set()" });
  for (const m of css.matchAll(/url\(\s*["']?([^"')]*)["']?\s*\)/gi)) {
    const ref = m[1]!.trim();
    if (ref.startsWith("#") || ref.startsWith("data:")) continue;
    if (/^([a-z]+:)?\/\//i.test(ref)) {
      out.push({ file, why: `remote CSS url ${ref}` });
      continue;
    }
    const local = path.posix.normalize(ref.startsWith("/") ? ref.slice(1) : path.posix.join(path.posix.dirname(file), ref)).split(/[?#]/)[0]!;
    if (!fileSet.has(local)) out.push({ file, why: `broken CSS url ${ref}` });
  }
  return out;
}
