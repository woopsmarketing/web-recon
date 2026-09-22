# 04 — Validation

All runs are in the repository root after the real sequence below. Wall-clock `at` is 2026-09-18 ~13:22Z.

```
pnpm template:release interior-01@1                                  → created interior-01-1.1.0-512e4dd932b4 (40 files)
pnpm fixtures:generate --release interior-01-1.1.0-512e4dd932b4      → 3 sites regenerated and re-pinned
pnpm site:build fixture-large | fixture-small | fixture-empty        → built, QA pass (182 / 16 / 3 HTML incl. 404 + _not-found)
pnpm test:platform            → slice1 72/72 + step4 47/47, exit 0
pnpm typecheck:platform       → exit 0
tsc --noEmit -p tsconfig.json → exit 0 (root project)
tsx scripts/template-platform-step4-visual-smoke.ts → 24/24 visits pass (screens/summary.json)
```

## Spec checks A–Y → `platform/test/step4.test.ts`

| # | check | result |
|---|---|---|
| A | all 3 pins and build records = `interior-01-1.1.0-512e4dd932b4` (full hash); release verifies | PASS |
| B | `1.0.0-f27823c3b837` hash unchanged, files read-only, no portfolio files; **every** older release (`1ddf327cb1b9` too) re-verifies | PASS |
| C | fixture-large: 173 visible → 30/30/30/30/30/23, order = independently computed publishedAt DESC, id ASC | PASS |
| D | fixture-small: only `/portfolio` (12 cards, no pager, `portfolio.page` pruned) | PASS |
| E | fixture-empty: no `portfolio*` file; 3 routes pruned | PASS |
| F | 173 slugs → exactly 173 detail pages; drafts/scheduled not emitted | PASS |
| G/H | `page/0`, `page/1`, `page/7`, unknown slug, `portfolio/index` not emitted; exclusive QA (180 planned + 2 framework HTML) | PASS |
| I | reserved `page` / `index` → FAIL (plus a warning for unserved drafts) | PASS |
| J | duplicate slug → FAIL (schema and reader) | PASS |
| K | storage order has no effect on pages | PASS |
| L | equal instants → id ASC across a page boundary | PASS |
| M | unit + real throwaway build: the newest project is first, the boundary shifts by one, the last page grows 23 → 24, stored records byte-identical | PASS |
| N | A (before/after) vs B: same route and JS; toggles = before pairs (3); B has no toggle | PASS |
| O | no quote → no figure / blockquote / heading | PASS |
| P | no blank rows anywhere (every large and small detail page); B lacks exactly builtYear/period/keywords/price; minimal = Type row only | PASS |
| Q | outlier `USD 987,654,321.5 / m²`, `99,999 m²` render | PASS |
| R | every home card → `/portfolio/<its slug>`; the view-all link → `/portfolio` (large, small) | PASS |
| S | the nav link appears on every large/small page and never on fixture-empty | PASS |
| T | sitemap = expected routes derived **from stored content** (180 / 14 / 1 URLs), each an emitted file | PASS |
| U | public robots allow + sitemap; **preview build of fixture-large**: `Disallow: /`, noindex on home/list/paged/detail/draft detail, empty sitemap; the draft detail exists only in preview | PASS |
| V | exclusive package QA with source terms (`?page=0`, `TOGGLED_UUIDS`, `add-view-count`, S3, `__NEXT_DATA__`, brand) on all 3 packages; no `lang="kr"` | PASS |
| W | runtime: 0 non-local requests in 24 browser visits (visual smoke) | PASS |
| X | buildInputId changed: `parts.releaseHash` f27823… → 512e4d… for all 3 sites | PASS |
| Y | the previous package (built with f27823) is intact on all 3 sites; **and** the current builder rebuilds a site re-pinned to f27823 (1.0.0-shaped data) | PASS |

**Further checks in the same file**
- Import gate:
  - `next/navigation` is `{ notFound }` only; redirect, useRouter, namespace, default, side-effect, re-export and dynamic imports are refused.
  - `"next"` is **type-only**. This tightens a Slice 1 gap that the reviewer found: `import next from "next"` is now refused.
- `DETAIL_TEMPLATE_COUNT = 1`.
- Route-declaration validation, and `pruneRoutes` containment (`../../etc`, missing dir, non-dynamic segment).
- Content-contract bounds, the 2-decimal contract, duration singular/plural, and period formatting.
- The legacy preflight shape.
- Titles: page numbers, detail + brand, canonical on origin only, home unchanged.
- The 404 page (site header/footer, localized, one `<title>`, noindex).
- Slot proof on the new sections, including the recorded `heroImage` media slot = site / hidden.

**`slice1.test.ts` updated (not weakened)**
- The link check now resolves `/portfolio` and `/portfolio/<slug>` links to emitted files. Anchors must still exist.
- The idempotency check uses the manifest version instead of a hard-coded `"1.0.0"`.

## Independent review

A fresh-context strong-model reviewer first found **1 BLOCKER**: the builder could no longer build 1.0.0-pinned sites (preflight shape). It also found several MINOR items (`next/navigation` too wide, draft reserved slugs, test gaps, accessibility) and some NITs.

All were fixed. The reviewer then re-verified and reported **no BLOCKER/MAJOR remaining** and no regressions. The reviewer rebuilt its own old-release repro with the current builder, and the result was byte-identical (packageHash) to the repo's existing 1.0.0 package.

The reviewer's remaining minors were fixed too: `"next"` is now type-only, the 404 has a localized `<title>`, and there is an alt fallback. The one remaining item is an open item in 06: re-pinning Step 4 content to 1.0.0.
