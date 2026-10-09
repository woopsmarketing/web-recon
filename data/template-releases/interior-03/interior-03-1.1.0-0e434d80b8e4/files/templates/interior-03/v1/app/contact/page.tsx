import type { Metadata } from "next";
import { getSiteContext } from "@platform/site/bound";
import template from "../../template";
import { SiteHeader } from "../../sections/SiteHeader";
import { ContactPage, contactPage } from "../../sections/ContactPage";
import { pageMetadata, titleWithBrand } from "../../lib/seo";

/**
 * /contact — banner, the page title and the inquiry form (contact.page): online submission for a
 * site that declares an inquiry endpoint, otherwise an e-mail composed in the visitor's mail app
 * (mailto:); a site with neither channel sees the "unavailable" line (the route always exists).
 */
export function generateMetadata(): Metadata {
  const ctx = getSiteContext(template);
  const data = contactPage(ctx);
  return pageMetadata(ctx, { title: titleWithBrand(ctx, data.title), description: data.lead, path: "/contact" });
}

export default function Contact() {
  const ctx = getSiteContext(template);
  const data = contactPage(ctx);
  return (
    <>
      <SiteHeader ctx={ctx} current="contact" />
      <main className="i3-main" data-page="contact">
        <ContactPage data={data} />
      </main>
    </>
  );
}
