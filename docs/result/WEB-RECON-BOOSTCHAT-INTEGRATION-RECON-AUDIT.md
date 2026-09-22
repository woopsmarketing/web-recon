# WEB-RECON — BoostChat Integration Recon Capability Audit

- 날짜: 2026-09-21
- 성격: READ-ONLY 조사 + 설계 판단. 코드·DB·migration·외부 서비스 변경 없음.
- 방법: 하위 에이전트 5개의 병렬 read-only 조사. 메인 에이전트가 핵심 file:line을 직접 재확인함.
- 표기:
  - **SUPPORTED** = `src/`의 제품 코드로 지금 가능
  - **PARTIAL** = 원재료는 있으나 가공·조건이 필요
  - **NOT_SUPPORTED** = 제품 코드에 없음
  - **PROTOTYPE** = gitignored 임시 스크립트로 한 번 해본 적만 있음

---

## 0. 요약

1. web-recon에 "API discovery 기능"이라는 이름의 모듈은 없다. 가장 가까운 것은 Source Preservation V2 Phase 1의 **Source Package 캡처**(`src/source-package/`)다.
   - 이것은 opt-in(`--source-package`) **네트워크 레코더 + 분류기**다.
   - 목적은 "원본 앱 런타임 보존을 위한 증거 수집"이다. API 계약 발견이 목적이 아니다.
2. 레코더의 품질은 좋다.
   - method, URL(+query), status, resourceType, 허용목록 응답 헤더, initiator, JSON 응답 body(sha 파일)를 남긴다.
   - `API_DATA`/`ANALYTICS` 분류와 secret redaction을 하고, Zod 스키마로 된 machine-readable JSON을 낸다.
3. Integration Recon에 필요한 나머지는 `src/`에 **전부 없다**.
   - endpoint dedupe / URL 템플릿화
   - parameter·schema 추론
   - pagination·filter 식별
   - form action 수집
   - auth 판별
   - READ/WRITE 판별
   - business resource 추론
   - UI 조작 중 네트워크 수집
4. 그 "없는 부분"은 apartmentary 종합 관찰(2026-09-18) 때 **임시 harness 약 420줄 + 강한 모델의 수작업**으로 한 번 만들어졌다.
   - 위치: `tmp/aco/*.mjs` (gitignored)
   - 산출물: `docs/result/apartmentary-comprehensive-observation/10-network-and-data-contracts.md`
   - 이 문서는 사실상 사람이 쓴 Integration Manifest다. 가능성은 증명됐지만 제품 코드는 아니다.
5. 첫 대상인 interior demo site는 **`output: "export"` 순수 정적 사이트**다.
   - API가 하나도 없고, 필터도 네트워크 요청 없이 client-side로 동작한다.
   - black-box 네트워크 recon으로는 발견할 것이 없다.
   - 이 대상은 "recon"이 아니라 "web-recon이 자기 typed content에서 manifest를 직접 방출"하는 쪽이 맞다.

**판정: REUSE_DECISION = C** — 데이터 수집은 재사용 가능하지만 Integration Recon 계층은 별도로 필요하다.

---

## 1. 현재 관련 구현 목록

