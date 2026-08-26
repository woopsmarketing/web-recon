Task: 19
Title: Natural Language Content Injection Foundation
Previous: 18-recon-template-slot-v2-foundation-2026-08-18.md
Status: Complete

# Task 19 — Natural Language Content Injection Foundation

Task 18의 Recon Template + Slot V2 위에, 운영자의 자연어 한 문장을 사이트 콘텐츠
계획과 검증된 Slot Values로 변환하고, 그 값을 적용한 실제 사이트가 원래
레이아웃/동작을 깨뜨리지 않음을 브라우저로 증명하는 Content Injection 계층을
구현했다. Git add/commit/push 0. Task 18 template artifact 수정 0 (파일 mtime
전부 Task 18 compile 시각 그대로). Exact Reconstruction / SiteSpec / BoostWeb
수정 0. Slot V2 스키마/코드 수정 0 — Content Injection은 template의 순수
소비자다.

```
Natural Language Intent → Site Content Plan → Content Units → Slot Values
  → Recon Template (immutable) + slot-values overlay → Injected Site
  → Layout Safety QA
```

**신규:** `src/content-injection/` (13 files) + 5 CLI
(`content:prepare` / `content:generate` / `content:validate` /
`content:preview` / `content:qa`) + `pnpm smoke:content-injection` (51 checks)
+ canary artifact `data/stripe.com/content-runs/2026-08-18T09-30-41-211Z/`.

## Executive Summary

