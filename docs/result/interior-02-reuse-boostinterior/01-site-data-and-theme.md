# 01 — Site Data와 Theme (boost-interior-demo-02)

`data/sites/boost-interior-demo-02/`만 새로 만들었습니다. `templates/interior-02/v1/`과
`data/template-releases/`는 건드리지 않았습니다(변경 파일 0).

## 1. 파일과 출처

| 파일 | 내용 | 출처 |
|---|---|---|
| `site.json` | siteId, 브랜드 "부스트 인테리어", pin `interior-02-1.0.0-dbfa5d41678d` (hash `dbfa5d41…7d591f`) | pin은 `ongyeol-interior-demo`와 같은 값. origin은 `https://boost-interior-demo-02.example` (운영 publish가 범위 밖이라 자리표시 값) |
| `content/{projects,categories,reviews,banners,business}.json` | 시공사례 8건(bi-01…08), 유형 4개, 후기 6건, 배너 3건, 이메일 | 기존 `boost-interior-demo`에서 그대로 복사 |
| `assets/` | 사진 51장 + `logo.svg` + `mark.svg`, `registry.json` 53개 | 사진은 기존 demo 그대로. 로고 2개는 아래 §3 |
| `slots.json` | 19개 section의 문구 (선택 slot 중 대비가 낮게 나오는 작은 라벨은 비움 — `03` §2-1) | 기존 demo의 공식 문구를 우선 사용, 없는 자리는 시공사례 기록에서 도출 |
| `settings.json` | 홈 수동 선정, 필터(평·만 원/평), 아이콘·톤 | interior-02 section 선언 범위 안의 값 |
| `theme.json` | token 19개 | §4 |
| `scripts.json`, `inquiry.json` | BoostChat widget script, 견적 문의 endpoint | 기존 demo 파일과 바이트 동일 |

만들지 않은 파일: `portfolio.source.json`(있으면 sidecar 없이 build가 실패), `integration.json`(tenant당
first-party origin은 하나이고 이미 기존 demo가 갖고 있음).

## 2. 지어내지 않은 것

기존 demo에 없는 회사 사실은 쓰지 않았습니다.

- 전화번호·주소·영업시간·사업자 정보: 없음. `site.header`의 전화 slot, footer의 지점/시간, `home.showrooms`
  section 전체를 비웠습니다. 문의 수단은 폼과 이메일(기존 demo의 값)뿐입니다.
- 연혁·수상·시공 건수 같은 실적: 없음. about 연혁 slot을 비웠습니다.
- 숫자는 모두 시공사례 8건에서 계산한 값이고 "(시공사례 기준)"이라고 적었습니다.
  전체 리모델링 5건 19–42평 · 4–8주 · 평당 240–320만 원 / 부분 2건 32·34평 · 2주 / 홈스타일링 1건 51평 · 3주 ·
  평당 160만 원 / 지역 6곳 / 고객 한마디 5건. 보고서 작성 전에 `projects.json`으로 다시 계산해 맞는 것을 확인했습니다.
- 총 공사비는 어느 기록에도 없어 "총 공사비는 견적 문의로 안내합니다"로 표시합니다.
- FAQ 9개는 데모 안내 / 시공사례 / 견적 문의 주제로, 사이트에 실제로 있는 내용만 답합니다.
- footer와 contact에는 기존 demo의 가상 브랜드 고지 문구를 그대로 넣었습니다.

`010-1234-5678`은 전화번호 입력 예시 문구입니다(기존 demo의 `phoneHint`와 같은 예시).

## 3. 로고 — site data로 해결한 320px overflow

기존 demo의 `logo.svg`는 188×32(약 5.9:1)입니다. interior-02 header는 ≤640px에서 로고 높이를 32px로 고정하고
폭을 줄이지 않아서, 320px 화면에서 header가 12px 넘쳤습니다(`innerWidth 332`). Ongyeol 로고(188×46)는 넘치지 않습니다.

같은 마크와 워드마크를 interior-02의 로고 상자(188×46)에 맞춰 다시 배치한 `logo.svg`를 이 사이트의 asset으로
넣어 해결했습니다. template 수정 없음. footer용 `mark.svg`는 같은 마크만 잘라낸 64×64입니다.

template 쪽 사실로 남는 것: **가로로 긴 로고(대략 4.9:1 초과)는 320px에서 header를 넘칩니다.** 다음 사이트도
로고를 이 상자에 맞춰야 합니다.

## 4. Theme

기존 BoostInterior 브랜드 색이 있어 그것을 썼습니다(`boost-interior-demo/theme.json`, 로고 SVG).
Ongyeol은 `theme.json`이 없어 template 기본값(흰 바탕 · 네이비 `#0d1b2d` · 민트 `#00c6c6` · 노랑 `#f3c969`)으로
그려집니다. Demo 02는 같은 token 이름에 다른 값을 줍니다.

