# Pre-Demo tiny polish — validation (2026-09-21)

Workflow: scratch devroot (symlinked sources + copied `data/`) → candidate release → fixtures + demo build → all tests + smokes green → release cut **once** in the repo root. The root cut produced the same hash as the devroot candidate (`59179ca20368…`), i.e. the shipped sources = the verified sources. One devroot candidate (`ad4ec1599180`, before the arrow shadow) was discarded with the devroot; it never existed in the repo.

| Step | Result |
| --- | --- |
| `pnpm template:release interior-01@1` | `interior-01-1.4.1-59179ca20368` created, 54 files, templateSourceHash `dfab700d5e3a…` |
| `pnpm fixtures:generate --release …` + 3 × `site:build` | fixture-large `e3cde7164caa`, fixture-small `3f38d5bc08f5`, fixture-empty `48dec8f98aab` — all `built` |
| boost-interior-demo re-pin + `pnpm site:build` | build `640d7cbe9ae7…`, packageHash `992412b4a8af…`, QA pass, 12 HTML pages, 0 warnings, previous (rollback) = `aa6e7539beb4…` (1.4.0) |
| `pnpm typecheck:platform` | 0 errors |
| `pnpm test:platform` | slice1 72 · step4 47 · step41 35 · step5 32 · polish 4 · step52 12 · step6 29 · **predemo 10** → 241 passed, 0 failed |
| `scripts/template-platform-predemo-gallery-smoke.ts` | **25 / 25** (log: `proof/gallery-smoke.log`, screens: `screens/`) |
| `scripts/template-platform-step6-visual-smoke.ts` (demo site) | **237 / 237** |
| `scripts/template-platform-polish-visual-smoke.ts` (3 fixtures, 30 visits) | **962 / 962** |
| root `tsc --noEmit` | only the 2 pre-existing errors in `template-platform-polish-visual-smoke.ts:1088,1090`; new script clean |

`polish` (4) and `step52` (12) run fewer checks than at the 1.4.0 cut (235 total then): their "current vs previous package" blocks are version-gated (`later = versionAtLeast(pin, "1.4.1")`) and skip by design once a newer release is current — that gating was written at the 1.4.0 cut, not now.

## Mobile gallery (390 × 844, isMobile + hasTouch, DPR 2) — flagship detail

Rooms: 거실 (3) · 주방 (3) · 현관 (2) · 복도·수납 (1) · 침실 (2) · 욕실 (2).

- first photo: counter `1 / 3`, Previous `aria-disabled=true` + invisible (opacity 0, pointer-events none), Next visible
- Next ×2: `scrollLeft` = the exact seat offset of photo 2, then photo 3 (±1 px); counter `2 / 3`, `3 / 3`
- last photo: Next disabled + invisible; Previous → exact seat of photo 2, counter `2 / 3`
- real touch swipe (CDP `Input.synthesizeScrollGesture`, touch source): strip moves, snaps to a seat, counter follows
- every room tab opens on photo 1 — including re-entering a room that was left on a later photo
- single-photo room (복도·수납): no arrows, no counter
- keyboard: Enter on the focused Next steps one seat; aria-labels `이전 사진` / `다음 사진`, `aria-controls` = the strip
- arrows: 44 × 44 targets, inside the photo, left / right, vertically centred
- strip scrollbar: gutter 0 px (`scrollbar-width: none` + `::-webkit-scrollbar`), page overflow 0

Desktop 1440: grid layout, arrows + counter `display: none` (out of the tab order), no scroll.

## Pages (1440 + 390): `/`, `/portfolio`, `/portfolio/suseong-white-34py-apartment-remodeling`

All six visits: HTTP 200, 0 broken images (lazy ones verified by fetch), 0 horizontal overflow, 0 console / page errors, 0 non-local requests.

## What did not move

- `interior-01-1.4.0-9e1ea20da947`: verifies, all 55 files byte-identical to `proof/before.json` (predemo R1) and to the Step 6 baseline tree hash (step6 C); exactly one 1.4.0 and one 1.4.1 dir.
- boost-interior-demo site documents: 62 files, byte-identical except `site.json` (template pin only) and `slots.json` (+2 labels only) — predemo D1.
- 51 / 51 raster assets, 0 stand-ins, each served byte-identical from the new package — predemo D2; step6 K/K2/K3 still pass.
- `platform/` (test/ excluded): still equals the Step 6 baseline tree hash (step6 D).
