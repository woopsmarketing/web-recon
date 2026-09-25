# 36b — Portfolio V0.2 producer → BoostChat handoff

| | |
|---|---|
| date | 2026-09-26 |
| from | web-recon producer work, [`36-producer-v0.2-implementation.md`](36-producer-v0.2-implementation.md) |
| to | the next BoostChat session (WP03 golden replacement, matcher V0.2, Interior Portfolio Search Adapter) |
| contract | `docs/reports/integration/07-integration-contract-v0.2-candidate.md`, rev 9.2.1 |

```
PRODUCER_COMMIT              = d284b93e34504005185f973b4ff456c21131f543   (web-recon, branch track-b/static-deployment-foundation)
CONTRACT_REVISION            = 9.2.1

DOCUMENT_SCHEMA_VERSION      = "1.0"
MANIFEST_SCHEMA_VERSION      = "0.1"   (unchanged; 07 §3, INV-27)

RESOURCE_VERSION             = d56509c8100a56fdf9644baff78ff9e1
RESOURCE_SHA256              = c76624146b5a753003fa5f0e3619534e3a80bd2fd967ed975d392e9180453816   (11,608 B)
MANIFEST_SHA256              = b2f52b736570b954fb257f03cc5897426dee7f199d95d3654221290644d8ce5d   (274 B)

RECORD_COUNT                 = 19

GOLDEN_PATH                  = web-recon: platform/test/golden/portfolio-v0.2/
                               manifest.json · portfolio.d56509c8100a56fdf9644baff78ff9e1.json · golden.json · README.md
GOLDEN_GENERATION_COMMAND    = ./node_modules/.bin/tsx --tsconfig platform/tsconfig.json platform/cli/integration-golden.ts --write
                               (without --write: check only, exit 1 on drift)
GOLDEN_INPUT                 = site boost-interior-demo · mode public · at 2026-09-22T12:00:00Z · routes of interior-01/v1

BOOSTCHAT_PROVISIONAL_FIXTURE = boost-chat: scripts/fixtures/first-party/golden-v0.2/
IDENTICAL_TO_PROVISIONAL     = YES — both files byte-identical (cmp; sha256 equal)
IF_NO_DIFFERENCES            = n/a (no JSON path differs)

V01_COMPATIBILITY            = PRESERVED — the V0.1 package in data/site-builds (current.json, portfolio
                               6346c472…, 8 records) and the live pilot rollback package are byte-intact;
                               site:publish would still plan V0.1; manifest schemaVersion stays "0.1"
PUBLISH_ALLOWED              = NO
```

## What changes for the consumer fixture

Nothing in the bytes. The provisional fixture was produced by this same emitter from the same canonical
data before it was committed, and it has not moved:

| file | provisional (boost-chat) | canonical (web-recon golden) |
|---|---|---|
| `manifest.json` | 274 B, `b2f52b73…d8ce5d` | 274 B, `b2f52b73…d8ce5d` |
| `portfolio.d56509c8100a56fdf9644baff78ff9e1.json` | 11,608 B, `c7662414…453816` | 11,608 B, `c7662414…453816` |

What the next BoostChat session should change is **provenance**, not data: the fixture README says it
came from *"HEAD 44a48a0 + uncommitted V0.2 producer work tree"*; it can now cite `PRODUCER_COMMIT` and
the golden path above. `WP03-GOLDEN` in the ledger (`docs/status/interior-portfolio-v0.2.md`) closes
when that is done.

Corpus facts the consumer may pin (from `golden.json`; asserted by web-recon `K1`):

| | |
|---|---|
| `projectType` | full_remodel 7 · partial_remodel 7 · absent 5 (`bi-02`, `bi-03`, `bi-05`, `bi-08`, `bi-19`) |
| `pricing.total` | exact 10 · range 1 (`bi-13`) · absent 8 |
| `pricing.perArea` | authored 6 (`bi-01`, `bi-02`, `bi-03`, `bi-05`, `bi-07`, `bi-08`) · derived 4 (`bi-09`…`bi-12`) · absent 9 |
| `document.workScopes` | 17 ids |
| facets | category 4 · style 9 · tag 3 |
| missing on purpose | area `bi-15`; style `bi-18`; pricing `bi-04`, `bi-06`; property.type `bi-06` |

## NEXT_CONSUMER_ACTIONS

1. **Replace the provisional golden** — re-point its README/provenance at `PRODUCER_COMMIT` and
   `GOLDEN_PATH`; confirm the bytes are unchanged (they are identical today). Keep the consumer's
   golden test reading exactly these two files.
2. **Implement matcher V0.2** — the evaluation function of 07 §14.3 (`EV1`–`EV4`), consuming
   `projectType`, `workScopeIds`, `property.area`, `pricing.total` (and `facets.style` as a bonus only;
   `location` weight 0, `LO1`). Carry `PORTFOLIO-F2`'s conservative disclosure.
3. **Implement the Interior Portfolio Search Adapter** over the V0.2 fields (GC1: nothing of the annex
   in the generic core).
4. **Run the acceptance scenarios** — 07 §19 rows A–I and the `CINV-*` fixtures against this golden.
5. **Only then prepare a controlled publish** — 07 §16 steps 4–6: new immutable package, pointer moved
   last, rollback intact; snapshot refresh; V0.2 search tests on the real snapshot. The dual read stays
   until `RO2` (`WP03-DUAL-READ`).

Until step 5, web-recon does not build a V0.2 package into `data/site-builds/` and does not publish
(`PORTFOLIO-PUBLISH-GATE`).
