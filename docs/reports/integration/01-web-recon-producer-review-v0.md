# 01 — web-recon Producer Review V0

- 날짜: 2026-09-21 (독립 리뷰 반영판 — `05`)
- 성격: **READ-ONLY.** production code · test · fixture · data · schema · template 수정 0. 구현 0. 쓴 파일은 이 폴더의 보고서뿐이다.
- 요구사항 원문: `00-requirement.txt` (`prompt` 사본)
- 입력
  - producer 실물: `platform/**`, `templates/interior-01/v1/**`, `workers/recon-runtime/**`, `data/sites/boost-interior-demo/**`, `data/site-builds/boost-interior-demo/**`, `docs/architecture/recon-template-platform.md`
  - 선행 조사: `docs/result/boostchat-portfolio-data-readiness/` (정본으로 믿지 않고 핵심은 원문으로 재확인)
  - consumer 문서(읽기만): `boost-chat/docs/reports/integration/web-recon-consumer-requirements-v0.{md,json}`, `web-recon-first-party-data-audit.md`, `…-inventory.json`, `…-audit-review.md`
- 방법: 조사 4갈래를 하위 에이전트로 병렬 실행했다. **ProjectSchema · project filter · area/price model · id · build package · routes · assets · SiteSnapshot/buildSiteSnapshot · publish · runtime 은 main 이 원문을 직접 읽어 확인했다.** 하위 에이전트 보고 중 한 건(“bi-07 에 가격 없음”)은 원문과 달라 버렸다(실제: bi-07 은 2,700,000 KRW/평. 가격이 없는 것은 bi-04, bi-06).
- 증거 표기: **CONFIRMED** = 코드/데이터에서 직접 확인 · **INFERRED** = 확인된 사실에서 추론 · **UNKNOWN** = 지금은 알 수 없음

---

## 1. Executive Summary

1. **web-recon 은 consumer 가 가정한 것보다 훨씬 구조화되어 있다.** 면적은 이미 `{value, unit, basis}` 이고 단가는 `{amount, currency, unit}` 다. 단위 없는 수치는 schema 상 존재할 수 없다. → consumer 가 제안한 manifest `defaults` 는 필요 없다(REJECT).
2. **가장 큰 격차는 consumer 가 걱정한 곳이 아니라 vocabulary 다.** `propertyType` 필드는 없다. `style` 필드도 없다. 있는 것은 `keywords`(색·스타일·기능·소재가 섞인 자유 태그)와 `scope`(세분도가 제각각인 방 이름)와 `category`(id+name 의 닫힌 taxonomy, 100% 채움)다.
3. **예산 매칭은 V0 에서 성립하지 않는다.** 총 공사비 필드가 없고, 부분 공사 2건에는 단가도 없고, 단가의 면적 기준·포함 범위가 없다. 계약은 "방문자 예산"과 "사례 가격"을 이름부터 분리하고, 총액 적합성 주장을 금지해야 한다.
4. **정적 패키지 + pointer 활성화 구조가 이미 구현되어 있다(로컬 검증, live 미배포).** manifest·index 를 같은 불변 패키지에 넣으면 consumer 가 걱정한 배포 race 대부분이 구조적으로 사라진다. `.json` 의 Content-Type, 고정 경로 파일의 `max-age=0`, no-redirect 가 **이미 현재 코드의 기본 동작**이다.
5. **Contract V0 후보의 핵심 변경** (consumer 초안 대비):
   - manifest 는 core 만 남긴다. `vocabulary`·`allResults` 는 portfolio 전용이므로 **resource document 안으로** 옮긴다. `defaults`·`recordCount`·`generatedAt` 는 뺀다.
   - 고정 facet 이름(`propertyType`/`style`/`scope`)을 record 필드로 두지 않고 **`facets` 맵**으로 둔다. V0 well-known key 는 `category`·`scope`·`tag`. keywords 를 `style` 이라고 부르지 않는다.
   - `basis` 의 "모름"은 `"unknown"` 문자열이 아니라 **생략**이다(누락 규칙 하나로 통일).
   - `version` 은 기존 식별자 재사용이 아니라 **projection 내용 hash**(기존 canonical-JSON hash 도구 재사용).
6. **ProjectSchema 변경 없이 V0 가 가능하다.** 필요한 producer 작업은 emitter(순수 projection) + 빌드 파이프라인 호출 1곳 + 몇 개의 gate 다.
7. **Widget embed 는 데이터 계약과 분리한다.** 현재 패키지 QA 는 자기 origin 이 아닌 절대 URL 을 전부 실패시키므로, 위젯은 "선언된 embed origin 만 허용"하는 별도 seam 과 새 Template Release 가 필요하다.
8. 최종 질문의 답은 **CONDITIONAL YES** (§14, `04` 문서 말미).
9. **독립 리뷰(fresh context)가 BLOCKER 1 · MAJOR 7 · MINOR 8 · NOTE 2 를 냈고 전부 문서에 반영했다**(`05`). 사실 기반(이 문서)은 spot-check 에서 전부 유지됐고, 결함은 모두 계약 문구였다: 통합을 끈 사이트와 일시 장애를 구분하지 않은 것(F-01), "이미 화면에 보이는 정보"라는 보안 전제가 두 필드(`basis`, `publishedAt`)에서 거짓인 것(F-02), 결정성 규칙의 빈틈(F-03), 데모 규모에 가려진 scope 상한 문제(F-05). 어느 것도 코드를 요구하지 않았다.

---

## 2. Actual web-recon data contract

### 2.1 문서 종류와 버전 관례 — CONFIRMED

| 문서 | 파일 | 버전 표기 | 근거 |
|---|---|---|---|
| Site Instance | `site.json` | `schemaVersion: 1` (정수) | `platform/site/instance.ts:75-84` |
| Settings (sparse override) | `settings.json` | `schemaVersion: 1` | `platform/settings/settings.ts:29-35` |
| Theme / Slots | `theme.json` / `slots.json` | `schemaVersion: 1` | `platform/site/load.ts:109-116` |
| Business (singleton) | `content/business.json` | `"business@1"` | `platform/content/schema.ts:292-298` |
| Projects / Categories | `content/projects.json` / `categories.json` | `"projects@1"` / `"categories@1"` | `schema.ts:324-325` |
| Reviews / Banners (optional; banners 는 PROVISIONAL) | `content/reviews.json` / `banners.json` | `"reviews@1"` / `"banners@1"` | `schema.ts:326-330` |
| Assets | `assets/registry.json` | `"assets@1"` | `platform/assets/assets.ts` |
| SEO | 별도 문서 없음. identity + business + project 에서 파생 | — | `templates/interior-01/v1/lib/seo.ts`, `app/sitemap.ts`, `app/robots.ts` |

- 두 관례가 공존한다: 플랫폼 설정 문서 = 정수 `schemaVersion`, content 문서 = `<name>@<int>`. **둘 다 major 만 있고 additive 변경은 버전을 올리지 않는다**(예: `area.basis` 는 Step 5.2 에 추가됐지만 `projects@1` 그대로 — `schema.ts:76-92`).
- 모든 문서는 `.strict()` 다. 모르는 필드는 실패한다.
- content 문서에는 `origin`(`customer` | `synthetic-fixture` | `reference-fixture`)이 있다. boost-interior-demo 는 전부 `synthetic-fixture` 다 — CONFIRMED (`projects.json`, `categories.json`).

### 2.2 ProjectSchema — CONFIRMED (`platform/content/schema.ts:141-217`)

