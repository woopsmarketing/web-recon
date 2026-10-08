# 03 — Browser QA와 Regression

대상 package: `boost-interior-demo-02` `9812ac08…47a2e3` (최종 build). 채팅 widget은 이 문서의 QA에서 막아 두었고
(`boostchat.co.kr` 요청 abort), widget QA는 `02-boostchat-qa.md`에 있습니다.

## 1. 자동 sweep (MASTER 실행)

`proof/scripts/sweep.mjs.txt` — route × 폭마다 HTTP status, console/page error, 실패 요청, 깨진 이미지(전체 스크롤 후),
load 시점과 스크롤 후의 가로 overflow, `h1` 개수, 금지어, 내부 링크 crawl.

| 사이트 | route × 폭 | 결과 |
|---|---|---|
| Demo 02 | 9 route (`/`, `/portfolio`, 상세 2개, `/service`, `/about`, `/faq`, `/contact`, 404) × 7폭 (320 · 390 · 768 · 1024 · 1280 · 1440 · 1920) = 63쪽 | **problem rows 0**, 내부 링크 15개 모두 200, 외부 링크 0, `mailto:` 1 (`proof/sweep-boost-interior-demo-02.json`) |
| Ongyeol | 11 route × 7폭 = 77쪽 | **problem rows 0**, 내부 링크 21개 모두 200. `부스트`·`boostinterior`·`boostchat`·`wgt_` 0건 (`proof/sweep-ongyeol-interior-demo.json`) |

sweep이 잡아 준 것 하나: 첫 실행에서 Demo 02 홈이 320px에서 `innerWidth 332`였습니다(가로로 긴 로고). site data의
로고로 해결했습니다(`01-site-data-and-theme.md` §3).

## 2. 시각·인터랙션 QA (subagent → MASTER 확인)

subagent(`claude-fable-5-1`, xhigh, 읽기 전용)가 9개 route를 1440 / 1024 / 768 / 390 / 320에서 스크린샷과 측정으로
확인했습니다(tool 호출 96회, 31분). 아래는 보고된 19건의 처리 결과입니다. MASTER가 직접 다시 측정한 항목은 "확인"으로 표시.

### 2-1. site data로 고친 것

| # | 보고 | 조치 | 확인 |
|---|---|---|---|
| 2, 4, 5, 6 | accent 면 위 작은 라벨·보조 문구의 대비 1.94–3.6:1 (`CONTACT`, `PORTFOLIO`, `FAQ`, `Full Remodel` 등, 홈 tier 보조 문구) | 해당 slot은 선택 항목이라 비움 (`tile*Label`, `tier*Sub`, 홈 `tier*Note`, `ctaLabel`, `showcaseLabel`) | 확인. 남은 accent 위 글자는 4.53:1 이상 |
| 3 | 390·320에서 홈 tier 제목이 글자 중간에서 줄바꿈 ("전체 리모델/링") | 옆 자리의 보조 문구를 비워 제목이 한 줄에 들어감 | 확인 (스크린샷) |
| 11 | `/service`의 "입주 전 홈스타일/링" 한 글자 줄바꿈 | tier 제목을 "홈스타일링"으로 (유형 이름 자체는 그대로) | 확인 |
| 12 | 390에서 문의 폼 유형 chip 2개가 말줄임 | chip 문구를 "주방·욕실", "홈스타일링"으로 | 확인 |
| 18 | 메뉴 drawer의 두 그룹이 같은 링크 2개를 반복 | footer 지원 링크(drawer 3번째 그룹의 출처)를 비움. footer에도 같은 중복이 있었음 | 확인 |

accent 면 위의 tint 글자색은 template이 정해진 기준색과 섞어 만드는 값이라 theme으로 바꿀 수 없습니다.
**Ongyeol의 기본 theme도 같은 자리에서 2.05:1(민트) · 2.48:1(노랑)입니다** — 기존 template 특성이고, Demo 02는
그 선택 항목을 쓰지 않는 쪽을 택했습니다.

### 2-2. template 특성으로 남긴 것 (이번 작업에서 수정하지 않음)

