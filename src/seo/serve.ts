import { createServer, type Server } from "node:http";
import { createServer as createNetServer } from "node:net";
import { buildApp, startApp } from "../recon-template/parity-qa.js";
import { applySubstitutionVariants, escapeForTitleText } from "./escape-variants.js";
import type { RenderedHead } from "./types.js";

/**
 * SEO-applied serving (Task 21 E/F/G) — the serve boundary, Task 20 precedent.
 *
 * The immutable template app runs unmodified (`next start`, content overlay
 * via the official `WR_SLOT_VALUES_FILE` env). The SEO layer joins at the
 * SERVE boundary: a local reverse proxy that
 *
 *   1. rewrites the `<title>` of every HTML response to the plan title — in
 *      the head element AND in the RSC flight payload (the app streams the
 *      original route-map title there; if only the head tag changed, React
 *      would revert the tab title at hydration);
 *   2. injects the plan's rendered head block before `</head>`;
 *   3. answers `/robots.txt` from the plan (preview: disallow all) and
 *      `/sitemap.xml` per domain state (preview: 404 — path-only plans are
 *      artifacts, never served as a real sitemap);
 *   4. optionally appends a theme overlay to the generated stylesheet, so all
 *      three overlay layers (content/theme/SEO) can be previewed together.
 *
 * Composition: Template → Content Overlay (server env) → Theme Overlay
 * (stylesheet append) → SEO Head Overlay (HTML head splice) → Render.
 * This closes the `document-title-not-slotted` gap at the browser: the title
 * that renders is the production plan's, derived from the injected content.
 */

export const GENERATED_STYLES_PATH = "/wr/generated-styles.css";

async function findFreePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = createNetServer();
    server.on("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      if (address === null || typeof address === "string") {
        server.close(() => reject(new Error("could not determine a free port")));
        return;
      }
      const { port } = address;
      server.close(() => resolve(port));
    });
  });
}

const HOP_HEADERS = new Set([
  "connection",
  "keep-alive",
  "transfer-encoding",
  "content-encoding",
  "content-length",
  "host",
  "accept-encoding",
  "if-none-match",
  "if-modified-since",
]);

export function normalizeRequestPath(rawUrl: string): string {
  const pathname = rawUrl.split("?")[0].split("#")[0];
  if (pathname === "") return "/";
  const trimmed = pathname.replace(/\/+$/, "");
  return trimmed === "" ? "/" : trimmed;
}

/** Apply the SEO head rewrite to one HTML document. Exported for tests. */
export function rewriteHtmlHead(
  html: string,
  entry: { upstreamTitle: string | null; title: string; headHtml: string },
): string {
  let output = html;
  // 1. every occurrence of the upstream title (head element, SSR'd attributes,
  //    RSC flight payload) — in EVERY encoding the response gives it, each
  //    replaced by the plan title in that SAME encoding. A literal needle alone
  //    misses an entity-bearing title (`&` → `&amp;` / `\u0026`) and the source
  //    title then survives to hydration; a raw replacement into an escaped
  //    occurrence would double-escape it. Runs before the <title> rewrite so
  //    the string this step writes is never itself a substitution target.
  if (entry.upstreamTitle !== null && entry.upstreamTitle !== "" && entry.upstreamTitle !== entry.title) {
    output = applySubstitutionVariants(output, entry.upstreamTitle, entry.title).body;
  }
  // 2. head <title> element (whatever it still contains), escaped for HTML text
  //    exactly as the Task 23 bake escapes it. A function replacement keeps `$&`
  //    and friends in the title literal.
  const titleElement = `<title>${escapeForTitleText(entry.title)}</title>`;
  output = output.replace(/<title>[^<]*<\/title>/, () => titleElement);
  // 3. the rendered head block, before </head>.
  const headClose = output.indexOf("</head>");
  if (headClose !== -1) {
    output = output.slice(0, headClose) + entry.headHtml + output.slice(headClose);
  }
  return output;
}

export interface SeoProxyOptions {
  renderedHead: RenderedHead;
  robotsTxt: string;
  /** null = preview (404); a string = served as /sitemap.xml. */
  sitemapXml: string | null;
  /** Optional Task 20 theme overlay CSS, appended to the generated stylesheet. */
  themeOverlayCss?: string;
}

