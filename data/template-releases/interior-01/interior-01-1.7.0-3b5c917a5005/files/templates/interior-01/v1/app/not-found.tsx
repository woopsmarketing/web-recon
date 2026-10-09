import type { Metadata } from "next";
import Link from "../components/Link";
import { getSiteContext } from "@platform/site/bound";
import template from "../template";
import { SiteHeader } from "../sections/SiteHeader";

/**
 * The site's 404 page (static export: 404.html). Served by the host for every URL the
 * build did not generate — unknown slugs, out-of-range list pages, pruned routes.
 * Copy comes from the site.not-found slots; framework noindex is kept.
 */
export function generateMetadata(): Metadata {
  const ctx = getSiteContext(template);
  return { title: `${ctx.slots.text("site.not-found", "title")} | ${ctx.identity.brandName}` };
}

export default function NotFound() {
  const ctx = getSiteContext(template);
  const title = ctx.slots.text("site.not-found", "title");
  const message = ctx.slots.text("site.not-found", "message");
  const homeLabel = ctx.slots.text("site.not-found", "homeLabel");
  return (
    <>
      <SiteHeader ctx={ctx} />
      <main className="i1-main">
        <section className="i1-container i1-notfound" data-section="site.not-found">
          <h1 className="i1-notfound__title">{title}</h1>
          {message ? <p className="i1-notfound__message">{message}</p> : null}
          {homeLabel ? (
            <Link href="/" className="i1-button">
              {homeLabel}
            </Link>
          ) : null}
        </section>
      </main>
    </>
  );
}
