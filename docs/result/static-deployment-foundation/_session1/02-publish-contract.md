# 02 — Publish contract (`site:publish`)

Status: implemented, verified locally only (in-memory store + `wrangler --local`). No bucket was created, nothing was written with `--remote`, and no Worker was deployed.

| Piece | File |
|---|---|
| Shared contract (keys, pointer/seal types, cache constants) | `workers/recon-runtime/src/contract.ts` |
| Publisher (validate → plan → upload → verify → seal → pointer; rollback) | `platform/publish/publish.ts` |
| Content-type / cache policy | `platform/publish/media.ts` |
| Store abstraction + in-memory backend (fault injection) | `platform/publish/store.ts` |
| wrangler backend (`r2 object put/get`, `--local` / guarded `--remote`) | `platform/publish/wrangler-store.ts` |
| CLI | `platform/cli/site-publish.ts` → `pnpm site:publish` |
| Tests | `platform/test/publish.test.ts` (unit, 27), `platform/test/publish-e2e.test.ts` (local e2e) |

## CLI

```
pnpm site:publish --site <siteId> --host <hostname> [--bucket recon-sites] [--dry-run]
                  [--local | --remote] [--persist-to <dir>] [--concurrency N] [--allow-site-change]
                  [--expect-package <packageHash>]
pnpm site:publish --site <siteId> --host <hostname> --rollback [--local | --remote] [--persist-to <dir>]
```

| Flag | Meaning |
|---|---|
| `--local` (default) | wrangler local (miniflare) state in `--persist-to` (default `tmp/recon-runtime-state`, the dir `pnpm runtime:dev` serves) |
| `--remote` | real bucket. **Refused unless `RECON_PUBLISH_ALLOW_REMOTE=1`.** Never executed in this task. |
| `--dry-run` | validates and plans, **no store access at all** (no reads either). Prints every key / content-type / cache-control / size plus the pointer. |
| `--rollback` | re-point the host at its pointer's `previous` package (must already be sealed). No upload. |
| `--expect-package <hash>` | refuse unless the current package is exactly this `packageHash` (the one reviewed in a dry run). Guards against a concurrent `site:build`; this race actually happened during testing (see below). |
| `--allow-site-change` | allow a hostname that currently serves another site to be re-pointed (refused by default) |

## Inputs and validation (all before any store write)

| # | Check | Failure |
|---|---|---|
| 1 | `data/site-builds/<siteId>/current.json` exists; zod `{buildInputId: 64-hex, packageDir, finishedAt}` | exit 1 |
| 2 | `packageDir` resolves exactly to `data/site-builds/<siteId>/packages/<buildInputId>` | exit 1 |
| 3 | `build-record.json` zod: `schemaVersion 1`, `siteId`, `status "success"`, `buildInputId`, `template.releaseId/releaseHash`, `packageHash`, `qa.pass === true`, `qa.files`, `qa.bytes` | exit 1 |
| 4 | record `siteId` = `--site`, record `buildInputId` = current.json, record `packageHash` = `--expect-package` (if given) | exit 1 |
| 5 | `packageHash` recomputed with the platform's own `packageIntact()` (`platform/build/site-build.ts`, same `hashDir` as the builder) — no second hashing scheme | exit 1 |
| 6 | inventory `site/**`: regular files only, no file named `_package.json` at root, every extension has a content-type (fail closed), count/bytes = `qa.files`/`qa.bytes` | exit 1 |
| 7 | `packageIntact()` again after reading → the inventory's sha256s belong to the verified package | exit 1 |
| 8 | hostname: lowercased, no port/scheme, DNS charset | exit 1 |

The publisher never writes under `data/site-builds/**`. Both test suites hash the published package directory (157 files incl. `build-record.json`) before and after and assert equality.

## Artifact identity

