# P0-A — Continuous Responsive QA Harness

## 목적

기존 reconstruction-qa는 고정 폭(914/915/916 등) 스냅샷 비교에 머물러 있어, source와 clone이 임의 폭 구간에서 연속적으로
동일한 레이아웃 거동을 보이는지 검증하지 못했다. P0-A는 `src/responsive-qa/continuous/`에 독립 harness를 신설해 (1) 두 사이트의
"family(트리 변형) 경계"를 실측으로 발견하고, (2) 그 경계로 나뉜 구간 안에서 대표 폭을 샘플링하며, (3) source 노드와 clone 노드를
구조적으로 대응시키고, (4) hard check(H1–H8) + relation check(R9–R15) + 연속 거동 클래스(FLUID/FIXED/CENTERED/CAPPED 등)
비교로 route 단위 PASS/FAIL을 판정한다. 이 스트림은 src/reconstruction 파이프라인을 수정하지 않는 순수 QA 레이어다.

## 변경 파일 (file:line)

모두 신규 파일이며 기존 파일은 건드리지 않았다.

- `src/responsive-qa/continuous/types.ts`
- `src/responsive-qa/continuous/seed.ts` — FNV-1a 해시 + mulberry32 PRNG로 결정적 시딩
- `src/responsive-qa/continuous/boundaries.ts` — authored `@media` 파싱, 경계 탐지기, 이분탐색(bisection), 구간 분할(partition)
- `src/responsive-qa/continuous/sampling.ts`
- `src/responsive-qa/continuous/tracked.ts` — SiteSpec/dom.json을 관대하게(lenient) 읽는 리더, 추적 노드 선택, ref 생성
- `src/responsive-qa/continuous/in-page.ts` — 브라우저 컨텍스트에서 실행되는 self-contained evaluate 함수들
- `src/responsive-qa/continuous/session.ts` — 좌우 side당 1회 navigation, 정규화, in-place resize
- `src/responsive-qa/continuous/checks.ts` — H1–H8, R9–R15, variant vote 로직 (`checks.ts:124` H1 시작, `:219` R9, `:225` R10, `:230/:233` R11, `:239` R12, `:249` R13, `:271` R14, `:286` R15)
- `src/responsive-qa/continuous/behavior.ts` — 거동 클래스 fit/compare
- `src/responsive-qa/continuous/verdict.ts`
- `src/responsive-qa/continuous/run-route.ts`, `run.ts`, `json.ts` (정렬된 key로 JSON 직렬화), `index.ts`
- `src/cli-qa-continuous.ts` — CLI 진입점
- `scripts/smoke-continuous-qa.ts` — smoke suite (package.json에 `smoke:continuous-qa` 등록, `package.json:68` 확인)

## 스키마·데이터 형태

- 입력: reconstruction run 디렉터리 + `--site-spec <site-spec.json>` (SiteSpec을 zod `loadSiteSpec`이 아니라 **plain JSON으로 관대하게** 읽음 — 스키마가 동시에 바뀌어도 구 아티팩트가 파싱되도록 하는 의도적 결정).
- 출력: `continuous-qa.json` (route별 `servedSwitchPx` 포함) + route별 `route-<slug>.json`.
- 추적 노드 ref는 구조 경로(path) + 태그/클래스/id 시그니처로 구성되고, follow-up에서 `anc[]`(조상 경로마다 태그/클래스 최대 6토큰/id)가 추가되어 anchored re-resolution에 쓰인다.
- `servedSwitchPx` 해석 순서(`run.ts` `resolveServedSwitch`): route-map `pageBreakpoints[pageId]` → route-map `breakpoint` → manifest `config.routeBreakpoints[pageId].servedSwitch.value` → `config.inferredBreakpoint.servedSwitch.value` → `config.inferredBreakpoint.value`. `routeBreakpoints[].breakpoint`(추론값)는 읽지 않는다.

## 알고리즘

