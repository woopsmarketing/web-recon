Task: 12
Title: Interaction Pattern Modeling & Unknown Interaction Strategy
Previous: 11-safe-rule-based-interaction-exploration-2026-08-13.md
Status: Complete

---

# Task 12 — Interaction Pattern Modeling & Unknown Interaction Strategy

## 작업 목표

Task 11의 산출물은 여기까지였다.

> 이 element를 클릭했더니 이런 observable state transition이 일어났다.

이번 Task의 질문은 하나다.

> **그 transition은 어떤 재사용 가능한 UI behavior인가 — 그리고 아니라면, 왜 아닌가?**

두 번째 절이 이번 Task의 절반이다. `aria-expanded false → true`에 `disclosure`라는 이름을
붙이는 일은 어렵지 않다. 어려운 것은 **이름을 붙이면 안 되는 것에 붙이지 않는 것**이고, 붙이지
않았을 때 "unknown"이라는 한 단어로 뭉개지 않는 것이다. Task 11의 `no-change` 46건에는 최소
다섯 가지 서로 다른 원인이 있고, 그중 AI에게 물어볼 가치가 있는 것은 한 종류뿐이다.

세 층을 논리적으로 분리했다.

```
1. Deterministic Pattern Registry   명시적 rule list가 Task 11 evidence를 해석
2. Unknown Classifier               서로 다른 실패 원인의 taxonomy
3. AI Boundary                      provider-neutral contract, 기본 OFF
```

순서 자체가 정책이다: **Rules first, Unknown second, AI last.**

이번 Task에서 **하지 않은 것**: Playwright 실행, Firecrawl, 새 Discovery / Verification /
Selection / Observation, 새 click·hover·focus·type·select·drag·scroll, recursive interaction,
SiteSpec 생성, Next.js reconstruction, visual diff, SEO, DB/queue, AI에게 browser control 제공,
AI의 registry 수정, AI 결과 자동 승격, git add/commit/push.

## Pipeline Position

```
URL
 → Discovery                      (pnpm recon)
 → Verification                   (pnpm verify)
 → Page Family Selection          (pnpm select)
 → Multi-page Deep Observation    (pnpm observe:site)
 → Interaction Candidate Detection(pnpm detect:interactions)
 → Safe Rule-Based Interaction Exploration (pnpm explore:interactions)
 → Interaction Pattern Modeling & Unknown Strategy  ← 이번 Task (pnpm model:interactions)
 → SiteSpec Compiler                               ← 다음 Task
```

Task 10이 **후보**를, Task 11이 **관측된 전이**를 만들었다. Task 12는 **검증된 pattern**을
만든다. 세 단계의 의미가 다르다는 것이 이 파이프라인의 핵심이고, 그래서 Task 10의 P1/P2와 Task
12의 Pattern은 절대 같은 것이 아니다(아래 "P1/P2 vs Pattern" 참조).

## Architecture

```
interaction-exploration.json (Task 11, immutable)
      │
      │  OFFLINE 전부 (브라우저 0 · network 0 · AI 0)
      │
      ├─ loadExploration()        Task 11의 실제 Zod schema로 manifest + plan +
      │                           모든 action artifact 검증, 교차 invariant, fail-fast
      │
      ├─ buildActionFacts()       action 1개 → rule이 볼 수 있는 사실 집합
      │                           (rule은 원본 artifact에 손을 대지 않는다)
      │
      ├─ isPatternEligible()      status=changed ∧ ¬navigation-tainted
      │     │
      │     ├─ YES → matchPattern()   10개 rule 전부 실행 → specificity로 승자 결정
      │     │            ├─ 승자 1개 → InteractionPatternInstance
      │     │            └─ 동점    → RuleConflict 기록 + Unknown
      │     │
      │     └─ NO  → classifyUnknown()  9-reason taxonomy
      │
      ├─ signature()             pattern / unknown 각각의 compact fingerprint
      ├─ summarize()             coverage · group · page index · AI 비용 추정
      ├─ assertAccounting()      patterns + unknowns == actions (예외 발생)
      │
      └─ data/<host>/interaction-models/<run-id>/
           interaction-patterns.json
           unknown-interactions.json
           ai-analysis.json        ← --ai를 실제로 쓴 경우에만

      [선택] --ai
           selectAiCases()        eligible signature group 당 대표 1개
           buildAiCase()          allowlist 기반 compact payload
           analyzer.analyze()     provider-neutral, fake provider 동봉
           → 별도 artifact, provenance=inferred, 승격 0
```

신규 모듈은 `src/interaction-patterns/` 하나다.

| 파일 | 역할 |
| --- | --- |
| `types.ts` | Zod schema + pattern/unknown 어휘 + 분류 정책 상수 |
| `load-exploration.ts` | Task 11 입력 로딩 + fail-fast 교차검증 |
| `facts.ts` | action → rule이 읽을 수 있는 사실 집합 |
| `registry.ts` | rule list + specificity ladder + 무결성 검사 |
| `rules/shared.ts` | `PatternRule` 계약 + evidence 빌더 |
| `rules/{disclosure,tabs,menu,dialog,toggle,selection,dismiss,generic-state-toggle}.ts` | 10개 rule |
| `match-pattern.ts` | 전 rule 실행 + specificity 해소 + 충돌 기록 |
| `classify-unknown.ts` | 9-reason unknown taxonomy |
| `signature.ts` | pattern / unknown fingerprint |
| `build-patterns.ts` | 오케스트레이션 + 결정적 id + 회계 invariant |
| `summarize.ts` | coverage · group · page index · AI 비용 |
| `store.ts` | 별도 `interaction-models/` namespace |
| `ai/{types,build-ai-case,analyzer,fake-analyzer}.ts` | AI 경계 |
| `index.ts` | barrel |

권장 구조에서 `facts.ts`와 `signature.ts`를 추가로 분리했다. `facts.ts`가 있으면 rule이 원본
artifact를 직접 읽을 수 없으므로 "rule이 몰래 class 문자열이나 geometry를 보는" 실수가 구조적으로
불가능해지고, fixture가 rule 하나를 exploration run 없이 검증할 수 있다.

## Input / Output

**입력** (전부 읽기 전용)

```
interaction-exploration.json          ← CLI 인자
interaction-plan.json                 ← 형제 파일
pages/<page-id>/<viewport>/<action-id>.json  ← manifest의 상대 경로
```

Task 11의 `interaction-plan.json`을 형제로 찾는 것은 Task 11이 자기 입력을 찾은 방식과 같은
이유다 — artifact에 적힌 경로는 남의 shell에서의 경로이고 run 디렉터리를 옮기는 순간 깨진다.
대신 `rootUrl` 일치 · action 집합 일치 · action별 provenance 일치를 검증한다.

**출력** (신규 namespace)

```
data/<host>/interaction-models/<run-id>/
  interaction-patterns.json
  unknown-interactions.json
  ai-analysis.json?
```

`data/<host>/interaction-explorations/<run>/`와 `site-observations/<run>/`는 **읽기 전용**이다.
코드 수준에서도 `store.ts`는 그 디렉터리 경로를 만들 수 없다.

## Deterministic Pattern Registry

registry는 if/else 덩어리가 아니라 **명시적 rule list**다. 각 rule은 id · version ·
specificity · description · `requiredEvidence[]` · `optionalEvidence[]` ·
`rejectionConditions[]` · `match()`를 가지고, **rule list 전체가 `interaction-patterns.json`에
그대로 실린다.** SiteSpec compiler나 검수자가 소스를 열지 않고도 "이 pattern은 어떤 ruleset이,
무슨 근거를 요구해서 만들었는가"에 답할 수 있어야 하기 때문이다.

`registryVersion: 1`을 `schemaVersion`과 별도로 둔다(§39). schema가 그대로여도 rule이 바뀌면
pattern의 의미가 바뀐다.

### Rule Specificity

| specificity | rule id | pattern | 실사이트 match |
| --- | --- | --- | --- |
| 100 | `tabs-aria-selected-v1` | tabs | 6 |
| 90 | `dialog-trigger-target-v1` | dialog | 0 |
| 82 | `menu-haspopup-target-v1` | menu | 0 |
| 80 | `menu-target-role-v1` | menu | 9 |
| 70 | `selection-checked-v1` | selection | 30 |
| 68 | `toggle-aria-pressed-v1` | toggle | 0 |
| 60 | `disclosure-native-details-v1` | disclosure | 25 |
| 50 | `disclosure-aria-expanded-v1` | disclosure | 25 |
| 30 | `dismiss-self-removal-v1` | dismiss | 3 |
| 10 | `generic-state-toggle-v1` | generic-state-toggle | 0 |

**모든 specificity 값이 서로 다르다.** 같은 값을 가진 rule 두 개는 동점을 만들고, §13은 동점을
임의로 해소하는 것을 금지한다. 그래서 `assertRegistryIntegrity()`가 중복 id · 중복 specificity ·
내림차순 위반을 modeling 시작 전에 예외로 막는다. fixture가 이것을 직접 검사한다.

**모든 rule이 모든 eligible action에 대해 실행된다.** early return chain이 아니다. 그래서 진
rule이 무엇이었는지가 알려지고, `limitations`에 `"More generic rules also matched and were
outranked by specificity: disclosure-aria-expanded-v1."`처럼 기록된다. 문장 순서 때문에 조용히
사라지는 것이 없다.

