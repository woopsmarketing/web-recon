# 05 — Integration Contract V0 독립 리뷰 (02 / 03 / 04 ↔ consumer 확인)

- 날짜: 2026-09-22
- 리뷰어: **fresh-context 독립 리뷰어.** 작성 과정의 대화·의도·기대 결론을 전달받지 않았다. "PASS 인지 확인하라"는 지시는 받지 않았다.
- 검토 대상
  - `docs/reports/integration/02-integration-contract-v0-candidate.md` (**규범**, FROZEN 선언판)
  - `docs/reports/integration/03-integration-contract-v0-candidate.json` (파생 machine-readable)
  - `docs/reports/integration/04-boostchat-requirement-disposition.md` (R-1…R-12 · OD-1…OD-5)
  - consumer(READ-ONLY): `/Users/woops/projects/boost-chat/docs/reports/integration/web-recon-contract-v0-consumer-confirmation.{md,json}`, `…-consumer-evidence.md`
  - 참고: `05-integration-contract-v0-independent-review.md`(2026-09-21 1차 리뷰), `06-implementation-phase-plan.md`, `docs/result/first-party-integration-producer/01-contract-freeze.md`
- 제약: boost-chat 저장소는 **읽기만** 했다. producer 저장소에서 만든 파일은 이 보고서 하나다. git 상태 변경·`pnpm`·Cloudflare/wrangler 실행 0.
- 검증에 쓴 계산: Node/Python 스크립트(scratchpad) — §7 검증 로그.

---

## 0. 요약

| 등급 | 건수 |
|---|---|
| **BLOCKER** | **1** |
| **MAJOR** | **8** |
| **MINOR** | **12** |
| **NOTE** | **7** |
| 합계 | **28** |

**총평.** 계약의 골격(3층 구조, facet 메커니즘, 파생 금지, 가용 상태, origin binding, 보장 등급표)은 건전하다. CH-R10 · CH-R11a · CH-R11b · CH-R11c 는 **네 건 모두 consumer 원문과 문자열이 일치**하고, `02` §21 의 golden 예시는 **해시·바이트까지 재현된다**(§7). 결함은 전부 **문구의 빈칸**에 있고, 공통 성격은 하나다 — **계약은 "정상 경로"를 정밀하게 고정했지만, "producer 가 규칙을 어겼을 때"와 "시간 상한"을 고정하지 않았다.** 1차 리뷰가 BLOCKER 로 잡았던 F-01(HTTP 층의 가용 상태 미정의)은 §3.2 로 해결됐지만, **같은 종류의 빈칸이 문서 내용 층(C-01)과 시간 층(C-02)에 그대로 남아 있다.**

| # | 등급 | 한 줄 | 위치 |
|---|---|---|---|
| **C-01** | **BLOCKER** | "유효한 manifest/document" 가 정의되지 않았고, 계약을 위반한 문서(닫힘 위반·`resource` 불일치·형식 오류·길이 초과)에 대한 `C:` 동작이 없다 | `02` §3.2, §19 · `03` `availabilityStates` |
| **C-02** | MAJOR | 확인 주기의 **최소**값만 선언되고 **최대**값이 없어 PC7(a) 긴급 내림·동의 철회 전파에 시한이 없다 | `02` §3.2 CH-R11c, §17 PC5·PC7 |
| **C-03** | MAJOR | consumer 선언 한도 중 facet 외(문서 1 MiB · record 1,000 · manifest 64 KiB) 초과 시 동작이 계약에 없다(consumer 는 문서 전체 거부로 구현 예정) | `02` §11.1 VO6 · `03` `VO6` |
| **C-04** | MAJOR | origin 동일성 **판정 규칙**(대소문자·IDN/punycode·기본 port)이 없어 등록 origin 대조가 영구 fail-closed 할 수 있다 | `02` §5, §7.1, §16 HT8 |
| **C-05** | MAJOR | `02` 는 `https://host[:port]` 로 port 를 허용하는데 consumer 구현은 **명시적 port 불가**(R12-1). 계약 적합 producer 가 등록 불가 | `02` §7.1 ↔ consumer §14 R12-1 |
| **C-06** | MAJOR | CH-R11b 의 새 `P: MUST`(부재 manifest = `404`)가 §16 HTTP 요구표·§20.1 보장 등급·§22 INV 어디에도 없다 | `02` §3.2 ↔ §16 · §20.1 · §22 |
| **C-07** | MAJOR | URL 의 문자 집합·퍼센트 인코딩 규칙이 없는데 UR3 는 "변형 없이" 쓰라고 한다(비-ASCII slug 에서 모순) | `02` §12 UR2·UR3 |
| **C-08** | MAJOR | `category` "record 당 정확히 1개" 가 규범 표기·검증·보장 등급 없이 표에만 있는데 `C: MUST` PR4 가 그것에 의존한다 | `02` §11.3 ↔ §10 PR4 |
| **C-09** | MAJOR | `02` 가 freeze 근거로 인용한 OD-1·OD-2 결정이 인용처(`04`)에 기록돼 있지 않다(`04` 는 여전히 "결정 대기" 상태) | `02` 머리말·§18 SE6 ↔ `04` OWNER DECISIONS·matrix |
| C-10 | MINOR | freeze 이후 **산문 규칙**개정의 버전·통지 절차가 없다(SV2 는 필드 단위만). freeze 자체는 정당 | `02` §14 SV2·SV4 · `03` `contractVersion` |
| C-11 | MINOR | `404` **1회** 관찰이 ON/CONFIRMED OFF/TRANSIENT 어디에도 속하지 않는다(보유 데이터 처리 암묵) | `02` §3.2 |
| C-12 | MINOR | `02` §3.2 TRANSIENT 행에 "origin 불일치"가 빠져 있다(`03`·§5·1차 리뷰 F-01 반영 내역에는 있다) | `02` §3.2 ↔ §5 ↔ `03` |
| C-13 | MINOR | `03` 이 `02` 에 없는 제약을 추가한다: `pricePerArea.amount` = "positive number" | `03` `builtSpaceAnnex.priceRules.shape` ↔ `02` PR1 |
| C-14 | MINOR | `04` 가 consumer 회신·freeze 이전 상태 그대로다("facet 당 40", "64 KiB 는 계약에 넣지 않는다", "R-1…R-12 open", "emit 하지 않는다") | `04` §A·§E·R-9·R-10·matrix |
| C-15 | MINOR | `tag` "record 당 0개 이상"(§11.3)이 §7.3 "1개 이상"·§7.2·INV-9·MD3 와 충돌한다(`"tag": []` 허용 여부) | `02` §11.3 ↔ §7.2·§7.3·§8 MD3·INV-9 |
| C-16 | MINOR | `scope` "record 당 1개 이상"이 "모든 record 필수"인지 "있으면 1개 이상"인지 모호 | `02` §11.3 ↔ §7.3 |
| C-17 | MINOR | `facets` 맵의 **key 순서** 규칙이 없어 INV-1 "byte 단위로 같은 문서"에 자유도가 남는다 | `02` §6.1 · INV-1 |
| C-18 | MINOR | "모르는 major" 가 manifest 의 것인지 resource document 의 것인지 구분이 없다(다중 kind 에서 범위가 갈린다) | `02` §3.2 · §14 SV1·SV3 |
| C-19 | MINOR | HT7 이 NFC·Default_Ignorable 을 다루지 않아 id 매칭이 조용히 0건이 될 수 있다(consumer 의 비필수 제안이 02 에 기록되지 않음) | `02` §16 HT7 · §6.1 |
| C-20 | MINOR | ID4 위반(`site.id` 변경)의 **결과**가 계약에 없다(consumer 는 TRANSIENT + 경보로 구현) | `02` §13 ID4 · §20.1 |
| C-21 | MINOR | 수(number)의 직렬화 형식이 정의되지 않아 "원본 그대로"(§6.1·AR3·PR1)가 기계적으로 보장되지 않는다 | `02` §6.1 · §9 AR3 · §10 PR1 · INV-10 |
| N-1 | NOTE | §15 참고 문구 "canonical JSON(key 정렬)" 은 **재귀** 정렬이어야 예시 해시가 재현된다 | `02` §15 참고 |
| N-2 | NOTE | 실제 emit 산출물(golden)이 계약 규칙을 전부 만족한다(독립 재검증 통과) | §7 |
| N-3 | NOTE | CH-R10·CH-R11a·CH-R11b·CH-R11c 는 consumer 원문과 문자열 일치(기계 대조) | §7 |
| N-4 | NOTE | §21.1 예시의 `publicOrigin` placeholder 가 이미 실제 emit 값과 다르다 | `02` §21.1 |
| N-5 | NOTE | `03` 에 `02` §23(Future extensions)이 없고 §23.6 만 `deferred` 로 섞여 있다 | `03` `deferred` |
| N-6 | NOTE | PR5 의 `totalCost` 금지와 §23.2 의 미래 `totalCost` 추가 사이에 BU3 재검토 조건이 없다 | `02` §10 PR5 · §23.2 |
| N-7 | NOTE | 파일명이 여전히 `…-candidate.{md,json}` (의도적 — `02` 에 명시) | 파일명 |

