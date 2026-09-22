# 01 — Demo Site: 부스트 인테리어 (`boost-interior-demo`)

> **2026-09-20 재확인:** 아래 내용은 그대로 유효하다. 승인 이미지는 여전히 0 / 51이고 사이트 이미지는 전부 stand-in이다. 후보 staging 폴더 `references/boost-interior/generated-candidates/`(README만)를 추가했다 → 사람이 할 일은 `07-human-review-guide.md`.

| 항목 | 값 |
|---|---|
| Site Instance | `data/sites/boost-interior-demo/` (신규. fixture는 건드리지 않음) |
| Pinned release | `interior-01-1.4.0-9e1ea20da947` (hash `9e1ea20d…0961`) — **새 release 없음** |
| Current build | buildInputId `4d3d08f4d35b11e9ffa768056082f57afe22d0d20450499a74c2da576008706f` |
| packageHash | `0830462fb5d5cd965b015a8a584c9281f7f23eda36c3adb87b36f70d3cea3eff` |
| siteSnapshotHash | `432bc438dc97e1588b3c5e23b2b639c91b48687b8d9da64c08483d85365ac5cf` |
| Package | `data/site-builds/boost-interior-demo/packages/<buildInputId>/site/` — 12 HTML pages, 1.9 MB, QA pass, warnings 0 |
| Routes | home 1 · portfolio.index 1 · portfolio.detail 8 · (404) · `portfolio.page` 0 → **자동 prune** (8 < page size 30) |
| 빌드 명령 | `pnpm site:build boost-interior-demo` |

로컬에서 보기: `npx serve data/site-builds/boost-interior-demo/packages/4d3d08f4…/site` (정적 패키지, 서버 코드 없음).

## 브랜드

- 브랜드명 **부스트 인테리어** / locale `ko-KR` / origin `https://boost-interior-demo.example` (`.example`은 예약 도메인 — 실제로 resolve되지 않는다)
- 방향: 한국 아파트 · 실거주 · 화이트톤 · 미니멀 · 수납 · 동선
- 핵심 메시지: **"생활에 맞춘 설계, 오래 편안한 집"**
- 거짓 business claim 없음: 수상·시공 건수·경력 연수·인증·고객 수 어느 것도 쓰지 않았다 (독립 copy 리뷰에서도 0건).
- 연락 수단은 이메일 하나(`hello@boost-interior-demo.example`). 전화·주소·사업자번호는 만들지 않았다.

## Theme (Template이 consume하는 token만)

| token | 값 | 의도 |
|---|---|---|
| color.canvas | `rgb(250,248,244)` | warm off-white |
| color.surface.secondary | `rgb(242,238,231)` | 섹션 구분용 웜 그레이 |
| color.text.primary / secondary / muted | `rgb(35,34,32)` / `rgb(87,83,78)` / `rgb(118,112,105)` | charcoal 계열 |
| color.action.primary | `rgb(184,84,22)` | restrained warm orange (CTA·링크) |
| color.border | `rgb(228,222,212)` | |
| radius.medium | `10px` | |
| typography | Pretendard → Apple SD Gothic Neo → Malgun Gothic → Noto Sans KR | 웹폰트 로드 없음 (시스템 폰트; non-local request 0 유지) |

fixture-large(Harbor & Pine Studio)는 theme.json이 없어 Template 기본 테마를 쓴다: 순백 canvas `rgb(255,255,255)`, 검정 action `rgb(26,26,26)`, radius 4px, Helvetica, en-US, 텍스트 wordmark.
부스트 인테리어는 canvas·action color·radius·폰트 스택·언어·로고(SVG)·이미지·문구가 전부 다르다 — 테스트 V가 4개 사이트의 home 렌더가 서로 다름을, W가 site token이 package stylesheet에 도달함을 확인한다.

## 페이지 구성

**Home** — hero 3 슬라이드(banners@1) → intro(설계 철학 + `/portfolio` 링크) → 대표 프로젝트 4 (Projects A) →
다른 시공 사례 4 (Projects B) → 고객 후기 6 → image band → footer. 전 페이지에 floating CTA **"상담 문의"** (mailto).

| Hero slide | headline | CTA |
|---|---|---|
| hero-living | 생활에 맞춘 설계, 오래 편안한 집 | 대표 프로젝트 보기 → `bi-01` |
| hero-storage | 수납이 정리되면 집이 넓어집니다 | 수납 중심 리모델링 보기 → `bi-03` |
| hero-consult | 우리 집에 맞는 공사 범위가 궁금하다면 | 상담 문의 → contact |

**Portfolio** — 8 프로젝트, 필터 5종(검색·공사 유형·평형·스타일·평당 공사비) + 정렬 6종, 전부 한국어 라벨.
nav는 실제 route만: 홈 · 프로젝트 · 상담 문의.

**Projects** (하나의 canonical `projects.json`)

| id | 제목 | 면적 (basis) | 유형 | 평당 공사비 | 기간 | 공간 그룹 |
|---|---|---|---|---|---|---|
| bi-01 ★ | 수성 화이트 34평 아파트 리모델링 | 34평 (supply) | 전체 리모델링 | 290만 | 6주 | 거실 3 · 주방 3 · 현관 2 · 복도·수납 1 · 침실 2 · 욕실 2 = **13컷** |
| bi-02 | 신혼부부를 위한 24평 화이트 내추럴 리모델링 | 24평 | 전체 리모델링 | 240만 | 4주 | 4 |
| bi-03 | 42평 가족형 아파트 수납 중심 리모델링 | 42평 | 전체 리모델링 | 320만 | 8주 | 5 |
| bi-04 | 32평 주방·욕실 중심 리뉴얼 | 32평 | 주방·욕실 리뉴얼 | — | 2주 | 주방 2 · 욕실 2 (**공사 전/후 2쌍**) |
| bi-05 | 29평 밝은 내추럴 아파트 리모델링 | 29평 | 전체 리모델링 | 260만 | 5주 | 4 |
| bi-06 | 34평 현관·거실 중심 리모델링 | 34평 | 부분 리모델링 | — | 2주 | 4 |
| bi-07 | 19평 소형 아파트 화이트 미니멀 리모델링 | 19평 | 전체 리모델링 | 270만 | 4주 | 4 |
| bi-08 | 51평 신축 아파트 입주 전 홈스타일링 | 51평 | 입주 전 홈스타일링 | 160만 | 3주 | 4 |

평당 공사비가 없는 bi-04 / bi-06은 detail에서 해당 행이 **렌더되지 않는다** (빈 값·0 표시 없음, 확인함).

**Reviews** — 6건, 전부 가상. attribution은 "34평 아파트 · 4인 가족" 형식 — 실명·단지명·계약 정보 없음.

## 이미지에 대한 정직한 고지

현재 사이트의 51개 이미지는 **전부 일러스트 stand-in(SVG)** 이다. AI 사진은 한 장도 생성되지 않았다 (이 환경에 이미지 생성 수단이 없다 — `03`).
레이아웃·crop·텍스트·필터·CTA는 검증되지만, **"고객이 보고 납득하는 포트폴리오 사이트"인지는 아직 판정할 수 없다.**
승인 이미지를 `references/boost-interior/generated-approved/`에 넣고 스크립트 3개를 돌리면 content 문서 수정 없이 교체된다.

## 스크린샷

`screens/` — home(320/390/800/1000/1440/1920), portfolio(390/1440), filtered portfolio(390/1440),
flagship detail(390/1440), before/after detail(390/1440), 404(390/1440). 각 full-page + fold.
모아 보기: `human-review/site.html`. AI 이미지 검수용: `human-review/index.html`.
