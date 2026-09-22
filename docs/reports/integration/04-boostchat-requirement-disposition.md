# 04 — BoostChat Requirement Disposition (producer 판정)

- 날짜: 2026-09-21 (독립 리뷰 반영판 — `05` 의 F-01, F-05, F-06, F-16)
- 대상: `boost-chat/docs/reports/integration/web-recon-consumer-requirements-v0.md` (+ `.json`) 의 **모든** MUST / SHOULD / MAY / 정보성 항목
- 판정: `ACCEPT` · `ACCEPT_WITH_CHANGE` · `REJECT` · `DEFER` 중 하나
- 집계: **85 항목 = ACCEPT 53 · ACCEPT_WITH_CHANGE 23 · REJECT 4 · DEFER 5** (판정표는 이 문서에만 있다. `03…json` 은 계약 규칙만 담는다)
- 근거 코드는 `01-web-recon-producer-review-v0.md` 의 해당 절에 file:line 으로 있다. 여기서는 절 번호로 가리킨다.
- "정보(INFO)" = consumer 자신의 동작을 설명한 항목. producer 의무는 아니지만 producer 가 동의/이의를 밝힌다.

consumer 요구를 그대로 복사하지 않았다. 바꾼 곳은 전부 **producer 의 실제 코드·데이터**가 이유다.

---

## §A Required artifacts

| Requirement | Level | Producer Reality | Decision | Reason | Contract V0 | Implementation Impact |
|---|---|---|---|---|---|---|
| **A1** manifest 를 build 산출물에 포함 | MUST | 패키지에 JSON 0개. asset 이 `public/` 경유로 들어가는 seam 이 있다 (`01` §3, §12) | ACCEPT | 같은 seam 으로 자연스럽게 들어간다 | §3.1 | emitter + 빌드 호출 1곳 |
| **A2** portfolio index 포함 | MUST | 같음 | ACCEPT | 같음 | §4 | 같음 |
| **A3** 사이트와 같은 origin | MUST | 같은 불변 패키지, host→package 라우팅 | ACCEPT | 구조상 기본 | §3.1 | 없음 |
| **A4** manifest URL 고정, index URL 가변 | MUST | route segment 는 밑줄로 시작 불가 → `/_integration/` 충돌 0 | ACCEPT | | `/_integration/manifest.json`, `/_integration/portfolio.<version>.json` | 없음 |
| **A5** https · 직접 200 · no redirect · json content-type · 무인증 | MUST | runtime 은 redirect 를 하지 않는다. `.json → application/json`. **live 미배포** | ACCEPT_WITH_CHANGE | 책임을 나눈다: 패키지/ publish 가 보장(Content-Type), runtime 이 보장(no redirect), zone 설정(https 강제·www)은 계약 밖 | §16 HT1·HT2·HT8 | live pilot 에서 1회 검증 |
| **A6** `Accept-Encoding` 없으면 identity | MUST | 저장 바이트 비압축 + `Content-Length`. **edge 동작 UNKNOWN** | ACCEPT_WITH_CHANGE | "강제 압축 금지"를 표준 content negotiation 문장으로 바꾼다. 보장 주체는 runtime+CDN 이고 지금은 검증 불가 | §16 HT5 | live 검증 항목(U-1) |
| **A7** manifest `no-cache` 또는 ≤60s | MUST | 해시 이름이 아닌 파일 = `public, max-age=0, must-revalidate`. runtime 은 Cache API 미사용 | ACCEPT | **이미 기본 동작** | §16 HT3 | 없음 |
| **A8** published only | MUST | public snapshot = `published && publishedAt ≤ at`. preview snapshot 에는 draft 가 있다 | ACCEPT | 예약 공개까지 포함해 더 엄격하게 성립. 단 preview 빌드에서는 emit 금지 | §4, §18 SE5 | emitter gate(mode=public) |
| **A9** index ≠ 원본 project JSON | SHOULD | compact index 선례가 같은 원칙 | ACCEPT | producer 쪽에서는 **MUST** 로 올린다(allowlist pick, spread 금지) | §4, INV-7 | 누출 테스트 |
| **A10** PII 없음 | MUST | customerQuote attribution 에 가구 구성("4인 가족")이 있다 → 제외. `location` 은 길이만 검증 | ACCEPT | 인용은 어떤 필드에도 안 들어간다. location 세분도는 운영 규칙 | §18 SE2 | onboarding checklist |
| **A11** UTF-8, 제어문자 없음 | MUST | **content schema 는 제어문자를 막지 않는다**(`trim().min().max()` 뿐) | ACCEPT_WITH_CHANGE | 요구는 수용. 현 schema 로는 보장되지 않으므로 emitter 가 새로 검사해야 한다 | §16 HT7, INV-12 | emitter gate(위반 시 emit 실패) |
| **Consumer limits** (64 KiB / 1 MiB / 1,000건 / 5s / title 120 / label 40 / facet 당 40) | INFO | title ≤80, category name ≤40, keyword ≤32, scope ≤40 → 문자열 한도는 **schema 가 이미 보장**. facet 값 수는 자유 입력이라 보장 불가. 데모 5.3 KB, 173건 58 KB | ACCEPT_WITH_CHANGE | 문자열 한도는 계약에 채택. facet 40 초과 시 "통째로 무시"(잘라 쓰기 금지)를 명시. 5s·64 KiB 는 consumer 내부 상수이므로 계약에 넣지 않는다 | §7, §11 VO6 | 빌드 경고 |

