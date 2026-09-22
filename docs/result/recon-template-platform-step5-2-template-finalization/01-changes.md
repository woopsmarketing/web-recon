# 01 — Changes

Base: `interior-01-1.3.1-bd4ae8fb1769` (Whole-site Polish). New release: **1.4.0**. Minor bump because the content model gains a field and the CTA gains page families. No setting, slot or route changes: every 1.3.1 site document stays valid, and test D proves it.

## A. Site-wide floating CTA

**Decision:** the floating contact CTA is a feature of every current public page, no longer homepage-only.

| File | Change |
|---|---|
| `templates/interior-01/v1/app/layout.tsx` | The root layout (the site shell) renders `<SiteFooter>` once, after every page's own header and `<main>`. The emitted document order is unchanged (header · main · footer). Footer and seat are now **one instance for the whole site that survives client-side navigation**, so a future chat launcher in the seat keeps its state across pages. |
| `templates/interior-01/v1/app/{page,not-found}.tsx`, `app/portfolio/{page,[slug]/page,page/[n]/page}.tsx` | The page's own `<SiteFooter>` is removed. The homepage also stops rendering the seat itself. Nothing else changed (step52 R4 compares comment-stripped code). |
| `templates/interior-01/v1/sections/SiteFooter.tsx` | It owns the seat: it calls `floatingCta(ctx)` and renders `<FloatingCta>` as its **last child** (inside the contentinfo landmark). The `children` prop is removed, so no page can add a second seat. |
| `templates/interior-01/v1/sections/FloatingCta.tsx` | Doc comment only: site-wide, the on/off + destination rule, the replacement seam. |
| `templates/interior-01/v1/styles/template.css` | Comments, plus ONE rule (visual review MAJOR): at ≥ 900px, `.i1-pfilter__status { justify-content: flex-start; gap: 8px 32px; }`. The `/portfolio` reset and sort controls now follow the result count, not the row's right end. At 1440×900 and 1536×864 the pill covered the sort dropdown on first load. The seat CSS itself was already page-agnostic. |
| `templates/interior-01/v1/template.ts` | Version 1.4.0, header note, `site.floating-cta` comment. The setting and slot schema are unchanged. |

**Why the layout, not each page.** The first candidate had every page render `SiteFooter`, and the footer rendered the seat.
- The architecture review (MAJOR) pointed out that Next discards the page tree on client-side navigation, so the seat was re-created on every in-site link.
- A stateful chat launcher would lose an open conversation that way.
- The smoke check `cta:survives-client-navigation` marks the seat element, clicks an in-site link, and requires the same element afterwards.
  - It **fails on the first candidate** (`same: false`, negative control).
  - It passes on the final release.

**Pages covered.** The root layout wraps every page, so all of them get the seat:
- `/`
- `/portfolio` (including filtered URL state and the open filter panel)
- `/portfolio/page/[n]`
- `/portfolio/[slug]`
- the site's 404 page (`404.html` / `_not-found.html`)

**Absent when:**
- `site.floating-cta.enabled = false`; or
- the site has no contact destination (`contactHref(ctx)`, business email today).

In either case it is absent on every page.

**BoostChat seam.** `sections/FloatingCta.tsx` is the one module that decides what sits in the seat:
- `floatingCta(ctx)` is the single on/off + destination rule.
- `FloatingCta` is the single component.

A chat launcher replaces the component inside the same `.i1-fcta` wrapper and seat tokens, and swaps the `mailto:` href for an action. SiteFooter and the pages do not change. BoostChat itself is not touched.

**Output effect** (step52 test P3, every page of the three fixtures):
- Rendered markup equals the 1.3.1 markup plus exactly one seat element, on every page that lacked it: 181 + 15 pages. fixture-empty is unchanged.
- Normalisations, all inert, needed only because the footer moved into the layout:
  - React `useId` values canonicalised by first appearance. One id on `/portfolio` changed: `_R_2klubtb_` → `_R_ainpfdb_`.
  - Chunk file names normalised.
  - One empty Suspense marker pair (`<!--$--><!--/$-->`) on the 404 page, which now sits before the footer instead of after it.
- Media, sitemap and robots are byte-identical. The stylesheet is 1.3.1 plus exactly the one status rule.
- The JS chunks are regrouped and the RSC flight payloads (`.txt`) change, because the component tree moved. Packages are about 8% smaller: fixture-large 14.75 → 13.60 MB, since the footer is serialised once in the layout payload, not per page.
- Behaviour is covered by the step5, step4.1 and step4 smokes (all pass) and the polish smoke.
- step5 test AD (non-home `<main>` byte-identical to the previous package) now canonicalises React `useId` values the same way. The ids' structure must still match exactly; nothing else is relaxed.

