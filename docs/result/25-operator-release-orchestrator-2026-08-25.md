# Task 25 — Operator Release Orchestrator & Production Input Resolution (2026-08-25)

Built by Task25-Builder on top of the frozen Task 17–24 lineage. Every number
below has an on-disk evidence path (the accepted stripe artifacts, the new
`data/stripe.com/release-projects/` canary project, the `smoke:release` log in
`docs/result/handoffs/25-regression-logs/regression-release.log`, and the
canary CLI transcripts in `docs/result/handoffs/25-stripe-canary/`); nothing
in this report is re-measured by hand.

---

## Executive Summary

Task 25 adds the layer the engineering MVP was missing: a **Release
Orchestrator** that lets an operator see one project's whole state at a
glance, fill in exactly the real-world inputs that are missing, and re-run
**only** the stages those inputs invalidate. It is a conductor, not a new
analysis engine: every requirement it reports is **collected** from signals
the Task 18–23 artifacts already carry (SEO needs-input entries, content
unresolved slots, the asset replacement seam, font license verdicts, the
production indexability gate), never re-detected and never hardcoded.

- `release-project-v1` / `production-resolution-v1` / `release-requirements-v1`
  / `release-run-v1` versioned models, with a closed 10-state release enum —
  no single `ready` boolean exists anywhere.
- Four CLIs: `release:prepare`, `release:plan`, `release:resolve`,
  `release:build` (+ `--dry-run`), all thin wrappers over typed APIs in
  `src/release/`.
- **Stripe canary**: from the accepted candidate
  (`production-specs/2026-08-19T06-36-35-798Z`) the orchestrator derived
  **437 requirements (74 release-blocking)** — domain, 46 business facts,
  19 uninjected routes, 340 replacement assets, 2 font licenses, 374
  inline-SVG brand marks, og-image / logo / social handle — every count read
  from artifacts at runtime. Stripe remains **PRODUCTION_INPUTS_REQUIRED**,
  which is the PASS condition (spec §24).
- **Synthetic full-resolution canary**: a 2-route fixture site built through
  the REAL pipeline went `PRODUCTION_INPUTS_REQUIRED → PRODUCTION_READY`
  through resolution packs + selective rebuilds, with **reconstruction rerun
  count 0, template compile count 0**, domain-only change re-running
  **seo + production only**, and an image-only change re-running
  **assets + production only** — the final indexable package passing the
  isolated-launch browser QA with **0 external requests**.
- New suite `pnpm smoke:release`: **84 checks, 0 failures**, covering all 26
  spec-mandated cases. Full regression: all 16 existing suites byte-identical
  in count plus the new suite — see Regression.

**Final Verdict: READY FOR FIRST REAL PRODUCTION PILOT** (details at the end;
the verdict is about the orchestration layer — stripe itself honestly stays
input-required).

---

## Why Task 25 Exists

After Task 24 the engine could produce an honest production **preview** for a
site, but turning that preview into an indexable production build required an
operator to know nine CLIs, a dozen artifact schemas, and which of them a
given input invalidates. The Task 24 verdict — MVP PREVIEW READY, PRODUCTION
INPUTS REQUIRED — named seven blocker groups but left the operator to chase
them across `report/needs-input.json`, `replacement-manifest.json`,
`font-inventory.json`, `generation-result.json` and the production spec by
hand. Task 25 turns that scattered knowledge into one machine-readable
project: what is READY, what NEEDS INPUT, what became STALE, and what to run
next — without reading a single log.

---

## Operator Mental Model

```
ENGINE PIPELINE (frozen artifacts)
        ↓  release:prepare  — scan the accepted candidate
release-project.json + requirements.json + operator-checklist.md
        ↓  release:plan     — READY / NEEDS INPUT / STALE / NEXT ACTIONS
operator fills a production-resolution-v1 pack (only what a requirement asks)
        ↓  release:resolve  — validate → match → stage invalidation
        ↓  release:build    — dependency-graph-driven SELECTIVE rebuild
PREVIEW  ……  PRODUCTION_READY (only when every blocker is truly resolved)
```

The operator never fills a 40-field intake form: the base input remains the
natural-language intent, and the resolution pack carries **only** the values
open requirements ask for (every field optional, spec §3/§9).

---

## Release Project

`release-project-v1` (`src/release/types.ts`, stored at
`data/<host>/release-projects/<projectId>/release-project.json`):