---

## 1. BLOCKER

### C-01 [BLOCKER] — "유효한 manifest/document" 미정의 · 계약 위반 문서에 대한 `C:` 동작 없음

**위치.** `02` §3.2 가용 상태 표, §19 Compatibility, `03` `core.availabilityStates`.

**인용(`02` §3.2).**

> | `200` + 유효한 manifest + `resources.<kind>` 있음 + document 가 echo 검사(§15) 통과 | **ON** | 새 데이터 적용 |
> | `200` + 유효한 manifest, `resources` 에 그 kind **없음** | **CONFIRMED OFF** (그 resource) | 그 resource 의 보유 데이터를 **즉시 버린다** |
> | manifest `3xx`(HT1 위반), `404` 가 아닌 `4xx`, `5xx`, timeout, 연결 실패, JSON 아님, 모르는 major(§14), echo 불일치, document `404` | **TRANSIENT** | 새 데이터를 적용하지 않고 **마지막 성공 데이터를 유지**한다 |

**인용(`02` §19).**

> - `id`, `title`, `detailUrl` 중 하나라도 없거나 형식이 틀린 record 는 `C:` 가 **그 record 만** 버린다.

**문제.** §3.2 는 "**유효한** manifest" 라는 말로 두 상태(ON·CONFIRMED OFF resource)를 정의하지만, **"유효"가 무엇인지 계약 어디에도 정의가 없다.** 그리고 TRANSIENT 관찰 목록은 **HTTP·JSON 파싱·echo·major** 만 열거한다. 그 사이에 "JSON 으로 파싱은 되지만 계약을 위반한 문서"라는 큰 구멍이 남는다. 구체적으로 다음 위반에 대해 `C:` 가 무엇을 해야 하는지 계약이 말하지 않는다.

| 위반 | 관련 규칙 | 계약이 정한 `C:` 동작 |
|---|---|---|
| record 의 facet id 가 `facets.<key>.values` 에 없음 | VO1 (`P:` 닫힘) | **없음** |
| 선언됐지만 어떤 record 도 쓰지 않는 facet 값 | VO1 역방향 | **없음** |
| document `resource` ≠ manifest 의 key | §3.3 | **없음** |
| `records` 가 없거나 배열이 아님 · `schemaVersion` 형식 오류 | §7.2, SV1 | **없음** (SV3 은 "모르는 major" 만 다룬다) |
| `label` 41자 · `id` 65자 · `title` 121자 | §7.2, §7.3 | **없음** |
| `detailUrl` 이 UR2 위반(절대 URL, query 포함) | UR2/UR3 | UR3 는 "origin 이탈 확인"만 요구 — 그 record 를 버리는지, 문서를 버리는지 **없음** |
| `area.value` 가 음수 · `unit` 누락 | AR1 | AR6 는 "모르는 unit" 만 다룬다 — **누락**은 없음 |
| HT7 금지 문자가 문자열에 들어 있음 | HT7 (`P:` 빌드 실패) | **없음** (§20.1 은 HT7 을 "**구현 예정 gate** — 지금은 보장되지 않는다" 로 표시) |

**왜 BLOCKER 인가.** ① §3.2 는 스스로 존재 이유를 "**두 구현자가 다르게 해석하지 않도록 상태를 고정한다**" 라고 밝힌다. 그 목적이 문서 내용 층에서는 달성되지 않았다. ② consumer 는 이미 자기 문서에 **계약에 없는 해석**을 확정해 뒀다 — 확인 문서 §13.1 행 T: "**200 이지만 무효(모르는 major · origin 불일치 · `site.id` 변경 · 형식 오류) 또는 document `404`/무효 · echo 불일치 → 직전 데이터 상태 유지 … last-good 유지**". 즉 **label 한 개가 41자가 되면 그 사이트의 문서 전체가 조용히 TRANSIENT 가 되고, 72시간 뒤 EXPIRED 로 검색이 멈춘다.** producer 쪽 문서(`02` §19)는 정반대 방향(**record 단위** 폐기)만 규정한다. ③ HT7 은 §20.1 이 "지금은 보장되지 않는다"고 명시한 규칙이므로, **위반 문서가 실제로 나올 수 있는 상태에서 freeze** 됐다. ④ `03` 도 같은 빈칸을 그대로 파생했다(`availabilityStates.TRANSIENT.observed` 에 문서 유효성 항목 없음).

**권고(최소).** §3.2 또는 §19 에 한 줄을 추가한다 — 예: "`C: MUST` 문서 수준 불변식(§3.3 `resource` 일치, §7.2 필수 필드·타입, VO1 닫힘) 위반 = TRANSIENT(문서 전체 거부, last-good 유지). record 수준 위반(§19)·모르는 값(§19·AR6·PR6·VO4)은 그 record/값만 버린다. 길이 상한 초과는 그 문자열을 가진 **record 만** 버린다." 어느 쪽으로 정하든 **정하기만 하면** 해소된다. 규칙 추가가 아니라 빈칸 메우기이므로 major 변경도 아니다.

---

## 2. MAJOR

### C-02 [MAJOR] — 확인 주기 **최소**값만 있고 **최대**값이 없다 → 긴급 내림·동의 철회에 시한이 없다

**위치.** `02` §3.2 CH-R11c, §11.1 VO6, §17 PC5·PC7.

**인용.**

> **CH-R11c** | 확인 주기 최소 간격은 consumer 선언값이다(현재 10분). 최대 수명(72시간)과 함께 VO6 형식으로 선언한다

> PC5 … consumer 에 전파되는 시점은 **다음 성공한 확인 주기**다.

> PC7 | **긴급히 내려야 할 때** producer 의 수단은 둘이다: (a) record 를 비공개로 바꿔 다시 배포 → 다음 성공 주기에 사라진다. (b) 통합을 꺼서 다시 배포 → manifest `404` → 2주기 뒤 consumer 가 전부 버린다(§3.2)

