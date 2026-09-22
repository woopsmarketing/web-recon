# 00 — Track B summary: interior-01 1.5.1 + Static Deployment Foundation

Date: 2026-09-21. Mode: implementation allowed, live deployment not allowed.

**Result: the foundation is built and passes locally. Nothing was deployed, nothing was committed, and Track A was not touched.**

> **Update, 2026-09-22 — foundation consolidation.** This summary describes the state at the end of the Track B session (2026-09-21) and is kept as written. What changed afterwards is listed in **§13** at the end: the copy became the single authoritative worktree, Track A's final documents were imported, the `.gitignore` rules were applied, and every number in §4 was re-measured (all unchanged).

```
Site Data → site:build → immutable static package → site:publish → R2 → recon-runtime → browser
                         (unchanged)                 (new)               (new)
```

## 1. Where the work lives

| Item | Value |
|---|---|
| Starting commit | `6c2e723601a0d76431c96a48bbdb4726c02063e7` (`main`, "0827 morning") |
| Isolation | Full isolated copy **`/Users/woops/projects/web-recon-track-b`** (APFS clone, own `.git`), branch **`track-b/static-deployment-foundation`**, created only inside the copy |
| Why a copy and not `git worktree` | HEAD holds almost none of the project: `platform/`, `templates/`, `data/` and most of `src/` are untracked. A worktree of HEAD would have been empty of the code this task changes. |
| Main tree `/Users/woops/projects/web-recon` | Read only in this session. Since the start marker only Track A's own `docs/reports/integration/*` files changed there (06 §7). |
| Commits | **None.** Not authorised. Plan in `09-git-checkpoint.md`. |

Caveat: an earlier Track B session wrote 1.5.1 and a first draft of the publisher and runtime into the main tree before the copy existed. Those files were left exactly as found. The copy holds the only final code. Bringing it back into the main tree is a user decision (§8).

## 2. Goal A — interior-01 1.5.1

| Item | Value |
|---|---|
| Release | **`interior-01-1.5.1-6bbdd07eb9bf`** |
| Release hash | `6bbdd07eb9bf07aef7f9d975f4a0fce977820874246bc4403cc8af5d89425d02` |
| Scope | 7 Template files: long-`mailto:` guard with a copy fallback, CRLF line endings, status re-announcement on repeated submit, mobile-menu focus target after a resize, `/contact` unlisted when a site has no contact channel |
| 1.5.0 | untouched; every earlier release re-hashed identical (62 of 62 files; the reviewer reproduced both release hashes) |
| Demo build | buildInputId **`aa71b829ec7046f223904d42d38d1fe58a7b3fc61a245d6d3f6a4112c710b171`** |
| Demo packageHash | **`613cd9e00e73d8428efcb9afa4249bb353952994c0653568da59adc407890266`** (156 files, 7,283,710 bytes) |
| Rollback | `previous` = the 1.5.0 package `6c74d34c…` |
| Contracts | ProjectSchema, ProjectFilter, SiteSnapshot, `buildSiteSnapshot`, ContentReader, settings schema: **byte-identical** between the 1.5.0 and 1.5.1 snapshots. `TRACK_A_CONTRACT_RELEVANT_CHANGE_REQUIRED` was never raised. |

Details: `01-151-validation.md` (with the §8 addendum that corrects two stale statements).

## 3. Goal B — Static Deployment Foundation

| Piece | State |
|---|---|
| Package reality | Measured, not assumed: `02-current-package-reality.md`. The package format was **not** redesigned. |
| Delivery contract | `03-static-delivery-contract.md`. R2 keys `sites/<siteId>/packages/<packageHash>/<path>`, seal `_package.json` written after the files, pointer `routing/<hostname>.json` written **last**. Site-neutral: it names no BoostChat concept. |
| `site:publish` | Implemented: `platform/cli/site-publish.ts`, `platform/publish/{publish,store,wrangler-store,media}.ts`. Validate → upload → read-back verify (sha256 + size) → seal → pointer (read back). Sealed package = immutable skip. Rollback = pointer swap. `04-site-publish-design.md`. |
| Dry run | Mandatory mode works: deterministic, byte-identical across runs, zero store access; `--check-store` adds read-only checks. 156 files → 158 planned objects. |
| `recon-runtime` | Implemented: `workers/recon-runtime/src/{index,paths,contract}.ts`, 7.49 KiB bundle. host → pointer → path → R2. Real 404 with the package's own page, stored MIME and cache headers, ETag → 304, HEAD, 405, fail-closed statuses, one JSON log line per failure, no Cache API, no redirects, no body rewriting. `05-recon-runtime-design.md`. |
| Remote safety | Any `--remote` run that reaches the bucket (reads included) needs `RECON_PUBLISH_ALLOW_REMOTE=1`. `--remote` refuses a package built for another origin. No secret is read, printed or stored by this code. |
| Live plan | `07-live-deploy-plan.md`: 11 steps with the real commands, token scopes, rollback drill, risks. **Not executed.** |

