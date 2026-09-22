# 02 — Modifications to the proposal

The study is not rewritten. These modifications override the listed proposal statements.

## M1 — Exact immutable Template Release pin + simplified release control

| Proposal (study `11`, `16`) | Accepted |
|---|---|
| Site pins `templateRef "id@major"`. Builds use the major's *promoted* release pointer, so published sites follow new promoted minors/patches. | Site/build record pins the **exact immutable Release** (conceptually `templateId` · `templateVersion` · `templateReleaseId`/hash). Never a floating latest-in-major. |
| New promoted release → `sites:rebuild --release <hash>` across sites | Presentation changes (class A) create a new Release. Existing sites stay pinned until an **explicit, approved upgrade**. |
| Platform change accepted when `template:verify --all` passes | Class B (non-visual, backward-compatible) changes may reach existing sites only after fixture/site regression shows no visible/structural change. If output changes, it is class A. |
| candidate → canary → promote flow · automatic last-good hold (invariant 14) · maintenance worktrees | **MVP only:** exact pin · immutable reproducible snapshot · `buildInputId` · basic build/release QA · previous good package kept for rollback. Canary orchestration, batch rollout, automatic last-good holds, dashboard, maintenance branches and compatibility control plane are **DEFERRED**, with room left in the design. |

Customer content, settings, assets and SEO still change. A rebuild uses the same pinned Release plus the latest valid data.

## M2 — `banners` provisional

Study `03` puts `banners` in the interior vertical module. Accepted: banner/hero data is **PROVISIONAL**, possibly
Template/presentation content, and **not a canonical Interior collection**. Promote it only when a second Template
or stronger evidence shows cross-template meaning. Apartmentary's carousel alone must not shape the customer schema.

## M3 — Supabase

Accepted: the `ContentReader` / `SiteContext` abstraction, JSON now, Supabase later. **Not accepted:** any physical
schema (study `09` sketch, JSONB vs normalized, table layout, indexing). That belongs to the SaaS/CMS phase. The only
invariant now: Template code is storage-independent.

## M4 — Authoring-cost measurement

Study `14` records "authoring hours per slice" against one budget. Accepted: record **`PLATFORM_DEVELOPMENT_TIME`**
and **`TEMPLATE_SPECIFIC_AUTHORING_TIME`** separately. Template #1 contains both. The "10+ Templates per vertical"
viability question is judged primarily from **Template #2 onward**.

## M5 — Route pruning

If Next.js static export still requires it, route pruning is an **internal platform/build detail**. It must not
shape the content model or Template domain model. Re-test it whenever Next.js changes.