**문제.** 계약이 고정한 시간 값은 **최소 간격**(10분, "이보다 자주 묻지 않는다")과 **last-good 최대 수명**(72시간) 둘뿐이다. **확인 주기의 상한이 없다.** 따라서:

- PC7 **(a)** 개별 record 내림: 상한이 **전혀 없다.** 확인 주기 상한이 없으므로 "다음 성공 주기"는 계약상 임의로 멀 수 있다. last-good 수명은 **성공한 확인**에서 갱신되므로, 매 주기 정상 `200` 을 받는 사이트에서는 72시간 상한도 걸리지 않는다. 즉 **공개 취소한 사례가 계약상 언제 사라지는지 보장이 없다.**
- PC7 **(b)** 통합 전체 끄기: "2주기"도 같은 이유로 상한이 없다.
- 이 계약이 `404` 2회 규칙을 도입한 이유 자체가 §3.2 에 이렇게 적혀 있다: "**왜 `404` 는 last-good 을 유지하지 않는가: 사이트가 통합을 끄거나 동의를 철회했을 때 72시간 동안 계속 추천되는 것을 막기 위해서다.**" 그런데 주기 상한이 없으면 그 보호가 72시간보다 **더 길어질 수도** 있다(연속 `200` 상태에서 주기가 길 때).

consumer 는 자기 구현에서 10분을 **주기**로 쓴다("enabled `first_party_static` 행마다 10분 간격으로 돈다"). 그러나 계약에 적힌 것은 **최소 간격**이라 같은 문장을 "최소 10분, 실제로는 하루 1회"로 읽어도 계약 위반이 아니다. producer 가 고객에게 "내리면 얼마 안에 반영되는가"를 답할 근거가 계약에 없다.

**권고.** CH-R11c 의 형식을 유지하되 "확인 주기 **최대** 간격(= 전파 상한)"을 같은 VO6 형식 선언값으로 추가하고, PC5/PC7 의 "다음 성공 주기"를 그 값으로 한정한다.

---

### C-03 [MAJOR] — facet 외 한도(문서 1 MiB · record 1,000 · manifest 64 KiB) 초과 시 동작이 계약에 없다

**위치.** `02` §11.1 VO6, `03` `portfolio.facetRules.VO6`.

**인용(`02` VO6, CH-R10 반영문).**

> VO6 | consumer 는 자기 한도(facet 당 값 수, record 수, 문서 크기)를 **선언**할 수 있다. 현재 선언값(**잠정** …): manifest 64 KiB · 문서 1 MiB · record 1,000 · facet key 별 `category` 50 · `scope` 150 · `tag` 150 … `P: SHOULD` 빌드가 이 한도를 넘는 사이트에 **경고**한다. `C: MUST` 한도를 넘는 **facet** 은 **통째로** 무시한다 — 일부만 잘라 쓰면 나머지 record 가 조용히 검색 불가가 된다. producer 는 값을 잘라 내지 않는다

**문제.** `C: MUST` 는 **facet 한도**에만 걸려 있다. 세 한도(manifest 64 KiB · 문서 1 MiB · record 1,000)를 넘겼을 때의 동작은 계약에 **없다.** consumer 는 이미 정해 뒀다(확인 문서 §12.3 L1):

> `document ≤ 1 MiB (reader maxBytes = 1 MiB; 초과 → too_large → TRANSIENT)` · `records ≤ 1,000 (초과 → document 전체 거부 = TRANSIENT; 잘라 쓰지 않음)` · R12-5: "`maxBytes` 는 manifest 64 KiB, document 1 MiB"

즉 **record 가 1,001건이 되는 순간 그 사이트의 통합은 통째로 TRANSIENT 가 되고 72시간 뒤 검색이 멈춘다.** producer 쪽 계약 의무는 `P: SHOULD` **경고**뿐이고, 그 경고조차 SHOULD 다. §23.6 은 "규모 — consumer 선언 한도(VO6)에 가까워지면 분할 또는 압축 허용을 **협의한다**"로만 적혀 있어, 한도를 넘은 뒤의 관찰 가능한 동작을 정하지 않는다. `01` 이 사이트당 20–300건을 예상하므로 지금 당장의 문제는 아니지만, **계약이 정의하지 않은 채 consumer 가 이미 구현을 확정한** 영역이다(= C-01 과 같은 종류의 divergence).

**권고.** VO6 에 한 줄: "`C: MUST` 문서 크기·record 수 한도를 넘으면 그 문서를 통째로 거부한다(TRANSIENT). 잘라 쓰지 않는다. facet 한도 초과는 그 facet 만 무시한다." + 이 경우 `P: SHOULD` → `P: MUST` 빌드 경고 승격 검토.

---

### C-04 [MAJOR] — origin **동일성 판정 규칙**이 없다

**위치.** `02` §5, §7.1, §16 HT8.

**인용.**

> (`02` §5) `C: MUST` `site.publicOrigin` 이 **자신이 등록해 둔 origin 과 다르면 manifest 를 거부**한다(TRANSIENT 로 취급). manifest 안의 값으로 등록 origin 을 덮어쓰지 않는다.

> (`02` §7.1) `site.publicOrigin` | MUST | `https://host[:port]` | path·query·credentials 없음

> (`02` HT8) consumer 는 `site.publicOrigin` 과 같은 **canonical origin 하나만** 등록한다.

**문제.** "다르면"의 비교 방법이 없다. 문자열 비교인지 origin 비교인지, 다음이 같은 origin 인지 계약이 말하지 않는다.

- `https://Example.com` ↔ `https://example.com` (host 대소문자)
- `https://example.com:443` ↔ `https://example.com` (기본 port)
- `https://한글.kr` ↔ `https://xn--bj0bj06e.kr` (IDN ↔ punycode)
- 후행 `/` 가 붙은 `https://example.com/`

이 대조는 **fail-closed** 다: 불일치면 영구 TRANSIENT → last-good 수명 만료 → 그 사이트 검색 중단. 즉 **잘못 판정하면 통합이 조용히 죽고, 증상은 "TRANSIENT 가 계속됨"이라 원인 추적이 어렵다.** consumer 는 이 위험을 정확히 지목하고 자기 쪽을 `URL.origin` 비교로 고정했다(R12-3: "문자열을 그대로 비교하지 않는 이유는 IDN 한글 도메인·대문자 host·`:443` 이 같은 origin 인데도 영구 불일치 → EXPIRED 가 되기 때문이다"). 그리고 **producer 쪽 SHOULD 를 제안했으나 `02` 는 채택하지 않았고, 채택하지 않기로 한 사실도 기록하지 않았다**(R12-3: "비필수 제안: producer 가 ASCII 직렬화 형태로 내면(SHOULD) 더 좋다"). 두 번째 consumer(계약은 §16 에서 "web-recon 이 아닌 first-party producer"도 상정한다)가 문자열 비교로 구현하면 그 조합은 동작하지 않는다.

**권고.** §5 또는 §7.1 에: "비교는 WHATWG origin 직렬화 기준이다(host 소문자, 기본 port 제거, IDN 은 ASCII/punycode)." + `P: SHOULD` `site.publicOrigin` 을 그 정규형으로 낸다.

---

### C-05 [MAJOR] — `02` 는 명시적 port 를 허용하는데 consumer 는 거부한다

**위치.** `02` §7.1 ↔ consumer 확인 §14 R12-1.

