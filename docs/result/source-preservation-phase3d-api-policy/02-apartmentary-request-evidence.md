# 02 — Apartmentary `/` request-family evidence (Phase 3D-A, read-only recovery)

Scope: recover what is already evidenced, in already-committed documents/JSON, about the
real (non-authenticated-UI-visible) API request families the Apartmentary `/` homepage
makes. Nothing here was fetched live. No network requests were made to produce this
report. Every claim below cites the source document/JSON it came from. Fields with no
evidence in the repo are marked `UNKNOWN`.

The evidence base is static: it comes from (a) read-only reading of the preserved minified
webpack chunks (`sc0025`/`_app`, `sc0027`/chunk 7925, `sc0028`/`pages/index`), (b) the
project's own network capture metadata (URLs, methods, counts — never bodies, never
request headers), and (c) two runtime-replay experiments (3C Strategy A, 3C.1 Strategy B)
that stubbed these four calls with synthetic fixtures and observed the boot/render
behaviour.

Four request families are evidenced. This matches the number the background section
named ("four known public-data request families"); the evidence base does not show a
fifth, and does not disprove one existing outside what was analyzed (see the "Unproven"
notes in the cited sources — the source bundle wires 12 total generated service clients,
of which only these 4 fire on this route).

---

## 1. `mainBanners` — hero carousel data

- **Diagnostic name**: `mainBanners` (name used verbatim in
  `docs/result/source-preservation-phase3c/data-contract.json` and
  `docs/result/source-preservation-phase3c/02-synthetic-fixtures.md`)
