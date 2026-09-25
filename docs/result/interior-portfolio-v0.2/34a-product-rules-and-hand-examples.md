# 34a — Product rules and hand examples (Portfolio V0.2 simplification, steps 1–2)

| | |
|---|---|
| date | 2026-09-25 |
| task | Portfolio V0.2 rescue / simplification (`prompt`, owner brief of 2026-09-25) |
| input authority | `32-round-9-handoff.md`, `33-working-tree-fingerprint.md`, owner decisions in the brief |
| what this is | steps 1–2 of the brief: the four blockers rewritten as **plain product rules**, then **hand-computed examples**. The contract (step 3) and the checker (step 4) come after and must agree with this file, not the other way round |
| method | every example below was computed **by hand** from the rules in §2 and the 19 records in `data/sites/boost-interior-demo/content/projects.json`, before any code was written |

Pre-flight: web-recon `git diff | shasum` = `2efea94b…3ea2a6`, boost-chat = `91637c28…b40070`, and all
eight untracked load-bearing files hash as recorded in `33-`. Nothing drifted; work proceeded.

---

## 1. The four blockers, as product rules

### 1.1 `B9-4` — partial requests (owner decision, not re-asked)

**Old behaviour.** `EF3`'s `full_remodel` branch called the scope criterion `satisfied` for any set
of rooms, and `VB3` sent "욕실 하나만" to breadth-absent, so six whole-home remodels were `exact` and
the one-bathroom job was seventh.

**Rule.** When the visitor asks for specific rooms or trades and did **not** ask for a whole-home
remodel, rank by the owner's ladder:

1. **exact** — a partial remodel whose remodelled rooms are exactly the rooms asked for, and which
   carries every trade asked for. For a request that names **only trades** ("도배랑 바닥만"), the
   record carries every trade asked for and **no room id at all** — the trades-only shape `PT5`/`PT6`
   prescribe (projectType absent). **‡ Superseded (§7):** rooms alone decide exact, and a
   trade-only request has no exact.
2. **overlap** — any other partial remodel that shares at least one requested room or trade.
3. **fallback** — a whole-home remodel, or a record whose breadth is unknown, that contains a
   requested room or trade. A whole-home remodel contains every room (`PT4`(b)); its trades are the
   ones it lists.
4. **other** — everything else.

A whole-home remodel is **never** exact for such a request. A record whose breadth is unknown is
**never** exact for a room request (its room list is not closed, `WS7b`).

"욕실 하나만" is a **partial** request (owner decision A); `D9-4`'s "만 on a quantity is not a
restriction" is deleted.

**Why the trades-only clause is not an extra rule** (‡ withdrawn, §7). It is the same condition — *remodelled rooms
equal the rooms asked for, every asked trade present* — read with "rooms asked for = none". The
only records whose room list can be empty are breadth-absent ones (`INV-29`/`INV-30` forbid an empty
room list for both project types), so the clause cannot promote a record with an unknown room list
on a room request. It is flagged in §5 as the one place the owner's ladder had to be *read* rather
than applied, because the owner's examples were all room requests.

### 1.2 `B9-1` — missing data (owner product intent)

**Old rule, retired.** *"Delete a stated criterion's input, re-rank, the record must not move
down."* (property 4a, `CINV-5` as written). The owner no longer wants this: a record that loses a
matching fact loses positive evidence, and it is correct that it drops.

**Not reused.** Property 4b ("0 of 798", the twin comparison) was withdrawn in round 9 and is **not**
evidence for anything below.

**‡ Superseded by contract `PB4` (a property, judged on the whole evaluation, with the no-valid-value and all-positive cases — §6, §7 R-5).** Original text: **New rule — missing is scored as the least favourable real value, never below it.** For every
ranking key, a record whose input for that key is missing gets **exactly** the key value it would
get if that input carried the least favourable value it could validly carry. Consequences, all
direct:

- no key has a value reserved for "missing", so missing is never *below* a known mismatch;
- no class exists that only missing records can reach;
- nothing is filtered — every record is returned;
- a record that had a *matching* value and loses it drops to the no-evidence value, so its global
  rank **may** fall. That is allowed.

Every key is built so that its worst value means "no positive evidence": area outside ±20 %, price
outside ±20 %, no style match, zero requested ids covered, class `other`/`fallback`. Missing lands
there and nowhere lower.

