# 03 — Reconstruction / Generator Responsive Trace (SiteSpec → Plan → Layout Inference → CSS + DOM)

Date: 2026-09-14 · Mode: READ-ONLY code trace (no `src/`, `data/`, git changes; reconstructor not re-run)
Scope: second half of the responsive data flow. Observer / SiteSpec compile is covered by another report.
Artifact verified: `data/apartmentary.com/reconstructions/2026-09-14T05-01-12-931Z`
(SiteSpec `data/apartmentary.com/site-specs/2026-09-14T04-58-45-517Z`).
Helper scripts: `tmp/wr-resp-audit/recon-trace/` (`split_pipeline.py`, `count_css.py`, `check_candidates.py`, `props.py`;
outputs `pipeline-reconstructed.css`, `manual-patch-tail.css`, `css-census.json`).

NUL-byte note: `src/reconstruction/style-generator.ts:51` holds one literal NUL inside a regex; `src/sitespec/validate-sitespec.ts` holds 2. All greps used `grep -a`.

---

## 0. One-paragraph summary

The generator does **not** carry the source's responsive CSS forward. Every element gets an exact-computed class
(`.wr-stNNN`) whose values are the browser's **used px at 1440 (desktop tree) or 390 (mobile tree)**. Responsiveness is
then re-derived by (1) a **two-tree step switch** fixed by product policy at **801px**, (2) a **recovered-layout tier**
of per-node `[data-wr-page][data-wr-viewport] [data-wr-node]` rules that only ever relax **inline size** (width /
max-width / min-width / margin-inline / grid-template-columns) or hide a node in a band, and (3) an
**authored-inline-size** fallback that re-emits a narrow subset of the source's own width-family declarations when they
hold across the whole served range. Geometry rules are browser-verified only at **1440 / 390**; the multi-width residual
audit is report-only. No source class, id or data-* attribute reaches the generated DOM, so no source stylesheet can be
reused. Between probe widths the CSS is a set of constants plus step `@media` edges — there is no interpolation.

---

## 1. Stage-by-stage trace

### 1.1 Input load — `src/reconstruction/load-input.ts`
- EXISTS: SiteSpec, per-page PageSpec (both viewports, `layoutProbe`, `layoutProbeMobile`, `authoredLayout` on nodes,
  `authoredBreakpoints` histogram per viewport, `customProperties`), style catalog, asset/interaction specs.
- PRESERVED/TRANSFORMED/DISCARDED: nothing decided; pure loader.

### 1.2 Reconstruction plan — `src/reconstruction/plan-reconstruction.ts`
| Step | file:line | What happens |
|---|---|---|
| Breakpoint plan | `plan-reconstruction.ts:206-212` | `inferResponsivePlan(siteSpec, {pages})` → `responsive.site` is the served number |
| Runtime pages compiled | `:301-323` | `compileRuntimePage` per used page (both trees) |
| Exact CSS tier | `:347-359` | `generateStylesheet` over used tokens + tx/sf variants + canvas |
| Custom props | `:377-407` | per page×viewport scopes; same admission predicates fed to layout inference (var() resolution) |
| Layout inference | `:425-441` | `inferLayoutRules({pages, breakpoint: breakpoint.value, breakpointByPageId: responsive.byPageId, mobileTruthWidth, customPropertiesByPage})` |
| Limitations | `:452-481` | `breakpoint-inferred`, `tree-switch-dom-width-not-observed` (dual-dom), `variant-tree-not-observed` |

- PRESERVED: authored breakpoints and authoredLayout travel into inference as evidence.
- TRANSFORMED: breakpoint inference answer is demoted to evidence; policy number is served.
- DISCARDED: nothing at this layer beyond what the called modules discard.

### 1.3 Route plan — `src/reconstruction/route-plan.ts`
No breakpoint / media logic (grep: 0 hits). Routes → render-source pageId only. **No page-family breakpoint concept.**

### 1.4 Responsive plan (tree switch number) — `src/reconstruction/responsive-plan.ts`
- `V1_RESPONSIVE_POLICY = {mobileMaxPx: 800, desktopMinPx: 801, mobileTruthPx: 390, desktopTruthPx: 1440}` — `:85-94`.
- Operator override `--breakpoint N` returns early, site-wide, no per-route map — `:178-203`.
- Inference still runs: `chooseTreeSwitch(...)` — `:205-209`.
- Served value = policy 801 clamped to `(mobileObservedWidth, desktopObservedWidth]` — `:221-226`; `provenance: "product-policy"`, inference kept as `inferredAuthoredPx` — `:232-265`.
- **`byPageId` is deliberately EMPTY under the policy** — `:282` (docstring `:267-281`). Per-route decisions only go to `records` (manifest evidence) — `:285-303`.
- Media strings: desktop `(min-width: Bpx)`, mobile `(max-width: B-0.02px)` — `breakpointMediaQueries` `:322-330`.

