# 03 — Standard Customer Content Model (Part C · 표준 고객 콘텐츠 모델)

## Decision

- Use a **small core model plus vertical extension modules**, written as TypeScript + zod schemas in code.
- Content describes **what the business is and has**, never how a template shows it.
- There are two shapes:
  - **singletons**: one per site (`business`, `taxonomy`)
  - **collections**: many items per site (`projects`, `reviews`, …)
- Templates decide presentation, selection and empty behavior (`04`, `06`, `07`).
- One giant universal schema is rejected. So are template-specific fields.
- **Identity is not duplicated in content.** Brand name, legal name, public origin and locale live only in
  the Site Instance's `identity` (reused SiteIdentity, `08`). Content and templates read them from there.

## Why a new model is needed (evidence)

- There is no structured customer content today.
  - `ContentBrief` is free text.
  - `ProvidedFact` is `{kind: string, value: string}`.
  - No schema has phone, address or hours fields (`01` §5.1).
  - Persisted content is keyed by template DOM paths (`01` §5.2).
- Apartmentary shows the fields a real small-business site carries. Its CMS also shows the
  anti-pattern to avoid.
  - Portfolio items carry the flags `isBottomArea1Display` / `isBottomArea2Display`, one per homepage
    carousel (A8 §3.2, `portfoliosArea1/2`).
  - These are template placement facts stored on content items. This is exactly the
    `apartmentaryPortfolioSection1` failure mode.

Apartmentary values below are used **only to name fields**. None of them is content for any customer.

## Structure

```
platform content model (code)
├── primitives        AssetRef · MediaRef · ResponsiveMedia · RichText · Link · ItemBase · Origin
├── core
│   ├── singletons    business · taxonomy · legal*
│   └── collections   projects(base) · reviews · faqs* · services* · posts*
└── verticals
    ├── interior      extends projects (pyeong, price/pyeong, location…) ; vertical-only: banners
    └── clinic        (illustration only, not to build) team+doctor fields, services+treatment fields,
                      beforeAfter (vertical-only), equipment (vertical-only)
* = defined when the first template that renders it is built (see MVP column)
```

**Placement rule.** A type is **core** when its base meaning is vertical-independent. That is shown
either by use in ≥ 2 verticals, or by the product's standard content list: business info, services,
projects/portfolio, blog posts, reviews, FAQ (prompt §8, §12).

- Everything else starts in the vertical module. `banners` is evidenced by one vertical only, so it lives
  in `interior`.
- A type is promoted to core by **moving** it, never by renaming fields.
- A vertical module may **add optional fields** to a core type. It may never rename, remove or retype a
  core field.
- A vertical module may define **vertical-only types** when the meaning or constraints are
  domain-specific. Example: clinic before/after cases need consent and medical-ad constraints.

A **vertical** is simply the named bundle of types a template may consume:
`interior = core + interior extensions`. Templates declare one vertical (`04`).

## Primitives (illustrative shapes, not an implementation)

```ts
type AssetRef        = { asset: string /* content-addressed id, see 09 */; alt?: string };
type MediaRef        = AssetRef & { kind: "image" | "video"; poster?: AssetRef };
type ResponsiveMedia = { default: MediaRef; mobile?: MediaRef };      // evidence: pc*/mobile* pairs
type RichText        = { format: "markdown"; value: string };          // no raw HTML (extracted validator)
type Link =
  | { kind: "external"; href: string }                                 // http(s)/tel/mailto allowlist
  | { kind: "item"; type: CollectionType; id: string }                 // template resolves URL
  | { kind: "page"; key: StandardRouteKey };                           // vertical route key, not a path
type Origin =
  | "customer" | "operator" | "imported-with-consent"                  // who asserts the item is real
  | "reference-fixture";                                               // private fidelity fixture ONLY (04)

type ItemBase = {
  id: string;                 // stable, generated; never reused
  slug?: string;              // unique per (site, type); REQUIRED at publish for types with detail pages
                              // (projects, posts, services); reserved words refused (05)
  status: "draft" | "published" | "archived";
  publishedAt: string | null; // visibility = published && publishedAt <= T (06)
  updatedAt: string;
  featured?: boolean;
  order?: number;             // manual ordering where a template offers it
  categories?: string[];      // taxonomy slugs for this collection
  seo?: { title?: string; description?: string; image?: AssetRef };
  origin: Origin;             // never "generated"; an item's existence is always asserted by a person
  generatedFields?: string[]; // descriptive text fields drafted by a generator, pending approval (rules below)
};
```

