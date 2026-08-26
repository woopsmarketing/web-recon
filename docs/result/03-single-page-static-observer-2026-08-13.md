# 작업 보고서 — Single Page Static Observer (Task 03)

```
Task: 03
Title: Single Page Static Observer
Previous: 02-firecrawl-discovery-2026-08-13.md
Status: Complete
```

## 작업 목표

URL 한 개를 Playwright Chromium으로 실제 렌더링하고, 사이트 재구현에 필요한 **정적
관측 데이터**(page metadata / raw HTML / DOM / computed styles / geometry /
visibility / assets / links / desktop·mobile screenshot)를 최대한 정확하게 수집해
파일로 저장한다. Discovery 결과 전체를 처리하지 않고, URL 하나만 직접 입력해 관측한다.
Interaction(click/hover/scroll/form/…)과 AI는 이번 범위에서 제외한다.

## 최종 구현 내용

- 새 CLI `pnpm observe <url>` — 단일 페이지 정적 관측. 기존 `pnpm recon`(Discovery)은
  그대로 유지, 억지로 확장하지 않았다.
- Playwright 관련 코드를 `src/observer/` 로 격리 (CLI에 브라우저 코드가 섞이지 않음).
- Chromium 렌더 → 안정화(load → bounded networkidle → 짧은 settle) → 단일 in-page
  pass로 DOM/computed-style/geometry/visibility 수집.
- 관측 element마다 run 내에서 안정적인 observation id 부여 (`e000001`, `e000002`, …,
  document order). link/asset의 `elementId` 가 dom.json과 정확히 일치한다.
- Asset/Link는 element 결과로부터 Node 측에서 파생 (URL·metadata만, binary 미다운로드).
- Desktop(1440×900) deep observation + full-page screenshot, Mobile(390×844)
  full-page screenshot **만**.
- zod 스키마 6종으로 검증 후 저장.
- 읽기 전용: click/hover/scroll exploration/form input/AI 없음.

## 프로젝트 구조 변경

```
src/observer/
  types.ts          # zod 스키마 + style/attr whitelist + 관측 설정 상수
  collect-dom.ts    # in-page(브라우저) DOM/style/geometry walk (self-contained)
  collect-links.ts  # elements → LinkObservation[] (Node side)
  collect-assets.ts # elements + icons + fontUrls → AssetObservation[] (Node side)
  observe-page.ts   # Chromium launch/load/stabilize/collect/screenshot 오케스트레이션
  store.ts          # raw.html + dom/assets/links.json + observation.json + 스크린샷 저장
  index.ts          # barrel export
src/cli-observe.ts  # `pnpm observe <url>` 엔트리
```

- `package.json`: `"observe": "tsx src/cli-observe.ts"` 스크립트 추가.
- `tsconfig.json`: `lib` 에 `DOM`, `DOM.Iterable` 추가 (in-page 수집 함수가 `document`,
  `getComputedStyle`, `getBoundingClientRect` 등 브라우저 타입을 필요로 함).
- `src/config/env.ts`, `src/discovery/*`, `src/cli.ts`(recon) 는 **미변경**.
- `src/observer/.gitkeep` 유지.

## Playwright 로딩/안정화 전략

`goto(waitUntil: "load")` → **bounded** `waitForLoadState("networkidle", 8s)`
→ 고정 settle `1200ms`.

- `domcontentloaded` 만 보고 즉시 수집하지 않는다(JS 렌더 콘텐츠 누락 방지).
- `networkidle` **하나에만** 의존하지 않는다: analytics/websocket 등으로 영원히 idle이
  안 되는 사이트가 있으므로 8초 상한을 두고, 도달 실패 시 예외를 삼키고 진행한다.
  도달 여부는 `observation.json.loadStrategy.networkIdleReached` 로 기록.
- Navigation timeout 45초. 두 테스트 사이트 모두 `networkIdleReached=true`.
- 전략/타임아웃 상수는 `types.ts` 에 모아 두어 이후 조정 가능.

## DOM 수집 방식

`document.documentElement` 부터 document order로 재귀 walk. 각 element에 `e######`
id 부여, `parentId` 는 가장 가까운 **관측된** 조상의 id.

