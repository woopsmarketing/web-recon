# 02 — Capture matrix

Evidence root (new, timestamped): `data/apartmentary.com/comprehensive-observation-2026-09-18/`. Machine-readable form:
`capture-matrix.json`. No existing artefact was modified:
- canonical Source Package runs
- the frozen preservation clone
- Phase 3C/3C.1 evidence

## 0. Browser discipline

- **Preflight** (before the first capture; recorded in the session transcript, not in `logs/`):
  - process scan for Chrome-for-Testing / headless-shell / Playwright / tsx
  - result: **no stale web-recon QA or orphan browser processes**; only unrelated Cursor helpers, which were not touched
- **Sequential only.** One browser job at a time. Capture queues, nav map, responsive probe, interactions, clone QA and the
  follow-up interaction run were chained one after another. Subagents did static/file work only, with no browsers.
- **Mutation aborts by the harnesses:**
  - The interaction harnesses logged 16 aborted first-party POSTs, all the source's own `…/add-view-count/{uuid}` (7 in pass 1,
    9 in the follow-up).
  - The pages attempted no other first-party mutation.
  - The nav map logs aborts (`blocked: []`, 0 on both viewports).
  - The responsive probe uses the same abort route but does not log aborts. It loaded detail pages, so it will have aborted
    their view-count POSTs as well.
  - Clone QA aborts every non-localhost request.
- **Hang handling:**
  - The queue script had a hang branch: on timeout (rc 124/137), kill only the Chrome-for-Testing PIDs that did not exist
    before the capture, then retry once.
  - `/journal/jqodqrfdpw` never hung. The observer itself exited with **rc=1** (`page.goto` load timeout 45 s), so no cleanup
    was needed. It was retried **once** as a separate job at the end of the browser chain (`retry-queue`, 09:18 UTC), failed
    the same way (rc=1), and was recorded **BLOCKED** (`logs/queue.log` lines 43–47).
  - nav-map harness: one restart; only its own PIDs were killed (chain bash, its node, its headless shell). Recorded in the
    session transcript, not in `logs/`.
  - no user Chrome / Cursor / other process was touched
- **Privacy and network:**
  - fresh anonymous context, no login, no form submission, no review/inquiry entry
  - the interaction/probe harnesses abort every first-party non-GET/HEAD/OPTIONS request and hook `window.open`
  - no request headers, cookies, `Authorization` or request bodies are stored; URL secrets are redacted
  - JSON response bodies are DEFAULT-ON (policy)
  - exception, the Source Package observer: it does not block the source's view-count POSTs (see `10` §1, `12` G15)

## 1. Level B/C Source Package captures (`pnpm observe <url> --source-package --no-layout-probe`)

Desktop 1440 (DPR 1) + mobile 390 (DPR 3), both captured in every run. Columns per viewport:
network entries / captured bodies / first-party API GET / first-party API POST / API JSON bodies captured.

