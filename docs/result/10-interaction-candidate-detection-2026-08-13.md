Task: 10
Title: Deterministic Interaction Candidate Detection
Previous: 09-multi-page-deep-observation-2026-08-13.md
Status: Complete

---

# Task 10 — Deterministic Interaction Candidate Detection

## 작업 목표

Task 09까지의 파이프라인은 사이트를 **정적으로** 관측하는 데까지 왔다. 4개 사이트 52페이지의
desktop/mobile DOM · computed style · geometry가 디스크에 있다. 이번 Task는 그 저장 데이터만으로
다음 질문에 답한다.

> 이 페이지에서 **무엇을 조작해 볼 근거가 저장 데이터에 존재하는가?**

그 다음 질문 — "조작하면 무엇이 일어나는가?" — 은 브라우저가 필요하므로 Task 11(Rule-Based
Interaction Explorer)의 몫이다.

이번 Task에서 **하지 않은 것**: click / hover / focus / input / select / drag / scroll exploration /
navigation / form submit — 즉 **interaction 실행 전부**. 그리고 Playwright, Firecrawl, network,
AI/LLM, before/after diff, pattern 확정(Accordion / Tabs / Modal / Carousel), SiteSpec,
reconstruction.

## Pipeline Position

```
URL
 → Discovery              (pnpm recon)
 → Verification           (pnpm verify)
 → Page Family Selection  (pnpm select)
 → Multi-page Deep Observation (pnpm observe:site)
 → Interaction Candidate Detection   ← 이번 Task (pnpm detect:interactions)
 → Rule-Based Interaction Explorer   ← 다음 Task
```

Task 07 Selector와 같은 위치의 단계다. **브라우저를 다시 켜지 않고**, 이미 저장된 관측만으로
다음 단계가 쓸 입력을 만든다. 52페이지를 다시 관측하는 비용은 0이다.

## Offline Architecture

```
data/<host>/site-observations/<run-id>/site-observation.json
      │
      ├─ loadSiteObservation()   Zod(Task 09 schema) + manifest invariant
      │
      └─ 성공한 page마다
            loadPageObservation()   Zod(Task 05 schema) + dom.json/styles.json 검증
                  │                 + styleId 무결성 + element count 교차검증
                  │
                  ├─ detectViewportCandidates(desktop)   ← 완전히 독립
                  └─ detectViewportCandidates(mobile)    ← 완전히 독립
                        │
                        ├─ classify-signals   element → 관측된 사실
                        ├─ detect-candidates  사실 → 후보 / priority / capability / guard
                        └─ detect-targets     aria-controls · popovertarget · details 관계
                  │
                  └─ pages/<pageId>/interaction-candidates.json
      │
      └─ interaction-analysis.json
```

신규 모듈은 `src/interaction-detector/` 하나다.

| 파일 | 역할 |
| --- | --- |
| `types.ts` | Zod schema + signal/capability/guard 어휘 + 정책 상수 |
| `load-observation.ts` | 입력 검증 (schema + 교차검증), fail-fast |
| `classify-signals.ts` | element 1개 → 관측된 신호 (판정 없음) |
| `detect-candidates.ts` | 신호 → 후보 여부 · priority · capability · guard |
| `detect-targets.ts` | InteractionTarget 인벤토리 + control 관계 resolve |
| `summarize.ts` | 결정적 집계 (site/capability/guard/validation 비교) |
| `store.ts` | 신규 artifact 2종 저장 (기존 파일은 건드리지 않음) |
| `analyze-site.ts` | 사이트 단위 오케스트레이션 |
| `index.ts` | barrel |

### Offline 검증 (§92)

`src/cli-detect-interactions.ts`에서 시작하는 static import graph를 기계적으로 확인했다.

```
modules reached: 16
external packages: node:crypto, node:fs/promises, node:path, zod
OFFLINE OK — no browser/network/AI dependency in the graph
```

Playwright / Firecrawl / LLM SDK / HTTP 클라이언트는 그래프에 **없다**. Observer barrel
(`src/observer/index.ts`)은 Playwright를 끌어오므로 import하지 않고, leaf module
(`observer/types.ts`, `observer/dedupe-styles.ts`)만 사용한다. 그래프에 보이는
`observer/collect-dom.ts`는 `import type`으로만 연결돼 있어 런타임에 로드되지 않는다(그 파일 자체도
import가 0개인 브라우저 코드다).

4개 사이트 실행 중 Firecrawl 0, Playwright 0, network 요청 0, browser launch 0, AI 호출 0.

## Input / Output

**입력** (모두 Task 09가 이미 쓴 파일, 읽기 전용)

```
site-observation.json
pages/<pageId>/observation.json
pages/<pageId>/viewports/{desktop,mobile}/dom.json
pages/<pageId>/viewports/{desktop,mobile}/styles.json
```

**출력** (신규 추가만)

```
data/<host>/site-observations/<run-id>/
  site-observation.json                 ← Task 09, 불변
  interaction-analysis.json             ← 신규 (site manifest)
  pages/<page-id>/
    observation.json                    ← Task 09, 불변
    interaction-candidates.json         ← 신규 (page index)
    viewports/…                         ← Task 09, 불변
```

### 입력 검증 (§6)

브라우저를 켜지 않는 단계라도 손상된 관측 위에서 그럴듯한 후보를 만들어내는 것이 가장 나쁘다.
분석 전에 4단계로 fail-fast한다.

1. `site-observation.json` → 실제 Task 09 Zod schema
2. 각 success page `observation.json` → 실제 Task 05 Zod schema
3. 각 viewport `dom.json` / `styles.json` → 실제 Observer element/style schema
4. 교차 invariant
   - manifest가 success라고 한 page에 `pageObservationFile`이 있는가
   - viewport key와 저장된 `profile.id`가 일치하는가
   - `dom.json` 길이 == `observation.json`의 `domElementCount`
   - dangling `styleId`가 없는가 (Observer의 `assertStyleReferencesResolve` 재사용)

실패한 page(`navigation-error` 등)는 **건너뛰고 카운트**한다(§7). 반면 success page의 artifact가
깨져 있으면 그것은 사이트의 사실이 아니라 파이프라인 손상이므로 즉시 중단한다.

## Candidate 정의

Interaction Candidate는 **증거에 대한 주장**이지 동작에 대한 주장이 아니다.

> "이 element에 interaction을 시도할 근거가 저장 데이터에 존재한다."

Candidate라고 해서 반드시 동작하지 않고, 반드시 안전하지 않고, JavaScript handler가 있다는 뜻도
아니고, accordion이라는 뜻도 아니다. 모든 후보는 `dom.json` / `styles.json`의 특정 값으로 역추적
가능하다.

Candidate가 0개인 페이지도 정상 결과다. 그때의 정확한 표현은 "이 페이지에는 interaction이 없다"가
아니라 다음과 같다(§66).

> **No interaction candidate was observable in the saved initial static state.**

## Candidate가 Pattern과 다른 이유

| | Interaction Candidate (이번 Task) | Interaction Pattern (이후) |
| --- | --- | --- |
| 질문 | 무엇을 조작할 수 있나 | 조작하면 어떤 상태 전이가 일어나나 |
| 근거 | 저장된 markup / computed style | 실제 action + before/after diff |
| 비용 | 0 (offline) | 브라우저 실행 |
| 산출 | element 목록 + 근거 + guard | 검증된 반복 UI 구조 |

그래서 이번 Task는 `Accordion` / `Tabs` / `Modal` / `Drawer` / `Dropdown` / `MegaMenu` /
`Carousel` 같은 **page-level pattern 이름을 확정하지 않는다**. 다만 `tab-trigger`,
`dialog-trigger`, `menu-trigger`, `disclosure-trigger` 같은 **trigger capability**는 부여한다 —
그것은 ARIA/native semantics가 markup에 직접 적혀 있기 때문이며, "이 페이지가 Tabs 패턴이다"라는
주장과는 다르다.

