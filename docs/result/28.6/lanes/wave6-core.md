# Task 28.6 — Lane CORE (Wave 6)

**Scope.** C1 (tree-switch breakpoint), C2b (viewport-parameterised layout inference),
C3 (inline-size accounting + measured parent content box).

**Acceptance state.** `pnpm typecheck` exit **0**.
`smoke-sitespec` **466/466** (floor 466) · `smoke-reconstruction` **227/227** (floor 222)
· `smoke-layout-safety` **222/222** (floor 183) · `smoke-responsive-qa` **115/115** (untouched,
run as a non-regression check). **+44 permanent checks**, each proven RED by breaking its
invariant (§5).

---

## 0. What was already landed before this lane started

The interrupted attempt had shipped the SiteSpec half of C2. Verified read-only before
writing anything:

| Item | How I told | Verdict |
|---|---|---|
| `SCHEMA_VERSION` 6 | `src/sitespec/types.ts:104` docstring + a v6 recompile emitting `schemaVersion 6` | ALREADY LANDED |
| `PageSpec.layoutProbeMobile` w/ refusal reasons | `src/sitespec/types.ts:1176` | ALREADY LANDED |
| `compile-page.ts` reads `layout-probe-mobile.json` | `src/sitespec/compile-page.ts:299-330, 408-480` | ALREADY LANDED |
| **C1 tree switch** | `grep 'observed-endpoint-midpoint' src/reconstruction/responsive-plan.ts` → still the only method | **NOT STARTED** |
| **C2b mobile in reconstruction** | `grep layoutProbeMobile src/reconstruction/` → **no hits** | **NOT STARTED** |
| **C3 fall-through accounting** | no counter existed between the three `continue`s at `layout-inference.ts:1710-1793` | **NOT STARTED** |

Nothing landed was redone or reverted. `src/sitespec/**` needed no further change and
received none.

---

## 1. C1 — the tree switch is now the source's breakpoint

**New module:** `src/reconstruction/tree-switch.ts` (pure, no I/O).
**Changed:** `responsive-plan.ts`, `types.ts` (`BreakpointSpecSchema`), `plan-reconstruction.ts`.

`inferBreakpoint()` previously returned `Math.floor((390 + 1440) / 2) = 915` with
`method: "observed-endpoint-midpoint"` on every site. It now takes the page specs and routes
the switch through the **same authored-breakpoint histogram the band edges already snap to**.

### Measured result on the four graded sites

| site | before | after | method | candidates | chosen weight / observed change |
|---|---|---|---|---|---|
| hobbang.net | 915 | **768** | `authored-breakpoint` | 3 (640/768/1024) | 153 decls / 2,468 nodes moved |
| seoultone.kr | 915 | **1025** | `authored-breakpoint` | 9 in range, **28 dropped as out-of-range** | 445 / 2,914 |
| gs.severance.healthcare | 915 | **1025** | `authored-breakpoint` | 4 | 8,986 / 576 |
| linear.app | 915 | **1025** | `authored-breakpoint` | 5, **1 dropped** (1441 > 1440) | 906 / 3,555 |

915 matched **no** authored breakpoint on any of the four. The two BLOCKER shapes the brief
named — seoultone's 1296px footer in a 1024px viewport, severance's clone `scrollWidth 1440`
in a 1024px viewport — both come from the desktop tree being mounted at 1024; with the switch
at 1025 the mobile tree is mounted there instead.

### How "best" is defined, in code (`rankTreeSwitchCandidates`)

1. **Corroborated by the probe first.** A candidate the probe watched the page change across
   outranks one that only appears in a stylesheet, however heavy.
2. **Largest attributed change**, among corroborated candidates.
3. **Heaviest authored weight** — the same primary rule `chooseAuthoredEdge()` uses for band
   edges, so the two mechanisms cannot disagree about what evidence means.
4. Nearest the midpoint (tie-break only). 5. Smallest px (determinism).

**Attribution requires a TIGHT probe bracket** (`above - below <= 1`). This is not cosmetic:
across a loose bracket every fluid box on the page changes width, so the count measures the
gap rather than the breakpoint. Measured on seoultone: with loose brackets credited, `681`
(bracket 501→700) scored 4,077 and would have won; with the tight-bracket rule it scores 0 on
0 pages and `1201` — 546 declarations but a tight bracket on **1 of 14 pages** — falls behind
`1025`, which has one on all 14. Discarded brackets are counted in
`observedChangeUnattributablePages`, never silently dropped.

### Requirement coverage

- **(a) never snap past an observed width.** Candidates are clamped to `(mobileWidth,
  desktopWidth]` inside `aggregateAuthoredCandidates()`, and everything dropped is counted in
  `candidatesOutsideObservedInterval` (seoultone: 28; linear: 1).
