# 28.75 §CANVAS — downstream fallout in `smoke-theme` and `smoke-reconstruction-qa`

**Scope.** Two suites regressed against fully-green previous-wave baselines:
`smoke-theme` 47 → **40/47** and `smoke-reconstruction-qa` 211 → **207/211**.
Eleven failing checks. This document classifies each one, names the real cause at
`path:line`, and records the negative controls that prove no check was made
vacuous.

**Verdict.** The orchestrator's hypothesis — that §CANVAS's
`resolveDocumentRootCanvas()` re-homing is behind both suites — is **correct**,
but the two suites are *opposite* outcomes and must not be treated the same way:

| suite | checks | split | who is at fault |
|---|---:|---|---|
| `smoke-theme` | 7 | **6 × (b)**, 1 × (a) | **production**, `src/theme/` — the theme layer was never taught about the re-homed canvas and silently lost the ability to see, name or theme it. The single (a) is a selector allowlist that predates the new generated shape. |
| `smoke-reconstruction-qa` | 4 | **4 × (a)** | **the fixture** — it manufactured its canvas mismatch out of the very generator bug §CANVAS cured |

So the same upstream change produced one genuine product defect and one honestly
obsolete test premise. Classifying all eleven the same way in either direction
would have been wrong — treating the six theme (b)s as stale tests would have
buried a contrast safety gate that had stopped firing.

---

## 1. What §CANVAS actually changed

`src/reconstruction/style-generator.ts:279` `resolveDocumentRootCanvas()` now
applies CSS 2.1 §14.2 canvas propagation: the observed root's (else the body's)
background is **moved** off the in-flow `.wr-doc-*` wrapper rule and emitted once
per page on the real `html` element, scoped as
`html:has([data-wr-page="pNNNNNN"])`. Declarations are moved, never dropped.

Measured on the `smoke-theme` fixture's own generated stylesheet — the two rules
that matter, verbatim:

```css
.wr-doc-st000009{color:rgb(70, 80, 95);display:block}
html:has([data-wr-page="p000001"]),html:has([data-wr-page="p000002"]){background-color:rgb(255, 255, 255)}
```

`st000009` is the document-root token. Before §CANVAS it carried
`background-color:rgb(255, 255, 255)`. It no longer does.

## 2. Root cause A — `src/theme/` never learned the new rule shape (outcome **b**)

The theme extractor reads the generated stylesheet as this pipeline's paint
truth and classifies every rule by selector shape:

* `src/theme/stylesheet.ts:49` — `const DOC_RULE = /^\.wr-doc-(st\d+)$/`

`html:has([data-wr-page="p000001"]),…` matches neither `TOKEN_RULE` nor
`DOC_RULE`, so it fell through to `kind: "node-scoped"`. Three consequences,
each one a real behaviour loss, not a test artefact:

1. `src/theme/extract.ts:289` ranks canvas candidates from `doc-root` rules only
   (`bump(docBackground, …)`). With the doc-root rule stripped of its background,
   `docBackground` was **empty**.
2. `src/theme/extract.ts:592` binds an occurrence to `color.canvas` only when its
   rule is `doc-root` or a pseudo. No occurrence qualified, so **no paint group
   carried `color.canvas` at all**.
3. The canvas paint therefore fell through to the ordinary element-surface
   branch and was bound as `color.surface.secondary`.

Measured adapter, before the fix (13 tokens, `color.canvas` **absent**):

```
background-color | rgb(244, 246, 250) | color.surface.elevated  | ['.wr-st000005']
background-color | rgb(255, 255, 255) | color.surface.secondary | ['.wr-st000010', '.wr-st000011',
                                        'html:has([data-wr-page="p000001"]),html:has([data-wr-page="p000002"])']
```

and after (15 tokens, `color.canvas` restored to its own group):

```
color.canvas            = rgb(255, 255, 255)   ['html:has([data-wr-page="p000001"]),html:has([data-wr-page="p000002"])']
color.surface.secondary = rgb(244, 246, 250)   ['.wr-st000005']
color.surface.primary   = rgb(255, 255, 255)   ['.wr-st000010']
color.surface.elevated  = rgb(255, 255, 255)   ['.wr-st000011']
```

