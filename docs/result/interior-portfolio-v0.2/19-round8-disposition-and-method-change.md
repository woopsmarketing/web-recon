# 19 — Round 8 disposition, and a change of method

| | |
|---|---|
| date | 2026-09-24 |
| author | orchestrator (implementer of rev 8 — **not** an independent review) |
| inputs | `17-delta-review-rev8.md` (4 BLOCKER · 8 MAJOR · 16 MINOR · 6 NOTE), `17b-fixture-execution-rev8.md` (0 of 9 utterances executable without a guess; 24 findings), `16-narrowing-decision.md`, `16b-rev8-disposition.md`, `00-work-plan.md` §2.4 |
| status | rev 8 is **NOT READY**. No contract change is made by this document. It decides *how* rev 9 is produced, not what it says. |
| decision | **DM-1** (method), **DM-2** (the narrowing stands), **DM-3** (two corrections to my own documents), below |

---

## 1. Two independent readings, and they agree

Round 8 ran two fresh-context workers who were told nothing about the wanted conclusion: a delta
reviewer and a hand-executor who followed the prose on paper over the 19-record corpus. Neither saw
the other's output. They converged on the same defects:

| delta review | hand execution | the defect |
|---|---|---|
| `B8-1` | `X8-23` | `WS6`'s `C: MUST` tie-break keys on *"the reading that does not permit a price comparison"* — a predicate V0.2 no longer has on **either** branch. The rule decides nothing. |
| `B8-2` | `X8-20` | `GR3`'s *"direct answers are offered first"* collides with `GR3a`'s rungs, which are declared total over the result. |
| `B8-4` | `X8-3`, `X8-22` | `VB3`'s "closed list" has row pairs that both match one utterance, with opposite values and **no first-match rule**. |
| `M8-8` | `X8-21`, `X8-24` | `04` §4.1 row G is unreachable as written; row I misclassifies `storage` as a trade. |

Independent convergence is the strongest signal this process produces. I am treating all four as
established and am not re-litigating any of them.

