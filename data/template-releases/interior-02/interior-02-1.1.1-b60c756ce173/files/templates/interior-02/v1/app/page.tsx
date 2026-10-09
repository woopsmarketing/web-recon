import type { Metadata } from "next";
import { getSiteContext } from "@platform/site/bound";
import template from "../template";
import { isShell } from "../lib/routes";
import { Slot } from "../runtime/Slot";
import { SHELL_METADATA, homePage } from "../runtime/portfolio";
import { SiteHeader } from "../sections/SiteHeader";
import { HomePromos, homePromos } from "../sections/HomePromos";
import { HomeService, homeService } from "../sections/HomeService";
import { HomeBrands, homeBrands } from "../sections/HomeBrands";
import { HomeShowrooms, homeShowrooms } from "../sections/HomeShowrooms";

export function generateMetadata(): Metadata {
  const ctx = getSiteContext(template);
  return isShell(ctx) ? SHELL_METADATA : homePage(ctx).metadata;
}

/**
 * Homepage — the section ORDER is template code (never a setting):
 *   header · hero · projects · promos · keywords · service · recent · brands · showrooms
 *   (the footer and the fixed floater come from the root layout).
 * Every section resolves its own data first and is omitted entirely when it has none. The four
 * sections that show the portfolio (hero · projects · keywords · recent) are runtime slots
 * (runtime/portfolio.ts): rendered here in an ordinary build, placeholders in a shell build.
 */
export default function HomePage() {
  const ctx = getSiteContext(template);
  const shell = isShell(ctx);
  const { slots } = homePage(ctx);
  const promos = homePromos(ctx);
  const service = homeService(ctx);
  const brands = homeBrands(ctx);
  const showrooms = homeShowrooms(ctx);
  return (
    <>
      <SiteHeader ctx={ctx} variant="home" />
      <main className="i2-main i2-main--home">
        <h1 className="i2-sr">{ctx.identity.brandName}</h1>
        <Slot name="home.hero" slots={slots} shell={shell} />
        <Slot name="home.projects" slots={slots} shell={shell} />
        {promos ? <HomePromos data={promos} /> : null}
        <Slot name="home.keywords" slots={slots} shell={shell} />
        {service ? <HomeService data={service} /> : null}
        <Slot name="home.recent" slots={slots} shell={shell} />
        {brands ? <HomeBrands data={brands} /> : null}
        {showrooms ? <HomeShowrooms data={showrooms} /> : null}
      </main>
    </>
  );
}