### 1.5 Tree-switch inference (evidence only under V1) — `src/reconstruction/tree-switch.ts`
- Candidates = authored breakpoint histogram of each page's DESKTOP viewport, folded to `above` edge (`authoredEdgePx`, `layout-inference.ts:6912-6914`), clamped to `(390, 1440]` — `aggregateAuthoredCandidates` `:542-582`.
- Probe geometry corroboration only for tight (≤1px) probe brackets — `measureObservedChange` `:600-690` (`TIGHT_BRACKET_MAX_PX=1` `:116`).
- DOM-family fingerprint change (rendered/elements ≥5% & ≥8, or same-size structure hash) — `familyChangeVerdict` `:321-341`, `measureFingerprintChange` `:714-775`.
- Ranking: observed family swaps first (biggest swap), then geometry-corroborated, largest change, heaviest authored weight, nearest midpoint, smallest px — `rankTreeSwitchCandidates` `:797-814`, `rankFamilyChangeCandidates` `:837-849`, `rankWithFingerprint` `:862-879`.
- Fallback: `floor((390+1440)/2)=915` with named `fallbackReason` — `:994`, `:1096-1113`.
- Per-route: same steps per page — `decidePageTreeSwitch` `:899-983`; site default decided first `:1073`.
- **Per-route IS computed; per-route is NOT served** (byPageId empty, §1.4).

apartmentary: inferred 900 (`authored-breakpoint`, `familyChangeObserved: true`, `domSwitchWidthObserved: true`, all 7 routes `ownDecision` 900), **served 801**. Candidates 900 (weight 405, observedChange 1975, family swap 59), 600, 1200.

### 1.6 Layout inference — `src/reconstruction/layout-inference.ts` (7,253 lines)

Declared priority (docstring `:63-68`): recovered rule (0,3,0) > banded @media rule (same specificity) > exact `.wr-st` (0,1,0).

**Pass structure (per page × viewport)** — `:5238-6601`
1. `resolveViewportProbe` — `:4504-4540`. The probe widths are split at the **served** breakpoint (801), not at the
   inferred/observed switch: desktop uses widths `>= 801`, mobile `< 801` — `:4525-4531`. Requires the truth width
   (1440 / 390) to be one of them — `:4534-4538`. `TRUTH_WIDTH = 1440` `:77`, `MOBILE_TRUTH_WIDTH = 390` `:130`.
   apartmentary desktop variant widths: `899, 900, 1024, 1100, 1199, 1200, 1440, 1535, 1536, 1920`; mobile: `390, 480, 599, 600, 700, 768`.
2. Authored histogram per page — `resolveAuthoredBreakpoints` `:7170-7189`, used at `:5336`.
3. Grid phase: `recoverGridTracks` (single relation at every width) → emits `minmax(0, <n>fr)` normalised weights
   (`:3424`), never the authored `repeat()` text (`:3056-3060`); on `tracks-not-reproducible-at-every-width` only →
   `recoverGridTracksBanded` with midpoint edges snapped to authored (`:4036-4072`), emitted under `bandMedia` — `:5374-5530`.
4. Per-node funnel (probe-gated) — `:5532-6488`:
   - truth-sanity gate (probe@truth vs deep observation ±4px) `:5598-5611`;
   - **responsive-hidden** bands (visible at truth, hidden at other variant widths): `hiddenBands` midpoints `:6805-6857`
     → `snapBandEdges` `:7058-7144` → `display:none` under `bandMedia` `:5616-5704`;
   - hidden at truth → dropped `:5705-5714`; non-blockish display → dropped `:5716-5725`;
   - `centered-max-width` (width constant + centered at ≥2 constrained widths) → **measured px** `max-width`
     `Math.round(max(widthValues) - padding)` + `margin-left/right:auto` + `width:auto|%` `:6155-6238` (value `:6194-6196`);
   - capped-fill centered `:6240-6333` (px cap from `max(probe w)` `:6257`, `:6289`);
   - `full-width` → `width:auto` (or measured %) `:6335-6392`;
   - `percentage-width` → **measured mean ratio** `width: NN.NN%` `:6394-6470` (`:6450`);
   - refusal exits in order `inset-resolved-width` → `tracked-fill-width` → `viewport-bleed-width`
     (`width:100vw` / `calc(50% - 50vw)` `:2297-2328`) → `grid-area-fill-width` (`width:auto; min-width:0px` `:4410`)
     → `damage-clamped-width` (`max-width:100%` or `calc(100% - Npx)` `:2564-2593`) — `:5866-6063`, `:6482-6487`;
   - else `no-branch-matched` → frozen px ships.
