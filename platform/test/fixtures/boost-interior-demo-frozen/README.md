# boost-interior-demo — frozen portfolio dataset (TEST ONLY)

The portfolio of `data/sites/boost-interior-demo` exactly as it stood on 2026-10-06, the last
hand-authored state before Portfolio Content System V1:

- `content/projects.json` — the 8 production records bi-01 … bi-08 (byte copy)
- `content/categories.json` — byte copy
- `assets/registry.json` — only the 44 registry entries those records reference
- `assets/bi0N-*.jpg` — the 44 portfolio images (byte copies)

Site-level files (site.json, settings, slots, theme, banners, logo, `site-*.jpg`, …) are NOT here:
`platform/test/demo-frozen-dataset.ts` (`frozenDemoRoot`) composes this dataset into a throwaway copy
of the LIVE site directory, so a re-pin or a copy change still moves every pinned literal as before.

## One dataset, three sites

`data/sites/boost-interior-demo-02` and `data/sites/boost-interior-demo-03` (the reuse sites of
interior-02 and interior-03) were authored with this same portfolio — the same two documents, the same
44 images and the same 44 registry entries, byte for byte. `frozenDemoRoot(repoRoot, siteId)` composes
this dataset into a copy of that site's own live directory, so no second copy of the images is kept.
`interior-02.test.ts` / `interior-03.test.ts` check each site's tracked package against that
composition (L) and hold the live directory to what it is in the checkout (L2).

## Why it exists

From Portfolio Content System V1 on, the live directory's portfolio is regenerated from BoostChat by
`pnpm site:portfolio-sync` whenever the customer publishes. The data-truth tests
(`portfolio-production-truth.test.ts`, `integration.test.ts`, `detail-facts.test.ts`) pin literal
hashes of the records above (Portfolio Document `968afbccb944940d8d3c099dd54df5be`, …); those
literals are asserted against this frozen copy. The live directory is covered by the checks that hold
for any dataset (`[live]` blocks of the same tests).

## Rules

- Never edit these files. `demo-frozen-dataset.ts` pins their sha256 as literals and throws on drift.
- No runtime, build or publish path reads this directory (tests only).
- While the live directory is still hand-authored, it must be byte-identical to this dataset
  (`portfolio-production-truth` LV1). A portfolio change is made in BoostChat, not by hand.
