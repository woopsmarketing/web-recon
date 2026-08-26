# Task 14 — Next.js Reconstruction Engine

```
Task:     14
Title:    Next.js Reconstruction Engine
Previous: 13.1-reconstruction-critical-attribute-recovery-2026-08-14.md
Status:   Complete
```

---

## 작업 목표

SiteSpec 하나만 읽어서 **실제로 실행되는 Next.js / React / TypeScript 웹사이트**를 만든다.

이 Task는 픽셀 퍼펙트를 만드는 Task가 아니다. Task 15가 원본과 clone을 비교할 수 있는
**stable baseline**을 만드는 Task다. 그래서 성공 기준은 "예뻐 보인다"가 아니라 전부
검증 가능한 명제다:

```
SiteSpec만으로 clone이 생성된다
생성된 앱이 build / run 된다
verified route 전체가 렌더된다
content / style / asset이 실제 DOM에 적용된다
verified interaction이 실제로 동작한다
unknown behavior를 날조하지 않는다
```

새 관측 0. 원본 사이트 재방문 0. Firecrawl 0. AI 0. asset download 0.

---

## Pipeline Position

```
URL
→ Discovery → Verification → Family/Representative Selection
→ Responsive Deep Observation
→ Interaction Candidate Detection → Safe Interaction Exploration
→ Interaction Pattern Modeling
→ SiteSpec Compiler → Attribute Recovery Hardening
→ [이번 Task] Next.js Reconstruction Engine
→ Task 15 Reconstruction QA / Auto-fix
```

---

## Reconstruction Architecture

논리 layer를 코드에서도 분리했다. 각 파일이 하나의 질문만 답한다.

```
src/reconstruction/
  load-input.ts              SiteSpec 입력의 유일한 문 + 버전 검사
  route-plan.ts              verified URL → clone route (pathname + query key)
  responsive-plan.ts         breakpoint 추론 (관측 endpoint 중점)
  react-attributes.ts        HTML semantics → React-safe props
  relations.ts               generated DOM id + IDREF rewrite
  compile-node.ts            SpecNode → runtime node (generic renderer)
  compile-runtime-page.ts    PageSpec → compact runtime derivative
  style-generator.ts         style catalog → exact computed-style CSS
  pseudo-generator.ts        ::before / ::after (page + viewport scope)
  asset-resolver.ts          assetRefs → src / srcSet / sanitized inline SVG
  link-rewriter.ts           same-origin verified URL → clone route
  interaction-bindings.ts    confirmed pattern → data-wr-* runtime binding
  plan-reconstruction.ts     위 전부를 하나의 결정적 plan으로
  app-template.ts            생성될 Next.js shell
  runtime-template.ts        생성될 app의 runtime 코드
  generate-app.ts            plan을 파일로 (여기서는 아무것도 결정하지 않는다)
  validate-output.ts         디스크에서 다시 읽어 주장 검증
  store.ts / types.ts / index.ts
src/cli-reconstruct.ts       pnpm reconstruct
scripts/smoke-reconstruction.ts
```

`plan-reconstruction.ts`가 **모든 것을 먼저 결정**하고 `generate-app.ts`는 그것을
기계적으로 쓴다. 이 분리 때문에 `--plan-only`가 디버그 플래그가 아니라 실제 모드가 되고,
byte-identical 출력이 "바라는 것"이 아니라 "구조적으로 보장되는 것"이 된다.

---

## SiteSpec-only Input Contract

```
pnpm reconstruct data/<host>/site-specs/<run-id>/site-spec.json
```

입력은 `loadSiteSpec()` 하나다. Task 09 `dom.json`, Task 11 action artifact,
Task 12 pattern/unknown 파일은 **한 번도 열리지 않는다.** `siteSpec.source.*`는 audit
문자열일 뿐이고 generator는 따라가지 않는다.

이 주장을 두 가지로 증명한다.

1. **구조적으로**: `src/reconstruction/`의 import graph 전체를 자동 검사한다.
   외부 의존성은 `parse5`, `zod` 둘뿐이고, playwright / firecrawl / http / AI provider는
   graph에 존재하지 않는다 (smoke §190).
2. **실측으로**: fixture가 Task 06–12 트리를 **전부 삭제한 뒤** 생성한다 (smoke §122).

```
SCHEMA_VERSION   2   (지원)
SITESPEC_VERSION 1   (지원)
COMPILER_VERSION 2   (기록)
```

버전은 **두 개를 따로** 본다. `siteSpecVersion`은 필드의 *의미*, `schemaVersion`은 필드의
*위치*다. contract만 보고 아무 shape이나 읽는 generator는 필드가 이동한 SiteSpec을
조용히 잘못 읽는다. 둘 중 하나라도 지원 목록 밖이면 fail-fast한다.

---

## Generated App Runtime Contract

Generator 입력과 생성된 앱의 런타임 입력은 **별개의 계약**이다.

```
Generator 입력       SiteSpec directory only
Generated App 입력   자기 자신의 디렉터리 only
```

fixture는 SiteSpec을 **삭제한 뒤** `next build` → `next start` → Chromium까지 통과시킨다
(smoke §203). 생성된 앱이 SiteSpec을 몰래 fs dependency로 쓰면 여기서 죽는다.

---

## Input / Output

```
data/<host>/reconstructions/<run-id>/
  reconstruction-manifest.json
  app/
    package.json            exact resolved versions ("latest" 금지)
    next.config.mjs
    tsconfig.json
    app/
      layout.tsx            Next가 소유하는 <html>/<body>
      [[...slug]]/page.tsx  사이트 전체를 처리하는 단 하나의 route
      not-found.tsx
      globals.css           clone 자체의 작은 CSS (viewport 전환 등)
    src/
      runtime/              load-route · load-page · NodeRenderer · PageRenderer
                            InteractionRuntime · FormSafetyRuntime · route-key
      generated/            generated-config.ts
    reconstruction-data/    route-map.json + pages/p000001.json …  (server-only)
    public/wr/generated-styles.css
```

SiteSpec 디렉터리와 Task 06–13.1 artifact는 **수정 0**이다. 출력은 별도 namespace다.

`.next/`와 `node_modules/`는 generated source artifact로 취급하지 않는다.

---

## Reconstruction Plan

`ReconstructionPlan`은 routes, breakpoint, runtime page tree, CSS, asset binding,
interaction binding, 그리고 manifest에 들어갈 모든 수치를 파일 쓰기 전에 확정한다.
`--plan-only`로 아무것도 쓰지 않고 볼 수 있다.

---

## Route Compiler

`[[...slug]]` catch-all 하나가 사이트 전체를 처리한다. 112개 route를 위해 112개
`page.tsx`를 만들지 않는다 — route table은 데이터고 renderer는 컴포넌트 하나다.

```
SiteSpec routes  ==  generated route-map  (112 / 112)
중복 0 · 누락 0
```

route key 충돌은 **merge가 아니라 fail-fast**다. 두 verified URL이 같은 key로 접히면
verified URL 하나가 조용히 사라지는 것이므로 생성 자체를 중단한다.

route table 밖의 path는 `notFound()`다. 임의의 대표 페이지로 fallback하지 않는다 —
모든 URL에 무언가를 돌려주는 clone은 Task 15의 route coverage를 무의미하게 만든다.

---

## Query Route Resolution

RouteSpec identity는 URL이므로 lookup key는 pathname만으로는 부족하다.

```
key = normalized pathname + normalized query
```

- pathname: 세그먼트를 **percent-decode**하고 trailing slash 제거.
  Next.js가 route segment를 이미 decode해서 넘겨주기 때문에 양쪽이 대칭이 된다.
  runtime 쪽에서 re-encode하는 방식은 `encodeURIComponent`가 실제 URL에는 보통 그대로
  들어가는 `(`, `'`, `!`를 이스케이프해서 어긋난다.
- query: `(name, value)` 쌍을 정렬해 재구성. `?a=1&b=2`와 `?b=2&a=1`은 같은 페이지다.

실데이터에는 query variant route가 **0건**이라 fixture가 이 경로를 담당한다:
`/search?q=a`와 `/search?q=b`가 각각 자기 내용을 렌더하고, key가 순서 독립임을
직접 검사한다 (smoke §120, §132).

generator와 생성된 앱은 이 함수를 **각각 한 벌씩** 갖는다 (앱은 repo를 import할 수
없다). 어긋나면 verified route가 도달 불가능해지므로, fixture가 양쪽을 같은 query
route로 동시에 구동한다.

---

## Family-represented Routes

RouteSpec의 `pageId` / `renderSourcePageId` 정책을 그대로 따른다. **family를 다시
계산하지 않는다.**

```
exact observed        자기 PageSpec
validation observed   자기 PageSpec
family represented    family representative PageSpec
```

그리고 그 사실이 DOM에 남는다:

```html
data-wr-render-coverage="family-represented"
data-wr-behavior-coverage="family-represented-unverified"
data-wr-verified-on-this-route="false"
```

대표 페이지의 pattern 구현이 재사용되어도 `verifiedOnThisRoute`는 `false`다.
**implementation reuse ≠ evidence promotion.** `validateGeneratedApp()`이 이것을
불변식으로 강제한다: family-represented인데 `observedOnThisExactUrl`이 true거나,
`exact-verified`가 아닌데 `verifiedOnThisRoute`가 true면 생성 실패다.

---

## Responsive Strategy

Task 13은 desktop / mobile 두 트리를 **매칭하지 않는다**고 명시한다
(`cross-viewport-node-matching-not-performed`). 여기서 억지로 merge하면 파이프라인이
거부한 대응관계를 발명하는 것이므로, 두 트리를 그대로 렌더하고 CSS로 전환한다.

```html
<div class="wr-variant" data-wr-viewport="desktop" data-wr-page="p000001">…</div>
<div class="wr-variant" data-wr-viewport="mobile"  data-wr-page="p000001">…</div>
```

```css
.wr-variant { display: contents }
@media (max-width: 914.98px) { [data-wr-viewport="desktop"] { display: none } }
@media (min-width: 915px)    { [data-wr-viewport="mobile"]  { display: none } }
```

active variant가 `display: contents`이므로 wrapper는 box를 만들지 않는다 — 이 반응형
장치가 자기가 보여주는 레이아웃에 아무것도 더하지 않는다. inactive는 `display: none`이라
레이아웃되지도, 클릭되지도 않는다.

실측 (샘플 페이지, desktop 1440):

| site | total DOM | visible variant | hidden variant |
|---|---:|---:|---:|
| domainchecker `/` | 1,909 | 944 | 944 |
| seoworld `/` | 1,106 | 542 | 542 |
| nextjs `/` | 4,385 | 2,176 | 2,176 |
| MDN Glossary/Safe/HTTP | 3,631 | 1,805 | 1,805 |

DOM이 약 2배가 되는 것은 이 baseline이 지불하기로 한 비용이다. Task 15에서 성능이
문제가 되면 server/client viewport selection으로 개선한다.

