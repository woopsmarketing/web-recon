# 02 — Content & Data Proof

> **2026-09-20 재확인:** Site Instance 62개 파일의 sha256이 2026-09-19 최종 상태와 동일하다 (content·settings·theme·slots·assets 변동 0). step6 테스트 29 / 0 재통과.

Step 6의 모든 고객 차이는 **Site Instance 문서**로만 표현했다. 아래는 문서별로 무엇을 넣었고, 어떤 계약을 지켰는지다.

## 1. 문서 목록 (`data/sites/boost-interior-demo/`)

| 문서 | schema | origin | 비고 |
|---|---|---|---|
| `site.json` | schemaVersion 1 | — | identity + release pin |
| `settings.json` | schemaVersion 1 | — | override 3개 섹션 |
| `theme.json` | theme-contract-v1 | — | 13 tokens, 전부 Template `consumes` 목록 안 |
| `slots.json` | schemaVersion 1 | — | 12 섹션 · 81 slot의 문구·라벨·media·link |
| `content/business.json` | business@1 | synthetic-fixture | summary, email |
| `content/categories.json` | categories@1 | synthetic-fixture | 4 공사 유형 |
| `content/projects.json` | projects@1 | synthetic-fixture | 8 projects — **유일한 project collection** |
| `content/reviews.json` | reviews@1 | synthetic-fixture | 6 published |
| `content/banners.json` | banners@1 (PROVISIONAL) | synthetic-fixture | 3 slides |
| `assets/registry.json` + 52 files | assets@1 | synthetic-fixture | logo + 51 shot seats |

모든 content 문서의 origin은 `synthetic-fixture`다 — 데이터 수준에서 "가상"임을 선언한다 (테스트 **Y**: `customer`/`reference-fixture` 0).
새 schema·새 필드·새 문서 종류는 **하나도 추가하지 않았다.** Zod strict schema가 그대로 통과한다.

## 2. One canonical projects collection (§19)

- `content/`에는 platform 문서 5개뿐이다. `projectsA[]` / `projectsB[]` 같은 두 번째 collection은 없다 (테스트 **Q+R**).
- Home A("대표 프로젝트")와 B("다른 시공 사례")는 **settings의 selection 두 개**다:
  `manual [bi-01, bi-03, bi-02, bi-05]` / `manual [bi-04, bi-06, bi-07, bi-08]` — 겹침 0, 전부 실재 id.
- Portfolio index는 같은 8개를 그대로 나열한다.

## 3. Project data quality (§13)

8개 전부: `title · slug · summary · body(2~4문단) · location · area{value,unit,basis} · category · scope[] · keywords[] · period · durationWeeks · cover · galleryGroups[]`.
6개는 `pricePerArea`, 5개는 `customerQuote`, 1개(bi-04)는 공사 전/후 2쌍. slug·id 중복 0 (테스트 **L**).

본문은 "무엇이 불편했고 → 무엇을 바꿨고 → 왜"의 순서로 썼다. 과장·수치 자랑 없음.
독립 copy 리뷰 지적으로 고친 것: 용어 드리프트(전체 리모델링 프로젝트에 "리뉴얼" 사용), attribution 표기(경산 → 경산시),
후기와 프로젝트 사이의 모순(32평 후기에 34평 집의 디테일), `화이트 톤`/`화이트톤` 혼용, 욕실이 scope에 없는 전체 리모델링 2건에 설명 문장 추가.

## 4. Area basis contract (§15)

| 규칙 | 구현 | 검증 |
|---|---|---|
| "34평" = 공급면적 | flagship `area: { value: 34, unit: "pyeong", basis: "supply" }` | **H** |
| `unknown`을 습관적으로 쓰지 않는다 | 8개 전부 `basis: "supply"` 명시 | **H** |
| 34평 = 84㎡라고 쓰지 않는다 | 면적 fact는 `34평`만 렌더. 84㎡는 본문에 **별도 사실**로 한 번: "공급면적 약 34평, 전용면적 약 84㎡인 아파트입니다." | **I** |
| 자동 환산 금지 | Template `formatArea`는 변환하지 않는다. package 어디에도 `112㎡`(34평의 산술 환산)·`34평 = 84` 패턴 없음 | **I** |
| 화면의 basis 표시 | detail의 면적 라벨 slot = `공급면적` (전 프로젝트가 supply일 때만 참 → 테스트가 강제) | **H** |

`AUTO_EQUIVALENCE_34_TO_84 = NO`. 한계: `area.basis`는 Template이 렌더하지 않는 data다 → `06-open-items.md` L2.