## §B Manifest fields

| Requirement | Level | Producer Reality | Decision | Reason | Contract V0 | Impact |
|---|---|---|---|---|---|---|
| `schemaVersion` | MUST | 내부 관례는 정수 / `name@int` (major only) | ACCEPT | 통합 계약은 additive 진화가 필요하다. 내부 schema 버전과 **별개**로 둔다 | §14 | 상수 |
| `site.id` | MUST | `siteId` — slug 형태, 디렉터리·R2 prefix 와 동일, 도메인과 무관 | ACCEPT | 안정적이다. 난수처럼 생기지 않았을 뿐. consumer 는 opaque 로 취급 | §7.1, §13 ID4 | 없음 |
| `site.publicOrigin` | MUST | **schema 상 선택**, `http:` 도 허용. 데모는 placeholder. publish 가 hostname 과 대조하지 않는다 | ACCEPT_WITH_CHANGE | 통합의 **전제조건**으로 만든다: https `publicOrigin` 이 없으면 emit 하지 않는다. publish 에 host 일치 검사 추가 | §7.1, INV-11 | emitter gate + publish 검사(D-10) |
| `resources.portfolio.href` | MUST | — | ACCEPT | root-relative 만 | §5 | |
| `resources.portfolio.version` | MUST | per-collection hash 없음. canonical-JSON hash 도구 있음 | ACCEPT | projection 내용 hash | §15 | `hashJson` 재사용 |
| `recordCount` | MAY | 세면 나온다 | **REJECT** | 능력을 더하지 않고 파일 간 불변식만 하나 늘린다 | — | — |
| `vocabulary.<facet>` (manifest 최상위, `propertyType`/`style`/`scope`) | 선택 | `propertyType`·`style` 필드 없음. keywords 혼합 | ACCEPT_WITH_CHANGE | ① portfolio 전용이므로 **resource document 로 이동**(core manifest 를 업종 중립으로, vocabulary 와 record 를 같은 version 아래로) ② 고정 3이름 대신 `facets` 맵 ③ V0 key = `category`·`scope`·`tag` | §6, §11 | projection |
| `defaults` | MAY | 단위 없는 수치는 **발생 불가** | **REJECT** | 필요가 없다. 이미 구조화된 데이터에 사이트 전역 기본값을 덧대면 오히려 의미가 둘이 된다 | §9 AR1 | — |
| `allResults.baseUrl` | SHOULD | `/portfolio`. 사례 0건이면 페이지 없음 | ACCEPT_WITH_CHANGE | portfolio 전용 → resource document 의 `listingUrl`. route plan 에서 파생 | §6 | route source 식별 |
| `generatedAt` | MAY | 패키지는 입력이 같으면 바이트가 같아야 한다 | **REJECT** | wall-clock 은 `packageHash` 재현성을 깬다. consumer 도 쓰지 않는다고 명시 | — | — |
| `locale` | MAY | `site.json identity.locale` 필수, BCP 47 (`ko-KR`) | ACCEPT_WITH_CHANGE | 사이트 속성이므로 `site.locale` 로. 실제 값은 `ko` 가 아니라 `ko-KR` | §5 | 없음 |
| "넣지 말 것"(operation 목록, JSON Schema, snapshot/package hash, build 상태, template/theme) | INFO | — | ACCEPT | producer 내부 이름 누출 방지와도 일치 | §5 | — |

## §C Index required

| Requirement | Level | Producer Reality | Decision | Reason | Contract V0 |
|---|---|---|---|---|---|
| index `schemaVersion` | MUST | — | ACCEPT | manifest 와 **독립적으로** 올라가는 resource 계약 버전 | §3.3, §14 SV1 |
| index `version` echo | MUST | — | ACCEPT | + 파일명에도 같은 값 | §15 RV3·RV5 |
| `records[]` | MUST | snapshot 이 id 순 정렬 | ACCEPT | id 오름차순 고정 | §6 |
| `id` | MUST | 필수, 패턴 `^[a-z0-9]+(?:-[a-z0-9]+)*$` ≤64 | ACCEPT | consumer 권장 패턴의 부분집합 | §7.3 |
| `title` | MUST | 필수 ≤80 | ACCEPT | | §7.3 |
| `detailUrl` | MUST | Template 선언 item route + route plan | ACCEPT | 하드코드하지 않고 route plan 에서 파생 → L1 이 구조적으로 성립 | §7.3, §12 |

## §D Optional fields

