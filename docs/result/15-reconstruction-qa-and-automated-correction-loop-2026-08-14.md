Task: 15
Title: Reconstruction QA & Automated Correction Loop
Previous: 14-nextjs-reconstruction-engine-2026-08-14.md
Status: Complete

# Task 15 — Reconstruction QA & Automated Correction Loop

## 작업 목표

Task 14는 "이 SiteSpec만으로 돌아가는 사이트를 만들 수 있는가?"에 답했다. 이번
Task는 그 다음 질문 두 개에 답하고, 두 질문을 **끝까지 분리해서** 답한다.

> clone이 얼마나 다른가 → dimension별 raw metric
> **왜** 다른가 → evidence가 뒷받침하는 classified root cause

핵심 제약은 하나다. **pixel difference는 root cause가 아니다.** font가 bind되지
않으면 text width가 바뀌고, wrapping이 바뀌고, container height가 바뀌고, 그 아래
300개 element가 전부 밀린다. 그것을 300개의 defect로 세는 것은 산술적으로는 맞고
진단적으로는 무용하다. 그래서 이 Task는 **diff collection**과 **causal
classification**을 서로 다른 vocabulary를 가진 두 개의 pass로 나눈다.

그리고 "충분한 관측 증거가 있는 일부 문제만" 자동 수정한다. 자동 수정의 기준은
"틀려 보인다"가 아니라 **"무엇이 맞는지 정확히 관측했다"** 이다.

## Pipeline Position

```
URL
→ Discovery → Verification → Family Selection → Responsive Observation
→ Interaction Detection → Interaction Exploration → Pattern Modeling
→ SiteSpec → Next.js Reconstruction
→ [이번 Task]  Reconstruction QA + Root Cause Attribution + Correction Loop
→ Task 16 Full E2E Reconstruction
```

```
reconstruction-manifest.json (Task 14, immutable)
        ↓
  serve the clone (next build → next start, ephemeral port)
  re-observe the LIVE original (Task 05 environment, anonymous context)
  read the saved snapshot (Task 09 screenshot + Task 13/13.1 SiteSpec)
        ↓
  S ↔ C   the reconstruction CONTRACT
  S ↔ O   source drift
  O ↔ C   canary — drift-free pages only
        ↓
  classify (24 causes, explicit precedence) → route (9 recommendations)
        ↓
  [--auto-fix]  propose → apply → regenerate → re-measure → accept / reject
        ↓
data/<host>/reconstruction-qa/<run-id>/
```

## QA Architecture

새 모듈 `src/reconstruction-qa/` (32 파일). 의존 방향은 한 방향으로만 흐른다:
`reconstruction-qa` → `reconstruction` / `sitespec` / `observer` /
`interaction-explorer`. 역방향 import는 없다 — 즉 **generated app의 runtime은
여전히 SiteSpec만 읽는다** (item 13). QA runner만 상위 artifact를 읽는다.

| 파일 | 역할 |
| --- | --- |
| `types.ts` | schema, 24-code diff taxonomy, 9 recommendation, policy 상수 |
| `correction-types.ts` | 3개 closed correction type + `QaCorrectionSet` |
| `store.ts` | output namespace (`data/<host>/reconstruction-qa/<run-id>/`) |
| `load-inputs.ts` | manifest → app / SiteSpec / Task 09·11·12 artifact chain |
| `start-clone.ts` | `next build`(필요 시) + `next start`, ephemeral port |
| `capture-page.ts` | in-page capture (DOM/style/geometry/asset/canvas) + load policy |
| `capture-original.ts` | live original capture + stability 재측정 |
| `capture-clone.ts` | clone capture (active variant scoped) + breakpoint probe |
| `align-original.ts` | live DOM ↔ SiteSpec 3-condition structural alignment |
| `map-clone-nodes.ts` | `data-wr-node` ↔ SiteSpec nodeId mapping |
| `screenshot-diff.ts` | PNG decode + deterministic metric + diff image |
| `content-diff.ts` `geometry-diff.ts` `style-diff.ts` `asset-diff.ts` `runtime-diff.ts` | dimension별 측정 |
| `compare-behavior.ts` | **단 하나의** behavior 비교 (baseline과 loop가 공유) |
| `interaction-qa.ts` `unknown-qa.ts` `qa-behavior.ts` | 양측 replay + 판정 |
| `classify-diff.ts` `emit-diffs.ts` `root-cause.ts` | 분류·precedence·집계 |
| `data-image-recovery.ts` | rendered.html 재정렬 + `data:` URI safety gate |
| `propose-corrections.ts` `apply-corrections.ts` `correction-loop.ts` | 수정 제안·적용·수락 |
| `qa-page.ts` `run-qa.ts` `run-correction-loop.ts` `summarize.ts` | orchestration |

Task 14 쪽에 추가된 것은 **optional 입력 하나**뿐이다: `src/reconstruction/qa-corrections.ts`
(closed correction → CSS/`src`/reveal hook) + `planReconstruction(input, { corrections })`
+ `pnpm reconstruct --corrections <file>`. corrections가 없으면 모든 branch가
skip되고 출력은 Task 14와 **byte-identical**이다 (아래 regression 참조).

## Three-Way Truth Model

| | 정체 | 역할 |
| --- | --- | --- |
| **S** Saved Snapshot | Task 09 observation + Task 13/13.1 SiteSpec | reconstruction **계약**. clone이 재현해야 하는 대상 |
| **O** Live Original | 지금 다시 관측한 공개 사이트 (Task 05 environment) | drift 감지 · interaction after-state 관측 · canary |
| **C** Current Clone | Task 14 generated app, localhost | 측정 대상 |

3 pair를 모두 계산한다: `S↔C`, `S↔O`, `O↔C`. 단일 similarity score로 판정하지
않는다.

precedence policy는 `classify-diff.ts`에 명시적으로 적혀 있다:

1. **snapshot이 계약이다.** live site가 바뀌었든 아니든, clone이 SiteSpec과
   다르면 clone defect다.
2. **drift는 LIVE 비교만 억제한다.** drift가 확인된 node에서 live-original
   mismatch를 generator defect로 이중 계상하지 않는다. clone-side diff에
   `sourceDrift: true`가 찍혀 두 사실이 함께 보인다.
3. **불안정한 측정은 그 페이지의 모든 것을 outrank한다** (`environment-unstable`).
4. **묶인 원인이 증상을 대체한다.** layout cascade는 그것이 설명하는 N개
   geometry diff를 대체하고, inherited-style group은 N개 descendant를 대체한다.
   대체된 node 수는 `affectedNodeCount`에 남는다.
5. **fuzzy score로 아무것도 결정하지 않는다.** predicate가 충족되면 classified,
   아니면 `unclassified`.

**단 하나의 문서화된 예외** — asset에만 적용된다. snapshot이 `<img>`를 decode된
것으로 기록했고, clone이 decode하지 못하고, **live original도 decode하지 못하면**
clone은 사이트의 현재 동작을 재현하고 있다. 그것은 `asset-source-drift`이고
reconstruction defect가 아니다 (item 53). 이 예외는 "clone에 대한 증거의 부재"가
아니라 "사이트에 대한 적극적 관측"을 요구하므로 좁다.

## Input / Output

**입력 chain.** primary는 `reconstruction-manifest.json`. 여기서 `app/`을 얻고,
site + version triple로 SiteSpec을 결정론적으로 찾는다 (`--site-spec`로 override
가능). baseline manifest에 SiteSpec 경로를 기록하지 않는 이유는 그 필드 하나가
Task 14의 byte-identical 출력을 깨기 때문이다. corrected manifest는 반대로
`sourceQaRun` / `correctionSet` / `correctionCount` / `sourceSiteSpec`을 기록한다.

SiteSpec의 `source.*` (audit string)를 따라 Task 09 site-observation, Task 11
exploration(+per-action locator descriptor), Task 12 pattern/unknown model을
읽는다. **이 경로를 따르는 코드는 QA runner에만 있다.**

**출력 namespace** — Task 06–14 artifact는 전혀 건드리지 않는다:

```
data/<host>/reconstruction-qa/<run-id>/
  qa-manifest.json · baseline-summary.json · final-summary.json
  pages/<pageId>/{desktop,mobile}.json
  interactions/<patternId>.json · unknowns/<unknownId>.json
  drift/source-drift.json
  corrections/{proposed,applied,rejected}.json + assets/<sha256>.<ext>
  iterations/q000/summary.json
  iterations/q001/{summary.json,correction-set.json,reconstruction/}
  artifacts/screenshots/ · artifacts/diffs/
```

## Original Safety Model

Task 11의 `SafetyGuard`를 **재사용**한다 (복제하지 않는다). interaction replay
시: anonymous BrowserContext, storage state 0, `acceptDownloads: false`,
non-GET(`POST`/`PUT`/`PATCH`/`DELETE`) abort, main-frame navigation 차단, popup
즉시 close, download cancel, dialog dismiss, request body 저장 0, credential 0.

**static capture는 request를 차단하지 않는다.** Task 09 snapshot은 아무 차단 없이
찍혔고, page 자신의 lazy-load XHR을 막는 QA capture는 clone이 비교되는 페이지와
다른 페이지를 측정하게 된다 — 즉 감지하려는 drift를 스스로 만들어낸다. static
capture에는 무해한 절반만 설치한다: popup close, download cancel, dialog dismiss,
그리고 각각 기록.

## Static Truth Set

Task 09에서 deep observation이 성공한 **모든** PageSpec × desktop/mobile.
실제 artifact에서 계산한다 (하드코딩 없음). 4 사이트 합계 **52 page ×
2 viewport = 104 page-viewport pair**.

family-represented route(60개)는 exact snapshot fidelity에 **포함하지 않는다** —
자기 exact observation이 없기 때문이다.

## Family Audit Set

`MAX_FAMILY_AUDIT_ROUTES_PER_SITE = 4`. 선택은 결정론적: largest family first →
familyId → lexical member URL, family당 1개, representative / validation URL 제외.
desktop viewport에서 Live Original ↔ Clone만 비교하고, mismatch를 generator
defect로 분류하지 않는다 (`family-representation-gap`, `requires-exact-observation`,
auto-fix 금지).

## Source Drift Detection

live original DOM을 SiteSpec tree와 **Task 13과 동일한 3-조건**으로 align한다:
element count · tag sequence · parent relation. fuzzy match도, LCS 복구도,
tolerance도 없다. live walk는 Observer의 walk를 그대로 미러링한다 (동일 skip
tag, pre-order, inline `<svg>`는 opaque 단일 node).

