# Task 28.6 — Site lane P4 · `xn--ok0b408a79cba430b.net` (여기여주소.net)

**Lane**: `w7-wix-idn` · **Pilot 4, first run** · Wix Thunderbolt, React-hydrated, 29 inline
`<style>` tags and **zero** `<link rel=stylesheet>` — the pool's only purely inline-CSS site.

**Verdict on the run**: `COMPLETE`. Pipeline ran end to end with no stage failure.
Grade on the two in-scope routes at five widths: **8 BLOCKER / 1 MAJOR / 1 MINOR / 0 PASS**
against a **self-check floor of 10/10 PASS with every channel reading 0.00** — the cleanest
floor this corpus has produced, which means *every* verdict below is attributable to the
clone and none of it to instrument noise or source instability.

---

## 0. Host correction, measured before anything else

The lane brief names `https://xn--ok0b408a79cba430b.net/`. **That apex does not serve
HTTPS.**

```
$ dig +short xn--ok0b408a79cba430b.net A
185.230.63.171 / 185.230.63.107 / 185.230.63.186      (Wix park IPs)
$ curl -sv https://xn--ok0b408a79cba430b.net/ -o /dev/null
* Connected to xn--ok0b408a79cba430b.net (185.230.63.186) port 443
* (304) (OUT), TLS handshake, Client hello (1):
* Recv failure: Connection reset by peer
* LibreSSL/3.3.6: error:02FFF036:system library:func(4095):Connection reset by peer
$ curl -I http://xn--ok0b408a79cba430b.net/     → 301 https://xn--ok0b408a79cba430b.net/  (loops into the reset)
$ curl -I https://www.xn--ok0b408a79cba430b.net/link → 200
```

The apex resets the TLS handshake; `www.` is Cloudflare-fronted and answers 200. The whole
lane therefore ran against **`https://www.xn--ok0b408a79cba430b.net/`**, which is what the
scout used and what the site itself canonicalises to. Data lands in
`data/www.xn--ok0b408a79cba430b.net/`. Routes graded are `/` and `/link` as briefed.

**Punycode survives every stage.** The safe-host directory name is the literal punycode
label; `reconstruction-data/route-map.json` carries `rootUrl`
`https://www.xn--ok0b408a79cba430b.net/`, and the percent-encoded hangul routes round-trip
with both a decoded `key` and an encoded `path`:

| routeId | key | path |
|---|---|---|
| r000002 | `/정보` | `/%EC%A0%95%EB%B3%B4` |
| r000006 | `/post/링크모아-여기여` | `/post/%EB%A7%81%ED%81%AC%EB%AA%A8%EC%95%84-%EC%97%AC%EA%B8%B0%EC%97%AC` |

No stage mangled the host or the paths; 12/12 routes generated and 12/12 rendered.

---

## 1. What I ran

| # | Command | Wall clock (UTC) | Run id / output |
|---|---|---|---|
| 1 | `pnpm e2e:reconstruct https://www.xn--ok0b408a79cba430b.net/ --max-urls 20 --concurrency 2 --family-escalation 4 --prepare-scroll` | 23:13:44 → 23:24:37 (**10 m 53 s**) | e2e `2026-09-02T23-13-46-219Z` |
| 2 | `pnpm qa:responsive data/www.xn--ok0b408a79cba430b.net/reconstructions/2026-09-02T23-20-20-310Z/reconstruction-manifest.json --widths 390,700,1024,1100,1440 --routes /,/link` | 23:24:47 → 23:27:29 (**2 m 42 s**) | responsive-qa `2026-09-02T23-24-48-801Z` |
| 3 | same + `--self-check` | 23:27:34 → 23:30:59 (**3 m 25 s**) | responsive-qa `2026-09-02T23-27-36-145Z` |
| 4 | offline re-run of `inferLayoutRules()` from the shipped SiteSpec (read-only, `tmp/wr286/w7-wix-idn/reinfer.ts`) | — | reproduces the manifest exactly, and surfaces the five counters the manifest drops |

End-to-end was used for the whole pipeline; no stage was run separately. `--prepare-scroll`
was set because the scout flagged a lazily-populated Wix Blog widget.

Stage run ids inside the e2e run:

| stage | run id |
|---|---|
| discovery / verification / selection | `2026-09-02T23-13-51-284Z` |
| observation | `2026-09-02T23-14-10-373Z` |
| sitespec | `2026-09-02T23-20-19-360Z` |
| reconstruction | `2026-09-02T23-20-20-310Z` |
| reconstruction-qa | `2026-09-02T23-20-26-279Z` |
| responsive-qa (clone) | `2026-09-02T23-24-48-801Z` |
| responsive-qa (self-check floor) | `2026-09-02T23-27-36-145Z` |

Stage timings (from the e2e manifest line): discovery 5,066 ms · verification 19,077 ms
(16 candidates → 12 verified) · selection 5 ms · observation 243,706 ms (7 pages, 0 failed)
· interaction-detection 382 ms · interaction-exploration 123,555 ms (**partial** — 3 planned
actions could not be re-identified in the live DOM) · interaction-modeling 51 ms · sitespec
1,868 ms · reconstruction 3,137 ms · build 2,957 ms · qa 238,836 ms · family-escalation 0 ms
· final-validation 19 ms. Final status `complete-with-known-limitations`.

Artifact footprint: **309 MB** total under `data/www.xn--ok0b408a79cba430b.net/`
(observations 85 MB, site-specs 46 MB, reconstructions 36 MB incl. a 3.96 MB generated
stylesheet, reconstruction-qa 91 MB, responsive-qa 48 MB). Review pack **17 MB**.

---

## 2. The verdict table

`pnpm qa:responsive`, 2 routes × 5 widths, rubric v3. "Headline channel" is the channel the
harness printed as the reason.

| Route | Width | Verdict | B/M/m | Headline channel | The number |
|---|---|---|---|---|---|
| `/` | 390 | **BLOCKER** | 1/2/4 | `nav-link-ratio` | clone shows **1 of the source's 6** visible header/nav links (17%, threshold 50%) |
| `/` | 700 | **BLOCKER** | 1/3/2 | `missing-text-ratio` | **35.49%** of the source's visible text absent (threshold 10%) |
| `/` | 1024 | **BLOCKER** | 2/1/3 | `footer-clipped` | clone footer max right **1440 > 1024**; also missing-text 35.38% |
| `/` | 1100 | **BLOCKER** | 2/1/3 | `footer-clipped` | clone footer max right **1440 > 1100**; also missing-text 35.38% |
| `/` | 1440 | **BLOCKER** | 1/0/2 | `missing-text-ratio` | **35.38%** absent; *zero* geometry findings at this width |
| `/link` | 390 | **BLOCKER** | 1/3/3 | `nav-link-ratio` | clone shows **1 of the source's 6** nav links (17%) |
| `/link` | 700 | MAJOR | 0/3/1 | `landmark-wide-element-excess` | **29** extra header/footer boxes wider than 1.5×700 (widest **1440px**) |
| `/link` | 1024 | **BLOCKER** | 1/1/2 | `footer-clipped` | clone footer max right **1440 > 1024** |
| `/link` | 1100 | **BLOCKER** | 1/1/2 | `footer-clipped` | clone footer max right **1440 > 1100** |
| `/link` | 1440 | MINOR | 0/0/1 | `pixel-residual-difference-ratio` | **6.08%** residual (threshold 1%); 48% of it on source edges |