| 필드 | 타입 | 필수 | 의미 |
|---|---|---|---|
| `id` | `^[a-z0-9]+(?:-[a-z0-9]+)*$`, ≤64 (`:17`) | ✔ | "Stable record id … never a storage row number" |
| `slug` | 같은 패턴, ≤96 | ✔ | URL 주소. 문서 안에서 유일(`:308-321`) |
| `title` | string 1–80 | ✔ | |
| `status` | `published` \| `draft` | ✔ | |
| `publishedAt` | ISO instant, offset 포함 | ✔ | 공개 시각 + "latest" 정렬 키. **미래 시각 = 예약**(§2.4) |
| `category` | RecordId | ✔ | 사이트 taxonomy 의 주 분류. 존재 검증(`load.ts:141-144`) |
| `cover` | `{asset, alt?}` | ✔ | asset registry 참조 |
| `summary` | string ≤200 | | 한 줄 설명 |
| `body` | string[] (문단 ≤1200, ≤20개) | | 평문. HTML 없음 |
| `location` | string ≤80 | | "Public, display-level location … Not a street address requirement" |
| `area` | `{value, unit, basis?}` strict | | §6 |
| `builtYear` | int 1800–2100 | | **건물** 준공연도(공사 연도 아님) |
| `scope` | string[] (각 ≤40, 1–20개) | | "Spaces / work areas included" |
| `period` | `{start: YYYY-MM, end?}` | | 공사 기간(월) |
| `durationWeeks` | int 1–520 | | |
| `keywords` | string[] (각 ≤32, ≤12개, 중복 없음) | | "Style keywords in the site's own words. Absent or empty = no keyword row" |
| `pricePerArea` | `{amount, currency, unit}` strict | | §7 |
| `galleryGroups` | `{name, items[]}`[] | | 방별 사진 |
| `customerQuote` | `{text ≤600, attribution? ≤60}` | | "operator-provided PERSONAL content only — never generated" |

`.strict()` 이므로 이 19개가 전부다. **`propertyType`·`style`·`totalCost`·가구 형태·공종 필드는 없다** — CONFIRMED.

### 2.3 그 밖의 content — CONFIRMED

- **Site identity** (`instance.ts:43-58`): `brandName`, `legalName?`, **`publicOrigin?`(선택!)**, `locale`(BCP 47, 필수), `logo?`. `siteId` = `^[a-z0-9]+(?:-[a-z0-9]+)*$` ≤64 (`:17-20`), 디렉터리 이름과 일치 검증(`load.ts:79-84`).
- **Settings**: Template 이 선언한 section key 만. `defaults → sparse override → effective`, 모르는 key 는 실패(`settings.ts:6-13, 61-65`). 데모는 `portfolio.index` 에서 `areaScale: "pyeong"`, `priceScale: "krw-pyeong"` 를 override 한다(Template 기본값은 `m2` / `none` — `template.ts:311`).
- **Categories**: `{id, name ≤40}`. 데모 4종 전부 사용 중.
- **Reviews / Banners**: 고객 인용·hero 슬라이드. 통합 대상 아님.
- **Assets**: registry = `{id, file, mediaType, width, height}`. snapshot 시점에 파일 바이트로 `sha256` 과 `publicPath = /assets/<sha256[0:20]>.<ext>` 가 붙는다(`load.ts:169-195`, `instance.ts:120`). **variant/썸네일 개념 없음.** alt 는 asset 이 아니라 content 쪽 `MediaRef` 에 있다.

### 2.4 공개 여부가 결정되는 곳 — CONFIRMED

- `buildSiteSnapshot()` (`platform/site/load.ts:94`): public 빌드 = `status === "published" && publishedAt <= at` (`:137-139`). preview 빌드 = draft·예약 포함 전부.
- `createContentReader()` 가 public 읽기에서 한 번 더 published 만 남긴다(`reader.ts:92-93`).
- route plan·카드·compact index 는 전부 reader 를 거친다(`context.ts:96`, `routes.ts:136-151`).
- → **emitter 가 public-mode snapshot 의 `content.projects` 를 쓰면 "published only + 예약 제외"가 자동으로 성립한다.** preview snapshot 에는 draft 가 들어 있으므로 preview 빌드에서는 emit 하지 않아야 한다.

### 2.5 누락 철학 — CONFIRMED

- `schema.ts:153` "All OPTIONAL: absent = unknown, never invented."
- `schema.ts:80-84` "Stored `basis` absent = "unknown" (never guessed from the value or the unit)".
- `docs/architecture/recon-template-platform.md:94` invariant 5 "No invented content: missing content → declared empty behavior or needs-input; items, reviews, facts, contact and legal data are never generated."
- project filter: "A missing value never matches a constraint on that dimension (no guessing)" (`project-filter.ts:20`).

consumer 의 §I 와 같은 철학이다. 차이 하나: web-recon 에는 **"확인된 없음"을 표현하는 필드가 없다.** `scope` 는 `.min(1)`, `keywords` 는 "absent or empty = 같은 뜻"이다. → V0 producer 는 `[]` 를 낼 근거가 없다.

### 2.6 데모 데이터 실측 — CONFIRMED (`data/sites/boost-interior-demo/content/projects.json` 직접 읽음)

| id | category | area | pricePerArea | scope | keywords |
|---|---|---|---|---|---|
| bi-01 | full-remodel | 34 pyeong supply | 2,900,000 KRW/pyeong | 현관·중문, 거실, 주방, 안방, 작은방, 욕실, 복도 수납 | 화이트, 미니멀, 간접조명, 수납 특화 |
| bi-02 | full-remodel | 24 pyeong supply | 2,400,000 | 거실, 주방, 침실, 욕실 | 화이트, 내추럴, 우드 포인트 |
| bi-03 | full-remodel | 42 pyeong supply | 3,200,000 | 현관, 거실, 주방·팬트리, 아이방, 드레스룸 | 모던, 그레이지, 수납 특화 |
| bi-04 | kitchen-bath | 32 pyeong supply | **없음** | 주방, 공용 욕실, 안방 욕실 | 화이트, 모던 |
| bi-05 | full-remodel | 29 pyeong supply | 2,600,000 | 거실, 주방·다이닝, 침실, 확장 발코니 | 내추럴, 우드 포인트 |
| bi-06 | partial-remodel | 34 pyeong supply | **없음** | 현관·중문, 거실, 복도 | 화이트, 간접조명, 미니멀 |
| bi-07 | full-remodel | 19 pyeong supply | 2,700,000 | 거실·다이닝, 주방, 침실, 욕실 | 화이트, 미니멀, 수납 특화 |
| bi-08 | move-in-styling | 51 pyeong supply | 1,600,000 | 거실, 다이닝, 안방, 서재 | 모던, 그레이지, 간접조명 |

8/8 published. 8/8 `location`(시·구 수준), `builtYear`, `durationWeeks`. `customerQuote` 5/8 — attribution 은 "수성구 34평 · 4인 가족" 형태(가구 구성 포함).

---

## 3. Current build architecture — CONFIRMED

```
data/sites/<siteId>/**                       (local JSON — 현재 production data source)
   │  buildSiteSnapshot({siteId, mode, at})         platform/site/load.ts:94
   ▼
SiteSnapshot  ──hashJson──▶ siteSnapshotHash        platform/site/instance.ts:97, site-build.ts:161
   │  + releaseHash + mode + toolchainHash ─▶ buildInputId     platform/build/build-input.ts:16
   ▼
disposable workspace (repo 밖): pinned Template Release 파일 + .recon/snapshot.json + public/assets/*
   │  preflight (release 자신의 platform 코드로 route plan · effective settings 계산)   site-build.ts:304-321
   │  next build  (output: "export", trailingSlash 기본 false)
   │  qaStaticPackage  (계획된 페이지만, 외부 절대 URL 0, forbidden term 0)            platform/build/qa.ts
   ▼
data/site-builds/<siteId>/packages/<buildInputId>/site/**  + build-record.json (packageHash)
   │  site:publish  → R2 sites/<siteId>/packages/<packageHash>/**  → seal(_package.json) 마지막 → routing/<host>.json
   ▼
recon-runtime Worker: host → pointer → package key. redirect 없음. 저장된 content-type / cache-control 그대로.
```

