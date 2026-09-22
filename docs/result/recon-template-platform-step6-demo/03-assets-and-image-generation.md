# 03 — Assets & Image Generation

> **2026-09-20 마감 실행 갱신.** 아래 §0이 이번 실행의 실측 결과다. §1–§6은 2026-09-19 기록이며 그대로 유효하다
> (달라진 점: §5의 "sharp 분기 미실행" 주의는 §0.4의 격리 리허설로 **부분 해소**, 실제 승인 이미지로는 여전히 미실행).

## 0. 2026-09-20 마감 실행 — 승인 이미지 실사(實査)와 ingestion 리허설

### 0.1 결론

| 항목 | 값 | 근거 |
|---|---|---|
| 승인 이미지 실제 개수 | **0 / 51** | `references/boost-interior/generated-approved/`에는 `manifest.json`(기대 파일 목록) **1개뿐**. 이미지 파일 0 |
| 후보 폴더 `generated-candidates/` | 감사 시점에 **존재하지 않았음** → 이번에 `README.md`만 있는 staging 폴더로 생성 (이미지 0) | `ls` |
| 저장소 전체에서 shotId 이름의 이미지 (`bi0*-*.jpg/png/webp`) | **0** | `find` (node_modules 제외) |
| 2026-09-19 21:10 이후 저장소에 추가된 이미지 | **0** | `find -newermt` (docs/result 제외) |
| 이번 실행에서 실제로 반영 가능한 수량 | **0** (flagship 0 / 13 · 그 외 0 / 38) | 위 실사 |
| AI_PORTFOLIO_ASSETS | **0 / 51 — WAITING_FOR_GENERATION** | `04-asset-status.json` (스크립트가 디렉터리에서 계산) |
| stand-in 잔여 | **51 / 51** | registry: `image/svg+xml` 52 (51 shots + logo), `image/jpeg` 0 |
| FLAGSHIP_SAME_HOME_CONSISTENCY | **NOT_READY** | 판정할 이미지가 없다. stand-in 일러스트는 same-home 증거가 아니다 |
| `REAL_APPROVED_RASTER_INGESTION` | **NOT_YET_RUN** — 실제 승인 이미지로는 아직 한 번도 실행되지 않았다 (입력 부재, 실패 아님) | §0.3 |
| `RASTER_INGESTION_REHEARSAL` (격리 · 합성 테스트 패턴 · scratch devroot) | **PASS** | §0.4 · `proof/raster-ingestion-rehearsal.json` |
| REFERENCE_ONLY 분리 | **PASS** | §0.5 |

**이미지를 지어내지 않았다.** 실제 Site Instance(`data/sites/boost-interior-demo/`)는 실행 전후 62개 파일 sha256이 전부 동일하다.

### 0.2 shotId별 승인 여부 (51)

| project | shots | approved | shotIds (전부 **미승인 · stand-in 유지**) |
|---|---|---|---|
| `site` | 7 | 0 | `site-hero-01` · `site-hero-02` · `site-hero-03` · `site-intro` · `site-reviews` · `site-band` · `site-portfolio-hero` |
| `bi-01` (flagship) | 13 | 0 | `bi01-living-01` · `bi01-living-02` · `bi01-living-03` · `bi01-kitchen-01` · `bi01-kitchen-02` · `bi01-kitchen-03` · `bi01-entrance-01` · `bi01-entrance-02` · `bi01-hallway-01` · `bi01-bedroom-01` · `bi01-bedroom-02` · `bi01-bathroom-01` · `bi01-bathroom-02` |
| `bi-02` | 4 | 0 | `bi02-living-01` · `bi02-dining-01` · `bi02-bedroom-01` · `bi02-bathroom-01` |
| `bi-03` | 5 | 0 | `bi03-living-01` · `bi03-entrance-01` · `bi03-kitchen-01` · `bi03-kids-01` · `bi03-dress-01` |
| `bi-04` | 6 | 0 | `bi04-kitchen-01` · `bi04-kitchen-01-before` · `bi04-kitchen-02` · `bi04-bathroom-01` · `bi04-bathroom-01-before` · `bi04-bathroom-02` |
| `bi-05` | 4 | 0 | `bi05-living-01` · `bi05-dining-01` · `bi05-bedroom-01` · `bi05-balcony-01` |
| `bi-06` | 4 | 0 | `bi06-entrance-01` · `bi06-living-01` · `bi06-living-02` · `bi06-hallway-01` |
| `bi-07` | 4 | 0 | `bi07-living-01` · `bi07-kitchen-01` · `bi07-bedroom-01` · `bi07-bathroom-01` |
| `bi-08` | 4 | 0 | `bi08-living-01` · `bi08-dining-01` · `bi08-bedroom-01` · `bi08-study-01` |

