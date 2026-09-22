# 01 — Contract V0 freeze (02 → 03 재파생)

- 날짜: 2026-09-22
- 대상: `docs/reports/integration/02-integration-contract-v0-candidate.md`(규범) · `03-integration-contract-v0-candidate.json`(파생) · `06-implementation-phase-plan.md`
- 입력: BoostChat consumer 확인(READ-ONLY) `/Users/woops/projects/boost-chat/docs/reports/integration/web-recon-contract-v0-consumer-confirmation.{md,json}`, `…-consumer-evidence.md`

## 결과

| 항목 | 값 |
|---|---|
| 상태 | CANDIDATE → **FROZEN — Integration Contract V0** (`schemaVersion "0.1"`) |
| schema 버전 변경 | **없음** (네 변경 모두 non-breaking, 필드·enum·major·minor 불변) |
| consumer 판정 | R-1…R-9, R-12 ACCEPT · R-10, R-11 ACCEPT_WITH_CHANGE · REJECT 0 · DEFER 0 |
| 반영한 변경 | CH-R10 · CH-R11a · CH-R11b · CH-R11c (4건 전부) |
| owner 결정 | OD-1 승인 · OD-2 = (a) 사이트별 opt-in, 기본 off |
| 02/03 parity | 아래 §"파생 검증" |

파일 이름(`…-candidate.md/.json`)은 바꾸지 않았다. consumer 문서와 `04`·`06`·이전 결과 보고서가 그 경로를 가리키고, 계약 문서 안에서 "이름·번호를 바꾸지 않는다"고 명시했다.

## 02 (규범) 변경 내역

| 위치 | 변경 |
|---|---|
| 머리말 | 날짜에 `freeze 2026-09-22` 추가. 상태를 FROZEN 으로 바꾸고 freeze 근거 4개 bullet(OD 결정 · consumer 확인 경로와 판정 · 반영한 4건과 non-breaking · 구현 상태는 `docs/result/first-party-integration-producer/` 에 기록) 추가 |
| §3.2 상태표 | CONFIRMED OFF(사이트) 행에 `"연속"의 정의는 아래 CH-R11a`. TRANSIENT 행 관찰 목록 맨 앞에 `manifest 3xx(HT1 위반), 404 가 아닌 4xx` |
| §3.2 새 표 | **CH-R11a / CH-R11b / CH-R11c** 를 consumer 원문 그대로 수록 + "첫 404 SUSPECT 는 consumer 내부 규칙, 요구도 금지도 하지 않음" |
| §11.1 VO6 | 선언값을 CH-R10 원문으로 교체(잠정 · manifest 64 KiB · 문서 1 MiB · record 1,000 · key 별 category 50 / scope 150 / tag 150 · 모르는 key 무시 · 합산 예산 초과 시 facet 통째 무시). 확인 주기 최소 간격(10분)·last-good 수명(72시간)도 같은 형식의 consumer 선언값(CH-R11c). 선언값 변경 절차(계약 버전 불변) |
| §13 SE6 | "pending OD-2" → OD-2 = (a) 확정(2026-09-22) |
| §24 관리되는 scope vocabulary | `consumer 한도(40)` → `consumer 한도(scope 150, 잠정)` |

### consumer 원문 대조

consumer 확인 문서의 요청 문구와 02 의 문구를 기계 대조했다(강조 `**`·backtick·인용부호만 제거하고 비교).

| 변경 | 02 위치 | 원문 일치 |
|---|---|---|
| CH-R10 | §11.1 VO6 · §24 · (`06` A4) | 일치 — §12.4 의 세 요청 그대로 |
| CH-R11a | §3.2 표 | 일치 |
| CH-R11b | §3.2 표 | 일치 — consumer 는 요청 문구를 따옴표로 묶고 근거("저장소가 없는 객체에 403 …")를 밖에 두었다. 02 는 둘을 한 셀에 두었고 문자열은 같다 |
| CH-R11c | §3.2 표 | 일치 |

CH-R11a 는 "연속"의 의미를 정하는 변경이라 producer 동의가 필요했다. 02 머리말에 producer 동의를 명시했다. 구현(`workers/recon-runtime`)은 CH-R11b 의 `P: MUST 404` 를 이미 만족한다 — 없는 객체는 패키지의 `404.html` 을 status 404 로 돌려준다(`platform/test/integration.test.ts` R1 이 fake bucket 으로 확인).

