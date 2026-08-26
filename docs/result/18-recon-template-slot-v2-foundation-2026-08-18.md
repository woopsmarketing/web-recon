Task: 18
Title: Recon Template Foundation & Slot V2
Previous: 17.1-exact-reconstruction-final-acceptance-2026-08-18.md
Status: Complete

# Task 18 — Recon Template Foundation & Slot V2

Task 17.1에서 동결한 Exact Reconstruction을, 디자인·레이아웃·검증된 동작은 한
바이트도 바꾸지 않은 채 **콘텐츠만 데이터로 분리한 Recon Template**으로
컴파일하는 첫 단계를 구현했다. Git add / commit / push 0회. 역사 artifact 수정
0. Exact Reconstruction / SiteSpec / QA run 수정 0. AI 호출 0. Stripe 전용
selector / class / route 조건 코드 어디에도 없음.

**입력 (모두 immutable, Task 17.1 accepted lineage 그대로):**

```
Exact Reconstruction  data/stripe.com/reconstructions/2026-08-17T21-38-04-901Z  (escalated final)
SiteSpec              data/stripe.com/site-specs/2026-08-17T21-38-01-773Z       (schema v4)
targeted saas         reconstructions/2026-08-17T21-17-00-349Z + site-specs/2026-08-17T21-16-59-963Z
```

**출력 (전부 새 디렉터리):**

```
data/stripe.com/recon-templates/2026-08-18T07-59-02-437Z/   ← main template (20 routes)
data/stripe.com/recon-templates/2026-08-18T08-07-05-671Z/   ← targeted /use-cases/saas template
  manifest.json  site-map.json  slots.json  default-content.json  slot-bindings.json
  slot-overrides.example.json  report/{slot-summary,parity-qa,mutation-qa,mutation-overlay}.json
  app/   (exact app 사본 + server-only slot layer)
```

## Executive Summary