- `projectId` is deterministic (`<host>-<acceptedSpecRunId>`), so re-prepare
  is idempotent — the stripe canary is
  `stripe.com-2026-08-19T06-36-35-798Z`.
- `acceptedLineage` records all seven stages — reconstruction, template,
  content, theme, seo, assets, production(spec+build) — each as
  `{id, path, hash}` with `dir-sha256-v1` hashes recomputed at prepare time
  (Task 23's `hashDirectory`, reused, not re-implemented).
- `stageStatus` per stage: `fresh | stale | blocked` + the current artifact +
  the recorded stage-inputs hash; `resolutions[]` (applied packs, inline, with
  hash and match table); `releaseState` from the closed enum
  `DISCOVERED … PRODUCTION_INPUTS_REQUIRED → PRODUCTION_READY`; `failure`
  (spec §27); `technicalDebt` (spec §30); `limitations` incl. the
  blog/collection boundary (spec §31).
- The accepted lineage block is immutable; stage reruns update
  `stageStatus[stage].artifact` and always land in NEW subsystem run-id
  directories.

## Requirement Model

`release-requirements-v1` — one machine-readable list, every entry:
`requirementId` (deterministic, artifact-derived), `kind` (closed:
production-domain / business-fact / external-url / replacement-image /
organization-logo / og-image / font-license / content-route /
source-brand-asset / social-handle / seo-fact), `severity`
(**release-blocking / high-value / optional** — the spec §22 vocabulary, no
scores), `status` (unresolved / resolved / accepted-limitation /
not-applicable), `sourceStage`, optional `route`/`slotKey`/`assetId`/`fontId`/
`factKey`, `message`, `resolutionOptions`, `evidence[]` (file + pointer into
the artifact the claim was READ from), and `resolvedBy` traceability.

The severity policy is encoded once (`SEVERITY_POLICY`, with a written basis
per kind) as a direct transcription of the spec §19 indexable conditions:
domain, uninjected routes (blocked-visible-source-content), replacement-
required render assets, font decisions and inline-SVG source marks are
release-blocking; business facts / og-image / organization logo / external
URLs are high-value; the social handle is optional. Requirement collection
(`src/release/collect.ts`) reads ONLY existing artifacts — spec §8's "conductor,
not a new analysis engine" is structural: there is no DOM scan, no classifier
and no fetch anywhere in the release layer.

## Resolution Pack

`production-resolution-v1` — all fields optional: `notes` (natural language),
`productionBaseUrl`, `facts` (canonical seven feed the SEO plan;
`twitterSite` is a recorded social-handle decision), `urls[slotKey]`,
`assets[assetId]` (inventory ids plus the site-level `og-image` /
`organization-logo`), `fontDecisions[family]`
(`use-fallback-stack | self-host-license-verified`), `routeContent[route]`
(slot values + optional page plan), `acknowledgements[]` (→
accepted-limitation; deliberately does NOT unlock indexable production —
spec §7 requires blockers to be *resolved*). A strict zod validator rejects
unknown fields, unknown slot keys and unknown template routes before any
stage runs. Requirement→resolution traceability (spec §11) is recorded both
ways: the applied pack stores its match table, and each resolved requirement
stores `{resolutionId, field}`.

## Natural Language Resolution Seam

Spec §10 allows a provider-neutral seam without a wired LLM. `src/release/nl.ts`
defines the whole provider contract (`ResolutionParser.parse(text) → pack`)
and ships `manual-json` — the operator (or an operator-driven LLM session,
exactly how the accepted stripe content run was produced) converts the
sentence to JSON. Whatever produced the JSON, `release:resolve` re-validates
it against `production-resolution-v1`; the smoke proves the parser seam
enforces the same gate.

## Dependency Graph

Explicit and closed (`src/release/graph.ts`):

```
reconstruction → template → content → { theme, seo } → production
                 template ───────────→ assets ───────→ production

productionBaseUrl → seo → production
facts / urls / routeContent → content → seo → production
assets / fontDecisions → assets → production
theme selection → theme → production
```

`content → theme` is encoded because a theme run pins its content run.
Reconstruction and template are **frozen roots**: no runner exists for them,
`release:build` refuses to proceed if their inputs drift, and the smoke
asserts their rerun count is 0 across the whole scenario. The one deliberate
simplification (asset-inventory imageBrief joins not invalidated by a content
rerun) is recorded as a project limitation, not hidden.

## Stage Freshness

Every stage's inputs reduce to one sha256 over a canonical JSON of (a) its
upstream stages' `dir-sha256-v1` artifact hashes and (b) the slice of the
cumulative resolution that stage consumes — with operator-provided asset
files content-hashed, so swapping bytes at the same path is a change.
`fresh` = recorded hash matches the recomputation; `stale` = inputs moved
(staleness then propagates through the graph so the plan predicts the whole
cascade); `blocked` = the target is indexable production and release-blocking
requirements remain (production stage only). Artifact drift is detected by
re-hashing the artifact directories on every plan/build.

## Selective Rebuild

`release:build` executes only stale stages, in topological order, each
through the subsystem's public typed API (never `exec("pnpm …")`, no
algorithm duplicated): content = `prepareContentRun` + a merged
generation-result through `ingestGenerationResult` (the same operator seam
the accepted stripe run used); theme = `createThemeRun` with the pinned theme
+ adapter over the current content run; seo = `createProductionSeoPlanRun`
(the `--domain` seam flips the plan to production mode); assets =
`applyAssetResolutions` — the NEW release-layer consumer of the Task 22
replacement seam, deriving a fresh materialization run (base bytes copied,
operator files content-hashed into `media/`, rewrite map extended,
replacement entries flipped to `provided`, font decisions recorded) without
touching the base run; production = `runProductionCompile` +
`runProductionQa`, and a build whose QA fails is never adopted. After every
build the requirements are **re-collected from the new artifacts** and merged
with the applied resolutions — a resolution whose consuming stage was rebuilt
but whose gap persists stays unresolved (artifact truth beats bookkeeping).

