# 24 — Rev 9 write-up: what changed, section by section

| | |
|---|---|
| date | 2026-09-24 |
| author | rev-9 implementer (**not** an independent review) |
| produced | `docs/reports/integration/07-integration-contract-v0.2-candidate.md` **rev 9** (2,481 lines, from rev 8's 1,908) |
| instruction set | `22-rev9-design.md` — live: `D9-1`, `D9-2c`, `D9-4`, `D9-5a`, `D9-6`. Withdrawn and **absent from rev 9**: `D9-2`, `D9-3`, `D9-5` |
| inputs | `17-delta-review-rev8.md`, `17b-fixture-execution-rev8.md`, `20-pipeline-checker.md` §7/§8, `21-pipeline-audit.md`, `19-…-method-change.md` `DM-1` |
| files changed | **one**: the contract. Nothing under `platform/` or `data/` was touched; `04`, `16`, `18` and the proof scripts are **not** edited, and every consequence that lands in them is listed in contract §20.7.5 and in §5 below |
| verification | `npm run proof:ef6` · `npm run proof:pipeline` — §6 |

All `07:` citations are **rev 9** line numbers unless the text says otherwise.

---

## 1. Section by section

### 1.1 Header — `07:5`, `07:7`

`status` and `revision` now say rev 9, name `D9-6` as one change, and cite `22-rev9-design.md`.
The revision row's rev-9 entry names round 8's four inputs and their counts.

### 1.2 §5.3 `PT6` — `07:210-217`

`m7-6` / `m8-7`. The gloss enumerated three grounds for omitting `projectType` and did not cover
`PT5`'s own breadth-absent case (a bounded job whose only work is a trade). A fourth ground is added
and cited to `PT5`, which already states it normatively three paragraphs above. **No rule changes**;
an enumeration that its own neighbour falsified is completed.

### 1.3 §7.4 `WS6` — `07:350-380` — **`D9-5a`, closes `B8-1`**

The dead tie-break is **deleted**. In its place: `Q` carries every reading (`07:350-356`); a worked
derivation on `bi-18` for *"현관 수납"* (`07:358-365`); the rev-9 change note closing `M7-3`
(`07:367-375`); and the **refusal to transcribe** `07:1875`'s *"weaker class, decided once per
query"*, with both grounds (`07:377-384`): a class does not exist until a record is named, so the
two halves cannot both hold — `M7-3` reopened — and `20-pipeline-checker.md` §7 item 4 shows it
overturns `04:701`.

The worked example doubles as the correct derivation of `m8-11` / `X8-24`: `storage` is a **Space**,
so 수납 → `storage` gives §14.3.3 **row 6**, not row 4.

### 1.4 §7.4 `WS9` — `07:444-451`

`m8-3`. The rationale's sole stated reason was *"one utterance gets two opposite **budget
verdicts**"* — deferred machinery cited as live by an in-force rule, outside §14.3's scope note
(`N8-4`). Restated on the **relation and its disclosure**, which are in force. The rule is unchanged.

### 1.5 §14.3 scope note — `07:826-832`

Adds `GR3a`'s rungs to the list of names that are historical, and answers `N8-4` explicitly: the
four in-force citations outside §14.3 are **rewritten**, not covered by a wider disclaimer.

### 1.6 §14.3.1 `V.scope` — `07:850`

`Q` holds one candidate set per `WS6` reading; `Q_s`/`Q_t` are per reading; `EF3` resolves. A query
with nothing ambiguous holds one reading and reads exactly as before.

### 1.7 §14.3.1 `VB3` — `07:866-928` — **`D9-4`, closes `B8-4`**

1. **First-match sentence** (`07:875-878`), the wording `PB7` and `EF6` already carry.
2. **Rows renumbered and reordered** (`07:880-888`). The negation row moves from 4th to **1st**, so
   *"집 전체는 아니고 바닥이랑 도배만 하려고요"* is `partial`, not `whole`. No row's condition is
   narrowed — the overlaps are resolved **by ordering**, per `D9-4`.2.
3. **Forms, not literal strings** (`07:890-894`), with the reason: a literal reading makes `04`
   §4.1 row B state no criterion at all and return all 19 records as `exact`.
4. **만 on a quantity is not a space restriction** (`07:896-900`): *"욕실 하나만"* is row 6, a bare
   enumeration, `V.breadth` **absent**.
5. Rev-9 change note (`07:905-919`), and the **undecided remainder written down rather than
   patched** (`07:921-928`): mixed-kind chains (*"바닥이랑 거실만"*) → §18 `Q-26`.

Checked against the checker's three property-1 findings: `큰 공사는 아니고 몇 군데만` → row 4 wins
(`partial`); `집 전체는 아니고 …` → row 1 wins (`partial`); `욕실 하나만` → decided (`absent`).

### 1.8 §14.3.2 `EF1` — `07:937`

The `not_evaluable` gloss said *"this record has no input for it"*. It now reads *"it cannot be
evaluated for this record"* and names the three sources: no input, `WS8`'s dropped id, `WS6`'s
disagreeing readings. Editorial, forced by `D9-5a`; the closure sentence is untouched.

### 1.9 §14.3.2 `EF3` — `07:952`, `07:977-1006` — **`D9-2c` + `D9-5a`**

- Header: computed **per reading**, then resolved (`07:952-953`).
- `partial_remodel` branch: **`satisfied` iff the relation is `scope_exact` or `scope_superset`**;
  `scope_overlap` / `scope_subset` / `scope_disjoint` are `unsatisfied` (`07:977-981`).
- Ambiguity clause (`07:982-991`): same relation under all readings ⇒ that relation; different
  relations ⇒ **`not_evaluable`** and the ambiguity is **disclosed**. *"The state is assigned by
  `EF3` and by nothing else, so `EF1`'s closure is preserved."*
- *A caveated match is not a miss* (`07:993-1001`) — the rev-9 note, with the measured reason.
- Lemma extended (`07:1003-1006`): row 1's relation is additionally never `scope_exact` and never
  `scope_superset`.

### 1.10 §14.3.3 / §14.3.3.1 — `07:1045-1052`, `07:1090-1095`

- New paragraph naming which relations `EF3` calls `satisfied`, and stating that the **relations and
  their disclosures are unchanged** — only two states moved.
- The deferral pointer now says §17.1 was made self-contained.
- §14.3.3.1's `bi-19` note no longer says *"reached through `GR3`'s trade rung"*: the rungs are
  gone, `bi-19` is returned like every record, and its class for a trade-only query
  (`not_evaluable`) is now **fourth of ten** in `GR2a`, not tenth.

### 1.11 §14.3.4 — `07:1114`

Pointer updated: §17.1 records what of the price tier survives (nothing — it is marked **LOST**).

### 1.12 §14.3.5 `PB4` — `07:1137-1150`

`PB4`'s **text is unchanged**. A rev-9 note records that rev 8 contradicted it twice (`B8-3`'s class
order and `X8-17`'s rung partition, which is *"a null that sorts last"* in the rule that looked
innocent), that the strict metamorphic form measured **546 of 893** at rev 8 and **0 of 893** at rev
9, and that **deleting the rungs alone makes it worse (687)**.

