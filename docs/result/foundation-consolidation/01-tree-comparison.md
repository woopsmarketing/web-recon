# 01 — 두 작업 폴더 비교 (2026-09-22)

비교 대상:

| | 기본 작업 폴더 (MAIN) | Track B 작업 폴더 (TRACK-B) |
|---|---|---|
| 경로 | `/Users/woops/projects/web-recon` | `/Users/woops/projects/web-recon-track-b` |
| branch | `main` | `track-b/static-deployment-foundation` |
| `git rev-parse HEAD` | `6c2e723601a0d76431c96a48bbdb4726c02063e7` | `6c2e723601a0d76431c96a48bbdb4726c02063e7` |
| `git status --porcelain` 항목 수 (통합 전) | 356 | 356 |
| `git worktree list` | 자기 자신 1개 | 자기 자신 1개 (서로 독립된 `.git`, APFS 복사본) |

두 폴더는 같은 commit 에서 출발했고, 두 곳 모두 거의 모든 작업이 **uncommitted** 상태다. 따라서 git 으로는 비교가 안 되고, 파일 바이트를 직접 비교했다.

## 1. 방법

- 두 트리의 모든 파일에 대해 `shasum -a 256` 매니페스트를 만들어 경로 단위로 대조했다.
- 제외: `.git/`, `node_modules/`(모든 깊이), `.next/`, `.wrangler/`, `.claude/`, 최상위 `tmp/`, 그리고 `data/` 아래 raw crawl 디렉터리.
- `data/` 에서 포함한 것: `data/sites/`, `data/site-builds/`, `data/template-releases/`, `data/tmp/`, `data/` 바로 아래 파일.
- symlink: 두 트리 모두 0개 (`node_modules` 밖).
- 수정 시간(mtime)은 **선택 근거로 쓰지 않았다.** 아래 표의 시간은 "어느 세션이 만들었는가"를 설명하는 보조 증거일 뿐이고, 선택은 전부 §3 소유 영역 규칙으로 했다.

## 2. 결과 요약

| 분류 | 파일 수 |
|---|---|
| 두 트리에서 바이트 동일 | **7,409** |
| MAIN 에만 있음 | 13 |
| TRACK-B 에만 있음 | 18 |
| 양쪽에 있고 내용이 다름 | 13 |
| **소유 영역 밖에서 내용이 다른 파일 (UNKNOWN_CONFLICT)** | **0** |

`src/`, `scripts/`, `templates/`, `fixtures/`, `themes/`, `package.json`, `pnpm-lock.yaml`, `pnpm-workspace.yaml`, `tsconfig.json`, `CLAUDE.md`, `.gitignore`(통합 전), `data/sites/**`, `data/site-builds/**`, `data/template-releases/**`, `references/**`, 그리고 `docs/result/` 의 나머지 96개 디렉터리는 **전부 동일**하다. 즉 interior-01 1.5.1 release 와 demo 1.5.1 build 는 두 트리에서 같은 바이트다 (1.5.1 은 Track B 1차 세션이 MAIN 에서 만들었고, 복사본이 그것을 그대로 물려받았다).

## 3. 차이 44건의 분류

### 3.1 Track A 소유 — `docs/reports/integration/**` (6건)

| 파일 | MAIN | TRACK-B (통합 전) | 판정 |
|---|---|---|---|
| `00-requirement.txt` | 45,053 B | 동일 | 동일 |
| `01-web-recon-producer-review-v0.md` | 있음 (09-21 21:20) | 없음 | MAIN 사용 |
| `02-integration-contract-v0-candidate.md` | 42,411 B (09-21 21:16) | 34,882 B (09-21 20:48) | MAIN 사용 |
| `03-integration-contract-v0-candidate.json` | 26,135 B (09-21 21:17) | 24,305 B (09-21 20:50) | MAIN 사용 |
| `04-boostchat-requirement-disposition.md` | 있음 | 없음 | MAIN 사용 |
| `05-integration-contract-v0-independent-review.md` | 있음 | 없음 | MAIN 사용 |
| `06-implementation-phase-plan.md` | 있음 | 없음 | MAIN 사용 |

왜 다른가: TRACK-B 복사본은 09-21 20:55 에 만들어졌다. 그 시점에 Track A 는 아직 작업 중이어서 `02`/`03` 의 **중간 초안**(20:48/20:50)만 복사됐다. Track B 세션은 이 디렉터리를 한 번도 쓰지 않았다 (TRACK-B 쪽 두 파일의 mtime 이 복사 시점보다 앞선다. `git diff --no-index --stat`: 6 files, +1,716 / −483). Track A 최종본은 MAIN 에만 있었다.

### 3.2 Track B 소유 — 코드 (9건, 전부 "양쪽에 있고 다름")

