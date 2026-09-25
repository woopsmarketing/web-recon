# 33 — Working-tree fingerprint, both repos (pre-next-session hygiene)

| | |
|---|---|
| taken | 2026-09-25 |
| purpose | preserve the fingerprint of **uncommitted** product work in both repos so a later session can prove nothing drifted |
| method | read-only. No file content was modified, nothing staged, nothing committed. No `git add` / `reset` / `restore` / `checkout` / `stash` was run in either repo |
| production | **not touched, not queried** — the exposure fuse was deliberately *not* read |

This document supersedes two counts in [`32-round-9-handoff.md`](32-round-9-handoff.md) §7 — see §4.

---

## 1. web-recon — `/Users/woops/projects/web-recon-track-b`

| | |
|---|---|
| branch | `track-b/static-deployment-foundation` |
| HEAD | `5b16a5d6c357620c321fe3c90c856f7bfd4dd7e7` |
| HEAD subject | *chore: checkpoint portfolio v0.2 validation round 9 (NOT READY)* |
| worktrees | one; no linked worktree |
| dirty | **16 modified tracked + 4 untracked paths** |

### 1.1 Diff fingerprint (tracked, unstaged)

```
git diff | sha256   2efea94b9a899c0c8ce3b88700bf73e6bc280fa88ed6d74f289e9fe2d13ea2a6
git diff | bytes    212554
diffstat            16 files changed, 2374 insertions(+), 152 deletions(-)
```

Reproduce with: `git diff | shasum -a 256`. A different hash means the tree moved.

### 1.2 Modified tracked files — sha256 of working-tree content

| lane | sha256 | file | ± |
|---|---|---|---|
| **V0.2 producer** (this session) | `d239a5ff0aae57000000f70fe7d470ae61b9d17b1801a64e2ffffe41ef893f77` | `platform/content/schema.ts` | +175 |
| **V0.2 producer** | `2b5376e704edbe532700d23f5e9227f0c6f4880529b40ae0d9abac57ccfd1e79` | `platform/integration/validate.ts` | +131 |
| **V0.2 producer** | `71f5930e6fae15b8414342382e81062bbebdfc54b3aa1c452b1ed97e40807d7b` | `platform/test/integration.test.ts` | +889 |
| **V0.2 producer** | `bbcfd7278852f86f4bba6df60395f255306b4e15fea965173ee1d13901f6adf4` | `platform/integration/emit.ts` | +203 |
| **V0.2 producer** | `6d0dba60d0bf6a48c0b8d6d0246d5166df69e4d231bbc216f65af0976436d9b9` | `platform/integration/contract.ts` | +82 |
| **V0.2 producer** | `8ed5756fadb5eb21a9ce2705a4fb4a30391e266fb33bfb9a26005474a8b2f6a4` | `platform/integration/sources.ts` | +5 |
| **V0.2 demo corpus** | `7c8c6a9ecfb67e4b4a8cb250196e8aabd9662fbc7e0c52b5b7759644e2a8b8cb` | `data/sites/boost-interior-demo/content/projects.json` | +728 |
| **V0.2 / test** | `1bcf5ac8f714134bc419404e7400dff10982042a961420058f5da52af93267bf` | `platform/test/slice1.test.ts` | +244 |
| **mixed** | `463f43a32619188c909d2a827cde8c73fcd97b7e27d8e59c58b9c5acb90ec5c3` | `platform/build/qa.ts` | +19 |
| **mixed** | `27c1edce2fc7f3755f2ee3f58286c0c1f37716031abd5d12a29e6475aaa22ab7` | `templates/interior-01/v1/template.ts` | +17 |
| **mixed** | `03e0c0658404277681a90766bc4297e8482080a689a3d63430c688d407a547d4` | `data/sites/boost-interior-demo/site.json` | +6 |
| **widget-seam** | `7c240fcd94bd2fd9c84af5c64a03454da88430c07c1e3e4a9e68763c65d2bb43` | `platform/site/context.ts` | +7 |
| **widget-seam** | `d9ccf70916fb2576b92ac9ec66d45e72049a384370f2722a95da1d95da140fb9` | `platform/site/load.ts` | +8 |
| **widget-seam** | `cfb09839d888b431d9fd8735447df84985dc5c98ce3203ef3de911daaf3ca5c6` | `platform/site/instance.ts` | +4 |
| **widget-seam** | `44d42b3a7298a302cc6d92d89e2f481779078eabeee73c45f89ea7c58343bbf6` | `templates/interior-01/v1/app/layout.tsx` | +6 |
| **widget-seam** | `918560f6a4402368fac1d57c77d56743bf6e4f310525523f9c3826907dedce50` | `platform/build/site-build.ts` | +2 |