> 자연어 intent 하나("기업용 AI 업무자동화 솔루션 회사로 재구성, 메인 행동은
> 상담 문의")가 **370개 Content Unit의 bounded packet**으로 컴파일되고, manual
> provider(Claude Code)가 작성한 결과가 결정론적 validator를 통과해 **357개
> slot 값 / 68개 needs-input**이 됐다. overlay를 적용한 injected site는 Layout
> Safety QA에서 **3/3 page-width PASS (390/1440/1920), 변경된 binding
> occurrence 438/438 적용 검증 (static 285 + 클릭 후 마운트되는 dynamic portal
> template 153), 인터랙션 8/8 동등, runtime/hydration 0, document height Δ
> 0px**. 데스크톱 메가메뉴와 모바일 portal 메뉴가 모두 새 한국어 콘텐츠로
> 마운트되는 것을 스크린샷으로 확인했다.
>
> 1차 QA는 정직하게 **FAIL**이었다: CTA 버튼의 실측 horizontal clip 1건과, 이
> 과정에서 발견된 새 일반 결함 — **aria-hidden paint twin desync** (Stripe hero
> 제목은 gradient 애니메이션용 aria-hidden 복제 텍스트를 실제로 페인트하는데,
> Slot V2가 aria-hidden을 제외하므로 보이는 슬롯만 바뀌어 이중 노출) — 를 QA가
> 잡아냈다. 이 결함은 결정론적 **stale-twin 검출**(트리 내 default 문자열
> 출현수 vs slotted binding 수 비교)로 제품에 편입됐고, 해당 4개 슬롯은 revert
> + needs-input으로 처리됐다. **READY FOR THEME PHASE.**

## Fixed Content Policy

`content-policy-v1` (`src/content-injection/policy.ts`)이 정본이다. 7개 규칙:
layout-preserved-by-default(사용자가 "레이아웃 유지"를 매번 말할 필요 없음) ·
no-structural-edits-without-explicit-request · content-only-surface(텍스트/
링크/CTA/브랜드 표현/이미지 지시만) · respect-observed-constraints(관측 참조를
존중하되 임의 문자수 한계는 발명하지 않음 — 판정은 브라우저 QA) ·
no-invented-facts · needs-input-over-fabrication · no-source-brand-carryover.
모든 content run이 `content-policy.json`으로 사본을 보관하고 generation
request와 manifest가 id+version을 참조한다.

## Architecture

```
Recon Template (Task 18, immutable)          ← 유일한 substrate
  ↓ content:prepare     intent → bounded Content Task Packet (offline, 결정론)
  ↓ provider            ContentGenerator 계약 (fake | manual JSON seam | 미래 원격)
  ↓ content:generate    deterministic validator → slot-values.json overlay
  ↓ content:preview/qa  template app + WR_SLOT_VALUES_FILE (Task 18 공식 주입 경로)
  ↓ Layout Safety QA    default vs injected, 같은 template app — 차이는 전부 콘텐츠 귀속
```

Task 18 template은 한 바이트도 바뀌지 않는다: 값 교체는 §22의 공식 overlay
경로(`WR_SLOT_VALUES_FILE`)로만 일어나고, content run은 자기 디렉터리
(`data/<host>/content-runs/<runId>/`)에만 쓴다. Determinism boundary(§36):
LLM output은 비결정론이지만 packet 구성·validation·slot mapping·overlay
적용·QA는 결정론이다 — 같은 valid slot-values면 같은 사이트가 나온다.

## Content Intent

versioned schema (v1). `rawIntent`는 verbatim/immutable로 보존되고 manifest에
SHA-256 hash로 기록된다. 해석(사이트 정체성, 페이지 목적)은 intent에 섞이지
않고 generator가 만드는 Site Content Plan에만 존재한다. `requestedScope.routes`
(기본 `/`), `includeReview`(기본 false), `preferences`, `providedFacts`(사용자
제공 사실만 사실로 쓸 수 있음)를 함께 기록.

## Site Content Plan

콘텐츠 전략이지 레이아웃 전략이 아니다: siteIdentity(workingName/category/
audience/positioning), primaryConversion, tone, messages, pagePlans(route별
current/new purpose, primary/secondary message, conversion goal, content
strategy). 페이지·섹션 구조는 전부 Recon Template에서 온다. Canary plan:
"플로우데스크 — 기업용 AI 업무자동화 솔루션, 주 고객 중소·중견기업
대표/운영팀, 전환 상담 문의(/contact/sales)".

## Content Units

결정론적 Content Unit Builder(`units.ts`) — AI clustering 0, 유사도 점수 0.
Slot V2가 이미 기록한 것만 읽는다:

1. 같은 `groupId`(링크/CTA/nav item의 label+href) → 한 unit
2. 같은 page·section의 `hero.headline`+`hero.description` → 한 hero unit
3. 나머지 → slot 하나가 unit 하나

kind는 7종(navigation/hero/content/cta/image/footer/group)으로 최소, 불확실은
group/content. unit id는 slots.json의 결정론적 순서에서 유도(`cu000001…`).
Canary: 370 units = global footer 32 · global nav 1 · header nav 67 · header
content 11 · main content 143 · main group 55 · image 34 · hero 1 · cta 2 ·
page footer 16 · body 8.

## LLM Boundary

9,529개 raw slot은 LLM에 절대 노출되지 않는다. packet은 bounded:
`intent.json` + `content-policy.json` + `template-summary.json`(집계 수치와
route/limitation만) + `content-units.json`(scoped unit + 현재 값 + 관측
constraints만) + `generation-request.json` + `generation-schema.json`(결과
JSON Schema). SiteSpec·binding 주소·nodeId·geometry는 packet에 없다.

## Provider Contract

`ContentGenerator { generate(input): Promise<ContentGenerationResult> }` —
provider-중립, Claude Code에도 비결합. 구현 2종: deterministic
`FakeContentGenerator`(테스트/fixture 전용 — 관측 길이에 맞춘 결정론 텍스트,
외부 URL은 needs-input, 이미지는 brief만) + `loadManualGenerationResult`
(manual JSON seam — 이번 MVP에서 Claude Code가 packet을 읽고 결과 JSON을
작성; 같은 스키마, 같은 validator를 통과). 미래 Anthropic/OpenAI/기타 원격
provider는 이 인터페이스만 구현하면 되고 Content Engine은 불변.

## Prompt Budget

batch 구조(§35): global units 먼저(사이트 일관성), 그다음 route별로 최대
40 units/batch. Canary는 10 batches (global 3 + `/` 7). 어떤 request에도 전체
SiteSpec이나 전 slot 목록이 들어가지 않는다.

## Slot Value Contract

LLM output은 자유 텍스트가 아니라 versioned JSON: `sitePlan` + `slotValues`
(slot key → string | {src,alt?,srcset?}) + `sources`(key별 provenance:
user-provided | derived-copy | generated-marketing) + `unresolved`
(needs-input + 사유) + `imageBriefs`. HTML/JS/CSS/React/selector는 타입
구조상 실릴 곳이 없고 validator가 재차 거부한다.

**Validator** (결정론, provider와 독립): unknown key 실패(조용한 무시 금지) ·
scope 밖 key 실패 · review slot 쓰기 실패(opt-in 없이) · 타입/이미지 shape ·
HTML injection(`<tag`) · 제어문자 · `javascript:`/`data:`/`vbscript:` 등 금지
스킴(공백·제어문자 난독화 내성) · URL 문자 안전성 · 깨진 internal route
warning · assigned∧unresolved 동시 지정 실패 · provenance 필수. Canary 최종:
errors 0 / warnings 0.

## Fact Safety

사용자가 제공하지 않은 사실은 값이 되지 못했다. Canary unresolved 68건 전부가
이 정책의 실행이다: 지표 14건($1.9T, 99.999%, 135+, 500M+ API 등 — 숫자와 그
캡션 모두), 고객/사례 6건(Fortune 100, Hertz/URBN/Instacart 등), 실명 후기
15건(인용문+실명+직함), 전화번호 1건, 법인명 1건, 외부 목적지 URL 25건, twin
차단 4건(아래), 로그인 URL 2건. 각 항목은 사유와 함께 operator report의
"Needs input" 목록에 나온다.

## Source Brand Leak Detection

결정론적 MVP 스캔(`brand-leak.ts`): host에서 유도한 brand token("stripe") +
원본 외부 목적지. **66 warnings** — `brand-token-in-untouched-default` 62
(미교체 고객 사례·뉴스 카드·이미지 src 등), `original-external-url-in-
untouched-default` 4. 전부 operator report에 노출되는 경고이며 자동 재작성은
하지 않는다. decorative/aria-hidden 영역은 slot이 아예 아니므로 검사 대상 밖
(§16 허용 제외).

## URL Handling

internal URL은 기존 template route/링크를 유지(`derived-copy`) — slug 재설계
0. intent의 "메인 행동은 상담 문의"에 따라 CTA 목적지는 기존 내부 route
`/contact/sales`로 재지정(발명이 아니라 site-map에 있는 route 재사용). 외부
URL(dashboard.stripe.com, docs.stripe.com 등)은 새 목적지가 제공되지 않았으므로
전부 needs-input — production-ready로 처리하지 않았다. tel/mailto는 이
corpus에 없음(0으로 보고). validator의 broken-internal-route 경고 0건.

## Image Handling

이미지 생성 엔진 없음(§19). 이미지 slot 34개 중 8개에 `imageBrief` 발행
(subject/mood/aspectRatio/purpose): hero bento·dataviz·platform 그래픽은
replace-recommended + "원본 제품 그래픽 오해 위험" warning, 실존 인물
headshot과 고객사(Hertz) 이미지는 "반드시 교체" warning, 장식 배경 1건은
keep-default. 픽셀 교체는 0 — explicit replacement 값 경로는 스키마와
fixture(§38 6/12번)로 지원 증명.

## Layout Safety QA

Exact 비교는 의미가 없으므로(콘텐츠가 의도적으로 다름) 질문을 바꿨다:
"내용이 바뀌어도 레이아웃이 깨지지 않았는가?" 같은 immutable template app을
default와 overlay로 두 번 띄워 비교 — 차이는 전부 콘텐츠 귀속.

검사: 텍스트 clipping(가로/세로, line-clamp 포함, default에 이미 있던 clip은
제외) · 문서 horizontal overflow · section collision(landmark box 쌍, 중첩
제외) · sibling overlap(inline 요소의 bbox 중첩은 정상이므로 block-level만) ·
neighbor displacement · slot box/section box before/after · dynamic 메뉴
viewport overflow · runtime/hydration error · **stale-twin 검출**(신규, 아래)
· 변경 binding 전수 적용 검증 · interaction regression. document height 변화
자체는 FAIL 사유가 아니다(§26) — 기록만 한다.

**Canary 최종 (390/1440/1920):**

| 지표 | 결과 |
| --- | --- |
| page-width 검사 | **3/3 PASS** |
| 변경 slot 관측 | 416 (line count 변화 63건 — 진단 증거로 기록, 파손 0) |
| 적용 검증 | **438/438** (static 285 · dynamic-template 153) |
| interaction | **8/8 equivalent** (desktop 메가메뉴·dialog·locale·mobile portal) |
| document height Δ | 0px (모든 width) |
| horizontal overflow / section collision / clip | 0 |
| runtime / hydration error | **0 / 0** |
| repair candidates | 0 |

### Reference Line Count

§25 그대로 진단 증거로만 사용: 변경 slot 63건에서 line count가 달라졌지만
(대부분 한국어가 더 짧아 감소) clipping/collision과 결합된 건이 0이므로 전부
PASS. line count 단독으로 FAIL시킨 사례 없음.

### Layout Impact

slot box·최근접 section box·document height·다음 sibling 위치를 before/after로
기록(`slotObservations`). 어떤 콘텐츠가 어디를 밀었는지 추적 가능. Canary는
doc height Δ 0px — 한국어 콘텐츠가 원본 박스 안에서 소화됐다.

## Repair Loop

bounded 설계(§27): Generate → Validate → Render → QA → 문제 slot만 재작성,
최대 2회(`MAX_REPAIR_ITERATIONS`). repair input은 현재 문장 + reference
constraint + 실측 line count + overflow 증거만 — LLM에 CSS/레이아웃 수정은
구조적으로 불가능(콘텐츠 재작성만). `content:qa --repair --provider fake`로
자동 루프, smoke §18에서 intentional overflow → repair candidate → fake
provider 축약 → 1회 만에 PASS를 증명. stale-twin candidate는 재작성으로
고칠 수 없으므로 repair request에서 제외(운영자 revert 결정).

Canary는 manual provider였으므로 같은 루프를 operator-assisted로 1회 수행:
1차 QA 증거(CTA clip + twin desync)를 반영한 수정 결과를 재-ingest → 2차 QA
PASS. `repair/` 경로와 자동 루프는 fake provider로 검증됨.

## The aria-hidden paint-twin finding (이번 Task의 주요 발견)

1차 canary QA에서 hero 제목이 이중 노출됐다: Stripe는 gradient 애니메이션을
위해 제목 텍스트를 **aria-hidden 복제본으로 한 번 더 페인트**하는데, Task 18은
aria-hidden subtree를 (mock UI 방지를 위해 올바르게) slot에서 제외했으므로,
주입은 보이는 슬롯만 바꾸고 복제 레이어는 원문으로 남아 겹쳐 보였다.

대응 (Slot V2 수정 없이):

- **결정론적 stale-twin 검출**을 Layout QA에 추가: 변경된 text slot의 default
  문자열이 해당 page tree에 slotted binding 수보다 많이 출현하면
  `unslotted-duplicate-text-desync`로 page FAIL + repair candidate(재작성이
  아닌 revert 대상). 합성 fixture로 검증(smoke "stale-twin desync detected").
- Canary에서 해당 4개 슬롯(hero.headline, 첫 heading, "Crypto" 중복 2건)은
  revert + needs-input 처리 — 정직한 경계로 기록.

같은 계열의 두 번째 경계: 헤더의 검은 "Sign in" 버튼 라벨은 **inline SVG
`<text>`**로 페인트된다(Task 18 named limitation
`svg-internal-content-not-slotted`). DOM의 "Sign in" 텍스트 노드 3개는 전부
로그인으로 교체·검증됐지만 SVG 내부 글자는 Slot V2의 범위 밖이라 원문이
남는다. Known Limitations에 기록.

## Operator Review

`report/operator-review.md`(+`.json`): intent 원문, site summary, page plans,
수치(units 370 / assigned 357 / changed 260 / unresolved 68 / review untouched
399 / image briefs 8 / brand-leak 66 / validation PASS / layout QA PASS),
needs-input 전체 목록(사유 포함), brand-leak 목록, image brief 목록, 다음 행동
경로(overlay 직접 수정 → validate/preview/qa). UI 없음 — markdown/JSON.

**Human Override(§29):** 운영자가 `slot-values.json`을 직접 수정하면
`content:validate`가 manual edit을 감지(manifest `manualEdits`)하고 같은 안전
검사를 통과시킨다. LLM 재호출 불필요. smoke §19에서 정상 수정 재검증 +
`javascript:` URL 수동 삽입 거부를 증명.

## Homepage Canary

- **Intent** (verbatim, §30 fixture): "이 사이트를 기업용 AI 업무자동화 솔루션
  회사 사이트로 재구성한다. 반복 업무 자동화, AI 에이전트 구축, 내부 데이터
  활용을 핵심 서비스로 한다. 주 고객은 중소·중견기업의 대표와 운영팀이다.
  전문적이고 신뢰감 있지만 지나치게 딱딱하지 않은 문체를 사용한다. 메인
  행동은 상담 문의다." (제품 코드 어디에도 업종 하드코딩 없음 — intent는 run
  artifact에만 존재)
