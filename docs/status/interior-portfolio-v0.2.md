# Interior Portfolio Contract V0.2 — status

> **2026-09-29 — demo corpus is 8 records; the 11 V0.2 fixtures are TEST_ONLY.** bi-09 … bi-19 were
> classified VERIFIED_SYNTHETIC (authored as test fixtures, borrowed covers, no source,
> [`../work/portfolio-experience-v1/04-record-truth-audit.md`](../work/portfolio-experience-v1/04-record-truth-audit.md))
> and removed from `data/sites/boost-interior-demo/content/projects.json`. They now live verbatim in
> `platform/test/fixtures/boost-interior-synthetic/`, and every edge-case test still runs on them
> through `platform/test/portfolio-qa-corpus.ts`. Live = package `9d4036ba…` (build `71a906c1…`, 8 records, document
> `968afbcc…`, schema 1.1, producer 4, pin `interior-01@1.6.1`); rollback `77cc7f9f…` is the 19-record
> package — do not `--rollback` this host (R1). The sections below that say "19 records" describe the
> corpus before this date. Report:
> [`../result/INTERIOR-DEMO-DATA-TRUTH-FINALIZATION-V1-2026-09-29.md`](../result/INTERIOR-DEMO-DATA-TRUTH-FINALIZATION-V1-2026-09-29.md).

