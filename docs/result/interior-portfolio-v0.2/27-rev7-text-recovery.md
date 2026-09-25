# 27 — Rev 7 text recovery: what §17.1 marked LOST or reconstructed, found verbatim

| | |
|---|---|
| date | 2026-09-24 |
| author | text-recovery worker (forensic extraction only) |
| scope | the six items `docs/reports/integration/archive/07-rev9-2026-09-24.md` §17.1 carries as **reconstructions** or **LOST** (`07:1517-1583`), plus §14.3.3.1's budget column, which §17.1-c's row 2 points at |
| files changed | **none.** This report only. The contract is not edited. |
| method | targeted extraction from `~/.claude/projects/-Users-woops-projects-web-recon-track-b/0b11d7b9-33b5-4113-a2c3-947908bc754f.jsonl`, plus two surviving files in that session's scratchpad, cross-validated against `15-delta-review-rev7.md`'s line citations |

**Headline.** Rev 9's §17.1 states that *"rev 7's file is unrecoverable"* and that *"no source in the
repository carries"* the LOST items. That is true of the repository. It is **not** true of the
session record. Rev 7's own bytes survive in three forms:

1. **two literal slices of the rev-7 file**, cut to the scratchpad at 2026-09-24T10:11:01Z — after
   the last rev-7 edit and before the first rev-8 edit — and still on disk;
2. **one `sed` dump of rev-7 lines 1188-1225** printed into the transcript at 09:5x;
3. **the recorded before/after strings of every edit** that wrote the blocks not covered by (1)
   or (2), with the absence of any later edit verifiable by string search.

All six items are recovered. **§14.3.4's price tier is recovered**, from category (1) — the highest
provenance available short of the file itself.

---

## 0. How rev-7 generation was established

Three independent anchors pin the generation, so no item below rests on "later in the transcript".

**Anchor 1 — the section index of the rev-7 file.** At transcript line **2267** (10:10:37Z), a
`grep -n` over the contract, run immediately before the rev-8 narrowing rewrite, prints:

```
769:### 14.1 The annex stays out of the generic core
776:### 14.2 `location` ranking weight is zero
784:### 14.3 The evaluation function
799:#### 14.3.1 What the function takes
836:#### 14.3.2 Four criteria, three states each
920:#### 14.3.3 Scope relations, for a `partial_remodel`
978:##### 14.3.3.1 Trade-only requests
1014:#### 14.3.4 Tiers
1032:#### 14.3.5 When a price comparison is permitted
1146:#### 14.3.6 The match class
1243:#### 14.3.7 Grounding and the output invariants
1282:### 14.4 Style is a bonus, never a gate
1308:## 15. Test invariants — additions to V0 §22
1364:## 16. Rollout — consumer first (OD-A)
1400:## 17. Deferred
```

*"14.3.2 **Four** criteria"* and *"14.3.5 **When a price comparison is permitted**"* are rev-7
headings; rev 8 renamed both. This index is the rev-7 file's own table of contents.

**Anchor 2 — `15-delta-review-rev7.md`'s line citations.** Every recovered block lands on the exact
lines the rev-7 reviewer cites. The correspondences are listed per item below; the strongest is
item F, where **eight** separate citations (`07:1195`, `1199-1210`, `1207`, `1210`, `1214-1219`,
`1221`, `1225-1231`, `1233`) fall line-for-line on a 38-line dump.

**Anchor 3 — the edit boundary.** Rev 7's authoring runs from transcript line **1872** to **2221**;
the rev-8 narrowing rewrite is transcript line **2281** (`Rewrite 14.3.2 through 14.3.6 for the
narrowed scope`), which replaces file lines 836-1242 wholesale. Nothing edits the contract between
2221 and 2281 except the reads at 2266/2278. So any dump or slice taken between 2221 and 2281 **is**
rev 7.

Locator convention below: *transcript line N* means the Nth physical line of
`0b11d7b9-33b5-4113-a2c3-947908bc754f.jsonl`.

---

## A · §17.1-a — `EF5`, the budget criterion

**What it is.** `EF5`, rev 7's fourth criterion, §14.3.2, rev-7 file lines **914-918**.

**Status: RECOVERED VERBATIM** *(assembled at a recorded edit's own anchor — see provenance)*

```
> - **EF5 budget.** `V.budget` absent ⇒ `not_applicable`. Else if §14.3.5 does not **permit** the
>   comparison for this record, or the record carries no usable price, ⇒ `not_evaluable` — *not*
>   `unsatisfied`; a refusal to compare is never a failure to match (`PB4`, OD-N). Else if `PB6`
>   returns **not comparable** — different currencies, V0 `PR6` — ⇒ `not_evaluable`, for the same
>   reason. Else `satisfied` iff `PB6`'s signed `delta ≤ 0`.
```

**Provenance.** Two sources, joined at the anchor of one recorded substitution:

- the block through *"…(`PB4`, OD-N)."* is quoted verbatim in the rev-5/6 file text carried in
  transcript lines **1229**, **1538** (search `EF5 budget`) and in the diff context at **1250**;
- the tail was replaced by the rev-6 edit at transcript line **1566** (Bash, description
  `Apply EF2-EF5 fixes`, the `sub(...)` tagged `"EF5"`), whose `old` is
  `` `PB4`, OD-N). Else `satisfied`\n>   iff `PB6`'s signed `delta ≤ 0`. `` and whose `new` is
  `` `PB4`, OD-N). Else if `PB6`\n>   returns **not comparable** — different currencies, V0 `PR6` — ⇒ `not_evaluable`, for the same\n>   reason. Else `satisfied` iff `PB6`'s signed `delta ≤ 0`. ``
