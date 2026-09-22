# 00 — Executive summary: Apartmentary comprehensive observation pass (2026-09-18)

**Mode:** source observation / evidence collection / forensic analysis only.
- No template, platform, Supabase/CMS or source-code change was made.
- No commit or push was made.
- The authoritative architecture (`docs/architecture/recon-template-platform.md`) was not modified.
- No frozen artefact was modified: Source Package runs, the frozen preservation clone and Phase 3C/3C.1 evidence are
  unchanged. Every new artefact is in a new timestamped location.

**Result: OBSERVATION_STATUS = COMPLETE, with named exceptions.**
- All 17 success criteria of the task spec (§31) are met.
- None of the PARTIAL conditions of §32 occurred: no site-wide outage, no capture-engine failure, no repeated browser hangs.
- **Named exceptions** (each recorded in `12`, none blocking):
  1. `/journal/jqodqrfdpw` Source Package capture **BLOCKED**: the observer failed twice with a `load` timeout; one retry
     per the rule.
     - Its body variant (html-block) is covered at Level B by `/journal/ibrdwjrdqw`.
     - Its own page was observed at DOM-ready and at Level A.
  2. `/` fresh load at 900 not measured (`load` timeout).
  3. 3 of 23 journal posts have no body classification. 15 have Level A fingerprints, and 5 more were classified from
     captured list bodies.
  4. 4 interactions not exercised live (`12` G17–G19).
- **No implementation-blocking evidence gap was found.**

## What was observed

| Family | Level | Evidence | Headline finding | Report |
|---|---|---|---|---|
| home `/` | reuse + JSON refresh | 1 new capture; earlier Phase 1–3C.1 evidence reused | the 4 public API calls answer an anonymous visitor (200, `application/json`); real bodies captured (9 banners, 10 + 10 area portfolios, 6 reviews). Synthetic fixtures were a correct read-subset | `03` |
| portfolio list | **C** | `?page=0`, `?page=1` × desktop/mobile + 2 faithful clones + live interactions | client-fetched, 30/page, 0-based `page`, total 659; URL-synced filters (`spaceSizes`/`styleTypes`/`prices`/`services`/`sortType`/`keyword`); 3 responsive bands (switch at 900 **and 1281**) | `04` |
| portfolio detail | **C** | 4 details (2 per crawler family) + `/images` + 2 faithful clones; Level A over all 29 | **one template, data-driven**: the crawler's two families = before-image presence (3–10 vs 0). Optional quote, keywords, before/after | `05` |
| service | B | desktop/mobile | fully static; hash dialogs `#transparent`/`#price`; service cards are not links | `06` |
| FAQ | B | desktop/mobile + live | 32 Q&As in 6 categories, static in the JS chunk; only the default category is in SSR; category not in URL | `06` |
| journal list | B | `/journal`, `?page=1` + live | featured-latest + 2×2 grid, total 23; desktop `?page=N` (grid replaced), mobile load-more (appended, URL unchanged) | `07` |
| journal detail | B | 4 captured + 1 BLOCKED (DOM-ready fallback); Level A for the 15 crawl-known posts (of 23) | **one template**; the crawler families = two body-authoring styles (native Unlayer blocks 10 / one pasted HTML block 5). 이전 = newer, 다음 = older, 목록 = `router.back()` (live) | `07` |
| brand (about) | B | desktop/mobile | static sections + news API (map year → array) | `08` |
| stores | B | desktop/mobile + live | 17 + 1 (HK) hard-coded cards with address/hours; **no map**; 포트폴리오 보기 opens a deep-linkable store-detail dialog (`?storeName=&detail=OPEN`), not the portfolio list | `08` |
| terms | B (structure) | `SERVICE_USE`, `PERSONAL_INFO` (+ `MARKETING` live) | shallow `?termsType=` tabs + Unlayer HTML from API; legal text never reused | `08` |
| parts / arckit / pb-brand | A (+ code) | Level A + static reading | brand-specific sub-brand landings, not template-generic | `08` |
| external destinations | A | link targets from nav map/code (not fetched) | Kakao channel, greetinghr, Typeform, sister brands, social, HK site: operator links, never reused | `01` |

## Resolved questions

- **Consultation destination:** every 상담 신청 entry point goes to the internal route `/inquiry`. It is not a modal and not
  an external form. Live clicks confirmed it for the header, floating, drawer, detail and FAQ entry points; the per-branch
  store card is code only (`01` §3).
