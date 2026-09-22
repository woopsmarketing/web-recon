# Task 28.6 — Pilot 6 Capture Gate (interiorteacher.com)

- Measured by the orchestrator, independently, 2026-09-02
- Probe scripts: `tmp/wr286/orch/pilot6-gate.mjs`, `pilot6-gate2.mjs`, `pilot6-gate3.mjs`
- **Verdict: PASS.** Pilot 6 runs. The program will run six pilots, not five.

## The gate as originally written could not be passed by any site of this shape

The gate required "a scroll-and-settle pass loading at least 95% of the 102 lazy images."
Against that denominator the site scores **80.4% at 1440 and 55.9% at 390**, and no scroll policy
could ever raise it, because the shortfall is not lazy loading.

Every one of the 20 images unloaded at 1440 is **structurally hidden**: a 0x0 box inside a
`display: none` ancestor (`div.grid.grid-cols-2`). A hidden image is not lazily deferred, it is
never going to load, and counting it in the denominator measures the site's responsive variant
markup rather than the capture policy.

On the renderable denominator the site loads completely:

| Viewport | Images in `document.images` | Loaded | Naive % | Renderable images | Renderable loaded | Renderable % |
|---|---|---|---|---|---|---|
| 1440 x 900 | 102 | 82 | 80.4 | 82 | 82 | **100** |
| 390 x 844 | 102 | 57 | 55.9 | 57 | 57 | **100** |

The hidden set is width-dependent and is not a clean desktop/mobile swap: 24 brand tiles are
renderable at 1440 and a different, overlapping 24 at 390, with roughly 20 hidden at each width.
It behaves like a marquee with duplicated slides. The general lesson stands regardless of the
mechanism: **`document.images` is the wrong denominator for any image-completeness metric, and the
error is large and width-dependent, up to 44 points here.**

## Capture policy that meets the gate

`networkidle` is unreachable on this site within 20 s, as the scout reported. The deterministic
policy that works:

```
goto(url, { waitUntil: 'domcontentloaded' })      // 771 ms
loop: scrollTo(y += 0.75 * innerHeight); wait 400 ms
      stop after 4 consecutive rounds with height and loaded-count both unchanged, at the bottom
tail wait 3000 ms                                  // in-flight decodes
scrollTo(0, 0); wait 600 ms
```

Total settle 9 to 13 s, 30 steps, guard never hit. Images loaded go from 4 to 82 at 1440.
A 250 ms step with a 3-round stability rule was also sufficient at 1440; the longer budget is kept
because the tail wait is what covers the last decodes.

## Three findings for the lanes

**Scroll-reveal blanking (defect B4) does not occur here.** After returning to the top, 0 of 708
sized elements sit below 0.05 opacity. This site is a negative control for that defect, which was
measured on mystarskin.co.kr at roughly 4,000 of 6,157 desktop pixels. The observer fix must not
assume every site re-hides.

**Document height changes during settle, and it goes down.** 21,300 px before scrolling, 20,563 px
after, a 737 px (3.5%) shrink, because lazy placeholders reserve heights that the real images do
not need. So a capture taken before settle and one taken after are not the same page. Source and
clone must be settled identically or the height delta is fabricated.

**One image request genuinely fails**, a YouTube thumbnail (`i.ytimg.com/vi_webp/...maxresdefault.webp`,
`ERR_ABORTED`). It is the source site's own broken external asset. A reconstruction that omits it
is not wrong, and QA must not score it as a miss.

## A concern checked and dismissed

The naive-denominator error above would have invalidated the responsive QA harness's headline
finding on Linear `/` at 700 ("the clone renders 84 of the source's 234 visible images, 36%,
against a 50% threshold") if the harness counted images the same naive way. It does not.
`src/responsive-qa/probe.ts:95-110` builds its visible set from `display !== none`,
`visibility !== hidden`, `opacity !== 0` and a non-zero rect, and `imageLeafCount` at `:233` only
increments for members of that set. The denominator is correct and **the Linear finding stands.**

Recorded so it is not re-litigated.
