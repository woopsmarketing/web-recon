# 13 — Apartmentary First Template (Part Q · 아파트멘터리 첫 템플릿 매핑)

This is a conceptual mapping. Nothing is built.

- Only evidenced pages and features are used.
- Source values (copy, names, numbers, media, contact and legal data) are **never** template defaults,
  shipped synthetic fixtures or customer content (`03` ownership, `04` gates). Only field **names** are
  taken from the evidence.
- The single exception is the **private reference fixture** for fidelity gate 1 (`04`). It is gitignored,
  marked `origin: "reference-fixture"`, never packaged and never placed under a customer site.

## Evidence levels

| Level | Meaning | Apartmentary coverage |
|---|---|---|
| **L1** | Byte-exact Source Package (desktop 1440×900, mobile 390×844) + Faithful Clone + static data contract + runtime replay experiments | `/` only |
| **L2** | Structural observation: DOM, layout probes (probe widths 390–1920; mobile 390–914), screenshots | 8 pages: `/`, `/faq`, `/service`, `/portfolio?page=0`, 4 × `/portfolio/{slug}` (2 per structural family) |
| **L3** | Crawl-verified only: Firecrawl discovery + Playwright verification (HTTP 200, text/html, title) + structure-fingerprint families | 56 URLs in 16 families, including all L1/L2 pages |
| **L4** | Hints only: SSR labels without hrefs, JSON string values, generated service-client names | Drawer and footer labels, `bannerData.url`, 12 service clients |

Two facts bound every claim below:

1. **Link topology is unobserved.** The rendered DOM has zero `<a href>`. Navigation happens through
   `router.push` / `window.open` in click handlers.
2. **Data shapes come from code, not live data.** The four visible data sections on `/` render from
   client-side API calls whose response bodies were never captured (capture policy). Field shapes were
   recovered from bundle code.

## Evidence index (resolves the `A8 §n` citations in `03`–`07`)

| Topic | Repository evidence |
|---|---|
| Canonical capture (L1) | `data/apartmentary.com/2026-09-15T11-38-46-603Z/viewports/{desktop,mobile}/source-package/`; `docs/result/source-preservation-phase1/04-apartmentary-capture.md` §1 |
| Re-capture used by clone and analysis | `data/apartmentary.com/2026-09-16T05-27-10-722Z/` |
| Faithful Clone | `data/apartmentary.com/preservation-clones/2026-09-16T06-42-28-282Z/`; `docs/result/source-preservation-phase2/07-human-review-guide.md` |
| Data contract: field shapes, carousel config, empty behavior | `docs/result/source-preservation-phase3c/01-data-contract.md` (+ `data-contract.json`) |
| Runtime facts: 0 hrefs, AOS, `useMediaQuery`, third parties | `docs/result/source-preservation-phase3a/03-feature-mapping.md`, `04-source-bound-and-api.md` |
| Service clients, request evidence | `docs/result/source-preservation-phase3d-api-policy/02-apartmentary-request-evidence.md` |
| Structural observation (L2) | `data/apartmentary.com/site-observations/2026-09-15T05-10-38-532Z/site-observation.json` (scope input: `tmp/apartmentary-scope/`, 34 URLs) |
| Crawl verification (L3) | `data/apartmentary.com/2026-09-14T04-00-37-018Z/{discovery,verification,verified-urls,page-families}.json` |
| Homepage regions, layout modes | `docs/result/responsive-architecture-audit/05-seven-region-provenance.md`; `docs/result/apartmentary-layout-modes-2026-09-14.md` §3, §6 |
| Breakpoints | `docs/result/responsive-architecture-audit/04-apartmentary-source-inventory.md` §3, §6 |
| Intro video | `docs/result/source-preservation-intro-media-forensic/00-summary.md` |
| Price buckets, portfolio filters | Source Package `scripts/sc0024.e6a0597718ac.js` exports `filterPrices`, `filterSpaceSizes`, `filterStyleTypes`, `filterServices`, `portfolioFilterServices`; `scripts/sc0027.dba4c3c5f366.js` looks buckets up with `<` in carousel 1 and `<=` in carousel 2; caption behavior in `docs/result/source-preservation-phase3c/01-data-contract.md:47` |

`A8 §n` section map (the study's Apartmentary evidence note is not kept in the repository; each section
points at repository evidence instead):

