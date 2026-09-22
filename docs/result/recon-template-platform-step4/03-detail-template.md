# 03 — Detail template (one Template, conditional regions)

`DETAIL_TEMPLATE_COUNT = 1`:

- **One route:** `app/portfolio/[slug]/page.tsx`
- **One section:** `sections/PortfolioDetail.tsx` (a pure data builder plus a component)
- **One client island:** `components/ProjectGallery.tsx`

There is no per-family or per-site branch. Test "DETAIL_TEMPLATE_COUNT = 1" scans for this, and test N checks that both detail variants load identical JS.

## Regions and their data conditions

| region | renders when | absent → |
|---|---|---|
| app bar (back link to `/portfolio`) | always | — |
| title + summary | title always; summary when present | no summary paragraph |
| gallery | `galleryGroups` present; otherwise the **cover** is the single photo | never an empty gallery |
| room tabs | ≥2 gallery groups | no tablist |
| before/after toggle | per item, only when that item has a `before` image | no control, no blank toggle (`data-before-after="false"`) |
| show more / fewer | ≥1281px and the active group has >5 photos (lead tile + 2×2, observed design) | button hidden |
| story | `body` present | no heading, no wrapper |
| customer quote | `customerQuote` present (never generated) | **no figure / blockquote / heading** (test O) |
| facts | each row only when its value is non-empty; the `dl` only when ≥1 row exists | no blank `dt`/`dd`; `keywords: []` → no row (test P) |
| CTA | the business has a contact email | no CTA |

**Fact rows, in order:** location, area, type (category), building completed, scope, project period, duration, keywords, price per area.

**Labels.** Every label is a text slot on `portfolio.detail` with a neutral English default. fixture-small overrides all of them in Korean, including `durationFormat "{n}주"`.

**Formatting.** `lib/format.ts` uses no `Intl` and no `Date`. Output is deterministic and independent of the build machine's locale.
- area: `99,999 m²`, `84.95 m²`, `34평`
- duration: `durationFormatOne` for n = 1 ("1 week") and `durationFormat` otherwise ("18 weeks"). ko-KR sets both to "{n}주".
- period: `2024.03 – 2024.05`
- price: `USD 987,654,321.5 / m²`

## G10: outlier price decision

- **The contract bounds the value.** `pricePerArea.amount` must be positive and finite, at most 1e9, with **at most 2 decimal places**, in an ISO-4217 currency. Content outside that contract fails validation before the build. It never reaches rendering.
- **In-contract values render verbatim.** Digits are grouped. There is no bucketing and no "price on request" substitution. Because of the 2-decimal contract, rendering never rounds. The Template does not invent a presentation the operator did not provide.
- **Layout safety comes from CSS.** `overflow-wrap: anywhere` on fact values means no overflow at 390px.
- **Tests.** Fixture project `hp-0173` (987,654,321.5 USD/m², area 99,999 m², `keywords: []`) builds and renders (test Q). The visual smoke checks it for no overflow at 1440 and 390.

## Responsive bands (authored CSS, SSR-stable)

| band | list grid | detail layout |
|---|---|---|
| <900 | 1 column | app bar → **gallery first** (full-width square scroll-snap strip, 1/N counter) → title → facts 2 columns → story → quote → CTA |
| 900–1280 | 2 columns | app bar → gallery strip (72% slides, 4:3, 1/N counter) → title → facts 4 columns → story → CTA |
| ≥1281 | 3 columns | app bar → **title first** → room tabs → 4-column grid (2×2 lead tile + 2×2 block, collapsed after 5, "show all" over the block) → story + quote on the left, facts (2 columns) + CTA on the right |

**CSS-only layout switching**
- Layout is switched only with CSS media queries (`grid-template-areas`).
- There is no JS viewport branching and no hydration-time switching.
- The server HTML is identical for every width.

**DOM order = reading order.** The DOM is facts → story (body, quote) → CTA, which is also the observed mobile order. At ≥1281, grid placement moves the story to the left column and puts facts and CTA on the right. No `display: contents` and no `order` are used, so screen-reader order never differs from the narrow layout.

**Accessibility**
- Room tabs follow the WAI-ARIA tabs pattern: roving `tabIndex`, Arrow/Home/End keys.
- A single room is a labelled `group`.
- Before/after controls are a labelled `group` per photo, with `aria-pressed`.
- The header "Projects" link has `aria-current="page"` on `/portfolio` and `"true"` inside the section.
- The card image alt comes from content, or is empty. It never repeats the title that already names the link.

**404 page.** The Template's own `app/not-found.tsx` renders as `404.html`. It has the site header and footer, copy from `site.not-found` slots (localized on fixture-small), one `<title>`, and framework `noindex`. It replaces Next's English default page, which had two `<title>` elements.

**What the client island adds**
- Tab state, the before/after `aria-pressed` toggle, show more / fewer, and the strip's 1/N counter (the server HTML renders "1 / N").
- Every room's photos are in the HTML, so they are crawlable. Inactive panels are `hidden`.

## Before/after fixtures (same code, different data)

| fixture | project | data | output |
|---|---|---|---|
| fixture-large | `hp-0174` (A) | 4 rooms, 3 before pairs, quote, every fact | tabs, 3 toggles, quote, 9 fact rows |
| fixture-large | `hp-0175` (B) | no before, no quote, no builtYear/period/keywords/price | no toggle, no quote wrapper, 5 fact rows |
| fixture-large | `hp-0172` | minimal (no optional field) | cover as a single photo; one fact row (Type, from the required category); no summary, story, quote or toggle |
| fixture-small | `maru-012` | 2 before pairs + quote, ko-KR labels | toggles and quote in Korean |
| fixture-small | `maru-011` | neither | no toggle, no quote |
