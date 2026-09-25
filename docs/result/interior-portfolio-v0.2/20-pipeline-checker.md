# 20 — The pipeline checker: the contract's prose-only half, made executable

**Deliverable** — `proof/contract-pipeline.mjs`, plain Node ESM, no dependencies.
Run: `node docs/result/interior-portfolio-v0.2/proof/contract-pipeline.mjs`, or `npm run proof:pipeline`.
Transcript of the run this document reports: `proof/contract-pipeline.txt`.

**Status: rev 7 — contract rev 9.1 is the DEFAULT configuration, and there are now SEVEN
properties.** §5h retargets the first six to rev 9.1 and re-measures the three figures the contract
now *states*. **§5i adds property 7, sufficiency**, after an independent hand executor found a
defect that all six pass: the order is total, single-valued, self-consistent — and ranks a
7,000,000 one-bathroom job behind six whole-home remodels **by publication date**. **§5j measures
`Q-29` candidate 4**, which is the first of the four that does not die, and finds a second defect on
the way: **key (2)'s carve-out at `07:1399-1401`, which is IN FORCE, is intransitive under one of
the two readings the contract admits.** §§5a–5g are retained as the evidence for rev 9.1's changes
and are marked where rev 9.1 has superseded them.

**Two headlines, and they point opposite ways.** At rev 9.1 the first six properties raise `0`
in-force findings on properties 1 and 3, where rev 9 raised five and two — the revision did what it
set out to do. And **65% of all adjacent pairs in every returned order are decided by a key that
reads nothing about the question** (§5i.7b), which no property before this round could see.

**One thing in this report is now known to be wrong and is marked rather than deleted:** §5h.8
names `GR2a` permutation as the test that kills `Q-29` candidate 1. It does not — the control
passes it (§5j.1). Candidate 1 fails *partitioning*. The instrument was mine and the correction is
recorded as a finding.
Rev 8 is retained behind `useRev(8)` so every comparison stays runnable, and the run reports both.
Rev 2 (rev-8 default, repaired against `21-pipeline-audit.md`, plus the `D9-1` measurement) is
superseded; §8's audit dispositions A-1…A-16 are carried forward unchanged because they are about
the **checker**, not about rev 8.

Citations are `07:<line>` into `docs/reports/integration/07-integration-contract-v0.2-candidate.md`
(**rev 9.1**), `04:<line>` into `04-demo-data-spec.md`, `18:<line>` into
`18-existing-eight-workscopes.md`, `02:<line>` into `02-integration-contract-v0-candidate.md`
(V0, frozen).

> **The contract is a moving target, and this report is built to survive that.** `07` has now
> moved three times during this work: ~230 lines (§17.1 restored from recovered rev-7 text), +12
> (the `†` footnote expanded), and **+243 for rev 9.1** (2,728 → 2,971 lines). The drift check
> caught the third one: it fired at **52 of 54** anchors and emitted the remap that re-resolved
> them. Every `07:` line number in this report is against the file on disk now.
>
> This run: **70 load-bearing citations checked, 0 drifted**, against a contract of **2,971 lines
> / 270,632 characters** (`wc -c` reports more — the file is UTF-8 with Korean throughout;
> revisions of this report before rev 4 labelled the character count "bytes", which was wrong).
> The 16 anchors added this round cover `D9-7a`, `D9-8`, `D9-9`'s four sentences and rev 9.1's
> corrected figures.
>
> **A second, permanent guard was added after the rev-9.1 move, because the drift check was not
> enough.** `07:1876` had been stale *before* this move and nothing noticed: it pointed at a `VB3`
> claim that is now at `07:2698`, and the 54-anchor set never covered it — an anchor table only
> checks the citations someone thought to anchor. The new **section-attribution check** covers
> **every** `07:` citation in the checker, anchored or not: it groups all of them by the `##`–`#####`
> heading they land in and prints the table. A citation that has drifted into the wrong section is
> then visible even when no anchor exists for it. This run: **194 distinct citations, 0 past the
> end of the file**, every one landing in a section consistent with what it is cited for.
>
> The §20.7/§20.8 corrections in §5h.2 go further and resolve their own line numbers **from the
> contract's own text at run time**, because a stored number there would be stale before it was read.
>
> The measurements in this report do not depend on any of this. They are derived from the rules'
> text, which the run reads; only the citations move.

---

## 0. What this is and is not

`19-round8-disposition-and-method-change.md` `DM-1` says a rev cannot be reviewed until a check
exists for it. Rev 9 was written unverified; this file is that check.

**It is not an attempt to pass.** A rule that cannot be implemented because its prose is ambiguous,
circular or contradicts another rule is recorded by `underdetermined(...)` and printed. The run
reports **2 gaps at rev 9.1** — `Q-29` (`PB4`'s carve-out, `07:1398-1405`) and `14.3.1`'s missing
unit clause (`07:863` vs `07:871`) — with **8 closed** by rev 9 / 9.1, and exits 0. Exit is
non-zero only if the script throws. `Q-29` is one the contract names in §18; the `14.3.1` gap is
not, and §5h.2 says so.

**Nothing is chosen.** Where the contract leaves a query open, the checker does not pick a reading:
it **branches**, runs every value the rule admits, and reports whether the branches differ. At rev 9,
26 utterances produce **27 branches** and **1** utterance is undecided — at rev 8 it was 31 branches
and 4 undecided. That drop is `D9-4` and `D9-5a` doing their job and is the cleanest single measure
of what rev 9 bought.

**Every check must be able to fail.** Each derived rule check (`PB2`, `PB5`, `VB2`, `GR1`, and
`EF1` closure) is followed by a **negative control**: the forbidden behaviour is injected and the
check is asserted to catch it. A check a mutant cannot break is reported as vacuous, not as a pass.

**Every count is conditional on the readings in force, and the run prints them first:**

| choice | in force at rev 9 | status |
|---|---|---|
| `VB3`'s left column (`07:890-894`) | **forms** | **decided by rev 9** (`D9-4`(iii)); at rev 8 this was gap 1 and the checker had to branch |
| a 만 on a quantity (`07:896-900`) | **not** a space restriction | **decided by rev 9** (`D9-4`(iv)); at rev 8 this was gap 3 |
| query area basis when the visitor states none (`07:1014-1017`) | left **unknown**; `AR5` compares with a disclosure | audit A-2, and rev 9's `Q-31` confirms the basis gap was false |
| key (2)'s `PB4` carve-out (`07:1301-1308`) | positional permutation inside each `GR2a` class block | **still open** — §18's `Q-29`, carried not patched |
| key (3) under two `WS6` readings (`07:1302` vs `07:854`) | union of the readings' ids | **new at rev 9** — see gap 3 |
| `GR3a`'s rungs and the sub-rung key | **deleted** (`07:1268-1271`), parked in §17.3 | `D9-1`; the rev-8 implementation survives behind `useRev(8)` |

---

## 1. The corpus (deliverable A)

19 records, built in one place, each field's source in a comment on the line.

| records | `projectType`, `workScopeIds` | everything else |
|---|---|---|
| `bi-01` … `bi-08` | `18:100-107` | `data/sites/boost-interior-demo/content/projects.json` |
| `bi-09` … `bi-19` | `04` §2, per-record block | same block |

`WS8`'s `droppedUnknownId` is **derived**, not set: every record's ids are checked against §7.3's 26
(`07:284-324`) and the flag is whatever that check returns. **Two consumers**, because `WS8` is a
property of the *(document, consumer)* pair: `CINV-9` (`07:1426`) names its fixture in terms, so the
checker builds a second consumer whose vocabulary is §7.3's 26 ids minus `bathroom`.

26 utterances: `04` §4.1 rows A–I (row D carries two), plus 16 that exercise branches the nine do
not. Full list in §1 of the transcript.

### Spec vs the applied data (deliverable 5)

`data/sites/boost-interior-demo/content/projects.json` now holds **all 19 records with V0.2 fields**,
so the checker reads it, builds a second corpus from it in this file's own record shape, and
**re-runs every branch on it**.

- **All 19 ids match.** Seven fields compared per record (`projectType`, `workScopeIds`,
  `area{value,unit,basis}`, `publishedAt`, `title`, `pricing.total`, `pricing.perArea`).
- **4 field disagreements**, all the same shape: `bi-09`, `bi-10`, `bi-11`, `bi-12` carry a
  `pricing.perArea` in `04` §2 (derived there by `RD1`) and **none** in the applied file.
- **0 of 27 branches change order, and 0 records change class.** That is measured, not argued: the
  only in-force readers of `perArea` are `GR1` (statable as a fact, `07:1326-1328`) and `GR5a`'s
  exemption (`07:1345-1348`), and *"No key is a price"* (`07:1308`) keeps it out of every key.
- **It still matters, and is reported as a finding.** `GR4` (`07:1329-1331`) exposes `perArea`
  exactly when the visitor asks for a per-area price, and `GR1` makes it statable. So
  *"평당 얼마였나요?"* about `bi-09`…`bi-12` is answerable from the spec and **not** from the data.
  Spec and data agree on everything a criterion or an ordering key reads, and disagree on something
  a visitor can ask about.

---

## 2. Rule-to-function map (deliverable B), rev 9

Every rule has its own named function with the rule id and a `07:` citation above it. Table rows are
encoded **in order** as separate predicates and the first match is taken.

| rule | rev-9 citation | function / constant | note |
|---|---|---|---|
| §7.3 vocabulary | `07:284-324` | `SPACES`, `WORKS`, `sOf`, `tOf` | 14 + 12 = 26 ids |
| `WS3` | `07:338-341` | quantity unrepresentable | feeds `D9-4`(iv) |
| `WS6` alias table | `07:346-348` | `ALIASES`, `scopeTermsIn`, `scopeReadings` | the consumer's own |
| `WS6` ambiguity | `07:350-356` | `V.readings`, `EF3` resolves | **`D9-5a`**; tie-break **deleted** |
| `WS8` | `07:421-427` | derived per **consumer** | two consumers |
| `VB1` | `07:859-863` | `vb1ExtractBudget` | three shapes |
| `VB2` | `07:864-865` | `budgetHintOf`, `vb2Check` + control | |
| `VB3` | `07:866-926` | `VB3_ROWS_REV9` (7 rows, rev-9 order) + `vb3Rev9` | **`D9-4`**; first match at `07:875-878` |
| `V.area` (§14.3.1) | `07:855` | `extractAreaCandidates` | **gap 2** |
| `EF1` | `07:941` | property 5, over the contract's text | |
| `EF2` | `07:947-951` | `EF2` | |
| `EF3` | `07:952-1009` | `ef3Branch` + `ef3ResolveReadings` + `EF3` | **`D9-2c`** satisfied set at `07:977-978`; ambiguity clause `07:982-991` |
| `EF4` | `07:1010-1017` | `EF4` | |
| §14.3.3 + `PB7` | `07:1019-1036`, `07:1023` | `SCOPE_ROWS` (8) + `scopeRelation` | |
| §14.3.3.1 | `07:1076-1081` | `TRADE_ONLY_ROWS` (4) | |
| §14.3.4 tiers | `07:1105-1109` | `TIER_ROWS` + `tierOf` | |
| `AR4`/`AR5`/`PY1` | `02:245-246`, `07:230-231`, `07:246-249` | `toPyeong`, `ar5Permits` | |
| `GR2` closed list | `07:1173-1178` | `CLASSES` | |
| `EF6` | `07:1180-1192` | `EF6_ROWS` (**8 rows**) + `EF6` | **row 7 = `07:1191`**, row 8 = `07:1192` |
| `GR2a` | `07:1219-1223` | `GR2A_REV9`, `gr2aIndex` | **`D9-2c`** reorder |
| `GR3` direct answers | `07:1258-1263` | `orderByDirectAnswersFirst` | **`D9-1`**: now a definition |
| `GR3a` | **deleted**, `07:1268-1271` | `RUNG_SETS` etc., gated on `CFG.noRungs` | parked in §17.3; rev-8 only |
| ordering keys 1–5 | `07:1301-1308` | `orderWithinBlock` | **gaps 1 and 3** |
| `GR1` | `07:1326-1328` | `gr1StatableNumbers`, `gr1InventionCheck` + control | |
| `GR4` | `07:1329-1331` | `gr4Envelope` | |
| `GR5` / `GR5a` | `07:1336-1343` / `07:1345-1359` | `gr5ForbiddenNumbers`, `gr5aExempt` | |
| `PB2` / `PB4` / `PB5` | `07:1129-1130` / `07:1131-1150` / `07:1148-1149` | ledger filters + property 4 | |

§17.1's deferred rules (`PB0`, `PB0a`, `PB1`, `PB3`, `PB3a`, `PB6`, `PB6a`, `EF5`,
`price_fallback`) are **not implemented**. Nothing in the file compares a price. The annex is
located by heading, not by line number — it is currently `07:1491-1965` and it moved during this
session, which is exactly why.

**Two ledgers make the price rules derivable rather than assertable.** `COMPARISONS` records every
numeric comparison the criteria and the ordering keys perform, with the **provenance** of both
operands; `STATEMENTS` records every claim the consultation makes. The rev-9 reference pass logs
**1,795 comparisons in 5 provenance shapes** and **826 statements** (43 distinct record-value
pairs). Both are frozen after the reference pass so property 4's mutants cannot pollute them.

---

## 3. The gaps (deliverable C): 5 at rev 9, 5 closed by rev 9

| # | rule | in one line | at rev 8 |
|---|---|---|---|
| 1 | `PB4` / ordering `07:1301-1308` | key (2)'s carve-out does not compose | was gap 7 — **survives**, and is now §18's `Q-29` |
| 2 | §14.3.1 `07:855` vs `07:863` | no rule gives a bare number a unit | was gap 4 — **survives**, and is now §18's `Q-31` |
| 3 | `GR3` `07:1302` vs `07:854` | key (3) has no defined count under two `WS6` readings | **NEW at rev 9** |
| 4 | `EF3` `07:970` | the ground-not-conclusion permission reads `Q_s` as one set; which sentence the reply may make depends on the reading | **NEW at rev 9** |
| 5 | §14.3.3 rows 4–8 + `CINV-17` `07:1032-1036`, `07:1434` | the row names a set of ids **in the reply** and reads `Q_s`/`Q_t` as one set | **NEW at rev 9** |

Gaps 3, 4 and 5 are **one family** — every in-force rule that still reads `V.scope` as a single set
after `D9-5a` made it one set per reading (§5b). They are listed separately because gaps 4 and 5
decide what the reply **asserts**, not merely what order it shows, and are emitted and counted
individually by the checker since round 10.

