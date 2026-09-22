# Responsive Reconstruction Architecture — Forensic Audit (2026-09-14)

- **모드:** READ-ONLY 조사. `src/`, generated app, SiteSpec, historical artifact, git 모두 무수정. reconstruction 재생성 없음.
- **대상:** web-recon current working tree (HEAD `6c2e723`, 2026-08-27 — 이후 모든 변경은 **uncommitted**), https://apartmentary.com/ live.
- **Pinned runs:** observation `2026-09-14T04-22-26-242Z` · site-spec `2026-09-14T04-58-45-517Z` · reconstruction `2026-09-14T05-01-12-931Z`
- **세부 보고서** (`docs/result/responsive-architecture-audit/`)
  - `01-historical-decision-forensics.md` — Phase 0
  - `02-observer-sitespec-trace.md` — Phase 1–2 (source → observer → SiteSpec)
  - `03-reconstruction-generator-trace.md` — Phase 1–2 (SiteSpec → plan → inference → generated CSS/DOM)
  - `04-apartmentary-source-inventory.md` — Phase 4 live 실측
  - `05-seven-region-provenance.md` — Phase 5 7개 영역 provenance
  - `06-continuous-sweep-source-vs-clone.md` — 390→1920 연속 sweep 실측 (source vs clone pipeline / clone current)
- **Temp evidence/scripts:** `tmp/wr-resp-audit/{code-trace,recon-trace,live-inventory,provenance,sweep}/`
- 모든 `src` 검색은 `grep -a` (NUL-byte 파일 함정). 핵심 file:line 주장은 orchestrator가 직접 재확인함 (§부록 A).

---

## 1. PRIORITY VERDICT

**NO — production priority는 source-first로 바뀐 적이 없다 (분류: C. 일부 mechanism만 production에 반영됨).**
28.5C는 Strategy B(source rule preservation)를 reject하고 "preserve는 capture/IR과 inference constraint로만"이라는 narrowed 원칙을 채택했으며, 28.6→28.8-fast가 그 부분 mechanism(CORS body capture, `authoredLayout`, authored breakpoint histogram, band-edge snap, `authored-inline-size` fallback)을 구현했다.
그러나 current code의 실제 순서는 **operator override > product policy 801 tree switch > probe-measured recovered rules > authored value(마지막 fallback) > 1440/390 frozen computed px** 이고, grid track recovery는 "The authored stylesheet is NOT read"(`layout-inference.ts:3056`)라고 명시한다.
유일하게 source 숫자가 served 결과를 결정했던 시기(28.6–28.7, authored breakpoint로 tree switch)도 28.8-fast `V1_RESPONSIVE_POLICY`(`responsive-plan.ts:60-94`)가 evidence-only로 강등시켰다.
Apartmentary에서는 authored·observed 모두 900을 가리키는데(`manifest.config.inferredBreakpoint.inferredAuthoredPx=900`, `domSwitchWidthObserved:true`) 801이 served된다.

---

## 2. HISTORICAL DECISION TIMELINE

(상세 표·doc line: `01-historical-decision-forensics.md §1`. 모든 row의 commit = 없음, uncommitted working tree.)

| Task / date | decision | experiment only? | production implemented? | current code still reflects it? |
|---|---|---|---|---|
| ≤28 baseline (HEAD 6c2e723, 08-27) | 390/1440 두 computed tree + probe inference, authored = evidence | — | yes (committed) | yes — frozen tier가 여전히 base (`layout-inference.ts:26`, `sitespec/types.ts:729`) |
| **28.5(A)** 08-29 | full source DOM + 전체 stylesheet(B-plus/hybrid)이 linear에서 9/9 width scrollHeight 정확 재현. "preserved @media channel 추가" 권고 → **보류**, wholesale switch reject | yes (`tmp/wr-visual-fidelity-investigation/`) | **no** | n/a — replay channel 부재 |
| 28.5B 08-29/30 | targeted hardening, "Not switching to preserved stylesheets yet" | no | yes (non-responsive) | yes (`layout-truth-check.ts` 신설) |
| **28.5C** 08-31→09-01 | A reject, **B reject** (2 BLOCKER/2 MAJOR, 1440 regress), **C(AC5) 채택**. PRESERVE→OBSERVE→INFER "ADOPT NARROWED" (capture/IR/constraint only) + VERIFY | **yes** (src byte-unchanged) | no | n/a |
| 28.6 W1.1 09-02~04 | CORS sheet: `page.on('response')` body 재사용 (2nd fetch 없음) | no | yes | yes `observe-page.ts:304-322,434-516`, `collect-dom.ts:623,874-893` |
| 28.6 W1.2 | @container/@supports/@layer를 flat string으로 기록 | no | yes | yes `collect-dom.ts:1202-1222` |
| 28.6 W1.4/A7/A8 | probe `[390,700,768,1024,1100,1440,1920]` + mobile `[390,480,700,768,914]` + authored ±1 derived + `requiredWidths` | no | yes | yes `observer/types.ts:2749,2780`, `probe-widths.ts`, `observe-selected-pages.ts:102,353,552` |
| 28.6 W4 | `authoredBreakpoints` histogram (SiteSpec) | no | yes | yes `sitespec/authored-breakpoints.ts:118` |
| 28.6 W5/A1 | `hiddenRanges`→`hiddenBands`+`snapBandEdges` (probe gap 안의 authored bp로 edge snap) | no | yes | yes `layout-inference.ts:6805,7058` |
| 28.6 R3/A3 | band rule을 hidden probe width에서 truth-check (acceptedUnchecked 738→0) | no | yes | yes `layout-truth-check.ts:272,1591-1633` |
| 28.6 W7 | 28.5C식 coherent unfreeze → transitive unfreeze **WONTFIX**; 대신 probe-predicated width kinds | no | partial | yes `layout-inference.ts:133-225` |
| 28.6 C2b | mobile tree도 rule 받음 | no | yes | yes `layout-inference.ts:4436,5268`; test `smoke-layout-safety.ts:3765-3790` |
| **28.6 C1 / 28.7** | **served tree switch = authored breakpoint histogram** (linear 1025) + per-route switch | no | yes | **REGRESSED** — 28.8-fast가 evidence-only로 강등, `byPageId` 비움 (`responsive-plan.ts:282`) |
| 28.7 §27 | mobile probe envelope를 authored media로 확장 | no | yes | yes `probe-widths.ts:189-215` |
| 28.7 B1 / 28.75 03b | grid track recovery (banded 포함) — child box 측정, authored track **미사용** | no | yes | yes `layout-inference.ts:3056` |
| **28.8-fast D1** 09-08 | **tree switch = fixed product policy ≤800/≥801**, authored inference는 evidence | no | yes | yes `responsive-plan.ts:60-94,221-243` |
| 28.8-fast D2/A2b | `authored-inline-size` **마지막 fallback** + var() 해석(admission 용) | no | yes | yes `layout-inference.ts:4552-4570,4807,6630-6725` |
| 29 / 29.1 | slotized template / identity — responsive 변경 없음 | — | — | — |
| apartmentary 09-14 (2건) | generated CSS 수작업 patch (fluid-desktop, layout-modes A–E) | generated artifact patch | **src 변경 없음** | engine src 최신 mtime 2026-09-09 |

**Q1 언제 source-first를 채택?** 없음. 가장 가까운 두 순간: 28.5(권고 후 보류), 28.6–28.7(authored breakpoint가 served switch 결정 — 단, 두 computed tree 사이의 선택일 뿐 rule preservation 아님).
**Q2 commit/code path?** source-first 없음. 부분 mechanism도 전부 uncommitted (HEAD에는 `tree-switch.ts`, `probe-widths.ts`, `authored-breakpoints.ts`, `media-condition.ts`, `layout-truth-check.ts` 부재).
**Q3 지금까지의 production priority?** ≤28.5C: midpoint switch + frozen px + midpoint hiddenRanges / 28.6–28.7: authored switch + frozen px + measured recovery / 28.8-fast→현재: **policy 801 + frozen px + measured recovery + authored last fallback**.
**Q4 28.5C 이후 바뀐 것:** §6 matrix.
**Q5 문서 vs 코드:** 코드 authoritative. 주요 불일치 — (a) 28.5C adjudication "INFER: probe가 fluid를 증명하면 authored fr/%/clamp 우선" ↔ 코드는 authored를 마지막에만, grid는 authored 미사용; (b) "media-conditioned declaration 제외 중단" ↔ 코드는 served range 전체를 덮지 않으면 `media-partial-range`로 refuse(apartmentary 729건); (c) 28.7 "switch from authored" ↔ 코드 policy 801; (d) 28.5C experiments.json `unmatched:0` ↔ 실제 511/621 kept rule unmatched (counter bug, `b-build.mjs:159` vs `:178`).

---

## 3. CURRENT PRIORITY ORDER (current production code, width W에서 node CSS 결정)

