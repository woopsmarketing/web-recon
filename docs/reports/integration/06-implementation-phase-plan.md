# 06 — Implementation Phase Plan (DESIGN ONLY)

- 날짜: 2026-09-21 (독립 리뷰 반영판 — `05`) · 2026-09-22 A4 의 consumer 선언 한도를 CH-R10 값으로 갱신
- 2026-09-21 시점에는 아무것도 구현되지 않은 계획이었다. **2026-09-22: Gate 0 통과(`02` FROZEN), Phase A 구현** — 결과와 실제 코드 위치는 `docs/result/first-party-integration-producer/00-summary.md`(A1–A5 구현; A6 는 publish 의 기존 sitemap origin 검사에 manifest origin 대조를 더한 것으로 충족; A7 의 golden 은 별도 파일이 아니라 데모의 실제 패키지 + `platform/test/integration.test.ts` 의 상수다). 이 문서의 나머지는 계획 당시 그대로이되, 구현이 계획과 다른 점은 해당 행에 표시했다.
- 계약: `02-integration-contract-v0-candidate.md`(규범) / `03…json`(파생본). 불변식 번호(INV-n)는 `02` §22.

```
Gate 0  Contract V0 승인 (owner) + consumer 회신 반영 → 02/03 freeze
   │
Phase A  web-recon emitter            (web-recon repo)
Phase B  consumer reader/matcher      (boost-chat repo)      ← A 의 golden fixture 가 나오면 병렬 가능
   │
Phase C  widget embed seam            (양쪽, 별도 계약)       ← A/B 와 독립. data 계약에 의존하지 않는다
   │
Phase D  E2E on a live pilot origin   (양쪽)
```

---

## Gate 0 — Contract freeze

| | |
|---|---|
| repo | 문서만 |
| scope | OD-1 승인 + **OD-2 결정**(opt-in 여부 — A4 와 `02` SE6 이 여기에 걸려 있다). `04` 의 R-1…R-12 를 consumer 팀에 전달, 회신을 `02` 에 반영하고 `03` 을 다시 파생. 상태를 CANDIDATE → V0 로 |
| exit | 양쪽이 같은 `03…json` 을 참조한다. 열린 확인 항목 0 |

---

## Phase A — web-recon emitter

| | |
|---|---|
| repo | web-recon |
| 새 코드 | `platform/integration/` — **순수 모듈**(파일시스템·clock·env 없음). `(SiteSnapshot, route plan, 선언 route) → { manifest, documents[] }` |
| 호출 지점 | `platform/build/site-build.ts` 의 preflight 뒤 · `next build` 앞. 결과를 `<workspace>/<template>/public/_integration/**` 에 쓴다(asset 복사와 같은 seam) |
| 건드리지 않는 것 | Template JSX, ContentReader, SiteContext, content schema, 기존 Template Release, `project-filter.ts` |

### A 의 작업 단위 (직렬 — build/core runtime 은 동시 writer 금지)

