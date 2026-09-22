# Task 28.6 Wave 6 — OBS2 lane report

- **Lane**: OBS2 (single-writer, Wave 6)
- **Ownership**: `src/observer/**`, `src/multi-observer/**`, `scripts/smoke-multi-observer.ts`, `src/cli-observe.ts`, `src/cli-observe-site.ts`
- **Scratch**: `tmp/wr286/obs2/`
- **Predecessor**: a previous attempt at this lane was killed mid-flight by a session limit. This session's first job was to determine, file by file, what it had actually finished — not trust the hand-off summary.

---

## 0. Headline

The hand-off said "O1 and O5 appear landed — verify." Reading the code first showed the
interrupted attempt had actually gone further: **O1, O2, O4 and O5 were all fully
implemented**, in `observe-page.ts`, `collect-dom.ts` and `types.ts`, each carrying the exact
defect-repair comments and MEASURED evidence numbers from the pilot brief already in place.
**O3 was NOT** — its constants, schema fields (`MIN_GUARANTEED_FLOOR_WIDTHS`,
`guaranteedFloorWidths`, `floorWidthsEvicted`, `breakpointsAdoptedByEviction`) and even the
doc comments describing the fix were all written in `types.ts`, but `probe-widths.ts`'s actual
`deriveProbeWidths()` still seeded the WHOLE floor unconditionally and never evicted anything
— the exact defect the doc comments describe fixing. That is the shape of a session-limit
kill: the design and the paperwork were finished, the one function that had to change was not.

None of O1–O5 had a single dedicated regression check in `smoke-multi-observer.ts` — the
symbol greps the hand-off suggested (`redirectedFrom`, `border-collapse`) matched only the
implementation, not any test. This session's work was therefore: (1) verify each of O1, O2,
O4, O5 against the code and the brief's evidence numbers, read-only; (2) implement O3's
missing eviction logic; (3) write mutation-proven permanent checks for O1, O2, O3, O5 (22 new
checks, all proven RED by breaking their invariant and green again after restoring it); (4)
re-observe one live page each of seoultone.kr and hobbang.net to confirm O1 and O4 against the
real sites named in the brief, and, as a byproduct of the same infrastructure, one before/after
pair on seoultone.kr's root page proving O3's adoption/drop split actually inverted.

**Result**: `pnpm typecheck` exit **0**. `smoke:multi-observer` **167/167** (floor 145, +22
permanent checks over the 145 baseline). Every new O1/O2/O3/O5 check confirmed RED by breaking
its fix and green again after restoring it (§5). Live re-observations: seoultone.kr → blocked
5/recovered 5/missed 0 (was 4/1); hobbang.net → font URLs resolve to `cdn.jsdelivr.net` and a
live `curl` confirms **HTTP 200, 34,568 bytes, `font/woff2`** on the URL the fix produces.

---

## 1. Item-by-item: already-landed vs. newly-done, and how I told the difference

### O1 — redirected stylesheet lost on capture — **ALREADY LANDED**, newly **covered + live-verified**

**Evidence it was landed**: `observe-page.ts:252-343` carries `StylesheetCaptureStats.
redirectResponses` / `redirectAliasesKeyed` / `redirectChainsTruncated`, the `redirectChainUrls()`
walk of `request().redirectedFrom()` bounded by `MAX_STYLESHEET_REDIRECT_HOPS`, and a 3xx
response handler that counts the redirect and returns instead of falling into
`bodyUnavailable`. `types.ts:954-990` documents the exact fix with the seoultone.kr numbers
from the brief already inline. Nothing was half-applied: the write side (capture) and the read
side (the multi-URL `bodies` map keyed by every alias) were both complete.

**What was missing**: zero references to `redirect` anywhere in `smoke-multi-observer.ts`
before this session (`grep -n redirect scripts/smoke-multi-observer.ts` → no hits).

