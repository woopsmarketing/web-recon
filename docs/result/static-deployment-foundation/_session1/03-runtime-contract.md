# 03 — Runtime contract (`recon-runtime` Worker)

Status: implemented and verified locally (`wrangler dev --local` over the state that `site:publish --local` wrote). Not deployed.

| Piece | File |
|---|---|
| Worker (fetch handler, headers, 304/HEAD/405, 404 page) | `workers/recon-runtime/src/index.ts` |
| Path → key mapper | `workers/recon-runtime/src/paths.ts` |
| Shared contract (keys, pointer/seal types, cache constants) | `workers/recon-runtime/src/contract.ts` |
| Config (source of truth) | `workers/recon-runtime/wrangler.jsonc` |
| Local dev | `pnpm runtime:dev` (= `wrangler dev -c workers/recon-runtime/wrangler.jsonc --local --persist-to tmp/recon-runtime-state`) |

The Worker has no dependencies. It bundles to 6.09 KiB (2.24 KiB gzip) and declares its own minimal R2 types.

## Config (`wrangler.jsonc`)

| Key | Value |
|---|---|
| `name` | `recon-runtime` (pilot env: `recon-runtime-pilot`) |
| `main` | `src/index.ts` (module syntax) |
| `compatibility_date` | `2026-09-15` |
| `r2_buckets` | `SITES` → `recon-sites` |
| `workers_dev` / `preview_urls` | `false` / `false` |
| routes / custom domains | **none**. `env.pilot` has the exact-hostname Custom Domain **commented out**. |

## Request flow

```
GET/HEAD https://<host>/<path>
  → R2 GET routing/<host>.json            (missing → 404 "unknown host", plain text; never another site)
  → validate pointer (schemaVersion 1, hostname = host, siteId/packageHash format; else 500)
  → resolvePath(<path>)                    (bad → 400; not-found → 404 page)
  → R2 GET/HEAD sites/<siteId>/packages/<packageHash>/<key>
       hit  → 200 (or 304) with stored headers, body streamed unchanged
       miss → sites/…/<packageHash>/404.html with status 404
```

## Path → key mapping

Derived from the real package (156 files; checked on 1.5.0 and 1.5.1) and from URLs the Next 16 client actually requested in Chromium during load, prefetch, and client navigation.

| Request path | Key (under the package prefix) | Evidence |
|---|---|---|
| `/` | `index.html` | links `href="/"` |
| `/about`, `/contact`, `/portfolio`, `/3d-portfolio` | `<route>.html` | template links are extensionless (`href="/portfolio"`) |
| `/portfolio/<slug>` | `portfolio/<slug>.html` | detail links |
| `/<route>/__next._tree.txt?_rsc=…` | exact file (query ignored) | observed prefetch, headers `rsc: 1`, `next-router-prefetch: 1`, `next-router-segment-prefetch: /_tree` |
| `/__next._index.txt`, `/__next.__PAGE__.txt` | exact file | observed prefetch (`/_index`, `/__PAGE__`) |
| `/<route>/__next.<route>.__PAGE__.txt` | exact file | observed |
| `/portfolio/<slug>/__next.portfolio.$d$slug.__PAGE__.txt` | exact file. Literal `$` and `%24` both work (one percent-decode per segment). | observed with literal `$` |
| `/<route>.txt`, `/<route>/__next._full.txt` | exact file | in the export; not observed in this run but served |
| `/_next/static/**`, `/assets/*`, `/robots.txt`, `/sitemap.xml` | exact file | HTML/CSS references |
| Extensionless page URLs fetched with `Accept: */*` (Next HTML prefetch) | `<route>.html` | observed. Some are cancelled by the client (`ERR_ABORTED`); each such URL is served 200. |

