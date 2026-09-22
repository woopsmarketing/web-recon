# Pre-Demo polish 2 — summary (2026-09-21)

**STATUS: PASS** — four Template-owned changes, shipped as one new patch release. Nothing else changed.

- New release: **`interior-01-1.4.2-a223ccd0759c`** (hash `a223ccd0759c4a36012ec99147bc928de23f5602e0eeffb0248cb6d46f42dcaa`, templateSourceHash `e9ca56fbf34d…`, 54 files)
- boost-interior-demo: pinned to 1.4.2 · **buildInputId `fb723e0924ace28520d2f236472b4ea791785baa22981d2cf7ab9784937060e0`** · **packageHash `3b4ba38cde01dbed5d565b4ec18f4689769632719ebc1da8ad4e06ea926ec2e1`** · QA pass · 12 HTML pages · 0 warnings · 51 / 51 rasters kept
- Rollback: `previous` = the 1.4.1 package `640d7cbe9ae7…` (kept on disk). `interior-01-1.4.1-59179ca20368` and `interior-01-1.4.0-9e1ea20da947` verify and are byte-identical to the pre-cut capture. The 1.4.0 *package* `aa6e7539…` was pruned by the platform's one-rollback-package rule (as at every earlier cut); the 1.4.0 release is intact, so it is rebuildable by re-pin.
- Validation: `01-validation.md` — typecheck 0 errors · test:platform **250 / 0** · new browser smoke **177 / 177** · gallery smoke 35 / 35 · Step 6 smoke 237 / 237 · fixture smoke 962 / 962
- Independent fresh-context review: 0 BLOCKER, 1 MAJOR (fixed), 8 MINOR (5 fixed, 3 recorded) — `02-review.md`

## 1. Home hero arrows disappeared below 900 px — root cause + fix

**Root cause (CSS breakpoint, by design of 1.3.0, not a rendering bug):** `styles/template.css` had a base rule `.i1-hero__arrow { display: none; }` and the only rule that showed the arrows lived inside `@media (min-width: 900px)`. So at every width < 900 px (all phones, portrait tablets, narrow desktop windows) the two buttons were in the DOM but not displayed; swipe + dots were the only controls. No conditional rendering, opacity, visibility or pointer-events was involved — `HeroCarousel.tsx` is unchanged.

**Fix (CSS only):** the arrows are displayed at every width whenever the hero has ≥ 2 slides.
- ≥ 900 px: unchanged — 44 px discs, mid-height, 40 px from the edges.
- < 900 px: 36 px discs (same disc / chevron / focus ring) **in the pager row**, 12 px from the edges. Why not mid-height: the hero copy is bottom-anchored and may be any length the schema allows, so on a 390 × 585 hero a mid-height arrow collides with the headline; the pager row is the one band the copy's 72 px bottom padding always keeps clear.
- The pager gives way to the arrows (`max-width: calc(100% − 112px)`, dots may narrow to the visible dot). This only engages with 7–8 slides on a ≤ 360 px screen (schema max = 8 banners).
- One slide: still no controls at all (the component renders none) — verified on fixture-empty.

## 2. "전체" tab on the project detail