### 1.3 `B9-3` — one writer for the match state

**Old defect.** `D9-9` sentence 4 (§14.3.3) assigned `not_evaluable` from inside the disclosure
rules, contradicting `EF1`.

**Rule.** The class is assigned by **one** table and the tiers by **one** rule. Every other rule —
`WS6`, `WS7a/b`, `WS8`, `PT4`(b)'s ground-not-conclusion, the price statements — only phrases what
those two produced. Nothing re-assigns, overrides or re-derives a class or a tier.

**How it is reached: by deletion.** `D9-9`, `D9-7a`, `D9-8` and `WS6`'s multi-reading `V.scope`
existed only because one visitor term could carry two readings. The consumer's alias table now maps
each term to **one** id (or none); the reply may say which reading it used. With one `Q` there is no
per-reading state to reconcile, and sentence 4 has nothing to do.

### 1.4 `B9-2` — ordering

**Old defect.** Key (2) said a record it could not order "keeps the position the previous key gave
it" — there was no such position — and three readings of that sentence were each killed.

**Rule.** One fixed tuple, compared left to right, every key defined for every record:

```
( classRank, areaTier, priceTier, −coverage, styleTier, id )
```

A key that does not apply to a query takes **one constant value for every record**; nothing is
skipped and no position is "kept". `id` is unique, so no two records tie. The order is a
lexicographic order on tuples of totally ordered values: total, transitive and deterministic by
construction.

---

## 2. Definitions the examples use

**Mode** (from what the visitor said):

- `whole` — `V.breadth = whole`;
- `part` — `V.breadth = partial`, or breadth not stated but a room or trade named (`Q ≠ ∅`);
- `open` — neither.

**Covers.** A record covers an id if the id is in its `workScopeIds`, or the record is a
`full_remodel` and the id is a room (`PT4`(b)). `coverage` = how many requested ids it **lists** —
`PT4`(b) decides the class, never the coverage (†, §6).

**Class** (first row that holds):

| mode | exact | overlap | fallback | other |
|---|---|---|---|---|
| `open` | every record | — | — | — |
| `whole` | `full_remodel` | — | every other record | — |
| `part`, nothing named | `partial_remodel` | — | every other record | — |
| `part`, something named | §1.1 rule 1 (and no id dropped, `WS8`) | a `partial_remodel` sharing a requested id | covers a requested id | otherwise |

**Tiers.** Strong `≤ 10 %`, acceptable `≤ 20 %`, otherwise **none** (`OD-M`, `OD-N`).

- *area* — visitor figure is the divisor; `AR4` unit conversion; supply vs exclusive is never
  compared (`AR5`) ⇒ none. Applies in `whole` and `open` only; in `part` the house area is ignored
  (owner: "약하거나 무시"), i.e. every record gets **none**.
- *price* — the visitor's total budget against `pricing.total`, **only for a record in class
  `exact` in mode `whole` or `part`** — the case where the jobs are the same kind (`OD-O`). Every
  other record gets **none**. Intervals: exact budget `[a,a]`, range `[min,max]`, max `[0,a]`; a
  range total `[min,max]`. Overlapping intervals ⇒ strong; otherwise gap ÷ nearest budget bound.
- *style* — a stated style present in the record's `style` facet ⇒ match, else none.

**Order.** `classRank` exact 0 · overlap 1 · fallback 2 · other 3; tiers strong 0 · acceptable 1 ·
none 2; coverage **descending**; style match 0 · none 1; `id` ascending.

Record key used below (from `projects.json`; `S` = strong, `A` = acceptable, `N` = none):

