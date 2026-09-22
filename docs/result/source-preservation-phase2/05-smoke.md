# Phase 2 — Targeted fixture smoke

```
pnpm smoke:preservation-clone
```

**43/43 checks, 0.1s.** Also auto-collected by `smoke:all`.

Everything runs against a synthetic Source Package and a throwaway localhost
origin. No captured site is read and no real host is contacted, so the smoke is
fast, offline and deterministic. The fixture is constructed through the **real
Phase 1 zod schemas** — if the Source Package contract changes underneath the
builder, this fails loudly rather than the next real build failing mysteriously.

The fixture has two viewports (desktop 1440×900, mobile 390×844) whose runtime
CSSOM snapshots differ, four style entries covering every representation branch,
executable and data scripts, a tracker inside `<noscript>`, an oversized video,
two URLs serving identical bytes, a data: URL, a srcset, an `<object>` and
`<embed>`, a `speculationrules` block, a `<meta http-equiv=refresh>` and a
commented-out `url()`.

Checks 24–28b were added in response to the independent review and each one
fails against the pre-review code.

## The 14 required proofs

| # | Proof | Checks |
|---|---|---|
| 1 | runtime DOM used, not the initial document | 1 |
| 2 | executable scripts neutralized | 2, 2b, 2c, 2d |
| 3 | authored linked CSS preserved | 3 |
| 4 | authored inline CSS preserved | 4 |
| 5 | CSSOM-only style emitted as runtime-derived | 5, 5b |
| 6 | stylesheet order deterministic | 6 |
| 7 | `%` / flex / `@media` / `calc()` not flattened | 7, 7b, 7c |
| 8 | normal image URL localizes | 8 |
| 9 | srcset descriptors survive rewriting | 9, 9b |
| 10 | `@font-face` URL localizes and rewrites | 10 |
| 11 | data: URL remains self-contained | 11, 11b |
| 12 | oversized resource becomes an honest residual | 12, 12b |
| 13 | identical-SHA assets dedupe | 13, 13b |
| 14 | Source Package remains read-only / unmodified | 14 |

## Additional checks

| # | Proof |
|---|---|
| 15 | desktop and mobile runtime states are not merged |
| 16 | third-party iframe neutralized, not cloned |
| 16b | tracking hidden inside `<noscript>` is neutralized, not passed through |
| 16c | no tracker was fetched at build time either |
| 17 | inline `on*` handlers neutralized |
| 18 | `javascript:` link neutralized |
| 19 | preload/prefetch hints removed |
| 20 | internal link preserved as the source route, not invented locally |
| 21 | manifest records zero executed scripts and no geometry reconstruction |
| 22 | unresolved style entry reported honestly, not silently dropped |
| 23 | preview server serves the variant over `http://localhost` |
| 23b | preview server serves localized assets with the right content-type |
| 23c | preview server refuses path traversal out of the clone root |
| 24 | `<object>` / `<embed>` neutralized (browsing contexts, not images) |
| 25 | `speculationrules` neutralized (JSON the browser still acts on) |
| 26 | `<meta http-equiv=refresh>` neutralized |
| 27 | `url()` inside a CSS comment neither rewritten nor fetched |
| 28 | resource ledger has no duplicate URLs |
| 28b | a script preserved for both viewports is marked shared, not counted twice |

## Notes on two of them

**7c** asserts that no frozen viewport pixel width (`1440px`, `390px`,
`1024px`, `1920px`) appears anywhere in the emitted HTML or CSS. This is the
direct guard against the Phase 2 failure mode of pixel reconstruction.

**14** hashes the whole fixture Source Package tree before and after the build
and requires byte equality. The Source Package is input, never output.

## What this smoke deliberately does not do

No pixel comparison, no visual scoring, no width sweep, no real site. Judging
fidelity is the human's job (see `07-human-review-guide.md`).
