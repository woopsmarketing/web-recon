# Portfolio media 1.1 — Track B producer (2026-09-29)

Scope: this is the producer side of Portfolio Experience V1, decision D1
(`docs/work/portfolio-experience-v1/02-contract-and-architecture-decisions.md`).
The package is built locally and is **not published**: no remote, R2 or routing was touched.
BoostChat is not touched.

## 1. What changed

| file | change |
|---|---|
| `platform/integration/contract.ts` | `PORTFOLIO_SCHEMA_VERSION` `"1.0"` → `"1.1"` (minor: an additive field). `PRODUCER_VERSION` 2 → 3. New `MEDIA_SRC_RE`, `MEDIA_ALT_MAX` = 160, `MEDIA_GALLERY_MAX` = 12 |
| `platform/integration/emit.ts` | new `MediaImage` / `PortfolioMedia` types and an optional `record.media` (the last key). `projectMedia()`: the cover from `cover`; the gallery from `galleryGroups[].items[].image` (after images only, authored order, first 12); `totalCount` counts all after images; src/width/height come from the snapshot asset table; alt is copied only when authored; a missing asset fails closed |
| `platform/integration/validate.ts` | strict `MediaImageSchema` + `PortfolioMediaSchema`, which enforce every D1 rule, plus the MD-1a hardening (§5a). `media` is optional on the record |
| `platform/cli/integration-golden.ts` | `GOLDEN_DIR` now points at the new 1.1 golden. `GOLDEN_V02_DIR` names the frozen 1.0 golden, and check mode also verifies its four files against literal sha256 values. `goldenRecord` adds `addendum` and `counts.media` |
| `platform/test/demo-rollout.ts` | one import: it reads the V0.2 golden through `GOLDEN_V02_DIR` (same meaning as before) |
| `platform/test/integration.test.ts` | E6, E7 and B2b restated, with the reasons in comments. New checks: E11, E12, M1–M4, G6b. Pinned values updated (§3) |
| `platform/test/detail-facts.test.ts` | `GOLDEN_VERSION` moved to the 1.1 golden (all facts unchanged). New B8: every media image is rendered by its own detail page |
| new `platform/test/golden/portfolio-v1.1-media/` | `manifest.json`, `portfolio.d95b5cb5f8f05e50e624eb44d39393f5.json`, `golden.json`, `README.md` |
| new `docs/reports/integration/08-portfolio-media-1.1-addendum.md` | normative addendum mirroring D1. 00–07 are not edited |
| new `docs/work/portfolio-experience-v1/01-media-inventory.md` | per-record media inventory |
| `data/site-builds/boost-interior-demo/**` | one canonical build (§4) |

`platform/test/golden/portfolio-v0.2/` is **unchanged** (byte-checked: G6b and the golden CLI).

## 2. Decisions

- **PRODUCER_VERSION 3.** `contract.ts` says to bump it "whenever the projection, ordering,
  serialisation or validation changes", and both the projection and the validation changed.
  `producerSourceHash` would move the build identity anyway; the bump is the human-readable signal.
- **The validator and old documents.** The producer validator validates what this producer emits,
  so `schemaVersion` must be exactly `"1.1"`, and a `"1.0"` label on a 1.1 emission is refused (V9).
  `media` is optional, so a 1.0-shaped record is a valid 1.1 record. M2 proves this on the frozen
  V0.2 golden: as `"1.0"` it is refused **only** for its schemaVersion, and relabelled `"1.1"` it
  validates with 0 errors. The consumer still accepts both (major 1).
- **Golden layout.** There are two directories. `portfolio-v1.1-media/` is the golden the producer
  emits now (check / `--write`). `portfolio-v0.2/` is frozen as the 1.0 compatibility fixture: it
  is never written and is hash-pinned. The CLI change is minimal: one more constant and a frozen
  hash check.
- **`hasMore` is not emitted.** It is derived; `golden.json` counts it as `derivedHasMore`.
- **The asset source** is the snapshot's asset table: the same `publicPath` / `width` / `height` that
  `createAssetResolver` hands the Template. This avoids importing `platform/assets` into the
  producer, which would have widened `PRODUCER_SOURCE_FILES`.

