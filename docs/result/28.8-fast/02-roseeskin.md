# Task 28.8 FAST — 02 RoseeSkin (`https://beomeo.roseeskin.com/`) fresh-site validation

Status: **COMPLETE** — verdict READY FOR HUMAN REVIEW (see §8).
Site role (program item 31): the PRIORITY site — a typical Korean clinic marketing site built on a page builder.

## 1. URL, access, runtime

| item | value |
|---|---|
| URL | `https://beomeo.roseeskin.com/` (fresh start from the URL, no seeding) |
| title | 범어로제피부과의원 |
| access | HTTP 200 on every verified URL; preflight (HTML + sitemap) 2 s; sitemap lists 123 URLs; homepage HTML 1.6 MB |
| runtime | imweb page builder ( 220 imweb.me/thumbnail/; 108 imweb.me;  15 imweb.me/upload/S;); numeric routes `/<n>`; homepage captures at ~44 MB of assets, hub pages up to 56 MB |
| runtime difficulty | MEDIUM — builder markup is static but very asset-heavy (long observation per page); popups/boards possible |

## 2. Discovery (cheap, ≤ 20 browser pages)

| stage | run / result | seconds |
|---|---|---:|
| `pnpm recon --max-urls 60` (Firecrawl Map) | `data/beomeo.roseeskin.com/2026-09-08T13-12-17-765Z` — 41 mapped | 13 |
| `pnpm verify --concurrency 6` (Playwright GET) | 40 verified | 105 |
| `pnpm select` (offline families) | 22 families (largest 11 = treatment detail pages) | 1 |

Route archetypes found (22 families, all recorded in the SiteSpec):

| type | members | representative |
|---|---:|---|
| sibling-pattern | 11 | `/34` |
| sibling-pattern | 4 | `/19` |
| sibling-pattern | 4 | `/20` |
| sibling-pattern | 3 | `/16` |
| singleton | 1 | `/` |
| singleton | 1 | `/106` |
| singleton | 1 | `/14` |
| singleton | 1 | `/17` |
| singleton | 1 | `/29` |
| singleton | 1 | `/30` |
| singleton | 1 | `/32` |
| singleton | 1 | `/33` |
| singleton | 1 | `/36` |
| singleton | 1 | `/37` |
| singleton | 1 | `/39` |
| singleton | 1 | `/47` |
| singleton | 1 | `/55` |
| singleton | 1 | `/60` |
| singleton | 1 | `/69` |
| singleton | 1 | `/76` |
| singleton | 1 | `/77` |
| singleton | 1 | `/login?back_url=LzIz` |

## 3. Selected representatives (deep budget: HOME + 4 archetypes — the 5th is used because 인바이론 detail is an 11-member family that would otherwise be missing)

The selector's full 22-family selection was TRIMMED with `tmp/wr288f/orch/trim-selection.mjs` (provenance in
`tmp/wr288f/sites/beomeo.roseeskin.com/selection/selection-trim.json`). Board `/77` 커뮤니티 was dropped (recorded, not observed).

| family | type | members | URL / archetype |
|---|---|---:|---|
| f000001 | singleton | 1 | `/` |
| f000004 | sibling-pattern | 3 | `/16` |
| f000005 | singleton | 1 | `/17` |
| f000008 | singleton | 1 | `/29` |
| f000012 | sibling-pattern | 11 | `/34` |

Archetype meaning: `/` home · `/17` 진료시간·위치 (hours + map) · `/29` 기미·색소 treatment hub · `/34` 인바이론 treatment detail (11-member family) · `/16` 의료진 소개 (doctors).
Sibling validation samples are observed as `[sample]` pages (e.g. `/18`). Repeated treatment pages deep-cloned: **no** — one representative + samples.

## 4. Observation → SiteSpec

