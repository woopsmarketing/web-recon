# 14 — Disposition of `13-delta-review-rev6.md`, and contract rev 7

| | |
|---|---|
| date | 2026-09-24 |
| input | `13-delta-review-rev6.md` — **NOT READY**, 1 BLOCKER · 8 MAJOR · 9 MINOR · 6 NOTE |
| output | `07-integration-contract-v0.2-candidate.md` **rev 7**; `proof/ef6-totality.mjs` rewritten; `package.json` gains `proof:ef6`; `04-demo-data-spec.md` **rev 6** (four records re-authored on `13c`'s audit); `05` producer list corrected |
| verdict | every finding accepted. None rejected. |

---

## 1. The narrowing clause, again — and a tightening of it

`00-work-plan.md` §2.4 pre-committed: if a round returns BLOCKERs that are *again* structural —
rules that cannot be satisfied, or that disagree with one another, inside §14.3 — narrow V0.2's
scope rather than patch again. `12` §1 recorded why the clause was not invoked after round 5, and
set a narrower test for round 6: *"If round 6 finds another hole in `EF6`, that is a fact about this
proof, not another argument, and the clause fires for real."*

**Both tests have to be stated honestly, because they give different answers.**

- **§2.4's literal trigger: FIRED.** `B-1` is a BLOCKER, it is inside §14.3, and it is precisely
  *two rules that disagree with one another* — `EF1`'s closure sentence versus the `WS8` clause rev 6
  added to §14.3.3. That is the trigger's own wording.
- **`12` §1's narrower test: did NOT fire.** Round 6 did not find a hole in `EF6`. It says so
  directly: *"`EF6` is total and single-valued, and I could not break it … `CINV-20`'s primary claim
  holds."* The defect was in a rule rev 6 added **outside** `EF6`, and in the proof's secondary
  reachability predicate.

**Decision: proceed to rev 7, and tighten the clause rather than restate it.** The reasoning:

1. `B-1` is a one-sentence placement error — a rule written in the wrong section — not a
   structural contradiction. The fix moves one clause into `EF3` and changes no outcome that rev 6
   intended. The reviewer, told nothing about any of this, reached the same conclusion
   independently: *"Nothing in this review argues for a seventh restructure; §14.3 is now a function,
   and the remaining defects are in its edges rather than in its shape."*
2. The trend is real and measurable: BLOCKERs 4 → 1, and the one BLOCKER was **introduced by the
   previous round's own fix** rather than surviving from before. Round 6 closed 11 of 12 round-5
   BLOCKER/MAJORs and 14 of 16 MINOR/NOTEs.
3. Narrowing still would not fix `B-1`. Any cut leaves `EF1`'s closure sentence and `WS8` in the
   same relationship.

**The tightening, which is the part that costs something.** From here the clause fires on **any**
BLOCKER in §14.3, whatever its cause and whoever introduced it, with no further argument and no
appeal to a reviewer's recommendation. Round 7 is the last round that gets a judgement call. This is
deliberately stricter than §2.4 as written, because I have now twice found a defensible reason not
to invoke it, and a pre-commitment that keeps yielding to reasoning is not one.

---

## 2. The BLOCKER

`B-1` — rev 6 fixed round 5's `Q-7` by writing into `WS8` and §14.3.3 that a record with a dropped
unrecognised id has scope `not_evaluable`. `EF1` says *"Nothing outside `EF2`–`EF5` assigns a
criterion state"* and *"each is in exactly one of three states"*. So one input had two states and no
precedence rule — and the reading `EF1` endorses restores the exact falsehood `Q-7` identified:
`bi-16` with `bathroom` dropped comes out `scope_exact` against *"주방만, 2천"* at `delta = −0.01`,
classed `exact`, and `WS7a` then licenses *"이 사례는 주방만 리모델링했습니다"* about a
kitchen-and-two-bathrooms job.

**Fix.** The clause moves into `EF3`'s `partial_remodel` branch — the only place a scope state is
assigned — and `WS8`/`WS7a` state the reason and cite `EF3`. The `full_remodel` branch needs no
clause: its spaces half rests on `PT4`(b) rather than the id list, and a dropped **trade** id can
only turn `Q_t ⊆ R_t` from true to false, which is the safe direction. This is `12` §2's own
principle applied to the rule that broke it: when two devices can disagree, compute one from the
other.

It also corrupted the contract's own proof, which transcribed `EF3` faithfully and therefore
declared the `CINV-9` fixture unreachable while asserting it as a worked case.

---

## 3. The proof, rebuilt

Round 6's `M-1`/`M-2` are the findings I take most seriously, because the proof was the artifact
`12` §1 rested its argument on.

| finding | what it means |
|---|---|
| `M-1` | `reachable()` was hand-written and wrong: it excluded `partial_remodel` + scope `not_evaluable` (which `WS8` makes reachable) and omitted three `PB1` constraints. `CINV-20`'s *"464 reachable"* was the output of a wrong predicate; a consumer would not reproduce it. |
| `M-2` | two of five assertions were vacuous — the "`EF3` lemma" test restated its own premise, and single-valuedness called one pure function twice. |
| `M-3` | a worked case asserted a state vector its own utterance cannot produce. |

**The rebuild removes the class of error rather than the instances.** There is no hand-written
reachability predicate any more. `EF2`, `EF3`, `EF4`, `EF5` and `PB1` are implemented from their own
text, and the four criterion states are **derived** over a conversation × record input space of
24,192 inputs. Reachability is now a *result*: **256** of the 768 possible state vectors occur, and
all 11 classes appear among them.

*First match wins* is checked against an independent statement of each row's condition — the
returned class must belong to the lowest-numbered row whose condition holds — so the single-valued
claim tests something. `EF3`'s lemma is derived from `EF3`'s branches rather than assumed. The raw
768-vector cross-product is kept as pass B, a robustness check against a future criterion gaining a
branch. `OD-O` is asserted directly: `PB1` must refuse a whole-home total against a partial-framed
budget.

Ten worked cases from rounds 4–6 are stated as conversations with their states derived, including
round 6's corrected case 7. **`npm run proof:ef6`** wires it into the repo (round-6 note `n-5`: it
previously ran nowhere, which was the failure mode it was written against).

