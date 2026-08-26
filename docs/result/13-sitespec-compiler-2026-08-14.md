# Task 13 — SiteSpec Compiler

```
Task:     13
Title:    SiteSpec Compiler
Previous: 12-interaction-pattern-modeling-and-unknown-strategy-2026-08-13.md
Status:   Complete
```

---

## 작업 목표

Task 01–12이 만들어 놓은 **reconstruction에 필요한 모든 관측 증거**를 하나의
deterministic, self-contained, implementation-neutral IR로 컴파일한다.

한 문장으로:

> Task 14 reconstruction engine이 **SiteSpec 디렉터리만 읽고** 사이트를 재구성할 수
> 있어야 한다. Task 09 `dom.json`, Task 11 action 파일, Task 12 pattern 파일을 다시
> 열면 실패다.

부수적으로, Task 14를 시작하기 전에 반드시 해결해야 했던 **콘텐츠 손실 문제** 두
가지를 여기서 정면으로 처리한다.

1. Observer의 direct text는 200자 cap이 있다 → 긴 문단이 잘린 채로 IR에 들어간다.
2. `dom.json`은 element별 direct text 문자열 하나만 갖는다 →
   `<p>Hello <strong>world</strong> !</p>`의 **자식 순서를 복원할 수 없다.**

---

## Pipeline Position

```
URL
↓
Firecrawl Discovery              (pnpm recon)
↓
Playwright Verification          (pnpm verify)
↓
Page Family / Representative     (pnpm select)
↓
Responsive Deep Observation      (pnpm observe:site)
↓
Interaction Candidate Detection  (pnpm detect:interactions)
↓
Safe Interaction Exploration     (pnpm explore:interactions)
↓
Interaction Pattern Modeling     (pnpm model:interactions)
↓
[이번 Task] SiteSpec Compiler    (pnpm compile:sitespec)
↓
Task 14 Next.js Reconstruction Engine
```

**Offline deterministic processing.** Playwright 0 · Firecrawl 0 · network 0 ·
AI 0 · asset download 0. 새 사이트 방문 없음. 기존 artifact는 read-only.

---

## SiteSpec Definition

SiteSpec은 **Browser-observable website reconstruction IR**이다.

아닌 것을 먼저 못박는다:

| 아님 | 이유 |
|---|---|
| HTML dump | `rendered.html`은 **입력**이고, SiteSpec 디렉터리에 복사되지 않는다 |
| React model | `ReactComponent` / `NextPage` / props / hook — schema에 존재하지 않음 |
| Tailwind / CSS model | browser-computed style만 담는다. class name도 utility도 없음 |
| Next.js model | route 파일도, framework convention도 없음 |

Schema 어휘는 전부 브라우저 어휘다: element, text node, computed style, asset,
viewport, route, family. 그래서 Task 14가 React를 만들든 다른 renderer가 생기든
SiteSpec 자체는 바뀌지 않는다.

Family를 `componentId`로 바꾸지 않았다(item 19). Family는 *URL 집합에 대한 진술*이고
component는 *render tree에 대한 주장*이다. 둘을 섞는 순간, 정직한 grouping이 날조된
아키텍처가 된다.

---

## Architecture

```
src/sitespec/
  types.ts                 zod schemas + limitation vocabulary + attribute policy
  load-inputs.ts           Task 12→11→09→08/07→06 provenance chain + cross-validation
  content-tree.ts          rendered.html 재파싱 + Observer와 동일한 traversal + alignment
  safe-attributes.ts       reconstruction attribute policy + IDREF relation 추출
  style-catalog.ts         site-wide exact-equality computed-style dedup
  asset-catalog.ts         site-wide asset dedup + inline-SVG sanitization
  compile-viewport.ts      ONE viewport → node tree (element + text node)
  compile-page.ts          ONE page → PageSpec (desktop + mobile)
  compile-routes.ts        verified URL 전체 → RouteSpec + 2축 coverage
  compile-families.ts      Task 07/08 family 보존
  compile-interactions.ts  Task 12 behavior를 node tree에 join
  compile-site.ts          orchestration + catalog id resolution + stats
  validate-sitespec.ts     referential invariants (producer AND consumer 공용)
  summarize.ts             deterministic 보고 수치
  store.ts                 site-specs/ 독립 namespace
  load-sitespec.ts         Task 14 consumer API (root 밖으로 못 나감)
  index.ts                 barrel export

src/cli-compile-sitespec.ts   CLI (pnpm compile:sitespec)
scripts/smoke-sitespec.ts     fixture test (168 checks)
```

신규 의존성 **하나**: `parse5` 8.0.1 (pure HTML5 parser). 브라우저를 띄우지 않고
`rendered.html`을 파싱하기 위한 것이며, import graph에 playwright/firecrawl/HTTP
client/AI SDK는 없다 (§118에서 자동 검사).

---

## Input Provenance

CLI 인자는 **하나**다.

```bash
pnpm compile:sitespec data/<host>/interaction-models/<run-id>/interaction-patterns.json
```

컴파일러가 provenance를 거꾸로 따라간다:

```
interaction-patterns.json                            (Task 12)
 ├─ unknown-interactions.json  ← 구조적 sibling      (Task 12)
 └─ sourceExploration → interaction-exploration.json (Task 11)
      └─ sourceSiteObservation → site-observation.json          (Task 09)
           ├─ sourceSelectedPagesFile → selected-pages.json     (Task 07)
           │    └─ sourceVerifiedUrlsFile → verified-urls.json  (Task 06)
           └─ sourcePageFamiliesFile  → page-families.json      (Task 08)
```

**현재 provenance만으로 충분한가?** — 확인했다. 4개 실제 사이트 전부, 기록된 경로만
따라가서 Task 06까지 도달한다. 그래서 `--site-observation`은 **필수 인자가 아니라
relocation용 override**로만 존재한다(실제 run에서는 한 번도 필요하지 않았다).

기록된 경로는 CWD 기준 → 참조한 artifact 디렉터리 기준 → 그 상위 6단계 순으로
탐색하므로, `data/` 트리를 통째로 옮겨도 동작한다.

모든 파일은 **각 Task 자신의 zod schema**로 파싱한다(로컬 재선언 금지). 그 위에
seam마다 cross-check가 붙는다: `rootUrl` 일치, patterns/unknowns가 같은 Task 11 run에서
나왔는지, `verifiedUrlCount` 일치, Task 12가 참조하는 pageId가 이 Task 09 run에 있는지.
서로 무관한 두 run을 합치면 완벽하게 validate되는 완전한 헛소리가 나오기 때문이다.

**AI artifact는 자동 소비하지 않는다.** `ai-analysis.json`이 소비 대상 두 파일 바로
옆에 있어도 무시한다. `--ai-analysis <path>`로 명시했을 때만 읽는다 (§5, §64 참고).

---

## Output Structure

```
data/<host>/site-specs/<run-id>/
  site-spec.json          routes · families · page index · responsive model · stats
  style-catalog.json      site 전역 dedup된 computed style (styleTokenId)
  asset-catalog.json      site 전역 dedup된 asset reference (assetId)
  interaction-spec.json   verified pattern · unknown case · (opt-in) inference
  pages/
    p000001.json          desktop + mobile node tree
    p000002.json
    ...
```

Task 08–12 artifact는 **한 바이트도 수정되지 않는다** (§119에서 SHA-256으로 검증).
`rendered.html`은 입력으로만 쓰고 SiteSpec에 복사하지 않는다 (§116). 스크린샷도 마찬가지.

---

## Self-contained Reconstruction Contract

```
loadSiteSpec(site-spec.json)
  → site-spec.json
  → 같은 디렉터리 안의 style-catalog / asset-catalog / interaction-spec / pages/*
  → 끝. 그 밖은 열지 않는다.
```

`site-spec.json.source`는 Task 06–12 run 경로를 **audit용으로만** 기록한다.
`loadSiteSpec()`은 그 경로를 절대 열지 않는다. 즉:

```
sourceRef  ≠  runtime dependency
```

이 성질은 fixture에서 **입력 트리를 전부 삭제한 뒤 로드**하는 방식으로 검증한다
(§96). reconstruction data 전체 validation PASS.

