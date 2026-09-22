# Phase 2 — Apartmentary build

One build. No observe rerun, no reconstruction, no responsive QA, no full
regression. The Source Package was left byte-identical.

```
pnpm preserve:build data/apartmentary.com/2026-09-16T05-27-10-722Z
```

| | |
|---|---|
| Source run | `data/apartmentary.com/2026-09-16T05-27-10-722Z` |
| Source URL | https://apartmentary.com/ |
| Clone | `data/apartmentary.com/preservation-clones/2026-09-16T06-42-28-282Z` |
| Build run id | `2026-09-16T06-42-28-282Z` |
| Build time | 7.7s |
| Artifact size | 61 MB, 103 files |
| Warnings | none |

## Resources

| Status | Count |
|---|---|
| fetched | 78 |
| from-source-package (Phase 1 script bytes, no refetch) | 19 |
| skipped-analytics | 1 |
| skipped-over-budget | 1 |
| **failed** | **0** |

99 ledger entries, 99 distinct URLs · 97 localized · 47 shared between
viewports · 50 viewport-specific · 2 deduped by content hash.

Fetched by type: 32 JPEG (43.2 MB), 21 PNG (22.3 MB), 8 OTF + 10 WOFF2 + 5 WOFF
(2.6 MB of fonts), 1 SVG, 1 web manifest. Plus 19 preserved JS files (1.2 MB)
carried over from Phase 1 without a second request.

**Fonts were localized.** The page renders in `Decimal` and `SpoqaHanSans`
from local bytes, confirmed in the browser — not a fallback stack.

## Stylesheets

All 9 entries paired to their DOM node by document order in both viewports
(`domMatch: "document-order"`), so the cascade is the source's own.

| Entry | Source type | Representation | Desktop bytes | Mobile bytes |
|---|---|---|---|---|
| st0001 | style-tag | authored-inline | 3,028 | 3,028 |
| st0002 | style-tag | authored-inline | 20,339 | 20,339 |
| st0003 | cssom-runtime | runtime-derived-cssom | 23,857 | **11,117** |
| st0004 | linked | authored-linked | 29,372 | 29,372 |
| st0005 | linked | authored-linked | 7,384 | 7,384 |
| st0006 | style-tag | authored-inline | 20,260 | 20,260 |
| st0007 | style-tag | authored-inline | 907 | 907 |
| st0008 | cssom-runtime | **unresolved** | 0 | 0 |
| st0009 | cssom-runtime | runtime-derived-cssom | 2,672 | **2,612** |

st0003 and st0009 differ by viewport — emotion and styled-components emitted
different rules for each tree. That is the concrete reason the variants are kept
apart. st0008 is an emotion global sheet that held **0 rules at capture**;
nothing exists to preserve and it is recorded as `unresolved` rather than
dropped.

56 CSS `url()` references were rewritten per viewport. One `<iframe>` and two
trackers were neutralized; no meta refresh, `<object>`, `<embed>` or inline
event handler exists on this page.

## Scripts

| | Desktop | Mobile |
|---|---|---|
| Total `<script>` elements | 32 | 31 |
| Neutralized (executable) | 31 | 30 |
| Kept as data (`application/json`) | 1 | 1 |
| Bytes preserved under `scripts/` | 12 | 12 |
| **Executed** | **0** | **0** |

19 distinct JS files (1.2 MB) are preserved on disk, referenced by no document,
and each is recorded once as `shared` between the two viewports rather than
counted twice.

## Residual dependencies — 3 recorded, 1 still fetched

| URL | Reason | Still fetched? |
|---|---|---|
| `apartmentary-static.s3…/main-introduce.mp4` | over-size-budget (97,941,978 B > 8 MB) | **yes** |
| `facebook.com/tr?id=…&noscript=1` | analytics-neutralized | no |
| `googletagmanager.com/ns.html?id=GTM-…` | analytics-neutralized | no |

The hero video deliberately still streams from S3 so a reviewer can see it.
**The clone is therefore not source-independent, and does not claim to be** —
`manifest.limitations` says so in as many words.

The two trackers were hidden inside `<noscript>`. Both are inert in the clone
and neither was fetched at build time.

## Browser sanity — 3/3 OK

No pixel comparison, no width sweep. Only: does it load, do local resources
resolve, is source JS inert, is there catastrophic overflow.

| Case | Height | Sheets / rules | Images | Overflow | Local 404s | JS errors | Live scripts |
|---|---|---|---|---|---|---|---|
| desktop @1440×900 | 6,056 | 9 / 598 | 42, 0 broken | 0 | 0 | 0 | 0 |
| desktop @1024×900 | 5,880 | 9 / 598 | 42, 0 broken | 0 | 0 | 0 | 0 |
| mobile @390×844 | 4,804 | 9 / 522 | 35, 0 broken | 0 | 0 | 0 | 0 |

`window.ChannelIO` and `window.dataLayer` are `undefined` in all three —
source JS did not run. Expected hero copy
("기대와 설렘이 가득한 리모델링 경험") is present in all three.

The desktop variant reflows correctly from 1440 to 1024 (height 6,056 → 5,880)
because the source's own media queries are still live queries.

Screenshots: `screenshots/{desktop,desktop-1024,mobile}.png` plus `-full`
variants.
