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
 *  - any remote src/href other than the site's own public origin (exact origin match)
 *  - any url()/@import/image-set() in CSS files, inline <style> blocks or style="" attributes
 *    that is not same-document/local
 *  - any SVG that is not inert/self-contained
 *  - any absolute URL in ANY emitted text file (HTML, RSC flight .txt, JS chunks, CSS, JSON)
 *    that is neither the site's own origin nor an exact framework-internal prefix
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
}): Promise<PackageQaResult> {
  const { outDir } = opts;
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
    if (!TEXT_EXT.test(f)) continue;
    const text = await readFile(abs, "utf8");
    failures.push(...scanForbiddenTerms(f, text, opts.forbiddenTerms));
    if (!f.endsWith(".svg")) {
      for (const m of text.matchAll(/(?:https?:)?\/\/[A-Za-z0-9.-]+\.[A-Za-z]{2,}[^\s"'`)<>\\]*/g)) {
        const url = m[0];
        if (FRAMEWORK_URL_PREFIXES.some((p) => url.startsWith(p))) continue;
        if (opts.publicOrigin && /^https?:/.test(url) && sameOrigin(url, opts.publicOrigin)) continue;
        failures.push({ file: f, why: `absolute URL ${url.slice(0, 120)} (not own origin / framework-internal)` });
      }
    }

    if (f.endsWith(".html")) {
      const refs = [...text.matchAll(/\s(src|href|srcset|imagesrcset|poster|action)=["']([^"']*)["']/gi)].flatMap((m) =>
        /srcset$/i.test(m[1]!) ? m[2]!.split(",").map((c) => c.trim().split(/\s+/)[0]!).filter(Boolean) : [m[2]!],
      );
      for (const ref of refs) {
        if (ref === "" || ref.startsWith("#") || ref.startsWith("mailto:") || ref.startsWith("tel:") || ref.startsWith("data:")) continue;
        if (/^(https?:)?\/\//i.test(ref)) {
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
