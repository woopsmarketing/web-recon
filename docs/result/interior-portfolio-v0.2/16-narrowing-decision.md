# 16 — V0.2 is narrowed: the pre-commitment fires

| | |
|---|---|
| date | 2026-09-24 |
| trigger | `15-delta-review-rev7.md` — **NOT READY**, 3 BLOCKER · 4 MAJOR · 9 MINOR · 5 NOTE. All three BLOCKERs inside §14.3. |
| authority | `00-work-plan.md` §2.4, as tightened in `14-rev7-disposition.md` §1 |
| decision | **Invoke.** Budget comparison leaves V0.2 and becomes a separately-reviewed V0.3 consumer annex. The wire contract is unaffected and can freeze. |

---

## 1. The commitment, and why there is no argument this time

`00-work-plan.md` §2.4 pre-committed to narrowing V0.2's scope if a round returned structural
BLOCKERs inside §14.3. It fired after round 5 and I did not invoke it. It fired after round 6 and I
did not invoke it. After round 6 I wrote, in `14` §1:

> From here the clause fires on **any** BLOCKER in §14.3, whatever its cause and whoever introduced
> it, with no further argument and no appeal to a reviewer's recommendation. Round 7 is the last
> round that gets a judgement call. … a pre-commitment that keeps yielding to reasoning is not one.

Round 7 returned three BLOCKERs, all inside §14.3. **The clause fires and I am not going to argue
with it.** The round-7 reviewer again recommends against restructuring and again describes the fixes
as one sentence each; that recommendation is exactly what I pre-committed not to appeal to.

What follows is therefore not a justification for invoking. It is the design of the narrowed scope.

## 2. The evidence that the clause is right, recorded because it is unusually clean

Two things make this more than rule-following.

**(a) `OD-O` has been violated in three consecutive rounds by three different routes.** Round 6's
`M-7`: `V.breadth` had no extraction rule, so *"욕실만 700만원"* could compare a bathroom budget
against `bi-09`'s 50,000,000 whole-home total. Round 7's `B7-3`: the extraction rule I added makes
`V.breadth` determinately *absent* for a trade restriction, so *"바닥이랑 도배만 3천만원"* makes
`bi-11` — a whole-home 20평 remodel — the single `exact` answer while `bi-19`, the record that
actually did those two trades for 11,000,000, comes back `not_evaluable`. Each fix moved the hole.
A defect that reappears through a new door every round is not a narrow defect.

**(b) Narrowing removes three BLOCKERs and three MAJORs by construction, not by argument.** This is
the test that matters, and it is checkable:

| finding | why it disappears |
|---|---|
| `B7-1` `pb1Permits` keys on `EF3`'s state, `PB1` keys on §14.3.3's row | `PB1` no longer exists |
| `B7-3` trade restriction budget-matches a whole-home total; `OD-O` violated | no budget comparison exists |
| `M7-1` the dropped-id record is still budget-**permitted** on a reduced `R_s` | no budget permission exists |
| `B7-2` `PB6a` sorts `exact` last, `GR3` says direct answers first — two `C: MUST`s | `PB6a` exists only to break price ties; it goes, leaving **one** ordering device |
| `M7-3` `WS6`'s *"resolve conservatively"* is under-determined | its discriminator was *"the reading that does not permit a price comparison"*. With no price comparison the tie-break is a plain one about which class is weaker |
| `M7-4` §20.5's *"relaxes nothing"* wrong for the sixth consecutive revision | the relaxation surface shrinks to what is left |

The round-7 reviewer's own closing diagnosis is the same shape: *"the edges — `GR3`/`PB6a`'s two
ordering devices, `PB1`'s two permission paths, `VB3`'s two axes — are still being fixed one side at
a time."* Every one of those pairs is a pair **because** of budget comparison. Remove it and the
pairs collapse to singles.

## 3. What is cut, what survives

**The cut is `V.budget` as a match criterion. It is not pricing.**

**Unchanged — the entire producer half, which is what web-recon owns and what freezes:**
`pricing.total` and `pricing.perArea` are still emitted with every rule intact — `PA1`–`PA5`,
`TP1`–`TP3`, `ND2`, `D-1`/`D-1a`/`D-1b`/`D-1c`, `RD1`'s integer arithmetic, `INV-19`/`INV-20`, the
`kind` discriminant's exact-XOR-range shape. **`OD-I`, `OD-J`, `OD-K` and `OD-L` are untouched.**
No wire field, no vocabulary, no invariant and no constant moves. The `1.6.0` Template Release cut
and the producer work list are unblocked by this decision, not blocked by it.