- 비시각 태그는 element와 그 subtree를 skip: `SCRIPT, STYLE, NOSCRIPT, TEMPLATE,
  HEAD, META, LINK, TITLE, BASE`. (favicon 등은 assets 채널에서 별도 수집.)
- element당 `{ id, parentId?, tagName, text?, attributes, visible, boundingBox,
  styles, pseudo? }`.
- **single in-page pass**: element/link/asset id 공간을 하나로 일치시키기 위해
  브라우저에서 한 번만 순회한다. link/asset은 반환된 elements로부터 Node에서 파생.
- in-page 함수(`collectPageInBrowser`)는 완전 self-contained하며 whitelist/캡 등
  튜닝값을 인자로 받는다(closure/import 참조 없음 — Playwright가 함수 소스를 직렬화해
  브라우저에서 실행하기 때문).

## Text 중복 방지 정책

`innerText` 를 모든 조상에 중복 저장하면 데이터가 폭발한다. 그래서 각 element의
**direct text node만** 수집한다:

- 직속 자식 text node(`nodeType === 3`)들만 연결.
- whitespace normalize (`\s+` → 단일 공백, trim).
- 길이 상한 **200자** (`TEXT_MAX_LEN`).
- 빈 문자열이면 `text` 필드를 아예 넣지 않음.

결과적으로 상위 컨테이너는 자체 텍스트가 없으면 `text` 가 없고, 텍스트는 실제로 그 텍스트를
소유한 leaf-ish element에만 한 번 저장된다.

## Visibility 계산 정책 (derived)

bounding box 존재만으로 visible 처리하지 않는다. deterministic 규칙:

```
visible = isConnected
        && display !== "none"
        && visibility !== "hidden" && visibility !== "collapse"
        && opacity > 0
        && rect.width > 0 && rect.height > 0
```

- element-local 판단이다: 조상의 `display:none`/`opacity:0` 로 인한 간접 비가시성은
  브라우저의 rect(=0)로 대부분 반영되지만, 조상 `opacity`는 자식 computed opacity에
  반영되지 않는다(한계로 명시).
- viewport 밖이라도 레이아웃 상 크기가 있으면 visible=true (DOM/geometry는 보존).
- 완전한 human-visibility 판정은 목표가 아니며, 위 기준만 기록한다.

## Computed Style whitelist

`getComputedStyle(element)` 의 **최종 계산값**을 사용한다(원본 stylesheet 해석 아님).
수백 개 longhand를 전부 저장하지 않고 재구현에 중요한 property whitelist만 저장한다
(`types.ts`의 `STYLE_WHITELIST`, 약 88개):

- Layout: display/position/inset/size/min·max/margin·padding/box-sizing/overflow/
  gap/flex-*/justify·align-*/grid-*
- Typography: font-*/line-height/letter-spacing/text-*/white-space/color
- Visual: background-color/-image/-size/-position/-repeat, border-*, border-radius,
  box-shadow, opacity
- Transform/behavior: transform(-origin), transition-*, animation-*, cursor,
  pointer-events, z-index

값이 빈 문자열인 property는 저장에서 제외(순수 noise 제거 — dedup/최적화 아님).
`background` shorthand는 shorthand 노이즈를 피해 longhand(`background-color` 등)만 담았다.

## Pseudo-elements

`::before`/`::after` 는 computed `content` 가 렌더 가능한 경우(`none`/`normal` 아님)에만
작은 whitelist(`PSEUDO_STYLE_WHITELIST`)로 수집한다.

- 두 테스트 사이트 모두 해당 element 0개였다. 구현이 죽은 코드가 아닌지 별도 브라우저
  probe로 확인 → domainchecker에서 `::before`/`::after` renderable content가 실제로 0개임을
  검증했다(사이트가 content 기반 pseudo를 쓰지 않음). 로직 자체는 정상.
- 완전한 pseudo 모델은 ROADMAP의 품질 후속 항목으로 기록.

## Asset 수집 방식

