# 04 — 통합 후 전체 로컬 검증 (2026-09-22)

모든 명령은 **통합이 끝난 하나의 폴더** `/Users/woops/projects/web-recon-track-b` 에서 실행했다 (Track A 문서 복사 + `data/.gitkeep` 이후). Node v22.22.3, TypeScript 5.9.3, wrangler 4.135.0, Playwright Chromium. `pnpm` 은 돌리지 않았고 `./node_modules/.bin/*` 를 직접 불렀다. `RECON_PUBLISH_ALLOW_REMOTE`, `E2E_BASE` 는 unset. Cloudflare 와 통신하는 명령은 하나도 없다.

실행 스크립트와 로그: `tmp/consolidation-logs/run-all.sh`, `summary.txt`, 단계별 `*.log` (git 무시 영역).

예전 보고서의 숫자를 기대값으로 쓰지 않았다. 아래 숫자는 각 테스트가 스스로 출력한 집계다.

## 1. 결과

| # | 범주 | 명령 (`package.json` script) | 결과 | 시간 |
|---|---|---|---|---|
| 1 | root TypeScript | `tsc --noEmit` (`typecheck`) | **0 errors** | 5 s |
| 2 | platform TypeScript | `tsc -p platform/tsconfig.json` (`typecheck:platform`) | **0 errors** | 1 s |
| 3 | runtime TypeScript | `tsc -p workers/recon-runtime/tsconfig.json` (`typecheck:runtime`) | **0 errors** | 1 s |
| 4 | `test:platform` (11개 suite 를 script 와 같은 순서로) | `tsx --tsconfig platform/tsconfig.json platform/test/<suite>.test.ts` | **275 passed, 0 failed** | 189 s |
| 5 | `test:publish` | `… platform/test/publish.test.ts` | **59 passed, 0 failed** | 9 s |
| 6 | 1.5.1 browser smoke | `tsx scripts/template-platform-ia151-smoke.ts <scratch outDir>` | **65 / 65 passed** | 46 s |
| 7 | `test:publish:e2e` (clean state: 실제 wrangler local R2 → workerd → HTTP → Chromium) | `… platform/test/publish-e2e.test.ts` | **45 passed, 0 failed, 1 skipped** | 193 s |
| 8 | dry-run 결정성 | `site:publish --site boost-interior-demo --host interior-demo.example --dry-run` × 2 | 두 출력 **바이트 동일** (`cmp`), store 접근 0 | 1 s |
| 9 | Worker bundle | `wrangler deploy -c workers/recon-runtime/wrangler.jsonc [--env pilot] --dry-run --outdir …` | default · pilot 모두 **7.49 KiB / gzip 2.74 KiB**, binding `env.SITES → boost-sites-artifacts` 하나, `--dry-run: exiting now.` (업로드 없음) | 3 s |

`test:platform` 내역: slice1 72 · step4 47 · step41 35 · step5 32 · polish 4 · step52 12 · step6 29 · predemo 10 · predemo2 9 · ia150 15 · ia151 10 = 275.

e2e 에서 skip 된 1건은 live 모드(`E2E_BASE=https://…`)에서만 존재하는 검사다: "모든 canonical URL 과 sitemap `<loc>` 이 BASE 의 origin 과 같다". local 모드에서는 package 가 일부러 다른 origin(`https://boost-interior-demo.example`)으로 구워져 있어서 건너뛴다.

e2e 종료 후 남은 `wrangler` / `workerd` 프로세스: 0.

## 2. 식별자 보존 (요구사항 §6)

`platform/` 의 기존 함수를 import 해서 디스크의 바이트로부터 다시 계산했다 (`tmp/consolidation-logs/hashcheck/recompute.ts`). `hashDir` 만 module-private 이라 같은 알고리즘을 옮겨 적었고, export 된 `packageIntact` 로 교차 확인했다.

| 식별자 | 기대값 | 재계산 | |
|---|---|---|---|
| release | `interior-01-1.5.1-6bbdd07eb9bf` | `computeReleaseHash` (`platform/release/release.ts:96-104`) → `6bbdd07eb9bf07aef7f9d975f4a0fce977820874246bc4403cc8af5d89425d02` | **MATCH** |
| demo buildInputId | `aa71b829ec7046f223904d42d38d1fe58a7b3fc61a245d6d3f6a4112c710b171` | `computeBuildInputId` (`platform/build/build-input.ts:16-23`) = sha256(releaseHash, siteSnapshotHash, mode, toolchainHash). 현재 `data/sites/boost-interior-demo` 로 만든 siteSnapshotHash `7de4409d…` 도 기록값과 일치 | **MATCH** |
| demo packageHash | `613cd9e00e73d8428efcb9afa4249bb353952994c0653568da59adc407890266` | `hashDir` (`platform/build/site-build.ts:131-142`), 156 파일 · 7,283,710 B | **MATCH** |
| previous (rollback) package | buildInputId `6c74d34c2ecd…`, template `interior-01-1.5.0-75f173939e77` | packageHash `c28ad0131b71…`, 156 파일 · 7,279,757 B = `build-record.json` 기록값 | **MATCH** |

