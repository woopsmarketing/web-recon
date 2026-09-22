# Git Checkpoint — Working Tree Audit

Read-only investigation. Repo: `/Users/woops/projects/web-recon`. HEAD: `6c2e723 0827 morning` (3 commits total). Snapshot taken 2026-09-21; another session is concurrently cutting template release 1.5.1 / demo build and `platform/publish`+`workers/` — that churn is out of scope here.

## 1. Working tree map

### `git status --porcelain` totals
236 untracked (`??`) top-level status lines, 115 modified (`M`) top-level status lines (git collapses whole untracked directories to one line, so file counts below come from `find`, not from status line counts).

| Top-level path | Status | Notes |
|---|---|---|
| `CLAUDE.md` | `??` | **Not tracked**, despite claiming to be "checked into the codebase" |
| `docs/` | 147 `??` + 1 `M` | `M`=`docs/info/PRODUCT_VISION.md`; `docs/status/`, `docs/architecture/` fully untracked; `docs/result/` 56 distinct untracked top entries |
| `src/` | 44 `??` + 100 `M` | Pre-existing tracked tree, heavily modified + extended |
| `scripts/` | 39 `??` + 13 `M` | Same pattern |
| `platform/` | 1 `??` (whole dir) | New, 40 files, never committed |
| `templates/` | 1 `??` (whole dir) | New, 46 files, never committed |
| `references/` | 1 `??` (whole dir) | New, 128 files, never committed |
| `fixtures/` | 1 `??` (whole dir) | New, 3 files, never committed |
| `data/` | not listed | Fully covered by `.gitignore` (`data/` rule) — confirmed via `git status --ignored` → `!! data/` |
| `prompt`, `prompt2`, `.env`, `node_modules/`, `tmp/` | not listed | Correctly ignored (`git check-ignore -v` confirms each) |
| `package.json`, `README.md`, `ROADMAP.md`, `pnpm-lock.yaml`, `pnpm-workspace.yaml`, `tsconfig.json`, `.gitignore`, `.env.example` | tracked | `package.json` shows `M`; rest untouched since last commit |

### Sizes (`du -sh`)
| Path | Size |
|---|---|
| `data/` | **113G** (ignored) |
| `docs/` | 2.2G (2.2G of it is `docs/result/**/*.png`) |
| `tmp/` | 5.5G (ignored) |
| `node_modules/` | 394M (ignored) |
| `references/` | 138M (untracked) |
| `src/` | 7.8M |
| `scripts/` | 3.8M |
| `platform/` | 656K |
| `templates/` | 308K |
| `fixtures/` | 28K |
| `.git/` | 41M |

`data/*` breakdown: `stripe.com` 45G, `linear.app` 45G, plus 10 other site-observation dumps (2–4.4G each) = raw recon/observation captures. Canonical subsets are tiny by comparison: `data/site-builds/` 57M, `data/sites/` 6.7M, `data/template-releases/` 3.2M, `data/page-state-evidence/` 10M. Remainder (`data/example.com`, `data/docs.firecrawl.dev`, `data/tmp/`) is <1M stale Aug-13 test/debug output.

`docs/result/` breakdown: 2,132 PNGs (~2.2G, effectively the whole directory size), 364 `.md` + 352 `.json` = **15.5M**, 234 `.log` = 1.5M, plus a handful of `.html`/`.txt`/`.mjs`/`.tsv`/`.py`.

### `.gitignore` (current, 472 bytes)
Covers: `.env`/`.env.*` (with `.env.example` excepted), `node_modules/`, `dist/`, `*.tsbuildinfo`, **`data/`** (blanket), `test-results/`, `playwright-report/`, `playwright/.cache/`, `.cache/`, `.pnpm-store/`, `*.log`, `logs/`, `tmp/`, `*.tmp`, `.DS_Store`, `Thumbs.db`, `.claude/`, `/prompt`, `/prompt2`.

Gaps: no rule for `.next/`/`.turbo/` (not currently needed — none found nested in candidate-commit dirs, see §2), and the blanket `data/` rule pre-dates the canonical subsystems now living under `data/site-builds`, `data/sites`, `data/template-releases`, `data/page-state-evidence` — it currently hides them from git entirely, which is the main gap to fix (see §4).

## 2. Classification

