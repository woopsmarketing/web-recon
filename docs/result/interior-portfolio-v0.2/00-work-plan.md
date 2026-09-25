# 00 — Work plan and lane status (Interior Portfolio V0.2)

| | |
|---|---|
| date | 2026-09-24 |
| owner mode | **away — no mid-work questions.** OWNER DECISIONS A–S are final (`01-owner-decisions.md`). Safe non-destructive defaults elsewhere. A blocked lane must not stop the others. |
| master task | the owner's `prompt` file at the repo root of `web-recon-track-b` |
| repos | producer `/Users/woops/projects/web-recon-track-b` · consumer `/Users/woops/projects/boost-chat` |

This file is the index. It is updated as lanes land; the detail lives in the numbered reports beside
it. Read it first after any context loss.

---

## 1. Hard sequencing constraints discovered during the work

These are **not** preferences. Each one was found by hitting it.

1. **A Template Release must be cut and `boost-interior-demo` re-pinned before any V0.2 field is
   authored in `data/sites/**`.** `platform/content/` is a Template Release runtime source, so the
   extended `ProjectSchema` is not in the pinned release `interior-01-1.5.2-d87807590d64`, and a
   build materialises the **stored** release — whose frozen `.strict()` `ProjectSchema` rejects
   `projectType` and its siblings. Found by the producer implementation (`07` §5.1); mechanism being
   documented in `09-release-repin-recon.md`.
2. **`platform/site/**` and `templates/**` are Template Release sources too.** The head-scripts seam
   (widget lane) therefore belongs in the **same** release cut as the schema extension — otherwise
   the cut and the re-pin happen twice. The seam is being built *before* the cut for that reason.
3. **The demo-data package and the golden-package rebuild are one unit.** Ten integration checks are
   skipped with `TODO(v0.2-data)`; they are that package's acceptance criteria, not debt.
4. **The consumer search adapter depends on contract §14**, which has now been through four review
   rounds and was **restructured** in rev 5 into a single evaluation function. Implementation waits
   for a clean round. Building the adapter against any earlier revision would have meant building
   three BLOCKERs' worth of wrong behaviour.

## 2. Lanes

