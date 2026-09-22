# Phase 2 — Human visual review guide

## Run it

```bash
cd /Users/woops/projects/web-recon
pnpm preserve:preview data/apartmentary.com/preservation-clones/2026-09-16T06-42-28-282Z
```

Leave it running. Ctrl-C to stop.

## Open these

| | URL |
|---|---|
| **Index (both variants)** | http://127.0.0.1:4180/ |
| **Desktop clone** | http://127.0.0.1:4180/desktop/ |
| **Mobile clone** | http://127.0.0.1:4180/mobile/ |
| **Source, to compare** | https://apartmentary.com/ |

Port 4180 by default; `--port N` if it is taken.

## Widths to check

| Variant | Primary | Also useful |
|---|---|---|
| Desktop | **1440**, **1024** | 1920, 768 |
| Mobile | **390** | 700 |

Use the browser's device toolbar for the mobile variant. Note that the desktop
and mobile clones are **separate pages**: resizing the desktop clone down to
390px will not turn it into the mobile page, because the source swaps DOM trees
with JavaScript and JavaScript is off. That is expected in Phase 2.

## What to look at

Hero · headline and body text · fonts · colours · spacing · portfolio sections ·
cards · images · the review section · footer · line wrapping · how the layout
reflows as you drag the window · horizontal overflow · any region that is
missing entirely.

## Expected to work

- Full page layout at the variant's own widths, driven by the source's own CSS.
- Real fonts (Decimal, SpoqaHanSans) from local files — text metrics should
  match the source.
- All images, icons and background images, served locally.
- Live responsive behaviour: the source's `@media` queries still respond as you
  resize, within each variant's tree.
- Korean copy exactly as captured.

## Intentionally inactive until Phase 3

None of these is a Phase 2 failure:

- the hero carousel does not advance or autoplay; arrows and dots do nothing
- the mobile hamburger menu does not open
- modals do not open
- hover / scroll JS effects (AOS animations) do not fire
- nothing refetches from the API; content is frozen as captured
- React is not hydrated
- the desktop/mobile DOM tree does not switch automatically on resize
- the Channel Talk chat widget is absent

## Two things that are deliberate, not bugs

1. **The hero video streams from S3.** At 98 MB it is over the local size
   budget, so it was left pointing at the source host on purpose — you can still
   see it. It is the single recorded "still fetched from source" dependency.
2. **The Google Tag Manager frame and Facebook pixel are dead.** Both were
   hidden inside `<noscript>` in the source. They are neutralized so the clone
   reproduces no tracking.

## What WOULD be a Phase 2 failure — please flag it

- layout that is materially broken at the variant's own width
- the page rendering at a frozen fixed width instead of reflowing
- stylesheet corruption: duplicated styling, wrong cascade, elements styled as
  if a rule landed in the wrong order
- major images or fonts missing without being reported
- desktop content appearing in the mobile variant or vice versa
- any sign that source JavaScript ran (content changing after load, a carousel
  moving, a tracker firing)
- a region present on the source that is simply absent in the clone

## If you want the numbers

- `data/apartmentary.com/preservation-clones/2026-09-16T06-42-28-282Z/manifest.json` — every decision made
- `data/apartmentary.com/preservation-clones/2026-09-16T06-42-28-282Z/residual-dependencies.json` — everything still reaching the source
- `docs/result/source-preservation-phase2/04-apartmentary-build.md` — the build in prose
- `docs/result/source-preservation-phase2/screenshots/` — captured reference shots

You should not need to open any JSON to do the review.
