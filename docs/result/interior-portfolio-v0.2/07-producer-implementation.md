# 07 — V0.2 producer implementation (web-recon)

| | |
|---|---|
| status | **implemented**; typecheck clean, `platform/test/integration.test.ts` green apart from the explicitly marked skips below |
| date | 2026-09-24 |
| implements | `docs/reports/integration/07-integration-contract-v0.2-candidate.md` (rev 2) **plus the four rev-3 corrections** received mid-package (§2) |
| scope | producer only. `data/sites/**` untouched, no golden rebuild, no template or Template Release change |
| verify | `./node_modules/.bin/tsc -p platform/tsconfig.json` · `./node_modules/.bin/tsx --tsconfig platform/tsconfig.json platform/test/integration.test.ts` |

---

## 1. Files changed

| file | why |
|---|---|
| `platform/content/schema.ts` | the five AUTHORED V0.2 fields on `ProjectSchema` (`projectType`, `propertyType`, `workScopeIds`, `totalPrice`, `styles`) and the canonical closed vocabularies they draw on (`PROJECT_TYPES`, `PROPERTY_TYPES`, `WORK_SCOPE_SPACE_IDS` + `WORK_SCOPE_WORK_IDS` → `WORK_SCOPE_IDS`), plus the INV-28 / INV-29 authoring checks |
| `platform/integration/contract.ts` | `PORTFOLIO_SCHEMA_VERSION` → `"1.0"` (`CORE_SCHEMA_VERSION` stays `"0.1"`), `PRODUCER_VERSION` 1 → 2, re-export of the frozen canonical vocabularies, `PER_AREA_SOURCES` / `TOTAL_PRICE_KINDS` / `PRICE_AMOUNT_MAX` / the two RD1 bounds, `WELL_KNOWN_FACETS` and `CONSUMER_DECLARED_LIMITS` retire `scope` and add a provisional `style` |
| `platform/integration/emit.ts` | the V0.2 record/document shape (`property`, `workScopeIds`, `pricing`, `facets.style`, document `workScopes`), the `tag = keywords − styles` subtraction, and `derivePerArea` — the D-1/RD1 derivation and the only computed value in the producer; `PortfolioEmission` gains `warnings` so an RD1 guard failure reaches the build |
| `platform/integration/validate.ts` | fail-closed validation of every new shape rule and of INV-17 … INV-29, including recomputation of a `derived` perArea against RD1; merges the emitter's warn-and-omit warnings into the build warnings |
| `platform/test/integration.test.ts` | new `[annex]` block (A1–A11) on crafted snapshots, new validator blocks V14/V15, C4 (vocabularies), G2b; every existing check migrated to the V0.2 shape; ten checks marked `TODO(v0.2-data)` / `TODO(v0.2-release)` and skipped |

Deliberately **not** changed: `platform/build/site-build.ts` (it already reads both schema versions from `contract.ts`, so the build record and `integrationInputHash` move by themselves), `platform/integration/sources.ts`, `data/sites/**`, `data/site-builds/**`, `templates/**`, `data/template-releases/**`.

---

## 2. The four rev-3 corrections, as implemented

1. **`facets.tag` = `keywords` − `styles`.** The emitter emits `facets.style` from the authored `styles` (authored order, first occurrence) and `facets.tag` from the authored `keywords` **minus every value present in `styles`**, survivors in authored order, key omitted when empty. The schema rule that refused a value present in both fields was **deleted** — overlap is the normal authoring shape. INV-24 is kept as a check on the **emitted document**.
2. **INV-29 + the SPACES/WORKS split.** `WORK_SCOPE_SPACE_IDS` (14) and `WORK_SCOPE_WORK_IDS` (12) are exported separately and frozen; `WORK_SCOPE_IDS` is their union in §7.3 order, still 26. `projectType === "full_remodel"` now requires at least one SPACE id, enforced in the content model **and** in the emitter validator.
3. **The extra RD1 guard.** `A <= 100_000_000` (`RD1_AREA_MINOR_MAX`) added to the input guards. The formula is untouched.
4. **No PT4 in code.** `projectType` is copied verbatim from the authored field. There is no classifier, no fallback and no read of `category`, `scope`, `summary` or `body` anywhere in the emitter; the only `projectType`-driven machine rules are INV-19, INV-28 and INV-29.