- no later edit touches it: the string `returns **not comparable**` occurs only at transcript 1566
  and its result 1567; none of the eleven rev-7 edit commands (1872, 1882, 1893, 1900, 1907, 1918,
  1922, 1952, 1960, 1970, 1977) or the four later ones (2002, 2042, 2109, 2113, 2214) rewrites the
  `EF5` rule — their only `EF5` hits are prose references.

**Confidence that this is rev 7: HIGH.**
- the assembled block is exactly **5** lines; `15-delta-review-rev7.md`:87 cites `EF5`, **`07:914-918`** — 5 lines;
- §14.3.2 begins at 836 and §14.3.3 at 920 (anchor 1), so 914-918 is the last rule in §14.3.2, where `EF5` sat;
- `15`:87's paraphrase of the proof — *"`!permitted || !hasPrice || !comparable` ⇒ `not_evaluable`; else `delta ≤ 0`"* — matches this text branch for branch, in order.

**Against the rev-9 reconstruction.** Rev 9 (`07:1521-1525`) writes *"`not_evaluable` when `PB1`
does not permit the comparison, **or** the record carries no comparable price"*. Rev 7 keys the
permission on **§14.3.5**, not on `PB1` by name, and says **"no usable price"**. Rev 9 also drops
the *"— *not* `unsatisfied`; a refusal to compare is never a failure to match (`PB4`, OD-N)"*
clause entirely, which is the clause that ties `EF5` to `PB4`. The reconstruction should be
replaced.

---

## B · §17.1-b — the `price_fallback` class

**What it is.** `GR2`'s eleven-class closed list (rev-7 file lines **1148-1153**) and `EF6`'s
eight-row table with `price_fallback` at **row 5** (rev-7 file lines **1158-1167**), §14.3.6.

**Status: RECOVERED VERBATIM**

```
> - **GR2 (C: MUST)** — every returned record carries **one** match class from the closed list
>   `exact` · `scope_superset` · `scope_subset` · `scope_overlap` · `scope_disjoint` ·
>   `breadth_fallback` · `fallback_from_full` · `unknown_type_fallback` · `price_fallback` ·
>   `area_fallback` · `not_evaluable`, **and** the list of criteria the visitor **stated** that came
>   out `not_evaluable` for that record. A `not_applicable` criterion is never listed: the visitor
>   did not ask.
>
>   **EF6 — the class, a total function of the four criterion states and `R.projectType`, first
>   match wins:**
>
>   | # | condition | class |
>   |---|---|---|
>   | 1 | scope is `unsatisfied` | the §14.3.3 relation — `scope_superset` · `scope_subset` · `scope_overlap` · `scope_disjoint` |
>   | 2 | breadth is `unsatisfied` and `R.projectType == "full_remodel"` | `fallback_from_full` |
>   | 3 | breadth is `unsatisfied` (so `R.projectType == "partial_remodel"`, by `EF2`) | `breadth_fallback` |
>   | 4 | breadth is `not_evaluable` (so `R.projectType` is absent, by `EF2`) | `unknown_type_fallback` |
>   | 5 | budget is `unsatisfied` | `price_fallback` |
>   | 6 | area is `unsatisfied` | `area_fallback` |
>   | 7 | any criterion is `not_evaluable` | `not_evaluable` |
>   | 8 | otherwise | **`exact`** |
>
>   **`EF6` is total and single-valued by construction**: row 8 is unconditional, so some row always
>   fires; *first match wins*, so exactly one does. Every criterion has a row for `unsatisfied`
>   (1, 2/3, 5, 6), row 4 and row 7 cover `not_evaluable`, and `not_applicable` reaches row 8 — which
>   is the point: **`exact` means every criterion the visitor stated was evaluated and satisfied**,
>   and a criterion the visitor did **not** state can never keep a record out of it. Rows 1–4 precede
>   5–6 because a coverage mismatch is a stronger statement about a record than a price one. Row 4
>   precedes row 7 because `unknown_type_fallback` says *which* input was missing, and `PB5` needs
>   that record identifiable. `CINV-20` enumerates the whole input space and asserts both properties.
```

**Provenance.** Transcript line **1582** — Bash, description `Rewrite GR2/EF6/GR3`, the `new`
argument of the single `sub(...)` tagged `"GR2/EF6/GR3"` (rev-6 authoring). Result at 1587.
No later edit: the strings `total function of the four criterion states`,
`` budget is `unsatisfied` | `price_fallback` `` and
`every returned record carries **one** match class` occur in **no** contract edit between
transcript 1582 and the rev-8 rewrite at 2281.

**Confidence that this is rev 7: HIGH.**
- §14.3.6 begins at file line **1146** (anchor 1). Six lines of `GR2` (1148-1153), a `>` (1154), two
  lines of the `EF6` lead-in (1155-1156), a `>` (1157) ⇒ the table header falls on **1158** and the
  eighth row on **1167**; `15`:88 cites `EF6`, **`07:1158-1167`**;
- `15`:88 further says the proof is faithful *"row for row, including row 1 returning the relation
  and **row 7's** `.includes("not_evaluable")` over **all four**"* — only this eight-row, four-criterion
  table has `not_evaluable` at row 7;
- `15`:166 restates the row order as *"`scope_*`(1) · `fallback_from_full`(2) · `breadth_fallback`(3) […]"*, matching rows 1-3 exactly.

**Against the rev-9 reconstruction.** Rev 9 (`07:1531-1536`) says *"`price_fallback` is the
**eleventh** class in `GR2`'s closed list"*. It is the **ninth** name written in a list of eleven
classes. Rev 9's *"row 5 — budget is `unsatisfied` ⇒ `price_fallback` — between the breadth rows and
the area row"* and *"eight rows in rev 7's numbering and eleven classes"* are both correct. The
prose gloss *"so that an over-budget record is labelled over your budget rather than the wrong kind
of job"* is rev 9's own; rev 7's stated reason is the ordering sentence *"Rows 1–4 precede 5–6
because a coverage mismatch is a stronger statement about a record than a price one."*

