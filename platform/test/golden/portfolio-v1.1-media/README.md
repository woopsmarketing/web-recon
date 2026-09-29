# Portfolio media 1.1 golden integration package

The producer-authoritative fixture for **Portfolio document 1.1** — Integration Contract V0.2
(`docs/reports/integration/07-integration-contract-v0.2-candidate.md`, rev 9.2.1) plus the additive
media addendum (`docs/reports/integration/08-portfolio-media-1.1-addendum.md`, decision D1 of
`docs/work/portfolio-experience-v1/02-contract-and-architecture-decisions.md`). These are the bytes
web-recon's emitter actually produces — not a hand-made example. Copy this directory as-is to the
consumer's fixtures.

| | |
|---|---|
| site | `boost-interior-demo` (8 cases, bi-01 … bi-08; the 11 synthetic fixtures bi-09 … bi-19 left production on 2026-09-29) |
| mode | `public` |
| at | `2026-09-22T12:00:00Z` (the pinned time of `platform/test/integration.test.ts`) |
| template routes | `templates/interior-01/v1` |
| manifest `schemaVersion` | `"0.1"` (unchanged) |
| document `schemaVersion` | `"1.1"` (minor: `records[].media` added) |
| producer version | `4` (media ownership, `docs/work/portfolio-experience-v1/03-media-truth-audit.md`) |

What 1.1 adds, per record (`media`, presentation only, last key of the record):

- `cover` on all 8 records (bi-01 … bi-08): each record's authored `cover` is attributable to it (it
  is in the record's own gallery). An asset is attributable to a record iff it is in that record's
  own `galleryGroups` (after or before) or that record is the only one referencing it at all
  (producer 4, `docs/work/portfolio-experience-v1/03-media-truth-audit.md`).
- `gallery` + `totalCount` on the 8 records: the AFTER images of `galleryGroups[].items[].image`,
  authored order, the first 12, one entry per asset. `before` images are not exported and not counted.
- bi-01 authors 13 after images → `gallery` has 12, `totalCount` is 13, so a consumer derives
  `hasMore = totalCount > gallery.length = true`. No `hasMore` key is emitted (booleans are not part
  of the schema). 41 gallery images are exported in all, `totalCount` sums to 42.
- `src` is the asset's same-origin `publicPath` (`/assets/<sha256[0:20]>.jpg`), `width`/`height` are
  the registry's pixel size (all 1600×1200 here), `alt` is the authored alt (every image of this
  corpus has one; the producer never invents one).

Record facts of this production document: 8 records; projectType 2 full / 2 partial / 4 absent; no
record authors a total price; 6 authored per-area prices, none derived; 9 work scopes; facets
category 4 · style 6 · tag 2.

`golden.json` records the resourceVersion, every file's bytes and sha256, the record counts (media
included) and the validator result. `platform/test/integration.test.ts` (E1b, G6, G7, B2b, T1),
`platform/test/detail-facts.test.ts` (G0, G) and `platform/test/portfolio-production-truth.test.ts`
fail when the emitter or the canonical data no longer produce exactly these bytes.

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

## The 19-record document is now a QA artifact

Until 2026-09-29 this directory held the 19-record document `portfolio.856361f52e3f1b5022cce13a31afc171.json`
(bi-01 … bi-19). The 11 records bi-09 … bi-19 are VERIFIED_SYNTHETIC test fixtures
(`docs/work/portfolio-experience-v1/04-record-truth-audit.md`) and left the production site, so that
document is **no longer production**. It is kept, byte-identical, as a QA golden next to the
synthetic fixture: `platform/test/fixtures/boost-interior-synthetic/qa-golden/` (TEST_ONLY; boost-chat
keeps the same bytes as its matcher QA fixture). The producer did not change (`PRODUCER_VERSION` 4,
document `"1.1"`): the QA composition (production + fixture) re-emits that document byte for byte,
and each of the 8 production records here is deep-equal to its record there.
