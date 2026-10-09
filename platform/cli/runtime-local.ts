/**
 * pnpm runtime:local --bucket-dir <dir> --host <hostname> --paths /,/portfolio,/x
 * pnpm runtime:local --bucket-dir <dir> --host <hostname> --listen <port>
 *
 * Runs the REAL recon-runtime request handler (workers/recon-runtime/src/index.ts → handle) over a
 * directory that stands in for the R2 bucket. No wrangler, no miniflare, no network, and nothing is
 * ever written: the shim has get() and head() only.
 *
 *   object key = file path relative to --bucket-dir
 *     <dir>/routing/<host>.json
 *     <dir>/sites/<siteId>/packages/<packageHash>/index.html …        (a package's site/ directory)
 *     <dir>/portfolio-public/<siteId>/current/<packageHash>.json       (+ revisions/, blobs/, projects/)
 *     <dir>/portfolio-assets/<storage_key>
 *   A key with an empty, "." or ".." segment, a backslash or a NUL is "no such object"; so is anything
 *   that is not a regular file (a symlink to one is followed, so a package directory may be linked in).
 *
 * What the Worker reads from R2 metadata, and what the shim gives it:
 *   httpMetadata.contentType / cacheControl
 *       a package file (sites/<siteId>/packages/<packageHash>/<rel>) gets exactly what site:publish
 *       stores with it: contentTypeFor(rel) and cachePolicyFor(rel, sha256) of platform/publish/media.ts
 *       (an extension that table does not know has no content type → the Worker's octet-stream).
 *       Any other object gets its extension's content type and no cache-control; the Worker never uses
 *       either for an overlay object — it takes both from the verified manifest.
 *   httpEtag   the quoted md5 of the bytes (what R2 reports for a single-part upload)
 *   size       the file size
 *
 * --paths: one GET per path, one JSON line each on stdout:
 *   {path,status,contentType,cacheControl,bytes,sha256,overlay,outcome}
 *   bytes / sha256 are of the response body. `outcome` is the Worker's own trace.outcome.
 *   overlay — what this request shows about the portfolio overlay:
 *     null                                       no overlay in play: the Worker did not look for one
 *                                                (/_next/, /_runtime/, or the request ended earlier) or
 *                                                the site has no pointer for this package
 *     {"state":"refused","reason":"<trace.overlay>"}   the pointer / manifest was refused → 503 no-store (fails closed)
 *     {"state":"live","source":"overlay","key":"<R2 key>"}   answered from an object the manifest lists
 *     {"state":"live","source":"package","key":"<package file>"|null}
 *                                                a verified manifest is live and this path is not one of
 *                                                its objects: a package file, or (key null / status 404)
 *                                                the package's 404 page for an owned path
 * --listen: an HTTP server on 127.0.0.1:<port> (0 = any free port) that answers every request as if it
 *   had arrived for --host. First stdout line: {"listening":"http://127.0.0.1:<port>","host":…,"bucketDir":…}.
 *
 * The Worker's own log lines (status >= 400, which includes a refused overlay; every request with --log-all) go to stderr.
 */
import { createHash } from "node:crypto";
import { readFile, stat } from "node:fs/promises";
import http from "node:http";
import type { AddressInfo } from "node:net";
import path from "node:path";
import { cachePolicyFor, contentTypeFor } from "../publish/media";
import { HOSTNAME_RE, portfolioAssetKey, portfolioCurrentKey, portfolioPublicKey } from "../../workers/recon-runtime/src/contract";
import { handle, logTrace, newTrace, type Env, type R2BucketLike, type R2ObjectBodyLike, type R2ObjectLike, type Trace } from "../../workers/recon-runtime/src/index";

const args = process.argv.slice(2);
const VALUE_FLAGS = ["--bucket-dir", "--host", "--paths", "--listen"];
const BOOL_FLAGS = ["--log-all"];
const usage = "usage: pnpm runtime:local --bucket-dir <dir> --host <hostname> (--paths /,/a,/b | --listen <port>) [--log-all]";
function usageError(message?: string): never {
  console.error(message ? `runtime:local: ${message}\n${usage}` : usage);
  process.exit(2);
}
function flag(name: string): string | undefined {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : undefined;
}
const unknown = args.filter((a, i) => (a.startsWith("--") ? !VALUE_FLAGS.includes(a) && !BOOL_FLAGS.includes(a) : !VALUE_FLAGS.includes(args[i - 1] ?? "")));
if (unknown.length > 0) usageError(`unknown arguments: ${unknown.join(" ")}`);
const bucketDirArg = flag("--bucket-dir");
const host = flag("--host")?.toLowerCase();
const pathsArg = flag("--paths");
const listenArg = flag("--listen");
if (!bucketDirArg || !host) usageError();
if (!HOSTNAME_RE.test(host)) usageError(`--host "${host}" is not a hostname (no scheme, no port)`);
if ((pathsArg === undefined) === (listenArg === undefined)) usageError("give exactly one of --paths and --listen");
if (listenArg !== undefined && !/^\d{1,5}$/.test(listenArg)) usageError(`--listen must be a port number, got "${listenArg}"`);
const bucketDir = path.resolve(bucketDirArg);
if (!(await stat(bucketDir).catch(() => undefined))?.isDirectory()) usageError(`--bucket-dir ${bucketDirArg} is not a directory`);

const PACKAGE_KEY_RE = /^sites\/[^/]+\/packages\/[^/]+\/(.+)$/;

/** Read-only R2 stand-in over a directory; one per request, so it also knows which keys that request asked for and which of them exist. */
class DirBucket implements R2BucketLike {
  /** key → found */
  readonly asked = new Map<string, boolean>();

