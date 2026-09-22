# Task 28.8 — Final architecture audit (fresh, independent)

Auditor: fresh context, no involvement in any 28.75 lane, no stated expected outcome.
Method: every claim below was checked against source, a run artifact, or a lane artifact.
Report text was used only to locate the claim, never as evidence for it.

**Audit conditions worth stating up front.** The working tree was live during this audit:
`docs/result/28.75/06-closure-canary.md` grew from 169 to 248 lines while I was reading it
(a measurement-2 section was appended), `src/reconstruction/layout-inference.ts` has an
mtime inside the audit window, and the full regression at `tmp/wr2875/regression/` was
7 of 36 suites complete. Statuses below are as of 2026-09-05 ~22:00 KST.

---

## 1. The fourteen-item table

| # | Item | Status | Evidence | Note |
|---|------|--------|----------|------|
| 1 | Width chain fix is root-level and generic | **VERIFIED** | `tmp/wr2875/width-chain/chain-{gs,hobbang,linear,seoultone}-before.json` → Σ`totalChainRoots` = **1107**, Σ`totalResidualNodes` = **6927**; `src/reconstruction/layout-inference.ts:1847` (`trackedFillWidth`), `:2073`, `:2305`, `:4059` | The 6,927→1,107 claim reproduces exactly from the lane's own JSON. Every branch decides from probe vectors, box-model arithmetic and refusal reasons; no literal, no site constant. |
| 2 | Blank-region channel fires on real failures, silent on intentional whitespace | **VERIFIED** (with a named hole) | `docs/result/28.75/01-blank-region-channel.md:289-296`; artifact readings across 11 runs (`data/*/responsive-qa/*/responsive-qa.json`) | Fires: severance pre-fix 1.4533; linear `/` @700 1.6405, @1024 0.4067, `/pricing` @1024 0.2986. Silent: hobbang ×3, linear `/pricing` @390/@1440, severance final ×3. **But the ink leg is withheld on 100% of hobbang pairs** — see Finding 4. |
| 3 | Blank-region repair restores actual content | **VERIFIED** | `data/gs.severance.healthcare/reconstructions/2026-09-05T10-23-08-511Z/app/reconstruction-data/pages/p000001.json` contains 메디컬 리포트 / 보도 자료 / 언론 보도 / 질환·신체부위별 찾기; `…/responsive-qa/2026-09-05T10-23-24-422Z` → `missingChars 0` of 2,644 at all three widths | Content is in the artifact, not merely a metric that moved. Independent of the channel that grades it. |
| 4 | Popup policy symmetric, not viewport-blinded | **VERIFIED** | `docs/result/28.75/evidence/page-state/seoultone.kr/p000001-{desktop,mobile}-1/record.json`; `tmp/wr2875/page-state/api-evidence/seoultone.kr/apicheck-w1440-1/record.json` | Both viewports dismissed. Desktop admitted via the **new `panel` tier** (`coverGate.wouldAdmit:false`, w 0.347/h 0.904, coverage 0.314→0); mobile via the pre-existing `cover` tier. This is precisely the wide-width blindness B6 named, closed on live-site evidence. Residual scale limit at Finding 6. |
| 5 | One shared page-state policy, same contract both sides | **VERIFIED** | `src/responsive-qa/capture.ts:3-4` imports `markInitialPaintCensus` + `normalizePageState` from `src/observer`; called at `:400` and `:417` inside `captureSide` (`:355`); observer's own call at `src/observer/observe-page.ts:1307` | Real-corpus proof: every side of every pair in `2026-09-05T12-46-21-873Z` records `ran:true`, `initialPaintCensusStatus:"available"` on **both** source and clone at 390 through 1440. Skipping call 1 is recorded as `"absent"`, never silent (`normalize-page-state.ts:219`). |
| 6 | L1 closed — geometry/ownership first, demoted area still verdict-capable | **VERIFIED** | `src/responsive-qa/overlap.ts:157-176` (owner+box test precedes any `loaded` read); `src/responsive-qa/classify.ts:697-717` grades the demoted area with BLOCKER/MAJOR/MINOR bands via `rubric.evaluate`, so it enters the verdict; ledger at `classify.ts:1345-1356` | Honestly scoped: `duplicateImageStackPairsDemoted: 0` / `failedImageLayerOverlapPairsDemoted: 0` on all 16 real pairs, so the reorder is fixture-and-mutation-proved only. The reports say exactly this. |
| 7 | L3 closed — no silent crop; composites state real dimensions | **PARTIALLY VERIFIED** | `src/responsive-qa/pixel-gate.ts:186-189` (crop kept, **reported**), `:451-472` (19 band fields + conservation); `src/responsive-qa/composite.ts:160-168` banner prints `source Npx vs final Mpx at a Wpx viewport`, `:139-146` hatches the strip with `"Npx NOT PIXEL-COMPARED"` | Option (A) satisfies the requirement for the responsive-QA path. **The older path was not fixed**: `src/reconstruction-qa/screenshot-diff.ts:209-210` still does `Math.min(a.width,b.width)` with no band accounting. The lane declared this carry and added a tripwire check; it is real, disclosed, and still open. |
| 8 | No target-host branching anywhere in `src/` | **VERIFIED** | Full-tree sweep of all 403 `.ts` files under `src/`, ~15 grep passes plus direct reads of every candidate (`content-injection/brand-surfaces.ts:258`, `seo/link-qa.ts:75`, `assets/network-qa.ts:53-55`, `observer/collect-links.ts:59`, `recon-template/grouping.ts:147`, `config/env.ts`) | **Zero** code paths branch on a hostname. Every host comparison is derived-vs-derived at runtime. Only literals are `127.0.0.1`, `localhost`, `x.invalid`. ~90 doc-comment mentions of pilot sites are "MEASURED on X" justification text, never read at runtime. `data-wr-*` is the tool's own namespace, applied uniformly. |
| 9 | RouteArchetypePlan used without crawler explosion | **NOT APPLICABLE** | `data/` contains no `channel.io`, `toss.im`, `vipgunma.com` or `beomeo.roseeskin.com` directory; only `tmp/wr2875/phaseb-preflight/00-http-preflight.md` (an HTTP-layer preflight) exists | Phase B never ran. The mechanism exists and is wired (`src/cli-select.ts:122-143`, `src/selector/route-archetype-plan.ts`) but has not been exercised on any fresh site. |
| 10 | Repeated posts not deep-cloned | **NOT APPLICABLE** | same as #9; `representedWithoutDeepReconstructionCount` exists at `src/cli-select.ts:143` but no fresh-site run consumed it | Capability present, unexercised. |
| 11 | All new sites truly started from URL | **NOT APPLICABLE** | same as #9 | No new sites were started at all. |
| 12 | No Slot/Template/Editor work | **VERIFIED** | `find src -name "*.ts" -newermt "2026-09-04 12:00"` → only `responsive-qa` (13), `observer` (12), `reconstruction` (10), `e2e` (4), 4 CLI entrypoints, `selector` (3), `sitespec` (2), `multi-observer` (2), `reconstruction-qa` (1) | `git status` shows `src/editor/` and 11 dirty `src/content-injection/` files, but **none has an mtime in the 28.75 window** — the repo has been uncommitted since Task 25, so those are older waves' residue, not this one's. |
| 13 | Regression honest | **PARTIALLY VERIFIED** | `tmp/wr2875/orch/run-regression.sh` — suites enumerated by `for f in scripts/smoke-*.ts` (line 18), `UNPARSED` never skipped (line 30), per-suite delta vs `baseline-287.tsv` (lines 32-34), typecheck appended | Design is exactly as claimed. **No assertion was deleted or weakened**: across 12 diffable suites, 7 removed assertion lines, all rewrites into strictly stricter replacements; the two deliberate `overlap.ts` inversions are legitimate (the old test pinned a genuine false-negative). **But**: the wave's regression totals are not yet real — `tmp/wr2875/regression/index.tsv` holds **7 of 36 suites** and the run is still live; and `smoke-{layout-safety,responsive-qa,qa-independence}.ts` are **untracked (`??`)**, so no baseline diff is possible for the three suites this wave changed most. See Finding 2. |
| 14 | Human packs reference final runs only | **PARTIALLY VERIFIED** | `docs/result/28.75/human-review/manifest.json` pins linear `2026-09-05T12-46-21-873Z` (newest), hobbang `2026-09-05T10-20-57-685Z`, severance `2026-09-05T10-23-24-422Z` | Linear is correct and final. Severance's newer build is counter-identical, so nothing is lost. **hobbang is not final** — see Finding 1. |