| # | lane | state | artefact |
|---|---|---|---|
| L0 | Owner decisions transcribed so they can be cited | **done** | `01-owner-decisions.md` |
| L1 | Contract V0.2 authored (rev 1 → … → rev 5) | **rev 5 written** — §14.3–§14.5 **restructured** into one evaluation function rather than patched a fourth time; `PB0` and the `VO6` style limit need consumer confirmation before freeze (§16) | `docs/reports/integration/07-integration-contract-v0.2-candidate.md` |
| L2 | Round-1 independent review ×2, fresh context | **done** — 6 BLOCKER, 15 MAJOR, all dispositioned | `02-…`, `03-…`, `05-review-disposition.md` |
| L3 | Round-2 delta review of rev 2 | **done** — NOT READY, 3 BLOCKER, 11 MAJOR, all accepted | `06-delta-review.md`, disposition in `05` |
| L4 | Round-3 delta review of rev 3 | **done** — NOT READY, 4 BLOCKER / 7 MAJOR / 12 MINOR-NOTE, all accepted → rev 4 | `08-delta-review-rev3.md`, disposition in `05` |
| L4b | Round-4 delta review of rev 4 | **done** — NOT READY, 2 BLOCKER / 4 MAJOR / 12 MINOR-NOTE, all accepted; its **structural** recommendation is what produced rev 5 | `10-delta-review-rev4.md`, disposition in `05` |
| L4c | Round-5 delta review of rev 5 | **in flight** — a review of the structure, not of patches | `11-delta-review-rev5.md` |
| L6b | Producer follow-up for rev 5 (`ST6` build warning, two stale `WS7a` comments, `INV-29` citation) | **done and re-verified** — 60 passed / 0 failed / 10 skipped, tsc clean; the warning provably changes no emitted byte | `07-producer-implementation.md` §8 |
| L5 | Demo data spec, 11 new records | **done (rev 4)** — realigned to contract rev 5; `bi-10`/`bi-18` re-authored `storage` → `built_in_furniture` | `04-demo-data-spec.md` |
| L6 | web-recon producer emits V0.2 | **done and independently re-verified** — tsc clean, 59 pass / 0 fail / 10 documented skips | `07-producer-implementation.md` (§7 = orchestrator disposition) |
| L7 | BoostChat consumer parses V0.2 | **done** — 74/74 checks, hand-off list H-1…H-8 | `boost-chat/docs/work/interior-portfolio-v0.2/03-consumer-parser.md` |
| L8 | Recon: BoostChat search-adapter surface | **done** | `boost-chat/docs/work/interior-portfolio-v0.2/04-adapter-recon.md` |
| L9 | Recon: Template Release cut + re-pin mechanism | **done** | `09-release-repin-recon.md` |
| L10 | Generic head-scripts seam (vendor-agnostic) | **done and spot-verified** — 14 new checks, zero vendor/host/key hits in the diff | `docs/result/static-deployment-foundation/widget-seam/01-head-scripts-seam.md` |
| L11 | Template Release cut + re-pin, version **1.6.0** | **held** until L4c and L6b land — L6b edits two release-content files, and a contract round could still move the vocabulary | — |
| L12 | Demo data authored (bi-01…bi-08 fields, bi-09…bi-19 added) + golden package rebuilt + the 10 skips restored | blocked on L11 | — |
| L13 | BoostChat interior portfolio search adapter | blocked on L4c (a clean contract round) | — |
| L14 | BoostChat consult state, extraction, cards, lead enrichment | blocked on L13 | — |
| L15 | GC1 refactor — interior concepts out of the generic core (OD-B) | **done** — all 8 leaks confirmed and moved (the recon had **undercounted**: an interior `workflow_key` literal was hardcoded in two generic SQL queries), behaviour byte-identical on a 108-case matrix, every suite green. Orchestrator then closed a **prompt-injection join seam** the agent raised: fragments neutralised separately could form a forged section header once concatenated — `formatDomainSection` now neutralises the joined lines, with `SECT-DOM-JOIN` as the regression test | `boost-chat/docs/work/interior-portfolio-v0.2/05-gc1-refactor.md` |
| L16 | Publish V0.2 package, refresh the consumer snapshot, V0.2 E2E | blocked on L12 | — |
| L17 | Full regression both repos + fresh-context final review | blocked on L16 | — |
| L18 | Exposure re-audit, then `PUBLIC_ACTION_TOOLS_ENABLED=true` (OD-S) | blocked on L17 | — |
| L19 | Real AI consultation QA, full transcripts saved | blocked on L18 | — |
| L20 | Widget origin allowlist, deploy, browser E2E | blocked on L11, L18 | — |

### 2.1 Load-bearing facts from the L8 recon (the consumer adapter is built against these)

- Today's matcher is `boost-chat/src/lib/first-party/matcher.ts:141` (`matchPortfolio`), called from
  `executor.ts:385` → `tool-loop.ts:1010`. Weights: `category` 3, `scope` 2, `tag` 1 (capped at 2),
  **`location` 1**. `area` is not in the score at all — only a tie-break. V0.2 replaces this scoring
  core, and OD-D takes `location` to **0**, including its use as the **first tie-break**
  (`matcher.ts:121-137`). No "serviceability" concept exists yet; that split is new policy.
- `InteriorConsultState` is `interior-state.ts:78-102`, persisted in `conversation_workflow_state`
  under `interior_consult`. **`TOP_LEVEL_KEYS` (`interior-state.ts:104-118`) is fail-closed: a key
  not listed there makes the whole row rejected on read.** It must be extended in the same change
  that first writes a new key, or state is silently lost. `budgetHint` is free text today — there is
  no structured amount, which is what `VB1` needs.
- Cards: `executor.ts:154-170` (`buildCards`/`facetLabels`) → `cards-header.ts` →
  `Chat.tsx:1193-1245` (`cardAreaText`). Lead enrichment: `lead/repository.ts:109-114,515-561` →
  `lead/group.ts` → `LeadBoard.tsx`. Nine files change to surface one new field.
- Eight genuine generic-core leaks for the GC1 lane (L15), in `prompt/builder.ts`, `prompt/policy.ts`,
  `prompt/boundary.ts`, `Chat.tsx`, `lead/repository.ts`, `lead/group.ts`, `LeadBoard.tsx`.
