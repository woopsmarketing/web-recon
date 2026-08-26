Task: 08
Title: Deterministic Structural Family Signals v2
Previous: 07-page-family-representative-selection-2026-08-13.md
Status: Complete

---

# Task 08 — Deterministic Structural Family Signals v2

## 문제 정의 — 왜 exact structureHash가 duplicate에는 맞고 family에는 부족한가

Task 07은 구조적으로 완성됐지만 실효 이득이 거의 없었다: 실사이트 112 URL → 110 family
(**1.8%**). false merge는 0이었지만 명백히 같은 템플릿인 페이지들이 전부 singleton으로 남았다.

원인은 grouping 규칙이 아니라 **사용 가능한 신호**였다. Task 06의 `structureHash`는 문서 전체
`depth:tag` 토큰 시퀀스의 SHA-256이다. 이 해시가 답하는 질문은:

```
"이 두 URL이 같은 페이지인가?"   ← identity / duplicate
```

이고, 그 목적에는 정확히 동작한다. 하지만 이번에 필요한 질문은 다르다:

```
"이 두 페이지가 같은 템플릿으로 만들어졌는가?"   ← template / family
```

exact hash는 두 번째 질문에 구조적으로 답할 수 없다. 근거:

| | element count | exact structureHash |
| --- | --- | --- |
| Task 07에서 **성공**한 seoworld family 2건 | 144/144, 172/172 (**완전히 동일**) | 일치 |
| MDN `Temporal/PlainDateTime/{inLeapYear, microsecond, toPlainTime}` | 930 / 932 / 935 (**0.5% 차이**) | 셋 다 다름 |

즉 exact hash는 구조가 **문자 그대로** 같을 때만 맞는다. 본문이 한 문단이라도 다르면 절대
일치하지 않으므로, 콘텐츠가 있는 페이지에서는 template detector로 쓸 수 없다.

이번 Task의 해법은 exact 신호를 고치는 것이 **아니다**. exact 신호는 자기 질문에 대해 이미
정답이다. 그 옆에 **별도의 더 둔감한 신호를 추가**하고, 두 신호가 서로 다른 질문에 답하도록
명확히 분리했다.

```
Exact Fingerprint   textHash + structureHash    →  duplicate / identity   (Task 06, 불변)
Coarse Profile      StructuralProfile           →  template / page family (Task 08, 신규)
```

AI / LLM / embedding / similarity score는 어디에도 없다.

## 구현 구조

```
Playwright Verification (기존 run의 discovery.json 재사용 — Firecrawl 호출 0)
  ├─ collectSignalsInBrowser        → 기존 EXACT fingerprint          (한 줄도 수정 안 함)
  └─ collectStructuralRawInBrowser  → policy-free RAW material        (신규)
         skeletonTokens  / landmarkTokens / tagCounts / elementCount / maxDepth
              ↓  (Node 측, 전역 정책 1개 적용)
         buildStructuralProfile
              ↓
verification.json + verified-urls.json   (schema v2)
              ↓
Offline Selector  (Firecrawl 0 / Playwright 0 / Network 0)
   0. root protection
   1. content-duplicate  ← EXACT textHash AND structureHash   (불변)
   2. sibling-pattern    ← COARSE key + guards                (변경)
   3. scope-structure    ← COARSE key + guards                (변경)
   4. singleton
              ↓
page-families.json + selected-pages.json (schema v2)
```

신규 모듈은 `src/verifier/structural-profile.ts` 하나뿐이다. Discovery와 Observer는 **한 줄도
수정하지 않았다**.

### Raw 수집과 정책 적용의 분리

브라우저 안에서는 **정책이 없는 원재료만** 만든다(`depth:tag` 토큰 스트림, landmark 토큰
스트림, tag별 count). depth cap / label mode / repeat 정책 / bucket 정책은 전부 **Node 쪽**에서
적용한다. 이렇게 나눈 이유는 두 가지다.

1. 정책이 코드 한 곳에 모여 있어 감사(audit) 가능하다.
2. **정책을 다시 크롤링하지 않고 재측정할 수 있다.** 아래 §Depth cap 결정이 실제로 이 구조
   덕분에 가능했다 — 112개 URL을 한 번 방문해 원재료를 저장하고, 60가지 정책 조합을 오프라인에서
   비교했다.

## StructuralProfile schema

```ts
StructuralProfile {
  shallowSkeletonHash   // depth-capped, repeat-collapsed tag skeleton
  landmarkHash          // landmark-only nesting signature
  tagHistogramHash      // bucketed per-category tag counts

  elementCount          // profile walk가 방문한 element 수 (noise/opaque subtree 제외)
  maxDepth              // cap 없이 기록한 실제 최대 깊이

  landmarkCounts   { header nav main article section aside footer form table dialog }
  structuralCounts { heading paragraph list listItem link button input image media }
  histogramBuckets { 17개 category → bucket index }   // tagHistogramHash의 원본
  truncated?            // 8,000 element cap에 걸렸으면 true
}
```

`verification.json`(전체 candidate)과 `verified-urls.json`(Selector 입력) **양쪽에** 저장한다.
Task 06이 `textHash`/`structureHash`를 양쪽에 두는 것과 같은 이유다 — Selector가 member마다
`verification.json`을 다시 열지 않아도 된다.

**전체 DOM skeleton 원문은 저장하지 않는다.** 해시와 compact count만 남는다.

## Normalized skeleton 알고리즘

한 번의 tag-only DOM 순회. 텍스트 노드, attribute 값, computed style, geometry는 **읽지 않는다**.

```
1. noise 제거     head / script / style / noscript / template / meta / link / base / title
                  → subtree째 제외
2. opaque leaf    svg / math / canvas / video / audio / iframe / object
                  → 노드 1개로 세고 내부로 내려가지 않음
3. token 기록     depth:tag  (depth ≤ 12까지 raw로 보관)
4. Node 측 정책   depth cap 6 → label 매핑(tag, h1..h6 → h) → 반복 sibling 축약 → 직렬화 → SHA-256
```

실제 결과물(MDN reference 페이지, 467자):

