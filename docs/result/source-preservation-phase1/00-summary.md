# 00. Summary — Source Preservation V2, Phase 1: Source Package Capture

**Verdict: READY FOR HUMAN PHASE-1 REVIEW.**
No Preservation Clone was implemented in this phase.

## What Phase 1 delivers

An opt-in observer capability (`--source-package`) that, for every viewport load of an arbitrary public URL, writes a **Source Package** next to the existing observation artifact: the served main-document bytes (hash-exact) separate from the runtime DOM snapshot; every stylesheet as authored bytes (linked sheets from the network response, `<style>` text verbatim) with a CSSOM-serialized copy for CSS-in-JS runtime sheets; every script element (classic/module/nomodule/inline) with bodies when the page loaded them, plus runtime-loaded chunks with no element; a bounded, classified, redacted network dependency map with CDP initiator evidence; allowlisted runtime config (`__NEXT_DATA__`, JSON scripts, preload links, root `data-*`); an asset inventory (images/srcset/picture, CSS images, `@font-face`, media, iframes with provider classification, SVG, icons); a preservability classification per entry; limits, accounting and limitations in the manifest; deterministic sorted JSON and a content hash. Default off; additive schema; old artifacts load unchanged.

## Reports

| file | content |
|---|---|
| `01-current-capability-map.md` | what the pipeline captured before Phase 1, with file:line evidence, CAPTURED / PARTIAL / NOT CAPTURED / DISCARDED / UNKNOWN |
| `02-source-package-schema.md` | artifact layout, manifest fields, vocabularies, privacy rules, limits, pointer |
| `03-implementation.md` | files, capture flow, decisions, backward compatibility, corrections after the dry run (§6) and after the review (§7) |
| `04-apartmentary-capture.md` | REAL measured counts for `https://apartmentary.com/`, classification breakdown, what could not be captured and why, §18 proof |
| `05-tests.md` | targeted smoke suite (215 checks), typecheck, what was deliberately not run |
| `06-independent-review.md` | fresh-context review: 1 BLOCKER + 6 MAJOR fixed, 13 MINOR + 11 NOTE carried with dispositions |
| `07-phase2-handoff.md` | human decisions needed, capture-side prerequisites, evidence the package does NOT provide |

## Headline numbers (final run `2026-09-15T11-38-46-603Z`, desktop / mobile)

- Initial document captured (81,794 B, sha256 `95eb46dd…`) and runtime DOM captured (137,259 B / 122,077 B) — stored separately.
- Styles 9: linked 2, style tags 4, CSSOM-runtime 3; raw bytes 6/9; unavailable 1 (an empty emotion tag).
- Scripts 30: document-declared 21, runtime-injected 9, runtime-loaded chunks 0, responses captured 12, skipped by policy 10 (analytics), unavailable 1 (`nomodule` polyfill).
- Assets: images 41 / 34, fonts 24 (`@font-face`), media 2, SVG 0 inline, iframes 1, icons 4.
- Network 80 / 87: static 54 / 58, API 8, analytics 17 / 20, third-party 59 / 67, failed 0.
- Classification (desktop): PRESERVABLE 21, LOCALIZABLE 100, EXTERNAL_EMBED 33, ORIGIN_BOUND 10, STATEFUL_RUNTIME 0, UNAVAILABLE 3, UNKNOWN 30.
- Package: 40 files, 1.77 MB / 1.74 MB; `contentHash 915c936fa527` identical across viewports and across two runs.
- §18 proof PASS: captured CSS holds 221 `%` values, 65 `@media`, 59 flex/grid displays, `vw`, `calc()`, `var()`; not flattened to px.

## Cost

Per viewport load: one CDP session, four Playwright listeners, one in-page inventory evaluate (bounded: 20,000 elements, 20,000 rules/sheet, 2,000 inventory entries), an optional second evaluate, ~1.8 MB written. The observation windows were 28.7 s (desktop) and 21.7 s (mobile) with the package on; no separate baseline run without it was made in this phase (the task allowed one bounded capture, and three were used — see `04` for why).

## Known limitations (also in every manifest's `limitations`)

No event listeners / JS state; script execution independence is `"unknown"` by rule; API bodies never stored; fonts/images/media inventory-only; child frames metadata-only; shadow trees not traversed (counted); CSSOM snapshots are parser-normalized and state-dependent; the initial document is stored as served (not redacted, hash-exact); `declaredIn` is `unknown` when neither text nor attribute evidence ties an empty runtime style tag to the served document.

## Reproduce

```
pnpm typecheck
pnpm smoke:source-package
pnpm observe https://apartmentary.com/ --source-package --no-layout-probe
npx tsx tmp/source-preservation-phase1/source-package-proof/inspect.mts data/apartmentary.com/<run-id>/viewports/desktop/source-package
npx tsx tmp/source-preservation-phase1/source-package-proof/proof.mts   data/apartmentary.com/<run-id>/viewports/desktop/source-package
```