1. **Tree visibility** — `--breakpoint N` (`responsive-plan.ts:178-203`) > **product policy 801** (`:221-235`) → `globals.css` `(max-width:800.98px)` / `(min-width:801px)` (`app-template.ts:379-389`). Tree-switch inference(순위: observed DOM family swap > probe geometry change > authored weight > midpoint 근접, `tree-switch.ts:797-879`)와 per-route 결정은 **manifest evidence only**. (apartmentary: `ambiguous:true`, 후보 900/600/1200 중 900 선택)
2. **Recovered-layout tier** `[data-wr-page][data-wr-viewport] [data-wr-node]` (0,3,0), truth-check 통과분만, 파일 끝에 append (`generate-app.ts:274-280`). Node별 funnel 순서:
   - 2a grid track (child box 측정 `minmax(0,Nfr)`, authored track list 미사용) `layout-inference.ts:5374-5530`
   - 2b responsive-hidden `display:none` band (edge = probe bracket → authored snap → midpoint → open) `:5616-5704`, `:7058-7144`
   - 2c centered-max-width(측정 px) → capped-fill → full-width → percentage(측정 평균비) `:6155-6470`
   - 2d refusal exits: inset-resolved → tracked-fill → viewport-bleed(`100vw`/`calc(50% - 50vw)`) → grid-area-fill → damage clamp `max-width:100%` `:5866-6063`, `:6482-6487`
   - 2e **authored-inline-size** — 위 단계가 width-family를 하나라도 건드리지 않은 node만 (`:6644-6653`), served range 전체에서 @media가 성립할 때만 (`:4726-4769`), 여러 후보는 **sheet order상 마지막 admissible 값** 채택 (`:5036-5049`, `important`/specificity 미사용). authored grid-template-columns(`repeat/fr/minmax`)도 이 경로로만 emit 가능. width 선언이 없으면 `width:auto`를 추론 추가(apartmentary 498) — inline style width는 보이지 않으므로 이 추론은 inline-sized node에서 틀릴 수 있음. apartmentary에서 truth check가 이 kind를 36건 reject.
3. Pseudo rules / observed interaction CSS (`generate-app.ts:241-243`)
4. Text-box relief `.wr-stN.wr-tx{height:auto;min-height:<frozen px>}` / `.wr-sf{width:auto}` (`style-generator.ts:500-517`) — 유일한 height 완화, 단 frozen min-height가 하한으로 남음
5. **Exact computed token `.wr-stN`** — 1440 또는 390에서의 used px, 모든 whitelisted property (`style-generator.ts:484-493`)
6. Custom properties (`style-generator.ts:771-774`), globals reset

Source authored CSS는 **어느 단계에서도 직접 적용되지 않는다** — 1의 evidence, 2b의 edge snap, 2e의 값으로만 쓰인다.

---

## 4. CURRENT PIPELINE (source → observer → SiteSpec → reconstruction → generated CSS)

| Stage | EXISTS | PRESERVED | TRANSFORMED | DISCARDED |
|---|---|---|---|---|
| **Public source** | `<link>` sheet, `<style>`(Emotion insertRule), inline `style`, JS 계산 inline(swiper) | — | — | — |
| **Observer** (`observe-page.ts`, `collect-dom.ts`, `layout-probe.ts`) | CSSOM walk of `document.styleSheets` (`collect-dom.ts:843-868,1074-1244`); CORS sheet는 이미 받은 response body 재파싱 (`observe-page.ts:434-516`); computed style (`collect-dom.ts:1711-1733`); probe x/w/v per width (`layout-probe.ts:785-797`) | 매칭된 element별 `layoutRules` {property, CSSOM-serialized value, media/supports/container/layer string, origin, selector, important} (`collect-dom.ts:1280-1312`); `LAYOUT_RULE_PROPERTIES` 62개(width/height/inset/padding/margin/flex/grid/gap/transform/aspect-ratio 포함, `types.ts:703-766`); custom property 발견 (`collect-dom.ts:2062+`); class·data-* attribute (`collect-dom.ts:1330`, `types.ts:477`); `rendered.html` | 값은 원문이 아니라 CSSOM 재직렬화 (`0 auto`→`0px auto`); var() shorthand longhand는 빈 값 | stylesheet text/bytes 미저장 (`store.ts:184-190`); `LAYOUT_RULE_PROPERTIES` 밖 property (`font-size`, `order`, `float`, `columns` 등); element당 32개 초과 (sheet order로 잘림 — cascade 승자 손실 가능); index cap `MAX_LAYOUT_RULES 6000` (`types.ts:781`); 해당 viewport DOM에 없는 selector; **inline `style` attribute** (`ATTR_WHITELIST`에 없음, `types.ts:477`); specificity/order 정보; `@scope`/`@starting-style` |
| **SiteSpec** (`compile-viewport.ts`, `authored-breakpoints.ts`, `safe-attributes.ts`) | `authoredLayout` (`compile-viewport.ts:302-304`), `authoredBreakpoints` per page×viewport, style catalog token (computed px), probe | `authoredLayout` verbatim | media string → histogram fold (`media-condition.ts`) | **class, style, id, data-*** (`safe-attributes.ts:128-134`); page-wide media tally·`stylesheetCoverage` (`compile-page.ts:538-585`); site `inferredBreakpoints` = `[]` (`compile-site.ts:433`) |
| **Reconstruction plan** (`plan-reconstruction.ts`, `responsive-plan.ts`, `tree-switch.ts`) | breakpoint plan, runtime pages, custom props | inference 결과를 evidence로 manifest에 | served switch = policy 801 | per-route switch (`byPageId` 비움) |
| **Layout inference** (`layout-inference.ts`) | probe split at served bp (`:4525-4531`) → funnel (§3.2) | width-family 일부 authored 값 (2e) | 관측 relation → 측정 상수 (`%` 평균비, px max-width, `minmax(0,Nfr)`) | height/top/left/padding/gap/transform/font-size relation kind 없음 (height는 text-box relief만); 모든 probe에서 단일 relation 불성립 시 no rule; partial-range @media |
| **Truth check** (`layout-truth-check.ts`) | geometry rule은 1440/390만 (`:1281`); band는 truth + verifyWidth 1개 (`:1591-1633`) | 통과 rule | — | 4px 초과 악화 rule reject; residual audit(≤4 width)은 **report-only** (`:1084-1091`) |
| **Style generator / DOM** (`style-generator.ts`, `compile-node.ts`) | `.wr-stN` computed px, `data-wr-node`, `wr-*` class | — | — | source class/id/data-* (`react-attributes.ts:28-30`); style generator는 @media를 emit하지 않음 |
| **Generated CSS (apartmentary pipeline분)** | 4,109,264 B (manifest와 byte 일치 복원) | `%` recovered 472 / `width:auto` 2,823 / `calc` 17 / `vw` 9 / margin auto 6 | @media 19개 = `(max-width:899.98px)`×17 + `(max-width:1319.98px)`×2, 모두 `display:none` band | `fr`/`clamp`/`min()`/`max()` 0; exact tier px width 1,437 / height 1,437 / left 349 / top 355 |

---

## 5. INFORMATION LOSS TABLE