Link와도 구분한다. `<a href>` navigation은 이미 Observer `links.json`에 있고, 그것은 URL 관계다.
Interaction Candidate는 **페이지 내부 state/action 가능성**이다. 둘을 섞으면 문서 사이트에서
후보의 90%가 링크가 되어 detector의 가치가 사라진다(아래 Link Exclusion 참조).

## Signal Taxonomy

모든 evidence는 `{ type, value?, provenance }` 형태이고 `provenance`는 두 값뿐이다.

- `observed` — `dom.json` / `styles.json`에서 직접 읽은 값
- `derived` — 저장 값으로부터 계산한 값 (DOM 그래프 관계, HTML 기본 semantics)

`inferred`는 없다. AI도 없고, 의미를 추측하는 단계도 없다.

| 그룹 | evidence type |
| --- | --- |
| element 자체 | `native-element` `input-type` `role` `tabindex` `draggable` `contenteditable` `javascript-href` `inline-handler` `popover` `popovertarget` `popovertargetaction` `state-hint-attribute` |
| ARIA state/관계 | `aria-expanded` `aria-pressed` `aria-selected` `aria-checked` `aria-haspopup` `aria-controls` `aria-disabled` `aria-readonly` `aria-valuenow` `aria-valuemin` `aria-valuemax` `aria-owns` |
| state attribute | `disabled-attribute` `readonly-attribute` `checked-attribute` `selected-attribute` `open-attribute` `hidden-attribute` `inert-attribute` |
| computed style | `computed-cursor` `computed-pointer-events` `has-transition` `has-animation` |
| derived | `native-disclosure` `details-open` `inside-form` `implicit-submit` `inert-ancestor` |

두 가지 저장 금지 규칙이 있다.

- **inline handler는 attribute NAME만** 저장한다(`inline-handler: onclick`). handler의 JavaScript
  source는 untrusted page content이고 수 KB가 될 수 있으며, 신호는 이름만으로 충분하다.
- **`data-*` state hint도 attribute NAME만** 저장한다. 값 공간이 임의이고 framework 종속이라
  값을 복제하면 detector 출력이 페이지가 아니라 프레임워크의 성질이 된다.

Fixture는 이 두 규칙을 문자열 수준에서 검사한다 (`doSomethingSecret`, `closed`가 artifact에
나타나지 않는지).

## P1 / P2 / P3 정책

magic score 대신 **결정적 tier**를 쓴다. "실제로 동작할 확률"이 아니라 다음 Explorer의 탐색
순서를 정하는 값이다.

| tier | 의미 | 조건 |
| --- | --- | --- |
| **P1** | markup이 **state 관계를 명시**함 | `aria-expanded` / `aria-pressed` / `aria-selected` / `aria-checked` / `aria-haspopup` / `aria-controls` 중 하나, 또는 `role=tab`, `role=switch`, `<details>`의 `<summary>`, `popovertarget` |
| **P2** | native/명시적 interaction 수단, state 선언 없음 | `<button>` `<input>`(hidden 제외) `<select>` `<textarea>` `<summary>`, 인식된 `role`, `contenteditable`, `draggable=true`, inline handler, `javascript:` href |
| **P3** | heuristic | 아래 Generic Pointer Heuristic |

한 element가 여러 신호를 가지면 **가장 높은 tier**를 쓴다(§40). `<button aria-expanded aria-controls
role=button onclick cursor:pointer>`는 신호 5개, candidate 1개, priority P1이다.

P1 목록에 `aria-selected` / `aria-checked`를 포함한 것은 §39 예시보다 넓다. 둘 다 §13이 "강한
stateful interaction signal"로 지정한 attribute이고, `role=tab` + `aria-selected`가 실제 사이트에서
가장 흔한 tab trigger 형태이기 때문이다(nextjs.org에서 32건 확인).

## Native Control Detection

후보로 보는 native tag: `button` `input` `select` `textarea` `summary`.

- `input[type=hidden]`은 **절대** 후보가 아니다.
- `<option>`은 개별 후보로 만들지 않는다. 독립 조작 대상이 아니라 `<select>`를 통해 바뀌며,
  국가 선택 같은 곳에서 후보가 수백 개로 폭발한다. `<select>`가 `select` / `open-options`
  capability로 대표한다.
- `<a>`는 별도 정책(아래).

`<input>` type은 정규화한다. 속성이 없으면 `text`(HTML 기본), 알려진 값이면 그대로, 알 수 없는
값이면 `unknown`. `unknown`은 브라우저가 실제로 그렇게 렌더링하므로 editable로 취급한다.

| type 그룹 | capability |
| --- | --- |
| text/search/email/url/tel/number/password/date/…/color/unknown | `click` `edit` `focus` |
| checkbox / radio | `click` `toggle` |
| range | `click` `range-adjust` `drag` |
| file | `click` + guard `file-input` |
| button / submit / reset / image | `click` (+ `submit` / `reset`) |
| hidden | 후보 아님 |

**완전성 기계 검사**: 4개 사이트 52페이지 × 2 viewport의 `dom.json`에서 위 정의에 해당하는 native
control을 전수 세고, 후보 목록과 대조했다.

| site | native control | 미탐지 |
| --- | --- | --- |
| domainchecker | 374 | **0** |
| seoworld | 378 | **0** |
| nextjs.org | 1,312 | **0** |
| MDN | 928 | **0** |
| 합계 | **2,992** | **0** |

## ARIA State Detection

attribute의 **존재**와 **값**을 분리해서 저장한다. `aria-expanded="false"`는 존재(=강한 신호) +
값 `false`(=초기 state)이며, 둘 다 evidence에 남는다.

| attribute | capability |
| --- | --- |
| `aria-expanded` | `click` `state-toggle` `disclosure-trigger` |
| `aria-pressed` | `click` `state-toggle` `toggle` |
| `aria-selected` | `click` `state-toggle` |
| `aria-checked` | `click` `state-toggle` `toggle` |
| `aria-haspopup` = true/menu/listbox/tree/grid | `click` `menu-trigger` |
| `aria-haspopup` = dialog | `click` `dialog-trigger` |
| `aria-controls` | `click` + control 관계 |
| `aria-valuenow/min/max` | evidence만 (단독으로는 후보 아님) |
| `aria-disabled` / `aria-readonly` | initialState + guard |
| `aria-owns` | **evidence만** — controls 관계로 쓰지 않음 |

`aria-owns`는 접근성 트리 재부모화이지 "이 trigger가 저 영역을 연다"는 선언이 아니므로 control
관계에서 제외했다(§43).

**검사**: 4개 사이트에서 ARIA state attribute를 가진 element 중 후보가 되지 않은 것은 **0개**다.

## Role Detection

인식하는 role과 capability는 `ROLE_CAPABILITIES` 한 곳에 있다: `button` `link` `tab` `switch`
`checkbox` `radio` `menuitem` `menuitemcheckbox` `menuitemradio` `combobox` `listbox` `option`
`slider` `spinbutton` `searchbox` `textbox` `treeitem` `gridcell`.

container role(`dialog` `alertdialog` `tabpanel` `menu` `menubar` `listbox` `tablist` `tree`
`grid`)은 **trigger가 아니라 target**이다. 클릭 대상이 아니라 상태가 바뀌는 영역이므로 candidate가
아닌 target 인벤토리로 간다. `listbox`는 양쪽에 모두 있다 — container이면서 직접 조작 가능하고,
§56이 candidate와 target 동시 존재를 명시적으로 허용한다.

`role` 값은 첫 토큰만 소문자로 정규화한다(ARIA: first valid token wins).

## Inline Handler Detection

인식 목록은 §26 그대로 20개(`onclick` … `onsubmit`)이고, capability 매핑은 다음과 같다.

