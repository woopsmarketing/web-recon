# interior-03 — 01. Discovery · Source Observation · Interaction Forensics · Preservation

작성일 2026-10-09. 대상(design reference): `https://www.dagamhome.com/interior/`.
본 문서는 이미 수집된 증거 파일만으로 작성했다(재관찰 없음). 증거 루트 `EV` = `data/www.dagamhome.com/` (git-ignored; 스크린샷 `.jpg/.png`는 경로로만 참조).
원본의 인명·전화·주소·사업자번호·고객 게시글 제목은 본 문서에 옮기지 않는다.

## 요약

- 입력 URL `https://www.dagamhome.com/interior/` → 97개 public URL 발견·검증(97/97 `valid-html`, redirect 0, 차단 0). 모든 페이지의 `<link rel=canonical>`은 사이트 루트 `http://www.dagamhome.com/`를 가리킨다(섹션 루트와 다름). — `EV/2026-10-09T09-15-10-416Z/{discovery,verification}.json`
- 구조 family 14개 → 대표 14 URL(83개 축약, 85.6 %). 페이지 유형은 HOME · ABOUT · BLOG · 포트폴리오 목록(gallery, pt=1/2) · 포트폴리오 상세 · 견적문의 게시판(목록/상세/비밀글 게이트) · 공지/Q&A(빈 게시판) 7종. — `page-families.json`, `selected-pages.json`
- pipeline `observe --source-package` 7회 전부 exit 0; 수동 관찰 18회(B-visual) + 25회(C-interaction) 페이지 로드, 전부 GET, 폼 제출·잠금글 열람 없음.
- 반응형 실 breakpoint는 2개(`≤768` 모바일 헤더/드로어, `≤480` 폰 레이아웃) + 데스크톱 미세 조정 3개(1140 / 1040 / 980). HOME만 769–1159 px에서 `min-width:1160px` 가로 overflow.
- 상호작용: 히어로 cross-fade(1500 ms easeOutQuint, 4000 ms autoplay, dot bar hover 시 정지), 모바일 드로어(300 ms easeOutQuart, backdrop·scroll-lock 없음), 즉시형 `:hover` 색/투명도 변화뿐. sticky header·lightbox·accordion·scroll reveal·dropdown 없음.
- 폰트: 선언 스택의 Korean web font(Noto Sans KR early-access)는 mixed-content + CORS로 한 번도 로드되지 않음 → 로컬 fallback(NanumGothic on macOS) 렌더. Poppins 600 / Ramaraja 400 / FA5 solid만 실제 web font.
- 보존 클론: resources 412 중 388 localized / 24 failed(모두 원본도 404), script 15/15 neutralized, sanity 3 case 모두 `ok:false`이나 높이·텍스트·이미지는 live와 일치(툴링 한계만 실패).

## 1. 증거 지도

| 단계 | 경로 (`EV/…`) | 내용 |
|---|---|---|
| A discovery | `2026-10-09T09-15-10-416Z/` | `discovery.json`(97), `discovery.raw.json`, `playwright-crawl-links.json`(crawl 통계), `verification.json`, `verified-urls.json`, `page-families.json`, `route-archetypes.json`, `selected-pages.json` |
| A manual shots | `manual-observation/A-discovery/` | 16 jpg: `{A-home,B-works-list,C-works-detail,D-about,E-blog,F-request-board-list,G-request-write-form,X-evidence-locked-post-gate}-{1440,390}.jpg` |
| B pipeline observe | `2026-10-09T09-19-38-371Z` … `09-26-30-824Z` (7 dirs) | `observation.json`, `layout-probe.json`, `layout-probe-mobile.json`, `viewports/{desktop,mobile}/{rendered.html,dom.json,styles.json,assets.json,links.json,screenshot.png,source-package/}` |
| B manual | `manual-observation/B-visual/` | `NOTES.md`(299줄), `BREAKPOINTS.md`, `measurements/*.json`(per-element computed style), `measurements/summary/`(45 md: `spec-<page>-<w>-<ctx>.md` 37 + `transitions/continuous/colors/images/fonts-network/fixed-ua/load-log.md`), `shots/`(56 jpg) |
| C interaction | `manual-observation/C-interaction/` | `NOTES.md`(37행 interaction table), `timing/`(20 json), `shots/`(45 jpg), `etiquette-log.jsonl`(49 events) |
| preservation | `preservation-clones/2026-10-09T09-24-32-559Z/` | `manifest.json`, `resource-map.json`, `residual-dependencies.json`, `desktop/index.html`, `mobile/index.html`, `assets/`(372), `styles/`(16), `scripts/`(13), `sanity-shots/`(6 png) |
| 실행 로그(scratch) | `scratchpad/obs-visual/logs/{pipeline-index.txt,observe-*.log,preserve-build-home.log,preserve-sanity-home.log}` | exit code, sanity JSON 원문 (repo 밖, 세션 한정) |

## 2. PHASE A — Discovery

### 2.1 URL

| 항목 | 값 | 근거 |
|---|---|---|
| 입력 URL | `https://www.dagamhome.com/interior/` | `discovery.json.rootUrl` |
| 선언 canonical | `http://www.dagamhome.com/` (97/97 페이지 동일, http, 섹션 밖) | `verification.json.candidates[].canonicalUrl`, `duplicateGroups[0]`(type `canonical`, 97) |
| 실제 기준 | `/interior/` 섹션을 source of truth로 유지(canonical은 상위 사이트 루트를 가리키므로 식별자로 쓰지 않음) | — |
| `/interior/` vs `/interior/index.html` | 동일 내용(content-fingerprint dup 그룹), family 분리됨(`f000001`, `f000014`) | `page-families.json` |
| provider | `playwright-public-navigation` (Firecrawl 미사용), engine `playwright-chromium`, 1440×900, ko-KR/Asia/Seoul | `discovery.json.provider`, `verification.json.profile` |

### 2.2 수량

