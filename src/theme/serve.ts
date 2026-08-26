import { createServer, type Server } from "node:http";
import { createServer as createNetServer } from "node:net";
import { buildApp, startApp } from "../recon-template/parity-qa.js";

/**
 * Theme-applied serving (§15/§16/§34).
 *
 * The Recon Template app is served completely unmodified (`next start` on the
 * immutable artifact — content overlay via the Task 18/19 official
 * `WR_SLOT_VALUES_FILE` env). The theme overlay joins at the SERVE boundary:
 * a local reverse proxy forwards every request byte-for-byte and appends the
 * theme run's overlay CSS to exactly one response — the app's own generated
 * stylesheet. The composition order of §34 is therefore structural:
 *
 *   Template → Content Overlay (server env) → Theme Overlay (stylesheet append) → Render
 *
 * The served HTML is byte-identical with and without a theme (only the CSS
 * asset grows), so hydration cannot be affected by construction; with no
 * theme there is no proxy and the template's bytes and behavior are
 * untouched (§15 핵심).
 */

export const GENERATED_STYLES_PATH = "/wr/generated-styles.css";

export interface ThemedApp {
  baseUrl: string;
  upstreamBaseUrl: string;
  stop: () => Promise<void>;
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

/** Starts an appending proxy in front of an already-running app. */
export async function startOverlayProxy(
  upstreamBaseUrl: string,
  overlayCss: string,
): Promise<{ baseUrl: string; stop: () => Promise<void> }> {
  const overlayBytes = Buffer.from("\n" + overlayCss, "utf8");
  const port = await findFreePort();
  const server: Server = createServer((request, response) => {
    void (async () => {
      const url = upstreamBaseUrl + (request.url ?? "/");
      const headers: Record<string, string> = {};
      for (const [name, value] of Object.entries(request.headers)) {
        if (HOP_HEADERS.has(name.toLowerCase())) continue;
        if (typeof value === "string") headers[name] = value;
        else if (Array.isArray(value)) headers[name] = value.join(", ");
      }
      // Ask for identity encoding so the append is a plain concatenation.
      headers["accept-encoding"] = "identity";
      const chunks: Buffer[] = [];
      for await (const chunk of request) chunks.push(chunk as Buffer);
      const body = Buffer.concat(chunks);
      const upstream = await fetch(url, {
        method: request.method ?? "GET",
        headers,
        ...(body.length > 0 ? { body } : {}),
        redirect: "manual",
      });
      let payload = Buffer.from(await upstream.arrayBuffer());
      const isStylesheet = (request.url ?? "").split("?")[0] === GENERATED_STYLES_PATH;
      if (isStylesheet && upstream.status === 200) {
        payload = Buffer.concat([payload, overlayBytes]);
      }
      const outHeaders: Record<string, string> = {};
      upstream.headers.forEach((value, name) => {
        if (HOP_HEADERS.has(name.toLowerCase())) return;
        if (name.toLowerCase() === "etag" && isStylesheet) return;
        outHeaders[name] = value;
      });
      outHeaders["content-length"] = String(payload.length);
      response.writeHead(upstream.status, outHeaders);
      response.end(payload);
    })().catch((error) => {
      response.writeHead(502, { "content-type": "text/plain" });
      response.end(`overlay proxy error: ${error instanceof Error ? error.message : String(error)}`);
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

/**
 * Build (if needed) + start the immutable template app, optionally with the
 * Task 19 content overlay env, then front it with the theme overlay proxy.
 */
export async function startThemedApp(options: {
  appDir: string;
  overlayCss: string;
  slotValuesFile?: string;
  forceBuild?: boolean;
  log?: (line: string) => void;
}): Promise<ThemedApp> {
  const log = options.log ?? (() => {});
  await buildApp(options.appDir, options.forceBuild ?? false, log);
  const app = await startApp(
    options.appDir,
    options.slotValuesFile !== undefined ? { WR_SLOT_VALUES_FILE: options.slotValuesFile } : {},
  );
  const proxy = await startOverlayProxy(app.baseUrl, options.overlayCss);
  return {
    baseUrl: proxy.baseUrl,
    upstreamBaseUrl: app.baseUrl,
    stop: async () => {
      await proxy.stop();
      await app.stop();
    },
  };
}
