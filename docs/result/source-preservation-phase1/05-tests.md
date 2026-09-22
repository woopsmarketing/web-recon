# 05. Tests — targeted smoke suite (Phase 1)

Scope follows the task's rule: only the smallest relevant verification. No full responsive QA, no reconstruction regression, no interaction-explorer regression, no other project smoke suites were run.

## Commands and results (final code, after the post-dry-run corrections)

| Command | Runtime | Result |
|---|---|---|
| `pnpm smoke:source-package` (before the review, non-hermetic embed) | 89 s | PASS — 215/215 checks, exit 0 |
| `pnpm smoke:source-package` (after the review fixes, hermetic) | 82 s | PASS — 215/215 checks, exit 0 |
| `npx tsc --noEmit -p .` (after every patch set, last run after the review fixes) | ~40 s | PASS — 0 errors (whole project) |
| `npx tsx tmp/source-preservation-phase1/redaction-check.mts` | <1 s | PASS — credential stripping, srcset/CSS/attribute redaction, same-site rule, Google `measurement/conversion` → ANALYTICS with query dropped |
| `npx tsx tmp/source-preservation-phase1/sanity/run.mts` | ~15 s | PASS — local fixture capture, used during development |
| `npx tsx tmp/source-preservation-phase1/source-package-proof/proof.mts <package dir>` | <1 s | PASS — see `04-apartmentary-capture.md` §5 |

Logs: `tmp/source-preservation-phase1/smoke-final.log` (pre-review), `smoke-final2.log` (post-review).

## What `scripts/smoke-source-package.ts` covers

House style (local `check()` / `section()`, counters, exit code 1 on any failure). Two inline `http` fixture servers on `127.0.0.1:0` serve a same-origin page with responsive CSS (`%`, `calc`, `aspect-ratio`, `@media`, `@supports`, `@font-face`), a `<style>` tag, an empty emotion-style `<style data-emotion>` filled by `insertRule`, classic / module / inline scripts, a dynamic `import()` chunk, a `fetch` with `?token=`, `__NEXT_DATA__` carrying an `apiToken`, `img srcset/sizes`, `<video>`, a YouTube iframe and a `background-image`. Every fixture response carries secret-shaped headers (`set-cookie`, `authorization`, `x-auth-token`, `x-api-key`).

| Section | Task §20 item | Checks |
|---|---|---|
| T11 classification unit checks (no browser) | — | `classifyRequest`, `classifyPreservability`, `redactUrl`, `classifyEmbedUrl`, `detectFrameworks` on synthetic inputs |
| T1 initial document vs runtime DOM stored separately | 1 | `document/response.html` = served bytes (sha256 equal), `document/runtime.html` differs and contains runtime-injected markup, both referenced from the manifest |
| T2 linked CSS raw source captured verbatim | 2 | authored blob byte-equal to the served stylesheet; `%`, `calc(`, `aspect-ratio`, `@media`, `@supports` present; `methods.networkBody = captured` |
| T3 runtime `<style>` CSS captured | 3 | text `<style>` → `style-tag` with verbatim authored text; empty `data-emotion` tag → `cssom-runtime` with `cssomSerialized` containing the inserted rules |
| T4 cross-origin / unreadable stylesheet represented, not hidden | 4 | a stylesheet the browser cannot read (`cssom: blocked`) and one that fails on the network are present as entries with `unavailable`/`failed` status and reasons; direct-fetch fallback path exercised on a second fixture |
| T5 module / classic / inline script inventory | 5 | kinds `classic` / `module` / inline; `declaredIn: initial-document` for all three with parser initiator; `executionIndependence: "unknown"` on every entry; `__NEXT_DATA__` copy has `apiToken: [redacted]` and `redactedKeys`, raw document keeps the served bytes |
| T6 runtime-loaded JS chunk | 6 | `chunk.js` appears in `network/manifest.json` as `JS_CHUNK`, main frame, initiator `script`, and in `scripts/manifest.json` as `declaredIn: runtime-loaded`; child-frame (YouTube) entries exist with no bodies |
| T7 resource size cap | 7 | `big.js` above `maxScriptBodyBytes` → `skipped-by-size` with byte count in accounting; `small.js` captured |
| T8 sensitive headers / query tokens / POST bodies NOT stored | 8 | grep over every written file for the cookie, authorization, x-auth-token and x-api-key values: absent; headers union ⊆ allowlist; `?token=` recorded as `token=%5Bredacted%5D`; POST payload absent everywhere except the authored inline script that sends it; only `postDataBytes` recorded |
| T9 old artifact without Source Package still loads | 9 | a schema-5 `observation.json` without the pointer parses through the permissive readers; `loadObservation` unchanged |
| T10 deterministic ordering / hashing | 10 | two captures of the same fixture: identical `contentHash`, identical style/script/asset/config counts and identical main-frame network inventory; sorted-key JSON; blob filenames carry the sha256 prefix |
| T12 observer integration | §19 | `observePage` with `sourcePackage: true` writes `viewports/<id>/source-package/` and the pointer with `sizes.sourcePackageBytes`; with the option off no directory, no listener, no field |

Hermeticity (review M6): the fixture keeps a real third-party embed URL so provider classification is exercised, but every page the suite drives routes that host to an in-memory stub (`stubEmbedHost`: an HTML document plus one script), and the two `observePage` runs — which own their browser and cannot be routed — load a `/no-embed` variant of the fixture. The suite therefore makes no outbound request. Child-frame totals are still asserted as lower bounds.

## Not run (deliberately)

`smoke:responsive-qa`, reconstruction regression, interaction explorer, the other 36 project smoke suites. The change is additive and default-off; the observer path with the option off is byte-identical in behaviour (T12 proves no field is written).