- Offline test scripts usable as a fast loop: `test:portfolio-matcher`, `test:portfolio-facet`.
  `test:portfolio-schema`, `test:portfolio-acceptance`, `test:first-party-reader` and
  `test:portfolio-sales-demo-e2e` need `TEST_DATABASE_URL`.

### 2.2 L11 — the Template Release cut, as it will be executed (from the L9 recon)

Do not start until **L10** has landed, so one cut covers the content model *and* the head-scripts
seam. Nothing here reaches the network; the cut is additive and local, and a re-pin back to 1.5.2
stays possible because a release directory is never deleted.

1. Cut:
   `./node_modules/.bin/tsx --tsconfig platform/tsconfig.json platform/cli/template-release.ts interior-01@1`
   (`argv[2]` must be `<templateId>@<major>`; there are no other flags.)
2. Re-pin: **there is no CLI.** Hand-edit the `template` object
   (`templateId` / `templateVersion` / `releaseId` / `releaseHash`) in
   `data/sites/boost-interior-demo/site.json`. The only precedent is commit `a2500f9`.
3. Rebuild with the pin verified:
   `./node_modules/.bin/tsx --tsconfig platform/tsconfig.json platform/cli/site-build.ts boost-interior-demo --release <new-releaseId>`
   (`--release` only *verifies* the pin; it never upgrades it.)

**Acceptance criteria — these are currently red and the cut is what makes them green:**

| check | file | why it is red now |
|---|---|---|
| `D` | `platform/test/step6.test.ts` | working tree ≠ cut release (content model extended) |
| `D2` | `platform/test/step6.test.ts` | same |
| `U` | `platform/test/step6.test.ts` | `buildInputId` moved with `PRODUCER_VERSION` 1→2 and the producer source hash |
| `I1` | `platform/test/integration.test.ts:1197-1204` | hard-codes `RELEASE_152` + its hash against live `site.json` — re-baseline |
| `I2` | `platform/test/integration.test.ts:1205-1213` | hard-codes `templateVersion: "1.5.2"` — re-baseline |
| `G4` | `platform/test/integration.test.ts:1003-1010` | a rebuild rotates packages; only `current` + `previous` are kept |
| `I2b` | `platform/test/integration.test.ts:1214-1223` | already skipped with exactly this TODO — un-skip it |
| 3 release checks | `platform/test/slice1.test.ts` | the working tree cuts `interior-01-1.5.2-dfbda5f4fc03` ≠ the stored `…-d87807590d64` |
| `R3` | `platform/test/ia150.test.ts` | `platform/` no longer byte-identical to the pre-change capture |
| `R2` | `platform/test/ia151.test.ts` | same capture assertion |
| `R2` | `platform/test/ia152.test.ts` | same capture assertion |

**Version number: `1.6.0`.** It is authored, not derived — `templates/interior-01/v1/template.ts:89`
`version: "1.5.2"`, with a JSDoc changelog paragraph per version directly above `defineTemplate`.
Nothing in the code enforces monotonicity, so the choice is ours and must be written down. `1.6.0`
rather than `1.5.3` because this cut carries **two** additions, not a fix: the content model gains
five authored fields, and the platform gains a capability it did not have — a per-site third-party
head-script seam. The release hash (`…-<12 hex>`) falls out of the bytes and cannot be chosen.

`platform/test/ia151.test.ts` and `ia152.test.ts` gate their assertions with `versionAtLeast(...)`
and are not expected to move.

**Forbidden shortcut.** Adding `content/schema.ts` to `isIntegrationSurface()` in
`platform/test/integration-surface.ts` turns `D`/`D2` green in one line. It must not be done:
`platform/integration/**` is not release content, the content model is, and the whole reason the
demo data is blocked is that the new fields are genuinely absent from release 1.5.2. See
`07-producer-implementation.md` §7.5.

### 2.3 Verified baselines (orchestrator-run, not taken on report)

**BoostChat**, captured before the adapter lane starts — every suite green, DB-backed checks
included (`TEST_DATABASE_URL` resolves):