**Why this is (b) and not a stale test.** With `color.canvas` missing from the
adapter, three things silently stopped working in the product, not the harness:

* the extracted "original theme" no longer described the page background at all,
  so it could not be exported or round-tripped;
* a curated theme's `color.canvas` had nothing to bind to — the canvas would
  keep the original site's background under any theme, while
  `color.surface.secondary` would repaint the canvas *and* drag two unrelated
  white element surfaces along with it;
* **the contrast compatibility gate stopped firing.** `src/theme/compatibility.ts:24`
  pairs `color.text.primary` against `color.canvas`; with no canvas group the
  near-white-text-on-white theme was downgraded from `incompatible` to
  `compatible-with-warnings`. That is a safety gate that stopped catching
  invisible text — the most severe of the seven.

### The fix (production, `src/theme/` only)

| file:line | change |
|---|---|
| `src/theme/stylesheet.ts:25` | new selector kind `"document-canvas"` |
| `src/theme/stylesheet.ts:51-66` | `isDocumentCanvasSelector()` — every comma-separated part must match `^html:has\(\[data-wr-page="p\d+"\]\)$` |
| `src/theme/stylesheet.ts:94` | classify such rules as `document-canvas` |
| `src/theme/types.ts:252` | `SelectorKindSchema` gains `"document-canvas"` |
| `src/theme/extract.ts:87` | a document-canvas rule counts as one element, like a doc-root rule |
| `src/theme/extract.ts:289` | it ranks as a canvas candidate |
| `src/theme/extract.ts:592` | it binds to `color.canvas` |

The `doc-root` branches are all **kept**, because the generator still leaves the
background on the wrapper whenever it refuses to promote it (`no-background`,
`viewports-disagree`, `document-root-not-found`). Both shapes are the document
background and both must rank as the canvas.

