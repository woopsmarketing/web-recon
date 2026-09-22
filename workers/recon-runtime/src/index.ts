/**
 * recon-runtime — thin static serving Worker for published Site Build Packages.
 *
 *   request host ──► R2 routing/<host>.json ──► sites/<siteId>/packages/<packageHash>/<key>
 *
 * It only maps URLs to immutable package objects and returns their bytes unchanged with the
 * content-type / cache-control stored at publish time. It never redirects, never falls back to
 * another site, never rewrites bodies, never adds canonical tags. GET/HEAD only.
 *
 * No Cache API: every request reads the pointer and the object from R2 (two Class B reads), so a
 * re-point / rollback takes effect on the next request with no purge step. Browsers cache
 * content-hashed files for a year (immutable) and revalidate everything else with ETag → 304.
 * Revisit only if R2 read volume or latency is measured to matter; a cache key must then include
 * packageHash + the resolved object key, never hostname + pathname alone.
 *
 * Failure classes (each has one deterministic status; nothing ever falls through to another site):
 *   method other than GET/HEAD            405   method-not-allowed
 *   host not a valid hostname / no pointer 404   unknown-host        (plain text, never a site page)
 *   pointer unparsable / schema-invalid /
 *     names another hostname               500   pointer-invalid
 *   path rejected by the resolver          400   bad-path
 *   object missing, package has 404.html   404   not-found           (the package's own 404 page)
 *   object missing AND 404.html missing    503   package-missing     (every published package has a
 *                                                                     404.html, so the package the
 *                                                                     pointer names is not there)
 *   R2 / unexpected error                  500   internal-error
 *
 * Logs: one JSON line per response with status >= 400 (every response when LOG_ALL = "1"):
 * host, path (no query string, first 256 characters), method, status, outcome, siteId,
 * packageHash, key. No headers, no query strings, no bodies.
 */

import { CACHE_REVALIDATE, HASH_RE, HOSTNAME_RE, SITE_ID_RE, packageKey, routingKey, type RoutingPointer } from "./contract";
import { NOT_FOUND_KEY, resolvePath } from "./paths";

/** Minimal R2 binding surface used here (kept local so the Worker has no type dependency). */
export interface R2ObjectLike {
  size: number;
  httpEtag: string;
  httpMetadata?: { contentType?: string; cacheControl?: string };
}
export interface R2ObjectBodyLike extends R2ObjectLike {
  body: ReadableStream;
  text(): Promise<string>;
}
export interface R2BucketLike {
  get(key: string): Promise<R2ObjectBodyLike | null>;
  head(key: string): Promise<R2ObjectLike | null>;
}
export interface Env {
  SITES: R2BucketLike;
  /** "1" → log every response, not only status >= 400 */
  LOG_ALL?: string;
}

export type Outcome =
  | "served"
  | "not-modified"
  | "not-found"
  | "package-missing"
  | "unknown-host"
  | "pointer-invalid"
  | "bad-path"
  | "method-not-allowed"
  | "internal-error";

/** What one request resolved to; the only thing that is ever logged. */
export interface Trace {
  host: string;
  path: string;
  method: string;
  status?: number;
  outcome?: Outcome;
  siteId?: string;
  packageHash?: string;
  key?: string;
  error?: string;
}

const ALLOW = "GET, HEAD";
/** R2 refuses keys longer than 1024 bytes (it throws); such a path cannot name a package file, so it is a miss. */
const MAX_KEY_BYTES = 1024;
/** The request path is attacker-controlled: cap what one log line can carry. */
const MAX_LOGGED_PATH = 256;

function plain(status: number, text: string, extra: Record<string, string> = {}): Response {
  return new Response(text, {
    status,
    headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff", ...extra },
  });
}

function objectHeaders(obj: R2ObjectLike, cacheControl?: string): Headers {
  return new Headers({
    "Content-Type": obj.httpMetadata?.contentType ?? "application/octet-stream",
    "Cache-Control": cacheControl ?? obj.httpMetadata?.cacheControl ?? CACHE_REVALIDATE,
    ETag: obj.httpEtag,
    "Content-Length": String(obj.size),
    "X-Content-Type-Options": "nosniff",
  });
}

