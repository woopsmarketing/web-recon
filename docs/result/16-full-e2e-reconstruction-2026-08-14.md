Task: 16
Title: Full End-to-End Reconstruction
Previous: 15-reconstruction-qa-and-automated-correction-loop-2026-08-14.md
Status: Complete

# Task 16 — Full End-to-End Reconstruction

> **후속 정정 (2026-08-16).** 이 문서의 측정값은 실행 당시의 기록 그대로 두되,
> 이후 correction에서 **틀린 것으로 확인된 귀속 두 가지**를 여기서 밝힌다.
> 자세한 내용은 `16-final-hydration-correction-2026-08-16.md`.
>
> 1. **React #418의 원인.** 이 문서는 inline SVG를 "가장 강한 상관"으로 지목하고
>    attribute/text 불일치 쪽으로 추정했다. 실제 원인은 **`<li>` 안의 `<li>`**
>    — script가 만든, HTML parser로는 만들 수 없는 DOM edge였다. React dev
>    진단이 그대로 말해 준다: `In HTML, <li> cannot be a descendant of <li>.`
> 2. **"hydration error가 15 unverifiable behavior를 완전히 설명한다".**
>    **설명하지 않는다.** hydration을 0으로 만든 뒤에도 unverifiable은 15로
>    남았다. 진짜 원인은 별개의 결함, pseudo-element의 `z-index` 누락이었다.
>    두 결함이 같은 header에 있어 상관관계가 완벽했을 뿐이다.
>
> 정정 후 같은 사이트 재측정: hydration **30 → 0**, behavior unverifiable
> **15 → 0** (equivalent 28/28), `inferred-breakpoint-runtime-defect` **3 → 0**,
> static fidelity 퇴행 없음.

## 작업 목표

Task 01~15는 각 단계를 만들었다. 이번 Task의 질문은 하나다.

> **아무도 본 적 없는 public URL 하나를 넣으면, 독립적으로 실행되는 Next.js
> 애플리케이션이 나오고, 그것이 원본과 얼마나 다른지 측정되고, 다른 이유가
> stage 단위로 귀속되는가?**

이것은 새 architecture Task가 아니다. 새 관측도, 새 해석도, 새 생성도 추가하지
않는다. 추가하는 것은 두 가지다.

1. **Task 15가 root cause를 확정한 upstream defect 세 개 + 이름만 붙일 수 있었던
   한 개를 실제로 고친다** (Phase A).
2. **13개 stage를 한 process에서 각 모듈의 public API로 연결한다** (Phase B).

그리고 마지막 조건이 이 Task의 성격을 결정한다. **완료 조건은 "모든 사이트를
100% pixel-perfect하게 복제"가 아니다** (item 154). 그것은 public browser
observation만으로 항상 가능한 명제가 아니다. 완료 조건은 위 문장 전체가 실제로
작동함을 fresh URL로 증명하는 것이고, 증명하지 못한 부분을 정확히 이름 붙이는
것이다.

## Final Pipeline

```
URL
 → Discovery              Firecrawl Map                     [network]
 → Verification           Playwright, 후보 1회 방문           [browser]
 → Selection              family + representative           [offline]
 → Deep Observation       desktop + mobile 전체 관측          [browser]
 → Interaction Detection  무엇을 만질 수 있는가                [offline]
 → Interaction Exploration 실제로 눌러서 무엇이 바뀌는가        [browser]
 → Pattern Modeling       이름 붙일 수 있는 것만 이름 붙임       [offline]
 → SiteSpec               self-contained reconstruction IR   [offline]
 → Next.js Reconstruction SiteSpec만 읽어서 앱 생성            [offline]
 → next build             진짜 애플리케이션인지 증명            [offline]
 → QA (+ --auto-fix)      snapshot ↔ live original ↔ clone   [browser]
 → [Family Escalation]    잘못 대표된 route만 정확히 재관측 →
                          recompile → rebuild → re-QA        [browser]
 → Final Validation       생성된 앱의 독립성 감사               [offline]
 → data/<host>/e2e-runs/<run-id>/e2e-manifest.json
```

`pnpm e2e:reconstruct <url>` 하나로 위 전체가 한 process에서 실행된다.

## What This System Is

**browser-observable result를 reconstruction source로 쓰는 시스템**이다.

원본이 WordPress인지 그누보드인지 PHP인지 React인지 Vue인지 몰라도 된다. 몰라도
되는 이유는 관대해서가 아니라, **파이프라인의 어느 코드도 그것을 읽지 않기
때문이다.** Observer는 `getComputedStyle`과 `getBoundingClientRect`를 읽고,
Explorer는 클릭하고 전후를 비교하며, SiteSpec은 그 결과를 framework-neutral IR로
compile하고, Task 14는 그 IR만 읽는다. 원본 stack이 분기 조건으로 등장하는 지점이
하나도 없다 (item 47, 48).

## What This System Is Not

- **원본 source code를 복사하는 시스템이 아니다.** 생성된 앱에 원본 JS 번들 0,
  원본 stylesheet 0, inline handler 0, 원본 `class` 속성 재구성 0.
- **pixel-perfect cloner가 아니다.** PASS threshold도, 종합 점수도 만들지 않는다
  (item 132). dimension별 raw metric과 명시된 limitation만 있다.
- **crawler가 아니다.** URL 상한 기본 20, 하드 상한 40, concurrency 기본 2.
- **bypass 도구가 아니다.** bot protection·auth wall을 우회하지 않는다. 막히면
  `blocked`라고 보고한다 (items 146, 147).

## Origin Stack Independence

`pnpm e2e:reconstruct`의 어떤 stage도 원본의 framework/CMS를 읽고 분기하지
않는다. 구조적으로 그렇다:

- Observer는 `<meta name="generator">`, `window.__NEXT_DATA__`,
  `wp-content/` 같은 신호를 **행동의 입력으로 쓰는 코드 경로가 없다**. 그런
  문자열이 DOM에 있으면 다른 모든 텍스트와 똑같이 text node로 기록될 뿐이다.
- SiteSpec 스키마에 framework 개념이 없다 (React·Next.js·Vue·Tailwind 어느
  단어도 등장하지 않는다).
- Task 14의 출력 stack은 SiteSpec 내용과 무관하게 고정이다: Next.js + React +
  TypeScript + generated exact CSS.

생성된 앱의 dependency 목록은 아래 **Generated Stack**에 그대로 실려 있다.

---

## Phase A Upstream Hardening

Task 15는 upstream을 고치지 않고 (item 167) 발견한 것을 stage와 함께 보고했다.
Task 16 Phase A는 그중 **root cause가 확정된 것만** 고친다. 각 항목은 synthetic
fixture **와** 원래 증거를 만들어낸 실제 페이지 canary 양쪽으로 검증했다.

| # | 문제 | Task 15 증거 | 수정 위치 |
| --- | --- | --- | --- |
| A1 | asset occurrence mapping 손실 | nextjs.org `asset-missing` 325건 전부 | `src/observer/collect-assets.ts` |
| A2 | 중첩 scroll offset 미관측 | MDN median y delta 19,739px | observer → sitespec → reconstruction → runtime |
| A3 | grid 배치 property 부재 | MDN `grid-template-rows` 78 / `columns` 74 | `src/observer/types.ts` STYLE_WHITELIST |
| D | dynamic target 내용 미관측 | nextjs menu 9/9 `dynamic-target-content-unobserved` | explorer → sitespec → reconstruction → runtime |

## Asset Occurrence Mapping Fix

**문제.** `deriveAssets()`가 URL asset을 `type|url`로 dedup했다. 같은 파일을
가리키는 두 번째 `<img>`는 asset record를 아예 받지 못했고, record가 없으니
`elementId`도 없었고, Task 13은 그 node를 `assetRefs: []`로 compile했고, Task 14는
`src` 없는 `<img>`를 렌더했다.

**수정.** 두 개념을 분리했다.

```
asset IDENTITY    같은 파일은 하나. dedup은 SiteSpec asset catalog에서
                  `kind + url + descriptor`로 계속 일어난다 (item 8).
asset OCCURRENCE  어떤 element가 그것을 쓰는지는 element마다 유지한다.
```

element가 있는 asset의 dedup key는 `type|url|descriptor|elementId`가 되고,
element가 없는 document-level asset(`icon`, `font`)은 `type|url`을 유지한다.
보존해야 할 occurrence가 없기 때문이다.

**Canary — `https://nextjs.org/` 재관측 (desktop).**

| | before (구 dedup 재현) | after |
| --- | ---: | ---: |
| `<img>` element | 57 | 57 |
| asset ref를 가진 `<img>` | 39 | **57** |
| **mapping 손실** | **18** | **0** |
| catalog unique asset | 124 | **124** (증가 0) |
| 1개 초과 element가 쓰는 image URL | 15 / 38 unique | 동일 |

`before` 숫자는 추정이 아니라 **같은 관측 데이터 위에서 구 dedup 규칙을 그대로
재실행해 얻은 값**이다. 한 페이지 한 viewport에서 18건이고, Task 15가 15개 페이지
× 2 viewport에서 센 325건과 같은 크기의 현상이다.

catalog duplicate 증가는 0이다 — 이것이 item 8의 요구이고, occurrence를 살리면서
identity dedup을 유지했다는 뜻이다.

## Nested Scroll State Fix

**문제.** `getBoundingClientRect()`는 viewport 좌표를 돌려준다. 내부적으로
스크롤된 container 안의 descendant는 **그 offset 상태의 좌표**로 기록되는데,
Observer는 offset 자체를 기록하지 않았다. clone은 같은 tree를 scroll 0에서
렌더하므로 subtree 전체가 정확히 `scrollTop`만큼 어긋난다.

Task 15의 수동 검수가 찾아낸 실제 원인이 이것이었다: MDN `p000001/desktop`의
median y delta 19,739px, 문서 높이는 2,336 vs 2,336으로 **정확히 일치**.

**수집 대상 (item 12).** 좁게 잡았다. `scrollHeight > clientHeight` 또는
`scrollWidth > clientWidth` **이고** 해당 축의 computed `overflow`가 `auto` 또는
`scroll`인 element만. `overflow: hidden`은 제외한다 — clip이지 scroller가 아니고,
받아들이면 수만 개 wrapper에 6-field object가 붙는다.

`<html>`과 `<body>`는 **명시적으로 제외**한다 (item 21). 그것은 top-level page
scroller이고, Observer는 scroll 0에서 캡처하며, 두 복원을 섞는 것이 item 21이
금지하는 바로 그것이다.

**Schema.** 전부 관측값이다 (item 14):

```ts
scrollState?: {
  scrollTop; scrollLeft;        // observed
  scrollWidth; scrollHeight;    // observed
  clientWidth; clientHeight;    // observed
}
```

**전달 경로.** Observer → `ElementSpecNode.scrollState` → 0이 아닌 offset을 가진
node에만 `data-wr-scroll-top` / `data-wr-scroll-left` → client runtime이
hydration 후 **2 animation frame** 뒤에 한 번 복원.

`scrollTop`은 DOM **property**이지 attribute가 아니다. React에 대응 prop이 없고
server-rendered HTML로 표현할 수 없다. 그래서 관측값은 compact metadata로
이동하고, 이미 `data-wr-*`를 읽는 generic runtime이 적용한다 (items 17, 18).
site-specific delay는 없다 (item 19): 2 frame 뒤에도 layout이 확정되지 않았다면
그것은 timeout으로 덮을 일이 아니라 QA가 보고할 finding이다.

**Canary — MDN `/docs/Glossary/Safe/HTTP` 재관측.**

```
[desktop] scroll container 1개, 그중 offset ≠ 0인 것 1개
          worst: <aside> scrollTop=18,106  (scrollHeight 24,804 / client 802)
[mobile]  scroll container 1개, offset ≠ 0인 것 0개
```

**18,106px.** Task 15가 diff 이미지와 DOM 추적으로 손수 찾아낸 그 값이다. 이제
Observer가 직접 기록한다.

