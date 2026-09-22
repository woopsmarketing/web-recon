# 03 — Phase 2 history and visibility (Q4, Q5, §2)

## Phase 2 build decision (not a bug)

`preservation-clones/2026-09-16T06-42-28-282Z/residual-dependencies.json`:
`main-introduce.mp4` — `reason: over-size-budget`, `detail: captured Content-Length 97941978 > cap 8388608`,
`stillRequestedFromSource: true`. `desktop/index.html` and `mobile/index.html` keep
`<source src="https://apartmentary-static.s3…/main-introduce.mp4">` **unchanged (absolute, correct URL)**; no poster added.
`04-apartmentary-build.md:80-89` and `07-human-review-guide.md:64-67`: "deliberately still streams from S3 so a reviewer can see it".
(Those reports call it the "hero video"; it is actually this intro-section video — naming error only.)

So the Phase 2 artifact is **network-dependent by design** for this one element: not rewritten wrongly, not neutralized.

## Q5. Past visibility — **PROVEN**

`docs/result/source-preservation-phase2/screenshots/` (mtime 2026-09-16 15:42 local = the Phase 2 build/sanity run):

| File | Intro left region |
|---|---|
| `desktop-full.png` (1440×6056) | **video frame visible**: yellow panel with the large "A" letter, interior footage visible through the letterform, box 510×700 |
| `mobile-full.png` (390×4804) | **video frame visible**: yellow panel "Apartmentary" wordmark above the heading |

These are different frames from Phase 1 (animated), and no such image is a localized asset (the clone has no
`main-introduce*` file) → they can only come from the decoded MP4.

Produced by `pnpm preserve:sanity` (`scripts/preserve-sanity.ts`): project preview server
(`src/preservation-clone/serve.ts`), headless Playwright chromium, **no `context.route`, no CSP, no host-resolver rules**,
`goto` + 2500 ms settle. Page height 6056 = Phase 1 height (video at 510×700).
`pnpm preserve:preview` (the documented human-review path) is the same server, also no CSP/interception.

## Why the current "Phase 2 Baseline" is blank

The image labelled **"Phase 2 Baseline"** in the current QA viewer (`tmp/human-visual-qa/index.html:69`) is
**`runtime-experiments/2026-09-16T10-50-02-746Z/desktop-before.png`**, not a Phase 2 screenshot. It was taken by the
Strategy A harness (`tmp/source-preservation-phase3c/run.mjs:231`) under a fail-closed guard:
`--host-resolver-rules=MAP * ~NOTFOUND, EXCLUDE 127.0.0.1` (run.mjs:61) + `context.route("**/*")` → `route.abort("blockedbyclient")`
for non-local (`tmp/source-preservation-phase3b/lib/network-guard.mjs:49,101`).
Its `network-log.json` records the MP4 `decision: "blocked"`, `requestfailed net::ERR_BLOCKED_BY_CLIENT.Inspector`.
Pixel check of the video box (224,1026 → 734,1348): stddev 0, mean 255 = pure white. Page height **5678**.

Also: opening the clone live via `/clone/` in `tmp/human-visual-qa/server.mjs:28` sends
`Content-Security-Policy: … media-src 'self' data: …` → the S3 MP4 is CSP-blocked there too (by header inspection;
not executed in this task). `preserve:preview` has no such header.

## §2. Execution-mode matrix

| Mode | S3 MP4 | Visible? | Evidence |
|---|---|---|---|
| `preserve:sanity` headless Playwright, open network | allowed | **yes** | Phase 2 screenshots (retained) + repro arm A |
| `preserve:preview` + ordinary Chrome, online | allowed (no CSP) | yes (same server; not separately executed) | serve path identical to sanity; repro arm A |
| Strategy A / B harness (fail-closed) | blocked | **no** | network logs, pixel check, repro arm B |
| `tmp/human-visual-qa` `/clone/` (CSP `media-src 'self'`) | CSP-blocked | no (by policy) | server.mjs:28 |
| Phase 3C.1 live-QA (host-resolver NOTFOUND) | blocked | no | `source-preservation-phase3c1-live-qa/README.md` |
| `file://` direct open | not tested | — | — |

## Bounded reproduction (1 run, disposable)

Harness `tmp/source-preservation-intro-media-forensic/repro.mts` (sha256 `de7a4e8d…ab1e`); output `repro/repro-result.json`.
Same `startPreviewServer` as Phase 2, clone read-only, only local + the single MP4 URL may leave (all else aborted).

| | A desktop (MP4 allowed) | B desktop (MP4 blocked) | A mobile 390 |
|---|---|---|---|
| request | 206 `bytes=0-`, then 206 `bytes=1146880-` | blocked, `ERR_BLOCKED_BY_CLIENT.Inspector` | 206 ×2 |
| currentSrc | S3 URL | S3 URL | S3 URL |
| poster | null | null | null |
| readyState / networkState | **4 / 1** (already at 2500 ms) | **0 / 3** (NETWORK_NO_SOURCE) | 4 / 1 |
| paused / videoWidth×Height | false / 1020×1400 | true / 0×0 | false / 1020×1400 |
| box | 510×700 @ (224,1026) | **510×322** @ (224,1026) | 192.5×264.2 @ (20,710) |
| display / visibility / opacity | block / visible / 1 | block / visible / 1 | block / visible / 1 |
| pixels in box | mean (254,236,149) yellow, stddev 7 — frame painted | **(255,255,255) stddev 0** | mean yellow, stddev 24 |
| docHeight | **6056** (= Phase 2 screenshot) | **5678** (= Strategy A "baseline") | 4804 (= Phase 2 mobile-full) |

Heights match the retained artifacts exactly, so the two retained outcomes are fully explained by the network decision.