| # | 구현 | 위치 | 실제 역할 | Integration Recon 관련도 |
|---|---|---|---|---|
| 1 | **Source Package recorder** | `src/source-package/recorder.ts:436-439` (`request/response/requestfailed/requestfinished`), CDP initiator `:169-208` | 페이지 로드 1회의 전체 네트워크 기록 | **핵심 (유일한 full recorder)** |
| 2 | Source Package classifier | `src/source-package/classify.ts:253-356`, `API_PATH` `:219`, redaction `:48-77`, framework 감지 `:489-518` | 요청을 11개 `DependencyClass`로 분류. `apiLike` 플래그, Preservability, framework evidence | 핵심 |
| 3 | Source Package config/embedded 수집 | `src/source-package/capture.ts:892-963`, globals 허용목록 `types.ts:170-181` | `__NEXT_DATA__`, `application/json` script, `ld+json`, `__NUXT__`/`__APOLLO_STATE__` 등 10개 window global | 높음 (SSR 데이터 계약) |
| 4 | Source Package 스키마/저장 | `src/source-package/types.ts:276-317` (`NetworkEntrySchema`), `store.ts:16-32` | Zod 스키마 + sha 기반 blob 파일 | 높음 (machine-readable) |
| 5 | Discovery (Firecrawl **Map** only) | `src/discovery/firecrawl.ts:36-64`, `normalize-url.ts:30-59`, `build-result.ts:30-109` | URL 목록 발견(sitemap 포함), 정규화, same-site 필터 | 중간 (route 인벤토리) |
| 6 | Page-family selector | `src/selector/build-families.ts:32-77` | 구조 hash 기반 family 묶음. `/portfolio/:id`류 sibling-pattern 포함 | 중간 (list/detail route 패턴 근거) |
| 7 | Source SEO snapshot | `src/seo/types.ts:53-192`, `head-parse.ts:56-138` | title/meta/OG/canonical/hreflang, **JSON-LD 원본 JSON + @type**, robots.txt, sitemap URL | 중간 (structured data) |
| 8 | Interaction detector | `src/interaction-detector/types.ts:100-136, 477-480` | click/tab/menu/dialog/submit 등 capability 후보, `insideForm`/`submitCapable` 플래그 | 낮음~중간 |
| 9 | Interaction explorer + safety guard | `src/interaction-explorer/execute-action.ts:307`, `safety-guards.ts:81-131`, `types.ts:361-365` | **click만 실행**. `context.route`로 GET/HEAD/OPTIONS 외 요청과 navigation을 abort | 중간 (안전 장치로 재사용 가치 큼) |
| 10 | Interaction patterns | `src/interaction-patterns/types.ts:83-108` | 8종 패턴(disclosure, tabs, menu, dialog, toggle, selection, dismiss, generic) | 낮음 |
| 11 | 기타 네트워크 hook | `observer/observe-page.ts:462`(stylesheet body만), `assets/network-qa.ts:70-83`(URL만), `reconstruction-qa/capture-page.ts:734-752`(실패/4xx만), `verifier/verify-candidate.ts:148-153`(main 문서 status) | 복제 품질 QA용 | 없음 |
| 12 | **PROTOTYPE**: apartmentary harness | `tmp/aco/{api-table,shape,interactions,interactions2,lib}.mjs` (gitignored, 422줄). 산출 `data/apartmentary.com/comprehensive-observation-2026-09-18/{network/api-table.json, network/census/*.txt, interactions/json-bodies/}` | endpoint 표, 응답 shape 요약, field census(type/null/enum 후보), 조작→요청 매핑 | **Integration Recon의 실제 선례. 제품 코드는 아님** |
| 13 | **PROTOTYPE**: synthetic replay | `tmp/source-preservation-phase3b*/phase3c*` (`network-guard.mjs:45-115`). 문서 `docs/result/source-preservation-phase3d-api-policy/03-existing-synthetic-replay.md` | `method+origin+pathname+query subset` 매칭 stub과 fail-closed guard | 참고 (endpoint 매칭 규칙의 선례) |

저장소 어디에도 없는 것 (grep 0건):

- HAR 기록 (`recordHar`)
- GraphQL operation 파싱 (`operationName`)
- JS bundle에서 endpoint 문자열 스캔
- JSON schema 추론
- URL 템플릿화
- pagination 감지
- auth 감지
- business entity 추론
- form `action`/`method` 수집
  - `observer/types.ts:478-504`의 `ATTR_WHITELIST`에 `action`/`method`/`required`가 없다.
  - `interaction-explorer/capture-state.ts:376`은 "no form `action` is read"라고 명시한다.

---

## 2. 실제 작동 구조

```
pnpm recon <url>            → Firecrawl Map → data/<domain>/<run>/discovery{.raw,}.json   (URL 목록)
pnpm verify / select        → HTTP status + 구조 hash → page-families.json               (family 대표 선정)
pnpm observe[:site] <url> --source-package [--prepare-scroll]
   └ observe-page.ts:1293-1300  attachSourceCapture(page)  ← page.goto 이전에 부착
        ├ recorder: 모든 request/response 기록 (viewport별 새 context, 익명)
        ├ 로드 → initial-paint census → (prepare-scroll: 읽기 전용 자동 스크롤) → settle
        └ observe-page.ts:1469-1471 finish() → classify → redact → 저장
   → data/<host>/<run>/viewports/<desktop|mobile>/source-package/
        manifest.json (counts.network.byClass, frameworkEvidence, limitations …)
        network/ (entries + n0034.<sha12>.json body blobs)
        config/  (__NEXT_DATA__, json-script, ld-json, window globals — secret-shaped key redacted)
        document/ styles/ scripts/ assets/
pnpm seo:observe            → source-seo-snapshot.json (JSON-LD 원본 포함)
pnpm detect/explore/model-interactions → click 전용 탐색, DOM diff만, non-GET abort
```

핵심 성질:

- **캡처 창은 페이지 로드와 자동 스크롤까지다.** 클릭·필터·검색·페이지 이동 중에는 레코더가 붙지 않는다.
  - interaction-explorer는 Source Package와 연결되어 있지 않다.
  - explorer의 상태 스냅샷은 DOM 전용이다 (`capture-state.ts:96-337`, `diff-state.ts:132-330`).
- **익명·fresh context만 쓴다.** 로그인 세션 입력이 없다.
- **보안 정책상 수집하지 않는 항목이 있다.**
  - 요청 헤더는 전혀 읽지 않는다. `recorder.ts:21`에 "`allHeaders()` is never called"라고 되어 있다.
  - 요청 body는 **바이트 길이만** 남긴다 (`recorder.ts:23, 255-260`).
  - `set-cookie`/`authorization`은 읽지 않는다.
  - 응답 헤더는 13개 허용목록만 남긴다 (`types.ts:133-147`).
