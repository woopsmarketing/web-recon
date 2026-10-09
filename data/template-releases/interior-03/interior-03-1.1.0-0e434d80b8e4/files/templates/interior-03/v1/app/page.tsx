import type { Metadata } from "next";
import { getSiteContext } from "@platform/site/bound";
import template from "../template";
import { isShell } from "../lib/routes";
import { Slot } from "../runtime/Slot";
import { SHELL_METADATA, homePage } from "../runtime/portfolio";
import { SiteHeader } from "../sections/SiteHeader";
import { HomeHero, homeHero } from "../sections/HomeHero";
import { HomeBand, homeBand } from "../sections/HomeBand";

export function generateMetadata(): Metadata {
  const ctx = getSiteContext(template);
  return isShell(ctx) ? SHELL_METADATA : homePage(ctx).metadata;
}

/**
 * Homepage — the section ORDER is template code (never a setting):
 *   header · hero · gallery tiles · band · portfolio grid
 *   (the footer and the fixed corner control come from the root layout).
 * Every section resolves its own data first and is omitted entirely when it has none. The
 * page's single <h1> (the brand, visually hidden) lives in the hero; when the hero has nothing
 * to show, the page renders it here instead. The two sections that show the portfolio (gallery
 * tiles · portfolio grid) are runtime slots (runtime/portfolio.ts): rendered here in an ordinary
 * build, placeholders in a shell build.
 */
export default function HomePage() {
  const ctx = getSiteContext(template);
  const shell = isShell(ctx);
  const { slots } = homePage(ctx);
  const hero = homeHero(ctx);
  const band = homeBand(ctx);
  return (
    <>
      <SiteHeader ctx={ctx} current="home" />
      <main className="i3-main">
        {hero ? <HomeHero data={hero} /> : <h1 className="i3-sr">{ctx.identity.brandName}</h1>}
        <Slot name="home.gallery" slots={slots} shell={shell} />
        {band ? <HomeBand data={band} /> : null}
        <Slot name="home.portfolio" slots={slots} shell={shell} />
      </main>
    </>
  );
}
