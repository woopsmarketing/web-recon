# 04. Apartmentary capture — REAL measured counts

**Official capture (final, post-review code):** run `data/apartmentary.com/2026-09-15T11-38-46-603Z/`
Command: `pnpm observe https://apartmentary.com/ --source-package --no-layout-probe`
Packages: `viewports/desktop/source-package/` and `viewports/mobile/source-package/` (one package per viewport load; the mobile load is a second navigation).

Three live loads of the source were made in total, each with a stated reason:

| run | code state | why it exists | status |
|---|---|---|---|
| `2026-09-15T11-06-29-416Z` | pre-fix (started before the last patches were loaded; tsx compiles at process start) | **dry run**; exposed the four classification defects in `03-implementation.md` §6 | superseded — its packages contain raw beacon queries (review B1/M2); delete or ignore |
| `2026-09-15T11-21-33-175Z` | after §6 fixes, before the independent review | the task's ONE bounded capture | superseded — the reviewer proved raw `location`/initiator URLs and a Google `measurement/conversion` query with client ids and the capturing machine's UA fingerprint inside it |
| `2026-09-15T11-38-46-603Z` | after the review fixes (B1, M1–M6) | the reviewer gave the concrete reason the task requires for a re-run | **the numbers below** |

The two superseded packages hold no third-party personal data (the queries carry this headless browser's own GA client ids and fingerprint), but they do not meet the redaction contract; the safe action is `rm -r data/apartmentary.com/2026-09-15T11-06-29-416Z/viewports/*/source-package data/apartmentary.com/2026-09-15T11-21-33-175Z/viewports/*/source-package`. Nothing was deleted in this phase.

No Apartmentary-specific logic exists in the capture code (`grep -ri apartmentary src/source-package/` → nothing). Everything below is what generic code measured.

## 1. Counts (task §17 format)

| | desktop (1440×900) | mobile (390×844) |
|---|---|---|
| **initial document** | captured — 81,794 bytes, utf-8, HTTP 200, sha256 `95eb46dd…56f13b` | captured — same bytes, same sha256 |
| **runtime DOM** | captured — 137,259 bytes (`document/runtime.html`) | captured — 122,050 bytes |
| **initial-document witness (parse5)** | 14 scripts (8 inline), 2 stylesheet links, 5 `<style>`, 2 preloads | same |
| **styles: linked** | 2 (both same-origin `/_next/static/css/*.css`, bodies from the network response) | 2 |
| **styles: style tags (with text)** | 4 (2 emotion SSR `data-emotion`, 2 Next.js `data-href` inlined CSS) | 4 |
| **styles: CSSOM runtime (empty tag, insertRule)** | 3 (2 emotion, 1 styled-components) | 3 |
| **styles: raw bytes captured** | 6 of 9 (81,824 bytes authored) | 6 of 9 |
| **styles: CSSOM-serialized copies** | 6 (3,250 + 14,250 + 23,857 + 22,027 + 1,000 + 2,672 bytes) | 6 (mobile emotion runtime sheet is 10,795 bytes / 91 rules vs 23,857 / 178 on desktop; it varied by 2 rules between runs — state-dependent insertion) |
| **styles: unavailable** | 1 (an empty `data-emotion` tag with 0 rules — nothing exists to capture) | 1 |
| **styles: CSSOM rules / @media / custom props** | 677 rules, 43 `@media`, 3 `--*` declarations | 33 `@media` |
| **scripts: declared in document** | 21 (13 external + 8 inline by the witness; 14 external + 7 inline as counted at runtime, see §3) | 21 |
| **scripts: runtime-injected elements** | 9 (all third-party: GTM, gtag, Facebook Pixel ×4, Google Optimize, Naver, Channel Talk) | 9 |
| **scripts: runtime-loaded chunks (no element)** | 0 | 0 |
| **scripts: responses captured** | 12 bodies (9 same-origin Next.js chunks + Kakao SDK, Channel Talk plugin, Naver synchronizer) — 1,308,943 bytes | 12 |
| **scripts: skipped by policy** | 10 (analytics / tag-manager / ads providers, `bodyPolicy.analyticsScript=false`) | 10 |
| **scripts: unavailable** | 1 — `polyfills-*.js` (`nomodule`; modern Chromium never requests it) | 1 |
| **scripts: inline captured** | 7 (all initial-document) | 7 |
| **assets: images** | 41 (25 https, 16 `data:`) | 34 (25 https, 9 `data:`) |
| **assets: fonts** | 24 `@font-face` sources (23 https same-origin, 1 `data:`); 57 `FontFace` objects loaded | 24 / 57 |
| **assets: media** | 1 `<video>` + 1 `<source>` (97.9 MB MP4 by `content-length`, HTTP 206, inventory only) | same |
| **assets: SVG** | 0 inline `<svg>`; icons are `<img>`/`data:` | 0 |
| **assets: iframes** | 1 (no `src`, script-written → UNKNOWN) | 1 |
| **assets: link icons/manifest** | 4 | 4 |
| **network: total** | 80 (0 failed, stream-aborted after 2xx are marked, 0 overflow) | 87 |
| **network: static** (DOCUMENT+CSS+JS_CHUNK+FONT+IMAGE+MEDIA) | 54 | 58 |
| **network: API/data** | 8 (4 `dev-api.apartmentary.com` hydration calls — same-site, query kept; Channel Talk boot ×2, Naver, Daum — site-external, query dropped) | 8 |
| **network: analytics / embed** | 17 / 1 (the two Google `measurement/*` calls are now ANALYTICS with `queryDropped`) | 20 / 1 |
| **network: third-party / same-origin** | 59 / 21 | 67 / 20 |
| **network: child-frame entries** | 6 (metadata only) | 7 |
| **network: bodies captured** | 14 | 14 |
| **config** | 6: `__NEXT_DATA__` (script + window global, 1,819 bytes, `redactedKeys: []`), root `data-*`, `site.webmanifest`, 2 CSS preloads | 6 |
| **framework evidence** | next.js (`__NEXT_DATA__`), emotion (4 tags), styled-components (2 tags) | same |
| **package on disk** | 40 files, 1.77 MB, `contentHash 915c936fa527` | 40 files, 1.74 MB, `contentHash 915c936fa527` |
| **shadow roots (open, on hosts)** | 1 — reported as a limitation; its tree is not captured | 1 |
| **observation window** | 28.7 s | 21.7 s |

Run total on disk (both viewports, screenshots, observation.json): 16.18 MB. Dry-run packages were 4.54 / 4.51 MB (50 files) — the difference is the 2.7 MB of analytics script bodies now skipped by policy.

**Desktop and mobile contentHash are identical** (`915c936fa527`), and identical to the previous run's: every same-origin blob (document, 6 stylesheets, 12 script bodies, 7 inline scripts) hashed the same across the two viewport loads and across the two runs 17 minutes apart (blob-set diff empty). In the dry run they differed only because two Facebook config responses carried `im=1` on mobile and different bytes; those bodies are no longer kept.

## 2. Classification (byPreservability, all entries: styles + scripts + assets + network + config)

| class | desktop | mobile | what is in it |
|---|---|---|---|
| PRESERVABLE | 21 | 14 | 3 style sheets without `url()` (1 SSR emotion tag, 2 CSSOM-runtime snapshots), 16 / 9 `data:` images, 1 `data:` font, root `data-*` attributes |
| LOCALIZABLE | 100 | 104 | 5 stylesheets with `url()`, 23 font files, 25 https images, 4 link icons, the video, and the network's DOCUMENT/CSS/FONT/IMAGE/MEDIA entries, preload/manifest links |
| EXTERNAL_EMBED | 33 | 36 | 11 third-party runtime scripts (GTM, gtag, Facebook, Optimize, Naver, Kakao pixel, Channel Talk) + ANALYTICS/EMBED network entries |
| ORIGIN_BOUND | 10 | 10 | 8 API_DATA requests + `__NEXT_DATA__` (page props are origin data) ×2 |
| STATEFUL_RUNTIME | 0 | 0 | no blob: URLs, no service worker, no adopted stylesheets |
| UNAVAILABLE | 3 | 3 | empty emotion tag, `polyfills` nomodule script (element + no response) |
| UNKNOWN | 30 | 30 | 18 same-origin scripts (11 external + 7 inline: bytes captured, execution independence unknown by rule), 12 JS_CHUNK network entries, the src-less iframe |

## 3. What could NOT be captured, and why

| item | status | why |
|---|---|---|
| `polyfills-c67a75d1b6f99dc8.js` | unavailable | `nomodule` — the browser never requested it; no network response to read. Direct fetch is not attempted for scripts by design (only stylesheets have the fallback). |
| 3 runtime CSS-in-JS sheets (2 emotion, 1 styled-components) | no authored bytes; CSSOM snapshot only | Rules are inserted by `insertRule` into empty `<style>` tags. The snapshot is parser-normalized and differs per viewport (178 rules desktop vs 91 mobile: emotion only inserts styles for components that rendered; 2 rules differed between the two runs). |
| 1 empty emotion tag | unavailable | 0 rules at capture — nothing exists. |
| `declaredIn` for those 3 empty tags | `unknown` | The served document has 5 `<style>` tags; 4 match by text hash; the fifth's attribute signature matches none of the 3 empty runtime tags (emotion rewrites its markers on hydration), so the code refuses to guess (`declaredInEvidence` says so). |
| 10 analytics/ads/tag-manager script bodies | skipped-by-policy | `bodyPolicy.analyticsScript=false`; inventory, initiator, headers and classification are kept. |
| 24 fonts, 41 images, video (97.9 MB) | inventory only | Font/image/media bodies are policy-off in Phase 1; the existing asset materializer is the download path. |
| 8 API/data responses (incl. the 4 `dev-api.apartmentary.com` hydration calls that fill banners, portfolios, reviews) | metadata only | Task §12: API bodies are never stored automatically. Site-external API queries (Channel Talk, Naver, Daum) are dropped; same-site queries are kept as endpoint shape. |
| 6–7 child-frame requests (YouTube-style/GTM/Channel Talk frames) | metadata only | Child-frame bodies are policy-off; frames are not recursed. |
| script-written iframe (no `src`) | UNKNOWN | Nothing to classify without a URL; the runtime DOM keeps the element. |
| 1 open shadow root | not traversed | Reported in `limitations` and `document.runtimeDom.shadowRoots`; its styles/markup are outside the snapshot (review M4). |
| Event listeners, React state, Swiper/AOS state | not captured | By definition (task §8); the runtime DOM is markup only. |

## 4. What the runtime-loaded count means

`runtimeLoadedChunks: 0`: Next.js pages router preloaded every chunk through `<script>` elements in the served document, so no script response lacks a DOM element. The dynamic-import path is proven on the fixture (smoke T6), not on this site.

## 5. §18 proof — captured CSS keeps authored responsive semantics

`npx tsx tmp/source-preservation-phase1/source-package-proof/proof.mts data/apartmentary.com/2026-09-15T11-38-46-603Z/viewports/desktop/source-package`

Counts over the 12 captured CSS texts (6 authored + 6 CSSOM snapshots, 148,979 bytes desktop):

| token | desktop | mobile |
|---|---|---|
| `%` values | 221 | 213 |
| `vw`/`vh` | 5 | 1 |
| `rem`/`em` | 25 | 19 |
| `calc()` | 4 | 2 |
| `min()`/`max()`/`clamp()` | 1 | 0 |
| `var(--…)` / `--custom:` declarations | 10 / 3 | 10 / 3 |
| `display: flex|grid` / `flex:` | 59 / 50 | 47 / 49 |
| `@media` | 65 | 55 |
| `aspect-ratio` | 0 | 0 |
| `@container` / `@supports` / `@layer` | 0 / 0 / 0 | 0 / 0 / 0 |

Verdict: **PASS** on both viewports — `%`, `@media`, flex and `vw`/`calc` survive in the captured source; the linked `globals` sheet has 0 `width: <n>px` declarations. `aspect-ratio` does not occur in this site's CSS (the forensic V2 report's `aspect-ratio` sits in an inline `style` attribute in the runtime DOM, which is preserved in `document/runtime.html`, not in a stylesheet), so the proof cannot claim it for stylesheets.

## 6. Reproduce

```
pnpm observe https://apartmentary.com/ --source-package --no-layout-probe
npx tsx tmp/source-preservation-phase1/source-package-proof/inspect.mts data/apartmentary.com/<run-id>/viewports/desktop/source-package
npx tsx tmp/source-preservation-phase1/source-package-proof/proof.mts   data/apartmentary.com/<run-id>/viewports/desktop/source-package
```
