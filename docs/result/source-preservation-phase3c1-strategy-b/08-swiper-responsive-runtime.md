# 08 — Swiper, data rendering and responsive runtime

Source: `runtime-result.json → instanceEvidence`, `responsiveProbeSummary`. The same probe, click and wait configuration
as 3C was used (`config.sameCondition fidelityProbes`).

## Source-created instances

| point | hero | portfolio area 1 | portfolio area 2 | reviews |
|---|---|---|---|---|
| B0 (before release) | no carousel container exists (the SSR base has no data) | – | – | – |
| B3 instance present / slides / visible / slidesPerView | ✅ 9 / 1 / 1 (0 duplicate slides) | ✅ 10 / 3 / 3 | ✅ 4 / 3 / 3 | ✅ 6 / 3 / 3 |
| slides carrying fixture markers | 9/9 | 10/10 | 4/4 | 6/6 |
| autoplay | `autoplay.running: true`; realIndex 0 → 1 after 6 s (`translate3d(-1440px…)`) | – | – | – |
| source control click (area 1 next arrow, rendered by source) | hero moved on to realIndex 2 by autoplay | activeIndex 0 → 1, `translate3d(-463.333px…)` | unchanged | unchanged |
| B4 (390) slides / visible / slidesPerView / transform | 9 / 1 / 1 / `-780px` | 10 / 1 / 1 / `-400px` | 4 / 1 / 1 / `0` | **3** / 1 / 1 (regrouped 2 per slide) |

**Every value is identical to Strategy A (3C),** including the transforms (`-1440`, `-2880`, `-463.333`, `-780`,
`-400`) and the review regroup 6 → 3.

The harness constructed nothing. Instances are read from the `swiper` property that the source components set, and
none existed before release.

## Responsive switch (1440×900 → 390×844, +3 s)

| evidence | Strategy A | Strategy B |
|---|---|---|
| mutation records / added / removed / attributes | 1,552 / 27 / 27 / 1,498 | **1,552 / 27 / 27 / 1,498** |
| largest removed subtree | `css-1xoxi4k` (25 descendants: desktop header nav) | **same** |
| inserted subtrees | `css-fqkw33` × n (7 descendants each: mobile variants) | **same** |
| root elements after resize | 601 | **601** |
| carousel nodes / buttons / root images | 35 / 21 / 34 | **35 / 21 / 34** |
| page errors during resize | 0 | **0** |
| React container + Next router after resize | ✅ | ✅ |
| **footer after resize** | wrapper `v7v99c` 100 px (stale), columns 50/50/100 | **wrapper `1rr4qq7` 350 px (correct node), columns 175/175/350** (`05`) |

Checklist:
- desktop → mobile header ✅;
- hero mobile path ✅ (slide width 390);
- portfolio slidesPerView 3 → 1 ✅;
- reviews regroup ✅;
- Swiper widths and transforms recalculated ✅;
- footer mobile structure ✅, with the logo 43 px, a new 60 px box, the content wrapper and the spacer;
- mounted ✅;
- fatal 0 ✅.

The only runtime difference between the arms in this phase is the footer.