동점이 실제로 발생하면 pattern을 만들지 않고 `ruleConflicts[]`에 기록한 뒤
`unmatched-transition`으로 보낸다. 4개 사이트에서 **충돌 0건**이다.

## Pattern Taxonomy

v1은 8개다.

```
disclosure   tabs   menu   dialog   toggle   selection   dismiss   generic-state-toggle
```

`carousel` · `slider` · `before-after` · `parallax` · `mega-menu`는 **넣지 않았다**. Task 11
corpus에 그것을 확정할 관측이 하나도 없고, 아무것도 match할 수 없는 registry 항목은 rule이 아니라
주장이다(§14).

### Toggle vs Selection — 한 번만 결정하고 끝낸다 (§77)

`aria-checked`가 radio에도 checkbox에도 switch에도 붙기 때문에 이 경계가 가장 흔들리기 쉽다.
결정은 **role**에서 자른다.

| | 소속 | rule |
| --- | --- | --- |
| `role=radio` · `role=option` · `role=checkbox` · `menuitemcheckbox/radio` · `<input type=radio\|checkbox>` | 선택 집합의 멤버 | **selection** |
| `aria-pressed` · `role=switch` | 집합에 속하지 않는 on/off 모드 | **toggle** |
| `role=tab` | tabs가 소유 | **tabs** (specificity 100) |

checkbox는 **selection**이다. binary라는 점에서 switch와 닮았지만, `checked` semantics는 전부
"선택된 집합의 멤버"를 뜻하고 같은 계열의 컨트롤로 렌더된다. 잃는 정보는 `mechanism`이 보존한다 —
진짜 `<input>`이면 `native-checked`, ARIA widget이면 `aria-checked`. **같은 behavior가 두 개의
pattern instance를 만들지 않는다**(§77).

## Disclosure

두 mechanism을 두 rule로 나눴다. 나중의 reconstruction이 둘을 다르게 다루기 때문이다.

- `native-details` — 브라우저가 동작을 소유한다. 재구현할 것이 없다.
- `aria-expanded` — 저자가 배선했다. 상태는 attribute에 있고 표시/숨김은 CSS나 JS다.

**target이 없어도 disclosure다**(§15). domainchecker의 모바일 hamburger는 `aria-controls`가 없고
drawer가 평범한 `<div>`라 container 인벤토리에도 안 잡히지만, `aria-expanded false → true`는
컨트롤 자신이 선언한 상태가 검증 가능하게 바뀐 것이다. 이것에 이름을 안 붙이는 것은 엄격함이 아니라
현학이다. 대신 `limitations`에 "선언된 영역이 없으므로 트리거 자신의 상태 전이만 검증됨"을 남긴다.

실측 25건 native-details + 25건 aria-expanded.

MDN에서 나온 비대칭 하나를 그대로 기록한다: 같은 `aria-expanded` 사이드바 컨트롤이 **모바일에서는
declared target의 visibility 전이까지 관측되고(10건), 데스크톱에서는 target이 live DOM에서
resolve되지 않는다(10건)**. viewport-local 정책 덕분에 이 차이가 뭉개지지 않고 두 개의 서로 다른
signature group으로 남았다.

## Tabs

필요한 사실은 딱 둘이다.

1. 트리거가 tab이다 — `role=tab` 또는 Task 10의 `tab-trigger` capability
2. 선택 상태가 움직였다 — `aria-selected` false ↔ true

**`aria-controls`가 정확할 것을 요구하지 않는다**(§17, §73). Task 11이 관측한 nextjs.org tab은
클릭 전 `aria-controls`가 **자기 자신**을 가리키고 클릭 후 `_r_g_`라는 다른 생성 id로 바뀐다.
trigger→panel edge를 필수 조건으로 만들었다면, 누가 봐도 tab인 컨트롤이 남의 사이트 markup 버그
때문에 "tab이 아님"으로 보고됐을 것이다.

그래서 control relation은 **supporting evidence**다. 일치하면 기록하고 어긋나면 무시한다. drift한
id에서 나온 `target-unmounted`는 panel이 사라진 것이 아니라 id churn이라고 `limitations`에 적는다.

실측 6건 (desktop 3 + mobile 3), 전부 nextjs.org. **broken/drifting `aria-controls`에도 6/6이
tabs로 잡혔다.**

## Menu

"menu"는 popup 계열 전체다 — menu / listbox / tree / grid. `dropdown`과 `menu`와 `select`를
지금 쪼개면 하나의 검증된 behavior에 이름 세 개를 붙이는 일이 된다. markup이 실제로 하는 구분은
`subtype`으로 보존한다(`aria-haspopup` 값 또는 열린 영역의 `role` 그대로).

rule은 두 개고 순서가 있다.

| rule | "이건 popup이다"라고 말하는 주체 |
| --- | --- |
| `menu-haspopup-target-v1` (82) | **트리거** — `aria-haspopup` 또는 `menu-trigger` capability |
| `menu-target-role-v1` (80) | **열린 영역** — `role=listbox\|menu\|tree\|grid` |

두 번째 rule은 실측 때문에 존재한다. nextjs.org의 dynamic mount 9건은 전부 `aria-haspopup`이
**하나도 없는** `role=combobox` 버튼이고, 열리는 것은 `role=option` 자식을 가진 `role=listbox`다.
`aria-haspopup`을 필수로 걸었다면 corpus 전체에서 가장 강한 동적 증거를 통째로 버렸을 것이다.

**두 rule 모두 mount만으로는 확정하지 않는다**(§72). 영역이 나타난 것은 무언가 렌더됐다는 뜻일
뿐이고, 트리거의 `aria-expanded` 전이 또는 영역 자신의 popup role이 있어야 menu다.

실측 9건, 전부 `menu/listbox`, 전부 desktop. Task 10이 남긴 118건의 unresolved `aria-controls`
중 계획·실행된 9건이 그대로 **menu pattern으로 설명됐다.** 새로 나타난 interactive descendant는
인벤토리만 있고 클릭하지 않았으므로 `limitations`에 "1 depth"를 명시한다.

## Dialog

**실사이트 match 0건이다.** 4개 사이트 어디에도 클릭으로 열리는 `role=dialog` 영역이 계획·실행되지
않았다. 0을 그대로 기록한다.

rule 자체는 두 방향의 dialog semantics를 받는다 — 트리거 쪽(`dialog-trigger` 또는
`aria-haspopup=dialog`) 또는 영역 쪽(`role=dialog|alertdialog`, `<dialog>`). 어느 쪽이든 **선언된
영역이 실제로 mount되거나 보이게 되어야 한다.**

**background `aria-hidden` churn은 evidence 목록에 아예 없다**(§19). Radix가 modal을 열 때 나머지
페이지에 `aria-hidden="true"`를 붙이고, Task 11은 그 한 번의 open에서 `container-added` 26건과
`aria-hidden` mutation 24건을 측정했다. 그 신호는 modal이 열려도, 비-modal listbox가 열려도,
route가 바뀌어도 똑같이 발생한다. 그것을 근거로 삼으면 "충분히 요란한 클릭"이 전부 dialog가 된다.

## Toggle / Selection

- **selection 30건** — nextjs 테마 라디오 28 (`aria-checked`), seoworld 체크박스 2
  (`native-checked`, DOM property).
- **toggle 0건** — 4개 사이트 어디에도 `aria-pressed` 버튼도 `role=switch`도 없다.

toggle rule은 fixture 커버리지를 가진 채 registry에 남는다. taxonomy는 이 4개 사이트의 요약이
아니라 다음 사이트에 대한 계약이기 때문이다. 다만 **0을 0이라고 보고한다** — 조용한 부재가 coverage
처럼 보이게 두지 않는다.

## Dismiss

트리거가 자기 자신을 문서 밖으로 클릭했고, 페이지는 그대로다. 실측 3건(seoworld).

세 가지를 주장하지 않는다(§22).

- **"modal close"가 아니다.** 사라진 element가 modal 안이었다는 관측은 없다.
- **텍스트에서 유도하지 않았다.** seoworld의 close 버튼은 `aria-label="닫기"` · `text="x"`지만,
  그것을 읽으면 언어별 close-word 사전이 필요해진다. 근거는 구조적이다 — element가 없어졌다.
- **navigation이 아니다.** URL이 움직였거나 navigation safety event가 있으면 즉시 reject한다.
  `candidate-replaced`(framework 재렌더)도 reject한다.

## Generic State Toggle

deterministic floor. stateful ARIA attribute가 false ↔ true로 움직였는데 어떤 구체 rule도 이름을
대지 못한 경우다. specificity 10으로 항상 마지막에 진다.

**실사이트 match 0건이고, 그 0이 중요하다.** seoworld hamburger 16건이 여기 들어오지 않았기
때문이다. 그 컨트롤은 `aria-label`을 "메뉴 열기" → "메뉴 닫기"로 바꾼다. 진짜 상태 변화지만
`aria-label`은 true/false semantics가 없는 사람 텍스트이고, 이것을 받아들이면 라벨에 카운터가 든
버튼이 전부 "state toggle"이 된다. 16건은 `unmatched-transition`으로 남아 증거를 그대로 들고 AI
fallback으로 간다 — §74가 요구한 정직한 결과다.