- **child frame과 service worker의 응답 body는 항상 skip한다** (`recorder.ts:327-331`).
- **사이트 외부 host의 API는 query를 통째로 버린다** (`classify.ts:340-346`).
  - `dev-api.<site>` 같은 same-site API는 query를 유지한다.
  - 고객 사이트가 Supabase/Firebase/외부 SaaS를 백엔드로 쓰면 parameter 증거를 잃는다.
- **observer 자체는 mutation guard가 없다.**
  - apartmentary 캡처는 실제 view-count POST를 최대 32회 발생시켰다 (`10-network-and-data-contracts.md:29-36`).
  - non-GET abort는 interaction-explorer와 임시 harness에만 있다.
- API_DATA의 Preservability는 항상 `ORIGIN_BOUND`다 (`classify.ts:401-403`).
  - preservation-clone은 API를 구현·mock·replay하지 않는다고 명시한다 (`preservation-clone/build.ts:1249`).
  - 상태 문서도 같은 입장이다 (`docs/status/source-preservation-v2.md:37-41`): "network/JSON bodies are evidence, not rehydrated source", "No replay/mock/schema-inference logic was added".

---

## 3. 현재 수집 가능한 정보

### 3.1 기능별 A(입력) / B(수집) / C(저장) / D(정규화)

| 기능 | A 입력 | B 수집 | C 저장 | D 정규화 |
|---|---|---|---|---|
| Source Package network | URL → Playwright `Page` (viewport별 익명 context). repo·session 입력 없음 | endpoint URL, **method**, query(URL 안에), status/statusText, resourceType(xhr/fetch/…), frame/sameOrigin/host, redirect, 허용목록 응답 헤더(content-type 포함), `hasPostData`+`postDataBytes`, initiator(CDP), 시작/종료 시각, failed/streamAborted, **JSON 응답 body**(≤2MB/건, 합계 ≤16MB) | filesystem JSON + sha blob (`viewports/<id>/source-package/`) | **raw per-request log**. `url,method,seq`로 정렬만 하고 endpoint dedupe·schema 추론은 없음. 분류(`dependencyClass`, `apiLike`, `providerHint`, `thirdParty`)와 redaction만 수행 |
| Source Package config | 동일 | `__NEXT_DATA__`, json-script, ld-json, importmap, 10개 window global | `config/` JSON | 종류 태깅 + secret-key redaction. `self.__next_f`(RSC flight)는 **대상 아님** |
| Framework evidence | 동일 | Next/Nuxt/Angular/Vue/Astro/WordPress/Webflow/Framer/Shopify/Gatsby, `meta[generator]` | manifest `frameworkEvidence` | 규칙 기반 |
| Discovery | root URL | URL, title, description (Firecrawl Map, sitemap 포함) | `discovery.json` | tracking param 제거, dedupe, same-site 필터 |
| Selector | discovery + verify 결과 | 구조·텍스트 hash, sibling pattern | `page-families.json` | family 단위 묶음 (URL 패턴의 간접 증거) |
| SEO snapshot | 저장된 `rendered.html` | head meta, **JSON-LD 원본 JSON + @type**, link graph, robots/sitemap | `source-seo-snapshot.json` | 사이트 단위 집계 |
| Interaction detector/explorer | 저장된 관찰 + live page | 후보 요소, capability, form 소속 여부, click 전후 DOM diff, `safetyEvents`(차단된 요청의 `origin+pathname`만) | `interaction-*.json`, action별 JSON | 8종 패턴 |

### 3.2 필수 질문 12개