> **2026-09-27 (later) — V0.2 PUBLISHED on `boost-interior-demo` only; rollback drilled; BoostChat next.**
> `https://interior-demo.boostweb.co.kr` serves package `3846a29d…` (build `a4777cf9…`,
> `interior-01@1.6.1`). The live manifest (`"0.1"`) and document (`"1.0"`, 19 records,
> resourceVersion `d56509c8…`) are byte-equal to the canonical golden, and 19/19 hosted detail pages
> match their records. The routing pointer's `previous` is the V0.1 package `286d44ab…`. A real
> bounded drill went V0.2 → V0.1 (byte-identical to the captured baseline) → V0.2 via `site:publish
> --rollback` and a forward publish. The post-publish suites are restated (commit `a2e54dd`): 15/15 green
> in `POST_PUBLISH_STEADY`. No other site, no BoostChat, no Jev/Fuse touched. Ledger:
> `POST-PUBLISH-SUITE-RESTATE` **done**; `PORTFOLIO-PUBLISH-GATE` → **`WEB_RECON_PUBLISH_COMPLETE` ·
> `WAITING_FOR_BOOSTCHAT_HOSTED_VALIDATION`**; `WP03-DUAL-READ` open. Evidence:
> [`../result/interior-portfolio-v0.2/39-controlled-v0.2-publish.md`](../result/interior-portfolio-v0.2/39-controlled-v0.2-publish.md).
> **Next: BoostChat session C — snapshot refresh, consumer rollout, hosted conversation E2E,
> consumer-side rollback/blast validation (contract §16 steps 5–6).**
>
> **2026-09-27 — V0.2 pre-publish bundle done; `interior-01@1.6.1` cut and pinned; NOT published.**
> The detail page labels an area by its own basis (공급면적 / 전용면적 / neutral 면적; `bi-14` now
> reads 전용면적 84 m²). It also renders the V0.2 facts only when authored: 리모델링 구분, 주요 공사
> 범위, 총 공사비. step6 is restated for the 19-record corpus (32/0), and the 1.6.0 changelog is
> corrected in canonical source. Release `interior-01-1.6.1-8da56de8d28f`; the demo source pin
> moved, and `current.json` did not. Golden unchanged (`d56509c8…`, drift `[]`). The pre-publish
> transition holds: `site:publish` still plans the V0.1 package. 15 suites green, typecheck pass;
> fresh review (Fable) 0 BLOCKER / 0 MAJOR / 3 MINOR.
> Ledger: `DEMO-AREA-BASIS-LABEL`, `STEP6-V02-CORPUS-RULES`, `TEMPLATE-160-CHANGELOG` and
> `DEMO-DETAIL-V02-FACTS` are **done**. New: `POST-PUBLISH-SUITE-RESTATE`, `TEMPLATE-161-UPGRADE-NOTE`,
> `DEMO-DETAIL-ROW-OVERLAP`. Commits `11c3c92`, `23060ad`, `21ddf4f`, `22faa91`.
> **`READY_FOR_CONTROLLED_V02_PUBLISH = YES`, `PUBLISH_ALLOWED = NO`** (`PORTFOLIO-PUBLISH-GATE`
> in force). Evidence:
> [`../result/interior-portfolio-v0.2/38-pre-publish-web-recon-bundle.md`](../result/interior-portfolio-v0.2/38-pre-publish-web-recon-bundle.md).
> **Next: BoostChat V0.2 search adapter + acceptance; then a controlled V0.2 publish session.**
>
> **2026-09-26 (later) — WEB-D1 + WEB-D2 closed; web-recon work stops here.** The widget-seam
> sources are committed (`b0e7a4f`): the committed tree reproduces the pinned `interior-01@1.6.0`
> byte for byte (65/65), and I2b passes on a clean checkout. The historical suites understand the
> pre-publish window (`5ac6695`, `platform/test/demo-rollout.ts`): predemo, predemo2, ia150, ia151
> and ia152 are green. step6 is 27/3; its remaining H/L/N fail on the V0.2 corpus content, not on
> the split. One of them is a real pre-publish defect, `DEMO-AREA-BASIS-LABEL` (ledger). Golden,
> `current.json` and V0.1 package unchanged; nothing published. Evidence:
> [`../result/interior-portfolio-v0.2/37-web-d1-d2-cleanup.md`](../result/interior-portfolio-v0.2/37-web-d1-d2-cleanup.md).
> **Next: BoostChat V0.2 implementation.**
>
> **2026-09-26 — producer V0.2 landed; golden package pinned; NOT published.**
> web-recon's emitter/validator implement contract rev 9.2.1 (document `"1.0"`, manifest `"0.1"`),
> the 19-record DEMO corpus is canonical, and the golden integration package is pinned at
> `platform/test/golden/portfolio-v0.2/` (resourceVersion `d56509c8100a56fdf9644baff78ff9e1`) —
> byte-identical to BoostChat's provisional fixture. Producer commit **`d284b93`**. `integration.test.ts`: 75 passed, 0 failed,
> **0 skipped**. `data/site-builds/boost-interior-demo` still points at the **V0.1** package; no V0.2
> package is built there or published. **`PUBLISH_ALLOWED = NO`** until the consumer's search reads
> the V0.2 fields (ledger `PORTFOLIO-PUBLISH-GATE`). Evidence:
> [`../result/interior-portfolio-v0.2/36-producer-v0.2-implementation.md`](../result/interior-portfolio-v0.2/36-producer-v0.2-implementation.md);
> consumer handoff: [`36b-boostchat-handoff.md`](../result/interior-portfolio-v0.2/36b-boostchat-handoff.md).
> **Next: BoostChat** — replace the provisional golden, implement matcher V0.2 / the search adapter,
> run acceptance; only then prepare a controlled publish.
>
> *2026-09-25 — contract rev 9.2.1, `READY` — 0 BLOCKER · 0 MAJOR · 6 MINOR* (`35a-closeout-delta-review.md`).
> Owner decisions `OQ-1`…`OQ-6` are closed (contract §18). `OQ-6`: an exact room match keeps
> `exact` despite extra trades, and a total set beside a budget must disclose them. The six
> residual minors are wording or housekeeping, listed in
> [`../result/interior-portfolio-v0.2/35-contract-final-closeout.md`](../result/interior-portfolio-v0.2/35-contract-final-closeout.md).
> Checker: `proof/contract-simplified.mjs`, 9/9 PASS. **Next: GC1 landing.** Below this banner,
> "Contract state", "Executable checks" and "Open" describe rev 8/9.1 and are **superseded** by
> `34-`/`35-` where they differ; the repo-wide state is current.
>
> *Earlier banners the same day: rev 9.2 `BLOCKERS_RESOLVED`, 1 MAJOR (`34-`); rev 9.1
> `FROZEN_NOT_READY`, 4 BLOCKER (`32-round-9-handoff.md`).*

Last updated: 2026-09-27 (controlled V0.2 publish, `39-`). Detail lives in [`../result/interior-portfolio-v0.2/`](../result/interior-portfolio-v0.2/);
the contract itself is [`../reports/integration/07-integration-contract-v0.2-candidate.md`](../reports/integration/07-integration-contract-v0.2-candidate.md).
This file records **state**, not reasoning.

## Repo-wide state changes (read these before touching the build)

### Template Release `interior-01@1.6.1` is cut, and the demo is pinned to it (2026-09-27, `38-`)