---

## C · §17.1-c — §14.3.3's budget column, all eight cells

**What it is.** The `budget` column of §14.3.3's scope-relation table, rev-7 file lines
**928-937** (header 928, separator 929, rows 930-937). Rev 9 attests rows 1, 3 and 5 and marks
rows **2, 4, 6, 7, 8 LOST**.

**Status: RECOVERED VERBATIM — all eight rows, plus the three paragraphs that follow the table**

```
| # | condition | relation | budget |
|---|---|---|---|
| 1 | `Q = ∅` — the visitor named **no** scope of any kind | none; scope was not a stated criterion (`EF3`) | **permitted**; `PB0a`'s coverage statement is required |
| 2 | `Q_s = ∅`, `Q_t ≠ ∅` — a **trade-only** request | §14.3.3.1 | §14.3.3.1 |
| 3 | `R_s == Q_s` and `Q_t ⊆ R_t` | `scope_exact` | **permitted**; the trades in `R_t \ Q_t` are disclosed |
| 4 | `R_s == Q_s` and `Q_t ⊄ R_t` | `scope_subset` | **not permitted**; `Q_t \ R_t` is reported as **not established for this case** |
| 5 | `R_s ⊋ Q_s` | `scope_superset` | not permitted — the total bought extra spaces, **which are named** |
| 6 | `R_s ⊊ Q_s` | `scope_subset` | not permitted; the spaces in `Q_s \ R_s` are reported as **not remodelled in this case** |
| 7 | `R_s`, `Q_s` overlap, neither contains the other | `scope_overlap` | not permitted; the spaces in `Q_s \ R_s` are reported as **not remodelled in this case** |
| 8 | `R_s ∩ Q_s = ∅` | `scope_disjoint` | not permitted; the spaces in `Q_s \ R_s` — here all of them — are reported as **not remodelled in this case** |

> **Row 1 has two entry points and they must not diverge.** `EF3` never reaches this table with
> `Q = ∅`: it short-circuits to `not_applicable` first. `PB1`'s `partial_remodel` branch reaches it
> **directly**, for every `Q`, and row 1 is the row it lands on. *(Rev 5 deleted this row, so `PB0`'s
> own worked utterance — "2천만원으로 뭘 할 수 있나요" — fell through to row 4 and budget-matched
> nothing over a corpus containing five partial jobs inside the budget.)*
>
> **Rows 5–8 read `Q_s` only, deliberately.** A visitor who named both rooms and trades gets a class
> computed from the rooms alone. Every one of those rows **refuses** the budget comparison, so no
> price claim can be built on the omission, and the cost is a less informative class. Rows 3 and 4 —
> where the spaces match exactly and the budget may be permitted — are the rows where `Q_t` changes
> the answer, and they read it.
>
> **The relation name is `scope_exact`, never `exact`.** They are different predicates: a row-3
> record that is over budget is classed `price_fallback` by `EF6`, not `exact`. Rev 4 and rev 5 used
> one word for both.
```

`PB7`, the rule that makes the column a function of the row, rev-7 file lines **924-926**,
unchanged since rev 5 (the string `budget permission` appears in no contract edit between
transcript 1538 and 2238):

```
> **PB7 (C: MUST)** — the rows are evaluated **in the order written** and the **first** row whose
> condition holds decides both the relation and the budget permission. Without this the rows
> overlap and one input yields two opposite answers.
```

**Provenance.** Transcript line **1575** — the `bashEditDiff` attached to the tool result of the
edit at transcript 1570 (Bash, description `Apply 14.3.3 table fixes`). Hunk
`@@ -856,13 +856,30 @@`; the text above is that hunk's `+` lines, i.e. the file's own lines as
written, with single backslashes. The same strings appear as the `new` argument of the `sub(...)`
in the command at 1570 (there doubled, being inside a Python literal).
No later edit: the string `not permitted` appears in exactly two contract-touching transcript
entries after 1575 — line **1719** (§14.3.3.1 only, hunk `@@ -925,11 +935,22 @@`, see item D) and
line **2199** (a `04-demo-data-spec.md` edit). The eight-row table is untouched from transcript 1570
until rev 8 deletes the column at 2281.

**Confidence that this is rev 7: HIGH.**
- `15`:90 cites *"§14.3.3's budget column **`07:928-937`**"* — 10 lines = header + separator + 8 rows;
- `15`:99 cites `PB7` at **`07:924-926`**; with §14.3.3's heading at 920 (anchor 1), 920/blank/`**Sets.**`/blank/`PB7`×3/blank places the table header on exactly **928**;
- `15`:260 quotes row 2 of §14.3.3.1 — *"remodelled too, and the total paid for that"* at `07:986` — which is consistent with §14.3.3.1 beginning at 978;
- `15`'s `B7-1` turns on the column being *"a function of the **row**"*, which only this version is.

**Against the rev-9 reconstruction.** Rev 9's three "attested" cells are paraphrases, not rev-7 text:

| row | rev 9 §17.1-c says | rev 7 actually says |
|---|---|---|
| 1 | `**permitted**, with `PB0a`'s coverage statement required` | `**permitted**; `PB0a`'s coverage statement is required` |
| 3 | `**permitted**` | ``**permitted**; the trades in `R_t \ Q_t` are disclosed`` |
| 5 | `**refused** — the total also bought spaces the visitor did not ask about` | `not permitted — the total bought extra spaces, **which are named**` |