## Pattern Instance Schema

```
InteractionPatternInstance {
  id                ip000001…
  patternType       subtype?
  ruleId  ruleVersion  registryVersion
  provenance        "derived"      ← 항상
  source            explorationRun / actionId / pageId / url / viewport /
                    sourceCandidateId / sourceElementId / observationFile
  trigger           tagName / role? / inputType? / text? / priority / capabilities[]
  mechanism
  transition        direction? / field / before / after
  target?           relation / targetDomId? / tagName? / role? /
                    existedBefore / existsAfter / mounted / unmounted /
                    visibilityChanged / interactiveDescendantsAfter?
  evidence[]        rule가 요구한 사실 (없으면 발화하지 않았을 것)
  supportingEvidence[]  동의했지만 필수는 아닌 사실
  limitations[]     이 instance가 주장하지 **않는** 것
  signature
}
```

**Task 11 action object를 복제하지 않는다.** `source`는 참조다. 원본 before/after가 필요한 사람은
따라가면 되고, 여기에 복사하면 이 artifact가 4.5 MB run의 두 번째 사본이 되며 둘이 서로 어긋날 수
있게 된다.

`limitations[]`가 형식적인 필드가 아니라는 점을 강조한다. native details는 "Task 09가 초기 open
상태를 저장하지 않으므로 이 live 전이만 주장한다", menu는 "영역 내용은 인벤토리만 했고 활성화하지
않았다", selection은 "집합의 다른 멤버가 함께 바뀌었는지는 관측하지 않았다"를 매번 싣는다.

## Pattern Signatures

```
patternType | subtype | mechanism | direction | triggerTag | triggerRole | targetTag | targetRole | viewport
```

예: `disclosure|details|native-details|closed-to-open|summary||details||desktop`

**id · HTML id · 생성 id · URL · pageId · 텍스트 · aria-label 값 · geometry · 시간은 전부
제외한다.** Radix id(`radix-_R_2miubaaivb_`)가 이것을 규칙으로 만든 이유다 — 그것으로 키를 만들면
동일한 dropdown trigger 20개가 서로 다른 20개 behavior가 된다.

**viewport는 signature에 포함된다.** desktop과 mobile은 독립된 render의 독립된 탐색이고(Task 11
§102), 여기서 합치면 이 파이프라인이 한 번도 구현하지 않은 cross-viewport 컨트롤 매칭을 조용히
주장하게 된다.

4개 사이트 98개 instance → **21개 pattern signature group**.

| site | groups | 대표 group |
| --- | --- | --- |
| domainchecker | 3 | `disclosure/native-details/closed-to-open` desktop 4 · mobile 4 |
| seoworld | 5 | `dismiss/self-removal` desktop 3 |
| nextjs | 7 | `selection/radio/aria-checked` desktop 14 · mobile 14 · `menu/listbox/target-mounted` desktop 9 |
| MDN | 6 | `disclosure/aria-expanded` desktop 10 · mobile 10 |

"같은 React component"라고 주장하지 않는다(§41, §103). 20개 disclosure instance는 하나의 behavior
가 20번 나타난 것이고, 그것이 하나의 Accordion 컴포넌트인지는 클릭으로 관측되지 않는다.

## Unknown Interaction Taxonomy

9개 reason. 순서가 정책이다 — 여러 원인이 동시에 보일 때 **어느 것이 나머지를 설명하는가**로
정렬돼 있고, 먼저 걸리는 것이 이긴다.

```
1. execution-error            action이 완료되지 않음 → 사이트 behavior에 대한 진술이 아님
2. navigation-tainted         URL이 움직임 → before/after가 서로 다른 페이지
3. unmatched-transition       진짜 전이인데 어떤 rule도 설명하지 못함   ← AI의 가장 중요한 입력
   (그중 container churn만 있으면 insufficient-evidence)
--- 여기서부터: 클릭됨, 같은 문서, diff 어휘에 아무것도 안 걸림 ---
4. blocked-navigation         guard가 클릭의 진짜 효과를 막음
5. already-in-target-state    이미 그 상태였음
6. unsupported-dynamic-region node 증감이 불균형 → 관측 어휘 밖의 영역이 변함
7. style-only-change          class/style만 변함
8. opaque-action              문서에서 관측 가능한 것이 전혀 안 움직임
```

순서가 실제로 작동한 예: nextjs 테마 라디오 27건은 `aria-checked="true"`이면서 **동시에** `class`
mutation을 가진다. `already-in-target-state`와 `style-only-change` 둘 다 참이지만, 왜 아무 일도
없었는지를 설명하는 것은 앞의 것이다.

### 실측 분해 (63건)

| reason | domainchecker | seoworld | nextjs | MDN | 합계 | AI |
| --- | --- | --- | --- | --- | --- | --- |
| `navigation-tainted` | 5 | 0 | 0 | 0 | **5** | conditional |
| `style-only-change` | 5 | 0 | 0 | 0 | **5** | eligible |
| `already-in-target-state` | 0 | 0 | 33 | 0 | **33** | excluded |
| `blocked-navigation` | 0 | 0 | 0 | 2 | **2** | excluded |
| `execution-error` | 0 | 0 | 1 | 0 | **1** | excluded |
| `opaque-action` | 0 | 0 | 1 | 0 | **1** | eligible |
| `unsupported-dynamic-region` | 0 | 0 | 0 | 0 | **0** | eligible |
| `unmatched-transition` | 0 | 16 | 0 | 0 | **16** | eligible |
| `insufficient-evidence` | 0 | 0 | 0 | 0 | **0** | eligible |
| **합계** | **10** | **16** | **35** | **2** | **63** | |

## Navigation-tainted Handling

`url-change` 또는 `same-document-navigation` safety event가 있으면 **rule을 아예 실행하지
않는다**(§24, §28). before/after가 서로 다른 페이지이므로 그 차이는 state transition이 아니라 page
replacement이고, 아무리 많아도 pattern evidence가 될 수 없다.

**중요**: candidate 자신의 attribute 변화가 있어도 pattern을 만들지 않는다. domainchecker의
`<a href><button>가격</button></a>` 5건은 클릭 시 `aria-expanded`가 false→true로 바뀌는 것이
저장돼 있지만, 같은 순간 Next.js 라우터가 문서를 교체했으므로 그 attribute가 "새 페이지의 새
버튼의 초기값"인지 "같은 버튼의 전이"인지 결정적 데이터로 구분할 수 없다. 보수적으로 Unknown에
남긴다.

**데이터는 버리지 않는다**(§25). `UnknownInteractionCase.navigation`에 `urlBefore` ·
`urlAfter` · `sameDocumentNavigation`을 compact하게 기록한다. 향후 SPA navigation behavior
modeling이 0에서 시작하지 않아도 된다.

## Style-only Changes

domainchecker 테마 전환 5건. semantic diff 0, mutation `class` 2 + `style` 1, URL 변화 없음.

**`theme-toggle`이라는 pattern type을 만들지 않았다**(§70). 컨트롤은 정상 동작하지만 그 상태가
어떤 semantic attribute에도 표현되지 않으므로, deterministic 층이 정직하게 말할 수 있는 것은
"class/style만 변했다"까지다. AI는 이것을 `theme-switch`라고 inferred할 수 있고 — 실제로 fake
provider가 그렇게 한다 — **그 차이가 유지되는 것이 이 Task의 목적이다.**

## Already Active State

nextjs 33건 (테마 라디오 `aria-checked=true` 27 + tab `aria-selected=true` 6).

조건: before 상태가 **idempotent active** — `aria-selected=true` / `aria-checked=true` /
`aria-pressed=true` / native `checked`·`selected` — 이면서 meaningful change가 없을 것.

**`aria-expanded=true`는 이 목록에 없다.** 이미 열린 disclosure를 다시 클릭하면 **닫혀야** 하므로,
"expanded인데 아무 일도 없었다"는 진짜 설명되지 않은 결과다. 안심되는 라벨 뒤에 진짜 발견을
숨기지 않는다.

AI는 호출하지 않는다(§48, §71). 대신 `preferredProbeState`를 derived한다 — 예
`aria-checked=false`. 이것은 **다음 E2E rerun의 action planner를 위한 추천**이고, 이번 Task는
Task 11의 planner를 한 줄도 고치지 않았다(§31).

## Opaque Actions

nextjs "Copy npx command for creating a new Next.js app" 1건. 클릭은 실행됐고, semantic diff 0,
URL 변화 0, class/style mutation 0. mutation은 `<body>`에 `<span>`이 하나 붙었다 사라진 것뿐 —
aria-live announcer의 모양이다.

`unsupported-dynamic-region`과의 구분은 **node 증감의 균형**이다. 추가 1 / 제거 1로 균형이 맞으면
일시적 churn이고, 불균형이면 문서의 node 인구가 실제로 변해서 유지된 것이므로 관측 어휘 밖의
영역이 변한 것이다. 임계값이 아니라 구조적 조건이다.

clipboard라고 확정하지 않는다(§34). AI는 추론할 수 있고 fake provider가 `clipboard-copy` /
confidence `low`로 그렇게 하지만, provenance는 `inferred`다.