| handler | capability |
| --- | --- |
| `onclick` `onmousedown/up` `onpointerdown/up` `ontouchstart/end` | `click` |
| `oninput` `onchange` | `edit` |
| `onfocus` `onblur` `onkeydown` `onkeyup` | `focus` |
| `ondragstart` `ondragend` | `drag` |
| `onsubmit` | `submit` |
| `onmouseenter/leave/over/out` | (capability 없음, evidence만) |

hover handler는 실제 동작의 증거이지만 이 taxonomy가 모델링하는 action이 아니라서 evidence로만
남긴다.

> **실제 데이터에서는 0건이다.** Observer의 `ATTR_WHITELIST`에 `on*`가 없어 inline handler는
> 애초에 저장되지 않는다. 아래 "현재 한계" 참조.

## Generic Pointer Heuristic

이번 Task에서 **가장 위험했던 규칙**이고, 실측으로 형태가 바뀐 유일한 규칙이다.

`cursor`는 **상속되는 CSS 속성**이다. 카드 하나에 `cursor:pointer`를 주면 그 안의 모든
`<span>` / `<div>` / `<svg>`가 같은 computed value를 갖고, `<a>`는 UA stylesheet에서 그것을 받는다.
그래서 "cursor:pointer면 후보"라는 순진한 규칙은 클릭 가능한 카드 하나를 후보 40개로 바꾼다.

실측:

| site | element | `cursor:pointer` | 비율 | pointer-root | root 중 non-anchor |
| --- | --- | --- | --- | --- | --- |
| domainchecker | 6,658 | 2,790 | 41.9% | 928 | 98 |
| seoworld | 9,188 | 3,640 | 39.6% | 1,450 | 164 |
| nextjs.org | 87,191 | 42,756 | 49.0% | 13,962 | 1,324 |
| MDN | 45,336 | 24,134 | 53.2% | 15,060 | 928 |
| 합계 | **148,373** | **73,320** | **49.4%** | **31,400** | **2,514** |

그래서 P3는 **pointer-cursor root**에서만 발화한다: 가장 가까운 관측된 조상이 `cursor:pointer`가
**아닌** element. 그것이 작성자가 실제로 클릭 가능하게 만든 element이고, 자손은 모양만 물려받은
것이다. 이것은 CSS의 전역 사실이지 사이트별 threshold가 아니다.

최종 P3 조건(전부 AND):

```
navigation anchor 아님
AND effectiveVisible
AND pointer-events != none
AND disabled 아님
AND ( pointer-cursor root  OR  (tabindex >= 0 AND data-* state hint) )
```

`tabindex >= 0` 단독은 후보가 아니다(§36). `data-*` keyword 단독도 후보가 아니다(§35, §86) —
반드시 native element / role / aria state / inline handler / `tabindex>=0` / `cursor:pointer` 중
하나와 결합해야 한다.

## Link Exclusion 정책

일반 `<a href>`는 후보가 아니다. 다음 중 하나를 가질 때만 들어온다:
`role`(단, 아래 예외) · `aria-expanded` · `aria-haspopup` · `aria-controls` · `aria-pressed` ·
`aria-selected` · `aria-checked` · inline handler · `popovertarget` · `contenteditable` ·
`draggable` · `javascript:` href.

**예외 규칙 하나를 실측으로 추가했다.** 첫 실행에서 nextjs.org의 평범한 header/footer 링크 24개가
후보로 들어왔다. 원인은 `<a href="/..." role="link">` — native semantics를 그대로 반복하는
**중복 role**이었다. `role="link"`는 anchor에서는 admitting signal이 아니도록 고쳤다.
non-anchor(`<div role="link">`)에서는 여전히 의미가 있으므로 그대로 인정한다.

측정 결과:

| site | anchor 수 | 후보가 된 anchor |
| --- | --- | --- |
| domainchecker | 830 | 0 |
| seoworld | 1,286 | 0 |
| nextjs.org | 12,638 | 0 |
| MDN | 14,340 | 0 |
| 합계 | **29,094** | **0** |

전체 후보가 3,106개인데 anchor는 29,094개다. 이 정책이 없으면 후보의 90% 이상이 navigation이 되고
detector는 `links.json`의 열등한 복사본이 된다.

## Visibility / Disabled 처리

후보는 **삭제하지 않고 상태를 기록**한다. 지금 숨겨진 mobile 메뉴는 hamburger를 누르면 나타날 수
있고, 지금 disabled인 버튼은 입력 후 enabled될 수 있다.

```
initialState {
  localVisible        Observer 값 그대로
  effectiveVisible    Observer 값 그대로
  disabled            disabled 속성 OR aria-disabled=true
  readonly            readonly 속성 OR aria-readonly=true
  inertAncestor       self-or-ancestor `inert` (parentId 체인)
  pointerOperable     computed pointer-events != none
  initiallyOperable   effectiveVisible AND !disabled AND !readonly
                      AND !inertAncestor AND pointerOperable
}
```

`readonly`를 `initiallyOperable=false`로 넣은 것은 §20의 지시를 따른 것이다. 브라우저에서 readonly
input은 focus는 되지만, 다음 단계가 하고 싶은 interaction(입력)은 성공할 수 없다.

`cursor:pointer`와 `pointer-events:none`이 동시에 있으면 후자가 이긴다(§33). 다른 strong signal이
없으면 후보에서 제외되고(§80 권장안), strong signal이 있으면 후보로 남되 `pointerOperable=false` +
guard `pointer-disabled`가 붙는다. 실측 42건(seoworld 12, nextjs 30).

## Form / Submit Guard

`submitCapable` derive 규칙:

- `<button type="submit">` → true
- `<button>`(type 속성 없음) + ancestor `<form>` 존재 → true, evidence `implicit-submit`(derived)
- `<input type="submit">`, `<input type="image">` → true

`parentId` 체인으로 ancestor `<form>`을 찾아 `insideForm` / `formElementId`도 저장한다(§52).

실측에서 하나 배웠다. nextjs.org의 Geist 버튼 컴포넌트는 **form 밖에서도 `type="submit"`을
출력한다**(한 페이지 113개 버튼 중 5개). 그래서 `insideForm:false`인데 `form-submit` guard가 붙는
후보가 존재한다. 규칙은 그대로 뒀다 — guard는 보수적인 쪽이 옳고, `insideForm` 필드가 그대로
있으므로 소비자가 구분할 수 있다.

guard 총계 110건(domainchecker 2, seoworld 2, nextjs 106).

## Target Resolution

Trigger만으로는 절반이다. 통제 대상의 **before 상태**가 있어야 Task 11이 after를 검증할 수 있다.

```
hamburger button   effectiveVisible: true    ← candidate
controlled menu    effectiveVisible: false   ← target, before state
```

두 개의 id 공간을 절대 섞지 않는다: 작성자의 HTML `id`(`menu-1`)로 resolve하고, 결과에는 Observer
element id(`e000456`)를 저장하며, 둘 다 알면 둘 다 남긴다.

지원 관계 3종:

| relation | 근거 |
| --- | --- |
| `aria-controls` | space-separated IDREF list 전부 parsing |
| `popovertarget` | HTML Popover API |
| `details` | `<summary>` → 부모 `<details>` (DOM 트리가 관계를 담고 있어 id 불필요) |

target 인벤토리에는 위 관계로 참조된 element + **참조되지 않은 명백한 stateful container**
(`<dialog>`, container role, `popover` 속성)가 들어간다(§44). 전체 DOM을 target으로 만들지 않는다.

`<details>` 자체는 target이지 candidate가 아니다. trigger는 `<summary>` 하나뿐이고 중복 후보를
만들지 않는다(§15, §76).

## aria-controls 결과

| site | 관계 수 | `details` | `aria-controls` | resolved | unresolved |
| --- | --- | --- | --- | --- | --- |
| domainchecker | 98 | 98 | 0 | 98 | 0 |
| seoworld | 32 | 32 | 0 | 32 | 0 |
| nextjs.org | 152 | 2 | 150 | 34 | **118** |
| MDN | 928 | 712 | 216 | 928 | 0 |
| 합계 | **1,210** | 844 | 366 | 1,092 | **118** |