경로 안전성(§74):
- 내부 file reference는 전부 상대경로, `\` 없음, `..` 세그먼트 없음
- loader가 resolve 후 root 밖이면 거부
- `source.*`와 `page.sourceObservation`도 절대경로 금지 — 로드 시 CWD 기준 상대경로로
  정규화해서 기록하므로, 사용자가 절대경로를 넘겨도 artifact에는 남지 않는다

---

## Route Model

```ts
RouteSpec {
  routeId                 // r000001…, normalized URL lexical order
  url, pathname
  familyId

  coverage                // exact-observed | validation-sample-observed | family-represented
  pageId?                 // 이 URL 자신의 PageSpec (관측된 경우만)
  renderSourcePageId?     // 재구성 source PageSpec
  observedOnThisExactUrl  // 절대 추정하지 않음

  behaviorCoverage        // exact-verified | exact-not-explored
                          // | family-represented-unverified | none
  behaviorSourcePageId?

  verificationSummary?    // httpStatus / title / canonicalUrl (Task 06)
  limitations[]
}
```

**축이 두 개인 것이 이 Task의 정직성 전부다.**

- `coverage` — 이 URL을 실제로 브라우저에서 열어봤는가
- `behaviorCoverage` — 이 URL에서 실제로 인터랙션을 검증했는가

`/blog/post-17`을 한 번도 로드하지 않았다면 `family-represented`이고,
`/blog/post-3`의 PageSpec으로 재구성하되 **observed라고 말하지 않는다**.
representative의 confirmed pattern을 이 URL에서 verified라고 복제하지도 않는다(§66).
클릭 한 번을 40개의 주장으로 바꾸는 일이기 때문이다.

Validation sample은 자기 관측을 쓴다(§16). representative fallback보다 자기 자신의
직접 관측이 항상 더 강한 증거다. 반대로 unobserved member의 fallback은 **반드시
representative**이고, validation sample이 fallback source가 되는 일은 없다(§88).

---

## Route Coverage

Task 08 verified URL 전체가 route table에 **정확히 한 번씩** 나타난다. 하드코딩
없이 `verified-urls.json`에서 읽는다.

| site | verified | routes | 중복 | 누락 |
|---|---:|---:|---:|---:|
| domainchecker.co.kr | 19 | 19 | 0 | 0 |
| seoworld.co.kr | 30 | 30 | 0 | 0 |
| nextjs.org | 40 | 40 | 0 | 0 |
| developer.mozilla.org | 23 | 23 | 0 | 0 |
| **합계** | **112** | **112** | **0** | **0** |

`verified route set == SiteSpec route set` invariant는 compile 시점에 양방향으로
검사한다(consumer는 SiteSpec 밖을 못 읽으므로 이 검사는 producer 전용).

---

## Family Model

```ts
FamilySpec {
  familyId, familyType
  representativeUrl, representativePageId?
  observedVariantPageIds[]
  memberUrls[], memberCount
  exactObservedMemberCount, representedOnlyMemberCount
  localePrefix?, routeScope?, inferredRoutePattern?
  selectionEvidence?      // Task 08의 coarse-signal trace, 원문 그대로
  limitations[]
}
```

Task 08 semantics를 그대로 보존한다. 재계산하지 않고, member/representative/coarse
evidence 문자열을 그대로 옮긴 뒤 arithmetic만 더한다.

| site | families | 관측된 representative | 최대 family 크기 |
|---|---:|---:|---:|
| domainchecker | 4 | 4 | 11 |
| seoworld | 16 | 16 | 9 |
| nextjs | 12 | 12 | 9 |
| MDN | 9 | 9 | 9 |
| **합계** | **41** | **41** | — |

Invariant: 모든 member URL은 정확히 한 family에 속하고, 모든 route의 `familyId`가
그 family의 member 목록과 일치한다.

---

## PageSpec

Task 09에서 **성공한 deep observation 전부**가 PageSpec이 된다 — representative와
validation-sample을 구분 없이(§20). validation sample은 열등한 관측이 아니라 실제 URL의
완전한 desktop+mobile deep observation이고, 버리면 일부 route의 유일한 직접 증거가
사라진다.

```ts
PageSpec {
  schemaVersion, pageId, url
  role, familyId, familyType
  observedAt?             // Observer 자신의 timestamp (관측 사실, compiler 시계 아님)
  sourceObservation       // AUDIT 전용

  documentMetadata { requestedUrl, finalUrl, title }
  viewports { desktop, mobile }

  interactionCoverage     // explored | not-explored
  patternIds[], unknownInteractionIds[]
  inferredInteractionIds? // --ai-analysis 있을 때만
  limitations[]
}
```

`interactionCoverage: not-explored`는 **coverage gap의 진술**이지 "이 페이지는 정적"
이라는 주장이 아니다(§65). Task 11은 52개 deep-observed 페이지를 전부 탐색하지 않았고,
그 차이를 숨기지 않는다: 45 explored / 7 not-explored.

| site | PageSpec | representative | validation | explored | not-explored |
|---|---:|---:|---:|---:|---:|
| domainchecker | 6 | 4 | 2 | 5 | 1 |
| seoworld | 19 | 16 | 3 | 16 | 3 |
| nextjs | 15 | 12 | 3 | 14 | 1 |
| MDN | 12 | 9 | 3 | 10 | 2 |
| **합계** | **52** | **41** | **11** | **45** | **7** |

---

## Viewport Model

```ts
ViewportPageSpec {
  profile                 // Task 05 profile 원문
  documentDimensions
  contentRecovery
  rootNodeIds[]
  nodes[]                 // flat, document order, parent/child는 nodeId로
  sourceElementCount, elementNodeCount, textNodeCount
  localVisibleCount, effectiveVisibleCount
  styleTokenCount
  assetRefs[]
  frameInventory[], shadowInventory
  limitations[]
}
```

Desktop과 mobile은 **완전히 독립적인 두 번의 컴파일**이고 global catalog 외에는 아무
것도 공유하지 않는다. 어떤 node도 다른 viewport의 node와 "같은 element"라고 주장하지
않는다(§22, §70). 실제로 nextjs는 desktop 43,600 / mobile 43,591 element로 다르게
렌더된다 — 억지 매칭은 IR의 첫 번째 거짓말이 됐을 것이다.

---

## Content Tree

SiteSpec DOM은 element-only tree가 아니다. text node를 명시적으로 표현한다.

```ts
SpecNode = ElementSpecNode | TextSpecNode

TextSpecNode  { nodeId, type:"text", parentNodeId, value }