---

## 2. Findings

### F1 — The human review pack grades three sites on two different engines (most serious)

**Report claim** (`06-closure-canary.md`, measurement 2): *"`gs.severance.healthcare` (`…10-23-24-422Z`) and `hobbang.net` (`…10-20-57-685Z`) were **not** re-run. Their `layoutProbe`/`layoutProbeMobile` elementCounts are byte-identical between the 28.7 and 28.75 observations, so the probe defect provably never touched them; re-running would have added capture noise to artifacts that are already the evidence."*

**Counter-evidence.** The justification is sound for the *probe* defect and irrelevant to the *grid-area* mechanism that correction cycle 1 adopted. Reconstruction manifests:

| host | pinned build | `gridAreaFill` | `residualFrozenOmitted` | newer build exists | `gridAreaFill` |
|---|---|---:|---:|---|---:|
| hobbang.net | `2026-09-05T10-19-45-357Z` | **0** | 1945 | `2026-09-05T11-06-40-264Z` | **328** |
| gs.severance | `2026-09-05T10-23-08-511Z` | 0 | 170 | `2026-09-05T11-08-19-970Z` | 0 (identical) |
| linear.app | `2026-09-05T12-45-39-605Z` | **385** | 2264 | — | — |

`gridAreaFill: 328` is exactly the counter the orchestration log cites as cycle 1's cured result
("`gridAreaFill` 155 → **328**, `residualFrozenOmitted` 1370 → **814**"). A QA run on that build
already exists — `data/hobbang.net/responsive-qa/2026-09-05T11-13-31-951Z` — and it is **not** the
same measurement: `/` @1100 `overlap-excess-ratio` 0.0556 → **0.0242**, `/` @1440 0.0119 → **0.0189**.
The manifest was generated at 12:54, after that run existed.

