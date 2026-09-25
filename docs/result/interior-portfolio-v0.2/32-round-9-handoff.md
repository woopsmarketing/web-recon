# 32 — Portfolio V0.2 Design/Validation Checkpoint — **NOT READY** (round-9 handoff)

| | |
|---|---|
| written | 2026-09-25 |
| session status | **FROZEN_NOT_READY** — frozen by owner instruction (`prompt2`), not by a completed round |
| verdict | **NOT READY**, fixed. 4 BLOCKER · 8 MAJOR · 9 MINOR · 6 NOTE |
| authority for the verdict | `31-delta-review-rev9.1.md` (independent, fresh context) + `30-fixture-execution-rev9.1.md` |
| what this document is | a **state** record for the next session. It introduces **no new conclusion**, adds no rule, changes no assertion, and opens no round. |

**Location note.** `prompt2` names `docs/work/interior-portfolio-v0.2/round-9-handoff.md`. That is the
*boost-chat* convention; this repo's `CLAUDE.md` convention is `docs/result/<task-name>/`, and the
whole round-9 record already lives in `docs/result/interior-portfolio-v0.2/`. Filed here as `32-`
to keep the handoff adjacent to the evidence it cites. (boost-chat's own
`docs/work/interior-portfolio-v0.2/` holds that repo's three consumer-side documents; see §7.)

---

## 1. What we tried

One arc, nine review rounds, over roughly eight hours on 2026-09-24.

Build **Integration Contract V0.2** — the three-layer `core` / `portfolio` / `builtSpaceAnnex`
document plus an evaluation function (`VB1`–`VB3`, `EF1`–`EF6`, §14.3.1–§14.3.6, `GR2a`, five
ordering keys) that ranks interior-remodelling portfolio records against a visitor's natural-language
question — and verify it hard enough that a consumer could implement it without guessing.

The supporting work that actually landed: the demo corpus went 8 → 19 records with V0.2 fields
authored; a new template release `interior-01@1.6.0` was cut because `1.5.2`'s frozen strict schema
rejected those fields; three producer invariants (`INV-28`/`29`/`30`) were enforced in both the
authoring schema and the emitted-document validator; and a 5,854-line executable checker was built
because prose review alone had stopped finding the defects.

**What we did not try, deliberately:** the product. L13 (BoostChat interior search adapter),
L14 (consult state / extraction / cards), L16 (publish + E2E), L17 (regression + final review),
L18 (exposure), L19 (real AI QA), L20 (widget E2E) are all unstarted. The single exception is the
`GC1` refactor in boost-chat — see §7 and §8.

---

## 2. What exists now

### 2.1 The contract

`docs/reports/integration/07-integration-contract-v0.2-candidate.md` — **rev 9.1**, 2,971 lines,
276 KB. Untracked in git until this session's checkpoint commit (§9).

Three archived snapshots in `docs/reports/integration/archive/`: `07-rev9-2026-09-24.md` (2,485
lines), `07-rev9-17.1-restored.md` (2,715), `07-rev9.1-corrected.md` (2,971).

### 2.2 The validation machinery — the most reusable thing this session produced

| file | `npm run` | what it does |
|---|---|---|
| `proof/contract-pipeline.mjs` (5,854 lines) | `proof:pipeline` | re-implements `VB3`, `EF2`–`EF4`, §14.3.3, `EF6`, `GR2a` and the five keys **from the contract's prose** and runs them over the live 19 records; checks seven property classes |
| `proof/ef6-totality.mjs` | `proof:ef6` | `EF6` totality, single-valuedness, class reachability |
| `proof/ws6-monotonicity.mjs` | `proof:ws6-mono` | antitonicity of §14.3.3 in `Q` |
| `proof/pb4-metamorphic.mjs` | `proof:pb4` | the `PB4` metamorphic families |
| `proof/pb4-direction.mjs` | `proof:pb4-direction` | class-level direction check |

All five are wired into `package.json`. The checker also contains a **witness/counterexample
generator** — it synthesises records (`zz-hole`, `zz-witness`, `zz-silent`) rather than relying on
the corpus, which is how `D9-7` was killed after measuring 0 violations on all 19 real records while
broken.

Latest full run (`20-pipeline-checker.md`, report rev 7): property 1 GAPS **0** · property 2 FAIL
**2** · property 3 PASS **0** · property 4 FAIL **44** (form 4a) · property 5 FAIL **2** ·
property 6 FAIL **4** · property 7 FAIL **1**. Drift 70/0.

The checker has itself been **independently audited** (`21-pipeline-audit.md`) and rated *partial
trust*: the conclusions of properties 1/3/4 are usable, **no published count is**. That rating is
still in force and the next session must not quote the checker's numbers without it.

### 2.3 The producer

Enforced in **both** `platform/content/schema.ts` (authoring) and `platform/integration/validate.ts`
(emitted document), covered by `A10` and `V14` in `platform/test/integration.test.ts`:

- `INV-28`, `INV-29`, `INV-30` (the last: a `partial_remodel` must name at least one **space** scope;
  a trades-only job is breadth-absent, never a partial).

`I2b` was converted from an unconditional `skip()` to a **live gate**: it re-collects all 65 release
sources, re-hashes and compares against `interior-01@1.6.0`. Any edit to a release source now fails
it until a new release is cut and re-pinned. That is designed behaviour, and the in-flight
widget-seam work will trigger it.

### 2.4 The data

`data/sites/boost-interior-demo/content/projects.json` — **19** records (was 8). 19/19 parse
`ProjectSchema`; `projectType` 7 full / 7 partial / 5 absent; all 19 carry `workScopeIds`; 18 carry
`styles`; emit + validate is 0 errors / 0 warnings.

---

## 3. What is actually proven

Only these. Each is backed by an executed check or by an independent reviewer who could not reopen it.

| claim | evidence |
|---|---|
| `EF6` is **total and single-valued**, and all ten `GR2a` classes are reachable on the corpus alone | `proof:ef6`; re-derived row by row and executed by the round-9 reviewer over 11 utterances |
| **No in-force rule cites a parked rule as live** (`Q-23`'s mechanical half) | round-9 reviewer enumerated every citation of a parked rule inside the in-force region; `N9-1` |
| `WS6`'s dead tie-break discriminator is gone, and its replacement `D9-5a`/`D9-7a` is total and single-valued | `B8-1` closed; `N9-2` calls the closure argument the best-argued passage in the document |
| The two-ordering-device collision is gone — one device was **deleted**, not patched | `B8-2` closed |
| `VB3` is a function (first-match rule added) | `B8-4` closed |
| §17.1 went from a false claim to a **sourced** recovery of seven verbatim passages | `27-rev7-text-recovery.md`; `M8-1` closed |
| 19/19 records parse; emit+validate 0/0; all 13 stored releases verify; `1.5.2` byte-identical | `26-demo-data-applied.md`, `23-release-1.6.0-cut.md`, `25-release-rebaseline.md` |
| `DM-1` is load-bearing: **5 of 13** rev-9 decisions were killed by their own checks before reaching the contract (`D9-2`, `D9-3`, `D9-5`, `D9-5a`, `D9-7`) | `22-rev9-design.md` §5c |

---

## 4. What was incorrectly claimed

This section exists because the session's worst defect was a **reporting** defect, not a design one.

### 4.1 The headline error — `PB4` "0 of 798"

Stated repeatedly in the contract (`07:1229-1232`, `07:1335`, `07:1049`, `07:2746`), in the decision
ledger, in the status document, and to the owner at least six times:

> *"The strict metamorphic form — delete a stated criterion's input, re-rank, the record must not
> move **down** — … the strict form holds at **0 of 798**."*

The clause before the dash is property **4a**. The number after it is property **4b**'s. They are
different propositions. 4a **FAILS**. Full separation in §5.

**Mechanism:** the checker labelled 4b `STRICT`. That word matched a conclusion already reached, so
the label was never checked against the thing it labelled.

### 4.2 The same failure mode, three earlier instances the same day

| | what happened |
|---|---|
| `D9-5` | a plausible antitonicity claim, written before it was executed. `ws6-monotonicity.mjs` then found **5,952** counterexamples |
| `D9-2c` "direction is sound" | measured at **class** level only. 299 of 302 violations came from `GR3a`'s rung ladder — the model was faithful, its *boundary* excluded the dominant cause |
| the `bi-13` "phantom residual" | an argument built on a **harness artefact** (mutant twins not held equal in `\|R_s\|`). Retracted; all figures corrected 546/893 → 484/798 and 299/247 → 262/222 |

Every one was caught by something **outside** the reasoning that produced it. None by that reasoning
being more careful.

### 4.3 Other claims corrected in place this session

- `16b`'s `M7-4` row — false; **withdrawn** rather than rewritten.
- `16b`'s `B7-2` "removed by construction" — false; recurred as `B8-2`/`X8-20`.
- `AU-1` — claimed round-8 reviewers credited `EF1` closure "on the strength of this PASS"; the dates
  disprove it.
- `D9-7` and `D9-5a` — my own designs reproduced the defect class they were written to close.
- `Q-29` candidate 3 (mine) — **intransitive**: 72 cycles on the real corpus.
- "Q-29 doesn't block rev 9" — true of the metrics, false of the contract: 4 of 9 rows unorderable.

### 4.4 Still uncorrected in the files (contract-side, deliberately not fixed under the freeze)

- `07:1229-1232` and its three repeats still state 4b's figure under 4a's words.
- `20:1102` says 4a's failure is *"which the contract acknowledges"* — the contract acknowledges no
  deletion-form failure anywhere (`m9-7`).
- §19's worked example is stale against the applied data on **4 assertions** (`28-styles-and-rebaseline.md`).
- `04-demo-data-spec.md` §4.1 is knowingly wrong in **4 of 9 rows** (`M9-7`), and still carries a
  rev-8 header.
- `D9-10` is named in the revision header and occurs nowhere else (`m9-5`, `07:7`).

---

## 5. Open blockers — 4

### `B9-1` · `PB4` / `CINV-5`

**The two properties must never again be conflated. They are stated separately here on purpose.**

#### 5.1 Property **4a** — what `CINV-5` actually requires

**Contract text**, `07:1535` (`CINV-5`, `C: MUST`), with `PB4` at `07:1218-1222`:

> A criterion in state `not_evaluable` contributes **nothing** to the record's score and to **no**
> tie-break key. … delete a stated criterion's input, re-rank, and the record must not move **down**.

**In plain words:** *take a record. Remove one piece of information the visitor asked about — its
floor area, its price, its project type. Re-run the ranking. The record is now known to be a
**worse** match than before? No: it is known to be **less**. Missing information must not be
punished. So the record must not appear further down the list than it did when it had that
information.* `PB4`'s own gloss says why it matters: *"Missing must not silently become
never-shown — with a result limit of 3 over 19 records, fourth place is invisible."*

Rev 9 **widened** `CINV-5` to all three criteria (*"Rev 9 states this over all three criteria"*,
`07:1535`).

| measurement | result |
|---|---|
| checker property 4a (`20:331-343`, `20:1102`) — mutates **only** `area`, `pricing.total`, `pricing.perArea`; never `projectType`, never a `workScopeId` | **FAIL — 44 findings of 1,053** |
| round-9 reviewer's independent run of `CINV-5` exactly as written, 11 utterances | **109 violations of 218 mutant pairs** |

**Concrete witness — the one the owner asked for:**

- Utterance: **"예산 3천으로 전체 가능해요?"** (`VB3` row 2 ⇒ breadth `whole`; `Q = ∅`; no area stated)
- Record: **`bi-09`**
- Rank **before** deletion: **3** — class `exact`
- Delete `projectType` (the input the breadth criterion reads) → breadth becomes `not_evaluable`,
  `EF6` row 4 gives `unknown_type_fallback`
- Rank **after** deletion: **11**
- **Third to eleventh. All seven `full_remodel` records do this on this one utterance.**

And in the opposite direction, on **"34평 전체 5천이면 되나요"**: `bi-12` — a genuine whole-home
remodel — is `area_fallback` at **16**; delete its `projectType` and it is `unknown_type_fallback`
at **6**. A ten-place **promotion** for removing a true, matching input.

**The two arms `CINV-5` was widened to — breadth and scope — are measured by nothing. The breadth
arm is where the violations are worst.**

#### 5.2 Property **4b** — a different proposition

**What it measures** (`20:345-350`), verbatim:

> two mutants of the same record, one driving criterion `c` to `not_evaluable` and one to
> `unsatisfied`, ranks compared.

**In plain words:** *make two altered copies of one record — in one, a criterion is unknowable; in
the other, it is known and fails. Compare where those two copies land relative to each other.* It
compares **two mutants to each other**. It never compares a record to **itself before deletion**.

**"0 of 798" is the number for that proposition and for no other.** It is not evidence for 4a, it
does not bear on `CINV-5`, and it must not be cited alongside 4a's words.

4b is also **`D9-3`'s restatement**, which §20.7.3 records as **withdrawn** — *"It is the same
unsatisfiable property… and it is a change to an assertion in the direction of making it pass, which
this project forbids"* (`07:2816`). `22` §2 is struck in full: *"The test was right; the rules are
wrong."*

#### 5.3 Blocker record

| | |
|---|---|
| **CONTRACT_REQUIREMENT** | `PB4` + `CINV-5`: a `not_evaluable` criterion contributes to no score and no tie-break key; deleting a stated criterion's input must not move the record down. |
| **ACTUAL_BEHAVIOR** | Ordering key (1) is `GR2a`'s class order (`07:1398`), and `EF6` rows 4 and 6 (`07:1265`, `07:1267`) make the class a **function of** the `not_evaluable` state. Key (1) therefore reads the state **necessarily**. No permutation of `GR2a` changes that — it only chooses the **direction**. Rev 8 chose punitive, rev 9 chose rewarding; both violate `PB4` as written. Round 8's `B8-3` is **not closed**. |
| **COUNTEREXAMPLE** | `bi-09`, *"예산 3천으로 전체 가능해요?"*, `projectType` deleted: rank **3 → 11**. Mirror: `bi-12`, *"34평 전체 5천이면 되나요"*, same deletion: rank **16 → 6**. |
| **DEFECT_CLASS** | **mixed** — contract (the rules genuinely conflict) **+** checker (4a's mutation set is too narrow to reach the worst arm) **+** reporting (4b's number published under 4a's words). |
| **MINIMUM_DECISION_NEEDED** | Decide, in one sentence, **which property `PB4` is**, then measure that one. If the deletion form: `EF6` rows 4/6 must stop feeding key (1) — a `not_evaluable` criterion cannot both choose the class and contribute nothing to the class key. If the twin form: say so in `PB4` and `CINV-5`, and record it as the relaxation `D9-3` was killed for. Either is defensible. Quoting one while stating the other is not. |

---

### `B9-2` · The ordering keys determine no order

| | |
|---|---|
| **CONTRACT_REQUIREMENT** | `CINV-21` (`07:1551`, `C: MUST`): *"two runs of one query over one snapshot produce the same order."* §14.3.6: *"Steps 4–5 are the deterministic floor… what makes 'two consumers cannot disagree on one document' true rather than aspirational"* (`07:1403-1405`). |
| **ACTUAL_BEHAVIOR** | Key (2), in force at `07:1398-1401`, says a record the key cannot order *"keeps **the position** the previous key gave it."* The previous key is `GR2a`, which produces a **block of ties**, not a position — the referent does not exist. §18's `Q-29` (`07:2214-2233`) enumerates three readings and kills all three (count-0 contradicts `PB4` by name; keep-position is not stable under partitioning; skip-to-next-key is **intransitive**), names a fourth shape, and explicitly does not adopt it. **Separately**, key (3) counts the visitor's stated ids a record carries and states **no skip**, although `PB4` requires one — §18 concedes the skip moves **10 of 27** branches. |
| **COUNTEREXAMPLE** | Intransitivity, reproduced independently on *"34평 전체 5천이면 되나요"* where `bi-04`, `bi-15`, `bi-17` share one `breadth_fallback` block: `bi-17 < bi-04` by key (2); `bi-04 < bi-15` by key (4); `bi-15 < bi-17` by key (4). **A cycle.** Positions 9–15 of that row are an artefact of the sort algorithm. Key (3): on row I, `bi-18` is **9th** as key (3) is written and **13th** with the `PB4` skip applied — two `C: MUST`s, no tie-breaker, different results. Rows **A, F and G** of `04` §4.1 have **no defined order**. |
| **DEFECT_CLASS** | **contract.** |
| **MINIMUM_DECISION_NEEDED** | Rev 9.1 cannot freeze as implementable while key (2)'s sentence is in force naming a reading §18 has killed. Minimum: **delete the carve-out sentence and state what happens instead.** The fourth shape §18 names — applicability decided **once per class block** — is the only candidate transitive and partition-stable by construction, and needs its own round. |

---

### `B9-3` · `D9-9` sentence 4 assigns a criterion state; `EF1` forbids it

| | |
|---|---|
| **CONTRACT_REQUIREMENT** | `EF1`, `07:949`, `C: MUST`: *"Nothing outside `EF2`–`EF4` assigns a criterion state."* `CINV-14` (`07:1544`) tests exactly this. |
| **ACTUAL_BEHAVIOR** | `07:1123-1128`, **inside §14.3.3**, the fourth normative sentence of `D9-9`, also `C: MUST`: *"**If the intersection is empty and any reading's set is not**, the criterion is **`not_evaluable`** and the **ambiguity is disclosed** — the ambiguity clause's rule 1 applied at the disclosure level, **where that rule cannot see**."* The final clause is the contract conceding that `EF3` does not and cannot make this assignment. Every comparable rule is correctly worded as supplying a *reason*, not a state — `WS8` (`07:429-434`), §14.3.3's closure paragraph (`07:1155`: *"`EF3` assigns the state, this rule supplies the reason (`EF1`)"*). This one is not, and `CINV-17` (`07:1547`) **repeats** the assignment. |
| **COUNTEREXAMPLE** | Not latent — the contract constructs the firing input itself at `07:1130-1137`: a term reading as `kitchen` **or** as `bathroom` against a `partial_remodel [living_room]`. Sentence 4 re-assigns the criterion **after** `EF3` assigned it and **after** `EF6` classed the record by row 1 on the relation passed through. Nothing states whether `EF6` runs before or after. Two `C: MUST`s contradict; `CINV-14` cannot pass while sentence 4 is in force. |
| **DEFECT_CLASS** | **contract.** |
| **MINIMUM_DECISION_NEEDED** | **One clause.** Move sentence 4's condition into `EF3`'s ambiguity clause as a third rule, or reword it the way `WS8` is worded (supplying a reason, not assigning a state). |

---

### `B9-4` · `OD-P`'s fallback ladder is inverted, and fallbacks are labelled `exact`

| | |
|---|---|
| **CONTRACT_REQUIREMENT** | `OD-P` (`01:25`): *"The AI must never hide that a fallback case is not an exact match."* §14.3.6 (`07:1385-1387`) asserts *"`GR2`'s per-class labels preserve it in full."* |
| **ACTUAL_BEHAVIOR** | For **every breadth-absent space query**, the ladder runs backwards and the fallbacks are labelled **`exact`** — i.e. presented as *direct answers*. Mechanism, all three steps in force: rev 9's own **`D9-4`** (`07:904-908`) sends 만-on-a-quantity to `VB3` row 6 ⇒ breadth **absent**; `EF3`'s `full_remodel` spaces half (`07:965-968`, via `PT4`(b)) is then **`satisfied` for any `Q_s`** — for *any* set of spaces the visitor names; `Q_t = ∅` makes the trades half satisfied too; `EF6` row 8 ⇒ **`exact`**. `GR2a` then puts all six whole-home remodels first. |
| **COUNTEREXAMPLE** | `04` §4.1 **row D**, utterance **"욕실 하나만"** (*just the one bathroom*). Returned as **direct answers**, in order: `bi-01` (no total), `bi-09` 50,000,000, `bi-10` **85,000,000**, `bi-11`, `bi-12`, `bi-13` **125–140,000,000** — **six whole-home remodels, all `exact`**. `bi-15` — one bathroom, **7,000,000**, `scope_exact`, and `04:696`'s own expected answer — is **seventh**. Spread **×17.9** on a one-bathroom question. Same shape on row G (*"32평인데 도배랑 바닥만"*: the only `exact` is a 50,000,000 whole-home remodel) and row I (*"현관 수납"*: `bi-18`, 6,200,000, the expected answer, is **ninth**). |
| **DEFECT_CLASS** | **contract** — and beneath it a **product/design** question, which is why the minimum decision is the owner's. |
| **MINIMUM_DECISION_NEEDED** | **Owner decision.** Put executed row D in front of the owner as it actually ranks and ask whether an 85,000,000 whole-home remodel is an acceptable direct answer to *"욕실 하나만"*. Note for that decision: `Q-33` and `Q-34` — the contract's two open questions here — **both name the wrong rule** (`M9-8`). The binding constraint is **not** "three criteria cannot express 'a small job'" and **not** `WS7b`; it is `EF3`'s `full_remodel` spaces half being `satisfied` for any `Q_s`, combined with `VB3` routing most natural utterances to breadth-absent. |

**Cross-cutting note.** One rule — `EF3`'s `full_remodel` branch at `07:965-971` — is responsible for
rows **D, G and I** simultaneously. Property 7 quantifies it threshold-free: **314 of 486 adjacent
pairs (65%)** are decided by ordering keys (4)/(5) rather than by the match; longest unseparated run
**10 records**; widest spread within one `exact` block **×17.9**. On the reviewer's area-C question
— *is a visitor well served?* — the answer is **no in four of nine rows** (B, D, G, I), **yes in
three** (C, F-on-the-record, H), **undetermined in two** (A's order, E entirely).

---

## 6. Closed findings

Verified closed by the round-9 reviewer, who could not reopen them. **Nothing is added to this list.**

| id | what closed |
|---|---|
| `B8-1` | `WS6`'s tie-break discriminated nothing; replacement `D9-5a`/`D9-7a` is total and single-valued. `N9-2`: the best-argued passage in the document |
| `B8-2` | the two-ordering-device collision — one device **deleted**, not patched |
| `B8-4` | `VB3` has a first-match rule and is a function |
| `M8-2` | closed |
| `M8-5` | closed |
| `M8-6` | closed |
| `EF6` | total, single-valued, all ten `GR2a` classes reachable on the corpus alone |
| `Q-23` mechanical half | no in-force rule cites a parked rule as live (`N9-1`) — **should not be re-opened** |

Explicitly **not** closed: `B8-3` (= `B9-1`). It was reported closed on the wrong number.

---

## 7. Product implementation vs validation machinery

The distinction the next session most needs, because almost none of this is product.

### A · Product implementation — small, and all uncommitted

**web-recon** (`M`, unstaged):
`platform/content/schema.ts` · `platform/integration/validate.ts` · `platform/test/integration.test.ts`
· `data/sites/boost-interior-demo/content/projects.json` · `package.json` — this session.
`platform/site/context.ts` · `platform/site/instance.ts` · `platform/site/load.ts` ·
`platform/build/qa.ts` · `platform/build/site-build.ts` · `platform/integration/{contract,emit,sources}.ts`
· `platform/test/slice1.test.ts` · `data/sites/boost-interior-demo/site.json` ·
`templates/interior-01/v1/{template.ts,app/layout.tsx}` — **mixed / in-flight widget-seam work, not
cleanly attributable to this session.** Untracked: `platform/site/head-scripts.ts`,
`templates/interior-01/v1/app/head-scripts.ts`.

**boost-chat** — one work package, the **`GC1` refactor**
(`docs/work/interior-portfolio-v0.2/05-gc1-refactor.md`, 2026-09-24 17:39): moving interior domain
knowledge **out of** the generic chat core, per `OD-B`. Behaviour-preserving move only — no new
fields, no matcher scoring change, no contract parsing change, **no migration**, no prompt wording
change. 15 files, +2,989/−1,073, **all uncommitted**. Two leaks it found were deliberately
**reported and not moved** (`M1`, `M2`: interior vocabulary in generic prompt/admin copy — changing
them alters a prompt every tenant receives and needs its own eval).

### B · Contract / design

`docs/reports/integration/07-integration-contract-v0.2-candidate.md` + `archive/` (3 snapshots).

### C · Checker / test infrastructure

`docs/result/interior-portfolio-v0.2/proof/` (5 scripts + 2 captured outputs) and the `proof:*`
scripts in `package.json`. Plus `A10`/`V14` coverage and the live `I2b` gate in
`platform/test/integration.test.ts`.

### D · Reports / transcripts

`docs/result/interior-portfolio-v0.2/00-` … `32-` (38 documents) · `docs/status/interior-portfolio-v0.2.md` ·
boost-chat `docs/work/interior-portfolio-v0.2/{03,04,05}`.

### E · Unrelated owner work — **do not touch**

boost-chat: `prompt`, `prompt2`, `test.html`, `data/eval-authority/`, `data/eval-general/`,
`data/eval-holdout/`, `data/eval-holdout-r12/`, `docs/work/v2-release1-1-grounding-authority/holdout-runs/*`,
and the several untracked `docs/result/BOOSTCHAT-*` reports.
web-recon: `docs/result/static-deployment-foundation/widget-seam/` and `proof/live-e2e.json`
(mtime 2026-09-22, predates this session).

### The artifacts worth preserving, with paths

```
docs/reports/integration/07-integration-contract-v0.2-candidate.md    contract rev 9.1
docs/reports/integration/archive/07-rev9-2026-09-24.md                snapshot
docs/reports/integration/archive/07-rev9-17.1-restored.md             snapshot
docs/reports/integration/archive/07-rev9.1-corrected.md               snapshot
docs/result/interior-portfolio-v0.2/proof/contract-pipeline.mjs       the checker (5,854 lines)
docs/result/interior-portfolio-v0.2/proof/contract-pipeline.txt       its captured output
docs/result/interior-portfolio-v0.2/proof/ef6-totality.mjs|.txt       property test
docs/result/interior-portfolio-v0.2/proof/ws6-monotonicity.mjs        property test (killed D9-5)
docs/result/interior-portfolio-v0.2/proof/pb4-metamorphic.mjs         property test (killed D9-2/D9-3)
docs/result/interior-portfolio-v0.2/proof/pb4-direction.mjs           property test
docs/result/interior-portfolio-v0.2/22-rev9-design.md                 decision ledger (13 decisions, §5b-bis, §5c, §5d)
docs/result/interior-portfolio-v0.2/20-pipeline-checker.md            checker report rev 7
docs/result/interior-portfolio-v0.2/21-pipeline-audit.md              independent audit of the checker
docs/result/interior-portfolio-v0.2/31-delta-review-rev9.1.md         round-9 independent review
docs/result/interior-portfolio-v0.2/30-fixture-execution-rev9.1.md    round-9 hand execution
docs/result/interior-portfolio-v0.2/19-round8-disposition-and-method-change.md   DM-1
docs/result/interior-portfolio-v0.2/04-demo-data-spec.md              V0.2 data-model notes + §4.1 acceptance rows
docs/result/interior-portfolio-v0.2/01-owner-decisions.md             OWNER DECISIONS A–S
docs/result/interior-portfolio-v0.2/00-work-plan.md                   L1–L20 work plan
docs/status/interior-portfolio-v0.2.md                                milestone status
~/projects/boost-chat/docs/work/interior-portfolio-v0.2/03-consumer-parser.md
~/projects/boost-chat/docs/work/interior-portfolio-v0.2/04-adapter-recon.md
~/projects/boost-chat/docs/work/interior-portfolio-v0.2/05-gc1-refactor.md
```

Plus the full session transcript:
`~/.claude/projects/-Users-woops-projects-web-recon-track-b/0b11d7b9-33b5-4113-a2c3-947908bc754f.jsonl`

---

## 8. Production state

**No production change was made in this session.** Evidence, item by item — and the one item that is
*inference from absence* is labelled as such.

| question | finding | evidence |
|---|---|---|
| Railway deploy | **No.** No deploy command was run. boost-chat's newest commit is `319774c` (2026-09-23), before this session. Files touched on 2026-09-24 outside `src`/`scripts`/`docs` are **local only**: `.next/*`, `tsconfig.tsbuildinfo`, `.chat-runtime-foundation-server.log`, `.answer-cache-server.log` | `git log`, `find -newermt` |
| production migration | **No.** No migration file created or modified; the `GC1` refactor brief states *"no migration"* and the diff adds no schema change | `05-gc1-refactor.md`; boost-chat diffstat |
| web-recon production publish | **No.** `site:publish` was not run. The live package `18c0a5eff5ab…` is untouched and `G4` (live package intact + `previous.json` rollback pointer) still asserts against it. `docs/result/static-deployment-foundation/proof/live-e2e.json` mtime is **2026-09-22 15:48**, predating the session | `integration.test.ts:81,1246`; `stat` |
| live `schemaVersion` | **Unchanged.** Emitted-document `schemaVersion` stays `"1.0"`; V0.2 is contract version **2** and is a *candidate*, unpublished | `platform/integration/contract.ts:42` |
| live `resourceVersion` | **Unchanged.** No resource was emitted to production | same |
| BoostChat snapshot refresh | **No.** No refresh was invoked; no snapshot artifact modified on 2026-09-24 | `find -name '*snapshot*' -newermt` → empty |
| `PUBLIC_ACTION_TOOLS_ENABLED` | **OFF, unchanged by this session.** L18 is unstarted; `OD-S` records production as having the fuse OFF and gates turning it on behind a passing review — **round 9 did not pass**. ⚠ *This is not a live read.* Production env was not queried in this session; the statement is "unchanged", not "verified OFF at the source" | `01-owner-decisions.md:28`; `00-work-plan.md:60` |

Two things did change locally and are worth naming so they are not mistaken for production:
`interior-01@1.6.0` was cut into `data/template-releases/` (a repo artifact, never published), and
boost-chat ran local Next builds and dev servers.

**Nothing was rolled back, and nothing should be.**

---

## 9. Git state

**web-recon** `/Users/woops/projects/web-recon-track-b`, single worktree, no other checkout.

- branch **`track-b/static-deployment-foundation`**
- HEAD at session start and before the checkpoint: **`0576c1f`** *"docs(contract): record consumer VO6
  declaration change"*, dated **2026-09-23**
- **commits created by this session before the checkpoint: none.** The entire eight hours was
  uncommitted working-tree state.
- staged: none

**boost-chat** `/Users/woops/projects/boost-chat` — newest commit `319774c` (2026-09-23). 15 modified
tracked files and 12 untracked paths, **all left uncommitted**, deliberately: this session did not
author `prompt`, `test.html` or `data/eval-*`, and the `GC1` refactor is entangled with in-flight
owner work there. **No commit was made in boost-chat.**

### Checkpoint commit

The commit titled *"chore: checkpoint portfolio v0.2 validation round 9 (NOT READY)"*, the single
commit on top of `0576c1f`: **117 files, +46,749 / −0** — every path an addition. (Hash deliberately
not written here; it is `git log -1` on this branch.)

Made in web-recon only, with **explicitly named paths** (`git add .` was not used), covering only
files whose authorship by this session is certain and which are **additions** — no entanglement with
the in-flight widget-seam edits, which were left untouched in the working tree:

```
docs/reports/integration/07-integration-contract-v0.2-candidate.md
docs/reports/integration/archive/
docs/result/interior-portfolio-v0.2/
docs/status/interior-portfolio-v0.2.md
data/template-releases/interior-01/interior-01-1.6.0-e65795202191/
package.json          (proof:* scripts only — the diff is five added lines, nothing else)
```

Everything else — all 16 other modified product files and the two untracked `head-scripts.ts` —
stays uncommitted and unmodified.

---

## 10. The lesson to carry — `DM-1`, third clause

The standing method rule from round 8:

> **No rule in §14.3 or §15 is fixed by hand until the check that would have caught it exists.**
> A design decision whose justification is a claim about the rules is not written into the contract
> until that claim is executed. If the claim fails, the decision is withdrawn, not argued.

Amended twice earlier (hand execution is required every round and is never replaced by the checker),
and now a third time, by `B9-1`:

> **A number is evidence only for the proposition it actually measures.**
>
> Before quoting a figure:
> 1. restate what the **contract** requires, in plain language;
> 2. restate what the **checker assertion** measures, in plain language;
> 3. confirm they are the **same proposition**;
> 4. only then quote the number.
>
> **Suspect first the label that agrees with your conclusion.** A check whose name matches what you
> already believe is the one to verify first, not last.

---

## 11. Exact next recommended starting point

**The next session does not start at Round 10.** It starts at:

> ### Portfolio V0.2 — product-level invariant simplification and blocker resolution

Round 10 is forbidden until the blockers have an *answer* to review. Nine rounds have produced the
BLOCKER series **4, 2, 4, 1, 3, 4, 4** with no trend; another review round would produce a tenth
verdict, not a decision.

The work, in order, and why this order:

1. **`B9-4` first — it is the owner's, and it is the product question.** One rule (`EF3`'s
   `full_remodel` spaces half being `satisfied` for any `Q_s`) causes rows D, G and I and 65% of all
   adjacent-pair orderings. Put executed row D in front of the owner verbatim. Everything downstream
   is cheaper once this is answered, and no amount of rule-level work fixes it.
2. **`B9-1` — one sentence: which property is `PB4`?** Then measure that one, and widen the checker's
   4a mutation set to `projectType` and `workScopeIds`, which is where the violations actually are.
3. **`B9-3` — one clause.** The cheapest of the four.
4. **`B9-2` — needs its own round of design**, but must not be left in force as written; at minimum
   delete key (2)'s carve-out sentence.
5. Only then the stale-text debts (§4.4) and `04` §4.1's four wrong rows.

**Simplification is the frame, not "more rules."** The evidence for that framing: rev 9's three
genuine closures were all achieved by **deleting** a device rather than patching it (`B8-2` most
clearly), and five of thirteen rev-9 additions died under their own checks. The contract is
2,971 lines and ~70 rule ids for an evaluation function that answers nine questions and gets four of
them wrong. The master task said **과도한 infrastructure 금지**.

**Do not start Jev implementation.** A read-only Jev RFC is safe; implementation is not, because it
would build on an evaluation function with four open blockers.

**Do not implement a consumer from the current contract.** `B9-2` alone makes two conforming
consumers produce different orders on rows A, F and G, and `M9-2` makes them produce opposite
answers on row I.
