# BoostChat portfolio matching — boost-interior-demo 데이터 준비도 (READ-ONLY)

- 날짜: 2026-09-21
- 요구사항 원문: `00-requirement.txt` (`prompt2` 사본)
- 성격: READ-ONLY 조사. **코드·데이터 수정 없음.** 분석 스크립트는 세션 scratchpad에서만 실행했고, 출력은 `evidence/`에 두었다.
- 입력: `data/sites/boost-interior-demo/content/projects.json` (8건, `projects@1`, `origin: synthetic-fixture`), `categories.json`
- 참조 코드: `platform/content/schema.ts` (ProjectSchema), `platform/content/project-filter.ts` (ProjectFilter). 입력 해시: `evidence/input-hashes.txt`

## 판정

**DATA_READINESS = PARTIAL.** 크기·범위·카테고리는 준비되어 있다. 스타일은 어휘 정규화가 필요하고, 예산은 준비되어 있지 않다.

| 질의 | 판정 |
|---|---|
| "34평 아파트인데 깔끔한 화이트톤" | **READY** |
| "24평에 2천만원 정도" | **NOT_READY** (평형 축만 READY) |
| "30평대 모던한 느낌" | **PARTIAL** |
| "욕실이랑 주방만 하고 싶어요" | **READY** |

전제: 데이터 전체가 합성 데모 fixture(8건, 버킷당 1~3건)다. 아래 결론은 **데이터 형태의 준비도**이고, 실제 고객 포트폴리오의 분포·품질은 별도로 봐야 한다.

## 핵심 발견

1. **구조화 필드의 채움률은 높다.** 요청 필드 중 pricePerArea(6/8)를 뺀 전부가 8/8이다. area는 단위 pyeong, basis supply로 100% 일관되고, 숫자 이상치가 없다. → `01`
2. **평형 질의는 안전하고 ㎡ 질의는 안전하지 않다.** 필터 레코드가 area.basis를 버리고(`project-filter.ts:74`) 공급/전용 구분 없이 400/121로 환산한다. "84㎡(전용)"를 넣으면 20평대로 떨어져 34평형 사례를 놓친다. 전용면적은 bi-01 body에만 있다. → `02`
3. **가격은 비교용으로만 쓸 수 있다.** 단위(KRW/pyeong)는 일관되지만 부분 공사 2건에 값이 없다(0/2). 총액 필드와 포함 범위도 없다. 평당가 × 평수는 추정치일 뿐이다. 카테고리를 넘는 비교(styling 160만 vs remodel 240만~320만)는 불가능하다. → `02`
4. **어휘가 가장 큰 격차다.** → `03`
   - scope는 20종이다. 세분도가 제각각이고(욕실 vs 공용/안방 욕실), `·` 복합 토큰이 있고, "복도 수납"과 "복도·수납"처럼 구분자가 다르다. gallery 그룹명과도 어휘가 다르다.
   - keywords는 facet이 섞여 있고(색·스타일·기능·소재) 태깅이 불완전하다(bi-05 웜 화이트인데 화이트 태그 없음, bi-01 인용에 "우드 포인트"가 있는데 태그 없음). `모던`은 어느 텍스트에도 근거가 없다.
5. **기존 ProjectFilter를 NL 경로로 쓸 때 조심할 점이 두 가지 있다.** → `03`, `04`
   - 어휘 밖 값은 조용히 버려진다. style "모던한"을 넣으면 **8건 전부**가 반환된다.
   - keyword 검색은 category name을 보지 않는다. "전체 리모델링"은 3/5만 찾는다. 또 "아파트"는 필드가 아니라서 keyword로 쓰면 bi-06이 빠진다.
6. **가장 풍부한 스타일 근거(body, gallery alt)는 공개 compact index에서 의도적으로 제외되어 있다**(`project-filter.ts:60-63`). BoostChat이 근거 기반으로 설명하려면 canonical content(`projects.json`)를 읽어야 한다.

## 최종 분류

### A. 데이터 schema 변경 없이 해결 가능 (현재 데이터 그대로, matcher 쪽 처리)