- **Header/footer logo mechanism:**
  - inline data-URI SVG `<img>`, three assets: desktop wordmark, mobile/drawer monogram, footer inverse monogram
  - no `alt`, no scroll swap (`01` §4)
- **Navigation map** (`01` §2):
  - desktop: 4 GNB items + CTA
  - mobile: drawer with 8 items + CTA
  - footer: identical on both viewports
  - 0 `<a>` elements; all navigation is JS
- **Public JSON bodies:** captured for every first-party API call on the observed pages. API → rendered-region mapping and
  record censuses are in `10`.
- **Responsive:**
  - JS-driven (`useMediaQuery`), no UA dependence
  - every page switches at 899→900
  - portfolio pages switch again at 1280→1281 (header and filters)
  - fresh loads at 900/1280 confirm the bands. The blank hero seen after an in-place resize is an artefact, while the
    `/service` 1354 px horizontal overflow is a real source defect (`09` §1d)
- **Faithful references:** 4 preservation clones (list page 0/1, detail A/B)
  - desktop: 0 mismatching pixels at the > 40 channel-difference threshold
  - mobile: ≤ 0.08% mismatch
  - 0 broken, 0 external, 0 live scripts

## Template implications (see `11`)

- 3 core families: home, project list, project detail.
- 7 secondary families: post list/detail, services, FAQ, about, locations, legal.
- Lead form and sub-brand pages are **not** template pages.
- Everything site-varying maps to data or declared settings. Nothing needs per-customer code.
- Source placement flags must not enter content (boundary 3).
- All source data, copy, legal text, third-party IDs and keys are evidence only (invariants 5/6).
- **No finding blocks Slice 1.**

## Live interaction coverage

- 2 passes: 42 scenarios, 95 steps, all sequential.
- Every in-page interaction on portfolio detail, FAQ, service, stores and brand is **client-only**, with no first-party request.
- List paging/filters and terms tabs make exactly 1 API GET each. Route changes fetch `_next/data`.
- Not exercised live (non-blocking, `12` G17–G19):
  - journal desktop prev/next
  - the `/images` swipe
  - the store-card 상담 신청
  - a fresh `/` load at 900

## Process notes

- **Browsers:** preflight clean; browser jobs strictly sequential; one task-owned cleanup per hang; no unrelated process
  touched (`02` §0).
- **Privacy:** anonymous context, no login, no form entry or submission.
  - No request headers, cookies, `Authorization` or request bodies stored.
  - Credentials, keys and a personal name/email seen in bundles are masked in the static-analysis notes.
- **Side effect recorded honestly:** the standard Source Package observer does not block the source's own view-count POSTs,
  so the 8 detail captures incremented public view counters (24 portfolio + 8 journal POSTs). The pass's own harnesses aborted
  all first-party non-GET requests (`10` §1, `12` G15).

## Next

**Slice 1: minimum Recon Template platform implementation** (`docs/status/source-preservation-v2.md` Step 3). No concrete
blocking evidence gap was found; non-blocking gaps and when to revisit them are in `12`.

## Final report (spec §33)

