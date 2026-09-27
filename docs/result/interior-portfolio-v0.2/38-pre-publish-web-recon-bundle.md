# 38 — V0.2 pre-publish web-recon bundle (area basis label, detail facts, step6 corpus rules, `interior-01@1.6.1`)

| | |
|---|---|
| date | 2026-09-27 |
| scope | a bounded pre-publish session. Make the public demo and the historical suites match the V0.2 truth **before** any V0.2 publish, then stop. Four ledger items: `DEMO-AREA-BASIS-LABEL`, `STEP6-V02-CORPUS-RULES`, `TEMPLATE-160-CHANGELOG`, `DEMO-DETAIL-V02-FACTS`. The session cuts one new immutable release and re-pins the demo source. It does **not** publish |
| branch | `track-b/static-deployment-foundation` |
| brief | owner's "WEB-RECON PORTFOLIO V0.2 PRE-PUBLISH BUNDLE" §0–§33 |

```
START_HEAD                   = 91e956d
END_HEAD                     = the docs commit that carries this file (git log -1 -- this file); code commits below
BRANCH                       = track-b/static-deployment-foundation

OLD_TEMPLATE_RELEASE         = interior-01@1.6.0   (interior-01-1.6.0-e65795202191)
NEW_TEMPLATE_RELEASE         = interior-01@1.6.1
NEW_RELEASE_ID               = interior-01-1.6.1-8da56de8d28f
NEW_RELEASE_HASH             = 8da56de8d28f372f645c5490436cd9da1b2ce70951e212a6b031ad991771855d
OLD_RELEASES_UNCHANGED       = YES — every file under data/template-releases/ other than the new
                               1.6.1 directory is byte-identical before/after (sha256 fingerprint;
                               1.5.2 and 1.6.0 included)

DEMO_PIN_UPDATED             = YES — data/sites/boost-interior-demo/site.json .template → 1.6.1 (source pin only)
CURRENT_JSON_CHANGED         = NO

AREA_BASIS_LABEL_FIXED       = YES
SUPPLY_AREA_LABEL            = 공급면적   (slot portfolio.detail.areaSupplyLabel; basis = supply)
EXCLUSIVE_AREA_LABEL         = 전용면적   (slot portfolio.detail.areaExclusiveLabel; basis = exclusive)
MISSING_AREA_BEHAVIOR        = area absent → no area row, no area label, no figure (bi-15).
                               basis absent / "unknown" → neutral 면적 (areaLabel) + the authored
                               figure. No basis guessed, no supply↔exclusive or 평↔m² conversion

DETAIL_V02_FACTS_IMPLEMENTED = YES
DETAIL_AREA                  = basis-aware label + authored value/unit (as above)
DETAIL_PROJECT_TYPE          = "리모델링 구분": full_remodel → 전체 리모델링 · partial_remodel → 부분 리모델링;
                               absent → no row (never inferred from category/title/body)
DETAIL_WORK_SCOPES           = "주요 공사 범위": the workScopeIds only, authored order, closed-vocabulary
                               words (BoostChat's consumer words); never from the free-text `scope`
DETAIL_TOTAL_PRICE           = "총 공사비": exact ("5,000만 원") or range ("1억 2,500만 원 ~ 1억 4,000만 원");
                               absent → no row; never pricePerArea × area
PARTIAL_TOTAL_WORDING_SAFE   = YES — the same "총 공사비" label for full and partial projects (the whole
                               case's total); no 예상 견적 / 고객 견적 / per-room wording anywhere in the facts

STEP6_H                      = PASS (+ H·build over the whole corpus)
STEP6_L                      = PASS (+ L·build over the whole corpus)
STEP6_N                      = PASS — explicit literal expectations on the 19-record corpus
STEP6_O                      = PASS — page set = an independent route plan + Next's error pages; no magic number
STEP6_TOTAL                  = 32/0   (was 27/3); also 32/0 in a simulated POST_PUBLISH_STEADY root

INTEGRATION                  = 75/0/0 skipped
SLICE1                       = 86/0
STEP4                        = 47/0
STEP41                       = 35/0
STEP5                        = 32/0
PREDEMO                      = 10/0
PREDEMO2                     = 9/0
IA150                        = 15/0
IA151                        = 10/0
IA152                        = 14/0
POLISH                       = 4/0
STEP52                       = 12/0
PUBLISH_SUITE                = 59/0
DETAIL_FACTS (new)           = 24/0

TYPECHECK                    = PASS   (tsc -p platform/tsconfig.json --noEmit, exit 0)
CLEAN_ARCHIVE_22FAA91        = integration 75/0/0 (I2b ok) · detail-facts 24/0 · slice1 86/0 · tsc pass ·
                               golden drift [] · step6 31/1 = D2 only, the known git-archive mtime
                               artefact (37- §2.2)
BUILD                        = PASS — real Next builds of the demo from the stored 1.6.1 release
                               (detail-facts B0, step6 U rebuild): status built, package QA pass

DETAIL_ROUTES                = 19/19   (emitted detail pages = the golden document's detailUrls)
DETAIL_INTEGRATION_CONSISTENCY = 19/19 (every visible area / projectType / work scope / total /
                               per-area row agrees with the build's own integration record)

GOLDEN_DRIFT                 = []
RESOURCE_VERSION             = d56509c8100a56fdf9644baff78ff9e1
RESOURCE_SHA256              = c76624146b5a753003fa5f0e3619534e3a80bd2fd967ed975d392e9180453816
MANIFEST_SHA256              = b2f52b736570b954fb257f03cc5897426dee7f199d95d3654221290644d8ce5d

PRE_PUBLISH_TRANSITION_VALID = YES — demoRollout = PRE_PUBLISH_TRANSITION; site:publish still plans
                               the V0.1 package 286d44ab… (release 1.5.2, V0.1 document 6346c472…)

FINAL_REVIEW_MODEL           = Fable (claude-fable-5-1), fresh context, one pass; no delta review (no code change from it)
FINAL_BLOCKERS               = 0
FINAL_MAJORS                 = 0
FINAL_MINORS                 = 3 (+ 6 notes) — §7

DEMO_AREA_BASIS_LABEL_STATUS = DONE
STEP6_V02_CORPUS_RULES_STATUS = DONE
TEMPLATE_160_CHANGELOG_STATUS = DONE
DEMO_DETAIL_V02_FACTS_STATUS = DONE

UNRELATED_WORK_TOUCHED       = NO
BOOSTCHAT_TOUCHED            = NO
PRODUCTION_TOUCHED           = NO
PUBLISH_PERFORMED            = NO
CURRENT_JSON_CHANGED         = NO

COMMITS                      = 11c3c92  fix(interior): render v0.2 portfolio facts correctly            (A)
                               23060ad  feat(template): cut interior-01@1.6.1 and pin the demo            (C)
                               21ddf4f  test(interior): align step6 with the v0.2 corpus                  (B)
                               22faa91  test(platform): run detail-facts in test:platform                 (review MINOR-2)
                               + the docs commit carrying this file

READY_FOR_CONTROLLED_V02_PUBLISH = YES
PUBLISH_ALLOWED              = NO   (PORTFOLIO-PUBLISH-GATE stays in force)
```

