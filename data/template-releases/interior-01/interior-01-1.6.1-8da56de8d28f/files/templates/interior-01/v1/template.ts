import { z } from "zod";
import { defineTemplate } from "@platform/site/template-manifest";
import { ProjectSelectionSchema } from "@platform/settings/settings";
import { AREA_SCALE_IDS, PRICE_SCALE_IDS, PROJECT_FILTER_GROUPS } from "@platform/content/project-filter";
import defaultTheme from "./theme.default.json";

/** Portfolio list page size (the observed design shows 30 per page: 10 rows × 3 columns). */
export const PORTFOLIO_PAGE_SIZE = 30;

/**
 * interior-01 v1 — first authored production Recon Template.
 * Every per-site variation is declared here; anything not declared is code.
 *   settings → enabled / limit / selection (behaviour)
 *   slots    → section-level copy (presentation text), with fallback chain
 *   routes   → which content generates which App Router pages (route plan)
 *
 * 1.1.0 (Step 4): portfolio list (/portfolio, /portfolio/page/[n]) + project detail
 * (/portfolio/[slug]); home cards link to details. Additive: every 1.0.0 site's
 * settings/slots/content documents stay valid.
 *
 * 1.2.0 (Step 4.1): portfolio filters/search/sort on /portfolio — client-side over a
 * compact build-time index, semantics in @platform/content/project-filter (never in
 * React). Additive: every 1.1.0 site document stays valid.
 *
 * 1.3.0 (Step 5): full homepage — hero · intro · projects A · projects B · reviews ·
 * image band (+ floating contact CTA). Order is Template code (app/page.tsx), never a
 * setting. Projects A and B read the SAME projects collection through two declared
 * selections; hero slides come from the PROVISIONAL banners collection; reviews are
 * optional content. Additive: every 1.2.0 site document stays valid.
 *
 * 1.3.1 (Whole-site Visual / UX Polish): presentation only — mobile footer stack, the
 * viewport-fixed bottom-right floating seat, reviews/showcase bar only when the track
 * scrolls, portfolio title on its banner, shared rhythm. No content, setting or slot
 * change: every 1.3.0 site document stays valid.
 *
 * 1.4.0 (Step 5.2, Template finalization): the floating contact CTA is site-wide (SiteFooter
 * renders it on every page, same seat, same on/off + destination rule), and a project area
 * may state its basis (`area.basis`: supply | exclusive | unknown; absent = unknown).
 * Additive: no setting or slot change; every 1.3.1 site document stays valid.
 *
 * 1.4.1 (Pre-Demo tiny polish): the detail photo strip (< 1281) gets previous / next arrows
 * (one photo seat per press, hero arrow look, swipe + counter unchanged, a room opens on
 * photo 1, no visible scrollbar), and a Korean-locale KRW-per-pyeong price reads "평당 290만 원"
 * (display only; every other locale / currency / unit keeps the generic form). Additive: two
 * optional portfolio.detail slots with neutral defaults; every 1.4.0 site document stays valid.
 *
 * 1.4.2 (Pre-Demo polish 2): the home hero arrows show at every width (below 900 they sit in
 * the pager row, clear of the copy; one slide still has none); a detail gallery with more than
 * one room opens on a new first tab with every photo of the project; any gallery photo opens a
 * large-photo viewer (modal, arrows / keys / swipe, room badge, n / N); the footer can carry a
 * small site notice. Additive: three optional portfolio.detail slots with neutral defaults and
 * one optional site.footer slot with none (no value = no notice); every 1.4.1 site document
 * stays valid.
 *
 * 1.5.0 (Information architecture): three new static pages — /about (the studio's point of
 * view: lead, body, up to six principles, one photo), /3d-portfolio (a placeholder for a
 * feature in preparation) and /contact (an inquiry form that composes an e-mail in the
 * visitor's own mail app: no backend, nothing is sent or stored by the site). The header nav
 * is portfolio · 3D portfolio · about · the contact pill (now → /contact); below 900 px it
 * collapses into a hamburger menu (native modal <dialog>). Every contact call to action
 * (header pill, floating seat, detail CTA, hero contact slides) now opens /contact when the
 * site has a contact channel (business email); without one there is still no CTA.
 * Additive: new sections and header slots all optional or with neutral defaults; every 1.4.2
 * site document stays valid. The three pages are generated for every site (the route plan
 * has no per-site switch for a static page).
 *
 * 1.5.1 (IA review fixes): the inquiry form caps its fields (message 500 characters) and never
 * hands the mail app a link longer than a mail handler reliably opens: a too-long inquiry shows
 * the business address and the composed text to copy instead (nothing opened, nothing claimed);
 * message line breaks are CRLF; the status line is announced on every press. The < 900 px menu,
 * closed by a widening viewport, returns focus to a visible header control. A site without a
 * contact channel no longer lists /contact in its sitemap (the page itself is still generated).
 * Additive: three optional contact.page slots with neutral defaults; every 1.5.0 site document
 * stays valid.
 *
 * 1.5.2 (Public demo SEO): the homepage gets its own canonical, and every page that has a
 * canonical (a site with a public origin) also gets OpenGraph — title, description and url from
 * the same values as its <title>, description and canonical, plus the site's share image (the
 * first home hero slide) when there is one. A new site-wide setting `site.seo.indexing`
 * ("index" | "noindex", default "index" = the 1.5.1 output) puts <meta name="robots"
 * content="noindex"> on every page of a site that must not be indexed (e.g. a fictional demo);
 * robots.txt and the sitemap are unchanged, so crawlers can still read it. The home hero's data
 * function moved to sections/homeHeroData.ts (no output change) so that page metadata does not
 * pull the client carousel into every page. Additive: one new settings section with a default
 * that keeps the 1.5.1 behaviour; every 1.5.1 site document stays valid.
 *
 * 1.6.0 (V0.2 built-space annex — authorable content model): the release runtime's content model
 * (platform/content/schema.ts, a Template Release source) gains the five AUTHORED, OPTIONAL
 * ProjectSchema fields of the Integration Contract V0.2 built-space annex — `projectType`
 * (full_remodel | partial_remodel), `propertyType`, `workScopeIds` (the 26 canonical space/work
 * ids, a non-empty unique set), `totalPrice` (exact XOR range, never derived from
 * pricePerArea × area) and `styles` — together with their closed vocabularies and the three
 * cross-field invariants INV-28 (a partial_remodel needs a non-empty workScopeIds), INV-29 (a
 * full_remodel needs at least one SPACE scope) and INV-30 (a partial_remodel needs at least one
 * SPACE scope). Absent always means unknown; nothing is inferred from the title, body, `category`,
 * `scope` or a price. The same cut also carried the site head-scripts seam: a site may declare
 * third-party <script> tags in an optional data/sites/<siteId>/scripts.json, validated fail-closed
 * by the platform (platform/site/head-scripts.ts, new; SiteSnapshotSchema.headScripts and
 * SiteContext.headScripts, both new), and app/layout.tsx renders them in the document head after
 * the theme style (app/head-scripts.ts, new) — a renderer change; a site without scripts.json gets
 * no script element. No route, section, slot or settings change. Minor, not patch, because the
 * release's authorable surface grew. Additive: every field and the scripts document are optional
 * and every 1.5.2 site document stays valid — this cut exists so that the V0.2 fields CAN be
 * authored in data/sites/**, which 1.5.2's frozen, strict ProjectSchema would reject.
 * (History corrected at 1.6.1: the stored 1.6.0 release's own copy of this paragraph omits the
 * head-scripts seam, says "no renderer … change", which was false — app/layout.tsx changed — and
 * calls the output "byte-identical to 1.5.2", which was never verified for the release as cut.
 * Stored releases are immutable, so the correction lives here.)
 *
 * 1.6.1 (Portfolio V0.2 detail facts): the detail page's area row names the basis the project
 * states — `area.basis` supply → the new slot areaSupplyLabel, exclusive → areaExclusiveLabel,
 * absent or "unknown" → areaLabel, which is now the label of an area with no stated basis. Before
 * 1.6.1 every area used the one areaLabel, so a site whose areaLabel says 공급면적 labelled an
 * exclusive (전용) area 공급면적. The figure is still rendered as authored: no unit conversion and
 * never a supply ↔ exclusive conversion. The V0.2 structured facts authorable since 1.6.0 get a
 * detail row each, only when the project authors the field: projectType (projectTypeLabel; full /
 * partial remodel), workScopeIds (workScopesLabel; the canonical ids in authored order, presented
 * as the main work — the set is never claimed to be exhaustive) and totalPrice (totalPriceLabel;
 * the whole case's total, exact or range, never divided by the area and never presented as the
 * price of one room or trade, or as a quote). The words for the closed projectType / work-scope
 * vocabularies and the Korean KRW total notation ("5,000만 원", "1억 2,500만 원") are Template code
 * (lib/vocabulary.ts, lib/format.ts), like the unit symbols; the row labels are slots. Nothing is
 * inferred from the title, the category, the display `scope` text or a price. Patch: new rendering
 * of already-authorable data, five optional portfolio.detail slots with neutral defaults; no
 * content-model, route, section or settings change; every 1.6.0 site document stays valid, and a
 * project that states no area basis and authors none of the V0.2 fields gets the same fact rows
 * as in 1.6.0.
 */
