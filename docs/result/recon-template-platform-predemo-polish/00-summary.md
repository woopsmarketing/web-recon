# Pre-Demo tiny polish — summary (2026-09-21)

**STATUS: PASS** — two Template-owned display changes, shipped as a new patch release. Nothing else changed.

- New release: **`interior-01-1.4.1-59179ca20368`** (hash `59179ca20368d0f48093eacbe3930ce3f3de9b21a65ba27d9bc63defb67933bd`)
- `interior-01-1.4.0-9e1ea20da947`: untouched, verifies, byte-identical (rollback = 1.4.0 package `aa6e7539beb4…`, kept as `previous`)
- boost-interior-demo: pinned to 1.4.1, build `640d7cbe9ae7…`, 51 / 51 rasters kept
- Validation: see `01-validation.md` (test:platform 241 / 0, gallery smoke 25 / 25, Step 6 smoke 237 / 237, fixture smoke 962 / 962)

## 1. Detail photo strip arrows (< 1281 px)

`components/ProjectGallery.tsx` + `styles/template.css`. Previous / Next buttons over the photo (home hero arrow look: 44 px disc, canvas 72 %, same chevron icon, same focus ring; plus a light shadow because interior photos are white-on-white). One press = exactly one photo seat (`scrollTo(item.offsetLeft − first.offsetLeft)`); native scroll-snap swipe and the `n / N` counter are unchanged. Ends are `aria-disabled` and invisible (opacity 0 + pointer-events none — kept in the tab order so a keyboard press at the end does not drop focus; faintly visible only on `:focus-visible`). A room tab always opens on photo 1 (rewind + counter reset on activation). Strip scrollbar hidden; smooth scroll honours `prefers-reduced-motion`. The ≥ 1281 grid hides the arrows with the counter — desktop layout unchanged.

Decisions:
- The arrows apply to the whole strip band (< 1281, i.e. mobile **and** tablet), not only 390 — the strip is one CSS band.
- aria-labels are two new **optional** `portfolio.detail` slots (`previousPhotoLabel`, `nextPhotoLabel`, neutral defaults "Previous photo" / "Next photo") — same pattern as every other control label of this Template. Additive: every 1.4.0 slots document stays valid. boost-interior-demo sets `이전 사진` / `다음 사진` (the only site-document change besides the pin). Fixtures were not given values (generator is Platform code, untouched) → their arrows carry the neutral English default.

## 2. Korean per-pyeong price

`lib/format.ts` `formatPricePerArea(price, locale?)`, called with `ctx.identity.locale`. Only `ko` / `ko-*` + `KRW` + `pyeong`: `2,900,000` → **`평당 290만 원`**. Display only — schema and stored number untouched. The formatter keeps its "never round" rule: an amount 만 cannot show exactly (not a multiple of 100 won, < 1만, ≥ 1억) stays in won, e.g. the Korean fixture's `2,800,602` → `평당 2,800,602원`. Every other locale / currency / unit (and a missing locale) keeps `CUR amount / unit` — step4 Q's generic assertions pass unchanged.

## Changed files

Template (→ release 1.4.1): `template.ts` (version, history note, 2 slots) · `lib/format.ts` · `components/ProjectGallery.tsx` · `sections/PortfolioDetail.tsx` · `styles/template.css`
Site: `data/sites/boost-interior-demo/site.json` (pin) · `slots.json` (+2 labels); fixtures re-pinned by `fixtures:generate`
Tests: new `platform/test/predemo.test.ts` (10 checks, wired into `test:platform`) · new `platform/test/canonical-141.ts` · `step41.test.ts` A + `step5.test.ts` AD (detail `<main>` byte-identity now reverses exactly the two declared 1.4.1 changes and *predicts* the new price text) · `step6.test.ts` (point-in-time 1.4.0 proof generalised: 1.4.0 + all baseline releases must still verify and be byte-identical; all four sites pin one newer verified release; live source = pinned release; platform tree = baseline)
Scripts: new `scripts/template-platform-predemo-gallery-smoke.ts`
Platform implementation (`platform/**` outside `test/`): **none**

## Customer demo

Ready. Open items unchanged from Step 6 and out of this scope: L2 (`area.basis` never rendered), L3 (banner CTA cannot target the portfolio index), home carousel peek clip, no OG tags; demo copy is fictional (`origin: synthetic-fixture`, `.example` domain) — not for public deploy as-is.