| # | 단위 | 내용 |
|---|---|---|
| A1 | projection | `Project` → record (allowlist pick). facet 목록 계산(사용된 값만, id **Unicode code point** 오름차순 — `localeCompare` 금지(환경마다 달라진다), JS 기본 `<`/`sort()` 도 그대로 쓰지 않는다(UTF-16 code unit 순서라 BMP 밖 문자에서 code point 순서와 달라진다)). record 의 facet 배열 = **입력 순서 + 첫 등장 기준 중복 제거**(`scope` 는 schema 가 중복을 막지 않는다). 빈 facet 생략. `areaBasis` 가 `unknown`/없음이면 `basis` 생략. `pricePerArea.unit` → `perUnit`. 직렬화 = compact JSON, `02` §6 의 key 순서 |
| A2 | version | `hashJson(document without version)` 앞 32 hex. 파일명 `portfolio.<version>.json` |
| A3 | URL | 선언 route 중 `item.collection === "projects"` 인 것이 **정확히 1개**일 때 detailUrl 파생. **0개면 `02` §4 대로 resource 를 제공하지 않는다**(manifest `resources: {}`, 실패 아님 — 2026-09-22 freeze 리뷰 MAJOR-2 로 정정). **2개 이상**이면 상세 페이지 모호 → 빌드 실패(A4 ②). `list.page === "first"` 인 route 의 path 가 route plan 에 있으면 `listingUrl`. 빌더가 workspace 의 `template.ts` 에서 선언 route 를 읽는다(Release 변경 불필요) |
| A4 | gate | **두 종류를 구분한다.** ① *emit 하지 않음(정상)*: mode ≠ public, 또는 site 가 opt-in 하지 않음(OD-2) → `_integration/` 없음, 패키지는 byte-neutral. ② *빌드 실패*: opt-in 한 사이트의 public 빌드에서 `publicOrigin` 없음/`https:` 아님 · 금지 문자(`02` HT7 의 집합: C0, DEL, C1, U+2028/2029, 방향 제어) · item route 가 **2개 이상**(모호; 0개는 resource 미제공이지 실패가 아니다). **조용히 건너뛰지 않는다** — 조용한 누락은 consumer 에서 "통합을 껐다"(manifest `404`×2 → 데이터 폐기)로 읽힌다. consumer 선언 한도(**CH-R10, 잠정**: manifest 64 KiB · 문서 1 MiB · record 1,000 · facet key 별 `category` 50 · `scope` 150 · `tag` 150) 초과는 **경고**만 |
| A5 | build identity | emitter/계약 버전을 `BuildInputParts` 에 추가 → emitter 가 바뀌면 `buildInputId` 가 바뀐다("up-to-date" 오판 방지). 구현은 producer 소스 파일의 hash 까지 넣어 이것을 기계적으로 보장한다(2026-09-22 리뷰 MAJOR-1). hermeticity 목록에 한 줄 추가 |
| A6 | publish 검사 | routing hostname ≠ `new URL(publicOrigin).hostname` 이면 거부(또는 명시적 override). 통합과 무관하게 canonical/sitemap 에도 필요한 gap |
| A7 | golden fixture | `boost-interior-demo`, `fixture-large`, `fixture-empty` + 합성 edge fixture(가격 없음 / basis 없음 / ㎡ 단위 / draft·예약 포함 / keyword 없음)의 manifest·document 를 **golden 파일**로 고정. consumer 와 공유하는 단일 테스트 입력 |

### A 의 tests

- 단위: INV-1(같은 snapshot = 같은 site data **+ 같은 공개 판정 시각** → 두 번 실행 byte 동일), INV-2(projection 에 들어가는 값 변경 → version 변경 / projection 밖의 값 — project `body`·`summary`, theme·banner·slot — 변경 → version **불변**), INV-14(facet 배열 순서·중복 제거), INV-3, INV-4(draft·예약·preview), INV-7(key allowlist + 제외 문자열 부재 — `step41` "public index leaks nothing" 패턴 재사용), INV-8, INV-9, INV-10, INV-11, INV-12
- 통합: 실제 `site:build` → 패키지에 `_integration/manifest.json` 과 document 존재, INV-5(모든 URL 에 HTML), INV-6, package QA 통과, `packageHash` 에 포함
- publish(로컬 store): `.json` = `application/json`, manifest = `max-age=0, must-revalidate`, runtime `wrangler dev --local` 에서 `GET /_integration/manifest.json` → 200 · no redirect · body byte 동일
- 회귀: 기존 `pnpm test:platform` 전부 통과. opt-in 하지 않은 사이트의 패키지는 **byte 단위로 이전과 동일**(emitter 가 기본 중립)

### A 의 exit criteria

1. 세 사이트의 golden 이 계약 `03…json` 의 규칙을 기계 검증으로 통과
2. opt-out 사이트 byte-neutral
3. fresh-context 독립 리뷰(보안·PII 누출·결정성) 반영
4. 결과 보고서 `docs/result/<task>/`

---

## Phase B — consumer (BoostChat)

web-recon 은 이 phase 의 코드를 보지 않는다. 계약과 golden fixture 만 넘긴다.

