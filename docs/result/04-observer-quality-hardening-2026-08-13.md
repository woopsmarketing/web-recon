Task: 04
Title: Observer Quality Hardening
Previous: 03-single-page-static-observer-2026-08-13.md
Status: Complete

---

# Task 04 — Observer Quality Hardening

## 작업 목표

새 기능 영역(멀티페이지 / 인터랙션 / AI / 재구성)으로 확장하지 않고, 기존 Single
Page Static Observer의 **정확도·데이터 보존력·효율성·재현성**을 높인다. 테스트
사이트는 `https://domainchecker.co.kr`, `https://seoworld.co.kr` 두 곳을 기본으로
사용한다. Read-only 원칙은 유지한다(클릭/입력/폼 제출 없음). 유일하게 허용되는
움직임은 lazy content를 유도하기 위한 read-only preparation scroll이다.

## 구현 내용

Task 04에서 처리한 12개 항목:

1. Font readiness(`document.fonts.ready`) 안정화 + 단계별 timing 기록
2. `raw.html` → `rendered.html` 명칭 정리(코드/스키마/문서/보고서)
3. Computed style deduplication (shared `styles.json` table + `styleId`)
4. Inline SVG 보존(`inline-svg` asset, outerHTML)
5. Asset 보강(`currentSrc`/`naturalWidth`/`naturalHeight`, `mask-image`)
6. Visibility 보강(`localVisible` / `effectiveVisible`)
7. 고가치 CSS property 보강(aspect-ratio, object-fit, clip-path, filter, mask 등)
8. Observation environment metadata
9. Read-only auto-scroll preparation (`--prepare-scroll`)
10. Shadow DOM / iframe 존재 관측(inventory)
11. `__name` shim 기술 부채 검토
12. 데이터 크기 전후 비교

SCHEMA_VERSION은 1 → **2**로 올렸다.

## Loading / fonts readiness

로딩 전략을 다음으로 변경했다.

```
goto("load")
→ bounded networkidle (timeout 8s)
→ bounded document.fonts.ready (timeout 5s)      ← 신규
→ [optional] read-only prepare-scroll            ← 신규(옵션)
→ fixed settle (1200ms)
→ observe
```

`document.fonts.ready`는 `Promise.race([fonts.ready, timeout])`로 감싸 **무한 대기하지
않는다**. 폰트가 준비되면 텍스트 메트릭/geometry가 안정되므로 관측 정확도가 올라간다.
`observation.json`에는 `networkIdleReached`, `fontsReadyReached`와 단계별 timing
(`navMs`, `networkIdleMs`, `fontsReadyMs`, `settleMs`, `scrollMs?`, `totalMs`)을
기록한다. 두 사이트 모두 `fontsReadyReached: true`였고, 폰트가 이미 캐시/즉시 로드되어
`fontsReadyMs`는 2ms 수준이었다(추가 지연 없음).

## rendered.html 변경

`page.content()`는 서버 원본 HTTP 응답이 아니라 **JS 실행 이후 serialize된 DOM**이다.
따라서 파일명을 `raw.html` → `rendered.html`로 바꾸고 코드/Zod 스키마(`files.rendered`,
`sizes.renderedHtmlBytes`)/README/ROADMAP/보고서를 일관되게 수정했다. 과거 data
디렉터리는 마이그레이션하지 않았다(스펙 지시).

향후 원본 HTTP 응답 body가 필요하면 `response.html`(원본)과 `rendered.html`(post-JS)을
분리 저장할 수 있다 — ROADMAP의 "Raw HTTP response body" 후속 개선으로 기록했다. 이번
Task에서는 원본 응답 수집을 구현하지 않았다.

## Style dedup 구조

Task 03은 element마다 computed style map(88+개 property)을 inline으로 반복 저장해
중복이 매우 컸다. Task 04는 이를 **shared style table**로 바꿨다.

- `styles.json`: `styleId` → style map. (`s000001…`)
- `dom.json`의 element는 style map 대신 `styleId`만 보관.
- Pseudo-element(`::before`/`::after`)도 **같은 table**을 재사용한다:
  `pseudo.before = { content, styleId }`.

결정성/정확성:

- Canonical key는 style map을 **property 이름 기준 정렬**하여 직렬화한다. 따라서
  property 순서만 다른 map은 같은 `styleId`로 합쳐진다.
- key는 hash가 아니라 **전체 canonical 문자열**이다 → **collision 원천 차단**(서로 다른
  style이 같은 id를 공유할 수 없음). 스펙의 "hash를 써도 되지만 collision을 무시하지
  말 것"을 충족한다.