값이 하나도 달라지지 않았으므로 새 release / 새 build 는 만들지 않았다.

```
INTERIOR_RELEASE    = interior-01-1.5.1-6bbdd07eb9bf
DEMO_BUILD_INPUT_ID = aa71b829ec7046f223904d42d38d1fe58a7b3fc61a245d6d3f6a4112c710b171
DEMO_PACKAGE_HASH   = 613cd9e00e73d8428efcb9afa4249bb353952994c0653568da59adc407890266
```

## 3. release 불변성

`data/template-releases/interior-01/` 의 release **11개 전부**: 저장된 파일을 다시 해시 → `computeReleaseHash` / `templateSourceHash` 재계산 → `release.json` 과 동일, 12-hex 접두사가 디렉터리 이름과 일치 (`loadRelease` + `verifyRelease`).

`1.0.0-1ddf327cb1b9` · `1.0.0-f27823c3b837` · `1.1.0-512e4dd932b4` · `1.2.0-93fb66acda7d` · `1.3.0-74a70c276f35` · `1.3.1-bd4ae8fb1769` · `1.4.0-9e1ea20da947` · `1.4.1-59179ca20368` · `1.4.2-a223ccd0759c` · `1.5.0-75f173939e77` · `1.5.1-6bbdd07eb9bf` — 11/11 OK.

`test:platform` 안의 불변성 검사도 통과했다. 예: ia151 `R1 every release dir captured before the cut (1.0.0 … 1.5.0) verifies and is byte-identical to the capture; the only new dir is one 1.5.1`, `R2 the 1.5.1 release = the 1.5.0 release except exactly the seven declared Template files`, `D1 every demo site file is byte-identical to the pre-cut capture except site.json (pin only) and slots.json`.

## 4. demo build QA 와 package 바이트 동일성

- `data/site-builds/boost-interior-demo/packages/aa71b829…/build-record.json`: `qa.pass: true`, `qa.files: 156`, `qa.bytes: 7283710`, `qa.failures: []`, `preflight.warnings: []`.
- e2e: "every addressable package file: 200, stored content-type + cache-control, ETag, nosniff, **bytes identical to the package**" — ok. 새로 쓰인 `proof/local-e2e.json` 의 `byteEquality`: addressable **154**, identical **154**, 7,250,640 B (156 파일 중 URL 로 닿지 않는 2개 제외). upload 156/156, read-back verify 156/156 (sha256 + size). `_not-found.html` 은 URL 로 닿지 않지만 R2 에 바이트 동일하게 저장됨 — ok.
- e2e: "published package directory under data/site-builds is **byte-identical before/after**" — ok. publish 가 package 를 건드리지 않는다.
- 두 트리 비교(`01`)에서 `data/site-builds/**` 2,730 파일은 MAIN 과 TRACK-B 가 바이트 동일.

## 5. 보고서 숫자 정합성

대상: `docs/result/static-deployment-foundation/` 의 최상위 보고서 00–09. `_session1/` 은 1차 세션의 역사 기록이므로 비교 대상에서 뺐고 **한 글자도 고치지 않았다.**

### 5.1 감사 결과 (독립된 fresh-context 에이전트, read-only)

