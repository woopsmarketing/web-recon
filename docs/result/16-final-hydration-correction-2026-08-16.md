Task: 16 (final correction)
Title: Final Correction — React Hydration Consistency
Previous: 16-full-e2e-reconstruction-2026-08-14.md
Status: Complete

# Task 16 Final Correction — React Hydration Consistency

이것은 Task 17이 아니다. Task 16의 final correction이다. 새 architecture도, 새
stage도, 새 관측 종류도 추가하지 않는다.

Task 16의 fresh stripe.com 실행은 19 route를 전부 렌더링하고 content exact ratio
1.0을 냈지만, **19 page 중 15 page가 desktop/mobile 양쪽에서 React hydration
error #418을 던졌다** (총 30건). 보고서 자신이 그 귀속을 `upstream =
reconstruction`이라고 적었다. observation limitation이 아니라 우리 renderer의
결함이라는 뜻이고, 그렇다면 Task 16을 닫기 전에 제거해야 한다.

원인을 찾는 과정에서 **같은 뿌리를 가진 두 번째 결함**이 드러났고, 그것이 실은
"15 unverifiable behavior"의 진짜 원인이었다. 이 보고서는 둘 다 다룬다.

## 한 문장 요약

> 클론은 **관측된 DOM을 HTML로 실어 나른다**. 그런데 DOM이 담을 수 있는 것 중
> HTML이 실어 나를 수 없는 것이 있다. 두 결함 모두 그 왕복(DOM → HTML → DOM)에서
> 잃어버린 것이었다.

| # | 잃어버린 것 | 증상 | 소유 layer |
| --- | --- | --- | --- |
| 1 | parser가 만들 수 없는 parent→child edge (`li > li`) | hydration #418 × 30 | reconstruction |
| 2 | pseudo-element의 `z-index` | verified interaction 15건 replay 불가 | observer whitelist |

---

## 1. Production error를 dev에서 재현 (item 4)

production의 minified 문자열만 보고 추측하지 않았다.

Task 16의 fresh reconstruction을 `tmp/hydration-debug/`로 복사하고 `next dev`로
띄운 뒤 Playwright로 affected route 2개(`/ae/customers/dust`,
`/blog/introducing-stripes-new-api-release-process`)와 clean control route
2개(`/legal/becs`, `/en-ca/radar`)를 열었다.

**첫 시도는 아무것도 재현하지 못했다** — 그리고 그 실패 자체가 진단이었다. dev
server log에 이렇게 남았다.

```
⚠ Blocked cross-origin request to Next.js dev resource /_next/static/chunks/_0jnsbiq._.js from "127.0.0.1".
```

Next.js 16은 dev resource의 cross-origin 요청을 기본 차단한다. `127.0.0.1`로
접속했기 때문에 **client bundle 자체가 로드되지 않았고, hydration이 아예 일어나지
않았다.** console error 0, pageerror 0, DOM은 parser가 만든 그대로. `localhost`로
바꾸자 즉시 재현됐다.

React development build가 직접 말한 내용:

```
In HTML, <li> cannot be a descendant of <li>.
This will cause a hydration error.

  ...
    <PageRenderer>
      <div data-wr-node="n000001" data-wr-doc-tag="html" ...>
        ...
            <nav data-wr-node="n000082" className="wr-st001839">
              <ul data-wr-node="n000083" className="wr-st007700">
                <li>
                <li>
                ...
>               <li data-wr-node="n000111" className="wr-st008332">
>                 <li data-wr-node="n000112" className="wr-st008333">
```

이어서:

```
Uncaught Error: Hydration failed because the server rendered HTML didn't match
the client. As a result this tree will be regenerated on the client. This can
happen if a SSR-ed Client Component used:
  ...
  - Invalid HTML tag nesting.
    at li (<anonymous>)
    at CatchAllPage (app/[[...slug]]/page.tsx:42:10)
```

production 문자열 `React error #418; args[]=HTML&args[]=` 과 일치한다. `args[0]`
가 `"HTML"`인 것은 React의 `throwOnHydrationMismatch(fiber, fromText=false)` —
**text 불일치가 아니라 element 불일치**라는 뜻이고, 처음부터 attribute/text가
아니라 구조를 보라는 신호였다.

## 2. 정확한 First Divergence (item 5)

| 항목 | 값 |
| --- | --- |
| pageId | `p000001` 외 14개 (총 15 page) |
| viewport | desktop **및** mobile |
| SiteSpec nodeId | `n000112` (부모 `n000111`) |
| tagName | `li` (부모 `li`) |
| source channel | **element 구조** — attribute도 text도 namespace도 아님 |
| 원본 위치 | site header의 **mobile menu** 목록에 있는 "Sign in" 항목 |
| 원본 element id | `e000098` (바깥) / `e000099` (안쪽) |

관측된 SiteSpec의 실제 모양:

