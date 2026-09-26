# 37 — WEB-D1 + WEB-D2 web-recon cleanup (widget-seam landing, rollout-window baseline)

| | |
|---|---|
| date | 2026-09-26 |
| scope | a bounded cleanup session: close the two owner decisions left open by [`36-`](36-producer-v0.2-implementation.md) §10. No architecture, contract, release or publish work |
| owner decisions | **WEB-D1 = option A** — land the canonical widget-seam sources to match the stored `1.6.0` release. **WEB-D2** — restate the historical suites so they treat the pre-publish rollout window as valid, without weakening the post-publish invariant or moving `current.json` |
| branch | `track-b/static-deployment-foundation` |

```
START_HEAD                   = 00ed120
END_HEAD                     = the docs commit that carries this file (git log -1 -- this file); code commits below

D1_OWNER_DECISION            = LAND_WIDGET_SEAM
D1_STATUS                    = CLOSED
WIDGET_SEAM_FILES_COMMITTED  = platform/build/{qa,site-build}.ts · platform/site/{context,instance,load,head-scripts}.ts ·
                               templates/interior-01/v1/app/{layout.tsx,head-scripts.ts} · platform/test/slice1.test.ts ·
                               docs/result/static-deployment-foundation/widget-seam/01-head-scripts-seam.md
STORED_RELEASE               = interior-01-1.6.0-e65795202191   (untouched)
CANONICAL_SOURCE_MATCHES_RELEASE = YES — 65/65 release sources byte-identical (collectReleaseSources mapping)
I2B                          = PASS (canonical tree) · PASS (clean git archive of b0e7a4f)
SLICE1_RELEVANT              = PASS — slice1 86/0 (canonical) · 86/0 (clean archive of b0e7a4f)

D2_OWNER_DECISION            = PRE_PUBLISH_TRANSITION_IS_VALID
D2_STATUS                    = CLOSED for the pin/package split. step6 H/L/N stay red: a different cause, split out (§4.3)
ROLLOUT_TESTS_CHANGED        = platform/test/demo-rollout.ts (new) · platform/test/release-160-surface.ts (new) ·
                               step6 · predemo · predemo2 · ia150 · ia151 · ia152

STEP6                        = 27/3 — red only on H, L, N (V0.2 corpus content, NOT the split); was 20/10
PREDEMO                      = 10/0   (was 9/1)
PREDEMO2                     = 9/0    (was 8/1)
IA150                        = 15/0   (was 13/2)
IA151                        = 10/0   (was 8/2)
IA152                        = 14/0   (was 11/3)

INTEGRATION                  = 75/0/0 skipped
SLICE1                       = 86/0
STEP4                        = 47/0
STEP41                       = 35/0
STEP5                        = 32/0
POLISH                       = 4/0
STEP52                       = 12/0
PUBLISH_SUITE                = 59/0

TYPECHECK                    = PASS   (tsc -p platform/tsconfig.json --noEmit)
GOLDEN_DRIFT                 = []
RESOURCE_VERSION             = d56509c8100a56fdf9644baff78ff9e1   (unchanged)
V01_CURRENT_PACKAGE_CHANGED  = NO
V02_GOLDEN_CHANGED           = NO
CURRENT_JSON_CHANGED         = NO
PRODUCTION_TOUCHED           = NO
PUBLISH_PERFORMED            = NO
BOOSTCHAT_TOUCHED            = NO

D1_COMMIT                    = b0e7a4f  feat(template): land interior widget seam sources
D2_COMMIT                    = 5ac6695  test(demo): support pre-publish v0.2 rollout state

F2_CHANGELOG_DEFERRED        = YES — NEXT_TEMPLATE_CUT (template.ts is inside the release hash)

NEW_FINDING                  = DEMO-AREA-BASIS-LABEL — a real V0.2 build labels bi-14's 전용 84㎡ as "공급면적"
                               (V0.2 pre-publish MAJOR; caught by step6 H; not fixed — needs a template cut)

READY_FOR_BOOSTCHAT_V02_IMPLEMENTATION = YES
```