| 파일 | MAIN (1차 세션 초안) | TRACK-B (최종) | `git diff --no-index --shortstat` |
|---|---|---|---|
| `platform/cli/site-publish.ts` | 127줄, 18:17 | 175줄, 21:40 | +90 / −42 |
| `platform/publish/publish.ts` | 384줄, 18:17 | 576줄, 21:40 | +208 / −16 |
| `platform/publish/store.ts` | 56줄, 17:30 | 56줄, 21:01 | +1 / −1 |
| `platform/publish/wrangler-store.ts` | 105줄, 17:30 | 111줄, 21:40 | +7 / −1 |
| `platform/test/publish.test.ts` | 407줄, 18:17 | 1,082줄, 21:58 | +681 / −6 |
| `platform/test/publish-e2e.test.ts` | 361줄, 17:57 | 731줄, 22:03 | +419 / −49 |
| `workers/recon-runtime/src/contract.ts` | 76줄, 17:27 | 79줄, 20:59 | +5 / −2 |
| `workers/recon-runtime/src/index.ts` | 132줄, 17:27 | 208줄, 21:40 | +102 / −26 |
| `workers/recon-runtime/wrangler.jsonc` | 33줄, 17:28 | 43줄, 21:42 | +17 / −7 |

왜 다른가: MAIN 에 있는 것은 Track B **1차 세션의 초안**이고, TRACK-B 에 있는 것은 그 초안에서 출발해 독립 리뷰(R1, R2 등)까지 반영한 **최종본**이다. 같은 영역의 나머지 파일(`platform/publish/media.ts`, `workers/recon-runtime/src/paths.ts`, `workers/recon-runtime/tsconfig.json`, `platform/test/publish-surface.ts`, `platform/test/canonical-151.ts`, `platform/test/ia151.test.ts`, `scripts/template-platform-ia151-smoke.ts`)은 두 트리에서 동일하다.

### 3.3 Track B 소유 — 보고서 `docs/result/static-deployment-foundation/**` (26건)

- 다름 2건: `01-151-validation.md` (109줄 → 150줄), `proof/local-e2e.json` (328줄 → 650줄).
- MAIN 에만 6건: `02-publish-contract.md`, `03-runtime-contract.md`, `04-live-deploy-plan.md`, `05-independent-review.md`, `git-checkpoint.md`, `requirement.txt` — 1차 세션 보고서.
  **이 6개는 TRACK-B 의 `_session1/` 아래에 sha256 이 동일한 사본으로 전부 보존돼 있다** (6/6 일치 확인). 잃는 것이 없다.
- TRACK-B 에만 18건: `00-requirement-track-b-v2.txt`(= `prompt2` 와 sha256 동일), `00-summary.md`, `02`–`09` 최종 보고서 8개, `_session1/` 6개, 그리고 아래 2개.
- `workers/recon-runtime/tmp/trackb-logs/bundle-pilot/index.js(.map)` — `wrangler deploy --dry-run --outdir` 가 남긴 번들 산출물. `.gitignore` 의 `tmp/` 규칙으로 무시된다. 그대로 뒀다.

### 3.4 공통 / 로컬 전용 (3건, MAIN 에만 있음)

| 파일 | 성격 | 처리 |
|---|---|---|
| `data/.gitkeep` (0 B) | 공통 기존 파일. 복사본을 만들 때 빠졌다 | TRACK-B 로 복사 (`.gitignore` 의 `!data/.gitkeep` 대상) |
| `.env` | 로컬 비밀값 (`FAL_KEY`, `FIRECRAWL_API_KEY`). git 무시 대상 | **복사하지 않음.** 내용도 출력하지 않았다. 사람 결정 항목 (`03` §5) |
| `prompt` | 이번 작업 지시문. git 무시 대상 (`/prompt`) | 복사하지 않음 |

### 3.5 비교 범위 밖 (의도적으로 MAIN 에만 남는 것)

| 위치 | 크기 | 비고 |
|---|---|---|
| `data/<도메인>/` raw crawl 19개, `data/.registry`, `data/.smoke-*`, `data/page-state-evidence` | 수십~수백 GB | 공식 작업본에 포함하지 않는다 (요구사항 §1) |
| `tmp/` | 5.5 GB | 임시 파일. `tmp/aco` 포함 |
| `.claude/` | — | 머신 로컬 설정 |

## 4. 결론

- 소유 영역 규칙만으로 44건이 모두 설명된다. 증거 없이 골라야 하는 파일은 없다. **UNKNOWN_CONFLICTS = 0.**
- TRACK-B 를 기준으로 삼을 때 가져와야 하는 것은 **Track A 문서 6개 + `data/.gitkeep`** 뿐이다.
- MAIN 을 기준으로 삼았다면 Track B 코드 9개 + 보고서 20개를 덮어써야 했고, 요구사항 §0 의 "예전 초안이 최종 코드를 덮어쓰면 안 된다" 위험이 그쪽에 있다. TRACK-B 기준이 더 안전하다.