| id | type | ids | area | total |
|---|---|---|---|---|
| bi-01 | full | entrance kitchen bathroom flooring lighting bif | 34 py | — |
| bi-02 | — | kitchen flooring bif | 24 py | — |
| bi-03 | — | entrance lighting bif | 42 py | — |
| bi-04 | partial | kitchen bathroom | 32 py | — |
| bi-05 | — | flooring painting bif | 29 py | — |
| bi-06 | partial | entrance living_room lighting | 34 py | — |
| bi-07 | full | kitchen flooring doors bif | 19 py | — |
| bi-08 | — | living_room lighting | 51 py | — |
| bi-09 | full | entrance kitchen bathroom flooring wallpaper lighting bif | 34 py | 50,000,000 |
| bi-10 | full | entrance living_room kitchen bedroom dressing_room bathroom windows expansion bif | 34 py | 85,000,000 |
| bi-11 | full | kitchen bathroom flooring wallpaper doors | 20 py | 30,000,000 |
| bi-12 | full | entrance kitchen bathroom flooring lighting bif | 26 py | 52,000,000 |
| bi-13 | full | 8 rooms + windows lighting bif | 48 py | 125–140,000,000 |
| bi-14 | partial | kitchen | 84 m² excl. | 15,000,000 |
| bi-15 | partial | bathroom | — | 7,000,000 |
| bi-16 | partial | kitchen bathroom | 38 py | 19,800,000 |
| bi-17 | partial | living_room flooring | 112 m² supply (33.88 py) | 12,500,000 |
| bi-18 | partial | entrance bif | 30 py | 6,200,000 |
| bi-19 | — | flooring wallpaper lighting | 32 py | 11,000,000 |

(`bif` = `built_in_furniture`. All areas are supply basis except `bi-14`.)

---

## 3. Hand examples

Synthetic records are named by what they are. `V` is written out explicitly; how an utterance
becomes `V` is the consumer's (`VB3` table + its own alias table), so the examples fix it.

### 3.1 `B9-4` — the partial-request ladder (10)

Synthetic set **S1**: `P-bath` partial [bathroom] 7,000,000 · `P-kb` partial [kitchen, bathroom]
19,800,000 · `P-kit` partial [kitchen] · `F-full` full [entrance, kitchen, bathroom, flooring,
wallpaper] 50,000,000 · `F-nobath` full [kitchen, flooring, doors] · `U-bath` — [bathroom, tiling]
· `U-kit` — [kitchen] · `T-floor` — [flooring, wallpaper, lighting] 11,000,000.

| # | utterance / `V` | expected | why |
|---|---|---|---|
| B4-1 | "욕실 하나만" · part · Q = {bathroom} | `P-bath` exact · `P-kb` overlap · `F-full`, `F-nobath`, `U-bath` fallback · `P-kit`, `U-kit`, `T-floor` other. Order: P-bath, P-kb, F-full, U-bath, F-nobath (†), P-kit, T-floor, U-kit | owner A; `F-nobath` covers bathroom through `PT4`(b) |
| B4-2 | "주방이랑 욕실만" · part · Q = {kitchen, bathroom} | `P-kb` exact · `P-bath`, `P-kit` overlap (coverage 1) · `F-full` fallback (coverage 2) · `F-nobath`, `U-bath`, `U-kit` fallback (coverage 1) (†) · `T-floor` other | fallback ordered by coverage: whole-home first because it covers both rooms |
| B4-3 | "욕실 하나만 700만원" · part · Q = {bathroom} · budget 7,000,000 | `P-bath` exact, price **S**. `P-kb` overlap, price **N** (not compared). `F-full` fallback, price **N** | price compared only inside `exact` (`OD-O`) |
| B4-4 | "주방만" · part · Q = {kitchen} | `P-kit` exact · `P-kb` overlap · `U-kit` **fallback, not exact** | breadth unknown ⇒ room list not closed ⇒ never exact on a room request |
| B4-5 | "도배랑 바닥만" · part · Q = {wallpaper, flooring} | `T-floor` exact (‡ fallback, §7) · `F-full` fallback (coverage 2) · `F-nobath` fallback (coverage 1) · rest other | trades-only shape, all asked trades present |
| B4-6 | "바닥만" · part · Q = {flooring} | `T-floor` exact (‡ fallback, §7) · `F-full`, `F-nobath` fallback | extra trades (`lighting`) do not remove exactness; disclosed |
| B4-7 | "욕실 두 개" · breadth absent · Q = {bathroom} ⇒ part | identical to B4-1 | naming rooms puts the query in `part` whether or not 만 was said; `WS3` cannot represent "two" |
| B4-8 | "전체 리모델링" · whole · Q = ∅ | `F-full`, `F-nobath` exact · all others fallback | full is exact **only** when whole was asked |
| B4-9 | `P-bath-x` partial [bathroom, *id unknown to the consumer*] on B4-1's `V` | **overlap**, never exact | `WS8`: the room list is no longer known to be closed |
| B4-10 | "욕실 하나만" on the 19 records | bi-15 exact (1st) · bi-04, bi-16 overlap (2nd, 3rd) · seven full remodels fallback (4th–10th) · nine records other | row D fixed: the 85,000,000 remodel (bi-10) is 6th (†) and labelled fallback |

