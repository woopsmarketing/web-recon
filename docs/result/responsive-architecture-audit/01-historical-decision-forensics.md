# Responsive Architecture Audit — 01 · Historical Decision Forensics

**Date:** 2026-09-14 · **Mode:** READ-ONLY (no src/, data/, docs, git mutation; only this file written)
**Question:** Did production responsive priority ever become *"source-authored CSS / responsive-rule preservation first, computed-style inference as fallback"*?
**Git context:** only 3 commits; HEAD `6c2e723` (2026-08-27) predates 28.5C. Every mechanism below lives in the **uncommitted working tree**. "Commit" = none for all rows. Mechanism presence at HEAD was checked with `git show 6c2e723:<file> | grep -a`; file mtimes are local KST.

---

## FINAL CLASSIFICATION: **C — some mechanisms landed in production code**

Source-authored *information* (breakpoint numbers, per-element matched declarations, media conditions, `var()` values) now reaches the IR and is used in three narrow ways: to **snap** inferred band edges, to **rank** tree-switch candidates (now served only as evidence), and as the **last-resort** `authored-inline-size` fallback. The primary tier is still the frozen exact-computed stylesheet plus probe-measured geometric recovery. No source rule is ever replayed; the grid-track recovery states in code that the authored stylesheet is not read. Priority was never inverted, so this is not **D**. It is also more than **A** or **B**: Strategy B was tested and rejected (B), and then capture/IR/constraint pieces shipped in production code (C).

---

## 1. Decision table