## Dry Run

`release:build --dry-run` prints WOULD RUN / WOULD REUSE / BLOCKED BY and
mutates nothing — the smoke snapshots the entire host namespace (path + size
+ mtime) before and after and asserts byte-identity. The stripe canary
dry-run (`25-stripe-canary/release-build-dry-run.log`) reports "nothing —
all stages fresh" with all seven stages reused; the fixture dry-run after
pack 1 predicts the full cascade `content/theme/seo/assets/production`
against reused frozen roots; the indexable-gate dry-run shows
`production BLOCKED BY content-route-/pricing, font-license-…`.

## Retry / Resume

A stage failure records `lastSuccessfulStage / failedStage / failureArtifact
(runs/<id>/failure.json) / retryable` in the project (spec §27), and the
project is saved after every successful stage, so completed work is never
lost. The smoke injects a failing seo runner: the failed run re-runs nothing,
records the failure honestly, and the retry re-runs **only** `seo` +
`production` — content/theme/assets stay reused, and the failure record is
cleared on success.

## Preview vs Production

PREVIEW allows unresolved factual requirements (noindex, robots-disallow, no
served sitemap — unchanged Task 23 behavior, QA-verified). INDEXABLE
PRODUCTION is a real gate, not a flag: `PRODUCTION_READY` is derived from
artifacts only — the spec's `indexabilityGate.decision === "indexable"`,
zero unresolved release-blocking requirements (routes covered, replacement-
required render assets 0, runtime source dependencies 0, font decisions
resolved), and a PASSING isolated-package QA. A domain alone flips the SEO
plan to production mode but can never flip the project to READY (the
production stage goes BLOCKED instead — preflight R3, proven in smoke test
21). One additive fix closed a real Task 23 gap on the indexable path: in
production mode the plan's final `sitemap.xml` is now copied into the export
and served (QA already demanded it); the preview path is byte-identically
unchanged.

## Route Readiness

Per template route the plan and checklist show content state (injected /
not-injected), the SEO needs-input count and the measured residual-asset
count, rolled into `READY / CONTENT_READY / NEEDS_INPUT`. Stripe today:
`/` CONTENT_READY (injected; og:url/og:image/twitter.site open; 4 residual
render assets), the other 19 routes NEEDS_INPUT (9 SEO gaps each). The
fixture ends with both routes READY. No route's state can hide the system
state: the release state is derived from requirements, not from the table.

## Operator Checklist

