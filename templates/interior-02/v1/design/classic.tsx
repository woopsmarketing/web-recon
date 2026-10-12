import type { ReactElement } from "react";
import { AboutStory, aboutStory, type AboutStoryData } from "../sections/AboutStory";
import { FooterBand, footerBand, type FooterBandData } from "../sections/FooterBand";
import { HomeBrands, homeBrands } from "../sections/HomeBrands";
import { HomePromos, homePromos } from "../sections/HomePromos";
import { HomeService, homeService } from "../sections/HomeService";
import { HomeShowrooms, homeShowrooms } from "../sections/HomeShowrooms";
import type { Ctx } from "../sections/types";

/**
 * A home section that is rendered by the page itself (it reads nothing of the portfolio):
 *   data(ctx)   everything the section shows, resolved from the site context; undefined = the
 *               section has nothing to show and is left out entirely
 *   Section     the markup, from that data alone
 * Every variant module of the families about · services · cta exports exactly these two names.
 */
export interface HomeSection<D> {
  data(ctx: Ctx): D | undefined;
  Section(props: { data: D }): ReactElement | null;
}

/**
 * The classic implementation of every such section — sections/** as it is. `promos`, `services`,
 * `brands` and `showrooms` are the sections of the 1.1 home page; `about` and `cta` are two blocks
 * of 1.1 (the story block of the about page, the band of the footer) offered to a home recipe.
 */
export const promosClassic: HomeSection<NonNullable<ReturnType<typeof homePromos>>> = { data: homePromos, Section: HomePromos };
export const servicesClassic: HomeSection<NonNullable<ReturnType<typeof homeService>>> = { data: homeService, Section: HomeService };
export const brandsClassic: HomeSection<NonNullable<ReturnType<typeof homeBrands>>> = { data: homeBrands, Section: HomeBrands };
export const showroomsClassic: HomeSection<NonNullable<ReturnType<typeof homeShowrooms>>> = { data: homeShowrooms, Section: HomeShowrooms };

/** The entrance state of the story block is held by data-revealed="false": without script it is shown at rest. */
const ABOUT_NOSCRIPT_CSS = '.i2-ab-hang[data-revealed="false"]{opacity:1;transform:translateY(-18px)}';

export const aboutClassic: HomeSection<AboutStoryData> = {
  data: aboutStory,
  Section: ({ data }) => (
    <div className="i2-sec i2-pg i2-ab" data-section="home.about">
      <noscript>
        <style>{ABOUT_NOSCRIPT_CSS}</style>
      </noscript>
      <AboutStory story={data} />
    </div>
  ),
};

export const ctaClassic: HomeSection<FooterBandData> = {
  data: footerBand,
  Section: ({ data }) => (
    <section className="i2-footer" data-section="home.cta">
      <FooterBand data={data} />
    </section>
  ),
};
