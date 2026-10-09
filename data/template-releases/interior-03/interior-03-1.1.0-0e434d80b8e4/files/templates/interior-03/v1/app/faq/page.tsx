import type { Metadata } from "next";
import { getSiteContext } from "@platform/site/bound";
import template from "../../template";
import { SiteHeader } from "../../sections/SiteHeader";
import { FaqPage, faqPage } from "../../sections/FaqPage";
import { pageMetadata, titleWithBrand } from "../../lib/seo";

/** /faq — banner, the topic tabs, the page title and the FAQ board (faq.page). */
export function generateMetadata(): Metadata {
  const ctx = getSiteContext(template);
  const data = faqPage(ctx);
  return pageMetadata(ctx, { title: titleWithBrand(ctx, data.title), description: data.lead ?? data.items[0]?.question, path: "/faq" });
}

export default function Faq() {
  const ctx = getSiteContext(template);
  const data = faqPage(ctx);
  return (
    <>
      <SiteHeader ctx={ctx} current="faq" />
      <main className="i3-main" data-page="faq">
        <FaqPage data={data} />
      </main>
    </>
  );
}