---

## Inferred Breakpoint

Task 13은 관측한 두 endpoint만 갖고 `inferredBreakpoints`를 **일부러 비워둔다**.
breakpoint 추론은 이 Task의 소유다.

```
mobile 390 · desktop 1440 → midpoint 915
```

사이트별 magic number 없음. 4개 사이트 모두 같은 규칙, 같은 결과다.

convention은 하나로 정해 문서화했다:

```
mobile : width <  breakpoint
desktop: width >= breakpoint
```

mobile media query가 `breakpoint - 1px`이 아니라 `breakpoint - 0.02px`인 이유는
fractional DPR에서 viewport 폭이 소수가 되기 때문이다 — 1px 간격이면 914.5px에서
두 variant가 모두 사라진다.

manifest 기록:

```json
{ "value": 915, "provenance": "inferred", "method": "observed-endpoint-midpoint",
  "mobileObservedWidth": 390, "desktopObservedWidth": 1440,
  "convention": "mobile: width < breakpoint; desktop: width >= breakpoint" }
```

`--breakpoint N`은 `provenance: "operator-override"`로 기록된다. **어느 쪽도
`observed`가 아니다.**

---

## React Attribute Adapter

SiteSpec은 HTML/browser IR이고 React props IR이 아니다. 그 변환을 한 layer
(`react-attributes.ts`)에 모았다. 흩어진 특수 케이스가 아니라 닫힌 매핑 테이블이다.

| HTML | React | 비고 |
|---|---|---|
| `for` | `htmlFor` | |
| `readonly` | `readOnly` | boolean presence |
| `colspan` / `rowspan` | `colSpan` / `rowSpan` | **number** |
| `contenteditable` | `contentEditable` | 값 원형 보존 |
| `autofocus` | `autoFocus` | boolean |
| `maxlength` / `minlength` | `maxLength` / `minLength` | number |
| `tabindex` | `tabIndex` | number |
| `datetime` | `dateTime` | |
| `spellcheck` / `autocomplete` | `spellCheck` / `autoComplete` | 값 원형 보존 |
| `popovertarget(action)` | `popoverTarget(Action)` | |
| `aria-*` / `role` | 그대로 | lowercase |

`role`은 `ElementSpecNode.role`과 `attributes.role` 양쪽에 있지만 **한 번만** 출력한다
(attributes 쪽만 읽는다).

boolean attribute는 `disabled` / `disabled=""` / `disabled="disabled"` 세 표기 모두
React `true`가 된다. boolean 목록은 SiteSpec의 `SUPPLEMENTAL_ATTRIBUTES` 중
`kind: "boolean"`인 항목에서 **파생**시켰다 — 손으로 다시 적으면 IR과 조용히 어긋난다.

### `hidden="until-found"`

React DOM은 `hidden`을 boolean으로 취급하고, 서버 렌더러는 truthy면 무조건 `hidden=""`을
낸다. 실측으로 확인했다 (`renderToStaticMarkup`).

item 43은 `until-found → true` 접기를 금지한다. 그래서 접지 않고, generator가 정확한 값을
`data-wr-hidden`에 싣고 client runtime이 mount 시 실제 attribute를 복원한다.
결과 DOM은 `hidden="until-found"`다 (smoke §127에서 Chromium으로 확인).

이건 **source semantics 변경이 아니라 React renderer adaptation**이다. 요소는 어느 쪽이든
숨겨져 있으므로 깜빡임도 없다.

---

## Declarative State Mapping

Task 13.1이 복구한 344개 declarative attribute가 생성된 DOM에 그대로 있다.
**source node 기준**으로 셌다 (route 재사용으로 부풀리지 않기 위해):

| attribute | Task 13.1 | 생성된 runtime tree | 표현 |
|---|---:|---:|---|
| `selected` | 72 | **72** | 부모 `<select defaultValue>` |
| `open` | 62 | **62** | `open` |
| `hidden` | 54 | **54** | `hidden` (+ `data-wr-hidden` when enumerated) |
| `datetime` | 36 | **36** | `dateTime` |
| `scope` | 34 | **34** | `scope` |
| `required` | 30 | **30** | `required` |
| `autocomplete` | 20 | **20** | `autoComplete` |
| `spellcheck` | 20 | **20** | `spellCheck` |
| `disabled` | 12 | **12** | `disabled` |
| `min` | 2 | **2** | `min` |
| `start` | 2 | **2** | `start` |
| **합계** | **344** | **344** | |

`colspan` / `rowspan` / `readonly` / `checked` / `multiple` / `contenteditable` /
popover는 실데이터 0건이라 생성 결과도 0이다. 전부 fixture가 담당한다.

---

## Selected / Checked / Textarea Semantics

| source | 생성 | 이유 |
|---|---|---|
| `<option selected>` | 부모 `<select defaultValue="…">`, option의 `selected` 제거 | React는 select의 선택을 **부모**로 소유한다. option에 `selected`를 주면 경고 + React와 싸우는 select가 된다 |
| `<select multiple>` + 여러 `selected` | `defaultValue={["X","Z"]}` | |
| `<input checked>` | `defaultChecked` | controlled `checked` + onChange 없음 = 경고 + read-only |
| `<input value>` | `defaultValue` (**모든 input type**) | React가 `value` attribute로 다시 내보내므로 submit 버튼도 label과 attribute semantics를 유지한다 |
| `<textarea>text</textarea>` | `defaultValue`, children 미출력 | 둘 다 내면 React 경고 + 값 이중화 |

`selected` option에 `value`가 있으면 그 값, 없으면 HTML semantics대로 option text를
strip/collapse해서 쓴다. `selected`가 하나도 없으면 **아무것도 쓰지 않는다** — 브라우저
기본값이 원본과 같고, `defaultValue = 첫 option`은 첫 option이 disabled인 순간 틀린다.

실측: nextjs 64개 select 전부 `TypeScript`, seoworld 8개 중 sample이 `kr`.
React controlled/uncontrolled 경고 **0건**.

---

## DOM ID Generation

SiteSpec의 `sourceHtmlId`를 그대로 DOM identity로 쓰지 않는다. 코퍼스에는
`_R_14naotbsnuiubaaivb_`, `radix-_R_2miubaaivb_` 같은 렌더마다 재생성되는 id가 널려 있다.

```
wr-<pageId>-<viewportId>-<nodeId>      예: wr-p000003-desktop-n000809
wr-dyn-<pageId>-<viewportId>-<patternId>   (동적 target)
```

부여 대상은 **가리켜질 수 있는 노드만**: `sourceHtmlId`가 있던 노드, resolved relation의
target, interaction trigger / target. 148,373개 전부에 붙이면 큰 페이지마다 수백 KB의
DOM이 아무 독자 없이 늘어난다.

실측: 103 / 45 / 723 / 572개. 모든 element에는 대신 `data-wr-node`가 붙는데, 이건
pseudo CSS selector와 Task 15의 앵커로 실제로 쓰인다.

`sourceHtmlId`는 relation resolution provenance로 남고 generated DOM identity는 새 id다.
둘을 혼동하지 않는다.

---

## IDREF Relation Rewriting

SiteSpec relation을 사용해 `aria-controls` / `aria-labelledby` / `aria-describedby` /
`aria-owns` / `for` / `#fragment` / `popovertarget`을 **생성된 id로** 교체한다.

- multi-token(`aria-labelledby="a b c"`)은 **원래 token 순서 유지**.
- resolved token → generated id, unresolved token → **원본 token 유지**.
  조용히 지우지 않는다 — 사라진 `aria-labelledby`는 "이 요소엔 접근 가능한 이름이 없다"로
  읽히지, "이 참조는 원본에서 이미 깨져 있었다"로 읽히지 않는다.

실측: rewritten 2,286 / unresolved 120 (전부 nextjs). unresolved 120은 원본이 이미
깨뜨린 참조이고, 그 사실이 보존된다.

---

## Node Renderer

`React.createElement(tagName, props, children)` 하나다. 사이트/프레임워크별 컴포넌트
매핑 없음. `<mdn-dropdown>`, `<next-route-announcer>`, `<interactive-example>` 같은
custom element도 그대로 나간다.

- 원래 tagName 유지 (`section` `article` `nav` `button` `details` `summary` `table`
  `select` `option` …). div로 평탄화하지 않는다.
- childNodeIds 순서 그대로. text/element 혼합 순서는 Task 13이 alignment로 복구한
  사실이므로 여기서 다시 유도하지 않는다.
- text node는 **raw 값 그대로**. trim / normalize / collapse 없음.
- void element(14종)에 children이 오면 렌더가 아니라 **fail-fast**. 실측 위반 0건.
- `script` `style` `noscript` `template` `head` `title` `meta` `link` `base`는
  subtree째 렌더하지 않는다. 실측 0건이지만 "원본 JS는 재구성되지 않는다"를 데이터의
  성질이 아니라 **코드의 성질**로 만들기 위한 벽이다.

성능: 노드당 컴포넌트가 아니라 재귀 함수다. 이 코퍼스의 큰 페이지는 한 트리에 14,000
노드이고, 각각에 컴포넌트 경계를 두면 얻는 게 없이 reconciler 엔트리만 늘어난다.

---

## Document Root Adaptation

SiteSpec 트리의 루트는 `<html>`이고 그 아래 `<body>`가 있다 (실측 104/104 viewport 전부).
Next.js 페이지는 프레임워크가 소유한 `<html><body>` **안에서** 렌더되므로 다시 중첩할 수
없다.

두 노드를 virtual document root로 보고 `div`로 렌더한다. 관측된 computed style은
적용하되 **document-box geometry만 뺀다**:

```
width · height · min-width · min-height · max-width · max-height
```

`<html>`의 computed `width: 1440px; height: 8938.5px`는 브라우저가 initial containing
block과 문서 높이를 **보고한 값**이지 저자가 쓴 스타일이 아니다. 중첩된 `div`에 그대로
박으면 clone이 고정 크기 캔버스가 된다 — item 68이 boundingBox에 대해 금지하는 것과
같은 실수다.

구현은 같은 token에서 파생된 별도 클래스다 (`.wr-doc-st000617`). 그 외 속성
(background, color, font, margin, padding, overflow, box-sizing …)은 전부 그대로다.

manifest limitation: `document-root-adapted-for-nextjs`.

프레임워크 `<html>`/`<body>`에는 `margin: 0; padding: 0`만 준다. 이건 global reset이
아니다 (item 116) — **관측된 노드가 아닌** Next.js 자신의 요소를 중립화하는 것이고,
안 하면 UA 기본 8px body margin이 원본에 없던 offset이 된다.

---

## Style Generator

```
styleTokenId st000123  →  .wr-st000123 { …관측된 computed 값 전부… }
element                →  className="wr-st000123"
```

Tailwind 없음. semantic token 없음. `#111827`을 `--primary-color`라고 이름 붙이지 않는다.
similarity threshold 없음. **fidelity > CSS abstraction.**

