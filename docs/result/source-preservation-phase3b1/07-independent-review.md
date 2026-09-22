# 07 — Independent review and dispositions

One fresh-context, **read-only** reviewer ran on a strong model. It was given the harness, the
artifact, the parent run, the preserved source scripts and draft reports 00–06 and 08, and was
asked the neutral §26 question. It did not rerun the experiment, did not use a browser or the
network, and modified nothing (scratch scripts only). It checked load-bearing claims against
raw logs, source bytes at the cited offsets, DOM files and fresh tree hashes.

**Result: 0 BLOCKER · 0 MAJOR · 3 MINOR · 3 NOTE.** The reviewer independently confirmed the
verdict **BOOT PROVEN — READY TO DESIGN PHASE 3C DATA REPLAY**.

## Findings and dispositions

| # | finding | verified by orchestrator | disposition |
|---|---|---|---|
| m1 | The commit point was mis-cited as `Q` @17473, which is actually Next's Head/`callback` component. The hydration callback `ne` runs in Root `ae` @18514, wired @20645 `t(ee?ne:re)` → hydrate. The conclusion holds: Root is outermost, so all descendant layout effects have already run | **yes**: bytes at @18514 are `function ae(e){var t=e.callbacks…useLayoutEffect`; @20645 matches | **Corrected** in `experiment-config.json` (`measureEvidence`) and `04` |
| m2 | `MIXED` overrides a pre-set rule. Non-data identity is also mostly lost (60/215 ≈ 28%). "At most 156" is actually exact. Only ≈42 replacements are attributable to the media-query re-render, and `08` #3 over-attributed the rest | accepted (the arithmetic comes from the recorded diffs) | **Corrected**: `04` now leads with "automatic FAILED on node identity; content restored"; "exactly 156"; the unattributed remainder is stated; `08` #3 is reclassified; `adjudicate.mjs` wording and field name updated |
| m3 | "Neither depends on the pre-existing DOM" is too strong. Hydration mismatch depends on the hydrated DOM, and `dom-after.html` has duplicated client emotion style tags | **yes**: `<style data-emotion="css">` and `"css-global"`, 1 each before, 2 each after | **Corrected** in `08`, `00` Q17 and `strategyBFallbackWhy`: B is not needed for boot, but whether #2/#3 are artefacts of Strategy A remains open |
| n4 | There are two stray "0" text nodes, not one, and they account for 522 − 520. The empty-stub DOM is not a fidelity reference | accepted | **Corrected** in `04` and `00` |
| n5 | `check-result` `parent.untouched` checks only that the parent exists | accepted | Recorded in `06`. The reviewer confirmed every parent file predates 3B.1. Future runs should hash the parent tree. Not a result-invalidating defect |
| n6 | Timing reading (commit point 720.3 → `track` 722.9 → microtask 731.4; stand-in calls 0 → 1; 0 changes from microtask to settle) is consistent | — | no change |

## Rerun decision

**No rerun.** There was no BLOCKER. All findings concern wording, a citation, or the strength
of the Strategy B conclusion. None changes what the run observed. The §7 second run was not
triggered, because no new external-global blocker appeared.

## Claims the reviewer verified as correct

- **Source JS:** 9 replay scripts served 200 with sha256 equal to the graph; `index.html`
  byte-identical to the parent's.
- **Baselines:** Phase 2 clone `cfd97f47…` and Phase 1 run `e13a81f3…` were rehashed and match
  `baseline-before.json`.
- **Stand-in:**
  - it records only path, count, types and timestamps, and returns `undefined`;
  - it contains no network, timer, DOM or storage API and refuses to overwrite an existing
    global;
  - no site tokens appear in either `lib/`;
  - it was installed at `loading` with 0 scripts present;
  - `karrotPixel` is referenced only in sc0013, sc0014 and sc0025, at the cited offsets.
- **Execution:** every tracker, widget and vendor script is `text/plain`; only the 9 activated
  scripts (plus the `__NEXT_DATA__` JSON block) are executable.
- **Network:**
  - the only non-local requests were the 4 stubbed API calls and 1 blocked MP4;
  - 0 WebSockets, 0 `_error` requests, 0 local 404s outside preflight;
  - `escapedOutbound` is empty.
- **Errors and mount:**
  - the console holds 1 entry, the blocked media;
  - `fatalErrors` is empty;
  - `STAYED_MOUNTED` evidence holds (213 → 192, React container and router present, 89
    mutations in the root).
- **Data attribution:** recomputed independently as 115 + 238 + 20 + 72 = 445 elements and
  1,249 chars, non-overlapping; non-data text before boot matches the settled text except for
  the two "0" nodes.
- **Stub shape:** main-banner `t = body.data` (sc0028) → `{"data":[]}` is correct.