Lane assignment is by content and by the release-source membership `I2b` checks; the three marked
**mixed** carry edits that cannot be cleanly attributed to one lane and should be read before either
lane is committed separately.

### 1.3 Untracked

| sha256 | path | lane |
|---|---|---|
| `4d14a2b70a02ba94d622f7945ae20e33785355b3c3e0b9c4535b8a2105bf5700` | `platform/site/head-scripts.ts` | widget-seam |
| `9a73472c1e6098b42e918433f9cd1741166f5fb94db61fc2a114af5048e90f68` | `templates/interior-01/v1/app/head-scripts.ts` | widget-seam |
| `4d48ed41dfc42051a6c03c017562ab89fba04ec57f3442b06949b0ec389a9a1a` | `docs/result/static-deployment-foundation/widget-seam/01-head-scripts-seam.md` | widget-seam |
| `675edbb8b751546c0e0e9d45ea578714e093cba3a409e3fd74bb0162ef2b21bb` | `docs/result/static-deployment-foundation/proof/live-e2e.json` | pre-session (mtime 2026-09-22) |

⚠ **Both `head-scripts.ts` files are release sources of `interior-01@1.6.0`.** They are untracked,
so `git diff` and `git stash` do not see them, and `I2b` will fail against any tree that lacks them.

---

## 2. boost-chat — `/Users/woops/projects/boost-chat`

| | |
|---|---|
| branch | **`feat/first-party-portfolio-reader`** |
| HEAD | `319774cf82fedcdc1a93b652694db38c0df5859a` |
| HEAD subject | *docs: portfolio search phase 3 implementation, tests, review and production reports* (2026-09-23) |
| dirty | **15 modified tracked + 74 untracked files** |
| commits this session | **none** |

### 2.1 Diff fingerprint

```
git diff | sha256   91637c2809352f00e2261180e40dd3dab58643d38d34989c64a760e8a7b40070
git diff | bytes    179911
diffstat            15 files changed, 2989 insertions(+), 1073 deletions(-)
```

### 2.2 `GC1` refactor — modified tracked files

The behaviour-preserving move of interior domain knowledge out of the generic chat core (`OD-B`),
recorded in `docs/work/interior-portfolio-v0.2/05-gc1-refactor.md`. All mtimes 2026-09-24 16:25–17:38.