**Unchanged — prices remain visible to the customer.** `GR1` still makes every emitted price
statable as a fact, and `GR4`/`GR5`/`GR5a` still forbid fabricating one. The consultation can say
*"이 사례는 5,000만원이었습니다"*. What it may not say in V0.2 is *"예산에 맞습니다"*,
*"더 저렴합니다"*, or any ordering by price.

**Deferred to the V0.3 consumer annex**, kept in full in §17 so no work is lost: `PB0`, `PB0a`,
`PB1`, `PB3`, `PB3a`, `PB6`, `PB6a`, `EF5`, the `price_fallback` class, §14.3.3's budget column,
§14.3.4's price tier and `GR3`'s budget rung in its comparing form.

**Surviving prohibitions**, because a prohibition costs nothing and prevents the failure returning:
`PB2` (a total budget is never compared against a per-area amount), `PB4` (ordering neutrality,
strong form), `PB5` (a breadth-absent record is never described as matching a breadth-specific
budget). Under V0.2 these are trivially satisfied; they are kept so that V0.3 restores comparison
onto rails rather than onto a blank page.

**`V.budget` is still extracted** under `VB1`/`VB2` — it belongs in the lead record and it is what
the operator follows up on. It is simply not a match criterion.

## 4. The consequence I most want the owner to see

**V0.2 no longer amends a frozen V0 rule.** `PB0` was the single declared amendment — to `PR4`,
which forbids comparing or sorting prices outside one `category`. With no price comparison, `PR4` is
satisfied as written. So §16's consumer-confirmation item disappears, and V0.2 becomes a pure
extension of V0 rather than an extension plus an amendment. That materially lowers what the consumer
has to agree to before anything ships.

## 5. Where this conflicts with an owner decision, stated plainly

It does conflict, and I am not going to bury it.

- **`OD-E`** puts *total price* and *per-area price* in the ranking core. Narrowed V0.2 ranks on
  projectType, workScopes and area, with style as a weak bonus, and **not** on price.
- **Master task goal 5** — *"support full/partial/price/area/work-scope search"*. Price *search* in
  the sense of "show me what 2천만원 buys" becomes: the records are shown with their prices stated
  and their coverage stated, not filtered or ranked by the budget.
- **`OD-N`, `OD-O`, `OD-P`'s price fallbacks** describe behaviour that V0.2 will not have. None is
  *violated* — they are prohibitions and honesty requirements that a system doing no price
  comparison satisfies trivially — but they are not *exercised* either.

Against that: **rev 7 as it stands violates `OD-O` outright**, and rounds 5, 6 and 7 each violated it
by a different route. The choice is not between price matching and no price matching. It is between
a V0.2 that claims price matching and gets it wrong, and a V0.2 that does breadth, scope and area
correctly while showing prices as facts. `OWNER MODE` says to proceed on safe, non-destructive
defaults when the owner is away. Deferring a feature to a reviewed V0.3 is reversible; shipping a
consultation that tells a customer a 5,000만원 whole-home remodel fits a 700만원 bathroom budget is
not.

**If the owner wants price matching in this phase, the reversal point is §17's annex, which is
complete.** It needs its own review cycle — that is the whole content of this decision.

## 6. The V0.3 plan

1. V0.2 freezes on breadth · scope · area · style-bonus, with prices stated as facts.
2. The producer ships: `INV-30`, the `1.6.0` release cut, the demo data, the emit/validate work.
3. The consumer implements `EF1`–`EF4`, `EF6` (three criteria), `GR1`–`GR5a`, `GR3`/`GR3a`.
4. V0.3 restores budget comparison from §17's annex **as one device, not two**: a single permission
   function keyed on one thing, and a single ordering function. The round-7 reviewer's diagnosis —
   two devices doing one job, fixed one side at a time — is the design constraint V0.3 starts from,
   and the `EF6`-style *"compute one from the other"* move is what it applies to `PB1` and `PB6a`.
5. `CINV-20`'s derivation proof is rebuilt for the narrowed criteria first, so V0.3 adds to a proved
   base rather than to an argued one.

## 7. Status

- Contract **rev 8** implements this narrowing.
- `proof/ef6-totality.mjs` is rebuilt for three criteria.
- `04-demo-data-spec.md` §4.1's expected answers are restated without budget verdicts.
- Round 7's `M7-2` (rung rows not closed under their own classes) and the nine MINORs are **not**
  removed by narrowing and are fixed on their merits in rev 8.
