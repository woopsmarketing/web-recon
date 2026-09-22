# Task 28 — Visual Production Workflow

**Date:** 2026-08-28 · **Baseline sha:** `6c2e723601a0d76431c96a48bbdb4726c02063e7` ("0827 morning")
**Verdict:** **READY FOR FIRST PRODUCTION PILOT**
*(This program first adjudicated **NOT READY — VISUAL PRODUCTION WORKFLOW INCOMPLETE** on one clause.
That clause was then fixed and re-adjudicated. See "The Close-out".)*

*Every number in this report comes from the final regression, the four independent audits, the
adjudication, or an artifact the report agent read directly. Where a figure is disputed, both
figures are printed. Where something is unknown, it says so.*

---

## Executive Summary

You were asleep. Here is what happened, without softening.

Task 28 built, on top of the accepted Task-27 baseline (20 suites / 2,151 checks / 0 failures), the
whole visual production workflow: source-brand asset resolution, a fast authoring preview, a Visual
Editor with every inspector, safe region and route enablement, Template and Site Library screens,
Create Site from one natural-language brief, full-site content generation, production-mode SEO, and
a full local production canary. Eleven phases plus a substrate phase, all delivered.

**The engineering holds.** The final regression ran the complete battery: **29 counted suites,
2,948 checks, 0 failures, typecheck exit 0**, with **zero negative deltas** against Task 27 and
**zero drift** against the phase-10/11 gate. That is +9 suites and +797 checks over Task 27. The
whole battery took 1,363 s. Fifteen of those 29 suites were independently re-run by four different
agents other than the one that produced the table, with **zero disagreements**.

**After the close-out fix the battery is 29 counted suites, 2,970 checks, 0 failures, typecheck
exit 0, and still zero negative deltas** — +22 checks, every one of them newly added
(`smoke-brand-assets` 141 → 162, `smoke-production` 132 → 133, all 27 other suites Δ 0). That number,
not 2,948, is the baseline a future task must protect.

**One bar clause failed at first adjudication. It was root-caused, fixed, independently falsified and
re-adjudicated — and this report now says READY.** The history is kept in full below rather than
rewritten; see **"The Close-out"**.

The defect: the brand resolver declares `image-logo` as the *first* of its resolvable brand surfaces
and really does rewrite the image `src` for it — but the rendered census had **no axis that measured
it**. `markupBrandSurfaceTotal` excluded the `sourceUrl` axis, no axis at all measured an `<img>`
whose *path* named the brand, and the one axis that could apply (`imageAlt`) used a weaker matcher
than detection did. Because `evaluateBrandOutputProof` tested `renderedClean` **before**
`preservedAfter`, a PRESERVE on such a lineage was scored as positive output proof:
`clearedBy = "output-proof"` → `status = "resolved"` → **0 source-brand blockers, while the source's
own logotype was still in the shipped HTML.** Auditor 3 reproduced it twice on the real accepted
nextjs.org template with real `next build`s. It falsified the shipped Phase-2 claim that
*"PRESERVE-everything is not a path to PRODUCTION_READY."*

**All four causes are now closed, and the instrument is complete with respect to what the resolver
claims to resolve.** `preservedAfter > 0` is tested first and always yields `preserve-acceptance` →
`accepted-limitation`, which still counts as a release blocker; a rendered `imageSrcPath` axis was
added to both the markup and the RSC-flight census, measured with the detector's *own* `scanImageLogo`
so the census can never drift blinder than detection; and the `alt` matcher was aligned with the
detector. Each of the six entries of `RESOLVABLE_BRAND_SURFACES` now has a matching census axis on
both encodings — which is exactly what was false before.

**The final adjudicator did not take that on trust.** Seven false-zero attacks of their own design
were run against the shipped functions. A brand-named logo on a third-party CDN URL with a query
string and no alt, a mark dirty on only one of three routes, and a flight-only brand path each
cleared as `resolved` with **0 blockers** under a simulation of the old instrument and now each
return **`unresolved`, 1 blocker**. A PRESERVE-everything build with a *fully clean* census now
returns `accepted-limitation`, 1 blocker. Most tellingly, a mark hidden in a CSS `background-image` —
a surface *no* axis measures even now — is still caught, because the ordering fix makes the verdict
independent of whether any given surface is measured yet. And the control holds: a genuine REPLACE
that truly removes the mark still clears as `output-proof` / `resolved` / **0 blockers**. The matcher
change was fuzzed over 65,536 strings: **0 narrowing cases, 23,979 widening** — a strict superset, so
no detector was narrowed to reach a zero.

The zero on the shipped Switchyard canary was always *honest* (REPLACE on all 74 hosts,
`preservedAfter=0`). The adjudicator re-censused that package's 9 shipped HTML files with the **new,
stricter** instrument and re-derived the requirement end to end: `imageSrcPath 0`, every axis 0,
`markupBrandSurfaceTotal 0`, `clearedBy = "output-proof"`, `status = "resolved"`, **0 blockers**. The
zero survives the stricter instrument.

Every other bar clause is met, two of them on evidence stronger than the phase handoffs claimed: all
13 canary zero-gates were not only re-derived at 0 but **proven to fire** under injected conditions
(the brief asked for 4), and the stripe shared-page refusal that a handoff still calls "engine-only"
was driven through the real UI by an auditor who stood up their own Chromium.

Three things below are not buried, because they are the honest story of this program: a **session
fork**, a **systemic handoff-traceability leak that is still open**, and the **four real defects
adversarial verification caught that tests passing never would have**.

---

## Starting Task-27 State

Task 27 closed as READY FOR VISUAL PRODUCTION WORKFLOW on a fresh 4-auditor panel plus adjudicator,
37/37 mandatory points VERIFIED. Its recorded state (`docs/result/handoffs/27-final.json`):

| | |
|---|---|
| Suites / checks / failures | 20 / **2,151** / 0 |
| Typecheck | exit 0 |
| Historical mutation count | 0 |
| Git mutating operations | 0 |
| Open change requests | **8** |

The working tree at Task-28 start was **clean** — the user committed and pushed Task 27 as
`6c2e723` before the program began (`28-start.json`: `porcelainLineCount: 0`).

Task 27 handed forward five deferrals — Visual Editor UI, Region/Route ON-OFF consumers, a full
collection engine, GED-F anchor neutralisation, and a full production canary with a real
indexable-production build — and eleven named risks, of which four are directly addressed below:
the unclearable `source-brand-asset` blocker, the assets stage runner that had never executed on
real data, the +2 requirement-count drift, and the fact that no indexable-production build had ever
run end to end.

---

## Carried Task-27 Items

All **8 of 8** change requests were closed; **0 superseded, 0 blocked**
(`docs/result/handoffs/28-carried-items.json`, measured by a fresh Phase-1 gate agent who
implemented nothing):

| CR | What | Where it landed |
|---|---|---|
| CR1 | barrel export for `revisions.ts` | `src/release/index.ts:19` |
| CR2 | `resolve.ts` / `prepare.ts` call `appendAuthoredRevision` so the chain stops being inert | `prepare.ts:438`, `resolve.ts:274` |
| CR3 | `displayName` for the site registry | `src/release/types.ts:436`, `src/registry/scan.ts:219` |
| CR4 | `prepare.ts` calls `registerSite` | `prepare.ts:457-466`, lazy import inside try/catch |
| CR5 | template compile CLI calls `registerTemplate` | `src/cli-compile-recon-template.ts:183-186` |
| CR6 | export `CONTENT_WRITE_DOCTRINE_WARNING` from the barrel | `src/content-injection/index.ts:86` |
| CR7 | carry a brand-surface census through the bake result | `src/production/types.ts:132-139` + new `brand-census.ts` |
| CR8 | open the closed `BrandLeakWarning` kind enum to SVG surfaces | `src/content-injection/types.ts`, still `.strict()`, now 10 values |

**One carried limitation, honestly named:** CR5 is implemented but *no suite spawns the CLI itself*,
so it is not covered end to end.

---

## Requirement Count Drift

Task 27 shipped an unexplained +2: `requirements.json` reported 380 while a surviving log proved the
CLI printed 378. **Reproduced and root-caused.**

The cause was **post-write requirement addition by a later command**. In
`data/linear.app/release-projects/flowpilot-wr27`, `requirements.json` holds 380 entries /
380 unique ids with `generatedAt 2026-08-26T19:27:23.835Z` — and the only run with that `createdAt`
is `runs/2026-08-26T19-26-48-957Z`, `kind=build`. The **last build** wrote the file, not the
19:23:06 prepare whose terminal line said 378. `build.ts` re-collected from the artifacts its own
stage reruns had just produced and overwrote the file, recording no requirement total on `run.json`.

The +2 is real and correct: diffing the two `generation-result.json` files, the accepted-lineage
content run has 117 unresolved and the build-created run has 119, with
`onlyInBuild = ['security.main.text.linear-undergoes-regular-service','security.main.text.iso-27001-certified']`
and `onlyInAccepted = []`.

**Fixed generically**, not by a special case: `requirements.ts:255` adds `duplicateRequirementIds`;
`buildRequirementsFile` throws naming every colliding id; `counts.total` is derived as
`new Set(...).size`; `ReleaseRunSchema.requirementsTotal` is now required and supplied by prepare,
resolve and build; the CLIs print the total they wrote. Fourteen new checks (`release:28.1B.1 … .14`)
assert the count↔artifact invariant over a real build. A grep for the literals `378`/`380` across
`src/` and `scripts/` returns exactly one hit — a doc comment — and no code literal.

---

## Real Asset Stage

