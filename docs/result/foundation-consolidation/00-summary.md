# 00 — WEB-RECON 기준 작업본 통합: 종합보고서 (2026-09-22)

**결과: 공식 최신 작업본은 `/Users/woops/projects/web-recon-track-b` 하나다.** Track B 최종 코드 위에 Track A 최종 계약 문서를 가져왔고, 그 한 폴더에서 전체 로컬 검증을 다시 돌려 모두 통과했다. 새 기능은 만들지 않았다. commit, push, 배포는 하지 않았다.

**주의: 기본 폴더 `/Users/woops/projects/web-recon` 은 지우면 안 된다.** raw crawl, `data/.registry`, `data/page-state-evidence`, `tmp/aco`, `.env`, 그리고 Claude 프로젝트 메모리의 경로가 거기에 묶여 있다. 공식 작업본은 template platform · publish · runtime · 문서의 최신본이고, crawl / observer 를 실제로 돌리려면 아직 기본 폴더의 데이터가 필요하다 (H4).

| 보고서 | 내용 |
|---|---|
| [`01-tree-comparison.md`](01-tree-comparison.md) | 두 폴더의 sha256 대조, 차이 44건의 분류 |
| [`02-authoritative-source-map.md`](02-authoritative-source-map.md) | 영역별 권위 있는 출처, Track A 문서 해시, Track B 보존 확인 |
| [`03-gitignore-and-checkpoint.md`](03-gitignore-and-checkpoint.md) | `.gitignore` 재검증·적용·검증, 비밀값 검사, 사람 결정 항목, 체크포인트 권고 |
| [`04-final-local-verification.md`](04-final-local-verification.md) | 통합 후 전체 검증, 식별자 재계산, 보고서 숫자 정합성 |
| [`05-known-next-items.md`](05-known-next-items.md) | 알려진 8개 항목(+2)의 분류 (수정 없음) |
| [`06-independent-review.md`](06-independent-review.md) | fresh-context 독립 리뷰: BLOCKER 0 · MAJOR 1 · MINOR 4 · NOTE 4 와 처분 |

## 1. 무엇을 했나

1. **비교.** 두 폴더는 같은 commit(`6c2e723`)에서 출발했고 작업 대부분이 uncommitted 라 git 으로는 비교할 수 없다. sha256 매니페스트(MAIN 7,435 파일 · TRACK-B 7,440 파일; `node_modules`, `.git`, `tmp`, raw crawl 제외)를 만들어 대조했다: 동일 **7,409** · MAIN 전용 13 · TRACK-B 전용 18 · 내용 다름 13. 차이 44건은 **전부** Track A 소유 영역(`docs/reports/integration/**`), Track B 소유 영역(publish / runtime 코드와 그 보고서), 또는 로컬 전용 파일(`.env`, `prompt`, `data/.gitkeep`)이다. 소유 영역 밖에서 갈라진 파일은 없다.
2. **통합.** TRACK-B 를 기준으로 삼고 MAIN 에서 Track A 문서 6개(+이미 동일한 1개)와 `data/.gitkeep` 을 가져왔다. MAIN 에 남아 있던 Track B 1차 초안(코드 9개, 보고서 8개)은 **가져오지 않았다.** 그 보고서 6개는 TRACK-B 의 `_session1/` 에 sha256 동일 사본이 이미 있어서 잃는 기록도 없다.
3. **`.gitignore`.** 기존 감사(`static-deployment-foundation/09`)의 제안을 현재 트리에서 재검증한 뒤 적용했다. `git check-ignore` 32개 경로와 `git add -n` 으로 확인했다. 실제 stage 는 하지 않았다.
4. **검증.** 통합된 한 폴더에서 typecheck 3종, `test:platform`, `test:publish`, 1.5.1 browser smoke, clean-state e2e, dry-run 결정성, Worker bundle 을 다시 돌렸다. release / buildInputId / packageHash 는 디스크의 바이트로부터 다시 계산했다.
5. **보고서 정합성.** 독립 에이전트로 Track B 보고서 00–09 의 수치를 실측과 대조했다. 숫자는 이미 맞았고, 경로 오류 1건과 시간 순서 안내를 "날짜가 붙은 추가"로 보정했다. 1차 리뷰의 BLOCKER 1 → 수정 → 2차 리뷰 BLOCKER 0 → 재검증 PASS 의 순서를 명시했다. 과거 기록은 지우지 않았다.
6. **표지.** 두 폴더 루트에 `AUTHORITATIVE_WORKTREE.md` 를 두었다 (§4).
7. **독립 리뷰.** fresh-context 리뷰어가 직접 측정해 검토했다: BLOCKER 0 · MAJOR 1 · MINOR 4 · NOTE 4. MINOR 4건은 모두 반영했고(`.gitignore` 의 `data/` 블록을 맨 끝으로 옮겨 canonical 파일이 일반 규칙에 가려지지 않게 함, 이미지 확장자 추가, 결과 색인 2행, MiB 단위), MAJOR 1건(공식 작업본 폴더에 Claude 메모리가 없음)은 `CLAUDE.md` 포인터로 일부 해결하고 나머지는 H4 로 남겼다 (`06`).

