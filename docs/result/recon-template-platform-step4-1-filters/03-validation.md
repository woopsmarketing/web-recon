# 03 — Validation

Everything below ran once in the repository root after development in a scratch devroot. Date: 2026-09-18, ~23:30 KST.

```
pnpm template:release interior-01@1                                 → created interior-01-1.2.0-93fb66acda7d (45 files)
pnpm fixtures:generate --release interior-01-1.2.0-93fb66acda7d      → 3 sites regenerated + re-pinned
pnpm site:build fixture-large | fixture-small | fixture-empty       → built, package QA pass (182 / 16 / 3 HTML)
pnpm test:platform            → slice1 72/72 · step4 47/47 · step41 35/35, exit 0
pnpm typecheck:platform       → exit 0
tsc --noEmit -p tsconfig.json → exit 0 (root project)
tsx scripts/template-platform-step41-visual-smoke.ts → 180/180 checks, 7 visits (screens/summary.json)
```

- The release hash is identical to the last devroot release, so the verified code is exactly the shipped code.

## Spec checks A–Z

- `T` = `platform/test/step41.test.ts`
- `S` = `scripts/template-platform-step41-visual-smoke.ts` (browser)

| # | check | where | result |
|---|---|---|---|
| A | unfiltered `/portfolio`: SSR grid + route pager + title + canonical are byte-identical to the Step 4 package, and it stays indexable. **Every other page's `<main>` is byte-identical** (large 181, small 15, empty 3 pages) | T | PASS |
| B | 173 → 30/30/30/30/30/23 on the static routes in the exact order; paged routes carry no filter UI | T, S | PASS |
| C | index = exactly the served ids in default order (173 / 12). Vocabulary scales: large m²/USD, small 평/KRW. No index on paged routes | T | PASS |
| D | no draft/scheduled id, slug or unique title in `portfolio.html` / `portfolio.txt`. Only allowed fields; no body, quote, gallery, status or source field names | T | PASS |
| E | area: `[min,max)` edges (59.99/60/89.99/90), 평 and sq ft converted (66.12 m² → 20평대, 66.11 → 20평 미만), identity for the same unit, missing never matches | T | PASS |
| F | style: OR, records without keywords never match, vocabulary order | T | PASS |
| G | price: edges, sq ft → m² conversion, EUR (other currency) and missing never match, no FX; `priceScale none` → no price filter, no price sort, **no price data shipped** (throwaway build) | T | PASS |
| H | **type** via the existing `category`: OR, unused categories not offered. **SERVICE = DEFERRED** (no canonical field; see 01 D) | T | PASS / DEFERRED |
| I | keyword by title (case, whitespace) | T, S | PASS |
| J | keyword by location | T, S | PASS |
| K | keyword by style keyword and by scope; Korean substring; token AND; never across fields | T | PASS |
| L | newest = the ContentReader latest order (instant, id ASC); storage order irrelevant; oldest | T | PASS |
| M | area/price sorts: missing (and other currency) LAST in both directions; ties → default order | T, S (parity) | PASS |
| N | OR within a dimension / AND across dimensions | T | PASS |
| O | combined filters (all 5 dimensions + sort) | T, S | PASS |
| P | zero-result state: honest empty list, empty state with reset, no pager | T, S | PASS |
| Q | reset restores all 173 (30 cards, clean URL, no robots meta) | T, S | PASS |
| R | a direct load of a query URL restores chips, select and page (parity); stale values are canonicalized | S | PASS |
| S | back/forward restores the state: no document request, window marker survives. List → detail → back keeps the query | S | PASS |
| T | an active filter change on fp=2 resets to page 1 (fp removed) | S | PASS |
| U | filtered pagination (living 59 → 2 pages; fp=2 parity; prev). An out-of-range fp is clamped in the URL | S | PASS |
| V | HTML set identical to Step 4 (182/16/3), route plan and pruning unchanged, no filter-shaped files | T | PASS |
| W | `sitemap.xml` + `robots.txt` byte-identical to Step 4; 180 URLs, none with a query | T | PASS |
| X | 0 non-local requests in all 7 visits | S | PASS |
| Y | package QA with frozen terms; no source param/API names in template code, the filter module or the packages | T | PASS |
| Z | `PortfolioBrowser` imports and uses the platform evaluator. No template file sorts, folds case, parses dates, reads filter fields or iterates the index itself. The pure module has no imports (AST-free string rules; see 04) | T | PASS |

## Other checks in `step41.test.ts`

