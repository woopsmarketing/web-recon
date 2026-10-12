import type { Metadata } from "next";
import { getSiteContext } from "@platform/site/bound";
import template from "../../template";
import { SiteHeader } from "../../sections/SiteHeader";
import { ServicePage, servicePage } from "../../sections/ServicePage";
import { pageMetadata, titleWithBrand } from "../../lib/seo";

export function generateMetadata(): Metadata {
  const ctx = getSiteContext(template);
  const data = servicePage(ctx);
  return pageMetadata(ctx, { title: titleWithBrand(ctx, data.title), description: data.intro?.join(" "), path: "/service" });
}

/** SERVICE: the content starts directly under the header bar (the first block cancels the sub-page top padding). */
export default function Page() {
  const ctx = getSiteContext(template);
  const data = servicePage(ctx);
  return (
    <>
      <SiteHeader ctx={ctx} variant="sub" current="service" title={data.title} />
      <main className="i2-main i2-main--sub" data-page="service">
        <ServicePage data={data} />
      </main>
    </>
  );
}
