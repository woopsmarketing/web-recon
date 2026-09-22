# 03 — Static Delivery Contract (v1)

Scope: how a finished web-recon **Site Build Package** becomes bytes a visitor receives. It applies to any web-recon site. It defines no data semantics for any file inside a package: every package file is an opaque static file.

Code that implements it:

| Part | Where |
|---|---|
| shared constants, key layout, pointer / seal types | `workers/recon-runtime/src/contract.ts` |
| publisher | `platform/publish/{publish,media,store,wrangler-store}.ts`, `platform/cli/site-publish.ts` |
| runtime | `workers/recon-runtime/src/{index,paths}.ts`, `workers/recon-runtime/wrangler.jsonc` |

```
site:build ─► data/site-builds/<siteId>/packages/<buildInputId>/{build-record.json, site/**}
site:publish ─► R2  sites/<siteId>/packages/<packageHash>/**      (immutable)
                    sites/<siteId>/packages/<packageHash>/_package.json   (seal, last file of a package)
                    routing/<hostname>.json                        (mutable pointer, written LAST)
recon-runtime ─► host → pointer → packageHash → path → object key → R2 GET → response
```

At request time there is no database, no source capture, no template rendering, no SSR/ISR, and no fetch to any other origin.

## 1. Publication input

The input is the site's **current** package, found through `data/site-builds/<siteId>/current.json`. Only `site/**` is published. `build-record.json` is read and never uploaded.

`current.json`, `previous.json` and `history.jsonl` are **local build metadata**. They are never uploaded and the runtime never sees them. Live truth is the routing pointer alone (§3).

A package is publishable only if every row holds. Each row fails closed, before any store access:

| Check | Source |
|---|---|
| `current.json` matches its schema and `packageDir` is exactly `data/site-builds/<siteId>/packages/<buildInputId>` | `publish.ts` `planPublish` |
| `build-record.json`: `schemaVersion 1`, `status "success"`, `qa.pass true`, `siteId` and `buildInputId` equal to the request and to `current.json` | `PublishableRecordSchema` |
| the platform's own `packageIntact` re-computes `packageHash` from the files, once before and once after the inventory | `platform/build/site-build.ts` |
| inventory file count and bytes equal `qa.files` / `qa.bytes` | `planPublish` |
| every entry is a regular file with an extension in the MIME table (§6) | `media.ts` |
| the package has `index.html` and `404.html`, and no root file named `_package.json` | `planPublish` |
| optional `--expect-package <packageHash>`: the current package is the reviewed one | `planPublish` |
| `--remote` only: the origin baked into the package (robots.txt `Sitemap:` line, which is also the canonical and sitemap origin) is `https://<hostname>`. Override: `--allow-origin-mismatch`. For non-remote targets a mismatch is a warning. | `planPublish` |

## 2. Artifact identity

**`packageHash`** is the artifact identity. It is `build-record.json#packageHash`, a sha256 over the relative path and bytes of every file under `site/`, computed by the builder. Two packages with the same `packageHash` have the same bytes.

`buildInputId` identifies build *inputs* (release hash, site snapshot hash, mode, toolchain hash). It is not a hash of output bytes, so it is not a storage key. It is carried in the seal and the pointer for traceability only.

| Object | Key | Mutability |
|---|---|---|
| package file | `sites/<siteId>/packages/<packageHash>/<path under site/>` | immutable |
| seal | `sites/<siteId>/packages/<packageHash>/_package.json` | immutable, written after every file is uploaded and read back |
| pointer | `routing/<hostname>.json` | mutable (the only mutable object) |

Rules:

- A **sealed** prefix is never written again. An identical seal means skip all uploads. A seal with different content means refuse. Before a sealed package is activated, `index.html` and `404.html` are read back and compared with the seal (`--reverify` reads back every object).
- An **unsealed** prefix is an interrupted upload. Every file is uploaded again (same `packageHash`, so same bytes), read back and compared by sha256 and size. The seal is refused unless uploaded = verified = file count.
- One sealed package may be pointed at by any number of hostnames.
- Publish and rollback never delete an object.
- The seal is never served (§4). The publisher enforces "no pointer without a verified seal". The runtime does not re-check the seal per request.

## 3. Pointer identity

`routing/<hostname>.json`, schema version 1:

```json
{
  "schemaVersion": 1,
  "hostname": "<lowercase DNS name, no port, no trailing dot>",
  "siteId": "<site id>",
  "packageHash": "<64 hex>",
  "buildInputId": "<64 hex>",
  "releaseId": "<template release id>",
  "publishedAt": "<ISO time of the pointer write>",
  "previous": { "siteId": "…", "packageHash": "…", "buildInputId": "…", "releaseId": "…", "publishedAt": "…" }
}
```

- The runtime needs `schemaVersion`, `hostname`, `siteId` and `packageHash`, and validates exactly those: version is 1, `hostname` equals the request host, `siteId` and `packageHash` match their patterns. Anything else is a **500**, never a guess.
- The publisher validates the whole document (zod) before it overwrites a pointer. It refuses to overwrite one it cannot parse.
- `previous` is what the hostname served before this write. It is one step of rollback memory, not a history service.
- The pointer is written **last**, then read back and compared byte for byte. If the write happened but the read-back failed, the error says the pointer may have moved.
- Guards before the write:

| Guard | Refuses when |
|---|---|
| site change | the hostname serves another `siteId` and `--allow-site-change` is absent |
| `--expect-live <packageHash\|none>` | the pointer does not name exactly that package. This is the stale-write guard. |
| immutable-path stability | a path both packages serve with the one-year immutable policy has different bytes in the package the hostname serves now. It also refuses when the live package's seal is missing or unreadable, because nothing can be compared (fails closed; recovery is to inspect that seal, or delete the pointer and publish again). Rollback has no check of its own: it only returns to `previous`, the pair the forward publish already compared. |
| pointer ownership | the object stored under `routing/<hostname>.json` names another hostname, or is not a valid pointer |

- **Concurrency.** One operator per hostname is assumed. The pointer update is read, then write; it is not atomic, because `wrangler r2 object put` has no conditional put. The pointer is read only after all uploads, so the window is one read and one write. `--expect-live` is checked twice, before any upload and again just before the write, and catches an operator acting on a state someone else has replaced. Two publishers that interleave inside that window are **not** detected: the last writer wins, `previous` may then name a package that was never live, and the site-change guard can be passed by the loser. The upgrade path is a conditional put (R2 `onlyIf` / S3 `If-Match`) behind the same `ObjectStore` interface.
- **Seam.** The runtime depends only on the mapping hostname → `{siteId, packageHash}`. A future publication log or database can become the writer of that mapping without changing packages, keys or the resolver.

## 4. Path resolution

One resolver, `resolvePath(pathname)` in `paths.ts`, derived from the real Next static export (`trailingSlash: false`; pages are flat `<route>.html` files; a directory with the same name holds RSC `.txt` sidecars and never an `index.html`).

