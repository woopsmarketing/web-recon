# 08 — Independent review and dispositions

One fresh-context, read-only reviewer. Asked neutrally for unsupported claims, missing
scripts or dependencies, mistaken bundler/framework assumptions, wrong feature attribution,
source-specific leakage, and unsupported replay recommendations. It ran no JS and used no
network. It was not told the expected conclusion.

**Result: 0 BLOCKER · 6 MAJOR · 9 MINOR/NOTE.**

## Method of adjudication

No finding was accepted on the reviewer's word. Every load-bearing one was checked against
code or capture before any report changed. **All six MAJORs verified at the exact cited
file and offset. No reviewer claim failed verification.**

## MAJOR — all accepted, all corrected

| # | finding | verified by | disposition |
|---|---|---|---|
| M1 | Phase 2 preview described wrongly: it sends `content-security-policy: script-src 'none'` and serves variants at `/desktop/` `/mobile/`, not a server root | `src/preservation-clone/serve.ts` line with `"content-security-policy": "script-src 'none'"` | **Corrected** in 02, 05, 06, 07. Runtime replay is now specified as a separate serving mode |
| M2 | Source CSP is not "a real unknown" — the capture answers it | n0001 response headers have no CSP (header is on the allowlist); `response.html` has 0 CSP meta | **Corrected** in 05, 07. Source sends no CSP |
| M3 | Proposed interception cannot work: requests are absolute cross-origin, so a same-origin proxy never sees them; a service worker does not control first load | sc0027 @260409 `var c="https://dev-api…"` | **Corrected** in 04, 05, 06, 07. Browser-level request routing is now the named mechanism |
| M4 | B_FIRST contradicts the report's own blocking rules: `response.html` has live tracker tags and 0 `data-preservation-*` attributes, so B needs a second transform system | `response.html` carries `kakao.js`, `kp.js`, `karrot-pixel.umd.js`; `data-preservation` count 0 | **Accepted — recommendation reversed to A_FIRST** |
| M5 | Swiper "never looks at the document to find its slides" is false; parameters are literals, not guessed | sc0026 @114250 `` `.${e.params.slideClass}, swiper-slide` ``; sc0028 @6887 `getElementsByClassName("swiper-slide")` | **Corrected** in 03, 07, graph. Verdict **B / not React-independent stands**, on narrower grounds |
| M6 | API attribution wrong: `pages/index` is the direct caller of all four endpoints; sc0027's literal is the effective base URL, sc0025's is a default | sc0028 @1932 `reviewService`, @4723 `portfolioService`, @4747 `mainBannerService`; sc0027 @260409 `(0,a.PEn)(void 0,c,o)` | **Corrected** in 04 and graph: 4 `DATA_FETCH` edges from index, `MODULE_IMPORT` index→7925 |

### On M6 and the `pages/index` classification

The reviewer judged the downgrade from SOURCE_BOUND to LOCAL_EXECUTABLE_WITH_DEPENDENCIES
*defensible*, with the dependency under-recorded rather than misclassified. Kept as
WITH_DEPENDENCIES: the chunk holds no origin literal and no fetch primitive, and its
source binding arrives entirely through SOURCE_BOUND chunk 7925. Its node now states
plainly that it is the direct caller of all four endpoints, and the missing edges were added.

## The strategy reversal, in full

The reviewer judged B_FIRST "mostly a preference" and the A/B case roughly balanced.
Adjudication went further than the reviewer and **reversed to A_FIRST**, because M4 is
decisive rather than balancing:

- B's claim to "isolate exactly one variable" was false — B changes the document *and*
  requires a new transform pipeline.
- B's claim to "risk nothing" was false — it needs new infrastructure, and served raw it
  executes trackers.
- A second neutralize-and-localize system violates the project rule against building a
  second system for a job an existing one does.
- B's one surviving advantage — separating boot failure from hydration damage — is
  achievable inside A by instrumenting the two separately.

B is retained as the diagnostic fallback.

## On the verdict

The reviewer argued **NOT READY — FORENSIC BLOCKER would be the wrong label**, and that
READY overstated things while M1–M4 stood, proposing instead *"READY FOR PHASE 3B
BOOT-EXPERIMENT DESIGN."*

The task permits exactly two verdicts, so a third label is not available. Adjudication:
**READY FOR PHASE 3B REPLAY EXPERIMENT stands**, because the objection was to M1–M4
*standing*. They no longer stand as unsupported claims; each is now a located, documented
blocker with a named remedy. That is precisely what the READY criteria require — blockers
known, not blockers absent. The reviewer's substance is carried into the verdict text:
the experiment is a **boot** experiment, and content replay is blocked by capture policy.

## MINOR / NOTE

| # | finding | disposition |
|---|---|---|
| 1 | SSR document is not bare chrome — hero copy, CTAs, portfolio headings showing `0`, full footer | **Corrected** 03, 05. The `0` counts strengthen the hydration argument |
| 2 | Hydration mechanism imprecise: React 17 legacy hydrate deletes/inserts nodes but does not repair attribute/className mismatches → mixed DOM | **Corrected** 05, 07, graph |
| 3 | Graph edge names disagreed with 06; generality guard only checked a JSON section | **Corrected**: names aligned; guard now scans 06's type and recognizer surface; edge types checked against 06; guard mutation-tested (3/3 injected violations caught) |
| 4 | Only one bundler-runtime edge in graph | **Corrected**: 5 added |
| 5 | Initiator/preflight overstated; mobile network ids differ | **Corrected** 04: preflight claim withdrawn; mobile n0032–n0035 recorded |
| 6 | `__NEXT_DATA__` URLs must not be rewritten — hydration input | **Corrected** 04, 07: record, do not rewrite; not "one rule" with the manifest |
| 7 | "Hope carried in the Phase 2 handoff" untraceable | **Corrected** 03: the hypothesis came from the Phase 3A task brief |
| 8 | Karrot pixel UMD captured despite `analyticsScript=false` (no provider hint) | **Carried forward** in 07 as a Phase 1 provider-table gap |
| 9 | Stub shape; `data-aos` is 16 + body; reviews guard @~2340 | **Corrected** 03, 05, 07 |

## Confirmed correct by the reviewer

`pageProps` = exactly bannerData / popupData / footerData, `gssp` and `appGip` true ·
`bodyPolicy.json = false`, all 4 dev-api bodies `skipped-by-policy` · `r.p="/_next/"` at
sc0022 @4080, no `currentScript`, no `assetPrefix` · `.e(` zero across sc0022–sc0030;
route `/` fully captured · 0 `<a>` in desktop, mobile and `response.html` · React 17.0.2
legacy `hydrate`/`render`, no `createRoot` · desktop/mobile chunks sha256-identical,
`response.html` identical across viewports · the desktop `gtm.js?…is_td=1` id shift ·
Next 12.3.4 · 19 clone scripts · 3 residual entries · the two unrewritten `media-landing`
URLs.

**Unverified by the reviewer, stated honestly:** the 33-route count, and the clone-side
`<a>` count (taken from the graph rather than re-counted).
