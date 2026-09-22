# 01 — Implementation

## Forensic classification (existing code)

| Existing module | Decision | Why |
|---|---|---|
| `src/theme/types.ts` token vocabulary + `isSafeThemeValue` | **EXTRACTED as pure copy** → `platform/theme/theme.ts` | zod-only, but the `src/theme` barrel reaches playwright + `recon-template/parity-qa`. Token ids and value rule kept identical (curated library themes stay valid) |
| `src/slotized-template/site-identity.ts` `SiteIdentitySchema` | **EXTRACTED (subset)** → `platform/site/instance.ts` | loader pulls legacy slotized-template error types; `slug` replaced by `siteId`, `logo` asset ref added |
| sha256 / stable JSON helpers | **REIMPLEMENTED SMALL** → `platform/util/hash.ts` | 4 duplicated legacy copies, some legacy-adjacent |
| `src/production/bake.ts` `next build` spawn | **REIMPLEMENTED SMALL** (pattern only) | legacy module passes full `process.env`, resolves deps upward, imports legacy content/brand modules |
| truth-mode, brand-leak, release brand-scan | **DO NOT USE** | all import `recon-template`/`content-injection`; small forbidden-term scanner reimplemented in `platform/release` |
| SEO plan / render-head | **DEFERRED** | one route; Next `generateMetadata` (title, description, metadataBase, preview noindex) is enough for Slice 1 |

No module under `src/` is imported by `platform/` or `templates/` (checked by test).

## Layout

```
platform/
  util/hash.ts               canonical JSON + sha256
  content/schema.ts          Core business + Interior projects/categories (zod, strict), origin enum
  content/reader.ts          ContentReader: getSingleton, list(closed descriptor)
  settings/settings.ts       Defaults ⊕ sparse overrides = Effective Settings; ProjectSelectionSchema; settings → query
  slots/slots.ts             minimal section-level Slot model (text · richText · link · media) + fallback chain
  theme/theme.ts             theme-contract-v1 tokens, consumed-token validation, CSS var emitter
  assets/assets.ts           asset registry schema, content-addressed public paths, AssetResolver
  site/instance.ts           SiteIdentity, exact TemplateReleasePin, SiteInstance, SiteSnapshot schemas
  site/template-manifest.ts  defineTemplate (id, version, sections, theme.consumes, routes)
  site/context.ts            createSiteContext (pure; checks site/mode/release pin)
  site/bound.ts              build-time binding: getSiteContext(manifest) via RECON_SITE_BINDING
  site/preflight.ts          runs in the workspace with the RELEASE's code; settings/theme/slot/selection summary
  site/load.ts               JSON store → canonical SiteSnapshot (only module that knows data/sites paths)
  release/release.ts         immutable content-addressed release snapshot, verify, template-code allowlist gate
  build/build-input.ts       buildInputId + toolchain identity
  build/qa.ts                static package QA (routes, local refs, srcset per candidate, absolute-URL allowlist over every text file incl. JS/RSC .txt, inline CSS, SVG inertness, forbidden terms)
  build/site-build.ts        site:build orchestration, packages, current/previous pointers
  cli/{template-release,site-build}.ts
  runtime/package.json + pnpm-lock.yaml   scoped deps (next, react, react-dom, zod, ts, types)
  dev/generate-fixtures.ts   deterministic fictional fixtures (excluded from releases)
  test/slice1.test.ts        validation suite (excluded from releases)
  tsconfig.json              bundler resolution, @platform/* alias

templates/interior-01/v1/
  template.ts                manifest: 3 sections' settings schemas + defaults + slot declarations, consumed tokens, routes
  theme.default.json         theme-contract-v1 default theme
  next.config.mjs            static export, deterministic build id, turbopack root = workspace root
  tsconfig.json              Next project tsconfig (@platform/* → ../../../platform/*)
  app/layout.tsx, app/page.tsx
  sections/SiteHeader.tsx, HomeProjectsA.tsx, SiteFooter.tsx, types.ts
  components/ProjectCard.tsx
  styles/template.css        authored CSS; brandable values only via var(--token)
  provenance.json            internal source record + forbidden terms; excluded from releases/workspaces
```