| Identity | Source | Used for |
|---|---|---|
| `packageHash` | `build-record.json#packageHash` (sha256 over the `site/` tree, computed by `site:build`) | R2 namespace. Same bytes, same prefix; a new build gets a new prefix. |
| `buildInputId` | `current.json` / build record | recorded in seal + pointer (provenance) |
| `releaseId` | `build-record.json#template.releaseId` | recorded in seal + pointer |

## R2 key layout (bucket `recon-sites`)

```
sites/<siteId>/packages/<packageHash>/<path under site/>    156 objects for the demo
sites/<siteId>/packages/<packageHash>/_package.json         SEAL, written last
routing/<hostname>.json                                     pointer
```

## Content-type and cache-control (stored as R2 httpMetadata)

| Rule | Cache-Control | Demo count |
|---|---|---|
| `_next/static/**` | `public, max-age=31536000, immutable` | 17 |
| name stem ≥16 hex **and** a prefix of the file's own sha256 (checked per file; `assets/<sha256[0:20]>.<ext>`) | `public, max-age=31536000, immutable` | 52 (51 jpg + 1 svg) |
| everything else: HTML, RSC `*.txt`, `robots.txt`, `sitemap.xml` | `public, max-age=0, must-revalidate` | 87 |

| Content-Type | Demo count |
|---|---|
| `text/html; charset=utf-8` | 15 |
| `text/plain; charset=utf-8` (RSC payloads + robots) | 71 |
| `text/javascript; charset=utf-8` | 16 |
| `text/css; charset=utf-8` | 1 |
| `image/jpeg` | 51 |
| `image/svg+xml` | 1 |
| `application/xml` | 1 |

Seal and pointer objects: `application/json`, `no-store`.

## Seal: `sites/<siteId>/packages/<packageHash>/_package.json`

```jsonc
{ "schemaVersion": 1, "siteId", "packageHash", "buildInputId", "releaseId",
  "fileCount": 156, "bytes": 7279757,
  "files": [ { "path", "size", "sha256", "contentType", "cacheControl" }, … ] }   // sorted by path
```
The bytes are deterministic (`JSON.stringify(seal, null, 2) + "\n"`), 44,124 B for the demo. A package counts as present only when its seal exists **and is byte-identical** to the one this publish would write. The runtime never serves the seal (`/_package.json` → 404).

## Pointer: `routing/<hostname>.json`

```json
{
  "schemaVersion": 1,
  "hostname": "localhost",
  "siteId": "boost-interior-demo",
  "packageHash": "c28ad0131b71f69394c408099b5a4486d2d9bd72136d77c369cdc7189a2e5aa7",
  "buildInputId": "6c74d34c2ecdf84be601f3c4f7974378f4d138a7c44ee0fac86485c8e1e67c43",
  "releaseId": "interior-01-1.5.0-75f173939e77",
  "publishedAt": "…",
  "previous": { "siteId", "packageHash", "buildInputId", "releaseId", "publishedAt" }   // optional
}
```

## Order and failure semantics

| Step | Action | On failure |
|---|---|---|
| 1–8 | validation above | exit 1, no store access |
| 9 | GET seal: identical → **immutable skip** (0 uploads). Different → **refuse** (a sealed package is never overwritten). | exit 1, pointer untouched |
| 10 | PUT every file (with content-type + cache-control) | exit 1, no seal, pointer untouched |
| 11 | GET every file back; compare size + sha256 to the inventory | exit 1, no seal, pointer untouched |
| 12 | PUT seal, GET it back, compare bytes | exit 1, pointer untouched |
| 13 | GET existing pointer. Invalid → refuse. Another site → refuse without `--allow-site-change`. Same package → `unchanged` (no write). | exit 1, pointer untouched |
| 14 | PUT pointer (`previous` = old pointer), GET it back, compare bytes | exit 1 |

Each ordering and failure row has an in-memory unit test: upload failure, corrupted upload, seal write failure, seal corruption, pointer corruption, foreign seal, foreign site, skip, re-point from another host, rollback. In each failure case the existing pointer stays byte-identical, and in the success case the pointer is the last write.