- **반영된 shot: 없음.** **미반영 shot: 51개 전부.**
- shot별 기대 경로/현재 asset type/검수 칸은 `human-review/index.html`의 상태 표에 있다 (스크립트가 디스크에서 계산).
- 세 목록(`generated-approved/manifest.json` expected 51 · `03-generation-manifest.json` shots 51 · `01-shot-list.md`)은 같은 shot 정의에서 생성되어 일치한다.

### 0.3 실제 사이트 ingestion 경로 — 기록

| 단계 | 명령 | 결과 |
|---|---|---|
| ingestion (실제 repo) | `tsx scripts/template-platform-step6-assets.ts` | exit 0 · `approvedGenerated: 0` · 출력 62 파일 + `04-asset-status.json`이 실행 전과 **byte-identical** (결정성 확인) |
| build | `pnpm site:build boost-interior-demo` | `up-to-date` — 입력이 같으므로 buildInputId `4d3d08f4d35b11e9…` 그대로, 새 package 없음 (rollback용 `eca5cb39…` package도 보존) |

"1장 ingestion 성공 증명"(Phase B)은 **승인 이미지가 1장도 없어 실제 사이트에서는 수행할 수 없었다.** 이것은 ingestion 실패가 아니다.
그래서 Phase C(flagship) · Phase D(전체)도 수행 대상이 없다.

### 0.4 격리 리허설 — raster 분기가 실제로 동작하는가 (합성 테스트 패턴)

`06` A3("sharp 분기는 실행된 적이 없다")의 위험을 실제 이미지가 도착하기 전에 줄이기 위해, **저장소 밖 scratch devroot**에서만 리허설했다.

- devroot = `platform · templates · node_modules · scripts` symlink + `data/{template-releases,sites,site-builds}` **복사본**. 실제 repo의 `data/` · `references/`에는 아무것도 쓰지 않았다.
- 입력 = sharp로 그린 **합성 테스트 패턴**(파란→주황 gradient, "INGESTION REHEARSAL · NOT AN APPROVED IMAGE" 글자). 승인 이미지도 사진도 아니다.
- **합성 이미지와 그것이 찍힌 스크린샷은 저장소·Site·package 어디에도 남기지 않았다** (scratch에만 존재). 저장소에 남긴 기록은 텍스트뿐: `proof/raster-ingestion-rehearsal.json`.
- 리허설이 증명한 범위: synthetic raster input → `step6-assets` ingestion → centre crop / resize → JPEG output → registry update → site build → package asset reference → browser rendering.
- 리허설이 증명하지 **않은** 것: 실제 승인 이미지의 품질·same-home·Template crop 적합성. 그래서 `REAL_APPROVED_RASTER_INGESTION = NOT_YET_RUN`은 그대로다.

**1장 리허설 (`bi01-living-01.jpg`, 3000×2000):**

| 확인 | 결과 |
|---|---|
| ingestion | exit 0 · `approvedGenerated 1 / 51` · verdict `PARTIAL` |
| registry | `{"id":"bi01-living-01","file":"bi01-living-01.jpg","mediaType":"image/jpeg","width":1600,"height":1200}` · 나머지 50 shot은 SVG 유지 |
| resized output | progressive JPEG 1600×1200 (3:2 원본을 4:3 seat로 centre-crop), stand-in `bi01-living-01.svg`는 제거됨 |
| build (같은 release) | `built` · buildInputId `c3b0682ba296f896…` · packageHash `ca889aff7434dd92…` · QA pass · warnings 0 · templateSourceHash `93d7da0f…` 그대로 |
| package 반영 | `site/assets/48e537a029eee712f927.jpg` = site asset과 sha256 동일 · `index.html` · `portfolio.html` · `portfolio/suseong-white-34py-apartment-remodeling.html` 3개 페이지가 참조 |
| Step 6 visual smoke (devroot package) | **237 / 237** — broken media 0 · non-local requests 0 · console/page errors 0 · overflow 0 |
| 브라우저 실측 | home 1440/390 · portfolio 1440 · flagship detail 1440/390 모두 `complete`, `naturalWidth×Height = 1600×1200`, page error 0 |

