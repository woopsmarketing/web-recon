# P0-F/H — Plan Offer, Two-Phase Verification, Ownership CSS Mechanism

## 목적

REC-I2는 REC-D가 만든 piecewise plan(authored 우선 width-family 선언)을 실제로 "소유(ownership)"할 노드를 골라, 기존
measured/frozen 규칙과 충돌 없이 CSS로 발행하는 최종 단계다. 핵심 문제는 (1) authored plan이 truth 폭에서는 맞아 보여도
다른 폭에서 깨질 수 있고, (2) 여러 노드의 plan을 동시에 적용하면 서로 간섭(co-damage)할 수 있다는 것 — 이를 위해 노드
그룹 단위 isolation 렌더링으로 검증하는 2-phase 방식과, 기존 frozen 토큰을 깨지 않으면서 소유 노드만 override하는
`:where(:not(.wr-ow-*))` CSS 분리 기법을 도입한다.

## 변경 파일 (file:line)

- `src/reconstruction/layout-inference.ts` — offer pass: evidence gate, `ownedValueAdmissible`, `ownedPlanContradictions`, `ownedPiecesOf`/`ownedPieceMedia`; `responsive-owned` rule(피스당 1개, 6개 property 모두) + `ownedPlans` emit; `responsiveOwnership` 카운터; authored inline-size fallback이 plan-offered 노드를 skip.
- `src/reconstruction/layout-truth-check.ts` — `judgeOwnedGroupAtWidth:2732`, `verifyOwnedPlanGroups:2782`(phase B), `confirmOwnedForm:3079`.
- `src/reconstruction/generate-app.ts` — phase A(non-owned rules) 이후 phase B 실행; `applyOwnership:237`(export, pure: M에서 owner의 width-family 선언 제거, marker 클래스 추가, `wr-sf` 제거, 토큰 수집); split exact tier 재생성 + confirm 실행; manifest `layout.ownership` 기록(`generate-app.ts:966`); `strictOwnership` 옵션(`:102`, confirm mismatch 있으면 throw, `:536`).
- `src/reconstruction/style-generator.ts` — `ownedWidthFamilyTokens` 분리 로직, `OWNERSHIP_MARKER_ABBR`(`:447`)/`OWNERSHIP_MARKER_CLASSES`(`:457`), 토큰 rule 바로 뒤에 `.wr-stN:where(:not(.wr-ow-x)){p:v}` 삽입(`:551`).
- `src/reconstruction/plan-reconstruction.ts` — `styleInput` 노출.
- `src/reconstruction/types.ts` — manifest `layout.ownership` zod 스키마(optional).
- `src/reconstruction/responsive-decl/{plan,types}.ts` — `widthEvidence:"absent"`→ambiguous, `inlineStyle.truncated`→ambiguous, layer는 evidence 텍스트로만, replaced-element min/max-width 세분화.
- `src/reconstruction/validate-output.ts` — marker 클래스를 dangling-class 검사에서 예외 처리(**브리프 파일 목록 밖의 deviation**, marker가 dangling으로 오탐되지 않게 하기 위해 필요).
- `scripts/smoke-responsive-ownership.ts` (신규, 137 checks, `package.json:70` `smoke:responsive-ownership`).

## 스키마·데이터 형태 — ownership CSS 메커니즘

- OWNED (node, property)에 대해 노드는 marker 클래스 `wr-ow-<abbr>`(w, mnw, mxw, ml, mr, fb)를 기존 클래스 뒤에 추가.
- 그 property를 쓰는 exact tier 토큰마다: `.wr-stNNN:where(:not(.wr-ow-<abbr>)){<prop>:<frozen>}`를 토큰 규칙 바로 뒤에 삽입(specificity (0,1,0) 유지)하고, 원래 `.wr-stNNN{…}`에서는 해당 property를 제거. owner가 없는 토큰은 byte-identical.
- `width`를 소유한 노드는 `wr-sf`(scale-fix?) 클래스를 받지 않음.
- 소유 노드의 responsive tier는 served tree interval의 모든 sub-interval마다 승자 값을 node-scoped rule `[data-wr-page][data-wr-viewport] [data-wr-node]`(specificity (0,3,0))로 발행하며 bounded sub-interval은 기존 `bandMedia`(min inclusive, max exclusive -0.02) 컨벤션으로 `@media`에 wrap. 승자가 "author 선언 없는 initial"인 sub-interval은 아무것도 emit하지 않음(frozen 토큰이 더 이상 새어 들어오지 않으므로 안전).
- Ownership은 width family 6개 property를 **노드 단위로 전부 함께** 소유(measured width rule과 authored margin을 한 노드에 섞는 것을 방지). 기존 measured recovered rule의 width-family 선언은 drop, 다른 선언(height relief 등)은 유지.
- manifest `layout.ownership`: `{ nodesOwned, nodePlansOffered, nodePlansRejected, rejectedBy{reason}, tokensSplit, splitRulesEmitted, cssBytesDelta, ambiguousByReason, provenanceByProperty }`.

