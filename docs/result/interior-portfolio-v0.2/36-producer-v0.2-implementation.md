# 36 — Portfolio V0.2 producer: implementation, golden package, landing

| | |
|---|---|
| date | 2026-09-26 |
| task | owner brief `prompt` — *PORTFOLIO V0.2 PRODUCER IMPLEMENTATION MASTER*: finish the producer for contract rev 9.2.1, make web-recon the source of truth for V0.2 portfolio data, pin a golden package, prove V0.1 is intact, review, commit. **No publish.** |
| main agent | Claude Opus 5.5 (orchestrator); read-only recon and audits delegated to Sonnet/Haiku sub-agents |
| sub-reports | [`36a-producer-fresh-review.md`](36a-producer-fresh-review.md) (independent review) · [`36b-boostchat-handoff.md`](36b-boostchat-handoff.md) (consumer handoff) |
| contract | `docs/reports/integration/07-integration-contract-v0.2-candidate.md`, rev 9.2.1 (READY, `35-`, `35a-`) |

---

## 1. Result

```
START_HEAD                   = 44a48a0
END_HEAD                     = the docs commit that adds this file (git log -1 -- <this file>); its parent is the producer commit d284b93
BRANCH                       = track-b/static-deployment-foundation

CONTRACT_REVISION            = 9.2.1

PRODUCER_V02_IMPLEMENTED     = YES
PRODUCER_V01_PRESERVED       = YES   (data/site-builds current.json still the V0.1 package; G1–G5, B1, B4, T7, R2, B2b; publish 59/0)

RECORD_COUNT                 = 19   (bi-01 … bi-19, DEMO data)
FULL_COUNT                   = 7
PARTIAL_COUNT                = 7
PROJECT_TYPE_ABSENT_COUNT    = 5

TOTAL_EXACT_COUNT            = 10
TOTAL_RANGE_COUNT            = 1
PER_AREA_AUTHORED_COUNT      = 6
PER_AREA_DERIVED_COUNT       = 4

DETAIL_PAGES_EXPECTED        = 19
DETAIL_PAGES_RESOLVED        = 19   (T1, real next build)

VALIDATOR_ERRORS             = 0
VALIDATOR_WARNINGS           = 0

NEGATIVE_TESTS               = 10/10 (N1) + reverse INV-20 case (V15); a fabricating mutant emitter is caught by 9 checks

DETERMINISTIC_EMISSION       = YES   (E2, G6, G7)
IMMUTABLE_RESOURCE_VERSION   = YES   (G7; --write refuses same version with different bytes)

DOCUMENT_SCHEMA_VERSION      = "1.0"
MANIFEST_SCHEMA_VERSION      = "0.1"
RESOURCE_VERSION             = d56509c8100a56fdf9644baff78ff9e1

RESOURCE_SHA256              = c76624146b5a753003fa5f0e3619534e3a80bd2fd967ed975d392e9180453816   (11,608 B)
MANIFEST_SHA256              = b2f52b736570b954fb257f03cc5897426dee7f199d95d3654221290644d8ce5d   (274 B)

BOOSTCHAT_PROVISIONAL_FIXTURE_COMPARED = YES   (read only)
FIXTURE_IDENTICAL            = YES   (both files byte-identical)

TARGETED_TESTS               = integration.test.ts 75 passed / 0 failed / 0 skipped; golden check drift []
BROADER_REGRESSION           = green: slice1 86/0, step4 47/0, step41 35/0, step5 32/0, polish 4/0, step52 12/0, publish 59/0
                               red, not weakened, ledger DEMO-PIN-PACKAGE-SPLIT: step6 20/10, predemo 9/1, predemo2 8/1,
                               ia150 13/2, ia151 8/2, ia152 11/3
                               clean checkout of d284b93: integration 74/1 (I2b only) — F1 / D1 (§6.2)
TYPECHECK                    = PASS   (tsc -p platform/tsconfig.json --noEmit; also on the clean checkout)
LINT                         = N/A    (no lint config in the repo)
BUILD                        = PASS   (T1: real next build of the V0.2 demo, 19/19 detail pages)

FINAL_REVIEW_MODEL           = Fable (fresh context; + one Fable delta review)
FINAL_BLOCKERS               = 0
FINAL_MAJORS                 = 1 open — F1, the 1.6.0 release pin (owner decision D1; not producer code)
                               (delta review's MAJOR — record accuracy — fixed)

UNRELATED_WIDGET_WORK_TOUCHED = NO
BOOSTCHAT_SOURCE_TOUCHED      = NO
PRODUCTION_TOUCHED            = NO
PUBLISH_PERFORMED             = NO
PUBLISH_ALLOWED               = NO

DEFERRED_LEDGER_UPDATED      = YES   (docs/status/interior-portfolio-v0.2.md → Deferred ledger)

COMMITS                      = d284b93 feat(integration): finalize portfolio v0.2 producer, demo corpus and golden package
                               + docs(portfolio): record v0.2 producer landing, review, handoff and ledger

PRODUCER_V02_LANDED          = YES
READY_FOR_BOOSTCHAT_V02_IMPLEMENTATION = YES
```