`B8-3` was found only by the delta reviewer: **`GR2a` — new in rev 8 — sorts class `not_evaluable`
last**, which `PB4` forbids in those words (`07:1017`: *"not a penalty, not a small penalty, **not a
null that sorts last**"*) and which `CINV-5` exists to catch. I verified both lines. It is a rev-8
regression, introduced by me, in the rule I added to fix rev 7's ordering BLOCKER.

---

## 2. The narrowing was a hypothesis, it was tested, and it failed

`16-narrowing-decision.md` traded away a **stated owner goal** — master goal 5 (price search), and
the price half of `OD-E`'s ranking core — on an explicit theory: that the recurring BLOCKERs were
all *pairs of rules that had to agree*, that every such pair existed **because of** budget
comparison, and that removing one side of each pair would close them as a set instead of one at a
time.

The result:

| round | rev | BLOCKER | MAJOR | MINOR | NOTE |
|---|---|---|---|---|---|
| 3 | rev 3 | 4 | 7 | 12 (incl. NOTE) | — |
| 4 | rev 4 | 2 | 4 | 8 | 4 |
| 5 | rev 5 | 4 | 8 | 10 | 6 |
| 6 | rev 6 | 1 | 8 | 9 | 6 |
| 7 | rev 7 | 3 | 4 | 9 | 5 |
| **8** | **rev 8 (the narrowing)** | **4** | **8** | **16** | **6** |

Six rounds: 4, 2, 4, 1, 3, 4. **No trend.** The narrowing produced the joint-worst BLOCKER count and
the worst MINOR count of the series, and the hand-executor could not execute **a single one** of the
nine fixture utterances end to end without guessing.

The theory was half right and that is why it failed. The pairs *were* the defect class. But they
were not pairs because of budget — budget was one **instance**. Rev 8 removed the budget instances
(`B7-1`, `B7-2`, `B7-3`, `M7-1`) and grew three fresh ones in the same shape within a single
revision:

- `GR3` preamble vs `GR3a` rungs (`B8-2`) — a pair created **inside one rule** by my own fix for
  `M7-2`, which rewrote the rungs into record predicates and left the preamble speaking in classes.
- `GR2a` vs `PB4` (`B8-3`) — a pair created by the rule I added to *remove* a pair.
- `VB3` rows 1/2 and 4/5 (`B8-4`) — a pair that was always there and that the narrowing did not
  touch, because it has nothing to do with price.

**`B7-2` was therefore not "removed by construction".** It was relocated from *between two rules* to
*inside one rule*, by the revision whose whole purpose was to stop that happening. My claim to the
contrary in `16b` §2.1 is withdrawn (see `DM-3`).

---

## 3. What the evidence actually points at

Partition rev 8's rules by whether anything **mechanically checks** them:

| | rules | round-8 verdict |
|---|---|---|
| **has a derivation-based executable check** (`proof/ef6-totality.mjs`) | `EF1`–`EF6`, `GR2a`'s permutation property, `GR3a`'s partition | **clean.** Both reviewers, independently: `EF6` total and single-valued, all 10 classes reachable, `EF1`'s closure holds, `EF2`–`EF4` faithful to their prose, `GR3a` and its rung sets partition and are total. |
| **prose only** | `WS6`, `GR3`'s preamble, `GR2a`'s *ordering* semantics, `VB3`, the §20 change logs | **all four BLOCKERs, and seven consecutive false change-log summaries.** |

Every BLOCKER in round 8 is in the prose-only half. The one area with a machine check is the one
both reviewers declared clean — and it is the area that carried a BLOCKER in each of rounds 5, 6 and
7, when its proof still *asserted* reachability by hand instead of *deriving* it. Rebuilding that
proof to derive is the one change in eight rounds that made a defect class stop recurring.

That is one data point, not a law. But it is the only thing in this project's history that has
worked, and it explains the otherwise puzzling flatness of the BLOCKER series: **I have been
patching prose, and prose has no mechanism that forces two statements to agree.** Every round, a
reviewer hand-simulates the rules, finds a pair that disagrees, I fix that pair by hand, and the fix
writes new prose that nothing checks either. Eight rounds is enough evidence that hand-fixing does
not converge.

### 3.1 Each round-8 BLOCKER is mechanically detectable

This is the load-bearing claim, so it is stated per finding rather than in general:

| finding | the machine check that catches it |
|---|---|
| `B8-1` — `WS6`'s tie-break decides nothing | **dead-branch detection.** Evaluate the discriminator over the corpus × the utterance set; a `C: MUST` whose predicate is never true on either branch for any input is reported. |
| `B8-2` — two orderings over one result | **differential ordering.** Compute the result order by `GR3`'s preamble and by `GR3a`'s rungs; assert they are equal for every utterance. They differ on *"주방이랑 욕실 사례"*. |
| `B8-3` — `GR2a` vs `PB4`'s strong form | **metamorphic property.** For each record, delete one price or area field and re-rank; `PB4` says the record must not move **down**. bi-09 currently moves from first to behind bi-12. |
| `B8-4` — `VB3` rows both match | **totality and single-valuedness**, the identical check `EF6` already passes. Two rows matching one input is exactly what `CINV-20` caught for `EF6`. |
| `M8-4` — false change-log summary, 7× | **derive the change log.** A relaxation claim is a statement about the rule set before and after; it can be computed by diffing the two rule tables, not written by hand. |
| `M8-8`, `X8-21`, `X8-24` — §4.1 unreachable/wrong rows | **run §4.1.** Each expected answer is an assertion about the pipeline's output on a named utterance; today it is checked only when a human volunteers to do it on paper. |

---

## 4. Decisions

### DM-1 — the contract's decision pipeline becomes executable before rev 9 is written

`proof/ef6-totality.mjs` stops being an `EF6` totality proof and becomes a **reference
implementation of §14.3 + §15 over the 19-record corpus**: extraction (`VB3`, `WS6`) → criterion
states (`EF2`–`EF4`) → class (`EF6`) → order (`GR2a`, `GR3`, `GR3a`) → what may be said (`GR1`,
`GR4`, `GR5`, `GR5a`). It runs the nine §4.1 utterances and asserts the six property classes in
§3.1. **No rule is fixed by hand until the check that would have caught it exists.**

This is a reference implementation for *checking the specification*, not the consumer's
implementation and not a runtime. It reads the existing corpus, adds no dependency, and stays one
script behind `npm run proof:ef6`. The master task's *과도한 infrastructure 금지* is a constraint I
am holding to: the alternative on the table — a rules DSL, a schema for the rule tables, a generated
contract — is rejected as exactly the over-building that constraint forbids.

**Cost, stated honestly:** this is roughly a round's worth of work that produces no new contract
text, and it will find defects in rules that currently look settled, which will make round 9 look
worse before it looks better. I am taking that trade because six rounds of the alternative have
moved the BLOCKER count from 4 to 4.

### DM-2 — the narrowing stands, and its justification does not

`16-narrowing-decision.md`'s *argument* is withdrawn: it predicted the BLOCKERs would collapse, and
they did not. Its *outcome* stays in force for V0.2, on a different and weaker ground — a contract
that makes no price claim cannot make a **wrong** price claim, and `OD-O` was violated in three
consecutive rounds while it did make them.

Re-widening V0.2 back to price comparison now would mean restoring `PB1`/`PB6a`/`EF5` into a rule
set whose prose-only half has a 100 % BLOCKER rate. That is the wrong order. Price returns in V0.3,
against the executable check from `DM-1`, which is also the only thing that would have caught
`B7-1`, `B7-3` and `M7-1` — the three defects now parked verbatim inside §17.1's `PB1` and, per
`M8-2`, parked **with no record that they were ever found**. Fixing that record is part of rev 9.

**This is the decision most likely to be wrong, and it is the owner's to overturn.** It defers a
goal the owner stated (master goal 5) on my judgement about sequencing. It is isolated in this
section and in `16-narrowing-decision.md` §5 so that overturning it is a one-document change. I am
not asking; `OWNER MODE` says proceed on safe non-destructive defaults, and deferring a feature is
the safe direction. It is flagged here because "safe default" should not mean "quietly kept".

### DM-3 — two false claims in my own documents, corrected not reworded

1. **`16b` §2.1, the `B7-2` row** says *"removed by construction"*. It is false: `B8-2`/`X8-20` is
   `B7-2` in a new location. The row is corrected to **NOT CLOSED — recurred as `B8-2`**, with the
   mechanism (my `M7-2` fix rewrote the rungs and left the preamble) named.
2. **`07:1836` still reads *"What rev 7 relaxes: nothing."*** `16b` §2.2 claims `M7-4` was
   "addressed by removing the sentence form that kept being false". I replaced the summary line in
   §20.6, the **new** rev 7 → rev 8 log, and left the false one standing in §20.5. `M8-4` is
   correct, this is the **seventh** consecutive revision carrying a false relaxation summary, and
   the document in which I claimed to have fixed it was written today for the express purpose of
   being checkable. Under `DM-1` this line is not rewritten by hand — it is derived, or it is
   deleted and the claim is not made.

---

## 5. Carried into round 9, explicitly not closed

- All four BLOCKERs; all eight MAJORs; `M8-1`'s §17.1 parking gaps and `M8-2`'s unrecorded parked
  defects.
- 7 of 9 rev-7 MINORs, plus round 8's 16 MINORs and 6 NOTEs.
- `m7-9` — stale *"contract rev 4 / rev 6"* citations in `04`.
- `X8-1` — `bi-01` … `bi-08` have no `workScopeIds`; the hand-executor names this the single worst
  obstacle (4 of 8 records unevaluable on 6 of the 9 utterances, and `WS7c` makes the gap circular).
  The authoring pass is in flight as `18-existing-eight-workscopes.md`.
- `INV-30` (`partial_remodel` ⇒ ≥ 1 Spaces id) is still unimplemented in `platform/content/schema.ts`
  and `platform/integration/validate.ts`. `INV-28` and `INV-29` are implemented in both.

## 6. What is not affected

L11 (Template Release 1.6.0) through L20 (widget E2E) are untouched by this and remain queued. The
producer side is not blocked on the contract's ordering prose: it emits fields, it does not rank.
`OD-S`'s production exposure switch stays **off** and is not reconsidered here — it is gated on a
passing review, and round 8 did not pass.
