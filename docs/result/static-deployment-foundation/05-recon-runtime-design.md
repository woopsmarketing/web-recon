# 05 — `recon-runtime` Worker Design

Design and operating notes for the Worker. `03-static-delivery-contract.md` is the **normative
contract** (status code table, cache-control values, MIME table, pointer/seal schema); this
document does not repeat those tables and never contradicts it. `_session1/03-runtime-contract.md`
is **superseded history** — the first version of this code, written before the contract doc was
split out; where it conflicts with anything here, the code below is current.

## 1. Purpose & what it is NOT

A thin static-serving Worker: `host → pointer → packageHash → path → object key → R2 GET →
response`, bytes and headers returned unchanged (`workers/recon-runtime/src/index.ts:1-14`).

It is **not**: a router with fallbacks, a template renderer, an SSR/ISR runtime, a proxy to
another origin, a rewriter of response bodies, or anything that injects tags (no canonical/SEO
generation — served bytes equal built bytes, always). GET/HEAD only; no secrets, no KV, no D1, no
external fetch (`_session1/03-runtime-contract.md:94-100`, unchanged since; confirmed against the
current code — `Env` declares only `SITES` and `LOG_ALL`, `index.ts:50-54`).

## 2. Request flow

```
GET/HEAD https://<host>/<path>
  → requestHost(url)                         lowercase, trailing FQDN dot dropped     (:121-123)
  → HOSTNAME_RE test                          fail → 404 unknown-host                 (:141)
  → R2 GET routing/<host>.json                 miss → 404 unknown-host                (:143-144)
  → parsePointer(text, host)                   invalid → 500 pointer-invalid          (:145-146)
  → resolvePath(pathname)                      bad → 400 bad-path                     (:150-151, paths.ts)
  → R2 GET/HEAD sites/<siteId>/packages/<packageHash>/<key>
       hit  → respond 200 (or 304 on If-None-Match)                                   (:154-163)
       miss → R2 GET/HEAD …/404.html            miss too → 503 package-missing        (:165-167)
                                                 hit → 404 with 404.html bytes         (:168, 171-177)
  → logTrace() for status ≥ 400 (or always, LOG_ALL)                                  (:205, 188-191)
```
(`index.ts:130-169` = `handle()`; `:193-208` = the exported `fetch` wrapping it in try/catch,
error path `:197-204`)

## 3. Host resolution

Exact hostname → `routing/<host>.json`, one file per host (`contract.ts:41-43`
`routingKey(hostname)`). Multi-site is by construction: any number of hostnames can each carry
their own pointer object, no code change needed to add one. **No wildcard matching** —
`HOSTNAME_RE` (`contract.ts:30`) validates the request host as a literal DNS name, and the R2 key
built from it is exact; there is no prefix/suffix scan. Nothing is hardcoded: no siteId, no
hostname, and no default site appear anywhere in `index.ts` or `wrangler.jsonc` — the pointer
object is the only source of the host → site mapping. `requestHost()` (`:121-123`) lowercases the
host and strips exactly one trailing `.` (FQDN form); it does not strip a port (a `Host` header
with a port fails `HOSTNAME_RE`, since that regex has no `:` in its character class, `contract.ts:30`).

## 4. Pointer validation

`parsePointer()` (`:110-118`) accepts the pointer only if all of: JSON parses, `schemaVersion ===
1`, `hostname === host` (the pointer must name the exact host that was requested — a pointer
copied to the wrong key is rejected, not silently served), `SITE_ID_RE.test(siteId)`,
`HASH_RE.test(packageHash)`. Anything else → `undefined` → 500 `pointer-invalid` (`:146`). The
Worker does **not** validate `buildInputId`, `releaseId`, `publishedAt`, or `previous` — those
fields are carried for provenance/rollback and are not needed to resolve a request. The runtime
never re-checks the package's seal (`contract.ts:9-11`; no reference to `sealKey`/`SEAL_NAME`
anywhere in `index.ts`) — the publisher's guarantee ("no pointer without a verified seal",
`04-site-publish-design.md` §3 step 8) is trusted, not re-verified per request.

## 5. Path resolver (`paths.ts:29-59`)