```
<ul  n000083>                                    class="MobileMenu__navList"
  <li  n000111>            ← wr-st008332        class="MobileMenu__loginNavItem"
    <li  n000112>          ← wr-st008333        class="SiteMobileMenuNavItem"
      <a n000113 href="https://dashboard.stripe.com/login">Sign in</a>
```

(class는 SiteSpec에 들어가지 않는다 — 위치를 특정하기 위해 원본 `dom.json`에서
읽어 적었다.) 이 목록은 mobile menu용이지만 **두 viewport의 markup에 모두
존재한다**. desktop에서는 CSS로 숨겨질 뿐 DOM에는 있다. 그래서 desktop tree와
mobile tree가 둘 다 이 edge를 담는다.

## 3. 세 층 비교 (item 6, 7)

| 층 | 무엇 | 결과 |
| --- | --- | --- |
| **A. React server output** | 순수 `fetch`로 받은 HTML 문자열 | `…<li data-wr-node="n000111" class="wr-st008332"><li data-wr-node="n000112" class="wr-st008333"><a …>Sign in</a>…` — **중첩된 채로 정확히 출력됨** |
| **B. hydration 직전 parsed DOM** | JS 끄고 로드한 DOM | 중첩 `li` 쌍 **0개**. `n000112`의 부모는 `<ul n000083>`, 직전 형제는 `n000111` — **parser가 평탄화함** |
| **C. React client 기대** | dev diagnostic | `n000112`가 `n000111`의 **자식** |

즉 server renderer bug도, prop adapter bug도, SVG namespace 문제도, text
normalization도 아니다. **HTML parser의 tree construction 단계가 우리 markup을
다시 쓴 것**이다. HTML 표준의 "in body" insertion mode는 `<li>` 시작 태그를 만나면
list item scope 안에 열려 있는 `<li>`를 닫는다.

Task 16 runtime(`useEffect` 안의 scroll 복원·template mount)과 섞이지 않았음도
확인했다. hydration mismatch는 effect보다 먼저 일어나고, 위 [B]는 JS를 끈 상태의
측정이다.

## 4. 왜 `<li> > <li>`가 애초에 관측됐나 — 이것이 핵심이다

Observer는 **live DOM**을 읽는다. `document.createElement("li")` 를
`appendChild`로 다른 `<li>`에 붙이는 것은 DOM API가 허용한다. stripe의 header는
script가 만들고, 그 결과 live DOM에 parser로는 만들 수 없는 모양이 존재한다.

**관측은 틀리지 않았다. 페이지가 실제로 그랬다.** 틀린 것은 "관측한 DOM을 HTML로
직렬화해 다시 parse시켜도 같은 tree가 나온다"는 우리 renderer의 암묵적 가정이다.

## 5. 같은 원인의 두 번째 피해 — 이미 artifact에 기록돼 있었다

이 correction 이전에 만들어진 Task 16 SiteSpec을 열어 보면:

```
contentRecovery: { status: "fallback",
                   failure: "parent-relation-mismatch",
                   mismatchIndex: 98,
                   mismatchDetail: "parsedParent=74 sourceParent=97" }
```

**30 page/viewport** 가 이 상태이고, aligned는 8개(= clean page 4 × 2)다. 원본
`dom.json`에서 확인한 element index:

| index | element | tag | parent |
| --- | --- | --- | --- |
| 74 | `e000075` | `<ul class="MobileMenu__navList">` | — |
| 97 | `e000098` | `<li class="MobileMenu__loginNavItem">` | `e000075` |
| 98 | `e000099` | `<li class="SiteMobileMenuNavItem">` | **`e000098`** |

`parsedParent=74 sourceParent=97` — parser는 안쪽 `<li>`를 `<ul>` 밑에 놓았고,
관측은 바깥 `<li>` 밑에 있다고 말한다. 그 viewport 전체에서 중첩 `li` 쌍은 이
하나뿐이다. **hydration을 깨뜨린 것과 정확히 같은 edge다.**

Task 13의 content alignment는 `rendered.html`을 parse5로 다시 parse해서 관측
DOM과 index별로 대조한다. `rendered.html`은 관측 DOM의 **직렬화**이므로, parse로
되돌릴 수 없는 edge가 하나라도 있으면 그 viewport 전체의 정렬이 실패한다. 그
결과로 붙은 limitation이 다음 네 개, 각각 30건:

- `content-recovery-fallback`
- `supplemental-attributes-not-recovered`
- `mixed-content-order-not-recovered`
- `text-may-be-truncated`

즉 이 하나의 edge는 hydration만 깨뜨린 것이 아니라, **그 15개 페이지의 declarative
attribute 복구를 통째로 끄고 있었다.**

이 정렬 실패는 이번 correction에서 **고치지 않았다.** `rendered.html`이 그런 DOM에
대해 손실 있는 채널인 것은 사실이고, fallback은 정확하고 정직한 동작이다. 고칠
대상이 아니라 기록할 대상이다. (재관측 후에도 동일하게 30/8로 재현됨 — §12.)

## 6. 왜 stripe 19개 중 15개인가