| # | 내용 | 측정 | Ongyeol에도 있나 |
|---|---|---|---|
| 1, 14 | **홈 hero의 "다음 슬라이드" · "일시정지" 버튼이 오른쪽 아래 floating 버튼에 가려져 눌리지 않음** (1280–1440px 폭). 1920px와 mobile은 정상 | 버튼 28×28 @ (1352, 820) · (1392, 820), floater 56×56 @ (1360, 820). `elementFromPoint`가 floater를 돌려줌 | **있음.** Ongyeol은 같은 자리를 상담 floater(`a.i2-floater__contact`)가 덮음 |
| — | BoostChat launcher가 탭바 5번째 탭(mobile)과 "맨 위로" 버튼(desktop)을 가림 | `02-boostchat-qa.md` §5 | widget이 없어 해당 없음 |
| 7, 8, 9 | 사진 위 흰 글자의 최악 지점 대비 2.5–3.9 (중앙값은 약 8.7) | 사진 밝은 부분 기준 | 같은 veil 구조 |
| 10 | FAQ의 장식용 "Q" 1.26:1 | 장식 글자 | 있음 |
| 13 | 상세 페이지 본문과 CTA 사이 여백 320px | — | 같은 간격 |
| 15 | 320px: FAQ 주제 chip 한 개가 줄을 넘김, 404 제목이 header에서 잘림 | — | 같은 구조 |
| 16 | 키워드 chip 줄이 가로 스크롤 | 설계된 동작 | 있음 |
| 17 | 1024px에서 제목 마지막 줄이 짧게 남음 | — | 문구에 따라 |
| 19 | 390px에서 "preloaded but not used" console 경고 (error 아님) | — | 미확인 |
| — | 카드의 프로젝트 제목은 한 줄 말줄임 — BoostInterior의 긴 제목(17–24자)은 카드에서 "…"로 끝남 | 설계된 동작 | 제목이 짧아 드묾 |
| — | 한글 제목이 어절 중간에서 줄바꿈 (`word-break: keep-all` 없음) | — | 있음 |

### 2-3. 동작 확인 (subagent 41/41, MASTER 표본 확인)

header 내비게이션과 `aria-current`, drawer 열기/닫기(버튼 · 배경 · Escape, focus 복귀), hero 이전/자동재생/swipe,
키워드 chip → 두 번째 carousel, 목록의 필터 · 정렬 · 검색 · 결과 수 · 빈 상태 · 초기화 · mobile 필터 패널,
상세 gallery(chip, grid/single, viewer 다음 · 이전 · 닫기 · Escape · 방향키, focus 복귀), 관련 사례, 총 공사비 토글,
FAQ 주제 chip과 accordion, 문의 폼 검증(빈 제출 시 4개 필드 오류, 요청 없음), "맨 위로", 탭바 링크, focus outline.

확인하지 못한 것: touch 기기의 hover, `prefers-reduced-motion`, hero 2–3번째 slide의 글자 대비, 실제 기기 글꼴.

## 3. Regression

```
ONGYEOL_REGRESSION     = PASS
  data/sites/ongyeol-interior-demo, data/site-builds/ongyeol-interior-demo : git diff 없음
  package 7729ea16… (이 작업 전 build 그대로), pin interior-02-1.0.0-dbfa5d41678d
  browser sweep 77쪽 problem 0 · interior-02 suite 검사 E–K 통과

INTERIOR_01_REGRESSION = PASS
  templates/interior-01, data/sites/boost-interior-demo, fixture-*, 그 build와 release : git diff 없음
  기존 regression suite 전부 통과 (아래)
```

## 4. 테스트와 gate (최종 상태에서 실행)

`package.json`의 실제 명령을 `node_modules/.bin`으로 실행했습니다(이 worktree에서는 `pnpm`을 직접 쓰지 않음).

| 검증 | 명령 | 결과 |
|---|---|---|
| typecheck | `tsc -p platform/tsconfig.json`, `tsc --noEmit` | 둘 다 exit 0 |
| template release gate | `platform/cli/template-release.ts interior-02@1` | `exists-verified`, `interior-02-1.0.0-dbfa5d41678d` (쓴 것 없음) |
| site:build | `platform/cli/site-build.ts boost-interior-demo-02 --mode public` | `built`, package QA pass, warnings 0 |
| platform chain 16개 | `slice1` 86 · `step4` 47 · `step41` 35 · `step5` 32 · `polish` 4 · `step52` 12 · `step6` 34 · `predemo` 10 · `predemo2` 9 · `ia150` 15 · `ia151` 10 · `ia152` 14 · `integration` 85 · `detail-facts` 26 · `preview-parity` 13 · `interior-02` 15 | 실패 0 |
| chain 밖 | `portfolio-sync` 40 · `portfolio-production-truth` 12 | 실패 0 |

테스트 변경:

- `step6.test.ts` 검사 A — `data/sites` 목록에 `boost-interior-demo-02` 추가, origin이 기존 demo와 다르고 pin이
  interior-02임을 확인.
- `interior-02.test.ts` 검사 K — interior-02 사이트가 **정확히 두 개**임을 확인(기존: 하나). 새 `[reuse]` 검사 4개:
  L 같은 release(id + hash)와 현재 data로 만든 package · M identity/origin/프로젝트/theme 값이 다름 ·
  N 계획된 페이지 존재, 금지어 0, 서로의 브랜드가 상대 package에 없음 · O widget host와 key가 template 83개 파일,
  release 102개 파일, Ongyeol package 어디에도 없고 Demo 02의 모든 페이지에 있음.
- 기존 assertion을 지우거나 약하게 한 곳은 없습니다(독립 리뷰 질문 10).