| | |
|---|---|
| repo | boost-chat |
| scope | manifest poll → version 비교 → document 적재 → 검증(major, echo, URL, 필드) → facet 목록을 닫힌 선택지로 제시 → 결정적 matcher/ranker → presenter(BU1–BU4) |
| tests | Phase A 의 **같은 golden fixture** 로: `02` §3.2 의 상태별 동작(manifest `404`×2 → 폐기 / kind 빠짐 → 즉시 폐기 / TRANSIENT → last-good 유지 / 수명 만료), 모르는 필드·kind·facet·**enum 값** 무시, `publicOrigin` ≠ 등록 origin 인 manifest 거부, 해석된 URL 이 origin 을 벗어나면 거부, 한도 초과 facet 통째 무시, `pricePerArea` 없는 record 의 예산 판정 없음(BU2), category 를 넘는 가격 비교 없음(PR4). 총액 적합성 문구 부재(BU3)는 presenter template **리뷰 항목** |
| exit | INV-13 의 consumer 절반: 같은 구조화 intent + 같은 document → 같은 result id 목록, 전부 실재 record |

---

## Phase C — widget embed seam (별도 계약)

데이터 계약과 **독립**이다. 먼저 해도, 나중에 해도 된다.

| | |
|---|---|
| repo | web-recon (+ boost-chat 의 widget loader) |
| 선행 | "Widget Embed Config" 계약 초안: 사이트별 공개 key, script origin, 삽입 위치(body 끝, `async`), 실패해도 사이트 정상, 위젯 없이 Template 완전 동작 |
| web-recon scope | ① 사이트 수준 선언형 embed 설정(기본 = 없음) → SiteSnapshot 에 포함 ② platform 이 제공하는 embed 컴포넌트를 Template root layout 이 1회 렌더 → **새 Template Release** ③ 패키지 QA: **선언된 embed origin 만** 외부 URL 로 허용(나머지는 지금처럼 실패) ④ CSP 를 도입하게 되면 같은 선언에서 `script-src`/`frame-src` 파생 |
| 금지 | Template JSX 에 key·consumer 이름 하드코드, 빌드 후 HTML 문자열 주입 |
| tests | embed 미선언 사이트 byte-neutral · 선언 시 모든 페이지에 1회, render-blocking 위치 아님 · 선언되지 않은 origin 은 QA 실패 · 위젯 on/off Lighthouse 비교(consumer 가 acceptance 항목으로 명시) |
| exit | 위젯을 꺼도 사이트·SEO·sitemap 동일 |

---

## Phase D — E2E (live pilot)

| | |
|---|---|
| 선행 | OD-3(실제 https origin), `docs/result/static-deployment-foundation/04-live-deploy-plan.md` 실행, `site.json` 의 `publicOrigin` 을 그 origin 으로 |
| 검증 (계약 §16) | HT1 직접 200 · HT2 Content-Type · HT3 Cache-Control · **HT5 `Accept-Encoding` 없는 요청의 identity 응답(U-1)** · trailing slash 404 · publish → 활성화 직후 manifest/document 짝 일치 · rollback 후 옛 짝 복귀 · **통합을 끈 패키지 배포 → manifest `404` → consumer 2주기 뒤 데이터 폐기** · 별칭 host(www/apex)에서 받은 manifest 는 origin 검사로 거부 |
| 검증 (제품) | "34평 화이트톤" → result id ⊆ document · 카드의 detailUrl 200 · "모두 보기" = `listingUrl` · "24평 2천만원" → 총액 적합성 문구 없음, 가격 없는 사례에 예산 판정 없음 · unpublish → 다음 빌드·다음 poll 뒤 결과에서 사라짐 |
| exit | INV-13 전체 + 위 항목. 실패가 runtime 설정 문제인지 계약 문제인지 분류해 기록 |

---

## 하지 않는 것 (모든 phase)

runtime API · DB 조회 · webhook · 검색 서비스 · filtered URL 설계 · schema 변경(OD-4/OD-5 승인 전) · emitter 안의 추론 · 사람이 관리하는 별도 index · BoostWeb/Site Platform 의존.