**Closed by rev 9** (the checker raises all five under `useRev(8)` and none at rev 9):

| rev-8 gap | closed by |
|---|---|
| `VB3` row 1: literal strings or forms? | `D9-4`(iii) — `07:890-894` decides: forms |
| `VB3` row 2: a quantity between the space and the 만 | `D9-4`(iv) — `07:896-900` decides: not a space restriction |
| `VB3` has no first-match rule | `D9-4`(i) — `07:875-878` |
| `WS6`'s tie-break has no discriminator (`B8-1`) | `D9-5a` — the tie-break is deleted, not repaired |
| `GR3a`'s whole-home rung carries a sixth ordering key | `D9-1` — the rungs are gone |

### Gap 3 — key (3) under two `WS6` readings (`07:1302` vs `07:854`) — **new at rev 9**

`D9-5a` changed `V.scope`'s **shape**: it now holds one candidate set **per reading** (`07:854`,
`07:350-356`). Tie-break key (3) at `07:1302-1305` still reads *"the count of the visitor's stated
`workScopeIds` the record carries"* as though there were one set. Under two readings there is no
such count: *"현관 수납"* gives `{entrance, storage}` under one reading and `{entrance}` plus trade
`{built_in_furniture}` under the other, and a record can carry a different number under each.

`EF3`'s ambiguity clause resolves the **criterion** and says nothing about the **ordering key**.
This is the same omission `D9-5a` fixed one level up, left behind one level down. The checker uses
the union and records it. Exposed by *"현관 수납"* and *"현관이랑 복도 수납"*.

This is a rev-9 regression in the strict sense: the rule that closed `B8-1` opened it.

### Gaps 1 and 2 are unchanged and are the contract's own `Q-29` and `Q-31`

Gap 1: key (2) says a record the key skips *"keeps the position the previous key gave it"*. The
previous key is (1), `GR2a`'s class order, which only ever produces **blocks of ties** — so the
position inside a block is fixed by keys (3)–(5), which come **after** (2). `07:1310-1312` now
carries this as `Q-29` and says plainly it is not patched. Agreed, and recorded.

Gap 2: `VB1` (`07:863`) gives `V.budget` an explicit *"cannot be resolved to one of the three is
absent, never guessed"* clause; `V.area` (`07:855`) has none, so the contract licenses neither
supplying a unit nor dropping the figure. Both units are run as branches and they give different
results — this is the **one** remaining undecided utterance at rev 9.

### Not fabricated: §18's `Q-26`

A chain mixing kinds under one 만 (*"바닥이랑 거실만"*) is a real, unanswered prose question at
`07:921-928`. This implementation chains only terms of the same kind (audit A-4), so row 3 wins and
**no output changes**. No gap is recorded for it. Fabricating one would misreport the checker's
reach.

---

## 4. The six property verdicts

> **Superseded as the headline by §5h.** This section records the **rev 9** verdicts and is kept
> because rev 9.1's changes are only legible against them. The in-force verdicts are §5h.4's.

Run with rev 9 as the default. The coordinator's expectation was that **properties 1, 3 and 4 change
materially** — they do, and property 3 changes the most.

| property | rev 8 | **rev 9** | verdict moved? |
|---|---|---|---|
| 1 totality / single-valuedness | FAIL, 3 findings | **FAIL, 3 findings** | **yes** — the two `VB3` findings are gone; `D9-5a` replaces them, plus 2 against the proposed `D9-7` |
| 2 dead branches | FAIL, 3 findings | **FAIL, 2 findings** | **yes** — **0 dead branches at rev 9** |
| 3 differential ordering | FAIL, 29 of 31 | **GAPS, 0 findings, 0 of 27** | **yes, decisively** |
| 4 `PB4` | FAIL, 546 of 893 strict | **FAIL, 45 findings; strict 0 of 798 HOLDS** | **yes** — 4b holds; 4a still fails |
| 5 `EF1` closure | FAIL, 2 findings | **FAIL, 2 findings** | no — and that is correct, see below |
| 6 §4.1 utterances | FAIL, 7 findings | **FAIL, 4 findings** | **yes** — 38 of 44 reproduced, **0 unrecorded** disagreements |

**Three of the rev-9 findings are not about rev 9 as written.** Property 1's two extra findings are
against the **proposed `D9-7`** (§5a); property 4's extra one is the contract's **non-existent named
residual** (§5c); property 6 gained the **gap-3 family** (§5b) and **`EF6` row 7's justification**
(§5d). Against rev 9 alone the counts are 1 / 2 / 0 / 44 / 2 / 2.

### Property 1 — totality and single-valuedness — **FAIL** (6 findings)

| table | inputs | no row | more than one row |
|---|---|---|---|
| `VB3` (`07:866-926`) | 26 utterances | 0 | overlaps remain, **all resolved by `07:875-878`'s first-match clause** |
| §14.3.3 (`07:1027-1036`) | 1,024 synthetic shapes | 0 | 240 — resolved by `PB7` (`07:1023`) |
| §14.3.3.1 (`07:1076-1081`) | 96 reached | 0 | 0 |
| `EF6` (`07:1180-1192`) | 336 raw cross-product | 0 | first-match violated 0 times |
| `GR3a` | **deleted at rev 9** | — | — |
| `CINV-21` (`07:1438`) | 81 permuted re-runs | — | 0 differed |

`D9-4` works: `VB3` is a function at rev 9. `GR2a` is a permutation of `GR2`'s closed list.

**The findings are all about the ambiguity clause**: one against `D9-5a` as written (§5, the answer
to the original obligation) and two against the proposed `D9-7` (§5a). Every other table at rev 9 is
total and single-valued.

### Property 2 — dead-branch detection — **FAIL** (2 findings), **0 dead branches**

56 discriminating predicates registered; **3 are constant, and all three are the table's own
unconditional row** (§14.3.4's `fallback` tier, `EF3`'s spaces half for a `full_remodel`, `EF6` row
8). **0 residual, 0 dead.**

At rev 8 this property found the two `WS6` predicates constantly false (`B8-1`) and one unreachable
table row. At rev 9 the `WS6` predicates **do not exist** — the rule was deleted, not repaired — and
the checker tags them `[REV 8 ONLY]` so they cannot raise a rev-9 finding. That distinction is
implemented (`observe()` carries per-revision counters and a `seenAtRev` set), not assumed.

The two remaining findings are both *"corpus-dead but synthetically reachable"*, which is a weaker
claim and is labelled as one:

| rule | citation | predicate | |
|---|---|---|---|
| §14.3.3 | `07:1029` | row 1 (`Q = ∅`) | never true on the 19 records; reachable synthetically. `EF3` (`07:952`) returns `not_applicable` **before** the table is consulted, so row 1 is unreachable from its only caller |
| §14.3.3.1 | `07:1078` | row 1 (`R_s = ∅`) | never true on the corpus. **Rev 9 says so itself** at `07:1083-1088` and keeps the row deliberately, with `INV-30` making the impossibility a producer-side check. Recorded, not held against the contract |

`WS8`'s branch is live (second consumer); `AR5`'s *"one basis unknown, still compare"* branch is
live.

### Property 3 — differential ordering — **FAIL** (3 findings), **0 of 27 branches** as written

At rev 8 the result order was computed twice from the same classes — once by `GR3`'s preamble, once
by `GR3a`'s rungs — and **29 of 31 branches ordered differently, 17 of them inside the top 3**. That
was `B8-2`.

At rev 9 the same differential is still run, and it is **0 of 27**. The reason is structural, not
lucky: `07:1258-1263` makes *"direct answers are offered first"* a **definition** over a named prefix
of `GR2a`, and `07:1268-1271` deletes the rungs. With one ordering device left, the preamble is a
partition of its output and **cannot** disagree with it.

**This is the cleanest fix in rev 9.** A `C: MUST` that was violated on 94% of branches is now true
by construction.

**The verdict moved from GAPS to FAIL in round 10, and not because rev 9 changed.** Two findings
attach, both about changes now proposed on top of rev 9 rather than about rev 9 as written — see
§5e.5 and §5e.6:

1. Adopting `PB4`'s carve-out on key (3) under the only reading `PB4` permits (**positional**,
   borrowed from key (2)) takes property 3 from **0 to 1 of 27**. A positional permutation is not
   stable under partitioning the row set, and `GR3`'s own *"direct answers first"* presentation
   partitions it. The reading that keeps it at 0 (`zero`) is the one `07:1133` forbids by name.
2. The carve-out **masks** ordering key (3)'s count rule: union → intersection moves 2 of 27
   branches with the carve-out off and **0** with it on.

A third finding attaches in round 10: `Q-29`'s candidate 3 reading is **intransitive**, with 72
cycles on the real corpus — see §5f.

Rev 9 **as written** remains **0 of 27**, re-measured from a clean baseline in §5g, and that number
is unchanged by any of the three.

### Property 4 — `PB4` (`07:1131-1150`) — **FAIL** (45 findings), but **4b HOLDS**

**4a, the deletion form.** Delete a price/area field, re-run, assert the record does not move down.

| field deleted | checked | moved **down** |
|---|---|---|
| `area` | 486 | **44** |
| `pricing.total` | 297 | 0 |
| `pricing.perArea` | 270 | 0 |
| total | **1,053** | **44** |

All 44 findings are `area` deletions, and all are on whole-home queries where removing the area
moves a record out of an evaluated class into a fallback one. The price arm carries no information
(`07:1308`: *"No key is a price"*) and is retained as a **control on the deletion mechanism**, not as
evidence — audit A-15, accepted.

**4b, the strict form — and it holds.** For each record and criterion, two mutants of the *same*
record, one driving criterion `c` to `not_evaluable` and one to `unsatisfied`, inserted into the
otherwise-unchanged corpus, ranks compared. No tolerance, no same-class relaxation. *"Otherwise
identical"* is enforced **including `|R_s|`**: the scope mutants give the `unsatisfied` twin a
disjoint id set of the same shape.

Every row below uses **the same 798 pairs** — rev 9's 27 branches over the 19 records — and varies
only the **rules**. That is what makes the rows comparable to each other.

| configuration | pairs | violations | rung / class |
|---|---|---|---|
| rev 8 as written | 798 | **484** | 262 / 222 |
| + `D9-2c` `EF3` states only | 798 | 488 | 262 / 226 |
| + `D9-2c` `EF3` + `EF6` row 7 | 798 | 488 | 262 / 226 |
| + `D9-2c` complete (`EF3`+`EF6`+`GR2a`) | 798 | 262 | 262 / **0** |
| **`D9-1` alone** (rungs deleted) | 798 | **624** | 0 / 624 |
| `D9-1` + `D9-2c` `EF3` + `GR2a`, no `EF6` row 7 | 798 | **0** | 0 / 0 |
| **rev 9 as written (`D9-6` entire)** | 798 | **0** | **0 / 0** |

**`PB4`'s strong form HOLDS at rev 9 on the real corpus, under the strict assertion.** `D9-1` alone
is **624**, worse than rev 8's 484 — `07:2555` warns of exactly this and the warning reproduces.
`D9-6` is indivisible and the measurement says so.

> **A correction the contract needs to make.** `07:999-1000`, `07:1143-1145` and `07:1241` state
> *"546 violations of 893 pairs"* for rev 8 and *"0 of 893"* for rev 9. That 893/546 came from my
> own earlier run, over rev 8's 31 branches **and with mutant twins that were not equal in `|R_s|`**
> — a construction defect I found and corrected afterwards. Under the corrected construction and
> rev 9's branch set, rev 8 is **484 of 798**. The rev-9 figure is **0** either way, so the
> contract's *conclusion* stands and its *rev-8 baseline* does not. Those three sites should say
> 0 of 798, or should not quote a rev-8 baseline at all.

Note also that the `D9-1 + D9-2c EF3 + GR2a, no EF6 row 7` row reaches 0 **without** row 7. Row 7 is
therefore not load-bearing for `PB4`; it is load-bearing for **disclosure**, which is what
`07:1203-1212` actually claims for it. Worth keeping the two justifications apart.

### Property 5 — `EF1` closure — **FAIL** (2 findings), and the `Q-32`/`AU-1` residue **confirmed**

Property 5 reads `07` itself and asks, of every rule in force that names a criterion state: does that
rule **assign** one, and is it `EF2`/`EF3`/`EF4`?

- **84 contract lines in force** name a criterion state; a further **26** are inside §17.1's
  deferred annex and are excluded (the annex is located by heading and is currently
  `07:1491-1965`).
- Attribution is to a **labelled rule**, never to a section heading. Lines that cannot be attributed
  are **reported** (6 of them: §15 ×1, §20.3 ×1, §20.4 ×1, §20.5 ×2, §20.7.3 ×1), not dropped.
- **Rules that assign: `EF2`, `EF3`, `EF4`. Offenders outside them: none.**
- Rules that name a state and explicitly **defer** the assignment: `EF4`, `WS7a`, `WS8`.
- **Negative control**: rev 7's `B-1` shape — a `WS8` that assigns the scope state itself — is run
  through the same scanner and is **CAUGHT**.

**Deliverable 4, answered: the `Q-32`/`AU-1` residue still holds under `D9-5a`.** `D9-5a` adds a new
path into `EF3` (the per-reading branch plus the ambiguity resolution), and the restructure was done
so that **`ef3Branch` assigns nothing** — the pure branch returns a state, and `EF3` makes the single
`assignState` call. Measured: **1,539 state assignments over 27 branches × 19 records, by
`{EF2, EF3, EF4}` and nothing else; 0 offenders.** The new path did not create a second assigner.

The two findings are therefore still about **naming**, exactly as before:

1. **`not_evaluable` names both a criterion state (`07:937`) and a match class (`07:1173-1175`).**
   `EF1`'s closure sentence (`07:941`) is about the state; `EF6` (`07:1185-1192`) assigns the class.
   Nothing in the contract distinguishes them by name. The checker resolves it by reading the
   **table header** — an occurrence in a table whose output column is headed `class` is a class —
   which works but means the distinction is carried by layout, not text. This is §18's `Q-32`.
2. **The contract writes an `EF6` condition and an `EF2` assignment in overlapping surface forms.**
   `07:1185` (*"scope is `unsatisfied`"*) is a **test**; `07:947-948` (*"`satisfied` iff …"*) is an
   **assignment**. The ambiguous form appears across 11 rule/section blocks. The checker excludes
   it from the assignment markers, counts the exclusion, and prints it.