**인용.**

> (`02` §7.1) `site.publicOrigin` | MUST | `https://host[:port]`

> (consumer R12-1) `first_party_static` 등록 입력: `new URL(input)` → `https:` · userinfo 없음 · pathname `/` · query/fragment 없음 · **명시적 port 불가**(V1, net-guard 에 port 제한이 없는 것을 보완). **`url.origin` 을 저장한다**

**문제.** R-12 의 판정은 **ACCEPT** 이고 `02` 는 그 ACCEPT 를 근거로 freeze 됐지만, consumer 의 구현 규칙은 `02` §7.1 이 명시적으로 허용한 형태를 **거부**한다. 계약을 그대로 구현한 producer(예: `https://demo.example.com:8443` 로 서빙)는 **계약 위반이 아닌데도 등록될 수 없다.** `04` R-12 의 질문 문구("canonical origin 하나만 등록하는가")도 port 를 다루지 않아, 양쪽 문서 어디에도 이 축소가 기록되지 않았다. freeze 문서가 "REJECT 0 · 문구 변경 4건 외 이견 없음"이라고 선언한 상태와 실제 구현 제약이 어긋난다.

**권고.** 둘 중 하나. ① `02` §7.1 을 "기본 port(443) 외 명시적 port 는 V0 밖" 으로 좁힌다(consumer 실구현과 일치). ② consumer 가 port 를 허용한다. 어느 쪽이든 **양쪽 문서에 같은 문장**이 있어야 한다.

---

### C-06 [MAJOR] — CH-R11b 의 새 `P: MUST` 가 §16·§20.1·§22 어디에도 없다

**위치.** `02` §3.2(CH-R11b) ↔ §16 HTTP serving requirements ↔ §20.1 보장 등급 ↔ §22 Test invariants.

**인용(`02` §3.2 CH-R11b).**

> **`P: MUST` 통합을 끈 사이트의 manifest 경로는 `404` 로 응답한다(`403` 이 아니다)** — 저장소가 없는 객체에 403 을 주는 serving 구성에서는 "껐다"가 영영 감지되지 않고 72시간 만료로만 드러나기 때문이다

**문제.** 이 문장은 **새로 생긴 producer 서빙 의무**인데, 계약이 서빙 의무를 모아 둔 §16 표(HT1–HT8)에 **행이 없다.** §16 은 스스로 "계약은 **관찰 가능한 동작**만 요구한다"며 서빙 요구의 목록 역할을 하고, HT1 은 `200` 경로만 다룬다("`GET https://<publicOrigin>/_integration/manifest.json` → **직접 `200`**, redirect 없음"). §16 만 읽고 구현하는 사람은 이 MUST 를 놓친다.

더 중요한 것은 **§20.1 보장 등급표에 이 규칙이 없다**는 점이다. §20.1 의 존재 이유는 첫 줄에 적혀 있다: "**한쪽이 기계적으로 보장할 수 없는 규칙을 보장하는 것처럼 쓰지 않는다.**" 이 MUST 는 emitter 가 아니라 **serving runtime + 저장소 구성**이 지키는 규칙이고, §16 의 HT1·HT5 는 같은 이유로 "**미검증** — pilot 배포에서 1회 측정"으로 분류돼 있다. 그런데 부재 경로의 상태 코드는 등급이 없다. §22 INV 목록에도 producer 측 불변식이 없다(§22 consumer 측 문장만 `404`×2 동작을 다룬다). `06` Phase D 검증 목록에는 들어 있으나(`06` §"검증 (계약 §16)"), 그것은 계획 문서이지 계약이 아니다.

**권고.** §16 에 `HT9`(또는 HT1 확장)로 "통합이 없는/꺼진 패키지의 `/_integration/*` 는 `404`"를 넣고, §20.1 에 등급(현 상태 = 코드 확인 또는 미검증)을, §22 에 producer 불변식 1행을 추가한다.

---

### C-07 [MAJOR] — URL 문자 집합·퍼센트 인코딩 규칙이 없는데 "변형 없이" 쓰라고 한다

**위치.** `02` §12 UR2·UR3.

**인용.**

