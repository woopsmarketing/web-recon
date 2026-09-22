# 06 — Style / Emotion forensic

**Verdict on duplicate Emotion tags: DISPROVEN as the cause of the footer collapse.** They are real
duplicates, but they are harmless for the footer.

Probe: `lib/style-fidelity-probe.mjs`. It walks `document.styleSheets` in document order, reads **CSSOM**
rules rather than just `<style>` text, and records the origin of every rule for the class tokens of the
probed elements.

## Inventory (attempt 2)

| # at F1/F2 | owner | `data-emotion` | node text | CSSOM rules F0 → F1 → F2 → 390 | origin |
|---|---|---|---|---|---|
| 0 | `<style>` head | `css-global` | **empty** | — → 20 → 20 → 20 | **client-inserted** (speedy `insertRule`) |
| 1 | `<style>` head | `css xuaqpw 8atqhb …` (SSR id list) | 20,339 chars | 107 → 107 → 107 → 107, CSSOM hash `df812eac` constant | preserved (SSR tag) |
| 2 | `<style>` head | `css` | **empty** | — → **43** → **150** → **183** | **client-inserted** (speedy `insertRule`) |
| 3 | `<style>` head | `css-global` | 3,028 chars | 20 (unchanged) | preserved |
| 4 | `<style>` head | `css` | 23,857 chars | 159 (unchanged) | preserved (runtime-derived Phase 2 tag) |
| 5–6 | `<link>` body | — | — | 250 / 42 | preserved stylesheets |
| 7–8 | `<style>` body | — | 20,260 / 907 | 40 / 4 | preserved (fonts etc.) |
| 9 | `<style>` body | `css-global 0` | empty | 0 | preserved, empty |
| 10 | `<style>` div | styled-components | 2,672 | 18 | preserved |

- **Tag count:** 9 → 11 sheets (7 → 9 `<style>` elements).
- **Insertion order:** the client cache prepends its `css-global` tag at head index 0, and puts its `css`
  tag at index 2. That is **after** the preserved SSR tag (1) and **before** the preserved runtime-derived
  tag (4).
- **Text hash:** preserved tags are byte-identical before and after (node-text and CSSOM hashes unchanged).
  The new tags have empty text. Their rules exist only in CSSOM, so **`dom-after.html` cannot show them**
  (a serialization limitation).
- **Duplicate bodies:** no two sheets have identical CSSOM text (`duplicateSheetBodies: []`).
- **Same rule twice:** duplicated rule texts go 6 → 55 (F1) → 162 (F2) → 174 (390), as the client cache
  re-inserts rules whose class hashes already exist in preserved tags.

## Do runtime styles override preserved styles?

For the probed footer elements, the rule origins in document order are:

| element | F0 | F1 | F2 |
|---|---|---|---|
| row `css-1qi39fj` | sheet 2 (preserved runtime-derived) | sheet 4 (the same preserved tag, shifted) | **sheet 2 (client) + sheet 4 (preserved)**, identical declarations `display:flex; flex-direction:row; max-width:1920px; padding:120px 0` |
| logo box `css-17taob2` | sheet 2 | sheet 4 | client + preserved, identical `width:30%` |
| grid `css-1d3bbye` | sheet 2 | (F1 grid had `css-1d4lhyj`) | client + preserved, identical `display:flex; flex-wrap:wrap; width:100%` |
| column wrapper `css-v7v99c` | (spacer) sheet 1 | **sheet 1 only** | **sheet 1 only**, `width:100px` |
| grid items `css-1ho082a`/`css-19egsyp` | sheet 1 | sheet 1 | sheet 1 |

- Wherever a class is defined twice, the declarations are **byte-identical**. Emotion class names are
  hashes of the serialized styles, so the same name means the same rule. The later sheet in document
  order is the preserved tag 4, so **preserved wins**, and the computed value would be the same either way.
- The declaration that breaks the footer, `width:100px` on `.css-v7v99c`, is defined **once**, in
  preserved sheet 1. That sheet's CSSOM hash is identical at F0, F1, F2 and 390. It applies because the
  element carries that class, not because of cascade order.
- **Timing rules it out:** F1 was already collapsed when the client `css` tag held 43 rules, and none of
  them defines a footer class used at F1.
- **Computed-winner cross-check:** for every probed footer property, the "last applicable declaration in
  document order" equals the computed value. The only differences are percentage-to-px resolutions
  (`30%` → 432 px, `100%` → the container width).

## What the duplicates are

Measured: the client `css` tag grows 43 (F1) → 150 (F2) → 183 (390), and at F2 it contains rules for
classes also present in preserved tag 4 (for example `css-1qi39fj`, `css-17taob2`, `css-1d3bbye`).
**Likely explanation, not verified:** Emotion's client cache registers only the ids listed on SSR
`data-emotion` tags. Tag 4 is a Phase 2 *runtime-derived* capture whose ids are not in that list, so the
cache re-inserts those rules when components render them. Either way, the observed effect is duplication,
not conflict.

**Not investigated:** whether duplicated rules could matter for a class whose later preserved copy is
media-dependent. No probed footer element showed that.