## 2. 이번 작업이 바꾼 파일 (TRACK-B)

| 종류 | 파일 |
|---|---|
| Track A 에서 복사 | `docs/reports/integration/{01,02,03,04,05,06}-*` |
| 공통 파일 복사 | `data/.gitkeep` |
| 수정 | `.gitignore` |
| 날짜 붙은 보정 | `docs/result/static-deployment-foundation/{00-summary,01-151-validation,06-local-validation,08-independent-review,09-git-checkpoint}.md` |
| 테스트가 다시 씀 | `docs/result/static-deployment-foundation/proof/local-e2e.json` (timestamp 만) |
| 새로 작성 | `docs/result/foundation-consolidation/00–06`, `AUTHORITATIVE_WORKTREE.md` |
| 리뷰 반영 | `CLAUDE.md` (표지 파일을 가리키는 2줄), `docs/result/README.md` (색인 2행) |
| git 무시 영역 | `tmp/consolidation-logs/**` |

MAIN 에서 바뀐 것: 새 파일 `AUTHORITATIVE_WORKTREE.md` 하나. 그 밖에는 수정·삭제 0.

코드(`platform/**`, `workers/**`, `templates/**`, `src/**`, `scripts/**`), `package.json`, lockfile, `data/**` 의 기존 파일: **변경 0** (`04` §6 의 사후 매니페스트 대조).

## 3. 사람이 결정할 것

| # | 결정 | 메모 |
|---|---|---|
| H1 | 체크포인트 commit 실행과 branch 이름 (`track-b/…` 그대로 둘지, `main` 으로 옮길지) | `03` §6. 두 폴더의 `.git` 은 독립이고 HEAD 가 같다 |
| H2 | `references/boost-interior/generated-approved/` (47 MB), `project-01-white-34p/` (33 MB) 를 git 에 넣을지 | 넣지 않으면 체크포인트 약 86 MiB, 넣으면 약 167 MiB (175 MB). 무시 규칙이 없으므로 결정 전에는 `git add .` 를 쓰지 말고 경로를 지정한다 |
| H3 | `data/page-state-evidence/` (MAIN 에만, 10 MB) | 지금은 작업 전과 같이 무시됨 |
| H4 | MAIN 폴더의 앞날과 Claude 메모리 | 이번 작업은 MAIN 의 어떤 파일도 지우지 않았다. Claude 프로젝트 메모리(50개 파일)와 `.claude/` 설정은 MAIN 경로에만 묶여 있어서, TRACK-B 에서 직접 연 세션은 메모리 없이 시작한다 (`CLAUDE.md` → 표지 파일 안내만 있음). 선택지: (a) 지금처럼 세션은 MAIN 에서 열고 TRACK-B 에서 작업 — `MEMORY.md` 첫 줄이 안내한다. (b) 폴더 이름 교체: MAIN → `web-recon-archive`, TRACK-B → `web-recon`. 메모리 경로가 공식 작업본과 다시 일치한다. 보고서 안의 절대 경로와 표지 파일을 고쳐야 한다. (c) 메모리 디렉터리를 새 경로로 복사 또는 symlink. **권고: checkpoint commit 뒤에 (b)** |
| H5 | `.env` 를 TRACK-B 에 둘지 | crawl / fal 기능을 거기서 쓸 때만 필요 |
| H7 | `data/site-builds/` 의 git 보존 정책 | 추적하면 build 하나마다 약 7 MiB 가 history 에 영구히 남는다 (오늘 2,730 파일 / 52.7 MiB). 첫 commit 전에 "site 마다 current + previous 만" 같은 규칙을 정할지 결정 |
| H6 | `.gitignore` 의 docs/result log re-include 2줄 유지 여부 | 1.6 MB (260 파일). 기존 감사의 제안을 따랐다. 비밀값 검사 통과 |

