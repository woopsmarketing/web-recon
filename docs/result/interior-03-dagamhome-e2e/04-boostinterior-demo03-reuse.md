# interior-03 — 04. BoostInterior Demo 03 (같은 release 재사용)

작성일 2026-10-09.

## 요약

```
REFERENCE_SITE                   = nuridam-interior-demo (가상 브랜드 "누리담 인테리어")
BOOST_SITE                       = boost-interior-demo-03 ("부스트 인테리어")
SAME_TEMPLATE_RELEASE            = YES (interior-03-1.0.0-2a949e9f0247, 두 site.json의 id + 전체 hash 동일)
TEMPLATE_FILES_CHANGED_FOR_REUSE = 0 (release 1.0.0 기준)
SITE_DATA_SEPARATED              = YES
THEME_SEPARATED                  = YES
THEME_DIFFERENT_FROM_DEMO02      = YES
TEMPLATE_FILES_CHANGED_FOR_THEME = 0 (release 1.0.0 기준)
SOURCE_BRAND_LEAK                = 0
FIXTURE_BRAND_IN_DEMO03_PACKAGE  = 0
```

release를 만들기 **전** staging에서 Demo 03를 시험 build했을 때 template 결함 2건이 드러났고, release 전에 고쳤다(§5).
release를 만든 뒤 Demo 03 때문에 바뀐 template 파일은 없다.

## 1. 두 site가 다른 점은 site data뿐

| | `nuridam-interior-demo` | `boost-interior-demo-03` |
|---|---|---|
| release pin | `interior-03-1.0.0-2a949e9f0247` | 같음 |
| brand · origin | 누리담 인테리어 · origin 없음 | 부스트 인테리어 · `https://interior-demo-3.boostweb.co.kr` |
| projects · categories | 20건 · 2개 | 8건(bi-01…08) · 4개 |
| theme | template 기본값(`theme.json` 없음) | `theme.json` 21 token |
| `settings.json` | override 없음 | `site.seo`, `site.floater`, `home.band`, `home.portfolio`, `portfolio.detail` |
| `scripts.json` · `inquiry.json` · `integration.json` | 없음 (문의는 mail hand-off) | 있음 (전용 BoostChat key, online 문의, feed opt-in) |
| package | `98a32234…` · 242 files · 8,838,388 B · HTML 29 | `d5a7904f…` · 168 files · 7,846,504 B · HTML 16 |

`platform/test/interior-03.test.ts`의 E · G · K · L · M · N이 고정한다: pin이 byte 단위로 검증되는 같은 release이고, release가 working tree와 같고,
interior-03를 pin한 site는 이 둘뿐이다.

## 2. Demo 03의 내용 — 기존 BoostInterior demo에서 가져옴

새 회사 사실은 만들지 않았다. `content/`(projects · categories · banners · business · reviews)는 Demo 02와 byte 단위로 같다.
문구는 Demo 02의 `slots.json`에서 가져와 interior-03의 slot 길이에 맞췄다.

| section | 가져온 곳 | 비워 둔 것 / 새로 쓴 label |
|---|---|---|
| header · footer · 404 | Demo 02 `site.header` / `site.footer` / `site.not-found` | 전화 block, 사업자 정보 2–6행은 비움(demo data에 전화 · 주소 · 등록번호 없음) |
| home.hero | Demo 02 `about.page.intro` 두 줄 | slide label "{n}번째 슬라이드", "슬라이드 멈춤/재생" |
| home.gallery | Demo 02 service tier 제목/설명 | 제목 "공사 유형별 시공사례" |
| home.band | Demo 02 footer CTA 제목, nav label | – |
| home.portfolio · portfolio.* | Demo 02 `portfolio.index` / `portfolio.detail` label | 검색 placeholder "제목으로 검색", "{n}페이지" |
| about.page | Demo 02 `about.page` intro · introBody · systemBody, `home.service.quote` | 서명(직함/이름)은 비움(인물 없음) |
| service.page | Demo 02 `service.page` lineup, `home.service`, `home.brands` | – |
| faq.page | Demo 02 FAQ 9건. 이 template에 없는 기능을 말하는 문장 3개는 뺌(평형/스타일 filter, 평당 공사비, 선택 입력 항목) | 표 머리글 label |
| contact.page | Demo 02 `contact.page` 문구 · 오류 · 상태 · 정책 | "건물 형태", "예산", "초기화" |

Media: Demo 02의 사진 그대로. 넓은 banner가 필요한 자리 3곳만 기존 사진에서 1600×600으로 잘라 추가했다
(`site-banner-about` ← bi08-living-01, `site-banner-service` ← bi03-living-01, `site-banner-support` ← bi06-living-01).
footer의 e-mail은 기존 demo들이 이미 공개하고 있는 business e-mail이다.

Settings:

```json
{"site.seo":{"indexing":"noindex"},
 "site.floater":{"toTop":true,"externalWidget":{"width":64,"height":64,"right":18,"bottom":18}},
 "home.band":{"enabled":true,"icons":["estimate","notice","company","chat"]},
 "home.portfolio":{"enabled":true,"limit":6,"selection":{"mode":"manual","ids":["bi-01","bi-03","bi-02","bi-04","bi-06","bi-08"]}},
 "portfolio.detail":{"facts":true,"groupLabels":true}}
```

## 3. Theme

Demo 02(따뜻한 beige 바탕 + graphite + orange)와 다른 조합: **흰 바탕 + deep green + clay**. BoostInterior의 mark는 같은 모양에 색만 바꿨다.

| token | template 기본 | Demo 03 | Demo 02 |
|---|---|---|---|
| `color.canvas` | `#ffffff` | `rgb(255,255,255)` | `rgb(250,248,244)` |
| `color.surface.secondary` | `#f5f5f5` | `rgb(243,245,241)` | `rgb(242,238,231)` |
| `color.text.primary` | `#333333` | `rgb(30,41,37)` | `rgb(35,34,32)` |
| `color.action.primary` | `#333333` | `rgb(22,44,37)` | `rgb(35,34,32)` |
| `color.accent.primary` | `#b9a25f` | `rgb(54,124,97)` | `rgb(217,105,31)` |
| `color.accent.secondary` | `#ab8373` | `rgb(166,86,42)` | `rgb(230,211,184)` |
| `decoration.radius.small / medium` | `0` / `3px` | `4px` / `8px` | `6px` / – |
| `typography.body` | local 고딕 stack | Pretendard stack | Pretendard stack |

대비(계산값): 본문/바탕 15.0, 보조 7.9, muted 5.5(면 위 5.05), 흰 글자/accent(선택 tab · gold 버튼) 4.99, accent 글자/흰 바탕 4.99, 버튼 글자 11.6 이상.
색은 전부 `theme.json`에 있고 template CSS에는 색 literal이 없다(테스트 S · T).

## 4. Floating UI 자리

interior-02 1.0.1의 seam을 처음부터 넣었다. site가 `site.floater.externalWidget`에 widget의 닫힌 상자를 선언하면 template이
`<html data-ext-widget style="--i3-ext-w/-h/-right/-bottom">`를 내고, to-top과 footer 여백이 그 값으로 비켜난다. 좌표는 template에 없다(테스트 P · Q · R).

- Demo 03: 64×64, right 18, bottom 18. to-top은 44×44로 그 위(right 28, bottom 94)에 놓인다. 390 · 1440에서 겹침 없음.
- hero의 dot · 정지 버튼은 hero 하단 가운데라 corner와 떨어져 있다. 이 template에는 하단 고정 bar가 없다.
- 열린 drawer는 to-top보다 위 layer다.
- 실제 widget과의 위치 확인은 `05-boostchat-and-domain.md`.

## 5. release 전에 고친 것 (reuse 시험에서 드러남)

| 결함 | 분류 | 처리 |
|---|---|---|
| home gallery tile이 3–4개면 둘째 줄이 첫 줄 설명에 붙음(reference site는 category 2개라 안 보였음) | generic bug | row gap 추가. tile 2개일 때는 그대로 |
| drawer의 현재 메뉴가 accent 색 글자인데, accent가 어두운 theme에서는 어두운 panel 위에서 대비 2.96:1 | generic bug (theme 값에 따라 깨지는 template) | accent를 panel 글자색 쪽으로 섞음 → Demo 03에서 5.7:1 |

둘 다 BoostInterior만을 위한 요청이 아니고 어떤 site에서도 생기는 결함이라 template에서 고쳤다.
그 뒤 release 1.0.0을 만들었고 두 site를 그 release로 build했다.

## 6. Build

| site | build | package | files | bytes | HTML | QA |
|---|---|---|---|---|---|---|
| nuridam-interior-demo | 8.2 s (install 1.7 · preflight 0.3 · next 5.8 · QA 0.04) | `98a322344b7b…` | 242 | 8,838,388 | 29 | pass |
| boost-interior-demo-03 | 8.1 s (install 1.4 · preflight 0.2 · next 6.0 · QA 0.03) | `d5a7904fe368…` | 168 | 7,846,504 | 16 | pass |

Demo 03은 8건이라 `portfolio.page`가 없다(18건/쪽). build는 결정적이다(staging과 정식 트리에서 같은 입력으로 만든 package의 hash가 같았다).

위 표는 최종 release `interior-03-1.0.0-2a949e9f0247`의 build다. 금지어 목록을 줄이기 전의 release `interior-03-1.0.0-f353e5954217`로 만든 package(`4ac4c703…`, `9394a9da…`)와 비교하면
file 목록이 같고, build id · release id를 가리고 보면 `build-record.json` 말고는 모든 file의 내용이 같다(`proof/recut-package-equivalence.txt`).
