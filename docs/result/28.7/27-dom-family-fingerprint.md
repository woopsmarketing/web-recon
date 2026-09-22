# Task 28.7 §27 — the DOM-family fingerprint, and the tree switch that finally observes a swap

**Status: ADOPT.** The signal discriminates on real data, the headline defect moved, and the
back-compat path is byte-identical.

---

## 1. The defect, and where the brief's premise was wrong

`measureObservedChange` (`src/reconstruction/tree-switch.ts`) inferred the tree switch from
GEOMETRY changes of the probe's parked nodes. A CSS reflow and a DOM-family swap both move
geometry, so on linear.app `/` the geometry counts were **1,868 changed nodes at 1025 against
1,783 at 641** — inside 5% — the ranker took the larger, the clone swapped trees at 1025, and
700px and 1024px viewports were served the 390px mobile tree.
`TreeSwitchDecision.domSwitchWidthObserved` was hardcoded `false` on every path, precisely
because nothing had ever observed a swap.

The brief proposed an ELEMENT-POPULATION fingerprint, reading the QA's `969 → 2,860` jump as a
"3× jump in element count". **That reading was wrong and the measurement says so.** `969` and
`2,860` are `visibleNodes`; the source's `totalNodes` is FLAT:

| route | 390 | 700 | 1024 | 1100 | 1440 |
|---|---|---|---|---|---|
| `/` totalNodes | 4,666 | 4,704 | 4,704 | 4,704 | 4,704 |
| `/pricing` totalNodes | 2,771 | 2,771 | 2,771 | 2,771 | 2,771 |

linear.app ships BOTH variants in one document and swaps them with `display`. A population-only
fingerprint would have called it purely CSS-responsive and changed nothing.

**The field that works is the RENDERED population** — elements that generate layout boxes
(`getClientRects().length > 0`). Mounting a variant and displaying one are the same fact to a
reconstruction that has to choose a tree, and only the rendered set is common to both.

## 2. What was built

- `src/observer/types.ts` — `LayoutProbeFingerprintSchema` (`elements`, `rendered`, `structure`,
  `truncated`), `PROBE_FINGERPRINT_STRUCTURE_MAX_DEPTH = 6`, and an OPTIONAL `fingerprint` on
  `LayoutProbeWidthSchema`. No schema bump: absence has ONE meaning under both versions.
- `src/observer/layout-probe.ts` — the fingerprint is taken inside `measureInBrowser`, in the same
  `page.evaluate` as the geometry, at every width the probe already visits. Inlined because
  `page.evaluate` serializes one function and nothing its module scope closes over.
- `src/sitespec/{types,compile-page}.ts` — carried to `PageSpec.layoutProbe.fingerprints` and
  `layoutProbeMobile.fingerprints`, all-or-nothing, and **not gated on probe attachment**.
- `src/reconstruction/tree-switch.ts` — `familyChangeVerdict` / `familyChangeSize` /
  `measureFingerprintChange` / `rankFamilyChangeCandidates`, and the precedence.
- `src/reconstruction/{types,responsive-plan,index}.ts` — the provenance reaches the manifest.

### The change predicate

`|Δrendered| ≥ max(8, 5% of the larger)` **or** the same on `elements` **or** the structure hash
differs while BOTH counts are EXACTLY equal.

The 5% is measured, not chosen: on linear.app's own probe the noise band between adjacent
samples of the same family is 0.16–0.75% and the smallest real swap is 11.4%. The
exact-equality guard on the structure clause is load-bearing — on `/pricing` the shallow hash
changes across 640→641 where six of 796 boxes move, and a hash difference on its own would have
nominated the wrong width.

### Measured cost

In-page, median of 7 repeats, linear.app, same settled layout:

| width | existing geometry pass | fingerprint walk |
|---|---|---|
| 390 | 1.8 ms | 1.7 ms |
| 641 | 1.8 ms | 2.0 ms |
| 1024 | 1.6 ms | 1.8 ms |
| 1440 | 2.0 ms | 2.5 ms |

**~2 ms on a ~300 ms per-width budget — under 1%**, because the per-width cost is dominated by
`setViewportSize` + `LAYOUT_PROBE_SETTLE_MS`, and the walk reads `getClientRects()` rather than
`getComputedStyle`. Artifact growth: four scalars (~90 bytes) per width.

