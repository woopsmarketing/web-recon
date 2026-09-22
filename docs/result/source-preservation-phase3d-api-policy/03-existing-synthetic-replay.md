# 03 — Existing synthetic data replay mechanism (read-only forensic)

Scope: Phase 3D-A. This document is a **factual inventory** of how Phase 3C and Phase 3C.1 ("Strategy B")
intercepted network requests and supplied synthetic fixtures. It makes no architecture decision and
proposes no replacement design. Every claim below cites a doc section or a `file:line`. Anything not
evidenced is marked **UNKNOWN**.

## 1. Request interception location

**Mechanism: Playwright `BrowserContext.route("**/*", handler)`** (browser-level request routing), not a
fetch monkey-patch and not a service worker.

- Implemented once, generically, in `tmp/source-preservation-phase3b/lib/network-guard.mjs:45-115`,
  function `installNetworkGuard(context, { localOrigin, stubs, gate, phase })`.
- Phase 3C's summary calls this "the same fail-closed guard" and Phase 3C.1's summary calls it "the
  unchanged reviewed 3B guard" — i.e. the file is not duplicated or forked per phase, it is imported/reused
  as-is (`docs/result/source-preservation-phase3c/07-network-and-integrity.md:5`;
  `docs/result/source-preservation-phase3c1-strategy-b/09-network-integrity.md:2-8`).
- Additionally, `context.routeWebSocket(/.*/, ...)` is used to fail-closed all WebSocket connections
  (`network-guard.mjs:107-112`).
- A **separate** mechanism exists for serving local static/synthetic files: a plain Node `http.createServer`
  in `tmp/source-preservation-phase3b/lib/server.mjs:8-60+`, which serves the experiment document, an
  evidence-built root-relative `pathMap` (scripts, fonts, the 46 synthetic PNGs), and a read-only static
  root, logging the sha256 of bytes actually sent. This is the **local origin** that `network-guard.mjs`
  always allows through (`origin === localOrigin` → `route.continue()`, `network-guard.mjs:71-79`). It is
  not itself request "interception" of the source app's calls — it is the thing the browser is pointed at.
- Fixture bodies themselves (the JSON payloads) are built by
  `tmp/source-preservation-phase3c/lib/synthetic-fixtures.mjs`, specifically `fixturesToStubs(contract,
  fixtures)` (`synthetic-fixtures.mjs:71-87`), which converts a `{contract, fixtures}` pair into the
  `{label, method, origin, pathname, query, body, fixtureId, responseBytes, itemCount}` stub shape the
  guard consumes. This file is described in the docs as the "replay mechanism (experiment only)"
  (`docs/result/source-preservation-phase3c/02-synthetic-fixtures.md:60-66`).
- Phase 3C's own experiment script wires the two together: `stubs = fixturesToStubs(contract,
  fixtureSet)` then passes `stubs` into the guard installer (`tmp/source-preservation-phase3c/run.mjs:33`,
  `:85`). Phase 3C.1 reuses the identical fixture/contract files unchanged
  (`docs/result/source-preservation-phase3c1-strategy-b/00-summary.md`, Q5: "Phase 3C fixtures reused
  unchanged? Yes... byte-identical to A's frozen copies").

## 2. Matcher mechanism

Exact function: `matchStub(stubs, url, method)` in `network-guard.mjs:10-25`.

Matching is **not** a URL-pattern/regex match. It is a structured, ordered equality check:

1. Parse the request URL. If it fails to parse, no match (`network-guard.mjs:12-16`).
2. `u.origin !== s.origin || u.pathname !== s.pathname` → reject (exact string equality on origin and
   pathname; `:18`).
3. For every key/value pair in the stub's `query` object, `u.searchParams.get(k) === v` must hold for
   **all** pairs (exact string equality per query param; extra query params on the request that aren't in
   `s.query` are not checked, i.e. `s.query` is a required-subset match, not a full-query match; `:19-20`).
4. Method check: `OPTIONS` always passes through to the stub (for CORS preflight), otherwise
   `method === s.method` required (`:21`).
5. First stub in the array satisfying all of the above wins; iteration is in stub-array order
   (`:17` `for (const s of stubs)`).

So: **method + origin + exact pathname + subset-of-query-params match**, no wildcard/regex, no header or
body matching.

## 3. Endpoint matching rules (specifics)

The stub's `origin`/`pathname`/`query`/`method` come straight from the recovered data contract's
`requestMatcher` per endpoint (`synthetic-fixtures.mjs:78-80`; contract shape documented in
`docs/result/source-preservation-phase3c/01-data-contract.md:17-26`, `data-contract.json`). For this
site's four endpoints, matching was effectively:

| endpoint | method | origin | pathname | query keys matched |
|---|---|---|---|---|
| `mainBanners` | GET | `https://dev-api.apartmentary.com` | `/api/v1/main-banners/action/get-displays` | (none documented as required beyond path) |
| `portfoliosArea1` | GET | same | `/api/v1/portfolios/action/get-by-paging` | `count=10`, `isBottomArea1Display=true`, `page=0` |
| `portfoliosArea2` | GET | same | same pathname | `isBottomArea2Display=true` (+ same count/page) |
| `reviews` | GET | same | `/api/v1/reviews/action/get-by-paging` | `count=6` |