### 1.13 §14.3.6 `EF6` — `07:1174-1205` — **`D9-2c`**

- Row 1's class list loses `scope_superset` → `scope_subset` · `scope_overlap` · `scope_disjoint`.
- **New row 7**: *scope is `satisfied` and §14.3.3's relation is `scope_superset`* ⇒ `scope_superset`.
- *otherwise ⇒ `exact`* becomes **row 8**.
- Totality/single-valuedness paragraph re-stated over eight rows (`07:1179-1186`).
- `07:1191-1205` argues the row's **position**: after row 6 (unknown outranks caveated), before row
  8 (`exact` still means nothing was caveated), and unable to fire where no relation exists.

Position matches the audited checker's variant (`contract-pipeline.mjs:930-934`, row 6.5).

### 1.14 §14.3.6 `GR2a` — `07:1207-1237` — **`D9-2c`**

New order: `exact` → `scope_superset` → `unknown_type_fallback` → `not_evaluable` →
`fallback_from_full` → `breadth_fallback` → `area_fallback` → `scope_overlap` → `scope_subset` →
`scope_disjoint`. Verified to be a permutation of `GR2`'s closed list with no duplicates, and
byte-identical to the checker's `D9_2C_ORDER` (`contract-pipeline.mjs:1269-1271`).

