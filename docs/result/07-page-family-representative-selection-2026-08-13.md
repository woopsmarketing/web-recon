Task: 07
Title: Page Family & Representative Selection
Previous: 06-discovery-candidate-verification-2026-08-13.md
Status: Complete

---

# Task 07 — Page Family & Representative Selection

## 작업 목표

Task 06까지 오면 "실제로 존재하고 사용 가능한 URL 목록"(`verified-urls.json`)이 생긴다.
하지만 그 URL을 전부 Deep Observation하는 것은 낭비다. 블로그 글 20개가 사실상 하나의
템플릿이라면 1개만 관측해도 구조는 파악된다.

이번 Task의 목표는:

> **검증된 URL들을 deterministic한 신호만으로 Page Family 후보로 묶고, 각 Family에서
> Deep Observation용 대표 URL을 1개씩 선정하는 것**

이다. 그리고 그만큼 중요한 두 번째 목표가 있다(§39):

> **deterministic signal만으로 실제 사이트에서 page count를 얼마나 줄일 수 있는가를
> 정직하게 측정하는 것**

이번 Task에서 AI/LLM은 전혀 사용하지 않았고, Multi-page Deep Observation도 실행하지
않았다.

## Architecture

```
verified-urls.json  +  verification.json      ← Task 06 산출물 (유일한 입력)
→ Zod 재검증 + 같은 run에서 나온 pair인지 확인
→ Route Features (URL 문자열 연산만; 네트워크 없음)
→ 계층적 grouping
     0. Root 보호        (site root를 먼저 격리)
     1. content-duplicate (Task 06 textHash AND structureHash 동일)
     2. sibling-pattern   (같은 parent + 같은 depth + 같은 structureHash + ≥3)
     3. scope-structure   (같은 localePrefix + routeScope + structureHash + ≥2)
     4. singleton         (나머지 — 억지로 합치지 않음)
→ Family마다 대표 1개 (deterministic 우선순위 규칙)
→ Invariant 검사 (실패 시 저장 전에 throw)
→ page-families.json + selected-pages.json  (같은 run directory)
```

새 모듈 `src/selector/`를 추가했고 기존 `discovery` / `verifier` / `observer`는 **한 줄도
수정하지 않았다**.

- `types.ts` — Zod schema, 임계값 상수, terminal-segment 분류 규칙
- `route-features.ts` — path/locale/scope/parent/query/terminal feature 추출, root 판정
- `build-families.ts` — 계층적 grouping + hard invariant
- `select-representatives.ts` — 대표 선정 규칙 + `PageSelection` 조립
- `store.ts` — Task 06 pair 로드/검증, 산출물 저장
- `index.ts` — barrel export

CLI: `src/cli-select.ts` (`pnpm select`). Fixture test: `scripts/smoke-selector.ts`
(`pnpm smoke:selector`).

### Offline 보장 (0 crawling cost / 0 browser cost)

`pnpm select`는 Firecrawl을 호출하지 않고, Playwright를 실행하지 않고, 네트워크 요청을
전혀 하지 않는다. 이 성질을 "코드에서 그냥 안 부른다" 수준이 아니라 **import graph 수준에서**
보장했다.

처음 구현에서는 `../verifier/index.js` / `../discovery/index.js` barrel을 import했는데, 그
barrel들이 각각 Playwright와 Firecrawl SDK를 끌어온다. 실제 호출은 없었지만 "브라우저를
로드조차 하지 않는다"는 주장이 구조적으로 깨진 상태였다. leaf module(`verifier/types.js`,
`discovery/normalize-url.js`)에서 직접 import하도록 바꿔 해결했다.

`src/cli-select.ts`에서 시작한 static import graph 전체:

```
src/cli-select.ts, src/selector/{index,types,route-features,build-families,
select-representatives,store}.ts, src/verifier/types.ts,
src/discovery/{normalize-url,types}.ts
외부 패키지: node:fs/promises, node:path, zod   ← playwright / firecrawl 없음
```

부수 효과로 실행 시간이 사이트당 약 0.75s → **0.38–0.42s** 로 줄었다.

## Input / Output

입력(둘 다 Task 06 Zod schema로 재검증):

```bash
pnpm select data/<host>/<run-id>/verified-urls.json
```

`verification.json`은 기본적으로 **같은 run directory의 sibling**에서 찾는다. 필요하면
`--verification PATH`로 명시할 수 있지만 기본 사용법은 인자 1개로 유지했다.

두 입력이 **같은 run에서 나왔는지** 검사한다(`rootUrl` 일치, `sourceDiscoveryFile` 일치).
어제 verification에 오늘 verified-urls를 조합해 조용히 돌아가는 일이 없어야 한다.

출력은 **같은 run directory를 확장**한다(새 run-id를 만들지 않음):

```
data/<host>/<run-id>/
  discovery.raw.json
  discovery.json
  verification.json      ← 입력
  verified-urls.json     ← 입력
  page-families.json     ← 출력 (이번 Task)
  selected-pages.json    ← 출력 (이번 Task)
```

`sourceVerifiedUrlsFile` / `sourceVerificationFile`을 두 출력 모두에 기록해 provenance를
남긴다. 두 경로는 Task 06의 `sourceDiscoveryFile`과 마찬가지로 **호출자가 준 경로 형태**를
그대로 유지한다(초기 구현에서 하나는 상대경로, 하나는 절대경로로 기록되던 불일치를 수정).

## Route Feature 설계

각 verified URL에서 뽑는 deterministic feature(전부 문자열 연산):