### 2.1 One consequence of correction 2 worth a decision

Read literally — and that is how it is implemented — INV-29 makes `workScopeIds` **mandatory for every `full_remodel`**: with `workScopeIds` absent there is no SPACE id, so the implication fails. Together with INV-28 this means **any record that states a `projectType` at all must carry `workScopeIds`**. That is stricter than 07 §7.4 WS7b, which leaves the set open (and therefore optional) for non-`partial_remodel` records. It is consistent with the stated rationale (a breadth claim that cannot be checked must not feed D-1), and it is what the demo-data spec will have to satisfy. If the intent was the weaker "if `workScopeIds` is present it must contain a space", one line in each of `platform/content/schema.ts` and `platform/integration/validate.ts` changes.

### 2.2 INV-24 is enforced per RECORD, not per document

The subtraction makes a **record's** `style` and `tag` arrays disjoint by construction, and that is what the validator enforces. It cannot make the **document-level** vocabularies disjoint: if `bi-01` marks 화이트 as a style and `bi-05` leaves the same word as a plain keyword, 화이트 is declared in both `facets.style.values` and `facets.tag.values`. Making that an error would fail builds on inconsistent-but-honest authoring, so it is not one. A9 asserts the per-record rule and documents the cross-record case. Flagged for the contract owner: if SD1 is meant to bind the document vocabularies too, the demo data has to mark a style consistently across every record, and this becomes a build error.

---

## 3. D-1 / RD1 — the implementation, verbatim

`platform/integration/emit.ts`:

```ts
/**
 * 07 §9.3 **D-1 · the one permitted derivation** (ND2), and the ONLY place in this producer that
 * computes a value instead of copying one.
 *
 * Emitted **if and only if** all five conditions hold:
 *   1. `projectType == "full_remodel"` — by PT2 the area and the total then describe the same
 *      thing. **D-1a**: never for `partial_remodel` and never when `projectType` is ABSENT. *A 34평
 *      flat whose bathroom cost 6,000,000 has no per-area price*; `6,000,000 / 34` is meaningless
 *      and is the single most important prohibition in V0.2.
 *   2. `total.kind == "exact"` — a range has no single right answer.
 *   3. `property.area.value` and `.unit` are present.
 *   4. no AUTHORED `perArea` — authored always wins (PA1, INV-21). The caller only reaches this
 *      function when `p.pricePerArea` is absent, so no authored value can be replaced.
 *   5. the RD1 guards below hold.
 *
 * **RD1 — integer arithmetic only.** Floating-point division is not reproducible across platforms
 * and would break INV-1 / INV-26. The guards bound both inputs (`T ≤ 1e11`, `1 ≤ A ≤ 1e8`) so that
 * `T` and `A` are EXACT integers — the area schema caps fraction digits but not magnitude, which is
 * why `A` needs its own ceiling — and `2*T + A ≤ ~2e11 ≪ 2^53`. `(2*T + A) / (2*A)` is therefore a
 * division of two exactly representable integers whose quotient is correctly rounded to within
 * `N * 2^-53 < 1` of the true value, so `Math.floor` of it is the exact integer floor, i.e.
 * round-half-up of `T/A`.
 *
 * `perUnit` is the record's own `area.unit`, NEVER converted (AR3/AR4); `currency` is the total's.
 * There is no path from `perArea × area` to a total (D-1b / TP3 / PR5) and none from a non-
 * `full_remodel` record to a derived price (D-1a): both are refused before any arithmetic runs.
 *
 * A guard failure emits NO `perArea` and one warning — the build does not fail (07 §9.3, VA1).
 */
export function derivePerArea(
  input: { projectType?: ProjectType; total?: TotalPrice; area?: { value: number; unit: string } },
  onGuardFailure: (why: string) => void,
): PerAreaPrice | undefined {
  const { projectType, total, area } = input;
  if (projectType !== "full_remodel") return undefined; // D-1a — also covers `projectType` absent
  if (!total || total.kind !== "exact") return undefined;
  if (!area || typeof area.value !== "number" || typeof area.unit !== "string") return undefined;

  const T = Math.round(total.amount * 100);
  const A = Math.round(area.value * 100);
  if (!Number.isSafeInteger(T) || !Number.isSafeInteger(A) || A < 1 || A > RD1_AREA_MINOR_MAX || T < 1 || T > RD1_TOTAL_MINOR_MAX) {
    onGuardFailure(`RD1 input guard: total ${total.amount} ${total.currency} / area ${area.value} ${area.unit} (T=${T}, A=${A})`);
    return undefined;
  }
  const amount = Math.floor((2 * T + A) / (2 * A)); // round half up, integer major unit
  if (!(amount >= 1 && amount <= PRICE_AMOUNT_MAX)) {
    onGuardFailure(`RD1 output guard: ${amount} is outside 1..${PRICE_AMOUNT_MAX} (total ${total.amount} ${total.currency} / area ${area.value} ${area.unit})`);
    return undefined;
  }
  return { amount, currency: total.currency, perUnit: area.unit, source: "derived" };
}
```

