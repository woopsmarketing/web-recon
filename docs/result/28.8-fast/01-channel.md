# Task 28.8 FAST — 01 Channel Talk (`https://channel.io/kr`) fresh-site validation

Status: **COMPLETE** — verdict READY FOR HUMAN REVIEW (see §8).
Site role (program item 30): the ADVANCED / animation-heavy stress site. Its animations do not define the product.

## 1. URL, access, runtime

| item | value |
|---|---|
| URL | `https://channel.io/kr` (fresh start from the URL, no seeding, one capture) |
| access | HTTP 200 on every verified URL; preflight (HTML + sitemap) 2 s; sitemap lists 1,120 URLs |
| robots.txt | disallows `/app`, `/touch`, `/kr/terms`, `/kr/email`, `/kr/blog/p/`, `/kr/oss` — none of these was deep-observed; `/kr/oss` appears in the verified set (one HEAD/GET during verification only) |
| runtime | Next.js + styled-components (`#__next`, `Header-styled__…` classes), page wrapper `overflow-x: clip`, `lang="ko"`; heavy hero/marketing animation (Channel Talk / ALF) |
| runtime difficulty | HIGH for animation and dynamic sections (program item 30: "ADVANCED SOURCE LIMITATION" when a dynamic section cannot be reproduced) |

## 2. Discovery (cheap, ≤ 20 browser pages)

| stage | run / result | seconds |
|---|---|---:|
| `pnpm recon --max-urls 60` (Firecrawl Map) | `data/channel.io/2026-09-08T13-12-19-052Z` — 60 mapped | 15 |
| `pnpm verify --concurrency 6` (Playwright GET) | 59 verified | 111 |
| `pnpm select` (offline families) | 31 families: 21 singleton · 4 sibling-pattern · 6 content-duplicate; largest family 12 (blog articles) | 1 |

Route archetypes found (31 families, all recorded in the SiteSpec, 54 of 59 routes family-represented):
- **home** `/kr`
- **pricing** `/kr/pricing`, `/kr/pricing/simulator`
- **product / feature singletons** `/kr/alf-customer`, `/kr/alf-team`, `/kr/workflow`, `/kr/meet/call`, `/kr/cos`, `/kr/next`, `/kr/wechat`, `/kr/smallbiz`, `/kr/enterprise`, `/kr/experts`, `/kr/partner`, `/kr/download`, `/kr/documents`
- **company** `/kr/team`, `/kr/careers`, `/kr/careers/<id>`
- **blog articles** `/kr/blog/articles/<slug>` — sibling families of 12 / 5 / 3 members plus six content-duplicate groups (2–4 members) and two singleton articles (the repeated-posts family)
- **misc** `/kr/oss`

## 3. Selected representatives (deep budget: HOME + 3 archetypes)

The selector's full 31-family selection was TRIMMED to the deep budget with `tmp/wr288f/orch/trim-selection.mjs`
(kept families verbatim, counts recomputed, provenance in `tmp/wr288f/sites/channel.io/selection/selection-trim.json`).
Dropped families are recorded, not observed (program item 34: no deep clone of every repeated post).

| pageId | role | URL | archetype |
|---|---|---|---|
| p000001 | representative | `/kr` | home |
| p000004 | representative | `/kr/pricing` | pricing |
| p000002 | representative | `/kr/alf-customer` | product |
| p000003 | representative | `/kr/blog/articles/what-is-aicc-1d3e923d` | blog article (12-member family) |
| p000005 | validation sample | `/kr/blog/articles/ai-case-daewoong-fa05c2c6` | blog article (sibling of p000003) |

Repeated posts deep-cloned: **no** — one representative + one validation sample of the blog family.

## 4. Observation → SiteSpec (capture once, reuse)

| stage | run id | seconds |
|---|---|---:|
| `observe:site --concurrency 2` (5 pages, 103–134 s each) | `data/channel.io/site-observations/2026-09-08T14-12-04-717Z` | 348 |
| detect / explore / model interactions | `data/channel.io/interaction-models/2026-09-08T14-19-21-630Z` | 91 |
| `compile:sitespec` (inputs scoped to the deep budget, see below) | `data/channel.io/site-specs/2026-09-08T16-33-17-049Z` — 5 pages, 4 families, 15 routes (4 exact-observed, 10 family-represented, 1 validation sample), 0 routes without a render source | 3 |

