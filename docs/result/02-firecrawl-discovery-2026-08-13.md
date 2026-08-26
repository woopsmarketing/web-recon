# 작업 보고서 — Firecrawl Discovery (Task 02)

```
Task: 02
Title: Firecrawl Discovery
Previous: 01-프로젝트초기화-2026-08-13.md  (01 프로젝트 초기화)
Status: Complete
```

> 참고: 프롬프트가 참조한 이전 보고서 파일명은 `01-프로젝트초기화-2026-08-13.md`
> 였으나, 실제 디스크에 존재하는 파일은 `docs/result/작업내용-2026-08-13.md` 이다.
> 소스 상태를 source of truth로 삼아 작업했다.

## 작업 목표

Root URL 하나를 Firecrawl **Map**에 전달하여 사이트 URL들을 발견하고,
normalize / deduplicate / same-site 필터링한 Discovery 데이터를 파일로 저장한다.
Playwright Observer, Interaction, AI, Reconstruction은 이번 범위에서 제외한다.

## 최종 구현 내용

- Firecrawl을 `DiscoveryProvider` 추상화 뒤로 격리 (엔진의 나머지 부분이 Firecrawl에
  직접 결합되지 않음).
- Firecrawl **Map** 엔드포인트로 URL 구조 발견 (Crawl 아님 — 페이지 본문은 가져오지 않음).
- Deterministic URL normalization (fragment 제거, http(s)만 허용, host lowercase,
  default port 제거, 소수의 tracking parameter 제거, 의미 있는 query parameter 보존).
- normalizedUrl 기준 deduplication.
- Same-site 필터링 (기본적으로 입력 사이트만, `www.`는 동일 사이트로 취급).
- zod로 검증되는 `DiscoveryResult` 스키마.
- raw + normalized 결과를 `data/<host>/<run-id>/` 에 저장.
- `pnpm recon <url> [--max-urls N]` CLI 연결 (의존성 없는 간단한 argument parsing).

## 변경된 프로젝트 구조

```
src/discovery/
  types.ts          # DiscoveryProvider 인터페이스 + zod 스키마 + 상수
  normalize-url.ts  # normalizeUrl / isSameSite / stripWww
  build-result.ts   # raw → normalize/dedupe/filter → DiscoveryResult (provider-agnostic)
  firecrawl.ts      # FirecrawlDiscoveryProvider (Firecrawl Map SDK 호출)
  store.ts          # discovery.raw.json + discovery.json 저장
  index.ts          # barrel export
src/cli.ts          # Phase 2 discovery 파이프라인으로 갱신
```

`src/discovery/.gitkeep` 는 그대로 유지(디렉터리에 실제 소스가 생겼지만 제거하지 않음).
`src/config/env.ts` 는 프롬프트 지시대로 **수정하지 않음** (`FIRECRAWL_API_KEY` optional 유지).

## Firecrawl Map 구현 방식

설치 버전: `firecrawl@4.32.0`. 기억이 아니라 실제 설치된
`node_modules/firecrawl/dist/index.d.ts` 의 타입 정의를 확인 후 구현.

- 클라이언트: `new Firecrawl({ apiKey })` (`Firecrawl` 은 `FirecrawlClient` 확장,
  생성자는 `{ apiKey }` 옵션 객체 수용).
- 호출: `client.map(url, options): Promise<MapData>`.
- `MapData = { id?: string; links: SearchResultWeb[] }`.
- `SearchResultWeb = { url: string; title?; description?; position?; category? }`.
- 사용한 `MapOptions`:
  - `limit`: `--max-urls` 값 (기본 100)
  - `timeout`: 60_000 ms
  - `ignoreQueryParameters: false`  ← query parameter 정책 (아래)
  - `includeSubdomains: false` (기본)
  - `sitemap: "include"` (sitemap 있으면 활용 + fallback discovery)
- 오류: SDK의 `SdkError`(`.status` 보유)를 잡아 401/402/429/5xx/timeout 을 사람이 읽을
  수 있는 원인 문자열로 매핑. API key/authorization header는 절대 출력하지 않음.

직접 HTTP API를 재구현하지 않고 공식 SDK의 `map()` 을 그대로 사용했다.

## URL Normalization 정책

`normalizeUrl(input): string | null` — deterministic. "URL의 의미를 바꾸지 않는다"를 원칙으로:

- `#fragment` 제거 (서버로 전송되지 않는 클라이언트 전용).
- scheme은 `http:` / `https:` 만 허용, 그 외(ftp, javascript: 등)는 `null` → invalid 집계.
- host lowercase (URL 파서가 자동 수행).
- default port 제거 (`:80` http, `:443` https).
- 명백한 tracking parameter만 제거: `utm_source`, `utm_medium`, `utm_campaign`,
  `utm_term`, `utm_content`, `gclid`, `fbclid`.
