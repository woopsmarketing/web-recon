# 02 — 권위 있는 출처 지도 (2026-09-22)

```
AUTHORITATIVE_WORKTREE = /Users/woops/projects/web-recon-track-b
branch = track-b/static-deployment-foundation   HEAD = 6c2e723 (uncommitted 작업 포함)
```

기본 작업 폴더 `/Users/woops/projects/web-recon` 은 이 시점부터 **최신 작업본이 아니다.** 거기에는 raw crawl 아카이브와 Track B 1차 초안이 남아 있다. 두 폴더 루트에 `AUTHORITATIVE_WORKTREE.md` 표지를 두었다 (`00-summary.md` §4).

## 1. 영역별 출처

| 영역 | 권위 있는 출처 | 통합 작업 | 통합 후 검증 |
|---|---|---|---|
| `docs/reports/integration/**` (Track A 계약 후보) | MAIN | MAIN → TRACK-B 로 6개 복사 (`cp -p`), `00-requirement.txt` 는 이미 동일 | 7/7 파일 sha256 이 MAIN 과 동일 (§2) |
| `templates/interior-01/v1/**` (1.5.1 최종 상태) | TRACK-B | 없음 (두 트리 동일) | release hash 재계산 일치 |
| `data/template-releases/interior-01/**` (release 11개) | TRACK-B | 없음 (두 트리 동일) | 11/11 재계산 일치 (`04` §3) |
| `data/sites/**`, `data/site-builds/**` (demo + fixture 3개, current/previous) | TRACK-B | 없음 (두 트리 동일) | buildInputId / packageHash 재계산 일치 |
| `platform/publish/**`, `platform/cli/site-publish.ts` | TRACK-B | 없음. MAIN 의 1차 초안은 **가져오지 않음** | `test:publish` 59/0 |
| `platform/test/publish.test.ts`, `publish-e2e.test.ts`, `publish-surface.ts`, `canonical-151.ts`, `ia151.test.ts` | TRACK-B | 없음 | `test:platform` 275/0, e2e (`04`) |
| `workers/recon-runtime/**` | TRACK-B | 없음. MAIN 의 1차 초안은 가져오지 않음 | runtime typecheck 0, bundle 7.49 KiB |
| `package.json` 의 publish/runtime scripts, `pnpm-lock.yaml`, `pnpm-workspace.yaml` | TRACK-B | 없음 (두 트리 동일) | — |
| `docs/result/static-deployment-foundation/**` | TRACK-B | 숫자 정합성 보정만 (`04` §5). `_session1/` 과거 기록은 그대로 | — |
| `src/**`, `scripts/**`, `fixtures/**`, `themes/**`, `docs/architecture`, `docs/status`, `docs/info`, 나머지 `docs/result/**`, `references/**` | 공통 (두 트리 동일) | 없음 | root typecheck 0 |
| `data/.gitkeep` | 공통 | MAIN → TRACK-B 복사 (0 B) | — |
| `.gitignore` | 이번 작업 | TRACK-B 에서만 수정 (`03`) | `git check-ignore`, `git add -n` |
| `docs/result/foundation-consolidation/**` | 이번 작업 | TRACK-B 에 새로 작성 | — |

## 2. Track A 문서 — 가져온 뒤의 해시

`docs/reports/integration/` 파일 수 **7**. MAIN 과 TRACK-B 의 sha256 목록을 `diff` 한 결과 차이 없음.

| 파일 | sha256 |
|---|---|
| `00-requirement.txt` | `ceec561bab4ba27f9c68c5186744dcd06b2cd0e3baa6134d97cb26d32e05b053` |
| `01-web-recon-producer-review-v0.md` | `fa367dadf3e3f6f30895f8e88f268cfce3bcac23c37d74efa17cc2f06e608c87` |
| `02-integration-contract-v0-candidate.md` | `c8e08aed8dbf69a8b1cb7f8f8a210e8498968dadc77b9e0839d49cdd28e658f9` |
| `03-integration-contract-v0-candidate.json` | `5d1370d68aecef55ffea7d51625b00555c790af836ffa5e797dc4871c501093a` |
| `04-boostchat-requirement-disposition.md` | `556c3f9ef2678f7258b4d1f37df7bbf9c0cce10c8b7d3f4f409c0d12d531a17b` |
| `05-integration-contract-v0-independent-review.md` | `0055f3fede1ad8def95b9fe98b8ab1ea1c5bb66b4286e1c2f60ff91b8a9d180d` |
| `06-implementation-phase-plan.md` | `f21deb3e3c9ef5528715d3c7cc5023094f660126174d9e3bd7f59781e5bd7fef` |

덮어쓴 TRACK-B 쪽 중간 초안의 해시 (기록용): `02` = `2eec8b20…4547`, `03` = `ec8f92f3…989a`. 이 초안은 Track A 가 MAIN 에서 계속 고쳐 쓴 파일의 이전 상태이고, 최종본이 그 내용을 대체한다.

```
TRACK_A_DOCS_IMPORTED = YES (6 copied + 1 already identical = 7 files)
TRACK_A_DOCS_MODIFIED = NO
```

## 3. Track B 최종 코드가 보존됐는가

통합 작업이 TRACK-B 에서 건드린 파일은 다음이 전부다.

1. `docs/reports/integration/` 6개 (Track A 소유, 복사)
2. `data/.gitkeep` (새 파일, 0 B)
3. `.gitignore`
4. `docs/result/static-deployment-foundation/` 의 요약 보고서 보정 (`04` §5 에 파일·줄 단위로 기록)
5. `docs/result/static-deployment-foundation/proof/local-e2e.json` — e2e 테스트가 실행될 때마다 스스로 다시 쓰는 파일
6. `docs/result/foundation-consolidation/**`, `AUTHORITATIVE_WORKTREE.md` (새 파일)
6b. 독립 리뷰 반영: `CLAUDE.md` 에 표지 파일을 가리키는 2줄, `docs/result/README.md` 색인에 2행
7. `tmp/consolidation-logs/**` (git 무시)

Track B 코드 영역(`platform/**`, `workers/**`, `templates/**`, `scripts/**`, `package.json`, `data/**`)에서는 **한 바이트도 바꾸지 않았다.** 통합 후 매니페스트를 다시 만들어 통합 전 TRACK-B 매니페스트와 대조한 결과는 `04` §6 에 있다.

```
TRACK_B_FINAL_CODE_PRESERVED = YES
```