안전장치 두 개 (값은 untrusted public page content다):

1. property 이름은 Observer의 `STYLE_WHITELIST` + `PSEUDO_STYLE_WHITELIST`에 있는 것만
   쓴다. 임의 site data에서 CSS property를 만들지 않는다.
2. 값에 `;` `{` `}` 개행 `</style`이 있거나 따옴표가 홀수면 거부하고 센다.
   실측 거부 0건이지만, 하나만 통과해도 페이지 콘텐츠가 CSS를 쓸 수 있게 된다.

결정성: `styleTokenId` 순서로 rule, property 이름 정렬로 declaration. 같은 SiteSpec이면
CSS가 byte-identical하다.

**generated CSS는 `public/wr/generated-styles.css`로 나가고 번들러를 통과하지 않는다.**
큰 사이트에서 8.6 MB짜리 정확한 computed style이고, 번들러에 넣으면 clone에 필요 없는
minification을 얻는 대신 필요한 빌드 시간과 메모리를 잃는다. layout이 React 19의
stylesheet hoisting으로 `<link precedence>`를 낸다.

---

## Pseudo Elements

pseudo-element는 자기 노드가 없으므로 **소유자**를 통해 지정한다.

```css
[data-wr-page="p000001"][data-wr-viewport="desktop"] [data-wr-node="n000123"]::before { … }
```

node id는 viewport-local **이면서 page-local**이다 — id는 viewport마다 1부터 다시
매겨지므로, viewport로만 scope하면 두 번째 페이지가 첫 페이지의 규칙을 덮어쓴다.
그래서 page + viewport 양쪽으로 scope한다.

`content` 값만 별도의 완화된 검사를 쓴다. 일반 값 검사는 공백을 거부하는데
`content: "Read more"`는 공백이 정상이고 거부하면 실제 페이지 콘텐츠가 조용히 사라진다.
대신 `content`에 대해 declaration/rule terminator, 개행, `</style`, 홀수 따옴표를 막는다.

실측 pseudo rule: 198 / 258 / 2,308 / 2,050 = **4,814**. 관측된 pseudo만 쓴다.
새 content 추론 0.

---

## Asset Resolver

Task 13이 이미 "어떤 asset이 어떤 element에서 관측됐는지"를 기록해 두었으므로, 그 관계로
join하고 **그 외에는 아무것도 하지 않는다.** URL substring heuristic 없음, 파일명 추론
없음.

`assetMode: "reference"` — 다운로드 0. `next/image` 대신 native `<img>`
(remote domain 설정 · optimizer 동작 · size 추론이 원본 픽셀과 clone 픽셀 사이에
아무도 요청하지 않은 변수를 만든다).

### primary src 선택

kind ordering (`image` > `source` > `video-poster`) → 같은 kind면 descriptor 없는 것이
element 자신의 `src` → 그래도 동률이면 **아무것도 고르지 않고** 센다.
첫 번째를 몰래 고르는 것이 clone이 자신 있게 엉뚱한 사진을 보여주는 방식이다.

### srcSet

Observer는 attribute 값을 500자에서 자른다. Next.js image `srcset`은 이 한도를 자주 넘고,
잘린 마지막 후보는 descriptor가 잘려나가 **descriptor 없는 잘린 URL**이 된다
(domainchecker에서 실제로 확인: `https://domainchecker.co.kr/_nex`).

정책: descriptor 있는 후보만 순서대로 출력. 후보가 정확히 하나이고 descriptor가 없으면
그것은 합법적인 1-후보 srcset이므로 출력. descriptor 있는 것과 없는 것이 **섞이면**
없는 쪽은 잘림 아티팩트이므로 빼고 **센다** (`droppedSrcsetCandidates` 50 / 30 / 0 / 0,
limitation `srcset-candidate-descriptor-missing`).

### 해결 불가

`<img>`인데 쓸 수 있는 asset이 없으면 **src를 지어내지 않는다.** width/height/style은
유지하고 센다. nextjs 332건인데, 원인은 `src`가 `data:` URI라서 Observer가 애초에
저장하지 않은 것이다 (`resolve()`가 http(s)만 통과시킨다).

---

## Inline SVG

Task 13이 parse → sanitize → serialize한 markup만 쓴다. 원본 raw SVG를 provenance 따라
다시 읽지 않는다.

앱에 넣기 전에 **다시** 검사한다: `<script>`, `on*`, `javascript:`, `<foreignObject>`가
있으면 fail-fast. "앞 단계가 약속했다"는 보안 검사가 설 수 있는 근거가 아니다 — SiteSpec은
공유 가능한 artifact이고 두 시점 사이에 편집될 수 있다.

`<svg>` 루트에는 clone 자신의 `class` / `id` / `data-wr-node`를 넣는데, 그 전에 루트의
**source `class` / `style` / `id` / `data-*`를 제거**한다. 코퍼스 145개 inline SVG 중
79개가 source class를, 49개가 source style을 루트에 달고 있어서 그냥 붙이면 HTML 파서가
첫 번째 `class`를 채택해 생성된 클래스가 조용히 사라진다. 내부 subtree는
`svg-subtree-opaque`대로 그대로 둔다. `viewBox` / `fill` / `stroke` / `xmlns` 같은 SVG
geometry는 보존한다.

parse5로 처리한다 (정규식이 아니라). 저장된 markup 자체가 parse5의 직렬화 결과이고
145/145 byte-stable함을 확인했다.

렌더는 `<span class="wr-svg-host">` + `dangerouslySetInnerHTML`이고 host는
`display: contents`라 레이아웃에 box를 만들지 않는다. **`dangerouslySetInnerHTML`는 앱
전체에서 이 한 곳뿐이다** (fixture가 파일 단위로 검사).

---

## Internal Link Rewriting

```
same-origin + verified route  →  clone local path (query · fragment 유지)
same-origin + route table 밖   →  local pathname 유지 → clone not-found
external http(s)               →  원본 href 유지
mailto: / tel:                 →  유지
javascript:                    →  generator reject (Task 13이 제거하므로 도달 불가)
data: / blob:                  →  `#`로 무력화 + 카운트
```

실측:

| site | clone route로 rewrite | route table 밖 | external |
|---|---:|---:|---:|
| domainchecker | 176 | 480 | 10 |
| seoworld | 876 | 300 | 42 |
| nextjs | 646 | 9,496 | 1,250 |
| MDN | 70 | 13,450 | 452 |

"route table 밖"이 큰 것은 예상된 결과다: MDN 문서 페이지는 검증되지 않은 수천 개의
다른 MDN 문서를 가리킨다. 이들은 clone 404가 되고 `unresolvedInternalLinks`로 기록된다.
임의의 대표 페이지로 연결하지 않는다.

---

## Interaction Binding

Task 12/13이 confirm한 pattern만 behavior가 된다. **rules first** 철학 그대로다.

binding은 코드가 아니라 trigger에 붙는 `data-wr-*` 몇 개이고, **generic client runtime
하나**가 그것을 해석한다. 덕분에 client bundle 크기가 사이트 크기와 무관해진다.

```
data-wr-pattern / -pattern-id / -mechanism / -op
data-wr-field / -from / -to
data-wr-target-id / -target-op / -target-css-hidden
data-wr-dyn-id / -dyn-tag / -dyn-role
```

op 어휘는 7개로 닫혀 있다: `native` `state-toggle` `disclosure` `tabs` `menu` `dialog`
`dismiss`. 증거를 만들 수 없는 runtime operation은 구현이 아니라 주장이다.

(patternType × mechanism) → op는 **전사 함수**다. Task 12 taxonomy의 모든 조합이 op를
갖는다. 실측 결과 `unsupportedPatterns` = **0** (98/98).

한 trigger에 여러 PatternInstance가 오면: `patternType` + `mechanism`이 같으면 하나의
가역 binding으로 merge, 다르면 **fail-fast**. 조용히 하나를 고르지 않는다.
실데이터 multi-pattern trigger 0건.

orphan pattern 0: trigger node가 컴파일된 트리에 없으면 생성 실패.
`validateGeneratedApp()`이 디스크에서 다시 읽어 98개 trigger가 전부 존재함을 확인한다.

### 초기 상태 충돌 검사

Task 13.1이 복구한 declarative state와 pattern의 `transition.before`가 어긋나는지
전수 검사한다. 어긋나면 한쪽을 조용히 고르지 않고 센다 + limitation.
실측 **0건** (4개 사이트 98개 pattern 전부).

---

## Disclosure

```
native-details   → 브라우저가 한다. JS 리스너 없음 (이중 토글 금지)
aria-expanded    → trigger의 aria-expanded 토글 + 선언된 target의 visibility
target 없음      → trigger의 aria-expanded만 결정적으로 토글
```

domainchecker의 mobile hamburger가 정확히 마지막 경우다 (declared target 없음).
없는 drawer subtree를 만들지 않는다.

### 열린 상태 스타일은 관측되지 않았다

MDN의 static disclosure target 10건은 `hidden` attribute가 아니라 **CSS로** 숨겨져 있다
(원본이 class를 갈아끼운다). clone은 관측된 *닫힌 상태* computed style을 class로 갖고
있으므로, attribute만 뒤집으면 `display: none`이 그대로 이겨서 아무 일도 일어나지 않는다.

generator가 build time에 이 경우를 판별해 target에 `data-wr-reveal="1"`을 붙이고,
runtime이 `data-wr-revealed`를 세우면 specificity가 더 높은 규칙이 넘겨받는다:

```css
[data-wr-reveal="1"][data-wr-revealed="1"] { display: revert; visibility: visible }
```

`revert`인 이유: **열린 상태의 style은 파이프라인이 관측한 적이 없다.** 정직한 노출은
UA 기본값이지 누가 추측한 `flex`가 아니다. manifest limitation
`interaction-open-state-style-not-observed`.

실측 (MDN mobile, Chromium): `aria-expanded` false→true, target `display: none → block`,
다시 클릭하면 관측된 닫힌 스타일로 복귀.

---

## Tabs

```
click → 클릭된 tab의 aria-selected = 관측된 after
      → 같은 [role=tablist] 안의 다른 [role=tab] = 관측된 before
      → target panel show / 형제 panel hide (target이 구분 가능할 때)
```

tablist는 DOM 구조 사실이지 text/position heuristic이 아니다.

**nextjs 6건은 전부 `aria-controls`가 자기 자신으로 resolve된다.** 사이트가 그 id를
렌더마다 재생성해서 Task 11이 기록한 것은 panel edge가 아니라 id churn이고, Task 12가
그 caveat를 `sourceLimitations`에 그대로 보존해 두었다. self-referential target은 panel을
구동할 수 없으므로 clone은 `aria-selected` 전이만 수행하고 show/hide는 하지 않으며,
`tabs-panel-target-not-distinguishable`로 이유를 남긴다. 원본 source id를 다시 신뢰하지
않는다.

실측 (nextjs, Chromium): 클릭한 tab `false → true`, 형제 3개 전부 `false`.

---

## Menu / Dynamic Targets

nextjs 9건은 `dynamic: true` / `staticNodeResolved: false`다 — initial tree에 target이
없다.

```
before  target DOM 없음
click   observedTag / observedRole만 가진 빈 region mount
        trigger의 aria-expanded 전이
