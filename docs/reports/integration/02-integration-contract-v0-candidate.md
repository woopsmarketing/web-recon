# 02 — Integration Contract V0 Candidate (web-recon producer ⇄ first-party data consumer)

- 날짜: 2026-09-21 (독립 리뷰 반영판 — `05` 의 F-01…F-18) · **freeze 2026-09-22**
- 상태: **FROZEN — Integration Contract V0 (`schemaVersion "0.1"`).** 2026-09-21 의 CANDIDATE 가 그대로 계약이 되었다(이름·번호를 바꾸지 않는다). freeze 근거:
  - owner 결정 OD-1 승인, OD-2 = **(a) 사이트별 opt-in, 기본 off** (`04` 결정 기록 2026-09-22).
  - consumer(BoostChat) 확인 2026-09-22 (`/Users/woops/projects/boost-chat/docs/reports/integration/web-recon-contract-v0-consumer-confirmation.md`): **R-1…R-9, R-12 ACCEPT · R-10, R-11 ACCEPT_WITH_CHANGE · REJECT 0 · DEFER 0.** 요청된 문구 변경 4건 **CH-R10**(§11.1 VO6, §24), **CH-R11a · CH-R11b · CH-R11c**(§3.2)을 consumer 원문 그대로 반영했다. 전부 non-breaking 이며 schema·필드·major 는 바뀌지 않았다. CH-R11a("연속"의 의미 확정)는 producer 동의가 필요한 항목이었고, 이 freeze 로 producer 가 **동의**했다.
  - 이 네 건 외의 규칙은 2026-09-21 판과 같다. 구현 상태(emitter, gate, golden output)는 계약이 아니라 `docs/result/first-party-integration-producer/` 에 기록한다.
- consumer 선언값 변경 반영 2026-09-23 (consumer 통보 2026-09-22, VO6 절차 — `/Users/woops/projects/boost-chat/docs/reports/integration/web-recon-consumer-declaration-change-2026-09-22.md`): 확인 주기 **최대** 간격 10분 → **없음(on-demand)** (§3.2, §11.1 VO6). 최소 간격 10분·last-good 최대 수명 72시간은 그대로다. 선언값 변경이므로 계약 버전·필드·enum·`schemaVersion` 은 바뀌지 않는다.
- **이 문서가 규범(normative)이다.** `03-integration-contract-v0-candidate.json` 은 이 문서에서 파생한 machine-readable 판이다. 둘이 다르면 **이 문서가 우선**하고, 차이 자체가 고쳐야 할 결함이다.
- **산문 명확화**(규칙의 빈칸을 메우는 문장)는 이 문서를 고치고 `03` 을 다시 파생한 뒤 consumer 에 통보하는 것으로 반영하며, `schemaVersion` 은 바뀌지 않는다. 필드·enum·의미를 바꾸는 변경은 §14 의 버전 규칙을 따른다. (freeze 검토 2026-09-22, `05` C-10) 이 판에는 freeze 당일의 독립 검토(`docs/result/first-party-integration-producer/05-review-contract.md`)에서 나온 명확화가 들어 있고, 각 문장에 (freeze 검토 2026-09-22, `05` C-nn) 표시가 붙어 있다. 전부 non-breaking 이며 필드·enum·`schemaVersion` 을 바꾸지 않는다.
- 근거: `01-web-recon-producer-review-v0.md` (producer 실제 코드·데이터), `04-boostchat-requirement-disposition.md` (consumer 요구 판정)
- 표기: **MUST / SHOULD / MAY** 는 규범 수준. `P:` = producer 의무, `C:` = consumer 의무.

이 문서는 어느 한쪽의 내부 구현을 설명하지 않는다. producer 의 build/package/template 식별자와 consumer 의 tool·tenant·fetch 구조는 계약에 등장하지 않는다.

---

## 1. Scope

1. 한 사이트가 **자기 origin 에서 정적 JSON 으로** 공개하는 first-party business data 의 위치·형태·의미.
2. V0 의 첫 resource 는 **portfolio** (작업 사례 목록) 하나다.
3. 계약은 **세 층**이다.

| 층 | 다루는 것 | 재사용 범위 |
|---|---|---|
| **Core Integration Contract** (§3, §5, §8, §12–§19) | 사이트 식별, resource 위치, 가용 상태, 버전, URL/origin, 누락 의미, 파생 금지, 서빙, 배포 일관성, 보안 | 모든 resource · 모든 업종 |
| **Portfolio Resource Contract** (§4, §6, §7, §11.1–§11.2) | record 의 `id`/`title`/`detailUrl`, facet 메커니즘, well-known key `category`·`tag` | 사례형 resource 를 가진 모든 업종 |
| **Built-space annex** (§9, §10, §11.3) | `area`, `pricePerArea`, facet key `scope`, 예약 key `propertyType`·`style`, 예산 주장 규칙 | 공간을 다루는 업종(인테리어·건축·부동산). 다른 업종은 이 절을 쓰지 않고 자기 annex 를 갖는다 |

4. 읽기 전용이다. consumer 는 사이트에 아무것도 쓰지 않는다.

## 2. Non-goals

- runtime API, webhook, 인증, CORS, 서버 프로세스, 검색 서비스, DB 조회. **방문자 요청 → producer DB** 경로는 생기지 않는다.
- `resource.search(type=…)` 류의 범용 resource framework, 임의 HTTP fetch, 동적 schema 시스템.
- 검색·정규화·랭킹·추천 이유 생성. 전부 consumer 몫이다. producer 는 **사실(facts)** 만 낸다.
- 필터가 걸린 목록 URL (§24).
- 상담 위젯 embed. **별도 계약**이다(§23.4). 이 데이터 계약에는 위젯 key·origin·CSP 가 없다.
- Site Platform(편집·publish UI·도메인), BoostWeb. 의존성이 아니다.

---

## 3. Core contract

### 3.1 문서 두 종류

| 문서 | 위치 | 성격 |
|---|---|---|
| **Integration manifest** | 고정 경로 `/_integration/manifest.json` | 작다. 사이트 식별 + resource 목록. 배포 간에 URL 이 변하지 않는다 |
| **Resource document** | manifest 의 `resources.<kind>.href` | resource 하나의 전체 내용. 파일명에 version 이 들어 있어 내용이 바뀌면 URL 이 바뀐다 |

- `P: MUST` 두 문서는 사이트 페이지·asset 과 **같은 정적 패키지**의 파일이다(§17).
- `P: MUST` 두 문서는 `site.publicOrigin` 에서 서빙된다.
- 경로가 고정이므로 consumer 는 **origin 하나**만 등록하면 된다(manifest URL = origin + 고정 경로).
- `/_integration/` 는 사이트의 어떤 페이지 경로와도 충돌하지 않는다(페이지 경로의 segment 는 밑줄로 시작하지 않는다).

### 3.2 가용 상태 (availability states)

"manifest 가 `200` 이 아님"은 한 가지 뜻이 아니다. 두 구현자가 다르게 해석하지 않도록 상태를 고정한다.

| 관찰 | 상태 | `C:` 동작 |
|---|---|---|
| `200` + 유효한 manifest + `resources.<kind>` 있음 + document 가 echo 검사(§15) 통과 | **ON** | 새 데이터 적용 |
| `200` + 유효한 manifest, `resources` 에 그 kind **없음** | **CONFIRMED OFF** (그 resource) | 그 resource 의 보유 데이터를 **즉시 버린다** |
| manifest URL 이 **연속 2회** 확인 주기에서 `404` (body 무관) — "연속"의 정의는 아래 CH-R11a | **CONFIRMED OFF** (통합 전체) | 보유 데이터를 **버린다.** 오류가 아니라 "이 사이트는 통합을 끔/내림" |
| manifest `3xx`(HT1 위반), `404` 가 아닌 `4xx`, `5xx`, timeout, 연결 실패, JSON 아님, 모르는 major(§14), echo 불일치, document `404`, **origin 불일치**(§5), **`site.id` 변경**(ID4) — 뒤의 둘은 (freeze 검토 2026-09-22, `05` C-12·C-20) | **TRANSIENT** | 새 데이터를 적용하지 않고 **마지막 성공 데이터를 유지**한다 |

