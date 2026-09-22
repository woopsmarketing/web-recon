# 05 — Integration Contract V0 Candidate: Independent Review

- 날짜: 2026-09-21
- 리뷰어: **fresh-context 하위 에이전트**(강한 모델). 작성 과정의 대화·의도·기대 결론을 전달받지 않았다. 받은 것은 검토 대상 파일 경로, 검토 관점 19개, 심각도 기준, "READ-ONLY" 제약뿐이다. "PASS 인지 확인하라"는 지시는 하지 않았다.
- 검토 대상: `01`–`04`, `06` (리뷰 시점의 초판), producer 실제 코드·데이터, consumer 요구사항 문서(읽기만)
- 리뷰어 규모: tool use 31회, 약 20만 token, 약 9.6분. 파일 생성·수정 0
- 이 문서의 구성: ① 리뷰어 결론 ② 유지된 spot-check ③ finding 18건 — 원문 요지 + **main 의 판정과 반영 위치** ④ finding 이 없던 관점 ⑤ 반영 후 상태

---

## 1. 리뷰어 결론 (원문 요지)

> BLOCKER 1건, MAJOR 7건. 아키텍처는 건전하고 `01` 의 사실 기반은 정확하다. 결함은 전부 **계약 문구**에 있다. 위험한 전이(끔 / 공개 취소 / 장애)를 명세하지 않았고(F-01), 보안 전제가 두 필드에 대해 거짓이며(F-02), 합리적인 두 번째 해석 아래에서 비결정적이고(F-03, F-04), 데모 규모가 실제 사이트에서 scope 검색을 꺼 버릴 상한 문제를 가린다(F-05). F-01–F-08 을 `02`/`03`/`04` 에서 고친 뒤에만 승인하라. **어느 수정도 코드를 요구하지 않는다.**

집계: **BLOCKER 1 · MAJOR 7 · MINOR 8 · NOTE 2 = 18건.**

## 2. 코드·데이터에 대조해 **유지된** spot-check

| 확인 항목 | 근거 |
|---|---|
| runtime 은 `/_integration/*.json` 을 패키지 key 로 매핑하고, 어떤 경우에도 redirect 하지 않으며, 없는 경로에 HTML 404 를 돌려준다 | `workers/recon-runtime/src/paths.ts`, `index.ts` |
| `.json` → `application/json`. `manifest.json` 도 `portfolio.<hex>.json` 도 immutable-cache 규칙에 걸리지 않는다 | `platform/publish/media.ts` |
| 패키지 QA 는 JSON 안의 own-origin `publicOrigin` URL 을 통과시킨다 | `platform/build/qa.ts` |
| route segment 는 밑줄로 시작할 수 없다 | `platform/site/routes.ts:61` |
| 환산 상수 400/121 | `platform/content/project-filter.ts` |
| `02` §21 에 인용된 데모 행이 원본과 일치한다 | `data/sites/boost-interior-demo/content/projects.json` |
| 판정 집계가 자기 일관적이다(초판 85 = 55/22/4/4) | `04`, `03` |
| **§21 예시가 정확히 재현된다.** 리뷰어가 projection 을 독립적으로 다시 계산해 빈 사이트 `31aefd2b…`/104 B, 데모 `6346c472…`/5,292 B 를 얻었다. 단 **compact JSON + §6 key 순서 + facet 배열의 입력 순서**일 때만 일치한다 → F-03 의 근거 | 재계산 |

## 3. Findings — 판정과 반영

판정 범례: **수용** = 지적 그대로 반영 · **부분 수용** = 지적은 옳으나 교정안을 바꿔 반영.

### F-01 — BLOCKER · stale data / 가용 상태 미정의