`operator-checklist.md` is generated per project: Ready section (fresh stages
+ resolved requirements struck through with their resolving field),
"Need your input" grouped by priority with **Why / How to resolve / Used on /
Expected / Evidence** per item (large uniform groups — e.g. stripe's 340
replacement images — collapse to a summary plus the first items so the page
stays readable), accepted limitations with the explicit note that an
acknowledgement does not unlock indexable production, the route readiness
table, and Technical warnings (brand-leak counts, theme compatibility, the
GED register, the workspace-versioning risk).

## Stripe Canary

`pnpm release:prepare data/stripe.com/production-specs/2026-08-19T06-36-35-798Z`
(read-only over the lineage; writes only the new
`data/stripe.com/release-projects/stripe.com-2026-08-19T06-36-35-798Z/`):

| kind | total | release-blocking | artifact source |
|---|---:|---:|---|
| production-domain | 1 | 1 | seo plan `domainState` |
| content-route | 19 | 19 | template routes − content scope, seo needs-input |
| replacement-image | 340 | 51 | replacement-manifest awaiting entries (+4 residual-render escalations, already replacement-required) |
| font-license | 2 | 2 | font-inventory `license[]` |
| source-brand-asset | 1 (374 svg entries) | 1 | inventory `counts.inlineSvgEntries` |
| business-fact | 46 (7 canonical + 39 slot facts) | 0 | seo plan businessFacts + content unresolved |
| external-url | 25 | 0 | content unresolved `.href` slots |
| og-image / organization-logo / social-handle | 3 | 0 | seo needs-input + JSON-LD omissions |
| **total** | **437** | **74** | |

Every number above is derived at runtime; the smoke re-derives each count
from the artifacts themselves and compares (no literal appears in src/ —
grep-verified). The requirement kinds match the Task 24 report's blocker
list one-for-one. Verdict: **PRODUCTION_INPUTS_REQUIRED — and that is the
PASS** (spec §24): no domain, facts, assets or licenses were provided, so
nothing pretended otherwise. `release:build --dry-run` on stripe: all seven
stages WOULD REUSE, zero mutation. No stripe stage was re-run and no source
host was fetched in this task.

## Synthetic Full Resolution Canary

`smoke:release` builds `release-fixture.example` (2 routes `/` + `/pricing`)
through the REAL pipeline — reconstruction → template compile → content
ingest (route `/` only, one unresolved external href) → theme extraction +
original-theme run → seo snapshot + preview plan → asset inventory +
materialization (local 127.0.0.1 fixture server through the TEST-ONLY
`allowPrivateHostPorts` escape; favicon classified replacement-required and
never fetched; one webfont license-needs-review) → production compile +
isolated-package QA (preview, green). Then:

1. `release:prepare` → **PRODUCTION_INPUTS_REQUIRED** (blockers: domain,
   `/pricing` content, favicon, font license).
2. **Pack 1** (facts + docs URL + favicon & og-image files + font decision +
   `/pricing` content — everything but the domain) → build re-runs
   `content, theme, seo, assets, production`; frozen roots reused; the ONLY
   remaining blocker is `production-domain`.
3. Injected seo failure → recorded (`failedStage: seo`, retryable, failure
   artifact) → retry re-runs only `seo, production`.
4. **Pack 2** (domain only) → invalidates `seo, production` ONLY → build →
   **PRODUCTION_READY**: spec indexable, baseUrl `newco-prod.example`, zero
   blockers, served `/sitemap.xml`, isolated QA green with **0 external
   requests** and 0 hydration/JS errors.
5. **Pack 3** (hero image only) → invalidates `assets, production` ONLY →
   still PRODUCTION_READY, and the new image's content-hash actually serves
   from the final package.

Spec §26 assertions, from the audit trail across every release run:
**reconstruction rerun count = 0, template compile count = 0**, domain-only
change = seo+production only (content regenerate count 0), asset-only change
= assets+production only. One honest fixture note: the initial
materialization's `report/network-qa.json` is a hand-built zero-residual
fixture (the browser-measured authority is the real production QA census,
which independently proves 0 external requests); a real site's census comes
from `assets:qa`, and derived materialization runs inherit it conservatively
with a recorded derivation note.

## Regression

All 16 existing suites re-run from repo root with the final Task 25 tree,
plus the new suite (logs: `docs/result/handoffs/25-regression-logs/`):