**리허설이 알려준 seat별 crop (실제 이미지 검수 때 중요):**

| 위치 | 표시 크기 (1440 / 390) | 4:3 원본 대비 |
|---|---|---|
| Home 대표 프로젝트 카드 | 420×275 / 294×193 (≈1.53:1) | 위아래가 약 13% 잘린다 |
| Portfolio 목록 카드 | 432×324 (4:3) | crop 없음 |
| Detail gallery 타일 (첫 타일 678×678, 나머지 337×337 / 모바일 390×390) | **1:1** | **좌우 각 12.5%가 잘린다** — 니치 장·중문 같은 same-home 단서가 가장자리에 있으면 안 보인다 |

**site-level seat 실측 (현재 package, 2026-09-20 — 전부 `object-fit: cover`, 중앙 기준):**

| seat (원본 비율) | @1440 | @390 | 주의 |
|---|---|---|---|
| hero (16:9) | 1440×818 (1.76) | **390×585 (세로 2:3)** | 모바일은 원본 폭의 **가운데 약 38%만** 보인다 — hero 피사체는 반드시 중앙 |
| band (48:19) | 1440×570 (2.53) | 390×280 (1.39) | 모바일은 가운데 약 55% |
| reviews (10:3) | 1156×288 (4.01) | 350×200 (1.75) | 데스크톱은 위아래 약 17% 잘림 |
| portfolio banner (16:5) | 1440×320 (4.50) | 390×280 (1.39) | 데스크톱은 위아래 약 29% 잘림 |
| intro (17:20) | 510×600 | 350×412 | crop 없음 |

이 값은 `human-review/index.html`의 shot별 **Template seat crop 미리보기**에 그대로 쓰인다.

**edge case 리허설 (ingestion만):** png · webp · EXIF 회전 입력 모두 1600×1200 JPEG로 정상 변환(회전 자동 보정 확인). 그리고 **조용히 지나가는 함정 3가지**를 발견했다:

| 함정 | 기존 동작 | 조치 (Step 6 스크립트만 수정) |
|---|---|---|
| `bi01-living-03.jpeg`처럼 **`.jpeg` 확장자** | 경고 없이 무시 → stand-in 유지 | `unmatchedApprovedFiles`로 출력 + `04-asset-status.json`에 기록 |
| `living-room-final.jpg`처럼 **shotId가 아닌 파일명** | 경고 없이 무시 | 같음 |
| 같은 shot의 `.png`와 `.webp`가 함께 있음 | 앞선 확장자만 사용, 나머지 무시 | 같음 (`shadowed`) |
| **작은 이미지** (400×300) | 경고 없이 1600×1200으로 **확대** → 흐릿 | `inputWarnings: upscaled` |
| **세로 이미지** (1500×2000) | 경고 없이 44%를 잘라냄 | `inputWarnings: heavy-crop` (seat에 남는 면적 < 80%) |

대소문자를 구분하지 않는 볼륨(macOS)에서 `BI01-X.JPG`는 정상 ingest되며 오경보가 나지 않는다(실제 디렉터리 엔트리로 대조).

경고는 **거부가 아니다**(승인 파일은 항상 ingest된다). 이미지 처리 파이프라인(rotate → cover resize → mozjpeg q84)은 건드리지 않았으므로 정상 입력의 JPEG 출력 바이트도 그대로다. 두 필드는 비어 있으면 출력하지 않으므로, 승인 0장인 지금의 `04-asset-status.json`과 assets는 수정 전과 byte-identical이다(확인함).

### 0.5 reference-only ↔ public asset 분리 검증

