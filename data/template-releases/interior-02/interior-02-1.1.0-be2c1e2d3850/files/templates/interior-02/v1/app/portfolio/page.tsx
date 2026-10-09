import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getSiteContext } from "@platform/site/bound";
import template from "../../template";
import { isShell } from "../../lib/routes";
import { Slot } from "../../runtime/Slot";
import { SHELL_METADATA, portfolioListPage } from "../../runtime/portfolio";
import { SiteHeader } from "../../sections/SiteHeader";
import { portfolioIndexTitle } from "../../sections/portfolioIndexData";

/**
 * /portfolio — page 1 of the project list (pruned from an ordinary build when the site has no
 * projects). A shell build always emits it: the list is a runtime slot composed at publish time.
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
      <SiteHeader ctx={ctx} variant="sub" current="portfolio" title={portfolioIndexTitle(ctx)} />
      <main className="i2-main i2-main--sub" data-page="portfolio">
        <Slot name="portfolio.index" slots={page?.slots ?? {}} shell={shell} />
      </main>
    </>
  );
}
