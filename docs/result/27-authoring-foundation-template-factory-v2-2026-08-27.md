# Task 27 — Overnight Authoring Foundation & Template Factory V2

**Date:** 2026-08-27
**Baseline:** `d33abb3` (unchanged — zero git operations)
**Verdict:** **READY FOR VISUAL PRODUCTION WORKFLOW**

---

## Executive Summary

web-recon gained a safe, authoritative customer-authoring layer and a smarter reusable Template
Factory, while the proven Reconstruction Engine stayed byte-for-byte intact.

The program ran as one orchestrator plus **44 fresh isolated agents** — builders, independent
verifiers, correction agents, integrators and a final audit panel — communicating only through source
code, generated artifacts and compact JSON handoffs. No agent inherited another's conversation.

**Regression: 1,794 → 2,151 checks across 20 suites, 0 failures, zero negative deltas, typecheck clean.**

The single most important result is not a feature. It is that `release:resolve` and `release:build`
**actually ran on real data for the first time in this repo's history**. The accepted audit flagged that
every release write path was unexercised code — all five `run.json` on disk were `kind:"prepare"`.
Everything Wave 2 built would have been theory without it. The exercise produced 5 non-prepare run
records on the real linear.app lineage and proved the authoring chain causally: an authored value
survived a *second* prepare and landed in 8 of 9 built HTML pages.

The second most important result is a process one. **Every defect that mattered was found by a verifier,
not a builder** — a PageRegion compile abort, a false operator remedy, a fake-pass check, and two
operator surfaces that disagreed with each other. In three cases the verifier reproduced the pre-fix
failure itself rather than trusting a handoff. The builders were competent; adversarial independent
verification is what turned competent into correct.

---

## Starting Baseline

| | |
|---|---|
| Commit | `d33abb311d65eae2f8cb1a070d8099fbd09d1b50` (`d33abb3`) |
| Program start | 2026-08-26 23:55:31 +09:00 (baseline commit); first artifact 2026-08-27 00:39 KST |
| Tracked modifications at start | 0 |
| Untracked at start | 31 paths (Task 26 evidence screenshots) |
| Re-measured baseline | **17 suites / 1,794 checks / 0 failures**, typecheck exit 0 |

The audit's wave-0 called for a git checkpoint *and* a baseline re-measure. The checkpoint was
**superseded** — the user had already pushed `d33abb3` and this program was scoped to zero git
operations. The re-measure was performed and mattered: the harness initially reported `NONE` for
`smoke:production` and `smoke:release`, which print `smoke:x — N checks, M failures` instead of
`N/N checks passed`. A naive count-diff would have read that as two suites silently losing 169 checks.
This is precisely the audit's own `NO-SUITE-SELF-VALIDATION` finding, encountered in the first hour.

---

## Accepted Audit Decisions

All ten `requiredChangesBeforeImplementation` were absorbed into the wave briefs and all ten hold at
HEAD. Stop condition **A** (*"SiteInstance seriously duplicates an existing model"*) was `TRIGGERED`
and is resolved by extension, not duplication: **no `src/site-instance/` exists**; `src/release/`
gained the missing authoring capabilities additively.

Independently re-verified against source before any brief was written, so the briefs cite live seams
rather than stale line numbers:

- `prepare.ts:98` run-scoped `projectId`; `resolutions: []` / `runs: []` hardcoded → destructive prepare
- `graph.ts:62` `THEME_SELECTION_IMPACTS` — declared, asserted by smoke, **zero engine call sites**
- template `hashRef` excluded only `node_modules/.next/out` → the `report/` landmine
- `packet.ts:73` `buildBatches` exists; `cli-content-generate.ts:71` passed all units in one call
- `seo/serve.ts` literal `split/join` title rewrite
- `cli-assets-qa.ts:57` `?? ["/"]` single-route census

---

## Changes Implemented

### GED-E — SEO preview entity-title rewrite

`src/seo/serve.ts` `rewriteHtmlHead` now substitutes the upstream title across **6 encodings** (raw,
three HTML apostrophe spellings, JSON, JSON+html-escaped) via a new `src/seo/escape-variants.ts`, each
needle replaced under its own encoding so no double-escaping occurs. Production bake untouched
(`git diff -- src/production/bake.ts` empty; `rewriteHtmlHead` has no caller in the bake path).

**Proof it discriminates:** a verifier reconstructed the pre-fix function from `git show HEAD:` and
replayed it — 5 of 6 encodings survive the old code, **0 of 6** survive current.