PORTFOLIO_V02_PRODUCER_SOURCE_OF_TRUTH_READY · PORTFOLIO_19_DEMO_CORPUS_READY · GOLDEN_PACKAGE_PINNED ·
V01_COMPATIBILITY_PRESERVED · PRODUCTION_UNTOUCHED · READY_FOR_BOOSTCHAT_V02_IMPLEMENTATION

**Two owner decisions are open (§10):** D1 / F1 (the release pin carries widget-seam files) and
`DEMO-PIN-PACKAGE-SPLIT` (six historical suites are red until the controlled V0.2 publish).

---

## 2. Starting point and working-tree protection

`HEAD 44a48a0`, branch `track-b/static-deployment-foundation`, as the brief expected. Before any edit
the tree was compared with [`33-working-tree-fingerprint.md`](33-working-tree-fingerprint.md): `git diff`
sha256 `2efea94b…` and all 20 per-file hashes **matched exactly** — nothing had drifted.

Every dirty path was classified by reading its diff, not by trusting `33-`'s lanes:

| lane | paths | this task |
|---|---|---|
| A · producer | `platform/integration/{contract,emit,validate,sources}.ts` | commit |
| A · content model | `platform/content/schema.ts` (the V0.2 authored fields; `contract.ts` imports its vocabularies) | commit |
| B · corpus + pin | `data/sites/boost-interior-demo/content/projects.json`, `…/site.json` (pin → `interior-01@1.6.0`), `templates/interior-01/v1/template.ts` (1.6.0 bump + changelog) | commit |
| C · tests / golden | `platform/test/integration.test.ts`; new `platform/cli/integration-golden.ts`, `platform/test/golden/portfolio-v0.2/**` | commit |
| D · widget seam | `platform/build/qa.ts`, `platform/build/site-build.ts`, `platform/site/{context,instance,load}.ts`, `platform/site/head-scripts.ts`, `templates/interior-01/v1/app/{layout.tsx,head-scripts.ts}`, **`platform/test/slice1.test.ts`**, `docs/result/static-deployment-foundation/widget-seam/` | untouched, not staged |
| E · other | `docs/result/static-deployment-foundation/proof/live-e2e.json` (pre-session), `prompt` (gitignored) | untouched |

**Two corrections to `33-`:** `platform/test/slice1.test.ts` is **entirely widget-seam** (all +244 lines are
head-script / `scripts.json` checks — `33-` filed it under "V0.2 / test"), and `platform/build/qa.ts` is
**not mixed** — its whole diff is the declared-script allowance. Neither is in this task's commits.

## 3. What the producer is — and was already

Recon found the producer substantially implemented by earlier sessions (`07-`, `26-`, `28-`) against the
contract as it stood then. Rev 9.2 and 9.2.1 changed only consumer-side rules (§14.3's evaluation function,
§18 owner decisions, disclosure wording); the producer-side sections §3–§13 and the producer invariants
INV-17…INV-30 are unchanged apart from INV-30, which the tree already enforced. So the task was to
**verify, pin and prove** rather than rewrite — and the emitter and the demo data were **not changed**:

| rule | where |
|---|---|
| §3 document `"1.0"`, manifest `"0.1"` (INV-27) | `contract.ts` `PORTFOLIO_SCHEMA_VERSION` / `CORE_SCHEMA_VERSION` |
| PT1/PT3, WS4, ND1 — every annex value copied from an authored field, never inferred | `emit.ts` `projectPortfolio` (allowlist projection) |
| §6 `property.area` moved unchanged, basis only `supply`/`exclusive`, no conversion (AR3, PY1) | `emit.ts` |
| §9 total exact XOR range (TP1), never derived (TP3); perArea `authored` wins (PA1) | `emit.ts` `totalOf`, `validate.ts` `TotalPriceSchema` |
| D-1 / RD1 integer derivation, only `full_remodel` + exact + area + no authored perArea; guard failure warns and omits | `emit.ts` `derivePerArea`; re-checked on the document in `validate.ts` |
| WS1/WS2/WS3/WS5, ST4, INV-17…INV-30, VA1 fail-closed | `validate.ts`; INV-28/29/30 also in `content/schema.ts` |
| RO1 — no dual emit | one emitter, one document shape |

No matcher or ranking policy is in the producer: no location weighting, budget matching, similarity or
selection code exists under `platform/integration/` (checked by the review, `36a-`).

## 4. The golden package