- `C: MUST` 마지막 성공 데이터의 **최대 수명을 둔다.** 값은 consumer 소유다(현재 제시값 72시간). 수명이 지나면 그 사이트의 검색을 중단한다.
- 왜 `404` 가 1회가 아니라 2회인가: 활성화 전환 순간의 1회성 `404` 와 "껐다"를 구분하기 위해서다.
- 왜 `404` 는 last-good 을 유지하지 않는가: 사이트가 통합을 끄거나 동의를 철회했을 때 72시간 동안 계속 추천되는 것을 막기 위해서다.

**"유효한 manifest / 유효한 document" 의 정의 — 위반은 세 수준으로 갈린다** (freeze 검토 2026-09-22, `05` C-01). 위 표의 "유효한"은 다음을 뜻한다. 이 세 수준은 consumer 가 이미 선언한 validator 동작(확인 문서 §15.4 U5 "**record 단위 폐기**", §13.1 행 T "`200` 이지만 무효(모르는 major · origin 불일치 · `site.id` 변경 · 형식 오류) … last-good 유지")과 이 계약 §19 가 같은 것을 말하도록 고정한다.

| 수준 | 위반 | `C:` 동작 |
|---|---|---|
| (a) **문서 수준 불변식** | manifest 가 §5·§7.1 의 필수 필드·형식을 어김 · `site.id` 가 등록된 값과 다름(ID4) · `site.publicOrigin` 이 등록 origin 과 불일치(§5) · 모르는 major(§14) · document 의 `resource` ≠ manifest 의 key(§3.3) · `schemaVersion` 형식 오류 · `records` 가 없거나 배열이 아님 · VO1 닫힘 위반 | `C: MUST` **그 문서를 통째로 거부한다 = TRANSIENT**(문서 전체 거부, last-good 유지). 일부만 잘라 쓰지 않는다. manifest 의 위반이면 manifest 를, resource document 의 위반이면 그 document 를 거부한다 |
| (b) **record 수준 결함** | `id`·`title`·`detailUrl` 이 없음 · 형식 위반 · 길이 상한 초과(§7.2·§7.3) · `detailUrl` 의 UR2 위반 · HT7 금지 문자 · `area`·`pricePerArea` 의 형식 위반(§9·§10) | `C:` **그 record 만** 버린다(§19 의 기존 문장과 같다). 문서의 나머지는 그대로 쓴다 |
| (c) **모르는 값** | 모르는 enum 값(`unit`·`basis`·`perUnit`·`currency`) · 모르는 facet key · 모르는 최상위 필드·record 필드·resource kind | 그 **값만** 모름으로 둔다. record 도 문서도 버리지 않는다(§19, AR6, PR6, VO4) |

consumer 확인(2026-09-22, R-11 ACCEPT_WITH_CHANGE)에서 요청되어 반영한 문구. 셋 다 non-breaking 이다. CH-R11a 는 "연속"의 **의미를 정하는** 변경으로 producer 가 동의했다.

| # | 규칙 |
|---|---|
| **CH-R11a** | `404` 카운터는 **manifest HTTP `200` 관찰**(유효성 무관)에서만 0 으로 돌아간다. `404` 도 `200` 도 아닌 관찰(3xx·다른 4xx·5xx·timeout·연결 실패)은 카운터를 올리지도 내리지도 않는다. 두 `404` 는 서로 다른 확인 주기여야 한다 |
| **CH-R11b** | manifest 의 3xx(HT1 위반)와 404 를 뺀 4xx(401/403/410/429 …)는 TRANSIENT 다. OFF 판정에는 404 만 쓴다. **`P: MUST` 통합을 끈 사이트의 manifest 경로는 `404` 로 응답한다(`403` 이 아니다)** — 저장소가 없는 객체에 403 을 주는 serving 구성에서는 "껐다"가 영영 감지되지 않고 72시간 만료로만 드러나기 때문이다 |
| **CH-R11c** | 확인 주기 최소 간격은 consumer 선언값이다(현재 10분). 최대 수명(72시간)과 함께 VO6 형식으로 선언한다 |

- 첫 `404` 에서 검색을 일시 중단하는 것(consumer 내부 상태 SUSPECT)은 consumer 내부 규칙이다. 이 계약은 그것을 요구하지도 금지하지도 않는다.
- **확인 주기의 최대 간격(= 전파 상한)도 같은 VO6 형식의 consumer 선언값이다** (freeze 검토 2026-09-22, `05` C-02). 현재 선언값은 **없음 — on-demand** 다 (consumer 선언 변경 2026-09-22, 반영 2026-09-23. freeze 시점 선언값 10분(consumer 확인 문서 §13.1 "갱신"의 in-process timer)을 대체한다 — consumer 가 그 timer 를 폐기했다). consumer 는 백그라운드 폴링·cron 을 두지 않고 다음 때에만 확인한다: ① 운영자 수동 refresh ② (후속) producer 의 publish·unpublish 직후 트리거 ③ 방문자 사용 시 사본 나이가 24시간을 넘으면 lazy refresh (24시간 신선도도 consumer 선언값이다 — 24시간 이내 사본은 재확인 없이 쓴다). 그러므로 ②가 생기기 전의 실효 전파 상한은 last-good 최대 수명(72시간)이다. 새 의무가 아니라 **consumer 가 선언한 동작의 기록**이다. §17 PC5·PC7 의 "다음 성공 주기"는 "다음 성공한 확인"으로, PC7 의 "2주기"는 "서로 다른 두 번의 확인"으로 읽고, PC5 의 "최악의 경우"에는 연속 TRANSIENT 뿐 아니라 확인이 한 번도 일어나지 않는 경우도 들어간다(둘 다 last-good 최대 수명에서 끝난다). 이 값을 바꾸는 절차는 VO6 의 선언값 변경 절차와 같다(consumer 가 바꾸고 producer 에 통보한다. 계약 버전은 바뀌지 않는다).

### 3.3 Resource document 공통 envelope

| 필드 | 수준 | 의미 |
|---|---|---|
| `schemaVersion` | MUST | **그 resource 계약**의 버전. manifest 의 `schemaVersion` 과 독립 |
| `resource` | MUST | resource kind 이름. manifest 의 key 와 같은 값(`"portfolio"`) |
| `version` | MUST | manifest `resources.<kind>.version` 과 **같은 값** (§15) |

---

## 4. Portfolio resource contract

portfolio = 사이트가 공개한 작업 사례(record)의 목록. record 는 **공개 상세 페이지를 정확히 하나** 갖는다.

- `P: MUST` **공개되어 같은 패키지에 상세 페이지가 있는 record 만** 담는다. 비공개·초안·아직 공개 시각이 되지 않은 record 는 없다.
- `P: MUST` 사이트가 record 마다 하나의 공개 상세 페이지를 제공하지 않으면 이 resource 를 **제공하지 않는다**(manifest 의 `resources` 에 넣지 않는다).
- `P: MUST` resource document 는 canonical site data 의 **결정적 projection** 이다. 사람이 따로 관리하지 않는다.
- `P: MUST` projection 은 **명시적 allowlist** 다. 원본 record 를 통째로 복사하지 않는다. §7 에 없는 필드는 나가지 않는다.
- `P: MUST` **통합을 켠 사이트의 공개 빌드에서 emit 이 불가능하면(https origin 없음, §16 HT7 위반, 상세 페이지 모호) 빌드가 실패한다.** 조용히 건너뛰지 않는다 — 조용한 누락은 §3.2 에서 "껐다"로 읽힌다.
- 통합을 켜지 않은 사이트, 그리고 비공개 확인용(preview) 빌드는 `/_integration/` 자체가 없다. 이것은 실패가 아니다.

---

## 5. Manifest schema

```jsonc
{
  "schemaVersion": "0.1",                 // MUST  core 계약 버전 (§14)
  "site": {                               // MUST
    "id": "boost-interior-demo",          // MUST  사이트의 불변 식별자 (§13)
    "publicOrigin": "https://…",          // MUST  https origin, path 없음
    "locale": "ko-KR"                     // MUST  BCP 47. label·title 의 언어
  },
  "resources": {                          // MUST  비어 있어도 된다
    "portfolio": {                        // key = resource kind
      "href": "/_integration/portfolio.<version>.json",   // MUST  (§12)
      "version": "<version>"              // MUST  (§15)
    }
  }
}
```

