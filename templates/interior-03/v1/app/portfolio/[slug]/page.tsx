import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getSiteContext } from "@platform/site/bound";
import template from "../../../template";
import { SiteHeader } from "../../../sections/SiteHeader";
import { PortfolioDetail, portfolioDetail } from "../../../sections/PortfolioDetail";
import { projectHref } from "../../../lib/projects";
import { pageMetadata, titleWithBrand } from "../../../lib/seo";

/** /portfolio/[slug] — one page per served project; unknown slugs are not generated → 404. */
type Params = { params: Promise<{ slug: string }> };

export const dynamicParams = false;

export function generateStaticParams(): { slug: string }[] {
  return getSiteContext(template)
    .content.listSlugs("projects")
    .map((slug) => ({ slug }));
}

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const ctx = getSiteContext(template);
  const project = ctx.content.getBySlug("projects", (await params).slug);
  if (!project) return {};
  // The content model has no per-item SEO fields: item title + brand, item summary.
  return pageMetadata(ctx, { title: titleWithBrand(ctx, project.title), description: project.summary, path: projectHref(project) });
}

export default async function ProjectDetailPage({ params }: Params) {
  const ctx = getSiteContext(template);
  const project = ctx.content.getBySlug("projects", (await params).slug);
  if (!project) notFound();
  return (
    <>
      <SiteHeader ctx={ctx} current="portfolio" />
      <main className="i3-main" data-page="portfolio-detail">
        <PortfolioDetail data={portfolioDetail(ctx, project)} />
      </main>
    </>
  );
}