- alignment 실패 → `source-structural-drift`, 그 페이지의 node-by-node QA는
  수행하지 않고 `requires-reobserve`. clone을 현재 사이트에 맞추는 자동 수정은
  하지 않는다.
- 구조는 aligned인데 text가 다르면 → `source-content-drift`. **drift 비교만
  normalized로** 한다: fallback viewport의 SiteSpec text는 Observer의 200자
  정규화 값이라 raw 비교는 모든 긴 문단에서 거짓 drift를 만든다. cap에 정확히
  걸린 값은 prefix로 취급한다. clone↔snapshot 비교는 raw 그대로다 (item 41).
- computed style이 다르면 → `source-style-drift`, property별 기록.

## Snapshot Visual Diff

Task 09의 `screenshot.png`가 snapshot visual oracle이다. clone/live original
screenshot은 **동일 정책**으로 찍는다: `page.screenshot({ fullPage: true, type: "png" })`,
clip 없음, animation freeze 없음 — Task 09 Observer가 쓴 그대로.

metric (모두 deterministic, threshold 없음):

- image width/height, `widthDelta` / `heightDelta`
- overlap 영역의 mean absolute RGB delta
- max channel delta
- changed pixel ratio (`changed / overlap`)
- common area ratio (`overlap / max(a,b)`)

**resize 금지.** clone이 40px 짧으면 그것이 finding이고, 크기를 맞추면 finding이
사라진 뒤 나머지 모든 pixel 비교가 흐려진다. 크기가 다르면 겹치는 영역만
비교하고 dimension delta를 따로 보고한다.

`pixelmatch`를 쓰지 않았다. 필요한 것은 threshold 없는 결정론적 metric이고,
antialiasing 휴리스틱은 이 Task가 가져서는 안 되는 tunable을 도입한다. PNG
decode/encode에만 `pngjs`를 추가했고, diff 이미지도 직접 렌더한다 (변경 픽셀
불투명 빨강, 나머지는 밝은 회색).

**PASS threshold는 만들지 않았다** (item 31). visual metric은 ranking · 진단 ·
before/after 개선 측정에만 쓴다.

## Live Visual Diff

같은 정책으로 `S↔O`, `O↔C`도 계산한다. 세 쌍이 함께 있어야 "clone이 틀렸다"와
"사이트가 바뀌었다"를 구분할 수 있기 때문이다. 단일 similarity score로 자동
판정하지 않는다.

## Content Diff

단위는 element 하나의 **직접 text**: 직속 text child들을 document order로 이어
붙인 RAW 문자열. trim/collapse 하지 않는다 (item 41).

`<svg>`는 양쪽 비교에서 제외한다 — upstream에서 opaque asset이라 그 안의 text는
content tree의 것이 아니다.

## Geometry Diff

SiteSpec `boundingBox` vs clone `getBoundingClientRect()`, mapped + snapshot
visible node만. x/y/width/height별 median · p90 · p95 · max, property별 worst
node. mean을 쓰지 않는 이유는 document-height element 하나의 4,000px outlier가
평균을 쓸모없게 만들기 때문이다.

**cascade grouping** — y delta가 1px 이내로 일치하는 node가 8개 이상이면 하나의
`layout-cascade`로 묶고, shared displacement · first divergence node · 공통
조상 · 대표하는 node 수를 함께 기록한다. 원인을 그 결과 아래 묻지 않기 위해서다.

## Style Diff

Observer의 style whitelist를 그대로 쓰고, **exact string 비교**를 한다. 양쪽이
같은 Chromium build로 serialize되었기 때문에 이것이 성립한다 (item 19).

두 개의 예외를 명시적으로 계량한다.

1. **document-root 적응.** Task 14가 관측된 `<html>`/`<body>`를 `div` wrapper로
   렌더하면서 `width`/`height`/`min-*`/`max-*`를 의도적으로 뺀다. 그 node의 그
   property만 따로 센다.
2. **sub-layout-unit 길이 차이.** clone은 모든 box를 다시 layout하고 Blink는
   길이를 1/64px 고정소수점(`LayoutUnit`)으로 저장한다. 두 번의 독립적인 layout은
   최대 2 quantum(0.03125px)까지 벌어질 수 있다. `width: 111.609px` vs
   `111.594px`는 style 차이가 아니라 그 artifact다. 이것을 mismatch로 세면
   domainchecker 4개 블로그 페이지에서만 2,002건이 나오고 `width`/`height`가 모든
   표의 1·2위를 차지하며 진짜 차이를 전부 가린다. **버리지 않고**
   `subLayoutUnitLengthMismatches`로 따로 센다. 2 quantum을 넘는 차이는 평범한
   mismatch다.

이것은 item 46의 "exact string comparison"에서 의도적으로 벗어난 지점이고, 그
근거는 taste가 아니라 렌더러 자신의 표현 한계다.

**inherited-cause grouping** — inherited property(color, font-family, line-height
등)의 (property, expected, actual) 3-tuple이 5개 이상 node에서 같으면 하나의
finding으로 묶고 document order 상 가장 위의 node(first mismatching ancestor)에
귀속시킨다.

## Font Metric Analysis

`font-family` mismatch **단독으로는** font 문제라고 부르지 않는다. Task 14가
`@font-face`를 컴파일하지 않는다는 사실은 이미 알려져 있고, 그것만으로 이 페이지의
geometry가 그 때문에 움직였다는 증거는 되지 않는다 (item 161).

`font-binding-missing`은 **conjunction**일 때만 붙는다: 같은 페이지에서
font-family mismatch가 있고 **동시에** text를 담은 node의 geometry가 움직였을 때.
그 경우 font-family mismatch들은 이 finding이 대표하고 개별 style mismatch로
중복 계상하지 않는다. auto-fix는 하지 않는다 —
`requires-font-binding-observation`.

## Asset Diff

측정은 URL 비교가 아니라 **브라우저 자신의 시각**이다: `img.complete` +
`naturalWidth`가 "실제로 그림이 나왔는가"에 답한다.

"snapshot이 이미지를 보여줬다"의 기준은 **positive decode**뿐이다:
snapshot asset record의 `naturalWidth > 0` 또는 지금 관측한 live original의
`naturalWidth > 0`. layout box가 있다는 사실은 증거가 아니다 — `loading="lazy"`
이미지는 box를 예약하고 아무것도 decode하지 않으며, Observer와 이 QA는 둘 다
scroll 0에서 캡처한다. box를 증거로 받아들였을 때 domainchecker에서 원본도
그리지 않는 이미지 31건이 "asset load failure"로 보고됐다.

root cause 5분류: `asset-missing-in-sitespec` / `asset-unresolved-in-reconstruction`
/ `asset-reference-load-failure` / `asset-hotlink-blocked` / `asset-source-drift`.

## Runtime Error Diff

clone의 console error/warning, pageerror, hydration error, failed resource,
예상치 못한 navigation을 수집한다. 원본도 따로 수집하되 **원본 자신의 error를
clone defect로 세지 않는다.**

**차단된 asset은 JavaScript error가 아니다** (item 54). cross-origin 이미지를
origin이 거부하면 console에는 error로 도착하고 MDN에서는 페이지 로드마다 84건이
나온다. 그것을 runtime error로 세면 남의 응답 헤더를 clone runtime의 잘못으로
만드는 것이다. `blocked by CORS policy` / `Cross-Origin-Resource-Policy` /
`ERR_BLOCKED_BY_RESPONSE` / `Failed to load resource` 계열은 분리해
`asset-hotlink-blocked`로 보고한다. 단, `pageerror`(uncaught exception)는 내용과
무관하게 항상 JavaScript다.

## Responsive QA

390 / 1440은 observed truth이므로 원본과 정확히 비교한다. 각 페이지에서 clone은
정확히 하나의 viewport variant만 보여야 하고, 둘 다 보이거나 둘 다 숨으면
`responsive-variant-runtime-error`다.

915px는 **observed truth가 아니다** — Task 14 generator 자신의 산술이다. 따라서
원본과의 pixel 동등성을 요구하지 않고, clone-only 일관성만 검사한다: 914 / 915 /
916에서 (a) variant가 정확히 하나 보이고 (b) content가 렌더되고 (c) runtime
error가 0. 실패는 `inferred-breakpoint-runtime-defect`이며 원본 breakpoint
mismatch라고 주장하지 않는다.

## Interaction QA

Task 12 confirmed pattern **전부**를 양측에서 재생한다.

- **원본**: Task 11의 `LocatorDescriptor`와 4개 exact strategy로 재식별.
  `candidate.elementId`는 절대 locator로 쓰지 않는다. Task 11의 `SafetyGuard`를
  그대로 재사용.
- **clone**: active variant 안에서 `[data-wr-pattern-id]`로 exact locate. 원본과
  clone의 locator 난이도를 섞지 않는다.
- 양측 모두 action마다 fresh context — state contamination 0.

비교 vocabulary는 닫혀 있다 (item 66): candidate state field · target
mount/unmount · target visibility · open/checked/selected · dynamic target
tag/role · dismiss · URL. 그 밖의 어떤 것도 mismatch를 만들 수 없다.

**비교 구현은 하나뿐이다** (`compare-behavior.ts`). baseline pass와 correction
iteration이 같은 함수를 쓴다. 처음에는 loop가 자체 비교를 갖고 있었고, pattern의
transition field 대신 고정된 ARIA 목록을 비교해서 baseline이 세지 않은 차이를 세고
nextjs의 canvas correction을 존재하지 않는 `regression-behavior`로 기각했다.
regression gate는 전후로 같은 것을 재야 의미가 있다.

원시 비교가 거짓말을 하는 두 경우를 명시적으로 처리한다:

- **self-referential target (item 72).** nextjs의 verified tabs 6개는
  `aria-controls`가 자기 자신을 가리킨다(사이트가 id를 렌더마다 새로 만든다).
  원본에서 그 "target"은 trigger 자신의 churn된 id라 클릭 후 사라지고, clone은
  panel을 구현하지 않는다. 그대로 비교하면 6개 전부 `target:unmounted`가 되어
  behavior defect처럼 읽히지만 실제로는 id churn이다. 그래서 target 축은 증거로
  쓰지 않고 `aria-selected` transition만으로 판정하며, 결과에
  **`tabpanel-unverified`** 를 남겨 full tab equivalence로 읽히지 않게 한다.
