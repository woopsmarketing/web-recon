Task: 11
Title: Safe Rule-Based Interaction Exploration Engine
Previous: 10-interaction-candidate-detection-2026-08-13.md
Status: Complete

---

# Task 11 — Safe Rule-Based Interaction Exploration Engine

## 작업 목표

Task 10까지의 파이프라인은 저장된 정적 관측만으로 다음 질문에 답했다.

> 무엇을 조작해 볼 근거가 있는가?

이번 Task의 질문은 하나다.

> 그 후보를 실제 페이지에서 **안전하게 다시 찾아 조작했을 때 무엇이 변하는가?**

산출물은 **"이 action을 했더니 이런 observable state transition이 발생했다"**까지다.
`Accordion` / `Tabs` / `Modal` / `Drawer` / `Dropdown` / `Carousel` 같은 최종 Pattern 이름은
이번 Task에서 **한 번도 쓰지 않는다**. `aria-expanded false → true` + `target hidden → visible`은
그 사실 그대로 저장하고, Pattern Registry 연결은 Task 12의 몫이다.

원래 8개의 별도 단계로 생각했던 것 — Safe Action Planning / Live Candidate Re-identification /
Live Signal Reconciliation / Rule-Based Playwright Interaction / Before State Capture /
After State Capture / State Diff / Action Isolation — 을 하나의 Task로 묶었다. 따로 만들 수 없기
때문이다. locator를 다시 찾지 못하면 before를 찍을 수 없고, before가 없으면 diff가 없고,
context isolation이 없으면 두 번째 action의 before가 첫 번째 action의 after다.

이번 Task에서 **하지 않은 것**: Firecrawl, Discovery, Verification, Selection 재실행, Task 09
Deep Observation 재실행, AI/LLM/embedding, P3 실행, text/password 입력, file upload, form submit,
select 값 변경, range drag, swipe, 재귀 탐색, retry, screenshot, pattern 확정, SiteSpec,
Next.js reconstruction.

## Pipeline Position

```
URL
 → Discovery              (pnpm recon)
 → Verification           (pnpm verify)
 → Page Family Selection  (pnpm select)
 → Multi-page Deep Observation (pnpm observe:site)
 → Interaction Candidate Detection (pnpm detect:interactions)
 → Safe Rule-Based Interaction Exploration  ← 이번 Task (pnpm explore:interactions)
 → Interaction Pattern Modeling             ← 다음 Task
```

Task 10이 브라우저 없이 만든 3,106개 후보가 이 단계의 입력이다. 이 단계는 파이프라인에서
**처음으로 사이트를 조작한다**. 그래서 설계의 절반이 "무엇을 관측하는가"가 아니라 "무엇을 하지
않도록 보장하는가"다.

## Architecture

```
interaction-analysis.json (Task 10, immutable)
      │
      ├─ OFFLINE (브라우저 0)
      │    loadInteractionAnalysis()   Zod + 두 manifest 교차검증
      │    selectPlanPages()           representative 전부 + 차이 있는 validation sample ≤2
      │    loadCandidatePage()         interaction-candidates.json + observation.json + dom.json
      │    buildLocatorDescriptor()    candidate + dom.json → live 재식별용 기술자
      │    planSiteActions()           eligibility → shape dedup → budget → actionId
      │         └─→ interaction-plan.json   (timestamp 없음, byte 결정적)
      │
      └─ LIVE (Chromium 1개)
           for each action (concurrency 2):
             newContext()              anonymous, storage state 없음
             SafetyGuard.install()     route/popup/download/dialog — 아직 비무장
             goto → networkidle(5s) → settle(1s)
             guard.arm()               ← 이 순간 이후는 전부 우리가 유발한 것
             resolveLiveCandidate()    A→B→C→D exact strategy + verification
             readLiveSignals()         Observer가 저장하지 않은 속성 직접 읽기
             reconcileLiveState()      safety 재확인 → operability
             installMutationObserver()
             captureSnapshot()         BEFORE
             element.click()           force 금지
             2×rAF → 600ms → networkidle(2s)
             captureSnapshot()         AFTER (stale면 locator 재해결)
             diffSnapshots()           결정적 15-category diff
             context.close()           ← 이것이 복원 전략
           → interaction-exploration.json + pages/<id>/<viewport>/<action>.json
```

신규 모듈은 `src/interaction-explorer/` 하나다.

| 파일 | 역할 |
| --- | --- |
| `types.ts` | Zod schema + safety/budget/capture 정책 상수 |
| `load-analysis.ts` | Task 09/10 입력 로딩 + fail-fast 교차검증 |
| `build-locator.ts` | candidate + `dom.json` → `LocatorDescriptor` |
| `plan-actions.ts` | eligibility → shape dedup → budget → actionId |
| `resolve-live-candidate.ts` | 4개 exact strategy + verification (in-page) |
| `reconcile-live-state.ts` | live safety 재확인 + action별 operability |
| `safety-guards.ts` | navigation / popup / download / write / dialog |
| `capture-state.ts` | before/after snapshot + live signals + mutation (in-page) |
| `diff-state.ts` | 결정적 state diff + meaningful-change 규칙 |
| `execute-action.ts` | action 1개: fresh context → click → diff → close |
| `explore-site.ts` | 사이트 오케스트레이션 (pool, manifest, 집계) |
| `store.ts` | 별도 `interaction-explorations/` namespace |
| `index.ts` | barrel |

권장 구조에서 `observe-mutations.ts`만 `capture-state.ts`에 합쳤다. 둘 다 `page.evaluate`로
직렬화되는 브라우저 코드이고 제약(자기 완결적 함수, JSON 직렬화 가능 인자, bounded 출력)이 같아서
따로 두면 같은 헬퍼가 두 벌이 된다.

## Input / Output

**입력** (전부 읽기 전용)

```
interaction-analysis.json                       ← CLI 인자
site-observation.json                           ← 형제 파일
pages/<id>/interaction-candidates.json          ← manifest의 상대 경로
pages/<id>/observation.json
pages/<id>/viewports/<vp>/dom.json              ← locator descriptor 재료
```

`styles.json`은 **읽지 않는다.** computed style은 element를 다시 찾는 데 아무 역할도 하지 않고,
읽지 않으면 이 단계의 로딩 비용이 DOM 하나로 끝난다.

`site-observation.json`은 `interaction-analysis.json`의 `sourceSiteObservationFile` 문자열을 따라가지
않고 **형제 파일로 찾는다.** 그 문자열은 다른 사람의 shell에서의 상대 경로이고 run 디렉터리를 옮기는
순간 깨진다. 형제 관계는 Task 10 additive-write 정책의 구조적 사실이므로 그것에 의존하고, 대신
`rootUrl` 일치 · 모든 분석 page가 observation manifest에 success로 존재 · URL 일치를 검증한다.

**출력** (신규 namespace)

```
data/<host>/interaction-explorations/<run-id>/
  interaction-plan.json
  interaction-exploration.json
  pages/<page-id>/<viewport>/<action-id>.json
```

`data/<host>/site-observations/<old-run>/`은 **읽기 전용**이다. 코드 수준에서도 이 모듈은 원본
디렉터리 경로를 쓸 수 없다.

## Offline Planning vs Live Execution

이 Task는 성격이 완전히 다른 두 반쪽으로 되어 있고, 그 경계를 파일 하나가 담당한다.

| | Offline Plan | Live Execution |
| --- | --- | --- |
| 비용 | 0 (브라우저 0, network 0) | 페이지 로드 × action 수 |
| 결정성 | **byte 동일** | 사이트가 매 순간 다름 |
| timestamp | **없음** | 있음 |
| 실패 | fail-fast (입력 손상) | action별 격리 |
| 산출 | `interaction-plan.json` | `interaction-exploration.json` + action 파일 |

`--plan-only`는 곁다리 옵션이 아니라 **독립적으로 쓸모 있는 제품**이다. 사이트를 한 번도 건드리지
않고 "후보 3,106개가 왜 action N개가 되는가"에 전부 답한다. 실사이트 실행 전에 이것을 먼저
돌리는 것이 권장 절차다(§94).

plan 결정성은 실데이터로 확인했다.

```
pnpm explore:interactions <analysis> --plan-only   (2회)
→ interaction-plan.json  byte-identical
```

fixture에서는 더 강한 조건도 검사한다: `candidates[]` 배열과 `targets[]` 배열과 page 순서를 전부
뒤집어도 `actions[]`와 `skipped[]`가 완전히 동일하다.

## Action Planning

```
candidates
  → eligibility     guard / hidden / priority / capability
  → shape dedup     동일 interaction shape는 1개만
  → budget          viewport 8 / page 16 / site 80
  → actionId        (pageId, viewport, candidateId) 안정 정렬 후 ia000001…
```

세 layer의 budget은 역할이 다르다. viewport cap은 거대한 한 페이지가 사이트 예산을 다 먹는 것을
막고, page cap은 방어적 backstop이며(viewport cap 8에서는 절대 발화하지 않는다), site cap은
**priority 우선 정렬**된 목록에 적용된다. 그래서 사이트가 잘릴 때 잃는 것은 마지막 페이지가 아니라
가장 약한 증거다 — 사이트 전체의 P1이 전부 계획된 뒤에야 어디의 P2든 계획된다.

actionId는 budget과 **완전히 분리된 안정 정렬**로 부여한다. budget이 걸리든 안 걸리든 `ia000007`은
같은 action을 가리킨다(§63).

## Candidate Eligibility

순서 자체가 정책이다. 위험한 guard를 가장 먼저 보므로 `form-submit` 후보가 단순히 "hidden"으로
기록될 수 없고, P3는 capability 판단 이전에 거부되므로 heuristic tier의 이유가 항상 하나다.