## 3. New pinned values

| | V0.2 (frozen, 1.0) | media 1.1 |
|---|---|---|
| resourceVersion | `d56509c8100a56fdf9644baff78ff9e1` | `d95b5cb5f8f05e50e624eb44d39393f5` |
| document | 11 608 B, `c7662414…` | 20 158 B, `5da25dd2…` |
| manifest | 274 B, `b2f52b73…` | 274 B, `495376e5…` |
| empty document version | `e4815a16…` | `94bea71d…` |

Media counts: all 19 records have a cover; 8 have a gallery (bi-01 … bi-08), with 41 exported
images and `totalCount` summing to 42. bi-01 has `totalCount` 13 with 12 exported, so `hasMore` is
derived as true. bi-09 … bi-19 are `{ cover }` only. bi-04's 2 before images are excluded.

## 4. Build

The final build is `proof/13-site-build-after-review.log`.

- `buildInputId` **`3a897d2efbe04357071a8c633a7723f6ed169e7471c96c64258c2577bd026395`**
- `packageHash` **`480e5e65b0611ab280de8ae0c242e050a5a9711bbeb7f0e90c46c9f5c107298c`**
- template `interior-01@1.6.1` (`interior-01-1.6.1-8da56de8d28f`), unchanged
- QA passed: 199 files, 26 HTML pages; 19 records; schemaVersion 1.1; contract `{core 0.1, portfolio 1.1}`, producer 3, 0 warnings
- `_integration/` = the 1.1 golden, byte for byte. All 41 media paths exist in the package.
- Compared with the live widget package `ada03d20…` (after canonicalising the build id), exactly 3
  entries differ, all in `_integration/`: the manifest, and the old document replaced by the new
  one. No page, asset or script changed (`proof/12-package-diff-vs-widget.json`, final package).

There were two builds. The first (`43ee5eb0…`, packageHash `34e7b925…`, `proof/10-site-build.log`)
came before the independent review. The review's validator fix (§5a) changed a producer source
file, and producer source files are part of the build identity, so a rebuild was unavoidable.

To keep the live package as the rollback, I deleted my own unpublished, untracked package
directory `43ee5eb0…` first. The builder rotates `previous` only to an intact current package
(`site-build.ts:545`), so `previous` stayed `32303241…`. `history.jsonl` keeps both lines; the
`43ee5eb0…` line records a superseded build that was never published. The final package differs
from `43ee5eb0…` only in the build id: its `_integration/` bytes are identical.

**Pointers / keep-2.** Before the first build: current = `32303241…` (widget, live, `ada03d20…`)
and previous = `a4777cf9…` (first V0.2). Now: current = `3a897d2e…` (media 1.1, not published) and
previous = `32303241…`, so the live package stays on disk as the rollback. keep-2 deleted the
`packages/a4777cf9…` directory. Because commits `cb781e8` / `aa2d94b` track package directories
in git, that shows up as **225 tracked files deleted (` D`)**, plus ` M current.json / previous.json
/ history.jsonl` and `??` for the new package directory. This is the same shape as `aa2d94b`
(which dropped `0f80b239…`). The deleted package is still in `cb781e8` / HEAD and sealed in R2, and
B2b re-hashes it from git. Nothing was staged or committed.

## 5. Tests

These results are from the final build (`proof/runs/`). The first build gave the same counts.

