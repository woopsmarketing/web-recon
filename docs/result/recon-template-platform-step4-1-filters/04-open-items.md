# 04 — Open items

| # | item | why open | suggested owner / step |
|---|---|---|---|
| 1 | **Re-pin rollback = data migration.** Re-pinning a 1.2.0 site to `1.1.0-512e4dd932b4` builds only after its settings and slots are stripped to the 1.1.0 shape. Old releases have strict schemas and refuse the new `portfolio.index` keys (the same class as Step 4 open item #2) | The immutable old release cannot learn new keys. The supported rollback is the retained **previous package** (`previous.json`, intact, tested) | platform: rollback runbook, and later a "strip keys unknown to release X" migration step. Builder hardening was out of scope here |
| 2 | **SERVICE_FILTER = DEFERRED** | The source's service axis (building age OLD/NEW) has no canonical field. The type filter uses the existing `category`. A service ontology is not invented | add only with a canonical-model decision (e.g. a vertical `buildingAge` fact) backed by real customer data |
| 3 | Unfiltered flash on a direct or shared filtered link | The static HTML is the unfiltered page 1. The island applies the URL after hydration (template code cannot read `location` before paint under the gate) | optional: a pending/`aria-busy` state while a query exists |
| 4 | 평 area basis | The schema says "floor area". Korean listings often say "34평형" = supply area (≈ 84 m² exclusive = 25.4평 → 20평대). The NL seam ("서울 34평 아파트") depends on this | decide before BoostChat/NL work: a schema note, or an `areaBasis` fact |
| 5 | Keyword haystack excludes the category name | "욕실" finds bathroom projects only when the word is in a title, summary, scope or keyword. The type filter covers the category | NL seam: the parser maps category words to `type` |
| 6 | Slot vs localization for UI vocabulary (the 6 sort option names are slots) | Follows the existing Template convention; a Korean site needs Korean words | **DEFERRED** to the review before Template 2 (spec §11) |
| 7 | Index budget | fixture-large `/portfolio` is 157 KB raw / 15.8 KB gzip for 173 projects; the static page-1 cards are serialized twice | revisit above ~1,000 projects (e.g. drop duplicate card props, or a split index file) |
| 8 | No-JS search | The search box and chips need JS. Without JS, `/portfolio` is the full static list with crawlable pagination | acceptable; optional GET-form fallback |
| 9 | Paged routes have no filter UI | `/portfolio/page/n` stays exactly the static Step 4 page (spec: unchanged, crawlable). Users filter from `/portfolio` | optional link "search & filter" → `/portfolio` |
| 10 | URL canonicalization drops foreign query params on `/portfolio` (e.g. campaign tags) after a filter change or on load | Template-owned params only | revisit if analytics tagging is introduced (platform analytics concern) |
| 11 | Filters are on by default (`filtersEnabled: true`) | A site re-pinned to 1.2.0 gets filters unless it opts out. Price stays off until a `priceScale` is chosen | release note for the next upgrade |
| 12 | Test Z is string/regex based, not AST based | Catches the known shapes of re-implementation (sort, case folding, date parsing, field reads, index iteration) | optional AST rule in the release gate |
| 13 | Older packages beyond `previous` were pruned (accepted retention) | The Slice 1 `f27823` packages were pruned by this build. Its **release** is untouched and verifies | none (accepted rule) |
