Task: 06
Title: Discovery Candidate Verification
Previous: 05-responsive-deep-observation-2026-08-13.md
Status: Complete

---

# Task 06 — Discovery Candidate Verification

## 작업 목표

Firecrawl Discovery가 반환한 URL은 **확정된 페이지 목록이 아니라 Candidate**다.
그 안에는 정상 페이지, redirect, 404/403/500, timeout, 외부 도메인 redirect,
PDF/XML 등 비HTML, query만 다른 동일 페이지, 서로 다른 candidate가 같은 final
URL로 가는 경우 등이 섞여 있을 수 있다.

이번 Task의 목표는 이 Candidate들을 **Playwright로 실제 한 번씩 방문**하여
유효성을 deterministic하게 검증하고, 다음 단계(Page Selection → Multi-page Deep
Observation)에서 바로 쓸 수 있는 **신뢰 가능한 URL 목록**을 만드는 것이다.

이번 Verification은 **경량 필터 단계**다. URL마다 computed style / geometry /
screenshot / assets / mobile deep observation을 수행하지 **않는다** — 그것은 기존
Observer(Task 03~05)의 역할이다. 이번 단계가 답해야 하는 유일한 질문은:

> 이 URL을 이후 Page Analysis / Deep Observation 후보로 사용해도 되는가?

이다.

## 최종 구현 내용

새 모듈 `src/verifier/`를 추가했다. 기존 Discovery/Observer는 리팩터링하지 않고,
공용 상수(locale/timezone/colorScheme/reducedMotion)와 `isSameSite()` /
`normalizeUrl()`만 자연스럽게 재사용했다.

- `types.ts` — zod schema, status taxonomy, 상수/설정, content-type helper
- `fingerprint.ts` — in-page identity signal 수집기 + Node SHA-256 fingerprint
- `verify-candidate.ts` — Candidate 1개 검증 (fresh context, redirect chain, 분류)
- `verify-discovery.ts` — 전체 Candidate를 concurrency pool로 orchestrate
- `duplicate-groups.ts` — final-url / canonical / content-fingerprint group 생성
- `build-verified-urls.ts` — verified-urls.json (eligibility + final-URL dedup)
- `store.ts` — discovery.json 로드/검증, verification 출력 저장
- `index.ts` — barrel export

CLI: `src/cli-verify.ts` (`pnpm verify`). Fixture test: `scripts/smoke-verifier.ts`
(`pnpm smoke:verifier`).

핵심 추상화는 요구대로 단순하게 유지했다:

```ts
verifyCandidate(browser, candidate, rootUrl)   // 1개 검증
verifyDiscovery(discovery, options)            // 전체 orchestrate
```

Provider abstraction은 만들지 않았다 — Playwright verifier 하나로 충분하다.

## Verification architecture

```
discovery.json
→ DiscoveryResultSchema.parse (schema/version 검증)
→ Candidate[] (candidateUrl = link.url, normalizedCandidateUrl = link.normalizedUrl)
→ Chromium 프로세스 1개
    → Candidate마다:
        fresh BrowserContext
        → page.goto(domcontentloaded)
        → HTTP status / content-type / final URL / redirect chain
        → (valid-html일 때만) 짧은 settle → identity signals + fingerprints
        → context.close()
→ CandidateVerification[]
→ duplicate groups (final-url / canonical / content-fingerprint)
→ verification.json (상세) + verified-urls.json (compact)
```

Provenance는 명시적으로 구분했다:

- **Observed**: HTTP status, final URL, content-type, title, canonical tag,
  meta robots, body text, DOM element count
- **Derived**: same-site, redirected, fingerprint, duplicate group, eligibility

AI/LLM inference는 어디에도 없다.

## CLI

```bash
pnpm verify <path-to-discovery.json> [--concurrency N]
```

- Firecrawl API를 **호출하지 않는다**. 이미 저장된 discovery.json을 재사용한다
  (Explore Once → Reuse Data).
- 입력 파일은 기존 Discovery `DiscoveryResultSchema`로 검증한다. 읽기 실패 / 잘못된
  JSON / schema·version 불일치는 각각 명확한 오류를 낸다.