| 지표 | 값 | 근거 |
|---|---|---|
| crawl에서 본 링크 전체 / same-host / `/interior/` 내부 | 408 / 369 / 349 | `playwright-crawl-links.json.counts` |
| 후보(candidates) / 실제 로드한 페이지 | 347 / 122 | 같은 파일 (`loadedDesktop`) |
| 섹션 밖 same-host 링크(제외) | 20 (예: `/home1.html…home5.html`, `/hm_board/…`) | `sameHostOutOfSection` |
| 외부 링크(제외) | 39 (호스트 3개: 외부 블로그 3, 오픈채팅 1, SEO 숨김 링크 35) | `external` |
| DISCOVERED_URLS | 97 (`requestedLimit` 100, dup 0, invalid 0) | `discovery.json`, `discovery.raw.json` |
| VERIFIED_URLS | 97 (`valid-html` 97, http/nav error 0, non-html 0, redirect 0, unique final 97) | `verification.json`, `verified-urls.json.count` |
| duplicate groups | 8 (canonical 1 + content-fingerprint 7: 크기 18/7/7/7/5/2/2) | `verification.json.duplicateGroups` |
| PAGE_FAMILIES | 14 (content-duplicate 6, sibling-pattern 3, scope-structure 2, singleton 3; 최대 family 23) | `page-families.json`, `selected-pages.json.familyTypeCounts` |
| REPRESENTATIVE_PAGES | 14 (reduction 83, rate 0.8557) | `selected-pages.json` |

97 URL의 경로 구성: `view2.php`(works 상세) 25 · `board2.php`(works 목록, pt=1/2 + paging) 24 · `board.php?cate=request`(견적 목록/paging) 23 · `view.php?cate=request`(견적 상세) 10 · `ck_lock.php`(비밀글 비밀번호 게이트) 9 · HOME 2(`/`, `index.html`) · `about1.html` 1 · `blog1.html` 1 · `board.php?cate=notice` 1 · `board.php?cate=qna` 1.

### 2.3 Page families와 대표 페이지

| family | type | n | 대표 URL (`…/interior/` 이후) | 템플릿 관점 |
|---|---|---|---|---|
| f000001 | singleton (root-protected) | 1 | `/` | HOME |
| f000014 | singleton | 1 | `index.html` | HOME 동일본 |
| f000002 | scope-structure | 2 | `blog1.html?cate=blog` (+`about1.html`) | 정적 서브페이지(ABOUT/BLOG) |
| f000003 | scope-structure | 2 | `hm_board/board.php?…cate=qna` (+`cate=notice`) | 빈 게시판 + LNB 탭 |
| f000004 / f000005 / f000006 | content-dup ×2, sibling | 7 / 5 / 11 | `board.php?…cate=request` 및 paging 변형 | 견적문의 목록(table) |
| f000007 / f000008 / f000009 | content-dup ×2, sibling | 7 / 7 / 10 | `board2.php?…pt=1`, `pt=2`, paging | 포트폴리오 gallery 목록 |
| f000010 / f000011 | content-dup, singleton | 18 / 1 | `view.php?…cate=request&number=…` | 견적 상세(비밀글 → 게이트) |
| f000012 / f000013 | content-dup, sibling | 2 / 23 | `view2.php?…number=164`, `number=179` | 포트폴리오 상세 |

- desktop/mobile 전용 페이지: 없음. 10개 페이지 모두 UA에 관계없이 element count·structure hash 동일, `<meta viewport>` `width=device-width, initial-scale=1.0`, HOME/ABOUT은 HTML 바이트까지 동일. — `B-visual/measurements/summary/fixed-ua.md`
- 관찰에 실제 사용한 대표 집합(design grammar 최소 집합): HOME, LIST(pt=2; pt=1은 구조 동일 확인), DETAIL, ABOUT, BLOG, INQUIRY 목록, INQUIRY 글쓰기 폼(GET만), SUPPORT notice/qna.
- 주의: pipeline DETAIL 관찰에 쓰인 `view2.php?…number=206`은 crawl에서 로드된 122개 중 하나이지만 97개 pipeline 집합(`inPipeline:false`)과 14개 대표 목록(164/179)에는 없다. 글쓰기 폼 `write.php`는 discovery 97에 없고(목록 페이지의 버튼으로만 도달) B/C 단계에서만 관찰됐다. — `playwright-crawl-links.json.candidates`

## 3. PHASE B — Source observation

### 3.1 Pipeline `observe --source-package` 7회 (`scratchpad/obs-visual/logs/pipeline-index.txt`, 각 run `observation.json`)

| run dir (`EV/`) | 페이지 | exit | desktop docH / mobile docH | elements | assets (desktop) | links | 비고 |
|---|---|---|---|---|---|---|---|
| `2026-10-09T09-19-38-371Z` | HOME `/interior/` | 0 | 3739 / 2965 | 284 | 61 (unique 43) | 81 | preserve:build 입력; scrollReveal candidates 6, overlay flagged 0 |
| `2026-10-09T09-20-22-220Z` | LIST `board2.php?…pt=2` | 0 | 3021 / 2391 | 314 | 65 / 43 | 84 | |
| `2026-10-09T09-23-41-905Z` | DETAIL `view2.php?…number=206` | 0 | 31733 / 19565 | 290 | 78 / 73 | 60 | 54장 이미지, run 46.7 MB |
| `2026-10-09T09-24-30-324Z` | ABOUT `about1.html` | 0 | 2688 / 3057 | 213 | 31 / 26 | 59 | |
| `2026-10-09T09-25-12-626Z` | INQUIRY `board.php?…cate=request` | 0 | 1921 / 1761 | 370 | 41 / 25 | 79 | |
| `2026-10-09T09-25-53-472Z` | SUPPORT `board.php?…cate=notice` | 0 | 1480 / 1071 | 201 | 29 / 24 | 63 | |
| `2026-10-09T09-26-30-824Z` | BLOG `blog1.html` | 0 | 1592 / 2101 | 189 | 27 / 22 | 62 | |

공통: engine playwright-chromium 151, desktop 1440×900 DPR1 / mobile 390×844(isMobile, hasTouch), `waitUntil load` + networkIdle + fonts ready, documentStatus 200, layout probe 16 widths(320…1920) 양쪽 context 모두 coverage ratio 1.0, `truncated:false`. settle 로그 "images n/n settled (0 failed)" 전 run. — `observation.json.{layoutProbe,layoutProbeMobile,responsiveSummary}`, `observe-*.log`

### 3.2 수동 측정(B-visual) 방법과 로드

