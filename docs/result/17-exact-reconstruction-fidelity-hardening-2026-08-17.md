Task: 17
Title: Exact Reconstruction Fidelity Hardening
Previous: 16-manual-visual-review-2026-08-17.md
Status: Complete

# Task 17 — Exact Reconstruction Fidelity Hardening

Task 16의 Manual Visual Review가 자동 QA의 관측 경계 밖에서 찾아낸 결함들을
**일반 규칙으로** 수정한다. Stripe selector / class / route 조건은 코드 어디에도
없다 — Stripe는 재현·검증 대상일 뿐이다. Git add / commit / push 0회.

**최종 검증 run** (이 보고서의 모든 Stripe 수치는 하나의 fresh E2E에서 나온다):

```
pnpm e2e:reconstruct https://stripe.com/ --max-urls 20 --concurrency 2 --auto-fix
  → data/stripe.com/e2e-runs/2026-08-17T14-40-16-120Z/e2e-manifest.json
  → final reconstruction data/stripe.com/reconstructions/2026-08-17T14-45-10-699Z
  → QA data/stripe.com/reconstruction-qa/2026-08-17T14-45-14-014Z
finalStatus: complete-with-known-limitations · Firecrawl 1 call · AI 0
```

한 문장 요약:

> **홈페이지가 있고** (`inputRoot* 4/4 true`), **메뉴가 실제로 열리며**
> (user-visible target 17 equivalent / 3 mismatch / 5 not-declared — Task 16의
> 정직한 수치는 2/28였다), **1920/2048에서도 가운데가 가운데다**
> (centered container worst drift 480–608px → **0px**). hydration 0 ·
> runtime error 0 · content exact 1.0은 그대로다.

## Problem

Manual Visual Review(2026-08-17)가 확정한 문제 정의:

| # | 발견 | 자동 QA 수치 | 실제 |
| --- | --- | --- | --- |
| A | **root homepage 부재** | `routeCheck 19/19 rendered` | 그 19개에 `/`가 없다. Firecrawl Map이 root를 반환하지 않았고, candidate set이 `discovery.links`와 동일하게 정의되어 있었다 |
| B | **responsive/layout rule 손실** | truth viewport에서 근접 | 1920px에서 원본은 centered, clone은 left-biased. computed pixel만 재구성해 `max-width` / `margin:auto`의 의미가 소실 |
| C | **interaction user-visible target 손실** | `behaviorEquivalent 28/28` | 사용자에게 보이는 after-state가 올바른 것은 2/28 (둘 다 native `<details>`). scripted 26개 중 0개 |
| D | **SVG internal paint** | `styleMismatched 481/4,110,264` | 햄버거가 검은 사각형 — 이번 Task에서는 수정하지 않고 known limitation으로 유지 |

## Root URL Fix

**Candidate set의 정의를 바꿨다**: `candidates = normalize(discovery.links ∪ inputRootUrl)`.

- `buildDiscoveryResult()`가 provider 링크 처리 후, normalize된 root가 집합에
  없으면 **seed**한다 (`src/discovery/build-result.ts`). normalization / dedup /
  same-site는 기존 deterministic 규칙 그대로 — seed도 `normalizeUrl()`을
  통과한다. redirect 처리도 기존 verification 규칙 그대로다.
- Discovery schema **v1 → v2**: `rootSeeded: boolean` (optional). 기존 v1
  artifact는 reader union으로 계속 읽힌다. provider 카운터
  (raw/duplicate/invalid/externalFiltered)는 **provider 링크만** 설명하고,
  seed된 결과는 `links.length === normalizedCount + 1`로 구분된다.
- E2E manifest coverage에 4개 상태를 명시적으로 기록:
  `inputRootIncluded` / `inputRootVerified` / `inputRootSelectedOrRepresented` /
  `inputRootReconstructed`. root의 redirect까지 추적한다 (verified entry의
  final URL 또는 sourceCandidateUrls 중 하나가 normalize된 root와 일치).
- **Invariant**: `classifyFinalStatus()`에 새 분기 — root가 verification을
  통과한 valid page인데 reconstruction route set에 없으면 finalStatus는
  `partial`이 되고 절대 `complete`가 될 수 없다.

Synthetic fixture (smoke:e2e):

- offline — provider가 `/a`, `/b`만 반환 → 결과는 **root + /a + /b** (3 links,
  `rootSeeded: true`, provider 카운터 invariant 유지). root가 이미 있으면 seed
  없음. trailing-slash 없는 입력도 normalize되어 seed.
- live — fixture provider가 **의도적으로 root를 빼고** 5개 URL만 반환하는
  상태로 전체 파이프라인을 돌린다 (stripe 결함의 정확한 재현). discovery가
  seed하고(`rootSeeded: 1` warning 포함), root는 verification → selection →
  observation → reconstruction까지 흘러 `inputRoot*` 4개 필드가 전부 true.
