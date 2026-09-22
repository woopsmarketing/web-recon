# Task 28.7 — 09 Final Independent Architecture Audit

**Auditor:** fresh context, implemented none of this wave. No answer was suggested to me.
**Method:** every claim below was checked against the code or the artifacts. Where a report states a
number, I read the number out of the artifact myself. Where a report claims a test protects a defect,
I read the test and judged whether it could actually go red.
**Constraints honoured:** read-only. No source file edited, no git operation performed. The only file
I wrote is this one.

**Independent re-runs performed by me (not taken from any report):**

| command | result |
|---|---|
| `npx tsc --noEmit` | exit **0** |
| `npx tsx scripts/smoke-selector.ts` | **93/93**, exit 0 |
| `npx tsx scripts/smoke-layout-safety.ts` | **325/325**, exit 0, 0 FAIL |
| `npx tsx scripts/smoke-responsive-qa.ts` | **205/205**, exit 0, 0 FAIL |
| `npx tsx scripts/smoke-multi-observer.ts` | **263/263**, exit 0, 0 FAIL |

All four suite counts match the numbers the wave reported.

---

## 1. Verdict table

| # | point | verdict | evidence anchor |
|---|---|---|---|
| 1 | `prepareScroll` no longer destroys a route on scroll-triggered navigation | **VERIFIED** | `src/observer/layout-probe.ts:392` (`autoScrollPrepare` is total), `:345-360` (per-step document identity check), `:583-592` (non-throwing return-to-top); threaded from `src/observer/observe-page.ts:1193`, `:1415` |
| 2 | Popup handling conservative; no DOM-removal path | **VERIFIED** | `src/observer/normalize-page-state.ts:413-423` (≥1 STRONG **and** ≥2 signals), `src/observer/types.ts:1629-1636` shared `OVERLAY_SHAPE`, `:1640` cap = 2; actions only `:734` click / `:736` Escape, never `force`. Grep for every DOM-mutation form in the module returns only computed-style **reads** at `:210`, `:501` |
| 3 | Normal-page-state evidence actually recorded | **VERIFIED** | `docs/result/28.7/evidence/page-state/seoultone.kr/p000001-mobile-1/{record.json,before.png,after.png}` — real `section#popup_slider`, 닫기 close control, coverage 0.568 → 0 |
| 4 | Residual frozen nodes measurable from artifacts alone | **PARTIAL** | schema `src/reconstruction/types.ts:995-1021`, serialized `src/reconstruction/generate-app.ts:506`. Only 24 per route retained: **96 of 2,995** (linear), **240 of 2,232** (hobbang). See §2.4 |
| 5 | Residual-freeze reporting is NODE-scoped, not aggregate-only | **VERIFIED** | `residualFrozenNodes[]` carries `pageId`/`viewportId`/`nodeId`/`parentNodeId`/`property`/`frozenValue`/`sourceX,W`/`cloneX,W`/`consequence`/`refusalReason`; per-node grid refusal log `gridTrackRefusalNodes` 86 + omitted 317 = 403 = `gridTrackRefusals` (linear) |
| 6 | Grid recovery handles the measured hidden-child and spanning-child cases generically | **VERIFIED** | `src/reconstruction/layout-inference.ts:1553` `gridChildRole()` (computed `display`, not `probe.v`), `:1823` `runWidth()` sheds `(k−1)×gap`, `:1869` per-track single-column witness. Manifests confirm `child-count-not-multiple-of-tracks` 34→0 / 4→0 |
| 7 | No site-specific selector, node id, hostname or magic pixel in new code | **VERIFIED** | Full sweep of `src/**` + `scripts/**`: **zero CODE-KEYING**. See §3 for the comments-vs-code split |
| 8 | A clone 404 is not multiplied into fake blockers | **VERIFIED** | `src/responsive-qa/classify.ts:274` `cloneRouteGate`, `:114`/`:336` `suppressEveryFurtherChannel`; test asserts **exactly one** finding at `scripts/smoke-responsive-qa.ts:1828-1845` |
| 9 | Unstable source captures are not graded as stable truth | **VERIFIED** | `src/responsive-qa/run.ts:684` `detectSourceInstability`, `:754` `applyInstabilityOverride` labels the rewrite, `:928` sets `outcome = "UNSTABLE"`, `:878` excludes it from tallies and floor |
| 10 | Duplicate image layers separated from true overlap, without swallowing a real overlap | **PARTIAL** | `src/responsive-qa/overlap.ts:113-131`. The duplicate branch is tight; the **`failed-image-layer` branch is not**. See §2.10 |
| 11 | Measurement failure never PASS, never counted toward a floor | **VERIFIED** | `src/responsive-qa/run.ts:878-880`, `:918-921`, `:1461`; the old `?? "BLOCKER"` default is deleted (`:900` records its removal). Confirmed on a **real run** — see §3.11 |
| 12 | Route archetype planning did not become a crawler explosion | **VERIFIED** | `src/selector/route-archetype-plan.ts` is pure (imports only zod + local types); `src/multi-observer/plan-pages.ts` **untouched** (mtime 2026-08-13), `MAX_VALIDATION_SAMPLES_PER_SITE = 3` intact; `src/discovery/**` untouched; `src/cli-select.ts` purely additive |
| 13 | Board/detail repeated pages represented structurally | **VERIFIED (synthetic only)** | `scripts/smoke-selector.ts:673-712` drives the **real** `buildPageFamilies`/`buildPageSelection`: 40 detail routes → ONE archetype, `memberCount === 40`, list in a different archetype, `representedWithoutDeepReconstructionCount === 39`. Real-data caveat in §2.13 |
| 14 | Per-route tree switching justified by fresh evidence | **VERIFIED** | Report 05's gate chain exists and reproduces on disk (obs `15-48-30-262Z` → recon `15-51-59-065Z` → QA `15-52-40-935Z`); clone `scrollHeight` byte-identical 5,876 at 390/700/1024. Report 27 additionally **rejected the brief's own premise** on measurement |
| 15 | Mobile probe envelope driven by source-authored evidence, not a hardcoded ceiling | **VERIFIED** | `src/observer/probe-widths.ts:189-215` — off by default, caller supplies `envelopeExtensionMaxWidth` from what the other context actually observed, *"this file never names a pixel value of its own"*. `MOBILE_LAYOUT_PROBE_WIDTHS` ceiling **still 914** (`src/observer/types.ts:2518-2519`). Documentation gap noted in §4 |
| 16 | No Slot / Template / Visual-Editor / CMS / SaaS work entered scope | **VERIFIED** | mtime sweep of the wave window touches only `src/{observer,multi-observer,reconstruction,responsive-qa,sitespec,selector,e2e}`, 4 CLI wrappers, 4 smoke scripts. Nothing under `recon-template/`, `visual-editor/`, `content-injection/`, `production/`, `release/`, `seo/`, `theme/` |
| 17 | Historical artifacts intact; no git operation | **VERIFIED** | `find docs/result/28.5* docs/result/28.6 -newermt '2026-09-04 13:00'` → **empty**; all `28.5*`/`28.6-*` handoffs date Aug 29 – Sep 2. Git: 3 commits, reflog 3 entries, **0 deletions**, and **nothing modified-at-start became unmodified** |
| 18 | Test honesty | **VERIFIED** (one pre-existing weakness named) | 12 checks sampled across all four suites; all four suites re-run by me. See §3.18 |
| 19 | Schema back-compatibility | **VERIFIED** | Real pre-28.7 artifacts parse under current schemas; see §3.19 |
| 20 | Counter integrity (`rejectedUnverifiable`) | **VERIFIED** | `src/reconstruction/layout-truth-check.ts:1029-1030` still derives by subtraction, but the wave's only new channel is deliberately excluded and report-only, documented at `:1046`. Residual structural risk in §5 |
| 21 | Claims I could not reproduce | **2 found** | See §4 |

