# 00 — Phase 3D-A recon summary

**Phase 3D-A — Public API capture/replay evidence recon. READ-ONLY. No architecture decision, no
implementation, no real API body ever fetched.** This directory is evidence for Phase 3D-B (design)
to consume; it is not itself a policy and does not change milestone status
(`docs/status/source-preservation-v2.md` stays as-is — see that file for the authoritative "Next: Phase
3D" note).

Detail lives in the sibling files:

- [`01-existing-capture-system.md`](./01-existing-capture-system.md) — what Phase 1's `src/source-package/`
  actually implements for request/response observation, and what's reusable vs. missing for capturing
  real public API bodies.
- [`02-apartmentary-request-evidence.md`](./02-apartmentary-request-evidence.md) — the four known
  Apartmentary `/` public-data request families, recovered from retained evidence only.
- [`03-existing-synthetic-replay.md`](./03-existing-synthetic-replay.md) — exactly how Phase 3C /
  3C.1 intercepted requests and served synthetic fixtures during the boot experiments.
- [`04-open-policy-decisions.md`](./04-open-policy-decisions.md) — the unresolved questions Phase 3D-B
  must decide, separated into FACT / EXISTING BEHAVIOR / UNKNOWN / DECISION REQUIRED.

## Current capture foundation, in one paragraph

Phase 1's `SourceRecorder` (`src/source-package/recorder.ts`) already observes every request/response
Playwright sees — timing, status, an allowlisted set of response headers, sha256-hashed bodies, CDP-based
initiator evidence — through a generic listener loop that does not discriminate by resource type. It
already classifies API-shaped traffic (`classifyRequest()` → `API_DATA`/`apiLike`) and already redacts
secrets in URLs and window-global config. The one load-bearing fact that blocks everything downstream:
**`bodyPolicy.json` defaults to `false`**, so JSON response bodies — the shape real public API
responses take — are always `skipped-by-policy`. This has been true since Phase 1 and was already
identified as the Phase 3 blocker in `docs/result/source-preservation-phase3a/04-source-bound-and-api.md`.
No captured real API body exists anywhere in the repository's evidence.

## Apartmentary requests recovered

Four families, all evidenced, all `GET https://dev-api.apartmentary.com`, all fired mount-time from a
`useEffect` with no SSR/`__NEXT_DATA__` fallback, all already mapped to a hand-authored synthetic fixture:

| name | pathname | query | consumer |
|---|---|---|---|
| `mainBanners` | `/api/v1/main-banners/action/get-displays` | none | hero carousel |
| `portfoliosArea1` | `/api/v1/portfolios/action/get-by-paging` | `count=10&isBottomArea1Display=true&page=0` | portfolio grid 1 |
| `portfoliosArea2` | `/api/v1/portfolios/action/get-by-paging` | `count=10&isBottomArea2Display=true&page=0` | portfolio grid 2 |
| `reviews` | `/api/v1/reviews/action/get-by-paging` | `count=6` | review carousel |

All four go through one shared axios instance with an `Authorization: Bearer <accessToken or "">`
interceptor; the observed value in both replay experiments was empty. **No real response from
`dev-api.apartmentary.com` was ever observed** — no body, no response headers, no confirmation of
public-vs-user-specific data, no confirmation of real behavior with an absent/empty token. See
`02-apartmentary-request-evidence.md` for full per-family citations and the "Biggest open UNKNOWN"
section there.

## Existing replay mechanism

Phase 3C / 3C.1's synthetic-data experiments used a single reused Playwright
`context.route("**/*", ...)` fail-closed guard (`tmp/source-preservation-phase3b/lib/network-guard.mjs`)
matching `method + origin + exact pathname + subset-of-query-params`, fulfilling matches from
hand-authored fixture JSON, and hard-aborting (`route.abort("blockedbyclient")`) everything else — the
abort branch *is* the "no real network escapes" enforcement, not a separate check. This entire mechanism
lives under `tmp/source-preservation-phase3*/`; grep confirmed **none of it exists in `src/` or `scripts/`**.
The matcher contract shape, the CORS-correct response construction, and the fail-closed-by-default
posture look reusable in shape; the fixture content, harness orchestration, and hard-coded local file
server are explicitly experiment-only. See `03-existing-synthetic-replay.md`.

## What this recon does NOT do

- Does not decide what counts as "public" for capture eligibility.
- Does not decide whether/how to capture real API bodies.
- Does not decide replay-miss semantics, response-header policy, or body size limits for a real system.
- Does not fetch, has not fetched, and will not fetch any real response from `dev-api.apartmentary.com`
  or any other live endpoint.

Those are Phase 3D-B's job. The open questions are enumerated in `04-open-policy-decisions.md`.

## Final status

PHASE 3D-A RECON COMPLETE. Milestone status in `docs/status/source-preservation-v2.md` is left
unchanged (Phase 3D remains "design only, not started" there) — this recon is an input to 3D-B, not a
phase completion.