| Citation | Topic | Repository evidence |
|---|---|---|
| A8 §1 | Routes, structural families, observed pages, detail titles, query-string URLs | Crawl verification and site-observation rows above |
| A8 §2 | Homepage structure, carousel headings, navigation by click handlers, 0 `<a href>` | Canonical `document/response.html`; `source-preservation-phase3a/03-feature-mapping.md` |
| A8 §3.1 | `mainBanners` fields | `source-preservation-phase3c/01-data-contract.md` |
| A8 §3.2 | Portfolio fields, `isBottomArea1/2Display`, `pricePerSize`, buckets | `source-preservation-phase3c/01-data-contract.md`; price-bucket row above |
| A8 §3.3 | Review fields | `source-preservation-phase3c/01-data-contract.md` |
| A8 §3.4 | `footerData` keys | Canonical `document/response.html` (`pageProps.footerData`) |
| A8 §4 | Service clients, e.g. `journal` wired but not called on `/` | `source-preservation-phase3a/04-source-bound-and-api.md`; `source-preservation-phase3d-api-policy/02-apartmentary-request-evidence.md` |

The main agent re-checked the load-bearing facts directly in the canonical `document/response.html` and the
run files:

- `lang="kr"`, 0 `<a href`
- `pageProps` = `bannerData` / `popupData` / `footerData`; band and popup display flags `false`
- drawer and footer labels present
- 56 verified URLs, all HTTP 200, in 16 families
- the 8 observed pages
- data contract `count=10` / `count=6` / autoplay 5000 / "`[]` hides the hero" / "reviews return null when empty"

---

```
Template ID      = interior-01
                   Working name. Neutral. Never the source brand.
Vertical         = interior
                   Residential apartment remodeling; portfolio-led, consultation-driven.
Template version = templates/interior-01/v1/
                   manifest 1.0.0-draft.N while status "draft"
                   → 1.0.0 + status "available" when the 04 gates pass
                   templateRef "interior-01@1"
Provenance       = internal provenance.json beside the manifest; never imported, bundled or rendered (04):
                   sourceHost apartmentary.com
                   capture 2026-09-15T11-38-46-603Z · re-capture 2026-09-16T05-27-10-722Z
                   clone 2026-09-16T06-42-28-282Z · observation 2026-09-15T05-10-38-532Z
                   crawl 2026-09-14T04-00-37-018Z
```

## Currently evidenced routes/pages =

| Source route | Level | Route key (`05`) | In `interior-01` |
|---|---|---|---|
| `/` | L1 | `home` | **v1** |
| `/portfolio?page=0` · `?page=1` | L2 · L3 | `projects.index` → `/portfolio`, `/portfolio/page/[n]` | **v1**, after L1 capture. Page size, paging UI and list layout are unknown |
| `/portfolio/{slug}`: family of 20, family of 9 | L2 (2 per family), L3 (29 total) | `projects.detail` → `/portfolio/[slug]` | **v1**, after L1 capture of both families |
| `/faq` | L2 | `faq` | NEXT (minor release, optional route) |
| `/service` | L2 | `services` | NEXT (minor release, optional route) |
| `/journal`, `/journal?page=1`, 15 × `/journal/{slug}` (5 families; one is 4 URLs with an identical content fingerprint) | L3 | `posts.index`, `posts.detail` | Not in v1. Observe first |
| `/brand` | L3 | `about` | Not in v1. Observe first |
| `/stores` | L3 | `locations` | Not in v1. Observe first |
| `/terms`, `/terms?termsType=PERSONAL_INFO` | L3 | `legal.terms`, `legal.privacy` | Not in v1. Observe first (see `15` open questions on customer legal pages) |
| `/parts` | L3 | — | No. Product-line page; meaning unknown |
| Labels 회사 소개 · 아킷 ARCKIT · 오피스멘터리 · 채용 정보 · 서비스 후기 작성 | L4 | — | No. Destinations unobserved; some are probably external |

## Homepage sections =

Source order (L1) and template mapping:

| # | Source section (L1 evidence) | Template key · kind (`07`) | v1 |
|---|---|---|---|
| — | **Band banner**: SSR `bannerData {text, url, isDisplay}`; hidden at capture | — | No. Visible behavior never observed |
| — | **Promo popup**: SSR `popupData` (PC/mobile image, width, aspect ratio, display flags); hidden at capture | — | No. Same reason |
| 1 | **Header**: logo + nav row; hidden drawer with menu labels; nav by click handlers | `site.header` · `header` | Yes |
| 2 | **Hero carousel**: client API `mainBanners`; image or video per slide; headline/subheadline; CTA. Loop, autoplay 5 s, arrows/keyboard ≥ 900 px. `[]` hides the hero | `home.hero` · `hero-carousel` | Yes |
| 3 | **Experience intro**: static heading + body + CTA; autoplay muted looping video (left column ≥ 900 px) | `home.intro` · `intro` | Yes |
| 4 | **Projects carousel #1**: client API portfolios `count=10`, `isBottomArea1Display`; static heading + "… 더 보기" CTA; 3 per view ≥ 900 px, 1 below | `home.projects-a` · `projects-showcase` | Yes |
| 5 | **Projects carousel #2**: same API with `isBottomArea2Display`; its own heading and CTA | `home.projects-b` · `projects-showcase` | Yes |
| 6 | **Reviews**: static image + client API reviews `count=6`; 1 per slide ≥ 900 px, 2 stacked below; the section returns null when empty | `home.reviews` · `reviews` | Yes |
| 7 | **Bottom full-bleed image**: static; source host unidentified | `home.image-band` · `image-band` | Yes |
| 8 | **Footer**: SSR `footerData` + static labels (customer center, phone, hours, email, write-a-review, terms, privacy, copyright, legal block) | `site.footer` · `footer` | Yes |
| fixed | **Floating "상담 신청" button**, viewport-fixed | `site.floating-cta` · `contact-cta` | Yes |
| site-wide | AOS scroll reveals; MUI `useMediaQuery(min-width: 900px)` DOM switch; Channel Talk bubble; Kakao SDK | Code: CSS reveal honoring `prefers-reduced-motion`, CSS media queries. Third-party widgets are not part of the template | Partly |

## Dynamic/data-driven sections =

| Section | Source mechanism | Template mechanism |
|---|---|---|
| Hero | Client `GET /api/v1/main-banners/action/get-displays`; no SSR fallback | Build-time `reader.list({type: "banners"})` |
| Projects A / B | Client `GET /api/v1/portfolios/action/get-by-paging?count=10&isBottomArea{1,2}Display=true&page=0`; the envelope carries `totalCount`, unused on `/` | `selectionToQuery(settings)` → `reader.list({type: "projects", …})` |
| Reviews | Client `GET /api/v1/reviews/action/get-by-paging?count=6` | `reader.list({type: "reviews", limit})` |
| Footer | SSR `footerData` from `_app` | `reader.getSingleton("business")` + Site Instance `identity` (brand and legal name) |
| Band, popup | SSR, hidden at capture | Not modeled (DEFERRED) |

- No template section calls an API at runtime. Data is read at build time through the reader (`09`, `10`).
- Templates and builds never contact the source API host.

## Potential customer content =

| Content | Model field ← source field |
|---|---|
| Site Instance `identity` (`08`) | `legalName` ← companyName · `brandName`: no `footerData` field (its keys, checked in the canonical `response.html`: companyName, representativeName, businessNumber, teleSalesNumber, address, phone, recruitText, recruitUrl, businessTime, email, inquiryUrl, instagramUrl, naverBlogUrl + record metadata) |
| `business` | `registration.representative` ← representativeName · `registration.businessRegistrationNumber` ← businessNumber · `registration.mailOrderSalesNumber` ← teleSalesNumber · `address` ← address · `contact.phone` ← phone · `hours` ← businessTime · `contact.email` ← email · `contact.inquiryUrl` ← inquiryUrl · `social[]` ← instagramUrl, naverBlogUrl · `careersUrl` ← recruitUrl · `logo` (source mechanism unknown) |
| `banners` (interior vertical type, `03`) | `media.default` / `media.mobile` ← pcUrl / mobileUrl, `kind` ← isPcVideo / isMobileVideo · `headline` ← text · `subheadline` ← subText · `mediaTone` ← textColor (truthiness only; real type unproven) · `link` ← `type "GENERAL"` + linkUrl → external, otherwise an item link to a project |
| `projects` | `title` ← title · `summary` ← description · `cover` ← pc/mobileThumbnailImageUrl · `heroMedia` ← pc/mobileMainBannerImageUrl · `pricePerPyeong` ← pricePerSize · `categories` (replaces `isBottomArea1/2Display`) · `featured` · detail fields **UNKNOWN** |
| `reviews` | `body` ← text · `authorName` ← customerName · `source` (provenance; required by the model, absent in the source) |
| `taxonomy` singleton, `projects` terms | Customer-defined terms. The two source carousels suggest area-size and building-age classes |

