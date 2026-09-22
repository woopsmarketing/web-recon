# 07 — Slot Model and Template Mapper (Parts G + H · 슬롯 모델 / 템플릿 매퍼)

## Decisions

1. A **Slot** (content slot, "copy slot") is a **named, typed, short-form content placeholder declared
   by a section**. Examples: a section title, an intro paragraph, a CTA label + link, a section image or
   video. A typical section declares 0–6 slots. Slots never correspond to DOM elements, CSS properties or
   collection items.
2. **No separate Template Mapper layer.** Every mapping the prompt describes is already one of three
   things. None of them needs a layer.
   - a **settings → query** conversion (one shared helper, `06`)
   - **item → props** rendering (component code)
   - a **template-switch transfer** function (NEXT, `12` Scenario 5)

## What is a slot and what is not

| Thing | Example | Is it a slot? | Lives in | Validated by | Transfers to another template? |
|---|---|---|---|---|---|
| **Content slot** | "대표 시공 사례" section title; experience-section body + CTA; section video | **Yes** | Site settings doc under `copy` (per site × templateRef, `08`) | Slot schema (type, maxLength) + reused validator + truth rules | By standard section kind + slot name (NEXT) |
| **Customer content** | business phone; project #174; reviews; hero banners | No — content | Content storage (`03`, `09`) | Content model schemas | Always (template-independent) |
| **Collection query config** | `limit: 4`, `selection: {mode: "category", categories: ["30py"]}` | No — setting | Site settings doc under `settings` | Section settings schema (closed enums/ranges) | Only if the target section kind + value is allowed |
| **Site setting (non-query)** | section `enabled`, `variant: "grid"`, route `enabled`, `pageSize`, nav labels | No — setting | Site settings doc | Same | Partly (enabled flags by kind; variants don't) |
| **Theme token** | primary color, radius, font family | No — theme | Site Instance `theme` (theme-contract-v1 file, `08`) | Reused contract + contrast math | Yes, then re-checked for contrast |
| **Layout structure** | 3-column grid, carousel behavior, section order, breakpoints | No — code | Template code | Fidelity + regression QA | n/a (belongs to the template) |

Settings and copy for one section may share a document for storage convenience. They stay distinct
concepts because their validation (enums vs language), editors (knobs vs text) and transfer rules differ.

## Slot types (closed, small)

| Type | Shape | Notes |
|---|---|---|
| `text` | string, `maxLength`, single/multi-line | Reused HTML-injection/control-char validation. Truth-mode checks for fact-shaped claims |
| `richText` | short markdown (no raw HTML) | For intro/body paragraphs |
| `link` | `{label, target: Link}` (`03`) | Reused URL scheme allowlist. Internal targets use route keys/items, not paths |
| `media` | `ResponsiveMedia` | Asset registry refs (`09`); `alt` required for non-decorative media at publish |

There is no `number`, `color`, `html` or `json` slot type. Numbers belong in business facts (with basis)
or settings. Colors belong in theme tokens.

Copy-slot values may be drafted by a generator. They then pass the extracted truth-mode rules and stay
marked in `generatedCopy` until a person approves them; while marked, indexable production is refused.
Media slots are never generated (`03` generation rules, `08`).

## Fallback chain (implemented in component code, declared in the slot schema)

```
site copy value
  → content binding written in code        e.g. hero title ← business.tagline
  → template neutral UI default            ONLY for UI labels ("더 보기", "상담 신청"); never a claim, number, testimonial
  → hide the element                       if slot is optional
  → needs-input                            if slot is required: preview marker, readiness INPUTS_REQUIRED
```

This reuses the existing honesty doctrine (`01` §5.3, §7.1): an unknown value is shown as unknown, never
invented.

## Granularity rules

- **Section-level, not element-level.** If a value varies only because of DOM structure (two twin
  headings, an `aria-label` copy), the component derives it from one slot. The legacy "paint-twin"
  problem disappears.
- **No CSS property slots.** Brandable paint and type values are theme tokens. Everything else is code or
  a declared variant.
- **No per-item slots.** Items come from collections. A "list of 3 short feature bullets that belongs to
  this section only" may be one bounded `text[]` slot, capped by the template. Anything open-ended or
  growing is a collection.
- **A repeated section instance is fixed by the template.** Apartmentary's two project carousels are two
  declared instances (`home.projects-a`, `home.projects-b`), each disableable. A third needs a template
  change, not site config. This avoids the page-builder slope (`15` P-list).

## The explicit questions

| Question | Answer |
|---|---|
| Should the Hero title be a Slot? | It depends on the hero's data. **Carousel hero (Apartmentary):** each slide's headline and subheadline are `banners` content (A8 §3.1: CMS-managed `mainBanners`), not slots; the section may keep optional CTA/aria slots. **Static hero (other templates):** `title` is a text slot with fallback `business.tagline` |
| Should individual CSS properties be Slots? | **No.** Theme tokens for brandable values (reused contract), code for layout, a small `variant` enum where a real design alternative exists |
| Portfolio collection: one Slot or many item Slots? | **Neither.** One section = copy slots (`title`, `moreLabel`) + settings (`limit`, `selection`). Items are collection content rendered by code. 173 or 174 projects changes zero slots |
| How do optional sections interact with Slots? | `enabled: false` → the section's slots are ignored (not validated, not required). Enabled + collection empty → `empty` behavior (`06`). Enabled + required slot missing → needs-input in preview, readiness error for indexable |
| What of Task 29 slotization remains useful? | SiteIdentity schema and provenance/identity split; the pack↔template hard identity check (now settings ↔ `templateRef`); the neutrality idea (fixture regression); "theme = paint-safe closed tokens"; source leak gating of realistic packs (brand isolation of fixture sites). Repeater and region detection may help authoring (UNKNOWN). DOM bindings, hashed slot ids, prototype cloning and full-app render copies are superseded (`02`) |

## Standard section kinds and slot names (vertical vocabulary)

Seeded from the legacy 14 slot roles (`01` §2.1, the one cross-site axis that was never used for
transfer). The vocabulary is small and closed per vertical, and it grows only when a template needs it:

- **Section kinds used by `interior-01` v1 (`13`):** `header`, `hero-carousel`, `intro`,
  `projects-showcase`, `reviews`, `image-band`, `footer`, `contact-cta`. Others are added only when a
  template needs them, e.g. `hero-static`, `faq-list`, `services-list`.
- **Slot names used by v1:** `title`, `body`, `cta`, `media`, `moreLabel`. Others are added on need, e.g.
  `eyebrow`, `subtitle`, `secondaryCta`.

Consumers:

- template-switch transfer (NEXT)
- catalog capability summary
- future CMS grouping

MVP only needs the fields to exist on declarations. Transfer logic waits for the second template.

## Template Mapper — evaluation (Part H)

The prompt's example: one customer with 173 projects.

| Template | Homepage behavior | What actually implements it |
|---|---|---|
| A | featured 4 | `home.projects` defaults `{selection: featured, limit: 4}` → `selectionToQuery` → reader → cards |
| B | latest 8 | Same section kind, defaults `{selection: latest, limit: 8}` |
| C | Residential 4 + Commercial 4 | Two section instances, each `{selection: category, categories: [residential\|commercial], limit: 4}` |

All three read the **same** `projects` collection. The per-template difference is **defaults in
templates** plus **overrides in site settings**. The item-to-card shaping (price label "평당 …", cover
image choice, detail href) is 5–20 lines of component code that must stay close to the markup that uses
it.

A dedicated mapper layer, meaning declarative mapping config from content to template view models, would:

1. duplicate TypeScript component props with a second, config-driven binding system
2. need its own validation, debugging and documentation, which a solo developer pays for forever
3. drift toward the forbidden "React in configuration" (`04`)
4. add nothing to storage independence, which the reader already provides (`09`)

**Reconsider only if** evidence shows either:

- the same view models must feed multiple render targets (email digest, native app, AMP), or
- non-developers must bind content to templates without code.

Neither is in scope.

Narrow mapping functions that **do** exist, and where they live:

| Function | Location | Status |
|---|---|---|
| `selectionToQuery(section, effectiveSettings)` | platform package | MVP |
| `mergeEffectiveSettings(defaults, overrides)` + validation | platform package (`08`) | MVP |
| `transferSettings(fromTemplate, toTemplate, siteSettings) → {carried, adjusted, dropped}` | platform package | NEXT (second template) |
| Reference fixture builder: preservation evidence (static copy + clone replay's synthetic items) → private fixture with `origin: "reference-fixture"` | private authoring tool | MVP Slice 5 (`04`, `14`) |
| Source-site data → content-model importer (customer's own site, with consent) | separate tool | DEFERRED |
