# Phase 2 — Independent review

A fresh-context reviewer was given the module, the CLIs, the smoke and the real
built artifact, and asked a neutral question: review for source-semantic
preservation, accidental pixel reconstruction, stylesheet duplication or order
errors, incorrect desktop/mobile merging, unsafe source JS execution, asset
rewrite correctness, residual dependency honesty, genericity and backwards
compatibility — and do not assume the implementation is correct.

The reviewer was not told what conclusion to reach. It returned
**NOT READY — 1 BLOCKER, 2 MAJOR, 5 MINOR**.

All three BLOCKER/MAJOR findings were verified against the artifact before being
acted on. All three are now fixed, each with a smoke check that fails against
the pre-review code.

## BLOCKER — fixed

**1. `<object>` / `<embed>` were localized as passive resources.**
`dom.ts` mapped them to `role: "resource"`, so their bytes were fetched and
served locally. But both create a nested browsing context: an SVG or HTML
document loaded through `<object data=…>` executes its own `<script>`, unlike
the same file in an `<img>`. Localizing the bytes does not make it safe — it
makes the source JS local and still runnable. A direct violation of "source JS
must not execute."

Latent on this page (zero `<object>`/`<embed>` in the capture), real everywhere
else. **Fixed:** both are now `role: "embed"` and neutralized exactly like an
`<iframe>`. Smoke check 24.

## MAJOR — both fixed

**2. The resource ledger double-counted scripts, verified live in the artifact.**
One `ResourceRecord` was pushed per *(viewport, script)* pair with `shared`
hardcoded `false`. The built artifact had 118 entries for 103 distinct URLs —
15 duplicates — so `manifest.resources.total/localized`, the honesty ledger a
human reads, was inflated. `recordByUrl` also kept only the last record per URL,
so a script record could shadow a real asset record and misclassify its rewrite.

**Fixed:** preserved scripts are now deduplicated by URL (inline scripts keyed by
content hash, since entry ids are per-package and mean different code in each
viewport), `usedBy`/`shared` are computed from actual reuse, and `recordByUrl`
excludes script records so it cannot shadow an asset. The corrected ledger reads
**99 entries / 99 distinct URLs / 97 localized / 47 shared** — the previous
"116 localized" overstated the result by 19. Smoke checks 28 and 28b.

The per-viewport script-bytes lookup was also split per viewport while fixing
this: it was keyed globally, so one URL serving different bytes to desktop and
mobile would have bled across variants.

**3. `speculationrules` and `<meta http-equiv=refresh>` were passed through live.**
The "a non-JavaScript `type` never executes" rule is correct for `application/json`
and importmaps, but wrong for `<script type="speculationrules">`: Chrome reads
that JSON and issues real prefetch and **prerender** navigations to the URLs in
it. Those requests would reach source hosts while appearing in no residual
record. A meta refresh would simply navigate the reviewer's browser off the
clone.

**Fixed:** a `BROWSER_ACTIONABLE_SCRIPT_TYPES` set neutralizes speculation rules
alongside executable scripts, and meta refresh has its `content` moved to
`data-preservation-refresh`. Smoke checks 25 and 26.

## MINOR — four fixed, one documented

| # | Finding | Action |
|---|---|---|
| 4 | `ResourceCandidate.capturedBody` was declared and consumed but never populated — dead code implying an optimization that does not exist | **Removed**, with a comment stating that Phase 1 inventories assets but never downloads them |
| 5 | `{attr: "xlink:href"}` was unreachable: parse5 stores that attribute as `name: "href", prefix: "xlink"` | **Removed** the dead spec; the plain `href` entry already covers both, now documented |
| 6 | The CSS scanner had no comment awareness, contradicting its own doc comment that comments survive untouched | **Fixed**: comment spans are computed and references inside them are skipped. Smoke check 27 |
| 8 | `preserve-sanity.ts` hardcoded a Korean string and a magic height threshold | **Fixed**: now `--expect-text` and `--min-height` flags |
| 7 | `<link rel=manifest>` is localized, but the icon URLs *inside* the manifest JSON are not parsed, so a PWA install prompt could contact the source outside the residual ledger | **Documented**, not fixed — parsing web app manifests is new surface, and the path only triggers on an install prompt. Carried to `08-phase3-handoff.md` |

## NOTE — confirmed correct

The reviewer spot-checked and confirmed against the real artifact: desktop/mobile
separation, cascade-order preservation through in-place DOM editing with no
hoisting, `<noscript>` tracker neutralization, srcset descriptor preservation,
content-hash asset dedupe, honest reporting of the 98 MB over-budget hero video,
and path-traversal containment in the preview server. It also confirmed that no
host-specific logic exists in any production code path — `apartmentary` appears
only in doc comments and reports.

## After the fixes

- fixture smoke **43/43**
- repo typecheck clean
- Apartmentary rebuilt, browser sanity **3/3 OK**
- render unchanged (heights 6,056 / 5,880 / 4,804 and rule counts 598 / 598 / 522
  are identical to the pre-fix build) — the fixes corrected the ledger and
  neutralization, not the page