- **HTTP method**: `GET` — `docs/result/source-preservation-phase3a/04-source-bound-and-api.md` (table, row 1); `docs/result/source-preservation-phase3a/runtime-graph.json:2270`
- **Origin**: `https://dev-api.apartmentary.com` — `docs/result/source-preservation-phase3a/04-source-bound-and-api.md` ("All first-party API traffic goes to one origin: **`dev-api.apartmentary.com`**"); `runtime-graph.json:2268`
- **Pathname**: `/api/v1/main-banners/action/get-displays` — `docs/result/source-preservation-phase3a/04-source-bound-and-api.md` (table); `docs/result/source-preservation-phase3c/data-contract.json` (`endpoints[0].requestMatcher.pathname`)
- **Query**: none (`{}`) — `docs/result/source-preservation-phase3c/data-contract.json` (`endpoints[0].requestMatcher.query = {}`)
- **Request body**: none — GET request; no source mentions a request body for this call.
- **Content-type** (request or response): UNKNOWN — not evidenced anywhere in the cited sources. Phase 1's capture policy never read request headers and never captured this response body (`bodyPolicy.json = false`), so no content-type value for this specific call was ever recorded (`docs/result/source-preservation-phase3a/04-source-bound-and-api.md`, "those four response bodies were never captured"; `docs/result/source-preservation-phase1/02-source-package-schema.md:80`, "Request headers are never read").
- **Request headers relevant to auth/session**: an `Authorization: Bearer` header is added by a shared axios request interceptor wired onto all 12 generated service clients (`docs/result/source-preservation-phase3a/04-source-bound-and-api.md`: "`sc0027` additionally wires **12** generated service clients … onto one shared axios instance with an `Authorization: Bearer` request interceptor"). The token source is evidenced as `accessToken`, read from client storage/cookie, falling back to an empty string when absent: `docs/result/source-preservation-phase3c/data-contract.json:1029` — "axios instance adds Authorization Bearer from accessToken cookie/storage or \"\""; `docs/result/source-preservation-phase3a/runtime-graph.json:2263` — "accessToken read from client storage for Authorization header on every dev-api call (auth-bound, not just origin-bound)"; `docs/result/source-preservation-phase3a/05-replay-feasibility.md:137` calls it an "`accessToken` cookie read". In the one runtime replay that actually issued this call (against a stub), the `authorization` value observed was empty: `docs/result/source-preservation-phase3c/03-runtime-data-replay.md` (table, "API interceptions: 4/4 from fixtures" — `authorization: <empty>` for `mainBanners`).
- **Cookies/session dependence**: the Authorization header mechanism itself is cookie/storage-dependent per the citations above (an `accessToken` would be attached if present). Whether an anonymous request without that token succeeds, is degraded, or fails was never observed against the real API (the two replay experiments answered from local stubs, never contacting the real host — `docs/result/source-preservation-phase3c1-strategy-b/09-network-integrity.md`: "`B7_zeroApiCallsReachedSource: true`; all 4 API-origin requests were stub-fulfilled"). So: mechanism evidenced, real-server behavior UNKNOWN.
- **Initiator**: a React component (page-level, chunk `sc0028`, module labelled `G` in the recovered snippet) calls `mainBannerService.getDisplayMainBannersUsingGET()` (aliased `A`) inside a `useEffect(()=>{T();k();A()},[])` — an empty-dependency-array effect that also fires the two portfolio calls (see families 2–3 below). Evidence: `docs/result/source-preservation-phase3a/runtime-graph.json:1955-1961` (snippet `A=async()=>{await R.getDisplayMainBannersUsingGET();...y.mainBanners=t}; (0,c.useEffect)((function(){T(),k(),A()}),[])`); also `docs/result/source-preservation-phase3a/runtime-graph.json:1882-1894`.
- **When it occurs**: on mount, in "the first `useEffect` of that load" — no SSR/`__NEXT_DATA__` fallback exists for this data (`docs/result/source-preservation-phase3a/04-source-bound-and-api.md`: "these fetches fire in the first `useEffect` of that load"; also `runtime-graph.json:1998` — "`getServerSideProps` supplies ONLY the band-banner, promo popup and footer. It does NOT carry mainBanners, portfolios or reviews. The carousel data has no SSR source."). In the runtime-replay evidence this corresponds to boot/post-hydration-commit, not scroll or interaction (`docs/result/source-preservation-phase3c/03-runtime-data-replay.md`: data subtrees are "client-created", inserted between the commit point and settle).
- **Source component/data store consuming the response**: written directly into a MobX-observable store field `y.mainBanners` with no `||[]` fallback (`docs/result/source-preservation-phase3c/data-contract.json`: `"t=e.data.data,(0,I.z)((function(){y.mainBanners=t}))"`); consumed by the hero Swiper carousel component in `sc0028` (`docs/result/source-preservation-phase3a/runtime-graph.json:1629-1633`, "main banner (hero)" section mapping).
- **Existing synthetic fixture mapping**: yes — `fixture-main-banners-v1`, 9 items, 2,041 bytes, envelope `{data:[ITEM]}` (`docs/result/source-preservation-phase3c/02-synthetic-fixtures.md`; `docs/result/source-preservation-phase3c/synthetic-fixtures.json`; endpoint key `mainBanners` in `docs/result/source-preservation-phase3c/data-contract.json`).
- **User-specific/private vs fully public**: no direct evidence either way for the response content itself. The only related signal is architectural/organizational, not endpoint-specific: `docs/result/source-preservation-phase3a/07-phase3b-recommendation.md:24` states generically ("API responses can carry personal data, which is presumably why §12 excluded them") — this is a stated *rationale for a capture policy*, not a finding about this endpoint's actual data. The endpoint's own semantics (a homepage hero-banner list, called on every anonymous page load with no login gate observed anywhere in the boot flow) are consistent with public marketing content, but this is inference from usage context, not a proven fact from the evidence — flagged here as UNKNOWN per the report's instruction not to infer beyond what's written/coded.

---

## 2. `portfoliosArea1` — portfolio grid, bottom area 1