  private async read(key: string): Promise<{ bytes: Buffer; meta: R2ObjectLike } | null> {
    const found = await this.load(key);
    this.asked.set(key, found !== null);
    return found;
  }

  private async load(key: string): Promise<{ bytes: Buffer; meta: R2ObjectLike } | null> {
    if (key.includes("\\") || key.includes("\0") || key.split("/").some((seg) => seg === "" || seg === "." || seg === "..")) return null;
    const file = path.join(bucketDir, ...key.split("/"));
    if (!(await stat(file).catch(() => undefined))?.isFile()) return null;
    const bytes = await readFile(file);
    const rel = PACKAGE_KEY_RE.exec(key)?.[1];
    const httpMetadata = rel === undefined ? { contentType: contentTypeFor(key) } : { contentType: contentTypeFor(rel), cacheControl: cachePolicyFor(rel, createHash("sha256").update(bytes).digest("hex")).cacheControl };
    return { bytes, meta: { size: bytes.length, httpEtag: `"${createHash("md5").update(bytes).digest("hex")}"`, httpMetadata } };
  }

  async get(key: string): Promise<R2ObjectBodyLike | null> {
    const o = await this.read(key);
    return o && { ...o.meta, body: new Blob([new Uint8Array(o.bytes)]).stream(), text: async () => o.bytes.toString("utf8") };
  }

  async head(key: string): Promise<R2ObjectLike | null> {
    return (await this.read(key))?.meta ?? null;
  }
}

type OverlayView = null | { state: "refused"; reason: string } | { state: "live"; source: "overlay" | "package"; key: string | null };

const logAll = args.includes("--log-all");

/** One request through the Worker, exactly as its default export runs it (handle → internal-error on a throw → one log line). */
async function serve(request: Request): Promise<{ response: Response; trace: Trace; overlay: OverlayView }> {
  const bucket = new DirBucket();
  const env: Env = { SITES: bucket, ...(logAll ? { LOG_ALL: "1" } : {}) };
  const trace = newTrace(request);
  let response: Response;
  try {
    response = await handle(request, env, trace);
  } catch (e) {
    trace.outcome = "internal-error";
    trace.status = 500;
    trace.error = String((e as Error)?.message ?? e).slice(0, 200);
    response = new Response("internal error\n", { status: 500, headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" } });
  }
  logTrace(env, trace, (line) => console.error(line));

  let overlay: OverlayView = null;
  if (trace.overlay !== undefined) overlay = { state: "refused", reason: trace.overlay };
  else if (trace.siteId && trace.packageHash && bucket.asked.get(portfolioCurrentKey(trace.siteId, trace.packageHash)) === true) {
    // The pointer was found and nothing was refused: the manifest it names is the one in use.
    const fromOverlay = trace.key !== undefined && bucket.asked.has(trace.key) && (trace.key.startsWith(portfolioPublicKey(trace.siteId, "")) || trace.key.startsWith(portfolioAssetKey("")));
    overlay = { state: "live", source: fromOverlay ? "overlay" : "package", key: trace.key ?? null };
  }
  return { response, trace, overlay };
}

if (pathsArg !== undefined) {
  for (const p of pathsArg.split(",").map((s) => s.trim()).filter((s) => s.length > 0)) {
    if (!p.startsWith("/")) usageError(`--paths entries start with "/", got "${p}"`);
    const { response, trace, overlay } = await serve(new Request(`https://${host}${p}`));
    const body = new Uint8Array(await response.arrayBuffer());
    console.log(
      JSON.stringify({
        path: p,
        status: response.status,
        contentType: response.headers.get("content-type"),
        cacheControl: response.headers.get("cache-control"),
        bytes: body.length,
        sha256: createHash("sha256").update(body).digest("hex"),
        overlay,
        outcome: trace.outcome ?? null,
      }),
    );
  }
} else {
  const server = http.createServer((req, res) => {
    void (async () => {
      const target = req.url ?? "/";
      // Origin-form only; the path is appended as text so "//other.example/x" stays a path of --host.
      if (!target.startsWith("/")) {
        res.writeHead(400, { "content-type": "text/plain; charset=utf-8", "cache-control": "no-store" }).end("bad request\n");
        return;
      }
      const headers = new Headers();
      for (const [name, value] of Object.entries(req.headers)) {
        if (name === "host" || name === "connection" || value === undefined) continue;
        headers.set(name, Array.isArray(value) ? value.join(", ") : value);
      }
      let request: Request;
      try {
        request = new Request(`https://${host}${target}`, { method: req.method, headers });
      } catch {
        res.writeHead(400, { "content-type": "text/plain; charset=utf-8", "cache-control": "no-store" }).end("bad request\n");
        return;
      }
      const { response } = await serve(request);
      const out: Record<string, string> = {};
      response.headers.forEach((value, name) => (out[name] = value));
      res.writeHead(response.status, out);
      res.end(req.method === "HEAD" ? undefined : Buffer.from(await response.arrayBuffer()));
    })().catch((error: unknown) => {
      console.error(`runtime:local: ${(error as Error)?.message ?? String(error)}`);
      if (!res.headersSent) res.writeHead(500, { "content-type": "text/plain; charset=utf-8", "cache-control": "no-store" });
      res.end("internal error\n");
    });
  });
  server.on("error", (error) => {
    console.error(`runtime:local: ${error.message}`);
    process.exit(1);
  });
  server.listen(Number(listenArg), "127.0.0.1", () => {
    const { port } = server.address() as AddressInfo;
    console.log(JSON.stringify({ listening: `http://127.0.0.1:${port}`, host, bucketDir }));
  });
}
