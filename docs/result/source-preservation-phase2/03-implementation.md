# Phase 2 — Implementation

## Files added

| File | Lines | Role |
|---|---|---|
| `src/preservation-clone/types.ts` | 340 | zod schemas: manifest, resource map, residual dependencies |
| `src/preservation-clone/css-urls.ts` | 174 | `url(...)` / `@import` token scanner + span-splice rewriter |
| `src/preservation-clone/dom.ts` | 292 | parse5 helpers, URL-attribute allowlist, srcset parse/serialize |
| `src/preservation-clone/resources.ts` | 281 | materialization policy over `safeFetchAsset` |
| `src/preservation-clone/build.ts` | 1305 | the builder |
| `src/preservation-clone/serve.ts` | 123 | static localhost preview |
| `src/preservation-clone/index.ts` | 25 | public surface |
| `src/cli-preserve-build.ts` | 104 | build CLI |
| `src/cli-preserve-preview.ts` | 62 | preview CLI |
| `scripts/smoke-preservation-clone.ts` | 781 | fixture smoke (43 checks) |
| `scripts/preserve-sanity.ts` | 137 | lightweight browser sanity |

`package.json` gained four scripts and nothing else. **No existing file was
modified.**

## Data flow

```
observation run
  └─ viewports/<id>/source-package/     (read-only input)
        │
   pass A  read + decide, no network
        │   parse runtime.html (scriptingEnabled: false)
        │   pair StyleEntry ↔ DOM node, verify
        │   choose ONE representation per stylesheet
        │   collect resource candidates:
        │     · asset inventory (http/https)
        │     · url(...) in every preserved stylesheet, resolved per-sheet
        │     · URL attributes + inline style="" url(...)
        │
   pass B  materialize once, globally
        │   safeFetchAsset under an evidence-derived host allowlist
        │   content-addressed write to assets/<sha256>.<ext>
        │
   pass C  rewrite + emit, per viewport
        │   splice CSS url() spans; write styles/<sha256>.css
        │   rewrite DOM attributes; neutralize everything executable
        │   serialize → <viewport>/index.html
        │
        └─ manifest.json · resource-map.json · residual-dependencies.json
```

Two passes exist because CSS must be *read* to discover resources but *rewritten*
after they are materialized.

## Decisions worth recording

**Fetch allowlist derived from evidence.** `allowedHosts` is built from the
hosts the source page actually contacted during capture. The clone builder
cannot reach anywhere the source did not.

**Hostname, not host.** `SafeFetchPolicy.allowedHosts` is checked against
`URL.hostname`. Deriving the allowlist from `URL.host` looked equivalent and is
not: any URL on a non-default port would have been rejected as
`host-not-allowed`. Caught before the first real build; `hostOf` now returns
hostname and Phase 1 `host` fields are port-stripped.

**Media gets its own budget.** One 98 MB hero MP4 would otherwise dominate the
artifact. Default `maxMediaBytes` is 8 MB against 30 MB for other assets. When
Phase 1 recorded a `Content-Length` over budget the builder skips without any
request; otherwise `safeFetchAsset`'s streamed cap stops it mid-flight.

**MIME relaxation is recorded, not silent.** If a fetch is rejected only because
the server's `Content-Type` disagrees with the expected asset kind, it is
retried once as `any` and the record carries `mime-relaxed from "<kind>"`.
Refusing real bytes over a Content-Type quibble loses preservation evidence;
doing it quietly would be dishonest.

**Unlocalized means absolutized.** Any URL that could not be localized is
rewritten to its absolute source form. Without this, relative source URLs would
resolve against localhost and 404, producing fake breakage that looks like a
preservation failure. Every such URL is recorded as a residual dependency.

**Same URL, different bytes.** Storage is keyed by content hash, so two captures
of one URL that differ produce two files rather than one silently overwriting
the other.

**Inert, not deleted.** Neutralized scripts keep their bytes, neutralized
handlers and tracker URLs move to `data-preservation-*` attributes. Nothing
executable is thrown away — Phase 3 needs it, and a reviewer should be able to
see what a page shipped.

**One record per resource, not per occurrence.** A script preserved for both
viewports is one ledger entry marked `shared`, not two. Inline scripts are keyed
by content hash rather than Source Package id, because ids are per-package and
`sc0001` means different code in each viewport. (This was wrong in the first
implementation and inflated the localized count by 19; see
`06-independent-review.md`.)

**CSP belt-and-braces.** The preview server sends
`Content-Security-Policy: script-src 'none'`, so even a mistakenly re-enabled
script could not run during review.

## Known minor gaps, deferred

- `sourceType: "import"` (nested `@import`) and `"adopted"` stylesheets are
  implemented generically but were **not exercised**: the canonical run contains
  zero of each.
- Phase 1 carry-forward debt (duplicate stylesheet response listener, camelCase
  query-key redaction, aggregate byte budget) was untouched — none of it blocked
  Phase 2.
- `<link rel=manifest>` is localized, but icon URLs *inside* the manifest JSON
  are not parsed, so a PWA install prompt could reach the source host without a
  residual record. Carried to Phase 3.