| 사실 | 근거 | 라벨 |
|---|---|---|
| Template 은 `SiteContext`/`ContentReader` 로만 site data 를 읽는다. storage·siteId literal 없음 | architecture invariant 2, `platform/site/bound.ts` | CONFIRMED |
| 빌더 자체(snapshot loader, visibility, asset 선택, QA, pointer)는 **release 가 아니라 repo working tree** 에서 돈다 | `site-build.ts:380-385` hermeticity 목록 | CONFIRMED |
| 같은 `buildInputId` 면 rebuild 를 건너뛴다 | `site-build.ts:284-287` | CONFIRMED |
| 패키지 안에 `.json` 파일은 현재 0개. 포트폴리오 compact index 는 독립 파일이 아니라 `/portfolio` 의 RSC payload 에 inline | 패키지 `find -name "*.json"` = 0, `sections/portfolioFilter.ts` | CONFIRMED |
| QA 에 파일 경로 allowlist 는 없다. 새 `.json` 은 (외부 절대 URL·forbidden term 이 없으면) 통과한다 | `qa.ts:47, 81-86, 92-101` | CONFIRMED |
| publish 는 확장자별 Content-Type 고정표(모르는 확장자 = 실패). `json → application/json` | `platform/publish/media.ts:18-45` (`:24`) | CONFIRMED |
| cache: `_next/static/**` 와 "파일명 = 자기 sha256 접두(≥16 hex)" 만 immutable, 나머지는 `public, max-age=0, must-revalidate` | `media.ts:49-54` | CONFIRMED |
| seal 을 마지막에 쓰고, 검증된 seal 뒤에만 routing pointer 를 쓴다. rollback = pointer 의 `previous` 로 되돌림 | `platform/publish/publish.ts:3-18, 303-326` | CONFIRMED |
| runtime 은 redirect 하지 않는다. trailing slash·`.html` 직접 접근 = 404. Cache API 미사용(요청마다 pointer 를 읽음) | `workers/recon-runtime/src/index.ts:1-14`, `paths.ts:29-58` | CONFIRMED |
| **publish·runtime 은 구현되고 로컬(메모리 store + `wrangler --local`)로만 검증됐다. bucket 생성·remote write·Worker 배포 0** | `docs/result/static-deployment-foundation/02,03,04`, `wrangler.jsonc` | CONFIRMED |
| publish 는 **hostname 과 `publicOrigin` 의 일치를 검사하지 않는다** | `platform/publish/publish.ts` 에 `publicOrigin` 참조 0 | CONFIRMED |
| 데모의 `publicOrigin` = `https://boost-interior-demo.example` (placeholder) | `data/sites/boost-interior-demo/site.json` | CONFIRMED |

---

## 4. BoostChat requirement review (요약 — 전체 판정은 `04`)

85개 항목: **ACCEPT 53 · ACCEPT_WITH_CHANGE 23 · REJECT 4 · DEFER 5.** (독립 리뷰 뒤 G5 → ACCEPT_WITH_CHANGE, H4 → DEFER)

| 분류 | 항목 |
|---|---|
| 그대로 수용 | 2-artifact 구조, same-origin, 고정 manifest URL, published-only, URL ownership(E1–E3), schemaVersion major.minor(F), version echo(G), missing semantics 의 핵심(I1·I2·I5), no pre-conversion(J4), id 불변(K1·K3·K4), detail link(L1–L3) |
| 바꿔서 수용 | vocabulary → resource document 의 `facets`; `allResults.baseUrl` → resource document 의 `listingUrl`; `locale` → `site.locale`; `category` → 닫힌 facet; `styles` → `tag` facet; `basis:"unknown"` → 생략; `amount` = 주 단위 수(입력 그대로); `publicOrigin` = https 필수 + 서빙 host 일치 조건; 제어문자 gate 신설; id 재사용 금지 = 운영 규칙 |
| 거부 | `defaults`(+J3), `recordCount`, `generatedAt` |
| 보류 | `propertyType`, `cover`, widget embed(N1·N3) + 위젯용 CSP 허용(H4) |

consumer 문서가 **틀리게 가정한 사실**(수정):

| consumer 가정 | 실제 | 라벨 |
|---|---|---|
| `area` 가 단위 없는 number 일 수 있다 | 항상 `{value, unit, basis?}`. unit 필수 | CONFIRMED `schema.ts:161-168` |
| 목록 페이지는 static 이라 URL 필터를 못 받을 것이다 | **받는다.** `?type=&area=&style=&price=&sort=&keyword=&fp=`. 직접 열기·새로고침·뒤로가기 복원이 smoke 로 검증돼 있다 | CONFIRMED `templates/interior-01/v1/lib/filterQuery.ts:17-57`, `components/PortfolioBrowser.tsx`, `scripts/template-platform-step41-visual-smoke.ts` |
| id 가 재빌드 때 바뀔 수 있다 | JSON 에 **직접 쓰인** 값. 파생 없음 | CONFIRMED |
| cover 가 별도 host(R2 public domain)일 수 있다 | 같은 패키지의 `/assets/<sha20>.<ext>`. 외부 host 는 QA 가 막는다 | CONFIRMED |
| `amount` = 최소 통화 단위 정수 | 주 단위 수, 소수 2자리 허용(USD 1500.50 가능). KRW 는 우연히 같다 | CONFIRMED `schema.ts:192-199` |
| 사이트 식별자가 `site_8f3c…` 같은 난수 | `boost-interior-demo` 같은 사람이 읽는 slug. 안정적이지만 opaque 하게 **생기지는** 않았다 | CONFIRMED |

---

## 5. Data readiness reconciliation (consumer 요구 × producer 실제)

| # | Consumer wants | Producer reality | Decision |
|---|---|---|---|
| 1 | stable record id | `project.id` 직접 입력, slug 와 독립, 문서 내 유일 강제 | **ACCEPT** |
| 2 | title | 필수 ≤80 | **ACCEPT** |
| 3 | detailUrl | Template 선언 route `/portfolio/[slug]` → route plan 이 실제 path 생성, QA 가 HTML 존재 검증 | **ACCEPT** (route plan 에서 파생) |
| 4 | area `{value, unit, basis}` | 그대로 있다. 데모 8/8 pyeong/supply | **ACCEPT** (`basis` 모름 = 생략) |
| 5 | unit 없는 수치 + `defaults` | 발생 불가 | **REJECT** `defaults` |
| 6 | pricePerArea `{amount, currency, perUnit, basis}` | `{amount, currency, unit}`. basis·포함 범위 없음. 6/8 | **ACCEPT_WITH_CHANGE** (basis 없음) |
| 7 | budget matching | 총액 필드 없음, 부분 공사 0/2, 카테고리 간 비교 불가 | **LIMITED** — 평당가 비교까지. 총액 적합성 금지 |
| 8 | style facet | `keywords` = 색·스타일·기능·소재 혼합, 태깅 불완전, `모던` 근거 0 | **CHANGE** — `tag` facet(열림). `style` 은 예약 |
| 9 | propertyType | 구조화 필드 없음 | **OMIT** (DEFER) |
| 10 | scope facet | 방 이름 20종, 세분도 불일치, `·` 복합, 공종 없음 | **CHANGE** — 원문 보존한 닫힌 목록. 정규화는 consumer |
| 11 | category = 표시 문자열 | id+name 의 검증된 taxonomy, 8/8 | **CHANGE** — 매칭 가능한 facet 으로 승격 |
| 12 | location | 시·구 수준 display string 8/8 | **ACCEPT** (표시 전용) |
| 13 | publishedAt | 필수 | **ACCEPT** |
| 14 | cover + 썸네일 | same-origin content-addressed. **썸네일 없음** | **DEFER** |
| 15 | published only | snapshot 에서 결정(+예약 제외) | **ACCEPT** |
| 16 | free text 제외 | compact index 선례가 이미 같은 원칙(`project-filter.ts:60-63`) | **ACCEPT** |
| 17 | all-results base URL | `/portfolio` (사례 0건이면 페이지 자체가 없다 — `routes.ts:134-138`) | **ACCEPT** → `listingUrl` |
| 18 | filtered URL | 이미 동작. 파라미터는 Template 소유, 어휘 밖 값은 조용히 버려짐 | **DEFER** |
| 19 | version echo | per-collection hash 없음. canonical-JSON hash 도구는 있음 | **ACCEPT** — projection hash |
| 20 | schemaVersion major.minor | producer 관례는 major-only 정수 / `name@int` | **ACCEPT** (통합 계약 전용, 내부와 분리) |
| 21 | same origin 전부 | 패키지 구조상 기본 | **ACCEPT** |
| 22 | manifest no-cache | 고정 경로 파일 = `max-age=0, must-revalidate` | **ACCEPT** |
| 23 | 제어문자 없음 | content schema 는 제어문자를 막지 않는다 | **CHANGE** — emitter gate 신설 |
| 24 | id 재사용 금지 | 강제 수단 없음(손으로 쓴 JSON) | **CHANGE** — 운영 규칙 |
| 25 | `[]` = 확인된 없음 | 표현할 원본 필드 없음 | **CHANGE** — 의미 수용, V0 에서 미발생 |