- 나머지 query parameter는 **순서 유지, 보존** (재정렬/삭제하지 않음).
- path는 손대지 않음 (trailing-slash rewriting 없음).

## Query Parameter 정책

`ignoreQueryParameters = false` (기본). Query parameter가 page identity의 일부일 수
있으므로(`/bbs/board.php?bo_table=notice`) Map 호출에서 일괄 무시하지 않는다.
Tracking parameter만 normalization 단계에서 소수 제거한다. 큰 tracking DB는 만들지 않았다.

## Discovery Schema

zod 스키마 (`src/discovery/types.ts`), `schemaVersion = 1`:

```
RawDiscovery      { provider, rootUrl, requestedLimit, fetchedAt, rawCount, links[] }
RawDiscoveryLink  { url, title?, description?, position?, category? }

DiscoveryResult   { schemaVersion, rootUrl, finalRootUrl?, provider, discoveredAt,
                    rawCount, normalizedCount, duplicateCount, invalidCount,
                    externalFilteredCount, links[] }
DiscoveryLink     { url, normalizedUrl, title?, description? }
```

불변식: `rawCount === normalizedCount + duplicateCount + invalidCount + externalFilteredCount`.
`buildDiscoveryResult()` 는 반환 전에 `DiscoveryResultSchema.parse()` 로 자체 검증한다.
데이터는 observed / derived 수준만 있고 AI inference는 없다.

## 저장 구조

```
data/
  <host>/
    <run-id>/
      discovery.raw.json   # Firecrawl가 돌려준 raw link/title/description
      discovery.json       # normalized/dedup/same-site DiscoveryResult
```

- `run-id`: timestamp 기반 (`2026-08-13T05-41-35-830Z`, `:`/`.` → `-`). random 성분
  없이 한 실행이 디스크상에서 재현 가능.
- raw를 별도로 남겨 향후 재분석 시 Map을 다시 호출할 필요가 없게 함.
- `data/` 는 gitignore 되어 있음.

## CLI 사용법

```bash
pnpm recon https://example.com
pnpm recon https://example.com --max-urls 20
```

출력 예 (실제):

```
web-recon

Target:
https://example.com

Discovery provider:
Firecrawl

Raw URLs: 20
Normalized URLs: 20
Duplicates: 0
Invalid: 0
External (filtered): 0

Saved:
data/example.com/<run-id>/discovery.json
```

기존 `Firecrawl key: detected` 표시는 제거했다. API key 존재 여부/값은 출력하지 않는다.
`--max-urls` 는 별도 parser 라이브러리 없이 간단히 파싱하며, 값이 Firecrawl Map `limit`
으로도 전달된다.

## 실제 API 테스트 결과

`pnpm typecheck` → **PASS** (exit 0).

실제 Firecrawl Map 호출 2건:

| target | max-urls | raw | normalized | duplicate | invalid | external | 결과 |
|---|---|---|---|---|---|---|---|
| https://example.com | 20 | 20 | 20 | 0 | 0 | 0 | PASS |
| https://docs.firecrawl.dev | 20 | 20 | 20 | 0 | 0 | 0 | PASS |

- `discovery.raw.json` / `discovery.json` 모두 정상 생성, JSON 파싱 정상.
- zod validation PASS (`buildDiscoveryResult` 의 `.parse()` 통과).

추가로 순수 로직(오프라인) 검증 — normalize/dedup/filter:

- fragment 제거, utm 제거, default port 제거, ftp/`javascript:` → invalid 확인.
- 입력 6개(같은 path의 non-www/www/fragment, 외부도메인, 서브도메인, invalid)에서
  `normalizedCount=2, duplicateCount=1, invalidCount=1, externalFilteredCount=2`
  → 불변식 `6 = 2+1+1+2` 성립.

CLI 오류 경로도 확인: 인자 없음(usage), 비-http 대상, 잘못된 `--max-urls`, 알 수 없는
옵션 모두 exit code 1 + 안내 메시지. key 미존재 시
`FIRECRAWL_API_KEY is required for Firecrawl discovery.` 발생 확인.

## 실제 발견 URL 예시

`https://docs.firecrawl.dev` (--max-urls 20) 샘플:

```
https://docs.firecrawl.dev/api-reference/v1-endpoint/deep-research-get
https://docs.firecrawl.dev/developer-guides/cookbooks/ai-research-assistant-cookbook.md
https://docs.firecrawl.dev/es/integrations/pipedream
https://docs.firecrawl.dev/es/introduction
https://docs.firecrawl.dev/features/key-restrictions.md
https://docs.firecrawl.dev/fr/advanced-scraping-guide
https://docs.firecrawl.dev/fr/quickstarts/dotnet
https://docs.firecrawl.dev/ja/api-reference/endpoint/monitor-check-get
```