## Potential collections =

| When | Collections |
|---|---|
| v1 | `banners` (interior vertical), `projects`, `reviews`; project categories in the `taxonomy` singleton |
| NEXT (L2 evidence) | `faqs` (`/faq`), `services` (`/service`). Shapes unknown |
| Observe first (L3) | `posts` (`/journal`), store locations (`/stores`), legal documents (`/terms`), about content (`/brand`, probably a singleton) |
| Not modeled | Announcement bar / popup (hidden at capture), `/parts` product line, review submission |

## Potential Slots =

| Section | Slots (type, `07`) | Fallback |
|---|---|---|
| `site.header` | — | Logo ← `business.logo` → generated wordmark from `identity.brandName` (reused) |
| `site.floating-cta` | `cta` (link) | Label: neutral UI default "상담 신청". Target: `business.contact.inquiryUrl` → `tel:` from `contact.phone` → hide |
| `home.hero` | — | Slide text is `banners` content (`07`) |
| `home.intro` | `title` (text), `body` (richText), `cta` (link), `media` (ResponsiveMedia, video or image) | `title` and `body` are required while the section is enabled: needs-input, never source copy. `cta` hidden without a valid target. `media` optional |
| `home.projects-a`, `home.projects-b` | `title` (text), `moreLabel` (text) | `title` → label of the single selected category → neutral "시공 사례". `moreLabel` → "더 보기". The more-link goes to `projects.index` |
| `home.reviews` | `title` (text), `media` (ResponsiveMedia) | Both optional; hidden when absent |
| `home.image-band` | `media` (ResponsiveMedia) | Section hidden without media |
| `site.footer` | — | Values from `business` and `identity` (brand name, legal name). Labels are template UI text |

## Template structure =

```
templates/interior-01/v1/
├── template.ts                        id · version · vertical "interior" · status
│                                      routes: home, projects.index {pageSize}, projects.detail
│                                      sections: site.header, site.floating-cta, site.footer,
│                                                home.hero, home.intro, home.projects-a, home.projects-b,
│                                                home.reviews, home.image-band
│                                      requirements · theme.consumes · navigation
├── provenance.json                    internal source record (never imported; excluded from release
│                                      snapshots and build workspaces)
├── app/
│   ├── layout.tsx                     <html lang> from identity.locale · theme variables · header, footer, floating CTA
│   ├── page.tsx                       home sections in fixed order
│   ├── portfolio/page.tsx             list, page 1
│   ├── portfolio/page/[n]/page.tsx    list, pages 2..n
│   ├── portfolio/[slug]/page.tsx      detail (layout rule decided after capture, 06)
│   └── sitemap.ts · robots.ts · not-found.tsx
├── sections/                          one directory per section: component + settings/slot schema + defaults
├── components/                        Carousel (shared by hero, projects, reviews) · ProjectCard · PriceCaption
│                                      · Pagination · MobileNav
├── styles/                            var(--…) for theme tokens; media queries at source-authored 600/900/1200/1536
├── theme.default.json                 theme-contract-v1
└── fixtures/                          fictional sites for regression (never source content)
```

## Theme-controlled values =

- **Color tokens** (real theme-contract-v1 ids):
  - `color.canvas`, `color.surface.*`
  - `color.text.primary|secondary|muted|inverse`. Hero text over media uses `inverse` when a banner's
    `mediaTone` is dark.
  - `color.action.primary|primaryText` (floating CTA, buttons), `color.link`, `color.border.*`,
    `color.accent.*`
- **Decoration:** `decoration.radius.*` (cards, buttons, pill CTA), `decoration.shadow.*`.
- **Typography:** `typography.body`, `typography.heading`.
  - These are contract-only today. Applying them needs license-verified, self-hosted fonts (PRODUCT_VISION
    §12).
  - Source fonts SpoqaHanSans, Roboto, Decimal/DecimalInline and Material Icons are
    `license-needs-review`. None ships until cleared.