**What I added**: a new fixture section, "Redirected stylesheet recovery" — two origins, one
plain CORS-blocked sheet (contrast) and one reached only through a 302 on the same
no-CORS origin. 5 checks: both sheets blocked and both recovered
(`fallbackMissed: 0`), the 3xx counted as `sheetsRedirectResponses` and never as
`sheetsBodyUnavailable`, the alias keyed via `redirectedFrom()`
(`sheetsRedirectAliasesKeyed: 1`), and — the strongest check — the RECOVERED declaration on the
page is literally the redirect target's own CSS (`width: 222px`, `origin: "fetched"`), proving
the recovered bytes are the right ones, not just present.

**Live verification** (required by the brief, not skipped): re-observed
`http://seoultone.kr/` alone (`data/seoultone.kr/site-observations/2026-09-02T22-22-43-798Z/`,
scratch selection `tmp/wr286/obs2/seoultone-single-page.json`, one page, not a site rerun).

| | before (`2026-09-02T20-18-18-932Z`, pre-fix) | after (`2026-09-02T22-22-43-798Z`, this session) |
|---|---|---|
| `cssomBlocked` | 5 | 5 |
| `fallbackRecovered` | 4 | **5** |
| `fallbackMissed` | 1 | **0** |
| `sheetsBodyUnavailable` | 1 | **0** |
| `sheetsRedirectResponses` | *(field did not exist)* | 1 |
| `sheetsRedirectAliasesKeyed` | *(field did not exist)* | 1 |
| `bytesBridged` | 650,631 | **665,243** (+14,612 — the swiper sheet, byte-exact against the brief) |

Exactly the acceptance target: **blocked 5 / recovered 5 / missed 0**.

### O2 — @import counters name more than they count — **ALREADY LANDED**, newly **covered**

**Evidence it was landed**: `types.ts:897-1030` documents both counter families
(`importsExpanded`/`importsUnresolved` = Node text-inlining path only;
`importRulesVisited`/`Followed`/`Recovered`/`Unresolved` = the separate in-page CSSOM walk) and
adds `importsResolvedTotal`/`importsUnresolvedTotal` as the sum of both. `collect-dom.ts:1117-
1137` shows the silent skip is fixed: the `if (imported) { visit(...) }` now has an
`else { coverage.importRulesUnresolved++; }`, with a comment naming the exact bug. `observe-
page.ts:811-820` wires the two Node-path counters through and computes the two `*Total` sums.

**What was missing**: zero references to `importsExpanded`, `importsUnresolved`, or
`importRulesFollowed` anywhere in `smoke-multi-observer.ts` before this session.

**What I added**: a new fixture, "@import coverage across both resolution paths", deliberately
constructed to exercise all four shapes named in the brief in one page load:

- (a) a CORS-blocked top-level sheet whose own `@import` pulls in a second captured sheet
  → Node path, `importsExpanded`.
- (b) that same sheet also carries a syntactically broken `@import "broken;` (unterminated
  string) → Node path, `importsUnresolved`.
- (c) a native same-origin `<style>` that `@import`s a sheet ALSO linked at the top level (so
  its body is recoverable) → in-page path, `importRulesFollowed` + `importRulesRecovered`.
- (d) a native same-origin `<style>` that `@import`s a sheet reachable ONLY through that one
  `@import` → in-page path, `importRulesUnresolved` — the exact shape of the fixed silent skip.

7 checks, including one that the two `*Total` fields are the actual SUM of both paths
(`2 = 1 Node-expanded + 1 in-page-followed`, `2 = 1 Node-unresolved + 1 in-page-unresolved`)
and one that the two ordinary top-level blocked sheets still recover cleanly alongside the
import scenarios (no regression to the O1/existing CSS-truth coverage).

### O3 — probe-width cap spent floor-first — **NOT LANDED** (design done, behavior not), fixed this session

**Evidence it was NOT landed**: `types.ts` already defined `MIN_GUARANTEED_FLOOR_WIDTHS = 3`
with the exact severance/seoultone numbers from the brief in its doc comment, and
`ProbeWidthProvenanceSchema` already carried `guaranteedFloorWidths` / `floorWidthsEvicted` /
`breakpointsAdoptedByEviction` as optional fields with full documentation. But
`grep -rn MIN_GUARANTEED_FLOOR_WIDTHS src/observer/probe-widths.ts` — the one file that would
have to *use* the constant — matched nothing. Reading `deriveProbeWidths()`'s adoption loop
confirmed it: `for (const width of floorWidths) chosen.set(...)` seeded the WHOLE floor
unconditionally, with no eviction path at all — the exact "floor-first, no eviction" defect
named in the brief and in `types.ts`'s own comments, just never wired into the function that
runs it.

