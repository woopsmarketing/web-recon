/**
 * Asset-independent serving (Task 22 D) — the serve boundary, Task 20/21
 * precedent. The immutable template app runs unmodified; the asset layer
 * joins at a local reverse proxy that
 *
 *   1. serves /media/<sha256>.<ext> from the materialization run directory
 *      (content-hashed, immutable cache headers);
 *   2. rewrites every materialized source-asset URL to its local /media path
 *      in HTML responses (SSR attributes AND the RSC flight payload — raw,
 *      HTML-escaped and JSON-escaped variants) and in RSC responses of
 *      client-side navigations;
 *   3. rewrites CSS url() references in the generated stylesheet, and can
 *      append a Task 20 theme overlay there too.
 *
 * Composition: Template → Content Overlay (server env) → Asset Rewrite
 * (body substitution + /media) → Theme Overlay (stylesheet append) → SEO
 * Head Overlay (HTML head splice, Task 21 proxy chained in front if wanted)
 * → Render. This proxy is the MVP delivery; static baking of the same
 * rewrite map into built files is the production-build task's work.
 */
import { createServer, type Server } from "node:http";
import { createServer as createNetServer } from "node:net";
import { readFile } from "node:fs/promises";
import path from "node:path";

import { buildApp, startApp } from "../recon-template/parity-qa.js";
import { applyRewrite, mediaContentType } from "./rewrite.js";
import type { RewriteMap } from "./types.js";

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

const MEDIA_FILE = /^\/media\/([a-f0-9]{64}\.[a-z0-9]{1,5})$/;

export interface AssetProxyOptions {
  mediaDir: string;
  rewriteMap: RewriteMap;
  /** Optional Task 20 theme overlay CSS, appended to the generated stylesheet. */
  themeOverlayCss?: string;
}

/** Start the asset-rewrite proxy in front of an already-running app. */
export async function startAssetProxy(
  upstreamBaseUrl: string,
  options: AssetProxyOptions,
): Promise<{ baseUrl: string; stop: () => Promise<void> }> {
  const overlayBytes =
    options.themeOverlayCss !== undefined
      ? Buffer.from("\n" + options.themeOverlayCss, "utf8")
      : null;
  const port = await findFreePort();
  const server: Server = createServer((request, response) => {
    void (async () => {
      const rawPath = (request.url ?? "/").split("?")[0];
      const mediaMatch = rawPath.match(MEDIA_FILE);
      if (mediaMatch) {
        try {
          const body = await readFile(path.join(options.mediaDir, mediaMatch[1]));
          response.writeHead(200, {
            "content-type": mediaContentType(mediaMatch[1]),
            "content-length": String(body.length),
            "cache-control": "public, max-age=31536000, immutable",
          });
          response.end(body);
        } catch {
          response.writeHead(404, { "content-type": "text/plain" });
          response.end("media file not found\n");
        }
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
      const isStylesheet = rawPath === GENERATED_STYLES_PATH;
      const isHtml = contentType.includes("text/html");
      // RSC flight responses of client-side navigations carry asset URLs too.
      const isFlight = contentType.includes("text/x-component");
      let rewritten = false;
      if (upstream.status === 200 && (isHtml || isFlight)) {
        const result = applyRewrite(payload.toString("utf8"), options.rewriteMap, "html");
        if (result.replacedOccurrences > 0) {
          payload = Buffer.from(result.body, "utf8");
          rewritten = true;
        }
      }
      if (upstream.status === 200 && isStylesheet) {
        const result = applyRewrite(payload.toString("utf8"), options.rewriteMap, "css");
        payload = Buffer.from(result.body, "utf8");
        if (overlayBytes !== null) payload = Buffer.concat([payload, overlayBytes]);
        rewritten = true;
      }
      const outHeaders: Record<string, string> = {};
      upstream.headers.forEach((value, name) => {
        if (HOP_HEADERS.has(name.toLowerCase())) return;
        if (name.toLowerCase() === "etag" && rewritten) return;
        outHeaders[name] = value;
      });
      outHeaders["content-length"] = String(payload.length);
      response.writeHead(upstream.status, outHeaders);
      response.end(payload);
    })().catch((error) => {
      response.writeHead(502, { "content-type": "text/plain" });
      response.end(
        `asset proxy error: ${error instanceof Error ? error.message : String(error)}`,
      );
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

export interface AssetServedApp {
  baseUrl: string;
  upstreamBaseUrl: string;
  stop: () => Promise<void>;
}

/** Build (if needed) + start the immutable template app + asset proxy. */
export async function startAssetServedApp(options: {
  appDir: string;
  proxy: AssetProxyOptions;
  slotValuesFile?: string;
  forceBuild?: boolean;
  log?: (line: string) => void;
}): Promise<AssetServedApp> {
  const log = options.log ?? ((): void => {});
  await buildApp(options.appDir, options.forceBuild ?? false, log);
  const app = await startApp(
    options.appDir,
    options.slotValuesFile !== undefined
      ? { WR_SLOT_VALUES_FILE: options.slotValuesFile }
      : {},
  );
  const proxy = await startAssetProxy(app.baseUrl, options.proxy);
  return {
    baseUrl: proxy.baseUrl,
    upstreamBaseUrl: app.baseUrl,
    stop: async () => {
      await proxy.stop();
      await app.stop();
    },
  };
}