Task 27's coverage hole ("the assets StageRunner has never executed on real data — it appears only
in `reusedStages`") is **closed**. Run id `2026-08-27T09-38-59-489Z`, materialization
`2026-08-27T09-38-59-492Z`, project `data/linear.app/release-projects/wr28-assets-stage`.
`run.json` records `rerunStages=["assets","production"]`, the stale trigger was legitimate
(the resolution hashes the operator file's *bytes*), production consumed the result, and a second
run correctly reused it.

**Executing it for the first time found two real defects, both fixed:**

1. The operator record was **appended beside** the asset's existing manifest record, so the derived
   manifest carried two records for one inventoryId. Pre-fix run `2026-08-27T09-34-50-356Z`:
   2 records for `ai000036`, 242 entries. Post-fix run: 1 record, 241 entries.
2. Counts were **copied forward** from the base run. Pre-fix run reported
   `counts.totalBytes 209,680,490` while its own media directory held 209,680,669 bytes. Post-fix:
   156 unique files / 209,680,669 bytes, independently re-measured against the directory.

**One honest caveat carried:** `smoke-release.ts:3415-3417` still says the runner *"had never
executed on any pipeline"*, which the Phase-1C verifier falsified against pre-existing checks
14b/26.5/26.6 (it had executed in the fixture pipeline; what was new was the **real accepted
linear.app lineage**). That clause is still in the tree today — see the Systemic Leak section.

---

## Brand Asset Resolution

This is the phase that closed Task 27's recorded dead end (*"no bake-time rewriter exists so no
resolution can honestly clear it"*) — and it is the phase that failed the bar at first
adjudication, then closed it.

**What was built.** `src/production/brand-bake.ts` (`bakeBrand()`), spliced into
`src/production/run.ts` between `bakeSeoTitles` and `convertToStaticExport`, mutating the **build
copy's** page IR. That seam is deliberate: the head, the SSR HTML, the inlined `self.__next_f.push`
flight chunks and the exported `.txt` flight all derive from the page IR, so one write reaches every
encoding. Whole-asset **REPLACE / REMOVE / PRESERVE** only — there is no SVG path editor.

Six surfaces are covered: `image-logo`, `svg-aria-label`, `svg-text`, `svg-symbol-id` (renamed in
place to a content-addressed `wr-sym-<hex>` together with every `<use href>` reference, across
pages), `image-alt`, `aria-label`. Nine surfaces are explicitly **not** covered and are named with
their owner, including two that are honestly `UNOWNED`.

**What it measured on the real linear lineage** (project `wr28-brand-assets`, run/build
`2026-08-27T12-36-06-105Z`): 80 brand-carrying hosts (svg-aria-label 48, svg-symbol-id 16,
image-alt 14, aria-label 2); 64 REPLACE + 16 REMOVE applied; 80 nodes rewritten over 8 pages;
32 symbol ids renamed; residual hosts-after 0, unexplained-after 0; exported-HTML brand surfaces 0;
RSC flight brand surfaces 0 over 46 flight documents and 1,083 length-prefixed chunks;
post-hydration brand surfaces 0 over 8 routes; 0 divergent routes; 0 hydration errors. Blockers
1 → 0.

Auditor 3 independently re-censused the **shipped bytes** of the Switchyard canary package with the
product's own census functions over all 9 served HTML files and every `.txt` flight file: markup 0,
inline-flight 0, `.txt`-flight 0, and raw greps for `<symbol id=*linear*>` and
`<svg aria-label=*linear*>` both 0. 58 inline-SVG brand surfaces existed; none survives.

**The negative test works.** A build in which every host carries a decision but the `<img>` logo's
REPLACE names a non-existent asset: `applied.refused=1`, `unexplainedAfter=1`, blockers 1, and the
source logo ships. Its rendered census was 0/0 — *the rendered axis alone would have passed it*; the
IR-set proof is what caught it. Auditor 3 re-ran the same shape on the real nextjs.org template and
got the same answer (`replaced 0, unexplainedAfter 4, irClean false, blockers 1`).

### The blocking defect — as found, before the fix

*Everything in this subsection is stated in the present tense as it was measured at first
adjudication. It is now closed; the next subsection is the fix and its falsification. The record is
kept because a defect this instrument-shaped is worth remembering exactly as it read.*

On the same real nextjs.org lineage, **PRESERVE on all four `image-logo` hosts clears the
requirement**:

- `censusServedHtml` returns `{sourceUrl: 88, everything-else: 0}` → `markupBrandSurfaceTotal = 0`
  because it excludes `sourceUrl` (`src/production/brand-census.ts:376`, read directly).
- `irClean = true` (every host is explained by an explicit PRESERVE).
- `evaluateBrandOutputProof` tests `renderedClean` **first** (`src/release/brand-scan.ts:770-777`,
  read directly), so `clearedBy = "output-proof"`, which `brand-scan.ts:878-891` maps to
  `status = "resolved"`. `releaseBlockers()` returns 0.
- `site/index.html` still ships
  `<img alt="NextjsLogotype" src="https://nextjs.org/_next/static/immutable/media/nextjs-logotype-light….svg">`.

Auditor 3 ran it a second time with the asset stage simulated (all 146 source-host URLs self-hosted
to `/wr/assets/`): **every census axis including `sourceUrl` reads 0**, still `output-proof`, still
resolved, still 0 blockers, and both the Next.js and Vercel logotypes still shipping. Self-hosting
the file erases the only axis that saw anything.

The adjudicator extended the root cause to four independent causes, all confirmed in source:
(a) `markupBrandSurfaceTotal` excludes `sourceUrl`; (b) there is **no census axis at all** for an
`<img>` whose `src` *path* names the brand, even though `image-logo` is the first entry of
`RESOLVABLE_BRAND_SURFACES` and the resolver rewrites `props.src` for it; (c) detection and clearing
use different matchers — `firstBrandTokenInIdentifier("NextjsLogotype") = "nextjs"` but
`firstBrandToken("NextjsLogotype") = undefined`, so the very alt string that *makes* it a detected
host censuses as zero on the `imageAlt` axis; (d) the branch order.

**Minimal fix, in the order the adjudicator prescribed:** (i) make `preservedAfter > 0` always
yield `"preserve-acceptance"` — preserving a mark is by definition not proof it is gone; (ii) add a
rendered axis for an `<img>` whose `src` path carries a brand token, host-independent so
self-hosting cannot erase it; (iii) use `firstBrandTokenInIdentifier` on the `imageAlt` axis so
clearing is at least as sensitive as detection; (iv) fix the branch order.

### The fix, and how it was falsified

All four were applied, in five files
(`src/release/brand-scan.ts`, `src/production/brand-census.ts`,
`src/content-injection/brand-surfaces.ts`, `scripts/smoke-brand-assets.ts`,
`scripts/smoke-production.ts`).

- **(i) + (iv) are one edit** in `evaluateBrandOutputProof`. `preservedAfter > 0` is now tested
  *first* and always wins over `renderedClean`. `preserve-acceptance` was **not** given another route
  to clear: it still maps to `accepted-limitation`, which `releaseBlockers()` still counts. This is
  the load-bearing half, because it makes the verdict independent of whether some future surface is
  measured yet — an unmeasured axis can now only *downgrade* a build, never upgrade one to proof.
- **(ii)** a new `imageSrcPath` axis on **both** `BrandSurfaceCounts` and `BrandFlightCounts`,
  measured with the detector's own `scanImageLogo` so the census cannot drift blinder than detection,
  one count per `<img>`, reading only true `src`/`srcset` (`data-src` is deliberately *not* read, so
  the census is equal to detection and never wider). Wired through `censusServedHtml`,
  `censusFlightPayload`, `summarizeBrandCensus`, `markupBrandSurfaceTotal`, `flightBrandSurfaceTotal`
  and all three axes in `brand-scan`.
- **(iii)** corrected in the act of applying it: on `alt`, census and detector were *already* equal
  (both weak). The real asymmetry was **inside `brand-surfaces.ts`** — the same `<img>`'s `src` path
  used the identifier matcher while its `alt` used the word-boundary one, so the two were blind
  *together*. Both are now `firstBrandTokenInIdentifier`.

**The instrument is now complete with respect to what the resolver claims to resolve.** Each of the
six entries of `RESOLVABLE_BRAND_SURFACES` — `image-logo`, `image-alt`, `aria-label`,
`svg-aria-label`, `svg-text`, `svg-symbol-id` — has a matching census axis, on the markup encoding
*and* the flight encoding, and `markupBrandSurfaceTotal` / `flightBrandSurfaceTotal` each sum exactly
those six. That equality is the property that was false before.

**Falsification by the builder:** three mutations, each restored byte-identically with sha256
verification — reverting the branch order failed 3 checks; dropping `imageSrcPath` from the total
failed 2; reverting the alt matcher failed 4. **By the independent verifier:** two further mutations
(removing the `srcset` read, removing the flight `src` loop) each failed exactly the one check that
names them; plus a 4,116-case exhaustive input matrix over every combination
`evaluateBrandOutputProof` consults — pre-fix, 144 cases cleared as `output-proof` with a preserved
mark and 72 landed `resolved`; post-fix, **0 and 0**.

**Falsification by the final adjudicator**, seven attacks of their own design against the shipped
functions, each census derived from real HTML rather than hand-fed numbers:

| Attack | Old instrument | Now |
|---|---|---|
| brand logo on a third-party CDN URL, query string, **no alt**, spotless bake report | `output-proof` / resolved / **0 blockers** | `null` / unresolved / **1 blocker** |
| brand-named path dirty on **only 1 of 3 routes**, spotless bake | `output-proof` / resolved / 0 | unresolved / **1** |
| brand path reachable **only via `srcset`** + camel-cased `alt` | — | unresolved / **1** |
| brand path present **only in the RSC flight** | `output-proof` / resolved / 0 | unresolved / **1** |
| PRESERVE-everything with a fully clean census (the exact defect shape) | `output-proof` / **resolved** / 0 | `preserve-acceptance` / **accepted-limitation** / **1** |
| PRESERVE-everything with the mark in a CSS `background-image` — a surface **no axis measures even now** | `output-proof` / resolved / 0 | `preserve-acceptance` / accepted-limitation / **1** |
| **CONTROL — a genuine REPLACE that truly removes the mark** | `output-proof` / resolved / **0** | `output-proof` / resolved / **0** (unchanged) |

The sixth row is the most important one: the ordering fix catches a surface the census still cannot
see. The seventh is the guarantee against over-correction — the fix produces no false positive.

**No detector was narrowed to reach a zero.** The adjudicator fuzzed `firstBrandTokenInIdentifier`
against `firstBrandToken` over 65,536 generated strings: **0 narrowing cases, 23,979 widening** — a
strict superset. The operator-visible consequence is honest and named: nextjs.org's full-template
brand host count rises **190 → 510** (320 more real `alt="NextjsLogotype"` surfaces now needing
decisions). linear.app (80), stripe.com (195) and domainchecker.co.kr (38) show **zero** churn.

**The canary's zero survives the stricter instrument.** The adjudicator re-censused the shipped
Switchyard package's 9 served HTML files with the new axes and re-derived the requirement end to end
against the build the requirement's evidence names
(`data/linear.app/production-builds/2026-08-28T00-24-48-338Z`): 74 hosts, 74 replaced,
`preservedAfter 0`, `imageSrcPath 0`, every axis 0, `markupBrandSurfaceTotal 0`,
`clearedBy = "output-proof"`, `status = "resolved"`, **0 blockers**. (The 48–290 case-insensitive
`linear` hits per file are every one of them the SVG element name `<linearGradient>`, inside tags the
census strips — checked by hand.)

**Twenty-two new checks guard it**, `28.X1` through `28.X12`, including *"a PRESERVED host NEVER
resolves, not even when every measured axis reads 0"*, *"NO FALSE POSITIVE: nothing preserved + a
clean census STILL clears by output-proof"*, and *"`data-src` is NOT read"*. Three existing checks
were **rewritten, none deleted or weakened** — one of them, §3b, had asserted the *opposite* of the
fix, and that assertion **was** the defect; each rewritten hunk's check count went **up**.
**No severity was downgraded and no detector was narrowed into silence on a real lineage** — both
independently checked. `SEVERITY_POLICY` has all 12 pre-existing kinds byte-identical (the 13th,
`dead-internal-link`, is new and release-blocking), and the scanner reproduces 80/195/190/38 hosts
on linear/stripe/nextjs/domainchecker.

---

## Fast Preview Architecture

`src/authoring-preview/`. The preview is **the immutable Recon Template + authored Site state +
lightweight overlays**, served by ONE `next start` on a **patched copy** of the template app behind
ONE stable-URL reverse proxy.

- **Materialize (once per template):** copy `<templateRun>/app`, apply two guarded anchored patches,
  run `next build` once. The reuse key is patchVersion + templateId + sha256 of the two pristine
  generated runtime files, so a recompiled template or a changed patch forces a rebuild instead of
  silently serving a stale app.
- **Content (hot):** the generated runtime memoizes the content contract for the process lifetime,
  so writing the slot-values file has *zero* effect on a running server. The patch adds an authoring
  **epoch** read from its own env var — a tiny file whose entire content is a monotonic token,
  written **after** the overlay file, so a fresh epoch can never point at stale bytes and there is
  no `(mtime,size)` collision hole. Both patches are dead unless `WR_AUTHORING_HOT=1`.
- **Theme (hot):** authored tokens go through `generateThemeOverlay` — *the same pure function the
  theme StageRunner calls* — into the preview's overlay CSS, appended to `/wr/generated-styles.css`.
  The served HTML is byte-identical by construction, so a theme edit cannot affect hydration.
- **Images (hot):** the proxy serves overlay media first, frozen materialization second, per-request
  disk read. Two changes made it usable: `cache-control: no-store` in authoring mode (the shipped
  proxy sends `immutable`, which is why a replaced image was measurably invisible), and content-type
  sniffed from the override's bytes.
- **Editor bridge:** an editor-only `<script>` spliced before `</head>` of **HTML responses only** —
  never into an RSC flight payload — at the serve boundary. It exists only in the proxy process and
  the bytes it streams; no file inside the app is written.

**Rejected alternatives, on evidence:** proxy value substitution was rejected because on the linear
template **828 of 2,441 text slots (34%) share a default value with another slot** and 292 defaults
are substrings of another — a needle cannot address one occurrence, and substitution discards the
`expectedValue` guard. A full production bake per edit was measured at 3,759 ms median producing a
77.4 MB build directory, against 54 ms server-side for a text edit.

**No `data-wr-slot` was added.** The bridge reports the *existing* `data-wr-node` /
`data-wr-dyn-node`. Independently checked three ways: 16 grep hits across `src/`+`scripts/`, all doc
comments or negative assertions; all 37 `setAttribute` call sites enumerated, none names it; and
`smoke-visual-editor.ts:1054-1058` evaluates `document.querySelectorAll('[data-wr-slot]').length`
in a real Chromium frame and requires 0.

**The production bake is unaffected, proven not argued:** after a full preview session the suite runs
the real `runProductionCompile` on the same lineage and walks every file of the produced package —
198 files, 22,042,083 bytes, **0** occurrences of the bridge marker, **0** of the authoring patch
marker, **0** of the epoch env var — and byte-compares the template run before and after.
Reproduced across three more compiles.

**Auditor 3 re-proved editor absence in production independently**, with 35 markers each first
proven non-vacuous in `src/` or `scripts/`, greppd `--binary-files=text` across four packages
(220 / 439 / 354 / 198 files). **Zero hits for 34 of 35.** The single hit is `theme-overlay.css`,
a legitimate production artifact that merely shares a filename with the preview overlay.

---

## Preview Performance

Measured on darwin 25.2.0, Node 22, next 16.3.0, headless Chromium, 127.0.0.1 loopback, while other
Task-28 phases ran concurrently on the same machine. Site: domainchecker.co.kr, 19 routes.

| Metric | Builder (n=6) | Independent re-measurement (auditor 3, n=5) | Verifier |
|---|---|---|---|
| Warm startup (whole `startAuthoringPreview` + first page served) | **617 ms** median | 612 ms median (601-618) | — |
| Cold materialize (rm -rf + copy + patch + `next build` + start + first serve) | **3,275 ms** median (build 2,558-2,638) | 4,215 ms median contended; 3,233/3,304 uncontended | — |
| Text edit, browser-visible | **144 ms** median (142-150) | **144 ms** median (142-162) | **180 ms** median / 211 max / 170 min — every sample above the claimed maximum |
| URL edit, browser-visible | **138 ms** median | 141 ms median | — |
| Theme edit, browser-visible | **71 ms** median | 57 ms median | — |
| Image edit | **5 ms** median | — | — |
| Text edit, server-side only | 54 ms median | — | — |

**Read the text-edit row carefully.** Two independent measurements land on 144 ms and one lands on
180 ms with every sample above the claimed maximum. The verifier asked for the pair to be replaced
by a range or re-measured. **It never was:** `28-preview-runtime.json` still ships
`{median:144, max:150}` with no range, no caveat and no `corrections` block — the string `180` does
not occur in the file. The Phase-2/3 gate recorded the finding as still open **and returned PASS
anyway.** This is one of the five standing leak items below.

**Second and third consecutive edits on one running preview stay visible** — five consecutive
`setSlotValue` calls on one session, each with a fresh marker, seen in 162/146/143/144/142 ms with
no worker restart. The epoch invalidation does not decay after the first edit.

**Hydration errors: 0.** Console-error and pageerror listeners for the whole session: 0 console
errors and 0 hydration errors on initial load and after all 15 edits; 0 across all 7 routes of the
isolated production package.

---

## Visual Editor Architecture

`src/editor/` — **14 modules, 5,491 lines** as measured in the tree today — plus `src/cli-editor.ts`.
A dependency-free `node:http` server on its **own 127.0.0.1 origin**, serving one hand-written HTML
page + one CSS + one vanilla-JS asset, with every decision behind a typed JSON API.

**Why its own origin:** the preview bridge's security model is cross-origin *by construction* — it
posts only to explicitly allowlisted origins, never `"*"`, and accepts only messages whose
`event.origin` is allowlisted **and** whose `event.source` is the embedder. Serving the editor from
the preview's origin would make both guards vacuous. A check proves an un-allowlisted origin
receives nothing and cannot command the bridge.

Four alternatives were rejected with reasons, the sharpest being a second Next.js app: `next
dev/build` **rewrites the shared root `tsconfig.json`** on first run and drops `.next/types/*.ts`
inside `src/`, which `tsc --noEmit` would then typecheck — breaking the typecheck gate for every
other Task-28 agent running concurrently.

**`release-project` remains the single authority.** No `src/site-instance` exists; the only two
mentions of the name in the tree are deliberate refusals to create one. Auditor 2 drove the real CLI
and confirmed every write landed in the project's authored state, and that the *only* persistence
calls in `src/editor` are `commitAuthoredEdits` / `commitAuthoredState` / `restoreAuthoredRevision`
from `src/release`.

**The editor never edits the template, and never edits a historical content run.** Auditor 2 took a
per-file sha256 manifest of all 180 files of the linear Recon Template before and after three full
editing sessions plus an enablement session, an 8-route error census and a stripe session: manifest
hash `4cbda4d805cd6a7c…` identical, `diff` empty. Every pinned lineage artifact of both edited
projects recomputes to its recorded hash — reconstruction, template, content run, theme, seo, assets,
production spec, production build. Edits materialise as **new** append-only revision records and a
separate preview workspace; `release:plan` then reports content/theme/seo/assets/production as
`STALE (will re-run on release:build)`.

**Type-system boundary, stated because it matters:** `pnpm typecheck` covers `src/**/*.ts` and
`scripts/**/*.ts`. The browser half of the editor lives inside `export const EDITOR_CLIENT_JS = ` as
a template string, so typecheck exit 0 says **nothing** about it. The Playwright checks in
`smoke-editor-integration` and `smoke-visual-editor` are the only evidence the client sends the
right bodies.

---

## Visual Editor UI

Left rail with route rows, the preview in an `iframe` on its own origin, an inspector with four
tabs (Slot, Image/Logo, Theme, Region), a refusal panel, Undo, and the Library modal.

**Hover highlight with an exactly-zero geometry cost.** One `<style data-wr-editor-style="1">` in
`<head>`, whose text content is rewritten per hover to an `outline` rule targeting the *existing*
`data-wr-node` attribute. Zero attributes are set on any customer element and zero nodes are
inserted into the customer subtree. `outline` is painted outside the border box and never
participates in layout.

The measurement is unusually good and worth trusting: `getBoundingClientRect` for **every** element
plus 6 document metrics, ~32,000 numbers, noise floor 0 (baseline vs baseline 400 ms apart, 8,010
elements). Max delta **exactly 0** at desktop 1440×900 over 13 probes, one per tag kind, and again
at mobile 390×844. And the probe is *demonstrated able to fail*: the first version hovered one
inline anchor and read 0 even when the highlight was deliberately changed from `outline` to `border`
(the template's boxes are border-box); strengthened to one probe per tag kind, the same injected
break produced a 4.0001220703125 px delta at `section#n000004`.

**Runtime errors across a full journey: 0.** Auditor 2 first self-tested the instrumentation — a
`console.error` injected into the preview iframe *and* one into the editor page were both captured —
then drove all 8 routes, clicked an element in each, opened all four tabs, switched to mobile 390 px,
entered QA mode and opened the Library modal: **0 console errors, 0 warnings, 0 uncaught pageerrors,
0 hydration-shaped messages.**

**Startup:** cold 3,239 ms median (n=5, includes copy + patch + `next build`); warm 604 ms median.
On the Switchyard canary, editor + preview up and answering in 578 ms median over 5 reps.

**A UI limitation worth knowing:** the Brand panel caps rows at 25 **per surface** — on the canary it
reported 104 rows of 267 with `truncated=163` — so an operator working only through the rendered
list cannot reach every host. The bulk work went through the same `POST /api/brand` endpoint.

---

## DOM-to-Slot Mapping

No new DOM attribute. The mapping is an inversion of `slot-bindings.json`:

| Case | Key |
|---|---|
| static and paint-twin | `pageId \| viewport \| nodeId` |
| dynamic-template | `pageId \| viewport \| RECOVERED TRIGGER nodeId \| templateNodeId` |
| fallback | `pageId \| viewport \| templateNodeId` — used **only** when the trigger could not be recovered, and then every candidate is returned with `triggerRecovered:false` and an explicit note |

**Trigger recovery** happens in-page (`src/authoring-preview/bridge.ts recoverTrigger()`) because
`report.node` is *always* null on a mounted dynamic-template element. It walks to the outermost
`[data-wr-dyn-node]`, collects ids, looks them up as `[data-wr-dyn-id]`, and falls back to scanning
`[data-wr-obs]` triggers. A token that is not `[A-Za-z0-9_.:-]{1,64}` is **skipped rather than
escaped into a selector**, and a failed recovery returns null — the editor then shows the candidate
list instead of choosing.

**Measured on the real 9,929-binding template:** 9,929 bindings → 9,929 distinct full occurrence
keys, **0 keys spanning more than one slot**. 262 dynamic bindings; **262/262 sound** with the
trigger; **22** would get a strictly *wider* candidate set without it, and **94** would be merely
*ambiguous*; single-slot resolution 168/262 → 182/262 with the trigger. Element granularity is real:
clicking a 2-slot anchor shows **both** candidates rather than silently picking one.

**Independently re-driven.** Auditor 2 re-implemented the inversion from the raw artifacts and
compared against whatever the editor answered for the node the bridge actually reported: `n000021` →
`['global.header.nav.product']`, matching; `n000027` → the 2-slot anchor, both members, matching. For
the dynamic case they opened the header portal (it mounts on **click** of trigger `n000021`, not
hover), found 15 leaf `data-wr-dyn-node` elements of which 10 carry bindings, clicked
`data-wr-dyn-node="t000012"` and got `kind='dynamic-template'`, `triggerRecovered=true` and exactly
the trigger-keyed set — identical to their own inversion.

**Coverage gap, undisclosed until now:** **no check in `scripts/smoke-visual-editor.ts` clicks a
mounted dynamic-template element in a browser.** `dynTrigger` appears once, at line 345, in a
server-side unit test with `dynTrigger: null`; `data-wr-dyn` appears once, at line 1057, in a
*negative* `data-wr-slot` assertion. The Phase-4 verifier reported this and asked for one check that
clicks trigger `n000021`. It is in none of that handoff's 11 limitations. The behaviour is proven —
three independent agents drove it live — so the exposure is **silent regression**, not a broken
feature.

---

## Text Editing

Click → the inspector names the slot key, canonical role, type, scope, page/route, editability,
current value (authored ?? default), default, the *original's* character/word count and rendered
width/height/lineCount per viewport, evidence tags, the full rendered-binding table, and — when a
content run is on the accepted lineage — origin / disposition / customerFacing from
`slot-accounting.json`.

**Fields deliberately not shipped**, and the payload carries a `fieldsNotAvailable` array the UI
prints so their absence is visible: `maxCharacters` or any length limit (the template refuses to
derive one — constraints are a *reference*, not a limit); x/y position (a slot has no coordinates);
human approval (`editability:"review"` is the compiler's confidence and `disposition:"human-required"`
is the engine's — the panel says in words that opening or editing a slot records **nothing** about
human approval; 1,493 of 3,079 linear slots are review); `assetId` as a slot field; and per-binding
"visible right now".

**One edit updates every bound occurrence.** Proven on `plan.main.text.projects` (5 bindings: 2
static desktop, 1 dynamic-template desktop under trigger `n000094`, 2 static mobile). The inspector
shows "5 rendered bindings" *and* "3 in this view" with the surface breakdown. One Save took the
served `/plan` from 0 occurrences of the new value to 5+, rendered in both the desktop and mobile
trees. The editor writes **one** `authored.slotValues` entry; the template's own applier fans it out
with its `expectedValue` guard. The same mechanism covers the aria-hidden paint twin.

Auditor 2 drove it end to end: `authored.slotValues['global.header.nav.customers.label']` set,
revision r004, and the re-fetched preview really serves the string.

---

## URL / CTA Editing

`SlotDefinition.groupId` is real on this data — **1,553 of 3,079 linear slots across 635 groups**.
The editor renders a group as *N* `Button label` fields plus one `Destination` field, and never
assumes a pair: `home.main.cta.new-loops` is one `.href` plus `.label.01` ("New") plus `.label.02`
("Loops →"). **194 groupIds hold exactly one slot** (190 of them `image.content`) and the inspector
degrades to the single-slot form rather than rendering an empty group.

Auditor 2 drove the Destination field on a `urlKind=internal` slot: `…customers.href` set to
`/audit-dest-…`, revision r005. A separate check asserts a URL edit lands on the **href** slot, not
its label sibling.

**Minor defect, measured not inferred.** Saving from the group form writes the **untouched sibling
slots** as authored values too. Auditor 2 changed only the label textarea and pressed Save; revision
r004's `authored.slotValues` contains both the new label *and*
`"global.header.nav.customers.href": "/customers"` — the template default, which they never typed.
Consequences: the authored count shown in the registry and bootstrap **overstates** what the operator
actually authored, and the default is frozen as a human decision, so a later template recompile that
changes it no longer flows through for that slot. The panel discloses the storage shape ("Saved as
INDEPENDENT slots — the group is a view, not a storage unit") but not that untouched members are
written.

---

## Image Editing

Click a real `<img>` → the image panel offers a replacement file and alt text. The write lands in
`authored.assets`, *not* in `authored.slotValues`: auditor 2 confirmed `authored.assets` gained
`ai000036 = {file: …/audit-red.png, alt: "AUDIT alt text"}` at revision r006, with the
`authored.slotValues` entry for that image key **absent**. The suite additionally asserts the
replacement repaints the rendered pixel.

In the preview, an image replacement costs **5 ms median** because no media set is copied — one
authored replacement is one file write, served by the proxy's per-request disk read.

---

## Logo / SVG Brand Editing

The Logo tab records a **whole-host** brand decision (REPLACE / REMOVE / PRESERVE) against a brand
surface id, not a slot. Auditor 2 drove REMOVE on a real surface:
`authored.brand['bs-image-alt-7d6c73065975'] = {decision:'REMOVE', updatedAt: …}`, revision r007.
The suite asserts that a **PRESERVE with no reason is refused** — a preserve is only a decision if it
carries its reason.

On the Switchyard canary, 80 brand decisions went through `POST /api/brand`, one per host. The first
pass recorded 64 and **refused 16** — the `svg-symbol-id` hosts — with the message *"a REPLACE with
nothing to ship is a gap, not a decision"*, even though the resolver ignores the payload for that
surface and only renames ids. Re-sent with a payload, all 80 carry a decision. The build's own bake
report then shows 74 hosts (the other 6 left with the disabled route and are reported as
`unknownIds` rather than silently dropped — 74 + 6 = 80 closes).

---

## Theme Editing

The Theme tab writes `authored.theme.tokens`. Auditor 2 set `color.canvas` to `#0f9d58` and got
revision r008. The overlay is generated by `generateThemeOverlay` — the same pure function the theme
StageRunner calls — so the preview and the bake cannot diverge on it. Because the served HTML is
byte-identical by construction, a theme edit needs no navigation and cannot affect hydration:
**71 ms** median builder-measured (57 ms in auditor 3's re-measurement) in the preview, 419 ms
median on the canary's larger lineage.

`AuthoredEdit` has no `set-theme` op; `src/editor/commit.ts` composes the new `AuthoredState` and
hands it to the same `commitAuthoredState`, re-deriving the no-op guard from `hashAuthoredState`.

---

## Revision / Undo

**The transaction boundary is explicit.** A keystroke calls `POST /api/preview-value` (debounced
250 ms) and writes the *preview overlay only* — no project write, no revision. An explicit **Save**
calls `commitAuthoredEdits()` and appends exactly one revision, and none at all when nothing moved.
Measured: 7 keystrokes → 0 revisions while the typed value *was* already served by the preview and
was *not* in the authoritative authored state; the single Save that followed → exactly 1 revision;
re-saving the identical value → nothing.

**Undo appends; it never rewrites.** `restoreAuthoredRevision` appends the earlier snapshot as a new
head with `origin:"restore"` and `restoredFrom` set, and every pre-existing revision record is
byte-identical afterwards.

**The one-step-toggle defect is fixed and independently re-proven.** The integration phase measured
that `undoLastRevision` always restored `chain[length-2]`, so pressing Undo twice restored the state
the first Undo undid — carried honestly as a finding rather than hidden. Auditor 2 tested the fix
without being told the answer: three Saves grew the chain 9 → 12 with every earlier record
byte-identical; three presses of Undo walked the authored value through **three different states**
(set size 3 — the old defect would have oscillated between two), grew the chain 12 → 15 with the tail
`r012←r010, r013←r009, r014←r008`, each `origin:'restore'`, and produced three distinct
`authoredStateHash` values. The transitive backward walk lives in `src/editor/commit.ts`
`undoCursorIndex`.

**Note:** revision append is O(n) per call (it re-reads the whole chain) — a Task-27 risk that is
still open and now has an Undo UI on top of it. The Switchyard canary reached **112 revisions**.

---

## PageRegion Consumption

The editor is a **consumer** of the Task-27 PageRegion compile, not a new authority. On linear it
reads `data/linear.app/page-regions/2026-08-26T16-14-07-901Z`: **68 regions, 25 on the home page**
(both figures independently re-derived from the raw artifact by the reconciliation agent).

The region compiler, its selection policy and its ids are **untouched**. `REGION_COMPILER_VERSION`
exists precisely because a policy change moves every id, and an authored decision keyed on a moved id
addresses nothing. Correspondingly, a disabled-region record stores **no** node ids, slot keys, page
ids or interaction facts — everything is re-derived from the artifacts on every resolve, so a
template recompile that moved an id is **caught** rather than applied blind.

The editor records `auxiliary.pageRegionsDir` on the first enablement write, which is what makes
`release:build` resolve the same compile. Auditor 2 observed that write happen
(`undefined → data/linear.app/page-regions/2026-08-26T16-14-07-901Z`). **Named limitation:** for a
project whose region compile is older than its template, this records the *old* compile; the
divergence is reported but the editor does not choose the newer artifact on the operator's behalf.

---

## Region Enablement

The operator's "I don't need this section" is recorded as a **disable of a PageRegion id** in
`authored.disabledRegions`. The Recon Template is never mutated; the disable becomes physical only in
the **build copy**, at the same point in the bake where `bakeContent` / `bakeSeoTitles` / `bakeBrand`
already mutate that copy. `applyEnablementToApp` removes the region **root node** and with it the
whole subtree. A render-time `hidden` flag was rejected because it would leave the markup in the
shipped bytes, where the bake's own source-brand census still counts it and "view source"
contradicts what the operator was told.

`authored.disabledRegions` and `authored.disabledRoutes` are **two** optional maps, never one mixed
map — they stale different stages, are refused for different reasons, and one map could not express
"this region is off everywhere" and "this page is off" without one of them lying. Both are deleted
when their last entry goes, following the `authored.assets` / `authored.brand` precedent, because
`AuthoredStateSchema` is `.strict()` and a required-but-empty map would change the hash of every
historical authored state and manufacture a spurious revision.

**Resolution is re-run and re-safety-checked on every build**, never trusted because an edit was once
accepted.

**Auditor 2's census on the real compile**, from a clean authored state, evaluating a disable scoped
to the single route being viewed for every (region, route) pair: **103 pairs — 42 ALLOWED, 61
REFUSED**; 42 of the 68 distinct regions are disableable from at least one route, 26 never are. Per
route: `/` 14, `/plan` 11, `/pricing` 11, `/customers/automattic` 4, `/security` 2, the other three 0.
On the home page specifically, 25 regions render, **14 disable cleanly, 11 refuse**.

The positive case was driven through the real UI: region `p000001:rgn:main1:div:2>a:1` disabled with
status *"disabled 1 region(s) on 1 route(s), 1 slot(s) (revision r004)"*, one revision appended, and
root node `n000487` present in the served page before and gone after.

---

## Route Enablement

The operator turns a page off. Recorded as `authored.disabledRoutes[routeKey]`, physical only in the
build copy: the route leaves `route-map.json` and, when no remaining route reaches it, its page tree
is **deleted** from the copy.

Refusals: disabling **every** route is refused (`last-route`) in the analysis **and again in the
applier**, which throws rather than exporting a site with no page; the SEO plan generator refuses the
same case independently. An unknown route key is refused (`unknown-route`). Disabling one route of a
many-to-one page group removes only the route-map entry — the page stays because its sibling route
still needs it, and is reported as `sharedWithEnabledPageSourceIds` rather than orphaned.

Measured on the real fixture build: SEO plan routes 2 → 1 with no title/description/canonical/og/
twitter/jsonLd block for the disabled route; sitemap exactly 1 `<url>`; 1 head block, not 2;
`pricing.html` **absent** from the shipped package; deploy manifest 1 route; production QA 0
failures with the package's own site-wide link audit reporting no anchor resolving to the disabled
route; and **re-enabling restores both**.

On the canary, `/customers/automattic` was disabled through the real authored write API. Auditor 3's
whole-package scan of 439 files, case-insensitively folded: **0 files named for the slug and 0 files
containing it**; sitemap 7 `<url>` entries, none of them the disabled route; 0 of the package's 178
distinct broken internal destinations is the disabled route.

**Bound declared:** route ON/OFF is covered at engine and suite level (33 `§P6` checks in
`scripts/smoke-enablement.ts`); **no auditor drove a route disable through the UI**, and the F2
cascade re-adjudication behaviour was not re-driven either.

---

## Shared-page Safety

A region's **route blast radius** is `region.pages[].routes`. It is *not* `slot.route` (the
recon-template grouping records the first route serving a page) and it is *not* derivable from the
regionId, which is namespaced by `pageSourceId` and cannot name a route at all. A request naming a
**strict subset** of the radius is refused with `shared-page-blast-radius`. Naming a route the region
does not render on is refused as `route-not-in-region-radius` — a no-op recorded as a decision is
still a lie.

The real counterexample is stripe: **20 routes over 18 pages, 2 many-to-one groups** (`p000012` and
`p000013` each loaded by two routes).

**The F3 open item is closed, and the read-first document has not caught up.** Auditor 2 stood up
their own Chromium against a fresh stripe release project and discovered the subject from the
artifacts, hard-coding nothing. They took `p000012:rgn:aside1:self`, whose refusal names exactly one
`pageSourceId` and two routes. Both routes served the region root `n000358` (200) before the click.
Clicking Disable while viewing one route rendered, **on screen**:

> region `p000012:rgn:aside1:self` lives on page(s) p000012, which 2 route(s) load —
> /resources/more/virtual-credit-cards-for-businesses-explained would be physically changed too.
> The region id is namespaced by pageSourceId, so there is no id at which this can be done for
> /resources/more/arr-loans-explained alone.

…with `data-wr-affected-routes` carrying both routes, and **nothing was written** (revisions 0 → 0).
Taking the offered remedy did exactly what the warning said: *"disabled 1 region(s) on 2 route(s)"*,
one revision, `n000358` gone from **both** routes, the other route still 200.

`scripts/smoke-editor-integration.ts` has carried a `§4` stripe UI journey (`28.P8.38-44`, including
a check literally named **"F3 CLOSED"**) since before the final regression. Nonetheless
`docs/result/handoffs/28-resume-state.json` — *the document the contract tells the next session to
read first* — still records `F3 (open): nothing proves the stripe route→page many-to-one shared-page
refusal THROUGH THE UI`. That is stale, and it is the same failure mode this program has been
fighting. **Treat F3 as closed.**

---

## Interaction Safety

A region can be the **target of an interaction** — the content a menu or portal mounts. Disabling it
blind would leave a trigger that opens nothing. Two refusal codes cover it:
`interaction-cut-target-unreachable` and `interaction-cut-target-disabled`.

Auditor 2's 103-pair census on the real compile counted, across all pairs:
`interaction-cut-target-unreachable` **64**, `global-region-requires-explicit-global` **60**,
`shared-page-blast-radius` **40**, `interaction-cut-target-disabled` **3**. All three named hazards
fire on real data.

Through the UI, `28.P8.10` asserts the operator is told **which enabled trigger drives the content
this disable removes, and which region would have to go with it**.

**F2 stands as measured and must never be "fixed" into a comfortable zero.** Taking the offered
cascade is itself an edit: the engine re-runs every rule over the whole transaction. On linear,
accepting the cascade for two named regions returns **20 refusals, not zero**. The hazard no cascade
can fix carries no retry of its own — `28.P8.35` asserts the refusal set is non-empty and *prints*
the measured count rather than hard-coding a zero, with the check text itself saying it must never be
softened.

Auditor 2 confirmed in the real UI that the **rendered** refusal code set equalled the engine's set
exactly in each of three cases (2, 2 and 10 refusals), and that every refusal survived two full
inspector re-renders.

**Minor UI defect:** a refusal's one-line status summary can be clobbered by an asynchronous
preview-ready event. On the first refusal of the enablement journey `#wr-status` read "preview ready
/" instead of "REFUSED (2) — nothing was written"; the next two read correctly. The **persistent
`#wr-refusals` panel** held in all three cases, so the delivery guarantee is intact — but the status
line is not a reliable second surface.

---

## Navigation Cascade

A link to a disabled route is auto-removed **only when the removal is deterministic**: the binding's
surface is `static` (so its nodeId *is* the anchor) **and** the anchor's subtree contains no slot
outside that url slot's own `groupId`. The `groupId` condition exists because removing the anchor
takes the paired **label** with it, so a label is never left orphaned pointing at nothing.

Everything else becomes an **actionable requirement** of the new kind `dead-internal-link`, severity
**release-blocking** — blocking rather than high-value because *"the alternative — silently pointing
it at the homepage — is the one thing this engine must never do."* There is no code path anywhere
that rewrites a link to `/`.

Five reasons produce a requirement instead of a removal: `slot-host-carries-unrelated-slots`,
`anchor-has-no-slot`, `dynamic-template-host` (the nodeId is the *trigger*, and the link lives inside
the frozen captured template string), `paint-twin-host`, and `serialized-markup-host` (added by a
2026-08-28 correction after a verifier found the gap).

**Measured on linear:** disabling `/pricing` produces **2 deterministic nav groups** (header and
footer), **28 anchor nodes** = 7 enabled pages × 2 viewports (the disabled page's own anchors are not
touched — its tree is deleted), each group removing exactly its href plus its label, and **0
dead-link findings**. After the cascade, **zero anchors anywhere** still point at `/pricing`, and the
exported HTML of the real fixture build carries no `href="/pricing"` at all.

On the canary, the cascade removed **6 nav hosts** and deleted **1 orphaned page tree**.

---

## SEO Cascade

One filter, in `src/seo/production-plan.ts`, applied to `template.routes` **before** the route loop —
which is the single place title, description, robots meta, canonical, the whole OpenGraph block,
twitter and JSON-LD are produced. `robots-sitemap.ts` builds the urlset from `plan.routes` and
`render-head.ts` iterates `plan.routes`, so one filter removes the route from all of them. The route
table is filtered in the build copy, so the static export, `next build`, the head splice, the
per-route brand census and production QA all see the enabled set.

On the canary this produced, from `[production] enablement: 1 route(s) off (7 remain)`:
`customers/automattic.html` absent from the export; sitemap exactly **7** `<url>` entries;
robots.txt structurally unaffected; and none of the 9 served HTML files referencing the route in any
head block.

---

## Template Library

`GET /api/templates`, backed by a **fresh scan** (`scanTemplates()`), never the `.registry/*.json`
cache — so a template compiled since the last register still shows up. Columns: template id, source
host, route count, core-reconstruct count, structure-only count, collection count, createdAt. Every
column traces to a named field on `TemplateEntry`; nothing is invented and nothing is backfilled.

Measured: **8 templates on disk** (the report agent re-counted: 8 `recon-templates` directories).
Sample `stripe.com-2026-08-26T22-38-06-075Z`: 20 routes, 10 core-reconstruct, 10 structure-only,
3 collections. Across every template: **2 of 8 carry compiled collections (3 each), 6 carry none** —
a figure this handoff originally got wrong ("7 of 8 empty") and corrected with a `corrections` block.

Both new routes are proven not to touch the editor runtime: `startEditorServer`'s `runtime()` /
`openSite()` callbacks were stubbed to **throw** and the routes still answered 200 — a structural
proof, not a comment.

---

## Site Library

`GET /api/sites`. Columns: display name, siteId (with its adaptation stated when derived), source
template, status, updatedAt, revision (document revision + authored chain HEAD). Two honest facts are
now printed **on the screen** rather than only in a document: an artifact the scan could not read is
named as missing, and a value that came from `adaptReleaseProject`'s in-memory upgrade of a
pre-Task-27 document says so.

The site counts in the handoff are explicitly point-in-time (25 → 26 at the Phase-8 run, 31 at
correction time) and the document says they are not retroactively checkable. The report agent
measured **39 release projects on disk today**, inflated by suite fixtures and by three audit
projects. Treat the count as a live number, not a result.

**Named, not fixed:** the Site ID column is **not unique** — several `siteId` values are shared by
more than one project on disk. `siteKey` / `projectId` / `projectDir` are the unique keys, are
present in the payload, and are shown in no column.

**No database and no auth exist or were added.** Both new routes read the same filesystem registry
every other editor route reads.

---

## Create Site Workflow

`src/release/create-site.ts`. `selectRouteScope()` reads the **template compiler's own** per-route
scope verdict from `site-map.json`, never re-deriving it from slot bindings — and this is not
taste. A binding-count heuristic was measured and got a real case **wrong**:
`/resources/more/virtual-credit-cards-for-businesses-explained` shares its rendered page with its
family's representative, so a binding count says 9 zero-slot routes where the truth is 10. Reading
the compiler's own `scope` gets all 10/10 right.

`createSite()` orchestrates: content generation from a Brief → production compile against the
template's **shared per-host** theme/SEO/asset artifacts, auto-discovered by templateId match and
never guessed → registration as a new independent release project through the existing
`prepareReleaseProject`.

**Identity** resolves as: explicit `siteId` (verbatim, re-prepare allowed and *reported*) >
`brief.workingName` slug > the goal's first six words slugged > `site-<10 hex>`. **The host slug is
never a fallback** — that was a real defect found on the first journey run, where a second Create
Site from the same template re-prepared the first customer's project. A derived identity that already
exists steps to `-2`, `-3`; an explicit one never steps. All four identity fields are reported on the
API response, the Library screen and the log line.

**It refuses rather than substituting.** Called against a template with no matching theme run, it
threw `CreateSiteError` naming exactly what was missing, and no release project or production spec
was written for the attempt.

**One real end-to-end run:** stripe template, brief only, provider `fake` — 4,699 units in 124
batches, **6,813 assigned slots, 578 unresolved, 1,052 requirements** (55 release-blocking). The 578
unresolved is the *correct* outcome for a brief with no supplied facts: every unbacked factual claim
stayed needs-input rather than being invented. Auditor 4 re-derived all three figures from
`slot-accounting.json` and `requirements.json` — and note that the project was **regenerated by the
final regression battery** on a fresh content run and still yields 1,052, so the figure is
reproducible, not a frozen snapshot.

**Named race, not claimed to be locked:** two `createSite` calls running truly concurrently against
the same derived base id.

---

## One Brief → First Draft

Customer **Millwright** — a coherent independent fictional business (AI workflow automation for
discrete manufacturing), not Linear or Stripe reworded. One brief, 47 facts, truth mode
`verified-only`, typed into the Create Site form in the Library screen **by Playwright** — the goal
textarea, five optional fields and one facts textarea — and POSTed to the same `/api/create-site`
endpoint the editor's own client calls. No CLI, no fixture.

Result: `linear.app/millwright`, siteId derived from the working name, `reprepared: false`,
`releaseState: PRODUCTION_INPUTS_REQUIRED`, template proven unmutated by whole-directory
`dir-sha256-v1` before and after, computed by `createSite` **and independently by the suite**.

**Three seam gaps were found and fixed rather than narrated:**

1. Create Site's only wired provider was `FakeContentGenerator`, so one brief produced a site whose
   every text slot read "Fake …". A brief-driven writer (`src/content-injection/brief-writer.ts`) now
   composes the draft from the operator's own brief and is the default.
2. The Visual Editor seeded its preview from `authored.slotValues` **alone**, so a freshly created
   site opened showing the *source site's* copy while the bake would have shipped the draft. The
   editor now layers the content run's overlay under the authored edits, in the same order
   `src/production/bake.ts` stacks them, and the inspector reports which layer a value came from.
3. The host-slug siteId defect above.

**Rendered in a real browser:** `/pricing` 5 of 5 route-specific values rendered, `/security` 28 of
28, `/plan` 36 of 40, and 0 browser runtime errors across the journey. That measurement itself had to
be fixed: the first version matched the iframe URL by *prefix*, got the previous route's frame back
three times and reported three pages with byte-identical text; the suite now compares the frame URL
exactly and asserts the three documents differ.

**Timings:** cold run — editor startup 2,841 ms, preview start 2,729 ms, Create Site 5,544 ms
(measured **in the browser**, from click to result text), open new site 2,967 ms. Warm — 452 / 343 /
5,694 / 731 ms. Create Site breaks down as 1,202 content units in 36 batches, `next build` 2,768 ms
read from the compile's own log line, and ~2.8 s of everything else.

**Requirements: 287** — up from 271 after the correction pass, because 16 fact-bearing value-shaped
slots the writer now **withholds** are named needs-input rather than filled with composed copy. An
honest increase in blockers.

**Traceability defect, named:** the 287 is not reproducible from the project directory the document
cites. `smoke:first-draft` recreates `data/linear.app/release-projects/millwright` on newer lineage
every run; it now holds **202**. The 287 is traceable in four other projects. The document carries no
point-in-time caveat, and it should.

---

## Full-site Content Generation

One hand-authored brief drove the real 8-route linear template through packet → derivation plan →
batched generation → ingest → accounting → cross-page review.

**The measured canary** (`data/linear.app/content-runs/wr28-phase9-fullsite`), every figure
re-derived from the artifact by auditor 4: 3,079 in-scope slots; 1,202 content units; 1,512 slot
values; 73 image briefs; dispositions **applied 566 / preserved 1,020 / human-required 1,493 /
unresolved 0**; origins **derived-copy 721 / generated-marketing 739 / synthetic-fact 52 /
source-preserved 1,567**; all 8 routes carry written values; `reconciled: true`. The authoring plan
has 6 levels, 8 page plans, 48 regions, **0 orphan units and 0 orphan regions**. Cross-page
consistency review: 10 checks, 0 errors, 1 warning.

**Two new artifacts:** `authoring-plan.json` — the derivation chain brief → site → page → region →
unit → slot as a *checkable artifact*, each node recording the parent it came from and how, with a
closure block that names every orphan; and `report/consistency.json` — 10 deterministic cross-page
checks, **report-only**: it never rewrites a value and never fails an ingest.

**Three findings worth your attention:**

- **F1:** 106 of the 117 needs-input entries on the prior linear run were a **manufactured blocker** —
  every one an in-page anchor or skip-to-content target, which carries no fact and has exactly one
  correct value. The prior "honest-looking" INPUTS_REQUIRED figure was inflated by ~90%. The 11 real
  ones are individually decided and individually rationalised.
- **F2:** one external destination was deliberately **not** rebranded — a link to a public protocol
  specification, carried verbatim as derived-copy and explicitly *not* marked synthetic, because
  marking it so would falsely claim the engine invented a destination it did not.
- **F3:** a source statistic survived because it *equalled the source default*. `verified-only` does
  **not** protect a rebranded page from carrying the source's statistics unchanged — a property of
  the truth mode worth knowing. Fixed: a value identical to the source default that carries a fact
  shape is now recorded as `source-fact-carried-over` in both modes and refused under
  `verified-only`.

**The value-shape guard.** A verifier read the draft and found two of eight routes unusable: the
pricing table read "$10 per user/month" → "Shorter changeovers"; the changelog date column read
"August 20, 2026" → "Paper traveller". The writer now classifies a source value's **shape** before
composing: fact-bearing shapes (price, percentage, multiplier, counted quantity, certification,
attribution) are never overwritten and never silently kept — they become **named needs-input quoting
the source figure**; chrome shapes (date, time, version, numeric chrome, glyph) are kept verbatim.
Measured on the draft: 443 value-shaped text slots, **0 overwritten with composed copy**, 16
fact-bearing named needs-input, 211 chrome kept verbatim. Six named slots are pinned by the suite so
this cannot silently regress.

**Bounded coverage, declared:** the Phase-9 canary suite is **offline** — it starts no browser and
does not run `runContentLayoutQa` over the 8-route canary, so **layout safety of the new values is
unverified in a browser**. That gap is still open after the correction pass and the document says so.
Only the linear template was exercised at full-site scale.

---

## Slot Accounting

The accounting artifact is the honesty instrument of the whole content layer, and it was hardened
after a verifier found it could close by shrinking its own predicate.

`slot-accounting.json` now derives the expected population **from the template itself**:
`reconciliation.templateCoverage` reads the template's own `slots.json`, and `complete` is part of
`reconciled`. An account that closed by excluding half its population can no longer report itself
reconciled — the verifier's mutation (deleting the review-slot half of `inScopeSlotKeys`) now fails
seven checks instead of none.

On the Phase-9 canary: `templateSlots 3079`, `scopedTemplateSlots 3079`, `accountedOutsideScope 0`,
`unaccountedSlotKeys []`, `complete: true`.

On the Switchyard production canary the same instrument gives **unresolved 0** for enabled
customer-facing slots — with the disabled surfaces accounted **separately and not hidden**:
`disabled-route 100`, `disabled-region 72`, and the account reconciling over the whole 3,079-slot
template.

**Honest split, stated so `unresolved = 0` is not misread:** on the Phase-9 canary, 1,020 slots are
`preserved` (946 because a written value was identical to the source default — a decision — and 74
because no value was produced) and 1,493 are `human-required`. **Zero unresolved was not achieved by
writing new copy for every slot.**

---

## Production SEO

A real **indexable** production build ran end to end for the first time: real crawled-site lineage,
real authored content, a schema-valid RFC-2606-reserved `.example` production domain, real font and
asset resolutions, a real `next build` static export, and a real isolated-package QA pass. No live
DNS lookup was performed anywhere.

**Both directions proven on real artifacts.**

*Direction 1 — blocked while blockers remain.* With only `productionBaseUrl` resolved (2 font + 84
asset release-blocking requirements still open), the dry run printed `BLOCKED BY production:` with 86
ids, and the **real** build ran and reported `blocked: production` / `PRODUCTION_INPUTS_REQUIRED`.
`stageStatus.production` stayed pinned to the old artifact whose gate decision is still `preview`, and
`ls -dt` confirms **no new spec directory was created**. A domain alone flips the *plan's* internal
mode; the servable **build** never regenerates while blockers remain.

*Direction 2 — indexable once the gate resolves.* With the full pack resolved: dry run shows zero
entries under BLOCKED BY, the real build ran, isolated-package QA 77/77, `indexabilityGate.decision:
"indexable"`, `blockers: []`.

**Auditor 3 proved both directions again from the artifacts** and then exercised the enforcement as
pure functions: `productionSpecSchema` **refuses** a spec that is `indexable` while naming even one
blocker (they injected one into the real indexable spec — `safeParse` returned false with the
refinement's message), and `applyBlocking` + `releaseBlockers` behave in both directions, with an
`accepted-limitation` status still blocking and a `preview` target not blocking.

**Preview is honestly noindex.** On the preview build: `<meta name="robots" content="noindex,nofollow">`
on every content route, canonical **absent**, og:url **absent**, `robots.txt` is `Disallow: /` with no
Sitemap line, and `site/sitemap.xml` is **absent** (only a non-final `sitemap.preview.xml` exists).
On the indexable build: index,follow, canonical and og:url on the production domain, robots Allow +
Sitemap, sitemap with 7 urls. `404` / `_not-found` are noindex in **both**.

**A real SEO defect was found by the verifier and fixed in code.** The shipped build gave **every
route the identical `<title>`** while the phase reported them as per-route — the plan's own `basis`
field said `content-run:sitePlan.siteIdentity`, a *site-level* string. Duplicate `<title>` across
every indexable route is a real defect, and *no check in the program measured title uniqueness*,
which is how it shipped unnoticed. Fixed: `deriveRouteHeadings(units, slotValues)` derives a
per-route title from **the customer's own authored content** — hero headline first, then a nav label
whose sibling `.href` value is exactly this route key — with the home route deliberately keeping the
site-level title. Nothing is invented, truncated or reworded: a candidate that is empty, head-unsafe
or over 70 chars is **rejected** and the route keeps the site-level title, with the fallback stated in
its own `basis`. New detector `checkTitleUniqueness` measures duplicates. The later builds carry 8/8
and 7/7 distinct titles, independently verified.

**Source-domain absence, re-measured.** 0 occurrences of the source host and 0 word-boundary
occurrences of the source brand word inside every head block, every `<title>`, `sitemap.xml` and
`robots.txt`, on three separate builds. Whole-package: **18** occurrences of `linear.app` — *not the
12 this document originally shipped*, corrected after a verifier found two files the original count
missed; auditor 4 re-ran the grep on all three builds and got exactly 18 each time. None is an SEO
surface: 10 are one literal example URL in body copy duplicated by three encodings, 1 is an
un-rewritten image src, 1 a provenance comment, and 6 are operator/provenance metadata that
deliberately name the source lineage.

**Disclosed, so "indexable" is never read as "shippable":** the indexable package still carries the
source brand **in its body** — 752 word-boundary occurrences across the 7 served route HTML files of
one build. None of that is an SEO surface, the `source-brand-inline-svg` requirement stayed open, and
the project's `releaseState` correctly stayed `PRODUCTION_INPUTS_REQUIRED`.

---

## Full Production Canary

Customer **Switchyard** — a *third* fictional business (dispatch workflow for freight brokerages),
deliberately not Millwright reworded, on a fresh project no earlier phase had touched. Template:
linear.app 2026-08-25T21-53-26-980Z (the smallest accepted template that still exercises every
feature). **No new source crawl was created.**

Final: `releaseState: PRODUCTION_READY`, target `indexable-production` on `switchyard-canary.example`,
spec decision `indexable`, **0 spec blockers**, isolated-package QA **70/70** over 7 served routes,
**112 revisions** on the project, authored state carrying 151 slot values, 1 theme token, 224 assets,
80 brand decisions, 1 disabled route and 1 disabled region.

**The journey** — Create Site → full First Draft → open Preview → select Home → click Hero → edit
headline → save → each inspector → region off → route off → build — went entirely through the
editor's own endpoints, with a real Chromium. One brief produced 1,491 slot values across 8 routes in
5,868 ms.

**All 13 zero-gates measured 0**, and auditor 3 did something no gate did: **proved all 13 fire under
injected conditions** (the brief asked for 4). Injections went into scratch copies in `/private/tmp`,
never into `data/`, and were reverted byte-identically with `cmp`. Examples: injecting an anchor to
the disabled route into `customers.html` fired G5; adding a `<url>` for it to the sitemap fired G6;
rewriting `index.html`'s canonical to the source domain fired G8; deleting one authored value from
its own route's HTML fired G10 *naming the slot*; injecting a recon-template path fired G13;
re-inserting the disabled region's root node id fired G7. On scratch copies of `report/qa.json`, G9
fired 3 and 2, G11 fired 4, G12 fired 1, G4 fired 1; on the requirement artifacts, G1 fired 5, G2
fired 1, G3 fired 1. **13/13.**

**The package is genuinely independent.** Auditor 3 copied all 439 files / 245 MB **outside the
repo**, statically scanned the copy (0 files contain the repo's absolute path, 0 contain
`recon-templates`, `reconstructions` or `asset-materializations`), then started the package's **own**
`server.mjs` under `sandbox-exec` with `file-read*` on the repo's `data/` **denied** — proving the
denial real first (`readdirSync` on `data/` → EPERM, `readFileSync` of the source template manifest →
EPERM). Result: **all 7 routes 200** with titles matching the deploy manifest, plus robots, sitemap,
theme overlay and every sampled chunk and media asset; in Chromium, **0 console errors, 0 hydration
errors and ZERO off-origin network requests** across all 7 routes.

**Ten honest non-zeros are reported rather than papered over** (F1, F3-F11), each asserted by a check
with its real number so it fails loudly if it silently changes. The most important:

- **F1 + F8 — the paint-twin gap.** **481 of the 2,301 enabled text slots bind only a 1×1 node**; the
  operator wrote 30 of them, and 6 authored values ship *beside* the source value they replaced,
  including the whole `/pricing` price list. Owner: `src/recon-template/twin-binding.ts` — **blocked
  by contract**, because the Recon Template is immutable and Exact Reconstruction is frozen.
- **F3** — 1,287 enabled text slots serve their source default verbatim, 661 of them long and
  visible. (Both filters that produce the 661 are now printed in the check's own detail line, after a
  verifier caught a silent cap.)
- **F4** — 1,038 internal anchors over 178 destinations 404, one of them the journey's own CTA,
  accepted with a validator **warning only**. The owner is named: `broken-internal-route` should
  collect a requirement, not warn.
- **F9** — the package's 7 indexable routes carry identical `<title>`s. The detectors now exist; the
  package predates them and has not been rebaked. **Not** an open detector gap.
- **F10** — 189.1 MB of source-owned audio/video ships; 169 of 380 media files (195.2 MB) are
  referenced by nothing. Auditor 4 re-derived all three figures exactly.
- **F11** — 5 of 7 `acceptedLineage` refs are older than what shipped.

Two gate-wording issues auditor 3 raised, neither a regression: **G4**'s "anchors pointing at the
disabled route" half reads a previously-recorded `report/qa.json`, so it cannot see a link that
enters the package after QA ran (G5 covers the same condition on the live bytes; the wording
overstates freshness); and **G2**'s label reads as "no source-brand leaks" while it counts only
*release-blocking* brand-leak requirements — 6 unresolved high-value ones exist, disclosed in the
gate's own source text, with no severity re-priced.

---

## Brand Independence

Two different questions, two different answers.

**Is the shipped canary package brand-independent?** On the measured axes, yes, and it was verified
by someone other than the builder: 0 markup brand surfaces, 0 inline-flight, 0 `.txt`-flight, 0
post-hydration, 0 `<symbol id=*linear*>`, 0 `<svg aria-label=*linear*>` over the shipped bytes;
0 source host and 0 source brand word in every head block, title, sitemap and robots.txt; 0
off-origin network requests in a real browser from a sandboxed copy.

**Is the instrument that certifies that sound?** **It is now — it was not when this program first
adjudicated.** As shipped at first adjudication it was blind to the one surface class whose mark is a
*file* rather than a text token, and the branch order let a PRESERVE be scored as output proof. Both
are closed (see *The fix, and how it was falsified*): every one of the six resolvable brand surfaces
now has a matching census axis on the markup **and** the flight encoding, and `preservedAfter > 0`
outranks the census entirely, so the verdict no longer depends on the census being complete. The
canary's zero was re-derived under the stricter instrument and held at 0.

**The instrument now errs toward blocking, not toward clearing** — the correct direction for a
release blocker. Because `imageSrcPath` uses the identifier matcher on a path, a genuinely neutral
asset whose filename merely *contains* the brand token (`/wr/assets/linearGradientBg.svg` on a
linear.app lineage) counts as 1 and an operator must adjudicate it. Confirmed by probe. That is a
false *non*-zero, never a false zero.

Three further honest limits, all named by the phase itself: arbitrary SVG `<path>` geometry that
draws the source mark without naming the brand is **not detected and not resolved** (a detection
limit, out of scope by the settled "no SVG path editor" constraint); `dynamic-template-content` is
**unowned** — no artifact records brand inside dynamically-mounted region content separately from its
host route; and `attribute-value-text` (e.g. `placeholder=`) is unowned and uncounted — found by a
verifier in this phase's **own proof build**, now declared in the product's own bake report so a zero
census cannot be read as covering it.

**The token-blindness mitigation is log-only.** `src/release/collect.ts:724-733` warns when a template
has inline SVGs but zero detected brand hosts — but that warning reaches only stdout. It is in no
`requirements.json` on disk, so an operator reading the artifact cannot see that the axis measured
nothing. The blind condition is constructible on real data.

---

## Regression

*Two batteries are recorded: the program's final regression **before** the close-out fix (the table
below, 2,948), and the re-adjudication battery **after** it (2,970). The second is the number a
future task must protect.*

### After the close-out fix

The final adjudicator re-ran the complete battery **themselves**, one suite at a time through the
mutex — **including `smoke:e2e`**, which ran detached and returned 130/130: **29 counted suites,
2,970 checks, 0 failures, 0 non-zero exit codes, typecheck exit 0, zero negative deltas.** Counts came
from the anchored regexes `/^  PASS  /` and `/^  FAIL  /` on each raw log, not from any suite's own
summary line. No processes leaked; the mutex lock is released.

| | Before the fix | After |
|---|---:|---:|
| `smoke-brand-assets` | 141 | **162** (+21) |
| `smoke-production` | 132 | **133** (+1) |
| all 27 other suites | — | **Δ 0**, each reproducing its exact baseline count |
| **Total** | 2,948 | **2,970** (+22, all newly added) |

Every one of the +22 is a *new* check. Three existing checks were **rewritten — none deleted, none
weakened** — and each rewritten hunk's count went **up**. The most consequential of the three, §3b,
had asserted the **opposite** of correct behaviour; that assertion *was* the defect, and it is now
`28.X1`, which asserts the inverse.

### Before the close-out fix — the program's own final regression

The full battery ran, one suite at a time, through the mutex, each exactly once, sequentially.

| | |
|---|---|
| Typecheck | `tsc --noEmit`, **exit 0**, zero diagnostic lines |
| Counted suites | **29** |
| Checks | **2,948** |
| Failures | **0** |
| Negative deltas vs Task 27 | **0** |
| Drift vs the phase-10/11 gate | **0** on all 28 suites that gate measured |
| Battery wall time | 1,363 s |

Arithmetic closes two independent ways: 2,151 + 223 (growth on pre-existing suites) + 574 (nine new
suites) = **2,948**; and 2,818 (the phase-10/11 gate, e2e excluded) + 130 (e2e, measured here) =
**2,948**. The report agent re-summed the table: 29 rows, 2,948, 0 failures, 20 Task-27 rows summing
to exactly 2,151.

**smoke:e2e — the deferral is repaid.** It was **carried** (asserted without running) at exactly two
gates — phase-7/8/9 and phase-10/11 — **at your explicit direction**; it *did* run at 130 checks at
the phase-2/3 and phase-4/5/6 gates. **The final regression ran it in full:** exit 0, 626 s,
130/130 checks, 0 failures, and all 130 check names byte-identical to the committed Task-27 log. It
cost 46.1% of the 1,359 s of suite time. It is fully local — it stands up its own 127.0.0.1 server,
drives real Chromium, and asserts *"the run records 0 Firecrawl calls"*. **No carried deferrals
remain.**

**Counting method, because exit code 0 is not proof.** Primary figures came only from anchored
regexes `/^  PASS  /` and `/^  FAIL  /` applied to each raw stdout log, then cross-checked against
each suite's own trailer. Two trailer formats exist and **all 29 agreed exactly**. Seven
FAIL-containing lines exist across all logs and each was read individually: **4 are genuine PASS
lines whose text contains the word FAIL** (e.g. *"a conflicting recombination FAILS the run"*), and
**3 are not check lines at all** — two `[content:qa]` diagnostics from a **deliberate negative
fixture** and one section heading. **0 real check failures.**

**A check no gate performed.** Because a count-only comparison cannot see a check swapped out
underneath a non-negative delta — and this program's three gate failures were all about numbers that
looked fine — the regression agent diffed the full **set of check names** against the committed
Task-27 logs for all 20 pre-existing suites. 18 showed zero removals. Two showed one, both traced to
source and both benign: `release` 23.6 was replaced by **three** checks 23.6/23.6b/23.6c (a deliberate
Phase-2 correction — the old assertion counted every inline SVG including icons, coverage went 1→3,
and 23.6c explicitly asserts the old inventory count is still cited *"so nothing was hidden"*); and
`reconstruction` `next build PASS (2273 ms)` → `(2838 ms)`, a check **name** that embeds a measured
duration. Three different agents measured three different values there, which proves it is a label,
not a semantic change.

**Uncounted and disclosed:** `smoke:playwright` was run, through the mutex, deliberately and
separately, exit 0 — and is **excluded** from the 29/2,948 total because it emits zero check lines.
It is the only suite that touches the public internet. 30 `scripts/smoke-*.ts` files exist; 29 are
counted.

**Fifteen of the 29 suites were independently reproduced by four agents other than the regression
author, with zero disagreements:** auditor 1 (selector 81, sitespec 257, reconstruction 217,
recon-template 109), auditor 2 (enablement 101, create-site 66, visual-editor 50, editor-integration
45, authoring-preview 41), auditor 4 (seo 113, production-canary 46), the adjudicator (registry 35,
revision 36).

**Single-run caveat, declared:** each suite ran once, so a flaky-but-passing check would not be
caught. No suite showed any sign of flake.

---

## Per-suite Check Delta

*This table is the state **before** the close-out fix. After it, `brand-assets` reads **162** and
`production` reads **133**; every other row is unchanged, and the total is **2,970**. All 27 other
suites were re-run by the final adjudicator and each reproduced its exact count below.*

| Suite | Task 27 | Task 28 | Δ | Failures | s |
|---|---:|---:|---:|---:|---:|
| verifier | 81 | 81 | 0 | 0 | 7 |
| selector | 81 | 81 | 0 | 0 | 0 |
| multi-observer | 62 | 62 | 0 | 0 | 27 |
| interaction-detector | 92 | 92 | 0 | 0 | 1 |
| interaction-explorer | 108 | 108 | 0 | 0 | 93 |
| interaction-patterns | 88 | 88 | 0 | 0 | 1 |
| sitespec | 257 | 257 | 0 | 0 | 0 |
| reconstruction | 217 | 217 | 0 | 0 | 8 |
| reconstruction-qa | 134 | 134 | 0 | 0 | 146 |
| **e2e** | 130 | **130** | 0 | 0 | **626** |
| recon-template | 109 | 109 | 0 | 0 | 81 |
| regions | 67 | **76** | **+9** | 0 | 1 |
| content-injection | 128 | **161** | **+33** | 0 | 59 |
| content-generation | — | **50** | new | 0 | 1 |
| theme | 47 | 47 | 0 | 0 | 36 |
| seo | 97 | **113** | **+16** | 0 | 2 |
| assets | 140 | 140 | 0 | 0 | 5 |
| production | 100 | **132** | **+32** | 0 | 3 |
| release | 162 | **275** | **+113** | 0 | 92 |
| revision | 24 | **36** | **+12** | 0 | 2 |
| registry | 27 | **35** | **+8** | 0 | 0 |
| authoring-preview | — | **41** | new | 0 | 24 |
| brand-assets | — | **141** | new | 0 | 16 |
| visual-editor | — | **50** | new | 0 | 27 |
| enablement | — | **101** | new | 0 | 6 |
| editor-integration | — | **45** | new | 0 | 28 |
| create-site | — | **66** | new | 0 | 38 |
| first-draft | — | **34** | new | 0 | 15 |
| production-canary | — | **46** | new | 0 | 14 |
| **Total** | **2,151** (20) | **2,948** (29) | **+797** | **0** | **1,359** |

Every positive delta was traced through the full gate lineage (Task 27 → Phase 1 → gate23 → gate456 →
gate789 → gate1011). No suite decreased.

---

## Historical Integrity

**Zero historical mutation.** Auditor 1 swept `data/` for mtimes at or after the program start
(2026-08-27T08:29:44Z = 17:29:44 KST): 120,363 files reduced to 1,005 distinct containing run
directories. **Every** touched run-id-shaped directory is stamped 2026-08-27 (418) or 2026-08-28
(111); the **earliest touched run id is `2026-08-27T09-34-50-356Z`**, after the start. Zero touched
directories carry a run id of 2026-08-26 or earlier. Everything else touched is an explicit Task-28
namespace.

**The KST/UTC trap was hit and corrected, twice, by two different agents.** Run ids are UTC and
mtimes are KST (+9), so a naive local-date sweep falsely flags 2026-08-26-UTC-evening runs. Two
recon-template directories with KST mtimes of 2026-08-27 02:25 and 07:38 are in fact
2026-08-26T17:25:41Z and 2026-08-26T22:38:07Z — pre-program. Auditor 1 also caught a bug in *their
own* first sweep (an awk string-vs-number comparison flagged ~330 directories); redone numerically,
the count is zero.

**All 8 Recon Templates byte-identical.** Per-file sha256 rolled into one tree hash, taken before and
after a suite battery — all 8 identical both times — and `find data -path '*recon-templates*'
-newermt <program start>` returns **zero files**. The report agent re-ran that `find` on all 8
directories: 0 files newer than program start in every one. The 8 tree hashes are recorded in
`28-final.json` so a future audit has the anchor this one lacked.

**`docs/result/handoffs/24-aggregation-phase1.json` is byte-identical to its committed blob.**
`git hash-object` of the worktree file == `git rev-parse HEAD:<path>` ==
`0322639753518bb96f90f42d8e451bffda9aacd3`; sha256 `09e3745e30…`, 22,107 bytes, mtime Aug 19
16:40:49 — untouched since Task 24. Measured before and after the battery, and re-measured by three
agents.

**No new dependencies, no secrets.** `package.json` and `pnpm-lock.yaml` both show no diff and no
git-status entry; the lockfile is byte-identical (sha256 `8660b556…`). `node_modules/.pnpm` has been
untouched since 2026-08-14. 17 declared direct dependencies, 17 installed, none undeclared and none
missing. **Zero imports of any vendor LLM SDK** anywhere, and none present in `node_modules`.
`src/config/env.ts` declares exactly one variable — `FIRECRAWL_API_KEY`, optional — with an explicit
"never log or print the resolved key" contract. A secret-shaped regex scan over the tracked diff,
every new untracked source path, and `src`/`scripts`/`docs`/`tmp` returned **zero hits**.

### Git: one mutating operation occurred

The contract was **zero mutating git operations**. The shallow probes are clean — HEAD,
`refs/heads/main` and both remote refs are still `6c2e723601a0d76431c96a48bbdb4726c02063e7`; the
reflog holds exactly 3 entries, all pre-Task-28; `git stash list` is empty; there is no
rebase/merge/cherry-pick state; the index is clean. **The object store records a mutation anyway.**

Three git objects carry committer time `1787863775 +0900` = **2026-08-28 05:49:35 KST**, inside the
program window (all three read directly by the report agent):

- `8b0a20decee705e7181b3ce85dd478c42da8dfcd` — a **parentless** commit, message
  `untracked files on main: 6c2e723 0827 morning`, whose tree contains **exactly one file,
  `src/editor/server.ts`**.
- `708dd2ffe66fb972a92865f5b97489694d55f19c` — `index on main: …`, parent `6c2e723`, tree
  `af470ab` (== HEAD's tree, i.e. nothing staged).
- `27fbfe2c86cf669a523bb0a24fc8e69e1fbafbad` — a **three-parent** commit `WIP on main: …` joining
  `6c2e723` + `708dd2f` + `8b0a20d`.

That triple is the exact shape `git stash push --include-untracked` produces and nothing else does —
auditor 1 settled it empirically in a throwaway repo *outside* the project: `git stash create`
returns empty with only untracked changes and has no `-u`, so it cannot produce this;
`git stash push -u -- src/editor/server.ts` produces it exactly, and after `git stash pop` the stash
list is empty, `refs/stash` and its reflog are gone, the file is restored, and the objects survive
orphaned. That is precisely the observed state, and `.git/index` was rewritten 36 s later.

**No content harm.** `src/editor/server.ts` is present and larger now (29,215 bytes), the stashed
tree equals HEAD's tree so nothing tracked was ever rolled back, and the working tree is intact — **51
modified tracked files and 50 untracked paths**, still uncommitted for you to review.

**The real cost is verification integrity.** `28-final-regression.json` ships *"Zero mutating git
operations (item 6)"* as **VERIFIED** on `git stash list` + `git reflog` + a HEAD comparison — all
three of which a popped stash erases **by design**. The actor is unknown and is not attributed: it may
have been a program agent or the editor/IDE/harness. This is the program's own named systemic failure
mode recurring inside the close-out itself.

---

## THE SESSION FORK

**A `--resume` over SSH while the original session was still live forked the program.** For roughly
13 minutes, two halves wrote `src/editor/**` concurrently.

The evidence is `docs/result/handoffs/28-reconciliation.json`, written by the SSH-resumed half. Its
headline is worth quoting, because it refused the premise it was given:

> THE TREE COMPILES AND EVERY SUITE I RAN PASSES, BUT THE PREMISE OF THIS TASK IS FALSE: THE OTHER
> HALF IS NOT STOOD OFF. It held the suite mutex, edited `src/release/collect.ts` and ran mutation
> batteries DURING my reconciliation.

**What happened.** The fork window opened at 2026-08-28 01:22 KST. The SSH-resumed half wrote
`src/editor/panels.ts`, `region-enablement.ts`, `runtime.ts` and `server.ts` between 01:32 and 01:33.
The original half wrote `src/editor/enablement.ts` and `client.ts` at 02:02:30 and — inside a window
when only it was active — `src/editor/commit.ts` at 02:30:58 and `src/editor/inversion.ts` at
02:30:32, **two files the contract and the enablement handoff both call the other half's, edited by
the half that did not own them, claimed by no handoff.**

**How it was detected.** A cross-session collision report: process ancestry (`pid 47230` running the
suite lock under a `claude --resume` started at 21:44:48 under a local terminal), captured argv
showing the other half rewriting a string in `src/release/collect.ts`, source mtimes 30 s before the
reconciliation agent's first measurement, and the mutex being re-acquired by the other half at four
different pids between 03:00 and 03:08. The reconciliation agent stated plainly that the window was
**still open at 03:10**, not closed at 02:05 as its own contract asserted.

**How it was contained.** Both halves stood down; you chose which continued; the tree was reconciled.
The reconciliation agent bounded its own measurements honestly rather than pretending to a quiescent
tree: it took a sha256 of **every** `src/**/*.ts` and `scripts/**/*.ts` at mutex acquisition, again
at release, and once more at 03:07:38 — **identical all three times** — so its numbers describe a
real, currently-present byte state, and it said in writing that they are not a guarantee about the
tree one minute later and that any later agent must re-derive rather than cite it.

**What survived the fork.** Typecheck exit 0. Five suites re-derived under one mutex hold —
visual-editor 50, editor-integration 25, enablement 101, authoring-preview 41, brand-assets 141 =
**358 checks, 0 failures**. Zero orphaned exports across every `export` in `src/editor/*.ts`. F1, F2
and F3 all confirmed intact and still asserted rather than quietly closed — in particular
`commit.ts` had been edited by the other half but the documented semantics were **not** changed.

**What the fork left behind, and it is not nothing:**

- **A field that is dead on every path that exists.** `RegionToggleRequest` declares `route?: string`
  documented as "the route the operator is looking at — the default disable scope", but
  `RegionEnablementWriteRequest` has no such field and the server does not forward it, so
  `request.route` is **always undefined** on every HTTP path. The client works around it by sending
  `routes: [S.route]`, which the server does forward. Scope selection is fully closed by the
  workaround.
- **A guard against silent widening that is itself silent.** `widenedToBlastRadius` is computed and
  returned on the engine result, commented as existing *"because a silent widening is exactly the
  failure"* — and the identifier appears **nowhere else** in `src/` or `scripts/`. It is dropped at
  the adapter and, because the client always names a route, can never become true through the UI
  anyway. No current behaviour is wrong; the defect is that a future caller omitting `routes` would
  widen and the flag that exists to announce it would be discarded in silence. **Do not delete the
  flag — wire it.**
- **Two mechanisms for one job** (`route` singular and `routes` array), which the client documents
  honestly as "the single route is sent alongside it for the same intent, and is ignored where
  unread" — the residue of two halves converging on the same requirement independently.
- **Author attribution is unrecoverable from the documents.** 19 of 20 Task-28 handoffs declare no
  `producedBy`; five share batch-write mtimes that are copy timestamps carrying no authorship
  information. Attribution had to be reconstructed from mtimes plus process ancestry.
- **Three orphaned `next start` servers** (PPID 1, ports 61590 / 61930 / 62026) were left listening
  and deliberately **not killed**, because the other half was mid-suite and killing a listening
  server could have failed its run and been misread as a regression.

**The lesson, in the program's own words:** *"Before resuming, make sure no other Claude Code session
is running on this repo."* Check `ListAgents` or `/tmp/cc-socks` first.

---

## THE SYSTEMIC HANDOFF LEAK

**Three consecutive gates failed on handoff traceability, never on code.** Not one gate ever failed
on an engineering property.

| Gate | Verdict | Why |
|---|---|---|
| `28-gate-phase23.json` | **PASS** | 22 suites / 2,472 checks — *and it recorded the Phase-3 latency finding as still open, then passed anyway* |
| `28-gate-phase456-prior-0417.json` | **FAIL** | `widenedWithoutTrigger` 94 vs true 22 |
| `28-gate-phase456.json` | **FAIL** | the same figure, third independent agent to report it |
| `28-gate-phase789.json` | **FAIL** | the residual-23 misclassification; stale `createSiteRun` figures. `engineeringVerdict`: everything passes |
| `28-gate-phase1011.json` | **FAIL** | `programTotalArithmetic` 2,811 vs 2,818; a false "nothing anywhere checks title uniqueness" claim in F9 **and in a shipped check**; a stale `seo: 107` row. `engineeringVerdict`: **PASS** |

Each FAIL was left **as recorded**. Every gate file carries the same stance: *"The orchestrator does
not overturn its own gate."* Auditor 4 confirmed no verdict was retroactively flipped: five gate
files exist, four record FAIL and still do, and each verdict matches its own agent journal exactly.

**The root cause, identified at the last gate:** every correction pass answered **its own** verifier
line by line, and none answered the **re-verification** that followed it. *A re-verification is a
verification.* Every shipped handoff must be diffed against the **last** verifier report's
`failures[]`, not the first.

**Is it closed? No. Auditor 4's finding: MATERIALLY REDUCED, STILL OPEN.**

Everything a *gate* failed on is genuinely fixed and independently reproducible. Auditor 4 re-derived
all six orchestrator corrections from the artifacts and every one holds: `widenedWithoutTrigger`
22 / `ambiguousWithoutTrigger` 94 (re-implemented from the raw 9,929-binding file); `createSiteRun`
6,813 / 578 / 1,052; the residual-23 breakdown 14 prose + 2 headlines + 4 link labels + 3
numeric-chrome (+1 href outside the text-slot metric, which is why a naive sweep returns 24);
`programTotalArithmetic` 2,818; `checkTitleUniqueness` really exists at `src/seo/production-plan.ts:520`
with `title-uniqueness-measured` at `src/production/qa.ts:731`; and the seo row is really 113 (auditor
4 ran the suite: 113 PASS / 0 FAIL). Every wrong sentence is preserved verbatim in a `corrections`
block rather than erased.

**But five earlier verifier findings still stand today.** The report agent re-measured all five in
the tree:

1. `scripts/smoke-release.ts:3415-3417` still reads *"so the runner itself had never executed on any
   pipeline"* — falsified by the Phase-1C verifier against pre-existing checks 14b/26.5/26.6.
   `28-carried-items.json` mentions it nowhere.
2. `src/release/graph.ts:72` still reads *"reruns the production compile, which today reproduces the
   same bytes"* — the substrate verifier measured a brand-only rerun differing in **52 paths**. The
   same wording sits in `28-intel/build-authored-state.json:128`. The verifier's own report is on
   disk, so the contradiction is discoverable; the document was never amended.
3. `28-preview-runtime.json` still ships text-edit latency `{median:144, max:150}` with **no
   corrections block** and the string `180` occurring **zero times** in the file, after a verifier
   measured 180/211/170 with every sample above the claimed maximum. No correction agent ever ran on
   Phase 3.
4. `28-visual-editor.json` still ships `routeSwitchNote: "22 ms median / 658 ms max … repeat visits
   are single-digit ms"` after the verifier's pre-warmed, strict-wait re-measurement of **534 ms
   median / 537 max** called it a measurement artifact. Two gates recorded it open; `corrections[]`
   holds only the widened entry.
5. The **dynamic-template browser-coverage gap** in `scripts/smoke-visual-editor.ts` — neither closed
   nor disclosed, and absent from that handoff's 11 limitations.

**Four of those five sit in Phases 1-4** — before the leak was named. The discipline visibly took
hold from Phase 5 onward: every last-verifier finding in Phases 2, 5/6, 7/8, 9, 10 and 11 is answered
in code **and** in the shipped handoff with the original claim preserved. The remedy gate 1011
prescribed was applied to the phases that gate named and never retroactively.

**And two new instances arrived in the close-out itself:**

- `28-final-regression.json` ships "Zero mutating git operations" as **VERIFIED** on evidence that
  structurally cannot detect a popped stash (see Historical Integrity).
- `28-resume-state.json` — the designated read-first document — still records **F3 as open** when the
  suite (`28.P8.41 F3 CLOSED`) and an independent UI drive both close it.

Two more figure-staleness items, minor but the same species: `28-visual-editor.json`'s *corrected*
"14 modules, 4,983 lines" is itself stale (14 modules / **5,491** lines today), and
`28-brand-assets.json` gives 109, 117 and 141 for the same suite with no timestamps. And
`28-gate-phase1011.json`'s `countDerivation` says "4 such lines are NOT check lines" while enumerating
three — caught independently by the regression agent and by auditor 4; the 2,818 total is unaffected.

---

## THE FOUR DEFECTS CAUGHT BY ADVERSARIAL VERIFICATION

These are the program's main evidence that the method works. **None of them was caught by a test
passing.** Each was caught by a fresh verifier who refused to confirm what they were told.

**There is a fifth, and it is the biggest one: the `image-logo` clearing defect** — found by auditor 3
after 2,948 checks had already passed, and the reason this program's own final adjudication returned
NOT READY. It has its own section (*The Close-out*) because it changed the verdict twice.

### 1. A source-brand blocker silenced by a narrowed trigger

The Phase-2 builder replaced the requirement trigger `inlineSvgEntries > 0` with
`brandCarryingHostCount > 0`. The consequence — that a lineage the token detector cannot see raises
**no source-brand requirement at all** — was recorded nowhere. The verifier produced the
counterexample: `data/domainchecker.co.kr/recon-templates/2026-08-19T07-14-22-868Z` has **794
inline-SVG nodes, 0 brand-carrying hosts, requirement NOT EMITTED** — while that template's home link
ships `aria-label="도메인체커 홈"`, the site's own brand in Korean, on a surface the resolver claims to
own. The correction agent reproduced it (0 hosts; raw grep of the page file: 2× that aria-label).

**Not just named — closed.** Detection tokens are now the host label **widened by the name the source
declares in its own route-map titles**, with a deliberately conservative rule: a candidate is the
trailing segment after `|` `·` `•` `–` `—` (the ASCII hyphen is *not* a separator, because
"Next.js by Vercel - The React Framework" would manufacture a name the site never declared), accepted
only when it recurs across ≥2 titles **and** ≥50% of titled routes. Measured effect, reproduced by
auditor 3 running the shipped scanner on all four accepted templates: linear 80→80, stripe 195→195,
**domainchecker 0→38**, **nextjs 160→190**. The blind case remains possible and is named — and
`collect.ts` now warns when a template has inline SVGs and zero hosts, so the zero is never silent
(though that warning is log-only, which is a standing minor defect).

### 2. A false measured claim the phase's own scanner falsified in seconds

The Phase-2 handoff, the suite header and the product's own doc comments asserted **as a measured
fact, with a named grep as evidence**, that no accepted template in this repo ships its own logo as
an `<img>`. The verifier ran the phase's own scanner:

> `scanAppBrandHosts('data/nextjs.org/recon-templates/2026-08-19T07-12-35-732Z/app', 'nextjs.org')`
> returns **160 image-logo hosts across 40 routes** on two source logotype files.

**The claim was false by 160 hits**, and the artifact had been sitting in this repo the whole time.
The correction agent reproduced it independently. The false claim is corrected **and preserved as an
error, not erased**, in three files, and the surface now runs on that real lineage: two real
`next build`s of a 1-route copy of the real nextjs.org template — before: 4 hosts, 0 replaced,
unexplained 4, blockers 1, logotype still shipping; after: 4 replaced, 0 refused, 0 unexplained,
blockers 0, logotype gone, src a self-hosted `/wr/brand/<sha>.svg`, no srcset re-introducing it.

*The irony worth noting:* the very lineage this defect exposed is the one on which auditor 3 later
found the blocking PRESERVE defect. Running the weakest surface on real data was right, and it was
still not enough.

### 3. A region refusal rendering 1 of the 2 refusals the engine produced

The engine returned two refusals for a single click — a global-region refusal **and** a shared-page
blast-radius refusal — and the operator was shown one. That is the most dangerous shape of UI defect
in this whole program: the operator reads a complete-looking explanation and acts on half the truth.

It is now guarded by `scripts/smoke-editor-integration.ts:28.P8.9`, which asserts that **the same
click** also names every other route that would be physically changed, that the panel contains the
`shared-page-blast-radius` code and the phrase "would be physically changed too", that **every**
affected route appears in the rendered text, and that the remedy label is offered — and it prints the
full set of rendered codes in its detail line.

Auditor 2 re-drove this without being told the answer: in three separate refusal cases the **rendered
code set equalled the engine's set exactly** (2, 2 and 10 refusals), each carrying its own specific
reason, and every one survived two full inspector re-renders.

### 4. A verifier finding that shipped uncorrected — twice

`28-visual-editor.json` asserted that *"94 of 262 dynamic bindings would get a **strictly wider**
candidate set"*. The true value is **22**; 94 is the count of bindings that are merely **ambiguous**
without the trigger. Every neighbouring figure in the same block reproduces exactly (262 dynamic,
262/262 sound, 168 → 182 single-slot), which is what makes this a mislabel rather than a different
definition.

The Phase-4 verifier reported it. It shipped uncorrected. The 04:17 gate agent reported it and failed
the gate. It shipped uncorrected again. The next gate agent — the **third independent agent** —
recomputed it in Python from the raw `slot-bindings.json`, replicating the suite's own lines
verbatim, and failed the gate again. Auditor 4 has now recomputed it a **fifth** time and confirms
22 / 94.

Nothing functional ever failed: the check itself is honest and prints the true 22 in its detail
string. **The defect was purely that a finding, once recorded, was not carried into the document** —
and that is exactly the systemic leak, first observed here and still not fully closed.

---

## THE CLOSE-OUT: THIS PROGRAM FINISHED NOT READY, THEN CLOSED THE CLAUSE

This section exists so nobody reads this report and concludes Task 28 passed first time. **It did
not.**

**What the program's own final adjudication said.** After a full 29-suite / 2,948-check / 0-failure
regression with the e2e deferral repaid, and after a four-auditor panel, the adjudicated verdict was
**NOT READY — VISUAL PRODUCTION WORKFLOW INCOMPLETE**. Exactly **one** of the twenty bar clauses
failed: *source-brand-asset resolution works* — which also made the derived clause *source brand
asset blockers = 0* uncertifiable as an instrument. Nineteen clauses were met. The engine was frozen
and intact, the editor genuinely worked, the canary package was genuinely independent.

**Who found it.** Not the builder, and not the suites — all 2,948 checks passed while the defect was
live, because the suite that should have caught it contained a check (§3b) asserting the **opposite**
of correct behaviour. It was found by **independent adversarial verification**: auditor 3 returned a
REJECT after reproducing it twice on the real accepted nextjs.org template with real `next build`s,
and the adjudicator root-caused it from four independent causes read directly in source.

**What the defect was.** On an `image-logo` lineage, a PRESERVE-everything decision cleared the
release-blocking source-brand requirement as `status = "resolved"` / `clearedBy = "output-proof"` with
**0 blockers, while the source's own logotype was still shipping in the package**. Four causes:
`markupBrandSurfaceTotal` excluded `sourceUrl`; **no axis at all** measured a brand-named image
*path*; the `alt` matcher was weaker than the detector's; and `evaluateBrandOutputProof` tested
`renderedClean` before `preservedAfter`. The linear canary's zero was always honest — the
**instrument** that produced it was what was broken.

**What was then done.** A fix agent applied all four sub-fixes in the adjudicator's prescribed order
across five files, reproducing the defect first rather than assuming it. An independent verifier
rebuilt the *pre-fix* code in an isolated copy and attacked both versions with hand-built scenarios, a
4,116-case exhaustive input matrix, a 63,918-string matcher fuzz and two in-repo mutation tests
(snapshot-and-restore, sha256-verified). The final adjudicator then re-read all three code sites and
ran **seven false-zero attacks of their own design**, re-derived the canary requirement end to end
under the new instrument, and re-fuzzed the matcher independently. Every result is in *The fix, and
how it was falsified*.

**What it cost.** +22 checks (2,948 → **2,970**), all newly added, **zero negative deltas**, typecheck
still exit 0. Three existing checks rewritten — none deleted, none weakened, every rewritten hunk's
count up. Zero further mutating git operations, zero installs, `package.json` untouched, zero
historical `data/` mutations.

**The lesson worth carrying, stated plainly.** An instrument that certifies a release blocker must be
**complete with respect to what it certifies**, and a passing suite is not evidence that it is. The
structural remedy applied here is not the new axis — it is the **ordering**: `preservedAfter > 0` now
outranks the census entirely, so an unmeasured surface can only ever *downgrade* a build to
`accepted-limitation` and can never upgrade one to proof. That property was demonstrated on a mark
hidden in a CSS `background-image`, which **no axis measures even now** — and it still blocked.

---

## Remaining Risks

1. **THE HIGHEST RISK IS NOW THE UNCOMMITTED TREE, NOT THE BRAND INSTRUMENT.** A mutating git
   operation already occurred once (stash push+pop, 2026-08-28 05:49:35 KST) and the final regression
   certified the opposite on evidence that a popped stash erases by design. All Task-28 work —
   including the close-out fix — is **still an uncommitted working tree.** One stray
   `git checkout`/`clean`/`stash` destroys the entire program's output. **Commit first, before
   anything else.** (Re-verified at re-adjudication: exactly 3 unreachable commits, all stamped
   1787863775 = the one known event; **no new orphans**, no `refs/stash`, no `ORIG_HEAD`, reflog still
   3 pre-Task-28 entries. The fix and both verification passes added **zero** further mutating git
   operations.)
2. **CLOSED — `image-logo` brand surfaces had no clearing measurement.** *This was the one failing bar
   clause and it is now fixed, falsified five independent ways and re-adjudicated;* see *The fix, and
   how it was falsified*. Retained here as history, and because the class of defect — an instrument
   blind on exactly the surface it certifies — is the one to keep watching for. Two residual limits
   are named below (items 21 and 22).
3. **The systemic handoff leak is still open** — five standing verifier findings (listed above), plus
   two new instances in the close-out.
4. **The paint-twin gap (F1/F8)** — 481 of 2,301 enabled text slots bind only a 1×1 node; 6 authored
   values ship beside the source value they replaced, including the whole `/pricing` price list.
   Blocked by contract: the Recon Template is immutable and Exact Reconstruction is frozen.
5. **1,038 internal anchors over 178 destinations 404** on the canary, one of them the journey's own
   CTA, accepted with a validator **warning only**. `broken-internal-route` should collect a
   requirement.
6. **Group-form save writes untouched sibling slots** as authored values, overstating authored counts
   and freezing template defaults as human decisions.
7. **Undo and revisions are O(n) per call** with a 112-revision project already on disk.
8. **No dynamic-template browser coverage** — the headline DOM→Slot mechanism's in-page
   `recoverTrigger()` has zero automated coverage; a regression would be silent.
9. **Layout QA never ran over generated full-site content** — neither the 8-route canary nor the
   Millwright draft went through `runContentLayoutQa`.
10. **Preview worker processes can survive a session** — two orphaned `npm exec next start` (PPID 1)
    left by auditor 2's ten driver runs; three more left by the fork. The clean Ctrl-C path reaps
    correctly (SIGINT → exit 0 in 101 ms), so the leak is intermittent and attribution is unresolved.
11. **`smoke-release.ts` `rm -rf`s a fixed fixture path** at startup and in `finally` — two concurrent
    runs destroy each other. All runs must go through the mutex. Worth fixing before any parallel CI.
12. **The brand token-blindness warning is log-only** and reaches no artifact.
13. **G4's anchor half reads a recorded `qa.json`, not the live package**; **G2's label** reads as "no
    source-brand leaks" while counting only release-blocking ones (6 unresolved high-value exist).
14. **Three unowned/undetected brand surfaces**: unlabelled SVG path geometry, `dynamic-template`
    region content, and attribute-value text. Plus source brand inside an editable url slot's query
    string, and XMP metadata inside a shipped `.mp4`.
15. **189.1 MB of source-owned audio/video ships; 169 of 380 media files (195.2 MB) are referenced by
    nothing.**
16. **Site IDs are not unique** across projects on disk; the unique keys are shown in no column.
17. **`28-first-draft.json`'s 287 requirements is not reproducible** from the project directory it
    cites (that project is rewritten by `smoke:first-draft` on every run; it now holds 202).
18. **Route ON/OFF was never driven through the UI** by any auditor — suite-level coverage only (33
    `§P6` checks). The F2 cascade re-adjudication was likewise not re-driven.
19. **No atomic writes or locking anywhere in the repo** (pre-existing, repo-wide).
20. **Only linear.app was exercised at full-site content scale**; stripe, nextjs and domainchecker
    were not.
21. **A brand logo delivered via CSS `background-image`, `<object>`, or an inline `<image href>` is
    still neither detected nor censused.** This is a real uncovered surface class, disclosed rather
    than papered over. It is *symmetric* — detection and census are equally blind, so neither is blind
    alone — and it does not reopen the fixed defect, because `preservedAfter > 0` now outranks the
    census: a PRESERVE on such a lineage still lands `accepted-limitation` with 1 blocker (proven by
    the adjudicator's sixth attack). The exposure is a lineage where such a mark is *never detected as
    a host at all*, so no decision and no residual ever names it.
22. **A production build baked BEFORE the close-out fix has no `imageSrcPath` field in its stored bake
    report** and reads 0 on the new axis (`brand.census?.imageSrcPath ?? 0`). Such a build must be
    **rebuilt** to be measured on it. The ordering fix protects it regardless, since it consults no
    census. The one accepted build in the tree was re-censused from its shipped bytes and is genuinely
    0.
23. **`smoke-production-canary` reads STORED artifacts** (`release-project.json`, `requirements.json`)
    and does **not** re-derive requirements through `brand-scan.ts`. Its pass is therefore *not*
    evidence that a change to the clearing instrument is safe. Re-derive against the build the
    requirement's evidence names, as both the fix and the re-adjudication did.
24. **`smoke-editor-integration` flaked once** during the close-out — exit 1 at 32 PASS / 0 FAIL with
    `page.waitForFunction: Timeout 120000ms exceeded` in the real-browser journey; no check failed, the
    suite aborted. It re-ran clean at 45/45, twice. The timing-out step touches no brand code.
    Reported, not dropped.

---

## Deferred CMS / SaaS

**Nothing resembling a CMS or a SaaS layer was built, and none was attempted.** This is a deliberate
carry-forward, not an omission, and it should be read as the honest boundary of what exists:

- **No database.** Every screen reads the same filesystem registry every other editor route reads.
  Nothing was added to persist state.
- **No authentication, no sessions, no multi-tenancy.** No auth layer exists or was added. The editor
  is a local `node:http` server on 127.0.0.1 with no identity model at all.
- **No hosted publishing.** The production output is a static export package with its own
  `server.mjs`, proven independent from outside the repo; there is no deploy target, no CDN
  integration, and no domain provisioning. `.example` domains were used throughout and no DNS lookup
  was ever performed.
- **No concurrent-editor model.** Two `createSite` calls against the same derived id are a named
  theoretical race; there is no locking anywhere in the repo.
- **No collection/blog engine.** Detection and representation only, carried from Task 27.
- **No content approval workflow.** The editor records **nothing** about human approval, and says so
  in words on the panel.
- **No live LLM.** There is no vendor SDK and no LLM key in this environment. Content generation runs
  on the provider-neutral `ContentGenerator` seam with `brief-writer`, `fake`, or an
  operator-authored result file.

If the next step is a product rather than an operator tool, all of the above is unbuilt and should be
scoped as new work, not as hardening.

---

## Recommended Next Task

**Task 29 — First Real Production Pilot.** The instrument fix that Task 29 was originally going to
open with is **done and re-adjudicated**, so the order changes:

1. **COMMIT THE TREE. Before anything else.** This is now the single highest-risk item in the whole
   program. Every artifact of Tasks 25–28 including the close-out fix is an uncommitted working tree,
   and a mutating git operation has already run in this repo once. One stray
   `git checkout`/`clean`/`stash` destroys all of it.
2. **Run the pilot on a non-linear lineage — nextjs.org is the obvious choice**, precisely because it
   is the lineage that exposed the brand defect and the one the alt-matcher widening changed most
   (full-template brand hosts 190 → 510). Expect **510 real brand decisions**; that is the honest
   count, not a regression, and working through it is the point of the pilot.
3. **Rebuild, do not trust, any production build baked before the close-out fix** — a stored pre-fix
   bake report has no `imageSrcPath` field and reads 0 on the new axis.
4. **Close the five standing handoff-leak items** by the remedy gate 1011 prescribed — diff every
   shipped handoff against the **last** verifier report's `failures[]`, retroactively for Phases 1–4 —
   and correct `28-final-regression.json`'s git claim.
5. **Add the missing coverage that is one check each:** a browser click on a mounted dynamic-template
   element; a route disable driven through the UI; `runContentLayoutQa` over a generated full-site
   draft.
6. **Then the real remaining product risks**, in rough order of how much a paying pilot would feel
   them: the 1,038 404-ing internal anchors that collect only a warning; the paint-twin gap (F1/F8);
   and the 189.1 MB of source-owned media that ships unreferenced.

Deliberately *not* recommended next: any CMS/SaaS/auth/hosting work. Nothing about this program is
short of surface area; it is short of one real customer having run through it end to end.

---

## Final Verdict

# READY FOR FIRST PRODUCTION PILOT

All twenty bar clauses are met. The one that failed at first adjudication — *source-brand-asset
resolution works*, and with it the derived *source brand asset blockers = 0* — was root-caused,
fixed in the prescribed order, falsified five independent ways including seven false-zero attacks of
the adjudicator's own design, and re-adjudicated. The instrument is now **complete with respect to
what it certifies**: every one of the six resolvable brand surfaces has a matching census axis on
both encodings, and `preservedAfter > 0` outranks the census entirely, so a preserved mark can never
be scored as proof that the mark is gone — even on a surface no axis measures. A genuine REPLACE
still clears, so nothing was over-corrected. Regression holds at **29 suites / 2,970 checks /
0 failures / typecheck exit 0** with **zero negative deltas**; historical mutation is 0.

**This is a verdict about the engine, not a promise about a customer.** READY here means: it is now
correct to point this system at a real site and a real brief, with an operator watching. It does not
mean the twenty-four Remaining Risks above are closed — several of them, especially the uncommitted
tree, the 404-ing internal anchors and the paint-twin gap, will be felt by the first pilot. Read that
list before starting.

**One process-contract item is recorded and does not gate this verdict.** `gitMutatingOperations` is
**1**, not the contracted 0: a `git stash push --include-untracked` ran at 2026-08-28 05:49:35 KST and
was popped 36 s later, caught only because an auditor ran `git fsck`. It is a real violation of the
program contract and it is not being written off — but it is **not one of the twenty bar clauses**,
and it caused **no content harm**: `HEAD`, `refs/heads/main` and both remote refs are still
`6c2e723`, no commit/reset/checkout/clean/push ever ran, the stashed tree equalled HEAD's tree, and
the re-adjudication confirmed exactly **3** orphaned objects — all from that single event, with
**zero** new ones. It altered no artifact and no measurement, so it cannot make any bar clause false.
It carries forward as the **first** item of Remaining Risks and step 1 of the next task, because the
danger it points at — an uncommitted tree holding four tasks of work — is entirely real.