- **contents가 관측되지 않은 dynamic target (item 73).** 원본은 자식이 있는
  menu를 mount하고 clone은 관측된 tag/role만 있는 빈 region을 mount하므로 box가
  없고 "visible"이 아니다. `target:visible` / `target:mounted`는 그 한 가지 알려진
  한계의 **증상**이므로 `dynamic-target-content-unobserved` 하나로만 보고한다.
  verdict는 `mismatch` 그대로다 — 동작은 실제로 다르기 때문이다.

**open-state style**은 이 파이프라인이 처음 관측하는 값이다. Task 11은 닫힌
상태를 캡처하고 클릭했을 뿐 열린 뒤의 style을 읽지 않았고, 그래서 Task 14는
`display: revert`라는 중립 fallback밖에 쓸 수 없었다. 여기서 uniquely resolved ·
visible · drift 없음 · safety event 없음인 target에 한해 열린 상태의 computed
style을 읽는다 (item 71). 이것이 correction 2의 유일한 근거다.

## Unknown Interaction QA

63개 unknown을 전부 실행하지 않는다. Task 12가 이미 signature group으로 묶고
결정론적 대표를 골라 두었으므로 그 선택을 재사용한다 — signature당 1개,
`MAX_UNKNOWN_QA_PER_SITE = 8` 상한, item 77의 priority 순서.

목적은 unknown behavior를 구현하는 것이 **아니다**. 원본에는 관측 가능한 변화가
있고 clone에는 없다는 gap을 정확히 증명하는 것이다. `autoFixEligible`은 타입
수준에서 `false`로 고정되어 있다.

## Diff Taxonomy

24개 code. `source-structural-drift` · `source-content-drift` ·
`source-style-drift` · `route-mismatch` · `content-mismatch` ·
`structure-mismatch` · `geometry-mismatch` · `layout-cascade` · `style-mismatch` ·
`font-binding-missing` · `asset-missing` · `asset-load-failure` ·
`asset-hotlink-blocked` · `canvas-background-mismatch` ·
`responsive-variant-mismatch` · `responsive-variant-runtime-error` ·
`inferred-breakpoint-runtime-defect` · `interaction-state-mismatch` ·
`interaction-target-style-mismatch` · `dynamic-target-content-unobserved` ·
`unknown-behavior-gap` · `family-representation-gap` · `runtime-error` ·
`environment-unstable` · `unclassified`.

`QaDiff`는 item 84의 shape을 그대로 따르고, 여기에 `affectedNodeCount`(묶인
finding이 대표하는 node 수), `recommendation`, `upstreamStage`가 추가됐다.

diff id(`qd000001…`)와 correction id(`qc000001…`)는 **전체 run을 정렬한 뒤에만**
부여된다. 도착 순서대로 부여하면 concurrency 2에서 페이지 완료 순서가 바뀔 때마다
모든 id가 밀린다.

## Root Cause Attribution

classification마다 `recommendation` + `upstreamStage`가 붙는다. "자동으로 못
고친다"는 항상 "그럼 누가 고치나"와 함께 나온다. 9개 recommendation:
`requires-reobserve` · `requires-exact-observation` ·
`requires-new-interaction-observation` · `requires-asset-materialization` ·
`requires-font-binding-observation` · `requires-pattern-modeling` ·
`unknown-semantic-gap` · `unsupported-browser-region` · `source-drift`.

`confidence: 0.83` 같은 fuzzy score는 없다. predicate가 충족되면 classified,
아니면 `unclassified`.

## Correction Architecture

correction은 **SiteSpec을 수정하지 않는다.** corrected clone은
`SiteSpec + QaCorrectionSet`으로 새로 생성되고, corrected manifest가 두 출처를
모두 기록한다.

correction type은 **닫힌 enum 3개**다. 임의의 CSS selector / JavaScript / React를
저장할 수 있는 artifact는 데이터의 탈을 쓴 코드 주입 채널이고, "correction이 무엇을
할 수 있는가"를 모든 artifact를 읽어야만 답할 수 있게 만든다.

| type | provenance | 적용 지점 |
| --- | --- | --- |
| `document-canvas-background` | `observed-snapshot` | app stylesheet의 `html { … }` 한 rule |
| `interaction-target-state-style` | `observed-live-qa` | `[data-wr-viewport][data-wr-page] [data-wr-node][open\|data-wr-revealed]` 한 rule |
| `safe-data-image-recovery` | `observed-snapshot` | 한 element의 `src` + content-addressed 파일 |

**`stateHook`.** open-state correction은 clone이 "열림"을 **어떤 attribute로
신호하는지**를 함께 저장한다. `native-details` disclosure는 브라우저가
`<details open>`을 직접 토글하고 생성된 runtime은 listener를 아예 붙이지 않으므로,
runtime 자신의 marker(`data-wr-revealed`)에 건 rule은 절대 매치되지 않는다. 이것은
사소한 문제가 아니었다: domainchecker의 verified pattern 13개 중 8개가
`native-details`이고, 첫 auto-fix 실행에서 제안된 5개 correction이 전부 아무것에도
적용되지 않아 (올바르게) 기각됐다. 이제 native mechanism은 `[open]`에, scripted
mechanism은 `[data-wr-revealed="1"]`에 건다.

## Correction Eligibility

item 87을 코드로 옮긴 것: **"틀려 보인다"가 아니라 "무엇이 맞는지 관측했다"**.
각 type은 명시적 evidence predicate를 갖고, 충족된 predicate 이름들이 artifact에
기록된다. correction이 쓰는 모든 CSS 값은 Task 14 자신의 property allowlist와 value
validator를 통과해야 한다 — 통과하지 못한 값은 **정제되지 않고 기각된다**.

## Canvas Background Correction

브라우저는 root element의 background를 canvas에 전파하고, root가 투명하면 body의
것을 쓴다. clone은 관측된 `<html>`/`<body>`를 안쪽 `div`로 렌더하므로 아무것도
전파되지 않는다.

비교 전에 **양쪽을 UA default까지 해석한다.** 관측된 root background가
`rgb(255, 255, 255)`이고 clone의 framework `<html>`/`<body>`가 둘 다
`rgba(0, 0, 0, 0)`이면 **같은 canvas를 그린다** — 투명한 root는 user agent의 흰
canvas를 그대로 보여주기 때문이다. 이것을 해석하지 않았을 때 domainchecker의 12개
page/viewport **전부**에서 correction candidate가 나왔고, 그중 눈에 보이는 차이는
하나도 없었다.

## Interaction State Style Correction

원본 after-state에서 실제로 다른 property만 저장한다 (item 97). 90개 style
object를 통째로 복제하지 않는다. selector 필드는 없다 — patternId ·
targetNodeId · state · property map으로만 범위가 정해진다 (item 96).

## Safe Data Image Recovery

Task 09 `rendered.html`을 Task 13의 alignment 정책으로 **다시 검증한 뒤에만**
읽는다. 게다가 두 개의 독립적인 검사가 일치해야 한다: Task 13의
`alignRenderedHtml()`이 `aligned`를 보고하고, 이 모듈의 bounded walk가 같은 element
count와 tag sequence를 재현해야 한다. 수확 범위는 `<img>`의 `src` 하나뿐이다.

거부 사유 (모두 fixture로 검증):

- viewport가 align되지 않음 → 복구 없음
- `data:` URI가 아님 → 범위 밖
- MIME이 raster 5종이 아님 → 거부 (**SVG 포함**: script를 담을 수 있는 markup이고,
  "먼저 정제한다"는 이 Task가 열 이유가 없는 두 번째 보안면이다)
- base64/percent 인코딩 파싱 실패 → 거부
- 선언된 MIME과 magic bytes 불일치 → 거부
- decoded 1 MiB 초과 → 거부

통과한 것만 content-addressed 파일(`<sha256>.<ext>`)로 저장되고, corrected app의
`public/wr/qa-assets/`로 복사된다. decoded payload는 JSON에도, 브라우저
JavaScript에도 들어가지 않는다.

## Explicit Non-Auto-Fix Categories

| category | 이유 | routing |
| --- | --- | --- |
| font binding | filename heuristic으로 `@font-face`를 만들지 않는다 | `requires-font-binding-observation` |
| remote asset materialization | redirect · DNS rebinding · private IP · auth · SSRF policy가 따로 필요하다 | `requires-asset-materialization` |
| unknown behavior | 어떤 증거로도 금지 | `requires-pattern-modeling` |
| family representation gap | representative DOM에 patch하는 것은 overfitting | `requires-exact-observation` |
| source drift | 답은 re-observe이지 과거 SiteSpec을 현재로 고쳐 쓰는 것이 아니다 | `requires-reobserve` |
| geometry / layout cascade | clone box model의 "맞는 y"를 관측한 적이 없다 | — |

## Correction Acceptance / Rejection

각 correction은 **제안되는 순간** 자신을 판정할 metric을 함께 기록한다
(`targetMetric`: 이름 · before · requiredAtMost). 수락은 그 숫자 하나를 다시
재는 것이다. pixel metric이 조금 좋아졌다는 사실은 대체재가 아니다 (item 121).

no-regression gate (item 120): 모든 route 렌더 · runtime error 증가 없음 ·
content mismatch 증가 없음 · verified behavior mismatch 증가 없음 · unknown
behavior 구현 여전히 0 · form write 0 · generator invariant PASS.

**gate의 양쪽은 두 pass가 모두 측정한 것으로 제한된다.** 이것은 완화가 아니라
gate가 의미를 갖게 하는 조건이다. baseline pass에서 replay를 거부하고 corrected
pass에서 응답한 live site는 clone에 아무 변화가 없어도 raw mismatch 수를 움직인다.
nextjs.org가 정확히 그렇게 했다: 한 pass에서 21개 pattern이 `unverifiable`,
다음 pass에서 0개가 되면서 "4 → 9 mismatch"라는 없는 regression을 만들었고, 자기
target metric이 전부 0으로 떨어진 correction 3개를 기각시켰다. 그래서 behavior
gate는 두 pass가 실제로 판정한 pattern의 **교집합**을, content gate는 양쪽에서
완료된 page만 비교한다.

gate가 실패하면 iteration 전체를 기각한다 — 두 correction이 함께 만든 손상에서
생존자를 고르는 것은 이 Task가 하지 않는 추측이다.

## Correction Iterations

```
q000 baseline → propose → apply → generate q001 → clone-only recapture
     → 저장된 original evidence와 비교 → accept / reject
```

**original은 baseline에서 한 번만 방문한다** (item 118). correction iteration은
이미 저장된 증거에 대고 clone을 다시 잰다. 그렇지 않으면 사이트 자신의 drift와
네트워크 변동이 loop noise로 들어오고, correction이 우연히 좋아 보일 수 있다.