| suite | result |
|---|---|
| `test:portfolio-matcher` | 56/56 |
| `test:portfolio-facet` | 49/49 (`REAL_EVAL_SKIPPED` — no live model call) |
| `test:first-party-contract` | 74/74 (was 58/58 before V0.2) |
| `test:first-party-transport` | 49/49 |
| `test:interior-state` | 55/55 |
| `test:portfolio-schema` | 10/10 |

**web-recon**, after the V0.2 producer and the `PRODUCER_SOURCE_FILES` fix:

| suite | result |
|---|---|
| `tsc -p platform/tsconfig.json --noEmit` | clean |
| `platform/test/integration.test.ts` | 59 passed · 0 failed · **10 skipped**, each tagged `TODO(v0.2-data)` or `TODO(v0.2-release)` |
| `platform/test/step6.test.ts` | 27 passed · **3 failed** (`D`, `D2`, `U`) — all release-drift, all cleared by L11. See `07` §7.5 |
| `platform/test/step4.test.ts` | 47 passed (agent-run) |
| `platform/test/step52.test.ts` | 12 passed (agent-run) |

### 2.4 A pre-commitment about review rounds

Round 5 is the **fifth** review of this contract. Rounds 2, 3 and 4 each found BLOCKERs in text
written to fix the previous round's BLOCKERs. Rev 5's restructure was the response to that pattern —
the round-4 reviewer's own diagnosis — and it is a different move, not a fourth patch.

**Decided now, before the verdict, so it is not decided under pressure afterwards:** if round 5
returns BLOCKERs that are *again* structural — rules that cannot be satisfied, or that disagree with
one another, inside §14.3's new evaluation function — the response is **not** a sixth patch and not a
second restructure. It is to **narrow V0.2's scope**: cut the budget-comparison rules back to the
smallest subset that is provably correct (most likely: breadth and scope matching with prices
*displayed* but never compared or ordered), ship that, and defer comparison to V0.3 with its own
review cycle. A contract that says less and is right beats a contract that says more and is not.

Ordinary MAJOR/MINOR findings do not trigger this. The trigger is specifically a BLOCKER in §14.3's
new structure.

#### Outcome: the trigger fired and the clause was **not** invoked

Round 5 returned 4 BLOCKERs, all inside §14.3. The literal trigger fired. The clause was not
invoked, and the reasoning is in `12-rev6-disposition.md` §1 in full; in short:

- the **independent reviewer**, who was told nothing about this clause, explicitly recommended
  against both narrowing and a second restructure — *"A fifth restructure is not warranted;
  finishing this one is"* — and named the completion (`EF6`'s totality, machine-checked);
- the **defect class changed**: rounds 2–4 found contradictions *between* rules in different
  sections; round 5's four are *missing rows in one table*;
- **narrowing would not have fixed them** — every candidate cut drops an owner goal (master task
  goals 5 and 6) and leaves `EF6` equally incomplete for whatever survives.

A pre-commitment exists to check my optimism. When the independent check says the opposite of what
I pre-committed to, the pre-commitment is what gets examined. What its *spirit* still binds: rev 6
does **not** argue `EF6` into totality — it executes it, over 1,344 evaluations, in
`proof/ef6-totality.mjs`. If round 6 finds another hole in `EF6`, the clause fires for real.

#### Round 6: the trigger fired again, and the clause is now tighter than as written

Round 6 returned 1 BLOCKER (`B-1`), inside §14.3, and it is literally *two rules that disagree* —
`EF1`'s closure sentence against the `WS8` clause rev 6 added. **§2.4's literal trigger fired.** The
narrower test set above did **not**: round 6 found no hole in `EF6` and said so
(*"`EF6` is total and single-valued, and I could not break it"*); the defect was in a rule added
outside `EF6` and in the proof's hand-written reachability predicate.

Rev 7 proceeds — `B-1` is a one-sentence placement error, BLOCKERs went 4 → 1, and the one BLOCKER
was introduced by the previous round's own fix. Full reasoning in `14-rev7-disposition.md` §1.

**The clause is tightened, which is the part that costs something.** From here it fires on **any**
BLOCKER in §14.3, whatever its cause and whoever introduced it, with no further argument and no
appeal to a reviewer's recommendation. Round 7 is the last round that gets a judgement call. I have
now twice found a defensible reason not to invoke this clause, and a pre-commitment that keeps
yielding to reasoning is not one.

