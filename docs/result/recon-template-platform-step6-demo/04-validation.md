# 04 — Validation

## 0. 2026-09-20 마감 실행 — 재검증 결과

승인 이미지가 0장이라 사이트 입력은 바뀌지 않았다. 아래는 **"지금 상태가 여전히 green인가 + 이번 실행이 아무것도 망가뜨리지 않았는가"**의 재검증이다.
실행 순서대로, 전부 2026-09-20 18:14–18:20 (KST) 실측.

### 0.1 실행 명령과 결과

| # | 검증 | 명령 | 결과 |
|---|---|---|---|
| 1 | Template hash proof (실행 **전**) | `tsx --tsconfig platform/tsconfig.json platform/test/step6-proof.ts verify` | `verified: true` · `changed: []` · before = after = `93d7da0f…b8ea83` |
| 2 | Platform typecheck | `pnpm typecheck:platform` | **PASS** (exit 0) |
| 3 | Platform regression 전체 | `pnpm test:platform` | **235 passed / 0 failed** (exit 0) — slice1 72 · step4 47 · step41 35 · step5 32 · polish 4 · step52 16 · **step6 29** |
| 4 | Ingestion (실제 repo) | `tsx scripts/template-platform-step6-assets.ts` | exit 0 · approved 0 / 51 · 출력이 실행 전과 **byte-identical** (Site Instance 62 파일 sha256 diff 0, `04-asset-status.json` `cmp` 동일) |
| 5 | Site build | `pnpm site:build boost-interior-demo` | **`up-to-date`** — buildInputId `4d3d08f4d35b11e9ffa768056082f57afe22d0d20450499a74c2da576008706f` 그대로. 입력이 같으면 새 package를 만들지 않는 것이 정상 동작 |
| 6 | **Step 6 visual smoke** | `tsx scripts/template-platform-step6-visual-smoke.ts` | **237 / 237**, 18 visits, exit 0 · **스크린샷 32장 + `report.json` 재생성됨** (mtime 18:17–18:18) |
| 7 | 기존 fixture visual smoke | `tsx scripts/template-platform-polish-visual-smoke.ts <scratch>` | **962 / 962**, 30 visits → `EXISTING_FIXTURES_REGRESSION = NONE` |
| 8 | Template hash proof (실행 **후**) | 1과 같음 | `verified: true` · `changed: []` → `proof/final.json` |
| 9 | Root tsc — 이번에 수정한 Step 6 스크립트 2개 | `tsc --noEmit -p tsconfig.json \| grep step6-` | 오류 0 (기존 2건 `polish-visual-smoke.ts:1088,1090`은 그대로, 미수정) |
| 10 | **중단 복구 후 최종 최소 검증** (스크립트 최종 수정 뒤 각 1회, 18:41–18:45) | step6 test · `step6-assets.ts` · step6 visual smoke · review pack · proof verify | step6 **29 / 0** · assets exit 0 (출력 byte-identical) · smoke **237 / 237** (스크린샷 32장 다시 재생성) · review pack exit 0 (링크 누락 0, 외부 요청 0) · proof `verified: true`, `changed: []` |

### 0.2 확인 지표

| 지표 | 값 |
|---|---|
| STEP6_STATUS | **PARTIAL** |
| AI_PORTFOLIO_ASSETS | **0 / 51** (WAITING_FOR_GENERATION) |
| FLAGSHIP_SAME_HOME_CONSISTENCY | **NOT_READY** (판정 대상 이미지 없음) |
| DATA_ONLY_SWAP | **PASS** (변동 없음, 테스트 A–Z 재통과) |
| TEMPLATE_CODE_CHANGED | **NO** |
| OLD_RELEASE_MUTATED | **NO** |
| BROKEN_MEDIA | **0** (17 visits 전부) |
| NON_LOCAL_RUNTIME_REQUESTS | **0** |
| HORIZONTAL_OVERFLOW | **0** (320px 포함) |
| console errors / page errors | **0 / 0** |
| failed subresources | 0 |
| EXISTING_FIXTURES_REGRESSION | **NONE** (962 / 962) |
| visual smoke pass count | **237 / 237** |
| screenshots regenerated | **YES** — 32 PNG (16 full + 16 fold) + report.json |