- `styleId`는 document 순서(먼저 등장한 순서; element 내에서는 main → ::before →
  ::after)로 부여 → 같은 입력이면 같은 table.

무결성: `assertStyleReferencesResolve()`가 모든 element/pseudo의 `styleId`가 table에
존재하는지 검증한다(관측 시 + 저장 시 이중 확인). dangling 참조가 생기면 즉시 throw.

## Dedup 전후 실제 수치

같은 관측 데이터에서 "styles inline(Task 03 방식)"과 "dedup(Task 04 방식)"을 동시에
측정해 **정확한 apples-to-apples** 비교를 수행했다(`inlineStylesDomBytes`).

### domainchecker.co.kr

| 항목 | 값 |
|---|---|
| DOM element count | 752 |
| raw style occurrences | 752 |
| unique style count | 396 |
| dedup ratio | 47.3% |
| inline-styles dom (동일 run) | 2,722.8 KB |
| dom.json (deduped) | 358.8 KB |
| styles.json | 1,175.3 KB |
| dom + styles (신규 합계) | 1,534.1 KB |
| **절감(동일 run 대비)** | **1,188.8 KB (43.7%)** |

### seoworld.co.kr

| 항목 | 값 |
|---|---|
| DOM element count | 519 |
| raw style occurrences | 519 |
| unique style count | 290 |
| dedup ratio | 44.1% |
| inline-styles dom (동일 run) | 1,857.1 KB |
| dom.json (deduped) | 237.1 KB |
| styles.json | 856.5 KB |
| dom + styles (신규 합계) | 1,093.5 KB |
| **절감(동일 run 대비)** | **763.6 KB (41.1%)** |

### Task 03 실제 산출물 대비 (참고)

Task 03의 on-disk `dom.json`과 직접 비교한 값(단, Task 04는 inline SVG subtree를 더
이상 walk하지 않아 element 수가 다르고, CSS whitelist도 확장됨 → 위의 동일-run 비교가
더 엄밀하다):

| 사이트 | Task 03 dom.json | Task 04 dom+styles | 절감 |
|---|---|---|---|
| domainchecker | 2,592,498 B (882 el) | 1,570,878 B (752 el) | 1,021,620 B (**39.4%**) |
| seoworld | 1,564,337 B (536 el) | 1,119,773 B (519 el) | 444,564 B (**28.4%**) |

Whitelist를 크게 늘렸는데도(아래 참조) dedup 덕분에 총량은 오히려 줄었다.

## Visibility 개선

Element별로 두 개념을 분리했다(둘 다 derived, AI 없음).

- **localVisible**: 그 element 자신의 `display`/`visibility`/`opacity`/geometry/
  connected 상태만 본다(Task 03의 `visible`과 동일 기준).
- **effectiveVisible**: `localVisible`이면서, ancestor chain이 subtree를
  **hard-hide** 하지 않을 때 true. hard-hide = `display:none` / `opacity:0` /
  `content-visibility:hidden`. 이 세 가지는 자식이 되돌릴 수 없다.
  - `visibility:hidden`은 자식이 `visibility:visible`로 되살릴 수 있으므로 hard가
    아니며, `getComputedStyle`이 이미 상속을 반영하므로 element-local로 처리한다.
  - 구현은 walk 중 `ancestorHardHidden` 플래그를 아래로 전달하는 O(n) 방식.
- 사람 눈 기준 판정이나 **occlusion(다른 element에 가려짐) detection은 구현하지
  않는다** — 스펙 지시.

두 테스트 사이트에서는 `localVisible === effectiveVisible`(divergent 0)였다. 이 사이트에
"positive-geometry 자식을 가진 opacity:0 / content-visibility:hidden 래퍼"가 없기
때문이며, 로직은 정상 구현되어 있고 그런 구조가 있는 사이트에서 값이 갈린다.

## Inline SVG

Inline `<svg>`는 URL asset이 아니라 Task 03에서 충분히 보존되지 않았다. Task 04는:

- 최상위 inline SVG root를 관측하고 **outerHTML을 그대로 보존**한다
  (`assets.json`의 `type: "inline-svg"`, `elementId`, `markup`, `width`/`height`).
- SVG 내부 child element를 각각 중복 asset으로 만들지 않는다. 나아가 **DOM walk도 SVG
  root에서 멈춘다**(subtree를 내려가지 않음) — 내부는 outerHTML에 이미 다 들어있어
  중복이자 dom.json 부풀림이기 때문. 이 결정으로 element 수가 Task 03보다 줄었다
  (domainchecker 882→752, seoworld 536→519).
