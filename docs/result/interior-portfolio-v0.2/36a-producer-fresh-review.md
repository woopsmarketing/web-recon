# 36a — Portfolio V0.2 producer: independent review and delta review

| | |
|---|---|
| date | 2026-09-26 |
| reviewed | the producer commit set of [`36-`](36-producer-v0.2-implementation.md) against contract rev 9.2.1 |
| review model | **Fable**, fresh context, read-only (the brief's preferred model; it ran to completion this time) |
| brief to the reviewer | the brief's twelve questions verbatim, no expected verdict, the proposed commit set and the paths not in it |
| delta review | one, Fable, fresh context — §3 |

## 1. Findings — first review

**0 BLOCKER · 1 MAJOR · 3 MINOR · 5 NOTE.**

| id | sev | finding | disposition |
|---|---|---|---|
| F1 | MAJOR | The demo pin `interior-01@1.6.0` is a stored, committed release that snapshotted the **widget-seam files** (`platform/site/{context,instance,head-scripts}.ts`, `templates/interior-01/v1/app/{layout.tsx,head-scripts.ts}`), whose canonical sources are uncommitted. A clean checkout of only the producer commits compiles and builds, but fails `integration.test.ts` `I2b` and `slice1`'s release-hash check. Suggested: commit the seam files too, or re-cut a seam-free `1.6.1` | **Open — owner decision D1** (`23-` §5, still open per `25-`); not a producer defect. Facts, corrected by the delta review (§3): the seam *content* is already in git, as release artefacts under `data/template-releases/interior-01/interior-01-1.6.0-e65795202191/files/` committed in `5b16a5d`; only the canonical seam sources are uncommitted. Options: (a) land the seam lane — not this task (§26 *"어떤 경우에도 widget seam … 섞지 마세요"*); (b) re-cut a seam-free `1.6.1` from a **throwaway worktree** (HEAD + producer) and re-pin — feasible without touching the canonical tree, but it only flips which environment is red: the committed state becomes consistent while the seam-bearing working tree fails `I2b` until the seam lane re-cuts; (c) accept `1.6.0` and widen its changelog. Measured on `git archive d284b93`: `integration` fails only `I2b`, `slice1` 3 checks, all this cause (`36-` §6.2). Ledger `WIDGET-SEAM-RELEASE-SOURCES` |
| F2 | MINOR | `template.ts`'s 1.6.0 changelog says *"no renderer … change … byte-identical to 1.5.2"*; the stored 1.6.0 `layout.tsx` renders head scripts | recorded here; `template.ts` is inside the release hash, so it is corrected at the next cut (with D1) |
| F3 | MINOR | Validator checked INV-20 one way only: a document missing a **due** derived `perArea` passed VA1 | **fixed** — `validate.ts`, reverse check (guard failure still returns nothing, so warn-and-omit stays legal — `A3` still validates to 0 errors); `V15` case added |
| F4 | MINOR | Contract §15 INV-22 (metamorphic provenance) had no test | **fixed** — `A13`: over every demo record, moving only `area.value` / the authored `pricePerArea` / the authored total moves only the paths INV-22 allows (35 mutations), plus §15's named 1,000,000 × 34 = 34,000,000 coincidence |
| F5 | NOTE | stale comments (INV-17…INV-28, "pinned 1.5.2", `skip()` docstring) | fixed |
| F6 | NOTE | the public detail page renders none of the V0.2 fields; a consumer quoting `bi-09`'s 50,000,000 links to a page that does not show it | no contract rule requires it (V0 needs a page, not the fact); product item, template release cut needed — ledger `DEMO-DETAIL-V02-FACTS` |
| F7 | NOTE | `--write`'s same-version guard only sees files in the golden dir (`rm -rf` bypasses it); `contractRevision` is a literal | accepted — git history is the backstop; the literal changes only with a contract revision |
| F8 | NOTE | `schema.ts` `defaultAreaBasis` guesses `supply` | pre-existing (Step 5.2), used only by `step52.test.ts`, not on the load/emit path |
| F9 | NOTE | BoostChat's fixture README cites a working-tree fingerprint | handoff action 1 (`36b-`) |

## 2. Per-question answers (reviewer's, condensed)

| Q | answer |
|---|---|
| 1 rev 9.2.1 match | **Yes.** §3, PT1/PT3/PT4(c), SD1, WS1–WS5/WS7c, ST4/ST6, TP1/TP3, PA1–PA5, ND1/ND2/D-1/RD1, §10, §11, VA1, INV-17…30, RO1 each located in code and tests. Omissions were F3, F4 (now fixed) |
| 2 stale rev-2/9.1 | no contradicting logic; `"0.2"` appears only as a rejected value; only comments (F5) |
| 3 fabrication | **none** — `emit.ts` copies authored fields; the only computed value is `derivePerArea` |
| 4 full/partial pricing | correct — D-1 gates, authored wins, partial/absent/range/no-area never derive |
| 5 area basis | never converted; basis copied only if supply/exclusive; `perUnit = area.unit` |
| 6 projectType inference | never — `bi-02/03/05` (category full-remodel) and `bi-19` emit none |
| 7 matcher/ranking policy | none (grep for rank/score/budget/similar/weight over the producer: 0 hits) |
| 8 detailUrls | yes — route plan = served projects = `generateStaticParams`, `dynamicParams=false`; `T1` real build |
| 9 golden deterministic/immutable | yes (caveat F7) |
| 10 V0.1 path | not broken — V0.1 `current.json` package and the live rollback verified; manifest stays `"0.1"`; RO1 holds |
| 11 commit set | no seam code in it; F1 is the one gap |
| 12 BoostChat fixture | **byte-identical** on both files; semantically identical |

The reviewer also re-verified the corpus against §13/§19 and every derived value by hand
(50,000,000/34 → 1,470,588; 85,000,000/34 → 2,500,000; 30,000,000/20 → 1,500,000; 52,000,000/26 → 2,000,000)
and the RD1 floor-exactness argument.

## 3. Delta review

One delta review — **Fable**, fresh context, read-only — over the fixes for F3/F4/F5, the `A13` check and
the `integration-surface.ts` allowlist change. Four questions, no expected verdict: Q1 are the reverse
INV-20 check and `A13` correct and non-vacuous; Q2 is the allowlist change legitimate; Q3 is F1's
disposition acceptable; Q4 any new defect.

**0 BLOCKER · 1 MAJOR · 1 MINOR · 4 NOTE — no functional defect.**

| id | sev | finding | disposition |
|---|---|---|---|
| D-A | MAJOR | *decision-record accuracy.* The widget-seam sources are already in git history: `5b16a5d` added `data/template-releases/interior-01/interior-01-1.6.0-e65795202191/files/platform/site/{context,head-scripts,instance}.ts` and `…/templates/interior-01/v1/app/{layout.tsx,head-scripts.ts}`, sha256 equal to the working-tree seam files. The ledger said *"they stay uncommitted"*; an owner deciding D1 could believe no seam content ships in a tracked file | **fixed** — ledger `WIDGET-SEAM-RELEASE-SOURCES`, F1 above and `36-` §6.2 name `5b16a5d` |
| D-B | MINOR | option (b) was dismissed as constraint-violating, but a re-cut from a throwaway `git worktree` touches no canonical file; its cost is that `I2b` goes red in the seam-bearing tree until the seam lane re-cuts — a trade-off, not a prohibition | **fixed** — presented as option (b) in the ledger and F1 |
| D-C | NOTE | `validate.ts` header lists INV-28/29 but not INV-30, which the code enforces | **fixed** |
| D-D | NOTE | the header's *"the ONE warn-and-omit case … merged in here"* holds only on the emit path: the reverse INV-20 check passes a no-op guard callback, so a foreign document with a guard-failing record validates with no warning (consistent with VA1 — warn-and-omit is the emitter's) | **fixed** — header reworded |
| D-E | NOTE | F2 correctly deferred: `template.ts`'s changelog is inside the release hash; editing it now breaks `I2b` | no change |
| D-F | NOTE | `A13` pins its mutation counts (`18 + 6 + 11`); corpus edits must update the literal | accepted — same convention as the other pinned counts |