`https://example.com` 은 사이트가 지나치게 단순하여 Firecrawl이 synthetic probe URL
(`?probe=…`, `?fc_probe=…`, `?t=…`, `?burst=…`)을 반환한다. Discovery 검증이 부족하여
프롬프트 지침대로 공개 문서 사이트(`docs.firecrawl.dev`)를 `--max-urls 20` 소규모로 추가
테스트했다.

## 사용한 Firecrawl 호출 수

실제 Map API 호출 **2회** (example.com 20, docs.firecrawl.dev 20). 나머지 검증은 오프라인
(순수 함수 / 생성자 가드)이라 API를 사용하지 않았다. 정확한 credit 사용량은 SDK 응답에서
확실히 확인되지 않아 추측하지 않는다 (Map 응답의 `id` 외 creditsUsed 값을 노출하지 않음).

## 발생한 오류와 해결 내용

- `tsx -e "..."` 인라인 평가에서 `.js` 상대 import가 CJS로 해석되어 모듈을 찾지 못함.
  → 임시 `.ts` 파일을 만들어 `npx tsx <file>` 로 실행 후 삭제하는 방식으로 검증.
- 그 외 구현/타입 오류 없음 (typecheck 첫 실행부터 PASS).

## 현재 한계

- **www vs non-www dedup 미수행**: same-site 필터는 `www.example.com` 과
  `example.com` 을 같은 사이트로 포함하지만, normalization은 host를 보존하므로 같은 path의
  두 형태가 별개 URL로 남는다. host를 바꾸는 것이 "URL 의미를 바꾸지 않는다" 원칙에 어긋날 수
  있어 의도적으로 보수적으로 두었다 (향후 옵션으로 canonical host 병합 가능).
- Subdomain 발견은 기본 비활성 (`includeSubdomains: false`). 향후 옵션.
- Public-suffix 기반 정확한 site 경계 판정은 하지 않음 (단순 정책).
- retry 시스템 없음 (프롬프트 범위 밖). 오류는 원인만 명확히 보고.
- `finalRootUrl` 은 Map이 redirect 최종 URL을 제공하지 않아 현재 항상 미기록(optional).

## 기술적 판단

- **Provider는 raw만 반환, normalization은 provider-agnostic 함수로 분리**: Firecrawl
  결합을 최소화하고 raw/normalized를 명확히 구분. 프롬프트의 예시 인터페이스
  (`discover(): Promise<DiscoveryResult>`) 대신 `Promise<RawDiscovery>` 로 두고
  `buildDiscoveryResult()` 를 별도 순수 함수로 분리했다 ("유사한 abstraction" 재량 범위).
- **query parameter 재정렬 안 함**: 표준 서버에선 무해하나 의미 변경 위험을 피하려 순서 유지.
- **run-id에 random 미사용**: 한 실행의 디스크 결과가 재현 가능하도록 timestamp만 사용.
- **env.ts 미변경**: 향후 offline/Playwright 작업을 위해 key는 env 레이어에서 optional 유지,
  대신 `FirecrawlDiscoveryProvider` 생성 시점에 명확히 에러.

## 다음 Task 추천 (추천만, 미구현)

- Phase 3: Playwright 기반 Static Observation — discovery.json의 URL 목록을 입력으로
  받아 URL별 DOM/computed CSS/geometry/asset/screenshot 관찰.
- Discovery 옵션 확장: `--include-subdomains`, canonical host 병합 옵션.
- 여러 run을 아우르는 간단한 조회/색인 (지금은 파일만 저장).

## 변경된 파일 목록

- 추가: `src/discovery/types.ts`, `src/discovery/normalize-url.ts`,
  `src/discovery/build-result.ts`, `src/discovery/firecrawl.ts`,
  `src/discovery/store.ts`, `src/discovery/index.ts`
- 수정: `src/cli.ts`, `README.md`, `ROADMAP.md`
- 추가(문서): `docs/result/02-firecrawl-discovery-2026-08-13.md`
- 미변경(의도적): `src/config/env.ts`
- 생성(런타임 산출물, gitignored): `data/example.com/…`, `data/docs.firecrawl.dev/…`

Git add/commit/push/reset/checkout/restore 등 history/index 변경 작업은 수행하지 않았다.

## 검수자가 확인해야 할 부분

- `DiscoveryProvider` 반환 타입을 `DiscoveryResult` 대신 `RawDiscovery` 로 둔 설계 판단이
  적절한지 (raw/normalized 분리 vs 프롬프트 예시 시그니처).
- www/non-www 및 subdomain 정책의 기본값이 프로젝트 방향과 일치하는지.
- tracking parameter 목록 범위가 적절한지 (현재 7개).
- `data/` 산출물 저장 구조(`<host>/<run-id>/`)와 run-id 포맷.
- Firecrawl 오류 매핑에서 secret 노출이 없는지.

---

Secret / API Key 값은 이 보고서, 소스코드, CLI 출력, 저장 JSON 어디에도 기록하지 않았다.