| 필드 | 의미 |
| --- | --- |
| `pathname` / `pathSegments` / `pathDepth` | 경로 구조 (segment는 percent-decode) |
| `localePrefix?` | 첫 segment가 `xx` / `xx-YY` 형태일 때만 (metadata) |
| `routeScope?` | 첫 non-locale segment. site root면 undefined |
| `parentPath` | 부모 디렉토리 경로 (`/blog/post-a` → `/blog`) |
| `queryKeys` / `queryKeySignature` | 정렬된 unique query key. **값은 신호로 쓰지 않음** |
| `terminalSegment` / `terminalKind` | 마지막 segment와 그 "모양" |

`terminalKind`는 의미 추론이 아니라 **모양 분류**다:

```
root | numeric | uuid | date-like | hex-id | text
```

- `uuid` : 8-4-4-4-12 hex
- `date-like` : `YYYY-MM-DD` / `YYYY-MM` (숫자 판정보다 먼저; dash가 있어 겹치지 않음)
- `numeric` : 전부 숫자
- `hex-id` : hex 8자 이상 **이면서 숫자를 최소 1개 포함**(`overview` 같은 단어가 id로
  오분류되지 않게 하는 조건)
- `text` : 나머지 — 일반 slug는 여기 남는다

**일반 slug를 dynamic route라고 단정하지 않는다.** `/blog/post-a`가 dynamic route라는 주장은
문자열만으로는 할 수 없고, "같은 구조의 sibling이 반복된다"는 관측이 있어야 한다(§Sibling).

## Locale / Route Scope 처리

MDN처럼 `/en-US/docs/...` 형태가 있다. locale database는 만들지 않고 아주 단순한 패턴만 쓴다:

```
/^[a-z]{2}(-[A-Za-z]{2})?$/     →  xx  또는  xx-YY
```

중요한 제약을 지켰다:

- **locale 패턴이라는 이유로 URL의 의미를 삭제하지 않는다.** `pathSegments[0]`에 `en-US`는
  그대로 남고, `pathname` / `parentPath`도 그대로다. `localePrefix`는 **metadata일 뿐**이다.
- 유일한 효과는 `routeScope`를 한 segment 뒤에서 읽는다는 것뿐이다.

```
/en-US/docs/Web/HTML
  localePrefix = en-US
  routeScope   = docs
  parentPath   = /en-US/docs/Web
  pathDepth    = 4
```

MDN 실데이터 23개 URL 전부에서 `localePrefix=en-US`, `routeScope=docs`가 정확히 나왔다.

`localePrefix`는 scope-structure family key에도 **포함**시켰다. `/en-US/docs/x`와
`/ko/docs/y`가 같은 템플릿을 공유할 가능성은 높지만, 합쳐버리면 한 locale 전체가 관측에서
빠진다. 보수적인 쪽(합치지 않음)을 택하고 그 사실을 한계로 명시한다.

## Duplicate 처리

Task 06의 `duplicateGroups` 3종을 서로 다르게 취급했다.

### final-url

Task 06 `verified-urls.json`이 이미 final URL로 dedup했으므로 이 단계에서 추가로 할 일이
없다. 실제로 4개 사이트 모두 final-url 중복은 0이었다.

### content-fingerprint → collapse (유일하게 합치는 duplicate 신호)

`textHash` **와** `structureHash`가 **둘 다** 같은 그룹만 하나의 logical node로 collapse한다.
Task 06의 group은 candidate URL로 표현되어 있으므로 `sourceCandidateUrls`를 통해 verified URL로
매핑해서 소비한다. 그룹은 Task 06의 결정적 key 순서로 처리하고, 한 URL은 최대 한 번만
claim되므로 그룹이 겹쳐도 순서 의존성이 생기지 않는다.

**원본 URL은 절대 삭제하지 않는다.** 전부 family member(alias)로 보존되고,
`selected-pages.json`의 `unselected[]`에도 대표 URL과 함께 기록된다.

### canonical → 합치지 않는다

Canonical만 같다는 이유로는 **어떤 경우에도** 합치지 않는다. Task 06에서 canonical을 부정확하게
선언하는 실제 사례를 이미 발견했기 때문이다(§Canonical 안전성 검수). Canonical은:

- `canonicalHints` (family가 선언한 서로 다른 canonical URL 목록)
- `canonicalPointsElsewhereCount` (자기 자신이 아닌 곳을 가리키는 member 수)
- 대표 선정 우선순위를 **낮추는** 용도

로만 쓴다. canonical이 남을 가리킨다고 URL을 **제외하지는 않는다** — singleton이면 그 URL이
그대로 대표가 된다.

> 구현 중 수정한 점: 처음에는 `canonicalConflict: true`(서로 다른 canonical이 2개 이상)를
> 기록했는데, 서로 다른 페이지가 각자 self-canonical을 선언하는 정상 상황에서도 켜져서
> 오해를 유발했다(seoworld의 두 scope-structure family가 여기 걸렸다). 사실만 남기도록
> `canonicalPointsElsewhereCount`로 교체했다.

## Family grouping 순서

```
0. Root 보호
1. content-duplicate
2. sibling-pattern
3. scope-structure
4. singleton
```

**단순 union-find를 쓰지 않았다.** 모든 신호를 한 번에 연결하면 A—B는 content hash로,
B—C는 route scope로 이어지면서 사이트 전체가 하나의 거대한 component가 된다. 대신 각 URL은
**가장 강한 규칙에 먼저 claim되고 그 뒤로는 후보에서 빠진다.** 그래서 신호가 transitive하게
체이닝되지 않는다.

지배 원칙은 한 번만 정하고 모든 규칙에 동일하게 적용했다:

> **false merge가 missed merge보다 나쁘다.**

