# P0-C — Inline Style Provenance (document-response.html + runtime inline + correspondence)

## 목적

기존 observer는 `page.content()`(스크립트 실행 후 DOM 직렬화)만 보관해, "서버가 최초로 내려준 HTML의 inline style"과
"런타임에 JS가 추가/변경한 inline style"을 구분할 수 없었다. 이 구분이 없으면 REC-D/REC-I 단계에서 authored 선언과 JS 부작용을
같은 것으로 오인해 responsive 규칙을 잘못 소유(ownership)시킬 위험이 있다. P0-C는 (1) 내비게이션 응답 원문을 그대로 캡처하고,
(2) 런타임 inline 선언을 요소 레코드에 별도로 남기고, (3) 초기 문서와 런타임 요소를 구조적으로 대응시켜 property별 provenance
클래스를 매기되 대응이 불확실하면 **절대 추측하지 않고** `unknown`으로 명시한다.

## 변경 파일 (file:line)

- `src/observer/navigate-document.ts:88` `navigateMainDocumentCapturingBody` — `page.goto`가 이미 반환하는 Response에서 본문을 1회만 읽음(2차 HTTP 요청 없음), 최종(리다이렉트 이후) 성공 응답만 대상, non-2xx→`unavailable`, content-type 게이트, `MAX_DOCUMENT_RESPONSE_BYTES`(8MB, `navigate-document.ts:7,159`) 캡, sha256, charset 디코딩.
- `src/observer/observe-page.ts:1296` 부근 — `navigateMainDocumentCapturingBody` 호출, `initialDocument.status !== "captured"`일 때 로그.
- `src/observer/store.ts:~190` — `document-response.html` 파일 기록, `sizes.documentResponseBytes`(viewportTotalBytes에 합산).
- `src/observer/collect-dom.ts:2385` 부근 — 런타임 inline 캡처(`RUNTIME INLINE STYLE` 주석 블록). `!subtreeMode && maxInlineStyleDecls > 0`일 때만 동작(page mode 전용, bounded-subtree capture는 기존 형태 유지).
- `src/observer/inline-provenance.ts` (신규, pure module) — `parseStyleText:121`, `normalizeStyleValue:166`, `stylePropertiesRelated:223`, `computeInlineStyleProvenance:382`.
- `src/sitespec/compile-viewport.ts:313`, `src/sitespec/compile-page.ts:443` — SiteSpec carry-through; `compile-page.ts:798` 부근에서 provenance 계산 호출.

## 스키마·데이터 형태

- `ViewportObservation.initialDocument?`:
  `{ status: "captured"|"unavailable"|"too-large"|"not-html"|"error", reason?, url?, httpStatus?, contentType?, bytes?, sha256?, file?: "document-response.html" }`
- `RawElement.inlineStyle` / `ElementObservation.inlineStyle` (요소에 비어있지 않은 `style` 속성이 있을 때만):
  `{ decls: Array<{ property, value, important?: true }>, raw?: string(≤2000자), truncated?: true }` — `el.style` 순회(longhand 전개, `getPropertyValue`/`getPropertyPriority`)로 수집, 전체 property 보존(레이아웃 한정 아님), 요소당 64 decl 캡(`MAX_INLINE_STYLE_DECLS`). `safe-attributes.ts`는 여전히 `style` attribute를 attributes bag에서 drop — inline 정보는 별도 채널로만 흐른다.
- `LayoutProbeWidth.s?: (number|-1)[]` — probe별 문자열 테이블 `inlineStyleTable: string[]`(정규화된 style 텍스트) 인덱스, -1=속성 없음/disconnected.
- `InlineStyleProvenance`:
  ```
  { correspondence: "matched" | "ambiguous" | "no-initial-document" | "no-initial-node",
    byProperty: Record<property, {
      class: "initial-static" | "initial-mutated" | "runtime-added" | "runtime-responsive" | "unknown",
      initialValue?: string, runtimeValue: string, variesAcrossWidths: boolean }>,
    widthEvidence?: "probe" | "absent", reason?: string }
  ```
- Viewport 요약: `inlineStyleProvenanceCounts?: { elements, declarations, correspondence{}, byClass{} }`.

## 알고리즘

