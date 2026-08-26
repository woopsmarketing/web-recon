Task: 09
Title: Multi-page Deep Observation
Previous: 08-deterministic-structural-family-signals-2026-08-13.md
Status: Complete

---

# Task 09 — Multi-page Deep Observation

## 작업 목표

Task 08까지의 파이프라인은 "어떤 페이지를 관측해야 하는가"에 답했지만, 실제로 관측하는 명령은
여전히 URL 1개짜리(`pnpm observe`)였다. 이번 Task는 그 사이의 빈칸을 채운다.

```
selected-pages.json  →  Multi-page Deep Observation  →  하나의 site observation run
```

목표는 **오케스트레이션 하나뿐**이다. 새 Observer를 만들지 않고, Task 03~05의 Responsive Deep
Observer를 그대로 호출해서 여러 페이지를 안정적으로 관측하고 사이트 단위로 묶는다.

이번 Task에서 하지 않은 것: Firecrawl / discovery / verification / selection 재실행, resume,
cache, retry engine, interaction, visual diff, AI. (§5, §18, §19, §47)

## Architecture

```
selected-pages.json
      │
      ├─ loadSiteSelection()      Zod + provenance 검증, 브라우저 실행 전에 fail-fast
      ├─ planSitePages()          순수함수: pageId 배정 · 순서 · validation sample 선정
      │
      └─ observeSelectedPages()   Chromium 1개
             │
             ├─ p000001 ─┐
             ├─ p000002 ─┼─ observePageWithBrowser()   ← 기존 Observer, 그대로
             └─ …        ─┘        (desktop deep + mobile deep)
             │
             └─ saveSitePage() → pages/<pageId>/   (Task 05 레이아웃 그대로)
             └─ saveSiteObservation() → site-observation.json
```

신규 모듈은 `src/multi-observer/` 하나이며, 관측 로직은 단 한 줄도 들어 있지 않다.

| 파일 | 역할 |
| --- | --- |
| `types.ts` | Zod schema + 정책 상수 (concurrency, sample cap 등) |
| `load-selection.ts` | 입력 검증 (schema + provenance) |
| `plan-pages.ts` | 순수 결정적 계획: pageId, 순서, sampling |
| `observe-selected-pages.ts` | 오케스트레이션 (pool, failure isolation, 집계) |
| `store.ts` | site run 디렉터리 + manifest 저장 |

## Existing Observer 재사용 방식

§10이 이번 Task의 가장 중요한 구현 조건이었다. **collect-dom / style dedup / asset collector /
viewport logic / mobile profile 중 어느 것도 복제하지 않았다.**

재사용을 강제하기 위해 Observer에서 두 개의 primitive만 추출했다(동작 변경 0):

```ts
// src/observer/observe-page.ts
resolveViewportProfiles(browser)                   // 신규 export (기존 로직 그대로 이동)
observePageWithBrowser(browser, url, options)      // 관측 본체 — 브라우저를 주입받음
observePage(url, options)                          // launch → observePageWithBrowser → close
```

```ts
// src/observer/store.ts
saveObservationIntoDir(dir, observed)              // 페이지 1개를 "어떤 디렉터리에" 기록
saveObservation(observed, runId)                   // data/<host>/<run-id>/ 를 고르고 위임
```

즉 **"어디에 쓸 것인가"와 "무엇을 어떻게 관측/기록할 것인가"를 분리**했을 뿐이다.
`pnpm observe`는 `observePage()` → `saveObservation()` 경로를 그대로 쓰고,
`pnpm observe:site`는 `observePageWithBrowser()` → `saveObservationIntoDir()`를 쓴다.
두 경로가 만드는 페이지 artifact는 스키마도 파일 구성도 동일하다(schema v3).

이 구조 덕분에 Task 04/05의 품질 보장이 multi-page에서도 자동으로 유지된다. 저장 전 Zod 검증,
viewport별 독립 style table, dangling `styleId` 0 — 전부 Observer store 안에 있으므로
orchestration이 우회할 방법이 없다. (실측: 52 페이지 × 2 viewport 전수 검사에서 dangling 0)

**교차 검증.** site run에 포함된 URL 하나를 `pnpm observe`로 단독 재관측해 비교했다
(`https://seoworld.co.kr/services`):

| | site run (p000006) | `pnpm observe` |
| --- | --- | --- |
| element count (D/M) | 84 / 84 | 84 / 84 |
| document (D) | 1440×900 | 1440×900 |
| document (M) | 390×1347 | 390×1347 |
| unique styles | 43 | 43 |
| assets / links | 129 / 26 | 129 / 26 |
| run total | 0.69 MB | 0.69 MB |

두 경로가 같은 파이프라인을 쓴다는 것의 실증이다.

## Browser lifecycle

기존 `observePage()`는 URL마다 Chromium을 launch/close했다. §11은 "무조건 리팩터링하지 말고 실제
launch overhead를 확인하라"고 요구했으므로, 리팩터링 후 **실측**했다.

로컬 3페이지(각 desktop+mobile), 2회 측정:

| | run 1 | run 2 |
| --- | --- | --- |
| launch-per-page | 11.63s | 11.70s |
| shared browser | 11.31s | 11.52s |
| Chromium launch 1회 | 0.09s | 0.08s |
| 절감 | 0.33s (2.8%) | 0.18s (1.5%) |
| 페이지당 절감 | 0.11s | 0.06s |

**결론: 효과는 작다.** Chromium launch는 이 머신에서 80~90ms이고, 페이지 1개 관측이 6~20초이므로
비중이 1% 안팎이다. 실사이트 52페이지 기준으로도 3~6초 수준.

그럼에도 shared browser를 채택한 이유는 성능이 아니라 구조다. (1) 프로세스 1개가 사이트 run의
자연스러운 경계이고, (2) `observePageWithBrowser`는 fixture 테스트가 브라우저를 주입할 수 있게
해 주며(smoke test가 실제로 이 경로를 씀), (3) 리팩터링 규모가 함수 1개 분리로 끝나 §11이 경계한
"지나치게 큰 리팩터링"에 해당하지 않았다. 성능 이득은 사실대로 "미미함"으로 기록한다.

