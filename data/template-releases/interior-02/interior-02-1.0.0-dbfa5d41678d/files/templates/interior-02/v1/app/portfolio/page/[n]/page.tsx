import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getSiteContext } from "@platform/site/bound";
import template from "../../../../template";
import { SiteHeader } from "../../../../sections/SiteHeader";
import { PortfolioIndex, portfolioIndex, portfolioIndexTitle } from "../../../../sections/PortfolioIndex";
import { pageMetadata, titleWithBrand } from "../../../../lib/seo";

/** /portfolio/page/n — pages 2…N of the project list (page 1 is /portfolio). */
type Params = { params: Promise<{ n: string }> };

export const dynamicParams = false;

export function generateStaticParams(): { n: string }[] {
  return getSiteContext(template).routes.params("portfolio.page") as { n: string }[];
}

function pageNumber(raw: string): number | undefined {
  const n = Number(raw);
  return Number.isInteger(n) && n >= 2 && String(n) === raw ? n : undefined;
}

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const ctx = getSiteContext(template);
  const n = pageNumber((await params).n);
  if (n === undefined) return {};
  return pageMetadata(ctx, { title: titleWithBrand(ctx, portfolioIndexTitle(ctx)), path: `/portfolio/page/${n}` });
}

export default async function PortfolioPagedPage({ params }: Params) {
  const ctx = getSiteContext(template);
  const n = pageNumber((await params).n);
  const data = n === undefined ? undefined : portfolioIndex(ctx, n);
  if (!data) notFound();
  return (
    <>
      <SiteHeader ctx={ctx} variant="sub" current="portfolio" title={data.title} />
      <main className="i2-main i2-main--sub" data-page="portfolio">
        <PortfolioIndex data={data} />
      </main>
    </>
  );
}
