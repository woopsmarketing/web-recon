# 03 — `.gitignore` 정리와 Git 체크포인트 준비 (2026-09-22)

대상: `/Users/woops/projects/web-recon-track-b/.gitignore`. **stage / commit / push 는 하지 않았다.** `git status --porcelain` 에서 staged 항목 수는 작업 전후 모두 0 이다.

## 1. 기존 감사의 재검증

기존 감사 = `docs/result/static-deployment-foundation/09-git-checkpoint.md` §3 (규칙 4개 제안, 적용은 안 됨). 현재 트리에서 다시 확인했다.

| 감사의 주장 | 현재 트리에서 확인 | 결과 |
|---|---|---|
| `data/` 규칙이 canonical 데이터 3종을 통째로 가린다 | `git check-ignore -v` → `.gitignore:14:data/` | 맞음 |
| `data/` 를 `data/*` 로 바꿔야 하위 re-include 가 동작한다 | git 은 제외된 디렉터리의 자식을 다시 포함할 수 없다 | 맞음. 그대로 채택 |
| `docs/result` 이미지 2,135개 / 2.2 GB | PNG 2,135개, 2,278.7 MB. JPG/JPEG 는 현재 0개 | 맞음. 규칙 3개 모두 유지 (앞으로 생길 JPG 대비) |
| `.wrangler/` 는 지금 `tmp/` 규칙에 우연히 걸려 있을 뿐이다 | `workers/recon-runtime/.wrangler/` 존재, 전용 규칙 없음 | 맞음. 채택 (무시만 추가하는 보호 규칙) |
| `docs/result` 의 `.log` 260개가 `*.log` / `logs/` 에 가려진다 | `.log` 260개, 합계 1.6 MB (디스크 점유 2.1 MB), `logs/` 디렉터리 2개 | 맞음. 채택. 감사안의 `!docs/result/**/**/logs/` 는 `**` 가 중복이라 `!docs/result/**/logs/` 로 정리 |
| canonical 데이터 안에 다른 무시 규칙에 걸리는 이름이 있는가 (감사에 없던 확인) | `data/sites`, `data/site-builds`, `data/template-releases` 안에서 `.gitignore`, `*.log`, `logs`, `dist`, `tmp`, `*.tmp`, `.env*`, `.cache`, `.DS_Store`, `*.tsbuildinfo`, `node_modules`, `.wrangler` 검색 → **0건** | 가려지는 canonical 파일 없음 |
| 중첩 `.gitignore` | 루트의 1개뿐 | — |

## 2. 적용한 변경

독립 리뷰(`06`)의 m1, m2 를 반영한 **최종 형태**다. 처음 적용한 형태는 `data/*` 블록이 파일 중간에 있어서, canonical 트리 안에 `dist/`, `logs/`, `*.log`, `tmp/`, `*.tmp` 같은 이름이 생기면 위쪽의 일반 규칙이 그 파일을 조용히 가릴 수 있었다 (오늘은 해당 파일 0개라 결과는 같았다). package 는 모든 바이트의 해시로 식별되므로 git 이 그중 하나를 빠뜨리면 안 된다. 그래서 블록을 **파일 맨 끝**으로 옮기고 `/**` re-include 를 추가했다.

```gitignore
# 제거
# runtime data (crawl output, etc.)
data/

# 추가 (1) canonical 데이터만 다시 포함 — 파일의 맨 마지막 블록
data/*
!data/.gitkeep
!data/sites/
!data/site-builds/
!data/template-releases/
!data/sites/**
!data/site-builds/**
!data/template-releases/**
data/**/.env
data/**/.env.*
data/**/.DS_Store
data/**/node_modules/

# 추가 (2) 보고서가 인용하는 log 증거는 추적 가능하게
!docs/result/**/logs/
!docs/result/**/*.log

# 추가 (3) proof screenshot 제외
docs/result/**/*.png
docs/result/**/*.jpg
docs/result/**/*.jpeg
docs/result/**/*.webp
docs/result/**/*.gif
docs/result/**/*.webm
docs/result/**/*.mp4

# 추가 (4) 탈락한 AI 이미지 후보 제외
references/**/generated-candidates/

# 추가 (5) wrangler 로컬 상태
.wrangler/
```

