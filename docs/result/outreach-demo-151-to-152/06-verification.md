# 06 — 검증 + independent review (2026-09-22)

## 1. canonical 작업본 (최종 동일 working tree)

`/Users/woops/projects/web-recon-track-b`, 모든 수정이 끝난 뒤 한 번에 실행. `test:platform` 은 `package.json` 의 `&&` chain 그대로.

| 항목 | 결과 |
|---|---|
| root typecheck (`tsc --noEmit`) | exit 0 |
| platform typecheck (`tsc -p platform/tsconfig.json`) | exit 0 |
| runtime typecheck (`tsc -p workers/recon-runtime/tsconfig.json`) | exit 0 |
| `test:platform` | exit 0 — slice1 72 · step4 47 · step41 35 · step5 32 · polish 4 · step52 12 · step6 30 · predemo 10 · predemo2 9 · ia150 15 · ia151 10 · ia152 14 — **FAIL 0** |
| 1.5.2 browser smoke (`scripts/template-platform-ia152-smoke.ts`) | **52 / 52** (390 / 1440, served head, mailto hand-off, long-inquiry fallback, overflow 0, console error 0) → `proof-152/smoke-ia152.json` |
| `test:publish` | **59 passed, 0 failed** |
| `test:publish:e2e` (local wrangler dev) | **45 passed, 0 failed, 1 skipped** (skip = live-mode 전용 "canonical origin == BASE" 검사, local 에서는 원래 skip) → `proof-152/local-e2e.json` |
| release immutability | ia152 R1/R2 + step4 B + step41 release + step5 C + step6 C/D + slice1 immutability — 통과. `git diff HEAD -- data/template-releases` 없음 |
| package QA | demo 1.5.2 build `qa.pass = true`, failures 0 (156 files, 7,390,478 B) |

`test:publish:e2e` 는 매 실행마다 `docs/result/static-deployment-foundation/proof/local-e2e.json` (이전 milestone 의 tracked proof) 을 덮어쓴다. 이번 실행 결과는 `proof-152/local-e2e.json` 으로 옮기고, 그 tracked 파일은 HEAD 내용으로 되돌렸다 (이번 테스트 실행이 만든 변경만 되돌림). 고정 경로에 쓰는 e2e 동작 자체는 바꾸지 않았다 (기록: 다음 작업 후보).

## 2. fresh-clone-equivalent (references/ 없음)

절차는 `04` §3. 후보 트리 = HEAD + 이번 commit 대상 전부 (mtime 보존 없이 복사, 삭제 반영) → 그 안에서 commit → 다시 `git clone`. `references/` 없음, `node_modules` symlink 외 untracked 없음.

| 실행 | 결과 |
|---|---|
| HEAD `14c49a6` 그대로 (수정 전) | step6 **3 FAIL** (D2 mtime, K2/K3 ENOENT) |
| 1차 후보 | step6 통과, slice1/step4/step41/step5 각 **1 FAIL** (release 파일 read-only mode — Git 이 저장하지 않음; HEAD 에도 있던 문제) |
| **2차 후보 (최종)** | typecheck 3종 exit 0 · `test:platform` exit 0 (위와 같은 수, FAIL 0) · 1.5.2 smoke 52/52 · `test:publish` 59/0 |

→ **FRESH_CLONE_TESTS_HERMETIC = YES** (`test:publish:e2e` 는 wrangler dev 가 필요한 local integration 이라 canonical 트리에서만 실행; 이것도 references/ 를 읽지 않는다).

## 3. independent review (fresh context, 강한 모델, read-only)

reviewer 에게 원하는 결론을 주지 않고 13개 관점 (1.5.1 regression, noindex demo-only, canonical, OG, og:image raster guard, bundle, email source, 한국어, release immutability, mixed-version pinning, hermeticity, references 의존, rotation 손상) 을 독립적으로 보게 했다.

**BLOCKER 0.**

