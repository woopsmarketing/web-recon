import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getSiteContext } from "@platform/site/bound";
import template from "../../../template";
import { SiteHeader } from "../../../sections/SiteHeader";
import { PortfolioDetail, portfolioDetail } from "../../../sections/PortfolioDetail";
import { pageHref } from "../../../components/portfolio/Pager";
import { projectHref } from "../../../lib/projects";
import { pageMetadata } from "../../../lib/seo";

/** /portfolio/[slug] — one page per served project; unknown slugs are not generated → 404. */
type Params = { params: Promise<{ slug: string }> };

export const dynamicParams = false;

export function generateStaticParams(): { slug: string }[] {
  return getSiteContext(template).routes.params("portfolio.detail") as { slug: string }[];
}

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const ctx = getSiteContext(template);
  const project = ctx.content.getBySlug("projects", (await params).slug);
  if (!project) return {};
  // The content model has no per-item SEO fields: item title + brand, item summary.
  return pageMetadata(ctx, { title: `${project.title} | ${ctx.identity.brandName}`, description: project.summary, path: projectHref(project) });
}

export default async function ProjectDetailPage({ params }: Params) {
  const ctx = getSiteContext(template);
  const project = ctx.content.getBySlug("projects", (await params).slug);
  if (!project) notFound();
  const listTitle = ctx.slots.text("portfolio.index", "title");
  return (
    <>
      <SiteHeader ctx={ctx} variant="sub" current="portfolio" title={listTitle ?? project.title} backHref={pageHref(1)} />
      <main className="i2-main i2-main--sub" data-page="portfolio-detail">
        <PortfolioDetail data={portfolioDetail(ctx, project)} />
      </main>
    </>
  );
}