| 확인 | 결과 |
|---|---|
| reference 14개 파일 sha256 ∩ (site assets + current package 전체 115개 고유 해시) | **0** |
| site assets / current package 안의 png·jpg·webp 개수 | **0 / 0** (전부 inert SVG) |
| 자동 테스트 K2 (reference 복사 0 · 같은 파일명 0 · PNG asset 0 · SVG embed 0) | ok (`test:platform` step6 29/29) |
| ingestion 스크립트가 reference 디렉터리를 읽는가 | 아니오 — 코드에 경로가 없다 |
| human-review 페이지 | reference는 상대 경로 **링크**만, 복사 0 |

### 0.6 asset status 계산 근거

`04-asset-status.json`은 사람이 쓰는 파일이 아니라 `step6-assets.ts`가 매 실행마다 **디렉터리에서 계산**한다:
shot마다 `generated-approved/<shotId>.(jpg|png|webp)` 존재 → `approved-generated`, 없으면 `illustrated-stand-in`;
verdict = 전부 승인 `PASS` / 0장 `WAITING_FOR_GENERATION` / 그 사이 `PARTIAL`. 테스트 K3가 이 파일 · registry mediaType · 승인 폴더의 이미지 수를 서로 대조한다.

### 0.7 실제 이미지가 도착하면 (변경 없음 + 주의 3가지)

전체 flow와 경로는 `07-human-review-guide.md` §1. §5의 명령 그대로이며 추가 주의: ① 파일명은 정확히 `<shotId>.jpg|png|webp` (`.jpeg` 불가) ② 4:3 seat는 **1600×1200 이상**, hero는 2400×1350 이상 ③ ingestion 출력에 `WARNING`이 하나라도 있으면 build 전에 해결.
첫 실행은 `bi01-living-01` **1장만** 넣고 돌려 registry가 `image/jpeg`로 바뀌는지 본 뒤 확장한다. build는 새 package를 만들며 가장 오래된 package(`eca5cb39…`)가 prune된다.

---

## (2026-09-19 기록) 결론

| 항목 | 값 |
|---|---|
| Image-generation capability (Claude Code 환경) | **없음** → `CASE B` |
| AI_PORTFOLIO_ASSETS | **WAITING_FOR_GENERATION** (approved 0 / 51) |
| FLAGSHIP_SAME_HOME_CONSISTENCY | **NOT_READY** (판정할 생성 이미지가 없음) |
| REFERENCE_ASSETS_USED_AS_REFERENCE_ONLY | **PASS** (자동 검증 K2) |
| Demo Site가 지금 쓰는 이미지 | 51개 전부 **일러스트 stand-in SVG** (사진 아님, reference 아님) |

AI 이미지는 **한 장도 생성되지 않았다.** 생성한 척한 파일도 없다.
`references/boost-interior/generated-approved/`에는 `manifest.json`(기대 파일 목록)만 있다.

## 1. Capability 확인 (Phase A)

| 확인 | 결과 |
|---|---|
| 세션에 노출된 tool / deferred tool 목록 | 이미지 생성 tool 없음 (Read는 이미지를 *읽기*만 한다) |
| MCP 서버 | Claude Docs, Google Drive(미인증) — 이미지 생성 없음 |
| 환경 변수의 이미지 API 키 (`OPENAI_*`, `GEMINI_*`, `REPLICATE_*`, `STABILITY_*`, `FAL_*` …) | 없음 (이름만 확인, 값은 읽지 않음) |
| 로컬 생성기 (`comfy`, `sd-cli`, `ollama` …) | 없음 |

→ 프롬프트 §7 CASE B에 따라: Visual Bible · shot list · prompt pack · expected filenames · manifest를 완성하고,
이미지 이외의 Site data 작업은 모두 진행했다.

## 2. Reference 검토 (Phase B)

- `references/boost-interior/project-01-white-34p/` — 기대 14개 파일 **전부 존재** (누락 0).
- 14장 모두 직접 열어 검토했다. **전부 타 업체 포트폴리오 뷰어의 스크린샷**이다
  (어두운 UI 프레임, 하단 한글 캡션, `메모리 사용량` 오버레이, 가전 로고·에너지 라벨, 벽 액자, 현관의 실제 신발/공구함).
  → public asset으로는 어떤 형태로도 쓸 수 없다. `00-visual-bible.md`의 **MUST NOT COPY** N1–N11에 기록.