`--max-fix-iterations` 기본 2. iteration이 더 시도할 것이 없으면 그 전에 멈추고,
"끝났다"와 "한도에 걸렸다"는 보고서에서 다른 문장이다.

corrected clone은 `iterations/q00N/reconstruction/`에 생성된다. Task 14 baseline
app은 건드리지 않는다.

## Fixture Tests

`pnpm smoke:reconstruction-qa` — **134 checks**, 두 반쪽.

**offline half** (browser 없음, 손으로 만든 evidence). 차이를 *무엇으로 부를지*
결정하는 모든 것이 stored evidence의 순수 함수이므로 여기서 검증한다:

- screenshot metric: identical → 0, opposite → ratio 1 / mean 255, 높이가 다른
  이미지 → heightDelta 보고 + overlap만 비교 + commonAreaRatio 0.5, **resize
  없음**, 한쪽이 없으면 `available: false`
- data URI safety gate: 정상 raster PNG 수락(+content hash) / **SVG 거부** /
  `text/html` 거부 / `application/*` 거부 / 잘못된 base64 거부 / 잘린 tail 거부 /
  **PNG라고 선언했지만 바이트는 JPEG인 것 거부** / 1 MiB 초과 거부 / 평범한 URL은
  범위 밖
- correction policy: closed type 3개만, drift된 페이지는 canvas correction을
  만들지 못함, open-state 증거가 없으면 제안 없음, **선언을 끊을 수 있는 CSS 값은
  정제되지 않고 기각**, 실제로 다른 property만 저장, bytes는 artifact 옆에 별도
  파일로, 보이지 않던 snapshot 이미지는 복구하지 않음, id는 정렬 후 부여, 같은
  evidence → byte-identical
- acceptance/regression gate: metric을 고치면 수락 / CSS만 바뀌고 아무것도 고치지
  못하면 기각(이유 명시) / route·runtime·content·behavior 악화, unknown 구현,
  form write, generator invariant 실패는 각각 gate를 실패시킴
- classification: 도착 순서가 아니라 정렬 순서로 id 부여, 모든 diff에
  recommendation + upstream stage, drift는 절대 auto-fix 대상이 아님, 20개 node가
  하나의 cascade로(first divergence + 공통 조상), 8개 descendant가 하나의
  inherited group으로, sub-layout-unit 길이 차이는 mismatch가 아니지만 따로 세짐
- canvas rule: 흰 root vs 투명 clone canvas는 **mismatch 아님**, 어두운 root vs
  투명 clone canvas는 mismatch, 어두운 root를 clone body가 맞추면 mismatch 아님
- alignment: 일치 / element count 불일치 / tag sequence 불일치 / parent relation
  불일치 / capture 없음
- content: raw 동일 → exact, whitespace는 clone 비교에서 정규화되지 않음, drift
  비교에서는 정규화됨
- runtime attribution: CORS 차단 이미지는 JS error가 아님, 별도 계상,
  `TypeError`는 JS error, `pageerror`는 내용과 무관하게 항상 JavaScript
- sampling policy: family audit cap 4, unknown cap 8, signature priority 순서

**live half** (진짜 서버 + 진짜 Chromium). 로컬 HTTP 서버가 **원본** 역할을 하고,
진짜 Task 03/09 observer가 관측하고, 진짜 Task 13 compiler가 SiteSpec을 만들고,
진짜 Task 14 generator가 clone을 만들고, 진짜 Task 15 QA가 셋을 비교한다. fixture
사이트는 어두운 `html` background(canvas), CSS로 숨긴 disclosure(`display:none` →
`display:flex`), `메뉴 열기` unknown trigger, family-represented member route를
담고 있다.

- 모든 exact-observed page/viewport QA 완료, 모든 route 렌더, snapshot content
  fidelity exact, drift 없는 원본은 구조적으로 align, clone runtime error 0
- canvas mismatch 탐지 → correction 제안 → **적용 후 수락**
- 원본의 open state 관측(`display:flex`) vs clone의 `display:revert` →
  `interaction-target-style-mismatch` → correction 제안
- unknown `메뉴 열기` → gap 탐지, clone은 아무 것도 하지 않음, auto-fix 0
- family-represented route 감사 → `requires-exact-observation`
- corrected manifest가 QA provenance 기록, **Task 14 baseline app은 변경되지
  않음**, corrected app의 CSS는 template에서 생성됨
- 그 다음 **서버의 내용을 바꾸고** 다시 QA → `source-content-drift` 탐지,
  clone의 content fidelity는 그대로 exact, clone content-mismatch는 하나도
  만들어지지 않음, drift는 auto-fix되지 않음
- snapshot-only 2회 실행이 동일하게 분류하고 동일한 correction을 제안

## Existing Regression

| | 결과 |
| --- | --- |
| `pnpm typecheck` | PASS |
| `pnpm smoke:verifier` | 81/81 PASS |
| `pnpm smoke:selector` | 81/81 PASS |
| `pnpm smoke:multi-observer` | 58/58 PASS |
| `pnpm smoke:interaction-detector` | 92/92 PASS |
| `pnpm smoke:interaction-explorer` | 95/95 PASS |
| `pnpm smoke:interaction-patterns` | 88/88 PASS |
| `pnpm smoke:sitespec` | 252/252 PASS |
| `pnpm smoke:reconstruction` | 178/178 PASS |
| `pnpm smoke:reconstruction-qa` | **134/134 PASS** |

**Task 14 baseline regression.** 4개 SiteSpec 전부를 `pnpm reconstruct`로
corrections 없이 재생성하고 Task 14 baseline과 비교:

| site | app | manifest |
| --- | --- | --- |
| domainchecker.co.kr | IDENTICAL | IDENTICAL |
| seoworld.co.kr | IDENTICAL | IDENTICAL |
| nextjs.org | IDENTICAL | IDENTICAL |
| developer.mozilla.org | IDENTICAL | IDENTICAL |

(`next-env.d.ts`는 `next build`가 만드는 파일이라 비교에서 제외했다 — generator의
출력이 아니다.)

## Real Site Runs

4개 사이트 모두 최신 Task 14 reconstruction에 대해 baseline run과 `--auto-fix`
run을 각각 수행했다 (총 8 run).

### 정적 fidelity (SiteSpec ↔ clone — 계약)

| site | pairs | completed | content exact | style mm | sub-LU (별도) | geom median | geom p95 | docH Δ median | mean Δ | changed px | JS err | blocked asset | unstable |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| domainchecker.co.kr | 12 | 12 | **1.0** | 913 | 1,093 | 0.03px | 10.82px | 0.20px | 8.50 | 0.110 | 0 | 0 | 1 |
| seoworld.co.kr | 38 | 38 | **1.0** | 158 | 1,100 | 0.00px | 1.00px | 0.14px | 7.72 | 0.073 | 0 | 0 | 0 |
| nextjs.org | 30 | 30 | **1.0** | 518 | 4,228 | 0.94px | 32.60px | 0.25px | 5.94 | 0.075 | 0 | 0 | 1 |
| developer.mozilla.org | 24 | 8 | **1.0** | 687 | 2,586 | 1,736.68px | 2,128.51px | 0.21px | 15.82 | 0.279 | 0 | 53 | 12 |
| **합계** | **104** | **88** | **1.0** | **2,276** | **9,007** | | | | | | **0** | **53** | **14** |

- **104개 exact page/viewport 전부 QA되었다.** `completed`가 88인 것은 MDN 16개
  page/viewport에서 live original이 구조적으로 drift해 상태가 `source-drift`가
  되었기 때문이다 — snapshot↔clone 측정은 그 24개에서도 전부 수행됐다.
- **content exact ratio는 네 사이트 모두 1.0.** 148,373개 node의 text가 raw
  문자열 수준에서 정확히 일치한다.
- clone의 **JavaScript runtime error는 0**이다. MDN의 53개 console error는 전부
  cross-origin 차단 asset이고, item 54대로 JS와 분리해 보고한다.

### Live original drift

| site | attempted | aligned | structural drift | content drift (pairs/nodes) | style drift (pairs/props) | load fail |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| domainchecker.co.kr | 12 | 12 | 0 | 2 / 80 | 3 / 271 | 0 |
| seoworld.co.kr | 38 | 38 | 0 | 2 / 2 | 1 / 2 | 0 |
| nextjs.org | 30 | 30 | 0 | 20 / 40 | 1 / 2 | 0 |
| developer.mozilla.org | 24 | **8** | **16** | 0 / 0 | 3 / 389 | 0 |
| **합계** | **104** | **88** | **16** | **24 / 122** | **8 / 664** | **0** |

MDN은 24개 중 16개가 구조적으로 drift했다 — Task 09 관측(8월 13일) 이후 문서
페이지가 실제로 바뀌었다. 그 16개에서는 node-by-node live 비교를 수행하지 않고
`requires-reobserve`로 라우팅한다. **clone은 이 때문에 한 번도 비난받지 않는다.**

### Live fidelity (drift 없는 page만)

| site | comparable pairs | content exact | style mm | changed px median |
| --- | ---: | ---: | ---: | ---: |
| domainchecker.co.kr | 9 | 1.0 | 748 | 0.119 |
| seoworld.co.kr | 35 | 1.0 | 157 | 0.073 |
| nextjs.org | 9 | 1.0 | 58 | 0.097 |
| developer.mozilla.org | 5 | 1.0 | 182 | 0.270 |

### Behavior equivalence

**Task 14의 "98/98 runtime binding"은 "98/98 behavioral equivalent"가 아니다.**
그 주장을 검증하기 위해 98개 confirmed pattern을 전부 양측에서 재생했다.

| site | source | replayed | equivalent | mismatch | source-drifted | unverifiable |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| domainchecker.co.kr | 13 | 13 | **13** | 0 | 0 | 0 |
| seoworld.co.kr | 7 | 7 | **7** | 0 | 0 | 0 |
| nextjs.org | 45 | 45 | **36** | **9** | 0 | 0 |
| developer.mozilla.org | 33 | 33 | **33** | 0 | 0 | 0 |
| **합계** | **98** | **98** | **89** | **9** | **0** | **0** |

pattern type별: `disclosure` 50/50 equivalent, `selection` 30/30 equivalent,
`dismiss` 3/3 equivalent, `tabs` 6/6 selection-equivalent (**panel unverified**),
`menu` 0/9 equivalent — 9개 전부 `dynamic-target-content-unobserved`.

### Unknown interaction