| 순서 | 조건 | skip reason |
| --- | --- | --- |
| 1 | `form-submit` `file-input` `navigation` `external-navigation` `disabled` `inert` `pointer-disabled` | `guard` |
| 2 | `effectiveVisible=false` 또는 `hidden` guard | `hidden` (**보존**, 실행만 안 함) |
| 3 | P3 | `priority` |
| 4 | P1인데 eligible capability/evidence 없음 | `capability` |
| 5 | P2인데 checkbox/radio도 icon-only button도 아님 | `capability` |

**P1**: `state-toggle` `disclosure-trigger` `menu-trigger` `dialog-trigger` `tab-trigger` `toggle`
중 하나, 또는 evidence `aria-expanded` `aria-pressed` `aria-selected` `aria-checked`
`aria-haspopup` `aria-controls` `native-disclosure` 중 하나.

**P2** (보수적): `input[type=checkbox|radio]`, 그리고 **icon-only native button** —
`<button>` AND `submitCapable` 아님 AND 직접 텍스트 길이 ≤ 2.

icon-only 허용은 이번 Task에서 유일하게 넓힌 규칙이고, 이유가 실측이다. seoworld의 모바일 메뉴는
ARIA가 전혀 없는 `<button>`이고 텍스트는 빈 문자열(내용이 인라인 `<svg>`)이다. 이 허용이 없으면
그런 구조로 만든 모든 사이트에서 모바일 네비게이션이 영원히 관측되지 않는다. 규칙은 순수하게
HTML 용어로만 표현되어 있다 — tag, 텍스트 길이, 위험 guard의 부재. **사이트별 조건문도, hamburger
selector 목록도, framework 토큰도 이 모듈 어디에도 없다.**

`text.length ≤ 2`는 `""`, `☰`, `×`, `≡`를 포함하고 `Subscribe`, `Sign in`을 제외한다.

## Shape Deduplication

MDN 한 페이지에 구조적으로 동일한 `<summary>`가 70개 있다. 70번 클릭하는 것은 사실 하나를 알기
위해 70번 페이지를 여는 일이다.

shape key (§16, §17):

```
priority | tagName | role | inputType | capabilities |
aria-expanded/pressed/selected/checked/haspopup 의 값 |
control relation (relation:resolved:targetTag:targetRole:targetVisible) |
guard class
```

**값까지 넣는 것이 핵심**이다. `aria-expanded=false`와 `aria-expanded=true`는 다른 shape이므로
열리는 전이와 닫히는 전이를 둘 다 관측할 기회가 생긴다. 대표는 항상 candidateId가 가장 빠른 것이고,
나머지는 전부 `skipped[]`에 `shape-duplicate` + `representativeCandidateId`로 남는다.

target을 **id가 아니라 "무엇인가"로** 키에 넣은 것도 의도적이다. Radix가 생성한 id로 키를 만들면
동일한 dropdown trigger 20개가 서로 다른 20개 shape가 된다.

실측: eligible 1,279 → shape 199 (1,080 dedup, **84.4% 감소**).

## Action Budget

```
MAX_ACTIONS_PER_VIEWPORT = 8
MAX_ACTIONS_PER_PAGE     = 16
MAX_ACTIONS_PER_SITE     = 80
```

4개 사이트 중 budget이 실제로 발화한 곳은 nextjs.org 하나이고(38건), 전부 site cap이다. fixture는
viewport cap도 검사한다(10 shape → 8 planned + 2 `budget`).

## Locator Descriptor

이 Task에서 가장 중요한 규칙 한 줄:

> **`candidate.elementId`는 provenance이지 locator가 아니다.**

`e000042`는 "저장된 어떤 DOM walk의 42번째 element"라는 뜻이다. URL을 다시 열면 `<div>` 하나만
늘어도 그 뒤 전부가 renumber된다. 그 값으로 action하면 **조용히 다른 컨트롤을 누른다.**

| identity에 쓰는 것 | 쓰지 않는 것 |
| --- | --- |
| tagName, HTML id, role, input type | `class` 전체 (utility CSS는 스타일 수정마다 바뀜) |
| name, aria-label, title, placeholder, alt | 모든 `data-*` **값** (임의 · framework 종속) |
| 정규화된 direct text | `aria-controls` (값이 생성 id인 경우가 흔함 — §21) |
| semantic ancestor path, sibling 위치 | bounding box (**diagnostic 전용**) |
| 결정적 structural path | |

fixture는 plan의 모든 action에 대해 `locatorDescriptor` JSON 안에 `sourceElementId` 문자열이
들어있지 않음을 기계적으로 검사한다.

## Live Re-identification

```
Stored Candidate → LocatorDescriptor → Live DOM 검색 → unique + verified → Action
```

구현은 `page.evaluateHandle`로 브라우저에서 element **핸들 자체**를 돌려받는다. 임시 속성을 붙였다
떼거나 우리가 발명한 selector로 다시 조회하지 않는다 — **페이지는 관측 대상이지 편집 대상이 아니다**
(§100).

## Locator Strategy

magic similarity score는 만들지 않았다. 각 단계가 0 / 1 / N을 돌려주는 exact predicate다.

| | strategy | predicate |
| --- | --- | --- |
| A | `id-exact` | `#id` + 검증 |
| B | `semantic-exact` | tag ∧ role ∧ type ∧ **descriptor가 가진 모든** strong field |
| C | `semantic-ancestor` | B + semantic ancestor path (landmark/role/label, `<div>` 깊이 아님) |
| D | `structural-path` | 결정적 `tag:nth-of-type` 체인 |

B는 strong field(aria-label / name / title / placeholder / alt / text)가 하나도 없으면 **시도조차
하지 않는다.** "어떤 `<button>`"은 identity가 아니다.

**D의 범위가 이번 Task에서 가장 많이 고민한 지점이다.** 처음에는 "semantic strategy가 아무것도
찾지 못했을 때만 D"로 구현했다. 실데이터로 돌려보니 domainchecker 23개 action 중 10개가
`ambiguous`였고, 원인이 전부 하나였다.

```
<a href="/pricing"><button>가격</button></a>   ← desktop nav
<a href="/pricing"><button>가격</button></a>   ← mobile nav (CSS로 숨김)
```

**반응형 사이트가 같은 컨트롤을 두 벌 출력한 것**이다. 이런 쌍에서는 DOM 위치가 유일한 identity다.
§22가 D를 사다리의 정식 단계로 명시하고 §79가 "ancestor/path로도 구별 불가"일 때만 ambiguous라고
쓴 것도 같은 뜻이다. 그래서 D가 좁히는 것을 허용하되 두 조건을 걸었다.

1. D의 match도 다른 strategy와 동일한 verification을 통과해야 한다.
2. 앞선 semantic strategy가 여러 개를 찾았다면 **D의 답이 그 집합 안에 있어야 한다.**

결과적으로 D로 좁혀 클릭한 최악의 경우가 "저장된 것과 semantic이 증명 가능하게 동일한 컨트롤"이다.
집합 밖으로 나가면 그것은 stale path이므로 `semantic-mismatch`다. geometry는 어떤 predicate에도
들어가지 않는다 — `boundingBox`는 저장하되 읽지 않는다.

이 변경으로 domainchecker의 ambiguous 10건이 전부 resolve됐고, **4개 사이트 161 action의 locator
해결률이 100%가 됐다.**

## Dynamic ID Drift

Next.js/Radix/React가 생성하는 `_R_6spaivb_` 같은 id는 run마다 달라질 수 있다. 그렇다고
framework별 regex를 넣지 않았다. 정책은 하나다.

> **id는 첫 번째로 시도하는 힌트이지 identity의 절대 truth가 아니다.**

id가 맞아도 tag/role/type/strong field 검증을 통과해야 하고, 안 맞으면 fallback한다. 이 정책은
생성 id에도 손으로 쓴 id에도 똑같이 옳다.

fixture는 서버가 요청마다 새 id를 발급하게 해서 **진짜 drift**를 만든다(시뮬레이션이 아니다).

```
저장   id=_R_1a_  role=tab  text="npm"
live   id=_R_7a_  role=tab  text="npm"
결과   id-exact  matchCount 0  →  semantic-exact  matchCount 1 verified → resolved
```

실사이트에서는 nextjs.org의 id 12건이 그대로 유효했다(같은 배포 · 같은 hydration id). 반대로 tab
action의 **after**에서는 drift가 실제로 관측된다 — 아래 nextjs tab 사례 참조.

## Ambiguous Resolution Policy

```
0 match          → not-found
2+ match         → ambiguous        ← action 금지
1 match, 검증 실패 → semantic-mismatch ← action 금지
1 match, 검증 통과 → resolved
```

최종 status 우선순위는 `ambiguous` > `semantic-mismatch` > `not-found`다. §60의 status 목록에는
`semantic-mismatch`가 없으므로 primary status는 `not-found`로 접고, 정확한 사유는
`locatorResolution.status`에 남긴다(모든 표가 그 필드를 읽는다).

fixture의 ambiguous 케이스는 semantic 2개 + **stale path**로 구성했다: 관측 시점 이후 카드 앞에
배너 `<section>`이 삽입되어 저장된 `main>section:1>button:1`이 더 이상 button을 가리키지 않는다.
B=2, C=2, D=0 → `ambiguous`, click 0.

## Live Signal Reconciliation

Task 10 보고서의 가장 큰 한계는 이것이었다.

> Observer `ATTR_WHITELIST`에 없는 신호는 실제 데이터에서 영원히 0이다.
> (`disabled` `readonly` `contenteditable` `open` `hidden` `inert` `checked` `selected`
> `popover*` `min` `max` `step`)

이 Task는 그것을 **Task 09를 다시 돌리지 않고** 해결한다(§29). action 직전에 live element에서
직접 읽으면 되고, 페이지는 이미 열려 있고 element는 이미 손에 있다. 비용이 0이다. 그리고 더
정확하다 — 며칠 전 상태가 아니라 **클릭 직전의 상태**다.