- SVG markup은 축약하지 않는다. 단 **향후 렌더링 시 untrusted content로 취급**해야
  한다는 점을 `AssetObservation` 스키마 주석과 문서에 명시했다. 이번 Task에서
  sanitization/rendering은 구현하지 않는다.

결과: domainchecker 62개, seoworld 6개의 inline SVG를 markup째 보존.

## Asset 보강

- **Images**: `<img>`의 runtime property인 `currentSrc`(브라우저가 실제 선택한
  responsive URL), `naturalWidth`, `naturalHeight`를 asset에 보존. 예) seoworld의
  hero 배경 이미지 → `currentSrc: .../_next/image?...`, natural 1440×960.
- **CSS assets**: 기존 `background-image` 외에 `mask-image` / `-webkit-mask-image`의
  `url(...)`도 관측(`type: "mask-image"`).
- **SVG**: 위 정책으로 별도 보존.
- **Fonts**: same-origin `@font-face` best-effort 수집 유지. cross-origin stylesheet
  우회 로직은 만들지 않았다(스펙 지시).

Asset dedup key는 URL asset은 `type|url`, inline-svg는 `type|elementId`로 처리한다.

## CSS whitelist 변경

Reconstruction 가치가 높은 property를 추가했다(dedup으로 중복 비용이 낮아진 점을 활용).

추가: `aspect-ratio`, `object-fit`, `object-position`, `clip-path`, `filter`,
`backdrop-filter`, `mix-blend-mode`, `isolation`, `visibility`,
`content-visibility`, `mask-image`/`mask-size`/`mask-position`/`mask-repeat` 및
`-webkit-mask-*`, `text-overflow`, `overflow-wrap`, `word-break`, `vertical-align`.

실측 확인: seoworld hero `<img>`에서 `object-fit: cover`, `object-position: 50% 50%`,
`opacity: 0.06`이 정상 수집되었다. 무작정 전체 CSS를 저장하지는 않는다.

## Environment metadata

`observation.json.environment`에 관측 환경을 저장한다.

```
browser, browserVersion, userAgent, viewportWidth, viewportHeight,
deviceScaleFactor, locale, timezone, colorScheme, reducedMotion, timestamp
```

값은 추측이 아니라 실제 browser/context에서 읽는다. 실측 예(두 사이트 공통):
`chromium 151.0.7922.34`, `deviceScaleFactor 1`, `locale en-US`,
`timezone Asia/Seoul`, `colorScheme light`, `reducedMotion no-preference`. 이 정보로
향후 동일 조건 regression QA가 가능하다.

## Auto-scroll 구현

`--prepare-scroll` 옵션으로 read-only preparation scroll을 구현했다. 이는 인터랙션
재현이 아니라 lazy image / IntersectionObserver content / deferred section을
로딩시키기 위한 **관측 준비**다.

```
load → font/network settle → step 단위로 아래로 scroll → 각 step 짧게 wait
→ bottom 도달/한계 → top으로 복귀 → settle → 최종 static observation
```

무한 스크롤 안전장치(하드 캡): 최대 step 40, step당 viewport의 85%, step settle
250ms, 총 시간 15s, 누적 거리 120,000px. Top으로 복귀 후 관측하므로 geometry는 Task
03과 동일하게 scroll 0 기준으로 잡힌다. **클릭/입력/폼 제출은 전혀 하지 않는다.**
`loadStrategy`에 `prepareScroll`, `scrollSteps`, `scrollDistancePx`를 기록한다.

## Auto-scroll A/B 테스트

두 사이트를 OFF/ON으로 각각 관측해 비교했다.

| 사이트 | 모드 | DOM | assets | doc height | rendered.html | scroll |
|---|---|---|---|---|---|---|
| domainchecker | OFF | 752 | 74 | 8939 | 217.1 KB | — |
| domainchecker | ON | 752 | 74 | 8939 | 218.0 KB | 11 step / 8039px |
| seoworld | OFF | 519 | 136 | 8180 | 130.8 KB | — |
| seoworld | ON | 519 | 136 | 8180 | 131.1 KB | 10 step / 7280px |

두 사이트 모두 **DOM/asset/문서 높이가 동일**했고 rendered.html 차이도 미미
(+0.9KB/+0.3KB, 동적 타임스탬프/난수 수준)했다. 즉 이 사이트들은 `load` 시점에 이미
콘텐츠가 다 들어와 있어 추가 lazy content가 없다.