- **Run**: `content-runs/2026-08-18T09-30-41-211Z` (template
  `2026-08-18T07-59-02-437Z`, scope `/` + global, review opt-in 없음)
- **Plan/생성**: manual provider = Claude Code (`claude-code-operator` /
  `claude-fable-5`), packet만 읽고 작성. 370 units → **357 slot 값 (변경 260)
  + 68 needs-input**, hero·전체 메가메뉴·CTA·대표 본문·쿠키 배너·푸터 핵심을
  한국어 재작성.
- **검증**: validation errors 0 / warnings 0 · brand-leak 66 경고(의도된 잔여
  기본값 보고) · layout QA 3/3 PASS · 적용 438/438 · interaction 8/8 ·
  runtime/hydration 0 · doc height Δ 0px.
- **Screenshot review** (Claude Code가 이미지 직접 확인):
  `report/screenshots/home-{390,1440,1920}-{default,injected}.png` + 열림 상태
  `home-390-menu-open-*.png`, `home-1440-megamenu-open-*.png`. 데스크톱
  1440/1920과 모바일 390 모두 원본 레이아웃 그대로 새 한국어 콘텐츠가 앉았고,
  hero 제목(twin 차단)과 SVG 라벨만 의도적으로 원문이다.

## Interaction Regression