1. **경계 발견(boundaries.ts)**: authored `@media` 조건과 `@container` 경계를 파티션 후보로 삼고, sweep 중 DOM family가 바뀌는 지점을 최대 10단계 이분탐색으로 1px 브래킷까지 좁힌다.
2. **재현성 게이트(follow-up)**: 이분탐색 전에 lo/hi를 다시 측정해 "sweep 판독값과 신선한 판독값이 같은 크기로 jump하는 feature만 투표 가능"하게 pre-screen하고, 브래킷 확정 후에도 lo/hi/lo/hi를 350ms 안정화와 함께 재측정하는 `reproduceBracket`으로 검증한다. 실패한 브래킷은 `noisyFeatures`로만 기록되고 partition/G6에는 들어가지 않는다.
3. **샘플링(sampling.ts)**: 확정된(confirmed) 1px 브래킷만 파티션에 합류하고, 미확정 브래킷은 샘플링 힌트로만 쓰인다.
4. **노드 대응(tracked.ts / in-page.ts)**: 구조 경로 우선 매칭, 실패 시 `resolveAnchored`로 조상 경로마다 ±1 sibling 드리프트(최대 3회)를 허용하는 anchored re-resolution을 시도한다. 두 개의 강한 후보가 있으면 거부(refused), 태그만 일치하면 해시 클래스 변동으로 간주해 유지한다.
5. **검사(checks.ts)**: H1(source scrollWidth>viewport), H2(초과 높이), H3(clip), H4(교차 최소 면적 이하 unverifiable), H5, H7/H8(variant 텍스트 존재 불일치), R9(줄바꿈 수), R10(컬럼 수), R11(x/w 불일치), R12(전체폭 여부), R13(좌우 마진 대칭), R14/R15(상세 relation).
6. **거동 클래스**: FLUID/FIXED/CENTERED/CAPPED 등 폭 변화에 대한 함수적 반응 클래스를 source/clone에 각각 fit한 뒤 비교. FLUID intercept `b`는 W=0이 아니라 구간의 min에서 측정.
7. **G6 / 트리 투표**: 페이지 레벨 트리 투표는 variant별 matched+visible 비율에 0.15 마진을 적용한다.
8. **판정(verdict.ts)**: 위 신호 종합, route 단위 PASS/FAIL을 산출.

## 테스트 (suite + trailer)

- `npm run smoke:continuous-qa` → 최초 **62/62 checks passed**, follow-up(served switch + reproducibility gate + anchored drift) 반영 후 **81/81 checks passed** (약 83s).
- `npx tsc --noEmit -p . | grep -a continuous` → 0 lines.
- 실사이트 dry run: apartmentary `qa:continuous` 41.5s, 434 tracked nodes, FAIL (R11 2015, behavior-class 151/220, R10 102).
- channel.io `/kr/pricing` anchored-drift 적용 전/후: **14/440 → 385/440 matched** (before rec `2026-09-14T10-15-08-780Z`, `--min 1000 --max 1100`), node-samples 2232/2640 matched(84.5%), 34.7s. Route verdict는 여전히 FAIL(R11 2893, behavior-class 257, R13 456) — 매칭 개선이 곧 PASS를 뜻하지 않음.

## 한계·리스크

- Cross-origin stylesheet는 읽을 수 없어 `unreadableSheets`로만 집계.
- 클래스/텍스트가 없는 svg는 corroborate 불가로 unmatched 처리.
- `@container` 경계는 실제 뷰포트 폭이 아님에도 파티션 경계로 취급.
- anchored drift는 depth당 ±1, path당 최대 3회로 한정 — 더 큰 삽입/재정렬/클래스 없는 조상 + 동일 태그 형제 삽입은 여전히 unmatched.
- 재현성 게이트는 실제 브래킷 하나당 6회 추가 측정 비용이 들고, resize 후 500ms 이상 지연되는 전환은 "재현 안 됨"으로 오판될 수 있다.
- 두 side 모두 `isMobile=false`의 데스크톱형 컨텍스트로 in-place resize하므로 UA/touch 전환은 검증 범위 밖.
- 텍스트/CTA 폭의 라인랩 변화는 파티션을 과분할할 수 있어, discontinuity 탐지는 컨테이너 카테고리(a,b,d,e)만 본다.