Justification rewritten on `EF3` and `PB4`. **`N8-1` fixed**: the `OD-P` citation is withdrawn —
*"full/unknown projects containing the requested space"* is `OD-P`'s **last** rung. `07:1226-1232`
records that reordering alone cannot fix `PB4` and cites the abstract measurements (378 → 288 → 144
of 576) that established it.

### 1.15 §14.3.6 `GR3` / `GR3a` — `07:1239-1311` — **`D9-1`, closes `B8-2`**

- `GR3` is now *"the labelling and the presentation partition"* (`07:1239-1244`).
- **"Direct answers are offered first" becomes a definition** (`07:1246-1251`): *direct answer* =
  membership in a named prefix of `GR2a`'s list, which in V0.2 is its first entry, `exact`. True by
  construction. The 직접 답변 / 참고 사례 grouping survives as a **partition derived from class**.
  Whether the prefix should widen now that `scope_superset` is satisfied → §18 `Q-27`.
- **`GR3a` and the three rung sets are deleted** (`07:1256-1259`) and parked in §17.3.
- *Why* (`07:1261-1269`): the two-ordering collision, and the 299 rung-caused `PB4` violations.
- **The cost, not netted out** (`07:1271-1281`): `OD-P`'s graded ladder is given up; row F's
  whole-home near-misses fall 2→14, 3→15; `GR2a` has no lead-criterion term; this is a **reading**
  of an owner decision and is flagged as one → §18 `Q-28`, first item of rev 10.
- *What it does not give up* (`07:1283-1287`): 0 records lost on any row, prefix holds 10 of 10,
  three repairs named.
- *Every result has an order* (`07:1289-1296`): keys unchanged, *"within a rung"* removed, key (2)'s
  unresolved composition → §18 `Q-29`.
- `CINV-19`'s coverage sentence keeps its two inputs and now **says it is under-specified**
  (`07:1303-1311`) → `M8-7` / §18 `Q-30`.

### 1.16 §15 consumer invariants — `07:1409`, `1410`, `1418`, `1420`, `1424`, `1425`, `1427`, `1429`

| id | change |
|---|---|
| `CINV-4` | *"over all **eight** rows since rev 9"* |
| `CINV-5` | widened from `property.area` only to **every stated criterion** — the breadth arm is where the violations lived (`X8-17`; 299 of 546). The **rule** is unchanged; the fixture's quantifier matches it |
| `CINV-13` | *"never a rung verdict"* → *"never an ordering verdict"* |
| `CINV-15` | `m8-1` — budget verdicts removed from an in-force invariant; restated on the relation and its disclosure; the budget removed from its own utterance; (a) now cites `EF6` row 7 |
| `CINV-19` | states that its two inputs are weaker than `PB0a`'s parked template → `Q-30` |
| `CINV-20` | counts **not** restated as verified: the input-space arithmetic is unchanged, the derived *100 of 192* must be re-derived against the eight-row `EF6`, and what **is** measured for rev 9 is named (totality over 336, 10/10 classes) |
| `CINV-22` | `GR3` is a labelling and a **partition**, not a filter; the ladder half is retired with the ladder; the 0-records-lost measurement is attached |
| `CINV-24` | (a) rung wording removed, `M8-6`/`X8-5` recorded; (c) **`m7-5` / `m8-5` / `X8-12` fixed** — `bi-14` `exact` then `bi-09` `fallback_from_full` |

### 1.17 §17.1 — `07:1479-1610` — **`M8-1` + `M8-2`**