| Requirement | Level | Producer Reality | Decision | Reason | Contract V0 |
|---|---|---|---|---|---|
| `category` = 표시 문자열 | 선택 | id+name 의 검증된 taxonomy, 8/8 | ACCEPT_WITH_CHANGE | producer 가 가진 **가장 믿을 만한 닫힌 facet** 이다. 표시 전용으로 버리지 않는다. 선행 조사: "전체 리모델링"은 반드시 type 으로 매핑해야 한다 | `facets.category` |
| `propertyType` | 선택 | **구조화 필드 없음** | **DEFER** | title 에서 추론하지 않는다. key 예약만 | §11.3, §24 |
| `styles` | 선택 | `style` 필드 없음. `keywords` = 색·스타일·기능·소재 혼합, 태깅 불완전 | ACCEPT_WITH_CHANGE | 전부를 style 이라 부르면 거짓이다. 종류를 주장하지 않는 **`tag`** facet(열림)으로 낸다. 닫힌 목록에서 고르는 consumer 설계에는 이것으로 충분하다 | `facets.tag` |
| `scope` | 선택 | 자유 문자열 20종, 세분도 불일치, `·` 복합 | ACCEPT_WITH_CHANGE | 원문을 보존한 사이트별 닫힌 목록. 동의어·상하위·복합어 = consumer. id = 원문 문자열 | `facets.scope` |
| `area` | 선택 | `{value, unit, basis?}`; unit 에 `sqft` 도 있다 | ACCEPT_WITH_CHANGE | unit 집합 = `m2\|sqft\|pyeong`. basis 모름 = **생략**(`"unknown"` 문자열 없음) | §9 |
| `pricePerArea` | 선택 | `{amount, currency, unit}`. **basis 없음**. amount 는 주 단위 소수 허용 | ACCEPT_WITH_CHANGE | basis 를 낼 원본이 없다. area.basis 에서 추론 금지. amount 는 입력 그대로 | §10 |
| `location` | 선택 | 시·구 수준 문자열 ≤80 | ACCEPT | 표시 전용 | §7.3 |
| `publishedAt` | 선택 | 필수 필드, offset 포함 | ACCEPT | 입력 그대로(`+09:00`) | §7.3 |
| `cover` | 선택(V0 미사용) | same-origin content-addressed, width/height 있음. **썸네일 없음**. alt = 자유 텍스트 | **DEFER** | consumer 가 쓰지 않는 필드에 자유 텍스트 표면을 미리 열지 않는다 | §24 |
| NOT_NEEDED: `summary`·`body`·`galleryGroups`·`customerQuote`·`builtYear`·`period`·`durationWeeks`·`slug`·`status` | INFO | `builtYear`·`durationWeeks` 는 구조화·8/8 | ACCEPT | 내보내지 않는다. 준공연도·공사 기간은 consumer 가 기준을 추가하면 additive 로 | §7.3, §24 |
| NOT_NEEDED: 자유 텍스트 `keywords` | INFO | — | ACCEPT | 자유 텍스트로는 내지 않는다. 닫힌 `tag` facet 으로만 | §11.3 |

## §E URL ownership

| Requirement | Level | Decision | Reason |
|---|---|---|---|
| **E1** URL·query 는 producer 소유 | MUST | ACCEPT | Template 이 route 와 query 파라미터를 소유한다(`01` §9) |
| **E2** 값으로 준 URL 만 변형 없이 | MUST | ACCEPT | + trailing slash 를 붙이면 404 라는 점을 계약에 명시(§12 UR3) |
| **E3** URL 구조 변경 = 재 emit 만으로 충분 | MUST | ACCEPT | route plan 파생이므로 성립. version 도 함께 바뀐다 |

## §F Schema version · §G Content version

| Requirement | Level | Decision | Reason |
|---|---|---|---|
| **F1** 두 문서 모두 `major.minor` | MUST | ACCEPT | |
| **F2** 제거·의미·타입 = major, 추가 = minor | MUST | ACCEPT | facet key·resource kind·**enum 값** 추가도 minor 로 명시(그래서 consumer 는 모르는 enum 값을 견뎌야 한다 — `02` §19) |
| **F3** 모르는 major 거부 / minor 무시 | INFO | ACCEPT | 모르는 major = TRANSIENT(`02` §3.2). 사이트마다 따로 재빌드·rollback 되므로 consumer 는 **아직 서빙 중인 모든 major** 를 지원해야 한다(SV4) |
| **F4** major 사전 통지 | MUST | ACCEPT | 절차 의무 |
| **G1** 내용이 바뀌면 version 이 바뀐다 | MUST | ACCEPT | |
| **G2** echo | MUST | ACCEPT | |
| **G3** 같은 내용 = 같은 version | SHOULD | ACCEPT | producer 는 **보장**한다(결정적 hash) |
| **G4** 시간으로 신선도 판단 안 함, byte hash 불요 | INFO | ACCEPT | `generatedAt` REJECT 와 일치 |
| **G5** 72h last-known-good | INFO | **ACCEPT_WITH_CHANGE** | 수명 값(72h)은 consumer 소유로 둔다. 그러나 **무엇이 last-good 을 유지시키고 무엇이 버리게 하는지**는 계약이 고정한다(`02` §3.2): `5xx`·timeout·echo 불일치·document `404`·모르는 major = 유지. **manifest 에서 그 kind 가 빠짐 = 즉시 폐기, manifest `404` 연속 2회 = 폐기.** 그렇지 않으면 통합을 끈(동의를 철회한) 사이트가 72시간 동안 계속 추천된다. 수명 상한을 두는 것 자체는 `C: MUST` |