- **(b) ambiguity is counted.** `candidateCount` + `ambiguous`; all four sites are ambiguous
  (3–9 candidates) and say so.
- **(c) the midpoint survives, with a reason.** `fallbackReason` is one of `no-page-specs` /
  `no-histogram` / `empty-histogram` / `no-candidate-in-observed-interval`. A guessed switch
  and a snapped one can never read alike.
- **(d) recorded in the manifest.** `config.inferredBreakpoint` now carries `method`,
  `fallbackReason`, `candidateCount`, `ambiguous`, `candidatesOutsideObservedInterval`,
  `candidatesOmitted`, the ranked `candidates` array, `chosen`, `pagesRead`,
  `pagesWithHistogram`, `pagesWithUsableProbe`, `treeDivergence`, the three walk counts, and
  `domSwitchWidthObserved`. Verified in the rebuilt hobbang manifest (§4).
- **(e) a site authoring nothing still works.** Falls back and says which failure it was.

### The CAUTION — what I can and cannot distinguish

**CAN distinguish, by measurement:** whether the source serves ONE DOM or TWO.
`classifyTreeDivergence()` compares each page's desktop and mobile element walks tag for tag.

| site | verdict | identical / divergent pages |
|---|---|---|
| hobbang.net | **single-dom** | 11 / 0 |
| linear.app | **dual-dom** | 3 / 1 |
| gs.severance.healthcare | **dual-dom** | 1 / 1 |
| seoultone.kr | **dual-dom** | 12 / 2 |

For a `single-dom` site the switch chooses a *paint*, not a structure, and no width can mount
the wrong tree because there is only one tree.

**CANNOT distinguish:** where a two-DOM source swaps them. The two trees were observed at
exactly two widths. An authored breakpoint says where the CSS changes, not where the DOM does,
and no observation in this pipeline locates the DOM swap. So the refusal here is **a refusal
to claim, not a refusal to emit** — some number must ship or no media query can be written:

- `domSwitchWidthObserved` is `false` on **every** path, including snapped ones.
- A new limitation code **`tree-switch-dom-width-not-observed`** is declared **only** when the
  measurement says `dual-dom`. Verified: fires on linear / severance / seoultone, **absent on
  hobbang**.

---

## 2. C2b — layout inference runs once per viewport

**Before:** `grep layoutProbeMobile src/reconstruction/` returned nothing. The page loop read
`page.viewports.desktop` and `page.layoutProbe` only, and `generateLayoutCss()` hard-coded
`[data-wr-viewport="desktop"]`. Measured: **0 of 1,135** recovered rules on linear and **0 of
1,106** on hobbang targeted the mobile variant.

**After:** the loop is `for (page) for (viewportId of LAYOUT_VIEWPORT_IDS)`. Each pass resolves
its own probe, element list, truth width, and the half of the width axis its variant is
actually displayed on.

| site | rules before (desktop-only, bp 915) | rules after | desktop | **mobile** |
|---|---|---|---|---|
| hobbang.net | 1,106 | **2,175** | 1,180 | **995** |
| linear.app | 1,135 | **1,547** | 695 | **852** |
| gs.severance.healthcare | 184 (per brief) | **465** | 35 | **430** |
| seoultone.kr | — | **1,553** | 664 | **889** |

Desktop counts fall on linear/severance/seoultone because the switch moved to 1025: bands
built from widths of 928–1024 described a range the desktop tree is **no longer shown at**.
Those rules did not vanish — they migrated to the mobile variant, where they belong. That
migration is only visible because C1 and C2b landed together.

### Requirement coverage

- **(a) assert the probe-to-element identity, refuse loudly.** `resolveViewportProbe()` reads
  the SiteSpec's own `aligned` / `alignedElementCount` verdict rather than re-deriving it —
  a second alignment opinion could only disagree with the one that decided whether the arrays
  were attached at all. Five refusal reasons, all counted in `viewportPassRefusals` keyed
  `"<viewport>:<reason>"`.
- **(b) degrade cleanly when the field is absent.** Every pre-28.6 artifact lacks
  `layoutProbeMobile`; those pages land in `mobile:probe-absent` and the desktop rules come
  out **bit-identical** (asserted permanently in `smoke-layout-safety` Part 8).
- **(c) same truth-check, no exemption.** `layout-truth-check.ts` now buckets by
  `pageId|viewportId`, serializes the rule's own tree (`truthCheckHtml(page, css, viewportId)`)
  and renders it at that variant's own observed width. Bucketing by page alone would have put
  mobile rules in a desktop render where their node ids are absent — a silent 100% rejection
  that looks exactly like a clean run. **Rebuild evidence: 2,175 candidates / 2,175 accepted,
  0 rejected by truth check, 0 accepted-but-regressing, 22 page renders for 11 pages.**
