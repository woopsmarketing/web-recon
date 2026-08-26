Task: 05
Title: Responsive Deep Observation
Previous: 04-observer-quality-hardening-2026-08-13.md
Status: Complete

---

# Task 05 — Responsive Deep Observation

## 작업 목표

Desktop에서만 수행하던 Deep Observation을 **Mobile에서도 동일한 품질로** 수행하고,
viewport별 실제 브라우저 관측 데이터를 **독립적으로** 저장한다. 새로운 기능 영역
(Interaction / AI / Multi-page / Reconstruction)으로 확장하지 않는다. Read-only 원칙과
Task 04에서 완성한 모든 관측 기능(fonts.ready, rendered.html, DOM, style dedup,
geometry, local/effective visibility, inline SVG, image currentSrc/natural,
CSS assets, pseudo, shadow/iframe inventory, environment)을 그대로 유지한다.

이전 구조 → 이번 구조:

```
Desktop → Deep Observation → Screenshot        Desktop → Deep Observation → Screenshot
Mobile  → Screenshot only               ⟶      Mobile  → Deep Observation → Screenshot
```

## 구현 내용

핵심 원칙은 **Desktop/Mobile Observer를 두 벌 만들지 않는 것**이다. 기존 Observer
pipeline을 그대로 재사용하되, viewport 차이를 `ViewportProfile` 하나로 주입한다.

- `observe-page.ts`를 리팩터링해 **하나의 `observeViewport()`** 함수가 한 profile에
  대해 전체 deep observation(load → stabilize → collect DOM/style/geometry/visibility
  /assets/links/frames/shadow/environment → screenshot)을 수행한다. `observePage()`는
  `VIEWPORT_PROFILES`(desktop, mobile)를 순회하며 같은 함수를 두 번 호출할 뿐이다.
  Mobile 전용 축소판 Observer는 존재하지 않는다.
- collector(`collect-dom.ts`), style dedup(`dedupe-styles.ts`), asset/link 파생
  (`collect-assets.ts`/`collect-links.ts`)은 **한 줄도 바꾸지 않고** 재사용했다. 두
  viewport 모두 정확히 같은 관측 코드를 통과한다.
- Storage를 viewport별로 분리(`viewports/<id>/`)하고 `observation.json`을 run 단위
  요약(`target` + `viewports.{desktop,mobile}` + `responsiveSummary`)으로 재구성했다.
- SCHEMA_VERSION 2 → **3**.

## ViewportProfile 구조

```ts
interface ViewportProfile {
  id: "desktop" | "mobile";
  width: number;
  height: number;
  deviceScaleFactor: number;
  isMobile: boolean;
  hasTouch: boolean;
  userAgent?: string;
}
```

정의한 두 profile(값은 결과 metadata에 그대로 저장된다):

| 필드 | desktop | mobile |
|---|---|---|
| width × height | 1440 × 900 | 390 × 844 |
| deviceScaleFactor | 1 | 3 |
| isMobile | false | true |
| hasTouch | false | true |
| userAgent | (기본 Chromium) | Chromium Mobile(Android Chrome) — 런타임 해석 |

Mobile context는 Task 03/04의 mobile screenshot 설정(`deviceScaleFactor 3`, `isMobile`,
`hasTouch`)을 profile화한 것이다. **userAgent만 후속 정합성 수정으로 변경**했다(아래
"Mobile Browser Profile 정합성 수정" 참조).

## Observation / Profile 환경

Task 04의 environment metadata를 **viewport-aware하게 확장**했다(중복 시스템을 새로
만들지 않음). 각 viewport의 `environment`에 실제 관측값을 기록한다:

```
browser, browserVersion, userAgent, viewportWidth, viewportHeight,
deviceScaleFactor, locale, timezone, colorScheme, reducedMotion, timestamp
```

여기에 더해, **모든 viewport에 공통으로 적용한 context 설정**을 top-level
`observationProfile`로 별도 기록한다(재현성/regression용):

```
locale: ko-KR      timezone: Asia/Seoul
colorScheme: light reducedMotion: no-preference
```

### locale/timezone를 명시 설정한 이유 (그리고 안전성 확인)

- 두 테스트 사이트는 한국어 사이트다. `locale`은 `Accept-Language` 헤더와 서버 content
  negotiation, 날짜/숫자 포맷, 폰트 선택에 영향을 줄 수 있어 실제 한국 사용자 환경을
  반영하도록 `ko-KR`로 고정했다. Task 04까지는 Chromium 기본값 `en-US`였다.
