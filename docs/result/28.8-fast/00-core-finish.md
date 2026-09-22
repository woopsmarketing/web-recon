# Task 28.8 FAST — 00 · Core V1 finish (Phases A / B / C / D)

**Date:** 2026-09-08 · **Baseline SHA:** `6c2e723` (working tree carried, nothing reverted) ·
**Program:** speed-first product finish, three workstreams only, then two fresh sites.

Input state: `docs/result/28.8-reconstruction-v1-final-closure-2026-09-05.md` — verdict
`NOT READY - GENERIC PRODUCT BLOCKERS REMAIN`, 0 of 7 pairs acceptable at 700/1024/1100 against
4 of 5 at 1440, CJK collision on every Korean site, regression floor 35 suites / 4,663 checks / 0 failures.

---

## 1. Decisions (each one sentence, with the evidence that forced it)

| # | decision | evidence |
| --- | --- | --- |
| D1 | The tree switch is a **fixed product policy**: mobile tree ≤ 800px, desktop tree ≥ 801px. The authored-breakpoint inference still runs and ships as evidence only. | 28.75 §WIDTH-9(c): the 700px defect on linear is a statement about *which tree is served* (switch inferred at 641), not a width-recovery problem. The inferred switch was 641 / 1024 / 500 on linear / hobbang / seoultone — a different number per site is not a product behaviour. |
| D2 | **Authored inline-size intent is emitted** (`width:100%`, `max-width:1200px`, `margin:auto`, fluid grid tracks) as a final fallback wherever no geometric rule was recovered, gated by the existing truth check. | The observer already records authored declarations verbatim (`ElementSpecNode.authoredLayout`) but nothing ever emitted them; quantified before the change: seoultone 1,215 `width:%` + 835 `max-width:%` + 300 `max-width:px` + 302 `margin-left:auto`, linear 660 / 310 / 108, hobbang mostly em/rem. |
| D3 | **CJK collision is fixed as a box-model defect, not a typography project.** Text-bearing boxes get `height:auto; min-height:<observed>`; shrink-to-fit text boxes drop the frozen `width`. Fonts remain an accepted difference. | Trace on the two canaries (§3): the frozen tier ships the *used* `height` (one line) and *used* shrink-to-fit `width` (e.g. 24.2px for a two-syllable `<li>`) as CSS; the clone loads no `@font-face`, so the fallback font's Hangul advance (≈1.0em vs Pretendard 0.864em) re-wraps to N+1 lines inside an N-line box. `word-break:keep-all` is already carried and does not help. |
| D4 | QA severity is corrected in three small places (blank-region corroboration, critical-region text collision, screenshot-diff band accounting); rubric 6 → 7. | 28.8 closure: `blank-region-ratio` BLOCKER 0.5767 on seoultone @1440 was intentional padding; hobbang @390 footer collision invisible to a whole-page ratio; `screenshot-diff.ts:209` still min-cropped silently. |

Not done, on purpose: no third DOM tree, no `@font-face` emission, no per-site logic, no rubric
re-calibration beyond the three items, no width work on the refused chain roots.

---

## 2. Phase A — responsive V1 finish

### A1 · product-policy tree switch (`src/reconstruction/responsive-plan.ts`)

- `V1_RESPONSIVE_POLICY = { mobileMaxPx: 800, desktopMinPx: 801, mobileTruthPx: 390, desktopTruthPx: 1440 }`.
- Served spec: `value: 801`, `provenance: "product-policy"`, `method: "product-policy-v1"`, clamped into
  `(mobileObserved, desktopObserved]` with `policyClamped` recorded if the clamp moved it.
- `chooseTreeSwitch` still runs; its answer ships as `inferredAuthoredPx` / `inferredAuthoredMethod`
  with the whole candidate record. `byPageId` is empty under the policy (two-mode is site-wide);
  per-page `records` are kept as evidence. `--breakpoint N` still overrides everything.
- Media queries: `(min-width: 801px)` / `(max-width: 800.98px)`.
- Probe-axis consequence: the mobile tree now takes its evidence from the mobile-context probe at
  390/480/700/768 and the desktop tree from 1024/1100/1440/1920 (plus authored samples).

