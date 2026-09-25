# 30 — Fixture execution by hand, contract rev 9.1

**What this is.** One person executing `docs/reports/integration/07-integration-contract-v0.2-candidate.md`
revision 9.1 §14.3 on paper, over the 19 records in
`data/sites/boost-interior-demo/content/projects.json`, for the nine utterances in
`docs/result/interior-portfolio-v0.2/04-demo-data-spec.md` §4.1 rows A–I.

**Method constraints honoured.** No code was written or run. Nothing in
`docs/result/interior-portfolio-v0.2/` was read except `04-demo-data-spec.md`; `proof/` was not
opened. The data was read from `projects.json` directly, not from the spec's prose. Arithmetic is
by hand; every tier and `|delta_area|` figure below is shown so it can be checked.

**Sources of rules.** §5–§9 (fields), §13 (category audit), §14.3 and its sub-sections, §15
(invariants), §18 (open questions). §17.1 and §17.3 were read only far enough to confirm what is
parked; **no parked rule was executed**. `PB0`/`PB0a`/`PB1`/`PB1a`/`PB3`/`PB3a`/`PB6`/`PB6a`/`EF5`,
`GR3a`'s rungs and the class `price_fallback` are treated as not in force.

**Headline.** 3 of the 9 rows execute unambiguously end to end. 6 of the 9 disagree materially with
§4.1's expected answer. The worst obstacle is not any single rule but the combination that fires on
rows D and I: once `VB3` leaves `V.breadth` **absent** — which it now does for 하나만, 두 개 and
현관 수납 — `EF3`'s `full_remodel` branch makes the spaces half `satisfied` for **any** `Q_s`, and
nothing in the three criteria or the five ordering keys can then distinguish a 7,000,000 one-bathroom
job from a 50,000,000 whole-home remodel. The record that answers the question is displaced by
records that answer a different one.

---

## 0. The corpus as I parsed it

`projects.json` carries the authoring-side names (`totalPrice`, `pricePerArea`, `styles`,
`propertyType`); I read them as the V0.2 wire fields `pricing.total`, `pricing.perArea`,
`facets.style`, `property.type` per §10.1 (`07:688`–`697`). Spaces/Works split per §7.3
(`07:288`–`320`).

| id | `projectType` | `R_s` (Spaces) | `R_t` (Works) | area | pricing | `publishedAt` |
|---|---|---|---|---|---|---|
| bi-01 | full | entrance, kitchen, bathroom | flooring, lighting, built_in_furniture | 34 py supply | perArea 2,900,000 **authored**, no total | 2026-08-28 |
| bi-02 | — | kitchen | flooring, built_in_furniture | 24 py supply | perArea 2,400,000 authored | 2026-07-30 |
| bi-03 | — | entrance | lighting, built_in_furniture | 42 py supply | perArea 3,200,000 authored | 2026-06-25 |
| bi-04 | partial | kitchen, bathroom | — | 32 py supply | **none** | 2026-05-21 |
| bi-05 | — | — | flooring, painting, built_in_furniture | 29 py supply | perArea 2,600,000 authored | 2026-04-16 |
| bi-06 | partial | entrance, living_room | lighting | 34 py supply | **none** | 2026-03-19 |
| bi-07 | full | kitchen | flooring, doors, built_in_furniture | 19 py supply | perArea 2,700,000 authored | 2026-02-12 |
| bi-08 | — | living_room | lighting | 51 py supply | perArea 1,600,000 authored | 2026-01-08 |
| bi-09 | full | entrance, kitchen, bathroom | flooring, wallpaper, lighting, built_in_furniture | 34 py supply | total exact 50,000,000 | 2025-12-11 |
| bi-10 | full | entrance, living_room, kitchen, bedroom, dressing_room, bathroom | windows, expansion, built_in_furniture | 34 py supply | total exact 85,000,000 | 2025-11-20 |
| bi-11 | full | kitchen, bathroom | flooring, wallpaper, doors | 20 py supply | total exact 30,000,000 | 2025-10-23 |
| bi-12 | full | entrance, kitchen, bathroom | flooring, lighting, built_in_furniture | 26 py supply | total exact 52,000,000 | 2025-09-25 |
| bi-13 | full | entrance, living_room, dining, kitchen, kids_room, dressing_room, study, bathroom | windows, lighting, built_in_furniture | 48 py supply | total **range** 125,000,000–140,000,000 | 2025-08-28 |
| bi-14 | partial | kitchen | — | 84 m² **exclusive** | total exact 15,000,000 | 2025-07-31 |
| bi-15 | partial | bathroom | — | **absent** | total exact 7,000,000 | 2025-07-03 |
| bi-16 | partial | kitchen, bathroom | — | 38 py supply | total exact 19,800,000 | 2025-06-05 |
| bi-17 | partial | living_room | flooring | 112 m² supply | total exact 12,500,000 | 2025-05-08 |
| bi-18 | partial | entrance | built_in_furniture | 30 py supply | total exact 6,200,000 | 2025-04-10 |
| bi-19 | — | — | flooring, wallpaper, lighting | 32 py supply | total exact 11,000,000 | 2025-03-13 |

`AR4` conversion (`07:238`): 1 pyeong = 400/121 m². So **84 m² = 25.41 py**, **112 m² = 33.88 py**.
`|delta_area|` is a ratio, so the choice of target unit does not change any tier — that much is
well-defined.

**Standing decisions I had to make once, applied to every row.** Each is marked in the findings
table.

- The consumer is assumed to know all 26 §7.3 ids, so `WS8`'s dropped-id branch never fires and no
  `partial_remodel` is `not_evaluable` on that ground. Nothing in §4.1 posits an ignorant consumer.
- A bare 평 figure states **no basis**. `PY1` (`07:246`) derives basis from the visitor's words
  (*"전용 84㎡"* states exclusive); it says nothing that lets a bare 평 imply 공급. `AR5` refuses only
  when **both** bases are known and differ; "one unknown basis lowers confidence" is carried as a
  disclosure by `EF4` (`07:1071`–`1074`), not as a state. §18 `Q-31`'s parenthetical confirms this
  reading is the intended one.
- `EF3`'s ambiguity rule 1 (`07:1011`) says the readings disagree on "different criterion states
  **OR** different relations". For a `full_remodel` or a breadth-absent record **no relation is
  computed at all**. I take absent-relation == absent-relation as *agreement*. See `X9-19`.

---

## Row A — "34평 전체 5천이면 되나요"

### Extraction

| field | value | licensed by |
|---|---|---|
| `V.breadth` | `whole` | `VB3` row 2 (`07:891`) + the forms-not-strings clause (`07:898`), which names *"34평 전체"* as row 2 explicitly. Rows 1 is tried first and does not match. |
| `V.scope` | `Q = ∅` | no space and no trade named (`07:862`) |
| `V.area` | 34, pyeong, **basis absent** | `07:863` |
| `V.budget` | `exact {50,000,000}` — **guessed**, see `X9-1` | `VB1` (`07:867`) says *"5천"* is `exact`. But *"…이면 되나요"* is a ceiling question and `VB1`'s `max` exemplars are 이내/최대. I took `VB1`'s own worked exemplar. Not load-bearing: budget is not a criterion (`07:864`). |
| `V.styles` | none | |

### Criteria (`EF2`/`EF3`/`EF4`)

Scope is `not_applicable` for all 19 (`Q = ∅`, `07:960`). Breadth: `satisfied` for the 7 fulls,
`unsatisfied` for the 7 partials, `not_evaluable` for the 5 breadth-absent.

Area, `v = 34`:

| record | r (py) | delta | tier | state |
|---|---|---|---|---|
| bi-01 | 34 | 0 | strong | satisfied |
| bi-06 | 34 | 0 | strong | satisfied |
| bi-09 | 34 | 0 | strong | satisfied |
| bi-10 | 34 | 0 | strong | satisfied |
| bi-17 | 33.88 | −0.0035 | strong | satisfied |
| bi-04 | 32 | −0.0588 | strong | satisfied |
| bi-19 | 32 | −0.0588 | strong | satisfied |
| bi-16 | 38 | +0.1176 | acceptable | satisfied |
| bi-18 | 30 | −0.1176 | acceptable | satisfied |
| bi-05 | 29 | −0.1471 | acceptable | satisfied |
| bi-03 | 42 | +0.2353 | fallback | unsatisfied |
| bi-12 | 26 | −0.2353 | fallback | unsatisfied |
| bi-14 | 25.41 | −0.2526 | fallback | unsatisfied |
| bi-02 | 24 | −0.2941 | fallback | unsatisfied |
| bi-11 | 20 | −0.4118 | fallback | unsatisfied |
| bi-13 | 48 | +0.4118 | fallback | unsatisfied |
| bi-07 | 19 | −0.4412 | fallback | unsatisfied |
| bi-08 | 51 | +0.5 | fallback | unsatisfied |
| bi-15 | **absent** | — | — | **not_evaluable** |