- **Default theme values — thin evidence.** Only the meta values `theme-color #ffffff` and
  `msapplication-TileColor #da532c` exist, and no palette was extracted for Apartmentary. Authoring step:
  extract the palette from the clone's CSS with the existing extractor and promote it manually (`02` C,
  EXTEND).
- **Not theme (code):** breakpoints, container widths, slides per view, video/image column layout, section
  order.

## SEO-controlled values =

| Level | Values | Rule |
|---|---|---|
| Site Instance | `titleTemplate`, default description, default OG image (customer asset), verification codes, `identity.locale` → `<html lang="ko">` | The source's invalid `lang="kr"` is fixed, not copied |
| Home | Brand + tagline title rule; description ← site default → `business.description` | needs-input if both are absent |
| `projects.index` | Site title/description override; page *n* adds a suffix | `05` |
| Project detail | `seo.title` → `"{title} \| {brandName}"`; description ← `seo.description` → `summary`; image ← `seo.image` → `cover` | `05` |
| Structured data | Organization/LocalBusiness from the fields that exist: name ← `identity.brandName`, legal name ← `identity.legalName`, address, phone, hours, social `sameAs` | Never ratings or aggregates |
| Canonical, sitemap, robots | Absolute URLs only with a production domain; preview `Disallow: /` | Reused rules |
| Source snapshot of `/` | Title, description, OG values | Forbidden-term source for brand-isolation QA **only** |

The source `/` has no canonical, `og:url`, robots meta or twitter tags. Adding them is an intended
production improvement (PRODUCT_VISION §9).

## Default settings =

| Key | Default | Basis |
|---|---|---|
| `home.hero` | `enabled: true`, `variant: "autoplay"` (5000 ms and loop are code constants) | L1 Swiper config |
| `home.intro` | `enabled: true` | L1 static section |
| `home.projects-a` | `{enabled: true, limit: 10, selection: {mode: "latest"}}` | `count=10` (L1). `latest` because a new site has no categories yet. The source curates with per-item flags, which are not reproduced |
| `home.projects-b` | `{enabled: true, limit: 10, selection: {mode: "featured"}}` | A second curated set with a different selection rule from A. It does **not** prevent overlap: a featured project among the latest 10 appears in both. It hides when nothing is featured. A site that wants disjoint carousels uses two categories |
| `home.reviews` | `{enabled: true, limit: 6}` | `count=6` (L1) |
| `home.image-band` | `enabled: true` (hidden without media) | L1 |
| `site.floating-cta` | `enabled: true` | L1 |
| `projects.index.pageSize` | **UNKNOWN** until `/portfolio?page=0` and `?page=1` are captured | Unverified inference: 29 detail URLs across 2 list pages would mean 15–28 per page, if the list covers every project |
| Empty behavior | `hide` for hero, projects and reviews | L1 data contract: `[]` hides the hero; reviews return null when empty |
| Carousel layout | 3 per view ≥ 900 px, 1 below. Reviews: 1 per slide ≥ 900 px, 2 stacked below | Code, not settings |

## Allowed site overrides =