/** Start the SEO head proxy in front of an already-running app. */
export async function startSeoProxy(
  upstreamBaseUrl: string,
  options: SeoProxyOptions,
): Promise<{ baseUrl: string; stop: () => Promise<void> }> {
  const headByRoute = new Map(options.renderedHead.routes.map((r) => [normalizeRequestPath(r.route), r]));
  const overlayBytes =
    options.themeOverlayCss !== undefined ? Buffer.from("\n" + options.themeOverlayCss, "utf8") : null;
  const port = await findFreePort();
  const server: Server = createServer((request, response) => {
    void (async () => {
      const requestPath = normalizeRequestPath(request.url ?? "/");
      if (requestPath === "/robots.txt") {
        const body = Buffer.from(options.robotsTxt, "utf8");
        response.writeHead(200, { "content-type": "text/plain; charset=utf-8", "content-length": String(body.length) });
        response.end(body);
        return;
      }
      if (requestPath === "/sitemap.xml") {
        if (options.sitemapXml === null) {
          const body = Buffer.from(
            "sitemap not available in preview mode: the production domain is needs-input and absolute URLs are never invented\n",
            "utf8",
          );
          response.writeHead(404, { "content-type": "text/plain; charset=utf-8", "content-length": String(body.length) });
          response.end(body);
          return;
        }
        const body = Buffer.from(options.sitemapXml, "utf8");
        response.writeHead(200, { "content-type": "application/xml; charset=utf-8", "content-length": String(body.length) });
        response.end(body);
        return;
      }
      const url = upstreamBaseUrl + (request.url ?? "/");
      const headers: Record<string, string> = {};
      for (const [name, value] of Object.entries(request.headers)) {
        if (HOP_HEADERS.has(name.toLowerCase())) continue;
        if (typeof value === "string") headers[name] = value;
        else if (Array.isArray(value)) headers[name] = value.join(", ");
      }
      headers["accept-encoding"] = "identity";
      const chunks: Buffer[] = [];
      for await (const chunk of request) chunks.push(chunk as Buffer);
      const requestBody = Buffer.concat(chunks);
      const upstream = await fetch(url, {
        method: request.method ?? "GET",
        headers,
        ...(requestBody.length > 0 ? { body: requestBody } : {}),
        redirect: "manual",
      });
      let payload = Buffer.from(await upstream.arrayBuffer());
      const contentType = upstream.headers.get("content-type") ?? "";
      const isStylesheet = requestPath === GENERATED_STYLES_PATH;
      const isHtml = contentType.includes("text/html");
      if (overlayBytes !== null && isStylesheet && upstream.status === 200) {
        payload = Buffer.concat([payload, overlayBytes]);
      }
      const headEntry = headByRoute.get(requestPath);
      if (isHtml && upstream.status === 200 && headEntry !== undefined) {
        payload = Buffer.from(rewriteHtmlHead(payload.toString("utf8"), headEntry), "utf8");
      }
      const outHeaders: Record<string, string> = {};
      upstream.headers.forEach((value, name) => {
        if (HOP_HEADERS.has(name.toLowerCase())) return;
        if (name.toLowerCase() === "etag" && (isStylesheet || isHtml)) return;
        outHeaders[name] = value;
      });
      outHeaders["content-length"] = String(payload.length);
      response.writeHead(upstream.status, outHeaders);
      response.end(payload);
    })().catch((error) => {
      response.writeHead(502, { "content-type": "text/plain" });
      response.end(`seo proxy error: ${error instanceof Error ? error.message : String(error)}`);
    });
  });
  await new Promise<void>((resolve, reject) => {
    server.on("error", reject);
    server.listen(port, "127.0.0.1", () => resolve());
  });
  return {
    baseUrl: `http://127.0.0.1:${port}`,
    stop: () =>
      new Promise<void>((resolve) => {
        server.closeAllConnections();
        server.close(() => resolve());
      }),
  };
}

export interface SeoServedApp {
  baseUrl: string;
  upstreamBaseUrl: string;
  stop: () => Promise<void>;
}

/** Build (if needed) + start the immutable template app + SEO proxy. */
export async function startSeoServedApp(options: {
  appDir: string;
  proxy: SeoProxyOptions;
  slotValuesFile?: string;
  forceBuild?: boolean;
  log?: (line: string) => void;
}): Promise<SeoServedApp> {
  const log = options.log ?? (() => {});
  await buildApp(options.appDir, options.forceBuild ?? false, log);
  const app = await startApp(
    options.appDir,
    options.slotValuesFile !== undefined ? { WR_SLOT_VALUES_FILE: options.slotValuesFile } : {},
  );
  const proxy = await startSeoProxy(app.baseUrl, options.proxy);
  return {
    baseUrl: proxy.baseUrl,
    upstreamBaseUrl: app.baseUrl,
    stop: async () => {
      await proxy.stop();
      await app.stop();
    },
  };
}