| Request path | Result | Rule |
|---|---|---|
| `/` | `index.html` | `:32` |
| `/about`, `/portfolio/<slug>` (no extension) | `<path>.html` | `:58` |
| `/<anything>.<ext>`, ext ≠ `html` | exactly that key | `:54` |
| `*.html` spelled out (`/about.html`, `/index.html`, `/404.html`, `/_not-found.html`) | not-found | `:52` |
| `/404`, `/_not-found`, `…/index` | not-found (framework pages, not site routes) | `:56-57` |
| `/about/` (trailing slash, not root) | not-found | `:33` |
| `/_package.json` | not-found (seal is reserved) | `:53` |
| no leading `/`; `%2F`/`%5C` anywhere; literal `\`; empty/`.`/`..` segment; control char/NUL; bad percent-encoding | 400 bad-request | `:30-31, 41, 43-44` |

**Security properties**

- **Single decode**: each path segment is `decodeURIComponent`-ed exactly once (`:38-39`), so
  `%252e%252e` resolves to the literal 8-character name `%2e%2e`, never to `..` — no
  double-decode traversal is possible.
- **Flat keys**: R2 has no directory semantics; every key is an opaque string built by
  `packageKey()`/`sealKey()`/`routingKey()` (`contract.ts:32-43`). There is no filesystem-style
  path join in the Worker.
- **Prefix confinement**: the Worker builds every object key through
  `key = (rel) => packageKey(pointer.siteId, pointer.packageHash, rel)` (`index.ts:152`) —
  `rel` comes only from `resolvePath()`'s validated output, so no request can ever address a key
  outside `sites/<pointer.siteId>/packages/<pointer.packageHash>/`, regardless of path content.
- **Corrected from the prior round**: a literal backslash never reaches `resolvePath()` from a
  real `Request`, because WHATWG URL parsing rewrites `\` to `/` in the pathname of an http(s) URL
  before the Worker sees it (verified: `new URL("https://x/a\\b").pathname === "/a/b"`); the
  `pathname.includes("\\")` branch (`paths.ts:31`) is defence for direct callers of `resolvePath()`
  (e.g. tests), not a path a browser or fetch client can trigger.

## 6. HTTP semantics

| Case | Status | Headers | Body | Source |
|---|---|---|---|---|
| hit | 200 | `Content-Type`, `Cache-Control` (both stored at publish), `ETag` (R2 `httpEtag`), `Content-Length`, `X-Content-Type-Options: nosniff` | stored bytes, unchanged | `objectHeaders()` `:93-101`, `respond()` `:178, 184` |
| `If-None-Match` matches | 304 | same minus `Content-Length` | none | `etagMatches()` `:104-108`, `respond()` `:179-183` |
| HEAD | 200/404, same headers as GET | `Content-Length` from R2 `head()` size | none | `:156-158` (hit), `:166` (miss) — `head` uses `env.SITES.head`, no body ever read |
| miss, `404.html` present | 404 | `404.html`'s content-type, `Cache-Control: no-store`, **no `ETag`** | package `404.html` | `respond()` `:171-177` |
| miss, `404.html` also missing | 503 | `text/plain`, `no-store` | `package unavailable\n` | `:167` |
| unknown host | 404 | `text/plain`, `no-store` | `unknown host\n` | `:141, 144` |
| other method | 405 | `Allow: GET, HEAD` | `method not allowed\n` | `:139`, `ALLOW` `:80` |
| bad path | 400 | `text/plain`, `no-store` | `bad request\n` | `:151` |
| pointer invalid / R2 or unexpected error | 500 | `text/plain`, `no-store` | fixed text, no details leaked | `:146`, `:197-204` |

`X-Content-Type-Options: nosniff` is on **every** response, including plain-text errors
(`plain()` `:86-91`, `objectHeaders()` `:99`). A 404 response strips `ETag` (`:175`) so it is never
treated as a revalidation target.

## 7. MIME source

Decided once, at **publish time**, from `platform/publish/media.ts`'s fixed extension table, and
stored as the R2 object's `httpMetadata.contentType`. The Worker only reads it back
(`objectHeaders()` `:95`: `obj.httpMetadata?.contentType ?? "application/octet-stream"`) — it has
no extension→MIME table of its own and makes no sniffing decision.

## 8. Cache model

| Category | `Cache-Control` | Why |
|---|---|---|
| `_next/static/**` | `public, max-age=31536000, immutable` | framework build output |
| content-addressed (`media.ts` `cachePolicyFor`) | `public, max-age=31536000, immutable` | filename stem is a verified prefix of the file's own sha256 |
| everything else (HTML, RSC `.txt`, `robots.txt`, `sitemap.xml`) | `public, max-age=0, must-revalidate` | may change on the next publish; `ETag` makes revalidation a 304 |
| error responses | `no-store`, no `ETag` | never cached |

**No Cache API.** The Worker reads R2 on every request (`index.ts` header `:10-14`), so a publish
or rollback is visible on the next request with no purge step. If a cache is added later, its key
**must** include `packageHash` and the resolved object key — hostname + pathname alone would
serve stale or cross-package bytes across a publish, and is explicitly forbidden by the shared
contract (`03-static-delivery-contract.md` §7).

## 9. Real 404 and the 503 decision

An unknown route or a path the resolver marks not-found is answered with the package's own
`404.html`, status 404, `no-store`, no `ETag` — never a 200, never the homepage, never a redirect
(`index.ts:165-168, 171-177`). Every published package is required to contain `404.html` (enforced
at publish time, `04-site-publish-design.md` §3 step 1), so if a request for `404.html` **itself**
misses, that means the package the pointer names is not actually present in the bucket — a server
fault, not a content gap. That case is answered 503 `package unavailable` (`:167`) rather than 404,
so crawlers and monitors do not read it as "page gone" when it is really "package gone".

## 10. Error behaviour

| Condition | Status | Outcome | Source |
|---|---|---|---|
| unknown hostname (fails `HOSTNAME_RE`) | 404 | `unknown-host` | `:141` |
| pointer missing (no object at `routing/<host>.json`) | 404 | `unknown-host` (same as unknown hostname — a host with no pointer is indistinguishable from a host that was never onboarded) | `:143-144` |
| pointer malformed (bad JSON / schema / wrong `hostname` field) | 500 | `pointer-invalid` | `:145-146` |
| package missing (object AND `404.html` both absent under the pointer's prefix) | 503 | `package-missing` | `:166-167` |
| object missing, package present (`404.html` exists) | 404 | `not-found` | `:168, 171-177` |
| R2 error (`get`/`head` throws) | 500 | `internal-error` | outer try/catch, `:197-204` |
| invalid path (resolver `bad-request`) | 400 | `bad-path` | `:151` |

## 11. Observability

One structured JSON line per response with status ≥ 400; every response when the Worker variable
`LOG_ALL` is `"1"` (`logTrace()` `:188-191`, called from the exported `fetch` at `:205`). Fields,
all from `Trace` (`:67-78`): `evt` (constant `"recon-runtime"`), `host`, `path` (pathname only —
query string is never captured, `newTrace()` `:125-128` uses `url.pathname`), `method`, `status`,
`outcome`, `siteId`, `packageHash`, `key` (only set on an attempted object fetch, `:155`), `error`
(internal errors only, truncated to 200 chars, `:202`). **Never logged**: request/response
headers, query strings, bodies, cookies, IP.

## 12. Config as code (`workers/recon-runtime/wrangler.jsonc`)

| Key | Value | Note |
|---|---|---|
| `name` | `recon-runtime` (`:10`) | top-level (no `--env`) build |
| `main` | `src/index.ts` (`:11`) | module syntax |
| `compatibility_date` | `2026-09-15` (`:12`) | — |
| `workers_dev` / `preview_urls` | `false` / `false`, both top-level (`:13-14`) and in `env.pilot` (`:24-25`) | deploying the default config exposes nothing publicly |
| `observability.enabled` | `true` (`:15`) | Cloudflare Workers Logs |
| `r2_buckets` | `SITES` → `boost-sites-artifacts` (`:18-20`), repeated identically in `env.pilot` (`:26-28`) | one binding name, one bucket |
| `env.pilot` | `name: recon-runtime-pilot` (`:23`); hostname attachment **commented out**, documenting two forms: (a) Workers Custom Domain (`:34`), (b) an exact route `<pilot-hostname>/*` + `zone_name` with a hand-made proxied DNS record (`:40`) — needed when an existing route in the zone (e.g. another product's wildcard) already matches the hostname, because a Custom Domain Worker is treated as an origin and that route's Worker would run first | the only place a real hostname is attached, and it is inert until uncommented |
| secrets / `vars` | none present | `LOG_ALL` is documented as something to *add* under an environment (`:16-17`), not something the file currently sets |

## 13. Neutrality

Any safe static file in a package is served as an ordinary file with its stored MIME type — e.g. a
future JSON file at any path is just another key under the package prefix, subject to the same
extension table (`media.ts`) and the same resolver rule ("has an extension → exact key", `paths.ts
:54`). The resolver reserves exactly two things: the literal `.html` suffix (served only at its
extensionless route, `:52`) and the seal filename `_package.json` (`:53`). Nothing else is special
— the Worker has no notion of what any file *means*.

## 14. Known limits / deferred

- No `Range` support — a package containing video gets a publish-time warning, not a runtime
  feature (`04-site-publish-design.md` §3 step 4); Safari/iOS will not play such video.
- No redirects of any kind — no trailing-slash normalization, no `.html`→extensionless
  redirect, no http→https.
- **Version skew after a publish**: the pointer switch is not coordinated with clients that
  already loaded the previous package. A client requesting a path scoped to the *old* package
  (e.g. an old `_next/static/<old-buildId>/…` chunk) is resolved against the *current* pointer's
  packageHash after a publish, not the one it originally loaded, and gets the new package's 404
  page if that path does not exist there.
- Two R2 reads on a **hit** (pointer `:143`, object `:157`/`:160`); **three** on any miss (pointer
  + missed object + `404.html` `:166`) — refines the "two R2 reads" figure used elsewhere in this
  project's docs, which describes the common (hit) case only.
- The seal is not checked per request — only at publish time (§4). A bucket edited by hand outside
  the publisher (never expected in normal operation) would be served as-is.
- The Worker **trusts the request hostname** to select the site; there is no independent identity
  check. This is bounded by keeping entry points limited — `workers_dev` and `preview_urls` are
  off (§12), so the only path in is a hostname an operator explicitly attached.
- No CSP, HSTS or frame headers are set; the runtime adds only `X-Content-Type-Options: nosniff`.
  SVG is served same-origin, from the site's own package (no cross-origin embedding surface added
  by the runtime itself).
- A validation failure during a dry run (`site:publish --dry-run`) stops at the **first** failure
  — `planPublish` throws on the first check that fails rather than collecting every issue
  (`04-site-publish-design.md` §3).