중첩 `li`는 stripe의 **전역 marketing header**(그 안의 mobile menu 목록) 안에
있다. 그 header를 렌더링하는 15개 페이지가 전부 영향을 받았고, 받지 않은 4개는
header가 다르다.

추측이 아니라 원본 `dom.json`에서 센 값이다 (desktop viewport):

| page | route | elements | `MobileMenu*` element | 중첩 `li` |
| --- | --- | --- | --- | --- |
| p000001 | `/ae/customers/dust` | 1,873 | **37** | **1** |
| p000005 | `/careers/listing/creative-director-event-design/8001909` | 293 | **0** | 0 |
| p000008 | `/en-ca/radar` | 1,776 | **0** | 0 |
| p000016 | `/legal/becs` | 698 | **0** | 0 |
| p000017 | `/legal/interac` | 811 | **0** | 0 |

영향을 받지 않은 네 페이지는 그 header component를 **아예 렌더링하지 않는다**.
그리고 그 목록은 두 viewport tree에 모두 들어 있으므로 15 × 2 = **30**, 관측된
hydration error 수와 정확히 일치한다.

## 7. 왜 기존 4-site corpus에서는 안 나왔나

corpus 전체에 **parser가 다시 쓰는 edge가 하나도 없다.** 실제 detector로 측정:

| site | 검사한 element | parser-unstable edge |
| --- | --- | --- |
| developer.mozilla.org | 45,240 | **0** |
| domainchecker.co.kr | 6,202 | **0** |
| nextjs.org | 82,355 | **0** |
| seoworld.co.kr | 8,814 | **0** |
| **소계** | **142,611** | **0** |
| stripe.com | 66,948 | **30** (전부 `list-item-implied-end`) |

parse된 DOM은 정의상 parser가 만들 수 있는 모양만 갖는다. 이런 edge는 **script가
DOM을 만들 때만** 생긴다. corpus 네 사이트는 그런 구성을 하지 않았고, stripe는
했다. 관측 5개 사이트 중 1개에서만 나타난 이유이자, 이 결함이 fresh site에서만
드러난 이유다.

## 8. Generic fix — `src/reconstruction/nesting.ts` (item 13, 16)

수정은 원인을 소유한 layer에 있다. 원인은 "우리가 parser가 다시 쓸 HTML을
내보낸다"이고, 소유자는 **runtime tree를 만드는 generator**다.

### 원칙

HTML이 그 관계를 표현할 방법을 **가지고 있으면 그 방법으로 쓴다**. list item 안의
list item을 HTML로 쓰는 방법은 처음부터 정해져 있다:

```html
<li><ul><li>…</li></ul></li>
```

이것은 트릭이 아니라 **정확한 직렬화**다. 사람이 손으로 써도 그렇게 쓴다.

### 무엇이 보존되는가

- 관측된 **모든 node**, 그 tag·attribute·text·순서 그대로
- **ancestry**: `n000112`는 여전히 `n000111` 안에 있다
- **geometry**: 끼워 넣은 container는 `display: contents` — box를 만들지 않는다
  (이미 inline-SVG host가 쓰는 것과 같은 기법)
- container에는 `data-wr-node`가 없다 → QA가 그 위에 아무것도 mapping할 수 없다

### 무엇을 거부하는가

detector는 tree construction 단계가 다시 쓰는 edge를 닫힌 표로 전부 본다:
`list-item-implied-end`, `definition-item-implied-end`, `block-closes-p`,
`nested-anchor`, `nested-formatting`, `nested-form`, `nested-button`,
`table-model-misplaced`, `table-stray-content`. scope 계산은 표준을 따른다 —
"in scope", "button scope", list item walk의 `address`/`div`/`p` 예외, foreign
content(`<svg>`/`<math>`) 제외, formatting marker.

HTML이 **손실 없이 표현할 방법이 없는** edge는 끼워 넣지 않고 **생성을
거부한다**. `SKIPPED_TAGS`나 void-element 검사와 같은 벽이다: "브라우저가 다시 쓸
markup은 내보내지 않는다"가 데이터의 성질이 아니라 코드의 성질이어야 한다.
측정값: 5개 사이트 전체에서 **거부 0건**, 적응 30건.

### 읽어서 다시 확인 (item 180)

`validateGeneratedApp()`이 **디스크에 쓰인** runtime data를 다시 읽어 parser
-unstable edge가 남아 있는지 검사한다. compiler가 스스로 일관됐다는 주장이 아니라,
실제로 build될 앱이 그렇다는 증거다.

## 9. 두 번째 결함 — pseudo-element가 interaction 장벽이 되다

hydration을 0으로 만든 뒤 verified interaction QA를 다시 돌렸더니 **unverifiable이
여전히 15건**이었다. 즉 이전 보고서가 "hydration error가 15 unverifiable을 완전히
설명한다"고 적은 것은 **틀렸다** (상관관계가 완벽했을 뿐이다). 실제 실패는:

```
elementHandle.click: Timeout 10000ms exceeded.
```

