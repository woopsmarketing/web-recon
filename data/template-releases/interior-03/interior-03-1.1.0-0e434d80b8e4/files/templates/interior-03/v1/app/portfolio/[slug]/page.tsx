import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getSiteContext } from "@platform/site/bound";
import template from "../../../template";
import { isShell } from "../../../lib/routes";
import { Slot } from "../../../runtime/Slot";
import { SHELL_METADATA, portfolioDetailPage } from "../../../runtime/portfolio";
import { PORTFOLIO_SHELL_SLUG } from "../../../runtime/shell";
import { SiteHeader } from "../../../sections/SiteHeader";

/**
 * /portfolio/[slug] — one page per served project; unknown slugs are not generated → 404.
 * A shell build emits exactly ONE page, under the reserved slug (runtime/shell.ts): the detail shell
 * every project's page is composed from at publish time.
 */
type Params = { params: Promise<{ slug: string }> };

export const dynamicParams = false;

export function generateStaticParams(): { slug: string }[] {
  const ctx = getSiteContext(template);
  if (isShell(ctx)) return [{ slug: PORTFOLIO_SHELL_SLUG }];
  return ctx.content.listSlugs("projects").map((slug) => ({ slug }));
}

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const ctx = getSiteContext(template);
  if (isShell(ctx)) return SHELL_METADATA;
  const project = ctx.content.getBySlug("projects", (await params).slug);
  return project ? portfolioDetailPage(ctx, project).metadata : {};
}

export default async function ProjectDetailPage({ params }: Params) {
  const ctx = getSiteContext(template);
  const shell = isShell(ctx);
  const { slug } = await params;
  const project = shell ? undefined : ctx.content.getBySlug("projects", slug);
  if (shell ? slug !== PORTFOLIO_SHELL_SLUG : !project) notFound();
  return (
    <>
      <SiteHeader ctx={ctx} current="portfolio" />
      <main className="i3-main" data-page="portfolio-detail">
        <Slot name="portfolio.detail" slots={project ? portfolioDetailPage(ctx, project).slots : {}} shell={shell} />
      </main>
    </>
  );
}
