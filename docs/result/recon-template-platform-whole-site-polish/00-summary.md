# Recon Template Platform — Whole-site Visual / UX Polish (interior-01 1.3.1)

**Status: PASS (2026-09-19).**
- New immutable release **`interior-01-1.3.1-bd4ae8fb1769`**, cut once, in the repo root, after final QA.
- `interior-01-1.3.0-74a70c276f35` is unchanged: 196/196 release files match, and its 1,151 package files are intact. Its three packages are each site's rollback (`previous`) package.

## What changed

Presentation only: the stylesheet, one doc comment and the version. HTML, JS, RSC payloads, sitemap and robots are byte-identical to 1.3.0 once the build id is normalised. So are content, settings, slots and the filter/pagination/detail behaviour. Details: [01](01-changes.md).

| Target | Result |
|---|---|
| A. Mobile footer | Single column below 900: brand, summary, label-over-value "Company"/"Email". Long values wrap. Desktop unchanged. |
| B. Floating CTA | One tokenised, viewport-fixed bottom-right seat: 16/16 below 900, 24/50 from 900, plus the safe area. Footer clearance is derived from the seat. The pill is kept. It is the future chat-launcher seat (not implemented). |
| C. Reviews | A fitting track has no bar, no reserved space and no gap. A scrolling track keeps its rail, prev/next and behaviour. One row at 600–899. |
| D. Portfolio top | Title and intro on the banner's lower edge with a copy-anchored scrim (worst-pixel contrast ≥ 6.33:1 for title and intro). Filters directly below. First card 1125 → 876 at 1440. CSS only. |
| E. Consistency | One card-title scale, a 40px pager with a filled current page, a hairline filter panel, A→B showcase rhythm, 96px before the footer on inner pages, page-column tokens. |

## Validation ([02](02-validation.md))

| | Result |
|---|---|
| Typecheck | pass |
| `pnpm test:platform` | 193/193 (slice1 72 · step4 47 · step41 35 · step5 32 · polish 7) |
| Polish visual smoke | 545/545, 22 visits (home 320–1920, portfolio 390–1440, detail 390/800/1440, page 2, small, empty) |
| Step 5 / 4.1 / 4 smokes | 504/504 · 180/180 · 24/24 (filters, sort, URL state, filtered pagination, zero result, reset, detail tabs, Before/After, show all, CTA) |
| Floating seat | 16/16 (< 900), 24/50 (≥ 900) at 6 scroll positions × 7 widths; 0 of 21–36 controls blocked; safe-area insets add |
| Footer 320 / 390 | inside the viewport, no horizontal scroll, wraps a 96-character name and an 84-character email, natural height |
| Reviews | fit: no bar, no reserved space; overflow: rail and controls kept; layout shift 0 from the top, 0.0156 in view (bound 0.05) |
| Non-local requests / broken media / horizontal overflow | 0 / 0 / 0 on every visit |
| Release | one release; 1.3.0 unchanged (196/196 release files, 1,151/1,151 package files); previous = 1.3.0 packages |

## Reviews ([03](03-visual-review.md))

Phase 1: two read-only reviewers.

Final:
- **Visual/UX**: A–E all MET, no BLOCKER/HIGH/MAJOR. Fixed three of its MINOR/NIT items; declined one with a pinned bound.
- **Architecture/regression**: no BLOCKER/HIGH/MAJOR, no forbidden change, no assertion weakened. All three MINOR and three NIT items were handled.

## Decisions

- **Version 1.3.1 (patch).** Earlier steps bumped minor because each added a model, settings, slots or features. This pass changes none of them (polish test D: current documents re-pinned to 1.3.0 reproduce each 1.3.0 buildInputId).
- **CSS only.** The HTML stays byte-identical, so the Step 4/4.1/5 `<main>` byte tests keep proving no markup regression.
- **The pill is kept.** Hit-testing proves no control is obstructed. Icon-only was explicitly not wanted.
- **No `viewport-fit=cover`.** It is a site-wide change; decide it with the chat launcher (open item 1).
- **The floating CTA stays homepage-only** (the Step 5 rule). Whether it goes site-wide is a BoostChat decision.
- **The track bar's SSR state** gives a small bounded layout shift instead of reserved space. The count-based CSS workaround was declined.
- **The Step 5 "clipped mobile footer" was a capture artefact** (the pointer media flip during full-page capture). The smoke now captures mobile pages completely and verifies it.

## Unchanged accepted decisions

- solid header;
- optional hero copy and CTA;
- Projects A/B share one layout;
- mobile ~84% card peek;
- the current wide max-width;
- the Detail structure;
- no source pre-footer band;
- no hamburger navigation;
- the hero text inset;
- pause/play;
- the reduced footer.

## Human review pack

`docs/result/recon-template-platform-step5-homepage/human-review/` (updated in place):
- a "Polish 변경" section in the guide;
- five before/after groups in `index.html`;
- refreshed 1.3.1 candidates; the old 1.3.0 candidates and source references are kept.

## Open items and carry-forwards ([04](04-open-items.md))

- Carry-forwards A–G are unchanged: area basis, filtered-URL flash, builder hardening, rollback runbook, full SEO QA, slot vs localization, navigation.
- New:
  - `viewport-fit=cover` with the chat launcher;
  - site-wide seat placement;
  - the tall mobile filter panel;
  - the SSR bar state;
  - `:has()` cross-engine.

**NEXT: Demo Customer Content Proof** (then the Pre-Demo Gate).