**추천: 기본값 OFF 유지.** 근거: 이 두 사이트에서 측정 가능한 이득이 없고, ON은
관측당 3~4초를 추가한다. 다만 lazy-load가 있는 일반 사이트를 위해 기능은 옵션으로
유지한다. (명확한 근거 없이 기본값을 바꾸지 않는다는 스펙 원칙 준수.)

## Shadow DOM 결과

Open shadow root만 관측한다(closed는 page JS에서 접근 불가 → `unobservable`, 우회
안 함). `observation.json.shadow = { openShadowRootCount, shadowHostIds }`, 그리고
host element에는 `hasShadowRoot: true`를 표시한다.

실측: 두 사이트 모두 **open shadow root 1개** — Next.js의 `<next-route-announcer>`
(접근성용 라우트 알림 요소). 이번 Task는 inventory까지만 하고, open shadow tree의 deep
observation은 후속(ROADMAP)으로 남겼다(구조 복잡도 증가 방지).

## iframe 결과

`frames.json`에 iframe inventory를 저장한다: `elementId`, `src`(raw),
`resolvedUrl`, `sameOrigin`, `accessible`(same-origin & attached 여부), `title`.
cross-origin private content는 우회하지 않는다(재귀 deep observe 없음).

실측: 두 사이트 모두 **iframe 0개**(`frames.json`은 `[]`). 존재/관계만 보존하는
구조라 향후 Frame Observation Phase로 확장 가능하다.

## domainchecker 실제 테스트

`pnpm observe https://domainchecker.co.kr` (OFF run):

- DOM 752, geometry 719, localVisible 719, effectiveVisible 719, pseudo 0
- styleId dangling **0** (무결성 통과)
- **Header** `header.sticky top-0` id=e000005 styleId=s000005 — bbox 0,0
  1440×65, `position: sticky`, effectiveVisible true
- **Hero H1** id=e000072 styleId=s000060 "도메인 분석," — bbox 336,283 768×120,
  `font-size 60px`, `font-weight 700`, color rgb(15,23,41)
- **CTA Button** `button.inline-flex` id=e000012 styleId=s000012 "도메인 분석" —
  bbox 88.28×32, `display inline-flex`, `border-radius 8px`, `padding 0 12px`
- **Footer** `footer` id=e000722 styleId=s000376 — bbox y=8518.5 1440×420
- **Inline SVG** 62개 — 예 e000008 28×28, markup `<svg …><circle …>` 보존
- Links 80(internal 80), Assets 74(inline SVG 62), Frames 0, Shadow 1
- 각 element에서 geometry / styleId / styles.json 실제 style / visibility가 정상
  연결됨을 직접 확인.

## seoworld 실제 테스트

`pnpm observe https://seoworld.co.kr` (OFF run):

- DOM 519, geometry 509, localVisible 509, effectiveVisible 509, pseudo 0
- styleId dangling **0**
- **Header** id=e000004 styleId=s000004 — 1440×65, `position: sticky`
- **Hero H1** id=e000045 styleId=s000042 "구글 상위노출을 위한" — 1248×120,
  `font-size 60px`, `font-weight 700`
- **CTA Button** id=e000018 styleId=s000015 "로그인" — `border-radius 6px`
- **Footer** id=e000476 styleId=s000276 — y=7857.75 1440×322
- **Image** `<img>.object-cover` id=e000042 styleId=s000039 — 1440×778,
  `object-fit cover`, `opacity 0.06`; asset에 `currentSrc` + natural 1440×960 보존
- **Inline SVG** 6개 보존
- Links 48(internal 44), Assets 136(inline SVG 6), Frames 0, Shadow 1

## 데이터 크기

두 사이트 핵심 지표 요약:

| 지표 | domainchecker | seoworld |
|---|---|---|
| DOM count | 752 | 519 |
| effective / local visible | 719 / 719 | 509 / 509 |
| unique style count | 396 | 290 |
| style dedup ratio | 47.3% | 44.1% |
| dom.json | 358.8 KB | 237.1 KB |
| styles.json | 1,175.3 KB | 856.5 KB |
| combined (dom+styles) | 1,534.1 KB | 1,093.5 KB |
| 동일-run inline 대비 절감 | 43.7% | 41.1% |
| Task 03 dom.json 대비 | −39.4% | −28.4% |
| asset count | 74 | 136 |
| inline SVG count | 62 | 6 |
| open shadow root | 1 | 1 |
| iframe count | 0 | 0 |
| fontsReadyReached | true | true |
| auto-scroll OFF/ON 차이 | 없음 | 없음 |

## 발생한 문제