```
OBSERVATION_STATUS = COMPLETE (named exceptions: jqodqrfdpw Source Package BLOCKED → DOM-ready + Level A fallback; / fresh 900 not measured; 3/23 journal bodies unclassified; 4 interactions not exercised live — all non-blocking, 12)
ROUTES_DISCOVERED = 33 build-manifest entries: 16 real page routes + /404 + _app/_error + 14 pseudo-routes (MobX store files under pages/, all 500)
PAGE_FAMILIES_CONFIRMED = 14 (3 core: home, project list, project detail; 7 secondary: post list, post detail, services, FAQ, about, locations, legal; + gallery sub-view, lead form, sub-brand landings, pseudo/error) — 11 §1
HOME_JSON_CAPTURE = DONE — 4/4 first-party GETs 200 application/json, anonymous; bodies captured, desktop = mobile (run 2026-09-18T08-30-49-211Z) — 03
PORTFOLIO_LIST = LEVEL C DONE — ?page=0/1 × desktop/mobile, JSON bodies, live filters/sort/paging/deep links; 30/page, 0-based page, total 659, bands 900/1281 — 04
PORTFOLIO_DETAIL_FAMILIES = ONE TEMPLATE, DATA-DRIVEN — crawler f000011/f000012 = before-image presence (3–10 vs 0); 2 Level C samples per family + /images; Level A over all 29 — 05
PORTFOLIO_FAITHFUL_REFERENCE = DONE — 4 preservation clones (list p0/p1, detail A/B); QA Δh 0, desktop 0 mismatching px (>40 threshold), mobile ≤0.08%, 0 broken/external/live scripts — 04 §7, 05 §6
SERVICE = LEVEL B DONE — fully static; hash dialogs; cards not links; 1354 px overflow at 900–1281 is a real source defect — 06
FAQ = LEVEL B DONE — 32 Q&A / 6 categories static in the JS chunk; local category state (no URL); accordion collapsed by default — 06
JOURNAL_LIST = LEVEL B DONE — ?page=0/1 × desktop/mobile; featured + 2×2 grid, total 23; desktop ?page=N, mobile load-more (append) — 07
JOURNAL_DETAIL_FAMILIES = ONE TEMPLATE, 2 BODY-AUTHORING VARIANTS — native Unlayer blocks 14 / single pasted-HTML block 6 (20 of 23 classified); 4 Level B captures (3 native, 1 html-block) + jqodqrfdpw BLOCKED with DOM-ready fallback — 07
BRAND = LEVEL B DONE — static sections + news API (year → array); year tabs local — 08 §1
STORES = LEVEL B DONE — 17 + HK hard-coded cards, no map; deep-linkable store-detail dialog — 08 §2
TERMS = LEVEL B (structure only) DONE — 3 tabs via ?termsType=, 1 API GET per switch, Unlayer HTML; legal text not reused — 08 §3
PARTS = LEVEL A + code — brand-specific sub-brand landing (also /arckit, /pb-brand); not template-generic — 08 §4
NAVIGATION_MAP = DONE — desktop 4 GNB + CTA, mobile drawer 8 + CTA, footer identical on both viewports, 0 <a> (all JS); 22 + 47 click probes — 01 §2
CONSULTATION_DESTINATION = internal /inquiry from every entry point (store-card variant /inquiry?storeName= is code-only) — 01 §3
HEADER_LOGO_MECHANISM = inline data-URI SVG <img> in a <button> → router.push('/'); desktop wordmark 157×20, mobile/drawer monogram 25×25; no alt; no scroll swap — 01 §4
FOOTER_LOGO_MECHANISM = inline data-URI SVG <img>, white monogram (a separate asset), 126×145 desktop / 43×49 mobile, not clickable, no alt — 01 §4
PUBLIC_JSON_BODIES_CAPTURED = YES — every first-party API response on 20 captured runs × 2 viewports (+ 31 interaction-triggered bodies); no request headers/cookies/Authorization/request bodies stored — 02, 10
API_TO_RENDER_MAPPING = DONE — page → trigger → request → response → region, incl. interaction-triggered requests — 10 §2, §5
DESKTOP_CAPTURE = DONE (1440, 20 runs)
MOBILE_CAPTURE = DONE (390 DPR 3, 20 runs)
INTERMEDIATE_RESPONSIVE_PROBES = DONE — 11 pages × 23 widths (360–2560, breakpoint ±1 pairs) + UA check + fresh-load confirmation at 900/1280; jqodqrfdpw probe timed out — 09
IMPLEMENTATION_BLOCKERS = NONE (process blocker for future observer runs: G15, view-count POSTs)
NON_BLOCKING_GAPS = 18 (G1–G11, G13, G15–G20; G12/G14 moved to 11) — 12
FILES_CREATED = docs/result/apartmentary-comprehensive-observation/ (00–12 .md + evidence-index.json); data/apartmentary.com/comprehensive-observation-2026-09-18/ (evidence + harness copy); 20 capture runs data/apartmentary.com/2026-09-18T08-*; 4 clones data/apartmentary.com/preservation-clones/2026-09-18T08-*
AUTHORITATIVE_ARCHITECTURE_CHANGED = NO
PRODUCTION_TEMPLATE_IMPLEMENTED = NO
PLATFORM_IMPLEMENTED = NO
SUPABASE/CMS_CHANGED = NO
FROZEN_ARTIFACTS_CHANGED = NO
COMMIT/PUSH = NO
NEXT_RECOMMENDED_STEP = Slice 1 minimum Recon Template platform implementation (status Step 3)
```