- Playwright 1.62.1 Chromium, desktop 1440×900(→1024→768 리사이즈, 재로드 없음) + mobile 390×844 DPR2 Android UA. 18회 로드(09:27:14–09:31:48 UTC, 3 s 간격), 29-width 스윕(1920…320) + 모바일 6-width 미니 스윕. — `B-visual/NOTES.md` §0·§10, `measurements/run-log.txt`, `summary/load-log.md`
- 저장 텍스트에서 개인정보는 `[PHONE]/[BIZNO]/[ADDRESS]/[NAME]`로 치환됨. — `NOTES.md` 머리글

### 3.3 페이지별 핵심 레이아웃(1440 기준, `B-visual/NOTES.md` §8, `spec-<page>-1440-desktop.md`)

| 페이지 | header / hero·visual | 본문 구조 | footer까지 |
|---|---|---|---|
| HOME | topbar 34 + header 120(absolute, 스크롤 시 사라짐) / hero 1440×800, 3 slide bg cover, slogan icon 108² + 44 px 2행, dots bottom 20 | `#s1` 2×539 타일(540×320 img) → `#s3` 376 tall 밴드(Ramaraja 16 + 26 px 문구 + 4 원형 130² 아이콘) → `#s2` 12 카드 3×352(239 img + 15 px 제목) → pill 버튼 204×44 | footer 199(`#f5f5f5`, 좌 880 px 텍스트 + 우측 전화 블록 168×48) |
| LIST | visual 252(`sub_visual*.jpg` auto 100 % 크롭) + 44 px h3 + gold bar 44×4 | 카운트 줄 13 px 우측 → 18 카드 3×330(img 330×224.4, 제목 15.4 px) gap 55 → paging 30×30 박스 → 검색 박스(select 53 + input 150 + image button 52) | 210 |
| DETAIL | 동일 visual | 제목 박스 1100×68(`#fbfbfb`, 1 px `#ddd`) → 본문 16.4/26 중앙 → 54 `<p>`(pt 15) 안 이미지 natural 480×720 / 720×480, 업스케일 없음 → 목록 버튼 106.9×40 | — |
| ABOUT | 동일 | 텍스트 열 385 + 장식 png 430×29 → `about.jpg` 1100×333 → 3열 341(img 222 + h5 18.4 + p 14.6) → 좌 img 550 / 우 텍스트 495 | 607.8(float 미해제) |
| INQUIRY | 동일 | 테이블 th 47.5(top 2 px `#444`), 열 110/660/110/110/110, 행 52 ×12, 빨간 상태 badge + 자물쇠 아이콘 → paging → 글쓰기 버튼 95.2×40 → 검색 | — |
| WRITE | 동일 | `table.tb_form` 11행, th 153.9(`#f9f9f9`), 입력 35 tall 1 px `#e1e1e1`, textarea 930×187, 확인/취소 86.6×40 | — |
| SUPPORT | 동일 + `#lnb` 2탭 550×47(선택 `#ad9654`) | 빈 게시판(“등록된 글이 없습니다” 161 tall) + paging | — |
| BLOG | 동일 | 3 카드 352(img 350×227.9 + 텍스트 박스 min-h 259 + 버튼 290×37 `#a79663`) | — |

### 3.4 반응형 전환(`B-visual/BREAKPOINTS.md`, `summary/transitions.md`, `summary/continuous.md`)

| WIDTH(≤) | 변화 |
|---|---|
| ≥1160 | 기준 레이아웃. `.res_wrap` 1100 센터, nav `li` pad 0 30 |
| 1159…769 (HOME만) | `#main_wrap{min-width:1160}` → 가로 overflow 19(1141) · 136(1024) · 391(769). 서브페이지는 overflow 없음 |
| 1140 (서브) | `.res_wrap` max 1100 → 98 % (1003.5 @1024) — 내부 전부 비례 축소 |
| 1040 (서브) | nav `li` pad 0 30 → 0 15 |
| 980 (서브) | `#content` pad 90/110 → 70/70, `#page_title p` 숨김 |
| 768 | 모바일 레이아웃. `#header` 숨김, `#mobile_header` 65, 드로어 250×100vh fixed @left −250. `.res_wrap` 92 %. hero 800→370, visual 252→140, `.section` pad 90→60, `#s2` 3→2열, LIST 3→2열, ABOUT/BLOG 3→1열, 게시판 작성자/날짜/조회 열 숨김 + `.write_info`, 폼 th/td block, footer 센터 + `.add768` 전화 블록 |
| 480 | 폰 레이아웃. `.res_wrap` auto + margin 0 12(366 @390). hero 370→260, visual 140→90, `.section` pad 40, `#s1` 2→1열, `#s3` 4→2×2(120²), h3 24/30, gold bar 35×3, ABOUT `about_mobile.jpg` 교체 |
| 320 | 새 변화 없음(모든 폭 = viewport − 24) |

모바일 context(isMobile, DPR2) 스윕 값은 같은 폭의 desktop context와 동일(docH HOME 2965 @390 등). 고정 요소는 전 페이지 `div.mobile_menu.shedow2` 하나뿐(769+ 에서 0×0). popup 0. — `summary/fixed-ua.md`

## 4. PHASE C — Interaction forensics (`C-interaction/NOTES.md` §1 요약; 측정 방식: jQuery event inventory + rAF 샘플링, non-GET 요청은 네트워크 레벨에서 차단)