- **Diagnostic name**: `portfoliosArea1` (`docs/result/source-preservation-phase3c/data-contract.json`, `02-synthetic-fixtures.md`)
- **HTTP method**: `GET` — `docs/result/source-preservation-phase3a/04-source-bound-and-api.md`; `runtime-graph.json:2288`
- **Origin**: `https://dev-api.apartmentary.com` — same as family 1.
- **Pathname**: `/api/v1/portfolios/action/get-by-paging` — `docs/result/source-preservation-phase3c/data-contract.json` (`requestMatcher.pathname`); `docs/result/source-preservation-phase3a/runtime-graph.json:2285`
- **Query**: `count=10&isBottomArea1Display=true&page=0` — `docs/result/source-preservation-phase3a/04-source-bound-and-api.md` (table); `runtime-graph.json:2285`
- **Request body**: none — GET request.
- **Content-type**: UNKNOWN — not evidenced (same capture-policy gap as family 1).
- **Request headers relevant to auth/session**: same shared axios `Authorization: Bearer` interceptor as all four endpoints (`docs/result/source-preservation-phase3a/04-source-bound-and-api.md`; `docs/result/source-preservation-phase3c/data-contract.json:1029`). Observed replay value: `authorization: <empty>` (`docs/result/source-preservation-phase3c/03-runtime-data-replay.md`, table row `portfoliosArea1`).
- **Cookies/session dependence**: mechanism evidenced (accessToken cookie/storage → Bearer header), real-server behavior with/without it UNKNOWN (never contacted; `docs/result/source-preservation-phase3c1-strategy-b/09-network-integrity.md`: `B7_zeroApiCallsReachedSource: true`).
- **Initiator**: same page-level component and same `useEffect(()=>{T();k();A()},[])` as `mainBanners`; `T` is `portfolioService.getPortfoliosByPagingUsingGET1(10,...)` for area 1 (`docs/result/source-preservation-phase3a/runtime-graph.json:1894`, `:1961`, `:1645`). `docs/result/source-preservation-phase3a/04-source-bound-and-api.md` table also cites `sc0028 portfolioService @4723`.
- **When it occurs**: on mount / first `useEffect`, no SSR fallback (same citations as family 1; `runtime-graph.json:1998`).
- **Source component/data store consuming the response**: written to MobX field `y.firstPortfolios` (`n||[]` fallback) — `docs/result/source-preservation-phase3a/runtime-graph.json:1961`; rendered by "portfolio carousel #1" in `sc0028` at offset `@11514` (`runtime-graph.json:1643-1647`; corroborated by `docs/result/source-preservation-phase3a/04-source-bound-and-api.md` table, "portfolio grid 1").
- **Existing synthetic fixture mapping**: yes — `fixture-portfolios-area1-v1`, 10 items, 3,425 bytes, envelope `{data:{data:[ITEM]|null,totalCount}}` (`docs/result/source-preservation-phase3c/02-synthetic-fixtures.md`; `docs/result/source-preservation-phase3c/synthetic-fixtures.json`; `data-contract.json` endpoint key `portfoliosArea1`).
- **User-specific/private vs fully public**: UNKNOWN for the same reasons as family 1 — no endpoint-specific evidence; only the general, non-endpoint-specific rationale note in `docs/result/source-preservation-phase3a/07-phase3b-recommendation.md:24`.

---

## 3. `portfoliosArea2` — portfolio grid, bottom area 2

- **Diagnostic name**: `portfoliosArea2` (`docs/result/source-preservation-phase3c/data-contract.json`, `02-synthetic-fixtures.md`)
- **HTTP method**: `GET` — `docs/result/source-preservation-phase3a/04-source-bound-and-api.md`; `runtime-graph.json:2307`
- **Origin**: `https://dev-api.apartmentary.com` — same as family 1.
- **Pathname**: `/api/v1/portfolios/action/get-by-paging` (identical path to family 2, distinguished only by query) — `docs/result/source-preservation-phase3a/runtime-graph.json:2304`, `:2318` ("same generated call site as get-by-paging above, distinguished only by query param isBottomArea2Display").
- **Query**: `count=10&isBottomArea2Display=true&page=0` — `docs/result/source-preservation-phase3a/04-source-bound-and-api.md` (table); `runtime-graph.json:2304`
- **Request body**: none — GET request.
- **Content-type**: UNKNOWN — not evidenced.
- **Request headers relevant to auth/session**: same shared `Authorization: Bearer` interceptor (`docs/result/source-preservation-phase3a/04-source-bound-and-api.md`; `docs/result/source-preservation-phase3c/data-contract.json:1029`). Observed replay value: `authorization: <empty>` (`docs/result/source-preservation-phase3c/03-runtime-data-replay.md`, table row `portfoliosArea2`).
- **Cookies/session dependence**: same as family 2 — mechanism evidenced, real-server behavior UNKNOWN.
- **Initiator**: same page-level component/effect as families 1–2; `k` is `portfolioService.getPortfoliosByPagingUsingGET1(10,...)` for area 2 (`docs/result/source-preservation-phase3a/runtime-graph.json:1894`, `:1961`, `:1652`).
- **When it occurs**: on mount / first `useEffect`, no SSR fallback (same citations as family 1).
- **Source component/data store consuming the response**: written to MobX field `y.secondPortfolios` (`docs/result/source-preservation-phase3a/runtime-graph.json:1961`); rendered by "portfolio carousel #2" in `sc0028` at offset `@14541` (`runtime-graph.json:1649-1654`; `04-source-bound-and-api.md` table, "portfolio grid 2"). Note the two areas' price-bucket rendering differs by comparison operator (`<` vs `<=`) per `docs/result/source-preservation-phase3c/01-data-contract.md`, but this is a display detail, not a request-shape difference.
- **Existing synthetic fixture mapping**: yes — `fixture-portfolios-area2-v1`, 4 items, 1,390 bytes, same envelope as area 1 (`docs/result/source-preservation-phase3c/02-synthetic-fixtures.md`; `synthetic-fixtures.json`; `data-contract.json` endpoint key `portfoliosArea2`).
- **User-specific/private vs fully public**: UNKNOWN, same basis as family 1.