## Context isolation

Task 05 Observer는 이미 **viewport마다 fresh `BrowserContext`**를 만든다. 이 정책을 그대로 유지했고
multi-page 레이어는 context를 하나도 직접 만들지 않는다. 결과 구조:

```
Chromium process (site run 1개)
 ├─ page A · desktop context  → 관측 → close
 ├─ page A · mobile  context  → 관측 → close
 ├─ page B · desktop context  → 관측 → close
 └─ …
```

따라서 페이지 A의 cookie / localStorage / sessionStorage가 페이지 B에 영향을 줄 수 없다. 이는
Task 06 Verifier가 후보마다 fresh context를 쓰는 정책과 같은 이유다 — 방문 순서가 결과를 바꾸면
결정성이 무너진다.

## Concurrency

기본값 **2**, 허용 범위 **1–4** (`--concurrency`). Verifier의 기본값 3보다 낮다: verification은
페이지를 1회 로드해 신호 몇 개만 읽지만, 여기서는 페이지마다 desktop + mobile 전체 deep observation과
full-page 스크린샷 2장을 만든다. concurrency 2는 한 호스트에 대해 최대 2개의 Chromium context가
동시에 렌더링한다는 뜻이고, 이 단계가 라이브 사이트에 걸어도 되는 부하의 상한으로 판단했다.

Pool 구현은 Verifier와 동일한 형태(고정 runner + 단일 커서)로 단순하게 유지했다. 실측 speedup:

| site | 페이지 시간 합 | 실제 wall time | speedup |
| --- | --- | --- | --- |
| domainchecker | 77.6s | 39.0s | 1.99× |
| seoworld | 145.9s | 74.5s | 1.96× |
| nextjs.org | 187.2s | 94.1s | 1.99× |
| MDN | 110.6s | 57.5s | 1.92× |
| **합계** | **521.4s** | **265.2s** | **1.97×** |

concurrency 2에서 거의 선형(1.97×)이다. 병목이 CPU가 아니라 네트워크/렌더 대기라는 뜻이므로 4까지
올리면 더 빨라질 여지는 있지만, 라이브 사이트 부하 정책상 기본값은 2로 둔다.

## Site run schema

신규 Zod schema (`schemaVersion: 1`):

```
SiteObservation
├─ rootUrl / sourceSelectedPagesFile / sourcePageFamiliesFile?
├─ startedAt / completedAt / status            completed | completed-with-errors
├─ config      concurrency · prepareScroll · viewportProfiles · sample 정책
├─ observationProfile                          locale/timezone/colorScheme/reducedMotion
├─ selection   Task 07/08 수치 그대로 복사
├─ coverage    familyCount · observedRepresentativeCount · representedVerifiedUrlCount
│              validationSampleCount · totalObservedPageCount
│              fullObservationPageCount · observationReductionCount/Rate
├─ stats       페이지 수 · viewport 수 · desktop/mobile/screenshot/json+html bytes
│              pageBytes · siteObservationJsonBytes · totalBytes · avg · totalElapsedMs
├─ pages[]     ObservedSitePage — pageId 정렬
└─ validationSamples[]  familyId 정렬
```

`ObservedSitePage`에는 **DOM 데이터를 embed하지 않는다.** 페이지당 들어가는 것은 provenance
(`familyId` / `familyType` / `familyMemberCount`), status, 타임스탬프 3종,
상대경로 `pageObservationFile`, 그리고 Observer가 이미 계산해 둔 작은 `responsiveSummary`
(element/visible/document/style/asset/link 카운트)뿐이다. smoke test가
`"styleId"` / `"boundingBox"` 문자열이 manifest에 등장하지 않는지 실제로 검사한다.

`stats.siteObservationJsonBytes` / `totalBytes`는 자기 자신을 포함하는 값이라 Task 05 store와 같은
fixpoint 반복으로 수렴시킨다. 실측 결과 4개 run 전부 **manifest 기록값 == 실제 디스크 사용량
(delta 0 B)**.

## Storage 구조

Deep Observation 데이터를 discovery run 디렉터리에 섞지 않는다(§7). 별도 네임스페이스를 만들었다:

```
data/<host>/site-observations/<run-id>/
  site-observation.json
  pages/
    p000001/
      observation.json          ← Task 05 단일 페이지 구조 그대로
      viewports/
        desktop/  rendered.html dom.json styles.json assets.json links.json frames.json screenshot.png
        mobile/   rendered.html dom.json styles.json assets.json links.json frames.json screenshot.png
    p000002/
    …
```

- 기존 `data/<host>/<run-id>/`(discovery+verification+selection)와 충돌하지 않는다. 실행 후 확인:
  4개 소스 run 디렉터리의 파일 mtime이 Task 08 시점 그대로다.
- manifest의 경로는 전부 상대경로(`pages/p000003/observation.json`)다. smoke test가 절대경로
  (`/Users/…`, temp dir)가 artifact에 들어가지 않는지 검사한다. (§33)

## Page ID 결정성

URL pathname을 디렉터리명으로 쓰지 않는다. `/`, 중첩, query, 퍼센트 인코딩, 길이 제한,
macOS/Windows의 대소문자 폴딩 충돌이 전부 문제가 된다. 대신 불투명 id를 쓰고 manifest가
`pageId ↔ url`을 들고 있다.

배정 규칙은 **두 블록**이다.

```
representatives    URL 사전순 정렬 후  p000001 … p00000N
validation samples familyId 순으로     p00000N+1 …
```

- 정렬을 먼저 하므로 `selected-pages.json`의 배열 순서가 바뀌어도 id가 그대로다.
  (smoke test: `pages[]`/`unselected[]`를 뒤집어도 plan JSON이 완전히 동일)