## Unmatched Transitions

**16건, 전부 seoworld의 모바일 hamburger 계열.** `aria-label` "메뉴 열기" → "메뉴 닫기".

Task 11이 이미 이 컨트롤이 정상 동작함을 별도 프로브로 확인했고(§97), mount되는 `<nav>`는 role도
`[aria-hidden]`도 없어 container 인벤토리 밖이다. Task 10 candidate는 `menu-trigger` capability가
없는 P2 native icon button이다.

세 가지 선택지가 있었다.

1. `menu`로 확정 — Task 11 evidence에 menu semantics가 하나도 없다. **거부.**
2. `generic-state-toggle` — `aria-label`은 stateful ARIA attribute가 아니다. **거부.**
3. `unmatched-transition` — 전이는 검증됐고, 이름은 모른다. **채택.**

한국어 "메뉴" 문자열을 rule에 넣지 않았다(§74). 이 16건이 4개 사이트 전체에서 `changed` coverage를
100%에서 86.0%로 끌어내리는 유일한 요인이고, **그 14%가 이 Task에서 가장 정직한 숫자다.**

## AI Eligibility

| | reason | 근거 |
| --- | --- | --- |
| **eligible** | `unmatched-transition` · `style-only-change` · `opaque-action` · `unsupported-dynamic-region` · `insufficient-evidence` | 원인이 진짜로 미상 |
| **conditional** | `navigation-tainted` | DOM 차이가 page replacement라 대부분 noise. SPA navigation을 명시적으로 모델링한 뒤에나 의미 있음 |
| **excluded** | `already-in-target-state` · `blocked-navigation` · `execution-error` | 이미 deterministic하게 설명됨. 아는 답을 모델에게 다시 사게 하는 것이 낭비의 정의 |

| site | unknown | signature groups | eligible | conditional | excluded | **AI 호출 (활성화 시)** |
| --- | --- | --- | --- | --- | --- | --- |
| domainchecker | 10 | 3 | 1 | 2 | 0 | **1** |
| seoworld | 16 | 2 | 2 | 0 | 0 | **2** |
| nextjs | 35 | 7 | 1 | 0 | 6 | **1** |
| MDN | 2 | 1 | 0 | 0 | 1 | **0** |
| **합계** | **63** | **13** | **4** | **2** | **7** | **4** |

**63건의 unknown이 최대 4번의 AI 호출로 끝난다.** eligible occurrence 22건 기준으로도 4건이므로
81.8% 절감이고, unknown 전체 기준으로는 93.7%다. nextjs가 특히 극적이다 — 35건 중 34건이
excluded이고 실제 호출 대상은 clipboard 버튼 1건뿐이다.

정직한 관찰 하나: signature에 mutation category set이 들어가므로 사람이 한 그룹이라고 볼 것을
가끔 더 잘게 쪼갠다. seoworld의 hamburger 16건은 node 제거가 있는 1건과 없는 15건으로 나뉘어 AI
호출이 1이 아니라 2가 된다. §46이 요구한 구성이고, 두 케이스가 실제로 다른 DOM 결과를 냈으므로
과분할이라고 단정하지 않는다.

## AI Fallback Contract

```
UnknownInteractionAnalyzer {
  readonly name: string
  analyze(cases: readonly AiInteractionCase[]): Promise<AiInteractionAnalysis[]>
}
```

세 문장이 이 경계의 전부다.

1. AI는 **compact evidence summary**를 받는다. 페이지를 받지 않는다.
2. AI는 **구조화된 분석**을 돌려준다. action을 돌려주지 않는다.
3. AI 출력은 `inferred`이고 **별도 artifact**에 산다. confirmed pattern이 되지 않고 registry를
   수정하지 않는다.

**AI에게 허용되지 않는 것**: arbitrary shell command, JavaScript 생성·실행, CSS selector 실행,
URL navigation, form submit, file upload, credential 요청, browser control. 스키마에 넣을
자리가 없으므로 구조적으로 불가능하다.

`suggestedNextProbe.actionType`은 **닫힌 enum**이다(§114) — `hover` · `focus` ·
`click-newly-mounted-child` · `observe-style-state` · `inspect-shadow-root` · `inspect-frame` ·
`no-further-probe`. 그리고 **이번 Task는 그것을 실행하지 않는다**(§115). 브라우저를 열지 않는다.

confidence는 **숫자가 아니라 단어**다(`low` / `medium` / `high`). `0.82`는 임계값을 부르고,
임계값은 사이트별 튜닝을 부르고, 사이트별 튜닝은 deterministic 엔진이 heuristic 엔진이 되는
경로다(§12).

**provider는 `fake` 하나만 동봉한다**(§54). 이번 Task는 특정 vendor SDK를 도입하지 않는다 —
아키텍처 경계가 산출물이고 lock-in은 아니다. 실제 provider는
`UnknownInteractionAnalyzer`를 구현하기만 하면 되고 파이프라인의 나머지는 움직이지 않는다.

**provider가 없으면 실패가 아니다**(§55).

```
$ pnpm model:interactions <exploration> --ai
[model:interactions] AI provider not configured — deterministic modeling completed;
                     no ai-analysis.json written.
                     Set --ai-provider <name> or WEB_RECON_AI_PROVIDER to enable the fallback.
```

deterministic artifact 2개는 정상 생성되고 종료 코드는 0이다. 선택적 credential이 없을 때
깨지는 파이프라인 단계는 그 credential을 필수로 만든 것이다.

## AI Data Minimization

payload는 **redaction이 아니라 allowlist**로 만든다. `buildAiCase()`가 이름 붙은 필드로 payload를
**조립**하므로 "그건 지우는 걸 깜빡했다"는 실패 모드가 존재하지 않는다.

보내는 것: caseId · reason · **page path** · viewport · candidate(tag/role/inputType/label/
capabilities) · before/after state summary · diff category · target summary(relation/존재/role/
descendant 수와 role 목록) · mutation category + 카운트 · safety event · partial pattern hint ·
occurrence count.

절대 보내지 않는 것: `outerHTML` · rendered HTML · `dom.json` · `styles.json` · cookie ·
storage · request body · credential · **query string이 포함된 전체 URL**. URL을 path로 줄이는
이유는 Task 11이 safety event를 `origin + pathname`으로 줄인 것과 같다 — query string에는 토큰이
흔히 들어간다.

fixture가 직렬화된 payload를 문자열 수준에서 검사한다: `outerHTML` · `innerHTML` ·
`rendered.html` · `dom.json` · `styles.json` · `cookie` · `Cookie` · `localStorage` ·
`requestBody` · `<div` · `<button` 전부 **부재**.

## No Automatic Rule Promotion

가장 중요한 AI rule이고, fixture가 적대적으로 검사한다.

fake analyzer는 `unmatched-transition`에 대해 **`carousel` / subtype `slide` / confidence
`high`**를 돌려준다 — 이 registry에 없는 pattern type을, 스키마가 허용하는 가장 강한 확신으로.
검사 결과:

```
ai-analysis.json          "carousel" 존재
interaction-patterns.json "carousel" 0건   (문자열 수준 검사)
registry rules            10개, 변경 없음
```

실사이트에서도 동일하게 확인했다. seoworld를 `--ai --ai-provider fake`로 돌리면 2개의 대표 케이스가
16건을 대신해 분석되고 둘 다 `carousel/high`를 받지만, `interaction-patterns.json`에는 carousel이
0건이다.

`AiInteractionAnalysis.proposedPattern.type`이 `PatternTypeSchema`가 아니라 **자유 문자열**인 것도
의도적이다. 모델이 registry가 모르는 단어를 말할 수 있어야 하고, 동시에 그 값이 registry의 pattern
type과 혼동될 수 없어야 한다.

## Rule Promotion Policy

AI가 발견한 것을 나중에 deterministic rule로 승격하려면 다음을 전부 통과해야 한다. 이 문자열은
`ai-analysis.json`에 그대로 실려서, 몇 달 뒤 이 모듈을 본 적 없는 사람이 파일만 읽어도 정책을 알 수
있다.

1. **반복 사례 수집** — 여러 사이트에서 같은 signature가 반복되는가
2. **deterministic observable evidence 정의** — 텍스트나 class가 아닌, ARIA/native/구조 신호로
   표현 가능한가
3. **synthetic fixture** — 그 evidence로 rule이 발화하는가
4. **negative fixture** — 비슷하지만 아닌 것에 발화하지 **않는가**
5. **live canary** — 실사이트 run에서 false positive가 나오지 않는가
6. **false positive 검수** — 사람이 전수 확인

AI 제안은 이 중 어느 것도 자동으로 만족시키지 못한다. `reusableRuleProposal`은 사람이 1번부터
시작하라는 메모일 뿐이고, 이 코드베이스의 어디도 그것을 읽지 않는다.

## Fixture Tests

`pnpm smoke:interaction-patterns` — **88/88 PASS**. 완전히 offline: HTTP 서버 없음, Playwright
없음, 브라우저 없음, network 없음, 외부 AI credential 없음.