```
html(body(ul(li(a)),div(mdn-placement-top),header(nav(div(a(svg)),div(mdn-search-button),
button,div(div(nav),div(mdn-search-button),mdn-user-menu)),mdn-search-modal,
div(mdn-toggle-sidebar,ol(li(a)),mdn-collection-save-button,mdn-color-theme,
mdn-language-switcher)),div(div(main(div(mdn-survey,h,details,section),
aside(nav,mdn-placement-sidebar),div(section)),aside(nav(div)))),div(mdn-placement-bottom,…
```

### Task 06 정책과의 차이 (의도적)

| | exact structureHash | coarse skeleton |
| --- | --- | --- |
| `<head>` / `<script>` / `<meta>` | 포함 | 제외 |
| inline `<svg>` 내부 | 포함 | opaque (1노드) |
| depth | 전체 | 6까지 |
| 반복 sibling | 그대로 | 축약 |
| heading level | h1≠h2 | h로 통합 |

**두 정책이 다른 것이 버그가 아니라 설계다.** identity hash는 "페이지는 곧 그 마크업"이므로 전부
봐야 하고, template signal은 그 대부분을 봐서는 안 된다. fixture가 이 차이를 고정한다:
`<script>`/`<meta>`/`<link>`만 추가한 두 페이지는 **coarse는 일치하고 exact는 달라야** 한다.

## 반복 sibling normalization

sibling들을 **이미 직렬화된 형태 기준으로** 중복 제거하고, 첫 등장 순서를 유지한다.

```
ul(li(a), li(a), li(a), li(a), li(a))   →   ul(li(a))
ul(li(a), li(a), li(a,span))            →   ul(li(a), li(a,span))     ← 다른 shape은 보존
div(p, ul, p)                           →   div(p, ul)                ← 진짜 반복만 사라짐
```

- tag가 아니라 **subtree 전체**를 비교하므로 `li(a)`와 `li(a,span)`은 분리된다.
- 반복 **개수**를 fingerprint하지 않는다. 관련 카드 3개짜리 페이지와 8개짜리 페이지는 같은
  템플릿이다.
- 순서를 뒤집지 않으므로 `header→main→footer`와 `main→header→footer`는 구별된다.

`p*` 같은 repeat marker(“2개 이상이었다”를 기록하는 방식)도 구현해 실측 비교했다. 안전성은
동일했고 recall만 나빠져서(seoworld `/tools/*` 6키 → 7키) 채택하지 않았다. marker는 결국 1-vs-many
라는 **개수 신호**를 되살리는데, 그것이 이 신호가 없애려는 민감도다.

## Depth cap

**6.** `<html>`→`<body>`→page wrapper→landmark→block→child.

fixture가 아니라 실데이터 112 URL 전수 측정으로 결정했다. 양쪽 이웃이 모두 측정상 더 나쁘다.

| cap | 실측 결과 |
| --- | --- |
| 4 | 페이지가 안 보인다. seoworld 15개 페이지가 **한 키**에 뭉쳤다 — `/blog`(654 el) + `/domains`(71) + `/domains/*` + `/services`(84) + `/services/*` + `/tools`(388) + `/tools/*`, route scope 4개, element 9.2배 |
| 5 | 여전히 `/services/*`(97)와 `/tools/*`(141–388)+`/tools`가 한 키, `/blog`(654)와 `/services`(84)가 한 키 |
| **6** | 위 잘못된 그룹이 전부 분리됨. cross-scope 그룹 0 |
| 7 | 템플릿이 안 보인다. MDN `Errors/*` 3개 → 3키, `Temporal/*` 3개 → 2키, nextjs `/docs/messages/*` 4개 → 4키 (= 반복 그룹이 하나도 안 묶임) |
| 8 | 112개 중 77개가 고유 키 — 사실상 exact hash로 회귀 |

사이트별 조건문은 없다. 전역 상수 하나(`SKELETON_POLICY.depthCap`)다.

## Landmark signature

landmark tag(`header nav main aside article section footer form table dialog`)만으로 별도의
중첩 트리를 만들어 같은 반복 축약을 적용하고 해시한다. depth cap 없음, label 매핑 없음.

```
header(nav),main(article,aside),footer
```

본문 내부의 paragraph 수 같은 것은 전혀 반영되지 않는다. `main(article,article,article)`은
`main(article)`과 같은 signature다(리스트 페이지의 항목 수가 signature를 흔들면 안 되므로).

실제로 이 신호가 단독으로 false merge를 막은 사례가 있다: nextjs `/blog/next-13-1`은 blog
family와 `shallowSkeletonHash`가 **같지만**(`294b38e86d`) `landmarkHash`가 다르다
(`44169a017a` vs `4c18a1dd64`) → singleton으로 남았다.

## Histogram / bucket 정책

17개 category(`landmark content heading text link action form field list listitem table row cell
media dialog container other`)별 count를 전역 bucket으로 나눠 직렬화 후 해시한다.

```
0 → 0 | 1 → 1 | 2 → 2 | 3-4 → 3 | 5-8 → 4 | 9-16 → 5 | 17-32 → 6 | 33+ → 7
```

작은 수(1개 `<main>` vs 2개 — 진짜 구조 차이)는 날카롭게, 큰 수는 점점 둔하게. 전역 정책 하나.

### 중요한 실측 결과: 이 해시를 merge 조건으로 쓰면 안 된다

`tagHistogramHash` 일치를 family 조건에 넣으면 recall이 붕괴한다. 17차원 중 **하나만** bucket
경계를 넘어도 불일치하기 때문이다.

| key | distinct keys (112 URL 중) | dc `/blog/*` | sw `/blog/*` | nextjs `/docs/messages/*` |
| --- | --- | --- | --- | --- |
| skeleton + landmark | 31 | 2 / 17 | 1 / 9 | 1 / 4 |
| + histogram (bucket `0,2,8,32`) | 67 | 7 / 17 | 4 / 9 | 3 / 4 |
| + histogram (production bucket) | 84 | **13 / 17** | 6 / 9 | **4 / 4** |

그러면서 다른 guard가 놓친 것을 **하나도** 잡아내지 못했다(cross-scope / list-vs-detail 지표가
동일). 그래서 §14가 허용한 대로 histogram을 merge 조건에서 빼고, 대신 두 가지로 나눠 썼다.

