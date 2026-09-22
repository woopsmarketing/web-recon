# 02 — Validation

All final numbers are from the **repo root**. They were taken after the one release cut (`interior-01-1.4.0-9e1ea20da947`, the same hash as the devroot candidate), the fixture re-pin and the three builds.

| | Result |
|---|---|
| Release | cut once. Old releases: 251/251 files unchanged (`shasum -c`), including `interior-01-1.3.1-bd4ae8fb1769`. The 1.3.1 packages (now `previous`): 1,151/1,151 files unchanged. |
| Builds | 3/3. large `d0837ea41ecf`, small `9556a277e62a`, empty `3eaf7f4af865`. Previous (rollback) = 1.3.1: `2c0cddf19d05` / `727ce3f49003` / `f3e50a1accb4` |
| Typecheck | pass |
| `pnpm test:platform` | **206/206**: slice1 72 · step4 47 · step41 35 · step5 32 · polish 4 · step52 16 (new). polish runs 4 because its 1.3.1-package checks skip once a later release is current, by design. |
| Polish / whole-site smoke | **962/962** checks, 30 visits · `screens/summary.json` |
| Step 5 / 4.1 / 4 smokes | 504/504 · 180/180 · 24/24 |

## Site-wide CTA

**Present on every page family:**
- home at 320, 390, 430, 800, 1000, 1440 and 1920;
- `/portfolio` at 390, 800, 1000 and 1440;
- a filtered URL;
- the open filter panel at 390 and 1440;
- `/portfolio/page/2` at 390 and 1440;
- detail at 390, 800 and 1440;
- 404 at 390 and 1440 (HTTP 404);
- fixture-small portfolio and detail (Korean label);
- **absent** on fixture-empty (home, 404), and on every page when disabled or with no destination (step52 I1, I2).

**Fixed invariant:**
- `position: fixed`, with the viewport as the containing block;
- 16/16 below 900 and 24/50 from 900, within 1px, at 6 scroll stops per page;
- no jump, on top;
- safe-area insets add (emulated), and zero insets return to the seat;
- keyboard reachable with a visible focus ring;
- never over footer text at the end of the page.

**Reachability:**
- every visible control, including filter chips, hit-tests clear once scrolled to the viewport centre;
- 6–65 controls per visit, 0 blocked;
- with the filter panel open: 65 controls.

**First load:**
- the filter's search, toggle, reset and sort are clear of the pill at 11 desktop/tablet sizes and 4 phone sizes;
- this check fails on the pre-fix build (negative control).

**Survives client navigation:**
- detail → "All projects", and page 2 → a card;
- the same element, exactly one, in the footer;
- this check fails on the first candidate, where each page owned its footer (negative control).

**Every visit:** 0 horizontal overflow, 0 broken media, 0 non-local requests, 0 console or page errors.

**Static output** (step52 P2/P3):
- every page of large and small has exactly one seat, as the footer's last child, pointing to the business email with the site's label;
- markup = 1.3.1 + the seat;
- the stylesheet = 1.3.1 + one rule.

## Area basis

| Check | Result |
|---|---|
| A1 | exactly `supply` / `exclusive` / `unknown` are accepted; absent is valid; other values are refused. |
| A2 | all 100+ stored fixture areas are still valid and read as `unknown`. |
| A3 | `defaultAreaBasis`: Korean + residential + 평 → `supply`; m², non-Korean, non-residential → `unknown`; case- and separator-insensitive. |
| A4 | the filter record keeps `{ 34, pyeong }`: no basis, no 84㎡ / 25.4평 substitution. |
| I3 | end to end: supply / exclusive / unstated build identical detail `<main>` showing "34평"; `basis` never appears in the browser output. |
| I4 | the 1.3.1 release refuses basis content (fails closed). |
| D | current documents re-pinned to 1.3.1 reproduce the 1.3.1 buildInputIds (backward compatible, no document change). |

## Not verified

- Real iOS safe-area (no `viewport-fit=cover`).
- WebKit / Gecko: Chromium only.
- Screen reader output.