- `C: MUST` 모르는 resource kind, 모르는 최상위 필드는 무시한다.
- `C: MUST` `site.publicOrigin` 이 **자신이 등록해 둔 origin 과 다르면 manifest 를 거부**한다(TRANSIENT 로 취급). manifest 안의 값으로 등록 origin 을 덮어쓰지 않는다.
- 이 비교는 **WHATWG URL 의 `origin` 직렬화 기준**이다(문자열을 그대로 비교하지 않는다): host 는 소문자, 기본 port `443` 은 생략, IDN 은 ASCII/punycode 형태. 따라서 `https://Example.com` · `https://example.com:443` 은 `https://example.com` 과 **같은 origin** 이고, `https://한글.kr` 은 `https://xn--bj0bj06e.kr` 과 같은 origin 이다. `P: SHOULD` producer 는 `site.publicOrigin` 을 그 **정규 직렬화 형태**로 낸다. (freeze 검토 2026-09-22, `05` C-04 — consumer 확인 §14 R12-3 의 "비필수 제안: producer 가 ASCII 직렬화 형태로 내면(SHOULD) 더 좋다" 를 채택했다. 이 producer 의 emitter validator 는 `new URL(origin).origin === origin` 동일성을 이미 강제한다.)
- `site.publicOrigin` 의 형식은 §7.1 이 정한다: V0 에서는 **명시적 port 를 쓰지 않는다**(기본 443 만).
- manifest 에 **넣지 않는 것**: vocabulary, 단위 defaults, 목록 URL, record 수, 생성 시각, build/package/template 식별자, operation 목록, JSON Schema.

## 6. Index schema (portfolio resource document)

```jsonc
{
  "schemaVersion": "0.1",                 // MUST  portfolio resource 계약 버전
  "resource": "portfolio",                // MUST
  "version": "<version>",                 // MUST  manifest 와 같은 값
  "listingUrl": "/portfolio",             // SHOULD 목록 페이지
  "facets": {                             // MAY   닫힌 vocabulary
    "<facetKey>": { "values": [ { "id": "…", "label": "…" } ] }
  },
  "records": [                            // MUST  0개 이상
    {
      "id": "…",                          // MUST
      "title": "…",                       // MUST
      "detailUrl": "/portfolio/…",        // MUST
      "publishedAt": "2026-08-28T09:00:00+09:00",          // MAY
      "location": "…",                    // MAY   표시 전용
      "area": { "value": 34, "unit": "pyeong", "basis": "supply" },                  // MAY (§9)
      "pricePerArea": { "amount": 2900000, "currency": "KRW", "perUnit": "pyeong" }, // MAY (§10)
      "facets": { "<facetKey>": ["<valueId>", …] }          // MAY (§11)
    }
  ]
}
```

### 6.1 결정성 규칙 (두 구현이 같은 바이트를 내기 위한 규칙)

| 대상 | 규칙 |
|---|---|
| `records` 순서 | `id` 의 Unicode code point 오름차순 |
| `facets` 맵의 key 순서 | key 문자열의 Unicode code point 오름차순 (freeze 검토 2026-09-22, `05` C-17 — INV-1 의 "byte 단위로 같은 문서"에 남아 있던 자유도를 없앤다) |
| `facets.<key>.values` 순서 | `id` 의 Unicode code point 오름차순 |
| record 의 `facets.<key>` 배열 | **원본에 입력된 순서 그대로.** 같은 값이 두 번 있으면 **첫 번째만** 남긴다 |
| 문자열 | 원본 그대로(정규화·trim·대소문자 변환 없음). `C:` 는 code point 단위로 비교한다 |
| 수 | 원본 그대로(§9 AR3, §10 PR1) |
| 직렬화 | producer 는 UTF-8(BOM 없음), 공백 없는 compact JSON, 위 예시의 key 순서로 쓴다. **`C:` 는 바이트 배치에 의존하지 않는다** — `version`(§15)은 직렬화와 무관하게 내용에서 나온다 |

## 7. Required / optional fields

### 7.1 Manifest

| 필드 | 수준 | 타입 | 비고 |
|---|---|---|---|
| `schemaVersion` | MUST | `"<major>.<minor>"` | |
| `site` | MUST | object | |
| `site.id` | MUST | string, `^[a-z0-9]+(?:-[a-z0-9]+)*$`, ≤ 64 | consumer 는 opaque 로 취급 |
| `site.publicOrigin` | MUST | `https://host` | path·query·credentials 없음. **V0 에서는 명시적 port 를 쓰지 않는다(기본 443 만)** — consumer 의 등록 규칙 R12-1(명시적 port 불가)과 일치시킨 것이다. 명시적 port 가 필요한 배포는 V0 밖이다 (freeze 검토 2026-09-22, `05` C-05). 비교 기준은 §5 |
| `site.locale` | MUST | BCP 47 | |
| `resources` | MUST | object (kind → entry) | `{}` 허용 |
| `resources.<kind>.href` | MUST | §12 의 URL 형식 | |
| `resources.<kind>.version` | MUST | `^[A-Za-z0-9._-]{1,80}$` | |

### 7.2 Portfolio resource document

| 필드 | 수준 | 타입 · 제약 |
|---|---|---|
| `schemaVersion`, `resource`, `version` | MUST | §3.3 |
| `listingUrl` | SHOULD | §12 의 URL 형식. record 가 0개면 생략(목록 페이지가 없다) |
| `facets.<key>.values[]` | MAY | `{ id, label }`. `id` 1–64자, `label` 1–40자, facet 안에서 `id` 유일. **record 가 하나 이상 참조하는 값만** 싣는다. 값이 0개인 facet 은 선언하지 않는다 |
| `records[]` | MUST | 배열. 빈 배열 = "공개된 사례가 없음이 확인됨" |

### 7.3 Portfolio record

| 필드 | 수준 | 타입 · 제약 | 쓰임 |
|---|---|---|---|
| `id` | MUST | `^[a-z0-9]+(?:-[a-z0-9]+)*$`, ≤ 64 | identity (§13) |
| `title` | MUST | string 1–120자 | 표시. **자유 텍스트** (§18 SE4) |
| `detailUrl` | MUST | §12 의 URL 형식 | 표시·링크 |
| `publishedAt` | MAY | ISO-8601 instant, offset 포함, 입력된 그대로 | 동점 정렬 |
| `location` | MAY | string 1–80자 | 표시 전용. 매칭 키가 아니다 |
| `area` | MAY | §9 (built-space annex) | 매칭 |
| `pricePerArea` | MAY | §10 (built-space annex) | 매칭(제한적) |
| `facets.<key>` | MAY | `facets.<key>.values[].id` 의 배열, 1개 이상 (§6.1) | 매칭 |

**V0 에 없는 것**: `summary`, `body`, gallery, 고객 인용, `slug`, `status`, 자유 텍스트 keyword, `cover`, 준공연도, 공사 기간, 총 공사비. 이유와 재검토 조건은 §24.

---

## 8. Missing-data semantics · 파생 금지 (core)

| # | 규칙 |
|---|---|
| MD1 | **생략 = 모름(unknown).** producer 는 값이 없으면 필드를 **생략**한다. `null` 을 쓰지 않는다. `C:` `null` 을 만나면 생략과 같게 취급한다 |
| MD2 | `0`, `""`, `"미정"`, `"unknown"` 같은 placeholder 로 채우지 않는다 |
| MD3 | 빈 배열 `[]` = "없음이 **확인됨**". 생략과 다르다. V0 producer 는 `records` 외에는 `[]` 을 내지 않는다(원본에 "확인된 없음"을 표현할 필드가 없다) |
| MD4 | 복합 값은 아는 부분만 채운다. 모르는 하위 필드는 생략한다 |
| MD5 | `C: MUST` 없는 값은 **불일치가 아니다.** 추정·보간·기본값 가정을 하지 않는다 |
| MD6 | 추정치·범위·"약 ○○" 을 확정값 필드에 넣지 않는다 |
| **ND1** | **파생 금지(core).** `P: MUST NOT` 원본 필드에 없는 값을 추론·추정·환산·합성해서 내지 않는다. 원본에 사실이 없으면 생략이다 |