## §H Allowed origins

| Requirement | Level | Decision | Reason |
|---|---|---|---|
| **H1** 모든 URL 은 상대경로 또는 publicOrigin 하위 | MUST | ACCEPT | 더 좁게: V0 producer 는 **root-relative 만** 낸다. 패키지 QA 가 JSON 안의 외부 절대 URL 도 실패시킨다 |
| **H2** 외부 host 필드만 버림 | INFO | ACCEPT | |
| **H3** `javascript:`·`data:`·`http:`·userinfo 거부 | INFO | ACCEPT | root-relative 만 내므로 발생하지 않는다 |
| **H4** 사이트 CSP 가 있으면 위젯 origin 허용 | MUST | **DEFER** | 위젯 요구다 → N1·N3 과 **같은 별도 계약**(Widget Embed)에서 다룬다. 이 데이터 계약에는 CSP 규칙이 없다. 사실: **현재 CSP 없음.** CSP 보다 **패키지 QA 의 외부 URL gate 가 먼저 걸린다**(`01` D-5) |

## §I Missing-data semantics

| Requirement | Level | Decision | Reason |
|---|---|---|---|
| **I1** 없으면 생략 또는 `null`, placeholder 금지 | MUST | ACCEPT | producer 는 **생략 하나로 고정**(`null` 미사용) — 요구 범위 안 |
| **I2** 없는 값 = 모름, 추정 금지 | INFO | ACCEPT | web-recon 철학과 동일("absent = unknown, never invented") |
| **I3** `[]` = 확인된 없음 ≠ 생략 | MUST | ACCEPT_WITH_CHANGE | 의미는 수용. 그러나 web-recon 에는 "확인된 없음"을 표현하는 필드가 **없다**(`scope` 는 min 1, `keywords` 는 빈 배열 ≡ 없음). V0 producer 는 `records` 외에 `[]` 를 내지 않는다 |
| **I4** 부분 복합 값 (`basis: "unknown"`) | MUST | ACCEPT_WITH_CHANGE | 원칙 수용. 표현은 **하위 필드 생략**으로 통일한다. I1 이 `"unknown"` 문자열을 금지하면서 J1 이 enum 에 `unknown` 을 두는 것은 consumer 문서 내부의 불일치다 |
| **I5** 추정·범위 금지 | MUST | ACCEPT | schema 에 범위 필드가 없고 emitter 는 파생하지 않는다 |
| **I6** 단위 모르는 수치는 비교 제외 | INFO | ACCEPT | producer 에서는 발생하지 않는다 |

## §J Area / price

| Requirement | Level | Decision | Reason |
|---|---|---|---|
| **J1** area = value + unit(`pyeong\|m2`) + basis(`supply\|exclusive\|unknown`) | SHOULD | ACCEPT_WITH_CHANGE | unit 에 `sqft` 추가, basis 모름 = 생략. 데모 8/8 가 이미 이 형태 |
| **J2** price = amount + currency + perUnit + basis | SHOULD | ACCEPT_WITH_CHANGE | basis 원본 없음 → 없음 |
| **J3** bare number + `defaults` | INFO | **REJECT** | 발생 불가 |
| **J4** 입력 단위·기준 그대로, 사전 환산 금지 | MUST | ACCEPT | + 환산 상수를 계약에 고정(1평 = 400/121 ㎡ — 사이트 필터가 쓰는 것과 같은 상수). 구간 경계까지 같다고는 약속하지 않는다(구간 정의는 각자 소유) |
| **J5** 공급↔전용 환산 안 함 | INFO | ACCEPT | producer 코드의 원칙과 동일 |
| **J6** 가격 없는 record 를 가격 조건 부합으로 표시 안 함 | INFO | ACCEPT | 계약 규칙으로 승격(BU1–BU4) + "부합하지 않음으로도 표시 안 함" 추가. category 를 넘는 가격 비교 금지는 `C: MUST`(PR4) |
| **J7** amount = 최소 통화 단위 정수; 포함 범위 차이 통보 | SHOULD | ACCEPT_WITH_CHANGE | 원본은 주 단위 수(소수 2자리). 변환하지 않는다. 포함 범위는 **전 record 에서 모델 자체가 없음** — 통보: "같은 축으로 볼 수 있는 것은 같은 category 안의 평당가뿐" |

## §K Identity · §L Detail link · §M All-results

