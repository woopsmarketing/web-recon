# Step 6 — Demo Customer Content Proof · 부스트 인테리어

> **2026-09-20 갱신:** AI 이미지 51/51 provisional auto-approve + 반영 완료 (stand-in 0, build `aa6e7539…`, smoke 237/237, test:platform 235/0). 아래 상태 블록은 그 이전 시점 기록이다 — 최신 상태는 [`09-ai-images-complete.md`](09-ai-images-complete.md). 남은 것은 사람 눈검수.

```
STEP6_STATUS                   = PARTIAL
DATA_ONLY_SWAP                 = PASS
AI_PORTFOLIO_ASSETS            = WAITING   (0 / 51 approved)
FLAGSHIP_SAME_HOME_CONSISTENCY = NOT_READY (판정할 이미지 없음)
RASTER_INGESTION_REHEARSAL     = PASS      (격리 scratch · 합성 테스트 패턴)
REAL_APPROVED_RASTER_INGESTION = NOT_YET_RUN
INGESTION_PIPELINE             = 리허설 PASS / 실제 승인 이미지로는 미실행 — PASS·FAIL 어느 쪽으로도 단정하지 않는다
HUMAN_REVIEW_READY             = YES (현재 사이트 눈검수: site.html · AI 이미지 승인 시트: index.html)
NEXT                           = Generate/approve AI portfolio images, then close Step 6 PASS
```

2026-09-20 마감 실행 · Template `interior-01-1.4.0-9e1ea20da947` · Site `boost-interior-demo` ·
build `4d3d08f4d35b11e9…` · packageHash `0830462fb5d5cd96…` (2026-09-19 빌드 그대로 — 입력 불변이라 `up-to-date`)

**PARTIAL인 이유는 하나뿐이다: 실제 AI 승인 이미지가 0장이다.** 핵심 아키텍처 증명은 전부 PASS이고 이번 실행에서 다시 확인했다.

---

## 2026-09-20 마감 실행 — 무엇을 했고 무엇이 남았나

1. **무엇을 했는가.** 승인 이미지 실사 → 0장 확인 → 이미지를 지어내지 않고, 이미지 없이 닫을 수 있는 것을 전부 닫았다:
   현재 상태 재검증(전체 green), 격리 ingestion 리허설, ingestion operator guard, human-review pack 보강, 사람이 할 일 명문화.
2. **몇 장이 승인·반영됐는가.** **0 / 51.** `references/boost-interior/generated-approved/`에는 `manifest.json`만 있다(정상).
   flagship 0 / 13 · 그 외 0 / 38. 사이트 이미지는 51개 전부 일러스트 stand-in SVG 그대로다.
3. **1장 ingestion 증명.** 실제 승인 이미지로는 **수행 불가**(입력 부재 — 실패 아님).
   대신 저장소 밖 scratch devroot에서 합성 테스트 패턴 1장으로 전 구간을 리허설했다:
   raster input → ingestion → centre crop/resize → JPEG → registry `image/jpeg` → 같은 release로 build → package asset 참조 → 브라우저 렌더(1600×1200 로드, error 0) → visual smoke 237/237.
   합성 이미지는 저장소·Site·package에 **한 장도 남아 있지 않다** (기록: `proof/raster-ingestion-rehearsal.json`, 상세 `03` §0.4).
4. **Flagship consistency.** `NOT_READY` — stand-in 일러스트는 same-home 증거가 아니다. 사람 검수용 체크리스트와 shot별 Template seat crop 미리보기는 준비됐다.
5. **데모 사이트의 현재 수준.** 구조·데이터·레이아웃·한국어·필터·CTA·SEO identity는 데모 가능한 수준이고 자동 검증이 전부 통과한다.
   **사진이 없어서** 고객 설득력은 아직 판단할 수 없다. 표현상 남은 것은 Template 소유(L1 `KRW 2,900,000 / 평`, O14·O15 모바일 affordance 등)라 Pre-Demo Gate로 넘긴다.
6. **남은 blocker.** AI 이미지 생성·승인(51장, 최소 경로는 flagship 13 + site-level 7 = 20장) → 실제 ingestion → same-home 사람 검수. 코드 blocker는 없다.
7. **어디를 보면 되는가.**
   - 현재 사이트 눈검수: `human-review/site.html` (핵심 6장 + 전 viewport, build id/packageHash 표기)
   - AI 이미지 승인 시트: `human-review/index.html` (51 shot 상태 표 · seat crop 미리보기 · same-home 체크리스트 · 판정/메모 → JSON 내보내기)
   - 스크린샷 원본: `screens/home-390.png` · `home-1440.png` · `portfolio-390.png` · `portfolio-1440.png` · `detail-flagship-390.png` · `detail-flagship-1440.png` (+ `*-fold.png`, 800/1000/1920, filtered, before/after, 404)
   - 무엇을 어떻게 볼지: **`07-human-review-guide.md`**