| 수량 | 보고서의 값 | 오늘 실측 | 판정 |
|---|---|---|---|
| `test:publish` | 59 / 0 (`00:58`, `06:15`) | 59 / 0 | 일치 |
| `test:publish:e2e` | 45 / 0 / 1 skipped (`00:59`, `00:143`, `06:16`) | 45 / 0 / 1 | 일치 |
| `test:platform` 합계와 suite 별 값 | 275 / 0 (`00:56`, `06:13`, `01` §8) | 275 / 0 | 일치 |
| `test:platform` — `01:3`, `01:59`, `01:69` | **272 / 3** (slice1 71/1 · step6 28/1 · ia150 14/1) | 275 / 0 | **시점 차이.** 1차 세션 기록. 같은 파일 §8 이 이미 "더 이상 사실이 아님"으로 정정하고 있었지만, 맨 위 STATUS 줄에서는 §8 로 가는 안내가 없었다 |
| browser smoke | 65 / 65 (`00:57`, `01`, `06:14`) | 65 / 65 | 일치 |
| smoke script 경로 — `06:14` | `platform/test/ia151-smoke.ts` | 그런 파일은 없다. 실제는 `scripts/template-platform-ia151-smoke.ts` | **오류** |
| Worker bundle | 7.49 KiB (`00:47`), 7.49 KiB / gzip 2.74 KiB (`06:18`) | 7.49 / 2.74 | 일치 |
| package 156 파일 · 7,283,710 B · 계획 object 158 | 00, 02, 06 전체 | 동일 | 일치 |
| Worker 경유 바이트 동일성 | 154 of 154 (`00:60`, `06:62`) | 154 / 154 | 일치 |
| fault injection 146 위치 · hostile path 41 (= 28 + 13, `08:54-55`) | `00:65`, `08` | — (리뷰어의 수치, 재실행 대상 아님) | 문서 간 일치 |
| 2차 독립 리뷰 finding 수 | BLOCKER 0 · MAJOR 4 · MINOR 12 · NOTE 9 (`00:65`, `08:7`) | `08` 의 표를 직접 세면 R1–R4 = 4, R5–R16 = 12, N1–N9 = 9, BLOCKER 표 없음. deferred = R3 + R10 + R14 | 일치 |
| "not covered" 주장 (`04:244`, `06:102`) vs 현재 테스트의 check 이름 | 실제 `--remote` publish, edge 압축 / weak ETag | 현재 check 중 이를 반박하는 것 없음 | 여전히 사실 |
| 00 / 06 에 backtick 으로 적힌 source 경로 | — | 위 1건 말고는 모두 존재 | — |

결론: 최종 보고서의 **숫자는 이미 최종 코드와 맞았다.** 어긋난 것은 (a) 경로 오류 1건, (b) 1차 세션 수치가 안내 없이 남아 있던 1곳, (c) 시간 순서가 한눈에 보이지 않던 점, (d) 이번 통합 때문에 상태가 바뀐 문장들이다.

### 5.2 리뷰의 시간 순서 (삭제한 기록 없음)

| 순서 | 무엇 | 결과 |
|---|---|---|
| 1 | 1차 독립 리뷰 (1차 세션, `_session1/05-independent-review.md`) | **BLOCKER 1** · MAJOR 0 · MINOR 6 · NIT 4. B1 = 숫자가 아닌 `--concurrency` 가 빈 package 를 seal 하고 pointer 까지 바꾼다 |
| 2 | 후속 수정 (2차 세션) | B1 해결: CLI 가 양의 정수만 허용 (`platform/cli/site-publish.ts:70-72`), `publishSite` 가 거부 (`platform/publish/publish.ts:429-430`, pool `:315`), seal 전 방어 검사 `uploaded/verified === files.length` (`:484`), unit check "invalid concurrency (NaN / 0 / -1 / 1.5) → refused before any upload … (review B1)" |
| 3 | 2차 독립 리뷰 (최종 코드, 새 리뷰어, `08-independent-review.md`) | BLOCKER 0 · MAJOR 4 · MINOR 12 · NOTE 9. R1(1024 바이트 초과 key → 500), R2(immutable-path guard fail-open) 수정. R3 / R10 / R14 는 1.5.2 로 미룸 |
| 4 | 통합 트리 재검증 (2026-09-22, 이 문서) | 전 항목 PASS. B1 check 포함 `test:publish` 59 / 0 |

1차 리뷰의 finding 11건이 최종 코드에서 어떻게 됐는지도 추적했다 (2차 리뷰어는 1차 리뷰를 일부러 읽지 않았으므로, 두 리뷰를 잇는 기록이 없었다).

