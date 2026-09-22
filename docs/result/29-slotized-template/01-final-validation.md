# Task 29 FAST — Final Validation

## Typecheck

`pnpm typecheck` (`tsc --noEmit`), run **once**, at the end of all phases, over the whole repo.

- Result: **EXIT 0, 0 errors**. Log: `tmp/wr29/logs/typecheck-final.log`.

## E2E invocation — two runs, one correction cycle

`pnpm task29:e2e` (`scripts/task29-e2e.ts`), grading Task 29 (baseline-relative: DEFAULT is the reconstruction baseline,
NEW fails only when it is worse), gates S1–S5.

### Run 1 — `tmp/wr29/logs/e2e-run1.log` — EXIT 1

| gate | verdict |
| --- | --- |
| S1 (artifacts present) | PASS |
| S2 (default-render text provenance) | PASS (100.00% over 6 measurements) |
| S3 (repeater coverage) | **FAIL** |
| S4 (theme neutrality/visibility) | PASS |
| S5 (source-identity leakage) | **FAIL** |

Findings:
- `REPEATER_COVERAGE_INCOMPLETE [rosee/new]` — driven 5 but added 3 / removed 5 / reordered **0** (need ≥1 each)
- `REPEATER_COVERAGE_INCOMPLETE [channel/new]` — driven 4 but added 6 / removed 6 / reordered **0** (need ≥1 each)
- `SOURCE_IDENTITY_LEAK [channel/new /kr/pricing@390 and @1440]` — source phone `1644-4052` kept as quantitative text (the "keep quantitative text" pack rule didn't recognize a phone number as identity; the static audit's needle set missed it too)