| authored semantic | Observer | SiteSpec | Reconstruction plan/inference | Generated CSS | 소실 지점 |
|---|---|---|---|---|---|
| `@media` condition | YES (declaration별 string + page tally) | PARTIAL (declaration별 유지, histogram; page tally 버림) | tree switch: evidence only / band edge snap / 2e는 served range 전체 성립 시만 | **NO** (source 조건 미emit; 생성 조건은 probe bracket+snap) | inference (`responsive-plan.ts:221-243`, `layout-inference.ts:4726-4769`) |
| `@media` 내부 declarations | PARTIAL (layout whitelist, 32 cap, matched only) | PARTIAL (verbatim) | 2e에서 whole-range만 | NO (partial-range refuse — apartmentary MUI `33.3333% @900` 729건) | inference `:5016-5024` |
| `@container` | PARTIAL (flat string) | PARTIAL | NO | NO | inference (미사용) |
| `@supports` | PARTIAL (flat string) | PARTIAL | NO | NO | inference (미사용) |
| `%` (e.g. `width:85%`) | YES | YES | PARTIAL (측정 relation 성립 시 측정 %; 아니면 2e — 선행 rule 있으면 `already-recovered`) | PARTIAL (n000528 85% → `max-width:100%` + frozen 1224px) | inference `:6644-6653`, `:4949` |
| `fr` / `repeat()` | YES | YES | PARTIAL (grid module은 child 측정 `minmax(0,Nfr)`, authored 미사용 `:3056`; authored 원문은 2e fallback으로만 `:4882-4884`) | NO (apartmentary 0, flex site) | inference |
| `vw` / `vh` | YES | YES | PARTIAL (width-family만) | PARTIAL (`min-width:1.135vw` 9); top/height/padding vw → px | inference allowlist `:4582-4590` |
| `clamp()` | YES | YES | PARTIAL (width-family만) | 0 (apartmentary source에도 0) | allowlist |
| `calc()` | YES | YES | PARTIAL | generator 자작 `calc(100% ± Npx)` 17만 | allowlist |
| `min()`/`max()` | YES | YES | PARTIAL | 0 | allowlist |
| `max-width` | YES | YES | PARTIAL (centered-max-width는 **측정 px** `:6194`) | PARTIAL (1920 cap 유지, 센터링 없음) | inference |
| `margin: 0 auto` | YES (longhand `margin-left/right:auto`로 도착) | YES | PARTIAL (full-width branch가 width만 emit → auto margin이 `already-recovered`로 차단. 참고: manifest `margin-*:margin-not-auto` 2,468은 non-auto margin의 정당한 refuse) | NO (exact tier margin-left px; n000166/n000623 좌측 고정) | inference `:6376-6390`, `:6644-6653` |
| flex/grid authored values | YES (whitelist 내) | YES | PARTIAL (flex item은 refuse `:1455`; `flex-basis`는 authored-intent allowlist 밖 — n000700 `flex-basis:33.3333%` 미사용) | exact tier에 1440 시점 값 | inference |
| height / aspect-ratio / insets / padding / transform | computed YES, authored YES (whitelist 포함) | YES | **NO** (relation kind 없음; height는 text-box relief만) | NO (frozen px; top/left token 다수는 `0px`) | inference/style-gen `style-generator.ts:484-493` |
| **inline `style`** (JS/React 작성) | **NO** (`ATTR_WHITELIST`에 style 없음; `rendered.html`에만 텍스트로 존재) | NO | NO | NO | **observer** `types.ts:477` |
| source `class` | YES (618/670) | NO (`safe-attributes.ts:134`; selector 문자열로만 `authoredLayout`에 잔존) | NO | NO (`wr-*`만) | **SiteSpec** |
| source `data-*` | YES | NO (`safe-attributes.ts:132`) | NO | NO (`data-wr-*` 생성 id만) | **SiteSpec** |

**Q18 — computed px flatten 지점:** observer의 computed capture(`collect-dom.ts:1711-1733`)가 px를 **별도 채널**로 저장하고, SiteSpec style catalog가 그대로 운반하며, `style-generator.ts:484-493`이 모든 node의 base로 ship한다. authored → px로 "변환"하는 코드는 없다. authored 채널이 inference 단계에서 **채택되지 못해** 기본값인 frozen px가 남는 구조다.
**Q23 — source selector가 generated DOM에 match?** 사실상 NO. class/id/data-* 전부 없음, `.wr-variant` 이중 wrapper와 `html/body→div`로 구조 selector도 깨진다. bare tag/ARIA selector만 가능 (`03 §Q23`).

---

## 6. TASK 28.5C STATUS MATRIX

| # | 28.5C work package | 상태 | doc | current code | test | current Apartmentary behavior |
|---|---|---|---|---|---|---|
| 1 | hidden-band correction | **IMPLEMENTED** | 28.6 ledger A1 CLOSED | `hiddenBands` `layout-inference.ts:6805-6857`, `snapBandEdges` `:7058-7144`, band truth-check `layout-truth-check.ts:1591-1633` | `smoke-layout-safety.ts` (banded 85 / snapped 47 refs) | 17 edge가 authored 900에 snap, 2개 midpoint `1319.98`, **19개 모두 lower edge open → 801까지 연장** (policy 상호작용으로 801–899 hybrid) |
| 2 | probe-width plumbing | **IMPLEMENTED** | ledger A7/A8, `28.6/07-o31…` | `observe-selected-pages.ts:102,353,552`, `probe-widths.ts`, `types.ts:2749,2780` | `smoke-multi-observer.ts` (requiredWidths 14 refs) | desktop probe 15개 (599/600/899/900/1199/1200/1535/1536 포함). 단 max 1920 (1920 cap 관찰 불가) |
| 3 | coherent fluid-unfreeze | **PARTIAL** | ledger A4 WONTFIX, A9 OPEN | width-family kinds만 `layout-inference.ts:133-225`; allowlist `:4582-4590` | layout-safety parts | hero `n000050` height 818px frozen, floating CTA `left:1360/top:684` frozen, root `n000005` 1440 frozen (flex-row refuse) |
| 4 | authored-breakpoint capture / CORS direct fetch | **PARTIAL** (capture 구현 · direct fetch 미구현(body 재사용으로 대체) · stylesheet text 미영속 · served switch 사용은 **IMPLEMENTED THEN REGRESSED**) | ledger B1 CLOSED; 28.8-fast D1 | `observe-page.ts:434-516`, `authored-breakpoints.ts:118`, `responsive-plan.ts:221-243` | `smoke-multi-observer.ts` (cross-origin 13), `smoke-sitespec.ts` (authored 16) | 9/9 sheet readable, `authoredLayout` 670/670 node, bp 600/900/1200/1536 capture 완벽 — **그런데 900이 served되지 않음** |
| 5 | all-promised-width layout truth check | **PARTIAL** | 28.6 R3 | geometry는 1440/390만 `layout-truth-check.ts:1281`; band verifyWidth 1개; residual audit report-only `:1084-1091`; responsive-qa default `[390,700,1024,1100,1440]` `responsive-qa/types.ts:48` | `smoke-layout-safety.ts` residual 39, `smoke-responsive-qa.ts` | 801–898, 1025–1099, 1201–1439, >1920 미렌더. residual audit가 `offscreen 415`를 보고했지만 rule reject 없음 |
| 6 | mobile subtree responsive inference | **IMPLEMENTED** (mechanism) | 28.6 C2b / A13 | `LAYOUT_VIEWPORT_IDS` `layout-inference.ts:4436,5268` | `smoke-layout-safety.ts:3765-3790` | mobile authoredIntent 260 emit. 그러나 mobile tree는 ≤800만 serve — source의 <900 layout이 801–899에서는 desktop tree로 대체됨 |

---

## 7. APARTMENTARY SOURCE RESPONSIVE INVENTORY (live 실측, 2026-09-14)

(raw: `tmp/wr-resp-audit/live-inventory/`, 상세 `04-apartmentary-source-inventory.md`)

| 항목 | 값 |
|---|---|
| stylesheet total | **9** (link 2: Next.js `_next/static/css/*`, style 7) |
| same-origin / cross-origin | 9 / 0 |
| CSSOM readable / SecurityError | 9 / 0 |
| direct fetch 성공 | 2/2 link (29,372 B / 7,384 B), 재파싱 rule 수 CSSOM과 일치 (214, 40) |
| Emotion/MUI runtime | `data-emotion` 4, empty-text-but-CSSOM `<style>` 2 (157/14 rules), `css-*` class 105 @1440 / 91 @390, `Mui*` 29/27, styled-components 0 |
| inline style | 255 elements @1440 / 235 @390 (font-weight 125, white-space 114, word-break 113, **width 78, max-width 42**) |
| JS-computed geometry | `.swiper-wrapper` 4개 `translate3d`, slide inline width per viewport (hero 1440 vs 390, card 413 vs 350) |
| `@media` rules / unique | **43 / 8**: `(hover:none)`×18, `print`×13, `screen and (min-width:900px)`×3, `(min-width:600px)`×2, `(min-width:900px)`×2, `(min-width:1200px)`×2, `(min-width:1536px)`×2, `screen`×1 |
| `@container` / `@supports` | 0 / 0 (nested rules 79) |
| authored numeric breakpoints | 600, 900, 1200, 1536 (MUI default) — layout 영향 rule은 전부 `max-width`(Container cap) |
| fluid forms | `%` 83, `vw` 5, `vh` 0, `clamp` 0, `calc` 4, `min()` 1, `max()` 0, min/max-width 38, `margin:auto` 8, `repeat()` 0 |
| **observed layout discontinuities** (390→1920 10px + bp±1 sweep) | **899→900→901** (authored 900 일치, MUI `useMediaQuery` React re-render — 같은 element가 class `css-1uvs8q8`↔`css-1dibfmr` 교체), **930→940 (authored @media 없음 — JS/Swiper 쪽 breakpoint 추정)**. 600/1200/1536은 geometry jump 없음. horizontal overflow 0 |

**핵심 사실:** apartmentary의 responsive behavior는 대부분 **CSS @media가 아니라 JS**(MUI `useMediaQuery`로 React tree/class 교체, Swiper가 inline width/transform 계산)에서 온다. CSS가 담당하는 것은 `%`/`max-width` cap/`margin:auto` 수준의 fluid relation이다. → "원본 CSS만 복사"하면 900 switch와 card 3-up 계산은 재현되지 않는다.

---

## 8. SEVEN REGION PROVENANCE TRACES