**Totals: 10 measured, 0 failed — BLOCKER 8, MAJOR 1, MINOR 1, PASS 0.**

### The self-check floor — and why it makes the table mean something

`--self-check` (run `2026-09-02T23-27-36-145Z`) measured the live source against a second
capture of itself at the same 10 pairs:

```
/     @390/700/1024/1100/1440   PASS  (B0/M0/m0)  missingText=0.00%  p90=0px  pxResidual=0.00%
/link @390/700/1024/1100/1440   PASS  (B0/M0/m0)  missingText=0.00%  p90=0px  pxResidual=0.00%
```

**10/10 PASS, every channel exactly 0.00.** This host has no capture-time nondeterminism at
grading time at all — no font-fallback jitter, no animation phase, no feed reshuffle between
two captures minutes apart. The floor is therefore not a floor at all here: it is zero, and
**every finding in the verdict table is 100% attributable to the clone.** That is unusually
strong evidence and it is the single most useful thing this pilot contributes — on the other
five sites a residual could always be argued down to instrument noise; here it cannot.

Note the corollary: the 35% missing text on `/` is **not** source instability. Two captures
of the source taken at grading time agree with each other to the character. The text is
missing because the *observation*, taken ten minutes earlier, never saw it (§6.1).

---

## 3. The engine-change measurements

### 3.1 Stylesheet coverage — the CORS-clean control, and what that means

Aggregated over 7 pages × 2 viewports = 14 captures
(`site-observations/2026-09-02T23-14-10-373Z/pages/*/observation.json` →
`viewports.<id>.stylesheetCoverage`):

| Measure | Total |
|---|---|
| stylesheets seen | **478** |
| CSSOM-readable | **478** |
| CSSOM-blocked | **0** |
| fallback-**recovered** from a captured body | **0** |
| fallback-**missed** | **0** |
| rules indexed | **25,032** |
| `ruleIndexCapHit` | false on all 14 |
| `groupingRulesSkipped` | **0** |
| `sheetsRedirectResponses` | **0** |
| `importRulesVisited` / `Unresolved` | 0 / 0 |
| `sheetsMediaScoped` / `Trivial` / `Unreadable` | 0 / 0 / **0** |

Homepage alone: desktop 29 sheets / 1,682 rules / 441 elements with authored rules; mobile
30 sheets / 1,809 rules / 649 elements. `<link rel=stylesheet>` count in the rendered HTML:
**0**. 29 `<style>` tags, 692,099 bytes of CSS.

**Consequence for the engine changes being measured**: *"a redirected stylesheet is
recovered instead of lost"* and *"@font-face URLs resolve against their own sheet"* are
**not exercised on this site at all**, and the artifact says so honestly rather than
reporting a false success:

- 0 blocked sheets, 0 redirect responses ⇒ the recovery path never ran. `fallbackRecovered:
  0` here means *nothing needed recovering*, and `cssomBlocked: 0` proves it — the two
  numbers together are what distinguishes "recovery worked" from "recovery was never asked".
- `fontFaceUrlsHarvested: 560` across the 14 captures, of which **560 absolute**, **0**
  sheet-resolved and **0** document-resolved. Every one of the 38 `@font-face` blocks writes
  an absolute `static.parastorage.com` URL, so the new own-sheet base resolution had nothing
  to resolve. Capability exercised: harvesting yes (560/560), base resolution no (0/560).

This is the 28.5C "CORS capture trap absent" control the scout predicted, and it holds:
**every responsive residual measured on this site is an algorithm result, not a missing-CSS
artefact.**

### 3.2 @container — the direct grouping-rule validation target

Raw CSS in the homepage's 29 inline `<style>` tags contains **15 `@container` rules**:

```
@container (width < 480px){    ×14
@container (max-width: 288px){ × 1
```

What the observation *captured*, counted straight off `layoutRules[].container` in
`viewports/<id>/dom.json`:

| page / viewport | decls | `container` | `media` | `supports` | `layer` | unconditional | container ∧ media |
|---|---|---|---|---|---|---|---|
| p000001 `/` desktop | 7,754 | **6** | 6 | 5 | 0 | 7,742 | 0 |
| p000001 `/` mobile | 10,849 | **6** | 6 | 8 | 0 | 10,834 | 0 |
| p000005 `/link` desktop | 4,689 | **6** | 6 | 5 | 0 | 4,677 | 0 |
| p000005 `/link` mobile | 4,874 | **6** | 6 | 8 | 0 | 4,859 | 0 |

Distinct container conditions captured on every one of the four: `(max-width: 288px)` ×1 and
`(width < 480px)` ×5.

**Answer to the brief: 6 `@container` declarations captured per page/viewport, and NONE of
them was recorded as unconditional.** The `unconditional` bucket is disjoint from the
`container` bucket by construction in the census above, `groupingRulesSkipped` is 0, and the
SiteSpec's own independently-computed field agrees to the unit:
`authoredBreakpoints.containerScopedDeclarations: 6`,
`supportsScopedDeclarations: 5` (desktop) / `8` (mobile), `layerScopedDeclarations: 0`,
`containerGatedSkippedDeclarations: 0`. The pre-28.6 `CSSRule.type === 4` test would have
filed all 6 as unconditional; it does not.

Two honest caveats on the number 6:
- 6 is **declarations on matched elements for the layout-property whitelist**, not "all
  declarations inside the 15 `@container` blocks". The index is a matched-element index, not
  a stylesheet compile. 15 rules → 2 distinct conditions → 6 layout declarations that
  actually landed on an observed element.
- `containerGatedSkippedDeclarations: 0` means no `@media` declaration was *also* inside an
  `@container`, so the "container-gated media is not a viewport band edge" exclusion never
  had to fire here. Un-exercised, not proven.

### 3.3 Authored declarations, and the two histograms that disagree

Homepage, from `site-specs/…/pages/p000001.json` → `viewports.<id>.authoredBreakpoints`:

| | desktop | mobile |
|---|---|---|
| `declarationsExamined` | 7,754 | 10,849 |
| `mediaScopedDeclarations` | 6 | 6 |
| `foldedDeclarations` | 6 | 6 |
| `widthDeclarations` | 5 | 5 |
| `widthIrrelevantDeclarations` | 1 | 1 |
| `unparsedDeclarations` / `unsupportedDeclarations` | 0 / 0 | 0 / 0 |
| `distinctConditions` / `distinctRawConditions` | 2 / 2 | 2 / 2 |
| `truncatedNodeCount` | **30** | **40** |
| resulting `entries` | `max:480 ×5` | `max:480 ×5` |
| resulting `boundaries` | `{below:480, above:481, count:5}` | same |

Across all 8 inference pages the manifest reports `authoredBreakpointDeclarations: 51,377`,
`authoredBreakpointEntries: 9`, `authoredBreakpointUnparsedDeclarations: 0`,
`authoredBreakpointTruncatedNodes: 257`, `authoredBreakpointPages: {spec-field: 8}`.

**This is where the site breaks the engine.** The observation *also* keeps a whole-stylesheet
media census in `stylesheetCoverage.authoredMediaConditions`, and on the same homepage that
census reads **15 distinct conditions, summed weight 88**:

```
(forced-colors: active) 26 · only screen and (max-width: 480px) 14 · (min-width: 660px) 12
(min-width: 980px) 10 · (prefers-reduced-motion: no-preference) 7 · (max-width: 685px) 4
print 4 · (max-width: 500px) 2 · (max-width: 659px) 2 · only screen and (max-width: 300px) 2
(min-width: 686px) 1 · (min-width: 686px) and (max-width: 980px) 1 · (min-width: 740px) 1
(min-width: 886px) 1 · (prefers-reduced-motion: reduce) 1
```

So the engine carries **two independent breakpoint histograms**, built by different code from
the same capture, and they do not agree:

| histogram | source | homepage content | consumed by |
|---|---|---|---|
| `stylesheetCoverage.authoredMediaConditions` | every rule in every sheet | 15 conditions / weight 88 → 11 folded breakpoints | `deriveProbeWidths()` (probe width set) |
| `ViewportPageSpec.authoredBreakpoints` | matched elements × layout-property whitelist | **2 conditions / 6 declarations → 1 boundary (480/481)** | `chooseTreeSwitch()` **and** band-edge snapping |

The probe knew about 300/480/500/659/660/685/686/740/886/980. The tree switch was shown
exactly one candidate. §5 is what that cost.

### 3.4 The derived probe width set and its provenance

Homepage desktop probe (`layout-probe.json.widthProvenance`), cap 16:

```
widths  300 301 390 480 481 500 501 659 660 685 686 979 980 981 1024 1920
floor   [390, 700, 768, 1024, 1100, 1440, 1920]        guaranteed [390, 1024, 1920]
capHit  true      degradedToFloor false
conditionsRead 15   conditionsWeight 88   conditionsDroppedByCollector 0
breakpointsFolded 11  outOfRange 0  alreadyBracketed 2  adopted 7  droppedByCap 2
breakpointsRefused  [{px:740,kind:min,count:1,reason:cap},{px:886,kind:min,count:1,reason:cap}]
widthsAdded 13      floorWidthsEvicted [700, 768, 1100, 1440]   adoptedByEviction 3
conditionsWidthIrrelevant 38  unsupported 0  unparsed 0  nonScreenSkipped 0  emptyInterval 0
rootFontSizePx 16
```

Homepage mobile probe:

```
widths  300 301 390 481 500 501 659 660 685 686 700 739 740 885 886 914
floor   [390, 480, 700, 768, 914]                       guaranteed [390, 700, 914]
capHit  false     breakpointsOutOfRange 2 (min:980 ×10, max:980 ×1 — outside the mobile envelope)
adopted 7  droppedByCap 0  widthsAdded 13  floorWidthsEvicted [480, 768]  adoptedByEviction 1
```

Per-page desktop probe sets (this matters in §5.2):

| page | route | n | capHit | floor widths evicted | 1440 present? |
|---|---|---|---|---|---|
| p000001 | `/` | 16 | true | 700, 768, 1100, 1440 | **no** |
| p000002 | `/정보` | 16 | true | 700, 768, 1100, 1440 | **no** |
| p000003 | `/about` | 9 | false | — | yes |
| p000004 | `/contact` | 9 | false | — | yes |
| p000005 | `/link` | 9 | false | — | yes |
| p000006 | `/post/…` | 16 | true | 700, 768, 1100, 1440 | **no** |
| p000007 | `/post/…` | 16 | true | 700, 768, 1100, 1440 | **no** |

**Provenance is honest and complete** — every evicted width and every refused breakpoint is
named, `capHit` is true, `degradedToFloor` is false. The problem is not the record; it is the
policy the record describes (§5.2).

### 3.5 The tree switch — chosen width, method, provenance

`reconstruction-manifest.json → config.inferredBreakpoint`:

```
value 481                       method "authored-breakpoint"      provenance "inferred"
mobileObservedWidth 390         desktopObservedWidth 1440
candidateCount 1                ambiguous false
candidatesOutsideObservedInterval 1     candidatesOmitted 0
chosen { px: 481, authoredWeight: 165, authoredPages: 7,
         observedChange: 0, observedChangePages: 7, observedChangeUnattributablePages: 0 }
pagesRead 7  pagesWithHistogram 7  pagesWithUsableProbe 7
treeDivergence "dual-dom"  pagesIdenticalWalk 0  pagesDivergentWalk 7  pagesWalkNotComparable 0
domSwitchWidthObserved false
```

Emitted as `app/globals.css:26` `@media (max-width: 480.98px)` (mobile tree) and
`app/globals.css:32` `@media (min-width: 481px)` (desktop tree).

**It snapped, and it snapped away from the old 915 midpoint** — that part of the change did
what it says. But read `chosen.observedChange: 0` on `observedChangePages: 7`: the probe
looked at all seven pages and measured **no geometric change at all** across the 480/481
bracket, and 481 was still chosen because it was the **only** candidate the histogram
offered (`candidateCount: 1`). The site's real desktop/mobile divide is the Wix 980
(`(min-width: 980px)`, authored weight 10, and the one width at which the probe *does*
measure a change: `documentWidth` 980 → 981). 980 never entered the candidate pool. See
§5.1.

### 3.6 Band edges snapped vs midpoint-kept