| | |
|---|---|
| release id | `interior-01-1.6.1-8da56de8d28f` |
| releaseHash | `8da56de8d28f372f645c5490436cd9da1b2ce70951e212a6b031ad991771855d` |
| files | 66 (1.6.0: 65) — added `lib/vocabulary.ts`; changed `lib/format.ts`, `sections/PortfolioDetail.tsx`, `template.ts` |
| why | basis-aware area label (`DEMO-AREA-BASIS-LABEL`), V0.2 detail facts (`DEMO-DETAIL-V02-FACTS`), truthful 1.6.0 changelog (`TEMPLATE-160-CHANGELOG`) |
| demo | `site.json` `.template` → 1.6.1; `slots.json` `portfolio.detail`: `areaLabel` 면적 + five new labels. **Published 2026-09-27 (`39-`)**: `current.json` → the 1.6.1 V0.2 package `a4777cf9…` (packageHash `3846a29d…`), `previous.json` → the V0.1 package `0f80b239…`; the pilot package dir `18c0a5ef…` retired by keep-2 (still sealed in R2) |
| evidence | `../result/interior-portfolio-v0.2/38-pre-publish-web-recon-bundle.md` |

Clean cut. The preflight hash (throwaway root) equals the real cut's, and the only release-source
differences from 1.6.0 are the four files above. The 13 older stored releases, `1.5.2` and `1.6.0`
included, are byte-identical before and after.

### Template Release `interior-01@1.6.0` is cut (superseded as the demo pin by 1.6.1)

| | |
|---|---|
| release id | `interior-01-1.6.0-e65795202191` |
| releaseHash | `e657952021911f2c2fabc22e41c32f50d3fa79e0116fbd8b0560058c908ef034` |
| files | 65 (was 63 at `1.5.2`) |
| why | `1.5.2`'s frozen **strict** `ProjectSchema` rejects the V0.2 authored fields, so no V0.2 field could be authored into `data/sites/**` until a new release existed |
| evidence | `../result/interior-portfolio-v0.2/23-release-1.6.0-cut.md`, `25-release-rebaseline.md` |

`1.5.2` is **untouched** — `release.json` sha256 `83c521c570daeb…` and its recursive dir digest are
byte-identical before and after. All 13 stored releases still verify.

### ⚠ `1.6.0` snapshotted in-progress work, deliberately accepted

The working tree had seven dirty release-source paths at cut time and `release.ts` has no git
awareness, so `1.6.0` contains, beyond the intended `schema.ts` + `template.ts` bump:

- **added** `platform/site/head-scripts.ts`, `templates/interior-01/v1/app/head-scripts.ts` (both untracked in git)
- **changed** `platform/site/context.ts`, `platform/site/instance.ts`, `templates/interior-01/v1/app/layout.tsx`

Accepted rather than re-cut: the alternative is reverting or stashing uncommitted work that is not
this session's, which is forbidden. `1.6.0`'s changelog therefore **understates** the release. Re-cut
when the widget-seam work settles.

**Resolved 2026-09-26 (WEB-D1, owner option A, `37-`):** the seam sources were committed as they
are (`b0e7a4f`), not re-cut. All 65 release sources equal the stored `1.6.0` files byte for byte.
The changelog wording stays a next-cut item (`TEMPLATE-160-CHANGELOG`). **Closed at 1.6.1 (`38-`):** the canonical `template.ts`
now describes the seam and the renderer change. The stored 1.6.0 copy is untouched.

### ⚠ `I2b` is now a live gate on every release source

`I2b` was an unconditional `skip()`; it is now a live check that re-collects all release sources (65 at 1.6.0, 66 at 1.6.1)
from the working tree, re-hashes them, recomputes the release hash and compares it against the
stored one. **Any edit to a release source now fails `I2b` until a new release is cut and re-pinned.**
Finishing the widget-seam work will trigger exactly this. That is the check working as designed.

`LIVE_BUILD_INPUT_ID` was deliberately **not** re-baselined — it also names the on-disk live
Cloudflare-pilot package directory and the `previous.json` rollback pointer `G4` asserts. A derived
`DEMO_OFF_BUILD_INPUT_ID` was added instead, so the next re-pin self-updates.

### Demo corpus: 19 records, V0.2-authored, applied — *superseded 2026-09-29: production is 8 records, bi-09 … bi-19 are TEST_ONLY fixtures (banner above)*

`data/sites/boost-interior-demo/content/projects.json` holds **19** records (was 8). Applied
2026-09-24 from `04-demo-data-spec.md` §2 (bi-09…bi-19) and `18-existing-eight-workscopes.md`
(bi-01…bi-08), evidence in `26-demo-data-applied.md` and `28-styles-and-rebaseline.md`.

