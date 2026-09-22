# 06 — 독립 리뷰와 처분 (2026-09-22)

통합 작업이 끝난 뒤 fresh-context 리뷰어(강한 모델)에게 검토를 맡겼다. read-only, 테스트·빌드·git 변경 금지, `.env` 값 출력 금지. 기대하는 결론은 알려 주지 않았고 "정확성 문제, 비밀값 위험, 금지 사항 위반, 잃어버린 작업, 보고서의 부정확한 서술을 독립적으로 찾아라"만 요청했다. 리뷰어는 보고서를 믿지 않고 해시 매니페스트, `git check-ignore`, `git add -n`, 로그 읽기를 직접 했다.

**리뷰어의 집계: BLOCKER 0 · MAJOR 1 · MINOR 4 · NOTE 4.**

## 1. Finding 과 처분

| # | 등급 | 내용 | 처분 |
|---|---|---|---|
| M1 | MAJOR | 공식 작업본 폴더에는 Claude 프로젝트 메모리(`~/.claude/projects/-Users-woops-projects-web-recon-track-b`)도 `.claude/` 설정도 없다. `MEMORY.md` 첫 줄 안내는 MAIN 에서 연 세션에만 보인다. TRACK-B 의 `CLAUDE.md` 에는 표지 파일을 가리키는 말이 없다 | **부분 반영 + 사람 결정.** TRACK-B `CLAUDE.md` 의 "Project documentation" 아래에 "`AUTHORITATIVE_WORKTREE.md` 가 있으면 먼저 읽어라" 2줄 추가 (역사 서술 아님). 표지 파일에 메모리 위치를 적음. 메모리 디렉터리를 복사·symlink 하거나 폴더 이름을 바꾸는 것은 `~/.claude` 와 MAIN 을 건드리는 일이라 하지 않았다 → `00` H4. 지금까지의 관행(세션은 MAIN 에서 열고 절대 경로로 TRACK-B 에서 작업)에서는 `MEMORY.md` 첫 줄이 동작한다 |
| m1 | MINOR | canonical re-include 가 위쪽 일반 규칙(`dist/`, `logs/`, `*.log`, `tmp/`, `*.tmp`, `.DS_Store`)에서 보호되지 않는다. 오늘 영향은 0 이지만, 그런 이름을 가진 package 파일이 생기면 git 에서만 조용히 빠진다 | **반영.** `data/` 블록을 파일 맨 끝으로 옮기고 `!data/{sites,site-builds,template-releases}/**` 추가, 그 뒤에 `data/**/.env`, `.env.*`, `.DS_Store`, `node_modules/` 재선언. `check-ignore` 30 경로 + scratch repo 의 실제 파일 30개로 검증 (`03` §3.1b). canonical 3,469 / 3,469 유지 |
| m2 | MINOR | screenshot 제외가 `.png/.jpg/.jpeg` 뿐이다. `.webp/.gif/.mp4/.pdf` 는 보인다 (오늘 0개) | **반영 (pdf 제외).** `.webp`, `.gif`, `.webm`, `.mp4` 추가. PDF 는 정식 보고서일 수 있어 넣지 않았다 |
| m3 | MINOR | `docs/README.md` 가 쓰라고 하는 색인 `docs/result/README.md` 에 `foundation-consolidation/` 도 `static-deployment-foundation/` 도 없다 | **반영.** §A2 표에 2행 추가. (step4–1.5.0 시기의 다른 보고서들도 색인에 없다. 그것은 이번 범위 밖이라 그대로 뒀다) |
| m4 | MINOR | `03` 의 크기가 MiB 인데 MB 로 적혀 있다 (166.9 MiB = 175.1 MB) | **반영.** `03` §3.2 에 단위 명시, `00` H2 수정 |
| n1 | NOTE | TRACK-B 에서 `git add .` 하면 reference 이미지 84 MiB 가 조용히 stage 된다 | **그대로.** 요구사항이 `generated-approved` 를 "자동으로 추가하거나 삭제하지 않는다"고 했으므로 무시 규칙을 넣지 않았다. `03` §6 과 `00` H2 가 경로 지정 stage 를 권고한다 |
| n2 | NOTE | 공식 작업본만으로는 recon/observer 쪽을 돌릴 수 없다 (`data/.registry`, raw crawl, `tmp/aco`, `.env` 가 MAIN 에만 있음). "공식 최신 작업본"이라는 표현이 이 점을 앞세우지 않는다 | **반영.** `00` 맨 위와 H4, `03` §5 에 "MAIN 을 지우면 안 된다"를 명시 |
| n3 | NOTE | `data/site-builds/` 를 추적하면 build 마다 약 7 MiB 가 git history 에 영구히 쌓인다 | **사람 결정으로 추가** (`00` H7, `03` §5). 요구사항 §7 을 따른 결과이므로 규칙은 그대로 |
| n4 | NOTE | 요구사항의 "예상 개념"에 없는 `.gitignore` 2줄(docs/result log re-include)을 적용했다. 공개는 충분하다 | **그대로.** `00` H6 에 되돌리는 방법과 함께 남김 |

