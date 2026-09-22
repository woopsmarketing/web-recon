# 02 — UI, URL state, filtered pagination, SEO

## Where things live

| layer | file | owns |
|---|---|---|
| contract + rules | `platform/content/project-filter.ts` | normalization, buckets, filtering, sorting, paging (pure) |
| browser door | `platform/site/browser.ts` | `readQuery`, `writeQuery({push})`, `onHistoryChange` (popstate). Template code may not touch `window` (release gate), so this narrow platform module is the only door. No network, no storage |
| URL codec | `templates/.../lib/filterQuery.ts` | Template-owned param names ⇄ `ProjectFilterInput` (goes through `normalizeProjectFilter`) |
| build-time shaping | `templates/.../sections/portfolioFilter.ts` | compact index + vocabulary + slot labels (server only) |
| client island | `templates/.../components/PortfolioBrowser.tsx` | view state (filter + filtered page), URL sync, rendering. **No filter/sort rule** (test Z scans every template file) |

**Import gate.** It gained exactly two allowlist entries: `@platform/content/project-filter` and `@platform/site/browser`.
- `window`, `history`, `localStorage`, `fetch`, `useSearchParams` and `@platform/content/reader` stay refused (test "gate").

## URL state (canonical list route only)

`/portfolio?keyword=…&type=…&area=…&style=…&price=…&sort=…&fp=…`

**Parameter rules**
- Multi-values **repeat the key** (`style=Warm+wood&style=Terrazzo`). Style values are free site words, so no comma escaping rule is needed.
- Parameter and value order are canonical (vocabulary order), so one view has one URL.
- `sort` is omitted at `newest`.
- `fp` (filtered page) is omitted at 1, and **never written for the default view**. `/portfolio/page/1` is never emitted.

**Parsing**
- Parsing is `normalizeProjectFilter`: unknown or stale values are dropped, never guessed.
- `fp` without an active filter is ignored.
- An out-of-range `fp` is clamped.
- **Canonicalization on load.** After a direct load, the URL is rewritten with `replaceState` (no history entry) to the view's canonical query whenever they differ: a clamped `fp`, a value dropped as stale or unknown, or non-canonical order. A stale shared link therefore visibly widens instead of silently pretending.
  - Foreign query params (e.g. campaign tags) on `/portfolio` are dropped by that rewrite. This is recorded.

**History behaviour**
- Discrete choices (chip, sort, reset, page) → `history.pushState`.
- Typing: the first keystroke pushes, and further typing replaces. This avoids one history entry per character.
- There is no page reload.
  - `writeQuery` calls `pushState(null, …)` / `replaceState(null, …)`. With `null` state, Next 16's patched history methods copy their internal state **and** sync the router's own URL.
  - Passing Next's current state object would skip that sync. The independent review caught this (MAJOR M2): it would leave the router believing the URL is `/portfolio`.
  - Back/forward restores state through `popstate`.
  - The smoke proves both: no document request, and a window marker survives. Filtered list → detail (client link) → back keeps the query and the results, and a later filter write stays in sync.
- A direct load of a query URL restores the view on mount.
- Any filter change resets the filtered page to 1.
- Reset → `/portfolio` with no query.

## Views

| state | rendered | pager |
|---|---|---|
| default (no criterion, sort newest) | **the static route's own server-rendered page 1**: the same 30 cards, grid HTML and route pager, byte-identical to Step 4 (test A) | crawlable `/portfolio/page/n` links |
| filtered | evaluator over the full compact index | client pager, 30/page. Links are real `href="/portfolio?…&fp=n"`, handled in place (`Pagination` `onPage`) |
| filtered, 0 matches | honest empty state (title, body, reset). No card, no pager, no invented fallback | — |
| **fixture-empty** (no served projects) | **no `/portfolio` route at all** (pruned, 404, no nav link), as in Step 4. This is distinct from filtered-zero | — |

