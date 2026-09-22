# 05 — Independent review (fresh context, read-only)

Date: 2026-09-21. Scope: interior-01 1.5.1 patch release, `site:publish` (platform/publish + CLI), `workers/recon-runtime`, reports 01–04 + git-checkpoint.
Nothing in source, data, or tests was modified. Scratch scripts live in `/private/tmp/claude-501/rv/`. No `--remote`, deploy, login, or cloud resource was used.

**Counts: BLOCKER 1 · MAJOR 0 · MINOR 6 · NIT 4**

---

## BLOCKER

### B1. A non-numeric `--concurrency` seals and routes an EMPTY package, and the seal then makes the damage permanent
- `platform/cli/site-publish.ts:72`: `concurrency: flag("--concurrency") ? Number(flag("--concurrency")) : undefined`. `--concurrency abc` (or `4x`, `four`) gives `NaN`.
- `platform/publish/publish.ts:266`: `Math.min(NaN, store.maxConcurrency ?? Infinity)` = `NaN`.
- `platform/publish/publish.ts:243`: `Math.max(1, Math.min(NaN, n))` = `NaN`, and `Array.from({ length: NaN })` has 0 elements, so **no worker runs**. Both the upload pool and the verify pool finish at once without an error.
- `publish.ts:295-316`: nothing checks `uploaded === files.length` or `verified === files.length`. The seal is written, read back and "verified", and then the routing pointer is switched.
- **Reproduced** with `MemoryStore` against the real current demo package (`/private/tmp/claude-501/rv/nan.ts`). The log shows `verified 0/156`, then `sealed …/_package.json`, then `routing/x.example.com.json → 613cd9e0…`. The store holds exactly 2 objects: the seal and the pointer. Result: `published`, `uploaded 0`, `pointerWrite written`.
- **Scenario:** during the live run, an operator typo in `--concurrency` makes the hostname serve plain `404 not found` for every URL, because the package prefix holds no 404.html. Every later publish of the same package hits the "seal present and identical → immutable skip" path (`publish.ts:275-280`), so a re-run cannot repair it. Recovery needs a manual R2 delete of the seal. The core invariant "the pointer only ever points at a fully uploaded, verified, sealed package" is broken.
- **Fix, both parts:**
  1. The CLI rejects anything that is not a positive integer (`/^[1-9]\d*$/`). `publishSite` normalises `concurrency` to `Number.isInteger(c) && c >= 1 ? c : 4`.
  2. Defence in depth before the seal: `if (uploaded !== plan.files.length || verified !== plan.files.length) throw`.

  Add a unit test with `concurrency: NaN`.

## MAJOR

None found.

## MINOR

### m1. Pointer read-back failure after a successful PUT is reported as "pointer untouched"
`publish.ts:339-344` / `site-publish.ts:76`. If `store.put(routingKey)` succeeds and the following `store.get` throws (network or wrangler error on remote), the pointer **has** switched, but the CLI prints `FAILED (routing pointer untouched unless stated above)` and nothing was stated above. The switch is logged only after the verified read-back (`publish.ts:317`). The same applies to rollback (`site-publish.ts:54`: "routing pointer untouched").

Fix: log `writing pointer …` before the PUT, and in the error path say "pointer state unknown — inspect routing/<host>.json".

### m2. Pointer update is read-modify-write without a condition (concurrent publishes)
`publish.ts:304-316`. Two concurrent `site:publish` / `--rollback` runs for the same host can interleave:
- The last writer wins.
- `previous` can name a package that was never live.
- The `allowSiteChange` guard can be bypassed: A reads site X, B writes site Y, A writes over Y.

The report documents the build/publish race (`--expect-package`), but not the publish/publish race. R2 supports conditional PUT (`onlyIf` etag) through the S3/Workers API, but not through `wrangler r2 object put`.

Fix: add a per-host local lock (as `site:build` has) and document that only one operator publishes at a time. Longer term, move to a conditional PUT when the store moves to the S3 API.