Success tokens: `AREA_BASIS_LABEL_CORRECT` · `V02_DETAIL_FACTS_GROUNDED` · `STEP6_V02_GREEN` ·
`NEXT_INTERIOR_RELEASE_CUT` · `GOLDEN_UNCHANGED` · `PRE_PUBLISH_TRANSITION_PRESERVED` ·
`PRODUCTION_UNTOUCHED`

## 1. What changed on the public page

One layout for every project, as before (`sections/PortfolioDetail.tsx`). Only the fact list
(`<dl class="i1-facts">`) changed; the markup of a row is unchanged
(`<div class="i1-facts__row" data-fact=KEY><dt/><dd/></div>`).

| row | label (demo copy) | value | when |
|---|---|---|---|
| area | 공급면적 / 전용면적 / 면적 — by `area.basis` supply / exclusive / absent-or-unknown | `formatArea(area)`: authored value + unit symbol, no conversion | `area` authored |
| projectType *(new)* | 리모델링 구분 | 전체 리모델링 / 부분 리모델링 | `projectType` authored |
| workScopes *(new)* | 주요 공사 범위 | the `workScopeIds` words in authored order, joined ", " | `workScopeIds` non-empty |
| totalPrice *(new)* | 총 공사비 | exact or range, Korean 억/만 notation for a ko locale + KRW | `totalPrice` authored |