| # | SOURCE_PAGE | ACTION | OBSERVED_RESULT | DESKTOP vs MOBILE | LOOP | TIMING | IMPORTANCE | 근거(`C-interaction/`) |
|---|---|---|---|---|---|---|---|---|
| 1 | HOME | 로드 | 3 slide 절대 중첩, JS가 DOM-ready에 2·3번을 opacity 0으로 fade(최상단 3번이 1번으로 녹아듦), dot1 `.select`; popup/dialog 없음 | 동일(hero 390×260) | – | load 시점 slide2/3 opacity 0.18 | high | `timing/home-desktop-observations.json`(`heroInitial`), `shots/home-desktop-01-load.jpg` |
| 2 | HOME | autoplay 4주기 관찰 | opacity cross-fade(in→1, out→0 동시). 순서 1→2→3→1. dots: 선택 20×10 sprite `0 −10px`, 비선택 10×10. 화살표 없음 | 모바일 동일(3507/7508 ms) | LOOP(3→1 되감기 없음) | 선언 1500 ms easeOutQuint — 측정 ≥99.95 % @1167–1186 ms, RMSE 0.006–0.015; 간격 4000/3997/4019/3981 ms | high | `timing/home-desktop-hero-autoplay-samples.json` |
| 3 | HOME | dot bar(`#banner_nav` 130×21) hover | autoplay 정지(9.5 s 동안 fade 0). leave 후 새 4 s 타이머 | 모바일 hover 없음; dot tap 후 타이머 유지 | – | leave→다음 fade 4008 ms | high | `…observations.json`(`pauseOnNavHover`,`restartAfterNavLeave`) |
| 4 | HOME | hero 이미지/문구 hover | autoplay 계속(dot bar만 정지) | n/a | – | – | high | `pauseOnBannerBodyHover` |
| 5 | HOME | 비인접 dot 클릭 | `.select` 즉시 이동 → 같은 1.5 s fade; `href="#"` 차단; 진행 중 fade는 `.stop()` 후 재시작 | tap 동일 | – | 1184 ms | high | `timing/home-desktop-hero-dotclick-samples.json` |
| 6 | HOME(m) | hero swipe | 아무 반응 없음(touch handler 0) | desktop drag도 없음 | – | – | medium(추가 금지) | `timing/home-mobile-observations.json`(`swipe`) |
| 7 | HOME | GNB 링크 hover | `#333 → #ab8373` 즉시(사이트 전체에 CSS transition 0개). submenu/dropdown 없음, header 높이 불변 | GNB ≤768 숨김 | – | 0 ms | medium / high(메가메뉴 만들지 말 것) | `shots/home-desktop-05-hover-nav.jpg`, `desktopMenu` |
| 8 | HOME | topbar 링크 hover | `#777 → #333` 즉시; 로고 hover 변화 없음 | 모바일 topbar 없음 | – | 0 ms | low | `hoverProbes` |
| 9 | HOME | `#s1` 타일 / `#s2` 카드 / `#s3` 원 / 더보기 pill hover | `li` opacity 1 → 0.8 · 동일 · border `#e8e8e8 → #d4c9ac` · bg `#333 → #555`, 전부 즉시 | touch 시 변화 없음 | – | 0 ms | medium | `shots/home-desktop-06…09-hover-*.jpg` |
| 12 | ALL | 스크롤 | header `position:absolute`(120 / 65) — 스크롤 시 사라짐. fixed는 화면 밖 드로어뿐. scroll reveal/parallax/count-up 0개 | 동일 | – | – | high(sticky 없음, 정적 페이지) | `shots/home-desktop-10-scrolled-800.jpg`, `stickyProbe`, `scrollRevealProbe` |
| 13 | ALL | 키보드 Tab | 순서 topbar 2 → 로고 → GNB 6 → 본문. `*{outline:0}`로 focus ring 없음 | n/a | – | – | medium(a11y) | `shots/about-desktop-01-focus-after-9-tabs.jpg` |
| 14 | HOME(m) | 햄버거 tap | `.mobile_menu`(fixed 250×100vh `#252525` z2000) `left −250 → 0`. 상단 50 px(HOME + ⊗ 26²) + 6행 46 px 15 px bold `#ddd`, `+` 아이콘 장식. backdrop·scroll-lock·바깥 tap 닫기·submenu·aria·focus 이동 없음 | desktop에서 도달 불가 | – | open 284 ms(17 frame), easeOutQuart RMSE 0.024(선언 300 ms) | high | `timing/home-mobile-drawer-open-samples.json`, `shots/home-mobile-02-drawer-open.jpg` |
| 15 | HOME(m) | ⊗ tap / 드로어 항목 tap | `left 0 → −250` 같은 곡선 / 항목은 일반 href 전체 로드(handler 없음) | – | – | 286 ms | high / medium | `timing/home-mobile-drawer-close-samples.json`, `drawerItemHandlers` |
| 17 | LIST | 카테고리 pt=1/pt=2 | 별도 서버 페이지 전체 로드; GNB `.selected`(`#ab8373`); pt=2 166건 / pt=1 23건 | 동일 | – | 450–950 ms | medium | `shots/list-desktop-01…`, `-06-pt1-page1.jpg` |
| 18 | LIST | 카드 hover | `a` opacity 1 → 0.6(썸네일만, 제목은 `a` 밖) | 2열, hover 없음 | – | 0 ms | medium | `shots/list-desktop-02-hover-card.jpg` |
| 19 | LIST/게시판 | pagination | 18장/페이지(3×6 / 2×9) → 166건 10페이지; 번호 6개 블록, `‹ ›`는 블록 단위 이동, 첫/끝에서는 `javascript:void(0)` dead link. 현재 `<strong>` `#ff6600`, 30×30 박스; hover bg `#f4f4f4` border `#555`; 클릭 = 전체 로드 scrollY 0 | 모바일 동일 크기 | NON-LOOP | 클릭 로드 1168 ms | high | `shots/list-desktop-03…05`, `timing/list-detail-desktop-observations.json` |
| 20 | LIST/게시판 | 검색(미제출) | gallery `GET board2.php`(select 1 옵션 + input maxlength 30 + image button); 게시판 `POST board.php`(3 옵션). JS 없음, focus 스타일 없음 | 366 px 박스 안 동일 | – | – | low | `shots/list-mobile-02-paging-search.jpg` |
| 21 | DETAIL | 로드+스크롤 | 54 `<img>` 세로 스택 natural size, lazy loading 없음(전부 load 시 요청), prev/next·댓글·iframe 없음; 목록보기 버튼 | 모바일 pad 20 0 5, 이미지 366 px | – | – | high | `shots/detail-desktop-03-scrolled-stack.jpg` |
| 22 | DETAIL | 이미지 클릭 | 아무 반응 없음. colorbox는 전 페이지 로드·DOM 주입되지만 바인딩 0 | tap 동일 | – | – | high(lightbox 없음) | `shots/detail-desktop-02-after-image-click.jpg` |
| 23 | 게시판 | `.myBtn` | hover 없음, `:active` → `top:1px` | – | – | 즉시 | low | `detail.listButton` |
| 24 | SUPPORT | LNB 탭 | 2탭 550×47, 선택 `#ad9654` 흰 글자, 비선택 hover `#444 → #ad9654`; 클릭 = 전체 로드. `.tb_faq` accordion 0 | 187×37, 선택 12 px/비선택 14 px(CSS 특이점) | – | 526 ms | medium | `shots/support-desktop-01-lnb-hover.jpg` |
| 25 | INQUIRY | 로드/행 hover | 451건, 12행/페이지, 전 행 자물쇠 + 빨간 badge(`#d10008`); 제목 hover `#333 → #e4a02a`, 행 hover 없음; 잠금글 = 비밀번호 프롬프트(열지 않음) | 번호/제목 2열 + `.write_info`, 행 72 | – | 0 ms | medium | `shots/inquiry-desktop-02-hover-row.jpg` |
| 26 | INQUIRY | 글쓰기 폼 열람 | `form method=post enctype=multipart`, 11행(작성자·연락처·이메일·주소·면적·건물형태·공사예산·제목·비밀번호·내용+비밀글 checkbox(기본 checked)·파일 2). 필수표시는 input bg 아이콘. captcha·개인정보 동의·에디터 없음. 확인 = `checkIt_form` 순차 `alert`, 취소 = `history.back()` | th/td block, 입력 100 % | – | – | high(폼 형태) | `shots/inquiry-desktop-03-write-form.jpg`, `timing/inquiry-desktop-observations.json`(`writeForm`) |
| 27 | INQUIRY | 입력 blur/Tab 검증 | 없음(blur/keyup handler 0, 메시지·스타일 변화 없음) | 동일 | – | – | medium | `writeForm.blurProbe` |
| 28 | BLOG | 카드 버튼 hover/클릭 | bg `#a79663 → #444` 즉시; `target=_blank`(rel 없음) 새 탭 | 버튼 334×37 | – | 0 ms | low/medium | `shots/blog-desktop-01-hover-button.jpg`, `blog.externalClick` |
| 29 | ALL | tel:/mailto:/기타 링크 · 페이지 전환 | footer `tel:` 2개(데스크톱 `.cs`, 모바일 `.add768`), `mailto:` 없음; ADMIN `_blank`; 0×0 숨김 SEO 블록 35링크. 페이지 전환은 handler 없는 전체 로드, body fade 없음 | 동일 | – | 440–1200 ms | low / medium | `inventory.tel`, `links`, `etiquette-log.jsonl` |