JS 예외가 아니라 Playwright의 **actionability timeout**이다. 15건 전부 같은
node(`n000025`, header nav 버튼), 같은 15개 페이지, desktop만.

클론과 live 원본을 같은 좌표에서 같은 방법으로 측정했다:

| | live original | 클론 (수정 전) |
| --- | --- | --- |
| 버튼 중심에서 hit되는 element | `span.SiteHeaderNavItem__linkText` (버튼의 자손) | `div.wr-st005410` (버튼의 **조상**) |
| `hitIsSelfOrDescendant` | `true` | `false` |
| `div::after` | `z-index: -1` | **`z-index: auto`** |
| `header::after` | `z-index: -1` | **`z-index: auto`** |
| click | **OK** | **timeout** |

`PSEUDO_STYLE_WHITELIST`에는 그 상자를 **그리는 데** 필요한 속성이 전부 있었다 —
`content`, `position`, `top/right/bottom/left`, `background-color`, `display`.
없는 것은 그것을 **뒤로 보내는** 속성 하나, `z-index`였다. `z-index: auto`로
재구성된 흰색 full-bleed 막대는 header 위에 그려지고, nav 전체의 클릭을 삼킨다.

가설을 코드로 고치기 전에 검증했다: 생성된 stylesheet의 해당 pseudo rule에
`z-index:-1`만 손으로 넣고 다시 측정하니 hit target이 버튼 자신의 span으로 바뀌고
**click: OK**. 그 다음 patch를 되돌려 artifact를 byte 단위로 복원했다(sha256
확인).

**Fix**: `z-index`와 `pointer-events`를 `PSEUDO_STYLE_WHITELIST`에 추가. 두
속성은 "이 장식용 상자가 클릭을 막는가"를 결정하는 것들이다. `opacity`,
`visibility`는 **추가하지 않았다** — 그것들은 상자가 어떻게 *보이는가*이고, 아직
어떤 측정도 요구하지 않았다.

## 10. 최소 재현 fixture와 negative fixture (item 14, 15)

`pnpm smoke:reconstruction` 안에 있다. 실제 페이지가 아니라 **합성 SiteSpec**이다.

### 재현 fixture — 4개 node

```
<ul id="navlist">
  <li id="nav-outer">
    <li id="nav-inner">
      <a id="nav-signin">Sign in</a>
```

이 fixture는 **quiet page**에 있고, 그 위치 선택 자체가 발견의 일부다:
`rendered.html`은 관측 DOM의 직렬화이므로 이 edge가 있는 viewport는 §5대로 반드시
정렬에 실패한다. home page의 정렬은 Task 13.1 attribute recovery가 동작한다는
증거(HTML에만 있는 `<input checked>`를 복구한다)이므로, 거기에 직렬화 불가능한
edge를 넣으면 그 테스트를 조용히 무력화한다. 실제로 처음에 home page에 넣었다가
`checked` 복구가 사라져 기존 check가 깨졌고, 그래서 옮겼다.

### Negative fixture — 같은 관계, HTML이 허용하는 표기

```
<ul id="goodlist">
  <li id="good-outer">
    <ul id="good-sub">
      <li id="good-inner">Nested item</li>
```

적응은 여기에 **손대지 않아야** 한다.

### 검증되는 것 (양방향, 실제 브라우저 parser로)

```
PASS  the SiteSpec really observed <li> directly inside <li> (the defect is in the input)
PASS  the generator interposed exactly one container for the one bad edge
PASS  …the interposed container carries no data-wr-node, so QA cannot map onto it
PASS  …and both viewports were adapted, and only those two
PASS  the adaptation is recorded as a limitation, not hidden
PASS  the inner <li> is still a descendant of the outer <li>
PASS  the already-valid nested list is left exactly as observed
PASS  …with no container interposed anywhere inside it
PASS  no page in the generated app holds an edge the HTML parser would rewrite
PASS  the container is removed from layout, so the observed geometry is unchanged
PASS  the naive serialization IS rewritten by the parser (the defect reproduces)
PASS  …and the adapted serialization keeps the observed ancestry
PASS  in the live clone the inner <li> is inside the outer <li>, through the container
PASS  …and the container generates no box, so it cannot move anything
```

마지막 네 개는 `DOMParser`와 살아 있는 클론에서 측정한다 — parser 동작의 *모델*이
아니라 parser 자신이다. "fix 전 재현 / fix 후 0"이 한 실행 안에서 둘 다 증명된다.

pseudo 쪽 fixture는 `position: absolute` + `background` + `z-index: -1`인
`::after`를 가진 container 안에 버튼을 넣는다:

```
PASS  the observed ::after reached the stylesheet
PASS  …carrying the z-index that puts it BEHIND the content
PASS  the pseudo-element is behind the content, as observed
PASS  …so the hit target at the button's centre is the button itself
PASS  …and Playwright can actually click it
```

## 11. 금지 사항 준수 (item 3)