Trap hit and resolved (generic tooling, no engine change): a trimmed selection has no sibling `page-families.json`, and the three
consumers disagree about what a consistent input set is — the observer wants `familyCount == selection.familyCount`
(`src/multi-observer/load-selection.ts:227`), the compiler wants EVERY verified URL inside some family with the real
`verifiedUrlCount` (`src/sitespec/load-inputs.ts:396`), and the reconstructor refuses any route whose family has no observed
representative (`src/reconstruction/route-plan.ts:158`, `route-render-source-missing`). Two intermediate SiteSpecs were compiled
and discarded (31 families / 59 routes: 44 routes unrenderable). Resolution = `tmp/wr288f/orch/scope-inputs.mjs`: compile inputs
scoped to the deep budget — `verified-urls.json` = verbatim records of the kept families' 15 members, `page-families.json` = the 4
kept families verbatim, selection repointed to them. The 44 dropped URLs / 27 dropped families are listed in
`tmp/wr288f/sites/channel.io/selection/selection-trim.json` and in §2 above; they are NOT in the SiteSpec. The first observation was
reused (capture once); only the compile stage was rerun.

## 5. Reconstruction + truth-width QA (390 / 1440)

### 5.1 Reconstruction

Three `pnpm reconstruct` attempts: two refused by the generator (nested `<a>` in `<a>` on `/kr/alf-customer`, then `<div>` in `<p>` on
`/kr/pricing`) → Phase F correction 1 (see 03-cross-site.md §1) → third attempt PASS.

| item | value |
|---|---|
| run | `data/channel.io/reconstructions/2026-09-08T16-47-36-107Z` — reconstruct + `next build` 62 s, static pages generated, build PASS |
| served switch | 801 px (`product-policy`); authored inference recorded as evidence only: 992 px chosen among 992 / 768 / 1281 / 1200 / 1025 candidates (ambiguous, dual-DOM, 4 of 5 pages identical walk) |
| parser-unstable edges | `nestingDemotions` 4 (limitation `parser-invalid-nesting-demoted`), `nestingAdaptations` 0 |
| layout tiers | `authoredInlineSize` 259 rules shipped (23 rejected by the truth check, 0 `var()`-admitted — styled-components emits no custom properties), text-box relief on 5,578 nodes (1,577 shrink-to-fit widths dropped), 2,152 residual frozen declarations omitted |
| named limitations | 17, incl. `tree-switch-dom-width-not-observed`, `family-represented-route` (10 of 15 routes render from their family representative), `unknown-interaction-not-implemented` (12 unknown patterns), `font-source-binding-unverified`, `shadow-content-not-observed`, `parser-invalid-nesting-demoted` |

### 5.2 Source-vs-clone QA at 390 / 1440 (4 deep routes, fresh self-check floor)

QA run `data/channel.io/responsive-qa/2026-09-08T16-48-41-104Z` (rubric 7, 342 s; self-check floor 6 PASS / 2 MINOR / 0 BLOCKER).
`/kr` was re-measured on rubric 8 as the negative control of correction 2 (`2026-09-08T18-54-21-769Z`) with identical numbers.
**8 pairs: 0 BLOCKER · 2 MAJOR · 6 MINOR · 0 PASS.**

| route | width | verdict | missing text | pixel residual | what the channels say |
|---|---:|---|---:|---:|---|
| `/kr` | 390 | MINOR (m4) | 1.35 % | 3.71 % | live counter `247,473` vs `247,465` (source-inherent); one container lays out 2×3 where the source is 3×2; 0.26 % extra overlap |
| `/kr` | 1440 | MINOR (m3) | 0.97 % | 5.65 % | same counter; 747 offscreen chars on BOTH sides (marquee) |
| `/kr/pricing` | 390 | MINOR (m3) | 0.65 % | 15.84 % | counter; p90 9 px |
| `/kr/pricing` | 1440 | MINOR (m3) | 0.62 % | 8.02 % | counter; p90 36 px (comparison table) |
| `/kr/alf-customer` | 390 | **MAJOR** (M1/m3) | 0.00 % | 48.77 % | `image-layer-state`: 18 image assets fail to paint in the clone vs 13 in the source (+5) — product screenshots show as blank cards |
| `/kr/alf-customer` | 1440 | **MAJOR** (M1/m2) | 0.00 % | 8.72 % | `image-layer-state`: 13 vs 3 (+10) |
| `/kr/blog/articles/what-is-aicc-…` | 390 | MINOR (m1) | 0.00 % | 16.83 % | pixel residual only (fallback font, line breaks) |
| `/kr/blog/articles/what-is-aicc-…` | 1440 | MINOR (m1) | 0.00 % | 7.69 % | pixel residual only |