Rev 9 also renders the relation column of row 1 as `none` and of row 2 as `§14.3.3.1`, dropping
row 1's parenthetical `; scope was not a stated criterion (`EF3`)`. All eight cells, the relation
column and the three following paragraphs should be replaced with the text above.

The *"Rows 5–8 read `Q_s` only"* paragraph is the one rev 8 kept but **altered**: rev 8's version
drops the sentence *"Every one of those rows **refuses** the budget comparison, so no price claim
can be built on the omission, and the cost is a less informative class."* and the clause *"and the
budget may be permitted"*. That deletion is not recorded anywhere in §17.1.

---

## D · §14.3.3.1's budget column — what §17.1-c's row 2 points at

**What it is.** The trade-only table's `budget` column, rev-7 file lines **935-940** (header 935,
separator 936, rows 937-940), reached from row 2 of item C. Rev 9 marks it **LOST**
(*"per §14.3.3.1's own column — LOST"*).

**Status: RECOVERED VERBATIM**

```
| condition | relation | budget |
|---|---|---|
| `Q_t ⊆ R_t` and `R_s = ∅` | `scope_exact` | **permitted** — but see below: no `partial_remodel` can satisfy `R_s = ∅` |
| `Q_t ⊆ R_t` and `R_s ≠ ∅` | `scope_superset` | not permitted — `R_s` spaces were remodelled too, and the total paid for that |
| `Q_t ⊄ R_t`, `R_t ∩ Q_t ≠ ∅` | `scope_overlap` | not permitted |
| `R_t ∩ Q_t = ∅` | `scope_disjoint` | not permitted |
```

**Provenance.** Transcript line **1719** — `bashEditDiff` of the edit at transcript 1714
(description `Apply section D recommendations`), hunk `@@ -925,11 +935,22 @@`. Row 1 is the `+`
line; rows 2-4 are context lines, i.e. unchanged file text. The first-row-unreachable paragraph and
`INV-30` are added by the same hunk.
No later edit: `not permitted` does not occur in any contract edit after 1719 (see item C).

**Confidence that this is rev 7: HIGH.** `15`:260 quotes row 2's budget cell —
*"remodelled too, and the total paid for that"* — and cites it as **`07:986`**, inside §14.3.3.1
(978-1013 by anchor 1). The `— but see below` qualifier on row 1 exists only from transcript 1719
onward, so the quoted state is this one and not the earlier one.

---

## E · §17.1-d — §14.3.4's price tier

**What it is.** §14.3.4 in full, rev-7 file lines **1014-1031**. Rev 9 marks this **LOST**
(*"Rev 7 carried a second tier scale beside the area one […] no review quotes its bands"*) and tells
V0.3 to re-derive from `OD-N`.

**Status: RECOVERED VERBATIM — and the premise of the LOST marker is wrong**

```
#### 14.3.4 Tiers

Price uses `PB6`'s signed `delta`; the tier reads `|delta|`.

**The area delta** has its own definition, because `PB6`'s is about budgets: with `v` the area the
visitor stated and `r` the record's `property.area.value`, both converted to one unit under `AR4`
and on the same `AR5` basis, `delta_area = (r − v) / v` — the **visitor's** figure is the divisor,
as it is for a budget.

| `|delta|` | tier |
|---|---|
| ≤ 0.10 | `strong` |
| ≤ 0.20 | `acceptable` |
| > 0.20 | `fallback` — no bonus |

> **TI1 (C: MUST)** — a tier is a ranking signal, not a hard filter. Tiers must not be applied so
> that an ordinary request returns zero records (OD-M).
```

**There is no second table.** Rev 7 has **one** band scale, read by both criteria: the price tier is
that scale applied to `PB6`'s signed `delta`, and the area tier is the same scale applied to
`delta_area`. What rev 8 deleted was therefore not a table but (i) the sentence *"Price uses
`PB6`'s signed `delta`; the tier reads `|delta|`."*, (ii) the four words *"as it is for a budget"*,
and (iii) the band table's column header, which rev 7 writes as `` `|delta|` `` and rev 8 writes as
`` `|delta_area|` ``. Rev 8 then added the sentence *"V0.2 has one tier scale, for area. The price
tier is deferred with `PB6` to §17.1."*

**Provenance — the strongest in this report.** A literal slice of the rev-7 file, still on disk:

- `/private/tmp/claude-501/-Users-woops-projects-web-recon-track-b/0b11d7b9-33b5-4113-a2c3-947908bc754f/scratchpad/cut-1434.md`
  (683 bytes, mtime 2026-09-24 19:11 KST)
- produced by transcript line **2278**, Bash, description `Extract sections being moved`:
  `sed -n '1014,1031p' 07-integration-contract-v0.2-candidate.md > $S/cut-1434.md`
- the same 18 lines are echoed into the transcript at line **2279** (the command's own trailing
  `sed -n '1014,1031p'`), so the bytes exist in two independent places.
- its sibling `cut-1435.md` = `sed -n '1032,1145p'` = rev-7 §14.3.5, which is the block rev 8 pasted
  into §17.1's `<details>` and which the contract still carries. That the sibling is verifiably the
  parked §14.3.5 confirms what these two files are.

**Confidence that this is rev 7: VERY HIGH.** Anchor 1's index — printed 84 seconds earlier, at
10:10:37Z — gives `1014:#### 14.3.4 Tiers` and `1032:#### 14.3.5 When a price comparison is
permitted`, so lines 1014-1031 are exactly §14.3.4 and nothing else. The cut is taken at 10:11:01Z;
the first rev-8 edit is at 10:12:20Z. No contract edit exists between 2221 and 2281. Corroborated
independently by `21-pipeline-audit.md`:59, which records the checker's `TIER_ROWS`/`tierOf` as
**FAITHFUL** to *"`07:986-994` […] `delta = (r − v)/v` on the visitor's figure […] bands in order
with a first match"* — the same three bands, the same divisor, the same first-match reading.