**Verdict in one sentence: `EF1`'s closure holds as far as the text can be read, `D9-5a` did not
break it, and the text still cannot be read mechanically without two conventions the contract never
states.**

### Property 6 — the nine §4.1 utterances — **FAIL** (6 findings)

**38 of 44 stated claims reproduced. Of the 6 not reproduced, all 6 are RECORDED at `07:2674-2698`
(§20.7.5) as `04`/`18` edits rev 9 deliberately does not make. Unrecorded disagreements: 0.**
My own derivations (tagged `drv`, not claims of either document): 2 of 2.

That is the number that changed most at the document level. At rev 8 the row-I disagreements were
live findings; rev 9 wrote them down as known `04` debt, so the checker now prints them as RECORDED
and does not raise them. The checker holds a map from each disagreement to the §20.7.5 item that
records it, so a disagreement rev 9 *forgot* to record would still be raised.

| row | verdict |
|---|---|
| A, B, C, F, H | agree |
| D1 / D2 *"욕실 하나만"* | `bi-01` derives `exact` where `18` states `fallback_from_full` — **RECORDED**, §20.7.5 item 1: `04` row D is stated on the reading `D9-4` rejects |
| E *"전용 84 아파트 주방"* | **2 branches** (gap 2) and they differ — the one undecided utterance left. `04:697`'s negative half runs and holds |
| G | head of result: stated `bi-19`, derived `bi-09` — **RECORDED**, item 2: *"reached on `GR3`'s trade rung"* names machinery `D9-1` deleted |
| I *"현관 수납"* | three disagreements, **all RECORDED** (items 3 and 8) |

**Row I is the one to read.** `D9-5a` carries both readings and `EF3` resolves them, so `bi-18`
derives `not_evaluable` — and that **reproduces the contract's own worked example at `07:358-364`
exactly**, including which §14.3.3 rows fire under each reading. The rule and its example agree,
which is not something earlier rounds could say.

The four findings are row E's undecided branches, the spec-vs-data `perArea` disagreement (§1), the
**gap-3 family** (§5b) and **`EF6` row 7's misstated justification** (§5d). The last two are about
the contract's text rather than about a §4.1 row, and are filed here because that is where the
checker raises document-level disagreements.

---

## 5. `D9-5a`'s unmet obligation (deliverable 2): **TOTAL holds, SINGLE-VALUED fails**

> **Superseded by rev 9.1.** `D9-5a` is replaced by `D9-7a` (`07:1008-1036`), which is total AND
> single-valued — verified in §5e.1 and re-run at rev 9.1 in §5h.2. This section is the measurement
> that motivated the replacement and is kept for that reason; the defect it records is **not** a
> defect of the revision in force.

`07:2720-2723` (§20.7.6) records that `22-rev9-design.md` §5 requires a mechanical assertion that
*"`EF3` under multiple readings is total and single-valued"* — that *"the readings agree"* is
decidable for every record — and that **the assertion does not exist**. It is implemented here, over
the ambiguity clause's own two bullets (`07:982-991`).

| | corpus (38 multi-reading pairs) | synthetic (all 64 ordered pairs of `EF3` outcomes) |
|---|---|---|
| neither bullet holds (**not total**) | **0** | **0** |
| **both** bullets hold (not single-valued across bullets) | **2** | **18** |
| bullet A via *same state* while relations differ | 0 | 12 |
| bullet A via *same relation* while states differ | **2** | 6 |

**RESULT: `TOTAL` HOLDS. `SINGLE-VALUED` FAILS. `D9-5a` is wrong as written.**

**The mechanism, and it is reachable on the real corpus and not only synthetically.** Bullet A
(`07:984-985`) fires when *"all readings give the same relation, **or** all give the same state"*,
and bullet B (`07:986-987`) fires when *"the readings differ"*. These are not exclusive:

- Bullet A's first arm — *"all readings give the same relation"* — is **vacuously true whenever no
  reading produces a relation at all**. That is every `full_remodel` record (`07:954-966`) and every
  breadth-absent one (`07:979-980`): those branches return a state and **no relation**.
- So for a `full_remodel` whose **trades** half differs between the readings, bullet A fires on
  *"same relation"* (both `(none)`) and its consequent — *"that relation and that state"* — has **no
  single state to name**, while bullet B fires too and says `not_evaluable`. Two `C: MUST`
  consequents, opposite, no evaluation order.
- Symmetrically, 12 of the 64 synthetic pairs satisfy bullet A via *same state* with **different
  relations**, so *"that relation"* names none.

**Witness on the corpus**: `bi-11` (`full_remodel`, `R_t` does not carry `built_in_furniture`)
against *"현관 수납"* — reading `{entrance, storage}` gives `satisfied`, reading `{entrance}` +
`{built_in_furniture}` gives `not_evaluable`. Also `bi-11` on *"현관이랑 복도 수납"* (4 readings).

**This is the same defect `D9-4` fixed in `VB3` one section earlier.** `07:875-878` added
first-match-wins to `VB3` precisely because *"the rows overlap and one utterance yields two opposite
values"*. `07:982-991` has overlapping bullets with opposite consequents and **no** such sentence.
`PB7` (`07:1023`) and `EF6` (`07:1180`) both carry one. The ambiguity clause is the only table-like
rule in the contract that does not.

**The repair is one sentence**, and rev 9 already knows how to write it: make the bullets ordered
(bullet B first — *"the readings differ ⇒ `not_evaluable`"* — with bullet A as the else), or make
bullet A's first arm non-vacuous (*"all readings produce a relation and it is the same"*). Either
closes it. Which one is a decision, because they differ on the case where both readings return
`satisfied` with no relation: ordered-B makes it `not_evaluable`, non-vacuous-A makes it `satisfied`.

**This needed to be known before round 9, and it is.**

---

## 5a. `D9-7` — round 9's decision, implemented and attacked

> **Superseded by rev 9.1.** `D9-7` was not adopted; `D9-7a` was, and it closes both holes this
> section constructs — both witnesses now resolve to `not_evaluable` with the ambiguity disclosed
> (§5e.1). Kept as the attack that produced `D9-7a`.

`D9-7` replaces `D9-5a`'s two bullets with two ordered rules: (1) readings produce different
criterion **states** ⇒ `not_evaluable`, disclosed; (2) otherwise ⇒ that state, and where they also
agree on a relation, that relation. It is behind `CFG.ef3Ambiguity = "D9-7"`; `D9-5a` stays the
default so both remain runnable.

### The clause itself: **`D9-7` clears the finding.**

| | synthetic (64 ordered pairs) | corpus (38 multi-reading pairs) |
|---|---|---|
| neither rule fires (**not total**) | **0** | **0** |
| **both** rules fire (**not single-valued**) | **0** | **0** |

**TOTAL: HOLDS. SINGLE-VALUED: HOLDS.** The rationale is right, and it is arithmetic rather than
luck: rule 2's condition is rule 1's exact negation, so no input can match both or neither. The
`bi-11` witness that broke `D9-5a` has states `satisfied` vs `not_evaluable`, which differ, so rule
1 fires and no appeal is made to a relation that does not exist. **Property 1's `D9-5a` finding
clears.**

### Nothing on the corpus regressed

| property | under `D9-5a` | under `D9-7` |
|---|---|---|
| branches | 27 | **27** |
| 1 — corpus records with no `EF6` class | 0 | **0** |
| 3 — branches whose two orderings differ | 0 of 27 | **0 of 27** |
| 4 — strict `PB4` | 0 of 798 | **0 of 798** |
| 5 — states assigned only by `EF2`/`EF3`/`EF4` | yes | **yes** |
| derived order vs `D9-5a` | — | **0 branches differ, 0 class changes** |

`PB4` stays at 0 and property 3 stays at 0, so this is not a fix that clears one property by
breaking another.

### But it is incomplete one level down, and here is the attack you asked for

Rule 2 says *"where they **also** agree on a relation, that relation"* — so when the states agree
and the **relations differ**, it returns a state with **no relation**. That happens on **8 of the 20**
reachable rule-2 pairs. `EF6` then has two problems, both derived, not argued:

**1. `EF6` loses totality.** Row 1 (`07:1185`) classes an `unsatisfied` scope **as** *"the §14.3.3
relation"* — the relation `D9-7` just discarded. **96 enumerated `EF6` inputs get a class that is
not one of `GR2`'s ten.** End-to-end witness, run through the real pipeline:

> record `zz-hole` — `partial_remodel`, `workScopeIds [storage, kitchen]`, utterance *"현관 수납"*.
> Readings: `{entrance, storage}` → `scope_overlap`; `{entrance}` + `{built_in_furniture}` →
> `scope_disjoint`. **Both `unsatisfied`**, relations differ ⇒ rule 2 gives `unsatisfied` with no
> relation ⇒ **`EF6` row 1 fires and returns class `null`.** The record has no class, so `GR2a`
> cannot order it and `EF1`'s closure has nothing to close over. `CINV-20`'s primary claim
> (`07:1437`) fails.

**2. The `scope_superset` caveat goes silent.** **32 enumerated inputs** where a `scope_superset`
reading existed and the class is not `scope_superset`. End-to-end witness:

> record `zz-witness` — `partial_remodel`, `workScopeIds [entrance, storage, built_in_furniture]`,
> same utterance. Readings give `scope_exact` and `scope_superset`, **both `satisfied`** ⇒ rule 2
> gives `satisfied` with no relation ⇒ row 7 cannot fire ⇒ **class `exact`**, which `07:1192` and
> `07:1209` define as *"nothing was caveated"*. `D9-5a` returned `not_evaluable` **and disclosed the
> ambiguity**; `D9-7` discloses nothing and asserts an exact match.

Both records are authorable under `PT5` and are absent from the 19 only by accident, which is why
the corpus shows 0 and the enumeration shows 96 and 32.

### `D9-7` needs a third sentence

Two candidate repairs, and they are not equivalent:

- **Widen rule 1** to *"different states **or** different relations ⇒ `not_evaluable`"*. Restores
  `EF6`'s totality and keeps the disclosure. Closest to `D9-5a`'s intent, and it makes `D9-7`
  strictly a clarification of it rather than a change of policy.
- **Keep rule 2 and make it carry a relation** when the state is `unsatisfied` — but then the rule
  must say **which** relation, and picking one is choosing a reading, which `07:350-356` forbids.

The first is the only one that does not reintroduce the thing `D9-5a` exists to prevent.
**Recommendation: adopt `D9-7` with rule 1 widened to cover relations.** Nothing in the corpus
measurements changes; the enumeration's 96 holes and 32 silent caveats go to zero by construction,
for the same reason the clause is total — the two conditions stay exact negations.

---

## 5b. Gap 3 is a **family**, and it is live on this corpus (deliverable 3)

> **Closed by rev 9.1.** All three sites of the family are now decided: ordering key (3) by `D9-8`,
> the ground-not-conclusion clause and the §14.3.3 row disclosures by `D9-9`. This section is the
> evidence that the family existed and that its three members needed different fixes.

### Key (3) has five implementable readings and the contract picks none

`07:1304-1305`'s key (3) — *"the count of the visitor's stated `workScopeIds` the record carries"* —
reads `V.scope` as one set, which `D9-5a` stopped it being. Measured over the 27 branches (2 of
which have more than one reading):

| reading | branches whose order changes vs `union` |
|---|---|
| `union` (in force here) | — |
| `max` (best reading per record) | 0 |
| **`intersection`** | **2 of 27** |
| `min` | 2 of 27 |
| `pb4skip` | 2 of 27 |

**Gap 3 is observable, not latent.** On *"현관 수납"*: `intersection` moves `bi-06` 11→8, `bi-18`
8→9, `bi-02` 9→10, `bi-05` 10→11; `pb4skip` moves seven records. `union` and `max` coincide only
because the union's extra ids sit on records that already win the count — a property of these 19
records, not of the rule.