19/19 parse `ProjectSchema`; `projectType` 7 full / 7 partial / 5 absent; all 19 carry
`workScopeIds`; 18 carry `styles`; emit+validate is **0 errors / 0 warnings**. `X8-1` — which
round 8's hand executor called *the single worst obstacle* — is closed.

`bi-06` carries **no** `propertyType`: `04` §0.2 assigned `apartment` to all eight on the ground
that *"every body says 아파트"*, which is false for `bi-04` and `bi-06`. `bi-04` is independently
backed by §19; `bi-06` was not, so the field was removed rather than guessed (`PT6`, `OD-F`).

### Producer invariants

`INV-28`, `INV-29`, `INV-30` are all enforced in **both** `platform/content/schema.ts` (authoring)
and `platform/integration/validate.ts` (emitted document), with coverage in `A10` and `V14`.
`INV-30` fires on no record in the current corpus by design: `bi-05` and `bi-19` are trades-only and
therefore breadth-absent.

### Producer V0.2 — landed 2026-09-26 (`36-`)

| | |
|---|---|
| emitter / validator | `platform/integration/{contract,emit,validate,sources}.ts` — rev 9.2.1 §3–§13, INV-17…INV-30, fail closed (VA1) |
| golden | `platform/test/golden/portfolio-v0.2/` — `manifest.json` 274 B · `portfolio.d56509c8100a56fdf9644baff78ff9e1.json` 11,608 B · `golden.json`; check/regenerate with `platform/cli/integration-golden.ts` |
| corpus | 19 records — breadth 7 full / 7 partial / 5 absent; total 10 exact / 1 range / 8 absent; perArea 6 authored / 4 derived |
| V0.1 | frozen V0.1 package `0f80b239…` / `286d44ab…` byte-intact: the demo's current package until `39-`, its rollback (`previous.json` and the live pointer's `previous`) since (tests `B2b`, `G1`–`G4`, `R2`) |
| publish | **done 2026-09-27 for `boost-interior-demo` only** (`39-`): live = package `3846a29d…`, golden bytes; gate now waits on BoostChat's hosted validation — `PORTFOLIO-PUBLISH-GATE` below |

### Deferred ledger (the one canonical list — not executed in the producer work)

Scope is cross-repo on purpose: this is the portfolio track's single ledger. *Source* "brief" = the
owner's producer brief of 2026-09-26 (§24).

