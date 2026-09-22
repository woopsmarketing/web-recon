# P0-G — Evidence-Graded Served Switch

## 목적

V1 정책은 breakpoint(모바일↔데스크톱 트리 전환 폭)를 추론값 하나(또는 하드코딩 801)로만 다뤘다. P0-G는 "실제로 서버가
서빙하는 전환 폭"을 증거 등급(operator override > authored+observed > observed-only > product-policy fallback 801)으로
매겨 site/route 단위로 기록하고, downstream(QA breakpoint probe, route 제한 표기)이 추론값이 아니라 서빙값을 쓰도록 이어
붙인다.

## 변경 파일 (file:line)

- `src/reconstruction/tree-switch.ts`
  - `collectObservedOnlySwitches:575` — grade-3 evidence collector, 타입 `ObservedOnlyReport`, `ObservedOnlyCandidate`, `ObservedBisectionEvidence`.
  - `PageTreeSwitch.observedOnly:409`, `TreeSwitchDecision.observedOnly:496`; 실제 채움은 `:1138`(단일 page 경로), `:1214`/`:1295`(pages 경로).
  - `PageTreeSwitch.changeWidths`(follow-up) — route 자신이 변화를 관측한 모든 폭(family-swap 우선, 없으면 geometry-change; observed-only bisection 폭 포함). 기존 `unservedChangeWidths`는 "추론 폭 대비"라는 의미를 유지.
- `src/reconstruction/responsive-plan.ts`
  - site grade 계산 `:271`(`gradeSwitch(decision.chosen, decision.observedOnly, ...)`), route grade `:335`(`gradeSwitch(page.ownDecision ? page.chosen : undefined, page.observedOnly, ...)`).
  - `gradeSwitch:409` — 등급 판정 helper.
  - operator override에 `servedSwitch` 필드 부여(`:225`).
  - route record가 served width 기준으로 재구성(follow-up, `:366` 부근): `unservedChangeWidths = changeWidths − servedSwitch.value`, `variantTreeNotObserved`, `differsFromSite`; 구 추론 기준값은 `inferredUnservedChangeWidths`/`inferredDiffersFromSite`로 보존.
- `src/reconstruction/types.ts`
  - `ServedSwitchGradeSchema`, `ServedSwitchBisectionSchema`, `ServedSwitchSchema`(:420 부근).
  - `BreakpointSpec.provenance`/`method`에 `"authored-observed" | "observed-only"` 추가.
  - `BreakpointSpec.servedSwitch`(:571), `PageBreakpointRecord.servedSwitch`(:626) optional; `inferredUnservedChangeWidths`/`inferredDiffersFromSite`도 optional(:597, :633).
- `src/reconstruction-qa/capture-clone.ts` — `planBreakpointProbeTargets:181`(route마다 served−1/served/served+1 계산, 우선순위: route-map `pageBreakpoints` → manifest `config.inferredBreakpoint.value` → `BREAKPOINT_PROBE_WIDTHS`는 카운트되는 fallback), `expectedVariantAt:217`, `probeBreakpoint:242`(target 인자 수용, 컨벤션에 맞는 variant 요구: 서빙 폭 미만=mobile, 이상=desktop).
- `src/reconstruction-qa/run-qa.ts` — `<appDir>/reconstruction-data/route-map.json`을 읽어 첫 route가 아니라 **모든 route**를 probe; `QaRunResult.breakpointProbe {targets, fallbackTargets, results, failures}`, manifest counter 4개(`breakpointProbeTargets/FallbackTargets/Samples/Failures`) 추가.
- `src/reconstruction-qa/types.ts` — `BREAKPOINT_PROBE_WIDTHS:170 = [914, 915, 916]`는 상수 유지, 문서를 "fallback-only"로 갱신.
- `scripts/smoke-layout-safety.ts` — Part 15b `gradedServedSwitchChecks`(:7081, 16 checks), 기존 Part 15/16 체크가 grade도 함께 assert하도록 확장.
- `scripts/smoke-reconstruction.ts` — 정책 체크 3개가 grade도 assert.
- `scripts/smoke-reconstruction-qa.ts` — breakpoint probe 관련 신규 5 checks(pure 3 + runtime 2).

## 스키마·데이터 형태

- `servedSwitch: { value, grade, provenance, evidence{...}, reason }` — manifest에 site/route 단위로 기록.
- Grade enum: `operator-override` / `authored-observed` / `authored-observed` / `observed-only` / `product-policy`(개념상 4등급, 최우선이 override).
- `changeWidths`(route 자체 관측 변화 폭 목록) vs `unservedChangeWidths`(served 기준 미서빙 변화 폭) vs `inferredUnservedChangeWidths`(구버전, 추론 기준) — 세 필드가 병존.

## 알고리즘 — 등급 산정