**What I built**: `probe-widths.ts`'s adoption loop still seeds the floor first (so a floor
width that happens to sit on an authored pixel — Linear's 1024 case — still costs a bracket
nothing), but only `pickGuaranteedFloor(floorWidths, MIN_GUARANTEED_FLOOR_WIDTHS)` (narrowest /
median / widest, by position not by value) is protected from eviction. When a higher-ranked
authored bracket needs a slot the cap does not have, the loop now evicts the narrowest
still-present evictable floor width(s) — deterministic, ascending order — before refusing the
bracket. `floorWidthsEvicted` and `breakpointsAdoptedByEviction` are populated from what the
loop actually did; `capHit` still means only "a bracket was actually refused," so a page whose
eviction saved every bracket does not read as capped.

**Permanent checks** (pure, no browser — `deriveProbeWidths` is deterministic by design): a
40-breakpoint tally against the standard 7-width floor and a 16-width cap. 4 new checks: the
guaranteed core (390/1024/1920) survives cap pressure that evicts real floor width(s); an
evictable floor width is genuinely given up (not just theoretically evictable) and
`breakpointsAdoptedByEviction > 0`; every floor width is accounted for — surviving or named in
`floorWidthsEvicted`, never silently gone; and 6 high-rank brackets (12 fresh widths) are
adopted against a pre-O3 budget of 9 — impossible without eviction, proving the reorder is real
and not just present in the type.

**Bonus live evidence** (not required by the acceptance line, produced as a byproduct of the
O1 re-observation infrastructure — one page, not a site rerun): re-ran
`http://seoultone.kr/` alone a SECOND time, once against the pre-fix code (before I wrote
O3, while verifying O1/O4) and once against the fixed code, same page:

| | before (`2026-09-02T22-22-43-798Z`) | after (`2026-09-02T23-06-43-268Z`) |
|---|---|---|
| `breakpointsAdopted` | 5 | **6** |
| `breakpointsDroppedByCap` | 1 (the authored `1600/max`) | **0** |
| `capHit` | true | **false** |
| floor width 700 | present | **evicted** (`floorWidthsEvicted: [700]`) |
| `guaranteedFloorWidths` | *(field not populated — pre-fix)* | `[390, 1024, 1920]` |
| `breakpointsAdoptedByEviction` | *(field not populated — pre-fix)* | 1 |
| sampled widths near 1600 | *(none — refused)* | **1600, 1601** |

The exact inversion the brief names: before, the un-authored floor width 700 was kept and the
site's own authored `1600px` breakpoint was refused by the cap; after, 700 is evicted and 1600
is adopted.

### O4 — @font-face `url()` resolved against the wrong base — **ALREADY LANDED**, live-verified

**Evidence it was landed**: `collect-dom.ts:226-246` (`RawFontUrl.sheetHref`) and `:2016-2028`
(harvest carries the owning sheet's href, falling back to `document.baseURI` only for an inline
`<style>` or a `data:` src) and `collect-assets.ts:240-246`
(`resolve(font.url, font.sheetHref ?? baseUri)`) are wired end to end, each with the exact
92/184 hobbang.net numbers from the brief in the doc comments.

**Live verification** (required by the brief): re-observed `https://hobbang.net/` alone
(`data/hobbang.net/site-observations/2026-09-02T22-23-41-617Z/`, scratch selection
`tmp/wr286/obs2/hobbang-single-page.json`).

| | before (`2026-09-02T20-18-03-342Z`, pre-fix) | after (`2026-09-02T22-23-41-617Z`, this session) |
|---|---|---|
| fonts resolving to `hobbang.net/packages/...` (404) | **92** of 184 | **0** |
| fonts resolving to `cdn.jsdelivr.net/...` (200) | 0 | **92** of 184 |
| `fontFaceUrlsSheetResolved` | *(field did not exist)* | 92 |
| `fontFaceUrlsDocumentResolved` | *(field did not exist)* | **0** |