**Recommended reading: `intersection`** — the ids **every** reading admits. It is the only candidate
that is a function of `Q` alone and independent of which reading is taken, which is `07:350-356`'s
whole point. `max`/`min` choose a reading **per record**, which is what `WS6` forbids and what
`M7-3` was about. `union` credits a record for an id the visitor may not have said: for *"현관 수납"*
it counts a record carrying `built_in_furniture` as though the visitor asked for it, when they said
one word meaning `storage` **or** `built_in_furniture`, not both. *"The visitor's **stated**
`workScopeIds"* are exactly the ids common to every reading. Union = 3, intersection = 1.

**And an addition, not an alternative: `pb4skip`.** `PB4` (`07:1131-1133`) says a criterion in state
`not_evaluable` contributes to **no** tie-break key. A record the ambiguity made `not_evaluable` is
exactly that, so key (3) must not order it at all — and then key (2)'s carve-out decides where it
lands, which is **gap 1 / `Q-29`**, still unresolved. **So gap 3 does not close independently of
gap 1.**

> **Superseded in round 10 on two counts, both in my favour and both against my numbers.** The
> `pb4skip` row above says **2 of 27**; that under-applied `PB4`, which mentions no ambiguity — the
> skip belongs to **every** `not_evaluable` scope. Applied as written it is **10 of 27** and 7
> mixed `GR2a` class blocks. And the carve-out turns out to **mask** the count rule entirely on
> this corpus, so the `intersection` row's 2 of 27 is not evidence for adopting it once the
> carve-out is in force. See §5e.5 and §5e.6.

### It is a family of three, and the other two are worse

Every in-force site that reads `V.scope`, checked against the contract text:

| site | verdict | why |
|---|---|---|
| `EF3` (`07:952-1009`) | **safe** | computes per reading by construction |
| §14.3.3 / §14.3.3.1 tables | **safe** | read `Q_s`/`Q_t` as one set, but `EF3` calls them **once per reading**, so they inherit the discipline |
| ordering key (3) (`07:1304-1305`) | **broken** | gap 3 — no count is defined |
| **`EF3`'s ground-not-conclusion clause (`07:970`)** | **broken** | *"unless `Q_s ⊆ R_s` **also** holds, in which case either may be stated"* — a `C: MUST` on what the **reply** may say, keyed on `Q_s`, with no reading named |
| **§14.3.3 rows 4/6/7/8 + `CINV-17` (`07:1032-1036`, `07:1434`)** | **broken** | mandate naming `Q_s \ R_s` and `Q_t \ R_t` as *"not remodelled"* / *"not established"* — both differ between readings |

Measured on the corpus, over the 2 multi-reading branches × 19 records:

- **10** `full_remodel` (record, branch) pairs where `Q_s ⊆ R_s` **differs between readings**, so
  `07:970`'s permission to state the stronger sentence is reading-dependent (e.g. `bi-01`, `bi-09`
  on *"현관 수납"*).
- **14** `partial_remodel` pairs where `Q_s \ R_s` differs, so the spaces `CINV-17` requires be
  **named** are reading-dependent (e.g. `bi-04` → `{entrance, storage}` vs `{entrance}`; `bi-06` →
  `{storage}` vs `{}`). **Superseded in round 10: use 10, not 14.** This figure counts pairs where
  `Q_s \ R_s` differs *without* asking whether a row that **names** that set actually fires — rows
  3 and 5 and the trade-only table §14.3.3.1 do not. The checker now **emits** the disclosures and
  counts the ones really made: **10**. See §5e.2.

**The last two are worse than the ordering one**: they decide what the reply **asserts** about a
record, so a reading-dependent answer is a reading-dependent **truth claim** — which is what `WS7a`
and `CINV-17` exist to prevent. Gap 3 should be filed as three items, and the disclosure pair should
outrank the ordering one.

---

## 5c. The corrected figures, complete (deliverable 4)

Every daggered site, with its replacement. The checker prints this block with **line numbers
resolved from the contract's own text at run time**, so it stays correct as the file moves.

**Methodology, stated once.** Every row below uses **the same 798 mutant pairs** — rev 9's 27
branches over the 19 records — and varies only the **rules**. The contract's 893 was over rev 8's 31
branches *and* with mutant twins **not equal in `|R_s|`**, so rev 8's *"larger `R_s` first"*
sub-rung was deciding comparisons the criterion should decide. Both defects are mine and both are
corrected here.

| site | states | **corrected** |
|---|---|---|
| `07:999`, `07:1143`, `07:1145`, `07:1241`, `07:2076`, `07:2712` | 893 pairs / 546 at rev 8 | **798 pairs / 484** at rev 8; rev 9 **0 of 798** |
| `07:1280`, `07:1992` | 299 of rev 8's 546 were the rungs | **262 of 484** |
| `07:2598` | *"D9-1 alone … 687 against 546"* | **624 against 484** — the **claim survives**, only the numbers move |
| `07:2601` | *"D9-2c alone leaves all 299"* | **262** |
| `07:2608` | property 3 *"29 of 31 → 0 of 31"* | **29 of 31 at rev 8 → 0 of 27 at rev 9** (confirmed: 31 and 27) |
| `07:1437` | `CINV-20` pass A pending | **unchanged at 100 of 192, now verified**; pass B **384 → 336** |

**The decomposition table at `07:2587-2596`, replaced wholesale.** Row labels are the contract's
own; row B is added because *"`EF6`'s new row alone"* cannot mean the row without `EF3`'s state
change — row 7 needs scope `satisfied` **and** relation `scope_superset`, and only `EF3`'s change
produces that pair.

| configuration | pairs | violations | rung / class |
|---|---|---|---|
| A rev 8 as shipped | 798 | **484** *(was 546)* | 262 / 222 *(was 299 / 247)* |
| B `D9-2c` `EF3` state change alone | 798 | 488 | 262 / 226 |
| C `EF6`'s new row alone (needs B) | 798 | **488** *(was 550)* | 262 / 226 |
| D `D9-2c`'s `GR2a` order alone | 798 | **262** *(was 299)* | 262 / 0 |
| E `EF6` row + `D9-2c` order | 798 | **262** *(was 299)* | 262 / 0 |
| F **`D9-1` alone** | 798 | **624** *(was 687)* | 0 / 624 |
| G `D9-1` + `EF6` row | 798 | **630** *(was 691)* | 0 / 630 |
| H `D9-1` + `D9-2c` order (no `EF6` row) | 798 | **0** *(was 1)* | 0 / 0 |
| I **rev 9** (`D9-1` + row 7 + order) | 798 | **0** | 0 / 0 |

### Two things the corrected methodology moves that were not on your list

1. **`07:2602-2606`'s named residual does not exist.** The contract builds a paragraph on *"the
   single violation that survives `D9-1` + `D9-2c`'s order **without** `EF6`'s new row"* — criterion
   `breadth`, `bi-13`, *"창호 교체하려는데 34평 전체 리모델링"*, `not_evaluable` at position 6 against
   `unsatisfied` at position 2 — and calls it *"the thesis reproduced on the corpus"*. **Row H has 0
   violations.** There is no such record. It was an artefact of the unequal-`|R_s|` twins. **Delete
   the paragraph, and with it the inference that `EF6` row 7 is needed to reach zero.**
2. **Row H = 0 withdraws the `PB4` argument for `EF6` row 7** — see §5d.

---

## 5d. `EF6` row 7: the right justification, and the wording problem (deliverable 5)

**Not load-bearing for `PB4`.** Configuration H reaches **0 of 798 without row 7**. So `07:1241` and
`07:1229`'s successor must stop listing it among the parts that *"together reach 0"*.

**Load-bearing for disclosure, and here is the measurement that says so.** Delete row 7 at rev 9 and
re-derive the corpus: **16 (record, branch) classifications change, and all 16 go from
`scope_superset` to `exact`** — a record that did **more** than the visitor asked, relabelled
*"nothing was caveated"* (e.g. `bi-04` and `bi-16` on *"주방만 하면 얼마예요"*, `bi-04` on
*"욕실 하나만"*). That is `OD-P`'s *"a fallback is never passed off as exact"* violated 16 times, and
`GR2` losing the only class that names the caveat. **It is a `GR2`/`OD-P` argument end to end and
needs no `PB4` in it.**

**The wording problem, precisely, so it can be fixed in one edit:**

1. **`07:1203` *"its position is load-bearing"* runs two claims together.** The row's **existence**
   is load-bearing for **disclosure** (the 16 above). Its **position** — after row 6, before row 8 —
   is load-bearing for **which disclosure wins when two compete**, which is what `07:1206-1209`
   actually argues. Neither is load-bearing for `PB4`. Write: *"the row is required for disclosure;
   its position decides which disclosure outranks which."*
2. **`07:1205-1206` *"Row 7 gives it back its own class and its own label"* is unqualified and holds
   for a minority.** Over `CINV-20`'s 1,512-input pass A, 48 inputs reached `scope_superset` at
   rev 8 and **20** do at rev 9. The other 28 hit rows 2–6 first and are labelled
   `breadth_fallback`, `area_fallback` or `not_evaluable` — which `07:1206-1209` **intends**. The fix
   is a qualifier, not a redesign: *"gives it back its own class **whenever no stronger caveat
   applies** — over the enumerated input space, 20 of the 48 inputs that reached it at rev 8; the
   remaining 28 carry a caveat rows 2–6 rank above it."*
3. **Do not write "42%" as a property of the rule.** It is a property of `CINV-20`'s enumeration,
   which weights inputs uniformly and is not a traffic model. State the two counts and the
   enumeration they come from, or state nothing quantitative. This is the overclaim to avoid.
4. **The row-7 paragraph must not cite the `PB4` table at all**, since the rows that were its
   evidence (`07:2595-2596`) are withdrawn.

---

## 5e. Round 10's adopted combination, measured as **one** change

> **Adopted as rev 9.1**, minus `PB4`'s carve-out, which stays out. The three changes this
> section measures as a proposal are now the default; §5h re-runs everything against them as
> in-force text. Two things here are still live and not repeated in §5h: the **ladder** showing
> which change moves which column, and the proof that the count rule is **load-bearing on inputs
> this corpus does not contain** — which is why `D9-8`'s ground must be the derivation and not a
> corpus figure. Item 4's finding (asserting less can be *wrong*) is **closed** by `D9-9`
> sentence 4; see §5h.3, where it is re-run through the in-force rule rather than argued.

All four decisions are implemented behind `useCombination()` and run **together**, because three
individually-sound fixes can still interact. Checker section `(i)`.

| configuration | branches | no-class | prop 3 | `PB4` strict | by-reading | silent |
|---|---|---|---|---|---|---|
| rev 9 as written | 27 | 0 | 0 | 0 of 798 | 20 | 0 |
| `+ D9-7a` alone | 27 | 0 | 0 | 0 of 798 | 20 | 0 |
| `+` intersection key (3) alone | 27 | 0 | 0 | 0 of 798 | 20 | 0 |
| `+` disclosure intersection alone | 27 | 0 | 0 | 0 of 798 | **0** | 0 |
| `+` `PB4` carve-out (`position`) | 27 | 0 | **1** | 0 of 798 | 20 | 0 |
| `+` `PB4` carve-out (`zero`) | 27 | 0 | 0 | 0 of 798 | 20 | 0 |
| **all four (`position`)** | 27 | 0 | **1** | **0 of 798** | **0** | 0 |
| **all four (`zero`)** | 27 | 0 | 0 | **0 of 798** | **0** | 0 |

`by-reading` = disclosures whose sentence was decided by **picking a reading**. It is the column
that matters: *"the readings disagree about this record"* is a property of the input that no rule
change can move, and I reported that number last round by mistake.

### 1. `D9-7a` holds, and it closes both holes by construction

Synthetic, 64 ordered pairs: **0 match neither rule, 0 match both.** Corpus, 38 pairs: **0 and 0.**
Downstream, the enumeration that found `D9-7`'s holes now finds none: of 62 reachable outcome pairs,
12 reach rule 2 and **0** of those return a state with no relation (`D9-7` had 8). `EF6` inputs with
no class: **0**. Caveats silently lost: **0**.

Both constructed witnesses now resolve correctly:

| record | per-reading `EF3` | `D9-7` gave | `D9-7a` gives |
|---|---|---|---|
| `zz-hole` `[storage, kitchen]` | `unsatisfied/scope_overlap` and `unsatisfied/scope_disjoint` | class `null` | `not_evaluable`, **ambiguity disclosed** |
| `zz-witness` `[entrance, storage, built_in_furniture]` | `satisfied/scope_exact` and `satisfied/scope_superset` | class `exact`, caveat lost | `not_evaluable`, **ambiguity disclosed** |

### 2. `D9-7a` closes **neither** disclosure site — I predicted it would close one and was wrong

| site | rev 9 as written | under `D9-7a` |
|---|---|---|
| `07:1032-1036` row disclosures | 10 | **10** |
| `07:970` ground permission | 10 | **10** |

I expected rule 1's *"no relation is reported"* (`07:987`) to make the row disclosures unreachable.
It does not, and the reason is the shape you named: **the survivors are exactly the pairs whose
readings AGREE on the relation and still differ on `Q_s`.** Rule 2 passes the relation through, the
row fires on it, and the row names a set built from `Q_s`. Witnesses: `bi-04`, `bi-14`, `bi-15` on
*"현관 수납"* — row 8 `scope_disjoint` under both readings, naming `{entrance, storage}` or
`{entrance}`.

`07:970` is worse. It is keyed on **no relation at all** — a `full_remodel` never has one — so
*"no relation is reported"* misses it, and rule 1's other guarantee, *"no absence is stated"*,
misses it too, because the sentence `07:970` licenses is a **presence**
(*"주방이 포함되어 있습니다"*). **The intersection rule is required for both sites.**

**Correction to my own figure.** I reported 14 reading-dependent row disclosures. That counted
`(record, branch)` pairs where `Q_s \ R_s` differs, without asking whether a row that **names** that
set actually fires — rows 3 and 5 and the trade-only table §14.3.3.1 do not. Emitting the
disclosures and counting the ones really made gives **10**. Use 10.

### 3. What the intersection rule changes, and a trap in how it is worded

**Row disclosures: 10 change.** All the same kind — `현관 수납/bi-04`, `bi-14`, `bi-15` and the rest,
row 8 `scope_disjoint`, `{entrance, storage}` → `{entrance}`.

**`07:970` permissions: 0 change — and that zero is a trap, not a reassurance.** `07:970` names no
reading, so an implementation must pick one; this checker picks the **first**, and `WS6` happens to
enumerate the larger `Q_s` first. `Q_s ⊆ R_s` is hardest for the largest `Q_s`, so reading 1 already
answers `false` wherever the readings disagree — the same answer the intersection gives. **Resolve
by the last reading instead and 10 of 10 flip.** The as-written clause agrees with the intersection
rule on this corpus *only because of the order `WS6` lists readings in*, and nothing in `07:970` or
`07:346-384` makes that order normative.

**The wording trap — `"only the ids every reading admits"` has two non-equivalent readings.**

- **intersect `Q` first**, then subtract, or
- **intersect the disclosure sets** — compute what each reading would name, then take the common ids.

For rows 4, 6, 7, 8 they coincide, because the set has the form `Q \ R` and the record's side is
fixed. **Row 5 separates them**, and in the dangerous direction: it names `R_s \ Q_s`, the record's
**extra** spaces, so shrinking `Q_s` **grows** it. `R_s \ (∩Q_s)` is the **union** of the
per-reading disclosures — the maximal claim — while `∩(R_s \ Q_s) = R_s \ (∪Q_s)` is the minimal
one. Row 5 never fires reading-dependently on these 19 records, so the witness is constructed:
`partial_remodel [entrance, storage, kitchen]` against *"현관 수납"* is `scope_superset` under
**both** readings, so `D9-7a` passes it through; intersecting the disclosure sets names
`{kitchen}`, intersecting `Q_s` names `{storage, kitchen}` — and `storage` is an "extra space we
covered beyond your request" that is true under **one reading only**.

**So write the rule over the disclosure sets: *a disclosure names `∩_r` (the set the row would name
under reading `r`)*.** Not over `Q`.

### 4. Asserting less **can** be wrong, and `D9-7a` does not catch it

The intersection can never name the **wrong** id — every id it names is named under every reading —
so its only failure mode is naming **too few**. The limiting case is different in kind: naming
**none** where some reading names one.

**Why that is wrongness.** §14.3.3's rows 6, 7 and 8 fire **because** `Q_s \ R_s` is non-empty —
that is their condition. The reply then announces a class (`scope_overlap`, `scope_disjoint`) which
tells the visitor spaces they named were not covered, and names none of them. `CINV-17` governs the
**wording** of that sentence and says nothing about its **membership**, so nothing in the contract
forbids the empty one.

**Unreachable here, and for a reason that is a theorem, not luck: 0 occurrences.** `WS6`'s two
readings are **nested** — reading 2 reclassifies one token from Space to Work, so `Q_s(2) ⊆ Q_s(1)`
— which makes the intersection equal to the smaller `Q_s`, and a row 6/7/8 relation firing under
that reading already guarantees its own `Q_s \ R_s` is non-empty.

**Not safe in general.** `WS6` is a rule about **one token pair**; a future ambiguous term whose
readings are **not nested** breaks the argument at once. Constructed: a term reading as `kitchen`
**or** as `bathroom`, against `partial_remodel [living_room]` — both readings give
`scope_disjoint`, so `D9-7a` rule 2 passes the relation through, and the intersection of
`{kitchen}` and `{bathroom}` is **empty**.

**Recommended fourth sentence:** *if the intersection is empty and any reading's set is not, the
criterion is `not_evaluable` and the ambiguity is disclosed* — `D9-7a` rule 1's remedy, applied at
the disclosure level, where `D9-7a` cannot see.

### 5. `PB4`'s carve-out: confirmed, larger than I said, and it has **no free reading**

**Correction to my own figure, again.** I said `pb4skip` moves **2 of 27** branches. That
under-applied it: I had the skip inside the multi-reading arm, so a record whose scope is
`not_evaluable` for any **other** reason — `WS8` dropped an id, breadth absent, no §14.3.3 row — was
still ordered by key (3). `PB4` says a `not_evaluable` criterion enters **no** tie-break key, full
stop; ambiguity is not mentioned. Applied as written it moves **10 of 27** branches and produces
**7** `GR2a` class blocks that mix skipped and ordered records (28 skipped records) — each one an
instance of `Q-29`. **Gap 3 is coupled to gap 1 far more tightly than 2 branches suggested.**

**And the carve-out breaks property 3.** Key (3) carries **no** carve-out sentence of its own at
`07:1304-1305`, so the only available reading is the one borrowed from key (2): *"keeps the position
the previous key gave it"*. Under that **positional** reading key (3) is not a sort — it permutes
the keyed records among the slots they already occupy — and **a positional permutation is not stable
under partitioning the row set**. `GR3`'s *"direct answers first"* presentation partitions it. So
property 3 goes **0 → 1 of 27**:

> *"바닥이랑 거실만"*, identical for 10 positions, then `GR2a` alone gives `bi-09, bi-10, bi-11, …`
> and direct-answers-first gives `bi-09, bi-11, bi-10, …` — `bi-10` (`fallback_from_full`, scope
> `not_evaluable`, **skipped**) swapping with `bi-11` (`fallback_from_full`, scope `satisfied`,
> **keyed**). No class changed; only the slot arithmetic did.

**The reading that keeps property 3 at 0 is the one `PB4` forbids by name.** `07:1133`: *"Not a
penalty, not a small penalty, **not a null that sorts last**."* The `zero` reading orders a skipped
record with a count of 0 — after every record that carries an id — which is a null that sorts last
in those exact words. **So the carve-out has no free reading: `position` breaks property 3, `zero`
contradicts `07:1133`.** `Q-29` has to be decided **before** the carve-out is adopted, not after.

### 6. The interaction test — and the one real interaction

Per metric, baseline → each change alone → combined vs composed:

| metric | base | alone (`D9-7a`/inter/disc/carve) | combined | composed | verdict |
|---|---|---|---|---|---|
| no-class | 0 | 0/0/0/0 | 0 | 0 | as composed |
| prop 3 | 0 | 0/0/0/**1** | 1 | 1 | as composed |
| `PB4` | 0 | 0/0/0/0 | 0 | 0 | as composed |
| by-reading | 20 | 20/20/**0**/20 | 0 | 0 | as composed |
| silent | 0 | 0/0/0/0 | 0 | 0 | as composed |

No column interacts, and branch-order moves compose exactly (10 alone, 10 together, 0 disagreements).

**But the scalar table cannot see the one pair that is not disjoint**: the count rule and the
carve-out **both edit key (3)**. As a 2×2:

| | carve-out OFF | carve-out ON |
|---|---|---|
| union → intersection | **2 of 27** move | **0 of 27** move |

**The carve-out subsumes the count rule on this corpus.** Every branch where union vs intersection
mattered is a multi-reading branch, and on those the records whose counts differ are exactly the
ones the ambiguity leaves `not_evaluable` — which the carve-out then removes from key (3) entirely.

**Do not read that as "the count rule is unnecessary."** It is unobservable here, not inert. A
record whose readings **agree** on the relation keeps a `satisfied`/`unsatisfied` scope, is **not**
skipped, and still carries a different count under each reading. `bi-04`/`bi-14`/`bi-15` are that
shape for the *disclosure* but are tied on key (3) only because, being `scope_disjoint`, they carry
neither `entrance` nor `storage` and both readings count 0. One record that does carry one
separates them — and it is the same record as the row-5 witness:

> `zz-count`: `partial_remodel [entrance, storage, kitchen]` on *"현관 수납"* → `scope_superset`
> under **both** readings, so `D9-7a` leaves the scope `satisfied` and the carve-out does **not**
> skip it. Key (3) counts **2** under reading 1 and **1** under reading 2; union 2, intersection 1.

**So the contract must not cite a corpus measurement as the ground for the intersection reading.**
Its ground is the derivation you already gave: it is the only count that is a function of `Q` alone.

### 7. `CINV-20` and `EF1` under the combination

- **`CINV-20` pass B: 336 evaluations, 0 with no row, 0 where the returned row was not the lowest
  holding, 10 of 10 classes reachable.** Identical to §6's rev-9 figures, as it must be: `D9-7a`
  changes which state `EF3` assigns, never `EF6`'s rows.
- **On the real corpus under the combination: 10 of 10 classes reached, 0 outside `GR2`'s closed
  list.**
- **`EF1` closure: 1,539 criterion-state assignments, 0 made outside `EF2`–`EF4`.** `D9-7a` changes
  the value `EF3` assigns, not who assigns it; `ef3Branch` stays pure and the single `assignState`
  call stays in `EF3`.

### Summary of §5e for the contract

| decision | verdict |
|---|---|
| `D9-7a` | **Adopt.** Total, single-valued, both holes closed by construction. |
| key (3) `intersection` | **Adopt** — but on the derivation, not on the 2 branches, which the carve-out masks. |
| disclosure intersection | **Adopt, worded over the disclosure sets**, not over `Q`. Row 5 is the witness. Needs a **fourth sentence** for the empty-intersection case. |
| `PB4` carve-out | **Do not adopt.** Now **three** dead readings: `position` breaks property 3, `zero` contradicts `07:1133`, `fallthrough` is intransitive (§5f). A fourth shape exists and is unexamined. |

---

## 5f. `Q-29`: candidate 3 is **intransitive**, and the corpus exhibits it

> **Unchanged at rev 9.1.** `Q-29` is still open (`07:2185`), the contract now records all three
> dead candidates, and the carve-out is in no configuration's default. The fourth reading stays
> unmeasured; §5h.8 says why and what I would want measured first.

Checker section `(j)`. Tested **before** anything else, because a rule that is not an order makes
every property-3 result built on it meaningless.

**Candidate 3** (coordinator's, stated as a candidate): *a key on which either record is
`not_evaluable` is skipped, and the comparison falls through to the next key.* No position, no
null, no zero — the criterion contributes nothing, literally.

**Asymmetry holds**: 0 of 9,234 ordered corpus pairs where `cmp(a,b) ≠ −cmp(b,a)`. That much is
fine.

**Transitivity does not.**

| enumeration | triples | cycles |
|---|---|---|
| real corpus, 27 branches × 19 records | 156,978 | **72**, on **6 of 27** branches |
| synthetic: 27 shapes (3 area × 3 scope × 3 `publishedAt`), one class, 6 id permutations | 118,098 | **36** distinct cycle shapes |

**All 72 corpus cycles have their three records in one `GR2a` class**, so key 1 decides none of the
three pairs. The first, hand-checkable:

> *"34평 전체 5천이면 되나요"*, class `breadth_fallback`:
> - `bi-04` — `|delta| 0.0588`, `publishedAt 2026-05-21`
> - `bi-15` — area **not evaluable**, `publishedAt 2025-07-03`
> - `bi-17` — `|delta| 0.0035`, `publishedAt 2025-05-08`
>
> `bi-04 < bi-15` by **key 4** (key 2 skipped — `bi-15` has no area; key 3 ties at 0).
> `bi-15 < bi-17` by **key 4** (same).
> `bi-17 < bi-04` by **key 2** — both have an area, and `0.0035 < 0.0588`.
>
> `bi-04 < bi-15 < bi-17 < bi-04`.

**I did not have to construct this.** The 19 records in `04` §2 already contain it, on 6 of 27
branches. The consequence is not a bad order but **no order**: the result depends on the sort
algorithm and on the input permutation, so `CINV-21` (`07:1438`, *"two runs of one query over one
snapshot produce the same order"*) is **unsatisfiable** under this reading by any implementation.

**Stopping here, as instructed.** Not repaired.

### The mechanism, so the next candidate can be judged without re-running this

A cycle needs three records and three **different** deciding keys. `A` beats `B` on a key both can
see; `B` beats `C` on a **later** key, because `C` cannot see the earlier one; `C` beats `A` on a
later key still, because `A` cannot see the middle one. Each pair is decided by the first key
**both sides** can see — and *"both sides"* is a property of the **pair**. A lexicographic order
requires the key sequence to be the same for every comparison; here every pair gets its own
sequence, so there is no order for transitivity to hold of.

**The defect is not which keys, or their order. It is letting the pair decide which keys apply.**

### Is there a fourth reading?

**Yes, and it is a different shape rather than a different tuning.** Every candidate so far either
decides applicability **per comparison** (candidate 3) or substitutes a value or a slot for the
missing criterion (candidates 1 and 2). The shape neither of us has named decides applicability
**once per class block**, from the records in it, before any comparison happens: a key is either in
force for the whole block or dropped from it. The comparator is then a fixed lexicographic order
over a fixed key list — **transitive and partition-stable by construction**, which are exactly the
properties candidates 3 and 1 respectively fail — and nothing stands in for the absent criterion,
so `07:1133` is satisfied literally.

**Its cost, stated so it is not oversold.** One record with an unevaluable criterion disables that
key for every record in its block, including records the key could have separated. Whether that is
acceptable is a judgement about what `PB4` is *for* — protecting the unevaluable record, or
preserving the key — and it is not mine to make. It also has an attack surface I have not explored:
block membership is decided by key 1, so it makes the key list depend on `GR2a`, which no rule
currently says.

**I have not implemented or measured it.** Reporting *"and this one passes"* in the same breath as
killing the previous three is the move that shipped `D9-5a` and `D9-7`. It needs its own round and
its own attack.

---

## 5g. The revision that actually exists — rev 9 as written

> **Superseded by §5h.4**, which repeats this measurement against rev 9.1 from a clean
> configuration asserted flag by flag. All three figures carry unchanged.

Checker section `(k)`, measured **last**, from a clean `useRev(9)`, with the configuration
**asserted** flag by flag rather than assumed restored (the run throws if it is not):

| | rev 9 as written |
|---|---|
| property 3, differential ordering | **0 of 27 branches** |
| property 4b, `PB4` strict | **0 of 798 pairs** |
| `EF6` inputs with no class, on the corpus | **0** |

**Safe to state in the contract as they stand.** No proposal is in the default configuration, and
`Q-29`'s candidate 3 is not implemented anywhere the ordering runs — it exists only as a standalone
comparator used by its own transitivity test. The carve-out findings in §5e and §5f are about
proposals **on top of** rev 9 and move neither figure.

---

## 5h. Rev 9.1 — the retarget, and what it closed

Rev 9.1 is now the **default configuration**. It is not a prose pass: it changes three rules.
`D9-7a` (`07:1008-1036`) alters which state `EF3` assigns; `D9-8` (`07:1407-1420`) alters ordering
key (3); `D9-9` (`07:1103-1132`, carried into `CINV-17` at `07:1547` and `EF3`'s
ground-not-conclusion clause at `07:983-997`) alters what the reply *asserts*. Nothing was assumed
to carry. Everything below was re-measured.

### 1. Every finding is now attributed to the configuration it was measured under

This is the change that makes the rest of the section readable, and it was forced by a problem in
my own reporting. The checker exercises rev 8, rev 9 as written, `D9-7a`/`D9-8`/`D9-9` one at a
time, and two `Q-29` candidates that are in no revision. Findings from all of those went into one
list, so "property 1: 6 findings" silently mixed *defects of the revision in force* with *evidence
for changes that revision already made*. Reporting a `D9-5a` defect under a heading that says
"rev 9.1" would be the same category error this file exists to catch.

So `finding(...)` now captures `CFG` at the moment the finding is raised, and the summary splits on
it mechanically — nothing is classified by hand:

```
in-force configuration: rev 9.1 | D9-7a | key3=intersection | intersectionOfSets
```

A finding raised under any other signature is printed in a separate block, grouped by that
signature, and is **not** counted against rev 9.1. Two findings carry an explicit `about` tag
instead, because they are revision-independent by construction (04 §2's demo data; `07:1218-1220`
as rev 9.1 writes it, where `Q-29` is still open) — the tag names the artefact, never a verdict.

### 2. The first six properties at rev 9.1 (property 7 is new this round — §5i)

The **rev 9** column is the count the previous revision of this report published — every finding the
run raised, under every configuration it exercised. The **rev 9.1** column counts only findings
raised under the in-force signature (plus the two `about`-tagged ones). The third column names where
the difference went.

| property | rev 9, as published | **rev 9.1, in force** | also raised, not in force | moved? |
|---|---|---|---|---|
| 1 totality / single-valuedness | FAIL, 6 | **GAPS, 0** | 5 | **yes** — one retired outright (the empty-intersection case, closed by `D9-9` sentence 4); the other five are `D9-5a` / `D9-7` / `D9-7a`-alone measurements, i.e. the evidence for what rev 9.1 changed |
| 2 dead branches | FAIL, 2 | **FAIL, 2** | 0 | no — §14.3.3 row 1 and §14.3.3.1 row 1, unreached on 19 records, reached synthetically |
| 3 differential ordering | FAIL, 2 | **PASS, 0** | 2 | **yes** — both were about `Q-29`, a proposal in no revision |
| 4 `PB4` | FAIL, 44 | **FAIL, 44** | 0 | no — 4a, the deletion form, which the contract acknowledges |
| 5 `EF1` closure | FAIL, 2 | **FAIL, 2** | 0 | no — and see 5 below: this is `Q-32`, and it is correct |
| 6 §4.1 utterances | FAIL, 6 | **FAIL, 4** | 3 | **yes** — the gap-3 family, `EF6` row 7's justification and the row-5 wording all closed; **one new** (6 below) |
| **7 sufficiency** *(new, §5i)* | — | **FAIL, 1** | 0 | new this round — and it fails on the input all six others pass |

Property 3's in-force count moved after §5j: it now carries **1** finding, against key (2)'s
carve-out at `07:1399-1401`, which §5j.2 found while testing something else. Four further
property-3 findings this run are **not** defects of rev 9.1 — among them `Q-29` candidate 4 (a
proposal in no revision) and a correction to this report's own §5h.8 — and the summary separates
them mechanically.

**12 of the 66 findings this run raises are not defects of rev 9.1.** They are kept and printed,
because each is the measurement that justifies a rule rev 9.1 adopted, a proposal it has not
adopted, or a correction to this checker's own earlier report. The summary groups them by the
configuration that measured them, or by what they are about when that is not a configuration.

**Properties 1 and 3 clear, exactly as predicted.** Property 1 retains a `GAPS` verdict rather than
`PASS` for a reason unrelated to the ambiguity clause: `14.3.1`'s missing unit clause (`07:863` vs
`07:871`) is still an open gap.

**Gaps: 2 open, 8 closed.** The two are `Q-29` (`07:1398-1405`, which §18 names and rev 9.1 now
records with all three dead candidates) and `14.3.1`'s missing unit clause — `V.area` is specified
as *value + unit + basis* (`07:863`) while the visitor states no unit, and `VB1`'s *"cannot be
resolved to one of the three is **absent**, never guessed"* (`07:871`) has no `V.area` counterpart.
§18 does **not** carry that second one, so it remains a gap this checker raises and the contract
does not yet acknowledge.

### 3. The disclosure finding did not clear by itself — I had to implement sentence 4 to see it

This is the one deliverable that needed new code rather than a re-run, and it is worth spelling out
because the distinction is easy to lose. My round-10 finding was that the intersection rule has a
failure mode which is *wrongness and not weakness*: when two readings give the **same** relation but
**disjoint** disclosure sets, `D9-7a` rule 2 passes the relation through and the intersection names
nothing, so rows 6–8 announce that spaces the visitor named were not covered **and name none of
them**. Rev 9.1 answers it with `D9-9` **sentence 4** (`07:1126-1132`).

A revision that adds a rule is only verified if the checker **executes** that rule. So sentence 4 is
now implemented in `discloseScope`, and the constructed witness is no longer argued about — it is
built as a real `V`/`R` pair and pushed through the in-force path:

```
CONSTRUCTED, non-nested readings — a term reading as `kitchen` OR as `bathroom`,
  against a partial_remodel [living_room]:
  reading 1: Q_s {kitchen}  -> row 8 scope_disjoint, names {kitchen}
  reading 2: Q_s {bathroom} -> row 8 scope_disjoint, names {bathroom}
  the intersection of the two disclosures is {} — EMPTY.
