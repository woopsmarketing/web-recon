# 06 — Local validation (final code, 2026-09-21)

Everything below was run in the isolated copy `/Users/woops/projects/web-recon-track-b` (branch `track-b/static-deployment-foundation`, start commit `6c2e723601a0d76431c96a48bbdb4726c02063e7`), after the last code change that followed the independent review. Node v22.22.3, wrangler 4.135.0, Playwright Chromium. No command here talks to Cloudflare: every store is either in memory or `wrangler --local` (miniflare state under `tmp/`).

Binaries are called directly (`./node_modules/.bin/…`); `pnpm` is never run inside the copy. The `package.json` scripts with the same meaning are named in the second column.

## 1. Result table

| # | What | Script | Result | Log |
|---|---|---|---|---|
| 1 | Typecheck, platform | `tsc -p platform/tsconfig.json` | **0 errors** | — |
| 2 | Typecheck, Worker | `typecheck:runtime` | **0 errors** | — |
| 3 | Platform regression | `test:platform` | **275 passed, 0 failed** (slice1 72 · step4 47 · step41 35 · step5 32 · polish 4 · step52 12 · step6 29 · predemo 10 · predemo2 9 · ia150 15 · ia151 10) | `tmp/trackb-logs/test-platform-final.log` |
| 4 | 1.5.1 browser smoke | `scripts/template-platform-ia151-smoke.ts` (scratch outDir) | **65 / 65 passed** | `tmp/trackb-logs/ia151-smoke.log` |
| 5 | Publisher + runtime, in memory | `test:publish` | **59 passed, 0 failed** | `tmp/trackb-logs/test-publish-final.log` |
| 6 | Publish → local R2 → Worker → HTTP → browser, from a clean state | `test:publish:e2e` | **45 passed, 0 failed, 1 skipped** (the skipped check exists only in live mode) | `tmp/trackb-logs/e2e-final-clean.log`, `proof/local-e2e.json` |
| 7 | Dry-run determinism | `site:publish --dry-run`, twice | **byte-identical output**, zero store access | `tmp/trackb-logs/dry1.txt`, `dry2.txt` |
| 8 | Worker bundle | `wrangler deploy --dry-run` | builds; **7.49 KiB / gzip 2.74 KiB**, one binding (`env.SITES` → R2 `boost-sites-artifacts`); `--dry-run: exiting now`, nothing uploaded | — |
| 9 | Main tree untouched | `find … -newer <start marker>` | only Track A's own `docs/reports/integration/*` files are newer | §7 |

Correction, 2026-09-22: row 4 used to name `platform/test/ia151-smoke.ts`, a file that never existed; the smoke is `scripts/template-platform-ia151-smoke.ts` (as `01-151-validation.md` says). Every row of this table was re-run on the consolidated tree on 2026-09-22 with the same results: `docs/result/foundation-consolidation/04-final-local-verification.md`.

The numbers in row 3 were measured before the last edit of this pass. That edit touched only `platform/test/publish-e2e.test.ts`, which is not part of `test:platform`. Rows 1, 2, 5 and 6 were run again after it.

## 2. What `test:publish` proves (59 checks, no network, no wrangler)

The store is `MemoryStore`, which records every call and can inject a fault at any write position. The Worker is the real `handle()` from `workers/recon-runtime/src/index.ts`, called with an R2-shaped adapter over the same store.

Check names are quoted from the suite's own output. Unnamed checks are the first-generation ones; `P*`, `G*` and `R1` were added in this pass.