- **`__name` shim(재확인)**: tsx/esbuild가 named function에 module-local `__name`
  helper를 주입해 browser로 직렬화된 collector에서 `__name is not defined`가 날 수
  있다. 검토 결과 이번 Task 범위에서 안전하게 제거하려면 별도 browser-side 번들이
  필요하므로 **shim을 유지**하고(문자열로 주입하는 no-op) ROADMAP에 "Browser-side
  collector bundle" 후속 개선으로 기록했다. 큰 번들 시스템 리팩터링은 하지 않았다.
- **inline SVG로 인한 element 수 감소**: SVG subtree walk를 멈추면서 element 수가
  줄어, Task 03 dom.json과의 단순 비교가 왜곡될 수 있었다. → 동일-run
  `inlineStylesDomBytes`를 별도 측정해 엄밀한 before/after를 확보했다.
- **effective vs local이 두 사이트에서 동일**: 버그가 아니라 사이트 구조 때문임을
  divergent 카운트(0)로 확인하고 그 이유를 문서화했다.

## 기술적 결정

- **dedup key = 정렬된 전체 canonical 문자열**(hash 아님) → collision 불가. 저장
  엔진을 새로 만들지 않고 단순 Map으로 구현.
- **SVG root에서 DOM walk 중단** + outerHTML 보존 → 데이터 중복/부풀림 방지하면서
  reconstruction용 원본 markup 유지.
- **hard-hidden 전파(O(n))**로 effectiveVisible 계산 — element마다 ancestor를 다시
  올라가지 않음.
- **prepare-scroll 기본 OFF 유지** — A/B 근거 기반. 기존 기본 동작 불변.
- **SVG markup은 untrusted**로 스키마에 명시(저장만; sanitize/render는 후속).
- SCHEMA_VERSION 2로 bump, no-dangling-styleId invariant 추가.

## 남은 한계

- 원본 HTTP 응답 body(`response.html`) 미수집 — `rendered.html`만 저장.
- Frame/shadow는 inventory만 — 내부 deep observation 없음.
- Occlusion(가려짐) 판정 없음 — effectiveVisible은 ancestor hard-hide까지만.
- cross-origin `@font-face` / asset 바이너리 미수집(스펙 범위 외).
- `__name` shim 유지(browser-side 번들 분리는 후속).
- Mobile은 여전히 screenshot 전용(deep observation 없음).

## 다음 Task 추천

1. **Frame/Shadow deep observation** — open shadow tree, same-origin iframe
   문서를 stable id 공간에 안전하게 편입.
2. **response.html 분리 저장** — pre/post-hydration 비교 기반 마련.
3. **Browser-side collector 번들 분리** — `__name` shim 제거 + 유지보수성 향상.
4. 그다음 ROADMAP Phase 4(Interaction Candidate Detection)로 진행.

## 변경 파일

- `src/observer/types.ts` — 스키마/whitelist/config 대폭 개정(v2)
- `src/observer/collect-dom.ts` — effectiveVisible, inline SVG, img runtime,
  iframe/shadow inventory, environment 수집
- `src/observer/dedupe-styles.ts` — **신규**: style table + styleId + invariant
- `src/observer/collect-assets.ts` — currentSrc/natural, mask-image, inline-svg
- `src/observer/collect-links.ts` — 변경 없음(호환)
- `src/observer/observe-page.ts` — fonts.ready, timings, prepare-scroll,
  environment 조립, dedup 연결
- `src/observer/store.ts` — rendered.html, styles.json, frames.json, invariant,
  dedup/size 측정, run-id 표현 수정
- `src/observer/index.ts` — 배럴 export 갱신
- `src/cli-observe.ts` — `--prepare-scroll` 파싱 + 신규 지표 출력
- `src/observer/.gitkeep` — **삭제**(실소스 존재)
- `README.md`, `ROADMAP.md` — 현재 구현 반영
- `docs/result/03-…md` — run-id "재현 가능" 표현 수정

## 검수 포인트

- `pnpm typecheck` PASS.
- `pnpm observe <두 사이트>` (OFF/ON) PASS — 실제 산출물 열람 검증 완료.
- `styles.json` ↔ `dom.json` styleId dangling 0 (invariant).
- Header/Hero/CTA/Footer/대표 asset/inline SVG에서 geometry·styleId·실제
  style·visibility 연결 확인.
- Dedup 수치는 추측이 아니라 실제 파일 크기/동일-run inline 측정값.
- Secret/API key는 기록하지 않았다(이번 Task는 Firecrawl 미사용, local Playwright
  작업).
