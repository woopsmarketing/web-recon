# Independent fresh-context review — interior-01 1.5.0 (2026-09-21)

Reviewer: fresh context, read-only. It re-checked the built demo package in a browser (Playwright, 390 px touch and 320–1000 px). It did not re-run the test suites.

**Result: 0 BLOCKER · 1 MAJOR · 5 MINOR — none fixed in 1.5.0.** A fix needs a new release (1.5.1); that is the user's decision.

## MAJOR
- **M1 — long messages can make the mailto link too long.** `components/InquiryForm.tsx:95` (the textarea has no maxLength) and `:49` (the link's length is never checked). One Korean character becomes 9 characters in the URL. A 200–250 character inquiry plus the other fields already goes past about 2,000 characters. Windows mail handlers (Outlook desktop / ShellExecute) can then fail to open or cut the message short. It is not a false success: the status line still says nothing was sent and gives the email address. Fix: add a textarea maxLength of about 300–500, or check the encoded length and show a "copy text + address" fallback when it is too long.

## MINOR
- **m1 — mixed line endings in the email body.** The body joins lines with CRLF, but line breaks inside the message stay LF (RFC 6068 asks for CRLF). Fix: `.replace(/\r?\n/g, "\r\n")`.
- **m2 — a second submit is not announced.** The `role=status` text does not change on a re-submit, so screen readers stay silent. Fix: reset the text, or change its key, on every submit.
- **m3 — focus falls to body when the window widens.** If the menu closes because the width passes 900 px, focus goes back to the hidden hamburger and ends up on `body`. Fix: only return focus when the button is visible.
- **m4 — sites with no email still get /contact.** A site with no email gets an orphan /contact page ("details not available") that is still in the sitemap. /about and /3d-portfolio are generated for every site. Recorded as limitation #1. At least leave /contact out of the sitemap when there is no channel.
- **m5 — two tests are gated rather than replaced one-for-one.** predemo D1 is gated for ≥ 1.5.0, and ia150 D1 against its own capture replaces it. The polish smoke's "controls tested" floor goes from 6 to 5 below 900 px (two nav links became one menu button; `blocked == 0` still holds). The reviewer judged both acceptable.

## Verified by the reviewer (browser)
Hamburger:
- ESC, backdrop, close button and link click all close it.
- Focus moves in on open, stays trapped, and returns on close.
- Scroll lock holds at 320 px.
- The floating CTA is hidden while the menu is open.
- After navigating or pressing Back, the menu is closed.

Layout: horizontal overflow is 0 on 5 routes × 5 widths (320 / 360 / 390 / 899 / 900), with no console errors.

Contact form:
- Required fields are enforced.
- Submitting sends 0 network requests.
- The mailto round-trip is exact, including Korean text, `&#%?` and emoji.
- No success wording appears.
- The floating CTA is hidden on /contact.
- fixture-empty shows no form and no CTA.

1.4.2 features:
- Hero arrows and the contact slide lead to /contact.
- The 전체 (13) tab is the default.
- The photo viewer opens.
- The footer notice shows.
- The per-pyeong price shows.
- The detail CTA leads to /contact.

The canonical-150 canonicalisation is symmetric.

## Not verified
- Test suites not re-run.
- Filter chips not exercised.
- No real iOS device.
- No real mail client (the link was captured instead).
- Existing releases and `platform/**` are shown unchanged by mtime only (both are untracked in git). The implementer's ia150 R3 checks them byte for byte.
