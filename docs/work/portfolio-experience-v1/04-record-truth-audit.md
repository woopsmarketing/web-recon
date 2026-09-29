# Portfolio Experience V1 — record truth audit of bi-09 … bi-19 (Track B, 2026-09-29)

Task: BOOST INTERIOR DEMO DATA TRUTH FINALIZATION V1. `03-media-truth-audit.md` removed the 11
borrowed covers from the Portfolio Document only. This audit decides, per record, whether bi-09 …
bi-19 are allowed to stay customer-facing at all.

Owner rule: a public Portfolio record = **real case + real facts + correct case media**. If one of the
three cannot be proven, the record does not stay customer-facing as an "actual case". A rendered
detail page is not evidence, and neither is a precise-looking price. Provenance has to come from
upstream.

## 0. What "real" can mean on this site — read first

`boost-interior-demo` is a **fictional demo brand** (부스트 인테리어). Every content document of the
site instance declares `"origin": "synthetic-fixture"` (`content/projects.json:3`, and the same in
`business.json`, `categories.json`, `reviews.json`, `banners.json`, `assets/registry.json`). The
authoring report says so explicitly
(`docs/result/recon-template-platform-step6-demo/02-content-and-data-proof.md` §1, §10). Every
photo is an AI-generated demo asset (fal FLUX.2 klein), generated per shot for bi-01 … bi-08
(`docs/result/recon-template-platform-step6-demo/09-ai-images-complete.md`).

None of the 19 records is therefore a completed customer job. This audit uses the only standard the
repository can support:

- **Canonical demo case** (bi-01 … bi-08). The record is the site's own authored Portfolio from step 6.
  It has its own brief, facts, per-record shot list and per-record generated images, so every photo
  it shows was made for that record and no other. The owner's task treats these as the source-backed
  set, and this audit does not reclassify them.
- **Candidate for "real"** (bi-09 … bi-19). Such a record would have to trace to a source case: an
  original page, a capture, crawl data or an owned asset. Otherwise it is a test fixture.

This task does not change the fact that bi-01 … bi-08 are demo content. The open item is step6 `06`
O7 (a public deployment needs real content or a restored demo notice). It stays an owner decision
and is out of scope here.

## 1. Evidence searched (all 11 records)

| # | source | result |
|---|---|---|
| 1 | record authoring spec `docs/result/interior-portfolio-v0.2/04-demo-data-spec.md` | every record is authored in §2 as **"internal demo fixture"** content (line 16), purpose line: a testbed for the V0.2 consultation search; each record carries a "WHAT THIS RECORD TESTS" block; §5 (lines 710-726) lists every cover as a shared photo of another record |
| 2 | data-application record `docs/result/interior-portfolio-v0.2/26-demo-data-applied.md` §1.1 | "bi-09 … bi-19 transcribed verbatim from `04` §2" — the JSON is a copy of the spec text, not an import |
| 3 | git history | `git log --all -S "<title>"` → only internal authoring / revision / checkpoint commits; records first enter `projects.json` in `d284b93` (feat(integration): finalize portfolio v0.2 producer, demo corpus and golden package). No import commit, no source URL |
| 4 | preserved site data `data/sites/boost-interior-demo/` | file-level `origin: "synthetic-fixture"`; no source URL field; no per-record provenance |
| 5 | asset registry `assets/registry.json` (52 ids) | `bi01-*` … `bi08-*` + 8 site/logo assets; **no `bi09-*` … `bi19-*` asset**; `git log --all -S "bi09-"` … `"bi19-"` → 0 |
| 6 | committed source assets `references/boost-interior/generated-approved/`, `generated-candidates/` | only bi01 … bi08 and site shots |
| 7 | `references/boost-interior/project-01-white-34p/` (14 PNG) | screenshots of an unnamed third-party portfolio, used **only** as a visual style reference for AI generation (`image-generation/00-visual-bible.md`, `03-assets-and-image-generation.md` §2); marked reference-only, never a public asset; tied to no bi-XX record |
| 8 | raw crawls / captures in the old worktree `/Users/woops/projects/web-recon/data/` (apartmentary.com, interiorbay.co.kr, interiorteacher.com, seoultone.kr, seoworld.co.kr, hobbang.net, page-state-evidence, …) | titles, slugs, distinctive body phrases, district strings → **0 hits** (one "대구 수성구" hit in an unrelated skincare-domain template, rejected); the old `projects.json` there has only the 8 step-6 records |
| 9 | generated / reference dirs, built packages, goldens | all hits are downstream copies of the same records (site-build packages, `platform/test/golden/*`, boost-chat fixtures and QA transcripts) |
| 10 | `/Users/woops/projects/boost-chat` | consumes the ids in fixtures, QA transcripts and rollout docs; no document names a source |
| 11 | original public URLs stored in repo | none exists for any of the 11 |