mobile에서 0인 것도 사실이다: 그 viewport에서는 sidebar가 자동 스크롤되지 않는다.
관측이 viewport마다 독립이라는 성질이 여기서 그대로 드러난다.

## Grid Style Coverage Fix

`STYLE_WHITELIST`에 9개 추가: `grid-template-areas` · `grid-area` ·
`grid-auto-flow` · `grid-auto-rows` · `grid-auto-columns` · `place-items` ·
`place-content` · `place-self` · `order`.

Task 15는 track이 어긋나는 것은 볼 수 있었지만 **item이 어느 칸에 앉는지는 볼 수
없었다.** grid를 정확히 맞추고도 자식이 전부 엉뚱한 셀에 들어가는 clone을,
artifact만 보고는 진단할 방법이 없었다. `order`도 같은 이유다 — DOM을 바꾸지 않고
시각 순서를 바꾼다.

`ALLOWED_CSS_PROPERTIES`가 Observer whitelist에서 파생되므로 generated CSS까지
자동으로 흐른다. QA의 style diff도 같은 whitelist를 쓰므로 item 92의 exact compare는
별도 코드 없이 성립한다.

**Canary (재관측, style token 중 해당 property를 가진 개수).**

| page | desktop | mobile |
| --- | ---: | ---: |
| MDN `/docs/Glossary/Safe/HTTP` | 754 (9개 property 각각) | 134 |
| MDN `/docs/Web/CSS/.../word-break` | 713 | 227 |
| nextjs.org `/` | 438 | 416 |
| seoworld.co.kr `/` | 291 | 286 |
| domainchecker.co.kr `/` | 396 | 380 |

**정직한 관찰 하나.** 9개 property가 모든 style token에서 같은 개수로 나온다.
`getComputedStyle`은 grid container가 아닌 element에도 값을 돌려주기 때문이다
(`order: 0`, `place-items: normal`, `grid-auto-flow: row`). 이것은 오류가 아니라
computed style의 성질이고, clone은 그 값도 재현해야 한다. 대신 **저장 비용이
있다**: style token 하나당 9개 declaration이 늘어난다. 아래 Storage에서 실제
증가분을 측정했다.

## Dynamic Target Observation Enhancement

**문제.** Task 11은 mount된 region의 tag/role과 interactive descendant 수만
기록했다. 안을 들여다본 적이 없으므로 Task 14는 빈 region을 mount할 수밖에
없었고, Task 15는 nextjs menu 9/9를 `dynamic-target-content-unobserved`로
정확하게 측정하고 고칠 수 없었다.

**수정 — Observer의 walk를 재사용한다 (item 71).** 별도 miniature observer를
복붙하지 않았다. `collectPageInBrowser`가 root element와 cap을 받는
**bounded subtree mode**를 갖게 했고, explorer는 그것을 호출한다. 같은
attribute whitelist, 같은 style whitelist, 같은 visibility 유도, 같은 skip tag,
같은 inline-SVG opaque 규칙. 두 번째 정책이 생기지 않으므로 둘이 어긋날 수 없다.

**Bounds (item 70).** 사이트별이 아닌 global constant:

```
MAX_DYNAMIC_TARGET_ELEMENTS   = 300
MAX_DYNAMIC_TARGET_DEPTH      = 12
MAX_DYNAMIC_TARGET_TEXT_CHARS = 20_000
```

cap에 걸리면 어느 cap인지 기록한다. 부분 capture를 작은 region으로 오해할 수 없게
하기 위해서다. whole-page recursion은 구조적으로 불가능하다.

**대상 (item 69).** 클릭 **전에 없었고 후에 있는** target만. 이미 있던 region은
static DOM의 일부이고 Task 09가 제대로 관측했으므로, 여기서 다시 뜨면 action
artifact 안에 페이지 내용의 열등한 복사본이 하나 더 생긴다.

**Provenance (items 73, 79, 80).** SiteSpec까지 `provenance: "observed"` /
`state: "after-action"`가 함께 이동한다. 이것은 **한 번의 클릭에서 관측된 한
instance**이지, 그 region이 언제나 그렇다는 주장이 아니다. `DynamicTemplateNode`는
`ElementSpecNode`와 **다른 타입**으로 두었다 — page tree에서 걸어갈 수 없고 page
content로 세어지지 않는다는 것을 규칙이 아니라 구조로 만들기 위해서다.

**Safety (item 72).** page tree와 **같은 함수**(`compileAttributes`)를 통과한다.
`class` / `style` / `data-*` / `on*` / `action` / `formaction`이 구조적으로 도달
불가능하다.

**Reconstruction.** binding이 template을 가지면 trigger에 JSON으로 실어 보내고
(64 KB 상한, 넘으면 **버린다** — 반쪽 메뉴는 작은 메뉴가 아니라 틀린 메뉴다),
runtime이 `createElement` + `setAttribute` + `createTextNode`로 mount한다.
`innerHTML`은 이 경로에 없다. template이 없으면 Task 14의 빈 mount 동작 그대로다
(item 76).

**Canary — nextjs.org의 기존 Task 11 plan에서 dynamic menu action 3개 재생.**
같은 planner, 같은 locator, 같은 executor.

| action | page | target | 결과 |
| --- | --- | --- | --- |
| `ia000020` | `/docs/app/api-reference/functions/generate-metadata` | `radix-_R_2miubaaivb_` | **16 elements, 3 assets, truncation 0** |
| `ia000025` | `/docs/app/guides/debugging` | 동일 | 16 / 3 / 0 |
| `ia000034` | `/docs/community/contribution-guide` | 동일 | 16 / 3 / 0 |

captured text: `Using App Router` / `Features available in /app` /
`Using Pages Router` / `Features available in /pages`. Task 15에서 clone이 빈
region을 mount하던 자리에 실제 관측된 내용이 들어간다.

## Regression Canaries

전체 4-site rerun은 하지 않았다 (item 27, 104). 원래 증거를 만든 정확한 페이지만
targeted로 재관측했다.

| canary | 방법 | 확인한 것 | 결과 |
| --- | --- | --- | --- |
| A. nextjs.org asset | 실제 재관측 | 같은 URL을 쓰는 모든 `<img>`가 asset relation 유지 | **57/57, 손실 0** (구 규칙 재현 시 18 손실) |
| B. MDN nested scroll | 실제 재관측 | scroll container의 scrollState 존재 | **`<aside>` scrollTop=18,106 기록** |
| C. MDN grid | 실제 재관측 | computed grid property 저장 | **9개 전부, 713 token** |
| D. nextjs dynamic menu | 기존 Task 11 plan의 action 3개 **실제 재생** | mount된 region 내용 capture | **16 elements / 3 assets / truncation 0** × 3 |
| E. seoworld | 실제 재관측 | 관측이 깨지지 않음 + unknown 승격 없음 | asset 손실 0, scroll container 0, grid 291 token / **승격 0** |
| F. domainchecker | 실제 재관측 | 관측이 깨지지 않음 | asset 손실 0, grid 396 token, mobile scroll container 1 (offset 0) |

**E와 F에서 무엇을 확인했고 무엇을 확인하지 않았는지.** 재관측 canary는 Phase A의
Observer 변경이 이 두 사이트에서 아무것도 깨뜨리지 않았음을 보인다. **behavior는
재측정하지 않았다** — domainchecker의 13/13 disclosure equivalence와 seoworld의
7/7은 Task 15의 숫자이고, 이 Task는 두 사이트를 재컴파일·재QA하지 않았다.

unknown → pattern 승격이 0인 것은 canary가 아니라 **코드 경로**가 보장한다:
승격은 registry rule을 통과해야 하고, 이번 Task는 rule을 하나도 추가하지 않았으며,
escalation policy가 `requires-pattern-modeling`을 명시적으로 거부한다. fixture가
`메뉴 열기` trigger가 clone에서 inert하게 남는 것을 직접 검사한다.

### Task 14 baseline 호환성

Task 16은 observation schema v3→v4, SiteSpec v2→v3, exploration v1→v2로
올렸다. **모든 reader는 두 버전을 다 읽는다** — 추가된 필드가 전부 optional이고,
item 26이 historical artifact 재작성을 금지하기 때문이다. `siteSpecVersion`은
**1로 유지**했다: v1 renderer가 v3 SiteSpec을 읽으면 덜 정확한 페이지가 아니라 더
정확한 페이지가 나오고, 기존 필드는 하나도 움직이지 않았다 (Task 13.1의 선례와 같은
판단).

기존 4개 SiteSpec(v2)을 현재 generator로 재생성해 Task 14 baseline과 비교:

| site | app source | manifest |
| --- | --- | --- |
| domainchecker.co.kr | `InteractionRuntime.tsx` 외 **IDENTICAL** | 카운터 4개 추가 외 동일 |
| seoworld.co.kr | 동일 | 동일 |
| nextjs.org | 동일 | 동일 |
| developer.mozilla.org | 동일 | 동일 |

차이는 정확히 두 개이고 둘 다 의도된 것이다:

1. **`app/src/runtime/InteractionRuntime.tsx`** — 사이트별 출력이 아니라 모든
   앱이 공유하는 고정 generic runtime이다. `restoreScrollState()`와 observed
   template mount가 추가됐다.
2. **manifest에 카운터 4개 추가** (`scrollStateNodes`, `scrollRestoreNodes`,
   `dynamicTargetsWithContent`, `dynamicTemplateNodes`). v2 SiteSpec에는 해당
   데이터가 없으므로 **전부 0**이다. 기존 값이 바뀐 것은 하나도 없다.

**페이지 tree, CSS, route map, runtime data는 4개 사이트 전부 byte-identical.**

---

## E2E Orchestrator Architecture

새 모듈 `src/e2e/` (18 파일). 이 layer는 관측하지도 해석하지도 생성하지도
않는다. 추가하는 것은 13-stage 파이프라인을 신뢰할 수 있게 만드는 두 성질이다.

| 파일 | 역할 |
| --- | --- |
| `types.ts` | manifest schema, stage/failure/status vocabulary, 정책 상수 |
| `run-context.ts` | 이 run의 명시적 artifact 경로 + `assertLineage()` |
| `execute-stage.ts` | stage 실행 **단 한 곳** (timing, failure naming, fatality) |
| `stage-registry.ts` | 파이프라인을 **데이터로** (순서, browser/network 비용) |
| `run-discovery.ts` | Firecrawl (또는 주입된 provider) — **유일한** 호출 지점 |
| `run-verification.ts` | verification + selection |
| `run-observation.ts` | multi-page responsive deep observation |
| `run-interactions.ts` | detection + exploration + modeling |
| `run-sitespec.ts` | compile → validate → consumer API로 재로드 |
| `run-reconstruction.ts` | generate + `next build` |
| `run-qa.ts` | Task 15 QA, 그대로 |
| `escalation-policy.ts` | 무엇을 escalate할 수 있고 나머지는 왜 안 되는지 |
| `family-escalation.ts` | **새** augmented run으로의 exact observation |
| `final-validation.ts` | 생성된 앱 독립성 감사 |
| `summarize.ts` | coverage, upstream accounting, `finalStatus` |
| `store.ts` | `e2e-runs/` namespace — **파일 하나만** 쓴다 |
| `run-e2e.ts` | 13-stage 직선 |

### Shell script가 아니다 (item 31)

`exec("pnpm verify …")`가 한 군데도 없다. stage 경계는 TypeScript contract이고,
실패는 exit code가 아니라 phase를 실은 exception이다.

단, verification과 selection은 각자의 loader(`loadDiscovery`,
`loadSelectionInput`)로 **다시 들어간다**. 앞 stage가 만든 in-memory 객체를 그대로
받지 않는다. 불필요한 round trip처럼 보이지만 그것이 요점이다: 독립 CLI가 쓰는
on-disk contract를 그대로 실행하므로, **디스크의 artifact가 틀렸는데 메모리에
객체가 남아 있어서 통과하는** 일이 불가능하다.

### 모듈 재사용 (item 32)