click   unmount
```

**contents invent 0.** 실측: `<div role="listbox">`, childNodes **0**.

trigger의 `aria-controls`는 원본의 렌더별 id가 아니라 **clone의 결정적 dynamic target
id**(`wr-dyn-p000005-desktop-ip000011`)를 가리킨다.

region이 문서의 *어디에* 나타났는지는 기록되지 않았으므로 trigger 바로 뒤에 넣고, 그
위치가 관측이 아니라 renderer의 선택임을 `dynamic-target-placement-not-observed`로
기록한다.

---

## Selection / Toggle

```
native checkbox / radio  → 브라우저 동작 사용 (JS 없음)
custom aria-checked      → false ↔ true
aria-pressed             → false ↔ true
role=switch aria-checked → false ↔ true
```

radio-like grouping 증거가 없으면 주변 control을 임의로 false로 만들지 않는다.

실사이트: nextjs `aria-checked` 28건, seoworld `native-checked` 2건.
`aria-pressed`는 실사이트 0건이라 fixture가 담당한다 (§143 PASS).

---

## Dialog

static target이 있으면 visibility, dynamic이면 observed role/tag만 가진 빈 region.
내용 invent 0.

ESC close와 focus trap은 **Task 11이 관측하지 않았으므로** 추가하지 않는다.

실사이트 0건, fixture가 담당한다. fixture의 dialog target은 일부러 CSS로 숨겨서
reveal override 경로까지 검사한다 (§101 PASS: `none → block → none`).

---

## Dismiss

Task 12의 증거는 "candidate element 자신이 제거됐다"이다. 그래서 trigger 자신을
제거한다. "modal close겠지"라고 추론해서 부모 dialog를 제거하지 않는다.

fixture가 형제 수를 세서 정확히 하나만 사라짐을 확인한다 (§145 PASS).
실사이트: seoworld 3건.

---

## Unknown Interaction Policy

```
data-wr-unknown="1"
data-wr-unknown-id="iu000007"
data-wr-unknown-reason="unmatched-transition"
```

diagnostic annotation뿐이다. **click handler 0.** 텍스트도 스타일도 바뀌지 않는다.

seoworld의 `메뉴 열기` 16건이 이 정책의 시험대다. 실측 (19개 페이지 전부, mobile
Chromium에서 전부 클릭):

```
unknown annotation  16
data-wr-op 가진 것   0
클릭 후 변화         0   (outerHTML 동일, DOM 노드 수 동일)
```

Task 15가 이 visual/behavior gap을 **발견하도록** 남겨둔다. generator가 조용히 메워두면
다음 Task가 측정하려는 바로 그것을 숨기는 것이다.

domainchecker의 style-only theme action도 마찬가지로 unknown이고 op가 없다.

---

## Form Safety

SiteSpec에는 form action이 없다 (Task 13이 boolean만 남긴다). 생성된 form은 갈 곳이
없고, 막지 않으면 clone 자신의 URL로 submit해서 페이지를 새로고침한다 — 안전한 clone이
아니라 고장난 clone처럼 보인다.

`FormSafetyRuntime`이 **capture phase**에서 모든 submit을 preventDefault한다.
버튼의 `type="submit"`은 유지한다 (관측된 semantics이고 모양과 포커스가 달라진다).
제거되는 것은 network write이지 control이 아니다.

fixture 실측: submit 클릭 → navigation 0, non-GET request 0, `action` attribute를 가진
form 0.

verified pattern trigger가 form 안의 button이어도 submit은 항상 preventDefault다.
UI state 전이는 허용, backend write는 금지.

---

## Server / Client Boundary

```
Server   route resolution · page data load · node tree · style class · text ·
         asset URL · interaction annotation
Client   InteractionRuntime 1개 + FormSafetyRuntime 1개
```

page tree는 Server Component다. client는 모델을 받지 않고 DOM에서 `data-wr-*`를 읽는다.

`load-route.ts` / `load-page.ts`는 `import "server-only"`다 — 실수로 client에서 import하면
빌드 에러가 되지, 누군가의 브라우저에 route table 200 KB가 조용히 실리지 않는다.
runtime page data는 `public/` **밖**에 있다.

page 파일 경로는 열기 전에 검사한다: relative, `..` 없음, absolute 아님, 그리고 resolve
후에도 data 디렉터리 안. Task 13 loader와 같은 root escape 철학이다.

module-level `Map` 캐시 하나. queue도 DB도 LRU도 없다.

interaction runtime은 page tree React state를 소유하지 않으므로 DOM을 직접 조작한다.
14,000개 노드를 client state로 올려서 `aria-expanded` 하나를 바꾸는 것보다 몇 자릿수
작다.

hidden variant 격리: 이벤트는 **보이는 viewport root 안에서만** 처리한다
(`getComputedStyle(root).display !== "none"`). desktop node id와 mobile node id가 같다고
가정하지 않는다. fixture가 숨은 variant의 trigger를 직접 클릭해서 무시됨을 확인한다.

---

## Client Bundle Isolation

가장 중요한 invariant다. 실측:

| site | SiteSpec | client JS chunks | SiteSpec 필드 유출 | 페이지 텍스트 유출 |
|---|---:|---:|---:|---:|
| domainchecker | 11.86 MB | **568 KB** | 0 | 0 |
| seoworld | 16.00 MB | **568 KB** | 0 | 0 |
| nextjs | 86.87 MB | **568 KB** | 0 | 0 |
| MDN | 50.18 MB | **568 KB** | 0 | 0 |

**client bundle이 네 사이트에서 바이트 단위로 동일하다.** 이것이 증거다 — client가 받는
것은 사이트가 아니라 generic runtime이다. 11.86 MB SiteSpec과 86.87 MB SiteSpec이 같은
580,963 바이트를 낸다.

fixture는 페이지 텍스트에 `SERVER_ONLY_SENTINEL_123456`을 심고 브라우저 HTML에는
있지만 `.next/static/chunks/*.js`에는 **없음**을 확인한다. `sourceElementId`,
`contentRecovery`, `sourceObservation`, `styleTokenId` 같은 SiteSpec-only 필드도 0.

---

## Fixture Tests

`pnpm smoke:reconstruction` — **178 checks, 전부 PASS.**

이 repo에서 **유일하게 offline이 아닌** smoke test이고, 의도적이다. item 150이 옳다:
컴파일된 적 없는 `.tsx` 트리나, 부팅한 뒤 모든 페이지에서 hydration error를 던지는 앱은
아무리 정적 검사를 해도 통과하면서 Task 15에게는 쓸모가 없다.

```
Task 06–12 fixture 작성
→ compileSiteSpec()            (진짜 Task 13 컴파일러)
→ Task 06–12 트리 삭제          (§122)
→ 생성 ×2 + byte diff           (§12 determinism)
→ validateGeneratedApp()
→ SiteSpec 삭제                 (§203)
→ next build
→ client bundle sentinel 검사    (§149)
→ next start
→ Chromium desktop + mobile
```

원본 사이트 방문 0, 자체 network request 0. HTTP는 방금 빌드한 앱을 향한 localhost뿐이다.

fixture 사이트는 "조용히 실패하는 방식"으로 적대적으로 설계했다:

| 검사 항목 | 내용 |
|---|---|
| §121 | Task 13 컴파일러를 통과하는 SiteSpec (스키마 위조 불가) |
| §122 | Task 06–12 트리 삭제 후 생성 PASS |
| §203 | SiteSpec 삭제 후 build / start PASS |
| §12 | 같은 입력 2회 생성 → byte-identical, timestamp / absolute path 0 |
| §123 | `<p>Hello <strong>world</strong> !</p>` 순서 정확 |
| §124 | 250자 텍스트가 200자로 다시 잘리지 않음 |
| §125 | `<pre>` 공백 byte 단위 보존 + `white-space: pre` 적용 |
| §126 | 11종 React attribute가 실제 Chromium DOM에 올바른 HTML attribute로 |
| §127 | `details open` / `disabled` / `required` / `hidden` / **`hidden="until-found"`** |
| §128 | `select.value === "B"` + `<select multiple>` 배열 + option `selected` prop 0 |
| §129 | `checkbox.checked === true` + attribute 존재 |
| §130 | textarea 초기값 + children 미출력 |
| §131 | 절대 same-origin href → `/about`, 클릭 → clone route 이동 |
| §132 | `/search?q=a` / `?q=b` 각각 자기 내용 |
| §133 | label/aria/fragment relation이 generated id 참조, sourceHtmlId 미사용 |
| §134 | img `src` + `srcSet` (descriptor semantics), `next/image` 미사용 |
| §135 | inline SVG 렌더 + script/on*/javascript: 0 + source class/style 제거 |
| §136 | color / display / position / font-size / margin / white-space 정확 |
| §137 | `::before` content + 자체 computed color |
| §138 | 1440에서 desktop 표시·mobile 숨김, 390에서 반대 |
| §139 | summary 클릭 → `details.open` 토글, JS 이중 토글 없음 |
| §140 | aria-expanded false→true, target 표시, 재클릭 시 복귀 |
| §141 | dynamic menu: 전 없음 → mount(tag/role 보존, **children 0**) → unmount |
| §142 | tab 클릭 → 자신 selected, 형제 deselected, panel 표시 |
| §143/§144 | `aria-pressed` / `aria-checked` false→true |
| §101 | dialog: **CSS로 숨겨진** region이 실제로 보이게 되고 닫으면 복귀 |
| §103 | generic state toggle |
| §145 | dismiss가 trigger만 제거, 형제 수 정확히 −1 |
| §146 | `메뉴 열기` unknown 클릭 → outerHTML 동일, DOM 노드 수 동일 |
| §147 | submit → navigation 0 · write request 0 · form action 0 |
| §148 | console.error / warning / pageerror **0** (asset 요청 실패는 별도 버킷) |
| §149 | sentinel이 HTML에는 있고 client chunk에는 없음 |
| §31 | 숨은 variant의 trigger 클릭 → 무시 |
| §50 | `original.example` / `ATTACK-PAYLOAD` / `steal()` / `TOP-SECRET` / `theme-dark` / `hunter2` / `javascript:alert` 등 11개 문자열 전역 0 |
| §77 | `dangerouslySetInnerHTML` 사용처 정확히 1곳 |
| §180 | route 완전성 · style class 해결 · DOM id 유일성 · trigger 존재 · manifest 정합 |
| §190 | generator import graph에 browser/crawler/HTTP/AI 0, 외부 의존성 `parse5`, `zod`뿐 |
| §205 | 앱 복사본이 byte-identical, 절대 경로/SiteSpec 경로 참조 0, `process.cwd()` 기반 |

