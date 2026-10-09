import type { Metadata } from "next";
import { getSiteContext } from "@platform/site/bound";
import template from "../template";
import { isShell } from "../lib/routes";
import { Slot } from "../runtime/Slot";
import { SHELL_METADATA, homePage } from "../runtime/portfolio";
import { SiteHeader } from "../sections/SiteHeader";
import { HomeReviews, homeReviews } from "../sections/HomeReviews";
import { HomeImageBand, homeImageBand } from "../sections/HomeImageBand";

/** 1.5.2: the homepage's own canonical + OpenGraph; title / description = the layout's (brand, business summary). */
export function generateMetadata(): Metadata {
  const ctx = getSiteContext(template);
  return isShell(ctx) ? SHELL_METADATA : homePage(ctx).metadata;
}

/**
 * Homepage — the section ORDER is Template code (never a setting):
 *   header · hero · intro · projects A · projects B · reviews · image band
 *   (the footer and the site-wide fixed contact CTA come from the root layout).
 * Every section resolves its own data first and is omitted entirely when it has none.
 * 1.7.0: the four sections that read the portfolio (hero · intro · projects A · projects B) are
 * runtime slots (runtime/portfolio.ts): rendered here in an ordinary build, placeholders in a
 * shell build. Reviews and the image band read no project and are rendered here in both.
 */
export default function HomePage() {
  const ctx = getSiteContext(template);
  const shell = isShell(ctx);
  const { slots } = homePage(ctx);
  const reviews = homeReviews(ctx);
  const band = homeImageBand(ctx);
  return (
    <>
      <SiteHeader ctx={ctx} />
      <main className="i1-main">
        <h1 className="i1-sr">{ctx.identity.brandName}</h1>
        <Slot name="home.hero" slots={slots} shell={shell} />
        <Slot name="home.intro" slots={slots} shell={shell} />
        <Slot name="home.projects-a" slots={slots} shell={shell} />
        <Slot name="home.projects-b" slots={slots} shell={shell} />
        {reviews ? <HomeReviews data={reviews} /> : null}
        {band ? <HomeImageBand data={band} /> : null}
      </main>
    </>
  );
}