**Capture-policy fact a human must know before judging (measured on the QA PNGs, ink per 500 px band):** the SOURCE capture of
`/kr` is itself blank for 8,701 of 12,544 px at 390 and 7,102 of 10,398 px at 1440 — channel.io reveals its mid-page sections
with scroll-triggered opacity animations that the capture policy does not trigger, so the source screenshot shows hero, logo
wall, "AI 솔루션" block and footer with a white middle. The clone reproduces exactly that (8,789 / 7,298 px blank; text census
2,374 chars on both sides). Parity with the capture is real; parity with what a scrolling human sees on the live site is NOT
established for those sections. This is the program's "ADVANCED SOURCE LIMITATION" (item 30), not a product blocker.

## 6. Intermediate clone-only safety (700 / 800 / 1024 / 1100)

`tmp/wr288f/sites/channel.io/clone-safety-164734/` (29 s). Ink-band profile per width matches the 390 / 1440 clones (same blank middle).

| width | tree served | readable | nav / footer reachable | clipping / overflow | judgement |
|---:|---|---|---|---|---|
| 700 | mobile | yes — hero, logo wall (3 columns), AI block, footer 44 links | header collapsed to the hamburger as on the source mobile header; footer inside | content right edge 2,231 px = the logo marquee (source-inherent, 61 offscreen chars on the source at 390 too); no horizontal scroll (scrollWidth 700) | SAFE |
| 800 | mobile | yes (hero mockup image absent at this width, text intact) | same | same marquee; scrollWidth 800 | SAFE, one missing hero image |
| 1024 | desktop | yes — full desktop layout | header 1 visible link (rest collapsed), footer 35 links | **frozen 1,440 px canvas: scrollWidth 1,440 → 416 px horizontal scroll**; 747 offscreen chars (marquee) | USABLE, NOT FLUID — the A9 ancestor-chain residual named in 00-core-finish.md |
| 1100 | desktop | yes | same | 340 px horizontal scroll | USABLE, NOT FLUID |

## 7. Content loss · clipping · CJK readability · popup behaviour

- **Content loss:** none at truth widths beyond the live counter (≤ 1.35 %); 4 nested-anchor demotions leave the box and text but make the inner link non-navigable (`data-wr-demoted`).
- **Images:** `/kr/alf-customer` loses 5 (390) / 10 (1440) image paints — screenshots inside cards render blank; manifest limitation `srcset-candidate-descriptor-missing` is the likely channel. MAJOR, human-visible.
- **Clipping:** none at 390 / 1440 / 700 / 800; horizontal scroll (not clipping) at 1024 / 1100.
- **CJK readability:** Korean body and heading text wraps cleanly with the fallback font at every width (text-box relief on 5,578 nodes); no glyph collisions seen in any composite or safety capture.
- **Popup behaviour:** the yellow top announcement bar renders on both sides at all widths; no modal was encountered, nothing was dismissed.
- **Animation:** scroll-reveal sections are blank in BOTH captures (see §5.2) — ADVANCED SOURCE LIMITATION.

## 8. Remaining issues and per-site verdict

| # | issue | severity | class |
|---|---|---|---|
| 1 | scroll-reveal sections blank in both captures (8.7 k px of the home page) | human must know | ADVANCED SOURCE LIMITATION (animation) |
| 2 | `/kr/alf-customer` image assets not painted (+5 / +10) | MAJOR | asset pipeline (srcset / lazy) — generic, not fixed in this wave |
| 3 | desktop tree serves a frozen 1,440 px canvas at 1024 / 1100 (horizontal scroll) | safety-width residual | A9 ancestor-chain width (known, measured in 28.7 / 28.8) |
| 4 | live counter text differs | negligible | source-inherent |
| 5 | 4 demoted nested links | negligible | recorded limitation |

**Per-site verdict: READY FOR HUMAN REVIEW** — 0 blockers at both truth widths on 4 deep routes, every safety width readable
with nav and footer reachable, and the two MAJORs are named, visible, generic image findings; the animation gap is declared as an
advanced source limitation rather than hidden behind the MINOR grades.

## 9. Timing

| stage | seconds |
|---|---:|
| preflight | 2 |
| discovery (map 15 · verify 111 · select 1) | 127 |
| observation (5 pages, concurrency 2) | 348 |
| interactions (detect / explore / model) | 91 |
| SiteSpec (3 compiles, the last one counted) | 3 |
| reconstruction (3 attempts; the 2 refusals took ~5 s each) | 62 |
| QA 390 / 1440 with self-check (8 pairs) | 342 |
| clone safety (4 widths) | 29 |
| **total pipeline (attempt time only)** | **1,004** |

Slowest three: observation 348 s, QA 342 s, verify 111 s.
