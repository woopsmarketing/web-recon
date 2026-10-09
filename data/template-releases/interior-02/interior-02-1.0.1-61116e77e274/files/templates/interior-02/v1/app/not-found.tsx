import type { Metadata } from "next";
import Link from "next/link";
import { getSiteContext } from "@platform/site/bound";
import template from "../template";
import { SiteHeader } from "../sections/SiteHeader";
import { titleWithBrand } from "../lib/seo";

/** The site's 404 page (static export: 404.html). Copy = site.not-found slots; framework noindex is kept. */
export function generateMetadata(): Metadata {
  const ctx = getSiteContext(template);
  return { title: titleWithBrand(ctx, ctx.slots.text("site.not-found", "title")) };
}

export default function NotFound() {
  const ctx = getSiteContext(template);
  const title = ctx.slots.text("site.not-found", "title");
  const message = ctx.slots.text("site.not-found", "message");
  const homeLabel = ctx.slots.text("site.not-found", "homeLabel");
  return (
    <>
      <SiteHeader ctx={ctx} variant="sub" title={title} />
      <main className="i2-main">
        <section className="i2-wrap i2-sec i2-notfound" data-section="site.not-found">
          <h1 className="i2-notfound__title">{title}</h1>
          {message ? <p className="i2-notfound__message">{message}</p> : null}
          {homeLabel ? (
            <p className="i2-notfound__action">
              <Link href="/" className="i2-btn i2-btn--outline">
                {homeLabel}
              </Link>
            </p>
          ) : null}
        </section>
      </main>
    </>
  );
}
