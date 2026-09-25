# 12 — Disposition of `11-delta-review-rev5.md`, and contract rev 6

| | |
|---|---|
| date | 2026-09-24 |
| input | `11-delta-review-rev5.md` — **NOT READY**, 4 BLOCKER · 8 MAJOR · 10 MINOR · 6 NOTE, plus §C (3 MAJOR) and §E (2 MAJOR, 4 MINOR, 1 NOTE) |
| output | `docs/reports/integration/07-integration-contract-v0.2-candidate.md` **rev 6**; `04-demo-data-spec.md` **rev 5**; `05-review-disposition.md` (round-4 `D-1`…`D-7` dispositioned); `proof/ef6-totality.mjs` + `proof/ef6-totality.txt` |
| verdict | every finding accepted. None rejected, none deferred. |

---

## 1. The decision that had to be made first: the pre-committed narrowing clause

Before round 5's verdict arrived I wrote a pre-commitment into `00-work-plan.md` §2.4: **if round 5
returns structural BLOCKERs inside §14.3, narrow V0.2's scope rather than patch a sixth time.** The
point of writing it in advance was to stop me from talking myself into one more patch.

Round 5 returned four BLOCKERs, all inside §14.3. **The literal trigger fired.**

**The clause is not invoked.** The reasoning, so that this is auditable rather than convenient:

1. **The independent reviewer, who was not told the clause existed, recommended against it.**
   Verbatim: *"it half worked, and it should not be reverted … every remaining defect is now a
   missing row in one table rather than a prose contradiction spread over four sections, and the
   single most valuable thing the next revision can do is make that totality machine-checked …
   **A fifth restructure is not warranted; finishing this one is.**"* The clause exists to protect
   against my own optimism; when the check on my optimism says the opposite of what I pre-committed
   to, the pre-commitment is the thing to examine, not the evidence.
2. **The defect class genuinely changed.** Rounds 2–4 found contradictions *between* rules in
   different sections — the failure mode narrowing would have addressed. Round 5's four BLOCKERs are
   all *missing rows in one table*: `EF6` has no row for `breadth = unsatisfied` (`Q-1`), §14.3.3
   lost a row (`Q-2`), `EF3` has one branch where it needs two (`Q-3`), `PB1` has two sentences
   where it needs one (`Q-4`). That is a different and much cheaper thing to fix.
3. **Narrowing would not have fixed them.** Every candidate cut — drop budget comparison, drop
   partial/full distinction, drop the ladder — removes a goal the owner set in the master task
   (goals 5 and 6) and leaves `EF6` exactly as incomplete for whatever survives.

**What the clause's *spirit* still binds me to, and what I did instead of a sixth prose patch:** I
did not argue the table into totality. I transcribed `EF6` as rev 6 writes it into
`proof/ef6-totality.mjs` and **executed it** over all 768 criterion-state × `projectType` vectors —
1,344 evaluations once row 1's four relations are enumerated, 464 of them reachable under
`EF2`/`EF3`/`EF5` — asserting totality, single-valuedness, membership in `GR2`'s closed list, no
orphan class on the reachable set, `EF3`'s lemma, the exactness of `exact`, and the nine worked
cases rounds 4 and 5 executed by hand. Output in `proof/ef6-totality.txt`. If round 6 finds another
hole in `EF6`, that is a fact about this proof, not another argument, and the clause fires for real.