---

## Generated App Build Tests

4개 사이트 전부 `next build` PASS. 빌드하지 않은 앱을 "generated successfully"로
처리하지 않았다.

```
Next.js 16.3.0 (Turbopack) · React 19.2.8 · TypeScript 5.9.3
Node 22 · NEXT_TELEMETRY_DISABLED=1
```

생성된 `package.json`에는 `"latest"`가 없고 **실제 resolve된 정확한 버전**이 들어간다.
버전은 하드코딩이 아니라 설치된 패키지에서 읽는다 — 사람이 타이핑하고 최신이길 바라는
버전이 아니라 이 머신이 실제로 resolve한 버전이 파일에 남는다.

`tsconfig.json`에 Next가 요구하는 `jsx: react-jsx`와 `.next/dev/types` include를
**미리** 써 넣었다. 빌드가 생성 파일을 다시 쓰면 byte-identical 보장이 "diff 전에 빌드한
사람"에게만 깨지기 때문이다.

`next.config.mjs`는 workspace root를 고정하지 **않는다**. 생성된 앱은 자기가 나온
파이프라인 데이터 옆에 놓이고 의존성은 위로 올라가며 해결되는데, root를 앱 디렉터리로
고정하면 Next.js 자신을 찾지 못한다 (실제로 처음에 이렇게 실패했다).

---

## domainchecker Results

```
routes 19 · page sources 6 · element nodes 6,658 · text nodes 5,274
style rules 1,615 (159,741 declarations) · pseudo rules 198 · missing style refs 0
generated DOM ids 103 · IDREF rewritten 164 / unresolved 0
assets: img src 74 · srcSet 60 · inline SVG 456 · unresolved 0 · remote 14 · download 0
srcset 잘림 후보 제외 50 (Observer 500자 cap)
links: clone route 176 · route table 밖 480 · external 10
patterns 13/13 bound (native 8 · scripted 5) · unknown 10 → annotation 10 · 구현 0
breakpoint 915 (inferred)
generation 208 ms · next build 2.85 s
HTTP 19/19 = 200 · 404 route = 404 · JS error 0 · asset 요청 실패 0
```

**mobile hamburger (item 160).** `aria-label="메뉴"` trigger,
`data-wr-op="disclosure"` / `data-wr-mechanism="aria-expanded"`.
클릭 → `aria-expanded` `false → true`, 재클릭 → `false`.
`data-wr-target-id` 없음 (원본이 target을 선언하지 않았다) → **생성된 dynamic region 0**.
없는 drawer subtree를 만들지 않았다.

**native details.** summary 클릭 → `details.open` `false → true`. JS 이중 토글 없음
(`data-wr-op="native"`).

**theme unknown (item 161).** style-only-change 1건 + navigation-tainted 1건, 둘 다
`data-wr-op` 없음. verified toggle로 만들지 않았다.

---

## seoworld Results

```
routes 30 · page sources 19 · element nodes 9,188 · text nodes 5,366
style rules 2,198 (217,230 declarations) · pseudo rules 258 · missing style refs 0
generated DOM ids 45 · IDREF rewritten 68 / unresolved 0
assets: img src 80 · srcSet 64 · inline SVG 374 · unresolved 0 · remote 16 · download 0
links: clone route 876 · route table 밖 300 · external 42
patterns 7/7 bound (native 4 · scripted 3) · unknown 16 → annotation 16 · 구현 0
breakpoint 915 (inferred)
generation 253 ms · next build 2.71 s
HTTP 30/30 = 200 · JS error 0 · asset 요청 실패 0
```

**disabled control (item 162).** `<button disabled>출시 예정</button>`이 clone DOM에
그대로 있고 `button.disabled === true`다. 비활성 버튼이 눌리는 버튼이 되지 않았다.

**selected option.** `<select>`의 초기 선택이 `kr`(한국)로 SiteSpec과 일치.
React controlled/uncontrolled 경고 0.

**unmatched hamburger (item 163) — 이 Task의 시험대.**

19개 page source 전부를 mobile Chromium에서 열고 모든 unknown trigger를 클릭했다:

```
unknown annotation        16
data-wr-op 가진 것         0
클릭 후 outerHTML 변화     0
클릭 후 DOM 노드 수 변화    0
```

`메뉴 열기`라는 텍스트를 보고 menu runtime을 만들지 않았다. Task 15가 이 gap을
발견하도록 남겨둔다.

---

## nextjs Results

```
routes 40 · page sources 15 · element nodes 87,191 · text nodes 42,960
style rules 4,068 (402,352 declarations) · pseudo rules 2,308 · missing style refs 0
generated DOM ids 723 · IDREF rewritten 1,276 / unresolved 120
assets: img src 460 · srcSet 90 · inline SVG 4,836 · unresolved 332 · remote 4 · download 0
links: clone route 646 · route table 밖 9,496 · external 1,250
patterns 45/45 bound (native 2 · scripted 43) · dynamic targets 9 · unknown 35 · 구현 0
breakpoint 915 (inferred)
generation 1,007 ms · next build 2.62 s
HTTP 40/40 = 200 · JS error 0 · asset 요청 실패 0
```

**dynamic menu (item 164).** 9건. 실측 (Chromium):

```
before   document.getElementById("wr-dyn-p000005-desktop-ip000011") === null
click    <div role="listbox"> mount · childNodes 0 · aria-expanded "true"
         trigger의 aria-controls === "wr-dyn-p000005-desktop-ip000011"
click    unmount
```

**invented menu option 0.**

**tabs (item 165).** 6건. 클릭 → 자신 `aria-selected` `false → true`, 같은 tablist의
형제 3개 전부 `false`. panel show/hide는 하지 않는다 — 6건 전부 `aria-controls`가 자기
자신으로 resolve되는 id churn이기 때문이고, 그 이유를
`tabs-panel-target-not-distinguishable`로 남겼다.

**selected options (item 166).** 64개 select 전부 초기 선택이 `TypeScript`로 SiteSpec의
`<option selected>`와 일치. React 경고 0.

**unresolved img 332건.** 원인은 `src`가 `data:` URI라서 Observer가 애초에 저장하지 않은
것이다 (http(s)만 통과). 없는 src를 지어내지 않고 layout attribute와 style은 유지했다.

**unresolved IDREF 120건.** 원본이 이미 깨뜨린 참조이고 원본 token을 그대로 보존했다.

---

## MDN Results

```
routes 23 · page sources 12 · element nodes 45,336 · text nodes 32,774
style rules 2,824 (279,288 declarations) · pseudo rules 2,050 · missing style refs 0
generated DOM ids 572 · IDREF rewritten 778 / unresolved 0
assets: img src 12 · inline SVG 96 · unresolved 0 · remote 0 · download 0
links: clone route 70 · route table 밖 13,450 · external 452
patterns 33/33 bound (native 13 · scripted 20) · unknown 2 · 구현 0
breakpoint 915 (inferred)
generation 586 ms · next build 2.52 s
HTTP 23/23 = 200 · JS error 0 · asset 요청 실패 18 (별도 카운트)
```

**initially-open details (item 167).** Task 13.1의 `open` 62건이 clone runtime tree에
그대로 62건. 브라우저 실측: p000002 desktop에 `<details>` 28개 중 `open` 1개 —
원본에서 펼쳐져 있던 것만 펼쳐져 있다.

**summary toggle (item 168 앞).** `data-wr-op="native"` summary 클릭 → `details.open`
`false → true`. 브라우저 기본 동작이고 JS 이중 토글 없음.

**th scope (item 168).** `scope` 34건이 runtime tree에 그대로 34건. 브라우저 실측:
p000002 desktop에 `th[scope]` 5개, 값 `row row col col col`.

**ARIA disclosure.** mobile sidebar toggle 실측:

```
before  aria-expanded "false" · target display "none"
click   aria-expanded "true"  · target display "block"
click   aria-expanded "false" · target display "none"
```

target이 `hidden` attribute가 아니라 CSS로 숨겨져 있어서 reveal override가 필요했던
경우다 (위 Disclosure 절 참조).

**asset 요청 실패 18건**은 MDN이 자기 정적 자산에 `Cross-Origin-Resource-Policy`를
걸어두어 reference mode의 cross-origin 이미지 로드가 거부되는 것이다. **JS error가
아니라** source asset request 실패이고 별도로 센다. 이 구분이 없으면 진짜 hydration
error가 같은 숫자에 섞여 숨는다.

---

## Route Coverage

| site | verified routes | generated | HTTP 200 | missing | duplicate |
|---|---:|---:|---:|---:|---:|
| domainchecker | 19 | **19** | **19** | 0 | 0 |
| seoworld | 30 | **30** | **30** | 0 | 0 |
| nextjs | 40 | **40** | **40** | 0 | 0 |
| MDN | 23 | **23** | **23** | 0 | 0 |
| **합계** | **112** | **112** | **112** | **0** | **0** |

route table 밖의 path는 4개 사이트 전부 **404**다.

**이것은 exact observation coverage가 아니다.** 두 축은 별개로 유지된다:

| site | exact observed | validation | family-represented | exact behavior | represented behavior | not explored |
|---|---:|---:|---:|---:|---:|---:|
| domainchecker | 4 | 2 | 13 | 5 | 13 | 1 |
| seoworld | 16 | 3 | 11 | 16 | 11 | 3 |
| nextjs | 12 | 3 | 25 | 14 | 25 | 1 |
| MDN | 9 | 3 | 11 | 10 | 11 | 2 |
| **합계** | **41** | **11** | **60** | **45** | **60** | **7** |

route 생성률 100%, 로컬 렌더 100%. 관측 coverage 36.6%(41/112), exact behavior
40.2%(45/112). 이 세 숫자를 섞지 않는다.

---

## Runtime Behavior Coverage

**source pattern instance ≠ runtime binding ≠ route occurrence.**

| site | verified pattern instances (source) | runtime bindings | native | scripted | unsupported |
|---|---:|---:|---:|---:|---:|
| domainchecker | 13 | **13** | 8 | 5 | 0 |
| seoworld | 7 | **7** | 4 | 3 | 0 |
| nextjs | 45 | **45** | 2 | 43 | 0 |
| MDN | 33 | **33** | 13 | 20 | 0 |
| **합계** | **98** | **98** | **27** | **71** | **0** |

pattern type별:

| type | source | runtime | 비고 |
|---|---:|---:|---|
| disclosure | 50 | 50 | native-details 25 + aria-expanded 25 |
| selection | 30 | 30 | aria-checked 28 + native-checked 2 |
| menu | 9 | 9 | 전부 dynamic target |
| tabs | 6 | 6 | 전부 self-referential target |
| dismiss | 3 | 3 | |
| dialog / toggle / generic-state-toggle | 0 | 0 | 실사이트 0, **fixture로 runtime 검증** |