- 평형 정확·범위·버킷 매칭("34평", "30평대", "24평"): area 8/8, 단일 단위·basis
- "전체 리모델링" / "주방·욕실" / "부분" → category(type) 매핑. 자유 텍스트가 아니라 type으로 매핑해야 한다.
- "~만" 한정 질의: scope가 프로젝트별로 망라적이라 정규화된 부분집합 비교로 처리할 수 있다(Q4).
- 지역(시군구), 준공연도(구축/신축, builtYear 8/8), 공사 기간(durationWeeks 8/8), before/after 유무(bi-04)
- full-remodel 안에서의 평당가 상대 비교. 총액은 "추정" 라벨을 붙인 참고치로만 쓴다.
- 근거 기반 설명: summary, body, gallery alt 텍스트 인용
- matcher 처리 규칙(데이터 문제 아님): 어휘 밖 토큰이 버려졌을 때 그 사실을 드러낸다. "아파트"는 필터어로 쓰지 않는다. ㎡ 입력은 basis가 확인되기 전까지 평 기준으로 되묻는다.

### B. vocabulary normalization만 필요 (데이터·schema 변경 없이 외부 매핑 테이블로)

- 스타일 동의어: 화이트톤·하얀·흰·white → 화이트, 깔끔·심플·정돈 → 미니멀(약한 매핑), 모던한·modern → 모던, 원목·오크·우드 → 우드 포인트 / 내추럴
- keyword facet 분류(색·톤 / 스타일 / 기능 / 소재)를 외부 정의로 둔다.
- category 동의어와 계층
  - 올수리·풀리모델링·전체 공사 → full-remodel
  - 리뉴얼 ≡ 리모델링
  - 부분 수리 → partial-remodel ∪ kitchen-bath
  - 홈스타일링 → move-in-styling
  - "입주 인테리어"는 되물어야 한다.
- scope·방 어휘
  - `·` 복합 토큰 분해
  - 상하위 관계: 욕실 ⊃ 공용/안방 욕실, 침실 ⊃ 안방/작은방/아이방
  - "복도 수납" ≡ "복도·수납"
  - scope ↔ gallery 그룹명 별칭
- 평형 표현 파싱: N평 / N평형 / N평대 / 국평(=34평형). 데이터가 100% pyeong·supply라 쿼리 쪽 처리만으로 안전하다.

### C. source data 자체를 보강해야 함

C1 — 기존 필드 채우기·재태깅 (schema 변경 없음)

- bi-04, bi-06 가격. 단 평당가는 부분 공사에 의미가 맞지 않으므로 C2의 총액이 더 적합하다.
- keywords 태깅 기준을 정하고 재적용한다. 후보(근거 있음): bi-05 +화이트, bi-01 +우드 포인트, bi-08 우드 계열(경계 사례).
- `모던`의 정의와 적용 기준. 현재는 텍스트 근거가 0이다.
- 표본 확대. 특히 부분 공사·예산대별 사례가 필요하다(현재 kitchen-bath 1, partial 1, styling 1).
- 실제 고객 데이터(현재 전부 synthetic).

C2 — 새 필드가 필요한 것 (schema 변경 필요, 이번 범위 밖, 목록만)

- 총 공사비 또는 가격대, 포함 범위(VAT·가구·철거·확장) → Q2
- 전용면적(㎡)·타입(84A 등), 그리고 필터 레코드까지 basis 전달 → ㎡·국평·전용 질의
- 주거 유형(아파트/빌라/오피스텔/주택) → Q1의 "아파트"
- 공종 단위 범위(도배·바닥·샷시·욕실 전체 교체 vs 부분 보수) → "도배랑 바닥만" 같은 질의
- 가구 형태(신혼·아이·1인). 현재는 title과 인용에만 있다.
- 거주 중 공사 여부. 현재는 bi-04 인용문 텍스트에만 있다.

## 보고서 구성

- `01-field-coverage.md` — 필드별 존재율, empty 비율, 값 종류, 일관성
- `02-area-price.md` — area 혼재·basis·이상치, pricePerArea coverage·단위·비교 안전성
- `03-vocabulary.md` — category/scope/keywords 동의어·중복·표기, 사용자 표현 4종 커버리지
- `04-query-evaluation.md` — 질의 4건 READY/PARTIAL/NOT_READY 근거
- `evidence/` — `field-coverage.json`, `text-evidence-and-query-sim.txt`, `project-filter-probe.txt`(실제 `evaluateProjectFilter` 실행 결과), `input-hashes.txt`
