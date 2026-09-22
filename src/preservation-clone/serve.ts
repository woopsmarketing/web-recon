import http from "node:http";
import fs from "node:fs/promises";
import net from "node:net";
import path from "node:path";

/**
 * Minimal static preview server for a Preservation Clone.
 *
 * Every other preview surface in this repository proxies a running Next app,
 * which a Preservation Clone is not: it is a directory of plain HTML, CSS and
 * binary assets. Rather than bend the clone into a Next app — which would mean
 * a build step re-emitting the very markup Phase 2 is preserving — this serves
 * the directory as-is. `file://` is not an option: relative asset paths and
 * @font-face loads must come from a real origin for the page to look right.
 */

const MIME: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".avif": "image/avif",
  ".gif": "image/gif",
  ".ico": "image/x-icon",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".ttf": "font/ttf",
  ".otf": "font/otf",
  ".eot": "application/vnd.ms-fontobject",
  ".mp4": "video/mp4",
  ".webm": "video/webm",
  ".mp3": "audio/mpeg",
  ".txt": "text/plain; charset=utf-8",
  ".bin": "application/octet-stream",
};

export interface PreviewServer {
  baseUrl: string;
  port: number;
  close: () => Promise<void>;
}

export async function findFreePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      const port = typeof address === "object" && address ? address.port : 0;
      server.close(() => resolve(port));
    });
  });
}

export async function startPreviewServer(
  rootDir: string,
  options: { port?: number; host?: string } = {},
): Promise<PreviewServer> {
  const root = path.resolve(rootDir);
  const host = options.host ?? "127.0.0.1";
  const port = options.port ?? (await findFreePort());

  const server = http.createServer((request, response) => {
    void (async () => {
      try {
        const url = new URL(request.url ?? "/", `http://${host}:${port}`);
        let relative = decodeURIComponent(url.pathname);
        if (relative.endsWith("/")) relative += "index.html";
        // Containment check on the RESOLVED path: `..` segments, encoded or
        // not, cannot escape the clone root.
        const target = path.resolve(root, `.${relative}`);
        if (target !== root && !target.startsWith(root + path.sep)) {
          response.writeHead(403).end("forbidden");
          return;
        }
        let body: Buffer;
        try {
          const stat = await fs.stat(target);
          if (stat.isDirectory()) {
            response.writeHead(308, { location: `${url.pathname}/` }).end();
            return;
          }
          body = await fs.readFile(target);
        } catch {
          response
            .writeHead(404, { "content-type": "text/plain; charset=utf-8" })
            .end(`not found: ${relative}`);
          return;
        }
        response.writeHead(200, {
          "content-type": MIME[path.extname(target).toLowerCase()] ?? "application/octet-stream",
          "content-length": body.byteLength,
          "cache-control": "no-store",
          // The clone must never execute source JS, even if a neutralized
          // script were somehow re-enabled downstream.
          "content-security-policy": "script-src 'none'",
        });
        response.end(body);
      } catch (error) {
        response.writeHead(500).end(String(error));
      }
    })();
  });

  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, host, () => resolve());
  });

  return {
    baseUrl: `http://${host === "0.0.0.0" ? "127.0.0.1" : host}:${port}`,
    port,
    close: () =>
      new Promise<void>((resolve) => {
        server.close(() => resolve());
      }),
  };
}