| | |
|---|---|
| path | `platform/test/golden/portfolio-v0.2/` |
| files | `manifest.json` (274 B, `b2f52b73…d8ce5d`) · `portfolio.d56509c8100a56fdf9644baff78ff9e1.json` (11,608 B, `c7662414…453816`) · `golden.json` · `README.md` |
| input | site `boost-interior-demo` · mode `public` · at `2026-09-22T12:00:00Z` (the test suite's pinned `AT`) · routes of `interior-01/v1` |
| generator | `./node_modules/.bin/tsx --tsconfig platform/tsconfig.json platform/cli/integration-golden.ts [--write]` — check by default; `--write` refuses a golden that does not validate 0/0 and refuses to overwrite a `portfolio.<version>.json` with different bytes |
| validator | 0 errors · 0 warnings |

`golden.json` holds only facts derived from the bytes and the fixed input (contract revision, schema
versions, producer version, resourceVersion, per-file bytes/sha256, counts, validator result); `G6`
re-derives it and compares it whole, so it cannot silently go stale. The producer commit is recorded here
and in `36b-`, not inside the golden (a commit cannot name itself).

**Why not a site package in `data/site-builds/`.** The test file's old TODO planned to rebuild the demo's
package there. That directory's `current.json` is what `site:publish` publishes; pointing it at a V0.2
package would stage exactly what `PORTFOLIO-PUBLISH-GATE` forbids. So the V0.1 package stays current and
the V0.2 golden is a separate, test-owned fixture. `B2b` and `R2` now assert that `site:publish` would
still plan the V0.1 package and no V0.2 document.

## 5. Detail pages (19/19)

The detail route is data-driven — `templates/interior-01/v1/app/portfolio/[slug]/page.tsx`,
`generateStaticParams` over the served projects, `dynamicParams = false` — so no per-record route was
written. `T1` now does a **real `next build` of the V0.2 demo** on a throwaway root and checks:

- the generated `portfolio/*.html` pages are **exactly** the 19 records' `detailUrl`s — none missing, none extra;
- each `detailUrl` resolves through the runtime's `resolvePath` to its page key (not 404); an unknown slug maps to a key the package does not hold;
- each page's `<h1>` equals the record title, its `<title>` starts with it, and its canonical link's path is the record's own `detailUrl`;
- the listing page exists; the package's `_integration/` bytes equal the golden.

**Record ↔ page consistency** (read-only audit of title/summary/body/quote/facts against the structured
fields, all 19): **no numeric or breadth contradiction**. No money figure appears in any record's prose.
Two contract-sanctioned divergences, not defects:

- `bi-17`'s body re-floored the bedrooms while `workScopeIds` is `[living_room, flooring]` — the contract's own example of a trade run through a space (`WS7a`, `CINV-17`);
- the category label ("전체 리모델링", from `categories.json`) is shown on `bi-02`, `bi-03`, `bi-05` whose `projectType` is absent — `category` is the site's taxonomy and is never breadth (§13, `SD2`); absent is "not established", which the label does not contradict. No `partial_remodel` record shows a whole-home label and no `full_remodel` a partial one.

## 6. Tests

### 6.1 `integration.test.ts`

**61 passed / 0 failed / 9 skipped → 75 passed / 0 failed / 0 skipped.**

| brief id | check(s) |
|---|---|
| P-V2-01 19 records emit | `E1`, `K1` |
| P-V2-02 validator errors 0 | `V1`, `G6` |
| P-V2-03 warnings 0 (none contract-allowed here) | `V1`, `G6` |
| P-V2-04 manifest → existing resource | `E1`, `G6`, `V7` |
| P-V2-05 version = immutable bytes | `E1b`, `G7`, `V7` |
| P-V2-06 ids unique | `K1`, `V2`, `N1` |
| P-V2-07 detailUrls resolve | **`T1`** (real build), `V3` |
| P-V2-08 controlled vocab | `C4`, `V14`, `N1` |
| P-V2-09 area basis/unit | `E5`, `K1`, `V9`, `N1` |
| P-V2-10 pricing shapes | `A11`, `V14`, `N1` |
| P-V2-11 derived provenance | `A1`–`A7`, `A13`, `V15`, `K1` |
| P-V2-12 partials never gain perArea | `A4`, `K1` |
| P-V2-13 missing stays missing | `E4`, `K1` |
| P-V2-14 deterministic repeat | `E2`, `G7` |
| P-V2-15 V0.1 regression | `G1`–`G5`, `B1`, `B4`, `T7`, `R2`, `B2b` |
| P-V2-16 golden = emission | **`G6`**, `T1` |

What changed in the file:

- **restored with V0.2 values:** `E1b` (version, bytes, sha256), `E2b` (the empty V0.2 document's exact bytes; the V0.1 two-record example is retired — rev 9.2.1 has no byte-level V0.2 example), `T3`;
- **restated as V0.1 compatibility:** `G1`, `G2`, `G3`, `G5`, `R2` — they read the frozen V0.1 package, which this release deliberately keeps current, and now say so; the V0.1 constants are renamed `V01_*`;
- **inverted:** `B2b` — the V0.2 identity must *not* be the current package;
- **new:** `G6` golden, `G7` immutability, `T1` real build of 19 pages, `K1` corpus coverage, `N1` negative mutations, `A13` INV-22 metamorphic provenance (review F4);
- **extended:** `V15` gains the reverse INV-20 case (review F3).

**Negative mutations (`N1`), each with its own expected error — 10/10:** duplicate id · invalid
`projectType` · invalid area `basis` · unknown work scope · malformed range (no `maxAmount`) · range
min > max · a derived `perArea` with no area to derive from · a detailUrl without a leading slash · a
manifest `href` pointing at another version · a `"0.1"` document inside the V0.2 package.

**Corpus coverage (`K1`, §18 of the brief).** Present: full 34평 at exact 50,000,000 (`bi-09`); the same
34평 at two prices (`bi-09`, `bi-10`); full jobs at five different areas; 주방만 `bi-14`, 욕실만 `bi-15`,
주방+욕실 `bi-04`/`bi-16`, 거실만 `bi-17`, 현관 수납 `bi-18`, 도배랑 바닥만 `bi-19` (trades-only, breadth
absent); 34평 supply, 공급 112㎡ (`bi-17`), 전용 84㎡ (`bi-14`), area absent (`bi-15`); exact / range /
missing totals; authored / derived perArea; projectType, style (`bi-18`), price (`bi-04`, `bi-06`) and
property type (`bi-06`) each missing somewhere. **One scenario has only partial support, by design:**
*"34평 전체인데 3천 안쪽"* — no 34평 full job is at ≤ 30,000,000; the nearest is `bi-11` (20평, exactly
30,000,000), which is also contract §19 row B's answer. Nothing was invented to fill it.

### 6.2 Verification

All runs use `./node_modules/.bin/{tsc,tsx}` (never `pnpm` in this worktree).

**Canonical working tree**, after the last edit:

| check | result |
|---|---|
| `integration.test.ts` | **75 / 0 / 0** |
| golden check (`platform/cli/integration-golden.ts`) | exit 0, drift `[]` |
| `tsc -p platform/tsconfig.json --noEmit` | pass |
| `slice1` · `step4` · `step41` · `step5` · `polish` · `step52` · `publish` | 86/0 · 47/0 · 35/0 · 32/0 · 4/0 · 12/0 · 59/0 (`slice1`'s count includes the seam lane's checks) |
| `step6` · `predemo` · `predemo2` · `ia150` · `ia151` · `ia152` | **20/10 · 9/1 · 8/1 · 13/2 · 8/2 · 11/3** — ledger `DEMO-PIN-PACKAGE-SPLIT` |
| lint | N/A — the repo has no lint config |

The six red suites are milestone suites that assert *the current package in `data/site-builds/` was built
from the current pin and corpus*. With the demo pinned to `1.6.0` + 19 records and `current.json`
deliberately left on the 1.5.2-built V0.1 package, they can only pass by moving `current.json` (the
publish gate forbids it) or by weakening them (the brief forbids it). The pin and corpus that turn them red were already in the
session-start working tree (hash-identical to `33-`) and were not changed by this task; the suites pass on
a `git archive` of `44a48a0`, where the pin is still `1.5.2`.
The `integration-surface.ts` change only removed `platform/cli/integration-golden.ts` from `step6` `D2`'s
list; every other failure is unchanged.

**Clean checkout of the producer commit.** `git archive d284b93` into a scratch dir with `node_modules`
symlinked — no working-tree file involved — and the same for `44a48a0` as the baseline:

| check | `d284b93` | `44a48a0` |
|---|---|---|
| `tsc` | pass | — |
| golden check | exit 0, drift `[]` | n/a |
| `integration.test.ts` | **74 / 1 — `I2b` only** | 50 / 0 |
| `slice1` | 69 / 3 | 72 / 0 |
| `step4` · `step41` · `step5` | 46/1 · 34/1 · 31/1 | `step4` 46/1 |
| `step6` | 19 / 11 | 29 / 1 |
| `predemo` … `ia152` | as in the canonical tree | green |
| `polish` · `step52` · `publish` | 4/0 · 12/0 · 59/0 | — |

Every failure has a named cause:

- **`I2b` and all three `slice1` failures — F1 / owner decision D1.** Cut from the seam-free committed
  tree, `interior-01@1.6.0` becomes `interior-01-1.6.0-f40dc15d5461`, not the pinned
  `…-e65795202191`, because the stored release contains the widget-seam files. Their content is **already in
  git**, as release artefacts under `data/template-releases/interior-01/interior-01-1.6.0-e65795202191/files/`
  committed in **`5b16a5d`**. Only the canonical seam sources are uncommitted (lane D). Ledger
  `WIDGET-SEAM-RELEASE-SOURCES`; options in §10.
- **`step4` B, `step41`, `step5` C (*"old release file is writable"*) and `step6` `D2` (*"modified after the
  release cut"*) — export artefacts.** git stores neither the stored releases' read-only mode nor mtimes.
  The same failures occur on the `44a48a0` export (`step4` 46/1, `step6` 29/1 on `D2`).
- **`step6`'s other ten, `predemo` … `ia152`** — `DEMO-PIN-PACKAGE-SPLIT`, as above.

**Mutation evidence.** A mutant emitter that fabricates `pricing.total = pricePerArea × area` fails 9 checks
(`36a-` §4).

## 7. BoostChat provisional fixture

**IDENTICAL.** Both files in `boost-chat/scripts/fixtures/first-party/golden-v0.2/` are byte-identical
to the canonical golden (`cmp`, equal sha256; BoostChat read only). There is no JSON path to explain:
the provisional fixture was made by this same emitter from the same data before it was committed, and
neither moved. The consumer's remaining action is provenance only — `36b-`.

## 8. Independent review

**Fable**, fresh context, read-only, given the brief's twelve questions and no expected verdict. First
review: **0 BLOCKER · 1 MAJOR · 3 MINOR · 5 NOTE**. One delta review over the fixes: **0 BLOCKER · 1 MAJOR
(record accuracy) · 1 MINOR · 4 NOTE, no functional defect.** Full text in [`36a-`](36a-producer-fresh-review.md).

| id | sev | disposition |
|---|---|---|
| F1 | MAJOR | **open — owner decision D1** (§10); the release pin, not producer code; measured in §6.2 |
| F2 | MINOR | deferred to the next template cut (`template.ts`'s changelog is inside the release hash) |
| F3 | MINOR | fixed — reverse INV-20 in `validate.ts`, `V15` case |
| F4 | MINOR | fixed — `A13` |
| F5–F9 | NOTE | comments fixed; the rest accepted or handed off (`DEMO-DETAIL-V02-FACTS`, `36b-` action 1) |
| delta MAJOR | record | fixed — the seam content is already committed at `5b16a5d`; ledger, `36a-` F1 and §6.2 say so |
| delta MINOR | wording | fixed — a throwaway-worktree re-cut is option (b), a trade-off |
| delta NOTEs | comment | `validate.ts` header now lists INV-30 and scopes warn-and-omit to the emitter |

Per the brief, only BLOCKER/MAJOR had to be fixed, and there was one delta review and no loop.

## 9. Commits

| # | commit | files |
|---|---|---|
| 1 | `d284b93` feat(integration): finalize portfolio v0.2 producer, demo corpus and golden package | 15: `platform/integration/{contract,emit,validate,sources}.ts`, `platform/content/schema.ts`, `templates/interior-01/v1/template.ts`, `data/sites/boost-interior-demo/{site.json,content/projects.json}`, `platform/test/{integration.test.ts,integration-surface.ts}`, `platform/cli/integration-golden.ts`, `platform/test/golden/portfolio-v0.2/{manifest.json,portfolio.d56509c8….json,golden.json,README.md}` |
| 2 | docs(portfolio): record v0.2 producer landing, review, handoff and ledger | this file, `36a-`, `36b-`, `docs/status/interior-portfolio-v0.2.md` |

The brief's A (producer), B (corpus) and C (golden) are **one commit**. The tests pin the golden derived
from the corpus, and the corpus needs the `1.6.0` schema, so any split leaves a red intermediate commit.
Files were staged by explicit path. `git diff --cached --name-only` and `--stat` were checked before each
commit, and no lane D/E path was staged (`git status` after commit 1 shows exactly the seam files and
the pre-existing untracked paths). This commit cannot name its own hash; `END_HEAD` is `git log -1` on
this file.

## 10. Owner decisions needed

1. **D1 / F1 — the `1.6.0` pin carries the widget-seam files** (ledger `WIDGET-SEAM-RELEASE-SOURCES`):
   (a) land the seam lane; (b) re-cut a seam-free `1.6.1` from a throwaway worktree and re-pin — the
   committed state becomes consistent, but the seam-bearing working tree turns `I2b` red until the seam lane
   re-cuts; (c) accept `1.6.0` and widen its changelog (this also covers F2).
2. **`DEMO-PIN-PACKAGE-SPLIT`** — either leave the six suites red until the controlled V0.2 publish makes
   the demo's package current again, or restate them for the rollout window.
3. **Publish stays NO** (`PORTFOLIO-PUBLISH-GATE`) until BoostChat's search adapter reads the V0.2 fields
   and acceptance passes (contract §16). Next actions are the consumer's: `36b-` NEXT_CONSUMER_ACTIONS.

## 11. Not done, by instruction

No publish, no Cloudflare/R2 write, no `data/site-builds/` change, no snapshot refresh, no Fuse read, no
BoostChat file touched, no widget-seam file touched or staged, no S1/Jev/GC1 work. Deferred items are in
the one ledger, `docs/status/interior-portfolio-v0.2.md` → *Deferred ledger*.
