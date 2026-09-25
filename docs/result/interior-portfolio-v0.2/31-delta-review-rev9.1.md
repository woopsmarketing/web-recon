# 31 — Delta review of Contract V0.2 **rev 9.1**

| | |
|---|---|
| date | 2026-09-24 |
| reviewer | independent, fresh context; read only the inputs named in the brief, plus `data/sites/boost-interior-demo/content/projects.json`; given no preferred conclusion |
| under review | `docs/reports/integration/07-integration-contract-v0.2-candidate.md` (rev 9.1, 2,971 lines) |
| checklist | `17-delta-review-rev8.md` (`B8-1`…`B8-4`, `M8-1`…`M8-8`, 16 MINOR, 6 NOTE); `01-owner-decisions.md` `OD-A`…`OD-S`; `22-rev9-design.md` §5c's ledger, read as claims |
| method | §14.3, §15, §17, §18, §20.7, §20.8 read line by line; the rest skimmed. `VB3`, `EF2`–`EF4`, §14.3.3/§14.3.3.1, `EF6`, `GR2a` and the five ordering keys were **re-implemented from the prose** and executed over the live 19-record corpus for eleven utterances, including all nine of `04` §4.1. `CINV-5`'s metamorphic form was re-executed independently (218 mutant pairs). `20-pipeline-checker.md` was read **after** `21-pipeline-audit.md` and is cited only where its own report agrees with an independent derivation |

Short names: **`07`** = the contract · **`04`** = the demo-data spec · **`17`** = round 8's review ·
**`20`** = the checker report · **`21`** = the checker audit · **`22`** = the rev-9 design ·
**`01`** = the owner decisions. Paths are under `/Users/woops/projects/web-recon-track-b/`.

---

## VERDICT

**NOT READY. 4 BLOCKER · 8 MAJOR · 9 MINOR · 6 NOTE.**

**Rev 9 is the first revision in this sequence whose structural work is real.** Three of round 8's
four BLOCKERs are closed at the rule level and I could not reopen them: `WS6`'s dead discriminator is
gone and its replacement (`D9-5a`/`D9-7a`) is total and single-valued; the two-ordering-device
collision is gone because one device was deleted rather than patched; `VB3` is a function. `Q-23`'s
mechanical half is genuinely closed — I enumerated every citation of a parked rule inside the
in-force region and found **no** rule that cites one as live. §17.1 went from a false claim to a
sourced recovery. The decision ledger in `22` killed five of thirteen proposals before they reached
the file, which is the first time this project has spent a round finding its own defects.

**What did not happen is the thing the revision is named for.** Round 8's `B8-3` — `PB4` — is
reported closed at *"0 of 798"*. That figure measures the checker's **property 4b**, a pairwise
twin comparison; the property `PB4` and `CINV-5` actually state is the checker's **property 4a**,
the deletion form, which the same run reports as **FAIL, 44 findings** (`20:331-343`, `20:1102`).
The contract quotes 4b's number under 4a's words (`07:1229-1232`). My own execution of `CINV-5`
exactly as written finds **109 violations of 218 mutant pairs** on the live corpus, including all
seven `full_remodel` records dropping eight places on *"예산 3천으로 전체 가능해요?"* when
`projectType` is deleted. 4b is the assertion `22` §5c records as **killed** (`D9-3`) for being *"a
change to an assertion in the direction of making it pass, which this project forbids"*. The rule
that eight rounds have failed on is still failing, and the number that certifies it closed is a
number about something else.

**Three further BLOCKERs.** The ordering keys do not determine an order: key (2)'s carve-out is
**in force** with a referent that does not exist, and §18 kills all three readings of it without
supplying a fourth — rows A, F and G of `04` §4.1 have no defined order, and candidate 3 is
demonstrably intransitive on the authored corpus. `D9-9`'s fourth sentence assigns a criterion state
from **inside §14.3.3**, which `EF1` forbids in terms and `CINV-14` tests — the contract says so in
its own words (*"where that rule cannot see"*, `07:1124-1125`). And `OD-P`'s fallback ladder is
**inverted** for every breadth-absent space query: on `04` §4.1's own row D the six whole-home
remodels are labelled `exact` — *direct answers* — and `bi-15`, the 7,000,000 one-bathroom job, is
seventh. §14.3.6 states that `GR2`'s labels *"preserve [OD-P's disclosure] in full"*. They do not.

**On area C — whether a visitor is well served — the answer is no, four times in nine.** Rows B, D,
G and I return the wrong record first, and rows A and E are undetermined. Every failure has one
shape: `EF3`'s `full_remodel` branch makes a whole-home remodel `satisfied` on scope for **any** set
of spaces, so whenever `VB3` leaves `V.breadth` absent — which after `D9-4` includes *"욕실 하나만"*
— the corpus's six whole-home remodels occupy the entire `exact` block and the record that did the
work sits below them. The contract's two open questions about this (`Q-33`, `Q-34`) name the wrong
rules.

---

## A · Round 8's findings, one by one

### The four BLOCKERs

| id | claimed | I find |
|---|---|---|
| `B8-1` `WS6`'s vacuous discriminator | fixed by `D9-5a`/`D9-7a` | **genuinely closed.** See below. |
| `B8-2` two `C: MUST` orderings | fixed by `D9-1` | **genuinely closed** as stated — but the order it leaves is undetermined for a different reason: `B9-2`. |
| `B8-3` `GR2a` vs `PB4` | fixed by `D9-2c`, *"0 of 798"* | **NOT closed. `B9-1`.** |
| `B8-4` `VB3` not a function | fixed by `D9-4` | **genuinely closed.** |

**`B8-1` is closed, and the closure is sound.** The tie-break is deleted, not re-described. `Q`
carries every reading (`07:862`), `EF3` resolves per record (`07:1008-1015`), and rule 2's condition
is rule 1's exact negation, which makes the pair total and single-valued. I checked the one hole a
reader would look for — a reading under which the record's `EF3` branch yields **no** relation while
another yields one — and it cannot occur: which branch runs depends only on `R.projectType`, so
relation-nullness is uniform across readings for any one record. The refusal to transcribe
`07:1875`'s *"weaker class, decided once per query"* (`07:385-392`) is correct and correctly argued;
`21`'s `A-7` was wrong to call the fix a transcription. **This is the cleanest piece of work in the
revision.** Its *cost* is `M9-2` and part of `B9-4`, not its soundness.

