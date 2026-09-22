# 04 — Open policy decisions for Phase 3D-B

Scope: this is a **list of unresolved questions**, not answers. Per Phase 3D-A's mandate, nothing here
is decided unless the repository already proves it (in which case it is marked FACT or EXISTING
BEHAVIOR, not DECISION REQUIRED). Every question is grounded in `01-existing-capture-system.md`,
`02-apartmentary-request-evidence.md`, and `03-existing-synthetic-replay.md` — see those files for
citations.

---

## 1. Eligibility / publicness

- **FACT**: Four request families are evidenced (`mainBanners`, `portfoliosArea1`, `portfoliosArea2`,
  `reviews`), all `GET dev-api.apartmentary.com`, all fired on an anonymous homepage load with no login
  gate observed anywhere in the boot flow, none backed by SSR (`getServerSideProps` supplies only
  band-banner/popup/footer).
- **EXISTING BEHAVIOR**: The current system makes no eligibility distinction at all — `bodyPolicy.json`
  is a single global boolean; there is no code path that classifies an individual endpoint as
  "public enough to capture."
- **UNKNOWN**: Whether any of these four endpoints ever returns user-specific data (no real response
  was ever observed). Whether any of the 8 dormant sibling services (band, popup, footer, news, brand,
  journal, terms, store, logging) fire on other routes with different eligibility characteristics.
- **DECISION REQUIRED**: What rule/test defines "eligible for public capture" — e.g. GET-only +
  empty/absent auth token + manual per-endpoint sign-off, vs. some automated heuristic. This recon
  supplies the raw facts; it does not propose the rule.

## 2. GET vs. read-like POST

- **FACT**: All four known Apartmentary families are `GET`. `classifyRequest()` already flags non-GET
  methods as contributing to `API_DATA` classification (`classify.ts:300-303`).
- **EXISTING BEHAVIOR**: `bodyPolicy` has no method-based branch. Request bodies (POST payloads) are
  never captured regardless of method — only byte length is kept.
- **UNKNOWN**: Whether Apartmentary or any future subject site has a read-like POST or GraphQL query
  that would need equivalent handling. Not evidenced either way in the current evidence base.
- **DECISION REQUIRED**: Whether Phase 3D/3E's initial scope is GET-only (matching the four known
  families exactly) or must also define a policy for read-like POST/GraphQL before it can be called
  general.

## 3. Auth/session disqualifiers

- **FACT**: All four calls go through one shared axios interceptor that attaches
  `Authorization: Bearer <accessToken from cookie/storage, or "">`. The observed value in both replay
  experiments (3C, 3C.1) was empty — but neither experiment ever contacted the real API, so this is the
  *client-side default*, not a proof of what an anonymous real request sends or how the server treats it.
- **EXISTING BEHAVIOR**: Phase 1's recorder never reads request headers or cookies at all, by design
  (`recorder.ts:19-24`) — a structural privacy boundary, not a filter. As built, it cannot currently
  observe whether a real captured request carried a non-empty token.
- **UNKNOWN**: Whether a real anonymous browser session (e.g. one with a stale `accessToken` from a
  prior visit) would ever send a non-empty token to these endpoints, and whether the real server's
  response differs with vs. without one.
- **DECISION REQUIRED**: What disqualifies a request from public capture (e.g. "skip/redact if a
  non-empty Authorization or session cookie was present"), and whether implementing that check requires
  deliberately, narrowly relaxing the current never-read-request-headers boundary — which is itself a
  privacy-relevant architecture change, not a mechanical one.

## 4. Sensitive response handling

- **FACT**: No response body has ever been captured for any of the four endpoints. The only existing
  rationale note in the repo (`docs/result/source-preservation-phase3a/07-phase3b-recommendation.md:24`)
  states generically that "API responses can carry personal data" as the reason bodies were excluded in
  Phase 1 — this is a stated rationale, not a finding about these specific endpoints.
- **EXISTING BEHAVIOR**: `SENSITIVE_QUERY_KEY_PATTERN`/`SENSITIVE_CONFIG_KEY_PATTERN` redact secrets in
  URLs and window-global config; nothing in the read files scans *JSON response body content* for
  sensitive fields.
- **UNKNOWN**: Real field-level contents of any of the four responses. One structural note: the
  `reviews` fixture schema includes a `customerName` field rendered as `{name} 님`, which — if the real
  endpoint returns real customer names — would be response-content PII distinct from any auth/session
  question. This is reported as an evidenced *field's existence*, not a classification of real data.
- **DECISION REQUIRED**: Whether/how to inspect or redact captured JSON body contents (e.g. a
  `customerName`-shaped field) before persisting, and what happens when such a field is detected (skip
  the endpoint, redact the field, or route to manual review).

## 5. Body size / content types

- **FACT**: JSON currently falls into the generic "other" bucket for size limits
  (`maxOtherBodyBytes` = 2 MiB per body, shared ~32 MiB running total also shared with font/image/media).
  There is no dedicated `maxJsonBodyBytes`/`maxTotalJsonBytes`.
- **EXISTING BEHAVIOR**: Enforcement is fail-fast on declared `content-length` before download, then
  re-checked against actual bytes after download, then against a running per-kind total — every skip is
  reported, nothing is silently truncated.
- **UNKNOWN**: Real payload sizes for any of the four endpoints (never observed).
- **DECISION REQUIRED**: Whether to add a dedicated JSON/API body cap distinct from the shared "other"
  bucket, and what values to use.

## 6. Request identity

- **FACT**: The existing experiment's matcher already needed more than the URL path alone — both
  portfolio endpoints share one pathname and are disambiguated only by an
  `isBottomArea1Display`/`isBottomArea2Display` query flag. Phase 1's own capture-side identity is
  per-entry (`n####` + arrival `seq`), with no POST body or request-header capture at all.
- **EXISTING BEHAVIOR**: The 3C/3C.1 matcher's identity tuple is `{method, origin, pathname, query}`
  with query treated as a required subset (extra request query params not in the stub are ignored).
- **UNKNOWN**: Whether any of the four endpoints' query space (e.g. pagination beyond what's been
  observed) could produce identity collisions under a subset-match rule.
