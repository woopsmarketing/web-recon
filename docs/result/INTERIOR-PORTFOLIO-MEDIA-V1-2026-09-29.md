# Interior portfolio media V1 — Track B producer (2026-09-29)

Part of BOOST PORTFOLIO EXPERIENCE V1. The consumer side is BoostChat
`docs/result/BOOSTCHAT-PORTFOLIO-EXPERIENCE-V1-2026-09-29.md`.
Small-unit reports:
- contract decision: `docs/work/portfolio-experience-v1/02-contract-and-architecture-decisions.md`
- media inventory: `docs/work/portfolio-experience-v1/01-media-inventory.md`
- producer implementation, review and build: `docs/result/portfolio-media-1.1/00-summary.md`
- normative addendum: `docs/reports/integration/08-portfolio-media-1.1-addendum.md`

## Result fields

```
START_HEAD                 de51ef8
FINAL_HEAD                 code b7d8ef5; this report lands in the docs commit that follows it
BRANCH                     track-b/static-deployment-foundation
PORTFOLIO_DOCUMENT_VERSION 1.1 (minor, additive `record.media`; PRODUCER_VERSION 3)
OLD_DOCUMENT_COMPATIBLE    YES (1.0 golden frozen and hash-pinned; consumers check major only; M2 proves a 1.0-shaped record is a valid 1.1 record)
RECORDS_TOTAL              19
RECORDS_WITH_COVER         19
RECORDS_WITH_GALLERY       8 (bi-01 … bi-08; 41 exported images)
GALLERY_MAX                12
HAS_MORE_SUPPORTED         YES, derived (totalCount > gallery.length); no boolean on the wire
TOTAL_COUNT_SUPPORTED      YES (bi-01: totalCount 13, 12 exported)
OG_IMAGE_USED_COUNT        0
MEDIA_SOURCE_VALIDATED     YES (snapshot asset table → publicPath/width/height; D1 regex + MD-1a; every path exists in the package and is rendered by its own detail page)
OLD_PACKAGES_CHANGED       NO (no published package bytes mutated; keep-2 rotation dropped only the local working-tree copy of a4777cf9, which stays in history.jsonl and R2)
LIVE_PACKAGE               480e5e65b0611ab280de8ae0c242e050a5a9711bbeb7f0e90c46c9f5c107298c (buildInputId 3a897d2e…)
ROLLBACK_PACKAGE           ada03d20d4c0688316e274a724d4298aa031128098ed23b591a5b65c004a25d6
PRODUCTION_PUBLISHED       YES (interior-demo.boostweb.co.kr)
OTHER_SITES_CHANGED        NO (only routing/interior-demo.boostweb.co.kr.json was written)
BLOCKERS                   0
MAJORS                     0 open
MINORS                     3 open (see §5)
```

## 1. What shipped

- The portfolio document is now 1.1. Each record may carry `media = {cover?, gallery?[1..12], totalCount?}`, where each image is `{src (same-origin path), alt? (authored only), width?/height?}`.
- Media is presentation data only. The producer does not touch matcher fields, and the consumer's matcher-invariance test proves identical rankings and model payloads.
- bi-09 … bi-19 carry a cover only. That cover is the authored cover the live site renders, reused from bi-01 … bi-08 (recorded in 01-media-inventory as a reused authored asset). Before/after images are not exported.
- Template `interior-01@1.6.1` is unchanged. Compared with the rollback package, only `_integration/` differs (manifest plus the new document).

## 2. Production evidence

Publish ran in controlled steps. The logs are in `docs/result/portfolio-media-1.1/proof/`:

| step | log | result |
|---|---|---|
| dry run | `30-publish-dry-run.log` | plan only |
| upload, not activated | `31-publish-upload-no-activate.log` | packageHash 480e5e65…, `pointerWrite: not-activated` |
| remote re-verify | `32-publish-reverify.log` | re-verified, still not activated |
| activate (`--expect-live ada03d20…`) | `33-publish-activate.log` | `routing/interior-demo.boostweb.co.kr.json → 480e5e65… (previous ada03d20…)` |

The D9 order held: the BoostChat consumer deploy (8dc40356, 02:20 KST) went live before this activation (02:29 KST), and the audited refresh ran after it.

Live check on 2026-09-29, after the E2E runs:
- `/_integration/manifest.json` → resource version `d95b5cb5f8f05e50e624eb44d39393f5`.
- The document is `schemaVersion 1.1` with 19 records, 19 covers, 8 galleries and 41 images. The largest gallery has 12 images, and bi-01 has totalCount 13.

BoostChat snapshot after the audited refresh (ops runner, audit row written):
- snapshot d95b5cb5, schema 1.1
- 19 records, 19 covers, 8 galleries, 41 images, 1 record with hasMore

Rollback, which serves the 1.0 document again (the consumer then shows image-less cards):
`RECON_PUBLISH_ALLOW_REMOTE=1 ./node_modules/.bin/tsx --tsconfig platform/tsconfig.json platform/cli/site-publish.ts --site boost-interior-demo --host interior-demo.boostweb.co.kr --remote --rollback --expect-live 480e5e65b0611ab280de8ae0c242e050a5a9711bbeb7f0e90c46c9f5c107298c`

## 3. Tests (final build, `proof/runs/`)

| run | result |
|---|---|
| `integration.test.ts` | 82 / 0 |
| `detail-facts.test.ts` | 25 / 0 |
| `integration-golden.ts` check | exit 0 (no drift; frozen 1.0 golden byte-identical) |
| ia150 / ia151 / ia152 / predemo / predemo2 / step6 | 15/0 · 10/0 · 14/0 · 10/0 · 9/0 · 32/0 |
| `publish.test.ts` | 59 / 0 |
| `tsc -p platform/tsconfig.json` | exit 0 |

Consumer compatibility: BoostChat parses a byte copy of this golden (`fixtures/first-party/golden-v1.1-media/`) in `test:portfolio-media-contract`, which passes 41/41.

## 4. Independent review (fresh context)

The review found 0 BLOCKER and 2 MAJOR:
- **Percent-encoded dot segments.** Fixed with MD-1a, which BoostChat also applies.
- **D9 publish order.** Handled operationally: consumer first, then publish, then refresh.

Of the MINORs, two were fixed and one was accepted (see `00-summary.md` §5a).

## 5. Open MINORs (carried to BoostChat `docs/status/DEFERRED-FOLLOWUPS.md`)

1. **Mobile footer overlap.** The launcher overlaps the footer on mobile. The fix needs an interior-01 1.6.2 template cut and a new Template seam; it is not done here.
2. **SVG covers on other sites.** The producer emits SVG covers, but the consumer's delivery refuses SVG. This does not affect boost-interior-demo (all JPEG). Open decision: filter at the producer or accept the fallback.
3. **Single-image records.** bi-09 … bi-19 show one image, because they are synthetic fixture records with reused covers. A real customer site would carry its own galleries.

## 6. Not changed

- Other sites
- Template version
- Old packages' bytes
- R2 objects of other packages
- Budget settings
- JEV (JEV_TOUCHED NO)
