# 05 — Root cause and verdict

## PRIMARY VERDICT: `INTRO_MEDIA_REMOTE_DEPENDENCY_WORKED_ONLY_WHEN_NETWORK_AVAILABLE`

The left visual is a poster-less `<video>` whose only source is the remote S3 MP4. Phase 1 never stored its body
(policy), Phase 2 deliberately left it remote (98 MB > 8 MB cap). It therefore renders iff the viewing environment
allows the outbound S3 request.

### Secondary contributors
1. `INTRO_MEDIA_BODY_NOT_CAPTURED` — Phase 1 `bodyPolicy.media=false`; no local bytes anywhere (enabling condition).
2. **No poster** in source → zero fallback paint when bytes are missing; box also shrinks 700→322 px (layout shift of the page, 6056→5678).
3. **Mislabelled comparison image**: the QA viewer's "Phase 2 Baseline" is Strategy A's fail-closed pre-execution screenshot, not the Phase 2 sanity screenshot.
4. Report naming: Phase 2 docs call this "hero video"; it is the intro-section video.

### Rejected causes (with evidence)
wrong URL rewrite (URL byte-identical to source) · neutralized (video is plain markup, not script) · autoplay policy
(played headless, readyState 4) · AOS/visibility (no AOS on video branch; display/visibility/opacity normal) ·
load timing (readyState 4 already at 2500 ms) · different media (`INTRO_MEDIA_IS_NOT_MAIN_INTRODUCE_MP4` rejected, 01).

## PAST PHASE 2 VISIBILITY: **PROVEN**

Artifact: `docs/result/source-preservation-phase2/screenshots/desktop-full.png` and `mobile-full.png`
(2026-09-16 15:42 local, `preserve:sanity` on clone `2026-09-16T06-42-28-282Z`).

### Causal sequence

```
Phase 2 (preserve:sanity / preserve:preview, open network)
→ clone keeps <source src="https://apartmentary-static.s3…/main-introduce.mp4"> (over-size-budget residual)
→ no route guard, no CSP → S3 returns 206 video/mp4 (97,941,978 B, range)
→ readyState 4, 1020×1400 decoded, autoplay muted plays
→ frame painted in 510×700 left box (page 6056 px)          = VISIBLE THEN

Strategy A "Phase 2 Baseline" / Strategy B / CSP QA viewer (fail-closed)
→ same <video>/<source> element present, same URL, same left position
→ host-resolver NOTFOUND + route.abort (A/B) or CSP media-src 'self' (viewer) blocks S3
→ ERR_BLOCKED_BY_CLIENT, readyState 0, networkState 3, no bytes, no poster
→ transparent 510×322 box on white (page 5678 px)             = MISSING NOW
```

The user's memory is correct; nothing about the clone changed — only the execution environment's network policy.

## FIX NEEDED LATER: **YES** (for source-independent / fail-closed replay)
Options for a later phase (not done here): capture media bodies (or a bounded transcode/first-segment) under an explicit
media policy, or preserve a poster frame; and relabel the QA "Phase 2 Baseline". Decision belongs to the next phase.