- finalStatus 표 — `inputRootVerified && !inputRootReconstructed` → `partial`.

## Behavior Metric Redefinition

`behaviorEquivalent` 하나가 두 질문에 같은 이름으로 답하던 것을 분리했다.
**기존 역사 artifact는 수정하지 않았다** — QA schema v1 → **v2**에서만 적용되고
reader는 두 버전을 모두 받는다.

```
triggerStateEquivalence        aria-expanded / aria-selected / open / checked /
                               selected 등 선언된 transition state 비교
                               (Task 16의 "behaviorEquivalent"가 실제로 잰 것)

userVisibleTargetEquivalence   target이 존재하고, 원본과 같은 방향으로
                               visible/hidden/mounted/unmounted 되었는지,
                               content fingerprint까지 비교
```

- `compareBehavior()`가 두 축을 분리해서 반환한다: `triggerState`
  (equivalent/mismatch/source-drifted/unverifiable)와 `visibleTarget`
  (equivalent/**mismatch**/**not-observed**/**not-declared**/source-drifted/
  unverifiable). target evidence가 없는 경우 **절대 equivalent로 간주하지
  않는다**: 모델에 target이 아예 없으면 `not-declared`, 있는데 비교 가능한
  증거가 한 건도 없으면 `not-observed`.
- 기존 combined `verdict`는 두 축을 합친 값으로 유지되어 correction loop의
  regression gate가 전과 같은 것을 재측정한다 — 단 이제 observed-target 축이
  gate에도 포함된다 (re-verdict 경로도 동일 축으로 재생).
- 발행 지표: QA summary가 `triggerStateEquivalent/Mismatch` +
  `visibleTargetEquivalent/Mismatch/NotObserved/NotDeclared`를 따로 내고, E2E
  coverage에 `triggerState*` / `userVisibleTarget*`이 올라간다. 새 diff
  classification `interaction-visible-target-mismatch`가 추가되어 "속성은
  바뀌었는데 화면이 안 바뀐" 것이 trigger 지표 안에 숨을 수 없다.

## Interaction Target Observation

Explorer에 **generic user-visible target discovery**를 추가했다
(`src/interaction-explorer/discover-targets.ts`, exploration schema v2 → **v3**).

동작:

1. **클릭 전** — bounded baseline walk (Observer의 SKIP_TAGS / svg-opaque
   정책과 동일한 walk, 최대 12,000 elements). 각 element의 존재 · visibility ·
   rect · display를 참조와 함께 페이지에 park.
2. **클릭 후** (같은 document일 때만 — URL이 바뀌면 Task 11의 규칙대로 어떤
   diff도 target evidence가 되지 않는다) — 같은 walk를 다시 돌려 diff:
   - `hidden → visible`이 된 **topmost** root들 (appeared)
   - baseline에 없던 **newly-mounted** subtree root들
   - baseline 자식을 잃고 mounted 자식을 얻은 채 visible을 유지한 host
     (**content-replaced** — tab panel의 in-place 교체 signature)
   - `visible → hidden`이 된 root들 (disappeared)
3. **Relationship evidence** — trigger의 `aria-controls` / `popovertarget` /
   `<summary>`→`<details>` / `href="#id"`가 가리키는 element가 변화 후보와
   일치하면 declared evidence로 부착. 선언이 없어도 observed evidence
   (visibility-change / newly-mounted-subtree / subtree-mutation /
   bounding-box-appearance)로 발견된다 — stripe mega-menu가 정확히 이 경우다.
4. **Deterministic ranking** — declared 우선, 그다음 visible 면적, 그다음
   structural path 사전순. 상한 5개 (`MAX_DISCOVERED_TARGETS`), 초과는 count로
   기록.
5. 선택된 각 target에 저장: target descriptor (tag / htmlId / role /
   **structural path** — Observer tree shape 위의 element-child index 경로),
   relationship evidence, before state, after state (display / visibility /
   opacity / hidden / aria-hidden / boundingBox), content fingerprint
   (normalized text 400자 sample + 전체 길이), geometry, provenance
   (`observed`), 그리고 **bounded after-state subtree capture** — Task 16이
   만든 `captureDynamicTargetSubtree` (Observer 자신의 walk, 300 elements /
   depth 12 / 20,000 chars) 재사용.

네 가지 kind:

| kind | 의미 | clone에서의 처리 |
| --- | --- | --- |
| `existing-visibility` | 기존 DOM region의 visibility만 전환 | 같은 region을 reveal/hide |
| `existing-with-mounted-content` | 기존 (hidden) region이 열리며 자식이 mount됨 | reveal + 관측된 after-state subtree를 mount |
| `content-replaced` | visible한 host의 내용이 제자리 교체 (tab panel) | 관측된 subtree로 교체 mount |
| `newly-mounted` | region 자체가 클릭으로 생성 | 기존 bounded dynamic template mechanism 재사용 |

Pattern modeling(Task 12)은 **rule을 하나도 바꾸지 않고** carriage만 한다:
pattern instance (schema v1 → **v2**)에 `observedTargets`가 실리고, 어떤 rule도
이 데이터를 읽지 않는다.

**Stripe 실측** (최종 exploration run): 실행된 55 action 전부에서 discovery가
돌았고 (skip 0), 39 action에서 **79개의 user-visible target region**이
발견됐다 — existing-visibility 58 · newly-mounted 16 · content-replaced 4 ·
existing-with-mounted-content 1, **79개 전부 bounded open-state capture
동반**. Task 16에서 25/28 pattern이 `interaction-target-not-declared`였던
바로 그 지점이다.

## Interaction Reconstruction

SiteSpec (schema v3, compiler v3) → Reconstruction 전달:

- `CompiledPattern.observedTargets` — 각 discovered target을 static tree에
  join: **html id 우선, 실패 시 exact structural path** (경로가 정확히 일치하고
  종단 tag까지 같아야 resolve; 유사도 점수 없음). 미해결 pre-existing region은
  `observed-target-not-in-static-dom` limitation. open/closed state와
  fingerprint, 그리고 content가 필요한 kind에는 dynamicTemplate
  (`patternId|discoveryId` 키)이 실린다.
- **Open-state style graft** — reveal의 핵심. stripe는 mega-menu를 root의
  `display`가 아니라 **안쪽 wrapper들의 style** (height 0 / visibility /
  transform)로 숨긴다. root만 reveal하면 1264×**0**으로 열리는 것을 실측으로
  확인했다. explorer의 bounded open-state capture는 같은 region의 **열린 상태
  walk**이므로, SiteSpec compile에서 captured element들을 static subtree에
  재귀 tag/순서 정합으로 align하고, style token이 **다른** descendant마다
  `openStyleOverrides` (closed token + open token 쌍)를 기록한다. 렌더러는 두
  token의 **차이 선언만** — exact tier와 같은 안전 술어를 통과하는 값만 —
  `[data-wr-node="root"][data-wr-revealed="1"] [data-wr-node="child"]` rule로
  내보낸다. 관측값 그대로, 발명 0.
- Reconstruction runtime: trigger의 **`data-wr-obs`** JSON annotation 하나를
  generic runtime이 해석한다 (64KB 상한, 초과 시 template부터 drop).
  - **reveal**: `hidden` 제거 + `aria-hidden`을 관측된 open 값으로 (이전 값
    stash 후 복원) + `data-wr-revealed` — root의 관측된 open-state paint
    (display/visibility/opacity)와 위의 descendant graft가 CSS로 적용된다.
    관측이 없을 때만 기존 중립 `display: revert`.
  - **mount**: `replaceChildren()` 후 Task 16과 동일한 safe node construction
    (`createElement` + `setAttribute` + `createTextNode`) — **innerHTML 0회**.
    미해결 newly-mounted region은 trigger 옆에 `wr-obs-<patternId>-<idx>`로
    mount.
  - **hide** (disappeared 방향): rest 상태가 visible인 region은
    `data-wr-obs-hide` + `.wr-variant [data-wr-obs-hide="1"] { display: none }`.
  - tabs 활성화도 같은 채널을 탄다 (`handleTabs` → `applyObservedTargets`).
- Interaction QA (§6): 각 confirmed pattern에 대해 **양쪽에서** —
  trigger state(A), target 존재(B), target visibility 방향(C), target
  text/content fingerprint(D), target geometry(E — bounding box 기록, 판정에는
  사용하지 않음) 를 비교한다. 원본 측은 html id → structural path로 region을
  재발견하고, clone 측은 `data-wr-node` generated id 또는 mounted id로 찾는다.
  Manual Visual Review의 4-capture 방식이 production QA에 편입되어 pattern마다
  `interactions/<patternId>/{original,clone}-{before,after}.png`가 QA run에
  저장된다.

## Layout Rule Recovery

원본 source CSS 전체 복사는 하지 않는다. 대신 **브라우저가 실제 element에
적용한 layout-critical authored rule**을 관측한다 (observation schema v4 →
**v5**):

