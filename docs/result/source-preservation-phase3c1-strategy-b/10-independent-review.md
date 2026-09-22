# 10 — Independent review

- **Reviewer:** one fresh-context, read-only, strong model (Opus).
- **Given:** the causal question, the checklist from prompt §31, and the paths to the harness, both artifacts and the
  Phase 1/2 inputs.
- **Not given:** any expected verdict. `strategy-b-result.json` had `verdict: null`, and the reviewer was told not to
  rely on report files.
- The reviewer modified no files.

**Reviewer's independent verdict: `HYDRATION_BASE_MISMATCH_CONFIRMED`**, scoped to this footer, this build and one run
per strategy at 1440 plus one resize to 390.

**Counts: BLOCKER 0 · MAJOR 0 · MINOR 5 · NOTE 6.** No harness defect invalidates the comparison, so there was no rerun.

## Findings and dispositions

| # | sev | finding | disposition |
|---|---|---|---|
| 1 | MINOR | Not a pure one-factor design. D2/D3/D8 co-vary with the hydration document: A has 11 sheets vs 8, 3 extra Phase 2 tags, and inline font style text of a different length. The mitigation is the identical 100 px rule plus identity evidence (FAILED vs SURVIVED at commit with the same instrument) | **Report wording fixed** (`03`: "not a one-variable experiment", no A-head/B-body arm). `00` does not say "sole variable" |
| 2 | MINOR | D4/D6 prepare-time descriptions do not match the run: mirror 0 fulfilled; polyfills is nomodule + neutralized, 0 requests, no 404 | **Report wording fixed** (`03` correction paragraph; `02`/`04`/`09` already state 0 mirror use). Artifact JSON left unmodified |
| 3 | MINOR | "Reused libs unchanged since 3C" is proven by mtime only; no 3C-era artifact records lib hashes | **Report wording fixed** (`03`: weak proof). Recommendation carried to `12`: record lib sha256 in manifests |
| 4 | MINOR | Immutability evidence covers the 13 listed dirs, from prepare start to run end only. It does not cover the 3C.1 harness (run.mjs edited between attempts), the gate-blocked dir, or post-run check writes | **Report wording fixed** (`09` scope paragraph) |
| 5 | MINOR | B2 is not provably the *first* microtask: the 3B.1 wrapper queues one earlier. Ordering evidence: B1 437.1 → `track` 441.8 → B2 451.0 ms | **Report wording fixed** (`01`, `05`: "a microtask queued inside B1, after the hydrate call") |
| 6 | NOTE | The gate change after `…14-28-51-591Z` is acceptable: the runtime never ran, the old check was a false positive, and no forcing code exists anywhere in the harness | documented (`03` D9, `04`) |
| 7 | NOTE | B1 is not pure hydration; the lifecycle probe forces layout in the commit and has no A counterpart. The comparable instrument (the 3B.1 snapshot) exists in both | already labelled (`01`, `05`) |
| 8 | NOTE | Why A's class went stale (React 17 does not patch attributes during production hydration) is still inferred. B never exercises that step | **added to `00` limits.** Not claimed as proven |
| 9 | NOTE | Provenance, source-JS identity, fixtures/stubs/images, network, tracker inertness, source-created Swipers and the lib genericity grep all independently verified clean | — |
| 10 | NOTE | Identity claims independently verified: B0 = B1 (4 original nodes); B2/B3 content wrapper = original #2, 96/96 original descendants, flex-grow 1, 908 px, #3 empty 100 px; B4 original #2 350 px with a new 60 px box; A had the columns under `v7v99c` | — |
| 11 | NOTE | Scope limits: one run per arm; B4 follows the autoplay wait + click (same as A); `check-result.mjs` hard-codes site values (harness, not lib) | stated in `00` / `12` |

## What the verdict wording must NOT claim (reviewer) → where honoured

- that the hydration base was the *sole* difference → `00`, `03`;
- that React 17's attribute-not-patched step was proven → `00` limits;
- that Strategy B fixes other components or explains 3B.1's unattributed replacements → `00`, `12`;
- that the result holds across repeated runs, other widths or the live site → `00` limits;
- that B1 is pure hydration → `01`, `05`;
- that fonts went through the local mirror → `02`, `03`, `04`, `09`;
- production or preservation readiness → `00`, `12`.