Classification (per contract's failure taxonomy): SLOT / BINDING / REPEATER / THEME / COMPILER engines were OK; not a
LEGACY defect; HARNESS was OK. This was a **FIXTURE/AUDIT gap**, not an engine bug — the realistic content-pack builder
never exercised a reorder, and the phone-number shape wasn't in the audit's needle list.

### Correction — ONE narrow cycle (`tmp/wr29/handoffs/E1-fix.md`)

Two files touched, nothing else:
- `src/slotized-template/packs.ts` — added `sourceContactDigits`/contact-shape detection (email, business-registration,
  strong/weak phone patterns) so `isQuantitative()` no longer keeps a value that carries contact identity;
  `rewriteContactIdentity()` substitutes only the matched digits (label text survives); `buildRealisticPack` now swaps
  the first two surviving repeater items after building, guaranteeing ≥1 reorder.
- `src/slotized-template/audit.ts` — added digit-normalized phone/tel needles (`PHONE_SHAPE_RES`) registered wherever
  the default pack contains a matching shape, matched by stripping non-digits from every scanned surface.

### Run 2 — `tmp/wr29/logs/e2e-final.log` — EXIT 0

| gate | verdict | detail |
| --- | --- | --- |
| S1 | PASS | rosee: present; channel: present |
| S2 | PASS | default-render text provenance worst 100.00% over 6 measurements |
| S3 | PASS | rosee: 5 driven, +3/-5, 5 reordered; channel: 4 driven, +6/-6, 4 reordered · duplicate ids introduced 0 |
| S4 | PASS | default theme adds 0 bytes on both sites; mutated theme visible on 6/6 measurements |
| S5 | PASS | every NEW-render check passed (render, overflow, ids, content volume, injected strings, identity, media, overlap) |

**0 FAIL, 2 WARN** (`BROKEN_IMAGES [channel/new /kr/pricing@390 and @1440]` — 6 images `naturalWidth 0` in the NEW
render vs 8-9 in the baseline; these are remote source images that cannot load offline, a baseline condition, not a
regression — the NEW count is lower, not higher, than the baseline).

Full report: `docs/result/29-slotized-template/e2e/task29-e2e-report.json` (top-level keys: `schemaVersion`,
`schemaName`, `createdAt`, `durationMs`, `args`, `gates`, `sites`, `findings`), summary table:
`docs/result/29-slotized-template/e2e/task29-e2e-summary.md`.

**Full historical regression: NOT RUN — Reason: Task 29 FAST speed/token policy.**

## Routes / widths

| template | route | pageId | widths |
| --- | --- | --- | --- |
| rosee | /17 | p000003 | 390, 1440 |
| rosee | /34 | p000005 | 390, 1440 |
| channel | /kr/pricing | p000004 | 390, 1440 |

## Slot coverage per site (eligible / slotted / unslotted, `coverage.json`)

**ROSEE** (`data/beomeo.roseeskin.com/slotized-templates/2026-09-12T21-31-21-048Z/coverage.json`):

| class | eligible | slotted | unslotted | reason |
| --- | ---: | ---: | ---: | --- |
| visibleText | 4122 | 4122 | 0 | — |
| links | 3632 | 3632 | 0 | — |
| images | 556 | 556 | 0 | — |
| backgroundMedia | 533 | 533 | 0 | — |
| video | 0 | 0 | 0 | — |
| alt | 470 | 470 | 0 | — |
| ariaLabel | 0 | 0 | 0 | — |
| titlePlaceholder | 58 | 36 | 22 | infrastructure (iframe titles) |
| metadata | 17 | 17 | 0 | — |
| **total** | **9388** | **9366** | **22** | |

**CHANNEL** (`data/channel.io/slotized-templates/2026-09-12T21-31-22-344Z/coverage.json`):

| class | eligible | slotted | unslotted | reason |
| --- | ---: | ---: | ---: | --- |
| visibleText | 2847 | 2764 | 83 | aria-hidden |
| links | 960 | 940 | 20 | aria-hidden |
| images | 361 | 361 | 0 | — |
| backgroundMedia | 48 | 48 | 0 | — |
| video | 2 | 2 | 0 | — |
| alt | 311 | 311 | 0 | — |
| ariaLabel | 80 | 70 | 10 | aria-hidden |
| titlePlaceholder | 20 | 8 | 12 | infrastructure (iframe titles) |
| metadata | 15 | 15 | 0 | — |
| **total** | **4644** | **4519** | **125** | |

`audits/summary.json.counts.unexplainedUnslotted = 0` on both sites — every unslotted surface above carries an
explicit `reason` (`infrastructure` or `aria-hidden`); none is an unexplained gap.

**Combined**: eligible 14,032 · slotted 13,885 · classified-unslotted 147 · unexplained 0.

## Hardcoded-content audit

Gate `hardcodedContent`: **PASS** on both sites (`audits/hardcoded-content.json`, folded into `audits/summary.json`).

## Source leakage (default REPORT_ONLY vs realistic PASS)

| site | pack | leaks | unslottable leaks | gate |
| --- | --- | ---: | ---: | --- |
| rosee | default | 879 | 9 | REPORT_ONLY (default IS the source) |
| rosee | mechanical | 29 | 9 | REPORT_ONLY |
| rosee | realistic | **0** | 9 | **PASS** |
| channel | default | 2398 | 112 | REPORT_ONLY |
| channel | mechanical | 45 | 16 | REPORT_ONLY |
| channel | realistic | **0** | 16 | **PASS** |

Independent grep cross-check of the rendered realistic pages found 0 occurrences of `범어로제`, `imweb`, `beomeorosee`,
`채널톡`, `채널코퍼레이션`, `Channel Corp`; a digit-normalized scan for the source phone digits (`16444052`,
`0537541475`) found 0 hits (remaining `1644` substrings are CSS class names `wr-st001644` only).

## Repeater mutation results

Representative repeaters (mechanical pack, -1/+1/reorder), 0 duplicate DOM ids introduced in every case:

| repeater | site/route | before → after | +/-/reorder | cloned nodes |
| --- | --- | ---: | --- | ---: |
| `17.main.div.repeater-29` | rosee /17 | 9 → 9 | +1/-1/reorder | 2/variant |
| `34.main.main.repeater-29` | rosee /34 (desktop only) | 3 → 3 | +1/-1/reorder | 8 (incl. 2 namespaced DOM ids) |
| `34.body.ul.repeater-01` (fixed) | rosee /34 | 8 → 8 | reorder only | 0 |
| `kr-pricing.body.div.repeater-08` | channel /kr/pricing | 3 → 3 | +1/-1/reorder | 8 |
| `kr-pricing.body.div.repeater-16` (bounded) | channel /kr/pricing | 12 → 12 | +1/-1/reorder | — |

Final e2e (realistic pack, after the correction): rosee 5 repeaters driven total, +3/-5/5 reordered; channel 4 driven,
+6/-6/4 reordered. **Duplicate ids introduced: 0/0 both sites**, on every render measured across Phase C/E1/E1-fix/E2.

## Theme mutation

| site | default overlay | mutated overlay | nodes repainted @1440 | nodes repainted @390 |
| --- | --- | --- | --- | --- |
| rosee | 0 bytes (byte-identical stylesheet, 12,709,582 B) | +506,144 B (~3,855 rules) | 792/800 (color+font) | 456-487/798-800 (color only, font false — mobile breakpoint rules differ) |
| channel | 0 bytes (byte-identical stylesheet, 8,364,801 B) | +261,935 B (~2,621 rules) | 780/800 (color+font) | 779/800 (color+font) |

Default theme pack adds 0 bytes on both sites (proven neutrality); mutated pack visibly repaints on all 6 measurements
(`GATE S4: PASS`).

## New content injection (applied / failed)

| site | pack | applied | failed | css overrides |
| --- | --- | ---: | ---: | ---: |
| rosee | default | 8833 | 0 | 0 |
| rosee | realistic + mutated theme | 9292 | 0 | 499 |
| channel | default | 4674 | 0 | 0 |
| channel | realistic + mutated theme | 4674 | 0 | 28 |

## Important warnings

- `BROKEN_IMAGES` ×2 (channel NEW /kr/pricing@390 and @1440) — remote images offline, baseline condition (see above).
- `STALE_SRCSET_STRIPPED` — 32 (page,variant,node) `<img>` on channel where a bound `src` changed but `srcset` did not;
  `render.ts`'s `stripStaleSrcsets` drops the stale attribute so a NEW render never fetches from the source CDN via
  `srcset`. Root fix (emit srcset bindings) not done — inputs frozen (see `00-implementation-summary.md` limitations).
- `REPEATER_NESTED_SKIPPED` — only one level of a nested repeater pair can be driven per render (rosee 1 page, channel
  3 pages affected).
- Fit warnings: 0/0 on realistic packs both sites; mechanical packs produce 3394 (rosee) / 459 (channel) — ~98% are
  `url` slots, where a long href is not a layout concern (finding, not fixed).

**Full historical regression: NOT RUN — Reason: Task 29 FAST speed/token policy.**

## MANUAL QA COMMANDS

```
# (1) slotize
pnpm slotize data/beomeo.roseeskin.com/recon-templates/2026-09-12T20-43-19-430Z/manifest.json
pnpm slotize data/channel.io/recon-templates/2026-09-12T20-43-19-441Z/manifest.json

# (2) render default (neutral)
pnpm render:template \
  --template data/beomeo.roseeskin.com/slotized-templates/2026-09-12T21-31-21-048Z/manifest.json \
  --content data/beomeo.roseeskin.com/slotized-templates/2026-09-12T21-31-21-048Z/content-packs/default.json \
  --theme data/beomeo.roseeskin.com/slotized-templates/2026-09-12T21-31-21-048Z/theme-packs/default.json \
  --out /tmp/wr29-render-rosee-default --assert-neutral

pnpm render:template \
  --template data/channel.io/slotized-templates/2026-09-12T21-31-22-344Z/manifest.json \
  --content data/channel.io/slotized-templates/2026-09-12T21-31-22-344Z/content-packs/default.json \
  --theme data/channel.io/slotized-templates/2026-09-12T21-31-22-344Z/theme-packs/default.json \
  --out /tmp/wr29-render-channel-default --assert-neutral

# (3) render new (mechanical / realistic + mutated theme)
pnpm render:template \
  --template data/beomeo.roseeskin.com/slotized-templates/2026-09-12T21-31-21-048Z/manifest.json \
  --content data/beomeo.roseeskin.com/slotized-templates/2026-09-12T21-31-21-048Z/content-packs/realistic.json \
  --theme data/beomeo.roseeskin.com/slotized-templates/2026-09-12T21-31-21-048Z/theme-packs/mutated.json \
  --out /tmp/wr29-render-rosee-new

pnpm render:template \
  --template data/channel.io/slotized-templates/2026-09-12T21-31-22-344Z/manifest.json \
  --content data/channel.io/slotized-templates/2026-09-12T21-31-22-344Z/content-packs/mechanical.json \
  --theme data/channel.io/slotized-templates/2026-09-12T21-31-22-344Z/theme-packs/mutated.json \
  --out /tmp/wr29-render-channel-mechanical

# (4) preview
pnpm template:preview /tmp/wr29-render-rosee-new

# (5) packs / audit
pnpm template:packs data/beomeo.roseeskin.com/slotized-templates/2026-09-12T21-31-21-048Z/manifest.json
pnpm template:audit data/beomeo.roseeskin.com/slotized-templates/2026-09-12T21-31-21-048Z/manifest.json \
  --render /tmp/wr29-render-rosee-new

# (6) e2e
pnpm task29:e2e
# flags: --sites rosee,channel  --only default|new  --skip-build  --strict-overflow
#        --rosee-run <dir>  --channel-run <dir>  --out <dir>  --review-out <dir>  --work <dir>

# (7) theme re-extract
pnpm template:theme data/beomeo.roseeskin.com/slotized-templates/2026-09-12T21-31-21-048Z/manifest.json
```
