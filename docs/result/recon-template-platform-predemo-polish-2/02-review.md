# Pre-Demo polish 2 — independent review (2026-09-21)

A fresh-context reviewer got the before / after Template trees and the four stated intents — not the tests, not the expected verdict. Result: **0 BLOCKER · 1 MAJOR · 8 MINOR · NITs**. It also confirmed by reading: hero cascade order and all three media bands, the 320 px × 8-slide pager arithmetic, viewer image sizing, hydration determinism, stacking, the footer slot path, and that the diff contains nothing outside the four intents.

| # | Sev | Finding | Outcome |
| --- | --- | --- | --- |
| M1 | MAJOR | The invisible end arrow of the strip (`pointer-events: none`, 1.4.1) now lets a quick extra "next" tap fall through to the new full-seat viewer button → viewer opens uninvited | **Fixed.** The disabled disc keeps the press and ignores it (`step()` is a no-op at the ends). The 1.4.1 smoke asserted the CSS property; it now asserts the behaviour (a tap there changes nothing and opens nothing), and the new smoke adds the rapid-tap scenario. |
| m1 | MINOR | A mouse drag from the photo released on the letterbox closes the viewer (click target = common ancestor) | **Fixed.** Close only when the press both began and ended on the backdrop; a swipe that began there is not a press. |
| m2 | MINOR | After pinch-zoom a horizontal drag changes the photo instead of panning | **Fixed.** Swipe ignored while `visualViewport.scale > 1.01`. Not device-verified. |
| m3 | MINOR | Stepping to a still-lazy photo shows an empty stage, then a pop | **Fixed.** Both neighbours are pre-fetched on every step. |
| m4 | MINOR | Screen readers hear only "4 / 13" | **Fixed.** The live region also carries room + alt (visually hidden). |
| m6 | MINOR | Viewer button name does not say which photo | **Fixed.** `사진 크게 보기 3 / 13: <alt>` (asserted by predemo2 G2). |
| m5 | MINOR | Below 1281 every seat is a tab stop before the strip arrows | **Recorded** (open item). A roving tabindex needs a band guard; out of proportion for this patch. |
| m7 | MINOR | iOS scroll lock relies on `html { overflow: hidden }` | **Recorded** — needs a device. |
| m8 | MINOR | Mobile Back leaves the page instead of closing the viewer | **Recorded** — not in the stated intent; owner decision. |
| NIT | | bar swallowed no presses → a tap on the badge closed the viewer; tap-highlight flash on the full-seat button; notice lacked `overflow-wrap` | **Fixed** (all three). |
| NIT | | `tabIndex=-1` on `<dialog>`; `useEffect` vs `useLayoutEffect`; strip does not follow the viewer's position; doubled gallery DOM; eager lead photo of the hidden first room | **Kept** — deliberate (no focus ring on a control nobody tabbed to; markup stability for the byte-identity regressions) or out of scope. |

One finding of our own during the cycle: the first mobile screenshot showed bare chevrons with no disc — the shared control reset (`background: transparent`) sits after the arrow's base rule in source order. The disc paint was moved after the reset; the reviewer later confirmed the order.
