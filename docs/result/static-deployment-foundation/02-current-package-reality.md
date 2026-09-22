# Current Static Build Package — Observed Reality

READ-ONLY inspection of the web-recon "Recon Template Platform" static build pipeline and its
one existing real package, so a static delivery layer (Worker + R2) can serve it faithfully.
Every fact below was read directly off code and files in `/Users/woops/projects/web-recon-track-b`.
Nothing here is inferred from documentation prose; anything not directly observed is marked
**UNVERIFIED**.

Site inspected: `boost-interior-demo`. Current package:
`aa71b829ec7046f223904d42d38d1fe58a7b3fc61a245d6d3f6a4112c710b171` (release `interior-01-1.5.1-6bbdd07eb9bf`).

---

## 1. Build command and what it writes

- Script: `pnpm site:build <siteId> [--mode public|preview] [--at ISO] [--release <id>] [--force] [--keep-workspace]`
  defined in `package.json:104` → runs `platform/cli/site-build.ts`, which calls
  `buildSite()` in `platform/build/site-build.ts`.
- High-level pipeline, `platform/build/site-build.ts:13-25` (file header) and `:241-425` (`buildSite`):
  1. Verify the pinned Template Release is byte-intact (`verifyRelease`).
  2. Build a canonical site snapshot (visible content at `at`) → `buildInputId`.
  3. Materialize the release into a **disposable workspace outside the repo**
     (`os.tmpdir()/recon-site-build/<siteId>-<buildInputId12>-<pid>-<ts>`, `:289-294`).
  4. `pnpm install --offline --frozen-lockfile --ignore-scripts` in that workspace (`:301`).
  5. Preflight (route plan + prune list) via `tsx platform/site/preflight.ts` (`:306-321`), then
     `next build` (static export) with an allowlisted env (`:324`, env built by `buildEnv()` at `:109-121`).
  6. Package QA on `out/` (`qaStaticPackage`, `:329-339`).
  7. Assemble the package **beside** its final location, then atomic `rename` into place (`:343-392`).
  8. Update `current.json`/`previous.json` pointers, prune old packages, append `history.jsonl` (`:394-413`).

Exact paths (all relative to repo root, `SITE_BUILDS_DIR = "data/site-builds"`, `site-build.ts:27`):

| Thing | Path |
|---|---|
| Build record | `data/site-builds/<siteId>/packages/<buildInputId>/build-record.json` |
| Static site tree | `data/site-builds/<siteId>/packages/<buildInputId>/site/` |
| Current pointer | `data/site-builds/<siteId>/current.json` |
| Previous (rollback) pointer | `data/site-builds/<siteId>/previous.json` |
| Append-only history | `data/site-builds/<siteId>/history.jsonl` |
| Per-site build lock | `data/site-builds/<siteId>/.build.lock` (exclusive-create `wx`, `site-build.ts:255-274`) |

Real example (`data/site-builds/boost-interior-demo/current.json`):
```json
{
  "buildInputId": "aa71b829ec7046f223904d42d38d1fe58a7b3fc61a245d6d3f6a4112c710b171",
  "packageDir": "data/site-builds/boost-interior-demo/packages/aa71b829ec7046f223904d42d38d1fe58a7b3fc61a245d6d3f6a4112c710b171",
  "finishedAt": "2026-09-21T08:49:05.749Z"
}
```
`Pointer` type (`buildInputId`, `packageDir`, `finishedAt`) is `site-build.ts:65-69`.

**The current package = whatever `current.json` points to.** For `boost-interior-demo` that is
`aa71b829ec7046f223904d42d38d1fe58a7b3fc61a245d6d3f6a4112c710b171`, package dir contains exactly
two entries: `build-record.json` and `site/`.

---

## 2. Build record schema and identity fields

`BuildRecord` interface: `platform/build/site-build.ts:36-63`. Top-level keys, with real values
from `.../packages/aa71b829.../build-record.json`:

| Key | Type | Real value |
|---|---|---|
| `schemaVersion` | `1` (literal) | `1` |
| `siteId` | string | `"boost-interior-demo"` |
| `status` | `"success"` (literal) | `"success"` |
| `buildInputId` | string (sha256 hex) | `aa71b829ec7046f223904d42d38d1fe58a7b3fc61a245d6d3f6a4112c710b171` |
| `parts` | object | `{releaseHash, siteSnapshotHash, mode, toolchainHash}` — see below |
| `toolchain` | object | `{node: "v22.22.3", pnpm: "11.21.0", platform: "darwin", arch: "arm64"}` |
| `template` | object | `{templateId: "interior-01", templateVersion: "1.5.1", releaseId: "interior-01-1.5.1-6bbdd07eb9bf", releaseHash: "6bbdd07eb9bf07ae...25d02", templateSourceHash: "10fdd0744f82b439...c46f"}` |
| `at` | ISO string | `"2026-09-21T08:48:51.592Z"` |
| `startedAt` / `finishedAt` | ISO string | `08:48:51.596Z` / `08:49:05.749Z` |
| `durationMs` | object | `{total: 14153, install: 2148, preflight: 367, nextBuild: 10886, qa: 54}` |
| `packageHash` | string (sha256 hex) | `613cd9e00e73d8428efcb9afa4249bb353952994c0653568da59adc407890266` |
| `qa` | `PackageQaResult` | `{pass: true, files: 156, bytes: 7283710, failures: [], pages: {…15 entries…}}` |
| `preflight` | object | `{selections, warnings, slotSources, routes, pruned}` — see §3 |
| `effectiveSettingsHash` | string (sha256 hex) | `d4f402f2a9f66d98474f9ec5f427c5d1d9be504bd75b352d66c1164e701ef2e3` |
| `effectiveThemeHash` | string (sha256 hex) | `e26a78441500a20e42dcd113a333b8ad3789f831baf37eb80204e30c0d820c3e` |
| `hermeticity` | string[] (4 sentences) | provenance notes, e.g. "RENDERED code … comes only from the verified release snapshot …" |

`PackageQaResult` shape: `platform/build/qa.ts:39-45` — `{pass, files, bytes, failures: GateFinding[], pages: Record<file, {sections, projectCards, projectCardIds, title?, lang?}>}`.

### packageHash computation — the byte identity of the served tree

`hashDir()`, `platform/build/site-build.ts:131-142`:
1. Recursively walk `site/` (`path.join(staging, "site")`), at each directory level sort entries
   by `readdir(..., {withFileTypes:true})` name (`a.name < b.name`), and recurse depth-first into
   subdirectories in that alphabetical position (**not** a full-path lexicographic sort — e.g. the
   directory entry `portfolio` sorts before the file entry `portfolio.html` because it's a string
   prefix, so the whole `portfolio/` subtree is walked and appended before `portfolio.html` itself).
2. For every **file**, push `{path: "<posix-relative-path>", sha256: sha256(rawFileBytes)}` (raw
   bytes, not JSON-encoded) — `sha256()` at `platform/util/hash.ts:28-30`.
3. `hashJson(entries)` = `sha256(stableStringify(entries))` (`hash.ts:32-34`) — `stableStringify`
   (`hash.ts:11-26`) sorts **object keys** recursively but preserves **array order** (the file
   traversal order from step 1 is therefore baked into the hash).
4. Called at `site-build.ts:367`: `packageHash: await hashDir(path.join(staging, "site"))`.

So `packageHash` is a hash of every file's content **and relative path** under `site/`, in the
above traversal order. **This is the byte identity of the served tree** — recomputing it over a
package's `site/` dir must reproduce the recorded value (used by `packageIntact()`,
`site-build.ts:499-506`, to validate a package before treating it as current/rollback-eligible).

### buildInputId computation — a pre-build reproducibility/cache key, NOT a byte identity