읽는 것: 모든 `aria-*` 현재값 · `disabled` `readonly` `checked` `selected` `open` `hidden` `inert`
(DOM **property**) · `contentEditable` · `popover*` · `min` `max` `step` · `button.type` ·
form association · computed `display` `visibility` `opacity` `pointer-events` `cursor`.

**property를 읽는 것이 중요하다.** checkbox를 클릭하면 `input.checked` property가 바뀌지만
`checked` **속성**(파싱 시점 기본값)은 움직이지 않는다. 속성을 캡처했다면 눈에 보이게 토글된
체크박스가 `no-change`로 보고됐을 것이다.

## Action-specific Operability

Task 10의 전역 `initiallyOperable` 하나만 믿지 않는다(§15).

```
clickOperable   연결됨 ∧ visible ∧ !disabled ∧ !aria-disabled ∧ !inert ∧ pointer-events≠none
focusOperable   연결됨 ∧ !disabled ∧ !inert
toggleOperable  = clickOperable
editOperable    clickOperable ∧ !readonly
blockers[]      정렬된 차단 사유 목록
```

readonly input이 이 필드가 존재하는 이유다: focus 되고, click 되고, edit는 안 된다. 하나의
boolean으로 접으면 "readonly ⇒ 아무것도 안 됨"이 이 엔진의 규칙이 되는데 그것은 사실이 아니다.
Task 11은 edit action을 수행하지 않지만, 구분은 기록해서 다음 단계가 다시 유도하지 않게 한다.

## Browser Lifecycle

```
Chromium 1개
 ├ action 1  fresh BrowserContext → … → close
 ├ action 2  fresh BrowserContext → … → close
 └ …
```

프로세스를 공유하는 것은 action마다 Chromium을 띄우면 실행 시간의 대부분이 launch가 되기 때문이고,
**context는 절대 공유하지 않는다** — cookie / localStorage / sessionStorage / DOM state가 거기
살기 때문이다.

## Context Isolation

복원 전략은 **context 폐기**다.

```
Action → After capture → context.close()
```

"복원 버튼을 다시 클릭" 같은 로직은 만들지 않았다. 그것은 페이지가 대칭적으로 동작한다는 가정에
의존하는데, 그 대칭성이야말로 지금 측정하려는 대상이다. context를 버리는 것은 부분 실패할 수 없는
한 번의 연산이다.

사용자 브라우저 상태는 절대 가져오지 않는다: cookie 없음, login session 없음, 저장된 password 없음,
storage state 재사용 없음. 항상 anonymous isolated context다.

fixture가 이것을 실증한다. 한 버튼이 `localStorage`에 값을 쓰고 `body`에 class를 추가하고 마커
`<dialog>`를 남긴다. 페이지는 로드 시 `localStorage`가 오염돼 있으면 `#contaminated` 컨테이너를
만든다. 검사: **모든 action의 before/after 어디에도 `contaminated`가 없고**, 오염시킨 action 자신의
after에는 마커가 있다(클릭이 실제로 실행됐다는 증거).

## Network / Navigation Safety

Task 10의 `guardFlags`가 명백한 것들을 plan에서 제외하지만, JavaScript handler가 달린 평범한
`<button>`은 무엇이든 할 수 있고 저장된 markup은 그것을 알려주지 않는다. 그래서 live 층이 **plan이
옳다는 가정에 의존하지 않는** 두 번째 방어선이다.

| guard | 동작 |
| --- | --- |
| navigation | main-frame document request abort (§39) |
| popup | 새 page 즉시 close, 탐색하지 않음 (§40) |
| download | cancel + `acceptDownloads:false` (§41) |
| write request | `POST`/`PUT`/`PATCH`/`DELETE`/… abort, `GET`/`HEAD`/`OPTIONS`만 허용 (§42) |
| dialog | **dismiss** (accept는 `confirm()`에 "예"라고 답하는 것) |

guard는 **초기 로드가 끝난 뒤에만 무장한다.** 페이지는 자기 자신을 로드할 권리가 있고(자체
bootstrap POST 포함), 그 이후의 모든 것이 우리가 유발한 것이다.

request 기록은 method · same-origin 여부 · `origin + pathname`뿐이다. **body는 절대 저장하지 않고**
query string도 저장하지 않는다(토큰과 식별자가 흔히 들어간다). fixture가 문자열 수준에서 검사한다.

구현 중 실제 버그를 하나 만났다: `request.frame()`은 프레임이 생기기 전에 발행된 요청에서 **throw
한다** — 정확히 `window.open`의 모양이다. 그런 요청은 우리 main frame일 수 없으므로 catch해서
non-main-frame으로 처리하고, popup guard가 그 창을 닫는다.

**차단하지 않은 것 (§44)**: WebSocket과 Service Worker. 현재 Playwright에 안전하고 비침습적인
공식 API가 없고, page global을 monkeypatch하면 측정하려는 동작 자체를 왜곡한다. known limitation로
기록한다.

**차단할 수 없는 것**: `history.pushState`. 네트워크 요청이 없으므로 어떤 route handler도 볼 수
없다. 발생 사실을 `same-document-navigation` safety event로 기록하고, 아래 규칙으로 diff를 무효화한다.

## Before State Capture

action 직전 compact snapshot: candidate `LiveElementState` + 선언된 target들 + stateful container
인벤토리 + `document.location.href`.

전체 attribute dump는 금지다. 고정 어휘(`LIVE_ATTRIBUTE_NAMES`) + **모든 `aria-*`**를 읽고,
boolean state는 property에서 읽고, computed는 5개만 읽는다. `outerHTML`/`innerHTML`은 어디에도
없다.

`aria-*` 전체 순회는 실측으로 추가했다 — 아래 "State Diff Results"의 seoworld 사례 참조.

controlled target(§49)은 `aria-controls`/`popovertarget`은 live `document.getElementById`로,
`details`는 candidate로부터 `closest('details')`로 찾는다. before에 target이 없으면 `exists=false`이고
**이것은 error가 아니다** — 그것이야말로 mount 증거의 "before" 절반이다.

stateful container 인벤토리(§51)는 `details, dialog, [popover], [role=dialog], [role=alertdialog],
[role=menu], [role=listbox], [role=tabpanel], [aria-hidden]`이고 200개 cap + `truncated` 플래그다.
각 항목은 `{key, tag, role, id, visible, open, ariaHidden, popover}`뿐 — 원본 DOM은 저장하지 않는다.

## Mutation Observation

action 직전에 설치하고, `childList` + `attributes`(filter) + `subtree`를 관측한다. 저장 record는
500개 cap + `truncated`. attribute 값은 120자로 자른다.

**`characterData`는 관측하지 않는다.** 실사이트에서 그 채널은 시계 · 카운터 · analytics 텍스트가
지배하고, §59가 이미 텍스트 변화를 state change 증거에서 제외한다.

mutation summary는 **진단 정보이지 판정 근거가 아니다.** 아무리 많은 mutation이 있어도 그것만으로
`changed`가 되지 않는다.

## After State Capture

`2×requestAnimationFrame → 600ms 고정 settle → bounded networkidle(2s)`. 프레임을 먼저 기다리는
이유는 아직 페인트를 시작하지 않은 transition을 시작 상태에서 측정하면 `no-change`가 되기 때문이다.

candidate 핸들이 stale이면(framework 재렌더로 노드가 교체) **같은 검증된 locator로 다시 해결**한다.
근처의 아무 element나 잡지 않는다. 재해결이 일어났으면 `candidate-replaced`로 기록한다.

## State Diff

15개 category, 전부 Node 쪽 순수 함수다.

```
candidate-attribute-change   candidate-visibility-change   candidate-removed   candidate-replaced
target-mounted   target-unmounted   target-visibility-change   target-attribute-change
container-added   container-removed   container-visibility-change
checked-change   selected-change   open-change
url-change
```

정렬은 (category order, subject, subjectKey, field) 고정이고, attribute key 순서를 뒤집어도 출력이
동일하다(fixture 검사).

## Meaningful Change Rule

어려운 부분은 변화를 감지하는 것이 아니라 **엉뚱한 것을 변화라고 부르지 않는 것**이다.

`changed` 조건: 위 category 중 `url-change`를 제외한 것이 하나라도 있을 것. 그리고 다음 두 부정
조건:

1. **mutation record만으로는 절대 `changed`가 아니다.** carousel · sticky header · analytics가 있는
   페이지는 클릭 여부와 무관하게 수백 ms마다 DOM을 바꾼다.
2. **URL이 바뀌었으면 `meaningfulChange`는 무조건 false다.** 이것은 실측으로 추가한 규칙이다.

두 번째 규칙의 근거:

```
domainchecker  <a href="/pricing"><button>가격</button></a>  클릭
→ Next.js client router가 문서를 교체
→ container-added 96, container-removed 113
→ (규칙 없이는) 화려한 state transition으로 보고됨
```

before/after가 **서로 다른 페이지**이므로 그 차이는 state transition이 아니라 page replacement다.
차이 자체는 `changes[]`에 그대로 남긴다(숨기지 않는다) — 다만 증거로 세지 않을 뿐이다.
실측 효과: **false `changed` 5건 제거.**

## Dynamic Target Mount

Task 10이 남긴 가장 중요한 질문이다.

```
before   targetDomId 가 DOM에 없음   (Radix는 열기 전까지 mount하지 않는다)
action
after    같은 id의 element 존재
```

이것이 `target-mounted`이고, interaction observation의 가장 강한 증거다. nextjs.org에서 계획된
unresolved trigger **9건이 전부 action 후 target을 mount했다**(아래 결과 참조).

