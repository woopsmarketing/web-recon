# Portfolio V0.2 golden integration package

The producer-authoritative fixture for Integration Contract V0.2
(`docs/reports/integration/07-integration-contract-v0.2-candidate.md`, **rev 9.2.1**): the fixture both
sides test against (07 §16 step 2). These are the bytes web-recon's emitter actually produces — not a
hand-made example.

| | |
|---|---|
| site | `boost-interior-demo` (a DEMO corpus: 19 sample cases, not customer projects) |
| mode | `public` |
| at | `2026-09-22T12:00:00Z` (the pinned time of `platform/test/integration.test.ts`) |
| template routes | `templates/interior-01/v1` |
| manifest `schemaVersion` | `"0.1"` (unchanged by V0.2, 07 §3) |
| document `schemaVersion` | `"1.0"` |

`golden.json` records the resourceVersion, every file's bytes and sha256, the record counts and the
validator result. `platform/test/integration.test.ts` (G6, E1b) fails when the emitter or the canonical
data no longer produce exactly these bytes.

```sh
./node_modules/.bin/tsx --tsconfig platform/tsconfig.json platform/cli/integration-golden.ts          # check (exit 1 on drift)
./node_modules/.bin/tsx --tsconfig platform/tsconfig.json platform/cli/integration-golden.ts --write  # regenerate
```

Regenerating is a deliberate act: a new resourceVersion means the canonical data or the producer
changed, and the reason belongs in a report. One resourceVersion never names two byte sequences — the
generator refuses to overwrite a `portfolio.<version>.json` with different bytes.

Nothing here is published. The site's current package in `data/site-builds/` is still the V0.1 one.
