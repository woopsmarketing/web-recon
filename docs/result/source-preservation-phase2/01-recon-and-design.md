# Phase 2 — Reconnaissance and design

Three parallel read-only agents surveyed the repository before any code was
written, so the builder could extend what exists rather than grow a parallel
universe beside it.

## A. Source Package (the input contract)

- `loadSourcePackage(dir)` — `src/source-package/store.ts:140` — returns
  `{dir, manifest, styles, scripts, assets, network, config}`. This is the only
  entry point the builder uses.
- `StyleEntry` — `src/source-package/types.ts:334` — carries `order` (index into
  `document.styleSheets`), `sourceType`, `declaredIn`, `ownerAttributes`,
  `authored: BlobRef` and `cssomSerialized?: BlobRef`. Blob `file` paths are
  package-dir relative.
- `AssetEntry` — `types.ts:448` — inventory ONLY. Phase 1 never downloads a
  byte of image, font or media, so Phase 2 owns all materialization.
- `ScriptEntry` — `types.ts:382` — `body: BlobRef` holds captured JS, and
  `executionIndependence` is permanently `"unknown"`.
- Canonical run counts (desktop / mobile): styles 9/9, scripts 31/30,
  assets 72/65, network 84/85.

## B. Asset pipeline — reused, with one deliberate exception

- `safeFetchAsset` — `src/assets/safe-fetch.ts:345` — SSRF-hardened: scheme and
  port allowlists, DNS pre-resolution rejecting private/CGNAT/link-local ranges,
  a pinned-lookup socket that defeats TOCTOU re-resolution, manual redirect
  re-validation per hop, and a streamed byte cap. **Reused as-is.**
- `extensionForMime` — `safe-fetch.ts:143` — reused for naming.
- `mapWithConcurrency` — `safe-fetch.ts:441` — reused for bounded parallelism.
- `createAssetMaterializationRun` — `src/assets/materialize.ts:76` — **NOT**
  reused. It is Task 22 machinery for brand-independent *production* output: it
  refuses to self-host fonts pending licence review (`fonts.ts:12`) and rewrites
  assets it classifies `replacement-required`. A preservation clone needs the
  opposite — a faithful local copy, fonts included, because fonts change line
  breaking and therefore layout. The new code reuses the fetch *primitive* and
  supplies its own policy. This is the one intentional non-reuse.
- `matchProvider` — `src/source-package/classify.ts:202` — reused so the clone
  identifies trackers through the repo's existing provider vocabulary instead of
  a host list invented here.

## C. HTML / CSS parsing

- `parse5` is already a dependency and is the repo's HTML parser of record
  (`src/seo/head-parse.ts:1`, `src/sitespec/asset-catalog.ts:1`). **Reused.**
- There is **no CSS parser** in the repo, and no AST-level rewriter. The
  existing `applyRewrite` (`src/assets/rewrite.ts:32`) is whole-body string
  substitution keyed on absolute URLs. That is unsuitable here: preserved CSS
  contains *relative* `url()` references that must resolve against each
  stylesheet's own base, and Phase 2 forbids reformatting. A token scanner was
  written instead (`css-urls.ts`) that edits only the payload spans.
- There was **no parse5-AST attribute rewriter** anywhere in the repo. One was
  needed, because regex-substituting every URL-shaped string across a document
  would corrupt the `data-*` and JSON payloads Phase 2 must preserve.

## D. Preview / static serving

- Every existing `*:preview` CLI proxies a running Next app
  (`src/assets/serve.ts:161`, `src/theme/serve.ts:66`, `src/seo/serve.ts:115`,
  `src/authoring-preview/serve.ts:156`). None serves a plain directory.
- `src/production/static-server.ts:104` emits a static server, but as a
  generated `server.mjs` for an exported Next site — not reusable as a library.
- A Preservation Clone is a directory of plain HTML, CSS and binaries. Bending
  it into a Next app would mean a build step re-emitting the very markup being
  preserved. A ~110-line static server was added instead — the smallest generic
  seam, not a new dev platform.

## E. Conventions adopted

- `makeRunId` imported from `src/observer/store.ts:73` rather than reimplemented
  (six modules currently reimplement that one-liner).
- Artifact path follows `data/<host>/<category>/<run-id>/`.
- CLIs are standalone `src/cli-*.ts` entrypoints wired 1:1 in `package.json`.
- The smoke follows the `check()` / counter / exit-code pattern of
  `scripts/smoke-source-package.ts:63` and is auto-collected by `smoke:all`.