**`B8-2` is closed.** `GR3a` and the rungs are deleted (`07:1365-1368`) and parked with their four
defects in §17.3. *"Direct answers are offered first"* is now a definition over a `GR2a` prefix
(`07:1355-1360`) and cannot disagree with anything. I enumerated the in-force region for a second
ordering instruction and found none: §14.3.3.1's *"fourth of ten in `GR2a`'s order"* (`07:1183`) and
`CINV-24`(a)'s *"`GR2a` places it after"* (`07:1554`) are both descriptions of `GR2a`, not rivals to
it. `M8-6` (*"larger `R_s` first"*) dies with the rungs and is recorded against the parked text.

**`B8-4` is closed.** `VB3` gains first-match (`07:883-886`) and the two prose overlaps are resolved
by row order, not by narrowing conditions. I re-derived both named utterances: *"큰 공사는 아니고
몇 군데만"* hits row 4 before row 7 ⇒ `partial`; *"집 전체는 아니고 바닥이랑 도배만 하려고요"* hits
row 1 before rows 2/5 ⇒ `partial`. Both as §20.7.1 claims. The third overlap is `m9-1`.

### The eight MAJORs

| id | claimed | I find |
|---|---|---|
| `M8-1` §17.1 deleted five of twelve items | fixed as far as evidence allows | **fixed, and then over-fixed.** All seven items are now printed with recovery locators, plus a contradictions table and a defects table. But §20.7.2's row still describes the **superseded** reconstruction-and-`LOST` state, and §20.8 logs none of it: `M9-4`. One item is still not printed: `m9-4`. |
| `M8-2` parked defects unrecorded | fixed | **genuinely fixed.** `07:1948-1952` records `B7-1`, `B7-3` and `M7-1` as preconditions on restoring `PB1`, with the parked text left as reviewed. This is exactly what was asked for. |
| `M8-3` `B7-3`'s class half | partly fixed; behaviour unchanged and stated | **accurate.** Executed *"바닥이랑 도배만"*: `bi-09` (50,000,000) and `bi-11` (30,000,000) are the two `exact` records; `bi-19` (11,000,000, the record that ran exactly those trades) is `not_evaluable` at position 3. The class outcome is unchanged and the contract says so. `GR2a`'s reorder did lift `not_evaluable` from tenth to fourth, as claimed. |
| `M8-4` false relaxation summary | fixed by not making the claim | **adequate for what it covers, and it does not cover enough**: `M9-4`, `M9-5`. |
| `M8-5` `GR2a` reorder unlisted | fixed in place | **fixed.** §20.6's `GR2a` row now records the rev-8 reordering as a relaxation and says why the permutation check could not see it. |
| `M8-6` *"larger `R_s` first"* | fixed by deletion | **fixed**, and recorded in §17.3. |
| `M8-7` `CINV-19` coverage template | recorded, not repaired | **honestly carried** as `Q-30`. Still under-specified; `m9-9`. |
| `M8-8` `04` row G unreachable | dispositioned; `04` not edited | **half.** `AU-3`'s narrowing is right — `04:699` states no class. But `04` §4.1 is now wrong in **four** rows, not one, and nothing schedules the edits: `M9-7`. |

---

## B · Does rev 9.1 hold together?

### `EF6` is total and single-valued. Confirmed.

Row 8 is unconditional so some row fires; first-match so exactly one does. I re-derived the eight
rows against `07:1260-1269` and executed them over the corpus for eleven utterances: every one of
19 records receives exactly one class on every utterance, and all ten `GR2a` classes are reachable
(I reached `exact`, `scope_superset`, `unknown_type_fallback`, `not_evaluable`, `fallback_from_full`,
`breadth_fallback`, `area_fallback`, `scope_overlap`, `scope_subset`, `scope_disjoint` on the corpus
alone). `EF3`'s lemma holds: row 1 fires only for a `partial_remodel`, and since `D9-2c` the relation
it names is never `scope_exact` or `scope_superset`. `GR2a` is a permutation of `GR2`'s ten-name
closed list — checked name by name. **No finding.**

### One rule assigns a criterion state from outside `EF2`–`EF4`. `B9-3`.

`07:949` (`EF1`, `C: MUST`): *"Nothing outside `EF2`–`EF4` assigns a criterion state."*

`07:1123-1128`, inside §14.3.3, the fourth normative sentence of `D9-9` (`C: MUST`):

> 4. **If the intersection is empty and any reading's set is not**, the criterion is
>    **`not_evaluable`** and the **ambiguity is disclosed** — the ambiguity clause's rule 1 applied
>    at the disclosure level, **where that rule cannot see**.

