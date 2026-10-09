import type { Metadata } from "next";
import { getSiteContext } from "@platform/site/bound";
import template from "../../template";
import { SiteHeader } from "../../sections/SiteHeader";
import { ServicePage, servicePage } from "../../sections/ServicePage";
import { pageMetadata, titleWithBrand } from "../../lib/seo";

/** SERVICE (/service): the business blocks (service.page). Description = the lead line. */
export function generateMetadata(): Metadata {
  const ctx = getSiteContext(template);
  const data = servicePage(ctx);
  return pageMetadata(ctx, { title: titleWithBrand(ctx, data.title), description: data.lead, path: "/service" });
}

export default function Page() {
  const ctx = getSiteContext(template);
  const data = servicePage(ctx);
  return (
    <>
      <SiteHeader ctx={ctx} current="service" />
      <main className="i3-main">
        <ServicePage data={data} />
      </main>
    </>
  );
}
