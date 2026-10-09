import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getSiteContext } from "@platform/site/bound";
import template from "../../template";
import { isShell } from "../../lib/routes";
import { Slot } from "../../runtime/Slot";
import { SHELL_METADATA, portfolioListPage } from "../../runtime/portfolio";
import { SiteHeader } from "../../sections/SiteHeader";

/**
 * /portfolio — page 1 of the project list (pruned from an ordinary build when the site has no
 * projects). 1.7.0: a shell build always emits it — the list is a runtime slot composed at publish time.
 */
export function generateMetadata(): Metadata {
  const ctx = getSiteContext(template);
  if (isShell(ctx)) return SHELL_METADATA;
  return portfolioListPage(ctx, 1)?.metadata ?? {};
}

export default function PortfolioPage() {
  const ctx = getSiteContext(template);
  const shell = isShell(ctx);
  const page = shell ? undefined : portfolioListPage(ctx, 1);
  if (!shell && !page) notFound();
  return (
    <>
      <SiteHeader ctx={ctx} current="portfolio" />
      <main className="i1-main">
        <Slot name="portfolio.index" slots={page?.slots ?? {}} shell={shell} />
      </main>
    </>
  );
}
