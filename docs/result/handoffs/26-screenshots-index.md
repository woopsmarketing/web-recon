# Task 26 — Visual Evidence Index (three separated screen sets)

Maintained by: 26-Production-Verifier (Phase D, spec §49). All judgments below
are from actually viewing the image files (as composited A|B|C triptychs plus
full-resolution crops), not from diff numbers. The Final Auditor consumes this
index.

Sets:

- **Set A — Source observations** (live linear.app, captured Phase A):
  `data/linear.app/manual-visual-review/2026-08-25T19-10-00-000Z/<route>/{mobile-390,desktop-1440,wide-1920,wide-2048}-original.png`
- **Set B — Exact Reconstruction** (unthemed clone, captured Phase A):
  same directory, `*-clone.png` (with `*-diff.png` alongside; 96 PNG total).
  Themed/injected B-side states additionally in
  `docs/result/handoffs/26B-verification-screens/` (18 PNG, Phase B verifier).
- **Set C — Transformed Pilot Production Package** (captured by ME from the
  isolated package copy, minimal-env launch):
  `docs/result/handoffs/26C-verification-screens/*.png`
  (originals also in session scratchpad; the handoffs copy is canonical).

Composited A|B|C review evidence (what I actually judged from):
`docs/result/handoffs/26C-verification-screens/segs/<route>-<width>-{top,mid,bot}.png`
— each is a side-by-side triptych segment: LEFT = A, MIDDLE = B, RIGHT = C.
Machine results: `route-qa-results.json`, `interaction-qa-results.json` (same dir).

Height parity note: for every route at 390 and 1440 the A, B and C full-page
captures have pixel-identical heights (independent confirmation of the
doc-height-delta-0 chain). Only home@1920 set A is ~64 px taller (live hero
animation drift at capture time — disclosed class).

## Per-route index and judgments

Set C file names below are relative to `docs/result/handoffs/26C-verification-screens/`.

