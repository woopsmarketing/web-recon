# Task 28.6 — human review pack (all 7 pilot sites)

## Open it

```
open /Users/woops/projects/web-recon/docs/result/28.6/final-human-review/index.html
```

It is a single self-contained static page — no server, no CDN, no network. All 338 screenshots are
local files under `<slug>/shots/`.

## What you are judging

For every route × width pair: **left pane is the real site, right pane is the reconstruction**, both
captured at the same width under the same capture policy (animations disabled, videos paused,
reduced motion, fixed locale/timezone/colour-scheme, DPR pinned). The two panes scroll
independently. The `diff` and `composite` buttons swap the right pane.

The question this pack exists to answer is the program's own quality bar: **is this ~95% human
visual equivalence at practical widths?** That is your call, not the grader's.

The machine grade printed next to each pair is the responsive-QA rubric verdict. Treat it as a
pointer, not a conclusion:

- a pair can be **BLOCKER on a channel you would call cosmetic** (e.g. `pixel-residual-difference-ratio`
  firing on antialiasing along source edges);
- a pair can be **MINOR and still look wrong**, because no channel covers what your eye caught.

If your eye and the grade disagree, your eye is the finding — that is a defect in the instrument and
it should be recorded as one.

## The adjudicated number

**71 of 86 pairs grade strictly worse than the instrument's own floor for that exact route and width.**

| | pairs |
|---|---|
| clone grade WORSE than the self-check floor — genuine reconstruction defect | **71** |
| clone grade AT or BELOW its floor — not attributable to the clone, read as noise | 9 |
| no floor captured for that pair (interiorteacher 1300/1680/1920 probe) — unadjudicated | 6 |
| total | 86 |

Both categories are labelled inline on every pair in the page, so you never have to hold this table
in your head while looking. The conclusion it supports: the failures you are about to see are
overwhelmingly real, not measurement artefacts.

## Honest limitations of this evidence

1. **Self-check floor.** The `self-check floor` column measures the source against a second capture
   of *itself* through the identical pipeline. A site whose floor is not all-PASS carries measurement
   noise of its own, and there a grade cannot cleanly separate a clone defect from capture noise:

   | site | floor | reading |
   |---|---|---|
   | www.xn--ok0b408a79cba430b.net | 10/10 PASS | every clone grade is a genuine clone defect |
   | interiorteacher.com | 10/10 PASS | same |
   | hobbang.net | 8 PASS / 2 MINOR | near-clean |
   | gs.severance.healthcare | 6 PASS / 3 MAJOR / 1 BLOCKER | noisy — read grades with suspicion |
   | interiorbay.co.kr | 6 PASS / 3 MAJOR / 1 MINOR | noisy |
   | seoultone.kr | 3 PASS / 6 MINOR / 1 MAJOR | noisy |
   | linear.app | 11 PASS / 7 MINOR / 2 BLOCKER | mixed |

   The floors are the newest self-check run per site and were captured in Wave 7 (pre-O3.1). They
   are a property of the SOURCE and the instrument, not of the clone, so the fix does not move them.

2. **PASS is rare by construction.** PASS is awarded only when *no* channel fires at all. 0 of 86
   clone pairs reach it. The self-check floors show PASS is reachable for the instrument on most of
   these sites, so this is a statement about the clones, not only about the rubric.

3. **Which run each pair comes from.** Per site, clone runs are walked newest-first and each
   (route, width) pair is taken the first time it is seen. The exact run ids feeding each site are
   printed in that site's header band. Four sites (linear, seoultone, wix-idn, interiorteacher) show
   **post-fix** runs; hobbang, severance and interiorbay show their Wave 7 runs and are tagged as such
   — they were never hit by the probe-width eviction regression, so re-running them would change
   nothing.

4. **Lazy content and scroll dwell.** The source is captured live and reveals content during scroll
   dwell that a static clone cannot match. Part of every `missing-text-ratio` finding is this, not a
   reconstruction defect. The per-run `limitations` block in each `responsive-qa.json` quantifies it.

5. **Two sites are shown with route-split runs** (interiorbay: one run per route; interiorteacher: a
   second run at 1300/1680/1920 to reach the desktop tree). Both are merged here, with no pair
   dropped and no pair counted twice.

## Provenance

Regenerate with `python3 tmp/wr286/orch/build-review-pack.py`. It reads only
`data/<host>/responsive-qa/*/responsive-qa.json` and copies the images those artifacts name. If a
site has no graded run, the page says so in that site's section rather than omitting the site.
