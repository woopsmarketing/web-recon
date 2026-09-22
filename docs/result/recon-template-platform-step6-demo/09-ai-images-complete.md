# Step 6 — AI 이미지 51/51 반영 · 고객 데모 준비 (2026-09-20)

```
AI_PORTFOLIO_ASSETS            = PASS (51 / 51, provisional auto-approve — 사람 눈검수 대기)
STAND_INS_REMAINING            = 0
BROKEN_MEDIA                   = 0
VISUAL_SMOKE                   = 237 / 237
TEST_PLATFORM                  = 235 / 0
FLAGSHIP_SAME_HOME_CONSISTENCY = DEMO_LEVEL (같은 팔레트/자재, 컷 간 기하 일치는 보장하지 않음)
CUSTOMER_DEMO                  = 가능 (마지막 사람 눈검수만 남음)
```

## 1. 생성 / 승인 / 반영

| 항목 | 수 |
| --- | --- |
| 생성한 후보 (누적, `generated-candidates/`) | 61장 (이번 실행 59장 + 이전 2장) |
| 승인 (`generated-approved/<shotId>.jpg`) | 51 / 51 |
| 사이트 반영 (`step6-assets.ts` → raster ingestion) | 51 / 51, illustrated stand-in 0 |
| 재시도 | 9 shot × 1회 (v2 승인 8, `bi01-living-01`은 v3로 교체) |
| 추정 비용 | 누적 ≈ $0.79 (FLUX.2 [klein] 9B, before 2장은 `…/9b/edit`) |

- 모델/경로: 기존 fal queue REST 경로 그대로 (`fal-ai/flux-2/klein/9b`). 새 스크립트 `scripts/template-platform-step6-fal-batch.ts` (여러 shot 동시 생성, seat 비율별 크기, edit 지원).
- 프롬프트: `image-generation/06-short-prompts.json` — **shot 문장 먼저 + 한 줄 집 팔레트 + 한 줄 스타일**. 긴 공용 bible(02-prompts.md)이 shot을 묻어 버리던 문제(08 보고서의 "prompt fidelity LOW")가 해소됨: `bi01-living-01` v3는 소파 + 오크 니치 붙박이장 + 우물천장이 모두 나옴.
- bi-04 Before 2장은 승인된 After 컷을 입력으로 한 image-to-image → 같은 시점/기하 유지.
- 자동 승인 기준(심한 왜곡 없음 / 읽히는 브랜드 텍스트 없음 / 자연스러운 인테리어 / 공간 유형 일치)으로 contact sheet 검수. 재시도 사유:
  - `bi01-entrance-01` 여닫이문으로 나옴 → 3연동 슬라이딩으로 재생성
  - `bi01-bathroom-01` 바닥에 떠 있는 선반 아티팩트
  - `bi02-dining-01`, `bi02-bathroom-01`, `bi04-bathroom-02` 벽/가구가 휘는 왜곡
  - `bi07-bedroom-01` 침대 형태 이상, `bi08-study-01` 책상 형태 이상
  - `bi04-bathroom-01-before` v1이 타일만 바뀜 → 직접적인 edit 프롬프트로 v2

## 2. 아직 stand-in 인 shot

없음 (0 / 51).

## 3. 실제 이미지가 반영된 주요 위치

- `/` 홈: Hero 3장(`site-hero-01..03`), Intro(`site-intro`, 중문 너머 거실), 대표 프로젝트/다른 시공 사례 카드 cover 8장, Reviews 배너(`site-reviews`), Closing band(`site-band`)
- `/portfolio`: 타이틀 배너(`site-portfolio-hero`), 프로젝트 카드 8장
- `/portfolio/<flagship>` (수성 화이트 34평): 거실 3 · 주방 3 · 현관 2 · 복도 수납 1 · 침실 2 · 욕실 2 = 13장
- 나머지 상세 7개: bi-02..08 전부 (bi-04는 Before/After 쌍 포함)

## 4. Build

- release: `interior-01-1.4.0-9e1ea20da947` (변경 없음, Template/Platform/content 구조 미변경)
- buildInputId: `aa6e7539beb463355ece686add05ef6b7218927c6aec5fc804737947871197e0`
- packageHash: `4f5a7d61f51d05ab7aa96ec60305d6e5d53cd1746ba8c6bc7cf3a58ec9df4ffd`
- 12 HTML pages, package 6.9 MB, build warnings 0, previous = `c9a83742…`

## 5. 검증

- Step 6 visual smoke: 18 visits, **237 / 237**, broken image 0 · non-local request 0 · overflow 0 · console error 0
- `pnpm test:platform`: **235 passed / 0 failed** (step6 29/29, 재현성 U 포함)
- 빌드 결과 스크린샷 직접 확인: home 1440 / home 390 / portfolio 1440 / flagship detail 1440 — 모두 실제 이미지, stand-in 없음
- `step6-assets.ts` 경고 5건 (거부 아님): `site-hero-01..03`, `site-band`, `site-portfolio-hero` 가 seat(2400px)보다 작은 2048px 원본 → 1.17× upscale

## 6. Open items

1. **사람 눈검수 미실시** — 51장 모두 provisional auto-approve. 검수에서 탈락한 shot은 `06-short-prompts.json` 문장만 고쳐 `fal-batch.ts <shotId>` 재실행 → 승인 복사 → assets → build.
2. Flagship 컷 간 "같은 집" 일관성은 팔레트/자재 수준. 컷마다 독립 text-to-image라 창/문 위치 같은 기하는 일치하지 않음 (예: `bi01-entrance-02`의 오크 니치가 거실 컷보다 작음, `site-band`는 저녁 분위기가 약함).
3. `bi03-entrance-01`, `bi06-entrance-01` 중문이 슬라이딩이 아닌 여닫이처럼 보임 (공간 유형은 일치하여 승인).
4. Hero/band/plist 5장 1.17× upscale — 데모 화질은 충분, 공개 배포 전 2400px 이상으로 재생성 권장.
5. 기존 Template-owned 제한 그대로: `KRW 2,900,000 / 평` 표기(L1), 모바일 캐러셀 peek/탭바 스크롤 cue, OG/canonical 없음 → Pre-Demo Gate.
6. 공개 배포 전: 가상 브랜드 고지 또는 실제 콘텐츠 필요 (`.example` 도메인).

## 7. 지금 열어볼 파일

1. `docs/result/recon-template-platform-step6-demo/human-review/site.html` — 현재 사이트 눈검수
2. `docs/result/recon-template-platform-step6-demo/human-review/index.html` — 51장 shot별 seat-crop 승인 시트
3. `docs/result/recon-template-platform-step6-demo/screens/home-1440.png` — 홈 전체 스크린샷

## 8. 결론

**고객 데모 가능.** 홈 · 프로젝트 목록 · flagship 상세를 포함한 전 페이지가 실제 이미지 기반이며 broken media 0, smoke/test 전부 통과. 남은 것은 마지막 사람 눈검수뿐이다.