- `timezone`은 Task 04에서 이미 시스템 값으로 `Asia/Seoul`이 잡혔지만, 머신에 의존하지
  않도록 명시 고정했다.
- `colorScheme`/`reducedMotion`은 머신·브라우저 기본값이 바뀌어도 regression baseline이
  흔들리지 않도록 각각 `light`/`no-preference`로 명시 고정했다.
- **호환성/동작 확인**: 실제 Playwright 실행 결과 두 사이트 모두 정상 렌더(fonts ready
  true, network idle true)되었고, desktop element count가 Task 04와 **동일**
  (domainchecker 752, seoworld 519)했다. 즉 locale 고정이 사이트를 깨뜨리지 않았다.
  과거 run data는 마이그레이션하지 않으므로 기존 결과와의 스키마 호환 문제도 없다.
  실측 environment: `chromium 151.0.7922.34`, desktop `locale ko-KR / dpr 1`, mobile
  `locale ko-KR / dpr 3 / Android Chrome UA`(아래 정합성 수정 참조).

## Mobile Browser Profile 정합성 수정 (Task 05 후속)

**문제**: 실제 관측 engine은 Chromium인데 Mobile profile의 userAgent가 iPhone
Safari 17 UA였다. UA-sniffing 사이트에서 "Safari용 콘텐츠/JS를 받으면서 렌더링은
Chromium이 수행"하는 hybrid environment가 될 수 있어 `environment.browser`(chromium)와
`userAgent`(Safari)가 논리적으로 불일치했다.

**수정**: Mobile 기본 profile을 **Chromium 계열 mobile browser(Android Chrome)** 로
일관되게 맞췄다.

- Desktop/Mobile 모두 동일한 Chromium engine 유지. Mobile의 390×844 / DPR 3 /
  touch·mobile behavior도 그대로 유지.
- iPhone UA 하드코딩을 제거하고, **런타임에 `browser.version()` 에서 UA를 파생**한다:
  `chromiumMobileUserAgent(v)` →
  `Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko)
  Chrome/<v> Mobile Safari/537.36`. 임의의 오래된 Chrome 버전을 박지 않고 실제 실행
  중인 Chromium 버전(현재 `151.0.7922.34`)과 항상 정합되게 했다. (`Mobile Safari/537.36`
  토큰은 WebKit Safari가 아니라 Android Chrome의 표준 접미사다.)
- `MOBILE_PROFILE.userAgent`는 unset으로 두고 `observePage()`가 launch 직후 해석한 값을
  주입 → 저장되는 `profile.userAgent`와 `environment.userAgent`가 실제 적용값과 일치.
- **실측 확인**: mobile `environment.browser=chromium`,
  `userAgent=… Chrome/151.0.7922.34 Mobile Safari/537.36` 로 engine↔UA가 일치.
  두 사이트 desktop/mobile 관측 수치는 UA 변경 전과 동일(responsive breakpoint는 viewport
  width 기반이라 nav 숨김/hamburger, hero 60→36px 등이 그대로 유지됨), Zod validation
  PASS, dangling styleId 0.
- 향후 실제 iPhone Safari 관측이 필요하면 UA만 바꾸지 말고 **WebKit engine 기반의 별도
  `webkit/ios-safari` observation profile**을 추가한다(ROADMAP 기록). 이번에는 WebKit
  profile을 추가하지 않는다.

## Schema 변경 (v2 → v3)

- `PageObservation`을 run 요약으로 재구성:
  `{ schemaVersion, engine, target, observationProfile, viewports:{desktop,mobile},
  responsiveSummary, sizes }`.
- 신규 스키마: `ViewportProfileSchema`, `ObservationProfileSchema`, `RunTargetSchema`,
  `ViewportObservationSchema`(viewport별 summary: profile/environment/metadata/
  loadStrategy/stats/styleDedup/shadow/sizes/files), `ViewportFilesSchema`,
  `ViewportResponsiveSummarySchema`/`ResponsiveSummarySchema`.
- `SizeReport` → **`ViewportSizeReport`**(viewport별 파일 크기 + `viewportTotalBytes`)
  와 **`RunSizeReport`**(`observationJsonBytes`, `runTotalBytes`)로 분리.
- 큰 DOM/style 데이터는 여전히 observation.json에 embed하지 않고 sibling 파일 + summary/
  reference 구조 유지.
- 저장 전/후 이중으로 zod 검증하고, viewport마다 no-dangling-`styleId` invariant를 적용.