서로 다른 페이지 2개를 합치면 다음 단계는 하나만 관측하고 나머지를 **영구히 잃는다**. 반대로
안 합치면 관측 1회를 더 쓸 뿐이다. 그래서 모든 규칙은 **exact match**(byte-identical hash,
동일 scope 문자열)이고 similarity score나 threshold를 쓰지 않는다.

## Sibling Pattern 정책

조건(전부 만족해야 함):

- 같은 `parentPath`
- 같은 `pathDepth`
- **동일** `structureHash`
- member **3개 이상** (`MIN_SIBLING_FAMILY_SIZE = 3`)

2개는 우연이기 쉽다(`/legal/terms` + `/legal/privacy`). 3개 이상이 같은 구조로 반복되면
"이 parent가 반복 route를 렌더한다"가 더 단순한 설명이 된다.

이때 만드는 패턴은 이름부터 **관측 유도**임을 드러낸다:

```
inferredRoutePattern: "/blog/<*>"
```

`<*>`는 "우리가 관측한 변하는 segment"라는 뜻이지, 사이트 프레임워크가 실제로 그 자리에
dynamic segment를 선언했다는 주장이 아니다.

## Scope + Structure 정책

sibling 조건은 아니지만 `localePrefix` + `routeScope` + `structureHash`가 모두 같으면 같은
구조 family 후보로 본다(2개 이상).

`routeScope`를 key에 **반드시 포함**하는 것이 cross-section merge를 막는 장치다.
structureHash 하나만 같다고 사이트 전역에서 묶으면 `/pricing`과 `/about`처럼 전혀 다른
섹션의 페이지가 합쳐질 수 있다. Fixture에 이 케이스를 넣어 회귀 테스트로 고정했다.

## Singleton 정책

위 보수적 조건에 하나도 걸리지 않으면 singleton으로 둔다. **singleton이 많다고 억지로
합치지 않는다.** 이번 Task의 목적 중 하나가 "deterministic signal만으로 어디까지 가능한가"를
측정하는 것이므로, singleton 비율 자체가 결과다.

`--max-pages` 같은 임의 cap도 넣지 않았다(§29).

## Root URL 보호

site root는 **grouping 이전에 먼저 격리**해서 자기만의 family로 만든다(`rootProtected: true`).
대표 경쟁에서 밀려 selection에서 사라지는 실패 모드를 규칙 하나로 없앤다. 비용은 최대
관측 1회다.

root 판정은 두 가지를 인정한다:

1. host의 bare root (`pathname === "/"`, query 없음)
2. **run의 root URL 자체** — discovery run이 `https://developer.mozilla.org/en-US/`처럼
   path를 가진 root로 시작할 수 있고, 그 진입 페이지도 같은 보호를 받아야 한다
   (trailing slash 차이만 허용)

이 두 번째 케이스는 MDN 데이터를 보고 추가했다. 초기 구현은 `pathname === "/"`만 봤다.

root를 항상 격리하므로 `selectedCount === familyCount`가 **예외 없이** 성립한다(§26의
"Root 보호 정책 때문에 예외 구조가 생기면 명확히 설명한다"에 해당하는 예외가 없다).

## Representative selection rule

Family마다 정확히 1개. AI 없음. 고정 우선순위:

```
1. self-canonical 또는 canonical 없음   (남을 가리키는 페이지는 대표로 약하다)
2. query parameter 없는 URL             (/page > /page?v=2)
3. 더 얕은 path depth
4. 더 짧은 URL
5. lexical order                        (총 순서 ⇒ 입력 순서 무관)
```

1번은 **우선순위를 낮출 뿐 제외하지 않는다.** canonical이 남을 가리켜도 그 URL은 완전한
member이고, 혼자면 그대로 대표가 된다.

`selected-pages.json`의 각 항목에는 규칙을 추측해 적지 않고 **이긴 member의 실제 신호 값**을
사실대로 남긴다:

```json
{
  "url": "https://seoworld.co.kr/services/web-design",
  "familyId": "f000017",
  "familyType": "scope-structure",
  "memberCount": 2,
  "reason": "representative-rule",
  "reasonDetail": "members=2; canonical=self; query=none; depth=2; urlLength=42",
  "routeScope": "services"
}
```

`reason`은 `sole-member` / `root-protected` / `representative-rule` 3종이다.

## Determinism 보장 방식

입력 배열 순서에 의존하는 지점을 전부 제거했다:

- bucket key는 **데이터**에서만 만든다(encounter order 사용 안 함)
- family member는 URL 기준 정렬
- family는 **가장 작은 member URL** 기준 정렬 — URL은 한 family에만 속하므로 총 순서가 된다
- `f000001…` id는 **정렬 후에** 부여한다
- 대표 선정 comparator의 마지막 단계가 lexical이라 tie가 남지 않는다
- Task 06 content-fingerprint 그룹도 key 순서로 정렬해 처리
- `reductionRate`는 소수 4자리 반올림해 저장(부동소수점 표현 흔들림 방지)

검증 방법 2가지:

1. Fixture에서 (a) 역순, (b) stride 5 순열(21과 서로소 → 진짜 순열), (c) 저장 배열
   (`urls`, `candidates`, `duplicateGroups`) 자체를 역순으로 뒤집은 입력 — 3가지 모두
   출력 JSON이 **완전히 동일**
2. 실제 4개 사이트에서 `verified-urls.json` / `verification.json`의 배열을 역순으로 뒤집어
   다시 실행 → `page-families.json`, `selected-pages.json`이 timestamp/경로를 제외하고
   **byte-identical** (8/8 PASS)