## Newly Mounted Interactive Descendants

새 target이 mount되면 그 안의 interactive descendant를 **클릭하지 않고 인벤토리만** 만든다(§57, §108).

```
total / button / link / input / menuitem / option / tab / stateful  카운트
+ 최대 20개 descriptor {tag, role, text, aria-state}
```

재귀 탐색은 구현하지 않았다 — state explosion 방지가 이유다. 이 인벤토리는 다음 단계의 입력이다.
fixture는 새로 mount된 menu 안의 menuitem이 어떤 action의 조상에도 나타나지 않음을 검사한다.

## Fixture Tests

`pnpm smoke:interaction-explorer` — **95/95 PASS**. 실제 로컬 HTTP 서버 + 실제 Chromium.

fixture는 합성 Task 09/10 artifact를 손으로 쓰지 않고 **진짜 파이프라인을 돌린다**:
fixture 서버 → `observeSelectedPages`(Task 09) → `analyzeSiteInteractions`(Task 10) →
`exploreSite`(Task 11). 1분의 wall clock을 쓰고 그 대가로 유일하게 중요한 것을 얻는다 — 앞 단계가
실제로 쓰는 바이트로 검증된다.

서버는 의도적으로 stateful이라 두 drift 케이스가 시뮬레이션이 아니라 진짜다.

| 케이스 | 기대 | 결과 |
| --- | --- | --- |
| §72 disclosure + 기존 target | resolved, aria-expanded 변화, target hidden→visible | PASS |
| §73 dynamic mount | before 없음 → after 존재, menuitem 3개 인벤토리 | PASS |
| §74 native details (닫힘→열림) | `open` false→true | PASS |
| §74 native details (열림→닫힘) | `open` true→false | PASS |
| §75 tab | aria-selected 변화 + tabpanel visibility 변화 | PASS |
| §76 checkbox | `checked` false→true (property) | PASS |
| §77 no-op button | 실행됨, `no-change`, error 아님 | PASS |
| §78 dynamic id drift | id-exact miss → semantic fallback → resolved | PASS |
| §79 ambiguous (semantic 2 + stale path) | `ambiguous`, click 0 | PASS |
| §22 duplicate nav (path 유효) | semantic 2 → structural-path가 **올바른 쪽** 선택 | PASS |
| §80 live disabled drift | resolved → `live-inoperable`, click 0 | PASS |
| §81 form submit | plan 단계 제외, 서버 hit 0 | PASS |
| §82 navigation | 차단, `/danger` 서버 hit 0 | PASS |
| §83 popup | 즉시 close, 기록 | PASS |
| §84 write request | POST 차단, 서버 hit 0, body 미저장 | PASS |
| §85 download | cancel, 기록 | PASS |
| §86/§67 context isolation | localStorage/body class 오염 0 | PASS |
| §87 mutation cap | 1000 mutation → cap + `truncated`, `no-change` | PASS |
| §88 shape dedup | `<details>` 10개 → action 1개 (memberCount 10) | PASS |
| §89 budget | 10 shape → 8 planned + 2 `budget` | PASS |
| §90 plan determinism | 배열/페이지 순서 반전에도 동일 | PASS |
| §109 navigated diff | container 변화가 `changed`를 선언하지 않음 | PASS |
| aria-label only 토글 | `candidate-attribute-change` 로 포착 | PASS |

추가로 커버: 모든 action의 Task 10 provenance · actionId 조밀 순열 · P3/guard/hidden 미계획 ·
`elementId` 미사용 · 양쪽 viewport 실행 · manifest actionId 정렬 · Zod round-trip · manifest 자기
byte 크기 · 절대 경로 미포함 · 원본 run 미기록 · action 실패 격리 · retry 0.

## domainchecker Results

5 page (representative 4 + validation sample 1) · 23 action (desktop 9 / mobile 14).

```
후보 374 → 계획 페이지 내 312 → eligible 98 → shape 23 → action 23
skip: guard 2 · hidden 145 · capability 67 · shape-duplicate 75
```

| 결과 | 수 |
| --- | --- |
| resolved | 23 / 23 (100%) |
| changed | 13 |
| no-change | 10 |

`no-change` 10건의 정체가 전부 밝혀졌다: **5건은 client-side navigation**(위 규칙), **5건은
테마 전환 버튼**이다. 후자는 mutation 9건(`class` 2, `style` 1)이 관측되므로 동작은 했지만 변화가
`<html>`의 class에만 나타나 state diff 어휘에 걸리지 않는다. 정직한 negative result다.

### §96 모바일 hamburger 검수 — **상태가 바뀐다**

```
stored    ic000013  e000042  P1  click+state-toggle+disclosure-trigger
          <button aria-label="메뉴" aria-expanded="false">   aria-controls 없음
locator   semantic-exact (aria-label 일치), matchCount 1, verified
          descriptor에 id 없음 → strategy A는 시도조차 안 함
live      clickOperable=true, blockers []
BEFORE    visible=true, aria-expanded="false"
CLICK
AFTER     visible=true, aria-expanded="true"
DIFF      candidate-attribute-change  aria-expanded  false → true
mutation  6건: aria-expanded 1, class 1, node +3/−1
STATUS    changed
```

mutation record가 메뉴가 실제로 열렸음을 보여준다.

```
class: "… md:hidden max-h-0 border"  →  "… md:hidden max-h-[80vh] o…"
```

drawer가 `max-h-0`에서 `max-h-[80vh]`로 펼쳐진다. 다만 그 drawer는 `role=menu`도 `aria-controls`도
없는 평범한 `<div>`라 container 인벤토리에 잡히지 않는다. 판정 근거는 `aria-expanded` 하나이고
그것으로 충분하다.

## seoworld Results

16 page · 23 action (desktop 5 / mobile 18).

```
후보 428 → 계획 페이지 내 388 → eligible 94 → shape 23 → action 23
skip: guard 14 · hidden 50 · priority 50 · capability 180 · shape-duplicate 71
```

| 결과 | 수 |
| --- | --- |
| resolved | 23 / 23 (100%) |
| changed | **23** |
| no-change | 0 |

### §97 P2 hamburger 검수 — **상태가 바뀐다 (규칙을 하나 고친 뒤)**

```
stored    ic000003  e000022  P2  click
          <button class="p-2" aria-label="메뉴 열기"><svg …></button>
          ARIA state 0개 · aria-controls 없음 · 직접 텍스트 ""
plan      "P2 icon-only native button" — 사이트별 예외 없이 global rule로 통과
locator   semantic-exact (aria-label "메뉴 열기"), matchCount 1, verified
live      buttonType="submit"(form 밖의 typeless button), hasForm=false → 정책 통과
          clickOperable=true
BEFORE    aria-label="메뉴 열기"
CLICK
AFTER     aria-label="메뉴 닫기"
DIFF      candidate-attribute-change  aria-label  "메뉴 열기" → "메뉴 닫기"
STATUS    changed
```

**이 사례가 이번 Task에서 규칙을 바꾼 두 번째 실측이다.** 첫 실행에서 이 action은 `no-change`였다.
snapshot의 attribute 어휘가 고정 목록(`aria-expanded` `aria-pressed` …)이었고 `aria-label`이 거기
없었기 때문이다. 결과를 의심해서 별도 Playwright 프로브로 직접 확인했다.

```
클릭 전  <button class="p-2" aria-label="메뉴 열기">  (햄버거 아이콘)
클릭 후  <button class="p-2" aria-label="메뉴 닫기">  (X 아이콘)
         + <nav class="flex flex-col gap-3">  mount, 화면에 보임
```

컨트롤은 **정상 동작하고 있었고 우리 캡처 어휘가 놓친 것**이었다. 그래서 snapshot이
`LIVE_ATTRIBUTE_NAMES` + **모든 `aria-*`**를 읽도록 고쳤다(`readLiveSignals`가 이미 하던 것과 동일).
"열기 → 닫기" label 전환은 컨트롤이 표현할 수 있는 가장 명확한 상태 변화 중 하나다.

이 한 줄 변경으로 seoworld는 7 changed → **23 changed**가 됐다. mobile 18건 중 16건이 이 hamburger
계열이다.

남은 한계는 정직하게 기록한다: mount된 `<nav>`는 role도 dialog도 `[aria-hidden]`도 아니라 container
인벤토리 셀렉터(§51)에 걸리지 않는다. 즉 **"메뉴가 열렸다"는 사실은 label 전환으로만 포착됐다.**

### §98 empty shell 검수

`/tools/domain-checker` 같은 빈 shell 페이지에서 이 Explorer가 도구 동작을 만들어내지 않았다.
그런 페이지의 계획된 action은 사이트 shell의 header 버튼과 hamburger뿐이고, login/signup 같은
navigation-like 컨트롤은 plan 단계에서 제외되거나(`guard` 14건) 실행되지 않았다.

`candidate-removed` 3건은 전부 닫기 버튼(`aria-label="닫기"`, `text="x"`)이고 클릭 후 자기 자신이
DOM에서 사라진다 — 배너/알림 닫기의 정확한 관측이다.

정적 candidate가 없던 tool interaction을 "없다"고 확정하지 않는다. 이번 Task도 그것에 대해 아무
주장을 하지 않는다.

## nextjs Results

14 page (representative 12 + validation sample 2) · 80 action (desktop 45 / mobile 35).

```
후보 1,376 → 계획 페이지 내 1,312 → eligible 659 → shape 118 → site budget 80
skip: guard 124 · hidden 405 · priority 64 · capability 60 · shape-duplicate 541 · budget 38
```

| 결과 | 수 |
| --- | --- |
| resolved | 80 / 80 (100%) |
| executed | 79 |
| changed | 45 |
| no-change | 34 |
| actionability-error | 1 |