| run | result |
|---|---|
| `integration.test.ts` | **82 passed / 0 failed / 0 skipped**, plus 1 point-in-time (G5, unchanged). It was 75; the 7 new checks are E11, E12, M1, M2, M3, M4 and G6b |
| `detail-facts.test.ts` | **25 / 0** (was 24; B8 is new) |
| `integration-golden.ts` (check) | exit 0: drift [], frozen v0.2 drift [], 0 errors / 0 warnings |
| `ia150` / `ia151` / `ia152` / `predemo` / `predemo2` / `step6` (they import `demo-rollout.ts` and read the current package) | 15/0 · 10/0 · 14/0 · 10/0 · 9/0 · 32/0 |
| `publish.test.ts` (uses the demo's real current package, in memory, no network) | 59/0 |
| `tsc -p platform/tsconfig.json --noEmit` | exit 0 |

Before the build, a sabotage run of the non-build checks was done. With `..` accepted, the
`min(totalCount, 12)` rule disabled and before-images exported, 8 checks failed (E1b, E7, E11, E12,
M3, M4, G6, G7). The files were then restored and byte-compared.

### 5a. Independent review (Opus, fresh context, no expected verdict)

The review found 0 BLOCKER, 2 MAJOR, 3 MINOR and 2 NOTE items.

- **MAJOR (fixed).** A percent-encoded dot segment (`/assets/%2e%2e/…`) passed the D1 regex.
  - A URL parser resolves it as `..`.
  - The validator now also requires a UR2 path: no empty, `.` or `..` segment, and well-formed escapes. It rejects `%2e`, `%2f`, `%5c` and `%00` in any case.
  - M3 gained 12 encoded cases, and 08 records this as MD-1a ("consumers SHOULD"). D1's regex is unchanged; this rule is stricter, never looser.
  - **BoostChat should apply MD-1a too.**
- **MAJOR (open, orchestrator).** `current.json` now names an unpublished 1.1 package, and nothing mechanical stops `site:publish` before the consumer is live (D9). Adding a publish guard would mean changing the publish CLI, which is outside this scope. **Hold the publish until D9 step 2 is confirmed.**
- **MINOR (fixed).** The golden CLI's frozen check vouched for itself through the directory's own `golden.json`. It now checks the 4 files against literal hashes.
- **MINOR (fixed).** A blank (whitespace-only) `alt` was accepted. It is now refused, and M4 covers it.
- **MINOR (accepted).** The validator does not cross-check `src` against the snapshot asset table at build time. The emitter derives `src` only from that table, and T1, B2b and detail-facts B8 prove that every path exists and is rendered by its own page. Enforcing it in the validator would change the builder seam.
- **NOTE (fixed).** The `contract.ts` header now cites 08.

The full historical `test:platform` suite was not run. No shared foundation code outside
`platform/integration` (plus the golden CLI and tests) changed.

## 6. Mobile footer (optional task): not done, MINOR

A fix needs an interior-01 **1.6.2** cut: bump `template.ts` version, run `template:release
interior-01@1`, re-pin `site.json` by hand. I2b fails on any template edit until then. The 1.6.1
precedent (`interior-portfolio-v0.2/38-`) required 14 suites, a real build and a fresh review.
It also cannot be one CSS rule: the only reserve today is `body:has(.i1-fcta) .i1-footer`, and no
body/html hook tells CSS that a head-script launcher took the seat, so the Template would need a new
seam. Finally, a second demo build would rotate keep-2 again and drop the live `32303241…` package
from the working tree. The overlap (`BOOST-INTERIOR-LIVE-WIDGET-EMBED-2026-09-28.md` §7.1) stays
**MINOR** for the next template cut.

## 7. Remaining risks

- **Order (D9).** The consumer must be live before this package is published. Publishing it first
  would leave an old consumer "unchanged" on a media-less copy.
- **SVG media on other sites.** The fixtures' covers are SVG. The producer emits them (D1 does not
  filter by type), and D4's delivery endpoint refuses SVG. This does not affect boost-interior-demo
  (all JPEG), but a later site that opts in with SVG covers would get broken images. That is a
  follow-up decision: filter to raster types at the producer, or accept the consumer fallback.
- **Pre-publish window.** current.json names an unpublished package, while the live pointer is still
  `ada03d20…`. A second rebuild before the publish would retire the live package directory
  (keep-2), but it stays recoverable from git and R2.
- **Rollback.** Rolling back to `ada03d20…` serves the 1.0 document again, with media absent. D1
  says the consumer handles this.