### 3.2 `B9-1` — missing is the least favourable real value (9)

`del(x)` = the record with input `x` deleted. "Worst fill" = the least favourable **valid** value
(`INV-28`–`30` respected).

| # | query · record | before | after `del` | worst fill | equal? | global rank |
|---|---|---|---|---|---|---|
| MN-1 | row B "예산 3천으로 전체" · bi-09 · del(projectType) | exact, price N | fallback, price N | `partial_remodel` ⇒ fallback, price N | **yes** | 4 → 13 (allowed: lost positive evidence) |
| MN-2 | row D "욕실 하나만" · bi-15 · del(projectType) | exact | fallback (unknown breadth, lists bathroom), coverage 1 | `full_remodel` ⇒ fallback, coverage 1 | **yes** | 1 → 9 (†) (bi-04, bi-16 overlap, then the six full fallbacks that list bathroom, by id, then bi-15′; bi-07 lists no bathroom and follows) |
| MN-3 | row D · bi-07 · del(projectType) | fallback (covers bathroom via `PT4`(b)), coverage 0 (†) | other, coverage 0 (lists no bathroom) | `partial_remodel` ⇒ other, coverage 0 | **yes** | 10 → 14 (†) (`PT4`(b) evidence lost) |
| MN-4 | row A "34평 전체 5천" · bi-09 · del(area) | exact, area S, price S | exact, area N, price S | area far away ⇒ N | **yes** | 1 → 3 (bi-01, bi-10 are area S; bi-09′ ties bi-12 on (0,N,S), `id` puts bi-09′ first) |
| MN-5 | row A · bi-09 · del(total) | exact, area S, price S | exact, area S, price N | total far away ⇒ N | **yes** | 1 → 2 (ties bi-01, bi-10 on (0,S,N); `id` puts bi-01 first) |
| MN-6 | row G "도배랑 바닥만" · bi-19 · del(workScopeIds) | exact (‡ fallback) | other (no ids ⇒ covers nothing) | an id set disjoint from Q ⇒ other | **yes** | 1 → 19 (‡ 4 → 19, §7) |
| MN-7 | B4-9 · `P-bath-x` · the dropped id | overlap | — (the drop *is* the missing input) | unknown id is a room ⇒ `R_s ≠ Q_s` ⇒ overlap | **yes** | — |
| MN-8 | "화이트 톤" (open, style 화이트) · bi-18 (no style) | style N | — | a style not asked ⇒ N | **yes** (already missing) | tie with non-matching records, ordered by id |
| MN-9 | any query · any record · del(any input) | — | the record is still returned | — | — | no filter: 19 in, 19 out |

MN-1 is `32-` §5.1's counterexample (rank 3 → 11 there). Under the new rule the drop is **expected**
and the property that is asserted is the equality column, not the rank column.

### 3.3 `B9-3` — one writer (5)

| # | situation | class/tier written by | other rule's job | expected |
|---|---|---|---|---|
| SW-1 | B4-1, `F-full` | class table: fallback | `PT4`(b) ground-not-conclusion supplies the sentence | reply: "집 전체를 리모델링한 사례입니다" — never "욕실이 포함되어 있습니다" unless `bathroom` is listed (it is, so either may be said) |
| SW-2 | B4-2, `P-kit` | class table: overlap | `WS7a` wording | reply names bathroom as "이 사례의 리모델링 범위에 없었습니다" — never "욕실 공사는 없었습니다" |
| SW-3 | "현관 수납", consumer table 수납 → `built_in_furniture` | class table on the single `Q` | `WS6`: the reply may say "수납을 붙박이 수납으로 이해했습니다" | bi-18 exact; no second state for another reading exists to reconcile |
| SW-4 | B4-9 `P-bath-x` | class table (no-drop condition): overlap | `WS8` supplies only "no absence is stated for this record" | class unchanged by `WS8` |
| SW-5 | "전용 84 주방" style: whole variant "전용 84 전체" · a supply-basis record | area tier: N (`AR5`) | disclosure: "면적 기준(공급/전용)이 달라 비교하지 않았습니다" | tier stays N; no class change |

