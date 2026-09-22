# Task 29 — Slotized Template E2E

Generated 2026-09-12T22:09:03.352Z · runtime 0.6 min

## Gates

| gate | verdict | detail |
| --- | --- | --- |
| S1 | **PASS** | rosee: present; channel: present |
| S2 | **PASS** | default render text provenance worst 100.00% over 6 measurements (FAIL <95%, target ≥99%) |
| S3 | **PASS** | rosee: 5 driven, +3/-5, 5 reordered; channel: 4 driven, +6/-6, 4 reordered · duplicate ids introduced 0 |
| S4 | **PASS** | default theme adds 0 bytes: true; mutated theme visible on 6/6 measurements — rosee: default css 12709582 B identical; rosee: overlay css +506144 B; rosee /17@390: 456/798 nodes repainted (color true, font false); rosee /34@390: 487/800 nodes repainted (color true, font false); rosee /17@1440: 791/798 nodes repainted (color true, font true); rosee /34@1440: 792/800 nodes repainted (color true, font true); channel: default css 8364801 B identical; channel: overlay css +261935 B; channel /kr/pricing@390: 779/800 nodes repainted (color true, font true); channel /kr/pricing@1440: 780/800 nodes repainted (color true, font true) |
| S5 | **PASS** | every NEW-render check passed (render, overflow, ids, content volume, injected strings, identity, media, overlap) |

## Measurements

| site | variant | route | width | nodes | visible text | elements | overflow px | overlap | img/bg | broken img | dup ids | text from template |
| --- | --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| rosee | default | /17 | 390 | 1841 | 587 | 443 | 0 | 12 | 22/1 | 0 | 0 | 100.00% |
| rosee | default | /34 | 390 | 1425 | 361 | 190 | 0 | 0 | 26/0 | 0 | 0 | 100.00% |
| rosee | default | /17 | 1440 | 1841 | 546 | 437 | 0 | 0 | 22/1 | 0 | 0 | 100.00% |
| rosee | default | /34 | 1440 | 1425 | 262 | 290 | 0 | 0 | 25/3 | 0 | 0 | 100.00% |
| rosee | new | /17 | 390 | 1839 | 561 | 441 | 0 | 10 | 22/1 | 0 | 0 | — |
| rosee | new | /34 | 390 | 1425 | 304 | 190 | 0 | 0 | 26/0 | 0 | 0 | — |
| rosee | new | /17 | 1440 | 1839 | 499 | 437 | 0 | 0 | 22/1 | 0 | 0 | — |
| rosee | new | /34 | 1440 | 1425 | 232 | 290 | 0 | 0 | 25/3 | 0 | 0 | — |
| channel | default | /kr/pricing | 390 | 1470 | 4140 | 1060 | 0 | 0 | 14/3 | 9 | 8 | 100.00% |
| channel | default | /kr/pricing | 1440 | 1470 | 4308 | 1385 | 0 | 0 | 14/2 | 8 | 8 | 100.00% |
| channel | new | /kr/pricing | 390 | 1470 | 4135 | 1060 | 0 | 0 | 14/3 | 6 | 8 | — |
| channel | new | /kr/pricing | 1440 | 1470 | 4262 | 1385 | 0 | 0 | 14/2 | 6 | 8 | — |

## Renders

| site | variant | content pack | theme pack | applied | failed | overrides | repeaters | +items | -items | reordered | dup ids introduced | build s |
| --- | --- | --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| rosee | default | content-packs/default.json | theme-packs/default.json | 8833 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 2 |
| rosee | new | content-packs/realistic.json | theme-packs/mutated.json | 9292 | 0 | 499 | 5 | 3 | 5 | 5 | 0 | 2 |
| channel | default | content-packs/default.json | theme-packs/default.json | 4674 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 2 |
| channel | new | content-packs/realistic.json | theme-packs/mutated.json | 4674 | 0 | 28 | 4 | 6 | 6 | 4 | 0 | 2 |

## Findings

- **WARN** `BROKEN_IMAGES` [channel/new /kr/pricing@390] new 6 / baseline 9 img with naturalWidth 0
- **WARN** `BROKEN_IMAGES` [channel/new /kr/pricing@1440] new 6 / baseline 8 img with naturalWidth 0

