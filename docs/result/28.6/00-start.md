# Task 28.6 — Startup / Integrity Record

| Field | Value |
|---|---|
| Task | 28.6 — Reconstruction V1 Closure & Real-World Validation |
| Baseline SHA | `6c2e723601a0d76431c96a48bbdb4726c02063e7` |
| Branch | `main` |
| Start (UTC) | 2026-09-01T20:00:57Z |
| Start (KST) | 2026-09-02 05:00:57 |
| Git working tree | 76 modified tracked files, 114 untracked paths (unchanged from Task 28.5C close; full snapshot in `tmp/wr286/git-status-at-start.txt`) |
| Git mutating operations planned | 0 (no add/commit/push/reset/clean/stash/checkout) |
| Machine | 14 logical CPUs, 64 GB RAM, load ~5 at start, Node v22.22.3, pnpm 11.21.0, Playwright 1.62.1 (chromium-1234) |

## Accepted prior verdicts

| Task | Verdict | Evidence |
|---|---|---|
| 28.5B | WAVE 1 HARDENING ACCEPTED — READY FOR RESPONSIVE/FONT DECISION | `docs/result/handoffs/28.5B-final.json` |
| 28.5C | RESPONSIVE ROOT CAUSE KNOWN — MORE EXPERIMENT NEEDED | `docs/result/handoffs/28.5C-final.json`, `28.5C-adjudication.json` |

## Current regression baseline (from `docs/result/handoffs/28.5B-regression.json`)

- 34 suites / 3,354 checks / 0 failures / typecheck exit 0
- Per-suite counts are recorded in that file and will be diffed against every full regression in this task.
- `src/` was byte-unchanged by 28.5C (mtime-verified); 28.6 is the first task to modify the responsive engine since 28.5B.

## Root cause carried in (28.5C, accepted)

1. `hiddenRanges()` (`src/reconstruction/layout-inference.ts:661-684`) midpoint-interpolates hidden bands across the unsampled 1024–1440 probe gap → `(min-width:1024px) and (max-width:1231.98px){display:none}` ×738 (503 on /pricing); source switch is really 1025.
2. `layout-truth-check.ts` renders only at 1440 → every responsive-hidden rule ships `acceptedUnchecked`.
3. Desktop subtree frozen at 1440-resolved px; mobile subtree receives zero inferred rules (`generateLayoutCss` hardcodes `data-wr-viewport="desktop"`).
4. CORS trap: load-bearing stylesheets throw on `cssRules` (30/81 linear, 8/8 stripe) but fetch fine → `authoredLayout` on 34/3,254 linear nodes, 0/2,280 stripe.

## Program plan (this task)

A. Linear responsive closure (engine, single-writer core lanes) → full regression #1
B. 12-candidate parallel scout → select ≤6 pilots
C. Fresh-from-URL pilots in isolated lanes after core freeze
D. Ideas lane (experiments under `tmp/wr286-ideas/`)
E. Cross-site generalization + Stripe control
F. Curated human review pack (20 PNGs + 2 master contact sheets)
G. Regression #2/#3, fresh visual auditor, fresh architecture auditor, fresh adjudicator
H. Master report `docs/result/28.6-reconstruction-v1-closure-2026-09-02.md` + `docs/result/handoffs/28.6-final.json`
