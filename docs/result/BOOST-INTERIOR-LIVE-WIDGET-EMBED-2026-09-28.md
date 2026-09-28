# BOOST-INTERIOR LIVE BoostChat widget embed — 2026-09-28

| | |
|---|---|
| date | 2026-09-28 (publish 14:28:47Z UTC / 23:28 KST) |
| scope | one site, `boost-interior-demo` (https://interior-demo.boostweb.co.kr). Widget embed only. |
| branch / start HEAD | `track-b/static-deployment-foundation` @ `6f64e5a` |
| evidence | [`boost-interior-live-widget-embed/proof/`](boost-interior-live-widget-embed/proof/) |

```
LIVE_DEMO_WIDGET_EMBEDDED   = YES
WIDGET_SCRIPT_COUNT         = 1 on every public page — 24/24 live pages (/, /portfolio, /3d-portfolio, /about,
                              /contact, 19/19 details) + 404 / _not-found in the package; async, correct src + key,
                              0 render-blocking scripts; DOM after load: 1 <script>, 1 iframe (also after soft navigation)
WIDGET_HOME                 = PASS — 200, launcher 68×68 visible, opens 372×560, bootstrap greeting shown,
                              "안녕하세요" → normal answer ("안녕하세요! 😊 부스트 인테리어 상담 도우미입니다 …")
WIDGET_PORTFOLIO_LIST       = PASS — 200, launcher visible, opens
WIDGET_PORTFOLIO_DETAIL     = PASS — 200, launcher visible, opens, greeting shown (desktop + 390px)
WIDGET_MOBILE               = PASS with note — 390×844: launcher visible (68×68), opens, no horizontal overflow
                              (closed or open). Opens as a 366×620 sheet (94 % × 73 %), NOT edge-to-edge fullscreen:
                              that size is hard-coded in BoostChat's widget.js (NARROW_MAX sheet); BoostChat not modified
OTHER_SITES_CHANGED         = NO — fixture-{empty,large,small} data/pointers untouched; R2 still one routing key, one site prefix
TEMPLATE_RELEASE_CREATED    = NO — the head-scripts seam is already in interior-01@1.6.1; site data only
OLD_RELEASES_CHANGED        = NO — interior-01-1.6.1-8da56de8d28f and 1.5.2-d87807590d64 pass verifyRelease; no git change
                              under data/template-releases or templates/
LIVE_PACKAGE                = packageHash ada03d20d4c0688316e274a724d4298aa031128098ed23b591a5b65c004a25d6
                              (buildInputId 32303241c78f10e5edc3a42686680aa5238a8aa76c3192795dc351ffbe55c650, 1.6.1)
ROLLBACK_PACKAGE            = packageHash 3846a29d30ef1d48e58b0c507075918424350870b096294a83678eb87ba20aaf
                              (buildInputId a4777cf9…, the V0.2 package live until this publish; sealed, R2 bytes unchanged)
                              rollback: RECON_PUBLISH_ALLOW_REMOTE=1 site:publish --site boost-interior-demo
                                        --host interior-demo.boostweb.co.kr --remote --rollback --expect-live ada03d20…
PRODUCTION_PUBLISHED        = YES — 2026-09-28T14:28:47.096Z (upload+seal → reverify 199/199 → activate)
BLOCKER                     = 0
MAJOR                       = 0 open (1 found by the fresh review and fixed before publish — §3)
```

## 1. How it was embedded (seam reuse)

The platform already had a per-site head-scripts seam (`docs/result/static-deployment-foundation/widget-seam/01-head-scripts-seam.md`):
`data/sites/<site>/scripts.json` → snapshot `headScripts` → `templates/interior-01/v1/app/head-scripts.ts` → `<head>`.
It is part of the pinned release `interior-01@1.6.1` (the seam files are byte-identical to the release copies).
So no template or renderer change and no new release — only site data:

| file | change |
|---|---|
| `data/sites/boost-interior-demo/scripts.json` (new) | one head script: `https://boostchat.co.kr/widget.js`, `data-boost-chat-key=wgt_99kY…qDI3`. The seam renders it `async` |
| `data/sites/boost-interior-demo/settings.json` | `"site.floating-cta": { "enabled": false }` — see §3 |

The key lives only in this site's data. No template component, platform file or other site mentions it.
Rendered on every page: `<script src="https://boostchat.co.kr/widget.js" async="" data-boost-chat-key="wgt_…">`.
Package QA allows exactly this one remote URL (the seam's exact-URL allowlist). The loader also has its own duplicate guard.

## 2. Verification before publish

- **Package check.** The built package has 26 HTML pages. Each has exactly 1 widget tag with async, the correct src and the correct key. The only differences from the live package are the tag, the buildId and the floating CTA.
- **Scratch rehearsal.** A copy of the repo ran the build and all 15 suites in the new steady state. The canonical build reproduced the rehearsal exactly (`ada03d20…`).
- **Preview.** Before publishing, the exact candidate bytes were served under the production origin inside a local browser, via Playwright interception. The real widget loaded; the loaders, iframes, sizes and overflow were checked, and soft navigation across 5 pages showed no reloads, no 404s, and the widget always at 1/1.
- **Dry run.** A publish dry run with `--check-store` planned 199 files plus the seal under the new prefix and one pointer write, with no warnings.

**Suite restatement.** This is required by the suites themselves ("a later rotation of previous is a reviewed restatement"). No assertion was deleted or weakened:

| suite / check | before | after |
|---|---|---|
| integration B2 | snapshot anchor `8de4ff87…` | new anchor `f63e293c…`. Dropping exactly `headScripts` and the seat override must land on `8de4ff87…` again, so those two are the whole widget delta |
| integration B2b | previous = V0.1 | frozen lineage: previous = V0.1 only while current = the first V0.2 package (`a4777cf9…`). Otherwise previous must be exactly that package: same `buildInputId`/`packageHash`, intact, same pin, golden integration bytes |
| integration G1–G3 / I2 | V0.1 package read from disk | keep-2 retired it locally. It is now read from git `cb781e8` (`gitMaterialize`) and re-hashed against its frozen packageHash, so the checks keep full strength. The R2 seal is unchanged |
| step6 G | no remote URL at all | only the site's declared script URLs, and only as `<script src>`, exactly once per page, async, with its `data-*` |
| step6 O / ia150 P3 | the floating CTA on every page | the CTA on every page, or on none while a declared head script takes the seat. CTA off without a head script fails |

**Sabotage runs** (in the scratch copy, restored afterwards):
- `previous` set to V0.1 → B2b FAIL.
- `scripts.json` removed while the CTA is off → P3 FAIL "the floating CTA is off but the demo declares no head script".

## 3. Fresh independent review (Opus, fresh context, no expected verdict)

The review found 0 BLOCKER, 1 MAJOR, 3 MINOR and several NOTE items.

- **MAJOR (fixed).** The site's own floating "상담 문의" button (`.i1-fcta`, bottom-right) and the chat launcher overlapped. This was confirmed by screenshot.
  - The template documents that seat as the chat launcher's (FloatingCta: "a chat launcher replaces FloatingCta", same seat).
  - The widget position cannot be set through its attributes, and `--i1-float-*` is not a theme token.
  - So the only data-only fix is `site.floating-cta.enabled=false`. Contact stays reachable through the header "견적 문의" button, the page and detail CTAs, and the chat itself.
- **MINOR (fixed).** A misleading comment in step6 about what package QA allows.
- **MINOR (fixed).** `gitMaterialize` now fails with a clear error naming the commit, and it removes its temp dir.
- **MINOR (fixed).** B2b now also pins the rollback's `buildInputId`.
- **MINOR (fixed).** The report reference in the test now points to this file.
- **Notes recorded.**
  - There is no SRI or CSP, which is the seam's design, so trusting boostchat.co.kr is a vendor-trust decision.
  - Preview-mode builds also carry the script.
  - The pre-widget B2b branch can now only be reached historically.

## 4. Publish (controlled, same procedure as 39-)

All three steps used `RECON_PUBLISH_ALLOW_REMOTE=1 site-publish.ts --site boost-interior-demo --host interior-demo.boostweb.co.kr --remote --expect-package ada03d20…`.

| step | result |
|---|---|
| 1 `--no-activate` | 14:24:26 → 14:27:19Z: uploaded 199/199, verified 199/199, seal written |
| 2 `--no-activate --reverify` | 0 uploads, reverified 199/199 (sha256 + size) |
| 3 `--expect-live 3846a29d…` | pointer → `ada03d20…`, previous `3846a29d…`, publishedAt 2026-09-28T14:28:47.096Z |

**Blast radius.** R2 had 542 objects before and 742 after. None are missing, 0 changed apart from the pointer, and 200 were added, all under `sites/boost-interior-demo/packages/ada03d20…/`. There is still exactly one routing key and one site prefix. The Worker, route and bucket config were not touched.

**Rollback.** The rollback target is recorded above. No drill was run this time, to save time, because:
- the mechanism is the same pointer-only `--rollback` proven by the real drill on 2026-09-27 (39- §10);
- the target `3846a29d…` is sealed and its 225 R2 objects are byte-unchanged;
- its local package is intact (integration B2b).

The widget-OFF bytes of that package (home `54bfa1c3…`, list `da17370f…`, detail `47287d1b…`) are captured in `proof/10-live-bytes-before.txt` for a byte-level check after any rollback.

## 5. Live production verification (`proof/verify-live/`)

**Raw HTML, 24 public pages.** All return 200. Each has exactly 1 widget tag with async, the correct src and the correct key, no other boostchat URL, and 0 render-blocking scripts (Next's `noModule` polyfill is excluded).

**Browser checks:**

| | desktop 1366 | mobile 390 |
|---|---|---|
| home | 200 · launcher visible · opens 372×560 · greeting · chat reply normal | 200 · launcher visible · opens 366×620 · no overflow |
| portfolio list | 200 · visible · opens | 200 · visible · opens |
| detail (`dalseo-34py…` / `dalseo-84m2…`) | 200 · visible · opens · greeting | 200 · visible · opens |
| soft nav home → /portfolio | 1 script, 1 iframe | 1 script, 1 iframe |

**Two automated flags, both harness artefacts, not site defects:**
1. **"greeting reply abnormal: (empty)".** The reply was normal; see screenshot `desktop-home-reply.png`. The harness waited for the send button to become enabled, but it stays disabled while the input is empty.
2. **Mobile list: 3 images "broken".** They are `loading="lazy"` images that had not loaded when the check ran. All three answer 200 on live (92 / 94 / 52 KB) under the same content-addressed paths as before, and the widget-OFF baseline run passed them.

The owner also checked the live site by hand and confirmed the widget is applied.

## 6. Site regression and performance (widget OFF baseline = `proof/verify-baseline/`, same harness, before publish)

- **Regression.** Home, portfolio list and a representative detail at desktop and mobile widths:
  - no broken images (apart from the lazy-load flag above);
  - 24/24 internal links return 200;
  - no horizontal overflow;
  - 0 console or page errors;
  - integration manifest and document unchanged (golden sha).
- **Performance.** widget.js has `renderBlockingStatus: "non-blocking"` on every page. CLS is 0 on every page, both before and after. FCP/LCP stay within network noise:
  - desktop list: 788 → 936 ms
  - desktop detail: 780 → 932 ms
  - mobile detail: 796 → 1272 ms
  - desktop home: 2604/2604 → 2668/2932 ms (hero image)

  The loader is 20 KB. It starts after the page's own scripts and adds a single 68×68 fixed iframe, so there is no layout shift.

**Post-publish suites:** 15/15 green (§8).

## 7. Open items (MINOR, not blocking)

1. **Mobile footer overlap.**
   - The footer's bottom padding is reserved only while `.i1-fcta` exists (`template.css` `body:has(.i1-fcta) .i1-footer`). With the CTA off, the launcher covers the last words of the demo disclaimer at the final scroll position on 390px (`proof/preview/mobile390-home-bottom.png`). Desktop is clear.
   - A fix is a one-rule CSS change (reserve the seat's space when a head-script launcher takes it). That needs an interior-01 patch release, which the brief allows only when unavoidable, so it is left for the next template cut.
2. **Mobile open size** is BoostChat's design (a 366×620 sheet, not fullscreen). If fullscreen is required, it is a BoostChat change. Hand it to the BoostChat side.
3. **BoostChat consumer note.** The routing pointer's `previous` is now `3846a29d…`, a document `"1.0"` package. Current and previous are therefore both ≥ 1.0, which is the condition 39- gave for closing WP03-DUAL-READ. The integration manifest and document bytes are unchanged (golden `b2f52b73…` / `c7662414…`), so no consumer snapshot refresh is needed.
4. **Commits.** Nothing was committed (not requested). Suggested split:
   - (a) `platform/test/{git-checkout,integration,step6,ia150}.test.ts` + `data/sites/boost-interior-demo/{scripts,settings}.json`;
   - (b) `data/site-builds/boost-interior-demo/**` (the published package, pointers, and keep-2's removal of `packages/0f80b239…`);
   - (c) this report + `boost-interior-live-widget-embed/`.

   `docs/status/` was not changed, because the milestone state did not change.

BoostChat repo: not touched. Jev: not touched. Portfolio media/gallery contract: not touched.

## 8. Post-publish suites (canonical repo, live pointer = ada03d20…)

**15/15 green, 0 known red.** The counts are identical to the 2026-09-27 steady state (39- §8):

| suite | result |
|---|---|
| integration | 75/0/0 (+1 point-in-time, G5, unchanged) |
| slice1 | 86/0 |
| step4 | 47/0 |
| step41 | 35/0 |
| step5 | 32/0 |
| step6 | 32/0 |
| predemo | 10/0 |
| predemo2 | 9/0 |
| ia150 | 15/0 |
| ia151 | 10/0 |
| ia152 | 14/0 |
| polish | 4/0 |
| step52 | 12/0 |
| publish | 59/0 |
| detail-facts | 24/0 |

`tsc -p platform/tsconfig.json --noEmit` passes. Summary: `proof/runs-post-publish/_summary.txt`.