> 구현 중 발견한 버그: 처음 shuffle을 `(i * 7 + 3) % 21`로 만들었는데 `gcd(7,21)=7`이라
> 순열이 아니라 3개 행만 반복하는 잘못된 입력이었다. determinism 테스트가 실패해서
> 드러났다. stride를 5로 바꾸고 "진짜 순열인지" 검사하는 체크를 추가했다.

## Invariants

저장 **직전에** 검사하고, 위반이면 경고가 아니라 throw한다(데이터 상태가 아니라 규칙의 버그이므로).

| Invariant | 내용 |
| --- | --- |
| Coverage | 모든 verified URL이 정확히 하나의 family에 존재. family member 중 verified가 아닌 URL 없음 |
| Membership | 한 URL이 두 family에 동시에 속하지 않음 |
| Representative | family마다 정확히 1개, 그리고 그것이 `representativeUrl`과 일치 |
| Family id | 중복 없음 + 최소 member URL 기준 정렬 순서 유지 |
| Counts | `familyCount`, `verifiedUrlCount`, `signals.memberCount`가 실제와 일치 |
| Selection | `selectedCount === familyCount`, 모든 선택 URL이 해당 family의 대표, `selected + unselected === verifiedUrlCount` |

content-duplicate collapse를 쓰더라도 coverage는 **raw URL 기준**으로 검사한다(logical node
기준이 아니라). 4개 사이트 전부 통과.

## Fixture 테스트 결과

`pnpm smoke:selector` — **네트워크도 HTTP 서버도 브라우저도 없다.** selection 자체가 offline
처리이므로, fixture는 현실적인 Task 06 입력 pair만 만들면 된다. 그래서 **Task 06의 실제
빌더**(`buildDuplicateGroups`, `buildVerifiedUrls`)를 합성 candidate에 그대로 돌려서 입력을
만든다 — 손으로 쓴 가짜 JSON이 아니라 진짜 `verification.json` / `verified-urls.json` 모양으로
selector를 검증한다.

Fixture 21개 URL과 기대 결과:

| 케이스 | URL | 기대 |
| --- | --- | --- |
| root | `/` | 보호된 singleton, selection에 반드시 존재 |
| sibling | `/blog/post-a,b,c` (동일 structure) | 1개 family, `/blog/<*>`, 대표 `post-a` |
| sibling | `/tools/a,b,c` (동일 structure) | 1개 family |
| list vs detail | `/blog` | post family에 섞이지 않음 |
| scope-structure | `/docs/guide/intro`, `/docs/api/reference` | 1개 family(부모는 다름), 대표는 더 짧은 URL |
| content duplicate | `/duplicate-a`, `/duplicate-b` | 1개 family |
| content duplicate + query | `/page`, `/page?v=1`, `/page?v=2` | 1개 family, 대표는 query 없는 `/page` |
| canonical 안전성 | `/canonical-a`, `/canonical-b` (canonical 둘 다 홈) | **합쳐지면 안 됨** |
| canonical 안전성(강화) | `/legal/terms`, `/legal/privacy` (같은 scope + 같은 canonical, 다른 structure) | **합쳐지면 안 됨** |
| false merge 방지 | `/about`, `/pricing` (**같은 structureHash**, 다른 scope) | **합쳐지면 안 됨** |
| singleton | `/pricing` | singleton |

결과:

```
21 verified → 13 families → 13 selected → 8 reduced (38.1%)
content-duplicate 2 / sibling-pattern 2 / scope-structure 1 / singleton 8
largest family 3
```

Route feature 단위 검사(locale, routeScope, parentPath, query 정렬, terminalKind 6종),
coverage/membership/representative invariant, provenance(unselected 전건이 대표를 지목),
determinism 3종, 저장 후 Zod 재검증까지 포함해 **67/67 checks PASS**.

## domainchecker 결과

입력: `data/domainchecker.co.kr/2026-08-13T07-51-15-559Z/` (Task 06 run 재사용, 신규 크롤링 없음)

| 항목 | 값 |
| --- | --- |
| verified URLs | 19 |
| families | 19 |
| selected | 19 |
| reduction | 0 (0.0%) |
| content-duplicate / sibling-pattern / scope-structure / singleton | 0 / 0 / 0 / **19** |
| largest family | 1 |

`/blog` 아래 blog 글 **17개**가 같은 parent · 같은 depth인데 `structureHash`가 **17개 전부
다르다**(DOM element 529–714개). 그래서 sibling 조건의 "동일 structureHash"에서 전부 탈락했다.

## seoworld 결과

입력: `data/seoworld.co.kr/2026-08-13T07-51-25-928Z/` (Task 06 run 재사용)

| 항목 | 값 |
| --- | --- |
| verified URLs | 30 |
| families | 28 |
| selected | 28 |
| reduction | 2 (6.7%) |
| content-duplicate / sibling-pattern / scope-structure / singleton | 0 / 0 / **2** / 26 |
| largest family | 2 |

4개 사이트 중 **유일하게 grouping이 실제로 일어난** 사이트다.

```
[f000013] scope-structure  routeScope=domains  structureHash=b74c1f2c…
  * https://seoworld.co.kr/domains/auction     (144 elements, textLen 244)
    https://seoworld.co.kr/domains/compare     (144 elements, textLen 243)

[f000017] scope-structure  routeScope=services structureHash=6d012664…
    https://seoworld.co.kr/services/domain-broker (172 elements, textLen 504)
  * https://seoworld.co.kr/services/web-design    (172 elements, textLen 529)
```

sibling 후보 bucket(같은 parent·depth 3개 이상)과 그 안의 distinct structureHash 수:

| parent | depth | siblings | distinct structureHash |
| --- | --- | --- | --- |
| `/blog` | 2 | 9 | 9 |
| `/tools` | 2 | 9 | 9 |
| `/` | 1 | 4 | 4 |
| `/services` | 2 | 4 | 3 |
| `/domains` | 2 | 3 | 2 |

## nextjs.org 결과

신규 데이터 준비(§32 지침대로 보수적으로):

```bash
pnpm recon https://nextjs.org --max-urls 40
pnpm verify data/nextjs.org/2026-08-13T08-13-18-089Z/discovery.json --concurrency 2
```

candidate 40 → valid HTML 40 (http-error 0, navigation-error 0, non-HTML 0,
external-redirect 0, blocked 0, redirect 0, duplicate group 0).

| 항목 | 값 |
| --- | --- |
| verified URLs | 40 |
| families | 40 |
| selected | 40 |
| reduction | 0 (0.0%) |
| content-duplicate / sibling-pattern / scope-structure / singleton | 0 / 0 / 0 / **40** |
| largest family | 1 |

sibling 후보 bucket:

| parent | depth | siblings | distinct structureHash | DOM elements |
| --- | --- | --- | --- | --- |
| `/blog` | 2 | 8 | 8 | 788–2235 |
| `/docs/messages` | 3 | 4 | 4 | 3087–4264 |
| `/docs/pages/guides` | 4 | 4 | 4 | 2268–3007 |
| `/docs/app/api-reference/file-conventions` | 5 | 3 | 3 | 3146–4336 |

## MDN 결과

```bash
pnpm recon https://developer.mozilla.org/en-US/ --max-urls 40
pnpm verify data/developer.mozilla.org/2026-08-13T08-13-28-624Z/discovery.json --concurrency 2
```

candidate 40 → valid HTML **23**, non-HTML **17**. non-HTML 17개는 전부
`.../contributors.txt`로, Task 06의 content-type gating이 정확히 걸러낸 것이다(verification에는
남고 verified-urls에서는 제외).

| 항목 | 값 |
| --- | --- |
| verified URLs | 23 |
| families | 23 |
| selected | 23 |
| reduction | 0 (0.0%) |
| content-duplicate / sibling-pattern / scope-structure / singleton | 0 / 0 / 0 / **23** |
| largest family | 1 |

- 23개 전부 `localePrefix=en-US`, `routeScope=docs`로 정확히 분리됐다.
- Firecrawl이 반환한 URL이 전부 깊은 문서 페이지라 **root URL이 verified set에 없다**.
  따라서 root family도 없다 — 버그가 아니라 정상 동작이다(있으면 보호하고, 없으면 만들지 않는다).

sibling 후보 bucket — 이번 Task에서 가장 중요한 데이터:

| parent | siblings | distinct structureHash | DOM elements |
| --- | --- | --- | --- |
| `/en-US/docs/Web/JavaScript/Reference/Errors` | 3 | 3 | 1410 / 1417 / 1419 |
| `…/Global_Objects/Temporal/PlainDateTime` | 3 | 3 | 930 / 932 / 935 |

`Temporal/PlainDateTime/{inLeapYear, microsecond, toPlainTime}`은 **누가 봐도 같은 MDN
reference 템플릿**이고 DOM element 수 차이가 930→935, 즉 **0.5%** 다. 그런데
`structureHash`는 셋 다 완전히 다르다.

## 사이트별 reduction 비교

| site | verified | families | selected | reduction | rate | content-dup | sibling | scope-structure | singleton | largest |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| domainchecker.co.kr | 19 | 19 | 19 | 0 | 0.0% | 0 | 0 | 0 | 19 | 1 |
| seoworld.co.kr | 30 | 28 | 28 | 2 | 6.7% | 0 | 0 | 2 | 26 | 2 |
| nextjs.org | 40 | 40 | 40 | 0 | 0.0% | 0 | 0 | 0 | 40 | 1 |
| developer.mozilla.org | 23 | 23 | 23 | 0 | 0.0% | 0 | 0 | 0 | 23 | 1 |
| **실사이트 합계** | **112** | **110** | **110** | **2** | **1.8%** | 0 | 0 | 2 | 108 | 2 |
| (참고) fixture | 21 | 13 | 13 | 8 | 38.1% | 2 | 2 | 1 | 8 | 3 |

**이것이 이번 Task의 핵심 실험 결과다. reduction rate가 낮지만 그대로 보고한다(§29, §39).**
강제로 20개만 고르는 식으로 숫자를 만들지 않았다.

## 실제 Family 샘플

### largest family (seoworld, memberCount 2)

위 §seoworld 결과의 `f000013` / `f000017`. 두 family 모두 member의 **DOM element 수가 완전히
동일**하다(144/144, 172/172). 즉 exact structureHash는 구조가 문자 그대로 동일할 때만 맞는다.

### sibling-pattern family

**실사이트 4곳에서 0개.** fixture에서만 생성된다(`/blog/<*>`, `/tools/<*>`). 아래
over-fragmentation 검수에서 이유를 다룬다.

### scope-structure family

위 seoworld 2건. `routeScope`(`domains`, `services`)가 key에 포함되어 있어 두 family가
서로 섞이지 않았다.

### singleton (canonical이 남을 가리키는 실제 사례)