## 3. What the fingerprint says on linear.app

Observation `2026-09-04T17-21-07-726Z` (clean: `/` 2,306 elements, `/changelog` 2,230).

`/` (p000001) — `elements` 2,306 at every width up to 1440:

| width | 390 | 640 | **641** | 769 | 900 | 901 | 928 | **929** | 1024 | 1025 | 1101 | 1280 | 1281 | 1440 |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| rendered | 732 | 732 | **1883** | 1874 | 1874 | 1874 | 1874 | **2084** | 2084 | 2095 | 2095 | 2095 | 2102 | 2056 |

→ family changes at **641** (+1,151, +157%) and **929** (+210, +11.2%). Nowhere else, including
1025, where the shallow hash changes but only 11 of 2,084 boxes move.

`/pricing` (p000003) — `elements` 1,363 at every width:

| width | 390 | 640 | 641 | 769 | 928 | 929 | 1024 | **1025** | … | 1920 |
|---|---|---|---|---|---|---|---|---|---|---|
| rendered | 796 | 796 | 802 | 793 | 793 | 793 | 793 | **1278** | 1278 | 1278 |

→ family changes at **1025** only (+485, +61%).

`/changelog` (p000002) — rendered 2,086 → 2,117 → 2,116 across the whole sweep: **no family
change anywhere**, which is the correct answer for a route that is genuinely CSS-responsive. It
falls back to the geometry path, unchanged.

## 4. The deciding measurement

Clone visible nodes / scrollHeight, `/`:

| width | source vis | **clone BEFORE** | **clone AFTER** | clone sh BEFORE → AFTER |
|---|---|---|---|---|
| 390 | 969 | 1,008 | 1,008 | 5,876 → 5,876 |
| 700 | 2,892 | **1,001** | **2,511** | 5,876 → **9,960** |
| 1024 | 3,079 | **991** | **2,784** | 5,876 → **9,960** |
| 1100 | 3,055 | 3,047 | 3,047 | 9,960 → 9,960 |
| 1440 | 3,094 | 3,060 | 3,060 | 9,960 → 9,960 |

**The clone population stops being byte-identical across 390/700/1024. YES.**
`/pricing` is unchanged at every width (its switch was already 1025; it is now *observed*).

QA verdict counts are the same headline number — 6 BLOCKER / 2 MAJOR / 2 MINOR of 10, before
(`2026-09-04T15-52-40-935Z`) and after (`2026-09-04T17-25-07-319Z`) — but the CAUSE on the two
affected pairs is completely replaced:

| pair | BEFORE BLOCKER channels | AFTER |
|---|---|---|
| `/` @700 | image-presence-ratio 0.379, missing-text-ratio 0.4915, visible-text-ratio 0.4785 | footer-clipped, offscreen-text-excess-chars 1127, missing-text-ratio **0.1071** |
| `/` @1024 | image-presence-ratio 0.383, missing-text-ratio 0.5425, nav-link-ratio 0.500, visible-text-ratio 0.4092, scroll-height-ratio-low 0.58 | footer-clipped, offscreen-text-excess-chars 918 (missing-text 0.0774, demoted to MAJOR) |

Every tree-selection channel the brief named is gone. What remains is a DIFFERENT defect class:
the desktop tree is now correctly mounted at 700/1024 and its own layout rules put a 1,390px
footer inside the viewport. That is the next defect, not this one.

### `variant-tree-not-observed` got honest

Per-route baseline `reconstructions/2026-09-04T16-18-35-699Z` → after
`reconstructions/2026-09-04T17-24-33-839Z`:

| route | switch before → after | unserved widths before → after |
|---|---|---|
| `/` | 1025 → **641** | [641, 929, 1281] → **[929]** |
| `/changelog` | 1025 → 1025 | [641] → [641] *(geometry fallback, no family change anywhere)* |
| `/pricing` | 1025 → 1025 | [641] → **[]** |
| `/security` | 641 → 641 | [1025] → [1025] *(geometry fallback)* |