| site | signature groups | sampled | gaps detected | clone no-op | auto-fixed |
| --- | ---: | ---: | ---: | ---: | ---: |
| domainchecker.co.kr | 3 | 3 | 0 | 1 | 0 |
| seoworld.co.kr | 2 | 2 | **2** | 2 | 0 |
| nextjs.org | 7 | 7 | 0 | 7 | 0 |
| developer.mozilla.org | 1 | 1 | 0 | 0 | 0 |
| **합계** | **13** | **13** | **2** | **10** | **0** |

### Routes / Family audit

| site | routes rendered | family routes audited | major mismatch |
| --- | ---: | ---: | ---: |
| domainchecker.co.kr | 19/19 | 2 | 0 |
| seoworld.co.kr | 30/30 | 4 | 0 |
| nextjs.org | 40/40 | 4 | **2** |
| developer.mozilla.org | 23/23 | 4 | **2** |
| **합계** | **112/112** | **14** | **4** |

## domainchecker Results

12 page/viewport, 전부 완료. **content exact 1.0 · JS runtime error 0 · route
19/19 · behavior 13/13 equivalent.** live original은 12/12 구조적으로 align.

특징적인 것 두 가지.

- **verified pattern 13개 중 8개가 `native-details`**이고 전부 equivalent다.
  이 사이트가 open-state style correction의 `stateHook` 문제를 드러냈다: 처음에는
  correction rule을 runtime marker에 걸어 5건 전부 아무것에도 적용되지 않고
  (올바르게) 기각됐다. `[open]`으로 고친 뒤 4건 제안 → 4건 수락 (2건 완전 해소).
- **`source-content-drift` 11건 중 9건이 asset**이다. Task 09가 decode한 블로그
  썸네일을 지금은 live original도 decode하지 않는다 (lazy loading). clone이
  사이트의 현재 동작을 재현하는 것이므로 clone defect가 아니다.

geometry는 median 0.03px / p95 10.82px으로 corpus에서 두 번째로 좋다. worst는
`/blog/check-domain-availability` mobile (p95 36.8px).

## seoworld Results

38 page/viewport (corpus 최대), 전부 완료. **content exact 1.0 · JS runtime error
0 · route 30/30 · behavior 7/7 equivalent · structural drift 0 · unstable 0.**
geometry median 0.00px / p95 1.00px — **corpus에서 가장 정확한 재구성**이다.

가장 중요한 결과는 fidelity가 아니라 **탐지**다. Task 12가 이름 붙이기를 거부한
seoworld의 `메뉴 열기` hamburger — Task 14가 의도적으로 no-op으로 둔 것 — 을
Task 15가 **2개 signature 전부에서 gap으로 검출했다.** 원본은 클릭 시
`aria-label`을 뒤집고, clone은 아무 것도 하지 않는다.

`unknown-behavior-gap` 2건은 `requires-pattern-modeling` / upstream
`pattern-modeling`으로 라우팅되고 **auto-fix는 0**이다. correction engine은
한국어 메뉴 문자열로 어떤 rule도 만들지 않았다.

open-state style correction 2건 제안 → 2건 수락 (1건 완전 해소).

## nextjs Results

30 page/viewport, 전부 완료. **content exact 1.0 · JS runtime error 0 · route
40/40 · structural drift 0.** 87,191개 node를 비교했다 — corpus 최대.

세 가지 중요한 결과.

1. **canvas background mismatch가 실제로 존재하는 유일한 사이트다** (30
   page/viewport 전부). 관측된 document root background가 clone의 canvas에
   전파되지 않는다. correction 1건 → **1 → 0으로 완전 해소, 수락**.
2. **dynamic menu 9/9이 `dynamic-target-content-unobserved`.** 원본은 자식이 있는
   region을 mount하고 clone은 관측된 tag/role만 있는 빈 region을 mount한다. Task
   14가 예고한 gap을 Task 15가 정확히 그대로 측정했다. auto-fix 0.
3. **tabs 6개는 selection equivalent, panel unverified.** `aria-controls`가 자기
   자신을 가리키는 id churn 때문에 target 축은 증거가 될 수 없다.
   full tab equivalence라고 주장하지 않는다.

`asset-missing` 325건은 Task 14 보고서가 `data:` URI 문제로 예상했던 것인데,
실제 원인은 달랐다 (Upstream Fix Candidates 1 참조). live original이 그리는
이미지를 clone이 `src` 없이 비워 두므로 전부 실제 visible gap이다.

family audit 4개 중 2개에서 major mismatch — `blog/next-12-2`는 content
divergence 0.500 / structure 0.453으로, blog index representative로 렌더되는
것이 명백히 부적절하다. **generator defect가 아니라 selection gap이다.**

## MDN Results

24 page/viewport. **content exact 1.0 · JS runtime error 0 · route 23/23.**
그러나 corpus에서 가장 어려운 사이트다.

- **16/24가 구조적으로 drift했다.** Task 09 관측(8월 13일) 이후 문서가 실제로
  바뀌었다. 그 16개는 node-by-node live 비교를 하지 않고 `requires-reobserve`로
  라우팅한다.
- **12 pair가 측정 불안정**이다. 두 번의 capture 사이에 geometry가 계속 움직인다.
- **53개 console error가 전부 cross-origin 차단 asset**이다. item 54대로
  `asset-hotlink-blocked`로 분리했고 **JS error는 0**이다.
- **geometry median 1,736px**은 sidebar scroll offset이 지배한다 (Remaining
  Unresolved Issues 1). 문서 높이는 정확히 일치한다.

`display: revert` fallback은 Task 15 auto-fix의 핵심 canary였고, **4개 disclosure
target에서 원본의 실제 열린 상태 style과 다르다는 것이 직접 관측으로 확인됐다.**
correction 6건 제안 → 6건 수락 (2건 완전 해소, 4건 부분 개선).

## Manual Review

각 사이트의 worst visual 3 / worst geometry 3 / interaction mismatch /
auto-fixed case를 diff PNG와 artifact로 직접 확인했다.

가장 중요한 검수 결과는 MDN `p000001/desktop`의 diff 이미지다. 19,739px이라는
median y delta만 보면 "clone이 페이지를 완전히 잘못 배치했다"로 읽히지만, diff
이미지는 정반대를 보여준다: **본문·헤더·푸터·"In this article"이 전부 제자리에
있고**(회색), 빨간 영역은 (a) 원본이 화면 밖으로 스크롤해 둔 sidebar 목록,
(b) 원본이 숨기는 dropdown menu 내용, (c) code block 본문, (d) 하단 embed 영역이다.
DOM을 따라가 보니 `<aside overflow-y:auto height:802px>` 안의
`<nav height:24,803px>`가 관측 시점에 18,106px 스크롤된 상태였다. **숫자는
사실이지만 그 원인은 clone의 레이아웃이 아니라 재현할 수 없는 scroll 상태다.**

`false attribution` 발견 여부: **최종 실행 기준 0건.** 다만 그 결론에 도달하기까지
직접 발견하고 고친 오분류가 다섯 건, taxonomy 수정이 한 건 있다 — canvas UA
default(12/12 page 오탐), sub-layout-unit 길이(2,002건 오탐), lazy image(31건
오탐), native `<details>` correction hook, regression gate 교집합, CORS를 JS
error로 집계(84건/페이지). 전부 "Problems Encountered"에 기록했다.

item 171이 지목한 noise 원인별 확인:

| noise | 처리 |
| --- | --- |
| animation | 두 번 capture해 계속 움직이면 `environment-unstable` (15건). 원본 CSS를 끄지 않는다 |
| live source drift | 3-way로 분리, 81건이 `source-*`로 라우팅, clone에 전가 0 |
| fonts | conjunction 없이는 font 탓으로 돌리지 않는다 (`font-binding-missing` 0건) |
| external assets | CORS/CORP 차단은 `asset-hotlink-blocked`, JS error와 분리 |
| scrollbars | 두 캡처가 동일 viewport/DPR/UA를 쓴다. 문서 폭 차이는 별도 metric |
| timestamp text | content mismatch 0건 — 이번 corpus에서는 나타나지 않았다 |

## Source Drift Results

`source-structural-drift` 16건 (MDN 전부, 34,152 node 대표) ·
`source-content-drift` 57건 · `source-style-drift` 8건.

domainchecker의 `source-content-drift` 11건 중 9건은 asset이다: Task 09
snapshot이 decode한 블로그 썸네일을 **지금은 live original도 decode하지 않는다**
(lazy loading). clone이 사이트의 현재 동작을 재현하고 있으므로
`asset-source-drift`이며 reconstruction defect가 아니다.

nextjs의 `source-content-drift` 33건은 20개 page/viewport에 걸친 40개 text node —
문서 사이트가 하루 사이에 바뀐 것이다.

## Snapshot Fidelity Results

가장 자주 다른 computed-style property (사이트별):

| site | top properties |
| --- | --- |
| domainchecker.co.kr | width 637 · height 272 · grid-template-columns 4 |
| seoworld.co.kr | width 100 · height 45 · grid-template-columns 11 · grid-template-rows 2 |
| nextjs.org | width 357 · height 94 · max-width 30 · min-height 30 · background-image 6 · grid-template-columns 1 |
| developer.mozilla.org | width 338 · height 173 · grid-template-rows 78 · grid-template-columns 74 · min-height 24 |

`width`/`height`가 상위에 오는 것은 **layout 결과**이지 authored style이 아니다 —
box가 다른 위치/크기로 배치되면 computed used value가 따라 움직인다. 진짜 신호는
MDN의 `grid-template-rows` 78 / `grid-template-columns` 74다 (아래 참조).

worst visual (changed pixel ratio):

| site | worst page | ratio |
| --- | --- | ---: |
| domainchecker.co.kr | p000006/desktop `/blog/competitor-domain-analysis-free-17` | 0.211 |
| seoworld.co.kr | p000017/mobile `/blog/how-404-errors-affect-seo` | 0.190 |
| nextjs.org | p000013/desktop `/blog/next-11` | 0.146 |
| developer.mozilla.org | p000006/mobile `/docs/Web/HTML/How_to/Use_data_attributes` | 0.443 |

worst geometry (y p95):

| site | worst page | p95 |
| --- | --- | ---: |
| domainchecker.co.kr | p000005/mobile `/blog/check-domain-availability` | 36.8px |
| seoworld.co.kr | p000001/mobile `/` | 375px |
| nextjs.org | p000014/desktop `/docs/app/guides/migrating/from-create-react-app` | 1,602px |
| developer.mozilla.org | p000001/desktop `/docs/Glossary/Safe/HTTP` | **19,739px** |