**nextjs.org의 118건 unresolved는 오류가 아니라 이번 Task의 가장 중요한 발견이다.** 미해결
id를 모아 보면 전부 같은 모양이다.

```
radix-_R_6spaivb_        20건
radix-_R_2miubaaivb_     20건
radix-_R_4miubaaivb_     20건
menu-_R_56tbsnuiubaaivb_ 18건
…
```

Radix UI가 생성한 dropdown/dialog content의 id인데, 그 content는 **열기 전까지 DOM에 mount되지
않는다**. 즉 정적 관측만으로는 통제 대상이 존재하지 않는다. 이것이 정적 관측의 경계이고, Task 11이
필요한 직접적인 근거다.

또 하나: nextjs.org의 resolved 34건 중 **32건이 자기 자신을 가리킨다**. Geist tab 컴포넌트가
`id="_R_knaotbsnuiubaaivb_"`와 `aria-controls="_R_knaotbsnuiubaaivb_"`를 같은 `<button>`에 출력한다.
detector는 페이지가 **말한 대로** 기록한다 — 의도한 대로가 아니라. 실제 사이트의 ARIA 버그이며,
저장된 사실이므로 보정하지 않았다.

MDN의 216건 `aria-controls`는 전부 resolve된다(사이드바 섹션이 초기 DOM에 존재).

## Viewport 독립 정책

desktop/mobile은 **완전히 독립적으로** 탐지한다. element id는 viewport-local이므로(Task 05),
desktop `e000050`과 mobile `e000050`을 같은 것으로 취급하는 순간 그것은 관측이 아니라 조작이 된다.

- 두 viewport는 서로의 데이터를 보지 않는다
- candidate id는 viewport마다 `ic000001`부터 다시 시작한다
- cross-viewport semantic matching은 구현하지 않았다

fixture는 desktop `e000003`이 `<button>`이고 mobile `e000003`이 무관한 `<div>`인 경우를 넣어
matching이 일어나지 않는지 검사한다(§89).

## Determinism

같은 관측을 다시 분석하면 **같은 바이트**가 나온다.

- candidate는 element id 순서(= document order)로 만들고 `ic000001…`을 순서대로 부여
- capability는 `CAPABILITY_ORDER` 고정 어휘 순
- evidence는 `EVIDENCE_TYPE_ORDER` 고정 순 → 같은 type이면 value 사전순
- guard는 `GUARD_FLAG_ORDER` 순, control 관계는 (relation, domId, elementId) 순
- target은 element id 순, target reason도 고정 순
- Map/Set 순회 순서가 출력에 새는 곳이 없다

검사 3종이 fixture에 있다: 같은 입력 재실행 byte 동일 · style table key 순서와 attribute key 순서를
뒤집어도 출력 동일 · 실제 파일 재분석 결과 byte 동일.

## Complexity / Performance

element마다 전체 DOM을 훑는 O(n²) 구현을 피하기 위해 viewport마다 index를 먼저 만든다.

- `elementId → element`
- `HTML id → element`
- `elementId → 가장 가까운 ancestor <form>`
- `elementId → self-or-ancestor inert`

`dom.json`은 document order라서 부모가 항상 배열에서 앞에 있다. 그래서 ancestor 정보는 **forward
한 번**으로 부모의 답을 물려받아 계산한다 → 전체 O(n). (스키마상 가능하지만 실제로는 관측되지 않는
forward reference를 위해 visited set으로 bounded된 fallback walk-up이 있다.)

| site | pages | element (양 viewport) | candidate | elapsed |
| --- | --- | --- | --- | --- |
| domainchecker | 6 | 6,658 | 374 | 190 ms |
| seoworld | 19 | 9,188 | 428 | 246 ms |
| nextjs.org | 15 | 87,191 | 1,376 | 1,062 ms |
| MDN | 12 | 45,336 | 928 | 623 ms |
| 합계 | **52** | **148,373** | **3,106** | **2,121 ms** |

element 148,373개를 2.1초, 약 70,000 element/초. 브라우저를 쓰지 않는 단계로서 자연스러운 수준이고,
Task 09의 265.2초 관측과 비교하면 0.8%다. 동시성 옵션은 두지 않았다 — network도 browser도 없는
JSON 처리라 이미 초 단위이고, 결정성이 존재 이유인 단계에 비결정적 interleaving을 넣을 이유가 없다.

## Fixture 테스트 결과

`pnpm smoke:interaction-detector` — **92/92 PASS**. 서버 0, 브라우저 0, 네트워크 0.

synthetic observation을 Observer와 같은 방식으로 만든다(document order id, 중복 style은 공유
테이블로 축약). §72–90의 케이스를 모두 포함한다.

| 케이스 | 기대 | 결과 |
| --- | --- | --- |
| §72 disclosure (`aria-expanded`+`aria-controls`) | P1, control resolved, target hidden 기록 | PASS |
| §73 menu trigger (`aria-haspopup=menu`) | P1, `menu-trigger`, resolved | PASS |
| §74 dialog trigger | P1, `dialog-trigger`, target 인벤토리 | PASS |
| §75 tab (`role=tab`+`aria-selected`) | P1, `tab-trigger`, relation resolved | PASS |
| §76 details/summary | summary만 후보, `native-disclosure`, details는 target | PASS |
| §77 form control 6종 | text→edit/focus, checkbox→toggle, select→select, range→range-adjust, textarea→edit, file→guard | PASS |
| §78 submit guard | typeless button in form → submitCapable, `type=button` → guard 없음 | PASS |
| §79 링크 | `<a href>` 제외, `<a href=# role=button aria-expanded>` 포함 | PASS |
| §80 generic pointer | 보이는 div+pointer → P3, `pointer-events:none` → 제외 | PASS |
| §81 inline handler | P2 click, handler 이름만 저장(source 미포함) | PASS |
| §82 hidden 후보 | 후보 보존 + `effectiveVisible:false` + guard | PASS |
| §83 disabled | 후보 보존 + `initiallyOperable:false` + guard | PASS |
| §84 unresolved `aria-controls` | `resolved:false` 보존, 에러 아님 | PASS |
| §85 복수 IDREF | relation 2개 | PASS |
| §86 `data-*` 단독 | 후보 아님 | PASS |
| §87 중복 신호 5개 | candidate 1개, P1, evidence 전부 보존 | PASS |
| §88 determinism | 재실행/키 순서 변경/파일 재분석 모두 byte 동일 | PASS |
| §89 viewport 독립 | 같은 element id, 다른 결과 | PASS |
| §90 corrupt styleId | `InteractionInputError` fail-fast | PASS |

추가로 커버한 것: `input[type=hidden]` 제외 · `<option>` 비후보 · `contenteditable=false` 제외 ·
`draggable` · `popovertarget` + popover target · `inert` ancestor · `aria-owns` 비관계 ·
cursor 상속(root만 후보) · transition/animation 단독 비후보 · 중복 role=link anchor 제외 ·
실패 page skip · 파일 round-trip Zod 재검증 · byte 회계 정확성 · Task 09 artifact 불변 ·
`dom.json`↔`observation.json` element count 불일치 fail-fast.

## 결과 비교 표

| site | pages | desktop | mobile | P1 | P2 | P3 | visible | hidden | non-operable | targets | 관계 | unresolved | density (d/m) | Task10 added | elapsed |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| domainchecker.co.kr | 6 | 187 | 187 | 110 | 264 | 0 | 200 | 174 | 174 | 98 | 98 | 0 | 0.068 / 0.072 | 460.5 KB | 190 ms |
| seoworld.co.kr | 19 | 214 | 214 | 32 | 346 | 50 | 367 | 61 | 73 | 32 | 32 | 0 | 0.050 / 0.053 | 518.3 KB | 246 ms |
| nextjs.org | 15 | 688 | 688 | 322 | 990 | 64 | 911 | 465 | 465 | 42 | 152 | 118 | 0.036 / 0.052 | 1,803.4 KB | 1,062 ms |
| developer.mozilla.org | 12 | 464 | 464 | 928 | 0 | 0 | 470 | 458 | 458 | 928 | 928 | 0 | 0.024 / 0.159 | 1,501.9 KB | 623 ms |
| **합계** | **52** | **1,553** | **1,553** | **1,392** | **1,600** | **114** | **1,948** | **1,158** | **1,170** | **1,100** | **1,210** | **118** | — | **4.18 MB** | **2,121 ms** |