## Core singletons

| Type | Fields (all optional unless the publish schema says otherwise) | Evidence that named them | MVP |
|---|---|---|---|
| `business` | `tagline?`, `description?`, `story?: RichText`, `logo?`, `logoOnDark?`, `contact{phone?, email?, inquiryUrl?}`, `address?`, `hours?` (text first; structured later), `social[]{kind, url}`, `registration{representative?, businessRegistrationNumber?, mailOrderSalesNumber?}`, `careersUrl?`, `facts[]{label, value, basis:"customer-provided"}` | Apartmentary `footerData`: representativeName, businessNumber, teleSalesNumber, address, phone, businessTime, email, inquiryUrl (Kakao), instagramUrl, naverBlogUrl, recruitUrl (A8 §3.4). Its `companyName` maps to `identity.legalName` (`08`) | yes |
| `taxonomy` | `{[collection]: [{slug, label, order}]}` | Homepage carousels titled "30평대 아파트" / "구축 아파트" (A8 §2) | yes (projects) |
| `legal` | `privacyPolicy?: RichText`, `terms?: RichText` | Footer labels 이용약관 / 개인정보처리방침; `/terms` and `/terms?termsType=PERSONAL_INFO` are crawl-verified only (L3, `13`), content never examined | NEXT |

- `business.facts[]` replaces free-form `ProvidedFact` for claims such as "누적 시공 N건". The extracted
  truth-mode rules (`02`) apply, and a fact without customer basis is never rendered.
- `taxonomy` is a singleton, so a label rename is one singleton change with one cache tag (`10`).

## Core collections

| Type | Base fields (beyond `ItemBase`) | Evidence | MVP |
|---|---|---|---|
| `projects` (portfolio / cases) | `title`\*, `summary?`, `cover: ResponsiveMedia`\*, `heroMedia?: ResponsiveMedia`, `gallery?: MediaRef[]`, `body?: RichText`, `completedAt?` | portfolio item: title, description, pc/mobile thumbnail, main-banner images (A8 §3.1–3.2) | yes |
| `reviews` | `authorName`\*, `body`\*, `rating?: 1..5`, `date?`, `source: "customer-provided"\|"imported-with-consent"`\*, `sourceUrl?`, `relatedItem?: {type, id}` | review item: text, customerName (A8 §3.3) | yes |
| `faqs` | `question`\*, `answer: RichText`\*, `category?` | `/faq` observed structurally; shape unknown (A8 §1) | NEXT |
| `services` | `name`\*, `summary?`, `body?`, `media?` | `/service` observed structurally; shape unknown (A8 §1) | NEXT |
| `posts` | `title`\*, `excerpt?`, `body: RichText`\*, `cover?`, `tags?` | Apartmentary `/journal` (paged list) + 15 `/journal/{slug}` pages titled "읽을거리", crawl-verified only (L3, `13`); the `journal` service client is wired but not called on `/` (A8 §4). Field shape unknown | when a template renders it |

`*` = required by the **published** schema (see below).

## Interior vertical (`interior`)

Extends `projects` with optional, evidence-backed fields only:

