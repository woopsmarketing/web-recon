# Task 28.8 FAST — 05 Final report (comprehensive)

Date: 2026-09-08 (UTC). Program: `prompt` — FAST RECONSTRUCTION V1 FINISH + TWO-SITE REAL-WORLD VALIDATION.
Small per-unit reports: `00-core-finish.md`, `01-channel.md`, `02-roseeskin.md`, `03-cross-site.md`, `04-regression.md`.
Machine handoff: `docs/result/handoffs/28.8-fast-final.json`. Human review pack: `docs/result/28.8-fast/human-review/index.html`.

## 1. Final verdict

**READY FOR HUMAN RECONSTRUCTION ACCEPTANCE** — `humanAcceptanceRequired: true`.

- Channel Talk (`https://channel.io/kr`): **READY FOR HUMAN REVIEW** — 0 BLOCKER / 2 MAJOR / 6 MINOR on 8 truth-width pairs; safety widths readable (1024 / 1100 with horizontal scroll); the animation gap is declared as an ADVANCED SOURCE LIMITATION.
- RoseeSkin (`https://beomeo.roseeskin.com/`, priority site): **READY FOR HUMAN REVIEW** — 1 BLOCKER (DOM-only, block identical on both sides) / 1 MAJOR / 7 MINOR / 1 PASS on 10 pairs; four of five deep routes visually equivalent at both widths; all safety widths SAFE.
- Regression: 36 suites enumerated (35 with assertions), 4,778 checks, 0 failures, 0 crashes after one solo rerun, typecheck 0, no negative suite delta.
- No generic product blocker remains that a machine can name; what remains is human judgement on two visible desktop-home defects (RoseeSkin footer band + hero photo) and one image-paint MAJOR (Channel Talk product page).

If accepted → `RECONSTRUCTION V1 CLOSED -> SLOT NEUTRALITY`. If rejected → `ONLY HUMAN-SELECTED OR CLEAR GENERIC BLOCKER CORRECTION`.

## 2. Core V1 finish (Phases A–D) — what changed, in one table

| workstream | change | evidence |
|---|---|---|
| A · responsive | fixed product switch: mobile tree ≤ 800 px, desktop tree ≥ 801 px (`V1_RESPONSIVE_POLICY`, provenance `product-policy`); authored inference kept as evidence only | served 801 on all 5 rebuilt sites; the 700 px "wrong tree" defect gone |
| A · authored intent | `authored-inline-size` rule kind ships source `width:100%` / `max-width` / `min-width` / `margin:auto` relations, truth-checked; A2b resolves `var()` against the clone's own emitted custom properties | linear 983 → 1,017 rules, unresolved-var refusals 413 → 108; channel 259, roseeskin 311, hobbang 122 → 155 |
| B · CJK | frozen text boxes get `min-height` instead of `height` and drop shrink-to-fit `width` (`wr-tx` / `wr-sf`); fonts stay an accepted difference | hobbang footer @390 and seoultone 진료시간 @1440 readable; 5,578 / 2,757 relief nodes on the fresh sites, no collision seen |
| C · QA honesty | seoultone @1440 blank-region negative case, BLOCKER needs corroboration, critical text-collision channel, screenshot-diff uncompared band counted | rubric 7 (→ 8 in Phase F) |
| D · sanity | linear /pricing 390 + 1440 MINOR, linear / @1024 not catastrophic, both CJK canaries readable → `CORE V1 FINISH SANITY COMPLETE`, `STARTING TWO-SITE VALIDATION` | 00-core-finish.md §6 |

## 3. Two-site validation (Phase E) — results

| | Channel Talk | RoseeSkin |
|---|---|---|
| discovery | 60 mapped / 59 verified / 31 families (127 s) | 41 / 40 / 22 (119 s) |
| deep budget | HOME + pricing + product + blog article (+1 sample) | HOME + 진료시간 + 기미·색소 hub + 인바이론 detail + 의료진 (+1 sample) |
| capture | 348 s, once | 542 s (third attempt; two lost with the orchestrator process) |
| reconstruction | 62 s after correction 1 | 272 s, first time |
| 390 / 1440 QA | 0 B / 2 M / 6 m | 1 B / 1 M / 7 m / 1 PASS (rubric 8; 9 B before correction 2) |
| 700 / 800 / 1024 / 1100 | SAFE / SAFE / usable+scroll / usable+scroll | SAFE ×4 |
| content loss | live counter only; +5 / +10 images not painted on one page | desktop home: footer band + hero photo |
| CJK | clean | clean (incl. 진료시간 table, popup card) |
| popups | announcement bar kept both sides | entry popup kept both sides, same state |
| verdict | READY FOR HUMAN REVIEW | READY FOR HUMAN REVIEW |

Repeated posts / treatment pages were NOT deep-cloned (one representative + one validation sample each); 44 + 23 routes outside
the deep budget are recorded in `selection-trim.json` files and reports, not in the SiteSpecs.

## 4. Shared-core corrections during fresh validation (Phase F — exactly two, both generic, zero hostname logic)

1. **Parser-unstable SPA DOM edges are demoted, not refused** (`src/reconstruction/nesting.ts` + counters/manifest/validation):
   nested `<a>` / `<button>` / `<nobr>` / `<form>` → `span` / `div` in place, `<div>` in `<p>` re-tags the open `<p>`; new
   `nestingDemotions` counter and `parser-invalid-nesting-demoted` limitation. Suites 247/247 + 512/512; hobbang control unchanged.