| Task / date | Decision | Experiment only? | Production implemented? | Current code still reflects it? (file:line) | Doc evidence (path:line) |
|---|---|---|---|---|---|
| pre-28 baseline (≤08-27, HEAD `6c2e723`) | Two computed-style trees (390/1440) + probe inference; authored decls = evidence only | — | yes (committed) | Frozen tier still primary: `src/reconstruction/layout-inference.ts:26` ("authored layout declarations … used as supporting evidence"); `src/sitespec/types.ts:729` ("never merged into the exact-computed style catalog") | `28.5C-responsive-pipeline.json`; pre-overnight audit has no responsive decision |
| **28.5 (A)** 08-29 | Full source-DOM + preserved-sheet artifacts (B-plus / hybrid C) **win on linear** (exact scrollHeight 9/9 widths); rec: *"ADOPT PRESERVED SOURCE STYLESHEETS FOR THE ONE THING TARGETED FIXES PROVABLY CANNOT DO"* (responsive) as an **added channel** alongside per-node tokens. **Wholesale switch rejected.** Preserved-@media channel **explicitly deferred.** | yes (tmp/wr-visual-fidelity-investigation/exp-B-full-stylesheet, exp-C-hybrid, recheck-R3-PRESERVED, recheck-R4-RESPONSIVE) | **no** | n/a (no replay channel exists in src/) | `28.5-visual-reconstruction-root-cause-2026-08-29.md:875` (unobserved widths "free and correct"), `:957` (fix #8 REPLACE SUBSYSTEM, "fix NOT measured in this form"), `:962` (#13 KEEP CURRENT), `:981` (don't switch wholesale), `:1040-1048` (channel C + coexistence risk), `:1081` ("Do **not** start the preserved-`@media` channel yet"); `handoffs/28.5-simplification.json → recommendationWithEvidence` |
| **28.5B** 08-29/30 | Targeted hardening; "Why We Are Not Switching To Preserved Stylesheets Yet"; responsive lever handed to 28.5C | no (src changes, non-responsive) | yes (allowlists, CB guard, truth check) | `layout-truth-check.ts` exists (absent at HEAD) | `28.5B-generic-fidelity-hardening-wave1-2026-08-29.md:683-697`, `:781` |
| **28.5C** 08-31→09-01 | Strategy A (extra probes) rejected; **Strategy B (selective rule preservation + render-time replay) rejected outright**; Strategy C (minimal inference correction) winner. Principle PRESERVE→OBSERVE→INFER **"ADOPT NARROWED"**: preserve at **capture/IR + as constraint on inference**, **refuted as a rendering principle**, + VERIFY | **yes** — `src/` byte-unchanged (verified by adjudicator) | no | n/a | `28.5C-responsive-root-cause-decision-2026-08-31.md:8,83-85,135,158`; `handoffs/28.5C-adjudication.json:139-160,214-258`; `handoffs/28.5C-final.json:17-18,62-66,81` |
| **28.6** W1.1 (09-02..04) | CORS stylesheet fallback via `page.on('response')` body capture (no 2nd fetch) | no | **yes** | `src/observer/observe-page.ts:304-322,434,445,1276`; `src/observer/collect-dom.ts:623-632` | `28.6/00-plan.md:10,19`; `28.6/00-defect-ledger.md:266-269` (B1 CLOSED: linear 30/30 recovered) |
| 28.6 W1.2 | `@container`/`@supports`/`@layer` no longer recorded as unconditional | no | yes | `collect-dom.ts:630-632`; schema `src/observer/types.ts:1024-1098` (`media/supports/container/layer/origin/selector`) | ledger B2 `:271-274` |
| 28.6 W1.4 / A7 / A8 | Probe widths `[390,700,768,1024,1100,1440,1920]` + mobile probe `[390,480,700,768,914]`; `probeExtraWidths` plumbing; derived widths + `requiredWidths` | no | yes | `src/observer/types.ts:2749-2751,2779-2781` (HEAD: `types.ts:992` = `[390,768,1024,1440,1920]`); `src/observer/probe-widths.ts` (new, absent at HEAD); `src/multi-observer/observe-selected-pages.ts:102,353-354,552-556` | ledger A7 `:77-91`, A8 `:93-100`; `28.6/07-o31-probe-width-eviction-fix.md` |
| 28.6 W4 | `authoredBreakpoints` histogram in SiteSpec | no | yes | `src/sitespec/authored-breakpoints.ts:118` (`computeAuthoredBreakpoints`, new, mtime 09-03); `src/sitespec/media-condition.ts` (new) | `28.6/00-plan.md:22` |
| 28.6 W5 / D1 / A1 | `hiddenRanges` → `hiddenBands` + `snapBandEdges`: band edge snapped to an authored breakpoint **only inside the (lower, upper] probe gap**, else midpoint | no | yes | `layout-inference.ts:6805` (`hiddenBands`), `:7020-7058` (`snapBandEdges`, rules a–e) | `28.6/00-plan.md:23`; ledger A1 `:16-17` CLOSED |
| 28.6 R3 / A3 (= 28.5C WP5) | Truth check renders in-band widths; responsive-hidden exemption removed | no | yes | `src/reconstruction/layout-truth-check.ts:272` ("since Task 28.6 R3 removed the responsive-hidden exemption"), `:1620-1642` (`renderWidths`) | ledger A3 `:36-37` (acceptedUnchecked 738→0) |
| 28.6 W7 "coherent unfreeze" (= 28.5C WP3) | Transitive unfreeze **WONTFIX-PROVEN-HARMFUL**; instead probe-predicated geometric width kinds | no | partly (geometric kinds, not Strategy-C `width:auto`) | kinds at `layout-inference.ts:133-225` (`full-width`, `tracked-fill-width`, `viewport-bleed-width`, `damage-clamped-width`, …) | `28.6/00-plan.md:25`; ledger A4 `:47-50`, A2 `:26-27`; A9 frozen-chain residual OPEN `:114-116` |
| 28.6 / 28.5C WP6 | Mobile subtree receives inferred rules (hardcoded desktop lifted) | no | yes | `layout-inference.ts:4436` (`LAYOUT_VIEWPORT_IDS = ["desktop","mobile"]`), `:7241` (`data-wr-viewport="${rule.viewportId ?? "desktop"}"`); HEAD `6c2e723:layout-inference.ts:470` hardcoded `"desktop"` | `28.5C…md:146`; `28.6/00-defect-ledger.md:217-219` (A13) |
| 28.6 C1 / 28.7 | Tree switch routed through authored-breakpoint histogram (linear served **1025 "authored-breakpoint"**) | no | yes, **then demoted** in 28.8-fast | `src/reconstruction/tree-switch.ts:25-27,542` (new file, absent at HEAD) | `28.7/26-per-route-tree-switch.md:57` |
| 28.7 §26 | Per-route tree switch (`byPageId`) | no | yes, **then emptied** under policy | `responsive-plan.ts:116-145,268-306` ("`byPageId` IS EMPTY UNDER THE POLICY, ON PURPOSE") | `28.7/05-responsive-variant-decision.md:48-57`; `28.7/26-per-route-tree-switch.md` |
| 28.7 §27 | Mobile probe envelope extended **only from source-authored media conditions** | no | yes | `src/observer/probe-widths.ts:189-215` (per 28.7 audit) | `28.7/09-final-architecture-audit.md:42`; `28.7-reconstruction-core-correction-2026-09-04.md:90,405` |
| 28.7 B1 / 28.75 §03b | Grid-track recovery (incl. banded) — **measured from child boxes; authored track list NOT read**; band edges snapped | no | yes | `layout-inference.ts:3056` (*"The authored stylesheet is NOT read. `2fr repeat(4, 1fr)` is never parsed"*), `:3067`, `:3753`, `:4072`, `:4342` | `28.75/03b-grid-track-band-recovery.md:18-21,162-184`; ledger A5 `:51-52` |
| 28.75 §03 | Frozen width-chain roots: geometric predicates with refusals; acceptance NOT MET | no | yes | refusal enums `layout-inference.ts:340-492` | `28.75/03-frozen-width-chain-root.md:17,318` |
| 28.7 framing | "The two-tier model is not an attempt to reproduce the source stylesheet" | — | — | consistent with code | `28.7-reconstruction-core-correction-2026-09-04.md:719` |
| **28.8-fast** D1 09-08 | **Tree switch = fixed product policy** (mobile ≤800 / desktop ≥801); authored inference "ships as evidence only" | no | **yes** | `src/reconstruction/responsive-plan.ts:60-96` (`V1_RESPONSIVE_POLICY`, "WHY IT OUTRANKS THE INFERENCE"), `:224-243` (`provenance:"product-policy"`, `inferredAuthoredPx`) | `28.8-fast/00-core-finish.md:16,28-38`; `28.8-fast/05-final.md:22` |
| 28.8-fast D2/A2 | `authored-inline-size`: emit authored `width:%`/`max-width`/`margin:auto`/fluid tracks **as final fallback**, truth-checked | no | **yes** | `layout-inference.ts:4552-4570` ("WHY IT IS LAST … runs ONLY for nodes no recovered rule already answers for"), `:4945`, `:6706` | `28.8-fast/00-core-finish.md:17,40-58` |
| 28.8-fast A2b | `var()` resolution of authored values against the clone's **own emitted** custom properties | no | yes | `layout-inference.ts:4807` (`resolveAuthoredVars`), `:4993-5002` | `28.8-fast/00-core-finish.md:181-193` |
| 28.8-fast A3 | Text-box relief `wr-tx`/`wr-sf` (frozen tier) | no | yes | `src/reconstruction/style-generator.ts:131-146` | `28.8-fast/00-core-finish.md:59-69` |
| 29 / 29.1 | Slotized template / identity — no responsive-priority change | — | — | — | `29-slotized-template/01-final-validation.md:146` (only a breakpoint-rule byte count) |
| apartmentary 09-14 | Manual CSS patch of one generated app (fluid desktop, layout modes A–E) | patch to generated artifact | **no src change** | engine `src/{reconstruction,observer,sitespec}` newest mtime 2026-09-09T01:46 (none after 09-10) | `apartmentary-layout-modes-2026-09-14.md:4`; `apartmentary-fluid-desktop-2026-09-14.md:50-56` |

---

## 2. Answers

### (1) When, if ever, was source-first priority actually adopted?
**Never.** Two moments came closest:
- **28.5 (08-29).** The recommendation text is the most source-first thing on record: add preserved source `@media`/`@container` rules as a channel that *governs widths the observer never visited*. The same report deferred it (`28.5…md:1081`) and flagged the risk that it might not coexist with 5,740 baked `width:<px>` declarations (`:1046-1048`). It was never implemented.
- **28.6 C1 → 28.7 (09-02..09-05).** The **served** tree-switch breakpoint came from the authored-breakpoint histogram (linear: `1025 (authored-breakpoint)`, `28.7/26-per-route-tree-switch.md:57`). This is the only period in which a source-authored number directly decided what production served. Even then it was one number picking between two computed-style trees, not rule preservation. 28.8-fast D1 reversed it to a product policy (`responsive-plan.ts:60-96`).

### (2) Exact task/commit/code path
None for source-first. The partial mechanisms are **not committed**: HEAD `6c2e723` predates all of them, and the working-tree paths are listed in the table. At HEAD, `tree-switch.ts`, `probe-widths.ts`, `authored-breakpoints.ts`, `media-condition.ts` and `layout-truth-check.ts` are absent, and HEAD `layout-inference.ts` / `responsive-plan.ts` contain 0 hits for `snapBandEdges|V1_RESPONSIVE_POLICY|authored-inline-size|grid-track-columns|captureStylesheetBodies`.

### (3) Production priority over time
| Period | Served decision | Primary tier | Role of source-authored CSS |
|---|---|---|---|
| ≤ 28.5C (to 09-01) | switch = midpoint 915 (`inferred`) | frozen computed px + probe-inferred fluid tier; midpoint `hiddenRanges` | evidence only; `rule.media === undefined` filters **excluded** media rules; 30/81 linear sheets CORS-lost |
| 28.6 – 28.7 (09-02 → 09-05) | switch = authored-breakpoint histogram (1025 on linear), per-route overrides | frozen computed + probe-measured geometric recovery, truth-checked at in-band widths | capture complete (CORS fixed); **constraint** on inference (edge snap, switch ranking, mobile envelope) |
| 28.8-fast → now (09-08 →) | switch = **product policy 801** | same + text-box relief | constraint (edge snap) + evidence (switch) + **last-resort fallback emission** (`authored-inline-size`, var-resolved) |

Priority order in current code: **frozen exact-computed tier → probe-measured recovered rules → `authored-inline-size` (last, only where nothing else answered) → truth check**. That is computed/measurement-first, with source used as fallback and as a constraint.

### (4) What changed after 28.5C, mechanism by mechanism
| Mechanism (28.5C WP / origin) | Landed? | Source-first or inference? | Where |
|---|---|---|---|
| Band fix (WP1) | yes | inference, **edge snapped to authored bp inside probe gap** | `layout-inference.ts:6805,7058` |
| Probe plumbing / 1100 & 700 probes (WP2) | yes | observation | `observer/types.ts:2749,2779`; `probe-widths.ts`; `observe-selected-pages.ts:102,353,552` |
| Unfreeze (WP3) | Strategy-C form **not** landed; transitive unfreeze WONTFIX; geometric width kinds landed; A9 residual open | inference | `layout-inference.ts:133-225`; ledger A4/A9 |
| CORS stylesheet fetch (WP4) | yes (response-body capture, no 2nd fetch; bodies held in memory, only matched per-element decls persisted) | capture | `observe-page.ts:434,445`; `collect-dom.ts:623` |
| authoredLayout capture (WP4) | yes (linear /pricing 17/1,363 → 1,363/1,363 nodes) | capture/IR | `observe-page.ts:309-314`; `sitespec/compile-viewport.ts:303`; `observer/types.ts:1024-1098` |
| authoredBreakpoints histogram | yes | IR | `sitespec/authored-breakpoints.ts:118` |
| authored-inline-size (28.8-fast D2) | yes | **source value emitted, as LAST fallback** | `layout-inference.ts:4552-4570,4945,6706` |
| var() resolution (A2b) | yes | resolves against the **clone's** emitted props, not source `:root` rules | `layout-inference.ts:4807` |
| Product policy switch 800/801 (D1) | yes | **policy over authored inference** | `responsive-plan.ts:60-96,224-243` |
| Per-route tree switch (28.7 §26) | code present, **inert under policy** (`byPageId` empty) | authored-ranked, now evidence | `responsive-plan.ts:268-306`; `tree-switch.ts` |
| Grid-track recovery (28.7 B1 / 28.75 03b) | yes | **measurement; authored track list explicitly not read** | `layout-inference.ts:3056,3067,3753,4342` |
| Truth-check widths (WP5) | yes | verify | `layout-truth-check.ts:272,1620-1642` |
| Mobile subtree rules (WP6) | yes | inference per tree | `layout-inference.ts:4436,7241` |
| Mobile probe envelope from authored media (28.7 §27) | yes | observation, driven by authored conditions | `probe-widths.ts:189-215` |

### (5) Where the docs differ from code (code is authoritative)
1. **28.5C adjudication "INFER: prefer an authored fr/%/clamp value over a resolved px when the probe already proves the node fluid"** (`adjudication.json:157`). In code, grid tracks come from child geometry and "The authored stylesheet is NOT read" (`layout-inference.ts:3056`). Authored values are emitted only when **no** recovered rule answers (`:4561-4570`). Code: authored comes last, not preferred.
2. **28.5C "Stop excluding media-conditioned declarations"** (`adjudication.json:155`). In code, `authored-inline-size` admits a media-conditioned declaration only if it holds across the **whole** served range of that tree. Partial coverage is refused (`media-partial-range`; `28.8-fast/00-core-finish.md:47-48`, `layout-inference.ts:4726` `authoredMediaHolds`). Code: still largely excluded.
3. **28.6/28.7 "switch from authored breakpoints"** (`28.7/26…md:57`). In code, the served value is 801 policy and the authored answer is evidence only (`responsive-plan.ts:79-81,241`).
4. **28.5C "choose probe pair from authored switch"** (WP2/D4c). In code, probe widths are a fixed default set plus derived/required widths (`types.ts:2749`, `probe-widths.ts`). The authored-driven part is the mobile envelope extension (§27).
5. **Counting discrepancy.** 28.5C quotes authoredLayout on "34 of 3,254 nodes" (`28.5C…md:74`, `adjudication.json:59-60`). 28.6 code comments say that figure "belongs to no artifact on disk for this URL" and give 17/1,363 (`observe-page.ts:309-314`). The two use different artifacts. The conclusion (near-zero capture before W1.1) is the same either way.
6. **28.5C experiments.json `ruleAccounting.unmatched: 0`** (`:312`) conflicts with `byViewport.unmatched: 511` (`:317,322`). The top-level counter is never incremented (`tmp/wr-responsive-investigation/agent-d/scripts/b-build.mjs:159` vs `:163-178`). 511 of 621 kept rules matched no element.

---

## 3. Why Strategy B failed in 28.5C, and whether source-first was wrong in principle

### 3.1 What B actually was
From `tmp/wr-responsive-investigation/agent-d/scripts/b-build.mjs` and `patch-b.mjs` (both still on disk):
- It fetched all 81 linear sheets live from `https://linear.app/pricing` (`b-build.mjs:44,61`) and parsed them in an about:blank CSSOM.
- It kept only declarations whose property is in a **layout-only allowlist** (`:26-37`): width-media rules plus unconditional rules with fluid values (`:103-113`). **Custom properties were not kept**, including the 6 media-conditioned `:root` token rules.
- It translated selectors by rebuilding the observed `dom.json` offline and mapping `sourceElementId`→`nodeId` (`:115-154`). This was needed because the SiteSpec strips `class` (`src/sitespec/safe-attributes.ts:22-23,134`).
- It **promoted every declaration to `!important`** (`:172`) and flattened all selectors to uniform `[data-wr-viewport] [data-wr-node]` specificity. That erased source specificity, source order and `@layer` order.
- It **appended the result as an overlay** on the unchanged frozen exact-computed stylesheet (~5.9k nodes of 1440-resolved px) after deleting the 738 synthetic bands (`patch-b.mjs:13-24`).
- **One iteration only.** C got seven variants (C1, C2, C3, AC3, AC4, AC5, AC5c), each correcting the previous one.

### 3.2 Measured result (`handoffs/28.5C-experiments.json:183-353`; `tmp/…/agent-d/out/metrics-*.json`)
visibleChars per width (390 / 700 / 1024 / 1100 / 1440):
| | 390 | 700 | 1024 | 1100 | 1440 |
|---|---|---|---|---|---|
| source | 2186 | 2195 | 2234 | 2461 | 2461 |
| current | 2186 | 2186 | 2173 | 2173 | 2461 |
| **B-preserved** | 2246 | 2242 | 2525 | 2543 | **2543** |
| AC5 | 2186 | 2186 | 2173 | 2461 | 2461 |

Grades: 390 MINOR, 700 MAJOR, 1024 BLOCKER (249 offscreen nodes), 1100 BLOCKER (duplicated stacked CTAs, cards colliding), 1440 MAJOR (a regression from exact). Totals: blockers 2, majors 2 (`experiments.json:292-305`). Screenshots: `tmp/wr-responsive-investigation/agent-d/shots/B-preserved-{390,700,1024,1100,1440}.png`. CSS: `…/out/b-preserved.css`. Report: `…/out/b-report.json`.

### 3.3 Stated reasons (quoted)
- *"preserved fluid rules only override the handful of properties they declare while the surrounding ~5.9k nodes keep 1440-resolved frozen px"* (`experiments.json:327`).
- *"the .hide-laptop/.show-laptop pair both render because only layout properties were preserved"* (`:302`).
- *"to be correct it needs the FULL sheet … @layer order must be replayed; here it was bypassed with !important, which is why the frozen tier could not be cleanly re-cascaded"* (`:332-333`).
- *"requires … re-emitting original class names into the clone, which the SiteSpec compiler currently strips"*; *"depends on the LIVE source stylesheets being fetchable at build time - breaks asset independence"* (`:330-331`).
- Adjudicator: *"The reason is structural, not a bug in B: preservation is not composable with a frozen exact-computed tier"* (`adjudication.json:149`). It also notes *"its rejection rests on Agent D's measurement alone"*; app-b was not re-served (`:113`).

### 3.4 Additional defects found in this audit (from the artifact on disk)
- **Dangling `var()` tokens.** `b-preserved.css` references `var(--border-hairline)` ×26, `--homepage-padding-inset` ×16, `--homepage-outer-padding` ×16, `--header-height` ×14, `--1fr` ×12, `--homepage-max-width` ×8, and others. The clone stylesheet (`agent-d/app/public/wr/generated-styles.css`) defines each of `--1fr`, `--homepage-padding-inset`, `--header-height`, `--border-hairline` **0 times**. Under `!important` such a declaration is invalid at computed-value time and falls back to the initial value, overriding a correct frozen value. Example: `grid-template-columns:repeat(6, var(--1fr)) !important` becomes `none` (`b-preserved.css:5`).
- **Empty longhands.** 28 declarations like `padding-top: !important` (`b-preserved.css:5,43,52`). These are longhands of var()-bearing shorthands that serialize empty in CSSOM.
- **The 1440 attribution is not traced.** `display` *is* in the allowlist, and the `@media (min-width:1025px){… display:none !important}` rule for the show-laptop nodes is present (`b-preserved.css:74`). So "only layout properties were preserved" does not by itself explain the 1440 regression. The likelier causes are the `!important` flattening (every source normal declaration, e.g. unconditional `display:flex/grid`, now ties with the source's real `!important` utilities and emission order decides) and the missing tokens. The handoff offers a hypothesis, not a node-level trace.
- **Low coverage.** 511 of 621 kept rules matched no element per viewport (§2.5 item 6).

### 3.5 Verdict: principle or implementation?
**Mainly the implementation variant and the architecture it was overlaid on, not source-first as a principle.**

Evidence against "wrong in principle":
- **28.5A had already run source-first in full form on the same site and it worked responsively.** B-plus (source DOM + all sheets + CSSOM harvest) reproduced live `scrollHeight` **exactly at 9/9 widths** from a single 1440 capture, at @16 0.0016 / 0.0002 (`28.5…md:779-783,875,1117`).
- Its rejection was about **generalization at 1440** on six other sites (shadow DOM, JS canvas; `:813-825`) and **product costs** (slots, regenerability, licensing; `:880-883`, `28.5B…md:689-695`). Those are not failures of responsive-rule preservation.
- 28.5C-B differed from that proven form in every load-bearing way: partial property subset, no tokens, flattened cascade, no identity, overlaid on 1440-frozen px. 28.5 itself named the untested risk in advance: *"Nobody has demonstrated that source `@media` rules can coexist with 5,740 baked `width:<px>` … If they cannot, this stops being an added channel and becomes a redesign"* (`28.5…md:1046-1048`).
- B had one iteration; C had seven.

What B does validly show:
- **Partial rule replay on top of the frozen computed tier does not compose.** This is a real constraint of the current two-tier architecture (`adjudication.json:149-151`).
- **Identity stripping is real and still in code** (`safe-attributes.ts:22-23,134`: *"the style catalog holds the browser's COMPUTED result, so source class names buy nothing"*). Any replay needs a translation layer or persisted classes.
- **Build-time live fetch / asset independence** was a design-cost objection, not a measured failure cause. 28.6 W1.1 later moved sheet capture into observation time (`observe-page.ts:316-318`, "costs NO new request"). Bodies are still not persisted, only matched per-element declarations (`observer/types.ts:1024-1098`), so a replay channel would still need new storage.

**Net.** 28.5C refuted *"layout-only, !important-flattened, translated source rules overlaid on a 1440-frozen computed tier"*. It did not test *"source-authored responsive rules as the primary tier with computed style as fallback"*. The one experiment close to that (28.5A B-plus/hybrid C) succeeded on responsiveness and was rejected for other reasons. The adjudicator's wording, "refutes preserve as a rendering principle" (`28.5C…md:158`), generalizes further than the evidence supports.

---

## 4. Justification for C (and not A/B/D)
- **Not A.** Mechanisms are in `src/`: CORS capture, authored breakpoints, edge snapping, authored-driven envelope, `authored-inline-size`, var() resolution.
- **Not only B.** B describes the 28.5C Strategy B episode correctly, but its narrowed principle (preserve at capture/IR, constrain inference) was then implemented in production code across 28.6 → 28.8-fast.
- **Not D.** Current code orders computed/measured first and authored last (`layout-inference.ts:26,3056,4561-4570`). Grid tracks never read authored values. The switch is a product policy that outranks authored inference (`responsive-plan.ts:60-96`). No source rule text is emitted. The frozen exact-computed tier remains the baseline for every node.
- **Therefore C.** Source-authored information reaches production as IR data, as a constraint on inference, and as a last-resort fallback. Production priority stayed computed-first.