- sample을 뒤 블록에 두므로 **sampling을 끄거나 cap을 바꿔도 representative의 id가 재번호되지
  않는다.** 두 run의 production 페이지를 그대로 비교할 수 있다. (smoke test로 검증)
- 비교는 `localeCompare`가 아니라 바이트 비교다 — locale/ICU 버전에 결정성을 의존시키지 않는다.
- 저장 전 invariant: id 중복 0, URL 중복 0, id가 빈틈없는 연속열. 위반 시 run 자체를 중단한다.

실행 순서(task queue)도 pageId 순이고, 저장 순서도 pageId 순이다. 완료 순서만 concurrency 때문에
달라진다(§43). 실제 로그에서 `[3/6] p000004` 다음에 `[4/6] p000003`이 찍히지만 manifest는 항상
정렬되어 있다.

## Failure isolation

페이지 단위 실패와 시스템 invariant 실패를 구분한다.

**페이지 실패 → 기록하고 계속.** run status는 `completed-with-errors`가 되고 성공한 페이지의
artifact는 전부 보존된다. status taxonomy는 4개로 제한했다(§14):

| status | 의미 |
| --- | --- |
| `success` | 두 viewport 관측 + 저장 완료 |
| `navigation-error` | Chromium이 URL을 못 열었다 (사이트/네트워크 사실) |
| `observation-error` | 로드는 됐는데 관측이 실패했다 |
| `storage-error` | 관측은 됐는데 저장이 실패했다 |

핵심 구분은 "사이트가 페이지를 안 준 것"과 "우리 파이프라인이 깨진 것"이다. 후자만 이 엔진의 버그다.
분류는 Playwright가 실제로 내는 시그니처(`net::ERR_*`, `page.goto` timeout, `NS_ERROR_` 등)로 하고,
매칭되지 않으면 `observation-error`로 둔다 — 애매한 실패를 네트워크 탓으로 관대하게 넘기지 않는다.
원본 `name`/`message`를 항상 같이 저장하므로 오분류가 있으면 눈에 보인다.

**시스템 invariant 실패 → run 중단.** 입력 schema 불일치, provenance 모순, pageId 충돌은
브라우저를 켜기 전에 throw한다.

에러 저장은 최소한이다(§15): `{ name, message(첫 줄, 300자 컷), phase }`. **stack trace를 저장하지
않는다.** 관측은 cookie / auth header / API key를 전혀 보내지 않으므로 메시지에 자격증명이 들어갈
경로가 없고, 구조를 이렇게 고정해 두는 것이 나중에 조용히 바뀌는 것을 막는 방법이다.

## Representative provenance

모든 observed page는 Selector provenance를 반드시 들고 있다(스키마상 optional이 아니다).

```json
{
  "pageId": "p000004",
  "url": "https://domainchecker.co.kr/blog/what-is-trust-flow",
  "role": "representative",
  "familyId": "f000003",
  "familyType": "sibling-pattern",
  "familyMemberCount": 11
}
```

이 한 줄로 "이 관측 1개가 11개 URL을 대표했다"를 나중에 답할 수 있다.
`coverage.representedVerifiedUrlCount`는 **성공한** representative의 `familyMemberCount` 합이다 —
실패한 representative는 디스크에 아무것도 없으므로 커버리지로 주장하지 않는다.

## Validation sample 정책

§22의 목적은 "family 대표 1개만 관측한다"는 가정이 타당한지 **실데이터로** 처음 확인하는 것이다.
비대표 멤버를 전부 관측하면 Selector의 절감이 사라지므로 규칙을 좁게 고정했다.

1. `memberCount >= 3` 인 family만 (singleton은 다른 멤버가 없고, 2개짜리는 대표가 틀려도 영향이 1개)
2. 사이트당 최대 **3** family — 큰 family 우선, 동률은 `familyId` 순
3. 각 family에서 1개: 멤버를 사전순 정렬했을 때 **대표 다음 URL** (대표가 마지막이면 첫 번째로 wrap)

큰 family 우선을 택한 이유는 대표가 틀렸을 때 손실이 가장 큰 곳이기 때문이고, 데이터에서 나오는
규칙이라 호스트별 분기가 필요 없다. 결과적으로 Task 08이 애매하다고 기록했던 nextjs docs family
(9 members)와 MDN Web/API family (9 members)가 자동으로 샘플에 포함됐다 — hostname 조건문 없이(§27).

실제 비용: 41 representatives + **11 samples** = 52 관측. 사이트당 상한 3이 domainchecker에서는
2로 나왔는데(자격 family가 2개뿐), cap이 아니라 데이터가 정한 결과다.

## Validation comparison

Observation에 이미 있는 결정적 수치만 비교한다(§25). 새 측정도, 스크린샷 비교도, AI도 없다.

- 비율(`sample / representative`): elementCount, effectiveVisible, uniqueStyle, documentHeight
- 차이(`sample − representative`): assetCount, linkCount, documentWidth

비율은 방향을 보존한다 — "샘플이 2배"와 "절반"은 다른 발견이다. asset/link처럼 작은 수는 비율이
노이즈가 되므로 부호 있는 차이로 낸다.

**verdict를 만들지 않는다.** `representative: true/false` 같은 판정은 이번 Task에서 자동 선언하지
않는다(§26). 측정값만 저장하고, 해석은 아래 "Family 대표성 검수 결과"에서 사람이 한다.

## Fixture 테스트

`pnpm smoke:multi-observer` — **58/58 PASS**. 두 부분으로 나눴다.

**1. 순수 계획 (브라우저·네트워크 없음, 14 checks)**
pageId 연속성, URL 사전순 배정, 입력 순서 뒤집기 결정성, sample이 대표 다음 URL인지, singleton 제외,
`memberCount < 3` 제외, **cap 3 동작**(자격 family 5개 → sample 3개 + skipped 2 기록),
큰 family 우선, sampling을 꺼도 representative가 재번호되지 않음.

