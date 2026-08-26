Task: 20
Title: Theme Extraction, Token Contract & Theme Adapter Foundation
Previous: 19.1-visible-content-injection-completeness-2026-08-18.md
Status: Complete

# Task 20 — Theme Extraction, Token Contract & Theme Adapter Foundation

Task 19.1에서 동결된 Recon Template(+Content Injection) 위에, 사이트 고유
구조·레이아웃·검증된 동작은 그대로 두고 **시각적 skin만 교체하는 Theme
계층**을 구현했다. Git add/commit/push 0. Task 19.1 accepted artifact 수정 0
(template run 전 파일 mtime이 19.1 compile 시각 그대로, content run 무변경).
Slot/Content 아키텍처 수정 0 — Theme은 template의 순수 소비자다. AI 호출 0.
Stripe 전용 selector/class/route 조건 코드 어디에도 없음.

```
Accepted Recon Template (immutable)
  ↓ pnpm theme:extract      Original Theme + Site Theme Adapter (offline, 결정론)
  ↓ theme-contract-v1       공통 token 계약 — Theme File은 사이트를 모른다
  ↓ pnpm theme:check        deterministic compatibility GATE (ranking 아님)
  ↓ pnpm theme:preview      theme run + serve-boundary Theme Overlay
  ↓ pnpm theme:qa           browser QA (geometry 0 · paint 적용 · contrast · interaction)
```

**신규:** `src/theme/` (12 files) + 5 CLI (`theme:extract` / `theme:list` /
`theme:check` / `theme:preview` / `theme:qa`) + `themes/library/` (curated 3)
+ `pnpm smoke:theme` (47 checks) + stripe artifact:
`theme-extractions/2026-08-18T12-07-22-308Z` + theme runs
`2026-08-18T12-07-33-626Z` (original) · `…34-566Z` (cool-neutral + Task 19.1
Korean content) · `…35-609Z` (warm-editorial).

## Executive Summary

> Stripe template의 자체 stylesheet(14,057 rules)와 runtime tree에서 **293개
> paint group(themeable 31 · preserved 180 · review 82)**을 결정론적으로
> 추출하고 **21개 contract token**을 증거로 배정했다(확신 없는
> `color.text.inverse`는 정직하게 미배정). **Original Theme 적용은 브라우저
> 관측 기준 no-op이다**: 390/1440/1920에서 DOM 완전 동일, geometry max 0px
> (1,754–1,763 nodes), height Δ 0px, computed-paint 67/67, interaction 8/8,
> runtime/hydration 0. **Curated canary**(Task 19.1 주입된 한국어 홈페이지 +
> cool-neutral)는 같은 0들을 유지한 채 palette만 교체됐다 — 66,182 element
> occurrence가 teal로 바뀌고, 정적 페이지·데스크톱 메가메뉴·클릭 후 마운트되는
> 모바일 portal 메뉴가 모두 새 색을 입었다. **warm-editorial은 adapter를 한
> 글자도 바꾸지 않고 갈아 끼워** 동일하게 PASS(Level 2: radius 평탄화 + shadow
> 완화 포함), **dark-accent는 preserved dark text 20.7% > 10% 규칙으로
> `incompatible` 판정되어 적용이 거부됐다** — §23이 요구한 정직한 실패다.
> **READY FOR SEO PHASE.**

## Theme Architecture

세 artifact를 구조적으로 분리했다:

```
Theme File            무슨 색인가.   site-agnostic, theme-contract-v1 token→값.
                      CSS selector / className / nodeId / route가 실릴 필드 자체가 없다.
Site Theme Adapter    그 색이 이 사이트의 어디인가.   token → paint group →
                      이 사이트의 .wr-st… / .wr-doc-st… / node-scoped selector.
Theme Overlay CSS     적용.   theme run마다 생성되는 additive CSS.
```

적용은 **serve boundary**에서 일어난다: 불변 template app을 평소처럼
`next start`로 띄우고(콘텐츠는 Task 19 공식 경로 `WR_SLOT_VALUES_FILE` env),
로컬 reverse proxy가 앱 자신의 `generated-styles.css` 응답 **뒤에** overlay
CSS를 이어 붙인다. HTML은 바이트 하나 변하지 않으므로 hydration에 영향을 줄
수 없고(구성상), theme이 없으면 proxy도 없어 **Exact Template의 byte/visual
behavior는 그대로다**(§15). overlay rule은 원본 rule과 **동일한 selector**를
재사용해 cascade 순서로만 이긴다 — `!important` 0, 새 class 강제 0.