**Counts across points 1–20: 18 VERIFIED · 2 PARTIAL · 0 NOT VERIFIED.**
Point 21 is a findings section, not a pass/fail point; it is reported separately in §4, and it is
**not empty** — two stated claims do not reproduce.

---

## 2. Every non-VERIFIED point, precisely

### 2.4 — Residual frozen nodes are measurable, but only the top slice (PARTIAL)

What IS true: `manifest.layout.residualFrozenNodes[]` is a genuine per-node array. Every record
carries `pageId`, `viewportId`, `nodeId`, `parentNodeId`, `tagName`, `property`, `family`,
`frozenValue`, the width vector, `sourceX`/`sourceW`/`cloneX`/`cloneW`, `absoluteDeltaPx`,
`relativeDelta`, `consequence`, `descendants`, `recoveredKind` and `refusalReason`. Report 02's §4b
top row reproduces byte-for-byte from the artifact (`p000001/desktop n000116 <div>`, `width: 1440px`,
Δ480, rel 0.25, offscreen, 416 descendants, `inline-size:no-branch-matched`).

**What is missing.** The per-route cut is 24 records. Measured on disk:

| site | residuals detected | node records retained | share |
|---|---:|---:|---:|
| linear.app `2026-09-04T13-56-34-051Z` | 2,995 | 96 (4 routes × 24) | **3.2%** |
| hobbang.net `2026-09-04T13-57-09-329Z` | 2,232 | 240 (10 routes × 24) | **10.8%** |