| suite | checks | failures |
|---|---:|---:|
| verifier | 81 | 0 |
| selector | 81 | 0 |
| multi-observer | 58 | 0 |
| interaction-detector | 92 | 0 |
| interaction-explorer | 108 | 0 |
| interaction-patterns | 88 | 0 |
| sitespec | 252 | 0 |
| reconstruction | 205 | 0 |
| reconstruction-qa | 134 | 0 |
| e2e | 130 | 0 |
| recon-template | 58 | 0 |
| content-injection | 68 | 0 |
| theme | 47 | 0 |
| seo | 72 | 0 |
| assets | 113 | 0 |
| production | 84 | 0 |
| **release (new)** | **84** | **0** |
| **total** | **1,755** | **0** |

The 16 existing suites match the Task 24 baseline (1,671 checks) count-for-
count; `smoke:release` adds 84. The only existing-code change in this task —
the production compiler's indexable-path sitemap fix — leaves the preview
path byte-identical, and `smoke:production` (84) passes unchanged.

## Historical Integrity

- **Zero historical artifacts modified.** The stripe canary is read-only over
  the lineage; the smoke snapshots (path+size+mtime) all six accepted stripe
  lineage directories before collection and asserts byte-identity after —
  PASS. All new outputs are ADDs: `data/stripe.com/release-projects/` and,
  for the fixture, a throwaway `data/release-fixture.example/` namespace
  removed at both ends of the suite.
- **Zero git write operations** (spec §29 / gate R): no add, no commit, no
  push, no branch change. Read-only `git status` only.
- **Operational risk (spec §29), recorded, not fixed:** the entire pipeline —
  every `src/` module, every smoke suite, every task report — still sits
  uncommitted on top of the single Phase-1 foundation commit (`2777b41`),
  and `data/` is gitignored by design. A disk failure or an accidental
  `git clean` would destroy the engine and its evidence. Every release
  project carries this as a standing warning
  (`warnings[]: workspace-versioning…`), and this report records it as the
  top operational risk for any real pilot. Committing remains a user
  decision; no git operation was performed in this task.

## Technical Debt Register

Preserved (not fixed — spec §30) from the canonical Task 24 artifact
(`24-aggregation-phase1.json .genericDefects`, `decision: post-mvp`) into
each release project's `technical-debt.json` and surfaced in the checklist:

- **GED-D** fake-provider micro-slot repair non-convergence → colors
  `content-route` requirements (operator-provided route content is the
  working seam, as this task's fixture and the accepted stripe run both use).
- **GED-E** preview-proxy entity-escaped titles → seo stage only; production
  path proven closed since Task 23.
- **GED-F** body-anchor source identity without neutralization → colors
  `content-route` / `source-brand-asset` (primarily an input requirement:
  inject the remaining routes).
- **GED-G** no per-file cross-route residual render list → colors
  `replacement-image` residual escalations (the orchestrator escalates any
  residual-render URL to release-blocking and warns when an inherited census
  goes stale).

Blog/collection boundary (spec §31): implemented as a limitation string in
every release project — template routes are a closed observed set; the seam
for a future collection task is the per-route `content-route` requirement.

## Next Phase Readiness

The orchestration layer is generic (nothing stripe-specific in code), so the
next phases have clean seams: (1) a real pilot — feed a genuine domain,
facts, licensed font and replacement assets through `release:resolve` on a
real site; (2) an LLM-backed `ResolutionParser` behind the existing validator
gate; (3) SEO-plan consumption of the recorded og-image / organization-logo /
social-handle inputs (today recorded + shipped in `media/`, honestly named as
a seam); (4) re-measured (not inherited) network QA for derived
materialization runs; (5) the collection/blog engine behind the recorded
limitation.

## Final Verdict

**READY FOR FIRST REAL PRODUCTION PILOT.**

An operator can now: see the current state of a project without reading any
internal artifact (`release:plan`, the checklist); fill in only the inputs
real requirements ask for, in one validated pack; re-run exactly the stages
those inputs invalidate (`release:build`, dry-runnable, resumable after
failure); and reach an indexable production build only when every
release-blocking requirement is actually resolved — proven end-to-end by the
synthetic canary reaching PRODUCTION_READY with zero unnecessary
reconstruction, while stripe honestly remains PRODUCTION_INPUTS_REQUIRED
until its real inputs exist. The named caveats stand: og-image/logo/handle
SEO consumption is a recorded seam, inherited network censuses are
conservative until re-measured, accepted-limitation never unlocks
indexability, and the uncommitted working tree is the single largest
operational risk for a real pilot.