선행 data readiness 보고의 핵심 결론(평형 READY · 예산 NOT_READY · 스타일 PARTIAL · "~만" READY-after-normalization)은 원문 재확인 결과 **그대로 유효하다.** 단 "~만"은 **데모 규모에서만** 그렇다(아래 표의 scope 행).

### 5.1 Search support matrix (§48) — `boost-interior-demo` 실제 데이터 기준

데모는 synthetic fixture(8건)다. 이 표는 **데모에 대한 사실**이지 계약 규칙이 아니다(그래서 `03…json` 에는 없다).

| 기준 | 판정 | 원본의 사실 | 계약 V0 에서 |
|---|---|---|---|
| area | **SUPPORTED** | `{value, unit, basis}` 8/8, 전부 pyeong/supply | `area` 그대로. 환산은 consumer(1평 = 400/121 ㎡). 기준이 다르면 비교하지 않는다 |
| category | **SUPPORTED** | 검증된 taxonomy(id+name) 8/8 | `facets.category` — 닫힘, record 당 1개 |
| style | **PARTIAL** | `style` 필드 없음. `keywords` 8종이 색·스타일·기능·소재 혼합, 태깅 불완전 | `facets.tag` — **열림**(태그 없음 ≠ 속성 없음). `style` key 는 예약 |
| scope ("~만") | **SUPPORTED_AFTER_NORMALIZATION — 데모 규모 한정. 실제 규모에서는 AT RISK** | 자유 문자열 **20종/8건**, 세분도 혼재(`욕실` vs `안방 욕실`), `·` 복합 | `facets.scope` — 입력된 세분도에서 닫힘. 부분집합 비교 가능, **세분도를 넘는 포함·제외 추론 금지.** consumer 상한(40) 초과 시 통째로 꺼짐 → `04` R-10, OD-5 |
| location | **PARTIAL** | 시·구 수준 표시 문자열 8/8. 구조화된 행정구역 없음 | `location` — 표시 전용. 매칭 키가 아니다 |
| builtYear | **UNSUPPORTED (V0)** | 원본은 구조화·8/8 | 내보내지 않는다. consumer 에 대응 기준이 없다 → consumer 가 기준을 추가하면 minor 로 추가 |
| duration | **UNSUPPORTED (V0)** | `durationWeeks` 구조화·8/8 | 같음 |
| price | **PARTIAL** | `pricePerArea` 6/8(부분 공사 bi-04·bi-06 없음). basis·포함 범위 없음 | 같은 category 안의 평당가 비교만(`C: MUST`, PR4) |
| totalBudget | **UNSUPPORTED** | 총 공사비 필드 없음 | 총액 적합성 주장 금지(BU3). `amount × area` 파생 금지(PR5) |
| propertyType | **UNSUPPORTED** | 구조화 필드 없음(title 에만 "아파트") | key 예약. title 에서 추론하지 않는다 |

---

## 6. Area semantics

| 질문 | 답 | 라벨 |
|---|---|---|
| 실제 모델 | `{ value: 양수 ≤100000 소수2자리, unit: m2\|sqft\|pyeong, basis?: supply\|exclusive\|unknown }` strict | CONFIRMED `schema.ts:73-111, 161-168` |
| 데모에 unit·basis 가 실제로 있는가 | 8/8 `pyeong` / `supply` | CONFIRMED |
| basis 없음의 의미 | "unknown". 값·단위에서 추측하지 않는다. 명시적 `"unknown"` 도 같은 뜻(`areaBasisOf`) | CONFIRMED `schema.ts:96-98` |
| 한국 주거 관례 | "34평" = `pyeong` + `supply` 로 **입력 단계에서** 기록(`defaultAreaBasis`). 저장값은 바꾸지 않는다 | CONFIRMED `schema.ts:100-111` |
| producer 가 입력값 그대로 emit 가능한가 | 가능. 복사만 하면 된다 | CONFIRMED |
| 평↔㎡ 환산은 consumer 가? | 맞다. 단 **상수를 계약에 고정**한다: 1평 = 400/121 ㎡ (사이트 필터와 같은 값 — `project-filter.ts:114`). 그래야 "30평대" 판정이 사이트와 상담창에서 일치한다 | CONFIRMED |
| 공급↔전용 환산 금지 | 맞다. producer 코드도 같은 원칙: "no function ever derives one basis from the other" | CONFIRMED `schema.ts:86-89` |
| bare-number fallback 필요한가 | **불필요.** schema 상 발생 불가 | CONFIRMED |

주의(선행 조사 재확인): 사이트 자체 필터의 `ProjectFilterRecord.area` 는 **basis 를 버린다**(`project-filter.ts:74, 85`). 통합 projection 은 이 record 를 재사용하면 안 되고 `Project` 에서 직접 뽑아야 한다.

## 7. Price / budget semantics

| 질문 | 답 | 라벨 |
|---|---|---|
| 모델 | `{ amount: 양수 ≤1e9 소수2자리, currency: ISO 4217, unit: AreaUnit }` strict | CONFIRMED `schema.ts:187-199` |
| coverage | 6/8. 없는 것: **bi-04(kitchen-bath), bi-06(partial-remodel)** = 부분 공사 2/2 전부 | CONFIRMED |
| currency / unit | 전부 KRW / pyeong | CONFIRMED |
| basis | **필드 없음** | CONFIRMED |
| 카테고리별 의미 | bi-08(홈스타일링) 1.6M vs 전체 리모델링 2.4–3.2M. 같은 "평당가"지만 다른 종류의 값 | CONFIRMED(값) / INFERRED(의미) |
| 총 공사비 | **필드 없음.** schema 어디에도 cost/total/budget 없음 | CONFIRMED |
| VAT·철거·가구·가전 포함 | **모델 없음.** 코드·데이터·문서 어디에도 없다 | CONFIRMED(부재) |
| `amount × area` | 계약 총액이 아니라 추정치. schema 주석도 plausibility 를 판단하지 않는다고 명시 | INFERRED |

계약 결론(→ `02` §10): `visitorTotalBudget` · `derivedBudgetPerArea`(consumer 내부, artifact 에 없음) 와 `projectPricePerArea`(있는 record 만) · `projectTotalCost`(V0 부재)를 이름으로 분리한다. "24평 2천만원 → 833,333원/평" 계산은 consumer 가 해도 되지만, 그 값은 **방문자 기준값**이고, 가격이 없는 record 는 **평가 불가**이며, **"2천만원에 맞는 사례"라는 주장은 V0 에서 금지**다.

## 8. Vocabulary / style / scope reality

| 개념 | 실제 위치 | 닫힌 vocabulary 가능? |
|---|---|---|
| 분류 | `category` → `categories.json` `{id, name}` | **이미 닫혀 있다.** |
| 스타일 | 전용 필드 없음. `keywords` 에 섞여 있음 | 사이트별 **태그 목록**으로는 닫을 수 있다(데모 8종). "style" 이라는 종류 보증은 못 한다 |
| 공간 유형(아파트/빌라) | **없음.** title 문자열에만 있다 | 불가. 추론 금지 → omit |
| 범위 | `scope` 자유 문자열 | 사이트별 목록으로 닫을 수 있다(데모 20종). 정규화는 안 돼 있다 |

선행 조사의 keyword 혼합 주장 검증 — CONFIRMED: 색·톤(화이트, 그레이지) / 스타일(모던, 미니멀, 내추럴) / 기능(간접조명, 수납 특화) / 소재(우드 포인트). 사이트 자체 UI 는 8개 전부를 "style" 그룹으로 보여 준다(`project-filter.ts:235-237`) — producer 내부 이름이 이미 부정확하다.

**§13 의 선택지 판정:**

