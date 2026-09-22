# 06 — Independent review and dispositions

One fresh-context, **read-only** reviewer, run on a strong model. It was given the
experiment artifact, the harness, the frozen inputs and the draft reports. It was asked
neutrally to look for unsupported boot claims, source-network leakage, tracker/widget
execution, baseline mutation, source-JS byte modification, incorrect separation of boot and
hydration survival, and site-specific logic in reusable code. It did not rerun the experiment
and did not use the network. It modified nothing. (`check-result.mjs` re-ran with 65/65 pass.)

**Result: 0 BLOCKER · 1 MAJOR · 6 MINOR · 7 NOTE.**

The reviewer independently confirmed the verdict *BOOT_FAILED — runtime blocker identified*.

## Load-bearing claims were verified before any change

| reviewer claim | how it was checked | holds? |
|---|---|---|
| Next's `Container` is an error boundary | main @14241 `componentDidCatch(e,t){this.props.fn(e,t)}`; @16139 `createElement(V,{fn:…J({App:H,err:e}).catch(…"Error rendering page: "…)})` | **yes** |
| main-banner stub shape wrong | sc0028 `case 1:return e=i.sent(),t=e.data.data,(0,I.z)((function(){y.mainBanners=t}))`, where `e` = AxiosResponse. Reviews (`e.data.data.data`) and portfolios (`t=e.data,i=t.data,n=i.data`) are correct | **yes** |
| Playwright answers intercepted OPTIONS itself | `playwright-core@1.62.1`: `isInterceptedOptionsPreflight = … method === "OPTIONS" && initiator.type === "preflight"` | **yes** |
| static root served every hit from `/assets/` and `/styles/` only | server log: assets 31, styles 2 (both 200) | **yes** (no exposure occurred) |

## MAJOR

| # | finding | disposition |
|---|---|---|
| M1 | `04` presented the detached subtree count (169/658, "~26%") as the DOM "after the hydrate commit and before any later render". That is not supported. MUI `useMediaQuery` under React 17 starts `false` and re-renders synchronously in a layout effect at 1440 px (sc0025 @55262), and unmount cleanup also runs on the detached nodes | **Accepted, report corrected.** `04` now calls it "detached subtree at settle", lists the three mixed causes, and withdraws the hydration-survival reading. `adjudicate.mjs` reading updated. `07` notes that layout-effect re-renders will pollute even an early snapshot |

## MINOR

| # | finding | disposition |
|---|---|---|
| m2 | causal chain said "no error boundary → React unmounts the root"; actually Next's Container boundary catches it and unmounts its children | **Corrected** in `03` and in the adjudication S7 text. The conclusion is unchanged |
| m3 | main-banner stub `{"data":{"data":[]}}` is wrong; correct is `{"data":[]}`. "Stub shapes were verified" was false for this stub | **Corrected** in `01`, `03`, `experiment-config.json` (for future runs) and the adjudication. It could not have caused the crash: the TypeError is thrown synchronously in the effect flush before any async XHR response, and it reads `window.karrotPixel` |
| m4 | `hydrationStatus=FAILED` reads a post-boot crash as a hydration failure | **Accepted.** `hydrationStatus` is now `UNKNOWN`; new field `finalDomSurvival = LOST` carries the 0/660 result and its cause |
| m5 | B7 evidence was a fixed string. The resolver layer was never independently tested. The OPTIONS/preflight explanation was misattributed | **Corrected** in `05`. `run.mjs` B7 evidence is now data (future runs). Resolver layer recorded as untested |
| m6 | `adjudicate.mjs` is a run-specific narrative written like a derivation; `bootObservables.B2.pass` was left `true` | **Fixed.** The file header now says RUN- and SITE-SPECIFIC. Adjudicated values are written into `bootObservables[*].adjudicated` (B2 → false, B4 → PARTIAL, B9 → NOT MEASURABLE) |
| m7 | B2 counted only `pageerror`, so React-caught fatal errors passed automatically | **Harness fixed for future runs.** B2 also counts `console.error` entries whose stack points into served local code |

## NOTE

| # | finding | disposition |
|---|---|---|
| n8 | static root was the whole clone root, which includes preserved tracker/widget bodies in `scripts/` | Nothing requested them. **Fixed** for future runs: `staticServePrefixes` = `/assets/`, `/styles/` (`lib/server.mjs` stays generic, `run.mjs` passes the config) |
| n9 | resolver rules are hostname-only (raw IP, WebRTC/STUN bypass) | recorded as a limitation in `05` |
| n10 | a non-clean pre-execution snapshot was only a warning | **Fixed:** now a hard failure. In this run it was clean (`gateHeld=true`, no webpack globals, `next` undefined) |
| n11 | no in-page script-execution audit | recorded as a limitation in `05` |
| n12 | "same effect flush" leaned on driver timestamps | `03` now rests ordering on React semantics and says the timestamps can't establish it |
| n13 | "Strategy B not required" holds only for attributing this crash | `runtime-result.strategyBFallbackWhy` and `00` reworded conditionally |
| n14 | S3 video host bucketed as `other-external`; `run.mjs` holds framework-specific rules | `05` notes the host is source-owned (config now buckets it). `run.mjs` is experiment code, not `lib/`; noted in `00` |

## Rerun decision

**No rerun.** The reviewer found no BLOCKER. The harness defects it found (m5, m7, n8, n10)
did not change what this run observed:
- the fatal error is in the console log;
- the pre-execution snapshot was verified clean;
- no tracker body or non-local request was served.

§32 allows a rerun only to fix a real harness BLOCKER. The fixes apply to any future bounded
run (3B.1).

## What the reviewer verified as correct

- exactly 9 executable scripts in `index.html`, the activated replay chunks; no inline
  handlers, `javascript:` URLs, object/embed, base or meta-refresh; the Channel iframe has no
  `src`
- reverting the 9 recorded start tags reproduces `desktop/index.html` byte for byte
- all 9 scripts served 200 with sha256 equal to the graph
- Phase 2 tree (103 files) and Phase 1 tree (97 files) unchanged; `executionIndependence`
  still `unknown`
- 53 router decisions, with router and browser request sets identical. Off-localhost: 4
  stubbed XHRs (empty `authorization`) and 1 blocked media request. 0 continued, 0 unstubbed
  non-local responses, 0 WebSockets
- the pre-execution snapshot was genuinely pre-execution
- S1–S6 supported, including the chunk ids, Next 12.3.4, the `Next.js-hydration` measure emitted
  only from the hydrate layout-effect callback, and the XHRs from the index `useEffect`
  (sc0028 @6197)
- the fatal site is `_app:74:189114` → sc0025 ≈ @219931, an unguarded
  `window.karrotPixel.track`; `window.wcs` is guarded
- the latent `fbq`/`Kakao` sites match the code
- `lib/*.mjs` holds no forbidden tokens or site values