(`docs/result/source-preservation-phase3c/01-data-contract.md:17-26`). The exact `query` object stored per
stub (used by `matchStub`) is **not reproduced verbatim in the docs**; the query-key values above come from
the contract's documented request strings, not from a direct read of `data-contract.json`'s
`requestMatcher.query` field — treat the literal JSON shape as UNKNOWN beyond what `01-data-contract.md`
states. Both portfolio endpoints share one pathname and are disambiguated only by the
`isBottomArea1Display` / `isBottomArea2Display` query flag, which is exactly what `matchStub`'s per-key
query loop is built to distinguish.

## 4. Response construction

Two response shapes, both inside the `network-guard.mjs` route handler:

- **OPTIONS preflight** (`:85-89`): `route.fulfill({ status: 204, headers: corsHeaders(request), body: "" })`.
- **Matched GET** (`:90-97`): `route.fulfill({ status: 200, headers: { ...corsHeaders(request),
  "content-type": "application/json; charset=utf-8" }, body: JSON.stringify(stub.body) })`.
- `corsHeaders(request)` (`:27-36`) builds `access-control-allow-origin` (echoes request `Origin` header or
  `*`), `access-control-allow-methods: GET, OPTIONS`, `access-control-allow-headers` (echoes the
  preflight's requested headers or `*`), `access-control-max-age: 0`, `vary: Origin`.
- Body is the fixture's JSON object (`stub.body`, sourced from `fixturesToStubs`'s `body: f.body`,
  `synthetic-fixtures.mjs:81`) serialized with plain `JSON.stringify`, matching the contract's declared
  envelope (`{data:[...]}` or `{data:{data:[...],totalCount}}` per
  `docs/result/source-preservation-phase3c/01-data-contract.md:21-26`).
- `authorization` header on the intercepted request was observed empty (`<empty>`) for all four calls in
  both 3C and 3C.1 (`docs/result/source-preservation-phase3c/03-runtime-data-replay.md:59-62`); the guard
  does not itself set or check an authorization value — it only records it via `pickHeaders`
  (`network-guard.mjs:84`, `:125-131`, redacting non-empty values as `<redacted-nonempty>`).
- Static/local files (scripts, fonts, the 46 synthetic placeholder PNGs) are **not** built by the route
  guard; they are served by the separate Node `http.createServer` in `server.mjs` with MIME types from a
  fixed extension table (`server.mjs:12-29`) and a sha256 logged per response for byte-identity proof.

## 5. Network guard relationship ("fail if real network escapes")

Yes — interception and the escape guard are **the same mechanism**, not two separate systems:

- `network-guard.mjs` policy is documented at the top of the file as three ordered rules (`:4-8`):
  1. local experiment origin → `route.continue()`;
  2. request matching a stub → fulfilled locally;
  3. **everything else → `route.abort("blockedbyclient")` and recorded** (`:100-101`).
- This is inherently fail-closed: anything that is neither the local origin nor a known fixture is
  aborted, never allowed to reach the real network. There is no separate "assert 0 escapes" runtime check
  distinct from this default-deny branch — the guard's default branch **is** the enforcement. Post-hoc
  validation (`check-result.mjs` in each phase) then recomputes "escaped outbound" from the recorded
  `network-log.json` decisions to confirm the count is 0
  (`docs/result/source-preservation-phase3c/07-network-and-integrity.md:63-73`;
  `docs/result/source-preservation-phase3c1-strategy-b/09-network-integrity.md:16-17`,
  `B8_zeroTrackerWidgetEscapes`).
- WebSockets are separately fail-closed via `context.routeWebSocket` closing every socket with code 1008
  (`network-guard.mjs:106-112`), since `context.route` does not cover WebSocket connections (comment at
  `:105`).
