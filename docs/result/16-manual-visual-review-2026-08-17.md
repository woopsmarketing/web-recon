Task: 16
Title: Manual Visual Reconstruction Review
Previous: 16-final-hydration-correction-2026-08-16.md
Status: Complete

# Task 16 Manual Visual Review — 사람이 직접 본 clone

이것은 Task 17이 아니고 기능 추가도 아니다. Task 16 + final correction까지 끝난
engine이 만든 clone을 **사람이 브라우저와 스크린샷으로 직접 검수한 기록**이다.
코드 수정 0, 기존 artifact 수정 0, Git operation 0.

## 한 문장 요약

> 자동 QA는 **자기가 비교하기로 정의한 것**에 대해 정확했다. 사람이 눈으로 보니
> 그 정의 **밖에** 세 가지가 있었다 — 홈페이지가 아예 없고, interaction은 속성만
> 바뀌고 화면은 그대로이며, inline SVG 내부는 검게 칠해진다.

| # | 발견 | 자동 QA 수치 | 실제 |
| --- | --- | --- | --- |
| 1 | root homepage 부재 | `routeCheck 19/19 rendered` | 그 19개에 `/`가 없다 |
| 2 | interaction after-state | `28 equivalent / 0 mismatch` | 사용자에게 보이는 변화는 2/28 |
| 3 | inline SVG 내부 paint | `styleMismatched 481 / 4,110,264` | 햄버거가 검은 사각형, 워드마크 소실 |

---

## Review Objective

Task 15의 QA와 Task 16의 correction까지 끝난 시점에서 우리가 가진 증거는 전부
**우리가 만든 측정기가 우리가 만든 clone을 잰 숫자**였다. `contentExactRatio 1.0`,
`styleMismatched 481 / 4,110,264` (0.0117%), `behaviorEquivalent 28/28`,
`runtimeErrors 0` — 전부 합격이다.

문제는 이 숫자들이 **모두 같은 관측 경계 안에서 계산된다**는 점이다. Observer가
관측하지 않은 것은 SiteSpec에 없고, SiteSpec에 없으면 clone에 없고, clone에 없으면
QA가 비교할 node도 없어서 **mismatch가 0으로 나온다.** 즉 관측 경계 밖의 결함은
자동 QA에서 구조적으로 "합격"으로 보인다.

이 blind spot을 깨는 유일하게 값싼 방법이 사람 눈이다. 그래서:

- clone을 실제로 `next start`로 띄우고
- 원본과 clone을 **같은 관측 viewport**로 다시 찍고
- 기존 QA의 diff generator를 그대로 써서 나란히 놓고
- 검증된 interaction을 손으로 클릭해 before/after를 찍었다

새 측정 기준도, 새 diff algorithm도, 새 stage도 만들지 않았다. 이 review는
**보는 도구**이지 pipeline이 아니다.

---

## Reviewed Reconstruction

"가장 최신 파일"을 추측하지 않고 correction manifest lineage를 따라 resolve했다.

```
Task 16 final correction  run B
  ├ site observation      data/stripe.com/site-observations/2026-08-15T22-00-42-443Z
  ├ interaction explore   data/stripe.com/interaction-explorations/2026-08-15T22-02-48-476Z
  ├ interaction patterns  data/stripe.com/interaction-models/2026-08-15T22-05-07-182Z
  ├ SiteSpec              data/stripe.com/site-specs/2026-08-15T22-05-17-392Z
  └ reconstruction        data/stripe.com/reconstructions/2026-08-15T22-05-36-777Z  ← FINAL
```

| stage | run id | 이 lineage를 고른 근거 |
| --- | --- | --- |
| site observation | `2026-08-15T22-00-42-443Z` | pseudo `z-index` / `pointer-events`가 whitelist에 들어간 뒤의 **재관측** |
| interaction exploration | `2026-08-15T22-02-48-476Z` | 그 관측 위에서 재실행 |
| interaction patterns | `2026-08-15T22-05-07-182Z` | 28 verified (이전 13 → 28) |
| SiteSpec | `2026-08-15T22-05-17-392Z` | `styleRules 9523 → 9528` |
| reconstruction | `2026-08-15T22-05-36-777Z` | `nestingAdaptations: 30` + `runtimeElementNodes 74214` |

5개 reconstruction 중 두 correction이 **모두** 들어간 것은 이것 하나다.
`2026-08-15T21-30-10-515Z`는 run A(nesting fix만, 이전 SiteSpec 재사용),
`2026-08-14T12-*` 세 개는 correction 이전이다.

### corrected clone: 존재하지 않는다

correction loop는 돌았지만 아무것도 채택되지 않았다.

```
iterations 1 · autoFix true
proposedCorrections 1 / appliedCorrections 0 / rejectedCorrections 1
history[0] = { iteration: "q001", applied: 1, accepted: 0,
               rejected: 1, regressionPass: false,
               regressionFailures: ["regression-routes"] }
```

제안된 correction은 적용됐다가 **regression 검사(`regression-routes`)에서 떨어져
되돌려졌다.** 따라서 `iterations/q001/reconstruction`에 채택된 app이 없고,
**final clone은 `reconstructions/` 아래의 것이 맞다.**

### 인용한 QA run 정정

correction report §12는 run B의 QA를 `2026-08-15T22-05-54-869Z`로 적었다. 그 run은
중간에 clone server가 죽어 **26/38에서 중단**됐고 11쌍이 `clone-load-error`
(`ERR_CONNECTION_REFUSED`)다. §14 표의 수치(compared nodes 74,184 · style compared
4,110,264 / mismatched 481 · geometry median-of-p95 0.99 · unstable 17 · behavior
28 equivalent)와 byte 단위로 일치하는 것은 **`2026-08-15T22-23-22-694Z`**
(37/38 완료, 1쌍만 `source-drift`)다. 이 보고서의 QA 수치는 전부 그쪽에서 읽었다.
두 run이 잰 clone은 동일하므로 결론에는 영향이 없다.

---

## Local Clone

| 항목 | 값 |
| --- | --- |
| final clone | `data/stripe.com/reconstructions/2026-08-15T22-05-36-777Z/app` |
| local URL | `http://127.0.0.1:4300` |
| 실행 | `npx --no-install next start -p 4300` (cwd = 위 `app/`) |
| build | **기존 build 유효** — `.next/BUILD_ID` = `Qglpz1OVDTjLVY054GMEA`. clean build 하지 않았다 |
| engine | Next.js 16.3.0 · React 19.2.8 · `routeMode: catch-all` · `assetMode: reference` |

### 19/19 route HTTP status

SiteSpec의 19개 route 전부에 대해 `curl`로 재검증했다 — **19개 모두 HTTP 200,
실패 0.** QA의 `routeCheck`도 동일하다 (`checked 19 / rendered 19 / failures []`).

