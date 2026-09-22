# 11 — Template implications

Scope: what this evidence means for the **accepted** Recon Template platform (`docs/architecture/recon-template-platform.md`).
Nothing here changes that architecture; it maps observations onto its boundaries. None of the source data, copy, legal text,
brand assets, third-party IDs or keys is template default content (invariants 5/6).

## 1. Page-family classification (final)

| # | Family | Routes | Template status | Data shape (template-side) |
|---|---|---|---|---|
| 1 | home | `/` | core page (Step 5) | slots + `projects` queries (featured / area groups) + `reviews` (optional) + hero media (**PROVISIONAL `banners`**, architecture §Explicitly provisional) |
| 2 | project list | `/portfolio` | core view (Step 4) | `projects` collection query: paginate 30, filters over closed vocabularies (size bucket, style keywords, price bucket, optional service), sort |
| 3 | project detail | `/portfolio/[uuid]` | core view (Step 4) | one `projects` item. **One template with data-driven optional sections** (before/after, customer quote, keywords, duration). The crawler's 2 families = before-image presence |
| 4 | project gallery (small screens) | `/portfolio/[uuid]/images` | optional sub-view / lightbox | same item |
| 5 | post list | `/journal` | later page | `posts` collection: featured-latest + paged grid |
| 6 | post detail | `/journal/[uuid]` | later page | one `posts` item. **One template**; the crawler families = two body-authoring styles (native Unlayer blocks vs one pasted HTML block) |
| 7 | services overview | `/service` | later page | slots + interior-vertical `services[]` |
| 8 | FAQ | `/faq` | later page | `faqs[]` (category, q, a) + site `contact` settings |
| 9 | about | `/brand` | later page | slots + optional `stats[]`, `milestones[]`, `press[]` (all operator input) |
| 10 | locations | `/stores` | later page | `locations[]` (name, address, hours, image, group), **no map** in the source |
| 11 | legal | `/terms?termsType=` | platform/legal page | `legal[]` documents, operator input only |
| 12 | lead form | `/inquiry`, `/inquiry/complete` | **not a template page to copy**; a contact destination option | site `contactDestination` (internal form / external URL / phone / messenger) |
| 13 | sub-brand landings | `/parts`, `/arckit`, `/pb-brand` | **brand-specific, not generic** | none in v1 |
| 14 | pseudo/error | `/*/store`, `/GlobalStore`, `/404` | ignore / platform default | — |

Confirmed families that matter for the next slices: **3 core** (home, project list, project detail) plus 7 secondary page
families (post list/detail, services, FAQ, about, locations, legal).

## 2. Mapping to accepted boundaries

| Boundary / invariant | Evidence-based consequence |
|---|---|
| 2 (one codebase, many sites) | Everything site-varying observed lives in data or settings. Examples: nav labels/targets, CTA destination, social/recruit/review-form links, footer legal/company data, logo variants, location list, FAQ, legal docs. Nothing requires per-customer code |
| 3 (content = what the business IS/HAS; no placement) | The source mixes placement into records: `isListDisplay`, `isMainBannerDisplay`, `isBottomArea1/2Display`, `*DisplayOrder`, `mainBanner*` fields on portfolio; `displayOrder` on banners/reviews. They **must not** enter content. Home area groups = settings-driven collection queries. The area titles and "더 보기" links are template slots/settings |
| 4 (collections stored once, queried per view) | `projects` is used by home area 1 (10), area 2 (5) and list (659 total, 30/page). The source copies full records into every response; the template queries once |
| 5 (slots are section-level) | Hero copy, section titles, CTA labels, banner copy ("비슷한 평형대의…"), page subtitles = section slots. The desktop/mobile subtitle difference in the source becomes one slot, not two |
| 6 (no mapper layer) | Bucket labels (평형대, 평당 견적), service labels ("5년 이상 구축"), date formatting ("YYYY년 M월", "N주") = item→props shaping in component code |
| 7 (declared overrides) | Candidate declared settings: `nav.primary[]`, `nav.drawer[]`, `footer.columns[]`, `contactDestination`, `social{}`, `projectList.pageSize`, `projectList.filters{…}`, `home.areas[]{title, query, moreLink}`. Only what Slice 1 needs is declared at first |
| 8 (App Router) | Source routes map 1:1 onto App Router segments. The pseudo-routes are a source build defect (pages-dir store files); App Router does not have that trap |
| 9 (storage boundary) | All observed data is readable as JSON records. Nothing requires storage-specific behaviour |
| 10 (static per-site build) | Source list/detail are SSR + client fetch. The template pre-renders them. Filters need a static-compatible strategy (`04` §6). Journal/terms HTML bodies need build-time sanitising |
| Inv. 5 (no invented content) | Stats, milestones, press, reviews, customer quotes, FAQ, locations, legal and company registration data are all **facts** and operator input only. Source values are never defaults |
| Inv. 6 (no source dependency) | Source API hosts (`dev-api`, `apeach-api`), media hosts (`media-landing`, S3), Kakao/FB/GTM/Naver/Karrot/Channel IDs, the Typeform, greetinghr, officementary and Naver Smart Store URLs, and the client Basic credential are all excluded |
| **PROVISIONAL `banners`** | Home hero banners: 9 items, image-only at capture time (text empty; `type` only `GENERAL`; `portfolio` link unused). This supports keeping them **presentation media**, not a canonical collection |