5. Residual audit candidates (source moved ≥8px, report only) — `:6505-6600`.
6. **Authored inline-size fallback** (not probe-gated) — `:6630-6725`:
   - only for nodes that NO earlier rule gave any of `width|max-width|min-width|margin-left|margin-right|margin-inline|grid-template-columns` (`inlineSizeAnswered` `:6644-6653`; allowlist `:4582-4590`);
   - served range: mobile `[0, B-0.02]`, desktop `[B, ∞)` with B = 801 — `:6655-6658`;
   - value shapes admitted `:4874-4908` (`%`, vw/vh, em/rem, `calc|min|max|clamp|fit-content(`, intrinsic keywords; px only for max-/min-width; grid needs fr/repeat/minmax/auto-fit/%; margins need `auto`);
   - `var()` resolved **only for the admission test**, emitted text is verbatim `:4807-4871`, `:4993-5011`;
   - `@media` must hold across the **whole** served range, else `media-partial-range` `:4726-4769`, `:5017-5024`;
   - pre-check vs truth box (`width:%` within 1% of observed ratio; caps not below truth) `:4911-4936`;
   - last admissible declaration per property wins (cascade order assumed) `:5043-5049`;
   - adds `width:auto` when only a cap was authored `:5084-5094`.
7. CSS emission — `generateLayoutCss` `:7222-7253`: selector
   `[data-wr-page="p"][data-wr-viewport="v"] [data-wr-node="n"]`, wrapped as `@media <rule.media> {…}` when banded. `bandMedia` `:7206-7219` writes `(min-width: Npx)` / `(max-width: N-0.02px)`.

### 1.7 Truth check — `src/reconstruction/layout-truth-check.ts`
- Populations: banded display rules, banded geometry, unbanded geometry — `:999-1007`.
- Geometry rules measured at the pass's own observed width only: `runtimePage[viewportId].width` (1440 / 390) — `:1121-1122`, `:1281`, `:1310-1313`.
- Reject rule: `errorWith > 4px AND errorWith > errorWithout + 0.5px` — `:1393-1396`; up to `MAX_ROUNDS = 4` `:137`, non-convergence → drop `:1428-1440`.
- Banded `display:none` rules: must NOT hide at truth width (`:1453-1509`) and MUST hide at `band.verifyWidth` (one observed-hidden probe width) — `:1591-1597`, `:1620-1633`.
- Residual audit renders ≤4 extra probe widths (`auditRenderWidths` `:949-965`) but is **report-only** (`:1084-1091`; `generate-app.ts:539-545`).
- `acceptedUnchecked` is non-zero only when `enabled === false` (`status: "disabled"`) — `:1102-1107`. Every other unverifiable rule is REJECTED (`rejectedUnverifiable`, derived `:1070-1071`).

### 1.8 Style generator (exact tier) — `src/reconstruction/style-generator.ts`
- `.wr-stNNN{<every whitelisted computed property>}` emitted verbatim, sorted — `:484-493` (docstring `:8-21`: "style truth is the browser's FINAL COMPUTED value").
- Text-box relief variants `.wr-stN.wr-tx{height:auto;min-height:<frozen px>}` / `.wr-stN.wr-sf{width:auto}` (0,2,0) — `:500-517`.
- Document roots `.wr-doc-stN` drop width/height/min/max — `:177-184`, `:540-554`; canvas background re-homed to `html:has([data-wr-page])` — `:569-606`.
- Source `:root` custom properties scoped `[data-wr-page][data-wr-viewport]{--x:…}` — `:771-774`.
- **No `@media` is ever emitted by this module.**

### 1.9 Stylesheet assembly & globals — `src/reconstruction/generate-app.ts`, `app-template.ts`
- `globals.css` = reset + the two variant media queries — `generate-app.ts:206`; `app-template.ts:379-389`
  (`@media (max-width: 800.98px){[data-wr-viewport="desktop"]{display:none}}`, `@media (min-width: 801px){[data-wr-viewport="mobile"]{display:none}}`); per-route pairs only if `routeOverrides` non-empty `:316-349` (empty under V1).
- `generated-styles.css` = custom props + exact tier + pseudo + observed-target CSS (`generate-app.ts:234-243`) + truth-checked recovered tier appended last (`:274-280`).

