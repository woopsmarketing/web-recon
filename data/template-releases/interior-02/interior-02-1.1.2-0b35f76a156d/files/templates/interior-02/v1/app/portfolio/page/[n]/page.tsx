import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getSiteContext } from "@platform/site/bound";
import template from "../../../../template";
import { Slot } from "../../../../runtime/Slot";
import { portfolioListPage } from "../../../../runtime/portfolio";
import { SiteHeader } from "../../../../sections/SiteHeader";
import { portfolioIndexTitle } from "../../../../sections/portfolioIndexData";

/**
 * /portfolio/page/n — pages 2…N of the project list (page 1 is /portfolio). Never part of a shell
 * build (no portfolio → no page 2, the route is pruned): the runtime kit composes these pages from
 * the /portfolio shell.
 */
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
  return (n === undefined ? undefined : portfolioListPage(ctx, n))?.metadata ?? {};
}

export default async function PortfolioPagedPage({ params }: Params) {
  const ctx = getSiteContext(template);
  const n = pageNumber((await params).n);
  const page = n === undefined ? undefined : portfolioListPage(ctx, n);
  if (!page) notFound();
  return (
    <>
      <SiteHeader ctx={ctx} variant="sub" current="portfolio" title={portfolioIndexTitle(ctx)} />
      <main className="i2-main i2-main--sub" data-page="portfolio">
        <Slot name="portfolio.index" slots={page.slots} shell={false} />
      </main>
    </>
  );
}