| sha256 | file | ± |
|---|---|---|
| `29ae4a74319f78d1af4e4eefcd08c3bce9a15a3ebda427822b2e23b5f8920958` | `src/lib/first-party/contract.ts` | +410 |
| `be44f825f8c68d702deef4a511a4cf30f094afbe684befb9bec476d7bb8f905e` | `src/lib/prompt/builder.ts` | +81 |
| `6b035e3d22a2d9792f7c1eae50b203cea54373ed12805c2613c9babab1ae844a` | `src/lib/prompt/policy.ts` | +56 |
| `42ae28a296d0cca8b0b4b19d5418d261d5c54de46ec87efb16924be86a4e1582` | `src/lib/prompt/boundary.ts` | +38 |
| `54bf27fb2a3db1fd6890373269bc38af1d27ffcb89d574400798d58fba75abb9` | `src/lib/lead/repository.ts` | +91 |
| `75ef3c3182680cd0224fc367509e532017d48b96f3b7c48a5641a3d0805ab6cb` | `src/lib/lead/group.ts` | +18 |
| `76757a5231559d6d94e87968b33f4a6fb19e9e9ba166546713d8febd280a2961` | `src/components/admin/LeadBoard.tsx` | +22 |
| `fceae892cb11ea12a0fd10c01ffebd25774c40f1f0076fcb16bd0f1b587da6e1` | `src/components/Chat.tsx` | +14 |
| `5a37e860edceb8e031a2817e8d06c9902179751da972dc361b548ac4ea823092` | `src/lib/chat/run-chat.ts` | +9 |
| `6bcb3974a818123dd7e4c34262efdd31625e48c01e6d71a6bafb6e4ad358d9ef` | `src/lib/first-party/exposure.ts` | +17 |
| `bad7cc749283604fc0a17b4600a591ee70cf3c75c73839af2ea38ed5b027f8ec` | `src/lib/first-party/search-types.ts` | +25 |
| `5d368baa72949c5c8a2ee89da5a8350059939c00b8a888f305d760a4d416d1c8` | `scripts/first-party-contract-test.ts` | +514 |
| `efd016707ed31fcb728e03ae1b633a814231f1d1aac96ce348b6baab60384a48` | `scripts/prompt-boundary-test.ts` | +49 |
| `f305fb0f8d06b737e2398ed4d98f082b41a46e027ec0a8a313b40c61c5892d65` | `scripts/portfolio-acceptance-test.ts` | +16 |

### 2.3 ⚠ `GC1`'s destination modules are **untracked** — the fragile part

The refactor moved code *out of* the generic core and *into* new modules that have never been
committed. `git diff` shows none of them; `git stash` would not carry them.

| sha256 | size | mtime | path |
|---|---|---|---|
| `22f60dd8f9cde802aabd517569a0f0c45f0c5e0dc01561773318554f8d1e6520` | 5,497 | 2026-09-24 17:23 | `src/lib/first-party/interior-prompt.ts` |
| `edc22ed81827ed903bd5fc4fce4ec47ce515500e394d3f47208711771caa0be8` | 3,990 | 2026-09-24 17:24 | `src/lib/first-party/lead-brief.ts` |
| `49ad9f632d5138fedfa68941e13dc14952c1bb3308de0e7ca35431fd29723dac` | 3,636 | 2026-09-24 17:24 | `src/lib/lead/brief.ts` |
| `4a7d4a6b46a9c98daac2d0946790f70940cde886c41f41ae4e0fea22e7685d77` | 10,423 | 2026-09-24 16:22 | `src/lib/first-party/built-space.ts` |

Six of the modified files import them (`LeadBoard.tsx`, `exposure.ts`, `lead-brief.ts`,
`repository.ts`, `brief.ts`, `boundary.ts`, plus two scripts). **Lose these four and the fifteen
modified files do not compile.**

`built-space.ts` (16:22) predates the refactor step and `05-gc1-refactor.md` lists it under
*"untouched, by instruction"*; it is nonetheless untracked and load-bearing, so it is recorded here.

### 2.4 Owner work — recorded, not touched

`prompt` (M), `prompt2` (?? , mtime 2026-09-23 02:59), `test.html` (?? , 2026-08-29),
`data/eval-authority/`, `data/eval-general/`, `data/eval-holdout/`, `data/eval-holdout-r12/`,
`docs/work/v2-release1-*/`, `docs/work/admin-workspace-*`, `docs/work/first-party-final-mile-*`,
`docs/work/jev-decision-layer-analysis-*`, and four untracked `docs/result/BOOSTCHAT-*.md`.

`prompt` is the only **tracked modified** file among these (+2,702) and is bundled into §2.1's diff
fingerprint; it is **not** GC1 work and must not be attributed to it.

---

## 3. Stale shells

### 3.1 PID 16183 — the one `32-` recorded

