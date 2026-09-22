# 07 — Human Review Guide (사람이 볼 것 · 할 것)

코드 설명은 없다. **무엇을 열고, 무엇을 보고, 다음에 무엇을 하면 되는지**만 적는다.
현재 상태: `STEP6_STATUS = PARTIAL` — AI 승인 이미지 **0 / 51**, 아래 flow의 **1번도 시작하지 않은 상태.**

## 1. 경로와 flow

```
REFERENCE            references/boost-interior/project-01-white-34p/          (타 업체 스크린샷 14장 — reference-only, 공개·복사 금지)
AI CANDIDATES        references/boost-interior/generated-candidates/          (AI 생성 후보 staging — 지금은 README만)
AI APPROVED          references/boost-interior/generated-approved/            (사람이 승인한 최종본만 — 지금은 manifest.json만, raster 0장 = 정상)
PROMPT PACK          docs/result/recon-template-platform-step6-demo/image-generation/02-prompts.md
GENERATION MANIFEST  docs/result/recon-template-platform-step6-demo/image-generation/03-generation-manifest.json
AI REVIEW            docs/result/recon-template-platform-step6-demo/human-review/index.html
SITE REVIEW          docs/result/recon-template-platform-step6-demo/human-review/site.html
```

| # | 할 일 | 비고 |
|---|---|---|
| 1 | prompt pack 기준으로 AI 이미지 생성 | shot마다 prompt · negative · 비율 · 기대 파일명이 있다. flagship `bi-01`은 모든 prompt에 같은 home bible 문단이 들어 있다. `bi04-*-before` 2장은 **승인된 after 이미지에서 image-to-image**로 만든다 |
| 2 | `generated-candidates/<shotId>.<ext>`로 저장 | 시안이 여러 개면 `<shotId>__v2.jpg`처럼 보관 |
| 3 | 사람이 눈검수 | §3 체크리스트. reference와 **같은 "언어"인지** 보되 1:1 복제는 금지 |
| 4 | 승인한 것만 `generated-approved/<shotId>.jpg\|png\|webp`로 **이동** | 파일명은 정확히 shotId. `.jpeg` 불가. 4:3 seat는 **1600×1200 이상**, hero는 **2400×1350 이상** |
| 5 | assets ingestion | `./node_modules/.bin/tsx scripts/template-platform-step6-assets.ts` — 출력에 `WARNING`이 있으면 build 전에 해결. **처음에는 `bi01-living-01` 1장만** 넣고 registry가 `image/jpeg`로 바뀌는지 확인한 뒤 확장 |
| 6 | site build | `pnpm site:build boost-interior-demo` — 같은 release, 새 buildInputId. content 문서는 바뀌지 않는다 |
| 7 | visual smoke | `./node_modules/.bin/tsx scripts/template-platform-step6-visual-smoke.ts` → 237/237, broken media 0 |
| 8 | human review | `./node_modules/.bin/tsx scripts/template-platform-step6-review-pack.ts` 후 `index.html`(원본 ↔ ingest 결과 ↔ seat crop) · `site.html` 확인, 판정을 JSON으로 내보내기 |
| 9 | **51 / 51 + same-home consistency 통과 → Step 6 PASS** | `pnpm test:platform` 1회로 확증. 일부만 승인되면 자동으로 `PARTIAL` |

최소 경로: **flagship 13장 + site-level 7장 = 20장**이면 home 상단과 flagship detail이 전부 실사진이 된다 (그래도 verdict는 PARTIAL).

## 2. 지금 바로 — 현재 Demo Site 눈검수 (5–10분)

`human-review/site.html`을 연다. 맨 위에 buildInputId / packageHash가 있고, **핵심 6장**(home · portfolio · flagship detail × 390 / 1440)이 먼저 나온다. 이미지는 전부 일러스트 stand-in이므로 **사진 품질은 보지 말고 구조를 본다.**

빠른 순서: ① 핵심 6장 훑기(2분) → ② Home 800 / 1000 / 1920에서 깨짐 확인(1분) → ③ filtered portfolio · before/after detail · 404(2분) → ④ 아래 체크 항목에 PASS/FAIL 메모(3분).

### Home
- 한국 인테리어 업체 사이트처럼 보이는가 (fixture의 Harbor & Pine 흔적이 없는가)
- hero → intro → 대표 프로젝트(A) → 다른 사례(B) → 후기 → footer의 **리듬**이 자연스러운가
- 오렌지 포인트가 과하지 않은가 (버튼 · 링크 · 로고 외에는 절제돼 있는가)
- 390 / 800 / 1440에서 깨짐 · 가로 스크롤 · 어색한 줄바꿈이 없는가
- floating "상담 문의"가 내용을 **심각하게** 가리지 않는가 — 모바일 첫 화면에는 header 버튼과 floating 버튼이 함께 보인다 (`06` O16)
- 알려진 것: 모바일 carousel에서 다음 카드가 잘려 보인다 (`06` O14 — Template 의도, Pre-Demo Gate에서 판단)