## 4. Tests (final code; details in `06-local-validation.md`)

| Suite | Result |
|---|---|
| Typecheck platform / Worker | 0 errors / 0 errors |
| `test:platform` | **275 passed, 0 failed** |
| 1.5.1 browser smoke | **65 / 65** |
| `test:publish` (in-memory store, real Worker handler, fault injection) | **59 passed, 0 failed** |
| `test:publish:e2e` (clean state: real wrangler local R2, workerd, Chromium) | **45 passed, 0 failed, 1 skipped** (live-mode-only check) |
| Byte integrity through the Worker | **154 of 154** addressable files identical to the package |
| Dry-run determinism | two runs byte-identical |

## 5. Independent review

Fresh-context reviewer on the strong model, read-only, not told the expected outcome. **BLOCKER 0 · MAJOR 4 · MINOR 12 · NOTE 9.** After disposition: no open BLOCKER or MAJOR in the delivery code. It ran fault injection at all 146 write positions (the live pointer never moved) and 41 hostile paths (never a 200 outside the package). Two real delivery defects were found and fixed: over-long keys answered 500 (R1), and the immutable-path guard failed open (R2). `08-independent-review.md`.

## 6. Live deployment performed? **NO**

No bucket, Worker deploy, route, custom domain, DNS record, live R2 write or live pointer write. No command was run with `--remote` against Cloudflare. `wrangler deploy` was only ever run with `--dry-run`. Note: this machine has a wrangler OAuth login on disk; that is why remote reads are gated too.

### Blockers for a live run (07 §1)

| # | Blocker | Owner |
|---|---|---|
| L1 | The demo package is baked for `https://boost-interior-demo.example` (canonicals, sitemap, robots). `--remote` refuses it for any other host. Fix = set `publicOrigin` in Site Data and rebuild; `ia151` check D1 then needs generalising. | Operator |
| L2 | Pilot hostname and attachment form. The brief's example sits in a zone with a wildcard Worker route. A Worker on a Custom Domain is treated as an origin, so that route's Worker would run first. Use the exact-route form there, with the zone owner's sign-off. | User + zone owner |
| L3 | Scoped Cloudflare API token (scopes listed in 07 §2) | User |
| L4 | Explicit authorisation for bucket creation, Worker deploy, hostname, R2 writes, pointer write | User |
| L5 | Indexing decision: the demo is a fictional business with AI-generated photos and ships `Allow: /` | User |

## 7. Deferred

| Item | Why deferred |
|---|---|
| R3 (MAJOR, Template UX): the Korean message budget is about 165 characters, below the stated 500 cap. The visitor gets the honest copy fallback. | Needs a new immutable release (1.5.2). Out of a bounded 1.5.1. |
| R10: `/contact` on a site without a channel is unlisted but still indexable. R14: the focus helper ignores `visibility:hidden` (latent). | Same 1.5.2 decision. |
| Homepage has no canonical; no page has JSON-LD or OG tags. | Template content gap found by the e2e, pinned there as an exact known list. The runtime must not inject tags. |
| `Range` requests (video) | No package has video. The publisher warns if one does. |
| Conditional pointer write (compare-and-swap) | `wrangler r2 object put` has none. `--expect-live` narrows the race; one publisher at a time for the pilot. |
| `.wrangler/` in `.gitignore`, and the other ignore rules | `.gitignore` is a shared tracked file; listed as precondition in 09. |
| R15: three `ia151` checks are pinned to 1.5.1 | The next release generalises them, as every cut has. |

## 8. Git checkpoint

**GIT_CHECKPOINT_READY = YES-WITH-PRECONDITIONS** (`09-git-checkpoint.md`). Nothing was committed, cleaned or deleted. Recommended: branch `track-b/static-deployment-foundation`, the 9-commit sequence of 09 §4, first the four additive `.gitignore` rules. One UNKNOWN group needs a human look (`references/boost-interior/generated-approved/`, 47 MB). No secret risk found. Do not merge or cherry-pick between the Track A and Track B lines until the user decides how to reconcile the copy with the main tree.