| 금지 | 사용 여부 |
| --- | --- |
| `suppressHydrationWarning` | **0** — repo 전체 검색 결과 없음 |
| `console.error` filter | **0** |
| React #418 무시 | 아니오 — 원인을 제거함 |
| affected page만 client-only render | **0** |
| `dynamic(..., { ssr: false })` | **0** |
| 전체 page를 Client Component로 | 아니오 — server tree + 작은 generic client runtime 구조 유지 |
| hydration 제거 | 아니오 |
| Stripe 전용 selector/URL 조건 | **0** — `src/` 안의 "stripe" 문자열 3개는 전부 증거 출처를 적은 **주석**이고, 조건문은 하나도 없다 |
| inline SVG 삭제 | **0** — SVG는 원인이 아니었음 |
| source markup 임의 삭제 | **0** |
| content 변경 | **0** — content exact ratio 1.0 유지 |
| SiteSpec 변경으로 증상 은폐 | 아니오 — SiteSpec은 관측대로 `li > li`를 계속 기록한다 |
| AI | **0** |
| Firecrawl 재실행 | **0** |
| Discovery 재실행 | **0** — 기존 `verified-urls` / `selected-pages` 재사용 |
| 새 architecture | 없음 |
| Git add / commit / push | **하지 않음** |

`dangerouslySetInnerHTML`은 여전히 sanitized inline SVG channel 한 곳에만 있다.
일반 HTML로 확대하지 않았다 (item 10).

## 12. 실행 구성 — 두 개의 run

두 결함의 증거를 섞지 않기 위해 두 번 실행했다.

| | run A | run B |
| --- | --- | --- |
| 목적 | nesting fix만의 효과 | pseudo `z-index`까지 |
| 관측 | **Task 16과 동일한 관측 재사용** | 재관측 필요 (기존 관측에 pseudo `z-index`가 없음) |
| SiteSpec | `2026-08-14T12-14-38-322Z` (동일) | `2026-08-15T22-05-17-392Z` |
| reconstruction | `2026-08-15T21-30-10-515Z` | `2026-08-15T22-05-36-777Z` |
| QA | `2026-08-15T21-30-47-530Z` | `2026-08-15T22-05-54-869Z` |

run A는 **입력이 완전히 동일**하므로 before/after가 순수한 apples-to-apples다.
run B는 재관측이 들어가므로 snapshot 자체가 다르다(live drift 포함).

Discovery와 Firecrawl은 재실행하지 않았다. run B의 재관측은 Task 16이 이미 만든
`verified-urls.json` / `selected-pages.json`을 그대로 입력으로 받는다 (Firecrawl 0,
discovery 0).

## 13. run A 결과 — nesting fix만, 입력 완전 동일

reconstruction manifest 차이는 정확히 세 줄이다.

```
nestingAdaptations:     (없음) → 30
runtimeElementNodes:     74178 → 74208     (+30, 끼워 넣은 container)
limitations:            + parser-invalid-nesting-adapted
```

그 외 모든 stat이 동일하다. QA 측정:

| 측정 | before | run A |
| --- | --- | --- |
| **clone JS runtime error** | **30** | **0** |
| routes rendered | 19/19 | 19/19 |
| content exact ratio | 1.0 | 1.0 |
| content mismatched nodes | 0 | 0 |
| compared nodes | 74,178 | 74,178 |
| geometry median-of-medians | 0.00px | 0.00px |
| geometry median-of-p95 | 0.99px | 0.99px |
| geometry max delta | 359px | 359px |
| style compared / mismatched | 4,109,400 / 481 | 4,109,400 / **481** |
| visual changed-ratio median | 0.089 | 0.089 |
| document height delta median | 0.21 | 0.21 |
| asset occurrence lost | 0 | 0 |
| scroll nodes / restored / mismatched | 35 / 1 / 0 | 35 / 1 / 0 |
| unstable pages | 0 | 0 |
| unknown auto-promotion | 0 | 0 |
| corrections proposed / applied / rejected | 1 / 0 / 1 | 1 / 0 / 1 |

**static fidelity가 한 자리도 움직이지 않았다.** `display: contents` container가
box를 만들지 않는다는 주장의 실측 증거다.

diff classification (같은 관측·같은 snapshot이므로 직접 비교 가능):

| classification | before | run A |
| --- | --- | --- |
| **`runtime-error`** | **30** | **0** (행 자체가 사라짐) |
| **`inferred-breakpoint-runtime-defect`** | **3** | **0** (행 자체가 사라짐) |
| `geometry-mismatch` | 412 | 412 |
| `layout-cascade` | 33 | 33 |
| `style-mismatch` | 387 | 387 |
| `unknown-behavior-gap` | 5 | 5 |
| `environment-unstable` | 17 | 17 |
| `canvas-background-mismatch` | 2 | 2 |
| `source-content-drift` | 1,186 | 1,096 |
| `source-style-drift` | 9 | 11 |
| `source-structural-drift` | 1 | 5 |
| `asset-load-failure` | 47 | 139 |