- reference 내부에도 불일치가 있다: `bedroom-02`만 베이지 카펫 타일 바닥. Same-home 계약을 위해 Demo에서는
  본 바닥으로 통일하기로 결정 (Visual Bible "Same-home 결정").
- reference는 16–20mm급 초광각이다. Demo prompt는 요구사항대로 20–28mm로 완화했다.

## 3. Prompt pack (Phase E, CASE B 산출물)

| 파일 | 내용 |
|---|---|
| `image-generation/00-visual-bible.md` | 18개 항목 + MUST KEEP CONSISTENT (K1–K19) + MUST NOT COPY (N1–N11) + same-home 결정 |
| `image-generation/01-shot-list.md` | 51 shots, seat별 aspect/저장 크기, reference·continuity 매핑 |
| `image-generation/02-prompts.md` | shot마다 `projectId · shotId · room · purpose · referenceFiles · continuityRules · prompt · negativeConstraints · expectedAspectRatio · expectedFilename` |
| `image-generation/03-generation-manifest.json` | 같은 내용의 machine-readable 본 (+ site asset id/크기, stand-in 파라미터) |
| `image-generation/04-asset-status.json` | shot별 현재 상태 (`approved-generated` / `illustrated-stand-in`) — 디렉터리에서 **계산**된다 |
| `references/boost-interior/generated-approved/manifest.json` | 승인 폴더의 기대 파일 목록 |

세 문서와 manifest는 **하나의 shot 정의**(`scripts/template-platform-step6-image-pack.ts`)에서 생성되므로 서로 어긋날 수 없다.

Shot 구성 (51):

| 그룹 | shots | 비고 |
|---|---|---|
| Flagship `bi-01` | 13 | 거실 3 · 주방 3 · 현관 2 · 복도 수납 1 · 침실 2 · 욕실 2 (권장 10–14 충족) |
| Site-level seats | 7 | hero 3 · intro · reviews · band · portfolio banner — 전부 Flagship 집에서 촬영하는 설정 |
| 기타 7개 프로젝트 | 31 | 프로젝트마다 고유한 home bible 문단 (같은 프로젝트 = 같은 집, 프로젝트끼리는 다른 집). `bi-04`는 공사 전 2컷 포함 |

Same-home 장치:

1. 한 프로젝트의 모든 prompt에 **동일한 home bible 문단**이 그대로 들어간다 (바닥 모듈·방향, 벽, 걸레받이, 천장, 조명 색, 붙박이·오크 니치, 방문, 3연동 중문, 주방 구조/벽/금속, 키큰장, 소파, 커튼, 전기 플레이트).
2. shot마다 Visual Bible의 K번호를 `continuityRules`로 지정.
3. 공간 관계를 증명하는 컷을 명시: `bi01-living-02`(거실→주방·방문·중문), `bi01-kitchen-02`(싱크 라인 뒤로 오크 니치), `bi01-entrance-01`(중문 너머 거실).
4. Template이 gallery를 4:3 / 1:1 / 29:19로 crop하므로 **세로 컷을 쓰지 않고** 피사체를 중앙 정사각 안에 두도록 모든 gallery prompt에 명시.

### 독립 prompt 리뷰 반영 (fresh-context, READ-ONLY)

리뷰어는 reference 14장을 직접 보고 Visual Bible의 사실 오류 0, copy risk 0, manifest 구조 결함 0을 확인했고, 다음을 지적했다. 전부 prompt pack에서 고쳤다.