## Storage 변경

```
data/<host>/<run-id>/
  observation.json                 # run 요약 (target + 2 viewport summary + responsive)
  viewports/
    desktop/
      rendered.html  dom.json  styles.json  assets.json  links.json  frames.json  screenshot.png
    mobile/
      rendered.html  dom.json  styles.json  assets.json  links.json  frames.json  screenshot.png
```

- Task 04의 flat 구조(`data/<host>/<run-id>/dom.json` + `screenshots/{desktop,mobile}.png`)
  에서, 이제 한 run에 Desktop/Mobile deep data가 모두 있으므로 viewport별 폴더로 분리.
- `observation.json`의 `files`는 run dir 기준 상대경로(`viewports/desktop/dom.json` …).
- 외부 consumer가 아직 거의 없어 구조를 깔끔히 정리하기 좋은 시점이라는 지침에 따라
  screenshot도 `viewports/<id>/screenshot.png`로 통일. **과거 Task 03/04 run은
  마이그레이션하지 않았다.**

## 각 viewport 실제 결과

두 사이트 모두 Desktop/Mobile deep observation이 실제 생성되었고, 각 viewport에
`rendered.html / dom.json / styles.json / assets.json / links.json / frames.json /
screenshot.png` 7개 산출물이 존재한다. 모든 JSON parse OK, zod validation PASS,
**styleId dangling = 0**(desktop/mobile 각각).

### domainchecker.co.kr

| 지표 | desktop | mobile |
|---|---|---|
| document | 1440 × 8939 | 390 × 13997 |
| DOM elements | 752 | 752 |
| geometry | 719 | 716 |
| effective / local visible | 719 / 719 | **697 / 716** |
| unique styles / occurrences | 396 / 752 | 380 / 752 |
| style dedup ratio | 47.3% | 49.5% |
| assets (inline SVG) | 74 (62) | 74 (62) |
| links (internal) | 80 (80) | 80 (80) |
| open shadow / iframe | 1 / 0 | 1 / 0 |
| fontsReady / networkIdle | true / true | true / true |

### seoworld.co.kr

| 지표 | desktop | mobile |
|---|---|---|
| document | 1440 × 8180 | 390 × 14068 |
| DOM elements | 519 | 519 |
| geometry | 509 | 499 |
| effective / local visible | 509 / 509 | **499 / 499** |
| unique styles / occurrences | 290 / 519 | 286 / 519 |
| style dedup ratio | 44.1% | 44.9% |
| assets (inline SVG) | 136 (6) | 136 (6) |
| links (internal) | 48 (44) | 48 (44) |
| open shadow / iframe | 1 / 0 | 1 / 0 |
| fontsReady / networkIdle | true / true | true / true |

두 사이트 모두 element/asset/link **개수**는 desktop=mobile인데(같은 DOM 트리), 실제
차이는 **visibility / geometry / computed style**에 나타난다(아래 responsive 사례).
mobile의 effective-visible이 더 적고 document가 더 높다(narrow reflow).

## 실제 responsive 사례 (screenshot이 아니라 실측 수치 비교)

각 element를 dom.json/styles.json에서 직접 열어 desktop↔mobile을 비교했다.

### domainchecker.co.kr

1. **Navigation 숨김 → Hamburger 노출** — `<nav class="hidden … md:flex">` (`e000010`):
   - desktop `display: flex`, box `{255.61,16, 590×32}`, `effectiveVisible: true`
   - mobile `display: none`, box `{0,0, 0×0}`, `effectiveVisible: false`
   - 대신 mobile 전용 hamburger가 노출: `e000042 <button>` + `e000043
     <svg class="lucide lucide-menu">` (mobile effectiveVisible=true, desktop 없음).
     desktop nav 버튼들(도메인 분석/실시간 경매/낙찰 이력/분석 도구/가격)은 mobile에서
     전부 hidden.
2. **Hero H1 font-size 60px → 36px** (`e000072`, "도메인 분석,"):
   - desktop `font-size: 60px`, box `{336,283, 768×120}`
   - mobile `font-size: 36px`, box `{16,211, 358×80}`
3. **Header 높이 65px → 57px** (`e000005`): desktop `1440×65`, mobile `390×57`
   (둘 다 `position: sticky` 유지).
4. **Footer 높이/폭 reflow** (`e000722`): desktop `{0,8518.5, 1440×420}`,
   mobile `{0,13469, 390×528}` — 폭 축소 + 높이 증가.