**2. 입력 검증 (12 checks)**
schemaVersion 불일치, `selectedCount != pages.length`, familyId/URL 중복, unselected가 없는 family를
가리킴, 잘못된 representativeUrl 주장, `verifiedUrlCount` 불일치, `memberCount` 불일치, 빈 selection,
그리고 **다른 사이트의 sibling `page-families.json`이 있을 때 fail-fast**.
sibling이 아예 없으면 `skippedChecks`로 보고하고 진행한다(치명적이지 않음).

**3. 실제 오케스트레이션 (로컬 HTTP 서버 + 실제 Chromium, 32 checks)**

fixture 사이트: `/`, `/a`, `/a2`, `/a3`(한 템플릿, 본문 길이만 다름), `/b`, `/server-error`(HTTP 500),
`/error`(소켓 강제 종료 → 진짜 navigation failure).
selection: 5 representatives + family A(3 members) → sample 1개 = **6 관측**.

검증된 것:
- **5 success / 1 failure, run은 살아남는다** (`completed-with-errors`)
- 실패는 `/error` 하나이고 `navigation-error`로 분류, phase=`observe`, stack trace 없음,
  artifact 참조 없음
- **HTTP 500 페이지는 정상 관측된다** — §36이 확인하라고 한 현재 동작. Deep Observer는 HTTP status를
  모른다(`page.goto`는 500에서 throw하지 않음). 따라서 실패 fixture는 navigation error로 만들었다.
  이 동작은 버그가 아니라 문서화된 사실로 기록한다.
- manifest가 pageId 정렬, 완료 순서와 무관
- 성공 페이지 전부 두 viewport × 7파일 존재 + **dangling styleId 0** (multi-page 경로로 재검증)
- 상대경로만 저장, schema v3 유지
- sample이 `/a`↔`/a2` 쌍, role 구분, 비교값이 유한하고 verdict 필드가 없음,
  `/a2`가 실제로 더 크므로 elementCountRatio > 1
- coverage 산술(실패한 representative는 커버리지에서 제외), byte 합계 정합,
  페이지별 타임스탬프가 서로 다름
- `site-observation.json` Zod 재검증, 자기 크기 기록 정확, DOM 데이터 미포함, 절대경로 미포함

기존 회귀: `pnpm smoke:verifier` **81/81**, `pnpm smoke:selector` **81/81**, `pnpm typecheck` PASS.

## domainchecker 결과

`pnpm observe:site data/domainchecker.co.kr/2026-08-13T07-51-15-559Z/selected-pages.json --concurrency 2`

19 verified → 4 families → 4 representatives + 2 samples = **6 관측, 실패 0, 39.0s, 57.67 MB**

| pageId | role | family | n | el (D/M) | doc height (D/M) | MB |
| --- | --- | --- | --- | --- | --- | --- |
| p000001 | rep | f000001 | 1 | 752/752 | 8,939 / 13,977 | 6.85 |
| p000002 | rep | f000002 | 1 | 724/724 | 7,940 / 14,897 | 8.62 |
| p000003 | rep | f000004 | 6 | 521/521 | 13,220 / 16,606 | 10.70 |
| p000004 | rep | f000003 | 11 | 485/485 | 13,365 / 17,499 | 11.90 |
| p000005 | sample | f000003 | 11 | 429/429 | 10,788 / 14,432 | 10.03 |
| p000006 | sample | f000004 | 6 | 418/418 | 9,545 / 13,648 | 9.56 |

루트(`/`), 최대 family 대표(`/blog/what-is-trust-flow`, 11 members), singleton(`/blog`),
validation sample을 스크린샷까지 직접 확인했다 — desktop/mobile 모두 폰트·한글 텍스트·레이아웃이
정상 렌더링됐다.

## seoworld 결과

30 verified → 16 families → 16 representatives + 3 samples = **19 관측, 실패 0, 74.5s, 68.03 MB**

가장 큰 발견은 성능이 아니라 **콘텐츠**다. 4개 페이지가 정확히 같은 값을 보인다:

| url | elements | doc height (D/M) | MB |
| --- | --- | --- | --- |
| `/domains` | 71 | 900 / 844 | 0.54 |
| `/domains/auction` | 71 | 900 / 844 | 0.54 |
| `/tools/domain-checker` | 71 | 900 / 844 | 0.56 |
| `/domains/compare` (sample) | 71 | 900 / 844 | 0.53 |

스크린샷을 열어 확인한 결과 이 페이지들은 **헤더 + 제목 + 푸터만 있고 본문 영역이 비어 있다.**
콘텐츠가 사용자 입력/클라이언트 렌더링 이후에만 생기는 툴 페이지이기 때문이다.

이것은 Task 09의 버그가 아니라 **정적 관측의 경계**다. 다만 결과 해석에 직접 영향을 준다 —
아래 대표성 검수의 f000005(1.00×)를 참조.

## nextjs 결과

40 verified → 12 families → 12 representatives + 3 samples = **15 관측, 실패 0, 94.1s, 149.81 MB**

가장 무거운 사이트다. `/docs/app/api-reference/functions/generate-metadata` 한 페이지가
8,790 elements / 1,298 unique styles / **21.71 MB**로 단일 페이지 최대치를 기록했다.

특이사항: docs 페이지들에서 mobile element count가 desktop보다 정확히 **1 작다**(3283/3282,
4008/4007 등). 실제 반응형 차이이며 Task 05 정책대로 정규화하지 않고 viewport별로 보존했다.

## MDN 결과

23 verified → 9 families → 9 representatives + 3 samples = **12 관측, 실패 0, 57.5s, 75.34 MB**

Task 08의 대표 성과였던 `Temporal/PlainDateTime/*` family(f000009, 3 members)가 샘플에 포함됐고,
대표 848 elements vs 샘플 851 elements = **1.00×**로 확인됐다. Task 08이 exact hash로는 못 묶고
coarse profile로 묶었던 판단이 Deep Observation 수준에서도 옳았다는 첫 실증이다.