1. **operator-override**: `--breakpoint` 지정 시 사이트 전체 적용, `byPageId` 비움. 변경 없음(V1과 동일).
2. **authored-observed**: 랭킹 1위 후보가 `authoredWeight > 0 && familyChangeObserved`(관측된 트리 전환이 authored 후보와 딱 맞물림). 모호한 후보 리스트가 있어도 관측된 스왑이 이미 우선 랭크되므로 이 등급을 막지 않는다.
3. **observed-only**: `familySwitchBisections`(C1.6) 유래. `layoutProbe`/`layoutProbeMobile` 둘 다 읽고 어느 probe가 관측했는지 기록. bisection이 (a) converged, (b) bracket ≤1px, (c) `familyChangeVerdict==="changed"`, (d) `hi`가 (mobile, desktop] 범위 안일 때만 유효. `hi`의 ±1px 안에 authored 후보가 있으면 이 등급에서 제외(site 레벨은 집계로, route 레벨은 그 route 자체 히스토그램으로). 랭킹은 family-change 크기 → page 수 → midpoint까지 거리 → 최소 px 순, 모든 제외 사유는 reason 텍스트에 카운트.
4. **product-policy**: 801 클램프, grade-2/3 증거가 전혀 없을 때만 fallback.
5. **Site 값**: 최고 등급(2가 3보다 항상 우선, 크기 무관). **Route**: 자체 grade-2/3 결정이 있으면 자기 값을 갖고 site와 다르면 `byPageId`에 등재, 그 외는 site 값을 상속(`inherited:true`).

## Follow-up 1 — route 제한을 served 기준으로 재기술

`unservedChangeWidths`/`variantTreeNotObserved`/`differsFromSite`가 이제 **served switch 값** 기준으로 계산되도록 재정의(구 추론 기준값은 `inferred*`로 이름을 바꿔 보존, byte-identical 하위호환).

## Follow-up 2 — breakpoint probe가 served switch를 타깃

`BREAKPOINT_PROBE_WIDTHS`(914/915/916)는 served 값(641/900/992 등)과 무관한 고정값이라 사실상 무의미했음. `planBreakpointProbeTargets`가 route별 served±1을 계산해 `probeBreakpoint`에 넘기고, 값이 없을 때만 옛 상수를 fallback으로 카운트하며 사용.

## 테스트 (suite + trailer)

- `smoke-layout-safety.ts`: 최초 **563/563**, follow-up 반영 후 **566/566 checks passed** / PASS / exit 0.
- `smoke-reconstruction.ts`: **247/247 checks passed** / OK / exit 0.
- `smoke-reconstruction-qa.ts`(follow-up 2): **222/222 checks passed** / exit 0(로컬 fixture server만 사용, 네트워크 불필요).
- `tsc`: 모든 대상 파일 0 errors.
- Assertion 삭제/약화 없음.

## Per-site served 값 (pinned spec, `--plan-only`)

| site | served | grade | routes |
|---|---|---|---|
| apartmentary `2026-09-14T04-58-45-517Z` | 900 | authored-observed | p000001/2/6는 자기 값 900, p000003/4/5/7은 상속; `byPageId` 비어있음 |
| linear `2026-09-04T23-34-15-786Z` | 641 | authored-observed | p000001 자기 641, p000003 자기 **1025**(`byPageId`에 등재), p000002/4는 641 상속 |
| channel.io `2026-09-08T16-33-17-049Z` | 992 | authored-observed | 5개 route 전부 자기 992 |
| roseeskin `2026-09-08T16-53-43-839Z` | 992 | authored-observed | 6개 route 전부 자기 992 |

served-width 기준 route 제한(follow-up 1 반영치): apartmentary 없음; linear p000001 [929], p000002 [1025](구 [641]에서 변경), p000003 [], p000004 [1025], `variantTreeNotObserved` = {929, 1025}; channel.io 768; roseeskin 1200.

## 한계·리스크

- 네 사이트 pinned spec 모두 bisection이 발생하지 않아 grade 3(observed-only)이 실측 데이터로 트리거되지 않음(코드 경로는 smoke로만 검증).
- `unservedChangeWidths`(follow-up 이전 의미)와 `differsFromSite`는 원래 추론값 기준이었고, 상속 route가 추론값과 다른 값을 서빙받는 경우(예: linear p000002: 추론 1025, 서빙 641)에만 차이가 드러남 — grade 3 상속 route에도 동일하게 적용됨.
- `generate-app.ts`는 `config.servedSwitch`를 쓰지 않음; `manifestHintBoundaries`(QA 스트림)가 그 필드를 읽지만 아무도 채우지 않음 — 실제 served 값은 `config.inferredBreakpoint.servedSwitch`와 `config.routeBreakpoints[].servedSwitch.value`에 있음.
- breakpoint probe가 route당 3페이지 로드로 바뀌어(구: 전체 1회) route 많은 사이트에서 QA 시간 증가.
- 더 엄격해진 variant 체크가 기존에 숨겨져 있던 실제 `inferred-breakpoint-runtime-defect`를 드러낼 수 있음.
- REC-I1 검증은 `--plan-only`로만 수행 — 생성된 app을 실제로 빌드/브라우저 실행하지는 않음(핀된 4개 사이트 모두).