ND1 의 built-space 사례(annex): title/본문에서 유형·스타일 추론, 없는 가격 추정, 단가 × 면적으로 총액 생성, 공급↔전용 환산, 단위 환산, 가구 형태 추론, 근거 없는 style 값 생성, 태그 보정 — 전부 금지.

---

## 9. Area semantics (built-space annex)

```jsonc
"area": { "value": 34, "unit": "pyeong", "basis": "supply" }
```

| # | 규칙 |
|---|---|
| AR1 | `value` 양수, 소수 2자리 이하. `unit` ∈ `m2` \| `sqft` \| `pyeong`. `area` 가 있으면 `unit` 은 MUST — **단위 없는 면적은 존재하지 않는다** |
| AR2 | `basis` ∈ `supply`(공급면적) \| `exclusive`(전용면적). **생략 = 모름.** `"unknown"` 문자열은 나가지 않는다 |
| AR3 | `P: MUST` 입력된 `value`·`unit` 을 **그대로** 낸다. 환산하지 않는다. 원본의 basis 가 없거나 명시적으로 "모름"으로 저장돼 있으면 **둘 다 `basis` 생략**으로 낸다(같은 뜻이다) |
| AR4 | 단위 환산은 consumer 가 고정 상수로 한다: **1 평 = 400/121 ㎡**, 1 sq ft = 0.09290304 ㎡ (사이트 자체 필터가 쓰는 것과 같은 상수) |
| AR5 | **공급 ↔ 전용은 어느 쪽도 환산하지 않는다.** 기준이 서로 다르면 비교하지 않고, 한쪽이 모름이면 비교 신뢰도를 낮춘다 |
| AR6 | `C:` 모르는 `unit` 또는 `basis` 값을 만나면 그 면적(또는 그 기준)은 **모름**으로 취급한다 |

**수(number)의 직렬화** (freeze 검토 2026-09-22, `05` C-21): `area.value` 와 `pricePerArea.amount`(§10)는 **JSON number 로, 지수 표기 없이, 저장된 값 그대로** 낸다(JavaScript `JSON.stringify` 의 수 직렬화). §6.1·AR3·PR1 의 "**원본 그대로**"와 INV-10 은 **수치 동일성**을 뜻한다(표기 동일성이 아니다 — 저장된 `34.50` 은 `34.5` 로 나가고 그것이 규칙 위반이 아니다).

## 10. Price semantics (built-space annex)

```jsonc
"pricePerArea": { "amount": 2900000, "currency": "KRW", "perUnit": "pyeong" }
```

| # | 규칙 |
|---|---|
| PR1 | `pricePerArea` = **그 사례의 면적당 가격**으로 운영자가 입력한 값. `amount` = `currency` 의 **주 단위** 수(KRW 는 원), **양수**(`amount > 0` — freeze 검토 2026-09-22, `05` C-13: `03` 이 이미 담고 있던 제약을 규범에 맞춰 적는다. `0` 은 MD2 의 placeholder 금지에도 걸린다), 소수 2자리 이하, 입력된 그대로. 수의 직렬화는 §9 의 같은 규칙을 따른다(`05` C-21). `currency` = ISO 4217 코드(producer 는 형식 `^[A-Z]{3}$` 만 기계 검증한다 — §20.1). `perUnit` = §9 의 단위 집합 |
| PR2 | V0 에는 가격의 **면적 기준(basis)** 이 없다 = 모름. 같은 record 의 `area.basis` 에서 추론하지 않는다 |
| PR3 | V0 에는 **포함 범위**(VAT·철거·가구·가전·확장)가 없다 = 모든 record 에서 모름. 이 값은 **거친 비교 지표**이지 견적이 아니다 |
| PR4 | **category 가 다르면 같은 축이 아니다.** `C: MUST` 가격으로 비교·정렬·"가깝다"를 말할 때는 **같은 `category` 값을 가진 record 끼리만** 한다. `category` facet 이 없거나 무시된 사이트에서는 가격을 record 의 사실로 **표시**할 수는 있지만 가격 기준 비교·정렬은 하지 않는다 |
| PR5 | V0 에는 **총 공사비 필드가 없다.** `P: MUST NOT` `amount × area.value` 를 어떤 필드로도 내지 않는다. 이름 `totalCost` 는 예약 |
| PR6 | 통화 환산은 없다. `C:` `currency` 가 다르거나 모르는 `perUnit`/`currency` 값이면 비교하지 않는다 |

### 10.1 Budget claims — 방문자 예산과 사례 가격을 섞지 않는다

아래 네 이름은 **설명용**이다(양쪽 코드의 이름을 정하지 않는다). 규범은 BU1–BU4 의 의미다.

| 설명용 이름 | 출처 | artifact 에 존재? |
|---|---|---|
| visitorTotalBudget | 방문자 발화 ("2천만원") | 없음 |
| derivedBudgetPerArea | consumer 계산 (예산 ÷ 방문자 면적) | 없음 |
| projectPricePerArea | record 의 `pricePerArea` | **있음** (있는 record 만) |
| projectTotalCost | — | **V0 에 없음** |

| # | 규칙 |
|---|---|
| BU1 | `C: MUST` 방문자 예산에서 계산한 값을 **사례의 가격처럼 표시하지 않는다.** "방문자 기준값"으로만 표현한다 |
| BU2 | `C: MUST` `pricePerArea` 가 없는 record 를 예산 조건에 **부합한다고도, 부합하지 않는다고도** 표시하지 않는다. 그 record 에 대해 예산 조건은 **평가 불가**다 |
| BU3 | `C: MUST NOT` V0 데이터로 "○○원에 맞는 사례" 같은 **총액 적합성**을 주장하지 않는다(근거가 되는 총액이 없다). 허용되는 가장 강한 주장은 "**같은 category 안에서** 평당가 기준으로 가까운 사례"다(PR4) |
| BU4 | record 별 예산 근거는 셋 중 하나다: **단가 있음**(같은 category 안에서 평당가 비교 가능) · **없음**(가격 없음 → 평가 불가) · **총액 있음**(V0 에는 발생하지 않는다) |

---

## 11. Vocabulary semantics (facets)

### 11.1 Facet = 닫힌 값 목록 (portfolio resource)

```jsonc
"facets": {
  "category": { "values": [ { "id": "full-remodel", "label": "전체 리모델링" } ] },
  "tag":      { "values": [ { "id": "화이트", "label": "화이트" } ] }
},
"records": [ { "…": "…", "facets": { "category": ["full-remodel"], "tag": ["화이트", "미니멀"] } } ]
```

| # | 규칙 |
|---|---|
| VO1 | record 의 `facets.<key>` 에 나오는 모든 id 는 같은 문서의 `facets.<key>.values` 에 선언되어 있다(닫힘). 선언된 모든 값은 하나 이상의 record 가 참조한다 |
| VO2 | `id` 는 opaque 다. **같은 문서 안에서만** 의미가 있다. consumer 는 id 의 철자에서 뜻을 읽지 않는다. 사이트마다 id 집합이 다르다. id 는 ASCII 가 아닐 수 있다 |
| VO3 | `label` 은 사람이 읽는 표시 이름이다. **동의어 사전이 아니다** |
| VO4 | facet key 는 `^[a-z][a-zA-Z0-9]{0,31}$`. `C: MUST` 모르는 facet key 는 무시한다 |
| VO5 | 어떤 facet 이 문서에 없으면 그 사이트에서 그 기준은 **검색 조건이 될 수 없다** |
| VO6 | consumer 는 자기 한도(facet 당 값 수, record 수, 문서 크기)를 **선언**할 수 있다. 현재 선언값(**잠정** — consumer 측정 후 확정·통보): manifest 64 KiB · 문서 1 MiB · record 1,000 · facet key 별 `category` 50 · `scope` 150 · `tag` 150, consumer 가 모르는 key 는 무시, 합산 주입 예산을 넘으면 consumer 가 정한 순서로 facet 을 통째 무시 (**CH-R10**, consumer 확인 2026-09-22 R-10 ACCEPT_WITH_CHANGE). 확인 주기 최소 간격(현재 10분)과 **최대 간격**(= 전파 상한. 현재 선언: **on-demand** — 운영자 수동 refresh / publish 트리거(후속) / 방문자 사용 시 사본 >24h lazy refresh, 실효 상한 72시간 — §3.2, freeze 검토 2026-09-22 `05` C-02, consumer 선언 변경 2026-09-22), last-good 최대 수명(72시간, §3.2)도 같은 형식의 consumer 선언값이다(**CH-R11c**). 선언값을 바꾸는 절차: consumer 가 선언값을 바꾸고 producer 에 통보한다(빌드 경고 문턱). 계약 버전은 바뀌지 않는다. `P: MUST` 빌드가 이 한도를 넘는 사이트에 **경고**한다(빌드 실패는 아니다 — freeze 검토 2026-09-22, `05` C-03 에서 `P: SHOULD` 를 승격). `C: MUST` 한도를 넘는 facet 은 **통째로** 무시한다 — 일부만 잘라 쓰면 나머지 record 가 조용히 검색 불가가 된다. producer 는 값을 잘라 내지 않는다. `C: MUST` **문서 크기·record 수·manifest 크기 한도**를 넘으면 그 문서를(manifest 의 한도면 manifest 를) **통째로 거부한다 = TRANSIENT**(§3.2), 잘라 쓰지 않는다 — consumer 가 이미 선언한 동작의 기록이다(확인 문서 §12.3 L1 "초과 → `too_large` → TRANSIENT", "record 1,000 초과 → document 전체 거부 = TRANSIENT; 잘라 쓰지 않음", §14 R12-5 "`maxBytes` 는 manifest 64 KiB, document 1 MiB"). facet 한도 초과만 그 facet 하나를 무시하는 것이고, 나머지 한도는 문서 단위다 (freeze 검토 2026-09-22, `05` C-03) |