| id | status | why deferred | revisit when | source |
|---|---|---|---|---|
| `S1-RACE-1` | open | if the race-cleanup `DELETE` itself fails in the DB, an id-less pending row lingers until TTL and can block a conversation for ~10 min | before any WRITE-capability expansion | brief |
| `S1-RACE-2` | open | concurrency guarantee assumes Pool/autocommit callers; a caller passing a transaction client weakens it — DB-level lock/constraint not yet decided | before any WRITE-capability expansion | brief |
| `S1-TEST-1` | open | `test:ops-action-pilot` expects 14 audit actions, gets 15 — red baseline, maintenance only | before the next large regression | brief |
| `GC1-M1-M2` | open | the generic ask-first prompt's "평수, 시공 범위, 희망 일정" and SettingsEditor's same interior wording — change both to generic copy together, with a prompt eval | next BoostChat prompt/copy pass | brief; boost-chat GC1 (`docs/work/interior-portfolio-v0.2/05-gc1-refactor.md`) |
| `GC1-R2` | open | LeadBoard `data-lead-interior*` attributes — cosmetic rename | with `GC1-M1-M2` | brief |
| `GC1-MINOR-1` | open | `DomainPromptSection.title` could take a narrower domain title type | GC1 follow-up | brief |
| `GC1-MINOR-2` | open | prompt-budget should recognise `DOMAIN_SECTION` (shared `ALL_SECTION_TITLES`) | GC1 follow-up | brief |
| `GC1-MINOR-3` | open | whether to widen GC1's import-boundary coverage | GC1 follow-up | brief |
| `GC1-MINOR-4` | open | strengthen the registered-heading-forgery pure test | GC1 follow-up | brief |
| `GC1-MINOR-5` | open | pure test for `renderInteriorConsultSection` | GC1 follow-up | brief |
| `GC1-MINOR-6` | open | tidy `search-types.ts` header/content | GC1 follow-up | brief |
| `WP03-GOLDEN` | **ready for the consumer** | BoostChat's golden was made from the then-uncommitted producer; the canonical golden is now committed and **byte-identical** to it | next BoostChat session: re-point the fixture's provenance at the producer commit `d284b93` (bytes need not change) | `36b-boostchat-handoff.md` |
| `WP03-DUAL-READ` | open | the consumer's `"0.1"`/`"1.0"` dual read is temporary. *2026-09-27 (`39-`): the demo's `current` is `"1.0"`; its `previous` is still the `"0.1"` package* | remove only after rollout step 6 **and** every site's `current` + `previous` pointer is `>= 1.0` (two V0.2 publishes per site) | contract §16 `RO2` |
| `PORTFOLIO-F2` | open | keep the conservative disclosure when a partial's total is set beside a price question: the requested trade may have run wider than the room, or no budget was stated — never read as a direct quote. No contract ranking reopen | consumer reply implementation (matcher V0.2) | `35-` §3 `F-2`, `35a-` |
| `PORTFOLIO-PUBLISH-GATE` | **`WEB_RECON_PUBLISH_COMPLETE` · `WAITING_FOR_BOOSTCHAT_HOSTED_VALIDATION`** (2026-09-27, `39-`) | was: the consumer's search did not yet use the V0.2 semantics. BoostChat's adapter, matcher V0.2 and acceptance landed (its own ledger), and web-recon published V0.2 for the demo (contract §16 step 4): live document `d56509c8…` = the golden bytes, rollback drilled. Not closed globally: BoostChat still has to refresh its snapshot, roll the consumer out, run the hosted conversation E2E and validate rollback / blast radius from its side (§16 steps 5–6) | close when BoostChat's hosted validation passes | brief; `36-`; `39-` |
| `DEMO-PIN-PACKAGE-SPLIT` | **closed 2026-09-26 (WEB-D2)** | the demo is pinned to `interior-01@1.6.0` with the 19-record V0.2 corpus, while `current.json` deliberately stays on the 1.5.2-built V0.1 package (`PORTFOLIO-PUBLISH-GATE`). The suites now accept exactly two states (`platform/test/demo-rollout.ts`). `POST_PUBLISH_STEADY` keeps the strict "current package built with the pin" rule. `PRE_PUBLISH_TRANSITION` is valid only if current.json is the V0.1 package, site:publish still plans it, the V0.2 golden exists separately, nothing V0.2 is built into data/site-builds, the corpus emits the golden, and the V0.1 and live packages are byte-intact; anything else fails. predemo, predemo2, ia150, ia151 and ia152 are green. Of the 17 failures, 4 were not the split: ia152 F2 (pin moved) and ia150 R3 / ia151 R2 / ia152 R2 (1.6.0 platform surface, `release-160-surface.ts`), both fixed; step6 H/L/N are split out to `STEP6-V02-CORPUS-RULES` | done; after the V0.2 publish, `demoRollout` reports steady. *Corrected 2026-09-27 (`38-` §6): suite edits ARE needed beyond `integration.test.ts` B2b/G1–G5/R2 — see `POST-PUBLISH-SUITE-RESTATE`* | `37-` §3–§4 |
| `WIDGET-SEAM-RELEASE-SOURCES` | **closed 2026-09-26 (WEB-D1, option A)** | `interior-01@1.6.0` snapshotted the widget-seam files; the canonical sources were uncommitted, so I2b failed on a clean checkout. The seam lane is committed (`b0e7a4f`): 65/65 release sources equal the stored `1.6.0` files, and I2b and slice1 (86/0) pass on a clean `git archive b0e7a4f`. No re-cut, no release artefact touched | done | `37-` §2 |
| `DEMO-AREA-BASIS-LABEL` | **done 2026-09-27 (1.6.1)** | the detail page labelled every area with the one slot `areaLabel` = "공급면적", so `bi-14` (전용 84㎡) read "공급면적 = 84 m²". Now the label follows `area.basis`: supply → `areaSupplyLabel` 공급면적, exclusive → `areaExclusiveLabel` 전용면적, absent/unknown → `areaLabel` 면적. The figure is as authored with no conversion; an absent area gets no row. detail-facts AREA-UI-1…6, B4/B5 (real build, 19/19) and step6 H / H·build | done | `38-` §1, §4; commits `11c3c92` (renderer), `23060ad` (cut + pin) |
| `STEP6-V02-CORPUS-RULES` | **done 2026-09-27** | step6 was 27/3 on the V0.2 corpus. Restated per the owner policy in the brief: H = an area may be absent, a present one is labelled by its basis; L = `galleryGroups`/`keywords` optional, cover fallback valid, a broken visual still fails; N = explicit literal expectations on the 19 records; O = page set = an independent route plan + Next's error pages, no magic number. 32/0 in `PRE_PUBLISH_TRANSITION` and in a simulated `POST_PUBLISH_STEADY` | done | `38-` §4.2; commit `21ddf4f` |
| `TEMPLATE-160-CHANGELOG` | **done 2026-09-27 (1.6.1)** | the canonical `template.ts` 1.6.0 paragraph now names the head-scripts seam and the renderer change (`app/layout.tsx`). A dated note records what the stored 1.6.0 copy got wrong. The stored 1.6.0 is untouched, and the 1.6.1 paragraph makes no false "byte-identical" or "no renderer change" claim | done | `38-` §2; commit `23060ad` |
| `DEMO-DETAIL-V02-FACTS` | **done 2026-09-27 (1.6.1)** | the detail page renders the V0.2 facts only when authored, read from the canonical record (no second facts object): 리모델링 구분 (projectType), 주요 공사 범위 (workScopeIds, BoostChat's words, authored order) and 총 공사비 (exact or range; the same label for partial projects, never a quote or a per-room price). Nothing is inferred. detail-facts F1–F7, B4 (19/19 = the build's integration record) | done | `38-` §1, §4.1; commits `11c3c92`, `23060ad` |
| `POST-PUBLISH-SUITE-RESTATE` | **done 2026-09-27** (`39-`) | predemo P2, predemo2 G1, ia150 P1/P3 and ia152 P1 now compare exact page sets composed from the corpus (`demoExpectedPages`: fixed IA pages + Next's error pages + one `portfolio/<slug>.html` per packaged record), no count. `integration.test.ts`: B2b/G4/R2 state the rollout invariant per state (POST: current = the demo's V0.2 identity with the golden bytes, previous = V0.1 intact), G1–G3/I2 address the V0.1 package by its frozen id, the pilot's build parts are a self-checking literal (keep-2 retires its directory), G5 is point-in-time after the publish. 15/15 green in PRE, in a simulated POST root and in the real POST state. Fresh review 0 BLOCKER, 1 MAJOR + 2 MINOR fixed | done | `38-` §6; `39-` §2; commit `a2e54dd` |
| `DEMO-DETAIL-ROW-OVERLAP` | open (product, minor) | the demo detail page shows both 공사 유형 (category) and 리모델링 구분 (projectType), and both 공사 범위 (free-text `scope`) and 주요 공사 범위 (structured ids). They are distinct facts and do not contradict each other in the corpus (detail-facts B5); merging or hiding one is a product choice | owner decision; any change is a later template cut | `38-` §9 |
| `TEMPLATE-161-UPGRADE-NOTE` | open (minor) | review `38-` MINOR-1: a site that states an area basis and re-pins to ≥ 1.6.1 without authoring `portfolio.detail.areaSupplyLabel` / `areaExclusiveLabel` shows the neutral English default instead of its old `areaLabel`. That is fail-safe (never a wrong basis) but a silent copy change; the 1.6.1 changelog does not name the migration step. The demo authors both labels; no other site pins ≥ 1.6.0 | any other site's re-pin to ≥ 1.6.1: author the two labels; add one changelog sentence at the next `interior-01` cut | `38-` §7 |
| `JEV-ENABLE-GATE` | open | `JEV_API_KEY` present must never by itself cause a call | require explicit mode enabled **and** tenant opt-in **and** an allowed rollout phase | brief |
| `JEV-Q1` | open | does the real API support per-request choices? | before Jev implementation | brief |
| `JEV-Q2` | open | latency / price / SLA unmeasured | before Jev implementation | brief |
| `JEV-Q3` | open | model/provider version identifier unknown | before Jev implementation | brief |
| `JEV-Q4` | open | external processing of visitor utterances needs a privacy review | before any real shadow run | brief |
| `JEV-Q0` | open | production Fuse state | LIVE READ immediately before production exposure, then owner decision | brief |
| `JEV-Q6` | open | QUOTE intent with enough known consultation state and no contact: the final COLLECT/contact hand-off policy | fix in code + acceptance before Jev Phase 4 | brief |
| `BC-LT-VENDOR` | open | first real external vendor/customer integration unverified; `LIVE_VENDOR_VERIFIED` stays NO until a real provider succeeds | first real vendor | brief (BoostChat longer-term) |
| `BC-LT-BOOKING-UI` | open | booking success analytics UI (success criterion = booked) | BoostChat roadmap | brief |
| `BC-LT-BILLING-RECON` | open | billing reconciliation after a charge whose DB record failed | BoostChat roadmap | brief |
| `BC-LT-CONSENT` | open | consent records | BoostChat roadmap | brief |
| `BC-LT-RECEIPTS` | open | receipts | BoostChat roadmap | brief |
| `BC-LT-BILLING-KEY` | open | billing-key revoke | BoostChat roadmap | brief |
| `BC-LT-OPS-SUMMARY` | open | mixed ops summary rows | BoostChat roadmap | brief |
| `BC-LT-ANNUAL-QA` | open | annual payment QA | BoostChat roadmap | brief |
| `BC-LT-SECURITY` | open | extra security hardening | BoostChat roadmap | brief |
| `BC-LT-HANDOVER` | open | human live-chat takeover | BoostChat roadmap | brief |
| `BC-LT-OMNI` | open | omnichannel | BoostChat roadmap | brief |
| `BC-LT-WORKFLOW` | open (non-goal for now) | giant workflow builder | BoostChat roadmap | brief |
| `BC-LT-CODE-DB` | open (non-goal for now) | arbitrary code/DB access | BoostChat roadmap | brief |
| `BC-LT-CRM` | open (non-goal for now) | full CRM rebuild | BoostChat roadmap | brief |
| `BC-LT-ANALYTICS` | open (non-goal for now) | large analytics dashboard | BoostChat roadmap | brief |
| `BC-LT-NATIVE` | open (non-goal for now) | native mobile | BoostChat roadmap | brief |
| `BC-LT-WRITE` | open | higher-risk WRITE expansion (see `S1-RACE-*`) | after `S1-RACE-1/2` | brief |
| `BC-LT-BOOKING-UX` | open | intentionally fail-closed booking UX leftovers | BoostChat roadmap | brief |