관측된 elements(+head icons + @font-face URL)로부터 파생. binary는 다운로드하지 않고
URL·metadata만 저장. URL은 `baseURI` 기준 절대화하고 **http(s)만** 유지(`data:`/`blob:`
inline URI는 bloat 방지 위해 제외).

- `img`: `src`(image), `srcset` 후보(image-srcset, descriptor 포함), alt/width/height.
- `source`: `srcset`(picture-source) / `src`(source).
- `video`: `src`(video), `poster`(video-poster). `audio`: `src`(audio).
- computed `background-image` 의 모든 `url()`(background-image).
- head `link[rel~=icon]` (icon).
- **font**: same-origin stylesheet의 `@font-face` `src url()`(font). cross-origin
  `cssRules` 접근은 예외를 던지므로 skip(best-effort).
- `type|url` 기준 dedup. inline `<svg>` 는 URL이 없어 미표현.

## Link 수집 방식

`a`/`area` element에서 파생:

- `elementId`(dom.json과 일치), `href`(raw 보존), `resolvedUrl`(baseURI 기준 절대
  http(s) URL, 아니면 없음), `text`, `target`, `rel`, `internal`.
- `internal` = resolved host가 페이지 host와 동일(선행 `www.` 제거 후 비교).
- `javascript:`/`mailto:`/`tel:`/`#fragment` 등 비-http도 raw `href` 는 보존.

## Screenshot 방식

- Desktop: 1440×900 context, `fullPage: true` → `screenshots/desktop.png`.
- Mobile: 390×844 context(`deviceScaleFactor 3`, `isMobile`, `hasTouch`, iPhone UA),
  `fullPage: true` → `screenshots/mobile.png`. **Mobile은 screenshot만** (deep
  observation 없음 — scope 확장 방지).

## Zod Schema

`src/observer/types.ts`, `schemaVersion = 1`:

```
PageObservation         # observation.json (summary: metadata, loadStrategy, stats, sizes, files)
ElementObservation      # dom.json 항목
BoundingBox
ComputedStyleObservation
PseudoObservation
AssetObservation        # assets.json 항목
LinkObservation         # links.json 항목
PageMetadata / LoadStrategy / ObservationStats / SizeReport
```

데이터 수준: 기본은 `observed`, visibility만 `derived`(deterministic). AI inference 없음.
`store.ts` 는 저장 전에 `z.array(...).parse()` / `PageObservationSchema.parse()` 로
자체 검증한다(실패 시 loudly throw).

## Storage 구조

기존 `data/<host>/<run-id>/` 철학 유지:

```
data/<host>/<run-id>/
  observation.json
  raw.html
  dom.json
  assets.json
  links.json
  screenshots/
    desktop.png
    mobile.png
```

- `run-id`: timestamp 기반(`2026-08-13T06-19-25-364Z`) — run tracking / uniqueness를 위한
  identifier이다. 같은 입력에서 같은 ID가 나오는 deterministic/재현 가능한 ID가 아니다
  (관측할 때마다 timestamp가 달라 다른 run-id가 된다). *(표현 수정: Task 04)*
- 향후 한 run에 여러 page가 들어갈 경우 `pages/<page-id>/` 레벨을 추가해 확장 가능한
  형태(현재는 단일 page라 flat 유지).

## CLI

```bash
pnpm observe https://domainchecker.co.kr
pnpm observe https://seoworld.co.kr
```

인자 없음/`--` → usage, 비-http 대상 → exit 1. 진행 로그(로딩/수집/스크린샷)와 요약
(제목, document 크기, element/asset/link stats, 파일별 size)을 출력한다.

## domainchecker.co.kr 실제 테스트 결과

`pnpm observe https://domainchecker.co.kr` → **PASS**.

- requested `http?`→ final `https://domainchecker.co.kr/` (redirect + trailing slash
  보존), title "도메인 분석 사이트 · … | 도메인체커", document 1440×8939.
- DOM 882 / geometry 817 / visible 817 / pseudo 0.
- assets 12 (icon 5, font 7), links 80 (internal 80).
- `networkIdleReached=true`.
- 6개 산출물 + 2 screenshot 생성, 전부 JSON parse OK, zod validation PASS.

## seoworld.co.kr 실제 테스트 결과

