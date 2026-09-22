# Task 28.7 §26 — Per-route tree switch

Owner scope: `src/reconstruction/**`, `scripts/smoke-layout-safety.ts`. No git operations were performed.

## Files changed

| File | Change |
|---|---|
| `src/reconstruction/tree-switch.ts` | `measureObservedChange` also returns the per-page breakout it used to sum away; new `PageObservedChange` / `PageTreeSwitch` types, `decidePageTreeSwitch()`, `variantTreeNotObservedCode()`; `TreeSwitchDecision.perPage`. |
| `src/reconstruction/responsive-plan.ts` | New `inferResponsivePlan()` → `{site, byPageId, records, variantTreeNotObserved}` and the single accessor `breakpointForPage()`. `inferBreakpoint()` kept, now `inferResponsivePlan(...).site`. |
| `src/reconstruction/types.ts` | `RuntimeRouteMap.pageBreakpoints?`; `PageBreakpointRecordSchema`; `ManifestConfig.routeBreakpoints?` / `.variantTreeNotObserved?`; limitation code `variant-tree-not-observed` + glossary. All new fields optional. |
| `src/reconstruction/app-template.ts` | `globalsCss(..., routeOverrides?)` writes a scoped `[data-wr-page=…]` media pair per overridden route and excludes those routes from the site-wide pair; `pageAttributeSelector()` refuses an unsafe page id. |
| `src/reconstruction/layout-inference.ts` | `InferLayoutInput.breakpointByPageId?`; the per-page loop splits the probe axis at that route's served width. |
| `src/reconstruction/plan-reconstruction.ts` | Uses `inferResponsivePlan`, passes `breakpointByPageId` to `inferLayoutRules`, adds the `variant-tree-not-observed` limitation, carries `responsive` on the plan (optional, so hand-built plans still generate). |
| `src/reconstruction/generate-app.ts` | Builds the override list once and feeds `globals.css`, `route-map.json` (`pageBreakpoints`, omitted when empty) and the manifest from it. |
| `src/reconstruction/index.ts` | Exports the new API. |
| `scripts/smoke-layout-safety.ts` | Part 15 — 20 permanent checks; fixture builder gained `pageId` / `desktopProbeWidths` / `desktopTruthIndex`; `histogram()` hoisted to module scope. |

## Mechanism

`measureObservedChange` keeps a `byPage` map alongside `byPx`
(`tree-switch.ts:343-366`). `decidePageTreeSwitch` (`tree-switch.ts:~425`) then
runs the identical three steps on one page — `aggregateAuthoredCandidates([page],
lower, upper)`, the page's own attributed counts, and the **unchanged**
`rankTreeSwitchCandidates` with the same site midpoint. `chooseTreeSwitch`
decides the site winner first (it is the default a route without evidence
inherits) and returns `perPage`. `inferResponsivePlan` folds that into
`{site, byPageId, records, variantTreeNotObserved}`; `byPageId` holds only the
routes that disagree.

Serving: both trees are always mounted and CSS hides the inactive one, so a
per-route pair cannot simply "win" a cascade — at a width between the two numbers
the site-wide pair would hide the desktop tree while the route pair hid the
mobile one and the route would render nothing. The site-wide pair therefore
**excludes** overridden routes by selector
(`[data-wr-viewport="desktop"]:not([data-wr-page="pNNNNNN"])`), and each
overridden route gets exactly one scoped pair. With no overrides the output is
byte-identical to pre-§26.

§26.4: a route whose own probe measured it changing at a width the clone does not
swap at reports `variant-tree-not-observed-at-<px>` — corroboration is the same
tight-bracket predicate the ranker uses, plus a non-zero count.

## Probe-axis / serving agreement (§26.5)

One object, three readers. `plan.responsive.byPageId` is passed **as the map**
to `inferLayoutRules` (`plan-reconstruction.ts`), which resolves
`input.breakpointByPageId?.get(page.pageId) ?? input.breakpoint` immediately
before `resolveViewportProbe`; the same map is turned into `routeOverrides` in
`generate-app.ts` and handed to both `globalsCss` and `route-map.json`. No layer
re-derives a width.

## Real data

| | linear.app before | linear.app after |
|---|---|---|
| site-wide | 1025 (authored-breakpoint) | 1025 (unchanged) |
| per-route | — | `/`,`/changelog`,`/pricing` 1025; `/security` **641** |
| `variantTreeNotObserved` | — | at-641, at-929, at-1025, at-1281 |
| candidateRules / recoveredRules | 1776 / 1774 | 1863 / 1861 |
| rejectedByTruthCheck / acceptedRegressed | 2 / 0 | 2 / 0 |

hobbang.net (cross-site regression): site 768 before and after; **no route
disagrees**, so `pageBreakpoints` is omitted from `route-map.json` entirely;
candidateRules/recoveredRules 2036/2036, rejectedByTruthCheck 0,
acceptedRegressed 0 — identical to the pre-change run.

## The deciding measurement (built clone, offline, 5 widths)

`scrollHeight` / visible nodes:

| route | 390 | 700 | 1024 | 1100 | 1440 |
|---|---|---|---|---|---|
| `/` before **and** after | 5876 / 1020 | 5876 / 1013 | 5876 / 1003 | 9960 / 3059 | 9960 / 3072 |
| `/pricing` before **and** after | 7714 / 1073 | 7714 / 1069 | 7714 / 999 | 6360 / 1704 | 6360 / 1704 |
| `/security` **before** | 4783 / 378 | 4783 / 377 | 4783 / 371 | 3231 / 386 | 3231 / 386 |
| `/security` **after** | 4783 / 378 | **3231 / 365** | **3231 / 378** | 3231 / 386 | 3231 / 386 |

The two-states-no-continuum signature is **broken on `/security`** and
**unchanged on `/` and `/pricing`** — a measured partial negative. Root cause:
the probe re-renders the *desktop* tree at each width, so `observedChange`
locates where the desktop tree's CSS changes, not where the source swaps its
rendered family. On `/` the counts at 1025 (1868) and 641 (1783) are within 5%,
and the ranker — which §26 was told not to change — takes the larger.

## Tests

Part 15, 20 checks. Under an in-place revert of the three mechanism edits
(checksum-verified restore), **13 of 20 go red**. The 7 that stay green are the
no-change and back-compat assertions, which by construction cannot go red.

## Verification

`tsc --noEmit`: 0 errors in `src/reconstruction/**` and
`scripts/smoke-layout-safety.ts`. Three pre-existing errors in
`src/observer/observe-page.ts` (another agent's live edits, not touched here).
`smoke-layout-safety` 279 → 299 PASS. `smoke-reconstruction` 227 → 227 PASS.