§34 그대로: nav label 변경 후에도 desktop 메가메뉴 2종·bento/dialog·locale
listbox·mobile portal 메뉴가 default와 동등하게 열린다 (8/8, trigger state
attribute·마운트 region 수·viewport overflow 비교 — region 텍스트 길이는
의도적으로 비교 제외: 콘텐츠가 다른 게 정상). 클릭 후 마운트된
`wr-obs-ip000006-dt000001` 포함 dynamic-template occurrence 153개 전부에서 새
값이 확인됐다 — Task 18의 실패 조건("desktop은 바뀌고 portal 메뉴엔 옛 label")
재발 0.

## Smoke Tests

신규 `pnpm smoke:content-injection` — **51/51 PASS**. Task 18 합성 fixture를
확장(16-sibling review 리스트, nowrap/hidden overflow 배지, aria-hidden twin
probe)해 진짜 reconstruction generator → 진짜 template compiler → 진짜 content
chain을 통과시키고 next build → Chromium까지 내려간다. §38의 20개 전부 포함:
intent schema · policy load · unit grouping · CTA unit · navigation unit ·
global 1회 생성 · review skip · unknown slot 거부 · HTML injection 거부 ·
javascript URL 거부 · needs-input 수용 · image brief(무변이) · static overlay ·
dynamic-template overlay · multi-binding propagation · layout QA pass ·
intentional overflow 검출 · repair candidate 식별(+bounded 루프 1회 수렴) ·
manual edit 재검증(+불안전 수정 거부) · hydration-safe render. 추가로
stale-twin 검출과 template artifact 불변도 검증.

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
| **smoke:content-injection (신규)** | **51/51** |
| **합계** | **1,338/1,338 PASS** |