```json
{
  "id": "f000002",
  "type": "singleton",
  "routeScope": "blog",
  "members": [{
    "url": "https://domainchecker.co.kr/blog",
    "title": "블로그 · 도메인체커 | 도메인 투자 & SEO 가이드 | 도메인체커",
    "canonicalUrl": "https://domainchecker.co.kr/",
    "canonicalTarget": "other",
    "route": { "pathDepth": 1, "routeScope": "blog", "parentPath": "/",
               "terminalSegment": "blog", "terminalKind": "text" },
    "isRepresentative": true
  }],
  "representativeUrl": "https://domainchecker.co.kr/blog",
  "signals": { "memberCount": 1, "sharedStructure": true, "sharedText": true,
               "canonicalHints": ["https://domainchecker.co.kr/"],
               "canonicalPointsElsewhereCount": 1 }
}
```

canonical이 홈을 가리키지만 **제외되지 않고 그대로 대표**가 됐다. 힌트만 기록된다.

## False Merge 검수

- **한 family 안에 이질적인 페이지가 섞인 사례: 0건.** 실사이트에서 만들어진 family는 seoworld
  2건뿐이고, 각각 `/domains/*` 도구 페이지 2개, `/services/*` 서비스 상세 2개로 같은 종류다.
  DOM element 수와 body text 길이까지 사실상 동일하다.
- **structureHash만 같아서 서로 다른 routeScope가 합쳐지는 문제: 없음.** scope-structure key에
  `routeScope`가 반드시 포함되고, fixture의 `/about` vs `/pricing`(동일 structureHash, 다른 scope)
  케이스로 회귀 테스트를 고정했다.
- **`structureHash`만으로 content duplicate 표시하지 않음**(§41): fixture에서 같은 structureHash +
  다른 textHash가 content-duplicate로 분류되지 않는지 검사한다. 실사이트에서도
  content-duplicate family는 0건이다.
- `pricing` / `blog article` / `docs` / `homepage`가 한 family에 들어간 경우 없음.

## Over-fragmentation 검수

반대 방향은 **명백한 문제가 있다.** 명백히 반복되는 페이지들이 전부 singleton으로 남았다.

| site | 반복이 명백한 그룹 | siblings | distinct structureHash | 결과 |
| --- | --- | --- | --- | --- |
| domainchecker | `/blog/*` | 17 | 17 | 전부 singleton |
| seoworld | `/blog/*` | 9 | 9 | 전부 singleton |
| seoworld | `/tools/*` | 9 | 9 | 전부 singleton |
| nextjs.org | `/blog/*` | 8 | 8 | 전부 singleton |
| nextjs.org | `/docs/messages/*` | 4 | 4 | 전부 singleton |
| MDN | `…/Temporal/PlainDateTime/*` | 3 | 3 | 전부 singleton |

### 원인 (측정으로 확인)

grouping 규칙이 아니라 **사용 가능한 신호**가 원인이다.

Task 06의 `structureHash`는 문서 전체의 `depth:tag` 토큰 시퀀스를 SHA-256한 **exact hash**다.
이건 "이 두 URL이 같은 페이지인가?"(duplicate detection)에 대한 정답 도구다. 실제로 그 목적에는
정확히 동작한다. 하지만 "이 두 페이지가 같은 템플릿인가?"(template detection)에는 쓸 수 없다.

증거 두 가지:

1. **성공한 경우**: seoworld의 두 family는 member의 DOM element 수가 **완전히 동일**하다
   (144/144, 172/172). exact hash는 구조가 문자 그대로 같을 때만 맞는다.
2. **실패한 경우**: MDN reference 3개는 930 / 932 / 935 element다. 같은 템플릿에 본문 길이만
   다른데 **0.5% 차이로 hash가 완전히 달라진다.** nextjs 블로그는 788–2235로 편차가 더 크다.

즉 콘텐츠가 조금이라도 있는 페이지에서는 exact structure hash가 절대 일치하지 않는다.

### 그래서 무엇을 했는가

**fuzzy AI similarity는 넣지 않았다**(§38, §45). 또한 이 문제를 감추기 위해 sibling 규칙에서
`structureHash` 조건을 빼지도 않았다 — route 모양만으로 3개 이상 sibling을 묶으면
`/docs/index`와 `/docs/article` 같은 서로 다른 종류가 합쳐지는 false merge 위험이 커지고,
그건 이번 Task가 가장 경계하는 실패다.

대신 **deterministic 개선 방향을 검토해 다음 Task 권고로 남긴다**(아래 §다음 Task 추천).
핵심은 이 개선이 **Task 07 범위에서 불가능하다**는 점이다: 더 나은 구조 신호는 페이지를 다시
방문해서 계산해야 하므로 Verifier(Task 06)의 산출물이 바뀌어야 하고, `pnpm select`의 offline
제약과 정면으로 충돌한다.

## Canonical 안전성 검수

Task 06에서 발견된 실제 사례 2건이 이번 단계에서 잘못 merge되지 않았는지 직접 확인했다.

| 사례 | canonical | 결과 |
| --- | --- | --- |
| `domainchecker.co.kr/blog` | `https://domainchecker.co.kr/` (홈) | family `f000002` singleton — 홈(`f000001`)과 **다른 family** |
| `seoworld.co.kr/tools/domain-checker` | `https://seoworld.co.kr/` (홈) | family `f000021` singleton — 홈(`f000001`)과 **다른 family** |

기계적 검사도 추가로 돌렸다: "canonical이 남을 가리키는 member"와 "그 canonical 대상 URL"이
같은 family에 들어간 경우 = **4개 사이트 모두 0건**.

두 URL 모두 제외되지 않고 각자 대표로 selection에 남아 있다.

## Page Family와 Duplicate의 차이

보고서와 코드에서 이 둘을 섞지 않았다.

### Duplicate

```
사실상 동일한 콘텐츠/URL의 반복
```