## Task08 selection → actual Deep Observation 절감률

§50 핵심 표.

| site | verified | families | reps | samples | 총 관측 | 성공 | 실패 | full-observe 대비 | run time | 저장 MB | screenshot MB | avg MB/page | 최대 family |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| domainchecker.co.kr | 19 | 4 | 4 | 2 | 6 | 6 | 0 | **68.4%** | 39.0s | 57.67 | 42.90 | 9.61 | 11 |
| seoworld.co.kr | 30 | 16 | 16 | 3 | 19 | 19 | 0 | **36.7%** | 74.5s | 68.03 | 47.26 | 3.58 | 9 |
| nextjs.org | 40 | 12 | 12 | 3 | 15 | 15 | 0 | **62.5%** | 94.1s | 149.81 | 40.78 | 9.99 | 9 |
| developer.mozilla.org | 23 | 9 | 9 | 3 | 12 | 12 | 0 | **47.8%** | 57.5s | 75.34 | 29.25 | 6.28 | 9 |
| **합계** | **112** | **41** | **41** | **11** | **52** | **52** | **0** | **53.6%** | **265.2s** | **350.86** | **160.19** | **6.75** | |

두 개의 절감률을 구분해서 봐야 한다.

```
representatives만    112 → 41   63.4%   (Task 08이 보고한 selection 절감률)
validation 포함      112 → 52   53.6%   (Task 09가 실제로 지불한 비용)
```

validation sampling이 절감률을 63.4% → 53.6%로 되돌린다. 이는 숨길 값이 아니라 **이번 Task가 산
정보의 가격**이다. cap이 3으로 고정되어 있으므로 사이트가 커질수록 이 비용의 비중은 줄어든다
(nextjs: 12 대표에 3 샘플 = +25%, 만약 대표가 40개면 +7.5%).

## Storage 결과

측정된 실제 값(manifest 기록값 == 디스크 실사용량, 4개 run 전부 delta 0 B):

| site | desktop | mobile | screenshot | JSON+HTML | 총계 | avg/page |
| --- | --- | --- | --- | --- | --- | --- |
| domainchecker | 18.71 | 38.91 | 42.90 (74.4%) | 14.76 | 57.67 | 9.61 |
| seoworld | 22.89 | 44.98 | 47.26 (69.5%) | 20.75 | 68.03 | 3.58 |
| nextjs.org | 78.50 | 71.19 | 40.78 (27.2%) | 109.01 | 149.81 | 9.99 |
| MDN | 34.82 | 40.40 | 29.25 (38.8%) | 46.07 | 75.34 | 6.28 |
| **합계** | **154.91** | **195.48** | **160.19 (45.7%)** | **190.59** | **350.86** | **6.75** |

두 가지가 눈에 띈다.

**1. mobile이 desktop보다 크다 (한국 사이트에서 2배).** mobile 프로필은 DPR 3이므로 full-page
스크린샷 픽셀 수가 desktop의 9배 스케일이다. 실제 파일: domainchecker 루트 desktop
1440×8,939(880 KB) vs mobile 1170×41,931(2.5 MB). 콘텐츠가 많고 DOM이 큰 nextjs에서는 JSON이
지배적이라 이 비가 0.91×로 역전된다.

**2. 스크린샷 비중이 사이트마다 27~74%로 크게 다르다.** DOM이 작고 페이지가 긴 사이트일수록
스크린샷이 지배한다. §28에 따라 이번 Task에서는 PNG 원본을 그대로 유지했고(Visual QA baseline이
필요할 수 있음), 대신 정확한 값을 측정했다. 압축 정책을 논의할 근거가 이제 있다.

**절감 효과를 저장 용량으로 환산**(측정된 사이트별 avg/page × verified URL 수):

| site | 전량 관측 추정 | 실제 | 절감 |
| --- | --- | --- | --- |
| domainchecker | 182.6 MB | 57.7 MB | −68.4% |
| seoworld | 107.4 MB | 68.0 MB | −36.6% |
| nextjs.org | 399.4 MB | 149.8 MB | −62.5% |
| MDN | 144.4 MB | 75.3 MB | −47.8% |
| **합계** | **833.8 MB** | **350.9 MB** | **−57.9%** |

주의: 이 추정은 관측된 부분집합의 평균을 전체에 적용한 것이다. 대표는 index 페이지 쪽으로 치우칠 수
있으므로 정확한 값이 아니라 **자릿수 참고치**로 읽어야 한다.

## Performance 결과

- 전체: 52 deep observations = **104 viewport 렌더 + 104 full-page 스크린샷**을 265.2s에 완료
- 페이지당 wall time: seoworld 7.7s ~ domainchecker 12.9s (사이트/페이지 크기에 비례)
- 최장 단일 페이지: nextjs `/blog/next-6` 20.8s, `generate-metadata` 18.4s
- concurrency 2 speedup 1.97× (거의 선형)
- browser reuse 절감: 페이지당 0.06~0.11s (전체의 1~3%)

## Failed page가 있다면 상세

**실사이트 4곳 52 페이지에서 실패 0건.** navigation timeout도, HTTP 오류도, storage 오류도 없었다.

이는 Task 06 Verification이 앞단에서 이미 걸러 준 결과로 보인다 — 이 단계에 들어오는 URL은 모두
"실제로 열리는 same-site HTML"임이 확인된 것들이다.

실패 경로 자체는 fixture(`/error`, 소켓 강제 종료)로 검증했다: 1개 실패 + 5개 성공이 정상
보존되고 run이 `completed-with-errors`로 끝난다. §19에 따라 **retry는 넣지 않았다** — 첫 실행에서
실제 안정성을 측정해야 하므로 실패를 감추지 않는다. 실측 실패율 0%이므로 지금 retry를 넣을 근거도
없다.

