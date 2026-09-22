# 01 — 필드 coverage (boost-interior-demo projects)

- 대상: `data/sites/boost-interior-demo/content/projects.json` (`projects@1`, `origin: synthetic-fixture`), 8건, 전부 `status: published`
- schema: `platform/content/schema.ts:141-217` (`ProjectSchema`). `cover`, `category`, `id`, `slug`, `title` 외 detail 필드는 **모두 optional**이고, schema 주석상 없으면 "unknown, never invented"로 처리한다.
- 수치 근거: `evidence/field-coverage.json`

## 요청 필드

| 필드 | 존재율 | null/empty | 값의 종류 | 표현 일관성 |
|---|---|---|---|---|
| id | 8/8 (100%) | 0 | 8개 모두 고유, `bi-01`~`bi-08` | 일관 |
| slug | 8/8 | 0 | 8개 고유 | 7건은 `<구>-<N>py-<설명>` 패턴이고, bi-01만 `suseong-white-34py-…`로 순서가 다르다. slug의 N은 area.value와 8/8 일치한다. 설명 부분은 스타일(white/natural/minimal), 범위(kitchen-bathroom), 대상(newlywed/family)이 섞여 있어 matching 신호로 쓰기 어렵다. |
| title | 8/8 | 0 | 8개 고유, 한국어 | "N평"이 8/8 포함되고 area.value와 8/8 일치한다. 스타일어는 4건에만 있다(화이트 3, 내추럴 2, 미니멀 1). |
| category | 8/8 | 0 | 4종: full-remodel 5, kitchen-bath 1, partial-remodel 1, move-in-styling 1 | `categories.json`으로 8/8 해석된다. 미사용 카테고리 0, 미등록 id 0. |
| cover | 8/8 | 0 | asset 8/8이 registry(52)에 존재, alt 8/8 | cover는 8/8 모두 gallery에도 포함된다. 이미지는 전부 AI 생성(provisional)이다. |
| area.value | 8/8 | 0 | 정수 7종: 19, 24, 29, 32, 34×2, 42, 51 | 소수·문자열·0·음수 없음, 이상치 없음 |
| area.unit | 8/8 | 0 | `pyeong` 1종 | 완전 일관 |
| area.basis | 8/8 | 0 | `supply` 1종 | 완전 일관(exclusive 0, unknown 0) |
| location | 8/8 | 0 | 6종: 대구 수성구 3, 달서구·북구·동구·중구 각 1, 경북 경산시 1 | "광역 약칭 + 시군구" 2토큰 형식으로 일관된다. 동·단지 정보는 없다. |
| scope | 8/8 | 0 | 34 entries, 20종, 프로젝트당 3~7 | **불일관**: 세분도 차이, `·` 복합 토큰, 구분자 차이 (→ 03) |
| keywords | 8/8 | 0 | 23 entries, 8종, 프로젝트당 2~4 | 철자는 일관되지만 facet이 섞여 있고 태깅이 불완전하다 (→ 03) |
| pricePerArea | **6/8 (75%)** | **2 (25%)**: bi-04, bi-06 | KRW/pyeong 1종, 160만~320만 | 단위는 일관된다. 의미는 정의되어 있지 않다 (→ 02). |
| summary | 8/8 | 0 | 8개 고유, 46~59자, 8/8 "…입니다."로 끝남 | 문체 일관 |
| gallery (`galleryGroups`) | 8/8 | 0 | 그룹 32개, 이미지 42장, before 2장(bi-04만), 그룹명 16종 | asset 누락 0, alt 누락 0. 이미지 수가 불균형하다(bi-01 13장, 나머지 4~5장). 그룹명과 scope 어휘가 다르다 (→ 03). |

## 요청 외이지만 matching에 쓸 수 있는 필드

| 필드 | 존재율 | 비고 |
|---|---|---|
| body | 8/8 | 문단 2~4개. 스타일·자재·생략 공간 같은 **가장 풍부한 근거**가 여기 있다. 다만 `ProjectFilterRecord`/공개 index에서는 제외된다(`project-filter.ts:60-63`). |
| gallery alt | 44/44 | 색·자재·가구 묘사가 풍부하다(예: "화이트 정사각 타일", "그레이지 헤드월"). |
| builtYear | 8/8 | 1999~2025. "구축/신축" 질의에 쓸 수 있다. |
| durationWeeks | 8/8 | 2~8주 |
| period.start / end | 8/8 / 6/8 | end가 없는 2건(bi-04, bi-06)은 schema 정의상 "단월 프로젝트"다. 누락이 아니다. |
| customerQuote | 5/8 | schema상 운영자 제공 전용이고 생성 금지다. 가구 형태(신혼부부·4인 가족 등)는 여기와 title에만 있다. |

## 공통 전제

- 모든 content 컬렉션이 `origin: synthetic-fixture`이다. 텍스트·인용·가격은 데모용 합성값이고, 이미지는 AI 생성 provisional이다. 이 보고서의 결론은 **데이터 형태(shape)의 준비도**이지 실제 포트폴리오 분포에 대한 판단이 아니다.
- N=8이라 버킷당 표본이 1~3건이다(20평 미만 1, 20평대 2, 30평대 3, 40평대 1, 50평 이상 1).