Row order: location, area, projectType, category, builtYear, scope, workScopes, period, duration,
keywords, totalPrice, price. The facts are read from the canonical record `p` itself. The same
record feeds the integration emitter, and there is no second facts object (`detail-facts` F6 edits
the record and sees both move).

- **Words are template code, labels are slots.** The closed-vocabulary words (`lib/vocabulary.ts`)
  are the 26 BoostChat consumer words (e.g. `built_in_furniture` → 붙박이·제작 가구), with English
  words for a non-Korean locale. The KRW total notation is in `lib/format.ts` (`koreanWon`,
  `formatTotalPrice`), beside the existing unit symbols. It keeps the template's own "만 원"
  spacing; BoostChat writes "만원". The five new labels are optional `portfolio.detail` slots with
  neutral English defaults (`areaSupplyLabel`, `areaExclusiveLabel`, `projectTypeLabel`,
  `workScopesLabel`, `totalPriceLabel`).
- **A site that authors none of the new labels** gets the neutral defaults for a stated basis,
  never its own unqualified `areaLabel`. So an old site copy of `areaLabel = 공급면적` can never
  again reach an exclusive record (`AREA-UI-6`).
- **Partial projects.** The total is the whole case's total under the same label as a full
  remodel. It is not divided by the area, not attached to a room or a trade, and not worded as a
  quote.
- **Representative records** (real 1.6.1 build, `detail-facts` B7):

```
bi-09: 공급면적 = 34평 | 리모델링 구분 = 전체 리모델링 | 주요 공사 범위 = 현관, 주방, 욕실, 바닥, 도배, 조명, 붙박이·제작 가구 | 총 공사비 = 5,000만 원
bi-01: 공급면적 = 34평 | 리모델링 구분 = 전체 리모델링 | 주요 공사 범위 = 현관, 주방, 욕실, 바닥, 조명, 붙박이·제작 가구 | —
bi-17: 공급면적 = 112 m² | 리모델링 구분 = 부분 리모델링 | 주요 공사 범위 = 거실, 바닥 | 총 공사비 = 1,250만 원
bi-14: 전용면적 = 84 m² | 리모델링 구분 = 부분 리모델링 | 주요 공사 범위 = 주방 | 총 공사비 = 1,500만 원
bi-15: — | 리모델링 구분 = 부분 리모델링 | 주요 공사 범위 = 욕실 | 총 공사비 = 700만 원
bi-19: 공급면적 = 32평 | — | 주요 공사 범위 = 바닥, 도배, 조명 | 총 공사비 = 1,100만 원
bi-13: 공급면적 = 48평 | 리모델링 구분 = 전체 리모델링 | 주요 공사 범위 = 현관, 거실, 다이닝, 주방, 아이방, 드레스룸, 서재, 욕실, 창호, 조명, 붙박이·제작 가구 | 총 공사비 = 1억 2,500만 원 ~ 1억 4,000만 원
```

No canonical portfolio data was touched (`content/projects.json` is byte-identical). The golden is
unchanged, and a real 1.6.1 build emits `_integration/` byte-identical to it (`detail-facts` B3).

## 2. Release `interior-01@1.6.1`

| | |
|---|---|
| id / hash | `interior-01-1.6.1-8da56de8d28f` / `8da56de8d28f372f645c5490436cd9da1b2ce70951e212a6b031ad991771855d` |
| files | 66 (1.6.0: 65) |
| vs 1.6.0 | added `lib/vocabulary.ts`; changed `lib/format.ts`, `sections/PortfolioDetail.tsx`, `template.ts`. Nothing else, and no platform file |
| why patch | new rendering of already-authorable data plus five optional slots. No content-model, route, section or settings change; every 1.6.0 site document stays valid |
| preflight | the cut was first run in a throwaway root holding the same release-source set. The preflight hash equals the real cut's (`8da56de8d28f`). The real cut was then made with `platform/cli/template-release.ts interior-01@1` |
| old releases | the 13 older stored `interior-01` releases, `1.5.2` and `1.6.0` included, are byte-identical (sha256 fingerprint of all of `data/template-releases/**` before vs. after: the only difference is the 67 new 1.6.1 files) |

**Changelog (`TEMPLATE-160-CHANGELOG`).** The canonical `template.ts` now describes 1.6.0 truthfully:

- it also carried the head-scripts seam (`platform/site/head-scripts.ts`,
  `SiteSnapshotSchema.headScripts`, `SiteContext.headScripts`, `app/head-scripts.ts`);
