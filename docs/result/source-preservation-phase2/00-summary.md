# Source Preservation Phase 2 — Preservation Clone

**Verdict: READY FOR HUMAN PHASE-2 VISUAL REVIEW**

Phase 2 asked one question: can source-preservation-first reproduce the source
visual layout, without reconstructing anything from measured geometry? For the
Apartmentary homepage the answer is yes.

A Preservation Clone is now built from the Phase 1 Source Package and served
over localhost. Desktop and mobile render as separate variants, each using the
source's own DOM tree, the source's own stylesheets in the source's own cascade
order, and the source's own responsive CSS. No declaration anywhere in the
clone was derived from a measured width, height or computed style.

## What was built

| | |
|---|---|
| New module | `src/preservation-clone/` (7 files) |
| New CLIs | `preserve:build`, `preserve:preview`, `preserve:sanity` |
| Artifact | `data/apartmentary.com/preservation-clones/2026-09-16T06-42-28-282Z` |
| Source run | `data/apartmentary.com/2026-09-16T05-27-10-722Z` (unmodified) |

## Headline results

| Measure | Result |
|---|---|
| Fixture smoke | **43/43 checks, 0.1s** |
| Repo typecheck | clean |
| Browser sanity (1440 / 1024 / 390) | **3/3 OK** |
| Local resource failures | **0** |
| Browser JS errors | **0** |
| Live scripts in the clone | **0** |
| Horizontal overflow | **0px** at all three widths |
| Resources localized | 97 of 99 (78 fetched, 19 preserved from Phase 1) |
| Residual still fetched from source | **1** (the 98 MB hero MP4) |
| Stylesheets preserved | 9/9 per viewport, cascade order intact |

## Style preservation, per viewport

| Representation | Desktop | Mobile |
|---|---|---|
| authored-inline | 4 | 4 |
| authored-linked | 2 | 2 |
| runtime-derived-cssom | 2 | 2 |
| unresolved | 1 | 1 |

The single `unresolved` entry (`st0008`) is an emotion global `<style>` that
held **0 rules at capture** — there is nothing to preserve, and it is recorded
rather than quietly dropped. The two `runtime-derived-cssom` entries differ
between viewports (desktop 23,857 / 11,117 bytes; 2,672 / 2,612 bytes), which is
exactly why the two variants are never merged.

## Honest limitations

- The clone is markup + CSS. Carousels, menus and modals are inert: source JS is
  preserved as bytes (38 files, 1.2 MB under `scripts/`) but never executed.
- The clone is **not** source-independent: the 98 MB hero video still streams
  from S3 so a human can see it during review. That is recorded, not hidden.
- Analytics is neutralized, not reproduced: a Facebook pixel and a Google Tag
  Manager frame — both hidden inside `<noscript>` — are inert in the clone.

## Independent review

A fresh-context reviewer found **1 BLOCKER and 2 MAJOR** issues. All three are
fixed and covered by new smoke checks; four of the five MINOR findings were
fixed as well, one is documented as a known limitation. Details in
`06-independent-review.md`.

## Reports

| File | Contents |
|---|---|
| `01-recon-and-design.md` | what already existed, what was reused |
| `02-preservation-clone-architecture.md` | the design and why |
| `03-implementation.md` | modules, data flow, decisions |
| `04-apartmentary-build.md` | the one real build, in numbers |
| `05-smoke.md` | the 37 fixture checks |
| `06-independent-review.md` | fresh-context review findings |
| `07-human-review-guide.md` | **start here to review by eye** |
| `08-phase3-handoff.md` | what Phase 3 inherits |