### 1.10 DOM emission — `compile-node.ts`, `react-attributes.ts`, `relations.ts`, `runtime-template.ts`
- Identity: `data-wr-node = nodeId` on every element — `compile-node.ts:448`.
- Class: only `wr-stNNN` (+ `wr-tx`, `wr-sf`) — `compile-node.ts:460-496`; doc roots `wr-doc-stNNN` + `data-wr-doc-tag` `:804-811`.
- Ids: only generated `wr-<page>-<viewport>-<node>` when an IDREF needs one — `compile-node.ts:449-452`, `relations.ts:30-37`.
- Source attributes: SiteSpec vocabulary contains **no `class`, `style`, `id`, `data-*`, `on*`** — `react-attributes.ts:28-30`; remaining attrs adapted/passthrough `compile-node.ts:525-533`.
- Wrappers: two `div.wr-variant[data-wr-viewport][data-wr-page][data-wr-route…]` siblings — `runtime-template.ts:322-337`; `<html>/<body>` become divs; `span.wr-svg-host`, `.wr-nest` helpers inserted.

---

## 2. Question answers

### Q18 — Do authored relational values survive into plan and generated CSS in original form?

| Authored value | In plan (SiteSpec evidence)? | In GENERATED CSS in original form? | Where flattened / decided |
|---|---|---|---|
| `width: 85%` | YES (`authoredLayout`) | **PARTIAL** — only via authored-inline-size and only if no earlier rule touched the width family and ratio matches truth ±1%. apartmentary `p000001/n000528` authored 85% → pipeline shipped only `max-width:100%` (damage clamp) → `alreadyRecovered` blocked 85%; exact tier `width:1224px`. | exact tier: computed px (`style-generator.ts:484-493`); block: `layout-inference.ts:6644-6653`, `:4949` |
| `repeat(3, 1fr)` | YES | **NO** from measurement (emits `minmax(0, <n>fr)` from observed child geometry, `:3424`, `:4030`); authored text only via authored-intent `grid-template-columns` (`:4657`, `:4882-4884`). Exact tier ships used px track list. apartmentary: 0 grid rules (flex site). | `:3056-3060` authored stylesheet not read for tracks |
| `clamp()`, `calc()`, `min()/max()` | YES | **PARTIAL** — width/max-width/min-width only (`AUTHORED_FUNCTION` `:4648`). For padding/height/top/left/font-size/gap: **NO** (not in allowlist `:4582-4590`). Generator-minted `calc(100% ± Npx)` exists (damage clamp / bleed). apartmentary pipeline CSS: clamp 0, min()/max() 0, calc 17 (all recovered tier). | allowlist |
| `vw/vh` | YES (e.g. `top`, `height`, `padding` in vw on apartmentary) | **PARTIAL** — width-family only (9 × `min-width: 1.135vw` on apartmentary); `height/top/padding` vw → frozen px | allowlist |
| `max-width` | YES | **PARTIAL** — px caps and `%` admitted if unconditional or media holds over `[801,∞)`/`[0,800.98]`; measured `centered-max-width` emits **measured px**, not authored (`:6194`, `:6289`). apartmentary: `max-width:media-partial-range` 729 refusals (MUI `33.3333% @ (min-width:900px)`), and the unconditional `max-width:100%` is emitted instead → wrong at ≥900 (`n000700`). Exact tier keeps computed max-width (px or %: 114 tokens with %). | `:4726-4769`, `:5017-5024` |
| `margin: auto` / `margin: 0 auto` | YES | **PARTIAL** — exact tier `margin-left` is **used px** (1440 of 1440 tokens px). Recovered `margin-left/right:auto` only from measured centering (6 decls) or authored longhands; the `margin` shorthand is not admissible (1243/1225 `margin-not-auto` refusals). `n000166` (authored `max-width:1920px; margin:0 auto`) shipped `width:auto` only → left-aligned above 1920. | exact tier; `:4886-4891` |
| flex values (`flex`, `flex-basis`, grow/shrink) | YES | **PARTIAL** — computed `flex-basis` keeps `%` in exact tier (92 tokens) but at 1440 values; authored `flex` / media-scoped flex-basis never re-emitted; flex items refused (`flex-item-main-axis` 111, `flex-item-basis-governed` 181). | exact tier / guards |
| height, top/left/right/bottom, padding, gap, font-size, transform | YES | **NO** — no recovered kind emits them (kinds `:132-225`); frozen px only (exact-token px: height 1437, top 355, left 349 tokens) | — |