ElementSpecNode {
  nodeId, type:"element"
  sourceElementId         // provenance / interaction join key
  parentNodeId?, childNodeIds[]     // document child order 그대로
  tagName, attributes, role?, sourceHtmlId?
  localVisible, effectiveVisible, boundingBox?
  styleTokenId?, pseudo?
  assetRefs[], relations[]
  sourceHasFormAction?    // diagnostic boolean only
  limitations[]
}
```

Node id는 viewport 안에서 `n000001…`로 document order 기준 결정적으로 부여한다.
Observer의 `e000123`은 **재사용하지 않고** `sourceElementId`라는 별도 필드로 보존한다
(§34). Observer 번호는 하나의 저장된 `dom.json`에 대한 인덱스라서 element 하나만
늘어도 이후 전부가 밀린다 — renderer가 그 위에 identity를 세우면 안 된다.

---

## rendered.html Content Recovery

`dom.json`은 구조/style/geometry의 source of truth로 유지한다(§25). `rendered.html`은
**보조 관측 채널**로만 쓴다: full text node 값과 mixed-content child ordering.

두 채널은 **같은 트리라는 것이 증명될 때만** 합쳐진다.

---

## Mixed Content Ordering

실제 사이트에서 확인한 결과(§104 manual review):

```
nextjs /blog/next-15  p000003/desktop  n000115
<p>T("Next.js 15 is officially stable and ready for production. This release
     builds on the updates from both ")
   <a>T("RC1")</a>
   T(" and ")
   <a>T("RC2")</a>
   T(". We've focused heavily on stability while adding some exciting updates…")
</p>

nextjs  n000199
<li><a><strong>T("Caching Semantics (Breaking):")</strong></a>
    T(" ")<code>T("fetch")</code>T(" requests, ")<code>T("GET")</code>
    T(" Route Handlers, and client navigations are no longer cached by default.")</li>

MDN /en-US/  p000001/desktop  n000062
<p>T("\n                        ")<a>T("HTML: Markup language")</a>T("\n                      ")</p>

seoworld  n000186
<p>T("웹 트래픽이")<br></br>T("자연 검색에서 발생")</p>

domainchecker  n000117
<span><svg></svg>T("2026년 7월 15일")</span>
```

`dom.json`만으로는 이 중 **어느 것도** 복원할 수 없었다. 인라인 `<code>`, `<br>`
분할, 아이콘+텍스트 span, 한국어 본문까지 순서가 정확하다.

---

## Text Truncation Recovery

| site | 200자 cap에 걸린 element | 전체 복원됨 | 최장 복원 텍스트 |
|---|---:|---:|---:|
| domainchecker | 10 | 10 | 250자 |
| seoworld | 30 | 30 | 287자 |
| nextjs | 200 | 194 | **4,234자** |
| MDN | 86 | 86 | 592자 |
| **합계** | **326** | **320** | — |

nextjs의 200 vs 194 차이는 실패가 아니다. 나머지 6개는 normalize 후 **정확히 200자**인
element다 — cap에 닿았을 뿐 잘리지 않았으므로 복원할 것이 없다. 지표가 부정확한 게
아니라 정밀한 것이다(`cappedSourceTextCount`는 `length >= 200`,
`recoveredLongTextCount`는 실제로 더 길어진 경우만 센다).

가장 극적인 사례: nextjs 문단 하나가 dom.json에서 200자 → SiteSpec에서 4,234자.

---

## Alignment Validation

`rendered.html` 파싱 트리를 **Observer와 동일한 traversal semantics**로 걷는다.
소스에서 직접 재사용한 것:

- `SKIP_TAGS` 상수를 그대로 import (SCRIPT, STYLE, NOSCRIPT, TEMPLATE, HEAD, META,
  LINK, TITLE, BASE) — 재선언하지 않음
- `el.tagName` 대문자 규칙 재현: HTML namespace만 대문자, foreign content
  (`svg`, `clipPath`, `foreignObject`)는 원형 유지. 그래서 SVG namespace의
  `<title>`/`<style>`은 Observer가 skip하지 않았듯 여기서도 skip하지 않는다
- inline SVG root는 opaque — 기록하고 subtree로 내려가지 않음
- element children만 순회 (comment/doctype은 버림)

검증 항목: **element count + tag sequence + parent relation** 세 가지 전부 일치해야
`aligned`다. parent 비교가 이걸 sequence 우연이 아닌 **구조적** 검사로 만든다 — 서로
다른 두 트리가 같은 tag 리스트로 평탄화될 수 있기 때문이다.

| site | viewport | aligned | fallback |
|---|---:|---:|---:|
| domainchecker | 12 | 12 | 0 |
| seoworld | 38 | 38 | 0 |
| nextjs | 30 | 30 | 0 |
| MDN | 24 | 24 | 0 |
| **합계** | **104** | **104** | **0** |

104/104. Observer traversal 재현이 정확하다는 강한 증거다.

## Alignment Mismatch

fuzzy match는 하지 않는다. 잘못된 element에 붙은 text node는 없는 text node보다 나쁘다.

```
contentRecovery {
  status: "aligned" | "fallback"
  source: "rendered-html" | "dom-json"
  failure?: no-document-element | element-count-mismatch | tag-sequence-mismatch
          | parent-relation-mismatch | parse-error | rendered-html-unreadable
  mismatchIndex?, mismatchDetail?    // "parsed=div source=span" — DOM dump 아님
  textNodeCount, cappedSourceTextCount, recoveredLongTextCount, longestTextLength
}
```

fallback이면 트리는 여전히 만들어진다 — `dom.json`만으로, normalized text를 **선행
text node 하나**로 붙이고 `mixed-content-order-not-recovered` +
`text-may-be-truncated` + `content-recovery-fallback` limitation을 기록한다.
조용히 실패하는 경로는 없다. fixture(§84)에서 의도적 불일치 페이지로 검증했고,
정렬된 페이지와 fallback 페이지가 한 SiteSpec 안에 공존하는 것도 확인했다.

---

## Safe Attributes

원본 attribute를 전부 복사하지 않는다. **남기는 것이 곧 클론이 렌더할 것**이기 때문에
모든 필드가 정책 결정이다.

**보존** — 모든 `aria-*` + `role`, `alt`, `title`, `href`, `target`, `rel`, `name`,
`type`, `placeholder`, `value`, `for`, `lang`, `dir`, `tabindex`, `width`, `height`,
`loading`, `controls`, `draggable`

**제외**

| 제외 대상 | 이유 |
|---|---|
| `class`, `style` | computed style이 style catalog에 있다. source class는 framework 흔적 |
| 모든 `data-*` | 임의적/framework-specific, 종종 payload(id·token·직렬화 state) |
| 모든 `on*` | script source. Observer도 애초에 기록하지 않았다 |
| `src`/`srcset`/`sizes`/`poster` | asset relation으로 표현 |
| `javascript:` href | href를 쓴 script source |
| password/hidden/file `value` | 공개 시각 상태가 아니고 항상 노출 위험 |
| `id` | `sourceHtmlId`로 이동 — identity가 아니라 hint (§40) |

**관측 자체가 없는 것**: `colspan` / `rowspan` / `scope`는 Observer whitelist에
없어서 컴파일할 데이터가 없다. 조용히 무시하지 않고
`table-cell-attributes-not-observed` limitation으로 기록한다.

실제 4개 사이트 스캔 결과: `on*` attribute 0, `class`/`style` 0, `data-*` 0,
`javascript:` href 0, `<script>` element 0, 절대 filesystem 경로 0.

> nextjs/MDN의 `<script>` 문자열 매치는 전부 **text node 내용**이다 — MDN 문서 본문에
> 리터럴 `<script>`가 나오고, nextjs 블로그에 "Less Client-Side JavaScript:"가 나온다.
> 그건 페이지 콘텐츠지 소스 코드가 아니며, IR이 보존해야 하는 것이 맞다.

---

## Form Safety

클론이 원본 백엔드로 write하는 사고를 막는다.

- form `action` URL은 IR **어디에도** 저장하지 않는다
- `<form>` element에 `sourceHasFormAction: true` **boolean만** diagnostic으로 남긴다
- `form-action-not-compiled` limitation을 붙인다

nextjs의 form 2개(desktop/mobile 합쳐 30개 노드 인스턴스)에서 `sourceHasFormAction:
true`가 기록되고, artifact 전체에 `"action"` 키는 **0개**다.

Observer가 `action`을 저장하지 않으므로 원래 정보가 없었다는 점도 짚어둔다 — boolean은
정렬 성공한 viewport에서 파싱 트리를 통해 얻는다(값이 아니라 존재 여부만).

---

## Node Relations

viewport-local resolution만 한다(§42). desktop id가 mobile element로 resolve되는 일은
구조적으로 불가능하다 — 각 viewport의 index가 분리돼 있다.

```ts
NodeRelation { type, sourceValue, resolved, resolvedNodeId? }
```

type: `aria-controls` · `aria-labelledby` · `aria-describedby` · `aria-owns` ·
`label-for` · `href-fragment`

`aria-controls` 같은 IDREF **리스트**는 토큰마다 relation 하나를 만든다. 같은 HTML id가
두 번 나오면 ambiguous로 처리해 resolve하지 않는다(잘못된 노드에 붙이는 것보다 낫다).

미해결은 정상이다: nextjs의 `aria-controls="dynamic-menu"`는 static DOM에 대상이
없으므로 `resolved: false`로 보존된다 — 그 자체가 Task 14가 알아야 할 사실이다.

---

## Global Style Catalog

Task 09는 style을 **page + viewport local**로 dedup한다. observation run에는 맞는
scope지만 site IR에는 틀린 scope다: 같은 버튼 스타일이 모든 페이지의 desktop 테이블에
한 번, mobile 테이블에 또 한 번 저장된다.

```json
{
  "schemaVersion": 1,
  "tokenCount": 4485,
  "sourceStyleReferenceCount": 89499,
  "sourceLocalStyleRecordCount": 16619,
  "dedupReductionRate": 0.7301,
  "styles": [{ "styleTokenId": "st000001", "properties": {...}, "usageCount": 3 }],
  "frequency": { "color": [...], "backgroundColor": [...], "fontFamily": [...], "fontSize": [...] }
}
```

## Style Deduplication

**정확한 canonical equality만** 쓴다. property 정렬 후 직렬화, 완전 일치만 병합.
similarity threshold 없음 — threshold는 실험복 입은 per-site tuning이고, IR의 fidelity가
어느 사이트에서 컴파일했느냐에 따라 달라지게 만든다(§44).

id는 canonical string 전체 집합의 **lexical sort 후** 부여한다(§45). 그래서 `st000001`은
사이트의 성질이지 입력 순서의 성질이 아니다.

| site | source local records | style references | global tokens | dedup |
|---|---:|---:|---:|---:|
| domainchecker | 3,182 | 6,856 | 1,628 | 48.8% |
| seoworld | 4,359 | 9,446 | 2,232 | 48.8% |
| nextjs | 16,619 | 89,499 | 4,485 | **73.0%** |
| MDN | 8,235 | 47,386 | 3,329 | 59.6% |
| **합계** | **32,395** | **153,187** | **11,674** | — |

Tailwind utility / CSS class name / `primary-color` 같은 semantic token으로 변환하지
않는다(§48, §49). IR truth는 정확한 computed style이다. `frequency` 블록은
**diagnostic**이며 값을 세기만 하고 이름을 붙이지 않는다.

Dangling style token 0. 모든 element node가 catalog에 존재하는 token을 참조한다.

---

## Asset Catalog

Reference IR이다. 이미지/폰트/비디오/아이콘 **바이너리는 하나도 다운로드하지 않는다**(§52).

Canonical key = `kind + url + descriptor`. srcset의 `2x`와 `640w`는 서로 다른
reconstruction 입력이므로 descriptor가 identity의 일부다.

| site | occurrences | unique | kinds |
|---|---:|---:|---|
| domainchecker | 862 | 166 | font 7 · icon 5 · image 33 · image-srcset 81 · inline-svg 40 |
| seoworld | 5,400 | 267 | font 124 · icon 2 · image 39 · image-srcset 79 · inline-svg 23 |
| nextjs | 5,708 | 277 | background-image 1 · font 56 · icon 1 · image 60 · image-srcset 79 · inline-svg 78 · video 2 |
| MDN | 590 | 34 | background-image 4 · font 13 · icon 3 · image 6 · inline-svg 4 · mask-image 4 |
| **합계** | **12,560** | **744** | — |

Element 연결은 **source가 `elementId`를 줄 때만** 한다(§53). 억지 URL 매칭으로 element에
붙이지 않고, 그런 asset(font, icon)은 viewport-level `assetRefs`에만 남는다.

**Inline SVG.** URL이 없으므로 markup 자체가 asset이다. Task 04 schema가 이미 "UNTRUSTED
page content"라고 적어 뒀고, 이 컴파일러가 그걸 렌더할 무언가에게 처음 넘기는 단계이므로
무장해제도 여기서 한다(§54): 재파싱 → `<script>` element 제거, 모든 `on*` handler 제거,
모든 `javascript:` URL 제거 → 재직렬화. 무엇을 제거했는지 asset마다 기록한다.

실제 4개 사이트의 inline SVG 145개(unique)에는 script도 handler도 없었다
(`sanitized: false`). fixture에서는 `<script>` + `onload` + `javascript:` href를 모두 담은
SVG로 제거 경로를 검증했다. Dedup 효과는 크다: nextjs 4,836 occurrence → 78 unique.

---

## Frames / Shadow Inventory

| site | iframe | open shadow host |
|---|---:|---:|
| domainchecker | 0 | 12 |
| seoworld | 0 | 38 |
| nextjs | 0 | 30 |
| MDN | 0 | **672** |

iframe 내부는 들어가지 않았고 shadow root 내용은 관측되지 않았다. inventory만 보존하고
`frame-content-not-observed` / `shadow-content-not-observed` limitation을 붙인다.
Task 14가 원본 iframe을 그대로 embed한다고 가정하지 않는다.

---

## Responsive Model

```json
{
  "mode": "observed-endpoints",
  "observedViewports": [ {desktop 1440×900 …}, {mobile 390×844 …} ],
  "inferredBreakpoints": [],
  "limitations": ["breakpoints-not-inferred", "cross-viewport-node-matching-not-performed"]
}
```

관측 사실은 **두 endpoint뿐**이다. 768px이나 1024px을 넣지 않는다 — 이 Task가 측정한 적
없는 값은 측정한 값과 구분할 수 없게 된다(§69). `inferredBreakpoints`는 나중에 renderer가
자기 추론을 놓을 자리로 남겨 두되, 그건 **renderer의 주장**이지 IR의 관측이 아니다.
Validator가 `inferredBreakpoints.length > 0`을 위반으로 잡는다.

Diagnostic으로 페이지별 desktop/mobile 수치 비교(`responsiveDifferences`)를 제공하지만
**semantic node correspondence는 주장하지 않는다** — 배열에 `nodeId`는 등장하지 않는다.

---

## Verified Interaction Import

이 단계의 가치는 필드 하나에 있다: **`triggerNodeId`**.
Task 12는 `p000003/desktop`의 `e000809`가 native-details disclosure임을 안다. Task 14에는
`e000809`가 없고 SiteSpec 트리가 있다. join이 없으면 behavior model과 structure model은
같이 쓸 수 없는 두 파일이다.

그래서 **resolve 실패는 fail-fast**다(§59, §90). 붙일 노드가 없는 pattern은 없는 것보다
나쁘다 — generator가 조용히 버리거나 그럴듯한 곳에 붙일 것이고, 두 경우 모두 SiteSpec의
interaction 수치를 거짓말로 만든다.

```ts
CompiledPattern {
  patternId, patternType, subtype?, mechanism
  pageId, viewport
  triggerNodeId (필수), triggerSourceElementId, trigger{tagName,role?,inputType?,text?}
  transition { direction?, field, before, after }
  target?
  sourceLimitations[]     // Task 12의 free-text limitation 원문 보존
  limitations[]           // SiteSpec 자신의 limitation code
  provenance { level:"derived", ruleId, ruleVersion, registryVersion,
               actionId, explorationRun, observationFile }
}
```

Target resolution:
- `details` relation → 트리에서 trigger의 최근접 `<details>` 조상 (id 불필요)
- `targetDomId` → viewport 안에서 `sourceHtmlId`로 조회 (중복 id는 ambiguous 처리)

| site | patterns | trigger resolved | static target | dynamic target | target 선언 없음 |
|---|---:|---:|---:|---:|---:|
| domainchecker | 13 | 13 | 8 | 0 | 5 |
| seoworld | 7 | 7 | 2 | 0 | 5 |
| nextjs | 45 | 45 | 8 | 9 | 28 |
| MDN | 33 | 33 | 23 | 0 | 10 |
| **합계** | **98** | **98** | **41** | **9** | **48** |

Task 12 총계 98과 **정확히 일치**한다(41+9+48 = 98).

Rule provenance도 IR에 들어간다 — pattern을 만든 rule만 `interaction-spec.json.rules[]`에
id/version/description/requiredEvidence/compiledPatternCount와 함께 남는다.

---

## Dynamic Interaction Targets

Task 11에서 클릭 **후에만** 마운트된 target은 static PageSpec tree에 억지로 넣지 않는다.
초기 DOM에 없었기 때문이다.

```json
"target": {
  "relation": "aria-controls",
  "targetSourceHtmlId": "radix-:R…:",
  "staticNodeResolved": false,
  "dynamic": true,
  "observedTag": "div",
  "observedRole": "menu",
  "transition": "mounted",
  "existedBefore": false,
  "existsAfter": true,
  "descendantsSummary": { "interactiveDescendantsAfter": 3 }
},
"limitations": ["dynamic-target-not-in-static-dom"]
```

Generator는 여기서 정확히 두 가지를 배운다: (1) 여기에 새 DOM subtree를 만들어야 한다,
(2) **그 안에 무엇이 있는지는 관측된 바 없다.** 없는 구조를 만들어내지 않는다.

nextjs 9건 전부 이 형태다. 그리고 `sourceHtmlId === "dynamic-menu"`류의 노드가 static
tree에 삽입되지 않았음을 fixture가 검사한다(§60).

---

## Unknown Interaction Preservation

Task 12의 UnknownInteractionCase 63건을 **하나도 버리지 않고, 하나도 승격하지 않고**
그대로 옮긴다.

```ts
CompiledUnknownInteraction {
  unknownId, reason, status
  pageId, viewport
  triggerNodeId?, triggerSourceElementId, trigger{tagName,role?,inputType?,label?}
  diffCategories[], mutationCategories[], partialPatternHints[]
  aiEligibility, aiEligibilityReason, preferredProbeState?
  navigation?
  limitations[], provenance
}
```

| site | unknown | reasons |
|---|---:|---|
| domainchecker | 10 | navigation-tainted 5 · style-only-change 5 |
| seoworld | 16 | **unmatched-transition 16** |
| nextjs | 35 | already-in-target-state 33 · execution-error 1 · opaque-action 1 |
| MDN | 2 | blocked-navigation 2 |
| **합계** | **63** | — |

Task 12 총계 63과 정확히 일치. trigger node는 63/63 resolve(다만 unknown의 trigger
resolve는 fail-fast가 아니라 optional — 못 찾으면 `trigger-node-unresolved` limitation).

**seoworld hamburger 16건 검수(§109).** `unmatched-transition` 16건이 그대로 unknown으로
남아 있고, `menu` pattern으로 승격된 것은 **0건**이다. 이 케이스들의 trigger label은
`"메뉴 열기"`다 — 컴파일러가 그 label을 읽고 "아 메뉴네" 하고 다시 추론하면 Task 12의
정직한 공백이 이 Task의 추측으로 바뀐다. fixture에도 같은 함정(`label: "메뉴 열기"`)을
심어 두고 승격되지 않음을 검사한다.

---

## AI Inference Boundary

기본값: **AI inference 0.**

`ai-analysis.json`이 소비 대상 두 파일 바로 옆에 있어도 자동으로 읽지 않는다. Task 12
검증 run이 `provider: "fake"` artifact를 정확히 그 디렉터리에 쓰기 때문이다 — 자동 흡수는
날조된 behavior를 production IR에 넣는 일이다.

`--ai-analysis <path>`로 명시했을 때만:
- 결과는 `inferredInteractions[]` **전용 namespace**로 들어간다
- `verifiedPatterns[]`와 **절대** 합쳐지지 않는다
- `provenance.level: "inferred"` 유지
- `provenanceSummary.hasAiInference`가 true로 바뀌고 `inferredFactCount`가 채워진다

fixture(§93)는 "확신에 차 있고, 형식이 완벽하고, 틀린" AI 답변(`type: "menu"`,
`confidence: "high"`)을 심어 두고 (1) 기본 컴파일에서 inferred 0, (2) 명시 opt-in에서
inferred namespace에만 들어가고 unknown은 여전히 `unmatched-transition`임을 검사한다.

Validator도 `hasAiInference === false`인데 `inferredInteractions`가 비어 있지 않으면
위반으로 잡는다.

---

## Fixture Tests

`pnpm smoke:sitespec` — **168 checks, 전부 PASS.**

HTTP 서버 없음, Playwright 없음, 네트워크 없음, AI 없음. fixture는 임시 디렉터리에
Task 06→12 전체 체인을 **각 Task의 실제 zod schema로** 써 넣는다 — 그래서 fixture가
실제로는 불가능한 파이프라인 상태를 기술할 수 없다.

**`dom.json`을 손으로 썼다.** fixture HTML에서 컴파일러 자신의 traversal로 생성했다면
alignment 검사가 자기 자신을 검사하는 꼴이 된다. 손으로 쓴 element 목록은 "Task 03/04
Observer라면 이렇게 기록했을 것"이라는 독립적 진술이고, skip policy나 inline-SVG 규칙이
어긋나면 진짜 실패로 나타난다.

커버리지:

| 항목 | 검사 내용 |
|---|---|
| §79 mixed content | `<p>Hello <strong>world</strong> !</p>` → text/element/text 정확 |
| §80 long text | 250자 문단이 200자 cap을 넘어 **전문** 복원 |
| §81 pre whitespace | `line 1\n    line 2\n` 원형 보존 |
| §82 SVG opaque | root 1노드, subtree 0, `<circle>`/`<g>`/`<rect>` 누출 없음, alignment 유지 |
| §82 SVG sanitize | `<script>` + `onload` + `javascript:` 제거, geometry 생존, clean SVG는 sanitized=false |
| §83 noise exclusion | head/meta/title/style/script/link/noscript/template 전부 부재 |
| §84 alignment fallback | 의도적 불일치 → fuzzy merge 금지, status=fallback, 3개 limitation, aligned 페이지와 공존 |
| §87 route coverage | 6 route, `/a` exact / `/a2` validation / `/a3`·`/a4` represented |
| §88 representative fallback | `/a3` → p000002(representative), validation sample은 fallback source 아님 |
| §16 validation override | `/a2` → 자기 PageSpec p000003 |
| §66 behavior coverage | represented route는 representative의 pattern을 자기 것으로 주장하지 않음 |
| §85 style dedup | 2 page × 2 viewport의 동일 style → token 1개 |
| §86 style determinism | canonical key가 property 순서 무시 |
| §50–53 asset | URL dedup, usageCount, sourcePageIds, mimeHint, sameOrigin, srcset descriptor, element 연결 |
| §94 safe attributes | class/data-*/onclick/style/`javascript:` href/password·hidden value 제거 확인 + 시크릿 문자열 전역 부재 |
| §38 form safety | action endpoint 부재, boolean만 존재, limitation 기록 |
| §95 relations | aria-controls/aria-labelledby/label-for/href-fragment resolve + 미해결 보존 |
| §89 interaction join | pattern trigger `e000012` → node id |
| §90 missing trigger | 존재하지 않는 sourceElementId → **fail-fast**, 에러 메시지에 id 포함 |
| §91 dynamic target | staticNodeResolved=false, dynamic=true, 노드 삽입 없음, pattern 보존 |
| §92 unknown | `unmatched-transition` 유지, `"메뉴 열기"` label에 속지 않음 |
| §93 fake AI | 기본 0건, 명시 opt-in 시 inferred namespace만 |
| §96 self-contained | **입력 트리 전체 삭제 후** loadSiteSpec + 전체 invariant PASS |
| §74 path traversal | `../escape.json` 거부, `/etc/passwd` 거부 |
| §98 Zod round-trip | 저장 전 parse + 저장 후 read+parse |
| §97 determinism | 동일 입력 2회 byte-identical + 입력 배열 역순 시 logical 동일 |
| §119 immutability | 컴파일 전후 fixture 소스 트리의 size+mtime 동일 |
| §118 offline | import graph에 playwright/firecrawl/HTTP/AI SDK 없음, 서드파티는 `parse5,zod`뿐 |
| §76–78 | framework 개념·원본 CSS·원본 JS 부재 |
| §100 | provenance ledger + limitation glossary |

---

## domainchecker Results

```
routes 19 (exact 4 · validation 2 · represented 13)
families 4 · PageSpec 6 (representative 4 / validation 2)
viewport 12/12 aligned · element 3,329+3,329 · text 2,637+2,637
visible 5,727 / hidden 931
style 3,182 local → 1,628 tokens (48.8%)
asset 862 → 166 unique
pattern 13 (disclosure 13) · unknown 10 · shadow host 12 · iframe 0
storage 11.31 MB · compile 657 ms
```

**§113 hamburger 검수.** `aria-expanded` disclosure 5건: trigger node 5/5 resolve.
declared target이 없으므로 `target` 필드가 없고 `interaction-target-not-declared`
limitation이 5건 모두에 유지된다. 나머지 8건은 native-details로 `<details>` target이
resolve된다.

---

## seoworld Results

```
routes 30 (exact 16 · validation 3 · represented 11)
families 16 · PageSpec 19 (representative 16 / validation 3)
viewport 38/38 aligned · element 4,594+4,594 · text 2,683+2,683
visible 8,468 / hidden 720
style 4,359 local → 2,232 tokens (48.8%)
asset 5,400 → 267 unique
pattern 7 (disclosure 2 · selection 2 · dismiss 3) · unknown 16 · shadow host 38
storage 15.25 MB · compile 928 ms
```

**§109 unmatched hamburger 검수.** `unmatched-transition` 16건 전부 unknown으로 보존.
`menu` pattern 0건. trigger node 16/16 resolve. label `"메뉴 열기"`.

---

## nextjs Results

```
routes 40 (exact 12 · validation 3 · represented 25)
families 12 · PageSpec 15 (representative 12 / validation 3)
viewport 30/30 aligned · element 43,600+43,591 · text 21,480+21,480
visible 41,356 / hidden 45,835
style 16,619 local → 4,485 tokens (73.0%)
asset 5,708 → 277 unique (inline-svg 4,836 occurrence → 78 unique)
pattern 45 (selection 28 · menu 9 · tabs 6 · disclosure 2) · unknown 35 · shadow host 30
storage 82.83 MB · compile 4,965 ms
```

**§110 dynamic menu 검수.** menu 9건: pattern type `menu` (subtype `listbox`) 유지,
trigger node 9/9 resolve, dynamic target 9/9 (`staticNodeResolved: false`,
`dynamic: true`, `transition: "mounted"`, `descendantsSummary` 보존).

**§111 tabs 검수.** tabs 6건: trigger 6/6 resolve, **target 6/6 static resolve**.
생성된 `aria-controls` id의 drift가 컴파일 실패 원인이 되지 않았다 — 해당 run에서는
저장된 DOM에 같은 id가 존재했고, 만약 없었다면 `declared-target-not-in-static-dom`
limitation과 함께 pattern은 그대로 보존됐을 것이다.

Desktop 43,600 vs mobile 43,591 — 유일하게 두 viewport의 element 수가 다른 사이트다.

---

## MDN Results

```
routes 23 (exact 9 · validation 3 · represented 11)
families 9 · PageSpec 12 (representative 9 / validation 3)
viewport 24/24 aligned · element 22,668+22,668 · text 16,387+16,387
visible 22,079 / hidden 23,257
style 8,235 local → 3,329 tokens (59.6%)
asset 590 → 34 unique
pattern 33 (disclosure 33) · unknown 2 · shadow host 672
storage 47.84 MB · compile 2,449 ms
```

**§112 details 검수.** `native-details` 13건 전부에서 trigger가 `<summary>` node,
target이 `<details>` node로 연결됨 — **13/13**. 나머지 20건은 `aria-expanded`
mechanism으로 10건이 `aria-controls` target까지 resolve된다.

---

## Route / Observation Coverage

| site | Route coverage | Exact observation | Family represented | Interaction explored | Verified behavior | Unknown |
|---|---:|---:|---:|---:|---:|---:|
| domainchecker | **100%** (19/19) | 6/19 (31.6%) | 13/19 | 5 pages | 5 routes | 10 |
| seoworld | **100%** (30/30) | 19/30 (63.3%) | 11/30 | 16 pages | 16 routes | 16 |
| nextjs | **100%** (40/40) | 15/40 (37.5%) | 25/40 | 14 pages | 14 routes | 35 |
| MDN | **100%** (23/23) | 12/23 (52.2%) | 11/23 | 10 pages | 10 routes | 2 |
| **합계** | **100%** (112/112) | **52/112 (46.4%)** | **60/112** | **45 pages** | **45 routes** | **63** |

두 숫자를 혼동하면 안 된다. **Route coverage는 구조적으로 100%** — 모든 verified URL이
table에 있다. **Exact observation coverage는 46.4%** — 실제로 브라우저에서 연 URL의 비율.
하나로 합치면 46% 관측된 사이트가 완전해 보인다.

Behavior 축도 별도다: 45 route가 exact-verified, 60 route가
`family-represented-unverified`(대표의 증거를 빌려 쓰되 자기 것이라 주장하지 않음),
7 route가 `exact-not-explored`.

---

## Content Recovery Results

| site | viewports | aligned | fallback | mismatch | text nodes | cap 걸림 | 전문 복원 | 최장 |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| domainchecker | 12 | 12 | 0 | 0 | 5,274 | 10 | 10 | 250 |
| seoworld | 38 | 38 | 0 | 0 | 5,366 | 30 | 30 | 287 |
| nextjs | 30 | 30 | 0 | 0 | 42,960 | 200 | 194 | 4,234 |
| MDN | 24 | 24 | 0 | 0 | 32,774 | 86 | 86 | 592 |
| **합계** | **104** | **104** | **0** | **0** | **86,374** | **326** | **320** | — |

---

## Style Results

| site | local records | references | global tokens | dedup | styleToken 참조 노드 | dangling |
|---|---:|---:|---:|---:|---:|---:|
| domainchecker | 3,182 | 6,856 | 1,628 | 48.8% | 6,658 | 0 |
| seoworld | 4,359 | 9,446 | 2,232 | 48.8% | 9,188 | 0 |
| nextjs | 16,619 | 89,499 | 4,485 | 73.0% | 87,191 | 0 |
| MDN | 8,235 | 47,386 | 3,329 | 59.6% | 45,336 | 0 |

모든 element node가 style token을 갖는다(validator가 없는 경우를 위반으로 잡음).
Pseudo element(`::before`/`::after`) style도 같은 global catalog를 쓴다.

---

## Asset Results

| site | occurrences | unique | image | image-srcset | inline-svg | font | icon | 기타 |
|---|---:|---:|---:|---:|---:|---:|---:|---|
| domainchecker | 862 | 166 | 33 | 81 | 40 | 7 | 5 | — |
| seoworld | 5,400 | 267 | 39 | 79 | 23 | 124 | 2 | — |
| nextjs | 5,708 | 277 | 60 | 79 | 78 | 56 | 1 | background-image 1 · video 2 |
| MDN | 590 | 34 | 6 | — | 4 | 13 | 3 | background-image 4 · mask-image 4 |

Inline SVG sanitization 결과: 실제 4개 사이트에서 제거 대상 **0건**(script/handler/
javascript: URL 없음). fixture에서 제거 경로 검증 완료.

---

## Interaction Results

| site | patterns | unknowns | trigger resolved | static target | dynamic target | target 없음 | explored | not explored |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| domainchecker | 13 | 10 | 13 | 8 | 0 | 5 | 5 | 1 |
| seoworld | 7 | 16 | 7 | 2 | 0 | 5 | 16 | 3 |
| nextjs | 45 | 35 | 45 | 8 | 9 | 28 | 14 | 1 |
| MDN | 33 | 2 | 33 | 23 | 0 | 10 | 10 | 2 |
| **합계** | **98** | **63** | **98** | **41** | **9** | **48** | **45** | **7** |

Task 12 총계와 **exact accounting**: confirmed pattern 98/98, unknown 63/63.
pattern id 중복 0, unknown id 중복 0, orphan 0.

---

## Storage

| site | site-spec | style-catalog | asset-catalog | interaction-spec | pages/ | **총계** | Task 09 총계 | 비율 | Task 09 JSON+HTML | 비율 |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| domainchecker | 26.5 KB | 5.39 MB | 76.8 KB | 29.4 KB | 5.79 MB | **11.31 MB** | 57.67 MB | 20% | 14.76 MB | 77% |
| seoworld | 46.1 KB | 7.37 MB | 141.1 KB | 24.6 KB | 7.68 MB | **15.25 MB** | 68.03 MB | 22% | 20.75 MB | 74% |
| nextjs | 50.7 KB | 13.87 MB | 186.9 KB | 96.8 KB | 68.63 MB | **82.83 MB** | 149.81 MB | 55% | 109.01 MB | 76% |
| MDN | 39.0 KB | 9.54 MB | 22.9 KB | 46.4 KB | 38.20 MB | **47.84 MB** | 75.34 MB | 64% | 46.07 MB | 104% |
| **합계** | — | — | — | — | — | **157.23 MB** | 350.85 MB | **45%** | 190.59 MB | 82% |

정직한 해석: **Task 09 전체 대비 45%** (스크린샷 168 MB와 rendered.html을 복제하지 않으므로
당연히 작아진다). 그런데 **Task 09의 JSON+HTML만 놓고 보면 82%**이고, MDN은 104%로 오히려
약간 크다. 이유는 명확하다.

- **더한 것**: text node 86,374개(dom.json에는 존재하지 않던 데이터), node별
  relations/limitations/assetRefs, route table 112개, interaction spec
- **뺀 것**: 스크린샷 전부, rendered.html 전부, links.json 전부, style local record의
  49–73%

즉 SiteSpec은 "관측 run을 압축한 것"이 아니라 **재구성에 필요한 것만 남기고 없던 것을
채운 것**이다. Element당 `boundingBox`(8필드)와 2-space indent가 pages/의 부피 대부분을
차지하므로, 압축 인코딩(indent 제거)만으로 약 2배 축소가 가능하다 — schema 변경 없이
나중에 할 수 있는 일이라 이번에는 가독성을 택했다.

---

## Performance

| site | verified routes | PageSpec | element nodes | text nodes | compile |
|---|---:|---:|---:|---:|---:|
| domainchecker | 19 | 6 | 6,658 | 5,274 | 657 ms |
| seoworld | 30 | 19 | 9,188 | 5,366 | 928 ms |
| nextjs | 40 | 15 | 87,191 | 42,960 | 4,965 ms |
| MDN | 23 | 12 | 45,336 | 32,774 | 2,449 ms |

브라우저 없는 offline compile이다. 측정된 elapsed는 CLI 전체(입력 로드 + 컴파일 +
invariant 검증 + 저장 + **consumer 경로로 재로드 + 재검증**)를 포함한다.

---

## Determinism

SiteSpec artifact body에 `generatedAt` / 현재 시각 / random UUID는 **없다**. run
디렉터리 이름에만 timestamp를 쓴다. 소스의 observation timestamp는 이미 관측된 사실이므로
보존한다(`PageSpec.observedAt`).

결정성의 근거:
- style token id — 전체 canonical string 집합의 lexical sort
- asset id — 전체 canonical key 집합의 lexical sort
- route id — normalized URL lexical sort
- node id — content tree document order
- 모든 배열은 결정적 기준으로 정렬(pattern/unknown id, page id, family id, url)

검증:
- fixture: 동일 입력 2회 → **byte-identical**
- fixture: 입력 배열(routes/families/members/assets/styles/patterns/unknowns) 역순 →
  logical 출력 동일(디렉터리명이 다르므로 audit provenance 문자열만 차이)
- **실제 4개 사이트: 각각 2회 컴파일 → `diff -r` byte-identical**

---

## Existing Artifact Immutability

Task 06–12 artifact 전체(4개 사이트, `site-specs/` 제외)의 SHA-256 트리 해시를
컴파일 전후로 비교:

```
before: 21bc32a21e6a65f4203ba64b8e7296525821809bcfeffff08f64b5d5eccbaf08
after:  21bc32a21e6a65f4203ba64b8e7296525821809bcfeffff08f64b5d5eccbaf08
```

변경 0. `store.ts`가 구조적으로 `data/<host>/site-specs/` 밖의 경로를 만들 수 없다.
fixture도 size+mtime 스냅샷으로 같은 성질을 검사한다.

---

## Reconstruction Readiness

1. **Verified URL 전체가 SiteSpec route table에 있는가?**
   예. 112/112, 중복 0, 누락 0. compile 시점에 양방향 집합 비교로 검증.

2. **Deep Observation되지 않은 route가 observed로 잘못 표시된 사례가 0인가?**
   0건. `observedOnThisExactUrl`은 자기 PageSpec 존재 여부에서만 나오고, validator가
   `observedOnThisExactUrl === (pageId !== undefined)`와
   `coverage === "family-represented" → pageId 없음`을 강제한다. 60개
   family-represented route 전부 `route-not-deeply-observed` limitation을 가진다.

3. **Validation sample route가 자기 PageSpec을 사용하는가?**
   예. 11개 validation route 전부 `renderSourcePageId === 자기 pageId`.
   fixture에서 `/a2 → p000003`(representative p000002 아님)으로 검증.

4. **Desktop/mobile DOM을 semantic하게 억지 merge하지 않았는가?**
   하지 않았다. 두 viewport는 독립 컴파일이고 node 대응 주장이 없다.
   `responsiveDifferences`는 수치만 담고 `nodeId`를 포함하지 않는다.
   `cross-viewport-node-matching-not-performed` limitation을 모든 PageSpec에 기록.

5. **Mixed text order가 보존되는가?**
   예. 104/104 viewport에서 rendered.html 정렬 성공 →
   `childNodeIds`가 document child order를 그대로 표현. 4개 사이트 수동 검토 완료.

6. **200-char Observer text cap 문제가 해결됐는가?**
   해결됐다. 326건 중 320건 전문 복원(나머지 6건은 정확히 200자라 잘린 적 없음).
   최장 복원 4,234자.

7. **Content recovery alignment 실패는 몇 viewport인가?**
   **0 viewport** (104/104 aligned). fallback 경로는 fixture로 검증했다.

8. **모든 PageSpec node가 style token을 올바르게 참조하는가?**
   예. dangling 0. element node에 style token이 없으면 validator가 위반으로 잡는다.
   Pseudo element style도 동일 catalog 참조.

9. **Source local styles가 global catalog로 얼마나 줄었는가?**
   32,395 → 11,674 (사이트별 48.8% / 48.8% / 73.0% / 59.6%).

10. **Assets가 Task 14가 소비 가능한 reference로 보존됐는가?**
    예. 12,560 occurrence → 744 unique. kind/url/descriptor/mimeHint/sameOrigin/
    dimension/usageCount/sourcePageIds. element 연결은 source가 elementId를 줄 때만.
    inline SVG는 sanitize된 self-contained markup으로 보존. dangling assetRef 0.

11. **98 Task 12 confirmed pattern이 모두 정확히 account되는가?**
    예. 98/98 컴파일, trigger 98/98 resolve, id 중복 0. 실제 소스 총계 사용.

12. **63 unknown interaction이 모두 보존되는가?**
    예. 63/63. reason/status/diffCategories/partialPatternHints/aiEligibility/
    preferredProbeState 전부 보존.

13. **seoworld unmatched hamburger가 menu로 잘못 승격되지 않았는가?**
    승격 0건. 16건 전부 `unmatched-transition`. seoworld의 `menu` pattern 총 0개.

14. **Dynamic targets가 initial DOM에 억지 삽입되지 않았는가?**
    삽입 0. 9건 전부 `staticNodeResolved: false` + `dynamic: true` +
    `dynamic-target-not-in-static-dom` limitation. 없는 subtree를 만들지 않았다.

15. **Task 14가 SiteSpec root 밖 파일을 읽지 않고 reconstruction data 전체를 load할 수
    있는가?**
    예. `loadSiteSpec()`은 root 안만 읽고, 모든 내부 참조를 상대·`..` 없음·root 내부로
    증명한 뒤 연다. fixture는 **입력 트리를 전부 삭제한 뒤** 로드해서 전체 invariant
    PASS를 확인한다.

16. **SiteSpec에 original JS/event handler source가 없는가?**
    없다. `on*` attribute 0, `javascript:` href 0, `<script>` element 0, inline SVG의
    script 제거. (문서 본문에 리터럴 `<script>` 텍스트가 나오는 것은 페이지 콘텐츠다.)

17. **원본 form backend endpoint로 write 가능한 정보가 reconstruction semantics에
    들어가지 않았는가?**
    없다. artifact 전체에 form `action` 값 0건. boolean diagnostic만 존재.

18. **Absolute local filesystem path가 0인가?**
    0. 내부 file reference·`source.*`·`page.sourceObservation` 전부 CWD 기준 상대경로.
    validator가 절대경로를 위반으로 잡고, loader도 거부한다.

19. **같은 input 재컴파일 결과가 byte-identical인가?**
    예. 실제 4개 사이트 각각 2회 컴파일 후 `diff -r` 일치. fixture도 동일 검증 +
    입력 배열 역순 불변성.

20. **Task 14를 시작하기에 blocking missing data가 있는가?**
    **없다.** Blocking은 아니지만 Task 14가 알아야 할 알려진 공백:
    - 9건의 dynamic menu target 내부 구조는 관측된 적 없음 → generator가 region을
      만들되 내용을 지어내면 안 됨
    - 7개 page는 interaction 미탐색 → pattern 부재는 coverage gap이지 정적이라는 뜻 아님
    - `colspan`/`rowspan`/`scope`는 Observer whitelist에 없어 관측 자체가 없음
    - iframe 내부와 shadow root 내용(MDN 672 host)은 미관측
    - breakpoint는 없음(관측된 두 endpoint뿐) — 추론은 Task 14의 몫

---

## Problems Encountered

**1. rendered.html 정렬이 실제로 될지 알 수 없었다.**
`page.content()`는 DOM walk 직후에 캡처되지만 그 사이에 JS가 DOM을 바꿀 수 있다. 구현
전에 4개 사이트 104 viewport 전부에 대해 프로토타입 정렬 검사를 돌려 104/104를 확인한
뒤에 설계를 확정했다. 실패했다면 fallback 경로가 주 경로가 되는 훨씬 나쁜 Task가 됐을
것이다.

**2. Observer traversal semantics를 문서가 아니라 소스에서 재현해야 했다.**
특히 두 가지가 미묘했다: (a) `skip.has(el.tagName)`은 **대문자** 집합과 비교하므로
SVG namespace의 `<title>`/`<style>`은 skip되지 않는다 — parse5에서 `namespaceURI`를 보고
HTML namespace만 대문자화해야 재현된다. (b) inline SVG root는 기록하고 subtree로 내려가지
않는다. 둘 중 하나만 틀려도 SVG를 가진 모든 페이지가 fallback이 됐을 것이다.
`SKIP_TAGS`는 재선언하지 않고 Observer에서 import했다.

**3. Style/asset id는 전체 집합을 알기 전에는 부여할 수 없다.**
lexical sort 후 번호를 매기는데, 페이지를 하나씩 컴파일하는 동안에는 최종 집합을 모른다.
node에 canonical key를 임시로 기록하고 마지막에 한 번에 치환하는 2-phase로 풀었다.
치환 누락은 dangling reference invariant가 잡으므로 조용히 새어 나갈 수 없다.

**4. Task 12 pattern target에는 element id가 없다.**
`targetDomId`(HTML id)만 있다. viewport 안에서 `sourceHtmlId`로 조회하되, `details`
relation은 id가 아예 없어서 트리에서 `<summary>`의 `<details>` 조상을 찾는 별도 경로가
필요했다. MDN 13건이 이 경로를 탄다.

**5. `cappedSourceTextCount`와 `recoveredLongTextCount`의 차이.**
처음엔 둘이 같아야 한다고 생각했는데 nextjs에서 200 vs 194가 나왔다. 조사 결과 정확히
200자인(=잘리지 않은) element 6개였다. 지표를 느슨하게 고치는 대신 정의를 정밀하게 두고
보고서에 설명하는 쪽을 택했다.

**6. Fixture를 컴파일러로 만들면 안 된다.**
fixture HTML에서 `dom.json`을 컴파일러의 walk로 생성하면 alignment 검사가 자기 자신을
검사한다. 23개 element를 손으로 써서 독립적 기대값으로 만들었다.

---

## Technical Decisions

**parse5를 추가했다.** repo에 HTML parser가 없었고, Chromium이 직렬화한 문서라도
`<template>` content, raw text element, foreign content 같은 규칙이 있어 손으로 짠 파서는
위험하다. Playwright로 브라우저를 띄우는 것은 금지 사항이자 과잉이다. `parse5`는 순수
파서이고 import graph에 네트워크가 없다(자동 검사).

**`dom.json`이 구조의 truth, `rendered.html`은 텍스트/순서 전용.** 정렬이 성공해도
attribute를 파싱 트리에서 가져오지 않는다(§25 정책 준수). 예외는 `sourceHasFormAction`
boolean 하나 — 값이 아니라 존재 여부이고, 그것이 §38이 명시적으로 허용하는 diagnostic이다.

**Limitation을 closed enum으로.** free text는 diff도 count도 branch도 불가능하다.
28개 코드 + `LIMITATION_MESSAGES` 문장 테이블을 두고, 실제 사용된 코드만
`limitationGlossary`로 artifact에 embed한다 — 소스 없이도 artifact가 자기를 설명한다.
Task 12의 free-text limitation은 paraphrase하지 않고 `sourceLimitations`에 원문 보존.

**Trigger는 fail-fast, target은 아님.** 붙일 노드 없는 behavior는 generator에게 무의미하다.
반면 target 부재는 정상 관측 결과(dynamic mount)다. 이 비대칭이 §59/§60의 요구이자
실제 데이터가 요구하는 모양이다.

**Node id와 sourceElementId 분리.** Observer 번호는 저장된 하나의 `dom.json`에 대한
인덱스다. identity로 쓰면 element 하나만 추가돼도 전부 밀린다. `sourceElementId`는
provenance와 interaction join 전용 필드로만 남긴다.

**Inline SVG를 항상 재파싱·재직렬화.** 제거할 것이 없어도 그렇게 한다. 그래야 저장된
markup이 "정규식이 보기에 무해했던 문자열"이 아니라 "이 코드가 걸어본 HTML5 파서의
출력"임이 보장된다.

**Attribute는 `dom.json`에서, 500자 cap 인지.** 값이 cap에 닿으면
`attribute-value-may-be-truncated`를 붙인다. 조용히 잘린 값을 넘기지 않는다.

**Empty array를 생략하지 않았다.** pages/의 8% 정도를 아낄 수 있었지만, 쓰기와
parse 결과가 달라지는 미묘함이 생긴다. 완전성과 균일성을 택했다.

**verification.json은 읽지 않는다.** 필요한 데이터(httpStatus/title/canonicalUrl)는
`verified-urls.json`에 전부 있다. 경로만 provenance로 기록해 불필요한 I/O와 결합을 피했다.

---

## Current Limitations

1. **Storage.** pages/가 부피의 대부분이고, element당 `boundingBox`(8필드)와 2-space
   indent가 그 대부분이다. MDN은 Task 09의 JSON+HTML보다 4% 크다. 압축 인코딩으로 약 2배
   축소 가능하지만 schema 변경이 아니라 인코딩 선택이므로 나중에 해도 된다.

2. **`colspan` / `rowspan` / `scope` 미관측.** Observer whitelist에 없다. 표를 가진 페이지는
   `table-cell-attributes-not-observed` limitation을 받는다. 고치려면 Task 03/04 whitelist를
   넓히고 재관측해야 한다.

3. **Dynamic target 내부 구조 미관측.** 9건. Task 11이 마운트된 region의 DOM을 저장하지
   않았으므로(descendant 인구조사만) SiteSpec도 가질 수 없다.

4. **Shadow DOM / iframe 내용 미관측.** MDN 672 shadow host는 inventory만 있다.

5. **7개 page interaction 미탐색.** Task 11의 예산 정책 결과. SiteSpec은 이를 숨기지 않고
   `not-explored`로 표시한다.

6. **Text node의 `normalizedValue`를 채우지 않는다.** schema에는 optional로 있으나
   compiler는 raw만 기록한다 — normalize는 한 줄짜리 변환이고, 같은 문자열을 두 번
   저장하면 텍스트 용량이 두 배가 된다.

7. **Alignment는 전부 아니면 전무.** viewport 하나가 어긋나면 그 viewport 전체가
   fallback이다. 부분 정렬(예: `<body>` 서브트리만)은 구현하지 않았다 — 실제 데이터에서
   0건이었으므로 없는 문제를 위한 복잡도가 된다.

8. **Route는 verified URL 집합에 종속.** Task 06이 못 찾은 URL은 여기에도 없다.

---

## Next Task Recommendation

### Task 14 — Next.js Reconstruction Engine

```
SiteSpec directory only
        ↓
Next.js / React / TypeScript implementation
```

입력은 `site-spec.json`과 그 옆의 artifact뿐이다. Task 09 `dom.json`, Task 11 action
파일, Task 12 pattern 파일을 열면 그건 Task 13의 버그(컴파일 누락)이지 Task 14의
자유가 아니다.

Task 14가 소유하는 추론(이번 Task가 의도적으로 하지 않은 것):

- **Responsive breakpoint** — IR은 관측된 두 endpoint와 빈 `inferredBreakpoints`만 준다
- **Desktop/mobile node 대응** — 초기엔 두 variant를 조건부 렌더하고 QA에서 다듬는 방식 권장
- **Dynamic interaction target의 내용** — region은 만들되 안을 지어내면 안 됨
- **Component 추출 / shared header·footer 검출** — family는 component가 아니다

시작점으로 유용한 것들:
- `routes[]`의 `renderSourcePageId`가 각 URL의 재구성 소스를 이미 지정한다
- `styleTokenId` → `style-catalog.json`이 CSS 생성에 필요한 computed style을 전부 담는다
- `interaction-spec.json`의 `triggerNodeId`가 behavior를 붙일 노드를 직접 가리킨다
- `limitationGlossary`가 각 한계를 사람 문장으로 설명한다

동시에 재검토할 가치가 있는 것(Task 12 보고서에서 이어짐): Task 11의 shape-representative
규칙(nextjs `already-in-target-state` 33건의 원인, `preferredProbeState`에 해법이 이미
기록됨), seoworld 16건 unmatched transition의 원인인 container-inventory selector.

---

## Changed Files

**신규**

```
src/sitespec/types.ts
src/sitespec/load-inputs.ts
src/sitespec/content-tree.ts
src/sitespec/safe-attributes.ts
src/sitespec/style-catalog.ts
src/sitespec/asset-catalog.ts
src/sitespec/compile-viewport.ts
src/sitespec/compile-page.ts
src/sitespec/compile-routes.ts
src/sitespec/compile-families.ts
src/sitespec/compile-interactions.ts
src/sitespec/compile-site.ts
src/sitespec/validate-sitespec.ts
src/sitespec/summarize.ts
src/sitespec/store.ts
src/sitespec/load-sitespec.ts
src/sitespec/index.ts
src/cli-compile-sitespec.ts
scripts/smoke-sitespec.ts
docs/result/13-sitespec-compiler-2026-08-14.md
```

**수정**

```
package.json     compile:sitespec / smoke:sitespec script, parse5 dependency
pnpm-lock.yaml   parse5 8.0.1 (+ entities)
README.md        pipeline, SiteSpec consumer contract, usage, project structure
ROADMAP.md       Task 13 완료, Phase 8 완료, Phase 9(Task 14) 권고
```

**Task 08–12 artifact: 수정 0** (SHA-256 트리 해시로 검증).

---

## Reviewer Checklist

- [x] `pnpm typecheck` PASS
- [x] `pnpm smoke:verifier` PASS (81/81)
- [x] `pnpm smoke:selector` PASS (81/81)
- [x] `pnpm smoke:multi-observer` PASS (58/58)
- [x] `pnpm smoke:interaction-detector` PASS (92/92)
- [x] `pnpm smoke:interaction-explorer` PASS (95/95)
- [x] `pnpm smoke:interaction-patterns` PASS (88/88)
- [x] `pnpm smoke:sitespec` PASS (168/168)
- [x] Playwright 0 · Firecrawl 0 · network 0 · AI 0 · asset download 0 (import graph 자동 검사)
- [x] 4개 실제 사이트 SiteSpec compile PASS
- [x] verified route coverage 100% (112/112), 중복 0, 누락 0
- [x] family coverage invariant PASS (41 family, member 중복 0)
- [x] Task 09 성공 page 52/52 컴파일
- [x] desktop/mobile 독립 — cross-viewport matching 0
- [x] mixed-content text ordering PASS (104/104 viewport, 4개 사이트 수동 검토)
- [x] long-text recovery PASS (326 중 320, 최장 4,234자)
- [x] alignment validation PASS (104/104 aligned, mismatch 0)
- [x] alignment failure fallback PASS (fixture)
- [x] global style catalog PASS (32,395 → 11,674), dangling 0
- [x] asset catalog PASS (12,560 → 744), dangling 0
- [x] safe attribute policy PASS (class/style/data-*/on*/javascript: 0)
- [x] form endpoint safety PASS (action 값 0건)
- [x] node relation resolution PASS (viewport-local)
- [x] confirmed pattern accounting exact (98/98)
- [x] unknown interaction accounting exact (63/63)
- [x] interaction trigger node resolution PASS (98/98), missing → fail-fast
- [x] dynamic target preservation PASS (9건, 노드 삽입 0)
- [x] unknown → pattern 우발 승격 0 (seoworld 16건 유지)
- [x] fake AI 자동 흡수 0
- [x] self-contained consumer PASS (소스 삭제 후 로드)
- [x] SiteSpec root escape 0 (`..`·절대경로 거부)
- [x] original JavaScript source 0
- [x] absolute filesystem path 0
- [x] Task 08–12 artifact mutation 0 (SHA-256)
- [x] 동일 input byte-identical PASS (실제 4개 사이트 + fixture)
- [x] README / ROADMAP 반영
- [x] 보고서 생성