---

## 4. The seven other MAJORs

| id | fix |
|---|---|
| `M-4` | §20.4's relaxation account completed: the `Q-4` fix **removed `PB1`'s refusal on named spaces** — a real relaxation, and the one rev-6 change that alters what a customer is told. `PB3a`'s dropped conjunct is restated: it changed `CINV-16`'s outcome even though it changed nothing on the wire. |
| `M-5` | `GR3` gains **every result has an order**: the last two keys are always `publishedAt` descending then `id` ascending. Seven `exact` records with every key flat and a limit of 3 is now determined, not undefined. |
| `M-6` | `PT5` gains the sentence that was missing where an author reads it: a bounded job whose only work is a trade run through the space is authored **breadth-absent**, `bi-19`'s answer at one-room scale. `INV-30` stands; the collision was in extent, not direction. Answers `Q-19`. |
| `M-7` | `VB3` gains an extraction rule, because `PB1` now rests on `V.breadth` alone: restriction **by space** sets it, restriction **by trade** does not, enumeration does not. This is §5.2's spaces-vs-trades line applied to the query side, and it decides `OD-O`. |
| `M-8` | `GR3`'s three rungs extended so every class `EF6` produces is on one — including `OD-P`'s own *"projects containing the requested space"*, which the contract renders `scope_superset`. `CINV-24` fixtures `breadth_fallback` by name. |

