import type { Metadata } from "next";
import { getSiteContext } from "@platform/site/bound";
import template from "../../template";
import { SiteHeader } from "../../sections/SiteHeader";
import { ContactPage, contactPage } from "../../sections/ContactPage";
import { pageMetadata, titleWithBrand } from "../../lib/seo";

/**
 * /contact — the aside and the inquiry form (contact.page): online submission for a site that
 * declares an inquiry endpoint, otherwise an e-mail composed in the visitor's mail app (mailto:).
 */
export function generateMetadata(): Metadata {
  const ctx = getSiteContext(template);
  const data = contactPage(ctx);
  return pageMetadata(ctx, { title: titleWithBrand(ctx, data.title), description: data.lead?.[0], path: "/contact" });
}

export default function Contact() {
  const ctx = getSiteContext(template);
  const data = contactPage(ctx);
  return (
    <>
      <SiteHeader ctx={ctx} variant="sub" current="contact" title={data.title} />
      <main className="i2-main i2-main--sub" data-page="contact">
        <ContactPage data={data} />
      </main>
    </>
  );
}
