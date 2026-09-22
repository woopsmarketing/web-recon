# Step 6 — 첫 실제 AI 이미지 1장 (fal) 파이프라인 검증

2026-09-20. 범위: `bi01-living-01` 한 장만. 목적은 품질이 아니라 "실제 생성 이미지가 승인 폴더 → ingestion → build → 사이트까지 도달하는가".

## 결과

| 항목 | 결과 |
|---|---|
| FAL 경로 | 성공 (`.env` `FAL_KEY`, 첫 시도에 2/2 COMPLETED) |
| 모델 / 호출 | FLUX.2 [klein] 9B `fal-ai/flux-2/klein/9b`, queue REST (`POST queue.fal.run/<endpoint>` → `status_url` poll → `response_url`), SDK 없음, Node fetch. youtube-harness `src/images/fal-client.ts` + `src/domain/fal-image-models.ts`의 transport·endpoint·단가·기본 모델(bench winner)을 그대로 재사용 |
| 입력 | `02-prompts.md`의 prompt 원문, `image_size 1600x1200`, `output_format jpeg`, seed 6001/6002. negativeConstraints는 미전송 (FLUX.2에 negative prompt 없음) |
| 비용 | 추정 $0.024 (2 MP × $0.006 × 2장), 장당 4–5초 |
| 후보 | `references/boost-interior/generated-candidates/bi01-living-01__v1.jpg`, `…__v2.jpg` (둘 다 1600×1216) |
| 승인본 | `references/boost-interior/generated-approved/bi01-living-01.jpg` (= v1, **provisional 자동 승인**, 사람 검수 없음) |
| ingestion | 성공 — `assets/bi01-living-01.jpg` 1600×1200 image/jpeg, registry 갱신, `approvedGenerated 1 / standIns 50`. **REAL_APPROVED_RASTER_INGESTION: NOT_YET_RUN → PASS** (sharp raster 분기가 실제 이미지로 처음 실행됨) |
| build | 성공 — buildInputId `c9a83742375c40bc…`, packageHash `84dd732d762e6586…`, 12 HTML, QA pass, warnings `[]`, previous `4d3d08f4…` |
| visual smoke | 237/237, failed 0 |
| test:platform | 235/0 (step6 29/0) |
| review pack | 재생성 (`human-review/index.html`, `site.html`), approved 1/51, mismatch 0 |
| 경고 | ingestion 경고 없음 (unmatched / upscaled / heavy-crop 0), build warnings 0 |

## 사이트 반영 위치

emitted asset `site/assets/a8141f9c1f0bbdd5c7ff.jpg`:

- `/` — 홈 포트폴리오 카드 (Flagship cover)
- `/portfolio` — 목록 카드 cover
- `/portfolio/suseong-white-34py-apartment-remodeling` — 상세 거실 갤러리 첫 컷 (`screens/detail-flagship-1440-fold.png`에서 실사진 확인, 나머지 컷은 illustrated stand-in)

## 자동 선택 근거와 한계

- v1 선택: 기하 안정, 트레이 천장 + 코브 + 중앙 LED 패널, 스톤 바닥, 시어 창, 읽히는 브랜드 글자 없음. v2는 냉장고에 브랜드형 글자.
- **Prompt 충실도 LOW**: 두 후보 모두 "거실"이 아니라 주방-다이닝 공간으로 렌더됐다. `THIS SHOT`의 소파 / 오크 니치장 / 현관 홀이 없다. 긴 공용 bible 문단이 shot 문장을 압도한 것으로 보인다 (v1은 상부장까지 생김 — bible 위반). 파이프라인 증명용으로는 충분하지만 사람 승인 PASS 대상은 아니다 — 재생성 필요.

## 상태

- `STEP6_STATUS = PARTIAL` 유지. `AI_PORTFOLIO_ASSETS` WAITING(0/51) → PARTIAL(1/51, provisional). `FLAGSHIP_SAME_HOME_CONSISTENCY = NOT_READY` 유지.
- Template / platform / release / fixture / content 문서 무수정. 변경: `scripts/template-platform-step6-fal-generate.ts`(신규), `references/boost-interior/generated-{candidates,approved}/`, `data/sites/boost-interior-demo/assets/`(jpg + registry, svg stand-in 1개 교체), `image-generation/04-asset-status.json`, `05-fal-runs.json`(신규), `human-review/`, `screens/`.

## 다음 1단계

`bi01-living-01`을 shot 우선 구조의 짧은 prompt(THIS SHOT 문장을 맨 앞 + bible은 거실 관련 K 규칙만)로 1–2장 재생성해 소파·오크 니치가 나오는지 확인한다. 통과하면 그 컷을 reference로 `fal-ai/flux-2/klein/9b/edit`(`image_urls`)를 써서 bi-01 나머지 shot으로 확장한다.