## 알고리즘 — Phase B (2단계 검증)

Phase A(비소유 rule)가 끝난 뒤, page × viewport 각각에서 B = M(비소유 결과) + accepted 그룹을 기준으로 owned plan 그룹을 문서 순서로 처리:

1. 한 배치를 함께 렌더링해 전부 통과하면 그 배치는 accept.
2. 혼합 배치는 분리(split): 먼저 실패자만 다시 좁혀서 처리, 그 다음 통과자.
3. 배치 전원이 실패하면 각 그룹을 **단독으로** 렌더링해 재검사(단독으로도 실패해야만 최종 reject). 생존자는 절반씩 나눠 재시도.
4. 이미 accept된 owner가 새 배치 적용으로 자기 predicate를 실패하게 되면 그 배치는 실패로 간주(co-damage 보호).
5. depth 24까지 정착하지 않으면 `non-convergence`로 reject.
6. `confirmOwnedForm`: 검증은 static truth-check harness에서 "overlay 형태"(분리 안 된 토큰 위에 full-coverage node-scoped rule을 덮어씀)로 수행되며, 이는 served interval 전 구간에서 geometrically owned form과 동일하다고 간주. 실제 split(owned) 형태로 재생성한 뒤 `confirmOwnedForm`이 두 형태가 실제로 일치하는지 재확인(불일치는 `ownedFormMismatches`로 기록, `strictOwnership:true`면 throw).

**초기 round-based 버전**은 `acceptedJointRegressions` 490을 냈으나, partition + accepted-owner guard 버전은 **0**으로 개선(REC-I2가 명시한 설계 반복 사유).

## 테스트 (suite + trailer)

| Suite | 결과 |
|---|---|
| smoke-responsive-ownership | **137/137** |
| smoke-responsive-decl | **209/209** |
| smoke-layout-safety | **566/566** |
| smoke-reconstruction | **247/247** |
| `tsc --noEmit`(repo 전체) | clean |

- ownership smoke는 브리프 요구 케이스 전부 + widthEvidence absent, breakpointByPageId, verification disabled, missing styleInput, accepted-group damage, confirm의 조작된(fabricated) mismatch 보고까지 커버. 기존 assertion 변경 없음.

## Apartmentary 신규 P0 spec 실측 수치 (RECI2-report)

- Pinned spec `11-17-22-331Z` → run `2026-09-15T03-26-20-831Z`, exit 0, wall **1344s**(phase B ≈614s, p000005 mobile 단독 283s).
- 대상 6224건(node-not-in-layout 961 제외).
- `nodePlansOffered 4914` → **owned(accepted) 4425**, rejected 489 (truth 391, interval-sample 64, co-damage 34).
- 미제공(ambiguous 336, no-interval-evidence 974): width inline-runtime-responsive 157, replaced width 134, css-wide 45, max-width runtime 42, margin-right runtime 13. contradicted 0.
- Rule: offered 4947, shipped 4442.
- Ownership 통계: tokensSplit 803, splitRulesEmitted 4818, tokenCountDelta 0, `cssBytesDelta +179,069`(exact tier), recovered tier −252,407 bytes, markerBytes +241,569, measured decl 2615개(2612 rule) drop, wr-sf 301개 제거, grid-track 충돌 0.
- 검증: 127 widths, depth 12, 6905 isolated render, converged, `acceptedJointRegressions 0`.
- Owned-form confirm: 34,427 group×width 샘플, **mismatch 0**.
- Provenance는 대부분 `initial`; authored-sheet 유래는 margins ≈1387, flex-basis 477, width 298.
- 참고로 pinned **구 spec** `04-58-45-517Z` → run `2026-09-15T02-29-07-942Z`(wall 219s)는 `nodePlansOffered 0`(observer-evidence-absent 6446), `cssBytesDelta 0` — 구 아티팩트는 새 증거가 없으므로 byte-identical하게 동작함을 실측 확인(exact tier가 REC-V run `10-41-56-986Z`와 동일).

## 한계·리스크

- **비용**: apartmentary에서 ownership이 phase B + confirm에 약 600s를 추가. isolation render가 지배적 비용.
- **Residual audit 미반영**: ownership 그룹 적용 상태로 residual audit이 재렌더링되지 않음.
- **CORS로 못 읽는 stylesheet**: `initial` 값이 실제로는 증명된 것처럼 보일 위험 — truth-contradiction 체크와 렌더 결과만이 유일한 방어선.
- **Tolerance**: probe 폭에서만 acceptance가 확인되며, probe 사이 구간은 미검증.
- **Byte 비용**: exact tier + marker byte가 약 421KB 증가, recovered tier에서 252KB 절감 — 순증가.
