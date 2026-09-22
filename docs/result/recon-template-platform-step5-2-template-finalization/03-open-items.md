# 03 — Open items

## Closed by this step

| Was | Now |
|---|---|
| Polish open item 2: the floating seat is homepage-only | **Closed.** The seat is site-wide (SiteFooter owns it). |
| Carry-forward A: Korean area basis ("34평" is not automatically exclusive area) | **Contract closed:** `area.basis` (supply / exclusive / unknown); absent = unknown; bare Korean residential 평 → supply at authoring time (`defaultAreaBasis`); no equivalence between bases. The remaining work is listed below as items 1–3. |

## Carried forward (unchanged, recorded, not solved)

| | Item | When |
|---|---|---|
| B | Direct filtered-URL hydration flash on `/portfolio?…` | before the public Demo or BoostChat filtered links |
| C | Builder pinning / hardening | Pre-Demo Gate |
| D | Rollback runbook. The 1.3.1 packages are the retained rollback packages. **New input:** basis-carrying content cannot be rebuilt with ≤ 1.3.1 (it fails closed); roll back packages, not documents. | Pre-Demo Gate |
| E | Full SEO QA | Pre-Demo Gate |
| F | Slot vs localization review | before Template 2 |
| G | Navigation: re-evaluate a hamburger / drawer once real menu routes exist | with real navigation |
| — | Step 5 carry-forward 7: filter UX on `/portfolio/page/2+` (static pages have no filter bar) | with B |

## New or narrowed in this step

1. **Showing the basis on the page.** 1.4.0 stores the basis but does not display it; the detail page shows "34평" exactly as before.
   - Under the Korean convention, a bare "34평" already reads as supply, so supply data displays correctly.
   - An **exclusive** 평 figure (e.g. "25평") would be read as supply by a Korean visitor. It needs a qualifier (e.g. "전용 25평"), which means a Template slot.
   - Decide when Demo or customer content first states an exclusive 평 area.
2. **The area filter ignores the basis.** Buckets compare values after unit conversion, whatever the basis. A site mixing supply and exclusive figures would have them bucketed together.
   - This is unchanged `ProjectFilter` behaviour; the basis deliberately stays out of the filter index.
   - Decide with the BoostChat/NL filter-link work: filter on one basis, or show the basis in the results.
3. **Authoring still has to call the rule.** `defaultAreaBasis` is the single place the "bare 34평 = supply" convention lives. Every authoring path (operator form, import, future chat/NL) must call it for unstated figures and store the result.
   - No such path exists yet, so nothing calls it today.
   - Step 6 demo content that states a 평 area should carry `basis` explicitly.
4. **`viewport-fit=cover`** (Polish open item 1). It is still not set, so safe-area proof is emulation only. The seat is now on every page, so the decision covers the whole site; make it with the chat launcher.
5. **Three contact affordances on the detail page:**
   - the header "Contact";
   - the detail "Get in touch";
   - the seat.

   The seat is accepted as the future chat launcher, and hit-testing shows it blocks no control. Revisit if the launcher and the in-page CTA should differ in purpose.
6. **First-load overlaps freed by a short scroll** (visual review MINOR):
   - the detail area fact at 320;
   - the gallery counter at 800;
   - a footer label on the 404 page at 320 and at 390×700;
   - chips at 900×700 and 1000×800.

   Accepted under the floating-seat doctrine: the reachability test finds 0 blocked controls.
7. **The seat is the last tab stop, inside the footer landmark** (both reviews). Revisit its landmark and tab order with the chat launcher. A dialog opened from it must render outside `<footer>`.
8. **Each release retires the previous step's package checks** (polish.test runs 4 checks at 1.4.0; step52 P1–P3/D skip at ≥ 1.4.1). This is the existing gating pattern; revisit with builder hardening (C).
9. **Polish open items 3–8** are unchanged:
   - pill size;
   - the tall mobile filter panel (now also hit-tested with the seat);
   - the SSR bar state;
   - card-title wrap;
   - two "Contact" controls on the first mobile screen;
   - `:has()` cross-engine.
