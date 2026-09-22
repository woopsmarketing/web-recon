# Pre-Demo polish 2 — validation (2026-09-21)

Workflow: scratch devroot (symlinked sources + copied `data/`) → candidate release → fixtures + demo build → all tests + smokes green → independent review → fixes → devroot cycle again → release cut **once** in the repo root. The root cut reproduced the last devroot candidate exactly (release `a223ccd0759c…`, and all four buildInputIds / packageHashes), i.e. shipped = verified. Three earlier devroot candidates (`0b3550b468c3`, `894e6074e423`, and one the release gate refused for a `window` reference) were discarded with the devroot and never existed in the repo.

All numbers below are from the **repo root**. Logs: `proof/`.

| Step | Result |
| --- | --- |
| `pnpm template:release interior-01@1` | `interior-01-1.4.2-a223ccd0759c` created, 54 files, templateSourceHash `e9ca56fbf34d…` |
| `pnpm fixtures:generate --release …` + 3 × `site:build` | fixture-large `d0205d928432`, fixture-small `dd1d4b4ec395`, fixture-empty `33644914c7fc` — all `built`, QA pass, 0 warnings |
| boost-interior-demo re-pin + `pnpm site:build` (once) | build `fb723e0924ac…`, packageHash `3b4ba38cde01…`, QA pass, 12 HTML pages, 0 warnings, previous (rollback) = `640d7cbe9ae7…` (1.4.1) |
| 1. `pnpm typecheck:platform` | **0 errors** |
| 2. `pnpm test:platform` | slice1 72 · step4 47 · step41 35 · step5 32 · polish 4 · step52 12 · step6 29 · predemo 10 · **predemo2 9** → **250 passed, 0 failed** |
| 3. `scripts/template-platform-predemo2-smoke.ts` (new) | **177 / 177** (`proof/predemo2-smoke.log`, `screens/`) |
| `scripts/template-platform-predemo-gallery-smoke.ts` | **35 / 35** (was 25: it now also walks the 13-photo 전체 strip) |
| `scripts/template-platform-step6-visual-smoke.ts` (demo site) | **237 / 237** |
| `scripts/template-platform-polish-visual-smoke.ts` (3 fixtures, 30 visits) | **962 / 962** |
| root `tsc --noEmit` | only the 2 pre-existing errors in `template-platform-polish-visual-smoke.ts:1088,1090`; new script clean |

## 4 · Pages at 1440 + 390 (mobile context): `/`, `/portfolio`, flagship detail

All six visits: HTTP 200, 0 console / page errors, 0 non-local requests, 0 broken images (lazy ones verified by fetch), 0 horizontal overflow. Fold screenshots in `screens/*-fold.png`.

## 5 · Hero arrows at every main width

Widths 320 · 360 · 390 · 430 (touch contexts) · 600 · 768 · 820 · 899 · 900 · 1024 · 1280 · 1440 · 1920. At each: both arrows displayed, visible, opacity > 0, fully inside the hero and the viewport; `elementFromPoint` at the centre is the arrow (nothing covers it); no intersection with the pager nor with the active slide's headline / text / CTA pill; hit target ≥ 36 × 36 (< 900) / ≥ 44 × 44 (≥ 900); Next changes the active slide, Previous returns; 0 overflow. Negative control: fixture-empty (`data-slides="1"`) has no arrows and no pager. Screens: `hero-390.png`, `hero-768.png`, `hero-1440.png`.

## 6 · 전체 tab (1440 and 390)

Tabs: **전체 (13)** · 거실 (3) · 주방 (3) · 현관 (2) · 복도·수납 (1) · 침실 (2) · 욕실 (2). First tab is `all`, selected; count = sum of rooms; only the 전체 panel shows; its 13 image srcs = the room panels' srcs concatenated in room order; room tab → only that room, 전체 → back. 1440: collapsed to 5 tiles, "사진 모두 보기" shows all 13. 390: counter `1 / 13`, Next → `2 / 13`. Keyboard: → selects 거실, Home returns to 전체. Server HTML asserted byte-exactly by predemo2 G1.

## 7 · Viewer (1440 and 390)

Absent before a click and absent from the fetched HTML → click photo 3 → dialog open, `3 / 13`, badge 거실, same src as the tile, loaded, fully in the viewport, aspect ratio within 1 % (not cropped) → page scroll locked (`html` overflow hidden, scrollY unchanged) → a full lap of 13 Next presses: badge follows every room boundary, wraps to `1 / 13` → ← from 1 wraps to `13 / 13` → **Esc** closes, dialog removed, scroll restored, focus back on the pressed photo → reopen, ✕ closes → reopen, backdrop press closes; a press on the photo does not → in the 주방 tab: `1 / 3`, badge 주방 → 390: real touch swipe moves to the next photo → before/after project: with 공사 전 pressed the viewer shows the before image; pressing the toggle itself does not open the viewer → strip end: rapid extra taps on Next reach the last photo and never open the viewer. Screens: `viewer-1440.png`, `viewer-390.png`.

## 8 · Footer notice

On `/`, `/portfolio` and the detail at 1440 + 390 (and, via predemo2 N1, on all 12 demo HTML pages exactly once): exact text, after the business facts in DOM order, 12 px, opacity 0.55, 0 overflow, not covered by the floating CTA at the page bottom. Fixtures (no value): no notice element anywhere. Screens: `footer-1440.png`, `footer-390.png`.

## What did not move

- `interior-01-1.4.0-9e1ea20da947` and `interior-01-1.4.1-59179ca20368`: verify, every file byte-identical to `proof/before.json` (predemo2 R1; predemo R1; step6 C); exactly one 1.4.0, one 1.4.1, one 1.4.2 dir.
- boost-interior-demo site documents: 62 files, byte-identical except `site.json` (pin only) and `slots.json` (+3 detail labels + the notice, nothing else) — predemo2 D1.
- 51 / 51 raster assets, 0 stand-ins, served byte-identical from the new package — predemo2 D2.
- Every non-home page's `<main>` of all three fixtures and the demo: byte-identical to the 1.4.1 package after reversing exactly the declared gallery changes (step41 A, step5 AD via `canonical-142.ts`).
- `platform/` (test/ excluded): still equals the Step 6 baseline tree hash (step6 D).