- `collectPageInBrowser`가 페이지당 한 번 `document.styleSheets`를 순회해
  (cross-origin sheet는 throw → skip — fetch 0회) 닫힌 allowlist
  (`LAYOUT_RULE_PROPERTIES`: width/min/max-width, height류, margin(+inline),
  padding, display, position/inset, flex\*, grid\*, gap, justify\*/align\*/place\*,
  overflow, transform/translate, aspect-ratio, box-sizing)에 선언을 가진 rule을
  index하고 (상한 2,000), walk 중 각 element에 `element.matches(selector)`로
  실제 적용되는 선언만 기록한다 — `%`, `vw/vh`, `calc()`, `clamp()`,
  `min()/max()`, `auto`가 **verbatim**으로 남는다. `@media` 안의 rule은 media
  condition text와 함께 기록된다. element당 상한 32, provenance는 selector
  (200자 cap) + media.
- 전체 stylesheet 저장/복제 없음: 해당 observed element에 실제 적용된
  reconstruction-critical declarations만 dom.json에 실린다
  (`ElementObservation.layoutRules`), SiteSpec node의 `authoredLayout`으로
  verbatim carriage.

## Multi-viewport Probe

1440/390 truth viewport는 그대로 두고 (§8), **lightweight layout probe**를
추가했다 (`src/observer/layout-probe.ts`, `layout-probe.json`):

- widths **390 / 768 / 1024 / 1440 / 1920** (+ opt-in extra width, 예: 2048
  canary). full deep observation이 아니라 **bounding box / display /
  visibility만** 수집한다.
- **한 번의 page load** (desktop truth width에서) 후 Observer skip 정책의
  walk로 element 참조를 park하고, width마다 `setViewportSize` → settle →
  **같은 참조**를 재측정한다. width 간 identity가 DOM 자신의 것이므로
  cross-viewport matching 문제가 생기지 않고, resize에 script가 node를
  교체하면 `disconnected` count로 드러난다.
- probe walk의 tag sequence가 기록되어 SiteSpec compile 시 desktop dom.json과
  **exact alignment** (길이 + 전 tag 일치)로만 결합된다. aligned면 desktop
  tree의 각 node에 `probe: {x[], w[], v[]}`가 붙고, 아니면 아무것도 붙지
  않는다 (`PageSpec.layoutProbe.aligned: false`).
- probe 실패는 페이지 관측을 실패시키지 않는다 — supplemental evidence다.
- 대표 route 중심: Task 09가 관측하는 페이지(= 대표 + validation sample)마다
  1회씩 돈다.

**Stripe 실측** — 관측된 16 page 전부에서 probe가 돌았고, prefix alignment
(아래 Known Limitations의 trailing-widget 항목) 포함 **16/16 page가 attach에
성공**했다. desktop tree 31,000+ node가 5-width 배열을 갖게 됐고, 그 위에서
4,775개 rule이 복원됐다 (centered 300+ · full-width 3,700+ · percentage 400+;
responsive-hidden은 이 corpus에서 0 — 없는 것을 있다고 세지 않는다).

## Layout Rule Inference

`src/reconstruction/layout-inference.ts` — probe + authored evidence에서
**deterministic** 하게 (fuzzy/AI 0):

| pattern | 판정 (breakpoint 이상 widths, 고정 tolerance) | 출력 |
| --- | --- | --- |
| centered max-width | width 상수(±1px), left/right gap 차 ≤2px, parent 성장 ≥40px | `max-width: <w>px; margin-left/right: auto; width: auto` |
| full-width | 모든 width에서 parent와 ±2px | `width: auto` |
| percentage | w/parent 비율 상수(±0.01), parent·node 성장 | `width: <pct>%` |
| responsive hide | truth에서 visible, 다른 width에서 hidden | `@media (min-width: <midpoint>px) { display: none }` |

- 모든 rule은 **truth viewport 관측 geometry를 재현해야 발화한다**:
  probe@1440의 w와 deep observation boundingBox가 ±4px 이상 다르면 해당 node는
  아무것도 받지 않는다. 1440 기존 fidelity가 구조적으로 보존된다.
- confidence 미달 시 **기존 exact computed fallback 유지** — probe가 없어도,
  align 실패해도, rule이 없어도 페이지 생성은 전과 동일하다 (§10).
- authored evidence(`max-width`, `margin: … auto`)가 있으면 evidence에
  기록된다 — 판정을 좌우하는 것은 언제나 측정값이다.
- §11의 예시가 그대로 fixture다: `1440: left 180 / width 1080 / right 180`,
  `1920: left 420 / 1080 / 420` → `max-width:1080px; margin-inline:auto`.

**Generated CSS priority (§10)** — specificity로 구조화:

```
1. Recovered stable layout rule   [data-wr-page][data-wr-viewport] [data-wr-node]   (0,3,0)
2. Observed responsive rule       같은 selector를 @media로 감싼 것
3. Exact computed CSS fallback    .wr-stXXXXXX                                       (0,1,0)
```