## Live Fidelity Results

위 표 참조. drift가 없는 58 pair에서 content exact ratio는 네 사이트 모두 1.0이고,
changed pixel ratio median은 0.073–0.270이다. drift page와 절대 합치지 않는다.

## Family Representation Results

14개 family-represented route를 감사해 4건에서 major mismatch를 발견했다:

| route | content divergence | structure divergence |
| --- | ---: | ---: |
| `nextjs.org/blog/next-12-2` | 0.500 | 0.453 |
| `nextjs.org/docs/app/api-reference/adapters/creating-an-adapter` | 0.270 | 0.023 |
| `MDN /docs/Web/JavaScript/.../DataView/setUint32` | 0.272 | 0.366 |
| `MDN /docs/Web/HTTP/Reference/Headers/X-Forwarded-For` | 0.324 | 0.175 |

전부 `family-representation-gap` → `requires-exact-observation`, upstream
`selection`. **generator defect로 분류하지 않았고 auto-fix도 0이다.**
`nextjs.org/blog/next-12-2`가 blog index의 representative로 렌더되는 것은 Task
07/08 family 규칙의 한계이지 Task 14의 버그가 아니다.

## Behavior Equivalence Results

- **domainchecker 13/13, seoworld 7/7, MDN 33/33 equivalent.** `<details>` 8개,
  ARIA disclosure, checkbox/radio selection, dismiss 모두 원본과 같은 상태
  전이를 보인다.
- **nextjs tabs 6개**: `aria-selected` 전이는 원본과 동일하다. panel 축은 증거로
  쓰지 않았고 (`aria-controls`가 자기 자신을 가리키는 id churn) 결과에
  `tabpanel-unverified`가 남아 있다. **full tab equivalence라고 주장하지 않는다.**
- **nextjs dynamic menu 9개**: 원본은 자식이 있는 region을 mount하고 clone은 관측된
  tag/role만 있는 빈 region을 mount한다. 9/9 전부 `dynamic-target-content-unobserved`,
  auto-fix 0, `requires-new-interaction-observation`.
- **MDN open-state**: 4개 disclosure target에서 원본의 열린 상태 computed style을
  관측했고, clone의 `display: revert` 계열과 다른 property를 찾아 correction 4건이
  제안·수락됐다.
- **seoworld unknown hamburger**: 2개 signature 전부에서 gap을 **탐지했다**. 원본은
  `aria-label`을 뒤집고 clone은 아무 것도 하지 않는다. 이 탐지 자체가 PASS
  조건이며, auto-fix는 0이다.

## Root Cause Breakdown

| classification | occurrences | affected nodes | auto-fix eligible | auto-fixed | upstream |
| --- | ---: | ---: | ---: | ---: | --- |
| `style-mismatch` | 1,116 | 3,026 | 0 | 0 | reconstruction |
| `geometry-mismatch` | 1,251 | 11,513 | 0 | 0 | reconstruction |
| `layout-cascade` | 369 | 42,503 | 0 | 0 | reconstruction |
| `asset-missing` | 325 | 325 | 0 | 0 | **observation** |
| `source-content-drift` | 57 | 155 | 0 | 0 | source-site |
| `source-structural-drift` | 16 | 34,152 | 0 | 0 | source-site |
| `asset-hotlink-blocked` | 17 | 53 | 0 | 0 | reconstruction |
| `environment-unstable` | 15 | 236 | 0 | 0 | qa |
| `interaction-target-style-mismatch` | 14 | 14 | **14** | **14** | reconstruction |
| `canvas-background-mismatch` | 30 | 30 | **30** | **30** | reconstruction |
| `dynamic-target-content-unobserved` | 9 | 9 | 0 | 0 | interaction-exploration |
| `source-style-drift` | 8 | 184 | 0 | 0 | source-site |
| `asset-load-failure` | 4 | 4 | 0 | 0 | reconstruction |
| `family-representation-gap` | 4 | 4 | 0 | 0 | selection |
| `unknown-behavior-gap` | 2 | 2 | 0 | 0 | pattern-modeling |
| `inferred-breakpoint-runtime-defect` | 2 | 2 | 0 | 0 | reconstruction |
| **합계** | **3,239** | **92,212** | **44** | **44** | |

**`content-mismatch` 0건 · `structure-mismatch` 0건 · `route-mismatch` 0건 ·
`runtime-error` 0건 · `responsive-variant-runtime-error` 0건 · `unclassified` 0건.**

grouping의 효과가 여기서 보인다: `layout-cascade` 369건이 42,503개 node를
대표한다. 묶지 않았다면 geometry finding만 5만 건이 넘었을 것이다.

## Auto-Fix Results

| type | proposed | eligible | applied | accepted | rejected |
| --- | ---: | ---: | ---: | ---: | ---: |
| `document-canvas-background` | 1 | 1 | 1 | **1** | 0 |
| `interaction-target-state-style` | 14 | 14 | 14 | **14** | 0 |
| `safe-data-image-recovery` | 0 | 0 | 0 | 0 | 0 |
| **합계** | **15** | **15** | **15** | **15** | **0** |

| site | proposed | accepted | iterations | regression gate |
| --- | ---: | ---: | ---: | --- |
| domainchecker.co.kr | 4 | 4 | 1 | PASS |
| seoworld.co.kr | 2 | 2 | 1 | PASS |
| nextjs.org | 3 | 3 | 1 | PASS |
| developer.mozilla.org | 6 | 6 | 1 | PASS |

네 사이트 모두 **1 iteration에서 종료**했다 — 기각된 correction이 없어 두 번째
iteration이 시도할 것이 남지 않았기 때문이다 (한도 소진이 아니라 완료).

## Before / After Improvement

target metric은 correction이 **제안될 때 정해지고**, 적용 후 그 숫자 하나를 다시
잰다:

| site | correction | metric | before → after |
| --- | --- | --- | --- |
| nextjs.org | `document-canvas-background` | canvas mismatched properties | **1 → 0** |
| nextjs.org | `interaction-target-state-style` ×2 | target style mismatches | **2 → 0**, **2 → 0** |
| domainchecker | `interaction-target-state-style` ×4 | target style mismatches | 4 → 0, 4 → 1, 4 → 0, 4 → 1 |
| seoworld | `interaction-target-state-style` ×2 | target style mismatches | 2 → 1, 2 → 0 |
| MDN | `interaction-target-state-style` ×6 | target style mismatches | 2 → 0, 4 → 1 ×4, 2 → 0 |

15건 중 **8건이 완전 해소(→0)**, 7건이 부분 개선(4 → 1). 남은 1건은 대부분
`height`로, 원본의 열린 상태 높이를 고정값으로 적용하면 clone의 폰트/줄바꿈
차이만큼 다시 어긋난다 — 이것은 font binding이라는 다른 원인의 증상이며 그쪽에서
해결되어야 한다.

`safe-data-image-recovery`는 **0건이 정상**이다: nextjs의 325건
`asset-missing`은 `data:` URI가 아니라 상대 경로 `<img src>`였고(아래 upstream
참조), 복구할 `data:` URI가 corpus에 존재하지 않았다. 조건이 맞지 않으면 0건이
정상이라는 것이 item 90의 요구다.

## Remaining Unresolved Issues

남은 가장 큰 fidelity 문제 10개, 크기 순:

1. **중첩 scroll container의 scroll offset이 관측되지 않는다** — MDN
   `p000001/desktop`의 median y delta **19,739px**, 1,465/1,489 node. 수동 검수로
   확인한 실제 원인:

   ```
   n001040  <aside>  overflow-y: auto · height 802px · position: sticky   y = 189
   n001042  <nav>    height 24,803px · position static                    y = -17,917
   ```

   MDN은 sidebar 목록을 현재 항목("Safe")으로 자동 스크롤한다. 관측 시점에 그
   `<aside>`는 18,106px 내려가 있었고, `getBoundingClientRect()`는 그 상태의
   좌표를 기록한다. clone은 동일한 tree를 내부 scroller 0에서 렌더하므로 그
   subtree 전체가 그만큼 어긋난다. **문서 높이는 정확히 일치한다** (2,336 vs
   2,336) — 문서가 아니라 내부 scroller의 내용 위치만 다르다.

   즉 이 19,739px은 "clone이 레이아웃을 틀리게 했다"가 아니라 "snapshot의 좌표가
   clone이 알 수 없는 scroll 상태를 담고 있다"이다. Observer는 element의
   `scrollTop`/`scrollLeft`를 기록하지 않고, SiteSpec에도 그 필드가 없다.
2. **MDN에서 원본이 숨기는 menu가 clone에서 보인다** — diff 이미지에서 상단
   좌측의 "About MDN / Advertise with us / HTTP Observatory / Color mixer …"
   블록이 그것이다. 같은 scroll/off-screen 문제 계열이며, `grid-template-rows` 78
   / `grid-template-columns` 74 mismatch는 별개의(더 작은) whitelist 문제다 —
   Observer의 style whitelist에 `grid-template-areas` / `grid-area` /
   `grid-auto-flow` / `place-*` / `order`가 없다.
3. **nextjs dynamic menu 9개** — `dynamic-target-content-unobserved`. 원본은 자식이
   있는 menu를 mount, clone은 빈 region.
4. **nextjs asset reference 325건** — 아래 upstream 항목 1 참조.
5. **layout cascade 369건 / 42,503 node** — MDN에서는 위 scroll offset의 하류
   효과이고 (한 cascade가 24 node를 1,633px 밀어낸다), 다른 사이트에서는 대부분
   text metric 차이의 하류 효과다.
6. **MDN 코드 블록 / 임베드 영역** — diff 이미지에서 code block 본문과 하단의
   embed 영역이 통째로 다르다. 후자는 `frame-content-not-observed`(관측 경계)이고,
   전자는 syntax highlight span의 style 차이다.
7. **font binding** — `@font-face`가 컴파일되지 않는다. 이번 corpus에서
   `font-binding-missing`이 0건인 것은 font-family mismatch와 text geometry drift의
   **conjunction**을 요구했기 때문이다 (item 161). 네 사이트의 font-family는
   computed value 수준에서 일치했다.
8. **MDN cross-origin asset 53건** — CORP/CORS로 차단. `asset-hotlink-blocked`,
   materialization 필요.
9. **MDN 측정 불안정 12 pair** — 두 번의 capture가 계속 움직인다. attribution
   자체가 불가능하다.