The call site (the only one) makes condition 4 structural — an authored price short-circuits the branch, so no code path can replace it:

```ts
if (p.pricePerArea) {
  pricing.perArea = { amount: …, currency: …, perUnit: p.pricePerArea.unit, source: "authored" };
} else {
  const derived = derivePerArea({ projectType: p.projectType, total: pricing.total, area: p.area }, (why) =>
    warnings.push(`record "${p.id}": no derived per-area price — ${why} (D-1, 07 §9.3)`),
  );
  if (derived) pricing.perArea = derived;
}
```

**D-1b / TP3 is structural too:** `pricing.total` is only ever produced by `totalOf()`, which copies the authored `totalPrice` field; no function in the producer reads `perArea` and `area` together.

**Verified values** (test A2, asserted exactly): `52,000,000/34 → 1,529,412` · `85,000,000/34 → 2,500,000` · `30,000,000/20 → 1,500,000` · `50,000,000/34 → 1,470,588` · `7/0.28 → 25` · `3/2 → 2` · `5/2 → 3` · `1/0.01 → 100` · `1e9/0.01 →` refused by the **output** guard (one warning, no perArea, no error). Two further input-guard cases (`A` above `1e8`, `A` below `1`) are asserted as well.

The validator does not trust the emitter: for any `perArea` with `source: "derived"` it re-runs `derivePerArea` on the record's own total and area and rejects the document unless amount, currency and perUnit match (INV-19 + INV-20 on the document, tests V15).

---

## 4. `TODO(v0.2-data)` — for the next work package

Ten checks are skipped. Their rules are unchanged, their bodies still compile, and the runner prints the list at the end of every run.

| id | what it asserts | why it is skipped | to restore |
|---|---|---|---|
| `E1b` | demo document version `6346c472…`, 5292 B (02 §21.1) | the emitted shape changed while the demo data is still V0-authored | recompute both after re-authoring |
| `E2b` | 02 §21.2 two-record version, §21.3 empty-document bytes | both are V0 documents (`schemaVersion "0.1"`, record-level `area`/`pricePerArea`) | replace with a V0.2 golden pair built from 07 §19 |
| `B2b` | `demo.buildInputId === goldenRecord.buildInputId` | producer version, producer source hash and the contract pair are all build inputs | rebuild the golden package |
| `G1` | package holds exactly the two emitted files, byte-identical to the emission; build-record summary | compares the V0 package on disk with the V0.2 emission | rebuild the golden package |
| `G2` | manifest pointer = file name = document version; manifest origin | reads the V0 package by its old version file name (the pure half now runs as `G2b`) | rebuild |
| `G3` | every `detailUrl`/`listingUrl` has an HTML page; no absolute URL | same | rebuild |
| `G5` | golden = live + exactly the two integration files | the added-file list names the V0 document version | rebuild |
| `T1` | rebuild reproduces `buildInputId`, `packageHash`, integration bytes | the V0.2 producer has a new identity; INV-1 itself still covered by `E2` and `T2` | rebuild, then re-pin the constants |
| `T3` | empty site emits the 02 §21.3 bytes | those bytes carry `schemaVersion "0.1"` | new empty-document golden |
| `I2b` | **working tree == pinned release 1.5.2** | **not a data problem — see §5** | cut a new Template Release |

Constants to recompute after re-authoring: `DEMO_VERSION`, `DEMO_DOC_BYTES`, `EMPTY_VERSION`, `EMPTY_DOC`, `TWO_RECORD_VERSION`, `LIVE_*` unchanged, `qa.files` counts in `G1`/`G5`. `DEMO_MANIFEST_BYTES` (274) is unchanged and still asserted.