- Title loses *"preserved verbatim"*; `16`'s withdrawn prediction is noted (`DM-2`).
- `CINV-6`/`CINV-11`/`CINV-16` added to the deferred-id list (`07:1493-1496`).
- **New: *What rev 9 fixed in this section, and what it could not*** (`07:1500-1515`) — states that
  five of twelve items were deleted, what that cost (`PB1` points at a column that does not exist),
  and that **rev 7's file is unrecoverable** (untracked, no committed ancestor, no copy in the repo).
- **Five reconstructions**, each labelled with the source that attests it:
  - `07:1517-1526` **§17.1-a `EF5`** — from `15`:87 and `11`:444.
  - `07:1528-1536` **§17.1-b `price_fallback`** — from `15`:167, `13`:163, `11`:97.
  - `07:1538-1555` **§17.1-c §14.3.3's budget column** — rows 1, 3 and 5 attested; rows 2, 4, 6, 7, 8
    marked **LOST**, with the reason V0.3 must re-derive rather than guess (`B7-1` turned on the
    column being read by row).
  - `07:1557-1562` **§17.1-d §14.3.4's price tier** — **LOST**; `OD-N` named as the re-derivation source.
  - `07:1563-1576` **§17.1-e `GR3`'s comparing budget rung** — quoted in full from `13b`:138, trigger
    from `13`:77, with two defects already recorded against it.
  - `07:1578-1583` **§17.1-f `CINV-6`/`CINV-11`** — from `08`:60.
- **New: *Defects parked with the rules*** (`07:1585-1606`) — `B7-1`, `B7-3`, `M7-1`, each with what
  it does in the parked text and what V0.3 must do **before** restoring it. The parked text is left
  exactly as reviewed; a precondition is not a patch.

### 1.18 §17.3 — `07:1747-1786` — new

`GR3a` and the three rung sets, verbatim as rev 8 had them, with the four defects found against them
(`B8-2`/`X8-20`, `M8-6`/`X8-5`/gap 2, `X8-17`, `m8-6`/`m7-4`) and what rev 10 must fix first. This is
`M8-1`'s lesson applied to rev 9's own deletion: **what is parked is printed**.

### 1.19 §18 — `07:1788-1892`

- `Q-21`, `Q-22` annotated (`Q-22` was only properly answered by `D9-4`).
- **`Q-23`, `Q-24`, `Q-25` answered** (`07:1818-1839`).
- **Nine new open questions, each a gap rev 9 declined to patch**: `Q-26` mixed-kind chains ·
  `Q-27` direct-answer prefix width · `Q-28` `OD-P`'s graded ladder / lead criterion ·
  `Q-29` key (2)'s composition (checker gap 7) · `Q-30` `CINV-19` / `PB0a` template (`M8-7`) ·
  `Q-31` `V.area` with no unit — **and an explicit statement that the bare-평 *basis* gap is FALSE
  per `AU-2` and that no rule is added for it** · `Q-32` `not_evaluable`'s two meanings ·
  `Q-33` is three criteria enough (`X8-21`) · `Q-34` `n7-5`/`N8-3`.

### 1.20 §19 — `07:1996-2003`

`m8-2`. *"That is what lets the consumer refuse to compare its total against a 욕실만 budget"* — an
un-hedged live consequence of the deferred budget column — becomes the row-5 relation and its
disclosure, with the refusal hedged to V0.3.

### 1.21 §20.5 — `07:2227`, `07:2235`

`m8-8`/`m7-7`: *"re-verified on all 19"* → **15**, with the four records named and `04:7` flagged.
`m8-14`: the `GR3a` row is annotated — five rows in rev 7, four in rev 8, deleted in rev 9.

### 1.22 §20.6 — `07:2266`, `07:2274`, `07:2278`, `07:2279`

Four false claims corrected in place rather than reworded:
*"verbatim and unweakened"* (`M8-1`); the `B7-2` row (`m8-15` **and** `DM-3`'s withdrawal —
relocated, not removed); the `M7-3` row (`B8-1`, and why the prescription it describes cannot hold);
the `M7-4` row (`M8-4`, seventh consecutive false summary).

`M8-5` was already recorded in rev 8's `GR2a` relaxation row and is left there.

### 1.23 §20.7 — `07:2313-2481` — new

