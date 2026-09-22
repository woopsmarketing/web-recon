# 08 — Site Settings / Overrides and Site Instance (Parts I + J · 사이트별 설정 / 고객 사이트 인스턴스)

## Part I — Site Settings (controlled overrides)

### Decision

```
EffectiveSettings(site) = TemplateDefaults(templateRef) ⊕ SiteSettings(site, templateRef)
```

- **The site settings document is the only per-site override channel for template behavior.**
- It is sparse: it stores deltas only.
- It is keyed by `(siteId, templateRef)`.
- It is validated strictly against the schemas the pinned template declares (`04`).
- Everything it can express is a key the template chose to expose.

Existing doctrine reused:

- "the explicit authored value wins over the default" (`01` §21.1 fold precedence)
- "refuse data built for a different template" (`01` §2.2 pack↔template hard check)
- "re-validate stored decisions at every build" (`01` §21.2 enablement)

### Scope and allowed keys

| Group | Allowed keys (closed vocabulary; each section/route opts in) | Example |
|---|---|---|
| `sections.<key>.settings` | `enabled` (only if `disableable`), `limit` (declared allowed values), `selection` (declared modes), `sort` (declared sorts), `variant` (declared enum, ≤ ~3) | `home.projects-a: {limit: 4}` |
| `sections.<key>.copy` | slots the section declares (`07`); `generatedCopy[]` lists slots holding unapproved generated drafts (`03`) | `home.projects-a: {title: "대표 시공 사례"}` |
| `routes.<key>` | `enabled` (only `optional` routes), `pageSize` (declared allowed), `seo {title?, description?}` for static/list routes | `faq: {enabled: false}` |
| `navigation` | `labels{routeKey: text}`, `hidden[routeKey]`, `extraLinks[] ≤ N {label, href}` | `extraLinks: [{label: "블로그", href: "https://blog.naver.com/…"}]` |

Site-level values that are **not** template overrides live on the Site Instance (Part J): identity, theme
tokens, SEO defaults, domain.

### Defaults

- Declared once per section and route in the template manifest (`04`).
- The site document never copies defaults.
- **Defaults do not change within a major.** Any intentional change of a default value or default visual
  output is a MAJOR change (`11`). A site that did not override a key therefore keeps its output until it
  explicitly upgrades.
- Sparse documents keep that upgrade simple: `migrateSettings` carries the explicit overrides, and every
  other key adopts the new major's defaults.

### Merge behavior

| Value kind | Rule |
|---|---|
| Absent key | Inherit the template default |
| Scalar (`enabled`, `limit`, `variant`, `pageSize`) | Site value replaces the default |
| `selection` (discriminated union) | Replaced **as a unit**. Never field-merged across modes |
| Arrays (`sort`, `ids`, `categories`, `hidden`, `extraLinks`) | Replace as a unit. Never concatenate |
| `copy.<slot>` | Absent → fallback chain (`07`); string → use; `null` → explicitly empty (allowed only for optional slots, hides the element) |
| Keys the template does not declare | **Error.** Strict schemas; nothing is silently ignored |

### Validation (runs on every write **and** again at every build)

| Check | Result |
|---|---|
| `templateRef` in the document ≠ the site's pin, and the document is not a stored switch/upgrade candidate | **error** — build refuses (reused identity-check doctrine) |
| Unknown section/route/key, value outside declared enum/range | **error** |
| Copy text: HTML injection, control chars, URL scheme outside allowlist | **error** (reused validator) |
| Copy text with an unbacked fact-shaped claim (count, price, %, award…) | **error** under `verified-only` (reused truth mode) |
| `selection.manual.ids` missing or unpublished | **warning**; skipped at render, listed in the report |
| `selection.category` slug unknown in taxonomy | **warning** |
| Disabling a route that a non-disableable, still-enabled section links to | **error**: "disable section X too, or choose a no-link variant" (reused no-dead-link doctrine) |
| Disabling every route that yields a page | **error** (reused last-route rule) |
| Requirements after merge (`REQUIRED` content/slots of enabled sections) | Readiness `INPUTS_REQUIRED` (preview allowed, indexable refused) |
| Any `generatedCopy` entry left (unapproved generated draft) | Readiness blocks indexable builds until a person approves (`03`) |
| Which schema validates a write | The schemas of the **promoted** release of the pinned major (`11`). A key added by a candidate release cannot be stored before that release is promoted |
| Promoting an **older** release hash (rollback) | Every pinned site's settings are first validated against the older schemas. Sites that use keys unknown to it are reported and keep their last good package until the operator removes the key or promotes again (`11`) |

### Never overridable

- component code, markup, CSS, layout and breakpoints (only declared `variant`s)
- section order, adding sections, duplicating section instances (MVP)
- URL paths and route files
- raw HTML, scripts, embeds, style strings
- SEO invariants: canonical host = the site's own domain; `noindex` while in preview; no invented
  structured data
- truth/validator rules and brand-isolation gates
- anything the template does not declare. There is no "advanced JSON" escape hatch.

### Preventing customer-specific forks