---

## 4. `reviews` — customer review carousel

- **Diagnostic name**: `reviews` (`docs/result/source-preservation-phase3c/data-contract.json`, `02-synthetic-fixtures.md`)
- **HTTP method**: `GET` — `docs/result/source-preservation-phase3a/04-source-bound-and-api.md`; `runtime-graph.json:2326`
- **Origin**: `https://dev-api.apartmentary.com` — same as family 1.
- **Pathname**: `/api/v1/reviews/action/get-by-paging` — `docs/result/source-preservation-phase3c/data-contract.json` (`requestMatcher.pathname`); `runtime-graph.json:2323`
- **Query**: `count=6` — `docs/result/source-preservation-phase3a/04-source-bound-and-api.md` (table); `runtime-graph.json:2323`
- **Request body**: none — GET request.
- **Content-type**: UNKNOWN — not evidenced.
- **Request headers relevant to auth/session**: same shared `Authorization: Bearer` interceptor (`docs/result/source-preservation-phase3a/04-source-bound-and-api.md`; `docs/result/source-preservation-phase3c/data-contract.json:1029`). Observed replay value: `authorization: <empty>` (`docs/result/source-preservation-phase3c/03-runtime-data-replay.md`, table row `reviews`).
- **Cookies/session dependence**: same as the other three families — mechanism evidenced, real-server behavior UNKNOWN.
- **Initiator**: a *separate* component (labelled `X` in the recovered code, distinct from the `mainBanners`/portfolios component `G`) calls `reviewService.getReviewsByPagingUsingGET1(6,...)` inside its own `useEffect(()=>{...},[])` — evidence: `docs/result/source-preservation-phase3a/runtime-graph.json:1888-1889` (snippet: `A=z.ZP.reviewService, ... (0,c.useEffect)((function(){A.getReviewsByPagingUsingGET1(6,void 0,void 0,void 0,void 0,void 0).then(...)}),[])`, noted "review fetch in useEffect writing into a mobx store"). Also `docs/result/source-preservation-phase3a/04-source-bound-and-api.md` table: `sc0028 reviewService @1932 → getReviewsByPagingUsingGET1 @2084`.
- **When it occurs**: on mount / first `useEffect` of the review component; no SSR fallback (`docs/result/source-preservation-phase3a/runtime-graph.json:1998`).
- **Source component/data store consuming the response**: written to a MobX store field `this.reviews` / `n.reviews` (`n||[]` fallback) on a store instance distinct from the portfolios/banner store (`docs/result/source-preservation-phase3a/runtime-graph.json:1888-1889`, `:2338` — "sc0028: `k=function e(){...this.reviews=[]...}` store consumed by review section component"); rendered by the review carousel component (`docs/result/source-preservation-phase3a/04-source-bound-and-api.md` table, "review carousel"; `runtime-graph.json:1636-1640`).
- **Existing synthetic fixture mapping**: yes — `fixture-reviews-v1`, 6 items, 949 bytes, envelope `{data:{data:[ITEM]|null}}` (`docs/result/source-preservation-phase3c/02-synthetic-fixtures.md`; `synthetic-fixtures.json`; `data-contract.json` endpoint key `reviews`). Fields consumed: `text`, `customerName` only (`docs/result/source-preservation-phase3c/01-data-contract.md`, "Review item" table — "No review image fields exist; section images are bundled static files.").
- **User-specific/private vs fully public**: UNKNOWN for the response's true origin/authorization semantics (same basis as family 1). One distinguishing note: the review item includes a `customerName` field rendered verbatim as `{name} 님` (`docs/result/source-preservation-phase3c/01-data-contract.md`, "Review item" table) — i.e., the *response content itself* names real customers if populated from production data, which is a content-privacy consideration distinct from (and not resolved by) the request's own auth/session shape. No source evidences whether this specific field is treated as personal data by the operator; it is reported here only because the field's presence is directly evidenced, not to draw a classification conclusion (out of scope per the task).