`byPatternType` 합이 98이다. **confirmed pattern 100% support.**

family-represented route에 대표 페이지의 binding 구현이 반복 렌더되지만 **verified
pattern count는 증가하지 않는다.** DOM에서도 `verifiedOnThisRoute="false"`다.

unknown: source instance 63 → annotation 63 → **runtime behavior 구현 0**.

---

## React Semantics Results

Task 13.1의 344개가 전부 생성된 DOM에 있다 (위 Declarative State Mapping 표).
source node 기준 카운트이고, family route 재사용으로 부풀린 route occurrence와 섞지
않았다.

React console warning / error: **0** (fixture와 4개 실사이트 샘플 전부).
controlled/uncontrolled 경고도 0.

---

## Asset Results

| site | element asset 요청 | resolved src | resolved srcSet | inline SVG | unresolved | remote URL | download |
|---|---:|---:|---:|---:|---:|---:|---:|
| domainchecker | 530 | 74 | 60 | 456 | 0 | 14 | **0** |
| seoworld | 454 | 80 | 64 | 374 | 0 | 16 | **0** |
| nextjs | 5,634 | 460 | 90 | 4,836 | 332 | 4 | **0** |
| MDN | 206 | 12 | 0 | 96 | 0 | 0 | **0** |

`assetMode: "reference"` — 다운로드 0. `next/image` 미사용.
srcset 잘림 후보 제외: 50 / 30 / 0 / 0 (전부 카운트 + limitation).

inline SVG 5,762건 전부 sanitized 채널로만 렌더됐고, generator가 다시 검사해 `<script>` /
`on*` / `javascript:` / `<foreignObject>` **0건**을 확인했다.

---

## CSS Results

| site | style tokens (SiteSpec) | 생성 rule | declaration | pseudo rule | missing style ref | CSS size |
|---|---:|---:|---:|---:|---:|---:|
| domainchecker | 1,628 | 1,615 | 159,741 | 198 | **0** | 3.18 MB |
| seoworld | 2,232 | 2,198 | 217,230 | 258 | **0** | 4.35 MB |
| nextjs | 4,485 | 4,068 | 402,352 | 2,308 | **0** | 8.63 MB |
| MDN | 3,329 | 2,824 | 279,288 | 2,050 | **0** | 5.95 MB |

생성 rule이 token 수보다 적은 것은 **실제로 참조된 token만** 출력하기 때문이다
(document root용 adapted class는 별도로 추가된다). route별 tree-shaking은 하지 않았다 —
item 187대로 correctness 먼저다.

element 노드 148,373개 **전부**가 style class를 갖는다 (`styledNodes == elementNodes`).
dangling style token **0**.

CSS 값 거부: property 0건, value 0건. 실측으로 CSS rule boundary를 깨는 값은 없었지만
검사는 남는다.

---

## Client JS Size

```
domainchecker   568 KB
seoworld        568 KB
nextjs          568 KB
MDN             568 KB
```

**네 사이트가 바이트 단위로 동일하다** (580,963 B). 11.86 MB SiteSpec과 86.87 MB SiteSpec이
같은 client bundle을 낸다 — 이것이 "164.9 MB가 client로 가지 않았다"의 증거다.

client chunk 안의 SiteSpec-only 필드(`sourceElementId`, `contentRecovery`,
`sourceObservation`, `styleTokenId`, `boundingBox`, `effectiveVisible`): **0**.
페이지 텍스트: **0**.

---

## Generated Storage

| site | source SiteSpec | generated (app + manifest) | runtime page data | CSS | .next (빌드 산출물) |
|---|---:|---:|---:|---:|---:|
| domainchecker | 11.86 MB | 4.57 MB (38.6%) | 1.15 MB | 3.18 MB | 31 MB |
| seoworld | 16.00 MB | 6.11 MB (38.2%) | 1.44 MB | 4.35 MB | 31 MB |
| nextjs | 86.87 MB | 22.22 MB (25.6%) | 12.52 MB | 8.63 MB | 31 MB |
| MDN | 50.18 MB | 13.22 MB (26.3%) | 6.62 MB | 5.95 MB | 31 MB |
| **합계** | **164.92 MB** | **46.12 MB (28.0%)** | **21.73 MB** | **22.11 MB** | — |

**164.9 MB → 46.1 MB (28.0%).** SiteSpec 복제가 아니라 derivative다. runtime page data에는
provenance, boundingBox, visibility flag, sourceElementId, limitations,
contentRecovery, frame/shadow inventory, recoveredAttributeNames가 **구조적으로 없다**
(나중에 걸러내는 게 아니라 애초에 만들지 않는다).

app 자체 소스 코드(템플릿 + 런타임)는 사이트와 무관하게 **24 KB**다.

`public/` 크기는 곧 generated CSS 크기다. `node_modules`는 복사하지 않았다.

---

## Performance

| site | SiteSpec load | plan | write | validate | **총 생성** | next build |
|---|---:|---:|---:|---:|---:|---:|
| domainchecker | 117 ms | 61 ms | 28 ms | 13 ms | **208 ms** | 2.85 s |
| seoworld | 148 ms | 77 ms | 31 ms | 18 ms | **253 ms** | 2.71 s |
| nextjs | 655 ms | 321 ms | 93 ms | 92 ms | **1,007 ms** | 2.62 s |
| MDN | 341 ms | 170 ms | 62 ms | 52 ms | **586 ms** | 2.52 s |
| **합계** | — | — | — | — | **2.05 s** | **10.7 s** |

164.9 MB의 SiteSpec 4개에서 실행 가능한 Next.js 앱 4개까지 **총 12.8초**.
generator 자체 network 0.

---

## Browser Runtime Errors

| site | console.error/warning | pageerror | hydration error | source asset 요청 실패 |
|---|---:|---:|---:|---:|
| domainchecker | **0** | **0** | **0** | 0 |
| seoworld | **0** | **0** | **0** | 0 |
| nextjs | **0** | **0** | **0** | 0 |
| MDN | **0** | **0** | **0** | 18 |

사이트당 5개 route × 2 viewport = 10개 페이지를 열었고, 추가로 seoworld는 19개 page
source 전부를 mobile에서 열었다.

MDN의 18건은 전부 cross-origin 이미지 로드 거부(MDN의 CORP 헤더)다. **JS error가 아니라
reference mode의 성질**이고, 그래서 다른 버킷에 센다.

---

## Determinism

- 실사이트 4개 각각 **2회 생성 → `diff -r` byte-identical (4/4 PASS)**
- fixture도 2회 생성 byte-identical
- generated source에 timestamp 없음, random UUID 없음, absolute local path 없음
  (fixture가 전 파일에서 검사)
- CSS는 `styleTokenId` 순서 + property 이름 정렬 → 같은 SiteSpec이면 같은 바이트
- manifest의 `generatedFiles[]`도 경로 정렬 → 쓰기 순서의 함수가 아니다
- run directory 이름만 시계를 갖는다 (Task 13과 같은 convention)

제외: `.next/`, `node_modules/`, `next-env.d.ts` (Next가 빌드 중 만든다).

---

## Existing Artifact Immutability

Task 06–13.1 artifact 전체(4개 사이트, `reconstructions/` 제외)의 SHA-256 트리 해시를
생성 전후로 비교:

```
before: c8abbe4f4463ab414ba589f2d35f9039de12ff648360bd49254bad9c49e9f961
after:  c8abbe4f4463ab414ba589f2d35f9039de12ff648360bd49254bad9c49e9f961
```

**변경 0.** SiteSpec run directory도 그대로 두었다.

생성된 앱 4개 전체를 스캔한 결과 (`.next/` 제외):

```
onclick= / onload= / onerror=   0 파일
javascript:                     0 파일
form action / formaction        0 파일
<script src="원본…">             0 파일
document.cookie                 0 파일
runtime data의 source class/style/data-*/on* prop   0
```

`data-wr-*`는 clone runtime 자신의 generated metadata이고 source `data-*` 복원이 아니다.
SiteSpec에는 source `data-*`가 애초에 없으므로 generator에겐 만들 방법도 없다.

---

## Known Fidelity Gaps

Task 15가 찾아야 할 것들을 미리 적는다. **QA engine은 구현하지 않았다.**

1. **Canvas background.** 원본의 `<html>` background는 CSS 사양상 canvas로 전파되지만,
   clone에서 root는 Next.js의 `<html>`이고 관측된 `<html>` style은 안쪽 wrapper에 있다.
   콘텐츠보다 뷰포트가 크면 그 아래가 clone의 기본 배경으로 보인다. 다크 테마 사이트에서
   눈에 띌 것이다.
2. **Interaction target의 열린 상태 style.** 파이프라인은 닫힌 상태 computed style만
   관측했다. clone은 중립적인 `display: revert`로 연다 — 나타난다는 사실은 재현하지만
   그것이 `flex`였는지 `grid`였는지는 모른다 (MDN 10건).
3. **Reference mode asset.** 원본 URL을 그대로 가리키므로 CORP/CORS/hotlink 차단이
   그대로 나타난다 (MDN 18건). Task 15에서 blocker로 확인되면 materialization을 추가한다.
4. **Font.** `font-family` computed 값은 정확하지만 원본 stylesheet의 `@font-face`는
   컴파일되지 않는다. 파일명으로 weight/style을 추측하지 않았으므로 브라우저 fallback이
   쓰인다 (`font-source-binding-unverified`).
5. **`data:` URI 이미지 332건 (nextjs).** Observer가 http(s)만 저장해서 SiteSpec에
   레퍼런스가 없다. src를 지어내지 않았으므로 그 자리는 비어 있다.
6. 그 외: dynamic region의 내용(9건)과 배치, shadow root / iframe 내부(미관측),
   breakpoint 사이 구간(관측된 두 endpoint뿐), 두 variant를 동시에 넣어 약 2배가 된 DOM.

Task 15가 검출 가능한 것: 1, 2, 3, 4, 5 전부 — screenshot diff와 geometry diff로 바로
드러난다. 6의 dynamic region 내용은 새 관측 없이는 검출만 가능하고 해결은 불가능하다.

---

## Task 15 Readiness

Task 15를 막는 generator 문제는 **없다.**

- 112 route 전부가 로컬에서 200으로 렌더된다 → route 단위 비교가 가능하다
- `data-wr-node` / `data-wr-page` / `data-wr-viewport` / `data-wr-route` /
  `data-wr-render-coverage` / `data-wr-behavior-coverage`가 DOM에 있어 diff를
  **관측 등급별로** 나눠 볼 수 있다
- 생성이 결정적이라 auto-fix 루프가 "고쳤는데 다른 게 흔들렸다"를 겪지 않는다
- manifest가 route/style/asset/behavior 회계를 정확히 들고 있어 QA가 기준선을 다시 셀
  필요가 없다
- boundingBox는 일부러 레이아웃으로 변환하지 않았다 — Task 15의 geometry diff가 쓸 수
  있는 독립 증거로 SiteSpec에 그대로 남아 있다

