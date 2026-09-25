# Interior Portfolio Contract V0.2 — status

> **FROZEN 2026-09-25 — `FROZEN_NOT_READY`.** Work stopped by owner instruction, not by a completed
> round. Contract is **rev 9.1**, verdict **NOT READY**, **4 BLOCKER · 8 MAJOR · 9 MINOR · 6 NOTE**.
> The handoff — blockers, what is proven, what was wrongly claimed, production and git state — is
> [`../result/interior-portfolio-v0.2/32-round-9-handoff.md`](../result/interior-portfolio-v0.2/32-round-9-handoff.md).
> **The next session does not start at round 10.** It starts at *product-level invariant
> simplification and blocker resolution*. The table below records rev 8 state where it has not been
> superseded; where it disagrees with `32-`, `32-` is current.

Last updated: 2026-09-24. Detail lives in [`../result/interior-portfolio-v0.2/`](../result/interior-portfolio-v0.2/);
the contract itself is [`../reports/integration/07-integration-contract-v0.2-candidate.md`](../reports/integration/07-integration-contract-v0.2-candidate.md).
This file records **state**, not reasoning.

## Repo-wide state changes (read these before touching the build)

### Template Release `interior-01@1.6.0` is cut, and the demo is pinned to it

| | |
|---|---|
| release id | `interior-01-1.6.0-e65795202191` |
| releaseHash | `e657952021911f2c2fabc22e41c32f50d3fa79e0116fbd8b0560058c908ef034` |
| files | 65 (was 63 at `1.5.2`) |
| why | `1.5.2`'s frozen **strict** `ProjectSchema` rejects the V0.2 authored fields, so no V0.2 field could be authored into `data/sites/**` until a new release existed |
| evidence | `../result/interior-portfolio-v0.2/23-release-1.6.0-cut.md`, `25-release-rebaseline.md` |

`1.5.2` is **untouched** — `release.json` sha256 `83c521c570daeb…` and its recursive dir digest are
byte-identical before and after. All 13 stored releases still verify.

### ⚠ `1.6.0` snapshotted in-progress work, deliberately accepted

The working tree had seven dirty release-source paths at cut time and `release.ts` has no git
awareness, so `1.6.0` contains, beyond the intended `schema.ts` + `template.ts` bump:

- **added** `platform/site/head-scripts.ts`, `templates/interior-01/v1/app/head-scripts.ts` (both untracked in git)
- **changed** `platform/site/context.ts`, `platform/site/instance.ts`, `templates/interior-01/v1/app/layout.tsx`

Accepted rather than re-cut: the alternative is reverting or stashing uncommitted work that is not
this session's, which is forbidden. `1.6.0`'s changelog therefore **understates** the release. Re-cut
when the widget-seam work settles.

### ⚠ `I2b` is now a live gate on every release source

`I2b` was an unconditional `skip()`; it is now a live check that re-collects all 65 release sources
from the working tree, re-hashes them, recomputes the release hash and compares it against the
stored one. **Any edit to a release source now fails `I2b` until a new release is cut and re-pinned.**
Finishing the widget-seam work will trigger exactly this. That is the check working as designed.

`LIVE_BUILD_INPUT_ID` was deliberately **not** re-baselined — it also names the on-disk live
Cloudflare-pilot package directory and the `previous.json` rollback pointer `G4` asserts. A derived
`DEMO_OFF_BUILD_INPUT_ID` was added instead, so the next re-pin self-updates.

### Demo corpus: 19 records, V0.2-authored, applied

`data/sites/boost-interior-demo/content/projects.json` holds **19** records (was 8). Applied
2026-09-24 from `04-demo-data-spec.md` §2 (bi-09…bi-19) and `18-existing-eight-workscopes.md`
(bi-01…bi-08), evidence in `26-demo-data-applied.md` and `28-styles-and-rebaseline.md`.

19/19 parse `ProjectSchema`; `projectType` 7 full / 7 partial / 5 absent; all 19 carry
`workScopeIds`; 18 carry `styles`; emit+validate is **0 errors / 0 warnings**. `X8-1` — which
round 8's hand executor called *the single worst obstacle* — is closed.

`bi-06` carries **no** `propertyType`: `04` §0.2 assigned `apartment` to all eight on the ground
that *"every body says 아파트"*, which is false for `bi-04` and `bi-06`. `bi-04` is independently
backed by §19; `bi-06` was not, so the field was removed rather than guessed (`PT6`, `OD-F`).

### Producer invariants

`INV-28`, `INV-29`, `INV-30` are all enforced in **both** `platform/content/schema.ts` (authoring)
and `platform/integration/validate.ts` (emitted document), with coverage in `A10` and `V14`.
`INV-30` fires on no record in the current corpus by design: `bi-05` and `bi-19` are trades-only and
therefore breadth-absent.

## Contract state

| | |
|---|---|
| revision | **rev 9 in progress**; rev 8 is the last reviewed revision |
| rev 8 verdict | **NOT READY** — 4 BLOCKER · 8 MAJOR · 16 MINOR · 6 NOTE (`17-delta-review-rev8.md`), and 0 of 9 fixture utterances executable without a guess (`17b-`) |
| review rounds | 8, all NOT READY. BLOCKER series **4, 2, 4, 1, 3, 4** — no trend |
| scope | **narrowed**: price *comparison* deferred to a V0.3 annex (§17.1). Prices are emitted and may be **stated**, never matched. This defers a stated owner goal (master goal 5) and is the decision most likely to be overturned — `19-…-method-change.md` `DM-2` |