- **Parity:** the evaluator over the **shipped** index = the evaluator over the stored canonical records, for 7 filters.
- **Fixture coverage:**
  - ≥ 4 area buckets, styles and price buckets
  - ≥ 4 locations
  - missing price, keywords, area and location
  - more than 30 matches, a combination with results and a zero-result combination
  - 평 and m² mixed in the small fixture
- **Release:** all 3 pins and builds are on 93fb66…. The release verifies. The Step 4 release `512e4dd932b4` is unchanged: hash, read-only files, no 4.1 files.
- **Rollback:** each site's `previous.json` is the Step 4 package, intact.
- **Settings:** defaults; 1.1.0-shaped documents stay valid; unknown scale, duplicate or unknown group, empty groups, `defaultSort` and `buckets` are refused.
- **Gate:** exactly the 2 new modules are allowed. `@platform/content/reader`, `@platform/site/load`, `window`, `history`, `fetch`, `localStorage`, `globalThis` and `useSearchParams` stay refused.
- **Slots:** the 19 new slot keys exactly. Small = site values, large = neutral defaults. Korean copy is rendered.
- **Throwaway builds (never touching `data/sites` or `data/site-builds`):**
  - `filtersEnabled=false` → `/portfolio` `<main>` byte-identical to Step 4
  - `priceScale none` → no price data in the index
  - re-pin to 1.1.0 with 1.1.0-shaped data → builds; `<main>` = the Step 4 package

## Step 4 suite changes (not weakened)

- **X/Y** asserted "previous = the 1.0.0 package". After this re-pin, the previous package is legitimately the 1.1.0 one.
  - They now assert "previous = an older, verified release ≠ current, intact".
  - Test B still pins the 1.0.0 `f27823` release hash and read-only files.
- **The 1.0.0 re-pin build** also strips the new `portfolio.index` settings override, as it already stripped the 1.1.0 slots and fields.

## Visual smoke (repo packages)

**7 visits, 180/180 checks.** Across all visits: 0 console errors, 0 page errors, 0 non-local requests, 0 broken images, 0 horizontal overflow (also re-checked after opening the mobile panel and after filtering).

| visit | checked |
|---|---|
| large `/portfolio` 1440 | full sequence: search, chip, filtered paging, combined, sorts, page reset, zero-result + reset, main reset, direct load, back/forward, detail round trip, fp clamp, robots meta on/off. **Parity vs the Node evaluator** at every step |
| large `/portfolio` 1000 | ≥ 900 band: toggle hidden, inline panel visible (strict per band), parity |
| large `/portfolio` 390 | toggle `aria-expanded` opens the panel; search, chip, reset, zero-result, parity |
| large `/portfolio/page/2` 1440 | static page unchanged: 30 cards, no `[data-filter]` |
| small `/portfolio` 1440 / 390 | Korean labels (필터 · 정렬 · 평 buckets), one chip with parity, coherent warm theme |
| empty `/portfolio` | HTTP 404: no route at all, unlike the filtered-zero state |

Screens are in [screens/](screens/): unfiltered 1440/1000/390, combined filter, zero-result (desktop and mobile), mobile panel open (large, small) and small desktop.

## Independent review

A fresh-context reviewer (strong model, not told the expected verdict) found **0 BLOCKER, 2 MAJOR, 8 MINOR and 5 NIT**.

| item | disposition |
|---|---|
| **M2** history writes passed Next's state → router URL not synced (a latent stale-URL write-back) | **fixed** (`pushState(null, …)`), plus a smoke round trip: detail → back → filter |
| **M1** re-pin rollback needs old-shape data (strict schemas) | **recorded** as a named limitation (04 #1). Test renamed to say "after migration". The previous-package rollback works. Builder hardening is out of scope (spec §16) |
| m1 unfiltered flash on a direct filtered link | recorded (04 #3) |
| m2 stale links silently widen | **fixed**: URL canonicalized on load, plus documented |
| m3 noindex is JS-only | **documented**: the canonical is the primary signal |
| m4 price data shipped without a scale | **fixed** + throwaway-build test |
| m5 평 area basis (전용 vs 공급) | recorded (04 #4) |
| m6 out-of-range fp stays in the URL | **fixed** (replace) + smoke |
| m7 focus lost on reset | **fixed** |
| m8 test Z bypassable | **tightened** (field reads / index iteration in the island and codec) |
| NITs: surrogate-safe keyword cap | **fixed** |
| NITs: category not in the haystack, size budget, no-JS search, default-on filters | recorded (04) |

A second session (web-recon-07) was also working on the same task during implementation. Coordination:
- This session became the single writer; web-recon-07 stopped its writes.
- Its edits were kept:
  - the pure module has no imports at all
  - the strict per-band toggle check in the smoke
- Only one repo-root release/build run happened.
