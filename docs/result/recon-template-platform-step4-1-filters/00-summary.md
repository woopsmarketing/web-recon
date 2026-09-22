# Recon Template Platform — Step 4.1: Portfolio filters

**Status: PASS.** 2026-09-18.

**What was built**
- `/portfolio` on the same Template (`templates/interior-01/v1`) now has keyword search, filters (type, size, style, price) and sort.
- Filtering runs client-side over a compact, build-time index of published projects.
- The rules live in one pure, framework-free module, `platform/content/project-filter.ts`, not in React. A future backend or BoostChat adapter can reproduce them over the same structured `ProjectFilter`.

**What did not change**
- The static crawlable routes (`/portfolio`, `/portfolio/page/n`), details, home, sitemap and robots are byte-identical to Step 4 where expected.
- No filter combination is pre-rendered.

**Release:** a new immutable release, `interior-01-1.2.0-93fb66acda7d`. All three fixture sites are re-pinned. Each keeps its Step 4 package as `previous`.

Read next: [01 filter contract](01-filter-contract.md) · [02 UI + URL state](02-ui-url-state.md) ·
[03 validation](03-validation.md) · [04 open items](04-open-items.md) · [screens/](screens/)

## Final report

```
STEP4_1_STATUS = PASS
OLD_RELEASE = interior-01-1.1.0-512e4dd932b4 (releaseHash 512e4dd932b4…41cd562e5; unchanged, verifies; also 1.0.0-f27823c3b837, 1.0.0-1ddf327cb1b9)
NEW_RELEASE = interior-01-1.2.0-93fb66acda7d (releaseHash 93fb66acda7dab10…d9583d5a1de1eeb07d230425f89, 45 files,
  templateSourceHash 1aa3862443fd…; identical hash to the last verified devroot release)

PROJECT_FILTER_CONTRACT = platform/content/project-filter.ts — closed typed ProjectFilter {keyword, type[], area[], style[],
  price[], sort}; vocabulary ids only; OR within / AND across dimensions; no imports, no React/DOM/zod/Intl/clock
FILTER_INDEX = build-time compact index of SERVED projects (ProjectFilterRecord + href/categoryLabel/cover), shipped as the
  island's props (flight payload in portfolio.html/.txt); no body/gallery/quote/status/source fields; no price data without a
  price scale; large 173 entries, 157 KB raw / 15.8 KB gzip
FILTER_EVALUATOR = normalizeProjectFilter + evaluateProjectFilter + pageOfResults (pure; parity: shipped index = canonical
  records; browser cards = Node evaluator at every smoke step)
REACT_FILTER_LOGIC_DUPLICATED = NO (test Z: no sort/case-fold/date/field-read/index iteration in template code)

AREA_FILTER = YES — vertical scales m2 (<60/60/90/120/150+) and pyeong (20평 미만/20평대/30평대/40평대/50평 이상), [min,max),
  1평 = 400/121 m², sq ft converted, bucket derived from value, missing never matches
STYLE_FILTER = YES — the site's own keywords (frequency order), OR
PRICE_FILTER = YES — currency+unit scales usd-m2 / krw-pyeong (setting; default none), no FX, missing/other currency never match
SERVICE_FILTER = DEFERRED (no canonical service field; the source axis = building age). TYPE filter implemented on the existing
  `category` taxonomy
KEYWORD_FILTER = YES — title/summary/location/scope/keywords; NFC, whitespace-collapsed, case-insensitive; tokens AND; Korean
  substring; no fuzzy/vector
SORT = newest (= static route order) / oldest / area desc+asc / price desc+asc; missing LAST both ways; no "popular"

URL_STATE = YES — /portfolio?keyword&type&area&style&price&sort&fp (Template-owned names, repeated keys, canonical order);
  pushState(null) (Next router in sync), popstate restore, direct load, canonicalized stale/out-of-range URLs, no reload
FILTERED_PAGINATION = YES — client 30/page over the full index, fp param (never fp=1, never for the default view), clamped
ZERO_RESULT = YES — honest empty state + reset (distinct from fixture-empty, which has no /portfolio route at all)
RESET = YES — all 173, clean /portfolio URL, focus kept in the controls

PUBLIC_INDEX_LEAK_CHECK = PASS (no draft/scheduled id/slug/title, only allowed fields, no body/quote text)
STATIC_ROUTE_EXPLOSION = NO (HTML set = Step 4: 182 / 16 / 3; route plan + pruning unchanged)
UNFILTERED_PAGINATION_REGRESSION = NONE (30/30/30/30/30/23, exact order; grid/pager/title/canonical byte-identical; every other
  page's <main> byte-identical)
SITEMAP_REGRESSION = NONE (sitemap.xml + robots.txt byte-identical; filtered views: canonical /portfolio + JS noindex)

BOOSTCHAT_FUTURE_SEAM = DOCUMENTED (01): NL parser → ProjectFilterInput → normalizeProjectFilter → evaluator/backend parity
BOOSTCHAT_IMPLEMENTED = NO
API_IMPLEMENTED = NO
VECTOR_SEARCH_IMPLEMENTED = NO

TESTS = PASS — slice1 72/72 · step4 47/47 · step41 35/35 (pnpm test:platform, exit 0)
TYPECHECK = PASS (typecheck:platform + root tsc --noEmit)
BUILDS = PASS (3/3 on the new release, package QA exclusive; buildInputIds large c1174a3fd9c0… · small 2e157b285775… ·
  empty 092832a93731…; previous = Step 4 packages 01e32f692d85… · 1c9648f368eb… · 150b2ec613ad…)
VISUAL_SMOKE = PASS (180/180 checks, 7 visits: large 1440/1000/390 + page/2, small 1440/390, empty 404)
NON_LOCAL_RUNTIME_REQUESTS = 0

SETTINGS_ADDED = portfolio.index {filtersEnabled, filterGroups, areaScale, priceScale} (no default-sort, no page builder)
SLOTS_ADDED = 19 on portfolio.index (filter/search/legend/sort/reset/count/empty copy); bucket labels = vertical vocabulary,
  type/style options = content; Slot-vs-localization review DEFERRED to before Template 2
GATE_WIDENED = 2 modules (@platform/content/project-filter, @platform/site/browser); window/history/fetch/storage/
  useSearchParams still refused

INDEPENDENT_REVIEW = 0 BLOCKER; 2 MAJOR (M2 fixed; M1 re-pin rollback = data migration → recorded 04 #1); minors fixed or recorded
OLD_RELEASE_MUTATED = NO
LEGACY_PIPELINE_CHANGED = NO
FROZEN_ARTIFACTS_CHANGED = NO (only the accepted current+previous retention pruned the f27823-built packages)
COMMIT/PUSH = NO

NEXT = Step 5 Full Homepage
```

## Files

- **platform:**
  - `content/project-filter.ts` (new)
  - `site/browser.ts` (new)
  - `release/release.ts` (2 allowlist entries)
  - `dev/generate-fixtures.ts` (filter settings, Korean filter slots)
  - `test/step41.test.ts` (new)
  - `test/step4.test.ts` (X/Y previous generalized; 1.0.0 re-pin strips 1.2.0 settings)
- **template `templates/interior-01/v1/`:**
  - `template.ts` (1.2.0)
  - `app/portfolio/page.tsx`
  - `sections/{PortfolioIndex.tsx, portfolioFilter.ts (new)}`
  - `components/{PortfolioBrowser.tsx (new), Pagination.tsx (onPage)}`
  - `lib/filterQuery.ts` (new)
  - `styles/template.css`
- **scripts:** `scripts/template-platform-step41-visual-smoke.ts` (new)
- **config:** `package.json` (test:platform runs step41)
- **data:** new release dir, 3 regenerated/re-pinned fixture sites, 3 new packages
- **docs:** this directory, and `docs/status/source-preservation-v2.md`