---

## Problems Encountered

1. **Turbopack이 `outputFileTracingRoot`로 Next.js 자신을 못 찾았다.** 처음엔 생성된 앱
   디렉터리로 workspace root를 고정했는데, 그러면 위로 올라가는 의존성 해결이 끊긴다.
   고정을 제거해 lockfile 기반 자동 탐지에 맡겼다.
2. **`hidden="until-found"`가 React를 통과하지 못한다.** `renderToStaticMarkup`으로 확인:
   React DOM은 `hidden`을 boolean으로 다뤄 `hidden=""`을 낸다. 접는 것은 금지이므로
   `data-wr-hidden`에 값을 싣고 client runtime이 복원하도록 했다.
3. **inline SVG 루트의 source `class`가 생성된 class를 삼켰다.** 코퍼스 145개 중 79개가
   루트에 source class를 갖고 있어서, 그냥 붙이면 HTML 파서가 첫 번째를 채택한다.
   parse5로 루트의 `class`/`style`/`id`/`data-*`를 제거한 뒤 우리 것을 넣는다.
4. **pseudo selector가 페이지 간에 충돌했다.** node id는 viewport마다 1부터 다시
   매겨지므로 viewport로만 scope하면 두 번째 페이지가 첫 페이지의 `::before`를 덮어쓴다.
   `data-wr-page`까지 scope에 넣었다.
5. **MDN disclosure가 열려도 아무것도 안 보였다.** target이 `hidden` attribute가 아니라
   CSS로 숨겨져 있어서 attribute 토글이 style class에 진다. build time에 판별해
   specificity가 더 높은 reveal 규칙을 두었고, 열린 상태 style이 미관측임을 limitation으로
   남겼다.
6. **`next build`가 생성된 `tsconfig.json`을 고쳐 썼다.** 빌드가 생성 파일을 수정하면
   determinism 주장이 "빌드 전에 diff한 사람"에게만 참이 된다. Next가 요구하는 값을 미리
   써 넣어 재작성이 일어나지 않게 했다.
7. **generator import graph 검사가 자기 자신에게 걸렸다.** `runtime-template.ts`가 생성될
   앱의 `import "next/navigation"`을 **문자열로** 갖고 있어서 외부 의존성으로 잡혔다.
   코드 생성 파일에서는 template literal을 제외하고 스캔한다.
8. **relocation을 완전히 증명할 수 없었다.** 아래 Current Limitations 2번.

---

## Technical Decisions

| 결정 | 이유 |
|---|---|
| catch-all route 1개 | 112개 `page.tsx`는 route table이 데이터라는 사실을 부정한다. 10,000 URL이어도 같은 앱이 나온다 |
| route key = decoded pathname + sorted query | Next가 segment를 decode해서 주므로 대칭. re-encode는 `(`/`'`/`!`에서 어긋난다 |
| runtime data 짧은 key | 150k 노드 × 약 35 바이트. 이 파일은 사람이 읽는 IR이 아니라 cold start에 파싱되는 데이터다 |
| generated CSS를 `public/`으로 | 최대 8.6 MB. 번들러에 넣으면 clone에 불필요한 minify를 얻고 필요한 빌드 시간/메모리를 잃는다 |
| `display: contents` variant wrapper | 반응형 장치가 자기가 보여주는 레이아웃에 box를 더하지 않는다 |
| document root의 geometry만 제외 | `width: 1440px`는 저자의 스타일이 아니라 브라우저의 측정값이다 |
| binding을 코드가 아니라 `data-wr-*`로 | client bundle이 사이트 크기와 무관해진다. 실측 4사이트 동일 바이트 |
| 노드당 컴포넌트가 아니라 재귀 함수 | 큰 페이지 14,000 노드. 컴포넌트 경계는 얻는 것 없이 reconciler 비용만 든다 |
| dynamic region을 trigger 바로 뒤에 | 위치가 미관측이므로 결정적이고 가까운 곳. 그리고 그것이 renderer의 선택임을 기록 |
| tabs의 self-target에서 panel 조작 안 함 | 6/6이 id churn이다. 원본 source id를 다시 신뢰하지 않는다 |
| unsupported = 0을 목표로 op 테이블을 전사 함수로 | "unsupported"가 "registry가 새 멤버를 얻었다"만 의미하게 만든다 |
| smoke test를 offline으로 만들지 않음 | 컴파일된 적 없는 tsx 트리는 어떤 정적 검사도 통과한다 |

---

## Current Limitations

1. **Query variant route는 실데이터 0건.** 구현·fixture 검증은 끝났지만 4개 사이트에는
   같은 pathname의 query variant가 없었다. fixture가 `/search?q=a` / `?q=b`로 커버한다.
2. **완전한 relocation은 보장하지 않는다.** 생성된 **소스**는 위치 독립적이다 (repo 밖
   복사본이 byte-identical하고, 절대 경로도 SiteSpec 경로도 참조하지 않으며, runtime data는
   `process.cwd()` 기준이다 — smoke §205가 검사). 하지만 **의존성**은 복사로 옮겨지지
   않는다. `package.json`이 정확한 버전을 고정하므로 실제 이전은 그 위치에서 install을
   돌리는 것이고, `node_modules` 심볼릭 링크로 우회하려 하면 Turbopack이 거부한다
   ("Symlink … points out of the filesystem root"). 이 Task는 source-data independence까지
   보장하고, 그 이상은 주장하지 않는다.
3. **`dialog` / `toggle` / `generic-state-toggle`은 실측 0건.** runtime 구현과 fixture
   검증은 끝났지만 4개 사이트에 해당 pattern이 없었다. 코드가 검증되지 않았다는 뜻이 아니라
   이 코퍼스에 없었다는 뜻이다.
4. **`colspan`/`rowspan`/`readonly`/`checked`/`multiple`/`contenteditable`/popover도
   실측 0건.** Task 13.1과 같은 상황이고, 같은 이유로 fixture가 담당한다.
5. **route별 CSS tree-shaking 없음.** 사이트 전체 style catalog가 모든 페이지에 실린다.
   item 187대로 correctness 우선이고, 큰 사이트에서 8.6 MB다.
6. **DOM이 약 2배.** 두 viewport variant를 같은 문서에 넣는 baseline 선택의 비용이다.
   Task 15에서 성능 문제면 server/client viewport selection으로 개선한다.
7. **`next-env.d.ts`는 Next가 빌드 중 만든다.** generated source로 취급하지 않고
   determinism 비교에서 제외한다.
8. **breakpoint 사이 구간은 여전히 미관측.** 915px는 두 endpoint의 중점일 뿐이고
   `provenance: "inferred"`로 기록된다.

---

## Changed Files

**신규**

```
src/reconstruction/types.ts                  runtime/manifest 스키마 + limitation 어휘
src/reconstruction/load-input.ts             유일한 입력 문 + 2중 버전 검사
src/reconstruction/route-plan.ts             route key · clone path · 1:1 invariant
src/reconstruction/responsive-plan.ts        breakpoint 추론 + media query convention
src/reconstruction/react-attributes.ts       HTML → React props adapter
src/reconstruction/relations.ts              generated DOM id + IDREF rewrite
src/reconstruction/compile-node.ts           SpecNode → runtime node
src/reconstruction/compile-runtime-page.ts   PageSpec → compact derivative
src/reconstruction/style-generator.ts        computed style → CSS (+ 값 안전성)
src/reconstruction/pseudo-generator.ts       ::before / ::after (page+viewport scope)
src/reconstruction/asset-resolver.ts         asset join + srcset 정책 + SVG 방어
src/reconstruction/link-rewriter.ts          href rewrite 정책
src/reconstruction/interaction-bindings.ts   pattern → op → data-wr-*
src/reconstruction/plan-reconstruction.ts    결정적 plan
src/reconstruction/app-template.ts           생성될 Next.js shell + globals.css
src/reconstruction/runtime-template.ts       생성될 앱의 server/client runtime
src/reconstruction/generate-app.ts           파일 쓰기 + manifest
src/reconstruction/validate-output.ts        디스크 재검증
src/reconstruction/store.ts                  reconstructions/ namespace
src/reconstruction/index.ts                  barrel export
src/cli-reconstruct.ts                       pnpm reconstruct
scripts/smoke-reconstruction.ts              178 checks (generate→build→start→Chromium)
docs/result/14-nextjs-reconstruction-engine-2026-08-14.md
data/<host>/reconstructions/<run-id>/         (4개 사이트 생성 결과)
```

**수정**

```
package.json      reconstruct + smoke:reconstruction 스크립트,
                  next 16.3.0 · react 19.2.8 · react-dom 19.2.8 (dependencies),
                  @types/react · @types/react-dom · server-only (devDependencies)
pnpm-lock.yaml    위 의존성
README.md         Task 14 절 · 파이프라인 · CLI 사용법 · 프로젝트 구조
ROADMAP.md        Phase 9 완료, Phase 10(Task 15)을 다음으로
```

**Task 06–13.1 artifact: 수정 0** (SHA-256 트리 해시 동일).
`src/sitespec/*`, `src/observer/*`, `src/interaction-*`: **수정 0**.

---

## Reviewer Checklist

- [x] `pnpm typecheck` PASS
- [x] `pnpm smoke:verifier` PASS (81/81)
- [x] `pnpm smoke:selector` PASS (81/81)
- [x] `pnpm smoke:multi-observer` PASS (58/58)
- [x] `pnpm smoke:interaction-detector` PASS (92/92)
- [x] `pnpm smoke:interaction-explorer` PASS (95/95)
- [x] `pnpm smoke:interaction-patterns` PASS (88/88)
- [x] `pnpm smoke:sitespec` PASS (252/252)
- [x] `pnpm smoke:reconstruction` PASS (**178/178**)
- [x] 4개 실사이트 생성 + `next build` PASS (4/4)
- [x] 112 route 전부 로컬 HTTP 200
- [x] 원본 사이트 재방문 0 · Firecrawl 0 · AI 0 · asset download 0
- [x] git add / commit / push 하지 않음

**item 213의 29개 질문**

1. **Task14 generator가 SiteSpec root 밖의 Task09~12 artifact를 읽은 적이 0인가?**
   **0.** 입력은 `loadSiteSpec()` 하나뿐이고, 그 함수는 구조적으로 SiteSpec root를 벗어날
   수 없다. import graph 자동 검사로 외부 의존성이 `parse5`, `zod`뿐임을 확인하고, fixture는
   Task 06–12 트리를 **삭제한 뒤** 생성해서 PASS한다.

2. **Generated app runtime은 SiteSpec 원본 없이 실행 가능한가?**
   그렇다. fixture가 SiteSpec 디렉터리를 삭제한 뒤 `next build` → `next start` → Chromium
   까지 통과한다. 앱은 `reconstruction-data/`만 읽고 그 경로는 `process.cwd()` 기준이다.

