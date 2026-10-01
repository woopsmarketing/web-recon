# Interior Demo Product Rename — 2026-10-01 (Track B)

One customer-facing word on the demo site, requested by the BoostInterior sales task
(`boost-interior-sales/docs/result/BOOSTINTERIOR-SALES-V2-PRICING-PACKAGING-2026-10-01.md`, prompt §28): the product is
sold as **BoostInterior**, and the demo's footer notice was the one visible place that still said BoostChat.

```
FOOTER_PRODUCT_NAME             = PASS  (BoostChat → BoostInterior, that word only)
FOOTER_SCOPE                    = boost-interior-demo only
VISIBLE_BOOSTCHAT_IN_PAGES      = 0     (15 built pages; 13 sitemap pages live)
WIDGET_TAG / ORIGIN / IDS       = UNCHANGED (boostchat.co.kr/widget.js, boostchat-widget, data-boost-chat-key)
WIDGET "Powered by boostchat"   = UNCHANGED (inside the widget iframe; owner decision 2026-10-01: it may stay)
PRODUCTION_RECORD_COUNT         = 8 (bi-01 … bi-08, document 968afbcc…, unchanged bytes)
NON_DEMO_SITE_CHANGED           = NO
TEMPLATE_RELEASE                = NONE (site stays pinned to interior-01@1.6.1)
TRACK_B_LIVE_PACKAGE            = e562dedd17e9b7aeaf44e3c12e5474de40b155427bea97679c7ac11f57d47be8 (build 01f7ac78…)
ROLLBACK TARGET (previous)      = b10d430b2da3d954e5d2b59f8baec8933583c2eb94f7a713e0a7670cb8699535 (build ddbc72ad…, 8 records)
```

## 1. The change

`data/sites/boost-interior-demo/slots.json` → `site.footer.notice`:

| | text |
|---|---|
| before | 부스트 인테리어는 BoostChat 기능 시연을 위한 가상 인테리어 브랜드입니다. 포트폴리오·후기는 데모용 예시이고, 사진은 AI로 생성한 예시 이미지입니다. |
| after | 부스트 인테리어는 BoostInterior 기능 시연을 위한 가상 인테리어 브랜드입니다. 포트폴리오·후기는 데모용 예시이고, 사진은 AI로 생성한 예시 이미지입니다. |

The rest of the disclosure is the wording reviewed on 2026-09-29 (fictional brand, demo cases and reviews, AI-generated
photos). No other slot, site, template or script changed. Internal names keep their value: the widget origin, the head-script
id and the widget tag's data attributes.

## 2. Build and publish

| step | log (`interior-demo-product-rename/proof/`) | result |
|---|---|---|
| build (once) | `11-site-build.log` | 01f7ac78… / packageHash e562dedd…; 144 files, 7,379,519 B (+288 B); 8 records, document 968afbcc… unchanged |
| dry-run `--check-store` | `30-publish-dry-run.log` | host serves b10d430b…; would upload 144; pointer write; 0 warnings |
| upload `--no-activate --expect-package e562dedd…` | `31-…log` | uploaded 144, verified 144, sealed; pointer not read or written |
| `--reverify` | `32-…log` | skipped-sealed, reverified 144/144 |
| activate `--expect-live b10d430b… --expect-package e562dedd…` | `33-…log` | published, pointer written, previous = b10d430b… |
| live HTTP | `34-live-http-check.log` | 13/13 sitemap pages 200; new notice 1, old notice 0 on each; `/` and `_integration/manifest.json` byte-identical to the package |
| live browser (1440, 390) | `35-live-browser-check.log` | footer = new text, no visible "BoostChat", widget iframe present, overflow 0, console errors 0, failed requests 0 |

Package diff against ddbc72ad…: 71 files differ (15 html, 56 txt), each by the notice word (footer + RSC payload) and the
Next build id; 73 files are byte-identical. The widget `<script>` tag is identical on every page.

keep-2 retired the data-truth build 71a906c1… (packageHash 9d4036ba…) from the tree. It is intact in git at `822ee12`, and
B2b reads it from there.

## 3. Tests

| suite | result |
|---|---|
| publish | 66/0 |
| portfolio-production-truth | 10/0 |
| integration | 85/0 (1 point-in-time) |
| predemo2 / predemo | 9/0 · 10/0 |
| step6 | 34/0 |
| detail-facts | 25/0 |
| ia150 / ia151 / ia152 | 15/0 · 10/0 · 14/0 |
| slice1 | 86/0 |
| tsc -p platform | exit 0 |

Same counts as before the change. Logs: `40-*.log`. Integration was run again after the commits (85/0).

- **Product name as a data delta.** The rename is the seventh deliberate data delta, `DEMO_FOOTER_PRODUCT_NAME` in
  `portfolio-qa-corpus.ts`; its `before` is the sixth delta's `now`. B2 and Q1 revert the product name, then the notice, prove
  each is exactly the one field, and land on the unchanged `_PRE_FOOTER` and `PRE_SPLIT_SNAPSHOT_HASH` anchors. The old head
  anchor is kept as `DEMO_SNAPSHOT_HASH_AT_LIVE_PIN_PRE_RENAME`.
- **Rollout lineage (B2b).** Current = 01f7ac78…, previous = the footer-notice build ddbc72ad…. The data-truth build
  71a906c1… is retired by keep-2 and read from git `822ee12` (`DATA_TRUTH_PACKAGE_COMMIT`), with every assertion it had as
  `previous`. If `822ee12` is ever rewritten, that constant must follow.
- No assertion was removed or loosened. Three checks were added: the rename is exactly the one word, the notice named it
  once, and the rename is a real delta.

Not run: the browser smoke script `scripts/template-platform-predemo2-smoke.ts` (only its `FOOTER_TEXT` constant was
updated) and `publish-e2e`. No independent review round was held for this one-word change.

## 4. Commits (web-recon-track-b, not pushed)

- `a87bbdc` fix(site): name BoostInterior in interior demo disclosure
- `1da1658` build(site): publish BoostInterior-named interior demo package
- (this report's commit) docs(site): record interior demo product rename

Not mine and left alone: `docs/result/static-deployment-foundation/proof/live-e2e.json` (untracked, pre-existing).

## 5. Rollback

`site:publish --site boost-interior-demo --host interior-demo.boostweb.co.kr --remote --rollback --expect-live e562dedd…`
re-points the host at b10d430b… (the BoostChat-worded notice, same 8 records). Not run. The portfolio-truth guard has
nothing to refuse there: both packages serve bi-01 … bi-08.