`computeBuildInputId()`, `platform/build/build-input.ts:16-23`:
```
buildInputId = sha256(stableStringify({ releaseHash, siteSnapshotHash, mode, toolchainHash }))
```
computed **before** `next build` even runs (`prepareSiteInput`, `site-build.ts:144-166`, calls it
at `:165`), from:
- `releaseHash` — the pinned Template Release's content hash (`site-build.ts:160`).
- `siteSnapshotHash = hashJson(snapshot)` — hash of the canonical site content snapshot at `at` (`:161`).
- `mode` — `"public"` or `"preview"` (`:162`).
- `toolchainHash = hashJson({node, pnpm, platform, arch})` (`:163`, `build-input.ts:41-43`).

Same inputs → same `buildInputId` → build is skipped as `"up-to-date"` (`site-build.ts:284-287`)
**without re-hashing output**, unless `--force`. `buildInputId` is reused as: the package
directory name, the first 32 hex chars become the Next.js `generateBuildId` (env
`RECON_BUILD_ID`, `site-build.ts:297`; consumed in `next.config.mjs:16` — see §3), and the
first 16 chars are logged (`:248`).

**Answer: `packageHash` is the byte identity of the served `site/` tree. `buildInputId` identifies
the *inputs* that produced it (and doubles as the package dir name / Next build id) — it is
computed before the build runs and is not a hash of the output bytes.**

---

## 3. Exact static route layout of `site/`

Full file tree of the current package (`.../packages/aa71b829.../site/`, 156 files, 7,283,710
bytes — matches `qa.files`/`qa.bytes` exactly):

### HTML pages (15 total, matches `qa.pages` count)

| File | Route |
|---|---|
| `index.html` | `/` (home) |
| `about.html` | `/about` |
| `contact.html` | `/contact` |
| `portfolio.html` | `/portfolio` |
| `3d-portfolio.html` | `/3d-portfolio` |
| `portfolio/<slug>.html` × 8 | `/portfolio/<slug>` (detail) |
| `404.html` | static-host 404 fallback |
| `_not-found.html` | Next's own not-found route page |

8 detail slugs (real): `buk-32py-kitchen-bathroom-renewal`, `dalseo-24py-white-natural-newlywed-home`,
`dong-29py-bright-natural-remodeling`, `gyeongsan-34py-entrance-living-remodeling`,
`jung-19py-compact-white-minimal-remodeling`, `suseong-42py-family-storage-remodeling`,
`suseong-51py-new-apartment-home-styling`, `suseong-white-34py-apartment-remodeling`.

**Clean-URL representation: `/about` is stored as `about.html` (flat file), never `about/index.html`.**
Home is the one exception, stored as `index.html`. Rule implemented in
`routeHtml()`, `platform/build/qa.ts:59-61`: `route === "/" ? "index.html" : "<route-without-slashes>.html"`.
This is also what QA and the route plan agree on as the exhaustive set (`qaStaticPackage`,
`qa.ts:63-139`, with `exclusiveRoutes: true` at `site-build.ts:332` — any extra/missing HTML fails the build).

**`portfolio.html` (file) AND `portfolio/` (directory) BOTH exist simultaneously** — see §7 hazard.
Same is true for `about`, `contact`, `3d-portfolio`, `_not-found`, and every portfolio detail slug:
each has a `<route>.html` file **and** a same-named directory holding RSC sidecar files (below).
There is **no** `portfolio/index.html`.

### 404 form