| 지적 | 수정 |
|---|---|
| MAJOR — `bi04-*-before` prompt가 "리뉴얼된 집" 문단과 "공사 전" 문장을 한 prompt에 같이 담아 자기모순 | before shot은 전용 `homeBefore` 문단(같은 구조·창·문 위치, 원래 마감)만 쓴다. "no X" 나열은 넣지 않았다(모델이 그 명사를 그린다) |
| MAJOR — before/after가 독립 text 생성 2회라 시점이 유지될 수 없다 | manifest에 `pairedWith` + `generationMethod: image-to-image-from-approved-pair` — **승인된 after 이미지를 i2i로 편집**해 before를 만든다 |
| MAJOR — same-home 단서(니치 장, 중문)가 프레임 가장자리에 놓여 Template의 1:1 crop에서 잘린다 | gallery framing 규칙을 "피사체 **와 continuity landmark**를 가운데 75% 폭 안에"로 바꾸고, living-01/02 · kitchen-02 · hero-02 구도를 다시 썼다 |
| MODERATE — 니치 붙박이장의 상대 위치가 shot마다 다르게 읽힌다 | reference 4장(living-01/02, kitchen-02, entrance-01)을 한 평면으로 설명하는 **고정 PLAN 문장**을 flagship home bible과 Visual Bible §18에 추가 |
| MINOR — lens 문구 모호 / bathroom-01이 reference 구도와 가깝다 | 문구 교정 / 정면 doorway 뷰 → 사선 뷰 |

stand-in 파라미터는 바뀌지 않아 asset은 byte-identical이다.

## 4. 현재 Site asset = 일러스트 stand-in

이미지가 없으면 Site가 빌드되지 않으므로 (asset은 필수 참조), 승인 이미지가 없는 shot은
`scripts/template-platform-step6-assets.ts`가 **그 자리에서 그린 SVG 일러스트**로 채운다.

- 사진이 아니다. reference를 읽지도 않는다 (스크립트는 reference 디렉터리를 열지 않는다).
- platform의 SVG allowlist(`svgProblems`)를 통과하는 inert SVG만 사용 — 빌드가 직접 검증한다.
- 프로젝트별 팔레트/장면 타입만 다르다. **같은 집 일관성을 증명하는 자료가 아니다.**
- human-review 페이지에서 모든 stand-in에 `WAITING · illustrated stand-in (not a photo)` 배지가 붙는다.
- fixture의 SVG(Harbor & Pine 생성기)와 코드·모양을 공유하지 않는다.

로고(`logo.svg`)도 이 스크립트가 만든다: 오렌지 마크 + `부스트 인테리어` 텍스트.
텍스트는 뷰어의 시스템 폰트로 렌더된다 → 실제 고객 로고는 outline된 파일이 필요 (06-open-items).

## 5. 승인 이미지 ingestion 경로 (WAITING → PASS)

```
1. 02-prompts.md로 이미지 생성 → references/boost-interior/generated-candidates/<shotId>.<ext>   (폴더 + README 준비됨)
2. human-review/index.html 체크리스트로 검수 (same home / flooring / cabinetry / doors / lighting / 비례 / AI 결함)
3. 통과본만 references/boost-interior/generated-approved/<shotId>.jpg|png|webp 로 복사
4. tsx scripts/template-platform-step6-assets.ts        # seat aspect로 centre-crop + resize → assets/<shotId>.jpg, registry 갱신
5. pnpm site:build boost-interior-demo                   # 같은 release, 새 buildInputId
6. tsx scripts/template-platform-step6-visual-smoke.ts && tsx scripts/template-platform-step6-review-pack.ts
```

- asset id = shotId 로 고정이라 **content 문서는 한 글자도 바뀌지 않는다.** 바뀌는 것은 `assets/` (파일 + registry)뿐.
- 일부만 승인되면 상태는 자동으로 `PARTIAL`이 된다 (`04-asset-status.json`, 테스트 K3가 registry와 대조).
- 주의: step 4의 raster ingestion 분기(sharp)는 **실제 승인 이미지로는 아직 미실행**이다. 격리 합성 리허설은 PASS (§0.4).

## 6. 자동 검증 (platform/test/step6.test.ts)

| 체크 | 내용 |
|---|---|
| J | 참조된 모든 asset: registry 항목 + 디스크 파일 + package 안 content-addressed 사본(sha256 일치) |
| K | 미참조 public asset 0: registry = 참조 집합, `assets/`에 미등록 파일 0, package `/assets` = 참조 집합 |
| K2 | reference 14개 파일의 sha256과 일치하는 site/package asset 0, 같은 파일명 0, PNG asset 0 |
| K3 | `04-asset-status.json`이 registry와 일치 (approved = raster, stand-in = SVG), verdict가 개수에서 계산됨, `generated-approved/`의 이미지 수 = ingest된 수 |
