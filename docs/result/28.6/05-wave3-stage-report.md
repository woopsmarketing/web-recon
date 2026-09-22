# Task 28.6 — Wave 3 Stage Report

- Date: 2026-09-03
- Orchestrator verdict for the stage: **ACCEPTED, WITH ONE LANE FAILED AND SENT BACK**
- 9 agents, 0 errors. No git mutation performed.

| Lane | Scope | Builder | Independent verdict |
|---|---|---|---|
| RECON-C | reconstruction corrections + grid-track kind (A5) | COMPLETE | PASS_WITH_CORRECTIONS |
| OBS-C | observer corrections + scroll-reveal + modal detection | COMPLETE | PASS_WITH_CORRECTIONS |
| SPEC-C | sitespec corrections + task-wide coverage honesty | COMPLETE | PASS_WITH_CORRECTIONS |
| QA-C | reconstruction-qa screenshot cap blindness | COMPLETE | PASS_WITH_CORRECTIONS |
| (audit) | **responsive-QA instrument, first independent audit** | — | **FAIL** |

## 1. The instrument failed its first independent audit

`src/responsive-qa` is what the Linear closure gate and all six pilots will be graded by. It
shipped in Wave 2 without verification because its verifier died on a session limit. The audit
that finally ran returned FAIL, and every defect it found points the same way: **the instrument
under-reports defects.** For a gate, under-reporting is the false-pass direction.

**The primary BLOCKER channel has three wrong-value paths.** All three understate missing text:

| Path | Mechanism | Understatement |
|---|---|---|
| (i) | numerator sums unique truncated keys; denominator counts every occurrence | up to 40x |
| (ii) | `missingChars += candidate.length` uses the 120-char truncated key | 8.3x on a 1,000-char paragraph |
| (iii) | `haystack.indexOf` matches substrings across token boundaries | qualitative |

Path (iii) is not academic. It is why the channel reported **0.00% missing text on the exact pair
where the clone drops the `US` prefix from `US$10`**: the source token `US` is found inside the
clone's word `customers`. Wave 2 had cited that 0.00% as proof the pixel channel was the only
instrument that could see the defect. The truth is that the text channel was blind by construction.

**The trust gate is inverted on the pair its own headline rests on.**
`matchedFractionOfContentKeyed = min(1, matchedPairs / contentKeyedSourceLeaves)` puts pass-3
structural matches in the numerator and only content-keyed leaves in the denominator. On `/`@700 it
reports 0.3841 where the true value is 166/492 = 0.3374, against a 0.35 threshold — so
`trustworthy` flips false to true on 23 ambiguous structural pairs. The `min(1, …)` cap fires
silently on 4 of 10 pairs, reporting a measured-looking 1.00 against true values of 0.93 to 0.96.

**The pixel threshold is uncalibrated against ink.** The residual normalises by total overlap
pixels, not by ink. On `/pricing`@1440 the entire page erased to its own background yields 0.0284,
so the 1% MINOR threshold equals **35.2% of all non-background ink on the page**, and erasing a
full-width 1440x400 band of real content reads 0.0032 and is silent.

**Zero automated coverage exists.** Nothing imports the subsystem except its CLI. The regression
evidence Wave 2 cited was another suite running byte-identically.

The audit was also fair about what was good: no assertion was deleted, weakened or renumbered, no
channel band moved in the permissive direction, and the report withdrew its own overclaim in one
place while rejecting the previous verifier's proposed replacement with measurement. The repair is
now the highest-priority lane in the task.

## 2. The band-check went from 31.6% real to 100% real, at zero extra cost

The Wave-2 in-band render asked "is this node out of layout at the band width", which an ancestor's
`display:none` answers for every descendant. Only 233 of 738 shipped banded rules were
independently discriminated.

RECON-C did not build the suggested fix. It first checked the browser semantics rather than
assuming them, found that under a hidden ancestor `getClientRects()` is 0 while
`getComputedStyle(child).display` is still `block`, and switched the test to the node's **own
computed display**. Full independent discrimination, **zero extra renders** — cheaper and stricter
than suppressing descendants' bands per band root.

`bandIndependentlyDiscriminated` 738/738. The lane's own probe independently reproduced the
auditor's 505/738 ancestor-masking figure. Both new counters ship in the manifest.

## 3. The grid-track kind was built, and it does not fix Linear — for a reason worth having

`grid-track-columns` recovers a container's track list from observation alone: 23 emitted, 413
refused across 17 named reasons, and all 23 accepted by the truth check. It carries a new
`witnesses` field so the truth check measures the grid items the rule actually moves rather than
the container, whose own border box a track list never changes. A deliberately wrong track list is
rejected and names its witness; the same wrong rule without witnesses sails through the identical
render, which is why witnesses exist.

On the real defect it **refuses**, and the refusal is correct given the data. Of the 58 grid
containers on `/pricing`, one refuses `container-width-constant` and 57 refuse
`tracks-not-reproducible-at-every-width` because their children are hidden at 1024 and the next
probe sample is 1440.

The lane also **built, measured and reverted** the `containingBlockGuard` relaxation rather than
shipping it. With it, 24 of 71 grid-item refusals converted — and a per-node rect diff showed 100
nodes moving up to 2px *away* from their observed boxes while corpus overflow stayed byte-identical
at all four widths. Net negative on every measurement taken. The cause is recorded in the source so
the next lane does not rebuild it: a grid item's automatic minimum size is min-content, so
`width:auto` resolved to 672px where the source had a frozen 670px. The containing block was never
the problem.

## 4. What the negative result actually diagnosed

Two independent measurements point at the same root cause, and it is not in the reconstruction
engine's rule kinds. It is in **where the probe samples**.

The `/pricing` rows currently ship with the band `(max-width: 1231.98px)`. 1232 is
`floor((1024 + 1440) / 2)` — the midpoint of two adjacent probe samples. The source's authored
breakpoint is 1024/1025. **So the clone hides the comparison table across 1025 to 1231 where the
source shows it**, and the responsive QA harness independently graded `/pricing`@1100 a BLOCKER
whose missing-text samples are literally comparison-table cell strings: "multiple tenants",
"google + saml", "15 pipelines", "5 levels", "1 level".

The same gap explains the 57 grid refusals: there is no sampled width where the children are
visible *and* the container width differs.

The 28.5B site-spec's probe widths are `[390, 768, 1024, 1440, 1920]` — no 1100, no 700, no mobile
probe. Both defects are downstream of a fixed global width list that knows nothing about the site
it is measuring.

Wave 4a therefore carries two matched items: the reconstruction lane snaps band edges to the
`authoredBreakpoints` histogram, and the observer lane derives its probe widths from the same
authored conditions.

## 5. Regression posture

Measured across all 35 `scripts/smoke-*.ts` on disk: **3,503 checks, 0 failures**, with one crash
that was a Wave-3 lane mid-edit on its own file. Details and caveats in
`04-regression-snapshot-mid-wave3.md`. A clean run follows Wave 4a.

Two counting hazards found and recorded: four different suite output formats are in use, so a
parser that knows one silently reports zero for the others; and `smoke-playwright` is a Chromium
connectivity probe contributing 0 checks, not an assertion suite.
