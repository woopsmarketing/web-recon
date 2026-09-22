# Phase 2 — Preservation Clone architecture

## The governing decision: edit the runtime DOM in place

The builder parses `document/runtime.html` and **mutates that tree**, rather
than generating a document from a model of the page.

Everything else follows from this. Class names, `data-*` attributes, ARIA
attributes, inline styles, element order and nesting all survive because nobody
regenerates them. Most importantly, **every `<style>` and `<link>` keeps its
original position**, so the cascade is preserved by construction. There is no
reassembly step that could reorder sheets, and no code path that can inject a
stylesheet twice.

`document/response.html` is kept as bootstrap provenance in the manifest and is
never used as the visual document.

## Pairing style entries to DOM nodes

`StyleEntry.order` is an index into `document.styleSheets`, which the browser
builds from `<link rel=stylesheet>` and `<style>` elements in document order.
The builder collects exactly those elements in document order and pairs entry
*N* with node *N* — then **verifies** the pairing rather than trusting it
(`build.ts`, `nodeKindMatches`): a `linked` entry must land on a `<link>` whose
resolved `href` equals the entry URL, and every other entry must land on a
`<style>`. If any pair fails, the builder falls back to matching on
`ownerAttributes` and records a warning in the manifest.

On the canonical run all 9 entries paired by document order in both viewports,
with `domMatch: "document-order"` recorded for each.

Entries with no element of their own — `sourceType: "import"` (nested `@import`
sheets) and `"adopted"` — are excluded from pairing and handled separately.

## One representation per stylesheet

Emitting authored text *and* a CSSOM snapshot for the same entry would apply the
same rules twice at two cascade positions. The builder structurally cannot: the
preparation step returns a single `text`, chosen by a fixed priority.

| Condition | Representation | Where it goes |
|---|---|---|
| `authored.status = captured`, linked | `authored-linked` | `styles/<sha256>.css`, `<link href>` repointed |
| `authored.status = captured`, style tag | `authored-inline` | back into the same `<style>` element |
| authored unavailable, `cssomSerialized = captured` | `runtime-derived-cssom` | same `<style>` element, tagged `data-preservation-style="runtime-derived"` |
| authored unavailable, linked, no snapshot | `source-hosted` | `<link>` still points at the source; recorded as residual |
| neither | `unresolved` | element left empty, recorded honestly |

CSSOM snapshots are labelled `runtimeDerived: true` everywhere they appear. They
are a record of what had settled at capture time, not source anyone wrote.

## Desktop and mobile are never merged

The source serves different DOM trees and different CSS-in-JS stylesheets per
viewport. Merging them would fabricate a page that never existed. Each variant
is built from its own Source Package. Only **byte-identical resources** are
shared, via content-addressed storage.

The clone does not switch trees on resize — that is Phase 3 runtime
preservation. Each variant exercises only its own CSS, which it does natively:
`@media`, `@container` and `@supports` are still live queries in the clone.

## What is rewritten, and what is not

Two kinds of edit are made. Nothing else.

**1. Resource URLs.** An allowlist of URL-bearing attributes is used
(`dom.ts`, `urlAttrsFor`) — never a scan for URL-shaped strings. A localized
resource becomes `../assets/<sha256>.<ext>`; anything *not* localized is
**absolutized to the source** so it reaches the real host instead of 404ing
against localhost, and is recorded as a residual dependency.

CSS is rewritten by a token scanner that splices only the `url(...)` and
`@import` payload spans (`css-urls.ts`). Selectors, `calc()`, `clamp()`,
`@media`, custom properties, vendor prefixes, comments and whitespace are
byte-identical. `data:`, `blob:` and fragment references like `url(#mask)` are
left alone by rule.

`srcset` is parsed structurally and each candidate rewritten with its `1x` /
`800w` descriptor intact. Collapsing a srcset to one measured `currentSrc` would
be precisely the observation-derived flattening Phase 2 forbids.

**2. Anything executable.**

| Surface | Treatment |
|---|---|
| Executable `<script>` | `type` → `text/plain`, `src` → `data-preservation-src`; bytes kept |
| `<script type="speculationrules">` | neutralized — JSON, but Chrome acts on it and prefetches/prerenders |
| Non-executable `<script>` (`application/json`, `ld+json`, importmap…) | kept verbatim |
| `<meta http-equiv="refresh">` | `content` → `data-preservation-refresh`; the clone cannot navigate itself away |
| Inline `on*` handlers | moved to `data-preservation-on*` |
| `javascript:` hrefs | `href="#"`, original kept in a `data-*` attribute |
| `<iframe>`, `<object>`, `<embed>` | URL → `data-preservation-src`; all three are nested browsing contexts |
| Trackers (`matchProvider` kind analytics/ads/tag-manager/monitoring) | never fetched, reference neutralized |
| `rel=preload/prefetch/preconnect/…` | removed — no visual contribution, pure source-host chatter |

Executability is decided by the browser's own rule: a `type` that is not a
JavaScript MIME and not `module` never executes. That is a generic policy, not a
list of known script vendors — with one documented exception, `speculationrules`,
where the browser acts on non-JavaScript content.

`<object>` and `<embed>` are neutralized rather than localized. Localizing their
bytes would not make them safe: an SVG or HTML document loaded through them
executes its own `<script>`, unlike the same file in an `<img>`.

### `<noscript>` — the blind spot that was closed

parse5 defaults to `scriptingEnabled: true`, which makes `<noscript>` contents
**raw text**. A walker never sees inside. This capture hides a Facebook tracking
pixel and a Google Tag Manager iframe there, and as text they would have passed
straight through into the clone untouched. The builder parses with
`scriptingEnabled: false` so that markup is real and gets neutralized like
anything else (`dom.ts`, `parseDocument`).

## Genericity

No host, path or site name appears in any production code path. Apartmentary
occurs only in CLI invocations and in these reports. The fetch allowlist is
**derived from capture evidence** — only hosts the source page actually
contacted are reachable — rather than being open-ended or hard-coded.