rule recovery가 실패해도 페이지 생성은 실패하지 않는다 — 기존 exact rendering이
fallback으로 그대로 남는다. manifest에 `layout` accounting
(pagesWithAlignedProbe / nodesWithProbe / recoveredRules / kind별 count)과
`layout-rule-inferred` limitation이 기록된다.

## Wide Viewport Results

사용자가 직접 발견한 "원본은 가운데인데 clone은 왼쪽" 현상을
**재현 → 원인 → generic fix → regression fixture** 순서로 해결했다.

**재현/측정 방법** — landmark-level container(`header/main/footer/section/
main>div`)를 original과 clone에서 각 width로 측정해 tag + compact-text로
정합하고, 원본에서 **centered**(|left−rightGap| ≤ 4px, 실제 margin 존재)인
container의 clone 측 center delta 편차를 잰다. user-visible만 계상한다
(stripe는 닫힌 menu panel을 opacity/clip으로 전체 크기로 숨겨두므로 naive
visibility로는 비교집합이 오염된다).

**`/use-cases/saas` — 문제의 그 route** (root-seeding 덕분에 해당 URL을 root로
한 targeted run이 항상 이 route를 포함한다):

| viewport | Task 16 clone worst centered drift | **Task 17 clone** |
| --- | ---: | ---: |
| 1440 (truth) | 0px | **0px** |
| 1920 | **480px** | **0px** |
| 2048 (canary) | **608px** | **0px** |

- Task 16 clone의 480/608px는 정확히 exact computed pixel의 산술이다: 1440에서
  `left 180 / width 1080 / right 180`로 관측된 container가 wide viewport에서도
  `left 180` 고정 → 원본의 `margin-inline: auto`가 만들어내는 `left 420(1920)`
  / `left 484(2048)`와의 차이.
- Task 17 clone은 §11의 예시 그대로 recovered `max-width + margin auto`가
  적용되어 **세 width 모두 0px**. 특정 px offset의 Stripe 하드코딩은 없다 —
  같은 inference가 fixture의 합성 layout에도 동일하게 발화한다
  (smoke:reconstruction Task 17 §9 섹션).
- 2048 canary에서 동일 문제 재현 안 됨 — 완료 게이트 충족.
- centered로 판정되지 않는 유일한 잔여: **닫힌 상태의 mega-menu panel**
  (사용자 비가시, opacity-hidden). 이들은 `max-width + 가변 padding` 복합
  패턴이라 현재 rule 어휘 밖이고, 열린 상태 geometry는 1440 관측값으로
  고정된다 — Known Limitations에 기록.

## Stripe Homepage

**존재한다.** 이번에도 Firecrawl Map은 root를 반환하지 않았고 (provider 20 links
중 `/` 없음), seeding이 그것을 복구했다:

```
discovery      21 candidates = 20 provider links ∪ seeded root   (rootSeeded: true)
verification   20 valid (1 non-html 제외) — root는 valid-html
selection      root force-isolated singleton family의 representative
observation    p000001 = https://stripe.com/ 전체 deep observation + layout probe
reconstruction route table에 `/` 존재, HTTP 200
```

manifest의 새 필드가 네 단계를 전부 증언한다:

```
inputRootIncluded              true
inputRootVerified              true
inputRootSelectedOrRepresented true
inputRootReconstructed         true
```

그리고 이 필드들이 false였다면 `classifyFinalStatus`가 `complete`를 거부한다 —
"19 = 19 = 19"의 무손실 외관은 더 이상 homepage 부재를 숨길 수 없다.

부수 효과: 홈페이지는 이 사이트에서 **가장 어려운 표본**이기도 하다. 25개
confirmed pattern 중 11개가 p000001에 있고, 3개의 visible-target mismatch도
전부 homepage의 mega-menu 계열이다 — Task 16이 표본에서 통째로 잃었던 난이도가
이제 측정 안에 있다.

## Interaction Results (정의 분리 후 실측)

| 축 | 값 |
| --- | --- |
| confirmed patterns (Task 12) | 25 |
| replayed | 25 / 25 |
| **triggerStateEquivalence** | **23 equivalent / 2 mismatch** |
| **userVisibleTargetEquivalence** | **17 equivalent / 3 mismatch / 0 not-observed / 5 not-declared** |
| combined verdict (regression gate) | 21 / 4 |
| clone JS runtime errors | 0 |

- Task 16의 같은 자리 수치: `behaviorEquivalent 28/28` — 그러나 사람이 본
  after-state는 2/28 (둘 다 native `<details>`). 이제 그 두 문장이 **다른
  이름의 다른 지표**다.