- **지적.** "고정 경로가 `200` 이 아님 = 통합이 꺼진 사이트. 오류가 아니다"가 네 상태(끔 → HTML 404 / 모르는 host → `plain 404` / 깨진 pointer → `plain 500` / timeout)를 뭉갠다. PC5 의 "전파 지연 = consumer 확인 주기"는 모든 실패 경로에서 거짓이다(consumer 가 last-good 을 72h 유지). G5 를 "consumer 내부 정책"으로 ACCEPT 했지만 `02`/`03` 어디에도 없다. 두 구현자는 "non-200 이면 폐기(데이터가 깜빡임)"와 "404 에도 유지(끈 사이트·동의 철회 record 가 72h 추천됨)"로 갈린다.
- **판정: 수용.** 이것은 실제 blocker 다. 동의 철회가 72시간 동안 효력이 없는 계약은 승인할 수 없다.
- **반영.**
  - `02` **§3.2 가용 상태** 신설: ON / CONFIRMED OFF(resource: 200 manifest 에 kind 없음 → 즉시 폐기) / CONFIRMED OFF(사이트: manifest `404` 연속 2회 → 폐기) / TRANSIENT(`5xx`·timeout·JSON 아님·모르는 major·echo 불일치·document `404`·origin 불일치 → last-good 유지).
  - `C: MUST` last-good 최대 수명을 둔다(값은 consumer 소유, 현재 72h).
  - `02` PC5 를 **최악의 경우**로 다시 씀. PC7(긴급히 내릴 때의 두 수단) 추가.
  - `04` G5 → **ACCEPT_WITH_CHANGE**, R-11 추가. `01` §12 race 표에 "통합을 끔" 행 추가. `06` Phase B/D 테스트에 상태별 동작 추가.
  - 연쇄 효과: emit 을 조용히 건너뛰면 consumer 가 "껐다"로 읽으므로, 통합을 켠 사이트의 emit 불가는 **빌드 실패**여야 한다(F-12 와 함께 반영).

### F-02 — MAJOR · 보안 전제가 두 필드에서 거짓

- **지적.** SE1 "공개 사이트에서 이미 볼 수 있는 정보". 그러나 `formatArea(area:{value,unit})`(`templates/interior-01/v1/lib/format.ts:22`)는 `basis` 를 그리지 않고, `publishedAt` 은 template 어디에도 참조가 없다. emitter 는 설계상 template 을 모르므로 가격을 숨기는 두 번째 template 에서도 이 주장은 보장될 수 없다.
- **main 의 재확인.** `format.ts` 를 직접 읽고 template 디렉터리를 grep 했다: `formatArea` 는 `{value, unit}` 만 받고, `publishedAt`·`basis` 참조 0건. **CONFIRMED.**
- **판정: 수용.**
- **반영.** `02` SE1 을 "공개된 record 의 allowlist 사실 — template 이 그리는지와 무관하게 이 계약으로 공개된다. 사이트의 동의는 이 범위에 대한 것"으로 다시 씀. `03` 에서 `projectionOfPublicInformation` 삭제. `01` §13 의 전제와 "고객 동의" 행 수정. `04` OD-2 의 tradeoff 에 "화면에 없는 사실까지 공개된다" 명시.

### F-03 — MAJOR · 결정성의 빈틈

- **지적.** ① record 의 facet 배열 순서 미정 — 정렬하면 같은 5,292 B 인데 version 이 `92232c7e…` 로 달라진다. ② "중복 없음"을 요구하면서 `scope` 에는 유일성 검사가 없다(`schema.ts:172`; `keywords` 는 `:181-186` 에 있음) → 중복 제거 규칙 미정. ③ 저장된 `basis:"unknown"` 은 합법(`schema.ts:88-89`)인데 AR3 "그대로" vs AR2 "문자열 금지" → 매핑 미정. ④ INV-1 "같은 site data" — 출력은 공개 판정 시각 `at` 에도 달려 있다(`load.ts:137-139`).
- **판정: 수용.**
- **반영.** `02` **§6.1 결정성 규칙** 신설: records·facet values = id 의 Unicode code point 오름차순 / record facet 배열 = 입력 순서 + 첫 등장 기준 중복 제거 / 문자열·수 = 원본 그대로 / 직렬화(compact, key 순서, UTF-8)는 producer 불변식이며 **consumer 는 바이트 배치에 의존하지 않는다.** AR3 에 "없음과 저장된 '모름'은 둘 다 생략". §22 에 snapshot 정의(site data + 공개 판정 시각), INV-9 보강, **INV-14** 추가. `06` A1 에 `localeCompare`·JS 기본 sort 금지(UTF-16 순서 — F-18 의 지적) 명시.

### F-04 — MAJOR · `scope` 가 닫힌 세계인지 불명

- **지적.** "record 에 있으면 그 record 의 포함 범위 목록이다"는 닫힘 여부를 말하지 않는다. `01` §8 의 "욕실·주방만 → bi-04" 는 부분집합(닫힌 세계) 의미를 전제한다. 데이터의 세분도는 섞여 있다(욕실 vs 공용/안방 욕실, 주방·팬트리).
- **판정: 수용**(리뷰어 권고안 채택).
- **반영.** `02` §11.3: `scope` = **입력된 세분도에서 닫힘.** 부분집합 비교 허용. `C: MUST NOT` 세분도를 넘어 포함·제외를 추론. 복합 값은 하나의 opaque 값. `04` checklist 의 scope 행에 "같은 세분도로" 추가.