density는 페이지별 `candidate / effectiveVisible element`의 산술평균이다. **품질 점수가 아니라
진단 지표다** — 문서 페이지가 낮은 것은 정상이다.

## Capability 표

| capability | domainchecker | seoworld | nextjs | MDN | 합계 |
| --- | --- | --- | --- | --- | --- |
| `click` | 374 | 378 | 1,312 | 928 | 2,992 |
| `state-toggle` | 110 | 32 | 322 | 928 | 1,392 |
| `disclosure-trigger` | 110 | 32 | 120 | 928 | 1,190 |
| `focus` | 26 | 26 | 662 | 0 | 714 |
| `toggle` | 0 | 50 | 170 | 0 | 220 |
| `select` | 0 | 8 | 144 | 0 | 152 |
| `open-options` | 0 | 8 | 144 | 0 | 152 |
| `generic-pointer` | 0 | 50 | 64 | 0 | 114 |
| `submit` | 2 | 2 | 106 | 0 | 110 |
| `edit` | 26 | 26 | 50 | 0 | 102 |
| `tab-trigger` | 0 | 0 | 32 | 0 | 32 |
| `dialog-trigger` | 0 | 0 | 20 | 0 | 20 |
| `menu-trigger` | 0 | 0 | 18 | 0 | 18 |
| `range-adjust` | 0 | 0 | 0 | 0 | **0** |
| `drag` | 0 | 0 | 0 | 0 | **0** |
| `reset` | 0 | 0 | 0 | 0 | **0** |
| `popover-trigger` | 0 | 0 | 0 | 0 | **0** |

0인 capability도 그대로 보고한다. `range-adjust` / `drag` / `reset` / `popover-trigger`가 0인 것은
detector의 결함이 아니라 이 4개 사이트의 초기 정적 상태에 `input[type=range]`, `draggable="true"`,
reset 버튼, Popover API 사용이 없었다는 뜻이다(그리고 `popover*` 속성은 Observer가 저장하지 않는다 —
"현재 한계" 참조).

## Guard 표

| guard | domainchecker | seoworld | nextjs | MDN | 합계 |
| --- | --- | --- | --- | --- | --- |
| `hidden` | 174 | 61 | 465 | 458 | 1,158 |
| `form-submit` | 2 | 2 | 106 | 0 | 110 |
| `pointer-disabled` | 0 | 12 | 30 | 0 | 42 |
| `file-input` | 0 | 0 | 0 | 0 | 0 |
| `navigation` | 0 | 0 | 0 | 0 | 0 |
| `external-navigation` | 0 | 0 | 0 | 0 | 0 |
| `disabled` | 0 | 0 | 0 | 0 | 0 |
| `readonly` | 0 | 0 | 0 | 0 | 0 |
| `inert` | 0 | 0 | 0 | 0 | 0 |

`navigation`이 0인 것은 링크 정책이 작동한 결과다 — anchor가 하나도 후보가 되지 않았으므로
navigation guard를 달 대상도 없다. `disabled` / `readonly` / `inert`가 0인 것은 해당 속성이
Observer whitelist에 없어서다(아래).

## domainchecker 결과

6페이지 / desktop 187 · mobile 187 / P1 110 · P2 264 · P3 0.

- P1 110건 = `<summary>` 98 + `aria-expanded` 버튼 12. **전부** 실제 상태 신호에서 나왔다.
- 홈(`p000001`) desktop 39건의 내역: 헤더 네비 버튼 7 + 검색 input/버튼 2 + 로그인 1 +
  모바일 네비 복제 11(desktop에서는 hidden) + 분석 form(input + submit 버튼) 2 + 정렬 버튼 6 +
  CTA 2 + FAQ `<summary>` 8 = 39. 하나하나 `dom.json`에서 확인했다.
- P3 0건은 버그가 아니다. `cursor:pointer`가 2,790개 element에 있지만 pointer-root는 928개이고
  그중 830개가 `<a>`(링크 정책으로 제외), 98개가 `<summary>`(이미 P1)다. **남는 것이 없다.**

## seoworld 결과

19페이지 / desktop 214 · mobile 214 / P1 32 · P2 346 · P3 50.

- P1 32건은 전부 blog 페이지의 `<summary>`(FAQ)다. ARIA state를 쓰는 컴포넌트가 없다.
- P3 50건은 전부 `/tools/robots-generator`의 `<label cursor:pointer>`이고, 각각 바로 옆
  `input[type=checkbox]`(P2)와 짝을 이룬다. **정확한 탐지다** — label 클릭은 실제로 체크박스를
  토글한다. 이 페이지 하나가 75 candidate, density 0.2443으로 사이트 내 최대다.
- 페이지별 편차가 크다: 3건(shell만) ~ 75건. 아래 Empty-shell 참조.

## nextjs 결과

15페이지 / desktop 688 · mobile 688 / P1 322 · P2 990 · P3 64.

P1 322건의 evidence 시그니처 분포:

| 건수 | tag | 신호 |
| --- | --- | --- |
| 170 | button | `role` + `aria-checked` |
| 80 | button | `role` + `aria-expanded` + `aria-controls` |
| 38 | button | `aria-expanded` + `aria-haspopup` + `aria-controls` |
| 32 | button | `role` + `aria-selected` + `aria-controls` (tab) |
| 2 | summary | native disclosure |

가장 풍부한 사이트다. tab / menu / dialog trigger가 모두 나오고, unresolved control 118건과
self-referential control 32건도 여기서 나왔다. `select` 64개(테마/버전 선택), `textarea` 20개,
`input[type=email]` 30개(뉴스레터)도 잡힌다.

## MDN 결과

12페이지 / desktop 464 · mobile 464 / P1 **928** · P2 0 · P3 0.

전부 P1이라는 결과가 처음에는 의심스러워 원본 `dom.json`을 직접 확인했다. 사실이었다.

- 후보 928건 = `<summary>` 712 + `aria-expanded`+`aria-controls` 버튼 216
- MDN 사이드바는 `<details>` 트리와 dropdown 버튼으로만 구성된다
- P2가 0인 이유: 나머지 버튼이 전부 `aria-expanded`를 갖고(→P1), anchor는 전부 제외되며
  (한 페이지에 767개), `<input>` / `<form>`이 관측된 DOM에 **하나도 없다**

MDN 헤더 검색이 후보에 없는 것은 detector의 누락이 아니라 관측 사실이다 —
`p000001`의 `dom.json`에는 `input`도 `form`도 없다. 대신 `<mdn-dropdown>` 커스텀 엘리먼트 8개가
있고, Observer는 shadow root 내부로 내려가지 않는다(Task 04/05 정책). 즉 **"저장된 초기 정적
상태에서 관측 가능한 후보가 없었다"**가 정확한 표현이다.

## Desktop / Mobile 차이

4개 사이트 모두 desktop candidate 수 == mobile candidate 수다. 반응형이 **DOM 교체가 아니라
CSS 표시/숨김**으로 구현돼 있기 때문이다. 그래서 차이는 개수가 아니라 **visibility**에 나타난다.

| site | desktop visible | mobile visible |
| --- | --- | --- |
| domainchecker | 121 | 79 |
| seoworld | 191 | 176 |
| nextjs.org | 458 | 453 |
| MDN | **452** | **18** |