- **17개의 pattern에서 clone이 원본과 같은 user-visible after-state를
  만든다** — region 존재 · visibility 방향 · content fingerprint까지 양측 live
  replay로 비교한 결과다 (§6의 A–E 축; geometry는 기록, 판정 제외).
- **not-declared 5** — target 증거가 전혀 없는 pattern은 equivalent로 절대
  올라가지 않는다는 §3의 규칙이 실데이터에 있다 (모두 aria-expanded flip만
  관측된 disclosure).
- 잔여 mismatch 3 (전부 homepage):
  - `ip000003` — mega-menu 열림·크기는 맞고 **content fingerprint만** 다르다.
    300-element bounded capture가 자른 부분 (`dynamic-target-content-truncated`).
  - `ip000005` — 5개 region 중 1개가 reveal 후에도 height 0 (해당 region은
    capture가 없어 open-state graft를 받지 못했다).
  - `ip000006` (mobile) — trigger 방향 자체가 원본과 다르게 재생된 케이스
    (trigger:aria-expanded mismatch 2건 중 하나) + content 차이.
- 4-capture 스크린샷 증거가 QA run의 `interactions/<patternId>/`에 pattern마다
  저장된다 (`{original,clone}-{before,after}.png`) — Manual Visual Review가
  수동으로 하던 §6의 방식이 production QA에 들어왔다.

## Static Fidelity (동일 run)

| 지표 | 값 | Task 16 |
| --- | ---: | ---: |
| routes generated / rendered | 20 / 20 (100%) | 19 / 19 (단, `/` 없음) |
| compared nodes | 67,595 | 74,184 |
| content exact ratio | **1.0** (mismatch 0) | 1.0 |
| document height Δ median / max | 0.3px / **0.5px** | 0.22px / 0.5px |
| geometry median-of-p95 | **1px** | 0.99px |
| style compared / mismatched | 3,309,228 / 1,477 (0.045%) | 4,110,264 / 481 (0.012%) |
| screenshot changed-ratio median | 0.0907 | 0.0883 |
| clone runtime errors | **0** | 0 |
| unstable pages (live 원본 요동) | 15 | 17 |

style mismatch가 3배가 된 것은 **의도된 교환**이다: top property가 `width`
1,021 · `max-width` 114 · `margin-left/right` 97/97 — 전부 recovered layout
rule이 **exact computed px 문자열과 다른 값**(auto / % / max-width)을 선언한
자리다. geometry(p95 1px)와 document height(≤0.5px)가 그 값들이 truth
viewport에서 같은 박스를 만든다는 것을 증명하고, 그 대가로 1920/2048의 중앙
배치를 얻었다 (Wide Viewport Results). computed-string 동일성과 responsive
의미 보존은 같은 자리에서 공존할 수 없고, Task 17은 후자를 골랐다 — fallback
경로(§10)가 전자를 보존한다.

## Visual Review

```
data/stripe.com/manual-visual-review/2026-08-17T14-55-00-000Z/   (99 MB)
  <route>/{desktop-1440,mobile-390,wide-1920,wide-2048}-{original,clone,diff}.png
  review-summary.json · review-harness.ts · wide-viewport-check.ts
  wide-viewport-final.json · wide-viewport-saas.json · wide-viewport-saas-task16-before.json
```

대표 route 선정 (§12의 범주를 QA 실측으로 채움) — 5 route × 4 shot ×
{original, clone, diff} = **60 PNG**. capture/diff는 Task 16 review와 동일한
production 모듈 (`gotoQa`/`stabilize`/`captureScreenshot`/`renderDiffImage`) —
새 diff algorithm 0.

| route | 범주 | changed-pixel ratio (desktop / mobile / 1920 / 2048) |
| --- | --- | --- |
| `/` (home) | **homepage** + interaction-heavy + longest mobile (20,325px) | 0.1283 / 0.0424 / 0.1710 / 0.1682 |
| `/use-cases/saas` | manual-review 기준 route (targeted run) | 0.0847 / 0.0776 / **0.0792** / **0.0774** |
| `/industries/media-entertainment` | **worst desktop + worst mobile** | 0.1562 / 0.4676 / 0.1305 / 0.1253 |
| `/newsroom/news/tour-berlin-2025` | 기준선 (best desktop) | 0.0427 / 0.0720 / 0.0487 / 0.0468 |
| `/customers/hargreaves-lansdown` | customer story | 0.1239 / 0.0834 / 0.0982 / 0.0925 |

읽는 법:

- **`commonAreaRatio 1.000` — 20쌍 전부.** 1920/2048에서도 original과 clone의
  문서 높이가 일치한다는 뜻이다. wide viewport에서 layout이 흐트러지면 높이가
  먼저 어긋난다 — recovered rule이 흐름을 보존했다는 가장 싼 증거.