- **(d) split and cost reported.** `rulesByViewport` (candidates) and `shippedRulesByViewport`
  (post-check) are in the manifest. **Cost: inference 21 ms → 32 ms (+52%) on hobbang; the
  truth check doubles its renders, 11 → 22, and the write phase is 25.2 s.**

---

## 3. C3 — the fall-through is visible, and the denominator is measured

### 3a. First make it visible (the highest-value output)

Every probed node now leaves through exactly one of ten counted `InlineSizeOutcome`s, and
every node dropped before that stage through one of five `InlineSizePreStageDrop`s. Two
partitions hold and are asserted permanently:

```
sum(inlineSizePreStageDrops) + inlineSizeCandidates === nodesWithProbe
sum(inlineSizeOutcomes)      === inlineSizeCandidates      (doubleCounts === 0)
```

**The number the artifact used to hide** (`no-branch-matched` — every predicate evaluated,
none held, so the node ships its exact computed width frozen at the truth viewport):

| site | probed | candidates | **no-branch-matched** | what the artifact said before |
|---|---|---|---|---|
| gs.severance.healthcare | 3,005 (v5) → 5,994 (v6) | 972 | **693** | `widthModeRefusals: 0`, `widthValueRefusals: 0` |
| linear.app | 4,253 (v5) → 8,506 (v6) | 4,317 | **2,436** | `widthModeRefusals: 7` |
| seoultone.kr | 9,113 (v6) | 3,370 | **1,667** | — |
| hobbang.net | 3,700 (v5) → 7,400 (v6) | 2,753 | **616** | `widthModeRefusals: 0` |

On severance the brief's framing is confirmed exactly: the artifact implied a handful of
refusals where the unaccounted population is **693**.

### 3b. Then fix what the evidence supports

The probe records only `x`/`w`/`v`, so a parent's content box is not directly measured — but
a child that **fills** it has exactly that box, and the probe measured the child.
`measureParentContentBox()` recovers it, needing **no padding value at all**, which is what
makes it immune to a `var()` that moves under a media query.

Three guards buy non-circularity:
1. **Truth anchor** — at the truth width the child's border box must equal the parent's minus
   the computed padding and border (the one width where an independent measurement exists).
2. **Two independent witnesses** that agree on `x` and `w` at every probe width. One filler is
   rejected: a box that merely happens to be `width: 1344px` inside a 1344px content box
   passes guard 1.
3. **Containment** at every width — a frozen child that outgrows its shrinking parent is out.

`contentAt()`, `parentGrowth` and the centering gaps all now prefer the measured box.

| site | measured | assumed | **disagreed** | **max disagreement** |
|---|---|---|---|---|
| linear.app | 1,086 | 3,231 | 28 | **72 px** |
| seoultone.kr | 1,380 | 1,990 | 327 | **376 px** |
| hobbang.net | 1,345 | 1,408 | 0 | 0 |
| gs.severance.healthcare | 238 | 734 | 0 | 0 |

**Linear's 72 px is exactly the mechanism the brief diagnosed** (`--page-padding-left` under a
media query, `contentAt()` wrong by +72 px at 1025/1100/1280 against a 2 px tolerance).

### 3c. And refuse where nothing can be measured and the assumption is known false

New guard reason **`parent-padding-not-constant`**. `parentPaddingConstancy()` reads the
parent's authored declarations and is **range-aware**: a media condition only makes the padding
vary if its boundary falls inside the widths *this variant is rendered at*.

That refinement matters. A blunt "declared under any `@media`" test refused **547** hobbang
parents and cost 115 sound `full-width` rules; range-aware, hobbang has **0** — its padding
media queries all sit outside the desktop variant's range, so the padding really is constant
there. Final refusals: seoultone 84, hobbang/linear/severance 0. Deliberately **not** flagged:
a bare `var()`, which is not evidence of variation (`max(0px, 24px)` is as constant as `24px`).
`media-unparsed` is a distinct value — unknown is not constant.

---

## 4. Rebuild evidence (no re-observation)

SiteSpecs were **recompiled** from the existing 2026-09-02 observations (which already carried
`layout-probe-mobile.json`) to reach schemaVersion 6. No page was re-observed; Firecrawl 0,
network 0, asset downloads 0.

Full reconstruction of **hobbang.net** from the v6 SiteSpec
(`tmp/wr286/core/rebuild-hobbang`, exit 0):