#### Round 7: invoked. Round 8: the clause's remedy was tested and it failed

**Round 7 fired the tightened clause and it was invoked with no judgement call** — 3 BLOCKERs in
§14.3. The remedy was to **narrow**: budget comparison deferred to a V0.3 annex
(`16-narrowing-decision.md`), on the theory that every recurring pair of disagreeing rules was a pair
*because of* budget.

**Round 8 falsified that theory.** The narrowed rev 8 returned **4 BLOCKER · 8 MAJOR · 16 MINOR ·
6 NOTE** — the joint-worst BLOCKER count and the worst MINOR count of the series — and an
independent hand executor could not run a **single one** of the nine fixture utterances end to end
without guessing. The series across six rounds is **4, 2, 4, 1, 3, 4**: no trend.

The theory was half right. The pairs *were* the defect class; budget was one **instance**. Rev 8
removed the budget instances and grew three fresh ones in the same shape within one revision —
including `B7-2` recurring as `B8-2` **inside `GR3` itself**, created by rev 8's own fix for `M7-2`.

**So the clause's remedy is spent, and §2.4 does not get a third narrowing.** The replacement is a
change of *method*, not of scope — `19-round8-disposition-and-method-change.md` `DM-1`. Its ground:
partition rev 8's rules by whether anything mechanically checks them, and **all four BLOCKERs and all
seven false change-log summaries are in the prose-only half**, while the half with a
derivation-based executable check was declared clean by both round-8 reviewers independently.

**The new standing rule, replacing §2.4's narrowing remedy:**

> **No rule in §14.3 or §15 is fixed by hand until the check that would have caught it exists.**
> A design decision whose justification is a claim about the rules is not written into the contract
> until that claim is executed. If the claim fails, the decision is withdrawn, not argued.

This is already load-bearing rather than aspirational. Of the five decisions drafted for rev 9 in
`22-rev9-design.md`, **three died under their own checks before reaching the contract**: `D9-5`
(`WS6` conservative reading — 5,952 counterexamples), `D9-2` (reorder `GR2a` — 378 → 288 → 144
`PB4` violations, never 0), and `D9-3` (relax the `PB4` assertion — the relaxed form is the same
unsatisfiable property; the **rules** were wrong, not the test). Under the method of rounds 1–8 all
three would have shipped into rev 9 and returned as round-9 BLOCKERs.

**What this costs, stated up front:** roughly a round's work producing no new contract text, and it
will find defects in rules that currently look settled — so round 9 gets worse before it gets
better. Taken because six rounds of the alternative moved the BLOCKER count from 4 to 4.

## 3. Orchestrator decisions taken without the owner

Recorded because the owner is away and each one is a judgement, not a default.

| decision | where it is argued |
|---|---|
| portfolio document takes `schemaVersion "1.0"`, not the brief's `"0.2"` | `05` → "Escalated decision"; still open as `Q-2` |
| `projectType` has two wire values, absent = unknown, against the brief's "at least three" | `01-owner-decisions.md` deviations table |
| OD-J's producer-side derivation kept against review R1's advice to drop it | `05` → D-B5, `D-1`/`RD1` |
| `INV-29` kept literal: a record stating `projectType` must carry `workScopeIds` (`WS7c`) | `07` §7.2 |
| `INV-24` is per record, not per document (`ST6`/`ST7`/`CINV-12`) | `07` §7.2 |
| `PRODUCER_SOURCE_FILES` provenance hole closed immediately rather than deferred | `07` §7.3 |
| the head-scripts seam is built before the release cut so one cut covers both | §1.2 above |

## 4. Standing rules for every lane

- Reviewers are never told the desired conclusion, and an implementer never passes their own work.
- No assertion is deleted or weakened to reach green. A skip carries a tag and its restoration
  condition.
- `git add .`, `reset`, `restore`, `checkout`, `stash` are forbidden in both repos. The owner has
  uncommitted work in both.
- web-recon runs binaries from `./node_modules/.bin/`, never `pnpm`.
- Reports go to `docs/result/<task-name>/`. `docs/status/` changes only when the milestone state
  changes; `docs/architecture/` only when a decision is accepted.