3. **112 verified routes가 전부 clone route로 존재하는가?**
   그렇다. 19 + 30 + 40 + 23 = **112**, generated route-map도 112, 중복 0, 누락 0,
   로컬 HTTP 200이 112/112.

4. **family-represented route가 observed라고 잘못 승격된 사례가 0인가?**
   **0.** 60개 family-represented route 전부 `renderCoverage="family-represented"`,
   `observedOnThisExactUrl=false`, `verifiedOnThisRoute=false`이고, `validateGeneratedApp()`이
   이 세 가지를 불변식으로 강제한다 (위반 시 생성 실패).

5. **validation route가 자기 PageSpec을 사용하는가?**
   그렇다. 11개 validation-sample route 전부 자기 `pageId`를 `renderSourcePageId`로 갖고,
   generator는 RouteSpec의 정책을 그대로 따른다 (family를 다시 계산하지 않는다).

6. **SiteSpec 150MB+ data가 client JS bundle로 들어가지 않았는가?**
   들어가지 않았다. client chunk 총량이 **4개 사이트 모두 568 KB로 동일**하다 — 11.6 MB
   SiteSpec과 84.9 MB SiteSpec이 같은 바이트를 낸다. SiteSpec-only 필드 0, 페이지 텍스트 0.
   fixture는 sentinel 문자열로 직접 검사한다.

7. **mixed content / long text / pre whitespace가 clone에서 유지되는가?**
   그렇다. `<p>Hello <strong>world</strong> !</p>`가 text/element/text 순서 그대로,
   250자 텍스트가 200자로 다시 잘리지 않고, `<pre>`가 byte 단위로 보존되며 브라우저에서
   `white-space: pre`가 적용된다 (fixture §123–§125, §136).

8. **style token dangling 0인가?**
   **0.** 4개 사이트 전부 `missingStyleRefs: 0`이고, dangling이 하나라도 있으면 생성이
   중단된다. element 노드 148,373개 전부가 style class를 갖는다.

9. **source class/style/on*/data-*가 되살아난 사례가 0인가?**
   **0.** runtime page data의 prop 이름을 전수 검사해 `class`/`style`/`on*`/`data-`
   (단 `data-wr-` 제외) 0건. 생성 소스 전체 문자열 스캔에서도 `onclick=`/`onload=`/
   `javascript:`/`formaction` 0 파일. inline SVG 루트의 source class/style/id/data-*도
   제거한다.

10. **React attribute mapping으로 warning/error가 없는가?**
    없다. fixture와 4개 실사이트 샘플 전부 console.error / warning / pageerror **0**.
    controlled/uncontrolled 경고도 0. `checked`→`defaultChecked`, option `selected`→부모
    `defaultValue`, textarea children→`defaultValue`가 그 이유다.

11. **selected 72 / open 62 / hidden 54 / disabled 12 등 현재 SiteSpec state가 올바르게
    렌더되는가?**
    그렇다. 현재 artifact에서 재계산한 값이 그대로 재현된다:
    `selected` 72(select `defaultValue`) · `open` 62 · `hidden` 54 · `datetime` 36 ·
    `scope` 34 · `required` 30 · `autocomplete` 20 · `spellcheck` 20 · `disabled` 12 ·
    `min` 2 · `start` 2 = **344**, Task 13.1의 344와 일치.

12. **generated DOM id가 sourceHtmlId를 그대로 identity로 사용하지 않는가?**
    사용하지 않는다. 전부 `wr-<pageId>-<viewport>-<nodeId>` 형식이고, fixture가 원본 id
    (`panel`, `email`, `trigger`, `logo`)가 생성 DOM id로 나타나지 않음을 확인한다.
    `sourceHtmlId`는 relation resolution provenance로만 남는다.

13. **aria-controls/label/fragment relation이 clone generated id로 연결되는가?**
    그렇다. 2,286개 token이 generated id로 rewrite됐고, unresolved 120개는 원본 token을
    그대로 보존한다(조용히 삭제 0). 동적 target의 `aria-controls`는 clone의 결정적
    dynamic target id를 가리킨다.

14. **internal links가 clone route로 이동하는가?**
    그렇다. same-origin + verified route는 clone local path가 되고(1,768건),
    fixture가 실제로 클릭해서 `/about` route로 이동하고 그 route의 내용이 렌더됨을
    확인한다. route table 밖(23,726건)은 local pathname을 유지해 clone 404가 된다.

15. **source form endpoint / write behavior가 0인가?**
    **0.** 생성 소스 전체에 form `action`/`formaction` 0. 모든 submit이 capture phase에서
    preventDefault되고, fixture 실측으로 navigation 0 · non-GET request 0.

16. **98 confirmed pattern이 runtime에서 몇 개 support되는가?**
    **98/98 (100%).** native 27 + scripted 71, unsupported 0.
    disclosure 50 · selection 30 · menu 9 · tabs 6 · dismiss 3.

17. **domainchecker disclosure가 동작하는가?**
    그렇다. mobile `메뉴` trigger가 `aria-expanded` `false → true → false`.
    declared target이 없으므로 **생성된 region 0** — 없는 drawer를 만들지 않았다.

18. **nextjs dynamic target 9건을 contents invent 없이 구현했는가?**
    그렇다. 클릭 전 target 없음 → 클릭 후 `<div role="listbox">` mount(childNodes **0**) →
    재클릭 시 unmount. `aria-expanded`도 함께 움직인다.

19. **nextjs tabs가 동작하는가?**
    그렇다. 클릭한 tab `aria-selected` `false → true`, 같은 tablist의 형제 전부 `false`.
    panel show/hide는 6/6이 self-referential target(id churn)이라 수행하지 않고
    `tabs-panel-target-not-distinguishable`로 이유를 남긴다.

20. **MDN native details 초기 open + toggle이 유지되는가?**
    그렇다. `open` 62건이 runtime tree에 62건 그대로이고, 브라우저에서 원본이 펼쳐둔
    것만 펼쳐져 있다. summary 클릭 시 브라우저 기본 동작으로 토글되고 JS 이중 토글은 없다.

21. **seoworld 16 unknown hamburger를 menu라고 추론하지 않았는가?**
    추론하지 않았다. 19개 page source 전부를 mobile에서 열고 모든 unknown trigger를
    클릭한 결과: annotation 16, `data-wr-op` 가진 것 **0**, outerHTML 변화 **0**,
    DOM 노드 수 변화 **0**.

22. **unknown interaction에 custom behavior를 추가한 사례가 0인가?**
    **0.** 63개 unknown 전부 `data-wr-unknown` annotation뿐이고
    `unknownBehaviorsImplemented`는 스키마상 `literal(0)`이라 다른 값을 쓸 수 없다.

23. **browser console/hydration error는 몇 건인가?**
    JS error / hydration error **0건** (4개 사이트 전부). MDN의 asset 요청 실패 18건은
    cross-origin 이미지 로드 거부(CORP)이고 별도 버킷에 센다.

24. **generated source가 same input에서 byte-identical인가?**
    그렇다. 실사이트 4개 각각 2회 생성 → `diff -r` byte-identical (4/4).
    timestamp / random UUID / absolute local path 0.

25. **4개 real generated app이 모두 next build PASS인가?**
    그렇다. 2.85 / 2.71 / 2.62 / 2.52초, Next.js 16.3.0 (Turbopack) + React 19.2.8.

26. **모든 real routes가 local runtime에서 render 가능한가?**
    그렇다. 112/112가 HTTP 200. route table 밖의 path는 4개 사이트 전부 404.

27. **현재 가장 큰 visual fidelity 위험 5개는 무엇인가?**
    (1) canvas background 전파 — 다크 사이트에서 콘텐츠 아래가 밝게 남는다
    (2) interaction target의 열린 상태 style 미관측 — `display: revert`로 연다
    (3) reference mode asset의 hotlink 차단 (MDN 18건)
    (4) `@font-face` 미컴파일 → 브라우저 fallback
    (5) nextjs 332개 `data:` URI 이미지의 빈 자리

28. **그 위험 중 Task15 QA로 검출 가능한 것은 무엇인가?**
    5개 전부 screenshot diff / geometry diff로 즉시 드러난다. (1)(3)(5)는 픽셀 차이로,
    (2)는 클릭 후 상태 diff로, (4)는 텍스트 metric diff로 잡힌다. 검출은 되지만 새 관측
    없이 **해결**할 수 없는 것은 dynamic region 내용(9건), shadow/iframe 내부, 그리고
    Observer가 저장하지 않은 `data:` 이미지다.

29. **Task15를 시작하기 위한 blocking generator 문제는 남아 있는가?**
    **없다.** 112 route가 전부 렌더되고, 생성이 결정적이며, DOM에 관측 등급
    annotation이 있어 diff를 등급별로 나눌 수 있고, manifest가 정확한 회계를 들고 있다.
    boundingBox는 일부러 레이아웃으로 변환하지 않아 geometry diff의 독립 증거로 남아 있다.

---

## 성공 기준 대조

| 기준 | 결과 |
|---|---|
| `pnpm typecheck` PASS | ✓ |
| 기존 모든 smoke PASS | ✓ 7/7 |
| `pnpm smoke:reconstruction` PASS | ✓ 178/178 |
| actual Next app generation / build / start / Chromium PASS | ✓ |
| SiteSpec-only generation PASS | ✓ Task 06–12 트리 삭제 후 |
| generated-app source-data independence PASS | ✓ SiteSpec 삭제 후 build/start |
| generated source determinism PASS | ✓ 4/4 byte-identical |
| all SiteSpec routes mapped · duplicate 0 | ✓ 112/112, 중복 0 |
| mixed content / long text / pre whitespace PASS | ✓ |
| React attribute adapter PASS | ✓ 11종 + 실제 DOM 검증 |
| selected / checked / textarea semantics PASS | ✓ |
| hidden until-found preservation PASS | ✓ 실제 DOM에 `until-found` |
| generated relation ids PASS | ✓ 2,286 rewrite, 원본 id 미사용 |
| style generation / pseudo fixture PASS | ✓ dangling 0 |
| asset mapping / inline SVG safety PASS | ✓ script·on*·javascript: 0 |
| responsive desktop/mobile PASS | ✓ 1440 / 390 양방향 |
| form safety PASS | ✓ navigation 0 · write 0 |
| disclosure / dynamic menu / tabs / selection / toggle / dialog / dismiss PASS | ✓ |
| unknown behavior invention 0 | ✓ 63/63 annotation only |
| source original JS 0 · source class/style 0 · form backend endpoint 0 | ✓ |
| SiteSpec client bundle leak 0 | ✓ 4사이트 동일 568 KB |
| 4 real sites generated · 4 real next build PASS | ✓ |
| all current verified routes local render PASS | ✓ 112/112 |
| real browser samples PASS | ✓ JS error 0 |
| Task 06–13.1 artifact mutation 0 | ✓ SHA-256 동일 |
| report generated | ✓ 이 문서 |