### 11.2 누가 무엇을 소유하는가

| 소유 | 내용 |
|---|---|
| **Producer** | 실제로 쓸 수 있는 값의 목록(id + label). 내부 필드의 어느 부분이 어느 facet 인지는 producer 가 결정한다 |
| **Consumer** | 방문자 언어 → 그 목록의 id 로의 매핑 전부. 동의어·상하위·복합어 처리 포함 ("화이트톤"·"하얀 느낌" → `화이트`, "깔끔한" → `미니멀`, "욕실" → `욕실`+`공용 욕실`+`안방 욕실`) |
| **Matcher** | id == id 비교만 |

양쪽이 같은 동의어 사전을 복제하지 않는다. producer 는 동의어를 내지 않는다.

### 11.3 Well-known facet keys

| key | 층 | 의미 | record 당 | 완전성 |
|---|---|---|---|---|
| `category` | portfolio | 사이트 taxonomy 상의 **주 분류** | `P: MUST` **정확히 1개**(`facets.category` 배열의 길이 = 1 — freeze 검토 2026-09-22, `05` C-08. `C: MUST` 인 PR4·BU3 이 이 전제 위에서만 뜻이 정해진다) | 닫힘 |
| `tag` | portfolio | 사이트가 붙인 **서술 태그**. 종류(색·스타일·기능·소재)를 구분하지 않는다 | 0개 이상 (없으면 **key 를 생략**한다) | **열림.** 태그가 없다고 그 속성이 없는 것이 아니다 |
| `scope` | built-space annex | 작업에 **포함된 공간/작업 영역**. 사이트가 쓴 말 그대로 | 0개 이상 (없으면 **key 를 생략**한다) | **입력된 세분도에서 닫힘**(아래) |

"record 당" 칸을 읽는 법 (freeze 검토 2026-09-22, `05` C-15·C-16): 이 칸은 **한 record 가 그 facet 에 몇 개의 값을 갖는가**를 말한다. `category` 는 모든 record 에 정확히 1개이고, `tag`·`scope` 는 **없어도 된다 — 없으면 그 key 자체를 생략한다.** 빈 배열 `[]` 은 내지 않는다(MD3·§7.2·INV-9). record 에 그 key 가 **있으면** 배열에는 값이 **1개 이상** 있다(§7.3 의 일반 규칙과 같다).

`scope` 의 완전성: record 에 `scope` 가 있으면 그것이 그 record 의 포함 범위 목록 전체다. 그래서 "~만" 질의에 부분집합 비교(`record.scope ⊆ 선택된 값`)를 쓸 수 있다. **그러나 `C: MUST NOT` 세분도를 넘어 포함·제외를 추론하지 않는다.** `욕실` 이 있는 record 가 `안방 욕실` 을 포함하는지/제외하는지는 데이터가 말하지 않는다. `주방·팬트리` 같은 복합 값은 하나의 opaque 값이다.

예약(원본에 구조화된 사실이 생기기 전에는 내보내지 않는다): `propertyType`, `style`.

`tag` 를 `style` 이라고 부르지 않는 이유: 실제 값에 "간접조명", "수납 특화", "우드 포인트" 가 섞여 있다. 전부를 style 로 내보내면 거짓 분류다.

---

## 12. URL ownership (core)

| # | 규칙 |
|---|---|
| UR1 | 사이트의 URL 구조와 query encoding 은 **전적으로 producer 소유**다 |
| UR2 | `P: MUST` 계약 문서 안의 모든 URL 은 **path 만 있는 root-relative 참조**다: `/` 로 시작, `//` 로 시작하지 않음, scheme·host 없음, **query·fragment 없음**, `\` 없음, 제어문자 없음. V0 producer 는 절대 URL 을 내지 않는다. **path 는 이미 percent-encoded 된 ASCII 형태다** (freeze 검토 2026-09-22, `05` C-07): RFC 3986 의 `pchar` 와 `/` 만 쓴다(`A-Z a-z 0-9 - . _ ~ ! $ & ' ( ) * + , ; = : @ %` 와 `/`; `%` 는 반드시 두 hex 자리와 함께 온다), 공백 없음, 비-ASCII 없음. producer 는 slug 를 **그대로** 쓰되 slug 가 이 집합을 벗어나면 percent-encode 해서 낸다(이 플랫폼의 slug 는 schema 상 ASCII 다) |
| UR3 | `C: MUST` URL 을 **등록된 origin**(= `site.publicOrigin`, §5)에 대해 해석하고, 해석 결과가 그 origin 을 벗어나지 않는지 확인하고, **변형 없이** 쓴다. path·query·fragment 를 조립하거나 덧붙이지 않는다. trailing slash 를 붙이지 않는다. UR2 가 path 를 이미 ASCII percent-encoded 형태로 고정하므로, **"변형 없이"는 그 ASCII 문자열을 byte 단위 그대로 쓴다는 뜻**이고, 표준 URL 파서로 해석해도 문자열은 바뀌지 않는다(이중 인코딩이 생기지 않는다) (freeze 검토 2026-09-22, `05` C-07) |
| UR4 | `P: MUST NOT` tracking parameter 를 붙이지 않는다(UR2 가 이미 막는다) |
| UR5 | URL 은 identity 가 아니다. 주소(slug)가 바뀌면 `detailUrl` 이 바뀌고 `id` 는 그대로다. 옛 URL 의 redirect 는 제공되지 않는다 |
| UR6 | producer 가 URL 구조를 바꾸면 **문서를 다시 emit 하는 것만으로** 충분해야 한다 |

## 13. Identity (core)

| # | 규칙 |
|---|---|
| ID1 | record 의 canonical identity = **(`site.id`, resource kind, `record.id`)**. `record.id` 는 **site-local** 이다 |
| ID2 | `record.id` 는 제목·주소·URL·분류·템플릿이 바뀌어도, 재빌드해도 유지된다 |
| ID3 | `record.id` 는 resource 안에서 유일하다. 삭제된 record 의 id 를 재사용하지 않는다 |
| ID4 | `site.id` 는 도메인이 바뀌어도 유지된다. **결정:** producer 의 사이트 식별자를 그대로 계약의 `site.id` 로 공개한다(사람이 읽을 수 있는 값이다). 통합을 켠 뒤에는 바꾸지 않는다 |
| ID5 | global opaque id 는 V0 에 없다 |

ID2–ID4 가 어떻게 보장되는지는 §20.1.

## 14. schemaVersion (core)

