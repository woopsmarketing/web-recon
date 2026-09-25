import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getSiteContext } from "@platform/site/bound";
import template from "../../../../template";
import { SiteHeader } from "../../../../sections/SiteHeader";
import { PortfolioIndex, portfolioIndex, portfolioIndexTitle, portfolioPageHref } from "../../../../sections/PortfolioIndex";
import { pageMetadata } from "../../../../lib/seo";

type Params = { params: Promise<{ n: string }> };

/** Only pages 2…N exist; anything else (1, 0, N+1, "02", "x") is not generated → 404. */
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
  return pageMetadata(ctx, {
    title: portfolioIndexTitle(ctx, n),
    description: ctx.slots.richText("portfolio.index", "description")?.paragraphs[0],
    path: portfolioPageHref(n),
  });
}

export default async function PortfolioPagedPage({ params }: Params) {
  const ctx = getSiteContext(template);
  const n = pageNumber((await params).n);
  const data = n === undefined ? undefined : portfolioIndex(ctx, n);
  if (!data) notFound();
  return (
    <>
      <SiteHeader ctx={ctx} current="portfolio-section" />
      <main className="i1-main">
        <PortfolioIndex data={data} />
      </main>
    </>
  );
}