| 안 | 판정 |
|---|---|
| A. keywords 를 그대로 `style` facet 으로 | ✗ 거짓 분류. "간접조명"은 style 이 아니다 |
| B. emitter 수준 vocabulary mapping 표 | ✗ V0 에서는. 표는 사람이 관리하는 **두 번째 source of truth** 가 되고, 사이트마다 필요하다 |
| C. ProjectSchema 에 canonical facet 추가 | 올바른 장기 방향. **지금은 하지 않는다**(실제 고객 데이터를 본 뒤) |
| **D. 일부 facet 만, 정직한 이름으로** | **✔ V0.** `category`(닫힘) + `scope`(원문 보존) + `tag`(열림, 종류 미구분). `style`·`propertyType` 은 예약만 |

`tag` 로 충분한 이유: consumer 의 설계는 "LLM 이 닫힌 목록에서 id 를 고른다"이다. 목록이 닫혀 있고 label 이 있으면, 그 태그가 색인지 스타일인지는 매칭에 필요하지 않다. "깔끔한 화이트톤" → `[화이트, 미니멀]` 은 종류 구분 없이 성립한다.

**scope 는 어느 층에서 처리하는가:**

| 처리 | 층 |
|---|---|
| source value 보존 | producer (원문 그대로 facet 값) |
| 방문자 말 → 값 id (동의어, 상하위 "욕실 ⊃ 공용/안방 욕실", 복합어 "주방·팬트리") | **consumer** (닫힌 목록에서 고르기) |
| hierarchy / alias 를 데이터로 | 미래의 producer vocabulary(C 안). V0 아님 |
| interior room ontology | **어디에도 core 에는 넣지 않는다** |

선행 조사 증거: "욕실·주방만" 은 naive 부분집합으로 0건, 정규화 후 bi-04. → **SUPPORTED_AFTER_NORMALIZATION**.

## 9. URL model — CONFIRMED

| 항목 | 사실 | 근거 |
|---|---|---|
| 목록 | `/portfolio` (page 2+ = `/portfolio/page/N`) | `template.ts:82-83` |
| 상세 | `/portfolio/<slug>` — slug 만 사용, id 미사용. link helper 한 곳 | `template.ts:84`, `sections/projectCards.ts` |
| trailing slash | 없음. 붙이면 runtime 이 404 (redirect 안 함) | `next.config.mjs`, `workers/recon-runtime/src/paths.ts:33` |
| 필터 상태가 URL 에 반영되는가 | 예. `keyword·type·area·style·price·sort·fp`, 반복 key | `lib/filterQuery.ts:17-41` |
| 새로고침 후 유지 | 예. mount 시 `location.search` 를 읽는다 | `components/PortfolioBrowser.tsx`, `platform/site/browser.ts` |
| 외부에서 filtered URL 열기 | 예. smoke "direct load of a query URL restores state" | `scripts/template-platform-step41-visual-smoke.ts` |
| canonical / SEO | canonical 은 항상 `/portfolio`. filtered view 는 public 빌드에서 `noindex, follow`. sitemap 에 query 없음 | `app/portfolio/page.tsx`, `sections/portfolioFilter.ts`, `lib/seo.ts` |
| 어휘 밖 값 | **조용히 버려진다** → 조건이 사라지고 전체가 나온다 | `project-filter.ts:306-322` |
| slug 변경 | 옛 URL 404. redirect/alias 장치 없음 | grep 0건 |
| 사례 0건 | 목록·상세 route 가 prune 된다(페이지 없음) | `routes.ts:134-138, 164-168` |

**V0 판단: all-portfolio base URL(`listingUrl`)만 제공, filtered URL 은 DEFER.** 기능은 이미 있지만 (1) 파라미터 이름은 Template 소유라 platform emitter 가 모른다 (2) 값이 사이트별 vocabulary id 와 raw keyword 문자열이다 (3) 어휘 밖 값이 조용히 사라져서 consumer 가 만든 링크가 "전체 목록"으로 열릴 수 있다. 새로 설계하지 않는다.

**detailUrl 의 출처는 Template 의 route plan 이어야 한다.** platform 코드가 `/portfolio/<slug>` 를 하드코드하면 URL ownership 이 깨진다. Template manifest 는 이미 `item: { collection: "projects" }` 로 "이 route 가 project 상세다"를 선언한다(`template-manifest.ts:16-24`). emitter 는 그 선언 + preflight 의 실제 path 목록을 쓴다.

## 10. Record identity

| 질문 | 답 | 라벨 |
|---|---|---|
| rebuild 후 유지 | 예. JSON 에 직접 쓰인 값 | CONFIRMED |
| Template release 변경 후 유지 | 예. content 는 template-independent(invariant 3) | CONFIRMED |
| slug 변경 후 유지 | 예. 독립 필드(`bi-01` ↔ `suseong-white-34py-…`) | CONFIRMED |
| site data 수정 후 유지 | 운영자가 id 를 건드리지 않는 한. **수정을 막는 장치는 없다.** 다만 id 는 내부에서 참조된다(settings manual selection, banner CTA — 없는 id 는 빌드 실패/경고) | CONFIRMED |
| reimport | platform 에 importer 가 아직 없다 | UNKNOWN → 계약 규칙으로 고정: importer 는 id 를 보존한다 |
| 다른 site 와 충돌 | **가능.** `bi-01` 은 site-local 이다 | CONFIRMED |
| 삭제 id 재사용 방지 | 장치 없음 | CONFIRMED |

**결정: B — `siteId + recordId` 가 canonical identity.** A(site-local 만)는 consumer 가 여러 사이트를 다루는 순간 부족하다. C(global opaque id)는 새 필드·발급 체계가 필요하고 V0 에 얻는 것이 없다. B 는 **schema 변경 0**, manifest 의 `site.id` 하나로 해결된다.

## 11. Version model

| 기존 식별자 | 덮는 범위 | portfolio 가 안 바뀌어도 바뀌는가 | 재사용 판정 |
|---|---|---|---|
| `siteSnapshotHash` | snapshot 전체(identity·pin·settings·theme·slots·모든 content·asset 목록) | **예** (theme·banner·slot 한 글자) | ✗ |
| `buildInputId` | 위 + releaseHash + mode + toolchainHash | **예** (Node/pnpm 버전, Template release) | ✗ |
| `packageHash` | 패키지 전 파일 바이트 | **예** | ✗ |
| `releaseHash` / `releaseId` | Template 코드 | site data 와 무관 | ✗ |
| per-collection hash | **없다** | — | — |

**결정: B+D — portfolio projection 의 내용 hash 를 새로 계산한다. 단 새 메커니즘은 만들지 않는다.** `platform/util/hash.ts` 의 `hashJson`(canonical JSON, key 정렬, sha256 — release hash·snapshot hash·buildInputId 가 전부 이것)을 resource document(`version` 필드 제외)에 적용한다.

- 같은 portfolio 내용 → 같은 version (빌드 시각·toolchain·Template 버전과 무관). 실측: 데모 = `6346c472e162ae07b76a4686fce54c51`.
- 내용 변경 → 반드시 변경. `detailUrl` 이 바뀌어도(Template 이 route 를 바꾼 경우) 바뀐다 — 올바르다.
- 그러면서도 `buildInputId` 사용 시의 문제(C 질문: "portfolio 가 안 바뀌어도 version 이 바뀌어 불필요한 재적재")가 없다.

## 12. Static artifact model

**A. 2-file 구조가 필요한가 — 예.** 고정 URL 의 작은 파일(자주 확인) + 내용에 묶인 URL 의 큰 파일(바뀔 때만). 한 파일로 합치면 매 주기마다 전체를 받거나, version 비교를 위해 본문을 다 읽어야 한다. resource 가 늘어날 때도 manifest 가 목록 역할을 한다.

**B. 현재 static build 와 자연스러운가 — 예.** asset 이 이미 같은 방식으로 들어간다: 빌더가 `public/` 에 쓰고 Next 가 `out/` 으로 복사한다(`site-build.ts:454-458`). JSON 도 같은 길로 가면 QA·packageHash·seal·publish 를 전부 그대로 통과한다.

**C. reproducibility 를 해치는가 — 아니오, 조건 둘.** (1) 문서에 wall-clock 을 넣지 않는다(`generatedAt` REJECT 의 이유). (2) **emitter 코드/계약 버전을 `buildInputId` 의 입력에 넣어야 한다.** 빌더는 working tree 에서 돌기 때문에, emitter 를 고쳐도 `buildInputId` 가 같으면 "up-to-date"로 rebuild 를 건너뛴다(`site-build.ts:284-287`) — 같은 id 에 다른 패키지가 대응하게 된다.