| # | 규칙 |
|---|---|
| SV1 | `"<major>.<minor>"` 문자열. manifest 와 각 resource document 가 **각자** 갖는다(서로 독립). V0 = `"0.1"` |
| SV2 | 필드 제거·의미 변경·타입 변경 = **major**. 필드 추가·facet key 추가·resource kind 추가·**enum 값 추가** = **minor** (그래서 consumer 는 모르는 enum 값을 견뎌야 한다 — §19) |
| SV3 | `C:` 모르는 major 는 TRANSIENT 로 취급한다(§3.2). 모르는 minor·모르는 필드는 무시한다. **major = `schemaVersion` 문자열의 `.` 앞 정수**이고, "모르는 major" = consumer 가 지원하는 major 집합(V0 = `{0}`)에 없는 값이다. 판정은 **그 값을 가진 문서 단위**다(SV1 이 말하듯 manifest 와 각 resource document 는 각자 major 를 갖는다): manifest 의 major 를 모르면 그 사이트가 TRANSIENT 이고, 어떤 resource document 의 major 만 모르면 **그 resource 만** 쓸 수 없다(다른 resource 는 그대로다). (freeze 검토 2026-09-22, `05` C-18) |
| SV4 | 사이트는 각자 다시 빌드되고, 이전 패키지로 되돌아갈 수도 있다. 따라서 major 전환은 하루에 끝나지 않는다. `P:` major 를 올리기 전에 알린다. `C: MUST` **등록된 사이트가 아직 서빙 중인 모든 major 를 지원**한다 (절차 규칙 — 기계 검증 대상이 아니다) |
| SV5 | 이 버전은 producer 내부 content schema 버전과 **다른 것**이다 |

## 15. Resource version (core)

| # | 규칙 |
|---|---|
| RV1 | `version` 은 resource document 의 **내용**(`version` 필드 자신을 뺀 전부)이 바뀌면 **반드시** 바뀌는 opaque 문자열이다. `^[A-Za-z0-9._-]{1,80}$` |
| RV2 | 내용이 같으면 `version` 도 **같다.** 빌드 시각·빌드 환경·템플릿 버전, 그리고 **projection 에 들어가지 않는 site data**(본문, 사진, 디자인 설정 등)의 변경만으로는 바뀌지 않는다 |
| RV3 | resource document 는 최상위 `version` 에 manifest 와 **같은 값**을 echo 한다. `C:` 둘이 다르면 TRANSIENT(§3.2) |
| RV4 | `version` 은 무결성 hash 가 아니다. 목적은 변경 감지 · 짝 확인 · cache 무효화다 |
| RV5 | resource document 의 파일명은 `version` 을 포함한다. manifest 파일명은 포함하지 않는다 |

> 참고(비규범): producer 는 `version` 을 뺀 문서의 canonical JSON(key 정렬) sha256 앞 32 hex 를 쓴다. consumer 는 이 방법에 의존하지 않는다.

---

## 16. HTTP serving requirements (core)

| # | 요구 | 누가 보장 | 현재 상태 |
|---|---|---|---|
| HT1 | `GET https://<publicOrigin>/_integration/manifest.json` → **직접 `200`**, redirect 없음 | serving runtime | 코드·로컬 검증. **live 미검증** |
| HT2 | `Content-Type: application/json` | 배포 단계가 파일별로 기록, runtime 이 그대로 반환 | 코드 확인 |
| HT3 | manifest 는 `Cache-Control: max-age ≤ 60` 또는 `no-cache` | 배포 단계 | 코드 확인 (`public, max-age=0, must-revalidate`) |
| HT4 | resource document 의 cache 정책은 자유(파일명이 내용에 묶여 있다) | — | — |
| HT5 | `Accept-Encoding` 이 없는 요청에는 identity(비압축) body | serving runtime + CDN | **live 배포 전까지 UNKNOWN** |
| HT6 | 인증·cookie·CORS 불필요(consumer 는 서버에서 읽는다) | — | 코드 확인 |
| HT7 | UTF-8. 모든 문자열에 **금지 문자 없음**: U+0000–U+001F, U+007F–U+009F, U+2028, U+2029, 방향 제어 U+202A–U+202E · U+2066–U+2069. 위반 시 **빌드 실패**(§4) | producer emitter | **새 gate 필요**(현 content 검증은 길이만 본다) |
| HT8 | `http→https`, `www↔apex`, trailing slash 는 **계약 밖**이다. consumer 는 `site.publicOrigin` 과 같은 **canonical origin 하나만** 등록한다. 별칭 host 에서 받은 manifest 는 §5 의 origin 검사에서 거부된다. trailing slash 가 붙은 경로는 `404` 다 | — | 코드 확인 |
| HT9 | **통합이 없거나 꺼진 패키지에서 `/_integration/manifest.json`(및 `/_integration/*`)은 `404` 로 응답한다** — `403` 도 `3xx` 도 아니다. §3.2 CH-R11b 의 `P: MUST` 를 서빙 요구표에 옮겨 적은 것이다 (freeze 검토 2026-09-22, `05` C-06) | serving runtime + 저장소 구성 | 코드 확인 |

- HT7 참고 (freeze 검토 2026-09-22, `05` C-19): producer 는 **NFC 정규화도, Default_Ignorable 문자 제거도 하지 않는다**(문자열은 §6.1 대로 입력 그대로 나간다). consumer 는 색인·매칭 시 자기 정규화 함수를 쓴다(consumer 확인 R-3). 이 계약은 producer 에게 NFC 를 요구하지 않는다 — 요구하면 "입력 그대로"와 충돌하기 때문이다. (참고: 현재 emit 산출물은 전부 NFC 다.)

계약은 **관찰 가능한 동작**만 요구한다. 저장소·Worker·활성화 장치 같은 구현 수단은 계약이 아니다.

## 17. Publication consistency (core)

| # | 규칙 |
|---|---|
| PC1 | manifest · resource document · 상세 페이지 · asset 은 **같은 빌드에서 나온 하나의 불변 패키지**에 들어 있다 |
| PC2 | 패키지는 전부 올라가고 검증된 뒤에 **한 번의 원자적 활성화(atomic activation)** 로 서빙된다. 통합 데이터의 활성화 경계 = 사이트의 활성화 경계. 별도 sync 가 없다 |
| PC3 | 따라서 "새 manifest 인데 document 가 아직 없음", "document 가 가리키는 상세 페이지가 아직 없음" 은 **구조적으로 발생하지 않는다** |
| PC4 | 남는 경우는 하나다: consumer 의 두 요청 사이에 활성화가 바뀌는 것. 파일명에 `version` 이 들어 있으므로 결과는 **일치하는 짝** 아니면 **`404`**(TRANSIENT)다. RV3 의 echo 검사가 두 번째 방어선이다 |
| PC5 | 공개 취소·주소 변경은 **같은 빌드**에서 document 에 반영된다. consumer 에 전파되는 시점은 **다음 성공한 확인 주기**다. **최악의 경우**(연속 TRANSIENT)는 consumer 의 last-good 최대 수명(§3.2)까지 옛 record 가 남는다. 그동안에도 그 record 의 `detailUrl` 은 이미 `404` 다 |
| PC6 | 되돌리기(rollback)도 같은 원자적 활성화다. 옛 패키지의 manifest/document 짝이 그대로 돌아온다(그 패키지의 `schemaVersion` 포함 — SV4) |
| PC7 | **긴급히 내려야 할 때** producer 의 수단은 둘이다: (a) record 를 비공개로 바꿔 다시 배포 → 다음 성공 주기에 사라진다. (b) 통합을 꺼서 다시 배포 → manifest `404` → 2주기 뒤 consumer 가 전부 버린다(§3.2) |

## 18. Security (core)

| # | 규칙 |
|---|---|
| SE1 | 문서는 **공개된 record 의, allowlist 에 있는 사실**만 담는다. 이 사실들은 **템플릿이 화면에 그리는지와 무관하게 이 계약으로 공개된다**(예: 면적 기준 `basis`, `publishedAt` 은 현재 템플릿이 표시하지 않는다). 통합을 켜는 사이트의 동의는 이 범위에 대한 것이다 |
| SE2 | 비밀, build/package/template 식별자, 비공개·초안 record 가 없다. 고객 인용과 그 표기는 **어떤 필드에도 들어가지 않는다**(allowlist 로 기계적 보장). `title`·`location`·`label` 에 고객 실명·연락처·상세 주소를 쓰지 않는 것은 **운영 규칙**이다(§20.1) |
| SE3 | 외부 host 를 가리키는 URL 이 없다(UR2) |
| SE4 | `C:` 문서의 모든 문자열(`title`, `label`, `location`)은 **운영자가 입력한 신뢰하지 않는 데이터**다. 지시문으로 해석하지 않는다 |
| SE5 | 비공개 확인용(preview) 빌드는 통합 문서를 **내지 않는다** |
| SE6 | 통합은 사이트별로 **켜는 것**을 전제로 썼다 — owner 결정 OD-2 = **(a) 사이트별 opt-in, 기본 off** (2026-09-22 확정, `04` 결정 기록 2026-09-22). 계약에는 보이지 않는다: manifest 가 있으면 켜진 것이다 |

