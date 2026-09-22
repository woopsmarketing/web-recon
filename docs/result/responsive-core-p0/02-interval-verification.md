# P0-B — Interval-Sample Verification (layout-truth-check)

## 목적

기존 truth-check는 truth width(단일 폭) + band 폭에서만 rule을 검증했기 때문에, 두 폭 사이 구간에서만 어긋나는(responsive하게
잘못된) rule이 그대로 통과할 수 있었다. P0-B는 rule이 커버하는 served interval 전체에 걸쳐 실제로 관측된 source probe box와
clone 렌더 결과를 비교하는 interval-sample 검증 단계를 `layout-truth-check.ts`에 추가해, "구간 안에서는 맞다고 가정"하던 부분을
실측 기반 거부(reject) 대상으로 바꾼다.

## 변경 파일 (file:line)

- `src/reconstruction/layout-inference.ts` — `RecoveredLayoutRule`에 optional `servedInterval`, `samples` 추가(witness에도 `samples`); `ServedInterval`, `IntervalSample`, `ruleServedInterval`, `probeSamplesInInterval`, `attachIntervalSamples` 신규; `inferLayoutRules`가 각 page loop 끝에서 1회 attach 호출.
- `src/reconstruction/layout-truth-check.ts`
  - `selectIntervalSamples` — `layout-truth-check.ts:222`
  - `INTERVAL_SAMPLE_MAX_WIDTHS_PER_PASS = 16` — `layout-truth-check.ts:289`
  - `capIntervalSampleWidths` — `layout-truth-check.ts:300`
  - `intervalSampleTolerancePx` — `layout-truth-check.ts:335`
  - 그 외 `intervalSampleError`, `intervalSampleRegressed`, `hasIntervalSampleEvidence` 등 selection/판정 helper와 interval 검증 스테이지, counters, `intervalRejections`.
- `src/reconstruction/generate-app.ts` — manifest counter 6개(`truthCheckConverged` 뒤에 추가).
- `src/reconstruction/types.ts` — manifest `layout` 스키마에 optional zod 필드 6개 추가(추가만, deviation으로 보고됨: 없으면 zod가 counter를 strip함).
- `scripts/smoke-layout-safety.ts` — Part 12a/12b 신규 + 기존 체크 2개 추가, 이후 amendment에서 Part 15/15b는 REC-I1 소관이나 interval-sample 관련 8개 체크 추가(547/547).

## 스키마·데이터 형태

```
samples?: Array<{ width: number; x: number; w: number; v: 0|1 }>  // node.probe에서 그대로 읽음, servedInterval 내 모든 probe width, 오름차순
servedInterval?: { min: number; max: number }  // [min, max); desktop [bp,∞) 또는 mobile [0,bp), band와 교집합
```
- `selectIntervalSamples(probeWidths, interval, truthWidth?)` 반환: `{interval, widths, requestedPositions[{position,target}], probedPositions[{position,target,width,distancePx}], unprobed[{position,target}], allProbeWidthsInInterval[]}`.
  - position 종류: `lo | lo+1 | mid | hi-1 | truth`. 동률은 더 좁은 폭 우선. open interval의 `hi-1`은 가장 넓은 probe width. `truth`는 probe width와 정확히 일치해야 함.
- `capIntervalSampleWidths(positional, all, cap=16)`: positional pick 우선 확보, 초과 시 narrowest-first + largest-gap 순으로 축소; 나머지는 largest-gap으로 채움. pass(=page × viewport)당 적용.

## 알고리즘

1. Truth-width 라운드와 band loop가 끝난 뒤, `samples`를 가진 살아남은 geometry rule에 대해서만 interval 스테이지를 실행.
2. **Tolerance**: `intervalSampleTolerancePx(width) = max(4, 0.005·W)`.
3. **거부 조건**: 선택된 sample 중 어느 하나에서 `errWith > max(4px, 0.5%·W) AND errWith > errWithout + 0.5px`이면 거부. `err = max(|Δx|, |Δw|)`. source `v=0`이면 undefined(스킵), clone box 부재/미배치는 `+∞`.
4. **Sweep**: 모든 샘플 대상 rule을 전체 폭에 대해 반복 검사하며, 한 sweep에서 아무것도 거부되지 않을 때까지 `MAX_ROUNDS`까지 반복. 수렴하지 않으면 남은 rule은 unverifiable로 거부.
5. **페이지 재사용**: truth page 및 계획된 폭의 band/audit page를 열어둔 채 재사용, 누락 폭만 1회 로드.
6. **Amendment(전 probe width 검증)**: 원래는 positional pick만 검증했으나, "served interval 내 모든 probe width에서 검증"으로 확장 — positional picks ∪ `allProbeWidthsInInterval`을 pass의 capped width set과 교집합.
7. `applyCandidateCss`는 동일 CSS 재적용 시 no-op화(성능).
8. 좌표계는 `getBoundingClientRect().x` viewport-relative, scroll 0에서 두 경로 동일하게 확인됨(정규화 불필요).

## 테스트 (suite + trailer)

- `smoke-layout-safety`: 최초 **539/539 PASS**(512 baseline+27), amendment 후 **547/547 PASS**(+8).
- `smoke-reconstruction`: **247/247 PASS** (양쪽 시점 모두).
- 브리프가 지정한 폭-카운트 assertion(`:848, :2651-2668, :4639-4643, :7974-7976`)은 fixture에 `samples`가 없어 수정 불필요 — semantics 불변을 새 체크로 명시.
- **apartmentary 실측 (`--skip-build`, pinned spec)**:
  - before `2026-09-14T10-13-00-400Z`: acceptedRules 3105.
  - positional-only after `2026-09-14T10-36-07-134Z`: acceptedRules **3067**, rejectedAtIntervalSample 38 (full-width 24, authored-inline-size 9, percentage-width 5), truth-check elapsedMs 118,627 (+18%).
  - all-widths after `2026-09-14T10-41-56-986Z`: acceptedRules **2905**, rejectedAtIntervalSample **200** (full-width 114, authored-inline-size 72, damage-clamped-width 9, percentage-width 5), extra page loads(`intervalSamplesRendered`) 42, intervalSamplesChecked 23023, unprobed 0, truth-check elapsedMs **153,829**(+53% vs before). `rejectedUnverifiable`=0, `converged`=true.

## 한계·리스크

- 같은 측정에서 함께 regress한 rule은 같이 거부됨(기존 truth round와 동일한 성질) — 올바른 자식 rule이 잘못된 부모와 함께 떨어질 수 있음.
- pass당 최대 약 11개 page가 동시에 열려 있을 수 있음(리소스 비용).
- probe grid 간격이 곧 검증 해상도의 한계(예: apartmentary 900~1440 사이는 899만 선택 가능했던 초기 버전).
- **Residual audit 악화 실측**: interval 거부가 늘면서 offscreen count가 415 → 487로 증가. 거부된 rule은 frozen 1440 geometry로 되돌아가며, 거부 자체가 중립적이지 않음 — REC-D/REC-I ownership이 이 거부된 rule을 대체해야 실효(단순 거부만으로는 개선 안 됨).
- apartmentary 기준 1회 실행 비용 약 +35s(전체 amendment 반영 시 이전 대비 +53%).