5. **Document 높이** 8939 → 13997 (narrow viewport reflow).

### seoworld.co.kr

1. **Navigation 숨김 → Hamburger 노출** — `<nav class="hidden … md:flex">` (`e000008`):
   - desktop `display: flex`, `gap: 24px`, box `{529.97,20, 342.89×24}`,
     `effectiveVisible: true`
   - mobile `display: none`, `effectiveVisible: false`
   - desktop nav 링크(도메인/무료 툴/백링크/서비스/블로그/가격, `e000009`–`e000015`)는
     mobile에서 전부 hidden. mobile 전용 hamburger: `e000021 <div class="md:hidden">`
     + `e000022 <button class="p-2">` (40×40) + `e000023 <svg class="h-6 w-6">` (24×24).
2. **Login 버튼 노출 차이** (`e000018`, "로그인"):
   - desktop `effectiveVisible: true`, box `{1193.83,14, 62.64×36}`
   - mobile `effectiveVisible: false`, box `{0,0, 0×0}`
3. **Hero H1 font-size 60px → 36px** (`e000045`, "구글 상위노출을 위한"):
   - desktop `font-size: 60px`, box `{96,403, 1248×120}`
   - mobile `font-size: 36px`, box `{16,439, 358×90}`
4. **Hero 배경 이미지 reflow** (`e000042`, `position: absolute`):
   - desktop `1440×778`, mobile `390×846.25`.
5. **Footer 높이/폭 reflow** (`e000476`): desktop `{0,7857.75, 1440×322}`,
   mobile `{0,13573.5, 390×494}`.

**차이를 억지로 normalize하거나 하나의 DOM으로 병합하지 않고**, 브라우저가 실제
렌더링한 결과를 viewport별로 그대로 보존했다.

## style dedup 결과

각 viewport는 자체 style table(`viewports/<id>/styles.json`)을 갖고, 두 table을 공유하지
않는다. Task 04의 dedup 로직/invariant를 그대로 적용.

| 사이트 | viewport | unique / occurrences | dedup | dom+styles | inline-styles 등가 | 절감 |
|---|---|---|---|---|---|---|
| domainchecker | desktop | 396 / 752 | 47.3% | 1534.1 KB | 2722.8 KB | 43.7% |
| domainchecker | mobile | 380 / 752 | 49.5% | 1483.8 KB | 2718.8 KB | 45.4% |
| seoworld | desktop | 290 / 519 | 44.1% | 1093.5 KB | 1857.1 KB | 41.1% |
| seoworld | mobile | 286 / 519 | 44.9% | 1082.0 KB | 1857.0 KB | 41.7% |

dangling styleId: 4개 파일 모두 **0**.

## viewport별 데이터 크기

### domainchecker.co.kr (run total **6.86 MB**, 7,193,218 B)

| 파일 | desktop | mobile |
|---|---|---|
| rendered.html | 217.6 KB | 216.5 KB |
| dom.json | 358.8 KB | 355.7 KB |
| styles.json | 1175.3 KB | 1128.2 KB |
| assets.json | 31.8 KB | 31.8 KB |
| links.json | 13.3 KB | 13.3 KB |
| frames.json | 0.0 KB | 0.0 KB |
| screenshot.png | 878.6 KB | **2596.5 KB** |
| **viewport total** | **2.61 MB** | **4.24 MB** |

observation.json 7.4 KB.

### seoworld.co.kr (run total **6.85 MB**, 7,181,625 B)

| 파일 | desktop | mobile |
|---|---|---|
| rendered.html | 131.3 KB | 131.3 KB |
| dom.json | 237.1 KB | 237.4 KB |
| styles.json | 856.5 KB | 844.6 KB |
| assets.json | 18.0 KB | 18.0 KB |
| links.json | 8.7 KB | 8.7 KB |
| frames.json | 0.0 KB | 0.0 KB |
| screenshot.png | 1214.7 KB | **3299.9 KB** |
| **viewport total** | **2.41 MB** | **4.43 MB** |

observation.json 7.3 KB.

**관찰**: mobile screenshot이 지배적으로 크다. `deviceScaleFactor 3` + narrow reflow로
document가 훨씬 높아져(14000px 수준), full-page PNG가 desktop의 약 2.7–3배(2.6–3.3 MB)다.
run당 screenshot 합계가 전체의 약 절반을 차지한다. 순수 관측 JSON(dom+styles+assets+
links)만 보면 viewport당 약 1.1–1.5 MB 수준.

