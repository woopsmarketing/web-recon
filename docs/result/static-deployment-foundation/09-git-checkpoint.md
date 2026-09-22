# Git Checkpoint — Track B Audit (2026-09-21)

> **Status update, 2026-09-22 (foundation consolidation).** This audit is kept as written. Since then: (1) the `.gitignore` rules of §3 were re-verified against the tree and **applied** (the log re-include was simplified to `!docs/result/**/logs/`, and `references/**/generated-candidates/` was added) — precondition 1 is met; (2) Track A finished and its final `docs/reports/integration/**` (now **7 files**, not 3) was imported into this tree unmodified, so preconditions 3 and 5 no longer describe two separate lines of work — this tree is the single authoritative worktree; (3) preconditions 2 and 4 are still open. Still nothing staged or committed. Details: `docs/result/foundation-consolidation/03-gitignore-and-checkpoint.md`.

Read-only. Repo: `/Users/woops/projects/web-recon-track-b` (isolated copy), branch `track-b/static-deployment-foundation`, HEAD `6c2e723` (3 commits, unchanged). **Nothing committed by this audit.** Reuses sizes/NUL-sweep/`.gitignore` baseline from `docs/result/static-deployment-foundation/_session1/git-checkpoint.md` (superseded first-pass audit, left as-is) and re-verifies everything below against the current tree. `git status --porcelain`: 239 `??` + 117 `M` lines (up from 236/115 — small drift from ongoing churn, not material).

Track A owns `docs/reports/integration/**` (3 files, 104K: `00-requirement.txt`, `02-integration-contract-v0-candidate.md`, `03-integration-contract-v0-candidate.json`) — confirmed present, untouched, **excluded from every Track B pathspec below**.

## 1. Classification by group

