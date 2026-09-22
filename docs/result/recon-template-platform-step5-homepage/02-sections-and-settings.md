# 02 — Sections, settings and slots (interior-01 1.3.0)

The homepage order is **Template code** (`templates/interior-01/v1/app/page.tsx`). It is never a setting:

```
site.header
<main>  home.hero · home.intro · home.projects-a · home.projects-b · home.reviews · home.image-band  </main>
site.footer
  └ site.floating-cta    (the footer's last child: viewport-fixed wrapper + one link, outside the section flow)
```

The floating CTA is rendered **inside** `<footer>`, so it belongs to the contentinfo landmark instead of sitting loose outside every landmark. It is still `position: fixed` and never part of `<main>`. Other pages call `SiteFooter` without children, so their footer HTML is unchanged.

Each section resolves its own data first (`homeHero(ctx)`, `homeIntro(ctx, anchors)`, …). When it has no data it returns `undefined`, and nothing is emitted: no wrapper, no heading and no placeholder.

## Per-section contract

**`home.hero`**
- Settings (default): `enabled` (true), `autoplay` (true).
- Slots (neutral default): `label` "Highlights", `previousLabel`, `nextLabel`, `pauseLabel`, `playLabel`, `slideLabelFormat` "Slide {n} of {total}".
- Items: `banners` (≤ 8, published, stored order).
- Absent when disabled, or when there are 0 served slides.

**`home.intro`**
- Settings (default): `enabled` (true).
- Slots: `title` text 80, no default; `body` richText 3×400; `link`; `media`.
- Absent when disabled or when there is no `title`. An intro is the site's own words, so there is no neutral title.
- The link is kept only if its destination is live in this build (see below). The media is optional; without it the layout is text-only.

**`home.projects-a`**
- Settings (default): `enabled` (true), `limit` 1–24 (8), `selection` latest | category | manual (latest).
- Slots: `title` "Selected projects", `description`, `moreLabel` "View all projects", **`previousLabel`, `nextLabel`** (new).
- Items: `projects` query.
- Absent when disabled or when the query returns 0 items. The "view all" link appears only if the `/portfolio` route exists.

**`home.projects-b`** (new)
- Settings: the same schema as A, but the **default is `enabled: false`**.
- Slots: `title` "More projects", `description`, `moreLabel`, `previousLabel`, `nextLabel`.
- Items and absence: as for A.

**`home.reviews`** (new)
- Settings (default): `enabled` (true), `limit` 1–12 (6).
- Slots: `title` "Client reviews", `media` (optional banner above the reviews), `previousLabel`, `nextLabel`.
- Items: `reviews` (published, stored order, first `limit`).
- Absent when disabled or when there are 0 served reviews.

**`home.image-band`** (new)
- Settings: none (`{}`).
- Slots: `media`.
- Absent when there is no `media`.

**`site.floating-cta`** (new)
- Settings (default): `enabled` (true).
- Slots: `label` "Contact".
- Destination: `business.contact.email` rendered as `mailto:`.
- Absent when disabled or when there is no contact destination.

Every settings section is strict zod (Template defaults ⊕ sparse site overrides). Unknown keys fail the build. So do placement-style keys (`projectsB`, `displayOrder`, …), a hero `interval`/`slides`, a reviews `limit` of 13, and CTA `href`s (tested).

### Link and anchor rules

**Sections link only to destinations that exist in this build.**
- Projects "view all" → `/portfolio`, only when `ctx.routes.has("portfolio.index")`. On fixture-empty the route is pruned, so the link is absent.
- Cards → `/portfolio/<slug>` through the existing `projectCards` / `ProjectCard`. The home variant uses `level: 3`, `withSummary`, and lazy images.
- Hero CTA targets:
  - `project` → the detail route, only if that project is served in this build;
  - `contact` → `mailto:`.
  - A target that cannot be resolved means no CTA.
- **Intro link** (`liveLink`, spec §21): the intro link is an **operator-chosen** destination. The fixtures use `mailto:`; a Template route such as `/portfolio` or a Template anchor such as `#reviews` is not the intended use.
  - When a value is given anyway, a `/path` is kept only if it is one of `ctx.routes.paths()`, and a `#anchor` only if that section is rendered on this page (`projects`, `projects-more`, `reviews`). Otherwise the link is hidden.
  - `mailto:` / `tel:` are kept as given.
  - step5 throwaway builds prove every case:
    - `#reviews` is kept when reviews render and dropped when they don't;
    - `/portfolio` is kept (as an internal link, with no warning);
    - `/portfolio/nope` is hidden and warned.
- **No silent drops.** The builder adds a build-record warning (`preflight.warnings`, worded "that CTA / link is never rendered", which holds whether or not the section itself renders) for each of these:
  - a hero CTA whose project is not served;
  - a contact CTA on a site with no contact destination;
  - a link slot whose `/path` is not a page of this build.

  This is `droppedDestinationWarnings` in `platform/build/site-build.ts`. It is advisory (the build still succeeds) and does not affect buildInputId. `#anchor` liveness depends on which sections render and is not warned (06).
- Slot hrefs remain restricted by the slot schema to `/path`, `#anchor`, `mailto:` and `tel:`; `https:` is refused.

### Slot model
- No per-item or DOM slots were added. Every new slot is a fixed section-level `text` / `richText` / `link` / `media` key.
- Reviews, slides and cards are content. A slot key such as `home.reviews.items` or `home.hero.slide1` fails as an unknown slot (tested).
- The slot-vs-localization question (whether UI labels such as "Previous slide" belong in slots or a locale layer) is unchanged and deferred to before Template 2 (06).

## Fixture configuration (fictional content only)

**fixture-large** (en-US, default theme)
- Hero: 3 published slides (+1 draft):
  - project CTA → `/portfolio/quarry-hill-kitchen-0174`;
  - contact CTA;
  - image-only slide with alt text.
- Intro: media, 2 paragraphs, link "Write to the studio" → `mailto:` (an operator destination).
- A: latest 8. B: "From the archive", manual 6.
- Reviews: 7 published (+1 draft), limit 6. Reviews banner media.
- Image band. CTA "Contact" → `mailto:hello@fixture-large.example`.

**fixture-small** (ko-KR, warm theme)
- Hero: 2 Korean slides (project CTA + contact CTA "상담 문의"); Korean hero control labels (e.g. "{total}장 중 {n}번째").
- Intro: media + "메일로 문의하기" `mailto:` link.
- A: residential 4. B: commercial 4 ("상업 공간 프로젝트").
- Reviews: 3 Korean (limit 4), no reviews media.
- Warm image band. CTA "상담 문의".

**fixture-empty** (en-GB, 0 projects)
- One image slide with a fictional headline, no CTA.
- Text-only intro.
- `reviews.json` with `items: []`.
- No band media, no email.
- Result:
  - hero + intro only;
  - no header navigation at all (no portfolio route and no email, so no empty `<nav>`);
  - no empty footer `<dl>`;
  - `/portfolio` returns 404.

All fixture copy says it is fictional. All media are generated SVG illustrations (`sceneSvg`) registered in each site's asset registry. `assertFullyReferenced` fails generation if any registry asset is unreferenced or missing.