| # | 질문 | 답 | 근거 |
|---|---|---|---|
| 1 | crawl하면서 실제 fetch/XHR을 관찰하는가 | **SUPPORTED (opt-in)** | 조건: `--source-package`, 로드 + prepare-scroll 구간. 기본 observer 파이프라인은 DOM에서 asset만 도출한다 (`collect-assets.ts`). 실측: apartmentary desktop 1 load에서 요청 86건, `API_DATA` 5건, body 16건 |
| 2 | UI 조작 시 발생 요청도 수집 가능한가 | **NOT_SUPPORTED (제품 코드) / PROTOTYPE 존재** | explorer는 click만 실행하고 DOM만 diff한다. 레코더가 붙지 않는다. `tmp/aco/interactions*.mjs`가 filter/sort/page/tab 조작의 GET 응답 31건을 수집한 선례가 있다 |
| 3 | GET/POST 등 method 구분 | **SUPPORTED** | `recorder.ts:219,268`. 실측: channel.io `POST …/boot` |
| 4 | query/body parameter 저장 | **PARTIAL** | query는 URL에 포함해 저장한다 (secret-shaped key는 `[redacted]`, 외부 host API는 통째 삭제). **요청 body는 바이트 수만** 남긴다. JSON POST·GraphQL variables·form payload는 알 수 없다 |
| 5 | response JSON 구조 저장/추론 | **PARTIAL** | 원본 JSON은 저장한다. 구조 **추론은 없다**. shape/census는 `tmp/aco/shape.mjs` 28줄로 해본 적만 있다 |
| 6 | 동일 endpoint 다건 병합으로 parameter/schema 추론 | **NOT_SUPPORTED** | per-request log뿐이다. URL 템플릿화·param union이 없다. `api-table.mjs`(33줄)는 나열만 한다 |
| 7 | pagination/search/filter endpoint 발견 | **PARTIAL** | 로드 시 자동 발화하는 list 호출(`…get-by-paging?count=30&page=0&keyword=&…`)은 `API_DATA`로 잡힌다. "이것이 pagination/filter"라는 식별 로직은 없다. 변형 호출(page=1, 필터 값)은 조작이 필요하므로 #2에 막힌다. search/filter/pagination 패턴 종류도 없다 (`interaction-patterns/types.ts:83-108`) |
| 8 | form submit endpoint 발견 | **NOT_SUPPORTED** | form 소속 여부만 안다. `action`/`method`/field name/required를 수집하지 않는다. submit은 실행 금지(`EXCLUDED_GUARD_FLAGS`)이고 non-GET은 abort한다. 차단 로그도 `origin+pathname`만 남는다 |
| 9 | 인증 필요 API vs 공개 API 구분 | **NOT_SUPPORTED** | 익명 context만 쓴다. 401/403은 숫자 status일 뿐이다 (실측: channel.io boot 401, 플래그 없음). 요청 헤더와 set-cookie는 읽지 않는다. 읽을 수 있는 결론은 "익명 200 = 익명 접근 가능"뿐이다 |
| 10 | READ/WRITE 가능성 판별 로직 | **NOT_SUPPORTED** | method 원본 저장과 "non-GET이면 API_DATA" 분류 근거가 전부다. safety guard의 "non-GET = 차단"이 유일한 R/W 휴리스틱인데, 판별이 아니라 방어다 |
| 11 | business resource 추론 (portfolio/product/booking/inquiry/lead) | **NOT_SUPPORTED** | `src/` 전체에 entity/industry/resource 추론이 없다. apartmentary의 "portfolio record 45 keys" 계약은 강한 모델의 수작업이다 |
| 12 | machine-readable JSON 출력 | **SUPPORTED** | 5장 참조 |

---

## 4. 현재 수집 불가능한 정보 (한계)

| 항목 | 판정 | 설명 |
|---|---|---|
| DB table | **NOT_SUPPORTED** | black-box다. 응답 필드(`createdBy`, `lastModifiedDate` 등)에서 사람이 추측할 수는 있지만 도구는 모른다 |
| internal service | **NOT_SUPPORTED** | 브라우저가 부르지 않는 서비스는 보이지 않는다 |
| private API | **NOT_SUPPORTED** | 익명 세션에서 발화하지 않는 호출은 존재 자체를 모른다. 로그인 세션 입력 경로가 없다 |
| server-only route (gSSP, route handler 내부 호출) | **NOT_SUPPORTED** (출력만 **PARTIAL**) | 결과물인 `__NEXT_DATA__.pageProps`와 `/_next/data/*.json`은 수집된다. 서버가 어떤 upstream을 불렀는지는 알 수 없다. RSC flight(`self.__next_f`)는 수집 대상이 아니다 |
| service-role credential | **NOT_SUPPORTED** | secret-shaped 값은 의도적으로 **redact**한다 (`classify.ts:48-77`, config redaction). 몰라야 하는 정보이며 그렇게 설계되어 있다 |
| tenant isolation | **NOT_SUPPORTED** | 단일 익명 관점이다. 다중 tenant 비교가 없다 |
| business permission | **NOT_SUPPORTED** | 역할별 세션이 없다 |
| 실제 WRITE 의미 | **NOT_SUPPORTED** | non-GET은 method+URL+바이트 수만 남는다. explorer는 전송 전에 abort한다. "이 POST가 무엇을 바꾸는가"는 사람 또는 source 열람이 필요하다 |
| 요청 body/헤더 스키마 | **NOT_SUPPORTED** | 정책상 읽지 않는다. 보안 결정이며 버그가 아니다 |
| GraphQL operation/variables | **NOT_SUPPORTED** | `/graphql` 경로 정규식 분류만 있다. body를 읽지 않으므로 operation을 알 수 없다 |
| WebSocket/SSE 메시지 | **NOT_SUPPORTED** | 연결 자체만 entry로 남는다 |
| 외부 host API의 query | **NOT_SUPPORTED** | `classify.ts:340-346`에서 삭제한다 |
| 조작으로만 발화하는 endpoint | **NOT_SUPPORTED** (PROTOTYPE) | 3.2 #2 |
| rate limit / 약관 / CORS로 서버측 호출 가능한지 | **PARTIAL** | `access-control-allow-origin`은 허용목록 헤더에 있어 기록된다. 그 외는 없다 |

과장 방지를 위한 추가 사실:

- 위에서 "SUPPORTED"인 항목도 모두 **opt-in 플래그 + 로드 1회 + 익명**이 조건이다.
- 수집은 관찰된 호출에 한정된다. "이 사이트의 API 전부"가 아니라 "이 로드에서 브라우저가 실제로 부른 것"이다.

---

## 5. machine-readable output 현황

| 산출물 | 경로 | 스키마 | Manifest 재료 가치 |
|---|---|---|---|
| network entries + body blobs | `data/<host>/<run>/viewports/<vp>/source-package/network/` (`nNNNN.<sha12>.json`) | `NetworkEntrySchema` (Zod, `types.ts:276-317`) | **endpoints / evidence의 원천** |
| package manifest | `…/source-package/manifest.json` | `counts.network.{total,apiLike,byClass,bodiesCaptured}`, `frameworkEvidence`, `limitations`, `bodyPolicy` | target 메타, 증거 요약 |
| config | `…/source-package/config/` | kind 태깅(`next-data`/`json-script`/`ld-json`/global) | SSR 데이터 계약 |
| discovery | `data/<domain>/<run>/discovery.json` | DiscoveryResult v2 | route 인벤토리 |
| page families | `page-families.json` | family + 근거 | list/detail 구조 |
| SEO snapshot | `data/<host>/source-seo-snapshots/<run>/source-seo-snapshot.json` | `source-seo-snapshot-v1` | JSON-LD 기반 entity 힌트 |
| interaction | `interaction-{candidates,analysis,plan,exploration,patterns}.json` | 각 Zod | UI 컨트롤 인벤토리 (네트워크 없음) |
| (PROTOTYPE) api-table | `data/apartmentary.com/comprehensive-observation-2026-09-18/network/api-table.json` | 비정형. `{page,vp,method,status,host,path,query,sha,shape}` 70행 | Manifest `endpoints[]`에 가장 가까운 기존 실물 |

주의할 점:

- `data/`와 `tmp/`는 gitignored다.
- PROTOTYPE 산출물과 harness는 저장소 이력에 없다.
- `data/…/harness/`의 사본과 `docs/result/apartmentary-comprehensive-observation/*.md`만 남아 있다.

---

## 6. BoostChat 재사용 가능 부분

그대로 재사용 가능한 것 (수집 계층):

1. **`src/source-package/recorder.ts` + `classify.ts` + `types.ts` + `store.ts`**
   - Playwright `Page`만 받는 구조다 (`attachSourceCapture(page, options)`).
   - observer 밖에서도 붙일 수 있는 형태다.
   - 현재 호출부는 `observe-page.ts` 하나뿐이어서 layout probe 등 무거운 관찰과 함께 돈다.
2. **redaction 정책**(URL credential/secret key, config secret key, analytics query drop)과 **body cap**.
   - 고객 사이트를 조사하는 제품에 그대로 필요한 안전장치다.
3. **`interaction-explorer/safety-guards.ts`** (non-GET abort, navigation/popup/download/dialog 차단).
   - Integration Recon이 UI를 조작할 때 필수다.
   - apartmentary view-count 사고가 그 필요성을 보여준다.
4. **Discovery + selector**: route 인벤토리와 list/detail family 근거.
5. **SEO snapshot의 JSON-LD 원본**: `Product`, `LocalBusiness`, `Service` 등 @type은 resource 추론의 1차 힌트가 된다.
6. **`frameworkEvidence`**: Next면 `/_next/data`, WordPress면 `/wp-json` 같은 adapter 전략 선택 힌트.
7. **Zod 기반 산출물 규율 + evidence 라벨링 관행** (OBSERVED / INFERRED / UNKNOWN). Manifest의 `evidence[]` 설계에 그대로 쓸 수 있다.

재사용 불가 또는 부적합한 것:

- reconstruction, template, theme, production, release 전 계층. 목적이 시각 복제다.
- preservation-clone. API를 의도적으로 다루지 않는다.

---

## 7. 필요한 최소 추가 계층

기존 코드를 고치지 않고 **옆에 새 계층을 두는** 구성이다. 이번 작업에서는 구현하지 않는다.