## Contract state

| | |
|---|---|
| revision | **rev 9 in progress**; rev 8 is the last reviewed revision |
| rev 8 verdict | **NOT READY** — 4 BLOCKER · 8 MAJOR · 16 MINOR · 6 NOTE (`17-delta-review-rev8.md`), and 0 of 9 fixture utterances executable without a guess (`17b-`) |
| review rounds | 8, all NOT READY. BLOCKER series **4, 2, 4, 1, 3, 4** — no trend |
| scope | **narrowed**: price *comparison* deferred to a V0.3 annex (§17.1). Prices are emitted and may be **stated**, never matched. This defers a stated owner goal (master goal 5) and is the decision most likely to be overturned — `19-…-method-change.md` `DM-2` |

### Method change in force (`19-round8-disposition-and-method-change.md` `DM-1`)

> **No rule in §14.3 or §15 is fixed by hand until the check that would have caught it exists.**
> A design decision whose justification is a claim about the rules is not written into the contract
> until that claim is executed. If the claim fails, the decision is withdrawn, not argued.

Ground: partitioning rev 8's rules by whether anything mechanically checks them puts **all four
BLOCKERs and all seven falsified change-log summaries in the prose-only half**, while the half with
a derivation-based executable check was declared clean by both round-8 reviewers independently.