| 1차 finding | 최종 상태 | 근거 |
|---|---|---|
| B1 `--concurrency` NaN → 빈 package seal | **FIXED** | `site-publish.ts:72`, `publish.ts:315, 429-430, 484-486`, check "… (review B1)" `publish.test.ts:233` |
| m1 pointer PUT 성공 / GET 실패를 "untouched" 로 보고 | **FIXED** | `publish.ts:536-543`, check "injected pointer corruption" |
| m2 동시 publish 의 pointer read-modify-write 경쟁 | 열림 (수용·문서화) | `publish.ts:500-509`; `--expect-live` 로 완화. = `05` 항목 7 |
| m3 sealed-skip 이 object 존재를 확인하지 않음 | **FIXED** | `publish.ts:452-467`, check "G4 … (review R7)" |
| m4 video `Range` 미지원 | 열림 (publish 시 경고) | `publish.ts:274-275`. = `05` 항목 6 |
| m5 연락 수단 없는 `/contact` 색인 가능 | 열림 (1.5.2) | 2차 리뷰 R10. = `05` 항목 2 |
| m6 Worker 가 seal 을 확인하지 않고 pointer 를 신뢰 | 문서로 해결 (계약을 정확히 다시 씀) | `workers/recon-runtime/src/contract.ts:9-11`. = `05` 항목 8 |
| n1 보고서의 backslash → 400 서술 오류 | **FIXED** (문서 정정) | `05-recon-runtime-design.md:87-88` |
| n2 끝에 점이 붙은 host → 404 | **FIXED** | `index.ts:120-123`, check "P11 trailing-dot host…" |
| n3 publish-surface fingerprint 가 `platform/publish/` 전체를 제외 | 열림 | `platform/test/publish-surface.ts:6-8`. `05` 추가 항목 9 |
| n4 `--bucket` / `--persist-to` / `--expect-package` 미검증 | 부분 해결 | bucket `:69`, expect-package `:64` 검증됨. `--persist-to` 는 그대로 (`:77`). `05` 추가 항목 10 |

11건 중 해결 5 · 문서로 해결 1 · 부분 해결 1 · 알고 남겨 둔 것 4 (m2, m4, m5, n3 — 모두 MINOR / NIT). **열려 있는 BLOCKER / MAJOR 는 없다.**

### 5.3 실제로 고친 곳 (전부 "날짜가 붙은 추가"이고, 기존 서술은 지우지 않았다)

| 파일 | 변경 |
|---|---|
| `00-summary.md` | 결과 줄 아래 안내 1문단 + 맨 끝에 **§13 Addendum** (시간 순서 표, 재측정 표, 상태가 바뀐 문장 표). §1–§12 본문은 그대로 |
| `01-151-validation.md` | STATUS 줄 아래 "Timeline" 안내 1문단 (272/3 → 275/0 → 2026-09-22 재검증). 1차 세션 본문 그대로 |
| `06-local-validation.md` | 표 4행의 script 경로 정정 + 정정 사실을 적은 1문단 |
| `08-independent-review.md` | R12 행 끝에 "2026-09-22: applied …" 한 구절 |
| `09-git-checkpoint.md` | 제목 아래 "Status update, 2026-09-22" 1문단. 감사 본문 그대로 |
| `proof/local-e2e.json` | e2e 가 스스로 다시 씀 (timestamp 와 ms 만 다름) |

```
REPORT_NUMBERS_RECONCILED = YES
```

## 6. 통합이 Track B 코드를 바꾸지 않았다는 확인

검증이 모두 끝난 뒤 TRACK-B 매니페스트를 다시 만들어 통합 전 매니페스트(7,440 파일)와 대조했다.

| | 파일 |
|---|---|
| 추가 | `AUTHORITATIVE_WORKTREE.md`, `data/.gitkeep`, `docs/reports/integration/{01,04,05,06}-*.md`, `docs/result/foundation-consolidation/*` |
| 변경 | `.gitignore`, `docs/reports/integration/02-*.md`, `docs/reports/integration/03-*.json`, `docs/result/static-deployment-foundation/proof/local-e2e.json` |
| 삭제 | 없음 |

(이 대조 뒤에 §5 의 보고서 보정, 이 디렉터리의 보고서 작성, 독립 리뷰 반영(`.gitignore` 블록 이동, `CLAUDE.md` 2줄, `docs/result/README.md` 2행)이 이어졌다. 어느 것도 코드나 data 가 아니다. 독립 리뷰어도 따로 확인했다: `find platform src scripts workers templates data fixtures themes -newermt '2026-09-22 00:00'` → 0 파일.)

`proof/local-e2e.json` 은 e2e 테스트가 실행할 때마다 다시 쓰는 파일이다. 이전 실행본과의 차이는 `startedAt` 과 단계별 `ms` 9줄뿐이고, 검사 목록과 결과는 같다.

`platform/**`, `workers/**`, `templates/**`, `scripts/**`, `src/**`, `package.json`, `pnpm-lock.yaml`, `data/**`(`.gitkeep` 제외): **변경 0.**

## 7. 검증하지 않은 것

- 실제 Cloudflare (bucket, Worker 배포, hostname, edge 압축 / ETag 동작) — 금지 범위.
- root 의 옛 smoke suite 들 (`scripts/smoke-*.ts`, Tasks 17–29 의 36 suite). 이번 통합은 `src/**`, `scripts/**` 를 한 바이트도 바꾸지 않았고 두 트리에서 동일하므로 다시 돌리지 않았다. root typecheck 만 확인했다.
- 1.5.1 이전 release 용 browser smoke (ia150, predemo2, step6, polish). 같은 이유.