---

## 5. Contract items that could not be implemented as written

### 5.1 `platform/content/schema.ts` is a Template Release source (blocking for the data package)

`platform/release/release.ts` collects `platform/{content,settings,theme,assets,slots,site}` into every Template Release. Adding the five authored fields to `ProjectSchema` therefore:

* makes the **working tree** stop hashing to release `interior-01-1.5.2-d87807590d64` — test `I2b`, skipped as `TODO(v0.2-release)`. Stored releases are untouched and all of them still verify (`I1` green), and `buildSite` materialises the **stored** release, so building still works today;
* means **a V0.2 field cannot be authored in `data/sites/**` until a new Template Release is cut.** `buildSite` writes the site snapshot into a workspace that runs release 1.5.2's own frozen `SiteSnapshotSchema`, whose `ProjectSchema` is `.strict()`; an unknown key such as `projectType` would fail preflight. **The demo-data package must therefore be preceded by a Template Release (1.5.3 or later) and a re-pin of the site.**

This was not anticipated by the work package. Nothing was worked around silently; the alternative (defining the fields outside `platform/content`) is not available, because the content model may not import `platform/integration` — a release workspace does not contain that directory.

### 5.2 The canonical vocabularies live in `platform/content/schema.ts`

Consequence of 5.1: `platform/integration/contract.ts` imports and re-exports them (frozen) so there is exactly one definition. `contract.ts` remains the contract-side name for them, as the brief asked.

**Follow-up (not done — out of scope):** `PRODUCER_SOURCE_FILES` in `platform/integration/sources.ts` does not include `platform/content/schema.ts`, so editing the vocabulary changes validation verdicts without changing `producerSourceHash`. For a site pinned to a release, `releaseHash` does not move either. The MAJOR-1 guarantee ("a changed producer can never be reported up-to-date") therefore has a hole for vocabulary edits. Either add `content/schema.ts` to `PRODUCER_SOURCE_FILES` or bump `PRODUCER_VERSION` with every vocabulary change; the next package should close this.

### 5.3 INV-21 cannot be fully checked on the document

