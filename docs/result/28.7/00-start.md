# Task 28.7 — 00 Start / Integrity Record

**Task:** Reconstruction Core Correction + Normal Page State + Frozen Value Closure + Honest QA + Fast Multi-Site Verification
**Date:** 2026-09-04
**Scope:** PHASE 1 (Exact Reconstruction) ONLY. No Slotization, no Recon Template evolution, no Visual Editor, no CMS/SaaS/billing/hosting.

---

## 1. Baseline integrity

| field | value |
|---|---|
| `baselineSha` | `6c2e723601a0d76431c96a48bbdb4726c02063e7` |
| branch | `main` |
| started (UTC) | `2026-09-04T13:28:59Z` |
| started (local) | `2026-09-04T22:28:59+0900` |
| modified tracked files at start | 97 |
| untracked paths at start | 126 |
| git status snapshot | `tmp/wr287/git-status-at-start.txt` |
| mutating git operations planned | **0** |

**Git contract for this task:** no `git add`, `commit`, `push`, `reset`, `clean`, `stash`, or destructive
`checkout` at any point. The working tree is left exactly as the operator had it. Pre-existing
uncommitted work (97 modified / 126 untracked) is the operator's and is not touched, reverted or
stashed.

**Artifact contract:** historical wave artifacts (`docs/result/28.5*`, `docs/result/28.6*`,
`docs/result/handoffs/28.5*`, `28.6-*`) are read-only inputs. All new output goes under the new
namespaces `docs/result/28.7/`, `docs/result/handoffs/28.7-*.json`, `tmp/wr287/`, `tmp/wr287-ideas/`.

## 2. Machine

| field | value |
|---|---|
| model | Mac16,11 |
| logical CPUs | 14 |
| memory | 68,719,476,736 B (64 GiB) |
| free disk (`/System/Volumes/Data`) | 715 GiB of 926 GiB |
| node | v22.22.3 |
| pnpm | 11.21.0 |
| Playwright browser caches | chromium 1208 / 1228 / 1234 + headless_shell, ffmpeg-1011 |
| load average at start | 3.78 / 4.11 / 4.50 |
| cached site data | 15 domains under `data/`, ~90 GB (linear.app 39 G, stripe.com 38 G) |

## 3. Latest authoritative verdict carried in

**Task 28.6 (`docs/result/28.6-reconstruction-v1-closure-2026-09-04.md`):**

> # NOT READY — ENGINE BLOCKERS REMAIN

Measured across 7 real sites and 86 route×width pairs:

| grade | pairs |
|---|---|
| BLOCKER | 43 |
| MAJOR | 32 |
| MINOR | 9 |
| PASS | 0 |
| measurement failed (ungraded) | 2 |

70 of 86 pairs graded strictly worse than the instrument's own self-check floor for that exact
route and width.

## 4. Regression evidence carried in

There is **no full-suite regression from 28.6** — that wave ran only `smoke-multi-observer`
(173/173), `smoke-responsive-qa` (120/120) and `tsc --noEmit` (0), and said so explicitly.

The last authoritative full regression is **28.5B** (`docs/result/handoffs/28.5B-regression.json`):

| field | value |
|---|---|
| suites counted | 34 |
| checks | 3,354 |
| failures | 0 |
| typecheck exit | 0 |

**Delta to reconcile at the end of this task:** there are now **36** `scripts/smoke-*.ts` files on
disk, versus 34 counted in 28.5B. The 28.7 final regression must enumerate all 36 by filename, state
whether each is wired to a `package.json` script, and account for the two-suite difference rather
than silently reporting a different total. Suites on disk at start:

```
assets authoring-preview brand-assets content-generation content-injection create-site
custom-properties e2e editor-integration enablement first-draft interaction-detector
interaction-explorer interaction-patterns layout-safety multi-observer playwright
production-canary production qa-independence recon-template reconstruction-qa reconstruction
regions registry release responsive-qa revision selector seo sitespec theme verifier
video-honesty visual-editor visual-vocab
```