Already load-bearing: of five decisions drafted for rev 9, **three died under their own checks
before reaching the contract** — `D9-5`, `D9-2`, `D9-3` (`22-rev9-design.md`).

### Executable checks

| script | `npm run` | what it covers |
|---|---|---|
| `proof/ef6-totality.mjs` | `proof:ef6` | `EF6` totality / single-valuedness, class reachability |
| `proof/contract-pipeline.mjs` | `proof:pipeline` | the whole decision pipeline over the 19 records, six property classes. **Independently audited** (`21-pipeline-audit.md`): partial trust — conclusions of properties 1/3/4 usable, no published count is |
| `proof/ws6-monotonicity.mjs` | `proof:ws6-mono` | killed `D9-5` (5,952 counterexamples) |
| `proof/pb4-metamorphic.mjs` | `proof:pb4` | killed `D9-2` / `D9-3` |
| `proof/pb4-direction.mjs` | `proof:pb4-direction` | class-level check of the `D9-2c` direction |

⚠ **A `PB4` figure previously stated here was the wrong assertion's number and has been withdrawn.**
What `PB4`/`CINV-5` require is the **deletion form** (property 4a: delete a stated criterion's input,
re-rank, the record must not move down) — measured **FAIL, 44 findings**, and 109 of 218 in an
independent run (witness: `bi-09` falls 3 → 11 on *"예산 3천으로 전체 가능해요?"* when `projectType`
is deleted). The *"0 of 798"* reported in earlier revisions measures property **4b**, a pairwise
twin comparison, which is `D9-3`'s restatement — **withdrawn** as an illegitimate relaxation. Round
8's `B8-3` is **not closed**; it is `B9-1`. Full separation of 4a and 4b in `32-round-9-handoff.md` §5.

