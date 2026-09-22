# 02 — First-party integration producer: 설계와 구현

- 날짜: 2026-09-22
- 계약: `docs/reports/integration/02…md` (FROZEN V0) · 계획: `06-implementation-phase-plan.md` Phase A

## 한 줄 요약

opt-in 한 사이트의 **public** 빌드가 `next build` 앞에 `public/_integration/manifest.json` 과 `public/_integration/portfolio.<version>.json` 을 써 넣는다. Next 가 그대로 export 하므로 두 파일은 같은 immutable 패키지(`data/site-builds/<site>/packages/<buildInputId>/site/`)에 들어가고, 기존 publish/runtime 이 다른 정적 파일과 똑같이 서빙한다. runtime Worker 변경 없음, API 없음, DB 없음.

## 코드 지도

| 파일 | 역할 | Release source? |
|---|---|---|
| `platform/integration/contract.ts` | 계약 상수만(경로, schemaVersion, 정규식, HT7 금지 문자, consumer 선언 한도, `PRODUCER_VERSION`) | 아니오 |
| `platform/integration/config.ts` | `data/sites/<site>/integration.json` 로더(zod strict) + `integrationEmits(config, mode)` | 아니오 |
| `platform/integration/emit.ts` | **순수** projection: `(SiteSnapshot, 선언 route, route plan) → {manifest, portfolio document, version, files}`. 파일시스템·clock·env 없음 | 아니오 |
| `platform/integration/validate.ts` | fail-closed validator: schema(zod strict) · 사이트 정체성/origin(명시적 port 금지) · pointer/echo/파일명/RV1 재계산 · UR2(percent-encoded ASCII path) · HT7 · null/""/{}/[] 금지(`resources: {}` 만 예외) · 중복 id · 순서 · facet 폐쇄성 · category 정확히 1개 · area/price 모양 · INV-5 · consumer 한도(경고) | 아니오 |
| `platform/integration/sources.ts` | producer 자신의 소스 파일 (path, sha256) 목록과 hash — emit 하는 빌드의 build input (리뷰 MAJOR-1) | 아니오 |
| `platform/build/declared-routes.ts` | 자식 프로세스: workspace 의 `template.ts` 를 import 해 `routes` 를 JSON 으로 출력 | 아니오 |
| `platform/build/build-input.ts` | `BuildInputParts.integrationInputHash?` 추가 | 아니오 |
| `platform/build/site-build.ts` | seam: config 로드 → build identity → 선언 route 읽기 → emit → validate → `public/_integration/` 쓰기 → export 검증 → build record | 아니오 |
| `platform/site/load.ts` | 주석 한 줄(`integration.json` 은 snapshot 이 아닌 builder 입력) | 아니오 (`site/load.ts` 는 release source 제외 목록) |
| `data/sites/boost-interior-demo/integration.json` | 데모 opt-in | — |
| `platform/test/integration.test.ts` | 50 check (아래 `04-verification.md`) | 아니오 |

`collectReleaseSources` 가 정하는 release source(`templates/<id>/v<major>/**`, `platform/{content,settings,theme,assets,slots,site}` 중 `site/load.ts` 제외, tsconfig, runtime package.json/lock)는 하나도 건드리지 않았다. 테스트 I2 가 working tree 의 release hash == pinned 1.5.2(`d87807590d64…`)를 매 실행마다 확인한다. **Template 1.5.2 release 는 mutate 되지 않았고, 이 producer 는 Template release 변경이 아니다.**

## 1. Opt-in seam — 왜 snapshot 필드가 아니라 `integration.json` 인가

`06` A 는 "site 수준 설정"이라고만 했다. 후보는 둘이었다.

| 후보 | 결과 |
|---|---|
| `site.json` / `SiteSnapshot` 에 필드 추가 | `SiteSnapshotSchema` 는 **strict** 이고 release 안의 `platform/site/context.ts` 가 그 schema 로 snapshot 을 parse 한다. 필드를 더하면 1.5.2 를 포함한 모든 stored release 의 parse 가 깨지거나 **새 Template release** 가 필요하다 — "producer 는 Template release 변경이 아니다" 위반 |
| **별도 builder 입력** `data/sites/<site>/integration.json` (채택) | snapshot 과 release 에 보이지 않는다. builder 만 읽고, emit 할 때만 build identity 에 들어간다 |