`m-1`…`m-9` and `n-1`…`n-6` all applied. `n-4` — *has the contract begun specifying the assistant's
voice?* — is **recorded for the owner** in §18 rather than decided: three prescribed sentences
(`PB0a`'s template, `CINV-17`, `CINV-23`), all reversible without touching a wire field.

`n-2` — rev 7's `WS9` sentence was not carried back through `04` — was delegated to a read-only
re-audit of all 19 records (`13c-ws9-reaudit.md`) rather than fixed by inspection, because `bi-09`
authored `bedroom` on joinery alone and `living_room` on trades run through it, and the same question
applied to every record. **Result: four of the eleven authored records change** — `bi-09`
(−`living_room`, −`bedroom`, +`built_in_furniture`), `bi-11` (−`living_room`, −`bedroom`), `bi-12`
(−`living_room`, −`bedroom`, −`dining`), `bi-13` (−`pantry`, −`bedroom`, +`built_in_furniture`).
I re-derived the consequences rather than accepting them: the inventory is **16 used / 10 unused**
(`pantry` was `bi-13`'s only user), and `INV-28`/`INV-29`/`INV-30` hold on all 19 — no record lost
its last `Spaces` id. `bi-11` is the clearest case in the corpus: its body says the **existing**
옷장 was kept, so no work reached the bedroom at all.

**The re-authoring produced something worth more than the fix.** `scope`'s Korean display strings
and `workScopeIds` now visibly disagree on four records — `bi-12`'s `scope` still says 거실 and
침실 while its ids carry neither. That is exactly what `WS4` mandates (ids are never derived from
the site's scope field) and what `WS9` means (a trade run through a room is not a remodel of it).
Before rev 6 the two lists agreed closely enough that a producer could have split the Korean strings
and passed every check. `04` §0 now names these four as the corpus's `WS4` fixture.

---

## 4a. Three findings the delta review did not have — from hand-execution

A second checker worked eight Korean utterances against all 19 records **from the prose alone**,
with `proof/ef6-totality.mjs` deliberately withheld so it could not inherit the proof's reading of
the rules. That produced three defects `13` missed, two of them MAJOR, and both MAJORs are places
where a rule that looked total was not:

| id | finding | fix |
|---|---|---|
| **X-1** | `GR3`'s rows **overlap with no precedence**. *"창호 교체하려는데 34평 전체 리모델링"* has `V.breadth = whole` **and** `Q_s = ∅, Q_t ≠ ∅`, so it selects the whole-home row and the trade-only row at once. `PB7` had solved exactly this for §14.3.3 a revision earlier; `GR3` never got the same treatment. | **`GR3a`**, a five-row precedence table, first match wins, total over the query space — row 5 being *no ladder*. |
| **X-2** | `WS6` left an ambiguous visitor term to the consumer's alias table, and that table silently decided a **budget verdict**. *"현관이랑 복도 수납"* against `bi-18` — fully authored, no data gap — is `scope_exact`/permitted if 복도 is not a named space and `scope_subset`/refused if it is. `WS9` had closed only the authoring half of this ambiguity; the query half was open. | `WS6` gains **resolve conservatively**: the tie takes the reading that does *not* permit a price comparison, and the consumer states which reading it took. |
| **X-3** | `CINV-15` cited `bi-16` for §14.3.3.1's `scope_superset` row. `bi-16` is `[kitchen, bathroom]`, so `R_t = ∅` and it lands on `scope_disjoint`. Budget verdict unaffected (both rows refuse); the relation label and its disclosure text were wrong. | `CINV-15` rebuilt: `bi-17` `scope_superset`, `bi-16` `scope_disjoint`, `bi-19` the trade rung. |

**The method is the finding.** Two reviewers, one document, largely disjoint defect sets: the delta
review found what **contradicts another rule**, the hand-execution found what **no rule decides**.
`X-1` and `X-2` are both *"two readings, no tie-breaker"* — the same shape as `B-1`, and as round 5's
`Q-4`, and as round 4's `P-8`. That shape has now appeared in four consecutive revisions and is
worth naming as this contract's recurring failure mode rather than treating each instance as new.
Every future rule that returns a relation, a permission or a class should be checked for it
explicitly before the round, not after.

**One thing the hand-execution found that is not a contract defect.** Five of the eight utterances
cannot be cleanly evaluated over today's corpus, because `04` never authored `workScopeIds` for
`bi-01`, `bi-04`, `bi-06` and `bi-07` — the four existing records that do carry a `projectType`.
That is the authoring pass `04:41` already calls a hard prerequisite, and `WS7c`/`INV-28`/`INV-29`
mean those four may not legally carry `projectType` until it runs. It is a **data-readiness
precondition on the demo**, recorded here so it is not rediscovered as a contract defect in round 7.

---

## 5. What rev 7 relaxes

**Nothing.** `B-1`, `M-6`, `M-7`, `M-8` and `X-2` tighten. `M-1`/`M-2`/`M-3`/`n-5` change only the
proof. `M-5` and `X-1` add ordering guarantees; `X-3` corrects a fixture, not a rule. `m-2` aligns `CINV-16` with `PB3a`, which changes no consumer permission
because the wire could never carry the dropped value. Checked row by row against §20.5's table
rather than asserted — the failure that recurred in four consecutive revisions and was corrected in
rev 7 for rev 6 as well.

---

## 6. Next

1. `13c` re-audit lands → `04` rev 6 → re-verify `INV-28`/`INV-29`/`INV-30` over all 19.
2. **Delta review of rev 7**, delta-only, fresh context. Attack `proof/ef6-totality.mjs`'s
   transcription of `EF2`–`EF5`/`PB1` first; the derived set is only as good as those five functions.
3. On PASS: L11 Template Release **1.6.0** cut and re-pin, then L12 demo data.
