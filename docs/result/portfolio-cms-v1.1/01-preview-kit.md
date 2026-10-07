# Portfolio CMS V1.1 — 01 Preview renderer kit

2026-10-07 · branch `track-b/static-deployment-foundation` · base `662ab53` · not committed, nothing published.

**Status: DONE — the kit and its proof are complete and the full `pnpm test:platform` chain passes.
The one decision that was open (the platform fingerprints, §7) was taken by the orchestrator: Option A.**

## 1. What was added

| file | what it is |
|---|---|
| `platform/preview/entry.tsx` | `createProjectPreviewRenderer(deps)` → `renderProjectPreview(input)`. Pure. The code inside a kit. |
| `platform/preview/next-link-shim.tsx` | `next/link` as the anchor it renders (bundled in place of `next/link`). |
| `platform/preview/kit.ts` | `buildPreviewKit` / `writePreviewKit` / `readPreviewShell`: site shell + pinned release → the two kit files. |
| `platform/cli/preview-kit.ts` | `pnpm site:preview-kit --site <siteId> --out <dir>` |
| `platform/test/preview-parity.test.ts` | the proof (13 checks), appended to `pnpm test:platform`; alone: `pnpm test:preview-kit` |
| `platform/test/preview-surface.ts` | `isPreviewSurface()` — the predicate that admits this additive surface to the platform fingerprints (§7) |
| `platform/test/ia150.test.ts`, `ia152.test.ts`, `step6.test.ts` | one import + one predicate term each (two in `step6`), §7 — the only existing files touched besides the two below |
| `package.json`, `pnpm-lock.yaml` | scripts `site:preview-kit`, `test:preview-kit`; `test:platform` chain +1; devDependency `esbuild` pinned to `0.28.2` (the version `tsx` already installs: 3 lockfile lines, no new package) |

No existing source, template, release, site, worker or publish file changed; no existing assertion was removed or weakened.

A kit is two generated files. They are **not committed here**; BoostChat vendors them.

- `renderer.mjs` — one ESM file, 538 236 B for the demo, **no import of any kind**. It bundles the
  release's own `PortfolioDetail` / `ProjectGallery` / `projectCards` / `ProjectCard` / `SiteHeader` /
  `SiteFooter` / `template.ts`, the release's own copy of the platform runtime (`createSiteContext`
  …), react 19.2.8 · react-dom 19.2.8 · zod 4.4.3 (the versions the release's `package.json` pins —
  generation fails if the checkout has others), the site shell and the release's `template.css`.
  Exports `renderProjectPreview` and `kit`.
- `kit.json` — `{ kitFormat: 1, siteId, templateId, templateVersion, releaseId, releaseHash,
  templateCssSha256, shellSha256, shellAssets, sourceCommit, generatedBy, files: { "renderer.mjs": sha256 } }`.
  `shellSha256` / `shellAssets` are additions to the requested field list. No timestamp.

## 2. Consumer contract

```js
const { renderProjectPreview, kit } = await import("./vendor/preview-kit/renderer.mjs"); // plain Node ≥ 22, server-side
const result = renderProjectPreview({ project, categories, assets, assetUrls });          // synchronous, 5–25 ms
```

### Input

| field | value | checked with |
|---|---|---|
| `project` | ONE item of the export's `projects[]` (BoostChat `TrackBProject`), unchanged | `ProjectSchema`, `ProjectsDocSchema` |
| `categories` | the export's `categories[]` (`{ id, name }[]`) | `PortfolioExportSchema`, `CategoriesDocSchema`; the record's `category` must be in it (P2) |
| `assets` | the export's `assets[]` entries (`{ id, file, mediaType, width, height, sha256, size, href }`) for the images the record references — cover, gallery `image`, gallery `before` | `PortfolioExportSchema` (strict); every referenced id must be present (P3); extra entries are ignored |
| `assetUrls` | `{ [assetId]: url }` — what the preview shows for each referenced image | `http(s)://…`, root-relative `/…`, `data:image/(jpeg\|png\|webp\|svg+xml)…` or `blob:…` |

**`assets` is one field more than the brief's `{ project, categories, assetUrls }`.** The real markup
carries each image's intrinsic `width` / `height` (`<img width height>`), which only the export's
asset entries hold; without them the layout — and parity — would be wrong. BoostChat already has every
field (`portfolio_asset` row + `publisherAssetHref`).

`status` may be `"published"` or `"draft"` (a preview is of an unpublished record; the document is
identical either way). An unknown input key is refused. `assetUrls[<logo id>]` (see `kit.shellAssets`)
optionally overrides the header logo; by default the logo is the site's own file, embedded as a
`data:` URI.

Minimal example (renders with the demo kit):