| Request path | Result |
|---|---|
| `/` | `index.html` |
| `/about`, `/portfolio`, `/portfolio/<slug>` (no extension) | `<path>.html` |
| `/<anything>.<ext>`, ext ≠ `html` | exactly that file: `_next/static/**`, `assets/*`, RSC `*.txt` (including `$` names), `robots.txt`, `sitemap.xml`, any other static file |
| `/about.html`, `/index.html`, `/404.html`, `/_not-found.html` | not found (one URL per page) |
| `/404`, `/_not-found`, `…/index` | not found (framework pages, not routes) |
| `/about/` (trailing slash, not root) | not found (no redirects) |
| `/_package.json` | not found (the seal is not a site file) |
| no leading `/`; `%2F` or `%5C` anywhere; a literal `\`; an empty, `.` or `..` segment; a control character or NUL; malformed percent-encoding | **400** |
| a path whose object key would be longer than R2's 1024-byte key limit | not found (R2 is not asked) |

Each segment is percent-decoded **exactly once**. `%252e%252e` therefore resolves to the literal name `%2e%2e`, not `..`. R2 keys are flat strings and every key the runtime builds starts with `sites/<siteId>/packages/<packageHash>/`, so no request can address another package, another site, a seal or a pointer. The query string is ignored.

Path restrictions a package must respect: every file needs an extension from §6; a root file named `_package.json` is refused; a file `x.html` is reachable only as `/x`.

## 5. HTTP status

| Situation | Status | Body | Outcome in logs |
|---|---|---|---|
| object found | 200 | object bytes, unchanged | `served` |
| `If-None-Match` matches (weak comparison) | 304 | empty | `not-modified` |
| method other than GET / HEAD | 405, `Allow: GET, HEAD` | plain text | `method-not-allowed` |
| path rejected by the resolver | 400 | plain text | `bad-path` |
| object missing, or a path that is never served | **404** | the package's own `404.html` | `not-found` |
| object missing **and** `404.html` missing | **503** | plain text | `package-missing` |
| host invalid, or no pointer for the host | 404 | plain text `unknown host` | `unknown-host` |
| pointer unparsable, schema-invalid, or naming another hostname | 500 | plain text | `pointer-invalid` |
| R2 or any unexpected error | 500 | plain text | `internal-error` |

HEAD returns the same status and headers as GET with no body (R2 `head`). No response is ever a redirect. No failure serves another site's content or falls through to another Worker.

Every published package contains `404.html` (§1), so a missing `404.html` means the package the pointer names is not in the bucket. That is a server fault and is answered 503, so crawlers do not read it as "page gone".

## 6. MIME

The content type is decided at **publish time** from a fixed extension table (`media.ts`), stored as R2 `httpMetadata.contentType`, and returned as stored. An unknown extension fails the publish. If an object has no stored type, the runtime sends `application/octet-stream`. Every response carries `X-Content-Type-Options: nosniff`.

`html` `txt` `js` `mjs` `css` `json` `map` `xml` `webmanifest` `svg` `jpg` `jpeg` `png` `gif` `webp` `avif` `ico` `woff` `woff2` `mp4` `webm`. Text types carry `charset=utf-8`.

Known limit: the runtime does not answer `Range`. A package that contains video gets a publish warning (Safari/iOS need byte ranges).

## 7. Caching

| Category | Rule | `Cache-Control` |
|---|---|---|
| `_next/static/**` | framework build output | `public, max-age=31536000, immutable` |
| content-addressed file | the file-name stem (≥16 hex) is a prefix of the file's own sha256, verified per file | `public, max-age=31536000, immutable` |
| everything else: HTML, RSC `.txt`, `robots.txt`, `sitemap.xml`, unhashed files | stable URL whose content changes with the package | `public, max-age=0, must-revalidate` + `ETag` → 304 |
| 404 responses, all plain-text errors | | `no-store`, no `ETag` |
| routing pointer, seal | never served; stored `no-store` | n/a |

- The policy is stored with the object at publish time and returned as stored.
- `ETag` is R2's `httpEtag`.
- The runtime does **not** use the Cache API. It reads the pointer and the object from R2 on every request, so a publish or rollback is live on the next request and no purge exists. If an edge cache is added later, its key must contain `packageHash` and the resolved object key; hostname + pathname alone is forbidden.
- An immutable URL must never change bytes across packages of one hostname. The publisher checks this against the live package before it moves the pointer (§3).

## 8. Real 404

An unknown route returns status **404** with the package's `404.html` bytes, `Cache-Control: no-store`, no `ETag`. It is never a 200, never the homepage, never a redirect.

## 9. Rollback

Rollback is a pointer swap to a package that is already sealed in the bucket: `site:publish --rollback` re-points `routing/<hostname>.json` at `previous`. Nothing is uploaded, rebuilt or deleted. The package being left becomes the new `previous`, so a second rollback rolls forward. It is refused when there is no `previous`, when the pointer or `previous` belongs to another site, when the target's seal is missing or invalid, or when `--expect-live` does not match.

## 10. Failure behaviour

Publisher order: **validate → upload → verify → seal → pointer**. Any failure before the pointer write leaves the pointer byte-identical, so the old publication stays live. A failed pointer write leaves the old pointer in place. `--no-activate` stops after the seal.

`--dry-run` makes no store access at all, and its output has no clock value or machine path. `--dry-run --check-store` also reads the seal and the pointer through a store that cannot write, and reports what would be skipped or uploaded and every refusal the real run would raise.

Every `--remote` run that reaches the bucket, reads included, is refused unless `RECON_PUBLISH_ALLOW_REMOTE=1`. Only `--remote --dry-run` without `--check-store` runs without it, because it is fully offline. Credentials are wrangler's own (`CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`). The publisher never reads, prints or stores them.

Runtime: every failure class has one status (§5) and fails closed.

Logs: one JSON line per response with status ≥ 400, or per response when the Worker variable `LOG_ALL` is `"1"`. Fields: `host`, `path` (no query string, first 256 characters), `method`, `status`, `outcome`, `siteId`, `packageHash`, `key`, and `error` for internal errors. No headers, no query strings, no bodies.

## 11. Immutability

- Publishing reads the package and never writes under `data/site-builds/**`.
- Served bytes equal built bytes for every file, HTML included. The runtime rewrites nothing: no injected tags, no canonical changes, no SEO generation. There are no exceptions.
- A change to a site is a new build, a new `packageHash`, a new prefix, and then a pointer move.