## 5. Filter contract 재사용 (§14)

Site가 한 일은 **기존 scale id 선택** 두 줄뿐이다: `areaScale: "pyeong"`, `priceScale: "krw-pyeong"`.
evaluator(`platform/content/project-filter.ts`)·URL 계약(`keyword,type,area,style,price,sort,fp`)·DOM hook은 그대로.

기대값은 **손으로 계산**해 테스트(platform evaluator)와 visual smoke(실제 브라우저) 양쪽에 고정했다:

| case | query | 기대 |
|---|---|---|
| keyword (title/summary/scope/keywords) | `keyword=수납` | bi-01, bi-03, bi-07 |
| keyword (location) | `keyword=수성구` | bi-01, bi-03, bi-08 |
| keyword (scope) — UI 타이핑 | `중문` | bi-01, bi-06 |
| type | `type=kitchen-bath` | bi-04 |
| area bucket | `area=30` (30평대) | bi-01, bi-04, bi-06 |
| style | `style=화이트` | bi-01, bi-02, bi-04, bi-06, bi-07 |
| area OR | `area=lt20&area=50plus` | bi-07, bi-08 |
| style | `style=그레이지` | bi-03, bi-08 |
| price bucket | `price=250` (평당 250–300만) | bi-01, bi-05, bi-07 |
| sort | `sort=area-desc` / `sort=price-asc` | 8건, 첫 카드 = bi-08 (51평 / 160만) |
| combined | `type=full-remodel&style=화이트&area=30` | bi-01 |
| zero result | `keyword=한옥` | 0건 + 한국어 empty state |
| reset | 필터 초기화 | 8건, URL clean |

결과: 테스트 **N** pass, 브라우저 filter check 전부 pass (`04-validation.md`).

## 6. Banners@1 (§17) — 충분했는가

**충분했다.** 3 슬라이드 = image + headline + text + closed CTA(project ×2, contact ×1). pc/mobile 분기·display order·자유 URL 없이 표현됐다 (테스트 **S**).
한 가지 경계: CTA target에 "포트폴리오 목록"이 없다. "프로젝트 전체 보기"를 hero에 두고 싶었지만 계약상 불가 →
첫 슬라이드는 "대표 프로젝트 보기 → bi-01", 목록 진입은 intro의 link slot(`/portfolio`)과 header nav가 맡는다. Demo에는 지장 없음 (`06` L3).

## 7. Reviews@1 (§20)

6건 published, 실생활 개선 이야기 위주(관리 걱정 → 마감재 제안, 주방 동선, 현관 벤치, 예산 우선순위, 소형 평수 수납, 진행 공유).
실명·아파트 단지명·계약 정보 0. attribution은 `NN평 아파트 · 가구 형태` 한 가지 패턴 (테스트 **T**).

## 8. Slots — 한국어화

81개 slot 전부 한국어. 접근성 라벨(슬라이드 재생/일시정지, 이전/다음, 페이지 이동)까지 포함.
한글 줄바꿈은 Template의 `word-break: keep-all`이 이미 처리한다. 320px stress에서 발견된 한 건("수납 / ·동선을" — 가운뎃점으로 시작하는 줄)은
**문구를 "수납과 동선"으로 바꿔** 해결했다. Template CSS는 건드리지 않았다.

## 9. Identity / SEO data

`<html lang="ko-KR">`, title `부스트 인테리어`, detail title `<프로젝트명> | 부스트 인테리어`, description = `business.summary`,
list/detail canonical과 sitemap이 `https://boost-interior-demo.example` 기준 (테스트 **X**).
Home에는 canonical이 없고 OG tag는 어느 페이지에도 없다 — Template 1.4.0의 성질이며 Step 6 범위 밖 (Pre-Demo Gate "full SEO QA"; `06` O4).

## 10. 데모 고지 문구에 대한 결정

초안은 `legalName`과 `business.summary`에 "데모용 가상 브랜드 … 예시입니다"를 넣었고, 이것이 **모든 페이지의 meta description과 푸터 상호**로 렌더됐다.
독립 copy 리뷰가 "실제 업체 사이트처럼 보여야 한다(§12)"와 충돌하는 MAJOR로 지적 → 제거했다.
가상이라는 사실은 (a) 모든 content 문서의 `origin: synthetic-fixture`, (b) resolve되지 않는 `.example` 도메인·이메일, (c) 이 보고서에 남아 있다.
**공개 배포 전에는** 가상 후기를 실제 후기로 바꾸거나 고지를 되살려야 한다 (`06` O7).