| Class | Paths | Verdict |
|---|---|---|
| **(a) Source** | `src/`, `scripts/`, `platform/`, `templates/` | Commit. No nested `node_modules`/`.next`/`.turbo` found under any of these (`find` swept clean). |
| **(b) Canonical data** | `data/sites/*` (site.json/theme.json/settings.json/slots.json/content/assets), `data/site-builds/*/packages/*` (static-export `site/` + `build-record.json`, 2 packages per site = current+previous), `data/template-releases/interior-01/*` (10 immutable releases, `release.json` + `files/`) | Commit — but blocked today by the blanket `.gitignore` `data/` rule (needs negation, see §4). No nested `node_modules` inside any package/release. |
| **(c) Tests** | none found as a separate top-level dir; test code lives inside `src/`/`scripts`/`platform` (already covered under (a)) | Commit with source. |
| **(d) Docs/reports** | `docs/README.md`, `docs/info/`, `docs/status/`, `docs/architecture/`, `docs/result/**/*.{md,json,log,html,txt}` | Commit (15.5M+1.5M ≈ 17M total, trivial). |
| **(e) Generated/disposable** | `data/stripe.com`,`linear.app`,and 10 other raw site-observation dumps (113G total, already ignored); `data/example.com`, `data/docs.firecrawl.dev`, `data/tmp/source-package-diff.mjs` (stale Aug-13 debug, already ignored); `tmp/*` devroots incl. symlinked `node_modules` (already ignored); `node_modules/` (ignored); `docs/result/**/*.png` (2,132 files, ~2.2G proof screenshots) | **Not** ignored today (docs/ has no PNG rule) — this is the actual blocker to a clean `docs` commit. Recommend excluding. |
| **(f) Unknown / needs human** | `references/boost-interior/generated-candidates/` (57M, 112 rejected AI-image variants), `references/boost-interior/generated-approved/` (47M, approved-but-unoptimized AI images — may already be superseded by the optimized copies committed under `data/sites/boost-interior-demo/assets/`), `data/page-state-evidence/` (10M ad-hoc QA screenshots, unclear if still referenced by any report) | Human call — see notes below. |

Trap checks (all clean):
- **NUL bytes**: swept `.ts/.tsx/.md/.json/.yaml/.yml/.txt/.html/.css/.js` under all commit-candidate dirs (`docs src scripts platform templates references data/site-builds data/template-releases data/sites data/page-state-evidence`) with `grep -laP '\x00'` — zero hits.
- **Nested/symlinked `node_modules`**: none inside `data/` or any commit-candidate dir. `tmp/` (ignored) does have several symlinked `node_modules` inside devroots (`tmp/wrp0/pre-p0-root/*`, `tmp/wr286-ideas/*`, `tmp/wr-responsive-investigation/*`) — harmless since `tmp/` is ignored.
- **Large binaries (>5MB)**: only found under `docs/result/**/*.png` (the largest is 18M, dozens in the 5–18M range, all screenshot evidence in `docs/result/28.6/`, `28.5-visual-fidelity-evidence/`, `28.8-fast/`, `apartmentary-layout-modes/`). Zero >5MB files anywhere in `src`, `scripts`, `platform`, `templates`, `references`, `data/sites`, `data/site-builds`, `data/template-releases`, `data/page-state-evidence`.
- **Secrets**: only `./.env` (already ignored, present, not read/printed here) and `./.env.example` (template, safe to commit, already tracked). No `.env*`/`credential*`/`secret*`/`*.pem`/`*.key`/`id_rsa*` found anywhere else in the tree (excluding `node_modules`/`.git`/`tmp`/`data`), and no `.env*` found inside `templates/`, `platform/`, or any `data/site-builds|sites|template-releases` path.
- **Non-ASCII filename**: `docs/result/28-소요시간.md` (Korean filename) — quoted/octal-escaped by git status; just needs correct quoting in the commit pathspec, not a blocker.
- **Regenerable `data/` content**: `data/example.com/`, `data/docs.firecrawl.dev/` (Aug-13 firecrawl discovery smoke output) look like leftover test captures with no consumer found; safe to leave out.

## 3. Can source + canonical data + releases + tests + scripts + docs be committed cleanly?

**Yes, with two `.gitignore` fixes first.** No secrets leak, no oversized binaries, no symlinks-outside-repo, no NUL-byte corruption in anything we intend to commit. The only real blockers are that (1) canonical `data/` subpaths are currently invisible to git because of the blanket `data/` ignore rule, and (2) `docs/result/**/*.png` is not ignored and would otherwise drag ~2.2G of screenshot binaries into history. Both are `.gitignore`-only fixes, not data problems.

## 4. Recommended `.gitignore` additions

```gitignore
# canonical data lives under data/, but data/ is also the raw-crawl output dir;
# re-include the canonical subsystems explicitly
data/*
!data/sites/
!data/site-builds/
!data/template-releases/
!data/.gitkeep

# proof-artifact screenshots are regenerable QA evidence, not source-of-truth;
# keep the written reports (md/json/log/html/txt) but drop the images
docs/result/**/*.png
docs/result/**/*.jpg
docs/result/**/*.jpeg

# (optional, human call — see below) drop AI-image-generation scratch history
references/**/generated-candidates/
```