```
responsiveHidden 0   bandEdgesOpen 0   bandEdgesConsidered 0
bandEdgesSnapped 0   bandEdgesSnappedAmbiguous 0   bandEdgeSnapShiftPx 0
bandEdgesKeptMidpointNoAuthoredInGap 0   ...EmptyHistogram 0   ...NoHistogram 0
bandCheckable 0  rejectedByBandCheck 0  bandWidthsRendered 0
bandIndependentlyDiscriminated 0  bandHiddenByAncestorAtBandWidth 0
bandExactTierHidesAtBandWidth 0  bandTruthBaselineNotInLayout 0  bandSampleMismatches 0
```

**Not one responsive-hide band was produced, so the entire band-snapping and in-band
verification apparatus is un-exercised on this site.** 0/0 is not a pass; it is a
no-op. The reason is structural: this site never *hides* a box by width — it serves two
different DOMs and freezes each at a fixed width (§4), so no node is display:none in one
probe band and displayed in another.

### 3.7 The desktop / mobile recovered-rule split

```
viewportPasses         { desktop: 7, mobile: 7 }
viewportPassesUsed     { desktop: 3, mobile: 5 }
viewportPassRefusals   { "desktop:truth-width-not-probed": 4,
                         "mobile:fewer-than-two-widths": 2 }
rulesByViewport        { desktop: 147 }          shippedRulesByViewport { desktop: 147 }
```

Read that carefully, because it is the headline result of this pilot:

- **The mobile pass now runs.** Before the change it was structurally absent; here it was
  attempted on 7 pages and resolved a probe on **5**. That half of the change is real.
- **And it emitted zero rules.** `rulesByViewport` has no `mobile` key at all. The mobile
  subtree got exactly as many inline-size rules as it did before: none.

Every refusal is accounted for at `src/reconstruction/layout-inference.ts:1662` and `:1664`,
against the per-page probe sets in §3.4 and breakpoint 481:

| page | mobile-side widths (<481) | desktop-side truth 1440 | outcome |
|---|---|---|---|
| p000001 `/` | 300, 301, 390 → 3 | evicted | mobile ran · **desktop refused** |
| p000002 | 300, 301, 390, 480 → 4 | evicted | mobile ran · **desktop refused** |
| p000003–5 (`/link`) | 390, 480 → 2 | present | both ran |
| p000006–7 | 390 → **1** | evicted | **mobile refused** · **desktop refused** |

3 desktop + 5 mobile passes ran; 4 + 2 refused. The counters match the probe files exactly.

### 3.8 The inline-size outcome partition, including no-branch-matched

From the shipped manifest (`layout.*`), 8 inference pages:

```
nodesWithProbe            2,835
  inlineSizePreStageDrops   hidden-at-truth-width   528
                            display-not-blockish    239
                            truth-sanity-mismatch    10          (sum 777)
  inlineSizeCandidates    2,058                                  (777 + 2,058 = 2,835 ✓)

inlineSizeOutcomes        no-branch-matched                1,875   (91.1%)
                          emitted-full-width                 138   ( 6.7%)
                          refused-containing-block-guard      24   ( 1.2%)
                          refused-width-mode                  21   ( 1.0%)
                          emitted-centered-max-width           0
                          emitted-centered-max-width-capped-fill 0
                          emitted-percentage-width             0
                          refused-parent-padding-unreadable    0
                          refused-own-padding-unreadable       0
                          refused-width-value                  0   (sum 2,058 ✓)
inlineSizeOutcomeDoubleCounts 0

guardRefusalsByReason     grid-item 21 · flex-item-basis-governed 3
widthModeRefusalsByReason grid-item-inline-size 15 · flex-item-main-axis 3 · out-of-flow-auto-margin 3
widthModeStretch 90 · widthModeFillPercentage 48
widthValueRefusals 0
gridTrackColumns 9 · gridTrackRefusals 150
  { container-width-constant 93 · tracks-not-px 35 · children-do-not-tile-tracks 15 · no-probe 7 }
```

**91.1% of every candidate this engine examined landed in `no-branch-matched`** — the bucket
that means "no predicate held, so the frozen truth-width px ships unchanged". That is the
whole story of this site's geometry BLOCKERs in one number, and it is exactly the counter the
change was built to stop hiding. On the pre-28.6 artifact this site would have reported
147 recovered rules and no refusals at all.

**`no-branch-matched` carries no sub-reason.** `InlineSizeOutcome`
(`src/reconstruction/layout-inference.ts:301`) is a flat union; the 1,875 nodes are one
undifferentiated bucket, so the brief's "no-branch-matched **by reason**" cannot be answered
from the artifact. On this site I can name the cause from the probe directly (§4), but the
engine cannot: it can say *that* 1,875 boxes were unrecoverable and not *why*, and it is the
largest bucket in the partition.

**Isolating the mobile pass** (offline re-run, `breakpoint` forced to 1441 so every desktop
pass refuses with `fewer-than-two-widths` and every mobile pass gets its full 16-width probe
— `tmp/wr286/w7-wix-idn/reinfer.ts`):

```
viewportPassesUsed { mobile: 7 }      rulesByViewport { mobile: 9 }   (all 9 = grid-track-columns)
inlineSizeCandidates 2,458
inlineSizeOutcomes   { no-branch-matched: 2,458 }        ← 100%, every other bucket zero
```

So the mobile subtree's zero is **not** an artefact of the 481 switch truncating its width
list. Given every width it could possibly want, **not one of 2,458 mobile candidates matches
any inline-size branch.** §4 says why.

### 3.9 The parent content box, measured per width

These five counters exist in `LayoutInferenceCounters`
(`src/reconstruction/layout-inference.ts:482–499`) and are **never written to the
manifest** — `generate-app.ts` has no line for them (grep: 0 hits). I recovered them by
re-running `inferLayoutRules()` offline against the shipped SiteSpec, which reproduces every
manifest number identically:

```
contentBoxMeasured            587      (28.5% of the 2,058 candidates)
contentBoxAssumedConstant   1,471
contentBoxMeasuredDisagreed     0
contentBoxMaxDisagreementPx     0
parentPaddingNotConstant    { "viewport-relative": 9 }
```

**The measurement ran 587 times and changed the answer zero times, with a maximum
disagreement of 0.00 px.** That is the correct result for this site rather than a
disappointment: both of its trees are frozen at a fixed width (§4), so a padding assumed
constant genuinely *is* constant, and the new per-width measurement confirms the old
assumption instead of correcting it. It is a clean negative control for the change — but see
defect E5: because these counters never reach the manifest, that negative control is
invisible to anyone reading the artifact.

### 3.10 Truth-check accounting, every drop explained

```
truthCheckStatus  "verified"      truthCheckConverged true
truthCheckRounds  3               truthCheckPagesRendered 3     bandWidthsRendered 0
candidateRules     147
  truthCheckable   147            bandCheckable 0
  acceptedRules    147
  acceptedUnchecked  0
  rejectedByTruthCheck    0
  rejectedByBandCheck     0
  rejectedUnverifiable    0
  acceptedRegressed       0
rejectedByGuard     24            (refused before candidacy, counted in the partition above)
```