fixture는 Task 11 artifact를 손으로 쓰지 않는다. before/after snapshot을 만든 뒤 **Task 11의 실제
`diffSnapshots()`**에 통과시키고, status도 Task 11 자신의
`meaningfulChange ? changed : no-change` 규칙으로 정한다. 그래서 fixture가 Task 11이 절대 기록하지
않을 전이를 주장할 수 없다. 그 다음 run 전체를 디스크에 쓰고 **실제 `loadExploration()`**으로 다시
읽으므로 schema 검증 · 교차 invariant · artifact round-trip이 모두 경로 위에 있다.

| 케이스 | 기대 | 결과 |
| --- | --- | --- |
| §79 native details | disclosure / native-details / closed-to-open | PASS |
| §80 ARIA disclosure + target hidden→visible | disclosure | PASS |
| §15 aria-expanded, target 없음 | disclosure + limitation 명시 | PASS |
| §81 tab | tabs | PASS |
| §82 self-referential + drifting `aria-controls` | tabs 여전히 confirmed, drift는 limitation | PASS |
| §83 menu dynamic mount | menu | PASS |
| §72 aria-haspopup 없는 combobox → role=listbox | menu/listbox | PASS |
| §84 dialog | dialog | PASS |
| §85/§77 checkbox | selection (중복 instance 0) | PASS |
| §20 `aria-pressed` / `role=switch` | toggle | PASS |
| §86 dismiss | dismiss + "무엇을 닫았는지 주장 안 함" | PASS |
| §23 rule 없는 stateful ARIA flip | generic-state-toggle | PASS |
| §94 disclosure + menu 동시 match | menu **1개만** + outranked 기록 | PASS |
| §13 동일 specificity 두 rule | 로드 시 예외 | PASS |
| §13 runtime 동점 | conflict 기록 + pattern 0 | PASS |
| §87 url-change | navigation-tainted, pattern 0, URL 보존 | PASS |
| §88 style-only | style-only-change | PASS |
| §89/§30 already selected / checked | already-in-target-state + preferredProbeState | PASS |
| §90 blocked navigation | blocked-navigation | PASS |
| §91 actionability-error | execution-error | PASS |
| §34 opaque | opaque-action | PASS |
| §120 불균형 node churn | unsupported-dynamic-region | PASS |
| §93 aria-label만 바뀐 전이 | unmatched-transition + AI eligible | PASS |
| §74 …그리고 generic-state-toggle로 강등되지 않음 | pattern 0 | PASS |
| §27 container churn만 | insufficient-evidence | PASS |
| §95 입력 순서 반전 | logical output 동일 | PASS |
| §95 같은 run 2회 | byte 동일, timestamp 0 | PASS |
| §96 fake provider | eligible group 대표만 호출, excluded 0 호출 | PASS |
| §97 data minimization | 금지 문자열 전부 부재 | PASS |
| §98 carousel/high 반환 | patterns.json에 carousel 0 | PASS |
| §7 artifact 누락 / viewport 불일치 / actionId 중복 / status 모순 | 전부 fail-fast | PASS |
| §59 import graph | Playwright / Firecrawl / network module 도달 0 | PASS |

§59는 산문으로 "브라우저 없음"이라고 쓰는 대신 barrel과 CLI에서 **실제 import graph를 걸어서**
확인한다 — 31개 파일이 도달하고 외부 의존은 `zod` · `node:fs/promises` · `node:path` ·
`node:crypto`뿐이다. Playwright · Firecrawl · HTTP 클라이언트는 그래프 안에 없다.

추가로 커버: taxonomy 8종 전부 · unknown reason 9종 전부 · registry 10개 rule 전부 최소 1회 발화 ·
pattern/unknown id 조밀 순열 · provenance `derived` 전수 · `inferred` 부재 · artifact에 DOM/HTML
문자열 부재 · 절대 경로 부재 · Zod round-trip · viewport-local 보장 · page index가 모든 pattern을
정확히 1회 색인.

## domainchecker Results

5 page · 23 action.

| | 수 |
| --- | --- |
| confirmed pattern | **13** (disclosure 13) |
| unknown | 10 |
| changed coverage | **100.0%** (13/13) |
| executed coverage | 56.5% (13/23) |

mechanism: `native-details` 8 (desktop 4 / mobile 4), `aria-expanded` 5 (전부 mobile).

**§75 모바일 hamburger는 deterministic disclosure로 잡혔다.** `aria-expanded false → true`가
candidate 자신에게서 검증됐고, drawer가 `role`도 `aria-controls`도 없는 평범한 `<div>`라 target이
없어도 rule이 발화한다. `limitations`에 "선언된 영역 없음"이 기록된다.

unknown 10건: `navigation-tainted` 5 (`<a href><button>가격</button></a>`) + `style-only-change`
5 (테마 전환). **테마 전환은 `theme-toggle` pattern이 되지 않았다.**

## seoworld Results

16 page · 23 action. **이번 Task에서 가장 낮은 coverage이고, 가장 중요한 결과다.**

| | 수 |
| --- | --- |
| confirmed pattern | **7** (disclosure 2 · selection 2 · dismiss 3) |
| unknown | 16 (전부 `unmatched-transition`) |
| changed coverage | **30.4%** (7/23) |
| executed coverage | 30.4% (7/23) |

desktop 5 action은 5개 전부 pattern이 됐고, mobile 18 action 중 16개가 unknown이다. 그 16개가
전부 §74의 hamburger 계열이다.

`candidate-removed` 3건이 `dismiss`가 됐고, `<input type=checkbox>` 2건이 `selection/checkbox`가
됐다 — DOM **property**로 읽었기 때문에 잡힌 전이다.

## nextjs Results

14 page · 80 action (79 실행).

| | 수 |
| --- | --- |
| confirmed pattern | **45** (selection 28 · menu 9 · tabs 6 · disclosure 2) |
| unknown | 35 |
| changed coverage | **100.0%** (45/45) |
| executed coverage | 57.0% (45/79) |

**§72 dynamic mounted target 9건이 전부 `menu/listbox`로 설명됐다.** Task 10이 "정적 관측의
경계"라고 기록하고 Task 11이 "9/9 mount"로 넘은 그 케이스가, Task 12에서 이름을 얻었다. 9건 모두
desktop이다.

**§73 tab 6건이 broken/drifting `aria-controls`에도 전부 `tabs`로 잡혔다.** `aria-controls`
`_R_14naotbsnuiubaaivb_` → `_r_g_` drift와 `candidate-replaced`는 supporting evidence와
limitation으로 기록됐고, 판정에는 쓰이지 않았다.

unknown 35건은 `already-in-target-state` 33 + `execution-error` 1 + `opaque-action` 1이다.
33건은 Task 11의 shape 대표 선택 규칙의 대가이고(§31), `preferredProbeState`로
`aria-checked=false` / `aria-selected=false`를 남겼다.

## MDN Results

10 page · 35 action.

| | 수 |
| --- | --- |
| confirmed pattern | **33** (전부 disclosure) |
| unknown | 2 (전부 `blocked-navigation`) |
| changed coverage | **100.0%** (33/33) |
| executed coverage | **94.3%** (33/35) |

**§76 native details가 전부 disclosure/native-details로 잡혔다** — 13건. 그중 2건은
`open-to-closed`다(초기에 열려 있던 `<details>`). 나머지 20건은 `aria-expanded` 사이드바
disclosure다.

앞서 언급한 desktop/mobile 비대칭이 여기서 나온다: mobile 10건은 declared target의 visibility 전이
까지 관측됐고(`targetTag=div`), desktop 10건은 같은 컨트롤인데 target이 live DOM에서 resolve되지
않아 candidate 자신의 전이로만 판정됐다. 두 개의 서로 다른 signature group으로 남았고, 합치지
않았다.

`blocked-navigation` 2건은 `<summary>` 안에 링크가 있어 navigation guard가 발화한 경우다. 변화가
없는 원인이 **사이트가 아니라 이 엔진**이므로 AI에서 제외된다.

## Pattern Coverage

| site | executed | changed | confirmed patterns | unmatched changed | unknown total | changed coverage | executed coverage |
| --- | --- | --- | --- | --- | --- | --- | --- |
| domainchecker.co.kr | 23 | 13 | 13 | 0 | 10 | **100.0%** | 56.5% |
| seoworld.co.kr | 23 | 23 | 7 | 16 | 16 | **30.4%** | 30.4% |
| nextjs.org | 79 | 45 | 45 | 0 | 35 | **100.0%** | 57.0% |
| developer.mozilla.org | 35 | 33 | 33 | 0 | 2 | **100.0%** | 94.3% |
| **합계** | **160** | **114** | **98** | **16** | **63** | **86.0%** | **61.3%** |

pattern type 분포:

| site | disclosure | tabs | menu | dialog | toggle | selection | dismiss | generic-state-toggle |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| domainchecker.co.kr | 13 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| seoworld.co.kr | 2 | 0 | 0 | 0 | 0 | 2 | 3 | 0 |
| nextjs.org | 2 | 6 | 9 | 0 | 0 | 28 | 0 | 0 |
| developer.mozilla.org | 33 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| **합계** | **50** | **6** | **9** | **0** | **0** | **30** | **3** | **0** |

