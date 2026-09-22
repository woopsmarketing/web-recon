# 06 — Open items

## Carry-forwards (recorded unchanged; not solved in Step 5)

| # | Item | When |
|---|---|---|
| 1 | Korean "34평" area basis: exclusive / supply / unknown | before BoostChat / NL filter links |
| 2 | Direct filtered-URL hydration flash on `/portfolio?…` | before the public Demo or BoostChat filter links |
| 3 | Builder pinning / hardening | Pre-Demo |
| 4 | Rollback command / runbook | Pre-Demo |
| 5 | Full SEO QA | Pre-Demo |
| 6 | Slot vs localization review (UI labels such as "Previous slide" are slots today) | before Template 2 |
| 7 | Portfolio page/2+ filter UX | whole-site Visual / UX polish |

## New in Step 5 — model and platform

1. **`banners@1` is PROVISIONAL** (`PROVISIONAL_CONTENT_TYPES`).
   - It is image + optional headline/text + a closed CTA target.
   - It has no per-device variants, scheduling or display order, and no placement flags.
   - Confirm or reshape it in the Demo Customer Content Proof. It may change incompatibly until then.
2. **Hero / intro video is deferred.** The asset pipeline is image-only, and the schema refuses `video`. It needs a media-type decision (poster, autoplay policy, reduced motion) and asset support.
3. **Contact destination seam.**
   - `contactHref()` (`sections/links.ts`) is the one place a future inquiry destination or BoostChat launcher would plug into, for the hero contact CTA and the floating CTA.
   - The header "Contact", footer email and detail-page contact still build `mailto:` themselves: 4 places in total (Reviewer 1, N1). Unify them when the seam is implemented; do not rewrite them before then.
   - No `/inquiry` route and no chat widget exist.
4. **Reviews vs `Project.customerQuote`.** Both are `{text, attribution}`, so the same testimonial could be stored twice and drift (R1, N7). No change now; the spec asked for a `reviews[]` collection.
5. **Re-pinning a site with banners or reviews to ≤ 1.2.0** fails inside the old release's preflight with a raw "Unrecognized key" (R1, N8). This is consistent with the accepted "migrate data before re-pin / use the retained package" rule. An earlier, friendlier builder message is a Pre-Demo hardening candidate (carry-forward 3/4).
6. **Dropped-destination warnings cover:**
   - a CTA project that is not served;
   - a contact CTA with no destination;
   - a `/path` link slot that is not a page.

   **`#anchor` link slots are not warned**, because anchor liveness depends on which sections render (a Template concept). The Template still hides dead anchors at render time.
7. **Draft banners count toward the ≤ 8 cap, and their CTA targets are integrity-checked** (R1, N3). This is intentional: stored-document integrity does not depend on the build mode. Draft images are only required when drafts are served (preview).

## New in Step 5 — visual / UX residuals (for the Whole-site Visual / UX Polish pass)

These are non-blocking; Reviewer 2 classified them MINOR or NIT, or they were found in verification.

- **600–899px band.** Tracks now show two items per view. The rest is still the stretched mobile layout: a 28px hero headline in a tall hero, and the intro image capped at 440px on the left.
- **Reviews without a banner image.** When all reviews fit (for example 3 at 1440), the hidden track bar keeps its space, which together with the section padding leaves ~200px of blank space before the image band.
- **Floating CTA** is a 117×48 / 133×56 pill, where the source used a ~56px circle. At some scroll positions it can sit over the right end of a text line, or over a track's "next" button, on desktop. Consider an icon-only circle below 900px.
- **Projects A and B "View all projects" both go to `/portfolio`.** The source linked each showcase to its own subset. Linking a filtered view waits on carry-forward 2 (hydration flash).
- **Header** is solid above the hero; the source floated a transparent header over it. This is an intentional difference and a polish candidate.
- **Hero copy inset.** Between 900 and ~1576px, a multi-slide hero's copy starts at x = 108 so it clears the arrows. It therefore does not align with other sections' 40px left edge in that band; wider, it realigns. Revisit with the header treatment.
- **Maximum-length hero copy grows the hero.** On small phones (320–390) this can take it past the viewport height (784px at 320). Nothing is clipped, but schema-maximum headlines are far from the design's intent. Guidance on copy length, or a smaller headline step for long headlines, belongs to the polish pass.
- **Desktop tab order.** At ≥ 900px the showcase "View all projects" pill sits top-right, but it follows the track in the DOM, so focus jumps back up after the cards. The DOM order matches the mobile visual order. That was a deliberate Reviewer 2 fix; the verification review raised it again as NIT 5, and it is accepted.
- **Reviews list tab stop.** If the focused reviews list becomes non-scrollable (resize or zoom), it loses its tab stop and the browser moves focus to `<body>`. This is rare and accepted (delta review NIT).
- **Browser coverage.** Browser proof is Chromium-only (Playwright). The hero relies on a grid `1fr` row stretching to the container's `min-height`, which is specified and expected in WebKit and Gecko, but has not been run there. Cross-engine checks belong to the Pre-Demo gate.
- **Long copy with a late font swap.** If a hero grown by maximum-length copy swaps web fonts late, the line count can change and shift the content below. Today's themes are system font stacks with no `@font-face`, so nothing swaps. This matters once themes ship web fonts; note it for copy-length guidance.
- **Dropped-destination warnings do not read section settings.** They name every declared destination that will not render, including one in a disabled section. The wording ("that CTA / link is never rendered") is accurate either way.
- Under reduced motion, the hero's `aria-live` stays "off" until the user first navigates, although nothing rotates.
- **Autoplay depends on CSS animations.** A future theme or global rule that disables animations would also disable autoplay. That is the intended fail-safe direction: static, never stuck mid-transition.