`smoke-playwright` is a connectivity probe and must be identified separately if it carries no
assertions.

## 5. Known open defects carried in (28.6 ledger, `docs/result/28.6/00-defect-ledger.md`)

Priority order for this task:

| id | prio | defect | ledger status carried in |
|---|---|---|---|
| A10-residual | **P0** | `prepareScroll` can navigate mid-observation, destroying the JS execution context; the whole route's observation is lost (`observation-error` → no `renderSourcePageId` → reconstruction refuses). Reproduced on seoultone.kr by a single-variable A/B. | PROVEN, not fixed |
| A9 | **P0** | A refused layout recovery ships the exact tier's 1440-resolved frozen px, and nothing checks it at any other width. linear `/pricing` @1100 footer right edge 1390 = `46 + 6×224`. 30 of 97 frozen-track grid containers and 3,736 of 4,567 px-width nodes ship unrecovered on linear alone. | PROVEN, top-ranked, not fixed |
| A5/A9-2 | **P1** | `recoverGridTracks` refuses valid layouts containing hidden children and spanning children (`child-count-not-multiple-of-tracks` 32, `children-do-not-tile-tracks` 14 of 413 refusals on linear). | PROVEN, not fixed |
| A14 | **P1** | QA grades a route the clone never built (HTTP 404) as content loss — 5 of 13 `image-presence-ratio` BLOCKERs are one unbuilt route. | PROVEN, instrument defect |
| A15 | **P1** | A source capture that swings 4× at one width and reverts is graded as truth (interiorteacher `/furniture/list`: 1225/1225/1263/**4191**/1265). | PROVEN, instrument defect |
| A11 | **P1** | `overlap-excess-ratio` cannot distinguish a layout collapse from two image layers of one `<picture>` crossfade whose assets failed to load. Leading BLOCKER on 5 of 5 pairs of one site at 24.57%. | PROVEN, instrument defect |
| B5 | **P1** | Modal / entry popups are flagged but baked into the reconstruction as permanent overlays (seen on 2 of 12 scouted candidates). | COUNTED, NOT AUTO-REMOVED |
| B4 | **P1** | Scroll-reveal re-hide: elements visible during reveal but hidden again on return to top are baked blank. | FIXED-UNVERIFIED, two-instant verify gate NOT built |
| A12 | **P2 cond.** | One site-wide responsive tree-switch breakpoint where a real site's routes disagree (linear `/` changes 390→700, `/pricing` 1024→1100). | PROVEN, architectural |
| A13 | **P2 cond.** | Mobile layout probe ceiling frozen at 914 while the mobile tree renders up to the switch (5 of 7 pilots have an unobserved band). | PROVEN |
| A6/C1 | context | Responsive-QA instrument under-reports; PASS was unreachable. | partially addressed in 28.6 |

**Closed — do NOT re-investigate without contradictory fresh evidence:** B1 cross-origin stylesheet
recovery, B2 conditional CSS grouping, B3 sheet-level media, A1 `hiddenRanges` inversion, A2
`width:auto` stretch, A3 active-band verification, A7 site-aware probe widths, A8 `requiredWidths`
probe-width eviction.
**WONTFIX-PROVEN-HARMFUL — must never be rebuilt:** A4 transitive descendant unfreeze; the
`containingBlockGuard` relaxation (measured net-negative and reverted).

## 6. Quality target for this task

Not pursued: source/CSS equivalence, 1–2px deltas, font rasterization, anti-aliasing, animation
phase, video frame timing, perfect continuous responsiveness.

Required: professional visual equivalence ≈95%; important content present; correct major layout
structure; no severe clipping, broken navigation, giant empty areas, broken footer, missing hero,
obviously wrong responsive layout, disappearing images/sections, or unusable controls.

## 7. Site scope

In scope (fast canary matrix): **linear.app**, **hobbang.net**, **gs.severance.healthcare**,
**seoultone.kr**.
Explicitly OUT of scope, reserved for Task 28.8: channel.io, toss.im, vipgunma.com,
beomeo.roseeskin.com.