(18 node, 상세 chain·line 번호 `05-seven-region-provenance.md`. PIPELINE CSS는 manifest byte 수와 일치하도록 복원한 것, per-node 결정은 pinned SiteSpec에 `inferLayoutRules()` in-memory 재실행으로 manifest histogram 완전 재현.)

**공통 ancestor — page root `n000005`**
```
SOURCE     .css-8atqhb { width:100% }            (parent display:flex row)
OBSERVER   computed width:1440px; layoutRules width:100%
SITE SPEC  authoredLayout width:100%; token st000952 width:1440px; class 삭제
RECON      full-width refuse (flex-item-main-axis, :1455) → damage clamp {max-width:100%}
           → authored width:100% = already-recovered (:6690→:4949)
GENERATED  .wr-st000952{width:1440px} + [n000005]{max-width:100%}
→ LOSS: RECONSTRUCTION. >1440에서 모든 영역이 1440에 cap됨.
```

| # | region / node | SOURCE authored | OBSERVER | SITE SPEC | RECON | GENERATED (pipeline) | LOSS POINT |
|---|---|---|---|---|---|---|---|
| 1 | hero `n000050` | inline `aspect-ratio:1.76/1`, width auto, `top:-120px` | computed 1440×818 + aspect-ratio; inline attr 없음 | 동일 | `full-width{width:auto}` | `.wr-st000176{width:1440px;height:818.172px;aspect-ratio}` + `width:auto` → height가 width를 1440에 고정 | RECON (height 비relax) |
| 1 | hero track `n000053` | JS inline `translate3d(-3·vw)` | computed matrix −6820.31 (autoplay 중 sample) | frozen matrix | transform inference 없음 | frozen matrix | OBSERVER (inline 미저장) |
| 2 | content wrapper `n000166` | `max-width:1920px; margin:0 auto` | 유지 (probe max 1920 → cap 미관찰) | 유지 | full-width `{width}`만 → margin auto `already-recovered` | cap 유지·좌측 정렬 | RECON `:6376-6390` |
| 2 | experience group `n000170` | content-sized, parent `justify-content:center` | computed 991.8 | 유지 | damage clamp | **정상 (≤1440)** | 없음 (fluid-desktop 수작업 patch가 오히려 깨뜨렸다가 layout-modes가 복구) |
| 3 | portfolio1 heading `n000192` | parent padding 40 안 block fill, space-between | probe: parent−80 (899에서만 mobile render 859) | 유지 | **no-branch-matched** (899 sample이 desktop range [801,∞)에 포함되어 full-width 불성립) | `.wr-st000108{width:1360px}` frozen → @1024 CTA x=1170 offscreen | RECON: **801 policy** `responsive-plan.ts:89` → `:4529` → `:6487` |
| 3 | card slide `n000208` | swiper.css `width:100%` + **JS inline `width:(wrapper−100)/3`** | computed 413.3; layoutRules는 덮어씌워진 `width:100%` (misleading) | 동일 | flex-row item refuse, carousel model 없음 | frozen 413.3 | OBSERVER (+RECON) |
| 4 | portfolio2 heading `n000418` | = n000192 | = | = | = | frozen 1360 | RECON 801 policy |
| 4 | swiper-wrapper `n000433` | `width:100%` | 유지 | 유지 | `authored-inline-size{width:100%}` | **보존됨** | 없음 |
| 5 | testimonial column `n000528` | **`width:85%`** | computed 1224; layoutRules `85%`; probe ratio 0.85 @900–1920, 899에서 1.0 | verbatim `85%` | damage clamp (899 sample 때문) → 85% `already-recovered`. **bp 900 counterfactual: `percentage-width 85%` emit** | `.wr-st000981{width:1224px}` + `max-width:100%` | RECON 801 policy |
| 5 | banner img `n000530` | inline `width:100%; object-fit:cover` | inline 없음, computed 1224×217.7 | 동일 | inline display → drop | frozen 1224×217.7 | OBSERVER |
| 6 | bottom img `n000621` | inline `width:100%; max-height:760px` | inline 없음 | 동일 | drop | frozen height 570 | OBSERVER (+RECON height) |
| 6 | footer container `n000623` | `max-width:1920px; margin:0 auto` | 유지 | 유지 | full-width → margin auto 소실 | 좌측 정렬 | RECON |
| 6 | footer link col `n000700` | `@media (min-width:900px){flex-basis/max-width:33.3333%}` | media string 포함 유지 | verbatim | `media-partial-range` refuse (range 801 시작) → `max-width:100%; width:auto`. **bp 900: `max-width:33.3333%`** | 3열 붕괴, row x=110.8 @1024 | RECON 801 policy `:5016-5022` |
| 7 | floating CTA `n000039` | `position:fixed; right:0; bottom:50px` | layoutRules 유지 + computed left/top도 저장 | 유지 | fixed → `node-out-of-flow` skip | `.wr-st000132{left:1360px;right:0;top:684px;bottom:50px}` → left/top 승리 | RECON/style-gen (inset 비relax) |

**Loss-stage histogram (18 nodes):** RECONSTRUCTION **9** (801 policy 4 · flex-row/damage-clamp 1 · margin:auto 2 · height/inset freeze 2) · OBSERVER **6** (inline style) · SITE SPEC **0** · 손실 없음 3.
→ **responsive semantic은 SiteSpec까지 대부분 살아서 도착하고, reconstruction이 채택하지 못해 사라진다.** 단 inline style(JS/React 작성)은 observer에서 이미 사라진다.
**Counterfactual (in-memory, bp=900):** n000192/n000418 → `width:auto`, n000528 → `85%`, n000700 → `33.3333%`. 801 policy 하나가 reconstruction 손실 9건 중 4건의 원인. (truth-check은 미실행)
**Manual patch:** 모든 pipeline 손실을 **node-id scoped 수작업 rule**로 재도입 (2건은 source semantic이 아닌 hand-derived 근사: slide `calc((100%-100px)/3)`, hero `translateX(-300%)`). pipeline 재실행으로 재현 불가.

---

## 9. WHY WINDOW RESIZE BREAKS TODAY — root cause ranking

(연속 sweep 실측: `06-continuous-sweep-source-vs-clone.md` — §9.1)

| rank | root cause | code | apartmentary 증상 (1024 전후) | 영향 범위 |
|---|---|---|---|---|
| 1 | **served tree switch(801) ≠ source switch(900)**; probe axis도 801에서 split되어 899(mobile-render sample)가 desktop 추론을 오염 | `responsive-plan.ts:85-94,221-243`; `layout-inference.ts:4525-4531` | 801–899: source에 없는 hybrid tree. heading row·85% column·footer 3열이 1360/100%/붕괴로 frozen → **text가 container 밖, CTA 위치 이상, grid 관계 붕괴** | 18 node 중 4 직접, 파생 다수 |
| 2 | **frozen computed px가 모든 property의 base**이고 relation kind는 inline-size family뿐 (height는 text-box relief만) | `style-generator.ts:484-493`, `:500-510`; kinds `layout-inference.ts:133-225`; allowlist `:4582-4590` | hero height 818 고정 → **image/text composition 붕괴**; fixed CTA left/top 고정; padding/gap/font-size px | 전 페이지 (px height 1,437 token) |
| 3 | **measured-first funnel이 authored intent를 차단** (`already-recovered` 2,470, `max-width:media-partial-range` 729) | `:6644-6653`, `:4726-4769` | 85%→100%, `margin:0 auto` 소실, MUI 33.33% 소실 | authored 증거가 있는데도 버려짐 |
| 4 | **"모든 probe에서 단일 relation" 요구**, banded width/margin/padding rule 없음 (display:none·grid만 band) | `:6156-6410`; band kinds `:5471,:5679` | 900 전후로 relation이 바뀌는 node는 전부 no rule → frozen | subtree 전반 |
| 5 | **observer가 inline style 미캡처** (JS/React 작성 layout) | `observer/types.ts:477`, `collect-dom.ts:1280` | swiper slide 413 frozen → **card 3-up 관계 붕괴**, 이미지 100% 소실 | 18 node 중 6 |
| 6 | **truth check가 1440/390에서만 geometry 검증**, 다중 width residual audit은 report-only | `layout-truth-check.ts:1281`, `:1084-1091` | 1024에서 틀린 rule도 ship (residual `offscreen 415` 보고만) | 검증 사각지대 |
| 7 | flex-row item refuse → root `n000005` 1440 frozen | `layout-inference.ts:1455` | >1440 전 영역 1440 cap | ≥1441 |
| 8 | probe ceiling 1920 → `max-width:1920` cap·centering 관찰 불가 | `probe-widths.ts` | >1920 centering 소실 | ≥1921 |
| 9 | source identity 제거 → source CSS 재사용 경로 자체가 없음 | `safe-attributes.ts:128-134`, `react-attributes.ts:28-30` | 모든 결정이 재추론에 의존 | 구조적 |