### Portfolio
- 한국어 필터(평형 · 공사 유형 · 스타일 · 평당 공사비)가 자연스럽게 읽히는가
- 검색 / 필터 / 정렬이 시각적으로 이해되는가, filtered 화면에서 선택 상태가 분명한가
- 모바일에서 필터 UI가 깨지지 않는가
- 카드 grid의 간격 · 제목 · 메타 정보 리듬이 자연스러운가

### Detail
- 제목 → gallery → facts → story → 후기 → CTA의 위계가 분명한가
- **공급면적 34평** 표현이 맞게 보이는가 (84㎡로 자동 환산하지 않는다)
- 가격 표현: 현재 `KRW 2,900,000 / 평` (`06` L1 — Template 소유, 어색함을 받아들일지 판단)
- 모바일 공간 tab bar: 뒤쪽 tab(침실 · 욕실)을 **발견할 수 있는가** — 390px에서 5번째 tab이 잘린 채 시작하고 스크롤 cue가 없다 (`06` O15)
- floating CTA가 facts grid 오른쪽 열을 가리는 정도가 받아들일 만한가

**PASS 기준:** 위 항목에서 "고객에게 보여 주기 곤란한" 문제가 없다(알려진 Template 항목 제외).
**FAIL 기준:** 깨진 레이아웃 · 가로 스크롤 · 잘린 한글 제목 · 영어/fixture 잔재 · CTA가 핵심 정보를 읽을 수 없게 가림.

## 3. 나중에 — AI 이미지 승인 검수

`human-review/index.html`을 연다. 지금은 **WAITING FOR AI GENERATION · 0 / 51 approved**로 표시되고 모든 칸이 stand-in이다(깨진 이미지 없음).
이미지가 들어오면 shot마다 **원본 approved ↔ ingest 결과 ↔ Template seat crop 미리보기**가 나란히 보이고, PASS / REVIEW / FAIL과 메모를 남긴 뒤 "검수 결과 JSON 내보내기"로 저장한다(브라우저 localStorage에만 저장되므로 내보내기 필수).

### Flagship `bi-01` same-home consistency (가장 중요)
- 동일 바닥 재료 · 모듈 · 방향
- 동일 벽 마감 · 걸레받이
- 동일 천장 라인 · 간접조명 형태 · 조명 색온도
- 동일 붙박이장 · **oak niche** (위치가 고정 평면과 맞는가)
- 동일 **3연동 중문** (패널 수 · 프레임)
- 동일 kitchen plan (싱크 라인 · 키큰장 · 벽 마감 · 금속)
- 거실 ↔ 주방 ↔ 현관 **공간 관계**가 컷 사이에서 모순되지 않는가 (`bi01-living-02` · `bi01-kitchen-02` · `bi01-entrance-01`이 증명 컷)
- 13장을 나란히 놓았을 때 **같은 집이라고 느껴지는가**
- AI geometry 오류: 뒤틀린 선 · 불가능한 창/문 · 비정상 광원 · 가구 비례
- 문 / 창 / 조명 / 가구의 **증식**(같은 것이 두 번 나타남)
- reference 업체의 실물 소품 · 브랜드 로고 · 에너지 라벨 · 뷰어 UI · 캡션이 복제되지 않았는가
- **Template crop 후에도 핵심 요소가 남는가** — 아래 표

판정: **PASS**(전 컷이 같은 집) / **PARTIAL**(1–3컷만 이질적 → 그 컷만 재생성) / **FAIL**(집이 여러 채로 보임).

### Template이 실제로 자르는 방식 (2026-09-20 실측, 전부 중앙 기준 cover)

| 자리 | 비율 | 의미 |
|---|---|---|
| Detail gallery 타일 | **1:1** | 4:3 원본의 좌우 12.5%씩 사라진다 → 니치 장 · 중문은 가운데 75% 폭 안에 |
| Portfolio 목록 카드 | 4:3 | crop 없음 |
| Home 프로젝트 카드 (cover shot) | ≈1.53:1 | 위아래 약 13% 사라진다 → 천장 간접조명 라인 확인 |
| Home hero — 데스크톱 | 1.76:1 | 거의 그대로 |
| Home hero — **모바일** | **세로 2:3** | 16:9 원본의 **가운데 약 38%만** 보인다 → hero 피사체는 반드시 정중앙 |
| Band / Reviews / Portfolio banner | 데스크톱 2.5–4.5:1, 모바일 1.4–1.75:1 | 데스크톱은 얇은 띠, 모바일은 가운데 절반 |

### 그 외 프로젝트 (`bi-02` … `bi-08`)
프로젝트 안에서는 같은 집, 프로젝트끼리는 **서로 다른 집**으로 보여야 한다. `bi-04`의 before/after는 같은 시점 · 같은 구조여야 한다.

## 4. 5분 요약

1. `human-review/site.html` → 핵심 6장 → Home/Portfolio/Detail 체크 → 메모.
2. 이미지 작업을 시작할 때 `02-prompts.md` → `generated-candidates/` → `index.html`로 검수 → 승인본만 `generated-approved/` → §1의 5–8번 명령.
3. 막히면 `06-open-items.md` §A(blocker)와 `03` §0.4(리허설에서 알게 된 함정)를 본다.