MDN이 극단적이다: `p000001`에서 desktop은 19개 중 18개가 보이고, mobile은 **1개**만 보인다.
사이드바 `<details>` 트리 전체가 mobile에서 `display:none`이고, 남는 것은 메뉴 버튼 하나다.
cross-viewport matching 없이도 이 차이가 그대로 드러난다.

### Mobile hamburger 검수 (§101)

Task 05에서 mobile-only hamburger가 관측됐던 두 사이트를 확인했다. 두 곳 모두 **탐지된다**.

| site | element | priority | 근거 | desktop | mobile |
| --- | --- | --- | --- | --- | --- |
| domainchecker `p000001` | `e000042` (`<button>`) | **P1** | `aria-expanded=false` | hidden | **visible** |
| seoworld `p000001` | `e000022` (`<button>`) | **P2** | native button + `cursor:pointer` | hidden | **visible** |

seoworld의 hamburger는 ARIA state가 전혀 없는 평범한 버튼인데도 P2 native candidate로 잡힌다 —
§101이 요구한 그대로다. desktop에서 같은 element id를 찾으려는 시도는 하지 않았다(같은 DOM이라
우연히 같은 id지만, 그것을 근거로 삼지 않는다).

## Validation Interaction Comparison

Task 09의 representative ↔ validation sample 11쌍을 interaction 관점에서 비교했다. 두 페이지 모두
이미 관측돼 있으므로 **추가 브라우저 작업 0**이다.

| site | family | rep → sample | desktop total | 차이 | 비고 |
| --- | --- | --- | --- | --- | --- |
| domainchecker | f000003 | p000004 → p000005 | 31 → 31 | 0 | |
| domainchecker | f000004 | p000003 → p000006 | 32 → 31 | −1 | |
| seoworld | f000003 | p000003 → p000017 | 14 → 14 | 0 | |
| seoworld | f000005 | p000005 → p000018 | 3 → 3 | 0 | **둘 다 empty shell** |
| seoworld | f000008 | p000008 → p000019 | 3 → 3 | 0 | |
| nextjs | f000002 | p000004 → p000013 | 17 → 20 | +3 | click+3, focus+3 |
| nextjs | f000005 | p000006 → p000014 | 35 → **79** | **+44** | P1 +4, P2 +31, P3 +9 |
| nextjs | f000009 | p000010 → p000015 | 41 → 32 | −9 | select −4 |
| MDN | f000003 | p000003 → p000010 | 18 → 16 | −2 | |
| MDN | f000008 | p000008 → p000011 | 23 → 23 | 0 | |
| MDN | f000009 | p000009 → p000012 | 18 → 18 | 0 | |

가장 중요한 것은 **nextjs f000005**다.

```
representative  /docs/app/guides/debugging                       35 candidates
sample          /docs/app/guides/migrating/from-create-react-app  79 candidates
차이            +44   (tab-trigger +4, select/open-options +9, generic-pointer +9)
```

Task 09에서 같은 쌍이 document height 2.42배, asset +79, link +73으로 "representative가 잘 대표하지
못한 3쌍" 중 하나로 기록됐다. **interaction 구조에서도 같은 결론이 나왔다** — 정적 구조 신호가
비슷하다고 해서 조작 가능한 UI가 비슷하다는 보장은 없다는 직접 증거다.

반대로 seoworld f000005의 완벽한 1:1(3 → 3)은 좋은 신호가 아니다. Task 09가 이미 지적했듯 **두
페이지 모두 빈 client-rendered shell**이라 후보가 사이트 shell 버튼 3개뿐인 것이다. 비율만 보고
대표성을 읽으면 안 된다는 경고가 여기서도 반복된다.

이 숫자들로 family algorithm을 수정하지 않았다(§65, §103). 측정만 기록한다.

## 실제 Candidate 샘플

**P1 — domainchecker mobile hamburger** (`p000001`, mobile, `ic000013`)

```
elementId     e000042            tagName  button
priority      P1
capabilities  click, state-toggle, disclosure-trigger
evidence      native-element=button (observed)
              aria-expanded=false   (observed)
              has-transition        (observed)
controls      (없음 — aria-controls 미선언)
initialState  effectiveVisible=true, initiallyOperable=true
guardFlags    (없음)
```

**P1 — nextjs tab trigger** (`p000006`, desktop, `ic000018`)

```
elementId     e003019            tagName  button      role  tab      text "pnpm"
priority      P1
capabilities  click, state-toggle, tab-trigger, focus
evidence      native-element=button, role=tab, tabindex=0,
              state-hint-attribute=data-geist-tab, aria-selected=true,
              aria-controls=_R_knaotbsnuiubaaivb_, computed-cursor=pointer
controls      aria-controls → _R_knaotbsnuiubaaivb_ → e003019 (resolved, 자기 자신)
guardFlags    (없음)
```

**P1 — MDN native disclosure** (`p000001`, desktop, `ic000010`)

```
elementId     e000477            tagName  summary
priority      P1
capabilities  click, state-toggle, disclosure-trigger
evidence      native-element=summary (observed), computed-cursor=pointer (observed),
              native-disclosure=e000476 (derived)
controls      details → e000476 (resolved)
```

**P2 — nextjs newsletter submit** (`p000001`, desktop, `ic000011`)

```
elementId     e000950   tagName button   text "Subscribe"
priority      P2
capabilities  click, submit
evidence      native-element=button, computed-cursor=pointer, inside-form=e000944 (derived)
submitCapable true      insideForm true
guardFlags    form-submit
```

**P2 — seoworld checkbox** (`p000016`, desktop, `ic000009`)

```
elementId     e000060   tagName input   inputType checkbox
priority      P2   capabilities click, toggle
evidence      native-element=input, input-type=checkbox
```

**P3 — seoworld label** (`p000016`, desktop, `ic000008`)

```
elementId     e000059   tagName label
priority      P3   capabilities generic-pointer
evidence      computed-cursor=pointer   ← 유일한 근거이고, 그 사실이 evidence에 그대로 보인다
initialState  effectiveVisible=true, initiallyOperable=true
```

## False Positive 검수

**P1 전수 검수 (1,392건).** evidence 시그니처로 그룹핑해 전부 확인했다.

| 건수 | 형태 |
| --- | --- |
| 940 | `<summary>` + native disclosure (domainchecker 98, seoworld 32, nextjs 2, MDN 712) |
| 216 | button + `aria-expanded` + `aria-controls` (MDN) |
| 170 | button + `role` + `aria-checked` (nextjs) |
| 80 | button + `role` + `aria-expanded` + `aria-controls` (nextjs) |
| 38 | button + `aria-expanded` + `aria-haspopup` + `aria-controls` (nextjs) |
| 32 | button + `role` + `aria-selected` + `aria-controls` (nextjs tab) |
| 12 | button + `aria-expanded` (domainchecker) |

**모든 P1이 실제 ARIA state attribute 또는 native `<details>/<summary>`에서 나왔다. 추측으로
만들어진 P1은 0건이다.**

기계 검사 결과:

| 검사 | 결과 |
| --- | --- |
| normal link가 P1/P2로 유입되는가 | anchor 29,094개 중 후보 **0** |
| static div가 `cursor:pointer` 하나로 과도하게 P3가 되는가 | P3 114건 (전체의 3.7%) |
| 한 element가 여러 candidate로 중복되는가 | 중복 **0** |
| ARIA state를 가진 element가 누락되는가 | 누락 **0** |
| native control이 누락되는가 | 2,992개 중 누락 **0** |
| candidate의 `styleId`가 styles.json에서 resolve되는가 | 3,106/3,106 |
| disabled/hidden 상태가 보존되는가 | hidden 1,158건 전부 guard + `initiallyOperable=false` |

**발견하고 고친 false positive 1건**: `<a href="/…" role="link">` 24건(nextjs.org)이 P2로 유입.
중복 role은 anchor를 admit하지 않도록 수정 → 후보 1,424 → 1,376.