clone 쪽 수치는 전부 동일하고, 움직인 네 줄은 전부 `source-*` 와 asset — 하루
사이 live stripe.com이 달라진 것이다(§22의 `asset-load-failure` 증가는 lazy image
로딩 타이밍 편차이며 클론의 변화가 아니다).

### §22 breakpoint 재검사

`inferred-breakpoint-runtime-defect` **3 → 0**. 이 세 건은 914/915/916px에서
clone-only probe가 desktop/mobile 어느 variant도 보이지 않는다고 기록한 것이고,
hydration이 tree를 client에서 재생성하는 동안 측정된 결과였다. 재생성이 사라지자
같이 사라졌다. 별도 수정은 하지 않았다.

## 14. run B 결과 — 두 수정 모두, 재관측 포함

### item 20 — Stripe targeted validation

| 측정 | before (Task 16) | run B |
| --- | --- | --- |
| routes rendered | 19/19 | **19/19** |
| page/viewport pair 완료 | 37 / 38 | 37 / 38 |
| **clone JS runtime error** | **30** | **0** |
| **hydration error page** | **15 / 19** | **0 / 19** |
| console React hydration warning | 30 | **0** |

38쌍 중 1쌍(`p000015/desktop`)이 완료되지 않은 것은 **before에서도 동일**하다 —
live stripe.com이 그 페이지에서 구조적으로 drift해 QA가 `source-drift`로 표시한
것이고, 클론의 문제가 아니다.

### item 21 — verified interaction 재QA

| verdict | before | run B |
| --- | --- | --- |
| equivalent | 13 | **28** |
| mismatch | 0 | **0** |
| source-drifted | 0 | 0 |
| **unverifiable** | **15** | **0** |
| 합계 | 28 | 28 |

`28/28 equivalent`를 미리 기대하지 않았고, 실제로 나온 값이 그것이다. mismatch가
0인 것도 측정 결과이지 목표가 아니었다.

### item 23 — static fidelity 회귀 검사

| 측정 | before | run B |
| --- | --- | --- |
| content exact ratio | 1.0 | **1.0** |
| content mismatched nodes | 0 | **0** |
| compared nodes | 74,178 | 74,184 |
| missing / duplicate nodes | 0 / 0 | 0 / 0 |
| geometry median-of-medians | 0.00px | **0.00px** |
| geometry median-of-p95 | 0.99px | **0.99px** |
| geometry max delta | 359px | 359px |
| style compared / mismatched | 4,109,400 / **481** | 4,110,264 / **481** |
| visual changed-ratio median | 0.0890 | **0.0883** |
| visual mean-delta median | 9.2247 | **9.1689** |
| document height delta median | 0.21 | 0.21 |
| asset occurrence lost | 0 | **0** |
| image nodes / asset-bound | 1,678 / 1,678 | 1,678 / 1,678 |
| scroll nodes / restored / mismatched | 35 / 1 / 0 | 35 / 1 / 0 |
| unstable page/viewport | 17 | 17 |
| live content exact ratio | 1.0 | 1.0 |

compared node가 6개, style property가 864개 늘어난 것은 **재관측** 때문이다
(하루 사이 페이지가 조금 달라졌다). visual은 근소하게 좋아졌다. **퇴행한 항목은
하나도 없다.**

`unstable 17`은 세 실행 모두 동일한 17쌍이며(대부분 mobile viewport), 이번
correction과 무관한 기존 측정 특성이다. before의 `final-summary`가 이 값을 0으로
보고하는 것은 correction iteration이 일부 페이지만 다시 측정하기 때문이고, 세
실행의 `baseline-summary`는 모두 17이다. 위 표는 전부 `baseline-summary` 기준 —
38쌍 전체를 같은 방식으로 잰 값이다.

### diff classification — before vs run B

| classification | before | run B |
| --- | --- | --- |
| **`runtime-error`** | **30** | **0** |
| **`inferred-breakpoint-runtime-defect`** | **3** | **0** |
| `geometry-mismatch` | 412 | 412 |
| `style-mismatch` | 387 | 387 |
| `layout-cascade` | 33 | 33 |
| `source-content-drift` | 1,186 | 1,186 |
| `asset-load-failure` | 47 | 47 |
| `environment-unstable` | 17 | 17 |
| `unknown-behavior-gap` | 5 | 5 |
| `source-style-drift` | 9 | 9 |
| `canvas-background-mismatch` | 2 | 2 |
| `source-structural-drift` | 1 | 1 |

**정확히 두 줄만 움직였고, 나머지 열 줄은 하나도 다르지 않다.**

## 15. dev 재현 matrix (item 4) — fix 전/후

같은 4개 route를 `next dev`에서 두 번 열었다. 왼쪽은 correction 이전 app,
오른쪽은 이번 correction의 app이다. `nest`는 살아 있는 DOM에서 `li` 안에 직접 든
`li`의 수다.

