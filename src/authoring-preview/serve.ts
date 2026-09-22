/**
 * The authoring preview SERVE BOUNDARY (Task 28 Phase 3).
 *
 * One stable-URL reverse proxy in front of one `next start`, following the
 * exact precedent of src/theme/serve.ts, src/seo/serve.ts and
 * src/assets/serve.ts — same hop-header set, same identity encoding, same
 * "buffer the body, splice bytes, fix content-length" shape. It differs from
 * those three in exactly the places Phase 3 needs to be HOT:
 *
 *   THEME    the overlay CSS is re-read from disk when its (mtime,size)
 *            moves, instead of being frozen into a Buffer at construction.
 *            The served HTML is byte-identical by construction, so a theme
 *            edit can never affect hydration.
 *   MEDIA    /media/<name> is served from the preview's override directory
 *            first and from the frozen materialization second — the
 *            per-request disk read that src/assets/serve.ts already does is
 *            the hot seam, reused, not reinvented. The one change that makes
 *            it usable from a browser: `cache-control: no-store` in authoring
 *            mode (the shipped proxy sends `immutable`, which measurably
 *            produces zero refetches and a permanently stale pixel).
 *   EDITOR   an editor-only <script> is spliced before `</head>` of HTML
 *            responses. It exists only in these bytes: no file inside the app
 *            is written, so the production compiler — which copies the
 *            immutable template run — cannot reach it.
 *
 * CONTENT is NOT handled here. Slot values are the app's own business through
 * the official WR_SLOT_VALUES_FILE seam plus the authoring epoch; proxy-level
 * string substitution was measured and rejected (it addresses a STRING while
 * Slot V2 addresses an OCCURRENCE, and 34% of this template's text slots share
 * their default value with another slot).
 */
import { createServer, type Server } from "node:http";
import { createServer as createNetServer } from "node:net";
import { readFile, stat } from "node:fs/promises";
import path from "node:path";

import { applyRewrite, mediaContentType } from "../assets/rewrite.js";
import type { RewriteMap } from "../assets/types.js";
import { renderEditorBridgeScript, type EditorBridgeConfig } from "./bridge.js";

export const GENERATED_STYLES_PATH = "/wr/generated-styles.css";
export const EPOCH_ENDPOINT = "/__wr_authoring__/epoch";

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

const MEDIA_FILE = /^\/media\/([A-Za-z0-9._-]+)$/;

/**
 * Content type of an OPERATOR OVERRIDE, sniffed from the bytes.
 *
 * The media file name is the frozen materialization's content hash plus the
 * ORIGINAL extension, and an operator replacing `<sha>.webp` with a PNG is
 * ordinary. Serving those bytes as `image/webp` because of the name would give
 * a broken image. Only the override path sniffs; the frozen materialization is
 * still served by its (correct, hash-derived) name.
 */
export function sniffImageContentType(bytes: Buffer): string | null {
  if (bytes.length >= 8 && bytes.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) {
    return "image/png";
  }
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "image/jpeg";
  if (bytes.length >= 6 && bytes.subarray(0, 6).toString("ascii").startsWith("GIF8")) return "image/gif";
  if (
    bytes.length >= 12 &&
    bytes.subarray(0, 4).toString("ascii") === "RIFF" &&
    bytes.subarray(8, 12).toString("ascii") === "WEBP"
  ) {
    return "image/webp";
  }
  if (bytes.length >= 5 && bytes.subarray(0, 5).toString("ascii") === "<?xml") return "image/svg+xml";
  if (bytes.length >= 4 && bytes.subarray(0, 4).toString("ascii") === "<svg") return "image/svg+xml";
  return null;
}

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

export interface AuthoringProxyOptions {
  /** Preview overlay theme CSS file — re-read when its (mtime,size) moves. */
  themeOverlayFile: string;
  /** Operator image overrides, checked before the frozen materialization. */
  mediaOverrideDir: string;
  /** The frozen materialization's media dir, if the lineage has one. */
  mediaDir?: string;
  /** The frozen materialization's rewrite map, if the lineage has one. */
  rewriteMap?: RewriteMap;
  /** Editor bridge configuration; omit to serve WITHOUT any bridge. */
  bridge?: EditorBridgeConfig;
  /** Reports the current authoring epoch on EPOCH_ENDPOINT. */
  readEpoch?: () => string;
}

export interface AuthoringProxy {
  baseUrl: string;
  /** Bytes served for the bridge, or "" when no bridge is configured. */
  bridgeScript: string;
  stop: () => Promise<void>;
}