## 19. Compatibility

- `C: MUST` 모르는 최상위 필드 · record 필드 · resource kind · facet key 를 만나도 실패하지 않는다(무시).
- `C: MUST` 모르는 enum 값(`unit`, `basis`, `perUnit`, `currency`)을 만나면 그 값을 **모름**으로 취급한다(record 는 유지).
- `P: MUST` 같은 major 안에서 필드를 제거·개명·의미 변경하지 않는다.
- `id`, `title`, `detailUrl` 중 하나라도 없거나 형식이 틀린 record 는 `C:` 가 **그 record 만** 버린다.

## 20. Degradation behavior

통합은 all-or-nothing 이 아니다. **필드·facet 의 존재 자체가 capability 신호**다. 별도의 operation metadata 는 없다.

| 사이트가 내는 것 | 가능해지는 것 |
|---|---|
| manifest + `id`/`title`/`detailUrl` | 배선 검증, 사례 나열 |
| + `listingUrl` | "모두 보기" 링크 |
| + `area` | 면적 기준 검색 |
| + `pricePerArea` (+ `category`) | 같은 category 안의 평당가 비교 (§10) |
| + `facets` | 분류 · 범위 · 태그 검색 |

- 어떤 record 에 값이 없으면 그 record 에 대해서만 그 기준이 평가 불가다(MD5).
- 어떤 facet 이 문서에 없거나 consumer 한도를 넘으면 그 사이트에서 그 기준은 꺼진다(VO5·VO6).
- consumer 는 `records` 를 훑어 기준별 coverage 를 스스로 계산할 수 있다.

### 20.1 보장 등급 — 각 규칙을 **무엇이** 지키는가

한쪽이 기계적으로 보장할 수 없는 규칙을 보장하는 것처럼 쓰지 않는다.

| 규칙 | 등급 | 설명 |
|---|---|---|
| allowlist 밖 필드 없음 (SE2 인용 제외 포함), 공개 record 만, URL 형식, facet 닫힘, 결정성, version echo | **기계적** | producer emitter + 테스트(§22) |
| 같은 패키지·원자적 활성화 (PC1–PC4, PC6) | **기계적** | 기존 배포 구조 |
| 문자열 길이 상한 (title ≤ 80 → 계약 120 이내, label ≤ 40) | **기계적** | 기존 content 검증 |
| 금지 문자 없음 (HT7) | **구현 예정 gate** | 지금은 보장되지 않는다 |
| `site.publicOrigin` = 실제 서빙 origin | **구현 예정 gate** | 지금은 배포 단계가 host 를 대조하지 않는다. 그 전까지는 운영 규칙. consumer 의 §5 origin 검사가 독립 방어선 |
| `record.id` 유일 | **기계적** | 기존 content 검증 |
| `record.id` 불변 (ID2), 재사용 금지 (ID3), `site.id` 불변 (ID4) | **운영 규칙** | 수정을 막는 장치는 없다. id ledger 는 §24 |
| `currency` 가 실재하는 ISO 4217 코드 | **운영 규칙** | 형식만 기계 검증 |
| `title`·`location`·`label` 에 개인정보 없음 | **운영 규칙** | onboarding checklist(`04`) |
| `pricePerArea` 가 "그 사례의 면적당 가격"이라는 의미 | **운영 규칙** | plausibility 는 판단하지 않는다 |
| 통합이 없는/꺼진 패키지의 manifest 경로 = `404` (HT9) | **코드 확인** | recon-runtime 은 없는 객체에 패키지의 `404.html` 을 status `404` 로 돌려준다(`platform/test/integration.test.ts` R1, fake R2). live origin 측정은 Phase D (freeze 검토 2026-09-22, `05` C-06) |
| record 당 `category` 정확히 1개 (§11.3) | **기계적** | emitter + validator (freeze 검토 2026-09-22, `05` C-08) |
| HT1·HT5 (live 서빙 동작) | **미검증** | pilot 배포에서 1회 측정 |

---

## 21. Examples

실제 `boost-interior-demo` site data(합성 fixture, 8건)에 V0 projection 을 적용한 결과다. 값은 원본 그대로이며 만들어 낸 필드가 없다. (`publicOrigin` 은 데모의 placeholder 값이다.)

### 21.1 Manifest — `/_integration/manifest.json` (273 bytes, 전체 8건 문서를 가리킨다)

```json
{
  "schemaVersion": "0.1",
  "site": {
    "id": "boost-interior-demo",
    "publicOrigin": "https://boost-interior-demo.example",
    "locale": "ko-KR"
  },
  "resources": {
    "portfolio": {
      "href": "/_integration/portfolio.6346c472e162ae07b76a4686fce54c51.json",
      "version": "6346c472e162ae07b76a4686fce54c51"
    }
  }
}
```

전체 문서: 8 records · `scope` 20종 · `tag` 8종 · 5,292 bytes(compact).

### 21.2 Portfolio resource document — **2건짜리 완결 예시**

지면을 위해 실제 데이터에서 `bi-01`, `bi-04` 두 건만 남기고 **그 두 건에 맞춰 `facets` 와 `version` 을 다시 계산한** 문서다(1,764 bytes compact). 그 자체로 모든 규칙(VO1 포함)을 만족한다. 읽기 쉽게 들여쓰기만 했다.

```json
{
  "schemaVersion": "0.1",
  "resource": "portfolio",
  "version": "6d641b6f8c9e8966551f2aed9a277285",
  "listingUrl": "/portfolio",
  "facets": {
    "category": {
      "values": [
        { "id": "full-remodel", "label": "전체 리모델링" },
        { "id": "kitchen-bath", "label": "주방·욕실 리뉴얼" }
      ]
    },
    "scope": {
      "values": [
        { "id": "거실", "label": "거실" },
        { "id": "공용 욕실", "label": "공용 욕실" },
        { "id": "복도 수납", "label": "복도 수납" },
        { "id": "안방", "label": "안방" },
        { "id": "안방 욕실", "label": "안방 욕실" },
        { "id": "욕실", "label": "욕실" },
        { "id": "작은방", "label": "작은방" },
        { "id": "주방", "label": "주방" },
        { "id": "현관·중문", "label": "현관·중문" }
      ]
    },
    "tag": {
      "values": [
        { "id": "간접조명", "label": "간접조명" },
        { "id": "모던", "label": "모던" },
        { "id": "미니멀", "label": "미니멀" },
        { "id": "수납 특화", "label": "수납 특화" },
        { "id": "화이트", "label": "화이트" }
      ]
    }
  },
  "records": [
    {
      "id": "bi-01",
      "title": "수성 화이트 34평 아파트 리모델링",
      "detailUrl": "/portfolio/suseong-white-34py-apartment-remodeling",
      "publishedAt": "2026-08-28T09:00:00+09:00",
      "location": "대구 수성구",
      "area": { "value": 34, "unit": "pyeong", "basis": "supply" },
      "pricePerArea": { "amount": 2900000, "currency": "KRW", "perUnit": "pyeong" },
      "facets": {
        "category": ["full-remodel"],
        "scope": ["현관·중문", "거실", "주방", "안방", "작은방", "욕실", "복도 수납"],
        "tag": ["화이트", "미니멀", "간접조명", "수납 특화"]
      }
    },
    {
      "id": "bi-04",
      "title": "32평 주방·욕실 중심 리뉴얼",
      "detailUrl": "/portfolio/buk-32py-kitchen-bathroom-renewal",
      "publishedAt": "2026-05-21T09:00:00+09:00",
      "location": "대구 북구",
      "area": { "value": 32, "unit": "pyeong", "basis": "supply" },
      "facets": {
        "category": ["kitchen-bath"],
        "scope": ["주방", "공용 욕실", "안방 욕실"],
        "tag": ["화이트", "모던"]
      }
    }
  ]
}
```

