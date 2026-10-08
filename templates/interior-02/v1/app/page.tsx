import type { Metadata } from "next";
import { getSiteContext } from "@platform/site/bound";
import template from "../template";
import { pageMetadata } from "../lib/seo";
import { SiteHeader } from "../sections/SiteHeader";
import { HomeHero, homeHero } from "../sections/HomeHero";
import { HomeProjects, homeProjects } from "../sections/HomeProjects";
import { HomePromos, homePromos } from "../sections/HomePromos";
import { HomeKeywords, homeKeywords } from "../sections/HomeKeywords";
import { HomeService, homeService } from "../sections/HomeService";
import { HomeRecent, homeRecent } from "../sections/HomeRecent";
import { HomeBrands, homeBrands } from "../sections/HomeBrands";
import { HomeShowrooms, homeShowrooms } from "../sections/HomeShowrooms";

export function generateMetadata(): Metadata {
  const ctx = getSiteContext(template);
  return pageMetadata(ctx, { title: ctx.identity.brandName, description: ctx.content.getSingleton("business").summary, path: "/" });
}

/**
 * Homepage — the section ORDER is template code (never a setting):
 *   header · hero · projects · promos · keywords · service · recent · brands · showrooms
 *   (the footer and the fixed floater come from the root layout).
 * Every section resolves its own data first and is omitted entirely when it has none.
 */
export default function HomePage() {
  const ctx = getSiteContext(template);
  const hero = homeHero(ctx);
  const projects = homeProjects(ctx);
  const promos = homePromos(ctx);
  const keywords = homeKeywords(ctx);
  const service = homeService(ctx);
  const recent = homeRecent(ctx);
  const brands = homeBrands(ctx);
  const showrooms = homeShowrooms(ctx);
  return (
    <>
      <SiteHeader ctx={ctx} variant="home" />
      <main className="i2-main i2-main--home">
        <h1 className="i2-sr">{ctx.identity.brandName}</h1>
        {hero ? <HomeHero data={hero} /> : null}
        {projects ? <HomeProjects data={projects} /> : null}
        {promos ? <HomePromos data={promos} /> : null}
        {keywords ? <HomeKeywords data={keywords} /> : null}
        {service ? <HomeService data={service} /> : null}
        {recent ? <HomeRecent data={recent} /> : null}
        {brands ? <HomeBrands data={brands} /> : null}
        {showrooms ? <HomeShowrooms data={showrooms} /> : null}
      </main>
    </>
  );
}
