# Step 5.2 — Tiny Template Finalization (interior-01 1.4.0)

**Status: PASS (2026-09-19).**
- New immutable release **`interior-01-1.4.0-9e1ea20da947`**, cut once in the repo root.
- `interior-01-1.3.1-bd4ae8fb1769` is unchanged; its packages are each site's rollback (`previous`).

| Decision | Result |
|---|---|
| A. Floating CTA site-wide | The root layout renders `SiteFooter` once for every page, and the footer renders the seat as its last child. Covers `/`, `/portfolio` (filtered and paginated), detail and 404. Absent when disabled or with no contact destination. It is one instance that survives client navigation, so a future chat launcher keeps its state. `sections/FloatingCta.tsx` remains the only replacement point. |
| B. Area basis | `area.basis`: `supply` \| `exclusive` \| `unknown` (optional; absent = unknown; backward compatible). A bare Korean residential "34평" → `supply` at authoring time (`defaultAreaBasis`). 34평 supply ≈ 112㎡ is a unit conversion; ≈ 전용 84㎡ is context only, with **no automatic equivalence**. No filter, display or NL change. |

## Validation ([02](02-validation.md))

- Typecheck: pass.
- `test:platform`: 206/206.
- Whole-site smoke: 962/962.
- Step 5 / 4.1 / 4 smokes: 504 / 180 / 24.
- 0 non-local requests, 0 broken media, 0 horizontal overflow.

## Reviews (fresh, read-only)

**Architecture / regression:** no BLOCKER or HIGH.
- MAJOR, fixed: the seat was re-created on every client navigation. The footer moved into the root layout.
- MINOR/NIT fixed: locale case, the escaped-payload check, the narrower 404 console filter, "unknown" documented.
- Other MINORs recorded in [03](03-open-items.md).
- The architecture review confirmed no assertion was weakened; the only test change is the `useId` canonicalisation in step5 AD, which keeps the ids' structure exact.

**Visual / UX / contract:** no BLOCKER or HIGH.
- MAJOR, fixed: the pill covered the `/portfolio` sort dropdown on first load at 1440×900. One CSS rule places the actions beside the count, and a smoke check now guards it.
- MINOR (first-load overlaps freed by scrolling; three contact affordances on the detail page) and NITs recorded in [03](03-open-items.md).

Details: [01 changes](01-changes.md) · [03 open items](03-open-items.md).

**NEXT: Step 6 Demo Customer Content Proof.**