## Historical Integrity

- Task 18 template artifact 수정 0 — 전 파일 mtime이 compile 시각
  (2026-08-18 16:59) 그대로; QA는 overlay env로만 값을 주입.
- Exact Reconstruction / SiteSpec / 과거 run / BoostWeb 수정 0.
- content run은 자기 네임스페이스(`content-runs/`)에만 씀.
- Git add 0 / commit 0 / push 0.
- manifest audit trail: intentHash·templateId·policyVersion·generator(name+
  model)·counts·validation·brandLeakWarnings·layoutQa·manualEdits·
  repairIterations. secret/API key 저장 0.

## Known Limitations

- **aria-hidden-paint-twin-not-injectable** — aria-hidden 복제 텍스트를
  페인트하는 slot(이 corpus에서 hero 2 + "Crypto" 중복)은 주입 시 desync.
  QA가 결정론적으로 검출·차단하며, 해결(twin을 같은 slot에 co-binding)은
  Slot V2 v2의 몫.
- **svg-internal-text-still-not-injectable** — Task 18 한계의 연장: SVG
  `<text>`로 페인트되는 라벨(헤더 Sign in 버튼)은 DOM 텍스트를 바꿔도 화면이
  안 바뀐다. 현재 QA는 트리 기반이라 이 케이스를 자동 검출하지 못한다(수동
  화면 검토로 발견) — 브라우저 페인트 기반 stale-text 검출이 후속 후보.