## Candidate Noise 검수

P3 비율:

| site | P3 | 전체 | 비율 |
| --- | --- | --- | --- |
| domainchecker | 0 | 374 | 0.0% |
| seoworld | 50 | 428 | 11.7% |
| nextjs.org | 64 | 1,376 | 4.7% |
| MDN | 0 | 928 | 0.0% |
| 합계 | **114** | **3,106** | **3.7%** |

P3가 후보 대부분을 차지하는 사이트는 없다. 그리고 남은 114건은 검수 결과 전부 실물이다 —
seoworld 50건은 체크박스 label, nextjs 64건은 문서 페이지의 클릭 가능한 카드/영역이다.

이 숫자가 이렇게 낮은 것은 pointer-cursor root 규칙 덕분이다. 순진한 "보이고 · pointer-events가
있고 · navigation anchor가 아니고 · 이미 강한 후보가 아닌데 `cursor:pointer`" 규칙을 같은 데이터에
적용하면:

| site | 순진한 P3 | 실제 P3 | 순진한 총후보 | 실제 총후보 |
| --- | --- | --- | --- | --- |
| domainchecker | 1,641 | 0 | 2,015 | 374 |
| seoworld | 1,883 | 50 | 2,261 | 428 |
| nextjs.org | 5,721 | 64 | 7,033 | 1,376 |
| MDN | 4,629 | 0 | 5,557 | 928 |
| 합계 | **13,874** | **114** | **16,866** | **3,106** |

순진한 규칙에서는 후보의 **82%가 cursor 상속 노이즈**가 된다. 사이트별 threshold는 도입하지 않았고,
규칙은 CSS 상속이라는 전역 사실 하나뿐이다(§98의 "임의 삭제 금지, global rule 조정" 방침).

## Empty-shell 결과

seoworld `/tools/domain-checker`(`p000011`)는 Task 09에서 71 element짜리 빈 shell로 관측됐던
페이지다. 결과:

```
DOM element 71 (effective visible 67)
candidate 3
  ic000001  e000018  P2 button "로그인"    visible
  ic000002  e000020  P2 button "회원가입"  visible
  ic000003  e000022  P2 button ""          hidden   ← mobile hamburger
```

즉 **사이트 shell의 헤더 버튼 3개가 전부이고, 도구 UI 자체는 후보를 0개 기여했다.** 같은 형태가
`/blog`, `/domains`, `/domains/auction`, `/services`, `/services/backlinks`, `/services/traffic`,
`/tools/domain-checker`, `/domains/compare`, `/services/web-design`에서 반복된다(각 3건).

결론을 이렇게 쓰지 않는다: "이 페이지에는 interaction이 없다."
정확한 기록은 다음과 같다: **"저장된 초기 정적 상태에서 관측 가능한 interaction candidate가
없었다."** 실제로는 client-side rendering 이후에 도구 UI가 생기며, 그것은 정적 관측의 경계이지
사이트의 성질이 아니다. 이 결과는 향후 AI/Unknown Explorer가 필요한 근거로 남긴다.

## Storage Size

| site | page 파일 합 | manifest | Task 10 추가 | Task 09 관측 | 비율 |
| --- | --- | --- | --- | --- | --- |
| domainchecker.co.kr | 452.6 KB | 7.8 KB | **460.5 KB** | 57.67 MB | 0.78% |
| seoworld.co.kr | 501.2 KB | 17.2 KB | **518.3 KB** | 68.03 MB | 0.74% |
| nextjs.org | 1,787.6 KB | 15.8 KB | **1,803.4 KB** | 149.81 MB | 1.18% |
| developer.mozilla.org | 1,488.8 KB | 13.1 KB | **1,501.9 KB** | 75.34 MB | 1.95% |
| **합계** | **4,230.2 KB** | **53.9 KB** | **4.18 MB** | **350.86 MB** | **1.19%** |

Deep Observation 350.86 MB에 대해 1.19%다. compact index라는 설계 목표를 만족한다. 유지 방법은
단순하다: 원본 attribute 전체를 복사하지 않고, 후보를 만든 evidence만 저장하며, site manifest에는
candidate 배열을 두 번 담지 않고 상대 경로만 기록한다(fixture가 manifest에 `"evidence"` 문자열이
없음을 검사한다).

byte 수치는 추정이 아니라 실제 기록 바이트다. manifest는 자기 크기를 스스로 담으므로 Observer /
multi-observer store와 같은 fixpoint 반복으로 수렴시킨다.

## 기존 artifact 불변 확인

Task 10 실행 전후로 site run 아래 **Task 09 파일 784개**의 mtime과 크기를 전수 비교했다.

```
find data/*/site-observations -type f \
  ! -name 'interaction-analysis.json' ! -name 'interaction-candidates.json' \
  -exec stat -f '%m %z %N' {} + | sort
→ before/after diff: 차이 없음 (784 files)
```

`site-observation.json`, `observation.json`, `dom.json`, `styles.json`, `rendered.html`,
`assets.json`, `links.json`, `frames.json`, `screenshot.png` 전부 그대로다. Task 10은 파일 2종을
**추가**만 한다.

## 발생한 문제

**1. `cursor:pointer` 상속으로 인한 후보 폭발.** 첫 설계는 "visible + pointer-events + 
non-navigation + `cursor:pointer` → P3"였고, 실측하니 element의 49.4%가 조건을 만족했다. 원인은
`cursor`가 상속 속성이라는 것. → pointer-cursor **root**에서만 발화하도록 변경. P3 13,874 → 114.

**2. 중복 `role="link"`가 링크 정책을 우회.** nextjs.org의 header/footer 링크 24개가 P2로 유입.
`<a href>`에서 `role="link"`는 native semantics의 반복이라 admitting signal에서 제외. non-anchor의
`role="link"`는 그대로 인정.

**3. 자기 자신을 가리키는 `aria-controls`.** nextjs.org Geist tab이 같은 버튼에 `id`와
`aria-controls`를 같은 값으로 출력한다(32건). 정상 동작으로 판단해 보정하지 않고 그대로 기록했다 —
detector는 페이지가 말한 것을 기록하지 의도를 추정하지 않는다.

**4. form 밖의 `type="submit"`.** nextjs.org Geist 버튼이 form 밖에서도 `type=submit`을 출력한다.
guard는 보수적인 쪽(붙이는 쪽)으로 유지하고, `insideForm:false`로 구분 가능하게 뒀다.

**5. MDN 전건 P1이 의심스러워 원본 확인.** `dom.json`을 직접 열어 `<summary>` 712 + `aria-expanded`
버튼 216이 실재함을 확인. 사이트 구조가 실제로 그렇다.

## 기술적 결정

**Element 1개 → Candidate 최대 1개.** 신호별로 후보를 만들면 모든 집계가 무의미해진다. 대신
capability 배열과 evidence 배열을 갖고 priority는 최대값을 취한다.

**`native-disclosure`는 evidence, `disclosure-trigger`는 capability.** §15는 `<summary>`에
`native-disclosure` capability를 요구했지만, §38 taxonomy에는 같은 동작을 가리키는
`disclosure-trigger`가 이미 있다. 같은 행위에 이름을 두 개 두지 않기 위해 capability는
`disclosure-trigger`로 통일하고, "native `<details>`에서 왔다"는 사실은 evidence
`native-disclosure`(+ 부모 element id)로 남겼다.

**`generic-pointer`에는 `click`을 주지 않는다.** P3 후보의 capability는 `generic-pointer` 하나뿐이다.
`click`을 함께 주면 "명시적 활성화 의미를 가진 element"라는 `click`의 뜻이 희석되고 capability 표가
읽을 수 없게 된다. 다음 Explorer는 `generic-pointer`가 곧 클릭 시도 대상임을 알면 된다.