**Deliberately 404** (answered with the package's `404.html`):

| Path | Why |
|---|---|
| any `*.html` spelled out: `/index.html`, `/about.html`, `/404.html`, `/_not-found.html` | one URL per page. The template never links `.html`. |
| `/404`, `/_not-found` (extensionless), `…/index` | framework pages, not routes of the site |
| trailing slash `/about/` | export uses `trailingSlash: false`, and the runtime never redirects |
| `/_package.json` | the seal is not a site file |
| anything not in the package | normal miss |

**400**: `%2F` / `%5C` / literal `\`, malformed percent-escapes, empty / `.` / `..` segments, control characters. WHATWG URL parsing already collapses `/../`, and `%2e%2e` decoded to `..` is rejected as well.

Direct access to `_not-found.html` is impossible by design. The file is still uploaded, and its R2 bytes are verified in the e2e.

## Methods, statuses, headers

| Case | Status | Headers | Body |
|---|---|---|---|
| hit | 200 | `Content-Type`, `Cache-Control` (both stored at publish), `ETag` (R2 `httpEtag`), `Content-Length`, `X-Content-Type-Options: nosniff` | stored bytes, unchanged |
| `If-None-Match` matches (strong, `W/`, list, `*`) | 304 | same, minus `Content-Length` | none |
| HEAD | 200 / 404 | same as GET (`Content-Length` = object size) | none |
| miss | 404 | `404.html`'s content-type, `Cache-Control: no-store`, **no ETag**, nosniff | package `404.html` |
| unknown host | 404 | `text/plain`, `no-store` | `unknown host` |
| POST/PUT/DELETE/PATCH/OPTIONS | 405 | `Allow: GET, HEAD` | `method not allowed` |
| bad path | 400 | `text/plain`, `no-store` | `bad request` |
| invalid pointer / R2 error | 500 | `text/plain`, `no-store` | fixed text; no details leak |

Under `wrangler dev`, `text/html` responses arrive chunked, without `Content-Length`, because of the dev proxy. Their bytes are identical, and HEAD carries the length.

## Cache policy (decided at publish, stored per object)

| Files | Cache-Control | Why |
|---|---|---|
| `_next/static/**` (17) | `public, max-age=31536000, immutable` | Next build/content-hashed output |
| `assets/<hex>.<ext>` whose name is a prefix of its own sha256 (52, checked per file) | `public, max-age=31536000, immutable` | content-addressed by the platform (`sha256[0:20]`) |
| HTML (15), RSC `*.txt` (70), `robots.txt`, `sitemap.xml` (87 total) | `public, max-age=0, must-revalidate` | may change on the next publish; ETag makes revalidation a 304 |

**No Cache API.** Every request does 2 R2 reads, so a publish or rollback is visible on the next request with no purge step. Browsers already cache the 69 immutable files for a year and revalidate the rest cheaply. Old bytes can never change, because `packageHash` namespaces them.

## What it never does

- Redirects (no trailing-slash or `.html` normalization, no http→https).
- Falls back to another site or a default site for an unknown host.
- Rewrites, injects into, or compresses bodies itself. No canonical tags, no HTMLRewriter.
- Serves anything outside `sites/<siteId>/packages/<packageHash>/` for the pointer's site.
- Accepts writes (GET/HEAD only). Uses no secrets, KV, D1, or external fetches.

## Local test results

`pnpm test:publish` (unit, no wrangler): **27 passed / 0 failed**. It covers the mapper (15 key, 11 not-found, 11 bad-request paths), cache policy, publish ordering and failures, rollback, the expected-package guard, the handler over a fake R2 bucket (every file byte-identical, 404, HEAD, 304 ×4 variants, 405 ×5, 400, unknown host, corrupt pointer → 500), and package byte identity.

`pnpm test:publish:e2e` (final fresh run; wrangler `--local` + `wrangler dev` + Playwright Chromium): **25 passed / 0 failed**. Evidence: `proof/local-e2e.json`.

Package under test: `boost-interior-demo` current = `aa71b829…` (release `interior-01-1.5.1-6bbdd07eb9bf`), packageHash `613cd9e0…`, 156 files, 7,283,710 B. Development ran against the 1.5.0 package `6c74d34c…` / `c28ad013…`, which passed the same suites. The other agent's 1.5.1 build replaced it mid-way.

| Check | Result |
|---|---|
| fresh publish via wrangler | uploaded 156, verified 156, sealed, pointer written (216 s, serial) |
| republish | `skipped-sealed`, 0 uploads, pointer `unchanged` (1.5 s) |
| byte equality over HTTP | **154/154** addressable files identical (7,250,640 B), each with the stored content-type and cache-control, an ETag, and nosniff. `404.html` checked as the 404 body; `_not-found.html` checked in R2. |
| 404 page | `/no-such-page`, `/about.html`, `/index.html`, `/about/`, `/_package.json`, `/portfolio/no-such-project` → 404 + exact `404.html` bytes |
| HEAD / 304 / 405 | HEAD `/` and a `_next/static` JS file correct; 304 on `/`, JS, `/portfolio`; POST/PUT/DELETE → 405 `Allow: GET, HEAD` |
| host / traversal | unknown Host → 404 `unknown host`; `127.0.0.1` (no pointer) → 404; `..%2f`, `%5c`, bad escape → 400; raw `/../build-record.json` → never leaks |
| `$` vs `%24` | same object |
| pages × widths | 7 routes × {390, 1440}: all expected status (6×200, unknown 404), **broken requests 0, console errors 0, external requests 0, horizontal overflow 0 px, broken images 0** |
| client-cancelled prefetches | 8 distinct URLs, all same-origin page routes that the runtime serves 200 (Next cancels link prefetches when links leave the viewport) |
| client navigation | `/` → `/portfolio` → detail → `/about` → back: **1 document request** (the initial load only), **21 RSC `.txt` fetches, all 200 `text/plain`**, each page's `<title>` matches the build record, 0 console errors |
| package identity | `data/site-builds/…/aa71b829…/` tree hash `d4930a55…` (157 files) identical before and after |

External requests: **none**, and none are expected. The package's absolute URLs are the site's own `publicOrigin` in `robots.txt` / `sitemap.xml`, which are never fetched.