| # | 등급 | 지적 | 처리 |
|---|---|---|---|
| 1 | MAJOR | `references/` 가 untracked 이지만 ignore 되지 않음 → `git add .` 한 번에 고객 사진 138 MB commit 가능 | **수정**: `.gitignore` 에 `/references/` 추가. 확인: `git check-ignore` 적중, `git status references` 0 줄 |
| 2 | MAJOR | 테스트가 아직 untracked 인 `proof/before.json`, `step6-references.json` 등을 읽음 → 따로 stage 하면 fresh clone 실패 | **처리**: 같은 commit 에 명시적으로 stage (§4). 2차 fresh-clone 검증이 바로 그 파일 집합으로 통과 |
| 3 | MINOR | e2e 가 이전 milestone 의 tracked proof `local-e2e.json` 을 덮어씀 | **처리**: 이번 결과를 `proof-152/` 로 옮기고 tracked 파일은 HEAD 로 되돌림 (§1) |
| 4 | MINOR | demo 404 에 robots noindex 태그 2개 (framework + site) | **수용 + 고정**: 무해 (같은 값). ia152 P2 를 "≥1" 에서 정확히 `["noindex","noindex"]` 로 좁힘 |
| 5 | MINOR | 홈 canonical 은 slash 없음, sitemap `<loc>` 는 slash 있음 | **수용**: 과제 결정 (bare origin 인정, 새 SEO 장치 금지). `05` §3 에 기록 |
| 6 | MINOR | step4/41/5 가 여전히 "fixture 3개가 같은 pin" 을 요구 | **수용 + 기록**: fixture 3개는 한 세트로 관리되는 test fixture 이고 지금 같은 1.5.1 pin 이다. "latest" 가정은 제거됨 (`03` §2). fixture 하나만 따로 re-pin 하는 날 그 check 를 per-site 로 바꾼다 |
| 7 | MINOR | step6 D 는 working-tree source == **demo** pin 을 요구 → Template 을 고치면 demo re-pin 전까지 step6 실패 | **수용 + 기록**: 의도. step6 은 demo 의 증명이고, demo 는 선두 site 다. 다른 site 는 이 요구를 받지 않는다 |
| 8 | MINOR | ia152 J1 이 source 문자열을 그대로 비교 → 포맷만 바꿔도 실패 | **수용**: 기존 ia150/151 J 계열과 같은 방식. 동작은 P1/F2 가 별도로 검증 |
| 9 | MINOR | raster guard 가 확장자 regex (대소문자 구분) | **수용**: `platform/site/instance.ts` 가 asset publicPath 를 소문자 `/assets/<hash>.<ext>` 로 강제하므로 현재 버그 없음. 1.5.2 Template 을 다시 고치지 않음 (release 를 또 만들 이유가 아님) |

reviewer 가 "checked and fine" 으로 확인한 것: fixture 불변 / 1.5.1 출력 유지, noindex 는 demo settings 에만, Template 에 siteId·origin·email literal 없음, canonical 13 페이지 정확, OG = title/description/canonical, og:image 절대 URL·자기 origin·raster·2400×1350·alt, bundle chunk 수·bytes 동일 (home/contact/about/portfolio/3d-portfolio), email source 1개·옛 주소/origin 잔존 0, 한국어 `{email} 주소로`, 옛 release 변경 0, rotation 정상 (current 1.5.2 / previous 1.5.1 존재), `step6-references.json` == 디스크, D2 porcelain 파싱 정상, secret 없음, 새 package 7.4 MB / 2 MB 넘는 파일 없음.

리뷰 뒤 추가 수정 (`.gitignore`, ia152 P2, read-only mode helper, e2e proof 이동) 은 §1 의 최종 실행과 §2 의 2차 fresh-clone 실행에 모두 포함돼 있다.

## 4. commit 대상 (명시적 path, `git add .` 미사용)

- `.gitignore`, `package.json`
- `templates/interior-01/v1/{app/layout.tsx,app/page.tsx,lib/seo.ts,sections/HomeHero.tsx,sections/homeHeroData.ts,template.ts}`
- `data/template-releases/interior-01/interior-01-1.5.2-d87807590d64`
- `data/sites/boost-interior-demo/{site.json,settings.json,slots.json,content/business.json}`
- `data/site-builds/boost-interior-demo` (current / previous / history / 새 package / rotation 으로 지워진 1.5.0 package 삭제)
- `platform/test/` 변경 + 신규 (`ia152.test.ts`, `canonical-152.ts`, `step6-references.json`, `git-checkout.ts`)
- `scripts/template-platform-ia{,151,152}-smoke.ts`
- `docs/result/outreach-demo-151-to-152/` (보고서, `proof/before.json`, `proof/capture-before.mjs`, `proof-152/*.json`; PNG 는 `.gitignore`)

제외: `references/` (ignore), 루트 `prompt` (같은 내용을 `_prompt-continuation.md` 로 보관), `tmp/`, `node_modules/`.
