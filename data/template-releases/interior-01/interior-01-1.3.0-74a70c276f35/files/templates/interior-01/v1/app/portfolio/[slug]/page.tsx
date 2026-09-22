import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getSiteContext } from "@platform/site/bound";
import template from "../../../template";
import { SiteHeader } from "../../../sections/SiteHeader";
import { SiteFooter } from "../../../sections/SiteFooter";
import { PortfolioDetail, portfolioDetail } from "../../../sections/PortfolioDetail";
import { projectHref } from "../../../sections/projectCards";
import { pageMetadata } from "../../../lib/seo";

type Params = { params: Promise<{ slug: string }> };

/** One page per served project; unknown slugs are not generated → 404. */
export const dynamicParams = false;

export function generateStaticParams(): { slug: string }[] {
  return getSiteContext(template).routes.params("portfolio.detail") as { slug: string }[];
}

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const ctx = getSiteContext(template);
  const project = ctx.content.getBySlug("projects", (await params).slug);
  if (!project) return {};
  // The content model has no per-item SEO fields yet: item title + brand, item summary.
  return pageMetadata(ctx, { title: `${project.title} | ${ctx.identity.brandName}`, description: project.summary, path: projectHref(project) });
}

export default async function ProjectDetailPage({ params }: Params) {
  const ctx = getSiteContext(template);
  const project = ctx.content.getBySlug("projects", (await params).slug);
  if (!project) notFound();
  return (
    <>
      <SiteHeader ctx={ctx} current="portfolio-section" />
      <main className="i1-main">
        <PortfolioDetail data={portfolioDetail(ctx, project)} />
      </main>
      <SiteFooter ctx={ctx} />
    </>
  );
}
