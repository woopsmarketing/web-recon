# 02 — Validation

Final numbers come from the **repo root**, after the one release cut (`interior-01-1.3.1-bd4ae8fb1769`), the fixture re-pin and the three builds. The dev cycle ran in a scratch copy of the repo (`devroot`), so rollback packages were never pruned during iteration. The same release hash was produced there first.

## Suites

| | Result |
|---|---|
| `pnpm typecheck:platform` | pass |
| `pnpm test:platform` | **193/193**: slice1 72 · step4 47 · step41 35 · step5 32 (generalised, [01](01-changes.md)) · polish 7 (new) |
| Polish visual smoke (`scripts/template-platform-polish-visual-smoke.ts`) | **545/545** checks, 22 visits · `screens/summary.json` |
| Step 5 visual smoke (homepage) | 504/504 checks, 19 visits |
| Step 4.1 visual smoke (filters, search, sort, URL state, filtered pagination, zero result, reset) | 180/180 checks, 7 visits |
| Step 4 visual smoke (list, static pagination, detail: gallery, room tabs, Before/After, show all, facts, story, quote, CTA) | 24/24 visits |
| Builds | release cut once (`bd4ae8fb1769`, the same hash as the devroot candidate); fixtures re-pinned; 3/3 sites built: large `2c0cddf19d05`, small `727ce3f49003`, empty `f3e50a1accb4` |

**Release and immutability.**
- The 1.3.0 release and every older release: 196/196 files match the pre-polish hashes (`shasum -c`).
- The 1.3.0 packages, now `previous` (`1f30134eba1f` / `320e1889dc91` / `301ae02cd7f5`): 1,151/1,151 files unchanged.
- Retention pruned the 1.2.0 packages; their buildInputIds stay in `history.jsonl`.
- The step5 compat check rebuilds 1.2.0 inputs from it.

## What the polish smoke proves (per visit, 22 visits)

**Every visit:**
- HTTP 200;
- 0 console, page or subresource errors;
- **0 non-local requests**;
- **0 broken images** (every image fetched and decoded);
- **0 horizontal overflow**;
- every internal link resolves.

**Footer (A), all widths:**
- every text box is inside the viewport and unclipped;
- the footer grows to its content;
- label above value below 900, beside it at 900 and up;
- a long-value stress test (a 96-character company name and an 84-character email) at 320 and 390 wraps inside the viewport with no horizontal scroll.

**Floating seat (B), on the home at 320, 390, 430, 800, 1000, 1440 and 1920:**
- `position: fixed`, and no ancestor turns into its containing block;
- above the header;
- a pill with a `mailto:` destination.
- `getBoundingClientRect()` at top, intro, projects, reviews, near the footer and at the end:
  - `vw − right` = 16 and `vh − bottom` = 16 below 900;
  - 24 and 50 from 900 up, at every position (≤ 1px, no jump, on top).
- Never over footer text at the end of the page.
- Every visible control can be scrolled clear of it and hit-tests unobstructed (21–36 controls per visit, 0 blocked).
- Tab from the last footer link reaches it, with a visible focus ring.
- Safe-area insets emulated over CDP:
  - portrait bottom 34 → bottom 50 (mobile) / 84 (desktop);
  - landscape right 44 / bottom 21 → 60 / 37 (mobile), 68 / 71 (desktop);
  - zero insets return to the seat.
- Share of the viewport: 2.75% at 320, 1.71% at 390, 0.57% at 1440.

**Reviews (C):**
- Overflow (fixture-large at 390, 800, 1000 and 1440; fixture-small at 390): rail present, prev/next exactly when the pointer is fine, a tab stop, one row from 600px.
- Fit (fixture-small 1440):
  - no bar box;
  - no reserved space;
  - the space below the items is 112px, which equals the section's own bottom padding. The visual reviewer measured about 114px to the image band, down from about 200.
- Resizing 1440 → 390 → 1440 toggles correctly.
- Every track shows its bar only when it scrolls.
- **Layout shift:** 0 from the top; 0.0156 with a fitting track in view at hydration (bound 0.05).

**Portfolio top (D), fixture-large at 390, 800, 1000 and 1440, and `/portfolio/page/2`:**
- one `h1`;
- the title sits on the banner;
- the banner starts directly under the header;
- the next block follows the banner within 16–64px;
- the title, search and first card share the left edge;
- a long-copy stress test grows the banner and never clips.
- Worst-pixel contrast with the text hidden: title 6.33–6.58:1, intro 6.33–6.63:1. The visual reviewer's analytic worst case, a pure-white photo, is ~4.76:1, which still passes AA.
- fixture-small (no banner): the plain head.
- The first card is at 876 at 1440 (was 1125), 924 at 1000, and 501 at 800 and 390. On phones the 280px banner shows a band of photo above the scrim.

**Screenshots:**
- Full-page captures are complete: PNG height = document height × DPR, and touch emulation is kept.
- Mobile uses a tall-viewport capture. A plain `fullPage` capture in a touch context flips `(hover:hover) and (pointer:fine)` mid-capture, adds 126px of track buttons, and cuts the page end. **That was the Step 5 "clipped mobile footer" (a capture artefact, not a page defect).**
  - The 1.3.0 home captures 02 and 07 are 126px short.
  - 09, 11 and 13 have no tracks and are complete.

**Baseline:**
- The same smoke (an earlier revision) against the **1.3.0** packages failed 70/540.
- 61 of those are the polish targets:
  - label-above-value ×11;
  - safe-area right/bottom ×14;
  - portfolio title, contrast, filters and edge ×23;
  - long-copy and long-value stress ×7;
  - reviews and tracks ×6.
- 9 came from criteria the smoke has since corrected: 7 off-screen lazy images counted as undecoded, 2 truncated captures.

## Not verified

- Real iOS safe-area behaviour; there is no `viewport-fit=cover` (open item 1).
- WebKit and Gecko: Chromium only, including `:has()` and `display: contents`.
- Real photos under the scrims (fixtures are flat illustrations).
- Screen reader output.