> Stripe Exact Reconstruction의 20개 route에서 **9,529개 slot / 24,512개
> binding**을 결정론적으로 추출했고, **모든 binding이 emitted app에서 resolve
> 되며 default content 적용은 정확한 no-op임을 컴파일 타임에 증명**했다
> (24,512/24,512). 브라우저 검증에서 Exact Reconstruction vs
> Template(Default)는 **46/46 page-width 쌍에서 content·DOM 구조 완전 동일,
> document height Δ 0px, geometry p95 0px, runtime/hydration error 0**이었고,
> 홈페이지 인터랙션 8/8이 동등했다. Mutation canary에서는 hero headline / CTA
> label+href / nav label / image alt를 overlay 파일로 교체해 **15/15 bound
> occurrence가 전부 바뀌었으며 — 데스크톱 static nav와 함께, 클릭 후 마운트되는
> 모바일 portal 메뉴(`wr-obs-ip000006-dt000001`) 내부의 label까지 바뀌었다.**
> Task 18의 실패 조건("desktop label은 바뀌었는데 mobile portal menu에 옛
> label이 남는다")이 정확히 반증됐다. 다른 DOM/구조 변화 0, runtime clean.
>
> Slot layer를 얹었지만 Exact Clone fidelity는 깨지지 않았고, slot 값은 실제로
> 교체된다. **READY FOR CONTENT INJECTION PHASE.**

## Architecture

Task 명세의 분리를 그대로 유지했다:

```
A. SiteSpec               관측 사실. immutable. slot 필드 추가 0, schema 버전 변경 0.
B. Exact Reconstruction   정답지. immutable. (parity QA가 이것을 1차 truth로 사용)
C. Recon Template         A+B에서 compile된 새 artifact. 수정 가능한 콘텐츠 계약.
```

컴파일러(`src/recon-template/`, offline·deterministic)는 두 lineage 입력을
명시적으로 받고 짝이 맞는지 교차 검증한다(reconstruction manifest는 의도적으로
SiteSpec 경로를 기록하지 않으므로 — 생성된 앱이 SiteSpec에 의존하지 않아야
한다는 Task 14 원칙 — CLI가 `--site-spec`으로 명시한다. rootUrl, schema 버전,
route/page 대응이 어긋나면 slot 추출 전에 실패한다).

```
SiteSpec + Exact Reconstruction
  ↓ extract      runtime doc(정적 트리) + data-wr-obs template(동적 트리) walk
  ↓ group        exact-equality 병합 (viewport·surface 관통), 보수적 global 승격
  ↓ keys         site-specific 결정론적 key
  ↓ overrides    manual exclude/merge/rename/role/scope/… (없으면 no-op)
  ↓ assemble     ids, bindings, default content, observed constraints
  ↓ emit         artifact 파일 + template app (exact app 사본 + slot layer)
  ↓ validate     모든 binding resolve + defaults no-op 증명
```

역할 분담: **identity와 측정은 SiteSpec에서** (text 노드 id, boundingBox,
styleToken), **적용 표면은 reconstruction runtime data에서** (binding 주소는
template app이 스스로 해석할 수 있는 `(pageId, viewport, nodeId, childIndex)`
형태로 변환해 기록). SiteSpec 노드 id와 runtime `data-wr-node` id가 1:1임을
확인하고 이 join을 사용했다.

determinism: 같은 입력 + 같은 override + 같은 runId → byte-identical artifact
(fixture로 증명). manifest의 `createdAt`은 runId에서 역산해 시계가 하나만
존재한다.

## BoostWeb Slot Audit

`~/projects/site-factory-next`(117개 template의 slots.json ~6,200 slot 선언,
`lib/slot-fill/*`, `registry/section-taxonomy.ts`, render-engine)를 읽기
전용으로 조사했다. 수정 0.

**REUSE한 개념**
- **2축 주소 체계** — site-factory의 `(sectionType, role)`를 Slot V2의
  "site-specific key + canonical role"로 계승. 이것이 이번 설계의 뼈대다.
- **role별 관측 참조**(`fill.len`의 정신) — 단 우리는 한계값을 발명하지 않고
  원본의 측정값(문자수/단어수/뷰포트별 box/line count)을 기록.
- **image slot의 measured size + fit** — `sizeBox`/`fit`을 constraints의
  renderedWidth/Height/aspectRatio/objectFit으로 계승. 단 선언이 아니라 측정.
- **"빈 값 ≠ 키 삭제" 교훈** — 값 교체는 명시적 overlay로만; 주소가 못
  찾아지면 원본 유지 + 경고 (baked dummy 노출 사고의 재발 방지).
- **게이트는 소비자 코드로** — 컴파일 타임 validation이 app-side applier와
  같은 주소 해석 로직으로 모든 binding을 검증.

**변경한 개념**
- slots.json이 사람/LLM이 저작하는 파일 → **컴파일러가 방출하는 산출물**.
- `cols`/grid 선언 → 관측 geometry로 대체 (선언 대신 측정).
- role 부여: LLM 수확 → **결정론적 구조 증거만** (game: 확실하면 구체 role,
  아니면 generic).

**버린 개념**
- `scope: core|local` 어휘 사전, `coreName`/`alias`/promotion — 단일 컴파일러가
  어휘를 만들므로 수렴 문제 자체가 소멸.
- 4,000줄 hand-maintained registry.tsx / prop-maps — 이름 드리프트가 구조적으로
  없음.
- design-notes.md의 IMAGE-SLOTS fenced JSON (3중 복제 분류기) — 이미지 계약은
  slot 정의 하나에만 존재.

**새로 필요했던 개념** (site-factory에 없음)
- **binding layer**: 자유 구조 DOM에서는 slot→component prop 이름 결합이
  불가능하므로, slot과 DOM occurrence를 잇는 명시적 `slot-bindings.json`
  (surface: static / dynamic-template, text는 개별 text node 주소).
- **dynamic-template surface**: 클릭 후에만 마운트되는 captured template 내부
  노드(`t000xxx`)에 대한 binding — site-factory에는 존재하지 않는 문제.
- **expectedValue guard**: 저작된 template이 아닌 컴파일된 주소이므로, 모든
  binding이 자신이 기대하는 원본 값을 지니고 적용 전 검증.

## Recon Template Format

`recon-template-v1` (schemaVersion 1, slotSchemaVersion 1, compilerVersion 1,
engine `deterministic-exact-to-recon-template`). manifest는 templateId,
createdAt(runId 유도), source(host/rootUrl/siteSpecRunId/siteSpecFile/
reconstructionRunId/reconstructionManifestFile/양쪽 schema 버전), routes,
counts(pages/routes/slots/bindings/global/page/text/url/image/review/
static/dynamic/excluded/overrides), limitations, provenance(`derived`)를
기록한다. lineage는 manifest만으로 양쪽 입력 run까지 완전 추적 가능하다.

Template app은 exact app의 사본에 정확히 다음만 더한다:
`template-data/{slots,slot-bindings,default-content}.json`(top-level artifact와
byte-identical 사본 — validation이 강제), `src/runtime/slot-content.ts`(신규),
`src/runtime/load-page.ts`(한 단계 추가), `package.json`(이름만
`wr-template-stripe.com`). diff로 확인: 그 외 모든 파일 byte 동일. runtime
의존성은 template artifact 내부로 완결된다(§27) — SiteSpec/원본 run 참조는
manifest의 lineage 문자열뿐.

## Site Map

`site-map.json` — 새 crawler 없이 기존 사실만 재배열: route-map의 20개 route
(route/url/pageId + renderCoverage), SiteSpec의 15개 family(대표 URL, member
수), representative pageId 15개, 그리고 이번에 추출된 URL slot들의 internal
default 781개(정렬). route별 `representative` 여부는 family의
representativePageId로 판정.

## Slot V2 Contract

```json
{
  "id": "sl000201",
  "key": "home.header.nav.products",
  "label": "Home · Header · Nav · Products",
  "role": "navigation.label",
  "type": "text",
  "scope": "page",
  "pageId": "p000001",
  "route": "/",
  "editability": "editable",
  "defaultValue": "Products",
  "bindingIds": ["b000512", "b000513", "b000514"],
  "constraints": { "sourceCharacterCount": 8, "sourceWordCount": 1, "desktop": {…}, "mobile": {…} },
  "evidence": ["landmark:header", "tag:button", "surface:static", "surface:dynamic-template"],
  "provenance": "derived"
}
```

원칙 전부 충족: deterministic ID(`sl000001…`, 안정 정렬 후 부여), stable
ordering(global → page(route 순) → section(header→nav→main→body→footer) → 문서
순), versioned zod schema, fuzzy score 0, unknown/generic role 허용,
provenance 기록. key는 사이트별로 달라도 되고(§6), role이 공통 의미축이다.

## Slot Types

`text` / `url` / `image` 3종, 의도적으로 닫힘. **arbitrary HTML slot 금지**는
계약이 아니라 구조다: 추출기는 `<a href>`/`<area href>`의 href, `<img>`의
src/alt/srcset, text node 외에는 아무 것도 읽지 않으므로 script src,
stylesheet href, preload, form action, API endpoint, iframe src, JS pseudo
URL은 **도달 불가능**하다(`javascript:` href는 발견 시 후보에서 제외+집계).
image 값은 `{src, alt?, srcset?}` object(§13 권장 형태). text-array 등 추가
일반화는 하지 않았다(§9).

## Role Model

14-entry 어휘: `brand.logo` `navigation.label/href` `heading.primary/secondary`
`hero.headline/description` `cta.label/href` `content.text` `link.label/href`
`image.content` `footer.text`. 부여 규칙은 전부 확실한 구조 증거다:

- main 안 첫 h1의 텍스트(중첩 span 포함 — headingLevel 기준) → `hero.headline`
- hero container(h1의 조부 노드) 내부 첫 `<p>` 텍스트 → `hero.description`,
  내부 anchor → `cta.*`
- header/nav ancestry의 anchor → `navigation.*`, button/summary label →
  `navigation.label`
- footer의 텍스트 → `footer.text`
- 그 외 → generic (`content.text`, `link.*`, `image.content`)

Stripe 측정: navigation.label 1,795 · navigation.href 1,347 · link.label
1,734 · link.href 1,829 · content.text 2,256 · footer.text 244 ·
heading.primary 219 · heading.secondary 39 · hero.headline 3 · cta 2쌍 ·
image.content 59. 홈 hero는 `"Financial infrastructure to grow your
revenue."` + CTA `Get started → dashboard.stripe.com/register`로 정확히
잡혔다. AI semantic classification 0 — 불확실은 전부 generic으로 남겼다.
(`brand.logo` 0: stripe 로고는 inline SVG라 image slot 대상이 아님 — Known
Limitations 참조.)

## Scope Model

`global` / `page` 2종. global 승격은 매우 보수적으로: **header/footer landmark
콘텐츠만**, **locale prefix 없는 route의 page만 pool로**(­`/fr/…` header는
root header와 정당하게 다르므로 병합하면 false merge), pool에서 해당 landmark를
가진 **모든 page에 동일 값으로 존재**할 때만(≥2 page). 불확실은 전부 page slot
유지 — 중복 page slot이 잘못된 global 병합보다 낫다는 명세 그대로. manual
`merge`/`scope` override가 나중에 합치는 경로다(fixture로 증명).

Stripe: global 150 / page 9,379. global 예 —
`global.footer.link.pricing.{label,href}`(각 28 bindings = 14개 non-locale
page × 2 viewport), `global.header.nav.root.href`(48 bindings). locale 페이지
(`/fr/**`, `/zh-hk/**`, `/en-hk/**`, `/in/**`)의 header/footer는 자동 승격에서
제외되어 page slot으로 남았다(명시적 limitation으로 기록).

## Binding Model

```json
{
  "bindingId": "b000514", "slotId": "sl000201",
  "pageId": "p000001", "viewport": "mobile", "surface": "dynamic-template",
  "nodeId": "n000048",            ← trigger (static)
  "discoveryId": "dt000001", "templateNodeId": "t000007",
  "target": "text", "childIndex": 0, "textSegment": 0,
  "expectedValue": "Products"
}
```

- **text binding은 element.textContent 치환이 아니라 개별 text node 주소**다:
  `childIndex`(부모 children 배열의 절대 위치) + `textSegment`(text 자식 중
  순번). `<p>Start with <strong>Stripe</strong> today</p>`의 세 조각이 각각
  독립 slot이 되고, 하나를 바꿔도 중첩 markup이 보존된다(fixture §2 +
  Stripe에서 childIndex 2 / textSegment 1 형태 실측).
- attribute binding은 surface별 어휘를 그대로 기록한다 — static 트리는 React
  prop(`srcSet`), dynamic template은 raw attribute(`srcset`). applier가 면을
  구분할 필요가 없도록 컴파일 타임에 확정.
- **expectedValue guard**: applier는 주소의 현재 값이 guard와 같을 때만 쓴다.
  손으로 고친 binding이 엉뚱한 노드를 조용히 덮어쓸 수 없다.
- 한 slot → 여러 occurrence: multi-binding slot 8,438개(최대 48 bindings).

## Dynamic Template Bindings

Task 17.1이 복원한 portal/dynamic target까지 slot화했다. 주소는
`(pageId, viewport, triggerNodeId, discoveryId, templateNodeId)` 5-튜플 —
template node id는 trigger+discovery별로 재시작하므로 이 조합이어야 유일하다.
적용은 서버에서: trigger의 `data-wr-obs` JSON을 파싱해 해당 entry의 tpl에서
templateNodeId를 찾아 값을 쓰고, **실제로 값이 바뀐 payload만 재직렬화**한다
(default 렌더 시 byte 동일 유지).

Stripe: dynamic-template binding 1,921개, dynamic 전용 slot 1,022개(mega-menu
내부 링크·텍스트, locale 목록 등). cross-surface slot 35개 — 예:

```
home.header.nav.products   3 bindings: static desktop + static mobile + dynamic mobile(dt000001)
home.header.nav.pricing.*  3 bindings: 〃
home.header.nav.sign-in.*  5 bindings: static ×2 + dynamic ×3
```

## Manual Overrides

`--slot-overrides <json>`: `exclude` / `merge` / `rename` / `role` / `scope` /
`label` / `editability` (§22의 권장 최소 5종 + 2). 자동 key로 주소하고, 없는
key는 에러(조용한 무시 금지). `merge`는 **default 값이 다르면 거부** — 병합이
default 렌더를 바꾸는 것은 lossless invariant 위반이므로. cross-page merge는
scope를 global로 넓힌다. 적용된 연산은 slot의 `appliedOverrides`에 기록.
UI 없음, JSON으로 충분(명세 그대로). `slot-overrides.example.json`은 문서화된
no-op 예시로 매 run에 포함된다. fixture에서 7종 전부 + merge 거부 케이스 증명.

## Stripe Slot Catalog

전량 카탈로그는 `report/slot-summary.json`. 총계:

| 축 | 값 |
| --- | --- |
| slots | **9,529** (text 6,292 · url 3,178 · image 59) |
| scope | global 150 · page 9,379 |
| editability | editable 7,450 · **review 2,079** |
| section | header 3,467 · footer 2,076 · body 3,470 · main 403 · nav 113 |
| bindings | **24,512** (static 22,591 · dynamic-template 1,921) |
| multi-binding slots | 8,438 · cross-surface 35 |
| route별 최다 | /cookie-settings 946 · / 815 · zh-hk article 747 |

샘플 (각 축 10개는 slot-summary.json의 `samples.*`에 수록; 여기 대표만):

| key | role | type | scope | default | bind |
| --- | --- | --- | --- | --- | ---: |
| `home.header.nav.products` | navigation.label | text | page | "Products" | 3 |
| `global.header.nav.root.href` | navigation.href | url | global | "/" | 48 |
| `home.main.hero.headline` | hero.headline | text | page | "Financial infrastructure to grow your revenue." | 2 |
| `home.main.cta.get-started.label` / `.href` | cta.* | text/url | page | "Get started" / dashboard register URL | 2+2 |
| `home.main.heading.accept-payments-offer-financial` | heading.primary | text | page | "Accept payments, offer financial services, …" | 2 |
| `global.footer.link.pricing.label` / `.href` | link.* | text/url | global | "Pricing" / "/pricing" | 28+28 |
| `home.main.image.payment-bento-background` | image.content | image | page | {src, alt, srcset} | 6 |

**과잉 slot화 검토**: decorative mock UI는 폭발하지 않았다. 후보 **18,672개가
generic 증거로 제외**됐다 — `aria-hidden` 14,301(Stripe invoice/checkout mock
visual 대부분이 여기 해당), `svg-opaque` 4,371. 남은 위험 지대(거대 균일
리스트, 예: locale 메뉴 200 entry, footer 링크 칼럼)는 결정론적 증거
`sibling-repetition ≥ 16`(최대 실측 119)으로 **2,079개가 `review`** 상태로
표시됐다 — 삭제가 아니라 human-review 대기(§24 허용 방식).

**Text constraints 예** (`home.main.hero.headline`): sourceCharacterCount 46 ·
words 6 · desktop 916×61px 1줄 · mobile 341×78px 2줄 · white-space normal —
다음 단계에서 LLM에 "원본은 desktop 1줄 / mobile 2줄"을 전달할 수 있는 형태.
임의 maxCharacters는 어디에도 없다(§15).

## URL Slots

classification 실측: internal 2,014 · external 518 · hash 646 · tel 0 ·
mailto 0 (이 corpus에 존재하지 않음 — 0으로 보고).

| 예 | classification | binding | grouped label |
| --- | --- | --- | --- |
| `global.footer.link.pricing.href` = `/pricing` | internal | 28 | `…pricing.label` = "Pricing" |
| `home.main.cta.get-started.href` = `https://dashboard.stripe.com/register` | external(원본 도메인 밖) | 2 | "Get started" |
| `global.footer.link.documentation.href` = `https://docs.stripe.com/` | external | 28 | "Documentation" |
| `customers-hargreaves-lansdown.body.link.accept-all.href` = `#` | hash | 2 | "Accept all" |
| `home.header.nav.pricing.href` = `/pricing` | internal | 3 (static×2 + dynamic×1) | "Pricing" |

label slot과 href slot은 항상 독립 binding이며 groupId로만 묶인다(§12).
내부 URL은 clone route 형태(`/pricing`)로 default에 보존 — 새 사이트 route
remapping은 다음 Task의 몫이고, `urlKind: internal` + site-map의
internalLinks(781개)가 그 입력이 된다.

## Image Slots

59개, 전부 `<img>` 기반(MVP 범위). 값은 object:

```json
{ "src": "https://images.stripeassets.com/…/payment-bento-background.jpg?w=860&q=80",
  "alt": "", "srcset": "…?w=1720&q=80 2x" }
```

constraints 예(위 slot): desktop rendered 860×712, aspectRatio 1.2079,
objectFit fill, objectPosition 50% 50%. src/alt/srcset이 각각 field binding
(slot당 최대 6 bindings = 3 field × 2 viewport). 원본 hotlink는 default로
유지(§13 — asset pipeline/R2는 별도 Task). 교체 값이 srcset 없이 src만 바꾸면
applier가 낡은 srcset을 제거해 새 src가 실제로 이긴다(구현+주석으로 계약화).

## Decorative Exclusions

Stripe 전용 규칙 없이 generic 증거만 사용(§10/§24):

| 증거 | 제외된 후보 |
| --- | ---: |
| `aria-hidden` subtree | 14,301 |
| inline SVG opaque (wr-svg-host) | 4,371 |
| `role=presentation/none` | 0 (이 corpus에선 미출현) |
| `javascript:` pseudo URL | 0 |
| whitespace-only text | (후보 이전 단계에서 무시) |
| **합계** | **18,672** |

"Jenny Rosen / $399" 류의 invoice·checkout mock은 Stripe가 스스로
`aria-hidden`을 달아두었기 때문에 이 generic 규칙만으로 소거됐다. fixture는
aria-hidden 블록 내부의 텍스트/anchor가 slot이 되지 않음을 별도로 증명한다.

## Default Content Parity

**1차 truth는 live Stripe가 아니라 Exact Reconstruction이다**(source drift
제거). `pnpm qa:recon-template`이 두 앱을 각각 `next build` + `next start`로
띄우고 실제 Chromium으로 비교했다.

- 컴파일 타임: binding resolve **24,512/24,512**, default no-op
  **24,512/24,512** (모든 binding에서 default 값 == expectedValue == emitted
  app의 현재 값).
- 브라우저 (main template): 20 routes × {390, 1440} + wide 대표 3 routes
  (/, /customers/hargreaves-lansdown, /industries/media-entertainment) ×
  {1920, 2048} = **46 pairs**:

| 지표 | 결과 |
| --- | --- |
| content (active-variant innerText 완전 일치) | **46/46** — mismatch 0 |
| DOM identity (tag + data-wr-node 시퀀스) | **46/46** |
| document height Δ | **max 0px** |
| geometry (전 data-wr-node rect, p95 / max) | **0px / 0px** |
| template runtime error | **0** |
| template hydration error | **0** |

style: template app은 `generated-styles.css`와 모든 class prop을 exact app과
byte-동일하게 공유하므로(diff로 확인) 구조·geometry 동일 + 스타일 파일 동일
⇒ style regression은 구성상 불가능하며, geometry 0px가 이를 관측으로도
뒷받침한다.

- targeted saas template: `/use-cases/saas` × {390, 1440, 1920, 2048} —
  content 4/4, structure 4/4, height Δ 0px, geometry p95 0px, runtime /
  hydration 0.

## Slot Mutation Validation

default parity만으로는 slot이 "작동"함을 증명하지 못하므로(§34), 결정론적으로
고른 slot들을 **overlay 파일**(`WR_SLOT_VALUES_FILE` → `report/
mutation-overlay.json`)로 교체해 template app을 재기동했다. production
artifact 영구 수정 0.

| purpose | slot | 검증된 occurrence |
| --- | --- | --- |
| hero-headline | `home.main.hero.headline` → "WRQA Hero Headline Mutated" | static desktop + mobile ✓ |
| cta-label | `home.main.cta.get-started.label` → "WRQA CTA Label" | static ×2 ✓ |
| cta-href | `home.main.cta.get-started.href` → "/wrqa-mutated-href" | attribute href ×2 ✓ |
| nav-label | `home.header.nav.products` → "WRQANav" | static desktop + static mobile + **클릭 후 마운트된 mobile portal menu region `wr-obs-ip000006-dt000001` 내부** ✓ |
| image-alt/src/srcset | `home.main.image.payment-bento-background` | src/alt/srcSet ×2 viewport ✓ |

**15/15 적용**, 지정 slot 외 변경 없음(DOM tag+id 시퀀스가 exact app과 그대로
일치), runtime/hydration 0. Stripe canary와 synthetic fixture(§38 13번) 양쪽
에서 dynamic-template occurrence의 실제 마운트 후 값 교체까지 확인했다.

## Interaction Regression

Task 17.1에서 accepted된 homepage 인터랙션이 template에서 그대로 동작한다:
홈페이지의 `data-wr-pattern-id` trigger 전부(8개 — desktop mega-menu 2종,
bento/dialog, locale listbox, mobile menu 포함)를 exact/template 양쪽에서
각각 fresh page로 클릭해 after-state(trigger state attribute, 마운트/reveal된
region 수, region textLength)를 비교 — **8/8 equivalent** (desktop 1440 +
mobile 390). saas template 1/1. slot layer가 InteractionRuntime의 mount 경로
(`data-wr-obs` payload)를 바꾸지 않았음이 관측으로 증명됐다(default 렌더에서
payload는 byte-동일 — dirty-only 재직렬화).

## Smoke Tests

신규 `pnpm smoke:recon-template` — **58/58 PASS**. 합성 2-page SiteSpec을
**진짜 reconstruction generator**에 통과시켜 exact app을 만들고(그 안에
`data-wr-obs` captured template 포함), **진짜 template compiler**로 컴파일한 뒤
next build → next start → Chromium까지 내려간다. §38의 14개 fixture 전부 포함:

1 simple text slot · 2 nested text segment(raw whitespace 보존, childIndex 2 /
textSegment 1 주소) · 3 anchor label+href 독립 binding + groupId · 4 global
slot 4-binding · 5 page slot · 6 image slot(object 값 + measured constraints +
3 field bindings) · 7 aria-hidden 제외(텍스트·anchor 모두) · 8 manual exclude ·
9 manual merge(+ cross-page scope 확대, 상이한 default 거부) · 10 dynamic
template binding(trigger+discoveryId+templateNodeId) · 11 mobile/static shared
binding(1 slot, 2 surface, 5 occurrence) · 12 default parity(6 pairs 전부
동일) · 13 slot mutation(dynamic 포함 전 occurrence 적용, 구조 불변, runtime
clean) · 14 hydration-safe render(전 capture에서 hydration/runtime 0). 추가로
결정론(동일 입력 → byte-identical artifact), rename/role/scope override,
compile-time validation도 검증.

기존 스위트 회귀 (Task 06–17.1 전부 재실행):

| suite | 결과 |
| --- | --- |
| smoke:verifier | 81/81 PASS |
| smoke:selector | 81/81 PASS |
| smoke:multi-observer | 58/58 PASS |
| smoke:interaction-detector | 92/92 PASS |
| smoke:interaction-explorer | 108/108 PASS |
| smoke:interaction-patterns | 88/88 PASS |
| smoke:sitespec | 252/252 PASS |
| smoke:reconstruction | 205/205 PASS |
| smoke:reconstruction-qa | 134/134 PASS |
| smoke:e2e | 130/130 PASS |
| **smoke:recon-template (신규)** | **58/58 PASS** |
| **합계** | **1,287/1,287** |

(주: smoke:reconstruction-qa는 다른 무거운 스위트 직후 연속 실행에서 live
half가 1회 일시 실패했고, 단독 재실행에서 134/134 전부 통과했다 — Task 18
코드와 무관한 실행 환경 경합.)

## Historical Integrity

- Task 17.1 reconstruction / SiteSpec / QA / e2e manifest **수정 0** — 파일
  mtime이 전부 원 run 시각(2026-08-17T21:xxZ) 그대로이고, exact app과 template
  app 사본의 재귀 diff에서 차이는 의도된 2개 파일(package.json 이름,
  load-page.ts 훅)뿐이며 `reconstruction-data/`에 원 run 이후 갱신된 파일이
  없음을 확인.
- BoostWeb/site-factory-next 파일 수정 0 (읽기 전용 조사).
- SiteSpec schema 버전 변경 0 — template은 SiteSpec의 소비자다(§36).
- 새로 만든 것: `src/recon-template/`(17 files) + 2 CLI +
  `scripts/smoke-recon-template.ts` + recon-templates artifact 2 run + 이
  보고서 + README/ROADMAP 갱신. Git add/commit/push 0.

## Known Limitations

manifest의 `limitations`에도 기록됨:

- **document-title-not-slotted** — `<head>` title은 DOM 트리 밖(route-map)에
  있어 MVP slot 범위 밖. 다음 Content/SEO 단계의 자연스러운 대상.
- **svg-internal-content-not-slotted** — inline SVG는 opaque(17.1의 named
  limitation과 동일 근원). Stripe 로고가 SVG라 `brand.logo` role이 이 corpus
  에서 0회.
- **background-image-content-not-slotted** — `<img>` 중심 MVP(§13 허용 범위).
- **dynamic-template-occurrences-carry-no-geometry-constraints** — captured
  template 노드에는 boundingBox가 없어 dynamic 전용 slot은 크기 참조가 없다.
- **locale-prefixed-pages-excluded-from-automatic-global-promotion** — 보수적
  global 규칙의 명시적 경계. manual merge로 확장 가능.
- **dynamic-template-value-growth-not-recapped-against-obs-transport-ceiling**
  — 훨씬 긴 콘텐츠를 dynamic slot에 주입하면 원 reconstruction의 256KB
  `data-wr-obs` 상한을 넘을 수 있다(적용은 메모리에서 일어나 현재는 안전하나,
  차기 content 단계에서 길이 예산에 반영할 것).
- review 2,079건은 자동 추출의 정직한 잔여물이다 — footer 링크 칼럼·locale
  목록 등 반복 구조. 삭제되지 않았고 human pass 대상으로 표시만 됐다.

## Next Phase Readiness

Content Injection 단계가 소비할 것들이 준비됐다: slot key/role/group 계약,
원본 측정 기반 text/image constraints(§35 — line count·box·white-space가 실제
로 저장됨을 fixture로 확인), editability 신호(review/editable), urlKind와
internal link 목록(route remapping 입력), overlay 주입 경로(값 교체의 유일한
공식 통로), 그리고 Exact Reconstruction을 1차 truth로 쓰는 parity QA 하니스.
Completion Gates A–P 전부 충족 (A 역사 artifact 수정 0 · B artifact 생성 ·
C versioned schema · D 3 slot type · E key+role · F global/page · G
multi-binding · H static+dynamic binding · I override 5종+ · J major
difference 0 · K interaction regression 0 · L 의도한 content만 변경 · M
hydration 0 · N runtime 0 · O historical mutation 0 · P git 0).

## Final Verdict

**READY FOR CONTENT INJECTION PHASE**

— slot을 많이 만들어서가 아니라: slot layer를 추가하고도 Exact Clone fidelity
가 브라우저 관측 기준으로 완전히 유지됐고(46/46 content·structure, geometry
0px, interaction 8/8), 실제로 slot 값을 교체하면 정적 트리와 동적 portal
template의 모든 bound occurrence가 함께 바뀌며 그 외에는 아무 것도 바뀌지
않음(15/15, 구조 불변, hydration/runtime 0)을 증명했기 때문이다.
