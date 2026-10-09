import { z } from "zod";
import type { SectionDeclarations } from "@platform/settings/settings";

/**
 * Shell sections (SHELL area): site-wide SEO switch, header (top bar + main bar + the narrow-screen
 * bar and its drawer), the fixed corner control, footer and the 404 page. Every user-visible string
 * is a slot; control labels carry a neutral English default, business facts (tagline, phone lines,
 * company rows, legal lines) have none and are omitted when the site sets no value.
 *
 * Numbered slots stand in for lists (the platform has no list slots):
 *   header top bar     topLinkA, topLinkB
 *   footer phone lines callA, callB (link slots: label = the number as shown, href = "tel:…")
 *   footer info rows   info{1..6}Label / info{1..6}Value (+ the business e-mail, from content)
 *   footer notes       note1, note2, copyright
 */

const text = (maxLength: number, neutralDefault?: string) =>
  neutralDefault === undefined ? ({ type: "text", maxLength } as const) : ({ type: "text", maxLength, neutralDefault } as const);
const link = { type: "link" } as const;

export const shellSections = {
  /**
   * Set by the SITE BUILDER, never authored in a site's settings: true = this build is the SHELL of
   * an incrementally published site (runtime/shell.ts) — the portfolio is not in the build, its
   * sections are runtime slots and its pages are composed at publish time.
   */
  "site.portfolio": {
    schema: z.object({ shell: z.boolean() }).strict(),
    defaults: { shell: false },
    slots: {},
  },
  /** Site-wide search indexing. "noindex" = every page says <meta name="robots" content="noindex">. */
  "site.seo": {
    schema: z.object({ indexing: z.enum(["index", "noindex"]) }).strict(),
    defaults: { indexing: "index" },
    slots: {},
  },
  /**
   * Wide (> 768): a thin top bar (tagline block left, up to two text links right) over the main bar
   * (logo left, page links right). Narrow (≤ 768): one bar with the logo and the menu button; the
   * button opens the drawer (a panel sliding in from the left with a home link, a close button and
   * the same page links). The header is part of the page flow: it scrolls away with the page.
   */
  "site.header": {
    schema: z.object({}).strict(),
    defaults: {},
    slots: {
      /** Top bar, left block (wide only). No value = no block. */
      tagline: text(60),
      /** Top bar, right links (wide only): a page of this site, an anchor, mailto: or tel:. */
      topLinkA: link,
      topLinkB: link,
      navLabel: text(24, "Primary"),
      homeLabel: text(24, "Home"),
      aboutLabel: text(24, "About"),
      portfolioLabel: text(24, "Projects"),
      serviceLabel: text(24, "Service"),
      contactLabel: text(24, "Contact"),
      faqLabel: text(24, "FAQ"),
      menuLabel: text(24, "Menu"),
      menuOpenLabel: text(24, "Open menu"),
      menuCloseLabel: text(24, "Close menu"),
    },
  },
  /**
   * The fixed bottom-right corner.
   *   toTop           true = a small round "back to top" button appears once the page is scrolled
   *                   (false, the default = no button: the page has no fixed control of its own).
   *   externalWidget  (optional) declares that a third-party fixed widget the site loads (its
   *                   scripts.json) occupies the bottom-right corner: the largest box its CLOSED
   *                   launcher can take, in CSS px from the viewport's right / bottom edges. The root
   *                   layout hands the four numbers to CSS (`html[data-ext-widget]`, --i3-ext-w / -h /
   *                   -right / -bottom); the to-top button then sits above that box and the footer
   *                   keeps its last lines clear of it. Absent = no such widget; the Template knows
   *                   no vendor.
   */
  "site.floater": {
    schema: z
      .object({
        toTop: z.boolean(),
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
    defaults: { toTop: false },
    slots: {
      topLabel: text(24, "Back to top"),
    },
  },
  /**
   * Wide: the info block on the left (rows on one paragraph, then notes and the copyright line) and
   * the phone block on the right behind a hairline; narrow: centred, the phone block moves above
   * the info block with its label. Every empty row / block is omitted.
   */
  "site.footer": {
    schema: z.object({}).strict(),
    defaults: {},
    slots: {
      callLabel: text(24),
      callA: link,
      callB: link,
      info1Label: text(24),
      info1Value: text(160),
      info2Label: text(24),
      info2Value: text(160),
      info3Label: text(24),
      info3Value: text(160),
      info4Label: text(24),
      info4Value: text(160),
      info5Label: text(24),
      info5Value: text(160),
      info6Label: text(24),
      info6Value: text(160),
      emailLabel: text(24, "Email"),
      note1: text(200),
      note2: text(200),
      copyright: text(160),
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