Worse, the retained slice is not a sample — it is the **top of a ranking whose first key is the
`offscreen` tag**, so the stored records are **100% `offscreen` on both sites** (96/96 and 240/240)
while the detected populations are 34% and 24% offscreen. The `familyHistogram` and
`consequenceHistogram` are therefore aggregate counters that **cannot be recomputed from the records
the artifact retains**.

So the honest statement of the capability is: *a holder of the artifacts can name the top 24
frozen-value nodes per route, and can read totals per frozen family and per consequence, but cannot
enumerate which nodes shipped a frozen value.* The bound is disclosed in report 02's bounds table and
counted in `residualFrozenOmitted`, so nothing is silent — but the point as stated is not fully met.

### 2.10 — The overlap split has a real hole on the failed-asset branch (PARTIAL)

The **duplicate-layer** branch is genuinely tight and cannot swallow a real overlap easily
(`src/responsive-qa/overlap.ts:118-128`): it requires *both* leaves to be `kind === "image"`, *and*
the same `key` or the same `ownerKey`, *and* every edge within 2px. Key equality alone is explicitly
rejected in the code comment for exactly the reason this audit point exists.

The **`failed-image-layer`** branch is not tight, and it is checked **first**
(`src/responsive-qa/overlap.ts:117`):

```ts
if (a.loaded === false || b.loaded === false) return "failed-image-layer";
```

`loaded` is populated only for `<img>`/`<picture>` leaves (`src/responsive-qa/probe.ts:424-428`), so a
text leaf can never trip it — that part is correct. But the predicate is `either`, not `both`. A
**genuine** layout collapse in which a correctly-loaded element lands on top of a broken image is
attributed to `failed-image-layer`, demoted out of `overlap-excess-ratio`, and lands in
`image-layer-state`, which is banded **MAJOR only** (`src/responsive-qa/classify.ts:583`,
`IMAGE_LAYER_FAILURE_MAJOR_EXCESS`). A BLOCKER-grade real overlap therefore becomes at most a MAJOR
whenever a broken asset participates.

The mitigations are real and I confirmed them: `overlap-excess-ratio-undemoted` is recorded at
`classify.ts:557`, and `duplicateImageStackPairsDemoted` / `failedImageLayerOverlapPairsDemoted` /
`overlapFindingsDemoted` reach `summary.coverage`. But `record()` never fires — it is observability,
not a gate. Nothing in the pipeline raises severity when the undemoted reading would have been a
BLOCKER and the demoted one is not.

Report 04's limitation 5 defends the MAJOR band as a judgement ("a guard that removes one finding
while inventing a more severe one has not made the instrument more honest"), which is a defensible
position — but the specific case *"real overlap, one participant is a broken image"* is not named in
any limitation, and it is the one case where the guard can hide a defect it was not built to hide.

---

## 3. Detail on the points that required judgement