1. **guard로는 "존재 여부"만 사용** — bucket>0 여부만 본 presence mask
   (`histogramPresenceKey`). `bucketOf(0) === 0`이므로 **저장된 `histogramBuckets`에서 그대로
   읽는다** — 두 번째 bucket 정책을 만들지 않았다. 실데이터에서 recall 손실 0이면서, "폼이 있는
   도구 페이지 vs 없는 글" 같은 종류 차이를 잡는다. fixture로 고정했다.
2. **전체 해시는 증거로 기록** — `familyMatch.histogram`에 일치 여부만 남긴다. 나중에 false
   merge를 추적할 때 "histogram까지 같았는가?"를 볼 수 있다.

## Structural metrics

해시 옆에 raw count를 그대로 저장한다(§9). `page-families.json`만 열면 사람이 family를 검수할 수
있어야 하기 때문이다. 실제 검수에 쓴 형태:

```
   *   485el   608dom d13 hdr1 nav7 main1 art1 sec1 asd1 ftr1 frm2 tbl3 | h22 p56 ul6 li38 a66 btn19 in2 img4
       /blog/what-is-trust-flow
```

`elementCount`는 `domElementCount`(Task 06 관측값)와 **다른 값**이다 — profile walk가 noise와
opaque subtree를 빼고 센 수다. 위 예에서 485 vs 608. 두 값 모두 저장되고, ratio guard는
`elementCount`를 쓴다.

## Selector v2 family compatibility rule

grouping hierarchy는 그대로 두고, 규칙 2·3이 보는 **신호만** 바꿨다.

```
merge 조건 (전부 exact match의 논리곱)
  same shallowSkeletonHash
  AND same landmarkHash
  AND same histogram presence mask

guard
  same route context     sibling: parentPath + pathDepth  /  scope: localePrefix + routeScope
  path ancestor 배제      한 member의 경로가 다른 member의 조상이면 제외 (list vs detail)
  element count ratio     max/min ≤ 2.0
```

similarity score는 없다. 유일한 수치 임계값(ratio)은 **합치는 근거가 아니라 오직 쪼개는 근거**로만
쓰인다.

### exact → coarse 전환이 회귀가 아닌 이유

`depth:tag` preorder 시퀀스가 같으면 트리가 유일하게 결정되고, 따라서 skeleton / landmark /
histogram이 전부 같다. 즉 **coarse key는 exact hash보다 엄밀히 약하다.** Task 07이 묶던 것은
반드시 계속 묶인다. 실제로 Task 07의 seoworld family 2개는 그대로 살아남았고 오히려 커졌다
(`/domains/*` 2 → 3, `/services/*` 2 → 3).

### path ancestor 배제 (§19 List vs Detail)

`scope-structure`에만 적용한다(`sibling-pattern`은 parent+depth가 같아 조상이 존재할 수 없다).
`/domains`가 `/domains/auction`과 같은 coarse profile을 가지는 실제 사례가 있었고, 이를 막지
않으면 index 페이지가 detail 페이지에 흡수되어 **관측에서 통째로 사라진다**. 제거되는 쪽은 조상
(index)이고, 그 페이지는 singleton이 되어 여전히 선택된다.

여기에 `pathDepth`를 키에 넣는 방식(더 단순함)도 검토했지만 버렸다 — MDN처럼 깊이가 제각각인
문서 사이트에서 family를 과도하게 쪼갠다. ancestor 배제가 §19가 말하는 문제만 정확히 겨냥한다.

## Threshold: 정확한 값과 이유

**`MAX_ELEMENT_COUNT_RATIO = 2.0`** — 전역 상수 1개, `src/selector/types.ts`에 명시, 사이트별
tuning 없음.

element count **exact match는 요구하지 않는다**(그게 exact hash의 실패 원인이었다). 이 guard는
반대 방향, 즉 "같은 껍데기를 공유하지만 크기가 비정상적으로 다른 두 페이지"만 막는다.

값은 실데이터 112 URL의 coarse 그룹 내부 element 분포를 전수 측정해서 정했다.

| 그룹 | element 범위 | ratio | 판단 |
| --- | --- | --- | --- |
| domainchecker `/blog/*` | 410–592 | 1.44 | 같은 템플릿 ✓ |
| seoworld `/blog/*` | 353–467 | 1.32 | 같은 템플릿 ✓ |
| nextjs `/docs/messages/*` | 2821–3828 | 1.36 | 같은 템플릿 ✓ |
| MDN reference cluster | 779–1231 | 1.58 | 같은 템플릿 ✓ |
| MDN cluster + 이상치 1개 | 779–**4795** | 6.16 | 분리해야 함 ✗ |
| nextjs docs + 이상치 1개 | 1982–**4597** | 2.32 | 분리해야 함 ✗ |

사람이 "같은 템플릿"이라고 부른 그룹은 전부 2.0 아래, 이상치가 낀 그룹은 전부 2.0 위에 떨어진다.
2.5로 완화하면 4개 사이트 전체에서 URL 3개를 더 흡수하는 대신 위 이상치들이 다시 들어온다 —
"false merge가 missed merge보다 나쁘다" 기준에서 나쁜 거래다.