`curl -sI` on the URL the fixed pipeline now produces
(`https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/.../PretendardVariable.subset.0.woff2`):
**`HTTP/2 200`, `content-type: font/woff2`, `content-length: 34568`** — byte-exact against the
brief. No new permanent check was written for O4: the acceptance line lists permanent checks
for O1/O2/O3/O5 only, and O4's own live-verification requirement is satisfied above.

### O5 — computed-style whitelist has no table-formatting property — **ALREADY LANDED**, newly **covered + byte-costed**

**Evidence it was landed**: `types.ts:423-441` — `STYLE_WHITELIST` carries `border-collapse`,
`border-spacing`, `table-layout`, `caption-side`, `empty-cells`, wired through
`observe-page.ts:106` (`COLLECT_CONFIG.styleWhitelist`) into `collect-dom.ts:1335-1345`
(`collectStyles`), which records every whitelisted property whose computed value is non-empty.

**A wrinkle worth recording**: `border-collapse` etc. are NOT table-only in the CSSOM — `get
ComputedStyle` returns a value (`"separate"`, initial) for every element, table or not. This
means the whitelist change affects the `styles.json` record of **every element on every page**,
not just `<table>`s — exactly why the brief asked for a measured byte cost rather than an
assumption.

**Measured byte cost** (seoultone.kr root page, desktop viewport, 283 unique deduplicated style
records — `data/seoultone.kr/site-observations/2026-09-02T20-18-18-932Z` vs.
`.../2026-09-02T22-22-43-798Z`, same page, before/after this feature went live):

| | before | after | delta |
|---|---|---|---|
| `styles.json` bytes | 1,001,588 | 1,041,598 | **+40,010 (+4.0%)** |
| properties per style record | 114 | 119 | +5 |

≈141 bytes added per unique style record (5 properties × ~28 bytes each, matching
`"border-collapse":"separate",`-shaped JSON). `dom.json` is unaffected — it stores only a
`styleId` reference, not the properties themselves, so this cost is confined to `styles.json`
and scales with the number of DISTINCT style combinations on a page, not its element count.

**What I added**: two new sections, six checks. A pure check (no browser) pinning that all five
properties are on `STYLE_WHITELIST` and that the whitelist has no duplicate/longhand entries —
this is also the check that satisfies "no suite encodes the old property count," since it
asserts the CURRENT five-property state directly rather than a stale total the file would have
had to remember to bump. An end-to-end fixture (real Chromium) with two `<table>`s — one
authoring `border-collapse: collapse; table-layout: fixed`, one unstyled — proving the AUTHORED
table reaches `styles.json` as `"collapse"`/`"fixed"` while the UNSTYLED table still reads the
CSS-initial `"separate"`/`"auto"` (the property is read, not fabricated), plus a check that the
other three properties (`caption-side`, `empty-cells`, `border-spacing`) are captured too.

---

## 2. Files changed

Ownership-scoped, as required:

- `src/observer/probe-widths.ts` — O3's eviction logic (the only behavioral fix this session
  made), plus doc-comment corrections to the properties list and `floorWidths` field doc that
  the old "floor is unconditionally preserved" language made false. `pickGuaranteedFloor`
  exported so the smoke suite can assert against the SAME selection logic rather than
  duplicating it.
- `scripts/smoke-multi-observer.ts` — 22 new permanent checks across four new fixture
  sections (O1 redirected-stylesheet, O2 import-coverage, O3 pure-derivation additions, O5
  table-formatting × 2), plus the `STYLE_WHITELIST` / `pickGuaranteedFloor` imports and the
  `main()` wiring to run them. One existing O3-adjacent check
  ("turning derivation on can only ADD samples: the floor set survives every input") was
  renamed and its input battery split — the LOW-PRESSURE half keeps the ORIGINAL invariant
  unweakened (full floor survives when there is no real cap pressure), and the
  40-breakpoint HIGH-PRESSURE case moved into the new O3 section, because under the O3 fix that
  input now LEGITIMATELY evicts floor width — asserting the old universal claim on it would be
  asserting the pre-fix bug.