판단 근거는 `textHash` **와** `structureHash`가 **둘 다** 동일한 경우뿐. 결과는 하나의
logical node로 **collapse**되고, 나머지 URL은 alias로 보존된다. family type
`content-duplicate`.

### Page Family

```
서로 다른 페이지이지만, 재구현 관점에서 구조 패턴을 공유할 가능성이 높은 페이지 집합
```

`/blog/post-a`와 `/blog/post-b`는 **다른 페이지**다. 같은 family에 넣는 이유는 "같다"가 아니라
"하나를 깊게 관측하면 나머지의 구조도 안다"는 가정이다. family type `sibling-pattern` /
`scope-structure`.

이 구분이 실제로 코드에 반영된 지점: 같은 `structureHash`를 공유해도 `textHash`가 다르면
duplicate로 분류하지 않는다(fixture `/about` vs `/pricing`으로 고정).

## 발생한 문제

1. **소스 파일에 NUL 바이트가 들어감** — bucket key separator를 `" "`으로 쓰려다 리터럴
   NUL 바이트를 파일에 그대로 써버렸다. TypeScript는 통과했지만 파일이 binary로 인식돼 `grep`이
   조용히 동작하지 않았다. 이스케이프 시퀀스 문자열로 교체.
2. **shuffle이 순열이 아니었음** — determinism 테스트의 stride를 7로 잡았는데 행 수 21과
   `gcd=7`이라 21개 중 3개만 반복되는 입력이 만들어졌다. 테스트가 FAIL로 잡아냈다. stride 5로
   교체하고 "진짜 순열인가" 검사를 추가.
3. **offline 주장이 import graph에서 깨져 있었음** — `verifier/index.js` / `discovery/index.js`
   barrel이 Playwright와 Firecrawl SDK를 끌어왔다. 호출은 없었지만 로드는 됐다. leaf module
   import로 교체(실행 시간도 0.75s → 0.38s로 감소).
4. **provenance 경로 불일치** — `sourceVerifiedUrlsFile`은 상대경로, `sourceVerificationFile`은
   절대경로로 기록됐다. Task 06 관례에 맞춰 둘 다 호출자가 준 형태를 유지하도록 수정.
5. **`canonicalConflict` 신호가 오해를 유발** — 서로 다른 페이지가 각자 self-canonical을 선언하는
   정상 상황에서도 켜졌다. 사실만 남기는 `canonicalPointsElsewhereCount`로 교체.
6. **root 판정이 path-rooted run을 놓침** — MDN run의 root는 `/en-US/`인데 초기 구현은
   `pathname === "/"`만 봤다. run root URL 자체도 root로 인정하도록 확장.

## 기술적 결정

- **계층적 grouping (union-find 아님)** — 신호를 한꺼번에 연결하면 사이트가 하나의 거대한
  component가 된다. 각 URL은 가장 강한 규칙에 먼저 claim되고 후보에서 빠진다.
- **모든 규칙을 exact match로** — similarity score / threshold 없음. false merge를 가장 경계.
- **canonical은 merge 신호가 아님** — Task 06의 실제 오선언 사례가 근거. hint + 대표 우선순위
  강등에만 사용.
- **locale은 삭제가 아니라 metadata** — `localePrefix`를 기록하되 URL 의미는 그대로. 단
  scope-structure key에는 포함(cross-locale merge를 보수적으로 회피).
- **root는 grouping 이전에 격리** — 실패 모드를 규칙 하나로 제거. 덕분에
  `selectedCount === familyCount`가 예외 없이 성립.
- **sibling 최소 3, scope-structure 최소 2** — sibling은 "반복 route"라는 강한 주장이라 근거를
  더 요구하고, scope-structure는 key(locale+scope+exact hash)가 이미 충분히 좁다.
- **stable sort 후 id 부여** — encounter order 의존 제거. hash id 대신 정렬 기반 `f000001…`을
  택해 사람이 파일을 읽을 때 순서가 의미를 갖게 했다.
- **invariant는 warn이 아니라 throw** — 위반은 데이터 상태가 아니라 규칙의 버그다.
- **leaf import로 offline 보장** — barrel import를 피해 Playwright/Firecrawl을 로드조차 하지 않음.
- **cap 없음** — 실제 grouping 성능을 그대로 노출하는 것이 이번 Task의 목적.

## 현재 한계

1. **가장 큰 한계: 실사이트 reduction이 사실상 0이다(112 → 110, 1.8%).** 원인은 규칙이 아니라
   Task 06 `structureHash`가 exact hash라는 점이다(위 §Over-fragmentation 참조). 이 단계는 지금
   **구조적으로는 완성됐지만 실효 이득은 거의 없다.**
2. **sibling-pattern family가 실사이트에서 한 번도 생성되지 않았다.** 규칙은 fixture로만 검증됐다.
3. **content-duplicate family도 실사이트에서 0건.** 4개 사이트 모두 content-fingerprint 중복이
   없었다(Task 06에서도 동일). 이 경로 역시 fixture로만 검증됐다.
4. **cross-locale merge 미지원** — `/en-US/docs/x`와 `/ko/docs/y`는 같은 템플릿이어도 합치지
   않는다(의도적 보수성).
5. **query 값을 신호로 쓰지 않는다** — `?page=1` / `?page=2`가 pagination이라는 사실을 이용하지
   않는다. `queryKeySignature`는 기록만 하고 grouping key로는 쓰지 않았다(false merge 위험).
6. **`terminalKind`가 아직 grouping에 쓰이지 않는다** — 기록만 한다. `numeric`/`uuid` terminal이
   섞인 sibling 그룹을 더 강한 신호로 볼 여지가 있으나 이번엔 규칙을 늘리지 않았다.