**D. 같은 data 에서 결정적으로 생성 가능한가 — 예.** 입력은 SiteSnapshot(이미 정렬·검증됨)과 route plan 뿐이다. 실측 스케치로 확인(scratchpad 에서만 실행, repo 미변경).

**E. 원본 project JSON 노출 vs search projection — projection.** 원본에는 customerQuote(가구 구성 포함), body, gallery alt 가 있다. 선례도 같은 결론이다: `toProjectFilterRecord` — "so that bodies, galleries and customer quotes never reach a public index"(`project-filter.ts:60-63`). 단 그 record 를 **재사용하지는 않는다**(summary·raw keywords 를 싣고 basis 를 버린다).

**F. 확장 가능한가 — 예.** `resources.<kind>` 에 key 추가. 그래서 portfolio 전용인 vocabulary·listing URL 을 manifest 에서 빼야 한다(두 번째 resource 가 오면 최상위 `vocabulary` 가 충돌한다).

### Emitter 위치 (§19)

| 후보 | 판정 |
|---|---|
| A. Template 코드 | ✗ Template 이 계약을 알게 된다. Template 마다 재구현. Release 마다 계약이 얼어붙는다 |
| C. site adapter | ✗ 고객별 코드 = invariant 1 위반 |
| D. content/export layer (`platform/content`) | △ projection 함수의 **성격**은 여기와 같다(순수, content 만 읽음). 그러나 URL(route plan)이 필요해서 content 층만으로는 끝나지 않는다 |
| **E + B. 별도 `platform/integration/` 순수 모듈을 빌드 파이프라인이 호출** | **✔** |

제안(구현하지 않음):

```
buildSiteSnapshot() ─▶ SiteSnapshot ─┐
preflight ─▶ route plan(실제 path) ──┤
Template manifest 의 선언 route ─────┴▶ platform/integration  (순수: snapshot + routes → {manifest, documents})
                                          │  쓰기: <workspace>/public/_integration/**   ← next build 이전, preflight 이후
                                          ▼
                              next build → QA → packageHash → seal → publish → pointer
```

- 호출 지점: `platform/build/site-build.ts` 의 preflight(`:304-321`)와 `next build`(`:324`) 사이. asset 복사와 같은 seam.
- Template JSX·ContentReader·SiteContext 는 아무것도 모른다. platform 코드에도 consumer 이름이 없다(`integration`, `portfolio`).
- 같은 SiteSnapshot + 같은 route plan → 같은 출력.
- future resource = projection 함수 하나 + registry 한 줄.
- **fail-closed 조건**: mode ≠ public / `publicOrigin` 없음 또는 https 아님 / site 가 opt-in 하지 않음 → `_integration/` 자체를 만들지 않는다. collection 의 item route 가 정확히 1개가 아니면 그 resource 를 내지 않는다(경고).
- 열린 구현 질문(계약과 무관): preflight 출력은 `{key, pattern, paths}` 뿐이라 어느 route 가 "projects 의 item route"인지 말해 주지 않는다(`platform/site/preflight.ts`). 빌더가 workspace 의 `template.ts` 에서 선언 route 를 읽거나(Release 변경 불필요), 다음 Release 에서 preflight 가 route source 를 함께 출력하게 한다.

### Publication consistency (§52–53)

| race | 결과 |
|---|---|
| old manifest + new index | 파일명에 version 이 있으므로 old manifest 는 새 패키지에 없는 파일을 가리킨다 → 404 → 다음 주기. 내용이 같았다면 같은 파일이 새 패키지에도 있다 → 일치하는 짝. **조용한 혼합은 없다** |
| new manifest, index 미업로드 | **불가능.** pointer 는 전 파일 업로드·readback 검증·seal 뒤에만 움직인다(`publish.ts:286-326`) |
| index → 아직 없는 상세 페이지 | **불가능.** 같은 패키지. route plan 이 detailUrl 의 출처이고 QA 가 HTML 존재를 검증한다(`qa.ts:78-80`) |
| rollback | pointer 의 `previous` 로 복귀. 옛 짝이 그대로 돌아온다(그 패키지의 `schemaVersion` 포함 → consumer 는 아직 서빙 중인 모든 major 를 지원해야 한다) |
| 통합을 끔 / 동의 철회 | 다음 패키지에 `_integration/` 가 없다 → manifest `404`. consumer 가 이것을 "일시 장애"로 읽으면 last-good 수명(72h) 동안 계속 추천된다 → 계약 §3.2 가 `404`×2 = **폐기**로 고정 |

→ **package activation = integration data activation.** 별도 sync·DB·API 없음. web-recon runtime DB read = 0 유지.

## 13. Security / PII

**portfolio index 를 "공개 사이트에서 이미 볼 수 있는 정보의 machine-readable projection"으로 유지할 수 있는가 — CONDITIONAL YES, 단 그 문장 그대로는 아니다.**

독립 리뷰(`05` F-02)가 지적했고 main 이 원문으로 확인했다: **index 의 모든 사실이 화면에 보이는 것은 아니다.** `templates/interior-01/v1/lib/format.ts` 의 `formatArea` 는 `{value, unit}` 만 받아 **면적 기준(basis)을 그리지 않고**, Template 디렉터리 어디에도 `publishedAt` 을 표시하는 코드가 없다(CONFIRMED, grep 0건). 따라서 정직한 전제는 "이미 보이는 정보"가 아니라 **"공개된 record 의, allowlist 에 있는 사실 — Template 이 그리는지와 무관하게 이 계약으로 공개된다"** 다. 계약 SE1 을 그렇게 고쳤고, 이것이 사이트별 opt-in(OD-2)을 권고하는 실질적 이유다.

| 조건 | 현재 |
|---|---|
| public 빌드에서만 emit (preview snapshot 에는 draft 가 있다) | emitter gate 필요 |
| 명시적 allowlist pick (spread 금지) | 선례 있음(`toProjectFilterRecord`) + 누출 테스트 선례(`platform/test/step41.test.ts` "public index leaks nothing") |
| customerQuote·body·summary·gallery alt 제외 | 계약 §7 |
| 외부 host 0 | root-relative 만 + QA 의 절대 URL gate 가 JSON 에도 적용된다(`qa.ts:16, 47, 92-101`) |
| 비밀 0 | site data 에 비밀이 없다. 위젯 key 는 이 계약에 없다 |
| `location` 이 상세 주소가 아닐 것 | schema 는 길이만 본다. **운영 규칙**(onboarding checklist) |
| 제어문자 0 | content schema 가 막지 않는다 → emitter gate 필요 |
| 고객 동의 | 대부분은 공개 사이트 내용의 재표현이지만 **화면에 없는 사실(basis, publishedAt)도 포함**되고, 기계 판독 index 는 수집을 쉽게 한다 → **사이트별 opt-in** 권고(OD-2) |

남는 위험: `title`·`label`·`location` 은 운영자가 쓴 자유 텍스트다. prompt-injection 방어는 consumer 책임이고(그쪽 문서가 이미 "untrusted tenant data"로 분류), producer 는 길이 상한(title 80, label 40)과 제어문자 gate 를 보장한다.

## 14. Genericity analysis

### Axis A — 같은 Template, 여러 고객

| 요소 | 고객별 코드? |
|---|---|
| emitter | 없음. platform 모듈 1개, 입력은 site data |
| facet 값 | 각 사이트의 `categories.json`·`scope`·`keywords` 에서 나온다 |
| URL | 각 빌드의 route plan |
| `site.id`·`publicOrigin`·`locale` | `site.json` |
| 단위 | record 마다 입력값(평을 쓰는 고객, ㎡ 를 쓰는 고객 공존 가능) |

→ interior-01 의 고객 A/B/C 는 **같은 계약·같은 코드**를 쓴다.

### Axis B — 다른 Template / 업종