> UR2 | `P: MUST` 계약 문서 안의 모든 URL 은 **path 만 있는 root-relative 참조**다: `/` 로 시작, `//` 로 시작하지 않음, scheme·host 없음, **query·fragment 없음**, `\` 없음, 제어문자 없음.

> UR3 | `C: MUST` URL 을 **등록된 origin**(= `site.publicOrigin`, §5)에 대해 해석하고, 해석 결과가 그 origin 을 벗어나지 않는지 확인하고, **변형 없이** 쓴다.

**문제.** UR2 는 금지 목록만 준다. **허용 문자 집합과 인코딩 형태가 없다.** 그런데 이 계약은 비-ASCII 원문 식별자를 명시적으로 허용한다(VO2: "id 는 ASCII 가 아닐 수 있다" — 데모의 `scope` id 가 실제로 한글이다). 따라서 한글 slug 가 있는 사이트에서 `detailUrl: "/portfolio/수성-화이트-34평"` 은 UR2 를 만족한다. 이때:

- UR3 의 "등록 origin 에 대해 해석"을 표준 URL 파서로 하면 결과는 `%EC%88%98…` 로 **퍼센트 인코딩된다** → "**변형 없이** 쓴다"와 문자 그대로 충돌한다.
- 반대로 producer 가 이미 퍼센트 인코딩해서 냈다면, 그 문자열은 `%` 를 포함하고 재해석 시 이중 인코딩 위험이 생긴다. 어느 쪽이 정본인지 계약이 말하지 않는다.
- 공백·`%`·`+` 등도 금지 목록에 없다.

또 UR2 는 "제어문자 없음"만 말하고 HT7 의 금지 집합(U+2028/2029, 방향 제어)을 URL 에 대해 **다시** 언급하지 않는다(HT7 이 "모든 문자열"이라 덮이긴 한다).

**왜 MAJOR 인가.** `detailUrl` 은 방문자에게 제시되는 유일한 링크이고, 틀리면 `404`(빈 카드)로 끝난다. consumer 의 R12-4 는 "UR2 형식 검사 → `new URL(ref, origin).origin === origin` 확인 → **변형 없이** 사용"으로 계약 문구를 그대로 옮겨서, 한글 slug 사이트에서 무엇을 링크로 쓸지 두 구현이 갈릴 수 있다.

**권고.** UR2 에 한 줄: "path 는 **이미 퍼센트 인코딩된 ASCII 형태**로 낸다(RFC 3986 path 문자만)." 또는 반대로 "원문 Unicode 로 내고 `C:` 가 인코딩한다"를 택하고, UR3 의 "변형 없이"를 그 선택에 맞게 다시 쓴다.

---

### C-08 [MAJOR] — `category` "정확히 1개" 가 규범 표기·검증 없이 표에만 있는데 `C: MUST` PR4 가 그것에 의존한다

**위치.** `02` §11.3 ↔ §10 PR4 ↔ §7.3 ↔ §22.

**인용.**

> (§11.3) | `category` | portfolio | 사이트 taxonomy 상의 **주 분류** | 정확히 1개 | 닫힘 |

> (§7.3) | `facets.<key>` | MAY | `facets.<key>.values[].id` 의 배열, 1개 이상 (§6.1) | 매칭 |

> (§10 PR4) **category 가 다르면 같은 축이 아니다.** `C: MUST` 가격으로 비교·정렬·"가깝다"를 말할 때는 **같은 `category` 값을 가진 record 끼리만** 한다.

**문제.** ① "정확히 1개"에 `P:`/MUST 표기가 없고 규칙 id 도 없다(VO1–VO6 어디에도 cardinality 규칙이 없다). ② §7.3 의 일반 규칙은 "1개 이상"이라서, 표만 보면 category 2개도 형식적으로 적법해 보인다. ③ §22 INV 목록에 cardinality 불변식이 없다(INV-8 은 닫힘만). ④ §20.1 보장 등급표에도 없다 — 즉 **아무도 기계적으로 보장하지 않는다**고 표시돼 있지도 않다. ⑤ 그런데 `C: MUST` 인 PR4(가격 비교의 유일한 허용 축)와 BU3("허용되는 가장 강한 주장은 **같은 category 안에서** 평당가 기준으로 가까운 사례")는 **record 당 category 가 하나라는 전제 위에서만** 의미가 확정된다. category 가 2개인 record 가 오면 "같은 category 끼리"의 정의가 갈린다(교집합? 어느 하나라도 같으면? 첫 번째 값?).

실제 emit 산출물은 8건 모두 category 1개다(§7 검증). 즉 지금 깨지지 않지만, **계약 문구만으로는 보장되지 않는다.**

**권고.** §11.3 의 해당 칸을 `P: MUST`(record 당 정확히 1개)로 표기하고 §22 에 INV 1행(`category` cardinality), §20.1 에 등급(기계적 — emitter 검증)을 추가한다. 또는 PR4 를 "category 집합이 완전히 같은 record 끼리"로 다시 쓴다.

---

### C-09 [MAJOR] — freeze 근거로 인용한 OD-1·OD-2 결정이 인용처(`04`)에 없다

**위치.** `02` 머리말·§18 SE6 ↔ `04` "OWNER DECISIONS" · "FINAL READINESS MATRIX".

**인용(`02` 머리말).**

> - 상태: **FROZEN — Integration Contract V0 (`schemaVersion "0.1"`).** … freeze 근거:
>   - owner 결정 OD-1 승인, OD-2 = **(a) 사이트별 opt-in, 기본 off** (`04`).

**인용(`02` §18 SE6).**

> SE6 | 통합은 사이트별로 **켜는 것**을 전제로 썼다 — owner 결정 OD-2 = **(a) 사이트별 opt-in, 기본 off** (2026-09-22 확정, `04`).

**인용(`04` — 실제 내용).**

> | OD-1 | 이 후보를 Contract V0 로 승인하고 consumer 팀에 R-1…R-12 를 보내는가 | 승인 / 수정 후 승인 / 보류 | 승인 후 송부 | 승인 전에는 양쪽 구현 0 | **예** |
> | OD-2 | 통합 emit 을 **사이트별 opt-in** 으로 할 것인가 | (a) opt-in, 기본 off (b) 모든 public 사이트 기본 on | (a) | … | **예** — `02` SE6 과 readiness matrix 가 이 결정에 걸려 있다 |

`04` 에는 **권고(Recommendation)만 있고 결정 기록이 없다.** 같은 문서의 matrix 도 결정 전 상태 그대로다:

> `WEB_RECON_PRODUCER_CONTRACT_READY = YES (candidate; human approval pending)`
> `PORTFOLIO_RESOURCE_CONTRACT_READY = YES (12 confirmation items R-1…R-12 open with the consumer)`
> `CURRENT_SITE_DATA_CHANGE_REQUIRED_FOR_V0 = DEPENDS ON OD-2`
> `BLOCKERS_BEFORE_IMPLEMENTATION = 0 technical. Gate = human approval of this candidate + OD-2 + consumer answers to R-1…R-12`
> `RECOMMENDED_NEXT_STEP = Owner reviews 02 (normative) → decides OD-1/OD-2 → …`

**왜 MAJOR 인가.** OD-2 는 **사람이 정해야 한다고 계약 자신이 못 박은 동의(consent) 결정**이다. `02` SE1 이 명시하듯 통합을 켜면 "**템플릿이 화면에 그리는지와 무관하게**" 면적 기준·공개 시각 같은 사실이 기계 판독 index 로 공개된다. 그 결정의 유일한 인용처가 결정을 담고 있지 않으면, "기본 off" 가 누가 언제 승인한 것인지 문서로 추적되지 않는다(실제로는 `docs/result/first-party-integration-producer/01-contract-freeze.md` 표에만 있다 — 그러나 `02` 는 그 문서를 결정 근거로 인용하지 않는다). freeze 의 증거 사슬이 끊겨 있다.

**권고.** `04` 에 결정 기록(일자·결정자·선택지)을 추가하거나, `02` 의 인용처를 실제 결정이 기록된 문서로 바꾼다. 아울러 `04` matrix 의 "human approval pending"·"R-1…R-12 open"을 갱신한다(→ C-14).

---

## 3. MINOR

### C-10 [MINOR] — 산문 규칙 개정의 버전·통지 절차 부재 (freeze 자체는 정당)

**판단: 버전 bump 없이 freeze 한 것은 정당하다.** ① 네 변경은 필드·타입·enum 을 바꾸지 않는다. ② 변경을 요청한 쪽이 consumer 이고 `02` 는 그 원문을 그대로 반영했다(§7 기계 대조). ③ 양쪽 모두 구현 0 인 상태였다(consumer 확인 §3 "아직 구현 0", `04` "승인 전에는 양쪽 구현 0"). SV2 의 major 기준("필드 제거·의미 변경·타입 변경")은 **문서 스키마**의 기준이므로 산문 명확화에 적용되지 않는다.

**남는 결함.** 그럼에도 계약에는 **문서 개정 식별자와 개정 통지 절차가 없다.** SV4 는 major 사전 통지만, VO6 는 선언 한도 변경 통지만 다룬다. CH-R11a 는 "'연속'의 **의미를 정하는** 변경"이라고 `02` 스스로 인정하는데, 그런 변경이 앞으로 또 생기면 이미 구현한 쪽은 데이터만 봐서는 알 수 없다(문서의 날짜 줄이 유일한 단서다). `03` 의 `"contractVersion": "0.1"` 은 `02` 에 없는 개념이라 schemaVersion 과 개정 번호를 혼동시킨다.

### C-11 [MINOR] — `404` 1회 관찰의 상태가 표에 없다

§3.2 표의 세 행은 `404` **2회**, `404` 가 **아닌** 4xx, 그리고 `200` 계열만 다룬다. **첫 `404` 1회**는 ON 도 CONFIRMED OFF 도 TRANSIENT 도 아니다. 그 시점에 보유 데이터를 유지하는지는 "2회에 버린다"에서 유추할 뿐 명시가 없다. 표 아래 문장은 "첫 `404` 에서 검색을 일시 중단하는 것(consumer 내부 상태 SUSPECT)은 consumer 내부 규칙이다. 이 계약은 그것을 요구하지도 금지하지도 않는다"로 **중단 여부**만 다루고, **데이터 보존 여부**는 다루지 않는다. TRANSIENT 행에 "`404` 1회"를 넣으면 해소된다.

### C-12 [MINOR] — §3.2 TRANSIENT 행에 "origin 불일치"가 빠졌다

`02` §5 는 origin 불일치를 "TRANSIENT 로 취급"이라고 하고, `03` 은 `TRANSIENT.observed` 에 `"publicOrigin mismatch"` 를 넣었으며, 1차 리뷰 F-01 의 반영 내역도 "TRANSIENT(… ·origin 불일치 → last-good 유지)"라고 적는다. **그런데 정작 규범 문서 §3.2 의 관찰 목록에는 없다.** `03` 이 옳고 `02` 가 불완전한 드문 사례다(§0 의 우선순위 규칙에 따르면 형식상 `02` 가 이기므로, 고쳐야 할 쪽은 `02` 다).

### C-13 [MINOR] — `03` 이 `02` 에 없는 제약을 추가한다 (`amount` > 0)

`03`:

> `"priceRules": { "shape": { "amount": "positive number in the currency's major unit, <= 2 fraction digits, as authored", … } }`

`02` PR1 에는 **양수 요건이 없다**(AR1 은 `area.value` 에만 "양수"를 건다). 파생본이 규범을 넘어 제약을 만든 경우이고, `03` 자신의 선언("Any disagreement is a defect of this file")에 따라 `03` 의 결함이다. 실질 영향은 작지만(MD2 가 `0` placeholder 를 금지한다), consumer validator 가 `03` 을 근거로 `amount <= 0` 을 거부하면 `02` 에 없는 거부가 생긴다.

### C-14 [MINOR] — `04` 가 consumer 회신·freeze 이전 상태 그대로다

`02` 는 `04` 를 근거 문서로 인용하지만, `04` 에는 freeze 로 무효가 된 수치·상태가 남아 있다.

- `§A` "Consumer limits ( … / facet 당 40)" · 판정 칸 "facet 40 초과 시 '통째로 무시'" · "**5s·64 KiB 는 consumer 내부 상수이므로 계약에 넣지 않는다**" → 현 VO6 는 **manifest 64 KiB 를 계약 문구에 담고 있다.** 정면으로 어긋난다.
- `R-9` "facet 값이 **40**을 넘으면", `R-10` "facet 당 **40** 상한", matrix "20 distinct values in 8 records vs consumer cap **40**", 최종 질문 조건 2 "consumer 상한(**40**)", checklist "사이트 전체 **40**종 이하" → 전부 50/150/150 로 대체됐다(`02` §24 와 `06` A4 는 갱신됨).
- `§B site.publicOrigin` 판정 "https `publicOrigin` 이 없으면 **emit 하지 않는다**" → `02` §4·INV-11 은 "**빌드가 실패한다**"(조용한 누락 금지)로 더 강하다.
- matrix 의 "human approval pending" · "12 confirmation items R-1…R-12 open with the consumer" · "Gate = … consumer answers to R-1…R-12" → 회신 완료.

판정(ACCEPT/REJECT/DEFER) 자체는 `02` 와 모순되지 않는다(§6 점검표 참조). 문제는 **수치와 상태**다.

### C-15 [MINOR] — `tag` "record 당 0개 이상" 이 다른 절과 충돌한다

- §11.3: | `tag` | … | **0개 이상** | **열림** |
- §7.3: `facets.<key>` … "`facets.<key>.values[].id` 의 배열, **1개 이상**"
- §7.2: "값이 0개인 facet 은 선언하지 않는다" / INV-9: "빈 facet 없음"
- MD3: "빈 배열 `[]` = '없음이 **확인됨**'… V0 producer 는 `records` 외에는 `[]` 을 내지 않는다"

"0개 이상"을 `"tag": []` 로 읽으면 세 규칙을 동시에 위반하고, 열린 facet 에서 "확인된 없음"을 주장하게 되어 §11.3 자신의 "태그가 없다고 그 속성이 없는 것이 아니다"와도 모순된다. 의도는 "**key 자체를 생략할 수 있다**"일 것이다. 그렇게 써야 한다.

### C-16 [MINOR] — `scope` "record 당 1개 이상" 의 강제성이 모호

같은 표에서 `scope` 는 "1개 이상"이다. 이것이 "**모든 record 에 `scope` 가 있어야 한다**"인지, "있으면 값이 1개 이상"(= §7.3 의 일반 규칙과 동어반복)인지 구분되지 않는다. §11.3 본문은 "record 에 `scope` **가 있으면** 그것이 그 record 의 포함 범위 목록 전체다"라고 조건부로 쓰므로 후자로 보이지만, 표는 전자로 읽힌다. `area`·`pricePerArea` 처럼 MAY 인지 여부가 degradation(§20)과 MD5 평가에 직접 영향을 준다.

### C-17 [MINOR] — `facets` 맵의 key 순서 규칙이 없다

§6.1 은 "`records` 순서", "`facets.<key>.values` 순서", "record 의 `facets.<key>` 배열" 세 가지만 고정하고, 직렬화 행은 "위 예시의 key 순서로 쓴다"고 한다. 그러나 **`facets` 객체 안에서 facet key 들이 어떤 순서로 나오는지**는 §6 예시(`<facetKey>` 하나)에도 없다. INV-1 은 "같은 snapshot → **byte 단위로** 같은 manifest·document"를 요구하므로, 이 자유도는 불변식과 어긋난다. (`version` 은 정렬 canonical JSON 해시라 영향이 없다 — 즉 **byte 는 달라지는데 version 은 같아지는** 경우가 규칙상 가능하다.) 실제 emit 은 `category` → `scope` → `tag` 순이다.

### C-18 [MINOR] — "모르는 major" 의 범위가 불명

SV1: "manifest 와 각 resource document 가 **각자** 갖는다(서로 독립)". SV3: "`C:` 모르는 major 는 TRANSIENT 로 취급한다(§3.2)". §3.2 TRANSIENT 행: "모르는 major(§14)". **어느 문서의 major 인지, 그리고 resource document 쪽 major 만 모를 때 사이트 전체가 TRANSIENT 인지 그 resource 만 못 쓰는 것인지** 정해져 있지 않다. V0 는 kind 가 하나라 무해하지만, 계약은 core 를 "모든 resource · 모든 업종" 재사용으로 선언한다(§1). §23.1 이 kind 추가를 minor 로 두었으므로 곧 실제 문제가 된다.

### C-19 [MINOR] — HT7 이 NFC·Default_Ignorable 을 다루지 않는다

HT7 의 금지 집합은 C0/DEL/C1/U+2028·2029/방향 제어다(1차 리뷰 F-12 에서 zero-width 를 의도적으로 제외). 그런데 이 계약은 **facet id 를 비-ASCII 원문 문자열로 쓰고**(VO2), §6.1 은 "문자열 원본 그대로 … `C:` 는 code point 단위로 비교한다"고 한다. consumer 는 모델에 넣는 텍스트에 NFC 정규화 + Default_Ignorable 제거를 적용하므로, producer 가 같은 뜻의 id 를 NFC/NFD 로 섞어 내거나 U+200D·U+FE0F 를 포함해 내면 **정확 일치가 조용히 0건**이 된다(consumer R-3 의 분석 그대로). consumer 는 자기 쪽 canon 색인으로 완화하고 producer SHOULD 를 **비필수 제안**으로 남겼다("HT7 gate 에 '모든 문자열이 NFC 이고 Default_Ignorable 문자가 없음'을 SHOULD 로 추가하면 … **요구 사항은 아니다**"). 문제는 `02` 가 그 제안을 **채택하지도, 기각 사실을 기록하지도** 않았다는 점이다 — 나중에 "왜 안 넣었나"를 추적할 수 없다. (실제 emit 은 전부 NFC 다 — §7.)

### C-20 [MINOR] — ID4 위반의 결과가 계약에 없다

ID4: "`site.id` 는 도메인이 바뀌어도 유지된다. … 통합을 켠 뒤에는 바꾸지 않는다." §20.1 은 이를 "**운영 규칙** — 수정을 막는 장치는 없다"로 분류한다. 그러나 **바뀌었을 때 consumer 가 무엇을 하는지**가 없다. consumer 는 이미 정해 뒀다(R12-6c: "첫 성공 때 `site.id` 를 고정한다. 바뀌면 TRANSIENT + ops 경보", §13.1 행 T 에 "`site.id` 변경"). 계약에 없으므로 producer 는 "운영 규칙 위반"의 실제 결과(그 사이트의 통합이 조용히 정지)를 문서로 알 수 없다. C-01 의 하위 사례이기도 하다.

### C-21 [MINOR] — 수(number)의 직렬화 형식이 없어 "원본 그대로"가 기계적으로 보장되지 않는다

§6.1: "| 수 | 원본 그대로(§9 AR3, §10 PR1) |", AR3 "입력된 `value`·`unit` 을 **그대로** 낸다", PR1 "…, 입력된 그대로", INV-10 "`area`·`pricePerArea` 의 수·단위·기준은 원본과 같다(환산 없음)".

JSON 수는 값이지 표기가 아니다. 원본 `34.50` → `34.5`, `2.9e6` → `2900000` 같은 표기 변화는 파싱/직렬화 왕복에서 필연적이고, 이는 문서 **바이트**와 **`version` 해시**를 바꾼다(RV1/RV2·INV-1·INV-2 와 직접 연결). "소수 2자리 이하"도 double 표현 한계 때문에 문자열 없이 검증할 수 없다(consumer 도 이를 인지하고 "허용 오차로 검사"한다고 적었다 — 확인 문서 §8). 정확히 무엇이 "원본 그대로"인지(값인지 표기인지) 한 줄로 못 박아야 INV-1/INV-10 이 검증 가능한 명제가 된다.

---

## 4. NOTE

- **N-1.** §15 참고(비규범) "producer 는 `version` 을 뺀 문서의 canonical JSON(key 정렬) sha256 앞 32 hex 를 쓴다" — **재귀 정렬**이어야 예시가 재현된다. 최상위만 정렬하면 §21.2 예시가 `e5154850…` 이 되어 문서에 적힌 `6d641b6f…` 와 다르다(§7 검증). 비규범이고 `C:` 는 의존하지 않지만(RV4), 한 단어("모든 수준의 key 정렬")면 모호성이 사라진다.
- **N-2.** 실제 emit 산출물(`data/site-builds/boost-interior-demo/packages/39c69a40…/site/_integration/`)을 계약 규칙으로 독립 검증했고 **위반 0** 이다(§7). 계약이 현재 데이터에 대해 구현 가능하다는 증거다.
- **N-3.** CH-R10 · CH-R11a · CH-R11b · CH-R11c 는 consumer 원문과 **문자열이 일치**한다(강조 `**`·backtick·따옴표 정규화 후 기계 대조, §7). `02` 의 "consumer 원문 그대로 반영했다" 주장은 사실이다. CH-R10 의 세 번째 요청("`06` A4 경고 문턱: key 별 값으로")도 `06` A4 에 반영돼 있다.
- **N-4.** §21.1 예시의 `"publicOrigin": "https://boost-interior-demo.example"` 는 "데모의 placeholder"라고 밝혀져 있으나, **실제 emit 산출물은 이미 `https://interior-demo.boostweb.co.kr`** 이다. consumer 도 P-4 에서 같은 점을 지적했다. 예시를 실제 값으로 갱신하거나 placeholder 임을 계속 유지할지 정하는 편이 좋다(계약 규칙에는 영향 없음).
- **N-5.** `03` 에 `02` §23(Future extensions)에 대응하는 절이 없고, §23.6(분할·압축)만 `deferred` 배열에 섞여 있다("sharding / compression for large indexes"). 비규범 영역이라 parity 결함은 아니지만, `03` 만 읽는 쪽은 §23 의 방향(특히 §23.5 의 "UR2 의 'query 없음'은 그 필드에 한해 완화된다")을 알 수 없다.
- **N-6.** PR5 "V0 에는 **총 공사비 필드가 없다.** `P: MUST NOT` `amount × area.value` 를 어떤 필드로도 내지 않는다. 이름 `totalCost` 는 예약" ↔ §23.2 는 `totalCost` 를 additive(minor) 확장 후보로 둔다. 모순은 아니다(미래의 `totalCost` 는 **입력된 사실**이지 파생이 아니다). 다만 그때 BU3("총액 적합성을 주장하지 않는다")가 자동으로 완화되는지 여부를 §23.2 나 §24 에 한 줄로 남기는 편이 안전하다.
- **N-7.** 파일명이 `02-…-candidate.md` / `03-…-candidate.json` 인 채로 FROZEN 이다. `02` 가 "이름·번호를 바꾸지 않는다"고 명시했고 consumer 문서들이 그 경로를 가리키므로 의도된 선택이다. 다만 파일명만 본 사람은 후보로 오해한다.

