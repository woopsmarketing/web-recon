# Portfolio media 1.1 golden integration package

The producer-authoritative fixture for **Portfolio document 1.1** — Integration Contract V0.2
(`docs/reports/integration/07-integration-contract-v0.2-candidate.md`, rev 9.2.1) plus the additive
media addendum (`docs/reports/integration/08-portfolio-media-1.1-addendum.md`, decision D1 of
`docs/work/portfolio-experience-v1/02-contract-and-architecture-decisions.md`). These are the bytes
web-recon's emitter actually produces — not a hand-made example. Copy this directory as-is to the
consumer's fixtures.

| | |
|---|---|
| site | `boost-interior-demo` (a DEMO corpus: 19 sample cases, not customer projects) |
| mode | `public` |
| at | `2026-09-22T12:00:00Z` (the pinned time of `platform/test/integration.test.ts`) |
| template routes | `templates/interior-01/v1` |
| manifest `schemaVersion` | `"0.1"` (unchanged) |
| document `schemaVersion` | `"1.1"` (minor: `records[].media` added) |
| producer version | `3` |

What 1.1 adds, per record (`media`, presentation only, last key of the record):

- `cover` on all 19 records — the authored `cover` of `content/projects.json`.
- `gallery` + `totalCount` on the 8 records that author a gallery (bi-01 … bi-08): the AFTER images
  of `galleryGroups[].items[].image`, authored order, the first 12. `before` images are not exported
  and not counted.
- bi-01 authors 13 after images → `gallery` has 12, `totalCount` is 13, so a consumer derives
  `hasMore = totalCount > gallery.length = true`. No `hasMore` key is emitted (booleans are not part
  of the schema). 41 gallery images are exported in all, `totalCount` sums to 42.
- `src` is the asset's same-origin `publicPath` (`/assets/<sha256[0:20]>.jpg`), `width`/`height` are
  the registry's pixel size (all 1600×1200 here), `alt` is the authored alt (every image of this
  corpus has one; the producer never invents one).

`golden.json` records the resourceVersion, every file's bytes and sha256, the record counts (media
included) and the validator result. `platform/test/integration.test.ts` (E1b, G6, B2b, T1) and
`platform/test/detail-facts.test.ts` (G, B3) fail when the emitter or the canonical data no longer
produce exactly these bytes.

```sh
./node_modules/.bin/tsx --tsconfig platform/tsconfig.json platform/cli/integration-golden.ts          # check (exit 1 on drift)
./node_modules/.bin/tsx --tsconfig platform/tsconfig.json platform/cli/integration-golden.ts --write  # regenerate
```

Regenerating is a deliberate act: a new resourceVersion means the canonical data or the producer
changed, and the reason belongs in a report. One resourceVersion never names two byte sequences — the
generator refuses to overwrite a `portfolio.<version>.json` with different bytes.

The previous golden, `../portfolio-v0.2/` (document `"1.0"`, resourceVersion
`d56509c8100a56fdf9644baff78ff9e1`), is **frozen** as the 1.0 compatibility fixture: the producer no
longer emits it, nothing rewrites it, and the check above verifies its bytes are unchanged.
