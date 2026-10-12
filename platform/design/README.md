# Design system of `interior-02` — authoring guide

For whoever writes a variant, a variant sheet or a preset. The variants were first written by four
packages in parallel (E-TB-H hero · E-TB-P showcase / detail · E-TB-S about / services / cta ·
E-TB-C header / footer / action bar / inner pages) and then composed into three designed sites by
one writer (E-TB-5). Contract: `CONTRACTS.md` Part E of the site-design-platform work.

Everything named here exists. The foundation registered every first-milestone variant as a
**placeholder** (files in place, still rendering the classic implementation); all of them are
implemented now (`status.ts`: `ready`). A variant added later starts the same way: §8.

---

## 1. How it fits together

```
site data                 settings.json  overrides["site.design"] = { config: DesignConfig@1 | null }
                          theme.json     tier-1 tokens (palette, the two font family lists)
        │
template (a release)      manifest/design.ts    the `site.design` setting (validated: design/contract.ts)
                          design/registry.ts    THE ALLOWLIST: section → variants → status / files
                          design/resolve.ts     designOf(ctx): the site's document, or the classic one
                          design/tokens.ts      tier 2 + tier-1 colours + font set → --ds-* on :root
                          design/sections.tsx   home recipe → sections rendered by the page
                          design/slots.ts       home recipe / pages → DATA of the runtime slots (+ dsVariant)
                          design/slot-components.ts   slot + dsVariant → COMPONENT (browser side)
                          design/chrome.tsx     <Header> <Footer> <MobileBar>
                          design/styles.ts      every design stylesheet, in cascade order
                          design/variants/<family>/…   ← YOUR FILES
                          styles/design/<family>-<variant>.css   ← YOUR FILES
        │
build and runtime kit     both render through runtime/portfolio.ts → design/slots.ts, and the settings
                          travel in `_runtime/portfolio/shell.json`, so the kit composes the same variant
                          the build shows
```

- `config: null` (every site that chose nothing) = the **classic site**: the 1.1 sections in the
  1.1 order, the classic components themselves, `<html data-design="classic">`, no inline tokens, no
  font file. This is pixel-proven against release 1.1.2 and must stay so.
- A site with a document gets `<html data-design="<presetId>">` (or `custom`), an inline
  `<style id="site-design">:root{--ds-…}</style>` computed from its theme, and the stylesheet of its
  font set.
- The implementation lives in the Template directory because a release holds the Template and
  nothing of `platform/design/`. `platform/design/` is what is *not* rendered: presets, the scaffold
  step, the font step, the catalog, the checks, the fixtures and this guide.

## 2. Files you own, and the ones you do not

| Package | You write |
|---|---|
| E-TB-H | `design/variants/hero/{photo,statement,split}.tsx` + `.data.ts`, `styles/design/hero-*.css`, `design/variants/hero/status.ts` |
| E-TB-P | `design/variants/showcase/{panels,index,cards}.tsx` + `.data.ts`, `design/variants/detail/{typographic,gallery}.tsx` + `.data.ts`, `styles/design/showcase-*.css`, `styles/design/detail-*.css`, the two `status.ts` |
| E-TB-S | `design/variants/about/{split-panel,manifesto,statement-photo}.tsx`, `design/variants/services/{rows,numbered}.tsx`, `design/variants/cta/{quiet,band}.tsx`, their `styles/design/*.css`, the three `status.ts` |
| E-TB-C | `design/variants/header/{centered,conversion}.tsx`, `design/variants/footer/minimal.tsx`, `design/variants/action-bar/action-bar.tsx`, `styles/design/{header-centered,header-conversion,footer-minimal,action-bar,inner}.css`, the three `status.ts` |

All paths are under `templates/interior-02/v1/`. That table is how the variants were first written.
Since E-TB-5 the variant files, every sheet of `styles/design/` except `tokens.css`, and
`data/site-presets/interior-02/**` have **one writer at a time**: the sections of a preset are
designed together (one grid, one type scale, one label style — §7.1), so nobody changes one
family's sheet without looking at the presets that compose it. Inside a family directory you may add helper
files (`design/variants/hero/shared.tsx`, a small client component, …). You may **not** add a
stylesheet: one sheet per registered variant, already created and already imported.

**Do not edit** (one writer; see §11 to ask for a change):

```
design/registry.ts  design/contract.ts  design/config.ts  design/resolve.ts  design/tokens.ts
design/fonts.ts  design/fonts.json  design/sections.tsx  design/slots.ts  design/slot-components.ts
design/chrome.tsx  design/styles.ts  design/classic.tsx
manifest/**  template.ts  runtime/**  app/**  components/runtime/**
styles/design/tokens.css  styles/*.css (the seven classic sheets)  sections/** (the classic code)
platform/**  data/site-presets/**  package.json
```