### / (home)
| set | files | shows |
| --- | --- | --- |
| A | home/{mobile-390,desktop-1440,wide-1920,wide-2048}-original.png | live source |
| B | home/*-clone.png | exact clone |
| C | home-390.png, home-1440.png, home-1920.png | production package |
- **A vs B (fidelity)**: near-indistinguishable at 390/1440/1920 — header, hero,
  logo strip, feature sections, code-diff panel, charts, changelog strip,
  testimonials, footer all aligned. Hero product-UI mockup internals differ by
  animation frame (disclosed source drift). Judgment: HIGH FIDELITY.
- **B vs C (safety)**: FlowPilot rewrite is real (section heads, nav, CTAs);
  desktop testimonials correctly placeholdered ("Customer name / Role, Company
  (to be provided)"); dark-accent navy tint + purple accent pills applied.
  Retained Linear surfaces are exactly the disclosed categories: header
  wordmark, aria-hidden hero headline (no brand token), customer-logo sprite
  (Vercel/Cursor/OpenAI/Ramp…), mock-UI internals, and — on the MOBILE variant
  only — the review-locked real-people testimonial twin (Gabriel Peal/OpenAI
  quote visible at 390; evidence within home-390.png, judged at full
  resolution). Judgment: SAFE per disclosures; testimonial = named operator
  priority.
- **NEW FINDING C-VR1** — `finding-home1440-cta-overlap.png` (C) vs
  `reference-home1440-cta-clone.png` (B): injected closing CTA "Dependable
  automation. Ready today." wraps to 3 lines at desktop widths; the buttons
  overlap "today.". Also `finding-home1920-cta-overlap.png`. Mobile is clean:
  `reference-home390-cta-clean.png`.

### /changelog
| A/B | changelog/*-{original,clone}.png | C | changelog-390.png, changelog-1440.png |
- **A vs B**: mobile 390 clean and equivalent. Desktop 1440: feed body
  paragraphs in B render in a ~half-width column with adjacent paragraphs
  vertically overlapping, and the Fixes/Improvements/… chips letter-wrap —
  evidence `reference-changelog1440-A-column.png` (A, clean) vs
  `finding-changelog1440-B-column-overlap.png` (B). This is the Phase A
  numerically-disclosed /changelog geometry limitation (p95 320.73 px, height
  delta 0, accepted in 26A) but it is visually broader than "media-embed
  internals". Judgment: fidelity deviation on desktop feed body — INHERITED,
  DISCLOSED-NUMERICALLY, UNDER-CHARACTERIZED IN PROSE (C-VR3).
- **B vs C**: C mirrors B's geometry; rewritten entries (Agent sessions /
  Programs / FlowPilot Reviews / Guided approvals); review-locked feed
  internals keep source copy (disclosed). Themed accents on media cards.
  Judgment: SAFE.

### /customers
| A/B | customers/*-{original,clone}.png | C | customers-390.png, customers-1440.png |
- **A vs B**: grid/table layout identical; B loses photographic card covers and
  wordmark-mask cutouts (CORS 403 — the disclosed Phase A limitation), so cards
  render as flat color blocks. Judgment: HIGH structural fidelity, disclosed
  asset gap.
- **B vs C**: the 12 materialized wordmark masks RENDER again in C (coinbase,
  oscar, ramp, AUTOMATTIC, Brex, BOOM, CURSOR, Cars24, scale…), story teasers
  read "Customer story coming soon: …", metrics dashed to "(metrics pending)".
  Customer identity marks remain visible (review-locked / awaiting-input —
  disclosed, release-blocking SVG requirement + seam). Closing CTA shows the
  C-VR1 overlap at 1440. Judgment: SAFE per disclosures + C-VR1.

### /customers/automattic
| A/B | customers-automattic/* | C | customers-automattic-390.png, customers-automattic-1440.png |
- **A vs B**: essentially pixel-identical long-form case study.
- **B vs C**: C reframes the page as a sample ("A customer story will be
  published here once provided"; sidebar "To be provided/—"; closing quote
  placeholder); the long-form Automattic body text + logo remain (12
  review-locked slots — disclosed). Judgment: SAFE per disclosures; honest
  sample framing confirmed visually at both widths.

### /integrations
| A/B | integrations/* | C | integrations-390.png, integrations-1440.png |
- **A vs B**: card grid, sidebar, third-party logos equivalent at both widths.
- **B vs C**: themed card borders; "Build your own connector" CTA; card
  descriptions retain "Linear" (115 review-locked slots — disclosed);
  third-party integration logos load from source CDN (replacement-required
  residuals — disclosed). Judgment: SAFE per disclosures; no layout findings.

### /plan
| A/B | plan/* | C | plan-390.png, plan-1440.png |
- **A vs B**: identical at both widths (hero, product screenshots, timelines).
- **B vs C**: rewritten to queues/automation copy; FlowPilot chat mockup
  edits; testimonials placeholdered. Closing CTA shows C-VR1 overlap at 1440.
  Judgment: SAFE + C-VR1.

### /pricing
| A/B | pricing/* | C | pricing-390.png, pricing-1440.png |
- **A vs B**: tier cards + full feature matrix equivalent (check icons
  verified identical at full resolution: `pricing-checks-B.png` vs
  `pricing-checks-C.png`... both in verification-screens as part of segs
  evidence; logo strip spacing differs by marquee animation state — disclosed
  class).
- **B vs C**: "250 tasks/Unlimited tasks" rewrites; $10/$16 source prices
  remain (disclosed unslotted-duplicate revert; operator pricing input);
  "Linear Agent"/"Linear Asks" review-locked tokens remain (disclosed).
  Closing CTA C-VR1 overlap at 1440: `finding-pricing1440-cta-overlap.png`.
  Judgment: SAFE per disclosures + C-VR1.

### /security
| A/B | security/* | C | security-390.png, security-1440.png |
- **A vs B**: equivalent; the animated logo-marquee strip sits offset inside
  its section (disclosed 80 px cluster).
- **B vs C**: compliance content honestly deferred ("SOC 2 Type II audit
  details will be published here once provided by the operator", GDPR/HIPAA/
  ISO likewise — no invented certifications, confirmed visually); closing CTA
  here is the two-line "Automate the routine. Focus on what matters." with
  side buttons — NO overlap at 1440.
- **NEW FINDING C-VR2** — `finding-security390-hero-overlap.png`: at 390 the
  injected hero heading's third line "default." overlaps the intro paragraph.
  1440 clean. Judgment: SAFE content, one minor mobile overlap defect.

## Interaction-heavy states (§49 desktop-open / mobile-open)

| state | B-side evidence | C-side evidence (mine) | judgment |
| --- | --- | --- | --- |
| Desktop mega-menu open (@1440, "Product") | 26B-verification-screens/interaction-desktop-nav-panel-1440.png | 26C-verification-screens/interaction-home-product-open-1440.png | pixel-equivalent panels: same FlowPilot columns (Intake/Plan/Build/Diffs/Monitor/Integrations), same position/size, themed text rgb(235,240,248). EQUIVALENT |
| Mobile portal menu open (@390) | 26B-verification-screens/interaction-mobile-menu-390.png | 26C-verification-screens/interaction-home-mobilemenu-open-390.png | full-screen dialog with FlowPilot site navigation; translucent backdrop + unswapped hamburger = disclosed cosmetics. EQUIVALENT |
| Second desktop disclosure | 26B-verification-screens/interaction-desktop-disclosure2-1440.png | interaction-qa-results.json (home-combobox-n001659 / home-menu-n000128 rows) | aria-expanded + mounted listbox regions, console clean. EQUIVALENT |

## Overall visual verdicts

- **A vs B (fidelity)**: HIGH on 7/8 routes at both required widths (+ home
  1920); the /changelog desktop feed body is the one visually significant
  deviation (inherited, numerically disclosed, prose under-characterized).
- **B vs C (content/theme safety)**: SAFE — all sampled editable surfaces carry
  FlowPilot or honest placeholders; every retained source-brand surface
  reconciles to a disclosed review-locked/asset category; the dark-accent
  theme is applied consistently including open interaction states. Two new
  minor injected-copy overlap defects (C-VR1 desktop closing CTA on 4 routes;
  C-VR2 /security mobile hero) — operator copy input or a generic
  vertical-overlap detector closes them; today's gates measure only
  doc-height/horizontal overflow and honestly cannot see them.
