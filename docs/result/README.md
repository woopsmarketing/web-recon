# docs/result — evidence index

Navigation only. Nothing here was moved or renamed; reports are historical evidence and are not rewritten.
Current decisions live in [`../architecture/runtime-preservation.md`](../architecture/runtime-preservation.md),
[`../architecture/recon-template-platform.md`](../architecture/recon-template-platform.md) and [`../status/source-preservation-v2.md`](../status/source-preservation-v2.md). **Check those before
reusing any decision found below.** Do not read this directory sequentially. Open one directory and start at its
`00-summary.md` / `00-종합보고서.md` / `README.md`.

## A. Current — Source Preservation V2

| Directory | Contents | Status |
|---|---|---|
| `source-preservation-phase1/` | Source Package Capture (`--source-package`) | PASS / FROZEN |
| `source-preservation-phase2/` | Static Preservation Clone (`src/preservation-clone/`, screenshots) | HUMAN PASS / FROZEN |
| `source-preservation-phase3a/` | JS runtime forensic, dependency graph (`runtime-graph.json`) | PASS |
| `source-preservation-phase3b/` | Strategy A boot over Phase 2 DOM (`_app` tracker crash) | SUPERSEDED |
| `source-preservation-phase3b1/` | Boot rerun with inert `karrotPixel` stand-in | PASS |
| `source-preservation-phase3c/` | Synthetic data replay + footer forensic (`data-contract.json`, `synthetic-fixtures.json`) | PASS |
| **`source-preservation-phase3c1-strategy-b/`** | Strategy B: hydrate the captured initial response (`strategy-b-result.json`) | **ACCEPTED evidence / FROZEN** |
| `source-preservation-phase3c1-live-qa/` | Human live-QA launcher notes for the Strategy B run | supporting (human QA) |
| `source-preservation-phase3c1-visual-qa/` | Human screenshot-comparison viewer notes | supporting (human QA) |
| `source-preservation-intro-media-forensic/` | Intro video remote-S3 dependency (`repro/`) | known debt, DEFERRED |

## A2. Recon Template Platform architecture

| Directory | Contents | Status |
|---|---|---|
| `recon-template-platform-architecture-study/` | Proposal `00`–`16` (design reasoning/evidence) | historical proposal; superseded where it differs from `architecture/recon-template-platform.md` |
| **`recon-template-platform-architecture-acceptance/`** | Acceptance record + modifications + next sequence | **ACCEPTED WITH MODIFICATIONS** |
| `apartmentary-comprehensive-observation/` | Step 2 observation pass: route/nav map, page families, public JSON contracts, responsive/interaction evidence, list/detail faithful clones (`00`–`12`) | COMPLETE (named non-blocking exceptions) |
| `static-deployment-foundation/` | Track B: interior-01 1.5.1, `site:publish`, `workers/recon-runtime`, local R2 e2e, live deploy plan, independent review (`00`–`09`; `_session1/` = first-session records) | LOCAL PASS, not deployed (2026-09-21; addendum §13 2026-09-22) |
| **`foundation-consolidation/`** | One authoritative worktree: tree comparison, source map, `.gitignore` + checkpoint prep, full local re-verification, known next items (`00`–`05`). Track A's contract candidate lives in `../reports/integration/` | **COMPLETE (2026-09-22), uncommitted** |

## B. Earlier reconstruction work (Tasks 01–29.1)

Historical evidence from the observation → SiteSpec → reconstruction → template → production pipeline.
Not declared obsolete here. Consult current architecture/status before reusing their decisions.

| Range | Files / directories |
|---|---|
| 01–12 Observation, discovery, page families, interactions | `01-…` through `12-…` `*.md` |
| 13–17.1 SiteSpec, Next.js reconstruction, QA loop, exact reconstruction | `13-…`, `13.1-…`, `14-…`, `15-…`, `16-…` (3 files), `17-…`, `17.1-…` |
| 18–24 Template/slots, content injection, theme, SEO, assets, production build, MVP | `18-…` through `24-mvp-final-acceptance-2026-08-19.md`, `OVERNIGHT-MVP-COMPLETION-2026-08-19.md` |
| 25–27 Release orchestrator, Linear pilot, authoring | `25-…`, `26-…` / `26A-…` / `26B-…` / `26C-…` / `26-LINEAR-PILOT-SUMMARY-…`, `27-…`, `pre-overnight-architecture-audit-2026-08-26.md` |
| 28–28.8 Visual workflow and Reconstruction V1 closure | `28-visual-production-workflow-…`, `28-소요시간.md`; 28.5: `28.5-visual-reconstruction-root-cause-…`, `28.5-visual-fidelity-evidence/`; 28.5B: `28.5B-generic-fidelity-hardening-wave1-…`, `28.5B-attribution/`, `28.5B-review-pack/`; 28.5C: `28.5C-responsive-root-cause-decision-…`, `28.5C-responsive-review/`; `28.6-reconstruction-v1-closure-…` + `28.6/`; `28.7-reconstruction-core-correction-…` + `28.7/`; `28.75/`; `28.8-reconstruction-v1-final-closure-…` + `28.8/`, `28.8-fast/` |
| 29–29.1 Slotized template, site identity | `29-slotized-template/`, `29.1-site-identity/` |

## C. Supplemental responsive / Apartmentary forensic work

Supporting evidence that led to Source Preservation V2 (pre-preservation reconstruction path).

| Directory / file | Contents |
|---|---|
| `responsive-architecture-forensic-audit-2026-09-14.md`, `responsive-architecture-audit/` | Responsive architecture audit (never source-first) |
| `responsive-core-p0/` | Responsive Core P0 (`00-종합보고서.md`) |
| `responsive-forensic-v2/` | Split-brain forensic, architecture recommendation (`00-종합보고서.md`) |
| `apartmentary-fluid-desktop-2026-09-14.md`, `apartmentary-fluid-desktop/` | Apartmentary fluid desktop root cause / fix |
| `apartmentary-layout-modes-2026-09-14.md`, `apartmentary-layout-modes/` | Wide-desktop layout modes, source/clone geometry tools |

## D. Handoffs

| Location | Contents |
|---|---|
| `handoffs/` | Machine-readable JSON handoff/verification/final records for Tasks 21–29 (e.g. `21-handoff.json`, `25-final.json`, `28.8-fast-final.json`, `29-slotized-template-final.json`, `pre-overnight-audit.json`) plus regression-log and verification-screen subdirectories |
| `source-preservation-phase1/07-phase2-handoff.md` | Phase 1 → 2 handoff |
| `source-preservation-phase2/08-phase3-handoff.md` | Phase 2 → 3 handoff |
| `source-preservation-phase3b/07-phase3c-handoff.md` | Phase 3B → 3C handoff |
| `source-preservation-phase3b1/08-next-step.md`, `source-preservation-phase3c/09-next-step.md`, `source-preservation-phase3c1-strategy-b/12-next-step.md` | Next-step notes (historical; current next step is in status) |