(3) 의 `.webp/.gif/.webm/.mp4` 는 리뷰 m2 반영이다. 오늘 해당 파일은 0개라 효과는 없고, 앞으로 생길 증거 이미지·영상에 대비한 것이다.

(2) 와 (5) 는 요구사항의 "예상 개념"에는 없고 기존 감사가 제안한 것이다. (5) 는 무시만 늘린다. (2) 는 추적 대상을 1.6 MB 늘린다. 이 log 들은 §4 비밀값 검사 범위에 포함됐고 결과는 깨끗하다. 원하지 않으면 두 줄만 지우면 된다.

## 3. 검증

### 3.1 `git check-ignore -v --no-index`

무시돼야 하는 경로 — 20/20 무시됨:

| 경로 | 걸린 규칙 |
|---|---|
| `data/stripe.com/runs/x/page.html`, `data/apartmentary.com/a.json`, `data/.registry/index.json`, `data/.smoke-release-52098/x` | `data/*` |
| `data/page-state-evidence/x.json` | `data/*` (기존과 같은 상태. §5) |
| `data/tmp/x.mjs`, `tmp/x`, `workers/recon-runtime/tmp/trackb-logs/bundle-pilot/index.js` | `tmp/` |
| `docs/result/28.6/final-human-review/a.png`, `…/z.jpg`, `…/b.jpeg` | `docs/result/**/*.png` · `.jpg` · `.jpeg` |
| `references/boost-interior/generated-candidates/a.png` | `references/**/generated-candidates/` |
| `workers/recon-runtime/.wrangler/state/x.sqlite` | `.wrangler/` |
| `.env`, `.env.local` | `.env`, `.env.*` |
| `node_modules/x`, `.claude/settings.json`, `prompt`, `prompt2`, `scripts/foo.log` | 기존 규칙 |

보여야 하는 경로 — 12/12 보임: `data/.gitkeep`, `data/sites/boost-interior-demo/site.json`, `data/site-builds/boost-interior-demo/current.json`, `data/site-builds/…/packages/aa71b829…/build-record.json`, `data/template-releases/interior-01/interior-01-1.5.1-6bbdd07eb9bf/release.json`, `docs/reports/integration/02-…md`, `docs/result/static-deployment-foundation/proof-151/logs/smoke-ia151.log`, `docs/result/handoffs/25-stripe-canary/release-plan.log`, `references/boost-interior/generated-approved`, `.env.example`, `workers/recon-runtime/wrangler.jsonc`, `platform/publish/publish.ts`.

### 3.1b 실제 파일로 한 실험 (scratch git repo, 프로젝트 밖)

`check-ignore` 는 가상 경로에 대한 판정이므로, 최종 `.gitignore` 를 빈 git repo 에 복사하고 30개의 실제 파일을 만들어 `git add -n .` 을 돌렸다.

| 들어감 (15) | 빠짐 (15) |
|---|---|
| `data/.gitkeep`, `data/sites/demo/{site.json, build.log, logs/a.json}`, `data/site-builds/demo/packages/h/site/{index.html, dist/app.js, tmp/a.html}`, `data/template-releases/t/r/files/a.tmp`, `docs/result/t/{00.md, x.log, logs/run.log}`, `references/b/generated-approved/a.jpg`, `src/a.ts`, `.env.example`, `.gitignore` | `data/stripe.com/**` (그 안의 `dist/` 포함), `data/.registry/**`, `data/page-state-evidence/**`, `data/tmp/**`, `data/sites/demo/.env`, `data/sites/demo/.DS_Store`, `data/site-builds/demo/node_modules/**`, `docs/result/t/a.png`, `docs/result/t/a.webp`, `references/b/generated-candidates/**`, `workers/w/.wrangler/**`, `tmp/**`, `scripts/foo.log`, `.env`, `prompt` |

의도와 정확히 같다.

### 3.2 `git add -n .` (dry-run, 아무것도 stage 하지 않음)

