# Portfolio Experience V1 — media inventory of boost-interior-demo (Track B, 2026-09-29)

Where every image in the 1.1 portfolio document comes from, per record. It was generated from the
producer's own emission (`platform/test/golden/portfolio-v1.1-media/portfolio.d95b5cb5f8f05e50e624eb44d39393f5.json`)
and the authored sources (`data/sites/boost-interior-demo/content/projects.json`, `assets/registry.json`).
The rules are D1 in `02-contract-and-architecture-decisions.md`, and the normative text is
`docs/reports/integration/08-portfolio-media-1.1-addendum.md`.

## Sources: what is used, what is not

| source | used? | why |
|---|---|---|
| `projects.json` `items[].cover` | **yes → `media.cover`** | the record's authored cover, which the site renders as the card thumbnail |
| `galleryGroups[].items[].image` | **yes → `media.gallery`**, first 12 in authored order; `totalCount` = all of them | the record's authored primary (after) gallery, which the detail page renders |
| `galleryGroups[].items[].before` | no, and not counted | the before half of a before/after pair sits behind a toggle on the page, so it is not the primary gallery (D1) |
| `assets/registry.json` `width`/`height` | yes → `width`/`height` | real registry metadata, read through the snapshot asset table (the same entries the Template's AssetResolver uses) |
| asset `publicPath` | yes → `src` | `/assets/<sha256[0:20]>.jpg`, same-origin and content-addressed |
| authored `alt` | yes, when authored | never invented. Every image in this corpus authors one |
| `og:image` | **no** | it is site-wide: all 20 pages carry `og:image` = `/assets/ae004e4b853e6c005daa.jpg` (`site-hero-01`). No page has a project-specific og:image or any JSON-LD |
| site hero / band / intro / reviews / portfolio hero / logo | **no** | these are site assets, not the record's own (`integration.test.ts` E6 checks that none of their paths appear) |

## Per record

"actual total known?" asks whether `totalCount` is the real number of authored after images. It
is yes wherever a gallery exists, because the corpus holds every image the page renders. `hasMore`
is **derived** as `totalCount > gallery.length` and is never emitted.

| recordId | title | detailUrl | cover source | gallery source | gallery exported count | actual total known? | totalCount | hasMore | notes |
|---|---|---|---|---|---|---|---|---|---|
| bi-01 | 수성 화이트 34평 아파트 리모델링 | `/portfolio/suseong-white-34py-apartment-remodeling` | `bi01-living-01` → `/assets/03c625140dc4df674fb8.jpg` | 6 groups, 13 after | 12 | yes (authored count) | 13 | true | 13th after image `bi01-bathroom-02` counted, not exported |
| bi-02 | 신혼부부를 위한 24평 화이트 내추럴 리모델링 | `/portfolio/dalseo-24py-white-natural-newlywed-home` | `bi02-living-01` → `/assets/4b97ec9364e732e50f19.jpg` | 4 groups, 4 after | 4 | yes (authored count) | 4 | false | — |
| bi-03 | 42평 가족형 아파트 수납 중심 리모델링 | `/portfolio/suseong-42py-family-storage-remodeling` | `bi03-living-01` → `/assets/355dc4cf898996bc71c4.jpg` | 5 groups, 5 after | 5 | yes (authored count) | 5 | false | — |
| bi-04 | 32평 주방·욕실 중심 리뉴얼 | `/portfolio/buk-32py-kitchen-bathroom-renewal` | `bi04-kitchen-01` → `/assets/c562c8736b1f564a52ea.jpg` | 2 groups, 4 after (+2 before, excluded) | 4 | yes (authored count) | 4 | false | before images `bi04-kitchen-01-before`, `bi04-bathroom-01-before` not exported, not counted |
| bi-05 | 29평 밝은 내추럴 아파트 리모델링 | `/portfolio/dong-29py-bright-natural-remodeling` | `bi05-living-01` → `/assets/eedea9f15df0a895a8d6.jpg` | 4 groups, 4 after | 4 | yes (authored count) | 4 | false | — |
| bi-06 | 34평 현관·거실 중심 리모델링 | `/portfolio/gyeongsan-34py-entrance-living-remodeling` | `bi06-entrance-01` → `/assets/1c6712572d180dc7c452.jpg` | 3 groups, 4 after | 4 | yes (authored count) | 4 | false | — |
| bi-07 | 19평 소형 아파트 화이트 미니멀 리모델링 | `/portfolio/jung-19py-compact-white-minimal-remodeling` | `bi07-living-01` → `/assets/b079d5a93c72855ef8b1.jpg` | 4 groups, 4 after | 4 | yes (authored count) | 4 | false | — |
| bi-08 | 51평 신축 아파트 입주 전 홈스타일링 | `/portfolio/suseong-51py-new-apartment-home-styling` | `bi08-living-01` → `/assets/e3bde7e30b04ce357a9f.jpg` | 4 groups, 4 after | 4 | yes (authored count) | 4 | false | — |
| bi-09 | 달서 34평 아파트 실속형 전체 리모델링 | `/portfolio/dalseo-34py-value-full-remodeling` | `bi01-living-02` → `/assets/f7772497b1c65dd37094.jpg` | — (none authored) | 0 | n/a | — (absent) | — (no gallery) | cover reuses bi-01’s gallery asset (synthetic-fixture reuse) |
| bi-10 | 34평 확장·창호 교체 포함 전체 리모델링 | `/portfolio/suseong-34py-expansion-windows-full-remodeling` | `bi08-dining-01` → `/assets/f0e9c3eb5d869b3fc459.jpg` | — (none authored) | 0 | n/a | — (absent) | — (no gallery) | cover reuses bi-08’s gallery asset (synthetic-fixture reuse) |
| bi-11 | 20평 구축 빌라 전체 리모델링 | `/portfolio/buk-20py-villa-full-remodeling` | `bi07-kitchen-01` → `/assets/48935a1375b5da6944fe.jpg` | — (none authored) | 0 | n/a | — (absent) | — (no gallery) | cover reuses bi-07’s gallery asset (synthetic-fixture reuse) |
| bi-12 | 26평 웜 우드 아파트 전체 리모델링 | `/portfolio/dong-26py-warm-wood-full-remodeling` | `bi05-dining-01` → `/assets/8653c74f8aa70a30f10a.jpg` | — (none authored) | 0 | n/a | — (absent) | — (no gallery) | cover reuses bi-05’s gallery asset (synthetic-fixture reuse) |
| bi-13 | 48평 대형 아파트 전체 리모델링 | `/portfolio/suseong-48py-large-apartment-full-remodeling` | `bi03-kitchen-01` → `/assets/8f3c4902540b7804ba70.jpg` | — (none authored) | 0 | n/a | — (absent) | — (no gallery) | cover reuses bi-03’s gallery asset (synthetic-fixture reuse) |
| bi-14 | 전용 84㎡ 아파트 주방만 바꾼 리뉴얼 | `/portfolio/dalseo-84m2-kitchen-only-renewal` | `bi01-kitchen-01` → `/assets/8b1f5ef894985ebb1ef9.jpg` | — (none authored) | 0 | n/a | — (absent) | — (no gallery) | cover reuses bi-01’s gallery asset (synthetic-fixture reuse) |
| bi-15 | 욕실 한 곳만 새로 한 리뉴얼 | `/portfolio/jung-single-bathroom-renewal` | `bi07-bathroom-01` → `/assets/c4b8793c0ec308e9cf15.jpg` | — (none authored) | 0 | n/a | — (absent) | — (no gallery) | cover reuses bi-07’s gallery asset (synthetic-fixture reuse) |
| bi-16 | 38평 주방과 욕실 두 곳 리뉴얼 | `/portfolio/gyeongsan-38py-kitchen-two-bathrooms-renewal` | `bi01-kitchen-02` → `/assets/07ec6b76f44294d581b4.jpg` | — (none authored) | 0 | n/a | — (absent) | — (no gallery) | cover reuses bi-01’s gallery asset (synthetic-fixture reuse) |
| bi-17 | 공급 112㎡ 아파트 거실과 바닥 교체 | `/portfolio/buk-112m2-living-room-flooring-renewal` | `bi06-living-01` → `/assets/0600f0ac3c687ecd0dd0.jpg` | — (none authored) | 0 | n/a | — (absent) | — (no gallery) | cover reuses bi-06’s gallery asset (synthetic-fixture reuse) |
| bi-18 | 30평 현관과 수납장 정리 공사 | `/portfolio/seo-30py-entrance-storage-renewal` | `bi03-entrance-01` → `/assets/6cfd586c71fbe0ba477f.jpg` | — (none authored) | 0 | n/a | — (absent) | — (no gallery) | cover reuses bi-03’s gallery asset (synthetic-fixture reuse) |
| bi-19 | 32평 전체 도배·바닥·조명 교체 | `/portfolio/dalseong-32py-whole-flat-wallpaper-flooring` | `bi01-hallway-01` → `/assets/b5a1855e08067d3f99a6.jpg` | — (none authored) | 0 | n/a | — (absent) | — (no gallery) | cover reuses bi-01’s gallery asset (synthetic-fixture reuse) |

## Totals

- 19 records carry `media`, and all 19 have a `cover`.
- 8 records (bi-01 … bi-08) carry `gallery` + `totalCount`. They export 41 images, and `totalCount` sums to 42.
- 1 record has a derived `hasMore`: bi-01, with 12 of 13 exported. The 13th image, `bi01-bathroom-02`, is counted but not exported.
- 11 records (bi-09 … bi-19) are cover only, `media = { cover }`.
- There are 41 distinct image paths. Every cover is also one of the exported gallery images.
- All images are `image/jpeg` at 1600×1200, and all have an authored alt.
- `before` images: 2, both on bi-04 (`bi04-kitchen-01-before`, `bi04-bathroom-01-before`). They are not exported and not counted.

## Notes

- **Superseded for bi-09 … bi-19 by `03-media-truth-audit.md`** (producer 4): their shared covers are
  not attributable to them, so they now carry no `media`; bi-01 … bi-08 are unchanged.
- **bi-09 … bi-19 reuse authored covers.** These 11 records are synthetic fixture cases added by
  the V0.2 re-authoring (`docs/result/interior-portfolio-v0.2/26-`). They author no gallery. Their
  `cover` in `projects.json` is an asset of one of bi-01 … bi-08's galleries, as the table shows.
  The live site renders exactly this asset as their card and detail photo. The page's gallery falls
  back to the cover when `galleryGroups` is absent (`templates/interior-01/v1/sections/PortfolioDetail.tsx`).
  This is a **reused authored asset**, not a guessed relationship: the producer copies the authored
  `cover` and infers nothing. A consumer showing bi-10 shows the same photo as one of bi-08's gallery
  images, and that matches the canonical page.
- **The cover's alt differs from the same asset's gallery alt** on bi-01 … bi-08. The cover alt and
  the gallery item alt are authored separately, and each is copied as authored.
- **Media and ranking.** Media feeds no facet, no ordering and no other field of the document
  (`integration.test.ts` E12 proves that every non-media byte is independent of the media sources).
  The producer has no matcher.
- **Detail page consistency.** Every image the document names for a record is rendered by that
  record's own detail page (`detail-facts.test.ts` B8). bi-04's page additionally renders its 2
  before images.