- `bi-04` 에는 `pricePerArea` 가 없다. 원본에 없기 때문이다. 이 record 에 대해 예산 조건은 평가 불가다(BU2).
- record 안의 `scope`·`tag` 는 **입력 순서 그대로**이고, `facets.*.values` 는 id 오름차순이다(§6.1).

### 21.3 사례가 없는 사이트

`fixture-empty` site data 에 적용한 결과(104 bytes). 공개 사례가 없으면 목록 페이지가 생성되지 않으므로 `listingUrl` 이 없고, 값이 없는 facet 은 선언하지 않으므로 `facets` 도 없다.

```json
{ "schemaVersion": "0.1", "resource": "portfolio", "version": "31aefd2bb7264c12d3ec4e072e7394c3", "records": [] }
```

---

## 22. Test invariants

양쪽이 **같은 golden fixture**(snapshot → manifest + document)로 독립 검증한다. "snapshot" = 같은 site data **그리고 같은 공개 판정 시각**(예약 공개 때문에 시각이 결과에 들어간다).

| # | 불변식 |
|---|---|
| INV-1 | 같은 snapshot → byte 단위로 같은 manifest·document·`version`. 두 번 빌드해도, 다른 빌드 환경에서도 같다 |
| INV-2 | **projection 이 바뀌면** `version` 이 바뀌고, **projection 이 같으면** `version` 도 같다. projection 에 없는 site data(본문·요약·사진·디자인 설정·다른 content)만 바꾸면 `version` 은 그대로다 |
| INV-3 | manifest `resources.portfolio.version` == document `version` == 파일명 속 version |
| INV-4 | document 의 record id 집합 == 그 snapshot 에서 공개 상태인 record 의 id 집합. 초안·예약·preview 전용 record 는 없다 |
| INV-5 | 모든 `detailUrl`·`listingUrl` 은 같은 패키지 안에 HTML 이 있다 |
| INV-6 | 모든 URL 은 UR2 형식이다. 문서 어디에도 외부 host 가 없다 |
| INV-7 | document 의 key 집합 ⊆ §7 allowlist. 요약·본문·gallery·고객 인용·주소(slug)·상태 문자열이 어디에도 없다 |
| INV-8 | facet 닫힘(VO1) 양방향 |
| INV-9 | 원본에 없는 값은 document 에 없다(`null`·`""`·`0`·`"unknown"`·빈 객체·빈 facet 없음). 가격 없는 record → `pricePerArea` key 자체가 없다. 저장된 basis 가 없음/"모름" → `basis` key 가 없다 |
| INV-10 | `area`·`pricePerArea` 의 수·단위·기준은 원본과 같다(환산 없음) |
| INV-11 | preview 빌드와 통합을 켜지 않은 사이트의 패키지에는 `/_integration/` 가 없고, 그 패키지는 통합 도입 전과 byte 단위로 같다. 통합을 켠 공개 빌드에서 https origin 이 없으면 **빌드가 실패한다** |
| INV-12 | HT7 의 금지 문자가 있으면 빌드가 실패한다 |
| INV-13 | **E2E(설명용 시나리오 — 단위 테스트가 아니라 양쪽 합동 acceptance):** 같은 구조화 intent + 같은 document → 같은 result id 목록. 결과의 모든 id 는 document 의 record 다 |
| INV-14 | record 의 `facets.<key>` 는 입력 순서·첫 등장 기준 중복 제거(§6.1) |
| INV-15 | **producer 서빙**: 통합을 켜지 않은/끈 패키지가 서빙될 때 manifest 경로(`/_integration/manifest.json`)는 `404` 다(§16 HT9) (freeze 검토 2026-09-22, `05` C-06) |
| INV-16 | 모든 record 의 `facets.category` 길이 == 1 (§11.3) (freeze 검토 2026-09-22, `05` C-08) |

consumer 쪽은 같은 fixture 로 다음을 검증한다: §3.2 의 상태별 동작(특히 `404`×2 → 데이터 폐기, TRANSIENT → last-good 유지·수명 만료), 모르는 필드/kind/facet/enum 무시, origin 불일치 manifest 거부, 한도 초과 facet 통째 무시, BU2(가격 없는 record 에 예산 판정 없음), PR4(category 를 넘는 가격 비교 없음). BU3 은 consumer 의 presenter template 검토 항목이다(문구 부재는 기계 검증이 아니라 리뷰로 확인한다).

## 23. Future extensions (방향만)

1. **추가 resource kind** — `resources.<kind>` 에 key 추가(minor). 각 kind 는 자기 resource 계약과 `schemaVersion` 을 갖는다. core 는 그대로다.
2. **추가 record 필드** — 준공연도, 공사 기간(주), `cover`(same-origin, 썸네일이 생긴 뒤), `totalCost`, 가격 포함 범위, `pricePerArea.basis`. 전부 additive(minor).
3. **추가 facet key / annex** — `propertyType`, `style` 은 원본에 구조화된 사실이 생기면 built-space annex 의 well-known key 로 승격. 다른 업종은 자기 annex 에 key 를 정의한다(`treatment`, `subject` …). record 구조는 바뀌지 않는다.
4. **Widget embed config** — 이 데이터 계약과 **분리된** 계약. 사이트별 공개 key, script origin, 삽입 위치(body 끝, async), 사이트 CSP 가 생길 경우의 허용 origin, 위젯 없이 사이트가 완전히 동작한다는 조건.
5. **필터 목록 URL** — producer 가 "어떤 기준을 어떤 파라미터로 받는가"를 선언하는 형태로만. 이때 UR2 의 "query 없음"은 그 필드에 한해 완화된다.
6. **규모** — consumer 선언 한도(VO6)에 가까워지면 분할 또는 압축 허용을 협의한다. 그 전에는 검색 서비스·API 를 만들지 않는다.
7. **다국어** — locale 별 document. V0 는 사이트당 locale 하나다.

## 24. Explicitly deferred items

| 항목 | 이유 | 재검토 조건 |
|---|---|---|
| `cover` | consumer V0 는 텍스트 카드. producer 에 썸네일 variant 가 없다. alt 는 자유 텍스트다 | consumer 가 이미지 카드를 시작할 때 |
| `propertyType` | 원본에 구조화 필드가 없다. title 에서 추론하지 않는다 | producer content model 에 필드가 생길 때 |
| `style` (tag 와 구분된) | 원본 keyword 가 색·스타일·기능·소재를 섞고 있다 | 운영자가 관리하는 vocabulary 가 생길 때 |
| 관리되는 `scope` vocabulary(계층·별칭) | 자유 입력은 사례가 늘면 consumer 한도(`scope` 150, 잠정)를 넘는다 | 첫 실제 고객 데이터를 본 뒤 (`04` OD-5) |
| `totalCost`, 가격 포함 범위, 가격 basis | 원본에 없다 | 실제 고객 데이터에서 필요가 확인될 때 |
| 준공연도 · 공사 기간 | 원본은 구조화되어 있으나 consumer 에 대응 기준이 없다 | consumer 가 기준을 추가할 때(minor) |
| 요약·본문·추천 근거 문구 | 자유 텍스트 = prompt-injection 표면. 근거는 consumer matcher 가 구조화된 사실에서 만든다 | 재검토하지 않는다(구조화 승격이 올바른 방향) |
| 필터 목록 URL | 템플릿은 이미 URL 로 필터 상태를 받지만 파라미터 이름은 템플릿 소유이고, 어휘 밖 값은 조용히 버려진다 | §23.5 |
| Widget embed (+ 사이트 CSP 허용) | 별도 계약. 새 템플릿 release 와 패키지 QA allowlist 가 필요하다 | data 계약 승인 후 |
| id 재사용 금지·불변의 기계적 강제 | 지금은 운영 규칙이다 | Site Platform 의 id ledger |
| global opaque id | site-local id + `site.id` 로 충분하다 | 여러 producer 플랫폼 통합 시 |
| locale 별 document | 사이트당 locale 하나 | 다국어 사이트가 생길 때 |
