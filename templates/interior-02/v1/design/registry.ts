import type { DesignConfig, DesignRegistry, SectionEntry, ThemeTier2, VariantEntry, VariantStatus } from "./contract";
import { status as heroStatus } from "./variants/hero/status";
import { status as showcaseStatus } from "./variants/showcase/status";
import { status as detailStatus } from "./variants/detail/status";
import { status as aboutStatus } from "./variants/about/status";
import { status as servicesStatus } from "./variants/services/status";
import { status as ctaStatus } from "./variants/cta/status";
import { status as headerStatus } from "./variants/header/status";
import { status as footerStatus } from "./variants/footer/status";
import { status as actionBarStatus } from "./variants/action-bar/status";

/**
 * The design registry of interior-02 — the ONE allowlist. Data only (the only imports are the
 * status files of the variant families, which are data too): the manifest, the validator, the
 * platform's preset tooling and the tests all read it; nothing here reaches a component.
 *
 * A site's design document (settings "site.design", design/config.ts) may name only what is
 * listed here. `classic` is today's implementation in sections/**, kept as it is. Every other
 * variant has
 *     design/variants/<family>/<variant>.tsx        the component (`Section`)
 *     design/variants/<family>/<variant>.data.ts    its data function — only the three families
 *                                                   that are rendered through a runtime slot
 *     styles/design/<family>-<variant>.css          its rules, namespaced .ds-<family>-<variant>
 * and a status in design/variants/<family>/status.ts (the family's owner flips it).
 *
 * Adding a section or a variant is a change of THIS file, of design/sections.tsx or
 * design/slots.ts / design/slot-components.ts (the component maps) and of design/styles.ts (the
 * stylesheet list) — one writer (platform/design/README.md, "Asking for a shared change").
 */

const classic = (summary: string): VariantEntry => ({ status: "classic", module: null, data: null, css: null, summary });

function variant(family: string, name: string, status: VariantStatus, summary: string, options: { slot?: boolean; file?: string } = {}): VariantEntry {
  const file = options.file ?? name;
  return {
    status,
    module: `design/variants/${family}/${file}.tsx`,
    data: options.slot ? `design/variants/${family}/${file}.data.ts` : null,
    css: `styles/design/${family === file ? family : `${family}-${file}`}.css`,
    summary,
  };
}

const home = (slot: string | null, variants: Record<string, VariantEntry>): SectionEntry => ({ place: "home", slot, variants });

