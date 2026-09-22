# Phase 3C.1 Human Visual QA Viewer

Disposable, local-only, read-only viewer to compare the frozen Phase 3C/3C.1 screenshots side by side. Not a production feature.

- Directory: `tmp/human-visual-qa/` (`server.mjs` — plain Node http, no deps; `index.html`)
- Start: `node tmp/human-visual-qa/server.mjs` (port 4173, auto-increments if taken; `PORT=` override)
- URL: http://localhost:4173

## Sections
1. Desktop full page — Phase 2 `desktop-before` / Strategy A `desktop-synthetic` / Strategy B `desktop-strategy-b`
2. Desktop footer — `footer-before` / `footer-synthetic` / `footer-b3` + expected-result note + opacity overlay (Phase 2 vs B)
3. Mobile — `mobile-synthetic` / `mobile-strategy-b` + link to Phase 2 clone `mobile/` (and `desktop/`)
4. Mobile footer — `mobile-strategy-b` / `footer-b4-mobile`
5. Diagnostic (collapsed) — `desktop-ssr-before`, `footer-b0`

Features: zoom 50/75/100%, 2/3-column toggle, synced scroll, click to open full-res, full relative paths, checklist persisted in localStorage.

## Safety
- Server exposes only the two experiment run dirs and the Phase 2 clone dir; GET/HEAD only; path traversal returns 404/403.
- Clone is served with CSP `script-src 'none'; connect-src 'none'; default-src 'self'` → no scripts, no outbound requests (headless check: 0 external requests, 0 page errors).
- Screenshot files: 11/11 found, 0 missing.
- SHA-256 of all 143 files under the two runs + the clone identical before/after.