export const template = defineTemplate({
  id: "interior-01",
  version: "1.6.1",
  vertical: "interior",
  routes: [
    { key: "home", path: "/" },
    { key: "portfolio.index", path: "/portfolio", list: { collection: "projects", pageSize: PORTFOLIO_PAGE_SIZE, page: "first" } },
    { key: "portfolio.page", path: "/portfolio/page/[n]", list: { collection: "projects", pageSize: PORTFOLIO_PAGE_SIZE, page: "rest" } },
    { key: "portfolio.detail", path: "/portfolio/[slug]", item: { collection: "projects" } },
    // 1.5.0: static pages, generated for every site
    { key: "portfolio3d", path: "/3d-portfolio" },
    { key: "about", path: "/about" },
    { key: "contact", path: "/contact" },
  ],
  sections: {
    "site.header": {
      schema: z.object({}).strict(),
      defaults: {},
      slots: {
        homeLinkLabel: { type: "text", maxLength: 24, neutralDefault: "Home" },
        projectsNavLabel: { type: "text", maxLength: 24, neutralDefault: "Projects" },
        contactLabel: { type: "text", maxLength: 24, neutralDefault: "Contact" },
        /** 1.5.0: nav items of the new pages + the < 900 px menu. Additive, neutral defaults. */
        portfolio3dNavLabel: { type: "text", maxLength: 24, neutralDefault: "3D portfolio" },
        aboutNavLabel: { type: "text", maxLength: 24, neutralDefault: "About" },
        menuLabel: { type: "text", maxLength: 24, neutralDefault: "Menu" },
        menuOpenLabel: { type: "text", maxLength: 24, neutralDefault: "Open menu" },
        menuCloseLabel: { type: "text", maxLength: 24, neutralDefault: "Close menu" },
      },
    },
    // ---- 1.5.0 pages. Copy is slots; every page is generated for every site.
    "about.page": {
      schema: z.object({}).strict(),
      defaults: {},
      slots: {
        title: { type: "text", maxLength: 40, neutralDefault: "About" },
        /** falls back to the business summary */
        lead: { type: "richText", maxParagraphs: 2, maxParagraphLength: 280, binding: "business.summary" },
        body: { type: "richText", maxParagraphs: 4, maxParagraphLength: 400 },
        media: { type: "media" },
        pointsTitle: { type: "text", maxLength: 40 },
        /** Principles: a point renders only when its title has a value (no neutral principles). */
        point1Title: { type: "text", maxLength: 32 },
        point1Body: { type: "text", maxLength: 200 },
        point2Title: { type: "text", maxLength: 32 },
        point2Body: { type: "text", maxLength: 200 },
        point3Title: { type: "text", maxLength: 32 },
        point3Body: { type: "text", maxLength: 200 },
        point4Title: { type: "text", maxLength: 32 },
        point4Body: { type: "text", maxLength: 200 },
        point5Title: { type: "text", maxLength: 32 },
        point5Body: { type: "text", maxLength: 200 },
        point6Title: { type: "text", maxLength: 32 },
        point6Body: { type: "text", maxLength: 200 },
        ctaPrompt: { type: "text", maxLength: 80 },
        ctaLabel: { type: "text", maxLength: 32, neutralDefault: "Get in touch" },
        portfolioLabel: { type: "text", maxLength: 32, neutralDefault: "View projects" },
      },
    },
    "portfolio3d.page": {
      /** A placeholder for a feature in preparation: a title, one line, a way back. */
      schema: z.object({}).strict(),
      defaults: {},
      slots: {
        title: { type: "text", maxLength: 40, neutralDefault: "3D portfolio" },
        body: { type: "text", maxLength: 200, neutralDefault: "A 3D portfolio is in preparation." },
        portfolioLabel: { type: "text", maxLength: 32, neutralDefault: "View projects" },
      },
    },
    "contact.page": {
      /**
       * The inquiry form composes an e-mail to the business address in the visitor's mail app
       * (mailto:). There is no backend: the site never sends, stores or confirms anything, and
       * says so. No business email = no form (no channel is invented).
       */
      schema: z.object({}).strict(),
      defaults: {},
      slots: {
        title: { type: "text", maxLength: 40, neutralDefault: "Contact" },
        lead: { type: "richText", maxParagraphs: 2, maxParagraphLength: 280 },
        nameLabel: { type: "text", maxLength: 24, neutralDefault: "Name" },
        phoneLabel: { type: "text", maxLength: 24, neutralDefault: "Phone" },
        regionLabel: { type: "text", maxLength: 24, neutralDefault: "Area / city" },
        areaLabel: { type: "text", maxLength: 24, neutralDefault: "Home size" },
        workTypeLabel: { type: "text", maxLength: 24, neutralDefault: "Type of work" },
        /** One option per paragraph → a select; absent → a free text field. */
        workTypeOptions: { type: "richText", maxParagraphs: 8, maxParagraphLength: 32 },
        selectPlaceholder: { type: "text", maxLength: 24, neutralDefault: "Select" },
        scheduleLabel: { type: "text", maxLength: 24, neutralDefault: "Preferred timing" },
        messageLabel: { type: "text", maxLength: 24, neutralDefault: "Message" },
        requiredNote: { type: "text", maxLength: 40, neutralDefault: "* Required" },
        submitLabel: { type: "text", maxLength: 32, neutralDefault: "Write e-mail" },
        /** Shown above the button: how the form works (no online submission). */
        notice: { type: "text", maxLength: 200, neutralDefault: "Online submission is not available. The button opens your mail app with these details filled in." },
        /** Shown after the button was pressed; "{email}" = the business address. Never a success message. */
        afterSubmit: {
          type: "text",
          maxLength: 240,
          neutralDefault: "Check the e-mail in your mail app and send it from there — nothing has been sent yet. If no mail app opened, write to {email}.",
        },
        /** The e-mail's subject; "{name}" = the name field. */
        mailSubject: { type: "text", maxLength: 40, neutralDefault: "Inquiry from {name}" },
        emailLabel: { type: "text", maxLength: 24, neutralDefault: "Email" },
        unavailable: { type: "text", maxLength: 160, neutralDefault: "Contact details are not available yet." },
        /**
         * 1.5.1: an inquiry too long for a mail link — nothing is opened; "{email}" = the business
         * address. The composed text is shown to copy (textLabel), with a button selecting it.
         */
        tooLong: {
          type: "text",
          maxLength: 240,
          neutralDefault: "This inquiry is too long to open in your mail app. Nothing has been sent: copy the text below and send it to {email}.",
        },
        tooLongTextLabel: { type: "text", maxLength: 40, neutralDefault: "Inquiry text" },
        selectTextLabel: { type: "text", maxLength: 24, neutralDefault: "Select text" },
      },
    },
    // ---- homepage (1.3.0). Section order = app/page.tsx. Control labels are UI vocabulary
    // (per-section, like the portfolio pager's; slot-vs-localization review deferred to Template 2).
    "home.hero": {
      /** Slides are content (banners collection, max 8), never slots. */
      schema: z.object({ enabled: z.boolean(), autoplay: z.boolean() }).strict(),
      defaults: { enabled: true, autoplay: true },
      slots: {
        label: { type: "text", maxLength: 40, neutralDefault: "Highlights" },
        previousLabel: { type: "text", maxLength: 24, neutralDefault: "Previous slide" },
        nextLabel: { type: "text", maxLength: 24, neutralDefault: "Next slide" },
        pauseLabel: { type: "text", maxLength: 24, neutralDefault: "Pause slideshow" },
        playLabel: { type: "text", maxLength: 24, neutralDefault: "Play slideshow" },
        /** "{n}" = slide number, "{total}" = number of slides. */
        slideLabelFormat: { type: "text", maxLength: 40, neutralDefault: "Slide {n} of {total}" },
      },
    },
    "home.intro": {
      /** No neutral title/body: an intro is the site's own words → no title = no section. */
      schema: z.object({ enabled: z.boolean() }).strict(),
      defaults: { enabled: true },
      slots: {
        title: { type: "text", maxLength: 80 },
        body: { type: "richText", maxParagraphs: 3, maxParagraphLength: 400 },
        /** Operator-chosen destination (a page of this site, an on-page anchor, mailto: or tel:). */
        link: { type: "link" },
        media: { type: "media" },
      },
    },
    "home.projects-a": {
      schema: z
        .object({
          enabled: z.boolean(),
          limit: z.number().int().min(1).max(24),
          selection: ProjectSelectionSchema,
        })
        .strict(),
      defaults: { enabled: true, limit: 8, selection: { mode: "latest" } },
      slots: {
        title: { type: "text", maxLength: 40, neutralDefault: "Selected projects" },
        description: { type: "richText", maxParagraphs: 2, maxParagraphLength: 240 },
        /** "view all" label; its destination is the generated /portfolio route (never site data). */
        moreLabel: { type: "text", maxLength: 32, neutralDefault: "View all projects" },
        previousLabel: { type: "text", maxLength: 24, neutralDefault: "Previous projects" },
        nextLabel: { type: "text", maxLength: 24, neutralDefault: "Next projects" },
      },
    },
    "home.projects-b": {
      /**
       * A second showcase over the SAME projects collection — a different declared
       * selection, never a second collection or a placement flag. Off by default: without a
       * site-chosen selection it could only repeat projects A.
       */
      schema: z
        .object({
          enabled: z.boolean(),
          limit: z.number().int().min(1).max(24),
          selection: ProjectSelectionSchema,
        })
        .strict(),
      defaults: { enabled: false, limit: 8, selection: { mode: "latest" } },
      slots: {
        title: { type: "text", maxLength: 40, neutralDefault: "More projects" },
        description: { type: "richText", maxParagraphs: 2, maxParagraphLength: 240 },
        moreLabel: { type: "text", maxLength: 32, neutralDefault: "View all projects" },
        previousLabel: { type: "text", maxLength: 24, neutralDefault: "Previous projects" },
        nextLabel: { type: "text", maxLength: 24, neutralDefault: "Next projects" },
      },
    },
    "home.reviews": {
      /** Reviews are content (reviews collection, stored order); none published = no section. */
      schema: z.object({ enabled: z.boolean(), limit: z.number().int().min(1).max(12) }).strict(),
      defaults: { enabled: true, limit: 6 },
      slots: {
        title: { type: "text", maxLength: 40, neutralDefault: "Client reviews" },
        media: { type: "media" },
        previousLabel: { type: "text", maxLength: 24, neutralDefault: "Previous reviews" },
        nextLabel: { type: "text", maxLength: 24, neutralDefault: "Next reviews" },
      },
    },
    "home.image-band": {
      /** Full-width closing image; no media = no section. */
      schema: z.object({}).strict(),
      defaults: {},
      slots: {
        media: { type: "media" },
      },
    },
    "site.floating-cta": {
      /**
       * Fixed contact button on EVERY page (1.4.0; homepage-only before). Destination = the
       * business contact (email today); no destination = no button. Future seam: a chat
       * launcher takes the same seat and replaces the href with an action.
       */
      schema: z.object({ enabled: z.boolean() }).strict(),
      defaults: { enabled: true },
      slots: {
        label: { type: "text", maxLength: 24, neutralDefault: "Contact" },
      },
    },
    "portfolio.index": {
      /**
       * Filters (1.2.0). Bucket definitions are vertical code (project-filter AREA_SCALES /
       * PRICE_SCALES); a site only picks the scale that fits its unit/currency.
       * No default-sort setting: the unfiltered view IS the static crawlable route order.
       */
      schema: z
        .object({
          filtersEnabled: z.boolean(),
          filterGroups: z
            .array(z.enum(PROJECT_FILTER_GROUPS))
            .min(1)
            .max(PROJECT_FILTER_GROUPS.length)
            .refine((g) => new Set(g).size === g.length, { message: "filter groups must be unique" }),
          areaScale: z.enum(AREA_SCALE_IDS),
          /** "none" = no price filter/sort (price buckets are currency-specific; nothing is converted). */
          priceScale: z.enum(["none", ...PRICE_SCALE_IDS]),
        })
        .strict(),
      defaults: { filtersEnabled: true, filterGroups: [...PROJECT_FILTER_GROUPS], areaScale: "m2", priceScale: "none" },
      slots: {
        title: { type: "text", maxLength: 40, neutralDefault: "Projects" },
        description: { type: "richText", maxParagraphs: 2, maxParagraphLength: 240 },
        heroImage: { type: "media" },
        pageLabel: { type: "text", maxLength: 16, neutralDefault: "Page" },
        previousLabel: { type: "text", maxLength: 24, neutralDefault: "Previous page" },
        nextLabel: { type: "text", maxLength: 24, neutralDefault: "Next page" },
        paginationLabel: { type: "text", maxLength: 32, neutralDefault: "Pagination" },
        // ---- filters (1.2.0) ----
        filterLabel: { type: "text", maxLength: 24, neutralDefault: "Filters" },
        searchLabel: { type: "text", maxLength: 40, neutralDefault: "Search projects" },
        searchPlaceholder: { type: "text", maxLength: 60, neutralDefault: "Title, location or keyword" },
        typeLabel: { type: "text", maxLength: 24, neutralDefault: "Type" },
        areaLabel: { type: "text", maxLength: 24, neutralDefault: "Size" },
        styleLabel: { type: "text", maxLength: 24, neutralDefault: "Style" },
        priceLabel: { type: "text", maxLength: 24, neutralDefault: "Price per area" },
        sortLabel: { type: "text", maxLength: 24, neutralDefault: "Sort by" },
        /** Sort option names (UI vocabulary; slot-vs-localization review deferred to Template 2). */
        sortNewest: { type: "text", maxLength: 24, neutralDefault: "Newest" },
        sortOldest: { type: "text", maxLength: 24, neutralDefault: "Oldest" },
        sortAreaDesc: { type: "text", maxLength: 24, neutralDefault: "Largest first" },
        sortAreaAsc: { type: "text", maxLength: 24, neutralDefault: "Smallest first" },
        sortPriceDesc: { type: "text", maxLength: 24, neutralDefault: "Price: high to low" },
        sortPriceAsc: { type: "text", maxLength: 24, neutralDefault: "Price: low to high" },
        resetLabel: { type: "text", maxLength: 24, neutralDefault: "Reset filters" },
        /** "{n}" is replaced by the number of matching projects; `…One` is the n = 1 form. */
        resultCountFormat: { type: "text", maxLength: 32, neutralDefault: "{n} projects" },
        resultCountFormatOne: { type: "text", maxLength: 32, neutralDefault: "{n} project" },
        emptyTitle: { type: "text", maxLength: 60, neutralDefault: "No projects match these filters" },
        emptyBody: { type: "text", maxLength: 160, neutralDefault: "Try removing a filter or searching for something else." },
      },
    },
    "portfolio.detail": {
      schema: z.object({}).strict(),
      defaults: {},
      slots: {
        backLabel: { type: "text", maxLength: 32, neutralDefault: "All projects" },
        roomsLabel: { type: "text", maxLength: 32, neutralDefault: "Rooms" },
        beforeLabel: { type: "text", maxLength: 16, neutralDefault: "Before" },
        afterLabel: { type: "text", maxLength: 16, neutralDefault: "After" },
        showMoreLabel: { type: "text", maxLength: 32, neutralDefault: "Show all photos" },
        showLessLabel: { type: "text", maxLength: 32, neutralDefault: "Show fewer photos" },
        /** 1.4.1: photo-strip arrows (< 1281). Additive: a site without them gets the neutral default. */
        previousPhotoLabel: { type: "text", maxLength: 24, neutralDefault: "Previous photo" },
        nextPhotoLabel: { type: "text", maxLength: 24, neutralDefault: "Next photo" },
        /** 1.4.2: the "every room" tab and the large-photo viewer. Additive, neutral defaults. */
        allRoomsLabel: { type: "text", maxLength: 24, neutralDefault: "All" },
        openPhotoLabel: { type: "text", maxLength: 32, neutralDefault: "View photo" },
        closeViewerLabel: { type: "text", maxLength: 24, neutralDefault: "Close" },
        bodyTitle: { type: "text", maxLength: 40, neutralDefault: "About the project" },
        quoteTitle: { type: "text", maxLength: 40, neutralDefault: "From the client" },
        locationLabel: { type: "text", maxLength: 24, neutralDefault: "Location" },
        /** The label of an area with NO stated basis (absent or "unknown"); 1.6.1: a stated basis uses its own label below. */
        areaLabel: { type: "text", maxLength: 24, neutralDefault: "Size" },
        /** 1.6.1: basis-aware area labels (supply = 공급면적, exclusive = 전용면적). Additive, neutral defaults. */
        areaSupplyLabel: { type: "text", maxLength: 24, neutralDefault: "Supply area" },
        areaExclusiveLabel: { type: "text", maxLength: 24, neutralDefault: "Exclusive area" },
        /** 1.6.1: V0.2 structured facts, each a row only when the project authors the field. Additive, neutral defaults. */
        projectTypeLabel: { type: "text", maxLength: 24, neutralDefault: "Project type" },
        workScopesLabel: { type: "text", maxLength: 24, neutralDefault: "Main work scope" },
        totalPriceLabel: { type: "text", maxLength: 24, neutralDefault: "Total project cost" },
        categoryLabel: { type: "text", maxLength: 24, neutralDefault: "Type" },
        builtYearLabel: { type: "text", maxLength: 24, neutralDefault: "Building completed" },
        scopeLabel: { type: "text", maxLength: 24, neutralDefault: "Scope" },
        periodLabel: { type: "text", maxLength: 24, neutralDefault: "Project period" },
        durationLabel: { type: "text", maxLength: 24, neutralDefault: "Duration" },
        /** "{n}" is replaced by the number of weeks; `durationFormatOne` is the n = 1 form. */
        durationFormat: { type: "text", maxLength: 24, neutralDefault: "{n} weeks" },
        durationFormatOne: { type: "text", maxLength: 24, neutralDefault: "{n} week" },
        keywordsLabel: { type: "text", maxLength: 24, neutralDefault: "Keywords" },
        priceLabel: { type: "text", maxLength: 24, neutralDefault: "Price per area" },
        ctaPrompt: { type: "text", maxLength: 80, neutralDefault: "Planning a similar project?" },
        ctaLabel: { type: "text", maxLength: 32, neutralDefault: "Get in touch" },
      },
    },
    "site.not-found": {
      schema: z.object({}).strict(),
      defaults: {},
      slots: {
        title: { type: "text", maxLength: 60, neutralDefault: "Page not found" },
        message: { type: "text", maxLength: 160, neutralDefault: "The page you are looking for does not exist or has moved." },
        homeLabel: { type: "text", maxLength: 32, neutralDefault: "Back to home" },
      },
    },
    "site.footer": {
      schema: z.object({ showSummary: z.boolean() }).strict(),
      defaults: { showSummary: true },
      slots: {
        summary: { type: "text", maxLength: 280, binding: "business.summary" },
        companyLabel: { type: "text", maxLength: 24, neutralDefault: "Company" },
        emailLabel: { type: "text", maxLength: 24, neutralDefault: "Email" },
        /** 1.4.2: a small note under the business facts (e.g. a demo disclaimer). No value = not rendered. */
        notice: { type: "text", maxLength: 200 },
      },
    },
    /** 1.5.2: site-wide search indexing. "noindex" = every page says <meta name="robots" content="noindex">. */
    "site.seo": {
      schema: z.object({ indexing: z.enum(["index", "noindex"]) }).strict(),
      defaults: { indexing: "index" },
      slots: {},
    },
  },
  theme: {
    consumes: [
      "color.canvas",
      "color.surface.secondary",
      "color.text.primary",
      "color.text.secondary",
      "color.text.muted",
      "color.text.inverse",
      "color.action.primary",
      "color.action.primaryText",
      "color.border.default",
      "decoration.radius.medium",
      "decoration.radius.pill",
      "typography.body",
      "typography.heading",
    ],
    defaults: defaultTheme,
  },
});

export default template;