## 4. "어느 폴더가 최신인가"를 한 곳에서 아는 방법

- 두 폴더 루트의 `AUTHORITATIVE_WORKTREE.md`. MAIN 쪽은 "이 폴더는 최신이 아니다"로 시작하고 공식 작업본 경로를 가리킨다.
- TRACK-B 의 `CLAUDE.md` 가 그 표지 파일을 먼저 읽으라고 안내한다 (TRACK-B 에서 연 세션용).
- Claude 프로젝트 메모리(`-Users-woops-projects-web-recon`)의 `MEMORY.md` 첫 줄에 같은 내용을 넣었다. MAIN 에서 세션을 열어도 가장 먼저 읽힌다.

## 5. 최종 보고 항목

```
AUTHORITATIVE_WORKTREE = /Users/woops/projects/web-recon-track-b
                         (branch track-b/static-deployment-foundation, base 6c2e723, uncommitted)

TRACK_A_DOCS_IMPORTED = YES  (7 files: 6 copied + 1 already identical; sha256 7/7 = MAIN)
TRACK_A_DOCS_MODIFIED = NO

TRACK_B_FINAL_CODE_PRESERVED = YES  (사후 매니페스트 대조: 코드·data 변경 0)

INTERIOR_RELEASE    = interior-01-1.5.1-6bbdd07eb9bf
                      (hash 6bbdd07eb9bf07aef7f9d975f4a0fce977820874246bc4403cc8af5d89425d02, 재계산 일치)
DEMO_BUILD_INPUT_ID = aa71b829ec7046f223904d42d38d1fe58a7b3fc61a245d6d3f6a4112c710b171  (재계산 일치)
DEMO_PACKAGE_HASH   = 613cd9e00e73d8428efcb9afa4249bb353952994c0653568da59adc407890266  (재계산 일치, 156 files · 7,283,710 B)

UNKNOWN_CONFLICTS = 0

GITIGNORE_CANONICAL_DATA_VISIBLE = YES  (3,469 / 3,469 files)
GITIGNORE_RAW_CAPTURE_EXCLUDED   = YES
GITIGNORE_SCREENSHOTS_EXCLUDED   = YES  (2,135 PNG · 2.28 GB)

ROOT_TYPECHECK     = PASS  (0 errors)
PLATFORM_TYPECHECK = PASS  (0 errors)
RUNTIME_TYPECHECK  = PASS  (0 errors)
TEST_PLATFORM      = PASS  (275 passed, 0 failed)
TEST_PUBLISH       = PASS  (59 passed, 0 failed)
TEST_PUBLISH_E2E   = PASS  (45 passed, 0 failed, 1 skipped = live-mode-only check)
BROWSER_SMOKE      = PASS  (65 / 65)

REPORT_NUMBERS_RECONCILED = YES

SECRET_SCAN_PASS = YES  (5,330 candidate files; 실제 .env 값 포함 검색 0건. 독립 리뷰어의 별도 검사도 0건)

INDEPENDENT_REVIEW = BLOCKER 0 · MAJOR 1 (부분 반영 + H4) · MINOR 4 (전부 반영) · NOTE 4

READY_FOR_GIT_CHECKPOINT             = YES  (H1, H2, H7 결정 후 실행. 기술적 차단 요인 없음)
READY_FOR_TRACK_A_FINAL_CONFIRMATION = YES  (계약 후보 00–06 이 공식 작업본에 원본 그대로 있음. 승인·consumer 회신은 사람 몫)
READY_FOR_CLOUDFLARE_PILOT_PREP      = YES  (준비 단계만. 실제 live 실행은 L1–L5 가 여전히 막고 있음: static-deployment-foundation/00 §6)

COMMIT_PERFORMED = NO
PUSH_PERFORMED = NO
REMOTE_DEPLOYMENT_PERFORMED = NO

NEXT_SMALL_PATCH_ITEMS = homepage canonical · no-contact /contact noindex · OG (title/description/url)  → 1.5.2 하나로, L1 rebuild 와 묶기
DEFERRED_ITEMS = LATER: concurrent remote publish CAS · runtime seal 추가 read
                 REAL_CUSTOMER_TRIGGER: JSON-LD · mailto → backend · video Range
```

```
WEB_RECON_FOUNDATION_CONSOLIDATION_COMPLETE
ONE_AUTHORITATIVE_WORKTREE_READY
NO_REMOTE_DEPLOYMENT
NO_BOOSTCHAT_INTEGRATION_IMPLEMENTED
```