| attempt | outcome |
|---|---|
| 1st `observe:site` (14:12 UTC) | 6 of 7 pages captured (49–279 s each, 10–56 MB) when the orchestrating process exited — an external interruption, not a site failure; no manifest → unusable (the observer has no resume by design) |
| 2nd `observe:site` (16:27 UTC, the allowed retry) | again 6 of 7 pages captured, again the orchestrating process exited while page 7 (the second validation sample) was being captured — same external failure |
| 3rd `observe:site` (16:44 UTC) | launched in its own session (`setsid`, immune to the orchestrator's process-group exit) with `--max-validation-samples 1` (new CLI plumbing for an existing option) and a memory monitor; **6/6 pages OK** |

Memory monitor during the 3rd attempt: free RAM never dropped below ~11 GB (64 GB machine), observer Chromium ≤ 11.3 GB RSS — page 7 was not an out-of-memory kill; the two earlier losses are attributed to the orchestrating process taking its process group down.

| stage | run id | seconds |
|---|---|---:|
| `observe:site --concurrency 2` (6 pages: 50–259 s each, 10–56 MB; sample = `/43`) | `data/beomeo.roseeskin.com/site-observations/2026-09-08T16-44-02-947Z` | 542 |
| detect / explore / model interactions | 0 verified patterns, 5 unknowns (imweb widgets) | 37 |
| `compile:sitespec` (inputs scoped to the deep budget, same resolution as Channel Talk) | `data/beomeo.roseeskin.com/site-specs/2026-09-08T16-53-43-839Z` — 6 pages, 5 families, 17 routes (5 exact, 11 family-represented, 1 sample) | 5 |

Capture total 584 s (attempt 3 only; attempts 1–2 wasted ~14 min of observation).

## 5. Reconstruction + truth-width QA (390 / 1440)

### 5.1 Reconstruction

| item | value |
|---|---|
| run | `data/beomeo.roseeskin.com/reconstructions/2026-09-08T16-54-23-114Z` — reconstruct + `next build` 272 s (44 MB of assets on the home page alone), build PASS first time |
| served switch | 801 px (`product-policy`); authored inference recorded as evidence: 992 px |
| parser-unstable edges | 0 demotions, 0 adaptations (imweb markup is parser-stable) |
| layout tiers | `authoredInlineSize` 311 rules shipped (12 rejected by the truth check), text-box relief on 2,757 nodes (49 shrink-to-fit widths dropped), 3,734 residual frozen declarations omitted; truth check rejected 655 `full-width` candidates |
| named limitations | 14, incl. `family-represented-route` (11 of 17 routes), `unknown-interaction-not-implemented` (5 unknown imweb widgets), `font-source-binding-unverified`, `shadow-content-not-observed`, `frame-content-not-observed` |

### 5.2 Source-vs-clone QA at 390 / 1440 (5 deep routes, fresh self-check floor)

First run `2026-09-08T16-58-53-645Z` (rubric 7, 633 s): **9 BLOCKER / 0 MAJOR / 0 MINOR / 1 PASS** — every BLOCKER carried
`missing-text-ratio` 40–60 % + `visible-text-ratio` < 60 % whose "missing text" was the GTM / pixel `<noscript>` markup
(Phase F correction 2, 03-cross-site.md §1). Authoritative rerun on rubric 8: `2026-09-08T18-54-21-770Z` (753 s, self-check
floor 10 PASS). **10 pairs: 1 BLOCKER · 1 MAJOR · 7 MINOR · 1 PASS; missing text 0.00 % on every pair.**

| route | width | verdict | pixel residual | what the channels say |
|---|---:|---|---:|---|
| `/` home | 390 | **BLOCKER** (B1/m1) | 18.15 % | `blank-region-ratio`: div[23] 390×608 at y=8764 "source 4 DOM leaves → clone 0" — a wood-texture block that is empty on BOTH screenshots (§7); DOM-only difference |
| `/` home | 1440 | **MAJOR** (M1/m2) | 34.81 % | `blank-region-ratio`: footer 1440×179 not painted (real); position p90 18 px, worst 605 px (contact block displaced); hero background photo missing (§7) |
| `/17` 진료시간·위치 | 390 | MINOR (m2) | 6.26 % | p90 9 px |
| `/17` | 1440 | MINOR (m2) | 1.12 % | p90 14 px |
| `/29` 기미·색소 hub | 390 | MINOR (m3) | 25.42 % | p90 6 px over a 17.6 k px page |
| `/29` | 1440 | **PASS** | 0.37 % | — |
| `/34` 인바이론 detail | 390 | MINOR (m3) | 23.12 % | p90 9 px |
| `/34` | 1440 | MINOR (m1) | 0.15 % | — |
| `/16` 의료진 | 390 | MINOR (m3) | 15.48 % | p90 9 px |
| `/16` | 1440 | MINOR (m2) | 1.11 % | — |

All 390 pairs carry 37 offscreen chars on BOTH sides (the imweb slide-out menu) — source-inherent.

## 6. Intermediate clone-only safety (700 / 800 / 1024 / 1100)

`tmp/wr288f/sites/beomeo.roseeskin.com/clone-safety-165420/` (55 s). Ink-band profile (ink % per 500 px, measured on the PNGs):
700 / 800 follow the 390 clone band-for-band; 1024 / 1100 follow the 1440 clone band-for-band (same low-ink top = the missing
hero photo, same tail). The harness' `GIANT-WHITESPACE 5,448 px` flag at 1024 / 1100 is the decorative grey studio background
section that is equally empty on the SOURCE at 1440 (see §5); the longest truly white run is 738 px.

| width | tree served | readable | nav / footer reachable | clipping / overflow | judgement |
|---:|---|---|---|---|---|
| 700 | mobile | yes — popup card, hero photo, "High quality for Skin" block, treatment cards, before/after gallery | header menu row visible (imweb header, landmark detector counts 0 links because the menu is not `<a href>`); footer 2 links inside | scrollWidth 700, no horizontal scroll; content right edge 1,031 px = the hero photo bleed (decorative) | SAFE |
| 800 | mobile | yes | same | scrollWidth 800; same bleed | SAFE |
| 1024 | desktop | yes — desktop layout at its own width | header visible; footer landmark's max-right 1,200 px > 1,024 (the contact-photo block bleeds 176 px, text stays inside) | scrollWidth 1,024 — no horizontal scroll (the desktop tree here is NOT a frozen 1,440 canvas: authored `width:100%` / `max-width` relations shipped, 311 rules) | SAFE, minor right bleed |
| 1100 | desktop | yes | footer max-right 1,200 (100 px bleed) | scrollWidth 1,100 | SAFE |

## 7. Content loss · clipping · CJK readability · popup behaviour

- **Content loss (home, desktop tree only):** the 1440 hero background photo does not paint (ink 15–46 % in the top 1,500 px vs 85–100 % on the source) and the dark site footer band (범어로제피부과의원 / 대표 / 사업자등록번호 / copyright) does not paint — `blank-region-ratio` MAJOR "footer 1440×179, seen by DOM, 7 painted leaves → 0"; the LOCATION / CONTACT / OFFICE HOUR block above it lands ~170 px lower and the page is 303 px longer. Everything between (studio section, before/after gallery, programme cards, video thumbnails) matches.
- **Content loss (mobile):** none seen — ink bands identical to the source within 1–2 points down the whole 10.8 k px page; the `blank-region-ratio` BLOCKER on `/` @390 ("div[23] 390×608 at y=8764") is a wood-texture background block that is EMPTY on the source capture too (crop in `tmp/wr288f/sites/beomeo.roseeskin.com/crops/home390-blank-pair.png`); the region census saw 4 DOM leaves the paint never showed — a DOM-only difference, no human-visible defect (candidate false positive of the region channel, left as is: the two-correction limit is used).
- **Internal pages:** `/17`, `/29`, `/34`, `/16` match at both widths (pixel residual 0.15–1.1 % at 1440; 6–25 % at 390 from fallback-font line heights over very long pages, composites look the same).
- **Clipping:** none at any width; decorative right bleed of 100–176 px at 1024 / 1100 only.
- **CJK readability:** Korean headings, body text, the 진료시간 table on `/17` and the popup card render cleanly with the fallback font at every width (text-box relief on 2,757 nodes); no collisions or clipped glyphs seen in any composite.
- **Popup behaviour:** the 진료시간 변경 안내 entry popup is present on both sides at the top of every home capture (not dismissed: the normalizer keeps a popup the source shows in the same state on both sides); no other popups.

## 8. Remaining issues and per-site verdict

| # | issue | severity | class |
|---|---|---|---|
| 1 | home @1440: dark site footer band not painted, contact block ~170 px lower, page 303 px longer | MAJOR (human-visible) | desktop-tree content loss — candidate cause: an imweb scroll-reveal / footer widget whose desktop state was captured hidden; not diagnosed to file:line in this wave |
| 2 | home @1440 / 1024 / 1100: hero background photo does not paint (popup card on white) | human-visible | desktop-tree asset (CSS background / video) not carried |
| 3 | home @390: `blank-region-ratio` BLOCKER on an identical wood-texture block | measurement | DOM-only difference; candidate false positive of the region channel (two-correction limit reached, left as is, negative case recorded for the next rubric) |
| 4 | 5 unknown imweb widgets not implemented; 11 of 17 routes rendered from family representatives | recorded limitation | expected under the deep budget |
| 5 | second validation sample dropped (`--max-validation-samples 1`) after two lost observations | process | one sample (`/43`) still validates the 11-member family |

**Per-site verdict: READY FOR HUMAN REVIEW** — four of five deep routes are visually equivalent at both truth widths (1440
pixel residual 0.15–1.1 %), the mobile home page matches band-for-band, every safety width is readable with nav and footer
reachable, and the two real defects are both on the desktop home page and named. The single remaining BLOCKER grade is a
DOM-only finding on a block that looks identical on both sides; a human should confirm that from the review pack.

## 9. Timing

| stage | seconds |
|---|---:|
| preflight | 2 |
| discovery (map 13 · verify 105 · select 1) | 119 |
| observation (6 pages, concurrency 2; attempt 3 only) | 542 |
| interactions | 37 |
| SiteSpec | 5 |
| reconstruction + `next build` (44 MB of assets) | 272 |
| QA 390 / 1440 with self-check (10 pairs; first run) | 633 |
| clone safety (4 widths) | 55 |
| **total pipeline (attempt time only)** | **1,665** |

Slowest three: QA 633 s, observation 542 s, reconstruction 272 s. Wasted by the two lost observation attempts: ~14 min.