Answers, condensed. **Q1** correct: `!perArea` lets any authored perArea satisfy the check (PA1);
`derivePerArea` returns nothing for non-`full_remodel`, range, no area and RD1 guard failure, so
warn-and-omit stays legal; emitter and validator feed it identical inputs, so no emitter output can trip
it. `A13` is not vacuous — every `must` path has to move and nothing outside `must ∪ may` may; the run
count is asserted; the §15 coincidence uses `bi-01`'s real area. **Q2** legitimate: `platform/cli` is not
in `PLATFORM_RUNTIME_DIRS`, so the exclusion hides nothing about any release; the CLI writes only the
golden dir; `G6` checks it; it removes a new failure cause from `step6`/`ia15x` without making any
suite green. **Q3** acceptable as an open owner decision once D-A and D-B are recorded (done).
**Q4** no functional defect; golden check exit 0, no drift; `integration.test.ts` 75 / 0 / 0.

Only doc and comment edits followed; per the brief there was no second delta review.

## 4. Mutation evidence

A mutant emitter that fabricates `pricing.total = pricePerArea × area` wherever no total is authored (the
exact TP3/PR5 violation) was run against the test file in a scratch copy: **9 checks fail** — `E1b`, `E4`,
`K1`, `A13`, `V1`, `V15`, `G6`, `G7`, `T1`. The canonical tree was not modified for this.
