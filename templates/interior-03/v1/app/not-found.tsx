import type { Metadata } from "next";
import Link from "next/link";
import { getSiteContext } from "@platform/site/bound";
import template from "../template";
import { SiteHeader } from "../sections/SiteHeader";
import { PageTitle } from "../components/ui/PageTitle";
import { titleWithBrand } from "../lib/seo";

/** The site's 404 page (static export: 404.html). Copy = site.not-found slots; framework noindex is kept. */
export function generateMetadata(): Metadata {
  const ctx = getSiteContext(template);
  return { title: titleWithBrand(ctx, ctx.slots.text("site.not-found", "title")) };
}

export default function NotFound() {
  const ctx = getSiteContext(template);
  const title = ctx.slots.text("site.not-found", "title") ?? "";
  const message = ctx.slots.text("site.not-found", "message");
  const homeLabel = ctx.slots.text("site.not-found", "homeLabel");
  return (
    <>
      <SiteHeader ctx={ctx} />
      <main className="i3-main">
        <section className="i3-content i3-notfound" data-section="site.not-found">
          <div className="i3-wrap">
            <PageTitle title={title} />
            {message ? <p className="i3-notfound__message">{message}</p> : null}
            {homeLabel ? (
              <p className="i3-notfound__action">
                <Link href="/" className="i3-btn">
                  {homeLabel}
                </Link>
              </p>
            ) : null}
          </div>
        </section>
      </main>
    </>
  );
}