요약: **1은 "잘못된 tree를 보여줌", 2–4는 "authored fluid relation을 채택하지 못하고 1440 px로 얼림", 5는 "JS가 쓴 layout을 못 봄", 6은 "그걸 검증도 안 함".** 1–4는 SiteSpec에 이미 있는 정보를 reconstruction이 버리는 문제다.

### 9.1 연속 sweep 실측 (`06-continuous-sweep-source-vs-clone.md`, raw `tmp/wr-resp-audit/sweep/`)

방법: in-place resize(reload 없음) 99 width (390→1920 step 20 + 모든 알려진 bp ±1 + 2560), 22 node(§8 대상) + card/column count, FAIL = `|Δx|` 또는 `|Δw| > max(8px, 2%·vw)`. clone은 기존 build를 `next start`로 serve하고 CSS만 request-level 교체 (파일 무수정).

| variant | 결과 | 모든 node PASS 구간 |
|---|---|---|
| **CLONE-P (pure pipeline)** | 22 node 중 21개가 desktop range 거의 전역에서 FAIL; page height 801px부터 6056px 고정 (2560에서 source 대비 0.86); portfolio/testimonial visible card count가 900–1370, 1830–2560에서 불일치 | **1430–1450뿐** |
| **CLONE-C (pipeline + 수작업 patch)** | 10 node는 390→2560 전역 PASS, 나머지 12 node는 **801–899 한 구간에서만 FAIL** (1201/1300/1536/1810/2560 모두 PASS); page height 1440/1920/2560에서 ±1px | **900–2560** |
| 공통 | horizontal overflow 0 (source/P/C 전부) — P의 결함은 scroll이 아니라 내부 오배치·frozen size | — |

해석:
- 사용자가 본 "1024 전후 text 밀림 / composition 붕괴 / CTA 위치 / card 관계"는 **pipeline 출력(P)에서 그대로 재현**된다 (1430–1450 외 전역 실패).
- 수작업 patch(C)는 `%`/`calc()`/`auto`/`margin:auto` 같은 **authored-relative semantics를 되살렸을 뿐인데 900–2560 연속 구간이 맞는다** → probe width 사이에서 깨지지 않는다. 즉 연속 responsive에 필요한 것은 더 많은 probe가 아니라 **authored relation의 채택**이라는 직접 증거.
- C에 남은 유일한 실패 구간 801–899는 **root cause 1(801 policy vs source 900)** 과 정확히 일치한다.
- 한계: 측정은 22 node(수작업 patch 대상 영역과 겹침 — selection bias 가능), p000001 desktop만 patch됨(다른 route·mobile tree 미패치), autoplay node x는 제외. 22 node 밖의 text/line-wrap 문제는 이 sweep이 배제하지 못한다 (landmark-only 검증 함정, 과거 fluid-desktop 실패 사례).

---

## 10. SOURCE-CSS-FIRST REASSESSMENT

### 10.1 28.5C Strategy B는 왜 실패했나 — principle vs implementation

재현 가능한 근거: `tmp/wr-responsive-investigation/agent-d/{scripts/b-build.mjs,patch-b.mjs,out/b-preserved.css,out/metrics-*.json,shots/B-preserved-*.png}`, `handoffs/28.5C-experiments.json:183-353`, `28.5C-adjudication.json:139-160`.

| 실패 원인 | 종류 | 근거 |
|---|---|---|
| ~5.9k node가 1440 frozen px인 exact tier 위에 **overlay**로 얹음 → 보존된 소수 property만 이기고 나머지는 frozen | **architecture 제약 (composability)** | `experiments.json:327` |
| 모든 declaration `!important` + selector 평탄화 → source specificity / order / `@layer` 소거 | **implementation variant** | `b-build.mjs:172`, `experiments.json:332-333` |
| custom property 미보존 → `var(--1fr)`·`--header-height` 등 100+ dangling (clone 정의 0) → `!important` invalid-at-computed-time로 초기값이 정답을 덮음 | **implementation bug** | `b-preserved.css:5`; 01 §3.4 |
| 빈 longhand 28개 (`padding-top: !important`) | implementation bug | `b-preserved.css:5,43,52` |
| kept rule 621 중 511 unmatched (보고는 0 — counter bug) | implementation | `b-build.mjs:159` vs `:178` |
| SiteSpec가 class 제거 → selector 번역 필요 | **generated DOM identity 제약** (지금도 사실) | `safe-attributes.ts:134` |
| build 시 live source fetch → asset independence | 설계 비용 주장 (측정된 실패 원인 아님); 28.6에서 capture 시점으로 이동 | `experiments.json:330-331` |
| 반복 1회 (C는 7회) | 실험 설계 불균형 | 01 §3.1 |

(`experiments.json:183` 본문은 "511 kept rules matched no observed element"를 명시하므로 counter bug가 숫자를 숨기지는 않았다 — top-level 필드만 틀림.)

그리고 **28.5(A)에서 source-first를 full form(source DOM + 전체 sheet, JS 제거)으로 돌렸을 때 linear에서 9개 이산 width 모두 scrollHeight가 source와 일치**했고 (연속 sweep은 아님, `28.5…md:1117`), 그 reject 사유는 responsive 실패가 아니라 다른 6개 사이트의 1440 일반화(shadow DOM, canvas)와 제품 비용(slot, 재생성성, licensing)이었다 (`28.5…md:779-783,813-825,880-883`).

**판정: 실패는 "SOURCE-FIRST 자체가 틀림"이 아니라 "frozen px cascade 위 overlay + identity 소거 + token/cascade 미보존이라는 당시 implementation variant" 때문이다.** 28.5C가 유효하게 증명한 것은 "*partial rule을 frozen computed tier 위에 specificity로 덮는 방식은 compose되지 않는다*" 하나다. adjudicator 문구 "refutes preserve as a rendering principle"은 증거보다 넓게 일반화됐다.

### 10.2 A/B/C/D 비교

| 기준 | A. Full source CSS replay | B. Authored responsive rule preservation (translate) | C. Computed + inference (현재) | D. Hybrid source-first |
|---|---|---|---|---|
| capture width fidelity | 높음 (JS-rendered state 의존) | 현재와 동등 이상 (frozen fallback 유지 시) | 높음 (truth width에 최적화) | 현재와 동등 (truth-width gate 유지) |
| continuous responsive fidelity | CSS 담당 부분만 높음. **apartmentary는 900 switch·slide 폭이 JS → 재현 안 됨** | CSS relation 부분 높음, JS relation은 별도 필요 | **낮음** (probe 사이 상수·step, §9) | 가장 높음 (authored → JS-observed → inferred 순) |
| generated DOM compatibility | source class/structure 필요 → **현 DOM과 비호환** (이중 tree wrapper, class 제거) | `data-wr-node`로 번역 → 호환 | 호환 | 호환 |
| CSS-in-JS compatibility | Emotion hash class가 runtime 생성 → 정적 replay 시 class 이름을 DOM에 박아야 함, React re-render에 따른 class 교체는 재현 불가 | CSSOM에서 이미 capture 중 (`authoredLayout`) → 가능 | 무관 | B와 동일 + observe fallback |
| JS runtime dependency | 높음 (source JS가 inline/class를 바꾸는 사이트) | 없음 | 없음 | 없음 (JS 효과는 probe 관찰로 번역) |
| portability | 사이트별 편차 큼 (shadow DOM, canvas, @layer) | 중간 (translate 가능한 property family 한정) | 높음 | 높음 |
| implementation complexity | 매우 높음 (identity 재설계, cascade 완전 replay) | 중간 (cascade 승자 결정, 조건 번역, frozen property 양보) | 이미 존재, 추가 개선은 한계체감 | 중간 (B + 기존 C 재배치) |
| artifact size | 원본 sheet 전체 (apartmentary 36KB + Emotion; 대형 사이트 수 MB) + 미사용 rule | 작음 (node×property rule, 현재 recovered tier 규모) | 현재 4.1MB CSS | B와 비슷, frozen tier 일부 축소 가능 |
| Slotization / Recon Template 호환 | **낮음** (template이 `data-wr-node`/wr class 기준, source class selector는 slot 치환·theme overlay와 충돌) | 높음 (rule이 node id 기준 — 기존 recovered tier와 같은 형태) | 높음 | 높음 |
| deployability | source asset/font/licensing 결합 | 독립 | 독립 | 독립 |
| source independence | 낮음 (원본 CSS 텍스트 포함) | 높음 (declaration 단위 fact로 번역) | 높음 | 높음 |
| legal/licensing | **원본 stylesheet 저작물 재배포** 위험 | 낮음 (layout fact 수준 — 단 여전히 검토 필요) | 낮음 | 낮음 |

**결론:** A는 primary로 부적합 (특히 CSS-in-JS + JS-driven responsive 사이트에서 이점 소멸, slot/theme/licensing 비용). C는 구조적으로 연속 구간을 못 맞춘다. **D(내부적으로 B-translate를 primary tier로, C를 fallback으로)** 가 정답 방향이다. A는 diagnostic/oracle mode(비배포)로만 가치가 있다.