### Method change in force (`19-round8-disposition-and-method-change.md` `DM-1`)

> **No rule in §14.3 or §15 is fixed by hand until the check that would have caught it exists.**
> A design decision whose justification is a claim about the rules is not written into the contract
> until that claim is executed. If the claim fails, the decision is withdrawn, not argued.

Ground: partitioning rev 8's rules by whether anything mechanically checks them puts **all four
BLOCKERs and all seven falsified change-log summaries in the prose-only half**, while the half with
a derivation-based executable check was declared clean by both round-8 reviewers independently.

Already load-bearing: of five decisions drafted for rev 9, **three died under their own checks
before reaching the contract** — `D9-5`, `D9-2`, `D9-3` (`22-rev9-design.md`).

### Executable checks

| script | `npm run` | what it covers |
|---|---|---|
| `proof/ef6-totality.mjs` | `proof:ef6` | `EF6` totality / single-valuedness, class reachability |
| `proof/contract-pipeline.mjs` | `proof:pipeline` | the whole decision pipeline over the 19 records, six property classes. **Independently audited** (`21-pipeline-audit.md`): partial trust — conclusions of properties 1/3/4 usable, no published count is |
| `proof/ws6-monotonicity.mjs` | `proof:ws6-mono` | killed `D9-5` (5,952 counterexamples) |
| `proof/pb4-metamorphic.mjs` | `proof:pb4` | killed `D9-2` / `D9-3` |
| `proof/pb4-direction.mjs` | `proof:pb4-direction` | class-level check of the `D9-2c` direction |

⚠ **A `PB4` figure previously stated here was the wrong assertion's number and has been withdrawn.**
What `PB4`/`CINV-5` require is the **deletion form** (property 4a: delete a stated criterion's input,
re-rank, the record must not move down) — measured **FAIL, 44 findings**, and 109 of 218 in an
independent run (witness: `bi-09` falls 3 → 11 on *"예산 3천으로 전체 가능해요?"* when `projectType`
is deleted). The *"0 of 798"* reported in earlier revisions measures property **4b**, a pairwise
twin comparison, which is `D9-3`'s restatement — **withdrawn** as an illegitimate relaxation. Round
8's `B8-3` is **not closed**; it is `B9-1`. Full separation of 4a and 4b in `32-round-9-handoff.md` §5.

## Open, carried explicitly

- Rev 9 gives up `OD-P`'s **graded** fallback ordering while preserving its disclosure. That is a
  reading of an owner decision, not a fact about it — flagged in `22-rev9-design.md` §4a.
- `X8-21`: for *"32평인데 도배랑 바닥만"* the only `exact` record is a 50,000,000 whole-home remodel,
  earned legitimately. Three criteria cannot express *"a small job"*.
- `EF1`'s closure is checkable only by reading table layout, because `not_evaluable` names **both** a
  criterion state and a match class.
- **⚠ A latent `OD-O` trap for V0.3.** Rev 7 **refused** the budget on §14.3.3 row 5
  (`scope_superset`) — and that refusal *was* the `OD-O` guard. Rev 9's `D9-2c` now has `EF3` report
  the same relation as **`satisfied`**. Both are right about different things: a record that did
  **more** than the visitor asked genuinely satisfies the *scope* criterion, and its total genuinely
  covers more than the query, so a *budget* comparison against it is apples-to-oranges. V0.2 has no
  budget comparison, so nothing conflicts today. **The trap is the inference
  `scope satisfied ⇒ budget comparable`, which V0.3 must not make** — restoring §17.1's parked
  text verbatim on top of rev 9's `EF3` would make exactly that inference. `OD-O` has been violated
  in three separate rounds by three different routes; this is the fourth route, found before it
  fired. Recorded in §17.1 as an unresolved contradiction; deliberately **not** written into the
  contract as a rule by hand, and put to round 9 without a proposed answer.
- **§19's worked example is stale against the applied data on 4 assertions** — contract-side fix,
  queued for rev 10, evidence in `28-styles-and-rebaseline.md`:
  1. `bi-01.workScopeIds` — §19 has `[entrance, living_room, kitchen, bedroom, bathroom,
     built_in_furniture]`, data has `[entrance, kitchen, bathroom, flooring, lighting,
     built_in_furniture]`. Four ids differ, and §19's prose justifying `bedroom`/`living_room`
     goes with them. §19 predates the `WS9(c)` pass the data follows.
  2. `bi-04.pricing` — §19 states `total: exact 19,000,000`; the record has **no `pricing` key**,
     so the *"19,000,000 / 32 = 593,750"* bullet has no referent.
  3. `document.workScopes` — consequence of (1).
  4. `bi-01.facets` key order — §19 writes `category, tag, style` for `bi-01` but `category, style`
     for `bi-04`, and the emitter emits `category, style, tag`. **§19 is internally inconsistent
     with itself**; harmless to meaning, fatal to a byte-for-byte golden like `E2b`.

  `bi-01.facets.style` **now reproduces §19 exactly**, so §19's entire facet *content* holds — both
  records' style/tag arrays and all three document vocabularies — and its `ST2` bullet is literally
  true of the live data.
- 9 skipped integration tests remain, several `TODO(v0.2-data)`.

## Not started

L13 BoostChat search adapter · L14 consult state/extraction/cards · L16 publish + V0.2 E2E ·
L17 full regression + fresh final review · L18 exposure re-audit then `PUBLIC_ACTION_TOOLS_ENABLED=true`
(`OD-S`, gated on a passing review — **round 8 did not pass**) · L19 real AI QA · L20 widget browser E2E.