`integration.json` 스키마(`schemaVersion: 1`, `firstPartyData.enabled: boolean`, strict). 없으면 OFF. `enabled:false` 도 OFF. 알 수 없는 key·타입은 `IntegrationConfigError` 로 빌드 실패(fail-closed). `mode !== "public"` 이면 항상 OFF(SE5).

사이트 이름 하드코드는 없다 — 테스트 B7 이 `platform/integration/**` 와 `platform/build/*` 에 `boost-interior`, `interior-demo`, `boostweb`, `fixture-` 문자열이 없음을 확인하고, T2 가 `fixture-small` 에 `integration.json` 만 넣어 같은 코드로 그 사이트의 origin·record 로 emit 되는 것을 확인한다.

## 2. Build identity (BLOCKER 규칙)

`buildInputId = hashJson({releaseHash, siteSnapshotHash, mode, toolchainHash, integrationInputHash})` — `hashJson` 은 `undefined` 를 버리므로:

- **OFF 빌드**: `integrationInputHash` 가 없다 → 키 자체가 없다 → 통합 이전과 **정확히 같은** `buildInputId`. 데모를 `integration.json` 없이 준비하면 live 패키지의 id `18c0a5ef…` 가 그대로 나온다(테스트 B4). fixture 세 사이트의 id 는 변하지 않았다(B1, T7 은 실제 rebuild 로 packageHash 까지 동일 확인).
- **ON 빌드**: `integrationInputHash = hashJson({producer: PRODUCER_VERSION, producerSourceHash, contract: {core, portfolio}, config})` 가 들어간다 → 다른 id. 데모의 값은 `03-golden-build.md`.

따라서 "OFF 패키지와 ON 패키지가 byte 는 다른데 identity 가 같다" 는 일어날 수 없다. emit 되는 byte 에 영향을 주는 입력은 snapshot(이미 `siteSnapshotHash`), release 의 선언 route(이미 `releaseHash`), 계약 버전과 config, 그리고 **producer 코드 자체**다. 마지막 것은 독립 리뷰(MAJOR-1)가 지적한 구멍이었다 — `PRODUCER_VERSION` 을 손으로 올리는 규율에만 기대면 emitter 를 고치고 bump 를 잊었을 때 같은 identity 아래 옛 문서가 남거나(`up-to-date` 로 skip) `--force` 로 다른 byte 가 교체된다. 지금은 `platform/integration/sources.ts` 가 producer 소스 6개(`integration/{contract,config,emit,validate,sources}.ts`, `build/declared-routes.ts`)의 sha256 목록을 hash 해 `integrationInputHash` 에 넣는다. 파일은 모듈 위치(`import.meta.url`) 기준으로 읽으므로 throwaway root 와 fresh clone 에서도 같은 값이다. `PRODUCER_VERSION` 은 사람이 읽는 신호로 남는다. `06` A5("emitter 가 바뀌면 buildInputId 가 바뀐다")가 기계적으로 성립한다.

`RECON_BUILD_ID = buildInputId[0:32]` 가 Next `generateBuildId` 로 들어가므로 ON 패키지의 HTML/RSC 와 `_next/static/<id>/` 경로에는 새 build id 가 박힌다. 이것은 기존 아키텍처의 정해진 동작이고 golden 비교(`03-golden-build.md`)에서 그 부분만 정규화했다.

## 3. Emitter (`emit.ts`) — 계약 §6·§6.1·§7–§11·§15 의 기계적 번역

