# Interior Portfolio Media Polish V1 — Track B (2026-09-29)

Task: BOOST SALES-DEMO FINAL POLISH V1, part B/C (media truth audit + gallery enrichment) for
`boost-interior-demo`. BoostChat side: `boost-chat/docs/result/BOOSTCHAT-MOBILE-SALES-POLISH-V1-2026-09-29.md`.
Audit (mandatory bi-09…bi-19 table): `docs/work/portfolio-experience-v1/03-media-truth-audit.md`.
Proof: `docs/result/portfolio-media-polish-v1/proof/`.

```
START_HEAD                   = 019e404
FINAL_HEAD                   = 48d0043 (code + package) · + docs commit "docs(portfolio): record media truth audit"

RECORDS_TOTAL                = 19
BI09_19_AUDITED              = YES (11/11, per-record table in 03-media-truth-audit.md)
FOREIGN_COVER_FOUND_COUNT    = 11 (bi-09 … bi-19 — every cover was another record's gallery photo)
FOREIGN_COVER_REMOVED_COUNT  = 11 (from the Portfolio Document → BoostChat shows text cards)
RECORDS_ENRICHED             = 0  (no same-record asset exists for bi-09 … bi-19; bi-01 … bi-08 already export all own after images)
RECORDS_WITH_COVER           = 8  (bi-01 … bi-08)
RECORDS_WITH_GALLERY         = 8  (bi-01 … bi-08)
RECORDS_COVER_ONLY           = 0
RECORDS_NO_PROVABLE_MEDIA    = 11 (bi-09 … bi-19: `media` absent)
GALLERY_IMAGES_BEFORE        = 41 (totalCount sum 42)
GALLERY_IMAGES_AFTER         = 41 (totalCount sum 42)
GALLERY_MAX                  = 12
AREA_MATCHER_CHANGED         = NO
MATCHER_RESULTS_CHANGED      = NO
LIVE_PACKAGE                 = 77cc7f9f47adda09d119c6ec5a02626624b4e068b546e15185d39c1658bdbda0 (buildInputId 71f7e5f3…, document 856361f52e3f1b5022cce13a31afc171)
ROLLBACK_PACKAGE             = 480e5e65b0611ab280de8ae0c242e050a5a9711bbeb7f0e90c46c9f5c107298c (buildInputId 3a897d2e…, document d95b5cb5…)
OTHER_SITES_CHANGED          = NO
PRODUCTION_PUBLISHED         = YES
BLOCKERS                     = 0
MAJORS                       = 0 in this change · 1 pre-existing, out of scope, carried (SITE-SHARED-PHOTO, §4)
MINORS                       = 2 (§4)
```

## 1. What was wrong

bi-09 … bi-19 are synthetic V0.2 fixture records. Their authoring spec
(`docs/result/interior-portfolio-v0.2/04-demo-data-spec.md` §5) says every cover is "a shared photo: the
same jpg already appears in another record's gallery". Producer 3 still exported those covers as the
record's own `media.cover`, so BoostChat showed another job's photo on these cards and in the viewer.

Evidence for "no correct image exists": the asset registry has 52 assets, `bi01-*` … `bi08-*` plus 8
site/logo assets. No `bi09-*` … `bi19-*` asset was ever committed (`git log --all -S`) or generated
(`references/boost-interior/generated-*`). Nothing was generated, downloaded or approximated in this
task.

## 2. Fix (producer 4, `b005c82`)

`platform/integration/emit.ts` has a generic media ownership rule. An asset is attributable to record R
only when:

- (a) it is in R's own `galleryGroups`, or
- (b) R is the only record that references it at all, and no banner, logo or slot image uses it.

A cover that fails the rule is not exported, and the gallery is deduped by asset. The rule names no
record or asset id.

These stay unchanged: schema, `schemaVersion "1.1"` and the validator. `PRODUCER_VERSION` goes 3 → 4.