### 3.4 `B9-2` — ordering (7)

| # | situation | expected |
|---|---|---|
| O-1 | "전체 리모델링 사례 보여주세요" (whole, nothing else) | seven full exact, every other key flat ⇒ `id`: bi-01, bi-07, bi-09 top-3 |
| O-2 | row A: bi-04, bi-15, bi-17 (`32-` §5's cycle trio, all fallback) | tuples (2,S,N,0,1,bi-04), (2,N,N,0,1,bi-15), (2,S,N,0,1,bi-17) ⇒ bi-04 < bi-17 < bi-15. A strict chain; no cycle is possible |
| O-3 | missing area vs far area, both exact | same `areaTier` N ⇒ decided by the next key, never "kept in position" |
| O-4 | shuffle the 19 input records 50 times, any query | identical output order every time |
| O-5 | row A top | bi-09 (0,S,S) > bi-01 (0,S,N) > bi-10 (0,S,N) |
| O-6 | "창호 교체하려는데 34평 전체" | all full exact; area S for bi-01/09/10; coverage 1 for bi-10 (windows) ⇒ bi-10, bi-01, bi-09 |
| O-7 | any two records in any query | exactly one precedes the other (ids unique) |

### 3.5 Acceptance rows — the 19 records (10)

`V` fixed here; top-3 is the result limit the demo uses.

| row | utterance | `V` | top-3 (class) | where the named record lands |
|---|---|---|---|---|
| A | 34평 전체 5천이면 되나요 | whole · area 34 py · budget 50,000,000 | bi-09 exact (S,S) · bi-01 exact (S,N) · bi-10 exact (S,N) | bi-12 4th (N,S); full order 09,01,10,12,07,11,13 then fallback 04,06,17,19,05,16,18,02,03,08,14,15 |
| B | 예산 3천으로 전체 가능해요? | whole · budget 30,000,000 | bi-11 exact (price S) · bi-01 exact · bi-07 exact | then 09,10,12,13; fallback by id |
| C | 주방만 하면 얼마예요 | part · {kitchen} | bi-14 exact · bi-04 overlap · bi-16 overlap | fallback 01,02,07,09,10,11,12,13 |
| D | 욕실 하나만 | part · {bathroom} | bi-15 exact · bi-04 overlap · bi-16 overlap | fallback 01,09,10,11,12,13, then 07 (lists no bathroom) — bi-10 6th (†) |
| D2 | 욕실 두 개 | breadth absent · {bathroom} ⇒ part | = D | — |
| E | 전용 84 아파트 주방 | part · {kitchen} · area unit unresolved ⇒ absent (and ignored in part) | = C | — |
| F | 50평 전체 1억 넘나요 | whole · area 50 py · budget absent (넘나요 is not a `VB1` shape) | bi-13 exact (S) · bi-01 exact · bi-07 exact | bi-08 8th = first fallback (51 py, S), bi-03 9th (A) |
| G | 32평인데 도배랑 바닥만 얼마예요 | part · {wallpaper, flooring} (area ignored) | bi-19 exact · bi-17 overlap · bi-09 fallback (cov 2) — ‡ now bi-17 overlap · bi-09, bi-11 fallback (cov 2) | ‡ bi-19 4th (fallback, cov 2), then 01, 02, 05, 07, 12 (cov 1) |
| H | 바닥이랑 거실만 | part · {living_room, flooring} | bi-17 exact · bi-06 overlap · bi-01 fallback (cov 2) | fallback, all cov 1, by id: 01,02,05,07,08,09,10,11,12,13,19 (†) |
| I | 현관 수납 | part · {entrance, built_in_furniture} (consumer table: 수납 → bif) | bi-18 exact · bi-06 overlap · bi-01 fallback (cov 2) | fallback cov 2: 01,03,09,10,12,13; cov 1: 02,05,07; cov 0: 11 (†) |

Row I with a consumer table that maps 수납 → `storage` instead: `Q = {entrance, storage}`, no exact,
overlap bi-06, bi-18 (coverage 1 each, by id). That difference is the **alias table's**, and the
contract is a function of `V`; it is recorded, not resolved (`M9-2` is scoped, not closed by a rule).

(‡ Row G changed after the fresh review — §7.) Against `04` §4.1 and `31-`'s area-C verdict: rows **B, D, G, I** — the four "badly served" rows —
now lead with `bi-11`, `bi-15`, `bi-19`, `bi-18`, the answers `04` names. Rows A, C, F, H keep their
headline record first. Row E is decided (it no longer depends on the area reading).

---

## 4. What the examples decided, for step 3

| contract change | examples that force it |
|---|---|
| `VB3`: any 만-restriction (rooms, trades, quantity) and 부분/일부 ⇒ partial; `D9-4` deleted | B4-1, B4-10, row D |
| mode `part` = partial **or** something named ⇒ breadth-absent vs partial stops mattering when `Q ≠ ∅` (dissolves `Q-26`) | B4-7, rows D2/E/H/I |
| one class table (4 classes) replaces `EF1`–`EF6`, §14.3.3, §14.3.3.1, `GR2`'s 10 classes, `GR2a` | all of 3.1 |
| price tier restored, **exact class only** (`OD-N`, `OD-O`), `PR4`'s category condition for totals replaced by it | B4-3, rows A/B |
| area ignored in `part` | rows E, G |
| `WS6` single reading per term; `D9-7a`/`D9-8`/`D9-9` deleted | SW-3, row I |
| `WS8` = "no id dropped" guard on `exact`, and the dropped-id record is overlap at best | B4-9, MN-7, SW-4 |
| `PB4`/`CINV-5` restated as "missing = least favourable valid value", judged on the whole evaluation (†) | 3.2 |
| one tuple, constant keys, `id` last; key (2)'s carve-out and `publishedAt` deleted | 3.4 |

## 5. Read, not applied — flagged for the owner

1. (‡ default flipped to the literal ladder, §7.) **Trade-only requests.** The owner's ladder was given for room requests. Applied literally, a
   trade-only request can have no exact answer (a `partial_remodel` must name a room, `INV-30`), and
   row G would lead with bi-17 (a living-room remodel) over bi-19 (the whole-dwelling
   도배·바닥·조명 job the visitor described). §1.1 reads the ladder's rule 1 with "rooms asked for =
   none". If the owner prefers the literal reading, delete the trades-only clause: one sentence.
2. **`whole` mode treats unknown-breadth and known-partial records alike** (both fallback). The
   owner gave no ladder for whole requests; a tie is the neutral choice.
3. **No price ranking in `open` mode** ("5천으로 뭐 할 수 있어요?"): the visitor named no job, so no
   job kind can match (`OD-O`); prices are stated as facts only.

---

## 6. Correction found by the checker (†)

The cells marked † above were changed **after** the checker was written. The change is recorded
here, with the original hand values, because the method line of this file says the examples came
first.

**What the checker saw.** `P3` (PB4, missing-neutrality) failed 22 times on its first run. Example:
row H, `bi-01` (`full_remodel`, lists one of {living_room, flooring}), input `projectType` deleted.

| | class | coverage | tuple |
|---|---|---|---|
| deleted (breadth unknown) | fallback | 1 — only what it lists | `(2,2,2,−1,1)` |
| valid value `full_remodel` (original §2) | fallback | 2 — lists one, `PT4`(b) credits living_room | `(2,2,2,−2,1)` |
| valid value `partial_remodel` | overlap | 1 | `(1,2,2,−1,1)` |

The deleted record sorted **below every value it could validly hold** — the missing input was
penalised, which the owner's decision forbids. The cause was in the rules, not the checker: the
original §2 let `PT4`(b) raise `coverage`, so deleting `projectType` lowered class and coverage in
opposite directions and no single valid value was worst on both.

**Fix (contract and this file).** `coverage` counts the requested ids a record **lists**; `PT4`(b)
still decides the class (row 8 of the class table), never the coverage. `PB4` now says the
comparison is on the **whole** evaluation (class and all tiers together), not key by key. With both,
`P3` passes over the fixtures and over the enumeration (25,152 deletions), and "deletion never
raises rank" holds as a consequence (reported, not asserted: up 0).

This is the contract being fixed because it broke the owner's rule, not the contract being moved to
pass the checker: the product rule ("missing gets no penalty, may lose positive evidence") did not
change; the definition that violated it did.

**Original hand values, now superseded.**

| cell | original | corrected |
|---|---|---|
| §2 coverage | how many requested ids it *covers* (incl. `PT4`(b)) | how many it *lists* |
| B4-1 order | … F-full, F-nobath, U-bath … | … F-full, U-bath, F-nobath … (F-nobath lists no bathroom) |
| B4-2 | F-full, F-nobath coverage 2 | F-full 2; F-nobath 1 (order unchanged) |
| B4-10 / row D | bi-10 7th; fallback 01,07,09,… | bi-10 6th; bi-07 last fallback (10th) |
| MN-2 | 1 → 10 | 1 → 9 |
| MN-3 | coverage 1, 5 → 14 | coverage 0, 10 → 14 |
| row H fallback | cov 2: 01,07,09,11,12; cov 1: … | all cov 1, by id |
| row I fallback | cov 2 incl. 07; cov 1 incl. 11 | 07 cov 1; 11 cov 0 |

No class, no top-3 of any acceptance row, and no owner-visible headline changed.

---

## 7. Changes after the fresh-context review (‡)

`34c-fresh-review.md` found one `BLOCKER` and five `MAJOR`s. Two of them change examples in this
file; the cells are marked ‡ and keep their original text so the change can be seen.

**`B-1` — the trades-only clause of §1.1 rule 1 was wrong.** "Carries no room id" was read as "no
room was remodelled", but a breadth-absent record's room list is open (`WS7b`): it means "no room
was *recorded*". `bi-05` is the proof — its summary says *"29평 아파트 전체 리모델링"*, yet it is
recorded as `[flooring, painting, built_in_furniture]` with no `projectType`, exactly `bi-19`'s
shape. Under the clause it was the first direct answer to *"바닥만"*. The clause is deleted, so the
owner's ladder applies as stated and a trade-only request has no exact. `bi-19` cannot be lifted
without also lifting `bi-05` until a closed-trade field exists (contract §17.2, `OQ-1`).

**`M-4` — "carries every trade asked for" was also wrong.** A trade a record does not list is
unknown, even for a partial remodel (`WS7a`), so requiring it demoted a job for missing data —
against owner decision B. `bi-15` (one bathroom; its body describes the new tiling) fell to overlap
on *"욕실 타일만"* and lost to `bi-04` on `id`. Rule 1 is now: **a partial remodel whose remodelled
rooms are exactly the rooms asked for (at least one room asked)**. Requested trades order records
through coverage (contract `OQ-5`).

| cell | original | now |
|---|---|---|
| §1.1 rule 1 | rooms equal **and** every trade present; trades-only clause | rooms equal, ≥ 1 room asked; no trades-only clause |
| B4-5 "도배랑 바닥만" on S1 | `T-floor` exact | `T-floor` fallback (coverage 2), after `F-full` by `id` |
| B4-6 "바닥만" on S1 | `T-floor` exact | `T-floor` fallback (coverage 1) |
| MN-6 | bi-19 exact, rank 1 → 19 | bi-19 fallback, rank 4 → 19 |
| row G top-3 | bi-19 · bi-17 · bi-09 | bi-17 overlap · bi-09 · bi-11 fallback; bi-19 4th |
| §3.5 note | rows B, D, G, I lead with the `04` answers | B, D, I do; G leads with bi-17 (`OQ-1`) |
| §5 item 1 | default: read | default: literal ladder |

**New examples (executed by the checker):**

| # | query | result |
|---|---|---|
| R-1 | "바닥만" | no exact; bi-17 overlap first; bi-05 and bi-19 fallback |
| R-2 | "바닥만 1000만원" | no exact, so no record's price is compared (`not_applied`) |
| R-3 | "욕실 타일만" | bi-15 exact first; bi-04, bi-16 overlap |
| R-4 | "주방 타일만" | bi-14 exact first; bi-04, bi-16 overlap |
| R-5 | "10억 이내로 전체" · bi-09 without `pricing.total` | price none, although every valid total would be strong: the evidence is lost, not penalised (`PB4` 2) |

The other review fixes (`PB4` stated as a property, `GR3` labels per mode, the `not_applied` note,
`VB3` row order, the checker's `P3`/`P8`) change no example in this file.