복제 구현 0. 이번 Task에서 새로 추출한 것은 하나뿐이다:
`src/reconstruction/build-app.ts` — `next build`를 CLI와 orchestrator가 **같은
구현**으로 호출하도록 CLI에서 뽑아냈다. 두 벌이 있으면 언젠가 플래그 하나가
어긋나고, 그 어긋남은 "한쪽에서는 빌드되는데 다른 쪽에서는 안 되는" 형태로
나타난다.

## CLI

```
pnpm e2e:reconstruct <url> [--max-urls N] [--concurrency N] [--auto-fix]
                           [--max-fix-iterations N] [--family-escalation N]
                           [--prepare-scroll]
```

| 옵션 | 기본 | 범위 | 근거 |
| --- | ---: | --- | --- |
| `--max-urls` | 20 | 1–40 | 성능이 아니라 **예의**의 숫자. 남의 사이트다 (item 43) |
| `--concurrency` | 2 | 1–4 | Observer 자신의 기본값 |
| `--auto-fix` | off | — | opt-in. 기본 실행은 아무것도 바꾸지 않는다 |
| `--max-fix-iterations` | 2 | 0–5 | Task 15의 기본값과 상한 |
| `--family-escalation` | 4 | 0–12 | major mismatch route만 (item 64) |

경계는 engine뿐 아니라 **CLI에서도** 검사한다. 범위를 벗어난 요청을 11분 뒤가
아니라 browser가 뜨기 전에 알려주기 위해서다.

## Run Manifest

`data/<host>/e2e-runs/<run-id>/e2e-manifest.json` **하나만** 쓴다. stage
artifact는 각 Task가 소유한 namespace에 그대로 남고 manifest는 그것을 참조한다.
run마다 수백 MB를 복사하지 않기 위해서이고, 참조는 가리키는 대상과 어긋날 수 없기
때문이다.

담는 것: `schemaVersion` / `pipelineVersion` · `input`(rootUrl + options) ·
`environment`(node·platform·browser·Next·React·TS·**aiCalls**·**firecrawlCalls**) ·
`stages[]`(**pipeline 순서**로, status·artifact·counts·warnings·elapsed) ·
`lineage` · `qaRun` · `correctionRun?` · `finalReconstruction`(경로·종류·**이유**) ·
`coverage` · `upstream`(Task 16 회계) · `unresolvedIssues[]` · `timings` ·
`storageBytes` · `finalStatus`.

## Stage Lineage

`Lineage`는 orchestrator가 stage에 경로를 넘기는 **바로 그 순간** 기록된다.
`assertLineage()`가 SiteSpec compile 직전에 chain을 다시 검사한다 — 섞인 run이
싸게 잡히는 마지막 순간이기 때문이다. 그 이후에는 잘못된 `verified-urls.json`이
이미 route table이 되어 있고, 하류의 모든 숫자가 아무도 묻지 않은 사이트에 대한
것이 된다.

검사 내용: root URL 일치, 그리고 discovery/verification/selection이 **문자
그대로 같은 run 디렉터리의 형제**인지. Task 06/07이 그 성질에 의존하므로, "CLI에
우연히 맞는 파일이 주어졌다"를 검사된 속성으로 바꾼다.

## No Stale Artifact Auto-Pick

파일시스템에서 "가장 최신 파일"을 찾아 다음 stage에 넘기는 코드가 **없다**
(item 40). 모든 경로는 `E2eRunContext`가 앞 stage로부터 받아 기록한 것이다.
`src/e2e/` 전체에서 `readdir` + 정렬로 artifact를 고르는 패턴은 0건이다.

## Failure Semantics

15개 closed failure name (item 37). `discovery-failure` ·
`discovery-empty` · `verification-failure` · `verification-empty` ·
`selection-failure` · `observation-failure` · `observation-partial` ·
`interaction-failure` · `interaction-partial` · `sitespec-invalid` ·
`reconstruction-failure` · `reconstruction-build-failure` ·
`qa-infrastructure-failure` · `escalation-failure` · `final-validation-failure`.

**Fatality는 호출 지점이 아니라 failure의 성질이다.** `FATAL_FAILURES` 한 곳에
적혀 있고, 기준은 "다음 stage가 일을 할 수 있는가"다. 관측 실패한 페이지 하나는
페이지 하나 값이고 (Task 09의 isolation 재사용, item 38), verified route 0은 하류
전체 값이다 — 계속하면 빈 SiteSpec과 아무것도 아닌 것의 clone이 성공으로 보고될
뿐이다.

---

## Fresh Target Selection

**`https://stripe.com`** — item 41의 primary 추천 그대로. fallback은 쓰지 않았다.

사전 확인(관측 profile과 동일한 Chromium context로 1회 GET): HTTP **200**, title
`Stripe | Financial Infrastructure to Grow Your Revenue`, 2,843 element, 실제
본문 텍스트. challenge page도 interstitial도 없었다. 그래서 item 41의 fallback
조건("public access/bot policy 때문에 정상 pipeline 진행 자체가 불가능")이
성립하지 않았고, `https://www.apple.com`은 사용하지 않았다.

**Fresh의 의미 (item 42) 충족.** Task 09~15의 네 사이트
(domainchecker · seoworld · nextjs.org · MDN) 어느 것도 아니고, 이 저장소가
stripe.com을 관측한 적은 이번이 처음이다.

**Safety (item 43).** public page만, `--max-urls 20`, concurrency 2, 인증 0,
계정 동작 0, 구매 0, form write 0, 파일 업로드 0, destructive interaction 0.
verification에서 `blocked` **0건** — 우회 시도도 0건이다.

## Fresh Discovery

| | |
| --- | ---: |
| Firecrawl Map call | **1** |
| raw URLs | 19 |
| normalized / duplicates / invalid / external-filtered | 19 / 0 / 0 / 0 |
| elapsed | 3,483 ms |

Firecrawl은 요청한 20개보다 적은 19개를 돌려줬다. 그것이 이 사이트에 대한 Map의
답이고, 파이프라인은 링크를 따라가 보충하지 않는다 — crawl이 아니기 때문이다.

## Fresh Verification

| | |
| --- | ---: |
| candidates | 19 |
| valid-html | **19** |
| verified (usable deep-observation candidate) | **19** |
| http-error / navigation-error / non-html / external-redirect | 0 / 0 / 0 / 0 |
| **blocked** | **0** |
| elapsed | 9,967 ms |

19/19가 전부 통과했다. stripe.com은 익명 Chromium에 정상적으로 응답한다.

## Fresh Family Selection

| | |
| --- | ---: |
| verified URLs | 19 |
| families | **19** |
| representatives | **19** |
| reduction | **0 (0.0%)** |
| largest family | 1 |
| validation samples | 0 |

**reduction 0은 실패가 아니라 관측이다.** Firecrawl Map이 돌려준 19개는 서로
구조적으로 다른 페이지들이다 — customer story 하나, blog post 둘, careers listing
하나, legal page 둘, product page 몇 개, 여러 locale의 서로 다른 문서. Task 08의
coarse profile은 sibling 세 개 이상 또는 같은 scope + 같은 skeleton을 요구하는데,
이 표본에는 그런 그룹이 없다. 파이프라인은 없는 family를 만들어내지 않는다.

세 가지 결과가 여기서 따라 나온다:

- **family-represented route 0.** 19개 route 전부가 자기 자신의 exact
  observation을 가진다. Task 15의 최대 약점 중 하나(14개 감사 중 4개 major gap)가
  이 사이트에서는 애초에 존재하지 않는다.
- **family audit이 감사할 것이 없다** → escalation stage가 `skipped`로 기록된다
  (`the family audit found no route to escalate`). 이것은 item 63의 조건이
  발생하지 않은 것이지 escalation이 실패한 것이 아니다.
- **validation sample 0.** ≥3 member family가 없으므로 sampling 대상이 없다.

## Fresh Deep Observation

| | |
| --- | ---: |
| pages planned / observed / **failed** | 19 / 19 / **0** |
| elapsed | 110,192 ms |
| storage | 256.5 MB |
| asset **occurrences** | 9,376 |
| asset **unique identities** | 1,862 |
| scroll containers observed | 35 (그중 offset ≠ 0: **1**) |

occurrence 9,376 대 unique 1,862 — **5.03배**. Task 16 이전이라면 그 차이의 상당
부분이 element→asset mapping 손실로 나타났을 자리다.

## Fresh Interaction Detection

| | |
| --- | ---: |
| pages | 19 |
| candidates | **616** (P1 272 · P2 256 · P3 88) |
| controlled targets | 134 |
| elapsed | 1,255 ms (offline, network 0) |

## Fresh Interaction Exploration

| | |
| --- | ---: |
| planned actions | **65** (skipped 551, 전부 이유와 함께 기록) |
| executed | 64 |
| changed / no-change | 60 / 4 |
| live-inoperable | 1 |
| dynamic targets mounted | **0** |
| elapsed | 141,587 ms |
| storage | 4.6 MB |

**dynamic target 0.** stripe.com의 실행된 65개 action 중 클릭으로 새 region을
mount한 것이 하나도 없었다. 따라서 이번 fresh run은 Task 16의 dynamic subtree
capture를 **행사하지 않았다**. 그 기능이 실제 사이트에서 동작한다는 증거는 이
run이 아니라 nextjs.org canary(16 elements × 3 action)와 smoke fixture에 있다.
없는 것을 있다고 쓰지 않는다 (item 124).

## Fresh Pattern Modeling

| | |
| --- | ---: |
| confirmed patterns | **28** (`disclosure` 27 · `tabs` 1) |
| unknown cases | **37** (10 signature groups) |
| **AI calls** | **0** |
| elapsed | 761 ms |

## Fresh SiteSpec

| | |
| --- | ---: |
| routes / families / pages | 19 / 19 / 19 |
| style tokens | 9,983 |
| assets (unique) / occurrences | 634 / 9,376 |
| patterns / unknowns | 28 / 37 |
| `<img>` nodes / **asset-bound** | 1,678 / **1,678** |
| scrollState nodes / **scrolled** | 35 / **1** |
| dynamic targets / with template | 0 / 0 |
| storage | 99.3 MB |
| elapsed | 10,541 ms |

compile 후 **consumer API(`loadSiteSpec`)로 다시 읽어** 같은 invariant를 통과시켰다.
Task 14가 열 artifact가 검증된 것이지, 컴파일러가 메모리에 들고 있던 객체가 검증된
것이 아니다.

## Fresh Next.js Reconstruction

| | |
| --- | ---: |
| routes | 19 |
| runtime page files | 19 |
| element / text nodes | 74,178 / 26,670 |
| style rules | 9,523 |
| pattern bindings / unknown annotations | 28 / 37 |
| scroll restore instructions | **1** |
| **asset downloads** | **0** |
| generated app | 34.3 MB |
| generation / `next build` | 1,466 ms / **3,526 ms (exit 0)** |

## Fresh QA

38 page/viewport pair (19 × 2). **37 `complete`, 1 `source-drift`.**

## Route Coverage

| | |
| --- | ---: |
| verified URLs | 19 |
| generated routes | **19** |
| HTTP 200 rendered | **19 / 19** |
| route failures | 0 |

**19/19, 100%.** family-represented route가 0이므로 render coverage와 exact
observation coverage가 이번에는 같은 숫자다.

## Content Fidelity

| viewport | pairs | compared nodes | **content exact ratio** | mismatches |
| --- | ---: | ---: | ---: | ---: |
| desktop | 19 | — | **1.0** | 0 |
| mobile | 19 | — | **1.0** | 0 |
| 합계 | 38 | 74,178 | **1.0** | **0** |

모든 페이지에서 **1.0**. Task 14/15 baseline(네 사이트 전부 1.0)에서 퇴행 없음
(item 96).

## Geometry Fidelity

| viewport | y median (median) | y p95 (median) | doc height Δ median | doc height Δ max |
| --- | ---: | ---: | ---: | ---: |
| desktop | **0.00px** | 0.99px | 0.22px | 0.50px |
| mobile | **0.00px** | 1.00px | 0.20px | 0.48px |