---

## 5. 점검 항목별 결과 (지시받은 1–9)

| # | 항목 | 결과 |
|---|---|---|
| 1 | **02 ↔ 03 parity** | 규칙 id 단위로 대조했다. `02` 의 MD1–MD6·ND1·AR1–AR6·PR1–PR6·BU1–BU4·VO1–VO6·UR1–UR6·ID1–ID5·SV1–SV5·RV1–RV5·HT1–HT8·PC1–PC7·SE1–SE6·INV-1–INV-14 **전부** `03` 에 대응 항목이 있다. 2026-09-21 잔재는 **없다**(`valuesPerFacet: 40` 제거됨, `status` = FROZEN, SE6 = OD-2 확정, `deferred` 의 scope 150 반영). 차이는 셋뿐: `03` 이 TRANSIENT 에 origin 불일치를 **추가**(C-12 — `02` 쪽 누락), `amount`에 "positive" **추가**(C-13), §23 **누락**(N-5). |
| 2 | **CH-R10/11a/11b/11c 원문 일치** | 네 건 모두 **일치**(기계 대조, §7). `03` 의 영문 요약도 같은 의미를 담는다(`freezeBasis.changes`, `availabilityStates.consecutive404`, `VO6.consumerDeclaredLimitsCurrent`). |
| 3 | **R-1…R-12 · 04 dispositions** | 판정 수준에서 **모순·누락 없음**. R-1(vocabulary→document) §6, R-2(facets 맵) §6·VO4, R-3(비-ASCII id) VO2, R-4(tag 열림) §11.3, R-5(basis 생략) AR2·AR3, R-6(major unit) PR1, R-7(BU1–BU4) §10.1, R-8(400/121) AR4, R-9(facet 통째 무시) VO6, R-10 CH-R10, R-11 CH-R11a–c, R-12 §5·HT8 — 전부 계약 문구로 존재한다. 다만 `04` 자체의 **수치·상태가 stale**(C-14)이고, OD 결정 기록이 없다(C-09). 그리고 consumer 가 ACCEPT 하면서 **자기 구현에서 계약보다 좁게 잡은 것**이 둘 있다: port 금지(C-05), 문서 유효성·한도 초과 시 전체 거부(C-01·C-03). |
| 4 | **가용 상태 semantics** | CH-R11a/b 덕분에 404 카운팅·403 대 404 는 **내부적으로 일관**하고 consumer §13.1 상태표와도 일치한다. 남은 결함: 시간 상한 없음(C-02), 404 1회(C-11), origin 불일치 행 누락(C-12), major 범위(C-18), 그리고 "유효"의 미정의(C-01). |
| 5 | **Origin binding · URL** | 등록 origin 우선·덮어쓰기 금지·별칭 거부·root-relative 강제의 **방향은 옳다.** 결함: 동일성 판정 규칙 없음(C-04), port 허용 범위 불일치(C-05), 문자 집합·인코딩 없음(C-07). |
| 6 | **Facets · 닫힘 · 순서 · 한도** | VO1 닫힘(양방향)·순서 규칙·"producer 는 자르지 않는다"·"`C:` 는 통째로 무시"는 명확하고 실제 산출물에서 검증된다. 결함: facet key 순서(C-17), cardinality(C-08·C-15·C-16), facet 외 한도의 초과 동작(C-03). |
| 7 | **생략/[]/null · area basis · price · 총액 금지** | MD1–MD6·MD3 의 `[]` 규칙·AR2/AR3(공급·전용·모름=생략)·AR5(환산 금지)·PR2/PR3/PR5·BU1–BU4 는 **일관되고 빈틈이 없다.** owner 결정(저장된 basis 그대로 emit · exclusive 환산 금지 · 총액 생성 금지 · null 금지 · 날조 금지)이 모두 규칙으로 존재하고 INV-9/INV-10 이 검증한다. 남은 것은 수 표기(C-21)뿐. **이 영역이 계약에서 가장 견고하다.** |
| 8 | **버전 · 해시 · breaking 기준** | schemaVersion(문서별 독립)과 resource version(내용 해시, echo, 파일명)의 분리는 명확하고 실제 산출물에서 재현된다. **버전 bump 없는 freeze 는 정당하다**(C-10 의 판단 참조). 남은 결함: 산문 개정 절차 부재(C-10), 해시 참고 문구의 정렬 범위(N-1), major 범위(C-18). |
| 9 | **구현이 갈릴 수 있는 모호성** | C-01(문서 유효성) · C-02(주기 상한) · C-03(한도 초과) · C-04(origin 비교) · C-07(URL 인코딩) · C-08(category 수) · C-15/C-16(facet cardinality) · C-17(key 순서) · C-18(major 범위) · C-21(수 표기). |