**Against the rev-9 marker.** §17.1-d should stop saying LOST and stop nominating `OD-N` as the
re-derivation source. `OD-N`'s *"±10 % strong, ±20 % acceptable, beyond that fallback / no bonus"*
is in fact what rev 7 implemented, but V0.3 does not need to re-derive it: the rule text exists.
The one V0.3 question the recovered text raises and rev 9 could not have known to ask is that rev 7
used **one** scale for two criteria — so restoring the price tier is a change to the *header* of the
in-force area table, not the addition of a second table.

---

## F · §17.1-e — `GR3`'s comparing budget rung

**What it is.** The `nothing but a budget` rung (rev-7 file line **1219**), the `GR3a` row that
selects it (line **1209**), and `GR3`'s direct-answer preamble (lines 1195-1197), §14.3.6.

**Status: RECOVERED VERBATIM — as a direct dump of the rev-7 file, lines 1188-1225**

```
>   was classed `exact` for "주방만 하고 싶어요" — OD-P inverted by the class table. Rev 6 removes
>   the rung predicate from the class entirely: the ladder labels the result, it does not compute it.*
> - **GR3 (C: MUST)** — the **ladder** is the order in which records are **offered**. It is not a
>   separate search and it is **not an input to `EF6`**.
>
>   A record whose `EF6` class is `exact` is a **direct answer**. Every other returned record is a
>   **labelled reference**, its label is its `EF6` class, and the label is **stated, never hidden**
>   (OD-P). **Direct answers are offered first**, among themselves in the default order below; the
>   ladder orders the labelled references that follow. When there are no direct answers the ladder
>   is the whole result.
>
>   **GR3a (C: MUST) — the rows are evaluated in this order and the first whose condition holds
>   decides the rung set.** Without it the rows overlap and one query selects two:
>   *"창호 교체하려는데 34평 전체 리모델링"* has `V.breadth = whole` **and** `Q_s = ∅`, `Q_t ≠ ∅`,
>   so it matches both the whole-home row and the trade-only row.
>
>   | # | condition | row |
>   |---|---|---|
>   | 1 | `V.breadth == whole` | whole-home work |
>   | 2 | `V.breadth == partial` **or** `Q_s ≠ ∅` | partial work, spaces named |
>   | 3 | `Q_s = ∅` and `Q_t ≠ ∅` | trade-only |
>   | 4 | `V.budget` present, `Q = ∅`, `V.breadth` absent | nothing but a budget |
>   | 5 | otherwise | no ladder; the default order below is the whole order |
>
>   The rungs themselves:
>
>   | the visitor asked | rung, in order |
>   |---|---|
>   | partial work, spaces named | `scope_exact` partials → **`scope_superset` partials** (they contain the space asked about and bought more, which `OD-P` names first: *projects containing the requested space*) → `scope_overlap` partials → **`scope_subset` partials** → `full_remodel` records, i.e. `fallback_from_full` (spaces `satisfied` by `PT4`(b); budget per `PB1`) → breadth-absent records whose `R_s ⊇ Q_s`, i.e. `unknown_type_fallback` → `scope_disjoint` partials |
>   | trade-only (`Q_s = ∅`, `Q_t ≠ ∅`) | partial records by §14.3.3.1, in that table's row order → **breadth-absent records whose `R_t ⊇ Q_t`** → `full_remodel` records |
>   | whole-home work | `full_remodel` records → **`breadth_fallback` partials, larger `R_s` first** (a whole-home question answered by the biggest partial the corpus has) → breadth-absent records |
>   | **nothing but a budget** (`V.breadth` absent, `Q = ∅`, `V.budget` present) | records with a **comparable** `pricing.total`, `|delta|` ascending, each carrying `PB0a`'s coverage statement → records with any price → the rest |
>
>   **Every class `EF6` produces is on a rung**, and `price_fallback`/`area_fallback`/`not_evaluable`
>   — which are verdicts about a record's *inputs* rather than its coverage — sort after the
>   coverage classes on whichever rung the record's coverage put it.
>
>   > **Every result has an order, whether or not a ladder applies (`C: MUST`).** The **last two
```