| Requirement | Level | Decision | Reason |
|---|---|---|---|
| **K1** id 불변 | MUST | ACCEPT | 직접 입력값. slug·title·category·Template·rebuild 와 독립 |
| **K2** 유일, 재사용 금지 | MUST | ACCEPT_WITH_CHANGE | 유일성은 schema 가 강제. **재사용 금지·불변을 강제할 장치는 없다** → V0 는 운영 규칙(`02` §20.1 보장 등급표에 명시), 기계적 강제는 Site Platform 의 id ledger |
| **K3** `^[A-Za-z0-9_-]{1,64}$` 권장 | SHOULD | ACCEPT | producer 패턴이 부분집합 |
| **K4** slug ≠ identity | MUST | ACCEPT | |
| **L1** detailUrl 은 현재 배포에서 유효 | MUST | ACCEPT | 같은 패키지 + route plan + QA |
| **L2** publicOrigin 하위, tracking 없음 | MUST | ACCEPT | |
| **L3** unpublish → 같은 build 에서 빠짐 | MUST | ACCEPT | 같은 snapshot |
| **M1** baseUrl 을 그대로 링크 | SHOULD | ACCEPT_WITH_CHANGE | 위치만 이동(`listingUrl`) |
| **M2** 없으면 버튼 없음 | INFO | ACCEPT | 사례 0건 사이트가 실제로 이 경우다 |
| **M3** filtered link 는 V0 밖 | INFO | ACCEPT | producer 도 DEFER. **사실 정정:** 목록 페이지는 이미 URL 필터를 받는다. 보류 이유는 기능 부재가 아니라 파라미터 소유권과 "어휘 밖 값 조용히 버림"이다 |

## §N Widget · §P 단계

| Requirement | Level | Decision | Reason |
|---|---|---|---|
| **N1** 모든 페이지 `</body>` 앞 `<script async …>` + site settings 로 key 주입 | MUST | **DEFER** | 데이터 계약과 **분리된 계약**으로 다룬다. 지금은 (1) head/body 주입 seam 이 없고 (2) Template section settings 는 Template 이 선언한 key 만 받으며 (3) **패키지 QA 가 외부 절대 URL 을 전부 실패시킨다.** 새 Template Release + QA allowlist 가 필요하다(`01` D-5) |
| **N2** backend·proxy·CORS·cookie 불요 | INFO | ACCEPT | 정적 사이트다 |
| **N3** render-blocking 금지, 성능은 acceptance 에서 측정 | MUST | **DEFER** | N1 과 같은 계약에서. 원칙(`async`, body 끝, 실패해도 사이트 정상)에는 동의 |
| **N4** canonical origin 통보(`www`, preview) | MUST | ACCEPT_WITH_CHANGE | 출처 = `site.json identity.publicOrigin`. **데모 값은 placeholder** — live 전에 실제 origin 으로. preview 빌드는 통합 문서를 내지 않는다 |
| **P** 단계적 출발 P0–P3 | INFO | ACCEPT_WITH_CHANGE | producer 데이터가 이미 구조화돼 있어 P0+P1+P2(`category`·`scope`·`tag`)를 **한 번에** 낼 수 있다. P3(`cover`)만 뒤로 |

---

## consumer 에 되돌려 보내는 확인 요청

| # | 질문 | 이유 |
|---|---|---|
| R-1 | vocabulary 와 "모두 보기" URL 이 manifest 가 아니라 **resource document** 에 있어도 되는가 | core manifest 를 업종 중립으로 두고, vocabulary·record 를 같은 version 아래 두기 위해 |
| R-2 | record 의 facet 이 고정 필드(`styles`, `scope`, `propertyType`) 대신 **`facets` 맵**이어도 되는가. 모르는 key 는 무시 | 두 번째 업종에서 record schema 를 major 로 깨지 않기 위해 |
| R-3 | facet 값 `id` 가 **비-ASCII 원문 문자열**("수납 특화", "주방·팬트리")이어도 되는가 | V0 에는 관리되는 id 가 없다. 파생 id(hash/slug)는 만들 수 있지만 읽을 수 없고 얻는 것이 없다 |
| R-4 | `tag` facet(종류 미구분, 열림)으로 "화이트톤/미니멀" 검색을 시작해도 되는가 | `style` 이라는 보증은 producer 가 할 수 없다 |
| R-5 | `basis` 모름 = **생략** 으로 통일해도 되는가 | I1 과 J1 의 불일치 해소 |
| R-6 | `amount` = 주 단위 수(소수 2자리 이하)로 받아도 되는가 | 원본 그대로 |
| R-7 | BU1–BU4(총액 적합성 주장 금지 포함)를 consumer 의 presenter 규칙으로 받아들이는가 | 근거 없는 예산 적합성 표시 방지 |
| R-8 | 환산 상수 1평 = 400/121 ㎡ 채택 | 사이트 필터와 일치 |
| R-9 | facet 값이 40을 넘으면 그 facet 을 **통째로** 무시하는가 | 잘라 쓰면 일부 record 가 조용히 검색 불가가 된다 |
| R-10 | **facet 당 40 상한을 올리거나 facet 별로 다르게 둘 수 있는가** | 데모 8건에서 이미 `scope` 가 **20종**이다(자유 입력, 세분도 혼재). 실제 고객 수십 건이면 40을 넘을 가능성이 높고, 그러면 "욕실만" 같은 범위 검색이 통째로 꺼진다. producer 는 값을 잘라 내지 않는다 |
| R-11 | §3.2 의 가용 상태 구분(특히 manifest `404`×2 → 보유 데이터 폐기)을 받아들이는가 | 통합을 끈 사이트가 last-good 수명 동안 계속 추천되는 것을 막기 위해 |
| R-12 | manifest 의 `publicOrigin` 이 **등록 origin 과 다르면 거부**하고, 별칭 host(www/apex)가 아니라 canonical origin 하나만 등록하는가 | manifest 값으로 origin 을 덮어쓰면 등록이 무의미해진다 |