---

## 11. RECOMMENDED PRIORITY ORDER

**Tree/variant switch (route 단위):**
1. operator `--breakpoint` (명시 지시)
2. **source evidence switch** — authored breakpoint가 probe로 관찰된 DOM family swap과 ±1px에서 일치 (`domSwitchWidthObserved && snapped`) → serve (route별 허용)
3. observed-only switch (tight bracket ≤1px, authored 없음 — JS `useMediaQuery` 사이트)
4. product policy 801 — 증거가 없거나, 후보가 여럿인데(`ambiguous`) 어느 것도 DOM swap으로 관찰되지 않았을 때만 fallback. `ambiguous:true`여도 **정확히 한 후보만 observed family swap + authored 일치**면 serve (apartmentary: 후보 600/900/1200 중 900만 swap 관찰).
   근거와 반론: 28.8-fast D1의 명시 사유는 (i) 관찰되지 않은 width에서 tree를 보여주는 문제, (ii) **사이트마다 다른 숫자라 operator가 설명할 수 없다는 제품 설명성**이다 (`responsive-plan.ts:62-80`). authored ±1 probe는 D1 **이전**(28.6 C3, `probe-widths.ts:2`)에 이미 있었으므로 "probe 도입으로 전제가 사라졌다"고 말할 수는 없다. 다만 apartmentary처럼 **DOM switch width 자체가 관찰된(`domSwitchWidthObserved:true`)** 경우 (i)은 성립하지 않고, §9.1 sweep상 801–899가 C의 유일한 실패 구간이다. (ii)는 manifest/operator report에 served switch와 근거를 노출하는 것으로 대응해야 한다.
   주의: authored switch를 serve하던 28.8(pre-fast) 시기에도 700/1024/1100 acceptable은 0/7이었다 (`28.8/09-final-visual-audit.md:49`) — **switch 교정 단독으로는 부족하고 node×property 우선순위 변경과 함께여야 한다.** **이 항목은 28.8-fast V1 product decision을 뒤집으므로 사용자 승인 필요.**

**Node × property (tree 안, width W):**
1. **Authored rule (stylesheet + CSS-in-JS CSSOM + inline)** — **cascade 승자**(inline > important > specificity > order, layer 반영)로 결정한 값. 현재 코드는 sheet order 마지막 admissible 값을 쓰고 `important`를 무시하며 inline style을 보지 못하므로(§3.2e), **cascade-winner 결정과 inline capture가 authored-first의 선행조건**이다. 결정된 값은 원 조건(`@media`/`@container`/`@supports`)을 served tree interval과 교차(intersect)해 banded rule로 translate, `var()`는 source token 정의까지 함께 emit. 조건이 served interval 일부만 덮어도 **부분 band로 emit** (현재 refuse).
2. **Authored inline style** (SSR HTML에 있던 것 = author 의도; JS가 viewport별로 바꾼 것 = 3으로)
3. **Observed relation** (probe-measured, 현 funnel) — authored 증거가 없거나 authored 값이 truth에서 실패할 때; JS-computed geometry(swiper `(W−gap)/N`)는 여기서 식으로 맞춤
4. **Frozen computed px** — 최후 fallback, 그리고 layout과 무관한 paint property의 base
   - 핵심 규칙: **1–3이 property P를 소유하면 해당 node의 frozen tier는 P를 emit하지 않는다** (specificity overlay가 아니라 property ownership) → 28.5C B의 composability 실패를 구조적으로 제거. 비용: `.wr-stN`은 여러 node가 공유하는 dedup token이므로 token 분할(CSS 크기↑, template byte-neutral parity 영향) 또는 `@layer` 구조가 필요 (§16).
5. **VERIFY:** 모든 emitted responsive rule은 자신이 적용되는 각 interval의 경계±1과 내부 sample에서 source와 비교해 통과해야 ship (report-only 금지). authored 값도 예외 없음 — apartmentary truth check는 이미 authored-inline-size 36건을 1440에서 reject했다 (authored 값이 무조건 옳지 않다는 직접 증거).