End-to-end confirmation, not just unit-level: `src/theme/theme-qa.ts:253-255`
probes non-`.wr-` selectors in a live Chromium, so the canvas group's
`html:has(…)` selector is queried and its computed `background-color` read back.
`smoke-theme` check 14 ("curated theme changes paint … all verified checks
applied") passes, which means the curated theme now genuinely repaints the real
document canvas in the browser.

## 3. Root cause B — the QA fixture manufactured its mismatch from the bug (outcome **a**)

`scripts/smoke-reconstruction-qa.ts` serves a fixture whose `<html>` carries
`background: rgb(17, 24, 39)`. Before §CANVAS the generator painted that as a box
on the wrapper and left the real `<html>` transparent, so
`src/reconstruction-qa/qa-page.ts:166` `canvasMismatchedProperties()` resolved the
clone's canvas to the UA default white and reported a mismatch. The four checks
consumed that mismatch.

Measured on the unmodified fixture with §CANVAS in place — all four
page/viewports:

```
p000001 desktop  expected background-color rgb(17, 24, 39)
                 cloneHtml background-color rgb(17, 24, 39)   mismatch []
p000001 mobile   … identical …                                mismatch []
p000002 desktop  … identical …                                mismatch []
p000002 mobile   … identical …                                mismatch []
proposed: ['interaction-target-state-style', 'safe-data-image-recovery', 'safe-data-image-recovery']
```

The clone's real `<html>` now carries the observed dark root background. The
"white canvas" in the check's own name **was the defect**, and it is cured. The
tests were asserting the old, buggy behaviour.

### The fix (fixture, not assertions)

The rule from the brief is that a test which detects a canvas mismatch must still
construct a real mismatch. The mismatch cannot be injected into the built clone,
because the auto-fix loop rebuilds the reconstruction from the SiteSpec and would
regenerate a correct canvas — the correction would then be "accepted" for the
wrong reason. It must therefore be a property of *SiteSpec → generator*.

The generator's only reachable refusal on a real observation is
`viewports-disagree` (`src/reconstruction/style-generator.ts:317-318`): the two
observed viewports must agree on the canvas declaration **text**. So `HOME_HTML`
now disagrees on `background-position` **only**:

```css
html { background-color: rgb(17, 24, 39); background-position: 0% 0%; }
@media (max-width: 1200px) { html { background-position: 25% 75%; } }
```

`background-position` is chosen deliberately: it is in
`DOCUMENT_ROOT_CANVAS_PROPERTIES` (so it triggers the refusal) but
`canvasMismatchedProperties` skips it while `background-image` is `none`
(`src/reconstruction-qa/qa-page.ts:202-208`), so the observed canvas **colour**
stays identical at both widths and the resulting mismatch is one a single
site-level correction can actually fix. The breakpoint is 1200px, not 700px,
because the fixture has no `<meta name="viewport">` and Chromium's mobile
emulation lays it out at its 980px default rather than the 390px profile width —
at 700px the two captures were identical and the fixture produced no mismatch at
all (measured: first attempt still 207/211).

The `/member/*` pages keep an agreeing canvas and are now a **positive control**.

Measured after the fixture change:

```
p000001 desktop  expected rgb(17, 24, 39) pos 0% 0%    cloneHtml rgba(0, 0, 0, 0)  mismatch ['background-color']
p000001 mobile   expected rgb(17, 24, 39) pos 25% 75%  cloneHtml rgba(0, 0, 0, 0)  mismatch ['background-color']
p000002 desktop  expected rgb(17, 24, 39) pos 0% 0%    cloneHtml rgb(17, 24, 39)   mismatch []
p000002 mobile   expected rgb(17, 24, 39) pos 0% 0%    cloneHtml rgb(17, 24, 39)   mismatch []
proposed: ['document-canvas-background', 'interaction-target-state-style', 'safe-data-image-recovery', …]
```

Three of the four assertions are **unchanged** — they pass again because the
fixture now presents a real defect. The fourth was **strengthened**, not
relaxed: it previously asserted only that *some* diff was a canvas mismatch,
which a detector that fires on everything would satisfy. It now asserts the
mismatch is on the refused page **and absent from the promoted page**:

```ts
canvasMismatchPages.has("p000001") && !canvasMismatchPages.has("p000002")
```

The check count is deliberately unchanged at 211 — the positive control is folded
into the existing check rather than added as a new one.

## 4. The eleven failing checks

| # | suite | check | class | evidence |
|---|---|---|---|---|
| 1 | theme | `2 canvas extracted` | **b** | `tokens["color.canvas"]` was `undefined`; no paint group bound it because the canvas rule parsed as `node-scoped` (`stylesheet.ts:49`) |
| 2 | theme | `2h card bg → surface.secondary` | **b** | canvas ranking fell back to the most frequent style-token background, so white took `surface.secondary` and `CARD_BG` was displaced to `surface.elevated` |
| 3 | theme | `6 adapter references ONLY reconstruction identity` | **a** | the new `html:has([data-wr-page=…])` selector *is* generated identity; the allowlist predated the shape. Extended explicitly, with two inline rejections (`.card`, and a list mixing a valid scope with `.card`) so it cannot pass vacuously |
| 4 | theme | `18 contrast failure detected` | **b** | `compatibility.ts:24` pairs text against `color.canvas`; with no canvas group the invisible-text theme degraded `incompatible` → `compatible-with-warnings` |
| 5 | theme | `8 border COLOR themed, width/style preserved` | **b** | consequential: the browser probe selects the card via the `surface.secondary` group, which now resolved to a plain white surface — reported `borderWidth 0px, borderStyle none` |
| 6 | theme | `9 radius themed (card 8px→3px, cta pill 14px→5px)` | **b** | same misidentified node: `cardRadius 0px`, while the unrelated `ctaRadius` was correctly `5px` |
| 7 | theme | `10 shadow themed` | **b** | same misidentified node: `cardShadow none` |
| 8 | rqa | `the canvas background mismatch is detected (dark root, white canvas)` | **a** | clone `<html>` measured at `rgb(17, 24, 39)` on all 4 page/viewports — the mismatch the check needs no longer exists because the bug is cured |
| 9 | rqa | `…and it is the only correction type proposed here besides observed ones` | **a** | consequential: no mismatch ⇒ no `document-canvas-background` in `proposed` |
| 10 | rqa | `the canvas correction was accepted` | **a** | consequential: nothing to accept |
| 11 | rqa | `…and it is generated from a template, not free-form` | **a** | consequential: no `html{background-color:` rule emitted into the corrected app |

Only checks 3, 8 were edited. Checks 9–11 were not touched at all — they pass
again purely because the fixture now presents a real defect.

## 5. Negative controls

Only two checks were edited under (a) (#3 and #8). Both were deliberately broken
afterwards to prove they are not vacuous. Both mutations were reverted and the
files verified byte-identical with `shasum -a 256 -c`.

### 5.1 `smoke-theme` #3 — an author class name must still be rejected

Mutation: `src/theme/extract.ts` `buildGroups()`, one added line
`acc.selectors.add(".card");`, so every paint group carries an author class name
alongside its real generated selectors.

| state | result |
|---|---|
| fixed | **47/47** |
| with `.card` injected into every group | **46/47** — check 6 FAILS, reporting `[".card", ".card", …]` |

The check also carries two *inline* rejections that run on every execution —
`isReconstructionIdentity(".card")` and
`isReconstructionIdentity('html:has([data-wr-page="p000001"]),.card')` must both
be false — so the predicate cannot silently degrade into "accept everything"
without the check itself failing.

### 5.2 `smoke-reconstruction-qa` #8 — the detector must actually do the detecting

Mutation: `src/reconstruction-qa/qa-page.ts:170`, an early
`if (true) return [];` at the top of `canvasMismatchedProperties()` — the QA
canvas detector reports nothing, while the fixture's real mismatch is untouched.

| state | result |
|---|---|
| fixed | **211/211** |
| with the detector neutered | **206/211** — 5 FAIL |

The five are precisely the four checks in this table's rqa rows plus the
unit-level `a dark observed root vs a transparent clone canvas IS a mismatch`.
Nothing else moved, which is what makes them a control rather than a blast
radius.

For reference, the *pre-fix* number on the unmodified fixture — the state that
opened this task — was **207/211**, and the first fixture attempt (a 700px
breakpoint, which the 980px mobile layout viewport swallowed) was also
**207/211**: the four checks track a real, constructed mismatch and nothing else.

## 6. Evidence the canvas change is still incomplete

These are **not** fixed here — two of the three live in `src/reconstruction/`,
which this task is fenced out of. They are reported for adjudication.

### 6.1 The QA auto-fix emits a GLOBAL `html{…}` rule — the exact problem §CANVAS scoped around

`src/reconstruction/qa-corrections.ts:178` emits the canvas correction as:

```js
`html{${body}}`
```

`03-frozen-width-chain-root.md` §CANVAS-2 argues at length that a bare `html`
rule is wrong because one generated app serves every route from one stylesheet —
hobbang.net's `/` has a background while its nine other routes have none, and a
global rule would tint all ten. The generator was therefore scoped per page. The
QA correction that repairs the same property was **not**. An auto-fix run on a
multi-route site will tint every route with one page's canvas. It should emit
`html:has([data-wr-page="…"])`, matching the generator.

This is currently invisible because `propose-corrections.ts:148` proposes at most
one canvas correction site-wide, so the two mechanisms never disagree inside one
suite — but the fixture above is precisely a site where different pages want
different canvas treatment.

### 6.2 A viewport that paints nothing is silently treated as agreeing

`src/reconstruction/style-generator.ts:302`:

```js
if (!paintsBackground(props)) { none = true; continue; }
```

A viewport whose root and body both paint nothing is **skipped**, not counted as
a disagreement. If desktop paints and mobile paints nothing, `perViewport` holds
one entry, the disagreement test cannot fire, and the desktop canvas is emitted
on `html:has([data-wr-page=…])` — which is document-scoped and therefore paints
**both** variant wrappers, including the mobile one that never had a background.
That is exactly the unmeasured guess `viewports-disagree` was added to refuse.
The two branches should be symmetric: paints-vs-does-not-paint is a disagreement.

Related, `style-generator.ts:313`: `missing ? "document-root-not-found" : none ? "no-background" : "no-background"` —
the two tails are identical, so a page with zero viewports is reported as
`no-background` rather than something honest.

### 6.3 No cross-module sweep accompanied the change

§CANVAS-5 lists its tests in `smoke-reconstruction` (227/227) and the layout-safety
harness. Nothing checked the modules that *consume* the generated stylesheet.
`src/theme/stylesheet.ts` is a deliberate, documented reader of exactly that
machine shape ("This module does not attempt to be a general CSS parser — it
reads only that shape and refuses anything else") — changing the shape was
guaranteed to reach it. The consumer set is small and greppable:
`.wr-doc-` appears in `src/` only in `style-generator.ts` (producer) and
`src/theme/stylesheet.ts` (consumer).

### 6.4 `src/reconstruction/style-generator.ts` contains a NUL byte

`git diff` reports it as `Bin 8425 -> 26247 bytes` and `file` reports `data`, not
text. A single `0x00` sits at **line 51**. Consequences: `git diff`/`git show`
cannot display the file's history, and `grep` silently returns **nothing** for it
without `-a` — which is how this investigation initially "found" that
`resolveDocumentRootCanvas` did not exist in the file that exports it. Four other
files carry the same defect and should be cleaned in the same pass:

| file | NULs | first at line |
|---|---:|---:|
| `src/reconstruction/style-generator.ts` | 1 | 51 |
| `src/theme/extract.ts` | 3 | 610 |
| `src/sitespec/validate-sitespec.ts` | 2 | 361 |
| `src/recon-template/assemble.ts` | 2 | 54 |
| `src/interaction-patterns/build-patterns.ts` | 2 | 184 |

### 6.5 Two other suites in the same regression are red for unrelated reasons

Out of scope here, recorded so they are not mistaken for canvas fallout:

* `smoke-e2e` — 1 failure, `the centered .centered band recovered a layout rule from the probe — rules=0 aligned=10`. A §WIDTH-lane issue.
* `smoke-visual-editor` — crashed on a Playwright locator timeout waiting for `global.header.nav.customers.label`. Not canvas-related.

## 7. Files changed

| file | why |
|---|---|
| `src/theme/stylesheet.ts` | recognise the document-canvas rule shape |
| `src/theme/types.ts` | `SelectorKindSchema` gains `"document-canvas"` |
| `src/theme/extract.ts` | rank and bind the document-canvas rule as the canvas |
| `scripts/smoke-theme.ts` | check 6 allowlist extended to the new generated selector, with inline rejections |
| `scripts/smoke-reconstruction-qa.ts` | `HOME_HTML` constructs a real canvas mismatch; check 8 strengthened with a positive control |

No file under `src/reconstruction/` was modified, and
`src/sitespec/compile-page.ts` was not touched.

## 8. Verification

| gate | result |
|---|---|
| `pnpm typecheck` | **exit 0** |
| `smoke-theme` | **47/47** (baseline 47) |
| `smoke-reconstruction-qa` | **211/211** (baseline 211) |
| `smoke-authoring-preview` (consumes `src/theme`) | **41 checks, 0 failures** (baseline 41) |
| `smoke-release` (consumes `src/theme`) | **275 checks, 0 failures** (baseline 275) |

The last two are run because `src/theme/` is a shared module: besides
`smoke-theme`, the extractor and adapter are consumed by
`src/authoring-preview/{lineage,session}.ts`, `src/release/{resolve,stages}.ts`
and `src/editor/panels.ts`. Changing the adapter's token assignment could have
moved them, so they are measured rather than assumed.

Logs for every run in this document: `tmp/wr2875/canvas-fallout/`.