- `/use-cases/saas`의 wide 값(0.0792/0.0774)이 truth 값(0.0847)과 사실상
  같다 — Task 16 clone에서 480/608px 좌측 편향이 만들던 대면적 빨강이 없다.
- home의 1440/1920 값 (0.13–0.17)은 live drift가 지배한다: stripe 홈은 관측
  시점 이후에도 hero 애니메이션 프레임·스토리 카드가 계속 바뀐다 (QA
  `unstablePages 15`, `source-content-drift ×1003`). threshold 없는 비교라는
  점은 Task 16과 동일하다.
- media-entertainment mobile 0.4676은 이 세트의 outlier로, QA도 같은 값을
  쟀다(0.4664) — 원본의 mobile 전용 대면적 미디어 영역이 lazy/애니메이션
  상태로 요동하는 페이지다. clone 결함으로 단정하지 않고 worst 표본으로
  남긴다 (사람이 diff를 볼 것).
- **interaction 4-capture**는 이 디렉터리가 아니라 QA run 자체에 있다:
  `reconstruction-qa/2026-08-17T14-45-14-014Z/interactions/<patternId>/`
  `{original,clone}-{before,after}.png` — 25 pattern 전부, 매 QA run마다
  자동으로 생긴다. Task 16에서 사람이 수동으로 만들던 산출물이 pipeline
  산출물이 됐다.

## Regression

기존 Task 06–16 smoke suite **전부 PASS** — 최종 코드 상태에서 10개 suite를
한 번에 재실행했다 (historical artifact 수정 0):

| suite | checks | 결과 |
| --- | ---: | --- |
| smoke:verifier | 81 | PASS |
| smoke:selector | 81 | PASS |
| smoke:multi-observer | 58 | PASS |
| smoke:interaction-detector | 92 | PASS |
| smoke:interaction-explorer | 95 → **103** | PASS (Task 17 §4 discovery 8건 추가) |
| smoke:interaction-patterns | 88 | PASS |
| smoke:sitespec | 252 | PASS |
| smoke:reconstruction | 197 → **205** | PASS (layout inference 8건 추가) |
| smoke:reconstruction-qa | 127 → **134** | PASS |
| smoke:e2e | 104 → **126** | PASS (root seed 9건 + Task 17 live 6건 등) |
| **합계** | **1,360** | **PASS** |

새 fixture (§15):

- root candidate seed — offline `buildDiscoveryResult` 3-case + live "provider가
  root를 빼고 반환" 전체 체인
- centered max-width layout — offline inference fixture + live `.centered`
  band (probe → SiteSpec → recovered rule → generated CSS)
- responsive container — percentage / full-width / responsive-hidden offline
  fixtures
- existing-hidden interaction target — explorer fixture `#panel1`
  (aria-controls + visibility-change 이중 evidence) / e2e fixture CSS-hidden
  `#aria-panel` reveal
- newly-mounted interaction target — explorer fixture `#menu1` (visible
  container로의 append가 content-replaced로 오분류되지 않는 것 포함) / e2e
  fixture mounted menu
- tab panel — appearing panel과 disappearing panel을 모두 발견
- menu/disclosure — 기존 disclosure/menu 케이스가 새 채널로도 검증
- 무target toggle — visible-target verdict가 `not-declared`로 집계되고
  equivalent로 오르지 않는 것

hydration 0 / runtime error 0 유지: smoke:reconstruction과 smoke:e2e의 기존
검사가 그대로 PASS이고, Stripe 최종 run도 `cloneRuntimeErrors 0` ·
hydration error 0 · source backend write 0 · Git operation 0이다.
historical artifact는 한 바이트도 수정되지 않았다 — 모든 schema 변화는
additive-optional + reader union이고, Task 16 이전 run들은 그대로 읽힌다.

## Known Limitations