### m3. Immutable skip trusts the seal without checking that the objects exist
`publish.ts:275-280`. The report states this ("A seal that matches is trusted"). But combined with B1, or with any manual/lifecycle deletion under a prefix, the skip re-points a host at a sealed but incomplete package.

Fix: on skip, do at least a cheap existence check (HEAD or GET of `404.html` + `index.html`), or add a `--reverify` option.

### m4. No `Range` support in the Worker
`workers/recon-runtime/src/index.ts:89-96`. `Range` is ignored: always 200 with the full body, and no `Accept-Ranges`. `media.ts` declares `mp4`/`webm`, and Safari/iOS will not play `<video>` whose server does not answer byte-range requests with 206. The demo has no video today (156 files: html/txt/js/css/jpg/svg/xml), so this is latent.

Fix: either pass `range: request.headers` to `R2.get` and answer 206 with `Content-Range`, or remove mp4/webm from `CONTENT_TYPES` so that a video package fails closed at publish time.

### m5. `/contact` on a site without a channel is still indexable and self-canonical
Verified on `fixture-empty`. The sitemap has 3 locs without /contact, and no page links to /contact. But `contact.html` still carries `<link rel="canonical" href="https://fixture-empty.example/contact"/>` and no `robots noindex`. Report 01 §6.1 lists this openly as a limitation.

Fix: a Template-only change, `robots: { index: false }` in `app/contact/page.tsx` metadata when `contactEmail(ctx)` is empty.

### m6. The Worker does not require the seal
`contract.ts:7-8` says "a package exists only if its seal does", but `index.ts` serves whatever `packageHash` a syntactically valid pointer names. It never checks `_package.json`. Safe today only because the publisher writes pointers after seals (and see B1: a seal is not proof of completeness either).

Fix: either reword the contract comment to say the publisher enforces this invariant and the runtime does not, or check the seal once per pointer (this costs a read per request unless memoised).

## NIT