| kind | route | 이전 nest / err | 이후 nest / err |
| --- | --- | --- | --- |
| affected | `/ae/customers/dust` | 2 / 1 | **0 / 0** |
| affected | `/blog/introducing-stripes-new-api-release-process` | 2 / 1 | **0 / 0** |
| clean | `/legal/becs` | 0 / 0 | 0 / 0 |
| clean | `/en-ca/radar` | 0 / 1 | 0 / 1 |

두 affected route 모두 React가 `In HTML, <li> cannot be a descendant of <li>.`를
말했고, 수정 후에는 아무 말도 하지 않는다.

`/en-ca/radar`의 1건은 **다른 것**이고 정직하게 남긴다. 메시지가 다르다:

```
A tree hydrated but some attributes of the server rendered HTML didn't match
the client properties. This won't be patched up.
```

이것은 **attribute** 불일치이고, React 19는 이를 production에서 던지지 않는다
(dev 전용 진단). 그래서 이 페이지는 before/run A/run B 세 실행 모두에서
production runtime error **0**이었고, 지금도 0이다. correction 전후로 **동일하게
존재**하므로 이번 수정이 만든 것도 고친 것도 아니다. `#418`과는 다른 결함
class이며, 이 correction의 범위 밖으로 두고 이름만 붙인다 —
**p000008 mobile variant의 미상 attribute 불일치 (dev 전용, production 무증상)**.

## 16. Required Gates (item 24)

| gate | 요구 | run B |
| --- | --- | --- |
| routes | 19/19 | **19/19** |
| content mismatch | 0 | **0** |
| asset occurrence loss | 0 | **0** |
| scroll mismatch | 0 | **0** |
| unknown auto-promotion | 0 | **0** |
| form/backend write | 0 | **0** |
| unsafe source JS/CSS | 0 | **0** |
| hydration | 0 목표 | **0** |

## 17. 이전 보고서의 귀속이 틀렸던 점 (item 21)

Task 16 보고서는 "hydration error가 15 unverifiable을 완전히 설명한다(상관관계
완벽)"고 적었다. **그 귀속은 틀렸다.** hydration을 0으로 만든 run A에서
unverifiable은 그대로 15였다.

상관관계가 완벽했던 이유는 두 결함이 **같은 15개 페이지의 같은 header**에 있었기
때문이다 — 중첩 `li`도, `z-index`를 잃은 `::after`도 그 header에 있다. 원인이
같아서가 아니라 위치가 같아서 함께 움직였다.

이 correction은 그것을 재측정으로 갈라냈다:

| | hydration error | behavior unverifiable |
| --- | --- | --- |
| before | 30 | 15 |
| run A (nesting fix만) | **0** | 15 |
| run B (+ pseudo z-index) | **0** | **0** |

## 18. Historical Artifact Immutability (item 26)

Task 06~15 artifact — `data/{domainchecker.co.kr,seoworld.co.kr,nextjs.org,developer.mozilla.org}`
전체 **3,863 파일** — 수정 **0건**.

```
이 correction 시작 이후 mtime이 바뀐 파일: 0
가장 최근 mtime: 2026-08-14 (이 작업 시작 전)
내용 tree hash (경로 정렬 후 sha256 of sha256s):
  70cf377d7200b617e7e4a7c2eb96c638de12fe1fbdb896aa5699e148303dcf0f
```

Task 16의 fresh artifact(`2026-08-14T12-*`)도 baseline 증거로 보존했다. run A와
run B는 전부 **새 run 디렉터리**다. 진단 중 한 번 생성 stylesheet에 `z-index:-1`을
손으로 넣어 가설을 확인했고, 즉시 되돌린 뒤 sha256이 원본과 같음을 확인했다
(`c5b79230e57b8664ee17d630cc6783bc877b03cbb0194081b50d69e22039b36f`).

## 19. FinalStatus (item 27)

Task 16은 19개 route 전부가 hydration error를 던지는 동안 스스로를
`complete-with-known-limitations`라고 보고했다. 그럴 수 있었던 이유는
`classifyFinalStatus()`가 **diff classification만** 읽었기 때문이다 — 예외는
diff가 아니다.

그래서 이번에 status 규칙 하나를 추가했다.

```
clone JS runtime error > 0  →  partial
```

이유를 코드에 적었다: **클론이 던지는 예외는 이 pipeline의 결함이지, public
observation이 닿을 수 없는 경계가 아니다.** 그러므로 known limitation으로 접수될
수 없다. `E2eCoverage`에 `cloneRuntimeErrors`가 추가되고 QA 요약에서 채워진다.
`smoke:e2e`에 두 개의 check가 붙었다.

이 규칙을 이전 실행에 적용하면 Task 16의 fresh run은 `complete-with-known-limitations`가
아니라 **`partial`**이었어야 한다. 이번 run B는 clone runtime error 0이므로 그
규칙에 걸리지 않고, 남은 것은 관측 경계뿐이다:

- remote asset materialization 미지원 (`asset-load-failure` 47)
- unknown semantics (`unknown-behavior-gap` 5)
- iframe 80개 / open shadow host 6개 inventory-only
- live source drift (`source-content-drift` 1,186 등)
- fresh site에서 발생하지 않은 optional escalation path (family-represented route 0)