## 2. Per-record forensic table (11 / 11)

Scopes = authored `workScopeIds` (the Korean display `scope` is in the notes). "Spec §2 Lnnn" =
`04-demo-data-spec.md` line range of the record's authoring block. Cover owners are from spec §5 and
`03-media-truth-audit.md`.

| recordId | current title | current location | current area | current projectType | current scopes | current price | how record was authored | real source found? | authoritative source identifier | source URL/path | facts backed by source? | media backed by source? | source image count | classification | production action | QA-fixture action | notes |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| bi-09 | 달서 34평 아파트 실속형 전체 리모델링 | 대구 달서구 | 34 평 supply | full_remodel | entrance, kitchen, bathroom, flooring, wallpaper, lighting, built_in_furniture | exact 50,000,000 | V0.2 fixture, spec §2 L82-130; tests "34평 전체 5천" exact budget + D-1 rounding | NO | — | — | NO | NO (cover `bi01-living-02` = bi-01 gallery 거실 #2) | 0 | VERIFIED_SYNTHETIC | removed from production | kept verbatim, TEST_ONLY | 5,000만원 is a fixture value; scope ["현관","거실","주방","안방","작은방","욕실","바닥·도배"] |
| bi-10 | 34평 확장·창호 교체 포함 전체 리모델링 | 대구 수성구 | 34 평 supply | full_remodel | entrance, living_room, kitchen, bedroom, dressing_room, bathroom, windows, expansion, built_in_furniture | exact 85,000,000 | V0.2 fixture, spec §2 L131-175 | NO | — | — | NO | NO (cover `bi08-dining-01` = bi-08 gallery 다이닝) | 0 | VERIFIED_SYNTHETIC | removed from production | kept verbatim, TEST_ONLY | 8,500만원 is a fixture value |
| bi-11 | 20평 구축 빌라 전체 리모델링 | 대구 북구 | 20 평 supply | full_remodel | kitchen, bathroom, flooring, wallpaper, doors | exact 30,000,000 | V0.2 fixture, spec §2 L176-223; the corpus's only `villa` (property-type fixture) | NO | — | — | NO | NO (cover `bi07-kitchen-01` = bi-07 gallery 주방) | 0 | VERIFIED_SYNTHETIC | removed from production | kept verbatim, TEST_ONLY | only villa record; its loss is a coverage fact, not a reason to keep it |
| bi-12 | 26평 웜 우드 아파트 전체 리모델링 | 대구 동구 | 26 평 supply | full_remodel | entrance, kitchen, bathroom, flooring, lighting, built_in_furniture | exact 52,000,000 | V0.2 fixture, spec §2 L224-267; paired with bi-09 ("similar price, different area") | NO | — | — | NO | NO (cover `bi05-dining-01` = bi-05 gallery 주방·다이닝) | 0 | VERIFIED_SYNTHETIC | removed from production | kept verbatim, TEST_ONLY | WS4 fixture (display scope ≠ ids by design) |
| bi-13 | 48평 대형 아파트 전체 리모델링 | 대구 수성구 | 48 평 supply | full_remodel | entrance, living_room, dining, kitchen, kids_room, dressing_room, study, bathroom, windows, lighting, built_in_furniture | range 125,000,000–140,000,000 | V0.2 fixture, spec §2 L268-315; the only range-price shape (DECISION block) | NO | — | — | NO | NO (cover `bi03-kitchen-01` = bi-03 gallery 주방·팬트리) | 0 | VERIFIED_SYNTHETIC | removed from production | kept verbatim, TEST_ONLY | range total exists to test D-1 range branch |
| bi-14 | 전용 84㎡ 아파트 주방만 바꾼 리뉴얼 | 대구 달서구 | 84 m² exclusive | partial_remodel | kitchen | exact 15,000,000 | V0.2 fixture, spec §2 L316-360; exclusive-vs-supply basis trap | NO | — | — | NO | NO (cover `bi01-kitchen-01` = bi-01 gallery 주방 #1) | 0 | VERIFIED_SYNTHETIC | removed from production | kept verbatim, TEST_ONLY | only exclusive-basis record |
| bi-15 | 욕실 한 곳만 새로 한 리뉴얼 | 대구 중구 | ABSENT | partial_remodel | bathroom | exact 7,000,000 | V0.2 fixture, spec §2 L361-404; area-absent shape | NO | — | — | NO | NO (cover `bi07-bathroom-01` = bi-07 gallery 욕실) | 0 | VERIFIED_SYNTHETIC | removed from production | kept verbatim, TEST_ONLY | only area-absent record |
| bi-16 | 38평 주방과 욕실 두 곳 리뉴얼 | 경북 경산시 | 38 평 supply | partial_remodel | kitchen, bathroom | exact 19,800,000 | V0.2 fixture, spec §2 L405-452; WS3 plurality hidden in ids (DECISION block) | NO | — | — | NO | NO (cover `bi01-kitchen-02` = bi-01 gallery 주방 #2) | 0 | VERIFIED_SYNTHETIC | removed from production | kept verbatim, TEST_ONLY | 1,980만원 is a fixture value; the "경산 38평 주방 욕실" exact match disappears with it |
| bi-17 | 공급 112㎡ 아파트 거실과 바닥 교체 | 대구 북구 | 112 m² supply | partial_remodel | living_room, flooring | exact 12,500,000 | V0.2 fixture, spec §2 L453-497; m² supply unit case | NO | — | — | NO | NO (cover `bi06-living-01` = bi-06 gallery 거실 #1) | 0 | VERIFIED_SYNTHETIC | removed from production | kept verbatim, TEST_ONLY | scope ["거실","바닥 전체"] |
| bi-18 | 30평 현관과 수납장 정리 공사 | 대구 서구 | 30 평 supply | partial_remodel | entrance, built_in_furniture | exact 6,200,000 | V0.2 fixture, spec §2 L498-545; the only style-absent record | NO | — | — | NO | NO (cover `bi03-entrance-01` = bi-03 gallery 현관) | 0 | VERIFIED_SYNTHETIC | removed from production | kept verbatim, TEST_ONLY | style ABSENT by design |
| bi-19 | 32평 전체 도배·바닥·조명 교체 | 대구 달성군 | 32 평 supply | ABSENT | flooring, wallpaper, lighting | exact 11,000,000 | V0.2 fixture, spec §2 L546-615; invented for INV-19/PB5 (breadth-absent + total) | NO | — | — | NO | NO (cover `bi01-hallway-01` = bi-01 gallery 복도·수납) | 0 | VERIFIED_SYNTHETIC | removed from production | kept verbatim, TEST_ONLY | projectType absent by design (PT6) |

No record's facts were "corrected": a fixture has no source to correct toward. The only honest
action is to remove it from the customer-facing dataset.

## 3. Decision

```
AUDITED_RECORDS                    = 11 (bi-09 … bi-19)
VERIFIED_REAL_COMPLETE             = 0
VERIFIED_REAL_MEDIA_MISSING        = 0
VERIFIED_SYNTHETIC                 = 11
PRODUCTION RECORDS                 = 19 → 8 (bi-01 … bi-08)
TEMPLATE interior-01@1.6.2         = NOT CUT — no VERIFIED_REAL_MEDIA_MISSING record remains
                                     (prompt §15); every surviving record has its own cover
```

- **Production**: bi-09 … bi-19 leave `data/sites/boost-interior-demo/content/projects.json`, and
  with it the live listing, their detail pages, the sitemap, the Portfolio Document and the
  BoostChat snapshot.
- **QA**: the 11 records are kept verbatim as a test-only fixture, labelled TEST_ONLY / SYNTHETIC /
  NOT_CUSTOMER_FACING in its README. They cover producer, detail-page and matcher regression
  (exact / range totals, m² exclusive, area absent, projectType absent, style absent, partial scopes,
  the foreign-cover rule). No production build, producer or publish path reads them. The Track B
  final report records where they live.
- **Coverage lost from the live demo, stated plainly**: after the cleanup there is no registered case
  that is a villa, a range price, an exclusive-area basis, a kitchen-only or bathroom-only partial,
  a 경산 38평 kitchen+bath job, or a total price of any kind. bi-01 … bi-08 carry `pricePerArea` on
  6 records and no `totalPrice`. Consultation answers for those queries now fall back to the nearest
  registered case, and that is the intended behaviour (prompt §21). No fixture is re-inserted to fill
  a gap.
