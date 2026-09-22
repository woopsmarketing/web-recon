# 04 — Template Definition (Part D · 템플릿 명세)

## Decision

A **Template** (product name: Recon Template) is a **maintainable Next.js code module written once per
design**. It is produced by studying a preserved source and verified against it. A small **typed
manifest** lives inside the module. Only the knobs that create real per-site variation are data. Layout,
markup, CSS, responsive behavior and interaction stay code.

It is not:

- a captured DOM replica (`02`, A1–A2)
- a JSON component tree
- a page builder

Every manifest field must have a named consumer. A field no tool reads is not added.

## Module layout (illustrative)

```
templates/interior-01/v1/            templateRef = "interior-01@1"   (major = directory, see 11)
├── template.ts                      manifest (typed TS; exports machine-readable data + zod schemas)
├── provenance.json                  internal source record; never imported by code, excluded from release
│                                    snapshots and build workspaces
├── app/                             Next.js App Router route files (the real router, see 05)
├── sections/<SectionName>/          component + settings schema + slot schema + defaults
├── components/                      template-internal building blocks (cards, carousel)
├── styles/                          Tailwind config / CSS Modules; all brandable values via var(--…)
├── theme.default.json               theme-contract-v1 file (reused format, 01 §6.1)
└── fixtures/                        synthetic fixture sites for regression (never source content);
                                     gate inputs, excluded from the release snapshot hash (11)
platform/                            shared by every template (PRODUCT_VISION §14): content model,
                                     content reader, site settings, SEO/sitemap/robots helpers,
                                     theme variable emitter, media + link components, builder
                                     (snapshot, prune, QA, packaging); own package.json + lockfile,
                                     separate from the legacy pipeline's dependencies (11)
```

The workspace mechanics (pnpm workspaces vs path aliases, same repo vs separate repo) are an
implementation decision for MVP step 1 (`14`, `15` Q-list).

## Manifest fields and their consumers

| Field | Example | Consumer(s) |
|---|---|---|
| `id` | `"interior-01"` (neutral; **never** a source brand) | Site pin, catalog, build record |
| `version` | `"1.2.0"` (semver; major = directory) | Build record, regression gate, catalog |
| `vertical` | `"interior"` | Content type set for the reader; validation; catalog filter |
| `status` | `draft \| available \| deprecated` | Catalog. `site:create` allows `draft` for preview only |
| `displayName`, `preview[]` | screenshots of fixture sites | Catalog |
| `provenance` (internal, **separate file** `provenance.json`) | `{sourceHost, captureRunId, cloneRunId}` | Audit. At release time the forbidden-term list is derived from it and the source SEO snapshot, then **frozen into the release snapshot** (`11`), so builds never read the preservation layer. Never imported by code (lint), so it cannot reach a JS bundle; excluded from release snapshots and build workspaces; never rendered |
| `routes[]` | `{key, path, kind, collection?, optional?, pageSize?, empty?}` (`empty` on list routes: `"hide"` or `{fallback}`) | Sitemap, nav defaults, route toggles, requirements, invalidation map, route prune, manifest↔files drift test (`05`) |
| `sections{}` | `{kind, route, uses[], settings, slots, defaults, requires, empty, disableable, variants?}` | Settings validation, requirements report, future CMS forms, template-switch transfer (`07`, `08`) |
| `requirements` (site level) | `identity.brandName`, one contact channel | Readiness gate (`03`) |
| `theme` | `{consumes: [token ids], defaults: "theme.default.json"}` | Theme validation + contrast check (reused math), catalog |
| `navigation` | ordered route keys + default labels | Nav rendering + site label/hidden overrides |
| `supersedes?` | `"interior-01@1"` (on a new major) | Catalog, upgrade dry-run hints (`11`) |

Not a field: `capabilities`. They are derived from `routes`, `sections` and `uses`, so nothing new has
to be kept in sync.

## Section declaration (illustrative)

```ts
export const homeProjectsA = defineSection({
  key: "home.projects-a",
  kind: "projects-showcase",               // closed vertical-level kind vocabulary (07)
  route: "home",
  uses: ["projects", "taxonomy"],
  settings: z.object({
    enabled: z.boolean(),
    limit: z.number().int().min(3).max(12),                            // counts the carousel supports (13)
    selection: selectionSchema(["category", "featured", "latest", "manual"]),
  }).strict(),
  defaults: { enabled: true, limit: 10, selection: { mode: "latest" } },
  slots: {
    title:     text({ maxLength: 40, fallback: "hide" }),
    moreLabel: text({ maxLength: 20, fallback: "template-default" }),  // neutral UI label, no claim
  },
  requires: { projects: { level: "OPTIONAL" } },
  empty: "hide",
  disableable: true,
});
```

The React component that renders this section reads effective settings. It builds a reader query from
them (`06`) and renders cards. All of that is ordinary code.

## CODE vs CONFIG boundary