- A host-resolver-level backstop is layered on top, outside the guard file itself:
  `--host-resolver-rules=MAP * ~NOTFOUND, EXCLUDE 127.0.0.1`
  (`docs/result/source-preservation-phase3c/07-network-and-integrity.md:5-8`). This is a second,
  independent layer (DNS-level) — the docs describe it as configured but **"not independently exercised"**
  in the 3C run (`tmp/source-preservation-phase3c/run.mjs:465`, note field in the result JSON).

## 6. Replay miss behavior

Documented behavior for a request matching no stub and not the local origin: **`route.abort("blockedbyclient")`**
(`network-guard.mjs:100-101`), recorded in the decision log as `"blocked"`. There is no fallback to a
default/empty fixture and no pass-through — a miss is a hard network abort. Observed real instances of
this path: the hero background video request to
`https://apartmentary-static....s3.../main-introduce.mp4` was blocked this way in both 3C and 3C.1 (known,
expected residual — no fixture exists for it because it is not an API call in the recovered contract)
(`docs/result/source-preservation-phase3c/07-network-and-integrity.md:19-20`;
`docs/result/source-preservation-phase3c1-strategy-b/09-network-integrity.md:13`), and the runtime
preflight's own `https://example.com/` self-test probe was blocked identically in 3C.1
(`docs/result/source-preservation-phase3c1-strategy-b/09-network-integrity.md:13`).

There is a related "miss" concept at the fixture-authoring level, distinct from the runtime block above:
`check-result.mjs`'s `B5_allExpectedApiCallsAttempted` / `B6_allApiCallsInterceptedLocally` checks
(`tmp/source-preservation-phase3c/run.mjs:457-458`) validate, after the fact, that every configured stub
was attempted and that every attempted API-origin call was fulfilled locally with none left "unmatched"
(`apiUnmatched`, `run.mjs:441`) — i.e. the fixture set is checked for completeness against what the app
actually called, but this is a post-run consistency check, not a live fallback behavior.

## 7. Source JS relationship

**Generic at the HTTP layer — no dependency on specific webpack chunk internals for interception itself.**

- `network-guard.mjs` operates purely on the outgoing HTTP request (URL, method, headers) and knows
  nothing about how the request was produced (e.g. the generated axios client, specific chunk ids). Its own
  header comment states matching is "data-driven (origin + pathname + required query pairs)"
  (`network-guard.mjs:8`).
- The **fixture content and the four endpoint definitions** (paths, envelopes, field lists) do depend on
  source-JS-specific static analysis — the data contract was recovered by reading the specific minified
  chunks (`pages/index`, chunk 7925, `_app`) at cited byte offsets
  (`docs/result/source-preservation-phase3c/01-data-contract.md:7-12`). That knowledge lives in
  `data-contract.json` / `experiment-config.json`, which are inputs to the generic guard, not inside the
  guard's matching code.
- `synthetic-fixtures.mjs` itself is explicitly commented as "EXPERIMENT MECHANISM ONLY. Generic: endpoints,
  paths, field lists and bodies all come from the caller's contract/fixture files" (`synthetic-fixtures.mjs:1-5`).
- No source JS was patched or string-replaced to make interception work in either phase: "no source-JS
  change" (Phase 3C, `docs/result/source-preservation-phase3c/07-network-and-integrity.md:46-50`); "no
  source-JS patch, no string replacement and no React/useMediaQuery override" (Phase 3C.1,
  `docs/result/source-preservation-phase3c1-strategy-b/09-network-integrity.md:24-27`). The 9 scripts were
  served byte-identical to the runtime graph's sha256 in both phases.

## Grep results (repo-wide, excluding node_modules, `src/` and `scripts/` only)

Per the task's exact commands:

**`grep -rn "page.route\|route.fulfill\|route.continue\|page.on('request\|intercept" src/ scripts/`**
— matches exist, but none implement the 3C/3C.1 synthetic-fixture replay mechanism. They are unrelated,
generic Playwright route usages elsewhere in the production codebase:
- `src/interaction-explorer/safety-guards.ts:169` — `await route.continue();` (interaction-explorer's own
  network pass-through, unrelated to data fixtures).
- `src/responsive-qa/continuous/session.ts:119` — `route.fulfill({ status: 200, contentType:
  "text/css; charset=utf-8", body })` (injecting CSS for a responsive-QA probe, not API data).
