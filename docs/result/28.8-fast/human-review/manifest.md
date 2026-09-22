# Task 28.8 FAST — Reconstruction V1 human review (Channel Talk + RoseeSkin) — manifest

## Contact sheet
Each selected site's own run-level contact-sheet.png is copied to <slug>/contact-sheet.png; the top-level contact-sheet.png is a copy of the largest one — beomeo.roseeskin.com (8955905 bytes). Same policy as the 28.6/28.7 packs.

## Canvas honesty
1 of 10 pairs have a SOURCE/FINAL width mismatch; each is banner-marked in index.html and flagged in this manifest.

## Excluded runs (blacklist)
- `2026-09-03T11-42-06-649Z` — seoultone.kr — INVALID. A shell pipeline swallowed a failed `pnpm reconstruct` (no `set -o pipefail`), so this run graded the PREVIOUS DAY's reconstruction against a freshly captured source. The 28.6 and 28.7 packs already exclude it; carried forward here unchanged.

## channel.io
- required minimum: 4; selected: 5 (measured 5, failed 0)
  - run `2026-09-08T16-48-41-104Z` contributed 8 pair(s) (widths [390, 1440], routes ['/kr', '/kr/pricing', '/kr/alf-customer', '/kr/blog/articles/what-is-aicc-1d3e923d'])
- `/kr` @390 — run `2026-09-08T16-48-41-104Z` — verdict MINOR (floor PASS) — source 390x12544, final 390x12868
- `/kr` @1440 — run `2026-09-08T16-48-41-104Z` — verdict MINOR (floor PASS) — source 1440x10398, final 1440x10794
- `/kr/alf-customer` @1440 — run `2026-09-08T16-48-41-104Z` — verdict MAJOR (floor MINOR) — source 1440x11497, final 1440x11497
- `/kr/pricing` @390 — run `2026-09-08T16-48-41-104Z` — verdict MINOR (floor PASS) — source 390x12989, final 390x13001
- `/kr/pricing` @1440 — run `2026-09-08T16-48-41-104Z` — verdict MINOR (floor PASS) — source 1440x10111, final 1440x10119
- EXCLUDED from pack (budget/priority, not run-invalidity): /kr/alf-customer@390 (MAJOR), /kr/blog/articles/what-is-aicc-1d3e923d@390 (MINOR), /kr/blog/articles/what-is-aicc-1d3e923d@1440 (MINOR)

## beomeo.roseeskin.com
- required minimum: 4; selected: 5 (measured 5, failed 0)
  - run `2026-09-08T18-54-21-770Z` contributed 10 pair(s) (widths [390, 1440], routes ['/', '/17', '/29', '/34', '/16'])
- `/` @390 — run `2026-09-08T18-54-21-770Z` — verdict BLOCKER (floor PASS) — source 392x10833, final 390x10829 **WIDTH MISMATCH**
- `/` @1440 — run `2026-09-08T18-54-21-770Z` — verdict MAJOR (floor PASS) — source 1440x16901, final 1440x17204
- `/17` @390 — run `2026-09-08T18-54-21-770Z` — verdict MINOR (floor PASS) — source 390x4491, final 390x4490
- `/17` @1440 — run `2026-09-08T18-54-21-770Z` — verdict MINOR (floor PASS) — source 1440x3896, final 1440x3896
- `/34` @1440 — run `2026-09-08T18-54-21-770Z` — verdict MINOR (floor PASS) — source 1440x9902, final 1440x9902
- EXCLUDED from pack (budget/priority, not run-invalidity): /16@390 (MINOR), /16@1440 (MINOR), /29@390 (MINOR), /34@390 (MINOR), /29@1440 (PASS)