| Brief topic (§44 numbering) | Checks |
|---|---|
| 1–5. route resolver, root path, nested route, detail route, static asset | "15 paths resolve to the exact export file" · "11 paths are never served (.html spelled out, framework pages, trailing slash, seal)" · "every addressable package file: 200, stored content-type + cache-control, ETag, bytes identical" |
| 6. MIME (and cache policy) | "content types for every extension in the export; unknown extension → undefined" (`P13`, full table) · "immutable only for `_next/static/**` and names that ARE a prefix of their own sha256" |
| 7. real 404 | "unknown path → 404 with the package's 404.html bytes, no-store, no ETag; HEAD same status, no body" |
| 8. traversal rejection | "11 traversal / encoding tricks are bad requests" · `P8` adversarial paths (never 200 or 500; every key inside the package prefix, never the seal) · "resolvePath called directly" (double-encoded `%252e%252e` decodes exactly once) · `R1` a key over 1024 bytes is a miss, not a 500 |
| 9. invalid pointer | "corrupt routing pointer → 500, never another site" · `G6` a pointer naming another hostname is never overwritten |
| 10. missing package | `P10` valid pointer, no objects → 503 `package unavailable`, `no-store`, empty HEAD body |
| 11. pointer changes package selection · 12. old package remains addressable | `P9` · "rollback: re-points to previous (sealed) package with no upload; the left package becomes previous" |
| 13. dry-run produces zero writes | "dry run: no store call at all" · `P1` · `P2a`–`P2c` · `P3` · `P14` (CLI twice: byte-identical stdout, no state directory) |
| 14. publish does pointer last | "publish: all files, then seal, then pointer — pointer is the LAST write" · `P5`, `P5b` (`--no-activate`) |
| 15. failed upload does not activate | "injected upload failure" · "injected corruption → read-back verify fails" · "injected seal write failure / seal corruption" · "injected pointer corruption" · "invalid concurrency" — the live pointer is byte-identical afterwards in every case |
| 16. unknown hostname isolation | "unknown host → plain 404 (no fallback site); malformed request path → 400" · `P11` trailing-dot host |
| Beyond the list: HEAD, conditional GET, methods | "HEAD: headers + Content-Length, empty body; If-None-Match → 304 (strong, weak, list, *)" · "POST/PUT/DELETE/OPTIONS → 405 with Allow: GET, HEAD" |
| Beyond the list: package validation before any write | `P7a`–`P7f` (failed build, QA fail, invalid id, id mismatch, changed file, missing `index.html` / `404.html`) · "invalid inputs refused before any store access" · "expectPackageHash" |
| Beyond the list: immutability of published packages | "republish of a sealed package: immutable skip" · "a different seal already at this packageHash → refused" · `P6` `--reverify` · `G4` · "seal bytes are deterministic" · "published package directory … byte-identical before/after" |
| Beyond the list: immutable-cached paths keep their bytes across packages | `G1` · `G2` (fails closed when the live seal is missing or unreadable) |
| Beyond the list: stale-write and site-change guards | `P4`, `G5` (`--expect-live`, checked before any upload) · "hostname currently serving another site → refused unless allowSiteChange" · "sealed package re-pointed from another host" |
| Beyond the list: public origin | `G3` · `P14` "`--remote --dry-run` … refused while the package is built for another origin; `--allow-origin-mismatch` lets the plan through" |
| Beyond the list: logs and CLI safety | `P12` one JSON line on ≥ 400, no query string, R2 failure → 500 + `internal-error` · `P14` usage errors (7 rows, exit 2), including `--remote --dry-run --check-store` without `RECON_PUBLISH_ALLOW_REMOTE=1` |

The exact check-to-feature map for the newer flags is in `04-site-publish-design.md` (§ test coverage) and `05-recon-runtime-design.md`.

## 3. What `test:publish:e2e` proves (real wrangler, real workerd, real browser)

The run starts from a deleted state directory, publishes the demo package with the real CLI path into `wrangler --local` R2, starts `wrangler dev` on port 8788 and talks to it over HTTP.

Package under test: `boost-interior-demo`, packageHash `613cd9e00e73d8428efcb9afa4249bb353952994c0653568da59adc407890266`, buildInputId `aa71b829ec7046f223904d42d38d1fe58a7b3fc61a245d6d3f6a4112c710b171`, release `interior-01-1.5.1-6bbdd07eb9bf`, 156 files, 7,283,710 bytes.

| Area | Result |
|---|---|
| Publish | 156 of 156 files uploaded, 156 of 156 read back and verified (sha256 + size), seal written, then `routing/localhost.json` written last. 166 s with the serial local store (one wrangler process per object). |
| Republish | immutable skip, 0 uploads, pointer unchanged |
| Byte integrity | **154 of 154** URL-addressable files answer 200 with bytes identical to the package (7,250,640 bytes), the stored content-type and cache-control, an ETag and `nosniff`. The two files that no URL may address are checked separately: `404.html` is the 404 body, `_not-found.html` is compared inside R2. |
| 404 | unknown path, `.html` spelled out and trailing slash → **404** with the package's `404.html` bytes |
| Methods | HEAD → 200 + Content-Length, no body; If-None-Match → 304; POST / PUT / DELETE → 405 `Allow: GET, HEAD` |
| Isolation | unknown `Host` → plain 404; `127.0.0.1` (no pointer) → 404; nothing falls back to the demo site |
| Path security | traversal and encoded separators → 400 (or 404), never a non-site file |
| RSC sidecars | `$d$slug` names: literal `$` and `%24` serve the same object |
| SEO over HTTP | for `/`, `/portfolio`, a detail page and `/about`: title, description, canonical and JSON-LD counts and canonical hrefs **served == package**; exactly one `<title>` and a description each. `robots.txt` 200 with a `Sitemap:` line; `sitemap.xml` 200 and all 13 `<loc>` paths answer 200 |
| Browser, 390 px and 1440 px | 7 routes each (`/`, `/portfolio`, detail, `/3d-portfolio`, `/about`, `/contact`, a 404): 0 broken requests, 0 console errors, 0 external requests, 0 horizontal overflow, 0 broken images |
| Client navigation | `/` → `/portfolio` → detail → `/about` → back: one document load, 21 RSC `.txt` fetches, all 200, titles applied |
| Interaction | hamburger dialog (open, Esc, focus return, link navigates), desktop nav walk, gallery photo viewer at both widths (same-origin image 200, next, Esc), contact form at both widths (short message → `mailto:` hand-off, no success claim, no network request; too-long message → no hand-off, copy fallback shown) |
| JS disabled | 5 routes: 200, an `<h1>`, body text, header nav, images where expected |
| Source package | `data/site-builds/boost-interior-demo/packages/<id>` hashed before and after: identical (the publisher only reads) |
| Skipped | 1 check that only exists in live mode (`E2E_BASE=https://…`): "every canonical URL and every sitemap `<loc>` share BASE's origin" |