### 3.7 — Site-specific keying: the two categories, kept separate

**CODE-KEYING (defect): none found.** No `switch (host)`, no `host === "linear.app"`, no selector or
node-id literal, no lookup table keyed by hostname anywhere in `src/`. Every `hostname`/`host` read in
`src/` (~70 call sites) resolves from the *current* run's own manifest or URL and is used generically
for path building, dedupe and allowlisting. The only literal host comparisons are
`src/assets/network-qa.ts:53` (`127.0.0.1` / `localhost`, SSRF classification) and
`src/assets/safe-fetch.ts:84` (reserved multicast range) — both generic infrastructure, unrelated to
any customer site.

**COMMENT-PROVENANCE (acceptable), labelled as requested:** hostnames appear in JSDoc and limitation
prose recording where a threshold was measured, e.g. `src/editor/inversion.ts:19-31`,
`src/regions/enablement.ts:19`, `src/content-injection/brief-writer.ts:357,716`,
`src/e2e/types.ts:304`, `src/cli-production-compile.ts:5-10` (a CLI usage example),
`src/responsive-qa/run.ts:1409` (a human-readable evidence string inside a limitation record), and
`src/production/brand-bake.ts:79` (a static documentation value). `p000001`/`n000123`-shaped ids appear
only in doc comments illustrating the generated selector format
(`src/reconstruction/app-template.ts:271`, `src/theme/overlay.ts:24`). ~180 further hits are
`scripts/smoke-*.ts` fixture paths pointing at captured pilot data — expected for smoke tests.

**Magic pixels:** of the values I asked to be hunted (`224`, `4191`, `1390`, `222`, `1344`, `425.6`,
`383.6`, `46`, `28`, `20`), **none appears in code at all**. `1025` appears only in a comment
(`src/sitespec/media-condition.ts:24,240`). The values that *do* appear —
`LAYOUT_PROBE_WIDTHS = [390, 700, 768, 1024, 1100, 1440, 1920]` and
`MOBILE_LAYOUT_PROBE_WIDTHS = [390, 480, 700, 768, 914]` — are a single uniform probe floor applied
identically to every site, documented at length and justified by cross-site measurement. That is a
generic default, not borrowed tuning. `src/observer/probe-widths.ts:236-268` even chooses the
non-evictable floor widths **by position in the sorted list** rather than by pixel value, with the
comment naming that as the host-specific hack the engine forbids.

### 3.11 — The coverage ledger, confirmed on a real run rather than a fixture

I read the coverage block straight out of the canary artifact
`data/linear.app/responsive-qa/2026-09-04T15-52-40-935Z/responsive-qa.json`:

```
rubricVersion: 4
coverage: pairsTotal 10, pairsGraded 10, pairsCloneRouteMissing 0,
          pairsSourceCaptureUnstable 0, pairsMeasurementFailed 0,
          pairsAccountedFor 10, conserved true, pairsVerdicted 10,
          pairsStabilityUntested 4, …all demotion counters 0
tallies:  blockerPairs 6, majorPairs 2, minorPairs 2, passPairs 0
```

The stated invariant holds on real data: `6 + 2 + 2 + 0 = 10 = pairsVerdicted = pairsAccountedFor`,
`conserved: true`. Report 05's and report 27's shared headline "6 BLOCKER / 2 MAJOR / 2 MINOR of 10"
reproduces exactly, and `pairsStabilityUntested: 4` is the honestly-counted consequence of the
edge-width decision rather than a silent omission. This is the specific defence against "fewer
blockers because we stopped measuring," and it is populated and self-consistent outside the test
fixtures.

### 3.18 — Test honesty

I sampled 12 of the wave's new checks and re-ran all four suites myself. Every suite count the wave
claimed reproduced exactly (see the table at the top).

**Checks that would genuinely go red against the defect they claim to protect:**