Also not yours: another family's directory, `sections/HomeKeywords.tsx` (it carries a fix of another
release), anything under `data/`.

## 3. The module contract, per family

A variant module is found by its path and by two export names. Keep the names.

### 3.1 Sections the page renders — `about`, `services`, `cta`

`design/variants/<family>/<variant>.tsx` exports:

```ts
export function data(ctx: Ctx): D | undefined      // everything the section shows; undefined = left out entirely
export function Section(props: { data: D }): ReactElement | null
```

(`HomeSection<D>` in `design/classic.tsx`.) `data` runs at build time with the site context;
`Section` is a server component that renders from `data` alone. The section owns its outer element
— give it `className="ds-<family>-<variant>"` and `data-section="home.<family>"`.

Classic data you can reuse instead of re-deriving (import the function, not the markup):

| Family | Classic data function | What it reads |
|---|---|---|
| about | `aboutStory(ctx)` — `sections/AboutStory.tsx` | slots `about.page` (intro title / body paragraphs / photo), brand name |
| services | `homeService(ctx)` — `sections/HomeService.tsx` | settings + slots `home.service` |
| cta | `footerBand(ctx)` — `sections/FooterBand.tsx` | slots `site.footer` (cta / showcase halves), contact and portfolio routes |

### 3.2 Sections rendered through a runtime slot — `hero`, `showcase`, `detail`

These read the portfolio, so on an incrementally published site they are composed by the runtime
kit, not by the build. Two files, **two different worlds**:

`design/variants/<family>/<variant>.data.ts` — build / kit side:

```ts
export function data(ctx: Ctx): D | undefined                        // hero, showcase
export function data(ctx: Ctx, project: ProjectItem): D | undefined  // detail
```

Pure, reads only the site context, returns **plain JSON** (it is serialized into the page and into
the kit's output). No React import, no component import. Do not add the variant key yourself:
`design/slots.ts` adds `dsVariant: "<variant>"` to what you return.

`design/variants/<family>/<variant>.tsx` — browser side:

```ts
export function Section(props: { data: D }): ReactElement
```

It is imported by the client component `components/runtime/RuntimeSlot.tsx`, so it is bundled for
the browser and for the kit. It receives the data and nothing else — **no `ctx`**. It must not
import a `.data.ts` file, `sections/types` values, or anything that reads the site context. A
`.tsx` here needs no `"use client"` line of its own.

The slot stays the existing one (`home.hero`, `home.projects`, `portfolio.detail`): no new slot id,
no change to `portfolio-runtime@1`. `projectType` and `category` stay two fields in your data.

Classic data you can start from: `homeHero` (`sections/HomeHero.tsx`), `homeProjects`
(`sections/homeProjectsData.ts`), `portfolioDetail` (`sections/PortfolioDetail.tsx`); card models:
`lib/projects.ts` (`projectCardModel`, `projectHref`), figures: `lib/format.ts`.

### 3.3 Chrome — `header`, `footer`, `action-bar`

```ts
// design/variants/header/<variant>.tsx
export function Section(props: SiteHeaderProps): ReactElement | null
//   SiteHeaderProps (sections/SiteHeader.tsx): { ctx, variant?: "home" | "sub", current?, title?, backHref? }
// design/variants/footer/minimal.tsx  ·  design/variants/action-bar/action-bar.tsx
export function Section(props: { ctx: Ctx }): ReactElement | null
```

Server components with the full context. A header variant owns everything the classic header owns
(bar, drawer, and whatever it shows at phone width); keep the skip link target and `aria-current`
behaviour. The target exists: on a site **with** a design document every page's `<main>` carries
`id="main"` (`mainId(ctx)` / `MAIN_ID` in `design/resolve.ts`; the nine `app/**` pages set it) — a
header variant may link `#main`. The classic site's `<main>` has no id: its markup is byte for byte
the stored release's. Navigation items: `navItems(ctx, labels)` in `lib/links.ts` (it drops routes the site
does not have). `footer.minimal` is the footer without the call-to-action band, for a recipe that
has its own `cta` section. `action-bar` is rendered once by the root layout after the footer.

The ways to reach the business come from one place, `channelsOf(ctx)`
(`design/variants/action-bar/channels.ts`): `phone` (the site's own `tel:` link) and `consult` (the
contact page). Nothing is invented — a site without a phone has no phone control anywhere.

