import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getSiteContext } from "@platform/site/bound";
import template from "../../../../template";
import { isShell } from "../../../../lib/routes";
import { Slot } from "../../../../runtime/Slot";
import { SHELL_METADATA, portfolioListPage } from "../../../../runtime/portfolio";
import { PORTFOLIO_SHELL_SLUG } from "../../../../runtime/shell";
import { SiteHeader } from "../../../../sections/SiteHeader";

type Params = { params: Promise<{ n: string }> };

/** Only pages 2…N exist; anything else (1, 0, N+1, "02", "x") is not generated → 404. */
export const dynamicParams = false;

/**
 * 1.7.0: a shell build emits exactly ONE page, under the reserved segment (runtime/shell.ts): the
 * shell every list page 2…N is composed from at publish time.
 */
export function generateStaticParams(): { n: string }[] {
  const ctx = getSiteContext(template);
  if (isShell(ctx)) return [{ n: PORTFOLIO_SHELL_SLUG }];
  return ctx.routes.params("portfolio.page") as { n: string }[];
}

function pageNumber(raw: string): number | undefined {
  const n = Number(raw);
  return Number.isInteger(n) && n >= 2 && String(n) === raw ? n : undefined;
}

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const ctx = getSiteContext(template);
  if (isShell(ctx)) return SHELL_METADATA;
  const n = pageNumber((await params).n);
  return (n === undefined ? undefined : portfolioListPage(ctx, n))?.metadata ?? {};
}

export default async function PortfolioPagedPage({ params }: Params) {
  const ctx = getSiteContext(template);
  const shell = isShell(ctx);
  const raw = (await params).n;
  const n = pageNumber(raw);
  const page = shell || n === undefined ? undefined : portfolioListPage(ctx, n);
  if (shell ? raw !== PORTFOLIO_SHELL_SLUG : !page) notFound();
  return (
    <>
      <SiteHeader ctx={ctx} current="portfolio-section" />
      <main className="i1-main">
        <Slot name="portfolio.index" slots={page?.slots ?? {}} shell={shell} />
      </main>
    </>
  );
}