**Honest limit, agent-reported:** `raw` is *structurally* impossible to discriminate — pre-fix step (b)
was `split(upstreamTitle).join(title)` with the needle equal to the raw variant, so no placement
survives it. Measured with six exotic placements, not assumed. The assertion is retained and labelled a
forward regression guard. Also recorded: the replacement-side escaping is defense-in-depth only —
`production-plan.ts:143-147 assertHeadSafeText` throws on `/["\\<>&]/`, so a plan title containing `&`
is unreachable through the production API; the fixture bypasses it deliberately.

**79 → 97 checks.**

### GED-G — cross-route per-file residual report

The `?? ["/"]` default is gone; census routes derive from the template run's `site-map.json`, with
`--routes` retained as an override. New `src/assets/residual-report.ts` emits `asset-residual-report-v1`
carrying, per residual URL: normalized URL, host, per-route hits with occurrence counts, nullable
inventory id (exact-URL join, no guessing), replacement fields **read from** `replacement-manifest`, and
evidence refs. No recrawl; no second inventory. The manifest stays authoritative — the report adds
render prioritization, not competing truth.

An explicit `--routes` that parses to zero routes now **refuses the run** (matching the file's existing
bad-input idiom) rather than silently falling back while recording `source="template-site-map"` — a
provenance lie in a repo whose discipline is honest provenance.

**117 → 140 (assets), 85 → 100 (production).**

### PageRegion Compiler

New `src/regions/` — a deterministic, **consumer-free** visual-section compiler producing a versioned
sibling artifact under a new `data/<host>/page-regions/` namespace. Slot join goes purely through
`slot-bindings.json` `(pageId, viewport, nodeId)`. **Zero `src/recon-template/` files opened.** Slot V2
schema unchanged. No new DOM attribute. No ON/OFF behaviour (explicitly deferred).

| Canary | Regions | Slots joined | Orphans | Determinism |
|---|---|---|---|---|
| linear.app | 68 (5 global / 63 page) | 3,079 / 3,079 | 0 | byte-identical ×2 |
| stripe.com | 1,014 | 9,529 / 9,529 | 0 | `sha256 3aaf467a…`, 2,316,064 B |

A verifier bypassed the compiler entirely and re-derived the join from raw `slots.json` /
`slot-bindings.json` — 9,929 bindings joined, 0 orphan, exact match.

**MAJOR defect found and fixed.** The global-lift branch minted ids via `regionIdOf(scope, landmarkKey,
childPath)`, which **ignores `rootTag`**, while the grouping key *includes* it. A site rendering a
landmark as a different tag at mobile on every page lifted both variants to the same global id and hit
`throw new RegionCompileError` — `exit 1`, **no artifact at all**, on legitimate responsive markup. It
survived because both canaries report `viewportRootMismatches=0` and nothing asserted otherwise. Fixed
by ranking lifted variants so the one with fewest `@mobile` drafts keeps the plain id (backward
compatible), with a structural proof that at most two variants per base id are reachable and the
duplicate `throw` retained as a backstop. Both canaries recompile **byte-identical** after the fix.

**Locality, stated honestly.** The program's requirement — a downstream insert must not renumber ids —
holds at **0 of 68** lost. But an *upstream* `<div>` insert repaths **45 of 68 (66%)**, because
`skeleton.ts` `pathSegment` is a tag-scoped ordinal and region roots are overwhelmingly `<div>`. The
original handoff overstated stability; it now names the measured figure and the suite pins the
asymmetry.

**New suite: 67 checks.**

### Template Factory V2, Route Scope Policy, and the Collection Boundary

Route Scope Policy is an **input to recon-template compilation** — not the Selector, not SiteSpec.
`git status --porcelain src/selector/ src/sitespec/` is empty by construction; `SLOT_SCHEMA_VERSION`
stays 2 (only `TEMPLATE_COMPILER_VERSION` moved to 3). No `template` StageRunner was added.

Closed vocabulary: `core-reconstruct` (default — a policy-free compile is byte-for-byte the pre-Task-27
slot surface), `collection-index`, `collection-representative`, `structure-only`, `exclude`.

**Measured slot reduction (stripe.com):**

| | Policy-free | Policied | Δ |
|---|---|---|---|
| Slots | 9,529 | 4,661 | **−51.09%** |
| Bindings | 24,518 | 13,680 | −44.2% |
| Routes | 20 | 20 | 0 |