→ **`complete-with-known-limitations`**, 그리고 그 목록에 **generic reconstruction
runtime hydration defect는 없다**.

## 20. 바뀐 파일

| 파일 | 무엇 |
| --- | --- |
| `src/reconstruction/nesting.ts` | **신규** — parser 재작성 detector + 표준 container 삽입, 표현 불가능한 edge는 거부 |
| `src/reconstruction/compile-runtime-page.ts` | 각 viewport tree에 적응 pass 적용, counter/limitation 기록 |
| `src/reconstruction/compile-node.ts` | `nestingAdaptations` counter |
| `src/reconstruction/app-template.ts` | `.wr-nest { display: contents; … }` |
| `src/reconstruction/validate-output.ts` | 디스크에서 다시 읽어 parser-unstable edge 0 검증 |
| `src/reconstruction/types.ts` | manifest counter + `parser-invalid-nesting-adapted` limitation |
| `src/reconstruction/generate-app.ts`, `index.ts` | 배선 |
| `src/observer/types.ts` | `PSEUDO_STYLE_WHITELIST` += `z-index`, `pointer-events` |
| `src/e2e/types.ts`, `run-e2e.ts`, `summarize.ts` | `cloneRuntimeErrors` → finalStatus |
| `scripts/smoke-reconstruction.ts` | 재현 fixture + negative fixture + 15개 check (178 → **197**) |
| `scripts/smoke-e2e.ts` | clone-throws status check 2개 (104 → **106**) |
| `README.md`, `ROADMAP.md` | correction 절 |

schema version은 하나도 올리지 않았다. `nestingAdaptations`는 optional manifest
필드이고, pseudo whitelist 추가는 style table에 key가 늘어나는 것일 뿐 shape 변화가
아니다. 기존 SiteSpec은 그대로 읽힌다.

## 21. 남은 한계

- **표현 불가능한 nesting은 거부한다.** `<p>` 안의 `<div>`처럼 HTML이 layout
  중립적으로 표현할 방법이 없는 edge를 만나면 generator가 `reconstruction-failure`로
  멈춘다(닫힌 failure 이름 그대로, 새 이름 없음). 다섯 사이트 209,559 element을
  훑어 **거부 0건**(적응 30건, 전부 stripe)이지만, script가 그런 DOM을 만드는
  사이트에서는 실행이 실패한다.
  hydration이 깨진 앱을 조용히 내보내는 것보다 낫다고 판단했고, 이것은 판단이지
  측정이 아니다.
- **`rendered.html` 정렬 실패는 그대로다.** §5의 30건. 직렬화 불가능한 DOM에
  대해 `rendered.html`이 손실 채널인 것은 사실이고 fallback은 정확한 동작이다.
- **p000008의 dev 전용 attribute 불일치** (§15). production 무증상.
- **pseudo-element whitelist는 여전히 부분집합이다.** `opacity`, `visibility`
  등은 넣지 않았다 — 측정이 요구하지 않았다.

## 22. 완료 기준 (item 30)

| 조건 | 결과 |
| --- | --- |
| 정확한 hydration root cause identified | ✅ `li > li`, React dev 진단으로 확인 |
| generic fixture reproduces | ✅ 4-node 합성 fixture, 실제 parser로 양방향 증명 |
| generic fix implemented | ✅ `nesting.ts`, site 조건 0 |
| `suppressHydrationWarning` 사용 | **0** |
| client-only escape | **0** |
| Stripe hydration errors | **0** (30 → 0) |
| new runtime errors | **0** |
| 19/19 routes render | ✅ |
| 28 verified interactions re-QA | ✅ 28 equivalent / 0 mismatch / **0 unverifiable** |
| clone click-error due hydration | **0** (원인은 hydration이 아니라 pseudo z-index였음 — §17) |
| content mismatch | **0** (exact ratio 1.0) |
| asset occurrence loss | **0** |
| unknown promotion | **0** |
| form write | **0** |
| all smoke PASS | ✅ §23 |
| final report updated | 이 문서 |
| Git add / commit / push | **하지 않음** |

## 23. 기존 corpus regression (item 25)

```
=== typecheck ===            PASS
verifier                 81/81 checks passed
selector                 81/81 checks passed
multi-observer           58/58 checks passed
interaction-detector     92/92 checks passed
interaction-explorer     95/95 checks passed
interaction-patterns     88/88 checks passed
sitespec                 252/252 checks passed
reconstruction           197/197 checks passed        (178 → 197, +19 new)
reconstruction-qa        134/134 checks passed
e2e                      106/106 checks passed        (104 → 106, +2 new)
```

전부 PASS. `smoke:reconstruction`의 브라우저 구간은 **console.error / warning /
pageerror across every page visited: 0** 을 계속 단언하고 있고, 이번에 fixture가
두 개 늘어난 뒤에도 그대로다 (item 25의 "특히 pageerror 0 유지").