**Per-rule table only.** The head (`07:2321-2330`) states that **no summary claim is made**, that
six revisions asserted one and a reviewer falsified each, that rev 8's was falsified a seventh time,
and that under `DM-1` a relaxation summary is **derived or it is not stated** — the derivation does
not exist yet. No *"everything else — unchanged"* row appears. The phrase *"rev 9 relaxes nothing"*
appears nowhere in the contract.

- **§20.7.1** the four BLOCKERs, plus **`D9-6`'s eight-configuration measurement table** and the
  instruction to *read the fifth row before the last one* (`D9-1` alone = 687, a regression).
- **§20.7.2** the eight MAJORs.
- **§20.7.3** the five rejected alternatives.
- **§20.7.4** every MINOR, NOTE, round-7 carry and `X8-*` finding.
- **§20.7.5** the eight edits `04` / `18` need and rev 9 does not make.
- **§20.7.6** the verification rev 9 **owes and does not claim**.

---

## 2. Disposition of every round-8 finding

### 2.1 BLOCKERs — 4 of 4 fixed

| id | disposition | where |
|---|---|---|
| `B8-1` | **FIXED** — `D9-5a`; the tie-break is deleted, not replaced | `07:350-384` |
| `B8-2` | **FIXED** — `D9-1`; one ordering device, and *"direct answers first"* becomes a definition | `07:1246-1259` |
| `B8-3` | **FIXED** — `D9-2c`; `EF3` state change + `EF6` row 7 + `GR2a` reorder, measured 0 of 893 | `07:977-1001`, `1191`, `1207` |
| `B8-4` | **FIXED** — `D9-4`; first-match + reorder + two readings decided | `07:875-900` |

### 2.2 MAJORs — 8 of 8 dispositioned (6 fixed, 2 recorded)

| id | disposition |
|---|---|
| `M8-1` | **FIXED as far as the evidence allows.** Five reconstructions + two LOST markers; *verbatim* withdrawn. Rev 7's text is unrecoverable and rev 9 says so instead of implying otherwise |
| `M8-2` | **FIXED.** `B7-1`/`B7-3`/`M7-1` recorded in §17.1 with preconditions |
| `M8-3` | **PARTLY FIXED, remainder recorded.** `GR2a` lifts `not_evaluable` 10th→4th so `bi-19` is no longer buried; the class outcome is unchanged and is `Q-33`. The `proof` case-10 half is **carried** (proof file, out of scope) |
| `M8-4` | **FIXED by not making the claim.** §20.7 states no summary; §20.6's `M7-4` row corrected |
| `M8-5` | **FIXED in place** in §20.6; rev 9's own reorder is recorded per rule in §20.7.1 |
| `M8-6` | **FIXED by deletion**, and recorded against the parked text in §17.3 |
| `M8-7` | **RECORDED, not repaired** → `Q-30`. Writing a replacement template is a rule addition no decision covers; `Q-18` is the precedent |
| `M8-8` | **DISPOSITIONED; `04` not edited.** `AU-3` narrows it (no class is stated at `04:699`); row G's *mechanism* sentence dies with the rungs → §20.7.5 item 2 |

### 2.3 MINORs — 16 of 16