## Open, carried explicitly

- Rev 9 gives up `OD-P`'s **graded** fallback ordering while preserving its disclosure. That is a
  reading of an owner decision, not a fact about it — flagged in `22-rev9-design.md` §4a.
- `X8-21`: for *"32평인데 도배랑 바닥만"* the only `exact` record is a 50,000,000 whole-home remodel,
  earned legitimately. Three criteria cannot express *"a small job"*.
- `EF1`'s closure is checkable only by reading table layout, because `not_evaluable` names **both** a
  criterion state and a match class.
- **⚠ A latent `OD-O` trap for V0.3.** Rev 7 **refused** the budget on §14.3.3 row 5
  (`scope_superset`) — and that refusal *was* the `OD-O` guard. Rev 9's `D9-2c` now has `EF3` report
  the same relation as **`satisfied`**. Both are right about different things: a record that did
  **more** than the visitor asked genuinely satisfies the *scope* criterion, and its total genuinely
  covers more than the query, so a *budget* comparison against it is apples-to-oranges. V0.2 has no
  budget comparison, so nothing conflicts today. **The trap is the inference
  `scope satisfied ⇒ budget comparable`, which V0.3 must not make** — restoring §17.1's parked
  text verbatim on top of rev 9's `EF3` would make exactly that inference. `OD-O` has been violated
  in three separate rounds by three different routes; this is the fourth route, found before it
  fired. Recorded in §17.1 as an unresolved contradiction; deliberately **not** written into the
  contract as a rule by hand, and put to round 9 without a proposed answer.
- **§19's worked example is stale against the applied data on 4 assertions** — contract-side fix,
  queued for rev 10, evidence in `28-styles-and-rebaseline.md`:
  1. `bi-01.workScopeIds` — §19 has `[entrance, living_room, kitchen, bedroom, bathroom,
     built_in_furniture]`, data has `[entrance, kitchen, bathroom, flooring, lighting,
     built_in_furniture]`. Four ids differ, and §19's prose justifying `bedroom`/`living_room`
     goes with them. §19 predates the `WS9(c)` pass the data follows.
  2. `bi-04.pricing` — §19 states `total: exact 19,000,000`; the record has **no `pricing` key**,
     so the *"19,000,000 / 32 = 593,750"* bullet has no referent.
  3. `document.workScopes` — consequence of (1).
  4. `bi-01.facets` key order — §19 writes `category, tag, style` for `bi-01` but `category, style`
     for `bi-04`, and the emitter emits `category, style, tag`. **§19 is internally inconsistent
     with itself**; harmless to meaning, fatal to a byte-for-byte golden like `E2b`.

  `bi-01.facets.style` **now reproduces §19 exactly**, so §19's entire facet *content* holds — both
  records' style/tag arrays and all three document vocabularies — and its `ST2` bullet is literally
  true of the live data.
- ~~9 skipped integration tests remain, several `TODO(v0.2-data)`.~~ **Closed 2026-09-26 (`36-`)**: 0 skipped — restored with V0.2 values, or restated as the V0.1-compatibility checks they had become.

## Not started

*(2026-09-26: the producer side of L16 — emitter, validator, golden — is done; its publish and the V0.2 E2E are not, and are gated by `PORTFOLIO-PUBLISH-GATE`.)*

L13 BoostChat search adapter · L14 consult state/extraction/cards · L16 publish + V0.2 E2E
(*2026-09-27: the producer publish of the demo is done, `39-`; the hosted V0.2 E2E is BoostChat's*) ·
L17 full regression + fresh final review · L18 exposure re-audit then `PUBLIC_ACTION_TOOLS_ENABLED=true`
(`OD-S`, gated on a passing review — **round 8 did not pass**) · L19 real AI QA · L20 widget browser E2E.