이번 실행의 변경 범위: Step 6 스크립트 2개(`step6-assets.ts` guard · `step6-review-pack.ts`), 이 결과 폴더, `references/boost-interior/generated-candidates/README.md`.
Template · Platform runtime · release 7개 · fixture · `src/**` · Supabase · BoostChat · `package.json` 변경 **0** (실행 전/후 sha256 tree 동일, `04` §0.3). commit/push 없음.

### Ingestion operator guard (이번에 추가 · 유지)

`scripts/template-platform-step6-assets.ts` — 경고만 하고 **거부하지 않는다.** 출력과 `04-asset-status.json`에 기록된다(비어 있으면 필드 자체가 없어 기존 출력과 byte-identical).

| 경고 | 의미 |
|---|---|
| `unmatched approved file` | 승인 폴더에 있는데 ingest되지 **않은** 파일 — shotId가 아닌 이름 / `.jpeg` 등 미허용 확장자 / 같은 shot의 다른 확장자에 가려짐 |
| `upscaled` | 원본이 seat보다 작아 확대됨 (예: 4:3 seat는 1600×1200 미만) |
| `heavy-crop` | 원본 비율이 seat와 달라 이미지의 80% 미만만 남음 (예: 세로 사진) |

---

# (2026-09-19 기록) 최초 Step 6 실행의 요약

## What was proven?

하나의 immutable Template Release가 **Site data / settings / theme / slots / assets / identity만** 바꿔서
완전히 다른 고객 사이트(한국어 · 다른 브랜드 · 다른 색 · 다른 콘텐츠 · 다른 필터 scale · 8 프로젝트)를 만든다.
첫 빌드(`8398272c…`)가 Template 수정 없이 성공했고, 이후 두 번의 rebuild(`eca5cb39…`, `4d3d08f4…`)는 전부 문구 수정이었다.
같은 release로 fixture 3개 + demo 1개 = **4개 Site Instance**가 서로 다른 buildInputId · snapshot · 렌더 결과로 공존한다.
독립 rebuild가 같은 `packageHash`를 낸다 (재현성).

## Was Template modified?

**NO.** `TEMPLATE_SOURCE_HASH` before = after = release record =
`93d7da0fc06e1583d30af6aa40dd0e95297ab3b7a5e83bd73fea95fd82b8ea83`.
live source 54개 파일이 release의 frozen 사본과 파일 단위로 동일, `templates/**`·`platform/**`(test 제외) tree hash 동일,
release cut 이후 수정된 구현 파일 0. 독립 리뷰어가 mtime과 release hash 재계산으로 따로 확인했다. → `05`

## Which Release was reused?

`interior-01-1.4.0-9e1ea20da947` (hash `9e1ea20da9472d3bb003a27ff5f7374c76fa350c5941beb79457441576130961`).
새 release **없음**, release 디렉터리 7개 전부 byte-identical.

## Was a new Site Instance created?

**YES** — `data/sites/boost-interior-demo/`. `fixture-large / small / empty`는 site·build pointer·history·package까지 byte-identical이고,
기존 fixture visual smoke 962/962.

## What changed?

Site Instance 입력만: identity(`site.json`) · content 5문서 · settings(A/B selection, `pyeong`/`krw-pyeong` scale) · slots 81개(전부 한국어) ·
theme 13 tokens · assets 52개 · 그 결과인 buildInputId.
그 밖에: Step 6 테스트/스크립트/보고서, `package.json`에 테스트 1개 append.

## What did not change?

Template source · Platform runtime · Template Release(전부) · routing · filter evaluator · CTA 구현 · 기존 fixtures ·
legacy `src/**` · Supabase · BoostChat. commit/push 없음.

## Was the brand clearly different?