"An authored `perArea` is never replaced by a derived one" is not decidable from the emitted document alone (a correct authored value and a replaced one look identical). It is enforced structurally at the emitter — the authored branch short-circuits before any derivation — and asserted on a crafted snapshot (test `A6`: `full_remodel` + exact total + authored `perArea` → the authored 2,900,000 survives and the derivable 1,529,412 never appears). The validator enforces the observable half (a `derived` value must equal RD1's result for that record). Documented in a comment at the check.

### 5.4 The `style` VO6 limit is a producer placeholder

07 §8 leaves it to be declared by the consumer. `CONSUMER_DECLARED_LIMITS.valuesPerFacet.style = 150` is marked PROVISIONAL in the source so an unbounded style vocabulary still raises a build warning; no consumer behaviour may be inferred from it. `scope: 150` is retired.

---

## 6. Test counts

| | before | after |
|---|---|---|
| passing checks | 47 | **59** |
| failing | 0 | **0** |
| skipped | — | **10** (all listed in §4, printed by the runner) |

New checks: `C4` (the closed vocabularies and the SPACES/WORKS split), `A1`–`A11` (the annex and D-1/RD1 on crafted snapshots), `V14` (annex validation, fail-closed), `V15` (D-1 enforced on the document), `G2b` (the pure half of `G2`), `E1b`/`E2b`/`B2b`/`I2b` (skipped holders for the moved goldens).

Invariant coverage: INV-17 (`A8`, `V14`), INV-18 (`A8`, `V5`), INV-19 (`A4`, `V15`), INV-20 (`A1`, `A2`, `V15`), INV-21 (`A6`), INV-23 (`A11`, `V14`), INV-24 (`A9`, `V14`), INV-25 (`E4`), INV-27 (`C1`, `E1`, `V9`), INV-28 (`A10`, `V14`), INV-29 (`A10`, `V14`), RD1 (`A2`, `A3`).

Sibling suites re-run and green after the content-model change: `platform/test/step4.test.ts` (47 passed), `platform/test/step52.test.ts` (12 passed). Typecheck: `tsc -p platform/tsconfig.json` and the root `tsc --noEmit` both clean.

---

## 7. Orchestrator disposition — *written by the orchestrator, not by the implementing agent*

### 7.1 Independent verification

Re-run from a clean shell by the orchestrator, not taken on report:

| check | command | result |
|---|---|---|
| typecheck | `./node_modules/.bin/tsc -p platform/tsconfig.json --noEmit` | exit 0, no output |
| integration suite | `./node_modules/.bin/tsx --tsconfig platform/tsconfig.json platform/test/integration.test.ts` | **59 passed, 0 failed, 10 skipped**, exit 0 |

Every one of the 10 skips prints a `TODO(v0.2-data)` or `TODO(v0.2-release)` tag naming the exact
condition that restores it. None of them is an assertion that was deleted or weakened to get to
green (CLAUDE.md §12): each is a **golden-byte** comparison whose expected value the V0.2 shape
change invalidated, plus `I2b`, the release pin. The rules behind them are still asserted elsewhere
— `INV-1` by `E2`/`T2`, the opted-in end-to-end path by `T2` — which is why the skips are
acceptable rather than a coverage loss. They are the next package's acceptance criteria.

### 7.2 The two items the agent flagged — decided

**`INV-29` makes `workScopeIds` mandatory for every record that states a `projectType`.** Kept
literal. This is the intended reading of `PT4`(c), not an accident of wording: §4's purpose is that
a breadth claim no structural fact backs is not emitted, and a `full_remodel` with no declared
scopes is exactly that. It costs no data — every record in `04-demo-data-spec.md` that states a
breadth also authors scopes — and `workScopeIds` remains optional for breadth-absent records
(`bi-02`, `bi-08`). Written into the contract as **`WS7c`**, so the next reader does not have to
re-derive it from two invariants.

**`INV-24` cannot hold over the document-level facet vocabularies.** The agent is right, and its
per-record implementation stands. The two alternatives are both worse: failing the build rejects
honest-but-inconsistent authoring, and letting one record's classification rewrite another's is the
cross-record inference `ND1` forbids. `INV-24` is now explicitly **per record**, with new `ST6`
(authoring guidance), `ST7` (the consumer must tolerate a value declared in both vocabularies and
must not resolve it site-wide) and `CINV-12`. Recorded in contract §20.1.

Both amendments were sent to the in-flight rev-3 delta reviewer as new, unreviewed text.

### 7.3 `PRODUCER_SOURCE_FILES` — fixed here, not deferred

§5.2 left this as a follow-up. The orchestrator closed it immediately instead: `content/schema.ts`
now holds vocabularies and invariants that change validation verdicts, while a site pinned to a
**stored** release does not move its `releaseHash` when the working tree's content model changes.
That is a live hole in the MAJOR-1 guarantee ("a changed producer can never be reported
up-to-date"), it is a provenance boundary, and the fix is one list entry —
`platform/integration/sources.ts`, with the reason in a comment beside it. Deferring a one-line
provenance fix past a release cut is how it becomes permanent.

No test pins a literal producer source hash (they all recompute it), so nothing needed
re-baselining. Integration suite re-run after the change: **59 passed, 0 failed, 10 skipped**.

### 7.4 §5.1 is accepted as a sequencing finding, not a defect

The work package did not anticipate that `platform/content/` is a Template Release runtime source.
The agent did not work around it silently, which is the right call. The consequence is a hard
ordering constraint on everything downstream:

> **A new Template Release must be cut and `boost-interior-demo` re-pinned *before* any V0.2 field
> is authored in `data/sites/**`.** Release 1.5.2's frozen `.strict()` `ProjectSchema` would reject
> `projectType` and its siblings in the build workspace.

Read-only recon of the release/re-pin mechanism is running; its report lands at
`09-release-repin-recon.md`. The demo-data package is blocked on it and must not be started early.

### 7.5 `step6` — three failures the implementation did not report

The agent ran `step4` and `step52` and reported both green. It did **not** run `step6`, which the
change does affect. The orchestrator ran it:

```
step6: 27 passed, 3 failed
  - D   Template source unchanged: live templateSourceHash = baseline = the release record
  - D2  no Template / Platform implementation file (test/ excluded) was modified after the cut
  - U   reproducible: same release + snapshot + … → same buildInputId, and = current
```

All three are the **same** cause as `I2b`, and none is a behaviour regression:

- `D` / `D2` — `platform/content/schema.ts` is collected into a Template Release
  (`platform/release/release.ts` takes `platform/{content,settings,theme,assets,slots,site}`), so
  extending `ProjectSchema` necessarily makes the working tree differ from the cut.
- `U` — `buildInputId` moved because `PRODUCER_VERSION` went 1 → 2 and `producerSourceHash` changed.
  The hash is *stable across the two runs within the test* (`b9701c19… == b9701c19…`); what differs
  is the recorded `current`, which was built by the V0 producer. That is the MAJOR-1 guarantee
  working, not failing.

**The repo already has a mechanism that must NOT be used here.** `platform/test/integration-surface.ts`
declares an exclusion surface with recorded pre-task fingerprints, so that the previous integration
task could modify `site/load.ts` and friends without invalidating the Template-cut proofs. Adding
`content/schema.ts` to `isIntegrationSurface()` would make `D`/`D2` green in one line — and would be
a lie: unlike `platform/integration/**`, the content model genuinely **is** release content, and the
new fields genuinely **are not** in release 1.5.2. That is precisely why the demo data cannot be
authored yet. The honest fix is the release cut, and these three checks are its acceptance criteria.

Recorded as a gap in the implementation's verification, not as a defect in its code: the work package
named the suites to run and `step6` was not among them. Later packages that touch
`platform/{content,settings,theme,assets,slots,site}` or `templates/**` must run it.

---

## 8. Rev-5 producer follow-up

Normative reference: `docs/reports/integration/07-integration-contract-v0.2-candidate.md` (rev 5).
Three gaps between the rev-3 implementation above and rev 5, all producer-side, none behavioural
except task 1. `templates/**`, `platform/site/**`, `platform/build/**` and `data/**` were not touched.

### 8.1 Task 1 — `ST6`'s build warning (the only code change)

`platform/integration/emit.ts:366–380`. `ST4` subtracts **per record**, so `INV-24` (no value in
both a record's own `style` and `tag`) cannot hold over the **document-level** facet vocabularies:
if one record marks a word a style and another leaves the same word an ordinary keyword, the
document's `facets.style.values` and `facets.tag.values` both declare it. Rev 5 gives `ST6`
**`P: SHOULD warn at build`** for exactly this (07 §8) — an authoring-inconsistency signal, not a
`VA1` condition, and it must never fail the build or move a byte.

Placed immediately after the loop at `emit.ts:359–364` that builds the `facets` vocabulary maps
(`facets.style` / `facets.tag`), so it reads the already-built, already-sorted `{id,label}` arrays
and writes nothing back. It matches the existing RD1 warning's shape (`emit.ts:324`,
`` `record "${p.id}": no derived per-area price — ${why} (D-1, 07 §9.3)` ``): a plain string pushed
into the same `warnings: string[]` the RD1 guard-failure warning already uses, `subject: detail
(RULE, section)`.

**Exact warning text** (offending values sorted by `compareCodePoints`, deterministic):

```
facets: "미니멀", "화이트" appear in both facets.style.values and facets.tag.values (ST6, 07 §8)
```

(General shape: `` `facets: ${sortedQuotedValues} appear in both facets.style.values and facets.tag.values (ST6, 07 §8)` ``.)

It is read-only: `styleIds`/`inBothStyleAndTag` only read `facets.style.values` / `facets.tag.values`
after they are built; nothing under `document`, `records`, `facets`, `workScopes` or `file` is
touched by this code. See §8.4 for the specific byte-identity evidence.

### 8.2 Task 2 — two stale `WS7a` comments corrected (comment/doc text only, no logic changed)

Rev 5 scoped `WS7a`'s closure to `workScopeIds ∩ Spaces` — the **spaces** that were remodelled are
closed; the **works** in a partial's `workScopeIds` stay open (`WS7b`) even though the schema and
validator both still (correctly) require the whole `workScopeIds` array to be non-empty (`INV-28`).
Two places described the **whole** array as "the closed set," which rev 5 makes false:

- `platform/content/schema.ts:280–287` (the JSDoc above `workScopeIds` on `ProjectSchema`, cited
  around line 283) — was "the set is CLOSED — the complete set the `totalPrice` covers (WS7a)."
  Corrected to state that only `workScopeIds ∩ Spaces` is closed, restates the "absent space id ⇒
  not remodelled, never ⇒ no work reached it" rule, and that works stay open (`WS7b`).
- `platform/integration/validate.ts:299–301` (the comment above the `INV-28` non-empty check, cited
  around line 299) — was "WS7a's closed-set meaning ... depend[s] on" the non-empty check, without
  scoping which subset is closed. Corrected to name `workScopeIds ∩ Spaces` explicitly and that the
  works in it stay open.

**Same defect found again, same two files, not in the task's cited line list — fixed for
consistency rather than left to contradict the two lines above them:**
- `platform/content/schema.ts:362–369`, the `superRefine` `INV-28` check's comment and its
  `ctx.addIssue` message string (`"... it is the closed set the total covers (WS7a, INV-28)"`) made
  the identical whole-set claim four lines from the JSDoc just corrected. Both now name the spaces
  subset, not the whole array.

No `if` condition, no comparison operator, no error/warning trigger changed in either file — verified
by re-reading each diff before and after; only comment prose and the text of two `ctx.addIssue`/`errors.push`
message strings changed. Confirmed by the unchanged `V14`/`A10` pass/fail behaviour in §8.5.

### 8.3 Task 3 — `INV-29`'s citation: `PT4`(b) → `PT4`(c)

`INV-29` is `projectType == "full_remodel"` ⇒ `workScopeIds` contains at least one Spaces-table id;
rev 5 (§7.4, the `INV-29` row of §12, and `N-13`/`M-8` of §20.1) cites this as **`PT4`(c)**, not
`PT4`(b) (`PT4`(b) is the unrelated, non-machine-checked "no space was left out" authoring rule).
Fixed, citation text only, check logic untouched:

- `platform/content/schema.ts:153` (top-of-file comment on `WORK_SCOPE_SPACE_IDS`/`WORK_SCOPE_WORK_IDS`) — `07 PT4(b)` → `07 PT4(c)`.
- `platform/integration/contract.ts:62` (cited as "around :63"; the comment is one line above the
  `export` it documents, hence the one-line drift) — `(PT4b)` → `(PT4c)`.
- `platform/integration/validate.ts:307` — `errors.push` message `"... trades alone are PT4(b) (INV-29)"` → `"... PT4(c) (INV-29)"`, and its comment at `validate.ts:304`.

**Same misattribution found at two more spots, same three named files, not in the task's cited line
list — fixed for the same consistency reason as §8.2:**
- `platform/content/schema.ts:367–375`, the `superRefine` `INV-29` check's comment and its
  `ctx.addIssue` message (`"... a set of trades alone is PT4(b), not a full remodel (INV-29)"`) —
  three lines from the JSDoc-adjacent comment at line 153, same wrong citation.

**Left untouched, out of the three named files, reported not fixed:**
`platform/test/integration.test.ts:630`, test `A10`'s own title, still reads "...that is PT4(b), and
it must never feed D-1." This is a test description string in a file outside Task 3's three named
files; correcting it was judged scope creep rather than part of "fix the citation" and left for a
follow-up. It does not affect the assertions A10 makes or their correctness.

Verified with `grep -rn "PT4(b)\|PT4b"` over `platform/` (excluding `site/`, `build/`) both before
and after: exactly four hits before (the three named + the schema.ts superRefine duplicate) went to
zero in the three permitted files; the one remaining hit after is the test-title line above.

The check itself — "a `full_remodel` needs at least one Spaces-table id in `workScopeIds`" — was not
touched in either `schema.ts`'s `superRefine` or `validate.ts`'s per-record loop; only the rule
citation inside the comment/message strings changed.

### 8.4 Test added

`platform/test/integration.test.ts`, new `A12` (placed after `A11`, end of the `[annex]` block,
before `[validator] fail closed`):

> `A12 ST6 (07 §8, P: SHOULD warn at build): a value one record classifies as a style while another
> leaves it a plain keyword makes the DOCUMENT-level facets.style.values and facets.tag.values
> overlap — INV-24 is per record only (ST4), so this is authoring inconsistency, not a contract
> violation; it must never fail the build and must never change an emitted byte`

It crafts a snapshot where `bi-01` gets `styles = ["화이트", "미니멀"]` (both already its own
`keywords`, so `ST4` subtracts them from `bi-01`'s own `tag` — its per-record disjointness holds),
while `bi-06` (untouched) still carries both words as plain keywords, producing the document-level
overlap. It asserts: `bi-01`'s own facets stay disjoint (`INV-24` per record); the document's
`facets.style.values`/`facets.tag.values` both declare `화이트` and `미니멀`; the emitted
`warnings` array is exactly
`["facets: \"미니멀\", \"화이트\" appear in both facets.style.values and facets.tag.values (ST6, 07 §8)"]`
(values sorted, so determinism is exercised, not assumed); the validator (`validateFor`) reports
`errors: []` and merges the same warning unchanged — never a `VA1` failure; the warning text `"ST6"`
never appears in `emission.portfolio.file.text`; and re-emitting the identical snapshot produces a
byte-identical `file.text` and the identical `version`. A second, negative craft (`styles =
["빈티지"]`, a word no other record's keywords carry) asserts `warnings: []`, and the untouched demo
snapshot is asserted to carry no `ST6` warning either (consistent with `V1`'s "0 warnings").

### 8.5 Test counts

| | before (baseline handed to this task) | after |
|---|---|---|
| passing | 59 | **60** |
| failing | 0 | **0** |
| skipped | 10 | **10** (identical list — `E1b`, `E2b`, `B2b`, `G1`, `G2`, `G3`, `G5`, `T1`, `T3`, `I2b`) |

`./node_modules/.bin/tsc -p platform/tsconfig.json --noEmit` — clean, no output, exit 0.
`./node_modules/.bin/tsx --tsconfig platform/tsconfig.json platform/test/integration.test.ts` —
`60 passed, 0 failed, 10 skipped`, exit implied by the summary line (no throw). `step6.test.ts`,
`slice1.test.ts`, `ia15*` were not run, per instruction (known pre-existing, unrelated failures).

### 8.6 Byte-identity evidence

Two independent lines of evidence that the emitted **document bytes** are unchanged by this work:

1. **`E1`** (`platform/test/integration.test.ts`) still asserts the demo emission's exact manifest
   byte count (`274 B`) and facet counts (`category 4 · tag 8`, no `scope`) unchanged from before
   this task, and **`V1`** still asserts the untouched demo emission validates with `0 errors, 0
   warnings` — i.e. the `ST6` warning does not fire on the existing demo data (confirmed directly:
   `data/sites/boost-interior-demo/content/projects.json` currently authors `styles: []` on every
   record, so `facets.style` is never populated and the intersection is structurally empty there).
2. **New `A12`**, the test that actually exercises the `ST6` warning path, asserts directly:
   `assert(!emission.portfolio!.file.text.includes("ST6"), ...)` (the warning text never reaches the
   serialized bytes) and `eq(again.portfolio!.file.text, emission.portfolio!.file.text, ...)` /
   `eq(again.portfolio!.version, emission.portfolio!.version, ...)` — re-emitting the identical,
   warning-triggering snapshot twice is still byte- and version-identical. This is the check that
   gives the strongest assurance here, because it is the only one that runs the code path the ST6
   warning added.

Both together: the general emission path (`E1`) is unaffected on real data, and the new warning path
itself (`A12`) is proven not to leak into `document`/`file`/`version` even when it fires.

### 8.7 Findings that contradict or drift from the contract text (not fixed, reported per task instructions)

- `platform/test/integration.test.ts:630` still cites `INV-29` as `PT4(b)` in test `A10`'s title —
  see §8.3. Same underlying rev-5 drift as Task 3, left because the task named three files, not this
  one.
- The rev-5 contract text itself documents `ST6`'s citation history at line 1382 of
  `07-integration-contract-v0.2-candidate.md`: *"`ST6`'s `ND1` mis-citation ... All applied. ...
  `ST6` cites `VO2`/`VO3` and gains **P: SHOULD warn at build**"* — i.e. rev 5 already knows it
  changed `ST6`'s citation and behaviour once; this task is the producer catching up to that, not a
  new contract defect.
- No other drift found between the rev-3 implementation (§§1–7 above) and rev 5 within the scope
  read for this task (`ST6`, `WS7a`, `PT4`/`INV-29`); the rest of §7's "Contract items that could not
  be implemented as written" (§5) and the `TODO(v0.2-data)` list (§4) are unaffected by rev 5 and
  were left alone.