Commands (`package.json`): `template:release`, `site:build`, `fixtures:generate`, `test:platform`,
`typecheck:platform`. Visual smoke: `tsx scripts/template-platform-visual-smoke.ts`.

## Data flow

**Release contents** (26 files): `templates/interior-01/v1/**` (minus `provenance.json`, build outputs),
the platform *runtime* modules only (`content`, `settings`, `slots`, `theme`, `assets`, `site` minus the
JSON store loader, `tsconfig.json`), and the scoped `package.json` + `pnpm-lock.yaml`. The builder,
CLIs, release tooling, dev generator and tests are NOT in the release, so builder-only fixes do not
change `releaseHash` (they are class-B platform changes).

```
data/sites/<siteId>/{site.json, settings.json, slots.json?, theme.json?, content/*.json, assets/}
      │  platform/site/load.ts  (schema-validate, origin guard, visibility at (mode, at),
      │                          referenced assets only, sha256 → /assets/<hash20>.<ext>)
      ▼
SiteSnapshot ──hash──► siteSnapshotHash ─┐
pinned Release (verified re-hash) ───────┼─► buildInputId = H(releaseHash, siteSnapshotHash, mode, toolchainHash)
toolchain {node, pnpm, os, arch} ────────┘
      │
      ▼  workspace = $TMPDIR/recon-site-build/<site>-<id12>-…   (outside the repo)
release files + package.json/lockfile + .recon/{snapshot,binding}.json + public/assets/*
      │  pnpm install --offline --frozen-lockfile --ignore-scripts
      │  preflight (release code) → next build (output: export), allowlisted env
      ▼
out/ ──QA──► data/site-builds/<siteId>/packages/<buildInputId>/{site/, build-record.json}
             current.json → previous.json (older packages pruned); history.jsonl
```

Template code: `getSiteContext(template)` → `ctx.settings[...]`, `ctx.slots.text(section, key)`,
`ctx.content.list(projectsQuery(settings))`, `ctx.assets.resolve(ref)`, `ctx.identity`, `ctx.themeCss`.
It never sees a path, a store, a siteId literal or the wall clock (`at` is not exposed).

## Slot model (added requirement, `prompt2`)

New, section-level, semantic — **not** the legacy DOM-based Slot V2 / Slotized V1 (not imported).

| Concern | Lives in | Example |
|---|---|---|
| project items | ContentReader / `projects[]` | cards |
| enabled / limit / selection / showSummary | Site Settings | `home.projects-a.limit = 4` |
| section title / intro copy / nav + CTA labels / footer summary copy | **Slot** | `home.projects-a.title` |
| colors / typography / radius | Theme | `color.canvas` |
| brand name / legal name / logo / domain / locale | Identity + Asset | `identity.brandName` |

- **Types (closed):** `text` (plain, no markup, maxLength), `richText` (plain paragraphs, no HTML),
  `link` (`/path` (never `//`), `#anchor`, `mailto:`, `tel:`; external `https://` is refused in this Slice), `media` (asset ref + alt; asset goes
  through the registry/SVG checks).
- **Declared** per section in `template.ts` next to that section's settings; **site values** are sparse
  in `data/sites/<id>/slots.json` bound to one template id. Unknown section/slot, wrong type, markup,
  over-length, arrays/objects that are not the declared shape → fail. No per-item keys can exist:
  slot keys are fixed per section by the manifest.
- **Fallback:** site value → content binding (closed vocabulary; only `business.summary` today) →
  neutral UI default (non-factual labels only) → hide (optional) → **needs-input** (required: build fails,
  nothing invented). Each resolved slot's source is recorded in the build record (`preflight.slotSources`).
- **Declared slots in interior-01 v1:**