**The agent limited its own headline number:** *"51% is what THIS 20-route reconstruction can show,
because only 10 of its routes belong to the repeated family. On a real 4,000-page blog the same policy
removes the whole family minus one member, so the reduction tracks the family's share of the crawl, not
this 51% figure."*

**The audit's flagged-unverifiable risk is closed both ways.** It listed *"whether filtering `pagesById`
at the compile seam leaves parity QA green"* as UNVERIFIED — if dropping a page from extraction also
dropped it from rendering, frozen Exact Reconstruction would be broken. Structurally,
`generateTemplateApp` copies the reconstruction's `app/` tree with **no reference to `pagesById`**.
Empirically, a verifier ran the **live parity QA** (`next build` + Chromium) over structure-only routes
at 390/1440: **8/8 content equal, 8/8 structure equal, 0px doc-height delta, 0px geometry p95, 0
hydration errors**.

Collections extend `site-map` optionally: `collectionId`, `sourceFamilyIds`, `detailPattern`,
`indexRoute`, `representativeRoutes`, `discoveredMemberCount`, `countIsFloor`, `renderPolicy`.
`discoveredMemberCount` is an honest crawl-capped **floor**; no pagination detection exists in this repo
so any estimated total remains **null**. Detection and representation only — no blog engine, no CRUD,
no publishing flow. Source blog/docs pages are not copied.

**64 → 109 checks.**

### Release Project as Site Authoring State

**No parallel SiteInstance.** `src/release/` extended; new `src/release/instance.ts` adds only
identity/adaptation/folding helpers.

- **Stable `siteId`** — required at `types.ts:400` under `projectRevision: 2`, operator-suppliable via
  `--site-id`, preserved across prepare/build/prepare. Baseline for contrast: `projectId` was
  `${host}-${spec.runId}` — identity moved with every spec run.
- **Non-destructive prepare** — the hardcoded `resolutions: []` / `runs: []` are gone; `createdAt`,
  resolutions, authored state and run history are all carried, while requirement recalculation stays
  distinct and unconditional.
- **`authored.slotValues` is authoritative** — applied **last** at `stages.ts:134-138` with source
  `user-provided`, materialized into a *new* content run, consumed by production.
- **Theme authoring** — `THEME_SELECTION_IMPACTS` now has real engine call sites
  (`graph.ts:69`, `freshness.ts:199-202`). A theme edit stales **exactly** `{theme, production}` and
  leaves `{reconstruction, template, content, seo, assets}` fresh — all five outcomes verified by
  running the real engine, not reading it.
- **Template `report/` hash exclusion** applied in **both** `prepare.ts` and `freshness.ts`.
- **Content derived-output exclusion** — `CONTENT_DERIVED_HASH_EXCLUSIONS = ["report",
  "slot-accounting.json"]`, because Task 27 itself added writes into content run dirs. `slot-values.json`,
  `manifest.json` and `generation-result.json` deliberately **stay in the hash** — an over-wide exclusion
  would cause silent staleness, worse than the drift it fixes.

**84 → 162 checks.**

### Content Generation V2

- **Batching actually executes.** A verifier's counting wrapper observed **8 separate `generate()`
  invocations** of ≤40 units for a 285-unit packet; the adjudicator independently observed **36
  invocations for 36 batches** on the full 1,202-unit linear packet. Global batches first, deterministic
  ids and order, byte-identical across runs, duplicate keys detected rather than last-write-wins. The
  manual `--result-file` path still works.
- **Slot accounting** — sibling `slot-accounting.json` with **two orthogonal fields**, `origin` and
  `disposition` (no `REVIEWED`, which would collide with `editability="review"`). Re-derived from
  scratch by a verifier: **594 in-scope = 594 entries = 594 origin = 594 disposition**, 0 missing, 0
  double-counted. `slot-values.json` stays bare.
- **Fact policy** — `verified-only` (default) and `synthetic-allowed`.
- **GED-D** — bounded no-progress guard with a machine-readable stop reason; `fakeText` untouched, blast
  radius proven across seo/production/release.
- **Telemetry** — provider-neutral and **never fabricated**: a manual result produces a record with *no*
  `usage` key at all, while a stub provider that reports usage has it recorded verbatim. Absence is a
  decision, not an unimplemented path.