- **needs-input은 default 유지** — unresolved slot은 원문이 렌더에 남고
  brand-leak 경고로만 표시된다(빈 값 주입은 layout을 다르게 깨므로 보수적
  선택). 운영자 입력 전까지 66건 경고가 남는 것이 정상 상태다.
- **문서 title 미주입** — Task 18의 document-title-not-slotted 한계 그대로
  (Content/SEO 후속 단계 대상).
- **review 399건 미작성** — 설계상 의도(§11). `--include-review` opt-in
  경로는 존재.
- brand-leak 스캔은 host 유도 token 기반 MVP — 완전한 NER이 아니다(§16 허용).
- 이미지 픽셀 교체는 canary에서 미실행(brief만) — explicit replacement 경로는
  fixture로 증명.

## Next Phase Readiness

Theme 단계가 소비할 것들이 준비됐다: 검증된 자연어→overlay 파이프라인(콘텐츠가
바뀌어도 레이아웃·인터랙션이 유지됨이 증명된 상태), layout safety QA 하니스
(theme 변경 후 재사용 가능한 default-vs-변형 비교 구조), 운영자 override 경로,
provider-중립 생성 계약, 그리고 twin/SVG 한계 목록(theme 단계에서 함께 다룰
후보).

## Final Verdict

**READY FOR THEME PHASE**

— 자연어 요청이 사이트 콘텐츠 계획과 검증된 Slot Values로 변환되고(370 units
→ 357 값 + 68 needs-input, validator 통과), 그 값을 적용한 실제 사이트가
원래 레이아웃/동작을 깨뜨리지 않음(3/3 page-width PASS, 적용 438/438,
interaction 8/8, runtime/hydration 0, doc height Δ 0px)이 브라우저 관측으로
증명됐기 때문이다. 1차 QA의 정직한 FAIL과 그로부터 얻은 stale-twin 검출까지
제품에 남겼다.