존재하지 않음(검증됨, `NOTES.md` §2): sticky/fixed header · dropdown/mega menu · scroll reveal/parallax/CSS transition · quick menu/scroll-to-top · lightbox · 2번째 slider(slick 로드되나 `.slick-initialized` 0) · popup layer · swipe · FAQ accordion · in-place tabs · lazy loading · captcha/동의 박스/에디터 · focus indicator · 동영상/iframe · `mailto:`.

Etiquette: 25회 로드(로그 24 + 크래시 run 1), 전부 GET, non-GET은 사이트 자체 Naver Analytics `POST wcs.naver.com/b` 25회뿐(로컬 차단). 제출·잠금글·ADMIN·드로어 항목 클릭 없음. — `etiquette-log.jsonl`(PAGE_LOAD 24, BLOCKED_NON_GET 25)

## 5. Source preservation (`preservation-clones/2026-10-09T09-24-32-559Z/`)

| 항목 | 파일에서 확인한 값 | 근거 |
|---|---|---|
| 입력 | HOME run `2026-10-09T09-19-38-371Z` (captured 09:19:04Z), builder `preservation-clone 1.0.0`, built 09:24:37Z | `manifest.json.source/builder` |
| 정책 | `sourceJsExecution: disabled`, `geometryReconstruction: none`, `apiReplay: none`, allowedHosts 9 | `manifest.json.policy` |
| variants | desktop 1440×900 / mobile 390×844, `domSource: runtime-dom` | `manifest.json.variants[]` |
| styles (각 variant) | 18 = authored-linked 14 / unresolved 3 / authored-inline 1 | `variants[].styleCounts` |
| scripts (각 variant) | 15 total / 15 neutralized / 0 executed; 원본 JS 바이트 659,963 B `scripts/`(13 파일)에 보존, 어느 문서도 참조하지 않음 | `variants[].scriptCounts`, `limitations[2]` |
| rewrites | localized 33 attrs, absolutized 73, cssUrlsRewritten 395 | `variants[].rewrites` |
| resources | total 412 = localized 388 (shared 388, viewport-specific 0) + failed 24 + skipped 0; dedupedByHash 3; `assets/` 파일 372 | `manifest.json.resources`, `resource-map.json.counts`, `ls assets` |
| failed 24 내역 | Noto Sans KR early-access 폰트 18(6 weight × otf/woff/woff2, 원본 `fonts.gstatic.com` 404) + 원본 사이트 gif 6(`blet1.gif`, `bg_bd_list.gif`, `bg_section.gif`, `icon_section.gif`, `t_id.gif`, `t_pw.gif`, 원본 404) | `resource-map.json.resources[status=http-error]` |
| residual | 81 = fetch-failed 24 + navigation-link 57; `stillRequestedFromSource` 24 | `residual-dependencies.json.counts` |
| limitations | markup+CSS only, JS 미실행, API replay 없음, desktop/mobile 별도 tree, "NOT source-independent: 24 resource(s) still fetched" | `manifest.json.limitations` |
| sanity (3 case) | `SANITY FAILURES: 3` — desktop/desktop-1024/mobile 모두 `ok:false`. 단 scrollHeight 3739 / 3739(scrollWidth 1160, overflow 136 = live와 동일) / 2965 = live docH 일치, `brokenImgs 0`, `hasExpectedText true`, `liveScripts 0`, sheets 5 / rules 130 | `scratchpad/obs-visual/logs/preserve-sanity-home.log`, `sanity-shots/{desktop,desktop-1024,mobile}{,-full}.png` |
| sanity 실패 원인 | (a) desktop: 로컬 404 4건 — 숨겨진 모바일 드로어 전용 `/img/{logo_m,btn_m_home,btn_m_menu_close,icon_plus}.png`(루트 상대 경로가 클론 서버에 매핑되지 않음); (b) mobile: 로컬 404 — Font Awesome 4.2.0 webfont `woff/ttf`; (c) 공통: 재호스팅된 FA5 `all.css`의 SRI `integrity` 불일치로 차단; (d) 공통: Noto Sans KR 12 파일 CORS(`No Access-Control-Allow-Origin`) — live 사이트에서도 동일하게 실패 | 같은 로그 `localFailures`, `errors` |