---

## 6. 결론

- **Contract V0 를 지금 상태로 양쪽이 구현하기 시작하면, 정상 경로에서는 같은 결과가 나온다.** §21 golden 이 그 증거다(§7).
- **그러나 "producer 가 규칙을 어긴 문서"와 "한도를 넘은 문서"에서 두 구현은 반드시 갈린다**(C-01, C-03). consumer 는 이미 "문서 전체 거부"로 굳혔고, 계약은 그 반대 방향(record 단위 폐기)만 적어 두었다. 이것이 유일한 BLOCKER 다.
- **시간 보장이 비어 있다**(C-02). 공개 취소·동의 철회가 방문자에게 반영되기까지의 **계약상 상한이 없다.** 이 계약이 `404`×2 규칙을 만든 이유가 바로 그 보호였으므로, 빈칸은 계약의 목적과 직접 충돌한다.
- **문서 간 증거 사슬이 한 군데 끊겨 있다**(C-09, C-14). freeze 는 owner 결정과 consumer 회신을 근거로 선언됐는데, 근거로 인용된 `04` 는 그 결정도 회신 반영도 담고 있지 않다.
- 제안 등급: **C-01 을 해소하기 전에는 "consumer 가 계약에 기대어 구현을 시작해도 된다"고 판정하지 않는다.** C-02·C-03·C-04·C-05·C-06·C-07·C-08 은 구현 착수 전 문구 수정 대상이다. 전부 **문구 변경**이고 schema·필드·enum 을 건드리지 않으므로, CH-R10/CH-R11 과 같은 방식(양쪽 합의 후 `02` 반영 → `03` 재파생)으로 처리할 수 있다.

