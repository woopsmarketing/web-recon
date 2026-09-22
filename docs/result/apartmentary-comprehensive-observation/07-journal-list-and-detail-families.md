# 07 — Journal (읽을거리) list and detail families

Evidence:
- List captures:
  - `/journal` `data/apartmentary.com/2026-09-18T08-31-15-826Z/`
  - `/journal?page=1` `…08-31-45-443Z/`
- Detail captures, desktop + mobile:
  - `bjqdfkodlo` `…08-39-23-068Z`
  - `oipdkjrdwj` `…08-40-45-092Z`
  - `ibrdwjrdqw` `…08-41-41-763Z`
  - `kqidoildbf` `…08-42-46-752Z`
  - `jqodqrfdpw`: see §4 (first attempt timed out; one retry)
- Level A: all 15 crawl-known journal URLs (`level-a/ssr-fingerprints.json` → `journal` fingerprint: html size, image count,
  Unlayer `design` content-type counts, prev/next presence)
- Code: `static-analysis/journal-and-other-pages.md` §1–§3
- Live: `interactions/interactions.json` + `interactions/interactions-followup.json` (see `09`)

No journal text, author, or customer name is reproduced here. Bodies contain customers' real names and are evidence only.

## 1. List `/journal` (Level B)

**Data (client-side, 2 GETs per load):**

| Call | Purpose |
|---|---|
| `GET /api/v1/journals/action/get-by-paging?count=1&page=0` | the **featured** (latest) post |
| `GET …/get-by-paging?count=4&exceptFirst=true&page=N` | grid page N (0-based) excluding the featured one |

- `totalCount` = 23 at capture time, so 22 grid items give 6 grid pages.
- Envelope: `{data:{cursor,totalCount,page,data:[…]},error}`.
- Items are **full journal records**, including the whole `html` + `design` body (~50 KB for 1 item). The list over-fetches heavily.

**Render (desktop 1440):**
1. Header spacer.
2. Kicker/title "SPACE BETTERS LIFE" + one sub-line.
3. **Row:** left = the featured card (aspect 630/940); right = a 2×2 grid of 4 cards (aspect 0.7875).
4. Two 55×55 round prev/next icon buttons.

There are no page numbers, no category/tag filter and no search.

**Card anatomy:**
- Image (`imageDetailPcUrl` desktop / `imageMobileUrl` mobile).
- **Title** (`title`).
- **Subtitle** (`subTitle`, in practice "<apartment name> <NN>PY").
- `description`, rendered only if set. It is **null in 15/15** records.
- Click → `router.push("/journal/<uuid>")` (not an `<a>`).

**Pagination (two different mechanisms by breakpoint, from code; live results in §5):**
- desktop (md-up): prev/next → `router.push("/journal?page=N")`. The grid is **replaced**; the URL carries `page`.
- mobile: prev/next call the fetch directly. Items are **appended** (load-more), the URL is unchanged, and pages already
  loaded are remembered.
- `?page=N` is readable on direct load (SSR 200 for 0/1/2), so desktop pages are deep-linkable. Mobile state is not.

**SEO:** static title and description. The list HTML has no `<a>`. There is a Pinterest `p:domain_verify` meta.

## 2. Detail `/journal/[uuid]` (Level B)

**Data:**
- SSR `pageProps.journal` (full record), **plus** a client `GET /api/v1/journals/{uuid}` (the body is fetched twice per view).
- A fire-and-forget `POST /api/v1/journals/action/add-view-count/{uuid}` (a side effect of every real visit; see `10` §1).
- Invalid uuid → HTTP **500**, not 404.

**Record contract (19 keys, OBSERVED; full census in `10` §3):**
- `uuid`, audit fields
- `title`, `subTitle`, `description` (null)
- `imagePcUrl`, `imageDetailPcUrl`, `imageMobileUrl`
- `html`, `design`
- `prevUuid`, `nextUuid`
- `isDisplay`, `isActive`

There is **no** category, tag, author, publish date, reading time or excerpt field. Order is inferred from creation.

**Render:**
1. A centred column (70% desktop / 100% mobile).
2. The **body HTML block**: `dangerouslySetInnerHTML` of `'<style>table p, table div, table span{font-family…;font-weight:500!important}</style>' + journal.html`.
3. A navigation row: desktop text buttons **"이전 읽을거리" · "목록" · "다음 읽을거리"**; mobile 50×50 icon buttons + 목록.

There is **no React-rendered title, date, byline, cover image or share button**. Everything visible except the nav row comes from `html`.