판정: 보존 클론은 reference evidence / screenshot / structure verification 용도로 충분(높이·텍스트·이미지 일치). 실패 항목은 모두 원본에서도 로드되지 않는 리소스이거나 클론 서버 경로 매핑 한계이며, 템플릿은 어차피 이 runtime에 의존하지 않는다.

## 6. SOURCE VISUAL SYSTEM (`B-visual/NOTES.md` §2–§7, `summary/{fonts-network,colors,images}.md`)

### 6.1 FONT_SYSTEM (선언 vs 실제 렌더)

| 역할 | 선언 `font-family` | 실제 렌더(CDP platform font) | 근거 |
|---|---|---|---|
| body·nav·제목·버튼·footer(≈95 %) | `"Noto Sans KR","Open Sans","Malgun Gothic","Nanum Gothic",NanumGothic,Gulim,굴림,Dotum,돋움,Arial` | NanumGothic(로컬, `custom:false`) — Korean·Latin 모두 | `fonts-network.md`: `http://fonts.googleapis.com/earlyaccess/notosanskr.css`·Open Sans css mixed-content 차단 ×36, `fonts.gstatic.com/ea/notosanskr/v2/*` 12파일 `net::ERR_FAILED`(CORS), `document.fonts` Noto Sans KR 300/400/500/700 = `error` |
| 섹션 영문 제목 `.tit.ft_po` | `Poppins, sans-serif` | Poppins SemiBold 600(web font, 600만 fetch) | `css2?family=Poppins…` 200, woff2 200 |
| `#s3 .p1` 영문 | `Ramaraja, serif` | Ramaraja 400(web font) | `css2?family=Ramaraja` 200 |
| 모바일 footer 전화 아이콘 | `"Font Awesome 5 Free"` 900 | FA5 Solid(web font) | `use.fontawesome.com/releases/v5.2.0` css+woff2 200; FA 4.2.0(http)은 차단 |
| Nanum Myeongjo | css 200 로드 | 사용 노드 0(92 face unloaded) | `document.fonts` |
| 폼 input/select | `"Malgun Gothic",Dotum,돋움,Arial` 14/13 px | Apple SD Gothic Neo(시스템) | CDP |
| paging | `tahoma, Arial` 12/700 | Tahoma | CDP |

Windows 방문자는 Malgun Gothic으로 보게 되며, 디자이너 의도 Korean face는 UNKNOWN(web font가 로드된 적 없음).

### 6.2 TYPE_SCALE (px size / weight / line-height / letter-spacing; 1440 → 768 → 390) — `NOTES.md` §3