bi-14 is compared **across bases** — 34평 (basis unstated) against 84 m² exclusive — because `AR5`
only refuses two *known* different bases. `04` §4 E8 (`04:668`) calls bi-14 "the never-convert trap";
the trap does not spring here. See `X9-16`.

### `EF6` (`07:1262`–`1269`, first match)

| class | records |
|---|---|
| `exact` (row 8) | **bi-01, bi-09, bi-10** |
| `unknown_type_fallback` (row 4) | bi-02, bi-03, bi-05, bi-08, bi-19 |
| `breadth_fallback` (row 3) | bi-04, bi-06, bi-14, bi-15, bi-16, bi-17, bi-18 |
| `area_fallback` (row 5) | bi-07, bi-11, bi-12, bi-13 |

bi-15 reaches row 3 before row 6, so it is `breadth_fallback` with `area` in its `GR2`
not-evaluable list — not class `not_evaluable`.

### Order (`GR2a` `07:1316`, then keys `07:1398`–`1405`)

1. bi-01, 2. bi-09, 3. bi-10 — key 2 ties at 0, key 3 is 0 for all (`Q = ∅`), key 4 decides.
4–8. bi-19 (.0588), bi-05 (.1471), bi-03 (.2353), bi-02 (.2941), bi-08 (.5)
9–15. bi-06 (0), bi-17 (.0035), bi-04 (.0588), bi-16 (.1176), bi-18 (.1176), bi-14 (.2526) — bi-16
before bi-18 by key 4 — **plus bi-15, whose position is undetermined**.
16–19. bi-12 (.2353), bi-11 (.4118), bi-13 (.4118), bi-07 (.4412).

**Dead end.** bi-15 has no area, so key (2) skips it (`07:1399`–`1401`). §18 `Q-29` (`07:2215`)
records the three readings of what "keeps the position the previous key gave it" means and declares
**all three dead**. The result therefore has no defined order. `CINV-21` (`07:1551`) requires one.

### Prices — `GR1` / `GR5` / `GR5a`