경계는 fixture로 고정했다: 100/150/**200** 은 한 family(200/100 = 2.0, 포함), **201**은 분리.

## 하나의 마법 Hash를 만들지 않았다 (§11)

`coarseHash = everything` 대신 `shallowSkeletonHash` / `landmarkHash` / `tagHistogramHash` +
raw metric을 각각 보존했다. 덕분에 family마다 **왜 묶였는지**를 기록할 수 있다.

```json
"familyMatch": {
  "shallowSkeleton": true, "landmark": true, "histogramPresence": true,
  "histogram": false, "exactStructure": false,
  "elementCountMin": 410, "elementCountMax": 592, "elementCountRatio": 1.444
}
```

읽기용 문자열도 함께 남긴다:

```
shallowSkeleton+landmark+histogramPresence; elements 410–592 (ratio 1.444); histogram=no; exactStructure=no
```

`exactStructure`가 특히 유용하다 — **Task 07 규칙으로도 묶였을 family인지**를 그대로 보여준다.
실사이트 19개 non-singleton family 중 `exactStructure=yes`는 **0개**다. 즉 이번 reduction은
전부 새 신호가 만든 것이다.

각 해시는 domain separation + 정책 태그를 붙여 해시한다(`skeleton|d6/tag/dedupe\n…`). 정책을
바꾸면 해시가 **반드시** 바뀌므로, 다른 정책으로 계산된 profile끼리 우연히 같아질 수 없다.

## Duplicate logic 불변 확인

`content-duplicate`는 그대로 **exact `textHash` AND exact `structureHash`**다. coarse 신호는
duplicate를 선언할 수 **없다**. 세 겹으로 고정했다.

1. `claimContentDuplicates`는 Task 06 `content-fingerprint` 그룹만 소비한다(코드 미변경).
2. **저장 전 invariant**: `content-duplicate` family의 모든 member가 같은 exact 두 해시를 갖지
   않으면 throw.
3. fixture: 같은 coarse profile + 다른 textHash(`/about` vs `/pricing`)가 duplicate로 분류되지
   않는지, 그리고 모든 content-duplicate family가 exact 해시를 공유하는지 검사.

실사이트 duplicate group 결과도 Task 06/07과 **동일**하다:

| site | final-url | canonical | content-fingerprint |
| --- | --- | --- | --- |
| domainchecker | 0 | 1 (`/` 를 가리키는 2건) | 0 |
| seoworld | 0 | 1 (`/` 를 가리키는 2건) | 0 |
| nextjs | 0 | 0 | 0 |
| MDN | 0 | 0 | 0 |

## Fixture positive cases

`pnpm smoke:verifier` — 실제 HTTP 서버 + 실제 Chromium + 실제 DOM으로 검증한다(합성 해시가 아님).

| 케이스 | 결과 |
| --- | --- |
| 같은 article 템플릿, paragraph 3개 vs 9개 | coarse 일치 ✓ (동시에 exact는 **불일치** ✓) |
| 같은 템플릿, related item 3개 vs 8개 | coarse 일치 ✓ |
| `<script>`/`<meta>`/`<link>`/`<style>` noise 추가 | coarse 일치 ✓ (exact는 불일치 ✓) |
| inline `<svg>` 노드 1개 vs 4개 | coarse 일치 ✓ |
| depth cap 아래(depth 7)에서만 다른 두 페이지 | coarse 일치 ✓ |
| 마크업 동일 + 텍스트/언어 완전히 다름 | coarse 일치 ✓ |

pure function 단위 검사도 포함했다: bucket 경계 13개 값, 반복 축약(3개 vs 8개, 서로 다른 shape
보존, subtree 단위 비교), heading 통합, depth cap 경계(6은 보이고 7은 안 보임), landmark 중첩·
순서·반복 무감각.

### 측정된 한계 — optional section

§18의 세 번째 케이스(related section이 있는 글 vs 없는 글)는 **버틸 수 없다**. `<section>`이
landmark tag이므로 landmark tree가 바뀐다. 이것을 통과시키려고 규칙을 느슨하게 만드는 대신,
fixture에 **실제 동작 그대로**(합쳐지지 않음) + **원인이 landmarkHash라는 사실**을 함께 고정했다.
느슨하게 만들면 §19의 "list vs detail"과 "docs index vs docs article"이 바로 뚫린다.

## Fixture negative cases

| 케이스 | 검증 위치 | 결과 |
| --- | --- | --- |
| list vs detail (`/s/blog` vs `/s/blog/post-a`) | verifier (실 DOM) | 불일치 ✓ |
| home vs content (`/s/home` vs `/s/about`) | verifier (실 DOM) | 불일치 ✓ |
| docs index vs docs article | verifier (실 DOM) | 불일치 ✓ |
| landmark tree만 같고 내부가 다름 | verifier (실 DOM) | landmark는 같지만 merge 안 됨 ✓ |
| skeleton·landmark 같고 element **종류**만 다름 | verifier (실 DOM) | presence guard가 분리 ✓ |
| 같은 parent인데 구조가 다름 (`/services/alpha` vs `beta`) | selector | landmark guard가 분리 ✓ |
| docs index가 자식과 coarse profile이 **완전히 동일** | selector | ancestor guard가 분리, index는 그대로 선택됨 ✓ |
| 같은 coarse profile + 다른 route scope (`/about` vs `/pricing`) | selector | 분리 ✓ |
| canonical만 같음 (`/canonical-a`,`-b`, `/legal/*`) | selector | 분리 ✓ |
| structuralProfile이 아예 없는 같은 parent sibling 3개 | selector | 전부 singleton ✓ |
| ratio 경계 201/100 | selector | 분리 ✓ |

## Task 06 regression 결과

`pnpm smoke:verifier` **81/81 PASS**. 기존 Task 06 검사는 하나도 수정하지 않았다.

- `final-url` 그룹 (`/ok`, `/to-ok`) ✓
- `canonical` 그룹 (`/canonical-a`, `/canonical-b`) ✓
- `content-fingerprint` 그룹 (`/duplicate-a`, `/duplicate-b`) ✓
- 상태 분류 6종, redirect chain, content-type gating, verified-urls 적격성/dedup ✓
- Zod round-trip ✓

`content-fingerprint`의 정의는 coarse 신호로 바꾸지 않았다.

## Task 07 regression 결과

`pnpm smoke:selector` **81/81 PASS**. Task 07이 보장하던 성질을 전부 유지한다.

- 계층적 grouping(union-find 아님), root 보호, 대표 선정 규칙, provenance(unselected가 대표 지목)
- canonical은 merge 근거가 아님 + hint/우선순위 강등만
- coverage / membership / representative / `selectedCount === familyCount` invariant
- determinism 3종(역순, stride 순열, 저장 배열 역순)
- **offline 보장**: `src/cli-select.ts`에서 시작하는 static import graph를 다시 확인했다.

```
src/cli-select.ts  src/selector/{index,types,route-features,build-families,
select-representatives,store}.ts  src/verifier/{types,structural-profile}.ts
src/discovery/{normalize-url,types}.ts
외부: node:crypto  node:fs/promises  node:path  zod        ← playwright / firecrawl 없음
```

신규 `structural-profile.ts`는 `node:crypto` + `zod`만 쓰므로 leaf import 규율이 깨지지 않았다.
`pnpm select` 실행 시간은 사이트당 **0.38–0.42s**로 Task 07과 동일하다.

## domainchecker 결과

19 verified → **4 family (79.0% reduction)**, largest family 11.

| family | type | members | 내용 |
| --- | --- | --- | --- |
| f000003 | sibling-pattern `/blog/<*>` | 11 | blog 글 (410–592 el, ratio 1.444) |
| f000004 | sibling-pattern `/blog/<*>` | 6 | blog 글 (412–515 el, ratio 1.25) |
| f000001 | singleton (root-protected) | 1 | `/` (752 el) |
| f000002 | singleton | 1 | `/blog` 목록 (724 el) |

blog 글 17개가 **2개 template variant**로 갈렸다. 우연이 아니라 실제 차이다 — f000003 member는
전부 `button` 19개, f000004 member는 전부 15개로, article shell 안의 버튼을 가진 블록 구성이
다르다. 두 그룹 모두 내부적으로는 완전히 균질하다.

`/blog` 목록과 `/` 홈은 각각 singleton으로 남았다(list vs detail, home vs content 모두 정상).

## seoworld 결과

30 verified → **16 family (46.7% reduction)**, largest family 9.

| family | type | members | 내용 |
| --- | --- | --- | --- |
| f000003 | sibling-pattern `/blog/<*>` | 9 | blog 글 전부 (353–467 el) |
| f000005 | sibling-pattern `/domains/<*>` | 3 | auction / compare / history (71/71/71 el) |
| f000008 | sibling-pattern `/services/<*>` | 3 | domain-broker / traffic / web-design (96–97 el) |
| f000013 | sibling-pattern `/tools/<*>` | 3 | keyword-related / meta-generator / sitemap-generator (141–182 el) |

**Task 07의 기존 2 family가 깨지지 않았다** — 오히려 각각 커졌다.

```
Task 07  scope-structure {domains/auction, domains/compare}          2
Task 08  sibling-pattern {domains/auction, domains/compare, history} 3   ← history 합류

Task 07  scope-structure {services/domain-broker, services/web-design}          2
Task 08  sibling-pattern {services/domain-broker, services/traffic, web-design} 3   ← traffic 합류
```

singleton 12개에는 index 페이지 5개(`/`, `/blog`, `/domains`, `/services`, `/tools`)가 전부 포함된다
— detail 페이지에 흡수되지 않았다.

## nextjs 결과

40 verified → **12 family (70.0% reduction)**, largest family 9.

| family | type | members | 내용 |
| --- | --- | --- | --- |
| f000002 | sibling-pattern `/blog/<*>` | 5 | blog 글 (539–985 el) |
| f000004 | scope-structure `blog` | 2 | 더 긴 blog 글 2개 (1389/1807 el) |
| f000005 | scope-structure `docs` | 9 | `/docs/app/*` (2867–4547 el) |
| f000006 | scope-structure `docs` | 3 | `<table>`이 있는 `/docs/app|community/*` |
| f000008 | sibling-pattern `/docs/messages/<*>` | 4 | 에러 메시지 문서 전부 |
| f000009 | scope-structure `docs` | 5 | `/docs/pages/*` (1982–2343 el) |
| f000010 | scope-structure `docs` | 4 | `<table>`이 있는 `/docs/pages/api-reference/*` |
| f000011 | sibling-pattern `/docs/pages/guides/<*>` | 4 | 가이드 문서 |

f000002와 f000004가 갈린 이유가 규칙의 동작을 잘 보여준다: 두 그룹은 skeleton도 landmark도
같지만 element 수가 539–985 / 1389–1807로 ratio guard에 걸려 분리됐고, 남은 2개는
`MIN_SIBLING_FAMILY_SIZE=3`에 못 미쳐 sibling이 아니라 scope-structure로 묶였다.

singleton 4개: `/`(root), `/blog/next-13-1`(landmark 불일치), `generate-metadata`(**8,000 element
cap에 걸린 유일한 페이지**, DOM 9,711), `/docs/pages/guides/upgrading/codemods`(4,597 el).

## MDN 결과

23 verified → **9 family (60.9% reduction)**, largest family 9.

| family | type | members | 내용 |
| --- | --- | --- | --- |
| f000003 | scope-structure `docs` | 9 | JS reference + Web API reference (779–1231 el) |
| f000009 | **sibling-pattern** `…/Temporal/PlainDateTime/<*>` | 3 | **inLeapYear / microsecond / toPlainTime** |
| f000008 | sibling-pattern `…/Reference/Errors/<*>` | 3 | SyntaxError 문서 3종 (1330–1339 el) |
| f000002 | scope-structure `docs` | 2 | Learn/Forms + HTTP header |
| f000006 | scope-structure `docs` | 2 | HTML how-to + Security 가이드 |

23개 전부 `localePrefix=en-US`, `routeScope=docs`로 정확히 분리됐고, cross-locale merge는 없다.

### §20 핵심 검증 대상: MDN Temporal group

Task 07이 지목한 바로 그 3개 페이지가 **하나의 family가 됐다.**

| URL | Task 07 domEl | Task 08 profile el | exact structureHash | coarse |
| --- | --- | --- | --- | --- |
| `…/Temporal/PlainDateTime/inLeapYear` | 930 | 848 | 서로 다름 | `sk=80814b5df208` `lm=a516ef38f169` |
| `…/Temporal/PlainDateTime/microsecond` | 932 | 851 | 서로 다름 | 동일 |
| `…/Temporal/PlainDateTime/toPlainTime` | 935 | 846 | 서로 다름 | 동일 |

`familyMatch`: `shallowSkeleton+landmark+histogramPresence; elements 846–851 (ratio 1.006);
histogram=no; exactStructure=no`. 억지 예외 코드는 없다 — 세 페이지 모두 일반 규칙으로 묶였다.

`histogram=no`가 눈에 띈다. element 수가 0.6%밖에 차이 안 나는 이 세 페이지조차 전체
`tagHistogramHash`는 불일치한다. §Histogram에서 이 해시를 merge 조건으로 쓰지 않기로 한 결정의
가장 직접적인 근거다.

## Task07 vs Task08 reduction 비교

| site | verified | T07 selected | T08 selected | T07 reduction | T08 reduction | T08 family counts (dup/sib/scope/single) | largest family |
| --- | --- | --- | --- | --- | --- | --- | --- |
| domainchecker.co.kr | 19 | 19 | **4** | 0.0% | **79.0%** | 0 / 2 / 0 / 2 | 11 |
| seoworld.co.kr | 30 | 28 | **16** | 6.7% | **46.7%** | 0 / 4 / 0 / 12 | 9 |
| nextjs.org | 40 | 40 | **12** | 0.0% | **70.0%** | 0 / 3 / 5 / 4 | 9 |
| developer.mozilla.org | 23 | 23 | **9** | 0.0% | **60.9%** | 0 / 2 / 3 / 4 | 9 |
| **합계** | **112** | **110** | **41** | **1.8%** | **63.4%** | 0 / 11 / 8 / 22 | 11 |

reduction 목표치를 강제하지 않았다(§26). cap도, 규칙 완화도 없다. 이 숫자는 신호를 고친 결과다.

Task 07에서 실사이트 0건이던 `sibling-pattern` family가 11개 생성됐다. `content-duplicate`는
여전히 0건인데, 4개 사이트에 실제로 콘텐츠 중복이 없기 때문이다(Task 06/07과 동일).

## Known repeated group 변화 (§29 over-fragmentation 재검수)

| site | 그룹 | pages | Task 07 | Task 08 |
| --- | --- | --- | --- | --- |
| domainchecker | `/blog/*` | 17 | 17 singleton | **2 family (11 + 6)** |
| seoworld | `/blog/*` | 9 | 9 singleton | **1 family (9)** |
| seoworld | `/tools/*` | 9 | 9 singleton | 1 family (3) + 6 singleton |
| seoworld | `/domains/*` | 3 | 1 family(2) + 1 singleton | **1 family (3)** |
| seoworld | `/services/*` | 4 | 1 family(2) + 2 singleton | **1 family (3)** + 1 singleton |
| nextjs | `/blog/*` | 8 | 8 singleton | **1 family(5) + 1 family(2)** + 1 singleton |
| nextjs | `/docs/messages/*` | 4 | 4 singleton | **1 family (4)** |
| MDN | `Temporal/PlainDateTime/*` | 3 | 3 singleton | **1 family (3)** |
| MDN | `Reference/Errors/*` | 3 | 3 singleton | **1 family (3)** |

남은 over-fragmentation은 seoworld `/tools/*`가 가장 크다(9개 중 3개만 묶임). 실제로 구조가 다른
도구 페이지들이다(element 71–388, 입력 필드 수와 결과 테이블 유무가 다름). 규칙을 느슨하게 해서
숫자를 만들지 않았다.

## False merge 검수

**non-singleton family 19개 전부** 수동 검수했다(§27이 요구한 URL / title / routeScope /
structural profile / DOM count 비교). 위 사이트별 표가 그 결과다.

기계적 검사도 별도로 돌렸다.

| 검사 | 결과 |
| --- | --- |
| family 안에 경로 조상 쌍이 존재 (list vs detail) | **0** |
| family가 서로 다른 routeScope를 섞음 | **0** |
| family가 서로 다른 localePrefix를 섞음 | **0** |
| site root가 다른 페이지와 같은 family | **0** |
| canonical이 남을 가리키는 member가 그 대상과 같은 family | **0** |
| 저장된 profile 상 skeleton/landmark가 실제로 불일치하는 family | **0** |

§27이 실패로 규정한 조합(`home + blog`, `list + detail`, `pricing + article`,
`docs index + API reference`, `tool + marketing`) 중 실제로 발생한 것은 없다.

### §28 False Merge Safety Metric

```
non-singleton family count   19
manually inspected           19  (100%)
obvious false merge count     0
```

### 검수 중 판단이 갈릴 수 있는 2건 (숨기지 않고 기록)

1. **nextjs f000006** — `/docs/app/api-reference/file-conventions/unauthorized`,
   `/docs/app/api-reference/functions/draft-mode`, `/docs/community/contribution-guide`.
   API reference 2개와 커뮤니티 문서 1개가 같은 family다. 셋 다 nextjs docs shell을 그대로
   쓰는 **문서 본문 페이지**이고 `<table>`을 가진다는 공통점으로 묶였다. docs **index**가 아니라
   docs **article**이므로 §27의 실패 조합에는 해당하지 않는다고 판단했다.
2. **MDN f000002** — `Learn_web_development/Extensions/Forms/Basic_native_form_controls`와
   `Web/HTTP/Reference/Headers/X-Forwarded-For`. 튜토리얼과 HTTP 헤더 레퍼런스지만 MDN은 둘 다
   동일한 문서 템플릿으로 렌더한다. 재구현 관점(=이 단계의 정의)에서는 같은 family가 맞다.

둘 다 "구조 패턴을 공유하는가"라는 이 단계의 질문에는 yes이고, "의미가 같은가"라는 질문은 이
단계가 하지 않는다.

### canonical 안전성 (§17)

Task 06/07이 발견한 실제 오선언 2건이 이번에도 홈과 합쳐지지 않았다.

| 사례 | canonical | Task 08 결과 |
| --- | --- | --- |
| `domainchecker.co.kr/blog` | `https://domainchecker.co.kr/` | singleton, 홈과 다른 family ✓ |
| `seoworld.co.kr/tools/domain-checker` | `https://seoworld.co.kr/` | singleton, 홈과 다른 family ✓ |

## Verification performance 영향

wall-clock 비교는 네트워크 상태에 지배되어 신호가 묻힌다(이번 재검증이 오히려 **더 빨랐다**).

| site | candidates | avg ms/candidate (T07 → T08) | 총 candidate 시간 (T07 → T08) |
| --- | --- | --- | --- |
| domainchecker | 20 | 1665 → 1396 | 33.3s → 27.9s |
| seoworld | 30 | 1647 → 1607 | 49.4s → 48.2s |
| nextjs | 40 | 1238 → 843 | 49.5s → 33.7s |
| MDN | 40 | 931 → 479 | 37.2s → 19.2s |

그래서 **추가된 작업만 따로 측정**했다. 페이지를 한 번 로드한 뒤 두 collector를 각각 5회 실행한
in-page 시간(median):

| site | DOM elements | exact walk | **coarse walk** | ~1.5s 검증 대비 |
| --- | --- | --- | --- | --- |
| seoworld (최소) | 143 | 0 ms | **1 ms** | 0.07% |
| domainchecker (최대) | 1,133 | 1 ms | **1 ms** | 0.07% |
| MDN (최대) | 4,989 | 2 ms | **2 ms** | 0.13% |
| nextjs (최대) | 9,711 | 4 ms | **3 ms** | 0.20% |

coarse walk는 exact walk와 같은 자릿수이고, 9,711 element 페이지에서도 3ms다. computed style /
geometry / screenshot / asset / mobile pass는 전혀 하지 않으므로 Verifier는 여전히 Observer보다
훨씬 가볍다.

exact walk와 합치지 않고 **별도 순회 2회**로 둔 것은 의도적이다 — 하나로 합치면 Task 06
signature의 byte 동일성을 보장할 수 없다. 측정된 비용이 3ms이므로 그 안전을 사는 값이 싸다.

## JSON size 영향

| site | verification.json | verified-urls.json | page-families.json | selected-pages.json |
| --- | --- | --- | --- | --- |
| domainchecker | 22.4KB → 47.4KB (+111%) | 11.7KB → 36.7KB (+213%) | 33.6KB → 57.1KB (+70%) | 6.0KB → 5.5KB (−8%) |
| seoworld | 32.1KB → 71.4KB (+123%) | 16.7KB → 56.0KB (+236%) | 48.4KB → 93.0KB (+92%) | 8.7KB → 8.3KB (−5%) |
| nextjs | 40.1KB → 92.8KB (+132%) | 21.0KB → 73.8KB (+251%) | 68.4KB → 122.0KB (+78%) | 11.7KB → 10.9KB (−7%) |
| MDN | 38.2KB → 68.4KB (+79%) | 15.2KB → 45.5KB (+198%) | 50.2KB → 81.6KB (+63%) | 7.9KB → 8.2KB (+4%) |

비율은 크지만 절대값은 작다: profile 1개당 약 **1.3KB**(해시 3개 + count 36개, 들여쓰기 2칸
JSON 포함). 4개 사이트 112 URL 전체 증가분이 약 145KB이고, Task 05 실측 기준 deep observation
1페이지가 6.85MB다. 즉 **관측 1페이지의 2% 수준**이다.

전체 DOM skeleton 원문은 저장하지 않는다(가장 큰 페이지에서도 skeleton 문자열은 500자 미만이지만,
정책상 해시만 남긴다). `selected-pages.json`이 오히려 줄어든 것은 family가 줄어 대표 항목이 적어진
효과다.

## Determinism

같은 HTML → 같은 StructuralProfile. Selector도 입력 순서에 무관.

- **fixture**: 순수 함수 단위(반복 축약, depth cap 경계, bucket 경계, landmark 순서) + Selector
  determinism 3종(역순 / stride 5 순열 / 저장 배열 역순) 모두 동일 출력.
- **실데이터 4개 사이트**: `verified-urls.json`의 `urls`, `verification.json`의 `candidates`와
  `duplicateGroups`를 (a) 역순, (b) stride 7 순열로 뒤집어 재실행 → 출력 JSON **4/4 완전 동일**.

### 실사이트는 재방문 시 HTML 자체가 바뀔 수 있다 (파이프라인 한계)

정책 보정을 위해 112개 URL을 한 번 수집했고, 그 뒤 실제 검증에서 같은 URL을 다시 방문했다. 두
크롤 사이에 domainchecker blog 17개 중 **3개**의 profile이 달라졌다.

```
/blog/remove-spam-backlinks     430 el / button 19   →   424 el / button 15
/blog/startup-domain-mistakes   433 el / button 19   →   427 el / button 15
/blog/tf-cf-difference          521 el / button 19   →   515 el / button 15
```

나머지 14개는 **byte 단위로 동일한 해시**가 나왔다. 즉 코드의 non-determinism이 아니라 사이트가
서로 다른 HTML을 준 것이다(버튼을 가진 블록의 구성이 바뀜). 이 드리프트로 세 페이지가
f000003에서 f000004로 이동했지만 **두 family 모두 blog 글로만 구성되어 false merge는 생기지
않았다**. 살아있는 사이트를 관측하는 모든 단계에 해당하는 한계라 여기 기록한다.

## 발생한 문제

1. **histogram을 merge 조건으로 넣은 첫 설계가 recall을 붕괴시켰다.** `tagHistogramHash` 일치를
   요구하니 domainchecker blog 17개가 2그룹 → 13그룹이 됐다. 17개 category 중 하나만 bucket
   경계를 넘어도 깨지기 때문이다. 실측 표를 근거로 조건에서 빼고 presence mask(존재 여부)만
   guard로 남겼다. **정책을 완화한 것이 아니라, 측정해보니 해가 더 컸던 조건을 제거한 것이다.**
2. **fixture의 depth-cap 케이스가 잘못 설계됐다.** depth 7에서 `<p>` vs `<ul><li>`로 차이를
   만들었는데, 이건 element **종류** 차이라 presence guard가 정상적으로 분리했다. 테스트가 FAIL로
   잡아냈다. 같은 종류로 다시 만들고, 원래 케이스는 "presence guard 단독 검증"으로 따로 살렸다.
3. **scratchpad에서 프로젝트 모듈을 못 불러왔다.** 보정 스크립트가 프로젝트 밖에 있어
   `node_modules` 해석이 실패했다. symlink로 해결(보정 도구는 저장소에 넣지 않았다).
4. **cap 5가 그럴듯해 보였다.** 숫자만 보면 cap 5도 나쁘지 않았는데, 그룹 내용을 직접 출력해보니
   `/blog`(654 el)와 `/services`(84 el)가 한 그룹이었다. 집계 지표만 보고 정하지 않고 그룹 내용을
   전부 덤프한 것이 결정을 바꿨다.

## 현재 한계

1. **optional section을 못 버틴다.** `<section>` 하나가 생기고 사라지면 landmark tree가 바뀌어
   family가 갈린다(§Fixture positive의 측정된 한계). 이걸 허용하려면 landmark 조건을 부분 일치로
   바꿔야 하는데, 그러면 §19의 list-vs-detail 방어가 약해진다.
2. **`tagHistogramHash`가 저장은 되지만 merge 조건으로는 쓰이지 않는다.** presence만 쓴다.
   중간 강도(예: bucket 거리 ≤ 1)를 쓰려면 동치 관계가 아닌 조건을 결정적으로 분할하는 방법이
   필요하고, 이번엔 도입하지 않았다.
3. **cross-locale merge 미지원** — Task 07과 동일하게 의도적으로 보수적이다.
4. **8,000 element cap** — nextjs `generate-metadata`(DOM 9,711)가 실제로 걸렸고 `truncated:
   true`로 기록됐다. 잘린 profile도 다른 페이지와 일치할 수 있으므로 원칙적으로 위험하지만, 실제로는
   singleton으로 남았다. 잘린 profile을 family에서 제외할지는 미결.
5. **element count ratio 2.0은 전역 상수다.** 사이트 4곳 측정으로 정했고 fixture로 경계를
   고정했지만, 훨씬 다양한 사이트에서 재측정할 가치가 있다.
6. **seoworld `/tools/*` 9개 중 3개만 묶였다.** 실제로 구조가 다른 도구 페이지들이라 규칙 문제는
   아니라고 판단했지만, over-fragmentation이 완전히 사라진 것은 아니다.
7. **`terminalKind`는 여전히 grouping에 쓰이지 않는다** (Task 07과 동일).
8. **profile은 desktop 1440×900 렌더 1회 기준이다.** 반응형으로 DOM이 달라지는 사이트에서는
   viewport에 따라 profile이 달라질 수 있다.

## 다음 Task 추천

(추천만 하고 구현하지 않는다.)

### 1순위 — Multi-page Deep Observation

```
selected-pages.json → Task 03–05 Observer
```

이제 실행할 가치가 생겼다. nextjs.org는 40 → 12 관측이므로 Task 05 실측 6.85MB/page 기준
274MB → 82MB다. 스토리지 정책(screenshot 압축 등)을 함께 정하는 편이 좋다.

### 2순위 — family 대표의 대표성 검증

한 family에서 1개만 관측하는 것이 정말 충분한지, 대표가 아닌 member를 표본으로 몇 개 관측해
비교하는 검증 단계. 지금은 "구조가 같으니 충분하다"가 가정이다.

### 3순위 (선택)

- 잘린(`truncated`) profile을 family에서 제외할지 실데이터로 판단
- `terminalKind` / pagination(`?page=N`)을 결정적으로 활용할지 재검토
- 더 많은 사이트에서 depth cap 6 / ratio 2.0 재측정

## 변경 파일

신규:

- `src/verifier/structural-profile.ts` — coarse 신호 전체(in-page collector + Node 정책 + Zod schema)
- `docs/result/08-deterministic-structural-family-signals-2026-08-13.md` (본 문서)

수정:

- `src/verifier/types.ts` — `StructuralProfileSchema` 결합, `CandidateVerification` /
  `VerifiedUrl`에 `structuralProfile?` 추가, `SCHEMA_VERSION` 1 → 2
- `src/verifier/verify-candidate.ts` — valid-html 페이지에서 coarse profile 수집
- `src/verifier/build-verified-urls.ts` — profile passthrough
- `src/verifier/index.ts` — barrel export 추가
- `src/selector/types.ts` — `MAX_ELEMENT_COUNT_RATIO`, `FamilyMatchSchema`, member의
  `structuralProfile?`, family의 `shallowSkeletonHash` / `landmarkHash` /
  `structuralMatchReason`, `SCHEMA_VERSION` 1 → 2
- `src/selector/build-families.ts` — coarse key + ratio 분할 + ancestor guard + `familyMatch`
  기록 + 신규 rule invariant
- `scripts/smoke-verifier.ts` — 순수 함수 단위 검사 + §18/§19 실 DOM 페이지 22개 (81 checks)
- `scripts/smoke-selector.ts` — fixture 21 → 31행 재설계, coarse/guard/경계/무프로필 검사 (81 checks)
- `README.md` — "두 구조 신호" 섹션, Task 08 섹션, Task 07 측정 결과 갱신, 프로젝트 구조
- `ROADMAP.md` — Task 08 완료 + 측정 결과 + 다음 단계

**`src/discovery/` · `src/observer/` · `src/cli-*.ts` · `package.json`은 수정하지 않았다.**
CLI는 그대로다: `pnpm verify <discovery.json>`, `pnpm select <verified-urls.json>`.

생성된 실행 산출물(gitignored `data/`) — 기존 4개 run directory의
`{verification,verified-urls,page-families,selected-pages}.json` 갱신. **Firecrawl은 호출하지
않았고 새 discovery도 하지 않았다.**

Git add / commit / push는 수행하지 않았다.

## 검수 포인트

- **두 신호 분리**: `structural-profile.ts`가 `fingerprint.ts`를 건드리지 않는지. exact
  `structureHash` 계산 코드가 Task 06 그대로인지.
- **duplicate 불변**: `content-duplicate`가 exact 두 해시로만 만들어지는지
  (`assertFamilyRuleInvariants`가 저장 전에 강제). coarse 신호가 duplicate를 만들 경로가 없는지.
- **merge 조건이 논리곱인지**: `coarseStructureKey`가 skeleton + landmark + presence를 모두
  요구하는지. similarity score가 없는지.
- **threshold**: `MAX_ELEMENT_COUNT_RATIO = 2.0`이 전역 상수 1개이고 사이트별 분기가 없는지.
  `partitionByElementCount`가 이전 member가 아니라 그룹 **최솟값** 기준으로 자르는지.
- **list vs detail**: `dropPathAncestors`가 scope-structure에 적용되는지. 실사이트 index 페이지
  (`/`, `/blog`, `/docs`, `/tools`, `/domains`, `/services`)가 전부 singleton인지.
- **offline 보장**: `src/cli-select.ts` import graph에 playwright / firecrawl이 없는지
  (§Task 07 regression에 그래프 전체 기재).
- **결과의 정직성**: reduction 63.4%가 cap이나 규칙 완화가 아니라 신호 교체로 나온 것인지.
  `familyMatch.exactStructure`가 19개 family 전부 `false`인지(= Task 07 규칙으로는 못 묶던 것).
- **측정 기반 상수**: depth cap 6, ratio 2.0, histogram 제외 결정이 전부 실데이터 표에 근거하는지.
  코드 주석에 그 근거가 남아 있는지.
- **재현**: `pnpm typecheck`, `pnpm smoke:verifier` (81/81), `pnpm smoke:selector` (81/81), 그 뒤
  4개 run에 대해 `pnpm verify <discovery.json>` → `pnpm select <verified-urls.json>`.
- Secret / API key는 소스·CLI 출력·저장 JSON·본 문서 어디에도 기록하지 않았다.