- `action-bar` (below 1024px): the phone · the consultation, each only when the site has it. The
  consultation is the bar's emphasis and follows `theme.accentUse`: `fills` → the accent pair;
  `minimal` / `blocks` → `.ds-action-bar--quiet`, the block pair (`--ds-block-*`: the surface on a
  minimal site, the accent where the accent is the site's block). All three presets name it: at
  phone width it is the one-tap, labelled path to a call or a request on every page.
- `header.centered` never shows an icon alone for the consultation (it reads as "chat"): the control
  is its word at every width — a text link below 700px, an outlined button above — and it is not
  shown below 700px when the action bar is on screen (`html:has(.ds-action-bar)`), where the bar
  carries it.
- `footer.minimal`: a company row whose value is the number of the site's `tel:` link is rendered as
  that link (digits compared, `+82` = `0`). Any other number stays text — a registration number is
  digits and dashes too.

### 3.4 Inner pages — `styles/design/inner.css`

The list, about, service, faq and contact pages (and the classic detail, home sections, header and
footer when a design names the `classic` variant) keep their classic markup. This one sheet themes
them for a site **with** a design document: every rule starts with
`html[data-design]:not([data-design="classic"])` and maps classic selectors onto `--ds-*` values.
A rule without that prefix would change the classic site and fails the check. Besides the theme
(root size, container, rhythm, heading face and weight, corners) it holds the corrections the
classic sheets need on a designed site:

- text on an accent fill (`.i2-btn--mint`, `.i2-pside__apply`, the accent tile of the about and
  service pages, the default badge) is `--ds-accent-ink`, not the page ink;
- on a site composed from a **preset** (`:not([data-design="custom"])`) the about page's four tone
  tiles (`.i2-ab-value`) follow the theme instead of the classic navy / mint / yellow / dark: three
  are surface panels and the "mint" one is the block pair (`--ds-block-*`) — the same surface under
  `accentUse: minimal` (no brand colour on a surface), the accent under `blocks`, the tint under
  `fills`; the photograph below them has no shadow (a preset site has none anywhere). A `custom`
  design keeps the classic tones there, as its classic home page does;
- check controls read as what they are: the classic sheets draw the tick in both states, so the
  required consent (`.i2-consent__check`) and every list filter (`.i2-pcheck__box`) look chosen;
  on a designed site off = empty outline, on = filled with the tick;
- the classic total block (`.i2-ptotal`): each number and its unit are `nowrap`, the figure is
  `--ds-text-xl` up to 480px, and the row may wrap, so a figure that cannot share the row with its
  label moves under it whole — never "115,600,00 / 0 원";
- floors: `.i2-acc__pill` is `--ds-text-xs`; chips, sort tabs, the filter buttons, the faq menu
  links and the phone link are 44px tall; icon-only buttons keep their drawn size and get a 44px
  hit area (`::after`, `inset: -8px`);
- `word-break: keep-all` on `body` (the classic sheets break Korean words anywhere);
- the floating corner (§7.1) and `--i2-tabbar-h`: zeroed only where no classic tab bar exists
  (`:not(:has(.i2-tabbar))`), so a `custom` design that keeps the classic header keeps its bar.
- the service page on a **preset** site: no dead figure column (the glance rows share the width when there is no
  diagram) and no fixed five-track list (it holds as many tracks as it has items); `luxury-gallery` shows neutral
  surface tiles in a hairline outline instead of the three coloured ones. The figure case and the `custom` design keep
  the classic page;
- the detail photograph zoom: `design/variants/detail/zoom.tsx` opens the **classic** `PhotoViewer`
  (`components/portfolio/ProjectGallery`, the native `<dialog class="i2-pviewer">`) for both detail variants — no
  second viewer, no viewer rule or script of its own.

## 4. Reading site data

`Ctx` is `sections/types.ts` (`SiteContext` bound to this Template's sections).

| You need | Read |
|---|---|
| company name | `ctx.identity.brandName` |
| a text / media slot | `ctx.slots.text("<section>", "<key>")` · `ctx.slots.media("<section>", "<key>")` → `{ asset, alt }`; resolve with `ctx.assets.resolve(asset)` → `{ src, width, height }` |
| a setting | `ctx.settings["<section>"]` (typed) |
| business facts (phone, address, hours, channels) | `ctx.content.getSingleton("business")`; links through `lib/links.ts` (`contactHref`, `contactEmail`, `hasContactChannel`, `liveLink`) — a link helper returns `undefined` when the site has no such channel |
| projects | `ctx.content.list(…)` (the reader the classic data functions use) — only inside a slot `.data.ts` |
| does a route exist | `hasRoute(ctx, "portfolio.index")` — `lib/routes.ts` |
| the site's design document | `designOf(ctx)` — `design/resolve.ts` (read-only; e.g. to know whether the recipe has a `cta` section) |

What the brand block fills (and a preset may not): the slogan (`site.menu.slogan`), the about
introduction and photo (`about.page.introTitle | introBody | photoMedia`), the hero heading, the
footer location / hours lines. Treat every one of them as **possibly absent**.

Rules that follow from E3:

- Nothing is invented. No figure, review, award, press logo, team member or price that the site
  data does not hold. A block without data renders **nothing** — no empty frame, no sample text.
- Every image comes from data and carries its `alt` from data.
- The home page's single `<h1>` is rendered by `app/page.tsx` (the visually hidden company name).
  A home section uses `<h2>` and below. The detail page's `<h1>` belongs to the detail variant —
  exactly one.

## 5. The `--ds-*` vocabulary

Compiled by `design/tokens.ts` from the site's tier-2 theme, its tier-1 colours and its font set;
defaults for the classic theme in `styles/design/tokens.css`. Use these and nothing else for
colour, type and spacing. The list is `DS_TOKENS` in `design/tokens.ts` (49 names).

| Token | Meaning |
|---|---|
| `--ds-font-display` · `--ds-font-body` · `--ds-font-label` | family lists of the font set: headings · running text · small UI labels |
| `--ds-text-xs` `sm` `base` `md` `lg` `xl` `2xl` `3xl` `display` | type steps, fluid between a 360 and a 1440 viewport. `xs` never below 13px, `base` never below 16px. Body text = `base` or larger |
| `--ds-weight-display` · `--ds-weight-heading` | weight of the largest headings · of section headings (from `headingWeight`) |
| `--ds-leading-display` · `--ds-leading-body` | line height of display headings · of running text |
| `--ds-tracking-display` | letter spacing of display headings (slightly negative; never widen Hangul) |
| `--ds-space-1` … `--ds-space-8` | 4 · 8 · 12 · 16 · 24 · 32 · 48 · 72 px (as rem) — every gap and padding inside a section |
| `--ds-section-gap` | vertical distance between two sections (from `density`, fluid) |
| `--ds-container-max` | widest content column: 1100 / 1280 / 1440 px (from `container`) |
| `--ds-gutter` | side padding of the page (from `density`, fluid) |
| `--ds-radius-media` · `--ds-radius-control` | corner of photographs and panels · of buttons and inputs (from `corner`) |
| `--ds-hairline` | width of a rule line |
| `--ds-bg` · `--ds-surface` | page background · a panel one step off the page |
| `--ds-ink` · `--ds-muted` | text · secondary text (≥ 4.5:1 on `--ds-bg` and `--ds-surface`) |
| `--ds-line` | borders and rules |
| `--ds-accent` · `--ds-accent-ink` | the brand accent as a **fill** · the text colour computed to read on it (≥ 4.5:1). Never put `--ds-ink` on `--ds-accent` |
| `--ds-accent-text` | the accent adjusted until it reads **as text** on `--ds-bg` / `--ds-surface` (links, numerals) |
| `--ds-tint` | a pale wash of the accent (10% over the page) |
| `--ds-block-bg` · `--ds-block-ink` | the one "brand block" of a page; follows `accentUse`: `minimal` = surface + ink, `blocks` = accent + accent ink, `fills` = tint + readable ink. Use the pair together |
| `--ds-inverse-bg` · `--ds-inverse-ink` | an inverted block (text colour as background) |
| `--ds-scrim` · `--ds-on-scrim` | the dark veil over a photograph that carries text · the text on it |
| `--ds-ease` · `--ds-dur-1` · `--ds-dur-2` | easing · 180ms (state change) · 420ms (entrance) |

**The container — one convention.** The content column is `--ds-container-max` wide and the gutter
is outside it. Every box that holds content — a section's `__inner`, a header bar, the footer, a
classic inner page — is written the same way:

```css
max-width: calc(var(--ds-container-max) + 2 * var(--ds-gutter));
margin-inline: auto;
padding-inline: var(--ds-gutter);
```

so every left and right edge of a page falls on the same two lines at every width (measured:
80–1360 at a 1440 viewport with the `regular` container, 56–1384 with `wide`). A `max-width:
var(--ds-container-max)` box **with** the padding inside it is 2 gutters narrower than the header
and is wrong. A box that is not padded (the closing band, whose own background stops at the column)
uses `width: calc(100% - 2 * var(--ds-gutter)); max-width: var(--ds-container-max)`.

Layout numbers that are not spacing (a grid fraction, an aspect ratio, `min-height: 60svh`, a
`max-width` in `ch`) are yours to choose. `--ds-accent-text`, `--ds-tint`, `--ds-block-*` and
`--ds-on-scrim` are additions to the minimum list of the contract.

The classic tier-1 custom properties (`--color-*`, `--typography-*`) are **not** part of your
vocabulary: a variant sheet that reaches for them bypasses the theme.

## 6. CSS rules (checked by `pnpm design:check interior-02`)

1. One sheet per variant: `styles/design/<family>-<variant>.css` (`action-bar.css`). It is already
   imported by `design/styles.ts`, after the classic sheets.
2. Every selector contains the sheet's namespace class: `.ds-<family>-<variant>` for the block,
   `.ds-<family>-<variant>__part` and `--modifier` for what is inside. No bare element selector, no
   classic class (`.i2-…`) on its own. `html[data-design] .ds-hero-photo …` is fine.
3. No colour literal (`#…`, `rgb()`, `hsl()`): colour is a `--ds-*` role. `transparent`,
   `currentColor` and `color-mix()` **of two roles** are fine.
4. `font-size` and `font-family` only as `var(--ds-…)`.
5. No `url()` and no `@import`: a variant has no asset of its own. An icon is inline SVG in the
   component (`components/ui/Icon.tsx` has the classic set).
6. Mobile first. Breakpoints: `@media (min-width: 700px)`, `1024px`, `1400px` — no others.
7. `word-break: keep-all` on Korean text blocks; no italics; no positive letter spacing on Hangul.
8. Motion is CSS only, wrapped so that `@media (prefers-reduced-motion: reduce)` turns all of it
   off. Nothing is revealed by hover only. No autoplay video.
9. Do not restyle a classic class from a variant sheet, and do not depend on a classic sheet's rule
   for your block: a variant brings its own layout.

## 7. Quality rules (CONTRACTS E3) — what a reviewer will hold you to

- Thin content: 0 / 1 / 3 / 8 projects; no hero photo; no about photo; a 20-character company
  name; no phone; no consultation URL. Fixture profiles `thin0`, `thin1`, `thin3`, `regular8`,
  `longname` cover them.
- One `<h1>` per page; real `<a href>` anchors; skip link kept; visible focus on every control;
  tap targets ≥ 44px; body text ≥ 16px and nothing below 13px; text contrast ≥ 4.5:1 (≥ 3:1 at
  24px and larger).
- No horizontal scroll at 375 / 390 / 768 / 1440.
- At most one IntersectionObserver per page, and no new client component unless a native element
  (`<details>`, `<dialog>`) cannot do it. The classic reveal helper is `components/home/Reveal.tsx`.
- No code copied from a reference website or from a UI kit that is not open source. Fonts: the
  two font sets only.
- Template source gate (it runs when a release is cut, and in the harness): no `Date`, `Intl`,
  `Math.random`, `process`, `window` / `globalThis` / `self`, `fetch`, `crypto`, timers; imports
  only relative files inside the Template directory, `react`, `next/link`, `next/navigation`
  (`notFound` only), `zod` and the `@platform/*` doors the classic code already uses
  (`TEMPLATE_IMPORT_ALLOW` in `platform/release/release.ts`); no site id, no customer name.

### 7.1 Composition rules (what makes the sections one site)

- **Rhythm.** A home section carries `padding-block: calc(var(--ds-section-gap) / 2)`, so two
  neighbours are one gap apart. A hero ends with the same half gap; `footer.minimal` adds a half
  gap above itself when the page ends with a `ds-*` section. A full-bleed coloured section
  (`about.manifesto`) takes its half gaps as **margin** and pads its field separately.
- **First screen.** A header variant publishes its height as `--i2-header-h` on `html`; the header
  is in the flow (sticky) and has a hairline. From 641px `hero.photo` is exactly the rest of the
  first screen: `100svh - var(--i2-header-h) - var(--ds-hairline)`. A hero never assumes it starts
  at 0. Up to 640px `hero.photo` does not use the photograph as a backdrop (a full-height phone hero
  keeps under a third of a landscape picture): the picture is a square, shown whole-width, and the
  caption, line and link follow it as type on the page, so the header, the photograph, the
  statement and the start of the next section share the first screen. There is no focal-point
  control; the square is centred.
- **Conversion at phone width.** On every page a visitor can call or open the consultation request
  with one tap, without opening the menu, on a control that says what it is: the action bar (§3.3).
  A recipe without the bar must give the same in its header. A phone number printed in a chrome
  variant is a `tel:` link.
- **Type.** Section title = `xl`, display face, `--ds-weight-heading` (the closing line of
  `cta.quiet` and a statement go one step up from 700px). Body, links and buttons =
  `base`; `md` is not a body size (it was, under the old 15px root). Small labels = `sm`, label
  face, 600. "More" links are ink with an `--ds-accent-text` hairline underline. Nothing is set
  below `xs` (13px).
- **One primary button per preset.** A filled call to action is `--ds-accent` / `--ds-accent-ink`
  everywhere it appears (header pill, hero, closing band, classic detail button). `cta.band` reads
  `designOf(ctx).theme.accentUse`: under `blocks` the band itself is the accent, so its button
  turns to the block's ink (`.ds-cta-band--on-accent`).
- **The brand block.** `--ds-block-*` is used by one home section at most. `about.manifesto` is
  that section: full bleed, every colour inside taken from the pair.
- **`services.numbered`** has no boxes; columns from 700px (`minmax(11rem, 1fr)`, three fit a
  tablet; `15rem` from 1024px). Without descriptors (`.ds-services-numbered--bare`) the
  names alone are the content, one step larger — intentional, not an empty state.
- **Skip link.** Both header variants render `<SkipLink>` (`design/variants/header/shared.tsx`) as
  the first focusable element; it targets `#main` and is visible only on focus. Its words are
  locale-keyed in that file (there is no slot for them).
- **Menu without the Popover API.** The menu is a native `popover`. Each header sheet ends with
  `@supports not selector(:popover-open)`: the button is hidden and the panel becomes one in-flow
  row of page links under the bar, so navigation never depends on the API. The panel is the last
  child of `<header>` for that reason — keep it there.
- **Floating controls** (`inner.css`). On a designed site the "to top" button is hidden below
  1400px (it would sit on content); from 1400px it is a quiet 44px control in the free strip beside
  the column, shown only after the first screen (scroll timeline; a browser without one shows no
  button). Hidden is its resting state and only the scroll-driven animation shows it, so a capture
  with animations switched off shows scroll position 0 truthfully: no button. The floating contact
  button is hidden where the action bar is shown. Nothing fixed may cover a photograph or a control.
- **Whole words.** `body` is `word-break: keep-all; overflow-wrap: break-word` on every designed
  site (presets and `custom`), and nothing below it may switch that off for running text or a
  heading. A figure with its unit is one unbreakable piece (`white-space: nowrap`, or no break
  opportunity between them).
- **Tap targets.** Text links in a row (footer pages, conversion nav) get `min-width: 44px` and
  their spacing as padding, not as a gap.

## 8. Finishing a variant

1. Replace the placeholder files of the variant (`<variant>.tsx`, and `<variant>.data.ts` for a slot
   family) and write its sheet. **Remove the `@ds-placeholder` comment** from the files you
   implemented.
2. In `design/variants/<family>/status.ts` change the variant's value from `"placeholder"` to
   `"ready"`. That file is yours; `design/registry.ts` reads it.
3. `pnpm design:check interior-02` must pass — it fails when a file still carries the mark but is
   `ready`, when a file lost the mark but is still `placeholder`, when a `ready` sheet has no rule,
   and on any CSS rule of §6.
4. `pnpm typecheck:platform` and `pnpm test:design`. The suite does not know which variants are
   finished: per variant it holds `status.ts`, the `@ds-placeholder` mark and a non-empty sheet to
   each other (G1–G3, R4), whatever the status is — flipping a variant to `ready` needs no test
   change.
5. Screenshots and checks with the thin-content profiles (§9) at 390 / 768 / 1440 (and look at 375).
6. For a slot family (hero, showcase, detail): kit parity (§10).

A release is not cut while any preset names a placeholder: `pnpm design:check interior-02
--release` lists them and exits 1, and `pnpm test:design --release` (or `DESIGN_RELEASE=1`) fails
unless every variant a preset names is `ready`.

## 9. Commands

```bash
pnpm design:check interior-02                 # registry, files, status marks, CSS rules
pnpm design:check interior-02 --release       # + the placeholder gate and the font pins
pnpm test:design                              # the foundation's suite
pnpm test:design --release                    # + every variant a preset names is ready
pnpm test:rebuild                             # presets in the rebuild path (dev release 1.2.0 in a temporary root)
pnpm typecheck:platform

# build a fixture, serve it locally, screenshot it (Playwright Chromium), write checks.json + run.json
pnpm design:shots <outDir> --preset luxury-gallery --profile regular8
pnpm design:shots <outDir> --preset remodeling-conversion --profile thin0 --widths 390,1440
pnpm design:shots <outDir> --preset editorial-studio --profile longname --accent '#1f6feb' --typography modern-sans
pnpm design:shots <outDir> --profile regular8                          # the classic site
pnpm design:shots <outDir> --profile regular8 --release interior-02-1.1.2-0b35f76a156d   # a stored release

# the classic regression proof and the kit parity
pnpm design:parity classic <outDir> --baseline interior-02-1.1.2-0b35f76a156d
pnpm design:parity kit <outDir> --preset luxury-gallery --profile regular8

pnpm design:catalog interior-02               # presets.json (site-design-presets@1) on stdout
pnpm design:fonts interior-02 --check         # the font sets against the pins
```

`<outDir>` is a temporary directory or the evidence directory of your package — never a directory
under `data/`. The browser-driving tools live outside `platform/` (`tools/design/{harness,design-shots,design-parity}.ts`:
the `platform/` product code must not import `playwright`); the fixture builders stay in `platform/design/dev/`. The harness cuts the working tree into a dev release in a temporary root (every
release gate runs: a source-gate violation shows up here), builds the fixture there and serves the
package on `127.0.0.1`; a page may request nothing else. Profiles: `thin0` (no project, no hero
photo, no about photo, no phone) · `thin1` · `thin3` · `regular8` · `longname` (8 projects, a
20-character name, a 38-character hero heading and the first two project titles made 41 / 42
characters long). Every word of a fixture is sample text. The fixture's records include a total
that is a range and one that is withheld — look at those detail pages when a price block changes.

`checks.json`, per page and width: `horizontalOverflow` (px; must be 0), `h1Count` (must be 1),
`imagesWithoutAlt` (must be 0), `smallestFont` (px, with the element), `consoleErrors`,
`failedRequests` (must be empty), `images`, `generated` (a thin site has no list and no detail
page). To see a variant that no preset names yet, compose a preset for it — presets are E-TB-5's
files; until then ask for a draft change (§11) or run the harness against a private copy of the
repository.

## 10. Kit parity (slot families)

The proof that a variant is the same on an ordinary build and on a kit-composed page:

```bash
pnpm design:parity kit <outDir> --preset <a preset that names your variant> --profile regular8
pnpm design:parity kit <outDir> --preset <the same> --profile thin1
```

It builds the fixture twice — as an ordinary site and as a shell whose pages the release's runtime
kit composes from the same records — and compares, page by page, `<main>`, the markup around it
and the head's title / description / canonical / og / twitter, byte for byte (after the two
differences the portfolio-runtime proof accepts: boundary markers and generated ids).
`kit-parity.json` lists, per page, the `variants` found in the composed page's slot data: your
variant id must be there, and `pass` must be `true`. What breaks parity: a component that reads
anything but its `data`, data that is not plain JSON, output that depends on render order or time.

## 11. Asking for a shared change

You will need one when: the slot data of a classic function is not enough and the missing value is
not derivable in your own `.data.ts`; a token is missing from §5; a new variant, a renamed variant
or another section type is wanted; a setting or a slot must be declared (`manifest/**`); a preset
draft should name your variant differently.

Do not edit the shared file. Report back to the orchestrator with:

```
SHARED CHANGE REQUEST (interior-02 design)
file:      design/registry.ts | design/tokens.ts | manifest/… | runtime/portfolio.ts | app/… | preset …
change:    the exact addition (the entry, the token name with its meaning and how it is computed, the field)
why:       which variant needs it and what it cannot render without it
until then: what your variant does without it (so that your package can finish)
```

One writer applies the requests of all four packages in one pass, re-runs `pnpm test:design`, the
classic regression proof and the kit parity, and tells you when to pick the change up. A token is
added to `design/tokens.ts` (`DS_TOKENS` + the compiler) and `styles/design/tokens.css` is rewritten
with `pnpm design:check interior-02 --write-tokens`; a variant is added to `design/registry.ts`,
its family's `status.ts`, the component / data maps and `design/styles.ts` together —
`pnpm test:design` (R1–R3) holds the five to each other.

## 12. Presets, fonts and the scaffold step (for E-TB-5 and the release step)

- A preset is `data/site-presets/interior-02/<id>/preset.json` (`site-preset@1`,
  `platform/design/preset.ts`): `design` (a document without `preset`), `tier1` (the palette — the
  whole surface, optional primary and accent), `copy` (neutral labels for declared text slots that
  the brand block does not own; no digit, no URL). `version` grows with every published change.
- `applyPreset(planFiles, preset, brandAppearance)` (`platform/design/apply.ts`) runs **after** the
  brand step and is told the brand `appearance` as entered: brand primary and accent always win,
  brand surface and typography only when set; the colours that end up together are measured and
  refused with `contrast_too_low` when they do not read.
- **Which colours are judged (decision D-43)** — `contrastRuleFor(design)` in
  `platform/design/apply.ts` is the one place that decides:
  - a document that names a preset → `rendered-design`: the pairs the site really draws, read from
    the values the build will emit (`renderedDesignPairs` compiles the `--ds-*` roles with the
    template's own `design/tokens.ts`). Measured: `--ds-ink` on `--ds-bg` ≥ 4.5; `--ds-accent`
    against `--ds-bg` ≥ 3 (a fill, rule or marker must stand off the page); `--ds-accent-ink` on
    `--ds-accent` ≥ 4.5; `--ds-accent-text` on `--ds-bg` and on `--ds-surface` ≥ 4.5;
    `--ds-block-ink` on `--ds-block-bg` ≥ 4.5; `color.action.primary` against `color.canvas` ≥ 3;
    `color.action.primaryText` and `color.text.inverse` on `color.action.primary` ≥ 4.5. The ink
    pairs are computed by the compiler and hold by construction — they are measured all the same.
    So a dark brand colour (navy, black, forest green) is an ordinary accent on a preset site: the
    text of an accent fill is computed for it. What is still refused is an accent that does not
    stand off the page (a pale colour on a light surface, a dark one on `surface: dark`).
  - no document (classic) or a document without a preset (`custom`) → `classic-surface`: the brand
    step's rule, unchanged — the surface's text colour must read on the accent, because the classic
    sections draw it there.
  - a brand `surface` without its own primary / accent keeps the preset's colour where it reads on
    that surface and otherwise derives one toward the surface's text colour, so `{surface: "dark"}`
    alone resolves; a preset that still cannot be drawn there is `design_unsupported`.
  This is why a variant sheet must take the text of an accent fill from `--ds-accent-ink` (or
  `--ds-block-ink` on the block) and never put `--ds-ink` on `--ds-accent`: the rule above only
  holds for the pairs it measures.
- The rebuild path (`platform/provision/rebuild.ts`): `resolveDesignSeam` only **resolves** the
  spec's `design` — `null` stays `null` and the plan is the brand step's files, byte for byte; a
  reference is refused with `design_unavailable` (no such preset for the template),
  `design_version_mismatch` (the checkout holds another version), `design_invalid` (not an id, or a
  preset file that is not a preset) or `design_release_too_old` (the target release's template
  version is below the preset's `minRelease`, or the release does not carry the design system).
  `planRebuildBase` then runs brand → preset on the appearance alone, so an unreadable combination
  is refused before any image is read; with a preset the starter-palette judgement of the brand
  step is skipped (`deferContrast`) — the pairs are judged once, by `applyPreset`. After the build
  the package check compares the page with the **planned** theme (not with the brand's tokens) and,
  for a designed site, looks for `data-design`, the compiled `--ds-*` block and the font set with
  its licence text. The preset applied is in `RebuiltSite.design`, the CLI summary and the runner's
  result; the `built` event does not carry it (its shape is a contract).
- Brand support (`site-rebuild --brand-support`, `brandSupportDocument` in
  `platform/provision/brand.ts`) lists every release of the starter. A release that carries the
  design system (`DESIGN_SYSTEM_FILES`) **and** whose brand data model (`manifest/shell.ts`,
  `manifest/pages.ts`) is byte-identical to the reviewed one supports `appearance.typography`, with
  `appearance.typography:soft-rounded` under `unsupported`; no release id is written down for it.
  A release whose data-model fragments changed supports nothing until `REVIEWED_DATA_MODEL` is
  reviewed and updated — the release step checks that the new release's `supported` is not empty.
- Fonts: `design/fonts.json` pins, per font set, the OFL packages (exact versions in the root
  `package.json`), the sha256 of the generated stylesheet and the sha256 of each licence text. The
  site builder copies only the site's set into its package under
  `/_fonts/<set>/<hash>.{css,woff2,txt}` — hash-named, so a path never changes content. The
  stylesheet names each family, its licence and its package; the OFL text of each package travels
  beside it as `<first 20 hex of its sha256>.txt` (decision D-36), and a font set is never placed
  without it (`design_fonts_invalid`). The OFL text names two absolute URLs; the package check
  (`platform/build/qa.ts`) skips its absolute-URL scan for exactly the files the builder lists as
  pinned licence texts — path `_fonts/<set>/<20 hex>.txt`, bytes equal to the pin — and for nothing
  else: any other `.txt`, a changed text or a misplaced one is scanned and fails. After a package
  bump: `pnpm design:fonts interior-02 --write`, review, re-cut.
- The catalog BoostChat vendors is `pnpm design:catalog interior-02 --thumbnails > presets.json`
  (`site-design-presets@1`). A preset's `thumbnails.{desktop,mobile}` is a **plain file name** —
  `<presetId>-<version>-{desktop,mobile}.jpg`, no directory — or `null` without `--thumbnails`.
  The JPEGs are vendored under `thumbs/` beside the catalog and pinned in `catalog.sha256` as
  `thumbs/<name>`; BoostChat's reader joins the directory itself and refuses the whole file if a
  name carries a path separator.