/** RFC 9110 If-None-Match (weak comparison). */
export function etagMatches(ifNoneMatch: string | null, etag: string): boolean {
  if (!ifNoneMatch) return false;
  const strip = (t: string) => t.trim().replace(/^W\//, "");
  return ifNoneMatch.split(",").some((t) => t.trim() === "*" || strip(t) === strip(etag));
}

function parsePointer(raw: string, host: string): RoutingPointer | undefined {
  try {
    const p = JSON.parse(raw) as RoutingPointer;
    if (p.schemaVersion !== 1 || p.hostname !== host || !SITE_ID_RE.test(p.siteId) || !HASH_RE.test(p.packageHash)) return undefined;
    return p;
  } catch {
    return undefined;
  }
}

/** Request hostname as the routing key spells it: lowercase, one trailing FQDN dot dropped. */
export function requestHost(url: URL): string {
  return url.hostname.toLowerCase().replace(/\.$/, "");
}

export function newTrace(request: Request): Trace {
  const url = new URL(request.url);
  return { host: requestHost(url), path: url.pathname.slice(0, MAX_LOGGED_PATH), method: request.method };
}

export async function handle(request: Request, env: Env, trace: Trace = newTrace(request)): Promise<Response> {
  const head = request.method === "HEAD";
  const end = (outcome: Outcome, response: Response): Response => {
    trace.outcome = outcome;
    trace.status = response.status;
    // HEAD never carries a body, error texts included.
    return head && response.body ? new Response(null, { status: response.status, headers: response.headers }) : response;
  };

  if (request.method !== "GET" && !head) return end("method-not-allowed", plain(405, "method not allowed\n", { Allow: ALLOW }));
  const host = trace.host;
  if (!HOSTNAME_RE.test(host)) return end("unknown-host", plain(404, "unknown host\n"));

  const pointerObj = await env.SITES.get(routingKey(host));
  if (!pointerObj) return end("unknown-host", plain(404, "unknown host\n"));
  const pointer = parsePointer(await pointerObj.text(), host);
  if (!pointer) return end("pointer-invalid", plain(500, "routing misconfigured\n"));
  trace.siteId = pointer.siteId;
  trace.packageHash = pointer.packageHash;

  const resolved = resolvePath(new URL(request.url).pathname);
  if (resolved.kind === "bad-request") return end("bad-path", plain(400, "bad request\n"));
  const key = (rel: string) => packageKey(pointer.siteId, pointer.packageHash, rel);

  if (resolved.kind === "key" && new TextEncoder().encode(key(resolved.key)).length <= MAX_KEY_BYTES) {
    trace.key = resolved.key;
    if (head) {
      const meta = await env.SITES.head(key(resolved.key));
      if (meta) return respond(meta, null, 200, request, end);
    } else {
      const obj = await env.SITES.get(key(resolved.key));
      if (obj) return respond(obj, obj.body, 200, request, end);
    }
  }

  // Miss (or a path that is never served): the package's own 404 page, status 404.
  const notFound = head ? await env.SITES.head(key(NOT_FOUND_KEY)) : await env.SITES.get(key(NOT_FOUND_KEY));
  if (!notFound) return end("package-missing", plain(503, "package unavailable\n"));
  return respond(notFound, "body" in notFound ? (notFound as R2ObjectBodyLike).body : null, 404, request, end);
}

function respond(obj: R2ObjectLike, body: ReadableStream | null, status: 200 | 404, request: Request, end: (outcome: Outcome, response: Response) => Response): Response {
  if (status === 404) {
    // An error page is never a cache/revalidation target.
    const headers = objectHeaders(obj, "no-store");
    headers.delete("ETag");
    return end("not-found", new Response(body, { status, headers }));
  }
  const headers = objectHeaders(obj);
  if (etagMatches(request.headers.get("If-None-Match"), obj.httpEtag)) {
    void body?.cancel();
    headers.delete("Content-Length");
    return end("not-modified", new Response(null, { status: 304, headers }));
  }
  return end("served", new Response(body, { status, headers }));
}

/** One structured line; failures always, successes only on request (LOG_ALL). */
export function logTrace(env: Pick<Env, "LOG_ALL">, trace: Trace, sink: (line: string) => void = console.log): void {
  if ((trace.status ?? 500) < 400 && env.LOG_ALL !== "1") return;
  sink(JSON.stringify({ evt: "recon-runtime", ...trace }));
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const trace = newTrace(request);
    let response: Response;
    try {
      response = await handle(request, env, trace);
    } catch (e) {
      trace.outcome = "internal-error";
      trace.status = 500;
      trace.error = String((e as Error)?.message ?? e).slice(0, 200);
      response = plain(500, "internal error\n");
    }
    logTrace(env, trace);
    return response;
  },
};
