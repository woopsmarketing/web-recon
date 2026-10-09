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
 * Portfolio overlay (a site whose portfolio is published without a rebuild). Outside /_next/ and
 * /_runtime/ one more read looks for portfolio-public/<siteId>/current/<packageHash>.json:
 *   absent, ordinary package    the package alone, exactly as above
 *   absent, SHELL package       503 "content unavailable", no-store, + one log line (outcome
 *                               overlay-absent, trace.overlay = "absent"). FAILS CLOSED: a shell
 *                               package (it carries _runtime/portfolio/runtime.json) is served only
 *                               together with its portfolio — its own portfolio pages are empty
 *                               placeholders, and every other page of it links to them
 *   present and verified        manifest.routes[path]  → portfolio-public/<siteId>/<key>   (revalidate)
 *                               manifest.assets[path]  → portfolio-assets/<key>            (immutable)
 *                               path owned by the manifest, in neither table → the package's 404 page
 *                               anything else          → the package
 *   present, does not verify    503 "content unavailable", no-store, + one log line (outcome
 *                               overlay-refused, trace.overlay = which check refused). FAILS CLOSED: a
 *                               pointer exists only for a shell package, whose own portfolio pages are
 *                               empty placeholders — they are never served in place of a portfolio that
 *                               cannot be verified. A manifest is used only when the pointer's and the
 *                               manifest's schema, siteId and package hash match the routing pointer
 *                               and the bytes hash to manifestSha256
 * The pointer is read on every request, so a publish / rollback is live on the next one; manifests are
 * immutable and kept parsed in isolate memory by key + sha256. portfolio-assets/ is reachable through
 * manifest.assets only, so an image that is not in the live manifest has no URL.
 * Whether a package is a shell is asked only when its pointer is absent, with one HEAD of
 * _runtime/portfolio/runtime.json, and remembered per isolate by siteId + packageHash (a package
 * never changes): an ordinary site pays one extra read per isolate, a shell with its pointer none.
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
 *   object the live manifest lists missing 503   overlay-missing     (never the package's file instead)
 *   overlay pointer present, not verified  503   overlay-refused     (never the shell package's pages;
 *                                                                     /_next/ and /_runtime/ are answered
 *                                                                     as always — they read no pointer)
 *   shell package, no overlay pointer      503   overlay-absent      (same paths, same reason: a shell
 *                                                                     page is never served on its own)
 *   R2 / unexpected error                  500   internal-error
 *
 * Logs: one JSON line per response with status >= 400 (every response when LOG_ALL = "1"):
 * host, path (no query string, first 256 characters), method, status, outcome, siteId,
 * packageHash, key, plus overlay = the check that refused a portfolio pointer / manifest, or
 * "absent" for a shell package that has no pointer (a 503 either way).
 * No headers, no query strings, no bodies.
 */

import {
  CACHE_IMMUTABLE,
  CACHE_REVALIDATE,
  HASH_RE,
  HOSTNAME_RE,
  PORTFOLIO_CURRENT_SCHEMA,
  PORTFOLIO_MANIFEST_SCHEMA,
  SITE_ID_RE,
  isPortfolioKey,
  packageKey,
  portfolioAssetKey,
  portfolioCurrentKey,
  portfolioPublicKey,
  routingKey,
  type PortfolioManifest,
  type RoutingPointer,
} from "./contract";
import { NOT_FOUND_KEY, resolvePath, routeOfKey } from "./paths";

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
  | "overlay-missing"
  | "overlay-refused"
  | "overlay-absent"
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
  /** package-relative key, or the full R2 key of an overlay object */
  key?: string;
  /**
   * which check refused this site's portfolio pointer / manifest (the request was answered 503
   * overlay-refused), or "absent": a shell package without a pointer (503 overlay-absent)
   */
  overlay?: string;
  error?: string;
}

