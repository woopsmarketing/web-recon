import type { Metadata } from "next";
import { getSiteContext } from "@platform/site/bound";
import template from "../../template";
import { SiteHeader } from "../../sections/SiteHeader";
import { ContactPage, contactPage } from "../../sections/ContactPage";
import { pageMetadata } from "../../lib/seo";

/** /contact (1.5.0) — the inquiry form (composes an e-mail in the visitor's mail app; no backend). */
export function generateMetadata(): Metadata {
  const ctx = getSiteContext(template);
  const data = contactPage(ctx);
  return pageMetadata(ctx, { title: `${data.title} | ${ctx.identity.brandName}`, description: data.lead?.[0], path: "/contact" });
}

export default function Contact() {
  const ctx = getSiteContext(template);
  return (
    <>
      <SiteHeader ctx={ctx} current="contact" />
      {/* data-page="contact": the floating contact seat hides itself here (CSS) */}
      <main className="i1-main" data-page="contact">
        <ContactPage data={contactPage(ctx)} />
      </main>
    </>
  );
}