---

## FINAL READINESS MATRIX

```
WEB_RECON_PRODUCER_CONTRACT_READY           = YES (candidate; human approval pending)

CORE_MANIFEST_READY                         = YES
PORTFOLIO_RESOURCE_CONTRACT_READY           = YES (12 confirmation items R-1…R-12 open with the consumer)

CURRENT_PROJECT_SCHEMA_CHANGE_REQUIRED_FOR_V0 = NO
CURRENT_SITE_DATA_CHANGE_REQUIRED_FOR_V0      = DEPENDS ON OD-2
                                                OD-2(a) opt-in  → YES, small: one additive site-level field + one line in the demo site.json
                                                OD-2(b) default → NO
                                                either way, before live E2E: a real https publicOrigin (the demo value is a placeholder)
                                                project records themselves: NO change

AREA_SEARCH_READY                           = YES (8/8, pyeong/supply, authored units)
CATEGORY_SEARCH_READY                       = YES (closed taxonomy id+label, 8/8)
STYLE_SEARCH_READY                          = PARTIAL (no style field; served as open-world `tag` facet; tagging incomplete)
SCOPE_SEARCH_READY                          = DEMO: YES_AFTER_CONSUMER_NORMALIZATION / REAL SCALE: AT RISK
                                                (free-text, mixed granularity; 20 distinct values in 8 records vs consumer cap 40 → R-10, OD-5)
PRICE_SEARCH_READY                          = PARTIAL (6/8; per-area only; no basis, no inclusion scope; same-category comparison only)
TOTAL_BUDGET_MATCH_READY                    = NO (no total cost field; suitability claims forbidden by BU3)
PROPERTY_TYPE_SEARCH_READY                  = NO (no source fact; never inferred)

STABLE_RECORD_ID_READY                      = YES (authored id; immutability and non-reuse are operating rules, not mechanical)
DETAIL_URL_READY                            = YES (route-plan derived, same package)
ALL_RESULTS_BASE_URL_READY                  = YES (`listingUrl`; absent when 0 records)
FILTERED_RESULTS_URL_READY                  = NO for the contract (the template already accepts filter URLs; exposure deferred)

RESOURCE_VERSION_STRATEGY                   = content hash of the resource projection (canonical JSON sha256, 32 hex), echoed in manifest, document and file name
SCHEMA_VERSION_STRATEGY                     = "major.minor" per document, independent of producer-internal schema versions; V0 = "0.1"

STATIC_PACKAGE_INTEGRATION_SEAM             = platform/integration (pure projection) called by the site build between preflight and next build → public/_integration/** → same immutable package, same pointer activation
WIDGET_CONFIG_SEAM                          = separate contract; site-level declarative embed config → platform embed component in the template root layout (new release) → package QA allows declared embed origins only

BOOSTCHAT_REQUIREMENTS_ACCEPTED             = 53
BOOSTCHAT_REQUIREMENTS_CHANGED              = 23
BOOSTCHAT_REQUIREMENTS_REJECTED             = 4
BOOSTCHAT_REQUIREMENTS_DEFERRED             = 5

DEMO_SPECIFIC_COUPLING_FOUND                = NO in the contract (examples use demo data; no rule depends on it)
INTERIOR_SPECIFIC_CORE_LEAKAGE_FOUND        = NO in core. Space concepts (area, basis, pricePerArea, `scope`, budget rules) are isolated in a declared third layer, the built-space annex. Pre-existing: interior bucket labels inside platform/content/project-filter.ts — not used by the contract

SITE_PLATFORM_REQUIRED_FOR_V0               = NO
BOOSTWEB_REQUIRED_FOR_V0                    = NO
RUNTIME_API_REQUIRED_FOR_V0                 = NO

BLOCKERS_BEFORE_IMPLEMENTATION              = 0 technical. Gate = human approval of this candidate + OD-2 + consumer answers to R-1…R-12
INDEPENDENT_REVIEW                          = 1 BLOCKER + 7 MAJOR + 8 MINOR + 2 NOTE, all resolved in the documents (05); no finding required code
OWNER_DECISIONS_REQUIRED                    = 5 (see below)

RECOMMENDED_NEXT_STEP                       = Owner reviews 02 (normative) → decides OD-1/OD-2 → send 04 (R-1…R-12) to the consumer team → freeze Contract V0 → Phase A (web-recon emitter) per 06
```