## Family 대표성 검수 결과

§41이 요구한 검수. **§51 validation comparison 표** (비율 = sample/representative):

| site | familyId | type | n | 대표 → 샘플 | D: el | D: vis | D: style | D: height | D: asset | D: link | M: el | M: vis | M: style | M: height |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| domainchecker | f000003 | sibling | 11 | `what-is-trust-flow` → `check-domain-availability` | 0.89 | 0.87 | 0.88 | 0.81 | −3 | +1 | 0.89 | 0.87 | 0.87 | 0.82 |
| domainchecker | f000004 | sibling | 6 | `tf-cf-difference` → `competitor-domain-analysis-free-17` | 0.80 | 0.78 | 0.89 | 0.72 | −3 | −5 | 0.80 | 0.77 | 0.84 | 0.82 |
| seoworld | f000003 | sibling | 9 | `what-is-seo` → `how-404-errors-affect-seo` | 0.96 | 0.96 | 1.06 | 1.01 | 0 | −1 | 0.96 | 0.96 | 1.04 | 1.02 |
| seoworld | f000005 | sibling | 3 | `domains/auction` → `domains/compare` | 1.00 | 1.00 | 1.00 | 1.00 | 0 | 0 | 1.00 | 1.00 | 1.00 | 1.00 |
| seoworld | f000008 | sibling | 3 | `services/traffic` → `services/web-design` | 1.01 | 1.01 | 1.00 | 1.03 | 0 | 0 | 1.01 | 1.01 | 1.00 | 1.02 |
| nextjs | f000002 | sibling | 5 | `blog/next-6` → `blog/next-11` | 1.35 | 1.45 | 1.10 | 1.13 | −12 | +1 | 1.35 | 1.52 | 1.11 | 1.46 |
| nextjs | **f000005** | scope | 9 | `app/guides/debugging` → `app/guides/migrating/from-create-react-app` | **1.39** | **2.04** | 1.09 | **2.42** | **+79** | **+73** | 1.39 | **2.87** | 1.29 | 2.25 |
| nextjs | f000009 | scope | 5 | `pages/getting-started/fonts` → `pages/guides/upgrading/version-14` | 0.85 | 0.79 | 0.98 | 0.52 | −6 | −6 | 0.85 | 0.44 | 0.95 | 0.58 |
| MDN | **f000003** | scope | 9 | `API/Document/elementsFromPoint` → `API/HTMLDialogElement/showModal` | 0.74 | 0.68 | 0.89 | 1.14 | −3 | **−80** | 0.74 | 1.09 | 1.00 | 1.15 |
| MDN | f000008 | sibling | 3 | `Errors/Arguments_not_allowed` → `Errors/Cant_delete_private_fields` | 0.99 | 0.99 | 0.99 | 0.74 | 0 | −1 | 0.99 | 0.95 | 0.98 | 0.78 |
| MDN | f000009 | sibling | 3 | `Temporal/PlainDateTime/inLeapYear` → `…/microsecond` | 1.00 | 1.01 | 1.01 | 0.98 | 0 | 0 | 1.00 | 1.01 | 1.00 | 0.99 |

**대체로 잘 맞았다.** 11쌍 중 7쌍이 element 비율 0.85~1.01 범위이고, `sibling-pattern` family
6쌍은 전부 0.80~1.35 안에 들어온다. Task 08의 대표 사례였던 MDN Temporal은 1.00×, seoworld
`/services/*`는 1.01×로 사실상 동일 구조다.

**숨기지 않고 기록할 3건:**

**(1) nextjs f000005 — family가 넓다.** `scope-structure`, 9 members. 샘플이 대표보다 element
1.39배, effectiveVisible 2.04배, document height **2.42배**, asset +79, link +73이다.
`/docs/app/guides/debugging`(짧은 가이드)와 `/docs/app/guides/migrating/from-create-react-app`(긴
마이그레이션 문서)는 같은 docs 셸을 쓰지만 본문 규모가 크게 다르다. Task 08이 "판단이 갈릴 수 있는
2건" 중 하나로 이미 기록했던 그룹이며, Deep Observation 수준에서 그 우려가 실측으로 확인됐다.
element 비율 1.39는 Task 08의 `MAX_ELEMENT_COUNT_RATIO = 2.0` 안이므로 규칙 위반은 아니다 —
**규칙이 통과시킨 범위 안에서 실제 콘텐츠 차이가 크다**는 뜻이다.

**(2) MDN f000003 — link −80.** `scope-structure`, 9 members. element 0.74배는 무난하지만
링크가 80개 적다. MDN API 레퍼런스의 사이드바/관련 항목 분량이 페이지마다 다르기 때문으로 보인다.
mobile에서는 effectiveVisible이 1.09배로 desktop(0.68배)과 방향이 반대인데, 반응형에서 접히는
영역이 달라서 생긴 차이로 읽힌다.

**(3) seoworld f000005 — 1.00×가 "완벽한 대표"를 의미하지 않는다.** 대표 `/domains/auction`과
샘플 `/domains/compare`는 모든 지표가 정확히 1.00×다. 그런데 위 seoworld 절에서 확인했듯 두 페이지
모두 **본문이 비어 있는 71-element 셸**이다. 즉 이 1.00×는 "대표가 잘 대표한다"가 아니라
"둘 다 똑같이 비어 있다"에 가깝다. **비율 지표만으로 대표성을 판정하면 안 된다**는 반례이고,
이번 Task가 verdict를 자동 선언하지 않기로 한 결정(§26)을 뒷받침한다.

§41에 따라 **Task 08 family algorithm은 수정하지 않았다.** 위 3건은 근거로 기록만 하고
E2E tuning backlog로 넘긴다.

## Live-site drift 관련 관찰

이 run은 사이트의 원자적 스냅샷이 **아니다**. 페이지들은 서로 다른 시각에 관측된다.