- **Tests.** `integration.test.ts` adds E13 (crafted cases, including site hero, intro and logo covers)
  and E14. E14 runs a truth check on the real demo and requires every non-media byte to match producer 3's
  golden, read from git `df68b10`. `detail-facts.test.ts` B8 now allows exactly 11 no-media records.
- **Goldens.** The new golden is `platform/test/golden/portfolio-v1.1-media/portfolio.856361f5….json`
  (18,520 B). The frozen 1.0 golden is untouched.
- **Runs.** `proof/runs/`:

  | Suite | Passed |
  |---|---|
  | integration | 84/84 |
  | detail-facts | 25/25 |
  | publish | 59/59 |
  | step6 | 32/32 |
  | ia150 / ia151 / ia152 | 15 / 10 / 14 |
  | predemo | 10 + 9 |

  tsc is clean.

## 3. Build → publish → consumer refresh (`48d0043`)

1. **Build.** A site rebuild produced package `77cc7f9f…` (`proof/10-site-build.log`). Against the old live
   package, only `_integration/manifest.json` and the document differ (`proof/11-package-diff-vs-live.json`).
2. **Publish.** The sequence was dry-run → upload `--no-activate` → `--reverify` → activate with
   `--expect-package` (`proof/30…33`).
   - The previous live package `480e5e65…` is the rollback.
   - Old package bytes were not touched. Keep-2 retired only the local copy of widget build `32303241…`,
     which stays in git `aa2d94b` and sealed in R2.
3. **Live check (2026-09-29).** `https://interior-demo.boostweb.co.kr/_integration/manifest.json` serves
   `portfolio.856361f52e3f1b5022cce13a31afc171.json`.
4. **BoostChat snapshot.** It was refreshed through the audited ops CLI (`scripts/ops-first-party-refresh.ts`,
   no direct DB update). Log: `boost-chat/proof/mobile-sales-polish-v1/refresh-apply.log`.
   - resourceVersion: `d95b5cb5…` → `856361f5…`
   - records: 19 → 19 (schema 1.1)
   - media records: 19 → 8, covers 19 → 8, gallery images 41 → 41
5. **Matcher probes.** The ordered IDs were identical before and after the change for all four:
   34평 whole, kitchen + bath partial, exclusive 84, budget 5000. Production E2E on the refreshed snapshot
   gave these cards:
   - bi-01/bi-07: image, "공급"
   - bi-09/10/11/12: text-only, "공급"
   - 0 broken images

## 4. Remaining findings

**Carried, pre-existing, out of scope — SITE-SHARED-PHOTO (independent review MAJOR-1).** The demo
website's own listing cards and detail pages for bi-09 … bi-19 still show the shared photo.

- Why: template interior-01@1.6.1 requires `cover` (`platform/content/schema.ts:247`), and
  `PortfolioDetail.tsx:66-75` falls back to it.
- Where a visitor sees it: BoostChat's text card → "전체 포트폴리오 보기" → that detail page.
- Why not fixed here: this task's §25 limits media corrections to producer/source data, and a site-side
  fix needs a template cut.
- The scoped interior-01 **1.6.2** plan (8 steps) is in the audit §"Known limitation". It needs an
  **OWNER DECISION**.
- Sales-video workaround: don't open bi-09 … bi-19 detail pages.

**MINOR**

1. Rule (a) allows two records whose own galleries list the same asset to both export it (explicit
   authoring). E14 proves that no record in the demo data shares one. No crafted test covers
   cross-record gallery sharing.
2. `RECORDS_ENRICHED = 0` is correct for this data, but the enrichment path had no real candidates to
   exercise. Dedup and ordering are covered only by E13's crafted cases.

**Independent review (fresh context, 7 questions)**, as it bears on Track B:

- Q1 (wrong-record images): none in the document; all 49 exported images are the record's own.
- Q2 (could a user mistake another project's photo): not in BoostChat; yes on the site (the MAJOR above).
- Q7 (did media changes affect the matcher): no; non-media bytes are identical and record order is unchanged.

The review's MINOR on rule (b) and site assets was fixed (site-image exclusion + E13 cases). Its "not
live yet" MAJOR was resolved by §3.
