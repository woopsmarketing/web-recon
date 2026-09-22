# Task 28.75 — Start

**Date:** 2026-09-05
**Program:** Task 28.75 → 28.8 — Final Reconstruction Outcome Closure + Four Fresh Real-World Validation Sites
**Mode:** one-shot autonomous master program. Two macro phases (A = core outcome closure, B = four fresh public sites). Phase B runs only if the Phase A hard gate passes.

---

## 1. Baseline

```
BASELINE_SHA = 6c2e723601a0d76431c96a48bbdb4726c02063e7
branch       = main
```

Working tree at start: **240 dirty paths** — 106 modified tracked, 134 untracked. This is the
user's existing working state and is carried, not reverted. No mutating Git operation is
performed by this program (`add`/`commit`/`push`/`reset`/`clean`/`stash`/destructive `checkout`
are all forbidden for its whole duration). Historical artifacts under `docs/result/` for waves
≤ 28.7 are immutable.

## 2. Authoritative input state (Task 28.7)

Read as authoritative:

- `docs/result/28.7-reconstruction-core-correction-2026-09-04.md`
- `docs/result/handoffs/28.7-final.json`
- `docs/result/28.7/08-final-visual-audit.md`
- `docs/result/28.7/09-final-architecture-audit.md`
- `docs/result/28.7/10-final-adjudication.md`
- `docs/result/28.7/ideas/frozen-width-chain-root.md` (chain-root cost model)

### Task 28.7 verdict

> **NOT READY — CORE BLOCKERS REMAIN**

(fresh independent adjudicator, `docs/result/28.7/10-final-adjudication.md`)

### Task 28.7 regression — the floor this program must not regress

| metric | value |
| --- | ---: |
| smoke files on disk | 36 |
| suites with assertions | 35 (`smoke-playwright` has none) |
| checks | 4,326 |
| failures | 0 |
| crashes | 0 |
| non-zero exits | 0 |
| typecheck exit code | 0 |

Authoritative artifact: `tmp/wr287/regression/index-final.tsv`.

### Task 28.7 visual state

20 pairs graded by an independent eyes-only auditor: **PASS 2 / MINOR 2 / MAJOR 7 / BLOCKER 9**.
Estimated human visual equivalence ≈ 75% overall, bimodal: 95%+ on static content at a width the
source was designed for, 55–70% everywhere else.

## 3. Blockers carried into this program

| id | blocker | where |
| --- | --- | --- |
| B1 | Frozen inline width — the correct tree mounts then lays out at its 1440-resolved width; the right of the page is sliced off | linear `/` @700/@1024/@1100, `/pricing` @1100 |
| B2 | JS-dependent content reconstructed as empty containers; **no QA channel fires on it at all** | severance index @390/@1100/@1440, seoultone `/` @390/@1440, linear `/` @700/@1024 |
| B3 | Only two DOM trees are ever observed, so a route whose switch sits between them has no correct variant | linear `/pricing` @1024 |
| B4 | True layout overlap on a dynamic homepage | severance index @1100 (0.448) / @1440 (0.343) |
| B5 | ~30% of visible text absent | seoultone `/` @390 (0.305) / @1440 (0.278) |
| B6 | Popup normalizer blind at wide viewports — `OVERLAY_SHAPE` is viewport-relative | seoultone `/` @1440 |
| B7 | QA source capture does not normalize page state while the observer does | seoultone `/` @390 |

Plus majors M1–M6 (footer link-row collapse, wrong responsive mode, text join/reorder,
breadcrumb-as-nav, small overflow, two false-alarm channels).

### Measured shape of B1

- `width` = **91.3%** of linear.app residuals (2,734 / 2,995)
- `width` = **99.1%** of hobbang.net residuals (2,212 / 2,232)
- remaining high-impact (`consequence=offscreen`) residuals: **1,553**
- The residual is an **ancestor-chain property**: 6 of 10 linear leaders and 8 of hobbang's carry
  a truth-check-VERIFIED full-width rule and still measure a constant clone width, because the
  box they resolve against is frozen.

Three chain-root populations were identified in 28.7. Population 1 (out-of-flow, both inline
insets definite) was closed by `inset-resolved-width` (ADOPTED; 384 nodes improved, 2 worsened by
10px). Populations 2 (in-flow full-bleed `100vw` + `margin-left:-50vw` + `left:50%`, 8 roots on
linear including the #1 residual with 416 descendants) and 3 (hobbang banded grid tracks, 4 roots)
remain open and are this program's target.

## 4. Program scope

**Phase A** — six work programs, each with its own report:

1. `01-blank-region-channel.md` — a generic SOURCE-POPULATED / CLONE-EMPTY QA channel (closes the B2 detection gap)
2. `02-js-dependent-content-root-cause.md` — trace and generically recover four named empty regions
3. `03-frozen-width-chain-root.md` — attack B1 at the chain root (populations 2 and 3)
4. `04-popup-capture-consistency.md` — viewport-independent modal gate + one shared page-state policy (B6, B7)
5. `05-qa-width-overlap-honesty.md` — L1 overlap demotion, L3 min-crop (rubric changes, done FIRST)
6. `06-closure-canary.md` — 18 primary pairs across linear / hobbang / severance / seoultone

then `07-regression.md` and `08-closure-adjudication.md`, plus an 18-composite human review pack
at `docs/result/28.75/human-review/`.

**Phase B** (automatic, only on Phase A gate PASS) — four fresh public sites from URL:
`channel.io/kr`, `toss.im`, `vipgunma.com`, `beomeo.roseeskin.com`, with full site-structure
discovery via RouteArchetypePlan, ≤5 deep archetypes per site, and a maximum of **two** accepted
shared-core corrections across all four.

## 5. Hard constraints acknowledged

- Correction budget: **2** targeted cycles in Phase A. After two, STOP and write the top five blockers.
- Idea experiments: **3** in Phase A, **2** in Phase B. Hard cap.
- Phase B shared-core corrections: **2** total. Then core freezes.
- Rubric/severity changes happen **before** closure reruns; self-check floors recomputed after.
- Closure canary is **4 sites / 18 pairs**, not the old 7-site corpus.
- Full regression: once at Phase A core freeze, once at final core freeze. Not after every edit.
- No Slot / Template / Editor work in this program.
- There is no automatic Task 28.9.