**A framing correction worth recording.** The handoff originally described the `verified-only` default
as *"the behaviour every Task 19 run already had."* The additivity verifier disproved this using the
module's own docs: Task 19's rule bound only the **prompt**, whereas `FACT_CLAIM_PATTERNS` now actively
demotes any value containing a percentage, price or superlative-social-proof phrasing to `unresolved` on
re-ingest — so a project that read `PRODUCTION_READY` can read `INPUTS_REQUIRED` after a rerun. The
strict default was **kept**, with reasons: the demotion is loud (one printed line per withheld slot), the
escape hatch is lossless (`synthetic-allowed` reproduces the Task 19 overlay byte-for-byte, measured),
and on-disk additivity is unaffected.

**68 → 128 checks.**

### Brand Leak Requirements, SVG Detection, GED-F

New requirement kind **`brand-leak`**, collected from the existing brand-leak report plus the template
runtime IR — **never a new QA assertion**. A repo-wide guard proves no blanket zero-equality assertion
over any source-host census exists in `src/` or `scripts/`.

**SVG `aria-label` and `<symbol id>` detection now exists** — nothing in the repo could see these before
(linear: 48 + 32; camel-hump aware, so `LinearAi` matches while `ChevronDown` does not).

| Host | Surfaces detected |
|---|---|
| linear (8 routes, 1,581 SVG nodes) | svg-aria-label 48, svg-symbol-id 32, visible-text 88, source-url 101, image-alt 14, aria-label 2 |
| stripe (20 routes, 7,701 SVG nodes) | svg-text 100, aria-label 77, visible-text 62, image-alt 10, source-url 8, svg-aria-label 8 |

Release-blocking **only** where a surface publishes source identity *and* an implemented resolution can
clear it. **The gate did not move**: linear 88 blockers, stripe 74 — **zero** of them `brand-leak`.
GED-F is detector-only with neutralization **default OFF**, proven four ways including byte+mtime
immutability of the scan inputs; `smoke-production.ts` still asserts
`residualSourceUrlOccurrencesInSite === 1` and still passes.

A latent bug was fixed along the way: `requirements.ts` `bySlotKey` became a multi-map, so one slot value
now clears **every** requirement bound to that slot — it previously dropped all but the last.

---

## Real Data Release Exercise

The audit's largest unknown, now closed.

| Step | Result |
|---|---|
| Project / siteId | `data/linear.app/release-projects/flowpilot-wr27`, `siteId=flowpilot-wr27` |
| Non-prepare run records | **5** (2 resolve, 3 build) — previously **0** on disk |
| Authored value | `global.footer.text.features`: `Features` → `Capabilities27`, applied via `release:resolve` |
| Re-prepare | Sits *between* resolve and build in `runs[]`; `createdAt` still the **first** prepare's run id |
| Stages run | content, theme, seo, production |
| Stages reused | reconstruction, template, assets |
| Frozen proof | recorded `reused`, **0 ms**, original ids; `DEFAULT_STAGE_RUNNERS` has no entry for either |
| Frozen hashes | `40c183bd…` / `d1b6027d…` identical across all seven run records |
| Output | present in **all 8 route HTML files**; `grep -c '>Features<' index.html` = **0** |
| Theme scenario | theme + production stale, four others fresh; `#3d5afe` reached the shipped overlay CSS |
| Retry/resume | tested via runner injection — **no artifact corrupted**; retry re-ran production only |
| `BLOCKED BY` | exercised on a throwaway indexable project: 88 ids, production absent from WOULD RUN |
| Historical runs written | **0** |

The exercise found two real defects and, correctly, **did not fix them** — it was validation, not
construction. Both were then fixed by separate agents (below).

---

## Revision Foundation (Stretch A)

`src/release/revisions.ts` — a linear, append-only, immutable chain over `authored`, stored as
`revisions/r000..r00N/revision.json`. No branching, no merges. Restore **appends** rather than rewinds.

A verifier **raced two concurrent appends** to prove the `wx` write guard (fulfilled=1, rejected=1,
`EEXIST`) and wrote its own canonical-JSON hasher to confirm `authoredStateHash` covers the authored
object alone, not the whole project document.

**Latent defect found and fixed:** `loadRevisionChain` sorted lexicographically, so once `r1000` existed
the order became `… r100, r1000, r101 …`, the index check threw, and the chain became **permanently
unloadable** — taking `headRevision`, `append`, `getRevision` and `restore` with it. Not theoretical:
this foundation exists for Visual Editor undo history, and a user editing a site is exactly the caller
that reaches 1,000 revisions. Fixed with numeric ordering and tested against a real 1,001-revision chain.

**24 checks.** The module is **inert** — nothing calls it yet; three change requests filed.

---

## Registry Foundation (Stretch B)