§34 조합 순서는 구조로 고정된다: Template → Content Overlay(server env) →
Theme Overlay(stylesheet append) → Render. 두 overlay는 서로의 파일을 읽지도
쓰지도 않는다.

## Theme Contract

`theme-contract-v1` — 닫힌 24 token, 전부 optional (§3):

- color: canvas · surface.{primary,secondary,elevated} ·
  text.{primary,secondary,muted,inverse} · action.{primary,primaryText} ·
  link · border.{default,strong} · accent.{primary,secondary}
- decoration: radius.{small,medium,large,pill} · shadow.{small,medium,large}
- typography: body · heading — **계약에만 존재, 자동 적용 OFF** (§25)

Theme Level: Level 1(palette) + 안전한 Level 2(radius/shadow)가 적용 범위,
Level 3(typography)는 `typography-not-applied` warning으로만 표현된다(font
materialization 부재 + line-wrap 위험).

Paint property allowlist는 닫혀 있다(§9): Level 1 = color · background-color
· border-{top,right,bottom,left}(shorthand의 **색 성분만**) + 계약상 후보인
caret/outline/text-decoration-color(이 파이프라인의 관측 스타일에 0회 출현 —
정직하게 보고), Level 2 = border-radius · box-shadow. **layout property는
generator에 도달하면 throw**된다(gate J; smoke 11번으로 증명).

## Theme File