- `--concurrency`는 1–8 범위 validation. 기본 3.
- 진행 로그는 candidate별 한 줄(`[k/total] STATUS URL [→ finalUrl]`), 완료 후 요약.
  시끄러운 debug log는 출력하지 않는다.

## Browser/context 전략

- **Chromium 프로세스 1개**를 전체 run에서 공유 (속도).
- **Candidate마다 fresh `BrowserContext`** 를 새로 만들고, 끝나면 close.
  → cookie / localStorage / sessionStorage가 앞 URL에서 다음 URL로 전파되지 않아,
  방문 순서가 검증 결과를 바꾸지 못한다.
- Chromium 하나만 사용한다. Desktop/Mobile 둘 다 검증하지 않는다(존재 여부 확인
  단계이므로 viewport별 관측은 불필요). Viewport는 desktop-like 1440×900.
- 공용 profile(locale `ko-KR`, timezone `Asia/Seoul`, colorScheme `light`,
  reducedMotion `no-preference`)은 Observer 상수를 import해서 재사용했다. Verifier가
  Observer 내부 구현에 결합되지는 않는다(상수만 공유).

## Concurrency 정책

- 기본 concurrency **3** (보수적). CLI로 1–8 조정 가능.
- 자체 async pool: 최대 N개 in-flight, 결과는 원래 candidate 순서로 반환.
- 이번 테스트에서 사이트에 과한 요청을 하지 않도록 기본값을 낮게 유지했다.

## Candidate status taxonomy

Deterministic status는 의도적으로 작게 유지했다:

| status | 의미 |
| --- | --- |
| `valid-html` | final 응답이 same-site + 2xx + HTML → Deep Observation 후보로 사용 가능 |
| `http-error` | same-site final 응답이 4xx/5xx |
| `navigation-error` | navigation 실패(timeout / DNS / connection / 응답 없음) |
| `non-html` | same-site 2xx이지만 content-type이 HTML이 아님(pdf/xml/image/json…) |
| `external-redirect` | final URL이 same-site가 아님(외부로 redirect됨) |
| `blocked` | same-site final 응답이 401 / 403 / 429 |

분류 순서(final 응답을 얻은 뒤):
`!finalSameSite → external-redirect` → `401/403/429 → blocked` →
`status ≥ 400 → http-error` → `non-HTML content-type → non-html` → `valid-html`.

## Redirect 처리

- `candidateUrl` 과 `finalUrl`(= `page.url()`)을 구분해서 저장한다.
- Redirect chain은 Playwright의 실제 request graph에서 얻는다:
  final `response.request()` 에서 `redirectedFrom()` 을 역으로 따라가며 hop을 모으고,
  각 hop의 `response()` 에서 status와 `Location` header를 읽는다. **추측으로 chain을
  만들지 않는다** — Playwright가 직접 노출하는 값만 저장한다.
- `redirected = redirectCount > 0 || normalize(finalUrl) !== normalizedCandidateUrl`.
  → 서버 3xx뿐 아니라 (chain에 안 잡히는) JS/meta 이동으로 final URL이 달라진 경우도
  redirected로 표시. 반대로 `http://x` → `https://x/` 같은 정규화 차이만으로는
  redirected로 오분류하지 않는다.
- `redirectChain`(url/status/location)은 hop이 1개 이상일 때만 저장한다.

Playwright 1.62.1의 실제 API를 확인해서 구현했다(`goto(): Promise<null|Response>`,
`Response.status()/headers()/request()`, `Request.redirectedFrom()/response()`).

## Content-Type 처리