| 계층 | 재사용 | 새로 생기는 것 |
|---|---|---|
| Core (manifest, identity, URL, missing, version, HTTP, publication) | 전부 | 없음 |
| facet 메커니즘 (`{id,label}` 닫힌 목록 + record `facets` 맵) | 전부 | 업종 annex 의 well-known key (`treatment`, `subject` …) |
| portfolio resource | 사례형 업종(피부과 case portfolio)은 `id/title/detailUrl/facets` 로 그대로. `area`·`pricePerArea` 는 그냥 생략 | — |
| 새 resource kind (세무 service, 학원 course) | envelope·규칙 | 그 resource 의 record 필드 계약 + projection 함수 |
| producer content model | — | 새 업종의 collection schema(어차피 Template 2 가 만들 것) |

가상 적용:

| 사례 | Core | Portfolio-specific 중 달라지는 것 |
|---|---|---|
| A. Interior portfolio | 그대로 | (V0 그대로) |
| B. Dermatology case portfolio | 그대로 | `area`·`pricePerArea` 없음. facet key = `treatment`/`concern`. **before/after 사진·시술 결과는 의료광고 규제 대상** → 그 resource 계약에서 따로 다룬다 |
| C. Tax accountant service/case | 그대로 | portfolio 가 아니라 `services` kind 가 자연스럽다. 수치 dimension 없음 |
| D. Academy class/course | 그대로 | `courses` kind. 일정·정원·수강료 = 새 필드. 가격 의미(§10)의 "방문자 예산 ≠ 상품 가격" 원칙은 재사용 |

**interior 누출 점검:**

| 위치 | 결과 |
|---|---|
| Core | interior 용어 0. `평`·`욕실`·`화이트` 없음 |
| Portfolio resource | `area.basis`(공급/전용)는 건축 공간에 한정된 개념이다 → **resource 층에 있고 optional** 이므로 허용. `pyeong` 은 실재하는 단위 enum 값이지 업종 용어가 아니다 |
| well-known facet key | `category`·`scope`·`tag` 는 업종 중립. `propertyType`·`style` 은 **예약만** |
| 기존 platform 코드 | `platform/content/project-filter.ts:131-187` 에 "평당 180만 원 미만" 같은 interior 어휘가 platform 디렉터리 안에 있다(주석은 "Interior-vertical … never site content"라고 자인). **통합 emitter 는 이 scale 들을 쓰지 않는다** — bucket 은 계약에 없다 |

과잉 일반화 점검: `facets` 맵은 consumer 초안의 고정 3필드보다 일반적이다. 정당한 이유 — 두 번째 업종에서 record schema 를 major 로 깨지 않기 위해서이고, 새 개념은 "닫힌 목록" 하나뿐이다. 그 이상(`dimensions` 맵, resource kind 메타모델, query 선언)은 **만들지 않았다.**

## 15. Producer answers Q1–Q10

**Q1. 스타일 / 공간 유형 개념은 어디에 있는가? 닫힌 vocabulary 로 만들 수 있는가?**
- ANSWER: 스타일 전용 필드는 없다. `keywords`(자유 태그, ≤12개)에 색·스타일·기능·소재가 섞여 있다. 공간 유형(아파트/빌라)은 **어디에도 구조화돼 있지 않다**(title 문자열뿐). `category` 는 이미 닫힌 taxonomy 다.
- EVIDENCE: `schema.ts:181-186`(keywords), `:149-150`(category), `.strict()` 19필드에 propertyType 없음. 데모 keyword 8종.
- CONTRACT IMPACT: `category`·`scope`·`tag` 를 사이트별 닫힌 facet 으로 낸다. `tag` 는 열림(없다고 부정이 아님). `style`·`propertyType` 은 예약, V0 미제공. title 에서 추론하지 않는다.

**Q2. area / pricePerArea 의 실제 타입·단위·기준·의미?**
- ANSWER: `area = {value, unit(m2|sqft|pyeong), basis?(supply|exclusive|unknown)}`, 데모 8/8 pyeong·supply. `pricePerArea = {amount(주 단위 수, 소수 2자리), currency, unit}`, 데모 6/8 KRW/pyeong. **가격의 기준 면적·포함 범위(VAT·철거·가전)는 모델에 없다.** 총액 필드 없다.
- EVIDENCE: `schema.ts:73-111, 161-168, 187-199`; `projects.json`.
- CONTRACT IMPACT: `defaults` 불필요. 가격 basis·포함 범위 = 모름으로 선언. 총액 적합성 주장 금지(BU3). 가격 없는 record = 평가 불가(BU2).

**Q3. cover asset origin? same-origin 가능? thumbnail?**
- ANSWER: 같은 패키지의 `/assets/<sha256[0:20]>.<ext>` — same-origin, content-addressed, immutable cache. width/height 있음. **썸네일·responsive variant 는 없다**(원본 한 장).
- EVIDENCE: `load.ts:169-195`, `instance.ts:120`, `media.ts:49-54`, 패키지 `assets/` 목록, 템플릿에 `srcset` 0.
- CONTRACT IMPACT: same-origin 규칙 유지 가능. R2 public hostname 을 방문자에게 노출할 필요 없음. `cover` 는 V0 에서 DEFER(썸네일 부재 + consumer 미사용).

**Q4. 목록 URL 필터 지원?**
- ANSWER: **지원한다.** `/portfolio?type=…&area=…&style=…&price=…&sort=…&keyword=…&fp=…`. 직접 열기·새로고침·뒤로가기 복원. canonical 은 `/portfolio` 고정, filtered view 는 noindex.
- EVIDENCE: `lib/filterQuery.ts:17-57`, `components/PortfolioBrowser.tsx`, step41 visual smoke.
- CONTRACT IMPACT: V0 는 `listingUrl` 만. filtered link 는 DEFER — 파라미터가 Template 소유이고 어휘 밖 값이 조용히 버려진다.

**Q5. manifest 고정 경로?**
- ANSWER: `/_integration/manifest.json`. 사이트 route segment 는 `^[a-z0-9]+(?:-[a-z0-9]+)*$` 라서 밑줄로 시작하는 경로와 **절대 충돌하지 않는다.** runtime 은 확장자 있는 경로를 그 파일로 그대로 매핑한다. `.well-known/` 는 IANA 등록 대상이라 피한다.
- EVIDENCE: `routes.ts:61`, `workers/recon-runtime/src/paths.ts:48-55`.
- CONTRACT IMPACT: 경로를 core 계약에 고정. resource document 는 `/_integration/portfolio.<version>.json`.

**Q6. R2 + recon-runtime 의 redirect / Content-Type / Cache-Control / compression?**
- ANSWER: redirect — 없다(설계 원칙). Content-Type — publish 가 확장자표로 기록, `.json → application/json`. Cache-Control — 고정 경로 파일 `public, max-age=0, must-revalidate`; runtime 은 Cache API 를 쓰지 않고 요청마다 pointer 를 읽는다. ETag/304 지원. **compression — UNKNOWN**: 저장 바이트는 비압축이고 Worker 는 `Content-Length` 와 함께 그대로 흘려보내지만, Cloudflare edge 가 `Accept-Encoding` 없는 요청에 무엇을 하는지는 **live 배포가 없어서 확인되지 않았다.**
- EVIDENCE: `index.ts:1-14, 46-54`, `paths.ts`, `media.ts:18-54`, `docs/result/static-deployment-foundation/03-runtime-contract.md`("Not deployed").
- CONTRACT IMPACT: 계약은 관찰 가능한 동작(HT1–HT8)만 요구한다. HT5 는 live deploy plan 의 검증 항목으로 넘긴다. `http→https`·`www↔apex` 는 zone 설정이지 패키지가 아니다 — consumer 는 최종 https URL 을 직접 등록한다.

**Q7. 예상 record 수 / index 크기?**
- ANSWER: 실측(V0 projection): 데모 8건 = 5,292 B(662 B/record, facet 목록 포함), fixture-large 173건 = 57,938 B(335 B/record), manifest 273 B. 현실 규모(INFERRED): 소규모 인테리어 업체 20–300건, 큰 업체 500–1,500건. 1,000건 ≈ 0.33–0.66 MB → consumer 의 1 MiB/1,000건 한도 안. **1 MiB 도달 ≈ 1,600–3,100건.**
- EVIDENCE: scratchpad projection 스케치(repo 미변경), `data/sites/fixture-large`.
- CONTRACT IMPACT: §16 아래 "규모" 참조. 1,000건 전에는 아무것도 바꾸지 않는다.