*"Where that rule cannot see"* is the contract conceding that `EF3` does not and cannot make this
assignment. Every other rule that touches a state is correctly worded as supplying a reason —
`WS8` at `07:429-434` (*"`EF3`'s `partial_remodel` branch — which is where the criterion state is
assigned, never here"*) and §14.3.3's closure paragraph at `07:1155` (*"`EF3` assigns the state,
this rule supplies the reason (`EF1`)"*). This one is not, and `CINV-17` repeats the assignment at
`07:1547`. `CINV-14` asserts *"no rule outside `EF2`–`EF4` assigns one"*; it cannot pass while
§14.3.3's sentence 4 is in force. Two `C: MUST`s contradict, which is the shape round 8 rated
BLOCKER for `B8-3`.

This is not cosmetic. The sentence fires on a real input class — `07:1130-1137` constructs one
itself (a term reading as `kitchen` **or** as `bathroom` against `partial_remodel [living_room]`) —
and it re-assigns a criterion **after** `EF3` has assigned it and after `EF6` has classed the record
by row 1 on the relation that was passed through. Nothing says whether `EF6` runs before or after.
The repair is one clause: move the condition into `EF3`'s ambiguity clause as a third rule, or word
it as `WS8` is worded.

### `PB4` cannot be satisfied by any class order, and rev 9 chose the direction that passes the test it measures. `B9-1`.

The structural statement first, because it explains the measurement. `PB4` (`07:1218-1222`) says a
criterion in state `not_evaluable` *"contributes **nothing** to the record's score and to **no**
tie-break key."* Ordering key (1) is `GR2a`'s class order (`07:1398`). `EF6` rows 4 and 6
(`07:1265`, `07:1267`) make the class a **function of** the `not_evaluable` state. So key (1) reads
the state, necessarily. No permutation of `GR2a` changes that; it only chooses the **direction** in
which the state contributes. Rev 8 chose the punitive direction; rev 9 chose the rewarding one.
Both violate `PB4` as written.

Executed, both directions, on the live corpus:

- **Punitive.** *"예산 3천으로 전체 가능해요?"* (`VB3` row 2 ⇒ `whole`; `Q = ∅`; no area). `bi-09`
  is `exact` at position **3**. Delete its `projectType` — the input the breadth criterion reads —
  and breadth becomes `not_evaluable`, `EF6` row 4 gives `unknown_type_fallback`, and it lands at
  position **11**. `CINV-5` (`07:1535`) says *"re-rank, and the record must not move **down**"*.
  `PB4`'s own gloss says *"Missing must not silently become never-shown — with a result limit of 3
  over 19 records, fourth place is invisible."* Third to eleventh. All seven `full_remodel` records
  do this on this one utterance.
- **Rewarding.** *"34평 전체 5천이면 되나요"* (`whole`, area 34평). `bi-12` — a genuine 26평 whole-home
  remodel, 52,000,000 — is `area_fallback` at position **16**. Delete its `projectType` and it
  becomes `unknown_type_fallback` at position **6**. A ten-place **promotion** for removing a true,
  matching input.

Over my eleven utterances, `CINV-5` as written gives **109 violations of 218 mutant pairs**. The
checker's own property 4a — the same property, but mutating only `area`, `pricing.total` and
`pricing.perArea`, never `projectType` or a `workScopeId` — reports **44 of 1,053, FAIL**
(`20:331-343`). `CINV-5` was **widened in rev 9** to all three criteria (*"Rev 9 states this over
all three criteria"*, `07:1535`) and nothing measures the two arms it was widened to. The breadth
arm is where the violations are worst.

What is measured at 0 is property **4b** (`20:345-350`): *"two mutants of the same record, one
driving criterion `c` to `not_evaluable` and one to `unsatisfied`, ranks compared."* That is
verbatim `D9-3`'s restatement, which §20.7.3 records as **withdrawn** — *"It is the same
unsatisfiable property… and it is a change to an assertion in the direction of making it pass, which
this project forbids"* (`07:2816`). `22` §2 is struck in full with the note *"The test was right;
the rules are wrong."* Rev 9 then satisfied the killed assertion and reported it as the strict one.

`07:1229-1232` is the load-bearing false sentence:

> The strict metamorphic form — delete a stated criterion's input, re-rank, the record must not move
> **down** — was measured on the corpus at **484 violations of 798 pairs** for rev 8… the strict
> form holds at **0 of 798**.

The clause before the dash describes 4a. The number after it is 4b's. `07:2746` (§20.7.1's `B8-3`
row), `07:1335` and `07:1049` repeat it.

### Rules added in this revision against rules that survived it

| added | survivor | verdict |
|---|---|---|
| `D9-7a`'s ambiguity clause (`07:1008-1036`) | `EF1` closure | **consistent** — the state is assigned inside `EF3`. |
| `D9-8`'s intersection key (3) (`07:1407-1420`) | `PB4` | **conflict**, see `B9-2`. |
| `D9-9` sentence 4 (`07:1123-1128`) | `EF1`, `CINV-14` | **contradiction**, `B9-3`. |
| `D9-9`'s permission clause (`07:983-999`) | `EF3` ground-not-conclusion | consistent; it narrows a permission, which is the safe direction. |
| `EF6` row 7 (`07:1268`) | `GR2`, `OD-P` | consistent, and the disclosure ground at `07:1284-1293` is sound — deleting the row flips 16 classifications from `scope_superset` to `exact`. Separating it from the `PB4` table (§20.8 row F) was the right correction. |
| `GR2a`'s new order (`07:1316-1317`) | `PB4`, `OD-P` | **conflict**, `B9-1` and `B9-4`. |
| `D9-4`'s 만-on-a-quantity reading (`07:904-908`) | `OD-P` | **conflict**, `B9-4`. |

---

## C · The question the checker cannot ask

All nine rows of `04` §4.1 executed against the live 19 records, with `VB3`, `EF2`–`EF4`, §14.3.3,
`EF6`, `GR2a` and the five keys re-implemented from the prose. Ordering shown under the
fall-through reading of key (2); where that reading is not determinate, `B9-2` applies.

| row | utterance | top of the result | served? |
|---|---|---|---|
| A | "34평 전체 5천이면 되나요" | `bi-01` (34평 full, **no total**), `bi-09` (50,000,000), `bi-10` (85,000,000) — all `exact` | **partly.** Class is right; the order is undetermined (`B9-2`) and #4 is `bi-19`, an 11,000,000 도배·바닥·조명 job, ahead of three actual whole-home remodels (`bi-12`, `bi-11`, `bi-13`). |
| B | "예산 3천으로 전체 가능해요?" | `bi-01` (no price), `bi-07` (no price), `bi-09` (50,000,000) | **no.** `bi-11`, the whole-home remodel that cost **exactly 30,000,000**, is fifth. Rule: §14.3.5 removes price from every key, and key (4) is `publishedAt`, so the two records with no price at all lead a budget question. `04` labels this row "worse"; it does not say the top two carry no price. |
| C | "주방만 하면 얼마예요" | `bi-14` 15,000,000 `exact`; `bi-04`, `bi-16` `scope_superset` | **yes.** Matches `04` and `CINV-24`(c). |
| D | "욕실 하나만" / "욕실 두 개" | `bi-01` (no total), `bi-09` 50,000,000, `bi-10` **85,000,000**, `bi-11`, `bi-12`, `bi-13` **125–140,000,000** — six whole-home remodels, all `exact` | **no, and this is the worst row.** `bi-15` — one bathroom, 7,000,000, `scope_exact` — is **seventh**. Rule: `D9-4` (`07:904-908`) sends 만-on-a-quantity to `VB3` row 6 ⇒ breadth **absent**; `EF3`'s `full_remodel` spaces half (`07:965-968`) is then `satisfied` for any `Q_s`; `Q_t = ∅` so the trades half is satisfied too; `EF6` row 8 ⇒ `exact`. `B9-4`. |
| E | "전용 84 아파트 주방" | undetermined | **no.** `Q-31`: §14.3.1 requires value + unit + basis and the visitor gives no unit. Read as absent, `bi-14` is 8th behind seven whole-home remodels. Read as 84 m² exclusive, `bi-14` is the **only** `exact` and the other 18 are `not_evaluable`. **19 of 19 classes differ.** `M9-1`. |
| F | "50평 전체 1억 넘나요" | `bi-13` (48평, 125–140,000,000) `exact`; `bi-08` (51평) `unknown_type_fallback` 2nd | **yes on the record, no on the question.** The 넘나요 goes unanswered (disclosed in `04` as worse). `bi-01`/`bi-09`/`bi-10` — 34평 whole-home — sit at 14–16, below seven partials; that is `Q-28`, disclosed at `07:1380-1390`. |
| G | "32평인데 도배랑 바닥만 얼마예요" | `bi-09` — a 34평 whole-home remodel at **50,000,000** — is the **only** `exact` | **no.** `bi-19` (32평, exactly 도배·바닥·조명, 11,000,000) is `not_evaluable` at 2nd. `Q-33` admits the outcome. The mechanism is again `EF3`'s `full_remodel` trades half: `bi-09` carries both trades, so it is `satisfied`, and `PT4`(b) means nothing about the 32평 flat's other rooms can count against it. |
| H | "바닥이랑 거실만" | `bi-17` 12,500,000 `exact`; `bi-06` `scope_superset` | **yes.** And `VB3`'s new first-match rule decides it under every binding reading — see `m9-1`. |
| I | "현관 수납" | `bi-01` (no total), `bi-09` 50,000,000, `bi-10` 85,000,000, `bi-12`, `bi-13`, `bi-07` — six whole-home remodels, all `exact` | **no.** `bi-18` — entrance + built-in joinery, 6,200,000, `04`'s own expected answer — is **ninth**, class `not_evaluable`. Rule: `WS6`/`D9-7a`. The two readings of 수납 disagree **only for the partials**, because `EF3`'s `full_remodel` branch never looks at `Q_s`. The ambiguity therefore costs exactly the records that could have matched and costs the whole-home remodels nothing. Sharper still: `D9-9`'s permission clause (`07:983-987`) forbids the reply from saying the entrance was included in `bi-01`, so the #1 **direct answer** is a record about which nothing specific to the question may be said. |

**Three rows well served (C, F on the record, H). Four badly (B, D, G, I). Two undetermined (A's
order, E entirely).**

**The single rule responsible for D, G and I** is `EF3`'s `full_remodel` branch at `07:965-971`: the
spaces half is `satisfied` for **any** `Q_s`, and the trades half is `satisfied` whenever the record
happens to carry the ids. Combined with `VB3` rows 5/6/7 — which send a trade restriction, a bare
enumeration and qualitative prose all to **absent** — this means that for most natural utterances
`EF2` is `not_applicable`, `EF3` is `satisfied` for every whole-home remodel, and `EF6` row 8 makes
all six of them `exact`. `GR2a` then puts them first, ahead of the one record that did the job.
`04` §4.1's expected answer is the record that did the job in seven of nine rows; the contract
returns it first in three.

The contract has two open questions in this area and **both name the wrong rule**:

- `Q-33` (`07:2293-2297`) says *"Breadth, scope and area cannot express 'a small job'."* That is
  true but not the binding constraint. A fourth criterion is not needed to stop an 85,000,000
  whole-home remodel being an `exact` answer to *"욕실 하나만"*; `EF3`'s spaces half doing the
  opposite of what the visitor asked is enough.
- `Q-34` (`07:2298-2300`) blames `WS7b`. `WS7b` cannot be the cause: when a `full_remodel` lacks the
  requested trade id, `EF3`'s trades half returns **`not_evaluable`**, not `satisfied`. The records
  that come out `exact` for a storage question are the ones that genuinely carry
  `built_in_furniture`; what makes them `exact` rather than a labelled reference is `PT4`(b)'s
  spaces half plus a breadth the visitor never stated. → `M9-8`.

---

## D · Implementability

**No, two competent consumers cannot get the same answers.** Four independent routes, in descending
size.

**1. The ordering keys do not determine an order (`B9-2`).** Key (2), in force at `07:1398-1401`:

> (2) `|delta_area|` ascending where the visitor stated an area and `AR5` permits the bases to be
> compared — by `PB4` a record where it does not is **not** ordered by this key and is **not**
> pushed to the end by it, **keeping the position the previous key gave it**

The previous key is `GR2a`, which produces a **block of ties**, not a position. §18's `Q-29`
(`07:2214-2233`) enumerates three readings and kills all three — count-0 contradicts `PB4` by name;
keep-position is not stable under partitioning; skip-to-next-key is **intransitive**. It names a
fourth shape and explicitly does not adopt it. So the in-force sentence prescribes reading 2, which
§18 declares dead, and no reading survives.

This is not latent. I reproduced `Q-29`'s own cycle independently on *"34평 전체 5천이면 되나요"*,
where `bi-04`, `bi-15` and `bi-17` are all `breadth_fallback` in one `GR2a` block:
`bi-17 < bi-04` by key (2); `bi-04 < bi-15` by key (4); `bi-15 < bi-17` by key (4). The order my own
run printed for positions 9–15 of that row is an artefact of the sort algorithm.
**Rows A, F and G of `04` §4.1 have no defined order.** `CINV-21` (`07:1551`, `C: MUST`,
*"two runs of one query over one snapshot produce the same order"*) is unsatisfiable by any
implementation, exactly as `22` §5c states — and `22`'s own final word is that this *"goes there as
a **blocker**, not as an aside."* §18 carries the pre-correction framing instead: *"Why the revision
ships regardless."*

**2. Key (3) has no carve-out although `PB4` requires one (`B9-2`, second half).** Key (3) counts
the visitor's stated ids the record carries. `PB4` says a `not_evaluable` criterion enters **no**
tie-break key, and §18 concedes the point (`07:2221-2225`: *"the skip applies to *every*
`not_evaluable` scope… applied as written it moves **10 of 27** branches"*). Key (3)'s text states
no skip. Executed on row I: with key (3) as written, `bi-18` is **9th**; with the `PB4` skip
applied, it is **13th**. Two `C: MUST`s, no tie-breaker, different results — the shape round 8
called `B8-2`.

**3. `V.area` with no unit (`M9-1`).** `Q-31` is acknowledged and unfixed. Row E's entire result set
turns on it.

**4. The number of `WS6` readings is consumer-owned and now determines the class (`M9-2`).** `WS6`
assigns the alias table to the consumer (`07:346-348`, V0 §11.2, unchanged). `D9-7a` makes the
**criterion state** a function of whether the readings agree. A consumer whose table maps 수납 only
to `built_in_furniture` returns `bi-18` as `scope_exact` ⇒ `exact`, first. A consumer that also
admits `storage` — the reading `07:366-372` works through by name — returns it `not_evaluable`,
ninth. Same document, same utterance, opposite answers, both conforming. Before rev 9 the tie-break
at least aimed at one answer; `D9-5a` is honest about the ambiguity and, as a side effect, exports
the consumer's vocabulary into the match class.

**What happens to a record missing an input an ordering key reads** — the brief's specific question
— is therefore: *nothing the contract defines.* Key (2) says it keeps a position that does not
exist; key (3) says nothing at all while `PB4` says it must be skipped; and §14.3.6's *"Steps 4–5
are the deterministic floor… what makes 'two consumers cannot disagree on one document' true rather
than aspirational"* (`07:1403-1405`) is false as long as keys (2) and (3) are undetermined above it.

**One more, carried:** `X8-11` (`07:2853`) — no rule states what is **returned** or how many. `PB4`'s
own italic and `04` §4.1 both presuppose a limit of 3. Whether row D's answer is merely bad or
catastrophic is a function of a number no rule states. → `M9-6`.

---

## E · Honesty of the document's own account

Spot-checked hostilely against the file and against an independent execution.

| claim | where | verdict |
|---|---|---|
| *"the strict form holds at **0 of 798**"* | `07:1232`, `07:1049`, `07:1335`, `07:2746` | **FALSE.** The words describe property 4a; the number is 4b's. 4a FAILs — 44 in the checker's own narrower form, 109 of 218 in mine. → `B9-1` |
| *"`PB4`'s text is unchanged in rev 9 and is now satisfiable"* | `07:1224` | **FALSE.** It is not satisfiable by any class order while `EF6` rows 4 and 6 make key (1) a function of the `not_evaluable` state. → `B9-1` |
| `EF6` row 7 is load-bearing for **disclosure**, not `PB4`; 16 classifications flip | `07:1284-1293`, §20.8 row F | **true, and well separated.** The retraction of the `bi-13` witness (§20.8 row E) is the right kind of correction and is made without a replacement, which is correct because there is none. |
| *"`D9-1` alone is a measurable regression — 624 against rev 8's 484"* | `07:2772` | **credible and load-bearing.** I did not re-run rev 8. It rests on 4b, so it inherits `B9-1`'s caveat about which property is being counted, but the *ordering* of the configurations is the claim that matters and it is consistent with the rungs partitioning on `projectType` presence. |
| `N8-2`: *"With `GR2a` alone, `bi-18` is `exact` for '현관이랑 복도 수납' and sorts in the `exact` block"* | `07:2842` | **FALSE.** Executed over all four readings (수납 → `storage`/`built_in_furniture` × 복도 → `hallway`/nothing): the relations differ, `D9-7a` rule 1 fires, `bi-18` is **`not_evaluable`** and **ninth**, behind six whole-home remodels. It contradicts §7.4's own worked example at `07:366-372` and §20.7.5 item 3 in the same document. → `M9-3` |
| §20.7.2's `M8-1` row: *"each item is a **reconstruction**… the two nothing attests are marked **LOST** rather than guessed"* | `07:2798` | **stale.** §17.1 says *"**Both `LOST` markers are withdrawn and all five reconstructions are replaced**"* (`07:1641-1642`). The change log describes a state the document no longer has. → `M9-4` |
| §20.8 — the rev 9 → rev 9.1 log | `07:2925-2948` | **incomplete.** Rows A–H cover the ambiguity clause, key (3), disclosure membership, the `PB4` figures, the deleted witness, row 7's justification, `Q-29` and the quoted figures. The **largest** change — §17.1 growing from five reconstructions plus two `LOST` markers to seven verbatim recoveries with a contradictions table, roughly 470 lines sourced to `27-rev7-text-recovery.md` — has **no row**, and `27` is named nowhere in either change log or in the revision header. → `M9-4` |
| §20.7.6 *"Verification rev 9 owes, and does not claim"* | `07:2885-2923` | **selective.** It quotes three passing figures — property 3 `0 of 27`, `PB4` strict `0 of 798`, no-class inputs `0` — from a clean rev-9.1 configuration. The **same** configuration reports property 4 **FAIL (44)**, property 6 **FAIL (4)** and property 2 **FAIL (2)** (`20:1099-1104`). A section whose stated purpose is to say what is *not* claimed omits three failing verdicts from the run it quotes. → `M9-5` |
| *"no summary claim is made about relaxation, and that is deliberate"* | `07:2731-2738`, `07:2932-2937` | **the right call, adequately executed at the row level.** A per-rule table with no aggregate is better than an eighth false aggregate, and the stated reason (`DM-1`: derived or not stated) is correct. It does not excuse `M9-4`/`M9-5`, which are failures of the **rows**, not of the missing summary. |
| `X8-1`: *"the single worst obstacle to executing this contract"* | `07:2851` | **stale.** All 19 records in `data/sites/boost-interior-demo/content/projects.json` now carry `workScopeIds`, and 15 carry `projectType`. `CINV-21`'s own *"seven `exact` records"* fixture only works because of it. → `m9-2` |
| §18's `Q-31`, `Q-33`, `Q-34` | `07:2280`, `07:2293`, `07:2298` | `Q-31` accurate; `Q-33` and `Q-34` name the wrong mechanism → `M9-8`. |
| §18's `Q-29` *"Why the revision ships regardless"* | `07:2271-2273` | **contradicted by its own source.** `22` §5c's correction block concludes *"it goes there as a **blocker**, not as an aside"* and that *"the checker measures internal consistency, not sufficiency."* The contract carries the metric argument and not the conclusion drawn from it. → `B9-2` |

**Net: three of the account's load-bearing claims are false (`0 of 798`, `PB4` satisfiable, `N8-2`),
one change log is materially incomplete, and one verification section quotes only its passing
figures.** Against that: §20.8 rows D, E and F are genuine self-corrections of the author's own
published numbers, made against interest, and §20.7.3's table of four killed proposals is the most
useful page in the document. The account is more honest than rev 8's and still not correct.

---

## F · What is parked

**Nothing in force depends on a parked rule.** I enumerated every occurrence of `PB0`, `PB0a`,
`PB1`, `PB3`, `PB3a`, `PB6`, `PB6a`, `EF5`, `price_fallback` and `GR3a` in the in-force region
(`07:1-1601`). Every one is either inside §14.3's scope note, a historical aside, or an explicit
deferral marker. The one that could have gone wrong — §9.2's `PA5`, which exists to feed `PB3a` —
carries its own hedge: ***"`PB3a` is deferred to §17.1 and `source` currently guards nothing in
V0.2… it is the input V0.3 restores the rule on"*** (`07:579-582`). Round 8's `Q-23` mechanical half
is **closed**, and the four dangling citations it found (`WS6`, `CINV-15`, §19, `WS9`) are each
rewritten rather than covered by a wider disclaimer, exactly as `N8-4` asked. **No finding.**

**The parked material is restorable, with one gap.** §17.1 now prints `EF5`, the `price_fallback`
class row with rev 7's full `EF6`, §14.3.3's and §14.3.3.1's budget columns, §14.3.4's tier section,
`GR3`'s budget rung selector and `CINV-6`/`CINV-11`, each with a provenance locator; plus a
four-row table of where the recovered text **contradicts** V0.2 (`07:1928-1933`) and a three-row
table of the defects parked with `PB1` (`07:1948-1952`). §17.3 prints rev 8's `GR3a` and its four
defects. This is a large, genuine improvement over rev 8, and the discipline of separating *what
rev 7 said* from *what V0.3 must decide* is right.

The gap: §17.1-e does **not** print three of the four rung rows, deferring them to
`27-rev7-text-recovery.md` §F (`07:1877`), against §17.3's own stated principle — *"Learning from
`M8-1`: what is parked is printed"* (`07:2109`). It is the same class of dependency `M8-1` was
raised about, one document further out. → `m9-4`.

Two smaller observations, neither a defect in the parking: `PB5` and `PB2` are retained in force and
are **inert** in V0.2 (nothing compares a budget, so nothing can violate them), which is correct as
a retained prohibition but makes `EF6`'s row-ordering rationale — *"row 4 precedes row 6 because…
`PB5` needs that record identifiable"* (`07:1277`) — a justification with no operative referent
(`m9-3`). And `D9-10` appears in the revision header's ledger and nowhere else in the file
(`m9-5`).

---

## G · What I could not verify

- **Rev 9 → rev 9.1 as a diff.** `07` is untracked with no committed ancestor. §E rests on the
  file's own text plus the quoted rev-9 wording inside §20.8's *"rev 9 said"* column.
- **The abstract measurements** — 576 / 432 pairs in `proof/pb4-metamorphic.mjs` and
  `proof/pb4-direction.mjs`. §20.7.6 states these scripts are the coordinator's and unaudited; I did
  not run them. My findings do not depend on them.
- **`CINV-20`'s pass A/B arithmetic** (1,512 / 100 of 192 / 336) and the *"0 of 64 synthetic and
  0 of 38 corpus"* figure for `D9-7a`. I verified `EF6`'s totality and single-valuedness by
  derivation and on the corpus, not by reproducing those enumerations.
- **The disclosure counts** — *"10 row disclosures decided by picking a reading, 0 under `D9-9`"*
  and *"16 corpus classifications change"*. I confirmed the **direction** of the row-5 inversion
  argument at `07:1113-1122` by hand and found it correct; the counts I did not reproduce.
- **§1–§13 and §15's `INV-*`** — the producer half — were skimmed for consistency with the consumer
  changes and not re-reviewed. Rev 9.1 leaves them alone, and `D-1`/`D-1a`/`RD1`/`INV-19` are
  untouched, so `OD-K` is not at risk from this revision.

---

## H · All findings

| id | sev | one line | where |
|---|---|---|---|
| `B9-1` | **BLOCKER** | `PB4`/`CINV-5` are **not** satisfied at rev 9.1. *"The strict form holds at 0 of 798"* states property **4a**'s words over property **4b**'s number; 4a FAILs (44 in the checker, 109 of 218 in an independent run). 4b is `D9-3`'s restatement, which §20.7.3 records as withdrawn for being a relaxation. Round 8's `B8-3` is not closed, and no class order can close it while `EF6` rows 4/6 make key (1) a function of the `not_evaluable` state. Witnesses: `bi-09` 3→11 on *"예산 3천으로 전체 가능해요?"* when `projectType` is deleted; `bi-12` 16→6 on *"34평 전체 5천이면 되나요"* for the same deletion. | `07:1224-1236`, `07:1535`, `07:2746`; `20:331-350`, `20:1102` |
| `B9-2` | **BLOCKER** | The ordering keys determine no order. Key (2)'s in-force carve-out says a skipped record *"keeps the position the previous key gave it"*; the previous key gives a block, not a position, and §18 kills all three readings without supplying a fourth. Candidate 3 is intransitive on the authored corpus (`bi-17 < bi-04 < bi-15 < bi-17` on row A), so `CINV-21` is unsatisfiable by any implementation. Separately, key (3) states no skip although `PB4` requires one — `bi-18` is 9th or 13th on row I. Rows A, F, G of `04` §4.1 have no defined order. `22` §5c calls this a blocker; §18 carries *"Why the revision ships regardless."* | `07:1398-1405`, `07:1551`, `07:2214-2273` |
| `B9-3` | **BLOCKER** | `D9-9`'s fourth sentence, inside §14.3.3 and `C: MUST`, assigns a criterion state: *"the criterion is **`not_evaluable`** and the **ambiguity is disclosed** — … applied at the disclosure level, **where that rule cannot see**."* `EF1` (`C: MUST`) says *"Nothing outside `EF2`–`EF4` assigns a criterion state"*; `CINV-14` tests it. Two `C: MUST`s contradict and `CINV-14` cannot pass. Repeated at `CINV-17`. | `07:1123-1128`, `07:949`, `07:1544`, `07:1547` |
| `B9-4` | **BLOCKER** | `OD-P`'s fallback ladder is **inverted** for every breadth-absent space query, and the fallbacks are labelled `exact`. On `04` §4.1 row D (*"욕실 하나만"*), `bi-10` — an 85,000,000 whole-home remodel — is a **direct answer**, `bi-13` (125–140,000,000) is a direct answer, and `bi-15` (one bathroom, 7,000,000, `scope_exact`) is **seventh**. `OD-P`: *"The AI must never hide that a fallback case is not an exact match."* §14.3.6 asserts *"`GR2`'s per-class labels preserve it in full"* — false. Introduced for this utterance by rev 9's own `D9-4`; the mechanism is `EF3`'s `full_remodel` spaces half. | `07:1385-1387`, `07:904-908`, `07:965-968`, `07:1269`; `01:25`; `04:696` (row D's expected answer: *"bi-15 (7,000,000) / bi-16"*) |
| `M9-1` | MAJOR | `Q-31` leaves row E's whole result to the implementer: *"전용 84 아파트 주방"* gives no unit, and §14.3.1 has no *"cannot be resolved ⇒ absent"* clause although `VB1` does. Read as absent, `bi-14` is 8th behind seven whole-home remodels; read as 84 m² exclusive, `bi-14` is the only `exact` and the other 18 are `not_evaluable`. 19 of 19 classes differ. | `07:862-863`, `07:871`, `07:2280-2287` |
| `M9-2` | MAJOR | The number of `WS6` readings is the **consumer's**, and `D9-7a` makes the criterion **state** a function of whether they agree. A consumer mapping 수납 → `built_in_furniture` only returns `bi-18` `exact` and first; one that also admits `storage` returns it `not_evaluable` and ninth. Same document, same utterance, both conforming. Nothing in `WS6` or §14.3.1 bounds the reading set. | `07:346-356`, `07:1008-1015`; `04:701` |
| `M9-3` | MAJOR | §20.7.4's `N8-2` row asserts *"`bi-18` is `exact` for '현관이랑 복도 수납' and sorts in the `exact` block."* Executed over all four readings it is `not_evaluable` and **ninth**. The claim contradicts §7.4's own worked example and §20.7.5 item 3 in the same file, and it certifies a NOTE closed on the opposite of the behaviour. | `07:2842` vs `07:366-372`, `07:2871-2872` |
| `M9-4` | MAJOR | §20.8 does not log the largest change rev 9.1 made — §17.1's replacement of five reconstructions and two `LOST` markers with seven sourced verbatim recoveries (~470 lines, from `27-rev7-text-recovery.md`, which neither change log nor the revision header names). §20.7.2's `M8-1` row still describes the superseded state. The eighth consecutive revision whose change log misdescribes the file. | `07:2798`, `07:2925-2948`, `07:5-7` vs `07:1635-1658` |
| `M9-5` | MAJOR | §20.7.6, titled *"Verification rev 9 owes, and does not claim"*, quotes three passing figures from the clean rev-9.1 run and omits that the same run reports property 4 **FAIL (44)**, property 6 **FAIL (4)** and property 2 **FAIL (2)**. | `07:2885-2923` vs `20:1099-1104` |
| `M9-6` | MAJOR | No rule states what is **returned** or how many, while `PB4`'s own gloss (*"with a result limit of 3 over 19 records, fourth place is invisible"*) and every `04` §4.1 row presuppose a limit. Whether `B9-4` is bad or catastrophic is a function of an unstated number. `X8-11`, carried unaddressed for two revisions. | `07:1222`, `07:2853` |
| `M9-7` | MAJOR | `04` §4.1 — the only stated acceptance criteria for the evaluation function — is knowingly wrong in four of nine rows (D's reading, G's mechanism, I's row derivation and `WS6` behaviour, A's unlabelled degradation). §20.7.5 records the debt; nothing schedules it, and `04` still carries a rev-8 header. Two of the nine rows now also fail on **which record comes first**, which §20.7.5 does not record at all. | `07:2856-2883`; `04:6`, `04:693-706` |
| `M9-8` | MAJOR | §18's two open questions about the product failure name the wrong rules. `Q-33` blames *"three criteria"*; `Q-34` blames `WS7b`, which cannot be the cause (a `full_remodel` lacking the trade id returns `not_evaluable`, not `satisfied`). The actual mechanism for rows D, G and I is `EF3`'s `full_remodel` spaces half via `PT4`(b) plus `VB3` routing most utterances to breadth-absent. An owner cannot answer a question that misnames its subject. | `07:2293-2300` vs `07:965-971` |
| `m9-1` | MINOR | §14.3.1's *"Still open"* paragraph and `Q-26` both use *"바닥이랑 거실만"*, which `VB3`'s new first-match rule **decides**: row 3 precedes row 5, and under every binding reading row 3's condition holds (the 만 is adjacent to 거실, a space). The live ambiguity is the mirror order — *"거실이랑 바닥만"* — where adjacent-binding gives `absent` and chain-binding gives `partial`. | `07:928-933`, `07:2196-2200` |
| `m9-2` | MINOR | `X8-1` (*"`bi-01`…`bi-08` have no `workScopeIds` … the single worst obstacle to executing this contract"*) is stale: all 19 live records carry `workScopeIds` and 15 carry `projectType`. `18` §7's ids reached `data/` although §20.7.5 item 8 and `AU-4` made correcting `18` §7 a precondition. | `07:2851`, `07:2881-2883`; `data/sites/boost-interior-demo/content/projects.json` |
| `m9-3` | MINOR | `EF6`'s row-4-before-row-6 rationale rests on `PB5` — *"`PB5` needs that record identifiable"* — and `PB5` is inert in V0.2, which describes no budget match. Same family as round 8's `m8-1`…`m8-3`, which rev 9 otherwise swept. | `07:1277`, `07:1237-1238` |
| `m9-4` | MINOR | §17.1-e does not print three of the four rung rows, deferring them to `27-rev7-text-recovery.md` §F, against §17.3's own stated principle *"what is parked is printed"*. | `07:1877`, `07:2109` |
| `m9-5` | MINOR | `D9-10` is named in the revision header's decision ledger and occurs nowhere else in the file; it has no normative site and no change-log row. | `07:7` |
| `m9-6` | MINOR | The nine `04` carries from round 8 (`m8-10`…`m8-13`, `m7-7`/`m8-8`, the stale rev-4/5/6 citations, `04:663`'s *"PB3/PB3a-comparable"*) are all still open; §20.7.5 lists them and none is applied. | `07:2856-2880`; `04:7, 36, 44, 91, 146, 185, 594, 635, 639, 658, 663, 701` |
| `m9-7` | MINOR | `20:1102` states property 4a's failure is *"which the contract acknowledges"*. The contract acknowledges no deletion-form failure anywhere — no occurrence of 44, 1,053, *"4a"* or *"deletion form"*. The misattribution is how `B9-1` survived the checker's own self-contradiction pass. | `20:1102` vs `07` (grep) |
| `m9-8` | MINOR | `20:1113-1118` states that §18 does not carry the missing-unit gap. §18's `Q-31` carries it verbatim. A stale finding in the report the contract's §20.7.6 quotes. | `20:1113-1118` vs `07:2280-2287` |
| `m9-9` | MINOR | `CINV-19`'s coverage statement is still two prose inputs against `PB0a`'s parked four-input template, so two consumers build different statements. Honestly carried as `Q-30`; recorded here so round 10 does not treat it as closed. | `07:1427-1436`, `07:1549`, `07:2274-2279` |
| `N9-1` | NOTE | **No blocker in area F.** No in-force rule cites a parked rule as live; §9.2's `PA5`/`PB3a` dependency is explicitly hedged. `Q-23`'s mechanical half is closed and should not be re-opened. | `07:579-582`, `07:2173-2180` |
| `N9-2` | NOTE | `B8-1`'s closure is the best-argued passage in the document. The refusal to transcribe `07:1875` (`07:385-392`) is correct and `21`'s `A-7` was wrong to call the fix a transcription; a class is a function of a record, so *"the weaker class, once per query"* cannot hold. | `07:385-392`; `21:326` |
| `N9-3` | NOTE | For a budget-shaped question the top-ranked records may be the ones carrying no price at all — rows A and B both lead with `bi-01`, which has an authored per-area price and no total. Nothing ranks on price presence, by design (§14.3.5), and `04` labels row B worse without saying this. | `07:1243-1246`; `04:694` |
| `N9-4` | NOTE | `Q-27` (widening the direct-answer prefix to `exact` + `scope_superset`) would not help rows D or I. The defect is **which** records are `exact`, not what the prefix is named. | `07:2201-2206` |
| `N9-5` | NOTE | On row I the #1 direct answer is a record about which the reply may say nothing specific to the question: `D9-9`'s permission clause forbids naming the entrance as included when the readings disagree on `Q_s ⊆ R_s`. Honest at the sentence level, useless at the result level. | `07:983-999` |
| `N9-6` | NOTE | `04` §4.1's *"Two rows below (B, F) are visibly worse"* is now at least five — A (round 8's `m8-12`), B, D, G and I. The narrowing's cost is no longer where `04` labels it. | `04:687-689` |

---

## I · The shortest path to READY

1. **`B9-1`** — decide which property `PB4` *is*, in one sentence, and measure that one. If it is the
   deletion form, `EF6` rows 4 and 6 must stop feeding key (1) — a `not_evaluable` criterion cannot
   both choose the class and contribute nothing to the class key. If it is the twin form, say so in
   `PB4` and `CINV-5` and record it as the relaxation `D9-3` was killed for. Either is defensible;
   quoting one while stating the other is not.
2. **`B9-2`** — the fourth shape §18 names (applicability decided once per class block) is the only
   candidate that is transitive and partition-stable by construction. It needs its own round, as
   §18 says — but **rev 9.1 cannot freeze without one of the four**, because key (2)'s sentence is
   in force and names a reading §18 has killed. At minimum, delete the carve-out sentence and state
   what happens instead.
3. **`B9-3`** — move `D9-9` sentence 4's condition into `EF3`'s ambiguity clause as a third rule, or
   word it as `WS8` is worded. One clause.
4. **`B9-4`** — this is the owner's. The contract should put the executed row D in front of them:
   *"욕실 하나만"* returns six whole-home remodels up to 140,000,000 as direct answers and the
   7,000,000 one-bathroom job seventh. Then `Q-33`/`Q-34` can be asked about the right rule.
5. **`M9-1`, `M9-6`** — both are one borrowed sentence (`VB1`'s for `V.area`; a stated result limit).
   They are rule additions, which rev 9 correctly declined to invent — but they are now blocking
   execution of two fixture rows, which is the threshold §18 itself sets for `Q-29`.
6. **`M9-3`, `M9-4`, `M9-5`** — corrections to the account, mechanical. A single pass that re-derives
   every §20.7.4 row against the current rules would have caught `N8-2`.
7. **`M9-7`** — `04` §4.1 has to be rewritten against rev 9.1 before round 10, or it stops being an
   acceptance criterion and becomes a second source of disagreement.

**The revision's structural direction is right and should not be reversed.** Deleting one of two
paired devices rather than patching the pair is the move this project has needed since round 4, and
`D9-1` makes it twice over. The decision ledger caught five bad rules before they were written,
which is a method change with a measurable return. What rev 9 did not do is ask what the rules
produce: every property it measures asks whether the contract agrees with itself, and the contract
now agrees with itself while telling a visitor who wants one bathroom redone about an eighty-five
million won whole-home remodel, and calling it an exact match.