Local wrangler concurrency is **1**. Every `wrangler r2 object` call boots its own miniflare over the same SQLite state, and parallel calls failed with `put: Unspecified error (0)` (observed). Remote mode defaults to 4.

## Dry run (real current package, excerpt)

Developed against 1.5.0 (`6c74d34c…` / packageHash `c28ad013…`, 156 files, 7,279,757 B). The other agent's 1.5.1 build became current during the work (`aa71b829…` / `613cd9e0…`, 156 files, **7,283,710 B**, same per-type and per-policy counts). The final runs use 1.5.1. The excerpt below is from 1.5.0; the 1.5.1 summary follows it.

```
$ pnpm site:publish --site boost-interior-demo --host localhost --dry-run
[boost-interior-demo] package c28ad0131b71f693… (build 6c74d34c2ecdf84b…, interior-01-1.5.0-75f173939e77) · 156 files · 7279757 B · host localhost
DRY RUN — no store access, nothing written. Target bucket: recon-sites (local, persist tmp/recon-runtime-state)
key	content-type	cache-control	size
sites/boost-interior-demo/packages/<packageHash>/index.html	text/html; charset=utf-8	public, max-age=0, must-revalidate	54436
sites/boost-interior-demo/packages/<packageHash>/__next._tree.txt	text/plain; charset=utf-8	public, max-age=0, must-revalidate	308
sites/boost-interior-demo/packages/<packageHash>/portfolio/buk-32py-kitchen-bathroom-renewal/__next.portfolio.$d$slug.__PAGE__.txt	text/plain; charset=utf-8	public, max-age=0, must-revalidate	9316
sites/boost-interior-demo/packages/<packageHash>/_next/static/chunks/0agt8sfcbim42.js	text/javascript; charset=utf-8	public, max-age=31536000, immutable	6001
sites/boost-interior-demo/packages/<packageHash>/assets/03c625140dc4df674fb8.jpg	image/jpeg	public, max-age=31536000, immutable	104478
…
sites/boost-interior-demo/packages/<packageHash>/_package.json	application/json	no-store	44124	(SEAL, written last)
routing/localhost.json	application/json	no-store	-	(POINTER, written after the verified seal; "previous" filled from the existing pointer at publish time)
{ "status": "dry-run", "files": 156, "bytes": 7279757, "objectsPlanned": 158, … }

# 1.5.1 (final current package)
{ "status": "dry-run", "packageHash": "613cd9e00e73d842…", "releaseId": "interior-01-1.5.1-6bbdd07eb9bf",
  "files": 156, "bytes": 7283710, "objectsPlanned": 158,
  "byCachePolicy": { "revalidate": 87, "next-static": 17, "content-addressed": 52 } }
```

## Local publish (wrangler `--local`, real package)

| Run | Result |
|---|---|
| 1.5.0, fresh state dir (CLI) | `uploaded 156`, `verified 156`, seal written, pointer `written`, `previous: null`; 3 min 23 s (serial) |
| 1.5.1, fresh state dir (e2e) | uploaded 156, verified 156, sealed, pointer written; 216 s |
| same package again | `skipped-sealed`, 0 uploads, pointer `unchanged` (1.5 s) |

**Observed race.** In one e2e run, `site:build` 1.5.1 finished between the first publish (1.5.0) and the "republish" step. The republish correctly read the new `current.json`, uploaded 1.5.1 under its own prefix, and moved the pointer. The test's byte comparisons, planned for 1.5.0, then failed. This is not a publisher bug, but an operator could hit the same thing between a reviewed dry run and the real publish. `--expect-package` / `expectPackageHash` now closes that gap; the e2e and a unit test use it.

## Not done / deliberately out of scope

- No publish of a non-current package. Rollback only re-points to the pointer's `previous`, which must already be sealed.
- No garbage collection of old package prefixes. Bytes are immutable; retention is a later decision.
- A seal that matches is trusted: a present seal is not re-verified object by object.