`form-submit` guard로 plan에서 제외된 것이 96건이다 — Task 10이 발견한 "Geist 버튼이 form 밖에서도
`type=submit`을 출력한다"는 사실의 직접적 결과이고, 보수적으로 유지한 판단이 여기서 96번 발화했다.

### §99 unresolved control 핵심 검증 — **9/9 mount**

| 항목 | 값 |
| --- | --- |
| planned unresolved trigger | 9 |
| executed | 9 |
| **action 후 target mount** | **9** |
| still unresolved | 0 |
| action 실패 | 0 |
| 새로 등장한 interactive descendant | 18 |

Task 10이 남긴 118건의 unresolved `aria-controls` 중, shape dedup과 budget을 통과해 계획된 9건이
**전부** 클릭 후 target을 mount했다. 정적 관측의 경계가 실제로 넘어간 것이다.

```
##### CASE — nextjs dynamic unresolved control (ia000020, p000005, desktop)
stored    ic000012  e001359  P1  click+state-toggle+disclosure-trigger+select+open-options
          <button role="combobox" aria-label="Open directory select"
                  aria-expanded="false" aria-controls="radix-_R_2miubaaivb_">
locator   semantic-exact 2 → semantic-ancestor 2 → structural-path 1 verified → resolved
BEFORE    aria-expanded="false"
          target radix-_R_2miubaaivb_  resolved=false     ← DOM에 없음
          containers 158
CLICK
AFTER     aria-expanded="true"
          target radix-_R_2miubaaivb_  resolved=true  visible=true  descendants 2
          containers 184
DIFF      candidate-attribute-change  aria-expanded  false → true
          target-mounted              radix-_R_2miubaaivb_  false → true
          container-added × 26 (그중 div|radix-_R_2miubaaivb_|listbox)
          container-visibility-change × 5
mutation  40건: aria-hidden 24, style 10, aria-expanded 1, aria-selected 1
STATUS    changed
```

`container-added` 26건의 정체도 설명 가능하다. Radix가 열릴 때 나머지 페이지에 `aria-hidden="true"`를
붙이는데(modal 동작), container 셀렉터에 `[aria-hidden]`이 있으므로 그 element들이 갑자기 인벤토리에
들어온다. mutation의 `aria-hidden: 24`가 그 근거다. **판정은 그것에 의존하지 않는다** — `changed`는
`candidate-attribute-change` + `target-mounted`로 이미 성립한다.

### §100 tab 검수

```
##### CASE — nextjs tab (ia000027, p000006, desktop)
stored    ic000019  e003020  P1  click+state-toggle+tab-trigger
          <button id="_R_14naotbsnuiubaaivb_" role="tab" aria-selected="false"
                  aria-controls="_R_14naotbsnuiubaaivb_">npm</button>
          ← Task 10이 기록한 self-referential aria-controls (id == aria-controls)
locator   id-exact  matchCount 1 verified → resolved
BEFORE    aria-selected="false", aria-controls="_R_14naotbsnuiubaaivb_"
          target 해당 id  resolved=true visible=true
CLICK
AFTER     aria-selected="true",  aria-controls="_r_g_"     ← 값이 바뀜
          target _R_14naotbsnuiubaaivb_  resolved=false
DIFF      candidate-attribute-change  aria-selected  false → true
          candidate-attribute-change  aria-controls  _R_14naotbsnuiubaaivb_ → _r_g_
          candidate-replaced          (핸들 stale → 같은 locator로 재해결)
          target-unmounted            _R_14naotbsnuiubaaivb_
STATUS    changed
```

관측만 하고 사이트의 ARIA를 "수정"하지 않는다. self-referential `aria-controls`는 클릭 후 다른
생성 id로 바뀌고 원래 id는 사라진다 — Geist tab 컴포넌트가 재렌더되면서 id를 새로 발급하기
때문이다. 저장된 관측만으로는 알 수 없었고, **동적 id drift가 after 시점에도 일어난다**는 직접
증거다. 재해결이 없었다면 이 action은 `candidate-removed`로 잘못 기록됐을 것이다.

### 유일한 실행 오류

```
ia000067  p000012  mobile  "Switch to system theme" (role=radio, aria-checked=true)
locator   semantic-exact resolved
live      clickOperable=true, blockers []
click     TimeoutError: elementHandle.click: Timeout 10000ms exceeded
STATUS    actionability-error
```

footer의 테마 라디오가 모바일 뷰포트에서 클릭 가능한 상태로 안정되지 않았다. `force: true`는
금지이므로 그대로 기록했고, retry도 하지 않았다(§111). 80개 중 1개 실패가 나머지 79개에 아무
영향을 주지 않았다(§66).

## MDN Results

10 page (representative 9 + validation sample 1) · 35 action (desktop 20 / mobile 15).

```
후보 928 → 계획 페이지 내 846 → eligible 428 → shape 35 → action 35
skip: hidden 418 · shape-duplicate 393   (guard 0, priority 0, capability 0)
```

MDN은 후보가 전부 P1(`<summary>` + `aria-expanded` 버튼)이라 guard/priority/capability skip이 0이다.

| 결과 | 수 |
| --- | --- |
| resolved | 35 / 35 (100%) |
| changed | 33 |
| no-change | 2 |

### §101 details 검수 — **open/visibility 전이 포착됨**

```
##### CASE — MDN native details (ia000002, p000001, desktop)
stored    ic000010  e000477  <summary>  P1  click+state-toggle+disclosure-trigger
plan      representative of 10 candidates with this interaction shape
locator   semantic-ancestor 10 → structural-path 1 verified → resolved
          (summary는 aria-label도 name도 없고 text만 있어 형제와 겹친다 →
           ancestor로 10개까지 좁힌 뒤 DOM 위치가 결정)
BEFORE    target details  resolved=true visible=true  descendants 4   containers 10
CLICK
AFTER     동일 target, open이 바뀜
DIFF      open-change  container  details  false → true
          open-change  target     details  false → true
mutation  1건: open 1
STATUS    changed
```

928개 후보 중 35개만 클릭했고, `open-change` 26건 + `target-visibility-change` 10건 +
`candidate-attribute-change` 20건을 관측했다.

### no-change 2건 — guard가 발화한 사례

```
ia000005 / ia000026   <summary> 클릭
safety   navigation-blocked      GET  …/Learn_web_development/Getting_started/Environment_setup
         blocked-write-request   POST https://incoming.telemetry.mozilla.org/submit/mdn-fred/…
mutation 0건
STATUS   no-change
```

MDN 사이드바의 이 `<summary>`는 클릭 영역 안에 링크를 품고 있어서 클릭이 **navigation**이 됐다.
navigation guard가 차단했으므로 페이지는 그대로 있고, disclosure는 열리지 않았다. §110이 요구한
"locator는 맞지만 action 대상이 navigation" 케이스의 정확한 실례이며, 동시에 **navigation guard와
write guard가 실사이트에서 실제로 발화한 증거**다.

## Mobile vs Desktop

desktop action과 mobile action은 완전히 독립이다. 동일 logical control matching은 구현하지 않았고,
저장 디렉터리도 viewport별로 분리했다.

| site | desktop planned/executed/changed | mobile planned/executed/changed |
| --- | --- | --- |
| domainchecker.co.kr | 9 / 9 / 4 | 14 / 14 / 9 |
| seoworld.co.kr | 5 / 5 / 5 | 18 / 18 / 18 |
| nextjs.org | 45 / 45 / 27 | 35 / 34 / 18 |
| developer.mozilla.org | 20 / 20 / 18 | 15 / 15 / 15 |
| **합계** | **79 / 79 / 54** | **82 / 81 / 60** |

seoworld는 desktop 5 / mobile 18로 가장 비대칭이다. Task 10이 기록한 대로 데스크톱 컨트롤 다수가
모바일에서만 보이거나 반대이고, `hidden` skip이 viewport마다 다르기 때문이다. 이 비대칭이 그대로
드러나는 것이 viewport 독립 정책의 목적이다.

## Locator Success Metrics

| site | planned | resolved | not-found | ambiguous | semantic-mismatch |
| --- | --- | --- | --- | --- | --- |
| domainchecker.co.kr | 23 | 23 | 0 | 0 | 0 |
| seoworld.co.kr | 23 | 23 | 0 | 0 | 0 |
| nextjs.org | 80 | 80 | 0 | 0 | 0 |
| developer.mozilla.org | 35 | 35 | 0 | 0 | 0 |
| **합계** | **161** | **161 (100%)** | **0** | **0** | **0** |

strategy별:

| site | id-exact | semantic-exact | semantic-ancestor | structural-path |
| --- | --- | --- | --- | --- |
| domainchecker.co.kr | 0 | 11 | 0 | 12 |
| seoworld.co.kr | 0 | 19 | 0 | 4 |
| nextjs.org | **12** | 59 | 0 | 9 |
| developer.mozilla.org | 0 | 10 | 10 | 15 |
| **합계** | **12** | **99 (61.5%)** | **10** | **40 (24.8%)** |

읽는 법:

- **id로 해결된 것은 7.5%뿐이다.** 4개 사이트 중 3개는 계획된 컨트롤에 HTML id가 아예 없다.
  id를 identity의 truth로 삼는 설계였다면 161건 중 149건이 처음부터 불가능했다.
- **semantic이 주력(61.5%)이다.** `aria-label` / `text` / `name` 조합이 실사이트에서 가장 안정적인
  identity다.
- **structural-path 24.8%는 지울 수 없는 몫이다.** MDN의 `<summary>`(라벨도 이름도 없고 형제와
  텍스트가 겹침), seoworld의 아이콘 버튼, domainchecker의 반응형 중복 nav — 전부 DOM 위치가 유일한
  identity인 경우다. 초기 설계(D를 tie-break로 쓰지 않음)에서는 domainchecker 23건 중 10건이
  ambiguous였다.