| Concern | CODE | CONFIG (site data, validated by manifest schemas) | Why |
|---|---|---|---|
| Component tree, markup, semantics, a11y | ✔ | | Recreating React in JSON is the thing to avoid |
| Responsive layout, breakpoints, animation, carousel behavior | ✔ | | Fidelity work; verified against the clone |
| CSS, Tailwind, CSS Modules, exact CSS fallback | ✔ | | PRODUCT_VISION §5–6 |
| Brandable paint/typography values | reads `var(--…)` | token **values** (theme file) | Existing theme contract |
| Card anatomy (which item fields show) | ✔ | only via a declared `variant` enum | Limited variants, not field pickers |
| Which sections exist and their order | ✔ | `enabled` only where `disableable` | No arbitrary composition |
| How many items / which items / sort | query building in code | `limit`, `selection`, `sort` | Real per-site variation |
| Section headings, CTA labels, intro text, section media | fallback chain in code | copy slot values | Real per-site variation (`07`) |
| Routes and URL paths | ✔ (file routes) | `enabled` for `optional` routes; `pageSize` from allowed values | No routing config. Routes that must not exist for a site are pruned from the build workspace, driven by the manifest (`05`) |
| Per-route title rule | ✔ | static-page SEO title/description overrides | SEO rules reused (`05`) |
| Empty-state fallback component | ✔ | | Must be intentional, reviewed template behavior |
| Business facts, items, assets | | content storage (`03`, `09`) | Customer-owned |

Explicitly rejected as configuration:

- JSON component trees or props
- per-element style props
- expression or templating languages in config
- user-defined sections
- section reordering (MVP)
- per-site code directories
- raw HTML/JS injection fields

## How a template is produced from a preserved source

This is an **authoring workflow**, not a runtime layer. It replaces "compile the template from a crawl".

```
PRESERVATION (read-only inputs)
  Faithful Clone (desktop/mobile, probe widths) · Source Package (DOM, CSS, asset manifest)
  runtime/data contract (field shapes) · observation/SiteSpec (routes, families, layout probes)
  source SEO snapshot (forbidden terms)
        │
        ▼
TEMPLATE DESIGN (human + AI-assisted, in code)
  evidenced routes → route files · section inventory → section components + kinds
  data-driven parts → content types + settings · static copy → copy slots with neutral fallbacks
  authored breakpoints/behaviors → CSS + components
        │
        ▼
RELEASE SNAPSHOT FIRST (11): the gates below run on the immutable snapshot, never on the working tree
        │
        ▼
GATES (all must pass before status "available"; results stored by release hash)
  1 fidelity   private reference fixture vs Faithful Clone at standard widths (PRODUCT_VISION §10).
               Pass = a report for every declared route with residuals named, accepted by a person;
               the accepted report hash is recorded
  2 production synthetic fixture sites → per-site build → isolated production QA (extended, 02)
  3 isolation  frozen forbidden terms absent from template code, defaults and EVERY emitted file:
               HTML, RSC flight, JS chunks. Any hit fails (the legacy census only reports, 02)
  4 licensing  no source assets; fonts license-verified (existing doctrine: license-needs-review)
  5 drift      manifest routes/sections ↔ route files/section modules (also the route-prune mapping, 05)
  6 release    template:promote requires recorded passes of 1–5 and a canary review (11)
```

`provenance.json` is the only file allowed to contain source terms. Gate 3 skips it by name, and the
build workspace never contains it.

The **reference fixture** holds source-like content purely for gate 1.

- **Built by** a small private builder in MVP Slice 5. This is not the DEFERRED customer importer (`07`).
- **Inputs:**
  - the source's static copy from the Source Package
  - the synthetic data items the Faithful Clone already replays (Phase 3C `synthetic-fixtures.json`), so
    clone and template render the **same** inputs
  - real API bodies from the separate JSON default-ON capture task may replace the synthetic items later
- **Marking:** every item carries `origin: "reference-fixture"`. The loader rejects that origin under
  `data/sites/**`, and packaging rejects it (`03`).
- **Storage:** regenerated on demand into a gitignored, source-scoped location (for example
  `data/<sourceHost>/template-reference/<templateId>/`). It is never packaged, deployed or placed under a
  customer site.

## Theme capabilities

- The template declares which contract tokens it consumes (`theme.consumes`). Its default theme is a
  normal theme-contract-v1 file, possibly promoted from the extracted original palette (`02`, EXTEND).
- PRODUCT_VISION §8 lists container width, spacing scale, button style and header style as theme
  candidates. Those are not tokens today. Add one only when a second site needs it and the template can
  honor it without layout risk. Until then they are code (or a declared `variant`).

## What this reuses

| Reused concept | From |
|---|---|
| SiteIdentity for identity surfaces | `01` §3.1 |
| theme-contract-v1 + library | `01` §6.1 |
| Requirement/gate semantics | `01` §4.1 |
| Pack↔template identity check (now "site settings ↔ templateRef") | `01` §2.2 |
| Truth/validator rules for copy defaults | `01` §5.3 |
| Brand census and SEO gates for isolation | `01` §7–8 |