- record allowlist: `id, title, detailUrl, publishedAt, location, area{value,unit,basis}, pricePerArea{amount,currency,perUnit}, facets` — 이 순서. 값이 없으면 key 를 쓰지 않는다. `basis` 는 `supply|exclusive` 만 통과, `unknown`/없음 → key 생략(AR2). 변환 없음(AR3) — 평은 평으로, supply 는 supply 로.
- facets: `category:[project.category]` (정확히 1개), `scope: dedupe(project.scope)`, `tag: dedupe(project.keywords)` — 입력 순서 유지 + 첫 등장 기준 중복 제거(INV-14). 문서의 `facets` 는 실제로 쓰인 값만(VO1), key 는 code point 순, 값은 id code point 순. `category` label 은 categories 의 name, `scope`/`tag` 는 id=label=문자열.
- 순서: record 는 id 의 **Unicode code point** 순(`compareCodePoints`, `localeCompare`·UTF-16 code unit 순 아님 — 테스트 C3).
- URL: 선언 route 중 `item.collection === "projects"` 가 **정확히 1개**이면 `detailUrl = pattern 의 [slug] 치환`(그 경로가 route plan 에 있어야 한다). **0개**면 계약 §4 대로 resource 를 **제공하지 않는다** — manifest 만 `resources: {}` 로 emit(consumer 상태 CONFIRMED OFF (resource)); **2개 이상**이면 상세 페이지가 모호하므로 빌드 실패. (처음 구현은 0개도 실패시켰다 — 독립 리뷰 MAJOR-2 로 계약에 맞췄다.) `list.page === "first"` route 의 단일 경로 = `listingUrl`(record 0 이면 생략). 절대 URL 없음(UR2); slug 는 schema 상 ASCII 라 path 는 percent-encoded ASCII 형태다(freeze 검토 C-07).
- version = `sha256(정렬 key canonical JSON of document without version)[0:32]`(RV1). 파일명 `portfolio.<version>.json`, manifest href 와 동일(RV5, INV-3). clock·random 없음.
- 직렬화: `JSON.stringify` compact, UTF-8, BOM 없음, key 순서는 계약 예시와 같다(테스트 E1 이 §21.1 의 5,292 B / manifest 274 B / version `6346c472…` 을 byte 로 재현, E2 가 §21.2·§21.3 재현).
- fail-closed: publicOrigin 없음 / `https:` 아님 / item route ≥ 2 / detailUrl 이 plan 에 없음 → `IntegrationError`.
- 선언 route 를 읽는 `DeclaredRoutesSchema` 는 preflight 리더처럼 **관용적**이다(모르는 key 는 버리고 collection·page 는 문자열) — 미래 Release 가 route 에 필드를 더해도 opt-in 사이트의 빌드가 깨지지 않는다(리뷰 MINOR-4).

## 4. Validator (`validate.ts`) — producer 측 마지막 문

emit 결과를 독립 코드로 다시 검사한다(schema 는 zod strict 로 별도 선언). 실패 항목이 하나라도 있으면 `assertIntegration` 이 전부 나열해 throw 하고 빌드가 실패한다. consumer 선언 한도(CH-R10)는 **경고**만(VO6 `P: SHOULD`), 절대 잘라 내지 않는다. 검사 목록은 `04-verification.md` V1–V12 와 코드 주석.

## 5. Builder seam (`site-build.ts`)

```
prepareSiteInput: loadIntegrationConfig → emit? → integrationInputHash → buildInputId
buildLocked:      verifyRelease → materialize → workspace inputs → pnpm install --offline → preflight → pruneRoutes
                  → [emit?] declared routes (child tsx, workspace template.ts) → emitIntegration → assertIntegration
                             → public/_integration/{manifest.json, portfolio.<v>.json}  (pre-existing dir → 실패)
                  → next build → verifyIntegrationOutput(out/) → qaStaticPackage → 패키지 조립 → build record (integration 요약)
```