---

## Cross-cutting evidence (applies to all four families)

- **Shared client/mechanism**: all four calls run through one axios instance built by an OpenAPI-generator `typescript-axios` client, with the effective `basePath` (`https://dev-api.apartmentary.com`) supplied by chunk 7925 (`sc0027`) and a default-only literal in `_app` (`sc0025`) that is overridden by it. `docs/result/source-preservation-phase3a/04-source-bound-and-api.md` ("Base URL configuration: two literals, one origin").
- **No captured response bodies exist anywhere in the evidence** for any of the four, by Phase 1 capture policy (`bodyPolicy.json = false`, §12 of the Source Package design). `docs/result/source-preservation-phase3a/04-source-bound-and-api.md` ("The blocker: those four response bodies were never captured"); `docs/result/source-preservation-phase1/04-apartmentary-capture.md` (§3 table: "8 API/data responses (incl. the 4 `dev-api.apartmentary.com` hydration calls …) | metadata only | Task §12: API bodies are never stored automatically.").
- **No request headers were ever captured/read for any network call, by policy** (project-wide, not endpoint-specific): `docs/result/source-preservation-phase1/02-source-package-schema.md:80` ("Request headers are never read."); `docs/result/source-preservation-phase1/01-current-capability-map.md:36` ("No cookie/authorization capture anywhere; … 'Observation sends no cookies, auth headers, or API keys'"). This is why every "request headers"/"content-type" field above is UNKNOWN except what static code reading of the bundles independently recovered (the Authorization-interceptor mechanism itself).
- **The real API was never contacted in any of the runtime experiments that exercised these four calls** — both Strategy A (3C) and Strategy B (3C.1) intercepted and stub-fulfilled all four from local synthetic fixtures: `docs/result/source-preservation-phase3c/03-runtime-data-replay.md` ("API interceptions: 4/4 from fixtures"); `docs/result/source-preservation-phase3c1-strategy-b/09-network-integrity.md` ("The real Apartmentary API was never contacted (`B7_zeroApiCallsReachedSource: true`)"). So nothing in this evidence base observed a real response, real headers, or real auth behavior — only the client-side code paths and synthetic stand-ins.
- **Dormant siblings**: the same generated client registry exposes 12 services total (band, popup, footer, news, brand, journal, terms, store, logging, review, portfolio, mainBanner); only these 4 calls (reviews, portfolio ×2, mainBanner) fire on the homepage route. `docs/result/source-preservation-phase3a/04-source-bound-and-api.md`; `runtime-graph.json:2261`.
- **No `__NEXT_DATA__`/SSR fallback for any of the four.** `getServerSideProps` supplies only band-banner, promo popup, and footer data — not these four. `docs/result/source-preservation-phase3a/runtime-graph.json:1998`.

## Biggest open UNKNOWN

Nothing in the evidence base ever observed a real response from `dev-api.apartmentary.com`
— no body, no response headers (including `content-type`), no confirmation of whether an
absent/empty `Authorization` header (the observed default in every replay) is accepted,
rejected, or silently degrades the four responses in production, and no confirmation
either way of whether any of the four families' data is user-specific/private versus fully
public. All four capture policies (`bodyPolicy.json=false` for bodies, "request headers
are never read" for headers) were deliberate, project-wide, and pre-date this report; nothing
in Phase 3A/3C/3C.1 relaxed them.