| # | check | why it is real |
|---|---|---|
| 1 | `scripts/smoke-multi-observer.ts:3728` `testPrepareScrollNavigationSafety` | A **real local HTTP server** serves `/nav-once` and `/nav-always`, pages that assign `window.location.href` on scroll past 200px (`:3690-3697`). Against the pre-fix code the observation is lost entirely, so `once.viewports.desktop` does not exist. The fixture *causes* the defect; it does not describe it |
| 2 | same, `:3862-3868` | asserts `restoreNavigated === true` **and** `metadata.finalUrl` ends `/nav-always` on **both** viewports — i.e. the collection describes the observed document, the exact failure the restore exists to prevent |
| 3 | `scripts/smoke-responsive-qa.ts:1828-1845` | source 200 + clone 404 must produce **exactly one** finding at BLOCKER, with `blockerCount === 1 && majorCount === 0 && minorCount === 0`. The pre-fix implementation produced the same ≥4 findings as the 200/200 control, so this is red against the broken code |
| 4 | same, `:1800-1821` | negative control: 200/200 must still fire `missing-text-ratio`, `nav-link-ratio` and `visible-text-ratio`. Prevents the guard being "fixed" by disabling the channels |
| 5 | same, `:1849-1889` | suppression is not deletion: every other channel is still present, `firedAt === null`, `threshold === null`, carries a *stated reason*, and **still carries its measured value equal to the served fixture's**. That last clause is what stops "suppressed" degenerating into "blind" |
| 6 | same, `:2013-2026` THE MINIMAL PAIR | `[1000,3000,1050]` flagged vs `[1000,3000,1800]` not, with both asserted to deviate from both neighbours. One number differs. This is the check that makes the reversion clause load-bearing — and report 04 **volunteered** that the brief's own profile did not need it |
| 7 | same, `:2571-2589` | `pairsVerdicted === pairsGraded + pairsCloneRouteMissing === verdicted.length`, plus a clean-sweep case (`:2591-2607`) asserting a sweep with **no** exclusions also conserves — which is what stops the conservation invariant being vacuous |
| 8 | same, `:2529` | a failed capture carries `outcome === "FAILED"` and bucket `measurement-failed` — the defect being "harness hole charged to the clone" |
| 9 | `scripts/smoke-layout-safety.ts:4272-4277` | span recovery asserts the **exact emitted value** `minmax(0, 2fr) minmax(0, 1fr)`, not "something was emitted" |
| 10 | same, `:4380`, `:4395` | negative controls asserting the *specific* refusal reason `not-every-track-witnessed` for a column witnessed only by spanning children |
| 11 | same, `:5490-5518` (Part 16) | the fingerprint predicate is asserted against the **measured** noise band (0.16–0.75%) and the **measured** swaps (11%, 175%) from linear's own probe, plus the `/pricing` 640→641 case where the hash changes but only 6 of 796 boxes move — the case that would have nominated the wrong width |
| 12 | `scripts/smoke-selector.ts:673-712` | drives the **real** `buildPageFamilies`/`buildPageSelection`; `buildInputs()` synthesizes only raw URL/fingerprint rows, not the family output |

**None** of the sampled checks asserts only that a command exited 0. **None** has a name that says the
opposite of its assertion. **None** would pass against the broken implementation — and the wave's own
mutation runs (documented per-report, with `shasum -a 256 -c` restore verification) independently
corroborate this on far more checks than I sampled.

**Named weaknesses, both minor:**

1. `scripts/smoke-multi-observer.ts:2952-2963` and `:3357-3365` are **source-text regex** wiring
   checks (`observePageSource.includes("requiredWidths")`, `(source.match(/extend:\s*true/g)).length === 1`).
   Brittle to harmless refactors. But they are **not** standing in for runtime behaviour: the unit
   behaviour is tested immediately above, and a **real-Chromium end-to-end** assertion
   (`mobileExt?.extended === true`) sits in `testProbeWidthDerivationEndToEnd` right after. That is the
   acceptable pattern.
2. `scripts/smoke-responsive-qa.ts:1058-1100` `testRevealPolicyAgreement` is **entirely** source-text
   regex with no runtime counterpart — it asserts `options.prepareScroll ?? true` and an unguarded
   `scrollThroughPage(page)` by pattern match. A behaviour-preserving refactor turns it red; a
   behaviour change expressed differently turns it green. **This test is pre-existing (Task 28.6), not
   added by this wave** — report 04 correctly describes it as untouched. Flagged so it is not mistaken
   for new coverage.

