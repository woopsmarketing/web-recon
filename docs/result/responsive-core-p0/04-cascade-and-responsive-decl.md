# P0-D/P0-E — Cascade Winner Algorithm + ResponsiveDecl Interval Translation

## 목적

REC-D 스트림은 relconstruction이 "이 노드의 이 property가 이 폭 구간에서 실제로 어떤 authored 값을 따르는가"를 결정하기 위한
순수(pure) 모듈을 제공한다. P0-D는 CSS Cascade 5 규칙(origin/importance/layer/specificity/order + inline style attribute)에
따라 폭 W에서의 cascade 승자를 가리는 `cascade.ts`를, P0-E는 width family(`width, min-width, max-width, margin-left,
margin-right, flex-basis`) 선언들을 media-condition 구간으로 쪼개 구간별 승자를 매핑하는 `ResponsiveDecl`/`plan.ts`를 구현한다.
불확실하면 항상 `ambiguous`로 귀결시키고 "배열의 마지막이 이긴다" 같은 암묵적 추정은 절대 쓰지 않는다.

## 변경 파일 (file:line)

모두 신규 파일, `src/reconstruction/responsive-decl/` 아래(P0-D/E 단독 스트림 REC-D 시점 기준; 이후 REC-I2가 일부 라인을 이동시켰으며 아래는 현재 코드 기준 확인된 위치).

- `src/reconstruction/responsive-decl/types.ts` — `Interval`, `ResponsiveDecl`, `DeclProvenance`, `CascadeCandidate`, `PiecewisePlan`/`PlanPiece`.
- `src/reconstruction/responsive-decl/intervals.ts` — interval 대수(intersect/union/subtract/partition).
- `src/reconstruction/responsive-decl/cascade.ts` — `resolveCascade:148`(alias `resolveCascadeWinner:227`), `compareCascade`, `candidateRelevance`, `importanceTier`.
- `src/reconstruction/responsive-decl/plan.ts` — `WIDTH_FAMILY_PROPERTIES:50`, `WIDTH_FAMILY_INITIAL_VALUES:60`, evidence-text layer 출력(`layer ${JSON.stringify(c.layer)}` at `plan.ts:602`, `@layer`로는 절대 출력하지 않음), `planNodeProperty`, `planNodeWidthFamily`, `pieceAt`.
- `src/reconstruction/responsive-decl/index.ts` — re-export.
- `scripts/smoke-responsive-decl.ts` (`package.json:69` `smoke:responsive-decl`).

## 스키마·데이터 형태

```ts
type Interval = { min: number; max: number };            // [min, max) CSS px, max=Infinity 가능
type DeclProvenance = "authored-sheet" | "authored-inline" | "runtime-inline" | "measured" | "frozen";
interface ResponsiveDecl {
  pageId; viewportId: "desktop" | "mobile"; nodeId; property; value;
  interval: Interval; sourceCondition?: string; provenance: DeclProvenance;
  cascade?: { important: boolean; layerOrder?: number; specificity?: [number,number,number]; ruleOrder?: number; inline?: boolean };
  verifiedAt: number[];   // 검증 단계(REC-V)가 채움
}
```
- `PiecewisePlan`의 각 piece: `winner`(`decl`, `usesVar`, `mergedFrom`, `containsIntegerWidth` 포함) | `no-author-declaration`(`initialValue`, UA margin이면 `frozen` decl) | `ambiguous`(`reasons`).
- `WIDTH_FAMILY_PROPERTIES = ["width","min-width","max-width","margin-left","margin-right","flex-basis"]`, `margin-inline`은 ltr/수평 writing-mode일 때만 물리적 longhand로 매핑(그 외 unknown).

## 알고리즘