`components/ProjectGallery.tsx`. A gallery with more than one room gets a first tab **전체 (N)** = every photo of the project in room order; room tabs are unchanged and keep their DOM ids `0..n-1` (the new view's id is `all`), so existing selectors / anchors did not move. Same one-tree, CSS-only layout: ≥ 1281 grid (lead 2×2 tile, collapsed to 5 + "사진 모두 보기"), < 1281 swipe strip with arrows and `1 / 13`. Before/after state is shared between the 전체 seat and the room's own seat. A one-room gallery has no tabs and no 전체 view.

**Default tab = 전체 (decision).** Reasons: (a) a visitor landing on a project wants the whole job first — with the first room as default the flagship showed 3 of 13 photos and nothing said that 10 more existed except the tab counts; (b) the first room is an arbitrary data order, 전체 is not; (c) the ≥ 1281 grid still opens compact (5 tiles) and the strip costs nothing extra (lazy images), so there is no performance or length penalty; (d) it makes the viewer's `3 / 13` match what the page shows. It is also the requester's recommendation. Cost: the detail HTML carries each seat twice (전체 + its room; images in hidden panels are lazy → no extra requests). It is Template behaviour, not a setting — a setting was not needed for this demo and can be added additively later.

## 3. Large-photo viewer (lightbox)

Same file + CSS. Every photo seat ends with a transparent full-seat button (`사진 크게 보기 3 / 13: <alt>`); it opens a **native modal `<dialog>`**, rendered client-side only (nothing in the server HTML → static export and crawl output untouched).
- starts on the pressed photo; shows the side (before / after) the seat is showing
- previous / next discs (hero look), **← / →**, touch swipe ≥ 48 px; wraps at the ends
- room badge (`거실`) + `3 / 13`; the step is also announced to screen readers as room + alt
- **Esc**, the ✕ button, or a press on the backdrop closes; focus returns to the pressed photo
- scope = the open tab: 전체 → all 13 (badge changes as you cross rooms), a room tab → that room's photos
- body scroll lock: `html:has(.i1-viewer[open]) { overflow: hidden }`; focus trap / inert page are the browser's
- photo is contained (never cropped, never upscaled), pinch-zoom allowed; while pinch-zoomed a drag pans instead of swiping; neighbours are pre-fetched so a step does not flash an empty stage
- no library, no timers, no `window` (the release gate rejects it)

## 4. Footer demo notice

New optional slot `site.footer.notice` (text ≤ 200, **no default → no value renders nothing**, so fixtures and any other site are unchanged). Rendered once per page by the root-layout footer, under the brand / business-facts row: 12 px, line-height 1.6, opacity 0.55, max-width 720 px — secondary tone, not a banner. boost-interior-demo sets the requested sentence verbatim. It is a slot, not `legalName` / `business.summary`, so it does **not** leak into meta descriptions (the Step 6 trap).

## Changed files

Template (→ 1.4.2): `template.ts` (version, history note, 4 optional slots) · `components/ProjectGallery.tsx` · `components/Icon.tsx` (+CloseIcon) · `sections/PortfolioDetail.tsx` (labels) · `sections/SiteFooter.tsx` · `styles/template.css`
Site: `data/sites/boost-interior-demo/site.json` (pin only) · `slots.json` (+`allRoomsLabel 전체`, `openPhotoLabel 사진 크게 보기`, `closeViewerLabel 닫기`, `site.footer.notice`); fixtures re-pinned by `fixtures:generate` (no new values → neutral English defaults, no notice)
Tests: new `platform/test/predemo2.test.ts` (9 checks, wired into `test:platform`) · new `platform/test/canonical-142.ts` (step41 A / step5 AD stay byte-exact: it removes exactly the 전체 tab/panel + viewer buttons, whose exact shape and content predemo2 G1/G2 assert) · `step4.test.ts` N (a before/after pair has two seats when the 전체 view exists) · `predemo.test.ts` D1/P2 (later-patch labels set aside; panel id may be `all`)
Scripts: new `scripts/template-platform-predemo2-smoke.ts` · `template-platform-predemo-gallery-smoke.ts` (iterates real tab ids; the end arrow's inertness is asserted as behaviour — see `02-review.md` M1)
Platform implementation (`platform/**` outside `test/`): **none**. `package.json`: `test:platform` += predemo2.

## Open items (short)

- Not verified on a real iOS device: scroll lock under the viewer relies on `html { overflow: hidden }` + a fixed full-screen dialog (fine on current Safari; very old iOS may still scroll the page behind the 95 % sheet); the Back gesture leaves the page rather than closing the viewer.
- Keyboard: below 1281 every seat is now a tab stop (13 on the flagship) before the strip arrows — acceptable for this demo, recorded.
- Carried, unchanged: L2 (`area.basis` never rendered), L3 (banner CTA cannot target the portfolio index), home carousel peek clip, no OG tags; content is fictional (`.example` domain) — not for public deploy as-is.
