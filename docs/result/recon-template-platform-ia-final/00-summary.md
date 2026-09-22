# interior-01 정보구조 마무리 (1.5.0) — 요약 (2026-09-21)

**STATUS: PASS**. 이번 작업은 Template-only 새 minor release입니다. 기존 release와 `platform/` 구현은 건드리지 않았습니다.

## 식별자

| 항목 | 값 |
| --- | --- |
| 새 release | **`interior-01-1.5.0-75f173939e77`** (releaseHash `75f173939e778bb6f49d15e4ba2fbcd092e93b849009862a1afe1a26d9a3863c`, templateSourceHash `24d23c8f432e…`, 62 files) |
| boost-interior-demo build | **buildInputId `6c74d34c2ecdf84be601f3c4f7974378f4d138a7c44ee0fac86485c8e1e67c43`** |
| package hash | **`c28ad0131b71f69394c408099b5a4486d2d9bd72136d77c369cdc7189a2e5aa7`** · QA pass · HTML 15 pages · 경고 0 · raster 51 / 51 |
| rollback | `previous` = 1.4.2 package `fb723e0924ac…`. 1.4.0 / 1.4.1 / 1.4.2 release는 pre-cut capture와 byte 단위로 동일합니다 (ia150 R1). |
| fixtures | fixture-large `571f0f32…` · fixture-small `e2052ae2…` · fixture-empty `b3da982d…`. `fixtures:generate`로 1.5.0에 re-pin했습니다. |

root에서 한 cut은 마지막 devroot 후보와 release id, 네 buildInputId, 네 packageHash가 모두 같습니다. 즉 검증한 것과 배포한 것이 같습니다.

## 새 route

| path | route key | 내용 |
| --- | --- | --- |
| `/3d-portfolio` | `portfolio3d` | placeholder 페이지입니다. 제목 "3D 포트폴리오", 한 줄 본문, "포트폴리오 보기" pill만 있습니다. |
| `/about` | `about` | 제목, lead, 사진, 본문 2문단, 설계 기준 5개를 보여줍니다. 기준은 생활 동선 · 수납 · 채광 · 오래 편안한 공간 · 실거주 중심입니다. 끝에 견적 문의 CTA와 포트폴리오 링크가 있습니다. 사진은 기존 asset `site-hero-02`를 재사용했고 새 이미지는 0장입니다. |
| `/contact` | `contact` | 견적 문의 form입니다. 필드는 이름*, 연락처*, 지역, 평형, 공사 유형(select), 예상 일정, 문의 내용*입니다. 이메일 주소를 직접 표시합니다. |

기존 route인 `/`, `/portfolio`, `/portfolio/<slug>` 8개, 404는 그대로입니다. sitemap에 새 page 3개를 추가했습니다 (canonical 포함).

## 네비게이션 구조

- **Desktop (≥ 900 px)**: 로고 · 포트폴리오 · 3D 포트폴리오 · 소개 · **[견적 문의]** pill. 이전 "프로젝트" 메뉴는 "포트폴리오"로 바꿨고 중복 메뉴는 없습니다. 기존 header 상담 CTA(pill, 이전에는 mailto)를 **견적 문의 메뉴 자체**로 삼아 `/contact`로 연결했습니다. 그래서 contact 링크는 header에 하나만 있습니다. `aria-current`는 현재 페이지에 `page`, 상세 페이지에서는 포트폴리오에 `true`입니다. 900 px에서도 한 줄로 들어갑니다 (`screens/header-900.png`).
- **Mobile (< 900 px)**: 로고와 hamburger(44×44, "메뉴 열기")만 보입니다.
- **상담 CTA 정리**: floating 「상담 문의」, 상세 페이지 「상담 문의하기」, hero의 contact 슬라이드가 모두 `/contact`로 갑니다. 조건은 사이트에 연락 채널(business email)이 있을 때입니다. 채널이 없는 사이트(fixture-empty)에는 이전처럼 CTA가 전혀 없습니다. `/contact` 페이지에서는 floating seat가 CSS로 숨겨집니다. 같은 페이지를 가리키고 form과 겹치기 때문입니다.