| # | 추가 계층 | 내용 | 기존 선례 | 규모 감 |
|---|---|---|---|---|
| M1 | **Endpoint normalizer** | network entries를 `method + host + path template`으로 dedupe한다 (`/portfolios/{uuid}`, `/_next/data/{buildId}/…`). query key union과 값 분포(상수/enum/숫자/빈값)를 만든다 | `tmp/aco/api-table.mjs` 33줄, phase3c 매칭 규칙 | 작음 |
| M2 | **Response schema/census 추론** | 저장된 JSON body에서 필드 type/nullable/enum 후보/배열 길이를 뽑는다. envelope(`{data,error}`)와 paged envelope(`cursor,totalCount,page`)를 감지한다 | `tmp/aco/shape.mjs` 28줄 | 작음 |
| M3 | **Interaction-driven capture** | safety guard를 켠 채 recorder를 부착하고, 조작 → 요청 → 응답 → 렌더 영역을 매핑한다 (pagination/filter/sort/search/tab). filter·search·load-more 컨트롤 식별 | `tmp/aco/interactions*.mjs` 226줄+ | **중간** (가장 큰 공백) |
| M4 | **Form inventory** | `<form action method enctype>`, field name/type/required/pattern, submit 버튼을 수집한다. 전송은 하지 않는다 | 없음 (`ATTR_WHITELIST`에 미포함) | 작음 |
| M5 | **Operation/RW/auth 분류** | method 기반 `read \| write-suspected`, 익명 200 / 401·403 / 미관측을 구분한다. 보수적으로 라벨링한다 (`confidence`, OBSERVED/INFERRED) | safety guard의 method 집합 | 작음. 단 의미 판정은 사람 또는 source |
| M6 | **Resource 추론** | path segment + 응답 필드 + JSON-LD @type + 페이지 family를 묶어 `portfolio/review/journal…` 후보를 만든다. LLM 보조 + 사람 승인 | apartmentary 10번 문서 (수작업) | 중간. 판단 계층이다 |
| M7 | **Manifest assembler + validator** | M1~M6 결과를 Integration Manifest JSON으로 만든다. 모든 항목이 `evidence[]`(run id, entry id, sha)를 참조한다 | Zod 관행 | 작음 |
| M8 | **First-party manifest emitter** (web-recon이 만든 사이트 전용) | typed content(`platform/content/schema.ts`)와 route plan에서 manifest를 **빌드 시 직접 방출**한다. recon이 필요 없다 | 없음 | 작음. interior demo의 실제 경로 |

정책 결정이 필요한 것 (구현 전에 정해야 함):

- 요청 body를 읽을지 (GraphQL·JSON POST 파악에 필수). 읽는다면 redaction 규칙.
- 외부 host API의 query를 유지할지 (BaaS 사용 사이트).
- 인증 세션 입력을 허용할지.
- observer 로드 단계에도 non-GET guard를 걸지.

---

## 8. interior demo 적용 가능성

데모 사이트 사실 (코드 확인):

- 빌드 형태
  - `templates/interior-01/v1/next.config.mjs:9`가 `output: "export"`다.
  - API route, route handler, server action, middleware가 **0**이다.
  - 빌드 산출물에 `.json` 데이터 파일이 **0**이다.
- 포트폴리오 데이터
  - source of truth는 `data/sites/boost-interior-demo/content/{projects,categories,reviews,banners,business}.json`이다.
  - 스키마는 `platform/content/schema.ts:141-217`의 `ProjectSchema`다 (slug, category, area{value,unit,basis}, keywords, pricePerArea, galleryGroups[before/after], …).
  - 빌드 시 HTML과 RSC flight payload에 **bake**된다.
- 목록과 필터
  - 목록은 `/portfolio`, `/portfolio/page/[n]` (page size 30, `template.ts:8,79-81`)이다.
  - 필터·정렬은 **client-side pure module**이다 (`sections/portfolioFilter.ts:48-100`, `@platform/content/project-filter`).
  - 네트워크 요청은 0건이다.
  - URL 계약은 `keyword,type,area,style,price,sort,fp`다 (`lib/filterQuery.ts:17-25`).
- 상세: `/portfolio/[slug]`.
- 문의
  - 릴리스 1.4.2는 CTA가 `mailto:` 링크뿐이다.
  - 미릴리스 1.5.0 소스의 `/contact`도 mailto 작성 폼이다. `template.ts:139`에 "There is no backend: the site never sends, stores or confirms anything"이라고 되어 있다.
  - webhook/endpoint 설정 키가 없다.
- 구조화 데이터: JSON-LD 없음. `sitemap.xml`(모든 `/portfolio/<slug>` 나열)과 `robots.txt`는 있음.

| Capability | 판정 | 이유 |
|---|---|---|
| `portfolio.search` | **source code inspection 필요** (+ 서버 측 검색 API는 **신규 구현 필요**) | 필터가 네트워크를 타지 않아 recorder에 아무것도 남지 않는다. 필터 parameter 계약과 데이터는 source(`filterQuery.ts`, `ProjectSchema`, content JSON)에만 있다. black-box로 가능한 것은 HTML 카드 스크래핑 수준이다 |
| `portfolio.get` | **일부 발견 가능** | 현재 기능으로 발견되는 것은 sitemap/discovery의 `/portfolio/<slug>` 패턴, selector의 sibling-pattern family, 상세 HTML이다. JSON 계약은 없고 필드 구조는 source에만 있다 |
| `inquiry.create` | **신규 구현 필요** | 발견할 endpoint가 없다 (mailto). 1.5.0 폼이 릴리스돼도 POST 대상이 없다. form inventory(M4)도 없다 |
| `estimate.request` | **신규 구현 필요** | 페이지, 폼, 필드, 소스 어디에도 없다 |

결론:

- interior demo에 대해 black-box Integration Recon은 가치가 거의 없다.
- 이 대상은 web-recon 자신이 만든 사이트다. **M8(typed content → manifest 직접 방출)** 이 정확하고 저렴하다.
- `portfolio.search/get`의 실체는 BoostChat adapter가 읽을 projects index(JSON) 또는 검색 API를 **새로 만드는 일**이다.
- `inquiry.create`/`estimate.request`는 백엔드 자체가 신규다.
- Source Package 기반 recon이 가치를 내는 곳은 apartmentary처럼 **실제 client-side API를 가진 외부 고객 사이트**다.
  - 거기서는 `portfolios/action/get-by-paging`(filter/sort/page parameter 전부)이 로드만으로 잡혔다.
  - `portfolios/{uuid}`는 로드 + 임시 조작 harness로 잡혔다.

---

## 9. 추천 Integration Manifest 초안

설계 초안이며 구현하지 않는다. 각 필드에 현재 코드로 채울 수 있는 수준을 주석으로 단다.

```jsonc
{
  "schemaVersion": "integration-manifest-v0",
  "target": {
    "url": "https://example.com",            // SUPPORTED  discovery/observe 입력
    "observedAt": "2026-09-21T00:00:00Z",
    "source": "black-box-recon | first-party-build",   // M8이면 first-party-build
    "frameworkEvidence": ["nextjs-pages"],   // SUPPORTED  classify.ts:489-518
    "apiOrigins": ["https://dev-api.example.com"],     // PARTIAL    entries.host 집계(M1)
    "runs": ["data/<host>/<run-id>"]         // SUPPORTED
  },
  "resources": [                             // NOT_SUPPORTED → M6 (INFERRED, 사람 승인)
    { "id": "portfolio", "confidence": "inferred", "identity": "uuid",
      "listRoute": "/portfolio", "detailRoute": "/portfolio/{uuid}",   // PARTIAL selector family
      "evidence": ["ev:family:f000011", "ev:net:n0034"] }
  ],
  "endpoints": [                             // 원재료 SUPPORTED, 정규화 M1
    { "id": "ep.portfolios.paging", "method": "GET",
      "host": "dev-api.example.com", "pathTemplate": "/api/v1/portfolios/action/get-by-paging",
      "query": {                             // M1: param union + 값 분포
        "page":  { "type": "integer", "observed": [0, 1], "role": "pagination" },   // role은 M3/M5
        "count": { "type": "integer", "observed": [10, 30] },
        "keyword": { "type": "string" }, "spaceSizes": { "type": "enum?", "observed": ["", "40"] }
      },
      "requestBody": null,                   // 현재 정책상 항상 미수집 (byte length만)
      "response": { "contentType": "application/json", "schemaRef": "sc.PortfolioPage" },
      "trigger": ["page-load:/portfolio", "interaction:filter"],    // interaction은 M3
      "evidence": ["ev:net:n0034"] }
  ],
  "operations": [                            // NOT_SUPPORTED → M5/M6
    { "id": "portfolio.search", "resource": "portfolio", "kind": "read",
      "endpoint": "ep.portfolios.paging", "confidence": "inferred",
      "sideEffects": "none-observed" },
    { "id": "portfolio.addViewCount", "kind": "write-suspected",   // method 기반 추정일 뿐
      "endpoint": "ep.portfolios.addViewCount", "safeToCall": false }
  ],
  "schemas": [                               // body는 SUPPORTED, 추론은 M2
    { "id": "sc.PortfolioPage", "envelope": "data{cursor,totalCount,page}.data[]",
      "fields": { "uuid": "string", "spaceSize": "number", "styleTypes": "enum[]" },
      "sampleCount": 60, "evidence": ["ev:body:98928bcf470e"] }
  ],
  "forms": [],                               // NOT_SUPPORTED → M4
  "embeddedData": [                          // SUPPORTED  config/ (next-data, ld-json, globals)
    { "kind": "next-data", "route": "/portfolio/{uuid}", "path": "props.pageProps.portfolio" }
  ],
  "auth": {                                  // NOT_SUPPORTED → M5 (관측 사실만)
    "anonymousObserved": true, "statuses": { "200": 68, "401": 1 },
    "requiresAuth": "unknown", "credentialsCollected": false
  },
  "limits": ["anonymous session only", "request bodies not recorded", "load+scroll window only"],
  "evidence": [                              // SUPPORTED  run id + entry id + sha
    { "id": "ev:net:n0034", "run": "…/2026-09-18T08-28-29-279Z", "viewport": "desktop",
      "file": "network/n0034.98928bcf470e.json", "label": "OBSERVED" }
  ]
}
```

설계 원칙:

- 모든 항목에 `OBSERVED / INFERRED / UNKNOWN` 라벨과 evidence 참조를 단다.
- WRITE는 `write-suspected`까지만 쓰고, 사람 승인 없이는 `safeToCall: false`로 둔다.
- `resources`/`operations`는 추론 계층의 산출물이다. 도구가 "안다"고 주장하지 않는다.

---

## 10. 최종 판정