So the pack a human auditor will grade contains **linear built with the wave's final reconstruction
code and hobbang built without it**, and the closure canary's 16-pair tally mixes the two. Severance
is materially unaffected (counter-identical builds), so the defect is confined to one site — but the
pack's premise, that it shows the wave's final engine, does not hold for 3 of its 16 pairs.
This is a provenance error, not a fabrication: every number in the pack is a real number from a real run.

### F2 — The wave's regression numbers do not yet exist

`tmp/wr2875/regression/index.tsv` contains 7 rows (`assets` … `custom-properties`) against 36
`scripts/smoke-*.ts` on disk, and the runner is still live. Any statement of the form "N suites /
M checks, 0 failures" for 28.75 is therefore **unverified at this time**, not false. Two additional
gaps: (a) `smoke-layout-safety.ts`, `smoke-responsive-qa.ts` and `smoke-qa-independence.ts` are
untracked, so `git diff` cannot prove their assertions were not weakened — I fell back to reading
their current content and the lane reports, which agree, but that is a weaker proof than the other
12 suites got; (b) the highest layout-safety tally recorded on disk is **451/451**
(`tmp/wr2875c/post-layout-safety.log`) while the orchestration log claims **455/455**. The suite file
now contains 457 `check(` sites, so 455 is plausible — but no log proves it, and the running
regression will settle it.

### F3 — The wave's own hard gate never reached a verdict, and Phase B never started

Every row of `docs/result/28.75/GATE.md` still reads `pending`. The wave's own measurement says
clause **B NOT MET** (`footer-clipped = 1` on linear `/` @700/@1024/@1100 and `/pricing` @1100, source 0)
and clause **F NOT MET** (0 machine PASS of 16). GATE.md's own instruction — *"On PASS … begin Phase B
automatically"* — was therefore correctly not triggered. This is the evidence behind items 9-11:
Phase B is absent because the gate that authorises it did not pass, which is the system behaving
as designed. It should not be read as a shortfall in honesty; it should be read as the wave
closing at **Phase A incomplete**.

### F4 — The flagship new instrument is disabled on a third of the sites, by page length

`src/responsive-qa/blank-region.ts:721` withholds the screenshot-ink leg when the DOM census covers
less than `REGION_INK_DOM_COVERAGE_MIN = 0.8` of the page. On the real corpus this fires on **every
hobbang pair**:

> `THE INK LEG WAS WITHHELD on this pair (source: the DOM census reaches only 50% down a 17167px page (floor 80%))` — `data/hobbang.net/responsive-qa/2026-09-05T10-20-57-685Z`, @390; 47% @1100; 55% @1440.