### 3.19 — Schema back-compatibility

This was checked **exhaustively, not sampled** — every artifact on disk older than the wave window was
parsed through the repo's own loaders where they exist (`loadSiteObservation`, `loadPageObservation`,
`loadSiteSpec`, `loadReconstructionInput`, `loadTemplateInput`) and through the schemas directly
otherwise.

| family | files parsed | result |
|---|---:|---|
| multi-observer `SiteObservationSchema` | 53 | 53 PASS |
| observer `PageObservationSchema` + `dom.json` + `styles.json` | 419 | 413 PASS / 6 pre-existing |
| observer `LayoutProbeSchema` | 464 | 462 PASS / 2 (attributed to 28.6, below) |
| sitespec `SiteSpecSchema` + every page spec | 58 | 54 PASS / 4 pre-existing |
| `ReconstructionManifestSchema` | 76 | **76 PASS** (`layout` absent, 7-key, 20-key and 60-key variants all parse) |
| `RuntimeRouteMap` | all old app dirs | PASS |
| recon-template real door `loadTemplateInput` | 8 | 8 PASS |
| selector / verifier / interaction-explorer / interaction-patterns / reconstruction-qa | 36 / 36 / 47 / 88 / 964 | PASS all |

**The wave's own additions are all correctly optional.** `fingerprint` on `LayoutProbeWidthSchema`
(`src/observer/types.ts:2759`) is `.optional()` and the observer `SCHEMA_VERSION` is **still 5** with
`READABLE_SCHEMA_VERSIONS = [3,4,5]`, byte-identical to HEAD — report 27's "no schema bump" claim
holds, and 462 of 464 old probes parse with `fingerprint` absent. Every new `manifest.layout` field
after `responsiveHidden` is `.optional()` (`src/reconstruction/types.ts:670+`).
`RuntimeRouteMap.pageBreakpoints` (`:227`), `ManifestConfig.routeBreakpoints` (`:519`) and
`variantTreeNotObserved` (`:527`) are all optional and absent from all 76 old manifests, which parse.

**Two findings that are NOT 28.7 regressions but should be recorded:**

1. `ProbeWidthProvenanceSchema` (`src/observer/types.ts:2780`) has two **required** fields —
   `breakpointsRefused` and `refusedListTruncated` — that two old probes under
   `data/linear.app/2026-09-02T18-53-56-621Z/` lack. Those fields landed in **Task 28.6 W7 on
   2026-09-02**; 216 probes written later the same day pass. It is an intra-28.6 transient, not a
   28.7 break. It matters only because `src/sitespec/compile-page.ts:300` calls
   `LayoutProbeSchema.parse()` at compile time, so recompiling a SiteSpec from that one ad-hoc run
   would throw. It is not a `site-observations/` run, so it is not a real pipeline input.
2. **`src/responsive-qa/types.ts` contains no zod at all** — the entire responsive-QA artifact family
   is unvalidated. `coverage` is a *required TypeScript field* on `summary` that all 37 pre-wave
   artifacts lack, but the only readback path (`readFloorArtifact` / `floorFrom`,
   `src/responsive-qa/run.ts:193`, `:218`) is a bare `JSON.parse(...) as ResponsiveQaRunArtifact` and
   never reads `summary.coverage`. So nothing crashes — but nothing is checked either. Old runs are
   refused as a self-check floor by the explicit `rubricVersion` comparability test instead, which is
   an honest refusal with a stated reason. See risk 9.

**Version bumps.** Exactly one exists in the working tree versus HEAD, and it is additive:
`src/sitespec/types.ts` `SCHEMA_VERSION` 4 → 6 with `READABLE_SCHEMA_VERSIONS` widened
`[2,3,4]` → `[2,3,4,5,6]`. The minimum readable is still 2, so nothing previously readable was
invalidated. Every other schema constant is unchanged from HEAD.

