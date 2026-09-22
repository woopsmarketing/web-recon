# 03 — Reviews

Every reviewer was fresh and read-only, and none was told the desired conclusion. The main agent was the only writer.

## Phase 1 (before implementation): two reviewers

| Reviewer | Findings | Disposition |
|---|---|---|
| A (visual) | HIGH: the pill overlaps the reviews' "next" button at 1000 (depends on scroll position) | The spec keeps the pill unless a real obstruction is proven. The smoke brings every visible control to the viewport centre and hit-tests it: 21–36 per visit, **0 blocked**. The pill is kept. |
| A | HIGH: the mobile footer is dense and clipped at 390 | Fixed (A). The "clipped" part was a capture artefact (see [02](02-validation.md)). |
| A | HIGH: the first portfolio card sits at y=1125 at 1440 | Fixed (D): 876. |
| A | MEDIUM / LOW: the filter box, the banner–title relationship, the 800 footer, the reviews gap, 01/03 reading order at 600–899, uneven section gaps, card title sizes, footer clearance, pagination | Fixed (A, C, D, E). Pill size on phones: kept, since hit-tests pass. |
| B (CSS) | The footer rows are flex rows; the bar uses `visibility:hidden`; there is no `viewport-fit=cover`; CSS-only changes keep the `<main>` byte tests valid | Adopted. `viewport-fit` is an open item. B also claimed that ancestor `overflow` clips fixed descendants; that is incorrect and was not adopted (the smoke proves the containing block is the viewport). |

## Final visual / UX review (targets A–E)

The reviewer re-ran the smoke (541/541) and probed the pixels and DOM on their own.

**A: MET · B: MET · C: MET · D: MET · E: MET. No BLOCKER, HIGH or MAJOR.**

| # | Severity | Finding | Disposition |
|---|---|---|---|
| 1 | MINOR | On phones the portfolio banner is almost all scrim: the head box is 244px against a 240px banner | **Fixed.** The banner min-height is 280 below 1281px, so a band of photo shows above the fade. |
| 2 | MINOR | A fitting track's bar collapses after hydration (layout shift) | **Declined** in favour of a pinned bound (04 item 5). A CSS rule that hides by item count would duplicate the per-view layout, and a disagreement would hide the controls of a track that really scrolls. |
| 3 | MINOR | The page max-width and gutters are copied into four portfolio rules | **Fixed.** `--i1-page-max` / `--i1-gutter`, also used in the hero inset clamp. Every desktop screenshot is pixel-identical before and after. |
| 4 | NIT | The mobile footer's email value sits 2–3px further from its label | **Fixed.** A −2px block margin offsets the hit-area padding. |
| 5 | NIT | Larger card titles wrap more often on phones | Accepted (04 item 6). |
| 6 | NIT | Header "Contact" and the floating "Contact" are both on the first mobile screen | Pre-existing, accepted (04 item 7). |

## Final architecture / regression review

**(a) Forbidden modules or semantics changed: no. (b) Filter, pagination or detail behaviour changed: no.**
- All 201 HTML pages and the JS are identical to 1.3.0 after normalisation.
- sitemap and robots are raw-identical.

**(c) 1.3.0 intact: yes.**
- 196/196 release files and 2,297/2,297 site-build files match the pre-polish baseline.

**(d) Assertion weakened: no.**
- The step5 generalisation keeps the exact 1.3.0 assertions and adds 1.3.0 to the immutability set.

**(e) Scope expansion: none.** **(f) Versioning:** a patch bump fits the convention.

| # | Severity | Finding | Disposition |
|---|---|---|---|
| M1 | MINOR | `display:none` reverses the Step 5 "no layout shift" line | **Recorded.** It supersedes that line in [01](01-changes.md) C. The smoke now asserts 0 on a load from the top and ≤ 0.05 when the reviews are in view at hydration (measured 0.0156). |
| M2 | MINOR | Orphan 1.3.1 dev releases in the devroot; the test would not notice more than one 1.3.1 release | **Fixed.** R1 asserts exactly one `interior-01-1.3.1-*`. A negative control against the devroot's three releases failed as expected. The release was cut once, in the repo root, from `template:release`. |
| M3 | MINOR | The repo root was half-migrated (source 1.3.1, pins 1.3.0), so step5 B failed there | **Fixed by procedure.** Release, fixtures and three builds ran as one step, then `test:platform`. The failure itself was the intended detection. |
| N1 | NIT | polish D would fail falsely once later steps change fixture documents | **Fixed.** D is gated like the package block. |
| N2 | NIT | The package block was skipped for an older pin too | **Fixed.** It is skipped only for a pinned version ≥ 1.3.2; otherwise it fails. |
| N3 | NIT | `999px` → the pill token: a theme with a 0 pill radius now squares the hero dots and arrow | Release note in [01](01-changes.md) E. |

## Main-agent visual pass

Checked by eye: home at 390, 800, 1000, 1440 and 1920; portfolio top at 390, 800, 1000 and 1440; and the footer and CTA at the end of the page at 390, 800 and 1440. The phone banner was re-checked after fix 1.

Pixel-diff of the fix round against the previous candidate:
- every ≥ 900 capture is identical;
- mobile differs only in the footer (−4px) and the portfolio banner (+32–36px).

## Human review pack

`docs/result/recon-template-platform-step5-homepage/human-review/` has been updated:
- a **Polish changes** section in the guide;
- five before/after groups at the top of `index.html`;
- refreshed 1.3.1 candidates for home 390/800/1000/1440/1920, portfolio 390/1440 and detail 390/1440 (plus fixture-small 1440/320).

Every 1.3.0 candidate and every source reference is kept next to its 1.3.1 counterpart.
