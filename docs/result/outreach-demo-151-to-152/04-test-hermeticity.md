# 04 — Fresh clone test hermeticity (2026-09-22)

원칙: 자동 테스트는 Git checkout 만으로 돌아야 한다. `references/boost-interior/{generated-approved,project-01-white-34p}` 는 Git 에 넣지 않는다. 이번에 `.gitignore` 에 `/references/` 를 추가했다 (independent review MAJOR 1: untracked 이지만 ignore 되지 않아 `git add .` 한 번이면 고객 사진 138 MB 가 들어갈 수 있었다).

## 1. 실제로 무엇이 깨졌나 — fresh clone 으로 재현

HEAD `14c49a6` 를 `git clone` 한 트리에서 `step6.test.ts` 를 돌렸다 (node_modules 만 symlink).

```
FAIL D2 independent of the baseline: no Template / Platform implementation file (test/ excluded) was modified after the 1.4.0 release was cut
     files modified after the release cut: [templates/… 46개, platform/… 26개] ≠ []
FAIL K2 … ENOENT: scandir '…/references/boost-interior/project-01-white-34p'
FAIL K3 … ENOENT: scandir '…/references/boost-interior/generated-approved'
step6: 26 passed, 3 failed
```

알려져 있던 것은 K2/K3 뿐이었다. **D2 도 fresh clone 에서 실패한다.** `git clone` 이 모든 파일의 mtime 을 checkout 시각으로 찍기 때문이다. 이전 검증이 이것을 못 본 이유: mtime 을 보존하는 복사본으로 검증했기 때문으로 보인다 (`01` §5 "devroot").

## 2. 해법 (가장 작은 것)

### K2 / K3 — tracked 기록으로 옮김

- 새 파일 `platform/test/step6-references.json` (tracked): 두 reference 폴더의 **파일 이름 + sha256** 만 담는다 (reference 사진 14개, approved generation 51개). 이미지 자체는 넣지 않는다.
- K2 는 이 기록의 hash / 이름으로 검사한다: 어떤 site/package 자산도 reference 와 byte-identical 이 아니고, reference 파일 이름을 쓰지 않고, PNG 가 없고, SVG stand-in 이 raster 를 embed/link 하지 않는다. 판정 기준은 **이전과 같다** (전에도 디스크의 파일을 hash 해 같은 비교를 했다).
- K3 의 "approved files vs ingested" 는 기록의 approved 개수 (51) 로 비교한다. 나머지 (status ↔ registry, verdict ↔ counts) 는 그대로.
- **새 check K1b**: `references/` 가 있는 곳(작성자 기계)에서는 기록 == 디스크 (이름 + sha256 전부) 여야 한다. 그래서 기록이 조용히 낡을 수 없다. 폴더가 없으면 (fresh clone) 이 check 는 비교할 대상이 없어 통과한다.

품질: fresh clone 에서도 K2/K3 는 이전과 같은 비교를 한다. 줄어든 것은 "fresh clone 에서 디스크의 reference 가 기록과 같은가" 하나뿐이고, 그것은 디스크가 없으니 원래 확인할 수 없는 것이다.

### D2 — mtime 은 Git 과 다른 파일에만 적용

- `git status --porcelain -z --untracked-files=all -- templates/interior-01/v1 platform` 으로 HEAD 와 다른 파일 / untracked 파일을 구하고, **그 파일들만** mtime 을 pinned release cut 시각과 비교한다.
- clean tracked 파일의 mtime 은 checkout 시각일 뿐 증거가 아니다. 그 bytes 는 D 가 이미 hash 로 고정한다 (release record per-file hash + baseline tree hash). D2 는 원래 header 에 "forgeable, defence in depth only" 로 적혀 있던 검사다.
- Git 이 없으면 (예: tarball) 예전처럼 모든 파일을 mtime 으로 검사한다.
- 로컬 편집은 여전히 잡는다: release cut 뒤에 Template/platform 파일을 고치면 그 파일이 dirty 가 되고 mtime 이 cut 보다 늦다 → 실패.

### 두 번째 fresh-clone 실행에서 추가로 나온 것 — release 파일의 read-only mode

위 수정 뒤 후보 트리의 fresh clone 에서 `test:platform` 을 돌리자 **4개 suite 가 check 1개씩** 더 실패했다 (canonical 트리에서는 통과). HEAD `14c49a6` 에도 있던 문제다.

```
slice1  FAIL release immutability: stored files read-only; tampering is detected   expected failure matching /EACCES|permission/i
step4   FAIL B old release … (hash + read-only files)                             old release file is writable
step41  FAIL release: … Step 4 release untouched                                  old release file is writable
step5   FAIL C old 1.2.0 (and 1.1.0) releases: … read-only …                      interior-01-1.2.0-93fb66acda7d: release file is writable
```

원인: `template:release` 는 저장하는 release 파일을 `chmod 0444` 한다. Git 은 bytes 와 실행 bit 만 저장하고 read-only mode 는 저장하지 않는다. 그래서 checkout 한 release 파일은 0644 다. mtime 과 같은 종류의 문제다.

해법 — 공용 helper `platform/test/git-checkout.ts` (step6 D2 의 `gitDirtyPaths` 도 여기로 옮김):

- `releaseFileSealed(repoRoot, file)`: read-only 이면 sealed. writable 이면 **Git 이 추적하고 HEAD 와 byte-identical 일 때만** sealed (bytes 는 Git 이 쥐고 있고, 같은 check 가 `verifyRelease` 로 release record 와 다시 hash 비교한다). untracked 이거나 수정된 writable release 파일은 여전히 실패. `step4` B, `step41` release, `step5` C 가 이것을 쓴다.
- `slice1` "release immutability": 이전에는 fixture pin 의 저장된 release 를 복사해 "쓰기가 EACCES 로 거부되는지" 를 봤다. 이제는 **이 check 안에서 throwaway root 에 release 를 직접 cut** 하고 (`createRelease`, working-tree version 의 release 와 같은 id 인지 확인), 그 파일에 쓰기 → EACCES, chmod 후 변조 → `verifyRelease` 가 "was modified", metadata 변조 → 거부를 본다. 즉 "platform 이 release 를 봉인한다" 는 실제 동작을 checkout 과 무관하게 검증한다. 저장된 release 의 mode 는 위 helper 로 step4/41/5 가 본다.

## 3. 기계적 검증 — fresh-clone-equivalent

1. `git clone` HEAD → scratch `fc2`.
2. 커밋할 후보 파일 (`git ls-files -m -o --exclude-standard` 에서 `references/`, 루트 `prompt` 제외) 을 **mtime 보존 없이** 복사하고, 삭제 파일 (`git ls-files -d`) 을 지운 뒤 `fc2` 안에서 commit.
3. `fc2` 를 다시 `git clone` → `fc3`. `references/` 없음 확인 (`ls: references: No such file or directory`). `node_modules` 만 symlink.
4. `fc3` 에서 typecheck 3종 + `test:platform` 의 모든 suite + `test:publish` 를 실행.

1차 실행의 실패(위 read-only mode)를 고친 뒤 같은 절차로 **다시** 만들어 전체를 돌렸다. 결과는 `06-verification.md` §2.

범위 밖 (기록만): `scripts/template-platform-step6-{assets,fal-*,image-pack,review-pack}.ts` 는 `references/` 를 읽는 **자산 제작 도구**다. 자동 테스트가 아니고 `test:*` 에 연결돼 있지 않다.