- `scripts/smoke-source-package.ts:157-160` — `page.route(/^https:\/\/www\.youtube\.com\//, ...)` with
  `route.fulfill` returning a stub JS/HTML body (a YouTube-embed stub for a smoke test, unrelated to this
  site's API contract).
- All other hits are false positives on unrelated identifiers (`page.route` as a data-model field name in
  `src/regions/enablement.ts`, `src/content-injection/*`, `src/editor/panels.ts`, `scripts/smoke-*` —
  these are a `PagePlan.route` string property, not Playwright routing).

**`grep -rln "syntheticFixtures\|synthetic-fixtures\|dataContract\|data-contract" src/ scripts/`**
— **no matches.**

Conclusion of the grep check: the interception/replay logic described in this document lives **only** in
`tmp/source-preservation-phase3b/lib/network-guard.mjs`,
`tmp/source-preservation-phase3c/lib/synthetic-fixtures.mjs`, and the per-phase `run.mjs`/`prepare.mjs`
harness scripts under `tmp/source-preservation-phase3*/`. None of it has been promoted into `src/` or
`scripts/` as reusable production code. It is one-off experiment tooling, referenced only by its own
docs.

## Read-only assessment (not a decision)

### 1. Which parts are experiment-only

- The **fixture content itself**: hand-authored fictional data (`fixture-*-v1`), fictional labels
  (`FIXTURE …`, `테스트 리모델링 A01`), 46 flat-colour placeholder PNGs — tied to this one site's contract and
  explicitly disclaimed as "not a production API schema" (`docs/result/source-preservation-phase3c/01-data-contract.md:4`).
- The **harness scripts** (`prepare.mjs`, `run.mjs`, `check-result.mjs`, `experiment-config.json` per
  phase) — one-off orchestration for a single manual research run (specific viewport sequence, specific
  probes/instrumentation like `style-fidelity-probe.mjs`, `instance-probe.mjs`, `lifecycle-probe.mjs`,
  specific stand-ins like the inert `karrotPixel.track`), explicitly labeled "EXPERIMENT MECHANISM ONLY —
  not a deploy-time architecture" in the guard's own header comment (`network-guard.mjs:2-3`) and again in
  `synthetic-fixtures.mjs:2` and the docs (`docs/result/source-preservation-phase3c/02-synthetic-fixtures.md:60-66`,
  "This is Playwright routing for the experiment, **not** a deploy-time architecture").
- The **local static HTTP server** (`server.mjs`) with its hard-coded evidence `pathMap` built per-site by
  `build-contract.mjs`/asset-collection steps — specific to serving one frozen clone's files plus one
  fixture set.
- The **genericity guard / forbidden-site-string scan** used to reviewer-verify the harness stayed generic
  (`docs/result/source-preservation-phase3c1-strategy-b/09-network-integrity.md:90-94`) is itself a
  one-off audit tool for this experiment, not a shipped safeguard.
- The **document/bootstrap-base choice** (Strategy A vs Strategy B, i.e. which HTML document the runtime
  hydrates against) is an experiment variable under test, not settled tooling.

### 2. Which parts look reusable

- The **three-branch fail-closed routing policy shape** (local origin passthrough → data-driven stub match
  → default abort) in `network-guard.mjs` is a small, self-contained, already-generic module with no
  site-specific literals in its matching code — it takes `{localOrigin, stubs, gate, phase}` as pure
  configuration.
- The **matcher contract** (`{method, origin, pathname, query}` per stub, subset-of-query-params equality
  match) is a simple, explicit, inspectable shape that could inform a real capture/replay matcher, since it
  already separates "how a request is identified" from "what site it belongs to."
- The **stub → CORS-correct HTTP response construction** (`corsHeaders` + explicit status/headers/body
  triple for both OPTIONS and the real method) demonstrates the minimum response shape needed for a
  same-shape API replay to satisfy a generated axios/CORS client.
- The **fixture-vs-contract validation approach** (`validateFixturesAgainstContract`: every required field
  present and typed, no unconsumed fields, no undeclared envelope paths, item counts consistent with
  `totalCount`) is a generic, contract-driven validation function
  (`synthetic-fixtures.mjs:36-68`) whose *shape* (not its specific field lists) is decoupled from any one
  site.
- The **fail-closed-by-default posture plus after-the-fact escape accounting** (decision log → 0-escape
  assertion) is a reusable safety pattern: default-deny network with a structured audit trail, independent
  of whether the "allow" list is a synthetic fixture or a captured real response.
- The **existing production `page.route`/`route.fulfill` usages already in `src/` and `scripts/`**
  (`src/interaction-explorer/safety-guards.ts`, `src/responsive-qa/continuous/session.ts`,
  `scripts/smoke-source-package.ts`) show the codebase already has *some* precedent for browser-level route
  interception for unrelated purposes — a real capture/replay system would not be introducing an
  unfamiliar Playwright API to the codebase, though none of these are the same mechanism and none should be
  assumed reusable as-is without independent review.

These two lists are observations about mechanism shape and reuse potential only; no recommendation is made
about what Phase 3D/3E should build.