*(The dump ends mid-rule at file line 1225; the remainder of the "Every result has an order"
blockquote, `07:1225-1231`, is not in this dump — `[…]`. Its text is preserved separately in the
recorded rev-7 edit at transcript line **1882**, `sub(...)` tag `"M-5/M-8"`, and it is the ancestor
of rev 8's version at `07:1289-1296`.)*

**Provenance.** Transcript line **2100** — the tool result of transcript line **2099** (Bash,
description `Verify GR3 region reads coherently`), whose command is literally:

```
cd /Users/woops/projects/web-recon-track-b/docs/reports/integration && sed -n '1188,1225p' 07-integration-contract-v0.2-candidate.md
```

The `nothing but a budget` rung's text is independently corroborated as the `new` side of the rev-7
edit at transcript **1882** (Bash, `Fix M-5, M-7, M-8`, `sub(...)` tag `"M-5/M-8"`), where it also
appears unchanged on the `old` side — i.e. it entered at rev 6 (transcript **1582**) and survived
untouched into rev 7.

**Confidence that this is rev 7: VERY HIGH.** The dump is 38 lines and every line number it implies
is cited by the rev-7 reviewer:

| line implied by the dump | `15-delta-review-rev7.md` cites |
|---|---|
| 1195 — *"Direct answers are offered first, among themselves in the default order below"* | `15`:188, `15`:559 (`m7-2`), `15`:562 (`m7-5`) all cite `07:1195` for exactly this |
| 1199-1210 — `GR3a` | `15`:297 *"`GR3a` (`07:1199-1210`)"*; `15`:431 *"`GR3a` (`07:1199-1210`) is a **five-row** first-match table"* |
| 1207 — `GR3a` row 2 | `15`:561 (`m7-4`) *"`GR3a` row 2's condition is `V.breadth == partial` **or** `Q_s ≠ ∅` (`07:1207`)"* |
| 1210 — `GR3a` row 5 | `15`:559 *"`07:1210` (*"the default order below is the whole order"*)"* |
| 1214-1219 — the rungs table | `15`:301 *"the rungs (`07:1214-1219`) were extended row by row"* |
| 1221 — *"Every class `EF6` produces is on a rung"* | `15`:57, `15`:295, `15`:430, `15`:620 all cite `07:1221` |
| 1225-1231 — *"Every result has an order"* | `15`:331, `15`:427 |

Seven independent line citations land exactly. The GR3a table is five rows, which matches
`24-rev9-writeup.md`'s own note (`m8-14`: *"five rows in rev 7, four in rev 8"*).

**Against the rev-9 reconstruction.** Rev 9 (`07:1563-1576`) reproduces the rung text correctly but
attaches the **wrong trigger**: it says the rung was *"selected when the visitor stated a budget and
neither breadth nor scope, and reached only **'when no record is a direct answer'**"*, citing
`13`:77. That quoted trigger is **rev 6's** GR3 preamble. Rev 7 replaced it: the rung set is chosen
by `GR3a` row 4 (`07:1209`), and the preamble reads *"Direct answers are offered first, among
themselves in the default order below; the ladder orders the labelled references that follow. When
there are no direct answers the ladder is the whole result."* — the ladder is no longer conditional
on there being no direct answer. Rev 9's first parked defect (*"it was dead on its own worked
utterance, because the 'no direct answer' trigger fails as soon as any record is `exact`"*) is
therefore a defect of **rev 6**, already repaired in rev 7, and §17.1-e states it as live.
The second defect it records — *"`|delta|` ascending is a price ordering key"* — stands.

---

## G · §17.1-f — `CINV-6` and `CINV-11`

**What it is.** The two §15 consumer invariants whose rows rev 8 emptied into pointers, rev-7 file
§15 (1308-1363).

**Status: RECOVERED VERBATIM**

```
| `CINV-6` | `PB6`: every cell of the 3 × 2 predicate table, including `max` × `range` straddling, shared-endpoint overlap, and different-currency ⇒ not comparable |
```

```
| `CINV-11` | `PB6` sign: a case **under** budget and a case equally far **over** it are not treated alike (`delta` is signed; only `delta ≤ 0` is *satisfied*) |
```

**Provenance.** Transcript line **1598** — `bashEditDiff` of the §15 table rewrite; both rows appear
as **context** lines (unchanged file text) in the hunk that rewrites the neighbouring `CINV-9` and
`CINV-13` rows. `CINV-11` also appears as a context line in the earlier diff at transcript **1250**,
with byte-identical text, so the row is stable across rev 5 → rev 7.
No later edit: `every cell of the 3 × 2 predicate table` and
`case **under** budget and a case equally far` occur in no contract edit after 1598; their next
occurrences (2318/2330) are inside `17-delta-review-rev8.md`.

**Confidence that this is rev 7: HIGH.** The rows are untouched between transcript 1598 (rev-6
authoring) and rev 8's `M8-1` deletion; `13-delta-review-rev6.md`:464 and `11-delta-review-rev5.md`:508
both re-verify *"every cell including `max` × `range` and shared-endpoint overlap"* against the same
wording, and `17-delta-review-rev8.md`:583 records the rows as having become empty pointers only at
rev 8.

**Against the rev-9 reconstruction.** Rev 9 (`07:1578-1583`) says `CINV-6` tests *"its **cells** —
including `max` × `range` and shared-endpoint overlap"*. It drops the third conjunct,
**`and different-currency ⇒ not comparable`**, which is the conjunct that ties `CINV-6` to `EF5`'s
not-comparable branch (item A). `CINV-11`'s gloss in rev 9 — *"the **sign** of `delta`, negative
meaning the case costs less than the visitor said"* — is a paraphrase; the row's own text adds the
operative half, *"only `delta ≤ 0` is *satisfied*"*.

---

## H · What is still not recovered

Nothing on §17.1's list. For completeness, two adjacent things this recovery did **not** try to
establish, so that no one reads more into it than it says:

1. **The tail of `Every result has an order`** (rev-7 `07:1225-1231`) is cut off in item F's dump at
   line 1225. Its rev-7 text is available as the `new` side of transcript **1882**'s `"M-5/M-8"`
   substitution, and no edit touches it afterwards, so it is recoverable on the same basis as items
   A/B — it simply was not on §17.1's list and is not claimed here.
2. **Rev 7's `PB1`** is *not* a loss: it was parked correctly and the contract still carries it in
   §17.1's `<details>` block, which is `cut-1435.md` — `sed -n '1032,1145p'` of the rev-7 file. This
   recovery confirms that block's provenance rather than replacing it.

---

## Summary

| item | status | confidence it is rev 7 | replaces a §17.1 reconstruction / LOST marker? |
|---|---|---|---|
| **A** §17.1-a `EF5` | **RECOVERED VERBATIM** (assembled at a recorded edit anchor) | HIGH — 5 lines vs `15`:87's `07:914-918`; branch-for-branch match to the audited proof | **Yes** — replaces the reconstruction; rev 9 mis-states the permission source (`PB1` → §14.3.5) and drops the `PB4` clause |
| **B** §17.1-b `price_fallback` | **RECOVERED VERBATIM** | HIGH — table lands exactly on `15`:88's `07:1158-1167`; row 7 / four-criterion shape confirmed | **Yes** — replaces the reconstruction; correct *"ninth of eleven"*, not *"eleventh"* |
| **C** §17.1-c §14.3.3 budget column | **RECOVERED VERBATIM** — all 8 cells | HIGH — `15`:90 `07:928-937`; `PB7` at `07:924-926` | **Yes** — clears all five LOST markers **and** replaces the three paraphrased "attested" cells |
| **D** §14.3.3.1 budget column | **RECOVERED VERBATIM** | HIGH — `15`:260 quotes row 2 at `07:986` | **Yes** — clears §17.1-c row 2's *"per §14.3.3.1's own column — LOST"* |
| **E** §17.1-d §14.3.4 price tier | **RECOVERED VERBATIM** | VERY HIGH — literal `sed` slice of the rev-7 file, 84 s after the index that bounds it, 79 s before the first rev-8 edit | **Yes** — clears the LOST marker outright; also corrects the premise (one scale, not a second table) and retires the `OD-N` re-derivation instruction |
| **F** §17.1-e `GR3` budget rung | **RECOVERED VERBATIM** (dump truncated at `07:1225`, marked `[…]`) | VERY HIGH — 7 independent line citations in `15` land exactly; five-row `GR3a` matches `m8-14` | **Yes** — replaces the reconstruction and **corrects a wrong trigger**: rev 9 quotes rev 6's *"when no record is a direct answer"*, and the first parked defect against the rung is a rev-6 defect rev 7 had already fixed |
| **G** §17.1-f `CINV-6`/`CINV-11` | **RECOVERED VERBATIM** | HIGH — context lines of an unrelated hunk; byte-stable rev 5 → rev 7 | **Yes** — replaces the reconstruction; restores `CINV-6`'s dropped third conjunct |

**Totals: 7 recovered verbatim · 0 partial · 0 not recoverable.**
**§14.3.4's price tier: found** — item E, from a surviving literal slice of the rev-7 file.

Two claims in the contract's §17.1 are falsified by this recovery and are the owner's call, not
this worker's: *"Rev 7's file is unrecoverable"* (true of the repository, false of the session
record, and two 2026-09-24 scratchpad files are one `rm -rf /private/tmp` from making it true), and
the two **LOST** markers. Nothing in this report edits the contract.

