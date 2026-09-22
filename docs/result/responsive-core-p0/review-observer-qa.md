# Independent review — Responsive Core P0 observer evidence + continuous QA

Reviewer: fresh-context, READ-ONLY. Date 2026-09-15. Baseline: `tmp/wrp0/pre-p0-snapshot`.
Ran `npx tsx scripts/smoke-continuous-qa.ts`: **81/81 checks passed, exit 0, 84.5 s**. No live captures.
Two behaviours were confirmed with throwaway Chromium probes (not committed): CSSOM value serialization, and how `@layer` behaves inside a non-matching `@media`.

## BLOCKER

**B1. The QA can PASS when clone nodes are missing or source nodes don't match.** `checks.ts:173-181`, `verdict.ts:225-226`
- A tracked node with clone `st !== "matched"` (`clone-node-absent`), or a source node that is `unmatched`/`ambiguous`, is only counted. It raises no violation, apart from H8 for matched clone text.
- There is no minimum coverage.
- Scenario: the clone drops a section, or the live source has drifted from the observation so every ref is unmatched. The vote comes out `indistinct`, so there is no tree-mismatch. 0 nodes are compared, and the interval and route still PASS.
- Fix: add a violation when the source is matched and visible but the clone node is absent. Mark an interval UNVERIFIED/FAIL when compared nodes fall below a floor. Use `nodesNeverMatched` in the verdict.

**B2. Inline-provenance classification guesses.** `inline-provenance.ts:252-278, 489-503`
Checked in Chromium, for an initial `style` that was never mutated:
- `color:#fff` is read back as `rgb(255, 255, 255)`, so it is classed `initial-mutated`.
- `background:red` expands to `background-color` and `background-image: initial`. `background` is not in `SHORTHANDS`, so these are classed `runtime-added`.
- `flex:1` gives `comparable:false`, so it is classed `initial-mutated`.

Fix: put the initial style text through the CSSOM inside the page, so both sides are longhands with the same serialization. Anything that can't be proven comparable should be `unknown`. `runtime-added` should only be used when no related property (`stylePropertiesRelated`) is declared.

## MAJOR

- **M1. Inline shorthands that use `var()` are dropped silently.** `collect-dom.ts:2401`. Checked: `padding: var(--p)` gives 4 longhands whose value is `""`. They are skipped and not counted as truncated. Fix: fall back to the shorthand value, or flag it as pending substitution.
- **M2. The cascade-aware cap ignores whether a rule applies.** `collect-dom.ts:1842`. The ranking never looks at media match, `supportsMatches` or container. Scenario: a mobile-first base rule plus 8 or more breakpoint / `@supports` variants of the same property. The base declaration that wins at the capture width gets cut. Fix: always keep the declarations whose conditions apply now, then rank the rest.
- **M3. Observer bisection says `converged` without checking.** `layout-probe.ts:1281, 1303`
  - Each mid-point is compared with the moving `loFingerprint`.
  - A gradual family change (for example +1 rendered every 30px) therefore ends in a 1px bracket with no real switch, and it is still reported `converged:true`.
  - Fix: store and require `verdict(lo,hi) === "changed"`, and flag a mid that differs from both ends (more than one switch).
- **M4. Look-alike siblings can be matched to the wrong node.** `inline-provenance.ts:307-330`, `in-page.ts:221-230`
  - A class-Jaccard ≥ 0.5 match is accepted without checking that no sibling matches too.
  - In provenance, a unique-id mismatch is overridden by a class match.
  - Scenario: a node is inserted before a row of `.card` siblings. Every card is then matched to its neighbour on the strict path, and it is not flagged as drift.
  - Fix: if another sibling has the same signature, require text or id agreement, otherwise mark it `ambiguous`.
- **M5. `runtime-responsive` mixes up time and width.** `layout-probe.ts:825`. The probe's `s` values come from a separate page load, measured one width after another. An autoplay carousel's changing `transform` is classed as responsive. Fix: measure the first width again at the end; if it differs, use `unknown`.

## MINOR

- **m1.** `document-response.html` is saved as UTF-8 text (`navigate-document.ts:167`, `store.ts:205`), and the decoder strips the BOM. `bytes`/`sha256` describe the raw bytes, so for non-UTF-8 pages (e.g. euc-kr) the file doesn't match its hash and still says `<meta charset=euc-kr>`. Store the raw Buffer instead.
- **m2.** `@layer` statements inside a non-matching `@media`/`@supports` are still registered (`collect-dom.ts:1311`). Chromium ignores them (checked), so `layerOrder` comes out wrong.
- **m3.** Anonymous layers now emit `layer:"(anonymous-N)"` where they used to be unlayered. This shifts `authored-breakpoints.ts:147` counts and the reconstruction's `cascade.ts` layer handling.
- **m4.** Artifact size was only measured on a tiny fixture:
  - the per-element cap went from 32 to 96, and each declaration gains 5 metadata fields;
  - `inlineStyle` and provenance are copied into both SiteSpec trees;
  - the document response is stored once per viewport.
- **m5.** `compareFits` passes STEP/MIXED/HIDDEN on the class alone. H7 skips containers that have no text (`checks.ts:189-191`).
- **m6.** `matchedSpecificity` calls `el.matches` again for every part of a selector list, on every element. This is slow for large reset lists.

## Other areas

- **Site-specific logic:** none found. `data-wr-*` is the generator's own markup.
- **Partition:** built from source data only (clone data is only used as sampling hints). Seeded widths are deterministic.
- **Backward compatibility:** every new schema field is optional, and compile skips provenance when `initialDocument` is absent. OK.
- **Tests:** no assertions were deleted or weakened compared with the snapshot. Missing tests:
  - a missing clone node;
  - colour and shorthand normalization;
  - a gradual family change;
  - repeated look-alike siblings;
  - media applicability in the cap.