### F-05 — MAJOR · 데모 규모가 가린 상한 문제

- **지적.** 데모 8건에서 scope 가 20종(누적 7, 8, 12, 14, 16, 17, 18, 20) → 대략 20건이면 40. `01` Q7 은 사이트당 20–300건을 예상한다. VO6 아래에서 consumer 는 facet 을 통째로 무시하므로 scope 검색은 사실상 데모 규모 전용인데, matrix 는 YES_AFTER_CONSUMER_NORMALIZATION 이고 최종 조건은 `tag` 만 언급한다. 40 은 consumer 의 "협의 가능한 현재 값"인데 규범으로 굳혔고, 같은 표의 1 MiB·1,000건은 빠졌으며 producer 경고도 없다.
- **판정: 수용.** 선행 조사의 "~만 READY-after-normalization"을 main 이 데모 규모라는 단서 없이 옮긴 것이 원인이다.
- **반영.** `02` VO6: 한도는 **consumer 선언값**(규범 아님), 세 한도 모두 기재, `P: SHOULD` 빌드 경고, producer 는 자르지 않는다. `04` matrix `SCOPE_SEARCH_READY` = "DEMO: YES_AFTER… / REAL SCALE: AT RISK", **R-10**(상한 조정) 추가, OD-5 권고에 "R-10 회신이 상한 고정이면 첫 고객 전으로 당긴다", 최종 조건 2 를 `scope`·`tag` 로. `01` §5.1 matrix 의 scope 행. `02` §24 에 "관리되는 scope vocabulary" 행.

### F-06 — MAJOR · opt-in 에 대한 내부 모순

- **지적.** `02`/`03` 은 opt-in 을 확정된 것으로 쓰고 `04` OD-2 는 열린 결정으로 둔다. "SITE_DATA_CHANGE = NO"·D-8 "site data 변경 0" 은 D-9 "emit 조건: site opt-in" 과 모순이다 — identity 는 `.strict()`(`platform/site/instance.ts:43-58`)이므로 opt-in 에는 additive schema 필드 + 데모 `site.json` 수정이 필요하다.
- **판정: 수용.**
- **반영.** `02` SE6 "OD-2 대기". `04` matrix `CURRENT_SITE_DATA_CHANGE_REQUIRED_FOR_V0` = "DEPENDS ON OD-2"(a → YES 작음 / b → NO), OD-2 의 Need now = **예**. `01` D-8·D-9 수정. `06` Gate 0 에 OD-2 결정 포함.

### F-07 — MAJOR · 두 개의 source of truth, `02` ≠ `03`

- **지적.** `03` 에만 있는 규칙("template declares exactly one item route" — producer 내부 용어), 데모 전용이고 기각된 이름을 쓰는 `searchSupportMatrixDemo`, `04` 를 복제한 `dispositions`. `02` §7.1 에 `site`·`resources` MUST 누락. 두 문서 사이의 우선순위 규칙 없음.
- **판정: 수용.**
- **반영.** `02` 머리말에 **"이 문서가 규범, `03` 은 파생본"** 명시. `03` 전면 재작성: `dispositions`·`searchSupportMatrixDemo` 삭제, `normativeSource`·`precedence` 추가, 규칙 id 를 `02` 와 1:1 로. `02` §4 에 계약 중립 전제("record 마다 하나의 공개 상세 페이지를 제공하지 않으면 resource 를 제공하지 않는다"). §7.1 에 `site`·`resources` 행. §48 matrix 는 `01` §5.1 로(데모에 대한 사실이므로 producer review 가 제자리다). 판정 집계는 `04` 에만.

### F-08 — MAJOR · producer 가 기계적으로 보장할 수 없는 규칙

- **지적.** `title`·`location` 은 길이만 검증 → "PII 없음"은 checklist 항목. id 수정을 막는 장치 없음. `currency` 는 `^[A-Z]{3}$` 만. publish 는 hostname 과 `publicOrigin` 을 대조하지 않음. 운영 규칙이라고 표시된 것은 ID3 뿐.
- **판정: 수용.**
- **반영.** `02` **§20.1 보장 등급표** 신설: 기계적 / 구현 예정 gate / 운영 규칙 / 미검증. SE2 를 "인용 제외 = 기계적, 자유 텍스트의 개인정보 = 운영 규칙"으로 분리. PR1 에 currency 검증 범위 명시. `03` `guaranteeClasses`. `04` matrix `STABLE_RECORD_ID_READY` 문구, K2.