```
Recovered layout rules (truth-viewport verified)
  status                     verified
  candidates / accepted      2175 / 2175
  rejected by truth check    0
  accepted but regressing    0
  rounds / pages rendered    22 / 22 (25174 ms)
```

Manifest excerpts:

```
config.inferredBreakpoint: 768, method "authored-breakpoint", candidateCount 3, ambiguous true,
  chosen {px 768, authoredWeight 153, authoredPages 11, observedChange 2468, ...},
  treeDivergence "single-dom", pagesIdenticalWalk 11, domSwitchWidthObserved false
layout.rulesByViewport / shippedRulesByViewport: {desktop 1180, mobile 995}
layout.viewportPassesUsed: {desktop 11, mobile 11}; viewportPassRefusals: {}
layout.inlineSizeCandidates 2753; outcomes {full-width 1820, no-branch-matched 616,
  centered 88, refused-containing-block-guard 229}; doubleCounts 0
layout.inlineSizePreStageDrops {display-not-blockish 2884, hidden-at-truth-width 1763}
```

Before → after on the same site: **1,106 rules (desktop-only, breakpoint 915)** →
**2,175 rules (1,180 desktop + 995 mobile, breakpoint 768)**, all browser-verified.

Grader verdicts were **not** re-run (each needs a live source capture, outside this lane's
budget and its no-re-observation constraint).

---

## 5. Every new check proven RED

| # | Mutation | Suite | Result |
|---|---|---|---|
| 1 | `chooseTreeSwitch` never picks a winner (revert to midpoint) | layout-safety | 220/222 — 2 FAIL |
| 2 | Drop the `(lower, upper]` clamp (break req. (a)) | layout-safety | 220/222 — 2 FAIL |
| 3 | Stylesheet weight outranks probe corroboration | layout-safety | 221/222 — 1 FAIL |
| 4 | `resolveViewportProbe` reads desktop always (the C2b defect) | layout-safety | 213/222 — 9 FAIL |
| 5 | Remove the `no-branch-matched` counter | layout-safety | 220/222 — 2 FAIL |
| 6 | `contentAt` always derives from the one padding sample | layout-safety | 221/222 — 1 FAIL |
| 7 | Remove the `parent-padding-not-constant` guard | layout-safety | 221/222 — 1 FAIL |
| 8 | `planReconstruction` stops passing `pages` | reconstruction | 226/227 — 1 FAIL |
| 9 | Layout inference loops over `["desktop"]` only | reconstruction | 226/227 — 1 FAIL |

Every mutation was reverted from a byte-copy taken before it; typecheck 0 and all suites green
after restore.

---

## 6. Files changed

```
src/reconstruction/tree-switch.ts          (new — C1)
src/reconstruction/responsive-plan.ts      (C1)
src/reconstruction/layout-inference.ts     (C2b + C3)
src/reconstruction/layout-truth-check.ts   (C2b req. (c))
src/reconstruction/plan-reconstruction.ts  (C1/C2b wiring + limitation)
src/reconstruction/generate-app.ts         (manifest)
src/reconstruction/types.ts                (BreakpointSpec, manifest layout, limitation code)
src/reconstruction/index.ts                (exports)
scripts/smoke-layout-safety.ts             (+39 checks: Parts 7-10)
scripts/smoke-reconstruction.ts            (+5 plan-level integration checks)
```

No git operations were performed. Nothing outside the ownership list was written.

---

## 7. Known limitations carried forward

1. **The DOM-swap width is still unobserved.** Three of four sites are `dual-dom`; the switch
   there is chosen from CSS evidence and is *not* a measurement of where the source swaps its
   trees. Closing this needs an observation at a third width, in a single browser context, that
   records the element walk — an Observer change, outside this lane.
2. **`no-branch-matched` is now visible but mostly unreduced** (severance 693, linear 2,436).
   C3 fixed the one mechanism the evidence pinned; the rest is unclassified. The next step is
   to split `no-branch-matched` by *which* predicate failed and by how much.
3. **The measured content box needs two agreeing fillers**, giving 25% (linear) to 49%
   (hobbang) coverage of candidates. Parents with one child keep the constant-px assumption
   unless their authored padding contradicts it.
4. **`viewport-relative` paddings are refused, not evaluated.** A `4vw` padding *is* computable
   per width; evaluating it would need a CSS length evaluator, which was judged out of scope
   against "a refusal is always acceptable".
5. **Grader verdicts not re-measured.** The before/after here is rule accounting and truth-check
   status, not a re-grade against a live source.
6. **The mobile band's upper edge is open above the breakpoint**, harmless only because
   `globals.css` hides the mobile variant there. It is the mirror of the desktop variant's open
   lower edge and rests on the same assumption.