site-agnostic·재사용 가능(§4). zod 스키마가 구조적으로 강제한다: token key는
계약 어휘 밖이면 실패, 값은 `;{}<>`·제어문자·`url(`·`expression(`·
`javascript:`·`@`·`\` 거부(selector 밀반입·asset 참조 불가). metadata는
호환성/설명 용도만(mode/contrast/supports/requires/warnings) — 업종 metadata
없음, 자동 ranking 입력으로 쓰이지 않음(§19).

## Original Theme Extraction

입력은 template artifact 자신뿐이다: `app/public/wr/generated-styles.css`
(paint 진실), `app/reconstruction-data/pages/*.json`(element census — 정적
트리 + `data-wr-obs` captured dynamic template 포함), slots/bindings(CTA
증거). SiteSpec·관측 run·라이브 브라우저·AI 0.

증거 규칙(전부 결정론, §10):

| token | 규칙 | stripe 결과 |
| --- | --- | --- |
| canvas | doc-root rule 배경 최빈값 | rgb(255,255,255) |
| text.primary | heading(직접 텍스트) 최다 색 | rgb(10,37,64) |
| link | 채도(chroma≥60) 있는 anchor 최다 색 | rgb(83,58,253) |
| text.secondary | 잔여 본문 텍스트 최다 색 | rgb(66,84,102) (doc 기본 color와 교차 일치) |
| text.muted | secondary보다 밝은 다음 텍스트 색 | rgb(114,127,150) |
| action.primary/Text | **cta.label slot** occurrence의 paint — 단 자기 배경이 불투명한 button형만 | rgb(83,58,253) / white |
| surface.secondary | canvas가 아닌 불투명 배경 최다값(element census 가중) | rgb(248,250,253) |
| surface.primary/elevated | canvas 값의 분할: 일반 element 표면 / box-shadow 동반 rule(card) | white / white |
| border.default/strong | **canvas 대비 가시(contrast≥1.1)** border 색 1·2위 | rgb(229,237,245) / rgb(66,84,102) |
| accent.primary/secondary | 미배정 고채도 paint 최다값 | rgb(99,91,255) / rgb(127,125,252) |
| radius small/medium/large/pill | 단일 px 분포(≥2px) + pill은 control(≥12px, anchor/button 증거) | 4px / 6px / 8px / 16.5px |
| shadow small/medium/large | 최다 3개를 blur 오름차순 명명 | 13/27px · 18/36px · 30/60px 쌍 |

`color.text.inverse`는 white가 이미 `action.primaryText`로 배정되어 **비워
두었다** — 억지 배정 금지(§10)의 실행. provenance: 값은 전부 `observed`,
surface.primary/elevated 분할만 `derived`로 기록.

개발 중 이 규칙들이 세 번 교정됐고 전부 측정이 근거다: (1) chroma 40→60
(slate 텍스트가 accent로 오인), (2) border는 canvas-가시성 필터(white border
2,200 가중이 실제 hairline #e5edf5를 눌렀다), (3) CTA 증거에 불투명 자기 배경
guard — **이 결함은 Theme QA의 브라우저 contrast 검사가 먼저 잡아냈다**
(fixture에서 link 색이 action.primaryText로 오배정 → curated theme이 링크를
흰색으로 칠함 → new low-contrast FAIL). QA가 추출기를 교정한 사례로 기록한다.

## Site Theme Adapter

`site-theme-adapter.json` — token → boundGroupIds → 이 사이트의 selector.
stylesheet identity(sha256)와 함께 기록되어 어느 CSS에 대한 주장인지
고정된다. **공통 class 강제 0**: smoke 6번이 adapter의 모든 selector가
`.wr-st…`/`.wr-doc-st…`/`[data-wr-page=…]` 형태뿐임을 검증한다. 사이트 A의
`.wr-st00123`과 사이트 B의 `.wr-st90882`가 같은 token에 매핑되는 구조가
fixture와 stripe 양쪽에서 실제로 성립한다(같은 계약, 다른 identity).

## Paint Groups

(property, value, 의미 배정, preserve 사유)별 결정론 그룹 — stripe **293개**:

| property | groups |
| --- | ---: |
| color | 44 |
| background-color | 67 |
| border-top/right/bottom/left | 121 |
| border-radius | 33 |
| box-shadow | 28 |

raw group은 §11 그대로 살아 있다. 예: `pg000004 color rgb(0,0,0)` (가중
4,250, 대부분 aria-hidden mock 영역) · `pg000049 background-color
rgb(246,249,252)` (146 — surface.secondary 차점자, review로 대기) ·
`pg000006 color rgb(60,79,105)` (1,738, 의미 증거 없음 → review).

## Themeable / Preserve / Review

- **themeable 31** — semantic 배정 + preserve 사유 없음.
- **preserved 180** — gradient/이미지 위 배경색(`background-gradient-above-
  color` 등), 반투명 배경, `50%`/합성 radius, inset shadow, 저가중 무증거
  색. 원본 값 유지가 목표 상태다.
- **review 82** — 가중은 충분하나 닫힌 규칙이 설명 못 하는 색. 사람 확인
  대기; manual override(`bind`/`themeable`)로 승격 가능.

"모든 색을 바꾸기"가 목표가 아니라는 §12 원칙 그대로다.

## Level 1 Palette

overlay는 `:root{--wr-theme-*}` 21개 + **같은 selector 재선언** 570 rules /
13,800 declarations. cascade 후순위로만 이기므로 원본의 tier 구조
(token-class 0,1,0 < node-scoped 0,3,0 < revealed 0,4,0)가 그대로 보존된다 —
개별 노드에 더 구체적인 원본 rule이 있으면 그 occurrence는 그 rule의
group으로 따로 다뤄진다. border shorthand는 관측된 `1px solid` prefix를
byte 그대로 복사하고 색만 `var()`로 치환한다.

## Level 2 Decoration

radius 4종·shadow 3종이 값-identity로 bind된다. `50%`(원형)·`8px 8px 0 0`
같은 형태 radius는 preserved — 도형 의미를 바꾸지 않는다. border-width 변경
경로는 존재하지 않는다. warm-editorial canary가 Level 2를 실증한다: pill
16.5px→6px, 4/6/8px→2/3/6px, shadow 3종 완화 — geometry Δ 0px 유지.

## Typography Boundary

계약에 typography.body/heading이 존재하고 스키마가 받아들이지만 overlay
generator가 **구조적으로 방출하지 않는다**. theme이 들고 있으면
compatibility가 `typography-not-applied` warning을 남긴다(§25). 후속 Font
Task의 활성화 지점.

## Theme Library

`themes/library/` — curated 3종(§17 최소 요건): **cool-neutral**(light,
palette+decoration), **warm-editorial**(light, Level 2 변화 포함),
**dark-accent**(dark, §23 스트레스). 추출된 Original Theme은
`libraryPromotion: "export-candidate"`로만 표시된다 — 자동 승격 없음(§18),
library 편입은 사람의 검수 후 수동 복사다.

`pnpm theme:list [--adapter …]`는 name/mode/supports/warnings + (adapter
지정 시) 사이트별 compatibility verdict만 출력한다. 추천·정렬·업종 없음(§20).

## Compatibility

결정론 GATE (§21): contract 일치 · unknown token · required token 부재 ·
token coverage · **token 쌍 contrast 사전검사**(text/canvas·surface, action
text/action bg, link/canvas — ratio<2.0 error, <4.5 warning) · preserved
gradient 충돌 warning · asset-color-mismatch-risk warning ·
typography-not-applied · §23 dark gates. 결과는 compatible /
compatible-with-warnings / incompatible 셋뿐, 점수 없음.

stripe 판정: original **compatible** · cool-neutral/warm-editorial
**compatible-with-warnings**(gradient 5 group + asset risk) · dark-accent
**incompatible**.

## Contrast Safety

두 겹이다. (1) 위의 token-쌍 사전검사. (2) **브라우저 실측**: QA가 각 페이지
에서 직접 텍스트를 가진 element 최대 400개를 골라 computed color vs 최근접
불투명 조상 배경으로 WCAG ratio를 계산하고, baseline에 없던 새 low-contrast
(<1.7) 노드가 하나라도 생기면 page FAIL. smoke 18번(백지 위 근백색 제목 →
incompatible)과 위의 추출기 결함 검출이 이 검사의 실전 증거다.

## Dark Theme (§23)

단순 white↔black 치환은 존재하지 않는다. dark 판정 gate: text-color bound
비율 ≥60%, background bound ≥50%, **unbound dark text ≤10%**. stripe
adapter는 text 79.2% / background 70.3%로 앞 둘은 통과하지만 preserved dark
text가 **20.7%**(rgb(0,0,0) 4,250 · rgb(60,79,105) 1,738 · rgb(6,27,49)
1,386 등 — 대부분 review 그룹)라 **incompatible**: 새 dark canvas 위에 원본
진회색 텍스트가 남는 조합을 compatible이라 부르지 않는다. dark canary는
적용하지 않았고, `theme:preview`/`theme:qa`는 incompatible run을
`--allow-incompatible` 없이는 거부한다. 커버리지를 올리는 공식 경로는 manual
override로 review 그룹을 bind하는 것이다(smoke 21번이 그 경로를 증명).

## Dynamic Surface Theming (§33)

dynamic template 노드(`data-wr-obs` payload의 tpl)는 같은 style catalog
class(`wr-st…`)를 쓰므로 class-단위 overlay가 정적 페이지와 마운트된
mega-menu/portal을 **한 번에** 칠한다. 별도 매핑이 필요한 revealed-state
graft(`[data-wr-revealed="1"]` 하위 2,467 rules)는 node-scoped occurrence로
그룹에 포함된다. QA가 trigger를 실제로 클릭해 마운트된 region 내부의
computed color가 theme 값과 일치함을 검증했고(dynamic-template paint check
3/3), 스크린샷으로 teal 메가메뉴·teal portal CTA를 확인했다.

## Content + Theme Composition (§30/§34)

curated canary는 Task 19.1의 주입된 한국어 홈페이지 **위에서** 수행됐다:
baseline = content-injected(overlay env), themed = 같은 서버 + theme proxy.
두 overlay는 서로를 모른다 — theme run manifest가 contentRunId를 audit
trail로만 기록한다. 결과: 한국어 콘텐츠 그대로 + teal palette, 아래 QA 표의
0들 그대로. smoke 17번은 합성 fixture에서 같은 조합(새 headline 텍스트 +
themed 색이 한 노드에서 동시에)을 검증한다.

## Stripe Original Theme

`theme-extractions/2026-08-18T12-07-22-308Z` — 21 tokens (§38 최소 목록
전부 + accent/decoration). 대표 (전체는 `report/theme-review.json`):

| token | original | bound groups | element weight |
| --- | --- | ---: | ---: |
| color.canvas | rgb(255,255,255) | 1 | 30 (+ doc/pseudo rules 다수) |
| color.surface.primary | rgb(255,255,255) | 1 | 1,221 |
| color.surface.elevated | rgb(255,255,255) | 1 | 720 |
| color.surface.secondary | rgb(248,250,253) | 1 | 220 |
| color.text.primary | rgb(10,37,64) | 1 | 19,450 |
| color.text.secondary | rgb(66,84,102) | 1 | 21,990 |
| color.text.muted | rgb(114,127,150) | 1 | 2,342 |
| color.action.primary / primaryText | rgb(83,58,253) / white | 1 / 1 | 39 / 662 |
| color.link | rgb(83,58,253) | 1 | 14,570 |
| color.border.default / strong | rgb(229,237,245) / rgb(66,84,102) | 7 / 4 | 1,020 / 240 |
| decoration.radius s/m/l/pill | 4px / 6px / 8px / 16.5px | 각 1 | 413 / 222 / 738 / 428 |
| decoration.shadow s/m/l | stripe 3대 shadow 값 | 각 1 | 52 / 41 / 552 |

## Curated Theme Canary

theme run 3개, 모두 같은 adapter:

| run | theme | baseline | verdict | QA |
| --- | --- | --- | --- | --- |
| …33-626Z | original.stripe.com | default | compatible | **PASS** (no-op) |
| …34-566Z | cool-neutral | **content-injected (19.1 한국어)** | comp-w-warnings | **PASS** |
| …35-609Z | warm-editorial | default | comp-w-warnings | **PASS** |

세 run 공통 수치 (390/1440/1920 각각):

| 지표 | 결과 |
| --- | --- |
| DOM identity (tag+data-wr-node 시퀀스) | 동일 3/3 |
| geometry (전 노드 rect, 1,754–1,763개) | **p95 0px / max 0px** |
| document height Δ | **0px** |
| horizontal overflow 신규 | 0 |
| runtime / hydration error | **0 / 0** |
| 신규 low-contrast 텍스트 | 0 |
| computed paint 적용 검증 | **67/67** (static 40 · pseudo 24 · dynamic-template 3) |
| interaction | **8/8 equivalent** (desktop 메가메뉴 2종·dialog·locale·mobile portal) |
| changed-paint coverage (§28) | 31 groups · element weight **66,182** · token별 표 기록 |

## Visual Review (§32)

스크린샷을 직접 검토했다 (각 run `report/screenshots/`): 홈페이지
390/1440/1920 × base/themed + `home-1440-menu-open-themed.png`(데스크톱
메가메뉴 열림) + `home-390-menu-open-themed.png`(mobile portal 열림).

- original @1920: 원본 stripe 보라 디자인과 구분 불가 — no-op의 시각 확인.
- cool-neutral @1440/390 (한국어 콘텐츠): CTA·nav CTA·쿠키 버튼·링크가 teal,
  cool canvas, 텍스트·CTA 전부 가독, surface 계층 유지, 레이아웃 이동 0.
  열린 메가메뉴 링크 라벨 teal(이전 보라), portal 메뉴 상담 문의 버튼 teal.
- warm-editorial @1440/390: warm paper canvas + amber action/link, pill
  radius 평탄화가 눈에 보임, product mockup·로고 밴드(자산)는 원색 유지 —
  compatibility warning이 예고한 그대로이며 파손 아님.

## Interaction Regression

각 run에서 8/8 (1440 + 390). trigger state attribute·마운트/가시 region 수·
viewport overflow 비교 — themed proxy 경유 렌더에서도 InteractionRuntime
경로는 바이트 동일 HTML이므로 구성상 변할 수 없고, 관측이 그것을 재확인했다.

## Smoke Tests

신규 `pnpm smoke:theme` — **47/47 PASS**. 합성 paint-rich SiteSpec(§37의
24개 항목 전부)을 진짜 reconstruction generator → 진짜 template compiler →
theme chain으로 통과시키고 next build → Chromium까지 내려간다: schema
validation(+selector 밀반입·url() 거부) · original 추출 12검(값 일치 +
determinism) · adapter mapping · gradient preserved · raw review 유지 ·
common-class 부재 · layout property throw · unknown token 거부 · contrast
incompatible · dark incompatible · manual preserve/bind · original no-op
parity(브라우저) · curated palette/border(폭·style 보존)/radius/shadow 적용 ·
static+dynamic occurrence · content+theme 조합 · geometry/interaction 불변 ·
hydration 0.

기존 스위트 회귀 (전부 재실행):

| suite | 결과 |
| --- | --- |
| smoke:verifier | 81/81 |
| smoke:selector | 81/81 |
| smoke:multi-observer | 58/58 |
| smoke:interaction-detector | 92/92 |
| smoke:interaction-explorer | 108/108 |
| smoke:interaction-patterns | 88/88 |
| smoke:sitespec | 252/252 |
| smoke:reconstruction | 205/205 |
| smoke:reconstruction-qa | 134/134 |
| smoke:e2e | 130/130 |
| smoke:recon-template | 58/58 |
| smoke:content-injection | 68/68 |
| **smoke:theme (신규)** | **47/47** |
| **합계** | **1,402/1,402 PASS** |

## Historical Integrity

- Task 19.1 template run(`recon-templates/2026-08-18T10-45-40-007Z`) 수정 0 —
  `.next` 포함 전 파일이 19.1 당시 mtime 그대로임을 find로 확인(빌드는 기존
  BUILD_ID 재사용, 신규 파일 0).
- Task 19.1 content run(`content-runs/2026-08-18T10-46-26-129Z`) 수정 0 —
  overlay 파일은 env로 읽기만 했다.
- Exact Reconstruction / SiteSpec / 과거 run / BoostWeb 수정 0.
- theme 산출물은 자기 네임스페이스(`theme-extractions/` · `theme-runs/` ·
  repo `themes/library/`)에만 썼다.
- Git add 0 / commit 0 / push 0.

## Known Limitations

- **svg-internal-paint-not-themed** — inline SVG 내부 fill/stroke는 opaque
  경계 그대로(17.1 이래의 named limitation). stripe 로고·아이콘은 원색 유지.
- **raster/video/asset 색 유지** — 자동 recolor 금지(§14).
  `asset-color-mismatch-risk` warning으로만 표시.
- **gradient 값 preserve** — 133개 gradient token의 문자열은 치환하지 않는다
  (§13). palette 변경 시 `preserved-gradient-conflict` warning.
- **serve-boundary overlay는 MVP 전달 방식** — 프리뷰/QA용 local proxy.
  production 배포형(빌드 시 overlay를 별도 정적 파일+link로 굽는 경로)은
  후속 배포 Task의 몫이며, overlay CSS artifact 자체는 그대로 재사용된다.
- **paint 검증은 표본 기반** — 31 group 중 QA route(/)에 출현한 14 group이
  computed-style로 실측 검증됐고(67/67), 나머지는 같은 value-identity 규칙의
  다른 route occurrence다(전수는 route 추가로 확장 가능).
- **dark theme는 이 adapter 커버리지에서 incompatible** — review 82 그룹의
  human bind가 커버리지를 올리는 공식 경로.
- `caret-color`/`outline-color`/`text-decoration-color`는 계약상 Level 1
  후보지만 관측 스타일 화이트리스트에 없어 현재 0 occurrence.
- theme run의 `qa.json` paint check 중 dynamic 표본은 mounted region 내
  class 표본 3건 — 표본 수는 보수적이다(전 dynamic binding 전수는 아님).

## Next Phase Readiness

SEO 단계가 소비할 것들이 준비됐다: 콘텐츠(19.1)와 시각 skin(20)이 모두
overlay로 독립 교체 가능한 frozen template, 세 계층이 동시 적용된 상태의
브라우저 검증 하니스(geometry/interaction/hydration 0 유지 증명), theme
run manifest의 audit trail(templateId + contentRunId + themeId +
compatibility + QA), 그리고 document title 미주입(18 이래) 같은 SEO 소관
한계 목록.

## Final Verdict

**READY FOR SEO PHASE**

— "복제된 사이트 구조와 새 콘텐츠는 그대로 유지하면서, 공통 Theme File을
사이트별 Adapter를 통해 교체해도 레이아웃과 interaction을 깨뜨리지 않는다"가
실제 브라우저에서 증명됐기 때문이다: Original Theme 적용 = 관측상 no-op
(geometry 0 · DOM 동일 · paint 67/67), curated 2종이 같은 adapter에서 각각
palette/decoration을 실제로 바꾸며(66,182 occurrence, 정적+동적 표면) 같은
0들을 유지했고, 자격 없는 dark theme은 정직하게 거부됐다.