| Page | Level | Run (`data/apartmentary.com/…`) | s | Desktop | Mobile | styles/scripts/assets (D) |
|---|---|---|---|---|---|---|
| `/portfolio?page=0` | C | `2026-09-18T08-28-29-279Z` | 57 | 86/16/1/0/1 | 91/16/1/0/1 | 13/19/71 |
| `/portfolio?page=1` | C | `2026-09-18T08-29-45-950Z` | 57 | 87/16/1/0/1 | 91/16/1/0/1 | 13/19/71 |
| `/` (JSON refresh) | C (reuse + refresh) | `2026-09-18T08-30-49-211Z` | 63 | 81/19/4/0/4 | 86/19/4/0/4 | 12/19/73 |
| `/journal` | B | `2026-09-18T08-31-15-826Z` | 26 | 57/17/2/0/2 | 62/17/2/0/2 | 12/19/42 |
| `/journal?page=1` | B | `2026-09-18T08-31-45-443Z` | 30 | 57/17/2/0/2 | 62/17/2/0/2 | 12/19/42 |
| `/service` | B | `2026-09-18T08-32-43-675Z` | 58 | 94/16/0/0/0 | 76/16/0/0/0 | 12/20/73 |
| `/faq` | B | `2026-09-18T08-33-12-575Z` | 29 | 55/15/0/0/0 | 56/15/0/0/0 | 12/19/46 |
| `/brand` | B | `2026-09-18T08-34-05-117Z` | 53 | 78/19/1/0/1 | 72/18/1/0/1 | 12/22/63 |
| `/stores` | B | `2026-09-18T08-34-44-010Z` | 39 | 83/15/0/0/0 | 69/15/0/0/0 | 12/19/49 |
| `/terms` | B (structure) | `2026-09-18T08-35-32-494Z` | 48 | 53/16/1/0/1 | 55/16/1/0/1 | 13/19/36 |
| `/terms?termsType=PERSONAL_INFO` | B (structure) | `2026-09-18T08-36-08-435Z` | 36 | 53/17/2/0/2 | 57/17/2/0/2 | 13/19/36 |
| `/portfolio/jqodqijldp` (detail A) | C | `2026-09-18T08-36-39-411Z` | 27 | 170/46/0/3/3 | 194/46/0/3/3 | 12/43/48 |
| `/portfolio/bjqdfjoidl` | C | `2026-09-18T08-37-04-015Z` | 25 | 167/46/0/3/3 | 181/46/0/3/3 | 12/43/47 |
| `/portfolio/ibrdwqlfdq` (detail B) | C | `2026-09-18T08-37-31-968Z` | 28 | 170/46/0/3/3 | 189/46/0/3/3 | 12/43/47 |
| `/portfolio/woqdjqrldj` | C | `2026-09-18T08-37-58-818Z` | 26 | 173/46/0/3/3 | 195/46/0/3/3 | 12/43/49 |
| `/portfolio/bjqdfjoidl/images` | B | `2026-09-18T08-38-20-043Z` | 22 | 148/46/3/0/3 | 168/46/3/0/3 | 12/43/35 |
| `/journal/bjqdfkodlo` (native) | B | `2026-09-18T08-39-23-068Z` | 63 | 68/17/1/1/2 | 72/17/1/1/2 | 14/19/51 |
| `/journal/oipdkjrdwj` (native) | B | `2026-09-18T08-40-45-092Z` | 82 | 70/17/1/1/2 | 74/17/1/1/2 | 14/19/53 |
| `/journal/ibrdwjrdqw` (html-block) | B | `2026-09-18T08-41-41-763Z` | 56 | 67/17/1/1/2 | 71/17/1/1/2 | 15/19/66 |
| `/journal/kqidoildbf` (native) | B | `2026-09-18T08-42-46-752Z` | 65 | 70/17/1/1/2 | 76/17/1/1/2 | 14/19/53 |
| `/journal/jqodqrfdpw` (html-block) | B | **FAILED ×2 → BLOCKED** (`page.goto` load timeout 45 s, both attempts) | 48+48 | — | — | — |

Notes:
- **Screenshots and `__NEXT_DATA__`:** every successful run has a response HTML, runtime HTML, desktop + mobile screenshots
  and `__NEXT_DATA__`.
- **Detail POSTs are the source's own view counters,** not harness actions:
  - portfolio detail POST 3 per viewport
  - journal detail POST 1 per viewport
  - the observer records them (JSON bodies captured) but does not block them; see `10` §1
- **Fallback for `/journal/jqodqrfdpw`:**
  - Level A SSR fingerprint (§3)
  - a DOM-ready live observation (`interactions/interactions-followup.json`, scenarios `journal-html-block-dcl-*`; `07` §4)
  - the same body variant covered at Level B by `/journal/ibrdwjrdqw`
- **Capture time:** 22 attempts (20 successful URLs + 2 failed `jqodqrfdpw` attempts), about 16.5 min summed per-run time.

## 2. Faithful references (Level C preservation clones, `pnpm preserve:build`)

All under `data/apartmentary.com/preservation-clones/`.

