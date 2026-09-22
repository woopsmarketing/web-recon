# 02 — Phase 1 capture state (Q3)

Run `data/apartmentary.com/2026-09-16T05-27-10-722Z/`.

| Level | Status |
|---|---|
| A. URL/reference captured | **YES** — `document/response.html`, `runtime.html`, `dom.json`, `assets/manifest.json` (as0066 video, as0067 video-source) |
| B. request metadata captured | **YES** — desktop 4 records (n0028, n0039, n0058, n0059), mobile 2 (n0028, n0031): method, 206, headers (content-length, content-type `video/mp4`, etag, last-modified 2023-02-02), initiator, timing, `streamAborted: net::ERR_ABORTED` (normal media range-request cancellation) |
| C. response body captured | **NO** — every record: `body: {status:"skipped-by-policy", reason:"bodyPolicy.media=false"}` |
| D. local asset file exists | **NO** — no `*.mp4` / `*introduce*` file anywhere under `data/apartmentary.com`, `tmp/`, `docs/` |
| E. no body exists | **YES** |

**Verdict: PHASE 1 BODY CAPTURED = NO.** What was preserved instead: the absolute URL, the DOM element with all
attributes and geometry, request/response metadata (size 97,941,978 B, etag), and screenshots showing frames.

Note: the range pattern (`bytes=0-` then `bytes=1146880-`) was reproduced identically today; etag unchanged is not
re-verified (repro did not record etag) — the file served today had the same total length 97,941,978.