/** Start the authoring proxy in front of an already-running preview app. */
export async function startAuthoringProxy(
  /** A GETTER, not a string: a fallback worker restart moves the upstream
   *  port, and the whole point of this proxy is that the editor's preview URL
   *  never moves with it. */
  upstream: string | (() => string),
  options: AuthoringProxyOptions,
): Promise<AuthoringProxy> {
  const upstreamBase = typeof upstream === "string" ? (): string => upstream : upstream;
  const bridgeScript = options.bridge === undefined ? "" : renderEditorBridgeScript(options.bridge);

  // Theme overlay: hot, mtime-gated. Frozen-at-construction is exactly the bug.
  let themeStamp = "";
  let themeBytes = Buffer.alloc(0);
  const themeOverlay = async (): Promise<Buffer> => {
    let stamp: string;
    try {
      const info = await stat(options.themeOverlayFile);
      stamp = `${info.mtimeMs}:${info.size}`;
    } catch {
      themeStamp = "missing";
      themeBytes = Buffer.alloc(0);
      return themeBytes;
    }
    if (stamp !== themeStamp) {
      themeStamp = stamp;
      const css = await readFile(options.themeOverlayFile, "utf8");
      themeBytes = css === "" ? Buffer.alloc(0) : Buffer.from("\n" + css, "utf8");
    }
    return themeBytes;
  };

  const port = await findFreePort();
  const server: Server = createServer((request, response) => {
    void (async () => {
      const rawPath = (request.url ?? "/").split("?")[0];

      if (rawPath === EPOCH_ENDPOINT) {
        const body = Buffer.from(options.readEpoch?.() ?? "", "utf8");
        response.writeHead(200, {
          "content-type": "text/plain; charset=utf-8",
          "content-length": String(body.length),
          "cache-control": "no-store",
        });
        response.end(body);
        return;
      }

      const mediaMatch = rawPath.match(MEDIA_FILE);
      if (mediaMatch) {
        const name = mediaMatch[1];
        if (name.includes("..")) {
          response.writeHead(400, { "content-type": "text/plain" });
          response.end("bad media name\n");
          return;
        }
        const candidates: Array<{ file: string; override: boolean }> = [
          { file: path.join(options.mediaOverrideDir, name), override: true },
        ];
        if (options.mediaDir !== undefined) {
          candidates.push({ file: path.join(options.mediaDir, name), override: false });
        }
        for (const candidate of candidates) {
          try {
            // Per-request disk read — the existing hot seam, reused.
            const body = await readFile(candidate.file);
            response.writeHead(200, {
              "content-type": candidate.override
                ? sniffImageContentType(body) ?? mediaContentType(name)
                : mediaContentType(name),
              "content-length": String(body.length),
              // AUTHORING MODE: the shipped asset proxy sends `immutable`,
              // which makes a replaced image invisible to a browser forever.
              "cache-control": "no-store, must-revalidate",
            });
            response.end(body);
            return;
          } catch {
            continue;
          }
        }
        response.writeHead(404, { "content-type": "text/plain" });
        response.end("media file not found\n");
        return;
      }

      const url = upstreamBase() + (request.url ?? "/");
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
      const isFlight = contentType.includes("text/x-component");
      let mutated = false;

      if (upstream.status === 200 && (isHtml || isFlight) && options.rewriteMap !== undefined) {
        const result = applyRewrite(payload.toString("utf8"), options.rewriteMap, "html");
        if (result.replacedOccurrences > 0) {
          payload = Buffer.from(result.body, "utf8");
          mutated = true;
        }
      }
      // The bridge goes into HTML documents ONLY — never into an RSC flight
      // payload, which React parses as data, not as markup.
      if (upstream.status === 200 && isHtml && bridgeScript !== "") {
        const html = payload.toString("utf8");
        const headClose = html.indexOf("</head>");
        if (headClose !== -1) {
          payload = Buffer.from(html.slice(0, headClose) + bridgeScript + html.slice(headClose), "utf8");
          mutated = true;
        }
      }
      if (upstream.status === 200 && isStylesheet) {
        let css = payload.toString("utf8");
        if (options.rewriteMap !== undefined) css = applyRewrite(css, options.rewriteMap, "css").body;
        payload = Buffer.concat([Buffer.from(css, "utf8"), await themeOverlay()]);
        mutated = true;
      }

      const outHeaders: Record<string, string> = {};
      upstream.headers.forEach((value, name) => {
        if (HOP_HEADERS.has(name.toLowerCase())) return;
        if (name.toLowerCase() === "etag" && mutated) return;
        outHeaders[name] = value;
      });
      outHeaders["content-length"] = String(payload.length);
      // Authoring: never let a browser cache a document or a stylesheet whose
      // bytes the operator is actively editing.
      if (isHtml || isStylesheet || isFlight) outHeaders["cache-control"] = "no-store, must-revalidate";
      response.writeHead(upstream.status, outHeaders);
      response.end(payload);
    })().catch((error) => {
      response.writeHead(502, { "content-type": "text/plain" });
      response.end(
        `authoring preview proxy error: ${error instanceof Error ? error.message : String(error)}`,
      );
    });
  });
  await new Promise<void>((resolve, reject) => {
    server.on("error", reject);
    server.listen(port, "127.0.0.1", () => resolve());
  });
  return {
    baseUrl: `http://127.0.0.1:${port}`,
    bridgeScript,
    stop: () =>
      new Promise<void>((resolve) => {
        server.closeAllConnections();
        server.close(() => resolve());
      }),
  };
}