```js
renderProjectPreview({
  project: { id: "p-001", slug: "suseong-34py-remodeling", title: "수성구 34평 리모델링", status: "published",
             publishedAt: "2026-10-07T09:00:00+09:00", category: "apartment", cover: { asset: "p001-cover" } },
  categories: [{ id: "apartment", name: "아파트" }],
  assets: [{ id: "p001-cover", file: "p001-cover.jpg", mediaType: "image/jpeg", width: 1600, height: 1200,
             sha256: "<64 hex>", size: 123456, href: "/api/publisher/sites/boost-interior-demo/assets/p001-cover" }],
  assetUrls: { "p001-cover": "/api/admin/…/p001-cover" },
});
```

### Output

- `{ ok: true, detailHtml, cardHtml }` — two complete documents: `<!DOCTYPE html>`, `<html lang>`,
  charset, viewport, `<meta name="robots" content="noindex,nofollow">`, three `<style>`s
  (`#template-css` = the release's file verbatim, `#site-theme`, `#preview-only`), no `<script>`,
  no handler; the only things a browser fetches are the URLs in `assetUrls`.
  - `detailHtml`: `<body>` = site header · `<main>` · site footer, as the real page.
  - `cardHtml`: the card as `/portfolio` shows it, inside the list's own layout ancestors
    (`main.i1-main > section.i1-plist > div.i1-container > ul.i1-plist__grid`, each marked
    `data-preview-only`); no header/footer.
  - Preview-only: one style outside `<main>`, `<style id="preview-only" data-preview-only>` — links
    do not react to the pointer. Intended use: `<iframe srcdoc sandbox>`; size the iframe to the
    viewport width to preview (the CSS uses viewport media queries).
- `{ ok: false, problems: [{ path, message }] }` — e.g. `project.title`, `project.category`,
  `assets.0.width`, `assets`, `assetUrls.<id>`, `(render)` (the release's own refusals, e.g. a
  reserved slug such as `page`). **Never throws.**

### Which transform runs

`generate.ts` could not be imported: its transform exists only as `planManagedPortfolio`, which needs
the whole export, every image's bytes (size / sha256 / magic number) and a site directory's state, and
hashes with `node:crypto`. The kit therefore calls the same schema code that function calls
(`PortfolioExportSchema` from `portfolio-sync/contract.ts`; `ProjectSchema`, `ProjectsDocSchema`,
`CategoriesDocSchema`, `projectAssetRefs` from `content/schema.ts`) and restates no field rule. There
is no mapping to duplicate: the generator writes the parsed record unchanged, and an export asset
minus `sha256 / size / href`. The test holds this to the real thing — its build is produced BY
`planManagedPortfolio` + `applyFilePlan` from the same export records the kit is given (check B0).
Only asset materialisation differs: `/assets/<sha20>.<ext>` in a build, the caller's URL in a preview.

## 3. Regenerating

```
pnpm site:preview-kit --site boost-interior-demo --out <dir>      # ~5 s; reads only; no network, build or publish
```

Reads the site shell (`site.json`, `settings.json`, `theme.json`, `slots.json`, `inquiry.json`,
`content/business.json`, the logo) directly with the loader's schemas — not through
`buildSiteSnapshot`, so it works in a development checkout where the demo's portfolio is not generated
(the marker is untouched). Loads and re-hashes the pinned release with `loadRelease` / `verifyRelease`.
Same inputs → byte-identical files. `sourceCommit` is HEAD, with `-dirty` when a kit input is uncommitted.

**The kit is stale when** the site is re-pinned (`releaseId` / `releaseHash`), when the shell changes
(`shellSha256`: identity, settings, slots, theme, inquiry, business, logo), or when this platform's
schema code changes. Regenerate and re-vendor after each.

## 4. Parity guarantee

For every one of the 19 records of the demo's QA corpus, with the SAME export record given to both
sides (export → real generator → real `next build` of the pinned release, vs. the kit):

| region | result | normalisation |
|---|---|---|
| detail `<main>` | 19/19 **byte-identical** (116 659 B) | none |
| site header, site footer | 19/19 byte-identical | none |
| card vs. the card on built `/portfolio` | 3/19 identical, 16/19 identical except D2 | none |

Real differences, asserted as such (not normalised away):

- **D1** Outside `<main>` the built `<body>` also holds Next's own nodes: an empty `<div hidden>`,
  empty Suspense marker comments, its `<script>`s. The kit's `<body>` is header · main · footer.
- **D2** A card cover's `loading` is a function of the card's position in a list (first three
  `eager`, the rest `lazy`). The kit renders the card alone → `eager`.
- **D3** `<head>` differs by design (inline CSS + noindex,nofollow instead of the stylesheet link,
  scripts and SEO metadata).

`next/link` shim: proven by the byte equality above (every `<a>` in header, main, footer, card).

One-off visual check (not in the suite; Chromium, external requests blocked): built page vs. kit
document, records bi-01 / bi-04 / bi-08 × 1440 / 1024 / 390 px, full page → **0 differing pixels** in
all 9, with the built page's JS on and off. (An earlier `renderToStaticMarkup` variant differed by
169–1 247 px in the gallery tab labels: React's `<!-- -->` text separators change sub-pixel kerning.
The kit renders with `renderToString` so the text nodes are the page's.)

### Limits

- **Static initial state.** No hydration: gallery tabs, before/after toggles, the photo viewer and the
  mobile menu do not respond. What is shown is the page as first painted.
- The embedded CSS is the release's authored `template.css`; the public site serves Next's minified
  build of the same file. Equal pixels were measured in Chromium only.
- The built HTML comes from Next's bundled React, the kit's from react-dom 19.2.8. Their equality is
  what the test measures for this release, not a property guaranteed for a future one — re-run the
  test after every re-pin.
- Chrome that depends on the rest of the portfolio is rendered for a one-project site (today nothing
  in header / footer / detail depends on it).
- Links are inert to the pointer only (keyboard activation would navigate the iframe).
- The shell embeds values that are already public on the site (business e-mail, inquiry endpoint URL).

## 5. Tests

| run | result |
|---|---|
| `pnpm typecheck:platform` | pass |
| `pnpm test:platform`, whole chain, one run (298 s), after the §7 edit | **exit 0 — 432 passed, 0 failed** |

Per suite (passed / failed): slice1 86/0 · step4 47/0 · step41 35/0 · step5 32/0 · polish 4/0 ·
step52 12/0 · step6 34/0 · predemo 10/0 · predemo2 9/0 · ia150 15/0 · ia151 10/0 · ia152 14/0 ·
integration 85/0 (0 skipped, 1 point-in-time) · detail-facts 26/0 · **preview-parity 13/0** (new, ~10 s,
one real throwaway build; alone: `pnpm test:preview-kit`).

Before the §7 edit the same chain stopped at `step6`: 4 checks failed (`ia150` R3, `ia152` R2,
`step6` D and D2), all four on "a file was added under `platform/`" and nothing else.

The build cannot be shared with `detail-facts.test.ts`: every test file is its own process.

## 6. Stale-kit signal on the public site — none today

No artifact BoostChat fetches from the public site carries the template id, version or releaseId:

- `/_integration/manifest.json` = `{ schemaVersion, site: { id, publicOrigin, locale }, resources.portfolio: { href, version } }`
- `/_integration/portfolio.<version>.json` = `{ schemaVersion, resource, version, listingUrl, workScopes, facets, records }`
- the publisher's result POST = `{ schema, revision, outcome, packageHash, portfolioVersion, verified }`

`releaseId` exists only in R2-internal objects the worker never serves (`routing/<host>.json`, the
package seal `_package.json` → 404). Until one of the above carries it, staleness has to be checked at
re-pin time, in this repository.

## 7. The platform fingerprints — decided: Option A (applied)

`ia150` R3, `ia152` R2 and `step6` D / D2 hold `platform/` (minus `test/`) byte-identical to old
captures and fail on any added file. Every earlier addition (publish, integration, portfolio-sync)
was admitted by a `*-surface.ts` predicate plus one term in those three tests. The preview surface
(`platform/preview/**`, `platform/cli/preview-kit.ts` — `preview-surface.ts`) now follows the same
mechanism. Applied on the orchestrator's decision (line numbers as before the added import):

```
ia150.test.ts:170   … || isPortfolioSyncSurface(f) || isPreviewSurface(f) || …
ia152.test.ts:197   … && !isPortfolioSyncSurface(f) && !isPreviewSurface(f) && …
step6.test.ts:275   … || isPortfolioSyncSurface(p) || isPreviewSurface(p) || …
step6.test.ts:293   … || isPortfolioSyncSurface(f) || isPreviewSurface(f) || …
+ import { isPreviewSurface } from "./preview-surface";   (each file)
```

That is the whole diff of the three files (7 insertions, 4 deletions). The surface is additive: no
build, render, release or publish path imports it, so the fingerprints still prove what they proved.
Rejected alternative (Option B): moving the kit code out of `platform/`, which would have left the CLI
and the shim outside `typecheck:platform`.

## 8. Notes

- `pnpm install --offline --frozen-lockfile` linked `node_modules/esbuild` but exited with
  `ERR_PNPM_NO_OFFLINE_META` (supply-chain policy check); pnpm's own pre-run check then completed the
  install online. Lockfile diff = the 3 importer lines.
- Time (approx.): reading 25 min · implementation 45 min · debugging 10 min · tests/verification
  30 min · report 10 min · rework 10 min (static markup → `renderToString`). Longest: reading the build
  / release / sync pipeline; the parity test; the full platform run that surfaced §7. Avoidable next
  time: check the `*-surface.ts` fingerprints before choosing file locations.
