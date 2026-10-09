import type { Metadata } from "next";
import { getSiteContext } from "@platform/site/bound";
import template from "../template";
import { pageMetadata } from "../lib/seo";
import { SiteHeader } from "../sections/SiteHeader";
import { HomeHero, homeHero } from "../sections/HomeHero";
import { HomeGallery, homeGallery } from "../sections/HomeGallery";
import { HomeBand, homeBand } from "../sections/HomeBand";
import { HomePortfolio, homePortfolio } from "../sections/HomePortfolio";

export function generateMetadata(): Metadata {
  const ctx = getSiteContext(template);
  return pageMetadata(ctx, { title: ctx.identity.brandName, description: ctx.content.getSingleton("business").summary, path: "/" });
}

/**
 * Homepage — the section ORDER is template code (never a setting):
 *   header · hero · gallery tiles · band · portfolio grid
 *   (the footer and the fixed corner control come from the root layout).
 * Every section resolves its own data first and is omitted entirely when it has none. The
 * page's single <h1> (the brand, visually hidden) lives in the hero; when the hero has nothing
 * to show, the page renders it here instead.
 */
export default function HomePage() {
  const ctx = getSiteContext(template);
  const hero = homeHero(ctx);
  const gallery = homeGallery(ctx);
  const band = homeBand(ctx);
  const portfolio = homePortfolio(ctx);
  return (
    <>
      <SiteHeader ctx={ctx} current="home" />
      <main className="i3-main">
        {hero ? <HomeHero data={hero} /> : <h1 className="i3-sr">{ctx.identity.brandName}</h1>}
        {gallery ? <HomeGallery data={gallery} /> : null}
        {band ? <HomeBand data={band} /> : null}
        {portfolio ? <HomePortfolio data={portfolio} /> : null}
      </main>
    </>
  );
}