7. Task 06 structure signature의 8,000 element cap이 큰 페이지(nextjs docs 4,264 element는
   아직 여유)에서 정밀도에 영향을 줄 수 있다.
8. `verified-urls.json`에 없는 URL(non-HTML, http-error 등)은 이 단계의 대상이 아니다.

## 다음 Task 추천

(추천만 하고 구현하지 않는다.)

### 1순위 — Deterministic 구조 신호 보강 (Task 06 확장)

지금의 exact `structureHash`와 **함께** 저장할, content 길이 변화에 둔감한 deterministic
signature가 필요하다. AI도 embedding도 아니다. 후보:

```
- depth-capped tag skeleton  : depth N까지만의 tag 시퀀스를 해시
- landmark signature         : header/nav/main/aside/footer/section 골격만 해시
- normalized tag histogram   : tag별 개수를 버킷팅(예: log2 bucket)해서 해시
```

`/blog/*` 9개가 같은 skeleton hash를 갖게 되면 sibling-pattern 규칙이 **지금 코드 그대로**
동작한다. Task 07은 한 줄도 바꿀 필요가 없다.

**중요**: 이건 페이지를 다시 방문해야 계산되므로 Verifier 산출물 변경이고, `pnpm select`의
offline 제약 안에서는 불가능하다. 순서는 반드시 "Task 06 확장 → 재verify → select 재실행"이다.

### 2순위 — Multi-page Deep Observation

```
selected-pages.json
→ Multi-page Deep Observation (선정 URL을 Task 03~05 Observer에 투입)
```

단, 1순위를 먼저 하지 않으면 지금은 verified URL 거의 전부를 관측하게 된다. Task 05 실측
기준 1 page ≈ 6.85 MB이므로 nextjs.org 40 페이지 ≈ 274 MB다. 관측 비용/스토리지 정책
(screenshot 압축 등)을 같이 정하는 편이 좋다.

### 3순위 (선택)

- pagination 신호(`?page=N`, `/page/N`)를 deterministic하게 다루기
- `terminalKind`를 grouping 신호로 승격할지 실데이터로 검토

## 변경 파일

신규:

- `src/selector/types.ts`
- `src/selector/route-features.ts`
- `src/selector/build-families.ts`
- `src/selector/select-representatives.ts`
- `src/selector/store.ts`
- `src/selector/index.ts`
- `src/cli-select.ts`
- `scripts/smoke-selector.ts`
- `docs/result/07-page-family-representative-selection-2026-08-13.md` (본 문서)

수정:

- `package.json` — `select`, `smoke:selector` script 추가
- `README.md` — 4역할 파이프라인(recon/verify/select/observe), Task 07 섹션, 사용법, 출력
  파일, 프로젝트 구조, 외부 테스트 사이트 주석
- `ROADMAP.md` — Task 07 완료 + 측정 결과 + 다음 단계

**기존 `src/discovery/` · `src/verifier/` · `src/observer/`는 수정하지 않았다.**

생성된 실행 산출물(gitignored `data/`):

- `data/domainchecker.co.kr/2026-08-13T07-51-15-559Z/{page-families,selected-pages}.json`
- `data/seoworld.co.kr/2026-08-13T07-51-25-928Z/{page-families,selected-pages}.json`
- `data/nextjs.org/2026-08-13T08-13-18-089Z/{discovery,discovery.raw,verification,verified-urls,page-families,selected-pages}.json`
- `data/developer.mozilla.org/2026-08-13T08-13-28-624Z/{discovery,discovery.raw,verification,verified-urls,page-families,selected-pages}.json`

Git add / commit / push는 수행하지 않았다.

## 검수자가 확인할 부분

- **Offline 보장**: `src/cli-select.ts`에서 시작하는 import graph에 `playwright` /
  `firecrawl`이 없는지. barrel이 아니라 `verifier/types.js`, `discovery/normalize-url.js`를
  import하는지.
- **False merge 방지**: `build-families.ts`가 union-find가 아니라 계층적 claim 구조인지.
  scope-structure key에 `routeScope`가 반드시 포함되는지.
- **Canonical 보수성**: canonical이 merge 근거로 쓰이지 않고 hint + 대표 우선순위 강등에만
  쓰이는지. domainchecker `/blog`와 seoworld `/tools/domain-checker`가 홈과 다른 family인지.
- **Duplicate 정의**: `textHash` **와** `structureHash`가 둘 다 같을 때만 collapse되는지
  (`structureHash`만으로는 안 되는지).
- **Provenance 손실 없음**: `page-families.json`의 member에 title/canonical/hash/
  sourceCandidateUrls/route가 남아 있고, `selected-pages.json`의 `unselected[]`가 대표를
  지목하는지.
- **Invariant**: coverage / one-family-per-url / one-representative-per-family /
  `selectedCount === familyCount`가 저장 **전에** 검사되고 위반 시 throw하는지.
- **Determinism**: 입력 배열을 뒤집어 다시 실행해도 산출물이 동일한지(재현 절차는
  §Determinism 참조).
- **결과의 정직성**: reduction 1.8%라는 낮은 수치를 cap이나 규칙 완화로 감추지 않았는지.
  §Over-fragmentation의 원인 분석이 추측이 아니라 실측(DOM element 수, distinct hash 수)에
  근거하는지.
- **재현**: `pnpm typecheck`, `pnpm smoke:selector` (67/67 PASS), 4개 사이트
  `pnpm select <verified-urls.json>`.
- Secret / API key는 소스·CLI 출력·저장 JSON·본 문서 어디에도 기록하지 않았다.