## Action Results

| site | planned | executed | changed | no-change | live-inoperable | not-found | ambiguous | actionability | action-error | load-error |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| domainchecker.co.kr | 23 | 23 | 13 | 10 | 0 | 0 | 0 | 0 | 0 | 0 |
| seoworld.co.kr | 23 | 23 | 23 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| nextjs.org | 80 | 79 | 45 | 34 | 0 | 0 | 0 | 1 | 0 | 0 |
| developer.mozilla.org | 35 | 35 | 33 | 2 | 0 | 0 | 0 | 0 | 0 | 0 |
| **합계** | **161** | **160** | **114** | **46** | **0** | **0** | **0** | **1** | **0** | **0** |

change rate = 114 / 160 = **71.3%**.

## Safety Results

| 항목 | domainchecker | seoworld | nextjs | MDN | 합계 |
| --- | --- | --- | --- | --- | --- |
| form-submit로 plan 제외 | 2 | 2 | 96 | 0 | **100** |
| file-input로 plan 제외 | 0 | 0 | 0 | 0 | **0** |
| navigation guard로 plan 제외 | 0 | 0 | 0 | 0 | **0** |
| navigation attempt 차단 | 0 | 0 | 0 | **2** | **2** |
| popup attempt 차단 | 0 | 0 | 0 | 0 | **0** |
| download 차단 | 0 | 0 | 0 | 0 | **0** |
| write request 차단 (POST) | 0 | 0 | 0 | **12** | **12** |
| dialog dismiss | 0 | 0 | 0 | 0 | **0** |
| same-document navigation (차단 불가) | **5** | 0 | 0 | 0 | **5** |

0도 그대로 기록한다. `navigation` guard로 plan에서 제외된 것이 0인 이유는 Task 10의 링크 정책 때문이다 —
anchor가 하나도 후보가 되지 않았으므로 navigation guard를 달 대상이 없다. 반대로 **live navigation
차단이 2건 발화한 것**은 `<summary>` 안에 링크가 있는 MDN 구조 때문이고, plan 단계 guard만으로는
막을 수 없는 종류다. 두 층이 모두 필요하다는 직접 증거다.

차단된 POST 12건은 전부 Mozilla telemetry(`incoming.telemetry.mozilla.org`)다. §43대로 정상이고,
그 때문에 interaction이 동작하지 않은 흔적은 없다(같은 action의 mutation 0건은 navigation 차단
때문이지 telemetry 때문이 아니다). request body는 어디에도 저장되지 않았다.

## State Diff Results

| category | domainchecker | seoworld | nextjs | MDN | 합계 |
| --- | --- | --- | --- | --- | --- |
| `candidate-attribute-change` | 5 | 16 | 49 | 20 | **90** |
| `candidate-removed` | 0 | 3 | 0 | 0 | **3** |
| `candidate-replaced` | 0 | 0 | 6 | 0 | **6** |
| `target-mounted` | 0 | 0 | **9** | 0 | **9** |
| `target-unmounted` | 0 | 0 | 6 | 0 | **6** |
| `target-visibility-change` | 0 | 0 | 0 | 10 | **10** |
| `container-added` | 96 | 0 | 229 | 0 | **325** |
| `container-removed` | 114 | 4 | 0 | 0 | **118** |
| `container-visibility-change` | 0 | 0 | 44 | 0 | **44** |
| `checked-change` | 0 | 2 | 0 | 0 | **2** |
| `open-change` | 16 | 4 | 4 | 26 | **50** |
| `url-change` | 5 | 0 | 0 | 0 | **5** |
| mutation cap 도달 | 0 | 0 | 0 | 0 | **0** |

세부 전이:

- `aria-expanded` 변화 · `aria-selected` 변화 · `aria-controls` 값 변화 · `aria-label` 변화가
  `candidate-attribute-change` 90건의 내용이다.
- `checked` 변화 2건은 seoworld의 체크박스(DOM property로 읽었기 때문에 잡혔다).
- `<details>` open 변화 50건.
- mutation은 총 1,668건 관측됐고 **cap(500)에 도달한 action은 0건**이다.

### §109 changed false positive 전수 검수

114건 전부를 category signature로 그룹핑해 확인했다.

| 건수 | signature |
| --- | --- |
| 28 | `candidate-attribute-change` (nextjs) |
| 16 | `candidate-attribute-change` (seoworld) |
| 13 | `open-change` (MDN) |
| 10 | `candidate-attribute-change` (MDN) |
| 10 | `candidate-attribute-change` + `target-visibility-change` (MDN) |
| 9 | `candidate-attribute-change` + `container-added` + `container-visibility-change` + `target-mounted` (nextjs) |
| 8 | `open-change` (domainchecker) |
| 6 | `candidate-attribute-change` + `candidate-replaced` + `target-unmounted` (nextjs) |
| 5 | `candidate-attribute-change` (domainchecker) |
| 2 | `candidate-removed` + `container-removed` (seoworld) |
| 2 | `open-change` (nextjs) |
| 2 | `checked-change` (seoworld) |
| 1 | `candidate-removed` (seoworld) |

**container 인벤토리 변화만으로 `changed`가 된 action은 114건 중 0건이다.** 모든 판정이 candidate
자신의 상태 · 선언된 target · native `<details>` open 중 하나에 anchored돼 있다. `container-added`
325건은 전부 다른 근거를 가진 action에 딸려 있고(nextjs 9건의 Radix modal `aria-hidden` 동작,
domainchecker의 navigate된 5건), 후자는 `url-change` 규칙으로 이미 `changed`에서 제외됐다.

## No-change Analysis

46건 전부의 원인을 구분 가능한 범위에서 기록했다. **자동 retry는 하지 않았다.**

| 원인 | 건수 | 근거 |
| --- | --- | --- |
| client-side navigation (URL 변경) | 5 | domainchecker `<a href><button>가격</button></a>` |
| class/style로만 상태를 표현 | 5 | domainchecker 테마 전환 (mutation `class` 2, `style` 1) |
| 이미 그 상태 (3-state 테마 토글의 "system") | 27 | nextjs "Switch to system theme" |
| 이미 선택된 tab | 6 | nextjs "pnpm" tab (aria-selected 이미 true) |
| clipboard 동작 (관측 대상 상태 없음) | 1 | nextjs "Copy npx command…" |
| navigation guard 차단 | 2 | MDN `<summary>` 안의 링크 |

**wrong candidate로 인한 no-change는 0건이다** — 46건 전부 locator가 resolved + verified였고 원인이
컨트롤 자신의 성질이다. animation settle 부족으로 의심되는 사례도 없었다(전이가 있었던 action은
모두 `2×rAF + 600ms` 안에 관측됐다).

가장 많은 27건은 shape dedup의 정직한 대가다. nextjs footer 테마 스위처는
`aria-checked=false`인 라디오와 `true`인 라디오가 서로 다른 shape이고, 대표로 뽑힌 것이 "이미
선택된 system" 쪽인 페이지가 많았다. 이것을 피하려면 "선택되지 않은 것을 우선"이라는 규칙이
필요한데, 그것은 shape key가 아니라 **대표 선택 규칙**을 바꾸는 일이라 이번 Task에서는 하지 않고
측정만 기록한다(다음 Task 후보).

## Storage

| site | plan | actions | manifest | 합계 | action당 평균 |
| --- | --- | --- | --- | --- | --- |
| domainchecker.co.kr | 99.5 KB | 524.2 KB | 13.5 KB | **637.3 KB** | 22.8 KB |
| seoworld.co.kr | 112.8 KB | 169.7 KB | 16.8 KB | **299.3 KB** | 7.4 KB |
| nextjs.org | 412.5 KB | 2,292.1 KB | 39.2 KB | **2,743.8 KB** | 28.7 KB |
| developer.mozilla.org | 241.6 KB | 656.4 KB | 20.3 KB | **918.3 KB** | 18.8 KB |
| **합계** | **866.4 KB** | **3,642.4 KB** | **89.9 KB** | **4.49 MB** | **28.0 KB** |

Task 09 관측 350.86 MB 대비 **1.28%**, Task 10 추가분 4.18 MB와 거의 같은 규모다.

`plan`이 전체의 19%나 되는 것은 의도적이다 — **모든** 비계획 후보(2,697건)를 이유와 함께 담기
때문이다. 아무것도 조용히 버리지 않는다는 원칙의 실제 비용이 866 KB다.

screenshot은 기본 OFF다(§112). Task 09에서 screenshot이 전체 바이트의 45.7%였고, 이 단계가 필요로
하는 behavior proof는 이미지가 아니라 DOM/state diff다. 전체 DOM/HTML 복제도 없다 — fixture가
action artifact에 `<div`, `<button`, `outerHTML` 문자열이 없음을 검사한다.

## Performance

| site | action | wall time | 총 load time | action당 평균 |
| --- | --- | --- | --- | --- |
| domainchecker.co.kr | 23 | 56.6 s | 93.3 s | 4,786 ms |
| seoworld.co.kr | 23 | 45.5 s | 68.3 s | 3,865 ms |
| nextjs.org | 80 | 180.2 s | 277.0 s | 4,449 ms |
| developer.mozilla.org | 35 | 59.6 s | 89.9 s | 3,300 ms |
| **합계** | **161** | **341.9 s** | **528.5 s** | **4,143 ms** |

**총 load time(528.5 s)이 wall time(341.9 s)보다 큰 것**이 concurrency 2가 실제로 작동했다는 뜻이고,
동시에 **page reload가 지배적 비용**이라는 뜻이다. action당 4.1초 중 대부분은 goto + bounded
networkidle + 1초 settle이다. Chromium launch는 사이트당 1회(~85 ms)로 무시할 수 있다.