export const registry: DesignRegistry = {
  templateId: "interior-02",
  sections: {
    // ------------------------------------------------------------ chrome --
    header: {
      place: "chrome",
      slot: null,
      variants: {
        classic: classic("floating card over the hero that becomes a fixed bar; bottom tab bar at ≤ 640"),
        centered: variant("header", "centered", headerStatus.centered, "centred wordmark, navigation split left and right, drawer on narrow screens"),
        conversion: variant("header", "conversion", headerStatus.conversion, "logo left, navigation, consultation pill and phone on the right"),
      },
    },
    footer: {
      place: "chrome",
      slot: null,
      variants: {
        classic: classic("two-half call-to-action band, dark information block, legal lines"),
        minimal: variant("footer", "minimal", footerStatus.minimal, "information block and legal lines only — for a recipe that carries its own cta section"),
      },
    },
    mobileBar: {
      place: "chrome",
      slot: null,
      variants: {
        none: classic("no extra bar (the classic header keeps its own bottom tab bar)"),
        "action-bar": variant("action-bar", "action-bar", actionBarStatus["action-bar"], "fixed bottom bar at ≤ 700: call and consultation"),
      },
    },
    // ------------------------------------------------------- home recipe --
    hero: home("home.hero", {
      classic: classic("full-bleed banner slider"),
      photo: variant("hero", "photo", heroStatus.photo, "one full-bleed photograph with a short line of text", { slot: true }),
      statement: variant("hero", "statement", heroStatus.statement, "a large typographic statement; no photograph needed", { slot: true }),
      split: variant("hero", "split", heroStatus.split, "text and call to action beside a photograph", { slot: true }),
    }),
    showcase: home("home.projects", {
      classic: classic("three-column project card grid"),
      panels: variant("showcase", "panels", showcaseStatus.panels, "large alternating project panels", { slot: true }),
      index: variant("showcase", "index", showcaseStatus.index, "a text index of projects with one preview image", { slot: true }),
      cards: variant("showcase", "cards", showcaseStatus.cards, "project cards with fact chips", { slot: true }),
    }),
    promos: home(null, { classic: classic("promotion tiles") }),
    keywords: home("home.keywords", { classic: classic("keyword chips over a project slider") }),
    about: home(null, {
      classic: classic("the photo band and intro block of the about page"),
      "split-panel": variant("about", "split-panel", aboutStatus["split-panel"], "brand story beside a photograph"),
      manifesto: variant("about", "manifesto", aboutStatus.manifesto, "one large paragraph, no photograph"),
      "statement-photo": variant("about", "statement-photo", aboutStatus["statement-photo"], "a statement above a wide photograph"),
    }),
    services: home(null, {
      classic: classic("principles block and three coloured service tiles"),
      rows: variant("services", "rows", servicesStatus.rows, "hairline-separated service rows"),
      numbered: variant("services", "numbered", servicesStatus.numbered, "numbered service list"),
    }),
    recent: home("home.recent", { classic: classic("recently added projects") }),
    brands: home(null, { classic: classic("partner brand tiles") }),
    showrooms: home(null, { classic: classic("showroom cards") }),
    cta: home(null, {
      classic: classic("the two-half call-to-action band of the classic footer, as a home section"),
      quiet: variant("cta", "quiet", ctaStatus.quiet, "one sentence and a text link"),
      band: variant("cta", "band", ctaStatus.band, "centred band with a filled button"),
    }),
    // ------------------------------------------------------------- pages --
    listing: { place: "page", slot: "portfolio.index", variants: { classic: classic("filterable project list (themed through the tier-2 tokens)") } },
    detail: {
      place: "page",
      slot: "portfolio.detail",
      variants: {
        classic: classic("gallery, facts and story of one project"),
        typographic: variant("detail", "typographic", detailStatus.typographic, "title-led project page with a text column", { slot: true }),
        gallery: variant("detail", "gallery", detailStatus.gallery, "image-led project page", { slot: true }),
      },
    },
  },
};

/** Theme tier 2 of the classic site: what design/tokens.ts compiles when a site chooses nothing. */
export const CLASSIC_THEME: ThemeTier2 = {
  typeScale: "regular",
  headingWeight: "bold",
  density: "regular",
  container: "regular",
  corner: "soft",
  surface: "warm",
  accentUse: "minimal",
};

/**
 * The classic site as a design document: the sections of the 1.1 home page in their order. A site
 * with no design document is rendered from this one — same sections, same order, same CSS.
 */
export const CLASSIC_DESIGN: DesignConfig = {
  preset: null,
  chrome: { header: "classic", footer: "classic", mobileBar: "none" },
  home: [
    { section: "hero", variant: "classic" },
    { section: "showcase", variant: "classic" },
    { section: "promos", variant: "classic" },
    { section: "keywords", variant: "classic" },
    { section: "services", variant: "classic" },
    { section: "recent", variant: "classic" },
    { section: "brands", variant: "classic" },
    { section: "showrooms", variant: "classic" },
  ],
  pages: { listing: "classic", detail: "classic" },
  theme: CLASSIC_THEME,
  fontSet: "system",
};

/** Every registered variant that is not classic code, as (section, variant, entry) — the files a release must hold. */
export function authoredVariants(): { section: string; variant: string; entry: VariantEntry }[] {
  const out: { section: string; variant: string; entry: VariantEntry }[] = [];
  for (const [section, entry] of Object.entries(registry.sections)) {
    for (const [name, v] of Object.entries(entry.variants)) if (v.module !== null) out.push({ section, variant: name, entry: v });
  }
  return out;
}
