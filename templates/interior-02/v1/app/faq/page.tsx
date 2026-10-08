import type { Metadata } from "next";
import { getSiteContext } from "@platform/site/bound";
import template from "../../template";
import { SiteHeader } from "../../sections/SiteHeader";
import { FaqPage, faqPage } from "../../sections/FaqPage";
import { pageMetadata, titleWithBrand } from "../../lib/seo";

/** /faq — the support side menu / tab strip, the page title, topic chips and the single-open accordion (faq.page). */
export function generateMetadata(): Metadata {
  const ctx = getSiteContext(template);
  const data = faqPage(ctx);
  return pageMetadata(ctx, { title: titleWithBrand(ctx, ctx.slots.text("faq.page", "title")), description: data?.items[0]?.question, path: "/faq" });
}

export default function Faq() {
  const ctx = getSiteContext(template);
  const data = faqPage(ctx);
  const title = ctx.slots.text("faq.page", "title");
  return (
    <>
      <SiteHeader ctx={ctx} variant="sub" current="faq" title={title} />
      {/* no .i2-main--sub: the tab strip (≤ 1280) sits directly under the header; the layout carries the sub-page padding itself */}
      <main className="i2-main" data-page="faq">
        {data ? (
          <FaqPage data={data} />
        ) : (
          <div className="i2-wrap i2-main--sub">
            <h1 className="i2-faq__title">{title}</h1>
          </div>
        )}
      </main>
    </>
  );
}