Flattening point in THIS half of the pipeline: none converts authored → px; the used-px values arrive already flattened in the
style catalog and `style-generator.ts:484-493` ships them verbatim. The reconstruction layer's decision points that
**fail to restore** authored intent are `resolveViewportProbe` split `:4525-4531`, the per-node funnel constancy tests
(`:6156-6174`, `:6261-6264`, `:6336-6340`, `:6395-6410`), `alreadyRecovered` `:6644-6653`, and `authoredMediaHolds` `:4726-4769`.

### Q21 — source `class` attribute in generated DOM? **NO**
`react-attributes.ts:28-30` (not in SiteSpec vocabulary); `compile-node.ts:460-496` sets only `wr-*`. Artifact: className values = `wr-stNNN` 6,437, `wr-tx` 3,440, `wr-sf` 596, `wr-doc-stNNN` 28; grep for `css-w16pwn|MuiBox-root|MuiGrid` in `app/{.next,src,app,reconstruction-data,public}` → 0 hits. Source class names survive only as `authoredLayout[].selector` evidence in the SiteSpec (e.g. `.css-w16pwn`).

### Q22 — data-* identity in generated DOM? **YES (generated), NO (source)**
Runtime props census (7 pages): `data-wr-node` 6,474, `data-wr-doc-tag` 28, `data-wr-unknown*` 16×3, `data-wr-demoted` 10; wrappers carry `data-wr-page/viewport/route/render-coverage/…` (`runtime-template.ts:322-337`). `id` 88, all `wr-p…-n…`. No source `data-*`.

### Q23 — could an original source stylesheet selector match the generated DOM? **Effectively NO (only tag/ARIA/type-level selectors could)**
- Class selectors (Emotion `.css-xxxx`, `.MuiGrid-item`): no source classes → no match.
- `#id` selectors: source ids replaced by generated ids → no match.
- `[data-*]` source selectors: absent → no match.
- Structural combinators: tag names preserved, but extra wrappers (`div.wr-variant` ×2, `html/body` → `div[data-wr-doc-tag]`, `span.wr-svg-host`, `.wr-nest`) and dual trees break `>`/`:nth-child`/`body > …` paths.
- Only bare element / attribute-vocabulary selectors (`*, ::before`, `a`, `p`, `[type=button]`, `[role]`, `[aria-hidden]`) could match; they would hit both trees at once.

### Q24 — authoritative source of breakpoints and actual priority in code
Two distinct decisions exist.

**(A) Tree switch (which observed tree is visible):**
1. Operator `--breakpoint N` — `responsive-plan.ts:178-203` (returns early).
2. **Product policy 801** (clamped into `(390,1440]`) — `responsive-plan.ts:221-235` → served in `globals.css` `app-template.ts:379-389`.
3. Evidence only (not served): route tree switch & site inference — family fingerprint swap > probe geometry change > authored weight > nearest midpoint > smallest px (`tree-switch.ts:797-879`), fallback midpoint 915 (`:1096-1113`). Per-route result → `records` only (`responsive-plan.ts:282-303`).

**(B) Per-node band edges inside a tree (`display:none`, banded grid tracks):**
1. Browser observation defines WHETHER a band exists and its bracket (probe v/w arrays on the variant side of 801) — `layout-inference.ts:5616-5623`, `:6805-6857`.
2. Source authored breakpoint inside that probe gap (heaviest weight > nearest midpoint > smallest) — `snapBandEdges` `:7058-7144`, `chooseAuthoredEdge` `:6969-6992`.
3. Inferred midpoint of the two probe widths when no authored edge lies in the gap — `:7081-7102`.
4. Open edge when no neighbour → band extends to the tree-switch edge — `:6824-6826`, `:6848-6855`.

**(C) Authored `@media` for authored-inline-size:** accepted only if it holds over the whole served range derived from 801 — `:6655-6658`, `:4726-4769`.

So: **policy > (observation+authored snap per node) > midpoint**; source authored CSS never overrides the policy, and the route tree switch is not served.

### Q25 — breakpoint support grain
| Grain | Answer | Evidence |
|---|---|---|
| Global | **YES** | policy 801 `responsive-plan.ts:85-94`, globals `app-template.ts:379-389` |
| Route | **NO (served) / PARTIAL (code path exists)** | `byPageId` empty `responsive-plan.ts:282`; machinery `app-template.ts:316-349`, `layout-inference.ts:5274-5275` |
| Page-family | **NO** | no family concept in `route-plan.ts` / responsive plan |
| Subtree / node | **PARTIAL** | per-node `@media` only for `display:none` and `grid-template-columns`(+`column-gap`) — `:5471`, `:5679`; no banded width/max-width/margin/padding/height |