## 전체 run 크기 & 20/50 page 참고 추산

- **1 page(2 viewport deep + 2 screenshot) ≈ 6.85 MB** (두 사이트 거의 동일).
- 단순 산술(스토리지 추산):

  | pages | raw storage (약) |
  |---|---|
  | 20 pages | **≈ 137 MB** |
  | 50 pages | **≈ 343 MB** |

  > 이는 **로컬 raw storage 추산일 뿐이며 Firecrawl 비용이 아니다.** screenshot(특히
  > mobile @DPR3)이 절반가량을 차지하므로, 향후 screenshot 압축(webp/jpeg)이나 해상도
  > 조정만으로 크게 줄일 여지가 있다(이번 Task 범위 밖).

## domainchecker 테스트

`pnpm observe https://domainchecker.co.kr` → **PASS**.
- final `https://domainchecker.co.kr/`, title "도메인 분석 사이트 · … | 도메인체커".
- desktop/mobile 각각 7개 산출물 생성, JSON parse OK, zod validation PASS, styleId
  dangling 0.
- Header/Hero/CTA(button)/Footer/inline SVG를 desktop·mobile 양쪽에서 직접 열어
  geometry / styleId / resolved style / localVisible / effectiveVisible 정상 확인.
- 실제 responsive 사례(위)에서 nav 숨김/hamburger, hero 60→36px 등 수치 확인.

## seoworld 테스트

`pnpm observe https://seoworld.co.kr` → **PASS**.
- final `https://seoworld.co.kr/`, title "구글 SEO 분석 도구 … | SEO월드".
- desktop/mobile 각각 7개 산출물 생성, JSON parse OK, zod validation PASS, styleId
  dangling 0.
- Header/Hero/CTA(로그인)/Footer/대표 이미지(hero bg `<img>`)/inline SVG를 양쪽에서
  직접 열어 확인. hero `<img>`는 desktop 1440×778 / mobile 390×846.25로 reflow.
- nav 숨김/hamburger, login 버튼 desktop-only, hero 60→36px 등 수치 확인.

## prepare-scroll

기본값 **OFF 유지**(Task 04 A/B 근거). `pnpm observe <url>`은 prepare-scroll 없이
실행되고, `--prepare-scroll` 옵션도 계속 지원한다. 옵션을 켜면 **Desktop/Mobile 모두**
동일한 preparation 정책이 적용되며, viewport별 실제 scroll 여부/step/distance/time이
각 viewport의 `loadStrategy`(`prepareScroll`, `scrollSteps`, `scrollDistancePx`,
`timings.scrollMs`)에 기록된다.

## Responsive Summary

observation.json 최상위에 deterministic viewport summary를 추가(AI 해석 없음). 각
viewport에 대해 element count / effective visible count / document width·height /
unique style count / asset count / link count를 side-by-side로 담는다. 예
(domainchecker): desktop `{752, 719, 1440×8939, 396, 74, 80}` vs mobile
`{752, 697, 390×13997, 380, 74, 80}`.

## Inline SVG 주의

Task 04 정책 유지: static inline SVG는 root `outerHTML`로 보존하고 DOM walk는 SVG
subtree로 내려가지 않는다(desktop/mobile 동일). ROADMAP에 **"Interactive SVG가
발견되면 Interaction Explorer 단계에서 별도 SVG deep exploration 필요"**를 명시했다.
이번 Task에서 SVG interaction은 구현하지 않는다.

## 발생한 문제

- **초기 우려: locale 고정이 사이트를 깨뜨릴 가능성.** → 실제 실행에서 두 사이트 모두
  정상 렌더 + desktop element count가 Task 04와 동일함을 확인해 안전성 입증.
- 그 외 신규 런타임/타입 오류 없음. `pnpm typecheck` PASS. `__name` shim은 Task 04
  결정대로 유지(browser-side 번들 분리는 후속).

## 기술적 결정

- **단일 Observer pipeline + ViewportProfile 주입** — desktop/mobile 코드 이중화 금지.
  `observeViewport()` 하나를 profile마다 호출. collector/dedup/파생 코드는 무수정 재사용.
- **viewport별 독립 저장 + 독립 style table** — 두 viewport의 computed 결과를 억지로
  공유/병합하지 않음. 각 table에 no-dangling-styleId invariant 적용.
- **환경 pinning(locale/timezone/colorScheme/reducedMotion)** — 재현성 확보. 적용값은
  `observationProfile`, 관측값은 각 `environment`에 이원 기록.