| Group | Class | Verdict / notes |
|---|---|---|
| `src/` (44 `??` + 100 `M`) | CANONICAL SOURCE | Recon engine, heavily extended. Clean (NUL sweep, no nested `node_modules`). |
| `scripts/` (39 `??` + 13 `M`) incl. `scripts/fixtures/` | CANONICAL SOURCE | CLI/smoke scripts + 1 small fixture JSON. |
| `platform/` (whole dir new) incl. `platform/publish/{publish,wrangler-store,media,store}.ts`, `platform/cli/site-publish.ts`, `platform/test/{publish.test.ts,publish-e2e.test.ts,publish-surface.ts,ia151.test.ts,canonical-151.ts,...}` | CANONICAL SOURCE | 808K. Track-B-specific (publish pipeline + IA151/canonical-151 tests). Verified all named files exist. |
| `templates/` (whole dir new) | CANONICAL SOURCE | 312K, interior-01 Next.js package. |
| `themes/` | CANONICAL SOURCE | Already tracked from a prior commit, **no changes** (not in status output) — no action needed. |
| `workers/recon-runtime/` — `src/{contract,index,paths}.ts`, `wrangler.jsonc`, `tsconfig.json` | CANONICAL SOURCE | 164K total dir. `wrangler.jsonc` reviewed: no account id / API token, routes commented out, `workers_dev:false`. Clean. |
| `workers/recon-runtime/.wrangler/` | GENERATED / LOCAL STATE — **not fully ignored today** | Only contains `tmp/` (ignored via blanket `tmp/` rule) right now — 64K, no other files. But `.wrangler/` itself has no dedicated ignore rule; if wrangler ever writes state/log files directly under `.wrangler/` (not inside `tmp/`) they'd be unprotected. Recommend an explicit rule (see §3). |
| `workers/recon-runtime/tmp/` | TEMPORARY / DISPOSABLE | Bundle scratch (`tmp/sdf/bundle*`), already ignored via blanket `tmp/`. |
| `fixtures/` (`fixtures/task29/*.corpus.json`, `fixtures/task29.1/site-identity.example.json`) | CANONICAL SOURCE | 28K, platform test fixtures. |
| `references/boost-interior/project-01-white-34p` | REPORT / DOCUMENTATION (design reference) | Unchanged since last audit. |
| `references/boost-interior/generated-approved/` | UNKNOWN (needs human) | 47M approved AI images — may be superseded by optimized copies already under `data/sites/boost-interior-demo/assets/`. Unchanged size from prior audit. |
| `references/boost-interior/generated-candidates/` | TEMPORARY / DISPOSABLE | 57M rejected AI-image variants. Recommend NOT committing; archive/delete outside git. |
| `data/template-releases/interior-01/**` (11 releases, 1.0.0→1.5.1, incl. new `interior-01-1.5.1-6bbdd07eb9bf` 464K) | IMMUTABLE RELEASE | Confirmed each release dir present, `release.json` + `files/`. Currently invisible to git (blanket `data/` ignore). No NUL bytes, no nested `node_modules`/symlinks. |
| `data/sites/{boost-interior-demo,fixture-empty,fixture-large,fixture-small}` | CANONICAL DATA | site.json/theme.json/settings.json/slots.json/content/assets, 6.7M total. Same blocker as above. |
| `data/site-builds/{same 4 sites}/{packages,current.json,previous.json,history.jsonl}` | GENERATED REQUIRED ARTIFACT | `packages/` = static-export outputs (15M–38M per site, 60M total); `current.json`/`previous.json`/`history.jsonl` are small pointer files. **Multiple `platform/test/*.test.ts` (publish, predemo, polish, step4–6, slice1, ia150, ia151) read these paths directly** — confirmed via grep — so despite being build output, tests currently depend on them being present on disk. Recommend track (matches old report's "generated but tests depend on them" framing). |
| `docs/architecture/` (`recon-template-platform.md`, `runtime-preservation.md`) | REPORT / DOCUMENTATION | Untracked, small, text only. |
| `docs/status/source-preservation-v2.md` | REPORT / DOCUMENTATION | Untracked, single file. |
| `docs/result/**/*.{md,json,html,txt}` | REPORT / DOCUMENTATION | ~2,135 non-image files, ~17M. Includes the `docs/result/static-deployment-foundation/` set: `00-summary.md`, `00-requirement-track-b-v2.txt`, `01-151-validation.md`, `02-current-package-reality.md`, `03-static-delivery-contract.md`, `04-site-publish-design.md`, `05-recon-runtime-design.md`, `06-local-validation.md`, `07-live-deploy-plan.md`, `08-independent-review.md`, `09-git-checkpoint.md` (this file), plus `proof/`, `proof-151/` and `_session1/` (superseded first-pass docs, kept for history). `00-summary.md`, `06-local-validation.md` and `08-independent-review.md` are being written concurrently with this audit. All text/small, verified no file >5M. |
| `docs/result/**/*.png,*.jpg,*.jpeg` | GENERATED REQUIRED ARTIFACT (regenerable QA evidence) | 2,135 image files, 2.2G — confirmed count/size essentially unchanged from prior audit (2,132→2,135). Recommend exclude per old report's rule. |
| `docs/result/**/*.log` (260 files, 2.1M) incl. `docs/result/static-deployment-foundation/proof-151/logs/{smoke-ia151.log,test-ia151.log,smoke-ia151-negative-control-on-1.5.0.log}` | REPORT / DOCUMENTATION, but **currently silently git-ignored** | **New finding, not flagged in the prior audit.** The blanket `*.log` and `logs/` rules catch ALL `docs/result` logs, including the Track-B-specific IA151 proof logs. `git add -n` on one confirms: "ignored... hint: Use -f". These are evidence files, not disposable scratch — recommend an explicit re-include (see §3) rather than force-adding. |
| `docs/reports/integration/**` | REPORT / DOCUMENTATION — **Track A, EXCLUDED** | 3 files, 104K. Do not stage, do not modify. |
| `CLAUDE.md` | CANONICAL SOURCE (project config) | Untracked despite being "checked into the codebase" per its own header — same gap as prior audit. |
| `package.json` | CANONICAL SOURCE | Diff reviewed in full: +wrangler devDependency, +site:publish/template:release/site:build/runtime:dev/typecheck:runtime/test:publish/test:publish:e2e scripts, +many new `smoke:*` scripts, +`test:platform` composite (chains ia151.test.ts etc.), description string re-encoded (escaped em-dash → literal). No secrets. |
| `pnpm-lock.yaml` | CANONICAL SOURCE (generated, must track) | +860/−20 lines, consistent with adding `wrangler` (pulls in `workerd`). |
| `pnpm-workspace.yaml` | CANONICAL SOURCE | +2 lines: `allowBuilds`/`onlyBuiltDependencies` for `esbuild`+`workerd` — needed for the new wrangler dependency's postinstall. |
| `docs/info/PRODUCT_VISION.md` | REPORT / DOCUMENTATION | Already tracked, `M` only. |
| `prompt2` | TEMPORARY / DISPOSABLE | Present on disk, correctly ignored (`/prompt2` rule). `prompt` does not exist in this copy. Leave ignored. |
| `.env`, `node_modules/`, `data/` raw captures (not present in this copy — see task note), `tmp/` | N/A / correctly ignored | Confirmed via `git check-ignore -v`. |

No group fell into **SECRET-RISK** as a final verdict (see §2 — all hits resolved to safe).

## 2. Secrets sweep

Scope: `git ls-files -co --exclude-standard` (3,690 tracked+untracked-non-ignored files; excludes `node_modules`, `.git`, and everything `.gitignore`-covered).

**Filename patterns** (`.env*`, `*.pem`, `*.key`, `id_rsa*`, `*credential*`, `*secret*`, `*token*`, `.dev.vars`, `.wrangler/**`, `wrangler.toml/jsonc`): only 2 hits —
- `docs/result/28.5-visual-fidelity-evidence/.../theme-token-analysis.json` — CSS *design*-token analysis (`customPropertyDeclarations`, `colourViaVar`, …), not a credential. Confirmed by reading the file header. Safe.
- `workers/recon-runtime/wrangler.jsonc` — reviewed in full above: no account id, no API token, routes commented out. Safe.

**Content grep** (`CLOUDFLARE_API_TOKEN=`, `CF_API_TOKEN`, `api[_-]?key=...`, `Bearer ...`, `sk-...`, `fal[_-]?key`, `FIRECRAWL`, `AKIA...`, `-----BEGIN`) over the same file set: ~30 hits, all resolved:
- All `FIRECRAWL_API_KEY` hits are the variable **name** in docs/source/handoffs explaining "this is the only env var, it's optional, no LLM key exists." `.env.example` contains only `FIRECRAWL_API_KEY=` (empty placeholder, already tracked). No live key value anywhere.
- `docs/result/static-deployment-foundation/07-live-deploy-plan.md:51`: `export CLOUDFLARE_API_TOKEN=…  CLOUDFLARE_ACCOUNT_ID=…` — literal ellipsis placeholder in operator runbook prose ("operator-created, stored only in the operator's shell"), not a value. Safe.
- No `sk-`, `AKIA`, `-----BEGIN`, or `Bearer <token>` matches at all.
- No `fal_key`/`fal-key` matches (fal.ai batch scripts reference it only as a CLI/env var name elsewhere, not caught by this grep — no literal value found).

**`.wrangler/` ignore status**: **NOT ignored today** as a directory. Only `workers/recon-runtime/.wrangler/tmp/` is caught, incidentally, by the generic `tmp/` rule. Currently `.wrangler/` holds nothing but that `tmp/` subfolder, so there's no live exposure, but the directory is wrangler's local state/cache location (can hold OAuth tokens, deploy state) and should get its own rule rather than relying on the `tmp/` coincidence. Proposed rule in §3.

## 3. `.gitignore` recommendations (not applied — read-only)

Reconfirms the prior audit's two rules and adds two new ones found in this pass:

```gitignore
# 1. (prior audit, still needed) canonical data lives under data/, but data/
# is also the raw-crawl output dir; re-include the canonical subsystems
data/*
!data/sites/
!data/site-builds/
!data/template-releases/
!data/.gitkeep

# 2. (prior audit, still needed) proof-artifact screenshots are regenerable
# QA evidence, not source-of-truth; keep written reports, drop images
docs/result/**/*.png
docs/result/**/*.jpg
docs/result/**/*.jpeg

# 3. NEW — wrangler local state/cache; currently only its nested tmp/ is
# caught incidentally. Ignore the whole directory explicitly.
.wrangler/

# 4. NEW — docs/result log evidence is currently swallowed whole by the
# blanket *.log and logs/ rules (incl. the IA151 proof logs under
# static-deployment-foundation/proof-151/logs/). Re-include explicitly.
!docs/result/**/*.log
!docs/result/**/**/logs/
```

Verified today with `git check-ignore -v` (read-only, no edits made):
- `data/sites`, `data/site-builds`, `data/template-releases` → blocked by `.gitignore:14:data/`
- `workers/recon-runtime/.wrangler/tmp` → blocked by `.gitignore:30:tmp/`; `workers/recon-runtime/.wrangler` itself → not ignored (files directly inside it would leak)
- `docs/result/handoffs/25-stripe-canary/release-plan.log` → blocked by `.gitignore:26:*.log`
- `docs/result/static-deployment-foundation/proof-151/logs/smoke-ia151.log` → blocked by `.gitignore:27:logs/`
- `prompt2` → blocked by `.gitignore:42:/prompt2`; `.env` → blocked by `.gitignore:2:.env`
- `docs/result/28.6` (report dir), `workers/recon-runtime/wrangler.jsonc`, `docs/reports/integration` → **not ignored** (as expected, these should be trackable)

Rule 3 and 4 are **new relative to the prior audit** — re-verify before committing since a rule change could pull in files not yet reviewed here beyond the samples checked (the 260-file `.log` set and the empty-today `.wrangler/`).

## 4. Recommended checkpoint boundary (NOT executed)

Branch: `track-b/static-deployment-foundation` (current branch — correct, no new branch needed). Baseline commits (1–6) are the tree Track A also sees; Track-B-specific commits (7–9) come after and are the ones that actually matter for this task.

| # | Pathspec | Message (each ends with the required trailer) |
|---|---|---|
| 1 | `.gitignore` | `Re-include canonical data/ subsystems, exclude docs/result screenshots, ignore .wrangler/ state, and re-include docs/result log evidence swallowed by the blanket *.log/logs/ rules.` |
| 2 | `CLAUDE.md package.json pnpm-lock.yaml pnpm-workspace.yaml` | `Track CLAUDE.md and update root manifest/lockfile/workspace config for the platform+worker additions.` |
| 3 | `src/ scripts/` | `Update the recon/observation/content-injection/production engine and CLI scripts (responsive QA, continuous QA, preservation, site identity, source package, and related additions).` |
| 4 | `themes/` | *(already tracked, unmodified — skip; listed for completeness only)* |
| 5 | `data/sites data/site-builds data/template-releases` | `Add canonical site content/settings/slots, current+previous site-build static packages, and the immutable interior-01 template release history (through 1.5.1).` |
| 6 | `docs/README.md docs/info/ docs/status/ docs/architecture/ "docs/result/**/*.md" "docs/result/**/*.json" "docs/result/**/*.log" "docs/result/**/*.html" "docs/result/**/*.txt"` (excludes `docs/reports/**` and `docs/result/**/*.png|jpg|jpeg`) | `Add task/status/architecture docs and the docs/result report corpus (text + proof logs; screenshots gitignored, docs/reports/integration excluded — owned by Track A).` |
| 7 | `platform/ fixtures/` | `Add the recon template platform: build/release/site/cli/publish/settings/slots/theme modules, publish pipeline (platform/publish, platform/cli/site-publish.ts), and platform test suite incl. ia151/canonical-151/publish tests.` |
| 8 | `templates/` | `Add the interior-01 Next.js template package through release 1.5.1.` |
| 9 | `workers/recon-runtime/src workers/recon-runtime/wrangler.jsonc workers/recon-runtime/tsconfig.json scripts/template-platform-ia151-smoke.ts` | `Add the recon-runtime Cloudflare Worker (serves published Site Build Packages from R2; no routes/hostname attached by default) and its IA151 smoke script.` |
| 10 (optional, human decision) | `references/boost-interior/project-01-white-34p references/boost-interior/generated-approved` | `Add boost-interior design reference set and approved AI-generated content images retained for provenance.` |

**Files explicitly EXCLUDED from every commit above:**
- `docs/reports/integration/**` — Track A, do not stage, do not modify.
- `references/boost-interior/generated-candidates/` (57M rejected AI-image variants) — recommend delete/archive outside git, not commit.
- `docs/result/**/*.png,*.jpg,*.jpeg` (2.2G) — gitignored per §3.
- `data/example.com/`, `data/docs.firecrawl.dev/`, `data/tmp/source-package-diff.mjs` — stale Aug-13 debug captures, no consumer found; not present as trackable candidates once `data/*` re-include lands (still shadowed unless individually re-included, which is not recommended).
- `data/page-state-evidence/` — not present in this copy (raw-capture-adjacent); flag for human confirmation in the original repo before deciding.
- `workers/recon-runtime/.wrangler/`, `workers/recon-runtime/tmp/`, `tmp/`, `node_modules/`, `.env`, `prompt2` — correctly ignored, leave as is.

Approximate footprint if the full plan (1–9, excluding optional 10) lands: source/config ≈ 12–15M, `data/` canonical ≈ 67M (`data/sites` 6.7M + `data/site-builds` 60M + `data/template-releases` 3.2M, incl. new 1.5.1 release), `docs/result` text+logs ≈ 19M (17M + 2.1M newly-recovered logs), `workers/` ≈ 164K. Total ≈ **100–130M**, versus the 113G+2.2G+5.5G+394M present on disk unfiltered.

**Nothing has been committed.** This is a recommendation only. Committing requires the user's explicit authorization. Track A and Track B branches must **not** be merged or cherry-picked into each other before Track A completes.

## 5. Verdict

**GIT_CHECKPOINT_READY = YES-WITH-PRECONDITIONS**

Preconditions:
1. Apply the 4 `.gitignore` changes in §3 (2 carried from the prior audit, 2 new: `.wrangler/` and the `docs/result` log re-include) — none touch tracked files, all additive/ignore-only.
2. Get explicit human confirmation on `references/boost-interior/generated-approved/` (47M, UNKNOWN group) before commit 10 — likely superseded by `data/sites/boost-interior-demo/assets/`, needs a person to check, not this audit.
3. Confirm `docs/reports/integration/**` stays untouched and unstaged throughout (verified clean right now — 3 files, no Track-B file collides with that path).
4. Re-run `git status --porcelain` immediately before the actual commit sequence, since this is a live worktree with concurrent churn (239→ drift already observed since the prior audit) — do not commit against a stale status snapshot.
5. Do not merge/cherry-pick across Track A ↔ Track B until Track A completes.

No SECRET-RISK groups. One UNKNOWN group (`references/boost-interior/generated-approved/`). No blocking technical issue (no secrets, no NUL bytes, no oversized files outside the known/intentionally-excluded PNG set, no symlinks, no nested `node_modules` in any commit-candidate path).