### A2 · authored inline-size intent (`src/reconstruction/layout-inference.ts`, kind `authored-inline-size`)

- Properties: `width`, `max-width`, `min-width`, `margin-left/right/inline` (only when `auto`),
  `grid-template-columns` (only fr / repeat / minmax / auto-fit / auto-fill / %).
- Admissible values: `auto`, `%`, viewport units, `calc/min/max/clamp`, `fit-/max-/min-content`, `none`
  (max-width), em/rem, and px only for max-/min-width. Refused: `var(` (`value-uses-var`), px width
  (`value-frozen-px`), unparsed values.
- Media: no condition, or a simple min/max-width conjunction that holds across the WHOLE served range
  of that tree (mobile [0,800], desktop [801,∞)); partial coverage → `media-partial-range`.
- Cascade: last admissible declaration in array order; depth counted as `cascadeCandidates`.
- If an admissible max/min-width exists and NO width declaration of any kind is authored, `width:auto`
  is also emitted (the source's actual value). Light pre-checks refuse `authored-inconsistent-with-truth`.
- **Deviation from the brief, deliberate:** the pass runs in its own viewport loop rather than inside the
  probe-gated funnel — it needs no probe, and gating it on `resolveViewportProbe` produced 0 offers on
  any page whose probe did not align. It still yields to any node a recovered rule already answers, and
  every emission goes through `verifyLayoutRules` unchanged.
- Counters in the manifest: offered / emitted per viewport, node-grain and declaration-grain refusal
  histograms, truth-check rejections for the kind.

### A3 · text-box block-size relief (frozen tier; `style-generator.ts`, `compile-node.ts`)

- `wr-tx`: node has a non-whitespace text descendant, display not inline, position not absolute/fixed,
  overflow(-y) visible, not a replaced element → `.wr-stNNN.wr-tx { height: auto; min-height: <N>px }`.
- `wr-sf`: node has a DIRECT text child and is shrink-to-fit (inline-block / list-item / table-cell /
  inline-flex / inline-grid, or a flex/grid item, or floated) → `.wr-stNNN.wr-sf { width: auto }`.
- Variant rules are emitted only for tokens some flagged node uses; the class is added only when the
  token really carries a frozen px length, so class and rule cannot disagree. Specificity (0,2,0):
  beats the token, loses to recovered `[data-wr-node]` rules. No `!important`.
- Not gated by the truth check (baseline tier). The suite now measures it in Chromium: pixel-identical
  where the text fits, grows instead of overprinting where it does not.

### Rebuilds on the finished core (pinned 28.75 site-specs, `next build` PASS on all three)

| | linear.app | hobbang.net | seoultone.kr |
| --- | ---: | ---: | ---: |
| served switch | 801 product-policy-v1 | 801 | 801 |
| `inferredAuthoredPx` (evidence) | 641 | 1024 | 500 |
| recovered rules (before) | 3,222 (2,742) | 2,222 (2,079) | 1,922 (1,587) |
| `authored-inline-size` shipped | 983 | 122 | 355 |
| authored offered → emitted (desktop+mobile) | 4,444+2,559 → 683+351 | 2,762+2,592 → 80+78 | 3,521+3,691 → 219+241 |
| top node refusals | no-admissible-declaration 3,021 · already-recovered 1,373 · display-inline 671 | no-admissible-declaration 2,477 · already-recovered 1,863 · display-inline 854 | no-admissible-declaration 2,620 · display-inline 2,267 · already-recovered 1,504 |
| top declaration refusals | margin-not-auto 11,128 · width frozen-px 469 · value-uses-var 413 · width inconsistent 111 | margin-not-auto 5,290 | margin-not-auto 16,689 · width media-partial-range 256 · width inconsistent 231 |
| truth-check rejected (before) | 59 (6), of which authored 51 | 39 (6), authored 36 | 105 (0), authored 105 |
| text-box relief: tx nodes / sf nodes / token variants | 6,022 / 2,820 / 2,525 | 4,752 / 1,431 / 1,687 | 3,613 / 540 / 799 |
| `residualFrozenOmitted` (before) | 2,275 (2,264) | 1,357 (814) | 3,279 (3,904) |

Reading the table honestly: the truth check rejects 5% (linear) to 23% (hobbang, seoultone) of
authored proposals — every one caught, none shipped, and it says the pre-checks are looser than the
render for `width:%` under non-obvious containing blocks. `residualFrozenOmitted` moved in both
directions; it is a per-route report cap over an audit whose candidate set follows the probe axis,
and the axis moved with the breakpoint, so it is not a fidelity number on its own.

---

## 3. Phase B — CJK readability trace (two canaries only)

| canary | node | source box = emitted `width × height` | why it collides |
| --- | --- | --- | --- |
| hobbang footer `<li>` 정부·공공 | n002059, `display:list-item`, flex item | 51.95 × 20px | 4 syllables at 12.10px each (0.864em) — a 1.0em fallback needs 56px → last syllable wraps into a 20px box |
| hobbang footer `<ul>` | n002000 | 620.66 × 48px | two wrap rows become four line boxes inside a 48px box |
| seoultone 진료시간 `<span>` AM 10:00 – PM 8:00 | n000878, `display:block` flex item, `word-break:keep-all` | 125.78 × 22.5px | breaks at the ASCII space before `8:00`; second line paints on the 토요일 row |
| seoultone tagline `<p>` | n000476 | 581 × 61.19px (= 2 × 30.6 line-height) | third line overprints the DERMATOLOGY wordmark |

Screenshot confirmation from the 28.75 run: source `주소모음 링크모음 검색 … 정부·공공`, clone
`주소모 링크모 검 … 정부·공` — exactly one trailing syllable missing from each label.
Scale: 1,295 (hobbang) / 2,423 (seoultone) frozen `height:<px>` declarations against 73 / 1,284 `height:auto`.
`grep -a '"height"' layout-inference.ts` → 0 before this wave: no rule kind ever restated a height.

Secondary cause, **not fixed by design**: the clone emits no `@font-face` (asset-resolver assumes fonts
ride on computed style; only the family name does). The catalogs hold the URLs (hobbang 184 font
assets, seoultone 948). Fixing it changes every text metric on every site and carries Task 22's
licensing question — outside this program's "no font perfection work" rule. Recorded as an accepted
difference and the top follow-up if the human wants closer typography.

---

## 4. Phase C — QA honesty corrections (rubric 6 → 7)

| item | change | where |
| --- | --- | --- |
| blank-region false positive | BLOCKER requires corroboration: the source region carries ≥1 text/image leaf AND (DOM leg fired, or mechanism `absent`, or ink-only with clone ink < 10% of what the clone's own DOM claims it paints). Uncorroborated whitespace caps at MINOR. | `blank-region.ts:634` `regionCorroboratesContentAbsence`, `classify.ts:265` `blankRegionSeverityCap` |
| negative regression case | seoultone @1440 fixture built from the run's own numbers (747,360 px² / 0.5767 reproduced exactly) asserts not-BLOCKER; severance pre-fix BLOCKER and linear /pricing must-not-fire controls unchanged | `scripts/fixtures/seoultone-1440-blank-regions.json`, +10 checks |
| critical local text collision | new `critical-text-collision-rows` channel (clone rows − source rows; MAJOR ≥1, BLOCKER ≥4) inside compact critical regions — footer/header/nav/table/dl/form/address, ≤75% viewport tall — generic tags only, never a hostname; not averaged over page height | `src/responsive-qa/text-collision.ts` (182 lines), `classify.ts:718`, +15 checks |
| silent min-crop | `compareImages` keeps the crop (a resize invents pixels) but now returns an `uncompared` band: dimensions, exact per-side area, sampled ink vs each image's modal colour; surfaced in the summary line. The 28.75 tripwire that asserted the defect was updated to assert the fix. | `screenshot-diff.ts:236`, `reconstruction-qa/types.ts`, `summarize.ts` |

Key finding from the corroboration work: absolute clone-ink magnitude does **not** separate the
severance hero (real hole) from the seoultone padding (false positive) — both read 3.3% ink. Only ink
measured against the clone's own declared paint does (0.03 vs 0.23–0.28), with an empty corridor
between 0.04 and 0.22. That corridor rests on one measured hero; a hero whose declared paint is under
about 0.33 would not corroborate.

---

## 5. Focused suites (Phase D, item 25) and typecheck

| suite | before | after | failures |
| --- | ---: | ---: | ---: |
| smoke:layout-safety | 455 | 509 | 0 |
| smoke:reconstruction | 227 | 237 | 0 |
| smoke:visual-vocab | 88 | 88 | 0 |
| smoke:e2e | 130 | 130 | 0 |
| smoke:responsive-qa | 349 | 380 | 0 |
| smoke:reconstruction-qa | 211 | 217 | 0 |
| `pnpm typecheck` (merged tree) | | exit 0 | |

Assertions updated, old → new (none deleted, none weakened):

1. smoke-reconstruction §28 — `breakpoint.value === 915` → served `=== 801`, plus `inferredAuthoredPx === 915` and method `observed-endpoint-midpoint` on the evidence field.
2. same — `provenance "inferred"` / method midpoint → `"product-policy"` / `"product-policy-v1"`, `policyClamped === undefined`.
3. same — `withPages.value === 915` → `withPages.inferredAuthoredPx === 915 && withPages.value === 801`.
4. smoke-layout-safety §26(3) — route overrides for `globalsCss` derived from `plan.records.filter(differsFromSite)` instead of the now-empty `byPageId`; per-route CSS invariants unchanged.
5. smoke-layout-safety §26(4) — `axisPlan.site.value === 1440` → `inferredAuthoredPx`; added: served width is 801 on both routes.
6. smoke-layout-safety §27(5) — `twicePlan.site.value === 641` → `twicePlan.site.inferredAuthoredPx === 641`.
7. smoke-responsive-qa:1449 — `RUBRIC_VERSION === 6` → `7`.
8. smoke-responsive-qa:4217 — the CARRIED tripwire for the silent min-crop now asserts the crop is kept AND measured (`UncomparedBand`), with three live checks (inked strip → 1.0, blank strip → 0, equal sizes → no band).

---

## 6. Phase D — minimum old-canary sanity (item 23)

Filled in from `tmp/wr288f/sanity/` once the canary completes — see §6 of `04-regression.md` for the
final numbers if this section is still marked pending.

Run 2026-09-08 14:12–14:18 UTC via `tmp/wr288f/orch/sanity-canary.sh` (372 s wall), on the merged core BEFORE the A2b `var()` relaxation landed (A2b state is recorded in §6.1 below when measured). Rebuilt from the PINNED 28.75 site-specs so the artifacts are fresh on the finished core.

| check | artifact | result |
|---|---|---|
| rebuild linear / hobbang / seoultone | REC `2026-09-08T14-12-02-087Z` / `2026-09-08T14-12-40-482Z` / `2026-09-08T14-14-06-641Z` | all three `next build` PASS; served switch 801 (`product-policy`) on every page |
| linear /pricing @390 source-vs-clone | QA `2026-09-08T14-16-33-781Z` (fresh self-check floor) | **MINOR** (B0 / M0 / m2; missing-text 0.41 %) |
| linear /pricing @1440 source-vs-clone | same run | **MINOR** (missing-text 0.29 %; pixel residual 1.62 % vs 1 % MINOR floor) |
| linear / @1024 clone-only | `tmp/wr288f/sanity/linear-clone/` | nav fully visible (6 links inside), hero fits; canvas still frozen-wide: content right edge 1838 px, 2,029 offscreen chars, header/footer max-right 1535/1436, empty band 1432 px → NOT catastrophic (page readable top-to-bottom, footer reachable), residual = A9 ancestor-chain width; A2b targets the `var()` part of it |
| hobbang / @390 clone-only | `tmp/wr288f/sanity/hobbang-clone/`, crop `crops-hobbang-footer.png` | footer **READABLE** — labels wrap within their rows, no glyph collision (the harness' CONTENT-CLIPPED/OVERLAP flags are source-inherent carousel measures, judged by screenshot) |
| seoultone / @1440 clone-only | `tmp/wr288f/sanity/seoultone-clone/`, crop `crops-seoultone-hours.png` | 진료시간 **READABLE** — each opening-hours line on one line, no overlap |

Stop conditions (item 24): build/typecheck OK, observation+reconstruction run, Linear /pricing not catastrophically broken, CJK readable on BOTH canaries → none triggered.

```
CORE V1 FINISH SANITY COMPLETE
STARTING TWO-SITE VALIDATION
```

### 6.1 A2b (`var()` resolution for authored intent) — measured after the sanity run

The `var()` resolver (`resolveAuthoredVars`, refusal split `value-uses-var` = malformed / `value-uses-var-unresolved` = name the clone does not emit) was on disk from the first A2b pass, but the only call site never received the clone's emitted custom properties, so every `var()` value was still refused. Completed 16:25–16:31 UTC (one fresh-context agent + a one-line manifest fix):

| item | result |
|---|---|
| plumbing | `plan-reconstruction.ts` builds the per page × viewport name→value map with the existing `emittedCustomProperties(scopes)` (same admission predicates as the emitted stylesheet, so inference and CSS cannot disagree) and passes it as `InferLayoutInput.customPropertiesByPage`; the call site passes `customProperties` per page × viewport; `counters.authoredIntent.varAdmitted` accumulated and written to the manifest as `layout.authoredIntentVarAdmitted` (`generate-app.ts`) |
| suites | layout-safety **512/512** (3 new assertions: emitted `var(--page-max)` with the name declared / refused `value-uses-var-unresolved` with an empty map / fallback `var(--page-max, 1200px)` admitted via its own fallback; one stale literal `width:value-uses-var` → `width:value-uses-var-unresolved` synchronised, substance unchanged); reconstruction **237/237**; `pnpm typecheck` 0 |
| Linear rebuild | REC `2026-09-08T16-29-06-610Z`, build + validation PASS; `authoredInlineSize` 983 → 1017; unresolved-var refusals 413 → 108 (width 198→90, margin-left 170→3, max-width 22→7, grid-template-columns 12→2); truth-check rejections of the kind 59 → 51 |
| Linear / @1024 clone-only | UNCHANGED: content right edge 1838 px, 2,029 offscreen chars, empty band 1432 px — the 1024 canvas is the A9 ancestor-chain residual (frozen ancestor widths), not the `var()` refusals |
| Linear /pricing @1024 clone-only | still clipped on the right: content right edge 1358 px, header/footer max-right 1026/1390, 0 offscreen text — readable, nav and footer reachable |

Conclusion: A2b is correct and generic (more authored relations ship) but it is NOT the lever for the 1024 canvas; that residual stays a named limitation of the stress site (Linear is not the acceptance target, item 6).


---

## 7. Carried / risks named by the implementers

- A3 is baseline-tier and therefore not truth-checked per site; `qa:responsive` at 390/1440 on the
  three canaries and the two fresh sites is the check that settles it.
- `scripts/smoke-visual-editor.ts:589` asserts `boot.breakpoint === 915` from a **stored** template
  `route-map.json` (`src/editor/catalog.ts:218`). It passes today because that artifact predates A1 and
  will fail the day the template is regenerated. Out of this program's ownership; noted for the owner.
- `layout-inference.ts` was run through prettier by the implementer before noticing the repo has no
  prettier config: ~214 whitespace-only line changes, typecheck- and suite-clean, not revertible
  precisely. Diff noise only.
- Text-collision thresholds (25% intersection, MAJOR ≥1 row, BLOCKER ≥4) come from the 28.8 audit
  narrative, not a measured population — first live run may need re-banding.
- The implementer of Phase C labelled its comments "Task 28.9"; relabelled to "Task 28.8 FAST"
  (comments only) so no reader mistakes it for a program that does not exist.