---

## 7. 검증 로그 (이 리뷰가 직접 계산한 것)

1. **CH 원문 기계 대조** — `02` §3.2 의 CH-R11a/b/c 행과 consumer 확인 §13.2 표의 요청 문구를, `**`·backtick·따옴표·공백만 정규화해 비교: **세 건 모두 `EQUAL: true`.** CH-R10 은 `02` VO6 에서 "현재 선언값(…)…facet 을 통째 무시" 구간을 잘라 consumer §12.4 요청문과 비교: **일치.** §24 도 요청대로 "`consumer 한도(scope 150, 잠정)`".
2. **§21 예시 재현** — 문서에 적힌 바이트 수와 해시를 재계산.
   - §21.1 manifest: **273 bytes** (문서 표기와 일치)
   - §21.2 2건 문서: **1,764 bytes**, `version` 제외 + **재귀** key 정렬 + compact 의 sha256 앞 32hex = `6d641b6f8c9e8966551f2aed9a277285` (문서 표기와 일치). 최상위만 정렬하면 `e5154850…`, 정렬하지 않으면 `a5845fa9…` → N-1.
   - §21.3 빈 사이트: **104 bytes**, `31aefd2bb7264c12d3ec4e072e7394c3` (일치)
   - §21.2 예시의 VO1 닫힘(양방향)·id 오름차순·record 순서: **전부 만족**.
3. **실제 emit 산출물 검증** — `…/packages/39c69a40…/site/_integration/portfolio.6346c472….json` (5,292 bytes, 8 records, `category` 4 · `scope` 20 · `tag` 8 — `02` §21.1 의 "8 records · `scope` 20종 · `tag` 8종 · 5,292 bytes" 와 일치):
   - facet 닫힘 양방향 위반 0 · facet 값 id 오름차순 OK · record id 오름차순 OK
   - `id` 패턴·`title` ≤120 · `label` ≤40 · `id` ≤64 · `location` ≤80: 위반 0
   - `detailUrl`/`listingUrl` UR2 형식 위반 0, 비-ASCII URL 0
   - HT7 금지 문자 0, zero-width 0, 전체 문자열 NFC
   - `null` 0, 빈 배열/빈 객체 0, record 당 `category` 정확히 1
   - `version` 재계산 = `6346c472e162ae07b76a4686fce54c51` (선언값과 일치)
   - `area` 8/8 = `pyeong`/`supply`, `pricePerArea` 6/8 (owner 결정과 일치: 공급 기준 그대로 emit, 없으면 필드 생략)
   - manifest 는 274 bytes, `publicOrigin` = `https://interior-demo.boostweb.co.kr` (→ N-4)
4. **consumer JSON 대조** — `web-recon-contract-v0-consumer-confirmation.json` 의 `answers[].verdict` 와 `final` 이 md 와 완전히 일치(R-1…R-9·R-12 ACCEPT, R-10·R-11 ACCEPT_WITH_CHANGE, REJECT 0, DEFER 0, `REQUIRED_CHANGES.contract = [CH-R10, CH-R11a, CH-R11b, CH-R11c]`).

**이 리뷰의 한계.** ① 계약 문서와 그 상호 정합성을 봤고, producer 구현 코드는 §7.3 의 산출물 검증 외에는 읽지 않았다. ② consumer 저장소는 읽기만 했고 코드(F-n 원장)는 검증하지 않았다 — consumer 가 자기 코드에 대해 주장한 사실은 그대로 받아들였다. ③ 실제 고객 데이터는 존재하지 않으므로, 한도·`scope` 세분도·다국어 관련 결함은 여전히 synthetic fixture 기준의 추정이다(1차 리뷰가 남긴 한계와 동일).