| Layer | Mechanism |
|---|---|
| Structure | No per-site code directory exists. Build workspaces are disposable, hermetic copies of the promoted release snapshot, outside the repository (the `copyTemplateApp` doctrine, re-implemented). Template code never references a `siteId` (CI grep/lint, like the existing "no hardcoded site facts" greps) |
| Schema | Strict settings schemas. The only knobs are declared ones |
| Process | Triage a customer request as: (a) already a setting → configure; (b) a template improvement useful to every site → new **optional** setting/variant in a template minor, default preserving current output; (c) a different design → another template; (d) otherwise decline. A setting is added only if it serves more than one site or improves the template for all |

### Example — one sparse settings document

```json
{
  "templateRef": "interior-01@1",
  "sections": {
    "home.projects-a": { "settings": { "limit": 6, "selection": { "mode": "category", "categories": ["apt-30py"] } },
                         "copy": { "title": "30평대 시공 사례" } },
    "home.projects-b": { "settings": { "enabled": false } },
    "home.reviews":    { "settings": { "limit": 4 } }
  },
  "routes": { "projects.index": { "pageSize": 9 } },
  "navigation": { "labels": { "projects.index": "포트폴리오" } }
}
```

---

## Part J — Site Instance

### Decision

The Site Instance is the **smallest record that identifies a customer site and pins how it is built**.

- **Identity and configuration only.** No content, no settings body, no build lineage, no history inline.
- It does **not** carry a source host. Provenance belongs to the template (`04`).

### Fields

| Field | Type / source | Why it is here |
|---|---|---|
| `siteId` | stable string; reused derivation doctrine (never host-derived, collision-safe, `01` §3.2) | Primary key everywhere (storage partition, builds, cache tags) |
| `tenantId` | LATER (Supabase account/org) | Access control; MVP omits it |
| `status` | `draft \| preview \| live \| suspended` | Build mode + gate: `preview` → noindex; `live` → indexable only if readiness passes (reused indexability gate) |
| `identity` | **reused `SiteIdentity` schema** (extracted, `02`) `{brandName, legalName?, publicOrigin?, slug, locale}` (`01` §3.1) | **The only source** of brand name, legal name, canonical origin and locale. Used by header wordmark fallback, titles, footer legal line, JSON-LD, `<html lang>`, metadata base, package name |
| `domains` | `{aliases[]}` — extra hostnames only | Hosting. The primary host is always derived from `identity.publicOrigin`, never stored twice |
| `templateRef` | `"interior-01@1"` | The pin (`11`) |
| `theme` | `{base?: themeId, tokens?: {tokenId: value}}` (reused theme-contract-v1) | Brand look |
| `seo` | `{titleTemplate?, defaultDescription?, defaultImage?: AssetRef, verification?}`. `titleTemplate` uses placeholders (`"%s \| {brandName}"`), never a literal name | Site-wide SEO defaults (per-route/per-item overrides live in settings/items) |
| `createdAt`, `updatedAt` | ISO | Audit |

### Identity/config vs content — where each thing lives

| Data | Home | Changes how often | Who edits |
|---|---|---|---|
| siteId, status, identity, domains, templateRef, theme, seo defaults | **Site Instance** | Rarely | Operator (later: customer for some) |
| Section settings/copy, route toggles, nav tweaks | **Site Settings** doc per `(siteId, templateRef)` | Occasionally | Operator / customer |
| business, projects, reviews, banners, taxonomy, … | **Content storage** (`03`, `09`) | Often | Customer / operator |
| Uploaded media | **Asset storage** keyed by siteId + sha256 (`09`) | Often | Customer / operator |
| Build outputs, QA reports, build manifests | **Build storage** keyed by siteId + runId (`10`, `14`) | Per build | Pipeline |
| History of edits | Revision records (reused chain in file mode; table later) | Per edit | Pipeline |

Settings are stored per `(siteId, templateRef)`, not inside the instance. A switch or upgrade can then be
prepared and previewed while the live pin keeps building, and a rollback is a pin change (`11`, `12`).

### Relation to `release-project-v1` (SUPERSEDED for the new path, `02`)

| Kept (as concept) | Dropped |
|---|---|
| `siteId` doctrine, `target.mode` → `status`, indexability gate, requirements gate, hash-pinned build lineage (moved to build records), revision chain (moved beside the data), authored-last precedence | `source{host, rootUrl}`, 7-stage `acceptedLineage` + `stageStatus`, resolution packs as state, `technicalDebt` from docs, `auxiliary` legacy inputs, host-scoped directory |

### Example

```json
{
  "siteId": "haneul-interior",
  "status": "preview",
  "identity": { "schemaVersion": "1", "brandName": "하늘인테리어", "slug": "haneul-interior", "locale": "ko-KR" },
  "domains": { "aliases": [] },
  "templateRef": "interior-01@1",
  "theme": { "base": "warm-editorial", "tokens": { "color.action.primary": "#1f4d3a" } },
  "seo": { "titleTemplate": "%s | {brandName}" },
  "createdAt": "2026-10-01T00:00:00Z",
  "updatedAt": "2026-10-01T00:00:00Z"
}
```

The site above is fictional.

- `warm-editorial` is an existing library theme (`themes/library/`).
- `color.action.primary` is a real theme-contract-v1 token id (`src/theme/types.ts`).