1. **초기 문서 캡처**: `page.goto`가 준 Response에서 최종 성공 응답 1회만, 바이트 그대로(디코딩 전) 읽고 8MB 캡을 적용 후 charset 디코딩. `page.content()`는 절대 초기 증거로 쓰지 않는다.
2. **런타임 inline 수집**: `el.style` 순회(CSSOM이 이미 longhand로 전개), page mode에서만, 요소당 64 decl 캡, truncation은 `inlineStyleElements/Decls/Truncated` 카운터로 집계.
3. **초기↔런타임 대응(correspondence)**: parse5로 파싱한 `document-response.html`과 런타임 요소 레코드(태그/부모 체인/attributes 포함 class·id/inlineStyle)를 구조 경로(`<body>` 또는 `<html>`부터의 child-index path, observer와 동일한 SKIP_TAGS 스킵)로 먼저 매칭. 경로가 안 풀리거나 보강 신호(id 동일, class-token Jaccard≥0.5, 동일 src/href, 동일 style 텍스트, 동일 직계 텍스트 — **모두 POSITIVE-ONLY 신호**, 중복 id는 신호로 안 씀)가 실패하거나 두 후보가 동률이면 → **매칭 안 함**(`ambiguous`/`no-initial-node`), 절대 추측하지 않음.
4. **분류 우선순위**: probe `s` 배열 기준 폭 간 값이 달라지면 `runtime-responsive`; 아니면 초기 문서에 동일 property·동일 값이면 `initial-static`, 동일 property·다른 값이면 `initial-mutated`, 초기 문서에 property 자체가 없으면 `runtime-added`; correspondence가 matched가 아니면 `unknown`. shorthand는 loose 정규화 + box-shorthand 전개만 지원, 전개 불가한 shorthand(`flex: 1` 등)는 `initial-mutated`로 처리.
5. **폭 증거 없음**: 해당 노드에 probe 정렬 정보가 없으면 `unknown` + `widthEvidence:"absent"`(변동 없음을 증명하지 못했다는 뜻이지 변동 있다는 뜻이 아님).

## Cascade metadata 캡처 + truncation 정책 (연계, C1.5)

- `MatchedLayoutRule`에 `sheetIndex, ruleOrder(전역 단조증가, import는 그 자리에 전개), specificity:[a,b,c], layerOrder, supportsMatches` 추가. Specificity는 Selectors-4 규칙(`:where()`=0, `:is()/:not()/:has()`=인자 중 최대)을 page.evaluate 내부에 전부 인라인 구현.
- 요소×property당 매치 rule을 전부 수집 후 cascade 우선순위(important > layer 우선순위 > specificity > ruleOrder) 내림차순으로 `MAX_MATCHED_RULES_PER_PROPERTY=8`, 요소 전체 `MAX_MATCHED_RULES_PER_ELEMENT=96`까지만 유지. 출력 배열 순서는 ruleOrder 오름차순(기존 소비자 호환). 초과분은 `layoutRulesTruncated`(요소별 boolean, 카운터명은 Matched/Kept로 대체) + 커버리지 총계로 기록.
- 익명 레이어는 `(anonymous-N)`으로 명명하며, 이 값은 유효한 CSS ident가 아니므로 `@layer` 규칙 생성 시 절대 그대로 쓰지 않는다(`responsive-decl/plan.ts:574`에서 evidence 텍스트로만 출력).

## 테스트 (suite + trailer)

- `npx tsx scripts/smoke-multi-observer.ts` → **380/380 checks passed** (baseline 318/318, +62).
- `npx tsx scripts/smoke-sitespec.ts` → **501/501 checks passed** (baseline 474/474, +27).
- 인접 미변경 스위트(회귀 확인): smoke-custom-properties 92/92, smoke-interaction-explorer 108/108.
- `npx tsc --noEmit -p .` → 0 errors.
- 실측 바이트 증가: apartmentary p000001 desktop dom.json 688,111 → 약 1,122,293 bytes(+63%, 96 cap 적용 전 추정치), fixture dom.json 3,586→4,753, layout-probe.json 6,778→7,851.

## 한계·리스크

- 대응(correspondence) 판정은 순수히 구조적(경로+시그니처)이라, 대규모 삽입/재정렬/해시 클래스 churn이 겹치면 `unknown`으로 떨어질 수 있다(구제는 QA 스트림의 anchored-drift가 별도로 처리).
- style attribute가 truth 폭이 아닌 다른 폭에서만 존재하는 경우, 그 증거는 planner에 도달하지 못한다(REC-D는 truth-width inline + `byProperty`의 variesAcrossWidths만 사용).
- Bisection(가족 전환 탐지, C1.6)이 probe 루프마다 최대 40 resize+settle 단계(~12s worst case)를 추가.
- Layer order는 layer를 감싼 조건부 `@media`가 실제로 적용되는지는 고려하지 않는다.
- `var()` 치환 대기 중인 inline longhand는 스킵되며 raw 텍스트로만 보존된다.