- `app/layout.tsx` changed, which is a renderer change.

A dated note says what the stored 1.6.0 copy got wrong: it omits the seam, says "no renderer …
change", and calls its output "byte-identical to 1.5.2", which was never verified. The stored 1.6.0
release was **not** edited. The 1.6.1 paragraph states exactly what 1.6.1 changes. It makes no
"byte-identical" or "no renderer change" claim; it is a renderer change.

## 3. Demo re-pin (source only)

- `data/sites/boost-interior-demo/site.json` `.template` → the 1.6.1 id and hash.
- `slots.json` `portfolio.detail`: `areaLabel` is now "면적" (it was "공급면적", the defect). Five
  new labels were added: 공급면적, 전용면적, 리모델링 구분, 주요 공사 범위, 총 공사비.
- Nothing under `data/site-builds/` was built, written or moved.

## 4. Tests

### 4.1 `platform/test/detail-facts.test.ts` (new, 24/0)

The expectation table `WANT` is a literal: 19 records, each with its raw facts and the expected
row strings. `G` proves the table *is* the golden document, so the expected side is never computed
by the code under test.

- `AREA-UI-1…6`: supply + 평, supply + m², exclusive + m² (bi-14), area absent (bi-15), basis
  unstated / unknown → 면적, no conversion, no leak of an old unqualified label.
- `F1…F7`: a row iff the field is authored (19/19); projectType is never inferred (bi-02/03/05/19);
  work scopes come from ids only and are labelled 주요; total semantics; total formatting literals;
  one business truth; no raw ids or basis values in the facts.
- `B0…B7`: a real build of the demo with its 1.6.1 pin in a throwaway root. Built, QA pass, pin
  equal. The labels are the site's real copy. 19/19 detail pages = the golden's `detailUrls`.
  `_integration/` equals the golden byte for byte. 19/19 fact rows agree with the build's own
  integration record. No contradictory label. No raw data token in any shipped page. The
  representative records render as expected.

### 4.2 `step6` restated for the 19-record corpus (32/0, was 27/3)

- **H.** An area may be absent. A present area is labelled by its own basis with the authored
  figure. This holds on every page of the current package and, via `H·build` (U's rebuild with the
  pinned release), over the whole corpus: bi-14 전용면적 84 m², bi-17 공급면적 112 m², no row
  for bi-15.
- **L.** The Step 6 core fields stay required. `galleryGroups` and `keywords` are optional; both
  branches are asserted to be exercised. Every detail page must render a usable visual: its gallery
  images exist in the package and belong to that project, and a cover-only record shows exactly its
  cover. A broken image still fails (`L·build` over the whole corpus).
- **N.** Keyword, type, area, style, price, sort, combined and zero-result cases on the 19-record
  corpus, checked against explicit expected id lists. The expected lists were computed
  independently of `project-filter.ts` and written in as literals.
- **O.** The page set must be exactly the route plan of the package's own records (`planRoutes`
  over the snapshot content, filtered to the packaged ids) plus Next's two error pages. The magic
  15 is gone and no other magic number replaces it. This works in both rollout states.
