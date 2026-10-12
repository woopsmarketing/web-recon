import { contactHref, portfolioHref } from "../../../components/home/shared";
import { liveLink } from "../../../lib/links";
import { homeHero } from "../../../sections/HomeHero";
import type { Ctx } from "../../../sections/types";
import type { HeroImage, HeroLink, HeroPhone } from "./model";

/**
 * What a hero variant can show — read ONCE, here, for the three variants (build / kit side; no
 * React). Nothing is invented: every field is site data, and a field the site does not have is
 * absent.
 *
 *   the hero itself   the classic data function `homeHero` (sections/HomeHero): the `home.hero`
 *                     switch, the banners, each banner's image / headline / call to action (already
 *                     resolved to a destination that exists). A design hero shows ONE photograph —
 *                     the first published banner. Its `text` (the supporting sentence the classic
 *                     slider never showed) is read from the same record.
 *   company name      identity
 *   slogan            `site.menu.slogan` (the drawer's slogan block) — first paragraph
 *   project list      the route + `home.projects.moreLabel`, as home.projects links it; only when
 *                     the site has a project (an empty list is not a destination worth a hero link)
 *   consultation      the contact destination + `site.footer.ctaButtonLabel`, as the footer band
 *                     (sections/FooterBand) labels it
 *   phone             `contact.page.callLink` (+ `callLabel`): the starter writes it only for a site
 *                     with a phone number, as a tel: link
 *
 * `home.hero` disabled → undefined (the section is left out). No banner is NOT "nothing": the
 * variants compose a first screen from the text alone.
 */
export interface HeroSource {
  brand: string;
  /** the first banner's headline */
  heading?: string;
  /** the first banner's supporting sentence */
  text?: string;
  slogan?: string;
  image?: HeroImage;
  /** the project the banner points at: its name and floor area, as the classic hero prints them */
  project?: { name: string; area?: string };
  /** the banner's own call to action */
  action?: HeroLink & { kind: "contact" | "project" };
  portfolio?: HeroLink;
  consult?: HeroLink;
  phone?: HeroPhone;
}

export function heroSource(ctx: Ctx): HeroSource | undefined {
  if (!ctx.settings["home.hero"].enabled) return undefined;

  const slide = homeHero(ctx)?.slides[0];
  const banner = slide ? ctx.content.list({ type: "banners", limit: 1 }).items[0] : undefined;

  const hasProject = ctx.content.list({ type: "projects", selection: { mode: "latest" }, limit: 1 }).items.length > 0;
  const portfolio = hasProject ? portfolioHref(ctx) : undefined;
  const moreLabel = ctx.slots.text("home.projects", "moreLabel");
  const contact = contactHref(ctx);
  const consultLabel = ctx.slots.text("site.footer", "ctaButtonLabel");
  const call = liveLink(ctx, ctx.slots.link("contact.page", "callLink"));

  return {
    brand: ctx.identity.brandName,
    heading: slide?.headline,
    text: banner && slide && banner.id === slide.id ? banner.text : undefined,
    slogan: ctx.slots.richText("site.menu", "slogan")?.paragraphs[0],
    image: slide?.image,
    project: slide?.project ? { name: slide.project.name, area: slide.project.area ? `${slide.project.area.figure}${slide.project.area.unit}` : undefined } : undefined,
    action: slide?.cta ? { label: slide.cta.label, href: slide.cta.href, kind: slide.project ? "project" : "contact" } : undefined,
    portfolio: portfolio && moreLabel ? { label: moreLabel, href: portfolio } : undefined,
    consult: contact && consultLabel ? { label: consultLabel, href: contact } : undefined,
    phone: call && call.href.startsWith("tel:") ? { label: ctx.slots.text("contact.page", "callLabel"), number: call.label, href: call.href } : undefined,
  };
}
