import { z } from "zod";
import type { SectionDeclarations } from "@platform/settings/settings";

/**
 * Shell sections (SHELL area): site-wide SEO switch, header, drawer, bottom tab bar, floater,
 * footer and the 404 page. Every user-visible string is a slot; labels carry a neutral English
 * default, business facts (locations, company rows, legal lines, slogan) have none and are
 * omitted when the site sets no value.
 *
 * Numbered slots stand in for lists (the platform has no list slots):
 *   footer support links   group2Link1 … group2Link4
 *   footer locations       location{1..4}Name / location{1..4}Address, hours{1..3}Label / hours{1..3}Value, locationsNote
 *   footer company rows    company{1..6}Label / company{1..6}Value (+ the business e-mail, from content)
 *   footer legal lines     legal1 … legal3, copyright
 */

const text = (maxLength: number, neutralDefault?: string) =>
  neutralDefault === undefined ? ({ type: "text", maxLength } as const) : ({ type: "text", maxLength, neutralDefault } as const);
const link = { type: "link" } as const;
const media = { type: "media" } as const;

export const shellSections = {
  /** Site-wide search indexing. "noindex" = every page says <meta name="robots" content="noindex">. */
  "site.seo": {
    schema: z.object({ indexing: z.enum(["index", "noindex"]) }).strict(),
    defaults: { indexing: "index" },
    slots: {},
  },
  "site.header": {
    schema: z.object({}).strict(),
    defaults: {},
    slots: {
      navLabel: text(24, "Primary"),
      homeLabel: text(24, "Home"),
      portfolioLabel: text(24, "Projects"),
      serviceLabel: text(24, "Service"),
      aboutLabel: text(24, "About"),
      faqLabel: text(24, "FAQ"),
      contactLabel: text(24, "Contact"),
      /** Two optional coloured cells before the contact cell (> 1280 only): a page of this site, an anchor, mailto: or tel:. */
      linkA: link,
      linkB: link,
      menuLabel: text(24, "Menu"),
      menuOpenLabel: text(24, "Open menu"),
      menuCloseLabel: text(24, "Close menu"),
      /** ≤ 640 sub-page bar: the back link's accessible name. */
      backLabel: text(24, "Back"),
    },
  },
  /** The ≤ 1280 drawer: a slogan block (no value = no block) and grouped link lists. */
  "site.menu": {
    schema: z.object({}).strict(),
    defaults: {},
    slots: {
      slogan: { type: "richText", maxParagraphs: 3, maxParagraphLength: 80 },
      /** group 1 = the site's pages (route-driven); group 2 = support pages; group 3 = the footer's support link slots */
      group1Label: text(24, "Menu"),
      group2Label: text(24, "Support"),
      group3Label: text(24, "More"),
    },
  },
  /** The ≤ 640 bottom tab bar: up to five route-driven links, icon over label. */
  "site.tabbar": {
    schema: z.object({}).strict(),
    defaults: {},
    slots: {
      navLabel: text(24, "Quick menu"),
      homeLabel: text(12, "Home"),
      portfolioLabel: text(12, "Projects"),
      serviceLabel: text(12, "Service"),
      aboutLabel: text(12, "About"),
      faqLabel: text(12, "FAQ"),
      contactLabel: text(12, "Contact"),
    },
  },
  /**
   * Fixed bottom-right controls: to-top (always) and a contact link (when allowed and the contact route exists).
   * `externalWidget` (optional) declares that a third-party fixed widget the site loads (its scripts.json)
   * occupies the bottom-right corner: the largest box its CLOSED launcher can take, in CSS px from the
   * viewport's right / bottom edges. The root layout hands the four numbers to CSS (`html[data-ext-widget]`,
   * --i2-ext-w / -h / -right / -bottom) and the floater, the ≤ 640 tab bar and the full-height hero's control
   * row keep clear of that box. Absent = no such widget (the default); the Template knows no vendor.
   */
  "site.floater": {
    schema: z
      .object({
        contact: z.boolean(),
        externalWidget: z
          .object({
            width: z.number().int().positive().max(200),
            height: z.number().int().positive().max(200),
            right: z.number().int().min(0).max(200),
            bottom: z.number().int().min(0).max(200),
          })
          .strict()
          .optional(),
      })
      .strict(),
    defaults: { contact: true },
    slots: {
      topLabel: text(24, "Back to top"),
      contactLabel: text(24, "Contact"),
    },
  },
  "site.footer": {
    schema: z.object({}).strict(),
    defaults: {},
    slots: {
      // (a) CTA band — left half (accent) → contact route; right half (over ctaMedia) → portfolio route
      ctaLabel: text(40),
      ctaTitle: text(80),
      ctaText: text(160),
      ctaButtonLabel: text(32, "Contact"),
      ctaMark: media,
      showcaseLabel: text(40),
      showcaseTitle: text(80),
      showcaseText: text(160),
      showcaseButtonLabel: text(32, "View projects"),
      showcaseMedia: media,
      // (b) dark block
      logoMark: media,
      group1Label: text(24, "Menu"),
      group2Label: text(24, "Support"),
      group2Link1: link,
      group2Link2: link,
      group2Link3: link,
      group2Link4: link,
      locationsLabel: text(24, "Locations"),
      location1Name: text(40),
      location1Address: text(120),
      location2Name: text(40),
      location2Address: text(120),
      location3Name: text(40),
      location3Address: text(120),
      location4Name: text(40),
      location4Address: text(120),
      hours1Label: text(40),
      hours1Value: text(80),
      hours2Label: text(40),
      hours2Value: text(80),
      hours3Label: text(40),
      hours3Value: text(80),
      locationsNote: text(160),
      companyLabel: text(24, "Company"),
      company1Label: text(24),
      company1Value: text(120),
      company2Label: text(24),
      company2Value: text(120),
      company3Label: text(24),
      company3Value: text(120),
      company4Label: text(24),
      company4Value: text(120),
      company5Label: text(24),
      company5Value: text(120),
      company6Label: text(24),
      company6Value: text(120),
      emailLabel: text(24, "Email"),
      // (c) legal
      legal1: text(200),
      legal2: text(200),
      legal3: text(200),
      copyright: text(120),
    },
  },
  "site.not-found": {
    schema: z.object({}).strict(),
    defaults: {},
    slots: {
      title: text(60, "Page not found"),
      message: text(160, "The page you are looking for does not exist or has moved."),
      homeLabel: text(32, "Back to home"),
    },
  },
} satisfies SectionDeclarations;