- **SVG internal paint** — 이번 Task에서 구현하지 않음 (§13, 계획대로).
  Observer walk는 여전히 `<svg>`에서 멈추고 `fill`/`stroke`는 whitelist
  밖이다. 이번 최종 clone의 노출 규모: **inline SVG 6,393개 렌더링**, 20
  route 전부에 존재. root-paint vs class-derived paint의 구분은 Task 16 manual
  review의 규칙("root에 paint가 걸려 있으면 살아남고, 내부 shape가 CSS
  class로 색을 받으면 검게 죽는다")이 그대로 유효하며, 다중 사이트 표본
  수집이 우선이라는 결론도 그대로다. SVG 때문에 Task 17을 지연시키지 않았다.
- Layout rule inference는 **desktop tree** 에만 적용된다 (probe walk가 desktop
  truth width에서 정렬되므로). mobile tree는 exact fallback 그대로다.
- 관측된 open-state paint는 target **root**의 display/visibility/opacity다.
  descendant 단위의 open-state 스타일 차이는 captured subtree가 있는 kind에서만
  재현된다.
- probe는 한 번의 추가 page load다 — 그 load가 deep observation과 다른 동적
  내용을 렌더하면 tag alignment가 무너진다. trailing 3rd-party widget(cookie
  배너, chat)이 두 load에서 다르게 렌더되는 것이 실측된 주 원인이라
  (2735개 중 2714개 일치 후 tail 21개 상이) **prefix alignment**를 도입했다:
  첫 불일치 이전의 exact 접두사가 양쪽 walk의 ≥90%를 덮으면 그 접두사에만
  probe를 부착하고 나머지는 아무것도 받지 않는다. 그래도 실패하면 해당
  페이지는 inference 없이 exact fallback으로 남는다 (실패가 아니라 기록되는
  상태다).
- 닫힌 mega-menu panel처럼 `max-width + 가변 padding` 복합으로 fluid하게
  움직이는 container는 현재 rule 어휘(중앙/full/percentage/hide) 밖이다 —
  확신이 없으면 exact fallback이라는 §9의 규칙대로 남는다. 열린 상태의 menu
  geometry는 1440 관측값 기준이다.
- content fingerprint 비교는 정확 일치다 — live data가 섞인 region은 원본
  재방문 간에도 달라질 수 있고, 그 경우 mismatch로 보고된다 (은폐보다 과보고).

## Before / After Metrics

| 항목 | Task 16 (before) | **Task 17 (after)** |
| --- | --- | --- |
| **root homepage** | **missing** — 19 routes에 `/` 없음, 어떤 지표도 경고하지 않음 | **present** — seeded → verified → selected → reconstructed, `inputRoot*` 4/4 true, false면 `complete` 불가 |
| **wide viewport container** (`/use-cases/saas` centered worst drift) | 1440: 0px · **1920: 480px · 2048: 608px** (좌측 고정) | 1440/1920/2048 **전부 0px** (homepage · media-entertainment · customers 도 0px) |
| **trigger state** | `behaviorEquivalent 28/28` — 이름이 두 질문을 겸함 | `triggerStateEquivalence 23/25` — 지표가 자기가 잰 것만 주장 |
| **visible interaction target** | **측정되지 않음** (사람 검수로만 2/28 확인) | `userVisibleTargetEquivalence 17/25 equivalent`, 3 mismatch, 5 not-declared — 자동 QA가 A–E 축으로 매 run 측정, 4-capture 스크린샷 포함 |
| interaction target 관측 | 선언된 `aria-controls`만 (25/28 target 미선언) | generic discovery — 37 observed-target binding (24 reveal + 13 content mount), `not-declared`는 5로 줄고 **이름으로 남음** |
| layout 의미 | exact computed px만 | authored rule 관측 + 5-width probe + 4,775 recovered rules (16/16 page aligned) |
| hydration / runtime error | 0 / 0 | **0 / 0 유지** |
| content exact ratio | 1.0 | **1.0 유지** |

## Final Verdict

과장 없이:

**"정지 화면을 옮기는 일"은 그대로 잘 한다.** content exact 1.0, document
height ≤0.5px, geometry p95 1px, hydration·runtime error 0 — Task 16의 성취가
하나도 퇴행하지 않았다 (10개 smoke suite 1,360 checks 전부 PASS).

**Task 16이 "경계 밖"이라 불렀던 세 가지 중 두 개가 경계 안으로 들어왔다.**

1. **홈페이지는 이제 구조적으로 사라질 수 없다.** candidate set의 정의가
   root를 포함하고, 파이프라인의 네 단계가 각자 그 사실을 증언하며, 어느
   하나라도 거짓이면 run은 complete가 아니다.
2. **"메뉴가 열린다"가 측정되고, 17/25에서 참이다.** 트리거 속성만 잰 숫자가
   full behavior처럼 읽히는 일은 이름 차원에서 불가능해졌고, 관측 없는 것은
   not-observed / not-declared로 남는다. mega-menu는 실제로 열리고, 열린
   상태의 paint가 관측값 그대로 적용된다.
3. **1920에서 가운데는 가운데다.** exact computed pixel의 의미 손실
   (max-width / margin:auto / %)을 probe + authored evidence에서
   deterministic하게 복원했고, truth viewport 재현을 rule 발화의 전제로
   강제했으므로 1440 fidelity는 구조적으로 보존된다.

**아직 초입인 것들도 이름이 있다** — 300-element capture가 자르는 대형
mega-menu content, 열린 메뉴의 wide-viewport geometry, mobile trigger 방향
2건, SVG internal paint (Known Limitations). 전부 관측·수치·한계 코드로
남아 있고, 다음 Task가 그 위에서 시작하면 된다.