const ALLOW = "GET, HEAD";
/** R2 refuses keys longer than 1024 bytes (it throws); such a path cannot name a package file, so it is a miss. */
const MAX_KEY_BYTES = 1024;
/** The request path is attacker-controlled: cap what one log line can carry. */
const MAX_LOGGED_PATH = 256;
const MAX_MANIFEST_BYTES = 4 * 1024 * 1024;
const MANIFEST_CACHE_MAX = 32;
/** The package file only a shell build writes (platform/portfolio-runtime/contract.ts RUNTIME_FILE). */
const SHELL_MARKER = "_runtime/portfolio/runtime.json";
const SHELL_CACHE_MAX = 256;
/** Header-safe media type (a manifest value is copied into Content-Type). */
const CONTENT_TYPE_RE = /^[\x20-\x7e]{1,255}$/;

function plain(status: number, text: string, extra: Record<string, string> = {}): Response {
  return new Response(text, {
    status,
    headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff", ...extra },
  });
}

/** Headers that replace the ones stored with the object. */
interface HeaderOverride {
  contentType?: string;
  cacheControl?: string;
}

function objectHeaders(obj: R2ObjectLike, over: HeaderOverride = {}): Headers {
  return new Headers({
    "Content-Type": over.contentType ?? obj.httpMetadata?.contentType ?? "application/octet-stream",
    "Cache-Control": over.cacheControl ?? obj.httpMetadata?.cacheControl ?? CACHE_REVALIDATE,
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

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const isPathList = (v: unknown): v is string[] => Array.isArray(v) && v.every((p) => typeof p === "string" && p.startsWith("/"));

async function sha256Hex(bytes: ArrayBuffer): Promise<string> {
  return [...new Uint8Array(await crypto.subtle.digest("SHA-256", bytes))].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/** Parsed manifests by R2 key + sha256 (oldest dropped first). A manifest never changes, so an entry cannot go stale. */
const manifestCache = new Map<string, PortfolioManifest>();

function parseManifest(bytes: ArrayBuffer): PortfolioManifest | undefined {
  try {
    const m = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes)) as unknown;
    if (!isRecord(m) || m.schema !== PORTFOLIO_MANIFEST_SCHEMA || !isRecord(m.shell) || !isRecord(m.routes) || !isRecord(m.assets)) return undefined;
    if (!isRecord(m.owned) || !isPathList(m.owned.exact) || !isPathList(m.owned.prefixes)) return undefined;
    return m as unknown as PortfolioManifest;
  } catch {
    return undefined;
  }
}

/**
 * The live portfolio manifest of the routed package; undefined when the site has none (no pointer:
 * trace.overlay stays unset) or when a pointer exists and it or its manifest does not verify
 * (trace.overlay says which check refused). Nothing is ever served from an unverified manifest, and
 * the caller answers a refusal with 503 — never with the package's pages.
 *
 * Exported for the publisher (platform/publish): before it points a hostname at a shell package it
 * asks this very function whether the Worker would use the overlay, with `cache: null` so the
 * manifest object is read and hashed again instead of being taken from memory.
 */
export async function loadOverlay(
  env: Pick<Env, "SITES">,
  pointer: Pick<RoutingPointer, "siteId" | "packageHash">,
  trace: Pick<Trace, "overlay">,
  cache: Map<string, PortfolioManifest> | null = manifestCache,
): Promise<PortfolioManifest | undefined> {
  const refuse = (why: string): undefined => void (trace.overlay = why);
  const currentObj = await env.SITES.get(portfolioCurrentKey(pointer.siteId, pointer.packageHash));
  if (!currentObj) return undefined;
  let current: unknown;
  try {
    current = JSON.parse(await currentObj.text());
  } catch {
    return refuse("current-unparsable");
  }
  if (!isRecord(current) || current.schema !== PORTFOLIO_CURRENT_SCHEMA) return refuse("current-schema");
  if (current.siteId !== pointer.siteId || current.shellPackageHash !== pointer.packageHash) return refuse("current-identity");
  const sha256 = current.manifestSha256;
  if (!isPortfolioKey(current.manifestKey) || typeof sha256 !== "string" || !HASH_RE.test(sha256)) return refuse("current-manifest-ref");
  const manifestKey = portfolioPublicKey(pointer.siteId, current.manifestKey);
  if (manifestKey.length > MAX_KEY_BYTES) return refuse("current-manifest-ref");

  const cacheKey = `${manifestKey}#${sha256}`;
  let manifest = cache?.get(cacheKey);
  if (!manifest) {
    const obj = await env.SITES.get(manifestKey);
    if (!obj) return refuse("manifest-missing");
    if (obj.size > MAX_MANIFEST_BYTES) {
      void obj.body.cancel();
      return refuse("manifest-too-large");
    }
    const bytes = await new Response(obj.body).arrayBuffer();
    if ((await sha256Hex(bytes)) !== sha256) return refuse("manifest-sha256");
    manifest = parseManifest(bytes);
    if (!manifest) return refuse("manifest-invalid");
    if (cache) {
      if (cache.size >= MANIFEST_CACHE_MAX) cache.delete(cache.keys().next().value!);
      cache.set(cacheKey, manifest);
    }
  }
  // Checked on every request, cached or not: the manifest must be this site's, for this package.
  if (manifest.siteId !== pointer.siteId || manifest.shell.packageHash !== pointer.packageHash) return refuse("manifest-identity");
  return manifest;
}

/** siteId/packageHash → "is a shell package" (oldest dropped first). A package never changes, so an entry cannot go stale. */
const shellCache = new Map<string, boolean>();

/**
 * Whether the routed package is a SHELL package: it carries the portfolio publisher's runtime
 * document, which only the shell build of an incrementally published site writes. One HEAD per
 * package per isolate; a store failure throws (the 500) and is not remembered.
 */
export async function packageIsShell(env: Pick<Env, "SITES">, pointer: Pick<RoutingPointer, "siteId" | "packageHash">, cache: Map<string, boolean> | null = shellCache): Promise<boolean> {
  const cacheKey = `${pointer.siteId}/${pointer.packageHash}`;
  const known = cache?.get(cacheKey);
  if (known !== undefined) return known;
  const shell = (await env.SITES.head(packageKey(pointer.siteId, pointer.packageHash, SHELL_MARKER))) !== null;
  if (cache) {
    if (cache.size >= SHELL_CACHE_MAX) cache.delete(cache.keys().next().value!);
    cache.set(cacheKey, shell);
  }
  return shell;
}

/** The entry a manifest table has for one of these spellings of the path; an entry with an unsafe key or content type is ignored. */
function entryOf(table: Record<string, unknown>, paths: string[], keyOf: (rel: string) => string): { key: string; contentType: string } | undefined {
  for (const path of paths) {
    const entry = Object.hasOwn(table, path) ? table[path] : undefined;
    if (!isRecord(entry) || !isPortfolioKey(entry.key) || typeof entry.contentType !== "string" || !CONTENT_TYPE_RE.test(entry.contentType)) continue;
    const key = keyOf(entry.key);
    if (key.length <= MAX_KEY_BYTES) return { key, contentType: entry.contentType };
  }
  return undefined;
}

/** RSC payloads Next exports for the page at `page`: <page>.txt (index.txt for "/") and __next.*.txt in the page's own directory. */
function isRscOf(page: string, path: string): boolean {
  if (!path.endsWith(".txt")) return false;
  if (path === (page === "/" ? "/index.txt" : `${page}.txt`)) return true;
  const dir = page === "/" ? "/" : `${page}/`;
  return path.startsWith(`${dir}__next.`) && !path.slice(dir.length).includes("/");
}

/** Owned URL space: the listed pages, everything under a listed prefix, and the RSC payloads of both. */
function isOwned(owned: PortfolioManifest["owned"], path: string): boolean {
  return owned.exact.some((p) => path === p || isRscOf(p, path)) || owned.prefixes.some((p) => path === p || path.startsWith(`${p}/`) || isRscOf(p, path));
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

  const pathname = new URL(request.url).pathname;
  const resolved = resolvePath(pathname);
  if (resolved.kind === "bad-request") return end("bad-path", plain(400, "bad request\n"));
  const key = (rel: string) => packageKey(pointer.siteId, pointer.packageHash, rel);
  /** the package file this request may be answered with */
  let packageFile = resolved.kind === "key" ? resolved.key : undefined;

  // Build output and publisher inputs are the package's alone: no overlay read for them — in any
  // spelling the resolver decodes to them (/%5Fnext/…, /%5Fruntime/…).
  const packageOnly = /^\/_(next|runtime)\//.test(pathname) || packageFile?.startsWith("_next/") === true || (resolved.kind === "not-found" && resolved.runtimeInput === true);
  // The verdict is taken from a fresh object, so a caller-supplied trace cannot pre-set or mask it.
  const verdict: Pick<Trace, "overlay"> = {};
  const manifest = packageOnly ? undefined : await loadOverlay(env, pointer, verdict);
  if (verdict.overlay !== undefined) {
    // A pointer exists but cannot be trusted: fail closed. The package is a shell — its portfolio pages are placeholders.
    trace.overlay = verdict.overlay;
    return end("overlay-refused", plain(503, "content unavailable\n"));
  }
  if (!manifest && !packageOnly && (await packageIsShell(env, pointer))) {
    // No pointer for a shell package: the same closed door. Its pages are placeholders (and link to placeholders) until a portfolio is published for it.
    trace.overlay = "absent";
    return end("overlay-absent", plain(503, "content unavailable\n"));
  }
  if (manifest) {
    // The path as requested, and as the package resolver reads it (percent-escapes decoded).
    const paths = packageFile === undefined || routeOfKey(packageFile) === pathname ? [pathname] : [pathname, routeOfKey(packageFile)];
    const route = entryOf(manifest.routes, paths, (rel) => portfolioPublicKey(pointer.siteId, rel));
    // The one way to an object under portfolio-assets/: its URL path is in the verified live manifest.
    const hit = route ?? entryOf(manifest.assets, paths, portfolioAssetKey);
    if (hit) {
      trace.key = hit.key;
      const obj = head ? await env.SITES.head(hit.key) : await env.SITES.get(hit.key);
      if (!obj) return end("overlay-missing", plain(503, "content unavailable\n"));
      const over = { contentType: hit.contentType, cacheControl: route ? CACHE_REVALIDATE : CACHE_IMMUTABLE };
      return respond(obj, "body" in obj ? (obj as R2ObjectBodyLike).body : null, 200, request, end, over);
    }
    // An owned URL is answered by the manifest or not at all: never the shell's own page or RSC payload.
    if (paths.some((p) => isOwned(manifest.owned, p))) packageFile = undefined;
  }

  if (packageFile !== undefined && new TextEncoder().encode(key(packageFile)).length <= MAX_KEY_BYTES) {
    trace.key = packageFile;
    if (head) {
      const meta = await env.SITES.head(key(packageFile));
      if (meta) return respond(meta, null, 200, request, end);
    } else {
      const obj = await env.SITES.get(key(packageFile));
      if (obj) return respond(obj, obj.body, 200, request, end);
    }
  }

  // Miss (or a path that is never served): the package's own 404 page, status 404.
  const notFound = head ? await env.SITES.head(key(NOT_FOUND_KEY)) : await env.SITES.get(key(NOT_FOUND_KEY));
  if (!notFound) return end("package-missing", plain(503, "package unavailable\n"));
  return respond(notFound, "body" in notFound ? (notFound as R2ObjectBodyLike).body : null, 404, request, end);
}

function respond(
  obj: R2ObjectLike,
  body: ReadableStream | null,
  status: 200 | 404,
  request: Request,
  end: (outcome: Outcome, response: Response) => Response,
  over?: HeaderOverride,
): Response {
  if (status === 404) {
    // An error page is never a cache/revalidation target.
    const headers = objectHeaders(obj, { cacheControl: "no-store" });
    headers.delete("ETag");
    return end("not-found", new Response(body, { status, headers }));
  }
  const headers = objectHeaders(obj, over);
  if (etagMatches(request.headers.get("If-None-Match"), obj.httpEtag)) {
    void body?.cancel();
    headers.delete("Content-Length");
    return end("not-modified", new Response(null, { status: 304, headers }));
  }
  return end("served", new Response(body, { status, headers }));
}

/** One structured line; failures and refused overlays always, other successes only on request (LOG_ALL). */
export function logTrace(env: Pick<Env, "LOG_ALL">, trace: Trace, sink: (line: string) => void = console.log): void {
  if ((trace.status ?? 500) < 400 && env.LOG_ALL !== "1" && trace.overlay === undefined) return;
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
