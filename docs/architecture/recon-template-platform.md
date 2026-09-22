# Recon Template Platform — accepted architecture

**Status: ACCEPTED WITH MODIFICATIONS (2026-09-18).** Accepted boundaries, invariants and deferrals only.
Next steps: [`../status/source-preservation-v2.md`](../status/source-preservation-v2.md) → *Next*.
Acceptance record: [`../result/recon-template-platform-architecture-acceptance/`](../result/recon-template-platform-architecture-acceptance/).
Design reasoning/evidence (historical proposal, not rewritten; where it differs from this file, this file wins):
[`../result/recon-template-platform-architecture-study/`](../result/recon-template-platform-architecture-study/) `00`–`16`.
Nothing here is implemented yet.

## Position in the product flow

```
SOURCE SITE → Source Capture → Source-Preserved Faithful Clone     (preservation/reference layer: runtime-preservation.md)
                                   │ authoring reference · fidelity baseline · never a customer-build input
                                   ▼
            Recon Template (authored Next.js code, once per design) + Site data → per-site build → Customer Site
```

- The **Source-Preserved Faithful Clone** remains the strongest preservation/fidelity/reference baseline.
- The **legacy DOM-replica production-template path** (`src/recon-template`, `src/slotized-template`,
  `src/production`, `src/release`, …) is **superseded for the new multi-site production path**. It stays
  frozen as historical/evidence tooling: not deleted, not a dependency of the new path.

## Accepted boundaries

| # | Decision |
|---|---|
| 1 | A production **Recon Template** is a maintainable Next.js code module, authored once per design. |
| 2 | **One Template codebase serves many Site Instances.** No per-customer source-code forks. Customer differences come from content, site settings / controlled overrides, theme, assets, SEO / identity. |
| 3 | **Content model:** small shared **Core** + **vertical-specific extensions**. Content describes what the business IS/HAS, never how a Template places it (no placement fields, no template ids in content). |
| 4 | **Collections are stored once and queried per view** (e.g. `projects` = 174 records → home: featured 4; `/portfolio`: all, paginated). No copying into page buckets. |
| 5 | **Slots** are narrow, section-level copy/media placeholders. Not DOM-element slots, CSS slots, per-collection-item slots, or arbitrary component configuration. |
| 6 | **No separate Template Mapper layer.** Settings → closed collection query conversion (platform); item → props shaping in component code; a transfer function only when Template switching is actually implemented. |
| 7 | **Controlled flexibility:** Template Defaults + site-specific sparse Overrides = Effective Settings. Only keys the Template declares; validated strictly. |
| 8 | **Next.js App Router is the router.** No custom route DSL/router. The Template manifest holds only useful route metadata. |
| 9 | **Storage boundary:** Template → site-scoped `ContentReader` / `SiteContext` → JSON initially → Supabase later if/when introduced. Template code never uses Supabase (or any storage) syntax directly. |
| 10 | **MVP cache = the static per-site build.** Public visitors need no DB read per request. |
| 11 | **New implementation lives separately from the legacy pipeline**, initially in this repository: `templates/` and `platform/`. |

## Template Release immutability (modifies the proposal's `id@major` floating pin)

- A **Template Release** is an immutable, reproducible snapshot. Visual/structural Template changes never
  mutate an existing Release; they create a new one. A major/version *groups* Releases; it is **not** a
  floating pointer for published sites.
- **LIVE SITE → EXACT IMMUTABLE TEMPLATE RELEASE**, never → latest release within a major. The Site Instance /
  build record keeps enough identity to resolve it (conceptually `templateId` · `templateVersion` ·
  `templateReleaseId`/hash; exact names chosen at implementation).
- New sites may use the latest accepted Release. Existing sites move only by **explicit, approved upgrade**.
- **Customer content is not frozen.** A rebuild = same pinned Release + latest valid content, settings,
  assets, SEO.
- **Change classes:**
  - **A. Template/presentation change** (layout, section structure/order, component appearance, default
    visual design, responsive behavior, animation, defaults that alter visible output) → new Release; never
    applied automatically to published sites.
  - **B. Non-visual, backward-compatible platform change** (security, reader internals, build system, asset
    processing, sitemap/SEO helper correctness, reliability, cache/performance, validation fixes) → MAY be
    applied to existing sites **only after** fixture/site regression checks show no unintended
    visible/structural change. The "platform" label alone is not proof. A B-change that alters visual output
    is treated as class A.

## Release control

| MVP-required (Slice 1 onward) | Deferred until shared live-site operations justify it |
|---|---|
| exact immutable Release pin per site · immutable/reproducible release snapshot · `buildInputId` · basic build/release QA · previous successful package retained for rollback | automated canary orchestration · batch rollout controller · automatic last-good holds · release dashboard · maintenance branches/worktrees · compatibility control plane |

Deferred items matter mainly for rolling class-B changes across many live sites. The architecture leaves
room for them; none is MVP-required.

## Explicitly provisional / not accepted

| Item | Status |
|---|---|
| `banners` / hero slide data | **PROVISIONAL.** Not a canonical Interior collection. May be Template/presentation content. Promote to vertical content only when a second Template or stronger evidence shows cross-template meaning. |
| Supabase physical schema (JSONB vs normalized, table layout, indexing) | **NOT ACCEPTED.** Decided in the SaaS/CMS phase from real requirements. The only current invariant: Template code is storage-independent. The study's Supabase sketch (`09`) is illustrative. |
| Route pruning for Next.js static export | If required, an **internal platform/build detail** only. Must not shape the content model or Template domain model. Re-test on every Next.js upgrade. |
| Server mode / tag revalidation | Deferred; adopt only on measured need (study `10`). |

## Authoring-cost measurement

- Record **`PLATFORM_DEVELOPMENT_TIME`** and **`TEMPLATE_SPECIFIC_AUTHORING_TIME`** separately. Template #1
  (Apartmentary) pays both.
- "Can we realistically build 10+ Templates per vertical?" is judged **primarily from Template #2 onward**,
  not from Template #1 total elapsed time.
- Generic abstractions widen only when Template #2 evidence demands it.

## Invariants

1. No per-customer code; Template code exists once per Release.
2. Templates read site data only through the site-scoped `SiteContext` / `ContentReader`; no storage client,
   file path or `siteId` literal in template code.
3. Content is template-independent (no placement, no template ids).
4. Every per-site variation is a declared, strictly validated key.
5. No invented content: missing content → declared empty behavior or needs-input; items, reviews, facts,
   contact and legal data are never generated.
6. Production output never depends on source runtime, APIs, hosts, assets, copy or brand.
7. A live site builds only from its exact pinned immutable Template Release.
8. `siteId` partitions all site data at the reader/store boundary.
9. Legacy DOM-replica pipeline stays frozen and out of the new path.