10. **family representation gap 4건 · seoworld unknown hamburger 2건 · MDN
    inferred-breakpoint 2건** — 각각 exact observation · pattern modeling ·
    clone-only 일관성 수정이 필요하다.

## Upstream Fix Candidates

Task 15는 upstream을 고치지 않는다 (item 167). 발견한 것을 stage와 함께 보고한다.

1. **`src/observer/collect-assets.ts` — URL asset을 `type|url`로 dedup한다.**
   같은 파일을 가리키는 두 번째 `<img>`는 asset record를 받지 못하고, Task 13은
   그 node를 `assetRefs: []`로 컴파일한다. nextjs.org의 `asset-missing` 325건이
   전부 이것이다 (중복된 로고·아이콘). QA는 live original의 `img.src`가 catalog에
   **이미 있는 URL**임을 확인해 이 경우를 `requires-reobserve` / upstream
   `observation`으로 라우팅한다. `recommendedPatch`: dedup key를 asset 저장에만
   쓰고 element→asset 매핑은 element마다 유지. `reobserveRequired: true`.
2. **Observer / SiteSpec — 중첩 scroll container의 scroll offset이 없다.**
   `dom.json`은 `getBoundingClientRect()`만 기록하고 element의
   `scrollTop`/`scrollLeft`는 기록하지 않는다. 내부적으로 스크롤된 container 안의
   모든 node는 재현 불가능한 scroll 상태가 인코딩된 좌표를 갖게 된다.
   `recommendedPatch`: `overflow`가 `auto`/`scroll`인 element에 대해
   `scrollTop`/`scrollLeft`/`scrollHeight`를 수집하고 SiteSpec에 실어 renderer가
   복원할 수 있게 한다. MDN 최대 변위 19,739px이 이것으로 설명된다.
   `reobserveRequired: true`.
3. **`src/observer/types.ts` `STYLE_WHITELIST` — CSS grid 배치 property 부재.**
   `grid-template-areas` / `grid-area` / `grid-auto-flow` / `grid-auto-rows` /
   `grid-auto-columns` / `place-items` / `place-content` / `place-self` /
   `order`가 없다. MDN의 `grid-template-rows` 78 / `grid-template-columns` 74
   mismatch가 이 계열이다. `reobserveRequired: true`.
4. **Task 11 — dynamic target의 내용이 관측되지 않는다.** 9개 nextjs menu.
   `recommendedPatch`: mount된 region의 자식 tree를 bounded하게 수집하는 새 probe.
5. **Task 12 — seoworld hamburger.** `aria-label` 전이를 이름 붙일 수 있는
   증거가 없다. 새 probe 또는 pattern modeling 확장이 필요하다. **QA는 이것을
   자동으로 pattern으로 승격시키지 않았다.**
6. **Task 14 — font/`@font-face` binding.** 여전히 미컴파일.

## Storage

| site | baseline run | auto-fix run |
| --- | ---: | ---: |
| domainchecker.co.kr | 130.0 MB | 164.7 MB |
| seoworld.co.kr | 100.3 MB | 136.5 MB |
| nextjs.org | 182.7 MB | 234.3 MB |
| developer.mozilla.org | 101.1 MB | 145.3 MB |
| **합계** | **514.1 MB** | **680.8 MB** |

대부분은 보존된 screenshot과 diff PNG다 (metric JSON은 항상 저장하고, PNG는
worst 5 + correction candidate + source drift + runtime error + asset finding
page만 보존한다). auto-fix run이 큰 것은 corrected reconstruction(app + runtime
data)을 iteration 안에 포함하기 때문이다.

## Performance

| site | baseline | auto-fix |
| --- | ---: | ---: |
| domainchecker.co.kr | 217 s | 334 s |
| seoworld.co.kr | 290 s | 415 s |
| nextjs.org | 630 s | 950 s |
| developer.mozilla.org | 333 s | 475 s |
| **합계** | **1,470 s** | **2,174 s** |

phase별 분해는 각 run의 `qa-manifest.json` `timings`에 있다 (page QA · route
check · breakpoint probe · interaction QA · unknown QA · family audit ·
correction loop). page QA가 baseline 시간의 대부분을 차지한다 — page/viewport
쌍마다 clone 1회 + live original 1회 캡처에 각각 안정화·screenshot이 들어간다.

concurrency는 2로 고정했다 (허용 1–3). 외부 사이트에 높은 load를 주지 않는다.

## Determinism

- diff id / correction id는 전체 run 정렬 후에만 부여된다.
- 같은 stored evidence로 두 번 실행한 snapshot-only run이 **동일하게 분류하고
  동일한 correction을 제안**한다 (fixture로 검증).
- artifact 본문에는 provenance timestamp(`capturedAt`)만 허용된다. diff ordering,
  id, classification, correction plan에는 시계가 들어가지 않는다.
- correction asset 파일 이름은 content hash다.

## Existing Artifact Immutability

QA 실행 후 `find data/*/{site-observations,site-specs,reconstructions,interaction-explorations,interaction-models}`
에서 **수정된 파일 0개**. QA는 자기 run directory에만 쓴다. corrected
reconstruction도 `iterations/q00N/reconstruction/` 안에 생성된다.

## Task16 Readiness

blocker는 없다. Task 16이 필요로 하는 것은 이미 있다:

- 어떤 reconstruction이든 QA할 수 있는 단일 CLI (`pnpm qa:reconstruction`)
- machine-readable root cause + routing (`qa-manifest.json`의 `diffs[]`)
- opt-in correction loop와 회귀 없는 수락 기준
- Task 14 baseline 불변 보장

Task 16이 다룰 것: fresh URL → 전체 파이프라인 → SiteSpec → clone → QA →
corrections → 최종 E2E 보고. **이번 Task에서 orchestration은 구현하지 않았다.**

## Problems Encountered

측정 도구를 만들 때 가장 위험한 실패는 "틀린 답"이 아니라 "그럴듯한 답"이다.
실제 사이트를 돌려 보고 나서야 드러난 false attribution 다섯 건과 그 수정:

1. **canvas false positive (12/12 page).** 흰 root background vs 투명 clone
   canvas를 mismatch로 셌다. 투명한 root는 UA의 흰 canvas를 그대로 보여주므로
   **같은 그림**이다. 양쪽을 UA default까지 해석한 뒤 비교하도록 고쳤다.
2. **sub-pixel style noise (2,002건).** `width: 111.609px` vs `111.594px`를 style
   mismatch로 셌다. Blink의 `LayoutUnit`은 1/64px이고 두 번의 독립 layout은 최대
   2 quantum까지 벌어진다. 별도 계상으로 바꿨다.
3. **lazy image를 asset failure로 (31건).** layout box가 있다는 사실을 "이미지가
   있었다"의 증거로 삼았다. positive decode(`naturalWidth > 0`)만 증거로 인정하도록
   고치고, live original 쪽 `<img>`도 비교에 넣었다.
4. **native `<details>` correction이 아무것에도 적용되지 않았다.** open-state CSS
   rule을 runtime marker(`data-wr-revealed`)에 걸었는데, native mechanism은
   브라우저가 `<details open>`을 직접 토글하고 runtime은 listener를 붙이지 않는다.
   domainchecker의 correction 5건이 전부 (올바르게) 기각됐다. `stateHook` 필드를
   추가해 native는 `[open]`에 걸도록 했다.
5. **regression gate의 거짓 양성.** correction loop가 자체 behavior 비교를 갖고
   있었고 pattern의 transition field 대신 고정 ARIA 목록을 비교했다. 게다가 두
   pass의 `unverifiable` 수가 다르면 raw mismatch 수가 움직인다 — nextjs.org에서
   21개 pattern이 한 pass에서 unverifiable, 다음 pass에서 0개가 되며 "4 → 9
   regression"을 만들어 target metric이 전부 0으로 떨어진 correction 3건을
   기각시켰다. 비교 구현을 하나로 합치고, gate의 양쪽을 두 pass가 모두 측정한
   교집합으로 제한했다.

여섯 번째는 수정이 아니라 taxonomy 문제였다: **CORS 차단 asset이 runtime JS
error로 집계되고 있었다** (MDN 84건/페이지). item 54가 명시적으로 금지하는
혼동이라 console message를 분리했다.

## Technical Decisions

- **`pngjs`만 추가하고 `pixelmatch`는 제거했다.** 필요한 것은 threshold 없는
  결정론적 metric이고, antialiasing 휴리스틱은 이 Task가 가져서는 안 되는
  tunable이다. diff 이미지도 직접 렌더한다.
- **screenshot을 resize하지 않는다.** 크기 차이는 finding이다.
- **PASS threshold도, overall score도 만들지 않았다.**
- **behavior 비교는 구현이 하나뿐이다.** baseline과 correction loop가 같은 함수를
  쓴다 — 다르면 regression gate가 noise가 된다.
- **item 46에서 의도적으로 벗어난 한 곳**: 2 layout unit 이하의 길이 차이는
  headline mismatch에서 빼고 따로 센다. 근거는 taste가 아니라 렌더러의 표현
  한계이며, 숫자는 버리지 않고 `subLayoutUnitLengthMismatches`로 남는다.
- **asset drift 예외**를 명시적으로 문서화했다 (precedence rule 1의 유일한 예외).
- **correction은 닫힌 3 type**이고 selector/JS/React를 저장할 수 없다.
- **`--auto-fix`는 opt-in**이다. 기본 실행은 아무것도 바꾸지 않는다.

## Current Limitations

- **`safe-data-image-recovery`는 실제 사이트에서 한 번도 발동하지 않았다.** 경로
  전체(정렬 재검증 → 수확 → MIME/magic/size gate → content-addressed 저장 →
  generator 적용)는 fixture에서 검증됐지만, 이 corpus에는 복구 대상 `data:` URI가
  없었다. 실사이트 end-to-end 검증은 아직 없다.
- **`--no-live-original` / `--snapshot-only`에서는 data image 복구가 약해진다.**
  SiteSpec에 asset ref가 없는 node의 "snapshot이 이미지를 보여줬다" 증거를 live
  original에서 얻기 때문이다.
- **geometry는 원인을 자동으로 지목하지 못한다.** cascade는 first divergence
  node와 공통 조상까지만 말한다. "어떤 CSS property가 이 변위를 만들었나"는 이
  Task가 답하지 않는다.
- **stability 측정은 bounded sample(400 node)** 이고 재캡처 1회다.
- **family audit은 desktop viewport, element/text 총량 비교**만 한다. node-level
  비교는 하지 않는다 (exact observation이 없기 때문이다).