The lane named this as "the single most fragile point in the new instrument," and
`classify.ts:868` states the consequence in the artifact itself ("the configuration in which the
severance hero … reports as healthy"). That disclosure is exemplary. The architectural fact remains:
**the trigger is page length**, and the one long page in the corpus trips it at every width. The
channel built to catch paint occlusion is off on 3 of 16 pairs, and will be off on most long
content sites.

### F5 — The truth-width pair regressed, and the offered explanation does not cover it

`06-closure-canary.md` discloses it (measurement 2): linear `/` @1440 `missing-text-ratio`
0.0023 → **0.0469**, verdict MINOR → **MAJOR**, and it attributes the rise to the two-DOM-tree limit:
*"at 700 the source serves something in between that neither tree contains. So `missing-text-ratio`
rises at every width from 700 up, and `/` @1440 crosses MINOR → MAJOR."*

The disclosure is honest and the direction is right, but the mechanism does not reach 1440. Linear's
family changes are at 641 and 929, so **1440 is served by the desktop tree** — the tree that is
observed, and the one that held 0.0023 before. Measured from the artifacts: source side byte-identical
(`sourceVisibleChars` 9202 both runs), clone missing 21 chars / 1 string / 3 occurrences → **432 chars /
17 strings / 19 occurrences**; `position-delta-p90-px` 14 → **63**; `blank-region-ratio` newly fires
MINOR 0.0343. Something in cycle 2's structural probe-attachment rewrite cost content at the one
width the engine previously reproduced almost exactly. The trade may still be correct — cycle 2 also
bought a 99× overlap collapse at 700 — but its cost at the truth width is currently **unexplained**,
not merely unwelcome, and it is the pair whose exactness the wave used as its PROTECT anchor.

### F6 — The popup gate is scale-invariant in form and not in effect

`PANEL_SHAPE.minWidthCoverage = 0.20`, applied to `widthCoverage = intersectionWidth / viewportWidth`
(`normalize-page-state.ts:500-538`). The seoultone popup is a fixed 500px box: 0.347 at 1440, ~0.26 at
1920, and **below the 0.20 floor above ~2500px**. Fixed-pixel modals are the common case, so the gate
that was just un-blinded at 1440 re-blinds itself on a wide monitor. Nothing in the wave measures
above 1440. The lane already records that `gs.severance`'s own entry popup is still not dismissed —
consistent with a gate that is narrower than "every entry popup."

### F7 — The old QA pipeline still crops silently

`src/reconstruction-qa/screenshot-diff.ts:208-210` (`compareImages`) reduces to
`min(width) × min(height)` with no band accounting and no caveat — the exact defect L3 closed one
directory over. It is outside the lane's ownership, was deliberately left, and a tripwire check
guards it. Anyone reading `reconstruction-qa` output rather than `responsive-qa` output is still
reading a silently cropped comparison.

---

## 3. Genericity assessment

**My judgement: this system is solving the general problem. The evidence is unusually strong for
this specific question, and it is the strongest part of the wave.**

The decisive check is negative and it came back clean. A full sweep of all 403 `.ts` files under
`src/` found **zero** code paths that branch on a hostname, domain, selector, or site-specific
constant. Every host comparison in the tree is derived-vs-derived at runtime; the only string
literals are `127.0.0.1`, `localhost`, and the RFC-reserved `x.invalid`. There is no per-site
config file, no allowlist, no `switch (host)`, and no site-named source file. The ~90 places that
mention `linear.app` or `hobbang.net` are doc comments recording *where a threshold was measured* —
which is the opposite of fitting: it makes the provenance of each constant auditable, and I used
exactly those comments to find the constants worth challenging.

Three further properties support the judgement:

1. **The mechanisms refuse far more than they act.** `damageClampWidth` clamps 150 nodes against
   7,194 refusals, each refusal carrying an enumerated reason. A rule set tuned to four sites does
   not build a refusal histogram; it builds exceptions.
2. **Null results appear where they should.** Linear's style catalog carries 3,150 `float`
   declarations, 100% of them `none` — the float whitelist fix, which exists for severance's slick
   carousel, is correctly inert on a site that does not use floats. That is the signature of a
   generic mechanism.
3. **Guards were rejected on measurement.** Two candidate false-positive guards were measured and
   discarded because the numbers did not separate; `paintSuppression` was evaluated as an evidence
   leg and rejected for naming no box. Fitting adopts whatever silences the complaint.

**Where the genericity claim is thinner than it looks.** Every threshold in the new instrument was
calibrated on a 3–4 site sample, and two of them are single-site separations:
`REGION_INK_DOM_COVERAGE_MIN = 0.8` sits between hobbang's 0.50 and everyone else's 0.98–1.00, and
`PANEL_SHAPE` was fitted around one popup on one site that is now offline. The *code* is generic;
several of its *numbers* are three-point fits. That is a different and lesser problem than
special-casing — it degrades gracefully and is visible in the artifacts — but it is the reason I
would not extrapolate the four-site results to a fresh corpus without running one.

---

## 4. Residual architectural risk — what breaks on a site nobody has tried

Ordered by my estimate of probability × damage.

1. **Long pages silently disable the paint-occlusion detector.** (F4) The ink leg's trigger is DOM
   census depth relative to page height. Any long page — a blog index, a documentation site, an
   e-commerce category, `beomeo.roseeskin.com`'s 1.6 MB homepage — plausibly trips the 0.8 floor and
   reverts the rubric to DOM-only, in which a white-on-white hero grades healthy. The caveat is
   printed, but a reviewer who does not read caveats sees a clean channel.
2. **Sites needing three or more DOM trees.** Only two trees are ever observed (B3, carried since
   28.7). Linear `/` needs three and pays for it at 700, 1024 and 1100 — 4 of the 6 remaining
   BLOCKERs. Any site with breakpoints at both a tablet and a small-desktop width inherits the same
   failure, and no width mechanism can answer it: the measurement does not exist.
3. **A frozen desktop canvas centred inside a narrower viewport.** The clone's `contentMaxRight`
   pins at 1838 while the source reflows to 1509, `scrollWidth` equals the viewport, and the clip is
   **bilateral** — content is lost off both edges with nothing to scroll to. This is the single most
   user-visible defect class remaining and it is unrepaired; a normal reader calls such a page broken
   on sight.
4. **Fixed-pixel modals on wide monitors.** (F6) Above ~2500px the panel tier stops admitting a
   typical 500px modal, and the observer captures the site with its popup in place — poisoning the
   observation, not just the QA.
5. **Transient upstream errors accepted as content.** Cycle 2 found `probeLayout` discarding the
   `page.goto()` response, so a Chrome-wrapped `text/plain` error body was walked as a legitimate
   3-element probe and survived a full lane, a spec compile, a reconstruction and a QA run **without
   one number going red**. The gate is now in place and coverage is asserted with a floor — but the
   pipeline makes four loads per URL and the lesson is that unguarded loads are invisible. A flaky
   edge on a fresh site is the most likely first failure of a Phase B run.
6. **Machine PASS is unreachable.** `pixel-residual-difference-ratio` fires MINOR on 16 of 16 pairs;
   its best value anywhere is 0.0152 against a 0.01 threshold, on a pair a human graded PASS. The
   top band of the scale cannot be reached by any real reconstruction, so machine verdicts currently
   cannot certify a site — a human is required for every release. The wave correctly refused to
   lower the threshold to manufacture a PASS; the consequence is that the instrument cannot yet
   perform the job the pipeline needs from it.
7. **Throughput.** Observation went 28.3 s → 120.4 s per page (4×) for correctness. Four fresh sites
   at that rate is a materially different budget, and `beomeo.roseeskin.com` is an order of magnitude
   heavier than the corpus.
8. **Provenance discipline under parallel lanes.** (F1) Multiple builds per host per hour, pinned by
   hand into a manifest, produced a pack that mixes engine versions. Nothing in the tooling ties a
   review pack to the code revision that produced its clones. On a four-site Phase B with more lanes
   in flight, this will recur, and it is the failure mode most likely to invalidate a conclusion
   while every individual number stays true.

---

## 5. Bottom line

The engineering is honest. Across fourteen items I found **no fabricated claim and no weakened
assertion**; the disclosures I checked were, if anything, more self-critical than they needed to be
(the closure canary volunteers its own MINOR → MAJOR regression, the blank-region lane names its own
most fragile point, the QA lane refuses two threshold retunes that would have bought a nicer tally,
and the orchestrator publicly corrects two of its own earlier entries). Genericity — the item that
most determines whether any of this transfers — is **verified**, and verified negatively, which is
the strong form.

What the artifacts do not support is any statement that 28.75 closed. Its own gate is unadjudicated
with two clauses self-reported NOT MET, its regression is a fifth complete, its review pack mixes two
engine versions on one site, and 6 BLOCKERs remain on the site it understands best. The correct
reading of this wave is **Phase A materially advanced, not closed; Phase B not begun.**