The remaining wave bump is `RUBRIC_VERSION` 3 → 4. It rejects no artifact, but report 04's limitation
4 is important and correct: rubric-4 verdicts can be *better* than rubric-3 on the same clone, so
**pre-existing self-check floors are not comparable** and new canary runs need fresh floors. Any
verdict comparison across that boundary is invalid.

---

## 4. Claims I could not reproduce

This section is **not** empty. Two stated facts do not survive contact with the artifacts. Neither
changes a conclusion, but both are the kind of imprecision that erodes trust in the surrounding
numbers, and one of them is wrong at the exact boundary it names.

**(a) Report 02, limitation 3 — "46 audit widths across the corpus were dropped."**
Actual: `residualAuditWidthsCapped` is **46 on linear.app** and **20 on hobbang.net**. A corpus total
would be 66. A linear-only figure is presented with the word *corpus*.

**(b) Report 27, §3 — "`/` (p000001) — `elements` 2,306 at every width up to 1440."**
Actual, from `data/linear.app/site-observations/2026-09-04T17-21-07-726Z/.../layout-probe.json`:
`elements` is 2,306 from 390 through 1281, then **2,260 at 1440** and **2,263 at 1441 and 1920**. The
probe sampled 16 widths; the report's table shows 14 and omits 1441 and 1920. The claim is false at
the width it explicitly names. It does not change the §27 conclusion — the switch decision reads
`rendered`, and the 641/929 family changes are unaffected — but "flat at every width up to 1440" is
not what the artifact says.

**(c) An undocumented delta, not a false claim.** The §27 run `2026-09-04T17-24-33-839Z` reports
`candidateRules`/`recoveredRules` **2123/2123** with `rejectedByTruthCheck: 0`, against 1863/1861 and
2 in the §26 baseline `2026-09-04T16-18-35-699Z`. Both reports tabulate the 1776/1774 → 1863/1861 step
and neither tabulates this larger one. It is plausibly a direct consequence of splitting the probe
axis at 641 instead of 1025 on `/`, but no report says so, and `rejectedByTruthCheck` falling 2 → 0 is
the sort of movement that should be explained rather than left for a reader to infer.

**Everything else reproduced.** All grid counters (both sites, before and after), all residual
histograms and omission counters, all per-route breakpoints and `variantTreeNotObserved` code sets,
the fingerprint `rendered` sequences for `/`, `/pricing` and `/changelog`, the hobbang back-compat
run, and report 06b's real-data archetype summaries (seoultone 19/11/19/**8**, hobbang 19/7/19/**12**)
all match to the digit.

---

## 5. Risks I would want closed before trusting this on brand-new public websites

Ranked by how likely each is to produce a confidently wrong answer on a site nobody has seen.

**1. A real overlap can be demoted to MAJOR by any broken image on the page.**
`overlap.ts:117` demotes on `either` leaf failing to load, before any geometry test. On a fresh public
site — where asset independence is imperfect and broken images are the *normal* early failure mode —
this is exactly the condition that will be common. The mitigation is recorded but never fired on.
**Close it by:** requiring *both* leaves to be failed images, or by promoting `image-layer-state` when
`overlap-excess-ratio-undemoted` would have reached the BLOCKER band and the demoted value does not.

**2. The whole wave's fidelity evidence rests on two sites, and the dominant defect is untouched.**
Reports 02/03 measure that `width` is **91.3% / 99.1%** of the residual and grid tracks 5.7% / 0.3%.
B2 shipped 7 verified rules across two sites. The wave's own instrument says the next lever is the
frozen **ancestor chain**, and report 02 §4d shows most top residuals are downstream of a frozen
ancestor even when the node itself recovered a rule. Nothing in this wave attacks that. The 28.6
verdict was **0 PASS / 43 BLOCKER across 7 sites**; nothing here claims to have moved it, and the one
fresh canary (report 05) still shows 6 BLOCKER of 10 pairs on linear.
**Close it by:** re-running the 7-site matrix before any readiness claim. This wave measured
diagnosis, not outcome.