- **unknown QA는 signature당 1개**만 재생한다.
- **live original은 baseline에서 한 번만 방문**하므로, correction iteration은
  원본이 그 사이에 바뀌었는지 알 수 없다 (의도된 설계다).
- MDN처럼 **자주 바뀌는 사이트에서는 drift가 fidelity 측정을 크게 잠식한다.**
  16/24 pair가 구조적으로 drift했다. 답은 re-observe다.

## Changed Files

**신규 — `src/reconstruction-qa/` (32 파일)**
`types.ts` · `correction-types.ts` · `store.ts` · `load-inputs.ts` ·
`start-clone.ts` · `capture-page.ts` · `capture-original.ts` · `capture-clone.ts` ·
`align-original.ts` · `map-clone-nodes.ts` · `screenshot-diff.ts` ·
`content-diff.ts` · `geometry-diff.ts` · `style-diff.ts` · `asset-diff.ts` ·
`runtime-diff.ts` · `compare-behavior.ts` · `interaction-qa.ts` · `unknown-qa.ts` ·
`qa-behavior.ts` · `classify-diff.ts` · `emit-diffs.ts` · `root-cause.ts` ·
`data-image-recovery.ts` · `propose-corrections.ts` · `apply-corrections.ts` ·
`correction-loop.ts` · `qa-page.ts` · `run-correction-loop.ts` · `run-qa.ts` ·
`summarize.ts` · `index.ts`

**신규 — 기타**
`src/cli-qa-reconstruction.ts` · `src/reconstruction/qa-corrections.ts` ·
`scripts/smoke-reconstruction-qa.ts` ·
`docs/result/15-reconstruction-qa-and-automated-correction-loop-2026-08-14.md`

**수정 (Task 14 출력은 corrections 없이는 byte-identical)**
`src/reconstruction/types.ts` (manifest optional provenance 필드) ·
`src/reconstruction/plan-reconstruction.ts` (optional `corrections`) ·
`src/reconstruction/compile-node.ts` (correction 적용 branch) ·
`src/reconstruction/compile-runtime-page.ts` (전달) ·
`src/reconstruction/app-template.ts` (optional correction CSS) ·
`src/reconstruction/generate-app.ts` (correction asset 복사 + provenance) ·
`src/reconstruction/index.ts` (export) · `src/cli-reconstruct.ts` (`--corrections`) ·
`package.json` (`qa:reconstruction`, `smoke:reconstruction-qa`, `pngjs`,
`@types/pngjs`) · `README.md` · `ROADMAP.md`

## Reviewer Checklist

1. **104개 exact page/viewport snapshot 중 몇 개가 QA 완료됐는가?**
   104/104 전부. 그중 88개가 `complete` 상태이고, 나머지 16개(MDN)는 live
   original이 구조적으로 drift해 `source-drift` 상태다 — snapshot↔clone 측정은
   104개 전부에서 수행됐다.
2. **현재 live original은 몇 개 viewport에서 saved snapshot과 structural
   alignment를 유지하는가?** 88/104. domainchecker 12/12, seoworld 38/38,
   nextjs 30/30, MDN 8/24.
3. **source structural/content/style drift는 각각 몇 건인가?**
   structural 16 · content 57 (122 node) · style 8 (664 property).
4. **Snapshot vs Clone content exact ratio는?** 네 사이트 모두 **1.0**.
   content mismatch 0건.
5. **geometry median/p95 delta는 사이트별 얼마인가?**
   domainchecker 0.03 / 10.82px · seoworld 0.00 / 1.00px · nextjs 0.94 / 32.60px ·
   MDN 1,736.68 / 2,128.51px. MDN의 값은 sidebar scroll offset이 지배한다
   (Reviewer 25 참조) — 문서 높이는 정확히 일치한다.
6. **가장 자주 다른 computed-style property 10개는?**
   `width` 1,432 · `height` 584 · `grid-template-rows` 80 ·
   `grid-template-columns` 90 · `min-height` 54 · `max-width` 30 ·
   `background-image` 6 (+ 사이트별 잔여). `width`/`height`는 layout 결과이지
   authored style이 아니다.
7. **font mismatch가 실제 geometry cascade와 연결된 페이지는 몇 개인가?**
   **0.** `font-binding-missing`은 font-family mismatch와 text geometry drift의
   conjunction을 요구하는데, 이 corpus에서는 computed `font-family`가 양측에서
   일치했다. "@font-face가 없다"는 사실만으로 geometry를 font 탓으로 돌리지
   않았다.
8. **visual diff worst pages는 무엇인가?** MDN `/docs/Web/HTML/How_to/Use_data_attributes`
   (mobile, 0.443) · domainchecker `/blog/competitor-domain-analysis-free-17`
   (desktop, 0.211) · seoworld `/blog/how-404-errors-affect-seo` (mobile, 0.190) ·
   nextjs `/blog/next-11` (desktop, 0.146).
9. **canvas background mismatch는 실제로 몇 사이트에서 발견됐는가?**
   **1개 (nextjs.org)**, 30 page/viewport. 나머지 3개 사이트는 0 — 그것이 정상이고,
   미리 고치지 않았다.
10. **Task 14 reference asset failure가 실제 visual gap을 만든 사례는 몇 개인가?**
    MDN에서 `asset-hotlink-blocked` 17건(53 message), `asset-load-failure` 4건.
    MDN의 worst visual page(0.443)가 그 페이지들과 겹친다. materialization은 하지
    않았다.
11. **nextjs unresolved/data-image 사례 중 실제 visible fidelity gap은 몇 개인가?**
    325건 전부가 `asset-missing`으로 탐지됐고 **원인은 `data:` URI가 아니었다** —
    Observer의 asset dedup이 중복 URL의 element 매핑을 잃은 것이다. live original이
    `naturalWidth > 0`으로 그리는 것을 clone이 `src` 없이 비워 두므로 전부 실제
    visible gap이다. auto-fix 대상이 아니고 `requires-reobserve` / upstream
    `observation`으로 라우팅했다.
12. **family-represented audit route 중 실제 representative gap은 몇 개인가?**
    14개 중 **4개** (nextjs 2, MDN 2).
13. **98 verified patterns 중 original/clone behavior가 equivalent한 것은 몇 개인가?**
    **89/98.**
14. **mismatch는 몇 개인가?** **9** — nextjs의 dynamic menu 9개 전부.
15. **source drift 때문에 behavior comparison이 불가능했던 것은 몇 개인가?**
    **0.** `unverifiable`도 0이다.
16. **nextjs 9 dynamic target은 어떤 차이를 보이는가?** 원본은 자식이 있는
    region을 mount하고, clone은 관측된 tag/role만 있는 빈 region을 mount한다.
    9/9 `dynamic-target-content-unobserved`, auto-fix 0.
17. **nextjs tabs 6개는 selection뿐 아니라 panel behavior까지 얼마나
    equivalent한가?** selection(`aria-selected`)은 6/6 equivalent. **panel은
    검증되지 않았다** — `aria-controls`가 자기 자신을 가리키는 id churn이라 target
    축을 증거로 쓸 수 없고, 6개 전부 `tabpanel-unverified`로 기록했다.
18. **MDN open-state `display: revert`는 실제 원본과 얼마나 다른가?**
    4개 disclosure target에서 관측 가능한 차이가 있었고, correction 6건이
    제안·수락됐다 (2→0 ×2, 4→1 ×4). `display: revert`가 원본의 실제 열린 상태
    style과 다르다는 것이 직접 관측으로 확인됐다.
19. **seoworld unknown hamburger gap을 Task 15이 실제 검출했는가?** **예.**
    2개 signature 전부에서 `unknown-behavior-gap`을 탐지했다.
20. **unknown behavior를 auto-fix한 사례가 0인가?** **0.** 타입 수준에서
    `autoFixEligible: false`로 고정돼 있고, 4개 사이트 전체에서 unknown 관련
    correction은 하나도 제안되지 않았다.
21. **auto-fix correction은 몇 개 proposed/applied/accepted/rejected인가?**
    proposed 15 · applied 15 · accepted 15 · rejected 0. (제안 단계 거부도 0.)
22. **어떤 correction type이 실제 개선을 만들었는가?**
    `interaction-target-state-style` 14건 (7건 완전 해소, 7건 부분 개선) ·
    `document-canvas-background` 1건 (완전 해소). `safe-data-image-recovery`는
    조건이 맞는 사례가 없어 0건.
23. **correction 후 새로운 regression은 0인가?** **0.** 네 사이트 모두 gate PASS:
    route 112/112 렌더 유지, runtime error 증가 0, content mismatch 증가 0,
    behavior mismatch 증가 0, unknown 구현 0, form write 0, generator invariant
    PASS.
24. **source drift를 clone bug로 잘못 분류한 사례는 수동 검수에서 0인가?**
    최종 실행 기준 **0**. 다만 그 결론에 이르기까지 다섯 건의 false attribution을
    직접 발견하고 고쳤다 — canvas UA default, sub-layout-unit 길이, lazy image,
    native `<details>` hook, regression gate 교집합. 여섯 번째(CORS를 JS error로
    집계)는 taxonomy 수정이었다. "Problems Encountered" 참조.
25. **현재 남은 가장 큰 fidelity 문제 10개는?** "Remaining Unresolved Issues" 참조.
    1위는 MDN의 **중첩 scroll container offset 미관측**(최대 19,739px 변위)이다 —
    수동 검수로 원인을 확인했고, "clone이 레이아웃을 틀렸다"가 아니라 "snapshot
    좌표가 재현 불가능한 scroll 상태를 담고 있다"이다.
26. **각 문제의 upstream owner는 어느 stage인가?**
    observation 325(+grid whitelist) · reconstruction 2,803 ·
    source-site 81 · interaction-exploration 9 · selection 4 ·
    pattern-modeling 2 · qa 15.
27. **re-observation이 필요한 문제는 무엇인가?** MDN 16개 drift page/viewport ·
    nextjs asset reference 325건 · 중첩 scroll offset 수집 추가 후 재관측 ·
    grid 배치 property whitelist 확장 후 재관측.
28. **추가 interaction probe가 필요한 문제는 무엇인가?** nextjs dynamic menu 9건
    (mount된 region의 자식 tree) · seoworld unknown hamburger 2건.
29. **asset materialization이 필요한 문제는 무엇인가?** MDN의 CORP/CORS 차단
    asset 17건(53 message) + `asset-load-failure` 4건. 이번 Task는 detect ·
    classify · recommend까지만 했다 (item 108).
30. **Task 16 full E2E를 시작할 blocker가 남았는가?** **없다.**