| token | template 기본값 (Ongyeol) | Demo 02 | 값의 출처 |
|---|---|---|---|
| `color.canvas`, `surface.primary` | `#ffffff` | `rgb(250, 248, 244)` 아이보리 | 기존 demo theme |
| `color.surface.secondary` | `#f5f5f5` | `rgb(242, 238, 231)` | 기존 demo theme |
| `color.text.primary` / `secondary` / `muted` | `#111` / `#555` / `#999` | `rgb(35,34,32)` / `rgb(87,83,78)` / `rgb(118,112,105)` | 기존 demo theme |
| `color.action.primary` | `#0d1b2d` 네이비 | `rgb(35, 34, 32)` 차콜 | 로고 워드마크 색 |
| `color.accent.primary` | `#00c6c6` 민트 | `rgb(217, 105, 31)` 오렌지 | 로고 마크 색 `#d9691f` |
| `color.accent.secondary` | `#f3c969` 노랑 | `rgb(230, 211, 184)` 샌드 | **새로 정한 색**(색으로는 유일) |
| `color.border.default` / `strong` | `#ddd` / `#111` | `rgb(228,222,212)` / `rgb(35,34,32)` | 기존 demo theme |
| `decoration.radius.small` | `0` | `6px` | 새로 정한 값. 기존 demo는 `radius.medium: 10px`를 쓰지만 interior-02는 그 token을 쓰지 않아 `small`로 둥근 인상을 옮김 |
| `typography.body`, `heading` | Montserrat 우선 스택 | Pretendard 우선 스택 | 기존 demo theme |

판단이 들어간 부분:

- interior-02는 `color.action.primary`를 footer·hero·3번째 tier 등 **어두운 면**의 색으로 씁니다. 기존 demo에서
  이 token은 테라코타(`rgb(184, 84, 22)`)였지만, 여기서는 그 자리에 차콜을 넣고 오렌지는 accent로 보냈습니다.
  테라코타를 그대로 넣으면 사이트의 큰 면이 모두 주황이 되고 그 위 글자 대비도 떨어집니다.
- accent 위 글자는 `text.primary`입니다. 로고 오렌지 `#d9691f` 위 차콜 글자의 대비는 약 4.5:1, 기존 demo의
  테라코타였다면 약 3.3:1입니다.

`TEMPLATE_FILES_CHANGED_FOR_THEME = 0`.

### theme으로 바꿀 수 없었던 것 (template에 값이 적혀 있음)

| 위치 | 값 | 영향 |
|---|---|---|
| `styles/shell.css:527` footer 쇼케이스 사진 위 veil | `rgb(12 22 36 / .74→.54)` (네이비 계열) | 따뜻한 팔레트에서 사진이 푸르게 보임. site data에서 더 따뜻하고 어두운 사진(`bi08-living-01`)을 골라 완화 |
| `styles/base.css:44-52` 혼색 기준색 | `#000`, `#5a3d00`, `#003a3a`, `#d7dde6` | accent 위 보조 글자색이 원래 노랑·민트 기준으로 계산됨 |
| token `color.link`, `decoration.radius.medium` | 선언만 되고 쓰이지 않음 | 값을 줘도 변화 없음 |

모두 "기본 테마의 색이 template CSS에 일부 남아 있다"는 같은 종류의 사실입니다. 이번 작업에서는 고치지 않았고
(§7 분류는 `00-summary.md` §3), 다음 interior-02 patch release 후보로 적어 둡니다.

## 5. Section 단위 분리

- 화면에 보이는 문구는 전부 `slots.json` / `content/*.json` / `site.json`에서 옵니다. 9개 route(홈, 목록, 상세 2개, service, about, faq, contact, 404)를
  1440px과 390px에서 렌더해 영문 글자열을 모두 뽑았고(`proof/scripts/textscan.mjs.txt`), 최종 package에 남은 것은 site data에
  직접 적은 `FAQ`(header 링크 · 탭 라벨), 브랜드 표기 `BoostInterior`, 이메일, ARIA 표준어 `carousel` / `slide`뿐입니다.
  template의 영문 기본 문구는 하나도 새지 않았습니다.
- 한 가지 주의: interior-02의 slot은 **비워 두면 영문 기본값이 그려집니다.** 탭바 라벨을 비워 탭바를 끄려고 했다가
  영문 탭바가 나와서 한글 라벨을 채웠습니다. 탭바를 site data로 끌 방법은 없습니다.
- `platform/test/interior-02.test.ts`의 새 검사 O가 widget host와 key가 template tree(83개 파일)와 release(102개 파일)
  어디에도 없음을 확인합니다.

`SECTION_LEVEL_CONTENT_SEPARATION = PASS`
