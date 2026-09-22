# Recon Template Platform — Step 5: complete interior-01 homepage

**Status: PASS (2026-09-19).** New immutable release **`interior-01-1.3.0-74a70c276f35`**. The old release `interior-01-1.2.0-93fb66acda7d` is unchanged and serves as each site's rollback package.

## What shipped

**Page structure.**
- The homepage is the one Template route `/`: `site.header` → `home.hero` → `home.intro` → `home.projects-a` → `home.projects-b` → `home.reviews` → `home.image-band` → `site.footer`.
- `site.floating-cta` is viewport-fixed, outside the section flow, and rendered as the footer's last child.
- The order is Template code, never a setting. Every section is omitted entirely, with no wrapper, when it has no data or is disabled.

**Content model** ([01](01-home-content-model.md)):
- `reviews@1`: canonical, optional document, plain text + attribution, stored order. No rating, date or photo; no generated origin.
- `banners@1`: **PROVISIONAL**. Up to 8 hero slides of image + optional headline, text and CTA. The CTA is a closed target (`project` | `contact`), never a URL.
- Projects A/B are two selections of the **one** canonical projects collection. B is off by default. There are no placement flags and no `projectsB[]`.

**Sections, settings and slots** ([02](02-sections-and-settings.md)):
- Section-level settings and slots only. There are no per-item slots and no DOM slots.
- Link slots are operator destinations (§21). They are kept only if live in the build.
- The builder warns about every declared destination it drops (`preflight.warnings`).

**Interactions** ([03](03-interactions-responsive.md)):
- The hero carousel autoplays with **no timers**: a CSS animation on the active dot fill ends the slide.
- It pauses on mouse hover or keyboard focus. Tap never pauses.
- It has pause/play, dots, arrows (desktop), swipe (touch) and keyboard control.
- Reduced motion means static, fully usable content.
- The hero copy has a copy-anchored scrim. It is ≥ 5.08:1 worst-pixel contrast, even at the schema's maximum copy length, and the hero grows rather than clip.
- Showcase and review tracks are native scroll-snap with a measured rail and prev/next buttons.
- One DOM at every width; base = mobile and ≥ 900px = desktop.

**Fixtures** (fictional only):
- fixture-large (en-US): every section;
- fixture-small (ko-KR, warm theme): Korean slots and copy, different queries;
- fixture-empty (en-GB, 0 projects): hero + text intro only, no navigation, `/portfolio` 404.

## Validation ([04](04-validation.md))

| | Result |
|---|---|
| Typecheck | pass |
| Tests | slice1 72/72 · step4 47/47 · step41 35/35 · **step5 32/32** |
| Step 5 visual smoke | **504/504** checks, 19 visits: 0 console errors, 0 non-local requests, 0 broken media, 0 horizontal overflow, internal links valid |
| Step 4.1 smoke (regression) | 180/180 |
| Portfolio / filters / detail regression | every non-home `<main>`, sitemap and robots byte-identical to 1.2.0 |
| Old releases | 1.2.0 / 1.1.0 byte-identical; rollback = the 1.2.0 packages |
| Reviews | architecture, visual, fix-verification and delta reviews (fresh, read-only): **no remaining BLOCKER/MAJOR**; every MAJOR fixed |

**Visual fidelity** ([05](05-visual-fidelity.md)): the source homepage's section structure, order and responsive pattern are reproduced with fictional content. The intentional differences (solid header, pill CTA, reduced footer) are listed.

## Open items ([06](06-open-items.md))

- **The seven carry-forwards are unchanged:**
  1. 34평 area basis;
  2. filtered-URL hydration flash;
  3. Pre-Demo builder pinning / hardening;
  4. rollback runbook;
  5. full SEO QA;
  6. slot vs localization, before Template 2;
  7. portfolio page/2+ filter UX.
- **New in Step 5:**
  - `banners@1` is PROVISIONAL;
  - hero/intro video is deferred (image-only pipeline);
  - the contact-destination seam is documented, but no BoostChat and no `/inquiry` route;
  - visual residuals for the Whole-site Visual / UX Polish pass;
  - browser proof is Chromium-only.

## Boundaries kept

- Main agent was the only writer; every subagent was read-only.
- No commit, no push.
- No source observation.
- No legacy pipeline, Supabase/CMS or BoostChat change.
- Nothing copied from the source.
- The development cycle ran in a scratch devroot; exactly one release was cut in the repo.

**Next:** Whole-site Visual / UX Polish → Demo Customer Content Proof → Pre-Demo Gate.