| 역할 | 1440 | 768 | 390 | 색 |
|---|---|---|---|---|
| 히어로 slogan `p2` | 44 / 400(강조 span 600) / 54 / −2 | 26 / 32 | 20 / 26 | #333 |
| 섹션 제목 `.tit.ft_po`(Poppins) | 40 / 600 / 50 / 0 | 30 / 40 | 24 / 30 | #333 |
| 서브 `#page_title h3` | 44 / 700 / 50 / −2 | 34 / 700 / 37 / −1 | 24 / 30 / −1 | #222 |
| 서브 visual `h2`(흰색, text-shadow 2 2 rgba(0,0,0,.05)) | 40 / 600 / −0.5 | 30 | 24 | #fff |
| 서브 caption `#page_title p` | 15.2 / 18 / −0.4 | 숨김(≤980) | 숨김 | #444 |
| GNB `#gnb a` | 18 / 600 / 40 / −1 | – | – | #333, 현재 #ab8373 |
| topbar | 12 / 34 / +0.4 (칩) · 13.2 / 34 | – | – | #fff on #cacaca · #777 |
| `#s3 .p1`(Ramaraja) / `.p2` | 16 / 400 / 20 / +1 · 26 / 31 / −1 | 12.3 · 22 | 12.3 · 18 / 22 중앙 | #b9a25f · #333 |
| `#s1` 타일 `.p1` / `.p2` | 22 / 600 · 12.3 / 300 | 18 · 12.3 | 18 · 12.3 | #333 · #a9a9a9 |
| 카드 제목(HOME `#s2` / LIST) | 15 / 500 / −0.5 · 15.4 / 400 / 18 | 13 · 15.4 | 13 · 13.4 / 16 | #333 |
| DETAIL 제목 박스 / 본문 | 21.4 / 600 (#111) · 16.4 / 400 / 26 (#222) | 동일 | 18.6 / 22 · 16.4 / 26 | |
| ABOUT base / `.sub_t` / 섹션 h / arch h / arch p | 16 / 24 / −1 · 21 / 500 · 23 / 600 · 19 / 500 / 25 · 16 / 300 / 24 | 14 / 22 · 18 · 21 · 19 · 16 | 14 / 22 · 18 / 22 · 21 / 22 · 17 / 25 · 14 / 22 | #444 / #333 |
| BLOG h5 / p / 버튼 | 21 / 600 / 24 · 14 / 300 / 22 (#666) · 14 / 500 / 37 | 동일 | 동일 | |
| 게시판 th / td / badge | 14 / 600 / 46 / −1 (#444) · 14 / 300 / 20 (#777) · 10.6 / 13 / −0.6 | td 번호 15 / 600 (#666), `.write_info` 12 / 15 | 동일 | |
| paging(Tahoma) | 12 / 700 / 28 (#666, 현재 900 #ff6600) | 동일 | 동일 | |
| 폼 th / input / textarea / 힌트 | 15 / 500 / 18 (#444) · 14 / 34 (#888) · 13 · 12 / 20 (#777) | 동일 | 동일 | |
| `.myBtn` / 더보기 pill | 13 / 600, pad 10 30 · 14, pad 12 50, r 30 | 15 / 600, pad 10 25 · 12.4, pad 10 40 | 동일 | 흰색 on #444(#777 gray) · on #333 |
| footer 전화 / 정보 / copyright | 16 / 24 (#222) · 13 / 19 (#888) · 12 / 20 (#737373) | 17 / 24 + FA 17 | 동일 | |
| base body | 14 / 400 / 20 / −0.5 | 동일 | 동일 | #333 |

letter-spacing 규칙: Korean 본문 −0.5, 제목 −1, 히어로/페이지 제목 −2; Poppins 0, Ramaraja +1.

### 6.3 CONTAINER / GRID / SPACING — `NOTES.md` §4, `BREAKPOINTS.md` §2–§4

- Container `.res_wrap`: max-width 1100 센터(x 170 @1440). 서브 98 % ≤1140 → 92 % ≤768 (706.6) → auto + margin 0 12 ≤480 (366 @390). HOME은 `min-width:1160` 때문에 768까지 1100 유지.
- Header 120(topbar 34 포함, absolute, z 100, shadow 2 2 2 rgba(0,0,0,.04)); 로고 132×49 @(5,17); nav 행 y 59–99, `li` pad 0 30, 우측 정렬 6개. 모바일 header 65: logo_m 115×53 @(10,8), 햄버거 24² @(right 18, top 18).
- Grid: HOME `#s1` 2×539 gap 22 → 1열 ≤480; `#s2` 3×352 gap 22(4행) → 2열 ≤768(346.2 @768, 179.3 @390); `#s3` 4×130 gap 30 → 4×100 gap 10 → 2×2×120 ≤480. LIST 3×330 gap 55/row 44 → 2×332.1 gap 42.4 @768 → 2×172 gap 22 @390. ABOUT/BLOG 3×341 gap 38.5 / 3×352 gap 22 → 1열 ≤768. 카드 간격은 inline-block `li`의 `margin-right 22`(마지막 열 0)로 3×352+2×22 = 1100.
- 세로 리듬 HOME @1440: topbar 0/34 · header 0/120 · hero 120/800 · `#s1` gold bar 1010/4(section pad 90) · 제목 +12 · 타일 +50 · `#s3` 1600/376(pad 80) · `#s2` gold bar 2066/4(+80+90) · 카드 +40 · 버튼 +30 · footer 3540/199(+90). @768 pad 60, @390 pad 40, footer 264 / 286.
- 세로 리듬 SUB @1440: header 120 · visual 120/252 · (`#lnb` 372/77) · `#content` pt 90 → gold bar → h3 +15 → caption → 첫 블록 +50 → 마지막 블록 → footer 210(pb 110 + 100). @768 visual 140, 60/15/40, footer 150(list)/80(about); @390 visual 90, 40/8/20, footer 100(60 about).
- Footer: `#footer` bg #f5f5f5, border-top 1 #e4e4e4, 199 tall; `.footer_wrap` pad 50 220 60 0, 좌 880 px 텍스트; `.cs` 전화 블록 absolute right 168×48(border-left 1 #e6e6e6). ≤768 pad 40 0 60 센터 + `.add768`; ≤480 pad 30 0 50. 정보 단락 `strong` 라벨 6개(상호·사업자번호·대표·주소 등) 1단락 3→4→5행 — 값은 템플릿에 가져가지 않음.

### 6.4 COLORS — `summary/colors.md`, `NOTES.md` §5

| hex | 역할 |
|---|---|
| #b9a25f | 골드 액센트: 35×4 / 44×4 제목 underline bar(HOME 섹션, 모든 서브 제목), `#s3 .p1` |
| #ad9654 / #ab8373 / #a79663 / #d4c9ac | LNB 선택 탭 bg·border / 현재 GNB / BLOG 버튼 bg / `#s3` 원 hover border |
| #d10008 / #ff6600 / #e4a02a | 견적 상태 badge bg / paging 현재 번호 / 견적 제목 hover |
| #111 / #222 / #333 / #444 | DETAIL 제목 · 서브 h3·본문 · body·nav·히어로 · caption·th·다크 버튼 |
| #555 / #666 / #737373 / #777 / #888 / #999 / #a9a9a9 / #bbb | 카운트 strong·pill hover · paging·p · copyright · topbar·td·힌트·gray 버튼 · footer·input · 카운트·note · `#s1 .p2` · divider |
| #252525 / #ddd(글자) | 모바일 드로어 bg / 드로어 항목 글자(C-interaction #14) |
| #f1f1f1 / #cacaca | topbar bg / tagline 칩 bg |
| #f5f5f5 / #e4e4e4 / #e6e6e6 | footer bg / footer border-top / `.cs` border-left |
| #fafafa / #f9f9f9 / #fbfbfb / #fdfdfd / #f4f4f4 | 게시판 th / 폼 th / 검색 박스·DETAIL 제목 bg / 검색 input / paging hover |
| #ddd / #e1e1e1 / #e2e2e2 / #e5e1e6 / #e5e5e5 / #e8e8e8 / #ededed / #efefef / #f0f0f0 | th bottom·DETAIL 제목 border / 폼 input / paging·검색 / DETAIL 버튼행 top / 폼 셀 / `#s3` 원 / 게시판 행선 / BLOG 카드 / LNB 비선택 |
| rgba(0,0,0,.04 / .07 / .08 / .05) | header shadow / gallery 썸네일 overlay / 드로어 shadow / visual h2 text-shadow |
| #fff | 페이지 bg, header, 원, 카드, paging, input, visual 글자, 버튼 글자 |

### 6.5 BORDERS / RADIUS / SHADOWS / ICONS / IMAGE_ASPECTS / MOTION — `NOTES.md` §6, `summary/images.md`

- Borders: 1 px hairline(#ddd–#f0f0f0). 유일한 굵은 선은 게시판 th border-top 2 px #444. gallery 썸네일은 box border가 아닌 1 px rgba(0,0,0,.07) overlay div. 폼 th/td 1 px #e5e5e5 collapsed; input 1 px #e1e1e1 text-indent 10, 필수 필드 `icon_must.gif` 18×12 우측 중앙.
- Radius: 70(`#s3` 원 130/100/120 = 완전 원) · 30(더보기 pill) · 3(badge, BLOG 버튼) · 그 외 0.
- Shadows: header 2 2 2 rgba(0,0,0,.04) · 드로어 2 2 rgba(0,0,0,.08) · visual h2 text-shadow. 카드/버튼/input shadow 없음.
- Icons(모두 raster): `icon1_2.png` 108²(66 @768, 55 @390) · `icon2–5.png` 57×50(47×41.2 ≤768) · `f_call.png` 14×18 · `btn_m_menu.png` 80²→24² · `btn_m_menu_close.png` 52²→26² · `btn_main_img2.png` 20×20 sprite(dot 10×10, 활성 20×10 offset 0 −10) · `icon_note3.gif` 10×12 · `icon_lock.gif` 9×10 · `icon_must.gif` 18×12 · `bt_prev/bt_next.gif` 4×7 · `text.png` 430×29(ABOUT 장식) · `btn_m_home.png` 126×41→63×21 · `icon_plus.png` 100²→10×10. 아이콘 폰트는 FA5 solid phone(모바일 footer)뿐. 검색 submit `<input type=image>` 52×34 파일명 UNKNOWN.
- Image aspects: hero `main1–3.jpg` 2000×800(2.5) cover 50 % 50 %, 박스 800/370/260 · `s3_bg.jpg` 2000×371 cover(position 50 % → 58 % @768 → 73 % @480) · `sub_visual1–4.jpg` 2000×252(7.94) `auto 100%` → 높이 맞춤 후 가로 크롭(1440/1111/714 px 가시) · `#s1` 타일 540×320(1.688) `img` · 포트폴리오 썸네일 700×466(1.5) cover, sizer `blank_gallery.png` 600×408(1.471) · `about.jpg` 1100×333(3.3) / `about_mobile.jpg` 686×396(1.73, ≤480) · `biz_int1–3.jpg` 768×500(1.536) · `biz_arc1.jpg` 800×500(1.6) · DETAIL 480×720 / 720×480 natural(366 wide @390) · logo 132×49, logo_m 204×84→115×53.
- Motion language: 히어로 opacity cross-fade 1500 ms easeOutQuint(측정 §4 #2) + 4000 ms autoplay, dot bar hover 정지; 드로어 `left` 300 ms easeOutQuart(측정 284/286 ms); 그 외 전부 즉시형 `:hover`(CSS transition 0개), `.myBtn:active` 1 px 하강. scroll 연동 모션 없음.

## 7. 의도적 비재현(결정 사항)

| 원본 동작 | 템플릿 결정 | 이유/근거 |
|---|---|---|
| HOME `#main_wrap{min-width:1160px}` → 769–1159 px 가로 overflow | 재현하지 않음; 서브페이지의 98 % 규칙을 HOME에도 적용 | 소스 버그성 동작(`BREAKPOINTS.md` §6, `continuous.md` home overflowX 19–391) |
| 초기 로드 시 "마지막 slide(3)가 1번으로 녹아드는" fade | 재현하지 않음; 1번 slide 정지 상태에서 시작 | JS 초기화 순서의 부산물(`C-interaction/NOTES.md` #1) |
| 견적문의 게시판(비밀글·비밀번호 게이트·파일 업로드·글쓰기/수정/삭제, `write_ok.php` POST) | 재구축하지 않음. 게시판 table 룩의 FAQ 페이지 + 플랫폼 inquiry door를 통한 contact form으로 대체 | 고객 개인 데이터·서버 사이드 흐름(`A-discovery/X-evidence-locked-post-gate-*.jpg`, §4 #25–27) |
| 폰트 스택: 첫 web font(Noto Sans KR/Open Sans) 미로드 → OS fallback 렌더 | local-font 스택만 선언, web font 로드 0, OS별 동일 face 렌더 | 플랫폼에 web-font 파이프라인 없음; release는 정적 폰트 파일을 포함할 수 없음(§6.1) |

## 8. UNKNOWN (파일로 확정 불가)

- 디자이너 의도 Korean 서체(web font가 한 번도 로드되지 않음; macOS fallback만 측정). — `fonts-network.md`
- 검색 submit `<input type=image>`의 이미지 파일명. — `images.md`에 미기록
- 히어로 slide 3의 전경 콘텐츠(bg만 확인). — `NOTES.md` §9
- 실제 브라우저에서 탭 숨김 후 carousel 복귀 상태(headless에서는 mid-fade 동결 후 재개 3467 ms). — `timing/home-desktop-observations.json`(`tabHidden`)
- 폼 제출 경로·검증 메시지·`#msg_save`(제출하지 않음; inline `checkIt_form` 소스로만 설명). — `inquiry-desktop-observations.json`
- 견적 게시판 페이지 수(451/12 → 38 계산값, 로드하지 않음).
- `sub_visual*.jpg` 크롭 위치(측정 폭 외는 `background-size:auto 100%` 산술).
- 모바일 DETAIL 이미지 폭(≈366)은 업로드 이미지를 로컬 차단한 상태의 CSS 계산값.
- 보존 클론의 JS 실행 독립성(`limitations[2]`, Phase 3 범위).

## 9. 파일 간 불일치·주의점

- 드로어 열린 상태: `B-visual/NOTES.md` §5·§9는 "open state UNKNOWN"이나 `C-interaction/NOTES.md` #14가 열어서 측정함(250×100vh, 항목 46 px, 글자 15 px bold #ddd). C가 우선.
- hover/transition: B §6 "UNKNOWN(not exercised)" ↔ C §1 전부 측정(0 ms, transition 0개). C가 우선.
- 히어로 fade 선언 1500 ms vs 측정 ≥99.95 % 도달 1167–1186 ms — easeOutQuint 특성(마지막 ~300 ms는 sub-pixel)으로 설명되며 모순 아님. 드로어 300 ms vs 284/286 ms 동일.
- B §1은 preserve:sanity 실패 원인에 "FA 4.2.0 webfont 404"를 들지만 sanity 로그에서 이 404는 mobile case에만, 드로어 PNG 4건은 desktop/desktop-1024 case에만 나타난다(각 case `localFailureCount` 4).
- `fixed-ua.md` element count(HOME 318)와 `observation.json`/`page-families.json`(284)는 계수 방식 차이(`verification.json`의 `domElementCount` 318 vs `structuralProfile.elementCount` 284)로 일치.
- DETAIL 관찰 대상 `number=206`은 discovery 97 집합·대표 14에 없음(crawl에서는 로드됨). WRITE 폼은 discovery에 없음. 둘 다 B/C 단계의 추가 선택.
- 로드 횟수: B-visual 18회, C-interaction 25회(로그 24 + 1), pipeline 7 run × 2 viewport = 14회. 단계별 집계이며 합산 57회.