DOES THE RULE IN FORCE CATCH IT?
  through discloseScope at rev 9.1 (CFG.disclosure=intersectionOfSets):
  row 8, intersection {}, some reading non-empty true, sentence 4 fires: true
```

The criterion becomes `not_evaluable`, the relation is dropped **before `EF6` sees it**, and the
ambiguity is disclosed. The finding retires, and it retires because the rule runs, not because the
prose reads well.

Two notes on the implementation. Sentence 4 is stated at the **disclosure** level but its effect is
a **criterion state**, so the flag is raised in `discloseScope` and applied by its caller through
`assignState("EF3", ...)` — which keeps property 5's `EF1` closure honest, since the assignment is
still `EF3`'s. And sentence 4 fires **0 times on the 19 records**, which the contract states and
this run confirms; that is a theorem about `WS6`'s nesting, not luck, and the contract now says so
itself at `07:1130-1137`.

While the probe was being written I found and fixed a defect in my own harness: the surrounding
part-4 comparison leaves `CFG` on the `intersectionOfQ` arm, and the first version of the probe
inherited it and reported `sentence 4 fires: false`. A probe that inherits a comparison's state
measures the comparison. It now sets the in-force configuration explicitly and restores it.

### 4. The numbers that will be quoted, re-measured from a clean rev-9.1 configuration

Checker section `(k)`, measured **last**, from a clean `useRev(9.1)` whose every flag is
**asserted** rather than assumed (the run throws if any is wrong):

```
configuration asserted clean (every flag at its rev-9.1 value): yes
  rev 9.1; ambiguity D9-7a (07:1008-1036); key (3) intersection (07:1407-1420);
  disclosure intersectionOfSets (07:1103-1132); Q-29 carve-out OFF, as 07:2185 requires.