## Hamburger 동작

- client-only native modal `<dialog>`입니다. 1.4.2 사진 뷰어와 같은 패턴이라 서버 HTML에는 menu markup이 없습니다. 오른쪽 sheet(최대 360 px)로 열리고 backdrop이 깔립니다.
- 열리면 `aria-expanded=true`와 `aria-controls=i1-menu`가 설정되고 dialog label은 "메뉴"입니다. focus는 닫기 버튼("메뉴 닫기")으로 갑니다. Tab 포커스는 dialog 밖으로 나가지 않습니다 (modal).
- 닫는 방법은 네 가지입니다: **ESC**, **닫기 버튼**, **backdrop 탭**, **메뉴 링크 탭**. sheet 안의 빈 곳을 탭하면 닫히지 않습니다. 닫히면 focus가 hamburger로 돌아오고 scroll 위치도 유지됩니다.
- 링크를 탭하면 client navigation 전에 먼저 닫힙니다. 새 페이지는 항상 닫힌 상태로 시작합니다 (4개 링크 전부 확인).
- **scroll lock**은 `html:has(.i1-menu[open]) { overflow: hidden }`로 겁니다. wheel을 굴려도 페이지가 움직이지 않습니다.
- **floating CTA 충돌 없음**: 메뉴가 열려 있는 동안 seat가 숨겨집니다. dialog도 top layer라 seat 위에 그려집니다.
- 메뉴를 연 채 창을 900 px 이상으로 넓히면 자동으로 닫힙니다. hidden modal이 페이지를 inert로 만드는 것을 막기 위해서입니다.
- 추가로 금지된 global은 쓰지 않았습니다 (release gate 통과). `matchMedia`와 `document`만 사용합니다.

## /contact — 허위 성공 처리 없음

- backend는 없습니다. form에 `action`/`method`가 없고 submit 시 네트워크 요청이 0건입니다 (smoke에서 확인).
- submit하면 브라우저 기본 required 검증(이름, 연락처, 문의 내용)을 먼저 거칩니다. 통과하면 `mailto:hello@boost-interior-demo.example`로 제목 "[견적 문의] {이름}님"과 "라벨: 값" 줄로 된 본문을 만들어 사용자의 메일 앱에 넘깁니다.
- 버튼 위 안내문: "온라인 접수는 아직 연결되어 있지 않습니다…"
- 버튼 아래 status(`role=status`): "메일 앱에서 내용을 확인한 뒤 보내 주세요. **아직 전송된 것은 아닙니다.** 메일 앱이 열리지 않으면 …로 보내 주세요."
- 모든 페이지에 "접수 완료"류 문구가 0건입니다 (ia150 P6, smoke D).
- email이 없는 사이트에서는 form을 렌더하지 않고 중립 문구 한 줄만 보여줍니다. 연락 채널을 지어내지 않습니다.

## 검증 (repo root, 상세는 `01-validation.md`)

| 항목 | 결과 |
| --- | --- |
| typecheck | platform tsc 오류 0, root tsc 오류 0 |
| `test:platform` | slice1 72 · step4 47 · step41 35 · step5 32 · polish 4 · step52 12 · step6 29 · predemo 10 · predemo2 9 · **ia150 15 (신규)** → **265 passed / 0 failed** |
| 신규 `scripts/template-platform-ia-smoke.ts` | **114 / 114** |
| 1.4.2 회귀 smoke | predemo2 177 / 177 · gallery 35 / 35 · step6 237 / 237 · fixture polish 962 / 962 |

1.4.2 기능은 그대로 유지됩니다: hero carousel(화살표 포함), 전체 gallery와 room tabs, lightbox, footer demo notice, 51 raster, portfolio filter, 평당 가격 formatter. 모두 위 회귀 smoke와 test에서 PASS했습니다.

