# 01 — Owner decisions of record (Interior Portfolio Contract V0.2)

Transcribed from the owner's task brief (`prompt`, §0 OWNER DECISIONS, 2026-09-24) so that the
contract and the reports can cite them. These were **already decided by the owner** before work
began and were not re-litigated. Where a decision is refined by the pre-implementation review, the
refinement is named and the reason is given — the decision itself is not overridden.

| id | decision | where it lands |
|---|---|---|
| **A** | V0.1 has no third-party consumer. Do not build a duplicate schema to preserve V0.1 compatibility (no permanent `workScopes` + `facets.scope`, no permanent `pricing` + `pricePerArea`). V0.2 becomes the canonical contract. A short-lived **consumer-side** dual-read during rollout is allowed; the producer must never emit both schemas. | contract `RO1`, `RO2`; §10.1 field map |
| **B** | The BoostChat generic core must not know the interior domain. No `if projectType == …`, no `if workScopes includes bathroom …`, no `if industry == interior …` in core. Domain rules are isolated in the portfolio search adapter. | contract `GC1`; BoostChat adapter work package |
| **C** | Keep the current transport: web-recon → manifest → portfolio static resource JSON → BoostChat transport → snapshot → search adapter. **No real-time `/portfolio/search` API in web-recon this phase.** | unchanged from V0; contract §1.1 non-goals |
| **D** | Portfolio `location` is **not** a ranking signal. Weight 0. Customer location is used only for serviceability ("can this business work in that area?"), never to prefer cases from the same district. | contract `LO1`; consumer fix (review R2 M-1: today's matcher uses weight 1 **and** location as the first tie-break) |
| **E** | MVP ranking core: projectType, workScopes, area, total price, per-area price (only where meaningful), style as a weak bonus. Location excluded. | contract §4, §14.3, §14.4 |
| **F** | `projectType` has at least three states: full / partial / unknown. **Uncertain legacy data must not be guessed into full or partial by AI.** `unknown` is allowed. | contract `PT1` (two wire values; **absent = unknown**, because V0 `MD1`/`MD2`/`AR2` already forbid a literal `"unknown"` — task §7 explicitly authorises collapsing when absent and unknown do not differ), `PT3`, `PT4` |
| **G** | `workScopes` are structural facts with a real vocabulary of ids, not free strings. Records store scope ids only. Work scope and style are never mixed. | contract §7; `SD1` |
| **H** | style / mood is semantic classification. Perfect classification is not required in MVP; a semantic miss is acceptable. **Do not lower thresholds to manufacture false positives.** | contract `ST1`–`ST3`, §14.4 |
| **I** | Support both `pricing.total` and `pricing.perArea`. Semantically wrong arithmetic is forbidden. Brief §10 also requires each price object to be **exact XOR range**: *"exact/range 동시에 존재하는 모호한 객체 금지."* | contract §9; the XOR requirement is structural via the `kind` discriminant (§9.1). It is an owner requirement, **not** a V0 rule — rev 1 of the contract wrongly cited it as one |
| **J** | For a full remodel with a real total price and a comparable property area, the **producer** may compute `perArea = total / area` and must mark `source = derived`. | contract `ND2`, `D-1`. Review R1 proposed dropping this; **rejected**, see `05-review-disposition.md` — the owner assigned the computation to the producer precisely so the consumer cannot invent one |
| **K** | Partial work must never produce a derived per-area price from the house area. 34평 flat, bathroom only, 6,000,000 KRW must never become 6,000,000 / 34. A partial's total is still stored. An operator-supplied per-area price may be kept as `authored`. | contract `D-1a` — the single most important prohibition in V0.2 |
| **L** | Pure unit conversion is allowed: 1 pyeong = 400/121 m². **Supply ↔ exclusive basis conversion is forbidden.** | V0 `AR4`, `AR5`, unchanged; contract `PY1` |
| **M** | Area match tiers on the same basis: ±10% strong, ±20% acceptable, beyond that fallback. Do not let a hard filter trivially produce zero results. | contract §14.3 area tiers; `PB4` ordering neutrality |
| **N** | Price match tiers on directly comparable prices: ±10% strong, ±20% acceptable, beyond that fallback / no bonus. **Missing price carries no penalty.** | contract §14.3, `PB4` |
| **O** | A customer's total budget and a portfolio total price are directly comparable when the project semantics match. A customer total budget must never be compared against a per-area price. | contract `PB1`, `PB2` |
| **P** | A missing exact partial case does not stop the consultation. Fallback ladder: partial exact scopes → partial overlapping scopes → full/unknown projects containing the requested space. The AI must never hide that a fallback case is not an exact match. | contract `GR3`, `GR2` |
| **Q** | The demo portfolio is expanded to roughly 16–20 records. Keep the existing 8 where possible, mapping only values actually confirmed in the source. New records must be clearly internal demo fixtures and must not pose as real customer work. | `04-demo-data-spec.md`; the source file already carries `"origin": "synthetic-fixture"` |
| **R** | Image contract expansion is not the point of this phase. A portfolio card image is not required in the first-party contract. Finish the AI / search / data model first. | contract §17 (media stays out); the emitter has never emitted media |
| **S** | Phase 3 production currently has the action fuse OFF. After V0.2 + demo QA + review pass, turning on `PUBLIC_ACTION_TOOLS_ENABLED=true` in production is **approved**, with a mandatory blast-radius re-audit immediately before. | exposure work package (task §48, §49) |

## Operating constraints carried from the brief

- Owner may be away; **no mid-work questions**. Proceed on safe, non-destructive defaults except for
  secrets / 2FA / irreversible approval. A blocked lane must not stop the other lanes.
- Accuracy over speed. No excessive infrastructure.
- Both repos: never `git add .`; never `reset` / `restore` / `checkout` over the owner's own changes;
  a clean tree is not required.
- web-recon worktree calls binaries via `./node_modules/.bin/…`, never `pnpm`
  (`AUTHORITATIVE_WORKTREE.md`).

## Deviations from the brief, with reasons

| brief | actual | reason |
|---|---|---|
| main orchestrator **Fable xhigh** | **Opus 5 (1M) xhigh** | model availability in this session |
| reviewers **Fable MAX fresh context** | **Fable, fresh context** | "MAX" is not a selectable effort tier from the orchestration tool; the brief's own fallback clause applies |
| §14 portfolio document `schemaVersion = "0.2"` | **`"1.0"`** (manifest stays `"0.1"`) | both independent reviewers found `"0.2"` unsafe: V0 `SV2` calls a field removal *major*, and the consumer declares `SUPPORTED_MAJORS = {0}`, so an un-updated consumer would silently parse a V0.2 document and answer "가격 정보가 없습니다" instead of returning TRANSIENT and keeping its last good data. Full reasoning and the rejected alternative: `05-review-disposition.md` → "Escalated decision" |
| DECISION F "at least three values" | two wire values, **absent = unknown** | V0 `MD2`/`AR2` forbid emitting the literal string `"unknown"`; task §7 explicitly authorises collapsing when absent and unknown carry no different meaning |
