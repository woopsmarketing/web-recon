# 02 — Synthetic fixtures

Machine-readable: [`synthetic-fixtures.json`](synthetic-fixtures.json).
Generator: `tmp/source-preservation-phase3c/generate-fixtures.mjs`.

## Rules applied

- **Deterministic.** `generate-fixtures.mjs --check` regenerates the JSON in memory and compares bytes
  (`deterministic: true`). Each fixture also carries `bodySha256`.
- **Clearly fictional.** Labels are `FIXTURE …`, `테스트 리모델링 A01`, `가상 후기 01 — … 실제 고객 후기가 아닙니다.`,
  and `테스트A` for names.
- **No source content.** Prepare check `fixtures.noSourceTextCopied` asserts that no fixture string of 6 or
  more characters (whole or per line) occurs in the accepted Phase 2 document or the Phase 1 runtime DOM.
  It passed. Scope is those two documents only; the reviewer additionally checked the SSR
  `response.html`, the Phase 2 HTML and the decoded bundles and found only the enum literal `GENERAL` (review NOTE 7). Only counts, text *lengths* and image aspect ratios came from captured structure.
- **Schema-faithful.** `validateFixturesAgainstContract` gave 216/216:
  - every required field is present with the contract type;
  - optional fields that are present have the right type;
  - **no item field the frontend does not read** (`fixture.noUnconsumedFields`);
  - no body path outside the declared envelope;
  - `totalCount` equals the item count wherever the envelope declares it.
- **Local images only.** 46 flat-colour PNG placeholders labelled `FIXTURE HERO 03 (PC)` and so on. They
  are served under `/__synthetic__/` from the local server's evidence path map, with sha256 recorded.
  Prepare asserts none of the image bytes equal any Phase 2 clone file (`images.notSourceBytes`), and no
  fixture string is a remote URL.

## Fixtures

| fixtureId | endpoint | items | response bytes | why this count |
|---|---|---|---|---|
| `fixture-main-banners-v1` | mainBanners | **9** | 2,041 | Captured unique slide count (`data-swiper-slide-index` 0..8, no loop duplicates). The code minimum for loop, autoplay and dots to act is 2; 9 keeps the dot count and loop comparable to Phase 2 |
| `fixture-portfolios-area1-v1` | portfoliosArea1 | **10** | 3,425 | Captured area-1 count = request `count=10`. More than 3 exercises prev/next at 3 per view; 4 or more gives a valid moving progress bar |
| `fixture-portfolios-area2-v1` | portfoliosArea2 | **4** | 1,390 | Captured area-2 count, and also the smallest count with a valid moving progress bar |
| `fixture-reviews-v1` | reviews | **6** | 949 | Captured count = request `count=6`. At least 4 is needed for the md progress bar; 6 gives 3 two-card slides below md |

## Field choices (all within the contract)

- **Hero:**
  - `isPcVideo:false`, `isMobileVideo:false`, so the image branch runs. No local video was synthesised,
    and the video host is unproven.
  - `type:"GENERAL"` and `linkUrl:""`, so the detail button is hidden. This matches the captured
    banners, which carry no button and empty text.
  - Slides 01–07 have empty `text`/`subText`, like the capture. Slides 08–09 carry fictional
    two-line text to exercise the text-overlay path.
  - `portfolio` and `textColor` are omitted: both are optional, and `textColor`'s real type is unproven.
- **Portfolio:** `pricePerSize` cycles 150/200/270/320. All are inside a price range and away from the
  180/250/300/350 boundaries where areas 1 and 2 differ (`<` vs `<=`). `uuid` is
  `synthetic-portfolio-a01`…; it is never navigated, because only the next-arrow was clicked.
- **Reviews:** `text` is about 55 characters, following captured card text length. `customerName` is
  `테스트A`–`테스트F`. `totalCount` is omitted, because it is never read.
- **Image sizes** follow the natural sizes of captured image files (the portfolio *container* ratio
  is 580/380 in code, sc0027 @37320, so the 580×360 image does not set card height; review NOTE 9):

  | image | size |
  |---|---|
  | hero PC | 1920×1075 |
  | hero mobile | 750×1550 |
  | portfolio thumbnails | 580×360 |

## Replay mechanism (experiment only)

`fixturesToStubs(contract, fixtures)` builds the same `{origin, pathname, query, body}` stub entries the
reviewed 3B network guard already consumes. The request matchers equal the contract's. Prepare asserts
each parent 3B.1 route is covered exactly once (`stubs.parentRouteCoveredExactlyOnce …`), and that the
parent's empty stubs are recorded unchanged in config (`emptyStubsOfParent`). This is Playwright routing
for the experiment, **not** a deploy-time architecture.