Full reconciliation, nothing unexplained:
`2,058 candidates = 138 emitted-full-width + 9 grid-track-columns (= 147 rules handed to the
truth check) + 24 guard refusals + 21 width-mode refusals + 1,875 no-branch-matched`. All
147 rules were renderable at the truth viewport, all 147 survived, `acceptedRegressed: 0` in
the confirming render, 3 rounds to convergence over the 3 pages whose desktop pass ran. **No
rule shipped unverified and no drop is unaccounted for.** `truthCheckPagesRendered: 3`
equals `viewportPassesUsed.desktop: 3`, as it must.

---

## 4. The third responsive class: BOTH trees are fixed-width

The brief asked what the tree switch chose and whether the `width=320` fixed-width mobile
mode is reproduced or flattened. The measured answer is more interesting than the question:
**neither of this site's two trees is fluid.**

### 4.1 The mobile tree is pinned at 320 CSS px by its viewport meta

`observation.json → responsiveSummary.mobile.documentWidth: 320`, while the mobile profile's
viewport is 390×844 `isMobile: true, deviceScaleFactor: 3`. The page ships
`<meta name="viewport" content="width=320, user-scalable=yes">`, so the layout viewport is
320 and the browser scales it up ~1.22× to fill 390.

The consequence for the viewport-parameterised probe, measured across all 16 mobile probe
widths on the homepage:

| probe width | 300 | 301 | 390 | 481 | 500 | 501 | 659 | 660 | 685 | 686 | 700 | 739 | 740 | 885 | 886 | 914 |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| `documentWidth` | 321 | 320 | 320 | 321 | 320 | 321 | 320 | 320 | 320 | 321 | 320 | 320 | 320 | 320 | 320 | 320 |
| widest box | 320 | 320 | 320 | 320 | 320 | 320 | 320 | 320 | 320 | 320 | 320 | 320 | 320 | 320 | 320 | 320 |

And on the three widths the 481 switch actually gives the mobile pass (300 / 301 / 390):
**649 of 649 nodes (100%) have identical width at all three.** Zero nodes vary. The
`320` vs `321` alternation is sub-pixel rounding, not layout.

**That is the whole explanation for §3.8's `no-branch-matched: 2,458 (100%)` on mobile.** The
inline-size branches all ask a question of the form "how does this box's width respond to its
parent's content box as the viewport changes"; on a `width=320` page the viewport never
changes, so no branch can hold and every box correctly falls through to its frozen px. The
viewport-parameterisation change is working exactly as designed and recovering nothing,
because there is nothing to recover. **`no-branch-matched` here is the honest answer, not a
bug** — but nothing in the artifact distinguishes "the probe had no width signal" from "the
box has a shape we cannot express" (defect E4).

### 4.2 The desktop tree is pinned at 980 CSS px by a min-width

Same page, desktop probe:

| probe width | 300…979 | 980 | 981 | 1024 | 1920 |
|---|---|---|---|---|---|
| `documentWidth` | **980** at every one | 980 | 981 | 1024 | 1920 |
| widest box | 980 | 980 | 981 | 1024 | 1920 |

The Wix desktop tree has a hard 980px floor and simply overflows below it — it never
reflows. Corroborated on the live source by the grader: `/` source `scrollWidth` is **980**
at viewport 390 (`horizontalOverflow: 590`) and at 700 (`horizontalOverflow: 280`), and the
source `scrollHeight` is **6380 at all five widths**. The source's own two screenshots at 390
and 700 are byte-identical in size (1,599,558 B) because they are the same 980px document.

Consequently: on the desktop side of the switch, `194 of 257 probed nodes (75.5%)` on
`/link` still have identical width across 481/700/768/1024/1100/1440/1920. Three quarters of
the desktop tree is frozen too. That is why the desktop pass, even where it ran, produced
only 138 `emitted-full-width` rules out of 2,058 candidates.

### 4.3 The `width=320` meta is flattened, and the artifact says so

The generated document shell (`app/app/layout.tsx`, from the `RootLayout` template in
`src/reconstruction/generate-app.ts`) emits `<html><body>` with **no `<head>` metadata and no
`viewport` export** — grep for `viewport`/`metadata` in the generated `app/` returns nothing.
Next.js supplies its default `width=device-width`. So `width=320, user-scalable=yes` is
**flattened**, and the manifest declares it: `limitations` includes
`"source-head-not-reconstructed"`.

**This does not show up in the verdict table, and that is worth stating explicitly.**
`qa:responsive` captures both sides with `isMobile: false, hasTouch: false`
(`src/responsive-qa/capture.ts:72–74`), and a non-mobile Chromium context ignores the
viewport meta entirely — so the source is *also* laid out without it during grading. The
flattening is a real production defect (on a real phone the clone would render its mobile
tree at 390 instead of a scaled 320) that **the grader is structurally blind to**. Nobody
should read the 10-pair table as evidence that the fixed-width mobile mode was reproduced.

### 4.4 …and the grader never sees the mobile tree the source serves