전체 max delta 359px. worst p95: `p000008/desktop` 64.7px ·
`p000008/mobile` 32.1px · `p000017` desktop/mobile 6.0px.

**문서 높이가 0.5px 이내로 일치한다** — 19개 페이지 전부에서. 종합 점수는 만들지
않는다 (item 97).

## Style Fidelity

| | |
| --- | ---: |
| compared properties | 4,109,400 |
| **mismatched** | **481** (0.0117%) |
| sub-layout-unit 길이 차이 (별도 계상) | 4,076 |

top mismatch property:

| property | count |
| --- | ---: |
| `width` | 157 |
| `grid-template-rows` | 140 |
| `grid-template-columns` | 76 |
| `mask-image` | 42 |
| `-webkit-mask-image` | 42 |
| `height` | 16 |
| `animation-duration` | 6 |
| `line-height` | 2 |

`width`/`height`는 layout 결과이지 authored style이 아니다 (Task 15와 동일한
해석). **Task 16이 새로 추가한 9개 grid 배치 property는 mismatch 목록에 하나도
올라오지 않았다** — 관측된 값이 clone에서 정확히 재현됐다는 뜻이고, 이것이
item 92의 exact compare 결과다.

## Visual Fidelity

| viewport | changed pixel ratio (median) | worst |
| --- | ---: | ---: |
| desktop | 0.081 | 0.172 (`p000008`) |
| mobile | 0.103 | 0.200 (`p000015`) |

mean absolute RGB delta median 9.22. 38 pair 전부 측정. **PASS threshold 없음**
(item 99).

worst 4: `p000015/mobile` 0.200 · `p000008/desktop` 0.172 ·
`p000009/mobile` 0.139 · `p000017/mobile` 0.126.

## Asset Fidelity

| | clone | live original |
| --- | ---: | ---: |
| `<img>` compared | 1,678 | 1,678 |
| decoded (`naturalWidth > 0`) | 440 | 435 |
| not decoded | **1,238** | **1,184** |
| `<img>` with no `src` | **0** | — |
| resource failures | 28 | 173 |

**1,238이라는 숫자를 그대로 읽으면 안 된다.** 같은 이미지들 중 1,184개는 **지금의
live original에서도 decode되지 않는다** — stripe는 대부분의 이미지를 lazy-load하고,
Observer도 QA도 scroll 0에서 캡처한다. Task 15가 세운 규칙(positive decode만
증거로 인정, live original도 못 그리면 `asset-source-drift`) 그대로다.

실제 gap은 그 차이인 **54건**이고, 그중 **47건이 `asset-load-failure`**로
분류돼 `requires-asset-materialization`으로 라우팅됐다. clone은 stripe의 CDN
(`images.stripeassets.com` 1,678 · `videos.stripeassets.com` 10)을 hotlink하며,
materialization은 이번 Task가 열지 않은 보안면이다 (item 85).

**Task 16 A1 회계 (item 91):**

| | |
| --- | ---: |
| source `<img>` occurrence | 1,678 |
| SiteSpec asset-bound element | **1,678** |
| clone `src`-bound element | **1,678** |
| **occurrence loss** | **0** |
| SiteSpec에 asset ref 없는 `<img>` | **0** |

## Responsive Fidelity

| | |
| --- | ---: |
| variant 정확히 하나 표시 | **38 / 38** |
| `responsive-variant-mismatch` | 0 |
| `responsive-variant-runtime-error` | 0 |
| `inferred-breakpoint-runtime-defect` | **3** |

915px는 관측값이 아니라 generator의 산술이므로 원본과의 pixel 동등성을 요구하지
않고 clone-only 일관성만 검사한다. 914/915/916에서 3건이 그 검사를 통과하지
못했고, 아래 hydration 문제와 같은 원인일 가능성이 높다 (그 페이지들에서 발생).

## Behavior Equivalence

| | source | replayed | equivalent | mismatch | source-drifted | unverifiable |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| `disclosure` | 27 | 27 | **12** | 0 | 0 | **15** |
| `tabs` | 1 | 1 | **1** | 0 | 0 | 0 |
| **합계** | **28** | **28** | **13** | **0** | **0** | **15** |

**mismatch 0.** 재생에 성공한 13개는 전부 원본과 같은 상태 전이를 보였다.

**unverifiable 15개는 clone 쪽 `click-error`이고, 원인이 하나다** — 아래
"Remaining Limitations 1"의 hydration 실패. 상관관계는 완전하다: **15개 전부가
hydration error가 난 page/viewport에 있고**, equivalent 13개 중 11개는 깨끗한
page/viewport에 있다. behavior 숫자를 별도 문제로 세지 않고 하나의 root cause로
귀속시킨다.

dynamic target은 이 사이트에 0개였으므로 `dynamicTargetsWithCloneChildren`도 0이다.

## Unknown Interactions

| | |
| --- | ---: |
| signature groups | 10 |
| sampled (Task 12의 결정론적 대표 재사용) | 8 |
| **gap detected** | **5** |
| clone no-op | 8 |
| unverifiable | 1 |
| **auto-fixed / promoted** | **0** |

5개 `unmatched-transition`에서 원본은 관측 가능한 변화를 보이고 clone은 아무것도
하지 않는다. **그것이 정확히 의도된 결과다** (item 81, 84): 이름 붙일 evidence가
없으면 이름을 붙이지 않고, gap을 정확히 보고한다. registry rule은 이번 Task에서
하나도 추가되지 않았고 unknown → pattern 승격은 **0건**이다.

## QA-Directed Escalation

QA가 낸 finding 2,132건 중 escalation policy가 **허용**하는 것은 0건이었다:

| recommendation | count | 결정 |
| --- | ---: | --- |
| `requires-reobserve` | 1,196 | **조건부 허용** — 그러나 이 run의 관측과 QA는 24분 차이이고, drift의 정체가 분당 갱신되는 카운터·로케일 콘텐츠다. 재관측이 답을 바꾸지 않는다 (아래) |
| `requires-asset-materialization` | 47 | **거부** — SSRF/redirect/private IP/MIME 정책이 별도 보안면 (item 85) |
| `requires-pattern-modeling` | 5 | **거부** — registry rule은 fixture 2종 + canary + human review 없이 승격 불가 |
| `none` (측정값, 조치 대상 아님) | 884 | — |
| `requires-exact-observation` | **0** | family-represented route가 0이므로 발생하지 않음 |
| `requires-new-interaction-observation` | **0** | dynamic target이 0이므로 발생하지 않음 |