**YES (구조·데이터 수준).** 한국어(`ko-KR`), 부스트 인테리어 wordmark+SVG 로고, warm off-white / charcoal / restrained orange, radius 10px, 한글 폰트 스택,
평형·평당 공사비 필터, 한국 아파트 프로젝트 8건, 한국어 후기 6건. Harbor & Pine · fixture · Apartmentary 흔적 0 (테스트 F, G).
단, **사진이 없으므로** "시각적으로 납득되는 다른 브랜드"의 최종 판정은 이미지 이후 human gate에서 한다.

## Were AI portfolio images used?

**NO — 한 장도 생성되지 않았다.** Claude Code 환경에 이미지 생성 tool/API/로컬 생성기가 없다 (CASE B, 확인 내역 `03` §1).
대신 완성한 것: Visual Bible(18항목, K1–K19 / N1–N11, 고정 평면) · 51-shot list · production-ready prompt pack · manifest ·
ingestion 스크립트 · 검수용 contact sheet. 현재 사이트 이미지는 전부 **일러스트 stand-in SVG**이며 모든 곳에 그렇게 표시했다.
Reference 14장은 전부 타 업체 뷰어 스크린샷(캡션·UI·로고·실물 소품 포함) → **reference-only**, public 복사 0 (테스트 K2).

## Was banners@1 sufficient?

**YES.** 3 슬라이드(image + headline + text + closed CTA)로 hero가 성립했다. 경계 1건: CTA target에 "포트폴리오 목록"이 없어
intro link + nav로 대체 (`06` L3).

## Any Template limitation discovered?

data-only를 **막은 것은 없다.** 기록만 한 표현 경계 3건 (`06` §B):

- **L1** 평당 공사비가 `KRW 2,900,000 / 평`으로 렌더 — 포맷이 Template 소유라 `평당 290만 원`으로 못 바꾼다. **Pre-Demo Gate에서 볼 1순위.**
- **L2** `area.basis`가 렌더되지 않는다 — "공급면적"은 label slot이고 전 프로젝트 supply를 테스트가 강제. mixed-basis 사이트는 오표기 위험.
- **L3** banner CTA → portfolio 목록 불가.

독립 visual 리뷰가 지적한 모바일 carousel peek(다음 카드가 잘려 보임)과 detail tab bar의 스크롤 cue 부재도 Template 소유 동작이라 **고치지 않고** Pre-Demo Gate로 넘겼다 (`06` O14·O15).

## Validation

typecheck:platform PASS · test:platform **235 / 0** (step6 29) · Step 6 visual smoke **237 / 237** ·
non-local requests **0** · broken media **0** · horizontal overflow **0** (320px 포함) · console/page errors **0** ·
fixture regression NONE. 독립 READ-ONLY 리뷰 4건의 지적은 전부 site data / prompt pack / 테스트로만 반영했다. → `04`

## Final verdict

**PARTIAL.** 플랫폼 질문("같은 release, data만 바꿔 다른 고객 사이트")에는 **YES로 답했다.**
그러나 이 Step의 이름은 *Demo Customer Content Proof*이고, 고객을 설득하는 것은 포트폴리오 사진이다. 사진 없이 PASS라고 하지 않는다.

**PASS로 가는 길 (Template·content 문서 수정 없음):** `02-prompts.md`로 생성 → `generated-candidates/`에 저장 → `human-review/index.html`로 검수 →
승인본만 `generated-approved/`로 이동 → `step6-assets.ts` → `site:build` → smoke + review pack. (`07` §1, `03` §5)

`NEXT = Generate/approve AI portfolio images, then close Step 6 PASS` (Pre-Demo Gate 항목은 `06` §D 그대로 carry forward)

## 문서

| | |
|---|---|
| `01-demo-site.md` | 사이트 구성·브랜드·theme·프로젝트 |
| `02-content-and-data-proof.md` | 문서별 data 증명, area basis, filter, banners, reviews |
| `03-assets-and-image-generation.md` | CASE B, prompt pack, stand-in, ingestion 경로 |
| `04-validation.md` | 테스트·smoke·hash·리뷰 결과 |
| `05-template-reuse-proof.md` | same release / 4 sites / changed-vs-unchanged |
| `06-open-items.md` | blocking, Template limitation, carry-forward |
| `07-human-review-guide.md` | 사람이 볼 것 · 경로 · 다음 flow (2026-09-20) |
| `image-generation/` | visual bible · shot list · prompts · manifest · asset status |
| `human-review/index.html` · `site.html` | AI 이미지 검수 sheet · 사이트 스크린샷 pack |
| `screens/` · `proof/` | 스크린샷 32장 + report.json · baseline/final hash · `raster-ingestion-rehearsal.json` |