```

| figure the contract now states | rev 9 | **rev 9.1** |
|---|---|---|
| property 3, differential ordering | 0 of 27 branches | **0 of 27 branches** |
| property 4b, `PB4` strict | 0 of 798 pairs | **0 of 798 pairs** |
| `EF6` inputs with no class, on the corpus | 0 | **0** |

All three **carry unchanged** — which was not safe to assume, because rev 9.1 changed rules and not
only prose. That none of the three rule changes moves any of the three figures is a measurement,
made in §5e's ladder and repeated here from a clean configuration.

`CINV-20` under rev 9.1, pass B: **336 evaluations, 0 with no row, 0 where the returned row was not
the lowest holding, 10 of 10 classes reachable**; on the real corpus, **10 of 10 classes reached, 0
outside `GR2`'s closed list**.

### 5. `EF1` closure: the finding count is genuinely unchanged, and the three new sites are prose

The two counters I flagged as cosmetic moved as expected — state-naming lines in force 84 → **91**,
non-rule assignment sites 6 → **9**. The question that matters is whether any of the three new sites
is an actual assignment, because *a prose mention and an assignment look alike to a text scan, and
that ambiguity is `Q-32` itself*. So the checker no longer reports a count: it prints **all nine
sites with their text**, and asks of each whether it carries a conformance marker.

The three new ones:

| line | section | what it is |
|---|---|---|
| `07:1547` | 15. Test invariants | `CINV-17`'s table row, extended by rev 9.1 to name `D9-9`'s membership half |
| `07:2941` | 20.8 change log | row **A**, which *quotes both* the superseded `D9-5a` bullets and `D9-7a`'s two rules |
| `07:2943` | 20.8 change log | row **C**, describing `D9-9` |

All three are **table cells**. **0 of the 9 carry a conformance marker.** Every one is a cell or
unmarked prose *describing* an assignment `EF2`/`EF3`/`EF4` makes, not making one. `EF1`'s closure
is unaffected; property 5's two findings are the same two as at rev 9, and they are the right ones.

`07:2941` is the interesting case and is worth keeping in view: it is a change-log row that
**quotes the superseded rule verbatim**. That is correct — a change log that does not quote what it
replaced is useless — and it is why the self-contradiction pass in 6 below restricts itself to the
**in-force region** (`07:1-1601`). A superseded formulation inside §20.8 is history; the same
formulation inside §14.3.2 would be a contradiction.

Construction figure, unchanged in kind: **1,539** criterion states assigned over 27 branches × 19
records, **0** by anything other than `EF2`/`EF3`/`EF4`, and the negative control (a `WS8` that
assigns the state itself — rev 7's `B-1` defect) is still **CAUGHT**, so the property can fail.

### 6. Rev 9.1 against itself

A fresh pass over the whole **in-force** rule set — `07:1-1601`, which is sections 1–16; §17 is
parked, §18 is open questions, §20 is history. Four checks, and each states what it can and cannot
decide.

**(i) Superseded formulations.** A revision that changes a rule has to remove the old statement from
every in-force site, not only from the one it edited. Eleven phrases rev 9.1 replaced — the old
`D9-7a` bullets, the old key-(3) wording, `0 of 893`, `546`, `299 of`, `0 of 31`, *"its **position**
is load-bearing"*, `42%`, the `†` block. **0 of 11 present in force.**

**(ii) The contract's own figures, re-measured.** Nine figures the contract states about a
measurement, each paired with the exact substring it uses and the value this run computes. **9
re-measured, 0 disagreeing** — including the three rev 9.1 added: *"16 corpus classifications
change"* (`07:1287/2946`), *"**0 of 10** reading-dependent"* (`07:991`) and *"Resolve by the
**last** reading instead and **10 of 10 flip**"* (`07:993`).

**(iii) Self-counting.** *"and **those three** reach **0 of 798**"* (`07:1335`) names three parts in
its own sentence and says three. Agrees. This check exists because rev 9.1 fixed a sentence that
named four things and called them three.

**(iv) Dangling rule ids — one hit.** Of the **92** rule ids the in-force region names, **6** occur
exactly once in the whole contract. Five are stated at that one site (`AR3`, `CINV-3`, `CINV-7`,
`CINV-10`, `CINV-14` — table rows and in-sentence definitions). One is not:

> `07:7` lists rev 9.1's decision ledger as `D9-7a`, `D9-8`, `D9-9`, **`D9-10`**/`Q-29`. The first
> three each have a normative site in this contract **and** a §20.8 change-log row. `D9-10` has
> neither, and occurs nowhere else in the file. Its *substance* is present — `07:5` says rev 9.1
> "records `Q-29` as open with three dead candidates" — but under the other id.

Either the id is a leftover from `22-rev9-design.md`'s ledger and does not belong in `07`, or §20.8
owes it a row. **Low severity, and not a rule conflict**: it is a cross-reference rev 9.1 does not
honour, and it is the only self-inconsistency the whole in-force pass found.

**What this pass cannot do, stated so the `0` is not read as more than it is.** A contradiction
between two rules that share no phrase and no figure is not reachable by any check in this file; the
seven properties are the coverage that exists for that. And I tried a fifth check — *"is every rule
this text names actually stated here?"* — and **stopped**, because it is not decidable from the
text. The contract marks a **definition** no differently from a **reference**: `CINV-3` is defined
by a table row, `AR3` by a clause inside a sentence listing five other ids, `EF2` by a bolded
heading. A definition model built from any one convention reports the other two as dangling; my
first attempt flagged **70 of 92** ids, all false. That is the *same* defect property 5 records at
`07:949` — whether a line states a thing or merely names it is carried by layout, not by the
sentence — so check (iv) is restricted to the one case that needs no model at all.

### 7. The corrections block retires, and so does the drift finding

Nineteen sites, each checked in the contract's own text for **both** halves — the superseded figure
**GONE** and the replacement **PRESENT**, with its line number resolved at run time:
**19 of 19, 0 still wrong.** There is nothing left to ask, so the block prints a record rather than
a finding.

The seventh property-6 finding at rev 9 was the checker's **own drift notice** — *"the contract
moved while this run was executing"*. With the anchors re-resolved it does not fire: **70 checked,
0 drifted**, and the new section-attribution check adds **194 distinct citations, 0 past the end of
the file**. Both retire.

### 8. What stayed out, deliberately

`Q-29`'s carve-out is in **no** configuration's default, at any revision — `useRev()` sets
`key3Skip = false` unconditionally, and §5e's ladder reaches it only through two rows explicitly
labelled `[not adopted]`. The clean rev-9.1 baseline asserts `key3Skip === false` and throws
otherwise.

> **Superseded by §5j, and one sentence of it is measurably wrong.** The fourth reading has since
> been measured. The instinct below about *why* it might survive was right; the test I proposed for
> it was not, and §5j.1 shows the control passing that test. Kept verbatim so the correction has
> something to point at.

The **fourth** reading of `Q-29` — per-class-block applicability, where the carve-out's scope is the
`GR2a` block rather than the record — remains **unimplemented and unmeasured**, as instructed.
Since an instinct was asked for rather than an implementation: it is the only one of the four whose
shape is not already refuted, because it makes the skip a property of a *partition* rather than of a
*pair*, and a comparator defined inside a block cannot produce the cross-block cycles that killed
candidate 3. What I would want measured before believing it is whether the **7 mixed blocks** this
corpus produces stay stable when `GR2a`'s class order is permuted — that is the test candidate 1
(`position`) failed, and this reading inherits its structure.

---

## 5i. Property 7 — sufficiency, and the blind spot that made it necessary

An independent hand executor, working from the prose with no access to this checker, found on rev
9.1 that once `VB3` leaves `V.breadth` **absent**, `PT4`(b) (`07:965`) makes every `full_remodel`'s
spaces half `satisfied` for any `Q_s`, and neither the three criteria nor the five ordering keys can
separate a **7,000,000 one-bathroom job** from a **50,000,000 whole-home remodel**.

**My own transcript printed the evidence and I did not read it.** The line

```
derived order: 1.bi-01=exact  2.bi-09=exact  3.bi-10=exact  4.bi-11=exact
               5.bi-12=exact  6.bi-13=exact  7.bi-15=exact  8.bi-07=exact
