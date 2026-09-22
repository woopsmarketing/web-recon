import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getSiteContext } from "@platform/site/bound";
import template from "../../template";
import { SiteHeader } from "../../sections/SiteHeader";
import { SiteFooter } from "../../sections/SiteFooter";
import { PortfolioIndex, portfolioIndex, portfolioIndexTitle } from "../../sections/PortfolioIndex";
import { portfolioFilterData } from "../../sections/portfolioFilter";
import { pageMetadata } from "../../lib/seo";

/** /portfolio — page 1 of the project list (pruned from the build when the site has no projects). */
export function generateMetadata(): Metadata {
  const ctx = getSiteContext(template);
  return pageMetadata(ctx, {
    title: portfolioIndexTitle(ctx, 1),
    description: ctx.slots.richText("portfolio.index", "description")?.paragraphs[0],
    path: "/portfolio",
  });
}

export default function PortfolioPage() {
  const ctx = getSiteContext(template);
  const data = portfolioIndex(ctx, 1);
  if (!data) notFound();
  return (
    <>
      <SiteHeader ctx={ctx} current="portfolio" />
      <main className="i1-main">
        <PortfolioIndex data={data} filter={portfolioFilterData(ctx)} />
      </main>
      <SiteFooter ctx={ctx} />
    </>
  );
}