fresh context per action은 **안전성을 위한 의도적 선택**이다(§115). 페이지 재사용 최적화는 하지
않았다. 실측을 남기고 다음 E2E optimization backlog로 넘긴다: 같은 (page, viewport)의 action을
묶어 한 번 로드하면 161회 로드가 약 45회로 줄지만, 그 순간 action 간 격리가 사라지고 "이 변화가
직전 action 때문인가"라는 질문이 생긴다. 그 교환은 별도 Task에서 판단할 문제다.

## Existing Artifact Immutability

4개 사이트 live 실행 전후로 site run 아래 **Task 09/10 파일 840개**의 mtime과 크기를 전수 비교했다.

```
find data/*/site-observations -type f -exec stat -f '%m %z %N' {} + | sort
→ before/after diff: 차이 없음 (840 files)
```

`site-observation.json`, `interaction-analysis.json`, `interaction-candidates.json`,
`observation.json`, `dom.json`, `styles.json`, `rendered.html`, `assets.json`, `links.json`,
`frames.json`, `screenshot.png` 전부 그대로다.

구조적으로도 보장된다: `store.ts`는 원본 디렉터리 경로를 만들 수 없고, 모든 출력이
`data/<host>/interaction-explorations/<run-id>/` 아래로만 간다. fixture도 이것을 검사한다.

## Problems Encountered

**1. `request.frame()`이 throw한다.** popup의 최초 navigation request는 프레임이 생기기 전에
발행되므로 `request.frame()`이 예외를 던진다. 첫 실행이 여기서 죽었다. → try/catch로 감싸고 그런
요청은 main frame일 수 없다고 처리(popup guard가 창을 닫는다).

**2. locator strategy D의 범위 (설계 판단).** 처음에는 "semantic이 아무것도 못 찾았을 때만 D"로
구현했고, domainchecker 23건 중 10건이 ambiguous가 됐다. 원인은 반응형 사이트의 **desktop/mobile
중복 nav markup**이었다. §22가 D를 정식 단계로, §79가 "path로도 구별 불가"일 때만 ambiguous로
규정한 것을 다시 읽고, **D가 semantic match 집합 안에서만 좁히도록** 바꿨다. → ambiguous 10 → 0,
전체 해결률 100%.

**3. client-side navigation이 화려한 false `changed`를 만든다.** domainchecker의
`<a href><button>가격</button></a>` 클릭이 Next.js 라우터로 문서를 교체해 container 96 추가 /
113 제거를 만들었다. 네트워크 요청이 없으므로 어떤 route guard도 볼 수 없다. → URL이 바뀌면
`meaningfulChange`를 무조건 false로 만들고 `same-document-navigation` safety event를 남긴다.
false `changed` 5건 제거.

**4. 고정 attribute 어휘가 진짜 상태 변화를 놓쳤다.** seoworld hamburger가 `no-change`로 나와서
의심스러워 별도 프로브로 직접 확인했더니 컨트롤은 정상 동작하고 있었고(`aria-label` 열기↔닫기 +
`<nav>` mount) 우리 snapshot이 `aria-label`을 읽지 않고 있었다. → snapshot도
`readLiveSignals`처럼 **모든 `aria-*`**를 읽도록 통일. seoworld changed 7 → 23.

**5. fixture에서 두 컨트롤이 같은 shape로 합쳐졌다.** `aria-label` 토글 테스트용 아이콘 버튼을
no-op 아이콘 버튼과 같은 페이지에 뒀더니 shape가 동일해서 dedup됐다(대표는 문서 순서상 앞선 쪽).
버그가 아니라 정책이 정확히 작동한 것이라 fixture를 고쳤다 — 다른 페이지로 옮김.

## Technical Decisions

**`elementId`를 locator로 쓰지 않는다.** 이 Task 전체가 이 결정 위에 서 있다. 대신 offline에서
`LocatorDescriptor`를 만들고 live에서 4개 exact strategy로 재식별한다.

**magic similarity score를 만들지 않았다.** 유사도 점수는 임계값을 만들고, 임계값은 사이트별 튜닝을
부른다. 대신 0/1/N을 돌려주는 exact predicate 4개를 사다리로 쓴다.

**`ambiguous`는 실패가 아니라 정답이다.** 똑같이 그럴듯한 후보가 둘이면 아무것도 클릭하지 않는다.
False action이 missed action보다 위험하다.

**복원은 context 폐기다.** "닫기 버튼을 다시 누른다" 같은 로직은 대칭성을 가정하는데, 그 대칭성이
측정 대상이다.

**boolean state는 attribute가 아니라 property에서 읽는다.** 그렇지 않으면 체크박스 토글이
`no-change`가 된다. §48의 형태에서 벗어나 `attributes`와 `state`를 분리한 이유이고, 분리하지 않으면
property를 attribute라고 부르게 된다.

**mutation은 진단이지 판정 근거가 아니다.** 살아있는 페이지는 클릭 여부와 무관하게 계속 변한다.
1,668건의 mutation을 기록했지만 그것만으로 `changed`가 된 action은 0건이다.

**`characterData`는 관측하지 않는다.** 시계 · 카운터 · analytics 텍스트가 지배하는 채널이고,
§59가 이미 텍스트 변화를 제외한다.

**skipped[]에 전부 남긴다.** 2,697건, plan 파일의 19%. "3,106 → 161"이 추적 가능한 감소여야지
갑자기 나타난 숫자여서는 안 된다.

**Observer를 확장하지 않았다.** `ATTR_WHITELIST`를 넓혀 52페이지를 재관측하는 대신 action 직전에
live에서 읽는다. 더 싸고 더 정확하다 — 며칠 전 상태가 아니라 클릭 직전 상태다.

**screenshot 기본 OFF.** Task 09에서 screenshot이 전체 바이트의 45.7%였고, 이 단계의 증거는
DOM/state diff다.

**site budget은 priority 우선으로 자른다.** 사이트가 잘릴 때 마지막 페이지가 아니라 가장 약한
증거를 잃는다.

## Current Limitations

**1. container 인벤토리 셀렉터 밖의 영역은 보이지 않는다.** seoworld의 mobile `<nav>`와
domainchecker의 drawer `<div>`는 role도 `[aria-hidden]`도 `<dialog>`도 아니라서 인벤토리에 들어오지
않는다. 두 경우 모두 candidate 자신의 attribute 변화로 판정됐지만, **컨트롤이 상태를 attribute로도
표현하지 않는 사이트에서는 `no-change`가 나올 수 있다.**

**2. class / style만으로 상태를 표현하는 컨트롤을 판정하지 못한다.** domainchecker 테마 전환 5건이
그 예다. mutation summary에는 남지만 §59가 mutation만으로 `changed`를 선언하지 못하게 한다.
의도적 보수성이고, 완화하면 animation tick이 전부 `changed`가 된다.

**3. `<details>`의 초기 open 상태를 저장 데이터로 구분할 수 없다.** Observer가 `open` 속성을
저장하지 않으므로 열린 `<details>`와 닫힌 `<details>`가 같은 shape이 된다. 대표가 어느 쪽인지는
문서 순서가 정한다. (live에서는 `open` property를 읽으므로 diff는 정확하다.)

**4. shape 대표 선택이 "이미 그 상태"인 컨트롤을 고를 수 있다.** nextjs 테마 스위처 27건이 그
결과다. shape key가 아니라 대표 선택 규칙의 문제이고, 이번 Task에서는 측정만 했다.

**5. WebSocket / Service Worker는 차단하지 않는다.** 안전한 공식 API가 없고 monkeypatch는 금지다.

**6. `history.pushState`는 막을 수 없다.** 기록하고 diff를 무효화하는 것이 전부다.

**7. 1 action depth.** 새로 mount된 menu의 menuitem을 클릭하지 않는다. 인벤토리만 남긴다.

**8. desktop ↔ mobile matching 없음.** 의도적 제외.

**9. Shadow DOM / iframe 내부는 여전히 보이지 않는다.** Task 09/10의 한계가 그대로 이어진다.

**10. retry 없음.** nextjs의 actionability-error 1건은 재시도하면 성공할 수도 있지만, 실패율을
있는 그대로 측정하는 것이 이번 Task의 목적이다.

## Next Task Recommendation

**Task 12 — Interaction Pattern Modeling & Unknown Interaction Strategy.**

```
Verified State Transitions   (Task 11 InteractionObservation 161건)
  → Deterministic Pattern Registry
  → Known Interaction Patterns      disclosure / tabs / dialog / menu / toggle …
  → Unknown Cases                   rule explorer가 판정하지 못한 것
  → AI Explorer Fallback            남은 것에만
```

이번 결과가 그 입력을 직접 만든다.

- `candidate-attribute-change` 90건 — 대부분 `aria-expanded` / `aria-selected` / `aria-label` 전이
- `open-change` 50건 — native `<details>`
- `target-mounted` 9건 + descendant 인벤토리 18건 — 열려야 존재하는 영역
- `target-visibility-change` 10건
- `no-change` 46건 — 그중 원인이 기록된 것 전부가 unknown case 후보

같이 검토할 것: shape 대표 선택 규칙(위 한계 4), container 인벤토리 셀렉터 확장 여부(한계 1),
그리고 action 묶기 최적화(Performance 참조).

추천만 하고 구현하지 않는다. 이번 Task는 pattern 이름을 한 번도 쓰지 않았다.

## Changed Files

**신규**

```
src/interaction-explorer/types.ts
src/interaction-explorer/load-analysis.ts
src/interaction-explorer/build-locator.ts
src/interaction-explorer/plan-actions.ts
src/interaction-explorer/resolve-live-candidate.ts
src/interaction-explorer/reconcile-live-state.ts
src/interaction-explorer/safety-guards.ts
src/interaction-explorer/capture-state.ts
src/interaction-explorer/diff-state.ts
src/interaction-explorer/execute-action.ts
src/interaction-explorer/explore-site.ts
src/interaction-explorer/store.ts
src/interaction-explorer/index.ts
src/cli-explore-interactions.ts
scripts/smoke-interaction-explorer.ts
docs/result/11-safe-rule-based-interaction-exploration-2026-08-13.md
```