The route whose swap width is now served stopped reporting it, and the two widths where only
boxes reflowed (1281 on `/`, 641 on `/pricing`) stopped being blamed on the clone. The site-level
union drops from four codes to three; the remaining 641 comes from `/changelog`, which has no
fingerprint evidence of a swap and therefore keeps the geometry rule.

## 5. Back-compat

hobbang.net reconstructed offline from `site-specs/2026-09-04T15-33-24-202Z` (artifacts with no
fingerprint) → `reconstructions/2026-09-04T17-30-46-296Z`. Against the previous run:
site switch 768 → 768, method `authored-breakpoint` unchanged, all ten route breakpoints 768,
`variantTreeNotObserved` unchanged, candidate list identical modulo the three new fields
(all `0 / false / 0`), `domSwitchWidthObserved` still `false`, `pagesWithFingerprint: 0`.

## 6. Tests

`scripts/smoke-multi-observer.ts` — `testDomFamilyFingerprint()`, 9 checks, three new local
fixtures that all change at the SAME width so a fingerprint that fired on "something happened"
would pass all three: `/family-mount` (population moves), `/family-display` (population FLAT,
rendered set moves — linear's shape), `/css-fluid` (negative control, byte-identical
fingerprint at every width, with a discrimination check that the boxes really do move).

`scripts/smoke-layout-safety.ts` — `familyFingerprintChecks()` (Part 16), 26 checks: the
predicate against the measured noise band and the measured swaps; precedence; no-fingerprint
byte-identity; constant-fingerprint invents nothing; truncation proves no equality; two swaps →
biggest ships and the other is named; `variant-tree-not-observed` stops over-reporting; the
structure-only swap; attachment independence; per-route.

### Each check was proved to discriminate, by mutation

A surgical mutation, one suite run, restore from a checksummed backup, checksum re-verified.
No git.

| mutation | what it reproduces | result |
|---|---|---|
| **D** — `measureFingerprintChange` never reads a fingerprint | the pre-§27 decision | `smoke:layout-safety` **311/325**, 14 red (every §27 assertion except the three that assert *equality with the old behaviour*, which correctly stay green) |
| **A** — the probe emits no `fingerprint` | the pre-§27 artifact shape | `smoke:multi-observer` **259/263**, 4 red |
| **B** — `rendered` counts every element | **the population-only fingerprint the brief proposed** | `smoke:multi-observer` **261/263**, 2 red: the two display-swap checks. Empirical proof that a population-only design would not have moved linear.app. |
| **C** — the structure hash is constant | a fingerprint with no structure signal | `smoke:multi-observer` **262/263**, 1 red |

Every restore was verified by re-reading the file's SHA-256 against the pre-mutation backup;
all four matched.

### Suite state

`pnpm typecheck` exit **0** · `smoke:multi-observer` **263/263** (was 254) ·
`smoke:layout-safety` **325/325** (was 299) · `smoke:reconstruction` **227/227** (unchanged).

## 7. Limitations carried

- Reads the DESKTOP probe only. A site that serves a different DOM by USER AGENT rather than by
  viewport width is invisible to it — exactly as it was to the geometry path. The mobile probe's
  fingerprint is captured and carried and is not yet read.
- A structure-only swap carries magnitude 0 and is therefore ordered by the unchanged geometry
  ranker among its peers. There is no measurement of "how much" a same-size swap changed.
- Still only two observed trees. `/` swaps at 641 AND 929; the clone serves 641 and reports
  `variant-tree-not-observed-at-929`.
- The structure hash is capped at depth 6; a same-size swap deeper than that is caught only if
  it moves a count.

---

## CORRECTION (appended 2026-09-05, after the independent architecture audit)

The `/` table in §3 is captioned "`elements` 2,306 at every width **up to 1440**". Re-measured:
**2,306 holds through 1281; at 1440 the total element count is 2,260**, and the table stops at
1440 while the probe sampled two further widths.

The caption is therefore wrong at exactly the boundary it names. **The conclusion is unaffected**:
every decision in this report reads the `rendered` row (boxes with `getClientRects().length > 0`),
never the `elements` total — that is the whole point of §2, which shows a population-only signal
classifies linear as CSS-responsive and changes nothing (proved by mutation B). The `elements`
row is context, and it is a slightly wrong piece of context.