| Field | Evidence | Note |
|---|---|---|
| `pricePerPyeong?: number` (만원/평) | `pricePerSize` + bucket literals 0–180–250–300–350–400+ (A8 §3.2) | Bucket **ranges and labels** are template/vertical display logic, not content. The source's inclusive/exclusive inconsistency between areas is a defect not to copy |
| `location?: { region?: string; complexName?: string }` | Detail titles such as "서초 반포리체 아파트", "마포 성산시영아파트" (A8 §1) | Hypothesis; confirm on detail capture |
| `areaPyeong?: number` | Only indirect (a "30평대" heading) | Hypothesis; categories cover MVP |
| detail-page fields (spaces, before/after, materials, duration…) | **UNKNOWN** — two detail structural families (20 and 9) never captured as source packages | Add only after capture (`13`) |

Vertical-only type:

| Type | Fields (beyond `ItemBase`) | Evidence | MVP |
|---|---|---|---|
| `banners` (home hero slides) | `media: ResponsiveMedia`\*, `headline?`, `subheadline?`, `mediaTone?: "light"\|"dark"`, `link?: Link` | `mainBanners`: pcUrl/mobileUrl, isPcVideo/isMobileVideo, text/subText, textColor, type GENERAL→linkUrl else→portfolio (A8 §3.1). Band/popup placements exist but were hidden at capture → not modeled | yes |

`mediaTone` describes the **media** (predominantly light or dark imagery). The template chooses the text
color from it. It is not a stored text color.

## Required / optional / recommended — three levels, three owners

| Level | Owner | Question it answers | Mechanism |
|---|---|---|---|
| 1. Field validity | Content model | "Is this item/singleton well-formed?" | **Published** schema (strict `*` fields) in MVP. A lenient **draft** schema is added with the first editor, so CMS saves never fail on incompleteness (`14`). Unknown keys are stripped on read, never an error, so an older release snapshot can read data written with a newer, additive model — unless the data's `minReaderVersion` is newer than that reader, which then refuses (`11`) |
| 2. Template requirement | Template manifest (`04`) | "Does this template have what it needs?" | Per route/section: `REQUIRED` / `RECOMMENDED` / `OPTIONAL` with an explicit empty behavior |
| 3. Site readiness | Build gate (EXTEND existing release gate, `01` §4.1) | "May this site go indexable?" | Any unmet `REQUIRED` → `INPUTS_REQUIRED`: preview allowed with honest needs-input markers, indexable production refused. `RECOMMENDED` → warning only |

Example (interior template):

- `identity.brandName` and one contact channel are `REQUIRED`.
- `business.logo` is `RECOMMENDED`. Preview uses the reused generated wordmark from the customer's own
  brand name.
- `projects ≥ 1` is `REQUIRED` for the portfolio route to exist. `projects ≥ 10` is `RECOMMENDED` (the
  carousel looks sparse below that).
- `reviews` is `OPTIONAL`.

## Empty collections

- `[]` is valid content. The content model never pads, invents or fills.
- The template declares what happens (`06` § empty behavior):
  - `hide` (default): the section is not rendered. A route that depends on it is pruned from the build and
    removed from navigation and the sitemap (`05`).
  - `fallback: <Component>`: a template-authored, reviewed alternative, e.g. a consultation CTA in place
    of reviews. It contains no fabricated testimonials, ratings or numbers (PRODUCT_VISION §9).
- Empty is never an error. It becomes a readiness error only when the template marked that content
  `REQUIRED`.

## Ownership, provenance and generation rules

| Party | Owns |
|---|---|
| Customer | All content values and uploaded assets |
| Operator (us) | May enter content on the customer's behalf (`origin: "operator"`) |
| Platform | Schemas, validation, truth rules |
| Template | Presentation and neutral UI defaults — **never** content |

**What a generator (provider seam) may produce** — enforced by schema, not only by claim regexes:

| Allowed to be drafted by a generator | Never generated (schema error) |
|---|---|
| Copy slots (`07`) | Collection items: `projects`, `reviews`, `banners`, … (an item's `origin` has no generated value) |
| `business.tagline`, `business.description`, `business.story` | `business.facts`, contact, address, hours, registration, social |
| Descriptive text **fields** of an item a person asserted, listed in `generatedFields` (e.g. a project `summary` drafted from customer-provided notes) | Review text, author, rating; any media |

Every generated value:

- passes the extracted truth-mode rules and validator
- carries a **pending-approval marker** wherever it is stored:
  - item fields → the item's `generatedFields`
  - `business.tagline` / `description` / `story` → `business.generatedFields`
  - copy slots → `sections.<key>.generatedCopy` in the site settings document (`08`)
- blocks indexable production while any marker remains (readiness gate)
- is approved only by a person: the approval command removes the marker and appends an approval record
  (NEXT #4 history lands with or before onboarding, NEXT #2, `14`)

The generator's output type names its target, and only the allowed targets above exist in that type. A
result aimed at any other path is rejected before it is stored.

**Review provenance is an attestation.** `source` is recorded with the writer's identity. The platform
cannot prove that a review is authentic, so it refuses every machine-originated path to review content.

**Source values never become customer content.**

- There is no `source-derived` origin.
- Source-like values appear only in the private reference fixture used for the fidelity gate
  (`origin: "reference-fixture"`, `04`).
- Loading that origin under `data/sites/**`, or packaging it, is an error.
- `imported-with-consent` covers one legitimate case: a customer migrating **their own** existing site. The
  capture pipeline could import it later (DEFERRED).

## Extension strategy

| Change | Cost | How |
|---|---|---|
| Add an optional field to a type | None | JSON/JSONB tolerant; templates adopt it when ready. **Exception:** a field that restricts publication (approval, consent, visibility) raises the site data's `minReaderVersion` (below) |
| Add a new type to a vertical | Low | New schema + reader type map entry. No storage change (generic item storage, `09`) |
| Add a vertical | Low | New module composing core + extensions |
| Promote a vertical type to core | Low | Move the schema; field names unchanged |
| Rename/remove/retype a field, or widen an enum | Real | Bump `contentModelVersion` for that vertical + a migration over items + new releases for every major still pinned by a site, frozen majors included (the one exception to "security fixes only", `11`). Avoid until a second template proves the need |

Guard rails:

- **Reader compatibility.** Site data records `minReaderVersion`. A release snapshot whose content model is
  older refuses to build that site, loudly: the site keeps its last good package and is reported (`11`).
  Older readers therefore never silently drop a field that restricts publication.
- A vertical module must not import any template.
- Code review and a lint/grep check reject placement-named fields such as `homepage*`, `section*`,
  `area1*` or template ids inside content schemas.

## Future CMS editing (not built; not blocked)

- Forms are generated from the zod schemas (JSON Schema export). Media and rich-text fields get
  dedicated editors.
- Draft vs published status, the draft schema (added with the first editor) and publish-time validation
  keep partial saves possible.
- The same schemas validate JSON files today and database rows later. That shared validation is what
  keeps the storage migration cheap (`09`).

## What is deliberately NOT in the content model

| Concern | Where it lives | Why |
|---|---|---|
| Brand name, legal name, public origin, locale | Site Instance `identity` (`08`) | One authoritative source; content and SEO read it |
| Section enable/limit/selection/sort/variant | Site settings (`08`) | Template-scoped behavior, not business facts |
| Section copy (section titles, CTA labels, intro text) | Copy slots in site settings (`07`) | Template-scoped. Transferable only by standard slot names; falls back to core fields such as `business.tagline` |
| Navigation labels, hidden items, extra links | Site settings (`08`) | Derived from template routes |
| Theme tokens | Site Instance theme (`08`) | Design, not content |
| Site-level SEO defaults, domain aliases | Site Instance (`08`) | Identity/config. Item-level `seo` overrides stay on items |
| Template id/version | Site Instance pin (`11`) | Config |