**3. Only two DOM trees exist, and `/` demonstrably needs three.**
Report 27's own data: `/` changes family at **641 AND 929**. The clone serves 641 and honestly reports
`variant-tree-not-observed-at-929`. On a brand-new site with three or more authored families this
under-serves by construction, and the honesty flag is the only signal. Report 05 explicitly forbade
inventing a third variant, which is right — but the limitation is architectural, not a bug to be
patched.

**4. Board/detail collapse is proven only synthetically, and real data already disagrees.**
The `/notice/1..500` shape — the whole point of the archetype work — is exercised by a fixture, not a
production artifact. On the two real sites the projection *does* run on, the **same route pattern
splits into two archetypes** (seoultone `/page/<*>` × 2 with 3 and 7 members; hobbang `/링크모음/<*>`
× 2 with 5 and 3). That is the family cascade's scoping, honestly inherited, but it means a 500-page
board is **not** guaranteed to collapse to one list + one detail on a real site. Report 06b's
limitation 1 admits no production artifact exercises it. Task 28.8's Korean board sites are the first
real test and should be treated as a gate, not a formality.

**5. `PAGE_STATE_EVIDENCE_ROOT` is a task-numbered path baked into production code.**
`src/observer/types.ts:1652` hardcodes `"docs/result/28.7/evidence/page-state"` as the default
evidence root for a permanently-enabled feature. Task 28.8 will write its dismissal evidence into
28.7's directory. This wave already had one incident of exactly this class — report 01 describes a test
leaking into that directory and having to be cleaned. **Close it by:** making the root a required
caller argument, or rooting it under the run id.

**6. `rejectedUnverifiable` is still derived by subtraction.**
`layout-truth-check.ts:1029-1030`: `candidates.length - rules.length - rejectedByTruthCheck -
rejectedByBandCheck`. This wave threaded its one new channel correctly — the residual audit is
report-only and deliberately outside the subtraction, with the hazard written down at `:1046` — and I
confirmed empirically that the +4/+3 new candidates flowed to +4/+3 shipped with both rejection
counters flat. So the point is verified *for this wave*. But the structure is unchanged: any future
channel that accepts or rejects a rule without passing through `finish()` makes this number silently
wrong, and a rule double-counted in both rejection channels makes it **negative**. The zod
`.nonnegative()` at `types.ts:716` would then fail the write rather than explain it. **Close it by:**
asserting the conservation identity at the point of construction, not only in the schema.

**7. The residual audit's evidence is not re-derivable from what it ships.** (See §2.4.) 3.2% of
detected residuals are retained on linear, and the retained slice is 100% `offscreen`. Anyone tuning
against these artifacts will be tuning against the offscreen tail only.

**8. The entire responsive-QA artifact family has no schema validation.**
`src/responsive-qa/types.ts` contains zero `z.object`, and the floor readback is a bare
`JSON.parse(...) as ResponsiveQaRunArtifact`. This is the module that produces the **gate verdict**,
and it is the only major artifact family in the repo with no parse-time contract — every other family
(observer, sitespec, reconstruction, selector, verifier, reconstruction-qa, interaction-*) is zod
validated. A malformed or truncated run artifact is read as truth. Nothing has gone wrong yet because
`coverage` is never read back, but a future consumer of `summary.coverage` reading a pre-28.7 artifact
gets `undefined`, not an error. **Close it by:** giving the run artifact a zod schema before anything
downstream consumes `coverage`.

**9. Two source-instability blind spots that a fresh site will hit.** Guard 2 needs ≥3 widths per
route and reads only `source.totalNodes`; **edge widths are never tested**, so an unstable capture at
390 or 1440 — the two widths most likely to be captured mid-animation — is invisible. Report 04's
decision 1 states this plainly; it is a limitation to plan around, not a defect.

**Not a risk — recorded because I checked and found nothing wrong:** git and historical artifacts are
untouched (0 deletions, nothing reverted, no 28.5/28.6 file modified in the wave window); no
out-of-scope module was edited; there is no site-specific keying in code; the popup normalizer has no
DOM-removal path at all; measurement failures are cleanly partitioned out of every tally and floor;
and all four suite counts reproduced independently on my own runs.

---

*Audited read-only. No source file modified, no git operation performed.*