| site | 첫 페이지 시작 ~ 마지막 페이지 시작 |
| --- | --- |
| domainchecker | 27.0s |
| seoworld | 67.5s |
| nextjs.org | 82.7s |
| MDN | 49.7s |

Task 08에서 같은 URL 재방문 시 HTML이 바뀌는 사례가 이미 확인됐으므로, 이 시간 창 안에서 사이트가
바뀌면 페이지들은 서로 다른 상태를 담게 된다. 그래서:

- 각 페이지가 자기 `startedAt` / `completedAt` / `elapsedMs`를 개별 보존한다
- manifest는 run 전체의 `startedAt` / `completedAt`만 주장하고, 그것이 스냅샷이라고 말하지 않는다
- Observer가 페이지마다 기록하는 `metadata.timestamp` / `environment.timestamp`도 그대로 남는다
- smoke test가 "성공 페이지들의 `startedAt`이 서로 다르다"를 실제로 검사한다

concurrency를 올리면 창이 좁아지지만 0이 될 수는 없다. 이 한계는 제거 대상이 아니라 기록 대상이다.

## 발생한 문제

**1. HTTP 500을 실패로 만들 수 없었다.** §36의 `/error` fixture를 500으로 만들면 Playwright의
`page.goto`가 throw하지 않아 그대로 관측에 성공한다 — Deep Observer는 HTTP status를 모른다.
→ 500 페이지(`/server-error`)는 "정상 관측된다"는 현재 동작을 검증하는 케이스로 남기고, 실패
fixture는 소켓 강제 종료(`req.socket.destroy()`)로 진짜 navigation failure를 만들었다.

**2. 전체를 메모리에 모을 수 없다.** 처음에는 "전부 관측 → 한꺼번에 저장" 구조를 고려했지만
nextjs 15페이지 × 최대 21.7 MB면 메모리에 수백 MB를 들고 있어야 한다.
→ 페이지 단위로 관측 즉시 저장하고 메모리를 놓아주는 스트리밍 구조로 만들었다. manifest에는
`responsiveSummary`처럼 작은 요약만 남긴다.

**3. TypeScript never-narrowing.** 검증 헬퍼를 `const where = (msg): never => …`로 쓰면 TS가
호출 이후를 좁혀 주지 않아 `family`가 `undefined` 가능으로 남았다.
→ 변수 자체에 타입을 붙여(`const where: (msg: string) => never = …`) 해결.

**4. mobile 저장량이 예상 밖으로 컸다.** 한국 사이트 2곳에서 mobile이 desktop의 2배였다.
원인은 DPR 3 full-page 스크린샷(1170×41,931 같은 이미지)이다. 버그가 아니라 Task 05 프로필의 결과이며,
스크린샷 압축 정책 논의의 근거로 기록한다.

## 기술적 결정

**1. Observer를 리팩터링하되 최소로.** `observePageWithBrowser` / `saveObservationIntoDir` 두 개만
추출했다. "관측 로직 1개"라는 §10 조건을 코드 구조로 강제하는 최소 변경이다.
`pnpm observe`의 동작은 완전히 동일하다.

**2. 별도 run 네임스페이스.** `data/<host>/site-observations/<run-id>/`. discovery run은 작고 자주
재실행되는 JSON이고 site observation run은 수십~수백 MB다. 섞으면 둘 다 다루기 나빠진다.

**3. pageId를 2블록으로.** representative 블록과 sample 블록을 분리해서, sampling 정책이 바뀌어도
production 페이지 id가 흔들리지 않게 했다.

**4. family 멤버십을 `selected-pages.json`만으로 복원.** `unselected[]`가 각 URL의 familyId와
대표 URL을 들고 있으므로 `page-families.json` 없이도 샘플링이 가능하다. sibling 파일은 검증용으로만
쓰고 optional로 뒀다 — selection을 다른 곳에 복사해도 관측할 수 있어야 한다.

**5. status 4종.** 더 잘게 쪼갤 수 있었지만 의미 있는 구분은 "사이트 탓 / 우리 탓 / 저장 탓"뿐이다.
상세는 `error.name` / `error.message`가 담는다.

**6. verdict를 만들지 않음.** validation comparison은 숫자만 낸다. seoworld f000005의 1.00× 사례가
자동 판정이 왜 이르는지를 보여 준다.

**7. retry 없음, resume 없음, cache 없음.** §18/§19/§44 그대로. 실패율을 먼저 측정해야 한다
(실측 0%).

## 현재 한계

- **정적 관측의 경계.** seoworld 툴 페이지처럼 클라이언트 렌더링/사용자 입력 이후에만 콘텐츠가
  생기는 페이지는 빈 셸로 관측된다. Interaction 단계 이전에는 해결할 수 없다.
- **HTTP status를 모른다.** Observer는 200/500을 구분하지 않는다. 필요하면 Observer가
  `response.status()`를 기록하도록 확장해야 한다(이번 Task 범위 밖).
- **원자적 스냅샷이 아니다.** 위 drift 절 참조.
- **대표성 판정이 없다.** 비율만 있고 기준선이 없다. 어느 비율부터 "family가 너무 넓다"인지는
  더 많은 사이트 데이터가 필요하다.
- **validation sample이 사이트당 최대 3.** 통계가 아니라 표본이다. family 하나당 1개만 본다.
- **스크린샷 압축 정책 미정.** PNG 원본 유지로 전체의 45.7%를 쓰고 있다.
- **resume 없음.** 15페이지 run이 14번째에서 죽으면 처음부터 다시 해야 한다. 실측 실패율 0%라
  아직 필요성이 확인되지 않았다.
- **avg MB/page 기반 추정의 편향.** "전량 관측 시 833.8 MB" 추정은 관측된 부분집합의 평균을
  전체에 적용한 값이다.

## 다음 Task 추천

(추천만 하고 구현하지 않는다.)

### 1순위 — Interaction Candidate Detection (Phase 4)