- **DECISION REQUIRED**: What tuple constitutes "identity" for a captured-and-replayed real request in a
  production-facing system — the existing `{method, origin, pathname, query}` shape, a stricter
  full-query match, or something that also accounts for a request body once/if POST is in scope (§2).

## 7. Response snapshot structure

- **FACT**: `store.ts`'s existing manifest/blob pattern (`network/manifest.json` + sha-named blob files)
  already accepts arbitrary captured bytes and would place a captured JSON body at
  `network/n####.<sha12>.<ext>` today if `bodyPolicy.json` were enabled. The persisted network manifest
  is a flat array sorted `url, method, seq` — no per-endpoint index.
- **EXISTING BEHAVIOR**: The package-level `contentHash` rollup only walks styles and scripts
  (`capture.ts:1306-1310`), not network or config blobs — a captured API body's bytes would not currently
  feed the top-level integrity hash even though the bytes and their own `body.sha256` would be on disk.
- **UNKNOWN**: Nothing evidentiary beyond the above; this is primarily an open design question.
- **DECISION REQUIRED**: Whether a real capture/replay system needs a new snapshot structure (e.g.
  indexed by endpoint/fixture key, the way `data-contract.json`/`synthetic-fixtures.json` already are)
  rather than the existing flat, arrival-agnostic network manifest, and whether `contentHash` should be
  extended to cover it.

## 8. Safe replay headers

- **FACT**: The existing experiment's response construction sets only an explicit, minimal header set —
  computed CORS headers plus a hard-coded `content-type: application/json; charset=utf-8` — because the
  fixtures are hand-authored, not captured, so there was never a real header set to copy from.
- **EXISTING BEHAVIOR**: Phase 1's `SAFE_RESPONSE_HEADERS` allowlist (`content-type`, `cache-control`,
  `etag`, CORS-related headers, etc.) exists for general response capture, but was built for
  asset/style/script contexts, not validated against real API/JSON responses.
- **UNKNOWN**: What headers a real `dev-api.apartmentary.com` response actually sends for any of the
  four endpoints — no response headers were ever recorded for these calls in the retained evidence
  (content-type itself is UNKNOWN per `02-apartmentary-request-evidence.md`), so it is also unproven
  whether headers were skipped by the same policy gate as bodies or simply never quoted in the docs
  that were read.
- **DECISION REQUIRED**: Which headers should be captured, and of those, which are safe to replay
  verbatim vs. must always be synthesized (e.g. never forward `set-cookie`; decide on `cache-control`/
  `etag` passthrough vs. synthesis).

## 9. Replay miss / fail-closed semantics

- **FACT**: The existing experiment's documented miss behavior is a hard `route.abort("blockedbyclient")`
  with no fallback fixture and no pass-through — this abort branch is the same mechanism as the
  "zero real requests escape" guard, not a separate check.
- **EXISTING BEHAVIOR**: A post-hoc completeness check (`check-result.mjs`'s `B5`/`B6` assertions)
  validates, after each experiment run, that 100% of configured stubs were used and no API-origin call
  went unmatched — this is experiment-time QA, not a documented production fallback policy.
- **UNKNOWN**: Whether a system replaying *captured real data* (as opposed to hand-authored fixtures)
  should keep the identical hard-abort-on-miss policy, especially for query variants (e.g. pagination)
  not seen at capture time.
- **DECISION REQUIRED**: What miss/fail-closed semantics a real capture-based replay system should use —
  keep hard-abort, or define a different behavior (e.g. distinguishing "known endpoint, unseen params"
  from "entirely unknown endpoint").

## 10. Cross-origin support

- **FACT**: All four known families cross an origin boundary (`dev-api.apartmentary.com` vs. the app's
  own origin), so CORS preflight handling is already a hard requirement, not an edge case. The existing
  experiment guard already handles this (OPTIONS preflight fulfilled with computed `corsHeaders()`,
  Origin echoed).
- **EXISTING BEHAVIOR**: The experiment's CORS headers are synthesized (echo request `Origin`, `*`
  fallback for allow-methods/allow-headers) rather than copied from any real observed response, since no
  real response was ever captured.
- **UNKNOWN**: What CORS headers the real `dev-api.apartmentary.com` actually returns for these calls
  (never observed).
- **DECISION REQUIRED**: Whether a real-capture system should record and later replay the real observed
  CORS headers, or continue to synthesize them the way the experiment did, and whether cross-origin
  scope should stay single-origin (as evidenced) or explicitly support multiple API origins for future
  sites.

---

## Cross-cutting note

Nearly every "UNKNOWN" above traces back to the same root fact: **no real response from
`dev-api.apartmentary.com` has ever been observed** by any phase to date (`bodyPolicy.json = false` since
Phase 1; both runtime replay experiments stub-fulfilled all four calls locally and never contacted the
real host). Phase 3D-B's design questions are therefore mostly about *what to do once real capture is
enabled*, not about fixing anything currently broken — the passive-observation plumbing
(`01-existing-capture-system.md` §"What can be reused") is already in place and gated by one default
flag plus the gaps listed there (no dedicated size cap, no request-body/header capture, no
`contentHash` coverage, no replay mechanism in `src/`).