mechanism 분포: `aria-checked` 28 · `native-details` 25 · `aria-expanded` 25 · `target-mounted` 9
· `aria-selected` 6 · `candidate-removed` 3 · `native-checked` 2.

**executed coverage 61.3%가 changed coverage 86.0%보다 훨씬 낮은 이유는 전부 설명돼 있다** —
executed 160건 중 46건이 애초에 아무 전이도 만들지 않은 `no-change`이고, 그 46건 각각의 원인이 아래
표에 분해돼 있다.

## Unknown Breakdown

| site | nav-tainted | style-only | already-active | blocked-nav | exec-error | opaque | unsupported-region | unmatched | insufficient | 합계 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| domainchecker.co.kr | 5 | 5 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 10 |
| seoworld.co.kr | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 16 | 0 | 16 |
| nextjs.org | 0 | 0 | 33 | 0 | 1 | 1 | 0 | 0 | 0 | 35 |
| developer.mozilla.org | 0 | 0 | 0 | 2 | 0 | 0 | 0 | 0 | 0 | 2 |
| **합계** | **5** | **5** | **33** | **2** | **1** | **1** | **0** | **16** | **0** | **63** |

**정확한 회계** (코드가 예외로 강제한다):

```
161 planned = 114 changed + 46 no-change + 1 actionability-error

114 changed  = 98 confirmed pattern + 16 unmatched-transition      ✔
 46 no-change= 5 navigation-tainted + 5 style-only-change
             + 33 already-in-target-state + 2 blocked-navigation
             + 1 opaque-action                                      ✔
  1 error    = 1 execution-error                                    ✔

161          = 98 pattern + 63 unknown                              ✔
```

`assertAccounting()`이 이 등식을 artifact를 쓰기 전에 검사하고, 어긋나면 **예외를 던진다**. 숫자가
맞지 않는 modeling run이 권위 있어 보이는 파일을 남기게 두지 않는다.

## Desktop / Mobile

Task 11과 동일하게 semantic element matching은 하지 않는다. PatternInstance는 viewport-local이고,
signature에 viewport가 들어간다.

| site | desktop actions / patterns / unknown | mobile actions / patterns / unknown |
| --- | --- | --- |
| domainchecker.co.kr | 9 / 4 / 5 | 14 / 9 / 5 |
| seoworld.co.kr | 5 / 5 / 0 | 18 / 2 / 16 |
| nextjs.org | 45 / 27 / 18 | 35 / 18 / 17 |
| developer.mozilla.org | 20 / 18 / 2 | 15 / 15 / 0 |
| **합계** | **79 / 54 / 25** | **82 / 44 / 38** |

두 개의 진짜 비대칭이 드러났고 둘 다 뭉개지지 않았다.

- **seoworld** desktop 100% / mobile 11.1%. 모바일 네비게이션이 ARIA state를 쓰지 않는다.
- **nextjs menu 9건이 전부 desktop.** 모바일 뷰포트에서는 그 combobox가 계획되지 않았다.

## Representative vs Validation Sample

Task 09의 validation sample 페이지에서 수행된 Task 11 exploration을 pattern 관점에서 비교했다.
**추가 브라우저 실행은 없다.** Family algorithm은 수정하지 않았다.

| site | sample pages | representative pattern types | sample pattern types | 차이 |
| --- | --- | --- | --- | --- |
| domainchecker.co.kr | 1 | disclosure (10) | disclosure (3) | 없음 |
| seoworld.co.kr | 0 | disclosure · selection · dismiss | — | 비교 불가 |
| nextjs.org | 2 | disclosure · menu · selection · tabs | menu · selection · tabs | sample에 disclosure 부재 |
| developer.mozilla.org | 1 | disclosure (29) | disclosure (4) | 없음 |

nextjs의 sample 페이지 2개에 `disclosure`가 없는 것은 representative 쪽에서도 native `<details>`가
2건뿐(desktop 1 / mobile 1)이고 특정 blog 페이지에만 있기 때문이다. 대표성 실패라고 단정하기에는
표본이 너무 작다 — 측정만 기록한다.

## AI Call Reduction Estimate

```
unknown occurrence   63
unknown signature    13
AI eligible group     4
                      ↓
AI 호출 (활성화 시)     4      ← occurrence 대비 93.7% 절감
                              ← eligible occurrence(22) 대비 81.8% 절감
```

fake provider로 seoworld에서 실제 검증했다: **2회 호출로 16건을 대신**했고(`analyzedCaseCount: 2`,
`representedCaseCount: 16`), 결과는 전부 `provenance: inferred`이며 `interaction-patterns.json`은
바이트 하나 바뀌지 않았다.

## Storage

| site | interaction-patterns.json | unknown-interactions.json | 합계 |
| --- | --- | --- | --- |
| domainchecker.co.kr | 35.4 KB | 21.7 KB | **57.1 KB** |
| seoworld.co.kr | 27.0 KB | 29.0 KB | **55.9 KB** |
| nextjs.org | 116.4 KB | 70.6 KB | **187.0 KB** |
| developer.mozilla.org | 77.9 KB | 4.7 KB | **82.7 KB** |
| **합계** | **256.7 KB** | **126.0 KB** | **382.7 KB** |

Task 11의 4.49 MB 대비 **8.3%**, Task 09 관측 350.86 MB 대비 **0.11%**.

Task 11 action JSON을 복제하지 않은 결과다. pattern instance 하나는 source 참조 + compact
trigger + transition + evidence 뿐이고, fixture가 artifact 안에 `<div` · `<button` ·
`outerHTML` · `innerHTML` 문자열이 없음을 검사한다.

`interaction-patterns.json`의 상당 부분은 rule list 자체(10개 rule의 evidence 계약 전문)와 매
instance의 `limitations[]`다. 의도적이다 — 이 파일 하나로 "무엇을, 어떤 근거로, 무엇을 주장하지
않으면서" 판정했는지가 전부 답변돼야 한다.

## Performance

| site | actions | patterns | unknowns | pattern groups | unknown groups | elapsed |
| --- | --- | --- | --- | --- | --- | --- |
| domainchecker.co.kr | 23 | 13 | 10 | 3 | 3 | 43 ms |
| seoworld.co.kr | 23 | 7 | 16 | 5 | 2 | 38 ms |
| nextjs.org | 80 | 45 | 35 | 7 | 7 | 72 ms |
| developer.mozilla.org | 35 | 33 | 2 | 6 | 1 | 46 ms |
| **합계** | **161** | **98** | **63** | **21** | **13** | **199 ms** |

전부 O(actions)다. 161 action 전체가 0.2초에 끝난다. hard performance target은 두지 않았다 —
비용의 실체는 Task 11의 342초 브라우저 시간이고, 이 단계는 그것을 재사용한다.

**elapsed는 deterministic artifact 안에 들어가지 않는다.** CLI가 출력하고 이 보고서가 기록한다
(§95).

## Existing Artifact Immutability

4개 사이트 modeling 전후로 Task 09/10/11 파일 **1,009개**의 mtime과 크기를 전수 비교했다.

```
find data/*/site-observations data/*/interaction-explorations -type f \
  -exec stat -f '%m %z %N' {} + | sort
→ before/after diff: 차이 없음 (1,009 files)
```

구조적으로도 보장된다: `store.ts`는 `data/<host>/interaction-models/<run-id>/` 외의 경로를 만들 수
없고, 이 모듈 어디에도 `site-observations`나 `interaction-explorations` 문자열이 없다.

**결정성**도 실데이터로 확인했다. 4개 사이트 각각 2회 실행 → `interaction-patterns.json`과
`unknown-interactions.json` 모두 **byte-identical**.

## Problems Encountered