WEB_D1_CLOSED · WIDGET_SEAM_CANONICAL_SOURCE_LANDED · WEB_D2_CLOSED · PRE_PUBLISH_ROLLOUT_STATE_TESTED ·
PRODUCTION_UNTOUCHED · READY_FOR_BOOSTCHAT_V02_IMPLEMENTATION

`KNOWN_RED_BASELINE_REMOVED` is **partial**. Every failure caused by the pin/package split, by the
widget seam or by the 1.6.0 re-pin is gone (0 left). step6 keeps 3 failures (H, L, N). They fail on
the V0.2 corpus's own content, would stay red after a V0.2 publish too, and one of them is a real
product defect. They need an owner decision, not a test edit (§4.3).

---

## 1. Starting point and working-tree classification

`HEAD 00ed120`, as the brief expected. Dirty paths at start, classified by reading each diff:

| path | class |
|---|---|
| `platform/build/qa.ts` — declared-script allowance in package QA | A · widget seam |
| `platform/build/site-build.ts` — passes the snapshot's declared `src` list to QA | A · widget seam |
| `platform/site/context.ts` — `SiteContext.headScripts` | A · widget seam |
| `platform/site/instance.ts` — `SiteSnapshotSchema.headScripts` (optional) | A · widget seam |
| `platform/site/load.ts` — reads optional `scripts.json`, fail-closed | A · widget seam |
| `platform/site/head-scripts.ts` (new) — schema + projection | A · widget seam |
| `templates/interior-01/v1/app/layout.tsx` — renders `headScriptTags(ctx)` | A · widget seam |
| `templates/interior-01/v1/app/head-scripts.ts` (new) | A · widget seam |
| `platform/test/slice1.test.ts` — +244 lines, all scripts.json / head-script / declared-script QA checks | A · widget seam |
| `docs/result/static-deployment-foundation/widget-seam/` — the seam's own record | A · widget seam |
| `docs/result/static-deployment-foundation/proof/live-e2e.json` — `publish-e2e` live-mode output of the 2026-09-22 pilot | C · generated evidence, left untracked |

No file was MIXED or UNRELATED, and nothing was UNKNOWN. Before any test ran, every file under
`data/site-builds`, `data/template-releases`, `data/sites/boost-interior-demo` and
`platform/test/golden` was hashed (3,471 files). The same hashes were taken again after all runs and
were identical (§6).

## 2. WEB-D1 — widget-seam source landing

### 2.1 Stored release ↔ canonical source

Every file of `data/template-releases/interior-01/interior-01-1.6.0-e65795202191/files/` was
compared with its canonical source. Paths are mapped the way `collectReleaseSources` maps them:
`package.json` and `pnpm-lock.yaml` come from `platform/runtime/`, never the repo root. Result:
**65/65 byte-identical**, including the five seam files (`platform/site/{context,instance,head-scripts}.ts`,
`templates/interior-01/v1/app/{layout.tsx,head-scripts.ts}`). No file differed, so no source was
adjusted to fit the release and no release file was touched. `template.ts` was not edited (F2, §2.3).

### 2.2 Commit and clean-checkout proof

`b0e7a4f` stages exactly the ten class-A paths, by explicit `git add`. `git diff --cached` was
checked before the commit, and `live-e2e.json` was left out. A `git archive b0e7a4f`, with
`node_modules` symlinked and no working-tree file involved, gives:

| check | canonical tree | clean archive of `b0e7a4f` |
|---|---|---|
| `integration.test.ts` | 75/0/0 — I2b ok | **75/0/0 — I2b ok** (was 74/1, I2b red, on `d284b93`) |
| `slice1` | 86/0 | **86/0** (was 69/3) |
| `tsc -p platform/tsconfig.json --noEmit` | pass | pass |
| golden check | drift `[]` | drift `[]` |