Because the capture profile is non-mobile at every width, Wix's user-agent negotiation serves
the **desktop** HTML at all five widths. Measured: source `totalNodes` = **716 at 390, 700,
1024, 1100 and 1440** on `/` (and 315 at all five on `/link`) — one constant tree. Meanwhile
the clone honours its own `@media (max-width: 480.98px)` and shows its **mobile** tree at 390
(clone `scrollHeight` 9077 = exactly the mobile observation's `documentHeight`).

So the two `nav-link-ratio` BLOCKERs at 390 are a **profile mismatch, not a clone defect**:
the source is showing its 6-item desktop nav because it thinks it is talking to a desktop,
and the clone is showing its hamburger because 390 < 481. Both are behaving correctly. This
is generic — any UA-switching source hits it — and it is the one place where this lane's
BLOCKER count overstates the clone's badness.

---

## 5. Every BLOCKER and MAJOR, diagnosed

### 5.1 BLOCKER · `/` @1024, `/` @1100, `/link` @1024, `/link` @1100 — `footer-clipped`, clone max right **1440**

The clone ships a footer whose right edge is at 1440 px inside a 1024 or 1100 px viewport.
Direct cause, in the generated artifact: `app/public/wr/generated-styles.css` contains
**210 occurrences of `width: 1440px`** (and 356 of `width: 320px`, 70 of `width: 980px`) in
the exact-computed-style tier. Only **147** recovered rules ship on top of that tier
(`layout.shippedRulesByViewport: { desktop: 147 }`), so the overwhelming majority of boxes
carry their frozen truth-width px into every viewport.

Diagnosis by artifact field:
- `reconstruction-manifest.json → layout.inlineSizeOutcomes["no-branch-matched"] = 1875`
  (91.1% of candidates) — the boxes that ship frozen.
- For `/` specifically, **no desktop rule was even attempted**:
  `layout.viewportPassRefusals["desktop:truth-width-not-probed"] = 4`, and p000001 is one of
  the four (§3.4 table). `src/reconstruction/layout-inference.ts:1664` refuses the whole
  pass because 1440 is not in the probe's width list.
- For `/link` the desktop pass *did* run and still left the footer frozen, so the refusal is
  not the only cause — the branch set does not cover this shape either.

Corroboration that this is frozen-px and not a cascade error: at **1440** both routes have
**zero** geometry findings (`/link` @1440 is MINOR on pixel residual alone, p90 offset 1 px,
gutter 266/266 exact). The clone is precisely right at the truth width and wrong everywhere
below it. That is the signature.

### 5.2 BLOCKER (root cause behind 5.1 on `/`) · the probe cap evicts the desktop truth width

`deriveProbeWidths()` guarantees only `[390, 1024, 1920]` on the desktop pass
(`guaranteedFloorWidths`) and will evict any other floor width to make room for an authored
bracket. On this site the homepage's 15 authored conditions produced 11 folded breakpoints,
7 of which were adopted, and the cap of 16 then evicted **700, 768, 1100 and 1440**
(`floorWidthsEvicted`, `breakpointsAdoptedByEviction: 3`).

Two independent harms, both measured:

1. **The desktop pass dies outright on 4 of 7 pages** because 1440 — the width the desktop
   deep observation was taken at — is gone. `viewportPassRefusals["desktop:truth-width-not-probed"]: 4`.
   The homepage, the site's most important route, recovers **zero** desktop layout rules.
2. **The desktop probe spends 6 of its 16 slots below 501 px** (300, 301, 480, 481, 500, 501)
   — phone-range edges, in the *desktop* pass, where the desktop tree is a frozen 980 px
   document that cannot respond to any of them (§4.2) — while losing 700, 1100 and 1440,
   three of the five widths the grader actually measures.

The eviction policy ranks an authored breakpoint above a floor width without asking whether
the breakpoint lies in the range this pass can use, and without protecting the truth width.
Generic, no site-specific tuning implied: *the viewport's own observation width should be
inevictable, and a pass should not spend budget on brackets outside its own envelope* (the
mobile pass already does the second half — it dropped `min:980` twice as `out-of-range`).

### 5.3 BLOCKER · `/` @700 / @1024 / @1100 / @1440 — `missing-text-ratio` 35.4%

`missingChars: 2074` of `sourceVisibleChars: 5862` (`missingOccurrences: 14`,
`missingStringCount: 13`, `boundaryOnlyChars: 0`, `scriptRelaxedChars: 0`,
`truncatedSourceKeys: 17`). The clone's desktop tree carries 3,740 visible chars where the
source has 5,862.

**Counted directly in the observation's own markup**: the homepage's *desktop* capture
contains **2** distinct `/post/…` hrefs; the *mobile* capture of the same page in the same
run contains **6** —

```
desktop (2):  여기여-브라우저-즐겨찾기-추가-및-모바일-홈화면-추가-방법 · 여기여-생활정보-사이트-안내
mobile  (6):  …those two, plus 여기여-인기-사이트-순위-나열 · 온카25-먹튀검증-사이트-최신주소-안내
              · 티비착-완벽-가이드-최신-이용-방법-특징-장점-총정리 · 티비-다시보기-콕콕티비-최신-주소-안내
```

and the four the desktop capture lacks are **exactly** the four post titles the grader lists
as missing. The two viewports disagree with each other inside a single observation run, which
is the cleanest possible proof that this is a capture-timing defect and not a source
property.

The samples name it unambiguously — it is the **Wix Blog widget's post cards**: post titles
(`온카25｜먹튀검증 사이트 최신주소 안내`, `티비 다시보기｜콕콕티비 최신 주소 안내`,
`여기여 인기 사이트 순위 나열`, `티비착 완벽 가이드 | 최신 이용 방법, 특징, 장점 총정리`),
their excerpt bodies, the like line (`3 좋아요 좋아요로 표시되지 않은 게시물`) and three view
counts (`1,123`, `1,768`, `1,778`).

**This is a capture-completeness defect in the observation stage, and the self-check proves
it.** The source is byte-stable between two captures at grading time (10/10 PASS, missingText
0.00%), so the text is not appearing and disappearing. It was simply not there when the
observer looked — even though the observer believed it had settled:

```
p000001 desktop loadStrategy:
  waitUntil "load"  networkIdleTimeoutMs 8000  networkIdleReached TRUE (4584 ms)
  fontsReadyReached true  settleMs 1200  prepareScroll true  scrollSteps 8  scrollDistancePx 5480
  totalMs 10944
p000001 mobile:
  networkIdleReached FALSE (8003 ms timeout)   scrollSteps 15  scrollDistancePx 8384  totalMs 21412
```

The desktop capture **reached network idle and still missed a third of the page's text**,
while the mobile capture *failed* to reach idle and captured more (the clone's mobile tree at
390 misses only 0.62%). `paintSuppression.suppressedElements: 0` and
`scrollReveal.regressedAfterReturn: 0` on both — so none of the existing completeness
detectors fired. **Nothing in any artifact flags this page as content-incomplete.** A
client-fetched widget that resolves its request and then renders asynchronously defeats
network-idle as a settle signal, and the engine currently has no other one.

### 5.4 BLOCKER · `/` @390 and `/link` @390 — `nav-link-ratio` 1/6

Diagnosed in §4.4: the grader's non-mobile capture profile makes the source serve its
desktop tree (6 nav links) while the clone correctly serves its mobile tree (1 hamburger)
below its 481 switch. Supporting numbers at `/` @390: source 716 nodes / 540 visible /
5,827 chars / `scrollWidth` 980 / `horizontalOverflow` 590; clone 1,161 nodes (both trees) /
538 visible / 6,004 chars / `scrollWidth` 390 / `horizontalOverflow` 0. The clone shows
*more* text than the source here — it is showing a different, richer tree, not a broken one.

Accompanying findings at 390 follow from the same fact: `column-mode-delta` 3 vs 6 (MAJOR),
`position-delta-p90-px` 646 px (MAJOR), `scroll-height-ratio-high` 1.42× (MINOR),
`pixel-residual` 43.22% (MINOR). None of them is independent evidence.

### 5.5 MAJOR · `/link` @700 (and `/` @700) — `landmark-wide-element-excess` 29, widest **1440 px**

29 boxes inside the clone's header/footer are wider than 1.5 × 700 px, the widest being
exactly **1440 px**. Same mechanism as 5.1: frozen truth-width boxes. The source has 0 such
boxes at 700 because its own header/footer are 980 px wide, under the 1050 px threshold.

### 5.6 MAJOR · `position-delta-p90-px` at 700 / 1024 / 1100 (both routes)

p90 offsets of 230 / 208 / 170 px on `/` and 237 / 209 / 171 px on `/link`, against a 48 px
threshold. At 1024 and 1100 the values match `(1440 − viewport) / 2` **exactly** — 208 and
170 — which is the displacement a centred, frozen 1440 px canvas produces. At 700 the
prediction is 370 and the measurement is 230/237, because the *source* is itself overflowing
there (its own document is 980 px in a 700 px viewport), so that pair is confounded and I do
not claim it. The finding disappears at 1440 (p90 = 0 px on `/`, 1 px on `/link`), which is
the same signature as §5.1.

### 5.7 MINOR · `pixel-residual-difference-ratio` — and the images are simply not there

Best pair `/link` @1440: **6.08%** of compared pixels, of which 48% sits on source edges; the
harness's own calibration note records that only 29.52% of that page's area is ink, so the
residual is 20.59% of everything the page draws. Geometry is exact at 1440 (§5.6), so this is
not displacement.

**Looking at the images shows what most of it is: the clone renders no bitmaps at all.**
In `link_1024_clone.png` the header logo, the large pink-texture tile, the footer logo and
all four social icons appear as broken-image `alt` placeholders (`여기여 로고`,
`Pink Textured Surface_edited.jpg`, `F` `I` `X` `T`); in `link_1024_source.png` every one of
them renders. The clone was built with `config.assetMode: "reference"`,
`stats.remoteAssetUrls: 395`, `stats.assetDownloads: 0` — it hotlinks
`static.wixstatic.com`, which refuses the cross-origin request. The e2e QA counted it:
`asset-hotlink-blocked 107 (107 nodes)` and `asset-load-failure 3`, both classified
`requires-asset-materialization`.

This is a **known, declared, out-of-scope limitation** (asset materialization is a separate
stage that this pipeline invocation does not run), not a responsive defect. But it is the
first thing a human sees, and it inflates every `pixel-residual` number in the verdict table
— so no pixel residual on this run should be read as a measure of layout or typography
fidelity.

---

## 6. Measured engine defects (generic; no site-specific remedy implied)

Ordered by how much of this lane's BLOCKER count they explain. All are stated as
measurements with a file:line or an artifact field. I changed nothing.

**E1 — The tree switch draws its candidates from the layout-property matched-element
histogram, not from the whole-stylesheet media census the same capture already holds.**
`chooseTreeSwitch()` (`src/reconstruction/tree-switch.ts:236 aggregateAuthoredCandidates`)
reads `ViewportPageSpec.authoredBreakpoints`, which on this homepage folds to
`{below: 480, above: 481, count: 5}` from **6** media-scoped declarations — a single
candidate. The observation's own `stylesheetCoverage.authoredMediaConditions` on the same
page holds **15 conditions / weight 88**, including `(min-width: 980px)` ×10 which is this
site's actual desktop/mobile divide and the one width where the probe measures a change
(`documentWidth` 980 → 981). Result: `candidateCount: 1`, and the switch shipped at **481**
with `chosen.observedChange: 0` on `observedChangePages: 7` — snapped to a breakpoint the
probe explicitly says nothing happens at, because it was the only one offered. The ranking
rule ("corroborated by the probe first") cannot reject a zero-corroboration candidate when it
is the only one.

**E2 — `deriveProbeWidths()` can evict the viewport's own truth width, which kills the whole
pass.** `guaranteedFloorWidths` is `[390, 1024, 1920]` on the desktop pass; 1440 — the
desktop deep-observation width — is evictable. On 4 of this site's 7 pages it was evicted
(`floorWidthsEvicted: [700, 768, 1100, 1440]`, `capHit: true`), and
`resolveViewportProbe()` then refused the entire desktop pass at
`src/reconstruction/layout-inference.ts:1664`
(`viewportPassRefusals["desktop:truth-width-not-probed"]: 4`). **The homepage recovered zero
desktop layout rules for this reason alone.**

**E3 — The probe budget is spent on brackets outside the pass's own usable range.** The
desktop pass sampled 300, 301, 480, 481, 500, 501 — 6 of 16 slots below 501 px — while the
desktop tree is a frozen 980 px document that cannot respond to any of them, and while
700/1100/1440 were evicted. The mobile pass already refuses out-of-envelope breakpoints
(`breakpointsOutOfRange: 2`, `min:980` ×10 and `max:980` ×1 listed in `breakpointsRefused`);
the desktop pass has no equivalent lower guard.

**E4 — `no-branch-matched` is a single undifferentiated bucket and it is the largest one.**
1,875 of 2,058 candidates (91.1%) shipped frozen px with no recorded reason;
`InlineSizeOutcome` (`src/reconstruction/layout-inference.ts:274–301`) has no sub-reason
field. On this site two very different causes both land there — "the probe had literally zero
width variance" (all 2,458 mobile candidates, §4.1) and "the box has a shape no branch
expresses" (part of the desktop set) — and the artifact cannot tell them apart. A reader
cannot distinguish an honest refusal from a coverage gap.

**E5 — Five computed counters never reach the manifest.**
`contentBoxMeasured`, `contentBoxAssumedConstant`, `contentBoxMeasuredDisagreed`,
`contentBoxMaxDisagreementPx` and `parentPaddingNotConstant` are maintained in
`src/reconstruction/layout-inference.ts:2094–2141` and are absent from
`src/reconstruction/generate-app.ts` (grep for any of the five in that file: **0 hits**), so
they appear in no artifact. The 28.6 change "the parent content box is now MEASURED per width
from sibling geometry" is therefore **un-auditable from a shipped run** — I had to re-run the
inference offline to report `587 / 1,471 / 0 / 0.00 px`.

**E6 — The observation's settle policy has no completion signal for a client-fetched
widget.** The homepage desktop capture recorded `networkIdleReached: true` at 4,584 ms with
`prepareScroll: true` and 1,200 ms settle, and still captured 3,740 of the source's 5,862
visible characters — the Wix Blog feed rendered **2 post cards where the same run's mobile
capture of the same page got 6**. No artifact field marks the
page incomplete (`paintSuppression.suppressedElements: 0`,
`scrollReveal.regressedAfterReturn: 0`). Cost: one BLOCKER (35.4% missing text) on 4 of the
5 `/` pairs, plus the `empty-band-excess-ratio` MINOR of 8.5% at every desktop width, which
is the visible hole where the missing cards belong.

**E7 — The generated document shell carries no head metadata, so a non-default viewport meta
is silently flattened.** `RootLayout` in `src/reconstruction/generate-app.ts` emits
`<html><body>` with no `viewport` export; the source's `width=320, user-scalable=yes` is
lost. The manifest is honest about it (`limitations: [… "source-head-not-reconstructed"]`),
but the responsive grader cannot see it, because `src/responsive-qa/capture.ts:72–74` captures
both sides with `isMobile: false` and a non-mobile context ignores viewport meta. **A real
defect that this rubric structurally cannot grade.**

**E8 — The grader's fixed non-mobile capture profile mis-scores user-agent-switching
sources.** Both `nav-link-ratio` BLOCKERs at 390 arise because the source served its desktop
tree to a desktop UA while the clone served its mobile tree per its own media query
(§4.4). Both sides are behaving correctly; the pair is scored BLOCKER anyway. This is
generic to any UA-negotiating source, not a property of this site.

**E9 — `BreakpointSpec` drops `midpointPx` and `snapped`.** `TreeSwitchDecision`
(`src/reconstruction/tree-switch.ts:134`) carries both; `inferBreakpoint()`
(`src/reconstruction/responsive-plan.ts:113–133`) forwards neither, encoding the fact only in
`method`. A reader of the manifest cannot see how far the switch moved off the midpoint
without recomputing `floor((390+1440)/2)` themselves.

---

## 7. Hangul with no Korean webfont — measured, and not a grading factor

- **10 distinct `font-family` stacks** in the whole style catalog. Top four by node count:
  `Arial, Helvetica, sans-serif` (905), `futura-lt-w01-light, sans-serif` (621),
  `HelveticaNeueW01-45Ligh…` (33), `helvetica-w01-roman, sans-serif` (17).
- **Not one stack names a Korean family.** The only CJK names anywhere are Japanese
  (`メイリオ / meiryo / ヒラギノ角ゴ pro w3 / hiragino kaku gothic pro`), in 2 stacks.
- 38 `@font-face` blocks, 40–44 URLs harvested per capture, **all Latin faces**.
- Hangul volume in the observed markup: **2,619 syllables desktop, 4,107 mobile** on `/`
  alone.
- `limitations` includes `"font-source-binding-unverified"`.

Every hangul glyph on both sides therefore renders through the host OS fallback (Apple SD
Gothic Neo here). **This did not contribute to any verdict**: the self-check floor is
0.00% pixel residual on all 10 pairs, which proves the fallback is deterministic on this
machine, and the source and the clone are rasterised by the same browser on the same host.
The scout's warning that hangul metrics would add cross-machine variance is correct for
*cross-machine* baselines and irrelevant within one run.

---

## 8. What I could not measure, and why

1. **`no-branch-matched` by reason** — the engine does not record one (defect E4). I can
   name the cause for the mobile half from the probe (100% zero width variance) but not for
   the 1,875 aggregate.
2. **The mobile pass's share of `inlineSizeOutcomes`** in the shipped run — the partition is
   not split by viewport in the artifact. I isolated it with an offline re-run at
   `breakpoint: 1441` (100% `no-branch-matched` over 2,458 candidates), which is a *different
   input*, not the shipped run's mobile subset.
3. **Whether the clone reproduces the `width=320` mobile mode on a real device** — the
   grader's capture profile ignores viewport meta on both sides (E7). I can prove the meta is
   absent from the generated app; I cannot produce a graded number for its effect.
4. **Band-edge snapping behaviour** — `bandEdgesConsidered: 0`. This site produces no
   responsive-hide bands at all, so the entire band apparatus is untested here. The 0s in
   §3.6 are "not exercised", never "passed".
5. **Stylesheet redirect recovery and own-sheet `@font-face` base resolution** — 0 blocked
   sheets, 0 redirect responses, 560/560 absolute font URLs. Not exercised (§3.1).
6. **All 15 `@container` rules' declarations** — the index is matched-element and
   layout-property-scoped, so 6 is what landed on observed elements, not the block total
   (§3.2).
7. **The interaction-exploration gap** — the stage finished `partial`: 3 of 22 planned
   actions could not be re-identified in the live DOM, and QA reported
   `visibleTargetMismatch: 2`. I did not chase these; they are outside the responsive scope
   of this lane.
8. **The apex host** — `https://xn--ok0b408a79cba430b.net/` resets TLS, so no stage could run
   against the exact URL in the brief (§0).

Nothing timed out and nothing had to be retried, so there is no resource-contention
measurement missing from this report.

---

## 9. Review pack

`docs/result/28.6/review/wix-idn/` — 20 PNGs, **17 MB**, all 10 pairs kept (source + clone
for each). No MINOR pair was dropped. See the README there for what to look at in each.

## 10. One-paragraph summary

The pipeline ran clean end to end on the pool's only inline-CSS, builder-generated,
punycode-IDN site, and the punycode host and percent-encoded hangul routes survived every
stage. The three engine changes this lane was meant to validate produced three different
kinds of result: the **@container capture is a clear pass** (6 declarations captured across 2
conditions, none recorded as unconditional, `groupingRulesSkipped: 0`); the **parent
content-box measurement is a clean negative control** (587 measurements, 0 disagreements, max
0.00 px — correct, because both of this site's trees are frozen-width) that is nevertheless
**invisible in the artifact** because five counters never reach the manifest; and the
**mobile-probe parameterisation half-worked** — the mobile pass now runs (5/7 pages, 7/7 when
unblocked) and still emits zero rules, because a `width=320` viewport meta pins the layout
viewport and 649 of 649 nodes have identical width at every probe width. The tree switch did
snap off the 915 midpoint, to 481 — but from a candidate pool of exactly one, drawn from a
6-declaration matched-element histogram, while the same capture's whole-stylesheet census
knew about 15 conditions including the `min-width: 980px` that is this site's real divide,
and the chosen candidate has `observedChange: 0` on all 7 pages. The dominant defect is
simpler than any of that: `no-branch-matched` took **91.1%** of all candidates and the clone
therefore ships 210 boxes at a frozen `width: 1440px`, which is four of the eight BLOCKERs
(`footer-clipped` at 1024 and 1100 on both routes) and which the probe-width cap made
unfixable on the homepage by evicting 1440 from its own probe set. The remaining BLOCKERs are
35% missing text from a Wix Blog widget the observation never saw populate despite reaching
network idle, and two 390-px `nav-link-ratio` pairs where the grader's non-mobile capture
profile makes a UA-switching source and a media-query clone disagree while both behave
correctly. All of it is trustworthy because the self-check floor came back **10/10 PASS with
every channel at 0.00** — the cleanest floor in the corpus, and the reason no number in this
report can be argued away as instrument noise.