## B. Area basis contract

**Decision:** in Korean residential authoring, a bare "34평" (e.g. "34평 아파트") means **supply area**. "34평 공급 ≈ 112㎡" is a unit conversion of the same figure. "≈ 전용 84㎡" is contextual market knowledge, **not** an equivalence.

| File | Change |
|---|---|
| `platform/content/schema.ts` | `AREA_BASES = ["supply", "exclusive", "unknown"]`, `AreaBasisSchema`, `AreaBasis` |
| | `Project.area` gains an optional `basis`; the object stays strict. |
| | `areaBasisOf(area)`: the stored basis; absent → `"unknown"` (never guessed). |
| | `defaultAreaBasis({ unit, locale, residential })`: the authoring default for an **unstated** figure. Korean (`ko` / `ko-*`) + residential + `pyeong` → `"supply"`; everything else → `"unknown"`. A stated basis never reaches it, and it never changes the value. |

What it deliberately does **not** do:
- **Stored data is not inferred.** A pre-5.2 area has no basis and reads as `unknown`. The default is applied when content is authored (operator form, import, future chat/NL), which then stores it explicitly.
- **No conversion between bases.** No function maps supply to exclusive or back.
- **No filter change.** `toProjectFilterRecord` still copies only `{ value, unit }`, so the area buckets, the filter index bytes and `ProjectFilter` semantics are untouched. Step52 test A4 and I3 prove `basis` is never shipped to the browser.
- **No display change.** The detail page renders the value and unit exactly as before; step52 test I3 shows the detail `<main>` is identical for supply, exclusive and unstated. How to label a basis on the page is an open item ([03](03-open-items.md)).
- **No NL parsing** and no BoostChat interpretation engine.
- **Fixtures are unchanged.** None of them states a basis.
- The document schema id stays `projects@1` (an additive optional field).

**Rollback boundary** (step52 test I4): 1.3.1 and older releases use strict schemas. A document that states `area.basis` fails closed under them: the release's own preflight reports `content.projects.N.area: Unrecognized key: "basis"` and nothing is emitted. Rolling back to the 1.3.1 **packages** is unaffected. Rebuilding basis-carrying content with ≤ 1.3.1 requires removing the field first. This is recorded for the rollback runbook (carry-forward D).

## Tests and smoke

| File | Change |
|---|---|
| `platform/test/step52.test.ts` (new, 16 checks) | **R1–R4** release: exactly one 1.4.0 release; the file scope; comment-only CSS / FloatingCta; the version-only `template.ts`; one seat owner (layout → SiteFooter → FloatingCta; pages changed only by the footer move). |
| | **P1–P3** packages: previous = 1.3.1; a seat on every page, or none without a destination; markup = 1.3.1 + seat. |
| | **A1–A4** basis contract. |
| | **I1–I4** throwaway builds: seat disabled, no destination, basis end-to-end, rollback boundary. |
| | **D**: current documents re-pinned to 1.3.1 reproduce the 1.3.1 buildInputIds. |
| | Package and document checks are gated so they skip once a later release is current (same pattern as `polish.test.ts`). |
| `platform/test/step5.test.ts` | AD: React `useId` values are canonicalised (see above). Nothing else changed. |
| `package.json` | `test:platform` also runs `step52.test.ts`. |
| `scripts/template-platform-polish-visual-smoke.ts` | Inner-page visits now run the full seat check (`ctaChecks`) through their scroll range. The old `no-floating-cta-on-inner-pages` assertion is **reversed by the product decision**, not dropped: the seat must now be present and correct on those pages. |
| | New visits: `/portfolio/page/2` at 390; a filtered URL (`?type=kitchen&sort=oldest`); the open filter panel at 390 and 1440; 404 at 390 and 1440 (expected HTTP 404); fixture-small `/portfolio` and a detail page (Korean label); a fixture-empty 404 (no seat). |
| | The reachability hit-test now also covers `label:has(> input)`, so filter chips are tested. |
| | New `cta:survives-client-navigation`: detail → "All projects" at 1440, and page 2 → a card at 390. |
| | The 404 visits excuse exactly ONE console line: the document's own expected 404. |
| | New `cta:filter-controls-clear-at-first-load`: search, toggle, reset and sort are clear of the pill at scroll 0 at 11 desktop/tablet sizes and 4 phone sizes. Negative control: it fails on the pre-fix build (1440×900, 1536×864). |
| | `ctaChecks` restores the scroll position when it finishes. |

The step5, step4.1 and step4 smokes are unchanged; they pass against 1.4.0.
