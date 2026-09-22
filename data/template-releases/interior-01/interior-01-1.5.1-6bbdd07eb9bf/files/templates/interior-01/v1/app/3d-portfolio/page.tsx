import type { Metadata } from "next";
import { getSiteContext } from "@platform/site/bound";
import template from "../../template";
import { SiteHeader } from "../../sections/SiteHeader";
import { Portfolio3dPage, portfolio3dPage } from "../../sections/Portfolio3dPage";
import { pageMetadata } from "../../lib/seo";

/** /3d-portfolio (1.5.0) — a placeholder page for a feature in preparation. */
export function generateMetadata(): Metadata {
  const ctx = getSiteContext(template);
  const data = portfolio3dPage(ctx);
  return pageMetadata(ctx, { title: `${data.title} | ${ctx.identity.brandName}`, description: data.body, path: "/3d-portfolio" });
}

export default function Portfolio3d() {
  const ctx = getSiteContext(template);
  return (
    <>
      <SiteHeader ctx={ctx} current="portfolio3d" />
      <main className="i1-main" data-page="portfolio3d">
        <Portfolio3dPage data={portfolio3dPage(ctx)} />
      </main>
    </>
  );
}