4,873 경로, 합계 **166.9 MiB** (= 175.1 MB). 오류 0. 이 절과 §5 의 "MB" 는 모두 MiB(2^20 바이트)다.

| 영역 | 파일 | 크기 | 디스크의 실제 파일 수와 비교 |
|---|---|---|---|
| `data/sites` | 197 | 6.1 MB | 197 — **전부 보임** |
| `data/site-builds` | 2,730 | 52.7 MB | 2,730 — **전부 보임** |
| `data/template-releases` | 542 | 2.4 MB | 542 — **전부 보임** |
| `data/.gitkeep` | 1 | 0 | — |
| `data/` 의 그 밖 경로 | **0** | — | raw crawl 제외 확인 |
| `docs/result` | 931 | 15.6 MB | 그중 `.png/.jpg/.jpeg` **0개** |
| `docs/reports` | 7 | 0.2 MB | Track A 7개 |
| `references/boost-interior/generated-approved` | 52 | 47.3 MB | 사람 결정 (§5) |
| `references/boost-interior/project-01-white-34p` | 14 | 33.2 MB | 사람 결정 (§5) |
| `references/**/generated-candidates` | **0** | — | 제외 확인 (디스크에는 57 MB) |
| `src` 232 · `scripts` 53 · `platform` 50 · `templates` 46 · `workers` 5 · `fixtures` 3 · 루트 파일 5 · `docs/{README,architecture,info,status}` 5 | 399 | 9.3 MB | — |

위 숫자는 이 보고서들을 쓰기 전에 잰 것이다. `.gitignore` 최종 형태로 바꾼 뒤 다시 잰 값도 canonical 197 / 2,730 / 542 로 같다. 작업을 마친 뒤의 값은 **4,881 경로** (+8 = `docs/result/foundation-consolidation/` 7개 + `AUTHORITATIVE_WORKTREE.md`), `docs/result` 이미지 0개, staged 0개.

가장 큰 단일 파일은 `references/boost-interior/project-01-white-34p/kitchen-04.png` 3.0 MB. `references/` 를 빼면 체크포인트는 약 **86 MB** 다.

```
GITIGNORE_CANONICAL_DATA_VISIBLE = YES  (197 + 2,730 + 542 = 3,469 / 3,469)
GITIGNORE_RAW_CAPTURE_EXCLUDED   = YES
GITIGNORE_SCREENSHOTS_EXCLUDED   = YES  (2,135 PNG, 2.28 GB)
```

주의: TRACK-B 에는 raw crawl 디렉터리가 실제로 존재하지 않는다 (복사본에 넣지 않았다). 그래서 "raw 가 무시된다"는 가상 경로에 대한 `check-ignore --no-index` 와, `git add -n` 목록에 `data/` 의 비-canonical 경로가 0개라는 것으로 확인했다. 누군가 이 폴더에서 crawl 을 돌려 `data/<도메인>/` 이 생겨도 `data/*` 가 막는다.

## 4. 비밀값 검사

범위: `git ls-files` ∪ `git add -n` 목록 = **5,330 파일** (체크포인트에 들어갈 수 있는 모든 파일).

| 검사 | 결과 |
|---|---|
| MAIN 의 실제 `.env` 값(`FAL_KEY`, `FIRECRAWL_API_KEY`)이 그대로 들어 있는 파일 — 값은 출력하지 않고 포함 여부만 확인 | **0** |
| private key 블록, AWS `AKIA…`, `sk-ant-`, `sk-…`, Firecrawl `fc-…`, GitHub `gh?_…`, Slack `xox?-`, Google `AIza…`, fal `uuid:hex`, Stripe `?k_live_`, JWT, `Bearer …` | **0** |
| `CLOUDFLARE_API_TOKEN` / `CF_API_TOKEN` / `R2_ACCESS_KEY_ID` / `R2_SECRET_ACCESS_KEY` / `AWS_SECRET_ACCESS_KEY` 에 값이 대입된 곳 | **0** |
| `api_key` / `secret` / `password` / `token` 에 20자 이상 문자열 대입 | **0** |
| 파일 이름: `.env*`(`.env.example` 제외), `.dev.vars`, `*.pem`, `*.key`, `*.p12`, `id_rsa*`, `*credential*`, `*secret*` | **0** |
| `workers/recon-runtime/wrangler.jsonc` | `account_id` 없음, route/custom domain 은 주석 상태, `workers_dev: false`, binding `SITES → boost-sites-artifacts` 하나 |
| `.env` | TRACK-B 에 없음. MAIN 에서는 `.gitignore:2` 로 무시 |
| `tmp/`, `node_modules/` | 무시됨 |