- **n1.** Report 03 says a literal `\` gives 400 (`paths.ts:31`). In fact WHATWG URL parsing converts `\` to `/` for https URLs before `resolvePath` runs, so `/a\b` is served as `/a/b` → 404 (verified). The `includes("\\")` branch is unreachable from a real `Request`. Harmless, but the claim is inaccurate.
- **n2.** A trailing-dot FQDN Host (`site.example.`) returns `404 unknown host` because `HOSTNAME_RE` rejects it (`index.ts:78`). Some clients send it. Consider stripping one trailing dot.
- **n3.** `platform/test/publish-surface.ts`: `isPublishSurface` excludes **everything** under `platform/publish/` from the "platform implementation unchanged" fingerprints (step6 D/D2, ia150 R3). This is justified today, because the directory only reads finished packages. But a future build-affecting file placed there would evade those gates silently. Consider an explicit file list.
- **n4.** `site-publish.ts:22-28`: `--bucket`, `--persist-to` and `--expect-package` values are not validated. For example, a bucket starting with `-` is passed through to wrangler argv. This is operator input and argv only (no shell), so it cannot be injected. Cosmetic.

---

## Verified

**Release immutability.** All 11 `data/template-releases/interior-01/*` dirs re-hashed against their own `release.json`: 0 mismatches and 0 extra files. No file in an earlier release is newer than the 1.5.0 manifest. Script: `vr.mjs`.

**1.5.1 diff and live source.**
- 1.5.1 differs from 1.5.0 in exactly 7 Template files: `app/sitemap.ts`, `components/InquiryForm.tsx`, `components/MobileMenu.tsx`, `sections/ContactPage.tsx`, `sections/links.ts`, `styles/template.css`, `template.ts`.
- The live `templates/interior-01/v1` equals the 1.5.1 release, apart from `provenance.json`.
- The brief names `lib/links.ts`; the actual path is `sections/links.ts`.

**1.5.1 UX in Chromium** (Playwright, 390 and 1440 px, on the built demo package `aa71b829…/site` served through the Worker's own `resolvePath`; script: `ux.ts`):
- The message is capped at 500 (typing 600 gives 500), and the other fields at 100.
- A 500-character Korean message produces:
  - no `href`, and no mailto navigation;
  - the `tooLong` status, with no success wording;
  - the fallback with the address and a read-only textarea (549 characters);
  - 0 px horizontal overflow.
- Five fields × 100 Korean characters + a short message also triggers the fallback (no link over 2,000 characters).
- A short multi-line message hands off. The body contains `%0D%0A` only, and the fallback disappears.
- The status `<span>` is a new node on every press, and the old node is disconnected.
- A 500-character ASCII message gives a 802-character href, which is handed off.
- Mobile menu:
  - At 600 px, opening the menu and resizing to 1200 closes the dialog. Focus goes to `a.i1-header__brand` (rendered), not body. Tab then moves to the next header link. No `inert` is left behind.
  - Esc at 600 px returns focus to `button.i1-header__menu`.
- The DOM `value` of the fallback textarea shows LF, because textarea API values normalise newlines. This is expected; the mailto body is CRLF.

**Sitemap / links (m4 intent).**
- The demo sitemap lists /contact.
- The `fixture-empty` sitemap lists `/`, `/3d-portfolio`, `/about` and no /contact, and no `href="/contact"` appears in its HTML.
- `fixture-small` and `fixture-large` (both with an email) list /contact.

**Test edits (no genuine assertion weakened, in my reading).**
- `step4` T: now uses `sitemapIaPaths`, which is still an exact equality per fixture, plus existence of every listed page.
- `ia150` R2/P1: point-in-time gates on the pin = 1.5.0. This is consistent with the existing pattern, and ia151 carries the equivalent checks.
- `slice1` legacy-import scan: now resolves relative specifiers. It still catches `../../src/…`, is more precise, and allows `workers/…`.
- `step6` D/D2 and `ia150` R3: exclude the publish surface only (see n3).

**Suites.**
- `pnpm test:publish`: 27 passed / 0 failed, exit 0.
- `pnpm typecheck:runtime`: exit 0.
- `pnpm typecheck:platform`: exit 0.
- `pnpm test:platform`: exit 0, 275 passed / 0 failed. The 11 suites: slice1 72, step4 47, step41 35, step5 32, polish 4, step52 12, step6 29, predemo 10, predemo2 9, ia150 15, ia151 10. The 3 failures that report 01 called external are now resolved by the publish-surface edits.

**Worker threat model** (handler over a fake R2 that logs requested keys; script: `adv.ts`):
- Every one of 17 adversarial paths either returned 400/404 or read a key **inside** `sites/<siteId>/packages/<packageHash>/`. The paths covered:
  - `%2e%2e`, `..%2f`, `%252e%252e`
  - `%00`, `%5c`, `\`, `//`, `/..;/`
  - overlong UTF-8 `%C0%AE`, malformed `%E0%A4%A`
  - `/_package.json`, `/%5Fpackage.json`
  - `/routing/<host>.json`, `/a/../../../x.js`
- R2 keys are flat, so no request can reach another site's package, the seal, or a routing pointer.
- Hosts:
  - An unknown host gives 404 with no fallback site.
  - An uppercase Host is normalised by URL.
  - A port is ignored (hostname only).
  - A pointer whose `hostname` ≠ Host gives 500.
  - Pointer fields are regex-validated before key construction.
- Methods and caching:
  - Only GET/HEAD are allowed; everything else gets 405 + `Allow`.
  - 304 keeps ETag, Cache-Control and Content-Type, and drops Content-Length.
  - A 404 carries `no-store` and no ETag.
  - Errors return fixed text (no leakage).
  - No Cache API is used, so there is no shared-cache poisoning surface.
  - No redirects, no body rewriting, no canonicals, no external fetches.

**Cache policy.**
- `_next/static/**` is immutable.
- `_next/static/<buildId>/` uses `buildId = buildInputId` prefix (`next.config.mjs:16`, `RECON_BUILD_ID`), so manifests are not reused across builds. Checked across all 8 local packages: 44 distinct `_next/static` paths, 0 same-path/different-content collisions.
- Content-addressed assets are verified per file (stem is a prefix of the file's own sha256).

**Publisher.**
- Validation order and the `packageIntact` double check are as documented.
- Uploads re-read files from disk, and verification compares them with the planned sha, so a local change between plan and upload is caught.
- Seal bytes are deterministic.
- `wrangler-store` uses argv without a shell and a private `mkdtemp` directory. The remote mode needs both `allowRemote` and `RECON_PUBLISH_ALLOW_REMOTE=1`, and that also covers `--rollback`.

**Config.** `wrangler.jsonc` has `workers_dev: false` and `preview_urls: false`, no routes at the top level, and the `env.pilot` route commented out. `r2_buckets` is re-declared in the env, because it is not inherited.

**Report 02/03 claims vs code.** They match, except B1 (the "each failure row has a unit test" statement does not cover concurrency) and n1.

## Not verified

- `pnpm test:publish:e2e` was not re-run. I relied on `proof/local-e2e.json`: 25/0, 154/154 bytes, and the run ids match the current package `613cd9e0…`.
- Real Cloudflare behaviour, none of which was exercised:
  - `Content-Length` with a streamed R2 body;
  - automatic compression changing ETags to weak (the weak comparison handles that);
  - HEAD on a custom domain;
  - wrangler **remote** error text for a missing key. The store maps only `/specified key does not exist/` to null, and remote wording is untested. A mismatch would fail closed on the first remote publish.
- Real mail clients (Outlook/Windows, iOS Mail) with a ~2,000-character mailto link.
- Screen-reader announcement of the re-created `role=status` child. DOM mechanics were verified; actual AT output was not.
- The accuracy of git-checkpoint.md sizes and counts (only skimmed; out of the review's security/correctness focus).
- Version-skew behaviour after a re-point (documented as a risk in 04, not tested).

---

## Orchestrator follow-up (after the review, 2026-09-21)

| Finding | Action | Evidence |
|---|---|---|
| **B1** `--concurrency abc` → 0 uploads → sealed + pointer switched | **FIXED**. (1) CLI accepts only `^[1-9]\d*$`, else exit 2 before any store access (`platform/cli/site-publish.ts` `concurrencyFlag`). (2) `publishSite` rejects non-positive-integer concurrency (`platform/publish/publish.ts`). (3) `pool()` rejects a non-integer size. (4) **Seal guard**: refuses to seal unless uploaded == verified == file count. | New check in `platform/test/publish.test.ts`: NaN / 0 / -1 / 1.5 → refused, the store holds only the prior pointer, pointer byte-identical. `test:publish` 28/0. Manual: `--concurrency abc` → exit 2. |
| **m1** pointer read-back failure reported as "untouched" | **FIXED**. `writeRoutingPointer` now throws `verify: … was WRITTEN but … — the pointer may have moved; inspect it before retrying` for both read errors and mismatches. | Existing "injected pointer corruption" check passes with the new message. |
| m2 concurrent publishes to one host | DEFERRED, documented: single operator, pilot. A later step can add a conditional put (R2 `onlyIf` etag) on the pointer. | — |
| m3 seal trusted without checking files exist | DEFERRED. Seals are only written after full verify (now also count-guarded), and nothing deletes package prefixes. | — |
| m4 no Range support (video) | DEFERRED. No video in the demo package. | — |
| m5 no-email `/contact` still indexable | DEFERRED, a template follow-up (noindex); already recorded as a 1.5.1 limitation. | — |
| m6 Worker serves a pointer without checking the seal | DEFERRED. Pointers are written only by site:publish after the seal; a third R2 read per request is not justified for the pilot. | — |

Re-verification after the fixes: `test:publish` 28/0, `typecheck:platform` 0 errors, `test:publish:e2e` 25/0 (local wrangler publish of the 1.5.1 package + wrangler dev + Playwright).