## 9. Track A non-conflict confirmation

- `docs/reports/integration/**` was never opened for writing. All Track B reports are under `docs/result/static-deployment-foundation/`.
- No integration manifest, portfolio index, `portfolio.search`, resource or vocabulary contract, consumer contract, widget, BoostChat setting or Site Platform API was designed or built. The reviewer found zero integration terms in the delta.
- No `boostChatKey`, `integrationManifest`, `portfolioSource`, `chatbot`, `widget` or `externalIntegration` field exists in settings, schema or Site Data.
- The runtime has no `/_integration/*` rule. It reserves exactly four literals: `index.html`, the `.html` suffix, the root `_package.json`, and `404` / `_not-found`.
- Track A finished during this session with a V0 contract candidate that puts a static manifest and a portfolio document in the same package. That fits this runtime with no change: they are ordinary static files.

## 10. INFORMATION TRACK A MAY CARE ABOUT AFTER IT FINISHES

Handoff note only. No Track A document was edited.

1. **Same origin.** Every file of a package is served from the site's own hostname. A file at `site/<dir>/<name>.json` is public at `https://<host>/<dir>/<name>.json`. There is no second origin, no CORS header and no redirect. A same-origin `fetch()` needs nothing. A cross-origin browser `fetch()` would be blocked, because the runtime sends no `Access-Control-Allow-Origin`; a server-side reader is not affected.
2. **JSON MIME.** `.json` → `application/json`, `.webmanifest` → `application/manifest+json`, `.map` → `application/json`, `.txt` → `text/plain; charset=utf-8`, `.xml` → `application/xml`. `X-Content-Type-Options: nosniff` is always set.
3. **Any static file with a known extension is served as it is**, at its literal path and byte-identical. The runtime special-cases no directory. Underscore-prefixed directory names work (`_next/` does today). Nothing in the resolver or the publisher rejects a dot-prefixed directory such as `.well-known/`, but no test covers one.
4. **Path restrictions.** A file with **no extension or an unknown extension fails the publish** (the MIME table is closed; extending it is one line in `platform/publish/media.ts`). An extensionless URL always means `<path>.html`. `.html` URLs, trailing slashes, `…/index`, `/404`, `/_not-found` and the root `/_package.json` answer 404. `%2F`, `%5C`, backslash, dot segments and control characters answer 400. The full R2 key (`sites/<siteId>/packages/<64-hex>/<path>`) must stay ≤ 1024 bytes, so keep paths short and ASCII where possible: a Korean character costs 3 bytes.
5. **Caching.** A JSON file is served `public, max-age=0, must-revalidate` with a strong ETag, so clients revalidate and get 304. It becomes `immutable` for a year only if its file name is a 16–64 hex prefix of its own sha256. A stable, human-readable name therefore always shows the current package's content on the next request after activation. Do not give an integration file a hash-looking name unless that is intended.
6. **Identity and publication.** `packageHash` is the sha256 over path + bytes of the whole `site/` tree. Any change to any file, integration JSON included, yields a new `packageHash` and a new immutable R2 prefix. A site goes live by one pointer write (`routing/<hostname>.json`), written last; rollback is the same write in reverse. All files of a package switch **together**: a manifest and the HTML it describes can never be from different builds. `buildInputId` identifies inputs; `packageHash` identifies bytes. The pointer JSON is not reachable from any URL, so the live `packageHash` is not publicly discoverable unless a file inside the package states it.
7. **Build-time origin.** `publicOrigin` is baked into the package at build time (canonicals, sitemap, robots). `site:publish --remote` refuses a package whose baked origin differs from the target host. Absolute URLs inside an integration file would follow the same rule; relative URLs avoid the issue.
8. **Compression, local observation only.** workerd gzip-compressed `text/html` when the client accepted it, and the ETag stayed strong. Edge behaviour (compression of `application/json`, weak ETags) is unverified until the live smoke.
9. **Not-found behaviour.** A missing file answers a real **404** with the site's HTML 404 page (`text/html`, `no-store`), never 200 and never JSON. A consumer must check the status, not parse the body.
10. **Methods.** GET and HEAD only; everything else is 405. There is no query-string behaviour: the query is ignored for routing and never logged.

## 11. REQUIRED FINAL MATRIX

