# Recon Template Platform — Step 4: Portfolio list + detail + pagination

**Status: PASS.** 2026-09-18.

**What was built**
- The same Template, `templates/interior-01/v1`, now renders `/portfolio`, `/portfolio/page/[n]` and `/portfolio/[slug]` in addition to `/`.
- It is frozen as a **new** immutable release: `interior-01-1.1.0-512e4dd932b4`.
- The old releases `interior-01-1.0.0-f27823c3b837` and `…-1ddf327cb1b9` are untouched.

**The three sites**
- All three fictional sites are explicitly re-pinned to the new release and rebuilt.
- Each keeps its f27823 package as the rollback package.
- There is one detail Template for every project; before/after, quote and facts are data, not variants.

Read next:
[01 content + reader](01-content-and-reader.md) · [02 routes + pagination + SEO](02-routes-pagination.md) ·
[03 detail template](03-detail-template.md) · [04 validation](04-validation.md) ·
[05 visual fidelity](05-visual-fidelity.md) · [06 open items](06-open-items.md) · [screens/](screens/)

## Final report

```
STEP4_STATUS = PASS

OLD_RELEASE = interior-01-1.0.0-f27823c3b837 (releaseHash f27823c3b837…a538b7a4; also 1.0.0-1ddf327cb1b9)
NEW_RELEASE = interior-01-1.1.0-512e4dd932b4 (releaseHash 512e4dd932b4…41cd562e5, 40 files, templateSourceHash 38d2a9b444a7…)
OLD_RELEASE_MUTATED = NO (hash unchanged, files read-only, verifyRelease passes for every older release — test B)

PROJECT_SCHEMA_EXTENDED = YES (optional only: summary, body, location, area, builtYear, scope, period,
  durationWeeks, keywords, pricePerArea, galleryGroups[{name, items[{image, before?}]}], customerQuote;
  collection-wide duplicate-slug refusal; ≤2-decimal contract for area/price)
CONTENT_READER_EXTENDED = YES (paginate / getBySlug / listSlugs added; list/getSingleton unchanged)
LIST_SLUGS = YES (served items, latest order: publishedAt DESC by instant, then id ASC = accepted tie-breaker)
GET_BY_SLUG = YES (public = published only, preview = drafts too; unknown → notFound())

PORTFOLIO_INDEX = YES (/portfolio = page 1; hero media slot, title/intro slots, real card links, pager)
PORTFOLIO_PAGINATION = YES (OFFSET, /portfolio/page/2…N, /portfolio/page/1 never emitted, out-of-range not generated → 404)
PORTFOLIO_DETAIL = YES (/portfolio/[slug], dynamicParams=false, one page per served slug)
DETAIL_TEMPLATE_COUNT = 1 (one route, one section, one client island; identical JS for A and B — test N)
BEFORE_AFTER = YES as data (toggle only on items with a before image; hp-0174 3 pairs, hp-0175 none, same code)
OPTIONAL_QUOTE = YES (absent → no figure/blockquote/heading; never generated; 3 quotes in large, 1 in small)
OPTIONAL_FACTS = YES (row only when value present; keywords [] → no row; no blank dt/dd on any detail page)

PAGE_SIZE = 30
FIXTURE_LARGE_PAGE_COUNT = 6 (30/30/30/30/30/23 of 173 visible)
FIXTURE_SMALL_PAGE_COUNT = 1 (12 → /portfolio only; portfolio.page pruned)
FIXTURE_EMPTY_ROUTES = / only (portfolio.index + portfolio.page + portfolio.detail pruned; no nav link, no sitemap entry)

ROUTE_PRUNE = YES (route plan → builder deletes page-less route files in the disposable workspace only;
  internal Next 16.3.0 empty-generateStaticParams workaround; entries re-validated, contained in app/)
NAVIGATION_UPDATED = YES (header Projects → /portfolio only when the route exists; aria-current page/true)
HOME_CARD_LINKS = YES (every home card → /portfolio/<slug>; "view all" → /portfolio when it exists)
SITEMAP = YES (app/sitemap.ts = exactly the generated routes on the declared origin: 180 / 14 / 1; preview empty)
ROBOTS = YES (public: Allow + Sitemap on declared origin; preview: Disallow: /)
METADATA = YES (list "Projects | brand", "Projects — Page n | brand"; detail "title | brand" + summary;
  canonical only with publicOrigin; preview noindex; home unchanged; localized 404 title)

FILTERS = DEFERRED (core first; no filter vocabulary in settings; static-export filtering not bounded for this step — 06 #1)

SLOTS_ADDED = 32 section-level: home.projects-a.moreLabel; portfolio.index ×7 (title, description, heroImage[media],
  pageLabel, previousLabel, nextLabel, paginationLabel); portfolio.detail ×21 (labels, durationFormat/One, CTA copy);
  site.not-found ×3 (title, message, homeLabel)
LINK_SLOT_USED = NO (all new destinations are Template routes that must vanish with their route; CTA = business email)
DOM_SLOT_DEPENDENCY = NO
PER_ITEM_SLOTS = NO

TESTS = PASS — slice1 72/72 + step4 47/47 (A–Y + gate/format/legacy/404/slot checks), exit 0
TYPECHECK = PASS (platform tsconfig incl. templates; root tsc --noEmit)
BUILDS = PASS (3/3 on the new release; package QA exclusive: 182 / 16 / 3 HTML incl. 404 + _not-found)
VISUAL_SMOKE = PASS (24/24 visits, 1440 / 1000 / 390, 14 screenshots)
FIDELITY_RESIDUALS = list title below hero (not overlaid); filter panel deferred; no share button;
  room pills instead of app-bar dropdown on mobile; fictional SVG content only (05, 06)

SOURCE_DEPENDENCY_CHECK = PASS (no src/ import; AST gate + exclusive package QA with source hosts/API/brand/
  ?page=0/TOGGLED_UUIDS/add-view-count terms; no lang="kr"; Source Package observer not run on detail pages)
NON_LOCAL_RUNTIME_REQUESTS = 0 (all 24 browser visits)

BUILD_INPUT_IDS = large 01e32f692d85… · small 1c9648f368eb… · empty 150b2ec613ad…
  (previous on f27823: 82412fcf4c14… · 8c695e94ed81… · 63d1a815e182…; parts.releaseHash changed — test X)
ROLLBACK_PREVIOUS_PACKAGES = YES (each site: previous.json → f27823 package, intact by packageHash; current builder
  still builds 1.0.0-pinned sites — test Y; Step 4 content rolls back via the retained package — 06 #2)

FILES_CHANGED =
  platform/content/{schema,reader}.ts · platform/site/{routes(new),template-manifest,context,load,preflight}.ts ·
  platform/build/{site-build,qa}.ts · platform/release/release.ts · platform/cli/site-build.ts ·
  platform/dev/generate-fixtures.ts · platform/test/{step4(new),slice1}.test.ts ·
  templates/interior-01/v1/{template.ts, app/page.tsx, app/not-found.tsx(new), app/sitemap.ts(new), app/robots.ts(new),
    app/portfolio/page.tsx(new), app/portfolio/page/[n]/page.tsx(new), app/portfolio/[slug]/page.tsx(new),
    components/{ProjectCard, Pagination(new), ProjectGallery(new)}.tsx, lib/{format,seo}.ts(new),
    sections/{HomeProjectsA, SiteHeader, PortfolioIndex(new), PortfolioDetail(new)}.tsx, sections/{projectCards(new),types}.ts,
    styles/template.css} ·
  scripts/template-platform-step4-visual-smoke.ts(new) · package.json (test:platform runs both suites) ·
  data: new release dir, regenerated fixtures (3 sites), new packages · docs/result/recon-template-platform-step4/ ·
  docs/status/source-preservation-v2.md

LEGACY_PIPELINE_CHANGED = NO
FROZEN_ARTIFACTS_CHANGED = NO (releases immutable; only the accepted current+previous package retention pruned the
  Slice 1 1ddf327-built packages)
SUPABASE/CMS_CHANGED = NO
COMMIT/PUSH = NO

NEXT = Complete Apartmentary v1 homepage Template
```

## Decisions worth knowing

- **Version 1.1.0 (additive minor).**
  - Every 1.0.0 settings, slots and content document stays valid.
  - The old release is never rebuilt with new content.
  - Sites move only by an explicit re-pin.
- **The tie-breaker stays `id` ASC.** This is the accepted Slice 1 order. Changing it would silently change home output.
- **G10: contract, then verbatim.**
  - Price must be positive, ≤1e9, ≤2 decimals, ISO-4217. Everything inside that contract renders grouped and unrounded.
  - `overflow-wrap` keeps the outlier inside a 390px viewport.
- **Import gate.** Widened only for `import { notFound } from "next/navigation"`. It was also tightened: `"next"` is now type-only.
- **Builder compatibility.** The builder sits outside every release, so it must keep building older releases. `normalizePreflight` was added after the independent review found this BLOCKER.