### Q26 — behaviour at unobserved widths
- **No interpolation anywhere.** Every recovered value is a constant (`width:auto`, measured `NN.NN%`, measured px `max-width`, `minmax(0,Nfr)`), and every exact value is a 1440/390 constant. Pipeline CSS has 0 `clamp()`, 0 `min()/max()`.
- **Step functions only**: tree switch at 801; band edges at snapped/midpoint px (apartmentary: 17 × `(max-width: 899.98px)`, 2 × `(max-width: 1319.98px)` midpoint of 1200/1440).
- **Extrapolation**: desktop-tree rules inferred from 899–1920 are applied unchanged at 801–898 and >1920; mobile-tree rules from 390–768 at 769–800.98 (and <390). All 19 apartmentary bands have an open lower edge (`bandEdgesOpen 19`) → they run down to 801.
- Between probes, nodes with no recovered rule (apartmentary `no-branch-matched` 1,797 + pre-stage drops 1,897 + guard/width-mode refusals 261) keep 1440/390 px.
- Relative units that do survive (`width:auto`, `%`, `vw`) resolve continuously, but inside ancestors that are frozen px they cannot.

### Q27 — widths at which the truth check runs
- Unbanded geometry rules (all width kinds incl. authored-inline-size): **1440 (desktop) / 390 (mobile) only** — `layout-truth-check.ts:1281`, `:1393-1396`.
- Banded `display:none`: truth width (must not hide) + `band.verifyWidth` (an observed-hidden probe width; apartmentary 7 renders, e.g. 899 / 1200) — `:1453-1509`, `:1591-1633`.
- Banded geometry: `verifyWidth` — `:1604-1610`.
- Residual audit: ≤4 probe widths per pass (apartmentary desktop 899/1100/1200/1920; mobile 480/599/700/768; `residualAuditWidthsCapped 42`) — **report-only, never rejects** (`:1084-1091`).
- Never rendered: 801–898, 1025–1099, 1201–1439, >1920, 769–800.

Unverified rules: rejected (`rejectedUnverifiable`), except `status:"disabled"` → `acceptedUnchecked`. apartmentary: `truthCheckStatus verified`, `acceptedUnchecked 0`, `rejectedUnverifiable 0`, `rejectedByTruthCheck 37` (authored-inline-size 36, full-width 1), `acceptedRules 3105`.

---

## 3. CURRENT PRIORITY ORDER the production code follows for a node's CSS at width W

1. **Tree visibility**: `W <= 800.98` → mobile tree, `W >= 801` → desktop tree (both mounted, inactive `display:none`). Operator `--breakpoint` > product policy 801 > (inference = evidence only). `responsive-plan.ts:178-235`, `app-template.ts:379-389`.
2. **Recovered-layout tier** `[data-wr-page][data-wr-viewport] [data-wr-node]` (0,3,0), appended last, only truth-check survivors (`generate-app.ts:274-280`, `layout-inference.ts:7240-7250`). Per node, which kind exists is decided by funnel order:
   2a. grid-track-columns → banded grid tracks (`:5374-5530`);
   2b. responsive-hidden `@media` band (additive, `:5616-5704`);
   2c. centered-max-width → capped-fill centered → full-width → percentage-width (`:6155-6470`);
   2d. refusal exits: inset-resolved → tracked-fill → viewport-bleed → grid-area-fill → damage-clamp (`:5866-6063`, `:6482-6487`);
   2e. authored-inline-size, only if nothing above set a width-family property (`:6630-6725`, `:6644-6653`).
   Banded rules match only inside their `@media` (edges: authored snap > probe midpoint > open).
3. **Pseudo rules** `[data-wr-page][data-wr-viewport] [data-wr-node]::before/::after` (frozen computed, e.g. `width:390px`) and observed-target interaction CSS (`generate-app.ts:241-243`).
4. **Text-box relief** `.wr-stN.wr-tx` / `.wr-stN.wr-sf` (0,2,0) — `style-generator.ts:500-517`.
5. **Exact computed token** `.wr-stN` (0,1,0), used px at 1440 / 390 — `style-generator.ts:484-493`; doc roots `.wr-doc-stN` minus box geometry `:540-554`.
6. **Custom properties** (inherit via `var()` only) — `style-generator.ts:771-774`.
7. `globals.css` reset (`html, body {margin:0; padding:0}`).
(Source authored CSS: never applied directly; only feeds 1-evidence, 2b edges, 2e values.)

---

## 4. Artifact census — apartmentary `2026-09-14T05-01-12-931Z`

