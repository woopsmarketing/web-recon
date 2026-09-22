# 06 — Open items

| # | item | why open | suggested owner step |
|---|---|---|---|
| 1 | **FILTERS = DEFERRED** (area / keyword / price / sort panel and search) | Core first, as the spec allows. No filter vocabulary exists in site settings. Static-export filtering is either client-side over an index or generated filter routes, and neither is small and bounded here. The source's filter UI also carries defects (JS-only state, `?TOGGLED_UUIDS=[]`). | Step 5 or later, as a new `ProjectSelection` mode plus settings vocabulary, never stored pages |
| 2 | **Rollback of Step 4 content = the retained previous package, not a re-pin** | Re-pinning a site to 1.0.0 builds only with 1.0.0-shaped content, because the old strict schemas refuse the new fields and slots. Test Y proves (a) the previous package is intact and (b) the builder still builds 1.0.0-pinned sites, using data stripped to the 1.0.0 shape. | platform: rollback runbook (serve `previous.json` package) |
| 3 | Price and area formatting is locale-neutral, not localized (`KRW 2,500,000 / 평`) | No `Intl` is allowed in Template code, which keeps output deterministic. A per-site currency or unit presentation would need a slot or setting, and none is required yet. | when a real site needs it |
| 4 | Same template version with different code produces two releases | `createRelease` is content-addressed, so a version is informational. The repo has exactly one 1.1.0 (`512e4dd932b4`). The dev scratch roots had several. | release tooling: optional "version already released with other code" guard |
| 5 | Share button and app-bar room dropdown (observed) not built | There is no share target, and the room pills cover room switching. Recorded as fidelity residuals. | optional |
| 6 | List title below the hero instead of overlaid | Contrast cannot be guaranteed for operator images (see 05). | design decision; revisit with real content |
| 7 | Older packages beyond `previous` are pruned (accepted retention) | The Slice 1 `1ddf327cb1b9` packages were pruned on this build. Its **release** is untouched and verifies. | none (accepted rule) |
| 8 | Card and gallery pixel fidelity was checked against fictional SVGs only | No source photography or copy is used, by design. | Step 6 customer-content proof |