| Section | Slot | Type | Fallback |
|---|---|---|---|
| `site.header` | `homeLinkLabel` | text ≤24 | neutral default "Home" |
| `site.header` | `projectsNavLabel` | text ≤24 | neutral default "Projects" |
| `site.header` | `contactLabel` | text ≤24 | neutral default "Contact" |
| `home.projects-a` | `title` | text ≤40 | neutral default "Selected projects" |
| `home.projects-a` | `description` | richText ≤2×240 | hide |
| `site.footer` | `summary` | text ≤280 | binding `business.summary` → hide |
| `site.footer` | `companyLabel` | text ≤24 | neutral default "Company" |
| `site.footer` | `emailLabel` | text ≤24 | neutral default "Email" |

Bound values and neutral defaults are validated against the slot's own contract (type, plain text, length),
not trusted because they come from content or the template.

- `link` and `media` types are implemented and unit-tested but **no interior-01 v1 section declares one**:
  a `moreLink` would point at `/portfolio`, which does not exist until Step 4 (no dead links); there is
  no section media in this Slice. They will be declared when a consuming section exists.
- Header logo stays **identity** (not a slot); the footer summary slot *binds* to business content and
  never copies it.

## Key decisions

- **Copy is not a setting.** Settings hold behaviour only; `title` in settings is rejected (tested).
- **Settings merge** is shallow per section; override values (including the discriminated `selection`)
  replace defaults. Unknown section, unknown field, out-of-range value, other template → fail.
- **Selection modes implemented:** `latest` (default, exercised by fixture-large/empty), `category`
  (fixture-small), `manual` (negative test J). `featured` was not implemented: nothing in Slice 1 uses it
  and the content model has no `featured` field yet.
- **Manual ids** that are missing/unpublished are skipped and reported as warnings (study `06` contract);
  preflight copies them into the build record.
- **Origin guard:** every stored content/asset document carries `origin`; `reference-fixture` under
  `data/sites/**` fails the snapshot.
- **Identity vs business:** brand/legal name, locale, origin and logo live on the Site Instance identity;
  `business` (Core content) holds only summary + contact email. No duplicated names.
- **Time:** `at` decides visibility only; it is recorded in the build record, not hashed, and not exposed
  to templates. Template code has no clock access (allowlist gate rejects any `Date`, timers, random).
- **Template code gate is a TypeScript-AST allowlist** (not regex): relative imports must stay inside the template major; banned identifiers include `Date`, `Intl`, `process`, `globalThis`, `fetch`, `eval`, timers, `Math.random`. It runs BEFORE `template.ts` is imported by `template:release`. Templates may import only `react`, `next`, `next/link`, `zod`,
  `@platform/site/{bound,context,template-manifest}`, `@platform/settings/settings` and relative files;
  no `fetch`/`require`/`eval`, no `process.env` (next.config: `RECON_BUILD_ID` only).
- **Theme values** must match a per-kind grammar (colour / length / shadow list / font-family list) on top
  of contract-v1's safety rule — no `url()`, `image-set()`, `var()`, comments or free strings. All curated
  library themes still validate.
- **Customer SVGs** pass an element/attribute allowlist (no script incl. namespaced `s:script`, no entities/DOCTYPE, no animate/set, handlers, foreignObject, external href/url/@import);
  asset files must be regular files inside the site's `assets/` (no symlinks).
- **Release ids are ids, never paths:** `<templateId>-<x.y.z>-<hash12>`, checked against the hash, resolved
  only inside `data/template-releases/`. `releaseHash` also covers `templateId`, version, frozen
  `forbiddenTerms` and gate records, so editing `release.json` is detected.
- **Packages** are staged then swapped in by rename; one build per site at a time (lock file); the
  up-to-date shortcut also requires the current package to be intact (re-hashed); a stale lock whose pid is dead is taken over; `previous` is only set from an intact current package.
- **Release id** = `<templateId>-<version>-<releaseHash[0:12]>`; the site pin carries id + full hash.
- **Header nav** exposes only destinations that exist in the build: `/`, `#projects` only when the section
  rendered, `mailto:` only when the business has an email. Cards are not links (no detail route yet).