- **I.** "84 on the portfolio list" is still forbidden, except in a packaged record's own authored
  text when its authored area *is* 84 m² (bi-14's summary "전용 84㎡").

### 4.3 `integration.test.ts` B2 restated (75/0/0)

B2 pins the demo snapshot hash at the live pin. The slots change moves it, so B2 now pins the new
hash `8de4ff87…`. It also proves the residue is exactly the six detail labels: reverting them, with
the pin rolled back, reproduces the old hash `515a7977…`.

### 4.4 Mutation proofs (all sabotage reverted byte-identically)

| sabotage | caught by |
|---|---|
| a single area label for every basis | detail-facts AREA-UI-3/6, B4/B5 |
| projectType inferred from `category` | detail-facts F1/F2 |
| total = pricePerArea × area | detail-facts F1/F4 |
| m² → 평 conversion in `formatArea` | detail-facts AREA-UI-5 |
| area filter OR broken | step6 N |
| exclusive record labelled 공급면적 in site copy | step6 H, H·build |

## 5. Pre-publish state preserved (§20)

A read-only probe (a temporary script, deleted after it ran) reported:

- `demoRollout` = `PRE_PUBLISH_TRANSITION`, publish target `interior-01-1.5.2-d87807590d64`,
  8 packaged records, pin `interior-01-1.6.1-8da56de8d28f`.
- `planPublish` still plans package `286d44ab7d1f…` from release 1.5.2, with the V0.1 integration
  files (`manifest.json` + `portfolio.6346c472e162ae07b76a4686fce54c51.json`).

The new pin therefore does not make `site:publish` generate or publish anything implicitly.
`data/site-builds/**` (`current.json`, `previous.json`, `history.jsonl`, all packages) is
byte-identical before and after the session.

## 6. After the V0.2 publish — suites that will need a restatement (new finding)

A simulated `POST_PUBLISH_STEADY` root was set up in the scratchpad: a copy of the repo with a
1.6.1 V0.2 package built and `current.json` pointed at it. The real repo was not touched.

- Green there: step6 32/0, detail-facts 24/0, ia151 10/0.
- Red there, all from hard-coded 8-record (V0.1-corpus) page counts:

| suite | check | failure |
|---|---|---|
| predemo | P2 | `details.length === 8` (`detail pages: 19`) |
| predemo2 | G1 | `details.length === 8` (`detail pages: 19`) |
| ia150 | P1 | `15 HTML pages: 26 ≠ 15` |
| ia150 | P3 | `details: 19 ≠ 8` |
| ia152 | P1 | `pages with a canonical: 24 ≠ 13` |

`37-` / the `DEMO-PIN-PACKAGE-SPLIT` ledger row said that after the V0.2 publish "no suite edit is
needed (`integration.test.ts` B2b/G1–G5/R2 excepted)". That is not complete: the five checks above
also need a restatement, and it belongs to the controlled publish session. They are recorded in the
ledger as `POST-PUBLISH-SUITE-RESTATE`. They are not caused by 1.6.1; they follow from the
corpus size.

## 7. Review

One fresh-context review. Model: Fable. Brief: the §30 scope list and the change set, with no
expected verdict. The reviewer worked read-only and did its own checks:

- recomputed the 1.6.1 hash from the working tree: 66/66 paths, a match;
- ran `verifyRelease` on all 14 stored releases: pass;
- ran the golden check, tsc and detail-facts in its own temp dir;
- ran a `demoRollout` + `planPublish` probe;
- re-derived every step6 N literal by hand from `projects.json`: all match;
- compared the work-scope words with BoostChat: 26/26 identical.

**0 BLOCKER · 0 MAJOR · 3 MINOR · 6 NOTE.** All 12 scope items OK.

| id | finding | disposition |
|---|---|---|
| MINOR-1 | a Korean site that states a basis and re-pins to 1.6.1 **without** authoring `areaSupplyLabel` / `areaExclusiveLabel` gets the English neutral defaults ("Supply area") instead of its old `areaLabel`. That is fail-safe (never a wrong basis) but a silent copy change on upgrade. The 1.6.1 changelog promises equivalence only for records that state no basis, so it is not false. No such site exists today; the fixtures pin 1.5.1 | **recorded, not fixed in code.** Fixing the changelog would mean a 1.6.2 cut, because `template.ts` is inside the release hash. Upgrade step for any site moving to ≥ 1.6.1: author the two basis labels (as the demo does). Ledger `TEMPLATE-161-UPGRADE-NOTE`, handoff §10 |
| MINOR-2 | `detail-facts` (DETAIL_ROUTES, DETAIL_INTEGRATION_CONSISTENCY, build = golden) was not in `test:platform` | **fixed** — `22faa91` (root `package.json` is not a release source) |
| MINOR-3 | 1.6.1 reproduced from the working tree while `template.ts`, the pin and the release dir were still uncommitted | **fixed** — `23060ad` commits exactly those paths. A clean `git archive 22faa91` passes I2b (integration 75/0/0) |
| NOTE-1 | BoostChat words partial breadth "부분 공사"; the page says "부분 리모델링" (brief §10) | same meaning; recorded in the handoff |
| NOTE-2 | step6 I restated, outside H/L/N/O | accepted by the reviewer: it stays strict, and only a record's own authored 84 m² text is excused |
| NOTE-3 | step6 H assumes integer areas < 1000, to keep its expected figure independent of `formatArea` | accepted; a fractional area would fail H loudly, not silently |
| NOTE-4 | detail-facts' top-level pin/version guard aborts without a FAIL line between a cut and its re-pin | intended guard; left as is |
| NOTE-5 | docs changed during the review | the docs are this report and the status update |
| NOTE-6 | overlapping detail rows | already `DEMO-DETAIL-ROW-OVERLAP` |

No code changed because of the review, apart from the `test:platform` wiring, which is not product
or release code. So no delta review was run.

## 8. Commits

Explicit paths only. `git diff --cached --name-only` / `--stat` were checked before each commit.
Never used: `git add .`, `-A`, stash, reset, restore or checkout. `live-e2e.json` (historical,
class B) was never staged.

| commit | paths |
|---|---|
| `11c3c92` A | `templates/interior-01/v1/{lib/format.ts, lib/vocabulary.ts, sections/PortfolioDetail.tsx, template.ts (slots)}`, `platform/test/detail-facts.test.ts` (unit part) |
| `23060ad` C | `templates/interior-01/v1/template.ts` (version + changelog), `data/template-releases/interior-01/interior-01-1.6.1-8da56de8d28f/` (67 files), `data/sites/boost-interior-demo/{site,slots}.json`, `platform/test/{detail-facts,integration}.test.ts` |
| `21ddf4f` B | `platform/test/step6.test.ts` |
| `22faa91` | `package.json` (`test:platform` += detail-facts) |

C was committed before B, a change from the brief's suggested A → B → C. step6's `H·build` and
`L·build` exercise the pinned release, so the step6 restatement lands after the pin it tests. Between
A and C, I2b is red by design: any release-source edit fails I2b until a cut and re-pin (status
doc, "`I2b` is now a live gate").

## 9. Owner notes (not fixed; additive principle)

- The demo detail page now shows both 공사 유형 (the category) and 리모델링 구분 (projectType), and
  both 공사 범위 (free-text `scope`) and 주요 공사 범위 (structured ids). They are distinct facts
  and none contradicts another in the corpus (`B5`). Merging or hiding one is a product decision.
  If made, it belongs in a later template cut.

## 10. BoostChat handoff (BoostChat not modified; import into its canonical ledger)

```
FROM web-recon  (2026-09-27, 38-pre-publish-web-recon-bundle.md)
TEMPLATE_RELEASE          interior-01@1.6.1  interior-01-1.6.1-8da56de8d28f  (demo source pin)
GOLDEN                    unchanged — resourceVersion d56509c8100a56fdf9644baff78ff9e1,
                          portfolio sha256 c7662414…3816, manifest sha256 b2f52b73…ce5d
                          → WP03-GOLDEN fixture needs no byte change
DETAIL PAGE (detailUrl target) now shows, only when authored:
  area                    공급면적 / 전용면적 / 면적 by basis; authored figure; never converted
  projectType             리모델링 구분 = 전체 리모델링 | 부분 리모델링
  workScopeIds            주요 공사 범위 = BoostChat's own consumer words, authored order
  totalPrice              총 공사비 = exact "5,000만 원" | range "1억 2,500만 원 ~ 1억 4,000만 원"
                          (same label for partial; never a quote, never per-room)
  → a consumer quoting a total now links to a page that shows the same total (36a- F6 closed)
  → spacing differs: page "만 원", BoostChat "만원" — cosmetic, no contract rule
  → breadth wording: page "부분 리모델링" (brief §10), BoostChat "부분 공사" — same meaning
UPGRADE NOTE              a site re-pinning to >= 1.6.1 should author portfolio.detail
                          areaSupplyLabel / areaExclusiveLabel; otherwise a stated basis shows the
                          neutral English default (fail-safe, never a wrong basis)
LIVE STATE                current.json = V0.1 package (1.5.2); nothing published; no V0.2 live
PORTFOLIO-PUBLISH-GATE    IN FORCE — unchanged by this session
WP03-DUAL-READ            OPEN — unchanged
CLOSED IN web-recon       DEMO-AREA-BASIS-LABEL · STEP6-V02-CORPUS-RULES · TEMPLATE-160-CHANGELOG ·
                          DEMO-DETAIL-V02-FACTS
NEW IN web-recon          POST-PUBLISH-SUITE-RESTATE (controlled publish session) ·
                          TEMPLATE-161-UPGRADE-NOTE · DEMO-DETAIL-ROW-OVERLAP (web-recon only)
READY_FOR_CONTROLLED_V02_PUBLISH = YES (web-recon side); PUBLISH_ALLOWED = NO until the gate lifts
```