**Navigation semantics:**
- 목록 → `router.back()`. A direct visit therefore has no in-site back target (source defect).
- 이전/다음 → `router.push("/journal/<prevUuid|nextUuid>")` + an immediate refetch. The button is disabled when the uuid is null.
- **"이전" = newer, "다음" = older** (OBSERVED; SSR records + live clicks, §5):
  - The newest post (`ibrdwjrdqw`, created 2025-02-20) has `prevUuid:null` and `nextUuid:oipdkjrdwj` (created 2024-12-17).
  - `oipdkjrdwj`: `prevUuid:ibrdwjrdqw`, `nextUuid:jildbrjdwq`.
  - Live: from `ibrdwjrdqw`, 다음 → `oipdkjrdwj`, 이전 → back to `ibrdwjrdqw`. On mobile, the right icon button from
    `oipdkjrdwj` → `jildbrjdwq`.
  - `bjqdfkodlo` (2023-02-24) has both links (`prev ibrdwfrdqw`, `next kqidolldbf`), so it is **not** the oldest post.

**SEO:**
- `<title>` and description are **static list values** for every post.
- `og:image` = `imageMobileUrl`; `og:url` = `https://apartmentary.com/journal/<uuid>`.
- The post title is invisible to `<title>`, and the body `<h*>` structure depends on the editor output.

## 3. Detail families: body representation

The earlier crawler grouped journal URLs into 5 structural families (f5–f9), with one labelled "content-duplicate". Sampled
across those families, the **real** distinction is the **body representation inside the same page template**:

| Variant | Count (of 15 crawl-known; + 5 classified from list bodies, see below) | `design` (Unlayer JSON) | `html` | Visible effect |
|---|---|---|---|---|
| **native-blocks** | 10 (`bjqdfkodlo`, `bjqdfoodlo`, `jildbrjdwq`, `kqidoildbf`, `kqidojldbf`, `loqdpbrdij`, `loqdpirdij`, `oipdkjrdwj`, `rfpdrokdjw`, `woqdjokdjr`) | 11–31 rows. Content types: `image` 13–18, `text` 9–14, `heading` 0–2, `divider` 0–1. Column patterns `1`, `1:1`, `2:1`, `1:2`, `50` | 41–74 K chars, 13–18 `<img>` | editorial layout of image rows (single / side-by-side) and text blocks. The title appears to be baked into imagery or text blocks (no separate title element) |
| **html-block** | 5 (`ibrdwfrdqw`, `ibrdwjrdqw`, `jqodqrfdpw`, `rfpdrrkdjw`, `woqdjwkdjr`) | **1 row / 1 column / 1 `u_content_html`**: the whole post is pasted raw HTML inside a single Unlayer HTML block | 15–19 K chars, **26–41 `<img>`** | interview-style long article (Q&A with speaker labels) with an in-body title and subtitle. It shows a **stray `">` text node** right before the title (authoring defect in the pasted HTML) |

- All 15 bodies are **full XHTML documents** (`<!DOCTYPE … XHTML 1.0 Transitional>` with mso conditionals). This is Unlayer's
  email-style export, inserted inside a `<div>`.
- 0 iframes, 0 `<video>`, **0 `<a>`** in all 15 bodies.
- Prior crawler family → variant, via the sampled representatives:
  - f5 `bjqdfkodlo` = native
  - f6 `oipdkjrdwj` = native
  - f7 `ibrdwjrdqw` = html-block
  - f8 `kqidoildbf` = native
  - f9 `jqodqrfdpw` = html-block
- The crawler split *within* each variant by DOM size and image count. The families are **not** different page templates: the
  React shell is identical and only the injected `html` differs.
- **Coverage beyond the crawl:** `totalCount` is 23.
  - 5 more posts are classified from bodies already captured in list responses (no extra fetch): `jqodqkfdpw`, `oipdkbrdwj`,
    `qpfdlrbdki`, `woidibjdfj` are native; `woidiljdfj` is html-block.
  - So **20 of 23** are classified: 14 native, 6 html-block.
  - `kqidolldbf` is known only as a `nextUuid`. 2 posts were never seen.
- The "content-duplicate" label is **likely an extraction artefact** of the Unlayer XHTML markup. This is UNPROVEN and does not
  affect the template.

**Detail samples per variant captured at Level B:**
- native-blocks: `bjqdfkodlo`, `oipdkjrdwj`, `kqidoildbf`.
- html-block: `ibrdwjrdqw`. The second sample `jqodqrfdpw` is BLOCKED at Source Package level; a DOM-ready fallback is in §4.
- That gives 3 native and 1 (+1 fallback) html-block samples. Level A covers all 15 (both variants, with body statistics).

## 4. `jqodqrfdpw` capture

**Source Package capture: BLOCKED.**
- Both attempts failed with observer exit code 1: `page.goto` waited 45 s for the `load` event.
- The one-retry rule was followed. The retry was queued as a separate job at the end of the browser chain, and after it
  failed the page was recorded and the queue moved on. No cleanup was needed, because the observer exited on its own (`02` §0).
- The responsive probe on this URL also timed out on `load`.
- This is not a browser hang. The page's `load` event does not fire within 45 s.