2. **`<noscript>` / `<script>` / `<style>` / `<template>` text is never visible text** (`src/responsive-qa/probe.ts`, `capture.ts`,
   `RUBRIC_VERSION` 8): removed a 40–60 % phantom "missing text" on every RoseeSkin pair; Channel Talk control numerically unchanged.

Tooling-only additions: deep-budget input scoping (`scope-inputs.mjs`), `--max-validation-samples` CLI plumbing, detached job launcher.

## 5. Regression (Phase I)

36 suites enumerated (35 with assertions) · **4,778 checks · 0 failures** · typecheck 0 · no negative suite delta (baseline 35 / 4,663 / 0). One crash in the
parallel run (`editor-integration`, Playwright 120 s timeout under load) → solo rerun 45/45 in 24 s → HARNESS ISSUE. Details: 04-regression.md.

## 6. Timing

| stage | Channel Talk (s) | RoseeSkin (s) |
|---|---:|---:|
| preflight | 2 | 2 |
| discovery (map · verify · select) | 127 | 119 |
| observation | 348 | 542 (+ ~840 lost in two dead attempts) |
| interactions | 91 | 37 |
| SiteSpec | 3 | 5 |
| reconstruction | 62 | 272 |
| QA 390 / 1440 + self-check | 342 | 633 (rubric 7) / 753 (rubric 8 rerun) |
| clone safety | 29 | 55 |
| review pack (both sites) | 40 | — |
| **pipeline total** | **1,004** | **1,665** |

Core finish machine runs: sanity canary 372 s, A2b 328 s, hobbang controls 168 s. Regression 2,005 s + 24 s rerun.
Wall clock from the first discovery run (13:12 UTC) to this report: see `timingSeconds.total` in the handoff.
Top three slowest operations overall: full regression 2,005 s, RoseeSkin QA 753 s, RoseeSkin observation 542 s.

## 7. Human review (Phase H)

`docs/result/28.8-fast/human-review/index.html` — 10 SOURCE | FINAL composites (Channel Talk: home 390 / 1440, pricing 390 / 1440,
alf-customer 1440; RoseeSkin: home 390 / 1440, 진료시간 390 / 1440, 인바이론 1440), each labelled site / route / width / machine grade /
run id, with the judging checklist (similarity, header/nav, hero, content, mobile and desktop usability, internal layout, images,
footer, Korean readability; ignore 1–2 px, fonts, line breaks, animation timing) and the two capture facts a reviewer must know
(channel.io's scroll-reveal blank middle on BOTH sides; RoseeSkin's kept popup and the identical wood-texture block).

## 8. Remaining risks and named limitations (carried, not hidden)

1. Frozen desktop canvas at 1024 / 1100 on authored-pixel sites (Linear, Channel Talk) — A9 ancestor-chain residual; horizontal scroll, not clipping.
2. Images that fail to paint in the clone (Channel Talk `/kr/alf-customer`, +5 / +10) — srcset / lazy descriptor pipeline.
3. RoseeSkin desktop home: footer band and hero background photo not painted — not diagnosed to file:line in this wave.
4. RoseeSkin home @390 `blank-region-ratio` BLOCKER on an identical block — candidate false positive of the region channel; recorded as a negative case for the next rubric.
5. Scroll-reveal / dynamic sections are blank in BOTH captures (Channel Talk) — parity with the capture, not with a scrolling human.
6. No `@font-face` emission (accepted difference); `smoke-visual-editor.ts` asserts a stored 915 px breakpoint; `layout-inference.ts` was prettier-reformatted by an agent; text-collision thresholds still unmeasured on a colliding live site.
7. The orchestrating Claude Code process died twice mid-wave and took its background children with it — long jobs now run in their own session; the user later reported the session hit its usage cap at those times — the exits were the usage limit, not the machine.

## 9. Artifact index

- Reports: `docs/result/28.8-fast/00-core-finish.md` … `05-final.md`; handoff `docs/result/handoffs/28.8-fast-final.json`.
- Channel Talk: discovery `data/channel.io/2026-09-08T13-12-19-052Z`, OBS `site-observations/2026-09-08T14-12-04-717Z`, SPEC `site-specs/2026-09-08T16-33-17-049Z`, REC `reconstructions/2026-09-08T16-47-36-107Z`, QA `responsive-qa/2026-09-08T16-48-41-104Z` (+ control `2026-09-08T18-54-21-769Z`), safety `tmp/wr288f/sites/channel.io/clone-safety-164734/`.
- RoseeSkin: discovery `data/beomeo.roseeskin.com/2026-09-08T13-12-17-765Z`, OBS `site-observations/2026-09-08T16-44-02-947Z`, SPEC `site-specs/2026-09-08T16-53-43-839Z`, REC `reconstructions/2026-09-08T16-54-23-114Z`, QA `responsive-qa/2026-09-08T18-54-21-770Z` (rubric 8; rubric-7 run `2026-09-08T16-58-53-645Z`), safety `tmp/wr288f/sites/beomeo.roseeskin.com/clone-safety-165420/`.
- Canary controls: linear REC `2026-09-08T16-29-06-610Z`, hobbang REC `2026-09-08T16-48-42-950Z`, seoultone REC `2026-09-08T14-14-06-641Z`.
- Regression: `tmp/wr288f/regression/index.tsv` + per-suite logs; tooling `tmp/wr288f/orch/`.