`pnpm observe https://seoworld.co.kr` → **PASS**.

- final `https://seoworld.co.kr/`, title "구글 SEO 분석 도구 … | SEO월드",
  document 1440×8180.
- DOM 536 / geometry 519 / visible 519 / pseudo 0.
- assets 130 (image 1, image-srcset 3, icon 2, font 124), links 48 (internal 44,
  external 4).
- `networkIdleReached=true`. 산출물/스크린샷 정상, zod validation PASS.

## 실제 데이터 샘플 (domainchecker.co.kr)

실제 dom.json에서 발췌 (geometry는 `{x,y,w,h}` 요약):

- **Header** `e000005` `<header>` — box `{0,0,1440,65}`, `position: sticky`,
  `z-index: 50`, `background-color: oklab(0.999994 … / 0.8)`, `height: 65px`.
- **Navigation** `e000012` `<nav>` — box `{255.61,16,590,32}`, `display: flex`,
  `gap: 4px`, `align-items: center`.
- **Hero heading** `e000084` `<h1>` text "도메인 분석," — box `{336,283,768,120}`,
  `font-size: 60px`, `font-weight: 700`, `font-family: Inter, "Inter Fallback"`,
  `line-height: 60px`, `text-align: center`, `color: rgb(15, 23, 41)`.
- **CTA/Button** `e000014` `<button>` text "도메인 분석" — box `{255.61,16,88.28,32}`,
  `display: inline-flex`, `background-color: rgb(241, 245, 249)`,
  `border-radius: 8px`, `padding-left: 12px`, `font-size: 14px`.
- **Footer** `e000850` `<footer>` — box `{0,8518.5,1440,420}`, `display: block`,
  `background-color: oklab(0.967617 … / 0.3)`.
- **Link** `e000007` — `href "/"` → `resolvedUrl https://domainchecker.co.kr/`,
  `internal: true`.
- **Assets** — `favicon.ico`, `favicon-32/48/192.png`, `apple-touch-icon.png`
  (icon), `media/*.woff2` 5종 (font).

Header/Nav/Hero/Button/Image(→이 사이트는 `<img>` 0개, 텍스트·배경·아이콘폰트 기반의
Next.js 앱)/Footer 등 주요 구조가 정상 관측됨을 확인했다. bounding box와 computed
style 값이 실제 레이아웃과 일치한다(sticky 65px 헤더, 60px hero 제목 등).

## 데이터 크기

| 항목 | domainchecker.co.kr | seoworld.co.kr |
|---|---|---|
| DOM elements | 882 | 536 |
| visible elements | 817 | 519 |
| elements with geometry | 817 | 519 |
| raw.html | 217.0 KB (222,258 B) | 131.3 KB (134,424 B) |
| dom.json | **2,531.7 KB (2,592,498 B)** | **1,527.7 KB (1,564,337 B)** |
| └ styles 부분 | 1,629.8 KB (1,668,953 B) | 983.4 KB (1,007,043 B) |
| assets.json | 1.2 KB | 14.6 KB |
| links.json | 13.3 KB | 8.7 KB |
| observation.json | 1.3 KB | 1.3 KB |
| desktop.png | 876.5 KB | 1,214.7 KB |
| mobile.png | 2,598.0 KB | 3,299.9 KB |

**관찰**: `dom.json` 이 압도적으로 크고, 그 중 `styles`(element별 computed-style map)가
전체의 **약 64%**(domainchecker 1.63/2.53 MB, seoworld 0.96/1.49 MB)를 차지한다. element
수 대비 property가 많고, 인접 형제/동일 컴포넌트가 거의 같은 스타일을 반복 저장하기 때문이다.
이번 Task는 지침대로 **성급한 dedup 없이 먼저 실제 크기만 측정**했다.

**개선안(다음 Task 후보, 이번엔 미구현)**: 공유 style-table + element는 style id 참조
(예: 동일 computed-style set을 hash → 테이블화). 위 두 사이트 기준 style 데이터의 상당 부분이
중복이라, style dedup만으로도 `dom.json` 을 큰 폭으로 줄일 여지가 크다. 그 외 자주 등장하는
default 값(`padding-top: 0px` 등) 생략도 보조 수단.