| Clone | Source run | QA (desktop / mobile) |
|---|---|---|
| `2026-09-18T08-39-42-788Z` | portfolio `?page=0` | Δh 0 / 0; mismatch 0.00% / 0.03% (a pixel counts as a mismatch when its max channel difference is > 40) |
| `2026-09-18T08-39-50-607Z` | portfolio `?page=1` | Δh 0 / 0; 0.00% / 0.03% |
| `2026-09-18T08-39-58-786Z` | detail A `jqodqijldp` | Δh 0 / 0; 0.00% / ≤ 0.08% |
| `2026-09-18T08-40-04-730Z` | detail B `ibrdwqlfdq` | Δh 0 / 0; 0.00% / ≤ 0.08% |

Across all 8 renders: 0 broken images, 0 local 404s, 0 external attempts, 0 console errors, 0 live scripts. Method and full
table: `04` §7, `05` §6. Output: `clone-qa/clone-qa.json` + 16 clone/diff PNGs.

## 3. Level A (SSR fingerprints, no browser)

`level-a/ssr-fingerprints.json`:
- 84 anonymous `GET`s (node fetch, `redirect=manual`, no cookies, sequential 400 ms)
- per URL: status, `lang`, title/meta/OG/canonical/robots, `__NEXT_DATA__` page/gSSP/buildId/pageProps keys, heading counts, body markers

| Route family | Result |
|---|---|
| `/`, `/service`, `/faq`, `/brand`, `/stores`, `/parts`, `/arckit`, `/pb-brand`, `/inquiry`, `/inquiry/complete` | 200 |
| `/portfolio` (4 query variants), `/journal` (4), `/terms` (4) | 200 |
| `/portfolio/[id]` | 29 sampled ids → 200; invalid id → **307 → `/`** |
| `/portfolio/[id]/images` | 200 |
| `/journal/[id]` | all 15 live ids → 200 (including `jqodqrfdpw`); invalid id → **500** |
| pseudo-routes (`*/store`, `/store`, `/GlobalStore`, `*/useStore`) | 14 × **500** |
| `/404` | 404 |

Level A for external destinations (Kakao channel, greetinghr, sub-brand/HK hosts, Naver Smart Store, Typeform, social) is
**link-target only**: the destinations were recorded from code/DOM and not fetched (`01` §3).

## 4. Browser observation artefacts (sequential, after the captures)

| Artefact | Scope | Output |
|---|---|---|
| Nav map | desktop 1440 + mobile 390, from `/`; header, drawer (`#gnb`), footer. 22 desktop + 47 mobile click probes, each with URL / `window.open` / dialog delta. 0 mutations needed blocking. The mobile "drawer" list includes body/footer buttons behind the overlay (a harness artefact, excluded in `01`) | `nav/nav-map.json`, 19 shots |
| Responsive probe | 12 pages × 23 widths (360 → 2560, incl. breakpoint ±1 pairs 599/600, 899/900, 1199/1200, 1279/1280/1281, 1535/1536, 1919/1920); UA-dependence check at 390 | `responsive/responsive-probe.json`, 44 shots. `/journal/jqodqrfdpw` → load timeout (recorded) |
| Interactions, pass 1 | 19 scenarios, 55 steps (list filters/sort/pages, detail tabs/before-after/CTA, journal, FAQ, terms, stores, service, brand, home mobile floating CTA) | `interactions/interactions.json`, 73 shots, 24 JSON bodies (first-party API GET responses fired during interactions) |
| Interactions, follow-up | 23 scenarios, 40 steps: missed selectors from pass 1, stores/journal/brand/terms/FAQ dialogs and pagers, portfolio deep links, fresh-load width checks (900/1280), `jqodqrfdpw` DOM-ready observation. `fresh-w900-home` timed out on `load` (recorded, not retried) | `interactions/interactions-followup.json`, 22 more shots (95 total), 7 more JSON bodies (31 total). See `09` §2 |
| Clone QA | 4 clones × 2 viewports | `clone-qa/` |
| Network census / API table | from the Source Package network manifests | `network/api-table.json`, `network/census/` |
| Static code analysis | page chunks + `_app` (Sonnet subagents, read-only; Opus verified key claims live) | `static-analysis/*.md`, `bundles/` (copies of public page scripts; the one embedded client credential is redacted in the copy) |
| Harness scripts | the throwaway scripts that produced every artefact above (queues, Level A, nav map, probe, interactions, clone QA, tables) | `harness/` (a copy of `tmp/aco/`, which is git-ignored) |