| Target | Overrides |
|---|---|
| `home.hero` | `enabled`; `variant` autoplay / manual |
| `home.intro` | `enabled`; copy `title`, `body`, `cta`, `media` |
| `home.projects-a`, `home.projects-b` | `enabled`; `limit` 3–12; `selection` latest / featured / category / manual; copy `title`, `moreLabel` |
| `home.reviews` | `enabled`; `limit` 2–12; copy `title`, `media` |
| `home.image-band` | `enabled`; `media` |
| `site.floating-cta` | `enabled`; `cta` |
| `projects.index` | `pageSize` (allowed values fixed after capture); SEO title/description |
| Navigation | Labels; `extraLinks` ≤ 3 (e.g. the customer's blog or Instagram) |

**Not overridable:**

- section order
- a third projects carousel
- card anatomy, breakpoints, carousel mechanics
- price-bucket boundaries and labels
- disabling `projects.index` or `projects.detail`: home links depend on them, and v1 has no no-link card
  variant

## Preservation/reference-only elements =

None of these may appear in template code, template defaults, shipped fixtures or any customer build.

| Class | Elements |
|---|---|
| Runtime and code | Next.js 12.3.4 / React 17 bundles, MUI, AOS, Swiper chunks; `__NEXT_DATA__`; `getServerSideProps`/`_app` data flow; the 12 generated service clients |
| Backend | `dev-api.apartmentary.com` and its endpoints; SSR band/popup/footer payloads |
| Media and assets | `media-landing.apartmentary.com` images; S3 `apartmentary-static` intro video (~98 MB) and OG image; bundled `/_next/static/media` images such as the review banner; favicons |
| Copy and facts | All headings and body copy, project titles, review texts, company/legal/contact values, SEO title/description |
| Fonts | SpoqaHanSans, Decimal, DecimalInline, Roboto and Material Icons files as served — license review before any reuse |
| Third parties | Karrot pixel, Facebook Pixel, Naver, GA/GTM/Optimize/DoubleClick, Daum/Kakao ad pixel; Channel Talk and Kakao SDK with source IDs |
| Source defects (not reproduced) | `lang="kr"`; query-string URLs (`?page=0`, `?TOGGLED_UUIDS=%5B%5D`, `?termsType=`); 0-href navigation; per-item `isBottomArea1/2Display`; `<` vs `<=` price-bucket boundary mismatch between the two carousels; `"평당 undefined"` caption for missing prices; crash on a null banner item |
| Pipeline artifacts | 801 px served breakpoint (pipeline policy, not a source fact); `reconstructions/` runs; Slot V2 and slotized outputs |
| Reference fixture | Source-like content for fidelity gate 1 only. Built by the private reference fixture builder (`14` Slice 5) from the Source Package's static copy and the Faithful Clone's Phase 3C synthetic items, so clone and template render the same inputs. Gitignored, regenerated on demand, never packaged (`04`) |

## Additional source observation required before a "complete multi-page template" claim

| # | Observation | Unblocks | Needed for |
|---|---|---|---|
| 1 | L1 Source Package capture (desktop + mobile) of `/portfolio?page=0` and `?page=1` | List layout, page size, paging UI, any filter UI, list card anatomy. Bundle hint (L4): filter exports for price, space size, style type and services exist (evidence index) | v1 (blocker) |
| 2 | L1 capture of ≥ 2 detail pages per structural family (20 and 9) | Detail anatomy; what separates the two families (content shape or editorial layout); detail fields | v1 (blocker) |
| 3 | Faithful Clone + clone QA for items 1–2 | Fidelity gate reference beyond `/` | v1 (blocker) |
| 4 | Response bodies of the homepage and list/detail/paging endpoints. Depends on the **separate** JSON default-ON capture task. Used for field shapes, and optionally as private reference-fixture input for gate 1 (`04`); never as template defaults or customer content | `pricePerSize` unit, `mainBanners.type` values, `textColor` type, `totalCount`, detail fields | v1 (schema confidence) |
| 5 | Navigation map: where each click handler goes (bundle analysis or sandboxed click execution) | Nav, drawer and footer targets; first-party vs external (ARCKIT, 오피스멘터리) | v1 (navigation) |
| 6 | Logo rendering mechanism (header wordmark and footer logo were missing in the clone work) | Logo slot and asset expectations | v1 (header) |
| 7 | Source of the bottom full-bleed image | Decorative media slot vs content | v1 (minor) |
| 8 | Behavior at intermediate widths, including the unauthored ~930–940 px discontinuity, on list and detail pages too | Responsive authoring reference | v1 (fidelity) |
| 9 | Remaining price-bucket names (only the first is evidenced) | Caption labels, or authored neutral labels | v1 (minor) |
| 10 | L1/L2 of `/faq` and `/service` | `faqs` and `services` shapes | NEXT |
| 11 | L2 then L1 of `/journal`, `/journal?page=1` and one detail per journal family; explain the 4-URL content-identical family | `posts` shape and pagination | Before any journal work |
| 12 | L2 of `/brand`, `/stores`, `/terms` (+ `termsType`) | About, locations and legal models | Before those routes |
| 13 | Visible band banner / popup behavior | An announcement content model | DEFERRED (only if the source enables them during a capture) |

**Claim policy.**

- `interior-01@1` may be called a **multi-page template (home + portfolio list + detail)** only after items
  1–6.
- It is **not** a complete reproduction of the Apartmentary site:
  - 48 of the 56 verified URLs have never been observed beyond crawl level.
  - `/journal`, `/brand`, `/stores`, `/terms` and `/parts` are outside v1 by design.