**`<label>`을 native control로 취급하지 않았다.** HTML상 label 클릭은 연결된 컨트롤을 활성화하지만,
그 컨트롤은 이미 후보이고 label을 P2로 올리면 같은 논리적 컨트롤이 두 번 세어진다. 현재는
`cursor:pointer`가 있을 때만 P3로 나타난다(seoworld 50건). 의도적 한계로 남긴다.

**동시성 없음.** network도 browser도 없는 JSON 처리이고 사이트당 0.2–1.1초다. 결정성이 존재
이유인 단계에 비결정적 interleaving을 넣지 않는다.

**page별 파일 1개(desktop+mobile 공용).** candidate index는 작고(관측 대비 1.19%), 나누면 "이
페이지에서 뭘 조작할 수 있나"에 답하려고 항상 파일 2개를 열어야 한다.

**Observer를 확장하지 않았다(§5).** interaction 신호를 더 얻자고 52페이지를 다시 관측하지 않는다.
현재 저장 데이터로 알 수 없는 것은 아래에 한계로 남긴다.

## 현재 한계

**1. Observer attribute whitelist에 없는 신호는 실제 데이터에서 영원히 0이다.**
`ATTR_WHITELIST`는 whitelist + 모든 `aria-*` + 모든 `data-*`다. 따라서 다음 신호는 규칙이
구현되어 있고 fixture로 검증되지만 Task 09 데이터에서는 발화하지 않는다.

| 신호 | 상태 |
| --- | --- |
| `onclick` 등 inline handler 20종 | 저장되지 않음 → 실측 0 |
| `disabled` / `readonly` | 저장되지 않음 (`aria-disabled`/`aria-readonly`만 가능) |
| `contenteditable` | 저장되지 않음 |
| `open` (`<details>`/`<dialog>`) | 저장되지 않음 → 초기 open 상태 미상 |
| `hidden` / `inert` | 저장되지 않음 |
| `checked` / `selected` | 저장되지 않음 |
| `popover` / `popovertarget` / `popovertargetaction` | 저장되지 않음 |
| `min` / `max` / `step` | 저장되지 않음 |

이것들이 0인 것은 "그런 컨트롤이 없다"는 뜻이 **아니다**. Guard 표의 `disabled` 0, `readonly` 0,
Capability 표의 `popover-trigger` 0을 그렇게 읽으면 안 된다. 규칙은 그대로 두었으므로 Observer
whitelist가 넓어지는 날 detector 코드 변경 없이 바로 값이 나온다.

**2. Shadow DOM / iframe 내부는 보이지 않는다.** Observer가 open shadow root의 인벤토리만 기록하고
내부로 내려가지 않으므로(Task 04/05 정책), MDN의 `<mdn-dropdown>` 같은 web component 내부 컨트롤은
탐지 대상이 아니다.

**3. 초기 정적 상태만 본다.** client-side rendering 이후에 생기는 UI(seoworld 도구 페이지),
열기 전에는 mount되지 않는 dropdown/dialog(nextjs.org 118건 unresolved)는 원리적으로 보이지 않는다.

**4. Desktop ↔ Mobile semantic matching 없음.** 의도적 제외(§8). 개수 차이는 보고하지만 "이
desktop 버튼과 이 mobile 버튼은 같은 컨트롤"이라고 말하지 않는다.

**5. `<label>` → control 연결(`for` 속성) 미해석.** `for`는 저장되지만 label↔control 관계를
control relation으로 만들지는 않았다.

**6. class name 기반 추론 없음(의도적).** `class`에 `accordion` / `modal` / `carousel`이 들어 있어도
근거로 쓰지 않는다. className은 너무 자유롭다. 향후 weak evidence 연구 대상으로만 남긴다.

**7. candidate ≠ 동작 보장.** 이 단계는 "시도할 근거"만 만든다. 실제 동작·안전성·패턴 확정은
Task 11 이후다.

## 다음 Task 추천

**Rule-Based Interaction Explorer (Task 11).**

이번 결과가 그 필요성을 직접 만든다.

- P1 1,392건 — 실제로 눌러 보면 상태 전이를 검증할 수 있는 명시적 후보
- unresolved control 118건 — 열기 전에는 DOM에 없는 영역, 정적 관측의 경계 그 자체
- hidden target 566건(MDN) — before가 hidden으로 기록돼 있어 after를 검증할 수 있음
- empty shell 페이지 — 초기 정적 상태로는 답이 안 나오는 사례

권장 흐름:

```
Interaction Candidates (이번 Task)
  → Safe Action Planning        guardFlags 소비: form-submit / file-input / navigation 회피
  → Playwright Rule Explorer    P1 우선, visible + initiallyOperable 우선
  → Before/After State Diff     저장된 initialState와 target 상태가 before
  → Interaction Observation
```

같이 검토할 것: Observer `ATTR_WHITELIST`를 interaction 신호 쪽으로 확장할지 여부(위 한계 1).
확장하면 Task 09를 다시 돌려야 하므로 Explorer 설계와 함께 판단하는 편이 낫다.

## 변경 파일

**신규**

```
src/interaction-detector/types.ts
src/interaction-detector/load-observation.ts
src/interaction-detector/classify-signals.ts
src/interaction-detector/detect-candidates.ts
src/interaction-detector/detect-targets.ts
src/interaction-detector/summarize.ts
src/interaction-detector/analyze-site.ts
src/interaction-detector/store.ts
src/interaction-detector/index.ts
src/cli-detect-interactions.ts
scripts/smoke-interaction-detector.ts
docs/result/10-interaction-candidate-detection-2026-08-13.md
```

**수정**

```
package.json   detect:interactions / smoke:interaction-detector 스크립트 추가
README.md      파이프라인 + CLI + 프로젝트 구조 갱신
ROADMAP.md     Phase 4 완료 반영, 다음 단계 명시
```

**Observer / multi-observer / selector / verifier 코드는 한 줄도 수정하지 않았다.**

## 테스트 결과

| 명령 | 결과 |
| --- | --- |
| `pnpm typecheck` | PASS |
| `pnpm smoke:verifier` | 81/81 PASS |
| `pnpm smoke:selector` | 81/81 PASS |
| `pnpm smoke:multi-observer` | 58/58 PASS |
| `pnpm smoke:interaction-detector` | **92/92 PASS** |
| offline import graph | PASS (browser/network/AI 의존성 0) |
| 4개 실제 site run 분석 | PASS (52페이지, Firecrawl 0 / Playwright 0 / network 0 / AI 0) |

## 검수자가 확인할 부분

1. **P3 규칙의 pointer-cursor root 조건** — 이번 Task에서 가장 큰 판단이다. "클릭 가능한 영역의
   루트만 후보"가 옳은 추상화인가, 아니면 자손 중 실제 클릭 대상이 따로 있는 사이트에서 놓치는가.
   (`src/interaction-detector/detect-candidates.ts` 모듈 헤더 + P3 조건)
2. **`role="link"` 예외** — anchor에서만 중복 role을 무시하는 규칙이 지나치게 특수한지.
3. **`readonly` → `initiallyOperable=false`** — §20을 따랐지만, 브라우저에서 readonly input은
   focus/click이 가능하다. 다음 단계에 이 정의가 맞는지.
4. **form 밖 `type="submit"`에 form-submit guard** — 보수적 선택이 맞는지.
5. **P1에 `aria-selected` / `aria-checked` 포함** — §39 예시보다 넓은 해석.
6. **nextjs unresolved 118 / self-referential 32** — 값 자체가 사이트의 사실인지 다시 확인해 볼 것.
   (`pages/p000005/interaction-candidates.json` ↔ `viewports/desktop/dom.json`)
7. **MDN P2 = 0** — 원본 `dom.json`에 `input`/`form`이 정말 없는지.
8. **Observer whitelist 한계 목록** — Guard 표와 Capability 표의 0들이 "없음"이 아니라 "관측되지
   않음"이라는 구분이 보고서에서 충분히 명확한지.
9. **`<label>` 정책** — P3로만 잡히는 현재 상태를 유지할지, native control로 승격할지.
