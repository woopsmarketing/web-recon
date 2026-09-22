# 01 — Home content model

Step 5 adds two content types and reuses a third. Every homepage item is **content**, not a slot. Slots stay section-level copy.

| Home section | Item source | Model status |
|---|---|---|
| Hero slides | `banners@1` collection (`content/banners.json`) | **PROVISIONAL** (`PROVISIONAL_CONTENT_TYPES = ["banners"]`) |
| Projects A / B | the existing `projects@1` collection, through two declared selections | canonical (unchanged) |
| Reviews | `reviews@1` collection (`content/reviews.json`) | canonical, optional |
| Intro, image band, reviews banner | media / text / link **slots** (one per section, never per item) | — |
| Floating CTA destination | `business.contact.email` (existing singleton) | — |

Code:
- `platform/content/schema.ts`: `ReviewSchema`, `BannerSchema`, `BannerCtaSchema`, `ReviewsDocSchema`, `BannersDocSchema`, `MAX_BANNERS = 8`.
- `platform/content/reader.ts`: two closed queries, `{type:"reviews",limit}` and `{type:"banners",limit}`.
- `platform/site/instance.ts`: optional `content.reviews` / `content.banners` in the snapshot.
- `platform/site/load.ts`: builder-side loading, visibility, origin check and CTA-target check.

## Reviews (`reviews@1`)

```ts
Review = { id, status: "published" | "draft", text: ShortText(600), attribution?: ShortText(60) }  // strict
```

What the model allows:
- Plain text plus an optional short attribution.
- **Stored order**. The operator orders the document; the reader never sorts.
- **Absent document = empty collection.** The section is omitted and no wrapper is emitted.
- Public builds serve `published` only. Preview builds also serve drafts. There is no schedule (reviews have no `publishedAt`).

What the model does not allow:
- No rating, stars, date, avatar/photo, "verified" flag or source/platform field. Strict schemas refuse every one of them (tested).
- No generated origin: `origin` is the platform-wide `customer | synthetic-fixture | reference-fixture` enum, and `reference-fixture` is refused under `data/sites/**`.
- Nothing in the platform generates, pads or rewrites review text.

## Hero slides (`banners@1`, PROVISIONAL)

```ts
Banner = { id, status, image: MediaRef, headline?: ShortText(80), text?: ShortText(160),
           cta?: { label: ShortText(32), target: { kind: "project", project: RecordId } | { kind: "contact" } } }
BannersDoc: ≤ 8 items
```

- **Image-only slides are valid** (`headline`, `text` and `cta` are all optional). `image.alt` is optional: an undescribed slide image is decorative (`alt=""`) and the headline carries the meaning.
- **The CTA is a target, never a URL.** `project` resolves to that project's detail route. `contact` resolves to the site's contact destination.
  - A target that is not served in this build (for example a draft project) renders the slide **without** a CTA.
  - An unknown project id **fails the load** with `SiteDataError`.
  - This keeps site data route-independent and prevents dead or off-site links.
- Slides render in stored order. Drafts appear in preview only.
- **Video is deferred.** The asset pipeline is image-only today; the schema refuses a `video` field (tested).

**Why PROVISIONAL.** The type covers what the Step 5 homepage needs (image + optional copy + closed CTA). It deliberately does not model:
- per-device variants;
- display windows or scheduling;
- display order fields;
- placement flags (`isPcDisplay`, `isMobileDisplay`, `displayOrder`, `isBottomArea*Display`);
- external links.

Until a demo-customer content proof confirms the shape, it may still change incompatibly (this is recorded in 06).

## Projects A / B — one collection, two selections

- Both sections read the canonical `projects` collection through the existing closed `ProjectSelectionSchema` (`latest | category | manual`) plus `limit`. There is no second collection, no `projectsB[]` and no placement flag.
- Projects B is **off by default**. With no site-chosen selection it could only repeat projects A, so an operator must enable it with a different selection.
- `preflight.ts` already runs every settings section that has `selection` and `limit` as a projects query. B is therefore validated the same way A is (for example, an unknown category fails the build).

| Fixture | A | B |
|---|---|---|
| fixture-large | latest 8 | manual 6: `hp-0150, hp-0140, hp-0125, hp-0112, hp-0101, hp-0088` (disjoint from A) |
| fixture-small | category `residential`, 4 | category `commercial`, 4 |
| fixture-empty | none (0 projects → both absent, no wrapper) | none |

## Snapshot compatibility

`reviews` and `banners` enter the site snapshot **only when their document exists**. A site without those files (every 1.0.0–1.2.0-shaped site) keeps a byte-identical snapshot and therefore an identical `buildInputId`.

step5 test "old-release compatibility" proves this: 1.2.0-shaped data re-pinned to 1.2.0 reproduces each retained 1.2.0 package's buildInputId exactly, for all three sites.

Old releases' strict snapshot schemas refuse the new keys. Rolling a site that has banners or reviews back to ≤ 1.2.0 therefore means using the retained package, or deleting those documents first. This is the same rule as Step 4.1.

## Not modelled (spec exclusions)

- No service, FAQ, journal, about, locations, legal, popup, announcement bar, inquiry form or chat widget.
- No `/inquiry` route.
- BoostChat exists only as a documented seam: `contactHref()` in `sections/links.ts` is where a future chat launcher would replace the `mailto:` href.