smoke check별 집계 (pass/fail): `http-status` 17/0 · `lang-ko-KR` 17/0 · `horizontal-overflow-0` 17/0 · `broken-images-0` 17/0 · `malformed-text-0` 17/0 ·
`console-errors-0` 17/0 · `page-errors-0` 17/0 · `non-local-requests-0` 17/0 · `failed-subresources-0` 17/0 · `floating-cta-one-fixed-seat` 17/0 ·
`floating-cta-korean-label-and-mailto` 17/0 · `display-text-no-mid-word-break` 17/0 · `floating-cta-covers-no-footer-text` 17/0 · filter contract 16/0.

### 0.3 절대 확인 — 실행 전/후 sha256 tree 비교 (이번 실행에서 독립적으로 계산)

`find <tree> -type f | sort | xargs shasum -a 256`을 **작업 시작 전**에 저장하고, 모든 작업이 끝난 뒤 다시 계산해 `diff`했다.

| tree | 파일 수 | 전/후 |
|---|---|---|
| `templates/interior-01/v1` | 38 | **IDENTICAL** |
| `data/template-releases` (release 전부) | 306 | **IDENTICAL** |
| `platform` (test 제외) | 26 | **IDENTICAL** |
| `data/sites/fixture-{small,large,empty}` | 135 | **IDENTICAL** |
| `data/site-builds/fixture-{small,large,empty}` | — | **IDENTICAL** |
| `data/sites/boost-interior-demo` | 62 | **IDENTICAL** (assets는 재도출되어 mtime만 바뀌고 내용 동일) |
| `data/site-builds/boost-interior-demo/packages` | 2 package | 그대로 (`4d3d08f4…` current · `eca5cb39…` previous) |

reference-only 유입 검사: reference 14개 sha256 ∩ (site assets + current package 115개 고유 해시) = **0**, site/package 안 png·jpg·webp = **0**.

### 0.4 이번 실행에서 수정된 파일 (`find -newermt '2026-09-20 18:05'`, node_modules/.git 제외)

| 경로 | 성격 |
|---|---|
| `scripts/template-platform-step6-assets.ts` | Step 6 스크립트 — 무시된 파일/확대/과도한 crop **경고 추가** (`03` §0.4). 승인 0장 상태의 출력은 byte-identical |
| `scripts/template-platform-step6-review-pack.ts` | Step 6 스크립트 — human-review 페이지 보강 (shot 상태 표 · seat crop 미리보기 · 체크리스트 · build identity, `07`) |
| `docs/result/recon-template-platform-step6-demo/**` | 보고서 00–07 · `human-review/` · `screens/`(재생성) · `proof/final.json` · `proof/raster-ingestion-rehearsal.json`(신규, 텍스트 기록) · `04-asset-status.json`(내용 동일) |
| `references/boost-interior/generated-candidates/README.md` | 신규 — staging 폴더 안내문만 (이미지 0) |
| `data/sites/boost-interior-demo/assets/*` | 재도출 — **내용 동일**, mtime만 |

Step 6 밖의 구현 코드(`templates/**` · `platform/**` · `src/**` · `supabase/**` · `package.json` · fixture) 수정 **0**. commit/push 없음.
(`prompt` 파일은 사용자가 18:11에 저장한 입력 파일이다.)

### 0.45 중단 복구 감사 (2026-09-20 18:37, READ-ONLY)

작업이 한 번 중단된 뒤 이어서 진행했다. 재개 전에 확인한 것:

| 확인 | 결과 |
|---|---|
| 중단 직전 수정 파일 · background agent 수정 파일 | 위 §0.4 목록과 일치. agent는 `step6-review-pack.ts` 1개만 수정 |
| 잘린/깨진 파일 | 0 — 수정된 md·ts·html·json 전부 NUL byte 0, JSON parse OK, HTML은 `</html>`로 종료, `tsc` step6 오류 0 |
| `sharp` 변수 중복 선언 의심 | 실제 파일 확인: `const sharp = await loadSharp()`는 **1회** (assets 스크립트 373행). 중복 없음 |
| template / release(7) / platform / fixture site·build tree | 실행 전 sha256과 전부 **IDENTICAL** |
| `generated-approved/` raster | **0** (manifest.json만) |
| `boost-interior-demo` Site Instance | 62 파일 sha256이 실행 전과 동일 = stand-in 상태 그대로. registry `image/jpeg` 0 |
| 합성 리허설 이미지 유출 | **0** — repo의 approved 폴더·Site assets·site-builds에 raster 0, 리허설 buildInputId/asset hash가 repo `data/`·human-review에 등장 0. 리허설은 scratch devroot 안에서만 실행됨 (devroot의 repo 방향 symlink는 읽기 용도) |
| 조치 1건 | 1차 작업 때 `docs/result/.../rehearsal/`에 복사해 둔 **테스트 패턴이 찍힌 스크린샷 8장을 저장소에서 삭제**하고 텍스트 기록(`proof/raster-ingestion-rehearsal.json`)으로 대체 |
| production tree의 임시 파일 | 0 (repo `tmp/`는 09-18 그대로, `data/site-builds/boost-interior-demo/` 내용 불변) |

### 0.5 mobile / desktop 검토 요약

사이트 입력이 같으므로 렌더 결과는 2026-09-19와 동일하다 (아래 §4·§5의 독립 visual 리뷰가 그대로 유효).
재생성된 스크린샷 기준으로 다시 확인한 것: 390/1440 home · portfolio · flagship detail · before/after detail · 404 모두 check 전부 통과, 가로 overflow 0, floating CTA 1개·footer 가림 0.
남아 있는 모바일 이슈 2건(O14 carousel peek · O15 tab bar cue)은 Template 소유라 미수정 — `06`.
**격리 리허설**(합성 테스트 raster 1장을 넣은 devroot package)에서도 같은 smoke가 237 / 237이었다 → raster asset이 들어와도 레이아웃·overflow·CTA 지표가 유지된다는 사전 증거 (`03` §0.4). 단, 이것은 `RASTER_INGESTION_REHEARSAL`이고 `REAL_APPROVED_RASTER_INGESTION`은 NOT_YET_RUN이다.

---

# (2026-09-19 기록) 최초 Step 6 실행의 검증

모든 수치는 최종 build(`4d3d08f4d35b11e9…`) 기준, 2026-09-19 최종 실행 결과다.

## 1. 요약

| 검증 | 명령 | 결과 |
|---|---|---|
| Platform typecheck | `pnpm typecheck:platform` | **PASS** (exit 0) |
| Root typecheck | `tsc --noEmit` | 오류 2건 — 둘 다 **기존** `scripts/template-platform-polish-visual-smoke.ts:1088,1090` (Step 6 이전 파일, 미수정). Step 6 파일 오류 0 |
| Platform regression (전체) | `pnpm test:platform` | **235 passed / 0 failed**, exit 0 — slice1 72 · step4 47 · step41 35 · step5 32 · polish 4 · step52 16 · **step6 29** |
| Step 6 visual smoke | `tsx scripts/template-platform-step6-visual-smoke.ts` | **237 / 237**, 18 visits |
| 기존 fixture visual smoke | `scripts/template-platform-polish-visual-smoke.ts` (scratch 출력) | **962 / 962**, 30 visits → `EXISTING_FIXTURES_REGRESSION = NONE` |
| Template hash proof | `tsx --tsconfig platform/tsconfig.json platform/test/step6-proof.ts verify` | `verified: true`, `changed: []` → `proof/final.json` |
| Package QA (build 내장) | `pnpm site:build boost-interior-demo` | pass, warnings 0, forbidden terms 0 |

기존 테스트의 assertion은 하나도 삭제·약화하지 않았다. `package.json` 변경은 `test:platform` 끝에 step6 테스트를 append한 한 줄이다.

## 2. Template source hash (§35)