`requires-reobserve` 1,196건을 재관측하지 않은 이유는 정책이 아니라 **증거**다.
`source-content-drift` 1,186건은 32개 page/viewport에 걸쳐 있고, stripe 홈의
`Global GDP running on Stripe: 1.698…%` 같은 실시간 카운터와 로케일 문자열이
지배한다. 재관측은 그 순간의 다른 값을 얻을 뿐이다. item 61의 조건("관측
pipeline 자체를 바꿨거나, 즉시 재관측으로 해결될 가능성")이 성립하지 않는다.

## Family Exact Observation Escalation

**이 run에서는 실행되지 않았다.** 19개 verified URL이 19개 family를 이루어
family-represented route가 0이고, 따라서 family audit이 감사할 route가 0이며,
escalation stage는 `skipped`로 기록됐다 (사유:
`the family audit found no route to escalate`).

**그러므로 escalation 경로에 대한 이 Task의 증거는 fresh run이 아니라 fixture다.**
`pnpm smoke:e2e`의 합성 사이트는 네 개의 sibling guide를 **구조는 동일하게, 텍스트
분량만 다르게** 만든다. Task 08의 coarse profile은 설계상 text를 읽지 않으므로 네
개가 하나의 family를 이루고, 대표(`beta`, 최단 URL)가 나머지 셋을 대신하며, 감사가
live 페이지와 clone을 비교하는 순간 content divergence가 임계값을 넘는다. 그
지점부터 **audit → exact 재관측 → 새 augmented run → recompile → rebuild → re-QA**
전체가 실제로 실행되고, fixture가 다섯 가지를 검사한다: family가 실제로 형성됐는지 ·
escalation stage가 candidate를 찾아 실행했는지 · 원본이 아닌 `-augmented` run에
썼는지 · SiteSpec과 clone이 그것으로 다시 만들어졌는지(stage가 두 번 실행됐다는
기록) · coverage에 집계됐는지.

초기 fixture는 divergent 페이지를 **구조까지** 다르게 만들었고, 그 결과 그 페이지가
자기만의 family가 되어 family-represented route가 0이 되고 escalation이 한 번도
실행되지 않았다 — 통과하는데 아무것도 증명하지 않는 테스트였다. 지금 형태는 그것을
고친 것이다.

**실제 공개 사이트에서의 escalation은 여전히 증명되지 않았다.**

구현 상 한 가지를 여기 적어 둔다. escalation recompile은 `loadInputs()`에
augmented observation 경로를 **명시적으로 넘긴다**. 넘기지 않으면 loader가
`exploration.sourceSiteObservation`을 따라 원본 run으로 되돌아가고, escalation이
네 페이지를 관측한 뒤 그러지 않은 것처럼 컴파일한다 — 결과는 "개선 없음"이고
원인은 escalation과 무관하다.

## Correction Loop

| | |
| --- | ---: |
| proposed | **1** |
| applied | 1 |
| **accepted** | **0** |
| **rejected** | **1** |
| iterations | 1 |

제안된 유일한 correction은 `document-canvas-background`
(`background-color: rgb(246, 249, 252)`, evidence 5개: clone canvas가 다름 ·
root propagation으로 설명됨 · exact observed page · drift 없음 · SiteSpec의
document root background 확인됨).

적용 후 자기 target metric을 다시 쟀다:
`canvas-background-mismatched-properties: 1 → 1 (required ≤ 0)`.
**개선되지 않았으므로 기각됐다** (`target-metric-not-improved`).

이것은 correction engine의 실패가 아니라 **acceptance gate가 설계대로 동작한
것**이다 (Task 15 item 121: "pixel metric이 조금 좋아졌다는 사실은 대체재가
아니다"). 기각 사유가 artifact에 남고, 남은 canvas mismatch 2건은 unresolved로
보고된다.

## Final Reconstruction Selection

```
finalReconstruction:
  path   data/stripe.com/reconstructions/2026-08-14T12-14-41-032Z
  kind   baseline
  why    1 correction(s) were rejected on re-measurement, so the baseline stands
```

**마지막 iteration이 있다고 그것을 고르지 않는다** (item 94). `q001`
reconstruction은 존재하고 build도 통과했지만, 그 안의 유일한 correction이
re-measurement에서 기각됐으므로 accepted correction이 0이고 baseline이 최종이다.
이유가 manifest에 문장으로 남는다.

## Before / After Improvements

item 123이 요구하는 표. **적용되지 않은 항목은 N/A로 명시**한다.

| 항목 | before (Task 15) | after (Task 16) | 측정 위치 |
| --- | --- | --- | --- |
| **Asset occurrence loss** | nextjs.org `/` desktop에서 **18/57 `<img>`가 mapping 손실** (사이트 전체 `asset-missing` 325건) | **0/57** — canary. fresh stripe run에서 **1,678/1,678 bound, clone 손실 0** | canary + fresh run |
| **Nested scroll geometry** | MDN `/docs/Glossary/Safe/HTTP` median y delta **19,739px**, 원인 미관측 | Observer가 `<aside> scrollTop=18,106` **기록**. fresh run에서 scroll container 35개 관측 → SiteSpec 35 → 복원 지시 1 → **QA 복원 1, mismatch 0** | canary + fresh run |
| **Grid properties** | 9개 배치 property **미관측**. MDN `grid-template-rows` 78 / `columns` 74 mismatch를 설명할 수 없었음 | 9개 전부 관측·전달·재현. fresh run style mismatch 목록에 **0건** | canary + fresh run |
| **Dynamic target content** | nextjs menu **9/9 빈 region** (`dynamic-target-content-unobserved`) | canary 3개 action에서 **16 elements / 3 assets / truncation 0** capture, template로 컴파일, clone이 mount | canary + fixture |
| **MDN geometry median 개선치** | 19,739px | **N/A — 측정하지 않았다.** 전체 4-site rerun을 하지 않았으므로(item 27) MDN clone의 개선된 median을 이 Task는 갖고 있지 않다. Observer가 offset을 기록한다는 것까지가 증거다 | — |
| **nextjs dynamic menu mismatch 감소치** | 9 mismatch | **N/A — 측정하지 않았다.** capture가 동작함은 canary로 증명했지만, 재컴파일→재생성→재QA를 하지 않았으므로 mismatch가 몇 개 줄었는지는 이 Task가 모른다 | — |
| **stripe dynamic target** | — | **N/A** — 이 사이트에는 dynamic target이 0개였다 | — |
| **stripe family escalation** | — | **N/A** — family-represented route가 0개였다 | — |

마지막 네 줄이 item 124의 요구다: 구현했지만 이번 실행에서 수치로 확인하지 않은
것을 "개선됨"이라고 쓰지 않는다.

## Remaining Limitations

fresh run에 남은 가장 큰 문제 10개, 크기 순.

1. **Clone hydration 실패 — 19개 페이지 중 15개, page/viewport당 정확히 1건
   (총 30건).** React minified error **#418** ("server rendered HTML didn't match
   the client"). 직접 진단한 것:
   - SSR HTML과 hydration 후 DOM의 **element tree는 정확히 일치한다**
     (`/ae/customers/dust`: 4,665 vs 4,665, 태그 순서 동일). 즉 구조 차이가
     아니라 attribute 또는 text 값 차이다.
   - inline SVG가 많은 페이지에 몰려 있다 (SVG 5개인 두 페이지는 error 0). 다만
     SVG 개수도, camelCase SVG 속성 존재 여부도 **단독으로는 판별하지 못한다**
     (SVG 161개인 `p000008`은 error 0). 그래서 "inline SVG 채널이 유력하다"까지가
     증거가 지지하는 범위이고, 정확한 값은 dev build 없이는 특정하지 못했다.
   - **Task 16이 원인이 아니라는 근거:** hydration mismatch는 정의상 effect 실행
     *이전*에 발생하고, Task 16이 client runtime에 추가한 것은 전부 `useEffect`
     안이다. 그리고 네 사이트 corpus(Task 15에서 JS error 0)와 fixture
     (`smoke:reconstruction` 178/178, "pageerror 0")는 현재 코드로도 error 0이다.
   - **하류 영향:** verified pattern 15개가 `unverifiable`(clone `click-error`)이
     된 것이 이 문제다 — hydration이 실패하면 React가 tree를 client에서 다시
     만들고, 그 사이 trigger가 detach된다. `inferred-breakpoint-runtime-defect`
     3건도 같은 페이지들이다.
   - upstream: **reconstruction**. 첫 fresh 사이트에서 처음 드러난 실제 결함이다.
2. **`source-content-drift` 1,186건 / 1,226 node / 32 page-viewport.** 관측과 QA
   사이 24분 동안 실시간 카운터·로케일 문자열이 바뀐다. clone은 snapshot과
   일치하므로 clone defect가 아니고, 재관측도 답을 바꾸지 않는다.
3. **`asset-load-failure` 47건.** clone이 hotlink하는 stripe CDN 이미지가 clone
   context에서 decode되지 않는다 (같은 이미지 1,184개는 live original에서도
   decode되지 않으므로 그쪽은 site behavior). `requires-asset-materialization`.
4. **`geometry-mismatch` 412건 / 759 node + `layout-cascade` 33건 / 2,160 node.**
   median 0.00px / p95 0.99px이므로 대부분 sub-pixel이고, 큰 것은 `p000008`
   (p95 64.7px)에 몰려 있다.
5. **`style-mismatch` 387건 / 531 node** (compared 4,109,400 중 481 property,
   0.0117%). top은 `width`/`grid-template-rows`/`grid-template-columns` — 앞의 둘은
   layout 결과다.
6. **`environment-unstable` 17 pair / 751 node.** 두 번 캡처 사이 geometry가 계속
   움직인다 (stripe 홈의 애니메이션 카운터). 그 페이지에서는 attribution 자체가
   불가능하다.
7. **`source-structural-drift` 1건 (3,147 node).** 38개 중 1개 page/viewport가
   구조적으로 drift했고 node-by-node live 비교를 하지 않았다.
8. **`unknown-behavior-gap` 5건.** 이름 붙일 evidence가 없는 transition. 의도된
   결과이고 auto-fix 0.
9. **`canvas-background-mismatch` 2건.** correction이 제안됐고 metric을 움직이지
   못해 기각됐다. 왜 움직이지 않았는지는 이 Task가 답하지 않는다.
10. **`inferred-breakpoint-runtime-defect` 3건.** 914/915/916 clone-only 일관성
    검사 실패. 원본 breakpoint mismatch라고 주장하지 않는다. 1번과 같은
    페이지들이다.

## Upstream Ownership

| upstream stage | occurrences | affected nodes |
| --- | ---: | ---: |
| `source-site` | 1,196 | 4,549 |
| `reconstruction` | 894 | 3,501 |
| `qa` | 17 | 751 |
| `pattern-modeling` | 5 | 5 |
| `observation` | **0** | **0** |
| `selection` | **0** | **0** |
| `interaction-exploration` | **0** | **0** |

**`observation` 소유 finding 0건이 Phase A의 결과다.** Task 15에서 이 칸은 325건
(asset mapping) + grid whitelist 였다.

## Runtime Safety

| | |
| --- | ---: |
| clone JavaScript runtime error | **30** (1번 참조 — hydration, 15 page × 2 viewport) |
| clone hydration error (별도 계상) | 30 |
| cross-origin 차단 message (JS와 분리) | **0** |
| clone failed resources | 28 |
| unexpected navigation | 0 |
| unknown behavior 구현 | **0** |
| unsafe data URI | **0** (복구 대상 `data:` URI가 corpus에 없었음) |

Task 15의 "JS runtime error 0"에서 **퇴행했다**. 숨기지 않고 1번으로 보고한다.

## Original Backend Isolation

생성된 앱 정적 스캔 (`.next` 제외, 38 파일 / 34.3 MB):

| 검사 | 결과 |
| --- | ---: |
| upstream artifact 참조 (`site-specs/` · `site-observations/` · `interaction-*/`) | **0** |
| 원본 `<script src="http…">` | **0** |
| 원본 stylesheet `<link href="http…">` / `@import url(http…)` | **0** |
| inline `on*=` handler | **0** |
| origin으로 향하는 `action=` / `formaction=` | **0** |
| `fetch(` / `XMLHttpRequest` / `WebSocket` / `sendBeacon` | **0** |
| origin stack dependency (wordpress/jquery/shopify/vue/…) | **0** |

`https://stripe.com/`이라는 문자열은 생성된 소스에 **정확히 한 번** 나온다:
`src/generated/generated-config.ts`의 `SOURCE_ROOT_URL`. 파일 주석이 "provenance이며
앱의 어떤 것도 이것을 요청하지 않는다"라고 적고 있고, grep으로 확인한 결과 **다른
어떤 모듈도 이 상수를 import하지 않는다.**

form submit은 `FormSafetyRuntime`이 capture phase에서 `preventDefault` 한다.
**원본 backend로 가는 POST/PUT/PATCH/DELETE는 0이다** — SiteSpec에 form action
endpoint 자체가 존재하지 않으므로 구조적으로 그렇다.

## Generated Stack

item 116의 독립 실행 시험. 최종 reconstruction의 `app/`을 **파이프라인 artifact가
하나도 없는 별도 디렉터리로 복사**하고 (`.next` 제거, SiteSpec·observation·
manifest 모두 없음) 거기서 빌드·기동했다:

```
copy contains: app  next-env.d.ts  next.config.mjs  package.json
               public  reconstruction-data  src  tsconfig.json
next build   → PASS
next start   → /ae/customers/dust      HTTP 200   1,048,236 bytes
               /use-cases/saas         HTTP 200   1,774,553 bytes
               /legal/becs             HTTP 200     376,794 bytes
               /definitely-not-a-route HTTP 404
```

**생성된 앱의 dependency 전부** (`package.json` 그대로):

| | |
| --- | --- |
| dependencies | `next` 16.3.0 · `react` 19.2.8 · `react-dom` 19.2.8 · `server-only` 0.0.1 |
| devDependencies | `@types/node` 24.13.3 · `@types/react` 19.2.18 · `@types/react-dom` 19.2.4 · `typescript` 5.9.3 |

**원본 CMS/framework dependency: 0.** stripe.com이 무엇으로 만들어졌든 이 목록은
같다 (item 120).

### Tailwind에 대하여 (items 54, 55, 137)

현재 출력은 **Next.js + React + TypeScript + generated exact CSS**이고, Tailwind는
넣지 않았다.

이유는 취향이 아니라 측정 가능성이다. 이 파이프라인의 style 진실은 브라우저의
**final computed value**이고, `.wr-st000123 { …관측된 값 그대로… }`는 그것을 손실
없이 옮기는 가장 짧은 경로다. Tailwind로 바꾸면 `padding: 16px` → `p-4` 같은
매핑이 들어가고, 매핑이 틀렸을 때 그것이 fidelity 숫자에 섞여 들어온다 — 즉
reconstruction correctness와 implementation refactoring이라는 두 문제가 하나의
숫자로 합쳐진다.

- **Current output:** Next.js + React + TypeScript + generated exact CSS
- **Potential later refactor:** Tailwind / component extraction —
  maintainability의 문제이지 fidelity의 문제가 아니다

이번 E2E 결과를 Tailwind 여부로 흔들지 않는다.

## AI Usage

**AI call 0.** 이번 Task의 어떤 실행에서도 AI를 호출하지 않았다.

이것은 "키가 없어서"가 아니라 **파이프라인의 성질**이다. orchestrator는
`--ai`를 넘기지 않으므로, provider가 설정된 기계에서 실행해도 0이다
(item 46). manifest의 `environment.aiCalls`는 그래서 사실 진술이지 환경 보고가
아니다.

AI가 들어갈 수 있는 자리는 정확히 한 곳이다: Task 12의
`UnknownInteractionAnalyzer`. 규칙이 설명하지 못한 transition에 대해, allowlist된
compact payload를 받아(HTML·DOM·style·cookie·query string 없음) signature group
대표 하나당 한 번 호출되고, 결과는 `inferred` provenance로 **별도 파일**에
들어간다. 그것이 deterministic pattern이 되려면 6단계 promotion policy를 전부
통과해야 하고 자동으로는 하나도 일어나지 않는다.

```
Rules first     결정론적 registry rule
Unknown second  이름 없는 원인 (shrug가 아니라 named cause)
AI last         annotation, 절대 승격 아님
```

## Firecrawl Usage

**Discovery stage에서만.** 이것은 관례가 아니라 import graph의 성질이다:
`FirecrawlDiscoveryProvider`는 `src/discovery/`에만 있고 다른 stage 중 어느
것도 그것을 import하지 않는다. `stage-registry.ts`가 `firecrawl: true`인 stage가
정확히 하나이고 그것이 discovery임을 실행 시점에 assert한다.

## Playwright Usage

browser를 띄우는 stage는 4개다: **verification**(후보당 1회 방문),
**observation**(페이지당 desktop+mobile 전체 관측 + 스크린샷 2장),
**interaction exploration**(action당 fresh context 1개), **QA**(page/viewport당
clone 1회 + live original 1회 캡처). 나머지 9개 stage는 browser도 network도
쓰지 않는다.

## Cost / Efficiency

| 자원 | 어디서 | 왜 그만큼인가 |
| --- | --- | --- |
| Firecrawl | Discovery만 | run당 1 call |
| Playwright | verification · observation · exploration · QA | 위 4개 stage |
| AI | 없음 | 기본 0 |

**representative/family selection이 browser 비용을 줄이는 이유.** deep
observation은 페이지당 browser context 2개 + 전체 DOM walk 2회 + full-page
screenshot 2장이다. 20개 URL이 12개 family면 8번의 deep observation을 사지 않는
것이고, 그것은 verification 8회(가벼움)가 아니라 observation 8회(무거움)를 아끼는
것이다. Task 09에서 이 비율은 112 → 41 (63.4% 감소, 추정 834 MB → 실측 351 MB)이었다.

---

## Storage

| stage | bytes |
| --- | ---: |
| observation | 256.5 MB |
| SiteSpec | 99.3 MB |
| reconstruction | 34.3 MB |
| interaction exploration | 4.6 MB |
| interaction modeling | 0.14 MB |
| **QA** | **478.8 MB** |
| **합계** | **873.6 MB** |

**QA가 전체의 54.8%다** — 예상대로 screenshot과 diff PNG가 대부분이고, `--auto-fix`
가 corrected reconstruction(app + runtime data)을 iteration 안에 포함한다.
observation이 두 번째(29.4%)이고 그 안에서도 full-page PNG 두 장이 지배한다.

**A3의 저장 비용.** grid property 9개는 `getComputedStyle`이 모든 element에 값을
돌려주므로 style token 9,983개 전부에 붙는다 (9,517개 token에서 관측). SiteSpec
99.3 MB / generated CSS 9,523 rule 안에서 대략 수 MB 규모이고, 그 대가로 grid
배치 mismatch가 0이 됐다. 측정된 사실로 적어 둔다.

## Performance

| stage | elapsed |
| --- | ---: |
| discovery | 3,483 ms |
| verification | 9,967 ms |
| selection | **8 ms** |
| observation | 110,192 ms |
| interaction detection | 1,255 ms |
| interaction exploration | 141,587 ms |
| interaction modeling | 761 ms |
| SiteSpec | 10,541 ms |
| reconstruction | 1,466 ms |
| `next build` | 3,526 ms |
| **QA** | **1,152,916 ms** |
| family escalation | 0 ms (skipped) |
| final validation | 127 ms |
| **합계** | **≈ 1,436 s (23.9 분)** |

QA 내부 분해: page QA 479,910 ms · correction loop 437,329 ms ·
interaction QA 167,194 ms · unknown QA 60,114 ms · breakpoint probe 5,981 ms ·
route check 587 ms · clone start 557 ms · load inputs 645 ms.

**QA가 전체의 80.3%다.** page/viewport 쌍마다 clone 1회 + live original 1회 캡처에
각각 안정화와 screenshot이 들어가고, `--auto-fix`가 correction iteration에서 clone을
한 번 더 전부 잰다. offline stage 다섯 개(selection · detection · modeling ·
sitespec · reconstruction)를 합쳐도 14.0 초로 전체의 1.0%다.

---

## Determinism

- stage 순서는 `STAGE_ORDER` 상수다. 완료 순서가 manifest를 바꾸지 못한다.
- SiteSpec·reconstruction·interaction model은 Task 13/14/12의 결정론을 그대로
  물려받는다 (같은 입력 → byte-identical).
- family escalation 대상 선택은 worst-content-divergence → worst-structure →
  lexical URL로 **전순서**다. 뒤집힌 입력으로도 같은 route를 고른다 (fixture 검증).
- manifest 본문에 시계가 들어가는 곳은 `startedAt`/`completedAt`/`timings`뿐이고
  전부 provenance다. id·분류·순서는 시계를 읽지 않는다.
- **재실행 가능성 (item 143).** 같은 URL을 다시 실행할 수 있다. live source
  drift 때문에 browser artifact의 byte-identical은 요구하지 않는다. offline
  stage는 같은 evidence에서 identical하다.

## Historical Artifact Immutability

Task 16 실행 전/후 `data/{domainchecker.co.kr,seoworld.co.kr,nextjs.org,developer.mozilla.org}`
전체 (3,863 파일)의 이름·크기·mtime tree hash:

```
before  aec5928af3afd06159f5c59e9b20a486ebe46ac3a0bbc4c0b044d4eb26d50026
after   aec5928af3afd06159f5c59e9b20a486ebe46ac3a0bbc4c0b044d4eb26d50026   ← 동일
```

canary는 관측만 하고 저장하지 않으며(`observePageWithBrowser`/`executeAction`은
쓰지 않는다), baseline 재생성은 임시 디렉터리로 출력했다. 새로 추가된 것은
`data/stripe.com/` 트리뿐이다.

## Full System Explanation

처음 보는 개발자를 위한 통합 설명이다 (item 133). 각 stage가 **왜** 있는지가
핵심이다.

**왜 Discovery가 필요한가.** URL 하나만으로는 사이트가 아니다. 어떤 페이지들이
존재하는지 알아야 하고, 그것을 브라우저로 링크를 따라가며 알아내면 그 자체가
crawl이다. Firecrawl Map은 그 목록을 한 번의 API 호출로 준다.

**왜 Verification이 필요한가.** Map 결과는 **후보**이지 확인된 페이지가 아니다.
redirect, 404/403/500, non-HTML 파일, 외부 redirect, 중복이 섞여 있다. 검증 없이
deep observation에 넘기면 가장 비싼 stage가 404 페이지를 정성껏 관측한다.
Verification은 후보마다 브라우저로 **한 번** 방문하는 가벼운 필터다 — computed
style도, 스크린샷도, mobile pass도 없다.

**왜 family selection을 하는가.** 블로그 글 20개가 하나의 템플릿일 수 있다. 20번
deep-observe하는 것은 같은 구조를 20번 사는 것이다. Selection은 이미 디스크에 있는
데이터만으로 (Firecrawl 0, browser 0, network 0) "실제로 관측이 필요한 페이지"를
고른다.

**왜 full page를 전부 deep observe하지 않는가.** 비용이다. 페이지 하나가
desktop + mobile 전체 DOM walk + computed style + geometry + 전체 스크린샷 두
장이고, Task 09에서 52페이지에 350 MB였다. Selection은 112 → 41 (63.4%)로 줄인다.
대신 **잃는 것이 있고, 그것을 숨기지 않는다**: family-represented route는 자기
observation이 없고, `coverage`가 그렇다고 말하며, Task 15의 family audit이 실제로
얼마나 나쁜지 측정하고, Task 16의 escalation이 최악인 것만 정확히 다시 본다.

**Observer가 무엇을 보는가.** 렌더가 끝난 뒤의 DOM이다. element마다 whitelist된
attribute, 정규화된 direct text, `getBoundingClientRect` geometry, 두 종류의
visibility, whitelist된 computed style(공유 테이블로 dedup), 그리고 Task 16부터
scroll container의 offset. **소스 CSS도 소스 JS도 읽지 않는다** — 브라우저가
계산을 끝낸 결과만 본다. 그래서 원본이 무엇으로 만들어졌는지가 상관없어진다.

**Interaction이 왜 rule-first인가.** 관측할 수 있는 것은 "클릭했더니
`aria-expanded`가 false→true가 되고 target이 hidden→visible이 되었다"까지다.
그것을 "아코디언"이라고 부르는 것은 해석이다. 해석을 rule로 두면 왜 그렇게
불렀는지 answerable하고, fixture로 검증 가능하고, 틀렸을 때 고칠 수 있다. 규칙이
설명하지 못하면 **이름을 붙이지 않고** classified unknown으로 남긴다. seoworld의
`메뉴 열기` 16건이 그것이고, 그 정직함이 Task 15에서 gap 탐지로 이어졌다.

**SiteSpec이 왜 필요한가.** SiteSpec 없이 Task 14를 만들면 renderer가 Task 09
`dom.json`, Task 11 action 파일, Task 12 pattern 파일을 전부 읽어야 한다. 그러면
관측 파이프라인의 run 디렉터리가 **reconstruction의 런타임 의존성**이 된다.
SiteSpec은 그 결합을 끊는 seam이다: 한 문장으로, *reconstruction engine은
SiteSpec 디렉터리를 읽고 그 외에는 아무것도 읽지 않는다.*

**Next.js reconstruction이 어떻게 동작하는가.** SiteSpec의 node tree를 generic
renderer가 `React.createElement(tagName, …)`로 렌더한다. component map도,
"카드처럼 보인다" 규칙도, `<div>`로 평탄화도 없다. style은 `styleTokenId
st000123` → `.wr-st000123 { 관측된 computed 값 그대로 }`. 112개 URL은 하나의
`[[...slug]]` catch-all route와 route map이 된다. 확인된 behavior만 trigger에
`data-wr-*` 몇 개로 붙고, 하나의 작은 generic client runtime이 그것을 읽는다 —
그래서 SiteSpec이 11 MB이든 83 MB이든 client bundle은 고정 크기다.

**QA가 어떻게 원인 stage를 찾는가.** 세 개의 진실을 절대 섞지 않는다: 저장된
snapshot(계약), 지금의 live original(drift 감지), clone(측정 대상). clone이
snapshot과 다르면 clone defect다. live original이 snapshot과 다르면 사이트가
바뀐 것이고 clone은 비난받지 않는다. 그리고 diff 수집과 원인 분류를 **다른
vocabulary를 가진 두 pass**로 나눈다 — font가 안 붙어서 300개 element가 밀린
것을 300개의 defect로 세는 것은 산술적으로 맞고 진단적으로 무용하기 때문이다.

**Correction이 왜 SiteSpec을 직접 수정하지 않는가.** SiteSpec은 **관측 기록**이다.
그것을 고치면 "그때 무엇을 보았는가"에 대한 답이 사라지고, 다음 실행에서 같은
문제가 다시 나타났을 때 비교할 기준이 없어진다. 그래서 corrected clone은
`SiteSpec + QaCorrectionSet`으로 **새로** 생성되고, corrected manifest가 두 출처를
모두 기록한다. correction type은 닫힌 3개다 — 임의의 CSS/JS를 담을 수 있는
artifact는 데이터의 탈을 쓴 코드 주입 채널이다.

## Final E2E Verdict

```
finalStatus: complete-with-known-limitations
```

**증명된 것.** 아무도 본 적 없는 public URL 하나가

```
19 discovered → 19 verified → 19 families → 19 deep observations
→ 616 interaction candidates → 65 safe actions → 28 patterns + 37 unknowns
→ 1 self-contained SiteSpec (99.3 MB)
→ 19 routes의 Next.js + React + TypeScript 앱 (34.3 MB, next build PASS)
→ 38 page/viewport QA → root cause가 붙은 2,132개 finding
→ 파이프라인 없이 혼자 빌드·기동되는 앱
```

이 되었고, 그 전 과정에서 **fake/stub으로 대체된 stage가 하나도 없다** (item 44).
원본이 무엇으로 만들어졌는지는 어느 stage에서도 읽히지 않았고, 생성된 앱의
dependency는 `next`/`react`/`react-dom`/`server-only` 넷뿐이다.

측정된 fidelity: **content exact 1.0** (74,178 node) · geometry median **0.00px**
/ p95 **0.99px** · 문서 높이 delta max **0.5px** · style mismatch **481 / 4,109,400
(0.0117%)** · route **19/19 렌더** · behavior mismatch **0** · asset occurrence
loss **0** · scroll 복원 **1/1** · unknown 승격 **0** · form write **0** · AI call
**0**.

**증명하지 못한 것 (item 48).** 정확히 네 가지다.

1. **clone이 hydration 없이 정확한가** — 15/19 페이지에서 React #418. 구조는
   일치하고 원인은 attribute/text 값이며, 유력한 후보는 inline SVG 채널이다.
   verified pattern 15개가 `unverifiable`이 된 것도 이 하나다.
2. **실제 사이트에서의 dynamic target 재구성** — stripe에는 dynamic target이 0개.
   nextjs.org canary(16 elements 캡처)와 fixture(clone이 관측된 children mount)까지가
   증거이고, 실사이트 clone에서 재생된 적은 없다.
3. **실제 사이트에서의 family escalation** — stripe는 family-represented route가
   0개. escalation 전 경로는 fixture에서만 실행됐다.
4. **remote asset** — 1,678개 이미지를 CDN에서 hotlink한다. 47건이 clone에서
   실패했고 materialization은 열지 않았다.

`complete`가 아닌 이유는 위 1번(실제 결함)과 3·4번(관측 경계)이 남아서이고,
`partial`이 아닌 이유는 verified route가 하나도 누락되지 않았기 때문이다.

## Changed Files

**신규 — `src/e2e/` (18 파일)**
`types.ts` · `run-context.ts` · `execute-stage.ts` · `stage-registry.ts` ·
`run-discovery.ts` · `run-verification.ts` · `run-observation.ts` ·
`run-interactions.ts` · `run-sitespec.ts` · `run-reconstruction.ts` · `run-qa.ts` ·
`escalation-policy.ts` · `family-escalation.ts` · `final-validation.ts` ·
`summarize.ts` · `store.ts` · `run-e2e.ts` · `index.ts`

**신규 — 기타**
`src/cli-e2e-reconstruct.ts` · `src/reconstruction/build-app.ts`
(CLI에서 추출한 공용 `next build`) · `src/sitespec/dynamic-template.ts` ·
`src/reconstruction-qa/state-diff.ts` · `scripts/smoke-e2e.ts` ·
`docs/result/16-full-e2e-reconstruction-2026-08-14.md`

**수정 — `src/observer/` (A1 · A2 · A3)**
`types.ts` (schema v4 + readable [3,4], `ScrollStateSchema`,
`SCROLLABLE_OVERFLOW_VALUES`, grid 9개, `ElementObservation.scrollState`,
stats/responsive-summary 카운터) · `collect-dom.ts` (scroll state 수집 +
bounded subtree mode + `CollectArg`) · `collect-assets.ts` (occurrence dedup +
`countUniqueAssetIdentities`) · `dedupe-styles.ts` (scrollState 전달) ·
`observe-page.ts` (새 호출 형태 + 새 stats) · `store.ts` (responsive summary)

**수정 — `src/interaction-explorer/`**
`types.ts` (schema v2 + readable [1,2], `CapturedSubtree`, 3개 cap) ·
`capture-state.ts` (`captureDynamicTargetSubtree` — Observer walk 재사용) ·
`execute-action.ts` (newly-mounted target만 capture)

**수정 — `src/sitespec/`**
`types.ts` (schema v3 + readable [2,3], compiler v3, `scrollState`,
`DynamicTemplate*`, limitation 2개, viewport/interaction 카운터) ·
`compile-viewport.ts` · `compile-interactions.ts` · `compile-site.ts` ·
`load-inputs.ts` (dynamic target subtree 로드)

**수정 — `src/reconstruction/`**
`types.ts` (SiteSpec v2/v3 both readable, manifest 카운터, limitation 2개) ·
`compile-node.ts` (`data-wr-scroll-*`, `styleRenders` gate) ·
`compile-runtime-page.ts` · `plan-reconstruction.ts` (renderable token 집합) ·
`interaction-bindings.ts` (template → runtime node, 64 KB 상한) ·
`runtime-template.ts` (`restoreScrollState`, `buildTemplateNode`) ·
`style-generator.ts` (`hasRenderableDeclarations`) · `generate-app.ts` ·
`index.ts` · `src/cli-reconstruct.ts` (공용 build 사용)

**수정 — `src/reconstruction-qa/`**
`types.ts` (`ScrollStateComparison`, `AssetOccurrenceComparison`,
`nested-scroll-state-mismatch`, `scroll-state` dimension, `dynamicTargetChildren`) ·
`capture-page.ts` (scroll 캡처) · `qa-page.ts` · `emit-diffs.ts` ·
`classify-diff.ts` · `compare-behavior.ts` · `qa-behavior.ts` · `summarize.ts`

**수정 — 기타**
`scripts/smoke-multi-observer.ts` (schema 버전을 상수에서 읽도록) ·
`package.json` (`e2e:reconstruct`, `smoke:e2e`) · `README.md` · `ROADMAP.md`

**dependency 추가: 0.** lockfile 변경 없음.

## Regression Test Results

| suite | result |
| --- | --- |
| `pnpm typecheck` | **PASS** |
| `pnpm smoke:verifier` | 81/81 |
| `pnpm smoke:selector` | 81/81 |
| `pnpm smoke:multi-observer` | 58/58 |
| `pnpm smoke:interaction-detector` | 92/92 |
| `pnpm smoke:interaction-explorer` | 95/95 |
| `pnpm smoke:interaction-patterns` | 88/88 |
| `pnpm smoke:sitespec` | 252/252 |
| `pnpm smoke:reconstruction` | 178/178 |
| `pnpm smoke:reconstruction-qa` | 134/134 |
| **`pnpm smoke:e2e`** (신규) | **104/104** |

## Problems Encountered

fresh 사이트를 처음 돌리면서 **파이프라인이 스스로 찾아낸 결함 두 개**와 이 Task가
만든 실수 하나.

1. **`<video><source>`의 빈 computed style이 dangling class를 만들었다.** 첫
   stripe run이 reconstruction validation에서 멈췄다:
   `className "wr-st009811" is referenced by the runtime tree but has no CSS rule`.
   Chromium은 layout에 들어가지 않는 metadata element에 대해 **빈** declaration을
   돌려주고, Observer는 `properties: {}`를 정직하게 기록하고, catalog는 그것을 하나의
   token으로 dedup하고, `generateStylesheet()`는 (옳게) rule을 만들지 않는데,
   `compile-node.ts`는 className을 붙였다. **Task 14 때부터 있던 결함이고, 네 개
   regression 사이트에 `<video><source>`가 없어서 드러나지 않았을 뿐이다.**
   `.wr-st009811{}` 같은 빈 rule을 내보내 validator를 조용히 만들지 않고,
   양쪽이 같은 predicate(`hasRenderableDeclarations`)를 묻도록 고쳤다.
2. **escalation recompile이 원본 observation으로 되돌아갈 뻔했다.** `loadInputs()`는
   `exploration.sourceSiteObservation`을 따라간다 — 정상 동작이고, 그래서 family
   escalation은 augmented 경로를 **명시적으로** 넘겨야 한다. 넘기지 않으면 네
   페이지를 관측한 뒤 그러지 않은 것처럼 컴파일하고, 결과는 "개선 없음"이면서 원인은
   escalation과 무관해진다. 실행 전에 코드 리뷰로 잡아 고쳤다.
3. **내가 만든 에러 보고 결함.** `execute-stage.ts`가 예외 메시지의 첫 줄만
   남겼다. `GeneratedAppValidationError`는 헤드라인이 1행이고 실제 문제는 그
   다음 줄들에 있으므로, 1번의 실패가 manifest에 `generated app failed validation:`
   — 콜론 뒤 아무것도 없이 — 로 기록됐다. 줄을 자르지 않고 이어 붙인 뒤 전체를
   상한하도록 고쳤다.

## Current Limitations

- **hydration 문제의 정확한 값을 특정하지 못했다.** production React의 minified
  error로는 어느 attribute/text가 다른지 알 수 없고, dev build로 재현하는 것은 이
  Task의 범위 밖으로 두었다. 증거가 지지하는 범위까지만 적었다.
- **dynamic target subtree와 family escalation은 실사이트 clone에서 재생되지
  않았다.** stripe에 해당 조건이 없었기 때문이다. canary와 fixture가 증거의 전부다.
- **4-site 전체 rerun을 하지 않았다** (item 27이 허용). 따라서 MDN geometry median이
  실제로 얼마나 개선됐는지, nextjs dynamic menu mismatch가 몇 개 줄었는지는 이
  Task가 모른다.
- **A3의 저장 비용은 측정했지만 최적화하지 않았다.** 9개 property가 거의 모든
  style token에 붙는다.
- **`safe-data-image-recovery`는 이번에도 발동하지 않았다** — corpus에 복구 대상
  `data:` URI가 없다. Task 15와 같은 상태다.
- **QA가 실행 시간의 80%, 저장의 55%다.** 개선 여지가 크지만 이 Task의 범위가
  아니다.

## Reviewer Checklist

**1. Asset dedup fix 후 같은 URL을 쓰는 모든 img가 asset relation을 유지하는가?**
예. dedup key가 element를 포함하도록 바뀌었고 (`type|url|descriptor|elementId`),
catalog dedup은 SiteSpec 쪽에서 그대로 유지된다. fresh run: **1,678 `<img>` 전부
asset-bound, 손실 0.** fixture: 같은 URL을 쓰는 `<img>` 3개 → unique asset 1,
occurrence 3, 전부 usable `src`.

**2. 기존 nextjs asset-loss canary가 실제로 해결됐는가?**
예. `https://nextjs.org/` 재관측 결과 57개 `<img>` 중 **구 dedup 규칙이면 18개가
mapping을 잃고, 현재 규칙에서는 0개**다. catalog unique asset은 124로 동일 —
duplicate 증가 0.

**3. nested scroll state가 Observer → SiteSpec → clone까지 전달되는가?**
예, 네 단계 전부 계측했다. fresh run: 관측 35 → SiteSpec 35 (그중 offset ≠ 0:
1) → clone 복원 지시 1 → **QA 측정 복원 1, mismatch 0.**

**4. MDN scroll canary geometry가 얼마나 개선됐는가?**
**측정하지 않았다.** canary는 Observer가 `<aside> scrollTop=18,106`을 — Task 15가
수동으로 찾아낸 바로 그 값을 — 기록한다는 것까지 증명한다. MDN을 재컴파일·재생성·
재QA하지 않았으므로(item 27이 targeted canary로 충분하다고 허용) 개선된 median은
이 Task가 갖고 있지 않다. 없는 숫자를 쓰지 않는다.

**5. grid property 누락이 실제로 해결됐는가?**
예. 9개 전부 관측된다 (MDN 754 token · nextjs 438 · seoworld 291 ·
domainchecker 396, desktop 기준). fresh run에서 SiteSpec style catalog에
9,517 token, 그리고 **QA style mismatch 목록에 9개 중 하나도 올라오지 않았다.**

**6. dynamic mounted subtree를 bounded하게 관측하는가?**
예. Observer 자신의 walk를 root만 바꿔 재사용하며 (별도 observer 없음), global
constant 3개로 제한한다 (300 elements / depth 12 / 20,000 chars). cap에 걸리면
어느 cap인지 기록한다. nextjs canary 3건 전부 truncation 0.

**7. 기존 nextjs dynamic menu mismatch는 얼마나 줄었는가?**
**측정하지 않았다.** capture가 동작함(3개 action에서 16 elements / 3 assets /
truncation 0, 실제 메뉴 텍스트)은 증명했고, fixture에서 clone이 관측된 children을
mount하는 것도 증명했다. 그러나 nextjs를 재컴파일·재QA하지 않았으므로 9건 중 몇
건이 줄었는지는 모른다.

**8. unknown interaction을 evidence 없이 pattern으로 승격한 사례가 0인가?**
**0.** registry rule은 이번 Task에서 하나도 추가되지 않았고, escalation policy가
`requires-pattern-modeling`을 코드로 거부한다. fresh run에서 unknown 37건, 승격 0,
auto-fix 0. fixture는 `메뉴 열기` trigger가 inert하게 남는 것을 검사한다.

**9. 새로운 E2E CLI가 모든 stage public API를 재사용하는가?**
예. `exec("pnpm …")`가 0건이다. 이번 Task에서 추출한 것은 하나뿐
(`src/reconstruction/build-app.ts` — CLI와 orchestrator가 같은 `next build`를
쓰도록). 복제 구현 0.

**10. stale latest-artifact discovery를 사용하는 곳이 0인가?**
**0.** `src/e2e/`에 `readdir`/glob으로 artifact를 고르는 코드가 없다 (유일한
`readdir`은 `final-validation.ts`의 생성된 앱 스캔이며 artifact 선택이 아니다).
모든 경로는 `E2eRunContext`가 앞 stage로부터 받아 기록하고, `assertLineage()`가
SiteSpec compile 직전에 chain을 재검사한다.

**11. fresh target은 기존 4개 사이트가 아닌가?**
예. **stripe.com** — item 41의 primary이고, 이 저장소가 처음 관측한 사이트다.
fallback(apple.com)은 조건이 성립하지 않아 쓰지 않았다.

**12. discovery부터 QA까지 실제 full chain을 실행했는가?**
예. 13개 stage 중 12개 실행, 1개(`family-escalation`) 조건 미성립으로 skip.
fake/stub 0. Firecrawl 1 call, `next build` exit 0, QA 38 pair 실측.

**13. fresh verified route 중 generated route coverage는?**
**19 / 19 (100%)**, 전부 HTTP 200 렌더. route failure 0.

**14. fresh exact-observed content fidelity는?**
**1.0** — 38 page/viewport 전부, 74,178 node, content mismatch 0.

**15. fresh geometry median/p95는?**
desktop **0.00px / 0.99px**, mobile **0.00px / 1.00px** (page별 값의 median).
max delta 359px, 문서 높이 delta median 0.21px / max 0.50px.

**16. fresh visual worst pages는?**
`p000015/mobile` 0.200 · `p000008/desktop` 0.172 · `p000009/mobile` 0.139 ·
`p000017/mobile` 0.126 (changed pixel ratio). median desktop 0.081 / mobile 0.103.

**17. fresh style mismatch top properties는?**
`width` 157 · `grid-template-rows` 140 · `grid-template-columns` 76 ·
`mask-image` 42 · `-webkit-mask-image` 42 · `height` 16 ·
`animation-duration` 6 · `line-height` 2. 총 481 / 4,109,400 (0.0117%),
sub-layout-unit 4,076건은 별도 계상.

**18. fresh asset occurrence loss는 몇 건인가?**
**0.** SiteSpec `<img>` 1,678개 전부 asset-bound, clone에서 `src` 없는 것 0개,
SiteSpec에 asset ref 없는 `<img>` 0개.

**19. fresh nested scroll state node는 몇 개인가?**
관측 **35**개 (desktop+mobile 합), 그중 offset ≠ 0인 것 **1**개. SiteSpec 35,
clone 복원 지시 1, QA 복원 확인 1, mismatch 0.

**20. fresh behavior equivalent/mismatch는?**
**13 equivalent / 0 mismatch** / 15 unverifiable (28 중). unverifiable 15건은
전부 clone `click-error`이고 전부 hydration error가 난 page/viewport에 있다 —
Remaining Limitations 1의 하류 효과이지 별도 문제가 아니다.

**21. fresh unknown behavior gap은?**
10 signature group 중 8개 sampling, **gap 5건**, clone no-op 8, unverifiable 1,
auto-fix **0**.

**22. family-represented gap은 몇 건인가?**
**0** — 애초에 family-represented route가 0개다 (19 verified → 19 family).
따라서 audit 대상도 0이다.

**23. exact family escalation을 몇 route 수행했는가?**
**0** (수행할 대상이 없었다). escalation 경로 자체는 `pnpm smoke:e2e` fixture에서
실행·검증된다.

**24. escalation 후 fidelity가 개선됐는가?**
**N/A** — escalation이 실행되지 않았다.

**25. auto-fix proposed/applied/accepted/rejected는?**
**proposed 1 · applied 1 · accepted 0 · rejected 1.** 유일한
`document-canvas-background` correction이 자기 target metric을 1 → 1로 두어
`target-metric-not-improved`로 기각됐다. gate가 설계대로 작동한 것이다.

**26. correction regression은 0인가?**
예. accepted correction이 0이므로 최종 결과물은 baseline이고, 회귀할 대상이 없다.
route 19/19 유지, content mismatch 0 유지, behavior mismatch 0 유지, unknown 구현
0, form write 0.

**27. source drift를 clone bug로 오분류한 사례가 0인가?**
예. drift 1,196건 전부 `source-*`로 분류돼 `source-site`가 소유하고, clone
content exact ratio는 1.0을 유지한다. Task 15의 3-way 정책 그대로다.

**28. final clone runtime JS/hydration error는?**
**30건** (JavaScript error 30 = hydration error 30, 15 page × 2 viewport).
cross-origin 차단 message는 0. **Task 15의 "0"에서 퇴행했고, Remaining
Limitations 1로 보고한다.**

**29. form/backend write request는 0인가?**
**0.** SiteSpec에 form action endpoint가 존재하지 않고, `FormSafetyRuntime`이
capture phase에서 submit을 막으며, 생성된 소스에 `fetch`/`XHR`/`WebSocket`/
`sendBeacon`이 0건, origin으로 향하는 `action=`이 0건이다.

**30. original source JS/CSS를 복사한 사례가 0인가?**
**0.** 원본 `<script src="http…">` 0 · 원본 stylesheet `<link>`/`@import` 0 ·
inline `on*=` handler 0 · 원본 `class` 속성 재구성 0. 생성된 `data-wr-*`와
`.wr-st…`는 이 파이프라인 자신의 어휘다.

**31. generated app은 upstream artifacts 없이 실행 가능한가?**
예. `app/`을 파이프라인 artifact가 하나도 없는 디렉터리로 복사해 `next build`
PASS, `next start` 후 실제 route 3개가 HTTP 200 (1.05 MB / 1.77 MB / 0.38 MB),
route table 밖 경로는 404. upstream artifact 참조 0건.

**32. generated app은 어떤 Next/React/TS version을 사용하는가?**
`next` **16.3.0** · `react` **19.2.8** · `react-dom` **19.2.8** ·
`server-only` 0.0.1 / dev: `typescript` **5.9.3** · `@types/node` 24.13.3 ·
`@types/react` 19.2.18 · `@types/react-dom` 19.2.4.

**33. 원본의 CMS/framework와 generated app dependency 사이 coupling이 0인가?**
**0.** 위 8개가 전부이고 origin-stack 표지(wordpress/jquery/shopify/vue/…)에
해당하는 것이 하나도 없다. `https://stripe.com/`은 생성 소스에 정확히 한 번,
`SOURCE_ROOT_URL` provenance 상수로만 등장하며 어느 모듈도 import하지 않는다.

**34. 현재 output이 Tailwind가 아닌 generated CSS인 이유는?**
style 진실이 브라우저의 final computed value이고, `.wr-st000123 { …그대로… }`가
그것을 손실 없이 옮기는 가장 짧은 경로이기 때문이다. Tailwind 매핑을 넣으면 매핑
오류가 fidelity 숫자에 섞여 reconstruction correctness와 implementation
refactoring이 하나의 숫자로 합쳐진다. Tailwind는 향후 maintainability 단계의
문제이고 지금의 정확성과 분리된다.

**35. AI call은 몇 번인가?**
**0.** orchestrator가 `--ai`를 넘기지 않으므로 provider가 설정된 기계에서도 0이다.
manifest의 `environment.aiCalls: 0`은 환경 보고가 아니라 파이프라인 성질이다.

**36. Firecrawl call은 어느 stage에서만 발생했는가?**
**discovery에서만, 1회.** `FirecrawlDiscoveryProvider`가 인스턴스화되는 곳은
`src/cli.ts`(standalone `pnpm recon`)와 `src/e2e/run-discovery.ts` 둘뿐이고,
`stage-registry.ts`가 `firecrawl: true`인 stage가 정확히 하나이며 그것이 discovery임을
실행 시점에 assert한다.

**37. Playwright browser work의 주요 비용은 어느 stage인가?**
**QA (1,152,916 ms — 전체의 80.3%).** 그 다음이 interaction exploration
(141,587 ms)과 observation (110,192 ms)이다. offline stage 5개는 합쳐서 14.0초
(1.0%)다.

**38. 기존 Task06~15 artifact mutation은 0인가?**
**0.** 네 사이트 3,863개 파일의 (경로·크기·mtime) tree hash가 Task 16 전후로
`aec5928af3afd06159f5c59e9b20a486ebe46ac3a0bbc4c0b044d4eb26d50026`로 동일하다.
canary는 관측만 하고 저장하지 않으며, baseline 재생성은 임시 디렉터리로 출력했다.

**39. 모든 smoke suite가 PASS인가?**
예 — 11개 전부. 위 "Regression Test Results" 표 참조 (신규 `smoke:e2e` 99/99 포함).

**40. 남은 가장 큰 fidelity issue 10개는?**
"Remaining Limitations" 참조. 1위는 **clone hydration 실패 30건**이고, 그것이
behavior unverifiable 15건과 inferred-breakpoint 3건까지 설명한다.

**41. 각 issue는 어느 upstream stage 소유인가?**
`source-site` 1,196 · `reconstruction` 894 · `qa` 17 · `pattern-modeling` 5 ·
**`observation` 0** · `selection` 0 · `interaction-exploration` 0. observation이
0이 된 것이 Phase A의 결과다.

**42. 추가 re-observation이 필요한 것은?**
`source-content-drift` 1,186 · `source-style-drift` 9 ·
`source-structural-drift` 1. 다만 stripe의 drift는 실시간 카운터와 로케일
콘텐츠라 재관측이 답을 바꾸지 않는다 — item 61의 조건이 성립하지 않아 escalate하지
않았다.

**43. 추가 interaction probe가 필요한 것은?**
fresh run에서는 **0** (dynamic target 0개, `requires-new-interaction-observation`
0건). 기존 corpus에서는 nextjs dynamic menu 9건이 여전히 재QA 대상이다 — capture는
구현·검증됐지만 재컴파일하지 않았다.

**44. remote asset materialization이 필요한 것은?**
`asset-load-failure` **47건**. clone이 hotlink하는 stripe CDN 이미지
(`images.stripeassets.com` 1,678 · `videos.stripeassets.com` 10) 중 clone
context에서 decode되지 않은 것들이다. 같은 이미지 1,184개는 live original에서도
decode되지 않으므로 그쪽은 site behavior다.

**45. public browser observation만으로 해결 불가능한 것은?**
remote asset의 바이트(원본 서버가 cross-origin으로 주지 않으면 관측으로 얻을 수
없다) · unknown 5건의 semantic(이름 붙일 관측 가능한 증거가 없다) · iframe
내용 · backend가 계산하는 dynamic content · 실시간 카운터(관측 시점의 값 하나만
얻을 수 있다).

**46. finalStatus는 무엇인가?**
**`complete-with-known-limitations`.** 모든 required stage 성공, verified route
누락 0, 그리고 관측 경계 밖의 limitation과 실제 결함 하나(hydration)가 남았다.

**47. 현재 시스템이 실제로 "arbitrary origin stack → independent Next.js
reconstruction"을 증명했는가?**
**예 — 구조적으로도, 실측으로도.** 구조적으로: 원본 stack이 분기 조건으로
등장하는 코드 경로가 없고, 생성된 앱의 dependency 8개에 origin 표지가 0개다.
실측으로: 처음 보는 URL 하나가 19개 route의 앱이 되었고, 파이프라인 artifact가
전혀 없는 디렉터리에서 빌드·기동되며, content fidelity 1.0 · geometry median
0.00px · behavior mismatch 0으로 측정됐다.

**48. 증명하지 못한 부분은 정확히 무엇인가?**
네 가지. (1) **hydration 정합성** — 15/19 페이지에서 React #418, 구조는
일치하고 값 차이이며 정확한 값은 특정하지 못했다. (2) **실사이트 dynamic target
재구성** — stripe에 대상이 0개라 canary와 fixture까지가 증거다.
(3) **실사이트 family escalation** — 대상이 0개라 fixture에서만 실행됐다.
(4) **remote asset** — 1,678개를 hotlink하며 materialization은 열지 않았다.
그리고 위 4·7번대로, 기존 corpus의 개선폭(MDN geometry, nextjs dynamic menu)은
재QA를 하지 않았으므로 **수치로 주장하지 않는다.**