근거 요약: (a) apartmentary에서 stylesheet/CSS-in-JS 기반 authored 정보는 SiteSpec 단계 손실 0으로 도착한다(§8; 단 inline style 6건은 observer에서 이미 손실); (b) reconstruction 손실 9건 중 4건이 authored breakpoint 채택만으로 rule 후보가 생김(counterfactual — p000001 desktop만, truth-check 미실행); (b') §9.1에서 authored-relative 값을 수작업으로 되살린 C가 900–2560 연속 PASS; (c) authored `%`/`margin:auto`/media-scoped 값은 probe 사이에서 자연 보간되지만 측정 상수는 불가; (d) JS-driven 부분(900 re-render, swiper)은 CSS에 없으므로 observation fallback이 반드시 남아야 한다 — 따라서 A가 아니라 D.

---

## 12. REQUIRED ARTIFACT / SCHEMA CHANGES (구현 금지 — 명세만)

| artifact | 변경 |
|---|---|
| Observer `styles.json` / `LayoutRule` (`observer/types.ts:1024-1098`) | 기존 `important`/`origin`/media/layer 필드는 **이미 존재** — 누락된 cascade 메타만 추가: `sheetIndex`, `ruleIndex`, `specificity`, `layerOrder`; 32 cap을 sheet order가 아닌 cascade-winner 우선으로; `LAYOUT_RULE_PROPERTIES`에 `font-size`, `order` 정도만 추가 (height/inset/padding/gap/flex/transform/aspect-ratio는 이미 포함) |
| Observer node | `inlineStyle` per viewport (SSR `rendered.html` 값 vs post-JS 값 구분) — 현재 `ATTR_WHITELIST`에 `style` 없음 |
| Observer page | `stylesheets[]` {href, owner, sameOrigin, cssomReadable, bytes, sha256, persistedPath?}; custom property는 발견·var() 해석 경로가 이미 있음(`collect-dom.ts:2062+`, 28.8-fast A2b) — 조건부(@media) token 정의 보존 여부만 확인·보강 |
| SiteSpec `PageSpec.viewports.*` | `authoredLayout[]`에 위 cascade 메타·origin 유지; page-wide `mediaConditions` tally 유지; `inlineStyle` 전달 (class/data-*는 계속 제거해도 됨 — translate 방식이므로) |
| SiteSpec `responsiveModel` | per-page `switchEvidence` {authoredPx[], observedDomSwitchPx, observedGeometryJumps[] (source sweep), jsOnlyJumps[]}; `inferredBreakpoints` 채우기 |
| Reconstruction IR (신규) | `ResponsiveDecl {pageId, viewportId, nodeId, property, value, interval:{minPx,maxPx}, sourceCondition?, provenance: authored-sheet|authored-inline|observed|frozen, verifiedAt[]}` |
| `.wr-stN` token | node가 소유권을 넘긴 property를 제외한 variant token (또는 per-node `revert-layer` 기반 layer 구조) |
| Manifest | `servedSwitch` vs `switchEvidence` + 선택 사유; per-node decision log (최소한 layout container); continuous QA 결과 (interval별 PASS/FAIL) |

---

## 13. REQUIRED CODE MODULE CHANGES (구현 금지)

| module | 변경 |
|---|---|
| `src/observer/collect-dom.ts` (`:1048`, `:1280-1312`, `:1711`) | specificity/rule order 기록, 32 cap cascade-winner 우선, inline style 캡처(SSR/runtime 구분) |
| `src/observer/types.ts` (`:477`, `:703-766`, `:1024-1098`) | schema |
| `src/observer/probe-widths.ts` | authored cap(`max-width ≥ 1920`) 존재 시 cap 초과 probe(예: cap+160, 2560) 추가 |
| `src/sitespec/compile-viewport.ts`, `compile-page.ts:538-585`, `authored-breakpoints.ts` | 메타·inline·tally 전달, `switchEvidence` 구성 |
| `src/reconstruction/responsive-plan.ts` (`:221-243`, `:282`) | §11 switch 우선순위, route별 serve |
| `src/reconstruction/tree-switch.ts` | evidence 등급 산출 (authored+observed / observed-only / none) |
| `src/reconstruction/layout-inference.ts` | 새 **authored tier**를 funnel **앞**으로 (`:6630-6725` 이동·확장); winner 선택(`:5036-5049`)을 cascade 기반으로 (`important`·specificity·inline); `authoredMediaHolds`(`:4726-4769`) → interval 교차 banded emit; `already-recovered` gate(`:6644-6653`) 역전 (full-width branch가 authored `margin:auto`를 막지 않게); allowlist(`:4582-4590`)에 `flex-basis` 추가; `width:auto` 자동 추가(498건)는 inline width 확인 후에만; probe split을 served switch별로 (`:4525-4531`); height/inset/padding relation kind 추가; flex-row item 처리(`:1455`) 재검토 |
| `src/reconstruction/style-generator.ts` (`:484-493`) | property ownership에 따라 frozen declaration 제외 |
| `src/reconstruction/layout-truth-check.ts` (`:1281`, `:1084-1091`) | interval sample 렌더링 + residual을 reject 채널로 |
| `src/responsive-qa/*` (`types.ts:48`) | §14 continuous QA (source sweep 기반 interval) |
| `src/reconstruction/app-template.ts` (`:316-349,379-389`) | route별 switch 활성 (코드 경로는 이미 존재) |

---

## 14. CONTINUOUS RESPONSIVE QA — acceptance algorithm

**원칙 (architecture requirement로 채택 권고):** 390/700/1024/1100/1440/1920은 layout mode가 아니라 probe point다. acceptance 단위는 **source evidence로 정의된 연속 interval**이며, breakpoint 숫자·site-wide 단일 breakpoint를 가정하지 않는다 (route/subtree별 허용).

```
INPUT: route r, source URL, clone URL, range [Wmin=390, Wmax=1920] (+ extrapolation probe 2560)

1. BOUNDARY DISCOVERY (source only, per route)
   B_authored  = r의 모든 @media/@container min/max 값 (조건 해석, 0.02px 정규화)
   coarse sweep: Wmin..Wmax step 10 → per major container (x, w, h, visible, column count) 벡터
   B_observed  = 인접 sample 간 벡터 불연속(|Δh|>max(24px,5%), |Δx|,|Δw|> 8px 비선형, visible/column 변화)
                 → bisection으로 1px까지 좁힘
   B_clone     = clone의 served switch + emitted band edge (manifest) + clone coarse sweep 불연속
   intervals I_k = partition by (B_authored ∪ B_observed) only  — source가 정의
   B_clone은 partition에 넣지 않고 sample에만 추가 (clone-only jump가 interval 분할에 숨지 않게; G6이 판정)

2. SAMPLE SET S
   ∀ b∈(B_authored ∪ B_observed ∪ B_clone): {b−1, b, b+1}
   fixed grid: Wmin..Wmax step 40
   ∀ I_k: 3 seeded random widths (seed = hash(route, interval bounds) — run이 바뀌어도 같은 width → baseline 비교 가능)
   extrapolation: 1921, 2560

3. PAGE STATE NORMALIZATION (both sides): animation/transition off, autoplay pause + slide index 0 강제,
   popup normalizer, fonts ready, lazy scroll, 동일 viewport height(1000)

4. CORRESPONDENCE: clone data-wr-node ↔ SiteSpec sourceElementId ↔ source structural path (w/ tree variant)
   major containers = 영역 root + content groups + card rows + CTA + images + fixed elements (landmark만 금지)
   served tree ≠ source layout 구간(예: 801–899 clone desktop vs source mobile render)은 node 대응이 불가능
   (SiteSpec은 cross-viewport node matching을 하지 않음, `compile-site.ts:436`) → 이 구간은 node relation 대신
   "tree mismatch" 자체를 FAIL로 기록하고, 영역 단위(section bbox, text/image 집합, column count)로만 비교

5. PER-SAMPLE HARD CHECKS (clone; source 동일 조건이면 면제)
   H1 horizontal overflow (scrollWidth > vw+1)
   H2 offscreen normal-flow text (text node rect 밖으로 >1px)
   H3 clipped text (scrollWidth/Height > client + overflow hidden)
   H4 impossible overlap (sibling text/image 교차 > 4px², source에 없음)
   H5 element outside containing block (> 2px)
   H7 source-visible content missing / H8 clone-only visible content (text+image presence)

6. PER-SAMPLE RELATION CHECKS (source vs clone)
   R9  line-wrap divergence (heading/CTA line count ±0)
   R10 card/grid column count (equal)
   R11 major container x/vw, w/vw 차 ≤ max(8px, 2%·vw)
   R12 full-bleed relation (source w==vw ⇔ clone w==vw)
   R13 centered margin symmetry (source |L−R|≤2 ⇒ clone |L−R|≤2)
   R14 edge anchoring (left/right/bottom 기준 거리 동일 anchor)
   R15 image aspect/crop (rendered aspect ±2%, object-fit 동일)

7. BEHAVIOR CLASS per interval (the real question)
   각 major container c, interval I_k 에서 x(W), w(W), h(W) 를 fit:
     FIXED(px) | FLUID(a·W+b) | CAPPED(min(a·W+b, cap)) | CENTERED(x=(W−w)/2) | FULL_BLEED | HIDDEN | STEP(내부 jump)
   source class == clone class 이고 parameter 차가 tolerance 이내여야 함
   G6 abrupt unexplained jump: clone 불연속 widths ⊄ (B_authored ∪ B_observed) ± 2px → FAIL

8. VERDICT
   route PASS ⇔ ∀ I_k: class 일치 ∧ R9–R15 위반 0 ∧ ∀ s∈S: H1–H8 위반 0 ∧ G6 위반 0
   추가 gate: truth width(390/1440) 기존 fidelity grade 비악화 (regression gate)
   OUTPUT: interval × container matrix, 첫 실패 width, 실패 check, source/clone crop 경로
```

최종 질문은 "390 PASS / 1440 PASS?"가 아니라 **"모든 I_k에서 source와 clone이 같은 behavior class를 보이는가?"**. §9.1의 sweep은 이 알고리즘의 축소판(고정 grid + bp±1, R10/R11 중심)이며, 그 결과가 "probe width PASS가 interval PASS를 의미하지 않는다"(P: 1440 PASS / 1430–1450 외 전역 FAIL)를 이미 보여준다.

---

## 15. IMPLEMENTATION ROADMAP (최소 변경 순서)

**P0 — 측정 먼저, 그 다음 가장 큰 레버 (한 wave)**
1. **P0-1 Continuous QA harness** (§14의 1–2, 5, 6-R10/R11, 7-G6, 8) — generator 무수정. apartmentary + canary(linear, channel.io, roseeskin) baseline 기록. 이게 없으면 이후 모든 변경이 다시 "probe PASS" 함정에 빠진다.
2. **P0-2 Evidence-backed tree switch** (§11 switch 1–4) — `responsive-plan.ts`, per-route 활성. §9.1 C의 유일한 실패 구간(801–899) 제거 대상; counterfactual상 p000001 desktop 4 node rule 후보 복구. 단독으로는 부족(28.8 pre-fast 0/7) → P0-4와 한 묶음. *사용자 승인 필요 (28.8-fast D1 번복).*
3. **P0-3 Verify widening (먼저)** — `layout-truth-check.ts` geometry rule을 적용 interval의 경계±1/중앙에서 검증, residual을 reject 채널로 승격. authored-first를 켜기 전에 안전망부터.
4. **P0-4 Authored-first width family (cascade 선행조건 포함)** — (a) observer: inline style capture + specificity/rule order 기록, (b) winner 선택을 cascade 기반으로(`:5036-5049`), (c) authored tier를 funnel 앞으로, partial-range → banded emit, `already-recovered` gate 역전, `flex-basis` 허용. (a)(b) 없이 (c)만 켜면 28.5C-B식 1440 regression 재발 위험.

**P1 — freeze 제거 범위 확대**
5. Property ownership: frozen tier에서 소유권 넘긴 property 제외 (`style-generator.ts`) — token 분할 비용 측정 포함.
6. (P0-4에서 못 끝낸) cascade 메타 전면화: `@layer` order, 32 cap cascade-winner 우선.
7. height / aspect-ratio / fixed·absolute inset / padding / gap relation kind.
8. flex-row item 처리 재설계 (root `n000005` 류), cap 초과 probe(2560).

**P2 — 일반화·잔여**
9. JS-computed layout model (carousel `(W − gaps)/N`, track transform index) — observation 기반.
10. `@container`/`@supports` conditional structure 번역.
11. stylesheet body 영속화 + source-CSS replay **diagnostic/oracle mode** (배포 금지).
12. page-family/subtree-scoped switch.

---

## 16. RISKS

| 영역 | 위험 | 완화 |
|---|---|---|
| 기존 390 fidelity | authored rule이 390 truth와 다른 값 산출(cascade 오판, JS가 덮은 inline) | truth-width regression gate 필수; authored 값은 truth에서 ±1% pre-check 유지(`:4911-4936`) |
| 기존 1440 fidelity | 28.5C B 재발 — frozen과 authored 혼재 시 1440 악화 | property ownership(overlay 금지), 1440 grade 비악화를 P0 gate로 |
| Recon Template | recovered tier 규모·형태 변화 → template assemble/parity QA(46/46)·byte-neutral default 영향; property ownership이 공유 `.wr-stN` token 분할을 요구하면 token 수·CSS 크기·slotized template byte-neutral parity가 크게 변함 | IR을 기존 `[data-wr-node]` rule 형태로 유지; token 분할 대신 `@layer`/per-node override 방식 비교 실험; template parity suite 재실행 |
| authored 값 자체의 오류 | inline width를 못 보는 상태의 `width:auto` 자동 추가(498), cascade 오판, truth에서 이미 reject된 authored 36건 | VERIFY 없이 authored ship 금지; inline capture 선행 |
| Slotization | band rule이 slot 치환 node(text 길이 변화)에서 line-wrap 차이 증폭 | slot node는 width family만 authored 적용, QA R9를 slot 채운 상태로도 실행 |
| Interaction Runtime | tree switch 변경(801→900, route별) 시 interaction binding(두 tree 공존)과 portal menu 동작 범위 변화 | interaction equivalence(27/27) suite를 switch 변경 후 재실행; route별 switch는 `app-template.ts` 기존 경로만 사용 |
| build/deploy | route별 media query·band 증가로 CSS 크기↑, production bake(static export) 경로의 globals 변경 | production QA(159/159) 재실행; CSS size budget 기록 |
| 제품 결정 | V1 policy(800/801)는 "operator가 900px에서 무엇을 보는지 설명 가능" 목표로 채택됨 — 사이트별 숫자로 되돌리면 그 설명성 상실 | manifest `servedSwitch` + 사유를 operator report에 노출, `--breakpoint` override 유지 |
| 조사 한계 | PIPELINE CSS는 byte 수 일치로 검증한 복원본; counterfactual rule은 truth-check 미실행; JS jump 930–940 원인 미확정; apartmentary 1개 사이트 기준 | P0-1 harness로 다사이트 재측정 |

---

## 17. HANDOFF — 다음 implementation Opus용 brief

```
TASK: Responsive Source-First Hybrid — P0 (web-recon, working tree, uncommitted OK)

READ FIRST: docs/result/responsive-architecture-forensic-audit-2026-09-14.md (§3, §9, §11, §14)
            docs/result/responsive-architecture-audit/03-*.md, 05-*.md
PINNED: apartmentary obs 2026-09-14T04-22-26-242Z / spec 2026-09-14T04-58-45-517Z / rec 2026-09-14T05-01-12-931Z
        (현 generated app CSS는 수작업 patch본 — 비교 기준은 tmp/wr-resp-audit/provenance/generated-styles.PIPELINE-reconstructed.css)
TRAPS: grep -a (NUL bytes), run id pin, 긴 job은 start_new_session, zsh `echo ===` 금지

P0-1  src/responsive-qa: continuous sweep QA (390..1920 step 40 + source boundaries ±1 + seeded random/interval,
      R10 column count, R11 x/w ratio, H1/H2, G6 unexplained jump). baseline: apartmentary + linear/channel.io/roseeskin.
P0-2  responsive-plan.ts:221-243,282 — served switch = authored∩observed DOM switch (per route) > observed-only > policy 801.
      ambiguous여도 swap 관찰 후보가 하나면 serve. ★ 28.8-fast D1 번복 — 착수 전 사용자 승인 받을 것.
P0-3  layout-truth-check.ts:1281 — geometry rule을 적용 interval의 경계±1/중앙에서 검증; residual(:1084) reject 채널화. (P0-4보다 먼저)
P0-4  (a) observer inline style capture (types.ts:477) + specificity/rule order 기록
      (b) layout-inference.ts:5036-5049 winner를 cascade 기반으로 (important/specificity/inline)
      (c) authored-inline-size를 measured funnel 앞으로; authoredMediaHolds(:4726) → interval 교차 banded emit;
          already-recovered gate(:6644) 역전; allowlist(:4582)에 flex-basis. (a)(b) 없이 (c) 금지.

ACCEPT: apartmentary 390–1920 continuous QA (baseline: tmp/wr-resp-audit/sweep/ — P는 1430–1450만 PASS)에서 n000192/n000418/n000528/n000700/n000166/n000623 interval 실패 0,
        390/1440 기존 grade 비악화, smoke-layout-safety / smoke-reconstruction / smoke-multi-observer / smoke-responsive-qa /
        recon-template parity / interaction equivalence 0 failure. assertion 약화 금지.
OUT OF SCOPE: inline style capture, height/inset kinds, carousel model(P1/P2), generated app 수작업 수정.
REPORT: docs/result/ 아래 sub-report + 종합.
```

---

## 부록 A — orchestrator 직접 재확인한 핵심 근거

- `responsive-plan.ts:85-94` `V1_RESPONSIVE_POLICY {mobileMaxPx:800, desktopMinPx:801}`, `:221-243` `provenance:"product-policy"`, `inferredAuthoredPx` evidence.
- apartmentary manifest `config.inferredBreakpoint`: `value 801`, `provenance product-policy`, `inferredAuthoredPx 900`, `inferredAuthoredMethod authored-breakpoint`; `routeBreakpoints[*].breakpoint 900`. `app/app/globals.css:26,32` = `(max-width: 800.98px)` / `(min-width: 801px)`.
- `layout-truth-check.ts:1281` `const width = runtimePage[viewportId].width` (truth width만), `:1084-1091` residual "REPORT ONLY".
- `layout-inference.ts:4525-4531` probe split `entry.width >= options.breakpoint`; `:4582-4590` `AUTHORED_INTENT_PROPERTIES` (width/max-width/min-width/margin-left/right/inline/grid-template-columns); `:6640-6653` measured branch가 답한 node 제외; `:3056` "The authored stylesheet is NOT read".
- `react-attributes.ts:28-30` "no class, no style, no id, no data-*"; `safe-attributes.ts:131-134` data-/class/style skip.
- `observer/types.ts:477-503` `ATTR_WHITELIST`에 `style` 없음.
- `smoke-layout-safety.ts:3765-3790` mobile subtree rules test.

- `observer/types.ts:703-766` `LAYOUT_RULE_PROPERTIES`에 height/inset/padding/flex/grid/gap/transform/aspect-ratio 포함 (font-size/order 없음); `collect-dom.ts:1310-1312` `origin`/`important` 기록.
- `tree-switch.ts:797-815` 순위: observedChangePages 우선 → observedChange → authoredWeight → midpoint 거리.
- manifest `rejectedByTruthCheckByKind {authored-inline-size:36, full-width:1}`, `authoredIntentWidthAutoAdded 498`, `inferredBreakpoint.ambiguous true`.
- `28.8/09-final-visual-audit.md:49` "700/1024/1100 are 0/7" (authored switch 시기).

## 부록 B — 독립 리뷰 반영 내역

fresh-context reviewer(결론 비공개 지시)가 15+ 핵심 주장을 코드·artifact로 재검증. VERIFIED: §1 verdict, policy/evidence 구조, grid authored 미사용, probe split, 2e gate·counter, truth width, inline style 누락, band counter, pipeline CSS byte 복원, counterfactual 파일, Strategy B 세부, HEAD 부재 파일, 05 histogram. 아래 오류를 orchestrator가 코드로 재확인 후 수정함:

| 초안 오류 | 수정 |
|---|---|
| observer whitelist에 height/inset/padding 등 추가 필요 | 이미 포함 — font-size/order만 없음 (§4, §5, §12) |
| `important`/`origin` 메타 추가 필요 | 이미 기록됨, **inference가 무시**하는 것이 문제 (§3, §12, §13) |
| "margin shorthand refuse 2,468" | non-auto longhand의 정당한 refuse. 실제 원인은 `already-recovered` gate (§5, §9, §13, §15) |
| tree-switch 순위 "authored > observed" | observed swap > geometry > authored (§3) |
| "±1 probe 도입 후 D1 전제 붕괴" | ±1 probe는 D1 이전(28.6 C3). D1 사유에 제품 설명성 포함 — 반론 병기 (§11) |
| fr "authored 미사용" 단정 | 2e fallback으로 가능 → PARTIAL (§5) |
| "height relaxation 전무" | text-box relief `height:auto` 존재 (§3, §4, §9) |
| 28.5A "연속 responsive 재현" | 9개 이산 width scrollHeight 일치, JS 제거 조건 (§10.1) |
| "SiteSpec까지 0 손실" | stylesheet 기반만 0; inline 6건 observer 손실 (§11) |
| P0 순서: authored-first가 cascade/inline(P1)보다 앞 | cascade/inline을 P0-4 선행조건으로, VERIFY를 먼저 (§15, §17) |
| QA seed에 run id, B_clone으로 partition, 801–899 cross-tree 대응 | seed 고정, source만 partition, tree-mismatch 구간 영역 비교 (§14) |
| 누락: ambiguous, width:auto 추론 498, authored reject 36, 28.8 0/7, token 분할 비용 | §3, §11, §16 반영 |

## 부록 C — 연속 sweep 결과

§9.1 참조. 상세 표: `responsive-architecture-audit/06-continuous-sweep-source-vs-clone.md`.

---

**이 결론은 historical design intent가 아니라 CURRENT PRODUCTION CODE와 Apartmentary live evidence를 기준으로 한 것이다.**