```
TEMPLATE_SOURCE_HASH_BEFORE = 93d7da0fc06e1583d30af6aa40dd0e95297ab3b7a5e83bd73fea95fd82b8ea83   (baseline 2026-09-19T11:08:42Z)
TEMPLATE_SOURCE_HASH_AFTER  = 93d7da0fc06e1583d30af6aa40dd0e95297ab3b7a5e83bd73fea95fd82b8ea83   (final, 동일)
release record              = 93d7da0f…  (동일)   live-vs-release drift = []
```

tree hash 전부 동일: `templates/interior-01/v1`, `platform`(test 제외), `data/sites/fixture-*` ×3, `data/site-builds/fixture-*` ×3, release 디렉터리 ×7.
baseline 이후 Step 6 경로 밖에서 수정된 파일: `package.json` 1개. `src/**`, `supabase/**` 0.

## 3. Automated checks A–T (§34) → `platform/test/step6.test.ts`

| § | 요구 | 테스트 | 결과 |
|---|---|---|---|
| A | boost-interior-demo Site Instance 존재 | A | ok |
| B | 정확히 `interior-01-1.4.0-9e1ea20da947` pin | B | ok |
| C | release hash 불변, release 추가/삭제 0 | C0, C | ok |
| D | Template source hash 불변 | D, D2 | ok |
| E | 기존 fixture 불변 | E | ok |
| F | Harbor & Pine / fixture identity 누출 0 | F (fixture 3개의 brand·email·origin·전 프로젝트 제목을 **읽어서** 대조, 토큰 > 100) | ok |
| G | Apartmentary 누출 0, off-origin URL 0 | G | ok |
| H | flagship 34평 = supply, 전 프로젝트 basis 명시 | H | ok |
| I | 34 → 84 자동 환산 없음 | I | ok |
| J | 참조 asset 전부 존재 | J | ok |
| K | 미참조 public asset 0 | K, K2 (reference 복사 0 · SVG embed 0), K3 (asset status 정직성) | ok |
| L | slug/id unique, ≥ 6 projects, data-quality 필드 | L | ok |
| M | 내부 링크 전부 resolve | M | ok |
| N | filter contract (keyword/type/area/style/price/sort/combined/zero) | N | ok |
| O | 전 페이지 floating CTA 1개, "상담 문의" | O | ok |
| P | CTA 설정 off → 사라짐 | P (throwaway build) | ok |
| Q, R | 단일 canonical collection, A/B = selection | Q+R | ok |
| S | banners@1 충분 | S | ok |
| T | reviews@1 | T | ok |
| + | 같은 release · 다른 4 site | V | ok |
| + | nav = 실제 route만 | Z | ok |
| + | lang / title / description / canonical / sitemap | X | ok |
| + | theme = 선언된 token만 | W | ok |
| + | origin = synthetic-fixture | Y | ok |
| §30 | 재현성: 같은 입력 → 같은 buildInputId, 독립 rebuild → 같은 packageHash | U | ok |

## 4. Visual QA (§31–33)

Viewport 390 / 800 / 1000 / 1440 / 1920 + 320 stress. 대상: Home(6 viewport), Portfolio, filtered Portfolio, Flagship detail, before/after detail, 404 (각 390·1440).
Pagination은 해당 없음 — 8 projects < page size 30이라 `/portfolio/page/2`가 생성되지 않는다 (route plan이 자동 prune).

| 지표 | 값 |
|---|---|
| NON_LOCAL_RUNTIME_REQUESTS | **0** |
| BROKEN_MEDIA | **0** (lazy 미로드 이미지는 HTTP fetch로 200 + image content-type 확인) |
| HORIZONTAL_OVERFLOW | **0** (320 포함) |
| console errors / page errors | **0 / 0** |
| failed subresources | 0 |
| malformed Korean (U+FFFD) | 0 |
| bad wrapping (제목류 mid-word break) | 0 — 1건 발견 후 문구로 수정 (`02` §8) |
| CTA obstruction (footer 텍스트 가림) | 0 |
| floating CTA | 전 visit 1개, fixed, "상담 문의" → mailto |
| Filter (브라우저) | 13 URL case + 타이핑 + reset 전부 기대 id 집합과 일치 |

