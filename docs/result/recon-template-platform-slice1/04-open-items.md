# 04 — Open items / honest limits

Nothing here blocks Slice 1. Each item names when to revisit.

## Hardening not done (documented, not faked)

| # | Item | Current state | Revisit |
|---|---|---|---|
| O1 | **Builder is not built from the release.** Snapshot loader, visibility filter, asset selection, package QA and pointer logic run from the repository working tree; the preflight runner (`tsx`) comes from the repo's `node_modules`. | Recorded verbatim in every build record (`hermeticity`). Only *rendered* code (template + platform runtime) comes from the verified release | Before live customer builds: run the builder from a pinned builder snapshot, or treat builder changes as class-B with fixture regression |
| O2 | **Shared pnpm content store.** Workspaces install `--offline --frozen-lockfile --ignore-scripts` from the release's scoped lockfile, but through the machine-wide store | Integrity comes from pnpm's lockfile integrity hashes | CI/build host setup |
| O3 | **Release gates are static scans.** The template-code gate is TypeScript-AST based (allowlist); the forbidden-term scan, SVG allowlist and CSS scans are text-based | Adequate for authored first-party template code; not a sandbox | If templates are ever authored by third parties |
| O4 | **Package QA checks references, not behaviour.** Runtime network is checked only by the visual smoke (0 non-local requests) | Both run for Slice 1 | Make the browser smoke a build gate when builds are automated |
| O5 | Toolchain identity = node + pnpm + os/arch. Next/React versions are covered through the release lockfile | Fine for one machine | Multi-host builds |
| O6 | Binary asset bytes (PNG/JPEG/WebP) are not scanned; only SVG text is | All fixtures are generated SVG | When raster customer uploads arrive (probe dimensions/type) |

## Scope deferred by the spec

Portfolio list/detail routes and pagination (**next step**), filters, posts/reviews/services/FAQ/about/
locations/legal, inquiry, Supabase/CMS/editor/auth/billing, server mode and tag invalidation, template
switching, second Template, canary/batch rollout/last-good hold/dashboard, generic SEO helpers
(robots/sitemap: one route only), `featured` selection mode (no `featured` field consumer yet).

## Template-level notes

- `link` and `media` slot types exist and are tested but no interior-01 v1 section declares one yet
  (a `moreLink` needs `/portfolio`, Step 4; no section media in this Slice).
- All visible template UI labels are now slots with neutral defaults (`homeLinkLabel`, `projectsNavLabel`,
  `contactLabel`, `companyLabel`, `emailLabel`). A per-locale default table (instead of English
  defaults that a non-English site overrides) is deferred until a second locale site needs it.
- `link` slots refuse external `https://` hrefs in this Slice. An external-link policy (and the matching
  package-QA allowance) comes with the first section that needs one.
- fixture-empty renders an empty main area between header and footer. That is the honest empty
  behaviour (no fake card, no wrapper); an intentional empty-state/hero belongs to the full homepage
  Template (Step 5).
- Visual fidelity to the source was not a Slice 1 goal: the layout follows the observed structure
  (sticky header, 4-col ≥900 / 2-col mobile grid, dark footer, 900 px band) but was not compared with
  the Faithful Clone.

## Process notes

- Releases in the store: `interior-01-1.0.0-1ddf327cb1b9` (the first review-fixed release; it backs every
  site's `previous` package) and `interior-01-1.0.0-f27823c3b837` (final, after the second review; every
  site's `current` is pinned to it). Two earlier dev-iteration releases (`…-d7fde5ea95b3`, `…-71a2590acc11`)
  were deleted before any site was published on them.
- `data/` is git-ignored, so fixture data, the release store and packages are local artefacts. All of them
  can be reproduced with the commands in `03`.
- The Write tool once turned `\u0000` escapes into raw control bytes (the theme regex), and `\s` inside
  non-raw template literals lost its backslash. Both were fixed (escapes restored, `String.raw`). All
  new files were scanned: no control bytes are left.