## 2. 리뷰어가 직접 확인하고 문제없다고 한 것

- **트리 비교:** 자체 매니페스트로 통합 전 상태를 재구성하면 7,435 / 7,440 / 7,409 / 13 / 18 / 13 이 그대로 나온다. 남은 차이는 모두 소유 영역 규칙으로 설명된다. UNKNOWN_CONFLICT 없음, 잃은 작업 없음.
- **Track A:** 7개 모두 sha256 동일. `git diff --no-index --stat` 결과 없음.
- **Track B 코드:** `find platform src scripts workers templates data fixtures themes -newermt '2026-09-22 00:00'` → 0 파일. MAIN 의 9개 초안은 mtime 17:27–18:17, TRACK-B 는 20:59–22:03 이고 diff 방향은 초안 → 최종뿐이다.
- **금지 사항:** 두 repo 모두 `6c2e723`, reflog 에 새 commit 없음, `git diff --cached` 비어 있음. release 디렉터리 11개, `1.5.2` 없음. `data/site-builds` mtime 은 09-21. integration manifest / portfolio index / BoostChat 코드 없음.
- **비밀값:** 5,338 파일을 14개 정규식 + 파일 이름 + 실제 `.env` 값 포함 검사 → 0건.
- **역사 보존:** `_session1/` 6개는 MAIN 원본과 sha256 동일. 다섯 군데 보정은 모두 날짜가 붙은 추가이고, 본문을 고쳐 쓴 곳은 `06-local-validation.md:14` 의 잘못된 경로 하나이며 `:21` 에 정정 사실이 적혀 있다.
- **숫자:** `tmp/consolidation-logs/` 는 TRACK-B 에서 `run-all.sh` 로 만들어졌고 22단계 모두 `exit=0`. suite 별 합 275, 59/0, 45/0/1, 65/65, bundle 7.49 / 2.74 KiB. package 는 디스크에서 156 파일 / 7,283,710 B.
- **표지:** 두 `AUTHORITATIVE_WORKTREE.md` 는 서로, 그리고 `00` / `02` 와 모순되지 않는다.

## 3. 리뷰어가 확인하지 못했다고 밝힌 것

- 테스트, typecheck, bundle 을 다시 돌리지 않았다 (read-only). 그 수치는 로그에 근거한다.
- release hash / buildInputId / packageHash 를 platform 함수로 다시 계산하지 않았다 (코드 실행 필요). 기록값, 파일 수, 바이트 합만 확인했다. → 재계산은 통합 작업 쪽에서 별도 에이전트가 했다 (`04` §2).
- `00/06/08/09` 의 보정 전 baseline 이 없어 "추가만 했다"는 것은 문구로 판단했다. → `01-151-validation.md` 는 MAIN 에 1차본이 있어 diff 가능하고, 나머지 4개는 TRACK-B 에만 있던 파일이다.