**Static routes are unchanged**
- `/portfolio/page/2…N` gets **no filter UI and no index**. Their `<main>` is byte-identical to Step 4 (test A).
- Every detail page and home are unchanged too.
- Filtering is client state over `/portfolio` only. No filter combination is ever pre-rendered (test V: the HTML set equals Step 4's 182/16/3).

## SEO

- The unfiltered `/portfolio` is unchanged: title, canonical `/portfolio` (publicOrigin sites), indexable.
- `sitemap.xml` and `robots.txt` are byte-identical to Step 4 (test W).
- **Filtered views:**
  - **The primary signal is the canonical.** A filtered URL serves the same static HTML as `/portfolio`, and its canonical is `/portfolio` (on sites with a `publicOrigin`). So it is never a canonical or indexable duplicate, even without JS.
  - **Secondary, JS-only:** while a filter is active in a public build, the island renders `<meta name="robots" content="noindex, follow">`, which React 19 hoists into `<head>`. Crawlers that render JS see it; the static HTML never contains it.
  - Preview builds are already `noindex, nofollow`.
- No static page changes its robots meta.

## Controls

**Desktop (≥ 900 px)**
- search box (labelled)
- inline panel with one fieldset per group (type · size · style · price), each a legend + checkbox chips
- a status row: live result count (`aria-live="polite"`), a reset button (only when something is active), and sort `<select>` with a visible label

**Mobile / tablet band (< 900 px)**
- search box + a **Filters (n)** toggle button (`aria-expanded`, `aria-controls`) that shows or hides the same panel
- a collapsible panel instead of a sheet: no focus trap is needed, and edits apply live exactly as on desktop

**Accessibility**
- Reset (either button) moves focus to the search box (or the result count), because the reset button unmounts with the filtered view.
- Chips are real checkboxes under a visible label. The input is a transparent overlay, so hit area, focus and screen-reader semantics are native.
- `:focus-visible` outline on the chip.
- The checked state uses theme action colours (not colour only: bold weight too).

**Styling**
- Only existing theme tokens (`--color-*`, `--decoration-radius-*`, `--typography-*`). Nothing from the source's MUI code or runtime.
- fixture-small shows the same UI in its Korean theme (warm palette, serif headings).

## Settings (`portfolio.index`, declared, strictly validated)

| key | default | notes |
|---|---|---|
| `filtersEnabled` | `true` | `false` → `/portfolio` renders exactly the Step 4 list (tested byte-identical) |
| `filterGroups` | all 5 (`keyword type area style price`) | unique, ≥ 1. A group without options is hidden automatically |
| `areaScale` | `m2` | `m2` · `pyeong` (vertical code; bucket definitions are not site content) |
| `priceScale` | `none` | `none` · `usd-m2` · `krw-pyeong`. Currency-specific, so there is no default currency |

- Fixtures: fixture-large uses `priceScale: usd-m2`; fixture-small uses `areaScale: pyeong` and `priceScale: krw-pyeong`.
- **No default-sort setting.** The unfiltered view *is* the static crawlable route order. A different client default would make `/portfolio` disagree with `/portfolio/page/n`.
- Not added: a page builder or per-site bucket lists.

## Slots (`portfolio.index`, +19, section-level)

- `filterLabel`, `searchLabel`, `searchPlaceholder`
- group legends: `typeLabel`, `areaLabel`, `styleLabel`, `priceLabel`
- `sortLabel` + 6 sort option names
- `resetLabel`, `resultCountFormat`/`…One` (`{n}`)
- `emptyTitle`, `emptyBody`

**Not slotted**
- Area and price bucket labels: vertical vocabulary.
- Type and style options: content.

**Note on the 6 sort names.** They are stable UI vocabulary, and a Korean site still needs Korean words. The existing Template convention (pagination/detail labels) is slots, so they follow it. **This is exactly the Slot-vs-localization question, and it is DEFERRED to the review before Template 2** (spec §11). No localization mechanism was added.
