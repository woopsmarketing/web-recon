# Task 28.75 Phase A closure — human review pack — manifest

## Contact sheet
Each selected site's own run-level contact-sheet.png is copied to <slug>/contact-sheet.png; the top-level contact-sheet.png is a copy of the largest one — linear.app (3845264 bytes). Same policy as the 28.6/28.7 packs.

## Canvas honesty
2 of 18 pairs have a SOURCE/FINAL width mismatch; each is banner-marked in index.html and flagged in this manifest.

## Excluded runs (blacklist)
- `2026-09-03T11-42-06-649Z` — seoultone.kr — INVALID. A shell pipeline swallowed a failed `pnpm reconstruct` (no `set -o pipefail`), so this run graded the PREVIOUS DAY's reconstruction against a freshly captured source. The 28.6 and 28.7 packs already exclude it; carried forward here unchanged.

## linear.app
- required minimum: 1; selected: 10 (measured 10, failed 0)
  - run `2026-09-05T12-46-21-873Z` contributed 10 pair(s) (widths [390, 700, 1024, 1100, 1440], routes ['/', '/pricing'])
- `/` @390 — run `2026-09-05T12-46-21-873Z` — verdict BLOCKER (floor PASS) — source 390x5876, final 390x5876
- `/` @700 — run `2026-09-05T12-46-21-873Z` — verdict BLOCKER (floor MINOR) — source 700x9587, final 862x9960 **WIDTH MISMATCH**
- `/` @1024 — run `2026-09-05T12-46-21-873Z` — verdict BLOCKER (floor PASS) — source 1024x10131, final 1024x9960
- `/` @1100 — run `2026-09-05T12-46-21-873Z` — verdict BLOCKER (floor PASS) — source 1100x9710, final 1100x9960
- `/` @1440 — run `2026-09-05T12-46-21-873Z` — verdict MAJOR (floor PASS) — source 1440x9960, final 1440x9960
- `/pricing` @390 — run `2026-09-05T12-46-21-873Z` — verdict MINOR (floor PASS) — source 390x7714, final 390x7714
- `/pricing` @700 — run `2026-09-05T12-46-21-873Z` — verdict MAJOR (floor PASS) — source 700x7795, final 700x7714
- `/pricing` @1024 — run `2026-09-05T12-46-21-873Z` — verdict BLOCKER (floor PASS) — source 1024x6990, final 1024x7714
- `/pricing` @1100 — run `2026-09-05T12-46-21-873Z` — verdict BLOCKER (floor PASS) — source 1100x6323, final 1100x6360
- `/pricing` @1440 — run `2026-09-05T12-46-21-873Z` — verdict MINOR (floor PASS) — source 1440x6360, final 1440x6360

## hobbang.net
- required minimum: 1; selected: 3 (measured 3, failed 0)
  - run `2026-09-05T11-13-31-951Z` contributed 3 pair(s) (widths [390, 1100, 1440], routes ['/'])
- `/` @390 — run `2026-09-05T11-13-31-951Z` — verdict MINOR (floor PASS) — source 390x17167, final 390x17167
- `/` @1100 — run `2026-09-05T11-13-31-951Z` — verdict MAJOR (floor PASS) — source 1100x10928, final 1100x10863
- `/` @1440 — run `2026-09-05T11-13-31-951Z` — verdict MINOR (floor PASS) — source 1440x10863, final 1440x10863

## gs.severance.healthcare
- required minimum: 1; selected: 3 (measured 3, failed 0)
  - run `2026-09-05T10-23-24-422Z` contributed 3 pair(s) (widths [390, 1100, 1440], routes ['/gs/index.do'])
- `/gs/index.do` @390 — run `2026-09-05T10-23-24-422Z` — verdict MAJOR (floor MAJOR) — source 390x3925, final 390x3925
- `/gs/index.do` @1100 — run `2026-09-05T10-23-24-422Z` — verdict MAJOR (floor MINOR) — source 1280x2700, final 1100x2700 **WIDTH MISMATCH**
- `/gs/index.do` @1440 — run `2026-09-05T10-23-24-422Z` — verdict MAJOR (floor MINOR) — source 1440x2700, final 1440x2700

## seoultone.kr
- required minimum: 1; selected: 2 (measured 2, failed 0)
  - run `2026-09-05T18-17-56-681Z` contributed 2 pair(s) (widths [390, 1440], routes ['/'])
- `/` @390 — run `2026-09-05T18-17-56-681Z` — verdict BLOCKER (floor MINOR) — source 390x5679, final 390x5632
- `/` @1440 — run `2026-09-05T18-17-56-681Z` — verdict BLOCKER (floor PASS) — source 1440x4892, final 1440x4892