```
SECRET_SCAN_PASS = YES
```

## 5. 사람 결정 항목 (자동으로 추가하지도, 삭제하지도 않았다)

| 항목 | 사실 | 현재 상태 | 권고 |
|---|---|---|---|
| `data/page-state-evidence/` | MAIN 에만 있음. 10 MB, 18 파일. `src/cli-observe*.ts`, `src/observer/types.ts`, `src/responsive-qa/**` 가 경로를 참조한다 (관측 단계의 산출물 위치) | `data/*` 로 무시됨 = 작업 전과 같음. TRACK-B 로 복사하지 않음 | raw capture 에 가까운 증거다. 추적하려면 `!data/page-state-evidence/` 한 줄 + MAIN 에서 복사. 지금은 그대로 두기를 권한다 |
| `references/boost-interior/generated-approved/` | 47 MB, 52 파일. 승인된 AI 이미지 원본. demo 가 실제로 쓰는 최적화본은 `data/sites/boost-interior-demo/assets/` (53 파일)에 따로 있다 | 무시 규칙 없음 → `git add .` 하면 들어간다 | `git add .` 를 쓰지 말고 §6 처럼 경로를 지정해 stage. 포함 여부는 출처 보존을 원하는지에 달렸다 |
| `references/boost-interior/project-01-white-34p/` | 33 MB, 14 파일. 디자인 레퍼런스 | 위와 같음 | 위와 같음 |
| `references/boost-interior/generated-candidates/` | 57 MB. 탈락 후보 | 이번에 무시 규칙 추가. **파일은 삭제하지 않음** | git 밖에서 보관 또는 삭제 |
| `.env` | MAIN 에만 있음 | 복사하지 않음 | TRACK-B 에서 crawl / fal 기능을 쓸 때 직접 복사: `cp ../web-recon/.env .` |
| MAIN 의 raw crawl + `tmp/` (5.5 GB + 수십 GB) | 공식 작업본 밖 | 그대로 둠 | MAIN 을 "raw 아카이브"로 유지할지는 별도 결정. **그 결정 전에는 MAIN 을 지우면 안 된다** (`data/.registry`, raw crawl, `tmp/aco`, `.env` 가 거기에만 있다) |
| `data/site-builds/` 를 git 으로 추적하는 것의 비용 | 오늘 2,730 파일 / 52.7 MiB. build 하나가 약 7 MiB 이고 git history 에 영구히 남는다 | 요구사항대로 추적 가능하게 함 | 첫 commit 전에 보존 정책을 정한다 (예: site 마다 current + previous 만 commit) |

## 6. 권장 체크포인트 (실행하지 않음)

`09-git-checkpoint.md` §4 의 commit 경계는 여전히 유효하다. 이번 통합으로 달라지는 점:

1. `.gitignore` 는 이미 적용됐다. 첫 commit 으로 단독 분리하기를 권한다.
2. `docs/reports/integration/` 7개가 추가됐다 → Track A 문서 commit 하나.
3. `docs/result/foundation-consolidation/` + `AUTHORITATIVE_WORKTREE.md` → 통합 보고서 commit 하나.
4. `references/boost-interior/{generated-approved,project-01-white-34p}` 는 §5 결정 전에는 stage 하지 않는다. `git add .` 대신 디렉터리를 지정한다.
5. branch: 현재 `track-b/static-deployment-foundation`. `main` 으로 옮길지(`git switch -c` 또는 fast-forward)는 commit 직전에 사람이 정한다. 두 폴더의 `.git` 은 서로 독립이고 HEAD 가 같으므로, 여기서 commit 한 뒤 MAIN 에서 fetch 하는 것도 가능하다.