### 4.1 Manifest facts
- `config.inferredBreakpoint`: `value 801`, `provenance product-policy`, `inferredAuthoredPx 900` (`authored-breakpoint`), `treeDivergence dual-dom`, `domSwitchWidthObserved true`, `pagesWithFingerprint 7`. `routeBreakpoints`: all 7 pages → 900 own decision, not served. `variantTreeNotObserved`: none.
- Probe widths (SiteSpec): desktop `390,599,600,700,768,899,900,1024,1100,1199,1200,1440,1535,1536,1920`; mobile `390,480,599,600,700,768,899,900,914,1199,1200`. Authored histogram per page: `min 600/900/1200/1536`.
- `viewportPassesUsed desktop 7 / mobile 7`; `inlineSizeCandidates 4549`: full-width 2369, no-branch-matched 1797, refused-guard 182, damage-clamp 107, refused-width-mode 79, percentage 14, centered 1. Pre-stage drops: truth-sanity-mismatch 909, hidden-at-truth 782, display-not-blockish 206.
- `bandEdgesSnapped 17`, `bandEdgesKeptMidpointNoAuthoredInGap 2`, `bandEdgesOpen 19`.
- `authoredIntentEmitted desktop 372 / mobile 260`; refusals: `already-recovered 2470`; declaration refusals: `max-width:media-partial-range 729`, `margin-*:margin-not-auto 2468`, `width:value-frozen-px 272`.
- Truth check: `verified`, `truthCheckable 3123`, rounds 23, `acceptedRules 3105`, `acceptedUnchecked 0`, `rejectedUnverifiable 0`.
- Residual audit (report-only): `residualFrozenNodes 168 (+1589 omitted)`, families `width 1757`, consequences `offscreen 415`.

### 4.2 Patch boundaries in `app/public/wr/generated-styles.css` (12,750 lines, 4,126,348 B)
| Region | Lines | Nature |
|---|---|---|
| Pipeline | 1–12404 | generated, but with in-place manual edits (below) |
| Fluid-desktop supplement | 12406–12478 | manual, appended (`.wr-st000129`, `.wr-st000132`, `/service` hero n000051/52/53) |
| LAYOUT-MODE PROTOTYPE | 12479–12750 | manual, appended (p000001 desktop A–E modes) |

In-place edits inside the pipeline region (reversed by `split_pipeline.py`/`count_css.py`):
- fluid-desktop inserted `width:100%|auto` into 41 damage-clamp blocks (`max-width:100%` only) on p000001/p000006 desktop, `height:auto` into 2 × `n000050`;
- fluid-desktop **removed** 2 pipeline blocks (`p000001 n000053 {width:auto}`, `p000006 n000101 {width:100%}`);
- layout-modes changed 2 values (`n000170` → `width:auto`, `n000528` → `width:85%`), marked with comments.
- `p000001/n000700` and `p000006/n000398` (`max-width:100%; width:auto`) are pipeline-original (authored-inline-size with `widthAutoAdded`; their authored `max-width:33.3333%` sits under `(min-width:900px)`).

**Validation: the reconstructed pipeline stylesheet is 4,109,264 bytes = manifest `generatedFiles` size, byte-exact; 3,105 recovered blocks = manifest `acceptedRules`.**

### 4.3 Counts — PIPELINE-GENERATED part
- `@media` blocks: **19** in `generated-styles.css`; unique conditions **2**: `(max-width: 899.98px)` ×17 (edge snapped to authored 900, lower edge open), `(max-width: 1319.98px)` ×2 (midpoint of 1200/1440). All are `responsive-hidden` `display:none`. Plus `globals.css`: `(max-width: 800.98px)`, `(min-width: 801px)`.
- Rules: exact tokens 1,440; tx/sf variants 1,012; recovered blocks 3,105; pseudo 44; doc-root / canvas / custom-prop small.
- Declarations: 182,476 total (exact-token 175,680; recovered 3,573; textbox-variant 1,870; pseudo 880; doc-root 454).

| Declaration shape | Exact tier `.wr-st` | Recovered tier | Text-box variants |
|---|---|---|---|
| `%` (any) | 6,005 (5,760 are background/mask/object-position; layout: max-width 114, flex-basis 92) | 472 (max-width 324, width 148) | 0 |
| `fr` | 0 (`grid-template-columns: none` ×1440) | 0 | 0 |
| `vw/vh` | 0 | 9 (`min-width:1.135vw`) | 0 |
| `clamp()` | 0 | 0 | 0 |
| `calc()` | 0 | 17 (`width: calc(100% + Npx)`) | 0 |
| `min()/max()` | 0 | 0 | 0 |
| `margin auto` | 0 (margin-left px ×1440) | 6 | 0 |
| `width:auto` | 2 | 2,823 | 154 (`wr-sf`) |
| px `width` | 1,437 | 0 | — |
| px `height` | 1,437 | 0 | — (858 `min-height` px restated) |
| px `left` / `top` / `right` / `bottom` | 349 / 355 / 349 / 349 | 0 | — |
| px `min-width` / `max-width` | 906 / 20 | 238 / 1 | — |