```
API_DISCOVERY_EXISTS       = PARTIAL   (전용 기능 없음. Source Package의 API_DATA 분류 + apiLike 플래그가 전부.
                                        endpoint 표는 gitignored 임시 스크립트 선례만 있음)
NETWORK_COLLECTION_EXISTS  = YES       (opt-in --source-package. load+scroll 구간, 익명. recorder.ts:436-439)
REQUEST_SCHEMA_COLLECTION  = PARTIAL   (method + URL query 저장. 요청 body/헤더는 정책상 미수집, 바이트 수만.
                                        외부 host API는 query 삭제. 추론 없음)
RESPONSE_SCHEMA_COLLECTION = PARTIAL   (JSON 응답 원본 저장 ≤2MB/건, ≤16MB 합계. schema 추론 없음)
RESOURCE_INFERENCE         = NO
AUTH_DISCOVERY             = NO        (raw status만. 익명 세션만. 요청 헤더/set-cookie 미열람)
READ_WRITE_INFERENCE       = NO        (method 저장 + explorer의 non-GET abort 방어뿐)
MACHINE_READABLE_OUTPUT    = YES       (Zod 스키마 JSON + sha blob. 단 raw log 수준)

REUSE_DECISION = C
```

**C인 이유 (코드 근거):**

- A가 아닌 이유
  - 12개 질문 중 제품 코드로 SUPPORTED인 것은 #1(opt-in), #3, #12뿐이다.
  - #2·#6·#8·#9·#10·#11은 `src/`에 구현이 없다.
- B가 아닌 이유: 부족한 것이 "작은 normalization"에 그치지 않는다.
  1. 조작 중 네트워크 수집이 없다. explorer는 click 전용에 DOM diff뿐이고 (`execute-action.ts:307`, `capture-state.ts:96-337`), recorder와 연결되어 있지 않다.
  2. form action/method를 수집하지 않는다 (`ATTR_WHITELIST`, `capture-state.ts:376`).
  3. 요청 body를 수집하지 않는다는 정책이 있다 (`recorder.ts:23`).
  4. resource/operation/auth 추론이 없다.
  - 1~4는 normalization이 아니라 새 계층이다. M1·M2만 B 크기다.
- D가 아닌 이유
  - recorder, classify, redaction, body blob, safety guard, discovery/family, JSON-LD는 그대로 쓸 수 있다.
  - apartmentary에서는 이 재료에 임시 스크립트 420줄만 얹어 endpoint 19종과 6개 record 계약이 실제로 나왔다.
  - 수집 계층의 재사용 가치는 높다.

```
MINIMUM_ADDITIONS =
  M1 endpoint normalizer (path template + query union)
  M2 response schema/census 추론
  M3 interaction-driven capture (recorder + safety guard 결합, filter/page/search 조작)
  M4 form inventory (action/method/fields, 전송 없음)
  M5 operation/RW/auth 보수적 라벨링
  M6 resource 추론 (LLM 보조 + 사람 승인)
  M7 manifest assembler/validator (evidence 참조 강제)
  M8 first-party manifest emitter (web-recon이 만든 사이트는 typed content에서 직접 방출)
  선행 정책 결정: 요청 body 열람 여부, 외부 host query 유지 여부, 인증 세션 입력, observer 단계 non-GET guard

BLOCKERS =
  B1 interior demo는 정적 export다. 발견할 API가 없고, inquiry/estimate는 백엔드 자체가 없다
     → recon 문제가 아니라 신규 구현 문제 (portfolio index/API, inquiry endpoint)
  B2 observer 로드는 mutation guard가 없다. 실제 고객 사이트에서 부작용 POST를 발생시킨 전례가 있다 (view-count 최대 32회)
     → 고객 대상 recon 전에 guard가 필수다
  B3 요청 body 미수집 정책 → POST/GraphQL 기반 사이트는 parameter를 알 수 없다 (정책 결정 필요)
  B4 Integration Recon의 유일한 선례(tmp/aco, phase3c)는 gitignored 임시 코드다. 재현하려면 제품화가 필요하다
  B5 익명 세션만 지원한다. 인증 뒤 API, 권한, tenant, WRITE 의미는 black-box로 알 수 없다 (사람 또는 source 필요)

REPORT = docs/result/WEB-RECON-BOOSTCHAT-INTEGRATION-RECON-AUDIT.md
```

### 문서와 코드의 차이 (기록)

- 메모리와 상태 문서의 "analytics bodies off"는 일반 analytics 응답이 아니라 **analytics provider의 script body**에 대한 정책이다 (`types.ts:105-107`, `recorder.ts:337-349`).
- `docs/result/apartmentary-comprehensive-observation/02-capture-matrix.md`가 언급하는 `harness/`는 `docs/` 아래가 아니다. `data/apartmentary.com/comprehensive-observation-2026-09-18/harness/`(gitignored)에 있다.
- `templates/interior-01/v1/template.ts`의 선언 버전은 1.5.0(`/contact` 포함)이지만 최신 릴리스와 데모 빌드는 1.4.2다. 데모에는 `/contact`가 없다.

STOP.