`src/registry/` — filesystem index only, no database, no UI, no DI ceremony. Stored at `data/.registry/`.
`readTemplate`/`readSite` use the cached entry **only** to learn a directory, then re-derive from the
artifact and report `indexAgreed`; `rebuildRegistry` recreates both files from a scan alone.

Two decisions that refused an easier answer:

- **`siteId` is not the key.** It isn't unique on disk — both pre-Task-27 linear projects adapt to
  `"linear.app"`. The key is `<host>/<projectId>`, the collision is warned, and `readSite` returns
  `null` on an ambiguous `siteId` **rather than guessing**.
- **`name` is derived, not stored.** A registry-only name would be unrebuildable — the second source of
  truth this goal forbids. A `displayName` field was filed as a change request instead.

**27 checks.** Also inert; three change requests filed.

---

## Regression and Per-suite Check Count Diff

| Suite | Baseline | Final | Δ |
|---|---|---|---|
| verifier | 81 | 81 | 0 |
| selector | 81 | 81 | 0 |
| multi-observer | 62 | 62 | 0 |
| interaction-detector | 92 | 92 | 0 |
| interaction-explorer | 108 | 108 | 0 |
| interaction-patterns | 88 | 88 | 0 |
| sitespec | 257 | 257 | 0 |
| reconstruction | 217 | 217 | 0 |
| reconstruction-qa | 134 | 134 | 0 |
| e2e | 130 | 130 | 0 |
| recon-template | 64 | 109 | +45 |
| content-injection | 68 | 128 | +60 |
| theme | 47 | 47 | 0 |
| seo | 79 | 97 | +18 |
| assets | 117 | 140 | +23 |
| production | 85 | 100 | +15 |
| release | 84 | 162 | +78 |
| **regions** *(new)* | — | 67 | +67 |
| **revision** *(new)* | — | 24 | +24 |
| **registry** *(new)* | — | 27 | +27 |
| **TOTAL** | **1,794** | **2,151** | **+357** |

**0 failures. Zero negative deltas. `pnpm typecheck` exit 0.**
Logs: `docs/result/handoffs/27-regression-logs/{baseline,wave1,wave2,wave3,final,final-2}/`.

The ten untouched suites holding at *exactly* their baseline counts is the load-bearing result:
`sitespec` 257, `reconstruction` 217, `reconstruction-qa` 134 and `e2e` 130 unchanged means the frozen
Exact Reconstruction engine was genuinely not disturbed while the authoring layer was built on top.

**One check was deliberately removed** (`27H.7`), a fake-pass named *"the freshness warning reaches the
operator through release:plan"* that asserted `warnings.length === 0`. It was replaced by seven real
checks. That is the only intentional decrease in the program and it is justified individually.

---

## Historical Integrity

| Invariant | Result |
|---|---|
| Pre-existing `data/<host>/<kind>/<run-id>/` files modified | **0** |
| Evidence | Every touched run dir has a *birth time* of 01:14–04:28 on Aug 27 — created during the program |
| 77 run ids referenced by handoffs 21–26 | all still present |
| 7 stripe `smoke:release` lineage dirs | 0 files newer than the baseline commit, checked before *and* after running the suite |
| `24-aggregation-phase1.json` | byte-identical to HEAD's blob `0322639753518bb96f90f42d8e451bffda9aacd3`; `debt.ts:15` still reads it |
| `docs/` outside `27-*` | unchanged |
| Commits / staged / stashes / branches | 2 / 0 / 0 / main only |

**A vacuous proof was caught and replaced.** An integrator initially "proved" the `data/` invariant with
`git status --porcelain data/` — which is empty for *any* tree state, because `data/` is gitignored. The
additivity verifier flagged it; every subsequent proof uses mtimes and birth times.

**One honest exception:** `.git/FETCH_HEAD` was written at 05:04 — an agent ran `git fetch`. It changed
no ref, wrote no object, and the fetched SHA equals HEAD. Read-only and harmless, but it *is* a git
command and is recorded here rather than smoothed over.

---

## Deferred: Visual Editor Work

Not implemented, by instruction. The audit already established feasibility (serve-boundary injection,
`data-wr-node`, the existing `parity-qa.ts:858` resolver, iframe/postMessage) and this program did not
re-litigate it. Concrete blockers encountered:

- **Region/route enablement does not exist anywhere.** `AuthoredStateSchema` is `.strict()` with only
  `slotValues`, `theme`, `updatedAt`; every "enablement" mention in `src/` is a forward reference.