---

## I · What was applied to §17.1

Written after the recovery above, on the coordinator's instruction. **One file changed**:
`docs/reports/integration/07-integration-contract-v0.2-candidate.md`, **§17.1 only**. Verified by
diff against `archive/07-rev9-2026-09-24.md`: outside §17.1 the file is byte-identical except the
two lines named in item 7 below. No in-force rule, no other section and no other file was touched.
The contract went from 2,486 to 2,715 lines.

### The edits

1. **The "unrecoverable" paragraph** (`07:1510-1515` as it was) is replaced. It now says what is
   still true — untracked, no committed ancestor, no copy in the repository — and corrects the
   inference drawn from it, names the three classes of surviving evidence, and states that both
   `LOST` markers are withdrawn and all five reconstructions replaced. Rev 9's own summary sentence
   about rev 8 is left standing, because it was a statement about rev 8 and is correct.

2. **A provenance convention** is stated once, in that same place: every parked passage carries
   *(RECOVERED VERBATIM — …)* with its locator; anything without the marker is commentary about the
   rule, never the rule. The **one** transcription liberty is declared explicitly — rev 7 carried
   these lines inside its own sections' blockquotes, so the leading `> ` depth differs and nothing
   else does, which is the convention §17.3 already uses.

3. **A "do not harmonise" instruction** is added: the parked text is rev 7's, it contradicts V0.2 in
   four places, and those are listed rather than resolved.

4. **§17.1-a … §17.1-f** are replaced with the recovered verbatim text from items A-G above, each
   with its locator, and each followed by a short *What the replaced reconstruction said* note so
   the difference between rev 9's paraphrase and rev 7's text is itself recorded and cannot be
   re-lost. §17.1-c gained §14.3.3.1's four-row table (item D) and `PB7` (924-926).

5. **New subsection, `#### Where the recovered rev-7 text contradicts a V0.2 rule`** — four rows,
   stated and not resolved (listed again below). It also records the two silent **alterations** the
   recovery exposed, which no change log carries: rev 8 kept §14.3.3's *"Rows 5–8 read `Q_s` only"*
   paragraph but dropped two of its clauses, and rev 7's §14.3.4 divisor sentence lost four words.

6. **Three instructions to V0.3 are withdrawn in place**, each with its reason:
   - §17.1-c's *"V0.3 must re-derive the whole column rather than trust a majority"* — there is
     nothing to re-derive;
   - §17.1-d's *"V0.3 should re-derive the table from `OD-N`"* — **removed** as the coordinator
     directed, because it told V0.3 to reconstruct something that needs no reconstruction. The
     sentence is quoted as withdrawn rather than deleted silently, and `OD-N` is noted as the reason
     the misreading was plausible (its bands are the ones rev 7 implemented) rather than as a source;
   - §17.1-e's first parked defect (*"dead on its own worked utterance"*) is **struck as a
     precondition and kept as history**, with the reason written out: it is rev 6's defect, rev 7
     fixed it by the preamble change now printed there, and `15-delta-review-rev7.md`:427 records
     `M-5` as *"CLOSED as text"*. A parked defect that was already fixed misleads V0.3 exactly as
     much as one that was never recorded. §17.1-e's **second** defect (`|delta|` ascending is a price
     ordering key) stands unchanged.