**수정**

```
package.json   explore:interactions / smoke:interaction-explorer 스크립트 추가
README.md      파이프라인 + Task 11 절 + CLI + 출력 구조 + 프로젝트 구조 갱신
ROADMAP.md     Phase 5 완료 반영, Task 12 추천
```

**observer / multi-observer / selector / verifier / interaction-detector 코드는 한 줄도 수정하지
않았다.**

## Reviewer Checklist

| 명령 | 결과 |
| --- | --- |
| `pnpm typecheck` | PASS |
| `pnpm smoke:verifier` | 81/81 PASS |
| `pnpm smoke:selector` | 81/81 PASS |
| `pnpm smoke:multi-observer` | 58/58 PASS |
| `pnpm smoke:interaction-detector` | 92/92 PASS |
| `pnpm smoke:interaction-explorer` | **95/95 PASS** |
| 4개 실사이트 실행 | PASS (161 action, Firecrawl 0 / AI 0) |
| Task 09/10 artifact mutation | **0** (840 파일 mtime+size 동일) |
| plan 결정성 | PASS (실데이터 2회 byte 동일) |

특히 확인해 주기 바라는 판단:

1. **locator strategy D의 범위** — semantic match 집합 안에서만 좁히도록 한 결정. 반응형 중복
   markup을 살리기 위해 필요했지만, "집합 안이면 어느 쪽을 눌러도 semantic은 동일"이라는 논거가
   충분히 강한지. (`resolve-live-candidate.ts` 모듈 헤더)
2. **URL 변경 시 diff 무효화** — `meaningfulChange`를 무조건 false로 만드는 것이 지나치게 강한지.
   candidate 자신의 attribute 변화만 살리는 안도 가능했다. (`diff-state.ts`)
3. **snapshot이 모든 `aria-*`를 읽는 것** — `aria-label`에 카운터가 들어있는 사이트에서 false
   `changed`를 만들 수 있다. (`capture-state.ts` `readAttributes`)
4. **P2 icon-only button 허용 (텍스트 ≤ 2자)** — global rule로서 적절한 경계인지.
5. **shape 대표를 candidateId 최소로 뽑는 것** — nextjs 테마 스위처 27건의 `no-change`가 그 대가다.
6. **container 인벤토리 셀렉터** — seoworld `<nav>` / domainchecker drawer를 놓친다.
7. **fresh context per action의 비용** — 161회 로드, 528초. 안전성과의 교환이 옳은지.

---

## 검수자가 반드시 확인할 12가지 (§132)

**1. 3,106 candidates가 실제 몇 actions로 줄었는가?**

**161개.** 감소 경로 전체가 `interaction-plan.json`에 기록돼 있다.

```
3,106  Task 10 후보 (4개 사이트 52페이지)
  ↓    page selection: representative 41 + 차이 있는 validation sample 4 = 45 페이지
2,858  계획 페이지 내 후보
  ↓    guard 140 · hidden 1,018 · priority 114 · capability 307
1,279  eligible
  ↓    shape dedup 1,080 (84.4% 감소)
  199  interaction shape
  ↓    budget 38 (nextjs site cap만 발화)
  161  planned action   → 실행 160, changed 114
```

**2. Locator unique resolution rate는 몇 %인가?**

**100% (161/161).** not-found 0, ambiguous 0, semantic-mismatch 0. 초기 설계에서는 93.8%였고
(domainchecker 10건 ambiguous), strategy D 범위를 고친 뒤 100%가 됐다.

**3. ID exact가 실패하고 semantic fallback으로 성공한 실제 사례가 있었는가?**

실사이트 161건에서는 **없다.** id를 가진 149건은 애초에 descriptor에 id가 없어서 strategy A를
시도조차 하지 않았고(4개 사이트 중 3개는 계획된 컨트롤에 HTML id가 없다), nextjs의 12건은 id가
그대로 유효했다(같은 배포 · 같은 hydration id).

fixture에는 있다. 서버가 요청마다 새 id를 발급하는 `/tabs`에서 `id-exact matchCount 0` →
`semantic-exact matchCount 1 verified` → resolved가 검증된다.

실사이트에서 id drift는 **after 시점에** 관측됐다: nextjs tab 클릭 후 `aria-controls`가
`_R_14naotbsnuiubaaivb_` → `_r_g_`로 바뀌고 노드가 교체됐다(`candidate-replaced`). 같은 locator로
재해결하지 않았다면 `candidate-removed`로 잘못 기록됐을 것이다.

**4. ambiguous locator는 몇 건인가?**

**0건.** 위 2번 참조. 초기 설계에서 10건이었고 원인은 전부 반응형 중복 nav markup이었다.

**5. changed / no-change 비율은?**

**114 / 46 (실행 160건 중 changed 71.3%).** 사이트별로 크게 다르다: seoworld 100%, MDN 94.3%,
nextjs 57.0%, domainchecker 56.5%. 낮은 쪽의 원인은 전부 위 "No-change Analysis"에 분해돼 있다.

**6. nextjs unresolved control이 action 후 몇 건 resolve됐는가?**

**9건 계획 → 9건 실행 → 9건 전부 mount (100%).** still unresolved 0, 실패 0. 새로 등장한
interactive descendant 18개를 인벤토리로 남겼다(클릭하지 않았다). Task 10의 118건 중 shape dedup과
budget을 통과해 계획된 것이 9건이다.

**7. domainchecker mobile hamburger는 실제로 상태가 바뀌었는가?**

**바뀐다.** `aria-expanded` false → true. mutation record가 drawer가 `max-h-0` → `max-h-[80vh]`로
펼쳐지는 것도 보여준다. locator는 `aria-label="메뉴"`로 semantic-exact 해결(id 없음).

**8. seoworld P2 hamburger는 실제로 상태가 바뀌었는가?**

**바뀐다 — 그리고 이것이 규칙 하나를 고치게 만들었다.** `aria-label` "메뉴 열기" → "메뉴 닫기".
ARIA state가 하나도 없고 텍스트가 빈 `<button>`이라 P2 icon-only 허용으로 계획됐다(사이트별 예외
없음). 첫 실행에서는 snapshot이 `aria-label`을 읽지 않아 `no-change`였고, 별도 프로브로 직접 확인해
컨트롤이 정상 동작함을 확인한 뒤 snapshot이 모든 `aria-*`를 읽도록 고쳤다. mount된 `<nav>` 자체는
container 인벤토리 셀렉터 밖이라 여전히 보이지 않는다(한계 1).

**9. MDN details는 실제 open/visibility transition이 잡혔는가?**

**잡혔다.** `open-change` 26건 + `target-visibility-change` 10건 + `candidate-attribute-change`
20건. 928개 후보 중 35개만 클릭했다(shape dedup 393 + hidden 418). 대표 하나가 최대 28개 후보를
대신했다.

**10. navigation/write/popup/download safety guard가 실제로 발화했는가?**

실사이트에서 **navigation 2건 · write(POST) 12건**이 발화했다(둘 다 MDN). popup 0, download 0 —
이 4개 사이트가 클릭으로 창을 열거나 파일을 받지 않았다는 뜻이며 0도 그대로 기록했다.
plan 단계에서는 `form-submit` guard로 100건이 제외됐다(nextjs 96).

fixture에서는 4종 전부 발화하고, **서버 쪽 hit counter로도 검증한다**: `/danger` 0회,
`/api/save`(POST) 0회, `/api/form`(POST) 0회. request body(`secret-body`)가 어떤 artifact에도
없음을 문자열 수준에서 검사한다.

차단할 수 없는 것도 기록했다: `history.pushState` 5건(domainchecker).

**11. fresh context 때문에 action 간 state contamination이 없었는가?**

**없다.** fixture가 실증한다 — 한 action이 `localStorage`를 쓰고 `body` class를 추가하며, 페이지는
로드 시 오염이 있으면 `#contaminated` 컨테이너를 만든다. 161개 action 어디의 before/after에도
그 컨테이너가 없고, 오염시킨 action 자신의 after에는 마커가 있다(클릭이 실제로 실행됐다는 증거).

실사이트에서도 같은 페이지의 여러 action이 서로 다른 결과를 냈다는 것이 간접 증거다 —
domainchecker `p000001`에서 hamburger(changed)와 테마 전환(no-change)이 순서와 무관하게 각자의
결과를 유지했다.

**12. 어떤 interaction은 현재 rule explorer로도 알 수 없었는가?**

여섯 가지다.

- **class/style로만 상태를 표현하는 컨트롤** — domainchecker 테마 전환 5건. mutation에는 보이지만
  §59가 mutation만으로 판정하지 못하게 한다.
- **ARIA도 role도 없는 영역의 열림** — seoworld mobile `<nav>`, domainchecker drawer `<div>`.
  container 인벤토리 셀렉터 밖이다.
- **이미 목표 상태인 컨트롤** — nextjs 테마 스위처 27건, tab 6건. shape 대표 선택 규칙의 문제.
- **navigation이 목적인 컨트롤** — MDN `<summary>` 안의 링크 2건. 차단했으므로 disclosure 동작을
  볼 수 없었다(안전을 위한 false negative, §43).
- **1 depth 밖의 모든 것** — 열린 menu 안의 menuitem 18개는 인벤토리만 있고 동작은 모른다.
- **Shadow DOM / iframe 내부** — Task 09/10부터 이어지는 원리적 한계.

이 목록이 Task 12의 Unknown Cases 입력이다.