- **Revision append is O(n) per call** — `appendAuthoredRevision` re-reads the whole chain. An undo
  history wired to a UI will get slow long before it gets incorrect. Size this before wiring.
- Two unmeasured unknowns from the audit remain unmeasured: React-19 survival of an injected `<script>`,
  and `next start` restart latency.

## Deferred: Region / Route Enablement

PageRegion ships consumer-free, as scoped. A future consumer must carry: `routes → pageSourceId`
reference counts (many-to-one, preserved in the artifact), trigger/target interaction cuts, dead
navigation links, SEO route removal, release requirement collection, and enabled-route QA sampling.

---

## Remaining Technical Risks

1. **The entire program is an uncommitted working tree.** 44 modified tracked files and 68 untracked
   paths layered on `d33abb3`, zero stashes, zero branches. That was the program's own constraint, not a
   violation — but one stray `git checkout`/`clean`/`stash` destroys all of it. **Commit first, before
   anything else.**
2. **`source-brand-asset` remains an unclearable blocker.** No bake-time rewriter exists, so no
   resolution can honestly clear it — and the severity was deliberately *not* downgraded to manufacture a
   passable gate. Any source with an inline-SVG logo still cannot reach `PRODUCTION_READY`.
3. **The assets stage runner has never executed on real data.** Across all three real builds, `assets`
   appears only in `reusedStages`. Reuse was correct here, so this is a coverage hole, not a defect.
4. **No indexable-production build has run end-to-end.** Every real build finished at
   `PRODUCTION_INPUTS_REQUIRED` with 88 blockers open; the indexable path was reached only as far as the
   `BLOCKED BY` gate.
5. **An unexplained +2 requirement drift.** `requirements.json` reports 380; a surviving log proves the
   CLI printed 378 at step 1. Both figures are recorded; the drift is **reported, not explained**.
6. **GED-D loop-level behaviour is verified by code read**, not by driving the real `cli-content-qa.ts`
   loop into a no-progress stop. The guard is proven as a unit.
7. **The three-surface agreement check is state-dependent**, not a universal invariant — `resolve`
   reports one pack's invalidation while `plan` reports whole-project staleness.
8. **`collections[]` and both stretch modules are inert** — written and asserted, but no engine reads
   them yet. Six change requests are filed and unapplied.
9. **PageRegion granularity is non-uniform** (25 regions on linear's homepage vs 7 on `/changelog`) and
   its global lift is strict enough to miss linear's footer, shared by 7 of 8 pages. Measured, not
   loosened — loosening is a decision that needs a consumer.
10. No atomic writes or locking anywhere in the repo (pre-existing, repo-wide).

---

## Recommended Next Task

**TASK 28 — VISUAL PRODUCTION WORKFLOW.**

Do two things first: **commit the tree**, then close three cheap carried items — wire the six filed
change requests, exercise the assets stage on real data, and resolve the +2 requirement drift.

Then: Visual Editor V1 on the proven substrate. PageRegion is the deterministic, consumer-free
foundation an editor is meant to consume, and `authored.slotValues` is the proven write target —
`stages.ts:134-138` applies it last and `freshness.ts:190-198` stales content on an authored edit, so an
editor writing there inherits correct invalidation for free. Then safe Region/Route ON-OFF, a real
ContentGenerator provider, production-mode SEO validation, and a full production canary.

---

## Final Verdict

# READY FOR VISUAL PRODUCTION WORKFLOW

Reached by a fresh four-auditor panel plus an adjudicator, none of whom implemented anything.
**37 / 37 mandatory points VERIFIED. 0 failed. 0 unverified.**

The adjudicator did not rule on the auditors' word — it re-ran 9 suites (849 checks), re-derived the
2,151 total by parsing all 20 raw logs, ran the real freshness engine, spied on the real generator,
reconstructed the pre-fix `rewriteHtmlHead`, recompiled both canaries, and re-derived the collection
counts from the source SiteSpec. It also **corrected a suspicion it shared with one of its own
auditors**: the stripe canary's missing shared-page disclosure was a stale artifact, not a dishonest
compiler — the code already emitted it. That canary has since been recompiled and now carries it.

All thirteen READY criteria are met with evidence: stable site-scoped identity; non-destructive prepare;
authoritative authored slot values; working theme invalidation; Template Factory route scope; collection
foundation; deterministic PageRegion; Content V2 batching, accounting and fact provenance; GED-D/E/G as
scoped; brand requirement foundation; real release resolve/build exercise; regression PASS; no historical
mutation.
