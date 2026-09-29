# Interior Demo Data Truth Finalization V1 — Track B (2026-09-29)

Task: BOOST INTERIOR DEMO DATA TRUTH FINALIZATION V1, Track B part, for `boost-interior-demo`
(https://interior-demo.boostweb.co.kr). The BoostChat side is in
`boost-chat/docs/result/BOOSTCHAT-DATA-TRUTH-FINALIZATION-V1-2026-09-29.md`.

- Forensic audit (mandatory 11-row table): `docs/work/portfolio-experience-v1/04-record-truth-audit.md`
- Sales-demo safe path: `docs/work/portfolio-experience-v1/05-sales-demo-safe-path.md`
- Proof: `docs/result/data-truth-finalization-v1/proof/`

```
START_HEAD                               = ee953b1
FINAL_HEAD                               = a27303b (audit a4d1440 · data f93e04a · build a27303b) + docs commit "docs(portfolio): record data truth finalization"

AUDITED_RECORDS                          = 11 (bi-09 … bi-19)
VERIFIED_REAL_COMPLETE_COUNT             = 0
VERIFIED_REAL_MEDIA_MISSING_COUNT        = 0
VERIFIED_SYNTHETIC_COUNT                 = 11
PRODUCTION_RECORDS_BEFORE                = 19
PRODUCTION_RECORDS_AFTER                 = 8 (bi-01 … bi-08)
SYNTHETIC_REMOVED_FROM_PRODUCTION_COUNT  = 11
TEST_ONLY_SYNTHETIC_PRESERVED_COUNT      = 11 (platform/test/fixtures/boost-interior-synthetic/)
REAL_RECORDS_FACT_CORRECTED_COUNT        = 0  (no record traced to a source; nothing to correct toward)
REAL_RECORDS_MEDIA_RECOVERED_COUNT       = 0  (no source media exists for any of the 11)
WRONG_SHARED_IMAGES_LIVE_BEFORE          = 11 (bi-09 … bi-19: each listing card + detail page showed a bi-01 … bi-08 gallery photo)
WRONG_SHARED_IMAGES_LIVE_AFTER           = 0
SITE_SHARED_PHOTO_CLOSED                 = YES
TEMPLATE_1_6_2_CREATED                   = NO — no VERIFIED_REAL_MEDIA_MISSING record remains; every surviving record has its own cover (prompt §15)
DEAD_PUBLIC_URLS                         = 0 (no public link points at a removed record; the 11 old URLs return the site's 404 page, noindex)
SCHEMA_VERSION                           = 1.1 (unchanged)
PRODUCER_VERSION                         = 4 (unchanged — content-only change)
LIVE_PACKAGE                             = 9d4036baeaa81ad4ec5c05eac230846a61267a2eb1a0c44b87b9a6e510f22819 (buildInputId 71a906c1…, document 968afbccb944940d8d3c099dd54df5be, 8 records)
ROLLBACK_PACKAGE                         = 77cc7f9f47adda09d119c6ec5a02626624b4e068b546e15185d39c1658bdbda0 (buildInputId 71f7e5f3…, 19 records — see §5 R1)
OTHER_SITES_CHANGED                      = NO (git diff ee953b1..HEAD touches only data/sites/boost-interior-demo and data/site-builds/boost-interior-demo)
PRODUCTION_PUBLISHED                     = YES (2026-09-29, dry-run → upload no-activate → reverify → activate --expect-live 77cc7f9f…)
BLOCKERS                                 = 0
MAJORS                                   = 0
MINORS                                   = 5 (§5)
```

## 1. What "real" means here

`boost-interior-demo` is a fictional demo brand. Every content file declares
`origin: "synthetic-fixture"`, and every photo is an AI-generated demo asset. **No record on this site
is a completed customer job, and that includes bi-01 … bi-08.** The audit (§0) therefore uses the only
standard the repository supports:

- **bi-01 … bi-08 are canonical demo cases.** Each is the site's own authored step-6 Portfolio, with its
  own facts, a per-record shot list and per-record images. No photo on these records belongs to another
  record.
- **bi-09 … bi-19 needed a source case.** None has one. They were authored from scratch as V0.2
  contract and matcher test fixtures, and each cover borrowed another record's gallery photo
  (spec `04-demo-data-spec.md` §2, §5).

This task leaves one thing unchanged: the site presents a fictional brand's cases. The live footer does
carry a demo notice ("…일부 콘텐츠는 AI로 생성된 예시입니다"). Whether it should say more is step-6
open item O7, an owner decision (§5 M1).

## 2. Provenance result

The table covers all 11 records and every evidence source searched: spec, data-application record, git
history, site data, asset registry, generated/approved assets, reference folders, raw crawls in the old
worktree, built packages, boost-chat and stored URLs. Every record comes out **VERIFIED_SYNTHETIC**.
None of them has a source case, a source asset, a source URL, or a source for any fact or price
(5,000만원 / 8,500만원 / 1,980만원 are fixture values). The table is
`docs/work/portfolio-experience-v1/04-record-truth-audit.md`.

## 3. Changes

| commit | what |
|---|---|
| `a4d1440` docs(portfolio): audit synthetic portfolio provenance | the 11-row forensic table + decision |
| `f93e04a` fix(data): remove unverified customer-facing portfolio records | `content/projects.json` → bi-01 … bi-08 (a pure deletion; the 8 are byte-identical); the 11 records moved **verbatim** to `platform/test/fixtures/boost-interior-synthetic/projects.synthetic.json` (+ README: TEST_ONLY / SYNTHETIC / NOT_CUSTOMER_FACING) with the pre-split document `856361f5…` as `qa-golden/`; QA composition helper `platform/test/portfolio-qa-corpus.ts` (refuses to write under `data/sites`); production golden regenerated (`portfolio-v1.1-media/` → `968afbcc…`); tests rewired (below) |
| `a27303b` build(site): publish verified interior portfolio dataset | new immutable package `71a906c1…`; keep-2 retired `3a897d2e…` locally (still in git at `b7d8ef5` and sealed in R2); old package bytes untouched |

**Not changed:** producer code (`platform/integration/*.ts`), `platform/content/schema.ts`,
templates, release pin `interior-01@1.6.1`, `PRODUCER_VERSION`, document schema, the frozen
`portfolio-v0.2` golden, `package.json`. The fixture is read only from `platform/test/*`. No build,
publish, release or producer path reads it, and `platform/release/release.ts` bundles an allowlist that
excludes tests.

### Production / QA separation (prompt §11, §31)

- **Edge cases stay covered.** Every edge-case assertion that used to ride on bi-09 … bi-19 now runs
  with the same literals against the composed QA corpus (production 8 + synthetic 11, original order).
  That covers exact/range totals, D-1 derivation, m² exclusive, area/projectType/style absent, partial
  scopes, the foreign-cover rule, detail-page facts and step6 filter/sort. For detail-facts [build]
  the corpus is written into its throwaway root, never `data/sites`.
- **The split lost nothing.** The QA composition reproduces the pre-split document `856361f5…` byte for
  byte, so the producer did not change and nothing was lost in the move.
- **Survivors are unchanged.** Each of the 8 surviving records is emitted deep-equal to its own record
  in the pre-split document.
- **New `platform/test/portfolio-production-truth.test.ts`.** It proves that production content, the
  production document and a real production build contain none of the fixture's ids or slugs; the
  forbidden set is read from the fixture file. It also checks that every production record's media is
  its own, and that every portfolio link in the built home, listing, detail and sitemap resolves to one
  of the 8 pages.

## 4. Verification

**Focused suites.** All ran against the new package (`proof/runs/*.log`):

| suite | result |
|---|---|
| integration | 85 passed / 0 failed (1 point-in-time, G5, as before) |
| step6 | 34 / 0 |
| portfolio-production-truth (new) | 10 / 0 |
| detail-facts | 25 / 0 |
| predemo · predemo2 | 10 / 0 · 9 / 0 |
| ia150 · ia151 · ia152 | 15 / 0 · 10 / 0 · 14 / 0 |
| publish (in-memory store) | 59 / 0 |
| integration-golden check | exit 0 |
| `tsc -p platform/tsconfig.json` | exit 0 |

`publish-e2e` was not run: it launches wrangler and Playwright and rewrites a tracked local-E2E proof.
The real remote publish below covers it.

**Build.** `proof/10-site-build.log`: 144 files, 15 HTML pages, `portfolio.detail` 8, QA pass. The diff
against the live package (`proof/11-package-diff-vs-live.json`) is:

- **removed:** exactly 55 detail files (11 slugs × html + RSC payloads), plus the old document
- **added:** the new document
- **changed:** the listing (4 files), the sitemap and `_integration`
- **unchanged:** 137 files, including the home page, which already linked only bi-01 … bi-08
- **tokens:** no synthetic id, slug or title appears anywhere in the new package

**Publish.** Logs are `proof/30…33`:

1. Dry-run `--check-store`: host serves `77cc7f9f…`, would upload 144, 0 warnings.
2. Upload `--no-activate`: 144/144 uploaded and verified, sealed.
3. `--reverify`: 144/144 sealed objects re-read (sha256 + size).
4. Activate with `--expect-live 77cc7f9f… --expect-package 9d4036ba…`: pointer written, previous
   `77cc7f9f…`.

**Live HTTP** (`proof/34-live-http-check.log`, 2026-09-29T08:29Z):

- The manifest serves `968afbcc…`. The old document `856361f5…` returns 404; the new one returns 200.
- The sitemap has 13 `<loc>`, of which 8 are detail pages. The listing links 8 distinct detail pages and
  the home page links only the 8 production slugs.
- All 11 removed slugs return 404. All 8 production slugs return 200. No synthetic title appears on
  the listing.

**Independent fresh-context review.** The review found 0 BLOCKER and 0 MAJOR, and answered the eight
questions as follows:

- Every live asset on the 8 detail pages belongs to its own record; the 51 jpgs have no byte-level
  duplicate.
- All 55 removed URL variants return 404.
- The fixture is cleanly separated.
- `src/` in BoostChat is unchanged, and the matcher suites are green.

**Live BoostChat E2E.** The run is recorded in the BoostChat report §3.

- **Result:** the full run passed 17 of 18 checks.
- **Site:** home, listing and bi-01 detail pages are clean, and the removed slug returns 404.
- **Widget:** search → card → Viewer → actual detail page works.
- **The one FAIL (back → same conversation):** the harness reloads the page after browser back, then
  read the chat after 1.2 s. The conversationId was unchanged, but the widget showed its embed notice
  instead of the restored messages. With a 15 s settle wait, two resume-only reruns passed: the
  conversation was restored with no notice. The screen right after back shows a normal site with the
  launcher. No BoostChat code changed; this is BoostChat NOTE N2.
- **Cards:** every card returned during the run is one of bi-01 … bi-08, and every image belongs to
  its own record.
- **Wording probes:** the five probes (exact / overlap only / no exact / former 5천 budget case /
  area-location mismatch) contain no misleading sentence.
- **Safe path:** the six-step sales sequence (`05-sales-demo-safe-path.md`) ran live on the first
  attempt.

One pre-existing consumer label caveat is recorded there. The "요청과 같은 사례" badge reflects
the scope class and ignores area, and the safe path avoids it.

## 5. Findings carried (none blocks)

| id | severity | finding | disposition |
|---|---|---|---|
| R1 | MINOR (operational) | The host's rollback target `77cc7f9f…` (and `previous.json`) is the 19-record package. `site:publish --rollback` would put the 11 synthetic records back live, and the next BoostChat refresh would pull them in | **Do not use `--rollback` for this host without re-running this cleanup.** To undo this publish, rebuild from git and publish forward. Recorded in the BoostChat ledger as `DEMO-ROLLBACK-REINTRODUCES-SYNTHETIC` |
| M1 | MINOR (pre-existing, owner decision O7) | The site presents a fictional brand's cases. The footer notice says "일부 콘텐츠" (some content) is AI-generated, and the listing intro says "부스트 인테리어가 계획하고 시공한 아파트 사례입니다" (cases the company planned and built) | Site copy is out of this task's scope. Before the site is shown as anything other than a demo, strengthen the notice or replace the content (step6 `06` O7) |
| M2 | MINOR (pre-existing) | Every detail page's share preview (`og:image`) and hero slide 1 ("대표 프로젝트 보기" → bi-01) use the site banner `site-hero-01`, which belongs to no record | This is a brand image, not another record's photo, but a shared bi-04 link previews an unrelated living room. It is template/slot work and was not done here |
| M3 | MINOR | The old sitemap listed the 11 URLs; search results may show them until recrawl. They return 404, not 410 or a redirect | Accepted |
| M4 | MINOR | The commit message `a27303b` says "verified dataset". That means "verified: not a test fixture, own media", not "verified real jobs" | This report and the audit §0 define it; history is not rewritten |

## 6. Coverage the live demo lost (stated, not patched)

The live demo no longer has a villa, a range price, an exclusive-area basis, a kitchen-only or
bathroom-only partial, a 경산 38평 job, or any total price; bi-01 … bi-08 carry only per-평 prices,
on 6 records. For those questions BoostChat now answers with the closest registered case. No fixture
was re-inserted to fill a gap (prompt §21).