| | |
|---|---|
| exists | **yes** |
| started | Thu 2026-09-24 22:57:49, elapsed **13h 10m** |
| state | `Ss` (session leader, sleeping), CPU time **0:00.01**, 0.0 % |
| parent | `15992` — `claude --permission-mode bypassPermissions`, i.e. **this session** |
| command | the `python3` heredoc that spliced `contract-pipeline.mjs`, followed by `node -c "" ; node --check …` |
| **child** | **yes — PID 16186, `node -c`**, CPU time **0:00.02** over 13 h |

What 16186 is: the `node -c ""` tail of that command line. `-c` is `--check`, and with no file it
reads **stdin** — fd 0 is a unix socket that will never deliver. `lsof` shows fds 1 and 2 going to a
task-output file and `/dev/null`; **no writable descriptor into either repo**. It is a syntax
checker, which cannot modify a file even in principle.

Is a proof / test / checker actually running? **No.** 0.02 s of CPU in 13 hours, and the work it was
guarding is finished and safe: `node --check docs/result/interior-portfolio-v0.2/proof/contract-pipeline.mjs`
returns **SYNTAX OK**, and the file is committed in `5b16a5d`.

**ACTION: preserved, not terminated.** The instruction authorises a graceful terminate only when it
is clear there is *no active work **and** no child process*. **A child process exists**, so the
stated precondition is not met, and the fallback is explicit: do not kill, record why. Every
substantive indicator says it is idle and harmless — but that is a judgement about the spirit of the
rule, and the rule's letter points the other way on the irreversible action. Recorded for the owner
to override.

**Nothing needs cleaning up for a fresh session regardless:** 16183 and 16186 are descendants of
PID 15992, this Claude session, and exit when it does.

### 3.2 PID 5002 — a second stale shell, not previously recorded

Found while checking 16183.

```
5002  ppid 15992  Ss  elapsed 19h55m  cpu 0:00.01   /bin/zsh -c … (shell-snapshot wrapper)
5004  ppid 5002   S   elapsed 19h55m  cpu 0:00.07   node …/tsx/dist/cli.mjs --tsconfig platform/tsconfig.json -e 'import { z } from "zod"; …'
5010  ppid 5004   S   elapsed 19h55m  cpu 0:00.07   node --require …/tsx/dist/preflight… (tsx's own child)
```

An inline `tsx -e` zod probe from early in the session, hung the same way. Same parent, same profile,
0.07 s CPU in ~20 hours. **Preserved** — same reasoning as §3.1, and it was outside the brief's
scope, which named only 16183.

Unrelated and **not** this session's: PIDs 14133 / 14134 (`site-factory-next` domain-connect runner,
3 days) and the `cursor-server` tree.

---

## 4. Corrections to `32-round-9-handoff.md`

| `32-` said | actually |
|---|---|
| *"the `GC1` refactor … 15 files, +2,989/−1,073, all uncommitted"* | **18 files**: 15 modified tracked **plus 3 untracked destination modules** created 17:23–17:24 (`interior-prompt.ts`, `lead-brief.ts`, `lead/brief.ts`), without which the 15 do not compile. A fourth untracked module, `built-space.ts`, is also load-bearing. The `+2,989/−1,073` figure counts **only the tracked 15** |
| *"1 stale zsh (pid 16183 …) … No proof or test run active. Left alone."* | correct that nothing is running, **but 16183 has a child (16186)** and there is a **second** stale tree (5002 → 5004 → 5010, ~20 h) that `32-` did not record |

`32-` also did not state boost-chat's branch; it is **`feat/first-party-portfolio-reader`**.

---

## 5. How to verify nothing drifted

```sh
cd /Users/woops/projects/web-recon-track-b && git diff | shasum -a 256
#   expect 2efea94b9a899c0c8ce3b88700bf73e6bc280fa88ed6d74f289e9fe2d13ea2a6

cd /Users/woops/projects/boost-chat && git diff | shasum -a 256
#   expect 91637c2809352f00e2261180e40dd3dab58643d38d34989c64a760e8a7b40070
```

Untracked files are **not** covered by those two hashes — check §1.3 and §2.3 individually.