- **element id는 viewport 내부에서만 stable** — desktop `e000050`과 mobile `e000050`이
  같은 semantic component라고 보장하지 않음. 이번 Task에서 semantic matching 미구현.
- **run 요약 구조(target + viewports + responsiveSummary)** — 큰 데이터는 sibling 파일,
  observation.json은 summary/reference만. SCHEMA_VERSION 3.
- **prepare-scroll 기본 OFF 유지** — Task 04 근거 불변.

## 현재 한계

- Tablet observation, 자동 breakpoint 탐색 없음(의도적 scope 축소).
- Desktop↔Mobile semantic element matching 없음 — id는 viewport-local.
- Frame/shadow는 여전히 inventory만(deep observation 없음).
- Occlusion(가려짐) 판정 없음 — effectiveVisible은 ancestor hard-hide까지만.
- cross-origin `@font-face`/asset binary 미수집(스펙 범위 외).
- Mobile screenshot(@DPR3 full-page)이 커서 run 크기의 절반가량 — 압축은 후속 과제.
- 과거 Task 03/04 run data는 v3로 마이그레이션하지 않음.

## 다음 Task 추천

1. **Desktop↔Mobile semantic element matching** — 반응형 재구성의 전제. viewport-local
   id를 semantic 단위로 정렬.
2. **Adaptive prepare-scroll** — lazy-loading candidate 감지 시에만 scroll(무조건 X).
3. **Screenshot 저장 최적화** — webp/jpeg 또는 해상도 정책으로 run 크기 절감.
4. 그다음 ROADMAP Phase 4(Interaction Candidate Detection)로 진행.

## 변경 파일

- `src/observer/types.ts` — SCHEMA_VERSION 3; `ViewportProfile`(+profiles/상수),
  `ObservationProfile`, `RunTarget`, `ViewportObservation`/`ViewportFiles`,
  `ViewportResponsiveSummary`/`ResponsiveSummary`, `ViewportSizeReport`/`RunSizeReport`,
  `PageObservation` 재구성; `ObservedViewport`/`ObservedPage` 재정의; locale/timezone/
  colorScheme/reducedMotion 상수.
- `src/observer/observe-page.ts` — `observeViewport()`로 단일 pipeline 추출,
  `observePage()`가 profile 순회; context에 profile + pinned 환경 적용; per-viewport
  timing/stats/loadStrategy 조립.
- `src/observer/store.ts` — `viewports/<id>/` 저장, per-viewport 크기 측정 +
  `responsiveSummary` + run total(fixpoint), viewport별 invariant, `SavedObservation`이
  검증된 `observation` 반환.
- `src/cli-observe.ts` — viewport별 요약 + responsive summary + run total 출력, 사용법
  갱신.
- `src/observer/index.ts` — 변경 없음(타입은 `export *`로 자동 노출).
- `src/observer/collect-dom.ts`, `dedupe-styles.ts`, `collect-assets.ts`,
  `collect-links.ts` — **미변경**(재사용).
- `README.md`, `ROADMAP.md` — 현재 구현(Desktop Deep ✓ / Mobile Deep ✓) 반영, 후속
  방향(adaptive prepare-scroll, interactive SVG, semantic matching) 기록.
- 추가(문서): `docs/result/05-responsive-deep-observation-2026-08-13.md`.
- 생성(런타임 산출물, gitignored): `data/domainchecker.co.kr/…`, `data/seoworld.co.kr/…`.
- Git add/commit/push는 수행하지 않았다.

## 검수 포인트

- `pnpm typecheck` PASS.
- `pnpm observe <두 사이트>` PASS — 두 사이트 모두 Desktop/Mobile deep observation 실제
  생성. 각 viewport에 7개 산출물(rendered.html/dom/styles/assets/links/frames/screenshot)
  존재, 모든 JSON parse + zod validation PASS.
- styleId dangling **0**(desktop/mobile 각각, 두 사이트 모두).
- Header/Hero/CTA/Footer/대표 이미지·SVG에서 geometry·styleId·resolved style·
  localVisible·effectiveVisible 연결을 desktop·mobile 양쪽에서 확인.
- 실제 responsive 사례는 screenshot이 아니라 dom.json/styles.json 실측값 비교.
- 데이터 크기/절감/run total은 추측이 아니라 measured 값.
- Secret/API key는 소스·CLI 출력·저장 JSON·본 보고서 어디에도 기록하지 않았다(이번 Task는
  Firecrawl 미사용, 로컬 Playwright 작업).