```

has been in every run of this checker since it existed. `bi-15` *is* the one-bathroom job and the
row's own expected answer. Properties 1–6 all pass or nearly pass on that input: the order is total,
single-valued, agrees with `orderByDirectAnswersFirst`, penalises nothing, classes everything. **The
ordering is well-defined and useless**, and six consistency properties cannot tell the difference.

The mechanism, checked rather than assumed: `bi-01`'s `workScopeIds` **contains `bathroom`**, so
key (3) — the count of the visitor's stated ids the record carries — is **1 for both** records. The
pair therefore falls to key **(4)**, `publishedAt` descending, and `bi-01` is newer. *Recency decides.*

### The split the property is built on, and why it needs no threshold

`07:1398-1405`'s five keys divide with no judgement of mine, read straight off the contract's own
list by asking of each: is it a function of `V`, or of `R` alone?

| key | reads | |
|---|---|---|
| (1) `GR2a` class order | `f(V, R)` | `EF6`'s class **is** the match |
| (2) \|`delta_area`\| ascending | `f(V, R)` | the visitor's area against the record's |
| (3) count of stated ids carried | `f(V, R)` | |
| (4) `publishedAt` descending | `f(R)` | recency — says nothing about this question |
| (5) `id` ascending | `f(R)` | a deterministic floor — says nothing at all |

Keys (1)–(3) **measure the match**. Keys (4)–(5) **break a tie the match did not break**. A pair
decided by (4) or (5) is one the contract's own criteria could not separate.

### 7a. Where §4.1's own answer lands — the rank, not a verdict

| row | utterance | §4.1 names | rank / 19 | top 3? | what decided the pair above it |
|---|---|---|---|---|---|
| A | 34평 전체 5천이면 되나요 | `bi-09` | 2 | yes | key (4) — recency |
| B | 예산 3천으로 전체 가능해요? | — | — | — | 04 names no single record (18 names seven) |
| C | 주방만 하면 얼마예요 | `bi-14` | **1** | yes | head of result |
| D1 | 욕실 하나만 | `bi-15` | **7** | **NO** | key (4) — recency |
| D2 | 욕실 두 개 | `bi-15` | **7** | **NO** | key (4) — recency |
| E | 전용 84 아파트 주방 | `bi-14` | **1** | yes | head of result |
| F | 50평 전체 1억 넘나요 | `bi-13` | **1** | yes | head of result |
| G | 32평인데 도배랑 바닥만 얼마예요 | `bi-19` | 2 | yes | key (1) — the match |
| H | 바닥이랑 거실만 | `bi-17` | **1** | yes | head of result |
| I | 현관 수납 | `bi-18` | **9** | **NO** | key (4) — recency |

**3 of 9 rows put §4.1's own named record outside the top 3.** The record `04` names is chosen from
the row's own source fields and never by me: `head` if the row states one, else its first
`04`-sourced expectation, else the record its stated price is about.

**One correction to the brief.** Row I's `bi-18` measures at **9 of 19** here, not 13. Every other
figure matches the hand execution. I report mine because it is what this configuration produces and
flag the difference rather than reconciling it silently — `bi-18` is `not_evaluable` at rev 9.1
(the `WS6` ambiguity), so its block and therefore its rank depend on which reading of `현관 수납` is
in force, and that is exactly the kind of difference worth a second look.

### 7b. Past the nine: which key decides, everywhere

Every adjacent pair of every returned order, 18 per branch:

> **486 adjacent pairs over 27 branches. 314 of them — 65% — are decided by key (4) or key (5).**
> Longest run the match does not separate at all: **10 records**, on *전용 84 아파트 주방*.

Seven branches have a run of 7 or more. On *욕실 하나만* the run is 7 and `bi-15` sits inside it.

### 7c. What is inside those runs — three set-valued questions, no threshold

Within a maximal run the match does not separate, pairs differing on:

| | | pairs |
|---|---|---|
| (i) | the **subset** of the visitor's ids they carry — key (3) reads only its **count** | 30 |
| (ii) | **`projectType`** — *no key reads it* | **113** |
| (iii) | how much work the record did, \|`R.workScopeIds`\| — *no key reads it* | **675** |

Witness, unconstructed, from the corpus:

```
34평 전체 5천이면 되나요
  bi-15  partial_remodel  |R|=1  Q∩R={}  total 7,000,000
  bi-16  partial_remodel  |R|=2  Q∩R={}  total 19,800,000
  bi-01  full_remodel     |R|=6  Q∩R={}  total (no total; perArea 2,900,000)
  bi-09  full_remodel     |R|=7  Q∩R={}  total 50,000,000
```

### 7d. The property, stated so it can fail

> *Within a maximal run of the returned order that keys (1)–(3) do not separate, every pair of
> records must be indistinguishable on what the visitor asked.*

Threshold-free, because every term is set-valued. **FAILS: 818 pair-facts inside 92 runs.**

### 7e. The part I will not turn into a verdict

"Materially different" in the sense of 7M against 50M needs a threshold, and `07:1405` says **"No
key is a price"** — the contract has deliberately declined to rank by amount, and I will not smuggle
a ranking in under the name of a check. The numbers instead, with no verdict attached:

| spread | run | totals | \|R\| | branch |
|---|---|---|---|---|
| **x17.9** | 7 | 7,000,000 … 125,000,000 | 1…11 | 욕실 하나만 |
| x17.9 | 7 | 7,000,000 … 125,000,000 | 1…11 | 욕실 두 개 |
| x8.3 | 8 | 15,000,000 … 125,000,000 | 1…11 | 600~800만원 예산인데 주방 |
| x6.3 | 10 | 19,800,000 … 125,000,000 | 2…11 | 전용 84 아파트 주방 |

63 runs contain more than one total. The coordinator's 7M-against-50M is **x17.9** in the form the
contract can be held to. Whether that is acceptable is an owner decision.

### 7f. What property 7 cannot see — the more important half

It sees that the order is **arbitrary** where the match runs out. It does **not** see that the
arbitrary choice is **wrong**, and it cannot: nothing in the contract says a one-bathroom job should
outrank a whole-home remodel for a one-bathroom query. That rule does not exist, so there is nothing
to check against. A consistency instrument can report that a rule is *missing* only by finding a
place where the rules run out — 7b's 314 pairs — and can never report *which* rule should be there.

Three things stay invisible to every property in this file:

1. **Whether §4.1's expected answer is the right answer.** 7a reports `bi-15` at 7; it takes `04`'s
   word that `bi-15` is what a visitor wants. If `04` were wrong, nothing here would notice.
2. **Whether `PT4`(b) should make a `full_remodel` `satisfied` for any `Q_s`.** That is the root of
   the defect, and it is a deliberate, stated, justified rule. A checker can only ask whether it is
   applied consistently — and it is.
3. **Any ranking the contract declines to state.** No size key, no type key, no closeness-of-fit
   key. Their absence violates nothing, so it is not a finding.

**So: the expectation was *some but not all*, and that is right.** Property 7 makes the defect
visible and does not make it diagnosable. It would have caught this one — 65% and a run of 10 are
not subtle — but only as *"the order stops deciding here"*, never as *"and here is what it should
have decided"*. **Hand execution stays in every round.** It is the only instrument for the class
"the rules are consistent and the answer is bad", and this round it beat six properties to it.
---

## 5j. `Q-29` candidate 4 — measured, and it is the first that does not die

`Q-29` is now blocking: the hand executor could not order **four of the nine rows** (A, F, G, I)
because rev 9.1 does not say what to do with a `not_evaluable` record in an ordering key. I had
called it non-blocking because neither headline figure moves without it; that was true of the
metrics and wrong about the contract, which exists to be implemented.

**The candidate, stated before it was tested:** *`PB4`'s carve-out applies at the granularity of the
key-(1) class block. Key (3) runs for a block only if **every** record in that block can see it; a
block containing any `not_evaluable` scope is not ordered by key (3) at all and falls through to
keys (4)–(5). Applicability is a property of the **partition**, never of a record and never of a
pair.* Behind `CFG.key3SkipMode = "block"`, in no revision and in no default.

Tested in the order set: permutation stability, transitivity, property 3, `PB4` strict.

### 1. The first gate I proposed does not work, and the control proves it

247 class orders (identity, reverse, all 45 pairwise swaps, 200 seeded shuffles) × 27 branches =
6,642 checks, asking whether permuting `GR2a` changes the order of records **within** a class.

| | within-class orders that change |
|---|---|
| control — candidate 1 (`position`), the one this test was meant to kill | **0 of 6,642** |
| candidate 4 (`block`) | 0 of 6,642 |

**The control passes, so the test decides nothing, and §5h.8 named the wrong operation.** Candidate
1 is killed by **partitioning** the row set — property 3, 1 of 27 — not by permutation. A
permutation reorders the blocks without changing their membership; partitioning re-derives each part
and changes the **slots**, and slots are what `position` reads. Candidate 4's 0 is not evidence of
anything. The evidence is in test 3.

This is recorded as a finding against this checker's own prior report rather than quietly replaced,
because the faulty instrument was mine and I proposed it as the first gate.

### 2. Transitivity — and a finding about text that is *in force*

`applies` is computed once per **block** from the record set, so a comparator was derived and tested
the way candidate 3 was. Two variants, because `PB4`'s carve-out governs key (2) as well as key (3):

| variant | corpus triples | cycles | synthetic triples | cycles |
|---|---|---|---|---|
| **4b** — both keys per-block (*the candidate as stated*) | 156,978 | **0** | 118,098 | **0** |
| 4a — key (3) per-block, key (2) left **pairwise** | 156,978 | **4** | 118,098 | **4** |

**4b is transitive**, and the reason is structural rather than lucky: every pair inside a block uses
the *same* key sequence, and a fixed key sequence is lexicographic. Candidate 3 failed because each
*pair* chose its own sequence.

**4a is intransitive — and that is not a fact about `Q-29`.** The cycles are decided by **key (2)**:

```
34평 전체 5천이면 되나요
  bi-04 < bi-15  (key 4)
  bi-15 < bi-17  (key 4)
  bi-17 < bi-04  (key 2)
```

Key (2)'s own carve-out at `07:1399-1401` is **in force** and carries the same three-way ambiguity
as key (3)'s. The gap this checker already records names its two readings — *"keeps the position the
previous key gave it"* or *"falls through"* — and treats them as merely **different**. They are not:
**one of them does not define an order at all.** The in-force implementation here reads key (2)
*positionally*, a sequence of sorts, which cannot cycle — so no figure anywhere in this report moves.
That is exactly why nothing caught it until a comparator was written for a different question.
**`Q-29` is not only about key (3).**

### 3–4. Property 3 and `PB4` strict

| | property 3 | `PB4` strict |
|---|---|---|
| rev 9.1 as written | 0 of 27 | 0 of 798 |
| + candidate 1 (`position`) | **1 of 27** | — |
| + candidate 4 (`block`) | **0 of 27** | **0 of 798** |

Both hold.

### 5. A test that was not asked for, and it is the one that matters

Making applicability a property of the **block** makes every record's position depend on **which
other records are in its block**. That is precisely what buys transitivity in test 2, and it has a
price. `CINV-21` (`07:1551`) does not catch it — `CINV-21` asks that the order be a function of the
record **set**, and it still is. The next question is whether it is **monotone**: add one record
whose scope is `not_evaluable` to an existing class block, re-derive, and ask whether the originals
keep their relative order.

| | insertions that reorder the originals |
|---|---|
| rev 9.1 as written | **0 of 107** |
| + candidate 4 (`block`) | **5 of 107** |

```
욕실 하나만 — adding a not_evaluable record to the `exact` block moves the originals from position 2:
  before  bi-09 > bi-10 > bi-11 > bi-12
  after   bi-07 > bi-09 > bi-10 > bi-11