```
TRACK_B_START_COMMIT = 6c2e723601a0d76431c96a48bbdb4726c02063e7
TRACK_B_ISOLATED_WORKTREE = YES  (full isolated copy /Users/woops/projects/web-recon-track-b, branch track-b/static-deployment-foundation; an EARLIER session had written into the main tree before the copy existed — left untouched)

INTERIOR_151_READY = YES  (R3/R10/R14 deferred to a 1.5.2 decision; demo safety unaffected)
INTERIOR_151_RELEASE_ID = interior-01-1.5.1-6bbdd07eb9bf
INTERIOR_151_RELEASE_HASH = 6bbdd07eb9bf07aef7f9d975f4a0fce977820874246bc4403cc8af5d89425d02

DEMO_BUILD_READY = YES  (locally; for a public host it must be rebuilt with the real publicOrigin — L1)
DEMO_BUILD_ID = aa71b829ec7046f223904d42d38d1fe58a7b3fc61a245d6d3f6a4112c710b171
DEMO_PACKAGE_HASH = 613cd9e00e73d8428efcb9afa4249bb353952994c0653568da59adc407890266

GIT_CHECKPOINT_READY = YES-WITH-PRECONDITIONS  (nothing committed; 09-git-checkpoint.md)

STATIC_PACKAGE_FORMAT_CONFIRMED = YES  (unchanged)
STATIC_DELIVERY_CONTRACT_READY = YES

SITE_PUBLISH_IMPLEMENTED = YES
SITE_PUBLISH_DRY_RUN_PASS = YES  (deterministic, zero store access)

RECON_RUNTIME_IMPLEMENTED = YES
RECON_RUNTIME_LOCAL_PASS = YES  (unit 59/0; e2e 45/0, 1 live-only skip)

REAL_404_PASS = YES
MIME_PASS = YES
PATH_SECURITY_PASS = YES
PACKAGE_IMMUTABILITY_PASS = YES

R2_BUCKET_REQUIRED = YES  (one new private bucket: boost-sites-artifacts)
R2_BUCKET_CREATED = NO

LIVE_WORKER_DEPLOYED = NO
LIVE_ROUTE_CHANGED = NO
LIVE_POINTER_CHANGED = NO

SUPABASE_REQUIRED = NO
RAILWAY_REQUIRED = NO
BOOSTWEB_CHANGE_REQUIRED = NO  (code: none. If the pilot hostname is inside the boostweb zone, the zone owner must agree to one new exact route + DNS record — L2)
SITE_FACTORY_CHANGE_REQUIRED = NO

BOOSTCHAT_INTEGRATION_IMPLEMENTED = NO
INTEGRATION_MANIFEST_IMPLEMENTED = NO
PORTFOLIO_INDEX_IMPLEMENTED = NO

TRACK_A_FILES_MODIFIED = NO
TRACK_A_CONTRACT_ASSUMPTIONS_PREEMPTED = NO

BLOCKERS_FOR_LIVE_DEPLOY = L1 package baked for the .example origin (set publicOrigin, rebuild) · L2 pilot hostname + attachment form (+ zone owner sign-off) · L3 scoped API token · L4 explicit user authorisation · L5 indexing decision for a fictional demo
RECOMMENDED_LIVE_DEPLOY_SEQUENCE = 0 local gates on the rebuilt package + offline `--remote --dry-run` → 1 `wrangler whoami` with the scoped token → 2 create private bucket `boost-sites-artifacts` → 3 `wrangler deploy --env pilot` (no hostname yet) → 4 attach the exact pilot hostname → 5 `site:publish --remote --dry-run --check-store`, then `--remote --no-activate --expect-package <A>` (upload + verify + seal, pointer untouched) → 6 `--remote --no-activate --reverify` (every object read back) → 7 activate: `--remote --expect-package <A> --expect-live none` (pointer written last) → 8 HTTP smoke → 9 browser smoke (`E2E_BASE=https://<host>`) → 10 SEO smoke → 11 rollback drill. Exact commands: 07-live-deploy-plan.md §3.
```

## 12. Report set

`00-summary.md` · `01-151-validation.md` · `02-current-package-reality.md` · `03-static-delivery-contract.md` · `04-site-publish-design.md` · `05-recon-runtime-design.md` · `06-local-validation.md` · `07-live-deploy-plan.md` · `08-independent-review.md` · `09-git-checkpoint.md` · `proof/local-e2e.json` · `proof-151/` · `_session1/` (the earlier session's superseded drafts, kept) · `00-requirement-track-b-v2.txt` (the brief).

```
WEB_RECON_TRACK_B_STATIC_DEPLOYMENT_FOUNDATION_COMPLETE
LIVE_DEPLOYMENT_NOT_PERFORMED
BOOSTCHAT_INTEGRATION_NOT_IMPLEMENTED
TRACK_A_NOT_MODIFIED
```

## 13. Addendum — foundation consolidation (2026-09-22)

Written by the consolidation task, not by the Track B session. Sections 1–12 above are unchanged except for the pointer under the result line. Full reports: `docs/result/foundation-consolidation/00–05`.

### 13.1 Timeline

| When | What | Outcome |
|---|---|---|
| 2026-09-21 ≈17:20–18:20 | Track B session 1, in the main tree: 1.5.1 cut, first publisher / runtime draft, **first independent review** | 1.5.1 PASS; `test:platform` 272 / 3 (3 external failures). First review: **BLOCKER 1** (B1: a non-numeric `--concurrency` sealed and routed an empty package) · MAJOR 0 · MINOR 6 · NIT 4. Reports now under `_session1/`, unedited |
| 2026-09-21 20:55–22:12 | Track B session 2, in this copy: B1 fixed (`site-publish.ts:70-72`, `publish.ts:315, 429-430, 484`, unit check "… (review B1)"), final publisher / runtime, unit + e2e suites, **second independent review** by a new reviewer on the final code | Second review: **BLOCKER 0 · MAJOR 4 · MINOR 12 · NOTE 9** (§5); R1, R2 (delivery defects) fixed, R3 / R10 / R14 deferred to 1.5.2; 275 / 0, 59 / 0, 45 / 0 / 1 skipped |
| 2026-09-22 | Consolidation: Track A documents imported, `.gitignore` applied, full re-run on the one tree | Every number below re-measured, **none changed** |

### 13.2 Numbers re-measured on 2026-09-22 (the run's own output is the source, not this report)

| Item | §4 (2026-09-21) | Re-run (2026-09-22) |
|---|---|---|
| Typecheck root / platform / Worker | — / 0 / 0 | 0 / 0 / 0 errors |
| `test:platform` | 275 / 0 | **275 / 0** (72 · 47 · 35 · 32 · 4 · 12 · 29 · 10 · 9 · 15 · 10) |
| 1.5.1 browser smoke | 65 / 65 | **65 / 65** |
| `test:publish` | 59 / 0 | **59 / 0** |
| `test:publish:e2e`, clean state | 45 / 0 / 1 skipped | **45 / 0 / 1 skipped** |
| Byte integrity through the Worker | 154 of 154 | **154 of 154** (upload and read-back 156 / 156) |
| Dry-run determinism | byte-identical | byte-identical |
| Worker bundle | 7.49 KiB | **7.49 KiB / gzip 2.74 KiB** (default and `--env pilot`) |
| Release / buildInputId / packageHash | as §2 | recomputed from the bytes on disk: all three **match**; all 11 releases verify |

Review finding counts were recounted from the tables of `08-independent-review.md`: 4 MAJOR (R1–R4), 12 MINOR (R5–R16), 9 NOTE (N1–N9), 0 BLOCKER; deferred = R3 + R10 + R14. They agree with §5 and with 08's own header.

### 13.3 Statements above whose status has changed

| Where | Statement | Now |
|---|---|---|
| §1 caveat, §8 last sentence | reconciling the copy with the main tree is an open user decision | **Decided by the consolidation task:** this copy is the authoritative worktree. The main tree keeps the raw crawl archive and the stale first draft; nothing was copied from that draft. Both roots carry `AUTHORITATIVE_WORKTREE.md`. |
| §1 "Main tree … only Track A's files changed there", §9 | Track A's documents live only in the main tree | Track A's final `docs/reports/integration/00–06` (7 files) are now in this tree, sha256-identical to the main tree, unmodified. `TRACK_A_NOT_MODIFIED` still holds. |
| §7 row "`.wrangler/` in `.gitignore`, and the other ignore rules", §8 "first the four additive `.gitignore` rules", 08 R12 | recommended, not applied | **Applied** and verified with `git check-ignore` and `git add -n` (canonical data 3,469 / 3,469 files visible, 2,135 screenshots excluded). Still nothing staged or committed. |
| 06 §1 row 4 | smoke script `platform/test/ia151-smoke.ts` | That path never existed; corrected to `scripts/template-platform-ia151-smoke.ts`. |

Unchanged: no live deployment, no commit, no BoostChat integration, live blockers L1–L5, the §7 deferred list (classified in `foundation-consolidation/05-known-next-items.md`).