- 선언 route 는 **release 의** `template.ts` 에서 읽는다(working tree 아님). `template.ts` 가 `@platform/*` 을 import 하므로 workspace 의 template tsconfig(paths) 아래 자식 `tsx` 프로세스로 실행한다. helper 경로는 `import.meta.url` 기준(`platform/build/declared-routes.ts`) — repoRoot 기준이 아니다(테스트의 throwaway root 에서 발견해 고쳤다). helper 의 stdout 이 비거나 JSON 이 아니면 사이트·stderr 맥락을 붙인 `SiteBuildError` 로 실패한다(리뷰 MINOR-3).
- `verifyIntegrationOutput`: emit 안 하면 `out/_integration` 이 **없어야** 하고, emit 하면 정확히 그 두 파일이 byte 동일해야 한다. Next 가 public 파일을 바꾸거나 빠뜨리는 회귀를 잡는다.
- `qaStaticPackage` 는 `.json` 도 텍스트로 훑어 절대 URL 을 거부한다 — 문서가 root-relative 만 쓰므로 통과한다(golden QA pass).
- build record 에 `parts`(integrationInputHash 포함)와 `integration` 요약(contract, producerVersion, manifest/portfolio 경로·bytes·sha256, version, record 수, facet 수, warnings)이 남는다.

## 6. 서빙 (변경 없음, 확인만)

- `platform/publish/publish.ts` (`planPublish`): 패키지에 `_integration/manifest.json` 이 있으면 그 `site.publicOrigin` 을 서빙 hostname 과 대조한다(`manifestOrigin` 을 plan 에 노출). 불일치는 sitemap origin 과 같은 정책 — 원격 publish(`requireOriginMatch`)에서는 거부, 로컬/테스트 host 에서는 경고(리뷰 MINOR-7: consumer 는 origin 이 다른 manifest 를 거부하므로 통합이 영영 ON 이 되지 않는 상태를 경고 한 줄로 지나치지 않게).
- `platform/publish/media.ts`: `.json` → `application/json`; `_integration/manifest.json` 은 hex-stem 규칙에 걸리지 않아 `public, max-age=0, must-revalidate`(HT3). `portfolio.<version>.json` 의 stem 은 version(= version 을 뺀 canonical JSON 의 hash, RV1)이지 파일 자체 sha256 의 prefix 가 아니므로 content-addressed 규칙에 걸리지 않아 역시 revalidate — 계약이 문서 캐시 정책을 강제하지 않으므로 허용, 파일명이 version 이라 실질 immutable.
- `workers/recon-runtime`: 없는 객체 → 패키지 `404.html` + status 404. OFF 사이트의 manifest 경로는 404 이지 403 이 아니다(CH-R11b `P: MUST`, 테스트 R1).

## 06 계획과의 차이

| 06 | 실제 | 이유 |
|---|---|---|
| A4 "site 가 opt-in" (방식 미정) | `data/sites/<site>/integration.json` (snapshot 밖) | snapshot schema 는 release 안에서 strict parse — §1 |
| A3 "빌더가 workspace 의 template.ts 에서 선언 route 를 읽는다" | 같다. 단, 자식 `tsx` 프로세스 + template tsconfig 로 hermetic 하게 | `template.ts` 의 `@platform/*` path alias |
| A5 "emitter/계약 버전을 BuildInputParts 에" | `integrationInputHash = hash(producer, producerSourceHash, contract, config)` 를 **emit 할 때만** 추가 | OFF 빌드 identity 를 통합 이전과 같게 유지(byte-neutral 의 identity 판); 소스 hash 는 리뷰 MAJOR-1 반영 |
| A3/A4 "item route 가 정확히 1개가 아님 → 빌드 실패" | 0개 = resource 미제공(manifest `resources: {}`), 2개 이상 = 실패 | 계약 `02` §4 가 규범(리뷰 MAJOR-2). `06` A3/A4 문구를 고쳤다 |
| A6 publish hostname ≠ publicOrigin 검사 | sitemap origin 검사는 이미 있었다(원격 publish 에서 거부). 이번에 **manifest origin** 도 같은 정책으로 대조 | 리뷰 MINOR-7. 테스트 R2 |
| A7 golden 을 별도 파일로 고정 | golden = 데모의 실제 패키지(`data/site-builds/…/39c69a40…/site/_integration/`) + 테스트가 §21 값을 상수로 고정 | 별도 fixture 복사본은 두 번째 진실이 된다. fixture-large/empty golden 은 T2/T3 가 매 실행 시 빌드로 검증 |