## 고객 데모 가능 여부

**가능합니다 (READY FOR CUSTOMER DEMO).** 메뉴 4개, 모바일 hamburger, 새 페이지 3개, `/contact` 연결이 모두 정적 export package 안에서 동작합니다. 확인 범위는 `/`, `/portfolio`, 상세, 3D, 소개, 문의 페이지를 1440과 390에서 본 결과입니다: overflow 0, console error 0, 외부 요청 0.

## 남은 제약 (수정하지 않고 기록만)

1. **새 페이지 3개는 interior-01 ≥ 1.5.0의 모든 사이트에 생성됩니다.** route plan에 정적 페이지를 사이트별로 켜고 끄는 장치가 없어서입니다. 필요하면 Platform route-gating seam을 따로 만들어야 합니다 (이번에는 구현하지 않음).
   - fixture 사이트에는 중립 영어 기본 문구가 나옵니다 (3D placeholder, "About" + business summary).
2. **/contact는 mailto hand-off일 뿐 실제 접수가 아닙니다.** 메일 앱이 없는 기기에서는 안내 문구와 주소 표시만 가능합니다. 실제 inquiry backend는 `contactHref`/`InquiryForm` seam에 나중에 붙이면 됩니다.
3. **iOS 실기기 검증은 하지 않았습니다.** 대상은 hamburger의 scroll lock과 뒤로가기 제스처입니다. 1.4.2 뷰어와 같은 제약입니다.
4. 이전부터 이어진 항목은 변동 없습니다: L2(`area.basis` 미표시), L3(배너 CTA가 portfolio index를 가리킬 수 없음), OG 태그 없음, 가상 콘텐츠(`.example` 도메인)라 그대로 public 배포하면 안 됨.
5. `/about` 사진은 hero 슬라이드 2(`site-hero-02`)와 같은 이미지입니다. 새 AI 이미지 금지 조건에 따라 재사용했습니다.

## 변경 파일

- **Template (→ 1.5.0)**
  - `template.ts`: version, history note, routes 3개, header slot 5개, 새 section 3개
  - 신규 `sections/AboutPage.tsx`, `sections/Portfolio3dPage.tsx`, `sections/ContactPage.tsx`
  - 신규 `components/MobileMenu.tsx`, `components/InquiryForm.tsx`
  - 신규 `app/about/page.tsx`, `app/3d-portfolio/page.tsx`, `app/contact/page.tsx`
  - 수정 `sections/SiteHeader.tsx`, `sections/links.ts`, `sections/FloatingCta.tsx`, `sections/PortfolioDetail.tsx`, `sections/HomeHero.tsx`, `components/Icon.tsx`(+MenuIcon), `styles/template.css`
- **Site**: `data/sites/boost-interior-demo/site.json`(pin만), `slots.json`
  - 메뉴 "프로젝트"→"포트폴리오", 목록 제목 → "포트폴리오", 뒤로가기 → "포트폴리오 목록으로", intro 링크 → "포트폴리오 둘러보기"
  - header 라벨 추가, about/3D/contact 한국어 문구 추가
  - fixture 3개는 `fixtures:generate`로 re-pin
- **Tests**
  - 신규 `platform/test/ia150.test.ts` (15 checks, `test:platform`에 연결)
  - 신규 `platform/test/canonical-150.ts`
  - 일반화: `slice1`, `step4`, `step41`, `step5`, `step6`, `predemo` — 방식은 `01-validation.md` §일반화
- **Scripts**
  - 신규 `scripts/template-platform-ia-smoke.ts`
  - 일반화: `template-platform-step6-visual-smoke.ts`, `template-platform-polish-visual-smoke.ts`
- **`platform/**` 구현 (test 제외)**: 변경 없음 (ia150 R3가 pre-change capture와 byte 단위로 비교)
- `package.json`: `test:platform`에 ia150 추가