7. **Two lines outside the recovered blocks but inside §17.1.** The `#### What rev 9 fixed in this
   section, and what it could not` heading became `… , what it could not, and what was recovered
   afterwards`, since the section now carries something rev 9 did not do. And the `B7-1` row of the
   *Defects parked* table gained a bracketed **Recovery note**: rev 7's `EF5` reads *"§14.3.5 does
   not permit"*, so the rule text named one permission input and the second reading lived in the
   rev-7 **proof** (`pb1Permits`, `15`:90). The divergence, its consequence and V0.3's obligation
   are unchanged; only the location of the second path is narrowed.

**Not done, deliberately.** Nothing was added to §17.1 that this recovery did not produce. Rev 7's
other three rung rows (partial/spaces-named, trade-only, whole-home) are recovered verbatim in §F
above but are **not** reprinted in §17.1: their subject is the ladder as an ordering device, which is
§17.3's deferral, not §17.1's. §17.1-e marks their place with `[…]` and says where they are. The
tail of *Every result has an order* (`07:1225-1231`) is likewise recovered here and not reprinted
there, for the same reason. No recovered text was edited, modernised or reconciled with a rev-9 rule.

### Before / after

| item | before (rev 9) | after |
|---|---|---|
| §17.1-a `EF5` | **reconstruction** | **RECOVERED VERBATIM**, rev-7 `07:914-918`, with locator; reconstruction's three differences recorded |
| §17.1-b `price_fallback` | **reconstruction** | **RECOVERED VERBATIM**, rev-7 `GR2` `07:1148-1153` + `EF6` `07:1158-1167`; *"eleventh class"* corrected to ninth name of eleven |
| §17.1-c rows 1, 3, 5 | **attested** (in fact paraphrase) | **RECOVERED VERBATIM**; the three paraphrases printed side by side with the originals so the mislabel is on the record |
| §17.1-c rows 4, 6, 7, 8 | **LOST** | **RECOVERED VERBATIM** |
| §17.1-c row 2 (→ §14.3.3.1's column) | **LOST** | **RECOVERED VERBATIM**, four rows, rev-7 `07:983-988` |
| §17.1-c `PB7` | quoted in a provenance note | **RECOVERED VERBATIM**, rev-7 `07:924-926`, printed as parked text |
| §17.1-d §14.3.4 price tier | **LOST**, framed as a missing second table, with an `OD-N` re-derivation instruction | **RECOVERED VERBATIM**, whole section, rev-7 `07:1014-1031`; reframed — one scale read by two criteria; `OD-N` instruction **removed** |
| §17.1-e budget rung | **reconstruction**, rev-6 trigger, two live parked defects | **RECOVERED VERBATIM** (rung + `GR3a`'s five-row selector + `GR3`'s preamble); trigger corrected to `GR3a` row 4; **one defect struck with its reason**, one stands |
| §17.1-f `CINV-6`/`CINV-11` | **reconstruction** | **RECOVERED VERBATIM**; `CINV-6`'s dropped third conjunct restored |
| §14.3.3's altered *"Rows 5–8"* paragraph | unrecorded | recorded, and rev 7's version restored to the parked text |
| §17.1's own honesty statement | *"rev 7's file is unrecoverable"* | corrected: unrecoverable from the **repository**, not from the session record |

**Nine of the twelve deferred items changed status** (the five reconstructions, the two `LOST`
markers, §14.3.3.1's column, and `PB7` moving from citation to parked text). The other three —
`PB0`/`PB0a`/`PB1`/`PB2`–`PB6a`'s `<details>` block, `CINV-16`, and the deferred-id list — were
already correct and are untouched.

### Still unrecovered

**Nothing on §17.1's list.** No `LOST` marker survives in §17.1 and no passage there is now labelled
a reconstruction. The only marked gap is the deliberate `[…]` in §17.1-e's rung table, which points
at §F of this report; that is a pointer, not a loss.

### Where recovered rev-7 text contradicts a rev-9 rule

Written into the contract at `#### Where the recovered rev-7 text contradicts a V0.2 rule`, and
repeated here:

1. **`scope_superset`.** Rev 7's §14.3.3 row 5 **refuses** the budget comparison — *"the total
   bought extra spaces, which are named"* — and that refusal was the `OD-O` guard on the relation.
   Rev 9's `D9-2c` makes `EF3` call `scope_superset` **`satisfied`** and gives it its own `EF6` class
   (row 7). The two now say opposite things about the same relation. V0.3 must decide which the
   restored permission follows; restoring `PB1` against rev 9's satisfied state silently drops an
   `OD-O` guard.
2. **The tier table's header.** Rev 7 reads the bands off `` `|delta|` `` for both criteria; V0.2's
   in-force §14.3.4 reads them off `` `|delta_area|` ``. Restoring the price tier is an **edit to an
   in-force table's header** plus one restored sentence — not the addition of a table. Everything
   else in §14.3.4 is already rev 7's.
3. **The ladder.** Rev 7's `GR3a` is a **five-row** selector whose row 4 is the budget rung's
   trigger, and `GR3`'s preamble confines the ladder to labelled references. `D9-1` deleted `GR3a`
   and the rungs; §17.3 parks **rev 8's four-row** `GR3a`, which has no budget row; and *"direct
   answers are offered first"* became a definition over a `GR2a` prefix. There is no ladder left to
   re-attach the rung to, and §17.1-e now holds the only copy of its selector.
4. **`EF5`'s citation dangles.** Rev 7's `EF5` reads *"§14.3.5 does not **permit**"*; V0.2's §14.3.5
   is *"Prices in V0.2 — stated, never compared"* and permits nothing. This is the same defect
   `M8-1` found in the parked `PB1`. It is recorded and **not** repaired, because repairing it would
   mean editing rev 7's text.