```

### The verdict is neither "passes" nor "dies"

| test | | |
|---|---|---|
| 1 | `GR2a` permutation stability | 0 of 6,642 — **but the control also scores 0**; decides nothing |
| 2 | transitivity, **4b as stated** | **PASS** — 0 cycles in 275,076 ordered triples |
| 2 | transitivity, 4a hybrid | **FAIL** — and the cause is key (2), which is *in force* |
| 3 | property 3 | **PASS** — 0 of 27 (candidate 1: 1 of 27) |
| 4 | `PB4` strict | **PASS** — 0 of 798 |
| 5 | monotonicity *(not asked for)* | **FAIL** — 5 of 107 vs 0 for rev 9.1 as written |

**4b survives every test set, in the order set, and then fails one I added — and the failure is not
incidental. It is the same property that makes it transitive.** Applicability is a function of the
block's membership, so two records' relative order depends on a third that beats neither; that is
what buys one key sequence per block, and one key sequence per block is what makes it an order at
all. The two cannot be separated by a better implementation. They are the same sentence read twice.

**The trade, stated so it can be made rather than discovered.** Candidates 1–3 break the **order**:
unstable under partitioning, forbidden by name, intransitive. Candidate 4 keeps the order and breaks
**independence** — adding a record reorders records it does not beat. Nothing in the contract forbids
that. No fifth shape is proposed here; I have not looked for one.

### What I did not test

1. **The 7 mixed blocks as such.** Candidate 4 *dissolves* them — a block containing any
   `not_evaluable` scope simply does not run key (3), so no block mixes skipped and ordered records.
   I measured that the resulting order is transitive and passes properties 3 and 4b. I did **not**
   measure whether it is the order the author intends; there is no statement of that to check
   against, which is `Q-29` itself.
2. **The cost it pays.** Candidate 4 runs key (3) for **fewer** records than candidate 3 would: one
   `not_evaluable` record disables the key for its whole block, including records that could see it.
   The size of that is in test 5 and nowhere else.
3. **The orders 4a and 4b produce, against each other.** 4a is dead, so candidate 4 can only be
   adopted for the **whole** carve-out, key (2) included. How far 4b's key (2) differs from the
   in-force positional reading is unmeasured — adopting 4b changes key (2) by an amount nothing here
   reports.
4. **The result limit of 3** (`07:1222`). Truncation is a subsetting operation and candidate 4's
   applicability is set-dependent, so truncating before ordering and truncating after can differ.
   This file never truncates, so the question is untouched by every number above.
5. **Any corpus but this one.** 19 records, 27 branches. The synthetic enumeration covers the
   *shapes* the keys can see, which is stronger, but it fixes one class per triple; a cycle needing
   three classes is outside it. Key (1) is total and a cycle must live inside a block — but that is
   an argument, not a measurement.

**Not adopted, and in no default.** `CFG.key3SkipMode = "block"` is reachable only from §5j's own
section. `useRev()` resets `key3Skip = false` unconditionally at every revision, and §5h.4's clean
baseline asserts it and throws otherwise.

---

## 6. `CINV-20` re-derived under rev 9's eight-row `EF6` (deliverable 3)

`07:1437` parks three counts and says plainly they are not verified for rev 9 because
`proof/ef6-totality.mjs` still implements rev 8. Re-derived here.

**The re-derivation replicates `CINV-20`'s own enumeration**, not a convenient one: *"3 `projectType`
× 3 `V.breadth` × 21 scope shapes including `WS8`'s dropped-id case × 8 area shapes"* = **1,512**
inputs, keyed on `breadth|scope|area|projectType` (4 states³ × 3 types = 192 possible vectors).
`EF2`–`EF4` are re-derived from `07:947-1017` in that abstract shape; `EF6` is this file's own
eight-row table.

**The replication is validated, not trusted.** Run at rev 8 the same code must reproduce the parked
figure — **it returns 100 of 192 and 10/10 classes, exactly as `07:1437` states.** That is what makes
the rev-9 column comparable. If it ever stops reproducing it, the checker raises a finding and says
the rev-9 count is not comparable either.

| `CINV-20` pass A | rev 8 (control) | **rev 9** |
|---|---|---|
| conversation × record inputs | 1,512 | **1,512** |
| criterion-state vectors that occur | 100 of 192 | **100 of 192** |
| classes reached | 10 / 10 | **10 / 10** |
| inputs with no row | 0 | **0** |
| returned row not the lowest holding | 0 | **0** |
| `EF3`'s lemma (`07:1004-1006`) | holds | **holds, 0 counterexamples** |
| classes orphaned | none | **none** |

| `CINV-20` pass B, the raw superset | rev 8 | **rev 9** |
|---|---|---|
| evaluations | 384 | **336** |
| no row / not lowest holding | 0 / 0 | **0 / 0** |
| classes reached in the raw sweep | 10/10 | **10/10** |
| on the real 19-record corpus | — | **10/10** |

**The counts are unchanged, and the run derives *why* rather than asserting it.** The two vector
sets are **identical, not merely equal in size** (0 vectors occur at one rev and not the other).
`D9-2c` does not create or remove vectors, it **redistributes inputs among vectors that already
occur**: a `partial_remodel` with relation `scope_superset` moves from scope `unsatisfied` to scope
`satisfied` (`07:977-978`), and both of those vectors were already reached by other inputs. What
moves is the **class** each input reaches:

| class | rev 8 | rev 9 |
|---|---|---|
| `scope_superset` | 48 | **20** |
| `breadth_fallback` | 104 | 120 |
| `area_fallback` | 89 | 93 |
| `not_evaluable` | 478 | 486 |

**So `07:1437` may state, verified for rev 9: 1,512 inputs; 100 of 192 vectors occur; all 10 classes
reachable; 0 inputs with no row; 0 first-match violations; `EF3`'s lemma holds.** The pass-B
arithmetic moves from 384 to **336** because row 1's relation list lost `scope_superset`.

**One derived consequence the contract does not quantify.** Row 7 gives `scope_superset` back its own
class for **20 of the 48** inputs that had it at rev 8. The other **28** reach rows 2–6 first and are
labelled `breadth_fallback`, `area_fallback` or `not_evaluable` instead. That follows from row 7
sitting **after** row 6, which `07:1206-1209` argues for deliberately (*"what we cannot evaluate
outranks what we can caveat"*) — so it is a consequence of a stated decision and **not a defect**. It
is worth stating because the caveat `OD-P` and `GR2` exist to disclose now reaches the visitor under
a different label in 28 of 48 cases, and `07:1203-1212`'s claim that row 7 *"gives it back its own
class"* is true of 42% of them.

---

## 7. Price-rule checks (`GR1`, `GR4`, `GR5`, `GR5a`, `PB2`, `PB5`, `VB2`)

Each derived from a ledger and exercised by a negative control.

| check | citation | result | control |
|---|---|---|---|
| `PB2` total budget vs `perArea` | `07:1129` | none in 1,795 comparisons | **CAUGHT** |
| `PB5` breadth-absent record called a budget match | `07:1148` | none in 826 statements | **CAUGHT** |
| `VB2` `budgetHint` free text in a comparison | `07:864` | none; 1 utterance carries a hint and it reaches no comparison | **CAUGHT** |
| `GR1` a stated number the record does not carry | `07:1328` | none | **CAUGHT** |

**Zero** of the 1,795 logged comparisons carry a price or budget operand, which is `07:1308` and
`07:1154-1157` measured rather than restated. `PB2` and `VB2` hold because `V.budget` has **no
consumer in the pipeline at all** — the empty price row is what measures that.

- `bi-19`'s 11,000,000 ÷ 32평 = **343,750** is no field's value: not exempt, stays forbidden
  (`07:1358-1359`). Confirmed.
- `bi-10`'s `perArea` 2,500,000 = 85,000,000 ÷ 34평 exactly **and is its own field**: exempt
  (`07:1353-1357`). Confirmed.
- Cross-record probe (`07:1349-1352`): `bi-09`'s 50,000,000 ÷ `bi-11`'s 20평 = 2,500,000, which **is**
  `bi-10`'s `perArea`. Not exempt for `bi-09` — the reach `07:1347-1348` forbids does not exist.
  Confirmed.
- Over 27 branches: **140** `GR1`-statable numbers coincide with a forbidden product or quotient and
  are exempted by `GR5a`; **0** are forbidden and not exempt.

---

## 8. What rev 9 fixed, what it did not, and what it broke

**Fixed, and measured:**

| round-8 blocker | rev-9 status |
|---|---|
| `B8-1` `WS6`'s tie-break predicate never true | **closed** by `D9-5a` — the rule is deleted, not repaired. The dead predicates no longer exist |
| `B8-2` `GR3` preamble vs `GR3a` rungs disagree | **closed** by `D9-1`. Property 3: 29 of 31 → **0 of 27**, by construction |
| `B8-3` `GR2a` sorts `not_evaluable` last | **closed** by `D9-2c` + `D9-1` together. Strict `PB4`: **0 of 798** |
| `B8-4` `VB3` row pairs both match | **closed** by `D9-4`(i). `VB3` is a function |

**Rev 9 also adopted, independently, the position this checker took against the audit at rev 8.**
`07:377-384` refuses to transcribe `07:2520`'s *"weaker class, once per query"* sentence into `WS6`,
for the reason this checker derived — *"a class is a function of a **record**; there is no class
until a record is named"* — and `07:2636` records it as a rejected alternative citing the same
consequence I reported: transcribing it overturns `04:701`. That was recommendation 4 of rev 2 §7,
and it was taken.

**Not fixed, carried explicitly:** gaps 1 and 2 (= `Q-29`, `Q-31`), and §18's `Q-26`, `Q-27`, `Q-28`,
`Q-30`, `Q-32`. Carrying them with an id is the right disposition and the checker does not
re-litigate them.

**Broken by rev 9, and this is the finding to act on before round 10:**

1. **`D9-5a`'s ambiguity clause is not single-valued** (§5). Reachable on the corpus. One sentence
   fixes it; which sentence is a decision.
2. **Gap 3, new**: `D9-5a` changed `V.scope`'s shape and left ordering key (3) reading it as though
   it had the old shape (`07:1302` vs `07:854`).

Both are the same kind of defect — a change made at one level and not propagated to the level below
— and both are in `D9-5a`, the one part of `D9-6` that had no executable check behind it. That is
`DM-1` being right.

---

## 9. What I could not encode

Stated plainly, because a checker that does not say what it skipped is not evidence.

1. **§17.1's deferred rules** (`PB0`, `PB0a`, `PB1`, `PB3`, `PB3a`, `PB6`, `PB6a`, `EF5`,
   `price_fallback`) — not implemented, as instructed. They grew by ~230 lines during this session
   and were re-excluded by heading; nothing in the run reads them.
2. **§17.3's parked `GR3a`** — the rev-8 implementation is retained behind `useRev(8)`, but the
   parked *text* is not re-read. If §17.3's transcription of the rungs diverged from what rev 8
   actually said, this checker would not see it.
3. **`WS9`, `WS1`'s omission half, `PT4`(a)/(b)** — authoring rules the contract itself says `VA1`
   cannot evaluate (`07:979-981`). Not machine-checkable by construction.
4. **`07:970-981`'s ground-not-conclusion clause** — it constrains the *sentence the reply states*,
   not a criterion or a class. The checker has no reply generator, so it verifies the state that
   triggers the clause and not the Korean it mandates. Same for `CINV-19`'s coverage statement
   (§18's `Q-30`), `GR2`'s per-record not-evaluable list wording, and every disclosure obligation.
   *Rev 9.1 narrows this:* `D9-9`'s extension at `07:983-997` makes the **permission** — may the
   stronger sentence be stated at all — a set-theoretic condition over the readings, and that half
   **is** executed (§5h.3). What remains unexecuted is the Korean.
5. **`Q-26`'s mixed-kind chain** (`07:921-928`) — real in the prose, but it changes no output under
   the same-kind chaining audit A-4 established, so it is reported and **not** counted as a gap.
6. **The result limit of 3** (`07:1222`'s parenthetical) — the checker orders all 19 and never
   truncates, so *"fourth place is invisible"* is reasoned about but not exercised.
7. **`GR4`'s envelope as an envelope** — `gr4Envelope` computes what a record should carry, but
   nothing downstream consumes a redacted record, so the withholding is checked at the point of
   decision and not end to end.
8. **Multi-turn conversation state** — every utterance is evaluated independently. Nothing in V0.2
   spans turns, but if a later rev adds it this checker will not notice.
9. **"Is every rule this text names actually stated here?"** — attempted for rev 9.1's
   self-contradiction pass and **abandoned**, because the contract marks a definition no differently
   from a reference. A definition model built from any one of its three conventions flags **70 of
   92** ids falsely. Only the model-free case is checked: an id named once and stated nowhere
   (§5h.6 (iv)). This is `Q-32` in a second place, and it is the same defect property 5 records.
10. **Whether the answer the order returns is the RIGHT answer.** Property 7 (§5i) measures where
    the order stops deciding — 65% of adjacent pairs — and takes `04`'s word for which record a
    visitor wants. It cannot check `04`. The class of defect "the rules are consistent and the
    answer is bad" is reachable only by hand execution, which is how it was found this round.
11. **`Q-29` candidate 4's behaviour under truncation**, and how far its reading of key (2) departs
    from the in-force positional one. Both listed in §5j's untested surface, neither measured.

---

## 10. Response to the independent audit (`21-pipeline-audit.md`)

Carried forward from rev 2 **unchanged**, because every item is about the checker rather than about
a contract revision. **Accepted: 12. Rejected or partly rejected: 4.**

| id | disposition | what was done |
|---|---|---|
| **A-1** BLOCKER — property 5 vacuous | **ACCEPTED in full** | Property 5 rebuilt to quantify over the contract's own text, with a negative control that catches rev 7's `B-1` shape. Verdict moved PASS → FAIL. |
| **A-2** BLOCKER — gap 4 false | **ACCEPTED in full** | `basis = "supply"` removed; `V.area.basis` left `null`; `AR5` compares with a disclosure. Rev 9's `Q-31` independently confirms the gap was false. |
| **A-3** MAJOR — `07:1099`'s sort key declared and unused | **ACCEPTED as a defect; REJECTED as a measurement** | The sub-rung was applied; A-3's figures were measured with gap 4 still in force so neither is reproducible. Moot at rev 9: `D9-1` deletes the rung the key lived in. |
| **A-4** MAJOR — `restrictedByKind` crosses term kinds | **ACCEPTED in full** | Restricted to chains of the same kind. Rev 9 confirms the underlying prose question is open and files it as `Q-26`. |
| **A-5** MAJOR — row G's disagreement fabricated | **ACCEPTED in full** | `expect` removed; row G now checks what `04`/`18` actually claim. |
| **A-6** MAJOR — 4 of 7 dead branches are not defects | **ACCEPTED in substance; REJECTED on `WS8`** | Residual branches are now classified **by measurement** (`observeUnrestricted`). `WS8` is a property of the *(document, consumer)* pair, so `CINV-9`'s second consumer is the repair, not a twentieth record. |
| **A-7** MAJOR — gap 5 under-stated; repair already in the contract | **ACCEPTED in full** | And superseded: rev 9 deleted the rule rather than promoting the change-log sentence, and gave the same reason. |
| **A-8** MAJOR — `PB2`/`PB5` are hand-assertions | **ACCEPTED in full** | Both derived from ledgers, both with negative controls. Same for `VB2`, `GR1`. |
| **A-9** MINOR — the reading taken is not reported | **ACCEPTED in full** | Printed per branch. Moot at rev 9: no reading is taken. |
| **A-10** MINOR — four invented titles | **ACCEPTED in full** | Restored to `04`. Now cross-checked against the applied data too (§1). |
| **A-11** MINOR — property 6 is an uneven subset check | **ACCEPTED in full** | All 11 pairs `18:556` names; row D2 carries row D1's pair; `04:697`'s negative half runs; every pair tagged `04`/`18`/`drv`. |
| **A-12** MINOR — two `READINGS` chosen to make a stated answer come out | **ACCEPTED in full, the most important finding in the audit** | The choice model is gone; the checker branches. Rev 9 made the same move in the contract (`D9-5a`). |
| **A-13** MINOR — `VB2`/`GR1`'s non-numeric half unimplemented; `GR5` narrowed twice | **ACCEPTED in full** | Implemented and controlled; `GR5`'s forbidden set un-narrowed. |
| **A-14** NOTE — *"1 utterance with no `VB3` row"* | **ACCEPTED in full** | Corrected to 0. |
| **A-15** NOTE — illegal record shape in the price arm | **ACCEPTED in full** | Deleting a `total` removes a `derived` `perArea` with it; the price arm is labelled a control. |
| **A-16** NOTE — six off-by-N `04:` citations | **ACCEPTED in full** | Corrected. |

### Where I think the audit is wrong

Unchanged from rev 2, and rev 9 bears on two of them.

1. **A-6 on `WS8` (rejected).** `WS8` is about what a **consumer** does with an id **it** does not
   know, so for a consumer that knows all 26 §7.3 ids the branch is dead for **every possible
   document**. `CINV-9` (`07:1426`) names a second consumer; that is the repair.
2. **A-3's measured impact (rejected as a number).** Measured with gap 4's false basis in force,
   which A-2 in the same audit establishes is wrong. Moot at rev 9.
3. **Gap 1 — the audit calls `VB3` rows 1/2/5/6/7 "exactly parallel" (rejected).** They were not:
   rows 2, 5, 6, 7 named the **form**, rows 1, 3, 4 gave bare literal lists. **Rev 9 settled this in
   my favour**: `07:890-894` now says in terms that *"the left column lists **forms**, not literal
   strings"*, and gives the same reason I did — under the literal reading row 2 never fires on `04`
   §4.1's rows A, B and F. The fix was a sentence about the left column, as stated.
4. **A-1's proposed replacement (accepted as a blocker, partly rejected as a design).** A text scan
   cannot fully escape the problem it is meant to solve: it must decide, in natural language, whether
   a line assigns a state or tests one, and this contract writes both the same way (`07:1185` vs
   `07:947-948`). The rebuild was done and **that ambiguity is reported as a finding** rather than
   hidden in a marker list. Rev 9 files it as `Q-32` and does not fix it, which is the right call for
   a naming change — but it means property 5 will keep failing until one of the two
   `not_evaluable`s is renamed.

---

## 11. Reproducing

```
node docs/result/interior-portfolio-v0.2/proof/contract-pipeline.mjs   # or: npm run proof:pipeline
node docs/result/interior-portfolio-v0.2/proof/ef6-totality.mjs        # or: npm run proof:ef6
```

The run is deterministic (verified by diffing two runs) and exits 0. `proof/contract-pipeline.txt` is
the transcript this document reports. `package.json` gains one script line and nothing else in the
repository is modified by this work — in particular **no contract or spec document is edited**.

`proof/ef6-totality.mjs` **still implements rev 8** and is deliberately left alone: it is the control
that §6's replication is validated against. Its rev-9 figures are the table in §6, derived here.