```
/ae/customers/dust                          200
/blog/introducing-stripes-new-api-release-process   200
/blog/japanese-payment-methods-en           200
/br/connect/marketplaces                    200
/careers/listing/creative-director-event-design/8001909   200
/customers/csfloat                          200
/customers/retell-ai                        200
/en-ca/radar                                200
/en-no/newsroom/stories/dripos-and-stripe   200
/fr/customers/atmoph                        200
/fr/guides/atlas/building-your-finance-team 200
/fr/resources/more/real-time-payments-in-thailand   200
/fr/resources/more/tax-management-systems-101-…     200
/fr/revenue-recognition                     200
/fr/use-cases/crypto                        200
/legal/becs                                 200
/legal/interac                              200
/newsroom/news/subscription-and-billing-management-report   200
/use-cases/saas                             200
```

**이 19개 목록 자체가 Finding 1이다 — `/`가 없다.**

---

## Review Artifacts

```
data/stripe.com/manual-visual-review/2026-08-16T07-09-33-407Z/
```

| 항목 | 값 |
| --- | --- |
| storage | **110 MB** |
| PNG | **58장** = route 42 (7 route × 2 viewport × {original, clone, diff}) + interaction 16 (4 pattern × 4) |
| `index.md` | 24,686 B — 사람이 읽는 검수 문서, 11절 |
| `review-data.json` | 17,740 B — 기계가 읽는 fresh 측정값 + interaction state transition |

디렉터리 구조:

```
<run-id>/
  index.md · review-data.json · review-harness.ts · probe-header-icons.ts
  p000019/ p000014/ p000011/ p000008/ p000015/ p000001/ p000005/
    desktop-original.png  desktop-clone.png  desktop-diff.png
    mobile-original.png   mobile-clone.png   mobile-diff.png
    interactions/<ipXXXXXX>/
      before-original.png  after-original.png
      before-clone.png     after-clone.png
```

### 새로 만든 review 전용 helper 2개

둘 다 **review run 디렉터리 안에만** 있다. `src/`도 `scripts/`도 건드리지 않았고,
`tsconfig.json`의 `include`가 `src/**/*.ts` + `scripts/**/*.ts`이므로 `pnpm
typecheck` 대상에도 들어가지 않는다.

| 파일 | 크기 | 성격 |
| --- | --- | --- |
| `review-harness.ts` | 16,253 B | 생성 스크립트. **production code를 import만 한다** |
| `probe-header-icons.ts` | 2,857 B | Finding 3 근거용 read-only computed-style probe |

`review-harness.ts`가 import하는 것은 전부 기존 production module이다:

```
newQaContext / gotoQa / stabilize / captureScreenshot     src/reconstruction-qa/capture-page.ts
compareImages / renderDiffImage / decodePng / encodePng   src/reconstruction-qa/screenshot-diff.ts
loadQaInputs / loadActionObservation / cssEscape          src/reconstruction-qa/load-inputs.ts
resolveLiveCandidate / SafetyGuard / waitForAnimationFrames  src/interaction-explorer/
DESKTOP_PROFILE / MOBILE_PROFILE                          src/observer/types.ts
clonePathFor                                              src/reconstruction/
```

**새 visual diff algorithm은 만들지 않았다.** diff는 기존 `renderDiffImage`
호출이다.

---

## Route Selection

브리핑이 요구한 6개 범주를 전부 덮되, "largest"가 두 뜻(노드 수 / 문서 높이)으로
갈려서 7개가 됐다. 선정 근거는 전부 QA 실측값이다.