## OWNER DECISIONS

기술 사실로 풀 수 있는 것은 위에서 풀었다. 사람이 정해야 하는 것만 남긴다.

| # | Question | Options | Recommendation | Tradeoff | Need now? |
|---|---|---|---|---|---|
| OD-1 | 이 후보를 Contract V0 로 승인하고 consumer 팀에 R-1…R-12 를 보내는가 | 승인 / 수정 후 승인 / 보류 | 승인 후 송부 | 승인 전에는 양쪽 구현 0 | **예** |
| OD-2 | 통합 emit 을 **사이트별 opt-in** 으로 할 것인가 | (a) opt-in, 기본 off (b) 모든 public 사이트 기본 on | (a) | (a) 사이트 설정에 작은 additive 필드 하나 + 데모 `site.json` 한 줄(= site data 변경). 통합을 켠 사이트에서 emit 이 불가능하면 빌드가 **실패**한다. (b) 설정 0 이지만 고객 동의 없이, **화면에 보이지 않는 사실(면적 기준·공개 시각)까지** 기계 판독 index 로 공개된다(`02` SE1) | **예** — `02` SE6 과 readiness matrix 가 이 결정에 걸려 있다 |
| OD-3 | live E2E 에 쓸 **실제 public origin/hostname** | 데모 전용 도메인 / 고객 도메인 | 데모 전용 도메인 먼저 | 도메인 없이는 HT1·HT5 검증과 위젯 origin 등록이 불가 | Phase D 전 |
| OD-4 | 실제 고객을 위해 **가격 모델을 보강**할 것인가 (`totalCost`, 포함 범위, price basis) | 지금 / 첫 고객 데이터 본 뒤 / 안 함 | 첫 고객 데이터 본 뒤 | 지금 하면 synthetic 가정 위에 schema 를 짓게 된다. 미루면 예산 상담은 "평당가 참고"에 머문다 | 아니오 |
| OD-5 | **관리되는 vocabulary**(style·propertyType·scope 계층)를 content model 에 넣을 시점 | 지금 / Template 2·첫 고객 이후 | 이후 — 단 **R-10 회신이 "상한 고정"이면 첫 실제 고객 전으로 당긴다** | 자유 입력 `scope`/`tag` 는 사례가 늘면 40종을 넘고(데모 8건에 scope 20종) 다국어에서 깨진다. 그러나 지금 설계하면 데모 8건에 맞춘 taxonomy 가 된다 | 아니오 (R-10 회신 뒤 재판단) |

## V0 vs future data model (§49)

**판정: A — schema change 0, emitter normalization(=정직한 projection)만.**

| 항목 | 분류 |
|---|---|
| emitter + gate(public only, https origin, 제어문자, allowlist) | NEEDED_FOR_V0 |
| emitter 버전을 `buildInputId` 입력에 포함 | NEEDED_FOR_V0 |
| publish 의 hostname ↔ `publicOrigin` 검사 | NEEDED_FOR_V0 (live 전) |
| site 수준 opt-in 플래그 | NEEDED_FOR_V0 (OD-2 승인 시) |
| `totalCost` · 가격 포함 범위 · `pricePerArea.basis` | USEFUL_FOR_REAL_CUSTOMERS |
| keyword 재태깅 기준, 부분 공사 가격 입력 | USEFUL_FOR_REAL_CUSTOMERS (데이터 작업, schema 변경 아님) |
| 썸네일 asset variant | USEFUL_FOR_REAL_CUSTOMERS (`cover` 선행 조건) |
| 관리되는 vocabulary(`style`, `propertyType`, scope 계층) | DEFER_UNTIL_TEMPLATE2_3 |
| preflight 가 route source 를 출력 | DEFER_UNTIL_TEMPLATE2_3 (그 전에는 빌더가 선언 route 를 읽는다) |
| id ledger(재사용 금지 강제), importer 의 id 보존 | DEFER_UNTIL_SITE_PLATFORM |
| locale 별 document | DEFER_UNTIL_SITE_PLATFORM |

## First real customer — minimum portfolio data quality checklist (§50)

데모는 synthetic fixture 다. 계약은 그 분포(8/8 채움, 단일 단위)에 기대지 않는다. 실제 고객 onboarding 때 확인할 최소 항목:

| 항목 | 필수? | 확인 내용 |
|---|---|---|
| stable id | **필수** | 한 번 정하면 바꾸지 않는다. 삭제한 id 를 다시 쓰지 않는다. 행 번호·slug 를 id 로 쓰지 않는다 |
| title | **필수** | 80자 이하. 고객 실명·상세 주소 없음 |
| detail route | **필수** | Template 이 상세 페이지를 생성한다(slug 유일, 예약 slug 아님) |
| published status | **필수** | 공개할 것만 `published`. 예약은 `publishedAt` |
| https publicOrigin | **필수** | 방문자가 실제로 보는 origin 과 같다 |
| category | **필수**(schema) | 사이트 taxonomy 가 고객의 말과 맞는가 |
| area | 선택 | 있으면 단위와 **기준(공급/전용)** 을 함께. 모르면 basis 를 비운다 — 추측해서 채우지 않는다 |
| price | 선택 | 있으면 무엇의 가격인지 운영자가 안다(전체 공사/스타일링). 부분 공사에 평당가를 억지로 넣지 않는다 |
| scope | 선택 | 한 사이트 안에서 같은 말을 같은 철자로("복도 수납" vs "복도·수납"). **같은 세분도로**("욕실" 과 "안방 욕실" 을 섞지 않는다 — 섞이면 "~만" 검색이 세분도를 넘어 추론할 수 없다). 사이트 전체 40종 이하 |
| tag | 선택 | 사이트 전체 30종 이하 권장. 같은 속성은 같은 태그로(웜 화이트 → 화이트 도 달 것인지 기준을 정한다) |
| location | 선택 | 시·구 수준까지. 동·호수·단지명 금지 |
| cover | 필수(schema) | 통합 V0 에는 쓰이지 않는다 |

---

## CRITICAL FINAL QUESTION

> "이 Contract V0 를 그대로 구현했을 때, boost-interior-demo 가 아닌 두 번째 실제 고객 사이트에서도 web-recon Template code 나 BoostChat core architecture 를 다시 뜯지 않고 같은 integration mechanism 을 사용할 수 있는가?"

**CONDITIONAL YES.**

**YES 인 이유 (같은 Template 의 두 번째 고객):**
- emitter 는 platform 모듈 하나이고 입력은 그 사이트의 SiteSnapshot + route plan 뿐이다. 고객별 코드가 0 이다. Template JSX 는 통합의 존재를 모른다.
- 계약에 데모 값이 하나도 없다. facet 값(`category`·`scope`·`tag`)은 그 사이트의 데이터에서 나오고, 단위·기준은 record 마다 입력값이며, URL 은 그 빌드의 route plan 에서 나온다.
- consumer 쪽은 "닫힌 목록에서 id 를 고른다 → id==id 비교"가 사이트와 무관하게 같다. 사이트마다 다른 것은 **목록의 내용**뿐이다.
- 능력은 필드 존재로 자동 조정된다. 가격이 없는 고객, 태그가 없는 고객도 같은 메커니즘으로 동작한다(그 기준만 꺼진다).

**조건:**
1. **consumer 가 R-1…R-4 를 수용해야 한다.** consumer 가 고정 필드 `styles`/`propertyType` 과 manifest 최상위 vocabulary 를 고집하면, 두 번째 업종에서 core 가 다시 뜯긴다.
2. **그 고객의 데이터가 checklist 를 통과해야 한다.** 메커니즘은 재사용되지만 검색 품질은 데이터에 달려 있다. 특히 자유 입력 `scope`·`tag` 가 consumer 상한(40)을 넘으면 그 기준이 **통째로** 꺼진다. 데모 8건에서 이미 scope 20종이므로 이것은 가정이 아니라 **예상되는 상황**이다 → R-10(상한 조정) 또는 관리되는 vocabulary(OD-5)가 선행돼야 한다.
3. **예산 상담을 원하면 가격 모델 보강(OD-4)이 선행돼야 한다.** V0 메커니즘은 그대로 두고 additive 필드로 해결된다(minor).
4. live 서빙의 미검증 항목(HT1·HT5)이 pilot 에서 통과해야 한다. 실패해도 계약이 아니라 runtime 설정의 문제다.

> "두 번째 업종이 들어왔을 때 무엇이 재사용되고 무엇이 resource-specific 하게 새로 생기는가?"

| 재사용 (변경 0) | 새로 생기는 것 |
|---|---|
| manifest 형태·고정 경로·`site` 블록 | — |
| `resources.<kind>` = `{href, version}` | 새 kind key (사례형이면 `portfolio` 그대로) |
| resource envelope(`schemaVersion`·`resource`·`version`) | 그 resource 의 `schemaVersion` 계보 |
| version 규칙·echo·파일명 규칙 | — |
| URL 규칙(root-relative, producer 소유, route plan 파생) | — |
| missing-data 규칙, 파생 금지 규칙(ND1), 가용 상태(§3.2) | — |
| facet 메커니즘(`{id,label}` 닫힌 목록 + record `facets` 맵), `category`·`tag` | 업종 annex 의 well-known facet key (built-space annex 의 `scope` 자리) |
| HTTP·publication·security 규칙 | 업종 규제에 따른 제외 필드(예: 의료광고) |
| 빌드 seam(`public/_integration/`), QA, packageHash, seal, pointer | — |
| "방문자 기준값 ≠ 상품/사례의 실제 값" 원칙 | 그 업종 annex 의 수치 필드와 주장 규칙(수강료, 일정 …). built-space annex(`area`·`pricePerArea`·BU 규칙)는 쓰지 않는다 |
| — | producer content model 의 새 collection schema + projection 함수 1개 (Template 2 가 어차피 만든다) |
| — | consumer 의 그 resource 용 matcher/presenter |