The mtime and read-only mode that git does not carry (`step4` B, `step41`, `step5` C, `step6` D2)
are export artefacts. They are kept out of the D1 verdict, as the brief asks.

### 2.3 F2 — `template.ts` changelog

Not edited. `template.ts` is a release source, so a wording fix changes the release hash and turns
I2b red, and fixing it requires a new cut, which this session forbids. It remains a
**NEXT_TEMPLATE_CUT** follow-up (ledger `TEMPLATE-160-CHANGELOG`).

## 3. WEB-D2 — what was really red

Each known-red suite was re-run on the canonical tree before any change. The counts matched `36-`
(step6 20/10, predemo 9/1, predemo2 8/1, ia150 13/2, ia151 8/2, ia152 11/3). Read one by one, the
17 failures have **four** causes, not one:

| cause | failing checks | would a V0.2 publish turn it green? |
|---|---|---|
| **S · pin/package split** — `current.json` is the 1.5.2-built V0.1 package, the pin is 1.6.0 | step6 B, D (source-hash half), V, U, M, X, P · predemo R2 · predemo2 R2 · ia150 R2 · ia151 R3 · ia152 R3 | yes |
| **T · the pin moved past a proof's own release** — the test takes "the demo's pin" to mean "the 1.5.2 release" | ia152 F2 (`"1.6.0" ≠ "1.5.2"`) | no |
| **P · platform files moved past a pre-1.5.x capture** — the V0.2 `content/schema.ts` (1.6.0 cut) and the seam's `build/qa.ts`, `site/{context,instance}.ts`, `site/head-scripts.ts` | ia150 R3 · ia151 R2 · ia152 R2 · step6 D's platform-tree half (hidden behind D's first failure) | no |
| **C · V0.2 corpus content vs Step 6 data rules** | step6 H (`bi-15` has no area; `bi-14` is `exclusive` under a 공급면적 label) · L (`bi-09`…`bi-19` have no `galleryGroups`, `bi-18` no `keywords`) · N (filter expectations hard-coded for the 8-record corpus) | no |

The owner's model is right for S. T, P and C would stay red **after** a V0.2 publish, so they were
not split failures. T and P come from the 1.6.0 re-pin and the seam, the same work D1 finished, and
the codebase already has a pattern for each (below). C needs product decisions.

## 4. The D2 change (`5ac6695`)

### 4.1 S — `platform/test/demo-rollout.ts`

This is one small helper, not a framework. `demoRollout(repoRoot)` returns one of two states and
throws, failing the check that asked, for anything else:

- **`POST_PUBLISH_STEADY`** — the current package's build record names the pin. Every caller then
  applies its **original, unchanged** strict assertion.
- **`PRE_PUBLISH_TRANSITION`** — valid only when **all** of these hold (the brief's §13):
  1. `current.json` → the V0.1 package `0f80b239…`: built with `interior-01-1.5.2-d87807590d64`, success, QA pass, contract pair `{0.1, 0.1}`, `_integration/` exactly the V0.1 manifest and document (schemaVersion `"0.1"`);
  2. `planPublish` (read only) would publish that package: its packageHash and release, the V0.1 document present, the V0.2 document absent;
  3. the canonical V0.2 golden exists separately: `golden.json` names `d56509c8…` / `"1.0"`, the document bytes are the recorded ones, and the manifest points at it;
  4. no package in `data/site-builds/boost-interior-demo/packages/` and no `history.jsonl` line was built with the V0.2 pin;
  5. the pin is a verified release ≥ 1.6.0, and the working-tree corpus's pure emission **equals the golden** (resourceVersion and bytes);
  6. the V0.1 package and the live-pilot package `18c0a5ef…` are byte-intact at their frozen packageHashes (`packageIntact`), and `previous.json` still points at the live package.

Two accessors keep the call sites small. `demoBuiltRelease` returns the pin when steady and the V0.1
publish target in the window. `demoPackagedProjects` returns the whole corpus when steady; in the
window it returns the records the V0.1 package's own document lists, each of which must still be in
the corpus. The literals are the frozen artefacts `integration.test.ts` already pins (G1–G6, R2).

| check | restated as |
|---|---|
| step6 B · predemo R2 · predemo2 R2 · ia150 R2 · ia151 R3 · ia152 R3 (demo only; fixtures still held to their own pins) | build record = `demoBuiltRelease` (still ≥ the suite's minimum version, still verified) |
| step6 D | live source = the pin's release (unchanged); the package's templateSourceHash = the built release's |
| step6 V | the demo's package carries the built release's id and source hash |
| step6 M, X | links, detail pages, canonicals and sitemap of the packaged records. The V0.2 corpus's 19 pages are `integration.test.ts` T1's job: a real build |
| step6 U | steady: unchanged (= current). Window: two independent rebuilds on separate roots agree on buildInputId and packageHash |
| step6 P | page-count reference = the ON build of the same inputs: the current package when steady, U's rebuild in the window |

**Negative evidence.** On throwaway `git archive` copies, each safety condition was broken one at a
time. `demoRollout` refused every mutation and named the condition it broke:
`current.json` → the live package (1) · a byte in the V0.1 package (6) · a byte in the live package
(6) · `previous.json` moved (6) · a byte in the golden document (3) · a fake V0.2-built package
staged (4) · a V0.2 `history.jsonl` line (4) · one corpus title edited (5, the corpus emits
`b36f3d9b…`). The unmutated copy is `PRE_PUBLISH_TRANSITION`, with target 1.5.2 and 8 packaged
records. End to end, with `current.json` moved, `predemo` fails R2 and `ia152` fails R3, each with
the helper's message.

### 4.2 P and T

- **`platform/test/release-160-surface.ts`** works like `integration-surface.ts`. In the 1.5.x cut
  proofs, the files 1.6.0 **modified** are judged at their pre-1.6.0 sha256. For the release sources
  `content/schema.ts` and `site/{context,instance}.ts`, that is the bytes the stored 1.5.2 release
  froze, re-verified on every call. For `build/qa.ts`, which is not a release source, it is its
  hash at `00ed120`. All four values equal every 1.5.x capture (ia150, ia151, ia152 `before.json`).
  Files 1.6.0 **added** (`site/head-scripts.ts`) are excluded. The cut proofs still hold for the tree
  as it stood before 1.6.0, and the current bytes are held by I2b (working tree = the pinned 1.6.0
  release) and slice1's declared-script QA checks. It is used by ia150 R3, ia151 R2, ia152 R2 and
  step6 D.
- **ia152 F2** now loads the stored 1.5.2 release by directory, as R2 in the same file already does,
  and verifies it. It no longer goes through the demo's pin. The proof's subject (1.5.2's SEO default
  on fixture-small) is unchanged.

### 4.3 C — not fixed; separated for an owner decision

These fail on `data/sites/boost-interior-demo/content/projects.json` itself, the golden-pinned V0.2
corpus, which this session may not change:

- **H — a real defect, `DEMO-AREA-BASIS-LABEL`.** `PortfolioDetail.tsx` labels every area fact with
  the single site-wide slot `portfolio.detail.areaLabel` = "공급면적". A throwaway real build of
  the V0.2 demo renders `bi-14` (전용 84㎡, `basis: exclusive`) as **`공급면적 = 84 m²`**, which is
  factually wrong on the public page. `bi-17` (공급 112㎡) is correct, and `bi-15` (no area) shows
  no fact. step6 H catches it: its first loop stops at `bi-15`, and its label loop would fail at
  `bi-14`. It does not block anything today (`PUBLISH_ALLOWED = NO`), but it **must be fixed before
  a V0.2 publish**. The fix is a per-basis area label at the next template cut; the corpus
  deliberately exercises the 전용 basis for the consumer, so the data is not the thing to change.
- **L** — the Step 6 demo-quality bar (every project has a gallery, keywords, …) does not hold for
  11 records. They render the designed cover-only fallback. Accepting that is a demo-quality decision.
- **N** — expected filter results were computed for the 8-record corpus. The rule is unchanged; the
  expected values are stale. A restatement that stays honest would evaluate Step 6's own records
  (bi-01…bi-08) or re-derive the values for 19 records.
- **Latent, not red today:** step6 O hard-codes 15 pages ("8 details"). It passes only because the
  V0.1 package is current and will fail after a V0.2 publish.

Ledger: `DEMO-AREA-BASIS-LABEL`, `STEP6-V02-CORPUS-RULES` (docs/status).

## 5. Regression (after D1 + D2, canonical tree, one run)

| suite | result | before this session |
|---|---|---|
| integration | 75/0/0 | 75/0/0 |
| slice1 | 86/0 | 86/0 |
| step4 · step41 · step5 | 47/0 · 35/0 · 32/0 | same |
| polish · step52 · publish | 4/0 · 12/0 · 59/0 | same |
| step6 | **27/3** (H, L, N) | 20/10 |
| predemo · predemo2 | **10/0 · 9/0** | 9/1 · 8/1 |
| ia150 · ia151 · ia152 | **15/0 · 10/0 · 14/0** | 13/2 · 8/2 · 11/3 |
| tsc | pass | pass |
| golden check | drift `[]`, `d56509c8…` | same |

A clean `git archive 5ac6695` gives the same six-suite and integration results, plus step6 D2. That
is the known export artefact: without `.git`, every file is judged by its mtime, which `git archive`
sets to the commit time.

## 6. Invariants re-checked

- The 3,471 files under `data/site-builds`, `data/template-releases`, `data/sites/boost-interior-demo`
  and `platform/test/golden` are byte-identical before and after all runs. There is no diff in `data/`,
  the golden or `template.ts` since `00ed120`.
- `current.json` → `0f80b239…` (V0.1) and `previous.json` → `18c0a5ef…` (live pilot), both unchanged.
- Golden: resourceVersion `d56509c8100a56fdf9644baff78ff9e1`, 11,608 B and 274 B, drift `[]`.
- Not done: no publish, no Cloudflare/R2 write, no `site:publish`, no `data/site-builds` pointer
  change, no snapshot refresh, no release cut (no 1.6.1), no contract change, no BoostChat file read
  or written (only `git status` / `git log` there, to confirm it was untouched), no production or
  Fuse access. Throwaway builds went to `os.tmpdir()` and scratch
  directories only.

## 7. Commits

| commit | files |
|---|---|
| `b0e7a4f` feat(template): land interior widget seam sources | the ten class-A paths (§1) |
| `5ac6695` test(demo): support pre-publish v0.2 rollout state | `platform/test/{demo-rollout,release-160-surface}.ts` (new), `platform/test/{step6,predemo,predemo2,ia150,ia151,ia152}.test.ts` |
| docs commit | this file, `docs/status/interior-portfolio-v0.2.md` |

No producer, corpus, golden or `current.json` file is in any commit. `live-e2e.json` stays untracked.

## 8. For the next sessions

- **BoostChat (next):** unchanged from `36b-`. Carry this file's close evidence for `WEB-D1` /
  `DEMO-PIN-PACKAGE-SPLIT` into BoostChat's canonical ledger. This repo does not write cross-repo.
- **The controlled V0.2 publish** (after BoostChat acceptance) must first fix
  `DEMO-AREA-BASIS-LABEL` (template cut), restate step6 O and settle `STEP6-V02-CORPUS-RULES`. After
  the publish, `demoRollout` reports `POST_PUBLISH_STEADY` and the original strict assertions apply
  again with no edit, but `integration.test.ts` B2b / G1–G5 / R2, which pin "V0.1 stays current",
  must be restated by that session.
- **The next `interior-01` cut:** F2 changelog wording, the per-basis area label and
  `DEMO-DETAIL-V02-FACTS` together.