### P0-D 캐스케이드 승자 (`resolveCascade`, width W)
1. **관련성(relevance)**: 조건이 W에서 성립하는가(media interval이 W 포함; `supports`는 `supportsMatches` true, 없으면 unknown; container는 unknown). `not-applies`는 후보 제외, `unknown`은 후보 유지.
2. **비교(`compareCascade`)**: importance+origin(normal author < important author; style attribute normal은 모든 normal author를 이기고, style attribute important는 모든 important author를 이김 — Cascade 5 "element-attached styles") → layer(normal: unlayered > 나중 레이어 > 이전 레이어, important: 반대) → specificity → ruleOrder(나중이 이김).
3. `possible` 집합(반드시 지는 게 확정되지 않은 후보) 중 `possible.length===1 && possibleApplies.length===1`이면 그 값으로 확정(`resolved`), 값이 비어있으면 `ambiguous`(`value-unknown:...`).
4. 여럿이 남아도 모든 후보의 정규화된 값이 동일하면 `resolved`(`tieSameValue:true`)로 확정.
5. relevance가 unknown인 후보가 승패를 좌우할 수 있으면 `relevance-unknown:...` 이유로 `ambiguous`. 메타데이터 부족(specificity/ruleOrder/layerOrder 없음, 또는 `origin:"fetched"`와 cssom이 sheetIndex 없이 섞임)도 결정 불가면 `ambiguous`.

### P0-E ResponsiveDecl / 구간 분할 (`plan.ts`)
1. `mediaToIntervals`가 `@media` 조건을 screen-적용 구간으로 변환. `print`→`not-screen`(적용 안 함). `hover`/`orientation`/`prefers-*`/파서가 못 다루는 중첩 group → 그 alternative의 폭 범위 전체에서 **unknown**(계약서 표현 "적용 안 함"과 달리 실제로는 "적용 여부 모름"을 채택 — 그 선언이 이길 가능성이 있을 때만 결과를 막음). `not`/미지원/파싱 불가 조건은 임의 폭에서 적용 가능.
2. `partitionInterval(served, edges)`로 노드가 커버하는 served interval을 후보 조건들의 경계로 쪼갠 뒤, 각 sub-interval에서 `resolveCascade`를 호출해 승자를 매긴다.
3. **증거 병합**: authoredLayout(sheet) + inlineStyle(런타임, truth 폭 기준). inline provenance class별 처리: `initial-static`→전체 구간 element-attached 선언으로 사용, `initial-mutated`→런타임 값을 element-attached로 사용(브라우저 실측 신뢰), `runtime-added`(비변동)도 element-attached로 사용, `runtime-responsive` 또는 변동하는 `unknown`→해당 property는 **ambiguous**(증거는 유지, P0에서는 모델링 안 함).
4. **"no-author-declaration" 처리**: 기본은 property initial 값. 예외: 대체 요소(img/video/canvas/iframe/svg/object/embed/input/select/textarea/table/td/th + REC-I2가 추가한 audio/meter/progress)는 width/min/max가 `ambiguous`; margin이 truth에서 computed≠0이고 author 선언 없음 → UA/presentational로 간주해 해당 sub-interval에 truth computed 값을 `frozen` provenance 상수로 사용.
5. **캡/truncation**: 구 아티팩트(ruleOrder 없음)는 truncation 있으면 무조건 ambiguous. 신 아티팩트는 8/96 캡을 property별로 확인.
6. `grid-template-columns`는 P0-E 범위 밖 — 기존 grid-track 모듈이 계속 담당.

## 테스트 (suite + trailer)

- `npm run smoke:responsive-decl` → **209/209 checks passed** (브리프 요구 ≥120 초과 달성).
- `tsc --noEmit -p .` → 파일 단위 0 errors, repo 전체 0 errors.
- Mutation spot-check: layer importance flip, fetched-order guard 각각 정확히 체크 1개만 깨짐(테스트 민감도 확인).

## 한계·리스크

- 필드명(`sheetIndex`, `ruleOrder`, `specificity`, `layerOrder`, `supportsMatches`, node `inlineStyle`/`inlineStyleProvenance`)은 OBS 스트림 산출물 형태를 그대로 가정 — 이름이 바뀌면 로컬 인터페이스 갱신 필요(REC-D 시점엔 아직 TODO 마커로 표시돼 있었음, 이후 REC-I2가 실제 타입으로 교체).
- style attribute가 truth 폭이 아닌 폭에서만 존재하면 planner에 도달하지 않음(P0-C의 한계와 동일 원인).
- value 승인(admission)과 `var()` 해석은 `plan.ts`가 직접 하지 않고 `admit` hook으로 REC-I가 주입.
- 구 아티팩트에서 `evidence.inlineStyle`이 `absent-or-not-captured`로 읽히는 경우, `evidence.cascadeMetadata`와 함께 판단해 plan 제공 여부를 결정해야 함(byte-identical 보장 규칙, C2.5).