### F-09 — MINOR · consumer 검증 의무가 빠짐

- **지적.** UR3 가 가져온 manifest 안의 origin 에 대해 URL 을 해석하라고 한다. consumer 문서의 검증 의무(H1–H3)가 계약에서 사라졌다.
- **판정: 수용.** **반영.** `02` §5: `C: MUST` `publicOrigin` ≠ 등록 origin 이면 manifest 거부(덮어쓰기 금지). UR2: path 만(query·fragment·`\`·제어문자 없음). UR3: 등록 origin 에 대해 해석 + origin 이탈 검사. `04` R-12.

### F-10 — MINOR · major 전환이 하루에 끝난다는 가정

- **지적.** 사이트는 각자 재빌드되고, rollback 은 옛 major 의 짝을 다시 서빙한다.
- **판정: 수용.** **반영.** `02` SV4: consumer 는 **아직 서빙 중인 모든 major** 를 지원(절차 규칙으로 표시). PC6 에 "그 패키지의 `schemaVersion` 포함". 머리말에 "승인되면 `0.1` 그대로".

### F-11 — MINOR · 모르는 enum 값

- **판정: 수용.** **반영.** `02` §19·AR6·PR6: 모르는 `unit`/`basis`/`perUnit`/`currency` = 그 값을 모름으로(record 유지). SV2: enum 값 추가 = minor.

### F-12 — MINOR · 검증할 수 없는 규칙

- **지적.** 제어문자 집합 미정의. 실패 동작이 `02` 에 없음. INV-2 "portfolio 내용이 바뀌면"은 거짓(summary·body·cover 수정은 projection 을 바꾸지 않는다). BU3 "문구 부재"·SV4 는 기계 검증 불가.
- **판정: 부분 수용.** 금지 집합에 C0·DEL·C1·U+2028/2029·방향 제어(U+202A–202E, U+2066–2069)를 넣었다. **zero-width 문자(U+200B–200D, U+FEFF)는 넣지 않았다** — ZWJ/ZWNJ 는 이모지와 여러 문자 체계에서 정당한 문자다. 그쪽 위험은 SE4(모든 문자열은 신뢰하지 않는 데이터)가 담당한다.
- **반영.** `02` HT7, §4(emit 불가 = 빌드 실패), INV-2 재작성("projection 이 바뀌면 / 같으면"), INV-11·12, BU3 은 "presenter template 리뷰 항목", SV4 는 "절차 규칙"으로 표시. `06` A4 를 "emit 안 함(정상)"과 "빌드 실패"로 분리.

### F-13 — MINOR · core 안의 인테리어 어휘, 선언되지 않은 세 번째 층

- **지적.** §8.3 목록이 인테리어 전용인데 core 로 표시됨. `basis`·`pricePerArea`·`scope` 가 generic portfolio 안에 있는데 §23.3 은 다른 업종을 "자기 annex"로 보낸다 — 층이 셋인데 둘만 선언.
- **판정: 부분 수용.** 세 층 선언과 generic 규칙은 수용. 절 번호 재배치는 하지 않았다(요구사항이 24개 절 구성을 지정한다) — 대신 §9·§10 제목과 §11.3 표에 층을 표기했다.
- **반영.** `02` §1 의 **세 층 표**(Core / Portfolio / Built-space annex), §8 **ND1**(업종 중립 파생 금지) + 인테리어 사례는 annex 예시로. `03` 을 `core` / `portfolio` / `builtSpaceAnnex` 로 재구성. `04` 최종 질문의 재사용 표와 `INTERIOR_SPECIFIC_CORE_LEAKAGE_FOUND` 문구.

### F-14 — MINOR · producer 내부 용어

- **판정: 수용.** **반영.** "pointer 전환" → **원자적 활성화(atomic activation)**. §19 의 "route plan", INV-2 의 "theme·banner·slot", INV-4 의 "project id" 제거. SE1/SE2 "내부 식별자" → "build/package/template 식별자". ID4 에 **명시적 결정**: producer 의 사이트 식별자를 그대로 `site.id` 로 공개한다(사람이 읽을 수 있는 값이고, 통합을 켠 뒤에는 바꾸지 않는다). (`01`·`06` 은 producer 내부 문서이므로 내부 용어를 그대로 둔다.)

### F-15 — MINOR · PR4 가 SHOULD

- **지적.** 데모 데이터에서 833k/평 리모델링 질의의 "가장 가까운" 사례는 1.6M 의 홈스타일링(bi-08)이다.
- **판정: 수용.** **반영.** `02` PR4 → `C: MUST` 같은 category 안에서만 비교·정렬. category facet 이 없거나 무시된 사이트에서는 가격을 사실로 **표시**만. BU3 의 허용 주장에 "같은 category 안에서". §20 degradation 표.

### F-16 — MINOR · 계약 문구 없는 ACCEPT

- **판정: 수용.** **반영.** `04` H4 → **DEFER**(위젯 계약으로). G5 변경과 합쳐 집계 **53 / 23 / 4 / 5 = 85**. `04` 의 표를 스크립트로 다시 세어 확인했다.

### F-17 — NOTE · "구간 판정이 일치한다"는 약속

- **판정: 수용.** 사이트 필터는 basis 를 버리고(`project-filter.ts:74,85`) 구간은 template 소유다. **반영.** `02` AR4 와 `04` J4 에서 약속을 빼고 상수만 남김.

### F-18 — NOTE · 여러 작은 지적

| 지적 | 판정 | 반영 |
|---|---|---|
| BU 용어·INV-13 이 consumer 내부를 규정한다 | 수용 | `02` §10.1 "설명용 이름", INV-13 "설명용 합동 acceptance 시나리오" |
| manifest 경로가 고정이므로 origin 등록으로 충분 | 수용 | `02` §3.1 |
| 별칭 host(www/apex)는 `publicOrigin` ≠ 서빙 origin 인 사본을 서빙 | 수용 | `02` HT8: canonical origin 하나만 등록, 별칭은 origin 검사에서 거부 |
| §21.2 발췌가 인쇄된 대로는 VO1 위반 | 수용 | 2건짜리 **완결 예시**로 교체(facets·version 을 다시 계산: `6d641b6f…`, 1,764 B) |
| code point 순서 ≠ JS `<`(UTF-16) | 수용 | `02` §6.1 "Unicode code point", `06` A1 |
| BU4 enum 은 consumer 내부 | **부분 수용** | 삭제하지 않고 설명 문장으로 완화(값 이름을 규정하지 않는다) |

## 4. Finding 이 없던 관점

| 관점 | 리뷰어 소견 |
|---|---|
| 지어낸 필드 | 내보내는 모든 값이 원본까지 추적되고 예시가 정확히 재현된다 |
| URL ownership | core 규칙은 건전. F-09 는 강화일 뿐 |
| area basis | 규칙은 건전. 빈틈은 F-03 의 매핑 하나 |
| 정적 배포 일관성 | PC1–PC4 는 publish·runtime 코드와 일치. 예외는 F-01 의 PC5 |
| 과잉 일반화 | 새 추상화는 `facets` 맵 하나이고 정당하다 |
| Site Platform · BoostWeb 오염 | 보류 항목의 언급뿐 |
| consumer 내부 이름 | F-18 외에 없음 |

## 5. 반영 후 상태

| | |
|---|---|
| finding | 18건 중 **수용 15 · 부분 수용 3**(F-12 zero-width, F-13 절 번호 유지, F-18 BU4) · 기각 0 |
| 수정한 문서 | `02`(전면 개정) · `03`(재작성, `02` 의 파생본) · `04` · `01` · `06` |
| 수정한 코드·데이터·테스트 | **0** |
| 기계 검증 | `03` JSON parse OK · `04` 판정 집계 85 = 53/23/4/5(표를 스크립트로 집계) · §21.2 예시의 version 을 projection 스케치로 재계산 |
| 재리뷰 | 하지 않았다. 반영분은 main 이 직접 썼고 두 번째 fresh-context 리뷰는 돌리지 않았다 — **사람의 계약 리뷰가 다음 gate** 다. 재리뷰를 원하면 `02` 만 대상으로 다시 돌리면 된다(규범 문서가 하나로 정리됐다) |
| 리뷰가 새로 연 owner/consumer 항목 | OD-2 의 시급도 상향(예), R-10(facet 상한), R-11(가용 상태), R-12(origin 등록) |

**남은 정직한 한계.** 계약의 모든 예시와 수치는 synthetic fixture(8건, 173건)에서 나왔다. 실제 고객 데이터는 한 건도 보지 않았다(`01` U-3, U-4). 리뷰어도 같은 데이터로 검증했으므로 이 한계는 리뷰로 줄어들지 않았다.