이제 4개 사이트 52페이지의 desktop/mobile DOM·computed style·geometry가 디스크에 있다. seoworld
툴 페이지가 빈 셸로 관측된 것이 곧바로 근거가 된다 — **정적 관측만으로는 사이트를 재현할 수 없는
지점이 실데이터로 확인됐다.** 저장된 관측만으로(추가 크롤 없이) 동적 후보를 결정적으로 탐지하는
단계가 자연스럽다. ROADMAP Phase 4와도 일치한다.

### 2순위 — 스토리지 정책

스크린샷이 전체의 45.7%, 특히 DPR 3 mobile이 지배적이라는 실측이 나왔다. WebP/JPEG 전환 또는
mobile 스크린샷 스케일 조정의 손익을 지금 계산할 수 있다.

### 3순위 (선택)

- Observer에 HTTP status / response header 기록 추가
- validation sample 결과를 Task 08 threshold 재조정에 반영할지 판단 (더 많은 사이트 필요)
- resume / incremental refresh — 실패율이 실제로 올라가면

## 변경 파일

신규:

- `src/multi-observer/types.ts` — Zod schema 6종 + 정책 상수
- `src/multi-observer/load-selection.ts` — 입력 schema + provenance 검증 (fail-fast)
- `src/multi-observer/plan-pages.ts` — 결정적 pageId / 순서 / validation sampling (순수함수)
- `src/multi-observer/observe-selected-pages.ts` — 오케스트레이터
- `src/multi-observer/store.ts` — site run 디렉터리 + manifest 저장
- `src/multi-observer/index.ts` — barrel export
- `src/cli-observe-site.ts` — `pnpm observe:site`
- `scripts/smoke-multi-observer.ts` — fixture 테스트 58 checks
- `docs/result/09-multi-page-deep-observation-2026-08-13.md` (본 문서)

수정:

- `src/observer/observe-page.ts` — `observePageWithBrowser` / `resolveViewportProfiles` 추출,
  `observePage`는 launch/close 래퍼로 축소 (동작 동일)
- `src/observer/store.ts` — `saveObservationIntoDir` 추출, `saveObservation`은 디렉터리 선택만
- `src/observer/index.ts` — 신규 export 3개
- `package.json` — `observe:site`, `smoke:multi-observer` 스크립트
- `README.md` — 파이프라인/CLI/프로젝트 구조/Task 09 섹션
- `ROADMAP.md` — Task 09 완료 + 실측 결과 + 다음 단계

**`src/discovery/` · `src/verifier/` · `src/selector/` · `src/cli.ts` · `src/cli-observe.ts` ·
`src/cli-verify.ts` · `src/cli-select.ts` · `tsconfig.json`은 수정하지 않았다.**
Observer의 관측/수집 파일(`collect-dom.ts`, `dedupe-styles.ts`, `collect-links.ts`,
`collect-assets.ts`, `types.ts`)도 수정하지 않았다.

생성된 실행 산출물(gitignored `data/`):
`data/<host>/site-observations/<run-id>/` 4개 (총 350.86 MB). 기존 discovery/verification/selection
run 디렉터리는 **읽기만 했고 수정하지 않았다**(mtime 확인). **Firecrawl 호출 0, AI 호출 0.**

Git add / commit / push는 수행하지 않았다.

## 검수 포인트

- **Observer 재사용**: `src/multi-observer/`에 DOM/style/asset/viewport 수집 코드가 한 줄도 없는지.
  `observe-selected-pages.ts`가 `observePageWithBrowser`만 호출하는지.
  `pnpm observe`가 이전과 동일하게 동작하는지.
- **관측 품질 불변**: 52페이지 × 2 viewport 전수 검사에서 7개 파일 전부 존재, JSON parse PASS,
  Zod PASS, **dangling styleId 0**. multi-page가 Task 04/05 보장을 약화시키지 않았는지.
- **Firecrawl/AI 0**: `src/cli-observe-site.ts` import graph에 외부 패키지가 `playwright` / `zod` /
  node builtin뿐인지 (본문에 전체 그래프 기재). `config/env`조차 로드되지 않는다.
- **결정성**: `planSitePages`가 순수함수인지(시계·난수·네트워크 없음). 입력 배열을 뒤집어도 동일
  plan이 나오는지. manifest `pages[]`가 완료 순서가 아니라 pageId 순인지.
- **fail-fast**: 깨진 입력이 브라우저 실행 **전에** 거부되는지 (smoke test 12 케이스).
  sibling 파일이 있고 모순되면 실패하는지, 없으면 `skippedChecks`로 보고만 하는지.
- **failure isolation**: fixture에서 1개 실패가 5개 성공 artifact를 보존하는지.
  실패 페이지에 `pageObservationFile`이 없는지. stack trace가 저장되지 않는지.
- **coverage 정직성**: `representedVerifiedUrlCount`가 **성공한** representative만 세는지.
  절감률이 validation sample을 비용에 포함해 계산되는지 (63.4%가 아니라 53.6%).
- **경로 안전성**: manifest에 절대경로가 없는지. `pages/<id>/observation.json` 상대경로인지.
- **byte 정합**: manifest `stats.totalBytes` == 디스크 실사용량 (4개 run 전부 delta 0 B).
- **대표성 결과의 정직성**: nextjs f000005(height 2.42×), MDN f000003(link −80),
  seoworld f000005(둘 다 빈 셸이라 1.00×) 3건이 보고서에 그대로 기재되어 있는지.
  Task 08 알고리즘을 임의로 고치지 않았는지.
- **재현**: `pnpm typecheck`, `pnpm smoke:verifier` (81/81), `pnpm smoke:selector` (81/81),
  `pnpm smoke:multi-observer` (58/58), 그 뒤 4개 사이트에 대해
  `pnpm observe:site <selected-pages.json> --concurrency 2`.
- Secret / API key는 소스·CLI 출력·저장 JSON·본 문서 어디에도 기록하지 않았다.