- `404.html` exists at the root — the conventional static-host 404 filename.
- `_not-found.html` also exists at the root (Next's own not-found route output) and is
  **byte-identical** to `404.html` (verified: `diff 404.html _not-found.html` → no output).
- No `404/index.html`, no `404.txt`, no `404/` directory. `_not-found` does get the full RSC
  sidecar set (`_not-found.txt`, `_not-found/__next.*.txt` — 4 files), `404` does not.
- `FRAMEWORK_HTML = new Set(["404.html", "_not-found.html"])` (`qa.ts:37`) is the exact allowlist
  the QA gate exempts from `exclusiveRoutes` route-plan matching.

### `.txt` / RSC payload files (Next 16.3.0 App Router static export, "output: export")

Confirmed via `next.config.mjs` (`.../templates/interior-01/v1/next.config.mjs:9`: `output: "export"`,
`:16`: `generateBuildId: async () => process.env.RECON_BUILD_ID ?? "recon-dev"`) and `package.json:120`
(`"next": "^16.3.0"`). For every route `R` (route key, e.g. `""`/home, `about`, `portfolio`,
`portfolio/<slug>`), the package contains:

| File | Purpose (content-inspected) |
|---|---|
| `<R>.txt` (or `index.txt` for home) | RSC "flight" payload — **byte-identical** to `<R>/__next._full.txt` (verified for home and one detail route: `diff index.txt __next._full.txt` and `diff portfolio/buk-32py-kitchen-bathroom-renewal.txt portfolio/buk-32py-kitchen-bathroom-renewal/__next._full.txt` both empty). Starts with `1:"$Sreact.fragment"…`. |
| `<R>/__next._full.txt` | same content as `<R>.txt` (duplicate on disk). |
| `<R>/__next._index.txt` | shorter Flight payload subset (index-only render). |
| `<R>/__next._tree.txt` | route segment tree manifest, different format — starts with `:HL["/_next/static/chunks/….css","style"]` … `0:{"tree":{...,"prefetchHints":…}}`. |
| `<R>/__next.<routekey>.__PAGE__.txt` | per-segment page prefetch payload. Route key mirrors the App Router path with `.` joining segments and dynamic params escaped as `$d$<name>` — real examples: `__next.__PAGE__.txt` (home, no key prefix), `__next.about.__PAGE__.txt`, `__next.portfolio.__PAGE__.txt`, `__next.portfolio.$d$slug.__PAGE__.txt` (detail route `[slug]`), `__next._not-found.__PAGE__.txt`. |

Counts: `.txt` extension = 71 files, 667,395 bytes total (includes `robots.txt`; every route
contributes 1 sibling `.txt` + 4 files in its same-named directory except home, which puts its 4
`__next.*` files directly at `site/` root instead of in an `index/` directory).

**UNVERIFIED**: the exact client-side fetch mechanism (headers/query params) Next's router uses to
request these sidecar files at runtime was not tested — no network/browser tooling was run. Only
their static on-disk presence, naming, and byte content were inspected. A delivery layer should
treat them as ordinary static objects (serve verbatim by literal path) unless a live capture
proves otherwise.

### `_next/` layout — filenames are NOT content-hashed at the chunk level, but the build-id dir is deterministic

```
_next/static/aa71b829ec7046f223904d42d38d1fe5/_buildManifest.js
_next/static/aa71b829ec7046f223904d42d38d1fe5/_clientMiddlewareManifest.js
_next/static/aa71b829ec7046f223904d42d38d1fe5/_ssgManifest.js
_next/static/chunks/<opaque-id>.js   (15 files, incl. 1 "turbopack-<id>.js")
_next/static/chunks/<opaque-id>.css  (1 file)
```
- `aa71b829ec7046f223904d42d38d1fe5` = `buildInputId.slice(0, 32)` (`site-build.ts:297`,
  `RECON_BUILD_ID`, consumed by `generateBuildId` in `next.config.mjs:16`) — **deterministic**,
  reproducible from the same inputs, and namespaces the 3 manifest files per build.
- Chunk filenames under `_next/static/chunks/` (e.g. `03av4zwinu01d.js`, `12l5746ts8j5e.css`) are
  **Turbopack-assigned opaque ids, not content hashes** — verified: `shasum -a 256` of
  `03av4zwinu01d.js` gives `48ef519…`, unrelated to the filename. Cross-build comparison
  (previous package `6c74d34c…` vs current `aa71b829…`) shows almost entirely different chunk
  filenames even though template content largely overlaps — confirming they are per-build, not
  content-addressed. They are safe to treat as immutable **only within one package** (the
  package/build-id boundary is what guarantees no collision, not the filename itself).

### Public / raster assets — ARE content-addressed

`site/assets/` — 51 `.jpg` + 1 `.svg` = 52 files, 5,473,320 bytes. Filename stem = first 20 hex
chars (10 bytes) of the file's own sha256, verified for 3 samples:

| File | sha256 (shasum -a 256) | Stem matches prefix? |
|---|---|---|
| `assets/03c625140dc4df674fb8.jpg` | `03c625140dc4df674fb8db0e33f41f9ead260515a17c45ed739a4fd08b9a6d4c` | yes |
| `assets/0600f0ac3c687ecd0dd0.jpg` | `0600f0ac3c687ecd0dd0c970fa176c0d567c68bc1e0afcef87409f1ae7aa291b` | yes |
| `assets/f7fc7d18036335e53d7b.svg` | `f7fc7d18036335e53d7b8e0728ebb24b4f7130b2e93ae987c84ef52ae468688b` | yes |

These come from `writeWorkspaceInputs()` (`site-build.ts:428-459`) copying `assetFiles` (content-hash-named,
computed upstream by the site-snapshot/asset-selection layer — not inspected here, out of scope)
into the workspace's `public/assets/` before `next build`; Next's static export copies `public/*`
verbatim to the root of `out/`. Safe to serve with long/immutable cache headers by content hash.

### robots.txt / sitemap.xml (verbatim)

`robots.txt`:
```
User-Agent: *
Allow: /

Sitemap: https://boost-interior-demo.example/sitemap.xml
```

`sitemap.xml` (13 `<url>` entries: home, portfolio index, 8 detail pages, 3d-portfolio, about,
contact — all under `https://boost-interior-demo.example`):
```xml
<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
<url><loc>https://boost-interior-demo.example/</loc></url>
<url><loc>https://boost-interior-demo.example/portfolio</loc></url>
... (8 detail urls) ...
<url><loc>https://boost-interior-demo.example/3d-portfolio</loc></url>
<url><loc>https://boost-interior-demo.example/about</loc></url>
<url><loc>https://boost-interior-demo.example/contact</loc></url>
</urlset>
```
Note the sitemap host (`boost-interior-demo.example`) is baked in at build time from
`snapshot.site.identity.publicOrigin` (used identically for the QA same-origin check,
`site-build.ts:334`, `qa.ts:69`) — a mismatch with the real serving hostname is a content
correctness issue for a delivery layer to be aware of, not something it can fix by routing alone.

### Favicon / icons / source maps

- **No favicon, no icon files of any kind** in the package (`find . -iname "*favicon*" -o -iname "*icon*"` → empty; no `<link rel=icon>` in `index.html` `<head>`).
- **No source maps** (`.map`) anywhere in the tree.
- No `.webmanifest` (QA's `TEXT_EXT` regex, `qa.ts:47`, allows for one but none is emitted).

### Pagination form — not present in the current package (pruned)

`preflight.routes` in the build record: `{"home":1,"portfolio.index":1,"portfolio.page":0,"portfolio.detail":8,"portfolio3d":1,"about":1,"contact":1}`
(13 pages total: 1+1+0+8+1+1+1). `portfolio.page` generated **zero** pages this build (8 projects
fit on one listing page) and was pruned from the workspace before `next build`
(`preflight.pruned`: `[{"key":"portfolio.page","dir":"portfolio/page/[n]","scope":"segment"}]`,
pruning code `pruneRoutes()`, `site-build.ts:469-496`). Template source
(`templates/interior-01/v1/template.ts:83`, `sections/PortfolioIndex.tsx:20-22`) shows the intended
URL form when it *is* populated: `/portfolio/page/<n>` for `n ≥ 2` (page 1 is `/portfolio` itself,
never `/portfolio/page/1`) — which by the `routeHtml()` rule would materialize as
`portfolio/page/<n>.html`. **This form was not observed in any actual output file** in the
inspected packages; it is a code-level inference only.

### Extension table (full `site/`, current package)

| Extension | Count | Total bytes |
|---|---|---|
| `.jpg` | 51 | 5,472,695 |
| `.txt` | 71 | 667,395 |
| `.js` | 16 | 632,578 |
| `.html` | 15 | 471,452 |
| `.css` | 1 | 37,643 |
| `.xml` | 1 | 1,322 |
| `.svg` | 1 | 625 |
| **Total** | **156** | **7,283,710** |

---

## 4. Total file count and bytes

**156 files, 7,283,710 bytes** — computed independently via `find`/Python walk over
`.../packages/aa71b829.../site/`, and matches `build-record.json` → `qa.files` (156) and
`qa.bytes` (7283710) exactly (these are the same numbers `qaStaticPackage()` computes over `out/`
right before packaging, `qa.ts:73-90`).

---

## 5. Contents of the package dir outside `site/`

Only one thing: `build-record.json` (13,251 bytes for the current package) — the `BuildRecord`
JSON described in §2. This is **build/audit metadata, not a route of the site** and should
**not** be served on the public HTTP surface (it contains internal hashes, durations, toolchain
info, and preflight slot-source data that has no reason to be public). A delivery layer should
treat the package directory boundary as `site/` = servable, `build-record.json` = internal only.

No other files exist beside `build-record.json` and `site/` in either inspected package directory
(`6c74d34c…` and `aa71b829…` both confirmed via `ls`).

---

## 6. Retention

**Exactly 2 packages are kept per site: the current one and the one immediately previous
(rollback target).** Confirmed empirically — `data/site-builds/boost-interior-demo/packages/`
contains exactly 2 directories, matching `current.json` and `previous.json`.

Pruning code, `platform/build/site-build.ts:394-408`:
```
const keep = new Set([buildInputId, previous?.buildInputId].filter(Boolean));
for (const dir of await readdir(path.join(buildsRoot, "packages"))) {
  if (!keep.has(dir)) await rm(path.join(buildsRoot, "packages", dir), { recursive: true, force: true });
}
```
Runs unconditionally at the end of every successful build, under the per-site `.build.lock`
(acquired `:254-274`, released in the outer `finally` `:275-279`), so pruning and pointer updates
never interleave with a concurrent build of the same site. `previous.json` is only updated to the
old `current` when that old package is still intact (`currentExists`, checked via
`packageIntact()` at `:283` and gated again at `:398`) — a corrupt/missing current package is
never promoted to rollback target.

`history.jsonl` is **append-only and unpruned** — it accumulates one line per build attempt
(success or failure) forever; 9 lines currently for `boost-interior-demo`, oldest
`2026-09-19T11:26:51.143Z`, newest (current) `2026-09-21T08:49:05.749Z`. Failed builds append
`{buildInputId, status:"failed", finishedAt, error}` (`:417-420`) without ever writing a package dir.

---

## 7. Observations that would make faithful serving hard

1. **File/directory name collision at every route.** `portfolio.html` (file) and `portfolio/`
   (directory) both exist at the same parent, for every route that has children pages (`about`,
   `contact`, `portfolio`, `3d-portfolio`, `_not-found`, and each `portfolio/<slug>`). A delivery
   layer that maps clean URLs onto a real filesystem, or that treats "path" and "path/" as the
   same key space, must disambiguate: `/portfolio` → object key `portfolio.html`, while
   `portfolio/__next._full.txt` etc. are a **different, unrelated object** one level "inside" what
   looks like the same name. R2 (flat key-value) has no structural conflict here since keys are
   opaque strings, but any code path that does `key.replace(/\/$/, "") + "/index.html"` or lists
   "directories" naively will collide.
2. **Duplicate bytes on disk by design.** `<route>.txt` is byte-identical to
   `<route>/__next._full.txt` for every route (verified twice). Not a bug, but worth knowing
   before deciding whether to deduplicate in the object store (e.g. store once, alias the key) —
   doing so changes what `packageHash` was computed over, so any such optimization must happen
   strictly at the delivery layer, never by mutating the package before/while hashing.
3. **`_next/static/chunks/*` filenames are not content-hashed**, only scoped by the
   `buildInputId`-derived build directory. Immutable-cache-forever headers are only safe keyed by
   the **full path including the build-id segment** (or by package identity), not by chunk
   filename alone across builds.
4. **Home route is a special case** in the RSC-sidecar layout: its 4 `__next.*` files sit directly
   at `site/` root rather than in an `index/` subdirectory (there is no `index/` dir at all) — an
   asymmetry a generic per-route key-mapping function needs to special-case, matching `routeHtml()`'s
   own special case for `/`.
5. **No favicon/icons and no source maps** — nothing to accidentally leak, but also nothing to
   serve; a delivery layer expecting a `favicon.ico` fallback will get a 404-shaped gap (mitigated
   only by whatever "not found" handling it wraps around missing keys).
6. **`sitemap.xml`/`robots.txt` bake in `snapshot.site.identity.publicOrigin`** at build time
   (`boost-interior-demo.example` in the current package) — if the delivery layer serves the site
   under a different hostname than what was baked in, sitemap URLs and the QA-verified
   same-origin invariant (`qa.ts:69,98,110`) both silently disagree with the actual serving origin.
   This is a content-correctness concern the delivery layer cannot fix by routing; it has to be
   solved upstream (rebuild with the right `publicOrigin`, or verify hostname == baked origin
   before publishing).
7. **No unicode/space/percent-encoded characters and no case-only collisions** were found anywhere
   in `site/` (checked with a Unicode/space/percent grep and a lowercase-dedupe pass over all 156
   paths — both empty). Max single file size 229,075 bytes (a JS chunk); nothing large enough to
   need special (e.g. multipart/range) handling. Slugs are plain ASCII kebab-case throughout.
8. **`packageHash`'s file-traversal order is baked into the hash** (per-directory-level
   alphabetical, depth-first — not a flat lexicographic sort, see §2). Any reproduction of
   `packageHash` outside `hashDir()` (e.g. a verification script in the delivery layer) must
   replicate that exact traversal order, not just "hash every file and sort somehow," or it will
   compute a different digest for byte-identical trees.
9. **Existing publish/runtime scaffolding already exists in this repo** at `platform/publish/`
   (`publish.ts`, `store.ts`, `wrangler-store.ts`, `media.ts`) and is referenced by
   `pnpm site:publish` (`platform/cli/site-publish.ts`) and `docs/result/static-deployment-foundation/04-live-deploy-plan.md`.
   This report only inspected the build/package side (`platform/build/*`, `platform/cli/site-build.ts`)
   as scoped; the publish-side content-type/cache-control decisions were not independently
   re-verified here (there are already `02-publish-contract.md` / `03-runtime-contract.md` /
   `05-independent-review.md` documents in the same result directory covering that layer) —
   flagged so this document isn't read as a full substitute for those.

---

## Sources (file:line)

- `package.json:104` — `site:build` script.
- `platform/cli/site-build.ts:1-61` — CLI wrapper.
- `platform/build/site-build.ts:1-506` — builder (`BuildRecord` schema `:36-63`, `hashDir` `:131-142`,
  `buildSite` `:241-425`, `pruneRoutes` `:469-496`, `packageIntact` `:499-506`).
- `platform/build/build-input.ts:1-43` — `computeBuildInputId`, `toolchainHash`.
- `platform/build/qa.ts:1-165` — `qaStaticPackage`, `routeHtml`, `FRAMEWORK_HTML`.
- `platform/util/hash.ts:1-34` — `stableStringify`, `sha256`, `hashJson`.
- `platform/site/routes.ts:1-50` — `PlannedRoute`, `PruneEntry`, `RoutePlan`.
- `templates/interior-01/v1/next.config.mjs:1-19` — `output: "export"`, `generateBuildId`.
- `templates/interior-01/v1/template.ts:83`, `templates/interior-01/v1/sections/PortfolioIndex.tsx:20-22` — pagination URL form (code-level, not observed in output).
- `data/site-builds/boost-interior-demo/{current,previous}.json`, `history.jsonl`.
- `data/site-builds/boost-interior-demo/packages/aa71b829ec7046f223904d42d38d1fe58a7b3fc61a245d6d3f6a4112c710b171/{build-record.json,site/**}`.
- `data/site-builds/boost-interior-demo/packages/6c74d34c2ecdf84be601f3c4f7974378f4d138a7c44ee0fac86485c8e1e67c43/site/_next/static/chunks/*` — cross-build chunk-filename comparison.