- HTTP 200이라도 HTML이라는 보장은 없으므로 content-type을 확인한다.
- `text/html`, `application/xhtml+xml` → HTML로 인정.
- 그 외(application/pdf, application/xml, image/*, application/json, application/zip…)
  → `non-html`. 파일 URL을 **삭제하지 않고** verification.json에는 남기되,
  verified-urls.json(Deep Observation 후보)에서는 제외한다.
- 특이 케이스: Chromium은 PDF 같은 비HTML을 navigation abort + download로 처리해서
  `page.goto`가 Response 없이 throw한다. 이를 대비해 main-frame navigation `response`
  이벤트를 캡처해두고, goto가 throw해도 캡처된 응답의 status/content-type으로
  `non-html`로 정확히 분류한다(navigation-error로 오분류하지 않음). fixture의 `/file`,
  실제 `domainchecker.co.kr/sitemap.xml`(application/xml)에서 검증됨.

## Same-site 처리

- Discovery의 `isSameSite()` 정책을 그대로 재사용(중복 구현하지 않음).
  `www.` 무시, 기본적으로 다른 subdomain은 same-site 아님.
- Discovery 단계에서 내부 URL이었어도 실제 접속 후 외부로 redirect되면
  `finalSameSite=false`, `status=external-redirect`로 처리하고 Deep Observation
  기본 대상에서 제외한다.

## Canonical 처리

- 정상 HTML 페이지에서 `<link rel="canonical">` 이 있으면 `finalUrl` 기준 absolute
  URL로 resolve해서 `canonicalUrl` 저장, `canonicalSameSite` 도 derive.
- **canonical은 힌트일 뿐 진실로 강제하지 않는다.** canonical이 있다고 candidate를
  자동 제거하거나 redirect 처리하지 않는다. duplicate/page identity 분석 신호로만
  사용한다.

## Fingerprint 방식

명백한 duplicate candidate를 찾기 위한 deterministic fingerprint(AI 없음):

- **Text fingerprint** — `document.body.innerText` 를 whitespace normalize + trim 한
  뒤 SHA-256. 본문 전체는 저장하지 않는다. 해시에 넣는 텍스트는 안전 상한
  (500,000자)으로 cap하되 `bodyTextLength`(정규화 전체 길이)는 별도 기록.
- **Structure fingerprint** — DOM tag 구조를 lightweight하게 표현한 signature
  (`depth:tag` 토큰을 document order로, 최대 8,000 element)를 SHA-256. attribute /
  computed style은 사용하지 않는다.
- **Combined** — `title + textHash + structureHash` 를 SHA-256.

목적은 "거의 동일한 URL 후보가 반복되는가"를 찾는 것이며, **semantic similarity /
template clustering / page archetype이 아니다.** 그래서 `structureHash`만 같다고
duplicate로 처리하지 않는다.

## Duplicate Group 정책

Verification 완료 후 deterministic duplicate group을 만든다(모두 원본 candidate는
보존; group은 삭제 명령이 아니라 힌트):

- **`final-url`** — 정규화된 final URL이 같은 candidate들. 사실상 같은 페이지이므로
  **매우 강한 duplicate**. verified-urls.json에서 이 기준으로만 자동 dedup한다.
- **`canonical`** — 같은 canonical URL을 선언한 candidate들. **힌트만**(canonical은
  advisory). 자동 제거 근거로 쓰지 않는다.
- **`content-fingerprint`** — `textHash` **와** `structureHash`가 **둘 다** 같은
  valid-html candidate들. 강한 content-duplicate **힌트**(여전히 보수적).

출력은 완전히 deterministic(type/key/멤버 URL 정렬).

## verified-urls eligibility 정책

`verified-urls.json` 에는 다음을 모두 만족하는 URL만 넣는다:

```
status === "valid-html"   ⇒   final HTTP success + HTML document + final URL same-site
```

그리고 **동일 final URL은 한 번만** 넣고, 그 final URL로 수렴한 모든 candidate를
`sourceCandidateUrls` 에 기록한다. `httpStatus 4xx/5xx`, `non-html`,
`external-redirect`, `blocked`, `navigation-error` 는 제외된다.

단, **canonical / fingerprint만 같은 경우는 이번 Task에서 제거하지 않는다.** 그 판단은
다음 Page Selection 단계에서 한다. 이 보수성이 이번 정책의 핵심이다.

각 항목: `url`, `sourceCandidateUrls[]`, `httpStatus`, `title?`, `canonicalUrl?`,
`textHash?`, `structureHash?`. 전체 set: `schemaVersion`, `rootUrl`,
`sourceDiscoveryFile`, `verifiedAt`, `count`, `urls[]`.

## Storage 구조

Verification은 **discovery run 디렉토리를 확장**한다(새 run-id를 만들지 않음).
`discovery → verification` provenance가 같은 run 안에서 이어진다. Observation run
(Task 03~05)과는 여전히 분리된다.

```
data/<host>/<run-id>/
  discovery.raw.json
  discovery.json        ← 입력
  verification.json     ← 상세 결과 (이번 Task)
  verified-urls.json    ← compact Deep-Observation 후보 (이번 Task)
```

`sourceDiscoveryFile` 을 두 출력 모두에 기록해 어느 discovery.json에서 파생됐는지
남긴다.

## Local fixture 테스트 결과

`pnpm smoke:verifier` — in-process HTTP 서버(외부 네트워크 없음)를 띄우고 실제
Playwright verifier를 돌려 분류/redirect/fingerprint/group/verified-url 결과를
검증한다. `/external` 은 `127.0.0.1`(root는 `localhost`)로 redirect해서 same-server로
도달 가능하지만 same-site는 아니게 만든다.

Endpoint별 기대 결과(모두 PASS):

| endpoint | 기대 | 결과 |
| --- | --- | --- |
| `/ok` | 200 HTML → `valid-html` (+fingerprints) | PASS |
| `/to-ok` | 302 → `/ok`, redirected, redirectCount 1, chain hop 302 | PASS |
| `/redirect` | 301 → `/ok`, chain hop 301 | PASS |
| `/not-found` | 404 → `http-error` | PASS |
| `/error` | 500 → `http-error` | PASS |
| `/blocked` | 403 → `blocked` | PASS |
| `/file` | application/pdf → `non-html` | PASS |
| `/canonical-a`,`/canonical-b` | 같은 canonical → `canonical` group | PASS |
| `/duplicate-a`,`/duplicate-b` | 같은 text+structure → `content-fingerprint` group | PASS |
| `/external` | 127.0.0.1로 redirect → `external-redirect`, finalSameSite false | PASS |

Group: `final-url {/ok,/to-ok,/redirect}`, `canonical {/canonical-a,/canonical-b}`,
`content-fingerprint {/duplicate-a,/duplicate-b}` 모두 PASS.

verified-urls.json 검증(모두 PASS): 404/500/non-html/blocked/external 제외, 동일 final
URL dedup(`/ok` 1개 + sourceCandidate 3개), canonical/fingerprint 중복은 유지, 최종
count 5, 그리고 verification.json / verified-urls.json 둘 다 Zod 재검증 통과.

**총 44/44 checks PASS.**

## domainchecker.co.kr 결과

입력: `data/domainchecker.co.kr/2026-08-13T07-51-15-559Z/discovery.json`
(Firecrawl `--max-urls 30`, 실제 반환 20). concurrency 3.

| 항목 | 값 |
| --- | --- |
| discovery candidates | 20 |
| valid HTML | 19 |
| redirected | 0 |
| HTTP errors | 0 |
| navigation errors | 0 |
| non-HTML | 1 (`/sitemap.xml`, application/xml) |
| external redirects | 0 |
| blocked | 0 |
| unique final URLs | 20 |
| verified URL count | 19 |
| duplicate groups | 1 (canonical) |

Duplicate group: `canonical https://domainchecker.co.kr/` → `{ /, /blog }`.
즉 `/blog` 가 canonical을 홈(`/`)으로 선언한다. **힌트로만** 기록하고 둘 다
verified-urls에 남긴다(자동 제거 안 함).

## seoworld.co.kr 결과

입력: `data/seoworld.co.kr/2026-08-13T07-51-25-928Z/discovery.json`
(Firecrawl `--max-urls 30`, 실제 반환 30). concurrency 3.

| 항목 | 값 |
| --- | --- |
| discovery candidates | 30 |
| valid HTML | 30 |
| redirected | 0 |
| HTTP errors | 0 |
| navigation errors | 0 |
| non-HTML | 0 |
| external redirects | 0 |
| blocked | 0 |
| unique final URLs | 30 |
| verified URL count | 30 |
| duplicate groups | 1 (canonical) |

Duplicate group: `canonical https://seoworld.co.kr/` → `{ /, /tools/domain-checker }`.
`/tools/domain-checker` 가 canonical을 홈으로 선언. 역시 힌트로만 기록, 둘 다 유지.

## 실제 Candidate 샘플

- 정상 페이지 1: `https://domainchecker.co.kr/` → valid-html, 200, text/html,
  title "도메인 분석 사이트 …", canonical `…/`, robots `index, follow`,
  bodyTextLength 4429, domElementCount 980, text/structure hash 존재.
- 정상 페이지 2: `https://seoworld.co.kr/tools` → valid-html, canonical `…/tools`,
  domElementCount 449.
- 정상 페이지 3: `https://seoworld.co.kr/services` → valid-html, domElementCount 143.
- 비HTML: `https://domainchecker.co.kr/sitemap.xml` → non-html, 200,
  application/xml, finalSameSite true, verified-urls에서 제외됨.
- 중복 후보(canonical hint): `domainchecker.co.kr/blog`, `seoworld.co.kr/tools/domain-checker`
  가 각각 홈으로 canonical 선언(위 group 참조).

독립 교차검증(curl): `/` = 200 text/html, `/sitemap.xml` = 200 application/xml,
`/tools/domain-checker` = 200 text/html — verification.json 결과와 논리적으로 일치.

## 발견된 중복/redirect 사례

- **Redirect**: 두 실제 사이트에서는 서버 3xx redirect가 관측되지 않았다(모든 valid
  candidate가 candidate URL = final URL). redirect 로직 자체는 fixture(`/to-ok` 302,
  `/redirect` 301)로 검증됨.
- **중복**: 두 사이트 모두 `final-url` 중복은 없었다(모든 final URL이 고유). 대신 각
  사이트에서 하나씩 **canonical 중복 힌트**가 나왔다(홈으로 canonical을 선언하는
  하위 페이지). 정책대로 자동 제거하지 않고 힌트로만 남겼다.
- **Synthetic/probe URL**: 이번 실제 discovery 결과에는 `?probe=` / `?fc_probe=` /
  `?burst=` / `?t=` 형태의 후보가 나타나지 않았다. 나타났더라도 문자열 규칙으로
  버리지 않고 실제 Playwright 행동으로 분류하도록 설계되어 있다.

## Verification 속도

| 사이트 | candidate | total elapsed(wall) | avg per candidate(측정) | concurrency |
| --- | --- | --- | --- | --- |
| domainchecker.co.kr | 20 | ~12.7s | 1665ms (min 810 / max 2209) | 3 |
| seoworld.co.kr | 30 | ~17.6s | 1647ms (min 991 / max 3810) | 3 |

`avg per candidate`는 candidate별 `timingMs`(navigation + valid-html일 때 settle +
signal 수집)의 평균이며, concurrency 3 덕분에 wall-clock은 그 합의 약 1/3 수준이다
(정확한 benchmark framework는 사용하지 않음).

## 발생한 문제

1. **PDF/비HTML navigation abort** — Chromium이 `application/pdf` 등을 download로
   처리하며 `page.goto`가 Response 없이 throw → 처음엔 `navigation-error`로 오분류.
   main-frame `response` 이벤트를 캡처해 goto가 throw해도 status/content-type을 읽어
   `non-html`로 분류하도록 수정. fixture `/file`, 실제 `sitemap.xml`에서 해결 확인.
2. **정규화 차이 vs 실제 redirect** — candidate `https://host` 는 discovery 정규화로
   `https://host/` 가 되고 final도 `https://host/` 다. 이를 redirect로 오표시하지
   않도록 `redirected` 판정에서 final URL을 다시 normalize해 비교했다.

그 외 큰 문제는 없었다.

## 기술적 결정

- **Provider abstraction 미도입** — 요구대로 Playwright verifier 하나로 단순 유지.
- **fresh context per candidate** — 프로세스는 공유하되 상태 격리로 결과 독립성 확보.
- **domcontentloaded + 짧은 settle**, `networkidle` 필수 대기 없음 — 빠른 필터 목적에
  맞춤. valid-html일 때만 signal 수집.
- **content-type gating을 status로 흡수** — `valid-html` 하나가 same-site+2xx+HTML을
  모두 보장하므로 verified-urls eligibility가 단순해진다.
- **canonical/fingerprint는 힌트, final-url만 강한 dedup** — 서로 다른 글이 같은
  template을 써도 duplicate로 지우지 않도록 보수적으로 설계.
- **secret 미저장** — request/response 전체 header를 dump하지 않는다. cookie /
  authorization / set-cookie를 저장하지 않고, browser storage도 저장하지 않는다.
  redirect의 `Location`(공개 redirect 대상)만 chain에 남기고, 오류 메시지는 한 줄로
  정규화 + 길이 cap 처리한다.

## 현재 한계

- Transient failure(timeout/5xx) **retry 없음** — 우선 그대로 기록만 한다(요구대로).
- 두 실제 사이트는 정적/정상적이어서 http-error / navigation-error / blocked /
  external-redirect / 실제 3xx 케이스가 **실사이트에서는** 관측되지 않았다. 해당 경로는
  fixture로 deterministic하게 검증했다.
- Structure signature는 8,000 element로 cap(초과 시 `structureTruncated` 표시). 매우 큰
  페이지에서 구조 해시 정밀도가 약간 떨어질 수 있다.
- Canonical/content-fingerprint 힌트를 실제로 **소비**해 대표 페이지를 고르는 단계는
  이번 범위 밖(다음 Task).
- 단일 Chromium 엔진만 사용(WebKit/모바일 검증 프로파일 없음).

## 다음 Task 추천

(추천만 하고 구현하지 않는다.)

```
Verified URL
→ Page Pattern / Representative Selection
    (canonical + content-fingerprint 힌트를 소비해 대표 URL 선정)
→ Multi-page Deep Observation
    (선정된 URL들을 기존 Observer에 투입)
```

- verified-urls.json + duplicateGroups를 입력으로, 각 duplicate 클러스터에서 대표 1개를
  고르는 deterministic selection 단계.
- 그 결과를 Task 03~05 Observer로 넘기는 Multi-page orchestrator.
- 필요 시 transient failure retry(경량)와 WebKit 검증 프로파일은 이후 확장으로.

## 변경 파일 목록

신규:

- `src/verifier/types.ts`
- `src/verifier/fingerprint.ts`
- `src/verifier/verify-candidate.ts`
- `src/verifier/verify-discovery.ts`
- `src/verifier/duplicate-groups.ts`
- `src/verifier/build-verified-urls.ts`
- `src/verifier/store.ts`
- `src/verifier/index.ts`
- `src/cli-verify.ts`
- `scripts/smoke-verifier.ts`
- `docs/result/06-discovery-candidate-verification-2026-08-13.md` (본 문서)

수정:

- `package.json` — `verify`, `smoke:verifier` script 추가
- `README.md` — recon/verify/observe 3역할, Task 06 파이프라인/출력/구조 반영
- `ROADMAP.md` — Task 06 완료 + 다음 단계 포인터

생성된 실행 산출물(gitignored `data/`):

- `data/domainchecker.co.kr/2026-08-13T07-51-15-559Z/{discovery.json,verification.json,verified-urls.json}`
- `data/seoworld.co.kr/2026-08-13T07-51-25-928Z/{discovery.json,verification.json,verified-urls.json}`

## 검수자가 특히 확인할 부분

- **역할 분리**: `pnpm verify` 가 Firecrawl API를 호출하지 않고 discovery.json만
  재사용하는지(`src/cli-verify.ts`, `src/verifier/verify-discovery.ts`).
- **상태 격리**: candidate마다 새 `BrowserContext` 생성/close 여부
  (`src/verifier/verify-candidate.ts`).
- **redirect chain의 근거**: `redirectedFrom()`/`response()` 기반이며 추측이 없는지.
- **canonical 보수성**: canonical이 verified-urls에서 candidate를 제거하지 않는지
  (`src/verifier/build-verified-urls.ts`, duplicate group은 힌트).
- **비HTML 처리**: non-html이 verification.json엔 남고 verified-urls엔 빠지는지.
- **secret 미노출**: 저장물에 cookie/authorization/set-cookie/전체 header/스토리지가
  없는지. (API key는 문서/코드/데이터 어디에도 기록하지 않았다.)
- **재현**: `pnpm typecheck`, `pnpm smoke:verifier`(44/44 PASS).