Notes:
- Changing `data/` to `data/*` + explicit `!` re-includes requires Git to be able to walk into `data/` at all — confirm with `git add -n data/sites data/site-builds data/template-releases` after the change before trusting it (not run here, this is read-only).
- `data/page-state-evidence/` (10M) and `references/boost-interior/generated-approved/` (47M) are deliberately left OUT of the re-include list — flagged as needs-human in §2/commit plan below rather than auto-included or auto-excluded.
- If `docs/result` screenshots are wanted for history later, prefer Git LFS or an external artifact store over inlining PNGs into git objects.

## 5. Recommended commit boundary

Ordered, each commit independent of ones after it. All pathspecs relative to repo root. `data/` changes assume the `.gitignore` edit in §4 lands first (as its own commit, commit 1).

**1. `.gitignore` — re-include canonical data, exclude screenshot proof artifacts**
Pathspec: `.gitignore`
```
Update .gitignore so canonical data/site-builds/data/sites/data/template-releases
are tracked despite the raw-crawl data/ blanket rule, and so docs/result screenshot
proof artifacts stay out of history.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
```

**2. Root project files (config + top-level docs + agent instructions)**
Pathspec: `CLAUDE.md package.json README.md ROADMAP.md`
```
Track CLAUDE.md and refresh root package manifest/docs to match the current
platform + template + recon-engine tree.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
```

**3. Recon engine + scripts (existing tracked tree, heavily modified/extended)**
Pathspec: `src/ scripts/`
```
Update the recon/observation/content-injection/production engine and its CLI
scripts (content injection, e2e, observer, production, recon-template, QA).

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
```

**4. Template platform + template package (new subsystems)**
Pathspec: `platform/ templates/ fixtures/`
```
Add the recon template platform (build/release/site/cli/test) and the
interior-01 Next.js template package, plus platform test fixtures.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
```

**5. Canonical data — site content/settings, site-build packages, template releases**
Pathspec: `data/sites data/site-builds data/template-releases`
```
Add canonical site content/settings/slots, current+previous site-build static
packages, and the immutable interior-01 template release history.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
```

**6. Docs and result reports (text only)**
Pathspec: `docs/README.md docs/info/ docs/status/ docs/architecture/ "docs/result/**/*.md" "docs/result/**/*.json" "docs/result/**/*.log" "docs/result/**/*.html" "docs/result/**/*.txt"` (or simply `docs/` once §4's `.gitignore` PNG/JPG excludes are in place, so a plain `git add docs/` naturally skips the images)
```
Add task/status/architecture docs and the docs/result task report corpus
(reports only; screenshot proof artifacts are gitignored, see .gitignore).

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
```

**7. (Optional, hold for human decision) Design references**
Pathspec: `references/boost-interior/project-01-white-34p references/boost-interior/generated-approved`
```
Add boost-interior design reference set and approved AI-generated content
images retained for provenance.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
```
Do NOT commit `references/boost-interior/generated-candidates/` (57M of rejected AI-image variants) — recommend deleting or archiving outside git instead.

### Paths that should NOT be committed
- `data/stripe.com/`, `data/linear.app/`, and the other 10 raw site-observation dumps (113G total) — raw recon captures, fully regenerable by re-running the observer/e2e pipeline, already covered by `data/*` + no re-include.
- `data/example.com/`, `data/docs.firecrawl.dev/`, `data/tmp/source-package-diff.mjs` — stale Aug-13 debug captures with no found consumer.
- `data/page-state-evidence/` — ad-hoc QA screenshot evidence; flag for human confirmation before deciding to track or drop.
- `tmp/` (5.5G devroots/scratch builds, several with symlinked `node_modules`), `node_modules/` (394M), `.env`, `prompt`, `prompt2` — already correctly ignored, leave as is.
- `docs/result/**/*.png` (~2.2G) and any `*.jpg`/`*.jpeg` under `docs/result/` — proof screenshots, exclude per §4.
- `references/boost-interior/generated-candidates/` — rejected AI-image generation candidates.

## 6. Sizes if the recommended plan is applied
Commits 1–4 + 6 (source/config/platform/templates/fixtures/docs-text): ≈ 12M. Commit 5 (canonical data): ≈ 67M (`data/sites` 6.7M + `data/site-builds` 57M + `data/template-releases` 3.2M). Commit 7 if taken (`references` minus `generated-candidates`): ≈ 80M. Total clean-plan footprint ≈ **80–160M**, versus 113G+2.2G+5.5G+394M if everything on disk were naively added.