**1. Radix combobox에 `aria-haspopup`이 없다.** §18의 권장 rule("aria-haspopup 또는 menu-trigger
capability")을 그대로 구현하고 nextjs를 돌렸더니 dynamic mount 9건이 전부 unmatched였다. 실데이터를
보니 트리거는 `role=combobox` + `aria-expanded` + `select`/`open-options` capability이고, `menu`
라고 말하는 것은 **열린 영역 쪽**(`role=listbox` + `role=option` 자식)이었다. → menu rule을 두
개로 나누고, 영역이 선언하는 popup role도 authoritative evidence로 받아들였다(specificity 80,
트리거 선언 82보다 한 단계 아래). 9/9 확정.

**2. `already-in-target-state`와 `style-only-change`가 같은 action에 둘 다 참이었다.** nextjs
테마 라디오 27건은 `aria-checked=true`이면서 `class` mutation을 가진다. 어느 쪽으로 분류해도
"틀리지" 않지만 한쪽만 **원인**이다. → unknown taxonomy를 first-match-wins 순서로 만들고, 그
순서가 "무엇이 나머지를 설명하는가"를 인코딩한다는 것을 코드 주석과 이 보고서에 명시했다.

**3. `opaque-action`과 `unsupported-dynamic-region`의 경계.** clipboard 버튼은 `<body>`에
`<span>`이 하나 붙었다 사라진다 — node mutation이 **있다**. §34는 이것을 opaque라고 부르고, §27은
관측 어휘 밖의 영역 변화를 위한 별도 enum을 준다. → 임계값 대신 구조적 조건을 썼다: **추가 node 수
≠ 제거 node 수**면 문서의 node 인구가 실제로 변해서 유지된 것이고, 균형이면 일시적 churn이다.
clipboard는 1/1로 균형이므로 opaque, 이론적 케이스는 unsupported-dynamic-region.

**4. 임시 디렉터리에서 돌린 fixture가 artifact에 절대 경로를 남겼다.** provenance 경로를
"cwd 밖이면 그대로 절대 경로"로 만든 것이 원인이었다. → cwd 밖이면 마지막 두 segment만 남기도록
바꿨다. 실데이터 경로는 원래 cwd 안이라 변화가 없고, artifact가 남의 파일시스템 배치를 설명하는
일이 구조적으로 사라졌다. Task 11의 loader가 "caller의 형태를 유지한다"고 적은 것과 같은 이유다.

**5. menu rule이 같은 사실을 required와 supporting 양쪽에 실었다.** 읽는 사람에게 독립적인 관측이
두 개 있는 것처럼 보인다. → instance를 만들 때 `(signal, source)`가 required에 이미 있는 supporting
항목을 제거한다. required가 이긴다.

## Technical Decisions

**Rules first, Unknown second, AI last.** 순서가 아키텍처다. deterministic pattern이 이미
confirmed면 AI를 호출하지 않고, AI는 deterministic 결과를 override할 수 없으며, AI 결과는 별도
파일에 산다.

**모든 rule을 실행하고 나중에 specificity로 고른다.** early return chain이면 진 rule이 무엇이었는지
알 수 없다. 지금은 `limitations`에 "outranked by specificity"가 남는다.

**specificity 동점은 해소하지 않는다.** 동점은 registry 버그이고, 동전 던지기로 고르면 그 버그가
영원히 안 보인다. 기록하고 unknown으로 보낸다. `assertRegistryIntegrity()`가 동점 rule을 애초에
배포할 수 없게 만든다.

**checkbox는 selection이다.** 한 번 결정하고 `mechanism`으로 구분을 보존한다. 같은 behavior가 두
pattern instance를 만들지 않는다.

**`aria-label`은 state가 아니다.** seoworld hamburger 16건이 unmatched로 남는 대가를 치른다.
받아들이면 라벨에 카운터가 든 버튼이 전부 state toggle이 된다.

**`aria-expanded=true`는 `already-in-target-state`가 아니다.** 이미 열린 disclosure는 다시 누르면
닫혀야 한다. 안심되는 라벨 뒤에 진짜 발견을 숨기지 않는다.

**facts 층을 따로 둔다.** rule이 원본 artifact를 못 보므로 class 문자열·geometry·mutation 값에
몰래 손댈 수 없고, fixture가 rule 하나를 exploration run 없이 검증할 수 있다.

**AI payload는 allowlist로 조립한다.** redaction은 "그건 지우는 걸 깜빡했다"를 허용한다.

**AI provider 부재는 실패가 아니다.** 선택적 credential이 없을 때 깨지는 단계는 그 credential을
필수로 만든 것이다.

**deterministic artifact에 timestamp를 넣지 않는다.** modeling은 Task 11 run의 순수 함수여야
하고, 실측으로 byte 동일을 확인했다.

**회계를 예외로 강제한다.** `patterns + unknowns == actions`가 코드 수준 invariant다. 숫자가 맞지
않으면 파일을 만들지 않는다.

## Current Limitations

**1. `aria-label`로만 상태를 표현하는 컨트롤은 이름이 없다.** seoworld hamburger 16건. 의도적
보수성이고, changed coverage 14%의 전부다.

**2. class/style로만 상태를 표현하는 컨트롤도 이름이 없다.** domainchecker 테마 5건.
`style-only-change`로 정확히 분류될 뿐이다.

**3. dialog / toggle / generic-state-toggle rule은 실데이터 match가 0이다.** fixture로만 검증됐다.
다음 사이트에서 처음 발화할 때 false positive 여부를 확인해야 한다.

**4. `menu`가 popup 계열 전체다.** dropdown / select / combobox / context menu를 지금 구분하지
않는다. `subtype`에 markup이 말한 role이 남아 있으므로 나중에 쪼갤 수 있다.

**5. selection이 집합의 다른 멤버를 보지 못한다.** Task 11이 클릭한 컨트롤과 그것이 선언한 영역만
캡처하므로, radio 하나가 켜질 때 다른 것이 꺼졌는지는 관측되지 않았다. 매 instance의
`limitations`에 기록된다.

**6. unknown signature가 사람보다 잘게 쪼갤 수 있다.** mutation category set이 키에 들어가므로
seoworld hamburger가 2개 group이 된다(AI 호출 1 → 2).

**7. Task 11의 한계가 그대로 상속된다** — container 인벤토리 셀렉터 밖의 영역, `<details>` 초기
open 상태, shape 대표가 이미 활성 상태인 문제, 1 action depth, Shadow DOM / iframe, WebSocket /
Service Worker, `history.pushState`. 이번 Task는 그것들을 고치지 않고 **어떤 case가 왜 unknown으로
남는지를 정확히 구조화했다.** Explorer는 한 줄도 수정하지 않았다.

**8. `preferredProbeState`는 추천일 뿐이다.** Task 11 planner를 수정하지 않았으므로 다음 rerun에서
누군가 읽어야 효과가 있다.

**9. 실제 AI provider는 연결하지 않았다.** contract와 fake provider까지다.

## P1/P2 vs Pattern, Pattern vs Component

혼동하기 쉬운 두 경계를 명시한다.

**Task 10의 P1/P2/P3는 candidate priority이고, Task 12의 Pattern은 검증된 behavior다.** P1이라고
pattern이 되는 것이 아니다 — nextjs의 P1 테마 라디오 33건은 `already-in-target-state` unknown이다.
P2도 evidence가 충분하면 pattern이 된다 — seoworld의 P2 close 버튼 3건이 `dismiss`이고, P2 체크박스
2건이 `selection`이다.

**Pattern은 behavior이지 component가 아니다**(§103). MDN의 disclosure 33건이 하나의 Accordion
React component라고 주장하지 않는다. 현재 말할 수 있는 것은 behavior similarity뿐이다.

**Pattern은 behavior이지 layout이 아니다**(§104). "menu가 열렸다"는 기록하지만 어디에 뜨는지, 색이
무엇인지, border-radius가 무엇인지는 Task 09 Observation과 SiteSpec의 몫이다. 이번 Task는 layout을
분석하지 않는다.

## Next Task Recommendation

**Task 13 — SiteSpec Compiler.**

```
Static Observation (Task 09)
+ Page Family (Task 07/08)
+ Responsive Observation (Task 05)
+ Verified Interaction Patterns (Task 12)
+ Unknown Interaction Metadata (Task 12)
        ↓
   하나의 reconstruction IR
```

Task 13이 필요한 것은 이미 `interaction-patterns.json`에 있다(§117, §118).

```
pages[] {
  pageId · url
  desktopPatternIds[] · mobilePatternIds[]
  patternTypes[]
  unknownCount
}
```

페이지별로 어떤 verified behavior가 있는지, trigger가 무엇인지, 어떤 target/state가 바뀌는지,
desktop/mobile 어디서 관측됐는지, 그리고 무엇이 아직 unknown인지를 한 번에 읽을 수 있다. fixture가
이 index가 모든 pattern을 정확히 한 번 색인함을 검사한다.

같이 검토할 것: Task 11의 shape 대표 선택 규칙(unknown 33건의 원인이고 `preferredProbeState`가
이미 답을 적어 뒀다), container 인벤토리 셀렉터 확장(seoworld 16건의 원인), 그리고 `menu` subtype
분화 시점.

추천만 하고 구현하지 않는다. 이번 Task는 SiteSpec을 만들지 않았다.

## Changed Files

**신규**

```
src/interaction-patterns/types.ts
src/interaction-patterns/load-exploration.ts
src/interaction-patterns/facts.ts
src/interaction-patterns/registry.ts
src/interaction-patterns/rules/shared.ts
src/interaction-patterns/rules/disclosure.ts
src/interaction-patterns/rules/tabs.ts
src/interaction-patterns/rules/menu.ts
src/interaction-patterns/rules/dialog.ts
src/interaction-patterns/rules/toggle.ts
src/interaction-patterns/rules/selection.ts
src/interaction-patterns/rules/dismiss.ts
src/interaction-patterns/rules/generic-state-toggle.ts
src/interaction-patterns/match-pattern.ts
src/interaction-patterns/classify-unknown.ts
src/interaction-patterns/signature.ts
src/interaction-patterns/build-patterns.ts
src/interaction-patterns/summarize.ts
src/interaction-patterns/store.ts
src/interaction-patterns/ai/types.ts
src/interaction-patterns/ai/build-ai-case.ts
src/interaction-patterns/ai/analyzer.ts
src/interaction-patterns/ai/fake-analyzer.ts
src/interaction-patterns/index.ts
src/cli-model-interactions.ts
scripts/smoke-interaction-patterns.ts
docs/result/12-interaction-pattern-modeling-and-unknown-strategy-2026-08-13.md
```

**수정**

```
package.json   model:interactions / smoke:interaction-patterns 스크립트 추가
README.md      파이프라인 + Task 12 절 + CLI + 출력 구조 + 프로젝트 구조 갱신
ROADMAP.md     Task 12 완료 반영, Task 13 추천
```

**observer / multi-observer / selector / verifier / interaction-detector / interaction-explorer
코드는 한 줄도 수정하지 않았다.**

## Reviewer Checklist

| 명령 | 결과 |
| --- | --- |
| `pnpm typecheck` | PASS |
| `pnpm smoke:verifier` | 81/81 PASS |
| `pnpm smoke:selector` | 81/81 PASS |
| `pnpm smoke:multi-observer` | 58/58 PASS |
| `pnpm smoke:interaction-detector` | 92/92 PASS |
| `pnpm smoke:interaction-explorer` | 95/95 PASS |
| `pnpm smoke:interaction-patterns` | **88/88 PASS** |
| 4개 실사이트 modeling | PASS (161 action · Playwright 0 · Firecrawl 0 · network 0 · AI 0) |
| Task 09/10/11 artifact mutation | **0** (1,009 파일 mtime+size 동일) |
| 결정성 | PASS (실데이터 4사이트 2회 byte 동일) |
| rule conflict | **0** |
| duplicate pattern instance | **0** |
| AI 자동 승격 | **0** |

---

## 검수자가 반드시 확인할 15가지 (§125)

**1. 160 executed actions 중 몇 개가 deterministic pattern으로 설명됐는가?**

**98개 (61.3%).** 나머지 62건은 executed이지만 전이가 없었거나(46 `no-change`) rule이 이름을 대지
못했다(16 `unmatched-transition`). planned 161 기준으로는 60.9%다.

**2. 114 changed 중 몇 개가 known pattern으로 설명됐는가?**

**98개 (86.0%).** 사이트별로 크게 다르다: domainchecker 100% · nextjs 100% · MDN 100% ·
seoworld 30.4%. 낮은 하나의 원인이 전부 3번 답이다.

**3. unmatched-transition은 몇 개인가?**

**16개.** 전부 seoworld의 모바일 hamburger 계열이고, `aria-label` "메뉴 열기" → "메뉴 닫기" 하나로
상태를 표현한다. `insufficient-evidence`는 0건이다.

**4. no-change 46건이 각각 어떤 unknown reason으로 분해됐는가?**

```
33  already-in-target-state   nextjs 테마 라디오 27 + tab 6 (이미 활성)
 5  navigation-tainted        domainchecker <a href><button>가격</button></a>
 5  style-only-change         domainchecker 테마 전환 (class 2 / style 1)
 2  blocked-navigation        MDN <summary> 안의 링크 (guard 발화)
 1  opaque-action             nextjs "Copy npx command…" (clipboard)
───
46                                                                   ✔
```

`assertAccounting()`이 이 합계를 코드에서 강제한다. 하나라도 어긋나면 artifact를 쓰지 않고 예외를
던진다.

**5. navigation-tainted는 pattern evidence에서 완전히 제외됐는가?**

**그렇다.** `isPatternEligible()`이 rule 실행 **이전에** `urlChanged` 또는
`same-document-navigation`을 걸러낸다. 5건 전부 pattern 0개이고, candidate 자신의 `aria-expanded`
변화가 저장돼 있어도 만들지 않았다. fixture §87이 검사한다. 데이터는 버리지 않았다 —
`urlBefore` / `urlAfter` / `sameDocumentNavigation`이 unknown case에 남아 있다.

**6. native details는 전부 disclosure로 잡히는가?**

**그렇다. 25/25.** MDN 13 · domainchecker 8 · seoworld 2 · nextjs 2. 전부
`mechanism: native-details`이고, direction은 `closed-to-open` 23 · `open-to-closed` 2(초기에
열려 있던 `<details>`)다.

**7. nextjs tab은 broken/drifting aria-controls에도 Tabs로 잡히는가?**

**그렇다. 6/6.** rule의 필수 evidence는 `role=tab`(또는 `tab-trigger`)과 `aria-selected` 전이
둘뿐이고, `aria-controls`는 supporting이다. `_R_14naotbsnuiubaaivb_` → `_r_g_` drift와 그에 따른
`target-unmounted`는 `limitations`에 "id churn이지 panel이 제거된 증거가 아니다"로 기록된다.
fixture §82가 self-referential + drift 케이스를 직접 재현한다.

**8. nextjs dynamic mounted targets는 menu/dialog 등으로 얼마나 설명됐는가?**

**9/9 전부 `menu`, subtype `listbox`.** Task 10이 "정적 관측의 경계"로 남기고 Task 11이 "9/9
mount"로 넘은 케이스다. 확정 근거는 트리거의 `aria-expanded false → true` + 영역의 `role=listbox`
이고, **mount만으로는 확정하지 않는다**. 영역 안 `role=option` 자식 2개는 supporting evidence로
기록되고 클릭하지 않았다.

**9. seoworld hamburger는 deterministic pattern인가, unknown인가? 그 근거는 무엇인가?**

**Unknown — `unmatched-transition` 16건.**

근거: Task 10 candidate는 `menu-trigger` capability가 없는 P2 native icon button이고, Task 11
evidence는 `aria-label` 값 변화 하나뿐이다. ARIA state 0개, control relation 0개, mount된 `<nav>`는
container 인벤토리 셀렉터 밖. `menu`로 확정할 markup 근거가 없고, `aria-label`은 true/false
semantics가 없으므로 `generic-state-toggle`도 아니다. 한국어 "메뉴" 문자열은 rule에 넣지 않았다.
AI는 `menu`라고 infer할 수 있고 — 그것이 이 16건이 AI eligible인 이유다.

**10. style-only theme switch는 억지 pattern으로 분류되지 않았는가?**

**되지 않았다.** domainchecker 5건은 `style-only-change` unknown이고 `theme-toggle`이라는 pattern
type은 registry에 존재하지 않는다. fake provider는 같은 케이스를 `theme-switch` /
confidence `medium`으로 inferred하고, 그 결과는 `ai-analysis.json`에만 있다. fixture가 두 층이
갈라져 있음을 검사한다.

**11. deterministic registry 충돌은 있었는가?**

**0건.** 10개 rule 전부 서로 다른 specificity를 가지고, `assertRegistryIntegrity()`가 중복
specificity·중복 id·정렬 위반을 modeling 시작 전에 예외로 막는다. 4개 사이트 161 action에서
`ruleConflicts[]`는 비어 있다.

중복 pattern instance도 0건이다. 하나의 action은 최대 하나의 instance를 만들고, fixture §94가
`aria-expanded` + `aria-haspopup=menu` + `role=menu` mount가 **menu 하나만** 만드는 것을 검사한다.

**12. AI eligible unknown signature는 몇 개인가?**

**4개** (전체 13개 signature group 중). domainchecker 1(style-only) · seoworld 2(unmatched) ·
nextjs 1(opaque) · MDN 0. conditional 2개(navigation-tainted), excluded 7개.

**13. AI를 켠다고 가정할 때 occurrence가 아니라 몇 signature만 호출하면 되는가?**

**4번.** unknown occurrence 63건 → 93.7% 절감. eligible occurrence 22건 기준 81.8% 절감.
`selectAiCases()`가 eligible group당 대표(가장 낮은 case id) 1개만 고르고, fixture가
"sent == eligible group 수"와 "excluded case는 하나도 전송되지 않음"을 검사한다. 실사이트에서도
확인했다 — seoworld 2회 호출로 16건 대표.

**14. AI 결과가 confirmed registry로 자동 승격되지 않는가?**

**되지 않는다.** fake provider가 `unmatched-transition`에 대해 `carousel` / subtype `slide` /
confidence `high`를 돌려주지만:

```
ai-analysis.json           carousel 존재
interaction-patterns.json  carousel 0건 (문자열 검사)
registry rules             10개, 변경 없음
pattern instance           provenance=derived만 존재, inferred 0
```

fixture와 실사이트(seoworld `--ai --ai-provider fake`) 양쪽에서 확인했다. 승격 정책 6단계는
`ai-analysis.json`의 `promotionPolicy` 필드에 문자열로 실려 artifact 밖에서도 읽힌다.

**15. SiteSpec Compiler가 소비할 데이터가 충분한가?**

**충분하다.** `interaction-patterns.json` 하나로 다음이 전부 답변된다.

- 페이지별 verified behavior — `pages[].desktopPatternIds` / `mobilePatternIds` /
  `patternTypes` / `unknownCount`
- trigger가 무엇인가 — `patterns[].trigger` (tag / role / inputType / text / priority /
  capabilities)
- 어떤 target/state가 바뀌는가 — `patterns[].transition` + `patterns[].target`
- desktop/mobile 어디서 관측됐는가 — `patterns[].source.viewport` + `viewportSummary`
- 반복 여부 — `groups[]` (signature별 instance 수와 page 목록)
- 어떤 ruleset이 판정했는가 — `registryVersion` + `rules[]` 전문
- 무엇을 주장하지 **않는가** — 매 instance의 `limitations[]`
- unknown interaction이 무엇인가 — `unknown-interactions.json`의 63건 + 13 signature group

fixture가 page index가 98개 pattern을 정확히 한 번씩 색인함을 검사한다. 부족한 것은 layout이고,
그것은 Task 09 Observation이 이미 가지고 있다.