*(One correction made during that work, recorded because it is the same failure mode the reviewer
has now flagged four rounds running: the proof's first version printed `row-1 firings with a
non-partial type: 512 (must be 0 on the reachable set)` — it counted the superset while the label
claimed the reachable set. I fixed the counter, not the label.)*

---

## 2. The structural change in rev 6

**`EF6` no longer reads a ladder predicate.** Rev 5's row 2 keyed on *"the record is on a `GR3`
rung rather than a direct answer"* — a predicate defined nowhere in the contract (`Q-5`) and
circular in `GR3`'s own preamble, since the ladder applies when no direct match answers and its
first rung is the direct match.

In rev 6 the class is a function of the four criterion states and `R.projectType` **alone**:

| # | condition | class |
|---|---|---|
| 1 | scope `unsatisfied` | the §14.3.3 relation |
| 2 | breadth `unsatisfied` and `R.projectType == "full_remodel"` | `fallback_from_full` |
| 3 | breadth `unsatisfied` (⇒ record is a partial) | `breadth_fallback` |
| 4 | breadth `not_evaluable` (⇒ `projectType` absent) | `unknown_type_fallback` |
| 5 | budget `unsatisfied` | `price_fallback` |
| 6 | area `unsatisfied` | `area_fallback` |
| 7 | any criterion `not_evaluable` | `not_evaluable` |
| 8 | otherwise | `exact` |

`fallback_from_full` and `unknown_type_fallback` become **breadth verdicts**, which is what they
always meant, and `GR3` is demoted to what it always was: a labelling and an ordering of the result.
*"Direct answer"* is defined once — class is `exact` — and the circularity is gone. This is the same
move that produced `EF6` in rev 5: when two devices can disagree, compute one from the other.

---

## 3. Findings

### 3.1 BLOCKER — all four accepted and fixed

| id | accepted | fix in rev 6 |
|---|---|---|
| `Q-1` `EF6` had no row for `breadth = unsatisfied`, so a one-bathroom 7,000,000 job was `exact` for *"전체 리모델링 사례"* and a 50,000,000 whole-home remodel was `exact` for *"주방만"* — OD-P inverted by the class table | yes | `breadth_fallback` added to `GR2`'s closed list; rows 2/3/4; totality stated and **executed** (`CINV-20`) |
| `Q-2` §14.3.3 lost its `Q = ∅` row, so `PB0`'s own worked utterance budget-matched nothing over a corpus containing five affordable partials | yes | row 1 restored with `PB0a`'s statement; `PB1` states that its partial branch is entered for every `Q` and that `Q = ∅` is row 1, so the two entry points cannot diverge again |
| `Q-3` `EF3` extended `PT4`(b) — about **spaces** — to the visitor's **trades**, inferring inclusion from an absent trade id; `bi-09`, which did *not* replace the windows, was the single `exact` match for a 창호 query | yes | `EF3`'s full branch split on `Q_s`/`Q_t`; trade half `satisfied` iff `Q_t ⊆ R_t`, else `not_evaluable`; never `unsatisfied`. `CINV-13` gains fixture (c) |
| `Q-4` `PB1`'s full branch stated two non-equivalent predicates in consecutive sentences; `CINV-13`'s own second fixture failed the second | yes | one predicate, per `VB3`: the visitor's **framing** refuses, naming rooms does not; `V.breadth` absent with `Q_s ≠ ∅` is permitted only with `PB0a`'s statement |

### 3.2 MAJOR — all eight, plus §C's three and §E's two

`Q-5` (rung predicate undefined) · `Q-6` (`GR3` not total — budget-only rung added) · `Q-7` (`WS8`'s
drop turned unknown into fact — both `WS8` and `WS7a` now say a record with a dropped id is **not
closed**) · `Q-8` (`PB6a` unimplementable — rewritten with a deterministic floor, `CINV-21`) ·
`C-1` (disclosures restored on §14.3.3 rows 6–8) · `C-2` (`WS9` gains round 4's sentence: installing
joinery is not by itself a remodel of the space it stands in) · `C-3` (§20's `PR4` row, the `CINV`
count, and the false summary row) · `E-D-1` (`04`'s two `PB3a`-forbidden per-area comparisons) ·
`E-D-2` (round 4's `D-1`…`D-7` never dispositioned — now in `05`).

### 3.3 MINOR / NOTE — all sixteen

`Q-M1` `GR5a` scoped to the record the statement is about (rev 5's *"some record in the result"*
restored the cross-record arithmetic `GR5` was widened to catch: `bi-09`'s total ÷ `bi-11`'s area
**is** `bi-10`'s `perArea`) · `Q-M2` `EF5` routes `PB6`'s not-comparable case · `Q-M3` `PY1`'s
confidence signal given a home as a **disclosure**, explicitly not a state · `Q-M4` the
`whole`↔`full_remodel` mapping stated · `Q-M5` relation renamed `scope_exact` · `Q-M6` `PB3a`'s
third conjunct dropped · `Q-M7` `CINV-4` · `Q-M8`/`Q-M9`/`D-3`/`D-4`/`D-5` `04`'s header and
citations · `Q-M10`/`D-2` `05` · `Q-N1` `VB3` in the change log · `Q-N2` the `BU4` row corrected
rather than the rule invented · `Q-N3`/`P-18` `WS1` labelled · `Q-N4`/`P-17` the change-log summary
· `Q-N5`/`D-6` `storage` and `hallway` recorded as declared-but-unused · `Q-N6` rows 5–8 read `Q_s`
only, stated as intended · `D-7` `bi-18`'s `WS6` alias assumption named.

**Round 4's seven unapplied items** — `P-7`, `P-10`, `P-12`, `P-13`, `P-14`, `P-17`, `P-18` — are
applied in the same pass. `P-15` is resolved by construction (`fallback_from_full` is now a breadth
verdict) and `P-16` is stated (`EF6` row 7 is intended, not a consolation).

### 3.4 §D — the five questions rev 5 asked, all answered, all producing changes

`Q-14`/`Q-15` produced `EF6`'s rows and `CINV-20`. `Q-16` produced `EF3`'s **ground-not-conclusion**
clause (`CINV-23`): where the spaces half is satisfied by `PT4`(b) and `Q_s ⊄ R_s`, the reply says
*"집 전체를 리모델링한 사례"*, never *"주방이 포함되어 있습니다"* — an unverifiable authoring premise
now degrades to a true-but-general sentence instead of a false-and-specific one. `Q-17` produced
**`INV-30`** (`partial_remodel` ⇒ at least one `Spaces` id): §14.3.3.1's first row is kept, because
deleting it makes the table non-total, and its unreachability is now tested rather than observed.
`Q-18` made `PB0a` a **template** and gave it `PB6a`'s ordering, because disclosure without a
reproducible order surrenders the whole purpose of the rule `PB0` amends.

---

## 4. What rev 6 relaxes

Stated as a list, because four consecutive revisions closed with a blanket *"nothing relaxes a
rule"* that was not true, and round 5 counted that as the fourth recurrence of `P-17`.

| change | direction |
|---|---|
| `EF3`'s trade half: `satisfied` → `not_evaluable` | **tightens** |
| §14.3.3 row 1 + `PB1`'s `Q = ∅` clause | **restores** a rev-4 permission rev 5 dropped by accident. Not a new permission — and the one item on this list a reviewer should check hardest |
| `PB3a` loses its third conjunct | no outcome changes; the wire could not carry the value |
| `INV-30` | **tightens**, and is backward-incompatible: it can fail a document rev 5 accepted. The only such row; open as `Q-19` |
| everything else | adds a rule, a disclosure, a state transition or a test |

`PB0` remains **not in force** until the consumer confirms it (§16).

---

## 5. Producer / consumer work list — the delta from `05`'s five items

> **Corrected 2026-09-24, after round 6.** This section said *"Items 1–5 of `05`'s list are
> unchanged and still not done."* Items 1–3 **were** already done in the working tree
> (`emit.ts:366-380`; `schema.ts:283-287` + `validate.ts:299-301`; no `PT4(b)` anywhere in
> `platform/`). `05`'s list now carries the evidence and both lists agree. Round-6 note `n-6`.

Rev 6 is **not** entirely consumer-side, unlike rev 5. One producer item is added:

6. **`INV-30`** — `projectType == "partial_remodel"` ⇒ at least one `Spaces` id. Mirrors `INV-29`
   in `platform/content/schema.ts` / `platform/integration/validate.ts`. Verified against the five
   new partials (`bi-14` `kitchen`, `bi-15` `bathroom`, `bi-16` `kitchen`+`bathroom`, `bi-17`
   `living_room`, `bi-18` `entrance`). **Not verifiable against `bi-04`/`bi-06`**, whose
   `workScopeIds` the `bi-01`…`bi-08` authoring pass has not written; `INV-30` becomes a constraint
   on that pass.

Consumer-side additions: `WS8`'s not-closed clause; `CINV-20` (totality), `CINV-21` (`PB6a`
determinism), `CINV-22` (`GR3` labels, never classifies), `CINV-23` (ground, not conclusion).

Items 1–5 of `05`'s list are unchanged and still not done.

---

## 6. Next

1. **Delta review of rev 6**, delta-only, fresh context, told nothing about the desired conclusion.
   The reviewer should attack `proof/ef6-totality.mjs`'s transcription first: if the `.mjs` does not
   match §14.3.6, the proof proves nothing.
2. On PASS: L11 Template Release **1.6.0** cut and re-pin, then L12 demo data.
