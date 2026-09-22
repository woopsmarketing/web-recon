# Task 28.7 — 05 Conditional Responsive Variant Decision (Program E)

The brief made Programs 26 (per-route tree switch) and 27 (mobile probe envelope) **conditional**:
implement them only if a fresh re-observation and reconstruction still proves the wrong DOM variant is
being served. This report records that gate and its outcome.

---

## THE GATE, RUN FRESH

Site: linear.app. Fresh observation `2026-09-04T15-48-30-262Z` → site-spec → reconstruction
`2026-09-04T15-51-59-065Z` → responsive QA `2026-09-04T15-52-40-935Z`, routes `/` and `/pricing`, at
390 / 700 / 1024 / 1100 / 1440, rubric 4, with a freshly measured self-check floor.

### The deciding measurement — linear `/`

| width | SOURCE vis / chars / imgs / scrollH | CLONE vis / chars / imgs / scrollH |
|---|---|---|
| 390 | 969 / 3,366 / 93 / 5,876 | 1,008 / 3,571 / 96 / 5,876 |
| 700 | 2,860 / 7,363 / 253 / 9,587 | **1,001 / 3,523 / 96 / 5,876** |
| 1024 | 3,080 / 8,586 / 248 / 10,131 | **991 / 3,513 / 95 / 5,876** |
| 1100 | 3,087 / 8,975 / 250 / 9,710 | 3,047 / 8,549 / 249 / 9,960 |
| 1440 | 3,094 / 9,205 / 249 / 9,960 | 3,060 / 8,760 / 249 / 9,960 |

**The clone's `scrollHeight` is byte-identical at 390 / 700 / 1024 (5,876) and again at 1100 / 1440
(9,960) — two states, no continuum — while the source varies continuously.** At 700 and 1024 the clone
is serving the 390 px mobile snapshot. This is the 28.6 A12 signature, unchanged, on a fresh run of
today's engine.

### The graded consequence

| pair | verdict | leading findings |
|---|---|---|
| `/`@700 | BLOCKER | `image-presence-ratio 0.379`, `missing-text-ratio 0.491`, `visible-text-ratio 0.478` |
| `/`@1024 | BLOCKER | the same three, plus `nav-link-ratio 0.500` |
| `/pricing`@1024 | BLOCKER | `nav-link-ratio 0.500`, `column-container-mode-delta 2`, `column-mode-delta 5` |

**3 of the 10 canary pairs.** Per-route disagreement is measured and reproduces: `/` changes DOM
family between 390 and 700; `/pricing` changes between 1024 and 1100. **No single site-wide breakpoint
can serve both.**

`nav-link-ratio` is explicitly NOT the defect and was not touched: it already exempts a source that
has itself collapsed (`NAV_LINK_MIN_SOURCE_LINKS = 3`), and here the source shows 6 links, so it
fires correctly. Fixing the channel would be treating the symptom.

## DECISION

# Programs 26 and 27 ARE REQUIRED — gate condition met, both commissioned.

- **§26 per-route tree switch** — because the routes measurably disagree about where the switch
  belongs, and one number cannot serve both.
- **§27 mobile probe envelope** — because the mobile tree is what actually renders up to the switch,
  the mobile probe ceiling is a frozen 914 (`src/observer/types.ts:1837-1839`), and today's canary
  shows the mobile tree active at 1024. The band 915–1024 has no width evidence at all, so every rule
  the mobile variant ships in that band is inferred from widths where that variant is not what renders.
  §27 is implemented from **source-authored** media conditions, never by raising the constant on
  foreknowledge — 28.6 rejected that as a guess and this task keeps that judgement.

## WHAT WAS EXPLICITLY NOT CHANGED

- `rankTreeSwitchCandidates`' ranking heuristics. 28.6 established the ranker is not the defect; the
  change is to the GRAIN (site → route), not the ranking.
- Any QA channel. The instrument is reporting this correctly.
- The number of DOM trees. Only two exist (observed at 390 and 1440). Per-route switching moves WHERE
  the swap happens; it cannot invent a third variant, and the implementation is required to record
  `variant-tree-not-observed-at-<width>` rather than silently serving the 390 tree at a width neither
  observed tree covers.

## THE OTHER DEFECT CLASS THIS CANARY ISOLATED

The remaining linear BLOCKERs are not variant-switching at all — they are the A9 residual frozen
width, now visible as a specific, named symptom:

| pair | verdict | leading findings |
|---|---|---|
| `/`@1100 | BLOCKER | `footer-clipped 1.000`, `offscreen-text-excess-chars 726` |
| `/pricing`@1100 | BLOCKER | `footer-clipped 1.000`, `offscreen-text-excess-chars 175` |
| `/`@390 | BLOCKER | `offscreen-text-excess-chars 200` |

At 1100 the clone's population matches the source almost exactly (3,047 vs 3,087 visible), so the
right tree IS being served — the content is present and in the wrong place, overflowing to the right.
That is the frozen-width residual measured in report 02, and it is a different lever from Program E.