| # | 범주 | route | pageId | 선정 이유 |
| --- | --- | --- | --- | --- |
| 1 | **homepage substitute** | `/use-cases/saas` | p000019 | ⚠️ **이 clone에 `/` route가 없다** (Finding 1). locale prefix 없는 root-level product landing page로, 전역 header · hero · section stack · footer를 모두 싣는다. 덤으로 desktop 변화율 최저(0.0482)라 "잘 될 때의 기준선"이 된다 |
| 2 | **largest page** | `/fr/revenue-recognition` | p000014 | 관측 element 수 최대 **3,346 node** (2위 3,146) |
| 3 | **longest page** | `/fr/guides/atlas/building-your-finance-team` | p000011 | 문서 높이 최대 desktop **18,585px** / mobile **28,866 CSS px**. mobile PNG는 1170×**86,598** |
| 4 | **worst desktop** | `/en-ca/radar` | p000008 | desktop changed-pixel ratio **0.1710** (최악), geometry p95 x **72px** / y 64.73px, mismatched **757 node**, `width` 불일치 48건. 동시에 interaction 최다 route (28개 중 **8개**, 유일한 `tabs` + `native-details` 2개 전부) |
| 5 | **worst mobile** | `/fr/use-cases/crypto` | p000015 | mobile changed-pixel ratio **0.1997** (최악). desktop 쪽은 이 run의 유일한 `source-drift` page |
| 6 | **interaction page** | `/en-ca/radar` + `/careers/listing/…/8001909` | p000008 · p000005 | radar가 desktop interaction 밀도 1위. careers는 **mobile** interaction을 가진 두 page 중 하나 (3 pattern 중 2개가 mobile) |
| 7 | **hydration/nesting correction 대표** | `/ae/customers/dust` | p000001 | correction report §1이 `next dev`에서 직접 재현한 바로 그 route. script가 만든 `<li>` 안 `<li>`(React #418)와 15건을 클릭 불가로 만든 `::after` `z-index` 결함이 **둘 다** 이 header에 있다 |
| 8 | (대조군) nesting 미적용 | `/careers/listing/…/8001909` | p000005 | `wr-nest` container **0개** — 30건의 nesting 적응이 전혀 일어나지 않은 4개 page 중 하나. 7번의 대조군 |

`wr-nest` container 실측(page당 desktop+mobile 2개): p000001 · p000011 · p000014 ·
p000015 · p000019 = **2**, p000005 · p000008 = **0**. 전체 15 page × 2 = 30으로
manifest의 `nestingAdaptations: 30`과 일치한다.

---

## Visual Review Method

### viewport — 관측 truth와 동일

새 profile을 만들지 않고 `src/observer/types.ts`의 것을 그대로 썼다.

| | desktop | mobile |
| --- | --- | --- |
| viewport | **1440 × 900** | **390 × 844** |
| DPR | **1** | **3** |
| touch | no | yes |
| UA | 기본 | `chromiumMobileUserAgent(browser.version())` |

공통: locale `ko-KR` · timezone `Asia/Seoul` · colorScheme `light` ·
reducedMotion `no-preference`.

### capture — QA runner의 정책 그대로

`src/reconstruction-qa/capture-page.ts`를 호출했다.

```
gotoQa(page, url)         goto(waitUntil: "load")
stabilize(page)           bounded networkidle → bounded fonts.ready
                          → 1200ms settle → 2 rAF
captureScreenshot(page)   page.screenshot({ fullPage: true, type: "png" })
```

원본과 clone은 **각각 새 BrowserContext**에서 찍었고, 두 장은 같은 정책·같은
viewport·같은 대기 시간을 거친다.

### diff — 기존 generator 재사용

`src/reconstruction-qa/screenshot-diff.ts`의 `compareImages` / `renderDiffImage`.

- **resize 하지 않는다** — 높이가 다르면 겹치는 영역만 비교하고
  `commonAreaRatio`로 노출한다
- **threshold 없음, antialiasing 보정 없음** — 1단계 차이도 변화로 센다
- alpha는 흰색 위에 합성
- diff 이미지 = **original을 옅은 회색으로 깔고, 한 채널이라도 다른 픽셀을
  `rgb(255,32,32)`로** 칠한다

> **diff PNG 읽는 법**: threshold가 없으므로 글자 가장자리의 실 같은 빨강은
> 서브픽셀 렌더링이고 정상이다. **빨강의 면적이 아니라 모양을 보라** — 덩어리로
> 뭉친 빨강, 그리고 같은 글자가 두 위치에 겹쳐 찍힌 "이중 인쇄" 빨강이 진짜
> 신호다. 후자는 텍스트가 몇 px 밀렸다는 뜻이다.

### interaction replay

Task 11이 **이미 검증한 trigger만**, Task 11의 safety guard(main-frame navigation
차단 · non-GET abort · popup close · download cancel · dialog dismiss)를 켠 채
클릭했다.

| side | locator |
| --- | --- |
| original | Task 11 `LocatorDescriptor` → `resolveLiveCandidate` |
| clone | `[data-wr-viewport="<vp>"] [data-wr-pattern-id="<ipXXXXXX>"]` (generator가 직접 찍은 exact selector) |

순서: `scrollIntoViewIfNeeded` → 400ms → before shot + state 읽기 → `click` →
`waitForAnimationFrames` → 700ms → after shot + state 읽기. before/after는 같은
스크롤 위치의 viewport shot이다.

### fresh 측정이 QA를 재현했다

이 review가 방금 다시 찍어 잰 changed-pixel ratio와 QA가 기록한 값의 최대 편차는
**0.0003**이다 (p000008 desktop 0.1709 / 0.1710, p000015 mobile 0.1997 / 0.1997,
p000019 desktop 0.0482 / 0.0482). clone은 재현 가능하고, 이 문서의 PNG는 QA가 본
것과 같은 화면이다.

---

## Finding 1 — Root Homepage Missing

### 증상

**이 clone에는 `https://stripe.com/`에 해당하는 route가 없다.** 19개 route는 전부
하위 페이지다.

### 근거 — discovery artifact 원문

`data/stripe.com/2026-08-14T12-10-05-462Z/discovery.json`:

```
provider:              firecrawl
rootUrl:               https://stripe.com/     ← 우리가 준 입력
rawCount:              19
normalizedCount:       19
duplicateCount:        0
invalidCount:          0
externalFilteredCount: 0
links:                 19   → pathname "/" 없음
```

여기서 중요한 것은 **필터 카운터가 전부 0**이라는 점이다. duplicate 0, invalid 0,
external-filtered 0 — 즉 **우리 normalization이 root를 떨어뜨린 게 아니다.**
provider가 돌려준 19개 안에 애초에 root가 없었고, 우리 pipeline은 그것을
그대로 받았다.

이후 단계는 손실 없이 흘렀다:

```
19 discovered → 19 verified → 19 selected → 19 generated routes
```

**단계마다 19를 유지했기 때문에 어느 단계에서도 경고가 뜨지 않았다.** 자동 QA의
`routeCheck: { checked: 19, rendered: 19, failures: [] }`도 완벽한 합격이다 —
"19개를 다 렌더링했다"는 참이고, "그 19개가 사이트를 대표하는가"는 아무도 묻지
않았다.

### owner

**Discovery / root-seeding policy.**

정확히는: candidate set이 `discovery.links`와 **동일하게** 정의되어 있고, 입력으로
받은 `rootUrl`이 그 집합에 union되지 않는다. root URL은 우리가 확실히 아는 유일한
URL인데도 provider 결과에 의존한다.

reconstruction engine의 결함이 **아니다** — engine은 자기가 받은 19개 route를
정확히 복원했다. verification의 결함도 아니다 — 19개를 다 통과시켰다.

### 사용자 영향

사이트에서 **가장 중요하고 가장 많이 보는 페이지**가 복제 대상에서 통째로 빠질 수
있다. 그리고 지금 구조로는 **아무 지표도 그것을 알려주지 않는다.** 복제율,
route 수, 렌더링 성공률, content exact ratio 전부 정상으로 나온다.

stripe.com은 홈페이지가 사이트에서 가장 복잡한 페이지이기도 하므로, 홈페이지가
빠지면 난이도 표본까지 같이 빠진다.

### recommendation (이 보고서에서 구현하지 않음)

> 입력 root URL은 Discovery provider 결과와 무관하게 candidate set에 **반드시**
> 포함하는 정책을 검토한다. 그리고 root가 최종 route 표에 없으면 그 자체를
> limitation으로 노출한다.

비용은 매우 낮고(집합 union 1회), 지금 이 결함을 조용히 만드는 것은 코드가 아니라
**"19 = 19 = 19"라는 무손실 파이프라인의 외관**이다.

---

## Finding 2 — Behavior Equivalence Semantics Gap

### 기존 수치

```
sourcePatternInstances  28
attempted               28
behaviorEquivalent      28
behaviorMismatch         0
sourceDrifted            0
unverifiable             0
```

### 이 숫자가 정확히 무엇을 뜻하는가

QA는 **pattern이 선언한 transition field**를 원본과 clone에서 각각 읽어 비교한다.
`aria-expanded` / `aria-selected` / `details.open`이 전부다. 그 비교에서 28/28이
일치했다 — 이것은 참이고, 값진 결과다. Task 16 correction 전에는 15건이 클릭조차
되지 않았다.

**그 문장이 말하지 않는 것**은 클릭 후 사용자가 보는 화면이다.

### 손으로 확인한 4건

| # | pattern | page / vp | trigger | 측정된 state transition |
| --- | --- | --- | --- | --- |
| A | `ip000001` disclosure / `aria-expanded` | p000001 desktop | `n000025` header nav "Products" | false → **true** (양쪽) · trigger box 차이 **0.00px** |
| B | `ip000014` **tabs** / `aria-selected` | p000008 desktop | `n001509` "For AI companies" | false → **true** (양쪽) · x 0.016px / y 0.031px |
| C | `ip000015` disclosure / **`native-details`** | p000008 desktop | `n001875` FAQ | true → **false** (양쪽) · y 0.047px |
| D | `ip000006` disclosure / `aria-expanded` | p000005 **mobile** | `n000037` 햄버거 | false → **true** (양쪽) · **0.00px** |

**state transition은 4/4 완전 일치했다.** trigger geometry도 0.05px 이내다.

그리고 눈으로 본 결과:

| # | original에서 보이는 것 | clone에서 보이는 것 | 판정 |
| --- | --- | --- | --- |
| A | **mega-menu가 열린다** — Payments / Revenue / Money management / Platforms / More 5열 + Stripe Sessions 카드 | **아무것도 안 열린다.** `aria-expanded`만 true | ❌ |
| B | tab panel 내용이 통째로 교체된다 (FreshBooks → Anthropic, 3개 칼럼 문구 전부) | 밑줄만 옮겨가고 **panel 내용은 그대로** | ❌ |
| C | FAQ 답변이 접힌다 | **FAQ 답변이 접힌다** | ✅ |
| D | **전체화면 메뉴가 열린다** — Opportunity / Compatibility / Emerging talent + "Open roles" CTA, 햄버거가 ✕로 바뀜 | **아무것도 안 열린다.** `aria-expanded`만 true | ❌ |

### 원인 — 세 갈래이고, 전부 이미 선언된 limitation이다

SiteSpec의 28개 pattern을 target 기준으로 분류하면:

| 갈래 | 수 | 상태 | 결과 |
| --- | --- | --- | --- |
| **target 미선언** | **25** | `interaction-target-not-declared` | clone에 띄울 region 자체가 없다 |
| **target 선언 + scripted** | **1** | `ip000014` tabs, `aria-controls` → `n001552`, `dynamic: false`, transition `visibility-changed` | target은 clone에 **있다.** 그런데 열린 상태의 style이 관측된 적이 없다 |
| **target 선언 + native** | **2** | `ip000015` · `ip000018`, `<details>` | **동작한다** — 주인이 브라우저다 |

reconstruction manifest가 같은 이야기를 다른 각도에서 한다:

```
dynamicTargets            0
dynamicTargetsWithContent 0
dynamicTemplateNodes      0
limitations: [ …, "interaction-open-state-style-not-observed",
                  "unknown-interaction-not-implemented", … ]
```

**동적으로 mount되는 target region은 단 하나도 포착되지 않았다.** Task 16의
`dynamicTemplate` 포착은 클릭 후 새로 mount되는 region에만 걸리는데, stripe의
mega-menu는 `aria-controls`를 선언하지 않고, tab panel은 mount가 아니라 **제자리
내용 교체**라 어느 쪽에도 해당하지 않는다.

그리고 결정적으로, **QA 자신이 이미 이것을 기록해 두었다**:

```
behavior.dynamicTargetsCompared        0
behavior.dynamicTargetContentGaps      0
behavior.dynamicTargetsWithCloneChildren 0
behavior.openStateEvidenceUsable       0     ← 28개 중 0개
behavior.targetStyleMismatchPatterns   0
behavior.tabPanelUnverified            0
```

`openStateEvidenceUsable: 0` — 28개 pattern 중 **열린 상태의 증거를 쓸 수 있었던
것이 0개**다. 즉 "28 equivalent"는 처음부터 trigger 속성만으로 계산된 값이었고,
target 쪽 증거는 한 건도 개입하지 않았다. 이 숫자는 이미 거기 있었지만, coverage
진술로 읽히지 않았다.

### 정정된 정의

```
  trigger state equivalence
≠ full user-visible behavior equivalence
```

정확한 현재 상태:

> **28/28 pattern에서 trigger 속성 전이가 일치한다.**
> **사용자가 보는 after-state가 올바른 것은 28개 중 2개이고, 그 2개는 둘 다
> native `<details>`다. scripted pattern 26개 중 올바른 after-state를 만드는 것은
> 0개다.**

### 현재 자동 QA가 검증한 것 / 하지 않은 것

| 검증 축 | 현재 coverage | 근거 |
| --- | --- | --- |
| trigger 존재 / locator 해석 | **28 / 28** | clone resolution `exact` 28건 |
| trigger geometry | **28 / 28** | 손검증 4건 모두 0.05px 이내 |
| **trigger state (`aria-expanded`/`aria-selected`/`open`)** | **28 / 28** | `behaviorEquivalent 28` |
| **ARIA state** | **28 / 28** | 위와 동일 축 (mechanism이 곧 ARIA 속성) |
| **target 존재** | **3 / 28 선언** · **0 / 28 동적 포착** | `interaction-target-not-declared` 25 · `dynamicTargets 0` |
| **target visibility** | **0 / 28** | `openStateEvidenceUsable 0` · `interaction-open-state-style-not-observed` |
| **target content** | **0 / 28** | `dynamicTargetsCompared 0` — 비교가 0건 시도됐다 |
| **visual after-state (screenshot)** | **0 / 28** | QA는 클릭 후 screenshot을 찍지 않는다. 이번 review가 처음 찍었다 |

### 이것은 interaction bug가 아니다

어느 module도 오작동하지 않았다. Explorer는 관측할 수 있는 것을 관측했고,
Pattern modeler는 관측된 것만 모델링했고, Reconstruction engine은 모델에 있는
것만 만들었고, QA는 만들어진 것만 비교했다. 각 단계가 계약대로 동작했다.

문제는 **interaction observation/model contract의 coverage boundary**가
"trigger에서 끝나고 target까지 가지 않는다"는 데 있고, 그 경계가 지표 이름
(`behaviorEquivalent`)에 드러나지 않는다는 데 있다.

### 여담 — C에도 볼 것이 있다

native `<details>`는 실제로 접힌다. 그런데 **접힌 자리에 큰 빈 공간이 남는다.**
뒤따르는 형제 요소들이 관측 당시(열린 상태)의 절대 위치를 그대로 갖고 있어 위로
흐르지 않기 때문이다. 즉 native pattern조차 "동작은 하지만 레이아웃 반응은 하지
않는다."

---

## Finding 3 — Inline SVG Paint Loss

### 증상 (스크린샷으로 직접 확인)

`p000005/interactions/ip000006/before-clone.png` 대 `before-original.png`:

- **햄버거 아이콘이 검은 사각형으로 그려진다.** 원본은 연보라 배경 + 보라색 3선
- **`stripe careers` 로고에서 `stripe` 워드마크가 통째로 사라졌다.** `careers`만
  보이고, 사라진 `stripe`는 자리(layout box)는 그대로 차지한다
- 같은 clone의 `careers` 워드마크는 **정상**이다

### 원인 — computed style을 직접 읽어 확인

추측하지 않고 양쪽 header의 computed style을 읽었다
(`probe-header-icons.ts`, read-only, 아무것도 바꾸지 않는다).

| element | original | clone |
| --- | --- | --- |
| `rect.navigation-hamburger__background` | `fill: rgb(232, 233, 255)` | **`fill: rgb(0, 0, 0)`** |
| `rect.navigation-hamburger__line` ×4 | `fill: rgb(83, 58, 253)` | **`fill: rgb(0, 0, 0)`** |
| `stripe` 워드마크 `<path>` | `fill: rgb(6, 27, 49)` | **`fill: none`** |
| `careers` 워드마크 `<svg>` + `<path>` ×7 | `fill: rgb(6, 27, 49)` | `fill: rgb(6, 27, 49)` ✅ |

### 원인 chain — 세 개의 곱

```
inline SVG subtree = opaque
        ×
original stylesheet source = 재구성하지 않음
        ×
내부 shape의 fill/stroke = 현재 observer의 관측 node scope 밖
```

1. **`svg-subtree-opaque`** — Observer의 DOM walk는 `<svg>`에서 멈추고
   `outerHTML`(+ width/height)만 저장한다 (`src/observer/collect-dom.ts:456`).
   SVG 내부 shape는 **관측 node가 아니다.**
2. **`original-stylesheet-source-not-compiled`** — stripe는 그 shape들의 색을
   자기 stylesheet에서 준다 (`.navigation-hamburger__background { fill: … }`).
   우리는 원본 stylesheet를 컴파일하지 않고 computed style만 재현하므로, class는
   markup에 남아 있지만 그 class를 정의하는 규칙이 없다.
3. **`fill` / `stroke`가 `STYLE_WHITELIST`에 없다** — `src/observer/types.ts:255`
   확인 결과 0건.

그래서 clone에는 markup만 남고 paint가 없어 SVG 기본값(`fill: black`)으로
칠해진다. 이 clone은 `inlineSvgRendered: 7,230` — 전부 같은 위험에 노출된다.

### 규칙

> **inline SVG는 `<svg>` 루트 element에 paint가 걸려 있으면 살아남고, 내부 shape가
> 사이트 CSS class로 색을 받으면 검게 죽는다.**

`<svg>` 루트는 walk가 멈추는 지점 **이전**이라 computed style이 관측된다.
`careers` 워드마크가 멀쩡하고 `stripe` 워드마크가 사라진 이유가 정확히 이 차이다.
p000001 header의 `stripe` 로고가 정상으로 보이는 것도 같은 이유다 — 페이지마다
같은 로고를 다른 방식으로 색칠하고 있어서, **결함이 사이트 전역이 아니라
산발적으로 나타난다.** 이것이 이 결함을 더 위험하게 만든다.

### 왜 QA가 이걸 0 mismatch로 보고했는가

```
comparedNodes            74,184
styleComparedProperties  4,110,264
styleMismatchedProperties      481   (fill / stroke는 이 안에 0건)
```

**QA는 관측된 node만 비교하는데, SVG 내부 shape는 관측된 node가 아니다.**
비교 집합에 존재하지 않으므로 불일치가 나올 수 없다. `styleMismatchByProperty`에
`fill`이 없는 것은 "일치했다"가 아니라 **"비교 대상이 아니었다"**는 뜻이다.

이것은 **QA 오작동이 아니다.** 현재 observation boundary 밖에 있는
**visual fidelity blind spot**이다. 그리고 이번 review가 그 경계의 시각적 비용을
처음으로 수치화한 것이다.

---

## Automatic QA vs Manual Visual Review

| Issue | Automatic QA | Manual Review | Why 자동 QA가 못 잡았나 |
| --- | --- | --- | --- |
| **root homepage 부재** | ✅ 통과 (`routeCheck 19/19 rendered`, failures 0) | ❌ **발견** — 19개에 `/`가 없다 | QA는 "SiteSpec의 route가 다 렌더링됐는가"를 묻는다. "SiteSpec의 route 집합이 옳은가"를 묻는 검사가 파이프라인 어디에도 없다. discovery→verify→select→route가 전부 19로 무손실이라 경고 신호도 없다 |
| **interaction target 부재** | ✅ 통과 (`28 equivalent / 0 mismatch / 0 unverifiable`) | ❌ **발견** — 사용자에게 보이는 변화는 2/28 | 비교 축이 trigger 속성 하나다. QA 자신이 `openStateEvidenceUsable: 0`을 기록했지만 그것은 실패가 아니라 "쓸 증거가 없었다"로 집계된다. after-state screenshot을 찍지 않으므로 화면이 안 바뀐 것을 볼 방법이 없다 |
| **inline SVG 내부 paint 소실** | ✅ 통과 (`styleMismatched 481 / 4,110,264`, `fill` 0건) | ❌ **발견** — 검은 햄버거, 사라진 워드마크 | SVG 내부 shape가 관측 node가 아니라 비교 집합에 없다. `fill`/`stroke`는 whitelist에도 없다. 존재하지 않는 node는 불일치할 수 없다 |
| p000008 레이아웃 hotspot | ⚠️ 부분 (geometry p95 72px · 757 node · `width` 48건을 **정확히 짚었다**) | ✅ 확인 — 문서 높이 +7px / mobile +18px | 이건 자동 QA가 이겼다. 사람은 "어딘가 밀렸다"까지만 보이지만 QA는 node 단위로 짚는다 |
| hydration error 0 | ✅ `runtimeErrors: 0` | ✅ 확인 — 4/4 클릭 성공 | 두 방법이 일치. correction이 실제로 먹혔다는 교차 확인 |
| lazy image 미로딩 | ✅ `assetOccurrenceLost 0` · `assetBoundImageNodes 1678/1678` | ✅ 확인 — **원본과 clone의 로딩 개수가 매 page 정확히 동일** | 두 방법이 일치. 빈 이미지는 clone의 손실이 아니라 양쪽 공통의 lazy-load 상태 |
| source drift | ✅ `source-content-drift 1,186` · `structural 1` | ✅ 확인 | 두 방법이 일치. clone 문제가 아님 |

**요약**: 자동 QA는 **자기가 비교 집합에 넣은 것**에 대해 정확하고 사람보다 훨씬
정밀하다(p000008 hotspot). 사람이 이긴 곳은 전부 **비교 집합 자체가 비어 있던
곳**이다. 두 방법은 경쟁 관계가 아니라 서로의 blind spot을 덮는다.

---

## Important Screenshots

경로는 전부 `data/stripe.com/manual-visual-review/2026-08-16T07-09-33-407Z/` 기준.
사람이 볼 권장 순서다.

| # | 경로 | 여기서 확인할 수 있는 것 |
| --- | --- | --- |
| 1 | **`p000008/desktop-diff.png`** | 최악의 desktop(0.1710). hero 일러스트가 통째로 빨간 덩어리 — 원본의 애니메이션 hero가 다른 프레임에서 잡혔다. 본문 전역의 "이중 인쇄" 빨강 = 텍스트가 몇 px씩 밀린 것(`width` p95 2–5px). 하단 footer 전체가 빨강 = 누적 offset. **여기서 안 보이는 결함은 다른 page에도 없다** |
| 2 | **`p000005/interactions/ip000006/`** 4장 | Finding 3과 Finding 2가 **한 화면에 같이 있다.** `before-clone.png`에 검은 사각형 햄버거 + 사라진 `stripe` 워드마크. `after-original.png`는 전체화면 메뉴가 열리고 햄버거가 ✕로 바뀌는데, `after-clone.png`는 `before-clone.png`와 **픽셀 단위로 같다** (둘 다 180.5 KB). 덤으로 clone의 breadcrumb이 2줄로 접히는 것도 보인다 |
| 3 | **`p000001/interactions/ip000001/after-original.png` vs `after-clone.png`** | 25/28의 한계를 가장 크게 보여주는 쌍. 원본은 5열 mega-menu + Stripe Sessions 카드가 화면 절반을 덮는데, clone은 평소 페이지 그대로다. 이 header의 `stripe` 로고는 **정상 렌더링**된다 — Finding 3이 산발적이라는 증거 |
| 4 | **`p000015/mobile-diff.png`** | 최악의 mobile(0.1997). 1170×65,286 |
| 5 | **`p000019/desktop-diff.png`** | 반대쪽 기준선(0.0482). **잘 될 때 어디까지 되는지.** 이미지·gradient 영역이 회색(=일치)으로 남고 빨강이 텍스트 가장자리에 집중된다 |
| 6 | **`p000011/mobile-*.png`** | 1170×**86,598**px 극단 케이스. 이 길이에도 문서 높이 delta는 **0px** |

---

## Current Visual Quality

숫자가 아니라 사람이 본 것을 기준으로 정리한다.

### 잘 복원된 부분

- **텍스트 내용** — 74,184 node 비교에서 content mismatch **0**, exact ratio
  **1.0**. 글자가 틀린 곳은 한 곳도 없다
- **문서 길이** — 13쌍 중 12쌍이 높이 delta **0px**. 86,598px짜리 page도 0px
- **header / hero** — p000001 desktop clone의 header는 원본과 사실상 구분되지
  않는다(로고 · 5개 nav · Sign in · Contact sales 모두 제자리). hero 헤드라인은
  **줄바꿈 위치까지** 같다. 이 header가 correction 전에 React #418을 던지고
  pseudo `::after`로 클릭을 삼키던 바로 그 header다 — **두 결함 모두 화면에서
  사라졌다**
- **hydration** — `runtimeErrors: 0`. 30건의 #418이 전부 없어졌다
- **클릭 가능성** — 손검증 4/4 성공. correction 전에는 15건이 actionability timeout
- **이미지 자산** — 원본과 clone의 로딩 개수가 **매 page 정확히 동일**하다
  (예: p000019 desktop 2/49 양쪽, p000001 desktop 0/49 양쪽).
  `assetOccurrenceLost 0`, `assetBoundImageNodes 1678/1678`. 빈 이미지는 clone의
  손실이 아니라 양쪽 공통의 lazy-load 상태다
- **style** — 4,110,264개 속성 비교에서 불일치 481개 (**0.0117%**)

### 명확히 깨진 부분

- **inline SVG 내부 paint** (Finding 3) — 햄버거가 검은 사각형, `stripe` 워드마크
  소실. 사용자가 **즉시** 알아보는 종류의 결함이고, 로고와 아이콘에 집중된다
- **scripted interaction의 after-state** (Finding 2) — 26개 중 **0개**가 올바른
  화면 변화를 만든다. mega-menu · mobile menu · tab panel 전부 열리지 않는다
- **root homepage** (Finding 1) — 존재하지 않는다
- **p000008의 sticky 제품 sub-nav** — 원본은 스크롤 시 Radar / Overview /
  Transaction fraud … 가 상단에 붙는데 clone에는 그 위치에 없다

### 부분적으로 맞는 부분

- **텍스트 위치** — 내용은 정확하지만 box 폭이 미세하게 다르다
  (`width` p95 2–5px, 사이트 전체 `width` 불일치 157건). diff의 "이중 인쇄"
  빨강이 전부 이것이다. 한 줄 안에서는 티가 안 나지만 줄바꿈 지점을 바꿀 수 있다
  — p000005 mobile의 breadcrumb이 원본은 1줄, clone은 2줄로 접히는 것이 그 예다
- **p000008 레이아웃** — 유일하게 문서 높이가 다르다(desktop +7px, mobile 6 CSS px).
  geometry p95 x **72px**, mismatched **757 node**, `width` 불일치 48건이 이 page에
  몰려 있다. 나머지 page 대비 압도적이라 **레이아웃을 가장 자세히 봐야 할 곳**
- **native `<details>`** — 접히긴 접히는데 그 자리에 빈 공간이 남는다. 뒤따르는
  형제가 관측 당시의 절대 위치를 유지하기 때문
- **전체 픽셀 유사도** — changed-ratio median **0.0883**. threshold 없는 비교라
  이 값 자체를 품질 점수로 읽으면 안 되지만, page 간 **상대 비교**로는 유효하다
  (0.0482 ↔ 0.1997의 4배 차이는 실제 차이다)

---

## Implications for E2E

이번 결과를 근거로 향후 E2E acceptance에 추가할 검증 후보다.
**이 보고서에서는 구현하지 않는다.**

### 1. input root URL coverage invariant

입력으로 받은 root URL이 최종 route 표에 있는지 확인하는 불변식. 없으면 실패나
명시적 limitation으로 노출한다. 지금은 discovery provider의 출력이 곧 candidate
set이라 root가 조용히 사라진다. 비용이 가장 낮고 효과가 즉각적이다.

### 2. interaction equivalence를 두 지표로 분리

```
triggerStateEquivalence      = 28 / 28    (현재 "behaviorEquivalent")
userVisibleTargetEquivalence =  2 / 28    (현재 측정되지 않음)
```

하나의 `behaviorEquivalent`가 두 개의 다른 질문에 같은 이름으로 답하고 있다.
이름을 분리하는 것만으로도 잘못된 합격 신호가 사라진다. **이것은 코드가 아니라
지표 정의의 문제이므로 가장 먼저 할 수 있다.**

### 3. after-state screenshot / target existence validation

클릭 후 screenshot을 원본과 clone 양쪽에서 찍고 `renderDiffImage`로 비교한다.
"원본은 바뀌었는데 clone은 안 바뀌었다"는 지금 어떤 자동 검사로도 잡히지 않는데,
이 하나로 25건이 한 번에 드러난다. 이번 review가 정확히 이 작업을 수동으로 했고
harness도 이미 그 형태다. 부수적으로 `targetExists` / `targetVisibilityChanged`도
같이 잴 수 있다.

### 4. SVG visual subtree coverage 또는 paint-preservation 전략

선택지가 여러 개이고 비용이 크게 다르다:

- **(a)** `fill` / `stroke`(+`stop-color` 등)를 `STYLE_WHITELIST`에 추가하고
  SVG 내부 shape를 관측 node로 승격 — 정확하지만 node 수가 크게 늘어난다
  (이 clone만 inline SVG 7,230개)
- **(b)** `<svg>` 루트에서 멈추되, 내부 shape의 computed paint만 별도로 수집해
  outerHTML에 인라인 주입 — 관측 그래프를 안 키우면서 paint만 보존
- **(c)** 원본 stylesheet 중 SVG paint 규칙만 선별 컴파일

**어느 쪽이 맞는지는 stripe 한 사이트로 판단할 수 없다.** 사이트마다 SVG를 쓰는
방식이 다르므로 표본이 필요하다(→ Blocker Assessment 참고).

### 5. automated QA + manual visual review 병행

이번 review의 결론이 곧 근거다. 자동 QA가 이긴 곳(p000008 hotspot을 node 단위로
짚음)과 사람이 이긴 곳(비교 집합이 비어 있던 세 곳)이 정확히 갈렸다. review
harness는 이미 production module만 조합한 형태이므로, 사이트마다 대표 route
6–8개에 대해 이 산출물을 만드는 것을 acceptance 절차에 넣을 수 있다.

---

## Blocker Assessment

| Finding | Core reconstruction blocker? | Multi-site validation blocker? | Productionization blocker? | Defer 가능? |
| --- | --- | --- | --- | --- |
| **1. root homepage 부재** | ❌ 아니다 | ✅ **그렇다** | ✅ 그렇다 | ❌ **아니다** |
| **2. behavior equivalence 의미 격차** | ❌ 아니다 | ⚠️ **지표 정의만 blocker** | ✅ 그렇다 | ⚠️ 구현은 가능, 정의는 불가 |
| **3. inline SVG paint 소실** | ❌ 아니다 | ❌ 아니다 | ✅ 그렇다 | ✅ **그렇다** |

### Finding 1 — root homepage

- **Core reconstruction blocker: 아니다.** engine은 주어진 19개 route를 정확히
  복원했다. 복원 능력의 결함이 아니라 입력 집합의 결함이다.
- **Multi-site validation blocker: 그렇다.** 다음 단계는 여러 사이트에서 데이터를
  모으는 것인데, 사이트마다 **가장 중요하고 가장 어려운 페이지**가 표본에서 빠진
  채로 쌓인다. 그 데이터로 내리는 모든 판단(난이도 분포, 성공률, 비용 추정)이
  체계적으로 낙관 편향된다. **깨진 데이터를 먼저 모으고 나중에 고치는 것이 가장
  비싸다.**
- **Productionization blocker: 그렇다.** 사용자에게 "사이트를 복제했다"고 말하면서
  홈페이지가 없는 것은 설명이 불가능하다.
- **Defer 불가.** 그리고 수정 비용이 셋 중 가장 낮다(candidate set에 seed union +
  route 표 검사).

### Finding 2 — behavior equivalence

- **Core reconstruction blocker: 아니다.** 각 module이 계약대로 동작했다. 관측/모델
  contract의 coverage 경계이지 결함이 아니다.
- **Multi-site validation blocker: 지표 정의만 그렇다.** target 관측을 구현하는
  것은 관측 방식 자체를 늘리는 큰 작업이고, 어떤 target 유형이 실제로 흔한지는
  여러 사이트를 봐야 안다 — **구현은 defer하는 편이 낫다.** 그러나 `28/28
  equivalent`라는 **이름을 그대로 둔 채 다음 사이트로 가면 안 된다.** 사이트마다
  "behavior 100%"가 쌓이고, 그 숫자가 실제로는 trigger 속성만 잰 것이라는 사실이
  데이터에서 사라진다. **지표 분리(제안 2)는 defer 불가, target 관측 구현은 defer
  가능**이라는 것이 정확한 결론이다.
- **Productionization blocker: 그렇다.** 메뉴가 안 열리는 clone은 제품이 아니다.

### Finding 3 — inline SVG paint

- **Core reconstruction blocker: 아니다.** markup은 정확히 실려 있다. 잃은 것은
  paint 하나뿐이고, 관측만 되면 렌더링은 이미 된다(`inlineSvgRendered 7,230`).
- **Multi-site validation blocker: 아니다 — 오히려 반대다.** 위 (a)/(b)/(c) 중
  무엇을 고를지는 사이트들이 SVG를 어떻게 쓰는지에 달려 있다. stripe 하나로
  결정하면 과적합이다. **여러 사이트 데이터를 먼저 모으는 것이 옳은 순서**이고,
  그 데이터를 모으는 데 이 결함은 방해가 되지 않는다(측정은 정상 동작한다).
- **Productionization blocker: 그렇다.** 로고와 아이콘이 검게 나오는 것은 사용자가
  1초 안에 알아본다. 게다가 **산발적**이라 "여기는 되는데 저기는 안 된다"는 형태로
  나타나 신뢰를 더 크게 깎는다.
- **Defer 가능.** 단, 다음 사이트들을 관측할 때 **inline SVG의 paint 출처를
  집계**해 두면(루트에 있는가 / class에서 오는가) 나중 결정이 훨씬 싸진다.

---

## Code / Artifact Integrity

| 항목 | 결과 | 검증 방법 |
| --- | --- | --- |
| production code 수정 | **0** | `src/` · `scripts/` 아래 변경 없음 |
| historical artifact 수정 | **0** | 기존 stripe.com artifact 전체 |
| mtime change | **0** | `find data/stripe.com -newermt <review 시작>` → review 디렉터리 외 **0건** |
| Git operation | **0** | `add` / `commit` / `push` 없음. `HEAD` = `2777b41` 그대로. `git status --porcelain`은 세션 시작 72 entries → 73 entries이고, 늘어난 1개는 **이 보고서 파일 자신**(`?? docs/result/16-manual-visual-review-2026-08-17.md`, untracked)뿐이다 |
| 새로 생성 | review 디렉터리 1개 | `data/stripe.com/manual-visual-review/2026-08-16T07-09-33-407Z/` (110 MB) |

부연:

- `data/`는 `.gitignore:14`에 있어 애초에 추적 대상이 아니다. 이 보고서
  (`docs/result/16-manual-visual-review-2026-08-17.md`)만 추적 대상에 새로
  생긴 파일이고, **commit하지 않았다.**
- review helper 2개는 review run 디렉터리 안에만 있고 `tsconfig.json`의
  `include`(`src/**/*.ts`, `scripts/**/*.ts`) 밖이라 `pnpm typecheck`에 영향이
  없다.
- 하지 않은 것: 새 reconstruction architecture · SEO · Tailwind ·
  componentization · asset materialization · 새 visual diff algorithm · clean
  rebuild — **전부 0.**

---

## Final Verdict

과장 없이 적는다.

**현재 engine은 "정지 화면을 옮기는 일"을 잘 한다.** 74,184개 node의 텍스트가 하나도
틀리지 않고, 410만 개 style 속성 중 481개만 다르고, 86,598px짜리 페이지의 높이가
1px도 어긋나지 않고, hydration error가 0이다. header와 hero는 원본과 나란히 놓고
봐도 구분되지 않는다. 이건 실제 성취다.

**"움직이는 것을 옮기는 일"은 아직 초입이다.** 그리고 다음 두 문장은 반드시 구분해야
한다:

> **① "state transition reconstruction이 동작한다"** — 참이다. 28/28 pattern에서
> trigger의 `aria-expanded` / `aria-selected` / `open` 전이가 원본과 일치하고,
> trigger box는 0.05px 이내다.

> **② "사용자가 보는 전체 interaction UI가 완전히 복원된다"** — **거짓이다.**
> 손으로 확인한 4건 중 화면이 실제로 바뀐 것은 1건이고, 그 1건은 브라우저가 동작을
> 소유하는 native `<details>`다. 구조적으로 보면 28개 중 2개(둘 다 native)만
> 올바른 after-state를 만들고, **scripted pattern 26개 중에서는 0개다.**

②는 **현재 어떤 pattern에서도 증명되지 않았다.** native `<details>` 2건은 우리가
복원해서가 아니라 브라우저가 대신 해줘서 동작한다.

그리고 여기에 사람 눈으로만 보이는 두 가지가 더 있다 — 홈페이지가 통째로 없고,
inline SVG 내부는 검게 칠해진다. 셋 다 **어느 module의 오작동도 아니다.** 셋 다
현재 관측·모델 계약의 **경계**이고, 이번 검수의 실제 산출물은 그 경계를 처음으로
눈에 보이게 만들었다는 것이다.

### 7개 질문에 대한 답

**1. 현재 clone을 사람이 직접 볼 수 있는가?**

그렇다. `next start -p 4300`으로 19개 route 전부 HTTP 200이고, 브라우저에서
원본과 나란히 놓고 스크롤할 수 있다. 별도 build도 필요 없었다
(`BUILD_ID` 그대로 유효). 스크린샷 58장도 준비되어 있다.

**2. 현재 visual fidelity는 실사용 검증을 시작할 수준인가?**

**정적 렌더링 검증은 시작할 수준이다.** 텍스트·레이아웃·문서 높이·style이 사람이
나란히 보고 판단할 만큼 가깝다.
**interaction 검증은 아직 아니다.** scripted pattern의 after-state가 0/26이므로,
지금 사용자에게 보여주면 "메뉴가 안 열린다"가 첫 반응이 된다.
**시각적 마감도 아직 아니다.** 로고와 아이콘이 산발적으로 검게 나오는 것은 다른
모든 정확도를 덮어버린다.

**3. 현재 `28/28 behavior equivalent`는 정확히 무엇을 의미하는가?**

**28개 pattern 전부에서 trigger element의 선언된 속성 전이가 원본과 clone에서
동일하다**는 뜻이다. 그리고 그것이 전부다. QA 자신이
`openStateEvidenceUsable: 0` · `dynamicTargetsCompared: 0`을 기록했다 — target
쪽 증거는 한 건도 개입하지 않았다. 사용자에게 보이는 after-state를 기준으로 다시
세면 **2/28**이고, 그 2개는 둘 다 native `<details>`다.

**4. homepage 누락은 어느 단계가 owner인가?**

**Discovery / root-seeding policy.** candidate set이 `discovery.links`와 동일하게
정의되어 있고 입력 `rootUrl`이 union되지 않는다. Firecrawl이 19개를 돌려줬고 그
안에 root가 없었으며, 우리 필터는 아무것도 떨어뜨리지 않았다(duplicate 0 /
invalid 0 / external-filtered 0). verification도 reconstruction도 QA도 owner가
아니다 — 셋 다 받은 19개를 정확히 처리했다.

**5. SVG paint loss는 어느 단계가 owner인가?**

**Observer.** 두 지점이다: (a) DOM walk가 `<svg>`에서 멈추고 `outerHTML`만
저장한다(`collect-dom.ts:456`, `svg-subtree-opaque`), (b) `fill`/`stroke`가
`STYLE_WHITELIST`에 없다. reconstruction engine은 받은 markup을 정확히 실었고
(`inlineSvgRendered 7,230`), QA는 관측된 node만 비교했다. 두 단계 모두 계약대로
동작했다.

**6. 이 세 finding 중 다음 multi-site E2E 전에 반드시 수정해야 할 것은?**

**Finding 1 (root homepage) — 코드 수정이 필요한 유일한 항목.**
사이트마다 가장 중요한 페이지가 표본에서 빠진 채 데이터가 쌓이면, 그 데이터로
내리는 모든 판단이 편향된다. 깨진 데이터를 모으고 나중에 고치는 것이 가장 비싸다.
수정 비용도 셋 중 가장 낮다.

**Finding 2의 지표 분리 — 코드가 아니라 정의.**
`behaviorEquivalent` 하나를 `triggerStateEquivalence`와
`userVisibleTargetEquivalence`로 나눈다. 나누지 않으면 사이트마다 "behavior 100%"가
쌓이고 그것이 무엇을 잰 숫자인지가 데이터에서 사라진다. target 관측의 **구현**은
defer하되 **이름 분리는 defer하면 안 된다.**

**7. 어떤 것은 여러 사이트 validation 데이터를 먼저 모아도 되는가?**

**Finding 3 (SVG paint) — 오히려 먼저 모으는 것이 옳다.**
해결책 (a) whitelist 확장 / (b) paint 인라인 주입 / (c) 선별 stylesheet 컴파일 중
무엇이 맞는지는 사이트들이 SVG를 어떻게 쓰는지에 달려 있고, stripe 하나로 정하면
과적합이다. 측정 자체는 정상 동작하므로 데이터 수집을 막지도 않는다. 다만 다음
관측 때 **inline SVG의 paint 출처를 집계**(루트 vs class)해 두면 나중 결정이 훨씬
싸진다.

**Finding 2의 target 관측 구현 — 같은 이유로 먼저 모아도 된다.**
stripe 하나에서도 target 유형이 세 갈래(미선언 25 / 정적+visibility 1 / native 2)로
갈렸다. 어떤 유형이 실제로 흔한지는 표본이 있어야 알 수 있고, 관측 방식을 늘리는
것은 되돌리기 비싼 작업이다.