스크린샷 32장: `screens/` · 모아 보기 `human-review/site.html`.

## 5. 독립 리뷰 (READ-ONLY, fresh context, 결론을 알려주지 않음)

| 리뷰어 | 결과 | 조치 |
|---|---|---|
| Architecture / data-only proof (opus) | Template·release·fixture 변경 0을 **mtime + release hash 재계산으로 독립 확인.** MAJOR 2 (basis가 label slot에 의존 / 증명이 11개 platform 파일에 대해 self-referential), MINOR 4, NOTE 5 | 테스트 강화: C0(baseline sha256 pin), D2(mtime anchor), F(fixture-small·empty까지 data-driven), K2(SVG embed 금지), 버전 비교 regex → semver. 나머지는 `06`에 기록 |
| Korean copy / content (sonnet) | 거짓 claim 0, 실명·단지명 0, 34평/84㎡ 표현 정확. MAJOR 2 (데모 고지가 footer·meta에 렌더), MINOR 7, NOTE 3 | 전부 site data로 수정 (`02` §3, §10). price 없는 프로젝트의 행 숨김 확인 |
| Image prompt pack continuity (sonnet) | Visual Bible 사실 오류 0, copy risk 0, manifest 구조 clean. MAJOR 2 (before shot 자기모순 / continuity landmark가 crop 밖), MODERATE 1 (니치 장 위치 미고정) | before 전용 home 문단 + `image-to-image` 지정, landmark를 central square 안으로, **고정 평면(PLAN) 문장**을 reference 4장과 대조해 추가 |
| Visual QA of screenshots (sonnet) | 48/48 segment 검토. 줄바꿈·깨진 글자·혼합 언어·placeholder·contrast·filter UI·footer·404·before/after toggle·stand-in crop **문제 0**. 지적 2건: (1) 모바일(320/390) home carousel 3곳에서 두 번째 카드가 viewport 끝에서 잘려 보임 — 리뷰어는 BLOCKER로 분류, (2) 모바일 detail의 공간 tab bar가 가로 스크롤인데 affordance 없음 — MINOR | 둘 다 **Template 소유 동작**으로 확인: (1) `template.css:1653` `grid-auto-columns: 84%` + `scroll-snap-type: x mandatory` = 의도된 carousel peek (progress bar·화살표 동반, 같은 release를 쓰는 fixture도 동일한 CSS), (2) `.i1-gallery__tabs { overflow-x: auto }`. Site data로 바꿀 수 없고 Template은 frozen → **수정하지 않음**, `06` O14·O15로 Pre-Demo Gate에 전달 (peek에 fade/mask affordance를 줄지 사람이 판단). 첫 visual 리뷰어는 sips crop에서 20분 정지해 중단하고, sharp로 미리 자른 segment로 fresh 리뷰어를 다시 돌렸다 |

## 6. 실행 중 발견 → 수정 기록 (CLAUDE.md §12)

| 실패 | 원인 | 수정 | 재검증 |
|---|---|---|---|
| smoke: detail "broken images" | 접힌 공간 그룹의 lazy 이미지는 로드되지 않음 — 깨진 게 아님 | broken = `complete && naturalWidth === 0`; pending lazy는 fetch로 확인 | smoke |
| smoke: 320px mid-word break | hero 문구가 "수납 / ·동선을"로 줄바꿈 | **문구** "수납과 동선" (Template CSS 미수정) | build + smoke |
| test X: home canonical 없음 | Template이 list/detail에만 canonical 출력 | assertion을 실제 계약으로 교정(list/detail canonical + detail title), home 건은 `06` O4 | test |
| test S: `&&`/`||` 우선순위 버그 | 내 테스트 코드 | 괄호 | test |
| root tsc: Step 6 script 오류 | nodenext에서 extensionless import / sharp 타입 | proof를 `platform/test/`로 이동, assets script self-contained | tsc |