**Fallback observation** (`interactions-followup.json`, scenarios `journal-html-block-dcl-desktop` / `-mobile`):
- Navigation waited for `domcontentloaded` + 8 s settle. First-party non-GET was aborted, so its view-count POST was blocked.

| | desktop 1440 | mobile 390 |
|---|---|---|
| document height | 9,931 px | 6,011 px |
| elements | 408 | 389 |
| `<img>` total / still incomplete after 8 s | 46 / **39** | 49 / **38** |
| horizontal overflow | none (`scrollWidth` = 1440) | none (390) |
| render (screenshot) | site header, then the html-block body: title + subtitle + Q&A text left-aligned beside an image column. Images partly painted (progressive) | same body, one column |

**Reading:**
- The page renders and is usable at DOM-ready.
- The `load` timeout is explained by the body's many large inline images still downloading. This is INFERRED from the
  39/46 incomplete images; the image host latency was not measured separately.
- This post is one of the two heaviest html-block bodies (Level A: 40 `<img>`, 17 K chars; `woqdjwkdjr` has 41 / 19 K and
  was not captured, so its `load` timing is unknown).

**Materiality: not material for any template decision.**
- The html-block variant has a full Level B capture (`ibrdwjrdqw`).
- All 15 bodies, including this one, have Level A statistics.
- The only missing artefact is this page's own Source Package (network manifest, stored bodies) and its screenshot pair.

## 5. Live interaction results

Sources:
- pass 1: `journal-list-desktop`, `journal-list-mobile`, `journal-detail-desktop`
- follow-up: `journal-list-desktop-pager`, `journal-list-mobile-loadmore`, `journal-detail-nav`, `journal-detail-mobile`

**List:**

| Action | Result |
|---|---|
| card click (desktop) | client transition to `/journal/<uuid>`: `_next/data/<buildId>/journal/<uuid>.json` + `GET /api/v1/journals/<uuid>` (+ view-count POST, aborted by the harness) |
| hover card | no DOM/text change recorded (style-only) |
| **mobile** round "next" button (55×55) ×2 | `GET …/get-by-paging?count=4&exceptFirst=true&page=1`, then `page=2`. 4 cards are **appended** each time (document height 5,041 → 7,478 → 9,916). **URL unchanged.** This confirms load-more on mobile |
| **desktop** prev/next round buttons | **NOT exercised live**. The size-matched click hit the disabled grey "prev" button at page 0 (screenshot `journal-list-desktop-pager-0-…`), so there was no URL or request change. The desktop mechanism (`router.push("/journal?page=N")`, grid replaced) rests on the code plus the direct-load captures: `/journal?page=1` requests `…&exceptFirst=true&page=1` on both viewports and renders a different grid (`02` §1) |
| response `page` field | echoes `0` for `page=1` and `page=2` (same API quirk as portfolios, `04` §4) |

**Detail:**

| Action | Result |
|---|---|
| 다음 읽을거리 (desktop, from `ibrdwjrdqw`) | → `/journal/oipdkjrdwj`: `_next/data` + `GET /api/v1/journals/oipdkjrdwj` |
| 이전 읽을거리 | → back to `/journal/ibrdwjrdqw` (same request pattern) |
| 목록 | → `/journal/oipdkjrdwj`, i.e. the **previous history entry**, not `/journal`. Live proof that 목록 = `router.back()` |
| mobile right icon button (50×50, from `oipdkjrdwj`) | → `/journal/jildbrjdwq` (= its `nextUuid`) |
| pass-1 "next-post" on `bjqdfkodlo` | **invalid step**: the text matcher hit a body paragraph containing "다음", not the nav button. It proves nothing about that post |

Every post view fetches its body twice (SSR props + client `GET`) and fires one view-count POST per real visit (aborted
here).

## 6. Implications for a future posts/articles model (evidence, not a canonical schema)

- Source posts carry **title + subtitle + cover images (pc detail / mobile) + one rich body**. There is no taxonomy, author or date.
- The body is **editor output HTML**, in two authoring styles. Neither the Unlayer `design` JSON nor the XHTML email wrapper is
  a sensible storage format for a template content model. A future `posts` model needs a rich-text body (sanitised HTML or
  portable blocks) and **explicit** title, subtitle, cover, published date and optional excerpt. The source lacks the last
  two, so they are operator input or optional.
- Import feasibility (INFERRED): native-blocks bodies map to image/text/heading/divider blocks with 1–2 column rows, so they
  are convertible. html-block bodies are arbitrary pasted HTML and need sanitising and HTML-to-rich-text conversion. Either way
  this is **content migration**, not template structure.
- Required template view behaviour:
  - list = featured + paged grid, with order by date (the source orders by creation)
  - detail = body + prev/next by order + back-to-list with a real link (not `history.back`)
  - per-post `<title>`, description and OG
