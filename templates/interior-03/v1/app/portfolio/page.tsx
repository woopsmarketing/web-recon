import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getSiteContext } from "@platform/site/bound";
import template from "../../template";
import { SiteHeader } from "../../sections/SiteHeader";
import { PortfolioIndex, portfolioIndex, portfolioIndexLead, portfolioIndexTitle } from "../../sections/PortfolioIndex";
import { pageMetadata, titleWithBrand } from "../../lib/seo";

/** /portfolio — page 1 of the project list (pruned from the build when the site has no projects). */
export function generateMetadata(): Metadata {
  const ctx = getSiteContext(template);
  return pageMetadata(ctx, { title: titleWithBrand(ctx, portfolioIndexTitle(ctx)), description: portfolioIndexLead(ctx), path: "/portfolio" });
}

export default function PortfolioPage() {
  const ctx = getSiteContext(template);
  const data = portfolioIndex(ctx, 1);
  if (!data) notFound();
  return (
    <>
      <SiteHeader ctx={ctx} current="portfolio" />
      <main className="i3-main" data-page="portfolio">
        <PortfolioIndex data={data} />
      </main>
    </>
  );
}