## 03 (파생 JSON) 재파생

03 은 손으로 정렬한 compact 행이 많아 전체를 다시 dump 하면 diff 가 읽히지 않는다. 02 의 변경에 대응하는 필드만 자리에서 바꾸고(각 치환은 정확히 1회 일치를 assert), 결과가 JSON 으로 parse 되는지 확인했다.

| 03 경로 | 변경 |
|---|---|
| `document`, `status`, `date`, `candidateDate` | FROZEN, 2026-09-22 (candidate 날짜 보존) |
| `freezeBasis` (신설) | OD 결정, consumer 확인 출처·판정 목록, CH-R10/11a/11b/11c 각각의 위치·성격·내용, `schemaImpact: none`, 구현 상태는 계약 밖 |
| `core.availabilityStates.CONFIRMED_OFF_SITE.observed` | `'consecutive' per CH-R11a` |
| `core.availabilityStates.TRANSIENT.observed` | `manifest 3xx (HT1 violation)`, `manifest 4xx other than 404 (401/403/410/429 …)` 추가 |
| `core.availabilityStates.lastGoodLifetime.declaredLike` | `VO6 (CH-R11c)` |
| `core.availabilityStates.checkInterval` (신설) | consumer 선언, 현재 10 min |
| `core.availabilityStates.consecutive404` (신설) | CH-R11a · CH-R11b · producer 의무(`P: MUST` 404, 403 아님) · 첫 404 SUSPECT 는 consumer 내부 |
| `core.securityRules.SE6` | OD-2 확정 |
| `portfolio.facetRules.VO6.consumerDeclaredLimitsCurrent` | `valuesPerFacet: 40` → `status: provisional`, `manifestBytes 65536`, `documentBytes 1048576`, `records 1000`, `valuesPerFacetKey {category 50, scope 150, tag 150}`, 모르는 key 무시, 합산 예산, 같은 형식으로 선언되는 확인 주기·수명, 변경 절차 |
| `deferred[3]` | 관리되는 scope vocabulary 에 `scope 150, provisional` 근거 |
| `testInvariants.consumerSide[0]` | 404×2 의 "서로 다른 확인 주기 · 200 에서만 counter reset · 3xx/기타 4xx/5xx/timeout 은 중립" 반영 |

## 파생 검증 (02 ↔ 03 semantic parity)

1. 02 에서 바뀐 규칙 6곳(§머리말, §3.2 ×2, VO6, SE6, §24) 각각에 대응하는 03 필드가 위 표의 값으로 존재한다.
2. 03 의 나머지 필드는 2026-09-21 판과 byte 동일하다(치환 외 변경 없음, `git diff` 44 insertions / 10 deletions).
3. 03 의 예시 값(§21 golden: `6346c472…` 8 record 5,292 B · `6d641b6f…` · `31aefd2b…`)은 producer 구현이 실제로 재현한다(`03-golden-build.md`, 테스트 E1/E2).
4. 독립 contract 리뷰(`05-review-contract.md`)가 02/03 parity 를 별도로 검토했다. 결과와 반영은 `07-review-fixes.md`.

## freeze 검토 명확화 (같은 날, 독립 리뷰 `05` 반영)

freeze 직후의 fresh-context 계약 리뷰가 BLOCKER 1(문서 유효성 정의 부재)·MAJOR 8 을 냈다. 전부 **산문 명확화**로 02 에 반영하고 03 을 재파생했다 — 필드·enum·`schemaVersion` 은 그대로이고, consumer 가 확인 문서에서 이미 선언한 동작을 계약 문장으로 옮긴 것이다(각 문장에 `(freeze 검토 2026-09-22, \`05\` C-nn)` 표시). 목록과 근거는 `07-review-fixes.md` §B. consumer 원문 4행(CH-R10/CH-R11a/b/c)은 다시 기계 대조해 byte 그대로임을 확인했다. **BoostChat 에 통보가 필요하다**(Phase B 착수 전 표시된 문장 확인).

## 06 변경

- 머리말: 2026-09-22 Gate 0 통과 · Phase A 구현 완료, 결과 보고서 포인터. 나머지는 계획 당시 그대로(구현이 계획과 다른 점은 `02-producer-design.md` §"06 계획과의 차이").
- A4 경고 문턱을 CH-R10 의 key 별 값으로 갱신(consumer §12.4 세 번째 요청).