## 3. Content-model evidence (not a canonical schema)

**`projects` (interior vertical).** Observed facts:
- `title`, `description`, `content` (plain text)
- `aptName`
- address (`roadAddress` / `displayAddress`)
- `spaceSize`, `serviceTypes[]` (`OLD`/`NEW` observed; `KITCHEN` exists only in the code enum), `styleTypes[]` (10-value vocabulary)
- `pricePerSize`, `price`
- construction dates / month, `constructionPart`, `constructionEndYear`
- thumbnails (pc/mobile)
- `imageSets[]` grouped by room name, with optional before/after pairs
- optional customer quote (`customerName`, `customerReview`)
- `storeType` (branch attribution, including retired values)

**`reviews`:** `text` + `customerName` (personal data). Home shows 6 of 8.

**`posts`:**
- Present: title, subtitle, cover images (pc/detail/mobile), rich body, and order by creation.
- Absent: excerpt, category, author, date.

**Site settings / identity:**
- logo wordmark + compact mark + footer (inverse) mark
- company name, representative, registration no., mail-order registration, address, phone, hours, email
- privacy officer (hard-coded in the source; must be a setting)
- social links, recruit URL, review-form URL, contact destination

**Vertical vocabularies (settings, not content):**
- size buckets: upper-bound keys
- price buckets
- style keywords, with a hidden flag
- service types, with two different label sets in the source
- sort options

## 4. What Slice 1 needs from this pass

The next step (`docs/status/source-preservation-v2.md` Step 3) is Slice 1: minimum platform + one small Apartmentary
section + one Template + several fictional Site Instances. For that, this pass provides:
- the verified section anatomy and data needs for any home/list/detail section (`03`–`05`)
- the header/footer/logo mechanism (`01` §4)
- the responsive bands (`09`)
- real JSON contracts (`10`)

**No finding here blocks Slice 1.** The open items in `12` are source unknowns that do not change the template shape.

Later-slice **decisions** surfaced by this pass (not evidence gaps):
- **Filters under the static per-site build** (former `12` G12, boundary 10). Filter combinations cannot all be
  pre-rendered. Options:
  - page-param routes pre-rendered, with client-side filtering over a static index
  - no filters in v1
  - decide in Step 4
- **Portfolio 1281 band** (`12` G7): whether to copy the source's mobile-chrome-up-to-1280 behaviour.
- **Posts body format** (`12` G13).
- Locations map (none in the source).

## 5. Source behaviour deliberately NOT to reproduce (recorded defects)

**SEO / links**
- 0 `<a>` links; JS-only navigation.
- `lang="kr"`; no canonical/robots; 0 `h1`–`h3`.
- Static titles for journal/terms; `<title>` = `aptName`; no meta description on detail pages.

**Routing / navigation**
- Invalid portfolio id → 307 `/`; invalid journal id → 500; pseudo-routes 500.
- `router.back()` as "목록".
- `/images` blank on desktop.

**UI / data**
- Empty 키워드 row.
- Desktop price-bucket omission; hidden keyword.
- `/service` horizontal overflow 900–1281 (confirmed on a fresh load; exact element not isolated; former `12` G14).
- API `page` echo; over-fetching full records in lists.
- Stray `">` in pasted journal HTML.

**Contact / privacy / legal**
- Inert support-email "link"; phone not `tel:`; http KakaoTalk link.
- One checkbox for both privacy and marketing consent.
- PII (name, phone, address) in the `/inquiry/complete` URL.
- Client-embedded Basic credential.
- A view-count POST on every page view (no dedupe, no bot filter observed). If a template needs view counts, that is a
  platform analytics concern, not a content write from the page.