- bi-01 (#1): **no statable price.** Its only price is an authored `perArea`, which `GR4`
  (`07:1442`) withholds because the visitor did not ask about a per-area price, and it has no total.
  `CINV-19` (`07:1549`) requires each shown record's price be told as a fact because the visitor
  stated a budget. Unsatisfiable for bi-01. See `X9-11`.
- bi-09: 50,000,000 — statable. Note 50,000,000 = bi-10's derived `perArea` 2,500,000 × bi-11's 20평,
  a **forbidden product** under `GR5` (`07:1449`); `GR5a` (`07:1458`) exempts it because it is
  bi-09's own `total.amount` and the statement is about bi-09. Exactly the case `GR5a` exists for.
- bi-10: 85,000,000 — statable.
- Forbidden: any yes/no against 5천, any "예산에 맞습니다". The budget 50,000,000 is itself a `GR5`
  price amount, so 50,000,000 ÷ 34 = 1,470,588 and ÷ 20 = 2,500,000 must not appear.

### vs §4.1 row A (`04:693`)

**Agrees.** bi-09 `exact`, bi-01/bi-10 also `exact`, bi-12 `area_fallback`, no budget verdict — all
four claims confirmed. Two notes: 04 leads with bi-09 but the derived order leads with bi-01
(publishedAt), and bi-01 arrives with nothing to say about price.

---

## Row B — "예산 3천으로 전체 가능해요?"

### Extraction

`V.breadth = whole` — `VB3` row 2 via the forms clause, which names *"전체 가능해요"* verbatim
(`07:900`). `Q = ∅`. `V.area` absent. `V.budget`: *"3천으로"* fits none of `VB1`'s three shapes
literally — it reads as a ceiling but is not 이내/최대 — so strictly `VB1`'s *"cannot be resolved ⇒
absent, never guessed"* applies. I record it as **absent** and note that 04 treats it as a budget.
Not load-bearing (`X9-1`).

### Criteria

Breadth as row A. Scope `not_applicable`. Area **`not_applicable` for all 19** (`V.area` absent).

### `EF6`

| class | records |
|---|---|
| `exact` | **bi-01, bi-07, bi-09, bi-10, bi-11, bi-12, bi-13** (seven) |
| `unknown_type_fallback` | bi-02, bi-03, bi-05, bi-08, bi-19 |
| `breadth_fallback` | bi-04, bi-06, bi-14, bi-15, bi-16, bi-17, bi-18 |

**Cross-check passed.** `CINV-21` (`07:1551`) fixtures *"전체 리모델링 사례 보여주세요"* as "seven
`exact` records, no area, no scope" — the same query shape, the same seven. `CINV-24`(a)
(`07:1554`) requires bi-15 `breadth_fallback` — confirmed.

### Order

Key 2 is never in force (no `V.area`); key 3 is 0 for everyone; **no record is skipped by any key**,
so the order is fully determined by key 4.

1–7. bi-01, bi-07, bi-09, bi-10, bi-11, bi-12, bi-13
8–12. bi-02, bi-03, bi-05, bi-08, bi-19
13–19. bi-04, bi-06, bi-14, bi-15, bi-16, bi-17, bi-18

### Prices

bi-01 (#1) and bi-07 (#2): **no statable price** — authored `perArea` only, withheld by `GR4`.
bi-09 (#3): 50,000,000. bi-11, which 04 discusses, is 5th and is not promoted. ✓

### vs §4.1 row B (`04:694`)

**Disagrees, twice.**

1. *"Every `full_remodel` record qualifies as `exact` … **each with its own total stated**"* — false
   on the live data. bi-01 and bi-07 have **no total at all**, and `GR4` withholds the only price
   they do have. The top two results of a budget question are silent about money. (`X9-11`)
2. *"…and is ordered by `GR3`"* — `GR3` has not ordered anything since rev 9. `D9-1` demotes
   *"direct answers are offered first"* to a definition (`07:1350`–`1352`) and `GR2a` states *"since
   rev 9 no other rule orders a result at all"* (`07:1313`). §20.7.5 flags this staleness for row G
   only; row B carries it too. (`X9-21`)

The record set itself is right.

---

## Row C — "주방만 하면 얼마예요"

### Extraction

`V.breadth = partial` — `VB3` row 3 (`07:892`), whose exemplar is 주방**만** verbatim. Rows 1 and 2
are tried first and do not match.
`Q_s = {kitchen}`, `Q_t = ∅` — 주방 → `kitchen` (§7.3 gloss, `07:292`), unambiguous under `WS6`.
`V.area`, `V.budget` absent.

### Criteria

Area `not_applicable`. Breadth: `satisfied` for the 7 partials, `unsatisfied` for the 7 fulls,
`not_evaluable` for the 5 absents.

Scope, `EF3` (`07:960`):
- **fulls** (bi-01, 07, 09, 10, 11, 12, 13): spaces half `satisfied` for any `Q_s` by `PT4`(b);
  trades half `Q_t = ∅ ⊆ R_t` ✓ → **satisfied**. All seven carry `kitchen` in `R_s`, so `Q_s ⊆ R_s`
  holds and the ground-not-conclusion clause (`07:976`) permits either sentence.
- **breadth-absent** (bi-02, 03, 05, 08, 19): `not_evaluable`.
- **partials**, §14.3.3 first match (`07:1074`–`1087`):

| record | `R_s` | first matching row | relation | state |
|---|---|---|---|---|
| bi-04 | {kitchen, bathroom} | 5 (`R_s ⊋ Q_s`) | `scope_superset`, extra = {bathroom} | satisfied |
| bi-14 | {kitchen} | 3 (`R_s == Q_s`, `Q_t ⊆ R_t`) | `scope_exact` | satisfied |
| bi-16 | {kitchen, bathroom} | 5 | `scope_superset`, extra = {bathroom} | satisfied |
| bi-06 | {entrance, living_room} | 8 | `scope_disjoint` | unsatisfied |
| bi-15 | {bathroom} | 8 | `scope_disjoint` | unsatisfied |
| bi-17 | {living_room} | 8 | `scope_disjoint` | unsatisfied |
| bi-18 | {entrance} | 8 | `scope_disjoint` | unsatisfied |

### `EF6`

| class | records |
|---|---|
| `exact` (row 8) | **bi-14** |
| `scope_superset` (row 7) | **bi-04, bi-16** |
| `unknown_type_fallback` (row 4) | bi-02, bi-03, bi-05, bi-08, bi-19 |
| `fallback_from_full` (row 2) | bi-01, bi-07, bi-09, bi-10, bi-11, bi-12, bi-13 |
| `scope_disjoint` (row 1) | bi-06, bi-15, bi-17, bi-18 |

**Cross-check passed.** `EF6` row 7's justification (`07:1284`–`1287`) names "`bi-04` and `bi-16` on
*주방만 하면 얼마예요*" among the 16 classifications that would flip to `exact` without row 7 —
exactly the two I derive. `CINV-24`(c) (`07:1554`) requires bi-14 `exact` and bi-09
`fallback_from_full`, in that order — confirmed.

### Order

1. bi-14
2–3. bi-04, bi-16 (key 3 ties at 1; key 4 decides)
4–8. bi-02, bi-03, bi-05, bi-08, bi-19 — key 3 is **skipped** for all five (their scope is
`not_evaluable`, and `PB4` `07:1218` bars a `not_evaluable` criterion from every tie-break key).
`Q-29` applies; here both readings give the same order because bi-02 is both the only count-1 record
and the newest. The order is determined *in fact*, not *by the rules*.
9–15. bi-01, bi-07, bi-09, bi-10, bi-11, bi-12, bi-13 (key 3 = 1 for all, key 4 decides)
16–19. bi-06, bi-15, bi-17, bi-18

### Prices

bi-14 15,000,000; bi-04 **no pricing at all**; bi-16 19,800,000. The visitor asked *how much* and the
second result has no price. That is deliberate (`PB4`: no criterion reads price, and a missing price
is never a penalty) and it is still the wrong second result for this question.

### vs §4.1 row C (`04:695`)

**Partially disagrees — the row is incomplete.** bi-14 `exact` ✓ and bi-16 `scope_superset` ✓, but
**bi-04 is also `scope_superset` and outranks bi-16**. 04 was written before bi-01…bi-08 had
authored `workScopeIds` (`04:39` §0.2), so bi-04's `[kitchen, bathroom]` was not in its model. The
contract's own row-7 text knows about bi-04; §4.1 row C does not. (`X9-20`)

---

## Row D — "욕실 하나만" / "욕실 두 개"

### D1 — "욕실 하나만"

**Extraction.** `V.breadth` = **absent**. This is decided explicitly and by name: *"A 만 attached to
a quantity is not a restriction by space (`C: MUST`). In 욕실 하나만 the 만 binds the **count**…
Row 3 does not fire; the utterance is row 6, a bare enumeration, and `V.breadth` is **absent**"*
(`07:904`–`907`). `Q_s = {bathroom}`, `Q_t = ∅`; `WS3` (`07:338`) makes 하나 unrepresentable.
`V.area`, `V.budget` absent.

**Criteria.** Breadth `not_applicable` for all 19. Area `not_applicable` for all 19. Scope:

- **fulls**: spaces half `satisfied` for any `Q_s`; `Q_t = ∅ ⊆ R_t` → all seven **satisfied**.
  Ground-not-conclusion: `Q_s ⊆ R_s` holds for bi-01, 09, 10, 11, 12, 13 but **not bi-07**
  (`R_s = {kitchen}`), so bi-07 may only be described as *"집 전체를 리모델링한 사례"* — `CINV-23`
  (`07:1553`) in force.
- **breadth-absent**: `not_evaluable` ×5.
- **partials**: bi-15 row 3 `scope_exact` (satisfied); bi-04 and bi-16 row 5 `scope_superset`
  (satisfied, extra = {kitchen}); bi-06, bi-14, bi-17, bi-18 row 8 `scope_disjoint` (unsatisfied).

**`EF6`.**

| class | records |
|---|---|
| `exact` (row 8) | bi-01, bi-07, bi-09, bi-10, bi-11, bi-12, bi-13, **bi-15** — eight |
| `scope_superset` (row 7) | bi-04, bi-16 |
| `not_evaluable` (row 6) | bi-02, bi-03, bi-05, bi-08, bi-19 |
| `scope_disjoint` (row 1) | bi-06, bi-14, bi-17, bi-18 |

Row 4 does **not** fire for the breadth-absent records: the visitor stated no breadth, so their
breadth criterion is `not_applicable`, not `not_evaluable`. They fall to row 6.

**Order.** Key 2 dormant. Key 3 = count of {bathroom} carried: bi-01 1, bi-09 1, bi-10 1, bi-11 1,
bi-12 1, bi-13 1, bi-15 1, **bi-07 0**. So bi-07 sorts last in the block and the other seven tie,
broken by key 4:

1. bi-01, 2. bi-09, 3. bi-10, 4. bi-11, 5. bi-12, 6. bi-13, **7. bi-15**, 8. bi-07
9–10. bi-04, bi-16
11–15. bi-02, bi-03, bi-05, bi-08, bi-19
16–19. bi-06, bi-14, bi-17, bi-18

**Top 3: bi-01, bi-09, bi-10** — three whole-home remodels, for a visitor asking about one bathroom.
With a result limit of 3, **bi-15 is invisible.**

**Prices.** bi-01 has none statable; bi-09 50,000,000; bi-10 85,000,000. `CINV-19`'s coverage
statement — *what that total bought* — is **not owed**, because `CINV-19` is conditioned on the
visitor having stated a budget and this visitor did not. Nothing requires the reply to say that the
50,000,000 bought a whole 34평 flat rather than a bathroom. (`X9-18`)

### D2 — "욕실 두 개"

**Extraction.** `V.breadth`: rows 1–5 do not match. Row 6's exemplar is a two-item enumeration
(주방이랑 욕실) and this is one room with a count — but the forms clause (`07:898`) says the *why*
cell decides, and row 6's why is *"naming rooms is not a statement of breadth"*. The utterance names
a room. Row 6 fires → **absent**. (`X9-22` records that the exemplar and the why cell point in
different directions; the closed-list default at `07:884` reaches the same answer anyway.)
`Q_s = {bathroom}` — `WS3` drops the count.

**Result: identical to D1 in every respect.** Same states, same classes, same order.

### vs §4.1 row D (`04:696`)

**Disagrees, and the row cannot be satisfied by any conforming consumer.**

1. 04 expects **bi-15** for the first utterance and **bi-16** for the second. Derived: bi-15 is 7th
   and bi-16 is 10th, out of 19. Neither is in a top-3.
2. The two utterances produce **identical** results. 04's own *why* cell cites `WS3` — which is
   precisely the rule that makes 하나 and 두 개 unrepresentable and therefore makes the two queries
   indistinguishable. The row's expectation is self-defeating.
3. §20.7.5 item 1 (`07:2861`) already says row D "is stated on the reading `D9-4` rejects" and "the
   row's expected answer changes". It does **not** say what it changes to. The cost of `D9-4` was
   not measured: under the reading `D9-4` rejected (row 3 fires, `V.breadth = partial`), bi-15 would
   be the unique `exact`, the seven fulls `fallback_from_full`, and 04's answer would be exactly
   right. `D9-4` is what moved bi-15 from 1st to 7th. (`X9-5`)

---

## Row E — "전용 84 아파트 주방"

### Extraction — **dead end at step 1**

- `V.breadth`: no `VB3` row matches → **absent** (closed-list default, `07:884`).
- `V.scope`: 주방 → `{kitchen}`, `Q_t = ∅`.
- **`V.area`: cannot be extracted.** §14.3.1 requires *value + unit + basis* (`07:863`). The
  utterance gives value 84 and basis `exclusive` (`PY1`, `07:246`) and **no unit**. `V.budget` has a
  *"cannot be resolved ⇒ absent, never guessed"* clause (`VB1`, `07:872`); `V.area` has none, and
  `EF4` (`07:1061`) has no branch for a unit-less `V.area` — §14.3.4's tier requires "both converted
  to one unit under `AR4`", and `AR4` converts between units, it does not supply a missing one.
  This is §18 `Q-31` (`07:2265`) verbatim: *"Borrowing `VB1`'s sentence is the obvious repair and it
  is a **rule addition**, so rev 9 does not make it."*
- `아파트` maps to `property.type` — and **`V` has no field for it** (`07:861`–`865`). §6 makes
  `property.type` a structured fact; no consumer rule ever reads it. The word is silently dropped.
  (`X9-14`)

I executed both readings.

### Reading (a) — `V.area` absent (the no-guess reading)

All three criteria: breadth `not_applicable`, area `not_applicable`, scope as in row C.

| class | records |
|---|---|
| `exact` | bi-01, bi-07, bi-09, bi-10, bi-11, bi-12, bi-13, **bi-14** — eight |
| `scope_superset` | bi-04, bi-16 |
| `not_evaluable` | bi-02, bi-03, bi-05, bi-08, bi-19 |
| `scope_disjoint` | bi-06, bi-15, bi-17, bi-18 |

Order in the `exact` block: key 3 = 1 (kitchen) for all eight, so key 4 decides →
bi-01, bi-07, bi-09, bi-10, bi-11, bi-12, bi-13, **bi-14 last**. **bi-14 is 8th of 19.**

### Reading (b) — `V.area = {84, m², exclusive}` (the unit is inferred)

`AR5` now refuses every record whose basis is `supply` — that is **all 17 records that have an area
except bi-14** — so area is `not_evaluable` for them; bi-15 has no area, also `not_evaluable`;
bi-14 is 84 vs 84, delta 0, `strong`, **satisfied**.

`EF6` row 5 does not fire (no area is `unsatisfied`), so row 6 catches everything:

| class | records |
|---|---|
| `exact` | **bi-14, alone** |
| `scope_disjoint` (row 1, fires before row 6) | bi-06, bi-15, bi-17, bi-18 |
| `not_evaluable` (row 6) | the other 14, including bi-04 and bi-16 whose scope was `satisfied` |

### vs §4.1 row E (`04:697`)

**Disagrees under the reading the contract's own posture implies, agrees under the reading it
declines to license.** 04 expects bi-14. Reading (b) gives exactly that and is the only reading that
does. Reading (a) — the one that follows `VB1`'s "never guessed" and `WS6`'s "never silently
resolved" — puts bi-14 8th. The contract will not say which. (`X9-2`, `X9-7`)

Also worth stating: under reading (b) 14 of 19 records come back `not_evaluable`. That is honest and
it is also a result that tells the visitor almost nothing.

04's second clause — *"34평 주방" must NOT be told bi-14 is a 34평 flat* — **holds**. `GR1`
(`07:1440`) permits only values present in the result; bi-14's area is 84 m² exclusive and its title
says 전용 84㎡. The 34평형 sentence lives in the body, which is not in the document. But note that
the criterion **is** evaluated across bases in that case (row A, bi-14): `AR5` permits it because
the visitor's basis is unknown. (`X9-16`)

---

## Row F — "50평 전체 1억 넘나요"

### Extraction

`V.breadth = whole` (`VB3` row 2, same form as row A). `Q = ∅`. `V.area` = 50, pyeong, basis absent.
`V.budget`: *"1억 넘나요"* is a question about **exceeding** a figure, which is neither `exact`, nor
`range`, nor `max` (a ceiling). `VB1`'s closed list does not cover it → **absent**, and that is what
`VB1` instructs. Consequence recorded at `X9-1`: because no budget was extracted, `CINV-19`'s
obligation to say *"the cases are not selected or ordered by their budget"* is **not triggered**.
The visitor asks a direct price question, gets no answer, and is owed no explanation of why.

### Criteria

Scope `not_applicable`. Breadth as row A. Area, `v = 50`:

satisfied — bi-08 (+0.02 strong), bi-13 (−0.04 strong), bi-03 (−0.16 acceptable).
`not_evaluable` — bi-15 (no area).
unsatisfied — everything else: bi-16 −0.24, bi-01/09/10/06 −0.32, bi-17 −0.3224, bi-04/19 −0.36,
bi-18 −0.40, bi-05 −0.42, bi-12 −0.48, bi-14 −0.4918, bi-02 −0.52, bi-11 −0.60, bi-07 −0.62.

### `EF6`

| class | records |
|---|---|
| `exact` | **bi-13, alone** |
| `unknown_type_fallback` (row 4) | bi-02, bi-03, bi-05, bi-08, bi-19 |
| `breadth_fallback` (row 3) | bi-04, bi-06, bi-14, bi-15, bi-16, bi-17, bi-18 |
| `area_fallback` (row 5) | bi-01, bi-07, bi-09, bi-10, bi-11, bi-12 |

### Order

1. bi-13
2–6. bi-08 (.02), bi-03 (.16), bi-19 (.36), bi-05 (.42), bi-02 (.52)
7–13. bi-16 (.24), bi-06 (.32), bi-17 (.3224), bi-04 (.36), bi-18 (.40), bi-14 (.4918) **+ bi-15,
position undetermined** (`Q-29` again)
14–19. bi-01 (.32), bi-09 (.32), bi-10 (.32), bi-12 (.48), bi-11 (.60), bi-07 (.62)

**Cross-check passed, and it is the strongest one available.** §14.3.6's *"What this gives up"*
(`07:1382`) states that under class order alone the whole-home near-misses "fall to positions 14–19
(`bi-01` 2→14, `bi-09` 3→15)" for *"50평 전체"*. My hand execution puts bi-01 at 14 and bi-09 at 15.
Independent agreement on an absolute position, over 19 records, computed from the rules.

### Prices

bi-13's `range` 125,000,000–140,000,000 stated as authored ✓. `D-1` condition 2 blocks derivation.
`GR5` forbids 125,000,000 ÷ 48 = 2,604,167 and 140,000,000 ÷ 48 = 2,916,667 appearing anywhere.
Answering 넘나요 would compare 125,000,000 against 100,000,000 — forbidden by `GR1` (`07:1212`).
**bi-08 (#2) has no statable price** — authored `perArea` 1,600,000 withheld by `GR4`. bi-16 (#3)
19,800,000.

### vs §4.1 row F (`04:698`)

**Agrees.** bi-13 the answer with its range stated, no per-평 figure, no yes/no verdict, bi-08 a
projectType-absent reference and in fact #2. All confirmed.

---

## Row G — "32평인데 도배랑 바닥만 얼마예요"

### Extraction

`V.breadth` = **absent** — `VB3` row 5 (`07:894`), whose exemplar is 바닥이랑 도배**만** verbatim.
Row 3 is tried first and does not match (no space is named).
`Q_t = {wallpaper, flooring}`, `Q_s = ∅`. `V.area` = 32, pyeong, basis absent. `V.budget` absent.

### Criteria

Breadth `not_applicable` for all 19 (nothing was stated).

Scope. **`Q_s = ∅`, so §14.3.3 row 2 routes to §14.3.3.1 — but only for `partial_remodel` records.**
`EF3`'s branch on `R.projectType` comes first:

- **fulls**: spaces half `satisfied` (`Q_s = ∅`); trades half `satisfied` iff
  `{wallpaper, flooring} ⊆ R_t`, else `not_evaluable` by `WS7b`.
  - bi-09 ✓ and bi-11 ✓ → **satisfied**.
  - bi-01, bi-07, bi-10, bi-12, bi-13 lack `wallpaper` → **not_evaluable**.
- **breadth-absent** (bi-02, 03, 05, 08, **bi-19**): `not_evaluable`. bi-19 carries
  `{flooring, wallpaper, lighting} ⊇ Q_t` exactly and still gets `not_evaluable`, because the absent
  branch never reaches §14.3.3.1. §14.3.3.1's own prose (`07:1177`–`1182`) confirms this is intended.
- **partials**, §14.3.3.1 (`07:1165`–`1168`):

| record | `R_t` | row | relation | state |
|---|---|---|---|---|
| bi-17 | {flooring} | 3 (`Q_t ⊄ R_t`, `∩ ≠ ∅`) | `scope_overlap` | unsatisfied |
| bi-04, bi-14, bi-15, bi-16 | ∅ | 4 | `scope_disjoint` | unsatisfied |
| bi-06 | {lighting} | 4 | `scope_disjoint` | unsatisfied |
| bi-18 | {built_in_furniture} | 4 | `scope_disjoint` | unsatisfied |

bi-16 at row 4 reproduces `CINV-15`(b) (`07:1545`) exactly. ✓

**But this is the sharpest rule conflict I found.** For the *identical* predicate — the record's id
list does not name a trade the visitor asked for — a `full_remodel` gets **`not_evaluable`**, with
`EF3` stating the reason in terms: *"By `WS7b` an absent trade id is unknown — neither inclusion nor
exclusion may be inferred from it"* (`07:967`). A `partial_remodel` gets `scope_overlap` or
`scope_disjoint` — a **stated miss**, the two weakest classes in `GR2a`. And `WS7a` says in terms
that *"the **works** in the set are **open even for a partial** (`WS7b`)"* (`07:409`). Same
ignorance, two opposite verdicts, decided by a field that has nothing to do with trades. (`X9-10`)

Area, `v = 32`: satisfied — bi-04 (0), bi-19 (0), bi-17 (+.0588), bi-01/06/09/10 (+.0625),
bi-18 (−.0625), bi-05 (−.094), bi-16 (+.1875), bi-12 (−.1875). `not_evaluable` — bi-15.
unsatisfied — bi-14 (−.2059), bi-02 (−.25), bi-03 (+.3125), bi-11 (−.375), bi-07 (−.406),
bi-13 (+.5), bi-08 (+.594).

### `EF6` — and the row-5-before-row-6 problem

| class | records | why |
|---|---|---|
| `exact` (row 8) | **bi-09** | scope satisfied, area satisfied |
| `not_evaluable` (row 6) | bi-01, bi-05, bi-10, bi-12, bi-19 | scope not_evaluable, area satisfied |
| `area_fallback` (row 5) | bi-02, bi-03, bi-07, bi-08, bi-11, bi-13 | **row 5 fires before row 6** |
| `scope_overlap` (row 1) | bi-17 | |
| `scope_disjoint` (row 1) | bi-04, bi-06, bi-14, bi-15, bi-16, bi-18 | |

Five of the six `area_fallback` records (all but bi-11) have a `not_evaluable` **scope**, and are
nevertheless labelled with the criterion that *was* evaluated. `EF6`'s rationale (`07:1270`–`1273`)
explains why rows 1–4 precede row 5 and says nothing about why row 5 precedes row 6, while row 6's
own note (`07:1308`) argues that *"what we cannot evaluate"* is the honest class. (`X9-15`)

**Cross-check passed.** §18 `Q-33` (`07:2283`): *"for '32평인데 도배랑 바닥만 얼마예요', the only
`exact` record is a 50,000,000 whole-home remodel."* Confirmed: bi-09, alone.

### Order

1. **bi-09** (`exact`)
2–6. `not_evaluable`: key 2 applies (area is `satisfied` for all five); key 3 is **skipped** for all
five (`PB4`, scope `not_evaluable`). → **bi-19 (0)**, bi-01 (.0625), bi-10 (.0625), bi-05 (.094),
bi-12 (.1875). bi-01 before bi-10 by key 4.
7–12. `area_fallback`: bi-02 (.25), bi-03 (.3125), bi-11 (.375), bi-07 (.406), bi-13 (.5), bi-08 (.594)
13. bi-17 (`scope_overlap`)
14–19. `scope_disjoint`: bi-04 (0), bi-06 (.0625), bi-18 (.0625), bi-16 (.1875), bi-14 (.2059)
**+ bi-15, undetermined** (`Q-29`)

**bi-19 is at position 2.**

### `X9-9` — the contract contradicts itself about this exact record

§14.3.6 (`07:1396`) states, as a measured result of rev 9: *"row G drops `bi-19` (`not_evaluable`)
from 1→15."* Position 15 is arithmetically unreachable under rev 9's `GR2a`. It is reachable under
**rev 8's** order, where `not_evaluable` sorts last: 1 (`exact`) + 6 (`area_fallback`) +
1 (`scope_overlap`) + 6 (`scope_disjoint`) = 14 records above, bi-19 at 15. §14.3.6's own preamble
says the measurement was taken *"with the rungs deleted"* — i.e. from a configuration that is not
this revision, §20.7 having recorded that deleting the rungs alone makes `PB4` worse.

It also contradicts §14.3.3.1 (`07:1180`), which says of the same record and the same query class:
*"`bi-19` is now placed by its class, which for a trade-only query is `not_evaluable` — **fourth of
ten** in `GR2a`'s order rather than last, which is `PB4`'s own point."* Fourth of ten is position 2
of 19 on this corpus. The two sentences are in the same in-force section and cannot both be right.

### Prices

bi-09 50,000,000 ✓; bi-19 11,000,000 ✓; bi-01 (#3) **no statable price**.
`GR5`/`CINV-2`: 11,000,000 ÷ 32 = **343,750** is forbidden and is **not** exempted by `GR5a` — it is
not the value of any `pricing` field. ✓ 04's prohibition holds.
Calling bi-19 a 전체 or 부분 리모델링 is forbidden — `projectType` is absent and `GR1` permits
stating only present values. ✓

### vs §4.1 row G (`04:699`)

**Disagrees on the answer and on the mechanism.** 04 expects bi-19 "reached on `GR3`'s trade rung".
The rung is deleted (`D9-1`), which §20.7.5 item 2 acknowledges. What §20.7.5 does **not**
acknowledge is that the answer changes: bi-19 is **second**, behind bi-09 — a 50,000,000 whole-home
remodel which is the sole `exact` record and therefore the sole **direct answer** under `GR3`
(`07:1348`–`1352`). The visitor who asked for wallpaper and flooring on a 32평 flat is told, as a
direct answer, about a fifty-million-won whole-home job, and bi-19 is a labelled reference.

---

## Row H — "바닥이랑 거실만"

### Extraction — **second dead end**

`V.scope` is clean: 바닥 → `flooring` (Work), 거실 → `living_room` (Space); neither is ambiguous
under `WS6`. `Q_s = {living_room}`, `Q_t = {flooring}`. `V.area`, `V.budget` absent.

`V.breadth` **cannot be determined.** `VB3` row 3 (a restriction by space) and row 5 (a restriction
by trade) both describe part of this chain, and the 만 is attached to 거실. VB3's own closing
paragraph (`07:928`) says so: *"A chain that mixes kinds — '바닥이랑 거실만' … matches rows 3 and 5
on any reading that lets the particle bind across kinds, and nothing in this table says whether it
binds the adjacent term only. … It is §18's `Q-26` and is **not** answered by inventing a chain rule
here."*

**That paragraph contradicts the rule three lines above it.** `VB3`'s first-match sentence
(`07:882`) is a `C: MUST`: *"The rows are tried in written order and the first matching row wins …
Without it the rows overlap and one utterance yields two opposite values of `V.breadth`."* If both
rows match, first-match resolves it to row 3 → `partial`, deterministically. `Q-26` is only open if
row 3 **does not** match — i.e. if a mixed chain is not "a restriction by space" at all, in which
case no row matches and the closed-list default gives `absent`. One of the two texts is wrong.
(`X9-3`)

I executed both.

### Reading H-a — `V.breadth = partial` (first-match taken literally)

Scope: fulls — trades half `{flooring} ⊆ R_t`: bi-01 ✓, bi-07 ✓, bi-09 ✓, bi-11 ✓, bi-12 ✓ →
satisfied; bi-10 and bi-13 lack `flooring` → `not_evaluable`. None of the five satisfied fulls has
`living_room` in `R_s`, so all five are **ground-only** under `CINV-23`.
Breadth-absent ×5 → `not_evaluable`.
Partials: bi-17 row 3 `scope_exact`; bi-06 row 5 `scope_superset` (extra = {entrance});
bi-04, bi-14, bi-15, bi-16, bi-18 row 8 `scope_disjoint`.

| class | records |
|---|---|
| `exact` | **bi-17** |
| `scope_superset` | bi-06 |
| `unknown_type_fallback` | bi-02, bi-03, bi-05, bi-08, bi-19 |
| `fallback_from_full` (row 2, before row 6) | bi-01, bi-07, bi-09, bi-10, bi-11, bi-12, bi-13 |
| `scope_disjoint` | bi-04, bi-14, bi-15, bi-16, bi-18 |

Order: 1. bi-17, 2. bi-06, then the `unknown_type_fallback` block — where key 3 is skipped for all
five (`Q-29`) and the two readings **differ**: with key 3, bi-03 (count 0) falls to last; without
it, bi-03 is second by `publishedAt`. Then `fallback_from_full` (bi-10 and bi-13 skip key 3; the
rest tie at 1), then `scope_disjoint`.

**Cross-check passed.** `CINV-15`(a) (`07:1545`) fixtures *"바닥만"* against bi-17 as
`scope_superset` via §14.3.3.1 row 2. Here 거실 is also named so we take §14.3.3 row 3 instead and
get `scope_exact` — consistent, different query.

### Reading H-b — `V.breadth = absent`

Breadth `not_applicable` everywhere. `exact` becomes **bi-01, bi-07, bi-09, bi-11, bi-12 and
bi-17**; bi-06 stays `scope_superset`; bi-10, bi-13 and the five breadth-absent records become class
`not_evaluable` (row 6). In the `exact` block key 3 gives bi-17 a count of **2** and everyone else
1, so bi-17 still leads — then five whole-home remodels follow, all called direct answers.

### vs §4.1 row H (`04:700`)

**Agrees on the headline under both readings** — bi-17 is first either way, and that is the one
robust result of the exercise. But positions 2–3 are completely different (bi-06 + bi-02 vs
bi-01 + bi-07), and under H-b five whole-home remodels become `exact` and therefore **direct
answers** for *"바닥이랑 거실만"*. `Q-26` is not cosmetic: it decides what the reply calls 직접 답변.

bi-17's 12,500,000 is statable ✓; its 112 m² is shown as authored or converted for display only ✓
(`AR3`/`AR4`). bi-06 (#2) has no pricing at all.

---

## Row I — "현관 수납"

### Extraction

`V.breadth` = **absent** (`VB3` row 6 via its *why* cell — naming rooms — or the closed-list
default; both give absent).
`V.scope` is **ambiguous under `WS6`** (`07:352`–`358`), and this is §7.4's own worked example:
현관 → `entrance`; 수납 → `storage` (a Space) **or** `built_in_furniture` (a Work).

- Reading A: `Q_s = {entrance, storage}`, `Q_t = ∅`
- Reading B: `Q_s = {entrance}`, `Q_t = {built_in_furniture}`

`V.area`, `V.budget` absent. Per `WS6` the consumer **must not pick**; `Q` carries both.

### Criteria — per reading, then `EF3`'s ambiguity clause (`07:1008`–`1015`)

**fulls.** Spaces half `satisfied` for any `Q_s` under both readings. Trades half:
reading A `Q_t = ∅ ⊆ R_t` ✓; reading B `{built_in_furniture} ⊆ R_t` — true for bi-01, 07, 09, 10, 12,
13, **false for bi-11** (`R_t = {flooring, wallpaper, doors}`) → reading B gives bi-11
`not_evaluable`.

- **bi-11**: readings give different **states** → ambiguity rule 1 → **`not_evaluable`**, ambiguity
  disclosed.
- The other six: both readings `satisfied`, and a `full_remodel` has **no relation** under either
  reading. Rule 1's second disjunct compares relations that do not exist; I read absent == absent as
  agreement (`X9-19`) → rule 2 → `satisfied`.
- **Ground-not-conclusion under `D9-9`** (`07:983`–`986`): the conclusion may be stated only where
  `Q_s ⊆ R_s` holds under **all** readings. Reading A's `Q_s` contains `storage`, which no record
  carries, so `Q_s ⊆ R_s` fails under A for **every** record. **All six are ground-only.** This is
  `D9-9` doing exactly what §20.8 row C says it does — under the last reading, five of the six would
  flip to conclusion-permitted.

**breadth-absent** (bi-02, 03, 05, 08, 19): `not_evaluable` under both readings, no relation either
way → rule 2 → `not_evaluable`. No ambiguity disclosure is owed, because rule 2 fired.

**partials**, per reading, with the disclosure sets intersected per `D9-9` (`07:1103`–`1117`):

| record | reading A | reading B | ambiguity rule | state / relation | disclosure names |
|---|---|---|---|---|---|
| bi-04 | row 8 `scope_disjoint` | row 8 `scope_disjoint` | 2 | unsatisfied / `scope_disjoint` | {entrance, storage} ∩ {entrance} = **{entrance}** |
| bi-14 | row 8 | row 8 | 2 | unsatisfied / `scope_disjoint` | {entrance} |
| bi-15 | row 8 | row 8 | 2 | unsatisfied / `scope_disjoint` | {entrance} |
| bi-16 | row 8 | row 8 | 2 | unsatisfied / `scope_disjoint` | {entrance} |
| bi-17 | row 8 | row 8 | 2 | unsatisfied / `scope_disjoint` | {entrance} |
| **bi-06** | row 7 `scope_overlap` | row 5 `scope_superset` | **1** | **`not_evaluable`** + disclose | — |
| **bi-18** | row 6 `scope_subset` | row 3 `scope_exact` | **1** | **`not_evaluable`** + disclose | — |

**Cross-check passed.** §7.4's worked example (`07:365`–`371`) derives exactly bi-18's two relations
and concludes *"the scope criterion is `not_evaluable` and the reply says the term was ambiguous"*.
Confirmed independently.

`D9-9`'s disclosure intersection is also doing real work on bi-04/14/15/16/17: without it the reply
would say 수납 공간은 이 사례의 범위에 없었습니다 on the strength of one reading only.

### `EF6`

| class | records |
|---|---|
| `exact` (row 8) | **bi-01, bi-07, bi-09, bi-10, bi-12, bi-13** — six full remodels |
| `not_evaluable` (row 6) | bi-02, bi-03, bi-05, **bi-06**, bi-08, bi-11, **bi-18**, bi-19 |
| `scope_disjoint` (row 1) | bi-04, bi-14, bi-15, bi-16, bi-17 |

### Order

`exact` block: key 3 reads the **intersection** of the readings (`D9-8`, `07:1407`) =
{entrance, storage} ∩ {entrance, built_in_furniture} = **{entrance}**. Counts: bi-01 1, bi-09 1,
bi-10 1, bi-12 1, bi-13 1, **bi-07 0**.
1. bi-01, 2. bi-09, 3. bi-10, 4. bi-12, 5. bi-13, 6. bi-07

`not_evaluable` block (positions 7–14): every record's scope criterion is `not_evaluable`, so key 3
is **skipped for all eight** (`PB4`). Under the skip, the block falls to `publishedAt`:
7. bi-02, 8. bi-03, 9. bi-05, 10. bi-06, 11. bi-08, 12. bi-11, **13. bi-18**, 14. bi-19.
If key 3 were applied uniformly instead, bi-03/bi-06/bi-18 (count 1 for `entrance`) would rise and
**bi-18 would be 9th instead of 13th**. `Q-29` changes the answer here. (`X9-4`)

15–19. bi-04, bi-14, bi-15, bi-16, bi-17.

### vs §4.1 row I (`04:701`)

**Disagrees.** 04 expects **bi-18** (6,200,000), with bi-06 "returned on equal footing", on the
assumption that the consumer maps 수납 → `built_in_furniture`. Rev 9.1's `WS6` forbids that
assumption. Derived: bi-18 is **13th of 19** and bi-06 **10th**; the top three are three whole-home
remodels, the first of which (bi-01) has no statable price.

§20.7.5 item 3 (`07:2865`) already says row I "needs `WS6`'s new behaviour: the readings differ, so
the scope criterion is `not_evaluable`". It does not say that this drops the answering record to
13th and promotes six records that do not answer the question. (`X9-6`)

**One more contradiction.** §14.3.6 (`07:1394`–`1396`) lists among rev 9's repairs: *"rows D1/D2/I
promote `exact` records from 8→1, 9→2, 10→3, where the rungs had put them **below**
`scope_disjoint` ones."* On rows D and I the records promoted to 1–3 are whole-home remodels, and
the records 04 §4.1 names as the answers (bi-15, bi-16, bi-18) are **not `exact` at all** on row I
and are 7th/10th on row D. Whatever that measurement promoted, it was not the answer.

---

## Findings

Priority order: dead ends first, then disagreements, then rules whose text fights their own prose.

| id | kind | finding | citation |
|---|---|---|---|
| `X9-1` | **ambiguity — had to guess** | `VB1`'s three budget shapes (`exact`/`range`/`max`) do not cover any of §4.1's three budget utterances cleanly. *"5천이면 되나요"* (A) — `VB1` names 5천 as `exact` but 이면 되나요 is a ceiling; *"예산 3천으로"* (B) — a ceiling with no 이내/최대; *"1억 넘나요"* (F) — a question about **exceeding**, the inverse of a ceiling. `VB1` says an unresolvable budget is absent and never guessed, so F (and arguably B) resolve to **absent**. I guessed `exact` for A on `VB1`'s own exemplar. Non-load-bearing for matching, but see `X9-18`. | `07:867`–`872`; `04:693`, `04:694`, `04:698` |
| `X9-2` | **dead end — cannot proceed** | Row E's *"전용 84"* gives value + basis and **no unit**. §14.3.1 requires all three; `V.area` has no *"cannot be resolved ⇒ absent"* clause although `V.budget` does; `EF4` has no branch for it; `AR4` converts between units and cannot supply one. §18 `Q-31` says the repair is a rule addition rev 9 declined to make. The two readings put bi-14 at **8th** and at **unique `exact`**. | `07:863`, `07:1061`, `07:2265` |
| `X9-3` | **dead end + self-contradiction** | Row H. `VB3`'s first-match sentence (a `C: MUST`) resolves any row overlap deterministically; `VB3`'s own closing paragraph then declares *"바닥이랑 거실만"* open because it "matches rows 3 and 5". Under first-match, matching both is not a problem — row 3 wins. The paragraph is only coherent if row 3 does **not** match, which first-match cannot decide. `V.breadth` is `partial` or `absent` and the text supports both. 12 of 19 records change class between the readings. | `07:882`, `07:892`, `07:894`, `07:928`, `07:2251` (`Q-26`) |
| `X9-4` | **dead end — no defined order** | `Q-29` blocks the ordering step on **four** rows. Rows A, F, G: bi-15 has no area, so key (2) skips it inside a class block that mixes skipped and keyed records; all three candidate readings of *"keeps the position the previous key gave it"* are declared dead and no fourth is adopted. Row I: all eight records in the `not_evaluable` block skip key (3) by `PB4`, and whether they do moves bi-18 from 9th to 13th. `CINV-21` requires a fully determined order. | `07:1399`–`1401`, `07:1218`, `07:2215` |
| `X9-5` | **disagreement — row D, severe** | 04 expects bi-15 (7,000,000) and bi-16 (19,800,000). Derived: **bi-15 7th, bi-16 10th of 19**; the top three are bi-01/bi-09/bi-10, whole-home remodels. Cause: `VB3`'s new 만-on-a-quantity clause sends `V.breadth` to **absent**, whereupon `EF3`'s `full_remodel` spaces half is `satisfied` for any `Q_s` and every full remodel is `exact`. Under the reading `D9-4` rejected, bi-15 would be the unique `exact` and 04 would be right. §20.7.5 item 1 says the answer "changes" without saying to what; the cost of `D9-4` was never measured. | `07:904`–`907`, `07:963`–`967`, `07:2861`; `04:696` |
| `X9-6` | **disagreement — row I, severe** | 04 expects bi-18 (6,200,000). Derived: **bi-18 13th of 19**, class `not_evaluable`; six whole-home remodels are `exact`. Correct per `WS6`, and §20.7.5 item 3 anticipates the class but not the position. | `07:352`–`371`, `07:2865`; `04:701` |
| `X9-7` | **disagreement — row E** | 04 expects bi-14. Reachable only under the unit inference of `X9-2`; under the no-guess reading bi-14 is 8th. | `04:697` |
| `X9-8` | **disagreement — row G** | 04 expects bi-19. Derived: bi-19 **2nd**, behind bi-09 — a 50,000,000 whole-home remodel that is the sole `exact` record and therefore the sole `GR3` **direct answer** for a query about wallpaper and flooring. §18 `Q-33` concedes the class; 04 does not record the displacement. | `07:2283`; `04:699` |
| `X9-9` | **rule vs its own prose** | §14.3.6 states as a rev-9 result: *"row G drops `bi-19` (`not_evaluable`) from 1→15."* Position 15 is unreachable under rev 9's `GR2a` (derived: **2**); 15 is exactly rev 8's order, where `not_evaluable` sorts last — the order `GR2a` was rewritten to abolish. It contradicts §14.3.3.1's own sentence about the same record and query: *"fourth of ten in `GR2a`'s order rather than last."* An in-force section quotes a measurement from a configuration that is not this revision. | `07:1396` vs `07:1180`; `07:1316` |
| `X9-10` | **rule vs its own prose** | §14.3.3.1 rows 3 and 4 infer a **stated miss** (`scope_overlap`/`scope_disjoint`, the two weakest classes) from a trade id the record's list does not name. `WS7b` forbids inferring exclusion from an absent trade id, `WS7a` says in terms that the works set is *"open even for a partial"*, and `EF3`'s `full_remodel` branch returns **`not_evaluable`** for the identical predicate, citing `WS7b` as the reason. Same ignorance, two opposite verdicts, discriminated by `projectType`. On row G this puts bi-16 and bi-04 dead last. | `07:1167`–`1168`, `07:409`, `07:412`, `07:967` |
| `X9-11` | **rule vs its own prose + disagreement** | `GR4` withholds `pricing.perArea` unless the visitor asked about a per-area price. Six records (bi-01, 02, 03, 05, 07, 08) carry **only** an authored `perArea` and no total, so their model-facing record carries **no price at all**. `CINV-19` requires each shown record's price be told as a fact whenever a budget was stated — **unsatisfiable** for those six. Live on every row: bi-01 is #1 on A, D, I; bi-01 and bi-07 are #1 and #2 on B; bi-08 is #2 on F. §4.1 row B's *"each with its own total stated"* is false on the real data. | `07:1442`, `07:1549`; `04:694` |
| `X9-12` | **unimplementable rule** | `ST3` (`C: MUST`) makes style *"a small ranking bonus"*. `GR2a` states *"since rev 9 no other rule orders a result at all"*, and the five ordering keys are class, `\|delta_area\|`, scope count, `publishedAt`, `id`. **There is no slot for a style bonus.** A conforming consumer cannot apply `ST3` without violating `GR2a`, or satisfy `GR2a` without violating `ST3`. Not in §18's open list. (No §4.1 row states a style, so it never bit during execution — which is why it is easy to miss.) | `07:513`, `07:1478`, `07:1313`, `07:1398`–`1403` |
| `X9-13` | **orphaned rule** | §10.1 says `facets.category` and `facets.tag` are *"still a match key"*. `EF1` says the consumer computes **exactly three** criteria and *"nothing outside `EF2`–`EF4` assigns a criterion state"*; no ordering key reads a facet. Category and tag matching has no home in the in-force evaluation function. | `07:695`–`696`, `07:940`–`947` |
| `X9-14` | **extraction has nowhere to go** | Row E's *"아파트"* is a `property.type`. `V` (§14.3.1) has fields for breadth, scope, area, budget and styles — and none for property type — so a visitor statement about the kind of dwelling is silently discarded, although §6 makes `property.type` a structured fact and `INV-25` protects it. | `07:861`–`865`, `07:229`–`247` |
| `X9-15` | **row order produces the dishonest label** | `EF6` row 5 (`area_fallback`) precedes row 6 (`not_evaluable`), so a record whose **scope could not be evaluated** and whose area merely missed is labelled with the criterion that *was* evaluated. Row G: bi-02, bi-03, bi-07, bi-08, bi-13 are all `area_fallback` with a `not_evaluable` scope. `EF6`'s rationale justifies rows 1–4 before 5 and is silent on 5 before 6, while row 6's own note argues that *"what we cannot evaluate"* is the honest class and *"silence is not evidence"*. | `07:1266`–`1267`, `07:1270`–`1273`, `07:1308` |
| `X9-16` | **the trap is armed only by a word visitors rarely say** | `AR5`/`PY1` refuse a comparison only when **both** bases are known and differ. A bare *"34평"* states no basis, so row A compares it against bi-14's 84 m² **exclusive** (converted to 25.41평, `|delta| 0.2526`, `unsatisfied`). `04` §4 E8 calls bi-14 "the never-convert trap"; it springs only when the visitor says 전용 or 공급 explicitly. The result is correct per the rules and is the opposite of what E8 is for. | `07:246`, `07:1061`–`1074`; `04:668` |
| `X9-17` | **three criteria are not sufficient** | Rows D, G and I each require distinguishing *"a job whose whole extent is what you asked about"* from *"a whole-home remodel that happened to include it"*. Breadth could express it — but `VB3`'s closed list sends 하나만, 두 개 and 현관 수납 to **absent**, and once breadth is absent `PT4`(b) makes every `full_remodel`'s spaces half `satisfied` for any `Q_s`, key (3) only counts hits and never penalises extent, and nothing is left. §18 `Q-33` names row G; **rows D and I are worse instances**, because there the answering record exists in the corpus and is displaced to 7th and 13th. | `07:888`–`896`, `07:963`–`967`, `07:1401`, `07:2283` |
| `X9-18` | **the disclosure is owed only when it is least needed** | `CINV-19`'s coverage statement — the record's price **plus what that total bought** — and the *"not selected or ordered by budget"* disclaimer are both conditioned on the visitor having stated a budget. Rows D, G and I quote 50,000,000 and 85,000,000 whole-home totals to visitors who asked about one bathroom, two trades and an entrance, and **no rule requires saying what those totals bought**. Row F compounds it: because *"1억 넘나요"* resolves to no `VB1` shape, the visitor who asked the most direct price question gets neither the answer nor the disclaimer explaining the silence. | `07:1549`, `07:1427`, `07:867`–`872` |
| `X9-19` | **ambiguity — had to decide** | `EF3`'s ambiguity rule 1 fires on *"different criterion states **OR** different relations"*. For a `full_remodel` or a breadth-absent record **no relation is computed at all**, so rule 1's second disjunct compares two absences. I decided absent == absent is agreement (rule 2). The alternative — that "different relations" is undefined when neither exists — would make the pair non-total, which is the property §14.3.2 asserts it has. §14.3.2's own note that rule 1 *"is keyed on having no relation at all — a `full_remodel` never has one"* supports my reading but is written about a different site (the permission), not about rule 1's own condition. Live on row I for six records. | `07:1011`–`1015`, `07:985`–`988` |
| `X9-20` | **disagreement — row C, incomplete** | bi-04 is also `scope_superset` for *"주방만"* and **outranks** bi-16 by `publishedAt`; §4.1 row C names only bi-14 and bi-16. The contract's own `EF6` row-7 text names bi-04 on this exact utterance, so the two documents disagree about the same query. bi-04 has **no pricing at all**, so a *"얼마예요"* question surfaces a priceless record at #2. | `07:1284`–`1287`; `04:695`, `04:39` |
| `X9-21` | **stale citation in 04, unflagged** | §4.1 row B says the result "is ordered by `GR3`". `GR3` has not ordered anything since `D9-1`; *"direct answers are offered first"* is a definition and `GR2a` is the whole order. §20.7.5 flags this class of staleness for row G only. | `07:1350`–`1352`, `07:1313`, `07:2863`; `04:694` |
| `X9-22` | **ambiguity — minor, had to decide** | *"욕실 두 개"* names **one** room with a count; `VB3` row 6's exemplar is an enumeration of **two** rooms (주방이랑 욕실). The forms-not-strings clause says the *why* cell decides, and row 6's why is *"naming rooms is not a statement of breadth"* — so row 6 fires. The row's label and its exemplar point elsewhere. The closed-list default reaches the same answer, so nothing turns on it. | `07:895`, `07:898`, `07:884` |
| `X9-23` | **dead section** | §14.3.3.1 is titled *"Trade-only requests"*, but `EF3` branches on `projectType` **before** §14.3.3 is reached, so a trade-only query against a breadth-absent record — including bi-19, the corpus's canonical trade-only job — never reaches the table. Its own row 1 is separately declared unreachable. Three of four rows are live, and only for `partial_remodel` records. A reader following the section title to answer row G reaches the wrong table. | `07:1158`–`1182`, `07:968`–`970` |
| `X9-24` | **`Q-32` in practice** | `not_evaluable` is both a criterion **state** (`EF1`) and a match **class** (`EF6` row 6). On row G I had to hold them apart five times by column position alone: bi-01 has scope-state `not_evaluable` and class `not_evaluable`; bi-02 has scope-state `not_evaluable` and class `area_fallback`. `EF1`'s closure sentence — *"nothing outside `EF2`–`EF4` assigns a criterion state"* — reads as violated by `EF6` row 6 until you know which column the token sits in. | `07:940`–`947`, `07:1267`, `07:2277` |

### Cross-checks that passed

Seven independent points where my hand derivation reproduces a figure the contract states, computed
from the rules without reading the proof scripts. These are the reason I am confident the
disagreements above are real and not arithmetic slips.

| check | contract says | I derived |
|---|---|---|
| `CINV-21` fixture, row B shape | "seven `exact` records, no area, no scope" | seven: bi-01, 07, 09, 10, 11, 12, 13 |
| `CINV-24`(a), row B shape | bi-15 `breadth_fallback`, never `exact` | `breadth_fallback` |
| `CINV-24`(c), row C | bi-14 `exact`, bi-09 `fallback_from_full`, in that order | same |
| `EF6` row 7 justification | "bi-04 and bi-16 on *주방만 하면 얼마예요*" among the 16 `scope_superset` | exactly those two, row C |
| §14.3.6 *"what this gives up"*, row F | "`bi-01` 2→14, `bi-09` 3→15" | bi-01 at 14, bi-09 at 15 |
| §18 `Q-33`, row G | "the only `exact` record is a 50,000,000 whole-home remodel" | bi-09, alone |
| §7.4 `WS6` worked example, row I | bi-18: row 6 vs row 3, so `not_evaluable` + disclose | same, both relations |

### Rules I had to read more than twice, and why

1. **`V.scope`'s table cell** (`07:862`). A nine-line normative paragraph inside a table cell,
   enumerating *"exactly three in-force sites"* that read it plus a fourth that is "a permission
   rather than a set". The cell is the cross-reference index for four other sections and is placed
   where a reader scans for a type signature.
2. **The scope relation, spread over four places** — `EF3`'s partial branch (`07:968`), §14.3.3's
   table (`07:1078`), §14.3.3.1's table (`07:1163`), and `WS7a`/`WS7b` restated twice (`07:393`,
   `07:1142`). Deciding one record's relation means holding all four open. This is where `X9-10`
   hides.
3. **`EF6` rows 4, 5 and 6 against each other** (`07:1265`–`1267`). The prose explains 1–4 before 5
   and 4 before 6 and never 5 before 6, which is the pairing that actually mislabels records
   (`X9-15`).
4. **`GR2a` against `EF6`'s row order** (`07:1316` vs `07:1262`). Two different orders over the same
   ten names, in adjacent paragraphs, and the section's own history note records a revision that
   sorted by the wrong one.
5. **The ordering-key blockquote plus `PB4`'s carve-out plus `Q-29`** (`07:1398`, `07:1218`,
   `07:2215`). Read four times; it still does not define an order on four of nine rows. The carve-out
   is stated in the key list as if settled and declared open 800 lines later.
6. **`EF4`'s *"`AR5` refuses the two bases"*** (`07:1061`). `AR5` is quoted, never stated as a
   numbered rule in this document; "refuses" has to be reconstructed from `PY1`'s three clauses
   (`07:246`), of which the third — *"one unknown basis lowers confidence"* — is not a refusal.
   `X9-16` depends entirely on getting this right.
7. **`not_evaluable`, state and class** (`X9-24`). Every `EF6` derivation required tracking which
   column a token was in.
8. **`VB3`'s closing paragraph against `VB3`'s first-match sentence** (`07:928` vs `07:882`). Read
   three times before concluding they cannot both be right (`X9-3`).

### Bottom line

- **3 of 9 rows executed unambiguously end to end**: B, C, D. (C and D each contain a `Q-29` skip
  that the data happens to make inert; every position is determined under both readings.)
- **6 material disagreements with §4.1**: B, C, D, E, G, I. Rows A, F and H agree on their headline
  claims. Of the six, **rows D and I are the ones I would not attribute to 04 being stale** — 04 is
  rev 7 and predates `D9-4` and `D9-5a`, but §20.7.5 anticipated only the *class* change on those
  rows, not that the answering record would be displaced by six or seven records that answer a
  different question. That is a property of rev 9.1, not of 04.
- **Are three criteria sufficient?** No — `X9-17`. Rows D, G and I each need a notion the function
  no longer has: how much of the dwelling the price bought, on the record side, when the visitor did
  not state breadth. §18 `Q-33` calls this "the strongest live argument that the narrowing gave up
  something the product needs" and cites one row. It is three.