### Known content gap that the e2e pins (not a delivery defect)

The homepage of interior-01 ≤ 1.5.1 has **no `<link rel="canonical">`**, and no page has JSON-LD. The package's own `index.html` has 0 canonicals, because `templates/interior-01/v1/app/page.tsx` never calls `pageMetadata()` from `lib/seo.ts`; `/portfolio`, the detail pages and `/about` each have exactly one. The runtime serves exactly what the package holds, which is the contract (03 §7: no injected tags).

The e2e therefore asserts two separate things: the delivery invariant (served == package, strictly), and the package's canonical coverage as an exact expected list — `["/"]` for Template versions up to 1.5.1, `[]` afterwards. The gap can neither grow nor be fixed without the check changing. An earlier draft of the check demanded one canonical on every page and failed on `/`; the agent extending the suite declined to loosen it, and the orchestrator replaced it with the stricter pair above rather than weakening it. The fix itself belongs to the next Template release (see 00, deferred).

## 4. Dry run

```
./node_modules/.bin/tsx --tsconfig platform/tsconfig.json platform/cli/site-publish.ts \
  --site boost-interior-demo --host interior-demo.example --dry-run
```

Two runs produce byte-identical output (`cmp dry1.txt dry2.txt`). `publishedAt` prints as `<set at publish time>`. No store is built, no wrangler process starts, no state directory is created.

| Field | Value |
|---|---|
| files / bytes | 156 / 7,283,710 |
| objects planned | 158 (156 files + seal + pointer) |
| content types | html 15 · text/plain (RSC) 71 · javascript 16 · css 1 · jpeg 51 · svg 1 · xml 1 |
| cache policy | revalidate 87 · `_next/static` immutable 17 · content-addressed immutable 52 |
| baked origin | `https://boost-interior-demo.example` |
| warning | the package was built for that origin, not for `https://interior-demo.example` — fine locally, refused for `--remote` (live blocker L1) |

## 5. Observations on the local runtime (workerd)

- `text/html` responses are gzip-compressed when the client sends `Accept-Encoding`; the ETag stayed strong locally. Behaviour at the real edge (compression, weak ETags) is not verifiable locally and is a step of the live smoke.
- One JSON log line per response ≥ 400: `evt, host, path, method, status, outcome, siteId, packageHash, key`. The path has no query string and is capped at 256 characters. With `LOG_ALL=1` every response is logged.
- A stray `wrangler dev` from an earlier observation held `tmp/recon-runtime-e2e-state` for about 30 minutes and was not killed by `pkill -f`; it was killed by PID. The final e2e ran with no other wrangler process alive.

## 6. Failures seen on the way, and what was done

| Failure | Cause | Action |
|---|---|---|
| `publish.test.ts` type error after adding the `"uploaded"` result | test read `.pointer` without narrowing | narrowed by status |
| HEAD on a 503 carried a body | `plain()` error responses were returned as-is for HEAD | product fix in `end()`; covered by P9 |
| 3 checks failed after the immutable-path guard was made fail-closed | test helpers seeded a pointer without the live seal a real bucket would have | helpers now seed a realistic seal; G2 rewritten to expect refusal. No assertion was removed |
| e2e SEO check failed on `/` | package content gap, see §3 | check split into a strict delivery invariant and an exact known-gap list |

## 7. Main tree untouched

A marker file was created when Track B started. At the end:

```
cd /Users/woops/projects/web-recon
find . -newer <marker> -type f -not -path "./node_modules/*" -not -path "./.git/*"
```

lists only six files, all under `docs/reports/integration/` — Track A's own output, written by Track A. No file of this track was written into the main tree in this session, nothing was merged, cherry-picked, stashed, reset or checked out there, and `git -C /Users/woops/projects/web-recon rev-parse HEAD` is still `6c2e723`.

Caveat, stated for honesty: an **earlier** Track B session had already written 1.5.1 and a first publish/runtime draft into the main tree before this isolated copy existed. Those files were left exactly as found (not reverted, not updated). The copy is the only place that holds the final code.

## 8. Not verifiable locally

A real R2 bucket, a deployed Worker, a custom hostname next to existing routes, edge compression and ETag weakening, `wrangler r2 object get --remote` error text for a missing key, real mail clients with a long `mailto:`, screen-reader output. All are steps of `07-live-deploy-plan.md`.