| id | disposition |
|---|---|
| `m8-1` | FIXED (`CINV-15`) |
| `m8-2` | FIXED (§19) |
| `m8-3` | FIXED (`WS9`) |
| `m8-4` | CARRIED — `proof/ef6-totality.mjs`, not the contract |
| `m8-5` | FIXED (`CINV-24`(c)) |
| `m8-6` | MOOT in force; RECORDED in §17.3 |
| `m8-7` | FIXED (`PT6`) |
| `m8-8` | FIXED in §20.5; `04:7` carried |
| `m8-9` | CARRIED — proof script |
| `m8-10` | CARRIED to `04` (§20.7.5 item 7) |
| `m8-11` | ANSWERED in the contract (§7.4's worked example); `04:701` carried (§20.7.5 item 3) |
| `m8-12` | CARRIED to `04` (§20.7.5 item 4) |
| `m8-13` | CARRIED to `04` (§20.7.5 item 5) |
| `m8-14` | FIXED (§20.5 `X-1` row) |
| `m8-15` | FIXED (§20.6 `B7-2` row) |
| `m8-16` | CARRIED to `16`; `07`'s own statement is correct and unchanged |

### 2.4 NOTEs — 6 of 6

| id | disposition |
|---|---|
| `N8-1` | FIXED — `OD-P` citation withdrawn from `GR2a` |
| `N8-2` | MOOT — one ordering device, so the two readings no longer exist |
| `N8-3` | OPEN, carried → `Q-34` |
| `N8-4` | FIXED by removing the four citations rather than widening the note |
| `N8-5` | CARRIED into `Q-25`, whose premise (an undetermined order) rev 9 removes |
| `N8-6` | KEPT CLOSED — `M7-2`, `m7-1`, `m7-2`, `n7-1`, `n7-2`, `n7-4` not reopened |

### 2.5 Carried round-7 items

| id | disposition |
|---|---|
| `m7-2` | CLOSED; the one stale §20.5 use (`m8-14`) corrected |
| `m7-5` | FIXED via `CINV-24`(c) |
| `m7-6` | FIXED via `PT6` |
| `m7-7` | FIXED in §20.5 (15 of 19); `04:7` carried |
| `m7-9` | CARRIED to `04` |

### 2.6 `17b` hand-execution findings (`X8-*`)

| id | disposition |
|---|---|
| `X8-3`, `X8-13`, `X8-22` | FIXED by `D9-4` (mixed-kind half of `X8-22` → `Q-26`) |
| `X8-4`, `X8-15` (basis half) | **WITHDRAWN** per `AU-2`; unit half → `Q-31` |
| `X8-5`, `X8-17`, `X8-20` | FIXED with `M8-6` / `PB4` / `B8-2`; recorded in §17.3 |
| `X8-12` | FIXED (`CINV-24`(c)) |
| `X8-23` | FIXED (`WS6`) |
| `X8-24` | ANSWERED in §7.4; `04:701` carried |
| `X8-1` | CARRIED — the `18` authoring pass, whose §7 row I `AU-4` says must be corrected first |
| `X8-6`, `X8-11` | CARRIED, unaddressed — no live decision covers them, and rev 9 invents nothing |
| `X8-19`, `X8-21` | CARRIED as the substance of `Q-33` |
| `X8-2`, `X8-7`…`X8-10`, `X8-14`, `X8-16`, `X8-18` | CARRIED — `04`/corpus notes; the ones needing a `04` edit are in §20.7.5 |

### 2.7 `20` §7's seven recommendations, and `21`'s dispositions

| §7 item | rev 9 |
|---|---|
| 1 `VB3` first-match + forms | **done** (`D9-4`) |
| 2 `GR3` restore-or-delete | **done** — deleted (`D9-1`), the option §7 offered second |
| 3 `D9-1` + `D9-2c` as one change or neither | **done** (`D9-6`), with the cost §7 named recorded as `Q-28` |
| 4 `WS6` — *decide, do not transcribe* | **done**; the transcription is refused in the contract text with both grounds |
| 5 `V.area` *"cannot be resolved ⇒ absent"* | **NOT done, deliberately.** It is a rule addition; and the gap it was written to close (**basis**) is FALSE per `AU-2`. The surviving **unit** gap is `Q-31` |
| 6 *"larger `R_s` first"* | **moot** — dies with the rungs; recorded in §17.3 |
| 7 rename one `not_evaluable` | **NOT done** — a rename is a rule change with reach into `GR2`, `EF6` and every fixture. `Q-32` |

`AU-1` (property 5 vacuous) and `AU-5`/`AU-6` are checker facts; rev 9 records `AU-1`'s consequence
in §20.7.6 — **`EF1` closure is not verified by that checker** and must not be cited as evidence.

---

## 3. Rejected alternatives, with reasons

Recorded in the contract at §20.7.3 (`07:2383-2394`) and repeated here:

| proposal | reason it is absent from rev 9 |
|---|---|
| **`D9-2`** (`not_evaluable` 5th) | its ground is false twice over — `unknown_type_fallback` is a not-evaluable outcome, and three scope classes ranked 2nd–4th are produced by `unsatisfied`. 288 of 576, not 0 |
| **`D9-2b`** (both unknown classes grouped) | 144 of 576. Reordering improves monotonically and never reaches zero; every residual is `scope` |
| **`D9-3`** (restate `PB4`'s assertion) | the same unsatisfiable property, and a relaxation of an assertion in the direction of making it pass. `D9-2c` satisfies the **strict** form, so the strict form was `PB4` all along |
| **`D9-5`** (larger-`Q` tie-break) | the antitonicity claim is false: 5,952 violations of 29,248 pairs. Enlarging `Q` can turn `scope_disjoint` into `scope_subset` |
| **transcribing `07:1875` into `WS6`** | (i) *"weaker class, decided once per query"* cannot hold — no class exists until a record is named; that is `M7-3` shipped inside the sentence closing it. (ii) `20` §7 item 4: it overturns `04:701` — `bi-18`, the one on-point record, drops from `exact` to `scope_subset` while two whole-home remodels stay `exact` |

---

## 4. What I could NOT render from the design doc

Stated explicitly, per the brief.

1. **`D9-5a`'s pre-condition is unmet.** `22-rev9-design.md` §5 item 2 requires a mechanical
   assertion that `EF3` under multiple readings is **total and single-valued** — that *"the readings
   agree"* is decidable for every record — **before** the rule is written. No such assertion exists;
   writing one means editing a proof script, which this task's constraints exclude. The rule is
   written anyway, because leaving `WS6` inoperative (`B8-1`) is worse, and the unmet obligation is
   recorded in the contract at §20.7.6 and is the first item of round 9's verification.
2. **`CINV-20`'s pass-A counts could not be re-derived.** `proof/ef6-totality.mjs` implements rev 8.
   The *100 of 192* vector count depends on `EF3`'s satisfied set, which `D9-2c` changes. Rather
   than restate a stale number as verified — rev 8's exact failure mode — `CINV-20` now says which
   figures are unchanged, which must be re-derived, and what *is* measured for rev 9.
3. **The lead-criterion term is not written**, exactly as `22` §4a instructs. `D9-6`'s row-F cost is
   stated in the rule text (`07:1271-1281`) and carried as `Q-28`, not smuggled in.
4. **`OD-P`'s reading is not resolvable here.** `D9-6` rests on reading `OD-P`'s graded ladder as a
   *mechanism* rather than a *requirement*. That is the design doc's own flag and it is an owner
   call; rev 9 renders the flag, not an answer.
5. **The relaxation derivation does not exist**, so §20.7 makes no summary claim. That is `DM-1`
   applied, not a shortfall in rendering — but it means rev 9 ships **without** an aggregate
   statement about what it relaxes, and a reader who wants one has to compute it.
6. **Rev 7's deleted text is unrecoverable.** §17.1-c is missing five of its eight budget cells and
   §17.1-d is missing its bands entirely. No source in the repository carries them, and the contract
   is untracked with no ancestor. They are marked **LOST** rather than reconstructed by inference,
   because `B7-1` was precisely a divergence between two plausible readings of that column.

Nothing in `D9-1`, `D9-2c`, `D9-4`, `D9-5a` or `D9-6` itself was left unrendered. The three
**withdrawn** decisions (`D9-2`, `D9-3`, `D9-5`) appear in rev 9 only in §20.7.3, as rejected
alternatives with their evidence — never as rules.

---

## 5. Edits rev 9 requires elsewhere and did not make

Contract §20.7.5 is the normative list. In short: `04` §4.1 rows **D** (욕실 하나만 now `absent`),
**G** (trade-rung mechanism), **I** (`storage` is a Space; `WS6` disclosure), **A** (label it
worse); `04:663`; `04:7`; nine stale revision citations in `04`; and `18` §7 row I per `AU-4`.
Proof-script carries: `m8-4` (`rowsThatHold` not independent), `m8-9` (cases 4/5), `M8-3`'s
case-10 `qtSubsetRt`, and making rev 9 the checker's default.

---

## 6. Verification

Both commands were run after the edits. **Neither is a pass for rev 9, and neither was expected to
be**: `proof/ef6-totality.mjs` implements rev 8, and `proof/contract-pipeline.mjs` implements rev 8
by default with rev 9's configuration behind flags. What they are used for here is the negative
check the brief asks for — **that rev 9 contradicts nothing the checker asserts structurally.**

### `npm run proof:ef6` — **PASS**, exit 0

```
PASS A, derived from EF2..EF4:   1512 inputs · 100 of 192 vectors · 10/10 classes
PASS B, raw cross-product:       336 evaluations · 10/10 classes
worked cases from rounds 4-7:    11
PASS — EF6 total, class in GR2's closed list, first-match-wins row by row, `exact`
       exactly when no stated criterion missed, row 1 only for a partial_remodel.
       GR2a is a permutation of GR2's list. No class orphaned.
```

This is **rev 8's** `EF6` and **rev 8's** `GR2a`; it is unchanged by my edits, as expected, and it
is why `CINV-20`'s derived counts are marked for re-derivation rather than restated.

### `npm run proof:pipeline` — 6 properties **FAIL**, exit 0 (no crash)

Identical to the pre-edit run, since the checker encodes rev 8 rather than reading the markdown:
property 1 FAIL (3), property 2 FAIL (3), property 3 FAIL (29), property 4 FAIL (77), property 5
FAIL (2), property 6 FAIL (7); 8 underdetermined gaps; 31 branches over 26 utterances.

**The four structural assertions, checked against rev 9:**

| assertion | checker output | rev 9 |
|---|---|---|
| `EF6` **total and single-valued** | `336 raw cross-product inputs: 0 with no row, 0 where the returned row was not the lowest holding` — and under the rev-9 variant, `totality over 336 raw vectors: 0 with no row, 0 not-first-match` | **not contradicted.** Row 8 is unconditional; *first match wins* is stated; the new row 7 sits between 6 and 8 exactly where the variant puts it (`contract-pipeline.mjs:930-934`) |
| **10 classes reachable** | variant: `classes reached on the REAL corpus (31 branches): 10/10`, `raw sweep: 10/10`; variant + `D9-2c` order: `10/10` | **not contradicted.** No class is orphaned by row 7 or by the reorder |
| `GR2a` a **permutation** of `GR2` | `GR2a permutation of GR2's closed list: yes` | **not contradicted** — re-verified independently: 10 entries, no duplicates, same multiset, and byte-identical to the checker's `D9_2C_ORDER` (`contract-pipeline.mjs:1269-1271`) |
| `EF1` **closure** | property 5 FAIL, 2 findings — **both about naming**, not about a state assigned outside `EF2`–`EF4` | **not contradicted.** `D9-5a` states *"the state is assigned by `EF3` and by nothing else"*. The name collision is recorded as `Q-32`, and §20.7.6 records `AU-1`: this checker cannot verify closure and must not be cited as evidence for it |
| **eight tables' first-match semantics** | `14.3.3` 240 multi-row inputs *"all resolved by `PB7`, which the table states"*; `14.3.3.1` 0 multi-row; `EF6` 0 not-first-match; `GR3a` 11 multi-row *"resolved by 07:1086, which the table states"*; **`VB3` 3 conflicts, no rule** | **not contradicted, and one is repaired.** `VB3` is the only table that lacked the sentence and now has it; the three reported conflicts resolve to `partial` / `partial` / `absent` under rev 9's row order. `GR3a` is deleted, so its 11 multi-row inputs no longer exist |

The `PB4` and ordering numbers quoted throughout rev 9 come from the checker's own flagged runs,
which were re-confirmed in this session: rev 8 **546** of 893; variant alone **550**; `D9-2c` order
alone **299**; `D9-1` alone **687**; `D9-1` + variant **691**; `D9-1` + order **1**; all three
**0**. Property 3: 29 of 31 at rev 8, 0 of 31 under `D9-1`.