## 발생한 문제

- **`__name is not defined`** (page.evaluate): tsx/esbuild가 named function에
  `Function.name` 보존용 `__name` 헬퍼를 주입하는데, `collectPageInBrowser` 소스가
  브라우저로 직렬화될 때 이 헬퍼가 없어 throw. → 수집 직전 문자열 evaluate로 no-op shim
  (`globalThis.__name ||= (fn)=>fn`)을 브라우저에 주입해 해결(문자열이라 transform 안 됨).
- **블록 주석 조기 종료**: 주석 안의 `aria-*/data-*` 가 `*/` 로 해석돼 typecheck 실패.
  → 문구 수정.
- 그 외 구현/타입 오류 없음. `pnpm typecheck` PASS.

## 현재 한계

- **dom.json/style 데이터가 큼** (위 개선안 참조). 이번엔 측정만.
- **visibility는 element-local**: 조상 opacity로 인한 간접 비가시성은 완전 반영 안 됨.
- **scroll/lazy-load 미트리거**: 읽기 전용 원칙상 스크롤하지 않음 → viewport 하단의
  lazy 콘텐츠/이미지가 로드 전 상태일 수 있음(단, full-page screenshot은 Playwright가
  자체 처리). 이번 두 사이트는 `networkidle` 도달로 대체로 안정.
- **Mobile deep observation 없음**(screenshot만) — 의도적 scope 축소.
- **font/asset**: cross-origin stylesheet의 `@font-face` URL은 접근 불가라 누락 가능,
  inline `<svg>` 는 URL이 없어 미표현, asset binary 미다운로드.
- **pseudo**: renderable `content` 가 있는 `::before/::after` 만, 작은 whitelist.

## 품질 향상을 위해 다음에 필요한 작업 (추천만)

- **Computed-style 공유 테이블/dedup** — `dom.json` 최대 절감 포인트(최우선).
- Discovery(`discovery.json`) → Observer 자동 연결(여러 page batch 관측).
- Mobile deep observation, 또는 반응형 breakpoint별 관측.
- Optional 관찰용 auto-scroll(lazy asset 트리거)과 read-only 원칙의 균형점 정의.
- Pseudo-element 완전 모델, cross-origin 폰트/스타일 수집 보강, asset binary 아카이빙.
- run 색인/조회(현재는 파일만 저장).

## 변경된 파일

- 추가: `src/observer/types.ts`, `collect-dom.ts`, `collect-links.ts`,
  `collect-assets.ts`, `observe-page.ts`, `store.ts`, `index.ts`
- 추가: `src/cli-observe.ts`
- 수정: `package.json`(observe script), `tsconfig.json`(DOM lib),
  `README.md`, `ROADMAP.md`
- 추가(문서): `docs/result/03-single-page-static-observer-2026-08-13.md`
- 미변경(의도적): `src/config/env.ts`, `src/discovery/*`, `src/cli.ts`(recon)
- 생성(런타임 산출물, gitignored): `data/domainchecker.co.kr/…`,
  `data/seoworld.co.kr/…`

Git add/commit/push 등 history/index 변경은 이번 Task에서 수행하지 않았다.

## 검수자가 특히 확인할 부분

- **single in-page pass** 설계(element/link/asset id 일치)와 Node측 파생 분리가 적절한지.
- Text = direct-text-only + 200자 캡 정책이 재구현에 충분한지.
- Visibility 규칙(element-local)의 한계 수용 여부.
- `STYLE_WHITELIST` 범위(88개)가 재구현에 충분/과다한지.
- `dom.json` 크기와 **style dedup을 다음 Task로 미룬 판단**.
- `tsconfig` 에 `DOM` lib 추가가 Node 코드에 미치는 영향(브라우저 전역 노출).
- Mobile을 screenshot-only로 둔 scope 결정.
- `value` attribute 정책(password/hidden input은 미수집; live property 미접근)으로
  민감 데이터 노출이 없는지.

---

민감 데이터/secret(예: password·hidden input value, API key)은 소스·CLI 출력·저장
JSON·이 보고서 어디에도 기록하지 않았다.
