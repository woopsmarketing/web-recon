# 03 — Control equivalence (Strategy A 3C ↔ Strategy B 3C.1)

Source: `…/2026-09-16T14-30-58-205Z/control-equivalence.json`, **36/36 PASS**. It is computed by `prepare.mjs` before any
browser runs, and `run.mjs` refuses to start unless it passed.

## Required items (prompt §3)

| item | result | evidence |
|---|---|---|
| same 9 replay scripts | ✅ | `scripts.sameCount (9)`, `scripts.sameGraphIdsAndRoles` |
| same script order | ✅ | `scripts.sameOrder+servedPath+sha256` |
| same script sha256 | ✅ | same, plus 9/9 sha verified in transit at run time (`04`) |
| same buildId | ✅ | `buildId.same` (`yMHNQjHujDVTgIp539WqR`), and `__NEXT_DATA__` byte-identical to A's document |
| same source runtime graph | ✅ | same `runtimeGraph` input, same ids/roles; activated start tags byte-identical |
| same synthetic fixture JSON | ✅ | `fixtures.fixtureBytesEqualToStrategyAFrozenCopy`, `fixtures.contractBytesEqualToStrategyAFrozenCopy`, both shas equal A's manifest; deterministic regeneration passes |
| same fixture item counts | ✅ | `stubs.identicalToStrategyA`: mainBanners 9 / portfoliosArea1 10 / portfoliosArea2 4 / reviews 6 |
| same synthetic image bytes | ✅ | `images.syntheticImageBytesIdenticalToStrategyA` (path + sha set) |
| same four API request matchers | ✅ | `stubs.identicalToStrategyA` (method, origin, pathname, query, fixture id, response bytes) |
| same `karrotPixel` stand-in semantics | ✅ | `standIns.onlyKarrotShapeSameAsA`, `config.sameCondition externalGlobalStandIns` |
| same browser/runtime environment | ✅ (weak proof, see note) | same Playwright 1.62.1 install; reused libs unmodified since the A run, **by file mtime only** (`harness.reusedLibsUnmodifiedSinceStrategyARun`). No 3C-era artifact records the lib hashes (review MINOR 3). B records `browserVersion`; A did not, so equality is inferred from the unchanged install. Future phases should record lib sha256 in each manifest |
| initial viewport 1440×900 | ✅ | `config.initialViewport1440x900` |
| responsive probe 390×844 | ✅ | `config.resizeProbe390x844` |
| network fail-closed policy | ✅ | same `network-guard.mjs`, same resolver rules (copied `run.mjs` launch args unchanged) |
| source-JS mutation prohibition | ✅ | same byte-identity checks; `sourceJsBytesModified:false` |
| baseline integrity checks | ✅ (extended) | A hashed Phase 1 + Phase 2. B hashes those plus 3B, 3B.1 and both 3C artifacts, the 3A/3B/3B.1/3C reports, and the 3B/3B.1/3C harness dirs |
| settle rule | ✅ | `config.sameCondition settle`; A's probe/interaction/timing config (`fidelityProbes`) identical |

## Differences (honest list, from `control-equivalence.json → differences`)

| id | intended | difference | threat to causal reading |
|---|---|---|---|
| D1 | **yes** | hydration base: Phase 2 post-runtime DOM → Phase 1 initial response | the variable under test |
| D2 | no | preparation: A = Phase 2 transform (URL localization, tracker/iframe/beacon/navigation neutralization, runtime-derived style tags) + activation splice; B = script start-tag splices only | inseparable from D1: the Phase 2 transform is part of what "post-runtime DOM" means in A. No A-only rewrite targets the footer row |
| D3 | no | **style-tag composition**: A carries 3 extra preserved tags (runtime-derived `css` 23,857 B / 159 rules, a second `css-global`, a styled-components tag); B carries the SSR tags only | examined in `07`. The decisive rules (`css-1rr4qq7` flex, `css-v7v99c` width) come from the **same** SSR tag in both arms, with the same rule index and hash. In A, the A-only runtime-derived sheet also matches the row (`css-1qi39fj`), the logo box (`css-17taob2`) and the grid (`css-1d3bbye`). Each of those rules is a byte-identical duplicate of a rule in the client-inserted sheet, and that sheet has the same hash in both arms (`6d32fac8`). No A-only rule matches the content wrapper or the spacer. **Not a confounder** for the footer result |
| D4 | no | font delivery: rewritten `../assets` URLs (A) vs the router local mirror (B) | the mirror was used 0 times. Both arms loaded 6 fonts with an identical sha set |
| D5 | no | CSS delivery: `/styles/<sha>.css` (A) vs `/_next/static/css/*.css` (B) | same bytes (CSSOM hashes `7fbf1480`, `e0429fb9` equal in both arms) |
| D6 | no | unmapped root-relative refs in B: `polyfills` only (neutralized, never requested) | none |
| D7 | no | extra read-only instrumentation in B: the lifecycle probe at B1 and B2 (forces style/layout reads; no DOM writes) | a layout read cannot change React state or `matchMedia` results. All runtime outcomes matched A exactly (`08`) |
| D8 | no | Phase 2's inert navigation/beacon/iframe rewrites are absent in B. The tracker `<img>`/`<iframe>` sit inside `<noscript>` and stay inert text with scripting enabled | no footer element involved. 0 tracker requests in both arms |
| D9 | no | a first B attempt (`…14-28-51-591Z`) stopped at the pre-execution gate on a harness false positive: on Window, `matchMedia` is natively an own property. The gate expression was corrected. The runtime was never released there | none: no source JS ran in that attempt, and the authoritative run passed every gate |

**CONTROL EQUIVALENCE: PASS.** 36/36 checks pass. The non-intended differences are listed above, and none of them
touches the footer's decisive rules or nodes.

This is **not a one-variable experiment** (review MINOR 1). The changed variable is the hydration *document*, and it
carries D2/D3/D8 with it. No arm combined A's `<head>` with B's `<body>`. The causal attribution rests on two things:
- the observed mechanism (node identity at the commit);
- rule identity (`07`).

It does not rest on a pure one-factor design.

Correction to the prepare-time text in `control-equivalence.json → differences` (artifact left unmodified, review
MINOR 2):
- **D4:** the local mirror was never used. Both arms' 6 fonts came from local paths with identical sha256 values.
- **D6:** `polyfills` is neutralized (and `nomodule`). It was never requested, so no 404 occurred; the only 404 is the
  harness's own preflight probe.
