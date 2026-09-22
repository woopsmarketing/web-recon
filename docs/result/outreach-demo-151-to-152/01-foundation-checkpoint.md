# 01 — Foundation checkpoint commit (2026-09-22)

**결과: `14c49a6a95e3909350347d8789f985add621d29f` — `checkpoint: consolidate web-recon foundation`.** push 하지 않았다.

## 1. 작업 전 확인

| 항목 | 값 |
|---|---|
| `pwd` | `/Users/woops/projects/web-recon-track-b` (= `AUTHORITATIVE_WORKTREE.md` 의 경로) |
| `git rev-parse HEAD` | `6c2e723601a0d76431c96a48bbdb4726c02063e7` |
| `git branch --show-current` | `track-b/static-deployment-foundation` |
| `git status --porcelain` | 534 항목 (staged 0) |
| 다른 세션 | 실행 중인 Claude 세션 4개의 cwd: `boost-chat`, `3D-modeling`, `boostweb`, `web-recon`(= 이 오케스트레이터). track-b 에서 작업 중인 세션 없음. track-b 안에서 03:00 이후 바뀐 파일은 이 작업이 저장한 `_prompt.md` 하나뿐 |

branch 는 요구사항에 지정이 없어 그대로 두었다 (이름 변경 / `main` 이동은 여전히 사람 결정 H1).

## 2. stage 한 것 (명시적 경로, `git add .` 미사용)

```
git add -- src scripts platform workers templates themes fixtures \
  package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.json docs \
  data/.gitkeep data/sites data/site-builds data/template-releases \
  .gitignore CLAUDE.md AUTHORITATIVE_WORKTREE.md README.md ROADMAP.md .env.example \
  ':(exclude)docs/result/outreach-demo-151-to-152'
```

| 항목 | 값 |
|---|---|
| staged 경로 | **4,815** (추가 4,697 · 수정 118) |
| `git diff --cached --stat` 합계 | 4,815 files changed, 673,375 insertions(+), 1,298 deletions(-) |
| staged 파일 크기 합 | 90,685,737 B (86.5 MiB). 1 MiB 넘는 파일 **0개**. 최대 717,461 B (`data/sites/fixture-large/content/projects.json`) |
| 영역별 | `data/site-builds` 2,730 · `docs/result` 938 · `data/template-releases` 542 · `src` 232 · `data/sites` 197 · `scripts` 53 · `platform` 50 · `templates` 46 · `docs/reports` 7 · `workers` 5 · `fixtures` 3 · `docs/{architecture 2, status 1, info 1, README}` · 루트 파일 7 |
| 확장자 | txt 1,815 (site package 의 Next RSC payload) · ts 580 · html 458 · json 423 · md 364 · svg 322 · log 260 · tsx 249 · jpg 153 · js 124 … — **png / mp4 / webm 0** |

제외 확인 (stage 0):

| 제외 대상 | 방법 | 결과 |
|---|---|---|
| `references/boost-interior/generated-approved/` (47 MB) · `project-01-white-34p/` (33 MB) | pathspec 에 넣지 않음 (결정 B, C) | 0 staged, 디스크에 보관 |
| `references/**/generated-candidates/` (57 MB) | `.gitignore` | 0 |
| raw crawl, `data/tmp`, `tmp/`, `node_modules/`, `.env`, `.claude/`, `.wrangler/` | `.gitignore` (`data/*` 블록, 일반 규칙) | 0 |
| `docs/result/**` 의 proof 이미지 / 영상 | `.gitignore` | 0 |
| 이번 작업 보고서 폴더 | pathspec exclude | 0 (두 번째 commit 에 들어감) |

`data/site-builds/` 는 결정 D 대로 현재 상태 전부(8 package: site 4개 × current + previous)를 포함했다.

## 3. 비밀값 검사 (staged 4,815 파일 전체, `grep -a`)

| 검사 | 결과 |
|---|---|
| private key 블록, AWS `AKIA…`, `sk-ant-…`, `sk-…`, Firecrawl `fc-…`, GitHub `gh?_…`, Slack `xox?-`, Google `AIza…`, fal `uuid:hex`, Stripe `?k_live_`, JWT, `Bearer …` | 전부 **0** |
| `CLOUDFLARE_API_TOKEN` / `CF_API_TOKEN` / `CLOUDFLARE_ACCOUNT_ID` / `R2_*` / `AWS_SECRET_ACCESS_KEY` / `FAL_KEY` / `FIRECRAWL_API_KEY` 에 16자 이상 값 대입 | **0** |
| `api_key` / `secret` / `password` / `access_token` 에 20자 이상 문자열 대입 | **0** |
| `/Users/woops/projects/web-recon/.env` 의 실제 값 2개(`FIRECRAWL_API_KEY` 35자, `FAL_KEY` 69자) 그대로 포함 — 값은 출력하지 않고 포함 여부만 | **0 파일** |
| Cloudflare `account_id` + 32자 hex | **0** |
| 비밀 파일 이름 (`.env*`, `.dev.vars`, `*.pem`, `*.key`, `id_rsa`, `*credential*`, `*secret*`) | **0** |
| `workers/recon-runtime/wrangler.jsonc` | `workers_dev: false`, route 는 주석 상태, binding `SITES → boost-sites-artifacts` 하나 |

검사 도중 두 번 다시 돌렸다. 기록해 둔다.
- private key 패턴을 `scan -- '-----BEGIN…'` 로 넘겨 `--` 가 패턴으로 쓰였다 (엉뚱한 파일 5개 매칭). `grep -e` 로 다시 돌려 0.
- `.env` 에 마지막 줄바꿈이 없어 `while read` 가 `FAL_KEY` 줄을 건너뛰었다. 두 키를 모두 읽도록 고쳐 다시 돌려 둘 다 0.

## 4. commit

```
14c49a6a95e3909350347d8789f985add621d29f  checkpoint: consolidate web-recon foundation
parent 6c2e723 (0827 morning)
branch track-b/static-deployment-foundation
```

commit 뒤 `git status`: `?? docs/result/outreach-demo-151-to-152/`, `?? references/` 두 줄뿐.

## 5. 남은 사람 결정 (이번에 바꾸지 않음)

- H1 branch 이름 / `main` 으로 옮길지.
- H4 폴더 교체 (`web-recon` ↔ `web-recon-track-b`) — 권고였던 "checkpoint commit 뒤" 조건이 이제 충족됐다.
- H7 `data/site-builds` 보존 정책 — 이번 작업은 결정 D 에 따라 아무것도 지우지 않았다 (`02` §5 참고).
- `references/` 두 폴더는 git 밖이다. 그런데 `platform/test/step6.test.ts` K2/K3 가 그 폴더를 읽는다. 새로 clone 한 트리에서는 그 두 검사가 ENOENT 로 실패한다 (devroot 에서 실제로 확인). 로컬 canonical 트리에서는 통과한다 (`04`).