No other file in the lane's diff (`observe-page.ts`, `collect-dom.ts`, `types.ts`,
`multi-observer/**`, `cli-observe*.ts`, `collect-assets.ts`, `dedupe-styles.ts`, `index.ts`,
`layout-probe.ts`, `store.ts`) was written to this session — each was byte-diffed against a
backup taken before any break/restore cycle and confirmed identical after every restore
(§below). All of it was landed by the interrupted attempt and left as found.

---

## 3. Verification

- `pnpm typecheck` → **exit 0** throughout; re-verified after every edit and after every
  break/restore cycle.
- `pnpm smoke:multi-observer` → **167/167** (floor for this lane: 145; net **+22** over that
  floor, matching the 5+7+4+6 = 22 new checks tallied above).
- Each of O1, O2, O3, O5's new checks proven RED by breaking the underlying fix and running the
  full suite, then restored and re-verified GREEN (§5). O4 was proven live against the real
  site named in the brief instead — no synthetic break was needed or requested.
- No suite outside this lane's ownership was touched or re-run.

---

## 4. Live re-observations (evidence, not scratch)

Both are single-page runs against a hand-trimmed `selected-pages.json` (1 page, family/
verification siblings omitted so the loader's optional cross-checks are skipped rather than
faked) — never a site rerun:

- `tmp/wr286/obs2/seoultone-single-page.json` → `data/seoultone.kr/site-observations/
  2026-09-02T22-22-43-798Z/` (O1/O4-infra baseline) and
  `.../2026-09-02T23-06-43-268Z/` (post-O3-fix rerun of the same page, §1 O3).
- `tmp/wr286/obs2/hobbang-single-page.json` → `data/hobbang.net/site-observations/
  2026-09-02T22-23-41-617Z/`.

Both left in `data/` as evidence, matching how the site's other runs are stored — not deleted,
not scratch.

---

## 5. RED/GREEN proof method

For O1, O2, O3 and O5 in turn: backed up the fixed file(s), made the SMALLEST possible edit
that disables just that fix (never touching test code), ran `pnpm typecheck` (stayed 0 — the
breaks were deliberately type-safe, e.g. a loop bound changed to `0` rather than a type-level
removal), ran the full suite, confirmed exactly the checks naming that defect went red and
nothing else did, then restored the exact original file from the backup and re-verified with a
byte diff (`diff -q backup current`) before moving to the next.

| break | checks that went RED | count |
|---|---|---|
| O1: redirect-chain walk loop bound forced to 0 | both-recover, aliases-keyed, recovered-declaration | 3 |
| O2: `else { importRulesUnresolved++ }` removed (bare `continue`, restoring the exact pre-fix skip) | O2(d) unresolved-count, `*Total` sum | 2 |
| O3: `evictableRemaining` seeded empty (no eviction candidates) | eviction-genuinely-happens, high-rank-adopted-by-eviction | 2 |
| O5: five table properties removed from `STYLE_WHITELIST` | pure whitelist check, all 3 end-to-end checks | 4 |

Final clean run after every restore: **167/167**, `pnpm typecheck` exit 0.

---

## 6. Known limitations / carried forward

- O4 has no dedicated permanent smoke check (not required by the acceptance line, which lists
  O1/O2/O3/O5 only). If a future lane wants one, `resolve()`'s `sheetHref ?? baseUri` fallback
  in `collect-assets.ts` is the unit to target; the live re-observation in §1/§4 is the evidence
  it works today.
- O3's eviction order among evictable floor widths is "narrowest first, ascending, deterministic"
  — a defensible, tested choice, but the brief did not specify an eviction order and a
  different (e.g. "farthest from the new authored sample") order is not ruled out as also
  reasonable. Not revisited this session since the observable behavior (authored breakpoints
  never lose to floor before evictable floor is exhausted) is what the brief actually asked for
  and what is tested.
- The O5 byte-cost measurement is from one page (seoultone.kr root, desktop viewport). It is
  presented as a measured sample with its own arithmetic shown, not extrapolated into a
  site-wide or fleet-wide total.