**Q8. project.id 는 rebuild/reimport 에서 stable 한가?**
- ANSWER: rebuild — 예(직접 입력값). Template release 변경·slug 변경 — 예. reimport — importer 가 없어서 UNKNOWN, 계약 규칙으로 고정한다. 재사용 방지 — 장치 없음(운영 규칙). site 간 충돌 — 가능 → identity = `site.id + record.id`.
- EVIDENCE: `schema.ts:16-17, 308-321`, `projects.json`.
- CONTRACT IMPACT: §13 ID1–ID5.

**Q9. multilingual?**
- ANSWER: 사이트당 locale 하나(`site.json identity.locale`, BCP 47, 필수). content 문서에 locale 필드 없음. 다국어 사이트 개념이 아직 없다.
- EVIDENCE: `instance.ts:54`, content schema 전체.
- CONTRACT IMPACT: `site.locale` 을 manifest 에 싣는다(label·title 의 언어). locale 별 document 는 DEFER. id 는 언어와 무관해야 하지만 V0 의 `scope`·`tag` id 는 원문 문자열이다 — 다국어가 오면 관리되는 vocabulary(안 C)가 선행돼야 한다.

**Q10. 사이트 자체 CSP?**
- ANSWER: **없다.** Template 은 `<meta http-equiv>` 를 내지 않고, runtime 은 `Content-Type`·`Cache-Control`·`ETag`·`Content-Length`·`X-Content-Type-Options: nosniff` 만 보낸다.
- EVIDENCE: `app/layout.tsx:24-35`, `index.ts:46-54`.
- CONTRACT IMPACT: H4 는 현재 해당 없음. **그러나 CSP 보다 먼저 걸리는 것이 있다:** 패키지 QA 가 자기 origin 이 아닌 절대 URL 을 HTML·JS·JSON 어디서든 실패시킨다(`qa.ts:92-101`). 위젯 `<script src="https://…">` 는 지금 그대로는 **빌드가 실패한다.** → widget seam 은 "선언된 embed origin 만 허용"을 포함해야 한다(§16 D-5).

### 규모 (§42)

| record 수 | manifest | document | 판단 |
|---|---|---|---|
| 10 | ~0.3 KB | ~5 KB | 문제 없음 |
| 100 | 같음 | ~35–65 KB | 문제 없음 |
| 500 | 같음 | ~170–330 KB | 문제 없음. **facet 값 수가 먼저 문제**가 된다(자유 태그는 사례가 늘면 40종을 넘는다) → 관리되는 vocabulary 필요 시점 |
| 1,000+ | 같음 | ~0.35–0.7 MB | consumer 한도(1 MiB, 1,000건) 근처. 비압축 조건(HT5) 때문에 더 빨리 닿는다 |

threshold 후보: **1,000건 또는 1 MiB** 에서 (a) consumer 한도 상향 또는 압축 허용, (b) document 분할 중 하나를 협의. **≈5,000건**부터 정적 단일 JSON 이 불편해진다(매 변경마다 전체 재적재). 그 전에 DB/API/search service 를 만들지 않는다.

## 16. Decisions

| # | 결정 | 근거 절 |
|---|---|---|
| D-1 | Identity = **B** (`site.id` + site-local `record.id`). schema 변경 0 | §10 |
| D-2 | Vocabulary = **D** (일부 facet, 정직한 이름: `category`·`scope`·`tag`). `style`·`propertyType` 예약 | §8 |
| D-3 | Version = **projection 내용 hash**, 기존 `hashJson` 재사용. 기존 build 식별자는 쓰지 않는다 | §11 |
| D-4 | Emitter = **`platform/integration/` 순수 모듈 + 빌드 파이프라인 호출 1곳**(preflight 뒤, `next build` 앞, `public/_integration/`). emitter 버전을 `buildInputId` 입력에 포함 | §12 |
| D-5 | **Widget embed 는 데이터 계약과 분리.** seam 제안: 사이트 수준의 선언형 embed 설정(없음 = 아무것도 렌더하지 않음) → platform 이 제공하는 embed 컴포넌트를 Template root layout 이 한 번 렌더(새 Release) → 패키지 QA 는 **선언된 embed origin 만** 허용 → CSP 를 도입하게 되면 같은 선언에서 파생. Template JSX 에 key·consumer 이름 하드코드 0. 위젯이 없어도 사이트는 완전히 동작 | §15 Q10 |
| D-6 | URL = route plan 에서 파생. `listingUrl` 만, filtered URL DEFER | §9 |
| D-7 | 가격 = 입력값 그대로 + "basis·포함 범위 모름" 선언 + budget claim 규칙 | §7 |
| D-8 | ProjectSchema 변경 **0**. project record 변경 **0**. site 수준 데이터는 **OD-2 에 달려 있다**: opt-in(a)이면 site 수준 additive 필드 1개 + 데모 `site.json` 한 줄이 필요하다(= site data 변경 **있음**, 작다). 기본 on(b)이면 0. 어느 쪽이든 live E2E 전에 `publicOrigin` 을 실제 origin 으로 | §17, `04` OD-2 |
| D-9 | emit 조건: public 빌드 · site opt-in(OD-2 대기). **통합을 켠 사이트의 public 빌드에서 https `publicOrigin` 없음 / 금지 문자 / 상세 route 모호 → 빌드 실패**(조용히 건너뛰면 consumer 가 "껐다"로 읽는다). 켜지 않은 사이트와 preview 빌드는 `_integration/` 없음이 정상 | §12, §13 |
| D-10 | publish 단계에 hostname ↔ `publicOrigin` host 일치 검사 추가(통합과 무관하게 canonical/sitemap 에도 필요한 gap) | §3 |

D-5 가 settings 철학(`defaults → sparse override → effective`)과 맞는 방식: Template section settings 는 **Template 이 선언한 key** 만 받는다(`settings.ts:61-65`). 위젯 설정을 거기에 넣으면 모든 Template 이 같은 section 을 선언해야 한다. 사이트 수준 문서(identity 옆)가 자연스럽다 — 기본값 = embed 없음, 사이트가 선언한 것만 effective. `app/layout.tsx:19-23` 과 `sections/links.ts` 주석이 이미 "future chat launcher in the seat"를 예고하고 있다.

## 17. Unknowns

| # | 모르는 것 | 언제 풀리는가 |
|---|---|---|
| U-1 | Cloudflare edge 가 `Accept-Encoding` 없는 요청에 identity 로 응답하는가 | live pilot 배포 시 1회 측정 |
| U-2 | live 에서의 HT1–HT3 (로컬 검증만 있음) | 같음 |
| U-3 | 실제 고객의 portfolio 데이터 품질(전부 synthetic fixture 로만 판단했다) | 첫 실제 고객 onboarding |
| U-4 | 실제 고객의 tag/scope 종류 수(40 한도 초과 여부) | 같음 |
| U-5 | Next 가 `public/_integration/`(선행 밑줄 디렉터리)를 그대로 export 하는가 | INFERRED 예. Phase A 첫 테스트 |
| U-6 | importer 가 생겼을 때 id 보존 | importer 설계 시 계약 규칙으로 강제 |
| U-7 | consumer 가 facet 값 id 로 비-ASCII 문자열("수납 특화")을 받는 데 문제가 없는가 | consumer 회신 |
| U-8 | 위젯이 LCP/INP 에 주는 영향 | consumer 도 미측정이라고 명시. widget 계약 acceptance 항목 |

## 18. What not to build

- runtime API · webhook · search service · DB 조회 경로
- `resource.search(type=…)` / 범용 resource framework / 동적 schema / `dimensions` 맵
- emitter 안의 추론(propertyType, style, 가격, 총액, 가구 형태, 태그 보정)
- 사람이 관리하는 별도 index 나 keyword→facet mapping 표(두 번째 source of truth)
- interior room ontology 를 core 또는 platform 에
- 단위·basis 환산을 producer 에
- 기존 `ProjectFilterRecord` / area·price bucket scale 의 재사용(계약에 bucket 없음)
- manifest 에 build/package/template 식별자, `generatedAt`, `recordCount`, `defaults`
- filtered listing URL 설계
- Template JSX 안의 consumer 이름·widget key
- BoostWeb · Site Platform 의존
- 1,000건 전의 sharding·압축