### 4.4 Counts — MANUAL patch tail (lines 12406–12750)
- `@media` blocks 3: `(max-width: 1199.98px)` ×2, `(min-width: 1920px)` ×1.
- 83 declarations (77 node-scoped, 6 class-scoped); 32 node-rule blocks (90 selectors: 87 p000001 desktop, 3 p000006 desktop), 4 `.wr-st` class rules.
- Shapes: `%` 17, `calc()` 5, margin auto 4, `width:auto` 10, px width 5, px right 2, px height 1, px bottom 1.

### 4.5 Source class names in app DOM/TSX
0 occurrences of Emotion/MUI class names in runtime data, TSX, `.next`, `public` (comments in the manual CSS mention `MuiBackdrop-root` only as prose).

---

## 5. Root causes (code) for continuous resize breaking between probe widths

1. **Served tree switch ≠ observed DOM switch.** Policy serves 801 (`responsive-plan.ts:221-235`) while the same run observed the family swap at 900 on apartmentary. 801–899 shows the 1440-observed desktop tree where the source renders its <900 layout; the 390-observed mobile tree is stretched to 800.
2. **Probe axis split at the served number, not at the source's switch** (`layout-inference.ts:4525-4531`): the desktop pass includes 899 (a source <900 layout sample), so constancy tests fail or produce open-downward `display:none` bands (`(max-width: 899.98px)` ×17) — a hybrid tree never observed.
3. **Exact tier is used px at one width for every property** (`style-generator.ts:484-493`); anything not relaxed stays frozen (on apartmentary ≈3,950 of 6,446 probed nodes got no measured inline-size rule: 1,797 no-branch-matched + 1,897 pre-stage drops + 261 guard/width-mode refusals; authored-inline-size then answered 596 nodes across all element nodes).
4. **One relation must hold at every variant probe width** (`:6156-6174`, `:6261-6264`, `:6336-6340`, `:6395-6410`); relations that change per authored band (600/900/1200/1536) are refused. Only `display:none` and grid tracks have banded forms — no banded width/max-width/margin/padding/height.
5. **Only inline size is ever relaxed** (kinds `:132-225`, allowlist `:4582-4590`); height, top/left/right/bottom, padding, gap, font-size, transform, min-height remain 1440/390 px (height 1,437, top 355, left 349 tokens).
6. **Authored intent is blocked or rejected where it matters**: `alreadyRecovered` (2,470 nodes; e.g. damage-clamp `max-width:100%` blocks authored `width:100%` on `n000005` and `width:85%` on `n000528`) `:6644-6653`; media conditions must hold across the whole `[801,∞)` range → MUI grid `33.3333% @900` refused (729) and the unconditional `max-width:100%` shipped instead (`:4726-4769`); `margin` shorthand not admissible.
7. **Measured values re-emitted as constants**: centered `max-width` = measured px (`:6194`, `:6289`), percentage = mean ratio (`:6450`), grid = normalised fr from 1440-era geometry; no clamp/min/max synthesis → no interpolation, pure extrapolation outside 899–1920 / 390–768.
8. **Verification blind spot**: geometry rules verified only at 1440/390 (`layout-truth-check.ts:1281`, `:1393-1396`); the multi-width residual audit is report-only (`:1084-1091`), so a rule that is correct at 1440 and wrong at 1024 always ships.
9. **Source CSS cannot be reused**: no source class/id/data-* in DOM (`react-attributes.ts:28-30`, `compile-node.ts:460-496`) and dual-tree wrappers change structure — the only responsive knowledge available is what the generator re-derives.

## 6. Remaining risks / notes for next step
- Byte-exact pipeline reconstruction depends on the two fluid-desktop "removed block" facts from `docs/result/apartmentary-fluid-desktop/02-fix-implementation.md` §5; byte and rule-count equality with the manifest confirms them.
- Code comments in `layout-inference.ts:24-26` still describe probe widths as `390/768/1024/1440/1920`; the actual apartmentary probe list differs (authored-breakpoint-bracketed widths). Code wins; docstring stale.
- `responsive-qa` default QA widths are `[390, 700, 1024, 1100, 1440]` (`src/responsive-qa/types.ts:48`) — independent of the generator's truth check.
